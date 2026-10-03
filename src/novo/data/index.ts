import { BackendError, type Backend } from "./backend";

export * from "./backend";

let instance: Promise<Backend> | null = null;

/**
 * Escolhe o backend uma única vez:
 *  - com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY → Supabase;
 *  - sem as chaves, em desenvolvimento → banco local no navegador;
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
      const { createLocalBackend } = await import("./localBackend");
      return createLocalBackend();
    }
    throw new BackendError("unknown", "Banco de dados não configurado (faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).");
  })();
  return instance;
}
