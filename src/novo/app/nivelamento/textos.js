// Textos fixos do nivelamento (o que o aluno lê). Linguagem simples; números e regras iguais aos da especificação do dono.
// Nada aqui promete aprovação nem compara com a nota de corte do Inep.

export const TITULO = "Diagnóstico de nivelamento";

// Textos do modelo do dono "Início do diagnóstico" (16/10/2026, Web, Tablet 834 px e Mobile). Onde o modelo muda o texto conforme a
// largura, a variante fica ao lado (tablet / celular).
export const APRESENTACAO = {
  titulo: "Vamos conhecer o seu nível",
  antes: "Antes de começar · uma vez só",
  comeceAqui: "Comece aqui",
  subtitulo: "Um diagnóstico rápido mostra onde você está e por onde estudar primeiro.",
  subtituloCelular: "Um teste rápido mostra onde você está e por onde estudar primeiro.",
  numeros: [
    { valor: "15", rotulo: "questões" },
    { valor: "5", rotulo: "grandes áreas", celular: "áreas" },
    { valor: "~30", rotulo: "minutos" },
  ],
  paraQueTitulo: "Para que serve",
  paraQue: [
    "Estimar o seu nível atual de conhecimento médico.",
    "Mostrar em quais das 5 grandes áreas você vai melhor e onde precisa de mais reforço.",
    "Montar o seu plano: o que estudar primeiro e a dificuldade das próximas questões.",
  ],
  paraQueTablet: [
    "Estimar o seu nível atual de conhecimento médico.",
    "Mostrar em quais das 5 grandes áreas você vai melhor e onde precisa de reforço.",
    "Montar o seu plano: o que estudar primeiro e a dificuldade das próximas questões.",
  ],
  voceSaiComTitulo: "Você sai com",
  voceSaiCom: ["Seu nível atual estimado", "Áreas fortes e áreas a reforçar", "Um plano: o que estudar primeiro"],
  comoTitulo: "Como funciona",
  comoNota: "Sem tempo limite · pode pausar",
  comoNotaTablet: "Sem tempo limite",
  como: [
    { titulo: "15 questões agora, 3 de cada grande área", texto: "Com dificuldades variadas, para medir de onde você parte." },
    {
      titulo: "Cerca de 30 minutos",
      texto: "Uns 2 minutos por questão. Não há tempo limite: responda no seu ritmo.",
      tablet: "Uns 2 minutos por questão. Responda no seu ritmo.",
    },
    { titulo: "Sem gabarito durante o diagnóstico", texto: "Não aparecem gabarito, explicação nem dicas. O resultado sai no fim." },
    {
      titulo: "Resultado em duas etapas",
      texto: "Depois das 15, você recebe uma estimativa provisória e pode seguir até 30 questões (6 por área) para um resultado mais informativo.",
      tablet: "Depois das 15, uma estimativa provisória. Se quiser, siga até 30 questões (6 por área) para um resultado mais informativo.",
    },
    { titulo: "Pode parar e continuar depois", texto: "Suas respostas ficam salvas. Você retoma pelo Início, de onde parou." },
  ],
  comoCelular: [
    "3 questões de cada grande área, com dificuldades variadas.",
    "Sem tempo limite. Uns 2 minutos por questão.",
    "Sem gabarito nem dicas até o fim. Depois das 15, siga até 30 se quiser.",
    "Pode parar quando quiser: as respostas ficam salvas.",
  ],
  separacao: "O nivelamento mede conhecimento. Ele não dá XP, Stazia Coins nem pontos da Arena.",
  separacaoCelular: "O nivelamento mede conhecimento. Não vale XP, Stazia Coins nem pontos da Arena.",
  comecar: "Começar o diagnóstico",
  continuar: (feitas, total) => `Continuar de onde parei (${feitas} de ${total})`,
  depois: "Fazer depois",
  depoisAviso: "Se preferir começar depois, o convite fica no Início até você concluir.",
  fechar: "Fechar e fazer depois",
};

export const QUESTOES = {
  rotulo: (bloco) => (bloco === 2 ? "Nivelamento · parte 2 de 2" : "Nivelamento · parte 1"),
  escolha: "Escolha uma alternativa",
  escolhida: (letra) => `Alternativa ${letra} selecionada`,
  confirmar: "Confirmar e seguir",
  confirmada: "Resposta salva",
  finalizar: "Finalizar e ver resultado",
  faltam: (n) => (n === 1 ? "Falta 1 questão sem resposta." : `Faltam ${n} questões sem resposta.`),
  sairTitulo: "Sair do diagnóstico?",
  sairTexto: "As respostas já dadas ficam salvas. Você continua depois pelo Início.",
  sairSim: "Sair e continuar depois",
  sairNao: "Voltar às questões",
};

export const RESULTADO = {
  titulo: "Seu nivelamento",
  selo: "Provisório",
  rotuloPG: "Proficiência estimada",
  acertos: (a, t, pct) => `Acertos: ${a} de ${t} (${pct}%)`,
  acertosNota: "Os acertos brutos ficam à parte: a proficiência leva em conta quantas questões você fez em cada área.",
  porArea: "Por grande área",
  prioridades: "Prioridades de estudo",
  prioridadeItem: (nome, pr) => `${nome} · prioridade ${pr}`,
  comoCalculamosTitulo: "Como calculamos",
  comoCalculamos: [
    "Em cada área: (acertos + 1) ÷ (questões + 2) × 100. Assim, 5 acertos em 6 questões não viram 83,3% de domínio definitivo.",
    "A proficiência geral é a média das 5 áreas, todas com o mesmo peso.",
    "A prioridade de cada área é 100 menos a proficiência dela: quanto maior, mais reforço ela pede.",
    "As faixas de nível são parâmetros internos e provisórios do StaziaMed, não são faixas oficiais do Inep. Elas serão revistas quando houver dados suficientes.",
  ],
  continuar30: "Continuar até 30 questões",
  continuar30Texto: "Mais 15 questões (3 por área) deixam o resultado mais informativo.",
  entrar: "Entrar no StaziaMed",
  inicio: "Ir para o Início",
  verCorrecao: "Ver correção das questões",
  ocultarCorrecao: "Ocultar correção",
  planoComeca: (nome) => `O seu plano de hoje começa por ${nome}.`,
  insuficiente: "Ainda não há questões suficientes em todas as áreas para calcular o nível.",
};

export const CORRECAO = {
  titulo: "Correção do diagnóstico",
  certa: "Você acertou",
  errada: "Você errou",
  comentario: "Comentário",
  semComentario: "O comentário completo aparece quando você resolve esta questão no Banco de Questões.",
};

export const CONVITE = {
  novo: {
    titulo: "Diagnóstico de nivelamento",
    texto: "15 questões (3 por grande área), cerca de 30 minutos. Descubra o seu nível e por onde começar.",
    botao: "Começar",
  },
  andamento: (bloco, feitas, total) => ({
    titulo: "Continue o seu diagnóstico",
    texto: `${feitas} de ${total} questões respondidas${bloco === 2 ? " na segunda parte" : ""}. As respostas ficam salvas.`,
    botao: "Continuar",
  }),
  parcial: (nivel, nome) => ({
    titulo: `Seu nivelamento provisório: Nível ${nivel} · ${nome}`,
    texto: "Responda mais 15 questões (3 por área) para um resultado mais informativo.",
    botao: "Continuar até 30",
    ver: "Ver resultado",
  }),
};
