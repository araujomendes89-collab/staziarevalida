// Substitui src/novo/app/session.jsx só na prévia: "banco" em memória com as funções app_* que Editar aula e Unidades usam.
// Sem login e sem rede. O que for salvo fica só nesta aba (e aparece no painel "Como o aluno vê").
import React from "react";

const DEMO_RESUMO =
  "## Diagnóstico\n\nA **bronquiolite viral aguda** é o primeiro episódio de sibilância em menores de 2 anos.\n\n- Quadro: coriza, tosse e sibilos\n- Sinal de gravidade: *tiragem* e saturação baixa\n\n| Achado | Conduta |\n| --- | --- |\n| SpO2 < 92% | Oxigênio |\n| Boa aceitação | Cuidado em casa |";
const DEMO_PONTOS = ["Diagnóstico é **clínico**", "Oxigênio se saturação baixa", "Sem broncodilatador de rotina"];
const DEMO_SECOES = [
  { heading: "Caso clínico de abertura", paragraphs: [{ text: "Helena, 4 meses, com coriza há três dias e chiado desde ontem.", clinical: true, claim_ids: [] }] },
  { heading: "Bloco 1 · Diagnóstico", paragraphs: [{ text: "O diagnóstico é clínico.\nNão peça raio X de rotina.", clinical: true, claim_ids: [] }] },
];

export const estado = { lesson: null, unit: null, notas: [], ouvintes: new Set() };
const avisa = () => estado.ouvintes.forEach((f) => f());

export async function carregarDados() {
  const pega = async (n) => {
    try {
      const r = await fetch(`/@fs/Volumes/StaziaMed/.tmp-aulas/editor-word/dados/${n}`);
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  const [ls, us] = await Promise.all([pega("lessons.json"), pega("units.json")]);
  const l = Array.isArray(ls) && ls.find((x) => x?.summary);
  const u = Array.isArray(us) && us.find((x) => x?.content?.sections?.length);
  estado.lesson = {
    id: "aula-previa",
    area: l?.area || "PEDIATRIA",
    topic: l?.topic || "Bronquiolite",
    title: l?.title || "Bronquiolite viral aguda (demonstração)",
    summary: l?.summary || DEMO_RESUMO,
    key_points: Array.isArray(l?.key_points) && l.key_points.length ? l.key_points.map((k) => (typeof k === "string" ? k : k?.text ?? "")) : DEMO_PONTOS,
    duration_minutes: 20,
    instructor: "",
    specialty: "",
    video_url: "",
    guideline_title: "",
    guideline_url: "",
    published: false,
    position: 0,
    materials: [],
    started_by: 0,
    completed_by: 0,
    updated_at: new Date().toISOString(),
  };
  estado.unit = {
    version: { id: "v-previa", unit_id: "u-previa", version: 1, status: "awaiting_review", content: { title: estado.lesson.title, sections: u?.content?.sections?.length ? u.content.sections : DEMO_SECOES }, content_hash: "previa-1", generated_by_model: null, review_flags: [] },
    title: estado.lesson.title,
    area_code: "PEDIATRIA",
    problems: [],
    claims: [],
    materials: [],
    approvals: [],
    publications: [],
  };
  avisa();
}

const rpc = async (fn, args = {}) => {
  await new Promise((r) => setTimeout(r, 60));
  switch (fn) {
    case "app_admin_lessons":
      return { lessons: estado.lesson ? [estado.lesson] : [] };
    case "app_lesson_topics":
      return [];
    case "app_admin_save_lesson": {
      const { review_note, ...l } = args.p_lesson;
      estado.lesson = { ...estado.lesson, ...l, key_points: (l.key_points ?? []).filter((k) => k.trim()), reviewer: review_note ? "Equipe (prévia)" : estado.lesson.reviewer, reviewed_at: review_note ? new Date().toISOString() : estado.lesson.reviewed_at, review_note: review_note || estado.lesson.review_note };
      avisa();
      return estado.lesson;
    }
    case "app_ch_unit_version":
      return estado.unit;
    case "app_ch_save_unit_version":
      estado.unit = { ...estado.unit, version: { ...estado.unit.version, content: args.p_content, content_hash: "previa-" + Date.now() } };
      avisa();
      return { ok: true };
    case "app_ch_unit_overview":
      return { pode: { aprovar_medica: true } };
    case "app_ch_review_decide":
    case "app_ch_approve":
      estado.notas.push(args.p_note);
      avisa();
      return { ok: true };
    case "app_ch_unit_history":
    case "app_ch_unit_materials":
    case "app_admin_topics":
      return [];
    case "app_ch_review_sheet":
      return null;
    default:
      return null;
  }
};

const backend = { rpc, accessToken: async () => "previa", from: () => ({ select: async () => ({ data: [], error: null }) }) };
const valor = { backend, boot: { role: "admin", profile: { name: "Equipe (prévia)" } }, user: { id: "previa" }, refresh: async () => {} };

export function useSession() {
  return valor;
}
export function useOptionalSession() {
  return valor;
}
export function SessionProvider({ children }) {
  return children;
}
export function rememberChoice() {}
