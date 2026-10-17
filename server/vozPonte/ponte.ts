/**
 * PONTE DE VOZ: navegador ⇄ (Cloud Run) ⇄ Gemini Live no VERTEX (projeto staziamed-revalida-prod, us-central1, gemini-3.8-live).
 *
 * Por que existe: o Live do Vertex só aceita credencial do Google Cloud (conta de serviço), que nunca pode ir ao navegador.
 * O navegador fala só com a ponte, autenticado pelo BILHETE selado pelo app (bilhete.ts). A ponte:
 *  - monta o setup a partir do bilhete (o navegador não escolhe modelo, voz, instruções nem ferramentas);
 *  - NÃO usa retomada de sessão do Google (decisão do dono: o Google não guarda a conversa para retomar). Se a conexão com o
 *    Google cair ou o Google avisar o fim (goAway), a ponte abre outra sessão com o mesmo setup e devolve o que já foi conversado
 *    como contexto em texto (guardado só na memória da ponte enquanto a ligação dura);
 *  - repassa as chamadas de ferramenta ao navegador, que as executa no NOSSO servidor (/api/tutor/voice/tool, com o login do aluno,
 *    como hoje), e só aceita de volta respostas para chamadas que o Google realmente fez;
 *  - corta a ligação no limite do bilhete (o servidor agora consegue desligar a voz do Gemini, o que antes não dava);
 *  - conta o uso pelos tokens que o Google devolve e registra no fim (log estruturado e, se configurado, relatório assinado ao app).
 *
 * Protocolo (JSON em texto) navegador → ponte: {t:"abrir",bilhete} (primeira) · {t:"audio",d:<PCM16 16 kHz base64>} · {t:"texto",texto}
 *   · {t:"ferramentas",respostas:[{id,name,response}]} · {t:"mudo",v} · {t:"interromper"} · {t:"fim"}
 * ponte → navegador: {t:"pronto"} · {t:"audio",d:<PCM16 24 kHz base64>} · {t:"transcricao",quem,texto,fim} · {t:"interrompido"}
 *   · {t:"turno_completo"} · {t:"geracao_completa"} · {t:"ferramentas",chamadas:[{id,name,args}]} · {t:"uso",turno,sessao,custo_usd}
 *   · {t:"reconectando",motivo} · {t:"erro",mensagem} · {t:"encerrado",motivo}
 */
import WebSocket from "ws";
import { abrirBilhete, assinarRelatorio, type ConteudoBilhete, type FerramentaDeclarada, type NoncesUsados } from "./bilhete";
import type { ConhecimentoPonte } from "./conhecimento";
import { acertoDaFerramenta, HumorDaLigacao, humorValido, instrucoesComEstado } from "../tutor/humorVoz";

export const PRECO_LIVE_USD_POR_MILHAO = { textoEntrada: 0.75, audioEntrada: 3.0, textoSaida: 4.5, audioSaida: 12.0 };
export interface Uso { textoEntrada: number; audioEntrada: number; textoSaida: number; audioSaida: number; total: number }
const ZERO: Uso = { textoEntrada: 0, audioEntrada: 0, textoSaida: 0, audioSaida: 0, total: 0 };

type D = { modality?: string; tokenCount?: number };
export function usoDe(u: Record<string, unknown> | null | undefined): Uso {
  const out = { ...ZERO, total: Number(u?.totalTokenCount ?? 0) };
  for (const d of (u?.promptTokensDetails as D[] | undefined) ?? []) { if (d.modality === "AUDIO") out.audioEntrada += d.tokenCount ?? 0; else out.textoEntrada += d.tokenCount ?? 0; }
  for (const d of [...((u?.responseTokensDetails as D[] | undefined) ?? []), ...((u?.candidatesTokensDetails as D[] | undefined) ?? [])]) {
    if (d.modality === "AUDIO") out.audioSaida += d.tokenCount ?? 0; else out.textoSaida += d.tokenCount ?? 0;
  }
  // pensamento do modelo conta como saída de texto
  out.textoSaida += Number(u?.thoughtsTokenCount ?? 0);
  return out;
}
export const somar = (a: Uso, b: Uso): Uso => ({ textoEntrada: a.textoEntrada + b.textoEntrada, audioEntrada: a.audioEntrada + b.audioEntrada, textoSaida: a.textoSaida + b.textoSaida, audioSaida: a.audioSaida + b.audioSaida, total: a.total + b.total });
export const custoUsd = (u: Uso) => {
  const p = PRECO_LIVE_USD_POR_MILHAO;
  return (u.textoEntrada * p.textoEntrada + u.audioEntrada * p.audioEntrada + u.textoSaida * p.textoSaida + u.audioSaida * p.audioSaida) / 1e6;
};

/** Esquema JSON (formato das ferramentas do Tutor) → esquema do Vertex (tipos em maiúsculas, sem additionalProperties). */
export function esquemaVertex(s: unknown): unknown {
  if (!s || typeof s !== "object") return s;
  const o = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object") out.properties = Object.fromEntries(Object.entries(v).map(([p, ps]) => [p, esquemaVertex(ps)]));
    else if (k === "items") out.items = esquemaVertex(v);
    else if (k === "required" && Array.isArray(v) && !v.length) continue;
    else out[k] = v;
  }
  return out;
}

/** `texto`: as instruções inteiras já montadas (com o estado do momento); sem ele, instruções + material + contexto. */
export function setupVertex(c: ConteudoBilhete, projeto: string, regiao: string, contexto?: string, texto?: string) {
  const ferramentas = (c.ferramentas ?? []) as FerramentaDeclarada[];
  return {
    setup: {
      model: `projects/${projeto}/locations/${regiao}/publishers/google/models/${c.modelo}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voz } }, languageCode: "pt-BR" },
      },
      systemInstruction: { parts: [{ text: texto ?? [c.instrucoes, c.material, contexto].filter(Boolean).join("\n\n") }] },
      ...(ferramentas.length ? { tools: [{ functionDeclarations: ferramentas.map((f) => ({ name: f.name, description: f.description, parameters: esquemaVertex(f.parameters) })) }] } : {}),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // sem retomada de sessão (o Google não guarda a conversa); a janela deslizante só resume o contexto DENTRO desta conexão
      contextWindowCompression: { slidingWindow: {} },
      ...(c.vad === "rapido"
        ? { realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: "START_SENSITIVITY_HIGH", endOfSpeechSensitivity: "END_SENSITIVITY_HIGH", prefixPaddingMs: 100, silenceDurationMs: 400 } } }
        : {}),
    },
  };
}

export interface DepsPonte {
  segredo: string;
  usados: NoncesUsados;
  projeto: string;
  regiao: string;
  tokenGoogle: () => Promise<string>;
  log: (o: Record<string, unknown>) => void;
  /** Relatório do uso ao app no fim da ligação (URL + assinatura HMAC). Opcional. */
  relatorio?: { url: string; fetchFn?: typeof fetch } | null;
  /** Testes: troca o WebSocket do Google. */
  abrirGoogle?: (url: string, headers: Record<string, string>) => WebSocket;
  /** Quantas vezes reabrir a sessão do Google numa ligação (queda/goAway). */
  maxReaberturas?: number;
  /** Cérebro do Tutor (conhecimento.ts): busca de conhecimento feita na ponte, sem passar pelo navegador. Sem ele, tudo como antes. */
  conhecimento?: ConhecimentoPonte | null;
}

const URL_LIVE = (regiao: string) => `wss://${regiao}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;


/** Atende uma conexão do navegador: espera o bilhete, abre o Google e faz a ponte até o fim. */
export function atenderPonte(cliente: WebSocket, deps: DepsPonte): void {
  const t0 = Date.now();
  let c: ConteudoBilhete | null = null;
  let google: WebSocket | null = null;
  let pronto = false;
  let fim = false;
  let mudo = false;
  let reaberturas = 0;
  let turnos = 0;
  let uso: Uso = { ...ZERO };
  const recebidas: Record<string, number> = {}; // mensagens do navegador por tipo (telemetria do fim)
  const pendentes = new Set<string>(); // ids de ferramenta pedidos pelo Google e ainda sem resposta
  const daPonte = new Set<string>(); // ids que a própria ponte responde (cérebro do Tutor): o navegador não responde por eles
  const historia: { quem: "aluno" | "tutor"; texto: string }[] = []; // só em memória, enquanto a ligação dura
  let limite: NodeJS.Timeout | null = null;
  // humor da ligação (humorVoz.ts): recalculado a cada fala; só o bloco do estado muda nas instruções (contextUpdate)
  let humor: HumorDaLigacao | null = null;
  let falaAluno = ""; // o que o aluno disse na fala em andamento (a transcrição chega em pedaços)
  let estadoPendente = false; // o humor mudou: troca quando o professor terminar a fala (ou for interrompido)
  let contextoReaberta: string | undefined; // depois de uma queda, a conversa até ali (fica nas instruções desta conexão)
  const enviar = (o: Record<string, unknown>) => { if (cliente.readyState === WebSocket.OPEN) cliente.send(JSON.stringify(o)); };
  const anotar = (quem: "aluno" | "tutor", texto: string) => {
    const ult = historia.at(-1);
    if (ult && ult.quem === quem) ult.texto = (ult.texto + texto).slice(-1500);
    else historia.push({ quem, texto });
    if (historia.length > 40) historia.splice(0, historia.length - 40);
  };

  const encerrar = (motivo: string) => {
    if (fim) return;
    fim = true;
    if (limite) clearTimeout(limite);
    clearTimeout(espera);
    enviar({ t: "encerrado", motivo });
    try { google?.close(); } catch { /* já fechada */ }
    try { cliente.close(1000, motivo.slice(0, 100)); } catch { /* já fechado */ }
    historia.length = 0;
    const duracao_s = Math.round((Date.now() - t0) / 1000);
    const custo = +custoUsd(uso).toFixed(6);
    deps.log({ ponte: "fim", vc: c?.vc ?? null, motivo, duracao_s, turnos, reaberturas, uso, custo_usd: custo, modelo: c?.modelo, recebidas, ...(humor ? { humor_trocas: humor.trocas, humor_final: humor.estadoAtual } : {}) });
    if (c && deps.relatorio?.url) {
      const corpo = JSON.stringify({ vc: c.vc, u: c.u, modelo: c.modelo, duracao_s, turnos, uso, custo_usd: custo, motivo, t: Date.now() });
      void (deps.relatorio.fetchFn ?? fetch)(deps.relatorio.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Stazia-Ponte-Assinatura": assinarRelatorio(corpo, deps.segredo) },
        body: corpo,
        signal: AbortSignal.timeout(8000),
      }).catch((e) => deps.log({ ponte: "relatorio_falhou", vc: c?.vc, erro: String(e).slice(0, 120) }));
    }
  };

  // sem bilhete em 5 s, fecha
  const espera = setTimeout(() => { if (!c) encerrar("sem bilhete"); }, 5000);

  const abrirGoogle = async (motivo: "inicio" | "queda" | "goaway") => {
    if (fim || !c) return;
    let token: string;
    try { token = await deps.tokenGoogle(); } catch (e) { enviar({ t: "erro", mensagem: "sem credencial do Google na ponte" }); deps.log({ ponte: "token", erro: String(e).slice(0, 120) }); return encerrar("sem credencial"); }
    if (fim) return;
    pronto = false;
    pendentes.clear();
    const contexto = motivo === "inicio" || !historia.length ? undefined
      : `A CONVERSA CAIU E FOI REABERTA. Até aqui (não repita; continue de onde parou, sem anunciar a queda):\n${historia.map((h) => `${h.quem === "aluno" ? "Aluno" : "Você"}: ${h.texto}`).join("\n").slice(-6000)}`;
    contextoReaberta = contexto;
    falaAluno = "";
    const headers = { Authorization: `Bearer ${token}` };
    const g = deps.abrirGoogle ? deps.abrirGoogle(URL_LIVE(deps.regiao), headers) : new WebSocket(URL_LIVE(deps.regiao), { headers });
    google = g;
    g.on("open", () => g.send(JSON.stringify(setupVertex(c!, deps.projeto, deps.regiao, contexto, sistema()))));
    g.on("message", (raw) => {
      if (google !== g || fim) return;
      let m: Record<string, any>;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.setupComplete) { pronto = true; enviar({ t: "pronto", reaberta: motivo !== "inicio" }); return; }
      if (m.usageMetadata) {
        const turno = usoDe(m.usageMetadata);
        uso = somar(uso, turno);
        turnos++;
        enviar({ t: "uso", turno, sessao: uso, custo_usd: +custoUsd(uso).toFixed(6) });
      }
      if (m.toolCall?.functionCalls?.length) {
        const todas = (m.toolCall.functionCalls as { id: string; name: string; args?: unknown }[]).slice(0, 8).map((f) => ({ id: String(f.id), name: String(f.name), args: f.args ?? {} }));
        for (const f of todas) pendentes.add(f.id);
        // cérebro do Tutor: a busca de conhecimento roda aqui; o navegador só ouve "buscando" e recebe os rótulos das fontes
        const naPonte = deps.conhecimento ? todas.filter((f) => deps.conhecimento!.intercepta(f.name)) : [];
        const chamadas = todas.filter((f) => !naPonte.includes(f));
        if (chamadas.length) enviar({ t: "ferramentas", chamadas });
        for (const f of naPonte) { daPonte.add(f.id); void responderNaPonte(f); }
      }
      if (m.toolCallCancellation?.ids) for (const id of m.toolCallCancellation.ids) pendentes.delete(String(id));
      if (m.goAway) { deps.log({ ponte: "goaway", vc: c?.vc }); reabrir("goaway"); return; }
      const sc = m.serverContent;
      if (!sc) { if (m.error) enviar({ t: "erro", mensagem: String(m.error.message ?? "erro do Google").slice(0, 200) }); return; }
      if (sc.inputTranscription?.text) { anotar("aluno", sc.inputTranscription.text); enviar({ t: "transcricao", quem: "aluno", texto: sc.inputTranscription.text, fim: Boolean(sc.inputTranscription.finished) }); ouvirAluno(sc.inputTranscription.text); }
      if (sc.outputTranscription?.text) { anotar("tutor", sc.outputTranscription.text); enviar({ t: "transcricao", quem: "tutor", texto: sc.outputTranscription.text, fim: Boolean(sc.outputTranscription.finished) }); }
      if (sc.interrupted) { enviar({ t: "interrompido" }); if (estadoPendente) mandarEstado(); }
      for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) enviar({ t: "audio", d: p.inlineData.data });
      if (sc.generationComplete) enviar({ t: "geracao_completa" });
      if (sc.turnComplete) { enviar({ t: "turno_completo" }); professorTerminou(); }
    });
    g.on("close", (codigo, porque) => {
      if (google !== g || fim) return;
      deps.log({ ponte: "google_fechou", vc: c?.vc, codigo, porque: porque.toString().slice(0, 120) });
      if (!pronto && motivo === "inicio") { enviar({ t: "erro", mensagem: `o Google recusou a sessão (${codigo})` }); return encerrar("Google recusou"); }
      reabrir("queda");
    });
    g.on("error", (e) => deps.log({ ponte: "google_erro", vc: c?.vc, erro: String(e).slice(0, 160) }));
  };

  const reabrir = (porque: "queda" | "goaway") => {
    if (fim) return;
    if (reaberturas >= (deps.maxReaberturas ?? 3)) return encerrar("a conexão com o Google caiu várias vezes");
    reaberturas++;
    enviar({ t: "reconectando", motivo: porque });
    const velho = google;
    google = null;
    try { velho?.close(); } catch { /* já fechada */ }
    setTimeout(() => void abrirGoogle(porque), porque === "queda" ? 300 * reaberturas : 0);
  };

  const paraGoogle = (o: Record<string, unknown>) => { if (google?.readyState === WebSocket.OPEN && pronto) google.send(JSON.stringify(o)); };
  /** Instruções da sessão como estão agora: as do bilhete com o estado do momento, o material do tema e, depois de queda, a conversa. */
  const sistema = () => [humor && c?.humor ? instrucoesComEstado(c.instrucoes, c.humor.estado, humor.bloco) : c!.instrucoes, c!.material, contextoReaberta].filter(Boolean).join("\n\n");
  /** Troca as instruções da sessão (sem pedir resposta): o Google usa o texto novo a partir da próxima geração. */
  const mandarEstado = () => {
    estadoPendente = false;
    paraGoogle({ contextUpdate: { systemInstruction: { parts: [{ text: sistema() }] } } });
  };
  // humor a cada fala: o Google devolve a transcrição do aluno junto com o começo da resposta (medido em 17/10: chega no mesmo instante
  // do 1º áudio), então a troca nunca alcança a resposta em andamento; ela vai quando o professor termina (ou é interrompido), antes
  // da próxima fala do aluno, e não mexe na geração em andamento nem na latência. Na própria fala o professor já reage pelo que ouviu
  // (ficha e leitura do aluno); o estado carrega o humor para as falas seguintes. A fala do aluno (com o finzinho que a transcrição
  // traz atrasado e o que ele disser ao interromper) é um turno só, fechado quando o professor termina.
  const ouvirAluno = (pedaco: string) => {
    if (!humor) return;
    falaAluno = (falaAluno + pedaco).slice(-1500);
    if (humor.ouvirAluno(falaAluno)) estadoPendente = true;
  };
  const professorTerminou = () => {
    if (!humor) return;
    humor.fecharFalaDoAluno();
    falaAluno = "";
    const mudou = humor.falasDoProfessor(historia.filter((h) => h.quem === "tutor").map((h) => h.texto));
    if (mudou || estadoPendente) mandarEstado();
  };
  const responderNaPonte = async (f: { id: string; name: string; args: unknown }) => {
    enviar({ t: "buscando" });
    const r = await deps.conhecimento!.buscar({ vc: c!.vc, u: c!.u }, (f.args ?? {}) as Record<string, unknown>);
    if (fim || !pendentes.delete(f.id)) return; // cancelada pelo Google ou sessão reaberta
    paraGoogle({ toolResponse: { functionResponses: [{ id: f.id, name: f.name, response: r.response }] } });
    enviar({ t: "fontes", rotulos: r.rotulos });
    deps.log({ ponte: "conhecimento", vc: c?.vc, ms: r.ms, vetor: r.vetor, trechos: r.rotulos.length });
  };
  // depois de next_question: material do tema novo, trocado só ele nas instruções da sessão (contextUpdate)
  const trocarMaterial = async () => {
    const novo = await deps.conhecimento!.pacote({ vc: c!.vc, u: c!.u });
    if (fim || !c || !novo || novo === c.material) return;
    c = { ...c, material: novo };
    mandarEstado();
  };

  cliente.on("message", (raw, binario) => {
    if (fim || binario) return;
    let m: Record<string, any>;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    recebidas[String(m.t).slice(0, 20)] = (recebidas[String(m.t).slice(0, 20)] ?? 0) + 1;
    if (!c) {
      if (m.t !== "abrir") return encerrar("primeira mensagem não é o bilhete");
      const a = abrirBilhete(String(m.bilhete ?? ""), deps.segredo, deps.usados);
      if (!a.ok) { deps.log({ ponte: "bilhete_recusado", motivo: a.motivo }); enviar({ t: "erro", mensagem: `bilhete ${a.motivo}` }); return encerrar(`bilhete ${a.motivo}`); }
      c = a.conteudo;
      humor = humorValido(c.humor) ? new HumorDaLigacao(c.humor) : null;
      clearTimeout(espera);
      limite = setTimeout(() => encerrar("limite de tempo da ligação"), Math.max(30, Math.min(c.maxSegundos, 2 * 3600)) * 1000);
      deps.log({ ponte: "inicio", vc: c.vc, modelo: c.modelo, voz: c.voz, max_s: c.maxSegundos });
      void abrirGoogle("inicio");
      return;
    }
    switch (m.t) {
      case "audio":
        if (!mudo && typeof m.d === "string" && m.d.length <= 64_000) paraGoogle({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: m.d } } });
        break;
      case "texto":
        // texto do aluno (chat da tela) ou instrução do sistema: turno completo, o professor responde falando
        if (typeof m.texto === "string" && m.texto.trim()) paraGoogle({ clientContent: { turns: [{ role: "user", parts: [{ text: m.texto.slice(0, 4000) }] }], turnComplete: true } });
        break;
      case "ferramentas": {
        const respostas = (Array.isArray(m.respostas) ? m.respostas : [])
          .filter((r: any) => r && pendentes.has(String(r.id)) && !daPonte.has(String(r.id)))
          .map((r: any) => { pendentes.delete(String(r.id)); return { id: String(r.id), name: String(r.name ?? ""), response: r.response && typeof r.response === "object" ? r.response : { output: r.response ?? null } }; });
        // correção da questão: o humor da ligação anda com acerto/erro (memória da ligação: erro repetido, alívio) e o tom que vai junto
        // da resposta é o desta ligação (o do servidor não sabe o que já aconteceu nela); a troca nas instruções vem quando ele terminar
        if (humor) for (const r of respostas) {
          if (r.name !== "submit_answer") continue;
          const certo = acertoDaFerramenta(r.response);
          if (certo == null) continue;
          const tom = humor.fatos([certo ? "correct" : "wrong"]);
          const out = (r.response as { output?: unknown }).output;
          if (out && typeof out === "object") (out as Record<string, unknown>).tom_do_professor = tom;
          estadoPendente = true;
        }
        if (respostas.length) paraGoogle({ toolResponse: { functionResponses: respostas } });
        if (deps.conhecimento && respostas.some((r: { name: string }) => r.name === "next_question")) void trocarMaterial();
        break;
      }
      case "mudo":
        mudo = Boolean(m.v);
        if (mudo) paraGoogle({ realtimeInput: { audioStreamEnd: true } });
        break;
      case "interromper":
        // corta a geração em andamento sem pedir resposta nova
        paraGoogle({ clientContent: { turns: [{ role: "user", parts: [{ text: "(o aluno interrompeu: pare e espere ele falar)" }] }], turnComplete: false } });
        break;
      case "fim":
        encerrar("aluno encerrou");
        break;
    }
  });
  cliente.on("close", () => encerrar("navegador fechou"));
  cliente.on("error", () => encerrar("erro no navegador"));
}
