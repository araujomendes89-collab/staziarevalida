-- =============================================================================
-- Treino em Dupla, etapa 3: leituras das telas, perfil de estudo e chave no painel.
-- (Plano de 09/10: "migração 6600"; número 9760, no intervalo livre, logo depois da 9750 dos dados.)
-- Pode ser colada duas vezes: só "create or replace function", "create index if not exists" e permissões. Não cria tabela,
-- não grava dado e não muda nenhuma função que já existia. Depende da 9750 (colunas da sala, perfil de estudo, marcações).
--
-- O QUE FAZ
--  1) Apoios internos (o navegador nunca chama): dupla_public_name (nome público ou "Conta excluída"), dupla_sweep (fecha o que
--     venceu), dupla_room_state (o estado da sala, igual para todas as funções).
--  2) Leituras da sala: app_dupla_room (estado; vazio se o "rev" não mudou), app_dupla_marks (marcações, só o avaliador),
--     app_dupla_result (resultado de uma rodada, só os dois da rodada).
--  3) Banco de estações: app_dupla_stations (aprovadas, na ordem da prova, com a última nota de quem chama e a média geral).
--  4) Perfil de estudo: app_dupla_profile (ler) e app_dupla_save_profile (gravar, validando).
--  5) Painel: app_admin_save_dupla (chave "aberto" e planos), só administrador, com registro "dupla.save".
--  6) Dois índices parciais para o fechamento preguiçoso (dupla_sweep) não varrer a tabela inteira.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: nenhuma. Todas as funções desta migração são novas. Usadas sem mudar:
--   dupla_assert_access, dupla_station_meta, dupla_area_code (9750); is_staff (…0100); assert_admin, admin_log (…1300).
--
-- DECISÕES PEQUENAS (fora do texto do plano)
--  - "Última vez", "Sua última nota" e a média usam a coluna "correctness" (0–100, uma casa) da avaliação; a nota do
--    resultado vem de "score" / "max_score".
--  - Pontos do resultado: o nível marcado (checklist_answers) lido na estação ATUAL; item que sumiu da estação não aparece.
--  - "Definido pelo match" usa o papel que cada um tem hoje no perfil de estudo (o match não guarda o papel da hora).
--  - Mensagens novas (para o dono aprovar): "Nome: máximo de 40 caracteres." e "Dados do perfil inválidos.".
--
-- COMO DESFAZER: apagar as funções criadas aqui (app_dupla_room(uuid, integer), app_dupla_marks(uuid),
--   app_dupla_result(uuid, integer), app_dupla_stations(), app_dupla_profile(), app_dupla_save_profile(jsonb),
--   app_admin_save_dupla(boolean, text[]), dupla_room_state(checklist_rooms, uuid), dupla_sweep(uuid), dupla_public_name(uuid))
--   e os índices checklist_rooms_open_idx e study_invites_pending_idx.
-- =============================================================================

-- ---------------------------------------------------------------- índices do fechamento preguiçoso
create index if not exists checklist_rooms_open_idx on public.checklist_rooms (updated_at) where phase <> 'closed';
create index if not exists study_invites_pending_idx on public.study_invites (expires_at) where status = 'pending';

-- ---------------------------------------------------------------- 1) apoios
-- Nome que os colegas veem. Sem perfil de estudo (conta excluída, ou id que não existe mais): "Conta excluída".
create or replace function public.dupla_public_name(p_user uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.public_name from public.study_profiles p where p.user_id = p_user), 'Conta excluída')
$$;

-- Fecha o que venceu (fechamento preguiçoso, sem tarefa agendada). Com p_room_id, só essa sala.
--   convite pendente vencido (60 s) → convite "canceled", sala "closed" / "convite_expirado";
--   nenhum membro com sinal nos últimos 15 min e a sala parada há 15 min → "closed" / "sem_sinal".
-- Fechar apaga o link da chamada e soma 1 ao rev (o tempo real avisa os dois).
create or replace function public.dupla_sweep(p_room_id uuid default null) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  with vencidos as (
    update public.study_invites i set status = 'canceled'
    where i.status = 'pending' and i.expires_at < now() and (p_room_id is null or i.room_id = p_room_id)
    returning i.room_id
  )
  update public.checklist_rooms r
     set phase = 'closed', closed_reason = 'convite_expirado', call_link = null, rev = r.rev + 1
   where r.phase <> 'closed' and r.id in (select v.room_id from vencidos v);

  update public.checklist_rooms r
     set phase = 'closed', closed_reason = 'sem_sinal', call_link = null, rev = r.rev + 1
   where r.phase <> 'closed'
     and (p_room_id is null or r.id = p_room_id)
     and r.updated_at < now() - interval '15 minutes'
     and not exists (
       select 1 from public.study_profiles p
       where p.user_id = any (r.member_ids) and p.last_seen_at > now() - interval '15 minutes'
     );
end
$$;

-- O estado da sala para quem pergunta (RoomState). Interna: quem chama já conferiu que p_uid é membro.
create or replace function public.dupla_room_state(p_room public.checklist_rooms, p_uid uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  st public.checklist_stations;
  v_meta jsonb;
  v_station jsonb := null;
  v_partner uuid := (select x from unnest(p_room.member_ids) x where x is distinct from p_uid limit 1);
  v_seen integer;
  v_my_pref text;
  v_their_pref text;
  v_note text := null;
  v_closed_by jsonb := null;
  v_short constant jsonb := '{"med": "quer ser médico(a)", "ator": "quer ser ator/avaliador", "any": "topa qualquer papel"}'::jsonb;
begin
  if p_room.station_id is not null then
    select * into st from public.checklist_stations where id = p_room.station_id;
    if found then
      v_meta := public.dupla_station_meta(st.id);
      v_station := jsonb_build_object(
        'id', st.id, 'name', st.name, 'area', st.area, 'area_code', public.dupla_area_code(st.area),
        'number', v_meta -> 'number', 'edition', v_meta -> 'edition', 'reapplication', v_meta -> 'reapplication',
        'institution', st.institution, 'duration_ms', st.duration_ms, 'is_pro_only', st.is_pro_only
      );
    end if;
  end if;

  select greatest(0, least(extract(epoch from (now() - p.last_seen_at)) * 1000, 2147483647))::integer into v_seen
    from public.study_profiles p where p.user_id = v_partner;

  -- Faixa "Definido pelo match": rodada 1, sala do match, fase dos papéis e o match teve sugestão (não são os dois "qualquer").
  if p_room.round = 1 and p_room.match_id is not null and p_room.phase = 'roles' then
    select p.role_pref into v_my_pref from public.study_profiles p where p.user_id = p_uid;
    select p.role_pref into v_their_pref from public.study_profiles p where p.user_id = v_partner;
    if v_my_pref is not null and v_their_pref is not null and not (v_my_pref = 'any' and v_their_pref = 'any') then
      v_note := 'Definido pelo match: você ' || (v_short ->> v_my_pref) || ' e '
                || split_part(btrim(public.dupla_public_name(v_partner)), ' ', 1) || ' ' || (v_short ->> v_their_pref)
                || '. Vocês ainda podem trocar.';
    end if;
  end if;

  -- Quem encerrou: só quando a pessoa saiu ou recusou o convite (nos outros fechamentos ninguém "encerrou").
  if p_room.phase = 'closed' and p_room.closed_reason in ('saiu', 'convite_recusado') and p_room.updated_by is not null then
    v_closed_by := jsonb_build_object('user_id', p_room.updated_by, 'public_name', public.dupla_public_name(p_room.updated_by),
                                      'me', p_room.updated_by = p_uid);
  end if;

  return jsonb_build_object(
    'id', p_room.id,
    'rev', p_room.rev,
    'phase', p_room.phase,
    'round', p_room.round,
    'server_now', clock_timestamp(),
    'station', v_station,
    'duration_ms', coalesce(p_room.duration_ms, st.duration_ms),
    'me', jsonb_build_object(
      'user_id', p_uid,
      'public_name', public.dupla_public_name(p_uid),
      'role', case when p_uid = p_room.candidate_id then 'candidate' when p_uid = p_room.evaluator_id then 'evaluator' end,
      'confirmed', p_uid = any (p_room.confirmed_ids),
      'connected', p_uid = any (p_room.connected_ids),
      'ready', p_uid = any (p_room.ready_ids)
    ),
    'partner', jsonb_build_object(
      'user_id', case when exists (select 1 from auth.users u where u.id = v_partner) then v_partner end,
      'public_name', public.dupla_public_name(v_partner),
      'role', case when v_partner = p_room.candidate_id then 'candidate' when v_partner = p_room.evaluator_id then 'evaluator' end,
      'confirmed', coalesce(v_partner = any (p_room.confirmed_ids), false),
      'connected', coalesce(v_partner = any (p_room.connected_ids), false),
      'ready', coalesce(v_partner = any (p_room.ready_ids), false),
      'seen_ms_ago', v_seen
    ),
    'match_note', v_note,
    'invite_pending', exists (select 1 from public.study_invites i
                              where i.room_id = p_room.id and i.status = 'pending' and i.expires_at >= now()),
    'call_link', p_room.call_link,
    'started_at', p_room.started_at,
    'ends_at', p_room.ends_at,
    'paused_left_ms', p_room.paused_left_ms,
    'paused_at', p_room.paused_at,
    'finished_at', p_room.finished_at,
    'released_pressings', to_jsonb(p_room.released_pressings),
    'closed_reason', p_room.closed_reason,
    'closed_by', v_closed_by
  );
end
$$;

-- ---------------------------------------------------------------- 2) leituras da sala
-- Estado da sala. "Vazio" (null) se o rev que a tela já tem é o de agora. Fecha o que venceu antes de ler.
create or replace function public.app_dupla_room(p_room_id uuid, p_since_rev integer default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  if not exists (select 1 from public.checklist_rooms x where x.id = p_room_id and v_uid = any (x.member_ids)) then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  perform public.dupla_sweep(p_room_id);
  select * into r from public.checklist_rooms where id = p_room_id;
  if p_since_rev is not null and p_since_rev = r.rev then
    return null;
  end if;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Marcações do PEP da rodada atual: só o avaliador. [{ item_id, grade, subitems }]
create or replace function public.app_dupla_marks(p_room_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.checklist_rooms where id = p_room_id and v_uid = any (member_ids);
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  if r.evaluator_id is distinct from v_uid then
    raise exception 'Só o avaliador vê as marcações durante a rodada.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('item_id', m.item_id, 'grade', m.grade, 'subitems', to_jsonb(m.subitems_checked))
                     order by m.item_id)
    from public.checklist_room_marks m where m.room_id = r.id and m.round = r.round
  ), '[]'::jsonb);
end
$$;

-- Resultado de uma rodada: só depois de a avaliação existir e só para os dois dela.
create or replace function public.app_dupla_result(p_room_id uuid, p_round integer) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  s public.checklist_study_sessions;
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_items jsonb;
  v_prev integer;
begin
  select * into s from public.checklist_study_sessions where room_id = p_room_id and round = p_round;
  if not found or (v_uid is distinct from s.doctor_id and v_uid is distinct from s.actor_id) then
    raise exception 'Resultado ainda não liberado.' using errcode = '42501';
  end if;
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
    'viewer', case when v_uid = s.doctor_id then 'candidate' else 'evaluator' end,
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
                                 'revised_at', s.revised_at, 'score_before_review', s.score_before_review)
  );
end
$$;

-- ---------------------------------------------------------------- 3) Banco de estações
-- Estações aprovadas (a equipe vê todas), na ordem da prova: edição mais recente primeiro, regular antes da reaplicação,
-- depois o número; as sem edição ficam no fim, por nome. "Média geral" só com 5 avaliações ou mais.
create or replace function public.app_dupla_stations() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  return coalesce((
    select jsonb_agg(x.j order by (x.ed is null), x.ed collate "C" desc, x.reap, x.num, x.nome collate "C", x.id)
    from (
      select
        jsonb_build_object(
          'id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'area_code', public.dupla_area_code(s.area),
          'number', m -> 'number', 'edition', m -> 'edition', 'reapplication', m -> 'reapplication',
          'institution', s.institution, 'styles', to_jsonb(s.styles), 'duration_ms', s.duration_ms, 'is_pro_only', s.is_pro_only,
          'criteria_count', case when jsonb_typeof(k.content -> 'checklist_items') = 'array'
                                 then jsonb_array_length(k.content -> 'checklist_items') else 0 end,
          'pressing_count', case when jsonb_typeof(k.content -> 'pressings') = 'array'
                                 then jsonb_array_length(k.content -> 'pressings') else 0 end,
          'my_last_pct', mine.pct,
          'average_pct', case when coalesce(ev.n, 0) >= 5 then round(ev.a, 1) end,
          'evaluations', coalesce(ev.n, 0)
        ) as j,
        m ->> 'edition' as ed,
        (m ->> 'reapplication')::boolean as reap,
        (m ->> 'number')::integer as num,
        s.name as nome,
        s.id as id
      from public.checklist_stations s
      cross join lateral public.dupla_station_meta(s.id) m
      left join public.checklist_station_contents k on k.station_id = s.id
      left join (
        select t.station_id, count(*) as n, avg(t.correctness) as a
        from public.checklist_study_sessions t group by t.station_id
      ) ev on ev.station_id = s.id
      left join (
        select distinct on (t.station_id) t.station_id, round(t.correctness)::integer as pct
        from public.checklist_study_sessions t where t.doctor_id = v_uid
        order by t.station_id, t.finished_at desc, t.created_at desc, t.id desc
      ) mine on mine.station_id = s.id
      where s.medical_review = 'approved' or public.is_staff()
    ) x
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 4) perfil de estudo
-- { profile, defaults: { public_name, exam }, stats: { done, avg } }. Sem perfil gravado, profile é null.
create or replace function public.app_dupla_profile() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'user_id' - 'status' - 'last_seen_at' from public.study_profiles p where p.user_id = v_uid),
    'defaults', jsonb_build_object(
      'public_name', (select nullif(btrim(pr.name), '') from public.profiles pr where pr.id = v_uid),
      'exam', (select pr.target_edition from public.profiles pr where pr.id = v_uid)
    ),
    'stats', jsonb_build_object(
      'done', (select count(*) from public.checklist_study_sessions t where t.doctor_id = v_uid),
      'avg', (select round(avg(t.score / nullif(t.max_score, 0) * 10), 2)
              from public.checklist_study_sessions t where t.doctor_id = v_uid)
    )
  );
end
$$;

-- Grava o perfil: junta com o que já existe (só as chaves enviadas mudam; na primeira vez parte dos padrões da tabela),
-- valida, ordena dias, turnos e áreas, e devolve o mesmo de app_dupla_profile().
create or replace function public.app_dupla_save_profile(p_profile jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  cur public.study_profiles;
  k text;
  val jsonb;
  v_name text;
  v_school text;
  v_city text;
  v_goal text;
  v_exam text;
  v_bio text;
  v_areas text[];
  v_role text;
  v_pace text;
  v_days text[];
  v_shifts text[];
  v_radar boolean;
  v_show_school boolean;
  v_show_stats boolean;
  c_areas constant text[] := array['CM', 'CR', 'GO', 'PED', 'MFC'];
  c_days constant text[] := array['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  c_shifts constant text[] := array['Manhã', 'Tarde', 'Noite'];
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Dados do perfil inválidos.' using errcode = '22023';
  end if;
  -- Tipos básicos: texto (ou nulo), listas e verdadeiro/falso. Chaves que não são do perfil são ignoradas.
  for k, val in select e.key, e.value from jsonb_each(p_profile) e loop
    if k in ('public_name', 'school', 'city', 'goal', 'exam', 'bio', 'role_pref', 'pace') and jsonb_typeof(val) not in ('string', 'null') then
      raise exception 'Dados do perfil inválidos.' using errcode = '22023';
    elsif k in ('areas', 'days', 'shifts') and jsonb_typeof(val) <> 'array' then
      raise exception 'Dados do perfil inválidos.' using errcode = '22023';
    elsif k in ('radar_visible', 'show_school', 'show_stats') and jsonb_typeof(val) <> 'boolean' then
      raise exception 'Dados do perfil inválidos.' using errcode = '22023';
    end if;
  end loop;

  select * into cur from public.study_profiles where user_id = v_uid;

  v_name := case when p_profile ? 'public_name' then btrim(coalesce(p_profile ->> 'public_name', '')) else coalesce(cur.public_name, '') end;
  if char_length(v_name) < 3 then
    raise exception 'Informe como você quer aparecer para os colegas.' using errcode = '22023';
  elsif char_length(v_name) > 40 then
    raise exception 'Nome: máximo de 40 caracteres.' using errcode = '22001';
  end if;

  v_bio := case when p_profile ? 'bio' then btrim(coalesce(p_profile ->> 'bio', '')) else coalesce(cur.bio, '') end;
  if char_length(v_bio) > 160 then
    raise exception 'Bio: máximo de 160 caracteres.' using errcode = '22001';
  end if;

  v_school := case when p_profile ? 'school' then nullif(btrim(coalesce(p_profile ->> 'school', '')), '') else cur.school end;
  v_city := case when p_profile ? 'city' then nullif(btrim(coalesce(p_profile ->> 'city', '')), '') else cur.city end;
  v_goal := case when p_profile ? 'goal' then nullif(btrim(coalesce(p_profile ->> 'goal', '')), '') else cur.goal end;
  if char_length(coalesce(v_school, '')) > 80 or char_length(coalesce(v_city, '')) > 80 or char_length(coalesce(v_goal, '')) > 80 then
    raise exception 'Instituição, cidade e objetivo: até 80 caracteres.' using errcode = '22001';
  end if;

  v_exam := case when p_profile ? 'exam' then nullif(btrim(coalesce(p_profile ->> 'exam', '')), '') else cur.exam end;
  if v_exam is not null and v_exam !~ '^\d{4}/[12]$' then
    raise exception 'Prova inválida.' using errcode = '22023';
  end if;

  if p_profile ? 'areas' then
    v_areas := array(select jsonb_array_elements_text(p_profile -> 'areas'));
    if not (v_areas <@ c_areas) then raise exception 'Área inválida.' using errcode = '22023'; end if;
  else
    v_areas := coalesce(cur.areas, '{}');
  end if;
  v_areas := array(select a from unnest(c_areas) a where a = any (v_areas));

  v_role := case when p_profile ? 'role_pref' then p_profile ->> 'role_pref' else coalesce(cur.role_pref, 'any') end;
  if v_role is null or v_role not in ('med', 'ator', 'any') then
    raise exception 'Papel inválido.' using errcode = '22023';
  end if;

  v_pace := case when p_profile ? 'pace' then p_profile ->> 'pace' else coalesce(cur.pace, 'cronometrado') end;
  if v_pace is null or v_pace not in ('livre', 'cronometrado', 'simulacao') then
    raise exception 'Ritmo inválido.' using errcode = '22023';
  end if;

  if p_profile ? 'days' then
    v_days := array(select jsonb_array_elements_text(p_profile -> 'days'));
    if not (v_days <@ c_days) then raise exception 'Dia inválido.' using errcode = '22023'; end if;
  else
    v_days := coalesce(cur.days, '{}');
  end if;
  v_days := array(select d from unnest(c_days) d where d = any (v_days));

  if p_profile ? 'shifts' then
    v_shifts := array(select jsonb_array_elements_text(p_profile -> 'shifts'));
    if not (v_shifts <@ c_shifts) then raise exception 'Turno inválido.' using errcode = '22023'; end if;
  else
    v_shifts := coalesce(cur.shifts, '{}');
  end if;
  v_shifts := array(select s from unnest(c_shifts) s where s = any (v_shifts));

  v_radar := case when p_profile ? 'radar_visible' then (p_profile ->> 'radar_visible')::boolean else coalesce(cur.radar_visible, true) end;
  v_show_school := case when p_profile ? 'show_school' then (p_profile ->> 'show_school')::boolean else coalesce(cur.show_school, true) end;
  v_show_stats := case when p_profile ? 'show_stats' then (p_profile ->> 'show_stats')::boolean else coalesce(cur.show_stats, true) end;

  insert into public.study_profiles (user_id, public_name, school, city, goal, exam, bio, areas, role_pref, pace, days, shifts,
                                     radar_visible, show_school, show_stats)
  values (v_uid, v_name, v_school, v_city, v_goal, v_exam, v_bio, v_areas, v_role, v_pace, v_days, v_shifts,
          v_radar, v_show_school, v_show_stats)
  on conflict (user_id) do update set
    public_name = excluded.public_name, school = excluded.school, city = excluded.city, goal = excluded.goal,
    exam = excluded.exam, bio = excluded.bio, areas = excluded.areas, role_pref = excluded.role_pref, pace = excluded.pace,
    days = excluded.days, shifts = excluded.shifts, radar_visible = excluded.radar_visible,
    show_school = excluded.show_school, show_stats = excluded.show_stats;

  return public.app_dupla_profile();
end
$$;

-- ---------------------------------------------------------------- 5) painel: a chave do módulo
-- Só administrador. "planos" são os marcados em Administração › Configurações (teste grátis, Pro, Elite). Valor nulo em
-- "aberto" fecha o módulo (falha para o lado seguro).
create or replace function public.app_admin_save_dupla(p_aberto boolean, p_planos text[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access / assert_admin barra o resto.
-- As de apoio: só rodam dentro das funções do servidor (security definer).
revoke execute on function public.app_dupla_room(uuid, integer) from public, anon;
revoke execute on function public.app_dupla_marks(uuid) from public, anon;
revoke execute on function public.app_dupla_result(uuid, integer) from public, anon;
revoke execute on function public.app_dupla_stations() from public, anon;
revoke execute on function public.app_dupla_profile() from public, anon;
revoke execute on function public.app_dupla_save_profile(jsonb) from public, anon;
revoke execute on function public.app_admin_save_dupla(boolean, text[]) from public, anon;
revoke execute on function public.dupla_public_name(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_sweep(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_room_state(public.checklist_rooms, uuid) from public, anon, authenticated;
