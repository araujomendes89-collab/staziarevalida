# Questões StaziaMed (inéditas) com agente de IA — Implementation Plan

## Registro de mudanças (leia primeiro)

**2026-10-12 — decisão nova do dono (de 2026-10-11) e retomada.** Vale por cima de tudo o que está abaixo.
- **Acesso:** as Questões StaziaMed aparecem como a opção **"Questões Inéditas"** na lista **"Prova / edição"** da tela Questões
  do aluno (`QuestionBuilder.jsx`) e valem **também para o período de teste (teste grátis VÁLIDO)**, não só Pro/Elite. Treinam:
  equipe, revisor médico, plano pago válido e teste grátis válido. **Ficam fechados** (regra PL02 do dono: sem acesso pago):
  teste vencido, plano pago vencido/cancelado e conta sem assinatura, com o aviso e o convite em português. O desenho anterior
  (teste grátis vendo a coleção fechada com cadeado e convite) acabou; o cadeado e o convite ficam **só** para quem está fechado.
- **Mantido:** só aprovadas por revisor médico com fonte oficial (nível A a D); aviso "Não é questão oficial do Inep"; nome
  "Questões StaziaMed" na sessão e na correção, "Questões Inéditas" só na opção da lista; as 200 geradas de apostilas ficam
  bloqueadas sem fonte oficial; nada de inédita aprovada chega ao aluno sem revisão médica; gabarito oficial, SQIE, incidência,
  Temas, Tutor, trilhas e Atualizações não misturam inédita com prova oficial.
- **O que muda no banco:** função nova `has_ineditas()` (equipe, revisor, plano pago válido ou teste válido; usa
  `user_without_paid_access` da leva 3, migração 9730) e `ineditas_gate()` (aviso em português); política de `questions` =
  `origin = 'official' or has_ineditas() or <já respondeu>` (a última parte mantém os números do histórico: Q13);
  `practice_pool` sem `exam_id` = só oficiais e `exam_id = 'staziamed'` = inéditas publicadas, não recolhidas e só com acesso
  (**o filtro `collection` deixou de existir**); `app_start_session` parte da versão da 9730 e recusa `staziamed` sem acesso;
  `app_question_filters` devolve a opção `staziamed` (`locked`); `app_get_session` devolve `collection`/`locked`;
  `practice_question_view` e a correção só respondem com acesso; `app_bootstrap`, `app_home`, Temas, incidência: só oficiais.
  `has_pro()` não muda (estações Pro).
- **Numeração:** migrações `20261003009800_questoes_staziamed.sql` (antes 6200, depois 8800) e
  `20261003009801_questoes_staziamed_aluno.sql` (antes 6300/8810); faixa reservada 9800 a 9809, depois da leva 3 (9700 a 9732).
  Toda migração é **idempotente** (colar duas vezes não estraga) e redefine função a partir da versão **mais nova**, inclusive a da
  leva 3.
- **Base:** o ramo recebeu o main publicado `8bd82fb` (merge `ecbea4a`). A leva 3 (`leva3-final`, ainda não publicada) é
  pré-requisito da 9801 (usa `user_without_paid_access` e parte de `app_start_session`, `ch_raw_practice_correction_view`,
  `app_admin_questions` etc. da 9701/9730): ela precisa estar no banco **antes** da 9800/9801.
- **Trailer dos commits:** `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (a regra Q16 antiga dizia Opus 5.5).
- **Registro por tarefa:** ver `.superpowers/sdd/2026-10-09-questoes-staziamed/rulings.md` (R-ineditas-2026-10-12) e `retomada-2026-10-12.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe pede na Central de Conteúdo questões StaziaMed sobre um tema (ou os temas mais cobrados); o servidor monta cada uma só com trechos de fontes oficiais, confere e entrega como rascunho; os 200 rascunhos antigos passam pelo mesmo caminho; o revisor médico da área aprova, o administrador publica, e o aluno com plano pago ou teste grátis válido treina com as "Questões Inéditas" (opção da lista "Prova / edição"; na sessão e na correção: "Questão StaziaMed", não é questão oficial do Inep).

**Architecture:** Duas migrações novas: `20261003009800_questoes_staziamed.sql` (rascunhos com hash no banco, pedidos e vagas, propostas de fonte, trilha, etapas novas da fila `ch_jobs`, trava de aprovação, publicação) e `20261003009801_questoes_staziamed_aluno.sql` (origem em `questions`, prova `STAZIAMED`, leitura protegida por `has_ineditas()`, opção "Questões Inéditas" na lista de provas e consumidores "só oficiais"). No servidor, três etapas novas da fila (`question_generate`, `question_check`, `question_source`) em `server/contentHub/questoes/*`, rodando onde a fila já roda (Cloud Run em produção, servidor no desenvolvimento), com a IA pela Central de IAs (`maestroProvider`/`maestroRoleProvider`); rotas `/api/content-hub/questoes-staziamed/…` fazem a estimativa de custo e enfileiram. Painel novo em `src/novo/app/admin/content/questoes/` e ajustes nas telas de treino do aluno.

**Tech Stack:** Node + Express + TypeScript (servidor), React JSX (`src/novo`, design system `src/novo/ds`), Postgres do Supabase (PGlite nos testes e no banco de desenvolvimento), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-questoes-staziamed-design.md` (autoridade; levantamento em `.superpowers/sdd/ineditas/levantamento.md`).

## Global Constraints

- **Decisões do dono (2026-10-09), valem para todas as tarefas:**
  - Fontes do gerador: só fontes oficiais da Central (Ministério da Saúde, PCDT/Conitec, OMS/OPAS, sociedades médicas brasileiras; nível A–D, final, vigente) e o perfil das provas oficiais do Inep (incidência por área, tema e competência). **Nunca apostila ou curso.**
  - Os 200 rascunhos: salvos um por um — conferências, revisão médica e fonte oficial no lugar da citação da apostila. **Sem fonte oficial, ficam bloqueados.**
  - Nome para o aluno: **"Questões StaziaMed"**, sempre com **"não é questão oficial do Inep"**. "Inédita" continua querendo dizer "ainda não respondida" (Planejamento, Início, Play não mudam).
  - Quem treina: ~~só Pro e Elite~~ **(mudou em 2026-10-11)** equipe, revisor médico, plano pago válido **e teste grátis válido**. Teste vencido, plano pago vencido/cancelado e conta sem assinatura ficam fechados, com o aviso e o convite do plano.
  - Aprovação: **revisor médico da área aprova; administrador publica.** Nada de conteúdo médico inventado.
- **Nada inventado:** nenhum conteúdo médico sai da memória do modelo. Sem trecho oficial, a vaga é pulada com "sem fonte oficial"; a IA pode responder "evidência insuficiente". A simulação de IA (`mock`, só desenvolvimento e testes) nunca escreve questão.
- **Fonte oficial** = a regra de `ch_worker_search_official_passages`: `authority_level` A–D, `kind = 'final'`, `status = 'current'`, e `valid_until` nulo ou ≥ hoje. Nível E e trecho fora dessa regra nunca vão para o prompt nem contam como citação.
- **Nada chega ao aluno sem pessoa:** nenhuma etapa automática passa de "aguardando revisão médica". Aprovar = revisor cadastrado na área (`ch_is_reviewer(area)`); publicar, republicar e recolher = administrador (`is_admin()`). Gerar, editar, conferir e buscar fonte = equipe (`is_staff()`: administrador ou editor).
- **Limites fixos:** pedido de 1 a 20 questões; até 8 trechos por vaga; **uma** reescrita por questão; por questão 1 criação + 5 conferências, até 12 chamadas com a reescrita; semelhança **≥ 70% recusa (crítico), ≥ 50% alerta (importante)** contra as oficiais e contra as outras StaziaMed; cópia de sequências de 6 palavras dos trechos citados: **> 50% crítico, > 25% importante**; "Temas mais cobrados": no máximo 2 vagas por tema, meia-vida de 6 semestres.
- **Textos exatos da spec:** "Cadastre fontes oficiais na Central de Conteúdo" · "Preencha a decisão clínica central" · "Bloqueada: sem fonte oficial" · "sem fonte oficial" · "evidência insuficiente" · "Usar estas fontes" / "Descartar" · "Equilibrar gabarito" · "Conferi as fontes citadas" · "não é fonte oficial" · "fonte desatualizada" · "Seu teste grátis terminou." / "Seu plano pago terminou." (começo do aviso de `ineditas_gate()`) · "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia." · "As questões das provas oficiais continuam abertas." · "Questões Inéditas" (opção da lista "Prova / edição") · "Ver planos" · "Questões criadas pela StaziaMed a partir de fontes oficiais e revisadas por médico. Não é questão oficial do Inep." · "Questão StaziaMed · nº 12" · "não é questão oficial do Inep" · "Gabarito StaziaMed: alternativa B" · "Por que não as outras?" · "Fontes oficiais citadas". Nunca "gabarito oficial" nem "O que a questão avalia" numa questão StaziaMed. Na Central, "Questão inédita StaziaMed" vira "Questão StaziaMed".
- **IA:** criação = função `criacao` (`maestroProvider`); conferências e busca de fonte = `verificacao` (`maestroRoleProvider`, família diferente da criadora). Tetos da Central valem (`AiCapReached` → tarefa `blocked`); IA desligada → tarefa `blocked` até ligar (`ch_worker_block`/`ch_worker_unblock`). Trechos vão ao prompt como dado não confiável (`asDocument`, `GUARD`). Nenhum dado de aluno vai para a IA. Chaves só no servidor.
- **Fora desta etapa (§4):** Tutor, trilhas do Play, Aulas e Atualizações com Questões StaziaMed; questões com imagem; recolher sozinho quando a fonte vence (só alerta); Rasch; refazer erros StaziaMed pelo Caderno; cobrança do plano; o recurso antigo "Questões Inéditas Stazia"; questões das unidades do Content Lab (`ch_materials`).
- **Banco:** só as duas migrações novas; elas ainda não estão no Supabase, então cada tarefa **edita as definições no próprio arquivo** (sem `create or replace` repetido). **Idempotentes** (colar duas vezes não estraga: `if not exists`, `create or replace`, `drop … if exists` antes de `add constraint`/`create policy`/`create trigger`, linhas de dados com `on conflict`/`where not exists`). Redefinição de função existente parte da **versão mais nova na ordem de produção, inclusive a leva 3** (`git grep -nE "create (or replace )?function public\.<nome>\s*\(" -- supabase/migrations`, a última por nome de arquivo; para as funções que a leva 3 muda, a cópia está em `.claude/worktrees/leva3-final/supabase/migrations`), sem perder campos nem regras. Funções novas `ch_worker_*`, de apoio e de gatilho (`draft_*`, `staziamed_*`) são `security definer set search_path = ''` com `revoke execute … from public, anon, authenticated`; `app_*` com `revoke … from public, anon`. O laço de revoke de `ch_worker_%` (como `20261003002100_draft_checks.sql:147-155`) é o **último bloco** de cada arquivo; função nova entra antes dele. Função da 9800 que lê coluna criada na 9801 (`questions.origin`, `retired_at`, `support`) é `language plpgsql` (o corpo só é conferido ao rodar).
- **Catálogo:** toda função ou visão nova que lê `public.questions` entra, na mesma tarefa, no `CATALOGO` de `src/__tests__/questoesStaziaMedSoOficiais.test.ts` (Tarefa 3).
- **Testes:** `npx vitest run <arquivo> --maxWorkers=1`; testes nunca chamam provedor real (só `MockProvider`/provedor de teste com `isMock: true` ou `aiMaker`); nunca rodar o gerador Python antigo; nunca abrir `.env` nem arquivo de chave.
- **Git:** commits em português sem acento, `git add` explícito de cada arquivo, mensagem terminando com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (segundo `-m`). Nunca `git push`. Publicar (SQL no Supabase, Vercel, Cloud Run) só com ordem do dono (§11).

## Review Focus

1. **Questão com tabela de apoio (79 dos 200 têm; sem ela não se responde):** na sessão, no resultado e na correção o aluno vê o título e as linhas de `support` antes das alternativas, sem rolagem horizontal da página no celular. Teste na Tarefa 14.
2. **O acesso termina depois de treinar Questões Inéditas (teste grátis vence, plano pago vence ou é cancelado):** a sessão antiga abre sem erro, sem questões e com o aviso de `ineditas_gate()` e o botão "Ver planos"; sessão nova com `exam_id = 'staziamed'` é recusada com o mesmo aviso; teste grátis **válido** treina. Os números do histórico não mudam (Q13). Testes nas Tarefas 2 (banco) e 14 (tela).
3. **Revisor aprova com a tela aberta enquanto alguém da equipe salvou outra versão:** a aprovação recusa ("O texto mudou depois que você abriu: confira de novo.") em vez de aprovar um texto que o médico não leu. Teste na Tarefa 10.
4. **Rascunho editado (ou fonte aceita) enquanto a conferência ou a busca de fonte dele roda:** o resultado da versão antiga é descartado, as chamadas de IA restantes não acontecem e nada fica "conferido" no texto novo; proposta de versão antiga não pode ser usada. Testes nas Tarefas 6 e 8.
5. **IA falha em todas as tentativas de uma vaga (erro, resposta fora do formato):** a vaga não fica presa em "gerando": vira "descartada" com "Falha da IA: …" e o pedido chega a "concluído". Teste na Tarefa 7.
6. **Reaplicar a carga (`buildEngineStatements`, a do seed e a que roda a cada migração nova no banco de desenvolvimento) com Questões StaziaMed publicadas:** não quebra no gatilho do gabarito oficial e não grava gabarito oficial nelas (a primeira instrução da carga só lê `origin = 'official'`). Teste na Tarefa 3.

## Decisões do plano onde a spec não fixou (o dono pode mudar)

- Hash do rascunho por gatilho no banco (`draft_content_hash`); a migração recalcula os 200 (conferências antigas ficam desatualizadas e são refeitas com as regras novas).
- `supports` da citação = texto da afirmação sustentada; a decisão clínica está sustentada quando uma citação tem `supports` igual ao texto de `clinical_decision`.
- "Usar estas fontes" só para proposta **completa**; a incompleta pode ser descartada.
- Número sem sustentação vira **crítico** quando as citações estão no formato novo (oficial); no formato antigo continua importante.
- Embaralhar: a correta vai para a letra-alvo e as três outras mantêm a ordem relativa.
- Vagas "mais cobrados": rodízio por ordem de peso (1 vaga por tema; 2ª volta só se faltar tema). Período da prova = ano×2 + semestre (ENAMED = 2); referência = prova oficial mais recente.
- Letras-alvo: n÷4 de cada; a sobra vai para as letras menos usadas na coleção publicada (empate: ordem alfabética), distribuídas em rodadas A→D.
- "Equilibrar gabarito": alvo = letra menos usada entre os rascunhos não recusados (fora ele); troca a correta com a alternativa da letra-alvo.
- Semelhança: só o enunciado, texto normalizado; pré-filtro pelas 30 questões com mais palavras em comum; `charRatio` por LCS de caracteres.
- Revisão pedagógica usa o conferente do papel 2 (o mesmo da revisão adversarial).
- Pedido aceito com IA desligada: as tarefas ficam "bloqueadas" até ligar (aviso na tela).
- Aprovar exige o hash que o revisor viu; salvar exige o hash aberto (dois editores).
- Número da questão publicada por sequência própria (`staziamed_question_seq`), nunca `max()+1`.
- Quem perde o acesso (teste vence, plano vence) deixa de ver questões StaziaMed novas e o conteúdo/correção delas; os **números** do histórico continuam iguais em toda tela (Q13): a política deixa ler a linha da questão que o próprio aluno já respondeu (colunas liberadas, sem gabarito), e a correção só abre com acesso.
- `app_admin_questions`/`app_admin_question` (banco de questões oficiais da administração) mostram só oficiais.
- Rascunho recusado não é editado; área não é editável; citações só mudam pela proposta de fonte.
- Um pedido igual (mesma pessoa, modo, área, tema e quantidade) nos últimos 2 minutos ainda na fila é recusado ("Este pedido já está na fila.").
- Textos de botão que a spec não deu: "Calcular custo", "Confirmar e gerar", "Conferir pendentes", "Editar", "Salvar", "Ver planos".

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003009800_questoes_staziamed.sql` | rascunhos, hash, pedidos/vagas, propostas, trilha, fila, conferência, edição, trava, publicação |
| `supabase/migrations/20261003009801_questoes_staziamed_aluno.sql` | origem, prova STAZIAMED, política, visões do aluno, coleção, consumidores só oficiais |
| `scripts/supabase/engine-seed.ts` | carga antiga não sobrescreve rascunho editado; gabarito oficial da carga só de questão oficial (T3) |
| `server/contentHub/jobErrors.ts` | `Blocked`, `Fatal` (sem importação circular) |
| `server/contentHub/questoes/{types,similarity,validate,shuffle}.ts` | validações sem IA, semelhança, embaralhamento |
| `server/contentHub/questoes/{passages,check,generate,source,estimate,routes}.ts` | busca de trechos, as três etapas, custo, rotas |
| `server/contentHub/ai/promptsStaziamed.ts` | prompts `staziamed_questao`, `staziamed_reescrita`, `staziamed_pedagogia` |
| `server/contentHub/{draftChecks,pipeline,router}.ts`, `server/contentHub/ai/{prompts,mock}.ts`, `server/ai/{config,maestro}.ts` | ligações |
| `src/novo/app/admin/content/questoes/*` | painel "Questões StaziaMed" |
| `src/novo/app/practice/*`, `src/novo/app/review/ErrorNotebook.jsx` | coleção, rótulo, tabela de apoio, correção |
| `src/__tests__/helpers/staziamed.ts` | banco de teste com usuários, fonte oficial e rascunhos prontos |

---

### Task 1: Rascunhos no banco — colunas, hash no banco, pedidos, propostas, trilha e fila

**Files:**
- Create: `supabase/migrations/20261003009800_questoes_staziamed.sql`
- Modify: `scripts/supabase/engine-seed.ts:146-176` (`buildDraftStatements`)
- Create: `src/__tests__/helpers/staziamed.ts`
- Test: Create `src/__tests__/questoesStaziaMedRascunhos.test.ts`; Modify `src/__tests__/engineSeed.test.ts:199-209` e `src/__tests__/contentHubDraftChecks.test.ts:192` (o hash agora é do banco: simular mudança alterando `stem`, não `content_hash`)

**Interfaces:**
- Produces (banco):
  - `draft_questions` ganha: `generated_by text not null default 'gerador_antigo' check (generated_by in ('gerador_antigo','servidor'))`, `topic text`, `request_id uuid references staziamed_requests(id) on delete set null`, `edited_by uuid references auth.users(id) on delete set null`, `edited_at timestamptz`, `similar_question_id text references questions(id) on delete set null`, `generation jsonb not null default '{}'`, `question_id text references questions(id)`, `published_hash text`, `published_at timestamptz`, `published_by uuid references auth.users(id) on delete set null`.
  - `draft_content_hash(d public.draft_questions) returns text` = `ch_hash(jsonb_build_object('stem', d.stem, 'support', jsonb_build_object('type', d.support_type, 'title', d.support_title, 'rows', d.support_rows), 'alternatives', d.alternatives, 'answer', d.correct_answer, 'explanation', d.explanation, 'alternative_explanations', d.alternative_explanations, 'clinical_decision', d.clinical_decision, 'topic', d.topic, 'citations', d.source_citations))`; gatilho `draft_questions_hash` (before insert or update) grava `new.content_hash`; a migração roda `update draft_questions set content_hash = content_hash` para recalcular.
  - `staziamed_requests(id uuid pk, created_by uuid not null, created_at, mode text check in ('tema','mais_cobrados'), area text, topic text, count int check 1..20, estimate jsonb, slots jsonb not null default '[]', state text check in ('na_fila','gerando','concluido') default 'na_fila', cost_usd numeric(10,5) default 0, finished_at timestamptz)`.
  - `draft_source_proposals(id uuid pk, draft_id uuid not null → draft_questions on delete cascade, content_hash text not null, claims jsonb not null, complete boolean not null, state text check in ('pendente','aceita','descartada','obsoleta') default 'pendente', meta jsonb default '{}', created_at, decided_by uuid, decided_at)`.
  - `draft_question_events(id bigint identity pk, draft_id uuid not null → cascade, kind text check in ('importada','gerada','editada','fonte_proposta','fonte_aceita','conferida','decisao','publicada','republicada','recolhida'), actor_id uuid, at timestamptz default now(), content_hash text, previous jsonb, note text, details jsonb default '{}')`.
  - RLS nas três: leitura `is_staff() or ch_is_reviewer()`, sem política de escrita.
  - `draft_event(p_draft_id uuid, p_kind text, p_note text default null, p_previous jsonb default null, p_details jsonb default '{}', p_actor uuid default null) returns void` (apoio; ator = `coalesce(p_actor, auth.uid())`, hash = o atual do rascunho).
  - Gatilho `draft_questions_imported` (after insert): `generated_by = 'gerador_antigo'` → evento `importada`; a migração grava `importada` para os que já existem.
  - `ch_jobs_step_check` = lista de `20261003005100_materiais_visuais.sql:22-23` + `'question_generate','question_check','question_source'`.
- Produces (carga): `buildDraftStatements()` faz `on conflict (batch, source_id) do update set … where public.draft_questions.generated_by = 'gerador_antigo' and public.draft_questions.edited_at is null` (o `excluded.content_hash` já é o do banco, calculado pelo gatilho).
- Produces (teste): `src/__tests__/helpers/staziamed.ts`
  - `USERS = { ADMIN, EDITOR, REVISOR_PED, REVISOR_CM, PRO, TESTE }` (uuids fixos; PRO com `subscriptions plan 'pro' status 'active'`, revisores em `ch_reviewer_areas` PEDIATRIA e CLINICA_MEDICA, TESTE no teste grátis).
  - `openStaziaEnv(opts?: { drafts?: boolean }): Promise<StaziaEnv>` com `StaziaEnv = { dev: DevDatabase; db: ContentDb; sql<T = any>(q: string, p?: unknown[]): Promise<T[]>; sqlAs<T = any>(uid: string, q: string, p?: unknown[]): Promise<T[]>; rpc<T = any>(uid: string, fn: string, args?: Record<string, unknown>): Promise<T>; close(): Promise<void> }` — `openDevDatabaseForTests` numa pasta temporária (já traz as 1.200 oficiais), `drafts: true` aplica `buildDraftStatements()`; `rpc` usa `dev.core.rpc({ id: uid, email: null }, …)`; `sqlAs` roda com `set local role authenticated` e `request.jwt.claims`.
  - `addOfficialSource(env, o: { text: string; title?: string; organ?: string; page?: number; level?: "A"|"B"|"C"|"D"|"E"; kind?: string; status?: string; validUntil?: string | null }): Promise<{ sourceId: string; passageId: string }>`.
  - `type DraftInsert` = as colunas de conteúdo de `draft_questions` (`batch, source_id, slot, area, topic, title, stem, support_type, support_title, support_rows, alternatives, correct_answer, explanation, alternative_explanations, clinical_decision, key_concepts, source_citations, model, generated_by`).
  - `insertDraft(env, o?: Partial<DraftInsert>): Promise<string>` — rascunho limpo de PEDIATRIA (`generated_by 'servidor'`), com os campos de `clean()` de `contentHubDraftChecks.test.ts:18-48`.

- [ ] **Step 1: Write the failing tests** (`questoesStaziaMedRascunhos.test.ts`)

```ts
it("o hash do rascunho é do banco: muda com enunciado, tabela, alternativas, gabarito, explicações, decisão clínica, tema e citações; não muda com título", ...)
  // para cada campo da lista: update → hash diferente do anterior; update title → hash igual
it("rascunho editado no servidor não é sobrescrito pela carga antiga; o não editado volta ao arquivo e a 'aguardando'", ...)
  // drafts: true; A: edited_at = now(), stem = 'X'; B: stem = 'Y', status 'needs_changes'; reaplica buildDraftStatements()
  // A.stem === 'X'; B.stem === stem do arquivo e B.status === 'awaiting_medical_review'
it("os 200 importados têm a trilha 'importada' com o hash atual", ...)            // count(kind='importada') === 200
it("pedidos, propostas e trilha: equipe e revisores leem; aluno não lê nada", ...)  // sqlAs(TESTE) → []; sqlAs(REVISOR_PED) → linhas
it("a fila aceita question_generate, question_check e question_source sem documento", ...)
it("nenhuma função ch_worker_*, draft_* ou staziamed_* é executável por anon ou authenticated", ...)
  // has_function_privilege('anon'|'authenticated', oid, 'execute') === false para proname ~ '^(ch_worker|draft|staziamed)_'
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedRascunhos.test.ts --maxWorkers=1` — Expected: FAIL (coluna `generated_by` e tabelas não existem).
- [ ] **Step 3: Implement** a migração (seções acima, laço de revoke no fim), o `where` da carga, o apoio de teste e os dois testes antigos (mudança via `stem`).
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedRascunhos.test.ts src/__tests__/engineSeed.test.ts src/__tests__/contentHubDraftChecks.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261003009800_questoes_staziamed.sql scripts/supabase/engine-seed.ts src/__tests__/helpers/staziamed.ts src/__tests__/questoesStaziaMedRascunhos.test.ts src/__tests__/engineSeed.test.ts src/__tests__/contentHubDraftChecks.test.ts
git commit -m "Questoes StaziaMed: rascunhos com hash no banco, pedidos, propostas, trilha e etapas da fila" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: Banco do aluno — origem, prova STAZIAMED, acesso (has_ineditas), leitura protegida e opção na lista de provas

> **Reescrita em 2026-10-12** (decisão do dono de 2026-10-11): o acesso inclui o teste grátis válido e a escolha é pela prova
> `staziamed` da lista "Prova / edição"; não existe mais o filtro `collection`. Depende da leva 3 (9730) no banco.

**Files:**
- Create: `supabase/migrations/20261003009801_questoes_staziamed_aluno.sql`
- Modify: `src/__tests__/helpers/staziamed.ts` (+ `insertStaziaQuestion`, contas `TESTE_VENCIDO`, `PRO_VENCIDO`, `SEM_PLANO`)
- Test: Create `src/__tests__/questoesStaziaMedAlunoBanco.test.ts`

**Interfaces:**
- Consumes: `openStaziaEnv`, `USERS`, `sqlAs`, `rpc` (Tarefa 1); `user_without_paid_access`, `subscription_trial_is_valid`, `user_plan_lock`, `simulado_gate` e `app_start_session` da 9730.
- Produces (banco):
  - `questions.origin text not null default 'official' check (origin in ('official','staziamed'))`, `retired_at timestamptz`, `support jsonb` (nulo nas oficiais; `{ type, title, rows: [{label, value}] }`); `check ((origin = 'staziamed') = (exam_id = 'staziamed'))`; `check (origin = 'official' or inep_intent is null)`; índice `questions (origin)`.
  - `exams.kind` aceita `'STAZIAMED'`; linha `('staziamed', 'STAZIAMED', 2026, null, 'Questões StaziaMed')`.
  - `grant select (origin, retired_at, support) on questions to anon, authenticated` (além das colunas de `20261003001900_answer_key_lockdown.sql:17-19`; `sources` continua fechada pela 9620 e `explanations_review`/`comment_review` não são liberadas).
  - `has_ineditas() returns boolean` (security definer, executável por `authenticated`): `auth.uid()` não nulo e `not user_without_paid_access(auth.uid())` = equipe, revisor médico, plano pago válido ou teste grátis válido. `has_pro()` não muda.
  - `ineditas_gate() returns text` (como `simulado_gate`): nulo com acesso; senão o aviso: `'Seu teste grátis terminou. '` / `'Seu plano pago terminou. '` / `''` (por `user_plan_lock(...) ->> 'state'`) + `'As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.'`
  - Política: sai "questões: leitura para logados"; entra `using (origin = 'official' or (select public.has_ineditas()) or exists (select 1 from public.question_attempts a where a.user_id = (select auth.uid()) and a.question_id = questions.id))` (a última parte mantém os números do histórico, Q13).
  - `practice_question_view` e `ch_raw_practice_correction_view` (a de 9701; o invólucro `practice_correction_view` não muda): devolvem `origin` e `support`; só respondem se `q.origin = 'official' or public.has_ineditas()`.
  - `practice_pool(p_filters)`: sem `exam_id` → só `origin = 'official'`; `exam_id = 'staziamed'` → `origin = 'staziamed' and retired_at is null and public.has_ineditas()`; outro `exam_id` → `origin = 'official'` com a prova pedida. Recolhida nunca entra.
  - `app_start_session` (parte da versão da 9730, com `simulado_gate`): `exam_id = 'staziamed'` sem acesso → `raise ineditas_gate()` (`42501`).
  - `app_get_session` (de `20261003004300_simulado_cronometro.sql`): devolve também `collection` (`'staziamed'` se `config->'filters'->>'exam_id' = 'staziamed'`, senão `'oficiais'`), `locked` (`collection = 'staziamed' and not has_ineditas()`) e `lock_message`; com `locked`, `questions = '[]'`.
  - `app_question_filters`: `exams` ganha, no fim, `{ id: 'staziamed', kind: 'STAZIAMED', year: 2026, semester: null, title: 'Questões Inéditas', total, locked, lock_message }` quando há inéditas publicadas e não recolhidas (`total` = as da pessoa com acesso; fechado: o total publicado, `locked: true`); sem nenhuma publicada, a opção não aparece. `app_count_questions` herda a prova do filtro.
- Produces (teste): `insertStaziaQuestion(env, o?: { number?: number; area?: string; topic?: string; correct?: "A"|"B"|"C"|"D"; support?: object; retired?: boolean }): Promise<string>` (SQL direto, `origin 'staziamed'`, `exam_id 'staziamed'`, id `staziamed_q` + número com 4 dígitos). Contas: `TESTE` (teste grátis válido), `TESTE_VENCIDO`, `PRO_VENCIDO` (plano pago cancelado), `SEM_PLANO` (sem linha de assinatura), `PRO` (com `current_period_end` no futuro).

- [ ] **Step 1: Write the failing tests**

```ts
it("acesso: equipe, revisor, plano pago válido e TESTE GRÁTIS VÁLIDO leem; teste vencido, plano vencido e sem assinatura não (leitura direta da tabela)", ...)
  // sqlAs(PRO|TESTE|EDITOR|REVISOR_PED, "select id from public.questions where origin='staziamed'") → [id]; TESTE_VENCIDO|PRO_VENCIDO|SEM_PLANO → []
it("has_ineditas e ineditas_gate: a regra do Planos (9730) numa função só; has_pro continua sem o teste", ...)
it("antes de responder: origem, tabela de apoio e a prova STAZIAMED; fechado recebe nulo", ...)
  // practice_question_view(id) as PRO e as TESTE → { origin: 'staziamed', support: {...}, exam: { kind: 'STAZIAMED' } }; as TESTE_VENCIDO → null
it("a lista de provas (app_question_filters) traz 'Questões Inéditas' aberta para quem tem acesso e com locked para quem não tem; sem publicadas, nada", ...)
it("sorteio: sem prova só oficiais; exam_id 'staziamed' só com acesso, sem recolhidas; a sessão não mistura", ...)
  // practice_pool('{}') sem nenhuma staziamed; app_start_session('questoes', {exam_id:'staziamed'}, 10) as PRO e as TESTE → todos os ids staziamed_q*
  // as TESTE_VENCIDO → rejects ineditas_gate() com 'Seu teste grátis terminou.'; PRO_VENCIDO → 'Seu plano pago terminou.'; SEM_PLANO → sem a primeira frase
it("app_count_questions conta a prova pedida", ...)
it("recolhida sai do sorteio, mas continua na sessão antiga de quem respondeu", ...)
it("o acesso termina depois de treinar: a sessão antiga abre com locked e sem questões; sessão nova recusada; os números do histórico não mudam", ...)   // Review Focus 2, Q13
  // PRO responde (app_answer_question) → subscriptions status 'canceled' → app_get_session → { collection:'staziamed', locked:true, questions:[] }
it("simulado e outras regras da 9730 seguem: app_start_session de simulado recusa teste vencido; sessão oficial abre", ...)
it("migração idempotente: colar de novo não muda nada (mesmas funções, políticas e restrições)", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedAlunoBanco.test.ts --maxWorkers=1` — Expected: FAIL (coluna `origin` não existe).
- [ ] **Step 3: Implement** a 9801 (seções acima) e `insertStaziaQuestion`.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedAlunoBanco.test.ts src/__tests__/supabaseAnswerKey.test.ts src/__tests__/equipeAcessoCompleto.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** `git add` dos três arquivos; mensagem "Questoes StaziaMed: origem, prova STAZIAMED, acesso com teste valido e opcao Questoes Ineditas na lista de provas".

### Task 3: Consumidores só oficiais, recusas e catálogo

**Files:**
- Modify: `supabase/migrations/20261003009801_questoes_staziamed_aluno.sql`; `scripts/supabase/engine-seed.ts:186-190` (primeira instrução de `buildEngineStatements`: o gabarito oficial da carga só vai para `origin = 'official'`)
- Test: Create `src/__tests__/questoesStaziaMedSoOficiais.test.ts`; Modify `src/__tests__/engineSeed.test.ts:44,130` (as 1.200 contadas com `origin = 'official'`)

**Interfaces:**
- Consumes: `insertStaziaQuestion`, `openStaziaEnv` (Tarefas 1–2).
- Produces (banco, redefinições a partir da última definição):
  - Leem só `origin = 'official'`: `app_incidence` (linhas e lista de provas), `app_bootstrap` (`totals.questions`), `app_home`, `app_lesson_topics`, `app_trail`, `app_start_trail_node`, `ch_worker_questions_for_analysis`, `app_question_analyses`, `app_question_updates_queue`, `ch_worker_updates_for_reanalysis`, `app_updated_questions`, `tutor_pick_question`, `tutor_truth`, `tutor_question_view`, `tutor_answer_for`, `app_tutor_start` (questão StaziaMed → a recusa que já existe, "Questão não encontrada."), `app_admin_questions`, `app_admin_question`.
  - Recusam StaziaMed: `app_admin_set_official_answer` e o gatilho `question_official_answers_guard` (inserção) → `'Questão StaziaMed não tem gabarito oficial.'` (`22023`); `app_admin_save_question` e `admin_upsert_question` (id de questão StaziaMed ou tipo de prova `STAZIAMED`) → `'Questões StaziaMed só mudam pelo rascunho na Central de Conteúdo.'` (`22023`).
  - `app_admin_overview`: `questions.total/annulled/needs_image` só oficiais + `questions.staziamed = { published, retired }`.
- Produces (carga) — achado da revisão da T1, que não podia ser resolvido lá (a coluna `origin` só nasce na T2): a primeira instrução de `buildEngineStatements()` (`scripts/supabase/engine-seed.ts:186-190`, "gabarito oficial como versão 1") passa a ler `from public.questions q where q.origin = 'official' and not exists (…)`. Sem o filtro ela grava um gabarito `FINAL` (fonte = `sources[0].title`) em toda Questão StaziaMed publicada, que nunca tem gabarito oficial (spec §1 critério 11, §6 e §9); e, com o gatilho `question_official_answers_guard`, a instrução inteira quebra ('Questão StaziaMed não tem gabarito oficial.', `22023`): `migrateDatabase` (`src/novo/data/localCore.ts:84-86`) reaplica a carga a cada migração nova (o servidor de desenvolvimento e a Central não abrem) e `supabase db push --include-seed` falharia em produção. As outras instruções partem do pacote do motor, da classificação (`question_dna`) e dos arquivos de rascunho, e não tocam nas StaziaMed.
- Produces (teste) — `CATALOGO: Record<string, { classe: "so_oficiais" | "as_duas"; como: "filtra" | "recusa" | "herda" | "historico" }>` com, hoje:
  - `so_oficiais/filtra`: as da primeira lista acima;
  - `so_oficiais/recusa`: `app_admin_set_official_answer`, `app_admin_save_question`, `admin_upsert_question`;
  - `so_oficiais/herda` (só recebem linhas de quem já filtra): `ch_worker_save_question_analysis`, `ch_worker_analyses_for_check`, `app_question_analysis_decide`, `tutor_session_summary`, `tutor_learning_memory`, `ch_worker_tutor_learning_event`, `ch_worker_tutor_speech`;
  - `as_duas/historico`: `practice_pool` (pela prova `staziamed`), `app_question_filters`, `app_get_session`, `practice_result`, `practice_question_view`, `practice_correction_view`, `app_error_notebook`, `my_error_notebook_of`, `app_error_profile`, `app_performance`, `plan_task_progress`, `app_create_flashcard`, `grade_question_attempt`, `gam_check_achievements`, `gam_compute_score`, `gam_facts`, `gam_process_attempt`, `ch_worker_gamification_recalculate`, `admin_refresh_exam_counts`, `app_admin_overview`, `question_area_code`, `tutor_mastery`, `app_tutor_report`, `ch_worker_tutor_play_context` e as visões `my_area_stats`, `my_topic_stats`, `my_error_notebook`.

- [ ] **Step 1: Write the failing tests**

```ts
it("catálogo: toda função e visão que lê public.questions está classificada, e as 'filtra' conferem origin", ...)
  // pg_proc (schema public, prosrc ~ 'public\.questions([^_a-z]|$)') ∪ pg_views (definition lê questions) === Object.keys(CATALOGO)
  // toda entrada como 'filtra': prosrc ~ 'origin'
it("com questões StaziaMed publicadas, um Pro vê os mesmos números oficiais em sorteio padrão, filtros, incidência, temas das Aulas, trilha, Início e abertura", ...)
  // números de app_question_filters, app_incidence('topic'), app_lesson_topics, app_trail, app_home, app_bootstrap antes === depois de inserir 3 StaziaMed
it("Tutor nunca escolhe nem comenta StaziaMed", ...)
  // tutor_pick_question com todas as oficiais de PEDIATRIA em p_exclude e 1 StaziaMed de PEDIATRIA → null; app_tutor_start com ela → 'Questão não encontrada.'
it("SQIE: análise e fila de atualização sem StaziaMed", ...)     // ch_worker_questions_for_analysis e app_question_updates_queue
it("gabarito oficial recusa StaziaMed (função e inserção direta)", ...)
it("reaplicar a carga com Questões StaziaMed publicadas não quebra e não dá gabarito oficial a elas", ...)
  // insertStaziaQuestion ×2; antes: count(*) e max(version) de question_official_answers; depois: for (const st of buildEngineStatements()) await env.dev.db.exec(st) NÃO lança
  // (sem o filtro a carga quebra com 'Questão StaziaMed não tem gabarito oficial.'); gabaritos oficiais das StaziaMed === 0 (sem o gatilho, a mesma carga gravaria 'FINAL' nelas);
  // count e max(version) iguais aos de antes (as oficiais não ganham versão 2); reaplicar uma segunda vez também passa; tempo de espera folgado (120 s), como o "reaplicar a carga" de engineSeed.test.ts
it("administração: salvar questão recusa StaziaMed; visão geral conta separado", ...)  // app_admin_overview.questions.staziamed.published === 3
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedSoOficiais.test.ts --maxWorkers=1` — Expected: FAIL (números mudam com as StaziaMed; catálogo acusa `filtra` sem `origin`; a carga reaplicada grava gabarito `FINAL` na StaziaMed).
- [ ] **Step 3: Implement** as redefinições e recusas na 9801; a primeira instrução da carga (`engine-seed.ts:186-190`) ganha `q.origin = 'official' and` antes do `not exists`; o `engineSeed.test.ts` passa a contar `origin = 'official'`.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedSoOficiais.test.ts src/__tests__/engineSeed.test.ts src/__tests__/questionKnowledge.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** `git add` da migração, de `scripts/supabase/engine-seed.ts` e dos dois testes; mensagem "Questoes StaziaMed: incidencia, temas, Tutor e SQIE so com oficiais; catalogo de leitores".

### Task 4: Validações sem IA, semelhança e embaralhamento

**Files:**
- Create: `server/contentHub/questoes/types.ts`, `server/contentHub/questoes/similarity.ts`, `server/contentHub/questoes/validate.ts`, `server/contentHub/questoes/shuffle.ts`
- Modify: `supabase/migrations/20261003009800_questoes_staziamed.sql` (+ `ch_worker_similarity_corpus`); `src/__tests__/questoesStaziaMedSoOficiais.test.ts` (catálogo: `as_duas/historico`)
- Test: Create `src/__tests__/questoesStaziaMedValidacoes.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type Letter = "A" | "B" | "C" | "D"`; `const LETTERS: Letter[]`.
  - `interface GeneratedQuestion { title: string; stem: string; support_type: "NONE" | "TABLE" | "LAB_PANEL"; support_title: string | null; support_rows: { label: string; value: string }[]; alternatives: Record<Letter, string>; correct_answer: Letter; explanation: string; alternative_explanations: Record<Letter, string>; clinical_decision: string; key_concepts: string[]; citations: { passage_id: string; quote: string; supports: string }[] }`
  - `interface StaziaCitation { passage_id: string; source_id: string; source: string; organ: string; version: string | null; page: number | null; quote: string; supports: string }` (formato novo de `source_citations`).
  - `interface OfficialPassage { passage_id: string; source_id: string; source: string; organ: string; version: string | null; authority_level: string; published_on: string | null; valid_until: string | null; section: string | null; page: number | null; text: string }`
  - `interface CorpusItem { id: string; text: string }`; `interface SimilarityCorpus { official: CorpusItem[]; staziamed: CorpusItem[] }`; `interface SimilarityHit { score: number; id: string | null }`.
- Produces (`similarity.ts`): `normalizeForSimilarity(text: string): string` (minúsculas, sem acento, pontuação → espaço, espaços colapsados); `charRatio(a: string, b: string): number`; `tokenSetRatio(a: string, b: string): number`; `maxSimilarity(text: string, corpus: CorpusItem[], opts?: { excludeId?: string; prefilter?: number }): SimilarityHit` (`prefilter` padrão 30; nota com 1 casa decimal; corpus vazio → `{ score: 0, id: null }`).

```
charRatio(a, b)      = 100 · 2·LCS(a, b) / (|a| + |b|), sobre caracteres; "" com qualquer = 0; LCS por programação dinâmica com duas linhas
tokenSetRatio(a, b)  (regra do rapidfuzz, com o texto normalizado):
  A, B = conjuntos de palavras; vazio → 0
  I = A∩B em ordem alfabética unidas por espaço; DA = A−B; DB = B−A (idem)
  I ≠ "" e (DA = "" ou DB = "") → 100
  SA = I e DA unidos por espaço (o que existir); SB = I e DB
  → max(charRatio(I, SA), charRatio(I, SB), charRatio(SA, SB))
maxSimilarity        = pré-filtro: as `prefilter` do corpus com mais palavras em comum (empate: ordem do corpus);
                       nelas, max(charRatio, tokenSetRatio) dos textos normalizados; devolve a maior e o id
```

- Produces (`validate.ts`):
  - `containsClearEnglish(text: string): boolean` — marcadores de `revalida-reverse-engine/src/classification/dna_validator.py:29-46` (assessment, clinical decision, diagnosis, disease, follow up, guideline, management, migraine, most likely, next step, patient, preventive treatment, risk factor, screening, treatment, vaccination) no texto normalizado entre espaços, ou o texto inteiro em `^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$`.
  - `citesLetter(text: string): boolean` — `/(?:\b(?:[Aa]lternativas?|[Ll]etras?|[Oo]p[çc](?:ão|ao|ões|oes)|[Ii]tens?)\s+[“"(]?[A-D]\b)|\(\s*[A-D]\s*\)/`.
  - `dependsOnFigure(stem: string): boolean` — a regra 9b de `draftChecks.ts:146` (sem a parte das linhas de apoio).
  - `validateGenerated(q: GeneratedQuestion, ctx: { offered: OfficialPassage[]; corpus: SimilarityCorpus; excludeId?: string }): { findings: Finding[]; similarity: { official: SimilarityHit; staziamed: SimilarityHit }; citations: StaziaCitation[] }` (`Finding` de `draftChecks.ts`; `citations` = as citações completadas com os dados do trecho oferecido). Achados:

| código | gravidade | quando |
|---|---|---|
| `not_portuguese` | critical | `containsClearEnglish` em título, enunciado, alternativas, explicações, decisão, conceitos |
| `citation_not_offered` | critical | `passage_id` fora dos trechos oferecidos |
| `quote_not_verbatim` | critical | `!isVerbatim(quote, trecho.text)` |
| `decision_without_citation` | critical | nenhuma citação com `normalize(supports) === normalize(clinical_decision)` |
| `numbers_unsupported` | critical | `numbersOutside(decisão + correta + explicação + 4 explicações, [enunciado, linhas de apoio, ...quotes])` não vazio |
| `duplicate_option` / `empty_option` | critical | alternativas repetidas ou vazias |
| `single_answer` | critical | não há exatamente uma explicação iniciando "Correta" (na letra do gabarito) e três "Incorreta" |
| `support_incoherent` | critical | TABLE/LAB_PANEL sem título ou sem linha; NONE com linhas; enunciado cita "tabela/quadro/exames a seguir/abaixo" com NONE |
| `figure` | critical | `dependsOnFigure(stem)` |
| `explanation_cites_letter` | critical | `citesLetter` em `explanation` ou numa explicação por alternativa |
| `mentions_inep` | critical | `/\binep\b/i` em qualquer texto |
| `too_similar_official` / `too_similar_staziamed` | critical | semelhança ≥ 70 |
| `similar_official` / `similar_staziamed` | major | 50 ≤ semelhança < 70 |

- Produces (`shuffle.ts`): `shuffleToTarget(q: GeneratedQuestion, target: Letter): { question: GeneratedQuestion; from: Letter; to: Letter }` — a correta vai para `target`, as outras três mantêm a ordem relativa nas letras restantes, explicações acompanham suas alternativas.
- Produces (banco): `ch_worker_similarity_corpus() returns jsonb` (plpgsql) = `{ official: [{id, text: statement}] (origin 'official'), staziamed: [{id: draft id, text: stem}] (rascunhos não recusados) }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("charRatio e tokenSetRatio seguem a regra do rapidfuzz", () => {
  expect(charRatio("abcd", "abce")).toBe(75);
  expect(tokenSetRatio("lactente febre otite", "otite febre lactente grave")).toBe(100);
  expect(maxSimilarity("Paciente com dor", [{ id: "x", text: "PACIENTE, com dôr!" }])).toEqual({ score: 100, id: "x" });
});
it("maxSimilarity escolhe a mais parecida, respeita excludeId e roda 1.200 textos de 800 caracteres em menos de 2 s", ...)
it("questão limpa não gera achado nenhum e as citações saem completas (órgão, documento, versão, página)", ...)
it.each(PLANTADOS)("pega: %s", ...)   // uma linha por código da tabela, com a gravidade
it("citesLetter: 'a alternativa B', 'Letra C', '(D)', 'item A' sim; 'Correta: a amoxicilina', 'vitamina D', 'hepatite B' não", ...)
it("shuffleToTarget: correta de A para D; B, C, D viram A, B, C; explicações acompanham", ...)
it("ch_worker_similarity_corpus traz as 1.200 oficiais e os rascunhos não recusados", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedValidacoes.test.ts --maxWorkers=1` — Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement** os quatro módulos e a função do banco (+ entrada no catálogo).
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedValidacoes.test.ts src/__tests__/questoesStaziaMedSoOficiais.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** `git add` dos arquivos; mensagem "Questoes StaziaMed: validacoes sem IA, semelhanca e embaralhamento".

### Task 5: Vagas do pedido e criação do pedido (banco)

**Files:**
- Modify: `supabase/migrations/20261003009800_questoes_staziamed.sql`; `src/__tests__/questoesStaziaMedSoOficiais.test.ts` (catálogo)
- Test: Create `src/__tests__/questoesStaziaMedVagas.test.ts`

**Interfaces:**
- Consumes: `staziamed_requests`, `ch_jobs` (Tarefa 1); `questions.origin` (Tarefa 2); `addOfficialSource`, `insertStaziaQuestion`.
- Produces:
  - `staziamed_med_area(p_area text) returns public.med_area` (CIRURGIA→CIRURGIA_GERAL, MFC→MEDICINA_FAMILIA_COMUNIDADE, CLINICA_MEDICA, GINECOLOGIA_OBSTETRICIA e PEDIATRIA iguais; outro → nulo) e `staziamed_editorial_area(p_area public.med_area) returns text` (o inverso, como `question_area_code`).
  - `staziamed_acervo() returns integer` (fontes oficiais com ≥ 1 trecho) e `ch_worker_staziamed_acervo() returns integer`.
  - `staziamed_topic_weights(p_area text) returns table (area text, topic text, weight numeric, total integer)` e `staziamed_plan_slots(p_mode text, p_area text, p_topic text, p_count integer) returns jsonb` → `[{ slot: 1..n, area, topic, subarea, competency, target: "A"|"B"|"C"|"D", state: "na_fila", reason: null, draft_id: null, cost_usd: 0 }]`:

```
peso(prova)  = 0,5 ^ ((ref − período) / 6); período = ano×2 + (kind = 'ENAMED' ? 2 : coalesce(semestre, 2)); ref = maior período das provas oficiais
peso(tema)   = Σ peso(prova) das questões oficiais não anuladas do tema (na área)
'tema'       : todas as vagas no (área, tema) pedidos
sem área     : vagas por área = maior resto sobre a contagem de oficiais não anuladas por área (empate: código)
na área      : temas por peso desc, tema asc; rodada 1 = 1 vaga por tema na ordem; rodada 2 = 2ª vaga na mesma ordem; nunca 3
subárea/comp.: o par (subarea, competency) mais frequente do tema em question_dna das oficiais (empate: ordem alfabética); sem DNA → nulos
letra-alvo   : base = n div 4; o resto vai para as letras com menos StaziaMed publicadas não recolhidas (empate: alfabética);
               a vaga i recebe a i-ésima letra da sequência em rodadas A→D, pulando letras esgotadas
```

  - `app_staziamed_topics(p_area text default null) returns jsonb` → `[{ area (editorial), topic, total }]` das oficiais não anuladas (`ch_assert_staff`).
  - `app_staziamed_request_create(p_mode text, p_area text, p_topic text, p_count integer, p_estimate jsonb default '{}') returns jsonb` → o pedido (`id, mode, area, topic, count, estimate, slots, state, created_at`) e uma tarefa por vaga (`step 'question_generate'`, `document_id null`, `scope_key 'staziamed:<pedido>:<vaga>'`, `idempotency_key 'qgen:<pedido>:<vaga>'`, `max_attempts 3`), `ch_log('staziamed.request', …)`. Recusas: sem `is_staff()` → `'Gerar questões StaziaMed é da equipe (administrador ou editor).'` (`42501`); quantidade → `'Escolha de 1 a 20 questões.'`; acervo 0 → `'Cadastre fontes oficiais na Central de Conteúdo'` (`55000`); modo → `'Modo inválido.'`; tema fora da lista → `'Escolha um tema da lista de temas das provas oficiais.'`; igual nos últimos 2 min na fila → `'Este pedido já está na fila.'`.
  - `app_staziamed_requests(p_limit integer default 10) returns jsonb` → pedidos recentes com `created_by_email`, `summary { geradas, puladas, descartadas }` e cada vaga com `job_status`/`job_error` (de `ch_jobs` pela `idempotency_key`).

- [ ] **Step 1: Write the failing tests**

```ts
it("modo Tema: todas as vagas no tema, com a subárea e a competência mais frequentes no DNA", ...)
it("peso do tema = soma de 0,5^((ref − período)/6) das questões oficiais não anuladas", ...)  // recalcula 1 tema no teste
it("Temas mais cobrados numa área: o tema mais pesado na vaga 1, nunca 3 vagas no mesmo tema", ...)
it("Temas mais cobrados sem área: vagas por área na proporção das provas (maior resto), soma = pedido", ...)
it("letras: 20 vagas = 5 de cada; 3 vagas com publicadas A,A,C vão para B, C e D", ...)
it("criar pedido: editor sim, revisor só de área e aluno não; sem acervo 'Cadastre fontes oficiais na Central de Conteúdo' sem gravar nada", ...)
it("o pedido vira uma tarefa por vaga, sem documento, e repetir em seguida dá 'Este pedido já está na fila.'", ...)
it("a lista de pedidos mostra cada vaga com a situação da tarefa", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedVagas.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções (plpgsql as que leem `origin`) e o catálogo (`staziamed_topic_weights`, `staziamed_plan_slots`, `app_staziamed_topics`, `app_staziamed_request_create`: `so_oficiais/filtra`, com `staziamed_plan_slots` em `as_duas/historico` por ler as publicadas para as letras).
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedVagas.test.ts src/__tests__/questoesStaziaMedSoOficiais.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: vagas por tema e temas mais cobrados, letras-alvo e pedido na fila".

### Task 6: Conferências como tarefa (`question_check`), regras novas e revisão pedagógica

**Files:**
- Create: `server/contentHub/jobErrors.ts`, `server/contentHub/questoes/passages.ts`, `server/contentHub/questoes/check.ts`, `server/contentHub/ai/promptsStaziamed.ts`
- Modify: `server/contentHub/pipeline.ts` (importa e reexporta `Blocked`/`Fatal`; `Step` ganha as 3 etapas; `STEPS.question_check`; `question_generate`/`question_source` provisórios lançam `Blocked("Etapa de Questões StaziaMed ainda não instalada neste servidor.")`), `server/contentHub/draftChecks.ts`, `server/contentHub/ai/prompts.ts` (`...STAZIAMED_PROMPTS`), `server/ai/config.ts:114` (`staziamed_pedagogia` → `verificacao`), `server/contentHub/ai/mock.ts`, `supabase/migrations/20261003009800_questoes_staziamed.sql`
- Test: Create `src/__tests__/questoesStaziaMedConferencia.test.ts`; Modify `src/__tests__/contentHubDraftChecks.test.ts` (linhas que **mudam de propósito**: semelhança 74 → `too_similar_official` crítico, e a linha "semelhança alta" passa a 55 → `similar_official` importante; "só cita material de terceiros" → `third_party_source_only` **crítico**)

**Interfaces:**
- Consumes: `maxSimilarity`, `citesLetter`, `dependsOnFigure`, tipos (Tarefa 4); `ch_worker_similarity_corpus`.
- Produces (servidor):
  - `jobErrors.ts`: `class Blocked extends Error`, `class Fatal extends Error`.
  - `passages.ts`: `searchOfficialPassages(deps: { db: ContentDb; embedder?: Embedder | null; log?: (m: string) => void }, text: string, limit: number): Promise<OfficialPassage[]>` (consulta como `draftChecks.ts:231-236`, sem trecho vencido) e `passagesByIds(db: ContentDb, ids: string[]): Promise<Map<string, OfficialPassage & { official: boolean }>>`.
  - `promptsStaziamed.ts`: `STAZIAMED_PROMPTS = { staziamed_pedagogia: { id, version: "1.0.0", system, schema } }` — de `PedagogicalReview` (`full_exam.py:76-85`) sem dificuldade/Rasch; esquema `{ verdict: "sem_problemas"|"revisar"|"recusar", single_best_answer, stem_clear_and_sufficient, distractors_plausible, no_unintended_clues, competency_aligned: boolean, issues: [{ severity: "critical"|"major"|"minor", where ≤160, detail ≤600 }] ≤10 }`.
  - `draftChecks.ts`:
    - `DraftRow` ganha `topic?: string | null`, `generated_by?: string`, `source_citations: (LegacyCitation | StaziaCitation)[]` (`LegacyCitation = { source_file?: string; supported_claim?: string }`).
    - `callAi<T>(deps: RunDeps, provider: AiProvider, key: PromptKey, payload: unknown, spend: Spend, step: string, who?: Answerer, maxOutputTokens = 4096): Promise<T>` exportada (as camadas passam `draft_check:<camada>`).
    - `softwareChecks(d, opts: { referenceTexts?; officialFiles?; similarity?: { official: SimilarityHit; staziamed: SimilarityHit }; passages?: Map<string, OfficialPassage & { official: boolean }> })`: semelhança 70 crítico / 50 importante (de `opts.similarity` ou, sem ela, `similarity_to_official`); citação nova sem trecho oficial vigente → `citation_not_official` crítico, com `quote` não literal → `quote_not_verbatim` crítico; citação antiga → `third_party_source_only` crítico; `citesLetter` → `explanation_cites_letter` importante; cópia de 6 palavras contra o texto dos trechos citados (`copyRatio`, > 0,5 crítico, > 0,25 importante); bases dos números incluem as `quote` e `numbers_unsupported` é crítico com citações no formato novo.
    - `pedagogyCheck(deps: RunDeps, provider: AiProvider, d: DraftRow, spend: Spend, who?: Answerer): Promise<{ verdict: Verdict; findings: Finding[]; review: Record<string, unknown> }>`.
    - `runDraftChecks` (linha de comando) passa a carregar o corpus e os trechos citados.
  - `check.ts`:
    - `runCheckLayers(deps: RunDeps, d: DraftRow, ctx: { corpus: SimilarityCorpus; passages: Map<string, OfficialPassage & { official: boolean }>; creatorModel: string | null; onLayer?: (layer: Layer | "pedagogy", r: LayerResult) => Promise<boolean> }): Promise<CheckResults>` — `LayerResult = { verdict: Verdict; findings: Finding[]; meta: Record<string, unknown> }`; `CheckResults = { layers: Partial<Record<Layer, LayerResult>>; pedagogy: LayerResult & { review: Record<string, unknown> } | null; similarity: { official: SimilarityHit; staziamed: SimilarityHit }; spend: Spend; stopped: boolean }`. Ordem: software → sources (papel 0) → currency (papel 1) → redteam (papel 2) → pedagogia (papel 2); `onLayer` devolvendo `false` para tudo (`stopped: true`), sem novas chamadas.
    - `stepQuestionCheck(deps: PipelineDeps, job: Job): Promise<null>` — escopo `qcheck:<rascunho>:<hash>`; hash diferente do atual → termina sem chamar IA (`metrics.descartada = "texto mudou"`); resolve os três conferentes antes de começar (algum nulo → `Blocked(pending)`); `aiAllowed` falso → `Blocked`; `AiCapReached` → `Blocked`.
  - `mock.ts`: `staziamed_pedagogia` → `{ verdict: "revisar", …false…, issues: [{ severity: "minor", where: "questão", detail: "Simulação: sem revisão pedagógica real." }] }`.
- Produces (banco):
  - `ch_worker_save_draft_check` (redefinida de `20261003002100_draft_checks.sql:74`): com `p_meta->>'content_hash'` diferente do atual, não grava e devolve nulo.
  - `ch_worker_draft_for_job(p_draft_id uuid) returns jsonb` (campos de `ch_worker_drafts_for_check` + `topic`, `generated_by`, `status`).
  - `ch_worker_passages_by_ids(p_ids uuid[]) returns jsonb` (`[{ passage_id, source_id, source, organ, version, authority_level, kind, status, published_on, valid_until, section, page, text, official }]`).
  - `ch_worker_save_pedagogy(p_draft_id uuid, p_hash text, p_review jsonb) returns boolean` (`ai_review = coalesce(ai_review,'{}') || {pedagogia}`; hash diferente → false).
  - `ch_worker_set_draft_similarity(p_draft_id uuid, p_hash text, p_score numeric, p_question_id text) returns boolean`.
  - `ch_worker_draft_checked(p_draft_id uuid, p_hash text, p_summary jsonb) returns void` (evento `conferida`).
  - `draft_has_official_sources(d public.draft_questions) returns boolean` — ≥ 1 citação, todas no formato novo, cada `passage_id` de fonte oficial (regra das Global Constraints) e `quote` literal no trecho (espaços normalizados). É a regra de "Bloqueada: sem fonte oficial" em todo o plano.
  - `draft_matches_filters(d public.draft_questions, p_filters jsonb) returns boolean` (plpgsql; chaves `batch, status, area, origin, topic, blocked, min_similarity`; `status` aceita os 4 de hoje e `published`/`retired`; `blocked = true` ⇔ `not draft_has_official_sources(d)`).
  - `app_staziamed_check_enqueue(p_draft_ids uuid[], p_estimate jsonb default '{}') returns jsonb` → `{ na_fila, ja_na_fila }` (só `is_staff()`; chave `qcheck:<id>:<hash>`, sem duplicar).
  - `app_staziamed_pending_checks(p_filters jsonb) returns uuid[]` (rascunhos do filtro sem as 4 camadas no hash atual; até 200; só `is_staff()`).

- [ ] **Step 1: Write the failing tests**

```ts
it("citação oficial vigente e literal no formato novo: nenhum apontamento de fonte", ...)
it.each(NOVAS_REGRAS)("regra nova: %s", ...)  // citation_not_official, quote_not_verbatim, third_party_source_only (crítico),
                                              // explanation_cites_letter (importante), too_similar_* ≥70 / similar_* ≥50,
                                              // copied_from_source >50% / close_to_source >25% dos trechos citados, numbers_unsupported crítico
it("Conferir: uma tarefa por rascunho e versão; pedir de novo não duplica", ...)
it("a tarefa grava as 4 camadas no hash atual, a semelhança, a pedagogia em ai_review e a trilha 'conferida'", ...)
  // MockProvider respondendo por promptId (solve, redteam, evidence, currency, staziamed_pedagogia)
it("texto editado durante a conferência: o resultado é descartado e as chamadas seguintes não acontecem", ...)   // Review Focus 4
  // provedor de teste { isMock: true, generate: async (req) => { if (req.promptId === "solve") await env.sql("update … set stem = stem || ' x' …"); … } }
  // nenhuma linha de draft_checks no hash novo; nenhuma chamada 'redteam' nem 'staziamed_pedagogia' depois da edição
it("sem conferente configurado: a tarefa fica bloqueada, sem gastar tentativa", ...)
it("Conferir pendentes: só os rascunhos do filtro sem as 4 camadas em dia", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedConferencia.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** os módulos, as mudanças em `draftChecks.ts`, as funções do banco e as linhas que mudam de propósito no teste antigo.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedConferencia.test.ts src/__tests__/contentHubDraftChecks.test.ts src/__tests__/contentHubPipeline.test.ts src/__tests__/aiCentral.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: conferencias por botao como tarefa, regras novas e revisao pedagogica".

### Task 7: Geração por vaga (`question_generate`)

**Files:**
- Create: `server/contentHub/questoes/generate.ts`
- Modify: `server/contentHub/ai/promptsStaziamed.ts` (+ `staziamed_questao`, `staziamed_reescrita`), `server/contentHub/pipeline.ts` (`STEPS.question_generate`), `server/contentHub/ai/mock.ts`, `server/ai/maestro.ts:48-52` (`MaestroOrigin.source` + `"questoes_staziamed"`), `supabase/migrations/20261003009800_questoes_staziamed.sql`
- Test: Create `src/__tests__/questoesStaziaMedGeracao.test.ts`

**Interfaces:**
- Consumes: `searchOfficialPassages` (T6), `validateGenerated`, `shuffleToTarget` (T4), `runCheckLayers`, `callAi` (T6), pedido/vagas (T5).
- Produces (prompts): `staziamed_questao` e `staziamed_reescrita` (versão `1.0.0`, função `criacao`), mesmo esquema `{ status: "ok" | "evidencia_insuficiente", reason: string|null (≤400), question: GeneratedQuestion | null }` com os limites de `FullQuestionDraft` (`full_exam.py:47-62`; `support_type` só NONE/TABLE/LAB_PANEL; `citations` 1–8 de `{ passage_id ≤64, quote 8–1200, supports 10–600 }`). O texto do sistema vem de `full_exam.py:94-132` e `novel_questions.py:40-54` **sem** data de corte, título "SIMULADO 2026.2", alvo Rasch, pedido de imagem e arquivos locais, e **com**: `GUARD`; só os trechos dados; decisão clínica e cada número com citação literal (`passage_id` + trecho), e a citação da decisão repete em `supports` o texto de `clinical_decision`; "evidência insuficiente" quando faltar; não copiar frases dos trechos nem de provas; explicação sem citar letra, cada uma começando com "Correta:" ou "Incorreta:"; português do Brasil; nunca atribuir ao Inep. A reescrita recebe `{ vaga, questao, achados, trechos }` e corrige os achados mantendo as mesmas regras.
- Produces (servidor):
  - `generateSlot(deps: PipelineDeps, slot: SlotJob): Promise<SlotOutcome>` — `SlotJob = { request_id: string; slot: number; area: string; topic: string; subarea: string | null; competency: string | null; target: Letter; attempts: number; max_attempts: number }`; `SlotOutcome = { state: "gerada" | "pulada" | "descartada"; reason: string | null; draft_id: string | null; cost_usd: number; calls: number }`. Laço:

```
trechos = searchOfficialPassages(tema + subárea + competência, 8); nenhum → pulada "sem fonte oficial" (sem IA)
q = staziamed_questao(vaga, trechos)              ; evidencia_insuficiente → pulada "evidência insuficiente: <reason>"
repetir no máximo 2 vezes (original + 1 reescrita):
  v = validateGenerated(q, oferecidos, corpus)    ; sem crítico → q' = shuffleToTarget(q, alvo); c = runCheckLayers(q')
  problemas = críticos/importantes de v e de c
  sem problemas → sai; já reescreveu → sai; senão q = staziamed_reescrita(vaga, q, problemas, trechos)
crítico de validação no fim → descartada "Validação: <detalhe do 1º crítico>"; senão grava (achados restantes ficam para o revisor)
erro na última tentativa (attempts ≥ max_attempts) → descartada "Falha da IA: <mensagem>" e relança
```

  - `stepQuestionGenerate(deps: PipelineDeps, job: Job): Promise<null>` (escopo `staziamed:<pedido>:<vaga>`; vaga já final → não faz nada).
- Produces (banco):
  - `ch_worker_staziamed_slot(p_request_id uuid, p_slot integer) returns jsonb` (marca pedido e vaga "gerando"; devolve a vaga com `mode`).
  - `ch_worker_staziamed_slot_result(p_request_id uuid, p_slot integer, p_state text, p_reason text, p_draft_id uuid, p_cost numeric) returns jsonb` (pedido "concluido" quando nenhuma vaga está na fila ou gerando; soma o custo).
  - `ch_worker_staziamed_save_draft(p_request_id uuid, p_slot integer, p_draft jsonb, p_checks jsonb, p_generation jsonb) returns uuid` — `batch = 'pedido_' || to_char(pedido.created_at, 'YYYYMMDD') || '_' || left(pedido.id::text, 8)`, `source_id = 'vaga_' || lpad(vaga, 2, '0')`, `generated_by 'servidor'`, aguardando revisão médica, área/tema/subárea/competência da vaga, `source_citations` no formato novo, `generation = { modelos, prompts, trechos_oferecidos, reescrita, custo_usd, letra_alvo, embaralhamento }`; grava as 4 camadas (`p_checks = { software, sources, currency, redteam }`, cada `{ verdict, findings, provider, model, cost_usd }`) no hash da linha e o evento `gerada`; repetir devolve o mesmo id.
  - Simulação (`mock.ts`): `staziamed_questao`/`staziamed_reescrita` → `{ status: "evidencia_insuficiente", reason: "Simulação: sem IA real, nenhuma questão é escrita.", question: null }`.

- [ ] **Step 1: Write the failing tests** (pedido criado por `app_staziamed_request_create`; tarefa rodada com `runJob` depois de `ch_worker_claim`)

```ts
it("sem trecho oficial do tema: vaga 'pulada' com 'sem fonte oficial', nenhuma chamada de IA", ...)
it("'evidência insuficiente' da IA: vaga pulada com o motivo dela", ...)
it("questão válida: embaralhada para a letra-alvo, conferida e gravada aguardando revisão médica com citações oficiais, semelhança e trilha", ...)
  // correct_answer === alvo; source_citations[0] tem organ/version/page; 4 camadas no hash atual; generation.prompts.staziamed_questao === "1.0.0"
it("validação falha: uma reescrita só; se ainda falha, vaga descartada com o motivo", ...)   // 1 questao + 1 reescrita
it("70% de semelhança com oficial: reescreve uma vez; persiste → descartada", ...)
it("achado importante da conferência: uma reescrita; o que sobra fica para o revisor", ...)
it("só trechos oficiais vigentes vão para a IA (nível E e vencido ficam de fora), dentro de <documento>", ...)
it("IA falha nas 3 tentativas: vaga 'descartada' com 'Falha da IA' e pedido concluído", ...)   // Review Focus 5
it("tarefa repetida de vaga concluída não gera de novo", ...)
it("a simulação do desenvolvimento nunca escreve questão", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedGeracao.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** prompts, `generate.ts`, a etapa no `pipeline.ts`, a origem no maestro e as funções do banco.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedGeracao.test.ts src/__tests__/questoesStaziaMedConferencia.test.ts src/__tests__/contentHubPipeline.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: geracao por vaga so com trechos oficiais, uma reescrita e conferencias".

### Task 8: Buscar fonte oficial (`question_source`), propostas, usar e descartar

**Files:**
- Create: `server/contentHub/questoes/source.ts`
- Modify: `server/contentHub/pipeline.ts` (`STEPS.question_source`), `supabase/migrations/20261003009800_questoes_staziamed.sql`
- Test: Create `src/__tests__/questoesStaziaMedFonte.test.ts`

**Interfaces:**
- Consumes: `searchOfficialPassages`, `callAi` (T6), prompt `evidence` (`prompts.ts:77`), `isVerbatim`/`numbersOutside`/`negations` (`checks.ts`).
- Produces (servidor):
  - `sourceClaims(d: DraftRow): SourceClaim[]` — `SourceClaim = { kind: "decisao_clinica" | "numero"; text: string }`; a decisão clínica primeiro; depois cada frase (corte em `/(?<=[.;!?])\s+/`) da alternativa correta, de `explanation` e das explicações por alternativa que tenha `numbers()`; sem repetição (texto normalizado); no máximo 8.
  - `proposeSources(deps: RunDeps, d: DraftRow, creatorModel: string | null, spend: Spend): Promise<{ claims: ProposalClaim[]; complete: boolean }>` — `ProposalClaim = { kind; text; status: "encontrada" | "nao_encontrada"; citation: StaziaCitation | null; reason: string | null }`; por afirmação: trechos (até 6); nenhum → não encontrada; `evidence` pelo conferente do papel 0; só vale `verdict 'compatible'` + `isVerbatim` + mesmos números e negações; `citation.supports = afirmação`; `complete` = decisão e todos os números encontrados.
  - `stepQuestionSource(deps: PipelineDeps, job: Job): Promise<null>` (escopo `qsource:<rascunho>:<hash>`; hash mudou → nada).
- Produces (banco):
  - `app_staziamed_source_enqueue(p_draft_id uuid, p_estimate jsonb default '{}') returns jsonb` → `{ job_id, ja_na_fila }` (só `is_staff()`; sem decisão clínica → `'Preencha a decisão clínica central'`; acervo 0 → `'Cadastre fontes oficiais na Central de Conteúdo'`; chave `qsource:<id>:<hash>`).
  - `ch_worker_save_source_proposal(p_draft_id uuid, p_hash text, p_claims jsonb, p_complete boolean, p_meta jsonb) returns uuid` (hash diferente → nulo; propostas pendentes anteriores → `obsoleta`; evento `fonte_proposta`).
  - `app_draft_source_accept(p_proposal_id uuid) returns jsonb` → `{ draft_id, content_hash, revisar_aplicacao }` — só `is_staff()`; pendente; completa (senão `'Proposta incompleta: falta fonte oficial para a decisão clínica ou para algum número.'`); hash da proposta = atual (senão `'O rascunho mudou depois da busca: busque a fonte de novo.'`); troca `source_citations` pelas encontradas; evento `fonte_aceita` com `previous = { source_citations }`; volta a `awaiting_medical_review`; apaga `draft_checks` do rascunho; `edited_by/at`; `revisar_aplicacao = update_application ~* 'apostila|curso|sangue nos olhos|atualiza[çc][õo]es 2025-2026'`.
  - `app_draft_source_discard(p_proposal_id uuid) returns boolean` (estado `descartada`, `ch_log`).

- [ ] **Step 1: Write the failing tests**

```ts
it("afirmações: a decisão clínica e cada frase com número da resposta e das explicações, sem repetir, até 8", ...)
it("sem decisão clínica: 'Preencha a decisão clínica central'; sem acervo: 'Cadastre fontes oficiais na Central de Conteúdo'; nenhuma tarefa", ...)
it("citação não literal é descartada; 'compatível' sem o número do texto não vale", ...)
it("proposta completa só com a decisão e todos os números; incompleta não pode ser usada", ...)
it("Usar estas fontes num dos 200: sai a apostila (fica na trilha), volta a aguardar com conferências zeradas e pede revisão da aplicação", ...)
it("proposta de versão antiga: editar depois da busca impede usar; editar durante a busca impede gravar", ...)   // Review Focus 4
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedFonte.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** `source.ts`, a etapa e as funções do banco.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedFonte.test.ts src/__tests__/questoesStaziaMedGeracao.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: buscar fonte oficial com proposta por afirmacao, usar e descartar".

### Task 9: Rotas do servidor e estimativa de custo

**Files:**
- Create: `server/contentHub/questoes/estimate.ts`, `server/contentHub/questoes/routes.ts`
- Modify: `server/contentHub/router.ts` (chama `mountQuestoesStaziaMed` depois do middleware de login)
- Test: Create `src/__tests__/questoesStaziaMedRotas.test.ts`

**Interfaces:**
- Consumes: `app_staziamed_request_create` (T5), `app_staziamed_check_enqueue`/`app_staziamed_pending_checks` (T6), `app_staziamed_source_enqueue`, `sourceClaims` (T8), `ch_worker_staziamed_acervo`, `loadAiConfig`/`functionChecks`/`envFallbackRef` (`server/ai/config.ts`), `estimateCostUsd` (`server/ai/prices.ts:71`).
- Produces (`estimate.ts`):
  - `CALL_PROFILE = { criacao: { inputChars: 24_000, maxOut: 8192 }, conferencia: { inputChars: 18_000, maxOut: 4096 } } as const`.
  - `interface Estimate { chamadas_min: number; chamadas_max: number; usd_min: number | null; usd_max: number | null; sem_preco: string[]; ias: { criadora: string | null; conferentes: string[] } }`.
  - `estimateGeneration(cfg: AiConfig, count: number, env?: NodeJS.ProcessEnv): Estimate` (por questão 6 chamadas sem reescrita, 12 com); `estimateChecks(cfg, drafts: number, env?)` (5 por rascunho); `estimateSource(cfg, claims: number, env?)` (1 por afirmação). Preço: criadora = `cfg.functions.criacao.primary` ou `envFallbackRef("criacao")`; conferência do papel k = `cfg.functions.verificacao.reviewers[k] ?? primary` ou `envFallbackRef("verificacao")` (fontes 0, atualidade 1, adversarial 2 ×2, pedagógica 2); Ollama e mock = 0; sem preço → `"provedor/modelo"` em `sem_preco` e `usd_*` nulos.
- Produces (`routes.ts`): `mountQuestoesStaziaMed(router: Router, deps: PipelineDeps, asUser: <T>(req: Request & { user?: Identity }, fn: string, args?: Record<string, unknown>) => Promise<T>): void`. Equipe = `app_ch_whoami().staff`; senão 403 `'Gerar, conferir e buscar fonte é da equipe (administrador ou editor).'`.
  - `POST /questoes-staziamed/estimativa` `{ acao: "gerar" | "conferir" | "fonte", quantidade?, rascunhos?: string[], filtro?: object, rascunho?: string }` → `Estimate & { acervo: number; ia_pendente: string[]; teto: { ligado: boolean; mensal: number | null; por_execucao: number | null }; rascunhos?: string[] }`; `gerar`/`fonte` com acervo 0 → 409 `{ error: "Cadastre fontes oficiais na Central de Conteúdo" }`; `fonte` sem decisão → 400 `'Preencha a decisão clínica central'`.
  - `POST /questoes-staziamed/pedidos` `{ modo, area, tema, quantidade }` → 201 pedido (a estimativa recalculada vai em `p_estimate`).
  - `POST /questoes-staziamed/conferir` `{ rascunhos?: string[]; filtro?: object }` → `{ na_fila, ja_na_fila }` (com `filtro`, os ids vêm de `app_staziamed_pending_checks`; depois `app_staziamed_check_enqueue`).
  - Estimativa de `fonte`: lê o rascunho com `ch_worker_draft_for_job` (depois de conferir a equipe) e conta `sourceClaims(d)`; de `conferir`, conta os ids recebidos ou os de `app_staziamed_pending_checks`.
  - `POST /questoes-staziamed/rascunhos/:id/buscar-fonte` → `{ job_id, ja_na_fila }`.

- [ ] **Step 1: Write the failing tests** (estimativa pura com `AiConfig` montada no teste; rotas com banco de desenvolvimento, `createSession` e `express().listen(0)` como `contentHubProcessing.test.ts:25-45`)

```ts
it("gerar 3: 18 a 36 chamadas; custo = soma de estimateCostUsd da criadora e dos conferentes da Central", ...)
it("modelo sem preço: aparece em sem_preco e o custo fica nulo; Ollama custa 0", ...)
it("sem fonte oficial: gerar e buscar fonte respondem 409 'Cadastre fontes oficiais na Central de Conteúdo' e nada é gravado", ...)
it("pedido de editor vira tarefas na fila; revisor sem papel de equipe e aluno recebem 403", ...)
it("Conferir pendentes: estimativa pelo número de rascunhos do filtro; enfileirar duas vezes não duplica", ...)
it("buscar fonte sem decisão clínica: 400 'Preencha a decisão clínica central'", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedRotas.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** `estimate.ts`, `routes.ts` e a montagem no `router.ts`.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedRotas.test.ts src/__tests__/contentHubProcessing.test.ts src/__tests__/contentHubSemanticSearch.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: rotas de estimativa, pedido, conferencia e busca de fonte".

### Task 10: Editar, equilibrar gabarito, decidir com a trava e listar (banco)

**Files:**
- Modify: `supabase/migrations/20261003009800_questoes_staziamed.sql`; `src/__tests__/questoesStaziaMedSoOficiais.test.ts` (catálogo)
- Test: Create `src/__tests__/questoesStaziaMedRevisao.test.ts`; Modify `src/__tests__/helpers/staziamed.ts` (+ `readyDraft(env): Promise<{ id: string; hash: string; sourceId: string }>`: fonte oficial, rascunho de PEDIATRIA com tema, citação nova da decisão e as 4 camadas `pass` no hash atual)

**Interfaces:**
- Consumes: hash e trilha (T1), `staziamed_med_area` e a lista de `app_staziamed_topics` (T5), `draft_has_official_sources` e `draft_matches_filters` (T6), propostas (T8). `blocked_no_source = not draft_has_official_sources(d)`; os bloqueios 2 a 4 abaixo detalham o mesmo predicado.
- Produces:
  - `staziamed_cites_letter(p_text text) returns boolean` — `p_text ~ '([Aa]lternativas?|[Ll]etras?|[Oo]p[çc](ão|ao|ões|oes)|[Ii]tens?)\s+["“(]?[A-D]\M|\(\s*[A-D]\s*\)'` (mesmos exemplos de `citesLetter`).
  - `draft_approval_blockers(p_id uuid) returns text[]`, nesta ordem e com estes textos: `'Falta o tema.'` · `'Bloqueada: sem fonte oficial.'` (sem citação nova, ou alguma no formato antigo) · `'Fonte citada não está vigente: <título>.'` · `'Citação não confere com o trecho da fonte: <título>, p. <página>.'` · `'A decisão clínica não tem citação.'` · `'Conferência pendente: <Regras | Fontes oficiais | Atualidade | Revisão clínica independente>.'` (camada sem linha no hash atual) · `'Regras com problema crítico.'` · `'Fontes oficiais: <rótulo do veredito>.'` (sources ≠ `pass`) · `'Atualidade reprovada.'` · `'Semelhança de N% com questão oficial.'` (≥ 70) · `'Pede imagem que não existe.'`.
  - `app_draft_question_save(p_id uuid, p_hash text, p_content jsonb) returns jsonb` → `{ id, content_hash, status }`. `p_content` = `{ title, stem, support: { type, title, rows }, alternatives, correct_answer, explanation, alternative_explanations, clinical_decision, key_concepts, update_application, topic }`. Recusas: `'Editar rascunho é da equipe (administrador ou editor).'` · `'Outra pessoa salvou este rascunho depois que você abriu: abra de novo.'` · `'Questão recusada não é editada.'` · `'Escolha um tema da lista de temas das provas oficiais.'` · `'Rascunho inválido: <campo>.'`. Mudou algo: `status 'awaiting_medical_review'`, apaga `draft_checks`, zera `similarity_to_official`/`similar_question_id`, `edited_by/at`, evento `editada` com `previous` = conteúdo anterior.
  - `app_draft_balance_answer(p_id uuid, p_hash text) returns jsonb` → `{ from, to, content_hash }`; recusas `'A explicação cita letra: edite o texto antes de equilibrar o gabarito.'` e `'O gabarito já está na letra menos usada.'`; mesmos efeitos de editar, evento `editada` com nota `'Equilibrar gabarito: <de> → <para>'`.
  - `app_draft_question_decide(p_id uuid, p_decision text, p_note text default null, p_hash text default null, p_sources_checked boolean default false) returns boolean` (`drop function public.app_draft_question_decide(uuid, text, text)` antes). Mantém área do revisor e motivo para ajustes/recusa. `p_hash` diferente do atual → `'O texto mudou depois que você abriu: confira de novo.'` (obrigatório para aprovar; opcional nos outros). Aprovar: bloqueios → `'Não aprova: <bloqueios separados por " · ">'`; sem `p_sources_checked` → `'Marque "Conferi as fontes citadas".'`; redteam `fail` ou currency `inconclusive` sem nota → `'Explique na observação por que aprova apesar da revisão adversarial reprovada ou da atualidade inconclusiva.'`. Evento `decisao` com a nota.
  - `app_draft_questions(p_batch text default null, p_status text default null, p_area text default null, p_limit integer default 30, p_offset integer default 0, p_origin text default null, p_topic text default null, p_blocked boolean default null, p_min_similarity numeric default null) returns jsonb` (drop da assinatura de 5 argumentos) → `{ batches, checks, total, counts: { awaiting_medical_review, needs_changes, approved, published, retired, rejected, blocked }, answer_distribution: { A, B, C, D } (publicadas não recolhidas), acervo, items: [ campos + content_hash, situacao, can_review, can_edit (is_staff), can_publish (is_admin), reviewer, review_outdated, checks, approval_blockers, blocked_no_source, question: { id, code, number, retired_at } | null ] }`. `situacao`: `retired` se a questão está recolhida; `published` se publicada e o rascunho `approved`; senão `status`.
  - `app_draft_question_detail(p_id uuid) returns jsonb` → `{ draft (todos os campos + content_hash), events: [{ kind, at, actor_email, content_hash, note, previous, details }], proposals: [{ id, created_at, state, complete, claims, current }], similar_question: { id, code, exam_label, statement, options } | null, request }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("editar: só equipe; volta a aguardar, conferências apagadas e trilha com o conteúdo anterior", ...)
it("dois editores: salvar com hash antigo dá 'Outra pessoa salvou este rascunho…'", ...)
it("tema fora da lista de temas das provas oficiais é recusado", ...)
it("equilibrar gabarito: vai para a letra menos usada, explicações acompanham, conta como edição; recusado se a explicação cita letra", ...)
it("staziamed_cites_letter concorda com citesLetter nos mesmos exemplos", ...)
it.each(BLOQUEIOS)("trava no banco: %s", ...)   // readyDraft + 1 mudança por caso → a mensagem exata; área errada → mensagem de hoje
it("adversarial reprovada ou atualidade inconclusiva não travam, mas pedem observação", ...)
it("nenhum dos 200 aprova citando a apostila: 'Bloqueada: sem fonte oficial.'", ...)
it("revisor com a tela antiga: 'O texto mudou depois que você abriu: confira de novo.'", ...)   // Review Focus 3
it("lista: filtros de origem, pedido/lote, área, tema, situação, bloqueadas e semelhança; contagens; detalhe com trilha, proposta e oficial mais parecida", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedRevisao.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções e o catálogo (`app_draft_question_save`: `so_oficiais/filtra`; `app_draft_questions`, `app_draft_question_detail`, `draft_matches_filters`: `as_duas/historico`).
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedRevisao.test.ts src/__tests__/engineSeed.test.ts src/__tests__/questoesStaziaMedSoOficiais.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: editar, equilibrar gabarito e trava de aprovacao no banco".

### Task 11: Publicar, republicar, recolher e "fonte desatualizada"

**Files:**
- Modify: `supabase/migrations/20261003009800_questoes_staziamed.sql`; `src/__tests__/questoesStaziaMedSoOficiais.test.ts` (catálogo)
- Test: Create `src/__tests__/questoesStaziaMedPublicacao.test.ts`

**Interfaces:**
- Consumes: `readyDraft`, `app_draft_question_decide`, `draft_approval_blockers`, `staziamed_med_area` (T5, T10).
- Produces (todas plpgsql):
  - `staziamed_question_seq` (sequência).
  - `staziamed_question_payload(p_id uuid) returns jsonb` → `{ area (med_area), topic, statement, support: { type, title, rows }, options: [{ id, text, explanation }] (a correta leva `explanation` geral; as outras, a explicação delas), correct_option, expected_conduct (= clinical_decision), inep_intent: null, sources (= source_citations), status: 'valid' }`.
  - `app_staziamed_preview(p_id uuid) returns jsonb` (admin) → payload + `exam: { kind: 'STAZIAMED', title }` + `number` (o atual ou "próximo").
  - `app_staziamed_publish(p_id uuid, p_hash text) returns jsonb` → `{ question_id, code, number, action: 'publicada' | 'republicada' }`; trava a linha (`for update`). Recusas: `'Publicar é do administrador.'` · `'Publique só a versão aprovada pelo revisor médico.'` (não `approved` ou `reviewed_hash`/`content_hash`/`p_hash` diferentes) · `'Não publica: <bloqueios>'` · `'Esta versão já está publicada.'` · `'O gabarito mudou: recolha esta questão e publique como nova.'`. Nova: número `nextval`, id `'staziamed_q' || lpad(n, 4, '0')`, código `'STZ-' || lpad(n, 4, '0')`, `exam_id 'staziamed'`, `origin 'staziamed'`. Questão viva com mesmo gabarito → atualiza a mesma linha; recolhida com mesmo gabarito → atualiza e limpa `retired_at`; recolhida com gabarito novo → nova questão. Grava `question_id`, `published_hash`, `published_at/by`; evento `publicada`/`republicada`; atualiza `exams.question_count`.
  - `app_staziamed_retire(p_id uuid, p_reason text) returns jsonb` (admin; sem motivo → `'Explique o motivo para recolher.'`; `retired_at = now()`; evento `recolhida` com a nota).
  - `app_draft_questions` ganha `items[].stale_sources text[]` (títulos das fontes citadas que deixaram de ser oficiais vigentes) e `counts.stale`.

- [ ] **Step 1: Write the failing tests**

```ts
it("publicar: só administrador e só a versão aprovada; staziamed_q0001 / STZ-0001, área mapeada, opções com explicação, conduta, fontes, sem intenção do Inep", ...)
it("a prévia é igual ao que fica gravado", ...)
it("republicar depois de nova aprovação troca o conteúdo da mesma questão; gabarito diferente recusa; recolher e publicar como nova dá número novo", ...)
it("recolher: só administrador e com motivo; sai do sorteio e quem respondeu continua vendo", ...)
it("fonte vencida ou substituída: publicar recusa e a lista mostra a fonte desatualizada", ...)
it("Publicar duas vezes seguidas: uma questão só ('Esta versão já está publicada.')", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedPublicacao.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções (+ catálogo: `app_staziamed_publish`, `app_staziamed_retire`, `app_staziamed_preview` em `as_duas/historico`).
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedPublicacao.test.ts src/__tests__/questoesStaziaMedAlunoBanco.test.ts src/__tests__/questoesStaziaMedSoOficiais.test.ts --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: publicar, republicar e recolher pelo administrador".

### Task 12: Painel — seção "Questões StaziaMed", acervo, Gerar e lista

**Files:**
- Modify: `src/novo/app/admin/content/ContentHub.jsx:25,89` (rótulo "Questões StaziaMed"; `value` continua `ineditas`)
- Create: `src/novo/app/admin/content/questoes/QuestoesStaziaMed.jsx`, `GeneratePanel.jsx`, `DraftList.jsx`, `labels.js`
- Create: `src/novo/app/admin/content/questoes/DraftDetail.jsx` (o `Draft` de `DraftQuestions.jsx:118-261`, decidindo com `p_hash: item.content_hash`)
- Delete: `src/novo/app/admin/content/DraftQuestions.jsx`
- Modify: `src/novo/app/admin/content/labels.js:156` ("Questões StaziaMed"), `src/novo/app/admin/content/Units.jsx:431` ("Questão StaziaMed"), `server/contentHub/pipeline.ts:686` (`"Questão StaziaMed (não é questão oficial do Inep)"`)
- Test: Create `src/__tests__/questoesStaziaMedPainel.test.tsx`

**Interfaces:**
- Consumes: rotas (T9), `app_draft_questions`, `app_staziamed_topics`, `app_staziamed_requests` (T5, T10, T11), `hubPost` (`content/api.js`).
- Produces:
  - `QuestoesStaziaMed({ isAdmin, isStaff, reviewerAreas, go })` — banner "não é questão oficial do Inep"; acervo: `"N fontes oficiais com trechos"` ou `Banner` "Cadastre fontes oficiais na Central de Conteúdo" com botão para `go("fontes")`; `GeneratePanel` só para `isStaff`; `DraftList`.
  - `GeneratePanel({ acervo, onCreated })` — modo `SegmentedControl` "Tema" / "Temas mais cobrados", área, tema (`app_staziamed_topics`), quantidade 1–20; "Calcular custo" → `/questoes-staziamed/estimativa` → mostra chamadas, `US$ min a max`, IAs, teto e `ia_pendente`; "Confirmar e gerar" → `/questoes-staziamed/pedidos`; pedidos (`app_staziamed_requests`) com o resultado de cada vaga. Sem acervo: botões desabilitados.
  - `DraftList({ isAdmin, isStaff, reviewerAreas })` — filtros origem, pedido/lote, área, tema, situação (aguardando, ajustes, aprovada, publicada, recolhida, recusada), "Bloqueadas sem fonte oficial", semelhança mínima; contagens e distribuição do gabarito publicado; "Conferir pendentes" (estimativa → confirmar → `/questoes-staziamed/conferir` com `filtro`); linhas `DraftDetail`.
  - `labels.js`: `SITUACAO`, `LAYER`, `VERDICT`, `SEVERITY`, `ORIGEM`, `VAGA` (rótulos movidos de `DraftQuestions.jsx`).

- [ ] **Step 1: Write the failing tests** (`backend.rpc` e `fetch` simulados, como `adminContentPanels.test.tsx:9-37`)

```ts
it("a aba se chama 'Questões StaziaMed' e ?secao=ineditas continua abrindo", ...)
it("sem acervo: 'Cadastre fontes oficiais na Central de Conteúdo' com link para Fontes oficiais e Gerar desabilitado", ...)
it("gerar: o custo aparece antes; confirmar cria o pedido; vaga pulada mostra 'sem fonte oficial'", ...)
it("lista: filtros chegam a app_draft_questions; contagens e distribuição do gabarito; Conferir pendentes mostra o custo antes", ...)
it("revisor sem papel de equipe não vê Gerar nem Conferir pendentes", ...)
it("textos da Central: 'Questões StaziaMed' nos materiais e 'Questão StaziaMed' nas unidades", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedPainel.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** os componentes, a mudança de textos e a remoção de `DraftQuestions.jsx`.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedPainel.test.tsx src/__tests__/adminContentPanels.test.tsx src/__tests__/adminAbasVisiveis.test.tsx --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: secao no painel com acervo, Gerar com custo e lista com filtros".

### Task 13: Painel — rascunho aberto e ações

**Files:**
- Modify: `src/novo/app/admin/content/questoes/DraftDetail.jsx`
- Create: `src/novo/app/admin/content/questoes/DraftEditor.jsx`, `SourceProposal.jsx`, `PublishBox.jsx`
- Test: Modify `src/__tests__/questoesStaziaMedPainel.test.tsx`

**Interfaces:**
- Consumes: `app_draft_question_detail`, `app_draft_question_save`, `app_draft_balance_answer`, `app_draft_question_decide`, `app_draft_source_accept`/`discard`, `app_staziamed_preview`/`publish`/`retire` (T8, T10, T11); rotas `/conferir` e `/rascunhos/:id/buscar-fonte` (T9).
- Produces:
  - `DraftDetail({ item, isAdmin, isStaff, onChanged })` — ao abrir, `app_draft_question_detail`; mostra texto completo e tabela de apoio, citações (formato antigo riscado com "não é fonte oficial"; novo com órgão, documento, versão, página e trecho), questão oficial mais parecida lado a lado, conferências com achados, revisão automática (antiga e `pedagogia`), trilha, `stale_sources` como "fonte desatualizada" e `approval_blockers` ("Bloqueada: sem fonte oficial" em destaque).
  - Ações da equipe: "Editar" (`DraftEditor`, aviso "Salvar zera as conferências e a revisão médica deste rascunho.", salva com `p_hash`), "Conferir" (estimativa → confirmar), "Buscar fonte oficial" (estimativa → confirmar), "Equilibrar gabarito".
  - `SourceProposal({ proposal, onUsed, onDiscarded })` — afirmação ao lado do trecho/citação ou "não encontrada"; "Usar estas fontes" só com `complete`; com `revisar_aplicacao`, abre o editor com "Revise o campo 'aplicação da atualização': ele fala da apostila."
  - Revisor da área: caixa "Conferi as fontes citadas", observação, "Aprovar" desabilitado listando `approval_blockers`, "Pedir ajustes", "Recusar" (todos com `p_hash`).
  - `PublishBox({ item, onChanged })` (só `isAdmin`): "Publicar"/"Republicar" abre a prévia (`app_staziamed_preview`, como o aluno vê) e confirma; "Recolher" pede motivo.

- [ ] **Step 1: Write the failing tests**

```ts
it("abrir: citação da apostila riscada com 'não é fonte oficial'; citação oficial com órgão, documento, versão, página e trecho; oficial mais parecida; trilha", ...)
it("editar: avisa que conferências e revisão voltam a zero e salva com o hash aberto", ...)
it("buscar fonte: proposta lado a lado; 'Usar estas fontes' desabilitado na incompleta; usar pede revisão da aplicação", ...)
it("Aprovar desabilitado lista o que falta; com tudo em dia exige 'Conferi as fontes citadas' e manda o hash", ...)
it("administrador: Publicar mostra a prévia e publica; Recolher pede motivo; editor não vê Publicar", ...)
it("Equilibrar gabarito chama a função e recarrega", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedPainel.test.tsx --maxWorkers=1` — Expected: FAIL (os testes novos).
- [ ] **Step 3: Implement** os componentes.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedPainel.test.tsx --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: rascunho aberto com editar, conferir, fonte, aprovar, publicar e recolher".

### Task 14: Lado do aluno — opção "Questões Inéditas", rótulo, tabela de apoio e correção

> **Reescrita em 2026-10-12:** a escolha é na lista "Prova / edição" (não há seletor "Coleção"); o teste grátis válido treina; cadeado e convite só para quem está fechado.

**Files:**
- Modify: `src/novo/app/practice/format.js:15-17`, `QuestionBuilder.jsx`, `PracticeSession.jsx:463-470`, `SessionResult.jsx:39`, `Correction.jsx`, `src/novo/app/review/ErrorNotebook.jsx:116`
- Create: `src/novo/app/practice/SupportTable.jsx`
- Test: Create `src/__tests__/questoesStaziaMedAluno.test.tsx`; Modify `src/__tests__/novoPracticeFormat.test.ts`

**Interfaces:**
- Consumes: `exams[].locked`/`lock_message` de `app_question_filters`, `collection`/`locked`/`lock_message` de `app_get_session`, `origin`/`support` das visões (T2).
- Produces:
  - `format.js`: `examLabel` com `kind === "STAZIAMED"` → `"Questões Inéditas"` (na lista) e `isStaziamed(q): boolean` (`q?.exam?.kind === "STAZIAMED" || q?.origin === "staziamed"`); `questionRef(q): string` → `"Questão StaziaMed · nº 12"` ou `"Revalida 2024/1 · Q51"`.
  - `SupportTable({ support })` — nada sem linhas; senão `<table aria-label={support.title || "Dados de apoio"}>` com rótulo/valor, dentro de um contêiner com rolagem horizontal própria.
  - `QuestionBuilder`: a lista "Prova / edição" mostra "Questões Inéditas" (quando o banco a devolve). Escolhida: mostra o aviso "Questões criadas pela StaziaMed a partir de fontes oficiais e revisadas por médico. Não é questão oficial do Inep." e manda `exam_id: "staziamed"` (como as outras provas); com `locked`: cadeado na opção, o `lock_message` e "Ver planos" → `go("planos")`, e "Começar" desabilitado. Teste grátis **válido** não vê cadeado.
  - Sessão, resultado e caderno: `questionRef(question)` e `Badge` "não é questão oficial do Inep" quando `isStaziamed`; `SupportTable` depois de `QuestionFigures`. Sessão com `locked`: `EmptyState` com o `lock_message` e "Ver planos".
  - `Correction`: StaziaMed mostra "Gabarito StaziaMed: alternativa B", explicação, "Por que não as outras?", "Conduta esperada" e "Fontes oficiais citadas" (órgão, documento, versão, página, trecho); sem "O que a questão avalia", sem linha "Gabarito: …", sem botão do Tutor.

- [ ] **Step 1: Write the failing tests**

```ts
it("questionRef e examLabel: 'Questão StaziaMed · nº 12', 'Questões Inéditas' na lista e 'Revalida 2024/1 · Q51'", ...)
it("montador com plano pago ou teste grátis válido: a lista traz 'Questões Inéditas'; escolhida, mostra o aviso e manda exam_id 'staziamed'", ...)
it("montador fechado (teste vencido, plano vencido, sem assinatura): cadeado, o aviso do banco e 'Ver planos'; nunca inicia sessão StaziaMed", ...)
it("sessão: 'Questão StaziaMed · nº 12', selo 'não é questão oficial do Inep' e a tabela de apoio antes das alternativas", ...)   // Review Focus 1
it("correção: 'Gabarito StaziaMed: alternativa B', 'Por que não as outras?', conduta e 'Fontes oficiais citadas'; nunca 'gabarito oficial' nem 'O que a questão avalia'; sem Tutor", ...)
it("sessão de quem ficou sem acesso: o aviso do banco e 'Ver planos', sem erro", ...)   // Review Focus 2
it("caderno de erros: rótulo e selo da questão StaziaMed", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/questoesStaziaMedAluno.test.tsx src/__tests__/novoPracticeFormat.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as mudanças nas telas.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/questoesStaziaMedAluno.test.tsx src/__tests__/novoPracticeFormat.test.ts src/__tests__/errorNotebookConsolidation.test.tsx src/__tests__/equipeAcessoTelas.test.tsx --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** mensagem "Questoes StaziaMed: opcao Questoes Ineditas no montador, rotulo, tabela de apoio e correcao para o aluno".

### Task 15: Documentação, suíte completa, build e SQL do dono

**Files:**
- Create: `docs/architecture/QUESTOES_STAZIAMED.md`
- Create (fora do repositório): `~/Downloads/questoes_staziamed_supabase.sql`

**Interfaces:**
- Consumes: tudo das Tarefas 1–14.
- Produces: `QUESTOES_STAZIAMED.md` com: fluxo (pedido → vaga → rascunho → revisão → publicação), tabelas e funções novas, as três etapas da fila e onde rodam, rotas, regras (fonte oficial, limites, trava), o que conta "só oficiais" e "as duas" (o catálogo), o roteiro dos 200 (buscar fonte → usar → equilibrar gabarito → conferir → revisão médica; uma vez, `scripts/content-hub/run-draft-checks.ts --layers software --reference-dir <pasta das apostilas>` só no computador onde elas estão, para achar texto copiado), a ordem de publicação do §11 e que a tarefa do Cloud Run precisa ser implantada de novo para ter as etapas novas. O SQL do dono (só depois de 9730 a 9732 estarem no banco): `begin;`, a 9800, a 9801, `insert into supabase_migrations.schema_migrations (version, name) values ('20261003009800', 'questoes_staziamed'), ('20261003009801', 'questoes_staziamed_aluno') on conflict (version) do nothing;`, `commit;` (formato do arquivo do Termo).

- [ ] **Step 1:** escrever `QUESTOES_STAZIAMED.md`.
- [ ] **Step 2: Run** `npx vitest run --maxWorkers=1` — Expected: todos os arquivos passam e o número de arquivos no relatório é igual ao de arquivos de teste existentes (o "reaplicar a carga" de `questionKnowledge` pode estourar o tempo sob carga e passa sozinho).
- [ ] **Step 3: Run** `npm run build:vercel` — Expected: termina sem erro.
- [ ] **Step 4:** gerar `~/Downloads/questoes_staziamed_supabase.sql` e conferir com `diff` que os corpos são as duas migrações sem mudança.
- [ ] **Step 5: Commit**

```bash
git add docs/architecture/QUESTOES_STAZIAMED.md
git commit -m "Questoes StaziaMed: documentacao da arquitetura e roteiro de publicacao" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6:** publicar só com ordem do dono (§11): fontes oficiais carregadas → SQL no Supabase (9800, 9801) → código (GitHub/Vercel) → tarefa do Cloud Run com as etapas novas → primeiro teste dos 8 passos do §11 (um PCDT; 2 questões do tema com o custo; citações, conferências e semelhança; revisor da área aprova; administrador publica; conta com teste grátis válido e conta Pro treinam e veem "Gabarito StaziaMed", e conta com teste vencido vê fechado com o convite; Temas e incidência com 1.200 oficiais; primeiro dos 200 pelo caminho completo). Só depois os outros 199.
