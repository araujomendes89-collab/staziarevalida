// Substitui src/novo/app/session.jsx só na prévia: um "banco" em memória com as funções app_dupla_* que as telas usam.
// TUDO é DADO DE TESTE: colegas fictícios, notas fictícias. As 10 estações do INEP 2020 vêm do pacote de design (só locais).
import React from "react";
import ESTACOES from "./estacoes-inep2020-teste.json";
import CATALOGO from "./catalogo-cartoes.json";

const NOW = () => new Date().toISOString();
const EM = (ms) => new Date(Date.now() + ms).toISOString();

// Grau de dificuldade (013410): EXEMPLO DE TESTE só na prévia, para ver o selo. Não é classificação médica: no app, quem
// define é o revisor médico em Administração › Estações › Conferir. As estações 5 e 10 ficam sem grau (sem selo nenhum).
const DIFICULDADE_TESTE = ["medio", "facil", "dificil", "medio", null, "facil", "medio", "dificil", "facil", null];
const dificuldades = {};
const resumo = (s) => ({
  id: `teste-inep2020-e${String(s.n).padStart(2, "0")}`,
  name: s.name, topic: s.tags?.[0] ?? null, number: s.n, area: s.area, area_code: s.code, styles: s.tags ?? [],
  edition: "2020", reapplication: false, institution: "INEP", duration_ms: s.duration * 1000, is_pro_only: false,
  difficulty: (dificuldades[`teste-inep2020-e${String(s.n).padStart(2, "0")}`] ?? { level: DIFICULDADE_TESTE[s.n - 1] }).level,
  my_last_pct: s.n === 1 ? 74 : s.n === 4 ? 52 : null, average_pct: [61, 55, 70, 58, 49, 66, 72, 45, 60, 53][s.n - 1],
});
// Cartões do catálogo (013420/013425): só o título, a área e a origem; sem conteúdo, sem nota. A equipe os recebe (a prévia
// entra como administrador) e o filtro "Só com conteúdo" os esconde por padrão. Não é conteúdo médico.
const doCatalogo = (c) => ({
  id: c.id, name: c.tema, topic: c.tema, area: c.area, area_code: c.area_code, styles: [], number: null, edition: null,
  reapplication: false, institution: c.fonte_oficial ? "INEP" : null, origin_label: c.origem_rotulo, difficulty: null,
  content_status: c.situacao === "conteúdo pronto" ? "content_ready" : "awaiting_content", my_last_pct: null, average_pct: null,
});
const banco = () => [...ESTACOES.map(resumo).map((e) => ({ ...e, content_status: "content_ready" })), ...CATALOGO.map(doCatalogo)];
const BANCO = ESTACOES.map(resumo); // Administração › Estações da prévia: só as 10 de teste
const porId = (id) => ESTACOES.find((s) => resumo(s).id === id) ?? ESTACOES[0];

let perfil = {
  public_name: "Aluno de Teste", handle: "revalida.t3st", school: "Faculdade de Teste", city: "Cidade de Teste · UF", goal: "Treinar as estações de Ginecologia e Clínica",
  exam: "2026/2", bio: "Perfil de teste, sem pessoa real.", areas: ["GO", "CM"], role_pref: "any", pace: "cronometrado",
  days: ["Seg", "Qua", "Sex"], shifts: ["Noite"], radar_visible: true, show_school: true, show_stats: true,
};
const semPerfil = new URLSearchParams(location.search).get("perfil") === "nenhum";
if (semPerfil) perfil = null;
if (perfil && new URLSearchParams(location.search).get("cidade") === "nenhuma") perfil.city = ""; // "?cidade=nenhuma": perfil sem cidade (aba "Perto de você")

const colega = (id, nome, extra = {}) => ({
  user_id: id, public_name: nome, handle: "colega." + id.replace("t-", "teste"), school: "Faculdade de Teste", city: "Cidade de Teste · UF", exam: "2026/2", bio: "Colega fictício (dados de teste).",
  goal: "Treinar GO", areas: ["GO"], role_pref: "ator", pace: "cronometrado", days: ["Seg", "Qua"], shifts: ["Noite"], stats: { done: 3, avg: 7.8 },
  compat: 92, reasons: [{ icon: "check", text: "Ginecologia e Obstetrícia em comum", strong: true }, { icon: "check", text: "Papéis se completam" }], online: true, ...extra,
});
let baralho = [
  colega("t-1", "Colega Teste Um", { compat: 92 }),
  colega("t-2", "Colega Teste Dois", { compat: 78, areas: ["CM", "PED"], role_pref: "any", reasons: [{ icon: "check", text: "Clínica Médica em comum", strong: true }] }),
  colega("t-3", "Colega Teste Três", { compat: 63, areas: ["CR"], role_pref: "med", reasons: [{ icon: "alert", text: "Poucas áreas em comum", weak: true }] }),
  colega("t-4", "Colega Teste Quatro", { compat: 41, areas: ["MFC"], role_pref: "ator", stats: null }),
];

// ----- radar SIMULADO (Etapa 6C): colegas fictícios com cidade, situação e proximidade; "?radar=vazio" mostra a lista vazia e
// "?limite=1" faz o convite recusar com a mensagem de limite (para ver o aviso). Cidade do perfil de teste: "Cidade de Teste · UF".
const radarParam = new URLSearchParams(location.search).get("radar");
const limiteParam = new URLSearchParams(location.search).get("limite");
const pessoaRadar = (id, nome, extra = {}) => ({
  ...colega(id, nome), near: null, state: "livre", can_invite: true, why_not: null, ...extra,
});
const PESSOAS_RADAR = [
  pessoaRadar("t-1", "Colega Teste Um", { compat: 92, near: "cidade", city: "Cidade de Teste · UF" }),
  pessoaRadar("t-2", "Colega Teste Dois", { compat: 78, areas: ["CM", "PED"], role_pref: "any", near: "cidade", city: "Cidade de Teste · UF", state: "em_sala", can_invite: false, why_not: "Em sala." }),
  pessoaRadar("t-3", "Colega Teste Três", { compat: 63, areas: ["CR"], role_pref: "med", near: "estado", city: "Outra Cidade de Teste · UF", school: null }),
  pessoaRadar("t-4", "Colega Teste Quatro", { compat: null, reasons: [], areas: ["MFC"], role_pref: "ator", stats: null, city: null, state: "sozinho", can_invite: false, why_not: "Treinando sozinho." }),
  pessoaRadar("t-5", "Colega Teste Cinco", { compat: 55, areas: ["PED"], role_pref: "med", city: "Cidade Distante de Teste · XX", can_invite: false, why_not: "Não recebe convites." }),
];
const radarDaAba = (aba) => {
  if (radarParam === "vazio") return [];
  const todos = PESSOAS_RADAR.filter((p) => p.state !== "fora");
  if (aba === "atores") return todos.filter((p) => p.role_pref === "ator" || p.role_pref === "any");
  if (aba === "perto") return todos.filter((p) => p.near).sort((a, b) => (a.near === "cidade" ? 0 : 1) - (b.near === "cidade" ? 0 : 1));
  return todos;
};

// ----- sala ao vivo SIMULADA (Etapa 5): cada aba guarda a sua sala; o "colega" é simulado (confirma, fica pronto, inicia…) -----
// O id da sala é "<fase>-<papel>" (de onde a prévia começa). As ações mudam o estado como as funções app_dupla_* do banco.
// Cada sala começa na estação 1; "Treinar outra estação" (013380) volta aos papéis sem estação, e a estação já treinada na
// sala fica de fora (como no banco).
// Resumo sobre o tema (D9): na prévia, TEXTO DE EXEMPLO DE TESTE, só para ver "Materiais" na sala do avaliador. Não é conteúdo
// médico; no app, o resumo é escrito pela equipe em Administração › Estações e só aparece depois da revisão médica.
const RESUMO_TESTE =
  "EXEMPLO DE TESTE (prévia): este texto não é conteúdo médico. Aqui aparece o resumo sobre o tema que a equipe escreve em Administração › Estações.\n\nNa sala, o resumo só aparece ao avaliador e só depois de aprovado por revisor médico da área ou administrador. O candidato nunca vê.";
// Relato do caso = impresso INICIAL (visível desde o início); os outros são liberáveis, numerados 1, 2, 3 na tela.
const inicial = (p, i) => i === 0 && /^Relato/i.test(p.title);
const dadosCache = {};
function dados(estId) {
  if (dadosCache[estId]) return dadosCache[estId];
  const E = porId(estId);
  const ST = { ...resumo(E), area: E.area };
  const itens = E.criteria.map((c, i) => ({
    id: `i${i + 1}`, order: i + 1, content: c.title, tip: c.hint || "",
    grades: { correct: c.max, partial: c.partial, incorrect: 0 },
    criteria: {}, subitems: [],
  }));
  let nTela = 0;
  const primeira = E.n === 1; // só a estação 1 tem as imagens do protótipo
  const impressos = E.prints.map((p, i) => ({
    id: `p${i + 1}`, index: i + 1, source_number: i + 1, initially_visible: inicial(p, i),
    display_number: inicial(p, i) ? 1 : ++nTela, name: p.title, content: p.body, has_image: primeira && !inicial(p, i) && i === 1,
  }));
  const liberaveis = impressos.filter((p) => !p.initially_visible);
  // O candidato (e quem ainda não tem papel) nunca recebe o nome nem o id da estação antes do resultado.
  const { id: _id, name: _nome, topic: _tema, ...SEM_TEMA } = ST;
  return (dadosCache[estId] = { E, ST, itens, impressos, liberaveis, primeira, stParaCandidato: { ...SEM_TEMA, label: `Estação ${ST.number}` } });
}
const ESTACAO_INICIAL = resumo(ESTACOES[0]).id;
const chave = (p) => (p.initially_visible ? "i" : "d") + p.display_number;
// Imagens do protótipo de 11/10, lidas do disco SÓ pelo servidor da prévia (vite.config.mjs, /previa-imagens/); nada é copiado.
const IMAGEM = { candidate_sheet: "estacao-01-instrucoes-e-relato-unica.png", d1: "estacao-01-impresso-02-esfregaco-imagem.png", p2: "estacao-01-impresso-02-esfregaco-imagem.png" };
const EU = { user_id: "t-eu", public_name: "Aluno de Teste" };
const ELE = { user_id: "t-1", public_name: "Colega Teste Um" };

const salas = {};
const marcas = {};
let feedbackFinal = { pos: "", neg: "", gen: "" };
let revisao = { requested_at: null, reason: null, revised_at: null, score_before_review: null };
function nova(roomId) {
  const [fase = "roles", papel = "candidate"] = String(roomId).split("-");
  const meu = papel === "evaluator" ? "evaluator" : "candidate";
  const outro = meu === "candidate" ? "evaluator" : "candidate";
  const s = {
    id: roomId, rev: 1, phase: fase, round: 1, duration_ms: 600000, papel: meu, outro, estacao: ESTACAO_INICIAL, feitas: [],
    me: { confirmed: fase !== "roles", connected: !["roles", "connecting"].includes(fase), ready: false },
    partner: { confirmed: fase !== "roles", connected: !["roles", "connecting"].includes(fase), ready: fase === "setup" && meu === "evaluator" },
    started_at: null, ends_at: null, paused_left_ms: null, paused_at: null, paused_total_ms: 0, finished_at: null, released: [], closed_reason: null, closed_by: null,
  };
  if (fase === "running" || fase === "review") {
    s.started_at = EM(-180000);
    s.ends_at = EM(420000);
    s.released = meu === "candidate" ? [dados(s.estacao).liberaveis[0]?.id].filter(Boolean) : [];
  }
  if (fase === "review" || fase === "result") s.finished_at = EM(-60000);
  if (fase === "closed") Object.assign(s, { closed_reason: "saiu", closed_by: { me: false, public_name: ELE.public_name } });
  return s;
}
const sala = (roomId) => (salas[roomId] ??= nova(roomId));
const muda = (roomId, patch) => {
  const s = sala(roomId);
  Object.assign(s, typeof patch === "function" ? patch(s) : patch);
  s.rev += 1;
  return estado(roomId);
};
// o "colega" faz a parte dele um pouco depois (só na prévia)
const depois = (ms, roomId, patch) => setTimeout(() => muda(roomId, patch), ms);

function estado(roomId) {
  const s = sala(roomId);
  const comNome = s.papel === "evaluator" || s.phase === "result";
  const D = s.estacao ? dados(s.estacao) : null;
  return {
    id: roomId, rev: s.rev, phase: s.phase, round: s.round, server_now: NOW(),
    station: D ? (comNome ? D.ST : D.stParaCandidato) : null, duration_ms: s.duration_ms,
    me: { ...EU, role: s.papel, ...s.me, picked_station: false },
    partner: { ...ELE, role: s.outro, ...s.partner, seen_ms_ago: 2000 },
    match_note: s.round === 1 && s.phase === "roles" ? "Definido pelo match: você topa qualquer papel e Colega Teste Um quer ser ator/avaliador. Vocês ainda podem trocar. (dado de teste)" : null,
    invite_pending: false, call_link: null,
    started_at: s.started_at, ends_at: s.ends_at, paused_left_ms: s.paused_left_ms, paused_at: s.paused_at, finished_at: s.finished_at,
    released_pressings: !D ? [] : s.papel === "evaluator" || s.phase === "result" ? s.released : D.impressos.filter((p) => s.released.includes(p.id)).map(chave),
    closed_reason: s.closed_reason, closed_by: s.closed_by,
  };
}
function conteudo(roomId) {
  const s = sala(roomId);
  if (!s.estacao) return { role: null, station: null, pressing_count: 0, pressings: [] };
  const { E, ST, itens, impressos, liberaveis, primeira } = dados(s.estacao);
  const comNome = s.papel === "evaluator" || s.phase === "result";
  const min = { ...(comNome ? { id: ST.id, name: ST.name } : {}), label: `Estação ${ST.number}`, area: ST.area, area_code: ST.area_code, number: ST.number, duration_ms: ST.duration_ms };
  if (s.phase === "roles") return { role: null, station: min, pressing_count: liberaveis.length, pressings: [] };
  const doc = { version: "teste", doctor_scene: E.scenario, doctor_tasks: E.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n"), candidate_sheet: { has_image: primeira } };
  if (s.papel === "candidate") {
    const vistos = impressos.filter((p) => p.initially_visible || s.released.includes(p.id));
    return {
      role: "candidate", station: { ...min, ...doc }, pressing_count: liberaveis.length,
      pressings: vistos.map(({ source_number: _s, index: _i, ...p }) => ({ ...p, id: chave(p) })),
    };
  }
  return {
    role: "evaluator",
    // resumo de EXEMPLO DE TESTE, como se já tivesse passado pela revisão médica (no app, só o aprovado chega aqui)
    station: { ...min, ...doc, actor_script: "", summary: RESUMO_TESTE },
    pressing_count: liberaveis.length, pressings: impressos, checklist_items: itens,
  };
}
const pontos = (it, g) => (g ? it.grades[g] ?? 0 : 0);
function resultado(roomId) {
  const s = sala(roomId);
  const { ST, itens } = dados(s.estacao ?? ESTACAO_INICIAL);
  const m = marcas[`${roomId}:${s.round}`] ?? {};
  const lista = itens.map((it) => ({ id: it.id, order: it.order, content: it.content, max_points: it.grades.correct, grade: m[it.id]?.grade ?? null, points: pontos(it, m[it.id]?.grade) }));
  const score = lista.reduce((a, b) => a + b.points, 0);
  const max = itens.reduce((a, b) => a + b.grades.correct, 0) || 10;
  const avaliador = s.papel === "evaluator" ? EU : ELE;
  const candidato = s.papel === "evaluator" ? ELE : EU;
  return {
    round: s.round, viewer: s.papel, station: ST, score, max_score: max, pct: Math.round((score / max) * 100), previous_pct: null,
    items: lista, evaluator: avaliador, candidate: candidato, finished_at: s.finished_at ?? NOW(),
    used_ms: s.started_at && s.finished_at ? Date.parse(s.finished_at) - Date.parse(s.started_at) - s.paused_total_ms : null,
    feedback: feedbackFinal, review: revisao,
  };
}
// Histórico em Meus PEPs (decisão do dono de 17/10, migração 013400): rodadas de salas JÁ ENCERRADAS, DADOS DE TESTE.
// 1) estação 1 como candidato, sala fechada, resultado liberado (abre só leitura); 2) estação 2 como avaliador, revisão da
// nota pedida e não feita ("Aguardando revisão", sem nome e sem nota); 3) um treino sozinho de teste.
const HIST_ESTACOES = [ESTACAO_INICIAL, resumo(ESTACOES[1]).id];
function historicoResultado() {
  const { ST, itens } = dados(ESTACAO_INICIAL);
  const notas = ["correct", "partial", "correct", "incorrect"];
  const lista = itens.map((it, i) => {
    const grade = notas[i % notas.length];
    return { id: it.id, order: it.order, content: it.content, max_points: it.grades.correct, grade, points: pontos(it, grade) };
  });
  const score = lista.reduce((a, b) => a + b.points, 0);
  const max = itens.reduce((a, b) => a + b.grades.correct, 0) || 10;
  return {
    round: 1, viewer: "candidate", station: ST, score, max_score: max, pct: Math.round((score / max) * 100), previous_pct: null,
    items: lista, evaluator: ELE, candidate: EU, finished_at: EM(-2 * 86400000), used_ms: 9 * 60000,
    feedback: { pos: "Feedback de TESTE (prévia): boa apresentação.", neg: "Feedback de TESTE: faltou um item do exame.", gen: "" },
    review: { requested_at: null, reason: null, revised_at: null, score_before_review: null },
  };
}
const respostasHistorico = {
  app_fase2_peps: () => [{ id: "tentativa-teste", origin: "solo", station_id: HIST_ESTACOES[1], name: "Treino sozinho de TESTE", area: "Clínica Médica", at: EM(-5 * 86400000), score10: 6.5 }],
  app_fase2_performance: () => ({ count: 1, by_phase: [], lost_items: [] }),
  app_dupla_history: () => {
    const r = historicoResultado();
    const E2 = dados(HIST_ESTACOES[1]).ST;
    return [
      {
        room_id: "sala-encerrada-1", round: 1, role: "candidate", status: "concluida", revised: false, finished_at: r.finished_at,
        partner: { public_name: ELE.public_name },
        station: { number: r.station.number, area: r.station.area, area_code: r.station.area_code, name: r.station.name, edition: r.station.edition },
        score: r.score, max_score: r.max_score, pct: r.pct,
      },
      {
        room_id: "sala-encerrada-2", round: 2, role: "evaluator", status: "aguardando_revisao", revised: false, finished_at: EM(-86400000),
        partner: { public_name: "Colega Teste Dois" },
        station: { number: E2.number, area: E2.area, area_code: E2.area_code, name: null, edition: null },
        score: null, max_score: null, pct: null,
      },
    ].sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at));
  },
  app_dupla_history_result: ({ p_room_id }) => {
    if (p_room_id !== "sala-encerrada-1") throw new Error("Aguardando revisão da nota.");
    return historicoResultado();
  },
};
const JA_TREINADA = "Vocês já treinaram esta estação nesta sala. Escolham outra.";
const sala_acoes = {
  app_dupla_room: ({ p_room_id, p_since_rev }) => (p_since_rev != null && p_since_rev === sala(p_room_id).rev ? null : estado(p_room_id)),
  app_dupla_room_content: ({ p_room_id }) => conteudo(p_room_id),
  app_dupla_marks: ({ p_room_id }) => Object.entries(marcas[`${p_room_id}:${sala(p_room_id).round}`] ?? {}).map(([item_id, v]) => ({ item_id, ...v })),
  app_dupla_result: ({ p_room_id }) => resultado(p_room_id),
  app_dupla_room_done_stations: ({ p_room_id }) => sala(p_room_id).feitas,
  app_dupla_set_roles: ({ p_room_id, p_candidate_id }) => muda(p_room_id, () => ({ papel: p_candidate_id === EU.user_id ? "candidate" : "evaluator", outro: p_candidate_id === EU.user_id ? "evaluator" : "candidate", me: { ...sala(p_room_id).me, confirmed: false } })),
  app_dupla_draw_roles: ({ p_room_id }) => muda(p_room_id, () => (Math.random() < 0.5 ? { papel: "candidate", outro: "evaluator" } : { papel: "evaluator", outro: "candidate" })),
  app_dupla_set_station: ({ p_room_id, p_station_id }) => {
    if (sala(p_room_id).feitas.includes(p_station_id)) throw new Error(JA_TREINADA);
    return muda(p_room_id, { estacao: p_station_id, duration_ms: dados(p_station_id).ST.duration_ms });
  },
  app_dupla_confirm_roles: ({ p_room_id }) => {
    const s = sala(p_room_id);
    if (!s.estacao) throw new Error("Escolha a estação antes de confirmar.");
    if (!s.papel) throw new Error("Definam os papéis antes de confirmar.");
    depois(1500, p_room_id, (x) => ({ phase: "connecting", partner: { ...x.partner, confirmed: true } }));
    return muda(p_room_id, (x) => ({ me: { ...x.me, confirmed: true } }));
  },
  app_dupla_connected: ({ p_room_id }) => muda(p_room_id, (s) => ({ phase: "setup", me: { ...s.me, connected: true }, partner: { ...s.partner, connected: true } })),
  app_dupla_ready: ({ p_room_id, p_ready }) => {
    const s = sala(p_room_id);
    if (p_ready && !s.partner.ready) depois(1500, p_room_id, (x) => ({ partner: { ...x.partner, ready: true } }));
    // candidato pronto: o "avaliador" inicia a estação depois de uns segundos
    if (p_ready && s.papel === "candidate") depois(5000, p_room_id, () => ({ phase: "running", started_at: NOW(), ends_at: EM(sala(p_room_id).duration_ms), released: [] }));
    if (p_ready && s.papel === "candidate") depois(15000, p_room_id, (x) => ({ released: x.phase === "running" ? [dados(x.estacao).liberaveis[0]?.id].filter(Boolean) : x.released }));
    return muda(p_room_id, (x) => ({ me: { ...x.me, ready: Boolean(p_ready) } }));
  },
  app_dupla_set_duration: ({ p_room_id, p_duration_ms }) => muda(p_room_id, { duration_ms: Math.max(60000, Math.min(600000, p_duration_ms)) }),
  app_dupla_start: ({ p_room_id }) => muda(p_room_id, (s) => ({ phase: "running", started_at: NOW(), ends_at: EM(s.duration_ms), released: [] })),
  app_dupla_pause: ({ p_room_id }) => muda(p_room_id, (s) => ({ paused_left_ms: Math.max(0, Date.parse(s.ends_at) - Date.now()), paused_at: NOW(), ends_at: null })),
  app_dupla_resume: ({ p_room_id }) => muda(p_room_id, (s) => ({ ends_at: EM(s.paused_left_ms), paused_total_ms: s.paused_total_ms + (Date.now() - Date.parse(s.paused_at)), paused_left_ms: null, paused_at: null })),
  app_dupla_adjust: ({ p_room_id, p_delta_ms }) =>
    muda(p_room_id, (s) => (s.ends_at ? { ends_at: new Date(Math.max(Date.now() + 30000, Date.parse(s.ends_at) + p_delta_ms)).toISOString() } : { paused_left_ms: Math.max(30000, s.paused_left_ms + p_delta_ms) })),
  app_dupla_release: ({ p_room_id, p_pressing_id, p_released }) => muda(p_room_id, (s) => ({ released: p_released ? [...new Set([...s.released, p_pressing_id])] : s.released.filter((x) => x !== p_pressing_id) })),
  app_dupla_mark: ({ p_room_id, p_item_id, p_grade, p_subitems }) => {
    const k = `${p_room_id}:${sala(p_room_id).round}`;
    marcas[k] = { ...(marcas[k] ?? {}), [p_item_id]: { grade: p_grade, subitems: p_subitems ?? [] } };
    return { ok: true };
  },
  app_dupla_finish: ({ p_room_id }) => muda(p_room_id, { phase: "review", finished_at: NOW() }),
  app_dupla_finalize: ({ p_room_id, p_feedback }) => {
    if (revisao.requested_at) revisao = { ...revisao, revised_at: NOW() };
    feedbackFinal = { pos: p_feedback?.pos ?? "", neg: p_feedback?.neg ?? "", gen: p_feedback?.gen ?? "" };
    return muda(p_room_id, { phase: "result" });
  },
  app_dupla_request_review: ({ p_room_id, p_reason }) => {
    revisao = { ...revisao, requested_at: NOW(), reason: p_reason };
    return muda(p_room_id, {});
  },
  app_dupla_redo_review: ({ p_room_id }) => muda(p_room_id, { phase: "review" }),
  // "Treinar outra estação" (013380): rodada seguinte, mesmo par, sem papéis e sem estação; a estação desta rodada fica de fora
  app_dupla_next_station: ({ p_room_id }) => {
    if (sala(p_room_id).phase !== "result") throw new Error("Esta ação não vale nesta fase da sala.");
    revisao = { requested_at: null, reason: null, revised_at: null, score_before_review: null };
    feedbackFinal = { pos: "", neg: "", gen: "" };
    return muda(p_room_id, (s) => ({
      phase: "roles", round: s.round + 1, papel: null, outro: null, estacao: null, feitas: [...new Set([...s.feitas, s.estacao].filter(Boolean))],
      me: { confirmed: false, connected: false, ready: false }, partner: { confirmed: false, connected: false, ready: false },
      started_at: null, ends_at: null, paused_left_ms: null, paused_at: null, paused_total_ms: 0, finished_at: null, released: [], duration_ms: null,
    }));
  },
  app_dupla_leave: ({ p_room_id }) => muda(p_room_id, { phase: "closed", closed_reason: "saiu", closed_by: { me: true, public_name: EU.public_name } }),
};

let convites = [];
const convParam = new URLSearchParams(location.search).get("convite");
if (convParam === "1") {
  convites = [{ id: "cv-1", room_id: "roles-candidate", kind: "match", from: { user_id: "t-1", public_name: "Colega Teste Um" }, station: null, expires_at: EM(10 * 60000) }];
}
// "?convite=direto": convite direto do radar (60 s), com a estação só como "Estação N", área e duração (sem o nome da estação).
if (convParam === "direto") {
  convites = [{
    id: "cv-2", room_id: "roles-candidate", kind: "direto", from: { user_id: "t-1", public_name: "Colega Teste Um" },
    station: { label: "Estação 1", number: 1, area: "Clínica Médica", area_code: "CM", duration_ms: 600000 }, expires_at: EM(60000),
  }];
}
// "?convite=pedido": pedido de treino por link (vale 24 h) de um colega que não estava online.
let pedidos = convParam === "pedido"
  ? [{ id: "pd-1", from: { user_id: "t-3", public_name: "Colega Teste Três", handle: "colega.teste3" }, station: { label: "Estação 1", number: 1, area: "Clínica Médica", area_code: "CM", duration_ms: 600000 }, expires_at: EM(20 * 3600000) }]
  : [];
// Chat de estudo (Etapa C) na prévia: uma conversa com o colega de teste, em memória. O filtro de verdade é do servidor
// (migração 013370); aqui só "idiota" é recusada, para ver o aviso na tela.
let bloqueado = false;
let mensagens = [];
const conversa = () => ({
  chat_id: "chat-teste", partner: { user_id: "t-1", public_name: "Colega Teste Um" }, room_id: null, blocked_by_me: bloqueado, can_send: !bloqueado,
  last: mensagens.length ? { body: mensagens.at(-1).body, created_at: mensagens.at(-1).created_at, mine: true } : null,
});
const respostasChat = {
  app_dupla_chats: () => ({ chats: [conversa()], server_now: NOW() }),
  app_dupla_chat_open: () => conversa(),
  app_dupla_chat_messages: () => ({ chat: conversa(), messages: mensagens, max: 600, server_now: NOW() }),
  app_dupla_chat_send: ({ p_text }) => {
    const texto = String(p_text ?? "").trim();
    if (!texto) throw new Error("Escreva uma mensagem para combinar o treino.");
    if (/idiota/i.test(texto)) throw new Error("Essa mensagem contém uma palavra não permitida. Reformule com respeito e mantenha o foco no treino.");
    const m = { id: "m-" + (mensagens.length + 1), body: texto, created_at: NOW(), expires_at: EM(86400000), mine: true, author: "Aluno de Teste" };
    mensagens = [...mensagens, m];
    return m;
  },
  app_dupla_chat_block: ({ p_block }) => {
    bloqueado = Boolean(p_block);
    return conversa();
  },
  app_dupla_chat_report: () => ({ report_id: "den-teste", messages: mensagens.length }),
  app_dupla_chat_room: () => ({ room_id: "roles-candidate" }),
};
// Administração › Estações na prévia: "Resumo sobre o tema" com rascunho → aprovado (013380). Tudo em memória, DADOS DE TESTE;
// a estação 1 começa com o resumo de EXEMPLO DE TESTE já aprovado (o mesmo que aparece em Materiais na sala).
const resumos = { [ESTACAO_INICIAL]: { body: RESUMO_TESTE, status: "approved", updated_at: EM(-86400000), approved_at: EM(-3600000), note: "Nota de TESTE (prévia): conferido com a fonte." } };
const resumoDe = (id) => {
  const r = resumos[id];
  return {
    station_id: id, body: r?.body ?? null, status: r?.status ?? null, origin: r ? "equipe" : null,
    updated_at: r?.updated_at ?? null, updated_by: r ? "Editora de Teste" : null,
    approved_at: r?.status === "approved" ? r.approved_at : null, approved_by: r?.status === "approved" ? "Revisor de Teste" : null,
    approval_note: r?.status === "approved" ? r.note ?? null : null, can_approve: true,
  };
};
// grau de dificuldade na Administração (013410), em memória: o EXEMPLO DE TESTE começa "definido pelo Revisor de Teste"
const dificuldadeAdm = (id) => {
  const d = dificuldades[id] ?? (DIFICULDADE_TESTE[Number(id.slice(-2)) - 1] ? { level: DIFICULDADE_TESTE[Number(id.slice(-2)) - 1], criteria: [], note: "EXEMPLO DE TESTE (prévia): não é classificação médica.", at: EM(-86400000) } : { level: null });
  return { difficulty: d.level, difficulty_criteria: d.criteria ?? [], difficulty_note: d.level ? d.note : null, difficulty_at: d.level ? d.at : null, difficulty_by: d.level ? "Revisor de Teste" : null };
};
const respostasAdm = {
  app_admin_stations: () =>
    BANCO.map((b) => ({
      id: b.id, name: b.name, topic: b.topic ?? "", area: b.area, medical_review: "approved", is_pro_only: false, institution: "INEP",
      review_note: "Conferência de teste (prévia).", reviewed_at: EM(-86400000), reviewer: "Revisor de Teste", can_review: true,
      summary_status: resumos[b.id]?.status ?? null, reports: 0, last_reports: [],
      ...dificuldadeAdm(b.id),
    })),
  app_admin_station_content: ({ p_station_id }) => {
    const E = porId(p_station_id);
    return {
      doctor_scene: E.scenario, doctor_tasks: E.tasks.join("\n"), actor_script: "",
      pressings: E.prints.map((p, i) => ({ id: `p${i + 1}`, name: p.title, content: p.body })),
      checklist_items: E.criteria.map((c, i) => ({ id: `i${i + 1}`, order: i + 1, content: c.title, tip: c.hint || "", grades: { correct: c.max, partial: c.partial, incorrect: 0 }, criteria: {}, subitems: [] })),
      summary: [],
    };
  },
  app_admin_station_summary: ({ p_station_id }) => resumoDe(p_station_id),
  app_admin_set_station_difficulty: ({ p_station_id, p_level, p_criteria, p_note }) => {
    if (String(p_note ?? "").trim().length < 10) throw new Error("Registre o que foi conferido para definir o grau (pelo menos 10 caracteres).");
    dificuldades[p_station_id] = { level: p_level ?? null, criteria: p_level ? p_criteria ?? [] : [], note: String(p_note).trim(), at: NOW() };
    return respostasAdm.app_admin_stations();
  },
  app_admin_save_station_summary: ({ p_station_id, p_body }) => {
    const body = String(p_body ?? "").trim();
    if (!body) delete resumos[p_station_id];
    else if (resumos[p_station_id]?.body !== body) resumos[p_station_id] = { body, status: "draft", updated_at: NOW() };
    return resumoDe(p_station_id);
  },
  app_admin_review_station_summary: ({ p_station_id, p_status, p_note }) => {
    const r = resumos[p_station_id];
    if (!r) throw new Error("Esta estação ainda não tem resumo.");
    // 013400: aprovar pede a nota do que foi conferido (10 caracteres ou mais)
    if (p_status === "approved" && String(p_note ?? "").trim().length < 10) throw new Error("Registre o que foi conferido no resumo (pelo menos 10 caracteres).");
    resumos[p_station_id] = { ...r, status: p_status, approved_at: p_status === "approved" ? NOW() : null, note: p_status === "approved" ? String(p_note).trim() : null };
    return resumoDe(p_station_id);
  },
};
const respostas = {
  ...respostasChat,
  ...respostasAdm,
  ...respostasHistorico,
  // ----- radar, @ e convite por link (dados de teste)
  app_dupla_radar: ({ p_aba }) => {
    const sem = !perfil?.city?.trim();
    if (p_aba === "perto" && sem) return { people: [], online: PESSOAS_RADAR.length, needs_city: true, open_room: null, me: { radar_visible: perfil?.radar_visible !== false, allow_direct_invites: perfil?.allow_direct_invites !== false }, server_now: NOW() };
    return { people: radarDaAba(p_aba), online: radarParam === "vazio" ? 0 : PESSOAS_RADAR.length, needs_city: false, open_room: null, me: { radar_visible: perfil?.radar_visible !== false, allow_direct_invites: perfil?.allow_direct_invites !== false }, server_now: NOW() };
  },
  app_dupla_invite: ({ p_to }) => {
    if (limiteParam === "1") throw new Error("Muitos convites seguidos. Tente de novo em 12 min.");
    const quem = PESSOAS_RADAR.find((p) => p.user_id === p_to);
    return { room_id: "roles-candidate", expires_at: EM(60000), partner: { user_id: p_to, public_name: quem?.public_name ?? "Colega Teste" } };
  },
  app_dupla_handle_check: ({ p_handle }) => {
    const h = String(p_handle ?? "").replace(/^@+/, "").toLowerCase();
    if (h === perfil?.handle) return { ok: true, handle: h, code: null, message: "Este já é o seu @.", next_change_at: null, next_change_message: null };
    if (!/^[a-z0-9._]{3,20}$/.test(h) || /^\.|\.$/.test(h)) return { ok: false, handle: h, code: "formato", message: "Use de 3 a 20 caracteres: letras minúsculas, números, ponto ou sublinhado, sem ponto no começo nem no fim.", next_change_at: null };
    if (h === "colega.teste1" || h === "admin") return { ok: false, handle: h, code: h === "admin" ? "reservado" : "em_uso", message: h === "admin" ? "Esse @ não está disponível." : "Esse @ já está em uso.", next_change_at: null };
    return { ok: true, handle: h, code: null, message: "Disponível.", next_change_at: null };
  },
  app_dupla_link_lookup: ({ p_handle, p_station_id }) => {
    const h = String(p_handle ?? "").toLowerCase();
    if (h === perfil?.handle) return { found: true, self: true, person: { public_name: perfil.public_name, handle: h } };
    const quem = PESSOAS_RADAR.find((p) => p.handle === h);
    if (!quem) return { found: false };
    const station = p_station_id ? { label: "Estação 1", number: 1, area: "Clínica Médica", area_code: "CM", duration_ms: 600000 } : null;
    const mode = !quem.can_invite && quem.why_not === "Não recebe convites." ? "indisponivel" : quem.state === "livre" ? "convite" : "pedido";
    return { found: true, self: false, mode, why_not: mode === "indisponivel" ? "Não recebe convites." : null, station, pending: false, incoming: false, person: quem };
  },
  app_dupla_link_request: ({ p_handle }) => {
    const h = String(p_handle ?? "").toLowerCase();
    const quem = PESSOAS_RADAR.find((p) => p.handle === h);
    if (quem?.state === "livre") return { kind: "convite", room_id: "roles-candidate", expires_at: EM(60000), partner: { user_id: quem.user_id, public_name: quem.public_name } };
    return { kind: "pedido", request_id: "pd-novo", expires_at: EM(24 * 3600000), partner: { user_id: quem?.user_id ?? "t-9", public_name: quem?.public_name ?? "Colega Teste" } };
  },
  app_dupla_requests: () => ({ requests: pedidos, server_now: NOW() }),
  app_dupla_answer_request: ({ p_accept }) => {
    pedidos = [];
    return p_accept ? { room_id: "roles-candidate", expires_at: EM(60000), partner: { user_id: "t-3", public_name: "Colega Teste Três" } } : { room_id: null };
  },
  app_dupla_access: () => ({ aberto: true, permitido: true, equipe: true, planos: ["pro", "elite"] }),
  app_dupla_profile: () => ({ profile: perfil, defaults: perfil ? null : { public_name: "Aluno de Teste", exam: "2026/2" }, stats: { done: 3, avg: 7.8 } }),
  app_dupla_save_profile: ({ p_profile }) => {
    perfil = { ...(perfil ?? {}), ...p_profile };
    return { profile: perfil, defaults: null, stats: { done: 3, avg: 7.8 } };
  },
  app_dupla_stations: () => banco(),
  app_dupla_deck: () => ({ cards: baralho, hidden_by_role: 2, online: 5, matches_today: 1, open_room: null, server_now: NOW() }),
  app_dupla_heartbeat: () => ({ server_now: NOW() }),
  app_dupla_invites: () => ({ invites: convites, server_now: NOW() }),
  app_dupla_swipe: ({ p_to, p_direction }) => {
    baralho = baralho.filter((c) => c.user_id !== p_to);
    // na prévia, o primeiro colega "curte de volta": mostra o Deu match!
    return p_direction === "right" && p_to === "t-1" ? { matched: true, room_id: "roles-candidate", partner: { public_name: "Colega Teste Um" } } : { matched: false };
  },
  app_dupla_answer_invite: ({ p_accept }) => {
    convites = [];
    return { room_id: p_accept ? "roles-candidate" : null };
  },
  ...sala_acoes,
};
const backend = {
  rpc: async (fn, args = {}) => {
    const f = respostas[fn];
    if (!f) throw new Error(`Função sem simulação na prévia: ${fn}`);
    await new Promise((r) => setTimeout(r, 120));
    return f(args);
  },
  // imagens da estação 1 (folha do candidato e esfregaço) vindas do protótipo, só no servidor da prévia
  duplaPrintUrl: async (_roomId, id) => (IMAGEM[id] ? `/previa-imagens/${IMAGEM[id]}` : null),
};
const sessao = { status: "ready", backend, user: { id: "t-eu" }, boot: { role: "admin" }, dupla: { aberto: true, permitido: true, equipe: true, planos: ["pro", "elite"] } };
export const SessionProvider = ({ children }) => <>{children}</>;
export const rememberChoice = () => {};
export const useSession = () => ({ ...sessao, updateProfile: async () => {}, signOut: async () => {} });
