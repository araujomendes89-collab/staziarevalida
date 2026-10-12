-- =============================================================================
-- Aba Questões, Q09 (decisão do dono, 11/10/2026): comentário novo ou alterado de uma questão fica "Em revisão" e só aparece ao
-- aluno depois que o revisor médico da área aprovar. O texto que já está no ar continua visível até alguém mexer.
--
--   * O que conta como comentário: a explicação de cada alternativa (A a D), a conduta esperada e o "o que a questão avalia".
--     Gabarito, situação (anulada…), enunciado, alternativas, tema e fontes NÃO entram: a correção oficial do gabarito segue só
--     pelo registro do gabarito oficial (…7700/…7710) e não é afetada.
--   * Quando uma PESSOA logada (editor, administrador, importação, assistente de IA) grava um desses textos novo ou diferente
--     (espaços nas pontas e repetidos não contam), o campo entra em questions.comment_review ({campos, desde, por, ia}) e some do
--     aluno (correção, Tutor): practice_correction_view e tutor_truth passam a esconder também estes campos, junto com a marca
--     do gabarito (explanations_review), que continua como era. Texto apagado sai da revisão. A questão em si segue valendo.
--     Sem pessoa logada (SQL colado no editor do Supabase, serviço) nada é marcado: é o jeito do dono corrigir à mão.
--     Textos que já estão gravados hoje NÃO são mexidos (continuam visíveis até alguém alterar).
--   * Quem decide: o revisor médico cadastrado na área da questão (ch_reviewer_areas) ou o administrador, com a nota do que foi
--     conferido (10 letras ou mais), como nas Estações e nas Atualizações. Aprovar tira todos os campos da revisão e grava quem,
--     quando e o quê (question_comment_reviews, tabela fechada ao app); o banco recusa a aprovação de um texto que mudou depois
--     que o revisor o leu (p_seen_texts). Devolver mantém tudo escondido e deixa a nota para quem escreveu. O editor e o aluno
--     não decidem. O revisor médico que não é da equipe só abre a fila e o conteúdo das questões das áreas dele.
--
-- Funções redefinidas (cada uma a partir da versão mais nova): ch_raw_practice_correction_view e ch_raw_tutor_truth (…9620, as
--   funções que praticam a regra por baixo de practice_correction_view e tutor_truth), app_admin_questions e app_admin_question (…7700).
-- Novas: app_admin_comment_review_queue, app_admin_comment_review, app_admin_question_comment_decide, app_question_comment_check
--   (conferência para o administrador) e as internas question_comment_review_missing (a lista e a questão da equipe trazem
--   comment_review_ready: a tela só promete "vai para revisão" quando o banco a pratica), question_comment_fields, question_hidden_fields, question_can_review_comment,
--   question_comment_assert_access, question_person_name e o gatilho questions_comment_review_mark.
--
-- ORDEM: depois da …9620 e da …9621 (fontes complementares) e da …7700. Se a …9620 for colada de novo, cole esta de novo depois
-- (ela redefine as duas funções ch_raw_*); `select public.app_question_comment_check();` (administrador) confere.
-- Pode ser colada duas vezes. Para desfazer: apagar o gatilho e as funções novas e recriar as duas ch_raw_* e as duas app_admin_* como
-- nas migrações citadas (a coluna comment_review e a tabela question_comment_reviews podem ficar).
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.ch_raw_practice_correction_view(text, text)') is null or to_regprocedure('public.ch_raw_tutor_truth(text, text)') is null then
    raise exception 'Cole primeiro as migrações das fontes complementares (…9620 e …9621) e depois este arquivo.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'explanations_review') then
    raise exception 'Cole primeiro o arquivo da …7700 (correções da aba Questões) e depois este.';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- a marca e o registro das decisões
-- O aluno não lê estas colunas nem esta tabela (as colunas liberadas a ele são listadas na …1900; a tabela fica fechada).
alter table public.questions add column if not exists comment_review jsonb;

create table if not exists public.question_comment_reviews (
  id bigint generated always as identity primary key,
  question_id text not null references public.questions (id) on delete cascade,
  decision text not null check (decision in ('approve', 'return')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  note text not null check (char_length(note) between 10 and 1000),
  campos text[] not null default '{}'
);
create index if not exists question_comment_reviews_question_idx on public.question_comment_reviews (question_id, decided_at desc, id desc);
alter table public.question_comment_reviews enable row level security;
revoke all on table public.question_comment_reviews from public, anon, authenticated;

-- ---------------------------------------------------------------- peças internas
-- Os textos de comentário de uma questão como mapa campo → texto sem espaços nas pontas ('' quando vazio).
create or replace function public.question_comment_fields(p_options jsonb, p_conduct text, p_intent text) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_object_agg(x.campo, x.texto)
  from (
    select 'explanation_' || l.id as campo,
           coalesce(btrim((select o ->> 'explanation' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o where o ->> 'id' = l.id limit 1)), '') as texto
    from unnest(array['A', 'B', 'C', 'D']) as l (id)
    union all select 'expected_conduct', coalesce(btrim(p_conduct), '')
    union all select 'inep_intent', coalesce(btrim(p_intent), '')
  ) x
$$;
revoke execute on function public.question_comment_fields(jsonb, text, text) from public, anon, authenticated;

-- Campos escondidos do aluno: os da marca do gabarito (…7700) e os do comentário em revisão.
create or replace function public.question_hidden_fields(p_explanations_review jsonb, p_comment_review jsonb) returns text[]
  language sql immutable set search_path = ''
as $$
  select coalesce(array(
    select c from (
      select jsonb_array_elements_text(coalesce(p_explanations_review -> 'campos', '[]'::jsonb)) as c
      union
      select jsonb_array_elements_text(coalesce(p_comment_review -> 'campos', '[]'::jsonb))
    ) x order by c), '{}'::text[])
$$;
revoke execute on function public.question_hidden_fields(jsonb, jsonb) from public, anon, authenticated;

-- Quem decide sobre o comentário de uma questão desta área: administrador ou revisor médico cadastrado na área.
create or replace function public.question_can_review_comment(p_area public.med_area) returns boolean
  language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and (public.is_admin() or public.ch_is_reviewer(public.guideline_area_code(p_area))) $$;
revoke execute on function public.question_can_review_comment(public.med_area) from public, anon, authenticated;

-- Quem abre a fila e o conteúdo: a equipe (editor ou administrador) ou um revisor médico cadastrado em alguma área.
create or replace function public.question_comment_assert_access() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (public.is_staff() or public.ch_is_reviewer()) then
    raise exception 'Acesso restrito à equipe e aos revisores médicos.' using errcode = '42501';
  end if;
end
$$;
revoke execute on function public.question_comment_assert_access() from public, anon, authenticated;

create or replace function public.question_person_name(p_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(p.name, ''), u.email) from auth.users u left join public.profiles p on p.id = u.id where u.id = p_id $$;
revoke execute on function public.question_person_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- o gatilho: texto novo ou alterado espera revisão
create or replace function public.questions_comment_review_mark() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_new jsonb;
  v_old jsonb;
  v_changed text[];
  v_campos text[];
  v_flag jsonb := new.comment_review;
begin
  -- sem pessoa logada (SQL do dono, serviço): não passa pela revisão
  if v_uid is null then return new; end if;
  v_new := public.question_comment_fields(new.options, new.expected_conduct, new.inep_intent);
  v_old := case when tg_op = 'INSERT' then '{}'::jsonb else public.question_comment_fields(old.options, old.expected_conduct, old.inep_intent) end;
  v_changed := array(select e.k from jsonb_each_text(v_new) as e (k, v) where e.v <> '' and e.v is distinct from (v_old ->> e.k) order by e.k);
  -- os que já esperavam revisão e os que mudaram agora, menos os que ficaram vazios
  v_campos := array(
    select c from (select jsonb_array_elements_text(coalesce(v_flag -> 'campos', '[]'::jsonb)) as c union select unnest(v_changed)) x
    where coalesce(v_new ->> c, '') <> '' order by c);
  if cardinality(v_campos) = 0 then
    new.comment_review := null;
  elsif cardinality(v_changed) = 0 then
    -- nada novo: só tira da revisão o que foi apagado
    if v_flag is not null then new.comment_review := v_flag || jsonb_build_object('campos', to_jsonb(v_campos)); end if;
  else
    -- mexeu no texto: a devolução anterior (se houve) já foi atendida e sai da marca
    new.comment_review := jsonb_build_object(
      'campos', to_jsonb(v_campos),
      'desde', coalesce(v_flag -> 'desde', to_jsonb(now())),
      'por', to_jsonb(v_uid),
      'ia', coalesce((v_flag ->> 'ia')::boolean, false) or coalesce(nullif(current_setting('sqie.reason', true), '') = 'assistente de IA', false));
  end if;
  return new;
end
$$;
revoke execute on function public.questions_comment_review_mark() from public, anon, authenticated;
drop trigger if exists questions_comment_review_mark on public.questions;
create trigger questions_comment_review_mark before insert or update of options, expected_conduct, inep_intent on public.questions
  for each row execute function public.questions_comment_review_mark();

-- ---------------------------------------------------------------- o que o aluno vê (corpos da …9620)
-- Correção para o aluno: igual à da …9620, só que os campos escondidos são os da marca do gabarito E os do comentário em revisão
-- (a explicação de cada alternativa, a conduta esperada e o "o que avalia").
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
    'sources', public.ch_student_sources(q.sources)
  )
  from public.questions q
  cross join lateral (
    select public.question_hidden_fields(q.explanations_review, q.comment_review) as campos
  ) h
  where q.id = p_question_id
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;
revoke execute on function public.ch_raw_practice_correction_view(text, text) from public, anon, authenticated;

-- O que o Tutor recebe da questão: igual ao da …9620, com os mesmos campos escondidos.
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
  where q.id = p_question_id
$$;
revoke execute on function public.ch_raw_tutor_truth(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- lista da equipe (corpo da …7700)
-- Mais: cada item diz se o comentário está em revisão, e o filtro "comment_review" mostra só essas.
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
      where (v_search is null
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
                from public.exams e),
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

-- ---------------------------------------------------------------- questão para o editor (corpo da …7700)
-- Mais: quem pode decidir sobre o comentário em revisão, quem mexeu no texto e a última decisão do revisor.
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
  from public.questions q where q.id = p_id;
  if v is null then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------- a fila do revisor
-- Equipe: todas as questões com comentário em revisão (can_review diz se quem chama pode decidir). Revisor médico sem papel de
-- equipe: só as das áreas dele. Mais antigas primeiro.
create or replace function public.app_admin_comment_review_queue(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_search constant text := nullif(btrim(coalesce(f ->> 'search', '')), '');
begin
  perform public.question_comment_assert_access();
  return (
    with mine as (
      select q.* from public.questions q
      where q.comment_review is not null
        and (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area)))
        and (nullif(f ->> 'area', '') is null or q.area::text = f ->> 'area')
        and (v_search is null or q.code ilike '%' || v_search || '%'
             or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, '')) like '%' || public.fold_text(v_search) || '%')
    )
    select jsonb_build_object(
      'total', (select count(*)::int from mine),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'area', m.area, 'area_label', public.area_label(m.area), 'topic', m.topic, 'status', m.status,
          'excerpt', left(m.statement, 160), 'campos', m.comment_review -> 'campos', 'since', m.comment_review -> 'desde',
          'ia', coalesce((m.comment_review ->> 'ia')::boolean, false), 'returned', m.comment_review ? 'devolvido',
          'can_review', public.question_can_review_comment(m.area))
          order by m.comment_review ->> 'desde', m.id)
        from (select * from mine order by comment_review ->> 'desde', id
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;
revoke execute on function public.app_admin_comment_review_queue(jsonb, integer, integer) from public, anon;

-- O conteúdo da questão para o revisor conferir (e para a equipe ver): enunciado, figuras ({path, alt} ou {url, alt}: a tela pede o
-- endereço ao servidor, como a do aluno), alternativas com as explicações, gabarito, conduta e "o que avalia", a marca e a
-- última decisão.
create or replace function public.app_admin_comment_review(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  q public.questions;
begin
  perform public.question_comment_assert_access();
  select * into q from public.questions x where x.id = p_question_id;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area))) then
    raise exception 'Acesso restrito à equipe e aos revisores médicos.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', q.id, 'code', q.code, 'area', q.area, 'area_label', public.area_label(q.area), 'topic', q.topic, 'subtopic', q.subtopic,
    'exam', (select e.title from public.exams e where e.id = q.exam_id), 'number', q.number, 'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text', 'explanation', coalesce(o ->> 'explanation', '')) order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'images', coalesce(q.images, '[]'::jsonb),
    'correct_option', q.correct_option, 'status', q.status, 'expected_conduct', coalesce(q.expected_conduct, ''), 'inep_intent', coalesce(q.inep_intent, ''),
    'comment_review', q.comment_review,
    'comment_review_by', public.question_person_name(nullif(q.comment_review ->> 'por', '')::uuid),
    'can_review', public.question_can_review_comment(q.area),
    'comment_decision', (select jsonb_build_object('decision', r.decision, 'note', r.note, 'at', r.decided_at, 'by', public.question_person_name(r.decided_by))
                         from public.question_comment_reviews r where r.question_id = q.id order by r.decided_at desc, r.id desc limit 1));
end
$$;
revoke execute on function public.app_admin_comment_review(text) from public, anon;

-- ---------------------------------------------------------------- a decisão do revisor
-- p_decision: 'approve' (o comentário vai ao aluno) ou 'return' (continua escondido, com a nota para quem escreveu).
-- p_seen_texts: os textos em revisão como a tela os mostrou ({campo: texto}); aprovar só vale se nenhum mudou desde a leitura.
create or replace function public.app_admin_question_comment_decide(p_question_id text, p_decision text, p_note text, p_seen_texts jsonb default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  q public.questions;
  v_note constant text := btrim(coalesce(p_note, ''));
  v_now jsonb;
  v_campos text[];
begin
  perform public.question_comment_assert_access();
  if p_decision is null or p_decision not in ('approve', 'return') then
    raise exception 'A decisão deve ser aprovar ou devolver.' using errcode = '22023';
  end if;
  select * into q from public.questions x where x.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if not public.question_can_review_comment(q.area) then
    raise exception 'A decisão sobre o comentário desta questão é de um revisor médico cadastrado em % ou de um administrador.', public.area_label(q.area) using errcode = '42501';
  end if;
  if q.comment_review is null then
    raise exception 'Esta questão não tem comentário em revisão.' using errcode = '22023';
  end if;
  if char_length(v_note) < 10 then
    raise exception '%', case p_decision when 'approve' then 'Registre o que foi conferido no comentário (pelo menos 10 caracteres).'
                                         else 'Escreva o motivo da devolução (pelo menos 10 caracteres).' end using errcode = '22023';
  end if;
  v_campos := array(select jsonb_array_elements_text(q.comment_review -> 'campos') order by 1);

  if p_decision = 'approve' then
    if jsonb_typeof(p_seen_texts) is distinct from 'object' then
      raise exception 'Envie os textos que você revisou.' using errcode = '22023';
    end if;
    v_now := public.question_comment_fields(q.options, q.expected_conduct, q.inep_intent);
    if exists (select 1 from unnest(v_campos) c where (v_now ->> c) is distinct from btrim(coalesce(p_seen_texts ->> c, ''))) then
      raise exception 'O comentário mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo.' using errcode = '22023';
    end if;
    update public.questions set comment_review = null where id = q.id;
    insert into public.question_comment_reviews (question_id, decision, decided_by, note, campos) values (q.id, 'approve', (select auth.uid()), v_note, v_campos);
    perform public.admin_log('question.comment_approved', q.id, jsonb_build_object('code', q.code, 'campos', to_jsonb(v_campos), 'note', v_note));
  else
    update public.questions set comment_review = comment_review || jsonb_build_object('devolvido', jsonb_build_object('por', (select auth.uid()), 'em', now(), 'nota', v_note))
    where id = q.id;
    insert into public.question_comment_reviews (question_id, decision, decided_by, note, campos) values (q.id, 'return', (select auth.uid()), v_note, v_campos);
    perform public.admin_log('question.comment_returned', q.id, jsonb_build_object('code', q.code, 'campos', to_jsonb(v_campos), 'note', v_note));
  end if;
  return public.app_admin_comment_review(q.id);
end
$$;
revoke execute on function public.app_admin_question_comment_decide(text, text, text, jsonb) from public, anon;

-- ---------------------------------------------------------------- conferência
-- Diz o que falta para a revisão de comentários valer: as duas funções que o aluno lê precisam esconder o comentário em revisão
-- e o gatilho precisa existir. Dá "faltando" se a …9620 foi colada de novo depois desta, ou se esta ficou pela metade.
create or replace function public.question_comment_review_missing() returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_name text;
  v_oid regprocedure;
begin
  foreach v_name in array array['ch_raw_practice_correction_view(text, text)', 'ch_raw_tutor_truth(text, text)'] loop
    v_oid := to_regprocedure('public.' || v_name);
    if v_oid is null or position('question_hidden_fields' in pg_get_functiondef(v_oid)) = 0 then v_missing := v_missing || v_name; end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'questions_comment_review_mark' and tgrelid = 'public.questions'::regclass and not tgisinternal) then
    v_missing := v_missing || 'gatilho questions_comment_review_mark'::text;
  end if;
  return v_missing;
end
$$;
revoke execute on function public.question_comment_review_missing() from public, anon, authenticated;

-- Administrador: o que falta, em detalhe.
create or replace function public.app_question_comment_check() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_missing text[];
begin
  perform public.assert_admin();
  v_missing := public.question_comment_review_missing();
  return jsonb_build_object('ok', cardinality(v_missing) = 0, 'faltando', to_jsonb(v_missing));
end
$$;
revoke execute on function public.app_question_comment_check() from public, anon;
