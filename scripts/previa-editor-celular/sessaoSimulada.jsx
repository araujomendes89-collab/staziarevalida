// Substitui src/novo/app/session.jsx só na prévia (ver vite.config.mjs): "banco" em memória com as funções app_* que as telas da
// Administração usam. Tudo é DADO SIMULADO de demonstração, sem login e sem rede.
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const negrito = (t) => ({ f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }] }] }] } });

const ENUNCIADO = "Lactente de 4 meses com coriza há três dias e chiado desde ontem. Qual é a conduta mais adequada?";
const QUESTAO = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 3, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: ENUNCIADO,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id} (texto de exemplo)`, explanation: id === "B" ? "B é a correta (exemplo)." : "" })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte e observação.", inep_intent: "", needs_image: false, images: [], explanations_review: null, comment_review_ready: true,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito de exemplo", source_url: null, published_at: null },
  formatacao: { statement: negrito(ENUNCIADO) },
};
const SECOES = [
  { heading: "Caso clínico de abertura", paragraphs: [{ text: "Helena, 4 meses, com coriza há três dias e chiado desde ontem.", clinical: true, claim_ids: [] }] },
  { heading: "Bloco 1 · Diagnóstico", paragraphs: [{ text: "O diagnóstico é clínico. Não peça raio X de rotina.", clinical: true, claim_ids: [] }] },
];
const UNIDADE = {
  version: { id: "v-previa", unit_id: "u-previa", version: 1, status: "draft", content: { title: "Bronquiolite viral aguda (demonstração)", sections: SECOES }, content_hash: "previa-1", generated_by_model: null, review_flags: [] },
  title: "Bronquiolite viral aguda (demonstração)", area_code: "PEDIATRIA", problems: [], claims: [], materials: [], approvals: [], publications: [],
};

const rpc = async (fn) => {
  await new Promise((r) => setTimeout(r, 30));
  switch (fn) {
    case "app_admin_question":
      return QUESTAO;
    case "app_ch_unit_version":
      return UNIDADE;
    case "app_ch_unit_overview":
      return { pode: { aprovar_medica: true, editar: true } };
    case "app_ch_doc_trava":
      return { minha: true };
    case "app_admin_guideline_updates":
      return { items: [], review_areas: ["PEDIATRIA"], is_admin: true };
    case "app_admin_comunicados":
    case "app_ch_unit_history":
    case "app_ch_unit_materials":
    case "app_admin_topics":
    case "app_lesson_topics":
      return [];
    case "app_admin_comunicado_previa":
      return { destinatarios: 40 };
    default:
      return null;
  }
};

const backend = { rpc, accessToken: async () => "previa", from: () => ({ select: async () => ({ data: [], error: null }) }) };
const valor = { backend, boot: { role: "admin", profile: { name: "Equipe (prévia)" }, reviewer_areas: [] }, user: { id: "previa" }, refresh: async () => {} };

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
