-- =============================================================================
-- Fontes complementares (APOIO-1): as apostilas "Sangue nos Olhos" (e material do mesmo tipo) entram na biblioteca de fontes
-- como FONTE COMPLEMENTAR. Valem como fonte para a IA e para a equipe (busca, evidência, conferência), mas NADA que as
-- identifique chega ao aluno: título, órgão, link, arquivo, trecho, página, contagem.
--
-- Duas classes na biblioteca (ch_sources.audience):
--   oficial        fonte confiável (provas e gabaritos da banca Inep Revalida/Enamed, PCDT, órgãos oficiais, diretrizes). Funciona como hoje:
--                  pode ser mostrada ao aluno e só ela dá os selos do aluno.
--   complementar   fonte complementar (apostilas). A equipe vê; o aluno não vê nada. Nunca dá selo: por regra do banco ela só pode ter
--                  nível de autoridade E (ou nenhum), e todas as travas "oficial" do sistema exigem nível A a D.
-- Decisões:
--   * Fonte nova de nível E nasce complementar. As fontes que já existem continuam oficiais; nada é marcado sozinho.
--   * Só administrador muda a classe (app_ch_set_source_audience), com registro em ch_audit e no Registro da Administração.
--     Passar para complementar leva o nível de autoridade para E (o nível anterior fica no registro).
--   * Toda saída ao aluno que carrega fonte passa por ch_student_sources / ch_student_text (equipe e revisor continuam vendo tudo):
--     correção, comentário da questão, cartão de atualização, linha do tempo, Tutor, podcast, aula e Atualizações & Diretrizes.
--   * O que a equipe digita em campos de fonte (fontes de podcast, material de aula, diretriz da aula, documento da atualização) é
--     comparado com a biblioteca (título, órgão, link) e com o nome "Sangue nos Olhos"; quem bate some da resposta ao aluno.
--
-- As funções redefinidas partem das versões mais novas de todas as migrações e dos ramos entregues:
--   app_question_commentary, practice_correction_view, tutor_truth: 20261003007700 · app_question_timeline: 20261003002600
--   app_podcast: 20261003009591 · lesson_view: 20261003004000 · guideline_update_view: 20261003004100
--   app_ch_set_source_authority: 20261003002100.
-- Pode ser colada duas vezes sem erro e não apaga nenhum dado.
-- =============================================================================

-- ---------------------------------------------------------------- 1. classe da fonte
alter table public.ch_sources add column if not exists audience text not null default 'oficial';
alter table public.ch_sources drop constraint if exists ch_sources_audience_check;
alter table public.ch_sources add constraint ch_sources_audience_check check (audience in ('oficial', 'complementar'));
-- complementar nunca tem nível A a D: assim nenhuma trava "fonte oficial" (selos, atualidade, evidência para publicar) a aceita
alter table public.ch_sources drop constraint if exists ch_sources_complementar_nivel;
alter table public.ch_sources add constraint ch_sources_complementar_nivel check (audience = 'oficial' or authority_level is null or authority_level = 'E');

create or replace function public.ch_sources_audience_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- fonte nova de nível E (livro, apostila, curso) nasce complementar
    if new.authority_level = 'E' and new.audience = 'oficial' then new.audience := 'complementar'; end if;
  else
    if new.authority_level = 'E' and old.authority_level is distinct from 'E' and new.audience = 'oficial' and old.audience = 'oficial' then
      new.audience := 'complementar';
    end if;
  end if;
  if new.audience = 'complementar' and new.authority_level in ('A', 'B', 'C', 'D') then
    if tg_op = 'UPDATE' and old.audience = 'oficial' then
      new.authority_level := 'E';   -- passou a complementar: o nível vai para E
    else
      raise exception 'Fonte complementar só pode ter nível E. Para dar nível A a D, a fonte precisa ser oficial.' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists ch_sources_audience_guard on public.ch_sources;
create trigger ch_sources_audience_guard before insert or update of audience, authority_level on public.ch_sources
  for each row execute function public.ch_sources_audience_guard();

-- ---------------------------------------------------------------- 2. comparação com a biblioteca (internas)
-- Texto sem acento, sem pontuação e sem caixa, com espaço simples.
create or replace function public.ch_text_key(p_text text) returns text
  language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(public.fold_text(p_text), '[^a-z0-9]+', ' ', 'g')) $$;

-- O texto (ou o link) identifica uma fonte complementar? Sim quando contém o título ou o órgão de uma fonte complementar da
-- biblioteca, quando o texto inteiro é parte do título (ex.: só "Sangue nos Olhos"), quando o link é o mesmo, ou quando cita
-- "Sangue nos Olhos" (regra do dono, vale mesmo antes de a apostila ser cadastrada).
create or replace function public.ch_complementar_hit(p_text text, p_url text default null) returns boolean
  language sql stable security definer set search_path = ''
as $$
  with k as (select public.ch_text_key(p_text) as t)
  select coalesce((select k.t like '%sangue nos olhos%' from k), false)
      or exists (
        select 1 from public.ch_sources s, k
        where s.audience = 'complementar'
          and ((k.t <> '' and char_length(public.ch_text_key(s.title)) >= 5 and k.t like '%' || public.ch_text_key(s.title) || '%')
            or (k.t <> '' and char_length(public.ch_text_key(s.organ)) >= 5 and k.t like '%' || public.ch_text_key(s.organ) || '%')
            or (char_length(k.t) >= 8 and public.ch_text_key(s.title) like '%' || k.t || '%')
            or (nullif(btrim(coalesce(p_url, '')), '') is not null and s.url is not null and public.ch_url_norm(p_url) = public.ch_url_norm(s.url)))
      )
$$;

-- Um item de lista de fontes (objeto com title, organ, url... ou texto) identifica fonte complementar?
create or replace function public.ch_source_item_hit(p_item jsonb) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select case
    when p_item is null or jsonb_typeof(p_item) = 'null' then false
    when jsonb_typeof(p_item) = 'string' then public.ch_complementar_hit(p_item #>> '{}', p_item #>> '{}')
    when jsonb_typeof(p_item) = 'object' then
      (p_item ? 'source_id' and exists (select 1 from public.ch_sources s where s.audience = 'complementar' and s.id::text = p_item ->> 'source_id'))
      or exists (select 1 from jsonb_each_text(p_item) e where public.ch_complementar_hit(e.value, e.value))
    else false end
$$;

-- Lista de fontes que o ALUNO pode ver: tira as que identificam fonte complementar. Equipe e revisor veem tudo.
create or replace function public.ch_student_sources(p_sources jsonb) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case
    when p_sources is null or jsonb_typeof(p_sources) <> 'array' then coalesce(p_sources, '[]'::jsonb)
    when public.is_staff() or public.ch_is_reviewer() then p_sources
    else coalesce((select jsonb_agg(x.item order by x.ord) from jsonb_array_elements(p_sources) with ordinality as x (item, ord)
                   where not public.ch_source_item_hit(x.item)), '[]'::jsonb) end
$$;

-- Texto de fonte para o aluno: nulo quando identifica fonte complementar.
create or replace function public.ch_student_text(p_text text, p_url text default null) returns text
  language sql stable security definer set search_path = ''
as $$
  select case when p_text is null then null
              when public.is_staff() or public.ch_is_reviewer() then p_text
              when public.ch_complementar_hit(p_text, p_url) then null
              else p_text end
$$;

-- Termos que nenhum texto voltado ao aluno pode citar (o servidor confere a saída da IA contra esta lista).
create or replace function public.ch_worker_complementar_terms() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct t.term), '[]'::jsonb)
  from (select btrim(s.title) as term from public.ch_sources s where s.audience = 'complementar'
        union select btrim(s.organ) from public.ch_sources s where s.audience = 'complementar'
        union select 'Sangue nos Olhos') t
  where char_length(t.term) >= 5
$$;

-- ---------------------------------------------------------------- 3. campos de fonte digitados pela equipe: marca guardada
alter table public.lessons add column if not exists guideline_hidden boolean not null default false;
alter table public.lesson_materials add column if not exists hidden_from_student boolean not null default false;
alter table public.guideline_updates add column if not exists source_hidden boolean not null default false;
alter table public.podcast_sources add column if not exists complementar boolean not null default false;

create or replace function public.ch_lessons_hidden_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.guideline_hidden := public.ch_complementar_hit(new.guideline_title, new.guideline_url);
  return new;
end
$$;
drop trigger if exists lessons_hidden_flag on public.lessons;
create trigger lessons_hidden_flag before insert or update of guideline_title, guideline_url on public.lessons
  for each row execute function public.ch_lessons_hidden_flag();

create or replace function public.ch_lesson_materials_hidden_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.hidden_from_student := public.ch_complementar_hit(new.title, new.url);
  return new;
end
$$;
drop trigger if exists lesson_materials_hidden_flag on public.lesson_materials;
create trigger lesson_materials_hidden_flag before insert or update of title, url on public.lesson_materials
  for each row execute function public.ch_lesson_materials_hidden_flag();

create or replace function public.ch_guideline_updates_hidden_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.source_hidden := public.ch_complementar_hit(coalesce(new.institution, '') || ' ' || coalesce(new.document_title, ''), new.source_url);
  return new;
end
$$;
drop trigger if exists guideline_updates_hidden_flag on public.guideline_updates;
create trigger guideline_updates_hidden_flag before insert or update of institution, document_title, source_url on public.guideline_updates
  for each row execute function public.ch_guideline_updates_hidden_flag();

-- Recalcula as marcas (depois de mudar a classe de uma fonte). Só mexe nas linhas em que a marca muda.
create or replace function public.ch_refresh_hidden_flags() returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.lessons set guideline_hidden = public.ch_complementar_hit(guideline_title, guideline_url)
   where guideline_hidden is distinct from public.ch_complementar_hit(guideline_title, guideline_url);
  update public.lesson_materials set hidden_from_student = public.ch_complementar_hit(title, url)
   where hidden_from_student is distinct from public.ch_complementar_hit(title, url);
  update public.guideline_updates set source_hidden = public.ch_complementar_hit(coalesce(institution, '') || ' ' || coalesce(document_title, ''), source_url)
   where source_hidden is distinct from public.ch_complementar_hit(coalesce(institution, '') || ' ' || coalesce(document_title, ''), source_url);
end
$$;
-- (a marca é recalculada com o gatilho acima; o UPDATE desta função só roda quando a marca muda)

-- Material de aula marcado como complementar: o aluno não lê o título nem o endereço, nem pela tabela.
drop policy if exists "materiais: da aula visível" on public.lesson_materials;
create policy "materiais: da aula visível" on public.lesson_materials
  for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_id and (l.published or public.is_staff()))
                                     and (not hidden_from_student or public.is_staff()));

-- ---------------------------------------------------------------- 4. administrador: classe da fonte
create or replace function public.app_ch_set_source_audience(p_source_id uuid, p_audience text, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.ch_sources;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  if p_audience is null or p_audience not in ('oficial', 'complementar') then
    raise exception 'Classe inválida: escolha oficial ou complementar.' using errcode = '22023';
  end if;
  select * into s from public.ch_sources where id = p_source_id for update;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if s.audience <> p_audience then
    update public.ch_sources set audience = p_audience where id = p_source_id returning * into s;
    perform public.ch_refresh_hidden_flags();
    perform public.ch_log('source.audience', p_source_id::text,
      jsonb_build_object('title', s.title, 'to', p_audience, 'from', case p_audience when 'oficial' then 'complementar' else 'oficial' end, 'reason', v_reason));
    perform public.admin_log('source.audience', p_source_id::text,
      jsonb_build_object('title', s.title, 'to', p_audience, 'reason', v_reason));
  end if;
  return jsonb_build_object('id', s.id, 'audience', s.audience, 'authority_level', s.authority_level);
end
$$;

-- Classe de cada fonte (a lista de fontes da equipe junta isto com app_ch_sources).
create or replace function public.app_ch_source_audiences() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_object_agg(s.id::text, s.audience) from public.ch_sources s), '{}'::jsonb);
end
$$;

-- Nível de autoridade: fonte complementar só aceita E.
create or replace function public.app_ch_set_source_authority(p_source_id uuid, p_level text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_level not in ('A', 'B', 'C', 'D', 'E') then raise exception 'Nível de autoridade inválido (A a E).' using errcode = '22023'; end if;
  if p_level in ('A', 'B', 'C', 'D') and exists (select 1 from public.ch_sources where id = p_source_id and audience = 'complementar') then
    raise exception 'Fonte complementar só pode ter nível E. Para dar nível A a D, passe a fonte para oficial antes.' using errcode = '22023';
  end if;
  update public.ch_sources set authority_level = p_level where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('source.authority', p_source_id::text, jsonb_build_object('level', p_level));
  return true;
end
$$;

-- ---------------------------------------------------------------- 5. saídas ao aluno
-- Comentário da questão (corpo da 20261003007700): fontes e fontes do cartão de atualização passam por ch_student_sources; só fonte oficial.
create or replace function public.app_question_commentary(p_question_id text, p_level text default 'full') returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'question_id', a.question_id, 'version', a.version, 'reviewed_at', a.reviewed_at, 'analysis_date', a.analysis_date,
    'question_core', a.question_core, 'key_data', a.key_data, 'trap', a.trap, 'golden_rule', a.golden_rule,
    'official_answer', (select o.answer from public.question_official_answers o where o.question_id = a.question_id and o.is_current),
    'official_status', (select o.answer_status from public.question_official_answers o where o.question_id = a.question_id and o.is_current),
    'temporal_status', a.temporal_status, 'current_best_answer', a.current_best_answer,
    'options', (select jsonb_agg(jsonb_build_object('option_id', x.option_id, 'is_official_correct', x.is_official_correct, 'distractor_kind', x.distractor_kind, 'reasoning', x.reasoning,
                  'why_plausible', x.why_plausible, 'why_wrong', x.why_wrong, 'when_correct', x.when_correct, 'concept_difference', x.concept_difference, 'trap', x.trap) order by x.option_id)
                from public.question_option_analysis x where x.analysis_id = a.id),
    'comment', (select c.content from public.question_comments c where c.analysis_id = a.id and c.level = p_level and c.status = 'published'),
    'sources', public.ch_student_sources(coalesce((select jsonb_agg(distinct jsonb_build_object('title', s.title, 'organ', s.organ, 'version', e.source_version, 'page', e.page, 'published_on', s.published_on, 'url', s.url))
                         from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                         join public.ch_sources s on s.id = e.source_id and s.audience = 'oficial' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'
                         where qc.question_id = a.question_id), '[]'::jsonb)),
    'sources_checked_at', (select max(e.created_at) from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                           join public.ch_sources s on s.id = e.source_id and s.audience = 'oficial' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current' where qc.question_id = a.question_id),
    -- selo: atualidade conferida por revisor E fontes oficiais monitoradas, com a conferência em dia (frescor >= 80)
    'seal', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and a.last_source_check_at is not null and (public.question_freshness(a.question_id) ->> 'score')::int >= 80 then 'UPDATED' end,
    'seal_checked_at', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and (public.question_freshness(a.question_id) ->> 'score')::int >= 80 then a.last_source_check_at end,
    'freshness', public.question_freshness(a.question_id),
    -- nova atualização em revisão: a conduta mostrada segue a última versão revisada
    'update_in_review', exists (select 1 from public.question_updates u where u.question_id = a.question_id and u.status in ('queued', 'analyzing', 'review_required')),
    'update_card', (select jsonb_build_object('version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level, 'official_answer', k.official_answer, 'official_status', k.official_status,
                      'official_source', public.ch_student_text(k.official_source), 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'why_it_matters', k.why_it_matters, 'options_affected', k.options_affected,
                      'sources', public.ch_student_sources(k.sources), 'effective_date', k.effective_date, 'verified_at', k.verified_at)
                    from public.question_update_cards k where k.question_id = a.question_id and k.status = 'published'
                      and public.question_analysis_fits(k.question_id, k.official_answer)))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and public.question_viewable(a.question_id)
    and public.question_analysis_fits(a.question_id, a.official_answer_at_analysis)
$$;

-- Correção para o aluno (corpo da 20261003007700): o gabarito/fonte da questão passa por ch_student_sources.
create or replace function public.practice_correction_view(p_question_id text, p_selected text) returns jsonb
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
    'inep_intent', q.inep_intent,
    'sources', public.ch_student_sources(q.sources)
  )
  from public.questions q
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb))), '{}'::text[]) as campos
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

-- O que o Tutor recebe da questão (corpo da 20261003007700).
create or replace function public.tutor_truth(p_question_id text, p_level text) returns jsonb
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
    'inep_intent', case when p_level in ('hint', 'full') then q.inep_intent end,
    'sources', case when p_level = 'full' and jsonb_array_length(q.sources) > 0 then public.ch_student_sources(q.sources) end,
    'analysis', case when p_level = 'full' then (select jsonb_build_object('question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
                     'options', (select jsonb_agg(jsonb_build_object('option_id', o.option_id, 'reasoning', o.reasoning, 'why_wrong', o.why_wrong, 'trap', o.trap) order by o.option_id) from public.question_option_analysis o where o.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published'
                     and public.question_analysis_fits(q.id, a.official_answer_at_analysis)) end,
    'update_card', case when p_level = 'full' then (select jsonb_build_object('official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'sources', public.ch_student_sources(k.sources))
                   from public.question_update_cards k where k.question_id = q.id and k.status = 'published'
                     and public.question_analysis_fits(q.id, k.official_answer)) end)
  from public.questions q
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb))), '{}'::text[]) as campos
  ) h
  where q.id = p_question_id
$$;
revoke execute on function public.tutor_truth(text, text) from public, anon, authenticated;

-- Linha do tempo da questão (corpo da 20261003002600): a fonte do gabarito oficial passa por ch_student_text.
create or replace function public.app_question_timeline(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_staff boolean := public.is_staff() or public.ch_is_reviewer();
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.question_viewable(p_question_id) then return '[]'::jsonb; end if;
  if not exists (select 1 from public.question_analysis where question_id = p_question_id and status = 'published') and not v_staff then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(e.ev order by e.at, e.ord) from (
    select o.recorded_at as at, 1 as ord, jsonb_build_object('type', 'OFFICIAL_ANSWER', 'at', o.recorded_at, 'version', o.version, 'answer', o.answer, 'status', o.answer_status, 'source', public.ch_student_text(o.source), 'published_at', o.published_at) as ev
      from public.question_official_answers o where o.question_id = p_question_id
    union all
    select a.reviewed_at, 2, jsonb_build_object('type', 'ANALYSIS_PUBLISHED', 'at', a.reviewed_at, 'version', a.version)
      from public.question_analysis a where a.question_id = p_question_id and a.status = 'published' and a.reviewed_at is not null
    union all
    select k.verified_at, 3, jsonb_build_object('type', 'UPDATE_CARD', 'at', k.verified_at, 'version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level,
             'official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'superseded', k.status = 'superseded')
      from public.question_update_cards k where k.question_id = p_question_id
    union all
    select u.detected_at, 4, jsonb_build_object('type', 'SOURCE_CHANGE_DETECTED', 'at', u.detected_at, 'impact_level', u.impact_level, 'status', u.status, 'critical', u.critical, 'triage_kind', u.triage_kind, 'reason', u.reason)
      from public.question_updates u where v_staff and u.question_id = p_question_id
    union all
    select l.changed_at, 5, jsonb_build_object('type', 'QUESTION_EDITED', 'at', l.changed_at, 'reason', l.reason, 'fields', (select jsonb_agg(k) from jsonb_object_keys(l.changes) k))
      from public.question_change_log l where v_staff and l.question_id = p_question_id) e), '[]'::jsonb);
end
$$;

-- Podcast publicado (corpo da 20261003009591): fonte marcada como complementar, ou que bate com a biblioteca, não aparece (nem as páginas dela).
create or replace function public.app_podcast(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'seconds', p.audio_seconds, 'published_at', p.published_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', l ->> 'text') order by o) from jsonb_array_elements(p.script -> 'lines') with ordinality as x (l, o)), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'title', case when s.kind in ('pdf', 'docx') and s.title ~* '\.(pdf|docx?)\s*$' then 'Documento ' || s.n::text else s.title end,
                         'kind', s.kind, 'url', s.url, 'pages',
                         (select jsonb_agg(distinct c.page order by c.page) from public.podcast_chunks c
                          where c.source_id = s.id and c.page is not null
                            and c.id in (select (jsonb_array_elements_text(l -> 'sources'))::bigint from jsonb_array_elements(p.script -> 'lines') l)))
                       order by s.n)
      from (select x.*, row_number() over (order by x.position, x.created_at) as n from public.podcast_sources x where x.podcast_id = p.id
               and (public.is_staff() or public.ch_is_reviewer() or not (x.complementar or public.ch_complementar_hit(x.title, x.url)))) s), '[]'::jsonb),
    'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id and l.published))
  from public.podcasts p
  where p.id = p_id and p.status = 'published' and (select auth.uid()) is not null
$$;

-- Aula (corpo da 20261003004000): material e diretriz marcados como complementares não saem ao aluno.
create or replace function public.lesson_view(l public.lessons) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'area', l.area, 'area_label', public.area_label(l.area), 'topic', l.topic, 'title', l.title,
    'duration_minutes', l.duration_minutes, 'instructor', l.instructor, 'specialty', l.specialty, 'video_url', l.video_url,
    'summary', l.summary, 'key_points', to_jsonb(l.key_points), 'guideline_title', case when l.guideline_hidden and not public.is_staff() then null else l.guideline_title end,
    'guideline_url', case when l.guideline_hidden and not public.is_staff() then null else l.guideline_url end,
    'published', l.published, 'position', l.position, 'updated_at', l.updated_at,
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'has_file', m.storage_path is not null,
                                                               'content_type', m.content_type, 'size_bytes', m.size_bytes, 'url', m.url) order by m.position, m.created_at)
                           from public.lesson_materials m where m.lesson_id = l.id and (not m.hidden_from_student or public.is_staff())), '[]'::jsonb),
    'progress', (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at, 'last_at', p.last_at)
                 from public.lesson_progress p where p.lesson_id = l.id and p.user_id = (select auth.uid())))
$$;

-- Atualização/diretriz (corpo da 20261003004100): instituição, título e link do documento somem quando identificam fonte complementar.
create or replace function public.guideline_update_view(u public.guideline_updates, p_full boolean) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'slug', u.slug, 'area', u.area, 'area_label', public.area_label(u.area), 'topic', u.topic, 'subtopic', u.subtopic,
    'years', to_jsonb(u.years), 'priority', u.priority, 'publication_label', u.publication_label, 'institution', case when u.source_hidden and not public.is_staff() then null else u.institution end,
    'document_title', case when u.source_hidden and not public.is_staff() then null else u.document_title end,
    'source_url', case when u.source_hidden and not public.is_staff() then null else u.source_url end, 'before_text', u.before_text, 'current_conduct', u.current_conduct,
    'reviewed', u.review_status = 'approved', 'reviewed_at', case when u.review_status = 'approved' then u.reviewed_at end,
    'published', u.published, 'updated_at', u.updated_at)
  || case when p_full then jsonb_build_object(
    'timeline', u.timeline, 'clinical_impact', u.clinical_impact, 'exam_impact', u.exam_impact,
    'trap', u.trap, 'flashcards', u.flashcards, 'practice_questions', u.practice_questions, 'search_terms', u.search_terms) else '{}'::jsonb end
$$;

-- Marca guardada das linhas que já existem (só onde bate com a biblioteca ou com "Sangue nos Olhos").
select public.ch_refresh_hidden_flags();

-- Fonte de podcast: a equipe marca que é complementar (o aluno deixa de ver a fonte e as páginas dela).
create or replace function public.app_admin_podcast_source_complementar(p_source_id uuid, p_complementar boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_podcast uuid;
begin
  perform public.assert_staff();
  update public.podcast_sources set complementar = coalesce(p_complementar, false) where id = p_source_id returning podcast_id into v_podcast;
  if v_podcast is null then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('podcast.source_complementar', v_podcast::text, jsonb_build_object('source', p_source_id, 'complementar', coalesce(p_complementar, false)));
  return public.podcast_admin_view(v_podcast);
end
$$;

-- ---------------------------------------------------------------- 99. permissões
do $perm$
begin
  -- internas: só o banco chama
  revoke execute on function public.ch_sources_audience_guard() from public, anon, authenticated;
  revoke execute on function public.ch_text_key(text) from public, anon, authenticated;
  revoke execute on function public.ch_complementar_hit(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_source_item_hit(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_student_sources(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_student_text(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_complementar_terms() from public, anon, authenticated;
  revoke execute on function public.ch_lessons_hidden_flag() from public, anon, authenticated;
  revoke execute on function public.ch_lesson_materials_hidden_flag() from public, anon, authenticated;
  revoke execute on function public.ch_guideline_updates_hidden_flag() from public, anon, authenticated;
  revoke execute on function public.ch_refresh_hidden_flags() from public, anon, authenticated;
  -- telas
  revoke execute on function public.app_ch_set_source_audience(uuid, text, text) from public, anon;
  revoke execute on function public.app_ch_source_audiences() from public, anon;
  revoke execute on function public.app_admin_podcast_source_complementar(uuid, boolean) from public, anon;
  revoke execute on function public.app_ch_set_source_authority(uuid, text) from public, anon;
  revoke execute on function public.app_question_commentary(text, text) from public, anon;
  revoke execute on function public.practice_correction_view(text, text) from public, anon;
  revoke execute on function public.tutor_truth(text, text) from public, anon, authenticated;
  revoke execute on function public.app_question_timeline(text) from public, anon;
  revoke execute on function public.app_podcast(uuid) from public, anon;
end
$perm$;
