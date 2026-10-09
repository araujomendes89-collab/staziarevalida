# Questões StaziaMed (inéditas) com agente de IA — especificação

Data: 2026-10-09. Escrito para: o dono do produto (o que muda e o que ele decide) e quem for construir e manter.
Origem: um dos três pedidos de IA em questões de 2026-10-08 ("Questões Inéditas"), as decisões do dono de 2026-10-09 e o
levantamento do código em `cfe260f` (`.superpowers/sdd/ineditas/levantamento.md`). Onde esta especificação escolhe um caminho
que o pedido não fixou, o motivo está escrito.

## 1. O pedido e o resultado esperado
Na Central de Conteúdo, a equipe pede questões novas da StaziaMed sobre um tema (ou sobre os temas mais cobrados nas provas
oficiais). Um agente de IA no servidor monta cada questão **só a partir de trechos de fontes oficiais cadastradas na Central**,
confere e entrega como rascunho. Os 200 rascunhos antigos passam pelo mesmo caminho, um por um. Um revisor médico da área
aprova; um administrador publica. O aluno Pro ou Elite treina com a coleção **"Questões StaziaMed"**, sempre com o aviso "não é
questão oficial do Inep". **Nada chega ao aluno sem aprovação humana. Nenhum conteúdo médico sai da memória do modelo.**

Critério de aceite: (1) sem fonte oficial cadastrada, "Gerar" e "Buscar fonte oficial" dizem "Cadastre fontes oficiais na
Central de Conteúdo" e não gastam nada; (2) um pedido de até 20 questões mostra o custo antes e vira tarefas na fila; (3) cada
questão gerada tem a decisão clínica e cada número sustentados por citação literal de trecho oficial, ou a vaga é pulada com
"sem fonte oficial"; (4) nenhuma questão com 70% ou mais de semelhança com questão oficial; (5) gabarito do pedido equilibrado
entre A, B, C e D; (6) conferências rodam por botão (hoje só pela linha de comando); (7) editar um rascunho zera conferências e
revisão; (8) nenhum dos 200 é aprovado sem fonte oficial no lugar da apostila; (9) aprovar só o revisor da área, publicar e
recolher só o administrador, tudo na trilha; (10) aluno Pro/Elite treina com a coleção, o teste grátis a vê fechada com convite;
(11) incidência, temas mais cobrados, provas, SQIE, gabarito oficial e Tutor continuam só com as 1.200 questões oficiais.

## 2. O que existe hoje (conferido no código)
- **Rascunhos e conferências:** `draft_questions` (`20261003001800_draft_questions.sql:7-35`) fica fora do banco do aluno;
  `app_draft_question_decide` (`:69-89`) exige revisor da área e motivo quando não aprova; ninguém edita o texto. `draft_checks`
  (`20261003002100`) tem 4 camadas que nunca aprovam e rodam só por `scripts/content-hub/run-draft-checks.ts`.
- **Fontes oficiais:** nível A–E em `ch_sources` (E = livros, apostilas, cursos: não é evidência).
  `ch_worker_search_official_passages` (`20261003005000:163`) só devolve A–D, final e vigente, por palavras e significado, sem
  filtro de tema. Pela documentação o acervo oficial ainda está pendente: conferir no banco antes do primeiro teste.
- **Banco do aluno:** `public.questions` exige prova (`exams.kind` só REVALIDA/ENAMED, `20261003000200_content.sql:13`) e é
  lida por qualquer conta logada (`:58`); `practice_pool` (`stazia_play.sql:1644`) sorteia a tabela inteira, sem origem nem
  plano. Linha inserida é vista na hora, e nenhum caminho leva rascunho aprovado para lá.
- **Os 200 rascunhos** (2 lotes de 100 do gerador antigo, gpt-5.6-luna; o lote 002 foi "aprovado" por qwen3:8b com as
  apostilas): as 237 citações apontam para "ATUALIZAÇÕES 2025-2026.pdf", da pasta "MATERIAIS SANGUE NOS OLHOS" (sem licença);
  gabarito torto (A38/B45/C15/D2 e A47/B39/C12/D2); semelhança com oficiais de 52% a 63%; 79 com tabela ou painel de exames,
  1 pede imagem, 20 com explicação que cita letra. O gerador antigo (Python local, SSD, Ollama, erro em `full_exam.py:387`)
  não será rodado: só a lógica útil é reescrita (§7).
- **Plano:** `has_pro()` (`20261003004600:21`) = equipe ou Pro/Elite ativo, hoje só nas estações; `app_bootstrap` já o devolve.

## 3. Decisões
| Assunto | Decisão | De quem |
|---|---|---|
| Fontes do gerador | Só fontes oficiais da Central (Ministério da Saúde, PCDT/Conitec, OMS/OPAS, sociedades médicas brasileiras; nível A–D, final, vigente) e o perfil das provas oficiais do Inep (incidência por área, tema e competência). Nunca apostila ou curso | dono (2026-10-09) |
| Os 200 rascunhos | Salvos um por um: conferências, revisão médica e fonte oficial no lugar da citação da apostila. Sem fonte oficial, ficam bloqueados | dono (2026-10-09) |
| Nome para o aluno | "Questões StaziaMed", sempre com "não é questão oficial do Inep". "Inédita" continua querendo dizer "ainda não respondida" | dono (2026-10-09) |
| Quem treina | Só Pro e Elite (e a equipe). O teste grátis vê a coleção fechada, com o convite do plano | dono (2026-10-09) |
| Aprovação | Revisor médico da área aprova; administrador publica. Nada de conteúdo médico inventado | dono (2026-10-09) |
| Onde roda | No servidor, como tarefas da fila `ch_jobs` (Cloud Run em produção, servidor de desenvolvimento no local). Central de IAs: "criacao" cria, "verificacao" confere, conferente de família diferente da criadora | projeto (2026-10-09) |
| O que vem do gerador antigo | Prompts, esquemas, validações, o laço revisar → reescrever → revisar e a ideia do blueprint (vagas por área, subárea e competência), calculada das questões oficiais do banco | projeto (2026-10-09) |
| Sem evidência | A vaga é pulada com "sem fonte oficial"; nunca se gera pela memória do modelo | projeto (2026-10-09) |
| Semelhança | 70% ou mais recusa; 50% ou mais alerta. Calculada no servidor contra as questões oficiais do banco (hoje: 85/70 sobre um número trazido do gerador antigo) | projeto (2026-10-09) |
| Onde fica a questão publicada | Em `public.questions`, com coluna `origin` e uma prova de tipo novo STAZIAMED. Tabela separada descartada: tentativas e anotações apontam para `questions(id)` (`20261003000300_study.sql:30,138`) e sessões, correção, caderno e XP leem de lá; tudo teria de ser duplicado | projeto; confirmado no código |
| Uma tarefa por questão | O pedido vira uma tarefa por vaga: a execução do Cloud Run tem 60 min (`worker-job.ts:6`) e 20 questões com até 12 chamadas cada não cabem; falha e repetição ficam por questão | ajuste meu |
| Vagas calculadas no pedido | As vagas são calculadas no banco quando a equipe pede (com o usuário dela): `app_incidence` barra chamada sem usuário, e a tarefa roda sem usuário | ajuste meu |
| Embaralhar antes de conferir | O sorteio das letras muda o texto e o hash: acontece antes das conferências, e explicação não pode citar letra. Nos 200, botão "Equilibrar gabarito" antes da aprovação (conta como edição; recusado se a explicação cita letra) | ajuste meu |
| Carga antiga não apaga edição | Hoje recarregar os lotes reescreve o conteúdo (`scripts/supabase/engine-seed.ts:165-172`). Passa a pular rascunho já editado no servidor | ajuste meu |
| Trava de aprovação no banco | Aprovar exige fonte oficial em todas as citações e conferências em dia (§5.4); a trava fica na função do banco, não só na tela | ajuste meu (decisões 2 e 5 do dono) |
| Recolher | Marca `retired_at`: não apaga (as tentativas apontam para a questão, sem cascata) nem usa "anulada" (que é do Inep). Republicar só com o mesmo gabarito | ajuste meu |
| Tabela de apoio | Coluna nova `questions.support` (título e linhas), vazia nas oficiais | ajuste meu |
| Leitura protegida | A política de leitura de `questions` passa a `origin = 'official' or has_pro()`; as funções com direitos de dono conferem o mesmo | ajuste meu |
| Sessão de uma coleção só | O aluno escolhe "Provas oficiais" ou "Questões StaziaMed"; a mesma sessão não mistura as duas | ajuste meu |
| Números do aluno | Desempenho, caderno de erros e XP contam as respostas das duas coleções (é treino dele). O que descreve as provas conta só as oficiais | ajuste meu |
| Tutor, trilhas, Aulas, Atualizações | Só questões oficiais nesta etapa (o Tutor chama o gabarito de "official_answer", `tutor_v2.sql:278`) | ajuste meu |
| Revisão pedagógica e quem opera | Prompt pedagógico novo no laço de geração, gravado em `ai_review` (apontamento, não camada nova). Gerar, editar, conferir e buscar fonte: equipe (administrador ou editor); a busca usa a função "verificacao" | ajuste meu |

## 4. Fora desta etapa
Tutor, trilhas do Play, Aulas e Atualizações com Questões StaziaMed; questões com imagem (o rascunho que pede imagem fica
bloqueado); recolher sozinho quando uma fonte vence (agora é alerta no painel); calibrar dificuldade (Rasch); refazer erros
StaziaMed pelo Caderno (o aluno usa o montador com "Que errei"); cobrança do plano (o convite só leva aos planos); o recurso
"Questões Inéditas Stazia" do app antigo; as questões das unidades do Content Lab (`ch_materials`), que seguem separadas.

## 5. Fluxos
```
Pedido:    na fila → gerando → concluído (geradas · puladas "sem fonte oficial" · descartadas com motivo)
Rascunho:  aguardando revisão médica ⇄ ajustes pedidos      (editar ou aceitar fonte = volta a aguardar, conferências zeradas)
              ├→ aprovada (revisor da área) → publicada (administrador) → recolhida
              └→ recusada
```
Nenhuma etapa automática vai além de "aguardando revisão médica". Aprovar, publicar e recolher são sempre pessoas.

### 5.1 Gerar
1. **Pedido** (equipe): modo "Tema" (área + tema da lista de temas das provas oficiais) ou "Temas mais cobrados" (área opcional),
   quantidade de 1 a 20. O servidor confere o acervo (sem fonte A–D com trechos: "Cadastre fontes oficiais na Central de
   Conteúdo"), a IA ligada na Central e o custo estimado; a pessoa confirma.
2. **Vagas** (banco, no pedido): em "Temas mais cobrados", as vagas vão para os temas com mais questões oficiais não anuladas,
   com peso maior para as provas recentes (meia-vida de 6 semestres, como o blueprint antigo), no máximo 2 por tema; sem área, na
   proporção das 5 áreas nas provas. Subárea e competência: a combinação mais frequente do tema em `question_dna`. Cada vaga
   recebe uma letra-alvo (20 vagas = 5 de cada letra; a sobra vai para a letra menos usada na coleção publicada).
3. **Trechos** (tarefa `question_generate`, uma por vaga): busca de trechos oficiais com tema, subárea e competência (palavras e
   significado, até 8). Nenhum trecho: vaga "pulada — sem fonte oficial", sem chamar IA.
4. **Criação** ("criacao"): a IA recebe a vaga e os trechos (como dado não confiável) e devolve a questão no esquema (§7), ou
   "evidência insuficiente" (vaga pulada com o motivo dela).
5. **Validações sem IA** (§7), **embaralhamento** determinístico para a letra-alvo (explicações remapeadas) e **conferências**
   ("verificacao": fontes, atualidade, adversarial e pedagógica). Falha de validação ou achado crítico/importante: **uma**
   reescrita por questão, com os achados, e tudo de novo (o laço do antigo `full_exam.py:556-704`). Validação que ainda falha:
   vaga "descartada" com o motivo; os outros achados ficam para o revisor.
6. **Rascunho** gravado: origem "servidor", aguardando revisão médica, com as conferências do texto final, citações, semelhança
   e a trilha da geração (modelos, versões dos prompts, trechos oferecidos, reescrita, custo).

### 5.2 Conferir
Botão "Conferir" no rascunho e "Conferir pendentes" no filtro (com o custo antes): tarefas `question_check`, uma por rascunho e
versão, com as 4 camadas de `draftChecks.ts` (a de regras é grátis). A linha de comando continua existindo. Mudanças nas regras:
semelhança calculada no servidor (70% crítico, 50% importante), citação sem trecho oficial vira crítico (hoje "importante"),
explicação que cita letra vira importante, cópia de sequências de 6 palavras conferida contra os trechos citados.

### 5.3 Buscar fonte oficial (e os 200 rascunhos)
1. "Buscar fonte oficial" (equipe) cria a tarefa `question_source` (sem decisão clínica: "Preencha a decisão clínica central").
2. A tarefa separa as afirmações a sustentar (a decisão clínica e cada frase da resposta e das explicações com número), busca
   trechos e pede à IA ("verificacao", prompt `evidence` que já existe) o que sustenta cada uma. Só fica trecho literal
   (`isVerbatim`) com os mesmos números e negações.
3. Resultado: uma **proposta** por afirmação (trecho e citação, ou "não encontrada"), marcada "completa" só se a decisão clínica
   e todos os números tiverem trecho. Uma pessoa da equipe vê lado a lado e escolhe "Usar estas fontes" ou "Descartar".
4. "Usar" troca as citações (as da apostila saem e ficam só na trilha), pede para revisar o campo "aplicação da atualização"
   quando ele fala da apostila, e volta o rascunho para "aguardando" com conferências zeradas.
5. Os 200 seguem um por um: buscar fonte → aceitar → (equilibrar gabarito) → conferir → revisão médica. Sem fonte completa, o
   rascunho mostra "Bloqueada: sem fonte oficial" e não aprova. Recomendado, uma vez: rodar pela linha de comando a regra de
   cópia contra as apostilas (`--reference-dir`, só no computador onde elas estão) para achar texto copiado.

### 5.4 Revisar
O revisor médico da área vê o rascunho, as citações com trecho e página, a questão oficial mais parecida, as conferências e a
trilha, e decide com `app_draft_question_decide` ampliada. **Aprovar exige**, conferido no banco: tema; todas as citações com
trecho de fonte A–D, final e vigente; as 4 camadas conferidas no conteúdo atual; regras sem crítico; fontes "sem problemas";
atualidade não reprovada; semelhança abaixo de 70%; sem pedido de imagem; "conferi as fontes citadas". Adversarial reprovada ou
atualidade inconclusiva não travam (opinião de IA), mas pedem observação. Ajustes ou recusa exigem motivo (como hoje).

### 5.5 Publicar e recolher
"Publicar" (administrador; só aprovada, hash revisado igual ao atual e fontes ainda vigentes) grava em `public.questions` (§6),
com prévia como o aluno vê. "Republicar" após nova aprovação troca o conteúdo da mesma questão se o gabarito não mudar (se mudar:
recolher e publicar como nova). "Recolher" (administrador, com motivo) tira do sorteio; quem respondeu continua vendo no
histórico. Fonte citada vencida ou substituída gera o alerta "fonte desatualizada" no painel.

### 5.6 Aluno
- **Montador** (`QuestionBuilder.jsx`): seletor novo "Coleção": "Provas oficiais" (padrão) ou "Questões StaziaMed". Com a
  coleção StaziaMed, somem as provas e valem área, tema, situação e busca; aviso: "Questões criadas pela StaziaMed a partir de
  fontes oficiais e revisadas por médico. Não é questão oficial do Inep." No teste grátis a opção aparece com cadeado e
  "Disponível nos planos Pro e Elite", com o botão para ver os planos.
- **Sessão, resultado, caderno de erros:** "Questão StaziaMed · nº 12" e o selo "não é questão oficial do Inep".
- **Correção:** "Gabarito StaziaMed: alternativa B", explicação, "Por que não as outras?", conduta esperada (a decisão clínica) e
  "Fontes oficiais citadas" (órgão, documento, versão, página, trecho). Sem "O que a questão avalia" e nunca "gabarito oficial".
- Temas, Aulas, Atualizações, trilhas do Play, Tutor e Planejamento ("as N questões inéditas acabam") continuam só com as oficiais.

## 6. Dados
- **`questions`:** `origin` (`'official'` padrão | `'staziamed'`), `retired_at`, `support` (jsonb, tabela de apoio); colunas
  novas no grant de leitura (`20261003001900_answer_key_lockdown.sql:17-19`); política `origin = 'official' or has_pro()`.
  `practice_question_view` e `practice_correction_view` conferem o mesmo e devolvem `origin` e `support`.
- **`exams`:** `kind` aceita `STAZIAMED`; uma linha `staziamed` ("Questões StaziaMed", ano 2026). Publicar: id `staziamed_q0001`,
  código `STZ-0001`, número em sequência; área editorial → `med_area` (CIRURGIA → CIRURGIA_GERAL, MFC →
  MEDICINA_FAMILIA_COMUNIDADE, o inverso de `question_area_code`); `options` = alternativas com explicação (a correta leva a
  explicação geral); `expected_conduct` = decisão clínica; `inep_intent` vazio; `sources` = trechos citados.
- **`practice_pool`:** filtro novo `collection` (`oficiais` padrão | `staziamed`); `staziamed` só com `has_pro()` (senão
  `app_start_session` responde "Questões StaziaMed são dos planos Pro e Elite.") e sem as recolhidas.
- **Só oficiais** (`origin = 'official'`): `practice_pool` padrão (e com ele Temas, Aulas, Atualizações, trilhas e "refazer"),
  `app_question_filters`, `app_count_questions`, `app_incidence` (linhas e lista de provas), totais de `app_bootstrap` e
  `app_home`, `app_lesson_topics`, `app_trail`, `tutor_pick_question`, `tutor_truth`, SQIE (`ch_worker_questions_for_analysis`,
  `app_question_analyses`, `app_question_updates_queue`, `ch_worker_updates_for_reanalysis`, `app_updated_questions`) e o teste
  da carga (1.200). Recusam StaziaMed: `app_admin_set_official_answer`, `question_official_answers`, `app_admin_save_question`
  e `admin_upsert_question` (StaziaMed só muda pelo rascunho). **As duas:** histórico do aluno (`my_area_stats`,
  `my_topic_stats`, `app_performance`, `plan_task_progress`, caderno de erros, XP); `app_admin_overview` conta separado.
- **`draft_questions` ganha:** `generated_by` (`gerador_antigo` padrão | `servidor`), `topic`, `request_id`, `edited_by/edited_at`,
  `similar_question_id`, `generation` (trilha da geração), `question_id`, `published_hash`, `published_at/by`. Citações no
  formato novo `{passage_id, source_id, source, organ, version, page, quote, supports}`; o formato antigo fica como histórico e
  trava a aprovação. Hash calculado no banco (`ch_hash`) sobre enunciado, tabela, alternativas, gabarito, explicações, decisão
  clínica, tema e citações.
- **Novas:** `staziamed_requests` (quem, modo, área, tema, quantidade, estimativa, vagas com letra-alvo, estado e motivo de
  cada uma, custo); `draft_source_proposals` (rascunho, hash da versão, afirmações com trecho ou "não encontrada", completa,
  estado, quem decidiu); `draft_question_events` (trilha: importada, gerada, editada, fonte proposta/aceita, conferida,
  decisão, publicada, republicada, recolhida; quem, quando, hash, conteúdo anterior na edição, observação), além de `ch_log`.
- **Fila:** `ch_jobs.step` ganha `question_generate`, `question_check` e `question_source`, com `document_id` vazio (como
  `visual_render`) e chave de repetição por vaga ou por rascunho + hash.
- **Funções:** Gerar, Conferir e Buscar fonte passam pelo servidor (`/api/content-hub/questoes-staziamed/…`: estimativa com os
  preços da Central, depois a fila); editar, decidir, publicar e recolher são `app_*` do banco. `ch_worker_*` com `revoke`
  explícito (o laço de `draft_checks.sql:147-155` só pegou as daquela época). A carga antiga (`engine-seed.ts`) só atualiza
  rascunho "gerador_antigo" ainda não editado no servidor.
- **Migrações:** `20261003006200_questoes_staziamed.sql` (rascunhos, pedidos, propostas, trilha, fila, trava, publicação) e
  `20261003006300_questoes_staziamed_aluno.sql` (origem, prova, política, coleção e consumidores "só oficiais").

## 7. IA
- **Criação** (função "criacao", `maestroProvider`): prompts novos `staziamed_questao` (de `full_exam.py:94-132` e
  `novel_questions.py:40-54`) e `staziamed_reescrita`. Sai: data de corte fixa, título "SIMULADO 2026.2", alvo Rasch, pedido de
  imagem, arquivos locais. Entra: só os trechos dados; decisão clínica e cada número com citação literal (`passage_id` + trecho);
  "evidência insuficiente" quando faltar; explicação sem citar letra; português do Brasil; nunca atribuir ao Inep. Esquema (de
  `FullQuestionDraft`, `full_exam.py:26-91`): título, enunciado, tabela (nenhuma, tabela, painel de exames), alternativas A–D,
  gabarito, explicação geral e por alternativa ("Correta:"/"Incorreta:"), decisão clínica, conceitos-chave, citações.
- **Validações sem IA** (de `_validate_draft` e `validate_novel_draft`): só português; citação só de trecho oferecido e literal;
  decisão clínica com citação; números da decisão, da correta e das explicações presentes no trecho citado ou no caso; resposta
  única (4 alternativas distintas, uma "Correta" igual ao gabarito); tabela coerente com o enunciado; nada de figura; semelhança
  (maior entre igualdade de texto e de conjunto de palavras, como `maximum_similarity`) contra as oficiais e contra as outras
  StaziaMed: 70% recusa, 50% alerta.
- **Conferência** (função "verificacao", `maestroRoleProvider`, família diferente da criadora): as camadas fontes, atualidade e
  adversarial que já existem (o `MedicalReview` antigo vira essas camadas) e o prompt novo `staziamed_pedagogia` (de
  `PedagogicalReview`: resposta única, clareza, distratores, pistas, alinhamento com a competência), gravado em `ai_review`.
- **Custo:** estimativa antes do pedido com os preços da Central (`estimateCostUsd`, `server/ai/prices.ts:71`): por questão
  1 criação + 5 conferências, até 12 chamadas com a reescrita. Tetos da Central valem (teto atingido = tarefa parada); cada
  chamada fica em `ai_calls`. IA desligada = tarefa "bloqueada" até ligar (mecanismo que já existe).

## 8. Telas
Administração › Central de Conteúdo › **"Questões StaziaMed"** (antes "Questões inéditas"; `?secao=ineditas` continua abrindo):
- **Topo:** aviso "não é questão oficial do Inep" e o estado do acervo ("N fontes oficiais com trechos" ou "Cadastre fontes
  oficiais na Central de Conteúdo", com link para Fontes oficiais).
- **Gerar** (equipe): modo, área, tema, quantidade (até 20), IAs, custo estimado e teto; pedidos com o resultado de cada vaga.
- **Lista:** filtros por origem (servidor, gerador antigo), pedido ou lote, área, tema, situação (aguardando, ajustes, aprovada,
  publicada, recolhida, recusada), "bloqueadas sem fonte oficial" e semelhança; contagens e distribuição do gabarito publicado.
- **Rascunho aberto:** texto completo, citações (as da apostila riscadas: "não é fonte oficial"), questão oficial mais parecida
  lado a lado, conferências com achados, revisão automática, trilha. Ações: Editar (salvar avisa que conferências e revisão
  voltam a zero), Conferir, Buscar fonte oficial (proposta lado a lado), Equilibrar gabarito, Aprovar/Pedir ajustes/Recusar
  (revisor da área; Aprovar desabilitado lista o que falta), Publicar/Republicar/Recolher (administrador).
- **Textos:** "Questão inédita StaziaMed" vira "Questão StaziaMed" na Central (`labels.js:156`, `Units.jsx:431`,
  `pipeline.ts:686`); "inédita" = não respondida (Planejamento, Início, Play) não muda. Aluno: §5.6, com `examLabel`
  (`practice/format.js:15`) ganhando o caso STAZIAMED.

## 9. Segurança e direitos
- O gerador nunca recebe texto de apostila, curso ou livro (nível E) nem de fonte fora de A–D vigente; a biblioteca de apostilas
  do antigo não vem. Citação curta e literal, sempre com órgão, documento, versão e página; a questão não copia a fonte (regra
  de 6 palavras: acima de 50% crítico, acima de 25% importante).
- Rascunhos, pedidos, propostas e trilha: leitura só da equipe e dos revisores; escrita só por funções do banco. Questões
  StaziaMed: leitura só Pro, Elite e equipe, também por acesso direto à tabela; o gabarito segue fora do alcance direto do aluno.
- Nunca atribuída ao Inep: prova STAZIAMED, sem "intenção do Inep", recusada no histórico de gabarito oficial. Chaves só no
  servidor; trechos tratados como dado não confiável no prompt; nenhum dado de aluno vai para a IA.

## 10. Testes
- **Unidade (IA simulada, nunca provedor real):** validações (português, citação literal e oferecida, números, resposta única,
  tabela, letra citada), semelhança, cálculo das vagas, letras-alvo e embaralhamento com explicações remapeadas, laço de
  geração (sem trecho = pula sem chamar IA; "evidência insuficiente"; uma reescrita só; 70% recusa), busca de fonte (citação não
  literal descartada; proposta completa ou não), estimativa de custo, "Cadastre fontes oficiais".
- **Banco (PGlite):** editar zera revisão; trava de aprovação (sem fonte oficial, conferência antiga, área do revisor);
  publicar só administrador e só aprovada; mapeamento para `questions`; coleção só com Pro/Elite; política esconde StaziaMed do
  teste grátis; `practice_pool`, `app_incidence`, `app_question_filters`, Tutor e SQIE sem StaziaMed; gabarito oficial recusa;
  recolhida fora do sorteio e histórico mantido; 1.200 oficiais; carga não sobrescreve editado; `ch_worker_*` fechadas.
  **Catálogo:** toda função que lê `public.questions` precisa estar classificada como "só oficiais" ou "as duas".
- **Telas (`backend.rpc` simulado):** seção renomeada; gerar com custo e aviso de acervo vazio; editar; proposta de fonte;
  aprovar desabilitado com motivos; publicar e recolher; montador com cadeado e convite; rótulo e "Gabarito StaziaMed".

## 11. Publicação (só com ordem do dono)
**Pré-requisito:** fontes oficiais carregadas na Central (documento completo, nível A–D, final, vigente, trechos indexados). Sem
elas o gerador e "Buscar fonte oficial" não produzem nada e dizem "Cadastre fontes oficiais na Central de Conteúdo".
SQL no Supabase (6200, 6300) → código (GitHub/Vercel) → tarefa do Cloud Run com as etapas novas → primeiro teste: (1) cadastrar
uma fonte oficial (ex.: um PCDT); (2) gerar 2 questões do tema dela e conferir o custo; (3) ver citações, conferências e
semelhança; (4) revisor da área aprova uma; (5) administrador publica; (6) conta de teste vê fechado, conta Pro treina e vê
"Gabarito StaziaMed"; (7) Temas e incidência continuam com 1.200 oficiais; (8) primeiro dos 200: buscar fonte, aceitar,
conferir, revisar. Só depois os outros.
