/**
 * Imagens do editor profissional — parte comum (servidor e navegador) do módulo M11a (guarda).
 *
 * CONTRATO PARA O M11b (nó de figura) e para o PDF:
 * - O documento (rico "sdoc") guarda só o id da imagem em `attrs.asset` (uuid). É por essa chave, em qualquer profundidade do
 *   conteúdo PUBLICADO, que o banco (ch_worker_doc_imagem_aluno) libera a imagem ao aluno. Nunca guarde caminho nem URL no rico.
 * - Cada arquivo guardado é imutável: substituir a imagem cria outra linha (id novo, mesma família). Trocar a imagem no texto =
 *   trocar `attrs.asset` pelo id novo = mudança de CONTEÚDO (derruba a aprovação, regra do §8 do PLANO). Nunca reaproveite id.
 * - Só contam como formatação (não derrubam aprovação) estes atributos da figura: largura, alinhamento, disposicao, borda,
 *   cantos, sombra. Qualquer outro (asset, legenda, alt, recorte, giro, espelho, ajustes de cor) é conteúdo.
 * - O texto alternativo da galeria (`alt_text`) é só o valor sugerido: ao inserir, copie-o para o atributo da figura; o aluno lê
 *   o do documento (versionado e aprovado), não o da tabela.
 * - Editor (equipe/revisor): mostrar por `linksEquipe`/`linkEquipe` (src/novo/app/editorPro/imagens/api.js, endereço assinado de
 *   5 min ou blob local); enviar por `prepararNoNavegador` + `enviarImagem` (o navegador reduz para ≤ 2400 px e ≤ 4 MB e converte
 *   SVG em PNG; o servidor confere tudo de novo); galeria pronta em `GaleriaImagens.jsx`.
 * - Leitor do aluno: `carregarImagemAluno(backend, id)` (bytes pelo servidor, com login; nunca há endereço do depósito).
 * - PDF (server/contentHub/render.ts): bytes por `lerBytesImagem(deps, { aluno: true }, id)` de server/contentHub/docImagens/servico.ts
 *   (só imagem de aula publicada) ou `{ equipe }` na prévia; depósito em `createDocImagensRouter`/DOC_IMAGENS_BUCKET ("doc-imagens").
 */

export const LADO_MAXIMO = 2400;
export const LADO_MINIMO = 8;
export const LADO_MAXIMO_ENTRADA = 12000;
export const PIXELS_MAXIMO_ENTRADA = 60_000_000;
export const MAX_ENVIO_BYTES = 4 * 1024 * 1024; // a Vercel limita o corpo a 4,5 MB
export const MAX_SVG_BYTES = 1024 * 1024;
export const MAX_GUARDADO_BYTES = 5 * 1024 * 1024;

export const TIPOS_ENVIO = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export const TIPOS_GUARDADOS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type TipoEnvio = (typeof TIPOS_ENVIO)[number];
export type TipoGuardado = (typeof TIPOS_GUARDADOS)[number];

export const ALT_MAXIMO = 500;
export const ID_IMAGEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BASE_DOC_IMAGENS = "/api/content-hub/doc-imagens";

/** Valida e monta o endereço de acesso à imagem para o aluno (bytes pelo servidor). */
export function urlImagemAluno(id: string): string {
  if (!ID_IMAGEM.test(id)) {
    throw new Error("Identificador de imagem inválido.");
  }
  return `${BASE_DOC_IMAGENS}/aluno/${id}`;
}

/** Forma pública de uma imagem guardada na Central de Conteúdo, como devolvida pelo banco. */
export interface DocImagem {
  id: string;
  family_id: string;
  version: number;
  previous_id: string | null;
  unit_id: string | null;
  lesson_id: string | null;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  alt_text: string;
  original_name: string | null;
  original_mime: string | null;
  processing: Record<string, unknown>;
  uploaded_by: string | null;
  enviada_por: string | null;
  created_at: string;
  retired_at: string | null;
  repetida?: boolean;
}
