-- DESFAZER da 20261003012200_simulado_ineditas_misturadas.sql:
-- Devolve app_start_session e app_start_simulado_tri aos corpos da …012000, app_finish_session ao da …4300, practice_result ao da …9801 e
-- app_admin_save_settings ao da …1300; apaga as funções e a configuração novas. Nada de dado do aluno é apagado: simulados já feitos com
-- inéditas misturadas continuam no histórico e abrem normalmente.

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
$$;revoke execute on function public.app_start_session(text, jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_session(text, jsonb, integer, integer) to authenticated;

create or replace function public.app_start_simulado_tri(
  p_filters jsonb,
  p_count integer,
  p_time_limit_seconds integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v jsonb;
begin
  if coalesce(p_count, 0) < 30 then
    raise exception 'O simulado TRI precisa de pelo menos 30 questões (a estimativa fica mais precisa com 100).' using errcode = '22023';
  end if;
  -- Simulado TRI continua SÓ com questões oficiais do Inep (inédita não tem calibração oficial; a …010400 já a deixa fora da nota)
  if lower(btrim(coalesce(p_filters ->> 'exam_id', ''))) = 'staziamed' then
    raise exception 'O simulado TRI usa apenas questões oficiais do Inep: a nota depende da dificuldade medida de cada questão, e as Questões Inéditas ainda não têm essa medida. Para um simulado com as Questões Inéditas, escolha a correção Clássica.' using errcode = '22023';
  end if;
  v := public.app_start_session('simulado', p_filters, p_count, p_time_limit_seconds);
  if (v ->> 'count')::int < 30 then
    raise exception 'Com esses filtros há só % questões; o simulado TRI precisa de pelo menos 30 questões.', v ->> 'count'
      using errcode = '22023';
  end if;
  update public.practice_sessions
    set config = config || jsonb_build_object('scoring', 'irt', 'scoring_version', 1)
    where id = (v ->> 'session_id')::uuid;
  return v || jsonb_build_object('scoring', 'irt');
end
$$;revoke execute on function public.app_start_simulado_tri(jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_simulado_tri(jsonb, integer, integer) to authenticated;

create or replace function public.app_finish_session(p_session_id uuid) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if s.finished_at is null then
    if s.kind = 'simulado' then
      insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
      select d.key, s.id, d.value ->> 'option', (d.value ->> 'ms')::integer
      from jsonb_each(s.answers) d
      where d.key = any (s.question_ids) and d.value ->> 'option' in ('A', 'B', 'C', 'D')
      on conflict (session_id, question_id) where session_id is not null do nothing;
    end if;
    update public.practice_sessions
      set finished_at = clock_timestamp(),
          paused_ms = paused_ms + case when paused_at is null then 0
                                       else greatest(floor(extract(epoch from clock_timestamp() - paused_at) * 1000), 0)::bigint end,
          paused_at = null
      where id = s.id;
  end if;

  return public.app_get_session(p_session_id);
end
$$;
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
create or replace function public.app_admin_save_settings(p_settings jsonb) returns jsonb
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
drop function if exists public.practice_draw(jsonb, integer);
drop function if exists public.simulado_ineditas_pct();
delete from public.app_settings where key = 'simulado_ineditas_pct';
alter table public.app_settings drop constraint if exists app_settings_key_check;
-- 18/10/2026: as chaves do Treino em Dupla (2ª fase, 013300 e 013370; 'creditos' da 014020 desde 19/10) continuam aceitas; só sai a do simulado.
alter table public.app_settings add constraint app_settings_key_check check (key in ('trial_days', 'announcement', 'treino_dupla', 'treino_dupla_chat', 'creditos'));
