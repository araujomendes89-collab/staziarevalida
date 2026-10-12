# Questões StaziaMed (as "Questões Inéditas" do aluno)

Questões escritas pela StaziaMed a partir de trechos de fontes oficiais, conferidas por regras e por IA, revisadas por um médico da
área e publicadas por um administrador. **Nunca são questões oficiais do Inep.** Especificação: `docs/superpowers/specs/2026-10-09-questoes-staziamed-design.md`
(a seção 0 vale por cima do resto). Plano: `docs/superpowers/plans/2026-10-09-questoes-staziamed.md`.

## Regra de acesso (decisão do dono de 2026-10-11)
- A opção **"Questões Inéditas"** aparece na lista "Prova / edição" da tela Questões (a prova `staziamed`). O padrão da lista continua só com as provas oficiais; a sessão nunca mistura as duas.
- Treinam: equipe, revisor médico, plano pago válido e **teste grátis válido** (`has_ineditas()`, que usa `user_without_paid_access` da leva 3).
- Fechados, com aviso e convite em português (`ineditas_gate()`): teste vencido, plano pago vencido ou cancelado, conta sem assinatura. Teste grátis sem data de fim conta como válido (decisão provisória).
- Os números do aluno (desempenho, caderno, XP, Início) são os mesmos em toda tela, com ou sem acesso: o histórico conta as respostas já dadas nas duas coleções.

## Fluxo
```
Pedido (equipe)  →  uma tarefa por vaga (question_generate)  →  rascunho "aguardando revisão médica"
                                                              ⇄  Conferir (question_check) · Buscar fonte oficial (question_source) · Editar · Equilibrar gabarito
revisor médico da área aprova  →  administrador publica  →  (recolhe quando precisar)
```
Nenhuma etapa automática passa de "aguardando revisão médica". Aprovar, publicar e recolher são sempre pessoas; tudo fica na trilha (`draft_question_events`).

## Banco (migrações `20261003009800` e `20261003009801`; dependem da leva 3, 9700 a 9732)
- **9800 (rascunhos):** `staziamed_requests` (pedido e vagas), `draft_source_proposals`, `draft_question_events`, colunas novas em `draft_questions` (origem, tema, pedido, edição, geração, publicação), hash do conteúdo calculado no banco (`draft_questions_hash`), etapas novas da fila (`ch_jobs_step_check` com a união de todas), vagas e letras-alvo (`staziamed_plan_slots`), pedido (`app_staziamed_request_create`), conferência (`ch_worker_save_draft_check` com trava de hash, `app_staziamed_check_enqueue`, `app_staziamed_pending_checks`), geração (`ch_worker_staziamed_slot*`, `ch_worker_staziamed_save_draft`), busca de fonte (`app_staziamed_source_enqueue`, `ch_worker_save_source_proposal`, `app_draft_source_accept/discard`), edição (`app_draft_question_save`, `app_draft_balance_answer`), trava de aprovação (`draft_approval_blockers`, `app_draft_question_decide`), lista e detalhe (`app_draft_questions`, `app_draft_question_detail`) e publicação (`app_staziamed_preview/publish/retire`).
- **9801 (aluno):** origem/prova STAZIAMED em `questions`, `has_ineditas()`/`ineditas_gate()`/`ineditas_option()`, política de leitura, sorteio (`practice_pool` pela prova `staziamed`), sessão (`app_start_session`, `app_get_session` com `locked`), lista de provas, correção com `official_sources` (só depois de responder) e os consumidores "só oficiais" (incidência, Temas, Aulas, trilhas, Início, Tutor, SQIE, banco de questões da administração).
- Idempotentes: podem ser coladas duas vezes. A 9801 recusa com aviso se a leva 3 não estiver no banco.

## Servidor (`server/contentHub/questoes/*`)
| Arquivo | Papel |
|---|---|
| `types.ts`, `similarity.ts`, `validate.ts`, `shuffle.ts` | tipos, semelhança (70% recusa, 50% alerta), validações sem IA, embaralhamento para a letra-alvo |
| `passages.ts` | trechos de fontes oficiais vigentes (nível A a D, versão final, validade em dia) |
| `generate.ts` | `question_generate`: trechos → IA de criação → validações → embaralha → conferências → no máximo UMA reescrita → rascunho |
| `check.ts` | `question_check`: regras, fontes, atualidade, revisão clínica independente e pedagogia, no texto exato (hash) |
| `source.ts` | `question_source`: uma proposta por afirmação (citação literal com os mesmos números e negações) |
| `estimate.ts`, `routes.ts` | custo antes de gastar e as rotas `/api/content-hub/questoes-staziamed/*` |
| `ai/promptsStaziamed.ts` | prompts `staziamed_questao`, `staziamed_reescrita`, `staziamed_pedagogia` |

As três etapas rodam **onde a fila já roda**: o servidor de desenvolvimento no computador e, em produção, a tarefa do Cloud Run. **A tarefa do Cloud Run precisa ser implantada de novo** para conhecer as etapas novas (`question_generate`, `question_check`, `question_source`); sem isso as tarefas ficam na fila.
A IA vem da Central de IAs: criação = função `criacao`; conferências e busca de fonte = `verificacao` (outra empresa que a criadora). IA desligada ou teto atingido deixa a tarefa parada (sem gastar tentativa) até ligar. A IA só roda na Administração: o aluno nunca a vê.

## Regras que não mudam
- Nenhum conteúdo médico sai da memória do modelo: sem trecho oficial a vaga é "pulada" sem chamar IA; a IA pode responder "evidência insuficiente". A simulação do desenvolvimento nunca escreve questão.
- Fonte oficial = nível A a D, versão final, em vigor e validade em dia. Apostila, livro e curso (nível E) nunca vão ao prompt nem contam como citação.
- Limites: pedido de 1 a 20 questões; até 8 trechos por vaga; **uma** reescrita; 1 criação + 5 conferências por questão (até 12 chamadas com a reescrita).
- Aprovar exige: tema, todas as citações oficiais e literais, decisão clínica com citação, as 4 conferências no texto atual (regras sem crítico, fontes sem problema, atualidade não reprovada), semelhança abaixo de 70%, nada de imagem pedida, o texto que o revisor viu (hash) e "Conferi as fontes citadas". Revisão adversarial reprovada ou atualidade inconclusiva pedem observação.
- `questions.sources` de uma Questão StaziaMed guarda só título, órgão, nível, página e versão (o aluno lê essa coluna). O trecho citado fica em `source_quotes` (sem acesso por coluna) e só chega ao aluno na correção, depois de responder.

## O que conta "só oficiais" e o que conta "as duas"
O teste `src/__tests__/questoesStaziaMedSoOficiais.test.ts` tem o **CATÁLOGO** de toda função e visão que lê `public.questions`: _só oficiais_ (incidência, Temas, Aulas, trilhas, Tutor, SQIE, banco de questões da administração), _recusam StaziaMed_ (gabarito oficial, salvar/apagar/importar questão) e _as duas_ (histórico do aluno, desempenho, caderno, XP, sessão). Função nova que leia a tabela precisa ser classificada ali, senão o teste fica vermelho.

## Os 200 rascunhos antigos
Citam apostila (que não é fonte oficial): ficam "Bloqueada: sem fonte oficial". Caminho, um por um: **Buscar fonte oficial → Usar estas fontes → (Equilibrar gabarito) → Conferir → revisão médica** (o campo "aplicação da atualização" costuma falar da apostila: revisar). Nenhum dos 200 aprova enquanto a citação for de apostila. Uma vez, no computador onde estão as apostilas, pode-se achar texto copiado com `scripts/content-hub/run-draft-checks.ts --layers software --reference-dir <pasta das apostilas>`.

## Ordem de publicação (só com ordem do dono)
1. Fontes oficiais carregadas na Central (documento completo, nível A a D, em vigor, trechos indexados).
2. SQL no Supabase: a leva 3 inteira (9700 a 9732), depois `20261003009800` e `20261003009801`.
3. Código (GitHub/Vercel) e **nova implantação da tarefa do Cloud Run** com as etapas novas.
4. Primeiro teste: cadastrar uma fonte oficial (um PCDT); gerar 2 questões do tema e conferir o custo; ver citações, conferências e semelhança; o revisor da área aprova uma; o administrador publica; conta com teste grátis válido e conta Pro treinam e veem "Gabarito StaziaMed"; conta com teste vencido vê fechado com o convite; Temas e incidência continuam com as 1.200 oficiais; um dos 200 pelo caminho completo. Só depois os outros 199.
