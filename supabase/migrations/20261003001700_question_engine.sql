-- =============================================================================
-- Pacote do motor de engenharia reversa (staziamed.revalida.import-package.v1):
--   - classificação detalhada de cada questão (DNA) — só para a equipe, porque traz o conceito
--     da resposta correta e os padrões dos distratores;
--   - registro de tudo o que a limpeza de rodapé removeu do texto;
--   - questões equivalentes entre provas (ENAMED 2025 × Revalida 2025/2): não repetem no treino;
--   - incidência real por tema, a partir das questões oficiais catalogadas.
-- =============================================================================

create table public.question_dna (
  question_id text primary key references public.questions (id) on delete cascade,
  subarea text,
  competency text,
  secondary_competencies text[] not null default '{}',
  cognitive_task text,
  care_setting text,
  patient_group text,
  urgency_level text,
  question_format text,
  reasoning_types text[] not null default '{}',
  protocol_dependency text,
  difficulty_estimate text,
  classification_confidence real,
  review_required boolean not null default false,
  review_reason text,
  detail jsonb not null default '{}'::jsonb,       -- decisão clínica, conceitos, distratores etc.
  dataset_version text not null
);
alter table public.question_dna enable row level security;
create policy "classificação detalhada: equipe lê" on public.question_dna for select to authenticated using (public.is_staff());

create table public.question_cleanups (
  question_id text not null references public.questions (id) on delete cascade,
  field text not null,
  rule text not null,
  removed_text text not null,
  primary key (question_id, field, rule, removed_text)
);
alter table public.question_cleanups enable row level security;
create policy "limpezas: equipe lê" on public.question_cleanups for select to authenticated using (public.is_staff());

-- Mesmo enunciado cobrado em provas diferentes: um grupo por conjunto de questões equivalentes.
create table public.question_equivalents (
  question_id text primary key references public.questions (id) on delete cascade,
  group_id text not null,
  similarity real not null
);
create index question_equivalents_group_idx on public.question_equivalents (group_id);
alter table public.question_equivalents enable row level security;
create policy "equivalentes: logados leem" on public.question_equivalents for select to authenticated using (true);

-- ---------------------------------------------------------------- filtros pela classificação do motor
-- O aluno não lê question_dna (traz o conceito da resposta); esta função só devolve sim/não.
create function public.question_matches_dna(p_question_id text, p_subarea text, p_competency text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.question_dna d
    where d.question_id = p_question_id
      and (nullif(p_subarea, '') is null or d.subarea = p_subarea)
      and (nullif(p_competency, '') is null or d.competency = p_competency))
$$;

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

-- ---------------------------------------------------------------- treino sem repetir equivalentes
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

-- ---------------------------------------------------------------- incidência real
-- Conta, nas questões OFICIAIS catalogadas, quantas vezes cada tema apareceu em cada prova.
-- Método: questões anuladas e excluídas estatisticamente ficam de fora da contagem; questões
-- sem classificação detalhada são contadas à parte; questões repetidas entre provas contam
-- uma vez por prova em que apareceram (cada aparição é uma questão aplicada).
create function public.app_incidence(p_dimension text default 'topic', p_area text default null)
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
      where (%2$L::text is null or q.area::text = %2$L)
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
      'exams', (select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.year, e.semester) from public.exams e),
      'counted', (select count(*)::int from base where status <> 'annulled' and key is not null),
      'annulled', (select count(*)::int from base where status = 'annulled'),
      'unclassified', (select count(*)::int from base where status <> 'annulled' and key is null),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'total', total, 'by_exam', by_exam, 'area', area) order by total desc, key) from counted), '[]'::jsonb))
  $f$, v_expr, p_area, v_dim) into v_result;
  return v_result;
end
$$;
