/**
 * Voice Tutor — Fase 2. Token de acesso do Google para o Gemini Live no Vertex (a chave de API não abre o Live: erro 400).
 * No Mac do dono: `gcloud auth print-access-token` (conta dele). No Cloud Run: servidor de metadados (conta de serviço).
 * O token fica só na memória do servidor; nunca vai para o navegador nem para log.
 */
import { execFile } from "node:child_process";

let cache: { valor: string; ate: number } | null = null;

export async function tokenGoogle(): Promise<string> {
  if (cache && Date.now() < cache.ate) return cache.valor;
  if (process.env.K_SERVICE) {
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
    if (!r.ok) throw new Error(`metadados do Cloud Run: ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    cache = { valor: j.access_token, ate: Date.now() + Math.max(60, j.expires_in - 120) * 1000 };
    return cache.valor;
  }
  const valor = await new Promise<string>((ok, erro) =>
    execFile("gcloud", ["auth", "print-access-token"], { timeout: 15_000 }, (e, out) => (e ? erro(new Error("gcloud sem login (rode: gcloud auth login)")) : ok(String(out).trim()))),
  );
  cache = { valor, ate: Date.now() + 45 * 60 * 1000 };
  return valor;
}
