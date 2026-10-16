// Imagem da folha do candidato e dos impressos da sala (rota /api/dupla do servidor, com o token da sessão). Quem decide se a
// pessoa pode ver é o banco (app_dupla_print_path): o candidato só vê a folha, os impressos iniciais e os liberados, e só com a
// estação em andamento. O caminho do arquivo nunca chega à tela; só o endereço assinado (Supabase) ou uma cópia baixada (local).
const BASE = "/api/dupla";

/**
 * Endereço para mostrar a imagem: assinado por 10 minutos (Supabase) ou, no banco local, uma cópia baixada (blob). Sem imagem
 * (404) ou sem servidor (prévia, banco do navegador): null.
 * @param {object} backend
 * @param {string} roomId
 * @param {string} pressingId id do impresso (avaliador), chave de tela 'i<n>'/'d<n>' (candidato) ou "candidate_sheet"
 * @returns {Promise<string | null>}
 */
export async function printUrl(backend, roomId, pressingId) {
  if (typeof backend?.duplaPrintUrl === "function") return backend.duplaPrintUrl(roomId, pressingId); // prévia local
  if (!backend?.accessToken) return null;
  const token = await backend.accessToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const base = `${BASE}/rooms/${encodeURIComponent(roomId)}/prints/${encodeURIComponent(pressingId)}`;
  const link = await fetch(`${base}/link`, { headers });
  if (link.status === 404) return null;
  if (!link.ok) {
    let message = `Erro ${link.status}.`;
    try {
      message = (await link.json()).error ?? message;
    } catch {
      // sem corpo
    }
    throw new Error(message);
  }
  const { url } = await link.json();
  if (url) return url;
  const file = await fetch(`${base}/file`, { headers });
  if (!file.ok) return null;
  return URL.createObjectURL(await file.blob());
}
