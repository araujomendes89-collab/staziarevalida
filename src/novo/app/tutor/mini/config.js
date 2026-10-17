// Mini Tutor (pedido do dono, 17/10/2026): as DECISÕES PADRÃO ficam todas aqui para o dono mudar sem mexer na tela.
// Mudou alguma? Troque o valor e rode os testes (src/__tests__/miniTutor*.test.tsx).

export const MINI_TUTOR = {
  /** Simulado em andamento: o mini tutor fica travado até a entrega (decisão 3). false libera (NÃO recomendado: daria pista na prova). */
  travarSimuladoEmAndamento: true,
  /**
   * Antes de responder, o mini tutor só dá pistas (decisão 4). O servidor tem 5 níveis de pista e o 5º pode entregar a alternativa:
   * o mini tutor para no 4º e pede para o aluno responder.
   */
  pistaMaxima: 4,
  /** Mostra o aviso "restam poucas" quando sobram até este número de mensagens de texto hoje. */
  avisoPoucasMensagens: 3,
  /** Celular: abaixo desta largura a janelinha vira uma folha que sobe de baixo. */
  larguraCelular: 720,
  /**
   * Janelinha no computador (px). Ela procura uma coluna livre ao lado da questão/aula (larguras em ordem de preferência).
   * Sem coluna livre (notebooks até ~1600 px), a página abre espaço à direita e a janelinha fica ali, sem cobrir o texto
   * (`abrirEspacoNaPagina`; false = fica por cima, no canto que menos cobre).
   */
  janela: { larguras: [360, 320], altura: 520, alturaMin: 300 },
  abrirEspacoNaPagina: true,
  /** O que a janelinha não cobre quando a tela não diz (resultado: a coluna da página; aula: capa, índice e coluna de leitura). */
  evitarPadrao: "main, .al-cover, .al-main, .al-side",
  /** Barras presas no topo: a janelinha fica abaixo delas. */
  cabecalhos: "header, .al-bar",
  /**
   * Folha do celular (fração da altura da tela): três alturas, trocadas arrastando o puxador (para baixo menor/minimiza, para cima
   * maior) ou pelo botão de aumentar. Ela cobre o rodapé da questão; para responder, minimize (um toque).
   */
  folha: { compacta: 0.34, media: 0.45, alta: 0.8, inicial: "media" },
  /** Voz ao vivo dentro do mini tutor (gasta os minutos de voz do dia). false esconde o microfone. */
  vozLigada: true,
  /**
   * Voz ANTES de responder a questão. Desligada: a voz do Tutor tem a ferramenta de "mostrar a resolução" quando o aluno pede com
   * todas as letras, o que furaria a decisão 4 (só pistas antes de responder). Depois de responder, na aula e na revisão, a voz abre.
   */
  vozAntesDeResponder: false,
  /** Rota dos planos (convite quando o saldo acaba; nada é cobrado pelo app). */
  rotaPlanos: "/planos",
};

/** Textos que o aluno vê (português simples). */
export const TEXTOS = {
  rotuloBolinha: (nome) => `Abrir o mini tutor (${nome})`,
  travadoTitulo: "O Tutor ajuda depois que você entregar o simulado",
  travadoTexto: "Simulado é treino de prova: sem ajuda até o fim. Quando você entregar, eu explico cada questão com você.",
  antesDeResponder: "Posso te dar pistas e te ajudar no raciocínio. A resposta certa eu só conto depois que você responder.",
  depoisDeResponder: "Você já respondeu: agora posso explicar tudo, inclusive a alternativa certa e por que as outras estão erradas.",
  aula: (tema) => `Dúvida na aula de ${tema}? Pergunte aqui que eu explico.`,
  livre: "Pergunte o que quiser sobre o que você está estudando.",
  pistasAcabaram: "Já te dei todas as pistas desta questão. Agora é com você: responda e eu explico tudo.",
  saldoAcabouTitulo: "Seu saldo do Tutor de hoje acabou",
  saldoAcabouTexto: "Amanhã tem mais. Nos planos você conversa mais com o Tutor por dia.",
  vozDepois: "A voz abre depois que você responder. Antes disso, eu te dou pistas por escrito.",
  vozAcabou: "Seus minutos de voz de hoje acabaram. Você ainda pode escrever.",
  inedita: "O Tutor ainda não comenta as Questões Inéditas. Nas questões das provas oficiais ele te ajuda.",
  anulada: "Esta questão foi anulada pela banca, então o Tutor não comenta ela.",
};
