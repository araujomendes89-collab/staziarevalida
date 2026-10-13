# Rodada 2: relatório da integração (13/10/2026)

O ramo `rodada2` sai do `fase1` (d12a420, o que está no ar) e junta 5 ramos. Nada foi publicado: nenhum push, nenhum SQL no
banco de verdade, nenhuma chave de IA usada.

## 1. O que foi junto (um commit por junção)

| # | Ramo | Commit juntado | Migração | Conflitos |
|---|---|---|---|---|
| 1 | fontes-vinculadas | c2ad687 | 9900 | nenhum |
| 2 | similaridade-banco | 9a02122 | 9910 | `questoesStaziaMedSoOficiais.test.ts` |
| 3 | similaridade-telas | df92ef6 | — | nenhum (contrato conferido; nome da origem `revisor` acrescentado) |
| 4 | carga-explicacoes | a7f3756 | 9920 | `questoesStaziaMedSoOficiais.test.ts`, `AdminQuestions.jsx`, `auditLog.js`, `Correction.jsx` |
| 5 | carga-provas | **65cee3a** (o último, como o coordenador pediu) | 9930 | `questoesStaziaMedAlunoBanco.test.ts`, `questoesStaziaMedSoOficiais.test.ts` |

O 65cee3a já traz o selo "GABARITO PRELIMINAR" com a frase "O gabarito definitivo só será divulgado pelo Inep em 04/12/2026"
(a data é dado da prova: `exams.final_answer_expected_on`), Q74 em Medicina de Família e Q93 em Cirurgia (100 questões).

**NÃO juntados:** `vigilancia-painel` e `vigilancia-cientifica`. O banco da vigilância está pausado e usa o número **9920**, o
mesmo da carga das explicações. Antes de juntar, a migração da vigilância precisa de outro número (por exemplo 9940).

## 2. Como os conflitos foram resolvidos

- **Catálogo de leitores de questões** (`questoesStaziaMedSoOficiais.test.ts`): ficaram as entradas dos três lados (9900, 9910,
  9920 e a `question_preliminary_info` da 9930).
- **Testes de recolagem** (`questoesStaziaMed*Banco.test.ts`): colar a 9801 de novo pede colar depois a 9920 **e** a 9930.
- **Editor da questão** (`AdminQuestions.jsx`): mostra o quadro "Fontes vinculadas" (9900) e o cartão da nota (9920).
- **Registro de ações** (`auditLog.js`): nomes e resumos das ações das duas migrações.
- **Correção do aluno** (`Correction.jsx`), a regra de ouro: a nota "O que mudou desde a prova" aparece **uma vez só**.
  O banco já devolvia vazia a nota da 9920 quando o quadro da 9900 tem nota aprovada (lógica do ramo das explicações,
  preservada). A tela agora confere de novo: se o quadro mostra a nota da referência atual, a outra não aparece. Testes novos
  na tela (mesmo texto ou texto diferente: só uma; quadro sem nota ou "Fonte não confirmada": a da carga aparece) e no banco
  (o teste deixou de pular quando o ramo c2ad687 não existia: usa a 9900 do próprio ramo).
- **Tela "Questões parecidas"**: o contrato com a 9910 bate (nomes, parâmetros, filtros, decisões e campos). A origem `revisor`
  (a equipe trocou o tipo ao aprovar) ganhou nome: "revisão da equipe". Teste novo.
- **Tipos**: `go` (Correction) e `onDone` (ExamApproval) passaram a ter valor padrão; sem isso o `tsc` acusava 17 erros novos.
- **Teste instável** (`cargaProvasBanco.test.ts`): a sessão sorteia as questões e o teste respondia sempre "A"; quando "A" era a
  certa, o caderno de erros ficava vazio e o teste quebrava. Agora responde de propósito uma letra errada.

## 3. Testes (só os arquivos tocados e os vizinhos, pela fila de 3 vagas)

| Depois de | Arquivos | Resultado |
|---|---|---|
| junção 1 | fontesVinculadas (Banco, Gerador, Tela), correcoesQuestoesTela, fontesComplementaresOrdem, SoOficiais, adminUsuariosOrdemMigracoes, registroAdministracao | 8 arquivos, 109 testes ok |
| junção 2 | similaridade (Banco, Motor), aiCentral, aiCentralScreen, fontesOficiais (Contrato, IA), SoOficiais, fontesVinculadasBanco, ordem das migrações, Registro | 324 de 325; o que falhou (`aiCentralScreen`, "linha de produção com mesma família") passa sozinho e passa no fase1: instável com a máquina carregada |
| junção 3 | similaridade (Admin, Aluno), fontesVinculadasTela, correcoesQuestoesTela, questoesStaziaMedAluno, centralTelaAdm, fase1aCentralTelas | 7 arquivos, 102 ok |
| junção 4 | cargaExplicacoes (Banco, Gerador, Tela), SoOficiais, AlunoBanco, ordem, Registro, correcoesQuestoesTela, fontesVinculadasBanco, similaridadeBanco, admQuestoesTela, leva3QRegistro | 12 arquivos, 177 ok (+ telas: 33 ok) |
| junção 5 | cargaProvas (Banco, Imagens), AlunoBanco, SoOficiais, supabasePracticeApi, cargaExplicacoes (Banco, Tela), similaridadeAlunoTela, fontesVinculadas (Tela, Banco), errorNotebookConsolidation, correcoesQuestoesTela, questoesStaziaMedAluno, enunciadoJustificado, simuladoCronometro, ordem das migrações, similaridadeBanco | 226 de 227; a falha era o teste instável acima (corrigido; 3 voltas seguidas ok) |
| correções dos pacotes | cargaProvasBanco, similaridadeBanco | 39 ok |
| tipos | telas com Correction (6 arquivos) | 88 ok + 14 "falha esperada" que já existiam |

**Tipos (`npx tsc --noEmit`)**: fase1 = 1832 erros; rodada2 = 1832 (nenhum novo).
**Site (`npx vite build`)**: compila (≈9 s, só o aviso de sempre de pedaço grande); saída apagada. O servidor e o processamento
(esbuild de `server.ts` e `scripts/content-hub/worker-job.ts`) também empacotam sem erro.

## 4. Simulação da produção (o principal)

Scripts em `.superpowers/sdd/rodada2/` (logs em `logs/`):
`monta-producao-hoje.mjs` monta a produção de hoje em PGlite: base 23d53c1 + pacote de 11/10 + COLAR-* + leva 3 (lib da fase1),
as **1.200 questões reais** do export da produção de 12/10 (sha256 6cf1336b…, o mesmo da carga das provas), os pacotes reais da
leva 4 e da leva 5, o administrador araujomendes@staziamed.com.br, as **12 fontes reais** da biblioteca (lidas da produção em 12/10,
com trechos onde há) e o pacote real das fontes oficiais (420 do catálogo; o 0-CONFERIR dele responde OK).
`simular.mjs` cola os pacotes e confere; `diff-fora-de-ordem.mjs` compara a ordem errada com a certa.

Limites honestos: é PGlite, não o Supabase; sem pgvector e sem o esquema `storage` (por isso a parte 4 das imagens não foi
ensaiada aqui, e nos testes de recolagem a leva 3 entrou pelas migrações, não pelo pacote, que cria o depósito). Os títulos das
provas na cópia ("Revalida 2022/1") são aproximados; nenhum pacote depende deles.

### Resultado com os pacotes ORIGINAIS de 12/10 (log `simulacao-pacotes-originais-de-12-10.txt`)
Tudo colou sem erro, mas apareceram 2 problemas reais nos pacotes:
1. **Carga das provas, 0-CONFERIR**: respondia "OK" antes de colar qualquer coisa ("0 de 701 campos já fiéis ... 2026/2 com 0").
2. **Similaridade, perfis**: colar de novo mudava os perfis (a data sempre; e a impressão digital, porque os perfis colados antes
   da carga das provas guardavam o texto antigo e ficavam marcados como desatualizados).

### Correções (no ramo, regerando pelos geradores; os arquivos de Downloads de 12/10 ficaram intactos)
- `scripts/carga-provas/gerar-pacote.mjs`: o 0-CONFERIR agora diz "FALTA: parte 1 (aviso ...); partes 2 (701 campos ainda com o
  texto antigo, em 12 provas); parte 3 (prova 2026/2 com 0 de 100 questões). Antes de colar isto é o normal ..." e, no fim, "OK"
  com o aviso de que a parte 4 das imagens só vem depois do envio. `saida/` regerada (só o 0-CONFERIR mudou).
- `scripts/similaridade/gerar-sql-perfis.mjs`: perfil igual não é regravado. O arquivo foi regerado com a revisão de hoje:
  **1.217 perfis** (o de 12/10 tinha 284; o Professor terminou as 1.300 depois). Na ordem, os perfis vão **por último**.
- Pacote final: `~/Downloads/publicacao-staziamed-2026-10-13-rodada2/` com uma pasta por etapa (1 a 5), `0-ORDEM-DE-COLAGEM.txt`,
  `DEPOIS-imagens-so-com-autorizacao/` e `OPCIONAL-so-se-o-dono-decidir/`. Diferenças em relação a 12/10: só o 0-CONFERIR da
  carga das provas e o 2-Perfis (regerados); os outros são cópias idênticas (1-Similaridade e 1-Estrutura iguais às migrações).

### Resultado com o pacote da rodada 2 (log `simulacao-rodada2.txt`): **tudo certo**
| Etapa | Resultado |
|---|---|
| Antes de colar | os 5 0-CONFERIR dizem FALTA e o que falta (nenhum erro) |
| 1 fontes-vinculadas | "OK: Fontes vinculadas colada"; 0-CONFERIR OK |
| 2 similaridade (estrutura) | sem erro; 0-CONFERIR OK, função "desligada (como deve começar)" |
| 3 carga das provas | **701 campos** em 362 questões trocados ("0 pulados" em todas as 12 partes); 2026/2 com 100 questões e 100 gabaritos PRELIMINARES iguais à letra; data 04/12/2026; 0-CONFERIR OK com "0 de 77 imagens" (normal antes do envio) |
| 4 explicações | 1.261 questões gravadas, todas esperando o revisor (0 no ar), 0 puladas; 4 notas "O que mudou"; 0-CONFERIR OK |
| 5 perfis | 1.217 perfis; **todos** batem com o texto final (0 desatualizados) |
| 2ª volta inteira | **nada muda** (estrutura, permissões e dados idênticos; a carga diz "já estavam corrigidos/iguais") |
| Gabarito e situação | as 1.200 questões de antes intactas; gabaritos oficiais de antes intactos |
| Visitante | nenhuma função ou tabela nova |
| Aluno | 17 funções novas para quem entrou, as mesmas das 4 migrações (as do aluno decidem pelo acesso; as da equipe recusam quem não é da equipe, como provam os testes de cada ramo); tabelas novas com política "equipe lê": o aluno vê 0 linhas; `question_update_notes` nem pode ser lida |
| Central de IAs | "Questões parecidas" sem linha em `ai_functions` (desligada) |
| Regra de ouro | nota aprovada aparece; com a nota do quadro Fontes vinculadas confirmada, a outra some |
| Selo | o aluno vê `{expected_on: 2026-12-04}` antes de responder; registrado o gabarito DEFINITIVO, o selo some |
| Migrações | 130 arquivos, nenhum número repetido; novas na ordem 9900 < 9910 < 9920 < 9930; pacote = migrações coladas direto (mesma estrutura) |
| Fora de ordem | explicações antes da carga das provas: a 2026/2 é pulada ("ATENÇÃO") e o 0-CONFERIR das explicações diz "FALTA: Revalida 2026/2 ... não existem no banco"; colando o resto e as explicações de novo, tudo OK, mesma estrutura e mesmas questões (só muda a data "desde" da revisão) |

Correção do número acima: a carga troca **701 campos** (enunciado ou alternativa) em 362 questões; o LEIA-ME da carga fala em 880
correções porque um campo pode ter mais de uma correção.

### Recolagem de arquivos antigos (regra pedida pelo coordenador, provada)
- **9801 (leva 4 parte 2) + só o aviso (parte 1 da carga)**: NÃO basta: a correção do aluno continua sem as explicações de estudo da
  anulada e sem a nota (a 9920 redefine a mesma função). É preciso colar a estrutura das explicações **e** o aviso: aí volta igual.
- **9620 (COLAR-fonte-complementar) + só o aviso**: não basta (restam 8 diferenças). Com a ORDEM GERAL (leva 3, 4, 5) + as 4
  estruturas da rodada 2 (fontes vinculadas, similaridade, explicações, aviso): volta igual.
- **9610 (COLAR-fontes-oficiais)**: desfaz também a Central de IAs da similaridade; ORDEM GERAL + as 4 estruturas: volta igual.
- **Leva 4 e leva 5 inteiras de novo**: as 4 estruturas depois: volta igual.
Está escrito em linguagem simples no `0-ORDEM-DE-COLAGEM.txt`.

## 5. O que precisa de decisão do dono

1. **Autorizar a colagem** desta rodada e a publicação do site e do Cloud Run do ramo `rodada2` (SQL antes do site).
2. **Imagens**: autorizar o envio das 79 imagens; só depois colar `4-ligar-imagens-DEPOIS-do-envio.sql`.
3. **Regra A ou B** das explicações (recomendado: A, não colar o opcional da regra B).
4. **Divergências**: o pacote das explicações (de 13/10 14h36) deixou de fora as divergentes (39 no relatório; entre elas
   6 da 2026/2: Q3, Q8, Q37, Q60, Q67, Q77). O arquivo de decisões já tem 44 escolhas "A". Se o dono confirmar, o gerador é rodado
   com `--decisoes` e essas entram (sempre em revisão); o pacote precisaria ser simulado de novo.
5. **Perfis**: o arquivo novo tem 1.217 perfis (sem revisão médica, como antes). Se preferir o de 12/10 (284), é só trocar.
6. **Vigilância**: trocar o número da migração do banco da vigilância (hoje 9920) antes de juntar.
7. Pendências que vieram dos ramos e seguem abertas: 5-OPCIONAL da 2023/1 Q1; revisores médicos por área; o rótulo de 2020
   ("definitivo" no banco x PDFs "PRELIMINAR", decisão do dono: manter como está).
