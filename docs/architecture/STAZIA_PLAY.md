# Stazia Play: gamificação do StaziaMed Revalida

> **Nome no app: Stazia Arena** (o dono renomeou em 2026-10-06; migração `4500_stazia_arena` atualiza os textos do banco). No código, tabelas e funções o nome interno continua "play"/`gam_*`.

Data: 2026-10-06. Pedido: "Analisar o sistema existente e implementar integralmente um novo módulo de gamificação" (itens 1–112, com as seções 39–44 substituídas pela direção visual "Stazia Play": trilha de aprendizado como centro da experiência). O pedido chama o produto de StaziaNexus; o nome do produto continua StaziaMed e o módulo chama-se **Stazia Play**.

## 1. Auditoria: o que o pedido supunha e o que existe

| O pedido supunha | O que existe de verdade | Decisão |
|---|---|---|
| Next.js, Server Actions, Route Handlers, Tailwind | React 19 + Vite, React Router, design system próprio em `src/novo/ds` (tokens CSS); servidor Express (`server.ts`) | mantido; as "actions" viraram funções `app_*` do banco (padrão do projeto) e uma rota de cron no Express |
| Supabase Edge Functions, pg_cron, Supabase Cron | funções `ch_worker_*` com a chave de serviço; tarefas agendadas pela **Vercel Cron** (já usada pela voz do Tutor) | a rotina diária é `GET /api/play/cron` com `CRON_SECRET`; sem pg_cron |
| Sistema de notificações, i18n, Stripe, Resend | não existem (o sino do cabeçalho é só desenho; o app é só pt-BR; assinatura é `subscriptions` + `plans`) | nada criado em paralelo: o feedback é na própria tela (toast e modais); textos em pt-BR; nenhum pay-to-win (os planos não mudam XP) |
| Tabela de respostas com `attempt_id` enviado pelo cliente | `question_attempts` (imutável, corrigida por gatilho `grade_question_attempt`), `practice_sessions`, `flashcard_reviews`, `plan_tasks`; o Tutor também grava em `question_attempts` | o id da tentativa nasce no banco; a chave de idempotência é (aluno, evento, origem, id da tentativa) |
| Dificuldade da questão | não há coluna; `question_dna.difficulty_estimate` (HIGH/MODERATE/LOW) do motor de engenharia reversa | nova `question_difficulty` (acurácia global real, atualizada à noite) com a estimativa do motor como reserva |
| Sequência de dias | `my_streak_days()` (qualquer atividade conta) | mantida para o app antigo; o Play tem a sua (mínimo de 10 questões válidas, 20 min ou 1 missão), no fuso do aluno |
| Perfil, planos, trial | `profiles`, `subscriptions`, `has_pro()` | `profiles.timezone` novo; trial e inadimplência não apagam nada |
| Métricas e desempenho | `app_home`, `app_performance`, `my_area_stats`, caderno de erros (`my_error_notebook`) | reutilizados pelo score (revisão = erros superados) e pelo retroativo |
| Tutor IA | Stazia Tutor v2 (contexto `ch_worker_tutor_context`) | recebe `ch_worker_tutor_play_context` (só números agregados) e uma regra no prompt (2.3.0) |
| Gráficos | `recharts` instalado, mas as telas usam SVG próprio (`PerformanceScreen`) | gráfico do score em SVG, sem dependência nova |

**Reutilizado**: autenticação e RLS; tabelas de estudo; `assert_admin`/`admin_log`; `area_label`; `practice_pool`/`app_start_session` (a trilha só acrescenta o filtro `topic`); `Correction`, `AnswerOption`, `Card`, `Badge`, `ProgressBar`, `Tabs`, `StatCard`, `Switch`; `useLoad`/`messageOf` da administração; a tarefa agendada da Vercel.

**Alterado**: `app_answer_question` (devolve o bloco `play`), `app_bootstrap` (bloco `play`), `app_update_profile` (`timezone`), `practice_pool` (filtro `topic`), `Shell.jsx` (menu desktop com "Trilha" e grupo "Stazia Play"; celular: Início · Trilha · **Estudar** · Ranking · Perfil), `App.jsx` (rotas), `HomeScreen` (painel do Play na ordem pedida), `PracticeSession` (XP ao lado do veredito, contador da sessão, modais), `AccountScreen` (seção "Meu Stazia Play"), `AdminScreen` (aba "Stazia Play"), `backend.ts`/`supabaseBackend.ts` (`subscribeStats`), tokens do design system (`--xp`, `--league-*`, `--level-*`, `--locked`), Tutor (`engine.ts`, `prompts.ts`), `server.ts`, `vercel.json`.

**Criado**: migração `20261003003800_stazia_play.sql`; `server/play/router.ts`; `src/novo/app/play/*`; `src/novo/app/admin/AdminPlay.jsx`; testes `supabasePlayApi.test.ts` e `playScreens.test.tsx`; este documento.

**Removido**: nada.

## 2. Arquitetura

```
atividade real (question_attempts · flashcard_reviews · practice_sessions · plan_tasks)
   ↓ gatilhos AFTER INSERT/UPDATE (SECURITY DEFINER)
gam_process_attempt / gam_process_flashcard_review / gam_process_session_finish / gam_process_plan_task
   ↓
gam_award  →  gamification_events (ledger, chave única)  →  user_gamification_stats (+ coin_transactions, league_memberships)
   ↓ gam_after_activity
missões (gam_update_missions) · sequência (gam_check_streak) · Stazia Score (gam_refresh_score) · medalhas (gam_check_achievements)
   ↓
app_* (leitura, RLS) → telas · Realtime na própria linha de estatísticas
```

O cliente nunca informa pontos. `app_answer_question` só grava a tentativa (como antes) e lê do ledger o que ela rendeu (`gam_turn_summary`, SECURITY INVOKER: só as próprias linhas).

### Eventos

`QUESTION_CORRECT`, `QUESTION_WRONG`, `SESSION_10`, `SESSION_30`, `FLASHCARD_REVIEWED`, `FLASHCARD_MASTERED`, `SPACED_REVIEW_DONE`, `SIMULATION_COMPLETED`, `DAILY_GOAL_COMPLETED` (plano de hoje), `DAILY_MISSIONS_COMPLETED`, `MISSION_COMPLETED`, `STREAK_INCREMENTED`, `STREAK_FREEZE_EARNED/USED`, `STREAK_BROKEN`, `ACHIEVEMENT_UNLOCKED`, `LEVEL_UP`, `LEAGUE_PROMOTED/RELEGATED`, `REWARD_CLAIMED`. `LESSON_*` e `STUDY_SESSION_*` ficam para quando as aulas forem ligadas (regra `xp.lesson_completed` já existe).

### XP (regras em `gamification_rules`, editáveis pelo administrador)

Responder 2 · acerto 8 · difícil +4 · 1ª tentativa correta +3 · inédita +2 · revisar erro +5 · corrigir erro +10 · 10 na sessão +15 · 30 na sessão +30 · flashcard 2 (uma vez por cartão por dia) · consolidado +5 · fila zerada +15 · simulado completo (≥80% respondido) +100 · plano de hoje +25 · todas as missões do dia +50 (+25 moedas). Repetição da mesma questão: 100% · 30% · 10% · 0 (`repeat.multipliers`); os bônus de revisão valem até a 3ª tentativa. Moedas: 1 por acerto válido.

### Antifraude (desde o início)

Por tentativa: `too_fast` (tempo medido < 3 s), `rate_limit` (≥ 30 respostas no último minuto), `repeated_question_farming` (4ª vez da mesma questão). O evento fica gravado com `is_valid = false`, `fraud_reason` e `fraud_score`; não concede XP, não conta nas estatísticas, missões, sequência nem score. Duplicidade: chave única por tentativa; a mesma resposta enviada duas vezes devolve a mesma correção sem novo evento. Resgate de recompensa: 1 a cada 10 s. Ninguém é bloqueado automaticamente; o administrador vê os suspeitos.

### Stazia Score (0–1000, `score_version` 1.0)

40% desempenho (acertos em 90 dias, encolhido para 50% com pouca amostra) · 20% dificuldade média · 15% consistência (dias ativos em 28) · 10% cobertura de temas · 10% evolução (14 dias × 14 anteriores, mínimo 20 questões em cada) · 5% revisão (erros superados). Em **calibração** até 50 questões válidas (não entra no ranking geral); depois disso anda no máximo 40 pontos por recálculo. Recalculado a cada atividade (com folga de 60 s) e à noite para todos os ativos. Níveis: Iniciante 0–299 · Explorador 300–449 · Competidor 450–599 · Avançado 600–699 · Expert 700–799 · Elite 800–899 · Master 900–949 · Lenda 950–1000 (`levels`, com ícone e token de cor).

### Ranking

`gam_board(kind)` ordena e numera só os elegíveis e visíveis; `app_leaderboard` pagina (50) e devolve a posição própria à parte (`app_my_rank`: posição, total, percentil, variação desde a foto da semana, distância para #n-1 e #n-5); `app_leaderboard_near_me` traz a janela ±5. Tipos: geral (score; desempate: precisão, dificuldade, questões, quem chegou primeiro), semana e mês (XP; desempate: acertos, quem entrou primeiro), precisão (≥ 200 questões), evolução (pontos percentuais), questões, sequência. Índices por coluna de ordenação. Com a base atual a consulta é direta; a mesma função pode passar a ler uma tabela materializada quando a escala pedir (a interface não muda).

Privacidade: `gam_board_row` só devolve `public_id` (10 caracteres), nome como o aluno escolheu (abreviado "Ana M." por padrão, `@usuario` ou "Aluno anônimo"), nível, score, XP, precisão e sequência se autorizados. Nunca e-mail, UUID ou dados pessoais. "Oculto" tira o aluno de todos os rankings sem apagar nada. Perfil público: `app_public_profile(public_id)`.

### Sequência diária

O dia conta com 10 questões válidas, 20 minutos reais (soma de `active_ms`) ou 1 missão do dia concluída, no fuso de `profiles.timezone` (padrão America/Sao_Paulo; validado pelo Postgres). Proteção a cada 7 dias (máximo 3), comprável na loja; consumida sozinha quando falta um dia. A rotina diária zera quem passou dois dias sem estudar (ou gasta a proteção).

### Missões

3 por dia, determinísticas: acertar N, estudar 2 áreas e uma terceira pelo perfil (revisar erros se há ≥ 3 pendentes; senão flashcards se existem; senão 10 questões). 5 por semana: 150 questões, 75% de precisão (≥ 50 questões), 4 áreas, 30 erros revistos, 1 simulado. O progresso é recalculado dos fatos (idempotente). A IA não participa.

### Medalhas

21 gerais (volume, precisão, sequência, evolução, Top 10 semanal, 4 secretas: Corujão, 5 da manhã é dia, Sobrevivente, Imparável) + 20 por área (Interno → Residente → Especialista → Mestre em cada grande área). Critérios em JSON (`questions_total`, `accuracy`, `streak`, `area`, `comeback`, `learned`, `day_volume`, `hour_window`, `survivor`, `manual`). Secretas não mostram nome nem critério antes de sair. Raridade é só visual.

### Ligas

Bronze → Prata → Ouro → Platina → Diamante → Elite → Revalida Master. Temporada semanal (segunda a domingo); quem ganha XP entra no primeiro grupo com vaga (30) da sua liga. Fechamento (`ch_worker_gamification_close_week`, idempotente por temporada): posições, top 5 sobem (+50 moedas), 5 últimos descem (só em grupos com ≥ 10), Top 10 ganha a medalha, foto da semana, zera o XP semanal, nova temporada com os ativos (14 dias) em grupos equilibrados por score. Rodar duas vezes não duplica nada.

### Trilha de aprendizado

`app_trail`: para cada grande área, os 12 temas mais cobrados nas provas oficiais, em ordem de incidência. Etapa conclui com 10 questões distintas do tema (ou todas, se houver menos) e fica **dominada** com 80% de acerto (≥ 5 respostas). Estados: bloqueada (a anterior não concluiu), disponível, em andamento, concluída, dominada. O simulado da área (30 questões, 90 min) libera com 70% das etapas. `app_start_trail_node` abre um treino só do tema (inéditas primeiro).

### Rotinas

`GET /api/play/cron` (Vercel Cron, 03:05 UTC = 00:05 em Brasília; fora da Vercel, a cada hora no próprio servidor) → `ch_worker_gamification_daily()`: idempotente por dia (`gamification_jobs`); dificuldade real das questões; sequências quebradas/proteções (no fuso de cada aluno); score dos ativos em 30 dias; foto diária do ranking (histórico e gráfico); 1º do mês fecha o ranking mensal e zera `monthly_xp`; chama o fechamento da semana quando a temporada venceu.

### Realtime

`user_gamification_stats` entra na publicação `supabase_realtime` (só quando ela existe; no PGlite não há). O navegador assina só a própria linha (`user_id=eq.<id>` + RLS) e recarrega o resumo quando ela muda. **Não verificado em produção ainda** (ver pendências).

### Retroativo

Na própria migração: todos os alunos com histórico ganham estatísticas, sequência (recalculada do histórico) e score; **sem XP retroativo** (regra do produto: XP começa no lançamento). O administrador pode recalcular qualquer aluno (`app_admin_gamification_recalculate`), que também reconstrói XP e moedas a partir do ledger.

## 3. Banco (migração 3800)

Tabelas novas (todas com RLS; o aluno só lê o que é dele; escrita só pelo motor): `gamification_rules`, `levels`, `leagues`, `league_seasons`, `league_memberships`, `gamification_preferences`, `user_gamification_stats`, `gamification_events`, `coin_transactions`, `achievements`, `user_achievements`, `missions`, `user_missions`, `rewards`, `user_rewards`, `ranking_snapshots`, `gamification_jobs`, `question_difficulty` (sem política: só o backend). Coluna nova: `profiles.timezone`.

Funções do aluno (`app_*`, revogadas de `anon`): `app_gamification_summary`, `app_gamification_missions`, `app_gamification_achievements`, `app_gamification_rewards`, `app_claim_reward`, `app_gamification_preferences`, `app_gamification_save_preferences`, `app_gamification_history`, `app_leaderboard`, `app_leaderboard_near_me`, `app_my_rank`, `app_public_profile`, `app_league_current`, `app_trail`, `app_start_trail_node`. Administração: `app_admin_gamification`, `app_admin_gamification_save_rule`, `_save_achievement`, `_save_mission`, `_save_reward`, `_user`, `_recalculate`. Serviço: `ch_worker_gamification_daily`, `_close_week`, `_recalculate`, `_backfill`, `ch_worker_tutor_play_context`. Motor (`gam_*`): não executável pelo cliente, exceto leitura de regras/datas e `gam_turn_summary` (SECURITY INVOKER).

Reversão: a migração é aditiva (tabelas, funções, gatilhos e uma coluna). Para desligar sem reverter: `flags.gamification_enabled = false` (os gatilhos saem no primeiro `if`; nada é apagado). Para reverter: `drop` das tabelas e funções listadas acima, dos gatilhos `*_play` e da coluna `profiles.timezone`, e recriar `app_answer_question`, `app_bootstrap`, `app_update_profile` e `practice_pool` da versão anterior.

## 4. Telas

- **Início**: Stazia Score (nível, faixa, percentil) · sequência · meta do dia · "Continuar estudando" (hero existente) · prévia da trilha com a próxima etapa · missões de hoje · ranking semanal (compacto) · liga · conquistas recentes · métricas e temas prioritários que já existiam.
- **Trilha** (`/novo/trilha`): nós grandes com anel de progresso, conexões, estados, simulado da área; coluna com a próxima etapa e "Como funciona".
- **Sessão de questões**: continua uma questão por vez; ao lado do veredito aparece "+17 XP" com detalhe, bônus, moedas e sequência; no topo, o XP da sessão; novo nível e medalhas viram modais curtos (confete só em nível e medalhas épicas/lendárias).
- **Missões** (`/novo/missoes`), **Classificação** (`/novo/classificacao`: ranking com 7 filtros, posição própria, "Ver perto de mim", perfil público, paginação; aba Liga com zonas de promoção/rebaixamento e histórico), **Conquistas** (`/novo/conquistas`: grade por categoria e raridade, secretas; aba Recompensas com moedas).
- **Conta › Meu Stazia Play**: perfil gamificado, gráfico do score (30 dias, 3 e 6 meses, tudo), visibilidade no ranking e campos públicos.
- **Administração › Stazia Play**: métricas (ativos, XP, moedas, missões, medalhas, sequência média, suspeitos por motivo, ligas, top 10, rotinas), regras por grupo, medalhas (criar/editar/ativar), missões e recompensas, auditoria por aluno com o ledger e recálculo.
- Navegação: desktop com "Trilha" no menu e grupo "Stazia Play" (Missões, Classificação, Conquistas); celular com Início · Trilha · **Estudar** (CTA central) · Ranking · Perfil. O Tutor continua no menu lateral e nos botões das telas de estudo.
- Acessibilidade: estado sempre com ícone + texto + cor; `aria-label` nos nós e linhas; `prefers-reduced-motion` já é respeitado pelos tokens base. Mobile-first: uma coluna, listas em vez de tabelas.

## 5. Variáveis de ambiente e configuração manual

- `CRON_SECRET` (já existe para a voz): autentica `/api/play/cron`. Nenhuma variável nova.
- Vercel: a tarefa `/api/play/cron` entra pelo `vercel.json` no deploy (plano Pro permite diária).
- Supabase: **conferir no painel se a tabela `user_gamification_stats` ficou na publicação Realtime** (Database › Replication). A migração só a adiciona quando a publicação existe.
- `profiles.timezone`: o aluno ainda não tem campo na tela para mudar o fuso (padrão Brasília); `app_update_profile({timezone})` já aceita.

## 6. Como testar cada fluxo

- Banco: `npx vitest run src/__tests__/supabasePlayApi.test.ts --maxWorkers=1` (30 casos: XP por tipo, repetição, duplicidade, rápido demais, enxurrada, marcos de sessão, simulado, sequência com fuso e proteção, missões e bônus, medalhas e secretas, score em calibração, ranking com empate/paginação/perto de mim/privacidade, rankings secundários, ligas e fechamento idempotente, trilha, loja, histórico, segurança RLS e funções revogadas, administração, desligar o Play, flashcards, contexto do Tutor).
- Telas: `npx vitest run src/__tests__/playScreens.test.tsx` (trilha, classificação, missões, conquistas, feedback e textos).
- No navegador: responder uma questão em Questões mostra o "+XP"; 10 questões num treino dão o bônus; a trilha abre em Trilha; a classificação só mostra quem saiu da calibração (50 questões válidas).
- Rotina: `curl -H "Authorization: Bearer $CRON_SECRET" https://staziamed-revalida.vercel.app/api/play/cron` (idempotente por dia).

## 7. Pendências e riscos

- **Realtime não confirmado em produção**: a assinatura foi escrita conforme a API do Supabase, mas não há como testá-la no PGlite; se a tabela não estiver na publicação, as telas continuam funcionando (só sem atualização automática).
- **Escala do ranking**: `gam_board` ordena a tabela inteira de estatísticas (indexada). É adequado para milhares de alunos; acima disso, materializar a numeração na rotina diária e manter a mesma interface.
- **Nomes de temas**: a trilha usa `questions.topic` (texto do catálogo). Temas com grafias diferentes aparecem como etapas diferentes; a taxonomia da Central de Conteúdo pode alimentar a trilha depois.
- **Horas estudadas** somam só `active_ms` das questões (flashcards não medem tempo).
- Não implementados nesta fase (arquitetura pronta): amigos, desafios, feed social (`flags.social_feed_enabled` existe, desligada), aulas (`xp.lesson_completed`), recompensas acadêmicas além de proteção e molduras, campo de fuso na tela da conta, i18n (o app é só pt-BR).
- O `fraud_score` é fixo por motivo (50 ou 80), não um modelo.

## 8. Correção e desempenho (migração `20261003003900_stazia_play_desempenho.sql`)

- **Defeito encontrado depois da publicação**: o simulado grava todas as respostas de uma vez ao finalizar, e a regra de enxurrada (30 respostas por minuto) marcava as seguintes como inválidas, sem XP e fora das estatísticas. Agora o simulado não conta como enxurrada nem entra na conta dos treinos seguintes; o tipo da sessão fica no evento (`session_kind`). Em produção nenhum aluno foi afetado (só havia uma resposta registrada, válida, e nenhum simulado finalizado).
- **Desempenho**: missões, sequência, score e medalhas rodam uma vez por comando (gatilho por comando com tabela de transição), não uma vez por resposta; medalhas calculam cada agregado no máximo uma vez e só se alguma pendente precisar; os fatos do período usam o índice por aluno e horário; o score usa junções em vez de função por linha.
- Medido no banco local (PGlite), aluno com 400 respostas: resposta no treino ~97 ms → ~10 ms; simulado de 100 questões finalizado 9,6 s → 0,13 s; respostas do simulado sem XP 80/100 → 0/100.

## 9. Animação de conquista (pedido de 2026-10-06)

Pedido: usar o estilo do vídeo de referência "Daily streak animation" (React + Motion) quando o aluno tiver uma conquista.
`src/novo/app/play/Celebration.jsx` + `celebration.css`, com a biblioteca `motion` (Framer Motion) que já estava no projeto.

- **Quando aparece**: depois de uma resposta no treino, pelo bloco `play` que o banco devolve, na ordem: sequência do dia
  (`streak_incremented`, uma vez por dia), novo nível (`level_up`) e cada medalha (`achievements_unlocked`). A fila é a mesma de
  antes (`useTurnFeedback` em `PlayFeedback.jsx`), agora com a animação de tela cheia no lugar dos modais curtos (os componentes
  antigos continuam no arquivo).
- **Sequência do vídeo, com as cores e a ilustração do StaziaMed**: o ícone aparece apagado com o número anterior → acende
  (estica e encolhe) → a tela inunda com a cor da conquista a partir do ícone → explode em faíscas com raios girando → o número
  rola (N-1 → N) ou o XP conta → o conteúdo sobe e entram o rótulo e os detalhes → botões. Cores: sequência em laranja
  (`--orange-500`), medalha em âmbar (`--amber-500`), nível na cor do nível. Não há mascote: a chama e a medalha seguem o estilo
  dos ícones ilustrados do app.
- **Semana da sequência**: `app_play_streak_week()` (migração …4800) devolve segunda a domingo com estudou, protegido (proteção
  usada), hoje, perdido ou por vir, lidos dos próprios eventos `STREAK_INCREMENTED` e `STREAK_FREEZE_USED`. Os dias estudados
  marcam um a um e hoje marca por último, em branco.
- **Nível**: o bloco da resposta só traz o código do nível; a tela busca nome, ícone, cor e descrição no `app_gamification_summary`.
- **Acessibilidade**: diálogo com nome ("Sequência de 30 dias!", "Medalha desbloqueada: …"), aviso por leitor de tela, foco em
  "Continuar", Esc fecha, a página atrás não rola. Tocar na tela pula para o fim. Com "reduzir movimento" no sistema, mostra
  direto o estado final.
- **Compartilhar** (só na sequência): usa o compartilhamento do celular; sem ele, copia o texto.
- Testes: `celebration.test.tsx`.
