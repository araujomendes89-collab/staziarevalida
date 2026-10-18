/**
 * Conexões abertas com as IAs (ordem do dono em 18/10: tirar o tempo de abrir conexão nova a cada chamada).
 *
 * Todas as chamadas do servidor às IAs passam pelo fetch do Node (undici): as bibliotecas da Anthropic, do Google
 * (@google/genai) e do Supabase usam o fetch global, e as chamadas diretas (voz, transcrição, OpenAI) também. O fetch já
 * reaproveita a conexão, mesmo com cliente novo a cada pedido, porque o "despachante" é um só para o processo inteiro. O
 * problema: quando o servidor não diz por quanto tempo aceita a conexão parada (cabeçalho Keep-Alive), o undici fecha a
 * conexão depois de 4 s sem uso. Nenhum dos serviços de IA manda esse cabeçalho (conferido em 18/10), então toda chamada
 * feita mais de 4 s depois da anterior (o aluno pensando, falando) pagava um aperto de mão novo (TCP + TLS).
 *
 * Aqui o despachante global passa a manter as conexões com as IAs (e com o Supabase) abertas por 60 s parado. Os outros
 * endereços (Asaas, etc.) seguem com o padrão do Node. Os prazos de resposta (300 s de cabeçalho e de corpo, ver
 * server/ai/maestro.ts) continuam os mesmos do padrão.
 *
 *   IA_CONEXAO_ABERTA=0     desliga (volta ao padrão do Node)
 *   IA_AQUECER_CONEXOES=0   não abre as conexões quando a instância sobe (aquecimento sem chave: não gasta crédito)
 */

/** Tempo que a conexão com a IA fica aberta sem uso. */
export const CONEXAO_PARADA_MS = 60_000;

const HOSTS_IA = [
  /^api\.anthropic\.com$/,
  /(^|\.)googleapis\.com$/, // Vertex (aiplatform), AI Studio (generativelanguage), voz do Google
  /^api\.openai\.com$/,
  /^api\.elevenlabs\.io$/,
  /\.supabase\.co$/, // banco: chamado em quase todo pedido do Tutor
];

const hostCache = new Map<string, boolean>();

/** O endereço (origin do fetch) é de uma IA ou do Supabase? */
export function hostDeIa(origin: unknown): boolean {
  const chave = String(origin ?? "");
  let sim = hostCache.get(chave);
  if (sim === undefined) {
    try {
      const host = new URL(chave).hostname.toLowerCase();
      sim = HOSTS_IA.some((r) => r.test(host));
    } catch {
      sim = false;
    }
    if (hostCache.size > 500) hostCache.clear();
    hostCache.set(chave, sim);
  }
  return sim;
}

const SIMBOLO = Symbol.for("undici.globalDispatcher.1"); // onde o undici (o fetch do Node) guarda o despachante global
const MARCA = Symbol.for("staziamed.conexoesIa");

interface Despachante {
  dispatch(opts: { origin?: unknown }, handler: unknown): boolean;
  close(...a: unknown[]): unknown;
  destroy(...a: unknown[]): unknown;
}
type ClasseAgent = new (opts?: Record<string, unknown>) => Despachante;

/**
 * Troca o despachante global do fetch por um que mantém abertas as conexões com as IAs. Usa a classe do próprio Node (sem
 * pacote a mais, mesma versão do fetch). Devolve true quando ficou ligado. Nunca lança: se algo não bater, segue o padrão.
 */
export function manterConexoesIaAbertas(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.IA_CONEXAO_ABERTA === "0") return false;
  const g = globalThis as unknown as Record<symbol, Despachante | undefined>;
  if ((g[SIMBOLO] as unknown as Record<symbol, unknown> | undefined)?.[MARCA]) return true;
  try {
    if (!g[SIMBOLO]) new Headers(); // carrega o fetch do Node, que instala o despachante padrão
    const padrao = g[SIMBOLO];
    const Agent = padrao?.constructor as ClasseAgent | undefined;
    if (!padrao || typeof Agent !== "function" || Agent.name !== "Agent" || typeof padrao.dispatch !== "function") return false;
    const ia = new Agent({ keepAliveTimeout: CONEXAO_PARADA_MS, keepAliveMaxTimeout: 10 * 60_000 });
    const Base = Agent as unknown as new () => Despachante;
    class ConexoesIa extends Base {
      dispatch(opts: { origin?: unknown }, handler: unknown) {
        return hostDeIa(opts?.origin) ? ia.dispatch(opts, handler) : super.dispatch(opts, handler);
      }
      close(...a: unknown[]) {
        void Promise.resolve(ia.close()).catch(() => {});
        return super.close(...a);
      }
      destroy(...a: unknown[]) {
        void Promise.resolve(ia.destroy()).catch(() => {});
        return super.destroy(...a);
      }
    }
    const novo = new ConexoesIa();
    (novo as unknown as Record<symbol, boolean>)[MARCA] = true;
    g[SIMBOLO] = novo;
    // o padrão antigo pode ter conexões de outros endereços abertas: fecham sozinhas pelo prazo dele (4 s)
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre as conexões com as IAs configuradas quando a instância sobe, para a primeira pergunta não pagar o aperto de mão.
 * Pedido HEAD sem chave nenhuma: a IA responde "não autorizado" e nada é cobrado. Não espera nem lança.
 */
export function aquecerConexoesIa(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): string[] {
  if (env.IA_AQUECER_CONEXOES === "0" || env.IA_CONEXAO_ABERTA === "0") return [];
  const tem = (...nomes: string[]) => nomes.some((n) => (env[n] ?? "").trim().length > 5);
  const alvos: string[] = [];
  if (tem("ANTHROPIC_API_KEY")) alvos.push("https://api.anthropic.com/");
  if (tem("VERTEX_API_KEY")) alvos.push("https://aiplatform.googleapis.com/");
  if (tem("GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY")) alvos.push("https://generativelanguage.googleapis.com/");
  if (tem("OPENAI_API_KEY")) alvos.push("https://api.openai.com/");
  if (tem("ELEVENLABS_API_KEY")) alvos.push("https://api.elevenlabs.io/");
  try {
    const supa = new URL((env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim());
    if (supa.protocol === "https:" && /\.supabase\.co$/.test(supa.hostname)) alvos.push(`${supa.origin}/`);
  } catch {
    // sem Supabase configurado
  }
  for (const url of alvos) {
    void fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(5_000) })
      .then((r) => r.body?.cancel())
      .catch(() => {});
  }
  return alvos;
}
