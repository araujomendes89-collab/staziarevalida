// Interruptores de funções que existem no código mas ainda não estão abertas ao aluno.
//
// AULAS: a página Estudar › Aulas (aulas teóricas e podcasts publicados) está FECHADA para o aluno por decisão do dono (14/10/2026).
// O caminho para abrir de novo é este: defina VITE_AULAS_ALUNO=1 no ambiente do build (Vercel › Settings › Environment Variables)
// e publique de novo. Nada mais muda: a tela, as rotas e os dados continuam no código e no banco; a Administração segue vendo
// e preparando as aulas normalmente. Lida na hora de usar (não no carregamento do módulo) para os testes poderem ligar e desligar.
export function aulasParaAluno() {
  return String(import.meta.env?.VITE_AULAS_ALUNO ?? "") === "1";
}
