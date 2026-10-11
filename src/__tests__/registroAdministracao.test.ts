// @vitest-environment node
/**
 * Administração › Registro (src/novo/app/admin/auditLog.js), polimento de 10/10/2026: o dono lê o Registro em português.
 *  - Toda ação que alguma migração grava no registro (admin_audit_log) tem nome em português: o teste lê as migrações.
 *  - Questões (…7700): "Gabarito oficial registrado" e "Explicações marcadas como revisadas", com a questão, o gabarito,
 *    a fonte e o motivo em linguagem simples.
 *  - Atualizações (…7800): a retirada feita pela própria migração aparece como "Retirada automática pela regra nova", com o
 *    tema e o motivo, e não como "conta excluída" (também nas linhas gravadas por uma versão anterior daquele SQL, sem a
 *    marca "automatica": a tela reconhece pelo motivo gravado, sem mexer nos dados do banco). As outras retiradas mostram
 *    o tema e o motivo em linguagem simples. Nenhum código interno aparece (ação, situação em inglês, identificador).
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ACTION_LABEL, AI_FUNCTION_NAME, auditActor, auditLabel, auditSummary, PROVIDER_NAME } from "../novo/app/admin/auditLog.js";
import { PROVIDER_NAME as CENTRAL_PROVIDER_NAME } from "../novo/app/admin/ai/aiApi.js";

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const UUID = "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b";
const AUTO_MOTIVO = "Estava publicada sem conferência médica aprovada: retirada do ar pela correção de 10/10/2026.";
const INTERNAL = /guideline_update|question\.|questions\.|official_answer|explanations_reviewed|explanation_|expected_conduct|automatica|review_status|\bpending\b|\bapproved\b|\brejected\b|CHANGED_AFTER_APPEAL|ANNULLED|ANULADA|revalida_|enamed_|correção de 10\/10\/2026/;

/** Ações que as migrações gravam no registro da Administração: public.admin_log(…) e insert direto em admin_audit_log. */
function actionsInMigrations() {
  const found = new Map<string, string>(); // ação → migração que gravou primeiro
  const dynamic: string[] = [];
  const unreadable: string[] = []; // gravação cuja ação não está escrita no SQL (o leitor não saberia o nome)
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    const bodies = [
      ...[...sql.matchAll(/(?<!function )public\.admin_log\(([\s\S]*?)\);/g)].map((m) => m[1]),
      ...[...sql.matchAll(/insert\s+into\s+public\.admin_audit_log\s*\(actor_id,\s*action,\s*target,\s*details\)([\s\S]*?);/g)].map((m) => m[1]),
    ];
    for (const body of bodies) {
      if (/\bp_action\b/.test(body)) continue; // a própria public.admin_log (grava a ação que recebe)
      const literal = [...body.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)].map((m) => m[1]);
      const built = [...body.matchAll(/'[a-z_]+\.'\s*\|\|\s*\w+/g)].map((m) => m[0]);
      for (const action of literal) if (!found.has(action)) found.set(action, file);
      dynamic.push(...built);
      if (literal.length === 0 && built.length === 0) unreadable.push(`${file}: ${body.slice(0, 80)}`);
    }
  }
  return { found, dynamic, unreadable };
}

describe("Registro: nome em português para toda ação gravada", () => {
  it("cada ação que alguma migração grava no registro tem nome em português (sem o código)", () => {
    const { found, dynamic, unreadable } = actionsInMigrations();
    expect(unreadable).toEqual([]);
    // 'question.' || v_result: v_result vem de admin_upsert_question chamada com p_update = true ('inserted' ou 'updated')
    expect(new Set(dynamic)).toEqual(new Set(["'question.' || v_result"]));
    const actions = [...found.keys(), "question.inserted", "question.updated"];
    // o leitor das migrações acha as ações (se ele quebrar, o teste não pode passar sem conferir nada)
    expect(actions).toEqual(expect.arrayContaining([
      "question.official_answer", "question.explanations_reviewed", "questions.import", "guideline_update.unpublish",
      "ai.provider", "ai.price", "tutor.voice.approve", "podcast.audio", "lesson.material.delete", "gamification.recalculate",
    ]));
    expect(found.size).toBeGreaterThanOrEqual(38); // 38 escritas no SQL em 10/10/2026, mais as 2 montadas acima
    const missing = actions.filter((a) => !(ACTION_LABEL as Record<string, string>)[a]).map((a) => `${a} (${found.get(a) ?? "dinâmica"})`);
    expect(missing).toEqual([]);
    for (const action of actions) {
      const label = auditLabel({ action, details: {} });
      expect(label).toBe((ACTION_LABEL as Record<string, string>)[action]);
      expect(label, action).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^._]*$/);
    }
  });

  it("uma ação nova, ainda sem nome, aparece em português (sem o código)", () => {
    expect(auditLabel({ action: "question.nova_acao", details: {} })).toBe("Outra ação em Questões");
    expect(auditLabel({ action: "podcast.algo.novo", details: {} })).toBe("Outra ação em Podcasts");
    expect(auditLabel({ action: "xyz.abc", details: {} })).toBe("Outra ação da administração");
  });
});

describe("Registro: Questões (gabarito oficial e explicações revisadas)", () => {
  it("gabarito oficial registrado: questão, gabarito, situação, fonte, motivo e respostas corrigidas de novo", () => {
    const entry = {
      action: "question.official_answer", target: "revalida_2025_1_q045", actor: "adm@t.dev",
      details: { status: "CHANGED_AFTER_APPEAL", answer: "B", from: "C", version: 2, source: "Gabarito definitivo do INEP, 12/10/2026", reason: "Recurso aceito pela banca", recorrected: 12 },
    };
    expect(auditLabel(entry)).toBe("Gabarito oficial registrado");
    expect(auditSummary(entry)).toBe("Revalida 2025/1, questão 45 · Gabarito B, alterado após recurso (antes era C) · Fonte: Gabarito definitivo do INEP, 12/10/2026 · Motivo: Recurso aceito pela banca · 12 respostas de alunos corrigidas de novo");
    expect(auditActor(entry)).toBe("adm@t.dev");
    const same = { ...entry, details: { ...entry.details, status: "FINAL", from: "B", recorrected: 0 } };
    expect(auditSummary(same)).toBe("Revalida 2025/1, questão 45 · Gabarito B, definitivo · Fonte: Gabarito definitivo do INEP, 12/10/2026 · Motivo: Recurso aceito pela banca");
    const one = { ...entry, details: { ...entry.details, recorrected: 1 } };
    expect(auditSummary(one)).toMatch(/· 1 resposta de aluno corrigida de novo$/);
    const annulled = { action: "question.official_answer", target: "enamed_2024_q007", actor: "adm@t.dev", details: { status: "ANNULLED", answer: null, from: "B", source: "Gabarito definitivo", reason: "Anulada pela banca", recorrected: 0 } };
    expect(auditSummary(annulled)).toBe("ENAMED 2024, questão 7 · Questão anulada pela banca · Fonte: Gabarito definitivo · Motivo: Anulada pela banca");
    for (const e of [entry, same, one, annulled]) expect(auditSummary(e)).not.toMatch(INTERNAL);
  });

  it("explicações marcadas como revisadas: a troca de gabarito e o que foi revisado, com nomes da tela", () => {
    const entry = {
      action: "question.explanations_reviewed", target: "revalida_2025_1_q045", actor: "ed@t.dev",
      details: { review: { de: "C", para: "B", campos: ["analise", "expected_conduct", "explanation_B", "explanation_C"], desde: "2026-10-10T12:00:00Z", por: UUID, motivo: "Recurso", fonte: "INEP" } },
    };
    expect(auditLabel(entry)).toBe("Explicações marcadas como revisadas");
    expect(auditSummary(entry)).toBe("Revalida 2025/1, questão 45 · Gabarito mudou de C para B · Revisadas: análise publicada, conduta esperada, explicação da B, explicação da C");
    const unannulled = { ...entry, details: { review: { de: "ANULADA", para: "A", campos: ["explanation_A"] } } };
    expect(auditSummary(unannulled)).toBe("Revalida 2025/1, questão 45 · Gabarito mudou de anulada pela banca para A · Revisadas: explicação da A");
    for (const e of [entry, unannulled]) expect(auditSummary(e)).not.toMatch(INTERNAL);
    expect(auditSummary(entry)).not.toContain(UUID);
  });

  it("questão criada ou editada mostra a prova e o número; importação em linguagem simples", () => {
    expect(auditSummary({ action: "question.updated", target: "revalida_2025_1_q045", details: { status: "valid", reason: "assistente de IA" } }))
      .toBe("Revalida 2025/1, questão 45 · Motivo: assistente de IA");
    expect(auditSummary({ action: "question.inserted", target: "enamed_2024_q007", details: { status: "annulled" } })).toBe("ENAMED 2024, questão 7 · Situação: Anulada");
    expect(auditSummary({ action: "question.updated", target: "q-antiga-12", details: { status: "valid" } })).toBe("Questão q-antiga-12");
    expect(auditSummary({ action: "questions.import", details: { inserted: 3, updated: 1, skipped: 0, answer_differs: 2, update_existing: true } }))
      .toBe("3 novas · 1 atualizada · 0 puladas · 2 com gabarito ou situação diferente (não mudaram)");
    expect(auditSummary({ action: "questions.import", details: { inserted: 1, updated: 0, skipped: 2, update_existing: false } })).toBe("1 nova · 0 atualizadas · 2 puladas");
  });
});

describe("Registro: retiradas de atualizações (tema e motivo em linguagem simples)", () => {
  const TOPIC = "Rastreamento do câncer do colo do útero com DNA-HPV";

  it("a retirada feita pela migração 7800 aparece como retirada automática pela regra nova, com o tema (com ou sem a marca)", () => {
    const marked = { action: "guideline_update.unpublish", target: UUID, actor: null, details: { topic: TOPIC, review_status: "pending", automatica: true, motivo: AUTO_MOTIVO } };
    // gravada por uma versão anterior do SQL da 7800 (sem a marca "automatica"), como pode estar no banco do site
    const unmarked = { action: "guideline_update.unpublish", target: UUID, actor: null, details: { topic: TOPIC, review_status: "pending", motivo: AUTO_MOTIVO } };
    for (const entry of [marked, unmarked]) {
      expect(auditLabel(entry)).toBe("Retirada automática pela regra nova");
      expect(auditSummary(entry)).toBe(`Tema: ${TOPIC} · Motivo: estava publicada sem conferência médica aprovada; pela regra nova, só fica no ar o que um revisor médico conferiu`);
      expect(auditActor(entry)).toBe("automático");
      expect(`${auditLabel(entry)} ${auditSummary(entry)} ${auditActor(entry)}`).not.toMatch(INTERNAL);
      expect(auditSummary(entry)).not.toContain(UUID);
    }
  });

  it("texto alterado, recusa na conferência e retirada pelo administrador: tema e motivo, sem código", () => {
    const text = { action: "guideline_update.unpublish", target: UUID, actor: "ed@t.dev", details: { topic: "Pré-eclâmpsia", motivo: "Texto alterado depois da conferência: saiu do ar até nova conferência." } };
    expect(auditLabel(text)).toBe("Atualização tirada do ar");
    expect(auditSummary(text)).toBe("Tema: Pré-eclâmpsia · Motivo: o texto mudou depois da conferência médica; fica fora do ar até um revisor médico conferir de novo");
    const rejected = { action: "guideline_update.unpublish", target: UUID, actor: "rev@t.dev", details: { topic: "Pré-eclâmpsia", motivo: "Recusada na conferência médica: saiu do ar na hora.", note: "Conduta não confere com a versão vigente." } };
    expect(auditLabel(rejected)).toBe("Atualização tirada do ar");
    expect(auditSummary(rejected)).toBe("Tema: Pré-eclâmpsia · Motivo: recusada na conferência médica · Nota do revisor: Conduta não confere com a versão vigente.");
    const manual = { action: "guideline_update.unpublish", target: UUID, actor: "adm@t.dev", details: { topic: "Pré-eclâmpsia", review_status: "approved" } };
    expect(auditSummary(manual)).toBe("Tema: Pré-eclâmpsia · Motivo: o administrador tirou do ar");
    // sem autor e sem o motivo da regra nova: foi uma pessoa cuja conta foi apagada depois
    const gone = { ...manual, actor: null };
    expect(auditLabel(gone)).toBe("Atualização tirada do ar");
    expect(auditActor(gone)).toBe("conta excluída");
    for (const entry of [text, rejected, manual, gone]) {
      expect(auditSummary(entry)).not.toMatch(INTERNAL);
      expect(auditSummary(entry)).not.toContain(UUID);
    }
  });

  it("publicar e apagar mostram o tema e a conferência em português", () => {
    expect(auditSummary({ action: "guideline_update.publish", target: UUID, details: { topic: "Pré-eclâmpsia", review_status: "approved" } })).toBe("Tema: Pré-eclâmpsia · Conferência médica aprovada");
    // antes da regra nova dava para publicar sem conferência: o Registro antigo diz isso em português
    expect(auditSummary({ action: "guideline_update.publish", target: UUID, details: { topic: TOPIC, review_status: "pending" } })).toBe(`Tema: ${TOPIC} · Publicada sem conferência médica aprovada`);
    expect(auditSummary({ action: "guideline_update.delete", target: UUID, details: { topic: "Atualização de teste" } })).toBe("Tema: Atualização de teste");
  });
});

describe("Registro: outras ações mostram o que tem nome (título, tema, nota), sem identificadores", () => {
  it("aulas, podcasts, Stazia Arena, Tutor, Central de IAs e configurações", () => {
    const cases: [any, string][] = [
      [{ action: "lesson.save", target: UUID, details: { title: "Bronquiolite viral aguda", area: "PEDIATRIA" } }, "Bronquiolite viral aguda"],
      [{ action: "lesson.material", target: UUID, details: { title: "Diretriz da SBP", kind: "pdf" } }, "Material: Diretriz da SBP"],
      [{ action: "podcast.save", target: UUID, details: { title: "Episódio 1: sepse" } }, "Episódio 1: sepse"],
      [{ action: "podcast.source", target: UUID, details: { kind: "pdf", title: "Manual de sepse" } }, "Fonte: Manual de sepse"],
      [{ action: "podcast.approve", target: UUID, details: { note: "Roteiro conferido." } }, "Nota: Roteiro conferido."],
      [{ action: "podcast.script.edit", target: UUID, details: { lines: 24 } }, "24 falas"],
      [{ action: "podcast.audio", target: UUID, details: { seconds: "500", voice: "x" } }, "Duração: 8 min 20 s"],
      [{ action: "gamification.achievement", target: "maratonista", details: { slug: "maratonista", name: "Maratonista" } }, "Maratonista"],
      [{ action: "gamification.mission", target: "m1", details: { slug: "m1", title: "Responder 20 questões" } }, "Responder 20 questões"],
      [{ action: "gamification.reward", target: "r1", details: { slug: "r1", name: "Moldura dourada" } }, "Moldura dourada"],
      [{ action: "tutor.config", target: "tutor", details: { reason: "Ajuste do limite diário" } }, "Motivo: Ajuste do limite diário"],
      [{ action: "tutor.personality", target: "tutor", details: { id: "acolhedor", active: false, reason: "Teste interno" } }, "Desligado · Motivo: Teste interno"],
      [{ action: "tutor.voice.approve", target: "tutor", details: { voice: "durona", fingerprint: "f".repeat(64), scenarios: ["a"] } }, "Voz: Durona"],
      [{ action: "tutor.voice.revoke", target: "tutor", details: { voice: "tranquilo" } }, "Voz: Tranquilo"],
      [{ action: "ai.provider", target: "gemini", details: { enabled: true } }, "Gemini: ligada"],
      [{ action: "ai.function", target: "assistente_preencher", details: { removed: true } }, "Assistente: preencher · configuração apagada (volta ao padrão do servidor)"],
      [{ action: "ai.function", target: "criacao", details: { mode: "comite", care: "caprichado" } }, "Criação"],
      [{ action: "ai.settings", target: "ai_settings", details: { monthly_cap_usd: 50, per_run_cap_usd: null, caps_enabled: true } }, "Teto do mês: US$ 50,00 · Teto por execução: sem teto · Tetos ligados"],
      [{ action: "ai.settings", target: "ai_settings", details: { tab_override_enabled: false } }, "Trocar a IA nas abas: não permitido"],
      [{ action: "ai.price", target: "anthropic:claude-teste", details: { input_per_mtok: 3, output_per_mtok: 15 } }, "Claude · claude-teste · entrada US$ 3,00 e saída US$ 15,00 por milhão de tokens"],
      [{ action: "settings.save", target: null, details: { trial_days: "7", announcement: { active: true, title: "Bem-vindo", text: "Oi", tone: "info" } } }, "Dias de teste grátis: 7 · Aviso no Início ligado: Bem-vindo"],
    ];
    for (const [entry, expected] of cases) {
      expect(auditSummary(entry), entry.action).toBe(expected);
      expect(auditSummary(entry)).not.toContain(UUID);
    }
  });
});

describe("Registro: toda ação tem resumo em linguagem simples (RG03)", () => {
  it("Stazia Arena: a regra mostra o nome como na aba e o valor; o recálculo diz de quem foi", () => {
    // o nome que o administrador vê na Administração é "Stazia Arena" (aba) e a regra aparece com a chave, como na aba Regras
    expect(auditLabel({ action: "gamification.rule", details: {} })).toBe("Regra da Stazia Arena alterada");
    expect(auditLabel({ action: "gamification.recalculate", details: {} })).toBe("Pontos de um aluno recalculados");
    expect(auditLabel({ action: "gamification.nova_coisa", details: {} })).toBe("Outra ação em Stazia Arena");
    expect(auditSummary({ action: "gamification.rule", target: "xp.question_correct", details: { value: 10, enabled: true } })).toBe("Regra xp.question_correct: valor 10");
    expect(auditSummary({ action: "gamification.rule", target: "flags.gamification_enabled", details: { value: false, enabled: true } })).toBe("Regra flags.gamification_enabled: desligada");
    expect(auditSummary({ action: "gamification.rule", target: "flags.gamification_enabled", details: { value: true, enabled: true } })).toBe("Regra flags.gamification_enabled: ligada");
    expect(auditSummary({ action: "gamification.rule", target: "limits.daily_xp", details: { value: { max: 500 }, enabled: false } })).toBe('Regra limits.daily_xp: valor {"max":500} · regra desativada');
    expect(auditSummary({ action: "gamification.recalculate", target: UUID, subject: "ana@t.dev", details: {} })).toBe("Aluno: ana@t.dev");
    expect(auditSummary({ action: "gamification.recalculate", target: UUID, subject: null, details: {} })).toBe("Aluno: conta excluída");
  });

  it("aulas e podcasts: o título vem do registro, também quando o item já foi apagado", () => {
    const aula = (action: string, extra: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({ action, target: UUID, title: "Bronquiolite viral aguda", details, ...extra });
    expect(auditSummary(aula("lesson.save", { title: undefined }, { title: "Bronquiolite viral aguda", area: "PEDIATRIA" }))).toBe("Bronquiolite viral aguda");
    expect(auditSummary(aula("lesson.delete"))).toBe("Bronquiolite viral aguda");
    expect(auditSummary(aula("lesson.material", {}, { title: "Slides da aula", kind: "slides" }))).toBe("Aula: Bronquiolite viral aguda · Material: Slides da aula");
    // o material apagado só deixa o código dele no registro: não há o que mostrar além do nome da ação
    expect(auditSummary({ action: "lesson.material.delete", target: UUID, title: null, details: {} })).toBe("");
    const ep = (action: string, details: Record<string, unknown> = {}) => ({ action, target: UUID, title: "Episódio 1: sepse", details });
    expect(auditSummary(ep("podcast.delete"))).toBe("Episódio 1: sepse");
    expect(auditSummary(ep("podcast.publish"))).toBe("Episódio 1: sepse");
    expect(auditSummary(ep("podcast.unpublish"))).toBe("Episódio 1: sepse");
    expect(auditSummary(ep("podcast.source", { kind: "pdf", title: "Manual de sepse" }))).toBe("Episódio: Episódio 1: sepse · Fonte: Manual de sepse");
    expect(auditSummary(ep("podcast.script.edit", { lines: 24 }))).toBe("Episódio 1: sepse · 24 falas");
    expect(auditSummary(ep("podcast.approve", { note: "Roteiro conferido." }))).toBe("Episódio 1: sepse · Nota: Roteiro conferido.");
    expect(auditSummary(ep("podcast.audio", { seconds: "500", provider: "openai" }))).toBe("Episódio 1: sepse · Duração: 8 min 20 s");
    expect(auditSummary(ep("podcast.audio", { seconds: "90", simulated: true }))).toBe("Episódio 1: sepse · Duração: 1 min 30 s · áudio de teste, sem voz de verdade");
    // sem título (item apagado antes de o registro guardar o título): só o nome da ação
    expect(auditSummary({ action: "podcast.delete", target: UUID, title: null, details: {} })).toBe("");
  });

  it("roteiro do podcast escrito pela IA: quem escreveu, quantos trechos das fontes e o custo; roteiro de teste é dito como teste", () => {
    const meta = { provider: "gemini", model: "gemini-2.5-pro", prompt_version: "v3", input_tokens: 9000, output_tokens: 3000, cost_usd: 0.0512, calls: 2, used_chunks: 12, total_chunks: 20, warnings: [], notes: null, seconds: 14, simulated: false };
    expect(auditSummary({ action: "podcast.script.ai", target: UUID, title: "Episódio 1: sepse", details: meta }))
      .toBe("Episódio 1: sepse · IA: Gemini (gemini-2.5-pro) · 12 de 20 trechos das fontes usados · custo US$ 0,0512");
    expect(auditSummary({ action: "podcast.script.ai", target: UUID, title: "Episódio 1: sepse", details: { ...meta, provider: "mock", simulated: true, cost_usd: 0 } }))
      .toBe("Episódio 1: sepse · Roteiro de teste, sem IA de verdade · 12 de 20 trechos das fontes usados");
    expect(auditSummary({ action: "podcast.script.ai", target: UUID, title: null, details: {} })).toBe("");
  });

  it("nenhuma ação deixa o resumo vazio por falta de tradução: só quando não há nenhum dado para mostrar", () => {
    // cada ação do SUMMARY mostra algo com os dados que o banco grava; o que depende de campo do registro (título, pessoa) mostra quando ele vem
    const withData: [string, any][] = [
      ["user.role", { target: UUID, details: { from: "student", to: "admin" } }],
      ["user.subscription", { target: UUID, details: { to: { plan: "pro", status: "active" } } }],
      ["tutor.config", { target: "tutor", details: { reason: "Ajuste do limite diário" } }],
      ["tutor.personality", { target: "tutor", details: { id: "durona", active: true, reason: "Voltou ao ar" } }],
      ["tutor.voice.approve", { target: "tutor", details: { voice: "direto" } }],
      ["gamification.rule", { target: "xp.question_correct", details: { value: 10, enabled: true } }],
      ["ai.provider", { target: "openai", details: { enabled: false } }],
    ];
    for (const [action, rest] of withData) expect(auditSummary({ action, ...rest }), action).not.toBe("");
  });
});

describe("Registro: os nomes de IA do Registro são os da Central de IAs", () => {
  it("as IAs (Claude, OpenAI, Gemini, Ollama) têm o mesmo nome da Central de IAs", () => {
    expect(PROVIDER_NAME).toEqual(CENTRAL_PROVIDER_NAME);
  });

  it("as funções de IA têm o mesmo nome da lista de AdminAI.jsx (se a Central ganhar uma função nova, o Registro precisa do nome dela)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../novo/app/admin/ai/AdminAI.jsx"), "utf8");
    const block = source.match(/const FUNCTIONS = \[([\s\S]*?)\];/)?.[1] ?? "";
    const pairs = [...block.matchAll(/\["([a-z_]+)",\s*"([^"]+)"\]/g)].map((m) => [m[1], m[2]]);
    expect(pairs.length).toBeGreaterThanOrEqual(6);
    expect(Object.fromEntries(pairs)).toEqual(AI_FUNCTION_NAME);
  });
});

describe("Registro: de quem foi o papel ou o plano alterado (RG02)", () => {
  it("papel e plano mostram a pessoa afetada; conta apagada diz conta excluída; sem a informação do banco, só a mudança", () => {
    const role = { action: "user.role", target: UUID, actor: "adm@t.dev", details: { from: "student", to: "admin" } };
    expect(auditSummary({ ...role, subject: "ana@t.dev" })).toBe("Pessoa: ana@t.dev · Aluno → Administrador");
    expect(auditSummary({ ...role, subject: null })).toBe("Pessoa: conta excluída · Aluno → Administrador");
    // banco ainda sem a função nova: não dá para dizer quem era (nem que a conta foi apagada)
    expect(auditSummary(role)).toBe("Aluno → Administrador");
    const plan = { action: "user.subscription", target: UUID, actor: "adm@t.dev", details: { to: { plan: "pro", status: "active" } } };
    expect(auditSummary({ ...plan, subject: "ana@t.dev" })).toBe("Pessoa: ana@t.dev · Pro · Ativo");
    expect(auditSummary({ ...plan, subject: null })).toBe("Pessoa: conta excluída · Pro · Ativo");
    expect(auditSummary(plan)).toBe("Pro · Ativo");
    // a exclusão já guarda o e-mail; o recálculo de pontos diz de qual aluno
    expect(auditSummary({ action: "user.delete", target: UUID, details: { email: "antigo@t.dev" } })).toBe("antigo@t.dev");
    expect(auditSummary({ action: "gamification.recalculate", target: UUID, subject: "ana@t.dev", details: {} })).toBe("Aluno: ana@t.dev");
    expect(auditSummary({ action: "gamification.recalculate", target: UUID, subject: null, details: {} })).toBe("Aluno: conta excluída");
    expect(auditSummary({ action: "gamification.recalculate", target: UUID, details: {} })).toBe("");
    for (const e of [{ ...role, subject: "ana@t.dev" }, { ...plan, subject: null }]) expect(auditSummary(e)).not.toContain(UUID);
  });
});
