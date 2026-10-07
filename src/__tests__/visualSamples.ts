/**
 * Textos de TESTE para os materiais visuais: só conferem encaixe, fontes e cores. Não são conteúdo
 * clínico (nada aqui deve ser publicado nem usado como material de estudo). Os tamanhos imitam
 * textos reais e usam acentos e símbolos (≥ ≤ ± µ °) para conferir as fontes.
 */
export const PIECE_SAMPLE = {
  titulo: "Título de teste do tema",
  subtitulo: "Subtítulo de teste",
  resumo: "Resumo de teste em uma linha só",
  selo_prova: "Teste 2026",
  atualizacao: "2026",
  paginacao: "1/1",
  pontos_chave: ["Ponto-chave de teste número um, com acentuação: ação, mão", "Segundo ponto de teste — valores ≥ 10 e ≤ 20", "Terceiro ponto de teste para conferir o encaixe"],
  ilustracao: { tipo: "icone", icone: "coracao", legenda: "Ilustração de teste" },
  tabela: {
    colunas: ["Coluna A", "Coluna B", "Coluna C"],
    linhas: [
      { celulas: ["Linha 1", "Valor ± 1", "Valor 2"], tipo: "normal" },
      { celulas: ["Linha 2", "Valor 3", "Valor 4"], tipo: "normal" },
    ],
  },
  pegadinha: "Texto de teste da pegadinha: confere que a caixa continua no vermelho de alerta.",
  tome_nota: "Anotação de teste em letra manuscrita.",
  fonte: "Fonte: texto de teste · não é conteúdo clínico",
};

export const A4_SAMPLE = {
  ...PIECE_SAMPLE,
  dado_chave: "Dado de teste",
  resumo_paragrafo: "Parágrafo de teste com duas a quatro linhas para situar o tema antes dos detalhes. Serve só para conferir o encaixe do texto na página A4.",
  pontos_chave: [
    "Destaque de teste 1 — detalhe de teste em uma ou duas linhas",
    "Destaque de teste 2 — detalhe de teste em uma ou duas linhas",
    "Destaque de teste 3 — detalhe de teste em uma ou duas linhas",
    "Destaque de teste 4 — detalhe de teste em uma ou duas linhas",
  ],
  tabela: {
    titulo: "Tabela de teste",
    colunas: ["Coluna A", "Coluna B", "Coluna C"],
    linhas: [
      { celulas: ["Linha 1", "Valor", "Valor"], tipo: "normal" },
      { celulas: ["Linha 2 — destaque", "Valor", "Valor"], tipo: "destaque" },
      { celulas: ["Linha 3", "Valor", "Valor"], tipo: "normal" },
      { celulas: ["Linha 4 — alerta", "Valor", "Valor"], tipo: "alerta" },
    ],
  },
  bloco: { titulo: "Bloco de teste", itens: ["Item de teste 1", "Item de teste 2", "Item de teste 3"] },
  mnemonico: { titulo: "Mnemônico de teste", itens: [{ letra: "A", texto: "Item A" }, { letra: "B", texto: "Item B" }, { letra: "C", texto: "Item C" }, { letra: "D", texto: "Item D" }] },
};

export const CARD_SAMPLE = {
  nivel: "Teste",
  tema: "Tema de teste",
  pergunta: "Pergunta de teste para conferir o encaixe da frente do card?",
  resposta: "Resposta curta de teste",
  explicacao: "Explicação de teste com algumas linhas. Serve só para conferir o encaixe do texto no verso do flashcard digital, sem conteúdo clínico.",
  como_lembrar: "Dica de teste para lembrar, com algumas linhas de texto para conferir o encaixe da caixa.",
  pegadinha: "Pegadinha de teste: continua no vermelho de alerta.",
  referencia: "Referência de teste (não é conteúdo clínico).",
  fonte: "Fonte de teste",
  atualizacao: "2026",
};

export const SPECIALTY_SAMPLES = ["ginecologia", "pediatria", "clinica_medica", "cirurgia", "preventiva_mfc"] as const;
