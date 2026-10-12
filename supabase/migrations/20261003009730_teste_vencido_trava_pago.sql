-- =============================================================================
-- PL02 (decisão do dono de 2026-10-11): teste grátis VENCIDO conta como "sem acesso pago". Pode ser colada de novo no Supabase sem
-- estragar nada (tudo é "create or replace" ou conferido). Depende da 9550 já aplicada (subscription_is_paid, user_has_full_access). Esta migração também cria a tabela plan_benefits (usada pela 9731).
--
-- O que é pago de verdade (fecha para quem não tem plano pago válido nem teste grátis valendo):
--   * Tutor        - tutor_entitlement: quem não tem acesso pago e nunca começou o teste grátis do Tutor deixa de poder começar
--                    um (ele segue o "Seu teste grátis terminou" do Tutor). Quem já começou o teste do Tutor segue até o prazo
--                    PRÓPRIO dele (prazo do teste do Tutor é o CF03, ainda a definir pelo dono: não muda aqui).
--   * Simulados    - app_start_session('simulado', ...) recusa com mensagem em português (simulado_gate). Quem já abriu um simulado
--                    termina o que está aberto.
--   * Estações Pro - has_pro (9550) já exige plano pago válido ou acesso completo; teste (vencido ou não) nunca abriu Pro. Nada muda.
--   Seguem abertos: questões e flashcards (e o resto que hoje já é aberto).
-- Quem NÃO é afetado: equipe (administrador e editor), revisor médico (user_has_full_access) e quem tem plano pago válido
--   (subscription_is_paid, com a tolerância de 3 dias do pagamento pendente). Quem está com teste grátis dentro do prazo também não.
-- "Teste valendo" = situação "Em teste" com a data de fim no futuro (ou sem data de fim registrada; a Administração sempre pede a data).
-- "Sem acesso pago" vale também para plano pago vencido/cancelado/expirado e para conta sem assinatura (cadastro sem teste, PL06).
-- Nenhum dado é alterado; o fim do teste é calculado na hora (a situação no banco segue "Em teste").
--
-- ATENÇÃO antes de colar: quem aparece nesta consulta perde os simulados completos na hora e (se a coluna Tutor disser "Perde") não consegue
-- mais começar o teste do Tutor. Entram: teste grátis vencido, plano pago vencido/cancelado/expirado, cadastro sem teste e CONTA SEM
-- NENHUMA LINHA DE ASSINATURA (por isso a consulta parte dos usuários e não das assinaturas). Administrador, editor e revisor médico ficam de fora.
-- A coluna Tutor diz o que acontece com o Tutor: "Perde o Tutor" (a chave do Tutor cobra plano pago), "Segue ..." (já começou o teste do
-- Tutor, que vale até o prazo próprio dele) ou "Aberto a todos ..." (a chave "Planos pagos + teste grátis" do painel do Tutor está DESLIGADA:
-- o Tutor está aberto a todos por decisão do dono e esta migração não mexe nisso).
--   select u.email as "E-mail", s.plan as "Plano", s.status as "Situação", s.trial_ends_at as "Teste até", s.current_period_end as "Plano pago até",
--          case when not (select c.requires_pro from public.tutor_config c) then 'Aberto a todos (a chave do Tutor está desligada)'
--               when s.tutor_trial_started_at is not null
--                    and now() < s.tutor_trial_started_at + make_interval(days => coalesce((select (x.value #>> '{}')::integer from public.app_settings x where x.key = 'trial_days'), 7))
--                 then 'Segue até o fim do teste do Tutor'
--               else 'Perde o Tutor' end as "Tutor"
--   from auth.users u left join public.subscriptions s on s.user_id = u.id
--   where not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role in ('admin', 'editor'))
--     and not exists (select 1 from public.ch_reviewer_areas a where a.user_id = u.id)
--     and not coalesce(s.plan in ('pro', 'elite') and ((s.status = 'active' and s.current_period_end > now())
--                                                      or (s.status = 'past_due' and s.current_period_end + interval '3 days' > now())), false)
--     and not coalesce(s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()), false)
--   order by u.email;
-- Se a lista vier vazia, ninguém perde nada. Para quem deve continuar com acesso, dê um plano ou um teste em Administração > Usuários.
--
-- ORDEM E RECOLAGEM: cole 9730, 9731 e 9732 nessa ordem. A 9730 já traz a versão FINAL de tutor_entitlement (inclusive os minutos de voz do
-- Elite, que a 9731 configura); por isso colar a 9730 de novo depois da 9731 NÃO tira nada do que o dono preencheu.
-- =============================================================================

-- ---------------------------------------------------------------- teste valendo
create or replace function public.subscription_trial_is_valid(p_status public.subscription_status, p_trial_ends_at timestamptz)
  returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce(p_status = 'trialing' and (p_trial_ends_at is null or p_trial_ends_at > now()), false)
$$;
revoke execute on function public.subscription_trial_is_valid(public.subscription_status, timestamptz) from public, anon, authenticated;

-- Sem acesso completo (equipe, revisor médico), sem plano pago válido e sem teste valendo. Interna.
create or replace function public.user_without_paid_access(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_user is not null
     and not public.user_has_full_access(p_user)
     and not exists (
       select 1 from public.subscriptions s
       where s.user_id = p_user
         and (public.subscription_is_paid(s.plan, s.status, s.current_period_end)
              or public.subscription_trial_is_valid(s.status, s.trial_ends_at)))
$$;
revoke execute on function public.user_without_paid_access(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- o aviso (uma regra só, para o banco e para as telas)
-- Interna. null = tem acesso. Senão: o motivo ("teste_acabou", "plano_acabou" ou "sem_teste") e se o Tutor está FECHADO para essa pessoa
-- (o que o próprio tutor_entitlement decide: com a chave do Tutor desligada, ou com o teste do Tutor ainda valendo, o Tutor NÃO está fechado
-- e o aviso não diz que ele é pago).
create or replace function public.user_plan_lock(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  if p_user is null or not public.user_without_paid_access(p_user) then return null; end if;
  select * into s from public.subscriptions where user_id = p_user;
  return jsonb_build_object(
    'state', case when s.plan = 'trial' and s.trial_ends_at is not null then 'teste_acabou'
                  when s.plan in ('pro', 'elite') then 'plano_acabou'
                  else 'sem_teste' end,
    'tutor_closed', (public.tutor_entitlement(p_user) ->> 'mode') = 'blocked');
end
$$;
revoke execute on function public.user_plan_lock(uuid) from public, anon, authenticated;

-- O que as telas perguntam (Início, Conta, Simulados, Tutor) para mostrar o aviso. Se esta função não existe (banco ainda sem a 9730), as
-- telas não mostram aviso nenhum e ficam como antes: o aviso nunca promete o que o banco não faz.
create or replace function public.app_my_access() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lock jsonb := public.user_plan_lock((select auth.uid()));
begin
  if v_lock is null then return jsonb_build_object('locked', false, 'state', null, 'tutor_closed', false); end if;
  return v_lock || jsonb_build_object('locked', true);
end
$$;
revoke execute on function public.app_my_access() from public, anon;
grant execute on function public.app_my_access() to authenticated;

-- ---------------------------------------------------------------- simulados completos
-- Devolve null quando a pessoa logada pode começar um simulado; senão, o aviso em português para ela. Chamada por
-- app_start_session (que roda como a própria pessoa e por isso não enxerga as funções internas).
create or replace function public.simulado_gate() returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lock jsonb := public.user_plan_lock((select auth.uid()));
begin
  if v_lock is null then return null; end if;
  return case v_lock ->> 'state'
           when 'teste_acabou' then 'Seu teste grátis terminou. '
           when 'plano_acabou' then 'Seu plano pago terminou. '
           else '' end
      || case when (v_lock ->> 'tutor_closed')::boolean
           then 'Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.'
           else 'Os simulados completos e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.' end;
end
$$;
revoke execute on function public.simulado_gate() from public, anon;
grant execute on function public.simulado_gate() to authenticated;

-- Igual ao de …1700_question_engine (a mais nova); só ganha a trava do simulado logo depois de conferir o tipo.
create or replace function public.app_start_session(
  p_kind text,
  p_filters jsonb,
  p_count integer,
  p_time_limit_seconds integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_filters constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_count constant integer := least(greatest(coalesce(p_count, 20), 1), 200);
  v_ids text[];
  v_id uuid;
  v_gate text;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para treinar.' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('questoes', 'simulado') then
    raise exception 'Tipo de sessão inválido: %', p_kind using errcode = '22023';
  end if;
  if p_time_limit_seconds is not null and (p_kind <> 'simulado' or p_time_limit_seconds not between 60 and 43200) then
    raise exception 'Tempo limite inválido.' using errcode = '22023';
  end if;
  if p_kind = 'simulado' then
    v_gate := public.simulado_gate();
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
  end if;

  select array_agg(picked.question_id order by picked.rn, picked.r) into v_ids
  from (
    select p.question_id, p.rn, p.r
    from (
      select u.question_id,
             row_number() over (partition by u.area order by random()) as rn,
             random() as r
      from (
        -- uma só questão por grupo de equivalentes (a mesma questão em duas provas)
        select pool.question_id, pool.area,
               row_number() over (partition by coalesce(e.group_id, pool.question_id) order by random()) as dup
        from public.practice_pool(v_filters) pool
        left join public.question_equivalents e on e.question_id = pool.question_id
      ) u
      where u.dup = 1
    ) p
    order by p.rn, p.r
    limit v_count
  ) picked;

  if v_ids is null then
    raise exception 'Nenhuma questão encontrada com esses filtros.' using errcode = 'P0002';
  end if;

  insert into public.practice_sessions (kind, config, question_ids, time_limit_seconds)
  values (p_kind, jsonb_build_object('filters', v_filters, 'requested', v_count), v_ids, p_time_limit_seconds)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'count', cardinality(v_ids));
end
$$;

-- ---------------------------------------------------------------- Tutor
-- Tabela dos benefícios do Elite (PL04, configurada pela 9731). Fica AQUI porque o tutor_entitlement abaixo lê os minutos de voz do Elite:
-- assim esta é a versão FINAL do tutor_entitlement e colar a 9730 de novo, depois da 9731, não tira a voz do Elite. Vazio = igual ao Pro.
create table if not exists public.plan_benefits (
  id boolean primary key default true check (id),
  -- minutos de voz do Tutor por dia do Elite; null = igual ao Pro
  elite_voice_daily_minutes integer check (elite_voice_daily_minutes between 1 and 1440),
  -- correção de estação com devolutiva: só Elite (false = desligado)
  elite_station_feedback boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.plan_benefits enable row level security;
-- Sem política e sem acesso direto: só as funções da 9731 (security definer) leem e gravam.
revoke all on public.plan_benefits from public, anon, authenticated;
insert into public.plan_benefits (id) values (true) on conflict (id) do nothing;

-- Igual ao de …9550_correcoes_acesso; muda só: (1) v_locked (sem acesso pago e sem teste valendo); (2) quem nunca começou o teste do
-- Tutor e está nessa situação fica bloqueado em vez de poder começar o teste; (3) o JSON ganha "plan_locked" (para a tela dizer
-- "Seu teste grátis terminou"); (4) v_paid_voice: os minutos de voz do Elite pago (PL04, vazio = os do Pro). Quem já começou o teste do
-- Tutor segue até o prazo próprio dele (CF03 ainda não decidido). Com a chave "requires_pro" do painel do Tutor DESLIGADA o Tutor
-- segue aberto a todos (decisão do dono, não é tocada aqui): nesse caso mode = "paid" para qualquer pessoa e plan_locked é falso.
create or replace function public.tutor_entitlement(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.tutor_config;
  s public.subscriptions;
  v_staff boolean;
  v_paid boolean;
  v_locked boolean;
  v_paid_voice integer;
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
  v_staff := public.user_has_full_access(p_user); -- equipe ou revisor médico: acesso completo, sem teste
  v_paid := v_staff or public.subscription_is_paid(s.plan, s.status, s.current_period_end);
  v_locked := not v_paid and not public.subscription_trial_is_valid(s.status, s.trial_ends_at);
  -- minutos de voz por dia do plano pago: os do painel do Tutor; o Elite pago (nunca a equipe) usa os do Elite quando o dono preencheu
  -- (e nunca menos que os do plano pago). Sem valor preenchido, o Elite tem os mesmos minutos do Pro.
  v_paid_voice := c.paid_voice_daily_seconds;
  if not v_staff and s.plan = 'elite' and public.subscription_is_paid(s.plan, s.status, s.current_period_end) then
    v_paid_voice := greatest(c.paid_voice_daily_seconds, coalesce((select b.elite_voice_daily_minutes * 60 from public.plan_benefits b), 0));
  end if;
  if v_paid or not c.requires_pro then
    v_mode := 'paid';
  elsif s.tutor_trial_started_at is null then
    if v_locked then
      v_mode := 'blocked'; v_trial := 'expired';
    else
      v_mode := 'trial'; v_trial := 'available';
    end if;
  elsif now() < s.tutor_trial_started_at + make_interval(days => v_days) then
    v_mode := 'trial'; v_trial := 'active'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  else
    v_mode := 'blocked'; v_trial := 'expired'; v_ends := s.tutor_trial_started_at + make_interval(days => v_days);
  end if;

  v_text_used := coalesce((select u.requests from public.ai_usage u where u.user_id = p_user and u.day = v_today), 0);
  v_text_limit := case v_mode when 'paid' then c.daily_message_limit when 'trial' then c.trial_text_daily else 0 end;
  v_vday := case when not c.voice_enabled then 0 when v_mode = 'paid' then v_paid_voice when v_mode = 'trial' then c.trial_voice_daily_seconds else 0 end;
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
    'plan_locked', v_mode = 'blocked' and s.tutor_trial_started_at is null,
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
revoke execute on function public.tutor_entitlement(uuid) from public, anon, authenticated;

-- Para desfazer (depois de desfazer a 9731): recriar app_start_session de …1700 e tutor_entitlement de …9550; depois "drop table public.plan_benefits",
-- "drop function public.app_my_access()", "drop function public.user_plan_lock(uuid)", "drop function public.simulado_gate()",
-- "drop function public.user_without_paid_access(uuid)" e
-- "drop function public.subscription_trial_is_valid(public.subscription_status, timestamptz)".
