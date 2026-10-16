// Interruptores de funções que existem no código mas ainda não estão abertas ao aluno.
//
// AULAS: a página Estudar › Aulas (aulas teóricas e podcasts publicados) está FECHADA para o aluno por decisão do dono (14/10/2026).
// O caminho para abrir de novo é este: defina VITE_AULAS_ALUNO=1 no ambiente do build (Vercel › Settings › Environment Variables)
// e publique de novo. Nada mais muda: a tela, as rotas e os dados continuam no código e no banco; a Administração segue vendo
// e preparando as aulas normalmente. Lida na hora de usar (não no carregamento do módulo) para os testes poderem ligar e desligar.
export function aulasParaAluno() {
  return String(import.meta.env?.VITE_AULAS_ALUNO ?? "") === "1";
}

// MEDALHAS (arte 3D do pacote "Novas telas", 15/10/2026): as 41 medalhas e 7 ligas desenhadas no pacote ficam em
// src/novo/ds/medalhas-pacote/. LIGADA no app desde 16/10/2026: o dono confirmou que a arte das medalhas foi feita por ele
// (direito de uso resolvido). Para voltar aos ícones Lucide do banco: VITE_MEDALHAS_ARTE_PACOTE=0 no ambiente do build.
// Ainda não publicado: vai ao aluno só com a publicação do ramo novas-telas, com o "pode" do dono.
export function medalhasArtePacote() {
  return String(import.meta.env.VITE_MEDALHAS_ARTE_PACOTE ?? "") !== "0";
}
