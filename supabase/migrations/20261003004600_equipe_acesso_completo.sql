-- =============================================================================
-- Equipe com acesso completo e sem período de teste.
-- Pedido de 2026-10-06: "Administrador tem todas as funções, assim como editor também; não tem período de teste para ele."
--
-- Antes: o administrador já abria o conteúdo Pro e usava o Tutor como assinante, mas o EDITOR caía no teste grátis
-- (conteúdo Pro fechado e o teste de 7 dias do Tutor); e os dois viam o aviso do teste grátis no Início, porque toda conta
-- nasce com o teste (handle_new_user).
-- Agora: papel de equipe (administrador ou editor) = acesso completo do app, como o melhor plano, enquanto tiver o papel,
-- e nenhum período de teste. A assinatura da pessoa fica como está (é o registro de cobrança): se ela sair da equipe, volta
-- a valer o que estiver lá. O que é só do administrador na administração (usuários, papéis, planos, configurações) não muda.
-- Os limites diários de uso de IA do Tutor (custo) são os dos planos pagos, ajustáveis no painel do Tutor.
-- =============================================================================

-- Pessoa da equipe, pelo id (as funções de serviço não têm auth.uid()).
create function public.user_is_staff(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_roles r where r.user_id = p_user and r.role in ('admin', 'editor')) $$;
revoke execute on function public.user_is_staff(uuid) from public, anon, authenticated;

-- Conteúdo marcado como Pro (estações): equipe ou plano Pro/Elite ativo. Antes: só administrador.
create or replace function public.has_pro() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_staff() or exists (
    select 1 from public.subscriptions s
    where s.user_id = (select auth.uid())
      and s.plan in ('pro', 'elite')
      and s.status in ('active', 'past_due')
  )
$$;

create or replace function public.tutor_is_pro(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.user_is_staff(p_user)
      or exists (select 1 from public.subscriptions s where s.user_id = p_user and s.plan in ('pro', 'elite') and s.status in ('active', 'past_due'))
$$;

-- Tutor: igual ao anterior (…3500), mas a equipe entra como assinante (nunca no teste) e a resposta diz "staff".
create or replace function public.tutor_entitlement(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.subscriptions;
  v_staff boolean;
  v_paid boolean;
  v_days integer := coalesce((select (x.value #>> '{}')::integer from public.app_settings x where x.key = 'trial_days'), 7);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mode text;
  v_trial text := 'none';
  v_ends timestamptz;
  v_text_limit integer; v_text_used integer;
  v_vday integer; v_vday_used integer; v_vtotal integer; v_vtotal_used integer := 0; v_vleft integer;
  v_qlimit integer; v_qused integer;
  v_block text;
begin
  select * into c from public.tutor_config;
  select * into s from public.subscriptions where user_id = p_user;
  v_staff := public.user_is_staff(p_user);
  v_paid := v_staff or coalesce(s.plan in ('pro', 'elite') and s.status in ('active', 'past_due'), false);
  if v_paid or not c.requires_pro then
    v_mode := 'paid';
  elsif s.tutor_trial_started_at is null then
    v_mode := 'trial'; v_trial := 'available';
  elsif now() < s.tutor_trial_started_at + make_interval(days => v_days) then
    v_mode := 'trial'; v_trial := 'active'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  else
    v_mode := 'blocked'; v_trial := 'expired'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  end if;

  v_text_used := coalesce((select u.requests from public.ai_usage u where u.user_id = p_user and u.day = v_today), 0);
  v_text_limit := case v_mode when 'paid' then c.daily_message_limit when 'trial' then c.trial_text_daily else 0 end;
  v_vday := case when not c.voice_enabled then 0 when v_mode = 'paid' then c.paid_voice_daily_seconds when v_mode = 'trial' then c.trial_voice_daily_seconds else 0 end;
  v_vday_used := public.tutor_voice_seconds(p_user, v_today, null);
  if v_mode = 'trial' then
    v_vtotal := c.trial_voice_total_seconds;
    if s.tutor_trial_started_at is not null then v_vtotal_used := public.tutor_voice_seconds(p_user, null, s.tutor_trial_started_at); end if;
  end if;
  v_vleft := greatest(0, least(v_vday - v_vday_used, coalesce(v_vtotal - v_vtotal_used, 2147483647)));
  v_qlimit := case when v_mode = 'trial' then c.trial_questions_daily end;
  v_qused := (select count(*)::int from public.tutor_answers a where a.user_id = p_user and (a.answered_at at time zone 'America/Sao_Paulo')::date = v_today);
  v_block := case when not c.enabled then 'disabled' when v_mode = 'blocked' then 'trial_expired' end;

  return jsonb_build_object(
    'enabled', c.enabled, 'mode', v_mode, 'plan', coalesce(s.plan::text, 'trial'), 'is_paid', v_paid, 'staff', v_staff,
    'trial', jsonb_build_object('state', v_trial, 'days', v_days, 'started_at', s.tutor_trial_started_at, 'ends_at', v_ends,
                                'day', case when v_trial = 'active' then least(v_days, floor(extract(epoch from (now() - s.tutor_trial_started_at)) / 86400)::int + 1) end),
    'text', jsonb_build_object('used', v_text_used, 'limit', v_text_limit, 'remaining', greatest(0, v_text_limit - v_text_used)),
    'voice', jsonb_build_object('enabled', c.voice_enabled, 'limit_today_s', v_vday, 'used_today_s', v_vday_used, 'remaining_today_s', greatest(0, v_vday - v_vday_used),
                                'limit_total_s', v_vtotal, 'used_total_s', case when v_vtotal is not null then v_vtotal_used end,
                                'remaining_total_s', case when v_vtotal is not null then greatest(0, v_vtotal - v_vtotal_used) end, 'remaining_s', v_vleft),
    'questions', jsonb_build_object('used', v_qused, 'limit', v_qlimit, 'remaining', case when v_qlimit is not null then greatest(0, v_qlimit - v_qused) end),
    'can_use', c.enabled and v_mode <> 'blocked',
    'can_text', c.enabled and v_mode <> 'blocked' and v_text_used < v_text_limit,
    'can_voice', c.enabled and v_mode <> 'blocked' and c.voice_enabled and v_vleft > 0,
    'block_reason', v_block);
end
$$;

-- Início: igual ao anterior (…4300); o aviso do teste grátis não aparece para a equipe.
create or replace function public.app_home() returns jsonb
  language sql stable set search_path = ''
as $$
  with my as (
    select a.is_correct, (a.answered_at at time zone 'America/Sao_Paulo')::date as day, q.area
    from public.question_attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = (select auth.uid()) and q.status <> 'annulled'
  ),
  totals as (
    select count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from my
  )
  select jsonb_build_object(
    'attempts', (select attempts from totals),
    'correct', (select correct from totals),
    'today', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int)
      from my where day = public.today_br()),
    'week', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int,
                                'days_active', count(distinct day)::int)
      from my where day > public.today_br() - 7),
    'previous_week', (
      select jsonb_build_object('attempts', count(*)::int, 'correct', count(*) filter (where is_correct)::int)
      from my where day > public.today_br() - 14 and day <= public.today_br() - 7),
    'wrong_pending', (select count(*)::int from public.my_error_notebook e where e.status = 'para_revisar'),
    'areas', (
      select jsonb_agg(jsonb_build_object('area', e.area, 'attempts', coalesce(s.attempts, 0), 'correct', coalesce(s.correct, 0))
                       order by e.area)
      from unnest(enum_range(null::public.med_area)) as e (area)
      left join (
        select area, count(*)::int as attempts, count(*) filter (where is_correct)::int as correct from my group by area
      ) s on s.area = e.area),
    -- Temas com questão errada ainda não superada, dos de pior acurácia para os melhores.
    'priority_topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', p.area, 'topic', p.topic, 'pending', p.pending, 'attempts', p.attempts,
                                          'correct', p.correct, 'questions', p.questions)
                       order by p.accuracy, p.pending desc, p.topic)
      from (
        select e.area, e.topic, count(*)::int as pending, st.attempts, st.correct, st.accuracy,
               (select count(*)::int from public.questions q
                where q.area = e.area and q.topic = e.topic and q.status <> 'annulled') as questions
        from public.my_error_notebook e
        join public.my_topic_stats st on st.area = e.area and st.topic = e.topic
        where e.status = 'para_revisar'
        group by e.area, e.topic, st.attempts, st.correct, st.accuracy
        order by st.accuracy, count(*) desc, e.topic
        limit 4
      ) p
    ), '[]'::jsonb),
    -- Treino ou simulado em aberto (e ainda dentro do tempo, sem contar as pausas) para continuar.
    'open_session', (
      select jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'total', cardinality(s.question_ids),
        'area', s.config -> 'filters' ->> 'area', 'status', s.config -> 'filters' ->> 'status',
        'answered', case when s.kind = 'simulado'
                         then (select count(*)::int from jsonb_object_keys(s.answers))
                         else (select count(*)::int from public.question_attempts a where a.session_id = s.id) end,
        'paused', s.paused_at is not null,
        'remaining_seconds', case when s.time_limit_seconds is not null
                                  then greatest(ceil(extract(epoch from public.practice_deadline(s) - now())), 0)::int end)
      from public.practice_sessions s
      where s.user_id = (select auth.uid()) and s.finished_at is null
        and (s.time_limit_seconds is null or now() <= public.practice_deadline(s))
      order by s.started_at desc
      limit 1),
    -- Equipe não tem período de teste.
    'trial', (
      select case when sub.status = 'trialing' and sub.trial_ends_at is not null and not public.is_staff() then
        jsonb_build_object('ends_at', sub.trial_ends_at,
                           'days_left', greatest(ceil(extract(epoch from (sub.trial_ends_at - now())) / 86400.0)::int, 0))
      end
      from public.subscriptions sub where sub.user_id = (select auth.uid()))
  )
$$;

-- Visão geral: igual à anterior (…1300), mas a contagem de planos é só de alunos (a equipe tem acesso pelo papel, não
-- conta como "em teste" nem como assinante); a equipe aparece em "por papel".
create or replace function public.app_admin_overview() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*)::int from auth.users),
      'new_7d', (select count(*)::int from auth.users where created_at > now() - interval '7 days'),
      'active_7d', (select count(distinct x.user_id)::int from (
        select user_id from public.question_attempts where answered_at > now() - interval '7 days'
        union all
        select user_id from public.flashcard_reviews where reviewed_at > now() - interval '7 days') x),
      'by_role', (select coalesce(jsonb_object_agg(r.role::text, r.n), '{}'::jsonb)
                  from (select role, count(*)::int as n from public.user_roles group by role) r),
      'by_plan', (select coalesce(jsonb_object_agg(s.k, s.n), '{}'::jsonb)
                  from (select plan || ':' || status as k, count(*)::int as n from public.subscriptions x
                        where not public.user_is_staff(x.user_id) group by plan, status) s)
    ),
    'questions', jsonb_build_object(
      'total', (select count(*)::int from public.questions),
      'annulled', (select count(*)::int from public.questions where status = 'annulled'),
      'needs_image', (select count(*)::int from public.questions where needs_image and jsonb_array_length(images) = 0),
      'exams', (select count(*)::int from public.exams)
    ),
    'activity', jsonb_build_object(
      'attempts', (select count(*)::int from public.question_attempts),
      'attempts_7d', (select count(*)::int from public.question_attempts where answered_at > now() - interval '7 days'),
      'flashcard_reviews', (select count(*)::int from public.flashcard_reviews)
    ),
    'stations', jsonb_build_object(
      'pending', (select count(*)::int from public.checklist_stations where medical_review = 'pending'),
      'approved', (select count(*)::int from public.checklist_stations where medical_review = 'approved'),
      'reports', (select count(*)::int from public.checklist_station_reports)
    )
  );
end
$$;

-- Para desfazer: recriar has_pro, tutor_is_pro e app_admin_overview das migrações …0100, …3100 e …1300, tutor_entitlement de
-- …3500 e app_home de …4300; depois "drop function public.user_is_staff(uuid)".
