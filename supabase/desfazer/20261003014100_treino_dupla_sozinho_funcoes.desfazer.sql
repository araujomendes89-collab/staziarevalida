-- DESFAZER da 20261003014100_treino_dupla_sozinho_funcoes.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- função refeita: fase2_evaluations(uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.fase2_evaluations(p_uid uuid)
 RETURNS TABLE(id text, origin text, station_id text, at timestamp with time zone, score10 numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.id::text, 'solo'::text, a.station_id, a.finished_at, round(a.correctness / 10, 1)
    from public.station_attempts a where a.user_id = p_uid and a.status = 'done'
  union all
  select s.id, 'dupla'::text, s.station_id, s.finished_at, round(s.correctness / 10, 1)
    from public.checklist_study_sessions s where s.doctor_id = p_uid
$function$;
-- função refeita: app_fase2_attempt(uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_attempt(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  return public.fase2_attempt_payload(a);
end
$function$;
-- função refeita: app_fase2_overview() volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
begin
  return jsonb_build_object(
    'stations_total', (select count(*)::int from public.checklist_stations where medical_review = 'approved'),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('area', t.area, 'total', t.n) order by t.area)
        from (select area, count(*)::int as n from public.checklist_stations where medical_review = 'approved' group by area) t
    ), '[]'::jsonb),
    'done_count', (select count(*)::int from public.fase2_evaluations(v_uid)),
    'avg_score10', (select round(avg(e.score10), 1) from public.fase2_evaluations(v_uid) e),
    'last', (
      select jsonb_build_object('id', e.id, 'origin', e.origin, 'station_id', e.station_id, 'name', s.name, 'area', s.area,
                                'at', e.at, 'score10', e.score10)
        from public.fase2_evaluations(v_uid) e join public.checklist_stations s on s.id = e.station_id
       order by e.at desc limit 1
    ),
    'open_attempt', (
      select jsonb_build_object('id', a.id, 'station_id', a.station_id, 'name', s.name, 'status', a.status)
        from public.station_attempts a join public.checklist_stations s on s.id = a.station_id
       where a.user_id = v_uid and a.status in ('reading', 'attending', 'scoring')
       order by a.started_at desc limit 1
    )
  );
end
$function$;
-- função refeita: app_fase2_abandon(uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_abandon(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
begin
  update public.station_attempts set status = 'abandoned'
   where id = p_attempt_id and user_id = v_uid and status in ('reading', 'attending', 'scoring');
  return jsonb_build_object('ok', true);
end
$function$;
-- função refeita: app_fase2_start(text) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_start(p_station_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
  s public.checklist_stations;
  a public.station_attempts;
begin
  select * into s from public.checklist_stations where id = p_station_id and medical_review = 'approved';
  if not found then
    raise exception 'Estação não encontrada ou ainda sem aprovação médica.' using errcode = 'P0002';
  end if;
  if s.is_pro_only and not public.has_pro() then
    raise exception 'Esta estação é do plano Pro.' using errcode = '42501';
  end if;
  -- só uma tentativa aberta por pessoa: a de outra estação é encerrada; a da mesma estação é retomada
  update public.station_attempts set status = 'abandoned'
   where user_id = v_uid and status in ('reading', 'attending', 'scoring') and station_id <> p_station_id;
  select * into a from public.station_attempts
   where user_id = v_uid and station_id = p_station_id and status in ('reading', 'attending', 'scoring')
   order by started_at desc limit 1;
  if not found then
    insert into public.station_attempts (user_id, station_id) values (v_uid, p_station_id) returning * into a;
  end if;
  return public.fase2_attempt_payload(a);
end
$function$;
-- função refeita: app_fase2_finish(uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_finish(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'attending' then
    update public.station_attempts set status = 'scoring', attendance_ended_at = now() where id = a.id returning * into a;
  elsif a.status <> 'scoring' then
    raise exception 'Inicie o atendimento antes de abrir o PEP.' using errcode = '22023';
  end if;
  return public.fase2_attempt_payload(a);
end
$function$;
-- função refeita: app_fase2_submit(uuid,jsonb) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_submit(p_attempt_id uuid, p_marks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
  c jsonb;
  i jsonb;
  v_grade text;
  v_points numeric;
  v_max numeric;
  v_total numeric := 0;
  v_sum_max numeric := 0;
  v_out jsonb := '[]'::jsonb;
  v_n int := 0;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'done' then
    return public.fase2_attempt_payload(a);
  end if;
  if a.status <> 'scoring' then
    raise exception 'Abra o PEP antes de marcar os itens.' using errcode = '22023';
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'object' then
    raise exception 'Marcação inválida.' using errcode = '22023';
  end if;
  select content into c from public.checklist_station_contents where station_id = a.station_id;
  for i in select x from jsonb_array_elements(coalesce(c -> 'checklist_items', '[]'::jsonb)) x order by (x ->> 'order')::int loop
    v_n := v_n + 1;
    v_grade := p_marks ->> (i ->> 'order');
    v_max := (i -> 'grades' ->> 'correct')::numeric;
    if v_grade = 'correct' then v_points := v_max;
    elsif v_grade = 'incorrect' then v_points := coalesce((i -> 'grades' ->> 'incorrect')::numeric, 0);
    elsif v_grade = 'partial' and jsonb_typeof(i -> 'grades' -> 'partial') = 'number' then v_points := (i -> 'grades' ->> 'partial')::numeric;
    else
      raise exception 'Marque todos os itens do PEP (item %).', i ->> 'order' using errcode = '22023';
    end if;
    v_total := v_total + v_points;
    v_sum_max := v_sum_max + v_max;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'order', (i ->> 'order')::int, 'phase', i ->> 'phase', 'content', i ->> 'content',
      'grade', v_grade, 'points', v_points, 'max', v_max));
  end loop;
  if v_n = 0 then
    raise exception 'Esta estação não tem checklist.' using errcode = '22023';
  end if;
  update public.station_attempts
     set status = 'done', finished_at = now(), marks = v_out, score = v_total, max_score = v_sum_max,
         correctness = least(100, round(v_total / nullif(v_sum_max, 0) * 100, 1))
   where id = a.id returning * into a;
  return public.fase2_attempt_payload(a);
end
$function$;
-- função refeita: app_fase2_peps(integer) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_fase2_peps(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.fase2_assert();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'origin', e.origin, 'station_id', e.station_id, 'name', s.name, 'area', s.area,
      'at', e.at, 'score10', e.score10) order by e.at desc)
      from (select * from public.fase2_evaluations(v_uid) order by at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) e
      join public.checklist_stations s on s.id = e.station_id
  ), '[]'::jsonb);
end
$function$;
-- função refeita: fase2_attempt_payload(station_attempts) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.fase2_attempt_payload(a station_attempts)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.checklist_stations;
  c jsonb;
  v jsonb;
begin
  select * into s from public.checklist_stations where id = a.station_id;
  select content into c from public.checklist_station_contents where station_id = a.station_id;
  v := jsonb_build_object(
    'attempt_id', a.id, 'status', a.status, 'server_now', now(),
    'station', jsonb_build_object('id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'setting', s.setting,
                                  'institution', s.institution, 'year', s.year, 'duration_ms', s.duration_ms),
    'scene', coalesce(c ->> 'doctor_scene', ''),
    'tasks', coalesce(c ->> 'doctor_tasks', ''),
    'started_at', a.started_at, 'attendance_started_at', a.attendance_started_at, 'attendance_ended_at', a.attendance_ended_at
  );
  if a.status in ('attending', 'scoring', 'done') then
    v := v || jsonb_build_object('pressings', coalesce((
      select jsonb_agg(jsonb_build_object('id', p ->> 'id', 'name', p ->> 'name', 'content', p ->> 'content'))
        from jsonb_array_elements(coalesce(c -> 'pressings', '[]'::jsonb)) p
    ), '[]'::jsonb));
  end if;
  if a.status = 'scoring' then
    v := v || jsonb_build_object('checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order', (i ->> 'order')::int, 'phase', i ->> 'phase', 'content', i ->> 'content', 'tip', coalesce(i ->> 'tip', ''),
        'max', (i -> 'grades' ->> 'correct')::numeric,
        'partial', case when jsonb_typeof(i -> 'grades' -> 'partial') = 'number' then (i -> 'grades' ->> 'partial')::numeric end,
        'criteria', coalesce(i -> 'criteria', '{}'::jsonb), 'subitems', coalesce(i -> 'subitems', '[]'::jsonb)
      ) order by (i ->> 'order')::int)
        from jsonb_array_elements(coalesce(c -> 'checklist_items', '[]'::jsonb)) i
    ), '[]'::jsonb));
  end if;
  if a.status = 'done' then
    v := v || jsonb_build_object('result', jsonb_build_object(
      'score', a.score, 'max_score', a.max_score, 'score10', round(a.correctness / 10, 1), 'finished_at', a.finished_at,
      'marks', a.marks));
  end if;
  return v;
end
$function$;
-- funções criadas por ela
drop function if exists public.solo_clean_text(text);
drop function if exists public.app_fase2_save_answers(uuid,jsonb);
drop function if exists public.app_fase2_open_pressing(uuid,text);
drop function if exists public.app_fase2_print_path(uuid,text);
drop function if exists public.app_fase2_deliver(uuid,jsonb);
drop function if exists public.app_fase2_report_ia(uuid,integer,text);
drop function if exists public.solo_pep_rows(jsonb,jsonb,boolean);
drop function if exists public.solo_has_image(jsonb,text,bigint);
drop function if exists public.solo_sweep(uuid);
drop function if exists public.solo_finalize(uuid,jsonb,text,jsonb);
drop function if exists public.solo_clean_answers(jsonb);
