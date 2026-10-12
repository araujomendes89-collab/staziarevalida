-- =============================================================================
-- Questões StaziaMed — lado do aluno (spec: docs/superpowers/specs/2026-10-09-questoes-staziamed-design.md, §0, §5.6 e §6).
-- Decisão do dono de 2026-10-11: as questões aparecem como a opção "Questões Inéditas" da lista "Prova / edição" do montador e
-- valem também para o teste grátis VÁLIDO. Ficam fechados (regra PL02: sem acesso pago) o teste vencido, o plano pago
-- vencido/cancelado e a conta sem assinatura.
--
--   * has_ineditas()      = equipe, revisor médico, plano pago válido ou teste grátis válido (a regra do Planos: …9730,
--                           user_without_paid_access). has_pro() NÃO muda (estações Pro continuam só para plano pago).
--   * questions           = ganha origin ('official' | 'staziamed'), retired_at e support (tabela de apoio); a política de
--                           leitura passa a "oficial, ou com acesso, ou já respondida por quem pede" (a última parte mantém
--                           os números do histórico iguais em toda tela depois que o acesso termina).
--   * practice_pool       = sem prova só oficiais; prova `staziamed` só com acesso e sem as recolhidas (não existe filtro
--                           "coleção": a escolha é a prova da lista).
--   * app_start_session   = parte da versão de …9730; prova `staziamed` sem acesso: aviso em português (42501).
--   * app_get_session     = devolve collection, locked e lock_message; sem acesso, sem questões.
--   * app_question_filters = a lista de provas ganha "Questões Inéditas" (com locked para quem está fechado).
--
-- Pode ser colada de novo no Supabase sem estragar nada. DEPENDE da leva 3 já aplicada (…9700 a …9732): usa
-- user_without_paid_access, simulado_gate, question_hidden_fields e parte de app_start_session (…9730) e de
-- ch_raw_practice_correction_view (…9701). Cole depois da …9800 (rascunhos).
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.user_without_paid_access(uuid)') is null
     or to_regprocedure('public.simulado_gate()') is null
     or to_regprocedure('public.question_hidden_fields(jsonb, jsonb)') is null then
    raise exception 'Cole antes as migrações da leva 3 (…9700 a …9732, Questões e Planos): esta migração parte das funções delas.'
      using errcode = '55000';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- prova STAZIAMED
alter table public.exams drop constraint if exists exams_kind_check;
alter table public.exams add constraint exams_kind_check check (kind in ('REVALIDA', 'ENAMED', 'STAZIAMED'));
insert into public.exams (id, kind, year, semester, title)
values ('staziamed', 'STAZIAMED', 2026, null, 'Questões StaziaMed')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- questions: origem, recolhimento e tabela de apoio
alter table public.questions
  add column if not exists origin text not null default 'official' check (origin in ('official', 'staziamed')),
  add column if not exists retired_at timestamptz,                -- recolhida: fora do sorteio (quem respondeu continua vendo)
  add column if not exists support jsonb;                         -- { type, title, rows: [{ label, value }] }; nulo nas oficiais
create index if not exists questions_origin_idx on public.questions (origin);

-- O que o aluno lê direto na tabela de uma Questão StaziaMed é só título, órgão, nível, página, link e versão de cada fonte:
-- nada de trecho nem de "o que sustenta" (isso entregaria a resposta antes de responder; fica nas tabelas da equipe).
create or replace function public.questions_sources_public(p_sources jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select p_sources is null or jsonb_typeof(p_sources) <> 'array' or not exists (
    select 1 from jsonb_array_elements(p_sources) e
    where jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('title', 'organ', 'level', 'page', 'link', 'version')))
$$;

alter table public.questions drop constraint if exists questions_origin_exam_check;
alter table public.questions add constraint questions_origin_exam_check check ((origin = 'staziamed') = (exam_id = 'staziamed'));
alter table public.questions drop constraint if exists questions_staziamed_no_inep_intent;
alter table public.questions add constraint questions_staziamed_no_inep_intent check (origin = 'official' or inep_intent is null);
alter table public.questions drop constraint if exists questions_staziamed_sources_check;
alter table public.questions add constraint questions_staziamed_sources_check check (origin = 'official' or public.questions_sources_public(sources));
alter table public.questions drop constraint if exists questions_support_shape_check;
alter table public.questions add constraint questions_support_shape_check check (support is null or jsonb_typeof(support) = 'object');

-- colunas que a tela precisa para distinguir a coleção (o gabarito continua fora do alcance direto do aluno)
grant select (origin, retired_at, support) on table public.questions to anon, authenticated;

-- ---------------------------------------------------------------- quem tem acesso (uma regra só, a do Planos)
-- Interna: a conta pedida é equipe, revisor médico, tem plano pago válido ou teste grátis válido. Sem login: não.
create or replace function public.ineditas_user_access(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_user is not null and not public.user_without_paid_access(p_user)
$$;

-- A pessoa logada tem acesso às Questões Inéditas? (usada pela política de leitura e pelas funções do aluno)
create or replace function public.has_ineditas() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.ineditas_user_access((select auth.uid()))
$$;

-- O aviso em português para quem está fechado (nulo = tem acesso). Interna; a versão da pessoa logada vem logo abaixo.
create or replace function public.ineditas_gate_for(p_user uuid) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lock jsonb := public.user_plan_lock(p_user);
begin
  if v_lock is null then return null; end if;
  return case v_lock ->> 'state'
           when 'teste_acabou' then 'Seu teste grátis terminou. '
           when 'plano_acabou' then 'Seu plano pago terminou. '
           else '' end
      || 'As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.';
end
$$;

create or replace function public.ineditas_gate() returns text
  language sql stable security definer set search_path = ''
as $$
  select public.ineditas_gate_for((select auth.uid()))
$$;

-- A opção da lista de provas: quantas publicadas (não recolhidas), se está fechada para quem pede e o aviso.
create or replace function public.ineditas_option() returns table (total integer, locked boolean, lock_message text)
  language sql stable security definer set search_path = ''
as $$
  select (select count(*)::int from public.questions q where q.origin = 'staziamed' and q.retired_at is null),
         not coalesce(public.has_ineditas(), false),
         public.ineditas_gate()
$$;

-- ---------------------------------------------------------------- política de leitura da tabela
drop policy if exists "questões: leitura para logados" on public.questions;
drop policy if exists "questões: oficiais, acesso às inéditas e as já respondidas" on public.questions;
create policy "questões: oficiais, acesso às inéditas e as já respondidas" on public.questions
  for select to authenticated
  using (
    origin = 'official'
    or (select public.has_ineditas())
    or exists (select 1 from public.question_attempts a where a.user_id = (select auth.uid()) and a.question_id = questions.id)
  );

-- Responder uma Questão StaziaMed sem acesso (inclusive gravando a resposta à mão) é recusado com o aviso. Vale para a
-- conta dona da resposta (new.user_id), não para quem executa: cargas e rotinas do servidor não são barradas.
create or replace function public.question_attempts_ineditas_gate() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  if exists (select 1 from public.questions q where q.id = new.question_id and q.origin = 'staziamed') then
    v_gate := public.ineditas_gate_for(new.user_id);
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists question_attempts_ineditas_gate on public.question_attempts;
create trigger question_attempts_ineditas_gate before insert on public.question_attempts
  for each row execute function public.question_attempts_ineditas_gate();

-- ---------------------------------------------------------------- a questão para o aluno (antes de responder)
create or replace function public.practice_question_view(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'number', q.number,
    'area', q.area,
    'exam', (select jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester, 'title', e.title)
             from public.exams e where e.id = q.exam_id),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id')
                from jsonb_array_elements(q.options) o),
    'images', q.images,
    'origin', q.origin,
    'support', q.support
  )
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null
    and (q.origin = 'official' or public.has_ineditas())
$$;

-- ---------------------------------------------------------------- a correção (o invólucro practice_correction_view não muda)
create or replace function public.ch_raw_practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'is_correct', case when p_selected is null or q.status = 'annulled' then null else p_selected = q.correct_option::text end,
    'correct_option', q.correct_option,
    'annulled', q.status = 'annulled',
    'in_review', cardinality(h.campos) > 0,
    'topic', q.topic,
    'subtopic', q.subtopic,
    'explanation', (select nullif(btrim(o ->> 'explanation'), '')
                    from jsonb_array_elements(q.options) o
                    where q.status <> 'annulled'
                      and o ->> 'id' = q.correct_option::text and not ('explanation_' || (o ->> 'id')) = any (h.campos)),
    'option_notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'explanation')) order by o ->> 'id')
      from jsonb_array_elements(q.options) o
      where q.status <> 'annulled'
        and o ->> 'id' <> q.correct_option::text and nullif(btrim(o ->> 'explanation'), '') is not null
        and not ('explanation_' || (o ->> 'id')) = any (h.campos)
    ), '[]'::jsonb),
    'expected_conduct', case when 'expected_conduct' = any (h.campos) then null else q.expected_conduct end,
    'inep_intent', case when 'inep_intent' = any (h.campos) then null else q.inep_intent end,
    'sources', public.ch_student_sources(q.sources),
    'origin', q.origin,
    'support', q.support
  )
  from public.questions q
  cross join lateral (
    select public.question_hidden_fields(q.explanations_review, q.comment_review) as campos
  ) h
  where q.id = p_question_id
    and (q.origin = 'official' or public.has_ineditas())
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;

-- ---------------------------------------------------------------- sorteio: sem prova só oficiais; prova `staziamed` só com acesso
create or replace function public.practice_pool(p_filters jsonb)
  returns table (question_id text, area public.med_area, exam_id text, topic text)
  language sql stable set search_path = ''
as $$
  select q.id, q.area, q.exam_id, q.topic
  from public.questions q
  where q.status <> 'annulled'
    and not (q.needs_image and jsonb_array_length(q.images) = 0)
    -- Questões Inéditas só quando a prova pedida é a `staziamed` (e só com acesso); em todo o resto, só as oficiais
    and case when p_filters ->> 'exam_id' = 'staziamed'
             then q.origin = 'staziamed' and q.retired_at is null and (select public.has_ineditas())
             else q.origin = 'official' end
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

-- ---------------------------------------------------------------- abrir sessão (parte da versão de …9730)
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
  -- Questões Inéditas: teste vencido, plano vencido/cancelado e conta sem assinatura ficam fechados, com o aviso em português
  if v_filters ->> 'exam_id' = 'staziamed' then
    v_gate := public.ineditas_gate();
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

-- ---------------------------------------------------------------- reabrir sessão (parte da versão de …4300)
create or replace function public.app_get_session(p_session_id uuid) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'kind', s.kind,
    'filters', s.config -> 'filters',
    'collection', c.collection,
    'locked', c.locked,
    'lock_message', case when c.locked then public.ineditas_gate() end,
    'started_at', s.started_at,
    'finished_at', s.finished_at,
    'questions', case when c.locked then '[]'::jsonb else (
      select jsonb_agg(
        public.practice_question_view(q.id) || jsonb_build_object(
          'bookmarked', b.question_id is not null,
          'selected', coalesce(a.selected_option::text, s.answers -> q.id ->> 'option'),
          'active_ms', coalesce(a.active_ms, (s.answers -> q.id ->> 'ms')::integer, 0),
          'correction', case
            when s.finished_at is not null or (s.kind <> 'simulado' and a.id is not null)
            then public.practice_correction_view(q.id, a.selected_option::text)
          end
        )
        order by u.ord
      )
      from unnest(s.question_ids) with ordinality as u (question_id, ord)
      join public.questions q on q.id = u.question_id
      left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
      left join public.question_bookmarks b on b.user_id = (select auth.uid()) and b.question_id = q.id
    ) end,
    'result', case when s.finished_at is not null then public.practice_result(s.id) end
  ) || public.practice_timer(s, now())
  from public.practice_sessions s
  cross join lateral (
    select case when s.config -> 'filters' ->> 'exam_id' = 'staziamed' then 'staziamed' else 'oficiais' end as collection,
           (s.config -> 'filters' ->> 'exam_id' = 'staziamed' and not (select public.has_ineditas())) as locked
  ) c
  where s.id = p_session_id
$$;

-- ---------------------------------------------------------------- lista de provas do montador
create or replace function public.app_question_filters() returns jsonb
  language sql stable set search_path = ''
as $$
  with pool as (
    select * from public.practice_pool('{}'::jsonb)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from pool),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester,
                                          'title', e.title, 'total', c.total)
                       order by e.year desc, e.semester desc nulls last, e.kind)
      from public.exams e
      join (select exam_id, count(*)::int as total from pool group by exam_id) c on c.exam_id = e.id
    ), '[]'::jsonb)
    -- a opção "Questões Inéditas" (prova staziamed) entra no fim da lista; fechada, vai com locked e o aviso
    || coalesce((
      select jsonb_build_array(jsonb_build_object('id', 'staziamed', 'kind', 'STAZIAMED', 'year', 2026, 'semester', null,
                                                    'title', 'Questões Inéditas', 'total', o.total, 'locked', o.locked,
                                                    'lock_message', o.lock_message))
      from public.ineditas_option() o
      where o.total > 0
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', t.area, 'topic', t.topic, 'total', t.total) order by t.total desc, t.topic)
      from (
        select area, topic, count(*)::int as total,
               row_number() over (partition by area order by count(*) desc, topic) as rn
        from pool group by area, topic
      ) t
      where t.rn <= 6
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------- placar da sessão (parte da versão de …7700)
-- Passa a rodar com os direitos do dono, com a posse da sessão conferida aqui: o placar de uma sessão antiga não pode perder as
-- questões inéditas quando o acesso termina (os números do aluno são os mesmos em toda tela).
create or replace function public.practice_result(p_session_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with s as (
    select * from public.practice_sessions where id = p_session_id and user_id = (select auth.uid())
  ),
  every_question as (
    select q.area, q.status = 'annulled' as annulled, a.id is not null as answered, coalesce(a.is_correct, false) as correct, coalesce(a.active_ms, 0) as ms
    from s
    cross join lateral unnest(s.question_ids) as u (question_id)
    join public.questions q on q.id = u.question_id
    left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
  ),
  answered as (
    select * from every_question where not annulled
  )
  select jsonb_build_object(
    'total', (select count(*)::int from answered),
    'answered', (select count(*)::int from answered where answered),
    'correct', (select count(*)::int from answered where correct),
    'annulled', (select count(*)::int from every_question where annulled),
    'active_seconds', (select (coalesce(sum(ms), 0) / 1000)::int from every_question),
    'elapsed_seconds', (select greatest(extract(epoch from (coalesce(s.finished_at, now()) - s.started_at))
                                        - s.paused_ms / 1000.0
                                        - case when s.paused_at is null then 0
                                               else extract(epoch from (coalesce(s.finished_at, now()) - s.paused_at)) end, 0)::int
                        from s),
    'paused_seconds', (select (s.paused_ms / 1000)::int from s),
    'by_area', coalesce((
      select jsonb_agg(jsonb_build_object('area', x.area, 'total', x.total, 'answered', x.answered, 'correct', x.correct) order by x.area)
      from (
        select area, count(*)::int as total, count(*) filter (where answered)::int as answered,
               count(*) filter (where correct)::int as correct
        from answered group by area
      ) x
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------- permissões das funções novas
revoke execute on function public.ineditas_user_access(uuid) from public, anon, authenticated;
revoke execute on function public.ineditas_gate_for(uuid) from public, anon, authenticated;
revoke execute on function public.question_attempts_ineditas_gate() from public, anon, authenticated;
revoke execute on function public.has_ineditas() from public, anon;
grant execute on function public.has_ineditas() to authenticated;
revoke execute on function public.ineditas_gate() from public, anon;
grant execute on function public.ineditas_gate() to authenticated;
revoke execute on function public.practice_result(uuid) from public, anon;
grant execute on function public.practice_result(uuid) to authenticated;
revoke execute on function public.ineditas_option() from public, anon;
grant execute on function public.ineditas_option() to authenticated;

-- Para desfazer: recriar as funções de …1900, …3800, …4300, …0700, …9701 e …9730 que esta migração redefine; depois
-- "drop trigger question_attempts_ineditas_gate", recriar a política "questões: leitura para logados" (using (true)) e
-- apagar as colunas origin, retired_at e support (só se não houver Questão StaziaMed publicada).
