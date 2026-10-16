// Rótulos da tela de Unidades (tudo em português simples).
export const TIPO_MATERIAL = {
  texto_aula: "Texto da aula",
  tabela: "Tabela",
  questoes_fixacao: "Questões de fixação",
  flashcards_ilustrados: "Flashcards ilustrados",
  revisao_aula: "Revisão da Aula",
  pdf_interativo: "PDF interativo",
  pdf_a4: "PDF da página A4",
  card_feed: "Card de feed",
  story: "Story",
  flashcards_a6: "Flashcards A6",
  audio: "Áudio",
  video: "Vídeo",
};

/** O que cada tipo é, para a equipe saber onde ele aparece. */
export const DESCRICAO_MATERIAL = {
  texto_aula: "O texto que o aluno lê na página da aula.",
  tabela: "Tabela dentro da página da aula.",
  questoes_fixacao: "Questões originais StaziaMed, com explicação por letra.",
  flashcards_ilustrados: "Alimentam toda a plataforma: baralho, revisão espaçada e Tutor.",
  revisao_aula: "Imagem da página A4, exibida dentro da página da aula. O aluno não baixa.",
  pdf_interativo: "PDF para uso interno. O aluno nunca baixa PDF.",
  pdf_a4: "PDF da página A4 para uso interno.",
  card_feed: "Peça para divulgação. Só a equipe.",
  story: "Peça para divulgação. Só a equipe.",
  flashcards_a6: "Cartões para impressão. Só a equipe.",
  audio: "Player dentro da aula, sem download.",
  video: "Player dentro da aula, sem download.",
};

export const SO_EQUIPE = ["pdf_interativo", "pdf_a4", "card_feed", "story", "flashcards_a6"];

export const POSICAO = (secoes) => [
  { value: "0", label: "Antes da aula" },
  ...secoes.map((s, i) => ({ value: String(i + 1), label: `Depois da seção ${i + 1}${s.titulo || s.heading ? `: ${s.titulo || s.heading}` : ""}` })),
  { value: "99", label: "No fim da aula" },
];
export const nomePosicao = (pos, secoes) => POSICAO(secoes).find((o) => o.value === String(pos))?.label ?? `Depois da seção ${pos}`;

export const ACAO_HISTORICO = {
  "unit.import": "Aula importada",
  "unit.new_version": "Versão para corrigir criada",
  "unit.regenerate": "Materiais gerados de novo",
  "unit.material.insert": "Material inserido",
  "unit.material.retire": "Material retirado",
  "unit.material.restore": "Material devolvido à lista",
  "unit.material.edit": "Legenda ou transcrição alterada",
  "unit.material.format": "Formatação da legenda ou transcrição alterada (aprovações mantidas)",
  "approve.medical": "Aprovação médica",
  "approve.editorial": "Aprovação editorial",
  "approval.invalidate": "Aprovações deixaram de valer",
  "unit.format": "Formatação alterada (aprovações mantidas)",
  "unit.editor_assumido": "Edição assumida no editor completo",
  "review.decision": "Decisão do revisor na ficha",
  "review.sheet_import": "Ficha do revisor importada",
  publish: "Publicada ao aluno",
  retire: "Retirada do ar",
};

export const dataHora = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
export const dataCurta = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "—");
export const curto = (h) => (h ? `${String(h).slice(0, 8)}…` : "—");
export const ehObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
