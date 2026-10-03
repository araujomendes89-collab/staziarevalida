-- =============================================================================
-- Administração: gestão de usuários, planos, questões, estações e configurações.
--
-- Regra geral: toda função app_admin_* é SECURITY DEFINER (precisa ler auth.users e
-- escrever em tabelas que o aluno não toca) e começa conferindo o papel de quem chama:
--   assert_admin()  → usuários, planos, configurações, registro
--   assert_staff()  → conteúdo (questões e estações): admin ou editor
-- Toda alteração fica no registro de ações (admin_audit_log).
-- O primeiro administrador é criado fora do app (ver supabase/README.md).
-- =============================================================================

create function public.assert_admin() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
end
$$;

create function public.assert_staff() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Acesso restrito à equipe.' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------- registro de ações
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
create policy "registro: só administradores leem" on public.admin_audit_log
  for select to authenticated using (public.is_admin());
-- Escrita só pelas funções abaixo.

create function public.admin_log(p_action text, p_target text, p_details jsonb default '{}'::jsonb) returns void
  language sql security definer set search_path = ''
as $$
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;
revoke execute on function public.admin_log(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- configurações
create table public.app_settings (
  key text primary key check (key in ('trial_days', 'announcement')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.app_settings enable row level security;
create policy "configurações: leitura para logados" on public.app_settings
  for select to authenticated using (true);
insert into public.app_settings (key, value) values
  ('trial_days', '7'::jsonb),
  ('announcement', '{"active": false, "tone": "info", "title": "", "text": ""}'::jsonb);

-- Cadastro: dias de teste vêm da configuração (antes eram 7 fixos).
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_days integer := coalesce((select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'trial_days'), 7);
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120));
  insert into public.user_roles (user_id) values (new.id);
  insert into public.subscriptions (user_id, plan, status, trial_ends_at)
  values (new.id, 'trial', 'trialing', now() + make_interval(days => v_days));
  return new;
end
$$;

-- Aviso para todos os alunos (mostrado no Início quando ativo).
create function public.app_announcement() returns jsonb
  language sql stable set search_path = ''
as $$
  select case when (s.value ->> 'active')::boolean then s.value - 'active' end
  from public.app_settings s where s.key = 'announcement'
$$;

-- ---------------------------------------------------------------- planos
create table public.plans (
  code public.plan_code primary key,
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 400),
  price_cents integer check (price_cents >= 0),
  billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'quarterly', 'semiannual', 'yearly', 'one_time')),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  active boolean not null default false,
  position smallint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.plans enable row level security;
create policy "planos: ativos para todos, todos para admin" on public.plans
  for select to anon, authenticated using (active or public.is_admin());
-- Preço e recursos começam em branco: quem define é o administrador.
insert into public.plans (code, name, active, position) values
  ('trial', 'Teste grátis', true, 0),
  ('pro', 'Pro', false, 1),
  ('elite', 'Elite', false, 2);

-- Planos à venda (para a tela de planos do aluno).
create function public.app_plans() returns jsonb
  language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(p) - 'updated_at' order by p.position), '[]'::jsonb)
  from public.plans p where p.active
$$;

-- ---------------------------------------------------------------- questões anuladas
-- Questão anulada pode não ter gabarito (antes era obrigatório inventar um).
alter table public.questions alter column correct_option drop not null;
alter table public.questions add constraint questions_answer_or_annulled
  check (correct_option is not null or status = 'annulled');

-- =============================================================================
-- Visão geral
-- =============================================================================
create function public.app_admin_overview() returns jsonb
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
                  from (select plan || ':' || status as k, count(*)::int as n from public.subscriptions group by plan, status) s)
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

-- =============================================================================
-- Usuários
-- =============================================================================
create function public.admin_user_row(p_user_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at,
    'name', p.name, 'phase', p.phase, 'exam_type', p.exam_type, 'target_edition', p.target_edition,
    'role', coalesce(r.role, 'student'),
    'plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'answered', (select count(*)::int from public.question_attempts a where a.user_id = u.id),
    'correct', (select count(*)::int from public.question_attempts a where a.user_id = u.id and a.is_correct),
    'last_activity', greatest(
      (select max(a.answered_at) from public.question_attempts a where a.user_id = u.id),
      (select max(f.reviewed_at) from public.flashcard_reviews f where f.user_id = u.id))
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles r on r.user_id = u.id
  left join public.subscriptions s on s.user_id = u.id
  where u.id = p_user_id
$$;
revoke execute on function public.admin_user_row(uuid) from public, anon, authenticated;

-- Lista com busca (nome ou e-mail) e filtros de papel e plano.
create function public.app_admin_users(
  p_search text default null, p_role text default null, p_plan text default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_search constant text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.assert_admin();
  return (
    with matched as (
      select u.id, u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.user_roles r on r.user_id = u.id
      left join public.subscriptions s on s.user_id = u.id
      where (v_search is null
             or public.fold_text(coalesce(p.name, '') || ' ' || coalesce(u.email, '')) like '%' || public.fold_text(v_search) || '%')
        and (nullif(p_role, '') is null or coalesce(r.role, 'student')::text = p_role)
        and (nullif(p_plan, '') is null or s.plan::text = p_plan)
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matched),
      'items', coalesce((
        select jsonb_agg(public.admin_user_row(m.id) order by m.created_at desc)
        from (select * from matched order by created_at desc
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;

create function public.app_admin_user(p_user_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform public.assert_admin();
  v_row := public.admin_user_row(p_user_id);
  if v_row is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  return v_row || jsonb_build_object(
    'sessions', (select count(*)::int from public.practice_sessions s where s.user_id = p_user_id),
    'simulados', (select count(*)::int from public.practice_sessions s where s.user_id = p_user_id and s.kind = 'simulado' and s.finished_at is not null),
    'flashcards', (select count(*)::int from public.flashcards f where f.owner_id = p_user_id),
    'flashcard_reviews', (select count(*)::int from public.flashcard_reviews f where f.user_id = p_user_id),
    'pending_errors', (select count(*)::int from (
        select a.question_id, (array_agg(a.is_correct order by a.answered_at desc, a.seq desc))[1] as last_correct
        from public.question_attempts a where a.user_id = p_user_id group by a.question_id) e
      where not e.last_correct)
  );
end
$$;

create function public.app_admin_set_role(p_user_id uuid, p_role text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_before text;
begin
  perform public.assert_admin();
  if p_role is null or p_role not in ('student', 'editor', 'admin') then
    raise exception 'Papel inválido.' using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) and p_role <> 'admin' then
    raise exception 'Você não pode remover o próprio acesso de administrador.' using errcode = '22023';
  end if;
  select r.role::text into v_before from public.user_roles r where r.user_id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  update public.user_roles set role = p_role::public.app_role, updated_at = now() where user_id = p_user_id;
  perform public.admin_log('user.role', p_user_id::text, jsonb_build_object('from', v_before, 'to', p_role));
  return public.admin_user_row(p_user_id);
end
$$;

-- Plano atribuído à mão (cortesia, correção de pagamento, prorrogação do teste).
create function public.app_admin_set_subscription(
  p_user_id uuid, p_plan text, p_status text,
  p_trial_ends_at timestamptz default null, p_current_period_end timestamptz default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_before jsonb;
begin
  perform public.assert_admin();
  if p_plan is null or p_plan not in ('trial', 'pro', 'elite') then
    raise exception 'Plano inválido.' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('trialing', 'active', 'past_due', 'canceled', 'expired') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if p_plan = 'trial' and p_status = 'trialing' and p_trial_ends_at is null then
    raise exception 'Informe até quando vai o teste.' using errcode = '22023';
  end if;
  select to_jsonb(s) - 'user_id' - 'updated_at' into v_before from public.subscriptions s where s.user_id = p_user_id;
  if v_before is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  update public.subscriptions set
    plan = p_plan::public.plan_code, status = p_status::public.subscription_status,
    trial_ends_at = p_trial_ends_at, current_period_end = p_current_period_end,
    provider = coalesce(provider, 'manual'), updated_at = now()
  where user_id = p_user_id;
  perform public.admin_log('user.subscription', p_user_id::text, jsonb_build_object(
    'from', v_before,
    'to', jsonb_build_object('plan', p_plan, 'status', p_status, 'trial_ends_at', p_trial_ends_at, 'current_period_end', p_current_period_end)));
  return public.admin_user_row(p_user_id);
end
$$;

-- Exclui a conta de outro usuário (confirmação: o e-mail dele).
create function public.app_admin_delete_user(p_user_id uuid, p_confirm_email text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
begin
  perform public.assert_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'Para excluir a própria conta, use Conta › Privacidade e dados.' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) is distinct from lower(v_email) then
    raise exception 'Digite o e-mail do usuário para confirmar.' using errcode = '22023';
  end if;
  perform public.admin_log('user.delete', p_user_id::text, jsonb_build_object('email', v_email));
  delete from auth.users where id = p_user_id;
  return true;
end
$$;

-- =============================================================================
-- Questões
-- =============================================================================
create function public.admin_exam_id(p_kind text, p_year integer, p_semester integer) returns text
  language sql immutable set search_path = ''
as $$ select lower(p_kind) || '-' || p_year || coalesce('-' || p_semester, '') $$;

create function public.admin_exam_title(p_kind text, p_year integer, p_semester integer) returns text
  language sql immutable set search_path = ''
as $$
  select case when p_kind = 'ENAMED' then 'ENAMED ' || p_year
              else 'Revalida INEP ' || p_year || coalesce('/' || p_semester, '') end
$$;

-- Busca para a lista do admin: texto (enunciado, tema ou código), prova, área, status, figura.
create function public.app_admin_questions(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_search constant text := nullif(btrim(coalesce(f ->> 'search', '')), '');
begin
  perform public.assert_staff();
  return (
    with matched as (
      select q.* from public.questions q
      where (v_search is null
             or q.code ilike '%' || v_search || '%'
             or q.search @@ websearch_to_tsquery('portuguese', v_search)
             or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, '')) like '%' || public.fold_text(v_search) || '%')
        and (nullif(f ->> 'exam_id', '') is null or q.exam_id = f ->> 'exam_id')
        and (nullif(f ->> 'area', '') is null or q.area::text = f ->> 'area')
        and (nullif(f ->> 'status', '') is null or q.status = f ->> 'status')
        and (coalesce((f ->> 'needs_image')::boolean, false) = false or (q.needs_image and jsonb_array_length(q.images) = 0))
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matched),
      'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'question_count', e.question_count)
                                          order by e.year desc, e.semester desc nulls last, e.kind), '[]'::jsonb)
                from public.exams e),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'exam_id', m.exam_id, 'number', m.number, 'area', m.area, 'topic', m.topic,
          'status', m.status, 'needs_image', m.needs_image, 'images', jsonb_array_length(m.images),
          'correct_option', m.correct_option, 'excerpt', left(m.statement, 160), 'updated_at', m.updated_at)
          order by m.exam_id desc, m.number)
        from (select * from matched order by exam_id desc, number
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;

create function public.app_admin_question(p_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_staff();
  select to_jsonb(q) - 'search' || jsonb_build_object(
           'exam', (select to_jsonb(e) from public.exams e where e.id = q.exam_id),
           'attempts', (select count(*)::int from public.question_attempts a where a.question_id = q.id))
    into v
  from public.questions q where q.id = p_id;
  if v is null then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  return v;
end
$$;

-- Valida uma questão vinda do editor ou da importação. Devolve a mensagem de erro (ou nulo).
create function public.admin_question_problem(q jsonb) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  v_options jsonb := q -> 'options';
  v_status text := coalesce(nullif(q ->> 'status', ''), 'valid');
begin
  if coalesce(q ->> 'kind', '') not in ('REVALIDA', 'ENAMED') then return 'Prova deve ser REVALIDA ou ENAMED.'; end if;
  if coalesce(q ->> 'year', '') !~ '^(20\d\d|2100)$' then return 'Ano da prova inválido.'; end if;
  if coalesce(q ->> 'semester', '') not in ('', '1', '2') then return 'Semestre deve ser 1 ou 2.'; end if;
  if coalesce(q ->> 'number', '') !~ '^[1-9]\d{0,3}$' then return 'Número da questão inválido.'; end if;
  if coalesce(q ->> 'area', '') not in ('CLINICA_MEDICA', 'CIRURGIA_GERAL', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MEDICINA_FAMILIA_COMUNIDADE') then
    return 'Grande área inválida.';
  end if;
  if char_length(btrim(coalesce(q ->> 'topic', ''))) = 0 then return 'Informe o tema.'; end if;
  if char_length(btrim(coalesce(q ->> 'statement', ''))) < 20 then return 'Enunciado vazio ou curto demais.'; end if;
  if jsonb_typeof(v_options) is distinct from 'array' or jsonb_array_length(v_options) <> 4 then return 'São necessárias 4 alternativas (A a D).'; end if;
  if (select array_agg(o ->> 'id' order by o ->> 'id') from jsonb_array_elements(v_options) o) <> array['A', 'B', 'C', 'D'] then
    return 'As alternativas devem ser A, B, C e D.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_options) o where char_length(btrim(coalesce(o ->> 'text', ''))) = 0) then
    return 'Há alternativa sem texto.';
  end if;
  if v_status not in ('valid', 'annulled', 'changed_after_appeal') then return 'Situação inválida.'; end if;
  if v_status <> 'annulled' and coalesce(q ->> 'correct_option', '') not in ('A', 'B', 'C', 'D') then
    return 'Informe o gabarito (A, B, C ou D).';
  end if;
  if nullif(q ->> 'correct_option', '') is not null and (q ->> 'correct_option') not in ('A', 'B', 'C', 'D') then
    return 'Gabarito deve ser A, B, C ou D.';
  end if;
  return null;
end
$$;

-- Grava uma questão (nova ou existente, identificada por prova + número). Sem conferência de papel:
-- só é chamada pelas funções app_admin_* abaixo, que já conferiram.
create function public.admin_upsert_question(q jsonb, p_update boolean) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_kind constant text := q ->> 'kind';
  v_year constant integer := (q ->> 'year')::integer;
  v_semester constant integer := nullif(q ->> 'semester', '')::integer;
  v_number constant integer := (q ->> 'number')::integer;
  v_exam constant text := public.admin_exam_id(v_kind, v_year, v_semester);
  v_existing text;
  v_id text;
  v_options jsonb;
begin
  insert into public.exams (id, kind, year, semester, title)
  values (v_exam, v_kind, v_year, v_semester, public.admin_exam_title(v_kind, v_year, v_semester))
  on conflict (id) do nothing;

  select (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'text'),
                                              'explanation', btrim(coalesce(o ->> 'explanation', ''))) order by o ->> 'id')
          from jsonb_array_elements(q -> 'options') o) into v_options;

  select x.id into v_existing from public.questions x where x.exam_id = v_exam and x.number = v_number;
  if v_existing is not null then
    if not p_update then
      return 'skipped';
    end if;
    update public.questions set
      area = (q ->> 'area')::public.med_area,
      topic = btrim(q ->> 'topic'),
      subtopic = nullif(btrim(coalesce(q ->> 'subtopic', '')), ''),
      specialty = coalesce(nullif(btrim(coalesce(q ->> 'specialty', '')), ''), specialty),
      statement = btrim(q ->> 'statement'),
      options = v_options,
      correct_option = nullif(q ->> 'correct_option', ''),
      status = coalesce(nullif(q ->> 'status', ''), 'valid'),
      expected_conduct = nullif(btrim(coalesce(q ->> 'expected_conduct', '')), ''),
      inep_intent = nullif(btrim(coalesce(q ->> 'inep_intent', '')), ''),
      needs_image = coalesce((q ->> 'needs_image')::boolean, needs_image),
      sources = coalesce(q -> 'sources', sources)
    where id = v_existing;
    return 'updated';
  end if;

  v_id := lower(v_kind) || '_' || v_year || coalesce('_' || v_semester, '') || '_q' || lpad(v_number::text, 3, '0');
  insert into public.questions (id, code, exam_id, number, area, specialty, topic, subtopic, statement, options,
                                correct_option, status, expected_conduct, inep_intent, needs_image, sources)
  values (
    v_id,
    (case when v_kind = 'ENAMED' then 'ENAMED' else 'REV' end) || '-' || v_year || coalesce('.' || v_semester, '') || '-Q' || lpad(v_number::text, 3, '0'),
    v_exam, v_number, (q ->> 'area')::public.med_area,
    nullif(btrim(coalesce(q ->> 'specialty', '')), ''),
    btrim(q ->> 'topic'), nullif(btrim(coalesce(q ->> 'subtopic', '')), ''), btrim(q ->> 'statement'), v_options,
    nullif(q ->> 'correct_option', ''), coalesce(nullif(q ->> 'status', ''), 'valid'),
    nullif(btrim(coalesce(q ->> 'expected_conduct', '')), ''), nullif(btrim(coalesce(q ->> 'inep_intent', '')), ''),
    coalesce((q ->> 'needs_image')::boolean, false), coalesce(q -> 'sources', '[]'::jsonb)
  );
  return 'inserted';
end
$$;
revoke execute on function public.admin_upsert_question(jsonb, boolean) from public, anon, authenticated;

create function public.admin_refresh_exam_counts() returns void
  language sql security definer set search_path = ''
as $$
  update public.exams e set question_count = (select count(*) from public.questions q where q.exam_id = e.id)
$$;
revoke execute on function public.admin_refresh_exam_counts() from public, anon, authenticated;

-- Importação em lote. Tudo ou nada: com qualquer erro, nada é gravado e a lista de erros volta.
create function public.app_admin_import_questions(p_questions jsonb, p_update_existing boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_result text;
  v_counts jsonb := jsonb_build_object('inserted', 0, 'updated', 0, 'skipped', 0);
  v_item jsonb;
  v_index integer := 0;
  v_problem text;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'Nenhuma questão para importar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) > 1000 then
    raise exception 'Importe no máximo 1.000 questões por vez.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_index := v_index + 1;
    v_problem := public.admin_question_problem(v_item);
    if v_problem is not null then
      v_errors := v_errors || jsonb_build_object('index', v_index, 'number', v_item ->> 'number', 'message', v_problem);
    end if;
  end loop;
  -- mesma prova + número repetidos no arquivo
  v_errors := v_errors || coalesce((
    select jsonb_agg(jsonb_build_object('index', d.idx, 'number', d.number, 'message', 'Questão repetida no arquivo.'))
    from (
      select min(t.ordinality)::int as idx, t.value ->> 'number' as number
      from jsonb_array_elements(p_questions) with ordinality t
      group by t.value ->> 'kind', t.value ->> 'year', coalesce(t.value ->> 'semester', ''), t.value ->> 'number'
      having count(*) > 1
    ) d
  ), '[]'::jsonb);
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_result := public.admin_upsert_question(v_item, coalesce(p_update_existing, false));
    v_counts := jsonb_set(v_counts, array[v_result], to_jsonb((v_counts ->> v_result)::int + 1));
  end loop;
  perform public.admin_refresh_exam_counts();
  perform public.admin_log('questions.import', null, v_counts || jsonb_build_object('update_existing', coalesce(p_update_existing, false)));
  return jsonb_build_object('ok', true) || v_counts;
end
$$;

-- Edição de uma questão pelo editor (mesmas regras da importação).
create function public.app_admin_save_question(p_question jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_problem text;
  v_result text;
  v_id text;
begin
  perform public.assert_staff();
  v_problem := public.admin_question_problem(p_question);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  -- trocar prova/número de uma questão existente não é permitido (mudaria o código e o histórico)
  if nullif(p_question ->> 'id', '') is not null then
    select q.id into v_id from public.questions q
    where q.id = p_question ->> 'id'
      and q.exam_id = public.admin_exam_id(p_question ->> 'kind', (p_question ->> 'year')::int, nullif(p_question ->> 'semester', '')::int)
      and q.number = (p_question ->> 'number')::int;
    if v_id is null then
      raise exception 'Prova e número de uma questão existente não podem ser alterados.' using errcode = '22023';
    end if;
  end if;
  v_result := public.admin_upsert_question(p_question, true);
  perform public.admin_refresh_exam_counts();
  select q.id into v_id from public.questions q
  where q.exam_id = public.admin_exam_id(p_question ->> 'kind', (p_question ->> 'year')::int, nullif(p_question ->> 'semester', '')::int)
    and q.number = (p_question ->> 'number')::int;
  perform public.admin_log('question.' || v_result, v_id, jsonb_build_object('status', coalesce(nullif(p_question ->> 'status', ''), 'valid')));
  return public.app_admin_question(v_id);
end
$$;

-- =============================================================================
-- Estações (2ª fase): revisão médica
-- =============================================================================
create function public.app_admin_stations() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'medical_review', s.medical_review,
      'is_pro_only', s.is_pro_only, 'institution', s.institution,
      'reports', (select count(*)::int from public.checklist_station_reports r where r.station_id = s.id),
      'last_reports', (select coalesce(jsonb_agg(jsonb_build_object('message', r.message, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                       from (select * from public.checklist_station_reports r where r.station_id = s.id order by r.created_at desc limit 3) r)
    ) order by s.medical_review desc, s.area, s.name)
    from public.checklist_stations s
  ), '[]'::jsonb);
end
$$;

create function public.app_admin_set_station_review(p_station_id text, p_status text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_status is null or p_status not in ('pending', 'approved') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update public.checklist_stations set medical_review = p_status where id = p_station_id;
  if not found then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  perform public.admin_log('station.review', p_station_id, jsonb_build_object('to', p_status));
  return public.app_admin_stations();
end
$$;

-- =============================================================================
-- Planos e configurações
-- =============================================================================
create function public.app_admin_plans() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select coalesce(jsonb_agg(to_jsonb(p) order by p.position), '[]'::jsonb) from public.plans p);
end
$$;

create function public.app_admin_save_plan(p_plan jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_features jsonb := coalesce(p_plan -> 'features', '[]'::jsonb);
begin
  perform public.assert_admin();
  if coalesce(p_plan ->> 'code', '') not in ('trial', 'pro', 'elite') then
    raise exception 'Plano inválido.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_plan ->> 'name', ''))) = 0 then
    raise exception 'Informe o nome do plano.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_features) <> 'array' or jsonb_array_length(v_features) > 20
     or exists (select 1 from jsonb_array_elements(v_features) x where jsonb_typeof(x) <> 'string' or char_length(x #>> '{}') > 120) then
    raise exception 'Recursos: até 20 itens de até 120 caracteres.' using errcode = '22023';
  end if;
  if nullif(p_plan ->> 'price_cents', '') is not null and (p_plan ->> 'price_cents') !~ '^\d{1,7}$' then
    raise exception 'Preço inválido.' using errcode = '22023';
  end if;
  if (p_plan ->> 'code') <> 'trial' and coalesce((p_plan ->> 'active')::boolean, false) and nullif(p_plan ->> 'price_cents', '') is null then
    raise exception 'Defina o preço antes de colocar o plano à venda.' using errcode = '22023';
  end if;
  update public.plans set
    name = btrim(p_plan ->> 'name'),
    description = nullif(btrim(coalesce(p_plan ->> 'description', '')), ''),
    price_cents = nullif(p_plan ->> 'price_cents', '')::integer,
    billing_period = coalesce(nullif(p_plan ->> 'billing_period', ''), billing_period),
    features = (select coalesce(jsonb_agg(to_jsonb(btrim(x #>> '{}'))), '[]'::jsonb)
                from jsonb_array_elements(v_features) x where btrim(x #>> '{}') <> ''),
    active = coalesce((p_plan ->> 'active')::boolean, active),
    updated_at = now()
  where code = (p_plan ->> 'code')::public.plan_code;
  perform public.admin_log('plan.save', p_plan ->> 'code', p_plan - 'features');
  return public.app_admin_plans();
end
$$;

create function public.app_admin_settings() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select jsonb_object_agg(s.key, s.value) from public.app_settings s);
end
$$;

create function public.app_admin_save_settings(p_settings jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_announcement jsonb := p_settings -> 'announcement';
begin
  perform public.assert_admin();
  if p_settings ? 'trial_days' then
    if (p_settings ->> 'trial_days') !~ '^\d{1,2}$' or (p_settings ->> 'trial_days')::int > 90 then
      raise exception 'Dias de teste: de 0 a 90.' using errcode = '22023';
    end if;
    update public.app_settings set value = to_jsonb((p_settings ->> 'trial_days')::int), updated_at = now(), updated_by = (select auth.uid())
    where key = 'trial_days';
  end if;
  if v_announcement is not null then
    if coalesce(v_announcement ->> 'tone', '') not in ('info', 'warning', 'success', 'brand')
       or char_length(coalesce(v_announcement ->> 'title', '')) > 120
       or char_length(coalesce(v_announcement ->> 'text', '')) > 600 then
      raise exception 'Aviso inválido: título até 120 e texto até 600 caracteres.' using errcode = '22023';
    end if;
    if coalesce((v_announcement ->> 'active')::boolean, false) and btrim(coalesce(v_announcement ->> 'title', '')) = '' then
      raise exception 'Para publicar o aviso, escreva o título.' using errcode = '22023';
    end if;
    update public.app_settings set
      value = jsonb_build_object('active', coalesce((v_announcement ->> 'active')::boolean, false),
                                 'tone', v_announcement ->> 'tone',
                                 'title', btrim(coalesce(v_announcement ->> 'title', '')),
                                 'text', btrim(coalesce(v_announcement ->> 'text', ''))),
      updated_at = now(), updated_by = (select auth.uid())
    where key = 'announcement';
  end if;
  perform public.admin_log('settings.save', null, p_settings);
  return public.app_admin_settings();
end
$$;

create function public.app_admin_audit(p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'target', l.target, 'details', l.details,
                                        'created_at', l.created_at, 'actor', u.email) order by l.id desc)
    from (select * from public.admin_audit_log order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) l
    left join auth.users u on u.id = l.actor_id
  ), '[]'::jsonb);
end
$$;
