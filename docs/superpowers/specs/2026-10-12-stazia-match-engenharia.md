# Stazia Match — o documento de engenharia x o que já temos x como construir

Data: 2026-10-12. Escrito para o dono do produto (o que o documento propõe, o que já existe, o que falta, o que ele precisa decidir) e
para quem for construir. **Só documento: nenhum código de produto foi alterado, nenhuma migração foi aplicada, nada foi publicado.**
Base: ramo `treino-pacote-1011` (a partir de `a49bfd9`, Etapas 1 a 4 do Treino em Dupla). Plano que acompanha este texto:
`docs/superpowers/plans/2026-10-12-stazia-match-engenharia.md`.

O documento analisado ("STAZIA MATCH — Engenharia completa", versão 1.0, origem externa, colado pelo dono em 2026-10-12) foi escrito
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
3. **A pergunta central (§3):** o documento cobra **no início confirmado** da sessão (os dois confirmam, 1 crédito por aluno). Você
   disse "cada match é cobrado". Apresento as duas formas e recomendo **cobrar no início confirmado, com uma pré-checagem no match**.
   **Preciso da sua decisão** (§8, pergunta 1).
4. **Fila "Buscar agora" (Match Now)** e **Agenda** do documento **não existem** e ficaram fora por decisões suas de 09/10. Eu
   recomendo **não construir a fila agora** (poucos alunos online ao mesmo tempo no começo) e **só desenhar a Agenda se você pedir** (§6).
5. **Stripe (§9 do documento): fica parada**, como você decidiu. Deixo o livro pronto para receber compra depois (tipo de lançamento
   "compra" e chave que não repete), sem tabela de pedido, sem rota, sem preço.
6. **Achei dois buracos nos planos que já existem** (§9): (a) nada no banco impede a mesma pessoa de entrar em **duas salas ao mesmo
   tempo**; (b) os dois planos (pacote de 11/10 e adendo do sozinho) usam **os mesmos números de migração** (9900, 9910, 9920, 9930).
7. **Nenhum número foi inventado**: cotas por dia, validade de extras, pesos finais e textos comerciais são do dono. Os números do
   documento (3/5/10 por dia, 45 s, 30/25/20…) são só exemplos dele.

## 0.1 Decisões do dono já tomadas (2026-10-12) — valem sobre qualquer recomendação deste texto
| Assunto | Decisão |
|---|---|
| Quem paga o match | Cada match é cobrado do **crédito diário** de cada aluno, **de ambos** os participantes |
| Números de pacote/cota | **A definir** (virão do método do dono). O documento de engenharia só dá exemplos |
| Compra real | **Parada** (Stripe parada desde 2026-10-10); tela só informativa |
| Radar | **Para todos, sem bloqueio de pessoas** (adendo D8). *Conflita com `match_blocks` do documento: ver §1 linha 3 e §8 pergunta 8* |
| Chat | Mensagens **se apagam a cada 24 h**; **denúncia** vai à equipe; a equipe lê as conversas denunciadas |
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
| 14 | Carteira de extras | `match_wallets` (saldo sob trava) | Nada para match | FALTA | §4 |
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
| Virar o dia: nova cota, extras preservados | M1 (funções internas aceitam um "agora" de teste) |

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

### 3.5 Segunda pergunta: a unidade (match ou sessão?)
- **Match** (como você disse e como o pacote registra): cobra **uma vez por par/match**, no primeiro início; **retomar o mesmo par não
  cobra de novo**, nem a rodada 2. Chave do lançamento: `match_id` + aluno.
- **Sessão iniciada** (como o documento diz): cada vez que uma sala começa a contar tempo cobra. Chave: `sala` + aluno.
- **Recomendo seguir a sua regra (match)**, porque está escrita no pacote como regra firme. Consequência a saber: dois colegas que
  treinam sempre juntos pagam **um** crédito de cada na primeira sessão e as seguintes saem de graça. Se você não quer isso, escolha
  "sessão iniciada" (pergunta 2).
- Convite direto (radar): para valer como "match" ele precisa criar `study_matches` (pacote V1) — o adendo diz o contrário
  (§9). Recomendo que **crie** (assim conta crédito e abre o chat).

### 3.6 Regras que valem nas duas opções (propostas, o dono pode mudar)
1. Equipe (administrador, editor, revisor médico) **não gasta** crédito; o colega paga normalmente.
2. Quem está sem crédito: o outro **não** é informado do motivo (mensagem neutra; ninguém vê o saldo do outro).
3. Abandono **depois** de iniciar: o crédito fica; estorno só por falha técnica comprovada, pela Administração, com motivo (fica no extrato).
4. Estorno vai para o **mesmo tipo de saldo** de onde saiu (diário ou extra).
5. Upgrade de plano vale na hora; downgrade só na próxima renovação (§4.4).
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
| `credit_wallets (user_id, pool, extra_balance, updated_at)` chave `(user_id, pool)` | Saldo de **extras** (comprados ou concedidos). É a linha que se trava | `check (extra_balance >= 0)`: nunca negativo. Sem acesso direto |
| `credit_daily (user_id, pool, day, limit_open, used)` chave `(user_id, pool, day)` | Uso do dia e o limite **no 1º uso do dia**. É o `match_daily_usage` do documento | Dia = `America/Sao_Paulo`. Sem cron: o dia novo é uma linha nova. `limit_open` guarda o limite do plano na abertura do dia (para o downgrade só valer amanhã); o upgrade usa `greatest(limit_open, limite atual)` |
| `credit_ledger (id, user_id, pool, day, kind, bucket, amount, ref_type, ref_id, idem_key unique, reverses_id, reason, created_by, created_at)` | **Livro só-acrescenta**, auditável. `kind`: `consume, refund, grant, purchase, revoke, adjust`; `bucket`: `daily` ou `extra` | `idem_key` único (ex.: `match:<match_id>:<user>`, `solo:<run>:<n>`) = a regra `UNIQUE (session_id, user_id)` do documento, generalizada. Gatilho que recusa `update` e `delete` (igual `ai_usage_ledger_guard`) |
| `app_settings` chave **`creditos`**: `{ "ativa": false, "match": { "trial": null, "pro": null, "elite": null }, "ia": { ...dia/semana/mes por plano..., "pesos": {...} } }` | Limites por plano. **Tudo vazio e desligado** | A checagem de chaves de `app_settings` precisa da **união** de todas as chaves já usadas + `treino_dupla` + `creditos` (armadilha conhecida, ver plano de 11/10) |

Invariante testada: `credit_daily.used` = soma dos lançamentos `consume` do dia no balde `daily` menos os `refund` do mesmo balde; saldo de
extras = soma de `grant/purchase` menos `consume/revoke` no balde `extra`.

### 4.3 Funções (todas `security definer set search_path = ''`)
| Função | Quem chama | O que faz |
|---|---|---|
| `credit_day(p_now)` / `credit_limit(uid, pool, day)` | só interno | Dia de São Paulo; limite do plano **vivo** do aluno lendo `subscriptions` e `creditos`. Equipe = sem limite |
| `credit_state(uid, pool, p_now)` | só interno | `{ ativa, limite_dia, usados_hoje, extras, disponivel }` |
| `credit_consume(uid, pool, n, ref_type, ref_id, idem_key, p_now)` | só interno | Trava `'credito:'||pool||':'||uid`; se a `idem_key` já existe, **devolve o que já fez e não debita**; gasta primeiro o diário, depois o extra; recusa se não há saldo |
| `credit_consume_pair(pool, a, b, …)` | só interno (`app_dupla_start`) | Trava os **dois em ordem crescente de UUID**, confere os dois, debita os dois, escreve os dois lançamentos; qualquer falha desfaz **tudo** (cobrança de nenhum) |
| `credit_refund(ledger_id, reason)` | só interno e administrador | Lança `refund` no **mesmo balde** do consumo original; uma vez só |
| `credit_grant(uid, pool, n, reason)` | só administrador | Concessão manual (alternativa à compra enquanto a Stripe está parada); entra no `admin_log` |
| `app_credit_state(p_pool)` | o aluno (autenticado) | O que a tela mostra: "Cota diária disponível", extras. **Nunca** mostra o saldo do outro |
| `credit_assert_available(uid, pool)` | só interno | A **pré-checagem** do §3.4 (não debita) |
Os testes passam um "agora" (`p_now`) para provar a virada do dia sem relógio falso no banco.

### 4.4 Regras do documento, traduzidas
| Regra | Como fica |
|---|---|
| Novo dia = nova cota, extras preservados | Linha nova em `credit_daily`; `credit_wallets` não muda |
| Upgrade vale na hora, descontando o uso do dia | `greatest(limit_open, limite atual)` menos `used` |
| Downgrade só na próxima renovação | `limit_open` do dia já aberto não diminui |
| Convite expirado / falha antes do início = sem débito | Nunca houve `consume` |
| Dupla abandona sessão iniciada = débito permanece | Sem `refund` automático |
| Falha técnica comprovada = estorno ao mesmo tipo de saldo | `credit_refund` manual, pela Administração |
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
| **Saldo negativo** | `check (extra_balance >= 0)` e função que recusa antes |
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

## 8. Decisões para o dono (sim / não / valor)
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
`src/novo/app/dupla/DuplaGate.jsx` e a lista de telas; `MATCH-CHAT-REGRAS.md` do pacote; `…0100` (assinaturas), `…0500` (uso de IA e eventos),
`…3500_tutor_v2.sql` (livro de IA e `tutor_entitlement`), `…9550` (plano pago), `…9731` (benefício Elite, ramo `leva3`), `vercel.json`;
as memórias `treino-dupla`, `treino-dupla-sozinho-e-radar`, `planos-pacotes-minutos`, `stripe-e-precificacao`,
`precos-e-tetos-antes-dos-alunos`. **Não foram abertos:** nenhum PDF, nenhum `.env`; nada foi executado nem aplicado.
