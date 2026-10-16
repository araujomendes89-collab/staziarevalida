-- =============================================================================
-- Editor profissional, expansão: QUESTÕES (oficiais + inéditas) com formatação. Decisão do dono (16/10): mudança SÓ de formatação
-- não derruba aprovação nem conferência. Padrão da 013110: o texto oficial continua nas colunas de sempre (buscas, travas
-- automáticas, conferências, histórico e telas antigas leem o texto); a formatação fica numa coluna nova "formatacao"
-- (chave do campo → envelope sdoc v1) e só vale quando a projeção dela é igual ao texto (a tela confere de novo: ricoValido).
--   Chaves oficiais (questions):     statement, opcao.X.texto, opcao.X.explicacao, expected_conduct, inep_intent
--   Chaves inéditas (draft_questions): stem, alt.X, altexp.X, explanation, clinical_decision, update_application
-- O que muda:
--   * oficiais: admin_upsert_question grava a formatação (sem a chave no pedido = mantém; null = apaga). Ela fica fora de
--     statement/options, então os gatilhos que comparam texto (revisão do comentário, análise que sai do ar, trilha) não disparam.
--     Gatilho leve registra no question_change_log quem e quando mudou a formatação ({formatacao: {campos: [...]}}).
--     Guarda de fontes complementares também na formatação (como o summary_rico da 013040).
--   * inéditas: draft_content_hash ganha "formatacao_conteudo" SÓ quando a formatação traz conteúdo (o hash de hoje não muda);
--     app_draft_question_save: só formatação mantém status, revisão, conferências (draft_checks) e propostas, grava o evento
--     "formatada" e, se a versão está no ar, leva a formatação ao aluno na hora; equilibrar gabarito troca as letras da formatação;
--     publicar leva a formatação para questions com as chaves mapeadas.
--   * aluno (regra de ouro): antes de responder, practice_question_view e tutor_question_view levam formatação SÓ do enunciado e
--     das alternativas; depois de responder, a correção leva também a das explicações, da conduta e do "o que avalia", respeitando
--     question_hidden_fields e as anuladas. Nada de grant de coluna: a formatação só sai pelas funções.
-- Funções redefinidas (cada corpo parte da definição MAIS NOVA no ramo, conferida em 16/10 contra todas as migrações até 013200):
--   admin_upsert_question ............ 009801   practice_question_view .......... 010300   tutor_question_view ...... 009801
--   ch_raw_practice_correction_view .. 010500   draft_content_hash .............. 009800   app_draft_question_save .. 009800
--   app_draft_balance_answer ......... 009800   staziamed_question_payload ...... 009800   app_staziamed_publish .... 009800
-- O aluno recebe a correção por practice_correction_view (009930) = ch_scrub_json(ch_raw_practice_correction_view) + aviso de
-- gabarito preliminar: não muda. app_get_session (009801) junta practice_question_view e, só depois de responder (no simulado,
-- só depois de terminar), practice_correction_view; app_answer_question (013000) devolve practice_correction_view: não mudam.
-- Depende da 013110 (ch_formatacao_valida, ch_campos_conteudo). Pode ser colada duas vezes.
-- Desfazer: ver /Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013120-desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- 1. colunas (sem grant: o aluno não lê a coluna)
alter table public.questions add column if not exists formatacao jsonb;
alter table public.draft_questions add column if not exists formatacao jsonb;
alter table public.questions drop constraint if exists questions_formatacao_valida;
alter table public.questions add constraint questions_formatacao_valida check (public.ch_formatacao_valida(formatacao));
alter table public.draft_questions drop constraint if exists draft_questions_formatacao_valida;
alter table public.draft_questions add constraint draft_questions_formatacao_valida check (public.ch_formatacao_valida(formatacao));

-- ---------------------------------------------------------------- 2. apoio
-- Os textos da questão oficial nas chaves da formatação.
create or replace function public.question_formatacao_textos(p_statement text, p_options jsonb, p_expected text, p_intent text) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_build_object('statement', p_statement, 'expected_conduct', p_expected, 'inep_intent', p_intent)
      || coalesce((select jsonb_object_agg('opcao.' || (o ->> 'id') || '.texto', o ->> 'text')
                          || jsonb_object_agg('opcao.' || (o ->> 'id') || '.explicacao', o ->> 'explanation')
                     from jsonb_array_elements(case when jsonb_typeof(p_options) = 'array' then p_options else '[]'::jsonb end) o
                    where o ? 'id'), '{}'::jsonb)
$$;

-- Os textos do rascunho nas chaves da formatação.
create or replace function public.draft_formatacao_textos(d public.draft_questions) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_build_object('stem', d.stem, 'explanation', d.explanation, 'clinical_decision', d.clinical_decision, 'update_application', d.update_application)
      || (select jsonb_object_agg('alt.' || l.l, d.alternatives ->> l.l) || jsonb_object_agg('altexp.' || l.l, d.alternative_explanations ->> l.l)
            from (values ('A'), ('B'), ('C'), ('D')) as l (l))
$$;

-- Só as entradas das chaves pedidas; NULL quando não sobra nenhuma.
create or replace function public.question_formatacao_filtro(p_formatacao jsonb, p_chaves text[]) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(p_formatacao) is distinct from 'object' then null
              else (select jsonb_object_agg(e.key, e.value) from jsonb_each(p_formatacao) e where e.key = any (p_chaves)) end
$$;

-- {"formatacao": ...} para juntar ao que o aluno recebe, ou {} (a chave nem aparece quando não há formatação).
create or replace function public.question_formatacao_chave(p_formatacao jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when p_formatacao is null or p_formatacao = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('formatacao', p_formatacao) end
$$;

-- Formatação do rascunho nas chaves da questão publicada (o mesmo mapa do staziamed_question_payload): stem → statement,
-- alt.X → opcao.X.texto, explicação da X (a da correta vem de "explanation" quando há) → opcao.X.explicacao,
-- clinical_decision → expected_conduct. A aplicação da atualização não é publicada.
create or replace function public.staziamed_formatacao_oficial(d public.draft_questions) returns jsonb
  language sql immutable set search_path = ''
as $$
  select nullif(jsonb_strip_nulls(
           jsonb_build_object('statement', d.formatacao -> 'stem', 'expected_conduct', d.formatacao -> 'clinical_decision')
           || (select jsonb_object_agg('opcao.' || l.l || '.texto', d.formatacao -> ('alt.' || l.l))
                      || jsonb_object_agg('opcao.' || l.l || '.explicacao',
                           case when l.l = d.correct_answer::text and d.explanation is not null then d.formatacao -> 'explanation'
                                else d.formatacao -> ('altexp.' || l.l) end)
                 from (values ('A'), ('B'), ('C'), ('D')) as l (l))), '{}'::jsonb)
  where jsonb_typeof(d.formatacao) = 'object'
$$;

-- Equilibrar o gabarito troca duas letras: as entradas alt.X/altexp.X da formatação vão junto.
create or replace function public.draft_formatacao_troca_letras(p_formatacao jsonb, p_a text, p_b text) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(p_formatacao) is distinct from 'object' then p_formatacao
    else nullif(coalesce((select jsonb_object_agg(
           case e.key when 'alt.' || p_a then 'alt.' || p_b when 'alt.' || p_b then 'alt.' || p_a
                      when 'altexp.' || p_a then 'altexp.' || p_b when 'altexp.' || p_b then 'altexp.' || p_a else e.key end, e.value)
           from jsonb_each(p_formatacao) e), '{}'::jsonb), '{}'::jsonb) end
$$;

revoke execute on function public.question_formatacao_textos(text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.draft_formatacao_textos(public.draft_questions) from public, anon, authenticated;
revoke execute on function public.question_formatacao_filtro(jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.question_formatacao_chave(jsonb) from public, anon, authenticated;
revoke execute on function public.staziamed_formatacao_oficial(public.draft_questions) from public, anon, authenticated;
revoke execute on function public.draft_formatacao_troca_letras(jsonb, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. oficiais: salvar (corpo da …9801 + formatação)
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
  v_form jsonb;   -- 013120: formatação (chave do campo → envelope sdoc); sem a chave no pedido = mantém a gravada
begin
  if q ? 'formatacao' and (jsonb_typeof(q -> 'formatacao') not in ('object', 'null')
                           or not public.ch_formatacao_valida(nullif(q -> 'formatacao', 'null'::jsonb))) then
    raise exception 'Formatação inválida.' using errcode = '22023';
  end if;
  v_form := case when q ? 'formatacao' then nullif(nullif(q -> 'formatacao', 'null'::jsonb), '{}'::jsonb) end;
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
      sources = coalesce(q -> 'sources', sources),
      formatacao = case when q ? 'formatacao' then v_form else formatacao end
    where id = v_existing;
    return 'updated';
  end if;

  v_id := lower(v_kind) || '_' || v_year || coalesce('_' || v_semester, '') || '_q' || lpad(v_number::text, 3, '0');
  insert into public.questions (id, code, exam_id, number, area, specialty, topic, subtopic, statement, options,
                                correct_option, status, expected_conduct, inep_intent, needs_image, sources, formatacao)
  values (
    v_id,
    (case when v_kind = 'ENAMED' then 'ENAMED' else 'REV' end) || '-' || v_year || coalesce('.' || v_semester, '') || '-Q' || lpad(v_number::text, 3, '0'),
    v_exam, v_number, (q ->> 'area')::public.med_area,
    nullif(btrim(coalesce(q ->> 'specialty', '')), ''),
    btrim(q ->> 'topic'), nullif(btrim(coalesce(q ->> 'subtopic', '')), ''), btrim(q ->> 'statement'), v_options,
    nullif(q ->> 'correct_option', ''), coalesce(nullif(q ->> 'status', ''), 'valid'),
    nullif(btrim(coalesce(q ->> 'expected_conduct', '')), ''), nullif(btrim(coalesce(q ->> 'inep_intent', '')), ''),
    coalesce((q ->> 'needs_image')::boolean, false), coalesce(q -> 'sources', '[]'::jsonb), v_form
  );
  return 'inserted';
end
$$;
revoke execute on function public.admin_upsert_question(jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. oficiais: trilha leve e guarda de complementares
-- Só a formatação mudou (ou junto com o texto): uma linha com as chaves que mudaram, quem e quando. Os envelopes não vão à trilha.
create or replace function public.questions_formatacao_trail() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_campos jsonb;
begin
  select coalesce(jsonb_agg(x.k order by x.k), '[]'::jsonb) into v_campos
    from (select jsonb_object_keys(coalesce(old.formatacao, '{}'::jsonb)) as k union select jsonb_object_keys(coalesce(new.formatacao, '{}'::jsonb))) x
   where (old.formatacao -> x.k) is distinct from (new.formatacao -> x.k);
  insert into public.question_change_log (question_id, changed_by, reason, changes)
  values (new.id, (select auth.uid()), nullif(current_setting('sqie.reason', true), ''),
          jsonb_build_object('formatacao', jsonb_build_object('campos', v_campos, 'de', null, 'para', null)));
  return null;
end
$$;
revoke execute on function public.questions_formatacao_trail() from public, anon, authenticated;
drop trigger if exists questions_formatacao_trail on public.questions;
create trigger questions_formatacao_trail after update of formatacao on public.questions
  for each row when (old.formatacao is distinct from new.formatacao) execute function public.questions_formatacao_trail();

drop trigger if exists questions_guard_complementar_rico on public.questions;
create trigger questions_guard_complementar_rico before insert or update of formatacao on public.questions
  for each row execute function public.ch_guard_complementar_save('formatacao');

-- ---------------------------------------------------------------- 5. aluno
-- antes de responder (corpo da …010300): formatação só do enunciado e das alternativas
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
    'support', q.support,
    'preliminary', public.question_preliminary_info(q.id)
  ) || public.question_formatacao_chave(public.question_formatacao_filtro(q.formatacao, array['statement'] || array(select 'opcao.' || (o ->> 'id') || '.texto' from jsonb_array_elements(q.options) o)))
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
$$;

-- Tutor (corpo da …9801): o mesmo, em qualquer estado (o tutor nunca recebe a formatação das explicações por aqui)
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
    || public.question_formatacao_chave(public.question_formatacao_filtro(q.formatacao, array['statement'] || array(select 'opcao.' || (o ->> 'id') || '.texto' from jsonb_array_elements(q.options) o)))
  from public.questions q where q.id = p_question_id and q.origin = 'official'
$$;
revoke execute on function public.tutor_question_view(text, text) from public, anon, authenticated;

-- depois de responder (corpo da …010500): + explicações que o aluno recebe, conduta e "o que avalia" (fora da revisão)
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
    'annulled_notes', public.question_annulled_study_notes(q.status, q.options, h.campos),
    'expected_conduct', case when 'expected_conduct' = any (h.campos) then null else q.expected_conduct end,
    'inep_intent', case when 'inep_intent' = any (h.campos) then null else q.inep_intent end,
    'update_note', public.question_update_note_visible(q.id),
    -- as fontes das Questões Inéditas ficam na tabela interna: o aluno não as recebe (decisão do dono, 15/10/2026)
    'sources', case when q.origin = 'staziamed' then '[]'::jsonb else public.ch_student_sources(q.sources) end,
    'origin', q.origin,
    'support', q.support,
    'official_sources', null
  ) || public.question_formatacao_chave(public.question_formatacao_filtro(q.formatacao,
         array['statement'] || array(select 'opcao.' || (o ->> 'id') || '.texto' from jsonb_array_elements(q.options) o)
         -- explicações: só as que o aluno recebe (fora da revisão) e nunca em questão anulada (as notas da anulada são outro texto)
         || array(select 'opcao.' || (o ->> 'id') || '.explicacao' from jsonb_array_elements(q.options) o
                   where q.status <> 'annulled' and not ('explanation_' || (o ->> 'id')) = any (h.campos))
         || case when 'expected_conduct' = any (h.campos) then '{}'::text[] else array['expected_conduct'] end
         || case when 'inep_intent' = any (h.campos) then '{}'::text[] else array['inep_intent'] end))
  from public.questions q
  cross join lateral (
    select public.question_hidden_fields(q.explanations_review, q.comment_review) as campos
  ) h
  where q.id = p_question_id
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;
revoke execute on function public.ch_raw_practice_correction_view(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 6. inéditas: hash, eventos, salvar, equilibrar
create or replace function public.draft_content_hash(d public.draft_questions) returns text
  language sql immutable security definer set search_path = ''
as $$
  select public.ch_hash(jsonb_build_object(
    'stem', d.stem,
    'support', jsonb_build_object('type', d.support_type, 'title', d.support_title, 'rows', d.support_rows),
    'alternatives', d.alternatives,
    'answer', d.correct_answer,
    'explanation', d.explanation,
    'alternative_explanations', d.alternative_explanations,
    'clinical_decision', d.clinical_decision,
    'topic', d.topic,
    'citations', d.source_citations)
    -- 013120: a formatação só entra quando traz CONTEÚDO (imagem, link, nota); só negrito/cor/alinhamento não muda o hash
    || case when public.ch_campos_conteudo(public.draft_formatacao_textos(d), d.formatacao) = '{}'::jsonb then '{}'::jsonb
            else jsonb_build_object('formatacao_conteudo', public.ch_campos_conteudo(public.draft_formatacao_textos(d), d.formatacao)) end)
$$;

alter table public.draft_question_events drop constraint if exists draft_question_events_kind_check;
alter table public.draft_question_events add constraint draft_question_events_kind_check
  check (kind in ('importada', 'gerada', 'editada', 'fonte_proposta', 'fonte_aceita', 'conferida', 'decisao',
                  'publicada', 'republicada', 'recolhida', 'formatada'));

-- salvar (corpo da …9800 + formatação; só formatação não zera nada)
create or replace function public.app_draft_question_save(p_id uuid, p_hash text, p_content jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_before jsonb;
  v_after jsonb;
  c constant jsonb := coalesce(p_content, '{}'::jsonb);
  v_topic text;
  v_alts jsonb;
  v_exps jsonb;
  v_support jsonb;
  l text;
  v_form_antes jsonb;     -- 013120: formatação de antes
  v_textos_antes jsonb;   -- os textos de antes, nas chaves da formatação
  v_campos jsonb;
begin
  if (select auth.uid()) is null or not public.is_staff() then
    raise exception 'Editar rascunho é da equipe (administrador ou editor).' using errcode = '42501';
  end if;
  select * into d from public.draft_questions where id = p_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if d.status = 'rejected' then raise exception 'Questão recusada não é editada.' using errcode = '22023'; end if;
  if p_hash is distinct from d.content_hash then
    raise exception 'Outra pessoa salvou este rascunho depois que você abriu: abra de novo.' using errcode = '40001';
  end if;
  v_before := public.draft_content_json(d);
  v_form_antes := d.formatacao;
  v_textos_antes := public.draft_formatacao_textos(d);
  if c ? 'formatacao' and (jsonb_typeof(c -> 'formatacao') not in ('object', 'null')
                           or not public.ch_formatacao_valida(nullif(c -> 'formatacao', 'null'::jsonb))) then
    raise exception 'Rascunho inválido: formatação.' using errcode = '22023';
  end if;
  v_alts := coalesce(c -> 'alternatives', d.alternatives);
  v_exps := coalesce(c -> 'alternative_explanations', d.alternative_explanations);
  v_support := coalesce(c -> 'support', jsonb_build_object('type', d.support_type, 'title', d.support_title, 'rows', d.support_rows));
  if char_length(btrim(coalesce(c ->> 'stem', d.stem))) < 20 then raise exception 'Rascunho inválido: enunciado.' using errcode = '22023'; end if;
  foreach l in array array['A', 'B', 'C', 'D'] loop
    if jsonb_typeof(v_alts -> l) is distinct from 'string' or char_length(btrim(v_alts ->> l)) = 0 then
      raise exception 'Rascunho inválido: alternativa %.', l using errcode = '22023';
    end if;
  end loop;
  if coalesce(c ->> 'correct_answer', d.correct_answer::text) not in ('A', 'B', 'C', 'D') then raise exception 'Rascunho inválido: gabarito.' using errcode = '22023'; end if;
  if jsonb_typeof(v_exps) is distinct from 'object' then raise exception 'Rascunho inválido: explicações.' using errcode = '22023'; end if;
  if coalesce(v_support ->> 'type', 'NONE') not in ('NONE', 'TABLE', 'LAB_PANEL', 'IMAGE_REQUEST') then raise exception 'Rascunho inválido: tabela de apoio.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(v_support -> 'rows', '[]'::jsonb)) is distinct from 'array' then raise exception 'Rascunho inválido: linhas da tabela.' using errcode = '22023'; end if;
  v_topic := case when c ? 'topic' then nullif(btrim(coalesce(c ->> 'topic', '')), '') else d.topic end;
  if v_topic is not null and v_topic is distinct from d.topic
     and not exists (select 1 from public.staziamed_topic_weights(d.area) w where w.topic = v_topic) then
    raise exception 'Escolha um tema da lista de temas das provas oficiais.' using errcode = '22023';
  end if;
  update public.draft_questions set
    title = case when c ? 'title' then nullif(btrim(coalesce(c ->> 'title', '')), '') else title end,
    stem = btrim(coalesce(c ->> 'stem', stem)),
    support_type = coalesce(v_support ->> 'type', 'NONE'),
    support_title = nullif(btrim(coalesce(v_support ->> 'title', '')), ''),
    support_rows = coalesce(v_support -> 'rows', '[]'::jsonb),
    alternatives = v_alts,
    correct_answer = coalesce(c ->> 'correct_answer', correct_answer::text),
    explanation = case when c ? 'explanation' then nullif(btrim(coalesce(c ->> 'explanation', '')), '') else explanation end,
    alternative_explanations = v_exps,
    clinical_decision = case when c ? 'clinical_decision' then nullif(btrim(coalesce(c ->> 'clinical_decision', '')), '') else clinical_decision end,
    key_concepts = coalesce(c -> 'key_concepts', key_concepts),
    update_application = case when c ? 'update_application' then nullif(btrim(coalesce(c ->> 'update_application', '')), '') else update_application end,
    topic = v_topic,
    formatacao = case when c ? 'formatacao' then nullif(nullif(c -> 'formatacao', 'null'::jsonb), '{}'::jsonb) else formatacao end
  where id = d.id;
  select * into d from public.draft_questions where id = p_id;
  v_after := public.draft_content_json(d);
  if v_after = v_before then
    if d.formatacao is not distinct from v_form_antes then
      return jsonb_build_object('id', d.id, 'content_hash', d.content_hash, 'status', d.status, 'changed', false, 'so_formatacao', false);
    end if;
    -- 013120 (regra do dono): mudou SÓ a formatação (o que ela traz de conteúdo é o mesmo) → status, revisão, conferências e
    -- propostas continuam valendo; fica o evento "formatada" com a formatação anterior
    if public.ch_campos_conteudo(v_textos_antes, v_form_antes) = public.ch_campos_conteudo(public.draft_formatacao_textos(d), d.formatacao) then
      update public.draft_questions set edited_by = (select auth.uid()), edited_at = now() where id = d.id;
      select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_campos
        from (select jsonb_object_keys(coalesce(v_form_antes, '{}'::jsonb)) as k union select jsonb_object_keys(coalesce(d.formatacao, '{}'::jsonb))) x
       where (v_form_antes -> x.k) is distinct from (d.formatacao -> x.k);
      perform public.draft_event(d.id, 'formatada', null, jsonb_build_object('formatacao', v_form_antes), jsonb_build_object('campos', v_campos));
      -- versão no ar: o aluno vê a formatação nova na hora (o texto e o gabarito publicados são os mesmos)
      if d.question_id is not null and d.published_hash is not distinct from d.content_hash then
        update public.questions set formatacao = public.staziamed_formatacao_oficial(d)
         where id = d.question_id and retired_at is null and formatacao is distinct from public.staziamed_formatacao_oficial(d);
      end if;
      return jsonb_build_object('id', d.id, 'content_hash', d.content_hash, 'status', d.status, 'changed', true, 'so_formatacao', true);
    end if;
  end if;
  update public.draft_questions set status = 'awaiting_medical_review', reviewed_by = null, reviewed_at = null, review_note = null, reviewed_hash = null,
         similarity_to_official = null, similar_question_id = null, ai_review = case when ai_review is null then null else ai_review - 'pedagogia' end,
         edited_by = (select auth.uid()), edited_at = now()
   where id = d.id;
  delete from public.draft_checks where draft_id = d.id;
  update public.draft_source_proposals set state = 'obsoleta' where draft_id = d.id and state = 'pendente';
  perform public.draft_event(d.id, 'editada', null, v_before || case when v_form_antes is null then '{}'::jsonb else jsonb_build_object('formatacao', v_form_antes) end,
    jsonb_build_object('campos', (select coalesce(jsonb_agg(k.key order by k.key), '[]'::jsonb) from jsonb_each(v_after) k where k.value is distinct from v_before -> k.key)
                                 || case when d.formatacao is distinct from v_form_antes then '["formatacao"]'::jsonb else '[]'::jsonb end));
  select content_hash, status into d.content_hash, d.status from public.draft_questions where id = d.id;
  return jsonb_build_object('id', d.id, 'content_hash', d.content_hash, 'status', d.status, 'changed', true, 'so_formatacao', false);
end
$$;
revoke execute on function public.app_draft_question_save(uuid, text, jsonb) from public, anon;
grant execute on function public.app_draft_question_save(uuid, text, jsonb) to authenticated;

create or replace function public.app_draft_balance_answer(p_id uuid, p_hash text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_before jsonb;
  v_from text;
  v_to text;
  v_min integer;
  v_cnt integer;
  v_alts jsonb;
  v_exps jsonb;
  l text;
begin
  if (select auth.uid()) is null or not public.is_staff() then
    raise exception 'Editar rascunho é da equipe (administrador ou editor).' using errcode = '42501';
  end if;
  select * into d from public.draft_questions where id = p_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if d.status = 'rejected' then raise exception 'Questão recusada não é editada.' using errcode = '22023'; end if;
  if p_hash is distinct from d.content_hash then
    raise exception 'Outra pessoa salvou este rascunho depois que você abriu: abra de novo.' using errcode = '40001';
  end if;
  if public.staziamed_cites_letter(d.explanation) or exists (select 1 from jsonb_each_text(d.alternative_explanations) e where public.staziamed_cites_letter(e.value)) then
    raise exception 'A explicação cita letra: edite o texto antes de equilibrar o gabarito.' using errcode = '22023';
  end if;
  v_from := d.correct_answer::text;
  select min(x.n) into v_min from (
    select l.l, (select count(*) from public.draft_questions o where o.id <> d.id and o.status <> 'rejected' and o.correct_answer = l.l::char(1)) as n
    from (values ('A'), ('B'), ('C'), ('D')) as l (l)) x;
  select (select count(*) from public.draft_questions o where o.id <> d.id and o.status <> 'rejected' and o.correct_answer = v_from::char(1)) into v_cnt;
  if v_cnt = v_min then raise exception 'O gabarito já está na letra menos usada.' using errcode = '22023'; end if;
  select x.l into v_to from (
    select l.l, (select count(*) from public.draft_questions o where o.id <> d.id and o.status <> 'rejected' and o.correct_answer = l.l::char(1)) as n
    from (values ('A'), ('B'), ('C'), ('D')) as l (l)) x where x.n = v_min order by x.l limit 1;
  v_before := public.draft_content_json(d);
  v_alts := jsonb_set(jsonb_set(d.alternatives, array[v_from], d.alternatives -> v_to), array[v_to], d.alternatives -> v_from);
  v_exps := jsonb_set(jsonb_set(d.alternative_explanations, array[v_from], coalesce(d.alternative_explanations -> v_to, to_jsonb(''::text))), array[v_to], coalesce(d.alternative_explanations -> v_from, to_jsonb(''::text)));
  update public.draft_questions set alternatives = v_alts, alternative_explanations = v_exps, correct_answer = v_to::char(1),
         formatacao = public.draft_formatacao_troca_letras(formatacao, v_from, v_to),
         status = 'awaiting_medical_review', reviewed_by = null, reviewed_at = null, review_note = null, reviewed_hash = null,
         similarity_to_official = null, similar_question_id = null, ai_review = case when ai_review is null then null else ai_review - 'pedagogia' end,
         edited_by = (select auth.uid()), edited_at = now()
   where id = d.id returning content_hash into d.content_hash;
  delete from public.draft_checks where draft_id = d.id;
  update public.draft_source_proposals set state = 'obsoleta' where draft_id = d.id and state = 'pendente';
  perform public.draft_event(d.id, 'editada', 'Equilibrar gabarito: ' || v_from || ' → ' || v_to, v_before, jsonb_build_object('de', v_from, 'para', v_to));
  return jsonb_build_object('from', v_from, 'to', v_to, 'content_hash', d.content_hash);
end
$$;
revoke execute on function public.app_draft_balance_answer(uuid, text) from public, anon;
grant execute on function public.app_draft_balance_answer(uuid, text) to authenticated;

-- ---------------------------------------------------------------- 7. inéditas: publicar leva a formatação
create or replace function public.staziamed_question_payload(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_area public.med_area;
begin
  select * into d from public.draft_questions where id = p_id;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  v_area := public.staziamed_med_area(d.area);
  if v_area is null then raise exception 'A área % não tem correspondência nas provas.', d.area using errcode = '22023'; end if;
  return jsonb_build_object(
    'area', v_area::text,
    'topic', d.topic,
    'statement', d.stem,
    'support', case when coalesce(d.support_type, 'NONE') in ('TABLE', 'LAB_PANEL') and jsonb_array_length(d.support_rows) > 0
                    then jsonb_build_object('type', d.support_type, 'title', d.support_title, 'rows', d.support_rows) end,
    'options', (select jsonb_agg(jsonb_build_object('id', l.l, 'text', d.alternatives ->> l.l,
                   'explanation', case when l.l = d.correct_answer::text then coalesce(d.explanation, d.alternative_explanations ->> l.l) else d.alternative_explanations ->> l.l end)
                 order by l.l) from (values ('A'), ('B'), ('C'), ('D')) as l (l)),
    'correct_option', d.correct_answer::text,
    'expected_conduct', d.clinical_decision,
    'inep_intent', null,
    'sources', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title', c ->> 'source', 'organ', c ->> 'organ', 'level', s.authority_level,
                          'page', case when jsonb_typeof(c -> 'page') = 'number' then c -> 'page' end, 'version', c ->> 'version')) order by o)
                         from jsonb_array_elements(d.source_citations) with ordinality as e (c, o)
                         left join public.ch_sources s on s.id::text = c ->> 'source_id' where jsonb_typeof(c) = 'object'), '[]'::jsonb),
    'status', 'valid',
    'formatacao', public.staziamed_formatacao_oficial(d));
end
$$;
revoke execute on function public.staziamed_question_payload(uuid) from public, anon, authenticated;

create or replace function public.app_staziamed_publish(p_id uuid, p_hash text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  q public.questions;
  v jsonb;
  v_block text[];
  v_num integer;
  v_id text;
  v_code text;
  v_action text;
begin
  if (select auth.uid()) is null or not public.is_admin() then raise exception 'Publicar é do administrador.' using errcode = '42501'; end if;
  select * into d from public.draft_questions where id = p_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if d.status <> 'approved' or d.reviewed_hash is distinct from d.content_hash or p_hash is distinct from d.content_hash then
    raise exception 'Publique só a versão aprovada pelo revisor médico.' using errcode = '22023';
  end if;
  if d.question_id is not null and d.published_hash is not distinct from d.content_hash
     and exists (select 1 from public.questions x where x.id = d.question_id and x.retired_at is null) then
    raise exception 'Esta versão já está publicada.' using errcode = '22023';
  end if;
  v_block := public.draft_approval_blockers(d.id);
  if cardinality(v_block) > 0 then raise exception 'Não publica: %', array_to_string(v_block, ' · ') using errcode = '22023'; end if;
  v := public.staziamed_question_payload(d.id);
  if d.question_id is not null then select * into q from public.questions where id = d.question_id for update; end if;
  if q.id is not null and (q.retired_at is null or q.correct_option::text = v ->> 'correct_option') then
    if q.correct_option::text is distinct from v ->> 'correct_option' then
      raise exception 'O gabarito mudou: recolha esta questão e publique como nova.' using errcode = '22023';
    end if;
    update public.questions set area = (v ->> 'area')::public.med_area, topic = v ->> 'topic', statement = v ->> 'statement', options = v -> 'options',
           expected_conduct = v ->> 'expected_conduct', sources = v -> 'sources', support = nullif(v -> 'support', 'null'::jsonb), source_quotes = d.source_citations, retired_at = null,
           formatacao = nullif(v -> 'formatacao', 'null'::jsonb)
     where id = q.id returning id, code, number into v_id, v_code, v_num;
    v_action := 'republicada';
  else
    v_num := nextval('public.staziamed_question_seq');
    v_id := 'staziamed_q' || lpad(v_num::text, 4, '0');
    v_code := 'STZ-' || lpad(v_num::text, 4, '0');
    insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status, expected_conduct, inep_intent, sources, origin, support, source_quotes, formatacao)
    values (v_id, v_code, 'staziamed', v_num, (v ->> 'area')::public.med_area, v ->> 'topic', v ->> 'statement', v -> 'options', v ->> 'correct_option',
            'valid', v ->> 'expected_conduct', null, v -> 'sources', 'staziamed', nullif(v -> 'support', 'null'::jsonb), d.source_citations, nullif(v -> 'formatacao', 'null'::jsonb));
    v_action := 'publicada';
  end if;
  update public.draft_questions set question_id = v_id, published_hash = d.content_hash, published_at = now(), published_by = (select auth.uid()) where id = d.id;
  update public.exams set question_count = (select count(*)::int from public.questions where exam_id = 'staziamed' and retired_at is null) where id = 'staziamed';
  perform public.draft_event(d.id, v_action, null, null, jsonb_build_object('question_id', v_id, 'code', v_code, 'number', v_num));
  perform public.ch_log('staziamed.' || v_action, d.id::text, jsonb_build_object('question_id', v_id, 'hash', d.content_hash));
  return jsonb_build_object('question_id', v_id, 'code', v_code, 'number', v_num, 'action', v_action);
end
$$;
revoke execute on function public.app_staziamed_publish(uuid, text) from public, anon;
grant execute on function public.app_staziamed_publish(uuid, text) to authenticated;
