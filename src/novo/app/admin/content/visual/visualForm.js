// Formulário do "Novo material visual": estado da tela ↔ campos do comando (os nomes que a validação usa).
import { MODEL_FIELDS, VISUAL_MODELS, validateVisualInput } from "../../../../../shared/visualMaterials";

export const SPECIALTY_OPTIONS = [
  { value: "", label: "Escolha a especialidade" },
  { value: "ginecologia", label: "Ginecologia (rosa)" },
  { value: "pediatria", label: "Pediatria (azul)" },
  { value: "clinica_medica", label: "Clínica Médica (verde)" },
  { value: "cirurgia", label: "Cirurgia (vermelho)" },
  { value: "preventiva_mfc", label: "Preventiva/MFC (roxo)" },
  { value: "outra", label: "Outra especialidade (turquesa/petróleo)" },
];

export const MODEL_ICON = { feed: "square", a4: "file-text", story: "smartphone", flashcard_digital: "layers", flashcard_a6: "printer" };

export const STATUS = {
  draft: ["Rascunho", "neutral"],
  queued: ["Na fila", "info"],
  rendering: ["Gerando", "info"],
  ready: ["Pronto", "success"],
  check_failed: ["Reprovado na conferência", "warning"],
  failed: ["Falhou", "danger"],
};

export const SIDE_LABEL = { single: "", front: "frente", back: "verso", pair: "frente e verso" };

const blankRow = (n) => ({ celulas: Array(n).fill(""), tipo: "normal" });

export function emptyForm(model = "feed") {
  return {
    modelo: model,
    especialidade: "",
    especialidade_nome: "",
    titulo: "",
    subtitulo: "",
    resumo: "",
    resumo_paragrafo: "",
    dado_chave: "",
    pontos_chave: "",
    tabela: { titulo: "", ncols: 3, colunas: ["", "", ""], linhas: [blankRow(3), blankRow(3)] },
    ilustracao: { tipo: "nenhuma", icone: "coracao", imagem: "", legenda: "", alt: "" },
    pegadinha: "",
    tome_nota: "",
    fonte: "",
    atualizacao: "",
    selo_prova: "",
    paginacao: "",
    bloco: { titulo: "", itens: "" },
    mnemonico: { titulo: "", itens: Array.from({ length: 4 }, () => ({ letra: "", texto: "" })) },
    card_id: "",
    ordem: 1,
    lote: "",
    nivel: "",
    tema: "",
    pergunta: "",
    resposta: "",
    explicacao: "",
    como_lembrar: "",
    referencia: "",
  };
}

/** Estado da tela → entrada da validação (o que o servidor e o comando recebem). */
export function toInput(form) {
  const n = form.tabela.ncols;
  const colunas = form.tabela.colunas.slice(0, n).map((c) => c.trim());
  const linhas = form.tabela.linhas.map((r) => ({ celulas: r.celulas.slice(0, n).map((c) => c.trim()), tipo: r.tipo })).filter((r) => r.celulas.some(Boolean));
  const tabela = colunas.some(Boolean) || linhas.length ? { titulo: form.tabela.titulo, colunas, linhas } : null;
  const bloco = form.bloco.titulo.trim() || form.bloco.itens.trim() ? { titulo: form.bloco.titulo, itens: form.bloco.itens } : null;
  const itens = form.mnemonico.itens.filter((i) => i.letra.trim() || i.texto.trim());
  const mnemonico = form.mnemonico.titulo.trim() || itens.length ? { titulo: form.mnemonico.titulo, itens } : null;
  const outra = form.especialidade === "outra";
  return {
    ...form,
    especialidade: outra ? "fallback" : form.especialidade,
    especialidade_nome: outra ? form.especialidade_nome : "",
    tabela,
    bloco,
    mnemonico,
    ilustracao: { ...form.ilustracao, imagem: form.ilustracao.tipo === "imagem" ? form.ilustracao.imagem : "" },
  };
}

/** Conteúdo salvo (ou validado) → estado da tela. */
export function fromContent(c) {
  const f = emptyForm(c.model);
  const n = c.tabela?.colunas?.length === 2 ? 2 : 3;
  const pad = (arr, len) => [...(arr ?? []), ...Array(Math.max(0, len - (arr ?? []).length)).fill("")].slice(0, len);
  return {
    ...f,
    ...Object.fromEntries(
      ["titulo", "subtitulo", "resumo", "resumo_paragrafo", "dado_chave", "pegadinha", "tome_nota", "fonte", "atualizacao", "selo_prova", "paginacao", "card_id", "lote", "nivel", "tema", "pergunta", "resposta", "explicacao", "como_lembrar", "referencia"].map((k) => [k, c[k] ?? ""])
    ),
    modelo: c.model,
    especialidade: c.specialty?.key === "fallback" ? "outra" : (c.specialty?.key ?? ""),
    especialidade_nome: c.specialty?.key === "fallback" ? (c.specialty?.label ?? "") : "",
    ordem: c.ordem ?? 1,
    pontos_chave: (c.pontos_chave ?? []).join("\n"),
    tabela: c.tabela
      ? { titulo: c.tabela.titulo ?? "", ncols: n, colunas: pad(c.tabela.colunas, 3), linhas: (c.tabela.linhas.length ? c.tabela.linhas : [blankRow(3)]).map((r) => ({ celulas: pad(r.celulas, 3), tipo: r.tipo ?? "normal" })) }
      : f.tabela,
    ilustracao: { ...f.ilustracao, ...(c.ilustracao ?? {}) },
    bloco: c.bloco ? { titulo: c.bloco.titulo ?? "", itens: (c.bloco.itens ?? []).join("\n") } : f.bloco,
    mnemonico: c.mnemonico ? { titulo: c.mnemonico.titulo ?? "", itens: [...c.mnemonico.itens, ...f.mnemonico.itens].slice(0, 4) } : f.mnemonico,
  };
}

/** Junta um comando colado ao que já está na tela (o colado vence). */
export function mergeCommand(form, parsedInput) {
  const merged = { ...toInput(form), ...parsedInput };
  // especialidade nova no comando, sem nome: o nome digitado antes não vale para ela
  if ("especialidade" in parsedInput && !("especialidade_nome" in parsedInput)) merged.especialidade_nome = "";
  return fromContent(validateVisualInput(merged).content);
}

export const shows = (model, field) => MODEL_FIELDS[model]?.includes(field);
export const isPair = (model) => Boolean(VISUAL_MODELS[model]?.pair);
