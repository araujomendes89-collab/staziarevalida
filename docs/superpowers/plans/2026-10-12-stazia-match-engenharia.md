# Stazia Match — créditos diários, cobrança dos dois, integridade e fila/agenda opcionais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Andamento (2026-10-17, grupo "Stazia Match completo", ramo `stazia-match`).** Construídas M0, M1, M2, M4 e M5 (a cota segue DESLIGADA
> por padrão; nada ligado em produção; Stripe parada). **Os números de migração deste plano (9960 a 10000) foram trocados pelos
> reservados em `.tmp-aulas/NUMEROS-MIGRACAO.md`:** `013490` (M1a tabelas), `013500` (M1b+M1c funções, estado do aluno, exportação),
> `013510` (M2c reservas por pessoa + M2e par canônico), `013520` (M2a débito no início + M2b pré-checagem), `013530` (M4a administração),
> `013540` (preparação da M3: moeda `ia` com janelas dia/semana/mês e estorno por referência; a ligação ao treino sozinho NÃO foi feita, espera o ramo `dupla-sozinho-ia` e os números do dono). Desvios deste texto: (1) `study_room_charges` ganhou a coluna `round` e a chave
> `(room_id, user_id, round)` por causa de "Treinar outra estação" (013380); (2) `app_dupla_answer_invite` só foi refeita na 013520
> (a 013510 não precisa); (3) `dupla_room_state` NÃO foi refeita (nada de `charged` no estado da sala); (4) o `p_now` das funções internas
> serve só aos testes; (5) o ponta a ponta no navegador (M5c) depende de `scripts/e2e/dupla.mjs` (Tarefa 20 do plano de 11/10), que
> não existe: a jornada foi conferida no banco (`duplaCreditosSeguranca`); (6) M5b: o roteiro está pronto
> (`scripts/dupla/concorrencia-creditos.mjs`), falta um Postgres de teste e autorização para o pacote `pg`. **Aguardando o dono:** Etapa R,
> Etapa N, Etapa G e "Fora deste plano"; **M3 (ligação)** espera juntar o ramo `dupla-sozinho-ia`. Mapa: `docs/architecture/STAZIA_MATCH_CREDITOS.md`.

**Goal:** Dar ao Treino em Dupla (e à IA do aluno) **um só livro de créditos**: cota diária por plano calculada no banco, saldo de **bônus** e
**comprados** (ordem do débito: diária, bônus, comprados), extrato auditável, **débito dos dois alunos numa transação no início confirmado da sala**
(um não paga se o outro não tem), pré-checagem ao formar o par, **uma sala aberta por pessoa garantida no banco**, **par canônico único**, painel
de administração, conciliação e testes de concorrência e segurança. Fila "Buscar agora" e Agenda ficam como **etapas opcionais**, só depois da
decisão do dono. **Nada de preço, quantidade, validade ou texto comercial é escrito no código**: tudo vem de `app_settings`, desligado e vazio.

**Architecture:** Funções `credit_*` internas (`security definer`, sem acesso do navegador) + `app_credit_state` (o aluno vê o seu) +
`app_admin_credit_*` (administrador). O ponto de cobrança é **`app_dupla_start`** (Tarefa 14 do plano de 11/10; é o `start_training_session` do §23 do
documento completo); a pré-checagem entra em `app_dupla_swipe`, `app_dupla_answer_invite` e `app_dupla_invite`. A IA do aluno usa o mesmo livro
(moeda `ia`). O `ai_usage_ledger` continua só para **custo** de IA. O Realtime só avisa (a linha da sala sobe o `rev`); nada de outbox.

**Tech Stack:** o do plano de 11/10 (Postgres/Supabase com PGlite nos testes, Express, React 19 + DS `src/novo/ds`, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-12-stazia-match-engenharia.md` — o §3 tem a decisão central; **o §12 analisa a especificação completa do dono
(`/Volumes/StaziaMed/Engenharia Match/STAZIA_MATCH_ENGENHARIA_COMPLETA_PROMPT_AGENTE.md`, 19 partes) e tem a lista atual de decisões (§12.7)**. Este plano
**substitui a Etapa Q** (migração 9950) do plano `2026-10-12-treino-dupla-pacote-1011.md` e **ajusta a Tarefa A1** do adendo
`2026-10-12-treino-dupla-sozinho-e-radar.md` (§4.5 da spec).

## Decisões que travam este plano (lista completa e atual: spec §12.7)
| Decisão | Efeito no plano |
|---|---|
| **Q1 — Quando cobrar.** O documento completo já diz: no **início confirmado**, de cada um dos dois, numa transação (compatível com "cada match é cobrado de ambos": "match extra" é o nome comercial de "sessão iniciada"). **Só confirmar** | Padrão deste plano. A opção "cobrar no aceite" está descartada pelos dois documentos |
| **Q2 — Unidade e rodada 2.** Unidade = **sala que começa**. Inverter papéis (rodada 2) gasta outro crédito? | Chave do lançamento `sala:<sala>:<aluno>`. A rodada 2 depende de `creditos.match.cobra_rodada_extra` (**falso** por padrão = não cobra) |
| **Q3 — Regras pequenas** (equipe não gasta [decisão do dono]; saldo do outro não revelado, abandono mantém o débito, estorno manual com justificativa e ao mesmo tipo de saldo [o documento já diz]) | Padrões deste plano |
| **Q4 — Números** (créditos por dia por plano; ordem bônus x comprados) | **Nenhum número entra no código**; só são preenchidos na Administração (M4) |
Sem resposta a Q1/Q2, **podem ser feitas M0, M1, M2c, M2e e M4** (não dependem delas); **M2a, M2b e M2d esperam**.

## Global Constraints
Valem **todas** as "Global Constraints" do plano de 11/10 (sem IA na dupla, nada inventado, pacote só como referência, textos pt-BR,
tokens e componentes do app, RLS, `security definer set search_path = ''`, fuso de Brasília, fila de testes, servidor local seguro,
commits só com `git add` explícito e **nunca `git push`**, nunca abrir `.env*`, no máximo 3 vitest/tsc/build juntos), mais:
- **Migrações: faixa 9960 a 9999 (e 10000+ para a Agenda).** Reservadas: `9960` tabelas e chave de configuração; `9961` funções internas; `9962`
  leitura do aluno, exportação e exclusão; `9970` débito no início (`app_dupla_start`); `9971` pré-checagem; `9972` uma sala por pessoa (reservas);
  `9973` par canônico único; `9974` limite de taxa (R1, opcional); `9975` moeda `ia`; `9980` administração e conciliação; `9990` fila (opcional);
  `010000` agenda (opcional). **Não usar 9900–9959** (reservadas pelo plano de 11/10; o adendo do sozinho também usa 9900/9901/9910/9920/9930 e precisa
  renumerar — Tarefa M0). **Antes de escrever cada uma**, conferir o número livre em **todos** os worktrees:
  `for d in .claude/worktrees/*/ .; do ls "$d"supabase/migrations 2>/dev/null; done | awk -F_ '{print substr($1,9)}' | sort -u | tail -8`
  (em 2026-10-12 o maior de outros ramos é `9820`). **Migração commitada não muda**; correção vai na seguinte; cada uma pode ser colada duas vezes.
- **Funções refeitas:** partir da definição **mais nova** (`grep -n "create or replace function public.<nome>"` nas migrações do Treino e nas
  novas): `app_dupla_start` ← 9910 (Tarefa 14); `app_dupla_swipe`, `app_dupla_answer_invite` ← 9770; `app_dupla_invite` ← 9940 (se feita) ou 9920 do adendo;
  `app_export_my_data` ← a mais nova; `app_settings_key_check` ← a **união** de todas as chaves existentes + `treino_dupla` + `treino_dupla_chat` + `creditos`.
- **Livro só-acrescenta.** `credit_ledger` nunca recebe `update` nem `delete`; correção = novo lançamento (`refund`, `adjust`, `revoke`).
- **Nada paralelo.** Proibido criar tabela `study_match_*` do documento (os nomes nossos estão na tabela 12.2a da spec); proibido novo contador de cota
  fora de `credit_*`; proibido mexer no Tutor nesta fase; proibido outbox, tabela de `Idempotency-Key`, rota Next.js ou link de chamada.
- **Navegador nunca manda** plano, saldo, limite, dia nem quantidade. Funções `credit_*` internas: `revoke … from public, anon, authenticated`.
- **Trava:** ordem fixa **par → pessoas (UUID crescente) → sala → carteira A → carteira B (UUID crescente)**. Nenhuma função pega carteira e depois sala.
  Nenhuma transação fica aberta esperando aceite ou resposta de outro (documento §25).
- **Mensagens ao aluno**, sempre em português e sem revelar o saldo ou o motivo do outro. Textos novos estão na lista abaixo.
- **Códigos de máquina:** todo erro novo que a tela precisa distinguir leva também `hint` em maiúsculas (`INSUFFICIENT_CREDITS`, `ALREADY_IN_SESSION`,
  `OFFER_EXPIRED`, `INCOMPATIBLE_ROLES`, `RATE_LIMITED`, como no §28 do documento completo) além da mensagem em português.
- **Teste de "agora":** funções internas aceitam `p_now timestamptz default now()` (nunca exposto a `authenticated`) para provar a virada do dia.
- **Fila de testes:** `FILA` = `bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"`, por extenso em cada comando.
- **Commits:** `git commit -m "<mensagem em português sem acento>" -m "Co-Authored-By: <modelo que executar> <noreply@anthropic.com>"`.

## Review Focus (novos)
1. **Nenhum caminho debita duas vezes** a mesma sala e aluno (clique duplo, recarregar, duas abas, falha depois do COMMIT e antes da resposta). Testes M2a.
2. **Os dois ou nenhum:** se um não tem crédito, ninguém paga e a sala não muda. Teste M1b e M2a.
3. **Dia virando:** pré-checagem num dia, débito noutro, estorno no dia original. Teste M1b.
4. **Ninguém lê o saldo do outro** (resposta crua, mensagem de erro, estado da sala). Teste M2d.
5. **Cota desligada = comportamento de hoje** (nada debita, nada limita). Teste M1b e M2a.
6. **Uma pessoa, uma sala aberta** mesmo com dois matches ao mesmo tempo, garantido por chave primária. Teste M2c.
7. **Equipe não gasta; colega gasta.** Teste M2a.
8. **Um par, uma conexão** (par canônico), mesmo com duas curtidas ao mesmo tempo. Teste M2e.

## Textos novos para aprovar (nada comercial; o resto vem do pacote de 11/10)
- Do pacote (reaproveitar): "Sua cota de matches acabou"; "Você pode adquirir mais matches para encontrar novos parceiros. Suas conversas continuam disponíveis."; "Os pacotes ainda não estão à venda." (plano de 11/10).
- Do documento completo (§42, adaptar): "Você utilizou suas sessões gratuitas de hoje." (número vindo do servidor); "A conexão caiu. Estamos verificando o estado da sua sessão."; "Não foi possível iniciar esta sessão" (mensagem neutra do §9).
- Novos: "Cota diária disponível" (rótulo); "Não foi possível formar a dupla agora." (par que não se forma por falta de crédito do outro, sem dizer quem); "Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo." (início recusado, vale para os dois); "Sua cota de hoje acabou." (só para quem está sem crédito); "Você já está em uma sala." (uma sala por pessoa).

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003009960_creditos_tabelas.sql`, `…009961_creditos_funcoes.sql`, `…009962_creditos_aluno.sql` | fundação: tabelas, funções internas, leitura do aluno, exportação e exclusão |
| `…009970_creditos_inicio_da_sala.sql`, `…009971_creditos_pre_checagem.sql` | débito no início; pré-checagem |
| `…009972_dupla_uma_sala_por_pessoa.sql`, `…009973_dupla_par_canonico.sql` | reservas por pessoa; par canônico único |
| `…009974_dupla_limite_de_taxa.sql` (opcional) | limite de escolhas e convites (valores do dono) |
| `…009975_creditos_ia.sql` | moeda `ia` para o treino sozinho |
| `…009980_creditos_admin.sql` | configuração, concessão, estorno, extrato e conciliação (administrador) |
| `…009990_dupla_fila.sql` (opcional), `…010000_dupla_agenda.sql` (opcional) | Etapas N e G |
| `src/novo/app/dupla/{QuotaNotice,CreditHeader}.jsx`, `src/novo/data/{backend,supabaseBackend,devServerBackend,localBackend}.ts` | avisos e cabeçalho de cota |
| `src/novo/app/admin/AdminDupla.jsx` (+ `AdminCreditos.jsx`) | bloco "Créditos" e extrato |
| `src/__tests__/duplaCreditos{Banco,Inicio,PreChecagem,Admin,Rls,Ia,Seguranca}.test.ts(x)`, `duplaUmaSala.test.ts`, `duplaParCanonico.test.ts`, `src/__tests__/helpers/duplaDb.ts` | testes |
| `scripts/dupla/concorrencia-creditos.mjs` | harness com Postgres real (fora da suíte padrão; M5b) |
| `docs/architecture/TREINO_EM_DUPLA.md` | mapa (créditos, reservas, quem lê o quê) — faz o papel do `inventory.md` e `architecture.md` do documento completo |

## Paralelismo
| Etapa | Juntas | Depois |
|---|---|---|
| M0 | — | — |
| M1 | M1a | M1b, depois M1c |
| M2 | M2c e M2e (não dependem do crédito) | M2a (precisa Tarefa 14 e M1), depois M2b, depois M2d |
| M3 | — | M3a, depois M3b |
| M4 | M4a | M4b |
| M5 | M5a e M5b | M5c |
| R | só com os números do dono | — |
| N, G | só com decisão do dono | — |

---

## Etapa M0 — Alinhar os planos (só documentos)

### Tarefa M0: Registrar nos planos vizinhos o que muda
**Já feito neste ramo (2026-10-12):** nota no topo da Etapa Q do plano de 11/10 e linha de atualização no fim da spec de 11/10 (ambos apontam para esta frente).
**Falta:**
- No ramo `treino-dupla` (adendo do sozinho; este ramo só leu): Tarefa A1 usa `credit_consume` (§4.5 da spec); renumerar as migrações 9900/9901/9910/9920/9930 para uma faixa livre (colidem com o plano de 11/10); Tarefa R1 **sem** `study_blocks` e **sem** limites de convite fixos (D8 e D9 do dono), e **sem** criar conexão por convite (documento §12 e adendo; ver pergunta 8 da spec §12.7).
- No plano de 11/10, Tarefa C1 (chat): mensagens com `expires_at = created_at + 24 h` (decisão D6 do dono), `dupla_sweep` apaga as vencidas, denúncia guarda uma **cópia** das mensagens (para a equipe ler o que foi denunciado); tempo da cópia = valor do dono. Etapa V: convite direto não cria `study_matches`.
- [ ] **Step 1:** Escrever as notas (sem mudar o resto) e conferir com `git diff --stat` que só documentos mudaram.
- [ ] **Step 2: Commit** "Treino em dupla: planos vizinhos apontam para o livro de creditos unico e para o chat de 24 horas".
**PARE: confirmação do dono** (spec §12.7: perguntas 1 a 3 e 6 a 8).

---

## Etapa M1 — Fundação do crédito (desligada; ninguém percebe)

### Tarefa M1a: Migração 9960 — tabelas, chave de configuração e livro só-acrescenta
**Files:** Create `supabase/migrations/20261003009960_creditos_tabelas.sql`, `src/__tests__/duplaCreditosBanco.test.ts`; Modify `src/__tests__/helpers/duplaDb.ts` (lista de migrações), `src/__tests__/supabaseSchema.test.ts` (tabelas novas), `src/__tests__/duplaMigracaoDados.test.ts`.

**Interfaces** (cabeçalho em português; "pode ser colada duas vezes"; COMO DESFAZER):
- `credit_wallets (user_id uuid references auth.users on delete cascade, pool text check (pool in ('match','ia')), purchased_balance integer not null default 0 check (purchased_balance >= 0), bonus_balance integer not null default 0 check (bonus_balance >= 0), updated_at timestamptz, primary key (user_id, pool))`; RLS ligada, **sem política**, `revoke all … from public, anon, authenticated`.
- `credit_daily (user_id, pool, day date, used integer not null default 0 check (used >= 0), primary key (user_id, pool, day))` (é o `daily_usage` do documento); RLS: o aluno **lê** a própria linha; nenhuma escrita direta. **Sem `limit_open`**: o limite é o do plano vivo (documento §8.9).
- `credit_ledger (id bigint generated always as identity primary key, user_id uuid references auth.users on delete cascade, pool text, day date not null, kind text check (kind in ('consume','refund','grant','purchase','revoke','adjust')), bucket text check (bucket in ('daily','bonus','purchased')), amount integer not null check (amount <> 0), ref_type text, ref_id uuid, idem_key text not null unique, reverses_id bigint references credit_ledger, reason text check (char_length(reason) <= 300), created_by uuid references auth.users on delete set null, created_at timestamptz default now())`; índices `(user_id, pool, day)` e `(ref_type, ref_id)`; RLS: o aluno lê os **seus**; gatilho que recusa `update` e `delete` ("O livro de créditos só aceita novas linhas.", igual `ai_usage_ledger_guard`).
- `study_room_charges (room_id uuid references checklist_rooms on delete cascade, user_id uuid references auth.users on delete cascade, bucket text check (bucket in ('daily','bonus','purchased','unlimited')), usage_date date not null, ledger_id bigint references credit_ledger, created_at timestamptz default now(), primary key (room_id, user_id))` — o `session_charges` do documento (§20, §21): **a chave primária é a segunda garantia** contra cobrança repetida; `ledger_id` nulo quando `unlimited`. RLS: o aluno lê os seus; sem escrita direta.
- `app_settings`: a checagem de chaves passa a aceitar a **união** + `creditos`; linha `creditos = {"ativa": false, "match": {"cobra_rodada_extra": false}, "ia": {}}` (`on conflict do nothing`).
- Não cria função nenhuma ainda.

- [ ] **Step 1: Write the failing tests**
```ts
it("as quatro tabelas existem, com RLS ligada e sem política de escrita para o aluno", …)
it("aluno lê só a própria linha de credit_daily, de study_room_charges e só os próprios lançamentos", …)
it("update e delete no livro são recusados, mesmo pelo dono do banco via gatilho de linha", …)
it("saldo negativo (comprado ou bônus) é recusado pela checagem; moeda ou balde desconhecido também", …)
it("idem_key repetida é recusada; (room_id, user_id) repetido em study_room_charges é recusado", …)
it("a chave 'creditos' nasce desligada, sem números e com cobra_rodada_extra falso; as chaves antigas continuam aceitas (união)", …)
it("colar duas vezes dá o mesmo banco (tabelas, índices, políticas, gatilhos)", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosBanco.test.ts src/__tests__/duplaMigracaoDados.test.ts src/__tests__/supabaseSchema.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração e atualizar as listas dos testes citados.
- [ ] **Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9960 com carteira, uso do dia, livro e cobranca por sala (desligado)".

### Tarefa M1b: Migração 9961 — funções internas (consumir, consumir os dois, estornar, conceder, estado, conciliar)
**Depois de:** M1a.
**Files:** Create `supabase/migrations/20261003009961_creditos_funcoes.sql`; Modify `src/__tests__/duplaCreditosBanco.test.ts`.

**Interfaces** (todas `security definer set search_path = ''`, `revoke … from public, anon, authenticated`):
- `credit_day(p_now timestamptz default now()) returns date` — dia de `America/Sao_Paulo`.
- `credit_limit(p_uid uuid, p_pool text) returns integer` — `null` = sem limite (equipe com acesso completo, ou `ativa` falso); senão o número de `creditos.<pool>.<plano>` do plano **vivo** (`subscriptions` + `subscription_is_paid`; `trial` só dentro do prazo); **plano sem número = 0** quando `ativa` é verdadeiro. Disponível diário = `max(0, limite − usado)`.
- `credit_state(p_uid, p_pool, p_now) returns jsonb` → `{ ativa, limite_dia, usados_hoje, bonus, comprados, disponivel }` (`disponivel = diário disponível + bônus + comprados`; `null` quando sem limite).
- `credit_consume(p_uid, p_pool, p_n integer, p_ref_type text, p_ref_id uuid, p_idem text, p_now timestamptz default now()) returns jsonb` — trava `pg_advisory_xact_lock(hashtextextended('credito:'||p_pool||':'||p_uid, 0))`; `p_idem` já existente → devolve `{ already: true, … }` **sem** debitar; gasta **diário → bônus → comprado** (a ordem sai de `creditos.<pool>.ordem`, padrão `["daily","bonus","purchased"]`); sem saldo → `raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS'`; cota desligada → `{ charged: false }` sem lançamento; equipe → `{ charged: false, bucket: 'unlimited' }` sem lançamento no livro.
- `credit_consume_pair(p_pool, p_a uuid, p_b uuid, p_ref_type, p_ref_id, p_idem_prefix, p_now) returns jsonb` — ordena os dois por UUID, trava na ordem, confere os dois e só então debita os dois (**dois lançamentos**); qualquer falha desfaz **tudo**; devolve, para o chamador interno, o balde de cada um (para `study_room_charges`) e **nunca** o saldo.
- `credit_assert_available(p_uid, p_pool, p_now) returns void` — pré-checagem; não debita; `raise 'sem_credito'`.
- `credit_refund(p_ledger_id bigint, p_reason text, p_now timestamptz default now()) returns jsonb` — lança `refund` no **mesmo balde**; uma vez só (`idem_key = 'refund:'||id`). **Se o consumo foi do balde diário de um dia anterior:** registra o ajuste na data original, **não** reduz o uso de hoje e **não** cria cota nova; o administrador pode conceder uma compensação como `grant` em `bonus` (documento §8.14 e §26).
- `credit_grant(p_uid, p_pool, p_n, p_reason, p_idem, p_bucket text default 'bonus') returns jsonb` — soma ao balde; só chamada por funções do administrador.
- `credit_reconcile(p_pool text) returns jsonb` — lista inconsistências: `credit_daily.used` ≠ soma dos lançamentos diários; saldo ≠ soma do livro por balde; `study_room_charges` sem lançamento (exceto `unlimited`); só administrador pode chamá-la por `app_admin_credit_reconcile` (M4a).

- [ ] **Step 1: Write the failing tests** (PGlite; contas de `helpers/duplaDb`; a cota é ligada com `update app_settings` pelo dono do banco)
```ts
it("cota desligada: consumir não lança nada e não limita (comportamento de hoje)", …)            // Review Focus 5
it("ligada e plano sem número: zero; com número: gasta o diário, depois o bônus, depois o comprado, e recusa no seguinte com hint INSUFFICIENT_CREDITS", …)
it("equipe (administrador, editor, revisor médico) não gasta nem é limitada", …)                  // Review Focus 7
it("a mesma idem_key não debita de novo e devolve o lançamento que já existe", …)                  // Review Focus 1
it("o par: se um dos dois não tem saldo, nenhum dos dois é cobrado e nada é gravado", …)           // Review Focus 2
it("o par: dois lançamentos, um por aluno, com a mesma ref e chaves diferentes", …)
it("ordem de trava: o texto da função trava em ordem crescente de UUID", …)
it("virada do dia: p_now às 23:59:59 e 00:00:01 de São Paulo usam dias diferentes; bônus e comprados preservados; nova cota", …) // Review Focus 3
it("upgrade no meio do dia vale na hora; downgrade abaixo do usado deixa o disponível em zero, nunca negativo", …)
it("estorno volta ao mesmo balde, uma vez só; estorno de diário de dia passado não reduz o uso de hoje", …)
it("saldo nunca fica negativo, mesmo com 20 chamadas em sequência no último crédito", …)
it("conciliação: used = consumos diários do dia menos estornos; cada saldo = concessões menos consumos; adulterar uma linha à mão é detectado", …)
it("o aluno (authenticated) não executa nenhuma credit_*", …)
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o mesmo + `duplaMigracaoDados.test.ts supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9961 com as funcoes do livro de creditos (consumir, os dois, estornar, conceder, conciliar)".

### Tarefa M1c: Migração 9962 — o que o aluno vê, exportação e exclusão de conta
**Depois de:** M1b.
**Files:** Create `supabase/migrations/20261003009962_creditos_aluno.sql`, `src/__tests__/duplaCreditosRls.test.ts`; Modify `src/__tests__/duplaMigracaoDados.test.ts`.
**Interfaces:**
- `app_credit_state(p_pool text) returns jsonb` (autenticado; **não** exige acesso ao Treino, para servir à IA): `{ ativa, pool, limite_dia, usados_hoje, bonus, comprados, disponivel, renova_em }` só do próprio aluno (`renova_em` = próxima 00h de São Paulo, como o `resetAt` do §28 do documento); `p_pool` inválido → `'Moeda inválida.'`.
- `app_export_my_data` refeita (base: a mais nova) com `credit_ledger`, `credit_daily` e `study_room_charges` **do aluno**.
- Exclusão da conta apaga os quatro (cascade); a conta do colega não é tocada.
- [ ] **Step 1: Write the failing tests** — aluno A lê só o seu estado e o seu extrato; B não vê nada de A (pela função e direto nas tabelas); visitante barrado; `renova_em` é a próxima meia-noite de São Paulo; exportação traz os meus lançamentos; excluir a conta apaga os meus e não os do colega; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosRls.test.ts src/__tests__/duplaMigracaoDados.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos + `supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9962 com o estado de creditos do aluno, exportacao e exclusao".

#### Fim da Etapa M1
- [ ] Typecheck filtrado e suíte completa (como nas Global Constraints do plano de 09/10) — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migrações **9960 a 9962**; "nada muda para ninguém: a cota nasce desligada"; como conferir no banco (`select * from public.app_settings where key = 'creditos'`); SQL para colar (regra `conferir-sql-colado`: depois de colar, sondar de fora se entrou inteiro).
**PARE: confirmação do dono.**

---

## Etapa M2 — Integridade (sem crédito) e cobrança dos dois no início confirmado

### Tarefa M2c: Migração 9972 — uma pessoa, uma sala aberta, garantido no banco
**Paralela com:** M1 e M2e (não depende do crédito).
**Files:** Create `supabase/migrations/20261003009972_dupla_uma_sala_por_pessoa.sql`, `src/__tests__/duplaUmaSala.test.ts`.
**Interfaces (o `active_claims` do documento, §20/§25, no nosso nome):**
- `study_room_claims (user_id uuid primary key references auth.users on delete cascade, room_id uuid not null references checklist_rooms on delete cascade, created_at timestamptz default now())` — RLS ligada, sem política, sem acesso direto. **A chave primária é a garantia de "no máximo uma sala aberta por pessoa".**
- Gatilho em `checklist_rooms`: `after insert` põe uma reserva para cada `member_ids`; `after update of phase` para `closed` remove as reservas da sala. Assim **todo caminho** (swipe, convite direto, fila, aceite, saída, varredura, recusa) fica coberto sem refazer cada função. Violação de chave → `raise exception 'Você já está em uma sala.' using errcode = '23505', hint = 'ALREADY_IN_SESSION'`.
- Backfill idempotente: salas já abertas (se houver) criam as reservas; se duas salas abertas disputarem a mesma pessoa, a mais antiga fica e a outra fecha com `closed_reason = 'sem_sinal'` (relatar no cabeçalho). Hoje não há dado publicado.
- `app_dupla_swipe` e `app_dupla_answer_invite` (base 9770) refeitas só para **traduzir a violação** em `matched:false` (swipe) e na mensagem acima (aceite); a conferência atual "sem sala aberta" continua como filtro rápido. `app_dupla_invite` (quando existir) idem.
- [ ] **Step 1: Write the failing tests**
```ts
it("A faz 'Estudar junto' com B e com C ao mesmo tempo: no máximo uma sala aberta para A", …)   // Review Focus 6
it("aceitar dois convites ao mesmo tempo gera uma sessão ativa", …)
it("inserir à mão uma segunda sala aberta com a mesma pessoa é recusado pelo banco (chave primária)", …)
it("fechar a sala (sair, recusar, vencer, sem sinal) libera as duas pessoas; elas podem entrar em outra", …)   // documento §47.16
it("sala fechada pela varredura preguiçosa também libera", …)
it("backfill: colar duas vezes dá o mesmo banco; reservas iguais às salas abertas", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaUmaSala.test.ts src/__tests__/duplaMatchBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS. *(A prova com conexões reais está na M5b.)*
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9972, uma sala aberta por pessoa garantida no banco".

### Tarefa M2e: Migração 9973 — par canônico único (uma conexão por par)
**Paralela com:** M2c.
**Files:** Create `supabase/migrations/20261003009973_dupla_par_canonico.sql`, `src/__tests__/duplaParCanonico.test.ts`.
**Interfaces (documento §11 e §21):** coluna gerada ou índice único em `(least(user_a, user_b), greatest(user_a, user_b))` de `study_matches` (uma conexão por par; hoje não há dado publicado, então não há duplicata a resolver — a migração **recusa colar** se achar duplicata, com aviso claro). `app_dupla_swipe` (base 9770) refeita: se o par já tem `study_matches`, **reusa** a conexão e cria só a **sala nova** (e o convite de 60 s); `study_matches.room_id` passa a significar "sala mais recente". Isto cura o buraco do chat ("um par = uma conversa", Etapa C) e permite a unidade "sala que começa" sem confundir com conexão.
- [ ] **Step 1: Write the failing tests** — duas curtidas ao mesmo tempo (A→B e B→A) = **uma** conexão e uma sala; um segundo encontro do mesmo par (depois da janela de 7 dias, simulada) reusa a conexão e abre sala nova; ordem dos usuários não importa; colar duas vezes; o teste existente `duplaMatchBanco.test.ts:430` continua passando.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaParCanonico.test.ts src/__tests__/duplaMatchBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9973, uma conexao por par".

### Tarefa M2a: Migração 9970 — o débito dos dois em `app_dupla_start` (o `start_training_session` do documento)
**Depois de:** M1c, M2c e **Tarefa 14** (existe `app_dupla_start`) e das decisões Q1 e Q2.
**Files:** Create `supabase/migrations/20261003009970_creditos_inicio_da_sala.sql`, `src/__tests__/duplaCreditosInicio.test.ts`; Modify `src/__tests__/helpers/duplaDb.ts`.
**Interfaces (passo a passo do §23 do documento, na ordem):**
- `app_dupla_start` **refeita** (base: 9910), tudo numa função: (1) `dupla_assert_access` e pertencimento; (2) trava a sala (`for update`); (3) se já está `running` ou depois, devolve o estado **sem debitar**; (4) confere que os dois estão em `ready_ids` e que quem inicia é o avaliador (regra do pacote); (5–6) revalida acesso dos dois e papéis; (7) `usage_date` = `credit_day(now())`, uma vez; (8) `credit_consume_pair('match', candidato, avaliador, 'room', sala, 'sala:'||sala)` — chave por aluno `sala:<sala>:<aluno>`; equipe = `unlimited`; (9) grava `study_room_charges` (um por aluno) e os lançamentos; (10) sala `setup → running`, `started_at`, `ends_at` do servidor, `rev + 1` (o Realtime avisa pela mudança da linha; **sem outbox**); falha → `'Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.'` (`hint = 'INSUFFICIENT_CREDITS'` internamente) para os dois, a sala **não** muda.
- **Rodada 2 (inverter papéis):** só cobra se `creditos.match.cobra_rodada_extra = true` (chave `sala:<sala>:r<n>:<aluno>`); por padrão não cobra.
- `checklist_rooms.charged_at timestamptz` (quando houve débito; nulo se cota desligada ou os dois na equipe).
- `dupla_room_state` refeita (base 9910/9900) **sem** campo de saldo; só `charged: true|false`.
- `app_dupla_leave` e `dupla_sweep`: **não** devolvem; abandono depois de iniciar mantém o débito (documento §8.13, §9).
- [ ] **Step 1: Write the failing tests**
```ts
it("iniciar com cota ligada debita 1 de cada um, em dois lançamentos e duas linhas de study_room_charges, e põe a sala em running", …)
it("um dos dois sem crédito: nenhum paga, a sala continua em setup e as duas respostas usam a mesma mensagem neutra", …)  // Review Focus 2, 4
it("app_dupla_start repetido (clique duplo, recarregar, duas abas, repetir depois de timeout) não debita de novo e devolve o estado", …)   // Review Focus 1; documento §47.5 e §47.12
it("os dois chamam start ao mesmo tempo: um débito por aluno, não dois", …)                                                  // documento §47.6
it("sem os dois prontos, ou sem ser o avaliador, nada consome", …)                                                            // documento §47.8
it("rodada 2 e reabrir a mesma sala não debitam; com cobra_rodada_extra ligado, a rodada 2 debita uma vez", …)
it("cota desligada: inicia como antes, sem lançamento e sem limite", …)                                                       // Review Focus 5
it("equipe não paga (balde unlimited, sem lançamento); o colega paga", …)                                                     // Review Focus 7
it("convite recusado, vencido, sala fechada antes do início: nenhum lançamento", …)
it("saiu depois de iniciar: o débito permanece; fechamento por falta de sinal também", …)
it("inicia às 23:59:59 e às 00:00:01: cada um cai no seu dia", …)                                                             // documento §47.9
it("a resposta de app_dupla_room e de app_dupla_start não traz saldo, limite nem nome de quem está sem crédito", …)       // texto bruto
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosInicio.test.ts src/__tests__/duplaSalaBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos + `duplaCreditosBanco.test.ts duplaMatchBanco.test.ts duplaPacoteBanco.test.ts duplaUmaSala.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9970, credito dos dois debitado no inicio confirmado da sala".

### Tarefa M2b: Migração 9971 — pré-checagem ao formar o match e ao convidar
**Depois de:** M2a (e M2c).
**Files:** Create `supabase/migrations/20261003009971_creditos_pre_checagem.sql`, `src/__tests__/duplaCreditosPreChecagem.test.ts`.
**Interfaces:** `app_dupla_swipe`, `app_dupla_answer_invite` e `app_dupla_invite` (quando existir) refeitas: antes de formar o par/convite chamam `credit_assert_available` para **os dois** (documento §5 e §16: elegibilidade preliminar, com nova verificação transacional no início); sem crédito **meu** → o código `quota` (a tela mostra "Sua cota de matches acabou"); sem crédito **do outro** → `{ matched: false, reason: 'indisponivel' }` (a tela mostra "Não foi possível formar a dupla agora." e **não** diz o motivo; resposta idêntica à de "o outro não escolheu"). "Pular" e conversar **nunca** passam por aqui. Cota desligada: nada muda.
- [ ] **Step 1: Write the failing tests** — sem crédito meu: `quota` e nada gravado de match/sala; sem crédito do outro: `matched:false`, **resposta idêntica** à de "o outro não escolheu" (não vaza); pular com cota zerada funciona; cota desligada = como hoje; a pré-checagem **não** grava lançamento; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosPreChecagem.test.ts src/__tests__/duplaMatchBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9971, pre-checagem de credito ao formar o match".

### Tarefa M2d: Telas — cabeçalho de cota, aviso "Sua cota de matches acabou" e início recusado
**Depois de:** M2a e M2b.
**Files:** Create `src/novo/app/dupla/{QuotaNotice,CreditHeader}.jsx`, `src/__tests__/duplaCreditosTela.test.tsx`; Modify `src/novo/app/dupla/{PracticeScreen,MatchModal}.jsx`, `src/novo/app/dupla/room/{SetupPhase,RunningPhase}.jsx`, `src/novo/data/{backend,supabaseBackend,devServerBackend,localBackend}.ts`.
**Comportamento:** `Backend.creditState(pool)` (`app_credit_state`); com a cota **ligada**, o cabeçalho do Praticar mostra "Cota diária disponível" com o número do servidor e a hora da renovação; o código `quota` abre o `Dialog` "Sua cota de matches acabou" + "Você pode adquirir mais matches…" + a tela informativa "Os pacotes ainda não estão à venda." (**sem botão de pagar**, sem preço); `matched:false` com `reason: 'indisponivel'` mostra "Não foi possível formar a dupla agora."; início recusado na sala mostra "Não foi possível iniciar agora…" e a sala segue em preparação; "Você já está em uma sala." com o botão de voltar à sala. Estados do §41 do documento onde fizerem sentido: carregando, vazio, erro recuperável, reconectando, cota esgotada. **Nunca descontar o número na tela antes de o servidor confirmar** (documento §43). Chat e "Abrir sala" funcionam sem cota. Cota desligada: nada aparece.
- [ ] **Step 1: Write the failing tests** — desligada: nada; ligada: mostra o número do servidor e nenhum número escrito na tela que não venha dele; `quota` abre o diálogo; sem botão de compra; chat e sala abrem sem cota; início recusado mantém a preparação e a mensagem neutra; nenhum campo de saldo do colega; o número só muda depois da resposta do servidor.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosTela.test.tsx src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: cabecalho de cota, aviso de cota esgotada e inicio recusado".

#### Fim da Etapa M2
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: migrações **9970 a 9973**; como testar com duas contas e a chave `creditos` ligada **só no banco de teste** (valores de teste, nunca os definitivos): iniciar com os dois, com um sem crédito, clicar duas vezes, inverter papéis, fechar antes de iniciar, tentar duas salas ao mesmo tempo, virar o dia (teste automático).
**PARE: confirmação do dono.**

---

## Etapa M3 — Créditos de IA do aluno no mesmo livro (depois da Etapa 6B do adendo)

### Tarefa M3a: Migração 9975 — moeda `ia` no treino sozinho
**Depois de:** M1c e da Tarefa A1 do adendo (funções `ch_worker_solo_*`).
**Files:** Create `supabase/migrations/20261003009975_creditos_ia.sql`, `src/__tests__/duplaCreditosIa.test.ts`; Modify (no ramo do adendo) `ch_worker_solo_prepare` e `ch_worker_solo_fail`.
**Interfaces:** `ch_worker_solo_prepare` reserva com `credit_consume(uid, 'ia', n, 'solo_run', run, 'solo:'||run||':'||tentativa)` (o peso `n` vem de `creditos.ia.pesos.avaliacao_sozinho`; **sem valor = bloqueada**, `'Avaliação por IA indisponível.'`); `ch_worker_solo_fail` faz `credit_refund`; janelas dia/semana/mês somam `credit_daily` (`creditos.ia.<plano>.dia|semana|mes`; vazio = bloqueada). O `ai_usage_ledger` segue só para custo. O Tutor **não muda**.
- [ ] **Step 1: Write the failing tests** — sem peso: bloqueada; reserva atômica (dois pedidos no último crédito: um passa, um recusa); falha devolve ao mesmo balde; janela semanal e mensal no fuso de São Paulo; Elite com a chave `station_feedback_allowed()` (se a 9731 existir); equipe passa; o resultado ao aluno não traz saldo de outro nem custo; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosIa.test.ts src/__tests__/duplaSozinhoIABanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9975, credito de IA do treino sozinho no mesmo livro".

### Tarefa M3b: Aviso de créditos de IA na tela do sozinho
**Depois de:** M3a.
**Files:** Modify telas do sozinho do adendo, `src/__tests__/duplaCreditosTela.test.tsx`.
**Comportamento:** o botão "Avaliar com IA" mostra o que sobra (`app_credit_state('ia')`) e, sem crédito, a mensagem curta do motivo; autoavaliação **sempre** disponível. Sem texto comercial.
- [ ] **Step 1–5** como acima. **Commit** "Treino em dupla: creditos de IA visiveis no treino sozinho".
**PARE: confirmação do dono** (peso da avaliação do sozinho, janelas dia/semana/mês: **valores dele**).

---

## Etapa M4 — Administração dos créditos

### Tarefa M4a: Migração 9980 — configuração, concessão, estorno, extrato e conciliação (só administrador)
**Depois de:** M1c.
**Files:** Create `supabase/migrations/20261003009980_creditos_admin.sql`, `src/__tests__/duplaCreditosAdmin.test.ts`.
**Interfaces** (todas `assert_admin()` + `admin_log`; é a "auditoria administrativa" do §20 do documento, no `admin_log` que já existe):
- `app_admin_credit_config() returns jsonb` / `app_admin_save_credit_config(p_config jsonb) returns jsonb` — valida: `ativa` booleano; limites inteiros ≥ 0 ou nulos; `ordem` com os três baldes sem repetir; **recusa ligar `ativa` sem pelo menos um plano preenchido** ("Preencha ao menos um plano antes de ligar a cota."); grava o antes e o depois no registro ("Créditos alterados"), com o autor.
- `app_admin_credit_statement(p_user uuid, p_pool text, p_days integer default 30) returns jsonb` — extrato do aluno (a leitura também vai ao registro).
- `app_admin_credit_grant(p_user, p_pool, p_n, p_reason)` — entra como **bônus**; motivo obrigatório; `idem_key` por chamada; **sem** pacote e **sem** preço.
- `app_admin_credit_refund(p_ledger_id, p_reason)` — motivo obrigatório; uma vez só; regras do §26 (diário de hoje reverte o uso; de dia passado, só compensação em bônus se o administrador marcar).
- `app_admin_credit_today() returns jsonb` — créditos usados hoje por moeda (para o "Uso do mês"); `app_admin_credit_reconcile(p_pool) returns jsonb` — chama `credit_reconcile`.
- [ ] **Step 1: Write the failing tests** — só administrador (editor, revisor médico e aluno são barrados); ligar sem número é recusado; concessão e estorno aparecem no extrato e no `admin_log`; estorno duas vezes recusado; limite inválido recusado; conciliação aponta linha adulterada; colar duas vezes.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosAdmin.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement. Step 4: Run** o mesmo + `supabaseAdminApi.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9980, administracao dos creditos (config, concessao, estorno, extrato, conciliacao)".

### Tarefa M4b: Bloco "Créditos" e "Extrato do aluno" na Administração
**Depois de:** M4a.
**Files:** Create `src/novo/app/admin/AdminCreditos.jsx`, `src/__tests__/duplaCreditosAdminTela.test.tsx`; Modify `src/novo/app/admin/AdminDupla.jsx`, `src/novo/data/*Backend.ts`.
**Comportamento:** em Administração › Configurações › Treinamento em Dupla: chave "Cota diária de matches" (desligada), campos por plano (`trial`, `pro`, `elite`, **vazios**), "Inverter papéis gasta crédito" (desligado), ordem de débito (padrão do documento), aviso "Plano sem número fica sem crédito quando a cota estiver ligada."; "Conceder créditos" (aluno, moeda, quantidade, motivo); "Extrato do aluno"; "Estornar" por lançamento; botão "Conferir saldos" (conciliação). Aluno barrado. Padrão visual das outras telas da Administração.
- [ ] **Step 1–5** como acima. **Commit** "Treino em dupla: bloco de creditos e extrato na Administracao".

#### Fim da Etapa M4
- [ ] Relatório ao dono: onde preencher os números (**os valores são dele**), como conceder e estornar; lembrete **único**: preço dos modelos de IA e tetos ficam para antes de liberar aos alunos (não é desta etapa).
**PARE: confirmação do dono.**

---

## Etapa M5 — Testes do documento (§47 e §48), concorrência real e ponta a ponta

### Tarefa M5a: Segurança — as provas do documento, no nosso banco
**Files:** Create `src/__tests__/duplaCreditosSeguranca.test.ts`. Mapa dos 18 testes do §47: spec §12.2b.
- [ ] **Step 1: Write the failing tests**
```ts
it("mexer no plano pelo navegador não muda a cota (o servidor ignora)", …)                       // §47.18 e §11 do documento
it("recarregar a sala em andamento não debita de novo", …)
it("usuário 'online' falso (sinal velho, status 'fora', sem acesso) não forma match nem entra em sala", …)
it("dois convites aceitos ao mesmo tempo: uma sessão ativa", …)
it("terceiro não lê extrato, estado nem lançamentos de ninguém; visitante barrado em tudo", …)     // §47.15 (A/B/C)
it("nenhuma função credit_* é executável por authenticated; app_credit_state só devolve o próprio", …)
it("virar o dia: nova cota, bônus e comprados preservados, estorno no dia original", …)
it("cota desligada em todos os caminhos = como antes da migração", …)
it("a conciliação fecha em zero depois de uma sequência de consumos, estornos e concessões", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCreditosSeguranca.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL onde algo faltar. **Step 3:** corrigir só o que faltar. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Treino em dupla: testes de seguranca dos creditos".

### Tarefa M5b: Concorrência com Postgres **real** (fora da suíte padrão)
**Paralela com:** M5a.
**Antes de começar (pré-voo, sem instalar nada):** confirmar com o dono qual Postgres usar (local ou o banco de **desenvolvimento**, **nunca produção**) e se `psql` ou o pacote `pg` já existem. **Não instalar dependência sem ordem.** O documento (§47) pede teste de concorrência real e diz "não simular só com mocks"; o PGlite roda uma conexão. Se não houver ambiente, esta tarefa fica como **pendência** e M1b e M5a continuam sendo a prova (aritmética, idempotência e texto das travas).
**Files:** Create `scripts/dupla/concorrencia-creditos.mjs` (ou `.sh` com `psql`), nota em `docs/architecture/TREINO_EM_DUPLA.md`.
**Cenários** (contas de teste e limpeza no fim): 20 chamadas simultâneas a `credit_consume` com 3 créditos → exatamente 3 lançamentos e saldo ≥ 0; 2 conexões em `credit_consume_pair` cruzado (A,B) e (B,A) → sem deadlock; 2 `app_dupla_start` ao mesmo tempo na mesma sala → 1 débito por aluno; A em dois matches simultâneos → 1 sala aberta (reserva); curtidas A→B e B→A → 1 conexão; mesma `idem_key` em 20 conexões → 1 lançamento.
- [ ] **Step 1:** Escrever o roteiro (sem rodar em produção). **Step 2:** rodar contra o banco de teste escolhido pelo dono e guardar a saída em `.superpowers/` (fora do git). **Step 3:** anotar no relatório o que passou e o que falhou. **Step 4: Commit** "Treino em dupla: roteiro de concorrencia dos creditos com Postgres real".

### Tarefa M5c: Ponta a ponta (§48), mapa e SQL para o dono
**Depois de:** M5a e, se possível, M5b.
**Files:** Modify `scripts/e2e/dupla.mjs`, `docs/architecture/TREINO_EM_DUPLA.md`; fora do repositório: `~/Downloads/StaziaMed-Creditos-SQL-9960-a-9980.sql`.
**Roteiro:** (cota ligada só no banco de teste) match → sala → os dois prontos → "Iniciar estação" debita os dois → recarregar não debita → um segundo par com um sem crédito não inicia e ninguém paga → "Sua cota de matches acabou" ao tentar novo match → concessão manual pela Administração → o aluno vê o número subir → estorno → extrato → conciliação em zero. O script **falha** se qualquer resposta ao aluno trouxer saldo do colega ou `idem_key`.
**SQL para o dono:** juntar as migrações da faixa 9960–9999 que existirem, na ordem, cada uma precedida de `-- Etapa N — <arquivo>`; `grep -c "^-- Etapa"` confere a contagem; depois de colar, **sondar de fora** (regra `conferir-sql-colado`) antes de qualquer publicação. Não colar duas vezes sem conferir.
- [ ] **Commit** "Treino em dupla: ponta a ponta, mapa e SQL dos creditos".
**PARE: confirmação do dono.** Publicação só com ordem dele, por etapa.

---

## Etapa R — Limite de taxa (OPCIONAL: só quando o dono der os números)
### Tarefa R1: Migração 9974 — limite de escolhas e de convites
**Files:** Create `supabase/migrations/20261003009974_dupla_limite_de_taxa.sql`, `src/__tests__/duplaLimiteTaxa.test.ts`.
**Interfaces (documento §44–45):** chaves em `app_settings.treino_dupla.limites` (`escolhas_por_minuto`, `convites_por_hora`, `convites_por_dia`; **vazias = sem limite**); `app_dupla_swipe` e `app_dupla_invite` contam em `study_swipes.created_at` / `study_invites.created_at` (sem tabela nova) e recusam com `hint = 'RATE_LIMITED'` e a hora em que dá para tentar de novo. Cooldown depois de recusa do mesmo par: valor do dono. **Sem bloqueio de pessoas** (decisão do dono).
- [ ] **Step 1–5** TDD de cinco passos; testes: sem valor não limita; com valor recusa na N+1; contagem por pessoa; resposta não revela quem foi barrado. **Commit** "Treino em dupla: migracao 9974, limite de escolhas e convites".

## Etapa N — "Buscar agora" (fila; documento §12, §16–18, §25) — OPCIONAL: só depois do radar e da decisão do dono
**Pré-requisito:** Etapa V (radar/convite direto) construída, M2c (reservas) e a decisão 10 da spec §12.7 = "agora". Padrão: **não construir** (poucos alunos online no começo).
- **N0 — Desenho:** a oferta da fila é **dos dois lados** (os dois aceitam), e `study_invites` é de um lado só. Resolver antes de codar: duas linhas de convite (uma por lado) ou uma coluna de aceites; a sala só nasce quando o segundo aceita. Mostrar ao dono em uma tela de papel.
- **N1 — Migração 9990:** `study_queue (user_id pk, station_id nullable, criteria jsonb, state, joined_at, last_heartbeat, expires_at)` com índice parcial "uma entrada ativa por pessoa"; `app_dupla_queue_join/leave/heartbeat/state`; `dupla_queue_pick(p_uid)` com `for update skip locked` (precedente `ch_worker_claim`), **filtros duros do §16** (acesso, online, papel complementar, sem sala aberta pela `study_room_claims`, **crédito** pela `credit_assert_available`, cooldown de recusa) e **nota `dupla_compat`** (sem motor novo); bônus de espera `min(10, minutos × 1,5)` só se o dono aprovar os números. Reserva dos dois na mesma transação, ids em ordem.
- **N2 — Varredura:** `dupla_sweep` ganha a expiração da fila (preguiçosa); rota Vercel Cron só se a fila ficar parada sem ninguém ler (precedente `/api/tutor/voice/sweep`; conferir o plano da Vercel).
- **N3 — Tela:** reaproveitar o visual `Matching.jsx` do pacote ("Procurando um parceiro…") com dados reais.
- **N4 — Testes (documento §47.2–3):** 100 pedidos de fila = uma entrada; duas ofertas não reservam a mesma pessoa; três na fila formam um par e um sobra; sem crédito não entra; quem recusou não reaparece de imediato.
Cada tarefa com TDD de cinco passos; **PARE** ao fim.

## Etapa G — Agenda (documento §13, Fase F) — SÓ DEPOIS de responder o §6 da spec
**G0 (única tarefa por enquanto):** mostrar ao dono as perguntas do §6 e do §12.7 (11) e, com as respostas, montar uma **prévia clicável** (Agendar, Minhas sessões, lembrete, Entrar na sala) com componentes e cores do app, para ele aprovar **antes** de qualquer migração. **Nada de tabela, função ou tela antes disso.** Depois da aprovação, escrever o plano da Agenda (migração `010000`). Requisitos do documento a respeitar: proposta com prazo, reserva sem sobreposição, **sem cobrar nem reservar cota antes**, na hora segue o mesmo `ready → in_session` (`app_dupla_start`).

## Fora deste plano (não construir) — razões na spec §12.6
- **Stripe** (pedido, pacote, checkout, webhook, `fulfill_paid_order`, chargeback): parada. O livro já aceita `purchase` e `idem_key` por pagamento.
- **Tutor no livro:** depois que o dono definir os créditos de IA e a equivalência.
- **Discovery separado do baralho**, **papel Moderador**, **observador**, **métricas pesadas**, **outbox**, **tabela de `Idempotency-Key`**, **schema privado**, **pgTAP**, **estrutura Next.js**, **pesos em tabela versionada**, **campos idioma/nível/foto/confiabilidade**, **nota 1–5 entre alunos**, **link do Meet**, **mensagens permanentes**.
- **Bloqueio de pessoas:** só no chat (e denúncia), conforme a pergunta 6 da spec §12.7; o radar fica "para todos".
- **Denúncia (C4) e chat de 24 h:** revisão da Tarefa C1 do plano de 11/10 (M0), não desta frente.
