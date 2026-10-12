# Leva 3, aba Questões (Q07, Q09, Q12)

Ramo `leva3-q`, partida `c2a354a`. Nada foi empurrado; nenhum serviço real foi tocado. Pasta:
`/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/leva3-q`.

STATUS: **ressalvas**. Tudo que o dono decidiu está feito e testado; as ressalvas estão na seção "Riscos" e "O que NÃO foi feito"
(a principal: o envio de arquivo ao depósito do Supabase foi testado com depósito simulado, não com o Supabase de verdade).

Commits (um por item, mais um de acerto de testes):
- `c653136` Q07, figura da questão
- `da55e76` Q09, comentário em revisão
- `8e7a4c8` Q12, histórico de mudanças
- `d2efd72` ajuste de dois testes (ordem das fontes complementares; tipo de um teste)

## 1. O que mudou, em palavras simples

### Q07 — a equipe envia a figura da questão
- No editor da questão há um bloco novo, "Figura da questão". Editor e administrador enviam, trocam e tiram a figura. É **uma
  figura por questão**, PNG ou JPG, **até 5 MB**, e o **texto alternativo é obrigatório** (de 10 a 300 letras).
- O arquivo vai para um depósito privado (`question-figures`) com **nome sorteado**: o nome do arquivo de quem enviou e o código da
  questão nunca aparecem. O aluno recebe a figura por um endereço assinado de 1 hora; a tela dele mostra a imagem com o texto
  alternativo (e um aviso em português se não carregar).
- **Vincular a figura libera a questão** que citava imagem sem imagem (a regra dos treinos já olhava se há imagem).
- **Desmarcar "Cita figura" não libera a questão sem a imagem**: o banco recusa tirar a marca enquanto não houver figura (editor,
  SQL direto). A importação com "atualizar" que mandar tirar a marca não falha, mas deixa a marca como estava. Na tela, a caixa
  fica travada com a explicação. Com a figura vinculada, desmarcar vale.
- Questão que já tem **várias** figuras do caderno oficial não é mexida pelo envio (a tela só mostra).

### Q09 — comentário novo ou alterado fica "Em revisão"
- "Comentário" = a explicação de cada alternativa, a conduta esperada e o "o que a questão avalia".
- Quando uma **pessoa** grava um desses textos novo ou diferente (editor, administrador, importação, assistente de IA), o campo
  vira "em revisão" e **some do aluno** (correção e Tutor) até o **revisor médico da área** ou o **administrador** aprovar. A questão
  em si (enunciado, alternativas, gabarito) segue valendo. O texto que **já estava gravado** continua visível até alguém mexer.
- O gabarito e a anulação **não** passam por essa revisão: seguem só pelo registro do gabarito oficial (a marca do gabarito, de
  antes, continua como era). O aluno continua vendo "A explicação desta questão está em revisão pela equipe" quando há campo escondido.
- Quem decide aprova ou devolve **com uma nota de pelo menos 10 letras**. O banco **recusa aprovar um texto que mudou depois que
  o revisor o leu**. Cada decisão fica registrada (quem, quando, o quê, a nota) e aparece no Registro.
- Telas: faixa "Comentário em revisão" no editor (o que espera, quem mexeu, se veio do assistente, a devolução do revisor, botões
  para quem pode decidir); aviso antes de salvar ("O comentário vai para revisão"); selo e filtro na lista; e o **revisor médico sem
  papel de equipe** passa a ver a aba Questões **só com a fila "Comentários a revisar"** das áreas dele, abrindo cada questão para
  conferir e decidir.

### Q12 — histórico de mudanças
- No editor, painel "Histórico de mudanças" (só carrega quando a pessoa abre): da mais nova para a mais antiga, **quem mudou**
  (nome, ou e-mail; "Alteração feita direto no banco" quando não houve pessoa), **quando**, o **motivo** e o **antes/depois** de cada
  campo (enunciado, cada alternativa e cada explicação, tema, subtema, conduta, "o que avalia", gabarito, situação, figura e a marca
  "Cita figura"), em páginas de 50.
- **"Voltar para este texto" só copia** o texto antigo para o formulário, com o aviso "nada foi salvo ainda". Gabarito e situação
  aparecem sem botão (só pelo registro do gabarito oficial).
- O banco passou a guardar no histórico também a figura e a marca "Cita figura".

## 2. Migrações e passo de colagem (Supabase, à mão)

Intervalo usado: `20261003009700` a `...9702`. Todas idempotentes (`create or replace`, `if not exists`, `drop ... if exists`),
`security definer` + `set search_path = ''`, com `revoke` de public/anon (e de authenticated nas internas).

1. (Pré-requisito, já combinado) estar coladas a **9620** e a **9621** (Fonte complementar), depois da 9630 e da 9610.
2. Colar `supabase/migrations/20261003009700_questoes_figura.sql` inteira (cria o depósito `question-figures`, as funções da figura,
   o gatilho da marca "Cita figura" e ajusta a importação).
3. Colar `supabase/migrations/20261003009701_questoes_comentario_em_revisao.sql` inteira. **Exige a 9620 e a 9621 coladas antes**
   (para com aviso em português se não estiverem). Redefine duas funções da 9620 (`ch_raw_practice_correction_view` e
   `ch_raw_tutor_truth`).
4. Colar `supabase/migrations/20261003009702_questoes_historico.sql` inteira (exige a 9701).
5. Conferir, como administrador: `select public.app_question_comment_check();` deve devolver `{"ok": true, "faltando": []}`.
6. Só depois publicar o site/servidor (rota nova `/api/question-figures`; não precisa de variável nova: usa o Supabase que o
   servidor já usa).
7. **Se a 9620 for colada de novo depois da 9701**, colar a 9701 de novo (ela redefine as duas funções); o passo 5 acusa o problema.

Conferência de ordem e base (script em `/private/tmp/claude-501/-Volumes-StaziaMed/5d3dd43b-7aaf-486f-81c4-583d693b3d8e/scratchpad/simprod.mjs`,
adaptado do da integração): estado de produção simulado = base 23d53c1 (66 migrações) + partes 1 a 7 do pacote de
`Downloads/publicacao-staziamed-2026-10-11` + 9630 + 9610 + 9620 + 9621; guardei todas as funções, colei **cada uma das minhas três migrações duas vezes** (sem erro) e
comparei. Resultado: 6 funções mudam, 15 são novas, **a colagem seguinte não muda nenhuma função nem permissão**. As 6 que mudam
diferem da produção **só nas linhas pretendidas** (nenhuma parte de versão antiga):
`admin_import_merge_question` (regra de "cita figura"), `app_admin_question` (3 campos do comentário), `app_admin_questions` (filtro e
selo), `ch_raw_practice_correction_view` e `ch_raw_tutor_truth` (campos escondidos e "o que avalia"), `questions_change_trail`
(figura e marca). Nenhuma função nova ficou acessível ao visitante; as internas não ficam acessíveis nem ao usuário logado.

## 3. Arquivos

Banco: `supabase/migrations/20261003009700_questoes_figura.sql`, `...9701_questoes_comentario_em_revisao.sql`, `...9702_questoes_historico.sql`.
Servidor: `server/questions/figures.ts` (nova rota), `server.ts` (3 linhas para montar a rota).
Telas: `src/novo/app/admin/QuestionFigureCard.jsx`, `QuestionCommentReview.jsx`, `QuestionHistory.jsx`, `questionFiguresApi.js` (novos);
`AdminQuestions.jsx`, `AdminScreen.jsx` (aba Questões também para o revisor), `auditLog.js`; `src/novo/app/practice/QuestionFigures.jsx`,
`PracticeSession.jsx`, `SessionResult.jsx` (figura do aluno); `src/shared/adminAssistant/types.ts` (aviso do assistente, ver abaixo).
Testes novos: `src/__tests__/leva3QFiguraBanco|FiguraServidor|FiguraTela|ComentarioBanco|ComentarioTela|HistoricoBanco|HistoricoTela|Registro|AbasRevisorTela` e
`src/__tests__/helpers/questoesLeva3.ts`.

Registro (`auditLog.js`), nome em português para cada ação nova: `question.figure_set` "Figura da questão enviada",
`question.figure_removed` "Figura da questão retirada", `question.comment_approved` "Comentário da questão aprovado pelo revisor",
`question.comment_returned` "Comentário da questão devolvido pelo revisor" (com a questão, o que foi liberado e a nota). A Q12 só lê;
não grava ação nova.

## 4. Escolhas de desenho (para o dono conferir)

O pedido dizia "onde o dono não decidiu, adote a opção recomendada". A proposta antiga não marcava a recomendada, então adotei a que
**copia o padrão que o sistema já usa** (Estações, Atualizações, áudio das Aulas) e a mais segura. Todas as escolhas:

**Q07 (as 5 perguntas)**
1. Quem envia: a equipe toda (decidido).
2. Figuras do caderno do INEP: pode enviar o que a equipe tiver; **não pus nenhuma regra de direitos/licença** (decisão antiga do dono: "Sem regras de licença").
3. Mais de uma figura: **não**; uma por questão (decidido). As várias figuras antigas do caderno ficam como estão e o envio não as troca.
4. Texto alternativo: obrigatório, 10 a 300 letras (decidido).
5. Desmarcar "Cita figura": **não pode liberar a questão sem a imagem**, para ninguém (nem o administrador). Com figura vinculada, pode.
Outras: depósito **privado** + endereço assinado de 1 hora (a proposta falava em pasta privada); só PNG/JPG, 5 MB; tirar a figura **não** mexe na marca
"Cita figura" (a questão que citava volta para fora dos treinos; a que não citava continua valendo); o mesmo arquivo não pode ser figura de duas questões;
trocar apaga o arquivo anterior do depósito.

**Q09 (as 5 perguntas)**
1. Texto já publicado: continua visível até alguém mexer (decidido); a migração não marca nada do que já existe.
2. Quem revisa: o **revisor médico cadastrado na área da questão** ou o **administrador**. O editor e o aluno não decidem (mesmo padrão das Estações). Um editor que também é revisor da área decide como revisor.
3. Vale para texto do **assistente de IA**, texto digitado à mão e importação com "atualizar" (qualquer pessoa logada gravando). O banco guarda se veio do assistente e a tela diz.
4. Revisão demorada: o aluno **fica sem aquele comentário** (nem o texto antigo aparece) e vê o aviso "em revisão pela equipe"; o resto da correção (acerto, gabarito, os outros textos não mexidos) continua.
5. Gabarito e anulação: **continuam só pelo registro do gabarito oficial**, sem essa revisão (conforme o pedido: correções oficiais não são afetadas).
Outras: aprovar tira **todos** os campos em revisão de uma vez (sem aprovação parcial); nota obrigatória de 10 letras; "Devolver" mantém escondido e deixa a nota para quem escreveu (a devolução some se o texto for mexido de novo);
o banco recusa aprovar texto que mudou depois da leitura; só campo **com texto** entra em revisão (apagar um comentário o tira da revisão); espaços nas pontas não contam como mudança;
**SQL colado no editor do Supabase (sem pessoa logada) não passa pela revisão** (é o jeito do dono corrigir à mão); o revisor sem papel de equipe vê só as áreas dele;
a fila fica na aba **Questões** (e o revisor passa a ver essa aba, só com a fila).

**Q12 (as 5 perguntas)**
1. Quem vê: a equipe toda, editor e administrador (decidido). O revisor médico sem papel de equipe não vê o histórico.
2. Nome/e-mail de quem mudou: **sim**, para a equipe toda; mudança sem pessoa logada aparece como "Alteração feita direto no banco".
3. "Voltar" só copia para o formulário (decidido); gabarito/situação sem botão.
4. Por quanto tempo guardar: **sem prazo** (nada é apagado; o histórico já era assim).
5. Questão apagada: o histórico apaga junto (cascata, como já era); fica só a cópia da questão no Registro de ações (`question.delete`). Achei suficiente; se o dono quiser guardar o histórico das apagadas, é decisão nova.

## 5. Testes e resultados

Tudo pela fila `vaga-de-teste.sh`, sempre com arquivos listados (nunca a suíte inteira), no máximo 12 por vez, conferindo que o número de
arquivos do relatório é o dos que existem.
- Testes novos, vistos **falhando antes** e passando depois (TDD): Figura banco 13, Figura servidor 7, Figura tela 13, Comentário banco 23,
  Comentário tela 17, Histórico banco 7, Histórico tela 7, Registro 2, Abas do revisor 2 = **91 testes**, com anon, aluno comum, editor,
  revisora da área, revisor de outra área e administrador nas permissões.
- Rodada final: **87 arquivos** (os 56 que leem as migrações, os 9 novos, e todo teste que cita AdminQuestions, auditLog, o aviso do assistente,
  as figuras, PracticeSession/SessionResult, AdminScreen, a rota de aulas e o `registroAdministracao`): **1.699 testes passaram**,
  83 "falha esperada" (as de sempre das fontes complementares) e 1 pulado, **0 falharam**. (Uma tentativa anterior acusou falha em
  `fontesComplementaresOrdem` e em `correcoesQuestoes*`/`registroAdministracao`; foi consequência de uma regra nova e está explicada em "Testes antigos mudados".)
- `registroAdministracao` e `registroAdministracaoBanco`: passam (toda ação gravada tem nome em português).
- Colagem dupla das 3 migrações no estado de produção simulado: ok (seção 2).
- `tsc --noEmit`: **1.831 erros, igual à base** (a primeira medição deu 1.832 por um tipo do meu teste do histórico; corrigido).
- `npm run build`: passou (vite + servidor).

Testes antigos mudados (e por quê):
- `correcoesQuestoesBanco` e `correcoesQuestoesAjustesBanco`: montam questões cujo comentário "já está no ar" (é o que as regras de gabarito protegem). Agora o
  comentário gravado por uma pessoa espera revisão, então esses dois arquivos dão o comentário como aprovado logo depois de gravar; mais um trecho do Q03 em que
  desmarcar "Cita figura" agora exige a figura. A regra nova tem teste próprio.
- `fontesComplementaresOrdem`: prova só a 9620 (e cola a 9620 de novo no fim); deixa de fora a 9701 e a 9702, que redefinem duas funções dela e exigem a 9620 antes.
- `adminAssistantShared` e `assistenteQuestoesTela`: o aviso do assistente "O que você salvar aparece na hora para o aluno." ficaria falso; agora diz
  "Enunciado e alternativas aparecem na hora para o aluno. Explicações, conduta e “o que avalia” esperam a aprovação do revisor médico."

## 6. Riscos e pontos de atenção

- **Depósito de arquivos não testado no Supabase real.** O envio assinado, a leitura assinada e a apagada de arquivo foram testados com um depósito simulado (mesmo
  padrão das Aulas). O bucket `question-figures` é criado pela 9700; vale um envio de verdade depois de publicar.
- **Beco sem saída possível na Q07.** Uma questão marcada "Cita figura" **por engano** (ou que cita figura que ninguém tem) não pode ser liberada sem figura, para
  ninguém (foi a decisão). Se aparecer o caso, a saída é enviar uma figura. Se o dono quiser uma exceção só do administrador, com motivo, é uma decisão nova.
- Arquivo solto: se o banco recusar o registro depois do envio assinado (ex.: o mesmo arquivo já é de outra questão), o arquivo novo fica no depósito sem uso (ocupa pouco
  e não é acessível); o servidor não apaga para nunca apagar a figura de outra questão. Apagar uma questão também deixa a figura no depósito.
- Q09 depende de **pessoa logada**: texto mudado por SQL colado ou pelo servidor sem pessoa não entra em revisão (de propósito, mas é um jeito de pular a revisão).
- O administrador pode aprovar o texto que ele mesmo escreveu (não há "segunda pessoa" obrigatória).
- Colar a 9620 de novo depois da 9701 desfaz a regra do comentário até colar a 9701 de novo (o passo 5 da colagem confere).
- A mudança de comentário em **massa** (importação de muitas questões com explicação) cria uma fila grande para os revisores; é o efeito da decisão.
- Fila do revisor com limite de 200 itens por tela (sem "carregar mais" ainda).

## 7. O que NÃO foi feito

- Atalho "Enviar figura" na lista de questões (a lista segue com o selo "Sem figura" e o filtro).
- Histórico visível para o revisor médico sem papel de equipe; mostrar ao revisor o texto antigo ao lado do novo.
- Aprovação parcial (por campo) do comentário.
- Exceção para liberar questão sem figura; limpeza automática de arquivos soltos no depósito.
- Guardar o histórico de questões apagadas.
- Mostrar a figura enviada em outras telas do aluno além do treino/resultado (Tutor, caderno de erros), que já não mostravam as figuras do caderno.
- Nenhuma mudança em permissões do Supabase real, em segredos ou em variáveis de ambiente.
