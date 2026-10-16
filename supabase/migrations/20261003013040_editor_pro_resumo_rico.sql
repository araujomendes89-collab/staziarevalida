-- 013040 — Editor profissional, módulo M13 "Editar aula": formatação nova do resumo da aula feita à mão (lessons.summary_rico).
-- ADITIVA: 1 coluna, 1 regra de forma, 1 função de gatilho com 2 gatilhos, e redefine 2 funções (lesson_view, a partir da …009620;
-- app_admin_save_lesson, a partir da …009580). Pode ser colada de novo sem estragar nada. NÃO APLICADA em produção.
-- Cole DEPOIS da …013020. Para desfazer: supabase/desfazer/20261003013040_editor_pro_resumo_rico.desfazer.sql;
-- para conferir: supabase/conferir/editor-pro-resumo-rico.sql.
--
-- Regras (as mesmas dos parágrafos da Central, PLANO.md §2.3):
--   * o texto oficial continua em `summary` (busca, podcasts, conferência e o aluno de aparelho antigo leem só ele);
--   * `summary_rico` (JSON do editor com envelope {f:"sdoc", v:1, doc}) só existe quando o resumo tem formatação que o texto não guarda;
--     a tela só usa o rico quando a projeção dele em texto é IGUAL ao `summary` (conferido no app, src/shared/docRico/modulos/editarAula.ts);
--   * mudou o `summary` por qualquer caminho sem mandar rico novo → o rico velho é apagado aqui (nunca fica rico desatualizado guardado);
--   * aula da Central (origin = 'central'): a formatação do resumo também não muda pela tela Aulas (igual ao texto);
--   * o aluno só recebe o rico quando o texto do resumo chegou a ele inteiro (sem a retirada de fonte complementar); senão não recebe;
--   * aula antiga sem rico: o que o aluno e a equipe recebem continua exatamente igual (a chave nem aparece).

-- ---------------------------------------------------------------- 1. coluna e forma
alter table public.lessons add column if not exists summary_rico jsonb;
alter table public.lessons drop constraint if exists lessons_summary_rico_forma;
alter table public.lessons add constraint lessons_summary_rico_forma check (
  summary_rico is null or (
    summary is not null
    and jsonb_typeof(summary_rico) = 'object'
    and summary_rico -> 'f' = '"sdoc"'::jsonb
    and summary_rico -> 'v' = '1'::jsonb
    and jsonb_typeof(summary_rico -> 'doc') = 'object'
    and summary_rico -> 'doc' -> 'type' = '"doc"'::jsonb
    and jsonb_typeof(summary_rico -> 'doc' -> 'content') = 'array'
    and octet_length(summary_rico::text) <= 120000));

-- ---------------------------------------------------------------- 2. gatilho: rico velho sai; aula da Central trancada
create or replace function public.lessons_summary_rico_guard() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.origin = 'central' and new.summary_rico is distinct from old.summary_rico
     and coalesce(current_setting('app.ch_distribute', true), '') <> 'on' then
    raise exception 'Esta aula vem da Central de Conteúdo: o texto, os pontos-chave, a área e a publicação mudam lá, com nova revisão médica.' using errcode = '22023';
  end if;
  if new.summary is null then
    new.summary_rico := null;
  elsif tg_op = 'UPDATE' and new.summary is distinct from old.summary and new.summary_rico is not distinct from old.summary_rico then
    new.summary_rico := null;   -- o texto mudou por um caminho que não conhece a formatação: o rico velho não vale mais
  end if;
  return new;
end
$$;
revoke execute on function public.lessons_summary_rico_guard() from public, anon, authenticated;
drop trigger if exists lessons_summary_rico_guard_trg on public.lessons;
create trigger lessons_summary_rico_guard_trg before insert or update on public.lessons for each row execute function public.lessons_summary_rico_guard();

-- o rico também passa pela guarda de fonte complementar (a mesma do texto, 009621)
drop trigger if exists lessons_guard_complementar_rico on public.lessons;
create trigger lessons_guard_complementar_rico before insert or update of summary_rico on public.lessons
  for each row execute function public.ch_guard_complementar_save('summary_rico');

-- ---------------------------------------------------------------- 3. leitura (aluno e equipe)
-- lesson_view (corpo da …009620) + o rico, só quando o resumo chegou inteiro a quem lê (a retirada de fonte complementar não mexeu nele).
create or replace function public.lesson_view(l public.lessons) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when l.summary_rico is not null and v.j ->> 'summary' is not distinct from l.summary
              then v.j || jsonb_build_object('summary_rico', l.summary_rico)
              else v.j end
  from (select public.ch_scrub_json(public.ch_raw_lesson_view(l)) as j) v
$$;

-- ---------------------------------------------------------------- 4. salvar (corpo da …009580 + summary_rico)
create or replace function public.app_admin_save_lesson(p_lesson jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_lesson, '{}'::jsonb);
  v_id uuid;
  v_points text[];
  v_old public.lessons;
  v_note text := btrim(coalesce(a ->> 'review_note', ''));
  v_publica boolean;
  v_exige boolean := false;
  v_confere boolean := v_note <> '';
  v_ai jsonb;
  v_rico jsonb;   -- resumo com formatação nova (envelope sdoc); só objeto entra, o resto vira nulo
begin
  perform public.assert_staff();
  if nullif(btrim(coalesce(a ->> 'title', '')), '') is null then raise exception 'Informe o título da aula.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'topic', '')), '') is null then raise exception 'Informe o tema da aula.' using errcode = '22023'; end if;
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  if a ? 'key_points' and jsonb_typeof(a -> 'key_points') = 'array' then
    select array_agg(btrim(x) order by o) into v_points from jsonb_array_elements_text(a -> 'key_points') with ordinality as t (x, o) where btrim(x) <> '';
  end if;
  -- avisos da IA (até 30, 300 caracteres cada)
  if a ? 'ai_notes' and jsonb_typeof(a -> 'ai_notes') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(left(btrim(x), 300)) order by o), '[]'::jsonb) into v_ai
      from jsonb_array_elements_text(a -> 'ai_notes') with ordinality as t (x, o) where btrim(x) <> '' and o <= 30;
  end if;
  if a ? 'summary_rico' and jsonb_typeof(a -> 'summary_rico') = 'object' then v_rico := a -> 'summary_rico'; end if;
  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.lessons where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  end if;
  -- vai ficar publicada? Então precisa de conferência registrada quando acabou de ser publicada ou quando o texto do aluno mudou.
  v_publica := coalesce((a ->> 'published')::boolean, coalesce(v_old.published, false));
  if v_publica then
    v_exige := v_old.id is null or not v_old.published
      or btrim(a ->> 'title') is distinct from v_old.title
      or btrim(a ->> 'topic') is distinct from v_old.topic
      or (a ? 'summary' and nullif(btrim(coalesce(a ->> 'summary', '')), '') is distinct from v_old.summary)
      or (a ? 'summary_rico' and v_rico is distinct from v_old.summary_rico)   -- mudou só a formatação do resumo: o aluno vê diferente
      or (a ? 'key_points' and coalesce(v_points, '{}') is distinct from v_old.key_points);
    if v_exige and char_length(v_note) < 10 then
      raise exception 'Antes de publicar, registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
  end if;
  -- nota preenchida vale sempre (inclusive em aula antiga sem registro), mas precisa dizer algo
  if v_confere and char_length(v_note) < 10 then
    raise exception 'Registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
  end if;
  begin
    if v_old.id is null then
      insert into public.lessons (area, topic, title, duration_minutes, instructor, specialty, video_url, summary, summary_rico, key_points, guideline_title, guideline_url, published, position, created_by)
      values ((a ->> 'area')::public.med_area, btrim(a ->> 'topic'), btrim(a ->> 'title'), (a ->> 'duration_minutes')::int, nullif(btrim(coalesce(a ->> 'instructor', '')), ''),
              nullif(btrim(coalesce(a ->> 'specialty', '')), ''), nullif(btrim(coalesce(a ->> 'video_url', '')), ''), nullif(btrim(coalesce(a ->> 'summary', '')), ''), v_rico,
              coalesce(v_points, '{}'), nullif(btrim(coalesce(a ->> 'guideline_title', '')), ''), nullif(btrim(coalesce(a ->> 'guideline_url', '')), ''),
              v_publica, coalesce((a ->> 'position')::int, 0), (select auth.uid()))
      returning id into v_id;
    else
      v_id := v_old.id;
      update public.lessons set
        area = (a ->> 'area')::public.med_area, topic = btrim(a ->> 'topic'), title = btrim(a ->> 'title'),
        duration_minutes = case when a ? 'duration_minutes' then (a ->> 'duration_minutes')::int else duration_minutes end,
        instructor = case when a ? 'instructor' then nullif(btrim(a ->> 'instructor'), '') else instructor end,
        specialty = case when a ? 'specialty' then nullif(btrim(a ->> 'specialty'), '') else specialty end,
        video_url = case when a ? 'video_url' then nullif(btrim(a ->> 'video_url'), '') else video_url end,
        summary = case when a ? 'summary' then nullif(btrim(a ->> 'summary'), '') else summary end,
        summary_rico = case when a ? 'summary_rico' then v_rico else summary_rico end,
        key_points = case when a ? 'key_points' then coalesce(v_points, '{}') else key_points end,
        guideline_title = case when a ? 'guideline_title' then nullif(btrim(a ->> 'guideline_title'), '') else guideline_title end,
        guideline_url = case when a ? 'guideline_url' then nullif(btrim(a ->> 'guideline_url'), '') else guideline_url end,
        published = v_publica,
        position = coalesce((a ->> 'position')::int, position)
        where id = v_id;
    end if;
  exception when check_violation then
    raise exception 'Dados da aula inválidos: confira duração (1 a 600 min), endereços (https) e tamanhos dos textos.' using errcode = '22023';
  end;
  if v_confere or v_ai is not null then
    insert into public.lesson_reviews as r (lesson_id, reviewed_by, reviewed_at, review_note, ai_notes)
    values (v_id, case when v_confere then (select auth.uid()) end, case when v_confere then now() end, case when v_confere then v_note end, coalesce(v_ai, '[]'::jsonb))
    on conflict (lesson_id) do update set
      reviewed_by = case when v_confere then (select auth.uid()) else r.reviewed_by end,
      reviewed_at = case when v_confere then now() else r.reviewed_at end,
      review_note = case when v_confere then v_note else r.review_note end,
      ai_notes = coalesce(v_ai, r.ai_notes);
  end if;
  perform public.admin_log('lesson.save', v_id::text, a - 'summary' - 'summary_rico');
  if v_confere then
    perform public.admin_log('lesson.review', v_id::text, jsonb_build_object('title', btrim(a ->> 'title'), 'note', v_note));
  end if;
  return public.app_lesson(v_id) || (select public.lesson_review_view(l) from public.lessons l where l.id = v_id);
end
$$;

revoke execute on function public.app_admin_save_lesson(jsonb) from public, anon;
grant execute on function public.app_admin_save_lesson(jsonb) to authenticated;
