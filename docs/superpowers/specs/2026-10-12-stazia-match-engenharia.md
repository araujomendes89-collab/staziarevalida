# Stazia Match — o documento de engenharia x o que já temos x como construir

Data: 2026-10-12. Escrito para o dono do produto (o que o documento propõe, o que já existe, o que falta, o que ele precisa decidir) e
para quem for construir. **Só documento: nenhum código de produto foi alterado, nenhuma migração foi aplicada, nada foi publicado.**
Base: ramo `treino-pacote-1011` (a partir de `a49bfd9`, Etapas 1 a 4 do Treino em Dupla). Plano que acompanha este texto:
`docs/superpowers/plans/2026-10-12-stazia-match-engenharia.md`.

**Atualização (2026-10-12, depois):** o dono mandou a especificação **completa** (`/Volumes/StaziaMed/Engenharia Match/STAZIA_MATCH_ENGENHARIA_COMPLETA_PROMPT_AGENTE.md`,
19 partes, 1.099 linhas, com prompt mestre para agente). Ela está analisada no **§12** deste texto e **vale sobre o documento curto** onde os dois
divergem; os pontos que mudaram em relação ao que está escrito nos §3, §4 e §8 estão marcados com "REVISTO no §12". Leia o §12 primeiro.

O primeiro documento analisado ("STAZIA MATCH — Engenharia completa", versão 1.0, origem externa, colado pelo dono em 2026-10-12) foi escrito
para outra stack (Next.js, Supabase Cron, Stripe, Google Meet externo). Este texto **não adota a stack dele**: traduz as ideias para a
nossa (Vite/React em `/novo`, regras no Postgres do Supabase como funções `app_*`, Express na Vercel e Cloud Run só quando precisa de
segredo ou IA, Realtime só para avisar).

Este documento **complementa** `2026-10-12-treino-dupla-pacote-1011.md` (spec do pacote de 11/10) e o adendo
`2026-10-12-treino-dupla-sozinho-e-radar.md` (ramo `treino-dupla`). Onde nada é dito aqui, valem eles.

## 0. Em poucas linhas
1. **O que já temos cobre a parte "social" do documento**: perfis, baralho (curtir/passar), match recíproco, convite de 60 s, sinal de
   online, compatibilidade 40–99, sala com fases e dados — tudo **construído no ramo `treino-dupla`**, ainda **não publicado**.
2. **Não temos nada de créditos**: nem cota diária, nem carteira, nem extrato, nem débito dos dois. O plano de 11/10 reservou uma
   "Etapa Q" (migração 9950) só para o match, **desligada e sem números**. Este documento propõe **trocá-la** por um livro de créditos
   único (match e IA do aluno no mesmo lugar), sem sistema paralelo (§4).
3. **A pergunta central (§3) está fechada pelo documento completo (§12.1):** ele cobra **no início confirmado** da sessão, **de cada um dos dois**
   (os dois prontos, uma transação, ou os dois pagam ou nenhum paga) e explica que "match extra" é só o **nome comercial** de "sessão iniciada".
   Isso é compatível com a sua frase "cada match é cobrado de ambos". A diferença que sobra: a unidade é a **sessão que começa**, não o par. Peço só a sua confirmação (§12.7, pergunta 1).
4. **Fila "Buscar agora" (Match Now)** e **Agenda** do documento **não existem** e ficaram fora por decisões suas de 09/10. Eu
   recomendo **não construir a fila agora** (poucos alunos online ao mesmo tempo no começo) e **só desenhar a Agenda se você pedir** (§6).
5. **Stripe (§9 do documento): fica parada**, como você decidiu. Deixo o livro pronto para receber compra depois (tipo de lançamento
   "compra" e chave que não repete), sem tabela de pedido, sem rota, sem preço.
6. **Achei buracos nos planos que já existem** (§9): (a) nada no banco impede a mesma pessoa de entrar em **duas salas ao mesmo
   tempo** (o documento completo pede exatamente isso "garantido no banco", com uma tabela de reservas por pessoa); (b) os dois planos (pacote de
   11/10 e adendo do sozinho) usam **os mesmos números de migração** (9900, 9910, 9920, 9930); (c) o mesmo par pode ter vários `study_matches`
   (o documento exige um par canônico único).
7. **Nenhum número foi inventado**: cotas por dia, validade de extras, pesos finais e textos comerciais são do dono. Os números do
   documento (3/5/10 por dia, 45 s, 30/25/20…) são só exemplos dele.

## 0.1 Decisões do dono já tomadas (2026-10-12) — valem sobre qualquer recomendação deste texto
| Assunto | Decisão |
|---|---|
| Quem paga o match | Cada match é cobrado do **crédito diário** de cada aluno, **de ambos** os participantes |
| Números de pacote/cota | **A definir** (virão do método do dono). O documento de engenharia só dá exemplos |
| Compra real | **Parada** (Stripe parada desde 2026-10-10); tela só informativa |
| Radar | **Para todos, sem bloqueio de pessoas** (adendo D8). *Conflita com `match_blocks` do documento: ver §1 linha 3 e §8 pergunta 8* |
| Chat | Mensagens **se apagam a cada 24 h**; **denúncia** vai à equipe; a equipe lê as conversas denunciadas. *Conflita com `study_match_messages` permanentes do documento completo (§12.4)* |
| Conversa entre os dois | **Fora do app, sem link** (pacote D3) |
| Praticar | Estação com **baralho** ("vamos experimentar"); sozinho tem IA (narração escrita agora, voz ao vivo depois) |
| Preço e tetos de IA | **Depois do app pronto**, antes de liberar aos alunos (tetos desligados hoje) |

## 1. Tabela principal: o documento x o que existe x o que falta
Legenda do estado: **FEITO** (construído no ramo `treino-dupla`, não publicado), **PARCIAL**, **PLANEJADO** (está num plano, não
construído), **FALTA**, **FORA** (decisão sua), **NÃO CONFIRMADO**.
Arquivos citados são do ramo `treino-dupla` (`supabase/migrations/20261003009750…9770*.sql`, `src/novo/app/dupla/*`) salvo indicação.

| # | Item do documento | O que o documento propõe | O que já existe | Estado | O que falta / observação |
|---|---|---|---|---|---|
| 1 | Discovery / curtir e passar | Perfis, `match_swipes`, "Stazia Discovery" | `study_profiles`, `study_swipes` (chave `from_user,to_user`; escolha vale 7 dias), `app_dupla_deck`, `app_dupla_swipe` ("Pular" / "Estudar junto"), telas `PracticeScreen.jsx`, `MatchModal.jsx` (9750, 9770, Tarefa 13) | FEITO | Pular não gasta nada (já é assim). Nosso "curtir" se chama "Estudar junto" |
| 2 | Conexões recíprocas | `match_connections` com o par normalizado (menor UUID primeiro), único | `study_matches (user_a, user_b, station_id, room_id)`, leitura só dos dois (9750) | PARCIAL | **Não há unicidade do par**: o mesmo par pode ganhar vários `study_matches` (depois de 7 dias, ou por convite direto). Afeta chat ("um par = uma conversa") e a regra "retomar não cobra" (§3, §9) |
| 3 | Bloqueios | `match_blocks`; filtro "sem bloqueios entre si"; teste "bloquear parceiro impede novos convites" | Nada. O adendo propôs `study_blocks`; **você respondeu "radar para todos, sem bloqueio"**. No chat você aprovou bloqueio/denúncia | FORA / CONFLITO | Falta uma frase sua: o bloqueio vale **só no chat** ou também no radar, baralho e convite? (§8, 8) |
| 4 | Match Now / fila | `match_queue`, `match_offers`, `match_offer_members`, reserva com `FOR UPDATE SKIP LOCKED`, "Buscar Dupla" | Nada. A busca automática ("Procurando um parceiro…") ficou **fora** em 09/10; o pacote tem só o visual (`Matching.jsx`). Substituto previsto: **radar + convite direto** (adendo R1, pacote Etapa V) | FALTA / PLANEJADO (substituto) | Só se você quiser (§8, 10). Trava com `SKIP LOCKED` já existe como padrão no repositório (`ch_worker_claim` da fila de trabalhos, `…1400_content_hub.sql:1264`) |
| 5 | Convite / oferta | Oferta com prazo (exemplo 45 s), aceitar/expirar libera a fila | `study_invites` (60 s, `pending/accepted/declined/canceled`, gatilho `guard_study_invite`, Realtime), `app_dupla_invites`, `app_dupla_answer_invite`, fechamento preguiçoso `dupla_sweep` (9760, 9770) | FEITO | Convite **direto** (sem swipe): PLANEJADO (pacote V1 e adendo R1, **descritos de formas diferentes**, §9) |
| 6 | Agenda | `match_availability`, "Match Agenda", reservar horários | Só disponibilidade grossa no perfil (`days`, `shifts`) usada na compatibilidade. **"Agendar sessão" foi removido por você** (pacote R13) | FORA | Precisa de desenho novo e decisão (§6) |
| 7 | Estados da máquina | `searching, reserved, invited, accepted, ready, in_session, completed, cancelled, expired, abandoned` | `checklist_rooms.phase` (`roles, connecting, setup, running, review, result, closed`) + `closed_reason` (`saiu, convite_recusado, convite_expirado, sem_sinal`) + `study_invites.status` | PARCIAL | Tradução na tabela 1.1. Falta distinguir **"abandonada depois de iniciar"** (hoje dá para saber por `started_at` não nulo) |
| 8 | Motor de compatibilidade | Filtros + pesos 30/25/20/10/10/5 | `dupla_compat` e `dupla_assign` (9770): papel 40 (eliminatório se o mesmo papel), áreas 25, disponibilidade 20, ritmo 10, prova 5; nota 40–99 | FEITO | Comparação na tabela 1.2. Faltam o filtro "crédito suficiente" (§3) e "bloqueio" (linha 3) |
| 9 | Presença x disponibilidade | "Estar conectado ≠ aceitar treino"; Presence + estado próprio no servidor | `app_dupla_heartbeat` grava `status` e `last_seen_at`; baralho exige sinal < 2 min, `radar_visible`, `status <> 'fora'`; canal privado `dupla:online` (9750 políticas, Tarefa 12) | FEITO | O servidor decide elegibilidade pelo banco, não pela Presença (bate com o teste "online artificial") |
| 10 | Sessão de treino | `training_sessions`, `training_participants`, `training_feedback` | `checklist_rooms` (papéis, estação, relógio, impressos liberados), `checklist_room_marks`, `checklist_study_sessions` (nota e feedback por rodada, único `(room_id, round)`) (9750) | FEITO (dados) / PLANEJADO (sala ao vivo) | Ações da sala (iniciar, pausar, finalizar) são as Tarefas 14–17 do plano de 11/10 |
| 11 | "Nunca duas ofertas/sessões ativas" **garantido no banco** | Garantia por constraint/transação | `app_dupla_swipe` trava **o par** (`pg_advisory_xact_lock('dupla-par:…')`) e confere "sem sala aberta", mas **nenhuma trava ou índice impede** que a mesma pessoa feche dois matches com pessoas diferentes ao mesmo tempo | FALTA (risco) | Deduzido da leitura do código (9770:256-345), **não reproduzido** (§9, §10). Correção na Tarefa M2c |
| 12 | Cotas diárias por plano | `match_plan_limits` (Gratuito 3, Essencial 5, Premium 10, Ilimitado) | Nada para match. O módulo abre por plano em `app_settings.treino_dupla` (`aberto`, `planos`; `dupla_allowed`, 9750). Tutor tem limites em `tutor_config`; benefício Elite em `plan_benefits` (9731, **não publicada**, ramo `leva3`) | PLANEJADO (Etapa Q, 9950, desligada) | **Substituir** pela fundação do §4. Nossos planos são `trial / pro / elite` (+ equipe com acesso total), não os nomes do documento |
| 13 | Renovação à 00h de Brasília, sem cron | Dia calculado no banco | Já é o padrão: `ai_usage.day`, `ai_usage_ledger.day` e `tutor_entitlement` usam `(now() at time zone 'America/Sao_Paulo')::date`; `matches_today` do baralho idem | FEITO (padrão) | Reusar a mesma conta |
| 14 | Carteira de bônus e comprados | `match_wallets` (saldo sob trava) | Nada para match | FALTA | §4 |
| 15 | Livro de movimentos | `match_credit_ledger` auditável | Padrão pronto: `ai_usage_ledger` (só acrescenta, reserva +1 / devolução −1, `…3500_tutor_v2.sql:83-129`) mas **é registro de custo de IA**, não de créditos | PARCIAL (padrão) | §4 |
| 16 | Consumo atômico dos dois + `UNIQUE (session_id, user_id)` | Trava em ordem fixa de UUID, debita 1 de cada, dois lançamentos, vira `in_session` | Nada. Padrões de trava existem (`'tutor:'||uid`, `'dupla-par:'`) | FALTA | Tarefa M2a. O "início" do documento é o nosso `app_dupla_start` (ainda não construído, Tarefa 14) |
| 17 | Regras de estorno, upgrade, downgrade | Upgrade vale na hora; downgrade na próxima renovação; falha técnica = estorno | Nada | FALTA | §4.4. Decisões pequenas na pergunta 3 |
| 18 | Stripe: pacotes, pedidos, webhook | `match_credit_packages`, `match_orders`, `stripe_processed_events` | Stripe **parada**. Existe `billing_events` (`…0500`, só serviço, id do evento único) e as rotas `/api/billing` e webhooks do app antigo estão **desligadas** (`server.ts:89`) | FORA | Deixar o livro pronto (§4.6); plano próprio quando a Stripe voltar |
| 19 | Painel administrativo | Cotas por plano, pacotes, convites, fila, campanhas; auditoria | `src/novo/app/admin/AdminDupla.jsx` (chave aberto + planos); "Uso do mês" planejado; `admin_log` e `assert_admin` existem (`…1300_admin.sql`) | PARCIAL | Tarefas M4. "Campanhas de bônus": não pedido, fora |
| 20 | Segurança (RLS, `SECURITY DEFINER`, `search_path`) | Usuário nunca grava cota/plano/saldo | Padrão de todas as `app_dupla_*`: `security definer set search_path = ''`, `revoke … from public, anon`, tabelas sem escrita direta | FEITO (padrão) | Repetir nas funções novas |
| 21 | Sala: papéis, cronômetro, checklist, avaliação | `TrainingRoom`, Training Engine | Componentes e dados das Etapas 1–4; sala ao vivo nas Etapas 5–7 do plano de 11/10; cronômetro do **servidor** | PLANEJADO | Nada a mudar |
| 22 | Conversar com o parceiro (não consome) | Mensagens privadas com controle no servidor | Etapa C do plano de 11/10 (migração 9930), com filtros no servidor | PLANEJADO | **Falta no plano C1**: apagar a cada 24 h e denúncia (suas decisões D6 vieram depois do plano) |
| 23 | Chamada por fora (Google Meet) | Fora do sistema; início registrado dentro | **Sem link no app** (pacote D3); a confirmação dos dois é `ready_ids` + "Iniciar estação" | FEITO (coincide) | — |
| 24 | Sem IA no pareamento | Filtros e fila, sem IA | Igual (`dupla_compat` é regra em SQL) | FEITO | — |
| 25 | Sem dados de pacientes reais | Só finalidade educacional | Igual (estações do Banco de checklists; sem prontuário) | FEITO | — |

### 1.1 Estados: o documento x o que temos
| Documento | Para nós | Onde se vê |
|---|---|---|
| `searching` | (fila não existe) | — |
| `reserved` | (fila não existe) | — |
| `invited` | convite `pending` e sala em `roles` | `study_invites.status`, `checklist_rooms.phase = 'roles'` |
| `accepted` | convite `accepted` | idem |
| `ready` | sala em `setup` com os dois em `ready_ids` | `checklist_rooms.ready_ids` |
| `in_session` (**aqui o crédito sai**) | sala em `running` (`started_at` preenchido) | `app_dupla_start` (Tarefa 14, a fazer) |
| `completed` | `review` → `result` | `checklist_study_sessions` |
| `cancelled` | `closed` com `saiu` ou `convite_recusado` | `closed_reason` |
| `expired` | `closed` com `convite_expirado` ou `sem_sinal` | `dupla_sweep` |
| `abandoned` | `closed` **com** `started_at` preenchido | derivado; o crédito **não** volta |

### 1.2 Compatibilidade: pesos do documento x os nossos
| Fator | Documento | Nosso `dupla_compat` (9770) | Observação |
|---|---|---|---|
| Papéis complementares | 25 % (e filtro obrigatório) | **40** e **eliminatório** quando os dois querem o mesmo papel | o nosso pesa mais e é mais rígido |
| Disponibilidade em comum | 30 % | 20 (turnos 0,6 + dias 0,4) | só dias da semana e turnos; sem horário |
| Temas de estudo | 20 % | 25 (áreas CM, CR, GO, PED, MFC em comum) | "áreas" ≠ "temas" |
| Nível de preparação | 10 % | **não existe campo** (o mais próximo é a prova, 5) | criar campo = decisão sua |
| Idioma | 10 % | **não existe campo** | criar campo = decisão sua |
| Confiabilidade | 5 % | **não existe**; só faria sentido com histórico de sessões abandonadas | só depois de uso real |
| Ritmo | — | 10 (livre, cronometrado, simulação) | não está no documento |
| Espera na fila | flexibiliza depois de um tempo | — | só existe se houver fila |
Recomendação: **manter os nossos pesos** e não criar "nível" nem "idioma" agora. Os pesos finais são seus (§8, 11).

### 1.3 Testes obrigatórios do documento (§11 dele) x o que já temos
| Teste do documento | Situação |
|---|---|
| Mexer no plano pelo DevTools: servidor ignora | Padrão existe (acesso decidido por `dupla_allowed` no banco). Teste novo para créditos: M5 |
| 20 pedidos simultâneos não passam da cota | **Atenção:** o nosso banco de teste (PGlite) roda **uma conexão só**; o teste de "dois ao mesmo tempo" que existe (`duplaMatchBanco.test.ts:430`) confere o **texto da função** (que usa a trava) e o resultado, mas **não prova a trava sob concorrência real**. Prova de verdade exige Postgres real com várias conexões: tarefa M5b (§10: não confirmei que haja um) |
| Repetir o webhook da Stripe | Stripe parada; o equivalente é "mesma chave de lançamento não debita duas vezes" (M1) |
| Recarregar durante a sessão não debita de novo | M2a |
| Usuário "online" artificial | Já coberto pelo desenho (o banco confere sinal, estado e acesso); M2b acrescenta o caso do crédito |
| Dois convites aceitos juntos → uma sessão | **Buraco** (linha 11); M2c |
| Ler conversa de terceiros | Etapa C1 do plano de 11/10 |
| Bloquear parceiro | Depende da pergunta 8 |
| Comprar e fechar o navegador | Stripe parada |
| Virar o dia: nova cota, bônus e comprados preservados | M1 (funções internas aceitam um "agora" de teste) |

## 2. Divergências de stack e como traduzir
| O documento diz | Nós usamos | Como traduzir |
|---|---|---|
| Next.js + páginas `/match`, `/discover`, `/now`, `/agenda`, `/wallet`, `/session/[id]` | Vite/React em `/novo` (`src/novo/app/dupla/*`), rotas internas (`go("dupla")`, `/novo/dupla/sala/:id`), componentes e cores do **DS do app** (`src/novo/ds`) | Nada de Next, nada de Tailwind. Telas novas: cota (aviso e cabeçalho), extrato (futuro) no Praticar; Agenda só se você pedir |
| Rotas `GET/POST /api/match/*` | A regra fica no banco como funções `app_*` (`security definer`), chamadas direto pelo navegador via `supabaseBackend.ts`. O Express (`server.ts`, Vercel `api/index.js`, Cloud Run) entra só quando precisa de segredo, IA ou arquivo assinado | `discover` → `app_dupla_deck`; `swipe` → `app_dupla_swipe`; `queue` → (se um dia) `app_dupla_queue_*`; `offer` → `app_dupla_invite` / `app_dupla_answer_invite`; `session` → `app_dupla_start`; `balance` → `app_credit_state` (novo) |
| `lib/match/{matching-engine, compatibility, presence, quotas, billing, permissions}.ts` | Regra em **SQL** (`dupla_compat`, `dupla_assign`, futuro `credit_*`) + ajudantes de tela em `src/novo/app/dupla/*.js` | Não criar serviço TypeScript paralelo para regra que o banco já decide |
| Tabelas `match_*` | Reaproveitar `study_*` e `checklist_*`; **criar só** o que falta: `credit_wallets`, `credit_daily`, `credit_ledger` | Nada de `match_profiles`, `match_connections`, `match_queue` agora |
| **Supabase Cron** para expirar ofertas e filas | **Não usamos `pg_cron`** (nenhuma referência nas migrações). Usamos: (1) **fechamento preguiçoso** `dupla_sweep`, que fecha o que venceu quando alguém lê; (2) **Vercel Cron** (`vercel.json`: `/api/tutor/voice/sweep` a cada minuto e `/api/play/cron` por dia); (3) fila de trabalhos `ch_jobs` no Cloud Run | Créditos **não precisam de cron** (o dia é calculado no SQL). Para salas paradas e fila, vale `dupla_sweep`; uma rota de varredura na Vercel só se a fila existir |
| Broadcast privado para convites | `postgres_changes` (INSERT em `study_invites`) + Presença no canal privado `dupla:online`, com políticas em `realtime.messages` (9750) | Mantém: o Realtime só **avisa**; o estado está no banco; há consulta de reserva (5 s local, 30 s ao vivo) |
| Stripe Checkout + webhook | Parada; `billing_events` já existe para guardar eventos | §4.6 e §7 |
| Testes `match-concurrency.sql`, `match-credits.sql`, `match-rls.sql` | Vitest com PGlite e as migrações reais (`src/__tests__/dupla*.test.ts`, `helpers/duplaDb.ts`) | Arquivos novos: `duplaCreditosBanco`, `duplaCreditosAdmin`, etc. (plano) |
| Planos Gratuito / Essencial / Premium / Ilimitado | `trial` (7 dias), `pro`, `elite`, e **equipe** (administrador, editor, revisor médico) com acesso completo (`user_has_full_access`) | Não adotar os nomes. Limite por **plano nosso**, valores vazios |
| Google Meet externo | **Sem link no app** (decisão D3) | Confirmação dentro do app, conversa por fora |
| Idioma como fator | Sem campo | §1.2 |

## 3. A QUESTÃO CENTRAL: em que momento o crédito sai?

### 3.1 O que o documento diz e o que você disse
- **Documento (§2, §8, §14):** buscar, curtir, conversar, agendar e até o interesse recíproco **não** consomem. Consome **1 crédito por
  aluno quando os dois confirmam o início da sessão**, tudo numa transação: se um dos dois não tem saldo, **nenhum** é cobrado. Motivo
  dele: "evita vender um match que nunca encontra parceiro".
- **Você (2026-10-12):** "**cada match é cobrado** do crédito diário de **cada** aluno, **de ambos**". O pacote de 11/10 (`MATCH-CHAT-REGRAS.md`)
  é na mesma linha: "novos matches descontam um crédito", "pular não consome", "retomar uma dupla existente ou enviar mensagem não
  desconta" — e já avisa que "a transação real de aceite e as regras de consumo de ambos precisam ser especificadas".
- Há **duas perguntas misturadas** e é bom separá-las: **(A) quando** o crédito sai (no aceite do match ou no início confirmado) e
  **(B) o que é uma "unidade"** (um **match** novo, ou **cada sessão** que começa). O documento diz "sessão iniciada"; você diz "match".

### 3.2 Opção 1 — cobrar no match (no aceite do convite)
**Como seria:** os dois créditos saem juntos quando o convite de 60 s é aceito (os dois estão na tela). Se um não tiver, o match nem
se forma.

| Situação | O que acontece |
|---|---|
| Convite recusado ou vencido | Nada sai (ainda não aceitou) |
| Aceitou, mas **a sala nunca começa** (um não confirma prontidão, fica 15 min sem sinal, sai antes) | **Já foi cobrado.** É preciso criar regra de **devolução** (e decidir quando devolver) — é exatamente o caso que o documento quer evitar |
| Um dos dois não tem crédito quando o segundo "Estudar junto" chega | O match não se forma; o outro não pode ficar sabendo o motivo (privacidade) → mensagem neutra |
| Cai no meio da sessão | Já estava cobrado |
| Dia virando (23:59 aceita, 00:01 começa) | Paga do dia do aceite |
| Estorno | Muitos caminhos de devolução (recusa tardia, sala fechada, queda, sem sinal) |

Vantagens: é a leitura **literal** do que você disse; "Sua cota de matches acabou" aparece **antes** de formar o par (como no pacote);
impede formar pares em série sem custo. Desvantagens: **cobra por algo que pode não acontecer**; mais regras de devolução; mais risco de
reclamação ("paguei e a sala nem abriu").

### 3.3 Opção 2 — cobrar no início confirmado (o que o documento propõe)
**Como seria:** o crédito de **cada um dos dois** sai **no instante em que o avaliador aperta "Iniciar estação"** com os dois prontos
(é o nosso `app_dupla_start`, Tarefa 14). Numa transação só: trava a sala, trava os dois alunos em ordem fixa, confere os dois saldos,
debita 1 de cada, escreve dois lançamentos e põe a sala em `running`. Se qualquer um não tem saldo, **nada muda** e ninguém paga.

| Situação | O que acontece |
|---|---|
| Convite recusado ou vencido | Nada sai |
| Sala nunca começa | **Nada sai** (sem devolução a escrever) |
| Um dos dois sem crédito na hora de iniciar | Ninguém paga; os dois veem uma mensagem **neutra**; quem está sem crédito vê "sua cota de hoje acabou" |
| Clique duplo, recarregar, duas abas | Não debita de novo (chave única por match e aluno) |
| Cai no meio da sessão | **Crédito fica** (o documento: "sujeito a contestação"); estorno só manual, por falha técnica comprovada |
| Inverter papéis (rodada 2, mesma sala) | Não cobra de novo |
| Dia virando | Paga do dia do **início** (calculado uma vez, no horário do servidor) |
| Um não aparece | Quem estava lá não perdeu nada |

Vantagens: o aluno só paga por treino que **realmente começou**; quase nenhuma regra de devolução; um ponto único de cobrança
(`app_dupla_start`), fácil de testar. Desvantagens: a pessoa pode **formar pares, trocar mensagens e nunca iniciar** sem gastar crédito
(o valor "achar parceiro" fica de graça) e, se não houver freio, abusar de convites. Mitigações já decididas por você: chat que se apaga
em 24 h, sem link e sem contato externo; e a **pré-checagem** abaixo.

### 3.4 Recomendação: Opção 2 **com pré-checagem no match**
- **Crédito sai no início confirmado** (Opção 2).
- **Pré-checagem, sem debitar:** para **formar** um match ou enviar um convite, o servidor confere se **os dois têm pelo menos 1 crédito
  disponível agora**. Sem crédito, aparece "**Sua cota de matches acabou**" (texto do pacote) **antes** de formar o par. Assim a regra
  "sem cota = sem novo match" que o pacote pede continua valendo, e o débito real só acontece quando o treino começa.
- **Por quê:** é o que o documento faz, evita cobrar por sala que não abriu e deixa o desenho do estorno simples. Se você preferir a
  Opção 1, a mudança no plano é pequena: o débito sai de `app_dupla_start` e vai para `app_dupla_answer_invite` (aceitar), e
  entra a regra de devolução quando a sala fecha sem começar (Tarefa M2a vira M2a').
- **Alternativa que descartei:** "reserva" (separar o crédito no aceite e confirmar no início). Funciona, mas cria um estado a mais
  (reservado), prazo para soltar a reserva e mais casos de "dia virando". Só vale se você quiser as duas coisas ao mesmo tempo
  (garantir o crédito e só cobrar o que começou).

### 3.5 Segunda pergunta: a unidade (match ou sessão?) — **REVISTO no §12.1: o documento completo diz "sessão iniciada"**
- **Match** (como você disse e como o pacote registra): cobra **uma vez por par/match**, no primeiro início; **retomar o mesmo par não
  cobra de novo**, nem a rodada 2. Chave do lançamento: `match_id` + aluno.
- **Sessão iniciada** (como o documento diz): cada vez que uma sala começa a contar tempo cobra. Chave: `sala` + aluno.
- ~~Recomendo seguir a sua regra (match)~~ **Revisto:** o documento completo (§2 e §8.1) diz que a unidade contábil é **a sessão iniciada** e que "match
  extra" é só o nome na tela. Então: **cada sala que começa a contar tempo cobra 1 de cada um**; reabrir a **mesma** sala/sessão e recarregar a página não
  cobram; conversar e retomar a conversa não cobram. Consequência: dois colegas que treinam sempre juntos pagam a cada **nova** sessão (o que o
  documento quer).
- Convite direto (radar): como a unidade é a sessão, **não precisa criar `study_matches`** para cobrar (o documento também não cria conexão por
  oferta: conexão só nasce de curtida recíproca). Isso volta a favor do adendo (R1) e contra o pacote V1; a pergunta que sobra é se quem
  treinou por convite do radar pode conversar depois (§12.7, pergunta 8).

### 3.6 Regras que valem nas duas opções (propostas, o dono pode mudar)
1. Equipe (administrador, editor, revisor médico) **não gasta** crédito; o colega paga normalmente.
2. Quem está sem crédito: o outro **não** é informado do motivo (mensagem neutra; ninguém vê o saldo do outro).
3. Abandono **depois** de iniciar: o crédito fica; estorno só por falha técnica comprovada, pela Administração, com motivo (fica no extrato).
4. Estorno vai para o **mesmo tipo de saldo** de onde saiu (diário ou extra).
5. O limite do dia é o do plano **vivo**: upgrade vale na hora, descontando o uso do dia; downgrade abaixo do que já foi usado deixa o disponível em **zero**, nunca negativo
   (documento completo §8.9; **REVISTO**: some o "limit_open" que eu tinha proposto, §4.2). A vigência do plano pago já é respeitada por `subscription_is_paid`.
6. Cota **desligada** (chave): o módulo funciona como hoje, sem limite e sem gasto (comportamento seguro enquanto você não define os números).
7. Com a cota **ligada** e um plano **sem número preenchido**: esse plano fica com **zero** (falha fechada, como no pacote).

## 4. Carteira e livro de créditos: um só, para match e para IA do aluno

### 4.1 O que já existe e por que não serve sozinho
- **`ai_usage`** (resumo por aluno e dia) e **`ai_usage_ledger`** (livro só-acrescenta, com reserva +1 e devolução −1, `…3500_tutor_v2.sql`)
  são **registro de custo e uso de IA** (tokens, dólares, `feature` fixa em lista). O Tutor decide limites com `tutor_config` e
  `tutor_entitlement`, **só por dia** (texto e voz); não há saldo comprável, nem janela semanal/mensal.
- A **Elite** ganhou um benefício em `plan_benefits` (9731, **não publicada**): minutos de voz e "correção de estação com devolutiva".
- O adendo do sozinho (Tarefa A1) pensou a cota da avaliação por IA **dentro** do `ai_usage_ledger` (`feature = 'solo_eval'`) com
  limites em `app_settings`. O pacote de 11/10 (Etapa Q) pensou a cota de match numa tabela própria (`study_quota_ledger`).
  **São dois contadores separados para a mesma ideia** — é o "sistema paralelo" a evitar.
- Você já tinha decidido (2026-10-08) que o uso de IA seria em **créditos com equivalência na tela** (1 mensagem = 1, 1 min de voz = 4),
  com limite por **dia, semana e mês**, saldo avulso depois do limite do plano, e **números ainda abertos**. O desenho abaixo serve a isso.

### 4.2 Desenho proposto (migrações 9960 a 9962; nomes em português na tela, em inglês no banco como o resto)
Três tabelas e poucas funções; **serve a qualquer "moeda"** (`pool`): hoje `match` e `ia`.

| Peça | Para quê | Observações |
|---|---|---|
| `credit_wallets (user_id, pool, purchased_balance, bonus_balance, updated_at)` chave `(user_id, pool)` | Saldo de **comprados** (vazio até a Stripe voltar) e de **bônus** (concessão manual, campanhas). É a linha que se trava | `check (… >= 0)`: nunca negativo. Sem acesso direto. **REVISTO:** antes eu tinha um saldo só ("extras"); o documento completo separa os dois baldes e define a ordem do débito (§12.1) |
| `credit_daily (user_id, pool, day, used)` chave `(user_id, pool, day)` | Uso do dia. É o `match_daily_usage` do documento | Dia = `America/Sao_Paulo`. Sem cron: o dia novo é uma linha nova. **REVISTO:** sem `limit_open`; o limite é o do plano vivo (documento §8.9) |
| `study_room_charges (room_id, user_id, bucket, usage_date, ledger_id)` chave `(room_id, user_id)` | Uma cobrança por sala e aluno (o `session_charges` do documento) | **NOVO.** `bucket` inclui `unlimited` (equipe), sem lançamento no livro. A chave primária é a garantia no banco contra débito repetido, além da `idem_key` |
| `credit_ledger (id, user_id, pool, day, kind, bucket, amount, ref_type, ref_id, idem_key unique, reverses_id, reason, created_by, created_at)` | **Livro só-acrescenta**, auditável. `kind`: `consume, refund, grant, purchase, revoke, adjust`; `bucket`: `daily`, `bonus` ou `purchased` (**REVISTO:** antes `extra`) | `idem_key` único (ex.: `match:<match_id>:<user>`, `solo:<run>:<n>`) = a regra `UNIQUE (session_id, user_id)` do documento, generalizada. Gatilho que recusa `update` e `delete` (igual `ai_usage_ledger_guard`) |
| `app_settings` chave **`creditos`**: `{ "ativa": false, "match": { "trial": null, "pro": null, "elite": null }, "ia": { ...dia/semana/mes por plano..., "pesos": {...} } }` | Limites por plano. **Tudo vazio e desligado** | A checagem de chaves de `app_settings` precisa da **união** de todas as chaves já usadas + `treino_dupla` + `creditos` (armadilha conhecida, ver plano de 11/10) |

Invariante testada (e conferida por uma função de conciliação, §12.2 linha 22): `credit_daily.used` = soma dos `consume` do dia no balde `daily` menos os
`refund` do mesmo balde; cada saldo (`bonus`, `purchased`) = soma de `grant/purchase` menos `consume/revoke` do seu balde.

### 4.3 Funções (todas `security definer set search_path = ''`)
| Função | Quem chama | O que faz |
|---|---|---|
| `credit_day(p_now)` / `credit_limit(uid, pool, day)` | só interno | Dia de São Paulo; limite do plano **vivo** do aluno lendo `subscriptions` e `creditos`. Equipe = sem limite |
| `credit_state(uid, pool, p_now)` | só interno | `{ ativa, limite_dia, usados_hoje, bonus, comprados, disponivel }` |
| `credit_consume(uid, pool, n, ref_type, ref_id, idem_key, p_now)` | só interno | Trava `'credito:'||pool||':'||uid`; se a `idem_key` já existe, **devolve o que já fez e não debita**; gasta primeiro o diário, depois o **bônus**, depois o **comprado** (ordem do documento completo §8.4; o dono pode inverter bônus e comprado); recusa se não há saldo |
| `credit_consume_pair(pool, a, b, …)` | só interno (`app_dupla_start`) | Trava os **dois em ordem crescente de UUID**, confere os dois, debita os dois, escreve os dois lançamentos; qualquer falha desfaz **tudo** (cobrança de nenhum) |
| `credit_refund(ledger_id, reason)` | só interno e administrador | Lança `refund` no **mesmo balde** do consumo original; uma vez só |
| `credit_grant(uid, pool, n, reason)` | só administrador | Concessão manual (alternativa à compra enquanto a Stripe está parada); entra no `admin_log` |
| `app_credit_state(p_pool)` | o aluno (autenticado) | O que a tela mostra: "Cota diária disponível", bônus e comprados. **Nunca** mostra o saldo do outro |
| `credit_assert_available(uid, pool)` | só interno | A **pré-checagem** do §3.4 (não debita) |
Os testes passam um "agora" (`p_now`) para provar a virada do dia sem relógio falso no banco.

### 4.4 Regras do documento, traduzidas
| Regra | Como fica |
|---|---|
| Novo dia = nova cota, extras preservados | Linha nova em `credit_daily`; `credit_wallets` não muda |
| Upgrade vale na hora, descontando o uso do dia | Limite do plano vivo menos `used` |
| Downgrade abaixo do que já foi usado | Disponível = zero (nunca negativo); a vigência do plano é a do sistema principal (`subscription_is_paid`) |
| Convite expirado / falha antes do início = sem débito | Nunca houve `consume` |
| Dupla abandona sessão iniciada = débito permanece | Sem `refund` automático |
| Falha técnica comprovada = estorno ao mesmo tipo de saldo | `credit_refund` manual, pela Administração. **Se o consumo foi diário e de um dia que já passou:** não cria cota nova hoje; o estorno é registrado na data original e, se o administrador quiser compensar, entra como **bônus** separado e auditado (documento §8.14 e §26) |
| Pagamento estornado = revogação auditável | `revoke` (futuro, quando houver compra) |
| Não estornar toda sessão curta automaticamente | Nenhuma regra automática |

### 4.5 Como o crédito de IA do aluno usa o mesmo livro (sem sistema paralelo)
- **Treino sozinho com avaliação por IA (adendo, Tarefa A1):** em vez de contar em `ai_usage_ledger.feature = 'solo_eval'` com limites
  próprios, `ch_worker_solo_prepare` chama `credit_consume(uid, 'ia', n, 'solo_run', run, 'solo:'||run||':'||tentativa)` (a **reserva**) e
  `ch_worker_solo_fail` faz o `credit_refund` (a **devolução**). O `ai_usage_ledger` continua **só para o custo** (tokens e dólares), como
  hoje. Os limites de dia/semana/mês saem de `creditos.ia` — **vazio = bloqueada** (falha fechada, igual ao adendo).
- **Tutor:** **não mexer agora.** Ele continua com `tutor_config`/`ai_usage`. Quando você definir os créditos de IA e a equivalência
  (1 mensagem = 1, 1 min de voz = 4, já decididas), o Tutor passa a debitar do mesmo livro num plano próprio. Dá para fazer sem refazer o livro.
- **Peso da avaliação do sozinho em créditos de IA:** **a definir** (não inventei). Sem valor, a IA do sozinho fica bloqueada (já é o padrão do adendo).
- **Janelas:** `credit_daily` permite somar por semana e mês no mesmo fuso; só o `match` usa a janela diária.
- O benefício Elite "correção de estação com devolutiva" (9731) continua sendo a **porta** (quem pode usar); o livro é o **medidor** (quanto).

### 4.6 Preparado para a Stripe, sem Stripe
`kind = 'purchase'` e `idem_key = 'stripe:'||<pagamento>` já cabem no livro. **Não** crio pedido, pacote, rota nem webhook. Quando a
Stripe voltar, o plano próprio acrescenta `credit_packages`/`credit_orders` e usa os requisitos do documento (chave financeira pelo
**pagamento/pedido**, não só pelo id do evento; webhook com assinatura; crédito só depois da confirmação). A tabela `billing_events`
(`…0500`) já guarda eventos do provedor. Enquanto isso: **tela informativa** "Os pacotes ainda não estão à venda." (texto do plano de 11/10)
e, se você quiser, **concessão manual** pela Administração (pergunta 6).

### 4.7 Conta, exportação e exclusão
`credit_ledger` entra na **exportação de dados** (`app_export_my_data`) e, como o registro de IA, some com a conta (`on delete cascade`).
Para um livro de **compras** isso pode não servir (obrigação fiscal): decisão para quando a compra existir (§8, 12). Para o gasto de
cota, apagar com a conta é o padrão já adotado.

## 5. O que o documento NÃO cobre e o plano de 11/10 já tem
| Assunto | Onde está |
|---|---|
| Sala ao vivo: papéis, escolha da estação **só pelo avaliador**, conexão, prontidão, "Abrir sala do avaliador", início | Plano de 11/10, Etapa 5 (Tarefas 14 a 17) |
| Cronômetro e pausa **do servidor** (nunca do navegador); apito; ajuste de tempo | Tarefas 15 e 17a |
| Impressos: liberar/ocultar, `display_number` x `source_number`, zoom, ocultar imagem; relato do caso visível desde o início | Etapa P e Tarefa 17b |
| **Tema reservado** ao avaliador (candidato nunca recebe nome, tópico, resumo) | Etapa P (migração 9900) e Tarefa P6 |
| PEP: marcação ao vivo, soma, conferência, finalização, revisão da nota, inverter papéis, "Uso do mês" | Tarefas 17b, 17c e 18 |
| Folha do candidato, sala do avaliador com duas colunas e rolagem própria, rodapé do avaliador | Tarefas P3, P4b, 17a |
| Chat do match com filtros no servidor | Etapa C (9930) |
| Convite direto e rápido | Etapa V (9940) + radar do adendo |
| Praticar sozinho, avaliação por IA, radar | Adendo (ramo `treino-dupla`) |
| Celular, acessibilidade, ponta a ponta | Etapa 7 |
| Aprovação médica das estações, estações só Pro, Banco de checklists | Já no Banco (migração 0400, 8000) |
| Exportar/excluir dados da conta | `app_export_my_data` nas migrações do Treino |
O documento é sobre **achar e cobrar**; o plano de 11/10 é sobre **treinar**. Os dois se encontram em um único ponto: `app_dupla_start`.

## 6. Agenda (sessões futuras): precisa de desenho novo
**Situação:** o documento só cita "Match Agenda" e `match_availability`; não descreve tabelas, estados, lembrete nem tela. O pacote de
design **não tem** Agenda; o "Agendar sessão" do protótipo antigo foi **removido por você** (pacote R13). Sem decisão sua, **não entra**.

**O que a Agenda exigiria (e hoje não existe):**
- Uma coisa nova: a **sessão marcada** (quem convida, quem é convidado, estação opcional, data e hora, estado: proposta, aceita,
  recusada, cancelada, realizada, faltou).
- **Disponibilidade com horário** (hoje só dias e turnos no perfil).
- **Lembrete**: como avisar na hora marcada? Você decidiu que o chat se apaga em 24 h e que a conversa é fora do app. **Não confirmei**
  se o app tem aviso por e-mail ou notificação do navegador para isso (§10).
- **Janela da sala**: a sala abre quanto tempo antes? E se um não vier?
- **Crédito**: pelo documento, marcar não gasta; o crédito sai no início (igual §3). Com a Opção 1, marcar também não gastaria.
- Telas novas: "Agendar", "Minhas sessões", lembrete/aviso, "Entrar na sala" no horário.

**O que pedir ao dono (para eu desenhar):**
1. Quer a Agenda de volta? (Sim / não / depois do radar.)
2. Como funciona para você: **um convida o outro para um dia e hora** (com ou sem estação) e o outro aceita? Ou **publicar horários livres**
   para qualquer colega marcar?
3. Como a pessoa é lembrada? (Aviso dentro do app quando ela abrir? E-mail? Nada?)
4. Quanto tempo antes a sala abre e o que acontece se um não vier?
5. Pode marcar sem ter crédito no dia? (Recomendo: sim, conferir só no início.)
6. Quer uma **prévia clicável** (como a do Tutor Nexus) antes de eu construir? Recomendo que sim.

## 7. Ordem de construção, dependências, riscos e segurança

### 7.1 Ordem recomendada
| Passo | O que | Depende de | Pode vir depois da Etapa 5? |
|---|---|---|---|
| 0 | Responder as decisões do §8 (principalmente 1 e 2) | — | — |
| 1 | Etapa P e Etapas 5 a 7 do plano de 11/10 (módulo de **dupla** completo) | — | — |
| 2 | **M1** Fundação do crédito (9960–9962), **desligada** | nada de tela | **Sim**, mas o ideal é **antes da Tarefa 14**, para `app_dupla_start` já nascer chamando o crédito (se vier depois, M2a refaz `app_dupla_start`) |
| 3 | **M2** Débito no início + pré-checagem + uma sala por pessoa + avisos | M1 e Tarefa 14 | **Sim** |
| 4 | Etapa C (chat) e Etapa V (convite direto/radar) | Etapa 7 | Sim; M2b e M2c se encaixam na V |
| 5 | **M3** Crédito de IA no mesmo livro | M1 e Etapa 6B do adendo (avaliação por IA) | Sim |
| 6 | **M4** Administração (limites por plano, concessão, estorno, extrato) | M1 | Sim |
| 7 | **M5** Testes obrigatórios e Postgres real | M2 | Sim |
| 8 | Ligar a cota e preencher números | **você** | — |
| 9 | Fila "Buscar agora" (Etapa N) | V e M2, e a sua decisão | Só se você quiser |
| 10 | Agenda (Etapa G) | decisão e desenho | Só se você quiser |
| 11 | Compra (Stripe) | você ligar a Stripe | Plano próprio |
Etapa Q do plano de 11/10 (9950) **sai** e é substituída por M1 a M4. A Etapa A1 do adendo ganha o ajuste da §4.5.

### 7.2 Riscos
| Risco | Como se trata |
|---|---|
| **Cobrança dupla** (clique duplo, recarregar, duas abas, `app_dupla_start` chamado de novo, rodada 2, retomar o par) | `idem_key` única no livro; o consumo devolve o lançamento existente; teste de cada caso |
| **Corrida pelo último crédito** (dois aparelhos) | Trava por aluno e por moeda; no par, **ordem crescente de UUID**; ordem de travas fixa: **sala → carteira A → carteira B**; nada pega carteira e depois sala. Prova real só com Postgres real (M5b) |
| **Dia virando** | O dia é calculado **uma vez** por transação com o horário do servidor (São Paulo); pré-checagem e débito podem cair em dias diferentes e cada um vale no seu dia; estorno vai para o dia original |
| **Saldo negativo** | `check (purchased_balance >= 0 and bonus_balance >= 0)` e função que recusa antes |
| **Uma pessoa em duas salas** | Trava por pessoa nas funções que criam sala (swipe, convite direto, aceite) e conferência depois da trava (M2c) |
| **Vazamento do saldo do outro** | Mensagens neutras; `app_credit_state` só devolve o do próprio aluno |
| **Cota ligada sem números** | `ativa` nasce falsa; com `ativa` verdadeira, plano sem número = zero |
| **Tabela de teste PGlite não prova trava** | Tarefa M5b (Postgres real) e conferência do texto das funções, como o teste que já existe |
| **Dados do aluno em extrato** | Só o próprio lê; administrador lê com `assert_admin` e fica no `admin_log` |

### 7.3 Segurança (regras para toda função nova)
- `security definer set search_path = ''`; `revoke execute … from public, anon`; internas (`credit_*`) também `from authenticated`.
- Tabelas com RLS ligada; `credit_ledger` e `credit_daily` só o dono lê; **nenhuma** política de escrita; `credit_wallets` sem acesso direto.
- Livro só-acrescenta (gatilho recusa `update` e `delete`).
- O navegador **nunca** manda plano, saldo, limite ou dia; tudo vem do banco.
- Texto de erro em português; nunca revelar o saldo ou o motivo do outro.
- Migração commitada não muda; correção vai na seguinte; cada uma pode ser colada duas vezes.
- Nenhum número comercial no código; tudo em `app_settings`, começando desligado e vazio.

## 8. Decisões para o dono (sim / não / valor) — **substituída pela lista atualizada do §12.7** (esta fica como histórico)
| # | Pergunta | Opções | Minha recomendação |
|---|---|---|---|
| 1 | **Quando o crédito sai?** | (a) no aceite do match; (b) no início confirmado (os dois prontos e o avaliador inicia) | **(b)**, com pré-checagem ("Sua cota de matches acabou" antes de formar o par). Se escolher (a), eu escrevo as regras de devolução (§3.2) |
| 2 | **O que conta como uma unidade?** | (a) um **match** (retomar e rodada 2 não cobram); (b) cada **sessão iniciada** | **(a)**, como você disse e o pacote registra |
| 3 | **Regras pequenas** — aceita todas? (i) equipe não gasta crédito; (ii) quem está sem crédito não é revelado ao colega; (iii) abandono depois de iniciar mantém o crédito; (iv) estorno só manual por falha técnica; (v) estorno volta ao mesmo tipo de saldo | sim / não (diga qual muda) | sim a todas (§3.6) |
| 4 | **Cota ligada quando?** E **quantos créditos por dia** para `trial`, `pro`, `elite`? | valor seu | Nasce **desligada**; plano sem número fica zero quando ligar |
| 5 | **Extras**: expiram? acumulam? | valor seu | não precisa agora (compra parada) |
| 6 | **Concessão manual** de créditos pela Administração enquanto a Stripe está parada? | sim / não | sim, com motivo e no registro |
| 7 | **IA do aluno no mesmo livro** (treino sozinho; Tutor depois)? Pesos (1 msg = 1, 1 min de voz = 4 já decididos) e **peso da avaliação do sozinho**; janelas dia/semana/mês | sim/não; valores seus | **sim**; peso e janelas depois do app pronto (campo vazio = IA bloqueada) |
| 8 | **Bloqueio de pessoas**: vale só no chat (denúncia e bloqueio que você aprovou) ou também no radar, baralho e convite? | só chat / também radar | **só chat** por enquanto (o radar fica "para todos", como você decidiu) |
| 9 | **Convite direto cria um match** (conta crédito e abre o chat)? | sim / não | **sim** |
| 10 | **Fila "Buscar agora"** (Match Now) | agora / depois do radar / não | **depois do radar**; no começo haverá poucos alunos online ao mesmo tempo (meta da memória: até ~100 pagantes no 1º ano) e a fila ficaria vazia |
| 11 | **Pesos da compatibilidade**: manter os nossos (papel 40, áreas 25, disponibilidade 20, ritmo 10, prova 5) ou adotar os do documento? Criar campos "nível" e "idioma"? | manter / adotar | **manter**, sem campos novos |
| 12 | **Conta apagada**: apagar o extrato junto (como o registro de IA) ou guardar sem identificação? | apagar / guardar | **apagar** para cota; revisar quando houver compra (jurídico/contador) |
| 13 | **Agenda** | sim / não / depois | **depois**, e só com as respostas do §6 e uma prévia |
Além disso: textos novos do plano (§ "Textos novos") para você aprovar quando a tela existir.

## 9. Achados nos planos que já existem (para corrigir antes de construir)
1. **Migrações com o mesmo número.** O plano de 11/10 reserva 9900 a 9959 (9900 pacote, 9910 sala, 9920 resultado, 9930 chat, 9940
   convite direto, 9950 cota). O **adendo do sozinho** usa 9900, 9901, 9910, 9920 e 9930 para outras coisas. Quando os dois ramos se
   juntarem, vão colidir. Este plano usa **9960 em diante** e recomenda **renumerar o adendo** (ex.: 9800 a 9899 se livres; hoje o maior
   em outros ramos é 9820, então conferir).
2. **Convite direto descrito duas vezes.** Pacote V1: cria `study_matches` + sala + convite; adendo R1: **sem** `study_matches`, com `kind = 'direto'`,
   com `study_blocks` e limites de convite. As suas respostas (radar **sem bloqueio**, limites de convite **a definir**) mudam o R1.
3. **Dois contadores de cota** (Etapa Q do pacote e `solo_eval` do adendo): trocar por M1/M3 (§4).
4. **Pares repetidos** em `study_matches` (linha 2): decidir antes do chat e da cobrança por match.
5. **Uma pessoa em duas salas** (linha 11): hoje só a conferência dentro da função, sem trava por pessoa.
6. **Chat (C1)** foi escrito antes das suas decisões de 24 h e denúncia: precisa de revisão (apagar a cada 24 h, denúncia, leitura pela equipe).

## 10. O que eu NÃO consegui confirmar no repositório
- **Se as migrações 9750 a 9770 já foram coladas no Supabase real.** As memórias dizem que o Treino está **em espera**; tratei tudo como
  **não publicado**.
- **Se existe Postgres real com várias conexões** para o teste de concorrência (hoje só PGlite, uma conexão). `psql` ou o pacote `pg`
  não foram verificados e **não devem ser instalados sem ordem sua**.
- **A corrida da "pessoa em duas salas"**: concluí pela leitura do código; **não reproduzi**.
- **Se há lembrete por e-mail ou notificação** no app para a Agenda: não procurei a fundo.
- **Quantos alunos ficam online ao mesmo tempo**: não há medição; a menção a ~100 pagantes no 1º ano é meta registrada em memória.
- **Plano da Vercel e cron de 1 minuto**: `vercel.json` declara `* * * * *` para o Tutor; a memória diz que o plano **hoje é Hobby (a conferir)**.
  Nada deste desenho depende de cron.
- **Que outros ramos já alteraram `app_settings_key_check`**: o plano de 11/10 manda tomar a **união** na hora; não recontei.
- **Tailwind**: assumi que o app não o usa (regra do projeto: tokens e componentes do DS); não varri o `package.json` por isso.

## 11. O que foi lido
O documento colado do dono (inteiro); spec e plano do pacote de 11/10 (inteiros, inclusive "Decisões do dono"); no ramo `treino-dupla`, o
adendo (spec inteira, plano: lista de tarefas e a Tarefa A1), as migrações 9750 (acesso, perfis, escolhas, matches, sala, políticas do
Realtime), 9760 (apoios, fechamento preguiçoso) e 9770 (inteira), `…0400` (convites), relatórios das Tarefas 11, 12 e 13,
`src/novo/app/dupla/DuplaGate.jsx` e a lista de telas; `MATCH-CHAT-REGRAS.md` do pacote; **e, na segunda rodada, a especificação completa do dono (as 19 partes, inteira)**; `…0100` (assinaturas), `…0500` (uso de IA e eventos),
`…3500_tutor_v2.sql` (livro de IA e `tutor_entitlement`), `…9550` (plano pago), `…9731` (benefício Elite, ramo `leva3`), `vercel.json`;
as memórias `treino-dupla`, `treino-dupla-sozinho-e-radar`, `planos-pacotes-minutos`, `stripe-e-precificacao`,
`precos-e-tetos-antes-dos-alunos`. **Não foram abertos:** nenhum PDF, nenhum `.env`; nada foi executado nem aplicado.

---

## 12. A especificação COMPLETA do dono (19 partes): o que traz, o que muda, o que dá para aplicar

Arquivo: `/Volumes/StaziaMed/Engenharia Match/STAZIA_MATCH_ENGENHARIA_COMPLETA_PROMPT_AGENTE.md` (versão 1.0, 12/10/2026, 1.099 linhas, partes I a XIX). Lido **inteiro**.
É o "método de engenharia e cobrança" que o dono tinha prometido. Ele mesmo avisa (Parte I, nota): "nomes de caminhos, tabelas e bibliotecas são
sugestões, não afirmações sobre o código atual" — e manda auditar, **reaproveitar**, não duplicar e não migrar produção. Tudo isso bate com o que fizemos.
Os "§" abaixo são os do **documento completo**. Os números dele (3/5/10 por dia, 45 s, 120 s, 30/25/20…, +5/+15/+30, 1,5 min de bônus) são **placeholders** — ele
mesmo diz (§7, §10, §12).

### 12.1 O que ele TRAZ de novo ou MUDA em relação ao documento curto
| # | Assunto | Documento curto | Documento completo | Efeito aqui |
|---|---|---|---|---|
| 1 | **Quando e de quem cobrar** | Início confirmado, 1 por aluno | §8.1–8.3, §23, ADR "Cobrança: no início confirmado, não na curtida": depois que os dois aceitam, entram na sala **Stazia** e marcam "Pronto para iniciar", **uma transação** debita os dois e passa `ready → in_session`; falta saldo de um = **nenhum paga** | **Fecha a questão central do §3** (ver abaixo) |
| 2 | **Unidade** | "sessão iniciada" (de passagem) | §2: a UI pode dizer **"match extra"**, mas os registros "precisam tratar a unidade como sessão/treinamento iniciado, para não confundir com curtidas". §8.11: reabrir/reconectar a **mesma** sessão não debita (`(session_id, user_id)`). §38: revezar papéis = **nova sessão e novo débito**, "apenas após confirmação clara, caso a política comercial assim determine" | **Muda a minha recomendação do §3.5** (era "por match"): unidade = **sala que começa**. A rodada 2 vira pergunta (§12.7, 2) |
| 3 | **Três baldes e ordem do débito** | diária → comprados | §8.4: **diária → bônus (com vencimento mais próximo) → comprados**, "desde que a UI explique a regra"; `CreditBucket = daily \| purchased \| bonus \| unlimited` | Carteira com **bônus** e **comprados** (§4.2 revisto). Concessão manual pelo administrador entra como **bônus** |
| 4 | **Limite do dia ao mudar de plano** | upgrade já, downgrade na renovação | §8.9: o **uso do dia continua contado**, o limite vale o do plano atual; se cair abaixo do usado, disponível = **0**, nunca negativo; downgrade respeita a vigência do plano no sistema principal | Some o `limit_open` do meu desenho |
| 5 | **Estorno de dia passado** | "mesmo tipo de saldo" | §8.14 e §26: se o consumo diário foi de **dia passado**, **não** cria cota nova hoje; registra o ajuste na data original e, se couber, uma **compensação separada e auditável** | Compensação = bônus (§4.4 revisto) |
| 6 | **Chargeback/reembolso de compra** | — | §8.15: lançamento compensatório, suspende créditos restantes do pedido, **sem saldo negativo oculto**, conciliação manual do já gasto | Só quando a Stripe voltar (já cabe no livro: `revoke`) |
| 7 | **Ilimitado** | — | §8.16 e §23.8: registra um **charge do tipo `unlimited` com 0** | A **equipe** (acesso completo) ganha uma linha em `study_room_charges` sem lançamento no livro |
| 8 | **Uma sessão por aluno, garantido no banco** | só "nunca duas ofertas" | §8.10, §20 e §25: tabela `study_match_active_claims` com **`user_id` como chave primária**; reserva expira; ao virar sessão, o claim muda atomicamente | Cura o buraco que eu achei (§9.5): ver 12.5, tarefa M2c |
| 9 | **Par canônico único** | `match_connections` | §11 e §21: `CHECK (user_a < user_b)` + `UNIQUE (user_a, user_b)`; **conexão** (social, persiste) ≠ **oferta** (convite do momento) ≠ **sessão** (treino) | Cura o buraco do §9.4; separa "conexão" de "sessão" como eu já separava crédito de match |
| 10 | **Aceite individual e "Pronto para iniciar"** | — | §12: cada aluno aceita/recusa **individualmente** (versão e hora do servidor); a sala nasce `ready`; **não cobra** no aceite; "Pronto" de cada um é registrado no servidor, nunca pelo `ready_at` do cliente | Já é o desenho do nosso `ready_ids` + `app_dupla_start` |
| 11 | **Fila "Match Now" completa** | só o nome | §12, §16–18, §25: `study_match_queue` (1 ativa por aluno, índice parcial), TTL com batida (heartbeat), reserva de **dois** candidatos com `FOR UPDATE SKIP LOCKED`, `rank = score + min(10, espera×1,5) − penalidades`, sem repetir quem recusou | Só se o dono quiser (§12.6) |
| 12 | **Agenda** | só o nome | §13: publicar intervalos futuros, proposta com prazo, aceitar reserva o horário dos dois sem sobreposição, lembretes, remarcar/cancelar, **sem cobrar nem reservar cota antes**, na hora segue o mesmo `ready → in_session` | Ainda falta desenho de tela e lembrete (§6 continua valendo, agora com o fluxo do documento) |
| 13 | **Catálogo de 23 tabelas** `study_match_*` | 6 domínios | §20 | Tabela de correspondência no 12.2 (a maioria já existe com outro nome) |
| 14 | **Contrato de API, erros e idempotência HTTP** | rotas `/api/match/*` | §27–29: 27 rotas, erros padronizados (`INSUFFICIENT_CREDITS`, `ALREADY_IN_SESSION`, `OFFER_EXPIRED`…), cabeçalho `Idempotency-Key` | Traduzido: funções `app_*`; códigos viram `hint` do erro SQL (12.3) |
| 15 | **Tempo real** | Presence + Broadcast | §31–33: tópicos privados `match:user:{id}`, `match:offer:{id}`, `match:session:{id}`, `match:connection:{id}`; envelope `{eventId, eventType, aggregateId, version, occurredAt}`; "Realtime não é fonte da verdade"; duas abas convergem | Mesma filosofia do nosso `dupla:online` + `room:{id}` + `rev` (12.2) |
| 16 | **Rotinas** | Supabase Cron | §34: jobs de expirar oferta, fila, claims, outbox, conciliação Stripe; **"Sem cron habilitado, aplicar expiração preguiçosa"** | É exatamente o nosso `dupla_sweep` |
| 17 | **Stripe** | resumo | §35–37, §24: Checkout `mode=payment`, webhook com corpo bruto, dedupe **por pedido** além do evento, antifraude, administração comercial | Fora (Stripe parada) — guardado como requisito |
| 18 | **Sala, Meet, pedagogia** | — | §38–40: link do Google Meet externo; integração com estação e checklist | Meet **não** (decisão do dono); estação e checklist já existem |
| 19 | **UI, estados e microcopy** | — | §41–43: 12 estados obrigatórios por tela; textos; "nunca descontar saldo na tela antes de o servidor confirmar" | Lista de verificação nas telas M2d/M4b |
| 20 | **Segurança, antiabuso, moderação** | — | §44–45: bloqueio bidirecional, denúncia, limite de taxa em curtidas/convites/fila/mensagens, conta suspensa não entra, confiabilidade neutra para novos | Conflitos com decisões do dono em 12.4 |
| 21 | **Testes** | 10 | §46–48: unitários, **18 de concorrência/integração** (usa **pgTAP** e banco de teste), 10 E2E | Mapa no 12.2, linha 26 |
| 22 | **Métricas, alertas, conciliação** | — | §49–50: indicadores (tempo mediano/P90 até parceiro, taxa de sala pronta que vira sessão…), e **job de conciliação** "saldo = soma do ledger" e "uso diário = soma das cobranças − estornos" | Só a conciliação entra (barata e importante); métricas pesadas ficam fora |
| 23 | **Flags, deploy, rollback** | — | §51–52: expandir/contrair, ligar primeiro para admins/testadores, rollback sem apagar saldo/ledger/pedido | Nosso `treino_dupla.aberto` (equipe sempre entra) + `creditos.ativa` já fazem isso |
| 24 | **Fases A–H, Definition of Done, relatório por fase, ADRs** | — | §53–55, Parte XVII | Nosso plano usa o mesmo ritmo (PARE por etapa, relatório) |
| 25 | **Prompt mestre para agente** (Parte I e XIX) | — | Manda **implementar código, migrar, testar** | **Não se aplica a esta tarefa** (só documento). Vale para quando o dono mandar construir: as regras 2, 6, 7, 9 e 10 dele (reaproveitar, nunca confiar no cliente, transação idempotente, não instalar infraestrutura, não migrar produção) já são as nossas |

**Conclusão da questão central (item 1 e 2 acima):** a decisão do documento completo — **cobrar no início confirmado, de ambos, numa só transação** — é **compatível**
com o que o dono disse ("cada match é cobrado do crédito diário de cada aluno, de ambos"), porque o próprio documento explica que "match extra" é o nome comercial
e a contabilidade é "sessão iniciada" (§2). Os dois textos do dono coincidem em **quem paga** (os dois) e em **de onde sai** (primeiro o crédito diário). A **única
diferença real** com a frase dele, lida ao pé da letra, é **quando**: "no match" soaria como no aceite do convite; o documento diz **no início confirmado**. Por isso a
Opção 1 do §3.2 (cobrar no aceite) fica **descartada pelos dois documentos**; sobra uma **confirmação de uma linha** do dono (§12.7, pergunta 1). A pré-checagem do §3.4
("Sua cota de matches acabou" antes de formar o par) continua valendo: o documento a prevê (§5 "A busca e o convite podem consultar elegibilidade preliminar, mas é
obrigatória nova verificação transacional no início" e §16 "sem permissão para iniciar sessão" como filtro).

### 12.2 Parte por parte: o que já existe no nosso repositório e o que falta
Fontes: migrações `20261003009750/9760/9770` e `src/novo/app/dupla/*` do ramo `treino-dupla` (só leitura), relatórios das Tarefas 11–13, plano de 11/10.
| # | Parte / § do documento | O que já cobre (nosso) | Falta |
|---|---|---|---|
| 1 | §5 perfil, preferências, elegibilidade | `study_profiles` (nome público, instituição, cidade, prova, objetivo, áreas, papel `med/ator/any`, ritmo, dias, turnos, `radar_visible`, `show_school`, `show_stats`, `status`, `last_seen_at`); `app_dupla_save_profile`; `dupla_allowed` (plano, teste, equipe) | **Idioma, nível de preparação, foto, duração preferida, temas do catálogo** não existem. "Perfil mínimo completo" já é exigido pelo baralho. Suspensão de conta: **não achei** campo de aluno suspenso (§12.8) |
| 2 | §6 papéis | `dupla_assign`, `dupla_compat` (papel eliminatório); `both` = `any` | Observador: fora (documento também deixa para depois) |
| 3 | §7 planos | `app_settings.treino_dupla` (`aberto`, `planos`); `subscriptions.plan` = `trial/pro/elite`; `user_has_full_access` (equipe) | Limite diário por plano: **falta** (M1/M4). "Gratuito": **não há plano gratuito** hoje com acesso ao módulo; se o dono quiser dar cota a quem não paga, é decisão (12.7, 5) |
| 4 | §8 cota e carteira | Padrão do dia em São Paulo (`ai_usage.day`, `tutor_entitlement`, `matches_today`); padrão de livro (`ai_usage_ledger`) | **Tudo do crédito falta** (M1–M2) |
| 5 | §9 cancelamento e no-show | `dupla_sweep` (convite vencido/sem sinal), `app_dupla_leave`, `app_dupla_answer_invite` (recusa fecha a sala); nada debita hoje | Mensagens neutras (M2); contestação por denúncia (depende de moderação) |
| 6 | §10 preços | — | Fora: sem preço, sem pacote |
| 7 | §11 Discovery | Baralho completo (`app_dupla_deck`, `app_dupla_swipe`, 7 dias de memória, ordem por compatibilidade, "ocultos pelo papel") + telas | **Cursor/paginação** (o baralho traz tudo de uma vez), **desfazer conexão**, cooldown parametrizável: não pedidos. Reciprocidade com trava do par já existe (`dupla-par:`) |
| 8 | §12 Match Now | — | Fila inteira (Etapa N, opcional) |
| 9 | §13 Agenda | — | Inteira (Etapa G, depende do dono) |
| 10 | §14 fila vazia, §15 reconexão | O baralho vazio mostra "0 colegas online"; Realtime só avisa e há consulta de reserva (5 s local / 30 s ao vivo) | Texto de fila vazia só se houver fila |
| 11 | §16 filtros duros | Em `app_dupla_deck`: não sou eu, perfil existe, `dupla_allowed`, radar ligado, sinal < 2 min, não "fora", sem sala aberta, não escolhido nos últimos 7 dias, papel não conflitante | **Bloqueio** (conflita com decisão do dono), **idioma**, **disponibilidade no intervalo**, **crédito** (M2b), **cooldown de recusa por par** |
| 12 | §17 score e fila justa | `dupla_compat` (papel 40, áreas 25, disponibilidade 20, ritmo 10, prova 5) | Pesos em tabela versionada com soma = 1 e bônus de espera: só se houver fila; pesos finais: dono |
| 13 | §18 pareador | — | Etapa N |
| 14 | §19–21 princípios, tabelas, índices | `timestamptz`, UUID, FKs, checks, índices parciais já são o estilo das migrações 9750–9770 | Tabela de correspondência abaixo |
| 15 | §22 RLS | Todas as `app_dupla_*` são `security definer set search_path = ''` com `revoke … from public, anon`; tabelas sem escrita direta; políticas em `realtime.messages` (9750) | O documento quer as funções num **schema privado não exposto**; o nosso padrão (funções `public.*` com permissões fechadas, testadas em `duplaMatchBanco.test.ts`) é equivalente e mais simples; **manter** |
| 16 | §23 `start_training_session` | `ready_ids`, `confirmed_ids`, `connected_ids`, relógio do servidor (`started_at`, `ends_at`, pausa) já nas colunas de `checklist_rooms`; `app_dupla_start` está **planejada** (Tarefa 14, 9910) | O débito dentro dele (M2a) |
| 17 | §24 `fulfill_paid_order` | `billing_events` (id único do evento), rotas antigas desligadas (`server.ts:89`) | Stripe parada |
| 18 | §25 claims e locks | Travas de par (`dupla-par:`), de aluno (`'tutor:'`, `'gam:'`), `SKIP LOCKED` no `ch_worker_claim` | Tabela de reservas por pessoa (M2c) |
| 19 | §26 estornos | — | M1b/M4a |
| 20 | §27–30 API, erros, idempotência, tipos | Funções `app_*` + mensagens em português + `errcode`; **sem** códigos de máquina nem tabela de idempotência HTTP | Códigos em `hint` (12.3). Idempotência natural: id da sala, `idem_key` do livro. Tabela de `Idempotency-Key`: **não aplicar** |
| 21 | §31–33 Realtime | `dupla:online` (Presença + INSERT de convite), `room:{id}` (Presença da sala), políticas em `realtime.messages`; `rev` da sala sobe a cada mudança; consulta de reserva | Tópico privado de usuário `wallet.updated`: **não precisa** — o aluno relê `app_credit_state` quando a sala muda de fase |
| 22 | §34, §50 rotinas e conciliação | `dupla_sweep` preguiçoso; Vercel Cron existente (`vercel.json`) | **Função de conciliação** do livro (nova, M5) |
| 23 | §35–37 Stripe/admin comercial | — | Fora; administração dos limites e concessão: M4 |
| 24 | §38 sala | Fases, papéis, estação, cronômetro do servidor, impressos, PEP (Etapas 1–7 do plano de 11/10) | **Meet: não** (decisão do dono); "revezar = nova sessão com novo débito" é pergunta (12.7, 2) |
| 25 | §40 pedagógico | `checklist_study_sessions` (nota, feedback, versão da estação, tempo usado), `station_version` | — |
| 26 | §44 segurança | Padrões acima; `admin_log` | Taxa de uso em curtidas/convites (12.5, tarefa R1, valores do dono) |
| 27 | §47 18 testes de concorrência | Ver tabela 12.2b | PGlite não prova trava; harness com Postgres real (M5b) |
| 28 | §48 10 E2E | `scripts/e2e/dupla.mjs` (Tarefa 20) | Cenários de crédito (M5c) |
| 29 | §49 métricas | "Uso do mês" (Tarefa 18) | Fora (métricas pesadas) |
| 30 | §51–52 flags, deploy, rollback | `treino_dupla.aberto` (equipe sempre entra), `creditos.ativa`; SQL para o dono colar por etapa e conferir | — |

**12.2a Tabelas do §20 → nossas** (nada de prefixo `study_match_` novo: reaproveitar)
| Documento | Nosso | Estado |
|---|---|---|
| `study_match_profiles`, `_preferences`, `_subjects`, `_availability` | `study_profiles` (tudo numa linha; áreas e dias/turnos no próprio perfil) | FEITO (sem idioma, nível, foto, horário) |
| `study_match_swipes` | `study_swipes` (par dirigido, `right/left`, 7 dias) | FEITO |
| `study_match_connections` | `study_matches` | PARCIAL: **sem par canônico único** → M2e |
| `study_match_blocks` | — | FALTA / **conflito** (12.4) |
| `study_match_queue`, `_offers`, `_offer_members` | — (`study_invites` é convite de **um** lado, 60 s) | FALTA (Etapa N); nota: oferta de fila é **dos dois lados** e o convite atual é de um só |
| `study_match_active_claims` | — | FALTA → M2c (`study_room_claims`) |
| `study_match_sessions`, `_session_members` | `checklist_rooms` (+ `member_ids`, `candidate_id`, `evaluator_id`, `ready_ids`, `started_at`…) | FEITO (dados) / PLANEJADO (ações) |
| `study_match_plan_policies` | `app_settings.treino_dupla` + novo `app_settings.creditos` | PARCIAL → M1a |
| `study_match_daily_usage`, `_wallets`, `_credit_ledger`, `_session_charges` | novos `credit_daily`, `credit_wallets`, `credit_ledger`, `study_room_charges` | FALTA → M1a |
| `study_match_credit_packages`, `_orders`, `_stripe_events` | `billing_events` (só eventos) | FORA (Stripe parada) |
| `study_match_messages` | `study_messages` (Etapa C1) | PLANEJADO, **conflito de 24 h** (12.4) |
| `study_match_feedback` | `checklist_study_sessions.feedback_*` (feedback do avaliador); nota de 1 a 5 entre alunos **não existe** | Não aplicar (não pedido) |
| `study_match_reports` | `checklist_station_reports` (problema na estação) existe; **denúncia de pessoa** não | FALTA (C4, depende de decisão) |
| `study_match_admin_audit` | `admin_log` | FEITO |
| `study_match_notification_outbox` | — | **Não aplicar**: a mudança na linha da sala (com `rev`) já avisa pelo Realtime |

**12.2b Os 18 testes de concorrência/integração do §47 → o que temos**
| # | Teste | Cobertura / tarefa |
|---|---|---|
| 1 | Curtidas A→B e B→A = uma conexão | Existe (`duplaMatchBanco.test.ts:430`, confere o texto da trava e o resultado). Falta o **par canônico** (M2e) |
| 2, 3 | Fila: 100 pedidos, duas ofertas não reservam o mesmo | Só com fila (Etapa N) |
| 4 | Duas abas: uma sessão ativa | M2c |
| 5 | Dois cliques em start = um débito | M2a |
| 6 | Dois participantes disparam juntos = dois débitos (um cada) | M2a + harness real (M5b) |
| 7 | Um sem saldo: ninguém paga | M1b, M2a |
| 8 | Sem sala pronta, nada consome | M2a |
| 9 | Virada do dia | M1b (`p_now`) |
| 10, 11, 17 | Webhook duplicado, fora de ordem, assinatura inválida | Stripe parada; o equivalente é a `idem_key` repetida (M1b) |
| 12 | Falha depois do COMMIT e antes da resposta: sem segundo débito | M2a: segunda chamada devolve o estado, sem débito |
| 13 | Falha do Broadcast não perde evento | Estado está no banco; consulta de reserva (já existe, Tarefa 12) |
| 14 | Estorno repetido | M1b/M4a |
| 15 | RLS com A/B/C | M1c e M5a |
| 16 | Cancelar/expirar libera reservas sem sessão zumbi | M2c (reserva some quando a sala fecha) |
| 18 | Valores manipulados no cliente não mudam a carteira | M5a |

### 12.3 Tradução de stack (o documento supõe Next.js, Stripe, Meet, cron do Supabase)
| O documento supõe | Nossa realidade | Decisão |
|---|---|---|
| Next.js App Router, `src/app/api/match/*`, `features/stazia-match/*` (Parte XVI) | Vite/React em `/novo` (`src/novo/app/dupla/*`), regra no Postgres (`app_*`), Express só para segredo/IA/arquivo | Não adotar a estrutura. O documento manda "adaptar ao roteador do projeto" (§27) |
| `zod` nas rotas | Validação dentro das funções SQL (`raise exception … using errcode`) | Manter |
| Códigos de erro (`INSUFFICIENT_CREDITS`, `ALREADY_IN_SESSION`, `OFFER_EXPIRED`, `INCOMPATIBLE_ROLES`, `RATE_LIMITED`…) | Mensagens em português | Cada erro novo leva também `hint = '<CÓDIGO>'` para a tela decidir sem ler texto |
| `Idempotency-Key` HTTP + tabela | Chaves naturais no banco (`room_id`, `idem_key`) | Não criar tabela de idempotência HTTP |
| Funções em schema privado | `public.*` com `revoke … from public, anon (, authenticated)` | Manter (testado) |
| Supabase Cron/pg_cron | Não usamos; `dupla_sweep` preguiçoso; Vercel Cron; `ch_jobs` no Cloud Run | O documento aceita o preguiçoso (§34); nada de cron para o crédito |
| Outbox de notificações | Linha da sala + `rev` + Realtime `postgres_changes` | Não criar outbox |
| Stripe Checkout, webhook, `fulfill_paid_order` | Stripe **parada**; `billing_events` existe | Fora; livro pronto (`purchase`, `idem_key` por pagamento) |
| Google Meet externo com link | **Sem link, conversa fora do app** (D3) | Não aplicar §38 (item "link externo") e §39 |
| pgTAP | Vitest + PGlite (`helpers/duplaDb`) | Manter; Postgres real só no harness M5b |
| Flags de ambiente `STAZIA_MATCH_*` | `app_settings` (`treino_dupla`, `creditos`), equipe sempre entra | Manter |
| Tailwind/`NEXT_PUBLIC_*` | DS do app (`src/novo/ds`), tokens | Manter |
| Nomes de plano Gratuito/Essencial/Premium/Ilimitado | `trial/pro/elite` + equipe | Manter os nossos |
| Convite 45 s, fila 120 s | Convite 60 s (`study_invites.expires_at`); fila inexistente | Manter 60 s; o dono pediu limites de convite "a definir" |

### 12.4 Conflitos do documento com decisões do dono — registro e pedido de decisão
| # | Documento | Decisão do dono | Proposta | Preciso do dono |
|---|---|---|---|---|
| 1 | **Bloqueio de pessoas** (`study_match_blocks`; §16 filtro duro; §44 "bloqueio bidirecional com efeito imediato"; teste E2E "bloquear impede novas ofertas") | Radar **para todos, sem bloqueio** (adendo D8); no chat **bloqueio/denúncia: sim** (pacote D6) | Bloqueio vale **só no chat/conversa**; radar, baralho e convite não filtram bloqueio | Sim/não (12.7, 6) |
| 2 | **Moderação**: papel "Moderador" separado (§4), denúncias com fila própria | Denúncia vai à **equipe**; a equipe lê as conversas denunciadas | Moderador = **equipe** (administrador, editor, revisor médico); sem papel novo | Confirmar (12.7, 7) |
| 3 | **Mensagens permanentes** (`study_match_messages`, retenção "mínima conforme lei") | Mensagens **se apagam a cada 24 h** | `expires_at = created_at + 24 h`; as funções do chat ignoram vencidas e `dupla_sweep` apaga; **a denúncia guarda uma cópia** (texto e hora) das mensagens do par no momento do envio, porque senão a equipe não consegue ler o que foi denunciado | Por quanto tempo a equipe guarda a cópia da denúncia (12.7, 7) |
| 4 | **Google Meet** (§38–39) | Conversar **fora do app, sem link** | Não aplicar | Confirmar |
| 5 | **Stripe** (§9, §24, §35–37, Fase G) | Parada | Fora; livro pronto | — |
| 6 | **Agenda** (§13) | "Agendar sessão" foi removido (pacote R13) | Só com pedido expresso e prévia | 12.7, 11 |
| 7 | **Cobrança por sessão** (§2, §8) | "Cada match é cobrado" | Compatível (12.1) | Confirmar (12.7, 1) |
| 8 | **Rodada 2** (revezar = nova sessão com novo débito, "se a política determinar") | Não decidiu | Chave desligada por padrão (`cobra_rodada_extra = false`): não cobra até ele mandar | 12.7, 2 |
| 9 | **Conexão só por curtida recíproca**; convite da fila/agenda **não** cria conexão | Convite direto: aceitar o desenho do plano (pacote V1 cria `study_matches`; adendo R1 não cria) | Seguir o documento e o adendo: convite do radar **não** cria conexão | 12.7, 8 |
| 10 | **Plano "Gratuito" com cota** | Sem franquia gratuita global (pacote); módulo hoje só para planos marcados | Cota vale para os planos que já abrem o módulo | 12.7, 5 |
| 11 | **Perfil**: idioma, nível, foto, duração (§5) | — | Não criar agora | 12.7, 9 |
| 12 | **Observador** (§6) | — | Fora | — |

### 12.5 O que dá para APLICAR AGORA (em ordem, fases pequenas, com PARE)
Reaproveita o já construído: **nada de segunda `study_matches`, segundo convite de 60 s, segunda sala, segundo contador**. Migrações a partir de **9960**, sem tocar
na faixa 9900–9959 do plano de 11/10 (e avisando que o adendo precisa renumerar). Detalhes de cada tarefa estão no plano.
| Fase | O que | Depende de | Precisa de decisão do dono? |
|---|---|---|---|
| **0** | Alinhar os planos (adendo renumera; C1 do chat ganha 24 h e denúncia; R1 sem bloqueio) — só documentos | — | Sim: 12.7, 6–8 |
| **1 (M1)** Fundação do crédito, **desligada** | 9960 tabelas (carteira com bônus e comprados, uso do dia, livro, `study_room_charges`, chave `creditos`), 9961 funções internas, 9962 leitura do aluno/exportação/exclusão | nada | **Não** (nenhum número; nasce desligada). Pode começar já |
| **2 (M2c + M2e)** Integridade sem crédito | **Uma sala por pessoa** (reservas por pessoa mantidas por gatilho na sala, 9972) e **par canônico único** (9973) | 9750–9770 | **Não** (corrige buracos) — **recomendo fazer primeiro**, junto com M1 |
| **3 (M2a, M2b, M2d)** Cobrança no início confirmado, pré-checagem e avisos | M1, M2 e **Tarefa 14** (`app_dupla_start`, plano de 11/10) | Sim: 12.7, 1 e 2 |
| **4 (M4)** Administração dos créditos (limites por plano, concessão como bônus, estorno, extrato, conciliação) | M1 | Valores são do dono, mas a tela vem vazia |
| **5 (M3)** Crédito de IA do treino sozinho no mesmo livro | M1 e adendo 6B | Sim: pesos e janelas (12.7, 4) |
| **6 (M5)** Testes obrigatórios (§47), conciliação, Postgres real, ponta a ponta, SQL | M2 | Ambiente para o Postgres real |
| **7 (R1)** Limite de taxa de escolhas/convites | — | **Sim**: números (adendo D9 "a definir") |
| Depois, só se o dono pedir: Etapa N (fila), Etapa G (agenda) | V (radar) | Sim |

### 12.6 O que NÃO aplicar agora, e por quê
| Item do documento | Razão |
|---|---|
| **Discovery como tela separada do baralho** (Parte XII: "Descobrir parceiros") | O baralho **é** o Discovery (curtir/passar, reciprocidade, cartão público). Separar criaria dois caminhos para a mesma coisa. Só acrescentar, se pedido, "Conexões" (lista) — já virá com as "Conversas" da Etapa C |
| **Agenda** (§13, Fase F) | Removida por decisão sua; faltam telas, lembrete e regras (§6); o documento mesmo diz para **não** reservar cota |
| **Fila Match Now** (§12, §16–18, Fase D) | Poucos alunos online ao mesmo tempo no começo; o radar + convite direto já resolve "treinar agora"; custo alto (fila, ofertas dos dois lados, reservas, 4 testes de concorrência) |
| **Stripe: pedidos, pacotes, webhook, `fulfill_paid_order`, antifraude financeira, chargeback** (§24, §35–37, Fase G) | Parada por ordem sua |
| **Papel Moderador**, painel de denúncias próprio (§4, §44) | Basta a equipe; denúncia é Etapa C4 (depende de decisão) |
| **Observador** (§6) | O documento também adia |
| **Métricas pesadas** (§49: P90 de espera, conversão por tema, receita, chargeback) | Sem fila nem venda não há o que medir; "Uso do mês" e a conciliação bastam |
| **Outbox de notificações, tabela de idempotência HTTP, schema privado, pgTAP, estrutura Next.js, `NEXT_PUBLIC_*`** | Substitutos nossos já existem (12.3) |
| **Pesos do score em tabela versionada com bônus de espera** (§17) | Nossos pesos ficam; o bônus de espera só tem sentido com fila |
| **Idioma, nível de preparação, foto, confiabilidade** no perfil e no score | Campos novos exigem decisão e tela; confiabilidade só com histórico real |
| **Nota de 1 a 5 entre alunos** (`study_match_feedback`) | Não pedida; já há feedback do avaliador e nota do PEP |
| **Link do Meet e "abrir o Meet"** (§38–39) | Decisão D3 |
| **Mensagens permanentes** (§20 `study_match_messages`) | Decisão de 24 h |
| **Desfazer conexão, exclusão com retenção** (§11.6, §44) | Não pedido; a exclusão da conta já apaga |

### 12.7 Lista CURTA e atualizada de decisões (sim / não / valor) — substitui o §8
Legenda: **[DOC]** = o documento completo já responde (basta confirmar); **[SEU]** = só o dono responde.
| # | Pergunta | Recomendação | Quem responde |
|---|---|---|---|
| 1 | **Quando o crédito sai?** "Cada match" = **cada sala que começa** (os dois prontos, uma transação, os dois pagam ou nenhum). Confirma? | **Sim** (documento §2, §8, §23 + ADR) | **[DOC]** confirmar |
| 2 | **Inverter papéis (rodada 2)** gasta outro crédito de cada um? (o documento diz "nova sessão, novo débito, só com confirmação clara e se a política mandar") | **Não** por enquanto (chave desligada); religa quando você decidir | **[SEU]** |
| 3 | **Regras pequenas** — aceita? equipe não gasta crédito [SEU]; quem está sem crédito não é revelado ao colega [DOC §9]; abandono depois de iniciar mantém o débito [DOC §8.13]; estorno só manual, com justificativa e auditoria [DOC §8.13, §26]; estorno vai ao mesmo tipo de saldo (dia passado vira bônus de compensação) [DOC §8.14] | Sim a todas | **[DOC]** quase tudo; só "equipe não gasta" é **[SEU]** |
| 4 | **Números**: créditos por dia para `trial`, `pro`, `elite`; ordem **diária → bônus → comprados** (ou comprados antes do bônus); peso da avaliação por IA do sozinho; janelas dia/semana/mês de IA | Tela vem **vazia e desligada**; ordem do documento | **[SEU]** valores; ordem **[DOC]** |
| 5 | **Quem não paga** (sem plano) ganha cota gratuita para entrar no módulo? (o documento sugere "Gratuito 3" só como exemplo) | **Não** — a cota só vale para os planos que já abrem o módulo | **[SEU]** |
| 6 | **Bloqueio de pessoas** só no chat (e denúncia), e **não** no radar/baralho/convite? | **Sim** | **[SEU]** (conflito com o documento) |
| 7 | **Denúncia e moderação**: moderador = equipe; quanto tempo a equipe guarda a cópia das mensagens denunciadas; mensagens somem em 24 h | Equipe sim; prazo **[SEU]** | **[SEU]** |
| 8 | **Convite do radar cria conexão (match)?** (documento e adendo: **não**; pacote V1: sim) — e quem treinou por convite pode conversar depois? | **Não cria**; conversa só por curtida recíproca | **[SEU]** |
| 9 | **Perfil**: criar idioma e nível de preparação (pesam 20% no documento)? **Pesos** do score: manter os nossos? | **Não criar agora; manter os nossos** | **[SEU]** |
| 10 | **Fila "Buscar agora"** (Etapa N) | **Depois do radar** | **[SEU]** |
| 11 | **Agenda** (§6 da spec + §13 do documento) | **Depois**, com prévia | **[SEU]** |
| 12 | **Concessão manual de créditos** pela Administração enquanto a Stripe está parada (entra como **bônus**, com motivo, no registro) | **Sim** | **[SEU]** |
| 13 | **Conta apagada** apaga também o extrato de créditos? | **Sim** para cota; revisar quando houver compra | **[SEU]** (jurídico) |
| 14 | **Limites de taxa** (curtidas por minuto, convites por hora): valores | Vazios; sem limite até você preencher | **[SEU]** |
Respondidas pelo documento completo e **por isso retiradas da lista**: unidade da cobrança (sessão), momento do crédito (início), ordem do débito, baldes (bônus/comprados), downgrade, estorno de dia passado, expiração dos comprados (**sem vencimento silencioso**, §8.8), cancelamento antes do início (sem débito), mensagem neutra ao parceiro.

### 12.8 O que NÃO confirmei neste segundo mapeamento
- Se o app tem **suspensão de aluno** (o documento exige "conta suspensa não entra em fila nem recebe convite"): uma busca rápida nas migrações não achou campo de aluno suspenso (só "acesso" por plano e papel); o painel de usuários pode ter algo que não li.
- Se há **limite de taxa** em curtidas/convites: não achei nada além do que os planos (adendo/chat) propõem.
- Os **testes de concorrência reais** continuam sem ambiente confirmado (PGlite roda uma conexão).
- Como o **convite simétrico da fila** (dois aceites) se encaixaria em `study_invites` (um sentido): é desenho aberto da Etapa N.
- O documento cita rotas e arquivos que **não existem** no nosso repositório (Next.js); nada foi presumido.
