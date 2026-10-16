// Sessão e banco SIMULADOS da prévia da onda 4. Nada sai do navegador; textos de exemplo marcados "(teste)" nas atualizações.
import temasJson from "../grandes-temas/temas.json";

const AREAS_ORDEM = ["cm", "cir", "go", "ped", "mfc", "sc", "sm"];
const temas = temasJson.temas.map((t, i) => ({
  id: t.id, order: t.ordem, title: t.titulo, area: t.area, area_name: t.area_nome, subarea: t.subarea, status: t.status,
  total: i % 5 === 3 ? 0 : 3 + ((i * 7) % 40), by_exam: i % 5 === 3 ? {} : { "revalida-2024-1": 2, "enamed-2025": 1, "revalida-2023-2": 1 },
}));
const TEMAS = {
  method: "Os 100 Grandes Temas são uma seleção pedagógica do StaziaMed, não um ranking oficial do Inep nem uma previsão de prova. A contagem de cada tema é o número de questões oficiais catalogadas (Revalida e ENAMED) ligadas a ele; questões anuladas ficam de fora.",
  official_total: 1217, annulled: 83, linked: 701, unlinked: 516,
  areas: AREAS_ORDEM.map((id) => ({ id, name: temasJson.areas[id], themes: temas.filter((t) => t.area === id).length, questions: temas.filter((t) => t.area === id).reduce((s, t) => s + t.total, 0) })),
  themes: temas,
};
const COM_AULA = temas.filter((_, i) => i % 3 !== 2).map((t) => t.id);

const ATU_AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "PEDIATRIA", "GINECOLOGIA_OBSTETRICIA", "MEDICINA_FAMILIA_COMUNIDADE"];
const ATU = Array.from({ length: 14 }, (_, i) => ({
  id: String(i + 1), slug: `atual-2026-10-14-teste-${i + 1}`, area: ATU_AREAS[i % 5], topic: `Atualização de exemplo ${i + 1} (teste)`, subtopic: null,
  years: [i % 2 ? 2025 : 2026], priority: i < 4 ? 1 : 3, publication_label: "2026 (documento de teste)", institution: "Órgão oficial de exemplo (teste)",
  document_title: "Documento de teste", source_url: null, before_text: "Texto de antes (teste).", current_conduct: "Resumo da conduta vigente de exemplo (teste), em uma ou duas linhas para ver o cartão.", reviewed: true, published: true,
}));

export const fakeBackend = {
  async rpc(fn, args = {}) {
    await new Promise((r) => setTimeout(r, 60));
    if (fn === "app_grandes_temas") return TEMAS;
    if (fn === "app_temas_com_aula") return COM_AULA;
    if (fn === "app_guideline_updates") {
      const items = ATU.filter((i) => (!args.p_area || i.area === args.p_area) && (!args.p_year || i.years.includes(args.p_year)) && (!args.p_search || i.topic.toLowerCase().includes(String(args.p_search).toLowerCase())));
      const by_area = {};
      ATU.forEach((i) => { by_area[i.area] = (by_area[i.area] ?? 0) + 1; });
      return { total: ATU.length, by_area, years: [2025, 2026], items };
    }
    if (fn === "app_flashcards") return { counts: { due: 0, new: 0, learning: 0, consolidated: 0, total: 0 }, queue: [] };
    if (fn === "app_flashcards_ilustrados") return {};
    throw new Error(`rpc não simulada na prévia: ${fn}`);
  },
};
const sessao = { status: "ready", backend: fakeBackend, user: { id: "u-previa" }, boot: { role: "student", profile: { name: "Aluno de Teste" } }, refresh: async () => {}, signOut: async () => {} };
export const useSession = () => sessao;
export const SessionProvider = ({ children }) => children;
