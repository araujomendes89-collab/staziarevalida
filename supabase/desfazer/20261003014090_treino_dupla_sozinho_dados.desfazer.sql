-- DESFAZER da 20261003014090_treino_dupla_sozinho_dados.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- dados que a regra antiga recusaria: arrumados antes (a avaliação salva na Central sai; quem estava 'sozinho' volta a 'livre';
-- treino entregue ou em avaliação vira abandonado, porque a regra antiga não conhece essas situações)
delete from public.ai_functions where key = 'treino_avaliacao';
update public.app_settings set value = value - 'sozinho' where key = 'treino_dupla' and value ? 'sozinho';
update public.study_profiles set status = 'livre' where status = 'sozinho';
update public.station_attempts set status = 'abandoned' where status in ('submitted', 'evaluating');
-- função refeita: app_dupla_heartbeat(text,uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_dupla_heartbeat(p_status text, p_room_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  v_status text := p_status;
begin
  if p_status is null or p_status not in ('livre', 'em_estacao', 'fora') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if v_status = 'em_estacao' and not exists (
       select 1 from public.checklist_rooms r where r.id = p_room_id and v_uid = any (r.member_ids) and r.phase <> 'closed') then
    v_status := 'livre';
  end if;
  update public.study_profiles set status = v_status, last_seen_at = now() where user_id = v_uid;
  perform public.dupla_sweep();
  return jsonb_build_object('server_now', clock_timestamp());
end
$function$;
-- função refeita: app_admin_save_dupla(boolean,text[]) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_admin_save_dupla(p_aberto boolean, p_planos text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_planos text[];
  v_aberto boolean := coalesce(p_aberto, false);
begin
  perform public.assert_admin();
  if p_planos is null or not (p_planos <@ array['trial', 'pro', 'elite']::text[]) then
    raise exception 'Planos inválidos.' using errcode = '22023';
  end if;
  v_planos := array(select p from unnest(array['trial', 'pro', 'elite']::text[]) p where p = any (p_planos));
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('treino_dupla', jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos)), now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('dupla.save', null, jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos)));
  return jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos));
end
$function$;
-- função refeita: app_admin_dupla_usage(text) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_admin_dupla_usage(p_month text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month text;
  v_from timestamptz;
  v_to timestamptz;
  v_salas integer;
  v_rodadas integer;
  v_alunos integer;
  v_impressos numeric;
begin
  perform public.assert_admin();
  v_month := coalesce(p_month, to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido.' using errcode = '22023';
  end if;
  v_from := (v_month || '-01')::timestamp at time zone 'America/Sao_Paulo';
  v_to := ((v_month || '-01')::timestamp + interval '1 month') at time zone 'America/Sao_Paulo';

  select count(*) into v_salas from public.checklist_rooms r where r.created_at >= v_from and r.created_at < v_to;

  select count(*),
         round(avg(case when jsonb_typeof(s.pressings_released) = 'array' then jsonb_array_length(s.pressings_released) else 0 end), 1)
    into v_rodadas, v_impressos
    from public.checklist_study_sessions s
   where s.room_id is not null and s.finished_at >= v_from and s.finished_at < v_to;

  select count(distinct x.u) into v_alunos
    from public.checklist_study_sessions s
    cross join lateral (values (s.actor_id), (s.doctor_id)) as x(u)
   where s.room_id is not null and s.finished_at >= v_from and s.finished_at < v_to and x.u is not null;

  return jsonb_build_object('month', v_month, 'salas', v_salas, 'rodadas_avaliadas', v_rodadas, 'alunos', v_alunos,
                            'impressos_por_rodada', v_impressos);
end
$function$;
-- função refeita: app_dupla_history(integer) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_dupla_history(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.fim desc, x.sid desc)
      from (
        select s.finished_at as fim, s.id as sid, jsonb_build_object(
                 'room_id', s.room_id,
                 'round', s.round,
                 'role', case when s.doctor_id = v_uid then 'candidate' else 'evaluator' end,
                 'status', case when z.ok then 'concluida' else 'aguardando_revisao' end,
                 'revised', s.revised_at is not null,
                 'finished_at', s.finished_at,
                 'partner', jsonb_build_object('public_name',
                              public.dupla_public_name(case when s.doctor_id = v_uid then s.actor_id else s.doctor_id end)),
                 'station', jsonb_build_object(
                   'number', z.meta -> 'number',
                   'area', st.area,
                   'area_code', public.dupla_area_code(st.area),
                   'name', case when z.ok then st.name end,
                   'edition', case when z.ok then z.meta -> 'edition' end),
                 'score', case when z.ok then s.score end,
                 'max_score', case when z.ok then s.max_score end,
                 'pct', case when z.ok and s.max_score > 0 then round(s.score / s.max_score * 100)::integer end
               ) as j
          from public.checklist_study_sessions s
          left join public.checklist_stations st on st.id = s.station_id
          cross join lateral (select public.dupla_history_released(s) as ok, public.dupla_station_meta(s.station_id) as meta) z
         where s.room_id is not null
           and (s.doctor_id = v_uid or s.actor_id = v_uid)
         order by s.finished_at desc nulls last, s.id desc
         limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) x
  ), '[]'::jsonb);
end
$function$;
-- função refeita: dupla_result_payload(checklist_study_sessions,uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.dupla_result_payload(s checklist_study_sessions, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_items jsonb;
  v_prev integer;
begin
  select * into st from public.checklist_stations where id = s.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = s.station_id;
  v_meta := public.dupla_station_meta(s.station_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.e ->> 'id',
           'order', coalesce(i.e -> 'order', to_jsonb(i.n)),
           'content', coalesce(i.e ->> 'content', ''),
           'max_points', coalesce((i.e -> 'grades' ->> 'correct')::numeric, 0),
           'grade', a.grade,
           'points', case when a.grade is null then 0 else coalesce((i.e -> 'grades' ->> a.grade)::numeric, 0) end
         ) order by i.n), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end)
       with ordinality as i(e, n)
  left join lateral (
    select lower(x ->> 'grade') as grade
    from jsonb_array_elements(case when jsonb_typeof(s.checklist_answers) = 'array' then s.checklist_answers else '[]'::jsonb end) x
    where x ->> 'id' = i.e ->> 'id' and lower(x ->> 'grade') in ('correct', 'partial', 'incorrect')
    limit 1
  ) a on true;

  select round(p.correctness)::integer into v_prev
    from public.checklist_study_sessions p
   where p.doctor_id = s.doctor_id and p.station_id = s.station_id and p.id <> s.id
     and (p.finished_at, p.created_at, p.id) < (s.finished_at, s.created_at, s.id)
   order by p.finished_at desc, p.created_at desc, p.id desc
   limit 1;

  return jsonb_build_object(
    'round', s.round,
    'viewer', case when p_uid = s.doctor_id then 'candidate' else 'evaluator' end,
    'station', jsonb_build_object(
      'id', st.id, 'name', st.name, 'area', st.area, 'area_code', public.dupla_area_code(st.area),
      'number', v_meta -> 'number', 'edition', v_meta -> 'edition', 'reapplication', v_meta -> 'reapplication',
      'institution', st.institution, 'duration_ms', st.duration_ms
    ),
    'score', s.score,
    'max_score', s.max_score,
    'pct', case when s.max_score > 0 then round(s.score / s.max_score * 100)::integer else 0 end,
    'previous_pct', v_prev,
    'items', v_items,
    'evaluator', jsonb_build_object('user_id', s.actor_id, 'public_name', public.dupla_public_name(s.actor_id)),
    'candidate', jsonb_build_object('user_id', s.doctor_id, 'public_name', public.dupla_public_name(s.doctor_id)),
    'finished_at', s.finished_at,
    'used_ms', s.used_ms,
    'feedback', jsonb_build_object('pos', s.feedback_pos, 'neg', s.feedback_neg, 'gen', s.feedback_gen),
    'review', jsonb_build_object('requested_at', s.review_requested_at, 'reason', s.review_reason,
                                 'revised_at', s.revised_at, 'score_before_review', s.score_before_review),
    -- "O que mudou desde a prova" (013560): só aqui, no resultado; não mexe na nota
    'conduct_notes', coalesce((
      select jsonb_agg(jsonb_build_object('item_order', case when jsonb_typeof(n.e -> 'item_order') = 'number' then n.e -> 'item_order' end,
                                          'text', btrim(n.e ->> 'text')) order by n.o)
        from jsonb_array_elements(case when jsonb_typeof(c -> 'conduct_notes') = 'array' then c -> 'conduct_notes' else '[]'::jsonb end)
             with ordinality as n(e, o)
       where jsonb_typeof(n.e) = 'object' and jsonb_typeof(n.e -> 'text') = 'string' and btrim(n.e ->> 'text') <> ''
    ), '[]'::jsonb)
  );
end
$function$;
-- funções criadas por ela
drop function if exists public.solo_sp_day(timestamp with time zone);
drop function if exists public.app_admin_save_dupla_ia(jsonb);
drop function if exists public.solo_plan_matches(uuid,text);
drop function if exists public.app_admin_dupla_ia();
drop function if exists public.solo_ia_function_ready();
drop function if exists public.solo_ia_status(uuid);
drop function if exists public.station_feedback_for(uuid);
-- índices criados por ela
drop index if exists public.station_attempts_ia_idx;
drop index if exists public.checklist_sessions_doctor_mode_idx;
-- regras criadas por ela
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_mode_check;
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_mode_not_null;
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_source_check;
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_source_not_null;
alter table public.station_attempts drop constraint if exists station_attempts_answers_check;
alter table public.station_attempts drop constraint if exists station_attempts_answers_not_null;
alter table public.station_attempts drop constraint if exists station_attempts_how_check;
alter table public.station_attempts drop constraint if exists station_attempts_ia_message_check;
alter table public.station_attempts drop constraint if exists station_attempts_pressings_opened_not_null;
alter table public.station_attempts drop constraint if exists station_attempts_source_check;
-- colunas criadas por ela (o que estiver gravado nelas se perde)
alter table public.station_attempts drop column if exists submitted_at cascade;
alter table public.station_attempts drop column if exists answers cascade;
alter table public.station_attempts drop column if exists ia cascade;
alter table public.station_attempts drop column if exists source cascade;
alter table public.station_attempts drop column if exists session_id cascade;
alter table public.checklist_study_sessions drop column if exists mode cascade;
alter table public.station_attempts drop column if exists station_version cascade;
alter table public.checklist_study_sessions drop column if exists solo_run_id cascade;
alter table public.checklist_study_sessions drop column if exists source cascade;
alter table public.station_attempts drop column if exists ia_reserved_at cascade;
alter table public.station_attempts drop column if exists ia_message cascade;
alter table public.station_attempts drop column if exists pressings_opened cascade;
alter table public.station_attempts drop column if exists how cascade;
-- regras refeitas ou apagadas: voltam como eram (se houver linha gravada fora da regra antiga, ela recusa: corrija o dado antes)
alter table public.ai_functions drop constraint if exists ai_functions_key_check;
alter table public.ai_functions add constraint ai_functions_key_check CHECK ((key = ANY (ARRAY['assistente_conferir'::text, 'assistente_preencher'::text, 'assistente_revisar'::text, 'busca_fontes'::text, 'criacao'::text, 'engenharia_reversa'::text, 'similaridade'::text, 'verificacao'::text, 'analise_mudancas'::text])));
alter table public.station_attempts drop constraint if exists station_attempts_status_check;
alter table public.station_attempts add constraint station_attempts_status_check CHECK ((status = ANY (ARRAY['reading'::text, 'attending'::text, 'scoring'::text, 'done'::text, 'abandoned'::text])));
alter table public.study_profiles drop constraint if exists study_profiles_status_check;
alter table public.study_profiles add constraint study_profiles_status_check CHECK ((status = ANY (ARRAY['livre'::text, 'em_estacao'::text, 'fora'::text])));
