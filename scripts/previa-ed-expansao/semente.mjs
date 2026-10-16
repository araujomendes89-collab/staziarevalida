// Dados de TESTE da prévia da expansão (banco PGlite em memória). Tudo inventado para a prévia, nada vai para o app.
// Funciona no ramo de antes (main) e no de depois: não usa nada da formatação nova.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function semear({ sql, rpc, U, raiz }) {
  const dados = { erros: [] };
  const passo = async (nome, f) => {
    try {
      await f();
    } catch (e) {
      dados.erros.push(`${nome}: ${String(e?.message || e).slice(0, 200)}`);
    }
  };
  await sql(`update public.profiles set name = 'Equipe (prévia)' where id = $1`, [U.ADMIN]).catch(() => {});
  for (const a of ["GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "CLINICA_MEDICA", "CIRURGIA", "MFC", "SAUDE_MENTAL"])
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, $2) on conflict do nothing`, [U.REVISOR, a]).catch(() => {});

  // 1. Questão oficial (Revalida 2024/1, nº 1) com explicações, conduta e "o que avalia"
  await passo("questão oficial", async () => {
    const q = {
      kind: "REVALIDA", year: 2024, semester: 1, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo",
      statement: "Lactente de 4 meses com coriza há 3 dias e sibilância desde ontem, saturação de 95% em ar ambiente e boa aceitação alimentar. Qual a conduta mais adequada?",
      options: [
        { id: "A", text: "Salbutamol inalatório de horário.", explanation: "Incorreta. Broncodilatador não é recomendado de rotina na bronquiolite." },
        { id: "B", text: "Cuidados em casa com lavagem nasal e sinais de alerta.", explanation: "Correta. Sem sinais de gravidade, o tratamento é de suporte em casa." },
        { id: "C", text: "Radiografia de tórax e antibiótico.", explanation: "Incorreta. Exame de imagem e antibiótico não são de rotina." },
        { id: "D", text: "Corticoide oral por 5 dias.", explanation: "Incorreta. Corticoide não muda a evolução da bronquiolite." },
      ],
      correct_option: "B", status: "valid",
      expected_conduct: "Tratamento de suporte em casa, com orientação dos sinais de alerta.",
      inep_intent: "Reconhecer bronquiolite sem gravidade e evitar intervenções sem benefício.",
      needs_image: false,
    };
    await sql(`select public.admin_upsert_question($1::jsonb, true)`, [JSON.stringify(q)]);
    dados.questao = "revalida_2024_1_q001";
  });

  // 2. Sessão de treino da aluna com essa questão
  await passo("sessão da aluna", async () => {
    const s = await rpc(U.ALUNO, "app_start_session", { p_kind: "questoes", p_filters: { ids: [dados.questao] }, p_count: 1 });
    dados.sessao = typeof s === "string" ? s : s?.id ?? s?.session_id ?? null;
  });

  // 3. Questão inédita (rascunho) aguardando revisão médica
  await passo("questão inédita", async () => {
    const row = {
      batch: "previa-expansao", source_id: "previa-1", slot: 1, area: "PEDIATRIA", topic: null, title: "Otite média aguda no lactente",
      stem: "Lactente de 8 meses, 8 kg, com febre há 3 dias e diagnóstico de otite média aguda, sem alergia a antibióticos. Qual a conduta?",
      support_type: "NONE", support_title: null, support_rows: [],
      alternatives: { A: "Amoxicilina 90 mg/kg/dia por 10 dias.", B: "Observar por 48 horas sem antibiótico.", C: "Azitromicina dose única.", D: "Ceftriaxona intramuscular por 1 dia." },
      correct_answer: "A",
      explanation: "Em lactente com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
      alternative_explanations: { A: "Correta. Amoxicilina é a conduta inicial.", B: "Incorreta. Em menores de 2 anos a observação isolada não é a conduta.", C: "Incorreta. Não é a primeira escolha.", D: "Incorreta. Reservada para falha terapêutica." },
      clinical_decision: "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.",
      key_concepts: [], source_citations: [{ source_file: "Manual oficial.pdf", supported_claim: "Amoxicilina 90 mg/kg/dia por 10 dias." }],
      model: "previa", generated_by: "servidor",
    };
    const J = new Set(["support_rows", "alternatives", "alternative_explanations", "key_concepts", "source_citations"]);
    const cols = Object.keys(row);
    const [r] = await sql(`insert into public.draft_questions (${cols.join(", ")}) values (${cols.map((c, i) => `$${i + 1}${J.has(c) ? "::jsonb" : ""}`).join(", ")}) returning id`, cols.map((c) => (J.has(c) ? JSON.stringify(row[c]) : row[c])));
    dados.inedita = r.id;
  });

  // 4. Atualização: a de pré-eclâmpsia (vem das migrações como rascunho) fica aprovada e publicada só neste banco de teste
  await passo("atualização", async () => {
    const [u] = await sql(`select id, slug from public.guideline_updates order by (slug = 'prot-go-preeclampsia-2025') desc, slug limit 1`);
    await sql(`alter table public.guideline_updates disable trigger user`);
    await sql(`update public.guideline_updates set source_url = coalesce(source_url, 'https://www.gov.br/saude/pt-br/previa'), source_checked_at = now(), review_status = 'approved', reviewed_by = $2, reviewed_at = now(), review_note = 'Conferido (prévia).', published = true where id = $1`, [u.id, U.REVISOR]);
    await sql(`alter table public.guideline_updates enable trigger user`);
    dados.atualizacao = u.slug;
  });

  // 5. Podcast com roteiro pronto (duas vozes)
  await passo("podcast", async () => {
    const script = { lines: [
      { speaker: "ANA", text: "Hoje vamos falar de bronquiolite viral aguda no lactente.", style: "", sources: [] },
      { speaker: "BRUNO", text: "O diagnóstico é clínico e o tratamento, na maioria das vezes, é de suporte em casa.", style: "", sources: [] },
    ], missing: [] };
    const [p] = await sql(`insert into public.podcasts (title, topic, area, status, script) values ('Bronquiolite em 8 minutos', 'Bronquiolite', 'PEDIATRIA', 'script_ready', $1::jsonb) returning id`, [JSON.stringify(script)]);
    dados.podcast = p.id;
  });

  // 6. Aula publicada do Grande Tema GR-001 (pacote de teste do repositório), como no teste aulaAlunoBanco
  await passo("aula GR-001", async () => {
    const fx = (n) => JSON.parse(fs.readFileSync(path.join(raiz, "src/__tests__/fixtures", n), "utf8"));
    await sql(`update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`);
    for (const f of fx("aula-pronta-GR-001-v3-fontes.json").fontes) {
      const r = await rpc(U.ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } });
      await rpc(U.ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
    }
    const versao = (await rpc(U.EDITOR, "app_ch_import_lesson_package", { p_package: fx("aula-pronta-GR-001-v3.json") })).version_id;
    dados.versao = versao;
    await rpc(U.EDITOR, "app_ch_review_sheet_import", { p_version_id: versao, p_sheet: fx("ficha-revisor-GR-001-v3.json") });
    for (const n of [1, 2, 3, 4, 5, 6]) await rpc(U.ADMIN, "app_ch_review_decide", { p_version_id: versao, p_n: n, p_decision: "de_acordo" });
    await rpc(U.EDITOR, "app_ch_submit_for_review", { p_version_id: versao }).catch(() => undefined);
    await rpc(U.ADMIN, "app_ch_approve", { p_version_id: versao, p_kind: "medical", p_note: "ok" });
    const criticas = (await sql(`select c.id from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = $1 and cardinality(c.critical_kinds) > 0 and c.critical_checked_by is null`, [versao])).map((x) => x.id);
    for (const id of criticas) await rpc(U.ADMIN, "app_ch_confirm_critical", { p_claim_id: id });
    await rpc(U.EDITOR, "app_ch_approve", { p_version_id: versao, p_kind: "editorial" });
    for (const m of await sql(`select id, content_hash from public.ch_materials where unit_version_id = $1 and kind in ('lesson', 'visual_cards')`, [versao]))
      await sql(`select public.ch_worker_save_render($1::jsonb)`, [JSON.stringify({ material_id: m.id, format: "pdf", storage_path: `renders/${m.id}.pdf`, sha256: sha(m.id), template_version: "t", brand_version: "b", material_hash: m.content_hash, check_result: { ok: true } })]);
    await rpc(U.ADMIN, "app_admin_vigilance_set_gate", { p_mode: "aviso" });
    await rpc(U.ADMIN, "app_ch_unit_publish", { p_version_id: versao, p_options: { confirm_similar: true } });
    dados.tema = "GR-001";
  });
  return dados;
}
