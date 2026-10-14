// Sessão de mentira só para fotografar a tela: o "banco" devolve o que as funções reais devolveram (dados.json).
import dados from "./dados.json";
const papel = new URLSearchParams(location.search).get("papel") ?? "admin";
const resp = {
  app_ch_units: () => dados.units,
  app_ch_unit_overview_list: () => dados.list,
  app_ch_unit_version: () => dados.versao,
  app_ch_unit_overview: () => {
    const o = structuredClone(dados.overview);
    if (papel === "editor") o.pode = { ...o.pode, aprovar_medica: false, publicar: false, conferir_criticas: false };
    return o;
  },
  app_ch_unit_materials: () => dados.materials,
  app_ch_review_sheet: () => dados.sheet,
  app_ch_unit_history: () => dados.history,
  app_ch_approval_summary: () => dados.summary,
  app_ch_unit_student_preview: () => dados.preview,
  app_ch_claim_can_confirm: () => ({ areas: ["CLINICA_MEDICA"], can: papel === "admin" }),
  app_ch_claim_confidence: () => null,
  app_ch_claim_evidence: () => [],
  app_ch_publish_preview: () => ({}),
};
export const backend = { accessToken: async () => "teste", rpc: async (fn) => (resp[fn] ? resp[fn]() : true) };
export const useSession = () => ({ backend, boot: { role: papel, profile: { name: "Equipe" }, reviewer_areas: [] }, user: { id: "a" } });
