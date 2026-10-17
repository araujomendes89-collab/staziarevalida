// @vitest-environment node
/**
 * TESTE ADVERSARIAL (APOIO-T), lado do SERVIDOR, das fontes complementares (apostila "Sangue nos Olhos"):
 *   1. Tutor por HTTP (POST /api/tutor/turn) com banco de desenvolvimento real (PGlite, todas as migrações) e IA simulada: a
 *      resposta ao aluno (texto, `sources`) e o histórico não trazem a apostila, mesmo quando a IA tenta citá-la.
 *   2. Voz do Tutor (transcrição): o que a voz disse é gravado no histórico do aluno.
 *   3. Conferência dos textos de IA voltados ao aluno (roteiro de podcast, resumo de aula, análise da questão, proposta de
 *      atualização, Tutor): cita a apostila → recusado/avisado; texto médico comum → passa (sem falso positivo).
 * Nada chama IA real nem rede: provedor simulado e banco em memória.
 * Vazamentos achados ficam como `vazamento(...)` (= it.fails: falha hoje de propósito; APOIO_MOSTRAR_VAZAMENTOS=1 mostra a falha real).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";
import { createTutorRouter } from "../../server/tutor/router";
import { voiceTranscript } from "../../server/tutor/realtime";
import { safetyCheck, type SafetyContext } from "../../server/tutor/safety";
import { loadComplementarTerms, mentionsSupportMaterial, resetComplementarTermsCache } from "../../server/contentHub/complementarGuard";
import { checkScript, type PodcastScript } from "../../server/podcasts/script";
import { analysisChecks, type Analysis, type QuestionForAnalysis } from "../../server/contentHub/questionAnalysis";
import { reanalysisChecks } from "../../server/contentHub/questionReanalysis";
import { aceitarTermos } from "./helpers/aceites";

const vazamento = process.env.APOIO_MOSTRAR_VAZAMENTOS === "1" ? it : it.fails;

const COMP_TITLE = "Sangue nos Olhos — Clínica Médica";
const COMP_ORGAN = "Editora Sangue nos Olhos";
const COMP_FILE = "SNO-ClinicaMedica-2026.pdf";
const FRASE = "FRASE-SECRETA-SNO";
const OFI_TITLE = "PCDT Hepatite B";
const OFI_ORGAN = "Ministério da Saúde";
const MARCAS = ["sangue", "apostila", "frase-secreta-sno", "sno-clinicamedica", "sno.pdf"];
const marcasEm = (t: string) => {
  const low = t.toLowerCase();
  const m = MARCAS.filter((x) => low.includes(x));
  if (/p\.\s*123\b|"page"\s*:\s*123\b/.test(t)) m.push("página 123");
  return m;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apoio-t-servidor-"));
const ADMIN = "00000000-0000-4000-8000-0000000000a7";
const ALUNA = "00000000-0000-4000-8000-0000000000c7";
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
let token: string;
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
  dev.db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
  });
const arg = (a: unknown) => (a !== null && typeof a === "object" && !Array.isArray(a) ? JSON.stringify(a) : a);
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map(arg))))[0].r;

const reply = (text: string, citations: { ref: string; quote: string }[] = []): TutorOutput => ({
  reply: text, grounding: citations.length ? "SOURCE" : "GENERAL", citations, evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [],
});
/** O que a IA simulada responde (troca por teste) e o que ela recebeu. */
let proxima: (input: string) => TutorOutput = () => reply("Oi.");
const recebido: string[] = [];
const deps: any = {
  mockRespond: (req: any) => {
    recebido.push(String(req.input ?? ""));
    return proxima(String(req.input ?? ""));
  },
  fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch,
};
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  process.env.TUTOR_AI_PROVIDER = "mock";
  resetComplementarTermsCache();
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'aluna@t.dev')`, [ADMIN, ALUNA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ALUNA]);
  await aceitarTermos(dev.db, ALUNA);
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true }, "Tutor ligado para o teste adversarial das fontes complementares.");
  // biblioteca: apostila (nível E → complementar) e a oficial, as duas com trecho sobre hepatite B
  const comp = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ($1, $2, 'final', '2026', 'E') returning id`, [COMP_TITLE, COMP_ORGAN]))[0].id;
  // a oficial com aprovação editorial: sem ela, a fonte nunca entra no Tutor (decisão 1 do dono, 17/10; migração 013620)
  const ofi = (await sql(`insert into public.ch_sources (title, organ, kind, version, authority_level, editorial_approved) values ($1, $2, 'final', '1', 'A', true) returning id`, [OFI_TITLE, OFI_ORGAN]))[0].id;
  await sql(`insert into public.ch_source_passages (source_id, page, section, text) values ($1, 123, 'Hepatite', $2), ($3, 12, 'Hepatite', 'Hepatite perinatal: vacina e imunoglobulina no recém-nascido nas primeiras horas.')`,
    [comp, `${FRASE} hepatite perinatal vacina imunoglobulina recém-nascido`, ofi]);
  deps.db = db;
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
  token = await dev.createSession(ALUNA);
}, 300_000);
afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.TUTOR_AI_PROVIDER;
});

describe("Tutor por HTTP (POST /api/tutor/turn) com banco real e IA simulada", () => {
  let sessao: string;
  it("a base enviada à IA traz a fonte oficial e não a apostila; a resposta (texto e sources) traz só a oficial", async () => {
    sessao = (await rpc(ALUNA, "app_tutor_start", "livre", "Hepatite perinatal", null, { type: "free" }, "durao")).id;
    proxima = () => reply("Na hepatite perinatal o recém-nascido recebe vacina e imunoglobulina nas primeiras horas.", [{ ref: "F1", quote: "vacina e imunoglobulina no recém-nascido" }]);
    recebido.length = 0;
    const r = await post("/turn", { session_id: sessao, action: "message", text: "Como fica a hepatite perinatal no recém-nascido?" });
    expect(r.status, r.text).toBe(200);
    expect(marcasEm(r.text)).toEqual([]);
    const body = JSON.parse(r.text);
    expect(body.message.sources.map((s: any) => s.label).join(" ")).toContain(OFI_TITLE);
    expect(recebido.join("\n")).toContain(OFI_TITLE);
    expect(marcasEm(recebido.join("\n"))).toEqual([]);
  });

  it("a IA insiste em citar a apostila: a resposta é refeita e cai na resposta fixa; nada da apostila chega ao aluno nem ao histórico", async () => {
    proxima = () => reply(`Segundo a apostila ${COMP_TITLE}, vacina e imunoglobulina.`);
    const r = await post("/turn", { session_id: sessao, action: "message", text: "E o que diz o material?" });
    expect(r.status, r.text).toBe(200);
    expect(marcasEm(r.text)).toEqual([]);
    const hist = await rpc(ALUNA, "app_tutor_session", sessao);
    expect(marcasEm(JSON.stringify(hist))).toEqual([]);
  });

  vazamento("VAZAMENTO (voz): o que a voz do Tutor falou citando a apostila é gravado como está no histórico do aluno, e a correção mandada à voz não pede para retirar a citação", async () => {
    // causa: server/tutor/realtime.ts:468-471 grava `p_tutor: clean` mesmo com a violação cites_support_material; e a montagem de
    // `correction` (realtime.ts:474-481) não tem frase para cites_support_material (sai só "CORREÇÃO OBRIGATÓRIA, diga já...").
    const call = "00000000-0000-4000-8000-00000000ca11";
    const gravado: any[] = [];
    const fake: any = {
      db: {
        service: async (fn: string, args: any) => {
          if (fn === "ch_worker_tutor_voice_call") return { id: call, session_id: sessao, user_id: ALUNA, status: "open", model: "x", call_id: "c" };
          if (fn === "ch_worker_tutor_context") return null;
          if (fn === "ch_worker_complementar_terms") return [COMP_TITLE, COMP_ORGAN];
          if (fn === "ch_worker_tutor_settings") return {};
          if (fn === "ch_worker_tutor_append") { gravado.push(args); return { id: 1 }; }
          return null;
        },
      },
    };
    resetComplementarTermsCache();
    const r = await voiceTranscript(fake, ALUNA, call, "tutor", "Como diz o Sangue nos Olhos, vacina e imunoglobulina.");
    resetComplementarTermsCache();
    expect(gravado[0]?.p_meta?.violations).toContain("cites_support_material"); // a violação é reconhecida (ok)…
    expect.soft(marcasEm(String(gravado[0]?.p_tutor ?? ""))).toEqual([]); // …mas o texto vai cru ao histórico: FALHA
    expect.soft(r.correction ?? "").toMatch(/material|apostila|fonte/i); // …e a correção não manda retirar a citação: FALHA
  });
});

// =====================================================================================================================
// textos de IA voltados ao aluno
// =====================================================================================================================
describe("conferência dos textos de IA voltados ao aluno", () => {
  let termos: string[];
  beforeAll(async () => {
    resetComplementarTermsCache();
    termos = await loadComplementarTerms(db); // do banco: título e órgão cadastrados da apostila (sem termo fixo)
    resetComplementarTermsCache();
  });

  // (2026-10-11) citam o NOME CADASTRADO (título completo / editora): barrados
  const CITAM = [
    `Como ensina o ${COMP_TITLE}, não espere o anti-HBs.`,
    `No ${COMP_TITLE} isso aparece na página 123.`,
    "Pela Editora Sangue nos Olhos, a dose é única.",
    "SANGUE-NOS-OLHOS-CLÍNICA-MÉDICA: vacina e imunoglobulina.",
  ];
  // (2026-10-11) a expressão solta e a palavra "apostila" soltas NÃO são mais barradas (texto médico legítimo)
  const SOLTOS = [
    "Segundo a apostila, a conduta é vacina e imunoglobulina.",
    "Como ensina o Sangue nos Olhos, não espere o anti-HBs.",
    "Nas apostilas de clínica isso cai muito.",
    "SANGUE-NOS-OLHOS: vacina e imunoglobulina.",
    "Paciente com sangue nos olhos após tosse forte: hemorragia subconjuntival, conduta expectante.",
  ];
  const LIMPOS = [
    "Na hepatite B perinatal, o recém-nascido recebe vacina e imunoglobulina nas primeiras 12 horas.",
    "Hemorragia digestiva alta: estabilize, faça endoscopia em até 24 horas.",
    "Olhos vermelhos com secreção purulenta sugerem conjuntivite bacteriana.",
    "Coleta de sangue para hemocultura antes do antibiótico.",
    "O material biológico deve ser descartado em recipiente próprio.",
    "Revise a clínica médica do paciente idoso com polifarmácia.",
    "Faça o resumo do capítulo e confira as páginas citadas pela diretriz oficial.",
    "O PCDT de Hepatite B do Ministério da Saúde recomenda tenofovir na gestação.",
  ];

  it("cita a apostila → o Tutor barra, o roteiro do podcast avisa, a análise e a proposta de atualização falham", () => {
    const ctx: SafetyContext = { blocks: [], conversationTexts: [], hintLevel: null, hasUpdateCard: false, profanity: "off", supportTerms: termos } as any;
    const roteiro = (t: string): PodcastScript => ({ lines: [{ speaker: "ANA", text: t, style: "", sources: [1] }], missing: [] });
    const chunks = new Map([[1, { id: 1, source: "Material", doc: 1, page: 1, text: "vacina e imunoglobulina" }]]);
    for (const t of CITAM) {
      expect(mentionsSupportMaterial(t, termos), t).not.toEqual([]);
      expect(safetyCheck(reply(t), ctx).violations.map((v) => v.code), t).toContain("cites_support_material");
      expect(checkScript(roteiro(t), chunks, undefined, termos).map((w) => w.kind), t).toContain("cites_material");
    }
    expect(analysisChecks(questao, analise(CITAM[0]), termos).map((f) => f.code)).toContain("cites_support_material");
    expect(reanalysisChecks(entrada, proposta(CITAM[2]), termos).map((f) => f.code)).toContain("cites_support_material");
  });

  it("texto médico comum passa em todas as conferências (sem falso positivo)", () => {
    const ctx: SafetyContext = { blocks: [], conversationTexts: [], hintLevel: null, hasUpdateCard: false, profanity: "off", supportTerms: termos } as any;
    for (const t of [...LIMPOS, ...SOLTOS]) {
      expect(mentionsSupportMaterial(t, termos), t).toEqual([]);
      expect(safetyCheck(reply(t), ctx).violations.map((v) => v.code), t).not.toContain("cites_support_material");
    }
    expect(analysisChecks(questao, analise(LIMPOS[0]), termos).map((f) => f.code)).not.toContain("cites_support_material");
  });

  it("CORRIGIDO (decisão do dono, 2026-10-11): 'sangue nos olhos' como queixa clínica (hemorragia subconjuntival) NÃO é mais tratado como citação da apostila", () => {
    expect(mentionsSupportMaterial("Paciente com sangue nos olhos após tosse forte: hemorragia subconjuntival, conduta expectante.", termos)).toEqual([]);
  });

  vazamento("VAZAMENTO (texto de IA): nome do arquivo, sigla, link sem a palavra apostila e paráfrase passam pela conferência", () => {
    // causa: complementarGuard.ts mentionsSupportMaterial só conhece título, órgão, "Sangue nos Olhos" e a palavra "apostila";
    // ch_worker_complementar_terms (9620:120-128) não inclui nome de arquivo (ch_documents.name), link nem sigla
    for (const t of [`Veja o ${COMP_FILE}, página 123.`, "Isso está no SNO de clínica.", "Fonte: https://cdn.exemplo/sno.pdf p. 123", "No livro do cursinho de clínica, página 123."]) {
      expect(mentionsSupportMaterial(t, termos), t).not.toEqual([]);
    }
  });
});

// ---- apoio dos testes de análise/atualização
const questao = {
  id: "q1", exam_id: "e", exam_year: 2024, number: 1, area: "PEDIATRIA", statement: "Gestante HBsAg reagente.", correct_option: "B", images: [],
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: null })), official: { answer: "B", status: "FINAL", source: null }, dna: null, basis_hash: "x",
} as unknown as QuestionForAnalysis;
function analise(trap: string): Analysis {
  return {
    question_core: "Pede a conduta no recém-nascido.", key_data: [{ text: "HBsAg reagente", role: "CRITICAL" }], reasoning_types: [], difficulty: 2, difficulty_components: {},
    trap, golden_rule: "Vacina e imunoglobulina cedo.", pedagogy: { teaches: "", why_important: "", cognitive_error: "", review_if_wrong: "" }, guideline_dependency: { depends: false, topics: [] },
    options: ["A", "B", "C", "D"].map((id) => ({
      option_id: id, is_official_correct: id === "B", distractor_kind: id === "B" ? "CORRECT" : "WRONG", reasoning: "Porque o quadro pede proteção imediata.",
      why_plausible: "Parece razoável no início.", why_wrong: "Não protege o recém-nascido da transmissão vertical.", when_correct: "Em outro quadro clínico.",
      concept_difference: "Conceito diferente.", error_types: id === "B" ? [] : ["WRONG_CONCEPT"], trap: "", quality: 80,
    })),
  } as unknown as Analysis;
}
const entrada: any = { question_id: "q1", statement: "x", options: [], changes: [], correct_option: "B", official: { answer: "B" } };
const proposta = (t: string): any => ({ assessment: "INCONCLUSIVE", impact_level: "NO_IMPACT", current_answer: "NONE", what_changed: t, why_it_matters: "", options_affected: [], citations: [], confidence: 10 });
