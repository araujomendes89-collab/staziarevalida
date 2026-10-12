// @vitest-environment node
/**
 * APOIO-T2 (testador adversarial): o FILTRO DE TEXTO da fonte complementar ("Sangue nos Olhos").
 *
 * Regra do dono: a apostila vale como fonte para a IA e para a equipe, mas nada que a identifique chega ao aluno (título, órgão,
 * autor, link, arquivo, trecho, página, contagem). Os textos de IA voltados ao aluno nunca citam o título/órgão/sigla de uma fonte
 * complementar CADASTRADA.
 * DECISÃO NOVA DO DONO (2026-10-11): a expressão "Sangue nos Olhos" e a palavra "apostila" SOLTAS não bloqueiam nem escondem nada
 * (texto médico legítimo, como a queixa "sangue nos olhos"). Por isso a tabela de ataque usa o TÍTULO COMPLETO cadastrado, e a seção
 * "0b" prova que a expressão solta e a palavra "apostila" passam.
 *
 * O que está sendo atacado:
 *   - servidor: server/contentHub/complementarGuard.ts (mentionsSupportMaterial, labelIsSupportMaterial, loadComplementarTerms)
 *     e os pontos que o usam (roteiro de podcast, assistente de aula, análise, proposta de atualização, Tutor texto e voz);
 *   - banco (migração 20261003009620): ch_complementar_hit (rótulos de fonte), ch_student_sources, ch_text_mentions e
 *     app_ch_complementar_mentions (varredura do que já está publicado).
 *
 * Convenção: `it` = o filtro se comporta como a regra pede. `it.fails` = VAZAMENTO (ou falso positivo) medido hoje: o teste diz o que
 * DEVERIA acontecer e falha de propósito; quando o construtor corrigir, o `it.fails` passa a acusar e deve virar `it`.
 * Severidade no nome: CRÍTICO = nome/arquivo/link/autor explícito passa; IMPORTANTE = contorno razoável de uma IA ou do editor;
 * MENOR = ofuscação deliberada.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import {
  labelIsSupportMaterial, loadComplementarTerms, mentionsSupportMaterial, resetComplementarTermsCache,
} from "../../server/contentHub/complementarGuard";
import { checkScript, generateScript, type PodcastScript } from "../../server/podcasts/script";
import { generateLessonAssist } from "../../server/lessons/assist";
import { analysisChecks, type Analysis, type QuestionForAnalysis } from "../../server/contentHub/questionAnalysis";
import { reanalysisChecks } from "../../server/contentHub/questionReanalysis";
import { verdictOf } from "../../server/contentHub/draftChecks";
import { fallbackReply, safetyCheck, type SafetyContext } from "../../server/tutor/safety";
import { voiceTranscript } from "../../server/tutor/realtime";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000002ad";
const ALUNA = "00000000-0000-4000-8000-00000000020a";

// a fonte complementar do ataque
const TITULO = "Sangue nos Olhos — Clínica Médica";
const ORGAO = "Editora Sangue nos Olhos";
const ARQUIVO = "SNO-ClinicaMedica-2026.pdf";
const URL_SNO = "https://sanguenosolhos.com.br/cm/SNO-ClinicaMedica-2026.pdf";
const AUTOR = "Dr. Fulano Bezerra Tavares";
const TRECHO = "FRASE-SECRETA-SNO: na bronquiolite leve o suporte clínico basta";
// fonte oficial ao lado
const OFI_TITULO = "PCDT de Bronquiolite (teste T2)";
const OFI_ORGAO = "Ministério da Saúde";

let db: PGlite;
const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
/** Roda como superusuário, mas com a identidade da aluna (is_staff() = falso): é como as funções internas rodam dentro de app_*. */
async function comoAluna<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ALUNA })]);
    return (await tx.query<T>(text, params)).rows;
  });
}
async function rpc<T = any>(uid: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
/** O ContentDb mínimo que o servidor usa para buscar os termos (ch_worker_complementar_terms), ligado ao PGlite. */
const contentDb = { service: async (fn: string) => (await sql(`select public.${fn}() as r`))[0].r } as any;
/** Termos da varredura, exatamente como app_ch_complementar_mentions os monta. */
const TERMOS_VARREDURA = `(select coalesce(array_agg(distinct public.ch_text_key(x.t)), '{}') from (
  select s.title as t from public.ch_sources s where s.audience = 'complementar'
  union select s.organ from public.ch_sources s where s.audience = 'complementar') x
  where char_length(public.ch_text_key(x.t)) >= 5)`;
const varredura = async (texto: string) => (await sql(`select public.ch_text_mentions($1, ${TERMOS_VARREDURA}) as r`, [texto]))[0].r as boolean;
const rotulo = async (texto: string) => (await sql(`select public.ch_complementar_hit($1, $1) as r`, [texto]))[0].r as boolean;

let TERMOS: string[] = [];
/** VAZAMENTO medido: it.fails. Com APOIO_T2_MOSTRAR=1 vira it e mostra a linha que falha em cada vazamento. */
/** Vazamentos ainda ABERTOS (nome do teste): o resto foi corrigido e roda como `it` comum. */
const ABERTOS = new Set<string>(
[
 "VAZA IMPORTANTE A32 rótulo SQL: título parcial sozinho (rótulo)",
 "VAZA IMPORTANTE A07 varredura SQL: colado (CamelCase)",
 "VAZA IMPORTANTE A08 varredura SQL: hashtag",
 "VAZA IMPORTANTE A12 servidor: sigla com pontos S.N.O.",
 "VAZA IMPORTANTE A12 rótulo SQL: sigla com pontos S.N.O.",
 "VAZA IMPORTANTE A12 varredura SQL: sigla com pontos S.N.O.",
 "VAZA IMPORTANTE A13 servidor: sigla SNO",
 "VAZA IMPORTANTE A13 rótulo SQL: sigla SNO",
 "VAZA IMPORTANTE A13 varredura SQL: sigla SNO",
 "VAZA IMPORTANTE A30 servidor: ordem trocada",
 "VAZA IMPORTANTE A30 rótulo SQL: ordem trocada",
 "VAZA IMPORTANTE A30 varredura SQL: ordem trocada",
 "VAZA IMPORTANTE A31 servidor: título parcial dentro da frase",
 "VAZA IMPORTANTE A31 rótulo SQL: título parcial dentro da frase",
 "VAZA IMPORTANTE A31 varredura SQL: título parcial dentro da frase",
 "VAZA IMPORTANTE A32 servidor: título parcial sozinho (rótulo)",
 "VAZA IMPORTANTE A32 varredura SQL: título parcial sozinho (rótulo)",
 "VAZA IMPORTANTE A33 servidor: só a primeira palavra",
 "VAZA IMPORTANTE A33 rótulo SQL: só a primeira palavra",
 "VAZA IMPORTANTE A33 varredura SQL: só a primeira palavra",
 "VAZA IMPORTANTE A34 servidor: inglês",
 "VAZA IMPORTANTE A34 rótulo SQL: inglês",
 "VAZA IMPORTANTE A34 varredura SQL: inglês",
 "VAZA IMPORTANTE A35 servidor: espanhol",
 "VAZA IMPORTANTE A35 rótulo SQL: espanhol",
 "VAZA IMPORTANTE A35 varredura SQL: espanhol",
 "VAZA MENOR A36 servidor: erro de digitação",
 "VAZA MENOR A36 rótulo SQL: erro de digitação",
 "VAZA MENOR A36 varredura SQL: erro de digitação",
 "VAZA MENOR A37 servidor: leetspeak",
 "VAZA MENOR A37 rótulo SQL: leetspeak",
 "VAZA MENOR A37 varredura SQL: leetspeak",
 "VAZA MENOR A38 varredura SQL: letras espaçadas",
 "VAZA MENOR A39 varredura SQL: hifenização de linha",
 "VAZA IMPORTANTE A47 servidor: 'material do cursinho X'",
 "VAZA IMPORTANTE A47 rótulo SQL: 'material do cursinho X'",
 "VAZA IMPORTANTE A47 varredura SQL: 'material do cursinho X'",
 "VAZA IMPORTANTE A48 servidor: 'segundo o livro'",
 "VAZA IMPORTANTE A48 rótulo SQL: 'segundo o livro'",
 "VAZA IMPORTANTE A48 varredura SQL: 'segundo o livro'",
 "VAZA IMPORTANTE A49 servidor: 'conforme o manual'",
 "VAZA IMPORTANTE A49 rótulo SQL: 'conforme o manual'",
 "VAZA IMPORTANTE A49 varredura SQL: 'conforme o manual'",
 "VAZA IMPORTANTE A50 servidor: 'segundo o resumo'",
 "VAZA IMPORTANTE A50 rótulo SQL: 'segundo o resumo'",
 "VAZA IMPORTANTE A50 varredura SQL: 'segundo o resumo'",
 "VAZA IMPORTANTE A51 servidor: página do material",
 "VAZA IMPORTANTE A51 rótulo SQL: página do material",
 "VAZA IMPORTANTE A51 varredura SQL: página do material",
 "VAZA IMPORTANTE A52 servidor: trecho literal da apostila",
 "VAZA IMPORTANTE A52 rótulo SQL: trecho literal da apostila",
 "VAZA IMPORTANTE A52 varredura SQL: trecho literal da apostila",
 "VAZA CRÍTICO A53 servidor: nome do arquivo com extensão",
 "VAZA CRÍTICO A53 rótulo SQL: nome do arquivo com extensão",
 "VAZA CRÍTICO A53 varredura SQL: nome do arquivo com extensão",
 "VAZA CRÍTICO A54 servidor: nome do arquivo sem extensão",
 "VAZA CRÍTICO A54 rótulo SQL: nome do arquivo sem extensão",
 "VAZA CRÍTICO A54 varredura SQL: nome do arquivo sem extensão",
 "VAZA CRÍTICO A55 varredura SQL: link da apostila (cadastrado)",
 "VAZA CRÍTICO A56 varredura SQL: outro link do mesmo site",
 "VAZA CRÍTICO A60 varredura SQL: autor",
 "VAZA CRÍTICO A57 rótulo SQL: domínio com hífens (não cadastrado)",
 "VAZA CRÍTICO A57 varredura SQL: domínio com hífens (não cadastrado)",
 "VAZA IMPORTANTE A61 servidor: órgão abreviado",
 "VAZA IMPORTANTE A61 rótulo SQL: órgão abreviado",
 "VAZA IMPORTANTE A61 varredura SQL: órgão abreviado",
 "CRÍTICO: item com o NOME DO ARQUIVO aparece ao aluno",
 "IMPORTANTE: item 'SNO · Clínica Médica 2026' aparece",
 "IMPORTANTE: se a IA insiste, o roteiro que cita a apostila VOLTA (só com aviso) e segue para aprovação/publicação",
 "CRÍTICO: roteiro que cita o NOME DO ARQUIVO não recebe aviso nem segunda tentativa",
 "IMPORTANTE: fala que lê o TRECHO literal da apostila não é avisada",
 "IMPORTANTE: aviso não bloqueia — a sugestão com a menção volta inteira para a equipe aplicar",
 "CRÍTICO: resumo que cita o NOME DO ARQUIVO não gera aviso",
 "CRÍTICO: análise que cita o NOME DO ARQUIVO passa sem falha",
 "IMPORTANTE: proposta 'conforme a página 345 do material' passa",
 "CRÍTICO: resposta que cita o NOME DO ARQUIVO não é barrada",
 "IMPORTANTE: 'Sangue nos Olhos' no começo de uma linha do roteiro (\\n no JSON) escapa da varredura",
 "IMPORTANTE: 'SangueNosOlhos' colado no resumo da aula escapa da varredura",
 "IMPORTANTE: comentário com 'Sangue nos Olhos' depois de quebra de linha escapa (o jsonb vira texto com \\n)"
]
);
const vaza: typeof it = ((nome: string, fn: any, t?: number) => (process.env.APOIO_T2_MOSTRAR === "1" || !ABERTOS.has(nome) ? it : it.fails)(nome, fn, t)) as any;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [id, email, name] of [[ADMIN, "t2admin@teste.dev", "Admin T2"], [ALUNA, "t2aluna@teste.dev", "Aluna T2"]]) {
    await sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  // complementar: nível E, nasce complementar (gatilho). Autor gravado na coluna authors.
  await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, authors) values ($1, $2, 'final', $3, '2026', 'E', $4)`, [TITULO, ORGAO, URL_SNO, AUTOR]);
  await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level) values ($1, $2, 'final', 'https://www.gov.br/saude/pcdt-t2', '1', 'A')`, [OFI_TITULO, OFI_ORGAO]);
  resetComplementarTermsCache();
  TERMOS = await loadComplementarTerms(contentDb);
}, 180_000);

// =====================================================================================================================
// 0. Os termos que o servidor recebe do banco
// =====================================================================================================================
describe("0. termos que o servidor confere", () => {
  it("vêm do banco: título e órgão cadastrados; 'Sangue nos Olhos' solto NÃO é termo fixo", () => {
    expect(TERMOS).toEqual(expect.arrayContaining([TITULO, ORGAO]));
    expect(TERMOS).not.toContain("Sangue nos Olhos");
  });
  vaza("CRÍTICO: o AUTOR da apostila (ch_sources.authors) não entra nos termos — 'segundo o Dr. Fulano Bezerra Tavares' passa", () => {
    expect(TERMOS).toContain(AUTOR);
  });
  vaza("CRÍTICO: o NOME DO ARQUIVO e o LINK da apostila não entram nos termos do servidor", () => {
    expect(TERMOS.some((t) => t.includes("SNO-ClinicaMedica") || t.includes("sanguenosolhos"))).toBe(true);
  });
});

// =====================================================================================================================
// 0b. DECISÃO DO DONO (2026-10-11): "Sangue nos Olhos" e "apostila" SOLTOS não bloqueiam nem escondem nada
// =====================================================================================================================
const LIVRES: Array<[string, string]> = [
  ["L01", "Segundo o Sangue nos Olhos, a conduta é suporte."],
  ["L02", "SEGUNDO O SANGUE NOS OLHOS, A CONDUTA É SUPORTE."],
  ["L03", "como diz o sângue nós ólhos"],
  ["L04", "como diz o Sangue-nos-Olhos"],
  ["L05", "veja Sangue_nos_Olhos"],
  ["L06", "veja [Sangue nos Olhos](https://exemplo.invalid/x)"],
  ["L07", "Paciente refere sangue nos olhos depois de tossir muito: é hemorragia subconjuntival."],
  ["L08", "conforme a apostila, suporte"],
  ["L09", "Apostilas trazem isso"],
  ["L10", "nas apostilas do cursinho aparece"],
  ["L11", "Como ensina a apostila Sangue nos Olhos, o suporte clínico basta."],
  ["L12", "Material da apostila de clínica: o suporte basta."],
];
describe("0b. expressão solta e a palavra 'apostila' NÃO bloqueiam (decisão do dono, 2026-10-11)", () => {
  for (const [id, texto] of LIVRES) {
    it(`${id} servidor: passa (${texto.slice(0, 40)}…)`, () => {
      expect(mentionsSupportMaterial(texto, TERMOS)).toEqual([]);
      expect(labelIsSupportMaterial(texto, TERMOS)).toBe(false);
    });
    it(`${id} banco: rótulo, varredura e lista de fontes do aluno deixam passar`, async () => {
      expect(await rotulo(texto)).toBe(false);
      expect(await varredura(texto)).toBe(false);
      const fica = ((await comoAluna(`select public.ch_student_sources($1::jsonb) as r`, [JSON.stringify([{ title: texto }])]))[0].r as unknown[]).length === 1;
      expect(fica).toBe(true);
    });
  }
  it("o título COMPLETO cadastrado continua barrado em qualquer frase", async () => {
    const t = `Segundo o ${TITULO}, a conduta é suporte.`;
    expect(mentionsSupportMaterial(t, TERMOS).length).toBeGreaterThan(0);
    expect(await varredura(t)).toBe(true);
    expect(await rotulo(TITULO)).toBe(true);
  });
});

// =====================================================================================================================
// 1. TABELA DE ATAQUE
//   srv = servidor (mentionsSupportMaterial com os termos do banco): texto de IA ao aluno (podcast, aula, análise, Tutor)
//   rot = banco ch_complementar_hit(texto, texto): rótulo/campo de fonte (diretriz da aula, documento da atualização, item de q.sources)
//   var = banco ch_text_mentions (varredura app_ch_complementar_mentions do texto já publicado)
//   B = barrado/achado, P = passou. O que a regra pede: B nas três.
// =====================================================================================================================
type R = "B" | "P";
type Sev = "CRÍTICO" | "IMPORTANTE" | "MENOR";
interface Caso { id: string; nome: string; texto: string; sev: Sev; srv: R; rot: R; var: R }
const C = (id: string, nome: string, texto: string, sev: Sev, srv: R, rot: R, vr: R): Caso => ({ id, nome, texto, sev, srv, rot, var: vr });

/** O título COMPLETO cadastrado, sem o travessão (as variações abaixo são do jeito que alguém escreveria o nome inteiro). */
const NOME_SEM_TRACO = "Sangue nos Olhos Clínica Médica";
export const ATAQUES: Caso[] = [
  // (2026-10-11) As variações abaixo atacam o TÍTULO COMPLETO cadastrado. A expressão "Sangue nos Olhos" solta e a palavra
  // "apostila" soltas passaram para a seção "0b" (não bloqueiam).
  C("A01", "nome exato (título completo)", `Segundo o ${TITULO}, a conduta é suporte.`, "CRÍTICO", "B", "B", "B"),
  C("A02", "caixa alta", `SEGUNDO O ${TITULO.toUpperCase()}, A CONDUTA É SUPORTE.`, "CRÍTICO", "B", "B", "B"),
  C("A03", "minúsculas sem acento", "segundo o sangue nos olhos clinica medica, suporte", "CRÍTICO", "B", "B", "B"),
  C("A04", "acentos trocados (minúsculos)", "como diz o sângue nós ólhos clínica médica", "IMPORTANTE", "B", "B", "B"),
  C("A05", "acentos trocados em MAIÚSCULA", "como diz o SÂNGUE NÓS ÔLHOS CLÍNICA MÉDICA", "IMPORTANTE", "B", "B", "B"),
  C("A06", "com hífens", "como diz o Sangue-nos-Olhos-Clínica-Médica", "CRÍTICO", "B", "B", "B"),
  C("A07", "colado (CamelCase)", "como diz o SangueNosOlhosClínicaMédica", "IMPORTANTE", "P", "P", "P"),
  C("A08", "hashtag", "#SangueNosOlhosClinicaMedica resume bem", "IMPORTANTE", "P", "P", "P"),
  C("A09", "espaços múltiplos", "como diz o sangue  nos   olhos  clínica   médica", "CRÍTICO", "B", "B", "B"),
  C("A10", "quebra de linha entre as palavras", "como diz o sangue\nnos\nolhos\nclínica\nmédica", "CRÍTICO", "B", "B", "B"),
  C("A11", "tabulação", "como diz o Sangue\tnos\tOlhos\tClínica\tMédica", "CRÍTICO", "B", "B", "B"),
  C("A12", "sigla com pontos S.N.O.", "como ensina o S.N.O., suporte basta", "IMPORTANTE", "P", "P", "P"),
  C("A13", "sigla SNO", "no SNO isso aparece como suporte", "IMPORTANTE", "P", "P", "P"),
  C("A14", "largura zero (U+200B) no meio", "como diz o San\u200bgue nos Olhos Clínica Médica", "MENOR", "P", "P", "P"),
  C("A15", "hífen invisível (U+00AD)", "como diz o San\u00adgue nos Olhos Clínica Médica", "MENOR", "P", "P", "P"),
  C("A16", "homóglifo cirílico (а U+0430)", "como diz o S\u0430ngue nos Olhos Clínica Médica", "IMPORTANTE", "P", "P", "P"),
  C("A17", "homóglifo grego (ο U+03BF)", "como diz o Sangue n\u03bfs Olh\u03bfs Clínica Médica", "IMPORTANTE", "P", "P", "P"),
  C("A18", "largura total (fullwidth)", "como diz o Ｓａｎｇｕｅ ｎｏｓ Ｏｌｈｏｓ Ｃｌｉｎｉｃａ Ｍｅｄｉｃａ", "MENOR", "P", "P", "P"),
  C("A19", "acento combinado (NFD, comum em PDF/macOS)", "como diz o Sángue nos Ólhos Clínica Médica".normalize("NFD"), "IMPORTANTE", "B", "P", "P"),
  C("A20", "espaço não separável (U+00A0)", "como diz o Sangue\u00a0nos\u00a0Olhos\u00a0Clínica\u00a0Médica", "CRÍTICO", "B", "B", "B"),
  C("A21", "HTML &nbsp;", "como diz o Sangue&nbsp;nos&nbsp;Olhos&nbsp;Clínica&nbsp;Médica", "IMPORTANTE", "P", "P", "P"),
  C("A22", "HTML &#32;", "como diz o Sangue&#32;nos&#32;Olhos&#32;Clínica&#32;Médica", "IMPORTANTE", "P", "P", "P"),
  C("A23", "HTML com etiqueta no meio", "como diz o <b>Sangue</b> nos <i>Olhos</i> Clínica Médica", "IMPORTANTE", "P", "P", "P"),
  C("A24", "HTML com etiqueta em volta", `como diz o <strong>${TITULO}</strong>`, "CRÍTICO", "B", "B", "B"),
  C("A25", "markdown **negrito**", `como diz o **${TITULO}**`, "CRÍTICO", "B", "B", "B"),
  C("A26", "markdown [link](url)", `veja [${TITULO}](https://exemplo.invalid/x)`, "CRÍTICO", "B", "B", "B"),
  C("A27", "markdown _itálico_ palavra a palavra", "como diz o _Sangue_ _nos_ _Olhos_ _Clínica_ _Médica_", "CRÍTICO", "B", "B", "B"),
  C("A28", "codificado em URL (%20)", "veja Sangue%20nos%20Olhos%20Clínica%20Médica", "IMPORTANTE", "P", "P", "P"),
  C("A29", "sublinhado", "veja Sangue_nos_Olhos_Clínica_Médica", "CRÍTICO", "B", "B", "B"),
  C("A30", "ordem trocada", "olhos, sangue nos: é assim que o material chama", "IMPORTANTE", "P", "P", "P"),
  C("A31", "título parcial dentro da frase", "como ensina o Sangue nos, o suporte basta", "IMPORTANTE", "P", "P", "P"),
  C("A32", "título parcial sozinho (rótulo)", "Sangue nos", "IMPORTANTE", "P", "P", "P"), // decisão: casar só por título COMPLETO e exato (um título genérico esconderia fonte oficial)
  C("A33", "só a primeira palavra", "a coleção Sangue de clínica traz isso", "IMPORTANTE", "P", "P", "P"),
  C("A34", "inglês", "as the Blood in the Eyes handout says", "IMPORTANTE", "P", "P", "P"),
  C("A35", "espanhol", "como dice Sangre en los Ojos", "IMPORTANTE", "P", "P", "P"),
  C("A36", "erro de digitação", "como diz o Sangue nos Olho Clínica Médica", "MENOR", "P", "P", "P"),
  C("A37", "leetspeak", "como diz o S4ngue n0s 0lhos Clínica Médica", "MENOR", "P", "P", "P"),
  C("A38", "letras espaçadas", `como diz o ${[...NOME_SEM_TRACO].join(" ")}`, "MENOR", "P", "P", "P"),
  C("A39", "hifenização de linha", "como diz o San-\ngue nos Olhos Clínica Médica", "MENOR", "P", "P", "P"),
  C("A40", "marca registrada", `como diz o ${TITULO}®`, "CRÍTICO", "B", "B", "B"),
  C("A41", "apóstrofo tipográfico", `o ‘${TITULO}’ diz`, "CRÍTICO", "B", "B", "B"),
  C("A47", "'material do cursinho X'", "conforme o material do cursinho X", "IMPORTANTE", "P", "P", "P"),
  C("A48", "'segundo o livro'", "segundo o livro de clínica, suporte", "IMPORTANTE", "P", "P", "P"),
  C("A49", "'conforme o manual'", "conforme o manual que a gente usa", "IMPORTANTE", "P", "P", "P"),
  C("A50", "'segundo o resumo'", "segundo o resumo do curso", "IMPORTANTE", "P", "P", "P"),
  C("A51", "página do material", "conforme a página 123 do material", "IMPORTANTE", "P", "P", "P"),
  C("A52", "trecho literal da apostila", `Como está escrito: "${TRECHO}".`, "IMPORTANTE", "P", "P", "P"),
  C("A53", "nome do arquivo com extensão", `veja o ${ARQUIVO}`, "CRÍTICO", "P", "P", "P"),
  C("A54", "nome do arquivo sem extensão", "veja o SNO-ClinicaMedica-2026", "CRÍTICO", "P", "P", "P"),
  C("A55", "link da apostila (cadastrado)", URL_SNO, "CRÍTICO", "P", "B", "P"),
  C("A56", "outro link do mesmo site", "https://sanguenosolhos.com.br/cm/outro-volume-2026.pdf", "CRÍTICO", "P", "P", "P"),
  // 2026-10-11: antes era barrado pela expressão solta "sangue nos olhos". Agora o SERVIDOR ainda barra (o site cadastrado sanguenosolhos.com.br
  // vira termo sem espaços), mas o rótulo SQL e a varredura SQL deixam passar (vazamento ABERTO novo, efeito da retirada da expressão solta)
  C("A57", "domínio com hífens (não cadastrado)", "veja sangue-nos-olhos.com.br", "CRÍTICO", "B", "P", "P"),
  C("A58", "órgão completo", `publicado pela ${ORGAO}`, "CRÍTICO", "B", "B", "B"),
  C("A59", "título completo", `veja ${TITULO}`, "CRÍTICO", "B", "B", "B"),
  C("A60", "autor", `segundo o ${AUTOR}`, "CRÍTICO", "P", "P", "P"),
  C("A61", "órgão abreviado", "a Editora SNO traz", "IMPORTANTE", "P", "P", "P"),
];

describe("1. tabela de ataque", () => {
  const marca = (c: Caso, onde: string, r: R) => (r === "B" ? `${c.id} ${onde} barra: ${c.nome}` : `VAZA ${c.sev} ${c.id} ${onde}: ${c.nome}`);
  for (const c of ATAQUES) {
    (c.srv === "B" ? it : vaza)(marca(c, "servidor", c.srv), () => {
      expect(mentionsSupportMaterial(c.texto, TERMOS).length).toBeGreaterThan(0);
    });
    (c.rot === "B" ? it : vaza)(marca(c, "rótulo SQL", c.rot), async () => {
      expect(await rotulo(c.texto)).toBe(true);
    });
    (c.var === "B" ? it : vaza)(marca(c, "varredura SQL", c.var), async () => {
      expect(await varredura(c.texto)).toBe(true);
    });
  }

  it("resumo: quantos passam em cada camada (para o relatório)", async () => {
    const passa = (k: "srv" | "rot" | "var") => ATAQUES.filter((c) => c[k] === "P").length;
    expect(ATAQUES).toHaveLength(56);
    expect({ srv: passa("srv"), rot: passa("rot"), var: passa("var") }).toEqual({ srv: 35, rot: 36, var: 37 });
  });
});

// Rótulos de fonte que a equipe digita (q.sources da questão, fontes do cartão): ch_student_sources como a aluna.
describe("1b. lista de fontes que o aluno recebe (ch_student_sources)", () => {
  const fica = async (item: unknown) => ((await comoAluna(`select public.ch_student_sources($1::jsonb) as r`, [JSON.stringify([item])]))[0].r as unknown[]).length === 1;
  it("título, órgão, link cadastrado e link com utm somem", async () => {
    expect(await fica({ title: TITULO })).toBe(false);
    expect(await fica({ title: "Material de apoio", organization: ORGAO })).toBe(false);
    expect(await fica({ title: "Material de apoio", url: URL_SNO })).toBe(false);
    expect(await fica({ title: "Material de apoio", url: `${URL_SNO}?utm_source=x` })).toBe(false);
    expect(await fica({ title: OFI_TITULO, organization: OFI_ORGAO })).toBe(true);
  });
  vaza("CRÍTICO: item com o NOME DO ARQUIVO aparece ao aluno", async () => {
    expect(await fica({ title: ARQUIVO })).toBe(false);
  });
  vaza("CRÍTICO: item com outro link do mesmo site da apostila aparece ao aluno", async () => {
    expect(await fica({ title: "Material", url: "https://sanguenosolhos.com.br/cm/outra.pdf" })).toBe(false);
  });
  vaza("CRÍTICO: item com o AUTOR da apostila aparece ao aluno", async () => {
    expect(await fica({ title: "Livro de clínica", organization: AUTOR })).toBe(false);
  });
  it("(2026-10-11) item 'Apostila de Clínica Médica (cursinho)' APARECE: a palavra apostila solta não esconde fonte (só o nome cadastrado)", async () => {
    expect(await fica({ title: "Apostila de Clínica Médica (cursinho)", organization: "Cursinho X" })).toBe(true);
  });
  vaza("IMPORTANTE: item 'SNO · Clínica Médica 2026' aparece", async () => {
    expect(await fica({ title: "SNO · Clínica Médica 2026", organization: "SNO" })).toBe(false);
  });
  it("(2026-10-11) gabarito com nota 'ver p. 345 da apostila' APARECE: a palavra apostila solta não esconde fonte", async () => {
    expect(await fica({ title: "Gabarito INEP 2024/1", note: "ver p. 345 da apostila" })).toBe(true);
  });
  it("gabarito com nota que cita o TÍTULO COMPLETO cadastrado some", async () => {
    expect(await fica({ title: "Gabarito INEP 2024/1", note: `ver p. 345 do ${TITULO}` })).toBe(false);
  });
});

// =====================================================================================================================
// 2. FALSOS POSITIVOS: 100 frases médicas comuns
// DECISÃO DO DONO (2026-10-11): "sangue nos olhos" como queixa leiga de hemorragia subconjuntival (F099, F100) e a palavra "apostila"
// NÃO são mais barradas. Nenhuma das 100 frases é barrada.
// =====================================================================================================================
export const FRASES_MEDICAS: string[] = [
  "Na bronquiolite leve, o tratamento é de suporte com hidratação e oxigênio se necessário.",
  "A pré-eclâmpsia é definida por hipertensão após 20 semanas com proteinúria ou lesão de órgão-alvo.",
  "O sulfato de magnésio previne a eclâmpsia em gestantes com sinais de gravidade.",
  "Na sepse, a primeira hora exige lactato, hemoculturas, antibiótico e cristaloide.",
  "A cetoacidose diabética cursa com hiperglicemia, acidose metabólica e cetonemia.",
  "No infarto com supradesnivelamento do ST, a reperfusão deve ser feita o quanto antes.",
  "A dengue com sinais de alarme exige internação e hidratação venosa.",
  "Hemorragia digestiva alta com instabilidade pede ressuscitação volêmica antes da endoscopia.",
  "O rastreio do câncer de colo do útero no SUS começa aos 25 anos.",
  "A sífilis na gestação é tratada com penicilina benzatina.",
  "O teste do pezinho deve ser colhido entre o terceiro e o quinto dia de vida.",
  "Na apendicite aguda, a dor costuma migrar para a fossa ilíaca direita.",
  "A colecistite aguda tem sinal de Murphy positivo.",
  "A tuberculose pulmonar é tratada com esquema RIPE por seis meses.",
  "A hanseníase multibacilar recebe poliquimioterapia por doze meses.",
  "Na asma grave, o corticoide sistêmico deve ser iniciado cedo.",
  "A DPOC exacerbada pode precisar de ventilação não invasiva.",
  "A pneumonia comunitária grave pede internação em terapia intensiva.",
  "A meningite bacteriana exige antibiótico empírico sem atrasar por exames.",
  "Na anafilaxia, a adrenalina intramuscular é a primeira medida.",
  "O choque hipovolêmico na criança se reconhece pela taquicardia e enchimento capilar lento.",
  "A desidratação grave na diarreia aguda pede reidratação venosa.",
  "O aleitamento materno exclusivo é recomendado até os seis meses.",
  "A icterícia nas primeiras 24 horas de vida é sempre patológica.",
  "A convulsão febril simples tem bom prognóstico.",
  "Na Clínica Médica, a hipertensão é a condição crônica mais cobrada.",
  "A prova de Clínica Médica do Revalida cobra muito diabetes e hipertensão.",
  "O residente de Clínica Médica atende a enfermaria de adultos.",
  "Questões de Clínica Médica costumam trazer casos de insuficiência cardíaca.",
  "A insuficiência cardíaca com fração de ejeção reduzida usa betabloqueador.",
  "A fibrilação atrial exige avaliar o risco de AVC pelo escore CHA2DS2-VASc.",
  "O AVC isquêmico dentro da janela pode receber trombólise.",
  "A hemorragia subaracnóidea se apresenta como a pior cefaleia da vida.",
  "O trauma craniano grave tem Glasgow menor ou igual a 8.",
  "No politraumatizado, o ABCDE orienta o atendimento inicial.",
  "O pneumotórax hipertensivo é tratado com descompressão imediata.",
  "A queimadura de segundo grau profundo pode precisar de enxerto.",
  "A hérnia inguinal encarcerada é urgência cirúrgica.",
  "A obstrução intestinal por bridas é comum após cirurgia abdominal.",
  "A pancreatite aguda grave pede suporte intensivo.",
  "O pré-natal de baixo risco tem no mínimo seis consultas.",
  "A diabetes gestacional é rastreada com o teste oral de tolerância à glicose.",
  "O descolamento prematuro de placenta causa sangramento com dor.",
  "A placenta prévia sangra sem dor.",
  "A hemorragia pós-parto tem a atonia uterina como principal causa.",
  "A ocitocina é a primeira droga na atonia uterina.",
  "A rotura prematura de membranas pré-termo pede corticoide antenatal.",
  "O trabalho de parto prematuro pode ser inibido em casos selecionados.",
  "A vacina BCG é aplicada ao nascer.",
  "A vacina contra o HPV faz parte do calendário de adolescentes.",
  "O calendário vacinal da criança está no manual do Programa Nacional de Imunizações.",
  "A puericultura acompanha o crescimento e o desenvolvimento.",
  "A anemia ferropriva é comum na infância.",
  "A infecção urinária na criança pequena pode se apresentar só com febre.",
  "A síndrome nefrótica cursa com proteinúria maciça e edema.",
  "A glomerulonefrite pós-estreptocócica cursa com hematúria e hipertensão.",
  "A doença renal crônica é estadiada pela taxa de filtração glomerular.",
  "A hipercalemia grave altera o eletrocardiograma.",
  "A hiponatremia aguda sintomática exige correção cuidadosa.",
  "A tireotoxicose pode causar fibrilação atrial.",
  "O hipotireoidismo congênito é detectado no teste do pezinho.",
  "A insuficiência adrenal aguda pede hidrocortisona.",
  "O lúpus pode causar nefrite.",
  "A artrite séptica é urgência ortopédica.",
  "A osteoporose é rastreada com densitometria em mulheres acima de 65 anos.",
  "A depressão maior tem tratamento com psicoterapia e antidepressivo.",
  "O risco de suicídio deve ser sempre perguntado de forma direta.",
  "A intoxicação por paracetamol tem antídoto, a acetilcisteína.",
  "A intoxicação por organofosforado é tratada com atropina.",
  "O acidente ofídico botrópico pede soro antibotrópico.",
  "A leptospirose grave pode causar hemorragia pulmonar.",
  "A malária por falciparum é a forma mais grave.",
  "A doença de Chagas crônica pode causar miocardiopatia.",
  "A esquistossomose é endêmica em regiões do Nordeste.",
  "O HIV deve ser testado em toda gestante.",
  "A profilaxia pós-exposição ao HIV começa em até 72 horas.",
  "O material biológico do acidente deve ser descartado em local apropriado.",
  "O material complementar da aula traz os casos clínicos para treino.",
  "A medicina de família coordena o cuidado no território.",
  "A visita domiciliar é atribuição da equipe de saúde da família.",
  "O sistema de informação da atenção básica registra os atendimentos.",
  "A notificação compulsória da dengue é semanal.",
  "A vigilância epidemiológica investiga surtos.",
  "A sensibilidade de um teste mede os verdadeiros positivos.",
  "O valor preditivo positivo depende da prevalência.",
  "O estudo de coorte acompanha expostos e não expostos.",
  "O ensaio clínico randomizado é o melhor desenho para avaliar tratamento.",
  "A conjuntivite viral causa olho vermelho e secreção aquosa.",
  "O glaucoma agudo causa dor ocular intensa e visão turva.",
  "A retinopatia diabética deve ser rastreada todo ano.",
  "A otite média aguda é comum após resfriado.",
  "A faringite estreptocócica é tratada com amoxicilina.",
  "A epistaxe anterior costuma ceder com compressão.",
  "A hemorragia subconjuntival costuma ser benigna e some sozinha.",
  "O trauma ocular penetrante exige avaliação oftalmológica urgente.",
  "O paciente com olho vermelho e dor intensa precisa de avaliação no mesmo dia.",
  "O livro de registro da unidade deve ser preenchido diariamente.",
  "O resumo de alta deve trazer as medicações em uso.",
  "Paciente refere sangue nos olhos depois de tossir muito: é hemorragia subconjuntival.",
  "A mãe conta que a criança acordou com sangue nos olhos após crise de coqueluche.",
];

describe("2. falsos positivos", () => {
  it("são 100 frases", () => expect(FRASES_MEDICAS).toHaveLength(100));

  it("servidor: nenhuma das 100 frases é barrada (inclusive as 2 com a queixa 'sangue nos olhos')", () => {
    const barradas = FRASES_MEDICAS.map((f, i) => [i + 1, mentionsSupportMaterial(f, TERMOS)] as const).filter(([, m]) => m.length).map(([n]) => n);
    expect(barradas).toEqual([]);
  });

  it("varredura SQL e rótulo SQL: nenhuma das 100 frases é achada", async () => {
    const barradas: number[] = [];
    for (let i = 0; i < FRASES_MEDICAS.length; i++) if ((await varredura(FRASES_MEDICAS[i])) || (await rotulo(FRASES_MEDICAS[i]))) barradas.push(i + 1);
    expect(barradas).toEqual([]);
  });

  it("'material complementar', 'manual do PNI', 'livro de registro', 'resumo de alta' não são barrados", () => {
    for (const n of [51, 77, 78, 97, 98]) expect(mentionsSupportMaterial(FRASES_MEDICAS[n - 1], TERMOS), `F${n}`).toEqual([]);
  });

  it("rótulo de fonte oficial 'Clínica Médica' sozinho é ESCONDIDO pela regra 'texto é parte do título' (falso positivo medido)", async () => {
    // ch_complementar_hit: texto com 8+ letras que é parte do título complementar ("sangue nos olhos clinica medica") esconde.
    expect(await rotulo("Clínica Médica")).toBe(false); // corrigido: título genérico não esconde mais
    expect(await rotulo("Diretriz de Clínica Médica")).toBe(false);
  });
});

// =====================================================================================================================
// 3. PONTOS ONDE O FILTRO É APLICADO (com a IA simulada) e os que ficaram de fora
// =====================================================================================================================
const fakeDb = { service: async () => null } as any;
const EXPLICITO = `Como ensina o ${TITULO}, o suporte clínico basta.`; // cita o TÍTULO COMPLETO cadastrado
const CONTORNO = `Como está no ${ARQUIVO}, o suporte clínico basta.`;

describe("3a. roteiro de podcast (checkScript / generateScript)", () => {
  const chunks = [{ id: 1, source: "Material", doc: 1, page: 345, text: TRECHO }];
  const roteiro = (texto: string) => ({ title_suggestion: "Bronquiolite", missing: [], lines: [
    { speaker: "ANA", text: "Vamos falar de bronquiolite.", style: "", sources: [] },
    { speaker: "BRUNO", text: "E o que muda na conduta?", style: "", sources: [] },
    { speaker: "ANA", text: texto, style: "", sources: [1] },
    { speaker: "BRUNO", text: "Fechado.", style: "", sources: [] },
  ] });

  it("menção explícita gera aviso cites_material e pede a segunda tentativa", async () => {
    const pedidos: string[] = [];
    const r = await generateScript({ kind: "mock", topic: "bronquiolite", minutes: 2, chunks, db: fakeDb, terms: TERMOS, mockRespond: (req: any) => { pedidos.push(req.input); return roteiro(EXPLICITO); } });
    expect(pedidos).toHaveLength(2);
    expect(r.warnings.map((w) => w.kind)).toContain("cites_material");
  });

  vaza("IMPORTANTE: se a IA insiste, o roteiro que cita a apostila VOLTA (só com aviso) e segue para aprovação/publicação", async () => {
    const r = await generateScript({ kind: "mock", topic: "bronquiolite", minutes: 2, chunks, db: fakeDb, terms: TERMOS, mockRespond: () => roteiro(EXPLICITO) });
    expect(JSON.stringify(r.script)).not.toMatch(/sangue nos olhos|apostila/i);
  });

  vaza("CRÍTICO: roteiro que cita o NOME DO ARQUIVO não recebe aviso nem segunda tentativa", async () => {
    const pedidos: string[] = [];
    const r = await generateScript({ kind: "mock", topic: "bronquiolite", minutes: 2, chunks, db: fakeDb, terms: TERMOS, mockRespond: (req: any) => { pedidos.push(req.input); return roteiro(CONTORNO); } });
    expect(r.warnings.map((w) => w.kind)).toContain("cites_material");
  });

  vaza("IMPORTANTE: fala que lê o TRECHO literal da apostila não é avisada", () => {
    const s: PodcastScript = { lines: [{ speaker: "ANA", text: `Olha só: "${TRECHO}".`, style: "", sources: [1] }], missing: [] };
    expect(checkScript(s, new Map(chunks.map((c) => [c.id, c])), undefined, TERMOS).map((w) => w.kind)).toContain("cites_material");
  });

  it("MENOR: o modo simulado ainda fala em 'material' e 'páginas citadas' (sem nome)", async () => {
    const r = await generateScript({ kind: "mock", topic: "bronquiolite", minutes: 2, chunks, db: fakeDb, terms: TERMOS });
    const fala = r.script.lines.map((l) => l.text).join(" ");
    expect(fala).toMatch(/material/);
    expect(mentionsSupportMaterial(fala, TERMOS)).toEqual([]);
  });
});

describe("3b. assistente de aula (generateLessonAssist)", () => {
  const pages = [{ page: 345, text: `${TRECHO}. Oxigênio se saturação baixa.` }];
  const resposta = (o: Partial<{ title: string; topic: string; summary: string; kp: string }>) => () => ({
    title: o.title ?? "Bronquiolite", topic: o.topic ?? "Bronquiolite", area: "PEDIATRIA", summary: o.summary ?? "Suporte clínico.",
    summary_sources: [1], key_points: [{ text: o.kp ?? "Suporte clínico.", sources: [1] }], missing: [],
  });
  const gerar = (o: Parameters<typeof resposta>[0]) => generateLessonAssist({ kind: "mock", pages, terms: TERMOS, db: fakeDb, mockRespond: resposta(o) } as any);

  it("resumo, ponto-chave e título que citam a apostila viram aviso para a equipe", async () => {
    const r = await gerar({ title: `Bronquiolite pelo ${TITULO}`, summary: EXPLICITO, kp: `No ${TITULO}: suporte.` });
    expect(r.warnings.filter((w) => /cita material de apoio/.test(w))).toHaveLength(3);
  });
  vaza("IMPORTANTE: o TEMA (topic) sugerido pela IA não é conferido e vai ao aluno (lesson_view.topic)", async () => {
    const r = await gerar({ topic: `Bronquiolite (${TITULO})` });
    expect(r.warnings.some((w) => /cita material de apoio/.test(w))).toBe(true);
  });
  vaza("IMPORTANTE: aviso não bloqueia — a sugestão com a menção volta inteira para a equipe aplicar", async () => {
    const r = await gerar({ summary: EXPLICITO });
    expect(r.suggestion.summary).not.toMatch(/apostila|sangue nos olhos/i);
  });
  vaza("CRÍTICO: resumo que cita o NOME DO ARQUIVO não gera aviso", async () => {
    const r = await gerar({ summary: CONTORNO });
    expect(r.warnings.some((w) => /cita material de apoio/.test(w))).toBe(true);
  });
});

describe("3c. análise da questão e proposta de atualização", () => {
  const q = {
    id: "q1", exam_id: "e", exam_year: 2024, number: 1, area: "PEDIATRIA", statement: "Lactente com sibilância.", correct_option: "B", images: [],
    options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: null })), official: { answer: "B", status: "FINAL", source: null }, dna: null, basis_hash: "x",
  } as QuestionForAnalysis;
  const analise = (onde: "trap" | "teaches" | "why_wrong" | "key_data", texto: string): Analysis => ({
    question_core: "Pede a conduta na bronquiolite leve.", key_data: [{ text: onde === "key_data" ? texto : "sibilância", role: "CRITICAL" }], reasoning_types: [], difficulty: 2, difficulty_components: {},
    trap: onde === "trap" ? texto : "Cuidado com o enunciado.", golden_rule: "Suporte é a base.",
    pedagogy: { teaches: onde === "teaches" ? texto : "", why_important: "", cognitive_error: "", review_if_wrong: "" }, guideline_dependency: { depends: false, topics: [] },
    options: ["A", "B", "C", "D"].map((id) => ({
      option_id: id, is_official_correct: id === "B", distractor_kind: id === "B" ? "CORRECT" : "WRONG", reasoning: "Porque o quadro pede suporte clínico.",
      why_plausible: "Parece razoável no início.", why_wrong: onde === "why_wrong" && id === "A" ? texto : "Não trata a causa do quadro e não muda o desfecho do paciente.", when_correct: "Em outro quadro clínico.",
      concept_difference: "Conceito diferente.", error_types: id === "B" ? [] : ["WRONG_CONCEPT"], trap: "", quality: 80,
    })),
  } as any);

  for (const onde of ["trap", "teaches", "why_wrong", "key_data"] as const) {
    it(`menção explícita em ${onde} = falha crítica e veredito 'fail'`, () => {
      const f = analysisChecks(q, analise(onde, EXPLICITO), TERMOS);
      expect(f.map((x) => x.code)).toContain("cites_support_material");
      expect(verdictOf(f)).toBe("fail");
    });
  }
  vaza("CRÍTICO: análise que cita o NOME DO ARQUIVO passa sem falha", () => {
    expect(analysisChecks(q, analise("why_wrong", CONTORNO), TERMOS).map((x) => x.code)).toContain("cites_support_material");
  });
  vaza("IMPORTANTE: análise com homóglifo (Sаngue cirílico) passa sem falha", () => {
    expect(analysisChecks(q, analise("trap", "Como diz o Sаngue nos Olhos Clínica Médica, cuidado."), TERMOS).map((x) => x.code)).toContain("cites_support_material");
  });

  const entrada: any = { question_id: "q1", statement: "x", options: [], changes: [], correct_option: "B", official: { answer: "B" } };
  const proposta = (what: string, note = ""): any => ({ assessment: "INCONCLUSIVE", impact_level: "NO_IMPACT", current_answer: "NONE", what_changed: what, why_it_matters: "", options_affected: note ? [{ option_id: "A", note }] : [], citations: [], confidence: 10 });
  it("proposta de atualização: menção em what_changed e na nota de alternativa = falha crítica", () => {
    expect(reanalysisChecks(entrada, proposta(EXPLICITO), TERMOS).map((x) => x.code)).toContain("cites_support_material");
    expect(reanalysisChecks(entrada, proposta("A conduta foi mantida pela diretriz.", `No ${TITULO} esta alternativa é marcada.`), TERMOS).map((x) => x.code)).toContain("cites_support_material");
  });
  vaza("IMPORTANTE: proposta 'conforme a página 345 do material' passa", () => {
    expect(reanalysisChecks(entrada, proposta("Conforme a página 345 do material, a conduta mudou."), TERMOS).map((x) => x.code)).toContain("cites_support_material");
  });
});

describe("3d. Tutor em texto (safetyCheck)", () => {
  const out = (reply: string, suggested: string[] = []): any => ({
    reply, grounding: "GENERAL", citations: [], evaluation: { error_type: "none", knowledge_gap: "", severity: 1, unsafe: false, reasoning_quality: "na", recommended_action: "none", answer_correct: "na", self_corrected: false },
    justification: "NONE", reveals_answer: false, suggested_replies: suggested,
  });
  const ctx: SafetyContext = { blocks: [], conversationTexts: [], hintLevel: null, hasUpdateCard: false, profanity: "off", supportTerms: TERMOS } as any;
  const codigos = (o: any) => safetyCheck(o, { ...ctx, supportTerms: TERMOS }).violations.map((v) => v.code);

  it("resposta com menção explícita é barrada; a resposta fixa não cita nada", () => {
    expect(codigos(out(EXPLICITO))).toContain("cites_support_material");
    expect(mentionsSupportMaterial(fallbackReply([{ code: "cites_support_material", detail: "x" }]), TERMOS)).toEqual([]);
  });
  vaza("IMPORTANTE: as RESPOSTAS SUGERIDAS (botões que o aluno vê) não são conferidas", () => {
    expect(codigos(out("Pensa no quadro clínico.", [`Isso tá no ${TITULO}?`]))).toContain("cites_support_material");
  });
  vaza("CRÍTICO: resposta que cita o NOME DO ARQUIVO não é barrada", () => {
    expect(codigos(out(CONTORNO))).toContain("cites_support_material");
  });
  vaza("CRÍTICO: resposta que cita o AUTOR da apostila não é barrada", () => {
    expect(codigos(out(`Segundo o ${AUTOR}, o suporte basta.`))).toContain("cites_support_material");
  });
  it("rótulo de fonte complementar não volta na lista de fontes; homóglifo no rótulo VAZA (registrado abaixo)", () => {
    expect(labelIsSupportMaterial(`${TITULO} · p. 345`, TERMOS)).toBe(true);
  });
  vaza("IMPORTANTE: rótulo de passagem com homóglifo ('Sаngue nos Olhos') não é reconhecido pelo filtro do Tutor", () => {
    expect(labelIsSupportMaterial("Sаngue nos Olhos Clínica Médica · p. 345", TERMOS)).toBe(true);
  });
});

describe("3e. Tutor por voz (voiceTranscript)", () => {
  const ouvir = async (fala: string) => {
    const gravado: any[] = [];
    const deps: any = {
      db: {
        service: async (fn: string, args: any) => {
          if (fn === "ch_worker_tutor_voice_call") return { session_id: "s1", provider: "realtime" };
          if (fn === "ch_worker_complementar_terms") return TERMOS;
          if (fn === "ch_worker_tutor_append") gravado.push(args);
          return null;
        },
      },
    };
    resetComplementarTermsCache();
    const r = await voiceTranscript(deps, ALUNA, "vc1", "tutor", fala);
    return { r, gravado };
  };

  it("a fala da voz que cita a apostila é marcada como violação no registro e devolve uma correção", async () => {
    const { r, gravado } = await ouvir(EXPLICITO);
    expect(gravado[0].p_meta.violations).toContain("cites_support_material");
    expect(r.correction).toBeTruthy();
  });
  vaza("IMPORTANTE: a correção mandada à voz NÃO diz o que corrigir (não há instrução para material complementar)", async () => {
    const { r } = await ouvir(EXPLICITO);
    expect(r.correction).toMatch(/apostila|material|fonte/i);
  });
  vaza("IMPORTANTE: a transcrição gravada (que o aluno vê no histórico) guarda a menção à apostila", async () => {
    const { gravado } = await ouvir(EXPLICITO);
    expect(gravado[0].p_tutor).not.toMatch(/sangue nos olhos|apostila/i);
  });
});

// =====================================================================================================================
// 3f / 4. TEXTO PUBLICADO: o que chega ao aluno sem filtro e a varredura app_ch_complementar_mentions
// =====================================================================================================================
describe("4. varredura do publicado (app_ch_complementar_mentions)", () => {
  const ids: Record<string, string> = {};
  const QA = "revalida_2024_1_q091";
  const QB = "revalida_2024_1_q092";
  const questao = (number: number, explicacao: string, conduta: string) => ({
    kind: "REVALIDA", year: 2024, semester: 1, number, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
    statement: "Lactente de 4 meses com sibilância e coriza há 2 dias. Qual a conduta?",
    options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: id === "A" ? explicacao : "" })),
    correct_option: "B", status: "valid", expected_conduct: conduta, inep_intent: "", needs_image: false, sources: [],
  });
  let achados: any[] = [];
  const achou = (kind: string, id: string) => achados.some((a) => a.kind === kind && String(a.id) === String(id));

  beforeAll(async () => {
    const aula = async (nome: string, campos: Record<string, unknown>, published = true) => {
      const base = { area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite na prática", summary: "Suporte clínico.", key_points: [] as string[], instructor: null as string | null, ...campos };
      ids[nome] = (await sql(`insert into public.lessons (area, topic, title, summary, key_points, instructor, published) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [base.area, base.topic, base.title, base.summary, base.key_points, base.instructor, published]))[0].id;
    };
    await aula("L_resumo", { summary: `Conforme o ${TITULO}, o suporte basta.` });
    await aula("L_ponto", { key_points: [`O ${TITULO} resume assim: suporte.`] });
    await aula("L_rascunho", { summary: `Conforme o ${TITULO}, o suporte basta.` }, false);
    await aula("L_limpa", {});
    await aula("L_instrutor", { instructor: `Equipe ${ORGAO}` });
    await aula("L_camel", { summary: "Resumo feito a partir do SangueNosOlhosClínicaMédica." });
    // texto médico legítimo com a expressão solta e a palavra apostila: NÃO entra na varredura (decisão do dono, 2026-10-11)
    await aula("L_livre", { summary: "Paciente refere sangue nos olhos depois de tossir: hemorragia subconjuntival. A apostila do curso não é fonte citada aqui." });

    const podcast = (nome: string, falas: string[], status = "published") =>
      sql(`insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at) values ('Bronquiolite em 8 minutos', 'Bronquiolite', 'PEDIATRIA', $1, $2::jsonb, now(), 'podcasts/x.mp3', now()) returning id`,
        [status, JSON.stringify({ lines: falas.map((text) => ({ speaker: "ANA", text, sources: [] })) })]).then((r) => (ids[nome] = r[0].id));
    await podcast("P_fala", [`Como ensina o ${TITULO}, suporte.`]);
    await podcast("P_quebra", [`Fonte:\n${TITULO}, capítulo de pediatria.`]);
    await podcast("P_rascunho", [`Como ensina o ${TITULO}, suporte.`], "draft");
    await podcast("P_livre", ["Paciente com sangue nos olhos após tosse: hemorragia subconjuntival. Siga a apostila do curso para revisar."]);
    await podcast("P_limpo", ["Na bronquiolite leve, suporte."]);

    const atualizacao = (nome: string, campos: Record<string, unknown>) =>
      sql(`insert into public.guideline_updates (slug, area, topic, publication_label, institution, document_title, source_url, trap, flashcards, timeline, published, review_status, source_checked_at, reviewed_by, reviewed_at)
           values ($1, 'PEDIATRIA', 'Bronquiolite leve', $2, $3, 'PCDT Bronquiolite', 'https://www.gov.br/saude/pcdt-t2', $4, $5::jsonb, $6::jsonb, true, 'approved', now(), $7, now()) returning id`,
        [`t2-${nome.toLowerCase().replace(/_/g, "-")}`, campos.label ?? "MS 2024", OFI_ORGAO, campos.trap ?? "Cuidado com broncodilatador.", JSON.stringify(campos.flashcards ?? []), JSON.stringify(campos.timeline ?? []), ADMIN])
        .then((r) => (ids[nome] = r[0].id));
    await atualizacao("U_trap", { trap: `O ${TITULO} ainda traz a conduta antiga.` });
    await atualizacao("U_rotulo", { label: `${TITULO} 2026` });
    await atualizacao("U_flash", { flashcards: [{ front: "Conduta?", back: `Suporte, como no ${TITULO}.` }] });
    await atualizacao("U_linha", { timeline: [{ year: 2026, text: `${TITULO} muda a conduta.` }] });

    // questões: análise publicada que cita (coberta) e explicação/conduta esperada digitadas pela equipe (não cobertas)
    // (2026-10-11) o banco BARRA salvar texto novo com o título cadastrado; o texto antigo entra por SQL direto (como se já estivesse gravado)
    await rpc(ADMIN, "app_admin_save_question", { p_question: questao(91, "Errada.", "Suporte.") });
    await rpc(ADMIN, "app_admin_save_question", { p_question: questao(92, "Errada.", "Suporte.") });
    for (const [qid, num, expl, cond] of [[QA, 91, `Errada: veja o ${TITULO}.`, "Suporte."], [QB, 92, `Errada: conforme o ${TITULO}.`, `Suporte, como manda o ${TITULO}.`]] as const) {
      const q = questao(num, expl, cond);
      await sql(`update public.questions set options = $2::jsonb, expected_conduct = $3 where id = $1`, [qid, JSON.stringify(q.options), q.expected_conduct]);
    }
    const analise = (await sql(`insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis, reviewed_at)
      values ($1, 1, 'Pede a conduta.', 'x', 'published', 'B', now()) returning id`, [QA]))[0].id;
    await sql(`insert into public.question_option_analysis (analysis_id, question_id, option_id, is_official_correct, distractor_kind, reasoning, why_wrong)
      values ($1, $2, 'A', false, 'WRONG', 'Distrator.', $3)`, [analise, QA, `Como diz o ${TITULO}, não é isso.`]);
    ids.Q_analise = QA;
    const analiseB = (await sql(`insert into public.question_analysis (question_id, version, question_core, basis_hash, status, official_answer_at_analysis, reviewed_at)
      values ($1, 1, 'Pede a conduta.', 'y', 'published', 'B', now()) returning id`, [QB]))[0].id;
    ids.C_direto = analiseB;
    await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status) values ($1, $2, 1, 'full', $3::jsonb, 'h1', 'published')`,
      [QB, analiseB, JSON.stringify({ texto: `Conforme o ${TITULO}, suporte.` })]);
    await sql(`insert into public.question_comments (question_id, analysis_id, version, level, content, content_hash, status) values ($1, $2, 1, 'quick', $3::jsonb, 'h2', 'published')`,
      [QB, analiseB, JSON.stringify({ texto: `Resumo do caso.\n${TITULO}, capítulo 3.` })]);
    await sql(`insert into public.question_update_cards (question_id, version, temporal_status, impact_level, official_answer, current_answer, what_changed, reviewed_by)
      values ($1, 1, 'UPDATED_BUT_SAME_ANSWER', 'COMMENT_ONLY', 'B', 'B', $3, $2)`, [QB, ADMIN, `Segundo o ${TITULO}, a conduta foi mantida.`]);
    await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'questoes', $2, now())`, [ALUNA, [QA, QB]]);

    achados = await rpc(ADMIN, "app_ch_complementar_mentions");
  }, 60_000);

  it("acha aula (resumo e ponto-chave), podcast, atualização (pegadinha), análise e cartão publicados", () => {
    expect(achou("aula", ids.L_resumo)).toBe(true);
    expect(achou("aula", ids.L_ponto)).toBe(true);
    expect(achou("podcast", ids.P_fala)).toBe(true);
    expect(achou("atualizacao", ids.U_trap)).toBe(true);
    expect(achou("analise", ids.Q_analise)).toBe(true);
    expect(achou("cartao", QB)).toBe(true);
    expect(achou("comentario", ids.C_direto)).toBe(true);
  });
  it("(2026-10-11) texto médico com 'sangue nos olhos' e a palavra 'apostila' soltos NÃO entra na varredura", () => {
    expect(achou("aula", ids.L_livre)).toBe(false);
    expect(achou("podcast", ids.P_livre)).toBe(false);
  });
  it("(2026-10-11) e a aluna lê esse texto inteiro, sem nada retirado", async () => {
    const aula = await rpc(ALUNA, "app_lesson", { p_id: ids.L_livre });
    expect(aula.summary).toContain("sangue nos olhos");
    expect(aula.summary).toContain("apostila do curso");
    const pod = await rpc(ALUNA, "app_podcast", { p_id: ids.P_livre });
    expect(JSON.stringify(pod.lines)).toContain("sangue nos olhos");
    expect(JSON.stringify(pod.lines)).toContain("apostila do curso");
  });
  it("conteúdo limpo não aparece; o rascunho aparece MARCADO como não publicado (APOIO-B: a varredura olha o que já está gravado, publicado ou não)", () => {
    expect(achou("aula", ids.L_limpa)).toBe(false);
    expect(achou("podcast", ids.P_limpo)).toBe(false);
    expect(achados.find((a) => a.kind === "aula" && String(a.id) === String(ids.L_rascunho))?.publicado).toBe(false);
    expect(achados.find((a) => a.kind === "podcast" && String(a.id) === String(ids.P_rascunho))?.publicado).toBe(false);
    expect(achados.find((a) => a.kind === "aula" && String(a.id) === String(ids.L_resumo))?.publicado).toBe(true);
  });
  vaza("IMPORTANTE: 'Sangue nos Olhos' no começo de uma linha do roteiro (\\n no JSON) escapa da varredura", () => {
    expect(achou("podcast", ids.P_quebra)).toBe(true);
  });
  vaza("IMPORTANTE: 'SangueNosOlhos' colado no resumo da aula escapa da varredura", () => {
    expect(achou("aula", ids.L_camel)).toBe(true);
  });
  vaza("CRÍTICO: aula com instrutor 'Equipe Sangue nos Olhos' não é varrida (campo instructor fora da varredura)", () => {
    expect(achou("aula", ids.L_instrutor)).toBe(true);
  });
  vaza("CRÍTICO: atualização com selo 'Sangue nos Olhos 2026' (publication_label) não é varrida", () => {
    expect(achou("atualizacao", ids.U_rotulo)).toBe(true);
  });
  vaza("CRÍTICO: flashcards da atualização não são varridos", () => {
    expect(achou("atualizacao", ids.U_flash)).toBe(true);
  });
  vaza("CRÍTICO: linha do tempo da atualização não é varrida", () => {
    expect(achou("atualizacao", ids.U_linha)).toBe(true);
  });
  vaza("CRÍTICO: explicação da alternativa e conduta esperada da QUESTÃO não são varridas (tabela questions fora da varredura)", () => {
    expect(achados.some((a) => String(a.id) === QB && a.kind !== "cartao" && a.kind !== "comentario")).toBe(true);
  });
  vaza("IMPORTANTE: comentário com 'Sangue nos Olhos' depois de quebra de linha escapa (o jsonb vira texto com \\n)", () => {
    // os dois comentários são da mesma análise: a varredura devolve um item por comentário; o segundo (quick) não aparece
    expect(achados.filter((a) => a.kind === "comentario" && String(a.id) === ids.C_direto)).toHaveLength(2);
  });

  it("o que a aluna RECEBE hoje (prova de que não há filtro na leitura do texto livre)", async () => {
    const corr = await rpc(ALUNA, "practice_correction_view", { p_question_id: QB, p_selected: "A" });
    const aula = await rpc(ALUNA, "app_lesson", { p_id: ids.L_instrutor });
    const atual = await rpc(ALUNA, "app_guideline_update", { p_slug: "t2-u-flash" });
    const pod = await rpc(ALUNA, "app_podcast", { p_id: ids.P_fala });
    // corrigido: a leitura do aluno retira o texto livre que cita a apostila (nada é apagado no banco)
    expect(JSON.stringify(corr)).not.toMatch(/Sangue nos Olhos/);
    expect(aula.instructor ?? null).toBeNull();
    expect(JSON.stringify(atual.flashcards)).not.toContain("Sangue nos Olhos");
    expect(JSON.stringify(pod.lines)).not.toContain("Sangue nos Olhos");
  });
});

// =====================================================================================================================
// 5. MARCA GUARDADA DESATUALIZADA e TÍTULO GENÉRICO (rodam por último: mexem na biblioteca)
// =====================================================================================================================
describe("5. marca guardada e título genérico", () => {
  vaza("IMPORTANTE: fonte complementar cadastrada DEPOIS (nível E, nasce complementar) não esconde a diretriz de aula já digitada", async () => {
    const aula = (await sql(`insert into public.lessons (area, topic, title, guideline_title, published) values ('PEDIATRIA', 'Asma', 'Asma na prática', 'Manual Beta de Pediatria', true) returning id`))[0].id;
    expect((await rpc(ALUNA, "app_lesson", { p_id: aula })).guideline_title).toBe("Manual Beta de Pediatria"); // ainda não é complementar
    await sql(`insert into public.ch_sources (title, organ, authority_level) values ('Manual Beta de Pediatria', 'Editora Beta', 'E')`);
    // a fonte nasceu complementar, mas ninguém recalculou lessons.guideline_hidden
    expect((await rpc(ALUNA, "app_lesson", { p_id: aula })).guideline_title).toBeNull();
  });

  it("título complementar GENÉRICO ('Clínica Médica'): mede frases barradas e fontes oficiais escondidas", async () => {
    await sql(`insert into public.ch_sources (title, organ, authority_level) values ('Clínica Médica', 'Editora SNO', 'E')`);
    resetComplementarTermsCache();
    const termos = await loadComplementarTerms(contentDb);
    const barradas = FRASES_MEDICAS.map((f, i) => [i + 1, mentionsSupportMaterial(f, termos)] as const).filter(([, m]) => m.length).map(([n]) => n);
    expect(termos).not.toContain("Clínica Médica"); // título de 2 palavras curtas não vira termo de busca em texto livre
    expect(barradas).toEqual([]); // desde 2026-10-11 nem a expressão leiga é barrada
    let varridas = 0;
    for (const f of FRASES_MEDICAS) if (await varredura(f)) varridas++;
    expect(varridas).toBe(4); // as 4 frases da especialidade "Clínica Médica": a varredura do administrador é ampla de propósito (a equipe lê e decide)
    // fonte oficial com "Clínica Médica" no nome some da lista do aluno
    const fica = async (item: unknown) => ((await comoAluna(`select public.ch_student_sources($1::jsonb) as r`, [JSON.stringify([item])]))[0].r as unknown[]).length === 1;
    expect(await fica({ title: "Diretriz Brasileira de Hipertensão", organization: "Sociedade Brasileira de Clínica Médica" })).toBe(true); // corrigido
    expect(await fica({ title: "Tratado de Clínica Médica", organization: "Ministério da Saúde" })).toBe(true); // corrigido
  });
});
