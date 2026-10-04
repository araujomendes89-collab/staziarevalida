import { BackendError, type Backend } from "./backend";

export * from "./backend";

let instance: Promise<Backend> | null = null;

/**
 * Escolhe o backend uma única vez:
 *  - com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY → Supabase;
 *  - sem as chaves, em desenvolvimento → banco local do servidor de desenvolvimento (/api/dev-db);
 *  - sem as chaves, em produção → erro (nunca cair no modo local em produção).
 */
export function getBackend(): Promise<Backend> {
  instance ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && anonKey) {
      const { createSupabaseBackend } = await import("./supabaseBackend");
      return createSupabaseBackend(url, anonKey, `${window.location.origin}/novo`);
    }
    if (import.meta.env.DEV) {
      // Banco local do servidor de desenvolvimento (o mesmo do painel e do processamento).
      const { createDevServerBackend } = await import("./devServerBackend");
      return createDevServerBackend();
    }
    throw new BackendError("unknown", "Banco de dados não configurado (faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).");
  })();
  return instance;
}
