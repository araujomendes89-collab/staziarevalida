// Fotos dos Temas Essenciais: o manifesto fotos-temas.json é gerado por scripts/sincronizar-fotos-temas.py a partir das
// imagens geradas (WebP em public/temas/foto/). O cartão só mostra foto de tema que está no manifesto. Estado da foto
// ("pendente de revisão médica", "aprovada", "reprovada", "retida" = não aparece até a revisão) e risco médico ficam só nos dados: o aluno não vê nada disso.
import manifesto from "./fotos-temas.json";

const ARQUIVO = /^\/temas\/foto\/GR-\d{3}\.webp$/;

/** Foto do tema ({ webp, tipo }) ou null: fora do manifesto, reprovada ou com endereço fora da pasta das fotos. */
export function fotoDoTema(id, dados = manifesto) {
  const f = dados?.[id];
  if (!f || f.estado === "reprovada" || String(f.estado).startsWith("retida") || !ARQUIVO.test(String(f.arquivo ?? ""))) return null;
  return { webp: f.arquivo, tipo: typeof f.tipo === "string" ? f.tipo : null };
}
