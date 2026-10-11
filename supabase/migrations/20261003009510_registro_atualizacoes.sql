-- =============================================================================
-- Atualizações (Administração), correções AT08 e AT06 (11/10/2026).
--
--  * AT08: a aba Atualizações não trava mais quando a Central de Conteúdo (Content Lab) é desligada. Antes, a lista e o
--    salvar chamavam ch_assert_staff, que além do papel da pessoa também exige a chave de liga e desliga ch_flags.enabled
--    (…2900_content_lab_foundation.sql), e respondiam "Content Lab desligado pelo administrador." a todo mundo, até ao
--    administrador. Agora conferem só o papel (equipe ou revisor médico), como a …8000 fez nas Estações com
--    checklist_station_assert_staff. Conferir, publicar e apagar já não dependiam da chave. A Central de Conteúdo em si
--    continua travada com a chave desligada (nada muda nela).
--  * AT06: mensagem certa quando o revisor tenta levar uma atualização da área dele para outra área. A regra não muda
--    (quem não é da equipe edita só a área que revisa, conferindo a área GRAVADA e depois a MANDADA, desde a …7800):
--    só a ordem das duas conferências muda, para a mensagem dizer o que aconteceu. Antes: "Você revisa outra área: esta
--    atualização é de Gineco & Obstetrícia." (não era verdade: ela é de Clínica Médica). Agora: "Você não pode levar esta
--    atualização de Clínica Médica para Gineco & Obstetrícia: você não revisa Gineco & Obstetrícia. Para mudar a área,
--    peça a um administrador ou editor."
--    Conferido de novo (AT06): o que mais poderia puxar uma atualização de outra área? Conferir é só do revisor da área
--    gravada (…4100); publicar e apagar são só do administrador; a tabela não tem política de escrita para ninguém;
--    mudar a área conta como mudar o conteúdo (a conferência da área antiga não vale para a nova e, se estava no ar,
--    sai do ar). Faltava só o rastro: agora o registro da Central (ch_audit, "guideline_update.save") guarda a área de
--    antes e a de depois sempre que a área muda.
--
-- Nada nos dados é mexido. Pode ser colada de novo no Supabase sem erro (create or replace e revoke).
-- As funções partem da versão mais nova de cada uma (grep em todas as migrações): app_admin_save_guideline_update, de
-- …7800_atualizacoes_publicar_so_conferida.sql (única redefinição depois da …4100), e app_admin_guideline_updates, de
-- …4100_atualizacoes_diretrizes.sql (a única). Todas com security definer e search_path vazio.
-- =============================================================================

-- Quem abre a aba Atualizações: a equipe (editor ou administrador) ou um revisor médico cadastrado em alguma área.
-- Não usa ch_assert_staff de propósito (ver AT08 acima). Mesma mensagem de antes para quem não é da equipe.
create or replace function public.guideline_update_assert_staff() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (public.is_staff() or public.ch_is_reviewer()) then
    raise exception 'Acesso restrito à equipe de conteúdo.' using errcode = '42501';
  end if;
end
$$;

-- Lista da aba (igual à da …4100; só muda a conferência de quem chama).
create or replace function public.app_admin_guideline_updates() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.guideline_update_assert_staff();
  return jsonb_build_object(
    'is_admin', public.is_admin(),
    'review_areas', (select coalesce(jsonb_agg(e.area), '[]'::jsonb) from unnest(enum_range(null::public.med_area)) as e (area)
                     where public.ch_is_reviewer(public.guideline_area_code(e.area))),
    'items', coalesce((select jsonb_agg(public.guideline_update_view(u, true) || jsonb_build_object(
        'review_status', u.review_status, 'review_note', u.review_note, 'reviewed_at', u.reviewed_at,
        'reviewer', (select nullif(p.name, '') from public.profiles p where p.id = u.reviewed_by),
        'source_checked_at', u.source_checked_at, 'origin', u.origin, 'legacy', u.legacy, 'position', u.position,
        'can_review', public.ch_is_reviewer(public.guideline_area_code(u.area)))
      order by u.published desc, u.priority, u.position, u.topic) from public.guideline_updates u), '[]'::jsonb));
end
$$;

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
  perform public.guideline_update_assert_staff();
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  v_area := (a ->> 'area')::public.med_area;
  -- quem não é da equipe edita só a área que revisa. Primeiro a área GRAVADA (revisão rodada 1 da …7800: senão um revisor
  -- de outra área trocaria a área para a dele e mudaria, tiraria do ar e conferiria uma atualização que não é dele)...
  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.guideline_updates where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
    if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(v_old.area))) then
      raise exception 'Você revisa outra área: esta atualização é de %.', public.area_label(v_old.area) using errcode = '42501';
    end if;
  end if;
  -- ...depois a área MANDADA. Se a atualização é da área dele e ele tenta levá-la para uma área que não revisa, a mensagem
  -- diz exatamente isso (antes dizia "esta atualização é de <área para onde ele tentou levar>", o que não era verdade).
  if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(v_area))) then
    if v_old.id is not null then
      raise exception 'Você não pode levar esta atualização de % para %: você não revisa %. Para mudar a área, peça a um administrador ou editor.',
        public.area_label(v_old.area), public.area_label(v_area), public.area_label(v_area) using errcode = '42501';
    end if;
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

  if v_old.id is not null then
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
  -- quando a área muda (só a equipe, ou o revisor das duas áreas), o registro diz quem levou de qual área para qual
  perform public.ch_log('guideline_update.save', v_new.id::text,
                        jsonb_build_object('topic', v_new.topic, 'review_reset', v_reset, 'unpublished', v_unpublished)
                        || case when v_old.id is not null and v_old.area is distinct from v_new.area
                                then jsonb_build_object('area_de', v_old.area, 'area_para', v_new.area) else '{}'::jsonb end);
  if v_unpublished then
    perform public.admin_log('guideline_update.unpublish', v_new.id::text,
                             jsonb_build_object('topic', v_new.topic, 'motivo', 'Texto alterado depois da conferência: saiu do ar até nova conferência.'));
  end if;
  return (select public.guideline_update_view(u, true) || jsonb_build_object('review_status', u.review_status, 'review_note', u.review_note)
          from public.guideline_updates u where u.id = v_new.id);
end
$$;

-- Sem login ninguém chama (como as demais funções da Administração); a equipe e os revisores logados continuam chamando.
-- (create or replace mantém os privilégios; repetido para quem ler só esta migração)
revoke execute on function public.app_admin_save_guideline_update(jsonb) from public, anon;
revoke execute on function public.app_admin_guideline_updates() from public, anon;
-- Função interna: ninguém a chama de fora (as funções acima rodam como o dono e a chamam por dentro).
revoke execute on function public.guideline_update_assert_staff() from public, anon, authenticated;
