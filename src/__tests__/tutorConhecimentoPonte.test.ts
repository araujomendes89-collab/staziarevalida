// @vitest-environment node
/**
 * Cérebro do Tutor na PONTE de voz (Google e navegador simulados): get_topic_context é executada na ponte e não passa pelo navegador
 * (ele só recebe "buscando" e os rótulos das fontes); as outras ferramentas seguem pelo navegador; resposta a chamada cancelada não vai;
 * o material do tema entra nas instruções do setup e é trocado (contextUpdate) depois de next_question. Sem o cérebro, tudo como antes.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { abrirBilhete, NoncesUsados, selarBilhete, type ConteudoBilhete } from "../../server/vozPonte/bilhete";
import { atenderPonte, setupVertex } from "../../server/vozPonte/ponte";
import type { ConhecimentoPonte } from "../../server/vozPonte/conhecimento";

const SEG = "p".repeat(48);
const C: ConteudoBilhete = {
  vc: "11111111-1111-4111-8111-111111111111", u: "22222222-2222-4222-8222-222222222222", modelo: "gemini-3.8-live", voz: "Kore",
  instrucoes: "Você é a Stazia.", ferramentas: [], maxSegundos: 600, material: "MATERIAL DO TEMA (dados aprovados...)\n\n[M1] Aula (2026)\nconteúdo da aula",
};

class FalsoWs extends EventEmitter {
  readyState = 1;
  enviados: any[] = [];
  fechado = false;
  send(d: string) { this.enviados.push(JSON.parse(d)); }
  close() { if (this.fechado) return; this.fechado = true; this.readyState = 3; this.emit("close", 1000, Buffer.from("")); }
  receber(o: unknown) { this.emit("message", Buffer.from(JSON.stringify(o)), false); }
}
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const doCliente = (c: FalsoWs, t: string) => c.enviados.filter((m) => m.t === t);

function montar(conhecimento: Partial<ConhecimentoPonte> | null, bilhete: ConteudoBilhete = C) {
  const cliente = new FalsoWs();
  const googles: FalsoWs[] = [];
  atenderPonte(cliente as never, {
    segredo: SEG, usados: new NoncesUsados(), projeto: "proj", regiao: "us-central1", tokenGoogle: async () => "tok", log: () => undefined,
    abrirGoogle: () => { const g = new FalsoWs(); googles.push(g); queueMicrotask(() => g.emit("open")); return g as never; },
    conhecimento: conhecimento as ConhecimentoPonte | null,
  });
  cliente.receber({ t: "abrir", bilhete: selarBilhete(bilhete, SEG).bilhete });
  return { cliente, googles };
}

describe("bilhete e setup com o material do tema", () => {
  it("o material vai cifrado no bilhete, num campo à parte, e entra nas instruções do setup", () => {
    const { bilhete } = selarBilhete(C, SEG);
    expect(Buffer.from(bilhete, "base64url").toString("latin1")).not.toMatch(/MATERIAL DO TEMA/);
    const a = abrirBilhete(bilhete, SEG, new NoncesUsados());
    expect(a.ok && a.conteudo.material).toBe(C.material);
    expect(setupVertex(C, "p", "r").setup.systemInstruction.parts[0].text).toBe(`Você é a Stazia.\n\n${C.material}`);
    const { material, ...sem } = C;
    expect(setupVertex(sem, "p", "r", "CONTEXTO").setup.systemInstruction.parts[0].text).toBe("Você é a Stazia.\n\nCONTEXTO");
    expect(material).toBeTruthy();
  });
});

describe("busca de conhecimento dentro da ponte", () => {
  it("get_topic_context não vai ao navegador: ele ouve 'buscando' e recebe só os rótulos; o Google recebe a resposta", async () => {
    let soltar!: () => void;
    const buscar = vi.fn(() => new Promise<Awaited<ReturnType<ConhecimentoPonte["buscar"]>>>((ok) => { soltar = () => ok({ response: { passages: [{ fonte: "Protocolo (2024)", texto: "adrenalina 0,5 mg IM" }] }, rotulos: ["Protocolo (2024)"], ms: 120, vetor: "recebido" }); }));
    const { cliente, googles } = montar({ intercepta: (n) => n === "get_topic_context", buscar, pacote: vi.fn(async () => "") });
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    g.receber({ toolCall: { functionCalls: [{ id: "k1", name: "get_topic_context", args: { topic: "anafilaxia", pergunta: "dose de adrenalina" } }, { id: "s1", name: "submit_answer", args: { option: "B" } }] } });
    await esperar();
    // ao navegador: só a outra ferramenta e o aviso de busca (nem a pergunta nem o texto da busca)
    expect(doCliente(cliente, "ferramentas")).toEqual([{ t: "ferramentas", chamadas: [{ id: "s1", name: "submit_answer", args: { option: "B" } }] }]);
    expect(doCliente(cliente, "buscando")).toHaveLength(1);
    expect(buscar).toHaveBeenCalledWith({ vc: C.vc, u: C.u }, { topic: "anafilaxia", pergunta: "dose de adrenalina" });
    // enquanto a ponte busca, o navegador não consegue responder no lugar dela (mesmo adivinhando o id)
    cliente.receber({ t: "ferramentas", respostas: [{ id: "k1", name: "get_topic_context", response: { passages: [{ texto: "1 mg" }] } }] });
    expect(g.enviados.filter((m) => m.toolResponse)).toHaveLength(0);
    soltar();
    await esperar();
    expect(g.enviados.filter((m) => m.toolResponse)).toEqual([{ toolResponse: { functionResponses: [{ id: "k1", name: "get_topic_context", response: { passages: [{ fonte: "Protocolo (2024)", texto: "adrenalina 0,5 mg IM" }] } }] } }]);
    expect(doCliente(cliente, "fontes")).toEqual([{ t: "fontes", rotulos: ["Protocolo (2024)"] }]);
    expect(JSON.stringify(cliente.enviados)).not.toMatch(/0,5 mg|dose de adrenalina/);
    // o navegador não consegue responder pela ponte a chamada que ela mesma já respondeu
    cliente.receber({ t: "ferramentas", respostas: [{ id: "k1", name: "get_topic_context", response: { passages: [{ texto: "1 mg" }] } }] });
    expect(g.enviados.filter((m) => m.toolResponse)).toHaveLength(1);
  });

  it("chamada cancelada pelo Google enquanto busca: a resposta não vai", async () => {
    let soltar!: () => void;
    const buscar = vi.fn(() => new Promise<any>((ok) => { soltar = () => ok({ response: { passages: [] }, rotulos: [], ms: 1, vetor: "nenhum" }); }));
    const { googles } = montar({ intercepta: () => true, buscar, pacote: vi.fn(async () => "") });
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    g.receber({ toolCall: { functionCalls: [{ id: "k2", name: "get_topic_context", args: {} }] } });
    g.receber({ toolCallCancellation: { ids: ["k2"] } });
    soltar();
    await esperar();
    expect(g.enviados.filter((m) => m.toolResponse)).toHaveLength(0);
  });

  it("depois de next_question, troca só o material nas instruções (contextUpdate); material igual ou vazio não manda nada", async () => {
    const pacote = vi.fn(async () => "MATERIAL DO TEMA novo\n\n[M1] Atualização (2025)\ndengue grupo C");
    const { cliente, googles } = montar({ intercepta: () => false, buscar: vi.fn(), pacote });
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    g.receber({ toolCall: { functionCalls: [{ id: "n1", name: "next_question", args: {} }] } });
    cliente.receber({ t: "ferramentas", respostas: [{ id: "n1", name: "next_question", response: { output: { ok: true } } }] });
    await esperar();
    expect(pacote).toHaveBeenCalledWith({ vc: C.vc, u: C.u });
    const upd = g.enviados.filter((m) => m.contextUpdate);
    expect(upd).toEqual([{ contextUpdate: { systemInstruction: { parts: [{ text: "Você é a Stazia.\n\nMATERIAL DO TEMA novo\n\n[M1] Atualização (2025)\ndengue grupo C" }] } } }]);
    // de novo, com o mesmo material: nada
    g.receber({ toolCall: { functionCalls: [{ id: "n2", name: "next_question", args: {} }] } });
    cliente.receber({ t: "ferramentas", respostas: [{ id: "n2", name: "next_question", response: {} }] });
    await esperar();
    expect(g.enviados.filter((m) => m.contextUpdate)).toHaveLength(1);
  });

  it("sem o cérebro configurado, get_topic_context segue pelo navegador como antes", async () => {
    const { cliente, googles } = montar(null);
    await esperar();
    const g = googles[0];
    g.receber({ setupComplete: {} });
    g.receber({ toolCall: { functionCalls: [{ id: "k3", name: "get_topic_context", args: { topic: "sepse" } }] } });
    expect(doCliente(cliente, "ferramentas")[0].chamadas).toEqual([{ id: "k3", name: "get_topic_context", args: { topic: "sepse" } }]);
    expect(doCliente(cliente, "buscando")).toHaveLength(0);
  });
});
