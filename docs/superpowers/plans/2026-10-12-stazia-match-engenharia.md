# Stazia Match — créditos diários, cobrança dos dois e fila/agenda opcionais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Treino em Dupla (e à IA do aluno) **um só livro de créditos**: cota diária por plano calculada no banco, saldo de extras,
extrato auditável, **débito dos dois alunos numa transação** (um não paga se o outro não tem), pré-checagem no match, painel de
administração e testes de concorrência e segurança. Fila "Buscar agora" e Agenda ficam como **etapas opcionais**, só depois da decisão
do dono. **Nada de preço, quantidade, validade ou texto comercial é escrito no código**: tudo vem de `app_settings`, desligado e vazio.

**Architecture:** Funções `credit_*` internas (`security definer`, sem acesso do navegador) + `app_credit_state` (o aluno vê o seu) +
`app_admin_credit_*` (administrador). O ponto de cobrança do match é **`app_dupla_start`** (Tarefa 14 do plano de 11/10); a pré-checagem
entra em `app_dupla_swipe`, `app_dupla_answer_invite` e `app_dupla_invite`. A IA do aluno usa o mesmo livro (moeda `ia`). O
`ai_usage_ledger` continua só para **custo** de IA.

**Tech Stack:** o do plano de 11/10 (Postgres/Supabase com PGlite nos testes, Express, React 19 + DS `src/novo/ds`, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-12-stazia-match-engenharia.md` (decide o quê e por quê; o §3 tem a decisão central e o §8 as
perguntas ao dono). Este plano **substitui a Etapa Q** (migração 9950) do plano `2026-10-12-treino-dupla-pacote-1011.md` e **ajusta a
Tarefa A1** do adendo `2026-10-12-treino-dupla-sozinho-e-radar.md` (§4.5 da spec).

## Decisões que travam este plano (responder antes da Etapa M2)
| Decisão | Efeito no plano |
|---|---|
| **Q1 — Quando cobrar:** no início confirmado (padrão deste plano) ou no aceite | Se "no aceite": a Tarefa M2a vira M2a' (o débito sai de `app_dupla_answer_invite` e entra a devolução quando a sala fecha sem começar). O resto do plano não muda |
| **Q2 — Unidade:** match (padrão) ou sessão iniciada | Só muda a `idem_key` do lançamento: `match:<match>:<aluno>` (padrão) ou `sala:<sala>:<aluno>` |
| **Q3 — Regras pequenas** (equipe não gasta; saldo do outro não revelado; abandono mantém o crédito; estorno só manual; estorno ao mesmo saldo) | Padrões deste plano; mudar uma = ajustar a tarefa citada |
| **Q4 — Números** (créditos por dia por plano) | **Nenhum número entra no código**; só são preenchidos na Administração (M4) |
Sem resposta a Q1/Q2, **as Etapas M1 e M4 podem ser feitas** (não dependem delas); a **M2** espera.

## Global Constraints
Valem **todas** as "Global Constraints" do plano de 11/10 (sem IA na dupla, nada inventado, pacote só como referência, textos pt-BR,
tokens e componentes do app, RLS, `security definer set search_path = ''`, fuso de Brasília, fila de testes, servidor local seguro,
commits só com `git add` explícito e **nunca `git push`**, nunca abrir `.env*`, no máximo 3 vitest/tsc/build juntos), mais:
- **Migrações: faixa 9960 a 9999 (e 10000+ para a Agenda).** Reservadas: `9960` tabelas e chave de configuração; `9961` funções internas;
  `9962` leitura do aluno, exportação e exclusão; `9970` débito no início (`app_dupla_start`); `9971` pré-checagem; `9972` uma sala por
  pessoa; `9975` moeda `ia`; `9980` administração; `9990` fila (opcional); `010000` agenda (opcional). **Antes de escrever cada uma**,
  conferir o número livre em **todos** os worktrees:
  `for d in .claude/worktrees/*/ .; do ls "$d"supabase/migrations 2>/dev/null; done | awk -F_ '{print substr($1,9)}' | sort -u | tail -8`
  (em 2026-10-12 o maior de outros ramos é `9820`). **Migração commitada não muda**; correção vai na seguinte; cada uma pode ser colada duas vezes.
- **Funções refeitas:** partir da definição **mais nova** (`grep -n "create or replace function public.<nome>"` nas migrações do Treino e nas
  novas): `app_dupla_start` ← 9910 (Tarefa 14); `app_dupla_swipe`, `app_dupla_answer_invite` ← 9770; `app_dupla_invite` ← 9940 (se feita) ou 9920 do adendo;
  `app_export_my_data` ← a mais nova; `app_settings_key_check` ← a **união** de todas as chaves existentes + `treino_dupla` + `treino_dupla_chat` + `creditos`.
- **Livro só-acrescenta.** `credit_ledger` nunca recebe `update` nem `delete`; correção = novo lançamento (`refund`, `adjust`, `revoke`).
- **Nada paralelo.** Proibido criar tabela `match_*` do documento; proibido novo contador de cota fora de `credit_*`; proibido mexer no
  Tutor nesta fase.
- **Navegador nunca manda** plano, saldo, limite, dia nem quantidade. Funções `credit_*` internas: `revoke … from public, anon, authenticated`.
- **Trava:** ordem fixa **sala → carteira A → carteira B** (UUID crescente). Nenhuma função pega carteira e depois sala.
- **Mensagens ao aluno**, sempre em português e sem revelar o saldo ou o motivo do outro. Textos novos estão na lista abaixo.
- **Teste de "agora":** funções internas aceitam `p_now timestamptz default now()` (nunca exposto a `authenticated`) para provar a virada do dia.
- **Fila de testes:** `FILA` = `bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"`, por extenso em cada comando.
- **Commits:** `git commit -m "<mensagem em português sem acento>" -m "Co-Authored-By: <modelo que executar> <noreply@anthropic.com>"`.

## Review Focus (novos)
1. **Nenhum caminho debita duas vezes** o mesmo match e aluno (clique duplo, recarregar, duas abas, rodada 2, retomar). Testes M2a.
2. **Os dois ou nenhum:** se um não tem crédito, ninguém paga e a sala não muda. Teste M1b e M2a.
3. **Dia virando:** pré-checagem num dia, débito noutro, estorno no dia original. Teste M1b.
4. **Ninguém lê o saldo do outro** (resposta crua, mensagem de erro, estado da sala). Teste M2d.
5. **Cota desligada = comportamento de hoje** (nada debita, nada limita). Teste M1b e M2a.
6. **Uma pessoa, uma sala aberta** mesmo com dois matches ao mesmo tempo. Teste M2c.
7. **Equipe não gasta; colega gasta.** Teste M2a.

## Textos novos para aprovar (nada comercial; o resto vem do pacote de 11/10)
- Do pacote (reaproveitar): "Sua cota de matches acabou"; "Você pode adquirir mais matches para encontrar novos parceiros. Suas conversas continuam disponíveis."; "Os pacotes ainda não estão à venda." (plano de 11/10).
- Novos: "Cota diária disponível" (rótulo); "Não foi possível formar a dupla agora." (par que não se forma por falta de crédito do outro, sem dizer quem); "Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo." (início recusado, vale para os dois); "Sua cota de hoje acabou." (só para quem está sem crédito).

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003009960_creditos_tabelas.sql`, `…009961_creditos_funcoes.sql`, `…009962_creditos_aluno.sql` | fundação: tabelas, funções internas, leitura do aluno, exportação e exclusão |
| `…009970_creditos_inicio_da_sala.sql`, `…009971_creditos_pre_checagem.sql`, `…009972_dupla_uma_sala_por_pessoa.sql` | débito no início; pré-checagem; uma sala por pessoa |
| `…009975_creditos_ia.sql` | moeda `ia` para o treino sozinho |
| `…009980_creditos_admin.sql` | configuração, concessão, estorno e extrato (administrador) |
| `…009990_dupla_fila.sql` (opcional), `…010000_dupla_agenda.sql` (opcional) | Etapas N e G |
| `src/novo/app/dupla/{QuotaNotice,CreditHeader}.jsx`, `src/novo/data/{backend,supabaseBackend,devServerBackend,localBackend}.ts` | avisos e cabeçalho de cota |
| `src/novo/app/admin/AdminDupla.jsx` (+ `AdminCreditos.jsx`) | bloco "Créditos" e extrato |
| `src/__tests__/duplaCreditos{Banco,Inicio,PreChecagem,UmaSala,Admin,Rls,Ia}.test.ts(x)`, `src/__tests__/helpers/duplaDb.ts` | testes |
| `scripts/dupla/concorrencia-creditos.mjs` | harness com Postgres real (fora da suíte padrão; M5b) |
| `docs/architecture/TREINO_EM_DUPLA.md` | mapa (créditos, quem lê o quê) |

## Paralelismo
| Etapa | Juntas | Depois |
|---|---|---|
| M0 | — | — |
| M1 | M1a | M1b, depois M1c |
| M2 | M2c (independe do crédito) | M2a (precisa Tarefa 14 e M1), depois M2b, depois M2d |
| M3 | — | M3a, depois M3b |
| M4 | M4a | M4b |
| M5 | M5a e M5b | M5c |
| N, G | só com decisão do dono | — |

---

## Etapa M0 — Alinhar os planos (só documentos)

### Tarefa M0: Registrar no adendo do sozinho o que muda
**Já feito neste ramo (2026-10-12):** nota no topo da Etapa Q do plano de 11/10 e linha de atualização no fim da spec de 11/10 (ambos apontam para esta frente).
**Falta (ramo `treino-dupla`, a fazer por quem tiver a vez, pois este ramo só leu esse):** `docs/superpowers/plans/2026-10-12-treino-dupla-sozinho-e-radar.md`: Tarefa A1 usa `credit_consume` (§4.5 da spec); renumerar as migrações 9900/9901/9910/9920/9930 para uma faixa livre (colidem com o plano de 11/10); Tarefa R1 sem `study_blocks` e sem limites de convite, conforme D8 e D9 do dono; decidir se o convite direto cria `study_matches` (pergunta 9).
- [ ] **Step 1:** Escrever as notas no adendo (sem mudar o resto) e conferir com `git diff --stat` que só documentos mudaram.
- [ ] **Step 2: Commit** "Treino em dupla: adendo do sozinho aponta para o livro de creditos unico".
**PARE: confirmação do dono** (decisões Q1 a Q4 e as perguntas 8, 9, 12 da spec).

---

## Etapa M1 — Fundação do crédito (desligada; ninguém percebe)

### Tarefa M1a: Migração 9960 — tabelas, chave de configuração e livro só-acrescenta
**Paralela com:** nenhuma.
**Files:** Create `supabase/migrations/20261003009960_creditos_tabelas.sql`, `src/__tests__/duplaCreditosBanco.test.ts`; Modify `src/__tests__/helpers/duplaDb.ts` (lista de migrações), `src/__tests__/supabaseSchema.test.ts` (tabelas novas), `src/__tests__/duplaMigracaoDados.test.ts`.

**Interfaces** (cabeçalho em português; "pode ser colada duas vezes"; COMO DESFAZER):
- `credit_wallets (user_id uuid references auth.users on delete cascade, pool text check (pool in ('match','ia')), extra_balance integer not null default 0 check (extra_balance >= 0), updated_at timestamptz, primary key (user_id, pool))`; RLS ligada, **sem política** e `revoke all … from public, anon, authenticated`.
- `credit_daily (user_id, pool, day date, limit_open integer not null check (limit_open >= 0), used integer not null default 0 check (used >= 0), primary key (user_id, pool, day))`; RLS: o aluno **lê** a própria linha; nenhuma escrita direta.
- `credit_ledger (id bigint generated always as identity primary key, user_id uuid references auth.users on delete cascade, pool text, day date not null, kind text check (kind in ('consume','refund','grant','purchase','revoke','adjust')), bucket text check (bucket in ('daily','extra')), amount integer not null check (amount <> 0), ref_type text, ref_id uuid, idem_key text not null unique, reverses_id bigint references credit_ledger, reason text check (char_length(reason) <= 300), created_by uuid references auth.users on delete set null, created_at timestamptz default now())`; índices `(user_id, pool, day)` e `(ref_type, ref_id)`; RLS: o aluno lê os **seus**; gatilho que recusa `update` e `delete` ("O livro de créditos só aceita novas linhas.", igual `ai_usage_ledger_guard`).
- `app_settings`: a checagem de chaves passa a aceitar a **união** + `creditos`; linha `creditos = {"ativa": false, "match": {}, "ia": {}}` (`on conflict do nothing`).
- Não cria função nenhuma ainda.

- [ ] **Step 1: Write the failing tests**
```ts
it("as três tabelas existem, com RLS ligada e sem política de escrita para o aluno", …)
it("aluno lê só a própria linha de credit_daily e só os próprios lançamentos", …)
it("update e delete no livro são recusados, mesmo pelo dono do banco via gatilho de linha", …)
it("saldo de extras negativo é recusado pela checagem; moeda desconhecida também", …)
it("idem_key repetida é recusada", …)
it("a chave 'creditos' nasce desligada e vazia; as chaves antigas continuam aceitas (união)", …)
it("colar duas vezes dá o mesmo banco (tabelas, índices, políticas, gatilhos)", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosBanco.test.ts src/__tests__/duplaMigracaoDados.test.ts src/__tests__/supabaseSchema.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração e atualizar as listas dos testes citados.
- [ ] **Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9960 com carteira, uso do dia e livro de creditos (desligado)".

### Tarefa M1b: Migração 9961 — funções internas (consumir, consumir os dois, estornar, conceder, estado)
**Depois de:** M1a.
**Files:** Create `supabase/migrations/20261003009961_creditos_funcoes.sql`; Modify `src/__tests__/duplaCreditosBanco.test.ts`.

**Interfaces** (todas `security definer set search_path = ''`, `revoke … from public, anon, authenticated`):
- `credit_day(p_now timestamptz default now()) returns date` — dia de `America/Sao_Paulo`.
- `credit_limit(p_uid uuid, p_pool text, p_day date) returns integer` — `null` = sem limite (equipe com acesso completo, ou `ativa` falso); senão o número de `creditos.<pool>.<plano>` do plano **vivo** (`subscriptions` + `subscription_is_paid`; `trial` só dentro do prazo); **plano sem número = 0** quando `ativa` é verdadeiro.
- `credit_state(p_uid, p_pool, p_now) returns jsonb` → `{ ativa, limite_dia, usados_hoje, extras, disponivel }` (`disponivel = limite_dia − usados + extras`, `null` quando sem limite).
- `credit_consume(p_uid, p_pool, p_n integer, p_ref_type text, p_ref_id uuid, p_idem text, p_now timestamptz default now()) returns jsonb` — trava `pg_advisory_xact_lock(hashtextextended('credito:'||p_pool||':'||p_uid, 0))`; se `p_idem` já existe devolve `{ already: true, … }` **sem** debitar; abre `credit_daily` do dia (grava `limit_open`; upgrade usa `greatest(limit_open, limite atual)`); gasta primeiro o diário, depois o extra; sem saldo → `raise exception 'sem_credito'` (errcode `54000`); com cota desligada ou equipe → `{ charged: false }` sem lançamento.
- `credit_consume_pair(p_pool, p_a uuid, p_b uuid, p_ref_type, p_ref_id, p_idem_prefix, p_now) returns jsonb` — ordena os dois por UUID, trava na ordem, confere os dois e só então debita os dois (**dois lançamentos**); se qualquer um falhar, `raise` e tudo desfaz; devolve `{ a: {...}, b: {...} }` sem o saldo de nenhum.
- `credit_assert_available(p_uid, p_pool, p_now) returns void` — pré-checagem; não debita; `raise 'sem_credito'`.
- `credit_refund(p_ledger_id bigint, p_reason text) returns jsonb` — lança `refund` no **mesmo balde** e no **dia original**; uma vez só (`idem_key = 'refund:'||id`).
- `credit_grant(p_uid, p_pool, p_n, p_reason, p_idem) returns jsonb` — soma ao `extra_balance`; só chamada por funções do administrador.

- [ ] **Step 1: Write the failing tests** (PGlite; contas de `helpers/duplaDb`; a cota é ligada com `update app_settings` pelo dono do banco)
```ts
it("cota desligada: consumir não lança nada e não limita (comportamento de hoje)", …)            // Review Focus 5
it("ligada e plano sem número: zero; com número: gasta o diário, depois o extra, e recusa no seguinte", …)
it("equipe (administrador, editor, revisor médico) não gasta nem é limitada", …)                  // Review Focus 7
it("a mesma idem_key não debita de novo e devolve o lançamento que já existe", …)                  // Review Focus 1
it("o par: se um dos dois não tem saldo, nenhum dos dois é cobrado e nada é gravado", …)           // Review Focus 2
it("o par: dois lançamentos, um por aluno, com a mesma ref e chaves diferentes", …)
it("ordem de trava: o texto da função trava em ordem crescente de UUID", …)
it("virada do dia: p_now às 23:59:59 e 00:00:01 de São Paulo usam dias diferentes; extras preservados; nova cota", …) // Review Focus 3
it("upgrade no meio do dia vale na hora; downgrade só no dia seguinte (limit_open)", …)
it("estorno volta ao mesmo balde e ao dia original, uma vez só", …)
it("saldo de extras nunca fica negativo, mesmo com 20 chamadas em sequência no último crédito", …)
it("used = consumos do dia no balde diário menos estornos (invariante) e extras = concessões menos consumos", …)
it("o aluno (authenticated) não executa nenhuma credit_*", …)
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o mesmo + `duplaMigracaoDados.test.ts supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9961 com as funcoes do livro de creditos (consumir, os dois, estornar, conceder)".

### Tarefa M1c: Migração 9962 — o que o aluno vê, exportação e exclusão de conta
**Depois de:** M1b.
**Files:** Create `supabase/migrations/20261003009962_creditos_aluno.sql`, `src/__tests__/duplaCreditosRls.test.ts`; Modify `src/__tests__/duplaMigracaoDados.test.ts`.
**Interfaces:**
- `app_credit_state(p_pool text) returns jsonb` (autenticado; **não** exige acesso ao Treino, para servir à IA): `{ ativa, pool, limite_dia, usados_hoje, extras, disponivel }` só do próprio aluno; `p_pool` inválido → `'Moeda inválida.'`.
- `app_export_my_data` refeita (base: a mais nova) com `credit_ledger` e `credit_daily` **do aluno**.
- Exclusão da conta apaga os três (cascade); a conta do colega não é tocada.
- [ ] **Step 1: Write the failing tests** — aluno A lê só o seu estado e o seu extrato; B não vê nada de A (pela função e direto nas tabelas); visitante barrado; exportação traz os meus lançamentos; excluir a conta apaga os meus e não os do colega; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosRls.test.ts src/__tests__/duplaMigracaoDados.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos + `supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9962 com o estado de creditos do aluno, exportacao e exclusao".

#### Fim da Etapa M1
- [ ] Typecheck filtrado e suíte completa (como nas Global Constraints do plano de 09/10) — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migrações **9960 a 9962**; "nada muda para ninguém: a cota nasce desligada"; como conferir no banco (`select * from public.app_settings where key = 'creditos'`); SQL para colar (seguindo a regra `conferir-sql-colado`: depois de colar, sondar de fora se entrou inteiro).
**PARE: confirmação do dono.**

---

## Etapa M2 — Cobrança dos dois no início + pré-checagem (depois da Tarefa 14 e das decisões Q1 e Q2)

### Tarefa M2c: Migração 9972 — uma pessoa, uma sala aberta
**Paralela com:** M1 (não depende do crédito).
**Files:** Create `supabase/migrations/20261003009972_dupla_uma_sala_por_pessoa.sql`, `src/__tests__/duplaUmaSala.test.ts`.
**Interfaces:** `dupla_lock_user(p_uid uuid)` (interna) — `pg_advisory_xact_lock(hashtextextended('dupla-user:'||p_uid, 0))`; `dupla_lock_users(p_a, p_b)` trava **os dois em ordem crescente**. Refeitas (base 9770): `app_dupla_swipe` (trava o par como hoje **e depois** `dupla_lock_users`, e só então confere "sem sala aberta"), `app_dupla_answer_invite` (confere de novo ao aceitar); `app_dupla_invite` (quando existir) idem. Hierarquia de trava registrada no cabeçalho: par → pessoas → sala.
- [ ] **Step 1: Write the failing tests**
```ts
it("A faz 'Estudar junto' com B e com C ao mesmo tempo: no máximo uma sala aberta para A", …)   // Review Focus 6
it("aceitar dois convites ao mesmo tempo gera uma sessão ativa", …)
it("o texto das três funções trava as pessoas em ordem crescente de UUID", …)
it("quem tem sala aberta não entra em outro match nem convite; ao fechar a sala, volta a poder", …)
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaUmaSala.test.ts src/__tests__/duplaMatchBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS. *(O PGlite serializa: a prova com conexões reais está na M5b.)*
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9972, uma sala aberta por pessoa".

### Tarefa M2a: Migração 9970 — o débito dos dois em `app_dupla_start`
**Depois de:** M1c e **Tarefa 14** (existe `app_dupla_start`) e das decisões Q1 e Q2.
**Files:** Create `supabase/migrations/20261003009970_creditos_inicio_da_sala.sql`, `src/__tests__/duplaCreditosInicio.test.ts`; Modify `src/__tests__/helpers/duplaDb.ts`.
**Interfaces:**
- `checklist_rooms.charged_at timestamptz` (quando o débito aconteceu; nulo se cota desligada ou equipe nos dois).
- `app_dupla_start` **refeita** (base: 9910): tudo como era (só o avaliador; estação escolhida; os dois prontos; cronômetro do servidor) e, **na mesma transação, depois de travar a sala**, `credit_consume_pair('match', candidato, avaliador, 'match', coalesce(match_id, id), 'match:'||coalesce(match_id, id))` — a `idem_key` por aluno vira `<prefixo>:<aluno>`. Se o par já foi cobrado (retomada, rodada 2), `already` e **não** debita. Falha → `'Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.'` (para os dois), a sala **não** muda; quem está sem crédito vê `'Sua cota de hoje acabou.'` ao ler `app_credit_state`.
- `dupla_room_state` refeita (base 9910/9900) **sem** campo de saldo; só `charged: true|false`.
- `app_dupla_leave` e `dupla_sweep`: **não** devolvem; abandono depois de iniciar mantém o débito.
- [ ] **Step 1: Write the failing tests**
```ts
it("iniciar com cota ligada debita 1 de cada um, em dois lançamentos, e põe a sala em running", …)
it("um dos dois sem crédito: nenhum paga, a sala continua em setup e as duas respostas usam a mesma mensagem neutra", …)  // Review Focus 2, 4
it("app_dupla_start repetido (clique duplo, recarregar, duas abas) não debita de novo", …)                                 // Review Focus 1
it("rodada 2 (inverter papéis) e retomar a sala do mesmo match não debitam de novo", …)
it("cota desligada: inicia como antes, sem lançamento e sem limite", …)                                                     // Review Focus 5
it("equipe não paga; o colega paga", …)                                                                                     // Review Focus 7
it("convite recusado, vencido, sala fechada antes do início: nenhum lançamento", …)
it("saiu depois de iniciar: o débito permanece; fechamento por falta de sinal também", …)
it("inicia às 23:59:59 e às 00:00:01: cada um cai no seu dia", …)
it("a resposta de app_dupla_room e de app_dupla_start não traz saldo, limite nem nome de quem está sem crédito", …)       // texto bruto
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosInicio.test.ts src/__tests__/duplaSalaBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos + `duplaCreditosBanco.test.ts duplaMatchBanco.test.ts duplaPacoteBanco.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9970, credito dos dois debitado no inicio confirmado da sala".

### Tarefa M2b: Migração 9971 — pré-checagem ao formar o match e ao convidar
**Depois de:** M2a (e M2c).
**Files:** Create `supabase/migrations/20261003009971_creditos_pre_checagem.sql`, `src/__tests__/duplaCreditosPreChecagem.test.ts`.
**Interfaces:** `app_dupla_swipe`, `app_dupla_answer_invite` e `app_dupla_invite` (quando existir) refeitas: antes de formar o par/convite chamam `credit_assert_available` para **os dois**; sem crédito **meu** → o código `quota` (a tela mostra "Sua cota de matches acabou"); sem crédito **do outro** → `{ matched: false, reason: 'indisponivel' }` (a tela mostra "Não foi possível formar a dupla agora." e **não** diz o motivo). "Pular" e conversar **nunca** passam por aqui. Com a cota desligada nada muda.
- [ ] **Step 1: Write the failing tests** — sem crédito meu: `quota` e nada gravado de match/sala; sem crédito do outro: `matched:false`, **resposta idêntica** à de "o outro não escolheu" (não vaza); pular com cota zerada funciona; cota desligada = como hoje; a pré-checagem **não** grava lançamento; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosPreChecagem.test.ts src/__tests__/duplaMatchBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9971, pre-checagem de credito ao formar o match".

### Tarefa M2d: Telas — cabeçalho de cota, aviso "Sua cota de matches acabou" e início recusado
**Depois de:** M2a e M2b.
**Files:** Create `src/novo/app/dupla/{QuotaNotice,CreditHeader}.jsx`, `src/__tests__/duplaCreditosTela.test.tsx`; Modify `src/novo/app/dupla/{PracticeScreen,MatchModal}.jsx`, `src/novo/app/dupla/room/{SetupPhase,RunningPhase}.jsx`, `src/novo/data/{backend,supabaseBackend,devServerBackend,localBackend}.ts`.
**Comportamento:** `Backend.creditState(pool)` (`app_credit_state`); com a cota **ligada**, o cabeçalho do Praticar mostra "Cota diária disponível" com o número do servidor; o código `quota` abre o `Dialog` "Sua cota de matches acabou" + "Você pode adquirir mais matches…" + a tela informativa "Os pacotes ainda não estão à venda." (**sem botão de pagar**, sem preço); `matched:false` com `reason: 'indisponivel'` mostra "Não foi possível formar a dupla agora."; início recusado na sala mostra "Não foi possível iniciar agora…" e a sala segue em preparação. Chat e "Abrir sala" funcionam sem cota. Cota desligada: nada aparece.
- [ ] **Step 1: Write the failing tests** — desligada: nada; ligada: mostra o número do servidor e nenhum número escrito na tela que não venha dele; `quota` abre o diálogo; sem botão de compra; chat e sala abrem sem cota; início recusado mantém a preparação e a mensagem neutra; nenhum campo de saldo do colega.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosTela.test.tsx src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: cabecalho de cota, aviso de cota esgotada e inicio recusado".

#### Fim da Etapa M2
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: migrações **9970, 9971, 9972**; como testar com duas contas e a chave `creditos` ligada **só no banco de teste** (valores de teste, nunca os definitivos): iniciar com os dois, com um sem crédito, clicar duas vezes, inverter papéis, fechar antes de iniciar, virar o dia (teste automático).
**PARE: confirmação do dono.**

---

## Etapa M3 — Créditos de IA do aluno no mesmo livro (depois da Etapa 6B do adendo)

### Tarefa M3a: Migração 9975 — moeda `ia` no treino sozinho
**Depois de:** M1c e da Tarefa A1 do adendo (funções `ch_worker_solo_*`).
**Files:** Create `supabase/migrations/20261003009975_creditos_ia.sql`, `src/__tests__/duplaCreditosIa.test.ts`; Modify (no ramo do adendo) `ch_worker_solo_prepare` e `ch_worker_solo_fail`.
**Interfaces:** `ch_worker_solo_prepare` reserva com `credit_consume(uid, 'ia', n, 'solo_run', run, 'solo:'||run||':'||tentativa)` (o peso `n` vem de `creditos.ia.pesos.avaliacao_sozinho`; **sem valor = bloqueada**, `'Avaliação por IA indisponível.'`); `ch_worker_solo_fail` faz `credit_refund`; janelas dia/semana/mês somam `credit_daily` (`creditos.ia.<plano>.dia|semana|mes`; vazio = bloqueada). O `ai_usage_ledger` segue só para custo (`feature 'solo_eval'` continua válida para custo). O Tutor **não muda**.
- [ ] **Step 1: Write the failing tests** — sem peso: bloqueada; reserva atômica (dois pedidos no último crédito: um passa, um recusa); falha devolve ao mesmo balde; janela semanal e mensal no fuso de São Paulo; Elite com a chave `station_feedback_allowed()` (se a 9731 existir); equipe passa; o resultado ao aluno não traz saldo de outro nem custo; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosIa.test.ts src/__tests__/duplaSozinhoIABanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9975, credito de IA do treino sozinho no mesmo livro".

### Tarefa M3b: Aviso de créditos de IA na tela do sozinho
**Depois de:** M3a.
**Files:** Modify `src/novo/app/dupla/…` (telas do sozinho do adendo), `src/__tests__/duplaCreditosTela.test.tsx`.
**Comportamento:** o botão "Avaliar com IA" mostra o que sobra (`app_credit_state('ia')`) e, sem crédito, a mensagem curta do motivo; autoavaliação **sempre** disponível. Sem texto comercial.
- [ ] **Step 1–5** como acima. **Commit** "Treino em dupla: creditos de IA visiveis no treino sozinho".
**PARE: confirmação do dono** (peso da avaliação do sozinho, janelas dia/semana/mês: **valores dele**).

---

## Etapa M4 — Administração dos créditos

### Tarefa M4a: Migração 9980 — configuração, concessão, estorno e extrato (só administrador)
**Depois de:** M1c.
**Files:** Create `supabase/migrations/20261003009980_creditos_admin.sql`, `src/__tests__/duplaCreditosAdmin.test.ts`.
**Interfaces** (todas `assert_admin()` + `admin_log`):
- `app_admin_credit_config() returns jsonb` / `app_admin_save_credit_config(p_config jsonb) returns jsonb` — valida: `ativa` booleano; limites inteiros ≥ 0 ou nulos; **recusa ligar `ativa` sem pelo menos um plano preenchido** (aviso claro: "Preencha ao menos um plano antes de ligar a cota."); grava o antes e o depois no registro ("Créditos alterados").
- `app_admin_credit_statement(p_user uuid, p_pool text, p_days integer default 30) returns jsonb` — extrato do aluno (leitura de administrador também vai ao registro).
- `app_admin_credit_grant(p_user, p_pool, p_n, p_reason)` — motivo obrigatório; `idem_key` por chamada; **sem** pacote e **sem** preço.
- `app_admin_credit_refund(p_ledger_id, p_reason)` — motivo obrigatório; uma vez só.
- `app_admin_credit_today() returns jsonb` — créditos usados hoje por moeda (para o "Uso do mês").
- [ ] **Step 1: Write the failing tests** — só administrador (editor, revisor médico e aluno são barrados); ligar sem número é recusado; concessão e estorno aparecem no extrato e no `admin_log`; estorno duas vezes recusado; limite inválido recusado; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosAdmin.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** o mesmo + `supabaseAdminApi.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9980, administracao dos creditos (config, concessao, estorno, extrato)".

### Tarefa M4b: Bloco "Créditos" e "Extrato do aluno" na Administração
**Depois de:** M4a.
**Files:** Create `src/novo/app/admin/AdminCreditos.jsx`, `src/__tests__/duplaCreditosAdminTela.test.tsx`; Modify `src/novo/app/admin/AdminDupla.jsx`, `src/novo/data/*Backend.ts`.
**Comportamento:** em Administração › Configurações › Treinamento em Dupla: chave "Cota diária de matches" (desligada), campos por plano (`trial`, `pro`, `elite`, **vazios**), aviso "Plano sem número fica sem crédito quando a cota estiver ligada."; "Conceder créditos" (aluno, moeda, quantidade, motivo); "Extrato do aluno"; "Estornar" por lançamento. Aluno barrado. Padrão visual das outras telas da Administração.
- [ ] **Step 1–5** como acima. **Commit** "Treino em dupla: bloco de creditos e extrato na Administracao".

#### Fim da Etapa M4
- [ ] Relatório ao dono: onde preencher os números (**os valores são dele**), como conceder e estornar; lembrete **único**: preço dos modelos de IA e tetos ficam para antes de liberar aos alunos (não é desta etapa).
**PARE: confirmação do dono.**

---

## Etapa M5 — Testes obrigatórios do documento de engenharia, concorrência real e ponta a ponta

### Tarefa M5a: Segurança — as dez provas do documento, no nosso banco
**Files:** Create `src/__tests__/duplaCreditosSeguranca.test.ts`.
- [ ] **Step 1: Write the failing tests**
```ts
it("mexer no plano pelo navegador não muda a cota (o servidor ignora)", …)
it("recarregar a sala em andamento não debita de novo", …)
it("usuário 'online' falso (sinal velho, status 'fora', sem acesso) não forma match nem entra em sala", …)
it("dois convites aceitos ao mesmo tempo: uma sessão ativa", …)
it("terceiro não lê extrato, estado nem lançamentos de ninguém; visitante barrado em tudo", …)
it("nenhuma função credit_* é executável por authenticated; app_credit_state só devolve o próprio", …)
it("virar o dia: nova cota, extras preservados, estorno no dia original", …)
it("cota desligada em todos os caminhos = como antes da migração", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosSeguranca.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL onde algo faltar. **Step 3:** corrigir só o que faltar. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Treino em dupla: testes de seguranca dos creditos".

### Tarefa M5b: Concorrência com Postgres **real** (fora da suíte padrão)
**Paralela com:** M5a.
**Antes de começar (pré-voo, sem instalar nada):** confirmar com o dono qual Postgres usar (local ou o banco de **desenvolvimento**, **nunca produção**) e se `psql` ou o pacote `pg` já existem. **Não instalar dependência sem ordem.** Se não houver, esta tarefa fica como **pendência** e os testes M1b e M5a continuam sendo a prova (aritmética, idempotência e texto das travas).
**Files:** Create `scripts/dupla/concorrencia-creditos.mjs` (ou `.sh` com `psql`), nota em `docs/architecture/TREINO_EM_DUPLA.md`.
**Cenários** (cada um com contas de teste e limpeza no fim): 20 chamadas simultâneas a `credit_consume` com 3 créditos → exatamente 3 lançamentos e saldo ≥ 0; 2 conexões em `credit_consume_pair` cruzado (A,B) e (B,A) → sem deadlock; 2 `app_dupla_start` ao mesmo tempo na mesma sala → 1 débito por aluno; A em dois matches simultâneos → 1 sala aberta; mesma `idem_key` em 20 conexões → 1 lançamento.
- [ ] **Step 1:** Escrever o roteiro (sem rodar em produção). **Step 2:** rodar contra o banco de teste escolhido pelo dono e guardar a saída em `.superpowers/` (fora do git). **Step 3:** anotar no relatório o que passou e o que falhou. **Step 4: Commit** "Treino em dupla: roteiro de concorrencia dos creditos com Postgres real".

### Tarefa M5c: Ponta a ponta, mapa e SQL para o dono
**Depois de:** M5a e, se possível, M5b.
**Files:** Modify `scripts/e2e/dupla.mjs`, `docs/architecture/TREINO_EM_DUPLA.md`; fora do repositório: `~/Downloads/StaziaMed-Creditos-SQL-9960-a-9980.sql`.
**Roteiro:** (cota ligada só no banco de teste) match → sala → os dois prontos → "Iniciar estação" debita os dois → recarregar não debita → inverter papéis não debita → um segundo par com um sem crédito não inicia e ninguém paga → concessão manual pela Administração → o aluno vê o número subir → estorno → extrato. O script **falha** se qualquer resposta ao aluno trouxer saldo do colega, `limit_open` ou `idem_key`.
**SQL para o dono:** juntar as migrações da faixa 9960–9999 que existirem, na ordem, cada uma precedida de `-- Etapa N — <arquivo>`; `grep -c "^-- Etapa"` confere a contagem; depois de colar, **sondar de fora** (regra `conferir-sql-colado`) antes de qualquer publicação. Não colar duas vezes sem conferir.
- [ ] **Commit** "Treino em dupla: ponta a ponta, mapa e SQL dos creditos".
**PARE: confirmação do dono.** Publicação só com ordem dele, por etapa.

---

## Etapa N — "Buscar agora" (fila) — OPCIONAL: só depois do radar e da decisão do dono
**Pré-requisito:** Etapa V (radar/convite direto) construída e a decisão 10 da spec = "agora". Padrão: **não construir** (poucos alunos online no começo).
- **N1 — Migração 9990:** `study_queue (user_id pk, station_id nullable, joined_at, expires_at)`; `app_dupla_queue_join/leave/state`; função `dupla_queue_pick(p_uid)` que escolhe o candidato com `for update skip locked` (precedente: `ch_worker_claim`), **filtros do documento** (acesso, online, papel complementar, sem sala aberta, **crédito disponível** pela `credit_assert_available`) e **nota `dupla_compat`** (sem criar motor novo); cria o convite de 60 s pelo mesmo caminho do `app_dupla_swipe`. **Sem tabela de oferta nova**: a oferta é `study_invites` com `kind = 'fila'`. Tempo de espera flexibiliza **só** preferências não obrigatórias e **só com autorização do aluno**.
- **N2 — Varredura:** `dupla_sweep` ganha a expiração da fila (preguiçosa); rota Express/Vercel Cron só se a fila ficar parada sem ninguém ler (precedente: `/api/tutor/voice/sweep`); conferir o plano da Vercel antes (§10 da spec).
- **N3 — Tela:** reaproveitar o visual `Matching.jsx` do pacote ("Procurando um parceiro…"), com dados reais e sem pessoas inventadas.
- **N4 — Testes:** duas pessoas entram na fila e formam **um** par; três entram, um sobra; quem sai não é escolhido; sem crédito não entra; coincide com M2c (uma sala por pessoa).
Cada tarefa com o ritmo TDD de cinco passos; **PARE** ao fim.

## Etapa G — Agenda — SÓ DEPOIS de responder o §6 da spec
**G0 (única tarefa por enquanto):** mostrar ao dono a lista de perguntas do §6 e, com as respostas, montar uma **prévia clicável** (Agendar, Minhas sessões, lembrete, Entrar na sala) com componentes e cores do app, para ele aprovar **antes** de qualquer migração. **Nada de tabela, função ou tela antes disso.** Depois da aprovação, escrever o plano da Agenda (migração `010000`).

## Fora deste plano (não construir)
- **Compra** (checkout, webhook, estorno por pagamento, pacotes, pedidos): Stripe parada. O livro já aceita `purchase` e `idem_key` por pagamento; quando voltar, plano próprio.
- **Migrar o Tutor** para o livro: depois que o dono definir os créditos de IA e a equivalência.
- **Campos "nível de preparação" e "idioma"**, **confiabilidade** na compatibilidade, **campanhas de bônus**: não pedidos.
- **Bloqueio de pessoas**: depende da pergunta 8 da spec; o radar fica "para todos".
- **Chat que apaga em 24 h e denúncia**: revisão da Tarefa C1 do plano de 11/10 (não é desta frente).
