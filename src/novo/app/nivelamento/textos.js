// Textos fixos do nivelamento (o que o aluno lê). Linguagem simples; números e regras iguais aos da especificação do dono.
// Nada aqui promete aprovação nem compara com a nota de corte do Inep.

export const TITULO = "Diagnóstico de nivelamento";

export const APRESENTACAO = {
  titulo: "Vamos conhecer o seu nível",
  subtitulo: "Antes de começar, um diagnóstico rápido mostra onde você está e por onde estudar primeiro.",
  paraQue: [
    "Estimar o seu nível atual de conhecimento médico.",
    "Mostrar em quais das 5 grandes áreas você vai melhor e onde precisa de mais reforço.",
    "Montar o seu plano: o que estudar primeiro e a dificuldade das próximas questões.",
  ],
  comoFunciona: [
    "15 questões agora: 3 de cada grande área (Clínica Médica, Cirurgia, Pediatria, Ginecologia e Obstetrícia e Medicina de Família e Comunidade), com dificuldades variadas.",
    "Leva cerca de 30 minutos (uns 2 minutos por questão). Não há tempo limite: responda no seu ritmo.",
    "Durante o diagnóstico não aparecem gabarito, explicação nem dicas. O resultado sai no fim.",
    "Depois das 15, você recebe uma estimativa provisória e pode continuar até 30 questões (6 por área) para um resultado mais informativo.",
    "Pode parar e continuar depois: as suas respostas ficam salvas.",
  ],
  separacao: "O nivelamento mede conhecimento. Ele não dá XP, Stazia Coins nem pontos da Arena.",
  comecar: "Começar o diagnóstico",
  continuar: (feitas, total) => `Continuar de onde parei (${feitas} de ${total})`,
  depois: "Fazer depois",
  depoisAviso: "Se preferir começar depois, o convite fica no Início até você concluir.",
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
