-- DESFAZER da 20261003013990_treino_dupla_correcoes_publicacao_3.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- função refeita: app_dupla_swipe(uuid,text,text) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_dupla_swipe(p_to uuid, p_direction text, p_station_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  me public.study_profiles;
  other public.study_profiles;
  v_theirs public.study_swipes;
  st public.checklist_stations;
  v_station text;
  v_chooser uuid;
  v_dur integer;
  v_assign text;
  v_cand uuid;
  v_eval uuid;
  v_match uuid;
  v_room uuid;
begin
  if p_to is null or p_to = v_uid or p_direction is null or p_direction not in ('right', 'left') then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(v_uid, p_to)::text || ':' || greatest(v_uid, p_to)::text, 0));
  perform public.dupla_sweep();

  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  select * into other from public.study_profiles where user_id = p_to;
  if not found then
    raise exception 'Colega não encontrado.' using errcode = '22023';
  end if;
  -- Estação da escolha: aprovada, ou não aprovada só entre duas pessoas da equipe.
  if p_station_id is not null and not public.dupla_station_liberada(p_station_id, array[v_uid, p_to]) then
    if public.is_staff() and exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
      raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
    end if;
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;

  insert into public.study_swipes (from_user, to_user, direction, station_id)
  values (v_uid, p_to, p_direction, p_station_id)
  on conflict (from_user, to_user) do update
    set direction = excluded.direction, station_id = excluded.station_id, created_at = now();
  update public.study_profiles set last_seen_at = now(), status = case when status = 'fora' then 'livre' else status end
   where user_id = v_uid;

  if p_direction <> 'right' then
    return jsonb_build_object('matched', false);
  end if;

  select * into v_theirs from public.study_swipes
   where from_user = p_to and to_user = v_uid and direction = 'right' and created_at > now() - interval '7 days';
  if not found then
    return jsonb_build_object('matched', false);
  end if;
  if not coalesce(other.last_seen_at > now() - interval '2 minutes' and other.status <> 'fora', false)
     or not public.dupla_allowed(p_to)
     or exists (select 1 from public.checklist_rooms r
                where r.phase <> 'closed' and (v_uid = any (r.member_ids) or p_to = any (r.member_ids))) then
    return jsonb_build_object('matched', false);
  end if;

  -- Estação: a minha, senão a da escolha dele; só liberada para os dois e, se for dos planos Pro/Elite, só com plano pago nos
  -- dois. Quem forneceu a estação fica gravado como quem a escolheu (já viu o tema).
  v_station := coalesce(p_station_id, v_theirs.station_id);
  v_chooser := case when p_station_id is not null then v_uid when v_theirs.station_id is not null then p_to end;
  if v_station is not null then
    select * into st from public.checklist_stations s where s.id = v_station;
    if not found
       or not public.dupla_station_liberada(v_station, array[v_uid, p_to])
       or (st.is_pro_only and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(p_to))) then
      v_station := null;
      v_chooser := null;
    else
      v_dur := case when st.duration_ms between 60000 and 3600000 then st.duration_ms end;
    end if;
  end if;

  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := p_to;
  elsif v_assign = 'ator' then
    v_cand := p_to; v_eval := v_uid;
  end if;

  insert into public.study_matches (user_a, user_b, station_id) values (p_to, v_uid, v_station) returning id into v_match;
  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, station_chosen_by, candidate_id, evaluator_id, duration_ms)
  values (array[v_uid, p_to], 'roles', 1, v_match, v_station, v_chooser, v_cand, v_eval, v_dur)
  returning id into v_room;
  -- Os dois escolheram a mesma estação no Banco: os dois já viram.
  if v_station is not null and p_station_id is not null and v_theirs.station_id = v_station then
    perform public.dupla_room_seen_add(v_room, v_station, p_to, 'escolheu');
  end if;
  update public.study_matches set room_id = v_room where id = v_match;
  insert into public.study_invites (from_user, to_user, room_id) values (v_uid, p_to, v_room);

  return jsonb_build_object('matched', true, 'room_id', v_room,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$function$;
-- função refeita: app_dupla_chat_room(uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_dupla_chat_room(p_chat_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats := public.dupla_chat_get(p_chat_id, v_uid);
  v_partner uuid := case when c.user_a = v_uid then c.user_b else c.user_a end;
  me public.study_profiles;
  other public.study_profiles;
  r public.checklist_rooms;
  v_assign text;
  v_cand uuid;
  v_eval uuid;
  v_match uuid;
  v_room uuid;
begin
  if v_partner is null or exists (
       select 1 from public.study_chat_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = v_partner) or (b.blocker_id = v_partner and b.blocked_id = v_uid)) then
    raise exception 'Não é possível abrir a sala por esta conversa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(v_uid, v_partner)::text || ':' || greatest(v_uid, v_partner)::text, 0));
  perform public.dupla_sweep();

  -- Já há sala aberta dos dois: entra nela (o convite pendente para mim vira aceito).
  select * into r from public.checklist_rooms x
   where x.phase <> 'closed' and v_uid = any (x.member_ids) and v_partner = any (x.member_ids)
   order by x.created_at desc limit 1;
  if found then
    if exists (select 1 from public.study_invites i where i.room_id = r.id and i.to_user = v_uid and i.status = 'pending') then
      update public.study_invites set status = 'accepted' where room_id = r.id and to_user = v_uid and status = 'pending';
      update public.checklist_rooms set rev = rev + 1 where id = r.id;
    end if;
    return jsonb_build_object('room_id', r.id);
  end if;

  if exists (select 1 from public.checklist_rooms x where x.phase <> 'closed' and v_uid = any (x.member_ids)) then
    raise exception 'Você já está em uma sala aberta. Saia dela antes de abrir outra.' using errcode = '42501';
  end if;
  if exists (select 1 from public.checklist_rooms x where x.phase <> 'closed' and v_partner = any (x.member_ids))
     or not public.dupla_allowed(v_partner) then
    raise exception 'Não foi possível abrir a sala agora. Combinem pelo chat e tentem de novo.' using errcode = '42501';
  end if;
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  select * into other from public.study_profiles where user_id = v_partner;
  if not found then
    raise exception 'Não foi possível abrir a sala agora. Combinem pelo chat e tentem de novo.' using errcode = '42501';
  end if;

  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := v_partner;
  elsif v_assign = 'ator' then
    v_cand := v_partner; v_eval := v_uid;
  end if;
  select m.id into v_match from public.study_matches m
   where (m.user_a = v_uid and m.user_b = v_partner) or (m.user_a = v_partner and m.user_b = v_uid)
   order by m.created_at desc limit 1;

  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, candidate_id, evaluator_id)
  values (array[v_uid, v_partner], 'roles', 1, v_match, null, v_cand, v_eval)
  returning id into v_room;
  insert into public.study_invites (from_user, to_user, room_id) values (v_uid, v_partner, v_room);
  return jsonb_build_object('room_id', v_room);
end
$function$;
-- função refeita: dupla_room_seen(checklist_rooms,uuid) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.dupla_room_seen(p_room checklist_rooms, p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_room.station_id is not null and p_uid is not null and (
    exists (select 1 from public.checklist_room_station_views v
             where v.station_id = p_room.station_id and v.user_id = p_uid)
    or exists (select 1 from public.checklist_study_sessions s
                where s.station_id = p_room.station_id and s.actor_id = p_uid))
$function$;
-- funções criadas por ela
drop function if exists public.dupla_lock_users(uuid,uuid);
