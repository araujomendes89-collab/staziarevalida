/**
 * PONTE DE VOZ — cérebro do Tutor sem passar pelo navegador.
 *
 * Quando o Google pede `get_topic_context`, a ponte NÃO repassa ao navegador (antes: Google → ponte → celular do aluno → Vercel → banco
 * → celular → ponte → Google). Ela:
 *   1. avisa o navegador {t:"buscando"} (o celular toca uma frase curta pré-gravada na voz do personagem, se houver);
 *   2. gera o vetor da pergunta com a conta de serviço que já tem (Vertex "us", cache em memória, prazo de 400 ms; passou: só palavras);
 *   3. chama o app, assinado (POST {app}/api/tutor/voz/conhecimento), com vc e u do BILHETE (o navegador não escolhe aluno nem ligação);
 *   4. devolve o toolResponse ao Google e manda ao navegador só {t:"fontes", rotulos:[citações]} (o texto da busca não passa por ele).
 * Depois de repassar a resposta de `next_question`, pede o material novo do tema (POST /api/tutor/voz/pacote) e troca só o material
 * nas instruções da sessão (contextUpdate.systemInstruction: medido 0,85 a 0,98 s de 1º áudio com 20 mil tokens).
 * Também atende POST /vetor (assinado) para o Tutor por texto, que roda no site sem conta de serviço do Google.
 *
 * Ambiente da ponte: VOZ_PONTE_APP_URL (ex.: https://app.staziamed.com.br; sem ela, tudo segue como antes, pelo navegador),
 * VOZ_PONTE_VETOR_LOCAL (padrão "us"), VOZ_PONTE_VETOR_PRAZO_MS (padrão 400).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { CABECALHO_ASSINATURA, conferirCorpo, corpoAssinado, NoncesConhecimento } from "../tutor/conhecimento/assinatura";
import { VetorDaPonte, MODELO_VETOR } from "../tutor/conhecimento/vetorPergunta";

export const FERRAMENTA_CONHECIMENTO = "get_topic_context";

export interface ConhecimentoPonte {
  /** a ponte executa esta ferramenta sozinha? */
  intercepta(nome: string): boolean;
  /** executa get_topic_context: resposta para o Google e rótulos para a tela */
  buscar(id: { vc: string; u: string }, args: Record<string, unknown>): Promise<{ response: Record<string, unknown>; rotulos: string[]; ms: number; vetor: string }>;
  /** material novo do tema (texto vazio se não houver) */
  pacote(id: { vc: string; u: string }): Promise<string>;
  /** POST /vetor (app → ponte): devolve true se tratou o pedido */
  atenderHttp(req: IncomingMessage, res: ServerResponse): boolean;
  vetores: VetorDaPonte;
}

export interface OpcoesConhecimentoPonte {
  appUrl: string;
  segredo: string;
  projeto: string;
  tokenGoogle: () => Promise<string>;
  local?: string;
  prazoVetorMs?: number;
  fetchFn?: typeof fetch;
  log?: (o: Record<string, unknown>) => void;
  /** testes: troca o gerador de vetores */
  vetores?: VetorDaPonte;
}

const lerCorpo = (req: IncomingMessage, max = 16_000) =>
  new Promise<string>((ok, erro) => {
    let s = "";
    req.on("data", (c: Buffer) => { s += c.toString("utf8"); if (s.length > max) { erro(new Error("grande demais")); req.destroy(); } });
    req.on("end", () => ok(s));
    req.on("error", erro);
  });

export function criarConhecimentoPonte(o: OpcoesConhecimentoPonte): ConhecimentoPonte {
  const base = o.appUrl.replace(/\/+$/, "");
  const f = o.fetchFn ?? fetch;
  const nonces = new NoncesConhecimento();
  const vetores = o.vetores ?? new VetorDaPonte({ projeto: o.projeto, local: o.local ?? "us", modelo: MODELO_VETOR, tokenGoogle: o.tokenGoogle, fetchFn: o.fetchFn, prazoMs: o.prazoVetorMs, log: o.log });
  const postar = async (caminho: string, dados: Record<string, unknown>, prazoMs: number) => {
    const { corpo, assinatura } = corpoAssinado(dados, o.segredo);
    const r = await f(`${base}${caminho}`, { method: "POST", headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinatura }, body: corpo, signal: AbortSignal.timeout(prazoMs) });
    if (!r.ok) throw new Error(`app respondeu ${r.status}`);
    return (await r.json()) as Record<string, unknown>;
  };

  return {
    vetores,
    intercepta: (nome) => nome === FERRAMENTA_CONHECIMENTO,
    async buscar(id, args) {
      const t0 = Date.now();
      const consulta = String(args.pergunta ?? args.topic ?? args.query ?? "").slice(0, 2000);
      try {
        const vetor = consulta ? await vetores.vetor(consulta) : null;
        const j = await postar("/api/tutor/voz/conhecimento", { vc: id.vc, u: id.u, consulta, vetor }, 6000);
        const response = j.output && typeof j.output === "object" ? (j.output as Record<string, unknown>) : { error: "Não consegui consultar isso agora." };
        return { response, rotulos: Array.isArray(j.rotulos) ? (j.rotulos as unknown[]).map(String).slice(0, 8) : [], ms: Date.now() - t0, vetor: String(j.vetor ?? (vetor ? "recebido" : "nenhum")) };
      } catch (e) {
        o.log?.({ ponte: "conhecimento_falhou", vc: id.vc, erro: String(e).slice(0, 120) });
        return { response: { passages: [], note: "Não consegui consultar o material aprovado agora. Diga que não confirmou e não cite número, dose ou diretriz." }, rotulos: [], ms: Date.now() - t0, vetor: "nenhum" };
      }
    },
    async pacote(id) {
      try {
        const j = await postar("/api/tutor/voz/pacote", { vc: id.vc, u: id.u }, 4000);
        return typeof j.material === "string" ? j.material.slice(0, 200_000) : "";
      } catch (e) {
        o.log?.({ ponte: "pacote_falhou", vc: id.vc, erro: String(e).slice(0, 120) });
        return "";
      }
    },
    atenderHttp(req, res) {
      if (req.method !== "POST" || (req.url ?? "").split("?")[0] !== "/vetor") return false;
      void (async () => {
        const responder = (status: number, corpo: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(corpo)); };
        try {
          const corpo = await lerCorpo(req);
          const c = conferirCorpo<{ texto?: string }>(corpo, String(req.headers[CABECALHO_ASSINATURA] ?? ""), o.segredo, nonces);
          if (!c.ok) return responder(401, { error: "não autorizado" });
          const v = await vetores.vetor(String(c.dados.texto ?? "").slice(0, 2000));
          return v ? responder(200, v) : responder(204, null);
        } catch {
          return responder(400, { error: "pedido inválido" });
        }
      })();
      return true;
    },
  };
}

/** Configuração pelo ambiente da ponte: sem VOZ_PONTE_APP_URL, desligado (null) e a ponte segue como antes. */
export function conhecimentoDoAmbiente(env: NodeJS.ProcessEnv, base: { segredo: string; projeto: string; tokenGoogle: () => Promise<string>; log?: (o: Record<string, unknown>) => void }): ConhecimentoPonte | null {
  const appUrl = (env.VOZ_PONTE_APP_URL ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/.test(appUrl)) return null;
  const prazo = Number(env.VOZ_PONTE_VETOR_PRAZO_MS);
  return criarConhecimentoPonte({ ...base, appUrl, local: (env.VOZ_PONTE_VETOR_LOCAL ?? "us").trim() || "us", prazoVetorMs: Number.isFinite(prazo) && prazo > 0 ? prazo : undefined });
}
