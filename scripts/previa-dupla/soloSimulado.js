// Treino SOZINHO na prévia (porta configurável): as funções app_fase2_* simuladas em memória, no MESMO contrato do banco
// (migrações 014090 a 014120). TUDO É DADO DE TESTE: a "IA" aqui é um roteiro fixo que mostra os estados da tela (item com trecho,
// item sem trecho, não citado, divergência, sem avaliação); ela NÃO avalia nada de verdade e NÃO chama nenhuma IA.
//   ?ia=ligada (padrão) | desligada | plano | aceite | cota | falha     — como o botão "Avaliar com IA" aparece
//   ?atraso=1500 — tempo (ms) do "Avaliando…" simulado (padrão 3500)
const MOTIVOS = {
  desligada: "A avaliação por IA está indisponível agora.",
  plano: "Disponível em outro plano.",
  aceite: "Aceite o aviso para usar a IA.",
  cota: "Você usou as avaliações de hoje.",
};

export function criarSolo({ dados, porEstacaoId, resumoEstacao, NOW, EM }) {
  const query = new URLSearchParams(location.search);
  const modoIa = query.get("ia") || "ligada";
  const atraso = Number(query.get("atraso")) || 3500;
  const tentativas = {};
  let ultimo = null;

  const iaDisponivel = () => {
    if (modoIa === "ligada" || modoIa === "falha") return { available: true, reason: null, consent_required: false };
    return { available: false, reason: MOTIVOS[modoIa] ?? MOTIVOS.desligada, consent_required: modoIa === "aceite" };
  };

  const tarefasTexto = (E) => E.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n");

  function pressings(a, D) {
    return D.impressos.map((p) => {
      const aberto = p.initially_visible || a.opened.some((o) => o.id === p.id);
      return {
        id: p.id, number: p.index, name: p.name, initial: p.initially_visible, opened: aberto,
        content: aberto ? p.content : null, has_image: false,
      };
    });
  }

  function payload(a) {
    const D = dados(a.station_id);
    const E = D.E;
    const v = {
      attempt_id: a.id, status: a.status, server_now: NOW(),
      station: { id: D.ST.id, name: D.ST.name, topic: D.ST.topic, area: D.ST.area, setting: null, institution: "INEP", year: "2020", duration_ms: D.ST.duration_ms },
      scene: E.scenario, tasks: tarefasTexto(E),
      started_at: a.started_at, attendance_started_at: a.attendance_started_at, attendance_ended_at: a.attendance_ended_at, submitted_at: a.submitted_at,
      ends_at: a.attendance_started_at ? new Date(Date.parse(a.attendance_started_at) + D.ST.duration_ms).toISOString() : null,
      answers: a.answers, how: a.how, source: a.source,
    };
    if (["attending", "submitted", "evaluating", "scoring", "done"].includes(a.status)) v.pressings = pressings(a, D);
    if (a.status === "submitted") {
      v.ia = iaDisponivel();
      v.ia_message = a.ia_message ?? null;
    }
    if (a.status === "scoring") {
      v.checklist = D.itens.map((it) => ({
        order: it.order, phase: "PEP", content: it.content, tip: it.tip || "", max: it.grades.correct,
        partial: typeof it.grades.partial === "number" ? it.grades.partial : null, criteria: {}, subitems: [],
      }));
    }
    if (a.status === "done") v.result = a.result;
    return v;
  }

  const nota10 = (r) => (r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) / 10 : 0);

  function concluir(a, linhas, source, ia) {
    const score = linhas.reduce((s, m) => s + m.points, 0);
    const max = linhas.reduce((s, m) => s + m.max, 0);
    const fim = NOW();
    a.status = "done";
    a.source = source;
    a.result = {
      score, max_score: max, score10: Math.round((score / max) * 100) / 10, finished_at: fim, source,
      used_ms: a.attendance_started_at ? Date.parse(a.submitted_at ?? fim) - Date.parse(a.attendance_started_at) : 0,
      marks: linhas,
      ia: source === "ia" ? { note: ia.note, diverged: ia.diverged } : null,
      positive: linhas.filter((m) => m.grade === "correct").map((m) => m.content),
      negative: linhas.filter((m) => m.grade === "partial" || m.grade === "incorrect").map((m) => m.content),
    };
    a.peps = { id: a.id, origin: "solo", source, station_id: a.station_id, name: dados(a.station_id).ST.name, area: dados(a.station_id).ST.area, at: fim, score10: a.result.score10 };
  }

  const ponto = (it, g) => (g ? it.grades[g] ?? 0 : 0);
  function linhasDe(D, graus, extras = {}) {
    return D.itens.map((it) => {
      const g = graus[String(it.order)] ?? null;
      return { order: it.order, item_id: it.id, phase: "PEP", content: it.content, grade: g, points: ponto(it, g), max: it.grades.correct, ...(extras[it.order] ?? {}) };
    });
  }

  // Roteiro fixo da "IA" de teste: mostra todos os estados da tela de resultado.
  function avaliarDeTeste(a) {
    const D = dados(a.station_id);
    const texto = a.answers.map((r) => r.text).join(" ").replace(/\s+/g, " ").trim();
    const trecho = texto.slice(0, Math.min(60, texto.length)) || null;
    const graus = {};
    const extras = {};
    D.itens.forEach((it, i) => {
      const o = it.order;
      const cenario = i % 5;
      if (cenario === 0 && trecho) {
        graus[o] = "correct";
        extras[o] = { quote: trecho, reason: "Razão de EXEMPLO (IA simulada na prévia): o trecho acima mostra como a tela exibe a evidência.", label: null };
      } else if (cenario === 1) {
        graus[o] = null;
        extras[o] = { quote: null, reason: "A IA não encontrou um trecho que provasse este item.", label: "sem_trecho" };
      } else if (cenario === 2) {
        graus[o] = "incorrect";
        extras[o] = { quote: null, reason: "Item não citado no texto (exemplo da prévia).", label: "nao_citado" };
      } else if (cenario === 3 && trecho) {
        graus[o] = typeof it.grades.partial === "number" ? "partial" : "incorrect";
        extras[o] = { quote: trecho, reason: "Razão de EXEMPLO: as duas IAs de teste deram níveis diferentes e vale o menor.", label: "divergiram" };
      } else {
        graus[o] = null;
        extras[o] = { quote: null, reason: null, label: "sem_avaliacao" };
      }
    });
    concluir(a, linhasDe(D, graus, extras), "ia", { note: "Observação de EXEMPLO (IA simulada): texto organizado e dentro do tempo.", diverged: D.itens.filter((_, i) => i % 5 === 3).length });
  }

  function achar(id) {
    const a = tentativas[id];
    if (!a) throw new Error("Tentativa não encontrada.");
    return a;
  }

  const aberta = () => Object.values(tentativas).find((a) => ["reading", "attending", "submitted", "evaluating", "scoring"].includes(a.status));

  const respostas = {
    app_fase2_overview: () => {
      const feitas = Object.values(tentativas).filter((a) => a.status === "done");
      const ab = aberta();
      return {
        stations_total: 10, areas: [], done_count: feitas.length, avg_score10: feitas.length ? feitas.reduce((s, a) => s + a.result.score10, 0) / feitas.length : null,
        last: feitas.length ? { id: feitas.at(-1).id, origin: "solo", source: feitas.at(-1).source, station_id: feitas.at(-1).station_id, name: dados(feitas.at(-1).station_id).ST.name, area: "Clínica Médica", at: feitas.at(-1).result.finished_at, score10: feitas.at(-1).result.score10 } : null,
        open_attempt: ab ? { id: ab.id, station_id: ab.station_id, name: dados(ab.station_id).ST.name, status: ab.status } : null,
      };
    },
    app_fase2_start: ({ p_station_id }) => {
      const ab = aberta();
      if (ab && ab.station_id === p_station_id) return payload(ab);
      if (ab) ab.status = "abandoned";
      const id = `tentativa-${Object.keys(tentativas).length + 1}`;
      const a = { id, station_id: p_station_id, status: "reading", started_at: NOW(), attendance_started_at: null, attendance_ended_at: null, submitted_at: null, answers: [], opened: [], how: null, source: null, result: null, ia_message: null };
      tentativas[id] = a;
      ultimo = a;
      return payload(a);
    },
    app_fase2_attempt: ({ p_attempt_id }) => payload(achar(p_attempt_id)),
    app_fase2_begin: ({ p_attempt_id }) => {
      const a = achar(p_attempt_id);
      if (a.status === "reading") Object.assign(a, { status: "attending", attendance_started_at: NOW() });
      return payload(a);
    },
    app_fase2_save_answers: ({ p_attempt_id, p_answers }) => {
      const a = achar(p_attempt_id);
      if (a.status !== "attending") throw new Error("Esta tentativa não aceita mais texto.");
      if (p_answers.some((r) => String(r.text).length > 4000)) throw new Error("Texto longo demais.");
      a.answers = p_answers;
      return { ok: true, saved_at: NOW() };
    },
    app_fase2_open_pressing: ({ p_attempt_id, p_pressing_id }) => {
      const a = achar(p_attempt_id);
      const D = dados(a.station_id);
      const p = D.impressos.find((x) => x.id === p_pressing_id);
      if (!p) throw new Error("Impresso não encontrado.");
      if (!p.initially_visible && !a.opened.some((o) => o.id === p.id)) a.opened.push({ id: p.id, at_ms: Date.now() - Date.parse(a.attendance_started_at ?? NOW()) });
      return { id: p.id, number: p.index, name: p.name, content: p.content, has_image: false };
    },
    app_fase2_deliver: ({ p_attempt_id, p_answers }) => {
      const a = achar(p_attempt_id);
      if (a.status === "attending") Object.assign(a, { status: "submitted", submitted_at: NOW(), attendance_ended_at: NOW(), answers: p_answers ?? a.answers });
      return payload(a);
    },
    app_fase2_finish: ({ p_attempt_id }) => {
      const a = achar(p_attempt_id);
      if (["attending", "submitted"].includes(a.status)) Object.assign(a, { status: "scoring", how: "self", submitted_at: a.submitted_at ?? NOW(), attendance_ended_at: a.attendance_ended_at ?? NOW() });
      return payload(a);
    },
    app_fase2_submit: ({ p_attempt_id, p_marks }) => {
      const a = achar(p_attempt_id);
      if (a.status === "done") return payload(a);
      const D = dados(a.station_id);
      for (const it of D.itens) {
        const g = p_marks?.[String(it.order)];
        if (!["correct", "partial", "incorrect"].includes(g) || (g === "partial" && typeof it.grades.partial !== "number")) throw new Error(`Marque todos os itens do PEP (item ${it.order}).`);
      }
      concluir(a, linhasDe(D, p_marks), "autoavaliacao", null);
      return payload(a);
    },
    app_fase2_abandon: ({ p_attempt_id }) => {
      const a = achar(p_attempt_id);
      if (["reading", "attending", "submitted", "scoring"].includes(a.status)) a.status = "abandoned";
      return { ok: true };
    },
    app_fase2_report_ia: ({ p_attempt_id }) => {
      achar(p_attempt_id);
      return { ok: true };
    },
    app_fase2_print_path: () => null,
    app_fase2_peps: () => Object.values(tentativas).filter((a) => a.status === "done").map((a) => a.peps),
  };

  // Rota do servidor (POST /api/dupla/solo/:id/evaluate) simulada: o "Avaliando…" dura `atraso` ms e termina com o roteiro de teste
  // (ou com a falha, com ?ia=falha, para ver "Tentar de novo" e "Corrigir eu mesmo").
  async function avaliar(id) {
    const a = achar(id);
    if (a.status === "evaluating") return { status: 409, corpo: { error: "A avaliação já está em andamento." } };
    if (a.status !== "submitted") return { status: 409, corpo: { error: "Entregue o treino antes de pedir a avaliação." } };
    const ia = iaDisponivel();
    if (!ia.available) return { status: 403, corpo: { error: ia.reason } };
    const palavras = a.answers.map((r) => r.text).join(" ").split(/\s+/).filter(Boolean).length;
    if (palavras === 0) return { status: 422, corpo: { error: "Escreva algo antes de pedir a avaliação." } };
    if (palavras < 20) return { status: 422, corpo: { error: "Escreva um pouco mais (pelo menos 20 palavras) antes de pedir a avaliação." } };
    a.status = "evaluating";
    a.how = "ia";
    setTimeout(() => {
      if (a.status !== "evaluating") return;
      if (modoIa === "falha") {
        Object.assign(a, { status: "submitted", ia_message: "A avaliação por IA falhou. Tente de novo ou corrija você mesmo." });
        return;
      }
      avaliarDeTeste(a);
    }, atraso);
    return { status: 200, corpo: { ok: true } };
  }

  // O navegador chama a rota do servidor por fetch; na prévia não há servidor, então a chamada é atendida aqui.
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const m = /\/api\/dupla\/solo\/([^/]+)\/(evaluate)/.exec(String(url));
    if (m) {
      await new Promise((r) => setTimeout(r, 150));
      const r = await avaliar(decodeURIComponent(m[1]));
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    if (/\/api\/dupla\/solo\//.test(String(url))) return new Response(JSON.stringify({ error: "Impresso sem imagem." }), { status: 404, headers: { "Content-Type": "application/json" } });
    return fetchOriginal(url, init);
  };

  return { respostas, avaliar, ultimo: () => ultimo, resumoEstacao, porEstacaoId };
}
