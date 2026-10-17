// @vitest-environment node
/**
 * PONTE DE VOZ (Gemini Live no Vertex pelo Cloud Run): bilhete selado, setup sem retomada de sessão, ferramentas só com id
 * pedido pelo Google, reabertura com contexto em texto, limite de tempo, uso e relatório assinado. Google e navegador simulados.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { abrirBilhete, assinarRelatorio, NoncesUsados, relatorioConfere, selarBilhete, type ConteudoBilhete } from "../../server/vozPonte/bilhete";
import { atenderPonte, custoUsd, esquemaVertex, setupVertex, usoDe } from "../../server/vozPonte/ponte";
import { geminiVoiceConfig, vertexPonteConfig } from "../../server/tutor/voiceProviders";
import { REALTIME_TOOLS } from "../../server/tutor/tools";

const SEG = "p".repeat(48);
const C: ConteudoBilhete = {
  vc: "11111111-1111-4111-8111-111111111111", u: "22222222-2222-4222-8222-222222222222", modelo: "gemini-3.8-live", voz: "Kore",
  instrucoes: "Você é a Durona.", ferramentas: [{ name: "submit_answer", description: "corrige", parameters: { type: "object", properties: { option: { type: "string" } }, required: ["option"], additionalProperties: false } }],
  maxSegundos: 600,
};

describe("bilhete selado", () => {
  it("abre uma vez, dentro do prazo, só com o segredo certo", () => {
    const usados = new NoncesUsados();
    const { bilhete } = selarBilhete(C, SEG, 60_000, 1_000);
    const a = abrirBilhete(bilhete, SEG, usados, 2_000);
    expect(a.ok && a.conteudo).toEqual({ ...C, vad: undefined });
    expect(abrirBilhete(bilhete, SEG, usados, 2_000)).toEqual({ ok: false, motivo: "reusado" });
    expect(abrirBilhete(selarBilhete(C, SEG, 60_000, 1_000).bilhete, SEG, new NoncesUsados(), 70_000)).toEqual({ ok: false, motivo: "expirado" });
    expect(abrirBilhete(selarBilhete(C, SEG).bilhete, "q".repeat(48), new NoncesUsados())).toEqual({ ok: false, motivo: "lacre" });
    const b = selarBilhete(C, SEG).bilhete;
    expect(abrirBilhete(b.slice(0, 40) + (b[40] === "A" ? "B" : "A") + b.slice(41), SEG, new NoncesUsados())).toEqual({ ok: false, motivo: "lacre" });
    expect(abrirBilhete("curto", SEG, new NoncesUsados())).toEqual({ ok: false, motivo: "formato" });
    expect(() => selarBilhete(C, "curto")).toThrow();
  });
  it("o navegador não lê as instruções no bilhete", () => {
    const { bilhete } = selarBilhete({ ...C, instrucoes: "SEGREDO-DO-PROMPT" }, SEG);
    expect(Buffer.from(bilhete, "base64url").toString("latin1")).not.toMatch(/SEGREDO-DO-PROMPT|Durona|submit_answer/);
  });
  it("relatório de uso assinado", () => {
    const corpo = JSON.stringify({ vc: C.vc });
    expect(relatorioConfere(corpo, assinarRelatorio(corpo, SEG), SEG)).toBe(true);
    expect(relatorioConfere(corpo + " ", assinarRelatorio(corpo, SEG), SEG)).toBe(false);
    expect(relatorioConfere(corpo, "x", SEG)).toBe(false);
  });
});

describe("setup do Vertex", () => {
  it("modelo do projeto, voz, ferramentas no formato do Vertex e SEM retomada de sessão", () => {
    const s = setupVertex(C, "staziamed-revalida-prod", "us-central1").setup as Record<string, any>;
    expect(s.model).toBe("projects/staziamed-revalida-prod/locations/us-central1/publishers/google/models/gemini-3.8-live");
    expect(s.sessionResumption).toBeUndefined();
    expect(s.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
    expect(s.tools[0].functionDeclarations[0].parameters).toEqual({ type: "OBJECT", properties: { option: { type: "STRING" } }, required: ["option"] });
    expect(setupVertex(C, "p", "r", "CONTEXTO").setup.systemInstruction.parts[0].text).toMatch(/Durona\.\n\nCONTEXTO$/);
  });
  it("converte todas as ferramentas do Tutor", () => {
    for (const t of REALTIME_TOOLS) expect(JSON.stringify(esquemaVertex(t.parameters))).not.toMatch(/additionalProperties|"object"|"string"/);
  });
  it("uso por modalidade e custo", () => {
    const u = usoDe({ totalTokenCount: 6100, thoughtsTokenCount: 100, promptTokensDetails: [{ modality: "TEXT", tokenCount: 5000 }, { modality: "AUDIO", tokenCount: 200 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 800 }] });
    expect(u).toEqual({ textoEntrada: 5000, audioEntrada: 200, textoSaida: 100, audioSaida: 800, total: 6100 });
    expect(custoUsd(u)).toBeCloseTo((5000 * 0.75 + 200 * 3 + 100 * 4.5 + 800 * 12) / 1e6, 12);
  });
});

describe("caminho do app", () => {
  const travas = { TUTOR_VOICE_ALLOW_EXTERNAL: "1", TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1" };
  it("com a ponte configurada, a voz do Gemini vai pelo Vertex e não usa chave da API direta", () => {
    const env = { ...travas, VOZ_PONTE_URL: "wss://ponte.exemplo.run.app/ponte", VOZ_PONTE_SEGREDO: SEG, GEMINI_API_KEY: "AIzaQualquer" };
    const g = geminiVoiceConfig(env as never);
    expect(g).toMatchObject({ ready: true, via: "vertex", key: null, model: "gemini-3.8-live" });
    expect(g.ponte?.url).toBe("wss://ponte.exemplo.run.app/ponte");
  });
  it("sem as travas da voz ao vivo, não fica pronta; endereço sem wss ou segredo curto não vale", () => {
    expect(geminiVoiceConfig({ VOZ_PONTE_URL: "wss://x/ponte", VOZ_PONTE_SEGREDO: SEG } as never)).toMatchObject({ ready: false, via: "vertex", ponte: null });
    expect(vertexPonteConfig({ VOZ_PONTE_URL: "http://x/ponte", VOZ_PONTE_SEGREDO: SEG } as never)).toBeNull();
    expect(vertexPonteConfig({ VOZ_PONTE_URL: "wss://x/ponte", VOZ_PONTE_SEGREDO: "curto" } as never)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------- ponte simulada
class FalsoWs extends EventEmitter {
  readyState = 1;
  enviados: any[] = [];
  fechado = false;
  send(d: string) { this.enviados.push(JSON.parse(d)); }
  close() { if (this.fechado) return; this.fechado = true; this.readyState = 3; this.emit("close", 1000, Buffer.from("")); }
  receber(o: unknown) { this.emit("message", Buffer.from(JSON.stringify(o)), false); }
}

function montar(extra: Partial<Parameters<typeof atenderPonte>[1]> = {}) {
  const cliente = new FalsoWs();
  const googles: FalsoWs[] = [];
  const logs: any[] = [];
  const fetchFn = vi.fn(async () => new Response("{}"));
  atenderPonte(cliente as never, {
    segredo: SEG, usados: new NoncesUsados(), projeto: "proj", regiao: "us-central1", tokenGoogle: async () => "tok", log: (o) => logs.push(o),
    abrirGoogle: () => { const g = new FalsoWs(); googles.push(g); queueMicrotask(() => g.emit("open")); return g as never; },
    relatorio: { url: "https://app/api/tutor/voice/ponte-uso", fetchFn: fetchFn as never },
    ...extra,
  });
  return { cliente, googles, logs, fetchFn };
}
const esperar = () => new Promise((r) => setTimeout(r, 5));
const doCliente = (c: FalsoWs, t: string) => c.enviados.filter((m) => m.t === t);

describe("ponte", () => {
  it("abre com o bilhete, repassa áudio, ferramentas (só ids pedidos) e eventos; registra o uso no fim", async () => {
    const { cliente, googles, fetchFn, logs } = montar();
    cliente.receber({ t: "abrir", bilhete: selarBilhete(C, SEG).bilhete });
    await esperar();
    const g = googles[0];
    expect(g.enviados[0].setup.model).toMatch(/gemini-3\.8-live$/);
    cliente.receber({ t: "audio", d: "AAAA" });
    expect(g.enviados).toHaveLength(1); // antes do setupComplete, nada vai ao Google
    g.receber({ setupComplete: {} });
    expect(doCliente(cliente, "pronto")).toHaveLength(1);
    cliente.receber({ t: "audio", d: "AAAA" });
    expect(g.enviados.at(-1)).toEqual({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "AAAA" } } });
    g.receber({ toolCall: { functionCalls: [{ id: "c1", name: "submit_answer", args: { option: "B" } }] } });
    expect(doCliente(cliente, "ferramentas")[0].chamadas[0]).toEqual({ id: "c1", name: "submit_answer", args: { option: "B" } });
    cliente.receber({ t: "ferramentas", respostas: [{ id: "inventado", name: "x", response: { gabarito: "A" } }, { id: "c1", name: "submit_answer", response: { output: { ok: 1 } } }] });
    expect(g.enviados.at(-1)).toEqual({ toolResponse: { functionResponses: [{ id: "c1", name: "submit_answer", response: { output: { ok: 1 } } }] } });
    cliente.receber({ t: "ferramentas", respostas: [{ id: "c1", name: "submit_answer", response: {} }] }); // repetida: ignorada
    expect(g.enviados.filter((m) => m.toolResponse)).toHaveLength(1);
    g.receber({ serverContent: { inputTranscription: { text: "letra B" }, modelTurn: { parts: [{ inlineData: { data: "UUU=" } }] }, outputTranscription: { text: "Acertou." } } });
    g.receber({ serverContent: { interrupted: true } });
    g.receber({ serverContent: { turnComplete: true }, usageMetadata: { totalTokenCount: 10, promptTokensDetails: [{ modality: "TEXT", tokenCount: 8 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 2 }] } });
    expect(doCliente(cliente, "audio")[0]).toEqual({ t: "audio", d: "UUU=" });
    expect(doCliente(cliente, "transcricao").map((m) => m.quem)).toEqual(["aluno", "tutor"]);
    expect(doCliente(cliente, "interrompido")).toHaveLength(1);
    expect(doCliente(cliente, "uso")[0].sessao).toMatchObject({ textoEntrada: 8, audioSaida: 2 });
    cliente.receber({ t: "fim" });
    await esperar();
    expect(g.fechado).toBe(true);
    expect(logs.at(-1)).toMatchObject({ ponte: "fim", vc: C.vc, motivo: "aluno encerrou", turnos: 1 });
    // a 1ª fala do professor vai assinada para a memória das aberturas (revisão de 17/10); o uso vai no fim
    const chamadas = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const ab = chamadas.find(([u]) => u.endsWith("/ponte-abertura"))!;
    expect(ab[0]).toBe("https://app/api/tutor/voice/ponte-abertura");
    expect(relatorioConfere(String(ab[1].body), String((ab[1].headers as Record<string, string>)["X-Stazia-Ponte-Assinatura"]), SEG)).toBe(true);
    expect(JSON.parse(String(ab[1].body))).toMatchObject({ vc: C.vc, u: C.u, texto: "Acertou." });
    expect(chamadas.filter(([u]) => u.endsWith("/ponte-abertura"))).toHaveLength(1);
    const [url, init] = chamadas.find(([u]) => u.endsWith("/ponte-uso"))!;
    expect(url).toBe("https://app/api/tutor/voice/ponte-uso");
    expect(relatorioConfere(String(init.body), String((init.headers as Record<string, string>)["X-Stazia-Ponte-Assinatura"]), SEG)).toBe(true);
    expect(JSON.parse(String(init.body))).toMatchObject({ vc: C.vc, u: C.u, uso: { textoEntrada: 8, audioSaida: 2 } });
  });

  it("recusa sem bilhete, com bilhete falso e com primeira mensagem errada", async () => {
    const a = montar();
    a.cliente.receber({ t: "audio", d: "AAAA" });
    expect(doCliente(a.cliente, "encerrado")[0].motivo).toMatch(/bilhete/);
    const b = montar();
    b.cliente.receber({ t: "abrir", bilhete: selarBilhete(C, "z".repeat(48)).bilhete });
    expect(doCliente(b.cliente, "encerrado")[0].motivo).toBe("bilhete lacre");
    expect(b.googles).toHaveLength(0);
  });

  it("goAway ou queda: reabre SEM retomada do Google, devolvendo a conversa como contexto", async () => {
    const { cliente, googles } = montar();
    cliente.receber({ t: "abrir", bilhete: selarBilhete(C, SEG).bilhete });
    await esperar();
    googles[0].receber({ setupComplete: {} });
    googles[0].receber({ serverContent: { inputTranscription: { text: "Eu marco a C." } } });
    googles[0].receber({ serverContent: { outputTranscription: { text: "Errou, é a B." } } });
    googles[0].receber({ goAway: { timeLeft: "5s" } });
    await esperar();
    expect(doCliente(cliente, "reconectando")[0].motivo).toBe("goaway");
    const s2 = googles[1].enviados[0].setup;
    expect(s2.sessionResumption).toBeUndefined();
    expect(s2.systemInstruction.parts[0].text).toMatch(/Aluno: Eu marco a C\.\nVocê: Errou, é a B\./);
    googles[1].receber({ setupComplete: {} });
    expect(doCliente(cliente, "pronto").at(-1)).toEqual({ t: "pronto", reaberta: true });
    // queda de rede depois: reabre de novo; depois do limite de reaberturas, encerra
    googles[1].close();
    await new Promise((r) => setTimeout(r, 700)); // 2ª reabertura espera 600 ms (300 ms × tentativa)
    expect(googles).toHaveLength(3);
  });

  it("o Google recusando o setup encerra com erro (sem ficar tentando)", async () => {
    const { cliente, googles } = montar();
    cliente.receber({ t: "abrir", bilhete: selarBilhete(C, SEG).bilhete });
    await esperar();
    googles[0].close();
    expect(doCliente(cliente, "erro")[0].mensagem).toMatch(/recusou/);
    expect(doCliente(cliente, "encerrado")).toHaveLength(1);
    expect(googles).toHaveLength(1);
  });

  it("corta no limite de tempo do bilhete", async () => {
    vi.useFakeTimers();
    try {
      const { cliente } = montar();
      cliente.receber({ t: "abrir", bilhete: selarBilhete({ ...C, maxSegundos: 45 }, SEG).bilhete });
      await vi.advanceTimersByTimeAsync(46_000);
      expect(doCliente(cliente, "encerrado")[0].motivo).toBe("limite de tempo da ligação");
    } finally {
      vi.useRealTimers();
    }
  });
});
