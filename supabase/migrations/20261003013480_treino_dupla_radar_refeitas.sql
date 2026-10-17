-- =============================================================================
-- Treino em Dupla, radar e convite direto (Etapa 6C, tarefa R1; parte 2 de 2). Número 013480, reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md. Depende da 013470 (colunas allow_direct_invites e kind, dupla_hides).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não cria tabela nem grava dado.
--
-- O QUE FAZ
--  1) Baralho (app_dupla_deck) e escolha (app_dupla_swipe): quem tem bloqueio com a pessoa (o do chat, nos dois sentidos) some do
--     baralho e não forma match; quem está "treinando sozinho" (situação criada por outra frente; aqui só lida) não aparece
--     nem completa match.
--  2) Convites (app_dupla_invites): cada convite ganha "kind" ('match' | 'direto') e "station" { label, number, area,
--     area_code, duration_ms } SEM o nome nem o id da estação (o convidado pode virar o candidato; o tema não vai ao candidato
--     antes do resultado). Convite de quem tem bloqueio com a pessoa não aparece nem pode ser respondido.
--  3) app_dupla_answer_invite: igual, mais a recusa de convite de quem tem bloqueio com a pessoa.
--  4) app_dupla_save_profile: grava "allow_direct_invites" (Permitir convites diretos). app_dupla_profile não muda: já devolve
--     a coluna nova junto do resto do perfil.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_deck() ← 013320 (linhas 168-249); app_dupla_swipe(uuid, text, text) ← 013320 (256-345);
--   app_dupla_invites() ← 013320 (350-370); app_dupla_answer_invite(uuid, boolean) ← 013320 (375-410);
--   app_dupla_save_profile(jsonb) ← 013310 (350-469). Conferido em 17/10: nenhuma migração posterior (013330 a 013410) as refaz.
--
-- COMO DESFAZER: colar de novo as cinco funções da 013320 e da 013310 (os mesmos trechos acima).
-- =============================================================================

-- ---------------------------------------------------------------- 1) baralho
create or replace function public.app_dupla_deck() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  me public.study_profiles;
  v_open jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_hidden integer := 0;
  v_online integer;
  v_today integer;
begin
  perform public.dupla_sweep();
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;

  select jsonb_build_object('id', r.id, 'phase', r.phase,
                            'partner_name', public.dupla_public_name((select x from unnest(r.member_ids) x where x is distinct from v_uid limit 1)))
    into v_open
    from public.checklist_rooms r
   where r.phase <> 'closed' and v_uid = any (r.member_ids)
   order by r.updated_at desc
   limit 1;

  if v_open is null then
    select coalesce(jsonb_agg(x.card order by x.compat desc, x.seen desc) filter (where x.visible), '[]'::jsonb),
           count(*) filter (where not x.visible)
      into v_cards, v_hidden
    from (
      select
        (k.c ->> 'ok')::boolean as visible,
        (k.c ->> 'compat')::integer as compat,
        p.last_seen_at as seen,
        jsonb_build_object(
          'user_id', p.user_id,
          'public_name', p.public_name,
          'school', case when p.show_school then p.school end,
          'city', p.city,
          'exam', p.exam,
          'bio', p.bio,
          'goal', p.goal,
          'areas', to_jsonb(p.areas),
          'role_pref', p.role_pref,
          'pace', p.pace,
          'days', to_jsonb(p.days),
          'shifts', to_jsonb(p.shifts),
          'stats', case when p.show_stats then (
                     select jsonb_build_object('done', count(*), 'avg', round(avg(t.score / nullif(t.max_score, 0) * 10), 2))
                       from public.checklist_study_sessions t where t.doctor_id = p.user_id) end,
          'compat', (k.c ->> 'compat')::integer,
          'reasons', k.c -> 'reasons',
          'online', true
        ) as card
      from public.study_profiles p
      cross join lateral (select public.dupla_compat(me, p) as c) k
      where p.user_id <> v_uid
        and p.radar_visible
        and p.last_seen_at > now() - interval '2 minutes'
        and p.status <> 'fora'
        and p.status <> 'sozinho'
        and public.dupla_allowed(p.user_id)
        and not public.dupla_hides(v_uid, p.user_id)
        and not exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and p.user_id = any (r.member_ids))
        and not exists (select 1 from public.study_swipes s
                        where s.from_user = v_uid and s.to_user = p.user_id and s.created_at > now() - interval '7 days')
    ) x;
  end if;

  select count(*) into v_online
    from public.study_profiles p
   where p.user_id <> v_uid and p.radar_visible and p.last_seen_at > now() - interval '2 minutes' and p.status <> 'fora'
     and public.dupla_allowed(p.user_id) and not public.dupla_hides(v_uid, p.user_id);

  select count(*) into v_today
    from public.study_matches m
   where v_uid in (m.user_a, m.user_b)
     and m.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');

  return jsonb_build_object('cards', v_cards, 'hidden_by_role', v_hidden, 'online', v_online, 'matches_today', v_today,
                            'open_room', v_open, 'server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 2) escolha e match
create or replace function public.app_dupla_swipe(p_to uuid, p_direction text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  me public.study_profiles;
  other public.study_profiles;
  v_theirs public.study_swipes;
  st public.checklist_stations;
  v_station text;
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
  if p_station_id is not null and not exists (
       select 1 from public.checklist_stations s where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff())) then
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;
  -- Bloqueio entre os dois (chat): a escolha não é gravada e não há match; quem escolheu não fica sabendo do motivo.
  if public.dupla_hides(v_uid, p_to) then
    return jsonb_build_object('matched', false);
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
     or other.status = 'sozinho' or me.status = 'sozinho'
     or not public.dupla_allowed(p_to)
     or exists (select 1 from public.checklist_rooms r
                where r.phase <> 'closed' and (v_uid = any (r.member_ids) or p_to = any (r.member_ids))) then
    return jsonb_build_object('matched', false);
  end if;

  -- Estação: a minha, senão a da escolha dele; só aprovada e, se for dos planos Pro/Elite, só com plano pago nos dois.
  v_station := coalesce(p_station_id, v_theirs.station_id);
  if v_station is not null then
    select * into st from public.checklist_stations s
     where s.id = v_station and (s.medical_review = 'approved' or public.is_staff());
    if not found
       or (st.is_pro_only and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(p_to))) then
      v_station := null;
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
  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, candidate_id, evaluator_id, duration_ms)
  values (array[v_uid, p_to], 'roles', 1, v_match, v_station, v_cand, v_eval, v_dur)
  returning id into v_room;
  update public.study_matches set room_id = v_room where id = v_match;
  insert into public.study_invites (from_user, to_user, room_id) values (v_uid, p_to, v_room);

  return jsonb_build_object('matched', true, 'room_id', v_room,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$$;

-- ---------------------------------------------------------------- 3) convites
-- Os convites que chegaram para mim: pendentes, no prazo (60 s) e de sala ainda aberta. Fecha o que venceu antes de ler.
-- → { invites: [{ id, room_id, kind, from: { user_id, public_name }, station, expires_at }], server_now }
create or replace function public.app_dupla_invites() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  perform public.dupla_sweep();
  return jsonb_build_object(
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'room_id', i.room_id, 'kind', i.kind,
               'from', jsonb_build_object('user_id', i.from_user, 'public_name', public.dupla_public_name(i.from_user)),
               'station', case when s.id is null then null else jsonb_build_object(
                            'label', case when m.meta ->> 'number' is not null then 'Estação ' || (m.meta ->> 'number') else 'Estação' end,
                            'number', m.meta -> 'number', 'area', s.area, 'area_code', public.dupla_area_code(s.area),
                            'duration_ms', coalesce(r.duration_ms, s.duration_ms)) end,
               'expires_at', i.expires_at) order by i.created_at desc)
        from public.study_invites i
        join public.checklist_rooms r on r.id = i.room_id and r.phase <> 'closed'
        left join public.checklist_stations s on s.id = r.station_id
        left join lateral (select case when s.id is not null then public.dupla_station_meta(s.id) end as meta) m on true
       where i.to_user = v_uid and i.status = 'pending' and i.expires_at >= now()
         and not public.dupla_hides(v_uid, i.from_user)
    ), '[]'::jsonb),
    'server_now', clock_timestamp()
  );
end
$$;

create or replace function public.app_dupla_answer_invite(p_invite_id uuid, p_accept boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  inv public.study_invites;
  r public.checklist_rooms;
begin
  if p_accept is null then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  select * into inv from public.study_invites where id = p_invite_id and to_user = v_uid for update;
  if not found or public.dupla_hides(v_uid, inv.from_user) then
    raise exception 'Convite não encontrado.' using errcode = '42501';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Convite já respondido.' using errcode = '42501';
  end if;
  if inv.expires_at < now() then
    raise exception 'Convite expirado (60 s).' using errcode = '42501';
  end if;
  select * into r from public.checklist_rooms where id = inv.room_id for update;
  if not found or r.phase = 'closed' then
    raise exception 'Esta sala já foi encerrada.' using errcode = '42501';
  end if;

  if p_accept then
    update public.study_invites set status = 'accepted' where id = inv.id;
    update public.checklist_rooms set rev = rev + 1 where id = r.id;
    return jsonb_build_object('room_id', r.id);
  end if;
  update public.study_invites set status = 'declined' where id = inv.id;
  update public.checklist_rooms set phase = 'closed', closed_reason = 'convite_recusado', call_link = null, rev = rev + 1 where id = r.id;
  return jsonb_build_object('room_id', null);
end
$$;

-- ---------------------------------------------------------------- 4) perfil
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
  v_direct boolean;
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
    elsif k in ('radar_visible', 'show_school', 'show_stats', 'allow_direct_invites') and jsonb_typeof(val) <> 'boolean' then
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
  v_direct := case when p_profile ? 'allow_direct_invites' then (p_profile ->> 'allow_direct_invites')::boolean else coalesce(cur.allow_direct_invites, true) end;

  insert into public.study_profiles (user_id, public_name, school, city, goal, exam, bio, areas, role_pref, pace, days, shifts,
                                     radar_visible, show_school, show_stats, allow_direct_invites)
  values (v_uid, v_name, v_school, v_city, v_goal, v_exam, v_bio, v_areas, v_role, v_pace, v_days, v_shifts,
          v_radar, v_show_school, v_show_stats, v_direct)
  on conflict (user_id) do update set
    public_name = excluded.public_name, school = excluded.school, city = excluded.city, goal = excluded.goal,
    exam = excluded.exam, bio = excluded.bio, areas = excluded.areas, role_pref = excluded.role_pref, pace = excluded.pace,
    days = excluded.days, shifts = excluded.shifts, radar_visible = excluded.radar_visible,
    show_school = excluded.show_school, show_stats = excluded.show_stats,
    allow_direct_invites = excluded.allow_direct_invites;

  return public.app_dupla_profile();
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_dupla_deck() from public, anon;
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.app_dupla_invites() from public, anon;
revoke execute on function public.app_dupla_answer_invite(uuid, boolean) from public, anon;
revoke execute on function public.app_dupla_save_profile(jsonb) from public, anon;
