// Fila do Radar: textos em português e regras puras (testáveis) da tela. Sem acesso a dados.
// Fonte dos valores: supabase/migrations/20261003010100_radar_evidencias.sql e 20261003010200_radar_fila_e_avisos.sql.

export const REFERENCIA_LABEL = {
  vigente: ["Vigente", "success"],
  proposta: ["Proposta em consulta", "warning"],
  revogada: ["Revogada", "danger"],
  evidencia_complementar: ["Evidência complementar", "info"],
  desconhecido: ["Ainda não classificada", "neutral"],
  proibida_samu: ["Fonte proibida (SAMU)", "danger"],
};
export const REFERENCIA_AJUDA = {
  vigente: "Norma em vigor. Pode embasar conduta depois de conferida.",
  proposta: "Ainda é proposta ou consulta pública: não vale como norma.",
  revogada: "Não vale mais. Nada do app deve se apoiar nela.",
  evidencia_complementar: "Recomendação de sociedade médica ou OMS. Ajuda a explicar, mas não é norma do SUS.",
  desconhecido: "Fonte nova: ninguém conferiu ainda o que ela é.",
  proibida_samu: "Protocolos do SAMU não podem ser usados em nenhuma conduta.",
};
export const ORIGEM_LABEL = {
  fonte_oficial_mudou: "A fonte oficial mudou",
  arquivo_local_diferente_do_catalogo: "O arquivo guardado difere do catálogo",
  versoes_divergem_na_biblioteca: "Há versões diferentes na biblioteca",
  documento_novo: "Documento novo",
  adaptador_novo: "Documento novo publicado",
  adaptador_mudou: "Documento alterado",
};
export const STATUS_LABEL = {
  pendente: ["Pendente", "warning"],
  vista: ["Vista", "neutral"],
  em_revisao: ["Em andamento", "info"],
  resolvida: ["Concluída", "success"],
  descartada: ["Sem impacto", "neutral"],
};
export const ACAO_LABEL = {
  sem_impacto: "Sem impacto",
  ajustar_texto: "Ajustar texto",
  refazer: "Refazer",
  encaminhar_revisao: "Encaminhar à revisão",
  concluida: "Concluída",
};
export const ACOES = [
  { value: "sem_impacto", label: "Sem impacto", hint: "A mudança não altera nada do que o app ensina. Encerra o aviso." },
  { value: "ajustar_texto", label: "Ajustar texto", hint: "Basta mudar a redação dos itens que usam a fonte." },
  { value: "refazer", label: "Refazer", hint: "O item precisa ser refeito com a fonte nova." },
  { value: "encaminhar_revisao", label: "Encaminhar à revisão", hint: "Pede nova conferência dos 2 revisores antes de decidir." },
];
export const ACAO_CONCLUIR = { value: "concluida", label: "Concluir", hint: "O trabalho pedido já foi feito. Encerra o aviso." };
export const TIPO_LABEL = {
  questao: ["Questões", "Questão", "questoes"],
  aula: ["Aulas e temas", "Aula ou tema", "aulas"],
  atualizacao: ["Atualizações", "Atualização", "atualizacoes"],
  flashcard: ["Flashcards", "Flashcard", null],
};
export const KIND_LABEL = {
  NUMERIC: "Número ou dose",
  NEGATION: "Negação",
  ADDED: "Trecho novo",
  REMOVED: "Trecho removido",
  REWORDED: "Redação",
  CHANGED: "Texto alterado",
};
export const NOTA_MINIMA = 5;

export const FILTROS = [
  { value: "aguardam", label: "Aguardam você", vazio: "Nenhuma mudança grave pendente" },
  { value: "graves", label: "Graves", vazio: "Nenhuma mudança grave registrada" },
  { value: "leves", label: "Leves", vazio: "Nenhuma mudança leve registrada" },
  { value: "pendentes", label: "Pendentes", vazio: "Nada pendente no momento" },
  { value: "decididos", label: "Decididos", vazio: "Nenhuma mudança decidida ainda" },
  { value: "todas", label: "Todas", vazio: "O Radar ainda não registrou nenhuma mudança" },
];
export const aberto = (e) => ["pendente", "vista", "em_revisao"].includes(e.status);
const REGRAS = {
  aguardam: (e) => Boolean(e.aguarda_dono),
  graves: (e) => e.gravidade === "grave",
  leves: (e) => e.gravidade === "leve",
  pendentes: (e) => aberto(e),
  decididos: (e) => !aberto(e),
  todas: () => true,
};
export const filtrar = (eventos, filtro) => (eventos ?? []).filter(REGRAS[filtro] ?? REGRAS.todas);
export const contar = (eventos) => Object.fromEntries(FILTROS.map((f) => [f.value, filtrar(eventos, f.value).length]));

/** Prazo de 48 h dos 2 revisores: texto curto e tom. Evento encerrado não tem prazo. */
export function prazoInfo(evento, agora = Date.now()) {
  if (!aberto(evento) || !evento.prazo_revisao_ate) return null;
  const falta = Date.parse(evento.prazo_revisao_ate) - agora;
  if (Number.isNaN(falta)) return null;
  const horas = Math.floor(Math.abs(falta) / 3_600_000);
  const dur = horas >= 48 ? `${Math.floor(horas / 24)} dias` : horas >= 1 ? `${horas} h` : "menos de 1 h";
  return falta < 0 ? { texto: `Prazo venceu há ${dur}`, tom: "danger", vencido: true } : { texto: `Faltam ${dur} para o prazo`, tom: horas < 12 ? "warning" : "neutral", vencido: false };
}

/** Itens afetados agrupados por tipo; os de trecho (com página) vêm primeiro. */
export function agruparAfetados(afetados) {
  const grupos = new Map();
  for (const a of afetados ?? []) {
    if (!grupos.has(a.tipo)) grupos.set(a.tipo, []);
    grupos.get(a.tipo).push(a);
  }
  return [...grupos.entries()].map(([tipo, itens]) => ({ tipo, itens, trecho: itens.filter((i) => i.nivel === "trecho").length }));
}

export const paginasTexto = (paginas) => {
  const p = (paginas ?? []).filter((n) => Number.isFinite(n));
  return p.length === 0 ? "" : p.length === 1 ? `página ${p[0]}` : `páginas ${p.join(", ")}`;
};

export const notaValida = (nota) => String(nota ?? "").trim().length >= NOTA_MINIMA;

export const tituloAviso = (n) => (n === 1 ? "1 mudança grave em fonte oficial espera a sua decisão" : `${n} mudanças graves em fontes oficiais esperam a sua decisão`);
