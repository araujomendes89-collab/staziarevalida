-- =============================================================================
-- Simulado TRI (estimativa StaziaMed) — Fase 1 (pedido do dono de 14/10/2026: "crie também simulados usando o método TRI").
-- Desenho: scratchpad tri/02-engenharia-simulado-tri.md; explicação do cálculo: tri/01-como-e-o-calculo.md.
--
-- O que é: o aluno PODE escolher, ao iniciar o simulado, a correção "TRI (estimativa StaziaMed)". O modo "Clássico por acertos"
-- continua o padrão e não muda nada. No modo TRI o banco calcula, ao finalizar, a proficiência θ pelo modelo de Rasch (um parâmetro
-- por questão: a dificuldade b), com EAP (esperança a posteriori, prior Normal(0,1), grade de 61 pontos em ±5), o erro padrão, a
-- faixa de 95% (θ ± 1,96·EP) e a nota na ESCALA PRÓPRIA: nota = 50 + 10·θ (0 a 100). Nunca a escala do Inep (17,544 / 67,018).
-- Rótulo fixo: "Estimativa StaziaMed, não é a nota do Inep". O Inep não publica os b das questões: ninguém reproduz a nota oficial.
--
-- Dificuldade das questões (irt_item_params), calibração PRÓPRIA (nunca a question_difficulty da gamificação, que mistura repetições
-- e anuladas):
--   * sem linha na tabela: provisória pelo nível do blueprint (question_dna.difficulty_estimate: LOW −1, MODERATE 0, HIGH +1; sem
--     nível, 0);
--   * irt_refresh_provisional() (servidor): item com ≥ 10 respostas válidas → provisória pelo percentual de acerto
--     (b = ln((1−p)/p), p = (acertos + 0,5)/(n + 1)); não passa por cima do Rasch;
--   * irt_save_calibration() (servidor): grava o b estimado pelo Rasch (JMLE/CMLE) no script scripts/tri/calibrar.ts (a conta
--     iterativa fica no Node; o banco só confere e grava): < 30 respostas é ignorado; 30–99 provisória; ≥ 100 calibrada;
--     reject_reason (ou |b| > 6,5, como a NT 42/2025) → rejeitado (fica fora da nota de todo mundo).
--
-- Matriz de respostas (irt_responses), por simulado TRI: guarda a letra marcada e a nota de cada questão (1/0; nula = fora da
-- conta, com o motivo). É RECORRIGÍVEL: se o gabarito mudar (questions.correct_option/status, ou um novo gabarito oficial — o
-- 2026/2 é preliminar até 04/12/2026), os simulados TRI com a questão são recalculados. A question_attempts (histórico imutável)
-- não muda. Anulada sai da conta (não vira acerto para ninguém). Em branco conta 0 (como no modo clássico).
--
-- Matriz de calibração (irt_calibration_matrix, servidor): só simulado finalizado com ≥ 80% respondido, só a PRIMEIRA vez que o
-- aluno viu a questão (ou a equivalente de outra prova), sem anuladas, corrigida pelo gabarito atual; a pessoa vem como código
-- (md5), nunca o id da conta.
--
-- Funções novas: irt_eap, irt_estimar_theta, irt_scale (conta pura); irt_item_difficulty, irt_score_session, irt_result_json
-- (internas); irt_calibration_matrix, irt_refresh_provisional, irt_save_calibration, irt_regrade_question (servidor:
-- service_role); app_start_simulado_tri e app_session_irt_result (aluno). Gatilhos: ao finalizar a sessão TRI; ao mudar o
-- gabarito/anulação da questão; ao registrar gabarito oficial.
-- Nada existente é redefinido (app_start_session, app_get_session, practice_result, gamificação: iguais).
-- Pode ser colada de novo sem estragar nada. Conferir: supabase/conferir/simulado-tri.sql.
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.app_start_session(text,jsonb,integer,integer)') is null
     or to_regprocedure('public.question_preliminary_info(text)') is null
     or to_regclass('public.question_dna') is null
     or to_regclass('public.question_equivalents') is null then
    raise exception 'Cole antes as migrações anteriores (até a …9930 do gabarito preliminar): esta parte das funções delas.'
      using errcode = '55000';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- versões de calibração
create table if not exists public.irt_calibration_runs (
  id uuid primary key default gen_random_uuid(),
  method text not null check (method in ('percentual', 'jmle', 'cmle')),
  n_persons integer,
  n_items integer,
  n_responses integer,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- dificuldade de cada questão (versão atual)
create table if not exists public.irt_item_params (
  question_id text primary key references public.questions (id) on delete cascade,
  b double precision not null check (b between -10 and 10),
  se_b double precision,
  n_resp integer not null default 0 check (n_resp >= 0),
  n_correct integer not null default 0 check (n_correct >= 0),
  infit double precision,
  outfit double precision,
  origem text not null check (origem in ('percentual', 'rasch')),
  estado text not null check (estado in ('provisoria', 'calibrada', 'rejeitado')),
  reject_reason text,
  run_id uuid references public.irt_calibration_runs (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint irt_item_params_calibrada_check check (estado <> 'calibrada' or (origem = 'rasch' and n_resp >= 100)),
  constraint irt_item_params_rejeitado_check check ((estado = 'rejeitado') = (reject_reason is not null))
);

-- ---------------------------------------------------------------- matriz de respostas do simulado TRI (recorrigível)
create table if not exists public.irt_responses (
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ord integer not null,
  area public.med_area not null,
  topic text not null,
  selected_option char(1),
  score smallint check (score in (0, 1)),          -- nula = fora da conta (motivo em excluded_reason)
  excluded_reason text check (excluded_reason in ('anulada', 'item_rejeitado')),
  key_preliminary boolean not null default false,  -- gabarito oficial atual ainda é o PRELIMINAR
  b_used double precision not null,
  b_estado text not null,
  b_origem text not null,
  graded_at timestamptz not null default now(),
  primary key (session_id, question_id),
  constraint irt_responses_fora_da_conta_check check ((score is null) = (excluded_reason is not null))
);
create index if not exists irt_responses_question_idx on public.irt_responses (question_id);
create index if not exists irt_responses_user_idx on public.irt_responses (user_id);

-- ---------------------------------------------------------------- resultado do simulado TRI
create table if not exists public.irt_session_results (
  session_id uuid primary key references public.practice_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null default 'EAP',
  prior_mu double precision not null default 0,
  prior_sigma double precision not null default 1,
  theta double precision not null,
  se double precision not null,
  theta_lo double precision not null,
  theta_hi double precision not null,
  nota double precision not null,
  nota_lo double precision not null,
  nota_hi double precision not null,
  n_items integer not null,
  n_correct integer not null,
  n_blank integer not null,
  n_annulled integer not null,
  n_rejected integer not null,
  n_provisional integer not null,
  n_calibrated integer not null,
  n_preliminary integer not null,
  by_area jsonb not null default '[]'::jsonb,
  by_topic jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  recomputed_at timestamptz,
  times_computed integer not null default 1
);
create index if not exists irt_session_results_user_idx on public.irt_session_results (user_id);

-- ---------------------------------------------------------------- RLS: aluno só vê o seu; dificuldade e calibração só a equipe
alter table public.irt_calibration_runs enable row level security;
alter table public.irt_item_params enable row level security;
alter table public.irt_responses enable row level security;
alter table public.irt_session_results enable row level security;

drop policy if exists "tri calibração: equipe lê" on public.irt_calibration_runs;
create policy "tri calibração: equipe lê" on public.irt_calibration_runs for select to authenticated using ((select public.is_staff()));
drop policy if exists "tri dificuldade: equipe lê" on public.irt_item_params;
create policy "tri dificuldade: equipe lê" on public.irt_item_params for select to authenticated using ((select public.is_staff()));
drop policy if exists "tri respostas: a própria ou a equipe" on public.irt_responses;
create policy "tri respostas: a própria ou a equipe" on public.irt_responses
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists "tri resultado: o próprio ou a equipe" on public.irt_session_results;
create policy "tri resultado: o próprio ou a equipe" on public.irt_session_results
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ninguém grava direto: só as funções do banco (security definer)
revoke all on table public.irt_calibration_runs, public.irt_item_params, public.irt_responses, public.irt_session_results from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.irt_calibration_runs, public.irt_item_params, public.irt_responses, public.irt_session_results from authenticated;
grant select on table public.irt_calibration_runs, public.irt_item_params, public.irt_responses, public.irt_session_results to authenticated;

-- ================================================================ a conta (pura, sem tabela)
-- θ por EAP: posterior ∝ prior Normal(mu, sigma) × Π P^x (1−P)^(1−x), P = 1/(1+e^-(θ−b)), numa grade regular de p_n_quad pontos
-- em mu ± p_amplitude·sigma. Devolve θ (média a posteriori), EP (desvio a posteriori) e quantas questões entraram. Resposta ou
-- dificuldade nula = fora da conta. Mesma conta de scripts/tri/rasch.ts (thetaEap) e do protótipo em Python.
create or replace function public.irt_eap(
  p_scores smallint[],
  p_b double precision[],
  p_mu double precision default 0,
  p_sigma double precision default 1,
  p_n_quad integer default 61,
  p_amplitude double precision default 5
) returns table (theta double precision, se double precision, n_items integer)
  language sql immutable set search_path = ''
as $$
  with itens as (
    select u.x, u.b from unnest(coalesce(p_scores, '{}'::smallint[]), coalesce(p_b, '{}'::double precision[])) as u (x, b)
    where u.x is not null and u.b is not null
  ), grade as (
    select p_mu + p_sigma * p_amplitude * (2.0 * k / (p_n_quad - 1) - 1) as t
    from generate_series(0, greatest(p_n_quad, 2) - 1) as k
  ), lp as (
    select g.t,
           -0.5 * power((g.t - p_mu) / p_sigma, 2)
           + coalesce(sum(case when i.x = 1 then -ln(1 + exp(i.b - g.t)) else -ln(1 + exp(g.t - i.b)) end), 0) as lp
    from grade g left join itens i on true
    group by g.t
  ), w as (
    select lp.t, exp(lp.lp - max(lp.lp) over ()) as w from lp
  ), m as (
    select sum(w.w * w.t) / sum(w.w) as theta from w
  )
  select m.theta,
         sqrt(sum(w.w * power(w.t - m.theta, 2)) / sum(w.w)),
         (select count(*)::int from itens)
  from w cross join m
  group by m.theta
$$;

-- Escala StaziaMed: 50 + 10·θ, 1 casa decimal, de 0 a 100.
create or replace function public.irt_scale(p_theta double precision) returns double precision
  language sql immutable set search_path = ''
as $$
  select least(100, greatest(0, round((50 + 10 * p_theta)::numeric, 1)))::double precision
$$;

-- θ, EP, faixa de 95% e nota StaziaMed (com a faixa) para um conjunto de respostas (1/0/nula) e dificuldades.
create or replace function public.irt_estimar_theta(
  p_scores smallint[],
  p_b double precision[],
  p_mu double precision default 0,
  p_sigma double precision default 1
) returns jsonb
  language plpgsql immutable set search_path = ''
as $$
declare
  e record;
  v_correct integer;
begin
  if coalesce(cardinality(p_scores), 0) <> coalesce(cardinality(p_b), 0) then
    raise exception 'Respostas e dificuldades precisam ter o mesmo tamanho.' using errcode = '22023';
  end if;
  if p_sigma is null or p_sigma <= 0 then
    raise exception 'Desvio do prior inválido.' using errcode = '22023';
  end if;
  select * into e from public.irt_eap(p_scores, p_b, coalesce(p_mu, 0), p_sigma);
  select count(*)::int into v_correct
  from unnest(coalesce(p_scores, '{}'::smallint[]), coalesce(p_b, '{}'::double precision[])) as u (x, b)
  where u.x = 1 and u.b is not null;
  return jsonb_build_object(
    'method', 'EAP',
    'prior', jsonb_build_object('mu', coalesce(p_mu, 0), 'sigma', p_sigma),
    'scale', jsonb_build_object('media', 50, 'por_logit', 10),
    'theta', e.theta,
    'se', e.se,
    'theta_lo', e.theta - 1.96 * e.se,
    'theta_hi', e.theta + 1.96 * e.se,
    'nota', public.irt_scale(e.theta),
    'nota_lo', public.irt_scale(e.theta - 1.96 * e.se),
    'nota_hi', public.irt_scale(e.theta + 1.96 * e.se),
    'n_items', e.n_items,
    'n_correct', v_correct
  );
end
$$;

-- ================================================================ dificuldade de uma questão (interna)
-- A da tabela (percentual ou Rasch); sem linha, a provisória pelo nível do blueprint (sem nível: 0).
create or replace function public.irt_item_difficulty(p_question_id text)
  returns table (b double precision, estado text, origem text, n_resp integer)
  language sql stable security definer set search_path = ''
as $$
  select coalesce(p.b, case d.difficulty_estimate when 'LOW' then -1 when 'HIGH' then 1 else 0 end)::double precision,
         coalesce(p.estado, 'provisoria'),
         coalesce(p.origem, case when d.difficulty_estimate in ('LOW', 'MODERATE', 'HIGH') then 'nivel' else 'padrao' end),
         coalesce(p.n_resp, 0)
  from (select p_question_id as id) x
  left join public.irt_item_params p on p.question_id = x.id
  left join public.question_dna d on d.question_id = x.id
$$;

-- ================================================================ resultado em JSON (interna)
create or replace function public.irt_result_json(r public.irt_session_results) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'scoring', 'irt',
    'ready', true,
    'label', 'Estimativa StaziaMed, não é a nota do Inep',
    'method', r.method,
    'prior', jsonb_build_object('mu', r.prior_mu, 'sigma', r.prior_sigma),
    'scale', jsonb_build_object('media', 50, 'por_logit', 10),
    'theta', r.theta, 'se', r.se, 'theta_lo', r.theta_lo, 'theta_hi', r.theta_hi,
    'nota', r.nota, 'nota_lo', r.nota_lo, 'nota_hi', r.nota_hi,
    'n_items', r.n_items, 'n_correct', r.n_correct, 'n_blank', r.n_blank, 'n_annulled', r.n_annulled,
    'n_rejected', r.n_rejected, 'n_provisional', r.n_provisional, 'n_calibrated', r.n_calibrated,
    'n_preliminary', r.n_preliminary,
    'by_area', r.by_area, 'by_topic', r.by_topic,
    'computed_at', r.computed_at, 'recomputed_at', r.recomputed_at
  )
$$;

-- ================================================================ corrigir e estimar um simulado TRI (interna)
-- Refaz a matriz da sessão com o gabarito e as dificuldades ATUAIS e grava o resultado. Chamada ao finalizar (gatilho), na
-- recorreção (mudança de gabarito) e, se faltar, ao abrir o resultado. Sessão que não é simulado TRI finalizado: nada.
create or replace function public.irt_score_session(p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_est jsonb;
  v_area jsonb;
  v_topic jsonb;
  c record;
  r public.irt_session_results;
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found or s.kind <> 'simulado' or s.finished_at is null or coalesce(s.config ->> 'scoring', 'classic') <> 'irt' then
    return null;
  end if;

  delete from public.irt_responses where session_id = s.id;
  insert into public.irt_responses (session_id, question_id, user_id, ord, area, topic, selected_option, score, excluded_reason,
                                    key_preliminary, b_used, b_estado, b_origem)
  select s.id, q.id, s.user_id, u.ord, q.area, q.topic, a.selected_option,
         case when x.reason is null then case when a.selected_option = q.correct_option then 1 else 0 end end,
         x.reason,
         public.question_preliminary_info(q.id) is not null,
         d.b, d.estado, d.origem
  from unnest(s.question_ids) with ordinality as u (question_id, ord)
  join public.questions q on q.id = u.question_id
  left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
  cross join lateral public.irt_item_difficulty(q.id) d
  cross join lateral (
    select case
      when q.status = 'annulled'
        or exists (select 1 from public.question_official_answers o
                   where o.question_id = q.id and o.is_current and o.answer_status = 'ANNULLED') then 'anulada'
      when d.estado = 'rejeitado' then 'item_rejeitado'
    end as reason
  ) x
  on conflict (session_id, question_id) do nothing;

  select public.irt_estimar_theta(coalesce(array_agg(t.score order by t.ord), '{}'), coalesce(array_agg(t.b_used order by t.ord), '{}'))
    into v_est
  from public.irt_responses t where t.session_id = s.id and t.score is not null;

  -- por área: acertos × esperado pelo modelo (com o θ geral) e a tendência da área (θ só com as questões dela, faixa larga)
  select coalesce(jsonb_agg(jsonb_build_object(
           'area', g.area, 'n_items', g.n, 'n_correct', g.c,
           'expected', round(g.esperado::numeric, 1)::double precision,
           'theta', g.est -> 'theta', 'se', g.est -> 'se',
           'nota', g.est -> 'nota', 'nota_lo', g.est -> 'nota_lo', 'nota_hi', g.est -> 'nota_hi'
         ) order by g.area), '[]'::jsonb)
    into v_area
  from (
    select t.area, count(*)::int as n, sum(t.score)::int as c,
           sum(1 / (1 + exp(-((v_est ->> 'theta')::double precision - t.b_used)))) as esperado,
           public.irt_estimar_theta(array_agg(t.score order by t.ord), array_agg(t.b_used order by t.ord)) as est
    from public.irt_responses t where t.session_id = s.id and t.score is not null
    group by t.area
  ) g;

  -- por tema: acertos × esperado (poucos itens: só a comparação, sem nota)
  select coalesce(jsonb_agg(jsonb_build_object(
           'area', g.area, 'topic', g.topic, 'n_items', g.n, 'n_correct', g.c,
           'expected', round(g.esperado::numeric, 1)::double precision
         ) order by g.area, g.topic), '[]'::jsonb)
    into v_topic
  from (
    select t.area, t.topic, count(*)::int as n, sum(t.score)::int as c,
           sum(1 / (1 + exp(-((v_est ->> 'theta')::double precision - t.b_used)))) as esperado
    from public.irt_responses t where t.session_id = s.id and t.score is not null
    group by t.area, t.topic
  ) g;

  select count(*) filter (where t.score is not null and t.selected_option is null)::int as n_blank,
         count(*) filter (where t.excluded_reason = 'anulada')::int as n_annulled,
         count(*) filter (where t.excluded_reason = 'item_rejeitado')::int as n_rejected,
         count(*) filter (where t.score is not null and t.b_estado = 'provisoria')::int as n_provisional,
         count(*) filter (where t.score is not null and t.b_estado = 'calibrada')::int as n_calibrated,
         count(*) filter (where t.score is not null and t.key_preliminary)::int as n_preliminary
    into c
  from public.irt_responses t where t.session_id = s.id;

  insert into public.irt_session_results as cur (
    session_id, user_id, method, prior_mu, prior_sigma, theta, se, theta_lo, theta_hi, nota, nota_lo, nota_hi,
    n_items, n_correct, n_blank, n_annulled, n_rejected, n_provisional, n_calibrated, n_preliminary, by_area, by_topic)
  values (
    s.id, s.user_id, 'EAP', 0, 1,
    (v_est ->> 'theta')::double precision, (v_est ->> 'se')::double precision,
    (v_est ->> 'theta_lo')::double precision, (v_est ->> 'theta_hi')::double precision,
    (v_est ->> 'nota')::double precision, (v_est ->> 'nota_lo')::double precision, (v_est ->> 'nota_hi')::double precision,
    (v_est ->> 'n_items')::int, (v_est ->> 'n_correct')::int, c.n_blank, c.n_annulled, c.n_rejected, c.n_provisional,
    c.n_calibrated, c.n_preliminary, v_area, v_topic)
  on conflict (session_id) do update set
    theta = excluded.theta, se = excluded.se, theta_lo = excluded.theta_lo, theta_hi = excluded.theta_hi,
    nota = excluded.nota, nota_lo = excluded.nota_lo, nota_hi = excluded.nota_hi,
    n_items = excluded.n_items, n_correct = excluded.n_correct, n_blank = excluded.n_blank, n_annulled = excluded.n_annulled,
    n_rejected = excluded.n_rejected, n_provisional = excluded.n_provisional, n_calibrated = excluded.n_calibrated,
    n_preliminary = excluded.n_preliminary, by_area = excluded.by_area, by_topic = excluded.by_topic,
    recomputed_at = clock_timestamp(), times_computed = cur.times_computed + 1
  returning * into r;

  return public.irt_result_json(r);
end
$$;

-- ================================================================ aluno: iniciar o simulado TRI
-- O MESMO simulado de sempre (app_start_session: sorteio, trava do plano, cronômetro), com a correção TRI guardada na sessão.
-- Roda como a própria pessoa (como app_start_session). Pelo menos 30 questões (a faixa fica larga demais com menos).
create or replace function public.app_start_simulado_tri(
  p_filters jsonb,
  p_count integer,
  p_time_limit_seconds integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v jsonb;
begin
  if coalesce(p_count, 0) < 30 then
    raise exception 'O simulado TRI precisa de pelo menos 30 questões (a estimativa fica mais precisa com 100).' using errcode = '22023';
  end if;
  v := public.app_start_session('simulado', p_filters, p_count, p_time_limit_seconds);
  if (v ->> 'count')::int < 30 then
    raise exception 'Com esses filtros há só % questões; o simulado TRI precisa de pelo menos 30 questões.', v ->> 'count'
      using errcode = '22023';
  end if;
  update public.practice_sessions
    set config = config || jsonb_build_object('scoring', 'irt', 'scoring_version', 1)
    where id = (v ->> 'session_id')::uuid;
  return v || jsonb_build_object('scoring', 'irt');
end
$$;

-- ================================================================ aluno: o resultado TRI de uma sessão sua
-- {scoring:'classic'} no modo clássico; {scoring:'irt', ready:false} antes de finalizar; senão o resultado (calcula se faltar).
create or replace function public.app_session_irt_result(p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.practice_sessions;
  r public.irt_session_results;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  select * into s from public.practice_sessions where id = p_session_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if s.kind <> 'simulado' or coalesce(s.config ->> 'scoring', 'classic') <> 'irt' then
    return jsonb_build_object('scoring', 'classic');
  end if;
  if s.finished_at is null then
    return jsonb_build_object('scoring', 'irt', 'ready', false, 'label', 'Estimativa StaziaMed, não é a nota do Inep');
  end if;
  select * into r from public.irt_session_results where session_id = s.id;
  if not found then
    return public.irt_score_session(s.id);
  end if;
  return public.irt_result_json(r);
end
$$;

-- ================================================================ servidor: matriz para a calibração
create or replace function public.irt_calibration_matrix()
  returns table (person text, question_id text, area public.med_area, score smallint)
  language sql stable security definer set search_path = ''
as $$
  with sess as (
    -- simulado finalizado com pelo menos 80% respondido (mesmo critério da gamificação)
    select s.id, s.user_id, s.started_at, s.question_ids
    from public.practice_sessions s
    where s.kind in ('simulado', 'prova') and s.finished_at is not null
      and (select count(*) from public.question_attempts a where a.session_id = s.id) >= ceil(0.8 * cardinality(s.question_ids))
  ), cells as (
    select s.user_id, s.id as session_id, u.question_id
    from sess s cross join lateral unnest(s.question_ids) as u (question_id)
  ), exposures as (
    -- toda vez que o aluno viu a questão (ou a equivalente de outra prova): respostas em qualquer sessão (no início da sessão;
    -- sem sessão, na hora da resposta) e as questões de todo simulado aberto
    select a.user_id, coalesce(e.group_id, a.question_id) as grp, coalesce(ps.started_at, a.answered_at) as at, a.session_id
    from public.question_attempts a
    left join public.practice_sessions ps on ps.id = a.session_id
    left join public.question_equivalents e on e.question_id = a.question_id
    union all
    select s.user_id, coalesce(e.group_id, u.question_id), s.started_at, s.id
    from public.practice_sessions s
    cross join lateral unnest(s.question_ids) as u (question_id)
    left join public.question_equivalents e on e.question_id = u.question_id
    where s.kind in ('simulado', 'prova')
  ), first_seen as (
    select distinct on (x.user_id, x.grp) x.user_id, x.grp, x.session_id
    from exposures x
    order by x.user_id, x.grp, x.at, x.session_id
  )
  select md5(c.user_id::text), q.id, q.area,
         (case when a.selected_option = q.correct_option then 1 else 0 end)::smallint
  from cells c
  join public.questions q on q.id = c.question_id
  left join public.question_equivalents e on e.question_id = q.id
  join first_seen f on f.user_id = c.user_id and f.grp = coalesce(e.group_id, q.id) and f.session_id = c.session_id
  left join public.question_attempts a on a.session_id = c.session_id and a.question_id = q.id
  where q.status <> 'annulled'
    and not exists (select 1 from public.question_official_answers o
                    where o.question_id = q.id and o.is_current and o.answer_status = 'ANNULLED')
$$;

-- ================================================================ servidor: dificuldade provisória pelo percentual de acerto
create or replace function public.irt_refresh_provisional() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_run uuid;
  v_saved integer;
begin
  insert into public.irt_calibration_runs (method, notes) values ('percentual', jsonb_build_object('minimo_respostas', 10))
  returning id into v_run;
  with m as (
    select x.question_id, count(*)::int as n, sum(x.score)::int as c
    from public.irt_calibration_matrix() x
    group by x.question_id
    having count(*) >= 10
  )
  insert into public.irt_item_params as cur (question_id, b, se_b, n_resp, n_correct, origem, estado, run_id, updated_at)
  select m.question_id, ln((1 - p) / p), null, m.n, m.c, 'percentual', 'provisoria', v_run, now()
  from m cross join lateral (select (m.c + 0.5) / (m.n + 1.0) as p) pp
  on conflict (question_id) do update set
    b = excluded.b, se_b = null, n_resp = excluded.n_resp, n_correct = excluded.n_correct, infit = null, outfit = null,
    origem = 'percentual', estado = 'provisoria', reject_reason = null, run_id = excluded.run_id, updated_at = now()
  where cur.origem <> 'rasch';   -- não passa por cima de uma dificuldade do Rasch
  get diagnostics v_saved = row_count;
  update public.irt_calibration_runs set n_items = v_saved where id = v_run;
  return jsonb_build_object('run_id', v_run, 'saved', v_saved);
end
$$;

-- ================================================================ servidor: gravar a calibração do Rasch (script scripts/tri/calibrar.ts)
-- p_items: [{question_id, b, se_b?, n_resp, n_correct?, infit?, outfit?, reject_reason?}]. Confere e grava; < 30 respostas é
-- ignorado; |b| > 6,5 vira rejeitado (NT 42/2025); |b| > 10 ou b ausente é recusado (erro na conta do script).
create or replace function public.irt_save_calibration(p_method text, p_items jsonb, p_notes jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_run uuid;
  it jsonb;
  v_b double precision;
  v_n integer;
  v_reason text;
  v_saved integer := 0;
  v_ignored integer := 0;
begin
  if p_method is null or p_method not in ('jmle', 'cmle') then
    raise exception 'Método de calibração inválido: %', p_method using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'A lista de itens precisa ser uma lista.' using errcode = '22023';
  end if;
  insert into public.irt_calibration_runs (method, n_persons, n_responses, notes)
  values (p_method, nullif(p_notes ->> 'n_persons', '')::int, nullif(p_notes ->> 'n_responses', '')::int, coalesce(p_notes, '{}'::jsonb))
  returning id into v_run;

  for it in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.questions q where q.id = it ->> 'question_id') then
      raise exception 'Questão desconhecida na calibração: %', it ->> 'question_id' using errcode = '22023';
    end if;
    v_b := nullif(it ->> 'b', '')::double precision;
    if v_b is null or abs(v_b) > 10 or v_b = 'NaN'::double precision then
      raise exception 'Dificuldade fora da faixa (de −10 a 10) na questão %: %', it ->> 'question_id', it ->> 'b' using errcode = '22023';
    end if;
    v_n := coalesce(nullif(it ->> 'n_resp', '')::int, 0);
    if v_n < 30 then
      v_ignored := v_ignored + 1;
      continue;
    end if;
    v_reason := coalesce(nullif(btrim(it ->> 'reject_reason'), ''), case when abs(v_b) > 6.5 then '|b| > 6,5' end);
    insert into public.irt_item_params (question_id, b, se_b, n_resp, n_correct, infit, outfit, origem, estado, reject_reason, run_id, updated_at)
    values (it ->> 'question_id', v_b, nullif(it ->> 'se_b', '')::double precision, v_n, coalesce(nullif(it ->> 'n_correct', '')::int, 0),
            nullif(it ->> 'infit', '')::double precision, nullif(it ->> 'outfit', '')::double precision, 'rasch',
            case when v_reason is not null then 'rejeitado' when v_n >= 100 then 'calibrada' else 'provisoria' end,
            v_reason, v_run, now())
    on conflict (question_id) do update set
      b = excluded.b, se_b = excluded.se_b, n_resp = excluded.n_resp, n_correct = excluded.n_correct, infit = excluded.infit,
      outfit = excluded.outfit, origem = 'rasch', estado = excluded.estado, reject_reason = excluded.reject_reason,
      run_id = excluded.run_id, updated_at = now();
    v_saved := v_saved + 1;
  end loop;

  update public.irt_calibration_runs set n_items = v_saved where id = v_run;
  return jsonb_build_object('run_id', v_run, 'saved', v_saved, 'ignored', v_ignored);
end
$$;

-- ================================================================ recorreção: refaz os simulados TRI que têm a questão
create or replace function public.irt_regrade_question(p_question_id text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_session uuid;
  v_n integer := 0;
begin
  for v_session in select distinct t.session_id from public.irt_responses t where t.question_id = p_question_id loop
    perform public.irt_score_session(v_session);
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- ================================================================ gatilhos
-- Ao finalizar um simulado TRI: calcula. Um erro aqui NUNCA impede o aluno de finalizar (o resultado é refeito ao abrir).
create or replace function public.irt_on_session_finish() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.irt_score_session(new.id);
  exception when others then
    raise warning 'Simulado TRI %: a estimativa não foi calculada agora (%); será refeita ao abrir o resultado.', new.id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists practice_sessions_irt_score on public.practice_sessions;
create trigger practice_sessions_irt_score after update of finished_at on public.practice_sessions
  for each row when (new.finished_at is not null and old.finished_at is null and new.kind = 'simulado'
                     and new.config ->> 'scoring' = 'irt')
  execute function public.irt_on_session_finish();

-- Mudou o gabarito ou a anulação da questão, ou entrou um gabarito oficial novo (preliminar → definitivo): recorrige.
create or replace function public.irt_on_answer_key_change() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    -- (dois ramos: NEW é uma questão ou um gabarito oficial; o campo que não existe nem é lido)
    if tg_table_name = 'questions' then
      perform public.irt_regrade_question(new.id);
    else
      perform public.irt_regrade_question(new.question_id);
    end if;
  exception when others then
    raise warning 'Simulado TRI: recorreção da questão não foi feita agora (%).', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists questions_irt_regrade on public.questions;
create trigger questions_irt_regrade after update of correct_option, status on public.questions
  for each row when (old.correct_option is distinct from new.correct_option or old.status is distinct from new.status)
  execute function public.irt_on_answer_key_change();
drop trigger if exists question_official_answers_irt_regrade on public.question_official_answers;
create trigger question_official_answers_irt_regrade after insert on public.question_official_answers
  for each row execute function public.irt_on_answer_key_change();

-- ================================================================ quem executa o quê
revoke execute on function public.irt_item_difficulty(text) from public, anon, authenticated;
revoke execute on function public.irt_result_json(public.irt_session_results) from public, anon, authenticated;
revoke execute on function public.irt_score_session(uuid) from public, anon, authenticated;
revoke execute on function public.irt_calibration_matrix() from public, anon, authenticated;
revoke execute on function public.irt_refresh_provisional() from public, anon, authenticated;
revoke execute on function public.irt_save_calibration(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.irt_regrade_question(text) from public, anon, authenticated;
revoke execute on function public.irt_on_session_finish() from public, anon, authenticated;
revoke execute on function public.irt_on_answer_key_change() from public, anon, authenticated;
grant execute on function public.irt_calibration_matrix() to service_role;
grant execute on function public.irt_refresh_provisional() to service_role;
grant execute on function public.irt_save_calibration(text, jsonb, jsonb) to service_role;
grant execute on function public.irt_regrade_question(text) to service_role;

revoke execute on function public.app_start_simulado_tri(jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_simulado_tri(jsonb, integer, integer) to authenticated;
revoke execute on function public.app_session_irt_result(uuid) from public, anon;
grant execute on function public.app_session_irt_result(uuid) to authenticated;
-- a conta pura (sem tabela) fica aberta aos logados: não lê nada do banco
revoke execute on function public.irt_eap(smallint[], double precision[], double precision, double precision, integer, double precision) from public, anon;
revoke execute on function public.irt_estimar_theta(smallint[], double precision[], double precision, double precision) from public, anon;
revoke execute on function public.irt_scale(double precision) from public, anon;
grant execute on function public.irt_eap(smallint[], double precision[], double precision, double precision, integer, double precision) to authenticated, service_role;
grant execute on function public.irt_estimar_theta(smallint[], double precision[], double precision, double precision) to authenticated, service_role;
grant execute on function public.irt_scale(double precision) to authenticated, service_role;
