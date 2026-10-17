// Regras de tela do onboarding (só apresentação; quem decide acesso e o que foi feito é o banco: app_onboarding_estado).
// Os passos que aparecem dependem do retrato do servidor: quem só tem a 2ª fase (PRÁTICA) não faz o nivelamento, a equipe idem.

/** Passos do onboarding na ordem do banco (onboarding_ordem). "apresentacao" tem cenas próprias, que não são salvas uma a uma. */
export const ORDEM = ["apresentacao", "fase", "prova", "rotina", "dificuldades", "jeito", "tutor", "lembretes", "nivelamento", "trilha", "fim"];
/** As perguntas da configuração (a parte "Seu estudo"). */
export const PERGUNTAS = ["fase", "prova", "rotina", "dificuldades", "jeito", "tutor", "lembretes"];

/** As 4 etapas grandes que aparecem na barra de progresso. */
export const ETAPAS = [
  { id: "apresentacao", rotulo: "Apresentação", passos: ["apresentacao"] },
  { id: "estudo", rotulo: "Seu estudo", passos: PERGUNTAS },
  { id: "nivelamento", rotulo: "Nivelamento", passos: ["nivelamento"] },
  { id: "plano", rotulo: "Seu plano", passos: ["trilha"] },
];

export const ordem = (passo) => ORDEM.indexOf(passo);

/** Passos que este aluno vê, na ordem. O nivelamento só entra para quem ele cabe e ainda não terminou. */
export function passosVisiveis(estado) {
  const niv = estado?.nivelamento;
  const comNivelamento = Boolean(niv?.cabe) && !niv?.concluido;
  return ORDEM.filter((p) => p !== "fim" && (p !== "nivelamento" || comNivelamento));
}

/** Onde retomar: o primeiro passo visível que não ficou para trás do passo mais adiantado salvo no servidor. */
export function passoInicial(estado, inicio) {
  const visiveis = passosVisiveis(estado);
  if (inicio && visiveis.includes(inicio)) return inicio;
  if (!estado || estado.status === "completed" || estado.status === "skipped") return visiveis[0];
  const alvo = ordem(estado.passo_atual || "apresentacao");
  return visiveis.find((p) => ordem(p) >= alvo) ?? "trilha";
}

/** Etapa grande (1 a 4) de um passo, para a barra de progresso; a etapa do nivelamento some quando ele não entra. */
export function etapasVisiveis(estado) {
  const visiveis = passosVisiveis(estado);
  return ETAPAS.filter((e) => e.passos.some((p) => visiveis.includes(p)));
}

/** Os "Primeiros passos" do Início: [id, texto, rota, consulta]. O "feito" vem do banco (ação real), nunca de clique na lista. */
export const PRIMEIROS_PASSOS = {
  perfil: { texto: "Configurar seu estudo", rota: "apresentacao", consulta: { inicio: "fase" } },
  plano: { texto: "Montar seu plano", rota: "hoje", consulta: { ajustar: 1 } },
  questoes: { texto: "Responder as primeiras questões", rota: "questoes" },
  tutor: { texto: "Conhecer o Tutor", rota: "tutor" },
  revisao: { texto: "Fazer a primeira revisão", rota: "erros" },
};

export function primeirosPassos(estado) {
  const lista = Array.isArray(estado?.primeiros_passos) ? estado.primeiros_passos : [];
  return lista.filter((p) => PRIMEIROS_PASSOS[p.id]).map((p) => ({ ...PRIMEIROS_PASSOS[p.id], id: p.id, feito: Boolean(p.feito) }));
}

/** O tour pode ser retomado do Início? (pendente: nunca começou; pausado: parou no meio) */
export const tourParaRetomar = (estado) => ["pendente", "pausado"].includes(estado?.tour?.status);
