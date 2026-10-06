-- =============================================================================
-- Stazia Play — gamificação: XP, Stazia Score, sequência diária, missões, medalhas,
-- ligas, moedas, ranking, trilha de aprendizado e antifraude.
--
-- Princípios (valem para tudo aqui):
--  * O cliente NUNCA informa pontos: tudo nasce de triggers nas tabelas de estudo
--    (question_attempts, flashcard_reviews, practice_sessions) ou de funções que
--    conferem os fatos no próprio banco antes de premiar.
--  * gamification_events é o livro-razão (ledger) auditável; os agregados em
--    user_gamification_stats são derivados dele e podem ser recalculados.
--  * Nenhum papel de aluno escreve nas tabelas: só leitura dos próprios dados e do
--    ranking sanitizado (nome abreviado, sem e-mail nem UUID).
--  * Toda regra numérica fica em gamification_rules (editável pelo administrador),
--    nunca espalhada pelo código.
--  * Ligas, missões e sequência respeitam o fuso do aluno (profiles.timezone).
--  * Idempotência: chave única por (aluno, evento, origem) — a mesma tentativa nunca
--    gera XP duas vezes; os fechamentos de semana/mês registram-se em gamification_jobs.
-- =============================================================================

-- ---------------------------------------------------------------- fuso do aluno
alter table public.profiles add column timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) <= 64);

-- ---------------------------------------------------------------- regras (configuração central)
create table public.gamification_rules (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  enabled boolean not null default true,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.gamification_rules enable row level security;
create policy "regras do play: leitura para logados" on public.gamification_rules for select to authenticated using (true);

insert into public.gamification_rules (key, value, description) values
  ('flags.gamification_enabled', 'true', 'Liga o Stazia Play (XP, sequência, ranking).'),
  ('flags.leaderboard_enabled', 'true', 'Mostra a classificação.'),
  ('flags.leagues_enabled', 'true', 'Ligas semanais.'),
  ('flags.coins_enabled', 'true', 'Moedas e loja de recompensas.'),
  ('flags.social_feed_enabled', 'false', 'Feed de conquistas (fase futura).'),
  ('flags.trail_enabled', 'true', 'Trilha de aprendizado.'),
  ('names.score', '"Stazia Score"', 'Nome do índice de desempenho.'),
  ('names.coins', '"Stazia Coins"', 'Nome da moeda virtual.'),
  ('xp.question_answered', '2', 'Responder questão.'),
  ('xp.question_correct', '8', 'Acertar questão.'),
  ('xp.hard_bonus', '4', 'Acertar questão difícil.'),
  ('xp.first_attempt_bonus', '3', 'Primeira tentativa correta.'),
  ('xp.unseen_bonus', '2', 'Questão inédita.'),
  ('xp.review_wrong', '5', 'Revisar questão previamente errada.'),
  ('xp.fix_wrong', '10', 'Corrigir erro anterior.'),
  ('xp.session_10', '15', 'Completar 10 questões numa sessão.'),
  ('xp.session_30', '30', 'Completar 30 questões numa sessão.'),
  ('xp.flashcard_reviewed', '2', 'Revisar um flashcard (uma vez por cartão por dia).'),
  ('xp.flashcard_mastered', '5', 'Consolidar um flashcard (intervalo ≥ 21 dias).'),
  ('xp.spaced_review_done', '15', 'Zerar a fila de flashcards do dia (mínimo de 5 revisões).'),
  ('xp.simulation_completed', '100', 'Simulado completo (≥ 80% das questões respondidas).'),
  ('xp.daily_goal', '25', 'Plano de hoje concluído.'),
  ('xp.daily_missions', '50', 'Todas as missões do dia.'),
  ('xp.lesson_completed', '20', 'Aula concluída (quando as aulas forem ligadas).'),
  ('coins.per_correct', '1', 'Moedas por acerto válido.'),
  ('coins.daily_missions', '25', 'Moedas por completar todas as missões do dia.'),
  ('coins.league_promoted', '50', 'Moedas por subir de liga.'),
  ('repeat.multipliers', '[1, 0.3, 0.1, 0]', 'Fração do XP por tentativa da mesma questão (1ª, 2ª, 3ª, depois).'),
  ('fraud.too_fast_ms', '3000', 'Resposta abaixo disso (com tempo medido) não vale XP.'),
  ('fraud.rate_limit_per_minute', '30', 'Mais respostas que isso em 60 s não valem XP.'),
  ('score.min_questions', '50', 'Questões válidas para o Stazia Score sair da calibração.'),
  ('score.window_days', '90', 'Janela do desempenho no Stazia Score.'),
  ('score.max_step', '40', 'Variação máxima do Stazia Score por recálculo (evita saltos).'),
  ('ranking.accuracy_min_questions', '200', 'Mínimo de questões para o ranking de precisão.'),
  ('ranking.evolution_min_questions', '20', 'Mínimo de questões em cada janela de 14 dias para medir evolução.'),
  ('ranking.page_size', '50', 'Alunos por página.'),
  ('streak.min_questions', '10', 'Questões válidas que contam o dia na sequência.'),
  ('streak.min_minutes', '20', 'Minutos reais de estudo que contam o dia na sequência.'),
  ('streak.freeze_every_days', '7', 'A cada N dias seguidos, uma proteção de sequência.'),
  ('streak.freeze_max', '3', 'Máximo de proteções guardadas.'),
  ('league.group_size', '30', 'Alunos por grupo da liga.'),
  ('league.promote', '5', 'Quantos sobem por grupo.'),
  ('league.relegate', '5', 'Quantos descem por grupo.'),
  ('league.min_group_for_relegation', '10', 'Grupo menor que isso não rebaixa ninguém.'),
  ('league.active_days', '14', 'Só entra na liga quem estudou nos últimos N dias.'),
  ('missions.daily_correct', '15', 'Missão do dia: acertos.'),
  ('missions.daily_areas', '2', 'Missão do dia: áreas diferentes.'),
  ('missions.daily_review', '5', 'Missão do dia: questões erradas revistas.'),
  ('missions.daily_flashcards', '20', 'Missão do dia: flashcards.'),
  ('missions.daily_questions', '10', 'Missão do dia (sem erros nem flashcards): questões.'),
  ('missions.weekly_questions', '150', 'Missão da semana: questões.'),
  ('missions.weekly_accuracy', '75', 'Missão da semana: precisão mínima (%).'),
  ('missions.weekly_accuracy_min_questions', '50', 'Questões necessárias para a missão de precisão.'),
  ('missions.weekly_areas', '4', 'Missão da semana: áreas diferentes.'),
  ('missions.weekly_review', '30', 'Missão da semana: erros revistos.'),
  ('missions.weekly_simulados', '1', 'Missão da semana: simulados completos.'),
  ('trail.topics_per_area', '12', 'Temas por área na trilha (os mais cobrados).'),
  ('trail.node_goal', '10', 'Questões por tema para concluir a etapa.'),
  ('trail.mastery_accuracy', '80', 'Precisão (%) para dominar a etapa.'),
  ('trail.simulado_unlock_pct', '70', 'Etapas concluídas (%) para liberar o simulado da área.');

create function public.gam_rule(p_key text) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select r.value from public.gamification_rules r where r.key = p_key and r.enabled $$;

create function public.gam_num(p_key text, p_default numeric default 0) returns numeric
  language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(public.gam_rule(p_key) #>> '{}', '')::numeric, p_default) $$;

create function public.gam_flag(p_key text) returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce((public.gam_rule(p_key) #>> '{}')::boolean, false) $$;

create function public.gam_text(p_key text, p_default text) returns text
  language sql stable security definer set search_path = ''
as $$ select coalesce(public.gam_rule(p_key) #>> '{}', p_default) $$;

-- ---------------------------------------------------------------- fuso e datas
create function public.gam_tz(p_user uuid) returns text
  language sql stable security definer set search_path = ''
as $$ select coalesce((select p.timezone from public.profiles p where p.id = p_user), 'America/Sao_Paulo') $$;

create function public.gam_today(p_user uuid) returns date
  language sql stable security definer set search_path = ''
as $$ select (now() at time zone public.gam_tz(p_user))::date $$;

-- Segunda-feira da semana do dia dado.
create function public.gam_week_start(p_day date) returns date
  language sql immutable set search_path = ''
as $$ select p_day - (extract(isodow from p_day)::int - 1) $$;

-- ---------------------------------------------------------------- níveis
create table public.levels (
  slug text primary key,
  name text not null,
  min_score integer not null,
  max_score integer not null,
  position smallint not null,
  icon text not null,
  color_token text not null,
  description text not null
);
alter table public.levels enable row level security;
create policy "níveis: leitura para logados" on public.levels for select to authenticated using (true);
insert into public.levels (slug, name, min_score, max_score, position, icon, color_token, description) values
  ('iniciante', 'Iniciante', 0, 299, 1, 'sprout', '--level-1', 'Começando a jornada.'),
  ('explorador', 'Explorador', 300, 449, 2, 'compass', '--level-2', 'Explorando as cinco grandes áreas.'),
  ('competidor', 'Competidor', 450, 599, 3, 'flag', '--level-3', 'Já disputa com consistência.'),
  ('avancado', 'Avançado', 600, 699, 4, 'trending-up', '--level-4', 'Desempenho acima da média.'),
  ('expert', 'Expert', 700, 799, 5, 'award', '--level-5', 'Domínio sólido dos temas.'),
  ('elite', 'Elite', 800, 899, 6, 'gem', '--level-6', 'Entre os melhores.'),
  ('master', 'Master', 900, 949, 7, 'crown', '--level-7', 'Nível de banca.'),
  ('lenda', 'Lenda', 950, 1000, 8, 'trophy', '--level-8', 'O topo do Stazia Play.');

create function public.gam_level_for(p_score integer) returns text
  language sql stable security definer set search_path = ''
as $$
  select l.slug from public.levels l where coalesce(p_score, 0) between l.min_score and l.max_score
  union all select 'iniciante' limit 1
$$;

-- ---------------------------------------------------------------- ligas
create table public.leagues (
  slug text primary key,
  name text not null,
  position smallint not null unique,
  icon text not null,
  color_token text not null
);
alter table public.leagues enable row level security;
create policy "ligas: leitura para logados" on public.leagues for select to authenticated using (true);
insert into public.leagues (slug, name, position, icon, color_token) values
  ('bronze', 'Bronze', 1, 'medal', '--league-bronze'),
  ('prata', 'Prata', 2, 'medal', '--league-prata'),
  ('ouro', 'Ouro', 3, 'medal', '--league-ouro'),
  ('platina', 'Platina', 4, 'gem', '--league-platina'),
  ('diamante', 'Diamante', 5, 'gem', '--league-diamante'),
  ('elite', 'Elite', 6, 'crown', '--league-elite'),
  ('revalida_master', 'Revalida Master', 7, 'trophy', '--league-master');

create table public.league_seasons (
  id bigint generated always as identity primary key,
  starts_on date not null unique,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.league_seasons enable row level security;
create policy "temporadas: leitura para logados" on public.league_seasons for select to authenticated using (true);

create table public.league_memberships (
  season_id bigint not null references public.league_seasons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  league_slug text not null references public.leagues (slug),
  group_no integer not null,
  weekly_xp integer not null default 0,
  position integer,
  outcome text check (outcome in ('promoted', 'stayed', 'relegated')),
  joined_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index league_memberships_group_idx on public.league_memberships (season_id, league_slug, group_no, weekly_xp desc);
alter table public.league_memberships enable row level security;
create policy "liga: ler a própria inscrição" on public.league_memberships
  for select to authenticated using (user_id = (select auth.uid()));
-- O grupo inteiro sai sanitizado por app_league_current().

-- ---------------------------------------------------------------- preferências e identidade pública
create table public.gamification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_id text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  leaderboard_visibility text not null default 'abbreviated'
    check (leaderboard_visibility in ('abbreviated', 'username', 'anonymous', 'hidden')),
  username text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  show_avatar boolean not null default true,
  show_accuracy boolean not null default true,
  show_streak boolean not null default true,
  show_achievements boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gamification_preferences enable row level security;
create policy "preferências do play: ler as próprias" on public.gamification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create trigger gamification_preferences_touch before update on public.gamification_preferences
  for each row execute function public.touch_updated_at();

-- Nome como aparece no ranking: "João M." (padrão), @usuario ou "Aluno anônimo".
create function public.gam_display_name(p_user uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case g.leaderboard_visibility
    when 'username' then coalesce('@' || g.username, 'Aluno')
    when 'anonymous' then 'Aluno anônimo'
    else coalesce(nullif(
      initcap(split_part(btrim(p.name), ' ', 1)) ||
      case when split_part(btrim(p.name), ' ', 2) <> '' then ' ' || upper(left(split_part(btrim(p.name), ' ', 2), 1)) || '.' else '' end, ''), 'Aluno')
  end
  from public.gamification_preferences g
  left join public.profiles p on p.id = g.user_id
  where g.user_id = p_user
$$;

-- ---------------------------------------------------------------- estatísticas consolidadas
create table public.user_gamification_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp integer not null default 0,
  weekly_xp integer not null default 0,
  monthly_xp integer not null default 0,
  coins integer not null default 0,
  questions_answered integer not null default 0,
  correct_answers integer not null default 0,
  wrong_answers integer not null default 0,
  accuracy numeric(5, 2) not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_qualified_date date,
  streak_freezes integer not null default 0,
  current_level text not null default 'iniciante' references public.levels (slug),
  current_league text references public.leagues (slug),
  stazia_score integer not null default 0 check (stazia_score between 0 and 1000),
  provisional boolean not null default true,
  score_version text not null default '1.0',
  score_components jsonb not null default '{}'::jsonb,
  score_updated_at timestamptz,
  score_reached_at timestamptz,
  evolution_pts numeric(5, 1),
  avg_difficulty numeric(4, 3) not null default 0.5,
  active_days_28 integer not null default 0,
  last_qualified_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ugs_score_idx on public.user_gamification_stats (stazia_score desc, accuracy desc, avg_difficulty desc, questions_answered desc, score_reached_at) where not provisional;
create index ugs_weekly_idx on public.user_gamification_stats (weekly_xp desc, correct_answers desc);
create index ugs_monthly_idx on public.user_gamification_stats (monthly_xp desc, correct_answers desc);
create index ugs_accuracy_idx on public.user_gamification_stats (accuracy desc, questions_answered desc);
create index ugs_questions_idx on public.user_gamification_stats (questions_answered desc);
create index ugs_streak_idx on public.user_gamification_stats (current_streak desc, longest_streak desc);
create index ugs_evolution_idx on public.user_gamification_stats (evolution_pts desc) where evolution_pts is not null;
alter table public.user_gamification_stats enable row level security;
create policy "play: ler as próprias estatísticas" on public.user_gamification_stats
  for select to authenticated using (user_id = (select auth.uid()));
create trigger user_gamification_stats_touch before update on public.user_gamification_stats
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- livro-razão de eventos
create table public.gamification_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  source_type text not null,
  source_id text not null,
  xp_awarded integer not null default 0,
  coins_awarded integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  is_valid boolean not null default true,
  fraud_score smallint not null default 0 check (fraud_score between 0 and 100),
  fraud_reason text check (fraud_reason in ('too_fast', 'duplicate_event', 'invalid_attempt', 'rate_limit', 'repeated_question_farming')),
  created_at timestamptz not null default now(),
  unique (user_id, event_type, source_type, source_id)
);
create index gamification_events_user_idx on public.gamification_events (user_id, created_at desc);
create index gamification_events_created_idx on public.gamification_events (created_at desc);
create index gamification_events_attempt_idx on public.gamification_events (user_id, source_id) where source_type = 'question_attempt';
alter table public.gamification_events enable row level security;
create policy "play: ler os próprios eventos" on public.gamification_events
  for select to authenticated using (user_id = (select auth.uid()));

create table public.coin_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount <> 0),
  type text not null check (type in ('earn', 'spend', 'adjust')),
  source_type text not null,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index coin_transactions_user_idx on public.coin_transactions (user_id, created_at desc);
alter table public.coin_transactions enable row level security;
create policy "moedas: ler as próprias" on public.coin_transactions
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- medalhas
create table public.achievements (
  slug text primary key check (slug ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null,
  category text not null check (category in ('estudo', 'precisao', 'streak', 'areas', 'evolucao', 'especiais')),
  icon text not null default 'award',
  rarity text not null default 'comum' check (rarity in ('comum', 'rara', 'epica', 'lendaria')),
  criteria jsonb not null,
  xp_reward integer not null default 0,
  coins_reward integer not null default 0,
  is_secret boolean not null default false,
  is_active boolean not null default true,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.achievements enable row level security;
create policy "medalhas: leitura para logados" on public.achievements for select to authenticated using (is_active and not is_secret);
-- As secretas saem por app_gamification_achievements() só depois de desbloqueadas.

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_slug text not null references public.achievements (slug) on delete cascade,
  unlocked_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, achievement_slug)
);
alter table public.user_achievements enable row level security;
create policy "medalhas: ler as próprias" on public.user_achievements
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.achievements (slug, name, description, category, icon, rarity, criteria, xp_reward, coins_reward, is_secret, position) values
  ('primeiros_passos', 'Primeiros Passos', '10 questões respondidas.', 'estudo', 'footprints', 'comum', '{"type":"questions_total","n":10}', 10, 5, false, 1),
  ('aquecendo_motores', 'Aquecendo os Motores', '100 questões respondidas.', 'estudo', 'flame', 'comum', '{"type":"questions_total","n":100}', 30, 15, false, 2),
  ('maquina_de_questoes', 'Máquina de Questões', '1.000 questões respondidas.', 'estudo', 'cog', 'rara', '{"type":"questions_total","n":1000}', 100, 50, false, 3),
  ('insano', 'Insano', '5.000 questões respondidas.', 'estudo', 'zap', 'epica', '{"type":"questions_total","n":5000}', 300, 150, false, 4),
  ('mira_boa', 'Mira Boa', '80% de acerto em pelo menos 50 questões.', 'precisao', 'target', 'comum', '{"type":"accuracy","min_questions":50,"pct":80}', 30, 15, false, 10),
  ('atirador_de_elite', 'Atirador de Elite', '90% de acerto em pelo menos 100 questões.', 'precisao', 'crosshair', 'rara', '{"type":"accuracy","min_questions":100,"pct":90}', 80, 40, false, 11),
  ('quase_banca', 'Quase Banca do INEP', '95% de acerto em pelo menos 200 questões.', 'precisao', 'graduation-cap', 'lendaria', '{"type":"accuracy","min_questions":200,"pct":95}', 200, 100, false, 12),
  ('streak_3', '3 dias seguidos', 'Sequência de 3 dias.', 'streak', 'flame', 'comum', '{"type":"streak","days":3}', 10, 5, false, 20),
  ('streak_7', '7 dias seguidos', 'Sequência de 7 dias.', 'streak', 'flame', 'comum', '{"type":"streak","days":7}', 25, 10, false, 21),
  ('streak_15', '15 dias seguidos', 'Sequência de 15 dias.', 'streak', 'flame', 'rara', '{"type":"streak","days":15}', 50, 25, false, 22),
  ('streak_30', '30 dias seguidos', 'Sequência de 30 dias.', 'streak', 'flame', 'rara', '{"type":"streak","days":30}', 100, 50, false, 23),
  ('streak_60', '60 dias seguidos', 'Sequência de 60 dias.', 'streak', 'flame', 'epica', '{"type":"streak","days":60}', 200, 100, false, 24),
  ('streak_100', '100 dias seguidos', 'Sequência de 100 dias.', 'streak', 'flame', 'epica', '{"type":"streak","days":100}', 300, 150, false, 25),
  ('streak_365', 'Um ano inteiro', 'Sequência de 365 dias.', 'streak', 'flame', 'lendaria', '{"type":"streak","days":365}', 1000, 500, false, 26),
  ('virada_de_jogo', 'Virada de Jogo', 'Melhorou a precisão em 10 pontos ou mais entre uma quinzena e a seguinte.', 'evolucao', 'trending-up', 'rara', '{"type":"comeback","pts":10}', 60, 30, false, 30),
  ('aprendeu_mesmo', 'Aprendeu Mesmo', 'Superou 20 questões que tinha errado.', 'evolucao', 'brain', 'rara', '{"type":"learned","n":20}', 60, 30, false, 31),
  ('top_10_semanal', 'Top 10 semanal', 'Terminou a semana entre os 10 primeiros do seu grupo da liga.', 'especiais', 'trophy', 'rara', '{"type":"manual"}', 50, 25, false, 40),
  ('corujao', 'Corujão', 'Estudou de madrugada, entre meia-noite e 4h.', 'especiais', 'moon', 'rara', '{"type":"hour_window","from":0,"to":4}', 20, 10, true, 50),
  ('cinco_da_manha', '5 da manhã é dia', 'Estudou antes das 6 da manhã.', 'especiais', 'sunrise', 'rara', '{"type":"hour_window","from":4,"to":6}', 20, 10, true, 51),
  ('sobrevivente', 'Sobrevivente', 'Errou 5 seguidas e depois acertou 5 seguidas.', 'especiais', 'heart-pulse', 'epica', '{"type":"survivor"}', 40, 20, true, 52),
  ('imparavel', 'Imparável', '100 questões válidas em um só dia.', 'especiais', 'rocket', 'epica', '{"type":"day_volume","n":100}', 100, 50, true, 53);

-- Conquistas por área: Interno → Residente → Especialista → Mestre.
insert into public.achievements (slug, name, description, category, icon, rarity, criteria, xp_reward, coins_reward, position)
select lower(a.area::text) || '_' || t.tier,
       t.title || ' em ' || public.area_label(a.area),
       format('%s questões de %s com %s%% de acerto%s.', t.q, public.area_label(a.area), t.acc,
              case when t.cov > 0 then format(' e %s%% dos temas estudados', t.cov) else '' end),
       'areas', 'stethoscope', t.rarity,
       jsonb_build_object('type', 'area', 'area', a.area::text, 'questions', t.q, 'accuracy', t.acc, 'coverage', t.cov),
       t.xp, t.xp / 2, 60 + t.pos
from unnest(enum_range(null::public.med_area)) as a (area)
cross join (values
  ('interno', 'Interno', 50, 60, 0, 'comum', 20, 1),
  ('residente', 'Residente', 150, 70, 0, 'comum', 40, 2),
  ('especialista', 'Especialista', 300, 80, 50, 'rara', 80, 3),
  ('mestre', 'Mestre', 500, 85, 70, 'epica', 200, 4)
) as t (tier, title, q, acc, cov, rarity, xp, pos);

-- ---------------------------------------------------------------- missões
create table public.missions (
  slug text primary key check (slug ~ '^[a-z0-9_]+$'),
  period text not null check (period in ('daily', 'weekly')),
  kind text not null check (kind in ('correct', 'questions', 'areas', 'review', 'flashcards', 'simulados', 'accuracy')),
  title text not null,
  icon text not null default 'target',
  target_rule text,          -- chave em gamification_rules com o alvo padrão
  target_default integer not null default 10,
  xp_reward integer not null default 0,
  coins_reward integer not null default 0,
  active boolean not null default true,
  position smallint not null default 0,
  params jsonb not null default '{}'::jsonb
);
alter table public.missions enable row level security;
create policy "missões: leitura para logados" on public.missions for select to authenticated using (true);
insert into public.missions (slug, period, kind, title, icon, target_rule, target_default, xp_reward, coins_reward, position, params) values
  ('daily_correct', 'daily', 'correct', 'Acerte %s questões', 'target', 'missions.daily_correct', 15, 15, 5, 1, '{}'),
  ('daily_areas', 'daily', 'areas', 'Estude %s áreas diferentes', 'layers', 'missions.daily_areas', 2, 10, 5, 2, '{}'),
  ('daily_review', 'daily', 'review', 'Revise %s questões erradas', 'notebook-pen', 'missions.daily_review', 5, 15, 5, 3, '{"alternative": true}'),
  ('daily_flashcards', 'daily', 'flashcards', 'Faça %s flashcards', 'layers', 'missions.daily_flashcards', 20, 10, 5, 4, '{"alternative": true}'),
  ('daily_questions', 'daily', 'questions', 'Responda %s questões', 'file-question', 'missions.daily_questions', 10, 10, 5, 5, '{"alternative": true}'),
  ('weekly_questions', 'weekly', 'questions', 'Responda %s questões na semana', 'file-question', 'missions.weekly_questions', 150, 60, 20, 1, '{}'),
  ('weekly_accuracy', 'weekly', 'accuracy', 'Mantenha %s%% de precisão na semana', 'target', 'missions.weekly_accuracy', 75, 60, 20, 2, '{"min_questions_rule": "missions.weekly_accuracy_min_questions"}'),
  ('weekly_areas', 'weekly', 'areas', 'Estude %s áreas diferentes', 'layers', 'missions.weekly_areas', 4, 30, 10, 3, '{}'),
  ('weekly_review', 'weekly', 'review', 'Revise %s erros', 'notebook-pen', 'missions.weekly_review', 30, 40, 15, 4, '{}'),
  ('weekly_simulado', 'weekly', 'simulados', 'Complete %s simulado', 'timer', 'missions.weekly_simulados', 1, 50, 20, 5, '{}');

create table public.user_missions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_slug text not null references public.missions (slug) on delete cascade,
  period text not null check (period in ('daily', 'weekly')),
  period_start date not null,
  target integer not null,
  progress integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, mission_slug, period_start)
);
create index user_missions_user_idx on public.user_missions (user_id, period, period_start desc);
alter table public.user_missions enable row level security;
create policy "missões: ler as próprias" on public.user_missions
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- recompensas
create table public.rewards (
  slug text primary key check (slug ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null,
  kind text not null check (kind in ('streak_freeze', 'avatar', 'frame', 'badge', 'theme', 'mini_simulado', 'special_questions', 'academic', 'temporary')),
  cost_coins integer not null check (cost_coins >= 0),
  icon text not null default 'gift',
  active boolean not null default true,
  position smallint not null default 0,
  payload jsonb not null default '{}'::jsonb
);
alter table public.rewards enable row level security;
create policy "recompensas: leitura para logados" on public.rewards for select to authenticated using (active);
insert into public.rewards (slug, name, description, kind, cost_coins, icon, position, payload) values
  ('streak_freeze', 'Proteção de sequência', 'Protege a sequência por um dia sem estudo. Máximo de 3 guardadas.', 'streak_freeze', 60, 'snowflake', 1, '{}'),
  ('frame_teal', 'Moldura Teal', 'Moldura colorida no seu avatar da classificação.', 'frame', 120, 'circle', 2, '{"frame": "teal"}'),
  ('frame_gold', 'Moldura Dourada', 'Moldura dourada no seu avatar da classificação.', 'frame', 300, 'circle', 3, '{"frame": "gold"}');

create table public.user_rewards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reward_slug text not null references public.rewards (slug),
  claimed_at timestamptz not null default now(),
  consumed_at timestamptz,
  source text not null default 'store' check (source in ('store', 'milestone', 'admin')),
  active boolean not null default true
);
create index user_rewards_user_idx on public.user_rewards (user_id, claimed_at desc);
alter table public.user_rewards enable row level security;
create policy "recompensas: ler as próprias" on public.user_rewards
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- histórico e execuções
create table public.ranking_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_type text not null check (period_type in ('day', 'week', 'month')),
  period_start date not null,
  period_end date not null,
  rank integer,
  total integer,
  stazia_score integer not null,
  xp integer not null,
  accuracy numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);
create index ranking_snapshots_user_idx on public.ranking_snapshots (user_id, period_type, period_start desc);
alter table public.ranking_snapshots enable row level security;
create policy "histórico: ler o próprio" on public.ranking_snapshots
  for select to authenticated using (user_id = (select auth.uid()));

create table public.gamification_jobs (
  id bigint generated always as identity primary key,
  job text not null,
  period_key text not null,
  ran_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb,
  unique (job, period_key)
);
alter table public.gamification_jobs enable row level security;
create policy "execuções do play: só administradores" on public.gamification_jobs
  for select to authenticated using (public.is_admin());

-- Dificuldade real de cada questão (acurácia global), atualizada pela rotina diária. Só o backend lê.
create table public.question_difficulty (
  question_id text primary key references public.questions (id) on delete cascade,
  attempts integer not null default 0,
  correct integer not null default 0,
  difficulty numeric(4, 3) not null default 0.5,
  updated_at timestamptz not null default now()
);
alter table public.question_difficulty enable row level security;

create function public.gam_difficulty(p_question_id text) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select d.difficulty from public.question_difficulty d where d.question_id = p_question_id and d.attempts >= 20),
    (select case upper(x.difficulty_estimate) when 'HIGH' then 0.75 when 'LOW' then 0.3 else 0.5 end
     from public.question_dna x where x.question_id = p_question_id),
    0.5)
$$;

-- =============================================================================
-- MOTOR: fatos do aluno, concessão de XP, sequência, missões, score, medalhas.
-- Todas SECURITY DEFINER e não executáveis pelo cliente (revogadas no fim).
-- =============================================================================

create function public.gam_ensure(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_gamification_stats (user_id) values (p_user) on conflict do nothing;
  insert into public.gamification_preferences (user_id) values (p_user) on conflict do nothing;
end
$$;

-- Tentativas que o antifraude invalidou (não contam em nada).
create function public.gam_invalid_attempt(p_user uuid, p_attempt uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.gamification_events e
                 where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text and not e.is_valid)
$$;

-- O que o aluno fez num intervalo de dias (no fuso dele): só o válido.
create function public.gam_facts(p_user uuid, p_from date, p_to date) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with tz as (select public.gam_tz(p_user) as z),
  a as (
    select a.id, a.question_id, a.is_correct, coalesce(a.active_ms, 0) as ms, q.area, q.topic,
           (a.answered_at at time zone (select z from tz))::date as day, a.session_id, a.seq,
           exists (select 1 from public.question_attempts b
                   where b.user_id = a.user_id and b.question_id = a.question_id and b.seq < a.seq and not b.is_correct) as was_wrong
    from public.question_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = p_user and q.status <> 'annulled'
      and (a.answered_at at time zone (select z from tz))::date between p_from and p_to
      and not public.gam_invalid_attempt(p_user, a.id)
  )
  select jsonb_build_object(
    'questions', (select count(*)::int from a),
    'correct', (select count(*) filter (where is_correct)::int from a),
    'minutes', (select (coalesce(sum(ms), 0) / 60000)::int from a),
    'areas', (select count(distinct area)::int from a),
    'areas_list', (select coalesce(jsonb_agg(distinct area), '[]'::jsonb) from a),
    'review', (select count(*) filter (where was_wrong)::int from a),
    'fixed', (select count(*) filter (where was_wrong and is_correct)::int from a),
    'flashcards', (select count(*)::int from public.flashcard_reviews r
                   where r.user_id = p_user and (r.reviewed_at at time zone (select z from tz))::date between p_from and p_to),
    'simulados', (select count(*)::int from public.gamification_events e
                  where e.user_id = p_user and e.event_type = 'SIMULATION_COMPLETED'
                    and (e.created_at at time zone (select z from tz))::date between p_from and p_to),
    'active_days', (select count(distinct day)::int from a)
  )
$$;

-- Concede um evento (idempotente pela chave única). Devolve o id ou nulo se já existia.
create function public.gam_award(
  p_user uuid, p_type text, p_source_type text, p_source_id text,
  p_xp integer, p_coins integer, p_meta jsonb default '{}'::jsonb, p_valid boolean default true, p_reason text default null
) returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_xp constant integer := case when p_valid then greatest(coalesce(p_xp, 0), 0) else 0 end;
  v_coins constant integer := case when p_valid and public.gam_flag('flags.coins_enabled') then greatest(coalesce(p_coins, 0), 0) else 0 end;
begin
  perform public.gam_ensure(p_user);
  insert into public.gamification_events (user_id, event_type, source_type, source_id, xp_awarded, coins_awarded, metadata, is_valid, fraud_reason, fraud_score)
  values (p_user, p_type, p_source_type, p_source_id, v_xp, v_coins, coalesce(p_meta, '{}'::jsonb), p_valid, p_reason,
          case when p_valid then 0 when p_reason = 'rate_limit' then 80 else 50 end)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  if v_xp > 0 or v_coins > 0 then
    update public.user_gamification_stats s
      set total_xp = s.total_xp + v_xp, weekly_xp = s.weekly_xp + v_xp, monthly_xp = s.monthly_xp + v_xp, coins = s.coins + v_coins
      where s.user_id = p_user;
    if v_coins > 0 then
      insert into public.coin_transactions (user_id, amount, type, source_type, source_id, metadata)
      values (p_user, v_coins, 'earn', p_type, p_source_id, jsonb_build_object('event_id', v_id));
    end if;
    if v_xp > 0 and public.gam_flag('flags.leagues_enabled') then
      perform public.gam_join_league(p_user);
      update public.league_memberships m set weekly_xp = m.weekly_xp + v_xp
        from public.league_seasons se where se.id = m.season_id and se.status = 'open' and m.user_id = p_user;
    end if;
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------- ligas: temporada e inscrição
create function public.gam_open_season() returns public.league_seasons
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.league_seasons;
  v_start constant date := public.gam_week_start(public.today_br());
begin
  select * into s from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  if found then return s; end if;
  insert into public.league_seasons (starts_on, ends_on) values (v_start, v_start + 6)
  on conflict (starts_on) do update set status = 'open', closed_at = null
  returning * into s;
  return s;
end
$$;

-- Entra na temporada aberta (liga atual ou Bronze), no primeiro grupo com vaga. Determinístico.
create function public.gam_join_league(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.league_seasons;
  v_league text;
  v_group integer;
  v_size constant integer := greatest(public.gam_num('league.group_size', 30)::int, 2);
begin
  s := public.gam_open_season();
  if exists (select 1 from public.league_memberships m where m.season_id = s.id and m.user_id = p_user) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('gam:league:' || s.id::text, 0));
  v_league := coalesce((select st.current_league from public.user_gamification_stats st where st.user_id = p_user), 'bronze');
  select g.group_no into v_group
  from (select m.group_no, count(*) as n from public.league_memberships m
        where m.season_id = s.id and m.league_slug = v_league group by m.group_no) g
  where g.n < v_size order by g.group_no limit 1;
  if v_group is null then
    select coalesce(max(m.group_no), 0) + 1 into v_group from public.league_memberships m where m.season_id = s.id and m.league_slug = v_league;
  end if;
  insert into public.league_memberships (season_id, user_id, league_slug, group_no) values (s.id, p_user, v_league, v_group)
  on conflict do nothing;
  update public.user_gamification_stats set current_league = v_league where user_id = p_user and current_league is null;
end
$$;

-- ---------------------------------------------------------------- sequência diária
create function public.gam_check_streak(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  st public.user_gamification_stats;
  v_today constant date := public.gam_today(p_user);
  f jsonb;
  v_ok boolean;
  v_streak integer;
  v_every constant integer := greatest(public.gam_num('streak.freeze_every_days', 7)::int, 1);
  v_max constant integer := public.gam_num('streak.freeze_max', 3)::int;
begin
  select * into st from public.user_gamification_stats where user_id = p_user for update;
  if not found or st.last_qualified_date = v_today then return; end if;
  f := public.gam_facts(p_user, v_today, v_today);
  v_ok := (f ->> 'questions')::int >= public.gam_num('streak.min_questions', 10)
       or (f ->> 'minutes')::int >= public.gam_num('streak.min_minutes', 20)
       or exists (select 1 from public.user_missions m where m.user_id = p_user and m.period = 'daily' and m.period_start = v_today and m.completed_at is not null);
  if not v_ok then return; end if;

  if st.last_qualified_date = v_today - 1 then
    v_streak := st.current_streak + 1;
  elsif st.last_qualified_date = v_today - 2 and st.streak_freezes > 0 then
    v_streak := st.current_streak + 1;
    update public.user_gamification_stats set streak_freezes = streak_freezes - 1 where user_id = p_user;
    perform public.gam_award(p_user, 'STREAK_FREEZE_USED', 'day', (v_today - 1)::text, 0, 0, jsonb_build_object('streak', v_streak));
  else
    v_streak := 1;
  end if;
  update public.user_gamification_stats
    set current_streak = v_streak, longest_streak = greatest(longest_streak, v_streak), last_qualified_date = v_today
    where user_id = p_user;
  perform public.gam_award(p_user, 'STREAK_INCREMENTED', 'day', v_today::text, 0, 0, jsonb_build_object('streak', v_streak));
  if v_streak % v_every = 0 and st.streak_freezes < v_max then
    update public.user_gamification_stats set streak_freezes = least(streak_freezes + 1, v_max) where user_id = p_user;
    perform public.gam_award(p_user, 'STREAK_FREEZE_EARNED', 'streak', v_streak::text, 0, 0, jsonb_build_object('streak', v_streak));
  end if;
end
$$;

-- ---------------------------------------------------------------- missões
-- Gera as missões do dia (3, determinísticas pelo perfil) e da semana, se ainda não existem.
create function public.gam_generate_missions(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_today constant date := public.gam_today(p_user);
  v_week constant date := public.gam_week_start(v_today);
  v_third text;
  v_wrong integer;
  m public.missions;
begin
  if not exists (select 1 from public.user_missions where user_id = p_user and period = 'daily' and period_start = v_today) then
    select count(*)::int into v_wrong from public.my_error_notebook_of(p_user) e where e.status = 'para_revisar';
    v_third := case
      when v_wrong >= 3 then 'daily_review'
      when exists (select 1 from public.flashcards c where (c.owner_id is null and c.published) or c.owner_id = p_user) then 'daily_flashcards'
      else 'daily_questions' end;
    for m in select * from public.missions where active and period = 'daily' and (slug = v_third or not (params ? 'alternative')) order by position loop
      insert into public.user_missions (user_id, mission_slug, period, period_start, target)
      values (p_user, m.slug, 'daily', v_today,
              case when m.slug = 'daily_review' then least(v_wrong, public.gam_num(m.target_rule, m.target_default)::int)
                   else public.gam_num(m.target_rule, m.target_default)::int end)
      on conflict do nothing;
    end loop;
  end if;
  if not exists (select 1 from public.user_missions where user_id = p_user and period = 'weekly' and period_start = v_week) then
    for m in select * from public.missions where active and period = 'weekly' order by position loop
      insert into public.user_missions (user_id, mission_slug, period, period_start, target)
      values (p_user, m.slug, 'weekly', v_week, public.gam_num(m.target_rule, m.target_default)::int)
      on conflict do nothing;
    end loop;
  end if;
end
$$;

-- Caderno de erros de um aluno específico (mesma regra da visão my_error_notebook, para o motor).
create function public.my_error_notebook_of(p_user uuid)
  returns table (question_id text, status text)
  language sql stable security definer set search_path = ''
as $$
  with per_question as (
    select a.question_id,
           count(*) filter (where not a.is_correct)::int as wrong_count,
           (array_agg(a.is_correct order by a.answered_at desc, a.seq desc))[1] as last_correct
    from public.question_attempts a
    where a.user_id = p_user
    group by a.question_id
  )
  select p.question_id, case when p.last_correct then 'superada' else 'para_revisar' end
  from per_question p join public.questions q on q.id = p.question_id
  where p.wrong_count > 0 and q.status <> 'annulled'
$$;

create function public.gam_mission_progress(p_kind text, f jsonb, p_min_questions integer) returns integer
  language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'correct' then (f ->> 'correct')::int
    when 'questions' then (f ->> 'questions')::int
    when 'areas' then (f ->> 'areas')::int
    when 'review' then (f ->> 'review')::int
    when 'flashcards' then (f ->> 'flashcards')::int
    when 'simulados' then (f ->> 'simulados')::int
    when 'accuracy' then case when (f ->> 'questions')::int >= p_min_questions
                              then round(100.0 * (f ->> 'correct')::int / nullif((f ->> 'questions')::int, 0))::int else 0 end
    else 0 end
$$;

-- Recalcula o progresso (a partir dos fatos, idempotente) e premia o que foi concluído.
create function public.gam_update_missions(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_today constant date := public.gam_today(p_user);
  v_week constant date := public.gam_week_start(v_today);
  fd jsonb; fw jsonb;
  um record;
  v_progress integer;
  v_min integer;
begin
  perform public.gam_generate_missions(p_user);
  fd := public.gam_facts(p_user, v_today, v_today);
  fw := public.gam_facts(p_user, v_week, v_week + 6);
  for um in
    select u.id, u.mission_slug, u.period, u.target, u.completed_at, m.kind, m.xp_reward, m.coins_reward, m.params
    from public.user_missions u join public.missions m on m.slug = u.mission_slug
    where u.user_id = p_user and ((u.period = 'daily' and u.period_start = v_today) or (u.period = 'weekly' and u.period_start = v_week))
  loop
    v_min := case when um.params ? 'min_questions_rule' then public.gam_num(um.params ->> 'min_questions_rule', 50)::int else 0 end;
    v_progress := least(public.gam_mission_progress(um.kind, case when um.period = 'daily' then fd else fw end, v_min), um.target);
    if um.completed_at is null then
      update public.user_missions set progress = v_progress, completed_at = case when v_progress >= um.target then now() end where id = um.id;
      if v_progress >= um.target then
        perform public.gam_award(p_user, 'MISSION_COMPLETED', 'mission', um.mission_slug || ':' || case when um.period = 'daily' then v_today else v_week end::text,
                                 um.xp_reward, um.coins_reward, jsonb_build_object('mission', um.mission_slug, 'period', um.period));
      end if;
    end if;
  end loop;
  -- todas as do dia: bônus
  if not exists (select 1 from public.user_missions where user_id = p_user and period = 'daily' and period_start = v_today and completed_at is null)
     and exists (select 1 from public.user_missions where user_id = p_user and period = 'daily' and period_start = v_today) then
    perform public.gam_award(p_user, 'DAILY_MISSIONS_COMPLETED', 'day', v_today::text,
                             public.gam_num('xp.daily_missions', 50)::int, public.gam_num('coins.daily_missions', 25)::int, '{}'::jsonb);
  end if;
end
$$;

-- ---------------------------------------------------------------- Stazia Score (versão 1.0)
-- 40% desempenho · 20% dificuldade · 15% consistência · 10% cobertura · 10% evolução · 5% revisão.
create function public.gam_compute_score(p_user uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tz constant text := public.gam_tz(p_user);
  v_today constant date := (now() at time zone public.gam_tz(p_user))::date;
  v_window constant integer := greatest(public.gam_num('score.window_days', 90)::int, 14);
  v_min_q constant integer := public.gam_num('score.min_questions', 50)::int;
  v_min_evo constant integer := public.gam_num('ranking.evolution_min_questions', 20)::int;
  n int; c int; n_all int; n_rec int; c_rec int; n_prev int; c_prev int;
  perf numeric; diff numeric; diff_c numeric; cons numeric; cov numeric; evo numeric; rev numeric;
  v_days int; v_days_target int; v_topics int; v_topics_total int; v_sup int; v_err int;
  v_evo_pts numeric; v_score int;
begin
  create temp table if not exists pg_temp.gam_tmp_attempts (question_id text, is_correct boolean, day date, topic text, difficulty numeric) on commit drop;
  truncate pg_temp.gam_tmp_attempts;
  insert into pg_temp.gam_tmp_attempts
  select a.question_id, a.is_correct, (a.answered_at at time zone v_tz)::date, q.topic, public.gam_difficulty(a.question_id)
  from public.question_attempts a join public.questions q on q.id = a.question_id
  where a.user_id = p_user and q.status <> 'annulled' and not public.gam_invalid_attempt(p_user, a.id);

  select count(*), count(*) filter (where is_correct) into n, c from pg_temp.gam_tmp_attempts where day > v_today - v_window;
  select count(*) into n_all from pg_temp.gam_tmp_attempts;
  perf := (c + 5.0) / (n + 10.0);                                   -- encolhe para 50% com pouca amostra
  select coalesce(avg(difficulty), 0.5) into diff from pg_temp.gam_tmp_attempts where day > v_today - v_window;
  diff_c := least(greatest((diff - 0.25) / 0.5, 0), 1);
  select count(distinct day) into v_days from pg_temp.gam_tmp_attempts where day > v_today - 28;
  select least(28, greatest(8, coalesce(p.study_days_per_week, 5) * 4)) into v_days_target from public.profiles p where p.id = p_user;
  cons := least(v_days::numeric / coalesce(v_days_target, 20), 1);
  select count(distinct topic) into v_topics from pg_temp.gam_tmp_attempts;
  select count(distinct q.topic) into v_topics_total from public.questions q where q.status <> 'annulled';
  cov := least(v_topics::numeric / greatest(v_topics_total * 0.6, 1), 1);
  select count(*), count(*) filter (where is_correct) into n_rec, c_rec from pg_temp.gam_tmp_attempts where day > v_today - 14;
  select count(*), count(*) filter (where is_correct) into n_prev, c_prev from pg_temp.gam_tmp_attempts where day > v_today - 28 and day <= v_today - 14;
  if n_rec >= v_min_evo and n_prev >= v_min_evo then
    v_evo_pts := round(100.0 * (c_rec::numeric / n_rec - c_prev::numeric / n_prev), 1);
    evo := least(greatest(0.5 + (v_evo_pts / 100) / 0.4, 0), 1);
  else
    v_evo_pts := null; evo := 0.5;
  end if;
  select count(*) filter (where status = 'superada'), count(*) into v_sup, v_err from public.my_error_notebook_of(p_user);
  rev := case when v_err = 0 then 0.5 else v_sup::numeric / v_err end;
  v_score := round(1000 * (0.40 * perf + 0.20 * diff_c + 0.15 * cons + 0.10 * cov + 0.10 * evo + 0.05 * rev))::int;
  return jsonb_build_object(
    'score', least(greatest(v_score, 0), 1000), 'provisional', n_all < v_min_q, 'questions', n_all, 'window_questions', n,
    'evolution_pts', v_evo_pts, 'avg_difficulty', round(diff, 3), 'active_days_28', v_days,
    'components', jsonb_build_object('performance', round(perf, 3), 'difficulty', round(diff_c, 3), 'consistency', round(cons, 3),
                                     'coverage', round(cov, 3), 'evolution', round(evo, 3), 'review', round(rev, 3)));
end
$$;

create function public.gam_refresh_score(p_user uuid, p_force boolean default false) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  st public.user_gamification_stats;
  r jsonb;
  v_new int;
  v_step constant int := public.gam_num('score.max_step', 40)::int;
  v_level text;
begin
  select * into st from public.user_gamification_stats where user_id = p_user for update;
  if not found then return; end if;
  if not p_force and st.score_updated_at is not null and st.score_updated_at > clock_timestamp() - interval '60 seconds' then return; end if;
  r := public.gam_compute_score(p_user);
  v_new := (r ->> 'score')::int;
  -- sem saltos: enquanto não está em calibração, o score anda no máximo max_step por recálculo
  if not st.provisional and not (r ->> 'provisional')::boolean then
    v_new := st.stazia_score + least(greatest(v_new - st.stazia_score, -v_step), v_step);
  end if;
  v_level := public.gam_level_for(v_new);
  update public.user_gamification_stats set
    stazia_score = v_new, provisional = (r ->> 'provisional')::boolean, score_components = r -> 'components',
    score_updated_at = clock_timestamp(), evolution_pts = (r ->> 'evolution_pts')::numeric,
    avg_difficulty = (r ->> 'avg_difficulty')::numeric, active_days_28 = (r ->> 'active_days_28')::int,
    score_reached_at = case when v_new > st.stazia_score then clock_timestamp() else coalesce(st.score_reached_at, clock_timestamp()) end,
    current_level = v_level
    where user_id = p_user;
  if (select l.position from public.levels l where l.slug = v_level) > (select l.position from public.levels l where l.slug = st.current_level)
     and not (r ->> 'provisional')::boolean then
    perform public.gam_award(p_user, 'LEVEL_UP', 'level', v_level, 0, 0, jsonb_build_object('from', st.current_level, 'to', v_level, 'score', v_new));
  end if;
end
$$;

-- ---------------------------------------------------------------- medalhas
create function public.gam_unlock(p_user uuid, p_slug text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  a public.achievements;
begin
  select * into a from public.achievements where slug = p_slug and is_active;
  if not found then return false; end if;
  insert into public.user_achievements (user_id, achievement_slug) values (p_user, p_slug) on conflict do nothing;
  if not found then return false; end if;
  perform public.gam_award(p_user, 'ACHIEVEMENT_UNLOCKED', 'achievement', p_slug, a.xp_reward, a.coins_reward,
                           jsonb_build_object('name', a.name, 'rarity', a.rarity, 'category', a.category));
  return true;
end
$$;

create function public.gam_check_achievements(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  st public.user_gamification_stats;
  a record;
  cr jsonb;
  v_tz constant text := public.gam_tz(p_user);
  v_today constant date := (now() at time zone public.gam_tz(p_user))::date;
  ok boolean;
  n int; c int; cov numeric;
begin
  select * into st from public.user_gamification_stats where user_id = p_user;
  if not found then return; end if;
  for a in
    select x.slug, x.criteria from public.achievements x
    where x.is_active and not exists (select 1 from public.user_achievements u where u.user_id = p_user and u.achievement_slug = x.slug)
    order by x.position
  loop
    cr := a.criteria; ok := false;
    case cr ->> 'type'
      when 'questions_total' then ok := st.questions_answered >= (cr ->> 'n')::int;
      when 'accuracy' then ok := st.questions_answered >= (cr ->> 'min_questions')::int and st.accuracy >= (cr ->> 'pct')::numeric;
      when 'streak' then ok := st.longest_streak >= (cr ->> 'days')::int;
      when 'comeback' then ok := st.evolution_pts is not null and st.evolution_pts >= (cr ->> 'pts')::numeric;
      when 'learned' then ok := (select count(*) from public.my_error_notebook_of(p_user) e where e.status = 'superada') >= (cr ->> 'n')::int;
      when 'day_volume' then ok := (public.gam_facts(p_user, v_today, v_today) ->> 'questions')::int >= (cr ->> 'n')::int;
      when 'hour_window' then
        ok := exists (select 1 from public.question_attempts t where t.user_id = p_user
                      and extract(hour from t.answered_at at time zone v_tz) >= (cr ->> 'from')::int
                      and extract(hour from t.answered_at at time zone v_tz) < (cr ->> 'to')::int
                      and not public.gam_invalid_attempt(p_user, t.id));
      when 'survivor' then
        ok := (select string_agg(case when t.is_correct then 'C' else 'E' end, '' order by t.seq)
               from (select is_correct, seq from public.question_attempts where user_id = p_user order by seq desc limit 10) t) = 'EEEEECCCCC';
      when 'area' then
        select count(*), count(*) filter (where t.is_correct) into n, c
        from public.question_attempts t join public.questions q on q.id = t.question_id
        where t.user_id = p_user and q.area::text = cr ->> 'area' and q.status <> 'annulled' and not public.gam_invalid_attempt(p_user, t.id);
        if n >= (cr ->> 'questions')::int and 100.0 * c / greatest(n, 1) >= (cr ->> 'accuracy')::numeric then
          select 100.0 * count(distinct q.topic) / greatest((select count(distinct q2.topic) from public.questions q2 where q2.area::text = cr ->> 'area' and q2.status <> 'annulled'), 1)
            into cov
          from public.question_attempts t join public.questions q on q.id = t.question_id
          where t.user_id = p_user and q.area::text = cr ->> 'area';
          ok := cov >= (cr ->> 'coverage')::numeric;
        end if;
      else ok := false;
    end case;
    if ok then perform public.gam_unlock(p_user, a.slug); end if;
  end loop;
end
$$;

-- Tudo o que acontece depois de uma atividade válida.
create function public.gam_after_activity(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.gam_update_missions(p_user);
  perform public.gam_check_streak(p_user);
  perform public.gam_refresh_score(p_user, false);
  perform public.gam_check_achievements(p_user);
end
$$;

-- =============================================================================
-- GATILHOS: a atividade real vira evento; o cliente não participa.
-- =============================================================================
create function public.gam_process_attempt() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  q public.questions;
  v_prior integer; v_prev_wrong boolean; v_attempt integer;
  v_mults jsonb; v_mult numeric;
  v_reason text; v_valid boolean;
  v_diff numeric; v_hard boolean;
  b_base int := 0; b_correct int := 0; b_hard int := 0; b_first int := 0; b_unseen int := 0; b_review int := 0; b_fix int := 0;
  v_total int; v_coins int; v_in_session int;
begin
  if not public.gam_flag('flags.gamification_enabled') then return null; end if;
  select * into q from public.questions where id = new.question_id;
  if q.status = 'annulled' then return null; end if;
  perform public.gam_ensure(new.user_id);
  perform pg_advisory_xact_lock(hashtextextended('gam:' || new.user_id::text, 0));

  select count(*)::int into v_prior from public.question_attempts a
    where a.user_id = new.user_id and a.question_id = new.question_id and a.seq < new.seq;
  select not a.is_correct into v_prev_wrong from public.question_attempts a
    where a.user_id = new.user_id and a.question_id = new.question_id and a.seq < new.seq order by a.seq desc limit 1;
  v_prev_wrong := coalesce(v_prev_wrong, false);
  v_attempt := v_prior + 1;
  v_mults := coalesce(public.gam_rule('repeat.multipliers'), '[1, 0.3, 0.1, 0]'::jsonb);
  v_mult := coalesce((v_mults ->> least(v_prior, jsonb_array_length(v_mults) - 1))::numeric, 0);

  -- antifraude: rápido demais, enxurrada, repetição para farmar
  if new.active_ms is not null and new.active_ms > 0 and new.active_ms < public.gam_num('fraud.too_fast_ms', 3000) then
    v_reason := 'too_fast';
  elsif (select count(*) from public.question_attempts a where a.user_id = new.user_id and a.seq < new.seq
         and a.answered_at > clock_timestamp() - interval '60 seconds') >= public.gam_num('fraud.rate_limit_per_minute', 30) then
    v_reason := 'rate_limit';
  elsif v_mult <= 0 then
    v_reason := 'repeated_question_farming';
  end if;
  v_valid := v_reason is null;

  v_diff := public.gam_difficulty(q.id);
  v_hard := v_diff >= 0.6;
  b_base := public.gam_num('xp.question_answered', 2)::int;
  if new.is_correct then b_correct := public.gam_num('xp.question_correct', 8)::int; end if;
  if new.is_correct and v_hard then b_hard := public.gam_num('xp.hard_bonus', 4)::int; end if;
  if new.is_correct and v_attempt = 1 then b_first := public.gam_num('xp.first_attempt_bonus', 3)::int; end if;
  if v_attempt = 1 then b_unseen := public.gam_num('xp.unseen_bonus', 2)::int; end if;
  if v_prev_wrong and v_attempt <= 3 then
    b_review := public.gam_num('xp.review_wrong', 5)::int;
    if new.is_correct then b_fix := public.gam_num('xp.fix_wrong', 10)::int; end if;
  end if;
  v_total := round((b_base + b_correct + b_hard + b_first + b_unseen) * v_mult)::int + b_review + b_fix;
  v_coins := case when new.is_correct then public.gam_num('coins.per_correct', 1)::int else 0 end;

  perform public.gam_award(new.user_id, case when new.is_correct then 'QUESTION_CORRECT' else 'QUESTION_WRONG' end,
    'question_attempt', new.id::text, v_total, v_coins,
    jsonb_build_object('question_id', q.id, 'area', q.area, 'topic', q.topic, 'difficulty', v_diff, 'hard', v_hard,
                       'attempt_number', v_attempt, 'first_attempt', v_attempt = 1, 'previously_wrong', v_prev_wrong,
                       'response_time_ms', new.active_ms, 'session_id', new.session_id, 'multiplier', v_mult,
                       'breakdown', jsonb_strip_nulls(jsonb_build_object('base', nullif(b_base, 0), 'correct', nullif(b_correct, 0), 'difficulty_bonus', nullif(b_hard, 0),
                                                       'first_attempt_bonus', nullif(b_first, 0), 'unseen_bonus', nullif(b_unseen, 0),
                                                       'review_bonus', nullif(b_review, 0), 'fix_bonus', nullif(b_fix, 0)))),
    v_valid, v_reason);

  if v_valid then
    update public.user_gamification_stats s set
      questions_answered = s.questions_answered + 1,
      correct_answers = s.correct_answers + case when new.is_correct then 1 else 0 end,
      wrong_answers = s.wrong_answers + case when new.is_correct then 0 else 1 end,
      accuracy = round(100.0 * (s.correct_answers + case when new.is_correct then 1 else 0 end) / (s.questions_answered + 1), 2),
      last_qualified_activity_at = clock_timestamp()
      where s.user_id = new.user_id;
    if new.session_id is not null then
      select count(*)::int into v_in_session from public.question_attempts a where a.session_id = new.session_id and a.seq <= new.seq;
      if v_in_session = 10 then
        perform public.gam_award(new.user_id, 'SESSION_10', 'practice_session', new.session_id::text, public.gam_num('xp.session_10', 15)::int, 0, '{}'::jsonb);
      elsif v_in_session = 30 then
        perform public.gam_award(new.user_id, 'SESSION_30', 'practice_session', new.session_id::text, public.gam_num('xp.session_30', 30)::int, 0, '{}'::jsonb);
      end if;
    end if;
  end if;
  perform public.gam_after_activity(new.user_id);
  return null;
end
$$;
create trigger question_attempts_play after insert on public.question_attempts
  for each row execute function public.gam_process_attempt();

create function public.gam_process_flashcard_review() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_day constant text := public.gam_today(new.user_id)::text;
  v_state public.flashcard_states;
  v_reviews int;
begin
  if not public.gam_flag('flags.gamification_enabled') then return null; end if;
  perform public.gam_ensure(new.user_id);
  perform pg_advisory_xact_lock(hashtextextended('gam:' || new.user_id::text, 0));
  perform public.gam_award(new.user_id, 'FLASHCARD_REVIEWED', 'flashcard_day', new.card_id::text || ':' || v_day,
    public.gam_num('xp.flashcard_reviewed', 2)::int, 0, jsonb_build_object('rating', new.rating));
  select * into v_state from public.flashcard_states s where s.user_id = new.user_id and s.card_id = new.card_id;
  if found and v_state.state > 0 and v_state.scheduled_days >= public.flashcard_consolidated_days() then
    perform public.gam_award(new.user_id, 'FLASHCARD_MASTERED', 'flashcard', new.card_id::text, public.gam_num('xp.flashcard_mastered', 5)::int, 0, '{}'::jsonb);
  end if;
  -- fila do dia zerada (com pelo menos 5 revisões hoje)
  select count(*)::int into v_reviews from public.flashcard_reviews r
    where r.user_id = new.user_id and (r.reviewed_at at time zone public.gam_tz(new.user_id))::date = v_day::date;
  if v_reviews >= 5 and not exists (select 1 from public.flashcard_states s where s.user_id = new.user_id and s.state > 0 and s.due <= now() and s.card_id <> new.card_id) then
    perform public.gam_award(new.user_id, 'SPACED_REVIEW_DONE', 'day', v_day, public.gam_num('xp.spaced_review_done', 15)::int, 0, jsonb_build_object('reviews', v_reviews));
  end if;
  update public.user_gamification_stats set last_qualified_activity_at = clock_timestamp() where user_id = new.user_id;
  perform public.gam_after_activity(new.user_id);
  return null;
end
$$;
create trigger flashcard_reviews_play after insert on public.flashcard_reviews
  for each row execute function public.gam_process_flashcard_review();

-- Simulado finalizado com pelo menos 80% das questões respondidas.
create function public.gam_process_session_finish() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_answered int;
begin
  if not public.gam_flag('flags.gamification_enabled') or new.kind <> 'simulado' or new.finished_at is null or old.finished_at is not null then return null; end if;
  select count(*)::int into v_answered from public.question_attempts a where a.session_id = new.id;
  if v_answered >= ceil(0.8 * cardinality(new.question_ids)) then
    perform public.gam_ensure(new.user_id);
    perform public.gam_award(new.user_id, 'SIMULATION_COMPLETED', 'practice_session', new.id::text, public.gam_num('xp.simulation_completed', 100)::int, 0,
                             jsonb_build_object('total', cardinality(new.question_ids), 'answered', v_answered));
    perform public.gam_after_activity(new.user_id);
  end if;
  return null;
end
$$;
create trigger practice_sessions_play after update of finished_at on public.practice_sessions
  for each row execute function public.gam_process_session_finish();

-- Plano de hoje concluído (todas as tarefas do dia).
create function public.gam_process_plan_task() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.done_at is null or old.done_at is not null or not public.gam_flag('flags.gamification_enabled') then return null; end if;
  if not exists (select 1 from public.plan_tasks t where t.user_id = new.user_id and t.day = new.day and t.done_at is null) then
    perform public.gam_ensure(new.user_id);
    perform public.gam_award(new.user_id, 'DAILY_GOAL_COMPLETED', 'day', new.day::text, public.gam_num('xp.daily_goal', 25)::int, 0, '{}'::jsonb);
  end if;
  return null;
end
$$;
create trigger plan_tasks_play after update of done_at on public.plan_tasks
  for each row execute function public.gam_process_plan_task();

-- =============================================================================
-- RANKING (sanitizado, paginado, posição própria em consulta separada)
-- =============================================================================
-- Linhas elegíveis a um ranking, já ordenadas e numeradas. Desempates determinísticos:
--  geral: score, precisão, dificuldade média, questões, quem chegou primeiro;
--  semana/mês: XP, acertos, quem entrou primeiro (user_id como último recurso).
create function public.gam_board(p_kind text)
  returns table (user_id uuid, value numeric, rank bigint, total bigint)
  language sql stable security definer set search_path = ''
as $$
  with base as (
    select s.*
    from public.user_gamification_stats s
    join public.gamification_preferences g on g.user_id = s.user_id
    where g.leaderboard_visibility <> 'hidden'
      and case p_kind
        when 'geral' then not s.provisional
        when 'semana' then s.weekly_xp > 0
        when 'mes' then s.monthly_xp > 0
        when 'precisao' then s.questions_answered >= public.gam_num('ranking.accuracy_min_questions', 200)
        when 'evolucao' then s.evolution_pts is not null and not s.provisional
        when 'questoes' then s.questions_answered > 0
        when 'streak' then s.current_streak > 0
        else false end
  )
  select b.user_id,
         case p_kind when 'geral' then b.stazia_score when 'semana' then b.weekly_xp when 'mes' then b.monthly_xp
                     when 'precisao' then b.accuracy when 'evolucao' then b.evolution_pts when 'questoes' then b.questions_answered
                     when 'streak' then b.current_streak end::numeric,
         row_number() over (order by
           case p_kind when 'geral' then b.stazia_score when 'semana' then b.weekly_xp when 'mes' then b.monthly_xp
                       when 'precisao' then b.accuracy when 'evolucao' then b.evolution_pts when 'questoes' then b.questions_answered
                       when 'streak' then b.current_streak end desc,
           case p_kind when 'semana' then b.correct_answers when 'mes' then b.correct_answers else b.accuracy end desc,
           b.avg_difficulty desc, b.questions_answered desc, b.score_reached_at asc nulls last, b.user_id),
         count(*) over ()
  from base b
$$;

-- Uma linha do ranking como o aluno vê: sem e-mail, sem UUID, respeitando as preferências do outro.
create function public.gam_board_row(p_user uuid, p_viewer uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'public_id', g.public_id,
    'name', public.gam_display_name(p_user),
    'avatar', case when g.show_avatar and g.leaderboard_visibility <> 'anonymous' then public.gam_display_name(p_user) end,
    'frame', (select r.payload ->> 'frame' from public.user_rewards ur join public.rewards r on r.slug = ur.reward_slug
              where ur.user_id = p_user and ur.active and r.kind = 'frame' order by r.cost_coins desc limit 1),
    'level', s.current_level,
    'score', case when s.provisional then null else s.stazia_score end,
    'provisional', s.provisional,
    'xp', s.total_xp, 'weekly_xp', s.weekly_xp, 'monthly_xp', s.monthly_xp,
    'questions', s.questions_answered,
    'accuracy', case when g.show_accuracy or p_user = p_viewer then s.accuracy end,
    'streak', case when g.show_streak or p_user = p_viewer then s.current_streak end,
    'evolution_pts', s.evolution_pts,
    'league', s.current_league,
    'is_me', p_user = p_viewer)
  from public.user_gamification_stats s join public.gamification_preferences g on g.user_id = s.user_id
  where s.user_id = p_user
$$;

create function public.app_leaderboard(p_kind text default 'geral', p_offset integer default 0, p_limit integer default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_kind constant text := coalesce(nullif(p_kind, ''), 'geral');
  v_limit constant integer := least(greatest(coalesce(p_limit, public.gam_num('ranking.page_size', 50)::int), 1), 100);
  v_offset constant integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if v_kind not in ('geral', 'semana', 'mes', 'precisao', 'evolucao', 'questoes', 'streak') then
    raise exception 'Ranking inválido.' using errcode = '22023';
  end if;
  if not public.gam_flag('flags.leaderboard_enabled') then
    return jsonb_build_object('enabled', false, 'kind', v_kind, 'rows', '[]'::jsonb, 'total', 0, 'me', null);
  end if;
  return jsonb_build_object(
    'enabled', true, 'kind', v_kind, 'offset', v_offset, 'limit', v_limit,
    'total', coalesce((select b.total from public.gam_board(v_kind) b limit 1), 0),
    'rows', coalesce((select jsonb_agg(public.gam_board_row(b.user_id, v_uid) || jsonb_build_object('rank', b.rank, 'value', b.value) order by b.rank)
                      from (select * from public.gam_board(v_kind) b order by b.rank offset v_offset limit v_limit) b), '[]'::jsonb),
    'me', public.app_my_rank(v_kind));
end
$$;

-- Posição própria (consulta separada e leve), percentil e distância para os próximos.
create function public.app_my_rank(p_kind text default 'geral') returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with me as (select * from public.gam_board(p_kind) b where b.user_id = (select auth.uid())),
  snap as (
    select r.rank as rank_week_start from public.ranking_snapshots r
    where r.user_id = (select auth.uid()) and r.period_type = 'week' and p_kind = 'geral'
    order by r.period_start desc limit 1)
  select case when (select count(*) from me) = 0 then null else jsonb_build_object(
    'rank', (select rank from me), 'total', (select total from me), 'value', (select value from me),
    'percentile', round(100.0 * (select rank from me) / greatest((select total from me), 1), 1),
    'week_change', (select rank_week_start from snap) - (select rank from me),
    'next', (select jsonb_agg(jsonb_build_object('rank', b.rank, 'gap', b.value - (select value from me)) order by b.rank desc)
             from public.gam_board(p_kind) b where b.rank in ((select rank from me) - 1, (select rank from me) - 5) and b.rank >= 1)) end
$$;

create function public.app_leaderboard_near_me(p_kind text default 'geral', p_radius integer default 5) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with me as (select * from public.gam_board(coalesce(p_kind, 'geral')) b where b.user_id = (select auth.uid()))
  select jsonb_build_object(
    'kind', coalesce(p_kind, 'geral'),
    'me', public.app_my_rank(coalesce(p_kind, 'geral')),
    'rows', coalesce((select jsonb_agg(public.gam_board_row(b.user_id, (select auth.uid())) || jsonb_build_object('rank', b.rank, 'value', b.value) order by b.rank)
                      from public.gam_board(coalesce(p_kind, 'geral')) b
                      where b.rank between (select rank from me) - least(greatest(coalesce(p_radius, 5), 1), 25)
                                       and (select rank from me) + least(greatest(coalesce(p_radius, 5), 1), 25)), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

-- Perfil público de outro aluno: só o que ele autorizou.
create function public.app_public_profile(p_public_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.gam_board_row(g.user_id, (select auth.uid())) || jsonb_build_object(
    'rank', (select b.rank from public.gam_board('geral') b where b.user_id = g.user_id),
    'total', (select b.total from public.gam_board('geral') b limit 1),
    'level_info', (select to_jsonb(l) from public.levels l where l.slug = s.current_level),
    'achievements', case when g.show_achievements then coalesce((
       select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon, 'rarity', a.rarity, 'category', a.category, 'unlocked_at', u.unlocked_at) order by u.unlocked_at desc)
       from public.user_achievements u join public.achievements a on a.slug = u.achievement_slug where u.user_id = g.user_id), '[]'::jsonb) else '[]'::jsonb end,
    'longest_streak', case when g.show_streak then s.longest_streak end,
    'member_since', s.created_at)
  from public.gamification_preferences g join public.user_gamification_stats s on s.user_id = g.user_id
  where g.public_id = p_public_id and g.leaderboard_visibility <> 'hidden' and (select auth.uid()) is not null
$$;

-- =============================================================================
-- API DO ALUNO
-- =============================================================================
create function public.app_gamification_summary() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  st public.user_gamification_stats;
  v_today date; v_week date;
  f jsonb;
  se public.league_seasons;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.gamification_enabled') then return jsonb_build_object('enabled', false); end if;
  perform public.gam_ensure(v_uid);
  perform public.gam_generate_missions(v_uid);
  select * into st from public.user_gamification_stats where user_id = v_uid;
  v_today := public.gam_today(v_uid); v_week := public.gam_week_start(v_today);
  f := public.gam_facts(v_uid, v_today, v_today);
  select * into se from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  return jsonb_build_object(
    'enabled', true,
    'flags', jsonb_build_object('leaderboard', public.gam_flag('flags.leaderboard_enabled'), 'leagues', public.gam_flag('flags.leagues_enabled'),
                                'coins', public.gam_flag('flags.coins_enabled'), 'trail', public.gam_flag('flags.trail_enabled')),
    'names', jsonb_build_object('score', public.gam_text('names.score', 'Stazia Score'), 'coins', public.gam_text('names.coins', 'Stazia Coins')),
    'score', st.stazia_score, 'provisional', st.provisional, 'score_min_questions', public.gam_num('score.min_questions', 50)::int,
    'components', st.score_components, 'evolution_pts', st.evolution_pts,
    'level', (select to_jsonb(l) from public.levels l where l.slug = st.current_level),
    'next_level', (select to_jsonb(l) from public.levels l where l.min_score > st.stazia_score order by l.min_score limit 1),
    'xp', jsonb_build_object('total', st.total_xp, 'weekly', st.weekly_xp, 'monthly', st.monthly_xp,
                             'today', (select coalesce(sum(e.xp_awarded), 0)::int from public.gamification_events e
                                       where e.user_id = v_uid and (e.created_at at time zone public.gam_tz(v_uid))::date = v_today)),
    'coins', st.coins,
    'questions', st.questions_answered, 'accuracy', st.accuracy,
    'streak', jsonb_build_object('current', st.current_streak, 'longest', st.longest_streak, 'freezes', st.streak_freezes,
                                 'today_done', st.last_qualified_date = v_today,
                                 'today', jsonb_build_object('questions', f -> 'questions', 'minutes', f -> 'minutes',
                                                             'min_questions', public.gam_num('streak.min_questions', 10)::int,
                                                             'min_minutes', public.gam_num('streak.min_minutes', 20)::int)),
    'rank', public.app_my_rank('geral'),
    'weekly_rank', public.app_my_rank('semana'),
    'league', case when public.gam_flag('flags.leagues_enabled') and se.id is not null then (
       select jsonb_build_object('slug', m.league_slug, 'name', l.name, 'icon', l.icon, 'color_token', l.color_token, 'group_no', m.group_no, 'weekly_xp', m.weekly_xp,
                                 'ends_on', se.ends_on,
                                 'position', (select count(*) + 1 from public.league_memberships o
                                              where o.season_id = m.season_id and o.league_slug = m.league_slug and o.group_no = m.group_no
                                                and (o.weekly_xp > m.weekly_xp or (o.weekly_xp = m.weekly_xp and o.joined_at < m.joined_at))),
                                 'group_size', (select count(*) from public.league_memberships o
                                                where o.season_id = m.season_id and o.league_slug = m.league_slug and o.group_no = m.group_no))
       from public.league_memberships m join public.leagues l on l.slug = m.league_slug where m.season_id = se.id and m.user_id = v_uid) end,
    'missions', (select jsonb_build_object('done', count(*) filter (where u.completed_at is not null), 'total', count(*),
                   'items', coalesce(jsonb_agg(jsonb_build_object('slug', u.mission_slug, 'title', format(m.title, u.target), 'icon', m.icon,
                                                                  'progress', u.progress, 'target', u.target, 'done', u.completed_at is not null,
                                                                  'xp', m.xp_reward, 'coins', m.coins_reward) order by m.position), '[]'::jsonb))
                 from public.user_missions u join public.missions m on m.slug = u.mission_slug
                 where u.user_id = v_uid and u.period = 'daily' and u.period_start = v_today),
    'recent_achievements', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon, 'rarity', a.rarity, 'unlocked_at', u.unlocked_at) order by u.unlocked_at desc)
                                     from (select * from public.user_achievements where user_id = v_uid order by unlocked_at desc limit 3) u
                                     join public.achievements a on a.slug = u.achievement_slug), '[]'::jsonb),
    'achievements_total', (select count(*) from public.user_achievements where user_id = v_uid),
    'unseen_achievements', (select count(*) from public.user_achievements where user_id = v_uid and seen_at is null),
    'hours_studied', (select round(coalesce(sum(a.active_ms), 0) / 3600000.0, 1) from public.question_attempts a where a.user_id = v_uid));
end
$$;

create function public.app_gamification_missions() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_today date; v_week date;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  perform public.gam_ensure(v_uid);
  perform public.gam_update_missions(v_uid);
  v_today := public.gam_today(v_uid); v_week := public.gam_week_start(v_today);
  return (
    select jsonb_build_object(
      'today', v_today, 'week_start', v_week, 'week_end', v_week + 6,
      'daily_bonus', jsonb_build_object('xp', public.gam_num('xp.daily_missions', 50)::int, 'coins', public.gam_num('coins.daily_missions', 25)::int,
                                        'done', exists (select 1 from public.gamification_events e where e.user_id = v_uid and e.event_type = 'DAILY_MISSIONS_COMPLETED' and e.source_id = v_today::text)),
      'daily', coalesce((select jsonb_agg(x order by (x ->> 'position')::int) from (
        select jsonb_build_object('slug', u.mission_slug, 'title', format(m.title, u.target), 'icon', m.icon, 'kind', m.kind, 'position', m.position,
                                  'progress', u.progress, 'target', u.target, 'done', u.completed_at is not null, 'completed_at', u.completed_at,
                                  'xp', m.xp_reward, 'coins', m.coins_reward) x
        from public.user_missions u join public.missions m on m.slug = u.mission_slug
        where u.user_id = v_uid and u.period = 'daily' and u.period_start = v_today) s), '[]'::jsonb),
      'weekly', coalesce((select jsonb_agg(x order by (x ->> 'position')::int) from (
        select jsonb_build_object('slug', u.mission_slug, 'title', format(m.title, u.target), 'icon', m.icon, 'kind', m.kind, 'position', m.position,
                                  'progress', u.progress, 'target', u.target, 'done', u.completed_at is not null, 'completed_at', u.completed_at,
                                  'xp', m.xp_reward, 'coins', m.coins_reward) x
        from public.user_missions u join public.missions m on m.slug = u.mission_slug
        where u.user_id = v_uid and u.period = 'weekly' and u.period_start = v_week) s), '[]'::jsonb)));
end
$$;

-- Medalhas por categoria. Secretas só aparecem (com critério) depois de desbloqueadas.
create function public.app_gamification_achievements() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  r jsonb;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  r := (select jsonb_build_object(
    'unlocked', count(u.user_id), 'total', count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'slug', a.slug, 'category', a.category, 'rarity', a.rarity, 'icon', case when a.is_secret and u.user_id is null then 'lock' else a.icon end,
      'name', case when a.is_secret and u.user_id is null then 'Conquista secreta' else a.name end,
      'description', case when a.is_secret and u.user_id is null then 'Continue estudando para descobrir.' else a.description end,
      'secret', a.is_secret, 'xp', a.xp_reward, 'coins', a.coins_reward,
      'unlocked_at', u.unlocked_at, 'seen', u.seen_at is not null) order by (u.user_id is null), a.category, a.position), '[]'::jsonb))
    from public.achievements a left join public.user_achievements u on u.achievement_slug = a.slug and u.user_id = v_uid
    where a.is_active);
  update public.user_achievements set seen_at = now() where user_id = v_uid and seen_at is null;
  return r;
end
$$;

create function public.app_gamification_rewards() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', public.gam_flag('flags.coins_enabled'),
    'coins', coalesce((select s.coins from public.user_gamification_stats s where s.user_id = (select auth.uid())), 0),
    'freezes', coalesce((select s.streak_freezes from public.user_gamification_stats s where s.user_id = (select auth.uid())), 0),
    'freeze_max', public.gam_num('streak.freeze_max', 3)::int,
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('slug', r.slug, 'name', r.name, 'description', r.description, 'kind', r.kind, 'cost', r.cost_coins, 'icon', r.icon,
                                                            'owned', exists (select 1 from public.user_rewards ur where ur.user_id = (select auth.uid()) and ur.reward_slug = r.slug and ur.active and ur.consumed_at is null))
                                         order by r.position) from public.rewards r where r.active), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('slug', ur.reward_slug, 'claimed_at', ur.claimed_at, 'consumed_at', ur.consumed_at, 'active', ur.active) order by ur.claimed_at desc)
                      from public.user_rewards ur where ur.user_id = (select auth.uid())), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object('amount', t.amount, 'type', t.type, 'source', t.source_type, 'at', t.created_at) order by t.created_at desc)
                              from (select * from public.coin_transactions where user_id = (select auth.uid()) order by created_at desc limit 20) t), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create function public.app_claim_reward(p_slug text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  r public.rewards;
  st public.user_gamification_stats;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.coins_enabled') then raise exception 'A loja está desligada.' using errcode = '42501'; end if;
  perform public.gam_ensure(v_uid);
  perform pg_advisory_xact_lock(hashtextextended('gam:' || v_uid::text, 0));
  select * into r from public.rewards where slug = p_slug and active;
  if not found then raise exception 'Recompensa não encontrada.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.user_rewards ur where ur.user_id = v_uid and ur.claimed_at > clock_timestamp() - interval '10 seconds') then
    raise exception 'Aguarde alguns segundos antes de resgatar de novo.' using errcode = '54000';
  end if;
  select * into st from public.user_gamification_stats where user_id = v_uid for update;
  if st.coins < r.cost_coins then raise exception 'Moedas insuficientes.' using errcode = '22023'; end if;
  if r.kind = 'streak_freeze' and st.streak_freezes >= public.gam_num('streak.freeze_max', 3) then
    raise exception 'Você já tem o máximo de proteções.' using errcode = '22023';
  end if;
  if r.kind in ('frame', 'avatar', 'theme', 'badge') and exists (select 1 from public.user_rewards ur where ur.user_id = v_uid and ur.reward_slug = r.slug and ur.active) then
    raise exception 'Você já tem esta recompensa.' using errcode = '22023';
  end if;
  update public.user_gamification_stats set coins = coins - r.cost_coins,
    streak_freezes = case when r.kind = 'streak_freeze' then streak_freezes + 1 else streak_freezes end where user_id = v_uid;
  if r.cost_coins > 0 then
    insert into public.coin_transactions (user_id, amount, type, source_type, source_id) values (v_uid, -r.cost_coins, 'spend', 'reward', r.slug);
  end if;
  -- moldura nova desativa a anterior
  if r.kind = 'frame' then update public.user_rewards ur set active = false from public.rewards x where x.slug = ur.reward_slug and ur.user_id = v_uid and x.kind = 'frame'; end if;
  insert into public.user_rewards (user_id, reward_slug, consumed_at) values (v_uid, r.slug, case when r.kind = 'streak_freeze' then now() end);
  perform public.gam_award(v_uid, 'REWARD_CLAIMED', 'user_reward', r.slug || ':' || clock_timestamp()::text, 0, 0, jsonb_build_object('cost', r.cost_coins));
  return public.app_gamification_rewards();
end
$$;

create function public.app_gamification_preferences() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_uid constant uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  perform public.gam_ensure(v_uid);
  return (select to_jsonb(g) - 'user_id' || jsonb_build_object('display_name', public.gam_display_name(v_uid), 'timezone', public.gam_tz(v_uid))
          from public.gamification_preferences g where g.user_id = v_uid);
end
$$;

create function public.app_gamification_save_preferences(p_prefs jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  k text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  perform public.gam_ensure(v_uid);
  for k in select jsonb_object_keys(coalesce(p_prefs, '{}'::jsonb)) loop
    if k not in ('leaderboard_visibility', 'username', 'show_avatar', 'show_accuracy', 'show_streak', 'show_achievements') then
      raise exception 'Preferência não permitida: %', k using errcode = '22023';
    end if;
  end loop;
  if p_prefs ? 'username' and nullif(p_prefs ->> 'username', '') is not null and not (p_prefs ->> 'username' ~ '^[a-z0-9_]{3,20}$') then
    raise exception 'Nome de usuário: 3 a 20 letras minúsculas, números ou _.' using errcode = '22023';
  end if;
  begin
    update public.gamification_preferences g set
      leaderboard_visibility = coalesce(p_prefs ->> 'leaderboard_visibility', g.leaderboard_visibility),
      username = case when p_prefs ? 'username' then nullif(p_prefs ->> 'username', '') else g.username end,
      show_avatar = coalesce((p_prefs ->> 'show_avatar')::boolean, g.show_avatar),
      show_accuracy = coalesce((p_prefs ->> 'show_accuracy')::boolean, g.show_accuracy),
      show_streak = coalesce((p_prefs ->> 'show_streak')::boolean, g.show_streak),
      show_achievements = coalesce((p_prefs ->> 'show_achievements')::boolean, g.show_achievements)
      where g.user_id = v_uid;
  exception when unique_violation then
    raise exception 'Este nome de usuário já está em uso.' using errcode = '23505';
  when check_violation then
    raise exception 'Valor inválido nas preferências.' using errcode = '22023';
  end;
  return public.app_gamification_preferences();
end
$$;

create function public.app_gamification_history(p_days integer default 30) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 7), 3650),
    'points', coalesce((select jsonb_agg(jsonb_build_object('day', r.period_start, 'score', r.stazia_score, 'rank', r.rank, 'total', r.total, 'xp', r.xp, 'accuracy', r.accuracy) order by r.period_start)
                        from public.ranking_snapshots r
                        where r.user_id = (select auth.uid()) and r.period_type = 'day'
                          and r.period_start >= public.today_br() - least(greatest(coalesce(p_days, 30), 7), 3650)), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create function public.app_league_current() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  se public.league_seasons;
  m public.league_memberships;
  v_size constant int := public.gam_num('league.group_size', 30)::int;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.gam_flag('flags.leagues_enabled') then return jsonb_build_object('enabled', false); end if;
  select * into se from public.league_seasons where status = 'open' order by starts_on desc limit 1;
  if se.id is null then return jsonb_build_object('enabled', true, 'joined', false); end if;
  select * into m from public.league_memberships where season_id = se.id and user_id = v_uid;
  if not found then
    return jsonb_build_object('enabled', true, 'joined', false, 'ends_on', se.ends_on,
      'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l));
  end if;
  return jsonb_build_object(
    'enabled', true, 'joined', true, 'season', jsonb_build_object('starts_on', se.starts_on, 'ends_on', se.ends_on),
    'league', (select to_jsonb(l) from public.leagues l where l.slug = m.league_slug),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'group_no', m.group_no, 'promote', public.gam_num('league.promote', 5)::int, 'relegate', public.gam_num('league.relegate', 5)::int,
    'min_group_for_relegation', public.gam_num('league.min_group_for_relegation', 10)::int, 'group_size', v_size,
    'rows', coalesce((select jsonb_agg(public.gam_board_row(x.user_id, v_uid) || jsonb_build_object('position', x.pos, 'weekly_xp', x.weekly_xp) order by x.pos)
                      from (select o.user_id, o.weekly_xp, row_number() over (order by o.weekly_xp desc, o.joined_at, o.user_id) as pos
                            from public.league_memberships o where o.season_id = se.id and o.league_slug = m.league_slug and o.group_no = m.group_no) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('starts_on', s2.starts_on, 'league', h.league_slug, 'position', h.position, 'outcome', h.outcome, 'weekly_xp', h.weekly_xp) order by s2.starts_on desc)
                         from public.league_memberships h join public.league_seasons s2 on s2.id = h.season_id
                         where h.user_id = v_uid and s2.status = 'closed'), '[]'::jsonb));
end
$$;

-- =============================================================================
-- TRILHA DE APRENDIZADO: Área → temas mais cobrados → simulado da área.
-- Etapa: bloqueada · disponível · em andamento · concluída · dominada.
-- =============================================================================
create function public.app_trail(p_area text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_n constant int := public.gam_num('trail.topics_per_area', 12)::int;
  v_goal constant int := public.gam_num('trail.node_goal', 10)::int;
  v_mastery constant numeric := public.gam_num('trail.mastery_accuracy', 80);
  v_unlock constant numeric := public.gam_num('trail.simulado_unlock_pct', 70);
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return (
    with areas as (
      select e.area from unnest(enum_range(null::public.med_area)) as e (area)
      where nullif(p_area, '') is null or e.area::text = p_area
    ),
    topics as (
      select q.area, q.topic, count(*)::int as questions,
             row_number() over (partition by q.area order by count(*) desc, q.topic) as rn
      from public.questions q join areas on areas.area = q.area
      where q.status <> 'annulled' and not (q.needs_image and jsonb_array_length(q.images) = 0)
      group by q.area, q.topic
    ),
    mine as (
      select q.area, q.topic, count(distinct a.question_id)::int as answered, count(*)::int as attempts,
             count(*) filter (where a.is_correct)::int as correct, max(a.answered_at) as last_at
      from public.question_attempts a join public.questions q on q.id = a.question_id
      where a.user_id = v_uid and q.status <> 'annulled'
      group by q.area, q.topic
    ),
    nodes as (
      select t.area, t.topic, t.rn, t.questions, least(v_goal, t.questions) as goal,
             coalesce(m.answered, 0) as answered, coalesce(m.attempts, 0) as attempts, coalesce(m.correct, 0) as correct, m.last_at,
             coalesce(m.answered, 0) >= least(v_goal, t.questions) as completed,
             coalesce(m.answered, 0) >= least(v_goal, t.questions) and coalesce(m.attempts, 0) >= 5
               and 100.0 * coalesce(m.correct, 0) / greatest(coalesce(m.attempts, 0), 1) >= v_mastery as mastered
      from topics t left join mine m on m.area = t.area and m.topic = t.topic
      where t.rn <= v_n
    ),
    states as (
      select n.*,
             case when n.mastered then 'mastered' when n.completed then 'completed' when n.answered > 0 then 'in_progress'
                  when n.rn = 1 or lag(n.completed) over (partition by n.area order by n.rn) then 'available'
                  else 'locked' end as state
      from nodes n
    ),
    per_area as (
      select a.area,
             (select count(*) from states s where s.area = a.area) as total,
             (select count(*) filter (where s.completed) from states s where s.area = a.area) as done,
             (select count(*) filter (where s.mastered) from states s where s.area = a.area) as mastered,
             (select count(*)::int from public.practice_sessions ps where ps.user_id = v_uid and ps.kind = 'simulado' and ps.finished_at is not null
                and ps.config -> 'filters' ->> 'area' = a.area::text) as simulados
      from areas a
    )
    select jsonb_build_object(
      'enabled', public.gam_flag('flags.trail_enabled'),
      'goal', v_goal, 'mastery_accuracy', v_mastery,
      'areas', coalesce((select jsonb_agg(jsonb_build_object(
          'area', p.area, 'label', public.area_label(p.area), 'total', p.total, 'done', p.done, 'mastered', p.mastered,
          'progress', case when p.total = 0 then 0 else round(100.0 * p.done / p.total)::int end,
          'nodes', (select jsonb_agg(jsonb_build_object('topic', s.topic, 'position', s.rn, 'questions', s.questions, 'goal', s.goal, 'answered', s.answered,
                                                        'attempts', s.attempts, 'correct', s.correct, 'accuracy', case when s.attempts > 0 then round(100.0 * s.correct / s.attempts)::int end,
                                                        'state', s.state, 'last_at', s.last_at) order by s.rn)
                    from states s where s.area = p.area),
          'simulado', jsonb_build_object('state', case when p.simulados > 0 then 'completed' when p.total > 0 and 100.0 * p.done / p.total >= v_unlock then 'available' else 'locked' end,
                                         'done', p.simulados, 'unlock_pct', v_unlock))
        order by p.area) from per_area p), '[]'::jsonb))
  );
end
$$;

-- Abre o treino de uma etapa da trilha (só o tema, inéditas primeiro) ou o simulado da área.
create function public.app_start_trail_node(p_area text, p_topic text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_filters jsonb;
  v_left int;
  v_goal constant int := public.gam_num('trail.node_goal', 10)::int;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if p_area is null or not (p_area = any (enum_range(null::public.med_area)::text[])) then
    raise exception 'Área inválida.' using errcode = '22023';
  end if;
  if nullif(p_topic, '') is null then
    return public.app_start_session('simulado', jsonb_build_object('area', p_area), 30, 30 * 180);
  end if;
  if not exists (select 1 from public.questions q where q.area::text = p_area and q.topic = p_topic) then
    raise exception 'Tema não encontrado.' using errcode = 'P0002';
  end if;
  v_filters := jsonb_build_object('area', p_area, 'topic', p_topic, 'status', 'unanswered');
  if (select count(*) from public.practice_pool(v_filters)) = 0 then v_filters := v_filters - 'status'; end if;
  select greatest(v_goal - count(distinct a.question_id), 5)::int into v_left
  from public.question_attempts a join public.questions q on q.id = a.question_id
  where a.user_id = (select auth.uid()) and q.area::text = p_area and q.topic = p_topic;
  return public.app_start_session('questoes', v_filters, least(v_left, v_goal)) || jsonb_build_object('trail', jsonb_build_object('area', p_area, 'topic', p_topic));
end
$$;

-- A trilha filtra por tema exato: practice_pool ganha o filtro "topic".
create or replace function public.practice_pool(p_filters jsonb)
  returns table (question_id text, area public.med_area, exam_id text, topic text)
  language sql stable set search_path = ''
as $$
  select q.id, q.area, q.exam_id, q.topic
  from public.questions q
  where q.status <> 'annulled'
    and not (q.needs_image and jsonb_array_length(q.images) = 0)
    and (nullif(p_filters ->> 'area', '') is null or q.area = (p_filters ->> 'area')::public.med_area)
    and (nullif(p_filters ->> 'exam_id', '') is null or q.exam_id = p_filters ->> 'exam_id')
    and (nullif(p_filters ->> 'topic', '') is null or q.topic = p_filters ->> 'topic')
    and ((nullif(p_filters ->> 'subarea', '') is null and nullif(p_filters ->> 'competency', '') is null)
         or public.question_matches_dna(q.id, p_filters ->> 'subarea', p_filters ->> 'competency'))
    and (
      nullif(btrim(coalesce(p_filters ->> 'search', '')), '') is null
      or q.search @@ websearch_to_tsquery('portuguese', p_filters ->> 'search')
      or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, ''))
           like '%' || public.fold_text(btrim(p_filters ->> 'search')) || '%'
    )
    and case coalesce(nullif(p_filters ->> 'status', ''), 'all')
      when 'unanswered' then not exists (
        select 1 from public.question_attempts a
        where a.user_id = (select auth.uid()) and a.question_id = q.id)
      when 'wrong' then exists (
        select 1 from public.my_error_notebook e
        where e.question_id = q.id and e.status = 'para_revisar')
      when 'bookmarked' then exists (
        select 1 from public.question_bookmarks b
        where b.user_id = (select auth.uid()) and b.question_id = q.id)
      else true
    end
$$;

-- =============================================================================
-- INTEGRAÇÃO COM O QUE JÁ EXISTE: resposta da questão, abertura do app, perfil, Tutor.
-- =============================================================================
-- O que a resposta rendeu (lido do ledger, no mesmo instante da transação).
create function public.gam_turn_summary(p_user uuid, p_attempt uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  select case when not public.gam_flag('flags.gamification_enabled') then null else jsonb_build_object(
    'xp', (select jsonb_build_object('total', e.xp_awarded, 'valid', e.is_valid, 'reason', e.fraud_reason, 'multiplier', e.metadata -> 'multiplier') || coalesce(e.metadata -> 'breakdown', '{}'::jsonb)
           from public.gamification_events e where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text),
    'bonus', coalesce((select jsonb_agg(jsonb_build_object('type', e.event_type, 'xp', e.xp_awarded, 'coins', e.coins_awarded, 'meta', e.metadata))
                       from public.gamification_events e where e.user_id = p_user and e.created_at >= now() and e.xp_awarded > 0
                         and e.event_type in ('SESSION_10', 'SESSION_30', 'MISSION_COMPLETED', 'DAILY_MISSIONS_COMPLETED', 'DAILY_GOAL_COMPLETED')), '[]'::jsonb),
    'coins', (select e.coins_awarded from public.gamification_events e where e.user_id = p_user and e.source_type = 'question_attempt' and e.source_id = p_attempt::text),
    'stats', (select jsonb_build_object('total_xp', s.total_xp, 'weekly_xp', s.weekly_xp, 'coins', s.coins, 'score', s.stazia_score, 'provisional', s.provisional,
                                        'level', s.current_level, 'streak', s.current_streak, 'streak_today', s.last_qualified_date = public.gam_today(p_user))
              from public.user_gamification_stats s where s.user_id = p_user),
    'streak_incremented', exists (select 1 from public.gamification_events e where e.user_id = p_user and e.event_type = 'STREAK_INCREMENTED' and e.created_at >= now()),
    'level_up', (select jsonb_build_object('from', e.metadata ->> 'from', 'to', e.metadata ->> 'to') from public.gamification_events e
                 where e.user_id = p_user and e.event_type = 'LEVEL_UP' and e.created_at >= now() order by e.id desc limit 1),
    'achievements_unlocked', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'description', a.description, 'icon', a.icon, 'rarity', a.rarity, 'xp', a.xp_reward, 'coins', a.coins_reward))
                                       from public.user_achievements u join public.achievements a on a.slug = u.achievement_slug
                                       where u.user_id = p_user and u.unlocked_at >= now()), '[]'::jsonb),
    'missions', (select jsonb_build_object('done', count(*) filter (where u.completed_at is not null), 'total', count(*))
                 from public.user_missions u where u.user_id = p_user and u.period = 'daily' and u.period_start = public.gam_today(p_user))) end
$$;

-- Resposta de treino: igual à anterior, mais o bloco "play" (o que a resposta rendeu).
create or replace function public.app_answer_question(
  p_session_id uuid,
  p_question_id text,
  p_option text,
  p_active_ms integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_selected text;
  v_attempt uuid;
  v_ms constant integer := least(greatest(coalesce(p_active_ms, 0), 0), 86400000);
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if s.finished_at is not null then
    raise exception 'Esta sessão já foi finalizada.' using errcode = '22023';
  end if;
  if p_question_id is null or not (p_question_id = any (s.question_ids)) then
    raise exception 'Questão fora desta sessão.' using errcode = '22023';
  end if;
  if p_option is null or p_option not in ('A', 'B', 'C', 'D') then
    raise exception 'Alternativa inválida.' using errcode = '22023';
  end if;
  if s.time_limit_seconds is not null
     and clock_timestamp() > s.started_at + make_interval(secs => s.time_limit_seconds + 15) then
    raise exception 'O tempo do simulado acabou.' using errcode = '22023';
  end if;

  if s.kind = 'simulado' then
    update public.practice_sessions
      set answers = answers || jsonb_build_object(p_question_id, jsonb_build_object('option', p_option, 'ms', v_ms))
      where id = s.id;
    return jsonb_build_object('saved', true);
  end if;

  select a.selected_option::text, a.id into v_selected, v_attempt
  from public.question_attempts a
  where a.session_id = s.id and a.question_id = p_question_id;
  if not found then
    insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
    values (p_question_id, s.id, p_option, v_ms)
    returning id into v_attempt;
    v_selected := p_option;
  else
    v_attempt := null;   -- resposta repetida: devolve a correção, sem "play" (nada foi concedido agora)
  end if;

  return public.practice_correction_view(p_question_id, v_selected)
    || jsonb_build_object('selected', v_selected, 'play', case when v_attempt is null then null else public.gam_turn_summary((select auth.uid()), v_attempt) end);
end
$$;

-- Abertura do app: ganha o bloco "play" (sequência, score, nível, flags) para a estrutura.
create or replace function public.app_bootstrap() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'onboarding' from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'reviewer_areas', coalesce((select jsonb_agg(r.area_code order by r.area_code) from public.ch_reviewer_areas r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'subscription', (
      select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = (select auth.uid())
    ),
    'has_pro', public.has_pro(),
    'streak_days', public.my_streak_days(),
    'flashcards_due', (
      select count(*)::int from public.flashcard_states f
      where f.user_id = (select auth.uid()) and f.due <= now()
    ),
    'days_to_exam', (
      select case when p.exam_date is null then null else greatest(p.exam_date - public.today_br(), 0) end
      from public.profiles p where p.id = (select auth.uid())
    ),
    'totals', jsonb_build_object(
      'questions', (select count(*)::int from public.questions),
      'answered', (select count(distinct a.question_id)::int from public.question_attempts a
                   where a.user_id = (select auth.uid()))
    ),
    'play', case when public.gam_flag('flags.gamification_enabled') then jsonb_build_object(
      'enabled', true,
      'flags', jsonb_build_object('leaderboard', public.gam_flag('flags.leaderboard_enabled'), 'leagues', public.gam_flag('flags.leagues_enabled'),
                                  'coins', public.gam_flag('flags.coins_enabled'), 'trail', public.gam_flag('flags.trail_enabled')),
      'names', jsonb_build_object('score', public.gam_text('names.score', 'Stazia Score'), 'coins', public.gam_text('names.coins', 'Stazia Coins')),
      'streak', coalesce((select s.current_streak from public.user_gamification_stats s where s.user_id = (select auth.uid())), 0),
      'score', (select s.stazia_score from public.user_gamification_stats s where s.user_id = (select auth.uid())),
      'provisional', coalesce((select s.provisional from public.user_gamification_stats s where s.user_id = (select auth.uid())), true),
      'level', coalesce((select s.current_level from public.user_gamification_stats s where s.user_id = (select auth.uid())), 'iniciante'),
      'coins', coalesce((select s.coins from public.user_gamification_stats s where s.user_id = (select auth.uid())), 0))
      else jsonb_build_object('enabled', false) end
  )
$$;

-- Perfil: o aluno pode definir o fuso horário (validado pelo próprio Postgres).
create or replace function public.app_update_profile(p_patch jsonb) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  allowed constant text[] := array['name', 'avatar_seed', 'phase', 'exam_type', 'target_edition', 'exam_date',
                                   'daily_minutes', 'study_days_per_week', 'graduation_country',
                                   'graduation_university', 'graduation_year', 'theme', 'timezone'];
  k text;
  v_probe timestamp;
begin
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then
      raise exception 'Campo de perfil não permitido: %', k using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'timezone' then
    begin
      v_probe := now() at time zone (p_patch ->> 'timezone');
    exception when others then
      raise exception 'Fuso horário inválido.' using errcode = '22023';
    end;
  end if;

  update public.profiles p set
    name = coalesce(p_patch ->> 'name', p.name),
    avatar_seed = case when p_patch ? 'avatar_seed' then p_patch ->> 'avatar_seed' else p.avatar_seed end,
    phase = coalesce((p_patch ->> 'phase')::smallint, p.phase),
    exam_type = coalesce(p_patch ->> 'exam_type', p.exam_type),
    target_edition = case when p_patch ? 'target_edition' then p_patch ->> 'target_edition' else p.target_edition end,
    exam_date = case when p_patch ? 'exam_date' then (p_patch ->> 'exam_date')::date else p.exam_date end,
    daily_minutes = case when p_patch ? 'daily_minutes' then (p_patch ->> 'daily_minutes')::int else p.daily_minutes end,
    study_days_per_week = case when p_patch ? 'study_days_per_week' then (p_patch ->> 'study_days_per_week')::smallint else p.study_days_per_week end,
    graduation_country = case when p_patch ? 'graduation_country' then p_patch ->> 'graduation_country' else p.graduation_country end,
    graduation_university = case when p_patch ? 'graduation_university' then p_patch ->> 'graduation_university' else p.graduation_university end,
    graduation_year = case when p_patch ? 'graduation_year' then (p_patch ->> 'graduation_year')::smallint else p.graduation_year end,
    theme = coalesce(p_patch ->> 'theme', p.theme),
    timezone = coalesce(p_patch ->> 'timezone', p.timezone)
  where p.id = (select auth.uid());

  return public.app_bootstrap();
end
$$;

-- Contexto do Tutor: estatísticas agregadas do Play (nada pessoal). A IA interpreta; nunca decide pontos.
create function public.ch_worker_tutor_play_context(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when not public.gam_flag('flags.gamification_enabled') then null else (
    select jsonb_build_object(
      'rank', (select b.rank from public.gam_board('geral') b where b.user_id = p_user),
      'percentile', (select round(100.0 * b.rank / greatest(b.total, 1), 1) from public.gam_board('geral') b where b.user_id = p_user),
      'league', s.current_league, 'weekly_xp', s.weekly_xp, 'stazia_score', case when s.provisional then null else s.stazia_score end,
      'questions', s.questions_answered, 'accuracy', s.accuracy, 'streak', s.current_streak,
      'weakest_area', (select x.area from (
          select q.area::text as area, count(*) as n, 100.0 * count(*) filter (where a.is_correct) / count(*) as acc
          from public.question_attempts a join public.questions q on q.id = a.question_id
          where a.user_id = p_user and q.status <> 'annulled' group by q.area having count(*) >= 10 order by acc limit 1) x),
      'missions_pending', (select count(*) from public.user_missions u where u.user_id = p_user and u.period = 'daily' and u.period_start = public.gam_today(p_user) and u.completed_at is null))
    from public.user_gamification_stats s where s.user_id = p_user) end
$$;

-- =============================================================================
-- ROTINAS (service role, chamadas pelo servidor via cron): diária, semanal, mensal, retroativo.
-- =============================================================================
create function public.ch_worker_gamification_recalculate(p_user uuid, p_rebuild_xp boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_days date[];
  v_streak int := 0; v_longest int := 0; v_last date;
  d date; v_prev date;
begin
  perform public.gam_ensure(p_user);
  perform pg_advisory_xact_lock(hashtextextended('gam:' || p_user::text, 0));
  v_tz := public.gam_tz(p_user);
  -- contagens a partir das tentativas válidas (as invalidadas pelo antifraude ficam fora)
  update public.user_gamification_stats s set
    questions_answered = x.n, correct_answers = x.c, wrong_answers = x.n - x.c,
    accuracy = case when x.n = 0 then 0 else round(100.0 * x.c / x.n, 2) end,
    last_qualified_activity_at = x.last_at
  from (select count(*)::int as n, count(*) filter (where a.is_correct)::int as c, max(a.answered_at) as last_at
        from public.question_attempts a join public.questions q on q.id = a.question_id
        where a.user_id = p_user and q.status <> 'annulled' and not public.gam_invalid_attempt(p_user, a.id)) x
  where s.user_id = p_user;
  if p_rebuild_xp then
    update public.user_gamification_stats s set
      total_xp = coalesce((select sum(e.xp_awarded) from public.gamification_events e where e.user_id = p_user), 0),
      coins = coalesce((select sum(t.amount) from public.coin_transactions t where t.user_id = p_user), 0)
      where s.user_id = p_user;
  end if;
  -- sequência: dias que cumpriram o mínimo (questões válidas ou minutos), até hoje
  select array_agg(day order by day) into v_days from (
    select (a.answered_at at time zone v_tz)::date as day
    from public.question_attempts a join public.questions q on q.id = a.question_id
    where a.user_id = p_user and q.status <> 'annulled' and not public.gam_invalid_attempt(p_user, a.id)
    group by 1
    having count(*) >= public.gam_num('streak.min_questions', 10) or sum(coalesce(a.active_ms, 0)) >= public.gam_num('streak.min_minutes', 20) * 60000
    union
    select u.period_start from public.user_missions u where u.user_id = p_user and u.period = 'daily' and u.completed_at is not null
  ) x;
  if v_days is not null then
    foreach d in array v_days loop
      if v_prev is not null and d = v_prev + 1 then v_streak := v_streak + 1; else v_streak := 1; end if;
      v_longest := greatest(v_longest, v_streak);
      v_prev := d;
    end loop;
    v_last := v_prev;
    if v_last < (now() at time zone v_tz)::date - 1 then v_streak := 0; end if;
  end if;
  update public.user_gamification_stats set current_streak = v_streak, longest_streak = greatest(longest_streak, v_longest), last_qualified_date = v_last where user_id = p_user;
  perform public.gam_refresh_score(p_user, true);
  perform public.gam_check_achievements(p_user);
  return (select to_jsonb(s) from public.user_gamification_stats s where s.user_id = p_user);
end
$$;

-- Fecha a temporada vencida (idempotente): posições, promoções, rebaixamentos, recompensas, nova temporada.
create function public.ch_worker_gamification_close_week() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  se public.league_seasons;
  nx public.league_seasons;
  v_size constant int := greatest(public.gam_num('league.group_size', 30)::int, 2);
  v_promote constant int := public.gam_num('league.promote', 5)::int;
  v_relegate constant int := public.gam_num('league.relegate', 5)::int;
  v_min_group constant int := public.gam_num('league.min_group_for_relegation', 10)::int;
  v_active constant int := public.gam_num('league.active_days', 14)::int;
  v_today constant date := public.today_br();
  v_closed int := 0; v_promoted int := 0; v_relegated int := 0;
  r record;
begin
  select * into se from public.league_seasons where status = 'open' and ends_on < v_today order by starts_on limit 1 for update;
  if not found then return jsonb_build_object('closed', false); end if;
  if exists (select 1 from public.gamification_jobs j where j.job = 'close_week' and j.period_key = se.id::text) then
    return jsonb_build_object('closed', false, 'already', true);
  end if;

  -- posições e desfechos
  update public.league_memberships m set position = x.pos,
    outcome = case
      when x.pos <= v_promote and l.position < (select max(position) from public.leagues) then 'promoted'
      when x.n >= v_min_group and x.pos > x.n - v_relegate and l.position > 1 then 'relegated'
      else 'stayed' end
  from (select o.user_id, row_number() over (partition by o.league_slug, o.group_no order by o.weekly_xp desc,
          (select count(*) from public.gamification_events e where e.user_id = o.user_id and e.event_type = 'QUESTION_CORRECT' and e.created_at >= se.starts_on::timestamptz) desc,
          o.joined_at, o.user_id) as pos,
        count(*) over (partition by o.league_slug, o.group_no) as n
        from public.league_memberships o where o.season_id = se.id) x,
       public.leagues l
  where m.season_id = se.id and m.user_id = x.user_id and l.slug = m.league_slug;

  for r in select m.user_id, m.league_slug, m.outcome, m.position, l.position as lpos
           from public.league_memberships m join public.leagues l on l.slug = m.league_slug where m.season_id = se.id loop
    v_closed := v_closed + 1;
    if r.outcome = 'promoted' then
      v_promoted := v_promoted + 1;
      update public.user_gamification_stats set current_league = (select slug from public.leagues where position = r.lpos + 1) where user_id = r.user_id;
      perform public.gam_award(r.user_id, 'LEAGUE_PROMOTED', 'season', se.id::text, 0, public.gam_num('coins.league_promoted', 50)::int,
                               jsonb_build_object('from', r.league_slug, 'position', r.position));
    elsif r.outcome = 'relegated' then
      v_relegated := v_relegated + 1;
      update public.user_gamification_stats set current_league = (select slug from public.leagues where position = r.lpos - 1) where user_id = r.user_id;
      perform public.gam_award(r.user_id, 'LEAGUE_RELEGATED', 'season', se.id::text, 0, 0, jsonb_build_object('from', r.league_slug, 'position', r.position));
    end if;
    if r.position <= 10 and (select count(*) from public.league_memberships o where o.season_id = se.id and o.league_slug = r.league_slug
                             and o.group_no = (select group_no from public.league_memberships where season_id = se.id and user_id = r.user_id)) >= 10 then
      perform public.gam_unlock(r.user_id, 'top_10_semanal');
    end if;
  end loop;

  -- foto da semana (ranking geral) e zera o XP semanal
  insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
  select s.user_id, 'week', se.starts_on, se.ends_on, b.rank, b.total, s.stazia_score, s.weekly_xp, s.accuracy
  from public.user_gamification_stats s left join public.gam_board('geral') b on b.user_id = s.user_id
  on conflict do nothing;
  update public.user_gamification_stats set weekly_xp = 0 where weekly_xp <> 0;
  update public.league_seasons set status = 'closed', closed_at = now() where id = se.id;

  -- nova temporada com os ativos, grupos equilibrados por score (determinístico)
  insert into public.league_seasons (starts_on, ends_on) values (greatest(se.ends_on + 1, public.gam_week_start(v_today)), greatest(se.ends_on + 1, public.gam_week_start(v_today)) + 6)
  on conflict (starts_on) do update set status = 'open', closed_at = null returning * into nx;
  insert into public.league_memberships (season_id, user_id, league_slug, group_no)
  select nx.id, x.user_id, x.league, ceil(x.rn::numeric / v_size)::int
  from (select s.user_id, coalesce(s.current_league, 'bronze') as league,
               row_number() over (partition by coalesce(s.current_league, 'bronze') order by s.stazia_score desc, s.user_id) as rn
        from public.user_gamification_stats s
        where s.last_qualified_activity_at >= now() - make_interval(days => v_active)) x
  on conflict do nothing;

  insert into public.gamification_jobs (job, period_key, result) values ('close_week', se.id::text,
    jsonb_build_object('closed', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id));
  return jsonb_build_object('closed', true, 'season', se.id, 'members', v_closed, 'promoted', v_promoted, 'relegated', v_relegated, 'next_season', nx.id);
end
$$;

create function public.ch_worker_gamification_daily() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_key constant text := public.today_br()::text;
  v_users int := 0; v_broken int := 0; v_frozen int := 0;
  r record;
  v_month jsonb := null;
  v_week jsonb;
begin
  insert into public.gamification_jobs (job, period_key) values ('daily', v_key) on conflict do nothing;
  if not found then return jsonb_build_object('skipped', true, 'day', v_key); end if;

  -- dificuldade real das questões
  insert into public.question_difficulty (question_id, attempts, correct, difficulty, updated_at)
  select a.question_id, count(*), count(*) filter (where a.is_correct), round(1 - count(*) filter (where a.is_correct)::numeric / count(*), 3), now()
  from public.question_attempts a group by a.question_id
  on conflict (question_id) do update set attempts = excluded.attempts, correct = excluded.correct, difficulty = excluded.difficulty, updated_at = now();

  -- sequências quebradas (no fuso de cada aluno) e proteções
  for r in select s.user_id, s.current_streak, s.last_qualified_date, s.streak_freezes, public.gam_today(s.user_id) as today
           from public.user_gamification_stats s where s.current_streak > 0 loop
    if r.last_qualified_date < r.today - 1 then
      if r.last_qualified_date = r.today - 2 and r.streak_freezes > 0 then
        update public.user_gamification_stats set streak_freezes = streak_freezes - 1, last_qualified_date = r.today - 1 where user_id = r.user_id;
        perform public.gam_award(r.user_id, 'STREAK_FREEZE_USED', 'day', (r.today - 1)::text, 0, 0, jsonb_build_object('streak', r.current_streak));
        v_frozen := v_frozen + 1;
      else
        update public.user_gamification_stats set current_streak = 0 where user_id = r.user_id;
        perform public.gam_award(r.user_id, 'STREAK_BROKEN', 'day', r.today::text, 0, 0, jsonb_build_object('streak', r.current_streak));
        v_broken := v_broken + 1;
      end if;
    end if;
  end loop;

  -- score de quem estudou nos últimos 30 dias
  for r in select s.user_id from public.user_gamification_stats s where s.last_qualified_activity_at >= now() - interval '30 days' loop
    perform public.gam_refresh_score(r.user_id, true);
    v_users := v_users + 1;
  end loop;

  -- foto do dia (ranking geral)
  insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
  select s.user_id, 'day', public.today_br(), public.today_br(), b.rank, b.total, s.stazia_score, s.total_xp, s.accuracy
  from public.user_gamification_stats s left join public.gam_board('geral') b on b.user_id = s.user_id
  where s.questions_answered > 0
  on conflict do nothing;

  -- mês fechado
  if extract(day from public.today_br()) = 1 then
    insert into public.gamification_jobs (job, period_key) values ('close_month', to_char(public.today_br() - 1, 'YYYY-MM')) on conflict do nothing;
    if found then
      insert into public.ranking_snapshots (user_id, period_type, period_start, period_end, rank, total, stazia_score, xp, accuracy)
      select s.user_id, 'month', date_trunc('month', public.today_br() - 1)::date, public.today_br() - 1, b.rank, b.total, s.stazia_score, s.monthly_xp, s.accuracy
      from public.user_gamification_stats s left join public.gam_board('mes') b on b.user_id = s.user_id
      where s.monthly_xp > 0
      on conflict do nothing;
      update public.user_gamification_stats set monthly_xp = 0 where monthly_xp <> 0;
      v_month := jsonb_build_object('closed', to_char(public.today_br() - 1, 'YYYY-MM'));
    end if;
  end if;

  v_week := public.ch_worker_gamification_close_week();
  update public.gamification_jobs set result = jsonb_build_object('scores', v_users, 'streaks_broken', v_broken, 'freezes_used', v_frozen, 'week', v_week, 'month', v_month)
    where job = 'daily' and period_key = v_key;
  return jsonb_build_object('day', v_key, 'scores', v_users, 'streaks_broken', v_broken, 'freezes_used', v_frozen, 'week', v_week, 'month', v_month);
end
$$;

-- Retroativo: alunos com histórico ganham estatísticas e score; o XP começa do lançamento (regra do produto).
create function public.ch_worker_gamification_backfill() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in select distinct a.user_id from public.question_attempts a loop
    perform public.ch_worker_gamification_recalculate(r.user_id, false);
    n := n + 1;
  end loop;
  return jsonb_build_object('users', n);
end
$$;

-- =============================================================================
-- ADMINISTRAÇÃO
-- =============================================================================
create function public.app_admin_gamification() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'rules', (select jsonb_agg(to_jsonb(r) order by r.key) from public.gamification_rules r),
    'levels', (select jsonb_agg(to_jsonb(l) order by l.position) from public.levels l),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'achievements', (select jsonb_agg(to_jsonb(a) order by a.category, a.position) from public.achievements a),
    'missions', (select jsonb_agg(to_jsonb(m) order by m.period, m.position) from public.missions m),
    'rewards', (select jsonb_agg(to_jsonb(x) order by x.position) from public.rewards x),
    'metrics', jsonb_build_object(
      'users_active', (select count(*) from public.user_gamification_stats where last_qualified_activity_at > now() - interval '7 days'),
      'users_total', (select count(*) from public.user_gamification_stats),
      'xp_today', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at >= public.today_br()::timestamptz),
      'xp_7d', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at > now() - interval '7 days'),
      'coins_issued', (select coalesce(sum(amount), 0) from public.coin_transactions where amount > 0),
      'missions_completed_7d', (select count(*) from public.user_missions where completed_at > now() - interval '7 days'),
      'achievements_7d', (select count(*) from public.user_achievements where unlocked_at > now() - interval '7 days'),
      'avg_streak', (select round(avg(current_streak), 1) from public.user_gamification_stats where current_streak > 0),
      'suspicious_7d', (select count(*) from public.gamification_events where not is_valid and created_at > now() - interval '7 days'),
      'suspicious_by_reason', (select coalesce(jsonb_object_agg(x.r, x.n), '{}'::jsonb) from (select fraud_reason as r, count(*) as n from public.gamification_events where not is_valid group by 1) x),
      'by_league', (select coalesce(jsonb_object_agg(x.l, x.n), '{}'::jsonb) from (select coalesce(current_league, 'sem liga') as l, count(*) as n from public.user_gamification_stats group by 1) x),
      'top10', coalesce((select jsonb_agg(public.gam_board_row(b.user_id, null) || jsonb_build_object('rank', b.rank, 'user_id', b.user_id) order by b.rank)
                         from public.gam_board('geral') b where b.rank <= 10), '[]'::jsonb),
      'events_24h', (select count(*) from public.gamification_events where created_at > now() - interval '24 hours'),
      'season', (select to_jsonb(s) from public.league_seasons s where s.status = 'open' order by s.starts_on desc limit 1),
      'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.ran_at desc) from (select * from public.gamification_jobs order by ran_at desc limit 10) j), '[]'::jsonb)));
end
$$;

create function public.app_admin_gamification_save_rule(p_key text, p_value jsonb, p_enabled boolean default true) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.gamification_rules set value = p_value, enabled = coalesce(p_enabled, true), updated_at = now(), updated_by = (select auth.uid()) where key = p_key;
  if not found then raise exception 'Regra não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('gamification.rule', p_key, jsonb_build_object('value', p_value, 'enabled', p_enabled));
  return public.app_admin_gamification();
end
$$;

create function public.app_admin_gamification_save_achievement(p_achievement jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare a jsonb := coalesce(p_achievement, '{}'::jsonb);
begin
  perform public.assert_admin();
  if nullif(a ->> 'slug', '') is null or not (a ->> 'slug' ~ '^[a-z0-9_]+$') then raise exception 'Informe um identificador (letras minúsculas, números e _).' using errcode = '22023'; end if;
  if nullif(a ->> 'name', '') is null then raise exception 'Informe o nome da medalha.' using errcode = '22023'; end if;
  if jsonb_typeof(a -> 'criteria') <> 'object' or nullif(a -> 'criteria' ->> 'type', '') is null then raise exception 'Informe o critério (objeto com "type").' using errcode = '22023'; end if;
  insert into public.achievements (slug, name, description, category, icon, rarity, criteria, xp_reward, coins_reward, is_secret, is_active, position)
  values (a ->> 'slug', a ->> 'name', coalesce(a ->> 'description', ''), coalesce(a ->> 'category', 'especiais'), coalesce(a ->> 'icon', 'award'),
          coalesce(a ->> 'rarity', 'comum'), a -> 'criteria', coalesce((a ->> 'xp_reward')::int, 0), coalesce((a ->> 'coins_reward')::int, 0),
          coalesce((a ->> 'is_secret')::boolean, false), coalesce((a ->> 'is_active')::boolean, true), coalesce((a ->> 'position')::int, 0))
  on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, icon = excluded.icon,
    rarity = excluded.rarity, criteria = excluded.criteria, xp_reward = excluded.xp_reward, coins_reward = excluded.coins_reward,
    is_secret = excluded.is_secret, is_active = excluded.is_active, position = excluded.position;
  perform public.admin_log('gamification.achievement', a ->> 'slug', a);
  return public.app_admin_gamification();
end
$$;

create function public.app_admin_gamification_save_mission(p_mission jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare m jsonb := coalesce(p_mission, '{}'::jsonb);
begin
  perform public.assert_admin();
  update public.missions set
    title = coalesce(m ->> 'title', title), target_default = coalesce((m ->> 'target_default')::int, target_default),
    xp_reward = coalesce((m ->> 'xp_reward')::int, xp_reward), coins_reward = coalesce((m ->> 'coins_reward')::int, coins_reward),
    active = coalesce((m ->> 'active')::boolean, active)
    where slug = m ->> 'slug';
  if not found then raise exception 'Missão não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('gamification.mission', m ->> 'slug', m);
  return public.app_admin_gamification();
end
$$;

create function public.app_admin_gamification_save_reward(p_reward jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb := coalesce(p_reward, '{}'::jsonb);
begin
  perform public.assert_admin();
  update public.rewards set
    name = coalesce(r ->> 'name', name), description = coalesce(r ->> 'description', description),
    cost_coins = coalesce((r ->> 'cost_coins')::int, cost_coins), active = coalesce((r ->> 'active')::boolean, active)
    where slug = r ->> 'slug';
  if not found then raise exception 'Recompensa não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('gamification.reward', r ->> 'slug', r);
  return public.app_admin_gamification();
end
$$;

-- Auditoria de um aluno: estatísticas e o livro-razão.
create function public.app_admin_gamification_user(p_user_id uuid, p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'stats', (select to_jsonb(s) from public.user_gamification_stats s where s.user_id = p_user_id),
    'preferences', (select to_jsonb(g) from public.gamification_preferences g where g.user_id = p_user_id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (select * from public.gamification_events where user_id = p_user_id order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) e), '[]'::jsonb),
    'coins', coalesce((select jsonb_agg(to_jsonb(t) order by t.id desc) from (select * from public.coin_transactions where user_id = p_user_id order by id desc limit 50) t), '[]'::jsonb),
    'achievements', coalesce((select jsonb_agg(to_jsonb(u)) from public.user_achievements u where u.user_id = p_user_id), '[]'::jsonb));
end
$$;

create function public.app_admin_gamification_recalculate(p_user_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform public.admin_log('gamification.recalculate', p_user_id::text);
  return public.ch_worker_gamification_recalculate(p_user_id, true);
end
$$;

-- =============================================================================
-- Tempo real (Supabase Realtime): o aluno assina só a própria linha (RLS). No PGlite não há publicação.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_gamification_stats;
  end if;
end $$;

-- =============================================================================
-- Retroativo dos alunos já existentes (estatísticas e score; sem XP retroativo).
-- =============================================================================
select public.ch_worker_gamification_backfill();

-- =============================================================================
-- Permissões: o motor e as rotinas não são executáveis pelo cliente.
-- =============================================================================
do $revoke$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'gam\_%' or p.proname like 'ch\_worker\_gamification\_%' or p.proname = 'ch_worker_tutor_play_context' or p.proname = 'my_error_notebook_of')
      -- leitura de regras, datas e do próprio resultado (SECURITY INVOKER) continuam acessíveis às funções app_*
      and p.proname not in ('gam_rule', 'gam_num', 'gam_flag', 'gam_text', 'gam_tz', 'gam_today', 'gam_week_start', 'gam_level_for', 'gam_turn_summary')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;
revoke execute on function public.app_leaderboard(text, integer, integer) from anon;
revoke execute on function public.app_leaderboard_near_me(text, integer) from anon;
revoke execute on function public.app_my_rank(text) from anon;
revoke execute on function public.app_public_profile(text) from anon;
revoke execute on function public.app_gamification_summary() from anon;
revoke execute on function public.app_gamification_missions() from anon;
revoke execute on function public.app_gamification_achievements() from anon;
revoke execute on function public.app_gamification_rewards() from anon;
revoke execute on function public.app_claim_reward(text) from anon;
revoke execute on function public.app_gamification_preferences() from anon;
revoke execute on function public.app_gamification_save_preferences(jsonb) from anon;
revoke execute on function public.app_gamification_history(integer) from anon;
revoke execute on function public.app_league_current() from anon;
revoke execute on function public.app_trail(text) from anon;
revoke execute on function public.app_start_trail_node(text, text) from anon;
