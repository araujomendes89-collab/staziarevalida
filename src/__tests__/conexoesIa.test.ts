// @vitest-environment node
/**
 * Conexões abertas com as IAs (ordem do dono de 18/10; server/ai/conexoes.ts): o despachante global do fetch mantém a conexão
 * com as IAs e o Supabase aberta por 60 s parada; os outros endereços (Asaas) seguem o padrão do Node; o aquecimento não usa chave.
 */
import { afterAll, describe, expect, it } from "vitest";
import { aquecerConexoesIa, CONEXAO_PARADA_MS, hostDeIa, manterConexoesIaAbertas } from "../../server/ai/conexoes";

const SIMBOLO = Symbol.for("undici.globalDispatcher.1");
const g = globalThis as unknown as Record<symbol, unknown>;
new Headers(); // carrega o fetch do Node
const original = g[SIMBOLO];
afterAll(() => {
  g[SIMBOLO] = original;
});

describe("conexões abertas com as IAs", () => {
  it("separa os endereços das IAs e do Supabase dos outros", () => {
    for (const ia of ["https://api.anthropic.com", "https://aiplatform.googleapis.com", "https://us-central1-aiplatform.googleapis.com", "https://generativelanguage.googleapis.com", "https://api.openai.com", "https://api.elevenlabs.io", "https://abcdefgh.supabase.co"]) {
      expect(hostDeIa(ia), ia).toBe(true);
    }
    for (const outro of ["https://api.asaas.com", "https://api-sandbox.asaas.com", "https://googleapis.com.exemplo.com", "https://supabase.co.exemplo.com", "não é endereço", undefined]) {
      expect(hostDeIa(outro), String(outro)).toBe(false);
    }
    expect(hostDeIa(new URL("https://api.anthropic.com"))).toBe(true);
    expect(CONEXAO_PARADA_MS).toBe(60_000);
  });

  it("desligado por IA_CONEXAO_ABERTA=0: o despachante do Node fica como está", () => {
    expect(manterConexoesIaAbertas({ IA_CONEXAO_ABERTA: "0" })).toBe(false);
    expect(g[SIMBOLO]).toBe(original);
  });

  it("liga uma vez só e manda cada endereço para o despachante certo", () => {
    expect(manterConexoesIaAbertas({})).toBe(true);
    const ligado = g[SIMBOLO] as { dispatch: unknown; constructor: { name: string } };
    expect(ligado).not.toBe(original);
    expect(typeof ligado.dispatch).toBe("function");
    expect(manterConexoesIaAbertas({})).toBe(true); // de novo: não troca outra vez
    expect(g[SIMBOLO]).toBe(ligado);
  });

  it("aquecimento: HEAD sem chave só nos serviços configurados; desligável", () => {
    const pedidos: { url: string; init: RequestInit | undefined }[] = [];
    const falso = (async (url: string, init?: RequestInit) => {
      pedidos.push({ url, init });
      return new Response(null, { status: 401 });
    }) as unknown as typeof fetch;
    const env = { ANTHROPIC_API_KEY: "sk-ant-xxxxxxxx", VERTEX_API_KEY: "AQ.xxxxxxxxxxxx", SUPABASE_URL: "https://abcdefgh.supabase.co" };
    expect(aquecerConexoesIa(env, falso)).toEqual(["https://api.anthropic.com/", "https://aiplatform.googleapis.com/", "https://abcdefgh.supabase.co/"]);
    expect(pedidos.every((p) => p.init?.method === "HEAD" && !p.init?.headers)).toBe(true); // nenhuma chave vai junto
    expect(aquecerConexoesIa({ ...env, IA_AQUECER_CONEXOES: "0" }, falso)).toEqual([]);
    expect(aquecerConexoesIa({ ...env, IA_CONEXAO_ABERTA: "0" }, falso)).toEqual([]);
  });
});
