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
  select case when (select auth.uid()) is null then 0
              else (select count(*)::int from public.questions q where q.origin = 'staziamed' and q.retired_at is null) end,
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

-- ================================================================ consumidores: só oficiais, recusas (Tarefa 3)
-- Cada função parte da versão MAIS NOVA da ordem de produção (inclusive a leva 3) e só ganha o filtro de origem ou a recusa.

-- ---------------------------------------------------------------- incidência (só provas oficiais: linhas e lista de provas)
create or replace function public.app_incidence(p_dimension text default 'topic', p_area text default null)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_dim constant text := coalesce(p_dimension, 'topic');
  v_expr text;
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  v_expr := case v_dim
    when 'topic' then 'q.topic'
    when 'area' then 'q.area::text'
    when 'subarea' then 'd.subarea'
    when 'competency' then 'd.competency'
    when 'care_setting' then 'd.care_setting'
    when 'patient_group' then 'd.patient_group'
    else null end;
  if v_expr is null then raise exception 'Dimensão inválida.' using errcode = '22023'; end if;

  execute format($f$
    with base as (
      select q.id, q.exam_id, q.area, q.topic, q.status, %1$s as key, d.question_id is not null as classified
      from public.questions q left join public.question_dna d on d.question_id = q.id
      where q.origin = 'official' and (%2$L::text is null or q.area::text = %2$L)
    ), counted as (
      select key, count(*)::int as total,
             (select jsonb_object_agg(x.exam_id, x.n) from (select b2.exam_id, count(*)::int as n from base b2
                where b2.key is not distinct from base.key and b2.status <> 'annulled' group by b2.exam_id) x) as by_exam,
             (array_agg(distinct area::text))[1] as area
      from base where status <> 'annulled' and key is not null group by key
    )
    select jsonb_build_object(
      'dimension', %3$L,
      'method', 'Contagem de questões oficiais catalogadas (Revalida e ENAMED) por prova. Questões anuladas ficam de fora; questões sem classificação detalhada são contadas à parte. Não é previsão de prova.',
      'exams', (select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.year, e.semester) from public.exams e where e.kind <> 'STAZIAMED'),
      'counted', (select count(*)::int from base where status <> 'annulled' and key is not null),
      'annulled', (select count(*)::int from base where status = 'annulled'),
      'unclassified', (select count(*)::int from base where status <> 'annulled' and key is null),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'total', total, 'by_exam', by_exam, 'area', area) order by total desc, key) from counted), '[]'::jsonb))
  $f$, v_expr, p_area, v_dim) into v_result;
  return v_result;
end
$$;

-- ---------------------------------------------------------------- abertura do app: total de questões oficiais
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
      'questions', (select count(*)::int from public.questions q where q.origin = 'official'),
      'answered', (select count(distinct a.question_id)::int from public.question_attempts a
                   where a.user_id = (select auth.uid()))
    ),
    'play', public.gam_play_boot(),
    'legal', public.app_legal_state()
  )
$$;

-- ---------------------------------------------------------------- Início: questões do tema prioritário contam só o treino oficial
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
    -- Temas com questão errada ainda não superada, dos de pior acurácia para os melhores. "questions" conta só as questões que
    -- entram no treino (sem anulada e sem as que citam figura ainda sem imagem: a mesma regra de practice_pool) (Q15).
    'priority_topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', p.area, 'topic', p.topic, 'pending', p.pending, 'attempts', p.attempts,
                                          'correct', p.correct, 'questions', p.questions)
                       order by p.accuracy, p.pending desc, p.topic)
      from (
        select e.area, e.topic, count(*)::int as pending, st.attempts, st.correct, st.accuracy,
               (select count(*)::int from public.questions q
                where q.origin = 'official' and q.area = e.area and q.topic = e.topic and q.status <> 'annulled'
                  and not (q.needs_image and jsonb_array_length(q.images) = 0)) as questions
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

-- ---------------------------------------------------------------- temas das Aulas
create or replace function public.app_lesson_topics(p_area text default null) returns jsonb
  language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('area', x.area, 'topic', x.topic, 'questions', x.n) order by x.n desc, x.topic), '[]'::jsonb)
  from (select q.area, q.topic, count(*)::int n from public.questions q
        where q.origin = 'official' and q.status <> 'annulled' and (nullif(p_area, '') is null or q.area::text = p_area) group by q.area, q.topic) x
$$;

-- ---------------------------------------------------------------- trilhas do Play
create or replace function public.app_trail(p_area text default null) returns jsonb
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
      where q.origin = 'official' and q.status <> 'annulled' and not (q.needs_image and jsonb_array_length(q.images) = 0)
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

-- ---------------------------------------------------------------- nó da trilha
create or replace function public.app_start_trail_node(p_area text, p_topic text default null) returns jsonb
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
  if not exists (select 1 from public.questions q where q.origin = 'official' and q.area::text = p_area and q.topic = p_topic) then
    raise exception 'Tema não encontrado.' using errcode = 'P0002';
  end if;
  v_filters := jsonb_build_object('area', p_area, 'topic', p_topic, 'status', 'unanswered');
  if (select count(*) from public.practice_pool(v_filters)) = 0 then v_filters := v_filters - 'status'; end if;
  select greatest(v_goal - count(distinct a.question_id), 5)::int into v_left
  from public.question_attempts a join public.questions q on q.id = a.question_id
  where a.user_id = (select auth.uid()) and q.origin = 'official' and q.area::text = p_area and q.topic = p_topic;
  return public.app_start_session('questoes', v_filters, least(v_left, v_goal)) || jsonb_build_object('trail', jsonb_build_object('area', p_area, 'topic', p_topic));
end
$$;

-- ---------------------------------------------------------------- SQIE: análise e fila só com oficiais
create or replace function public.ch_worker_questions_for_analysis(p_limit integer default 20, p_exam text default null, p_only_missing boolean default true) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.exam_id, x.number), '[]'::jsonb) from (
    select q.id, q.exam_id, q.number, q.area, q.statement, q.status, q.correct_option, q.images,
           (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text', 'explanation', nullif(btrim(o ->> 'explanation'), '')) order by o ->> 'id') from jsonb_array_elements(q.options) o) as options,
           e.year as exam_year,
           (select jsonb_build_object('answer', a.answer, 'status', a.answer_status, 'source', a.source) from public.question_official_answers a where a.question_id = q.id and a.is_current) as official,
           (select jsonb_build_object('subarea', d.subarea, 'competency', d.competency, 'care_setting', d.care_setting, 'patient_group', d.patient_group,
                     'clinical_decision', d.detail ->> 'clinical_decision', 'concept', d.detail ->> 'correct_answer_concept', 'intent', d.detail ->> 'question_intent',
                     'distractor_patterns', d.detail -> 'distractor_patterns', 'protocol_topics', d.detail -> 'protocol_topics') from public.question_dna d where d.question_id = q.id) as dna,
           public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)) as basis_hash
    from public.questions q join public.exams e on e.id = q.exam_id
    where q.origin = 'official' and q.status <> 'annulled' and q.correct_option is not null
      and (p_exam is null or q.exam_id = p_exam)
      and (not coalesce(p_only_missing, true) or not exists (select 1 from public.question_analysis a where a.question_id = q.id and a.is_current
            and a.basis_hash = public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option))))
    order by q.exam_id, q.number
    limit least(greatest(coalesce(p_limit, 20), 1), 500)) x
$$;

create or replace function public.app_question_analyses(p_status text default null, p_exam text default null, p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
        'questions', (select count(*)::int from public.questions where origin = 'official' and status <> 'annulled'),
        'analyzed', (select count(*)::int from public.question_analysis where is_current),
        'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*)::int n from public.question_analysis where is_current group by status) s), '{}'::jsonb))),
    'total', (select count(*)::int from public.question_analysis a2 where a2.is_current and (p_status is null or a2.status = p_status)
              and (p_exam is null or exists (select 1 from public.questions q2 where q2.id = a2.question_id and q2.exam_id = p_exam))),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.year, e.semester) from public.exams e), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('analysis_id', a.id, 'question_id', a.question_id, 'code', q.code, 'exam_id', q.exam_id, 'number', q.number, 'area', public.question_area_code(q.id),
          'statement', q.statement, 'question_options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
          'images', q.images,
          'version', a.version, 'status', a.status, 'temporal_status', a.temporal_status, 'difficulty', a.difficulty, 'question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
          'key_data', a.key_data, 'pedagogy', a.pedagogy, 'official_answer', (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current),
          'official_status', (select o.answer_status from public.question_official_answers o where o.question_id = q.id and o.is_current),
          'model', a.generated_by_model, 'analysis_date', a.analysis_date, 'reviewed_at', a.reviewed_at, 'review_note', a.review_note,
          'can_review', public.ch_is_reviewer(public.question_area_code(q.id)),
          'stale', a.basis_hash <> public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)),
          'options', (select jsonb_agg(to_jsonb(x) - 'analysis_id' - 'id' order by x.option_id) from public.question_option_analysis x where x.analysis_id = a.id),
          'checks', coalesce((select jsonb_agg(jsonb_build_object('layer', c.layer, 'verdict', c.verdict, 'findings', c.findings, 'model', c.model)) from public.question_analysis_checks c where c.analysis_id = a.id), '[]'::jsonb))
        order by q.exam_id, q.number)
      from (select * from public.question_analysis a2 where a2.is_current and (p_status is null or a2.status = p_status)
              and (p_exam is null or exists (select 1 from public.questions q2 where q2.id = a2.question_id and q2.exam_id = p_exam))
            order by a2.question_id limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) a
      join public.questions q on q.id = a.question_id), '[]'::jsonb));
end
$$;

create or replace function public.app_question_updates_queue(p_status text default 'review_required', p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(x.item order by x.crit desc, x.detected_at) from (
    select u.critical as crit, u.detected_at, jsonb_build_object(
      'id', u.id, 'question_id', u.question_id, 'exam_id', q.exam_id, 'number', q.number, 'area', public.question_area_code(q.id),
      'detected_at', u.detected_at, 'status', u.status, 'impact_level', u.impact_level, 'critical', u.critical, 'triage_kind', u.triage_kind, 'reason', u.reason,
      'claim', c.statement,
      'official_answer', (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current),
      'old_text', i.old_text, 'new_text', i.new_text,
      'proposal', u.proposal, 'proposal_checks', u.proposal_checks, 'proposal_model', u.proposal_model,
      'evidence_ready', public.question_evidence_ready(q.id),
      'decision', u.decision, 'decision_note', u.decision_note) as item
    from public.question_updates u join public.questions q on q.id = u.question_id
      left join public.ch_claims c on c.id = u.old_claim_id left join public.ch_source_diff_items i on i.id = u.diff_item_id
    where q.origin = 'official' and (p_status is null or u.status = p_status)
    order by u.critical desc, u.detected_at
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb);
end
$$;

create or replace function public.ch_worker_updates_for_reanalysis(p_limit integer default 10) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.q), '[]'::jsonb) from (
    select q.id as q, jsonb_build_object(
      'question_id', q.id, 'exam_id', q.exam_id, 'number', q.number, 'area', q.area, 'statement', q.statement, 'correct_option', q.correct_option,
      'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
      'official', (select jsonb_build_object('answer', a.answer, 'status', a.answer_status, 'source', a.source) from public.question_official_answers a where a.question_id = q.id and a.is_current),
      'analysis', (select jsonb_build_object('analysis_id', a.id, 'trap', a.trap, 'golden_rule', a.golden_rule,
                      'options', (select jsonb_agg(jsonb_build_object('option_id', oa.option_id, 'reasoning', oa.reasoning) order by oa.option_id) from public.question_option_analysis oa where oa.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current),
      'changes', (select jsonb_agg(jsonb_build_object(
                    'update_id', u.id, 'claim', c.statement, 'kind', u.triage_kind, 'critical', u.critical,
                    'old_source', (select jsonb_build_object('title', s.title, 'organ', s.organ, 'version', s.version, 'published_on', s.published_on) from public.ch_sources s where s.id = u.old_source_id),
                    'new_source', (select jsonb_build_object('title', s.title, 'organ', s.organ, 'version', s.version, 'published_on', s.published_on)
                                   from public.ch_source_diffs d join public.ch_sources s on s.id = coalesce(d.new_source_id, d.source_id) where d.id = u.diff_id),
                    'old_text', i.old_text, 'new_text', i.new_text) order by u.detected_at)
                  from public.question_updates u join public.ch_claims c on c.id = u.old_claim_id join public.ch_source_diff_items i on i.id = u.diff_item_id
                  where u.question_id = q.id and u.proposal is null and u.status in ('queued', 'review_required') and u.impact_level = 'UNDETERMINED'
                    and u.triage_kind in ('NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED'))) as item
    from public.questions q
    where q.origin = 'official' and q.correct_option is not null and q.status <> 'annulled'
      and exists (select 1 from public.question_updates u where u.question_id = q.id and u.proposal is null and u.status in ('queued', 'review_required')
                  and u.impact_level = 'UNDETERMINED' and u.diff_item_id is not null and u.triage_kind in ('NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED'))
    order by q.exam_id, q.number
    limit least(greatest(coalesce(p_limit, 10), 1), 100)) x
$$;

create or replace function public.app_updated_questions(p_filters jsonb default '{}'::jsonb, p_limit integer default 30, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_total integer; v_items jsonb;
begin
  perform public.ch_assert_staff();
  with base as (
    select q.id, q.exam_id, q.number, q.topic, public.question_area_code(q.id) area, e.year,
           (select o.answer from public.question_official_answers o where o.question_id = q.id and o.is_current) official,
           (select k.current_answer from public.question_update_cards k where k.question_id = q.id and k.status = 'published') card_answer,
           (select a.current_best_answer from public.question_analysis a where a.question_id = q.id and a.is_current) analysis_answer,
           (select a.temporal_status from public.question_analysis a where a.question_id = q.id and a.is_current) temporal,
           u.id update_id, u.change_type, u.status ustatus, u.detected_at, u.impact_level, u.critical,
           (select k.effective_date from public.question_update_cards k where k.question_id = q.id and k.status = 'published') effective_date,
           coalesce((select k.sources -> 0 ->> 'title' from public.question_update_cards k where k.question_id = q.id and k.status = 'published'),
                    (select s.title from public.ch_sources s where s.id = u.old_source_id)) source_title
    from public.question_updates u join public.questions q on q.id = u.question_id join public.exams e on e.id = q.exam_id
    where q.origin = 'official' and u.id = (select u2.id from public.question_updates u2 where u2.question_id = q.id order by u2.detected_at desc limit 1)),
  filtered as (
    select * from base b
    where (nullif(p_filters ->> 'area', '') is null or b.area = p_filters ->> 'area')
      and (nullif(p_filters ->> 'status', '') is null or b.ustatus = p_filters ->> 'status')
      and (nullif(p_filters ->> 'search', '') is null or public.fold_text(b.topic) like '%' || public.fold_text(p_filters ->> 'search') || '%')
      and (coalesce((p_filters ->> 'differs')::boolean, false) = false or (coalesce(b.card_answer, b.analysis_answer) is not null and coalesce(b.card_answer, b.analysis_answer) <> b.official)))
  select (select count(*)::int from filtered),
         coalesce((select jsonb_agg(jsonb_build_object('question_id', f.id, 'exam_id', f.exam_id, 'year', f.year, 'number', f.number, 'topic', f.topic, 'area', f.area,
                    'official_answer', f.official, 'current_answer', coalesce(f.card_answer, f.analysis_answer), 'temporal_status', f.temporal, 'change_type', f.change_type,
                    'detected_at', f.detected_at, 'effective_date', f.effective_date, 'source', f.source_title, 'status', f.ustatus, 'impact_level', f.impact_level, 'critical', f.critical)
                    order by f.critical desc, f.detected_at desc)
                  from (select * from filtered order by critical desc, detected_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) f), '[]'::jsonb)
  into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end
$$;

-- ---------------------------------------------------------------- Tutor: nunca escolhe, mostra nem comenta Questão StaziaMed
create or replace function public.tutor_pick_question(p_user uuid, p_mode text, p_level smallint, p_exclude text[] default '{}', p_area text default null) returns text
  language sql stable security definer set search_path = ''
as $$
  with last as (
    select distinct on (t.question_id) t.question_id, t.is_correct from public.question_attempts t where t.user_id = p_user order by t.question_id, t.answered_at desc, t.seq desc),
  weak as (
    select d.subarea, d.competency from public.question_attempts t join public.question_dna d on d.question_id = t.question_id
    where t.user_id = p_user and d.subarea is not null and d.competency is not null
    group by d.subarea, d.competency having count(*) >= 3 and count(*) filter (where not t.is_correct) * 10 >= count(*) * 4),
  band as (select case when p_level <= 3 then 'LOW' when p_level <= 6 then 'MODERATE' else 'HIGH' end b)
  select q.id
  from public.questions q
    left join public.question_dna d on d.question_id = q.id
    left join last l on l.question_id = q.id
    left join public.tutor_reviews r on r.user_id = p_user and r.question_id = q.id
  where q.origin = 'official' and q.status <> 'annulled' and q.correct_option is not null and jsonb_array_length(q.images) = 0 and not q.needs_image
    and not (q.id = any (coalesce(p_exclude, '{}')))
    and (p_area is null or q.area::text = p_area)
    and case when p_mode = 'erros' then (r.question_id is not null or l.is_correct = false)
             else (l.question_id is null or l.is_correct = false) end
  order by
    case when r.due_at <= now() then 0 else 1 end,
    case when l.is_correct = false then 0 else 1 end,
    case when p_mode = 'erros' then 0 when exists (select 1 from weak w where w.subarea = d.subarea and w.competency = d.competency) then 0 else 1 end,
    case when p_mode = 'erros' then 0 when coalesce(d.difficulty_estimate, 'MODERATE') = (select b from band) then 0 else 1 end,
    coalesce(r.due_at, 'infinity'::timestamptz),
    md5(q.id || p_user::text || current_date::text)
  limit 1
$$;

create or replace function public.tutor_question_view(p_question_id text, p_state text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'number', q.number, 'area', q.area, 'topic', q.topic,
    'exam', (select jsonb_build_object('kind', x.kind, 'year', x.year, 'semester', x.semester) from public.exams x where x.id = q.exam_id),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'state', p_state,
    'correct_option', case when p_state in ('answered', 'revealed') then q.correct_option end)
  from public.questions q where q.id = p_question_id and q.origin = 'official'
$$;

create or replace function public.ch_raw_tutor_truth(p_question_id text, p_level text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'area', q.area, 'topic', q.topic, 'subtopic', q.subtopic, 'statement', q.statement,
    'exam', (select x.kind || ' ' || x.year from public.exams x where x.id = q.exam_id), 'number', q.number,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text',
                  'explanation', case when p_level in ('hint', 'full') and q.status <> 'annulled'
                                       and not ('explanation_' || (o ->> 'id')) = any (h.campos)
                                      then nullif(btrim(o ->> 'explanation'), '') end) order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'official_answer', case when p_level in ('hint', 'full') then q.correct_option end,
    'expected_conduct', case when p_level in ('hint', 'full') and not 'expected_conduct' = any (h.campos) then q.expected_conduct end,
    'inep_intent', case when p_level in ('hint', 'full') and not 'inep_intent' = any (h.campos) then q.inep_intent end,
    'sources', case when p_level = 'full' and jsonb_array_length(q.sources) > 0 then public.ch_student_sources(q.sources) end,
    'analysis', case when p_level = 'full' then (select jsonb_build_object('question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
                     'options', (select jsonb_agg(jsonb_build_object('option_id', o.option_id, 'reasoning', o.reasoning, 'why_wrong', o.why_wrong, 'trap', o.trap) order by o.option_id) from public.question_option_analysis o where o.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published'
                     and public.question_analysis_fits(q.id, a.official_answer_at_analysis)) end,
    'update_card', case when p_level = 'full' then (select jsonb_build_object('official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'sources', public.ch_student_sources(k.sources))
                   from public.question_update_cards k where k.question_id = q.id and k.status = 'published'
                     and public.question_analysis_fits(q.id, k.official_answer) and public.ch_card_shows(k.sources)) end)
  from public.questions q
  cross join lateral (
    select public.question_hidden_fields(q.explanations_review, q.comment_review) as campos
  ) h
  where q.id = p_question_id and q.origin = 'official'
$$;

create or replace function public.app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null, p_context jsonb default null, p_personality text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  e jsonb;
  p public.tutor_preferences;
  t public.tutor_personalities;
  v_q text := nullif(p_question_id, '');
  v_ctype text := nullif(p_context ->> 'type', '');
  v_cid text := left(nullif(p_context ->> 'id', ''), 200);
  v_clabel text := left(nullif(btrim(p_context ->> 'label'), ''), 160);
  v_area text := nullif(p_context ->> 'area', '');
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
  v_id uuid;
  v_title text;
  v_open text;
  v_state text := 'none';
  v_strong boolean;
  v_mood text := (array['good', 'neutral', 'neutral', 'impatient'])[1 + floor(random() * 4)::int];
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if public.tutor_consent_pending(v_user) then raise exception 'Aceite do Tutor pendente.' using errcode = '42501'; end if;
  e := public.tutor_entitlement(v_user);
  if not (e ->> 'enabled')::boolean then raise exception 'O Tutor ainda não está ligado.' using errcode = '55000'; end if;
  if e ->> 'mode' = 'blocked' then raise exception 'Seu teste grátis do Tutor terminou. O Tutor continua nos planos pagos.' using errcode = '42501'; end if;
  if p_mode not in ('livre', 'aula', 'revisao', 'perguntas', 'questao', 'erros') then raise exception 'Modo inválido.' using errcode = '22023'; end if;
  if v_ctype is not null and v_ctype not in ('question', 'error', 'theme', 'area', 'flashcard', 'weak_points', 'free') then raise exception 'Contexto inválido.' using errcode = '22023'; end if;
  if v_area is not null and not exists (select 1 from unnest(enum_range(null::public.med_area)) a where a::text = v_area) then raise exception 'Área inválida.' using errcode = '22023'; end if;
  if p_personality is not null then
    -- Nexus: o professor escolhido na entrada; a última escolha é gravada junto (mesma regra de app_tutor_save_preferences)
    select * into t from public.tutor_personalities where id = p_personality and active and id in ('acolhedor', 'durona', 'direto');
    if not found then raise exception 'Professor não encontrado.' using errcode = '22023'; end if;
    insert into public.tutor_preferences (user_id, personality_id, intensity, profanity, updated_at)
    values (v_user, t.id, 3, case when (t.params ->> 'profanity')::int >= 20 then (select c.max_profanity from public.tutor_config c) else 'off' end, now())
    on conflict (user_id) do update set personality_id = excluded.personality_id, intensity = 3, profanity = excluded.profanity, updated_at = now()
    returning * into p;
  else
    select * into p from public.tutor_preferences where user_id = v_user;
    if not found or not exists (select 1 from public.tutor_personalities x where x.id = p.personality_id and x.active) then
      insert into public.tutor_preferences (user_id) values (v_user)
      on conflict (user_id) do update set personality_id = 'acolhedor', profanity = 'off', intensity = 3 returning * into p;
    end if;
    select * into t from public.tutor_personalities where id = p.personality_id;
  end if;
  v_strong := public.tutor_profanity(t.id, p.profanity) = 'moderate';

  if p_mode in ('questao', 'erros') then
    if (e #>> '{questions,remaining}') is not null and (e #>> '{questions,remaining}')::int <= 0 then
      raise exception 'Você chegou ao limite de % questões de hoje no teste grátis. Amanhã tem mais.', e #>> '{questions,limit}' using errcode = '54000';
    end if;
    v_q := coalesce(v_q, public.tutor_pick_question(v_user, p_mode, 3::smallint, '{}', v_area));
    if v_q is null then
      raise exception '%', case when p_mode = 'erros' then 'Você não tem erros para revisar agora.' else 'Não há questão disponível para treinar agora.' end using errcode = 'P0002';
    end if;
    v_state := 'open';
  elsif v_q is not null then
    -- conversar sobre uma questão específica só depois de respondê-la (mesma regra da correção)
    if not public.question_viewable(v_q) then raise exception 'Responda a questão antes de discuti-la com o Tutor.' using errcode = '42501'; end if;
    v_state := 'answered';
  end if;
  if v_q is not null and not exists (select 1 from public.questions where id = v_q and status <> 'annulled' and origin = 'official') then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if v_q is not null and v_ctype is null then v_ctype := 'question'; v_cid := v_q; end if;

  v_title := left(coalesce(
    case when v_ctype = 'weak_points' then 'Meus pontos fracos' end,
    case when p_mode = 'erros' and v_area is not null then 'Erros de ' || initcap(replace(lower(v_area), '_', ' ')) end,
    v_clabel, v_topic, (select q.topic from public.questions q where q.id = v_q),
    case when v_area is not null then initcap(replace(lower(v_area), '_', ' ')) end,
    case p_mode when 'livre' then 'Perguntar ao Tutor' when 'aula' then 'Aula' when 'revisao' then 'Revisão rápida' when 'perguntas' then 'Me teste'
                when 'questao' then 'Questões' else 'Meus erros' end), 120);
  insert into public.tutor_sessions (user_id, mode, title, topic, question_id, question_state, personality_id, intensity, settings, context_type, context_id, context_label, emotion)
  values (v_user, p_mode, v_title, coalesce(v_topic, case when v_ctype in ('theme', 'flashcard') then v_clabel end), v_q, v_state, t.id, 3,
          jsonb_build_object('profanity', p.profanity, 'adaptive', true, 'params', t.params, 'area', v_area),
          v_ctype, coalesce(v_cid, v_area), v_clabel,
          -- humor do dia: muda o jeito de começar, nunca o conteúdo (o resto do estado nasce no servidor, pelo motor do professor)
          jsonb_build_object('session_mood', v_mood, 'frustration', case v_mood when 'impatient' then 12 when 'good' then 0 else 5 end))
  returning id into v_id;
  -- abertura: na voz do personagem e variando entre conversas (sem IA e sem conteúdo médico)
  v_open := case
    when p_mode = 'erros' then public.tutor_line(t.id, 'review', v_id::text, null, v_strong)
    when p_mode = 'questao' then public.tutor_line(t.id, 'question', v_id::text, null, v_strong)
    when coalesce(v_topic, v_clabel) is not null and v_ctype is distinct from 'weak_points' then public.tutor_line(t.id, 'topic', v_id::text, coalesce(v_topic, v_clabel), v_strong)
    when t.lines ? ('opening_' || v_mood) then public.tutor_line(t.id, 'opening_' || v_mood, v_id::text, null, false)
    else public.tutor_line(t.id, 'opening', v_id::text, null, v_strong) end;
  -- discutir uma questão já respondida (no treino ou no Tutor): o professor pergunta o porquê da escolha
  if v_state = 'answered' then
    v_open := coalesce((select public.tutor_line(t.id, 'discuss', v_id::text, a.selected_option::text, false)
                        from public.question_attempts a where a.user_id = v_user and a.question_id = v_q order by a.answered_at desc, a.seq desc limit 1), v_open);
  end if;
  insert into public.tutor_messages (session_id, user_id, role, content, meta) values (v_id, v_user, 'tutor', v_open, jsonb_build_object('opening', true, 'grounding', 'none'));
  return public.app_tutor_session(v_id);
end
$$;

create or replace function public.tutor_answer_for(v_user uuid, p_session_id uuid, p_option text, p_confidence integer, p_response_ms integer default null, p_first_pick text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.tutor_sessions;
  q public.questions;
  e jsonb;
  v_ok boolean;
  v_lucky boolean;
  v_heavy boolean;
  v_outcome text;
  v_clean boolean;
  v_sc smallint; v_sw smallint; v_level smallint;
  r public.tutor_reviews;
  v_reason text;
  v_steps constant integer[] := array[1, 3, 7, 14, 30];
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if public.tutor_consent_pending(v_user) then raise exception 'Aceite do Tutor pendente.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tutor:' || v_user::text, 0));
  select * into s from public.tutor_sessions where id = p_session_id and user_id = v_user for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if s.question_id is null or s.question_state <> 'open' then raise exception 'Não há questão aberta nesta conversa.' using errcode = '22023'; end if;
  if p_option not in ('A', 'B', 'C', 'D') then raise exception 'Alternativa inválida.' using errcode = '22023'; end if;
  if p_confidence is not null and p_confidence not between 0 and 5 then raise exception 'Confiança de 0 a 5.' using errcode = '22023'; end if;
  if p_first_pick is not null and p_first_pick not in ('A', 'B', 'C', 'D') then raise exception 'Alternativa inválida.' using errcode = '22023'; end if;
  e := public.tutor_entitlement(v_user);
  if e ->> 'mode' = 'blocked' then raise exception 'Seu teste grátis do Tutor terminou. O Tutor continua nos planos pagos.' using errcode = '42501'; end if;
  if (e #>> '{questions,remaining}') is not null and (e #>> '{questions,remaining}')::int <= 0 then
    raise exception 'Você chegou ao limite de % questões de hoje no teste grátis. Amanhã tem mais.', e #>> '{questions,limit}' using errcode = '54000';
  end if;
  select * into q from public.questions where id = s.question_id;
  if q.origin is distinct from 'official' then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  v_ok := q.correct_option = p_option::char(1);
  v_heavy := s.hint_level >= 3;
  v_lucky := v_ok and p_confidence is not null and p_confidence <= 1;
  v_outcome := case when p_confidence is null then 'normal'
                    when v_ok and p_confidence >= 4 then 'consolidated' when v_ok and p_confidence <= 2 then 'unstable'
                    when not v_ok and p_confidence >= 4 then 'priority' when not v_ok and p_confidence <= 2 then 'known_gap' else 'normal' end;
  insert into public.question_attempts (user_id, question_id, selected_option, confidence)
  values (v_user, q.id, p_option::char(1), case when p_confidence is null then null when p_confidence <= 1 then 1 when p_confidence <= 3 then 2 else 3 end);
  insert into public.tutor_answers (session_id, user_id, question_id, selected_option, is_correct, confidence, hints_used, outcome, lucky_guess, heavy_hints, response_ms, first_pick)
  values (s.id, v_user, q.id, p_option::char(1), v_ok, p_confidence, s.hint_level, v_outcome, v_lucky, v_heavy,
          case when p_response_ms between 0 and 86400000 then p_response_ms end, nullif(p_first_pick, '')::char(1));

  v_clean := v_ok and not v_lucky and not v_heavy;
  v_sc := case when v_clean then s.streak_correct + 1 else 0 end;
  v_sw := case when v_ok then 0 else s.streak_wrong + 1 end;
  v_level := s.difficulty_level;
  if v_sc >= 3 then v_level := least(v_level + 1, 10); v_sc := 0; end if;
  if v_sw >= 2 then v_level := greatest(v_level - 2, 1); v_sw := 0; end if;
  update public.tutor_sessions set question_state = 'answered', streak_correct = v_sc, streak_wrong = v_sw, difficulty_level = v_level, last_message_at = now() where id = s.id;

  select * into r from public.tutor_reviews where user_id = v_user and question_id = q.id;
  v_reason := case when not v_ok and coalesce(p_confidence, 0) >= 4 then 'wrong_confident' when not v_ok then 'wrong' when v_lucky then 'lucky_guess' when v_heavy then 'heavy_hints' end;
  if v_reason is not null then
    insert into public.tutor_reviews (user_id, question_id, step, due_at, reason) values (v_user, q.id, 0, now() + interval '1 day', v_reason)
    on conflict (user_id, question_id) do update set step = 0, due_at = now() + interval '1 day', reason = excluded.reason, updated_at = now();
  elsif r.user_id is not null then
    if r.step >= 4 then delete from public.tutor_reviews where user_id = v_user and question_id = q.id;
    else update public.tutor_reviews set step = r.step + 1, due_at = now() + make_interval(days => v_steps[r.step + 2]), updated_at = now() where user_id = v_user and question_id = q.id;
    end if;
  end if;

  return jsonb_build_object('is_correct', v_ok, 'correct_option', q.correct_option, 'selected', p_option, 'outcome', v_outcome, 'lucky_guess', v_lucky, 'heavy_hints', v_heavy,
    'difficulty_level', v_level, 'review_scheduled', v_reason is not null, 'question_id', q.id,
    'changed', case when p_first_pick is not null and p_first_pick <> p_option then
                 case when q.correct_option = p_first_pick::char(1) then 'correct_to_wrong' when v_ok then 'wrong_to_correct' else 'wrong_to_wrong' end end);
end
$$;

-- ---------------------------------------------------------------- gabarito oficial: Questão StaziaMed é recusada (função e inserção direta)
create or replace function public.app_admin_set_official_answer(
  p_question_id text, p_answer text, p_status text, p_source text,
  p_source_url text default null, p_published_at date default null, p_reason text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_old record;
  v_answer constant text := nullif(upper(btrim(coalesce(p_answer, ''))), '');
  v_new_answer text;
  v_old_key text;  -- o gabarito como o aluno o vê: a letra, ou 'ANULADA'
  v_new_key text;
  v_recorrected integer := 0;
  v_fields text[] := '{}';
  v_review jsonb;
  v_flag jsonb;  -- a marca como estava antes deste registro
  v_cleared boolean := false;
  v_user uuid;
  v_play integer := 0;  -- alunos cujos números do Play foram contados de novo
begin
  perform public.assert_admin();
  if exists (select 1 from public.questions x where x.id = p_question_id and x.origin = 'staziamed') then
    raise exception 'Questão StaziaMed não tem gabarito oficial.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_source, ''))) = 0 then raise exception 'Informe a fonte do gabarito (documento e data).' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo da mudança.' using errcode = '22023'; end if;
  if p_status is null or p_status not in ('PRELIMINARY', 'FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED', 'UNKNOWN') then
    raise exception 'Situação do gabarito inválida.' using errcode = '22023';
  end if;
  if v_answer is not null and v_answer not in ('A', 'B', 'C', 'D') then raise exception 'Gabarito deve ser A, B, C ou D.' using errcode = '22023'; end if;
  if p_status in ('PRELIMINARY', 'FINAL', 'CHANGED_AFTER_APPEAL') and v_answer is null then
    raise exception 'Informe a letra do gabarito (A, B, C ou D).' using errcode = '22023';
  end if;
  select q.correct_option::text as correct_option, q.status, q.options, q.expected_conduct, q.explanations_review into v_old
  from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  v_flag := v_old.explanations_review;

  perform set_config('sqie.reason', 'Gabarito oficial: ' || p_status || ' (' || btrim(p_source) || '). Motivo: ' || btrim(p_reason), true);
  insert into public.question_official_answers (question_id, answer, answer_status, published_at, source, source_url)
  values (p_question_id, v_answer, p_status, p_published_at, btrim(p_source), nullif(btrim(p_source_url), '')) returning id, version into v_id, v_version;
  update public.questions set
    correct_option = case when p_status in ('FINAL', 'CHANGED_AFTER_APPEAL') then v_answer::char(1) else correct_option end,
    status = case p_status when 'ANNULLED' then 'annulled' when 'CHANGED_AFTER_APPEAL' then 'changed_after_appeal' when 'FINAL' then 'valid' else status end
  where id = p_question_id and p_status in ('FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED');
  select q.correct_option::text, case when q.status = 'annulled' then 'ANULADA' else q.correct_option::text end
    into v_new_answer, v_new_key
  from public.questions q where q.id = p_question_id;
  v_old_key := case when v_old.status = 'annulled' then 'ANULADA' else v_old.correct_option end;

  if v_new_answer is distinct from v_old.correct_option then
    -- as respostas antigas dos alunos, corrigidas de novo pelo gabarito novo (mesma regra do grade_question_attempt)
    update public.question_attempts set is_correct = coalesce(selected_option::text = v_new_answer, false)
    where question_id = p_question_id and is_correct is distinct from coalesce(selected_option::text = v_new_answer, false);
    get diagnostics v_recorrected = row_count;
  end if;

  if v_new_key is distinct from v_old_key then
    -- o que foi escrito para o gabarito antigo e agora contradiz o novo
    if v_old_key = 'ANULADA' then
      -- deixou de ser anulada: todas as explicações preenchidas
      v_fields := v_fields || array(select 'explanation_' || (o ->> 'id') from jsonb_array_elements(v_old.options) o
                                    where nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null order by o ->> 'id');
    elsif v_new_key = 'ANULADA' then
      null;  -- anulada agora: as explicações de alternativa já não saem ao aluno (nada a marcar)
    else
      -- outra letra: a explicação da antiga correta e a da nova
      if exists (select 1 from jsonb_array_elements(v_old.options) o
          where o ->> 'id' = v_old.correct_option and nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null) then
        v_fields := v_fields || ('explanation_' || v_old.correct_option);
      end if;
      if exists (select 1 from jsonb_array_elements(v_old.options) o
          where o ->> 'id' = v_new_answer and nullif(btrim(coalesce(o ->> 'explanation', '')), '') is not null) then
        v_fields := v_fields || ('explanation_' || v_new_answer);
      end if;
    end if;
    if nullif(btrim(coalesce(v_old.expected_conduct, '')), '') is not null then
      v_fields := v_fields || 'expected_conduct'::text;
    end if;
    if exists (select 1 from public.question_analysis a where a.question_id = p_question_id and a.is_current) then
      v_fields := v_fields || 'analise'::text;
    end if;

    if v_flag is not null and v_new_key is not distinct from (v_flag ->> 'de') then
      -- voltou ao gabarito de antes da primeira troca, antes da revisão: fica marcado só o texto que mudou durante a troca
      if jsonb_typeof(v_flag -> 'textos') = 'object' then
        v_fields := array(select n.campo from jsonb_each_text(public.question_review_snapshot(v_old.options, v_old.expected_conduct)) as n (campo, impressao)
                          where (v_flag -> 'textos' ->> n.campo) is distinct from n.impressao order by n.campo);
      else
        -- marca sem a impressão dos textos (feita antes desta versão): nada prova que não mudaram
        v_fields := array(select x.c from (select jsonb_array_elements_text(coalesce(v_flag -> 'campos', '[]'::jsonb)) union select unnest(v_fields)) as x (c)
                          where x.c <> 'analise' order by x.c);
      end if;
      if cardinality(v_fields) = 0 then
        update public.questions set explanations_review = null where id = p_question_id;
        v_cleared := true;
      else
        update public.questions q set explanations_review = v_flag || jsonb_build_object(
            'para', v_new_key, 'campos', to_jsonb(v_fields),
            'desde', now(), 'por', (select auth.uid()), 'motivo', btrim(p_reason), 'fonte', btrim(p_source))
        where q.id = p_question_id
        returning q.explanations_review into v_review;
      end if;
    elsif cardinality(v_fields) > 0 then
      -- outra troca antes da revisão: soma os campos e guarda o gabarito e a impressão dos textos de antes da primeira troca
      update public.questions q set explanations_review = jsonb_build_object(
          'de', coalesce(q.explanations_review -> 'de', to_jsonb(v_old_key)),
          'para', v_new_key,
          'campos', (select jsonb_agg(c order by c) from (
                       select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb)) as c
                       union select unnest(v_fields)) x),
          'textos', case when q.explanations_review is null then public.question_review_snapshot(v_old.options, v_old.expected_conduct)
                         else q.explanations_review -> 'textos' end,
          'desde', now(), 'por', (select auth.uid()), 'motivo', btrim(p_reason), 'fonte', btrim(p_source))
      where q.id = p_question_id
      returning q.explanations_review into v_review;
    end if;
  end if;
  if v_review is null then
    select q.explanations_review into v_review from public.questions q where q.id = p_question_id;
  end if;

  if v_new_answer is distinct from v_old.correct_option or v_new_key is distinct from v_old_key then
    -- Stazia Play: a questão passou a contar de outro jeito (anulada, de volta, ou outra letra): conta de novo quem a respondeu
    -- (em ordem de aluno, para duas trocas ao mesmo tempo não esperarem uma pela outra)
    for v_user in select distinct a.user_id from public.question_attempts a where a.question_id = p_question_id order by 1 loop
      v_play := v_play + public.gam_recount_answers(v_user);
    end loop;
  end if;

  perform public.ch_log('question.official_answer', p_question_id, jsonb_build_object('status', p_status, 'answer', v_answer, 'version', v_version, 'reason', btrim(p_reason)));
  perform public.admin_log('question.official_answer', p_question_id, jsonb_build_object(
    'status', p_status, 'answer', v_answer, 'from', v_old.correct_option, 'version', v_version, 'source', btrim(p_source),
    'reason', btrim(p_reason), 'recorrected', v_recorrected, 'review_cleared', v_cleared, 'play_recounted', v_play));
  return jsonb_build_object('id', v_id, 'version', v_version, 'recorrected', v_recorrected, 'review', v_review);
end
$$;

create or replace function public.question_official_answers_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.questions x where x.id = new.question_id and x.origin = 'staziamed') then
      raise exception 'Questão StaziaMed não tem gabarito oficial.' using errcode = '22023';
    end if;
    -- gabarito preliminar nunca substitui um definitivo (ou anulação) que já exista
    if new.answer_status = 'PRELIMINARY' and exists (select 1 from public.question_official_answers o where o.question_id = new.question_id and o.answer_status in ('FINAL', 'CHANGED_AFTER_APPEAL', 'ANNULLED')) then
      raise exception 'Já existe gabarito definitivo para esta questão: o preliminar não o substitui.' using errcode = '22023';
    end if;
    new.version := coalesce((select max(o.version) from public.question_official_answers o where o.question_id = new.question_id), 0) + 1;
    new.is_current := true;
    -- guarda o histórico: a versão anterior só deixa de ser "atual" (marca interna libera só esta atualização)
    perform set_config('sqie.internal', 'on', true);
    update public.question_official_answers set is_current = false where question_id = new.question_id and is_current;
    perform set_config('sqie.internal', 'off', true);
    return new;
  end if;
  raise exception 'O histórico do gabarito oficial não se altera nem se apaga: registre uma nova versão.' using errcode = '22023';
end
$$;

-- ---------------------------------------------------------------- administração do banco de questões: só oficiais; StaziaMed só muda pelo rascunho
create or replace function public.app_admin_questions(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
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
      where q.origin = 'official'
        and (v_search is null
             or q.code ilike '%' || v_search || '%'
             or q.search @@ websearch_to_tsquery('portuguese', v_search)
             or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, '')) like '%' || public.fold_text(v_search) || '%')
        and (nullif(f ->> 'exam_id', '') is null or q.exam_id = f ->> 'exam_id')
        and (nullif(f ->> 'area', '') is null or q.area::text = f ->> 'area')
        and (nullif(f ->> 'status', '') is null or q.status = f ->> 'status')
        and (coalesce((f ->> 'needs_image')::boolean, false) = false or (q.needs_image and jsonb_array_length(q.images) = 0))
        and (coalesce((f ->> 'review')::boolean, false) = false or q.explanations_review is not null)
        and (coalesce((f ->> 'comment_review')::boolean, false) = false or q.comment_review is not null)
    )
    select jsonb_build_object(
      'total', (select count(*)::int from matched),
      'comment_review_ready', cardinality(public.question_comment_review_missing()) = 0,
      'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'question_count', e.question_count)
                                          order by e.year desc, e.semester desc nulls last, e.kind), '[]'::jsonb)
                from public.exams e where e.kind <> 'STAZIAMED'),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'exam_id', m.exam_id, 'number', m.number, 'area', m.area, 'topic', m.topic,
          'status', m.status, 'needs_image', m.needs_image, 'images', jsonb_array_length(m.images),
          'correct_option', m.correct_option, 'excerpt', left(m.statement, 160), 'updated_at', m.updated_at,
          'explanations_review', m.explanations_review is not null,
          'comment_review', m.comment_review is not null)
          order by m.exam_id desc, m.number)
        from (select * from matched order by exam_id desc, number
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;

create or replace function public.app_admin_question(p_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_staff();
  select to_jsonb(q) - 'search' || jsonb_build_object(
           'exam', (select to_jsonb(e) from public.exams e where e.id = q.exam_id),
           'attempts', (select count(*)::int from public.question_attempts a where a.question_id = q.id),
           'official', (select jsonb_build_object('answer', o.answer, 'answer_status', o.answer_status, 'version', o.version, 'source', o.source,
                                                  'source_url', o.source_url, 'published_at', o.published_at, 'recorded_at', o.recorded_at)
                        from public.question_official_answers o where o.question_id = q.id and o.is_current),
           'comment_can_review', public.question_can_review_comment(q.area),
           'comment_review_ready', cardinality(public.question_comment_review_missing()) = 0,
           'comment_review_by', public.question_person_name(nullif(q.comment_review ->> 'por', '')::uuid),
           'comment_decision', (select jsonb_build_object('decision', r.decision, 'note', r.note, 'at', r.decided_at, 'by', public.question_person_name(r.decided_by))
                                from public.question_comment_reviews r where r.question_id = q.id order by r.decided_at desc, r.id desc limit 1))
    into v
  from public.questions q where q.id = p_id and q.origin = 'official';
  if v is null then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  return v;
end
$$;

create or replace function public.app_admin_save_question(p_question jsonb, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_problem text;
  v_result text;
  v_id text;
  v_reason text;
  v_old record;
  v_exam text;
begin
  perform public.assert_staff();
  -- B1: o único motivo aceito é o do assistente; nulo ou só espaços = sem motivo
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    v_reason := null;
  elsif p_reason = 'assistente de IA' then
    v_reason := p_reason;
  else
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;
  if (p_question ->> 'kind') = 'STAZIAMED' or exists (select 1 from public.questions x where x.id = p_question ->> 'id' and x.origin = 'staziamed') then
    raise exception 'Questões StaziaMed só mudam pelo rascunho na Central de Conteúdo.' using errcode = '22023';
  end if;
  v_problem := public.admin_question_problem(p_question);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  v_exam := public.admin_exam_id(p_question ->> 'kind', (p_question ->> 'year')::int, nullif(p_question ->> 'semester', '')::int);
  -- trocar prova/número de uma questão existente não é permitido (mudaria o código e o histórico)
  if nullif(p_question ->> 'id', '') is not null then
    select q.id into v_id from public.questions q
    where q.id = p_question ->> 'id' and q.exam_id = v_exam and q.number = (p_question ->> 'number')::int;
    if v_id is null then
      raise exception 'Prova e número de uma questão existente não podem ser alterados.' using errcode = '22023';
    end if;
  end if;
  -- a questão que já existe com essa prova e número (como o admin_upsert_question a acha)
  select q.id, q.correct_option::text as correct_option, q.status into v_old
  from public.questions q where q.exam_id = v_exam and q.number = (p_question ->> 'number')::int
  for update;
  if found then
    -- Q01: "Nova questão" (sem id) nunca grava por cima de uma que já existe
    if nullif(p_question ->> 'id', '') is null then
      raise exception 'Essa questão já existe: abra-a para editar.' using errcode = '22023';
    end if;
    -- Q02: gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial (administrador, com fonte
    -- e motivo); vale para todos, com ou sem o motivo do assistente (substitui a regra B2 da …6100)
    if v_old.correct_option is distinct from nullif(p_question ->> 'correct_option', '')
       or v_old.status is distinct from coalesce(nullif(p_question ->> 'status', ''), 'valid') then
      raise exception 'Gabarito e situação de questão já gravada só mudam pelo registro do gabarito oficial (administrador, com fonte e motivo).' using errcode = '22023';
    end if;
  end if;
  -- B3: a trilha (questions_change_trail) lê o motivo de sqie.reason, que vale para a transação inteira; por isso ele é
  -- definido em todo salvamento (vazio quando não há motivo) e não passa de um salvamento para o seguinte
  perform set_config('sqie.reason', coalesce(v_reason, ''), true);
  v_result := public.admin_upsert_question(p_question, true);
  perform public.admin_refresh_exam_counts();
  select q.id into v_id from public.questions q
  where q.exam_id = v_exam and q.number = (p_question ->> 'number')::int;
  -- B4: o gatilho da trilha só roda em atualização; a questão nova salva com o motivo ganha aqui a linha de criação
  if v_result = 'inserted' and v_reason is not null then
    insert into public.question_change_log (question_id, changed_by, reason, changes)
    select q.id, (select auth.uid()), v_reason, jsonb_build_object('criacao', jsonb_build_object('de', null, 'para', q.exam_id || '#' || q.number))
    from public.questions q where q.id = v_id;
  end if;
  perform public.admin_log('question.' || v_result, v_id,
    jsonb_build_object('status', coalesce(nullif(p_question ->> 'status', ''), 'valid'))
      || case when v_reason is null then '{}'::jsonb else jsonb_build_object('reason', v_reason) end);
  return public.app_admin_question(v_id);
end
$$;

create or replace function public.admin_upsert_question(q jsonb, p_update boolean) returns text
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
  if v_kind = 'STAZIAMED' then
    raise exception 'Questões StaziaMed só mudam pelo rascunho na Central de Conteúdo.' using errcode = '22023';
  end if;
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

create or replace function public.admin_import_merge_question(p_id text, q jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.questions set
    area = (q ->> 'area')::public.med_area,
    topic = btrim(q ->> 'topic'),
    subtopic = coalesce(nullif(btrim(coalesce(q ->> 'subtopic', '')), ''), subtopic),
    specialty = coalesce(nullif(btrim(coalesce(q ->> 'specialty', '')), ''), specialty),
    statement = btrim(q ->> 'statement'),
    options = public.admin_import_merge_options(options, q -> 'options'),
    expected_conduct = coalesce(nullif(btrim(coalesce(q ->> 'expected_conduct', '')), ''), expected_conduct),
    inep_intent = coalesce(nullif(btrim(coalesce(q ->> 'inep_intent', '')), ''), inep_intent),
    needs_image = case when q ->> 'needs_image_declared' = 'true'
                       then coalesce((q ->> 'needs_image')::boolean, needs_image) or (needs_image and jsonb_array_length(images) = 0)
                       else needs_image end,
    sources = case when jsonb_typeof(q -> 'sources') = 'array' and jsonb_array_length(q -> 'sources') > 0 then q -> 'sources' else sources end
  where id = p_id and origin = 'official';
end
$$;

create or replace function public.app_admin_delete_question(p_question_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
  v_attempts integer;
  v_notes integer;
  v_tutor integer;
  v_tutor_sessions integer;
  v_bookmarks integer;
  v_sessions integer;
  v_why text[] := '{}';
begin
  perform public.assert_admin();
  -- a trava da linha faz uma resposta que chegue agora esperar: ela ou é contada abaixo, ou falha por a questão não existir mais
  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if v.origin = 'staziamed' then raise exception 'Questões StaziaMed só mudam pelo rascunho na Central de Conteúdo.' using errcode = '22023'; end if;

  select count(*)::int into v_attempts from public.question_attempts a where a.question_id = v.id;
  select count(*)::int into v_notes from public.error_notes n where n.question_id = v.id;
  select count(*)::int into v_tutor from public.tutor_answers t where t.question_id = v.id;
  select count(*)::int into v_tutor_sessions from public.tutor_sessions s where s.question_id = v.id;
  select count(*)::int into v_bookmarks from public.question_bookmarks b where b.question_id = v.id;
  select count(*)::int into v_sessions from public.practice_sessions s where v.id = any (s.question_ids);
  if v_attempts > 0 then v_why := v_why || (v_attempts || case when v_attempts = 1 then ' resposta de aluno' else ' respostas de alunos' end); end if;
  if v_notes > 0 then v_why := v_why || (v_notes || case when v_notes = 1 then ' anotação de erro de aluno' else ' anotações de erro de alunos' end); end if;
  if v_tutor > 0 then v_why := v_why || (v_tutor || case when v_tutor = 1 then ' resposta dada no Tutor' else ' respostas dadas no Tutor' end); end if;
  if v_tutor_sessions > 0 then v_why := v_why || (v_tutor_sessions || case when v_tutor_sessions = 1 then ' conversa do Tutor' else ' conversas do Tutor' end); end if;
  if v_bookmarks > 0 then v_why := v_why || ('marcada por ' || v_bookmarks || case when v_bookmarks = 1 then ' aluno' else ' alunos' end); end if;
  if v_sessions > 0 then v_why := v_why || (v_sessions || case when v_sessions = 1 then ' sessão de treino de aluno' else ' sessões de treino de alunos' end); end if;
  if cardinality(v_why) > 0 then
    raise exception 'Esta questão não pode ser apagada: tem %. Se ela não deve mais valer, anule a questão pelo registro do gabarito oficial.', array_to_string(v_why, ', ')
      using errcode = '22023';
  end if;

  -- cópia inteira no registro de ações, para a questão poder ser recriada
  perform public.admin_log('question.delete', v.id, jsonb_build_object(
    'code', v.code, 'exam_id', v.exam_id, 'number', v.number, 'topic', v.topic, 'status', v.status,
    'excerpt', left(v.statement, 160), 'snapshot', to_jsonb(v) - 'search'));
  delete from public.questions where id = v.id;
  perform public.admin_refresh_exam_counts();
  return jsonb_build_object('deleted', true, 'id', v.id, 'code', v.code);
end
$$;

create or replace function public.app_admin_overview() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_admin boolean;
  v_lessons integer; v_podcasts integer; v_updates integer; v_content integer;
  v_central numeric; v_tutor numeric;
  v_result jsonb;
begin
  perform public.assert_staff();
  v_admin := public.is_admin();

  begin
    select count(*)::int into v_lessons from public.lessons where not published;
  exception when others then v_lessons := null; end;
  begin
    select count(*)::int into v_podcasts from public.podcasts where status = 'script_ready';
  exception when others then v_podcasts := null; end;
  begin
    select count(*)::int into v_updates from public.guideline_updates where review_status = 'pending';
  exception when others then v_updates := null; end;
  begin
    select count(*)::int into v_content from public.ch_unit_versions where status = 'awaiting_review';
  exception when others then v_content := null; end;

  v_result := jsonb_build_object(
    'questions', jsonb_build_object(
      'total', (select count(*)::int from public.questions where origin = 'official'),
      'annulled', (select count(*)::int from public.questions where origin = 'official' and status = 'annulled'),
      'needs_image', (select count(*)::int from public.questions where origin = 'official' and needs_image and jsonb_array_length(images) = 0),
      'staziamed', jsonb_build_object('published', (select count(*)::int from public.questions where origin = 'staziamed' and retired_at is null),
                                      'retired', (select count(*)::int from public.questions where origin = 'staziamed' and retired_at is not null)),
      'exams', (select count(*)::int from public.exams where kind <> 'STAZIAMED')
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
    ),
    'pending_review', jsonb_strip_nulls(jsonb_build_object(
      'stations', (select count(*)::int from public.checklist_stations where medical_review = 'pending'),
      'lessons_draft', v_lessons,
      'podcasts', v_podcasts,
      'updates', v_updates,
      'content', v_content
    ))
  );

  begin
    select coalesce(sum(c.cost_usd), 0) into v_central from public.ai_calls c
    where c.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  exception when others then v_central := null; end;
  begin
    -- só o Tutor/Nexus (feature tutor_*): roteiro e áudio do podcast e o assistente da aula também gravam no ledger,
    -- mas esse custo já entra em ai_calls (Central de IAs) e apareceria em dobro
    select coalesce(sum(l.estimated_cost_usd), 0) into v_tutor from public.ai_usage_ledger l
    where left(l.feature, 6) = 'tutor_' and l.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  exception when others then v_tutor := null; end;

  -- gasto de IA do mês: administrador e editor (decisão do dono)
  v_result := v_result || jsonb_build_object('ai_month', jsonb_strip_nulls(jsonb_build_object('central_usd', v_central, 'tutor_usd', v_tutor)));

  if v_admin then
    v_result := v_result || jsonb_build_object(
      'users', jsonb_build_object(
        'total', (select count(*)::int from auth.users),
        'new_7d', (select count(*)::int from auth.users where created_at > now() - interval '7 days'),
        -- estudou nos últimos 7 dias: respondeu questão, revisou flashcard, viu aula ou conversou com o Nexus (só alunos)
        'active_7d', (select count(distinct x.user_id)::int from (
          select user_id from public.question_attempts where answered_at > now() - interval '7 days'
          union all
          select user_id from public.flashcard_reviews where reviewed_at > now() - interval '7 days'
          union all
          select user_id from public.lesson_progress where last_at > now() - interval '7 days'
          union all
          select user_id from public.tutor_messages where role = 'student' and created_at > now() - interval '7 days') x
          where not public.user_is_staff(x.user_id)),
        'by_role', (select coalesce(jsonb_object_agg(r.role::text, r.n), '{}'::jsonb)
                    from (select role, count(*)::int as n from public.user_roles group by role) r),
        -- teste que passou do prazo conta como "expired" (a assinatura no banco continua como está)
        'by_plan', (select coalesce(jsonb_object_agg(s.k, s.n), '{}'::jsonb)
                    from (select plan || ':' || (case when status = 'trialing' and trial_ends_at is not null and trial_ends_at <= now()
                                                      then 'expired' else status::text end) as k, count(*)::int as n
                          from public.subscriptions x
                          where not public.user_is_staff(x.user_id) group by 1) s)
      )
    );
  end if;
  return v_result;
end
$$;

create or replace function public.app_question_figure(p_question_id text, p_index integer default 0) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('path', q.images -> p_index ->> 'path', 'url', q.images -> p_index ->> 'url', 'alt', q.images -> p_index ->> 'alt'))
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null and (q.origin = 'official' or public.has_ineditas()) and p_index >= 0 and p_index < jsonb_array_length(q.images)
$$;


-- ---------------------------------------------------------------- permissões das funções novas
revoke execute on function public.ineditas_user_access(uuid) from public, anon, authenticated;
revoke execute on function public.ineditas_gate_for(uuid) from public, anon, authenticated;
revoke execute on function public.question_attempts_ineditas_gate() from public, anon, authenticated;
-- As três podem ser chamadas também sem login (as funções "language sql" do aluno, como practice_pool e app_question_filters, conferem a
-- permissão ao montar o plano, mesmo nos ramos que não rodam): para quem não está logado dão falso, nulo e zero.
revoke execute on function public.has_ineditas() from public;
grant execute on function public.has_ineditas() to anon, authenticated;
revoke execute on function public.ineditas_gate() from public;
grant execute on function public.ineditas_gate() to anon, authenticated;
revoke execute on function public.practice_result(uuid) from public, anon;
grant execute on function public.practice_result(uuid) to authenticated;
revoke execute on function public.ineditas_option() from public;
grant execute on function public.ineditas_option() to anon, authenticated;

-- Para desfazer: recriar as funções de …1900, …3800, …4300, …0700, …9701 e …9730 que esta migração redefine; depois
-- "drop trigger question_attempts_ineditas_gate", recriar a política "questões: leitura para logados" (using (true)) e
-- apagar as colunas origin, retired_at e support (só se não houver Questão StaziaMed publicada).
