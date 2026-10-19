-- DESFAZER da 20261003014130_treino_dupla_fluxo_convite.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014150 → 014130): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- No fim, acrescentado à mão (o gerador não recria função apagada): dupla_invite_core de 5 argumentos volta da 014000, depois de a de 6 sair.
-- função refeita: app_dupla_invite(uuid,text) volta como era antes desta migração (definição da 014000)
CREATE OR REPLACE FUNCTION public.app_dupla_invite(p_to uuid, p_station_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return public.dupla_invite_core(public.dupla_assert_access(), p_to, p_station_id, false);
end
$function$;
-- função refeita: app_dupla_radar(text,text) volta como era antes desta migração (definição da 014000)
CREATE OR REPLACE FUNCTION public.app_dupla_radar(p_station_id text DEFAULT NULL::text, p_aba text DEFAULT 'online'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  me public.study_profiles;
  st public.checklist_stations;
  v_open jsonb;
  v_people jsonb := '[]'::jsonb;
  v_online integer;
  v_me_pro boolean := public.tutor_is_pro(v_uid);
  v_mp jsonb;
begin
  if p_aba is null or p_aba not in ('online', 'atores', 'perto') then
    raise exception 'Aba inválida.' using errcode = '22023';
  end if;
  perform public.dupla_sweep();
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  v_mp := public.dupla_place(me.city);
  if p_station_id is not null then
    select * into st from public.checklist_stations s
     where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff());
    if not found then
      raise exception 'Estação não encontrada.' using errcode = '22023';
    end if;
  end if;

  select jsonb_build_object('id', r.id, 'phase', r.phase,
                            'partner_name', public.dupla_public_name((select x from unnest(r.member_ids) x where x is distinct from v_uid limit 1)))
    into v_open
    from public.checklist_rooms r
   where r.phase <> 'closed' and v_uid = any (r.member_ids)
   order by r.updated_at desc
   limit 1;

  select coalesce(jsonb_agg(z.person order by z.prox, z.rank, z.compat desc nulls last, z.seen desc), '[]'::jsonb)
    into v_people
  from (
    select x.person, x.compat, x.seen, case when x.state = 'livre' then 0 else 1 end as rank,
           case when p_aba = 'perto' and x.near = 'cidade' then 0 when p_aba = 'perto' then 1 else 0 end as prox
    from (
      select
        (k.c ->> 'compat')::integer as compat,
        p.last_seen_at as seen,
        s.state,
        n.near,
        jsonb_build_object(
          'near', n.near,
          'user_id', p.user_id,
          'public_name', p.public_name,
          'handle', p.handle,
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
          'compat', case when (k.c ->> 'ok')::boolean then (k.c ->> 'compat')::integer end,
          'reasons', case when (k.c ->> 'ok')::boolean then k.c -> 'reasons' else '[]'::jsonb end,
          'online', true,
          'state', s.state,
          'can_invite', w.why is null,
          'why_not', w.why
        ) as person
      from public.study_profiles p
      cross join lateral (select public.dupla_compat(me, p) as c) k
      cross join lateral (select public.dupla_near(v_mp, public.dupla_place(p.city)) as near) n
      cross join lateral (
        select case when p.status = 'sozinho' then 'sozinho'
                    when p.status = 'em_estacao' or exists (
                           select 1 from public.checklist_rooms r where r.phase <> 'closed' and p.user_id = any (r.member_ids)) then 'em_sala'
                    else 'livre' end as state
      ) s
      cross join lateral (
        select case
          when s.state = 'em_sala' then 'Em sala.'
          when s.state = 'sozinho' then 'Treinando sozinho.'
          when not p.allow_direct_invites or public.dupla_blocked(v_uid, p.user_id)
               or exists (select 1 from public.study_invites i where i.to_user = p.user_id and i.status = 'pending' and i.expires_at > now())
            then 'Não recebe convites.'
          when p_station_id is not null and st.is_pro_only and not v_me_pro then 'Estação exclusiva dos planos Pro e Elite.'
          when p_station_id is not null and st.is_pro_only and not public.tutor_is_pro(p.user_id) then 'Não recebe convites.'
        end as why
      ) w
      where p.user_id <> v_uid
        and p.radar_visible
        and p.last_seen_at > now() - interval '2 minutes'
        and p.status <> 'fora'
        and public.dupla_allowed(p.user_id)
        and not public.dupla_hides(v_uid, p.user_id)
        and (p_aba = 'online'
             or (p_aba = 'atores' and p.role_pref in ('ator', 'any'))
             or (p_aba = 'perto' and n.near is not null))
    ) x
    order by case when p_aba = 'perto' and x.near = 'cidade' then 0 when p_aba = 'perto' then 1 else 0 end,
             case when x.state = 'livre' then 0 else 1 end, x.compat desc nulls last, x.seen desc
    limit 50
  ) z;

  select count(*) into v_online
    from public.study_profiles p
   where p.user_id <> v_uid and p.radar_visible and p.last_seen_at > now() - interval '2 minutes' and p.status <> 'fora'
     and public.dupla_allowed(p.user_id) and not public.dupla_hides(v_uid, p.user_id);

  return jsonb_build_object('people', v_people, 'online', v_online, 'open_room', v_open,
                            'needs_city', (p_aba = 'perto' and v_mp is null),
                            'me', jsonb_build_object('radar_visible', me.radar_visible, 'allow_direct_invites', me.allow_direct_invites),
                            'server_now', clock_timestamp());
end
$function$;
-- função refeita: app_dupla_invites() volta como era antes desta migração (definição da 014010)
CREATE OR REPLACE FUNCTION public.app_dupla_invites()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
-- função refeita: app_dupla_link_lookup(text,text) volta como era antes desta migração (definição da 014080)
CREATE OR REPLACE FUNCTION public.app_dupla_link_lookup(p_handle text, p_station_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  v text := public.dupla_handle_clean(p_handle);
  o public.study_profiles;
  me public.study_profiles;
  c jsonb;
  v_station jsonb := null;
  v_mode text;
  v_why text := null;
begin
  perform public.dupla_requests_sweep();
  select * into o from public.study_profiles where lower(handle) = v;
  if not found or not public.dupla_allowed(o.user_id) or public.dupla_hides(v_uid, o.user_id) then
    return jsonb_build_object('found', false);
  end if;
  if o.user_id = v_uid then
    return jsonb_build_object('found', true, 'self', true, 'person', jsonb_build_object('public_name', o.public_name, 'handle', o.handle));
  end if;
  select * into me from public.study_profiles where user_id = v_uid;
  if found then
    c := public.dupla_compat(me, o);
  end if;
  if p_station_id is not null then
    v_station := public.dupla_station_public(p_station_id);
  end if;

  if not o.allow_direct_invites then
    v_mode := 'indisponivel'; v_why := 'Não recebe convites.';
  elsif v_station is not null and (v_station ->> 'is_pro_only')::boolean
        and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(o.user_id)) then
    v_mode := 'indisponivel'; v_why := 'Estação exclusiva dos planos Pro e Elite.';
  elsif public.dupla_can_receive_now(o.user_id) then
    v_mode := 'convite';
  else
    v_mode := 'pedido';
  end if;

  return jsonb_build_object(
    'found', true, 'self', false, 'mode', v_mode, 'why_not', v_why,
    'station', case when v_station is null then null else v_station - 'id_ok' - 'is_pro_only' end,
    'pending', exists (select 1 from public.study_train_requests r
                        where r.status = 'pending' and r.expires_at > now() and r.from_user = v_uid and r.to_user = o.user_id),
    'incoming', exists (select 1 from public.study_train_requests r
                         where r.status = 'pending' and r.expires_at > now() and r.from_user = o.user_id and r.to_user = v_uid),
    'person', jsonb_build_object(
      'user_id', o.user_id,
      'public_name', o.public_name,
      'handle', o.handle,
      'school', case when o.show_school then o.school end,
      'city', o.city,
      'exam', o.exam,
      'bio', o.bio,
      'goal', o.goal,
      'areas', to_jsonb(o.areas),
      'role_pref', o.role_pref,
      'pace', o.pace,
      'days', to_jsonb(o.days),
      'shifts', to_jsonb(o.shifts),
      'stats', case when o.show_stats then (
                 select jsonb_build_object('done', count(*), 'avg', round(avg(t.score / nullif(t.max_score, 0) * 10), 2))
                   from public.checklist_study_sessions t where t.doctor_id = o.user_id) end,
      'compat', case when c is not null and (c ->> 'ok')::boolean then (c ->> 'compat')::integer end,
      'reasons', case when c is not null and (c ->> 'ok')::boolean then c -> 'reasons' else '[]'::jsonb end,
      'online', coalesce(o.last_seen_at, '-infinity'::timestamptz) > now() - interval '2 minutes' and o.status <> 'fora' and o.radar_visible)
  );
end
$function$;
-- função refeita: app_dupla_link_request(text,text) volta como era antes desta migração (definição da 014080)
CREATE OR REPLACE FUNCTION public.app_dupla_link_request(p_handle text, p_station_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  v text := public.dupla_handle_clean(p_handle);
  o public.study_profiles;
  me public.study_profiles;
  cfg jsonb := public.dupla_radar_settings();
  v_station text := null;
  v_pub jsonb;
  v_n integer;
  v_old timestamptz;
  v_min integer;
  v_last timestamptz;
  v_res jsonb;
  v_id uuid;
  v_exp timestamptz;
begin
  perform public.dupla_requests_sweep();
  select * into o from public.study_profiles where lower(handle) = v;
  if not found or not public.dupla_allowed(o.user_id) or public.dupla_hides(v_uid, o.user_id) then
    raise exception 'Este convite não está disponível.' using errcode = '42501';
  end if;
  if o.user_id = v_uid then
    raise exception 'Este é o seu próprio link.' using errcode = '22023';
  end if;
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  if not o.allow_direct_invites then
    raise exception '% não pode receber convites agora.', o.public_name using errcode = '42501';
  end if;
  if p_station_id is not null then
    v_pub := public.dupla_station_public(p_station_id);
    -- Estação não aprovada só entre duas pessoas da equipe (013405): para o outro, é como se não existisse.
    if v_pub is null or not public.dupla_station_liberada(p_station_id, array[v_uid, o.user_id]) then
      raise exception 'Estação não encontrada.' using errcode = '22023';
    end if;
    if (v_pub ->> 'is_pro_only')::boolean and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(o.user_id)) then
      raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
    end if;
    v_station := p_station_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(v_uid, o.user_id)::text || ':' || greatest(v_uid, o.user_id)::text, 0));

  -- Online e livre: convite direto de 60 s (as regras de quem convida, como pendente e sala aberta, vêm do miolo).
  if public.dupla_can_receive_now(o.user_id) then
    v_res := public.dupla_invite_core(v_uid, o.user_id, v_station, true);
    return v_res || jsonb_build_object('kind', 'convite');
  end if;

  -- Fora do ar ou ocupado: pedido de treino de 24 h.
  if exists (select 1 from public.study_train_requests r where r.status = 'pending' and r.expires_at > now() and r.from_user = v_uid and r.to_user = o.user_id) then
    raise exception 'Você já pediu para treinar com %. Aguarde a resposta.', o.public_name using errcode = '42501';
  end if;
  if exists (select 1 from public.study_train_requests r where r.status = 'pending' and r.expires_at > now() and r.from_user = o.user_id and r.to_user = v_uid) then
    raise exception '% já pediu para treinar com você.', o.public_name using errcode = '42501';
  end if;

  if cfg ->> 'pedidos_por_dia' is not null then
    select count(*), min(r.created_at) into v_n, v_old from public.study_train_requests r
     where r.from_user = v_uid and r.created_at > now() - interval '24 hours';
    if v_n >= (cfg ->> 'pedidos_por_dia')::integer then
      v_min := greatest(1, ceil(extract(epoch from (v_old + interval '24 hours' - now())) / 60.0)::integer);
      raise exception 'Muitos pedidos seguidos. Tente de novo em % min.', v_min using errcode = '42501';
    end if;
  end if;
  if cfg ->> 'espera_min' is not null then
    select max(r.answered_at) into v_last from public.study_train_requests r
     where r.from_user = v_uid and r.to_user = o.user_id and r.status = 'declined'
       and r.answered_at > now() - make_interval(mins => (cfg ->> 'espera_min')::integer);
    if v_last is not null then
      v_min := greatest(1, ceil(extract(epoch from (v_last + make_interval(mins => (cfg ->> 'espera_min')::integer) - now())) / 60.0)::integer);
      raise exception 'Você pediu há pouco para treinar com %. Tente de novo em % min.', o.public_name, v_min using errcode = '42501';
    end if;
  end if;

  insert into public.study_train_requests (from_user, to_user, station_id) values (v_uid, o.user_id, v_station)
  returning id, expires_at into v_id, v_exp;
  update public.study_profiles set last_seen_at = now() where user_id = v_uid;
  return jsonb_build_object('kind', 'pedido', 'request_id', v_id, 'expires_at', v_exp,
                            'partner', jsonb_build_object('user_id', o.user_id, 'public_name', o.public_name));
end
$function$;
-- função refeita: app_dupla_requests() volta como era antes desta migração (definição da 014080)
CREATE OR REPLACE FUNCTION public.app_dupla_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  perform public.dupla_requests_sweep();
  return jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'from', jsonb_build_object('user_id', r.from_user, 'public_name', public.dupla_public_name(r.from_user),
                                          'handle', (select p.handle from public.study_profiles p where p.user_id = r.from_user)),
               'station', case when r.station_id is null then null else public.dupla_station_public(r.station_id) - 'id_ok' - 'is_pro_only' end,
               'expires_at', r.expires_at) order by r.created_at desc)
        from public.study_train_requests r
       where r.to_user = v_uid and r.status = 'pending' and r.expires_at > now()
         and not public.dupla_hides(v_uid, r.from_user)
    ), '[]'::jsonb),
    'server_now', clock_timestamp());
end
$function$;
-- função refeita: app_dupla_answer_request(uuid,boolean) volta como era antes desta migração (definição da 014080)
CREATE OR REPLACE FUNCTION public.app_dupla_answer_request(p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.study_train_requests;
  v_res jsonb;
begin
  if p_accept is null then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  select * into r from public.study_train_requests where id = p_request_id and to_user = v_uid for update;
  if not found or public.dupla_hides(v_uid, r.from_user) then
    raise exception 'Pedido não encontrado.' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'Pedido já respondido.' using errcode = '42501';
  end if;
  if r.expires_at <= now() then
    update public.study_train_requests set status = 'expired' where id = r.id;
    raise exception 'Pedido vencido.' using errcode = '42501';
  end if;

  if not p_accept then
    update public.study_train_requests set status = 'declined', answered_at = now() where id = r.id;
    return jsonb_build_object('room_id', null);
  end if;

  -- Estação que deixou de estar aprovada durante as 24 h: segue sem estação (escolhem na sala), em vez de travar o aceite.
  -- Quem trouxe a estação foi quem pediu (r.from_user): fica como quem a escolheu.
  v_res := public.dupla_invite_core(v_uid, r.from_user,
             case when r.station_id is not null and public.dupla_station_public(r.station_id) is not null
                       and public.dupla_station_liberada(r.station_id, array[v_uid, r.from_user]) then r.station_id end, true, r.from_user);
  update public.study_train_requests
     set status = 'accepted', answered_at = now(), room_id = (v_res ->> 'room_id')::uuid where id = r.id;
  return v_res;
end
$function$;
-- funções criadas por ela
drop function if exists public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean);

-- função apagada por ela: dupla_invite_core de 5 argumentos volta como era (014000, linhas 600-737)
create or replace function public.dupla_invite_core(v_uid uuid, p_to uuid, p_station_id text, p_free boolean, p_chosen_by uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  me public.study_profiles;
  other public.study_profiles;
  cfg jsonb := public.dupla_radar_settings();
  st public.checklist_stations;
  v_station text;
  v_dur integer;
  v_assign text;
  v_cand uuid;
  v_eval uuid;
  v_room uuid;
  v_exp timestamptz;
  v_n integer;
  v_old timestamptz;
  v_min integer;
  v_recusa timestamptz;
begin
  if p_to is null or p_to = v_uid then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-convite:' || v_uid::text, 0));
  -- Quem recebe também é travado: dois convites de pessoas diferentes para a mesma não passam juntos.
  perform pg_advisory_xact_lock(hashtextextended('dupla-recebe:' || p_to::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(v_uid, p_to)::text || ':' || greatest(v_uid, p_to)::text, 0));
  -- Trava por pessoa (013990), a mesma do match e do "Abrir sala" do chat: uma sala aberta por pessoa também na corrida
  -- entre um convite e um match ao mesmo tempo.
  perform public.dupla_lock_users(v_uid, p_to);
  perform public.dupla_sweep();

  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  select * into other from public.study_profiles where user_id = p_to;
  if not found then
    raise exception 'Colega não encontrado.' using errcode = '22023';
  end if;
  -- Um convite pendente por vez (fixo). Vem antes da sala aberta: o convite que espera já tem a sua sala.
  select count(*) into v_n from public.study_invites i
   where i.from_user = v_uid and i.status = 'pending' and i.expires_at > now();
  if v_n >= (cfg ->> 'pendentes')::integer then
    raise exception 'Você já tem um convite aguardando resposta.' using errcode = '42501';
  end if;
  if exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and v_uid = any (r.member_ids)) then
    raise exception 'Você já está em uma sala aberta. Saia dela antes de convidar.' using errcode = '42501';
  end if;

  -- Quem recebe: online, livre, com radar e convites ligados, sem outro convite esperando e sem bloqueio entre os dois.
  if not public.dupla_allowed(p_to)
     or (not other.radar_visible and not p_free)
     or not other.allow_direct_invites
     or coalesce(other.last_seen_at, '-infinity'::timestamptz) <= now() - interval '2 minutes'
     or other.status in ('fora', 'em_estacao', 'sozinho')
     or public.dupla_hides(v_uid, p_to)
     or exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and p_to = any (r.member_ids))
     or exists (select 1 from public.study_invites i where i.to_user = p_to and i.status = 'pending' and i.expires_at > now()) then
    raise exception '% não pode receber convites agora.', other.public_name using errcode = '42501';
  end if;
  -- Crédito do Stazia Match: o meu (mensagem do próprio crédito) e o dele (mensagem neutra). Sem a função do Match, passa.
  if not public.dupla_credit_ok(v_uid) then
    raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
  end if;
  if not public.dupla_credit_ok(p_to) then
    raise exception '% não pode receber convites agora.', other.public_name using errcode = '42501';
  end if;

  -- Estação: liberada para os dois (aprovada, ou não aprovada só entre duas pessoas da equipe: dupla_station_liberada, 013405);
  -- só dos planos Pro/Elite exige plano pago nos dois.
  if p_station_id is not null then
    if not public.dupla_station_liberada(p_station_id, array[v_uid, p_to]) then
      if public.is_staff() and exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
        raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
      end if;
      raise exception 'Estação não encontrada.' using errcode = '22023';
    end if;
    select * into st from public.checklist_stations s where s.id = p_station_id;
    if st.is_pro_only and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(p_to)) then
      raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
    end if;
    v_station := st.id;
    v_dur := case when st.duration_ms between 60000 and 3600000 then st.duration_ms end;
  end if;

  -- Limites (o fechamento preguiçoso acima já cancelou os vencidos). O de 1 pendente é fixo; os outros só valem se o dono preencher.
  select count(*), min(i.created_at) into v_n, v_old from public.study_invites i
   where i.from_user = v_uid and i.kind = 'direto' and i.created_at > now() - interval '1 hour';
  if not p_free and cfg ->> 'por_hora' is not null and v_n >= (cfg ->> 'por_hora')::integer then
    v_min := greatest(1, ceil(extract(epoch from (v_old + interval '1 hour' - now())) / 60.0)::integer);
    raise exception 'Muitos convites seguidos. Tente de novo em % min.', v_min using errcode = '42501';
  end if;
  select count(*), min(i.created_at) into v_n, v_old from public.study_invites i
   where i.from_user = v_uid and i.kind = 'direto' and i.created_at > now() - interval '24 hours';
  if not p_free and cfg ->> 'por_dia' is not null and v_n >= (cfg ->> 'por_dia')::integer then
    v_min := greatest(1, ceil(extract(epoch from (v_old + interval '24 hours' - now())) / 60.0)::integer);
    raise exception 'Muitos convites seguidos. Tente de novo em % min.', v_min using errcode = '42501';
  end if;

  -- Depois de recusa ou vencimento, espera antes de reconvidar a mesma pessoa.
  if not p_free and cfg ->> 'espera_min' is not null then
    select max(i.created_at) into v_recusa
      from public.study_invites i
      join public.checklist_rooms r on r.id = i.room_id
     where i.from_user = v_uid and i.to_user = p_to and i.kind = 'direto'
       and r.closed_reason in ('convite_recusado', 'convite_expirado')
       and i.created_at > now() - make_interval(mins => (cfg ->> 'espera_min')::integer);
    if v_recusa is not null then
      v_min := greatest(1, ceil(extract(epoch from (v_recusa + make_interval(mins => (cfg ->> 'espera_min')::integer) - now())) / 60.0)::integer);
      raise exception 'Você convidou % há pouco. Tente de novo em % min.', other.public_name, v_min using errcode = '42501';
    end if;
  end if;

  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := p_to;
  elsif v_assign = 'ator' then
    v_cand := p_to; v_eval := v_uid;
  end if;

  -- Quem trouxe a estação (quem convida, ou quem pediu o treino pelo link) fica gravado como quem a escolheu: já viu o tema
  -- (aviso "Você já viu esta estação", 013405). Quem recebe o convite vê só "Estação N".
  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, station_chosen_by, candidate_id, evaluator_id, duration_ms)
  values (array[v_uid, p_to], 'roles', 1, null, v_station, case when v_station is not null then coalesce(p_chosen_by, v_uid) end, v_cand, v_eval, v_dur)
  returning id into v_room;
  insert into public.study_invites (from_user, to_user, room_id, kind) values (v_uid, p_to, v_room, 'direto')
  returning expires_at into v_exp;
  update public.study_profiles set last_seen_at = now() where user_id = v_uid;
  -- Pedido de treino por link pendente entre os dois: o convite já resolveu (não fica órfão para aparecer amanhã).
  if to_regclass('public.study_train_requests') is not null then
    execute 'update public.study_train_requests set status = ''canceled'', answered_at = now() where status = ''pending'' and least(from_user, to_user) = least($1, $2) and greatest(from_user, to_user) = greatest($1, $2)' using v_uid, p_to;
  end if;

  return jsonb_build_object('room_id', v_room, 'expires_at', v_exp,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$$;
revoke execute on function public.dupla_invite_core(uuid, uuid, text, boolean, uuid) from public, anon, authenticated;
