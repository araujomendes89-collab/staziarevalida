/**
 * Apoio dos testes do grupo B (Unidades, Detalhe e Publicar ao aluno): monta no banco de teste uma unidade aprovada
 * pelas duas revisões, com fonte oficial, evidência, aula, resumo, flashcards e arquivo final conferido,
 * pronta para a publicação. Todo conteúdo é de teste; nenhuma IA é chamada.
 */
import crypto from "crypto";
import { ADMIN, EDITOR, REVISOR, type Rpc, type Sql } from "./publicacaoCentral";

export const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const TEMA_GO = "Síndromes hipertensivas na gestação"; // área GINECOLOGIA_OBSTETRICIA
export const TEMA_PED = "Bronquiolite viral aguda"; // área PEDIATRIA

/** Temas de verdade da taxonomia inicial, de áreas variadas: cada unidade de teste usa um tema diferente (aula parecida = mesmo tema). */
export const TEMAS = [
  "Rotina do pré-natal de risco habitual", "Rastreamento do câncer do colo do útero", "Insuficiência cardíaca", "Síndromes coronarianas agudas", "Asma no adulto",
  "Diabetes mellitus tipo 2", "Tuberculose", "Calendário nacional de vacinação da criança", "Atendimento inicial ao politraumatizado", "Apendicite aguda",
  "Rastreamento do câncer colorretal", "Hipertensão arterial sistêmica na atenção primária",
];
let rodizio = 0;

export type Montagem = {
  titulo: string;
  tema?: string;
  autoridade?: "A" | "B" | "C" | "D" | "E" | null;
  fonteKind?: string;
  /** afirmação crítica (dose): precisa de conferência de revisor da área */
  critica?: boolean;
  secoes?: { heading: string; paragraphs: string[] }[];
  resumo?: string[];
  cards?: { front: string; back: string }[];
  /** deixa de gerar o arquivo final conferido da aula */
  semArquivo?: boolean;
  /** pára antes das aprovações (versão em rascunho) */
  semAprovar?: boolean;
};

export async function preparaBanco(sql: Sql) {
  for (const a of ["GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "CLINICA_MEDICA", "CIRURGIA", "MFC", "SAUDE_MENTAL"])
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, $2) on conflict do nothing`, [REVISOR, a]);
  await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
}

export const noTema = async (sql: Sql, nome: string) =>
  (await sql(`select n.id from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id where v.status = 'published' and n.name = $1`, [nome]))[0].id as string;

export async function montarUnidade(sql: Sql, rpc: Rpc, m: Montagem) {
  const tema = m.tema ?? TEMAS[rodizio++ % TEMAS.length];
  const textoFonte = `${m.titulo}: reconhecer a síndrome pela pressão elevada e pela proteína na urina${m.critica ? ", com ataque de 4 g por via intravenosa em 20 min" : ""}.`;
  const fonte = (await rpc(ADMIN, "app_ch_register_source", { p_source: { title: `Manual ${m.titulo}`, organ: "Ministério da Saúde", version: "2022", published_on: "2022-01-01", sha256: sha(m.titulo) } })).id as string;
  if (m.autoridade !== null) await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: fonte, p_level: m.autoridade ?? "A" });
  const passagem = await rpc(ADMIN, "app_ch_add_passage", { p_source_id: fonte, p_passage: { section: "Capítulo 3", page: 112, population: "gestantes", theme: m.titulo, text: textoFonte } });
  const afirmacao = await rpc(EDITOR, "app_ch_add_claim", {
    p_claim: { statement: textoFonte, theme_node_id: await noTema(sql, tema), critical_kinds: m.critica ? ["dose", "route"] : [] },
  });
  const passageId = typeof passagem === "string" ? passagem : passagem?.id ?? (await sql(`select id from public.ch_source_passages where source_id = $1`, [fonte]))[0].id;
  await rpc(EDITOR, "app_ch_link_evidence", { p_claim_id: afirmacao, p_evidence: { source_id: fonte, passage_id: passageId, quote: textoFonte, verdict: "compatible", page: 112, section: "Capítulo 3" } });
  if (m.critica) await rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: afirmacao });

  const unidade = await rpc(EDITOR, "app_ch_create_unit", { p_theme_node_id: await noTema(sql, tema), p_title: m.titulo });
  const versao = (await sql(`select id from public.ch_unit_versions where unit_id = $1 order by version desc limit 1`, [unidade]))[0].id as string;
  await conteudoDaVersao(rpc, sql, versao, afirmacao, m);
  if (!m.semAprovar) await aprovar(rpc, versao);
  return { unidade: unidade as string, versao, afirmacao: afirmacao as string, fonte };
}

/** Grava o texto, os materiais e o arquivo final de uma versão em rascunho (a aula tem o mesmo texto da unidade). */
export async function conteudoDaVersao(rpc: Rpc, sql: Sql, versao: string, afirmacao: string, m: Pick<Montagem, "titulo" | "secoes" | "resumo" | "cards" | "semArquivo">) {
  const secoes = (m.secoes ?? [{ heading: "Conceito", paragraphs: [`Texto revisado de ${m.titulo}: pressão elevada na gestação com proteína na urina.`] }]).map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs.map((text) => ({ text, clinical: true, claim_ids: [afirmacao] })),
  }));
  await rpc(EDITOR, "app_ch_save_unit_version", { p_version_id: versao, p_content: { sections: secoes } });
  await rpc(EDITOR, "app_ch_save_material", { p_version_id: versao, p_kind: "lesson", p_content: { sections: secoes, references: [{ source: `Manual ${m.titulo}`, organ: "Ministério da Saúde", version: "2022", page: 112 }] } });
  await rpc(EDITOR, "app_ch_save_material", { p_version_id: versao, p_kind: "summary", p_content: { items: (m.resumo ?? ["Pressão elevada com proteína na urina na gestação."]).map((text) => ({ text, claim_ids: [afirmacao] })) } });
  const cards = m.cards ?? [{ front: `O que é ${m.titulo}?`, back: "Pressão elevada com proteína na urina na gestação." }];
  if (cards.length) await rpc(EDITOR, "app_ch_save_material", { p_version_id: versao, p_kind: "flashcards", p_content: { cards: cards.map((c) => ({ ...c, claim_ids: [afirmacao] })) } });
  if (!m.semArquivo) {
    const aula = (await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind = 'lesson'`, [versao]))[0];
    await sql(`select public.ch_worker_save_render($1::jsonb)`, [
      JSON.stringify({ material_id: aula.id, format: "pdf", storage_path: `renders/${versao}.pdf`, sha256: sha(versao), template_version: "t", brand_version: "b", material_hash: aula.content_hash, check_result: { ok: true } }),
    ]);
  }
}

/** Publica como o administrador; por padrão já confirma a aula parecida (os testes de unidades do mesmo tema dizem o contrário). */
export async function publicar(rpc: Rpc, versao: string, opcoes: Record<string, unknown> = { confirm_similar: true }) {
  return rpc(ADMIN, "app_ch_publish", { p_version_id: versao, p_options: opcoes });
}

export async function aprovar(rpc: Rpc, versao: string) {
  await rpc(EDITOR, "app_ch_submit_for_review", { p_version_id: versao });
  await rpc(REVISOR, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "Conferido nas fontes oficiais." });
  await rpc(EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
}
