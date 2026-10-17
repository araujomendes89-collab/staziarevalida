// Textos do onboarding (português simples, sem prometer o que ainda não existe).

export const TITULO = "Primeiros passos";

/**
 * Cenas da apresentação (cerca de 60 a 90 s de leitura no total). `pose`: Personagem.jsx. `itens`: atalhos ilustrados
 * (ícone do app + nome) que aparecem embaixo do texto, só para mostrar onde fica cada coisa. Funções recebem o contexto real
 * (número de questões oficiais do banco, Arena ligada) para nunca escrever número inventado.
 */
export const CENAS = [
  {
    id: "oi",
    pose: "acenando",
    titulo: (c) => (c.temStazia ? "Oi! Nós somos o Stazi e a Stazia." : "Oi! Eu sou o Stazi."),
    texto: () =>
      "Em pouco mais de um minuto mostramos como o StaziaMed organiza a sua preparação para o Revalida. Depois você monta o seu estudo em poucos toques.",
  },
  {
    id: "plano",
    pose: "estudando",
    titulo: () => "Todo dia, um Plano de Hoje",
    texto: () =>
      "Você conta quanto tempo tem por dia e o app monta as tarefas: praticar questões e rever o que errou. Depois do nivelamento, ele começa pela área que mais precisa.",
    itens: [
      ["list-checks", "Plano de Hoje"],
      ["file-question", "Praticar"],
      ["notebook-pen", "Revisar"],
    ],
  },
  {
    id: "questoes",
    pose: "pensando",
    titulo: () => "Questões oficiais, com comentário",
    texto: (c) =>
      `${c.questoes > 0 ? `São ${c.questoes.toLocaleString("pt-BR")} questões oficiais das provas do Inep` : "As questões oficiais das provas do Inep ficam"} separadas por grande área e tema. Treine do seu jeito ou faça simulados com tempo de prova.`,
    areas: true,
  },
  {
    id: "tutor",
    pose: "polegar",
    titulo: () => "Um Tutor que conversa com você",
    texto: (c) =>
      `${c.temStazia ? "O Stazi e a Stazia tiram" : "O Tutor tira"} dúvidas, explicam a questão e revisam com você, por texto e, conforme o seu plano, por voz. Você escolhe quem acompanha e o jeito: mais calmo ou mais firme.`,
    itens: [["sparkles", "Tutor com IA"]],
  },
  {
    id: "evolucao",
    pose: "orgulho",
    titulo: () => "Você vê a sua evolução",
    texto: (c) =>
      `Desempenho por área, caderno de erros e flashcards com revisão espaçada${c.arena ? ". Na Stazia Arena, missões e ranking ajudam a manter o ritmo" : ""}.`,
    itens: (c) => [["chart-column", "Desempenho"], ["layers", "Flashcards"], ...(c.arena ? [["trophy", "Stazia Arena"]] : [])],
  },
  {
    id: "vamos",
    pose: "comemorando",
    titulo: () => "Agora é com você",
    texto: () => "São 7 perguntas rápidas. Dá para mudar tudo depois, na sua Conta.",
  },
];

export const DIAS = [
  [1, "Seg", "segunda"],
  [2, "Ter", "terça"],
  [3, "Qua", "quarta"],
  [4, "Qui", "quinta"],
  [5, "Sex", "sexta"],
  [6, "Sáb", "sábado"],
  [0, "Dom", "domingo"],
];
export const DIAS_PADRAO = [1, 2, 3, 4, 5];

export const JEITOS = [
  { id: "questoes", icone: "file-question", titulo: "Resolvendo questões", texto: "Aprendo errando e lendo o comentário." },
  { id: "aulas", icone: "book-open", titulo: "Teoria primeiro", texto: "Leio o tema e depois pratico." },
  { id: "flashcards", icone: "layers", titulo: "Revisão rápida", texto: "Flashcards todos os dias, pouco tempo." },
  { id: "misto", icone: "route", titulo: "Um pouco de tudo", texto: "Misturo teoria, questões e revisão." },
];

/** Personalidades por personagem (as 4 decididas pelo dono em 17/10). */
export const JEITOS_TUTOR = {
  stazi: [
    { id: "acolhedor", nome: "Tranquilo", texto: "Calmo e paciente. Explica com calma e incentiva.", pose: "calmo" },
    { id: "durao", nome: "Durão", texto: "Firme e direto, sem passar a mão na cabeça.", pose: "firme" },
  ],
  stazia: [
    { id: "tranquila", nome: "Tranquila", texto: "Calma e paciente. Explica com calma e incentiva.", pose: "calmo" },
    { id: "durona", nome: "Durona", texto: "Firme e direta, sem passar a mão na cabeça.", pose: "firme" },
  ],
};

export const NOME_FASE = {
  teoria: "1ª fase · Revalida e ENAMED",
  pratica: "2ª fase · prova prática",
  as_duas: "As duas fases",
};

export const PASSOS_TEXTO = {
  fase: { titulo: "Para qual prova você vai estudar?" },
  prova: { titulo: "Quando é a sua prova?", sub: "A data aparece no Início, com a contagem de dias." },
  rotina: { titulo: "Quanto tempo por dia, e em quais dias?", sub: "O tempo por dia define quantas questões entram no seu Plano de Hoje." },
  dificuldades: { titulo: "Em quais áreas você sente mais dificuldade?", sub: "Marque quantas quiser. Se fizer o nivelamento, o plano usa o resultado dele." },
  jeito: { titulo: "Como você prefere estudar?" },
  tutor: { titulo: "Quem vai te acompanhar no Tutor?", sub: "Escolha o personagem e o jeito. Dá para trocar a qualquer hora no Tutor." },
  lembretes: { titulo: "Quer lembretes para estudar?" },
};

/** Os jeitos firmes (Durão, Durona) o próprio Tutor confirma na primeira conversa; aqui fica só a preferência. */
export const JEITOS_FIRMES = ["durao", "durona"];
export const AVISO_JEITO_FIRME = "O jeito firme é confirmado com você na primeira conversa com o Tutor. Até lá, ele começa no jeito calmo.";

export const AVISO_LEMBRETES =
  "Por enquanto guardamos só a sua preferência: o app ainda não envia lembretes. Quando passar a enviar, ele vai usar o horário e os dias que você escolheu.";

/** Dicas de primeiro uso das áreas avançadas: rota → dica. */
export const DICAS = {
  arena: {
    rotas: ["missoes", "classificacao", "conquistas", "trilha"],
    icone: "trophy",
    titulo: "Primeira vez na Stazia Arena?",
    texto: "Aqui o estudo vira jogo: trilha, missões do dia, ranking da semana e conquistas. Tudo conta a partir das questões que você resolve.",
  },
  simulados: {
    rotas: ["simulados"],
    icone: "timer",
    titulo: "Primeira vez nos Simulados?",
    texto: "Monte uma prova com tempo, como no dia do Revalida. Dá para pausar e continuar depois; o resultado sai no fim.",
  },
  flashcards: {
    rotas: ["flash"],
    icone: "layers",
    titulo: "Primeira vez nos Flashcards?",
    texto: "Revisão espaçada: cada cartão volta no dia certo para você não esquecer. Responda com sinceridade se lembrou ou não.",
  },
  caderno_erros: {
    rotas: ["erros"],
    icone: "notebook-pen",
    titulo: "Primeira vez no Caderno de Erros?",
    texto: "Toda questão que você erra vem para cá. Rever os erros é a revisão que mais rende.",
  },
  analise: {
    rotas: ["analise"],
    icone: "chart-pie",
    titulo: "Primeira vez na Análise Inteligente?",
    texto: "O Tutor lê os seus erros e acertos e mostra o que se repete e por onde melhorar. Quanto mais você estuda, mais ela diz.",
  },
  planejamento: {
    rotas: ["plano"],
    icone: "calendar-days",
    titulo: "Primeira vez no Planejamento?",
    texto: "O cronograma até a prova, a partir da data da prova e do tempo por dia que você escolheu.",
  },
  fase2: {
    rotas: ["home2", "estacoes", "teoria2", "dupla", "peps", "paciente", "desempenho2"],
    icone: "clipboard-list",
    titulo: "Primeira vez na 2ª fase?",
    texto: "Aqui ficam as estações práticas, os checklists e o treino da prova prática.",
  },
};

export const dicaDaRota = (rota) => Object.entries(DICAS).find(([, d]) => d.rotas.includes(rota)) ?? null;

/** Passos do tour no painel real: cada um procura o primeiro marcador data-tour visível da lista `alvos`. */
export const TOUR = [
  {
    id: "plano",
    alvos: ["plano-de-hoje", "nav-hoje", "nav-jornada"],
    // o cartão do Início chega depois dos dados: espera um pouco por ele antes de usar o menu
    esperarPreferido: true,
    titulo: "Seu Plano de Hoje",
    texto: "Comece sempre por aqui: as tarefas do dia, montadas com o seu tempo por dia e, depois do nivelamento, com o seu nível.",
  },
  {
    id: "questoes",
    alvos: ["questoes"],
    titulo: "Banco de Questões",
    texto: "Questões oficiais por área e tema, com comentário. Monte um treino livre ou um simulado com tempo.",
  },
  {
    id: "tutor",
    alvos: ["tutor"],
    titulo: "Tutor com IA",
    texto: "Tire dúvidas, peça a explicação de uma questão ou revise um tema conversando.",
  },
  {
    id: "evolucao",
    alvos: ["evolucao", "mais"],
    titulo: "Minha evolução",
    texto: "Desempenho por área, Análise Inteligente e o Planejamento até a prova.",
    textoAlvo: { mais: "Em Mais ficam Minha evolução (desempenho e análise), o Planejamento, a Stazia Arena e as outras áreas." },
  },
  {
    id: "conta",
    alvos: ["conta"],
    titulo: "Sua conta e a ajuda",
    texto: "Para rever esta apresentação ou este tour, abra a sua Conta e depois Ajuda e suporte.",
  },
];
