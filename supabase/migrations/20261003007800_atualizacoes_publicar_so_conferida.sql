-- =============================================================================
-- Atualizações: só fica no ar o que o revisor médico conferiu (correções de 10/10/2026, AT01, AT02, AT03 e AT05).
--
--  * AT03: publicar exige conferência médica aprovada. A função recusa com mensagem clara e a própria tabela passa a ter
--    a regra "publicada só se conferida" (vale para qualquer caminho de escrita).
--  * AT01: recusar na conferência uma atualização publicada tira do ar na hora.
--  * AT02: mudar o que o aluno lê numa atualização publicada tira do ar até nova conferência do revisor. Depois da nova
--    aprovação, quem publica de novo é o administrador (publicar continua sendo decisão dele). Mudar só a posição, a
--    prioridade ou os termos do treino não mexe na conferência nem na publicação (como antes).
--  * AT05: com isso, o texto da tela do aluno ("cada atualização só aparece aqui depois de conferida no documento
--    oficial") passa a ser verdade.
--  * O que estiver publicado hoje sem conferência aprovada sai do ar aqui, com registro em Administração › Registro.
--    As 19 atualizações do app anterior continuam em rascunho.
--
-- Para ver, antes de aplicar, o que vai sair do ar:
--   select slug, topic, review_status from public.guideline_updates where published and review_status <> 'approved';
-- As funções abaixo partem da versão de 20261003004100_atualizacoes_diretrizes.sql (a única até aqui).
-- =============================================================================

-- 1. O que está no ar sem conferência aprovada sai do ar (fica registrado; o autor aparece vazio: foi a correção).
with retiradas as (
  update public.guideline_updates set published = false
   where published and review_status <> 'approved'
  returning id, topic, review_status
)
insert into public.admin_audit_log (actor_id, action, target, details)
select null, 'guideline_update.unpublish', r.id::text,
       jsonb_build_object('topic', r.topic, 'review_status', r.review_status,
                          'motivo', 'Estava publicada sem conferência médica aprovada: retirada do ar pela correção de 10/10/2026.')
  from retiradas r;

-- 2. A regra na própria tabela: publicada só com conferência aprovada (colar duas vezes no Supabase não dá erro).
alter table public.guideline_updates drop constraint if exists guideline_updates_publicada_so_conferida;
alter table public.guideline_updates
  add constraint guideline_updates_publicada_so_conferida check (not published or review_status = 'approved');

-- 3. Editar: mudar o que o aluno lê numa publicada tira do ar até nova conferência (AT02).
create or replace function public.app_admin_save_guideline_update(p_update jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_update, '{}'::jsonb);
  v_old public.guideline_updates;
  v_new public.guideline_updates;
  v_area public.med_area;
  v_timeline jsonb;
  v_years smallint[];
  v_reset boolean := false;
  v_unpublished boolean := false;
  v_skip constant text[] := array['updated_at', 'updated_by', 'position', 'priority', 'search_terms', 'review_status', 'review_note',
                                  'reviewed_by', 'reviewed_at', 'source_checked_at', 'published', 'legacy', 'created_at'];
begin
  perform public.ch_assert_staff();
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  v_area := (a ->> 'area')::public.med_area;
  if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(v_area))) then
    raise exception 'Você revisa outra área: esta atualização é de %.', public.area_label(v_area) using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(a ->> 'topic', ''))) < 3 then raise exception 'Informe o tema.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'source_url', '')), '') is not null and not (btrim(a ->> 'source_url') ~ '^https://') then
    raise exception 'O endereço da fonte precisa começar com https://.' using errcode = '22023';
  end if;
  -- linha do tempo: [{year, text}] com ano de 2000 a 2100 e texto; os anos da atualização saem dela
  select coalesce(jsonb_agg(jsonb_build_object('year', (t ->> 'year')::int, 'text', btrim(t ->> 'text')) order by (t ->> 'year')::int), '[]'::jsonb),
         coalesce(array_agg(distinct (t ->> 'year')::smallint), '{}')
    into v_timeline, v_years
    from jsonb_array_elements(case when jsonb_typeof(a -> 'timeline') = 'array' then a -> 'timeline' else '[]'::jsonb end) t
    where (t ->> 'year') ~ '^\d{4}$'
      and (case when (t ->> 'year') ~ '^\d{4}$' then (t ->> 'year')::int end) between 2000 and 2100
      and nullif(btrim(coalesce(t ->> 'text', '')), '') is not null;

  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.guideline_updates where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
    v_new := v_old;
  else
    v_new.id := gen_random_uuid();
    v_new.slug := coalesce(nullif(a ->> 'slug', ''), 'atualizacao-' || substr(md5(gen_random_uuid()::text), 1, 10));
    v_new.priority := 2; v_new.position := 0; v_new.review_status := 'pending'; v_new.published := false; v_new.origin := 'manual';
    v_new.legacy := '{}'::jsonb; v_new.flashcards := '[]'::jsonb; v_new.practice_questions := '[]'::jsonb; v_new.created_at := now(); v_new.updated_at := now();
  end if;
  v_new.area := v_area;
  v_new.topic := btrim(a ->> 'topic');
  v_new.subtopic := nullif(btrim(coalesce(a ->> 'subtopic', '')), '');
  v_new.years := v_years;
  v_new.timeline := v_timeline;
  v_new.priority := coalesce((a ->> 'priority')::smallint, v_new.priority);
  v_new.position := coalesce((a ->> 'position')::int, v_new.position);
  v_new.publication_label := nullif(btrim(coalesce(a ->> 'publication_label', '')), '');
  v_new.institution := nullif(btrim(coalesce(a ->> 'institution', '')), '');
  v_new.document_title := nullif(btrim(coalesce(a ->> 'document_title', '')), '');
  v_new.source_url := nullif(btrim(coalesce(a ->> 'source_url', '')), '');
  v_new.before_text := nullif(btrim(coalesce(a ->> 'before_text', '')), '');
  v_new.current_conduct := nullif(btrim(coalesce(a ->> 'current_conduct', '')), '');
  v_new.clinical_impact := nullif(btrim(coalesce(a ->> 'clinical_impact', '')), '');
  v_new.exam_impact := nullif(btrim(coalesce(a ->> 'exam_impact', '')), '');
  v_new.trap := nullif(btrim(coalesce(a ->> 'trap', '')), '');
  v_new.search_terms := nullif(btrim(coalesce(a ->> 'search_terms', '')), '');
  v_new.updated_by := (select auth.uid());
  -- flashcards [{front, back}] e questões de treino [{statement, options[A-D]{id,text,justification}, answer, commentary}]
  if a ? 'flashcards' then
    if jsonb_typeof(a -> 'flashcards') <> 'array' or exists (
         select 1 from jsonb_array_elements(a -> 'flashcards') f
         where char_length(btrim(coalesce(f ->> 'front', ''))) not between 3 and 2000 or char_length(btrim(coalesce(f ->> 'back', ''))) not between 1 and 2000) then
      raise exception 'Cada flashcard precisa de frente e verso (até 2.000 caracteres).' using errcode = '22023';
    end if;
    v_new.flashcards := (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', f ->> 'type', 'front', btrim(f ->> 'front'), 'back', btrim(f ->> 'back')))), '[]'::jsonb)
                         from jsonb_array_elements(a -> 'flashcards') f);
  end if;
  if a ? 'practice_questions' then
    if jsonb_typeof(a -> 'practice_questions') <> 'array' or exists (
         select 1 from jsonb_array_elements(a -> 'practice_questions') q
         where char_length(btrim(coalesce(q ->> 'statement', ''))) < 20 or coalesce(q ->> 'answer', '') not in ('A', 'B', 'C', 'D')
            or jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') <> 4
            or (select count(distinct o ->> 'id') from jsonb_array_elements(q -> 'options') o
                where o ->> 'id' in ('A', 'B', 'C', 'D') and char_length(btrim(coalesce(o ->> 'text', ''))) > 0) <> 4) then
      raise exception 'Cada questão de treino precisa de enunciado, quatro alternativas (A a D) e o gabarito.' using errcode = '22023';
    end if;
    v_new.practice_questions := a -> 'practice_questions';
  end if;

  -- o que o aluno lê mudou: a conferência anterior (aprovada ou recusada) não vale mais e, se estava no ar, sai do ar
  -- até um revisor conferir de novo e o administrador publicar outra vez
  if v_old.id is not null and (to_jsonb(v_new) - v_skip) is distinct from (to_jsonb(v_old) - v_skip) then
    if v_old.published then
      v_new.published := false; v_unpublished := true;
    end if;
    if v_old.review_status <> 'pending' or v_unpublished then
      v_new.review_status := 'pending';
      v_new.review_note := case when v_unpublished
        then 'Conteúdo alterado depois da conferência: revisar de novo. Saiu do ar para os alunos até a nova conferência; depois dela, o administrador publica outra vez.'
        else 'Conteúdo alterado depois da conferência: revisar de novo.' end;
      v_new.reviewed_by := null; v_new.reviewed_at := null; v_new.source_checked_at := null; v_reset := true;
    end if;
  end if;

  begin
    if v_old.id is null then
      insert into public.guideline_updates select v_new.*;
    else
      update public.guideline_updates g set
        area = v_new.area, topic = v_new.topic, subtopic = v_new.subtopic, years = v_new.years, timeline = v_new.timeline,
        priority = v_new.priority, position = v_new.position, publication_label = v_new.publication_label, institution = v_new.institution,
        document_title = v_new.document_title, source_url = v_new.source_url, before_text = v_new.before_text,
        current_conduct = v_new.current_conduct, clinical_impact = v_new.clinical_impact, exam_impact = v_new.exam_impact,
        trap = v_new.trap, search_terms = v_new.search_terms, flashcards = v_new.flashcards,
        practice_questions = v_new.practice_questions, updated_by = v_new.updated_by,
        review_status = v_new.review_status, review_note = v_new.review_note, reviewed_by = v_new.reviewed_by,
        reviewed_at = v_new.reviewed_at, source_checked_at = v_new.source_checked_at, published = v_new.published
        where g.id = v_new.id;
    end if;
  exception when check_violation then
    raise exception 'Dados inválidos: confira os tamanhos dos textos, a prioridade (1 a 4) e o endereço da fonte.' using errcode = '22023';
  when unique_violation then
    raise exception 'Já existe uma atualização com este identificador.' using errcode = '23505';
  end;
  perform public.ch_log('guideline_update.save', v_new.id::text,
                        jsonb_build_object('topic', v_new.topic, 'review_reset', v_reset, 'unpublished', v_unpublished));
  if v_unpublished then
    perform public.admin_log('guideline_update.unpublish', v_new.id::text,
                             jsonb_build_object('topic', v_new.topic, 'motivo', 'Texto alterado depois da conferência: saiu do ar até nova conferência.'));
  end if;
  return (select public.guideline_update_view(u, true) || jsonb_build_object('review_status', u.review_status, 'review_note', u.review_note)
          from public.guideline_updates u where u.id = v_new.id);
end
$$;

-- 4. Conferência médica: recusar uma publicada tira do ar na hora (AT01).
create or replace function public.app_admin_review_guideline_update(p_id uuid, p_decision text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  u public.guideline_updates;
  v_unpublish boolean;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into u from public.guideline_updates where id = p_id for update;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_is_reviewer(public.guideline_area_code(u.area)) then
    raise exception 'A conferência médica desta atualização é de um revisor cadastrado em %.', public.area_label(u.area) using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Registre o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_decision = 'approve' and (u.source_url is null or u.current_conduct is null) then
    raise exception 'Para aprovar, registre o endereço do documento oficial conferido e a conduta vigente.' using errcode = '22023';
  end if;
  v_unpublish := p_decision = 'reject' and u.published;
  update public.guideline_updates set
    review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    review_note = btrim(p_note), reviewed_by = (select auth.uid()), reviewed_at = now(),
    source_checked_at = case when p_decision = 'approve' then now() end,
    published = case when p_decision = 'reject' then false else published end
    where id = p_id;
  perform public.ch_log('guideline_update.' || p_decision, p_id::text,
                        jsonb_build_object('topic', u.topic, 'note', btrim(p_note), 'unpublished', v_unpublish));
  if v_unpublish then
    perform public.admin_log('guideline_update.unpublish', p_id::text,
                             jsonb_build_object('topic', u.topic, 'motivo', 'Recusada na conferência médica: saiu do ar na hora.', 'note', btrim(p_note)));
  end if;
  return public.app_admin_guideline_updates();
end
$$;

-- 5. Publicar: só com conferência médica aprovada (AT03). Tirar do ar continua livre para o administrador.
create or replace function public.app_admin_publish_guideline_update(p_id uuid, p_published boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  u public.guideline_updates;
begin
  perform public.assert_admin();
  select * into u from public.guideline_updates where id = p_id for update;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(p_published, false) and u.review_status = 'rejected' then
    raise exception 'Esta atualização foi recusada na conferência médica: corrija e peça nova conferência antes de publicar.' using errcode = '22023';
  end if;
  if coalesce(p_published, false) and u.review_status <> 'approved' then
    raise exception 'Para publicar, a conferência médica precisa estar aprovada: um revisor médico da área ainda não conferiu esta atualização no documento oficial.' using errcode = '22023';
  end if;
  update public.guideline_updates set published = coalesce(p_published, false) where id = p_id;
  perform public.admin_log(case when coalesce(p_published, false) then 'guideline_update.publish' else 'guideline_update.unpublish' end, p_id::text,
                           jsonb_build_object('topic', u.topic, 'review_status', u.review_status));
  return public.app_admin_guideline_updates();
end
$$;
