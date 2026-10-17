-- =============================================================================
-- Treino em Dupla, etapa 4: sinal de online, baralho, escolha, match, convite e saída da sala.
-- (Plano de 09/10: "migração 6700"; número 9770, no intervalo livre, logo depois da 9760 das telas.)
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não cria tabela, não grava dado e não muda nenhuma
-- função que já existia. Depende da 9750 (perfil de estudo, escolhas, matches, convites e a sala) e da 9760 (dupla_sweep,
-- dupla_room_state, dupla_public_name).
--
-- O QUE FAZ
--  1) Regras do protótipo (match-rules.js do pacote de design) em SQL, sem pessoa de exemplo:
--       dupla_compat (nota 40–99 e razões, vista de quem olha) e dupla_assign (papéis sugeridos pelo match).
--  2) Sinal de online: app_dupla_heartbeat (hora e situação do perfil de estudo; "online" = sinal há menos de 2 minutos).
--  3) Baralho: app_dupla_deck (quem aparece, em que ordem, com a nota e as razões; contadores; sala aberta).
--  4) Escolha: app_dupla_swipe ("Pular" / "Estudar junto"; o segundo "Estudar junto" forma o match, a sala e o convite).
--  5) Convite: app_dupla_invites (os que chegaram) e app_dupla_answer_invite (aceitar ou recusar).
--  6) Saída: app_dupla_leave (fecha a sala para os dois).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: nenhuma. Todas as funções desta migração são novas. Usadas sem mudar:
--   dupla_assert_access, dupla_allowed (9750); dupla_sweep, dupla_room_state, dupla_public_name (9760); tutor_is_pro (…9550,
--   a mais nova); is_staff (…0100).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - "Online" (contador do baralho) exclui quem está "fora" (saiu das telas), como o baralho e o match já fazem.
--  - Com sala aberta, o baralho vem vazio (cards []) e só diz qual é a sala: ninguém escolhe de dentro de uma sala.
--  - "matches hoje" são os matches DA PESSOA (como user_a ou user_b) desde 0 h de Brasília (spec §7), não os de todo mundo.
--  - A estação da sala é a de quem completou o match; sem ela, a do outro. Se a escolhida for só dos planos Pro/Elite e um
--    dos dois não tiver plano pago, a sala nasce sem estação (os dois escolhem na fase dos papéis).
--  - Convite vencido: a resposta recusa com 'Convite expirado (60 s).' (o erro desfaz a chamada); quem fecha a sala é o
--    fechamento preguiçoso (dupla_sweep) na próxima leitura de qualquer um dos dois.
--  - Mensagens novas (para o dono aprovar): 'Convite não encontrado.' e 'Esta sala já foi encerrada.'.
--  - Razão "Prova diferente (…)" só aparece quando o colega informou a prova (sem prova, nada é inventado).
--
-- COMO DESFAZER: apagar as funções criadas aqui (app_dupla_heartbeat(text, uuid), app_dupla_deck(),
--   app_dupla_swipe(uuid, text, text), app_dupla_invites(), app_dupla_answer_invite(uuid, boolean), app_dupla_leave(uuid),
--   dupla_compat(study_profiles, study_profiles), dupla_assign(text, text)). Salas, matches e convites já criados ficam.
-- =============================================================================

-- ---------------------------------------------------------------- 1) regras do protótipo
-- Papéis sugeridos (match-rules.js:42-46). Recebe o papel de quem completou o match e o do outro: med | ator | any.
-- Devolve o papel de quem completou: 'candidato' | 'ator' | null (os dois "qualquer" escolhem na fase dos papéis).
create or replace function public.dupla_assign(p_me text, p_other text) returns text
  language sql immutable security definer set search_path = ''
as $$
  select case
    when p_me = 'med' or (p_me = 'any' and p_other = 'ator') then 'candidato'
    when p_me = 'ator' or (p_me = 'any' and p_other = 'med') then 'ator'
  end
$$;

-- Compatibilidade de p_other vista por p_me (match-rules.js:17-41), em numeric (arredonda como Math.round, limita 40–99):
--   papel 40 (complementar 1; um flexível 0,85; os dois flexíveis 0,7), áreas 25 (em comum ÷ minhas; 0,5 se não escolhi),
--   disponibilidade 20 (0,6 com turno em comum + 0,4 × dias em comum ÷ meus dias, ou 0,2 sem dias), ritmo 10 (igual 1,
--   diferente 0,4), prova 5 (igual 1, diferente 0,5). Mesmo papel específico: { ok: false }.
-- → { ok, compat, kind: complementar | um-flexivel | flexivel | conflito, reasons: [{ icon, text, strong?, weak? }] }
create or replace function public.dupla_compat(p_me public.study_profiles, p_other public.study_profiles) returns jsonb
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  c_short constant jsonb := '{"med": "quer ser médico(a)", "ator": "quer ser ator/avaliador", "any": "topa qualquer papel"}'::jsonb;
  c_long constant jsonb := '{"med": "médico(a)", "ator": "ator/avaliador"}'::jsonb;
  c_chip constant jsonb := '{"CM": "Clínica Médica", "CR": "Cirurgia", "GO": "GO", "PED": "Pediatria", "MFC": "MFC"}'::jsonb;
  c_pace constant jsonb := '{"livre": "Treino livre", "cronometrado": "Cronometrado", "simulacao": "Simulação de prova"}'::jsonb;
  v_first text := split_part(btrim(p_other.public_name), ' ', 1);
  v_kind text;
  v_role numeric;
  v_ca text[];
  v_cs text[];
  v_cd text[];
  v_areas numeric;
  v_time numeric;
  v_pace numeric;
  v_exam numeric;
  v_raw numeric;
  v_reasons jsonb;
begin
  -- Papel é eliminatório.
  if p_me.role_pref <> 'any' and p_other.role_pref <> 'any' then
    if p_me.role_pref = p_other.role_pref then
      return jsonb_build_object('ok', false, 'compat', 0, 'kind', 'conflito', 'reasons', '[]'::jsonb);
    end if;
    v_kind := 'complementar'; v_role := 1;
  elsif p_me.role_pref = 'any' and p_other.role_pref = 'any' then
    v_kind := 'flexivel'; v_role := 0.7;
  else
    v_kind := 'um-flexivel'; v_role := 0.85;
  end if;

  -- Em comum, na ordem de quem olha.
  v_ca := array(select x from unnest(p_me.areas) with ordinality as t(x, n) where x = any (p_other.areas) order by n);
  v_cs := array(select x from unnest(p_me.shifts) with ordinality as t(x, n) where x = any (p_other.shifts) order by n);
  v_cd := array(select x from unnest(p_me.days) with ordinality as t(x, n) where x = any (p_other.days) order by n);

  v_areas := case when cardinality(p_me.areas) > 0 then cardinality(v_ca)::numeric / cardinality(p_me.areas) else 0.5 end;
  v_time := (case when cardinality(v_cs) > 0 then 0.6 else 0 end)
          + (case when cardinality(p_me.days) > 0 then 0.4 * cardinality(v_cd) / cardinality(p_me.days) else 0.2 end);
  v_pace := case when p_me.pace = p_other.pace then 1 else 0.4 end;
  v_exam := case when p_me.exam is not distinct from p_other.exam then 1 else 0.5 end;
  v_raw := 40 * v_role + 25 * v_areas + 20 * v_time + 10 * v_pace + 5 * v_exam;

  -- Razões (match-rules.js:33-39), com o primeiro nome do outro.
  if v_kind = 'complementar' then
    v_reasons := jsonb_build_array(jsonb_build_object(
      'icon', 'arrow-left-right', 'strong', true,
      'text', 'Papéis complementares: você ' || (c_long ->> p_me.role_pref) || ', ' || v_first || ' ' || (c_long ->> p_other.role_pref)));
  elsif v_kind = 'um-flexivel' then
    v_reasons := jsonb_build_array(jsonb_build_object(
      'icon', 'arrow-left-right', 'strong', true,
      'text', case when p_me.role_pref = 'any'
                   then v_first || ' ' || (c_short ->> p_other.role_pref) || '; você topa qualquer papel'
                   else v_first || ' topa qualquer papel' end));
  else
    v_reasons := jsonb_build_array(jsonb_build_object('icon', 'shuffle', 'text', 'Os dois topam qualquer papel'));
  end if;
  if cardinality(v_ca) > 0 then
    v_reasons := v_reasons || jsonb_build_object(
      'icon', 'stethoscope',
      'text', (select string_agg(c_chip ->> a, ' e ' order by n) from unnest(v_ca) with ordinality as t(a, n)) || ' em comum');
  end if;
  if cardinality(v_cs) > 0 then
    v_reasons := v_reasons || jsonb_build_object(
      'icon', 'clock',
      'text', array_to_string(v_cs, ' e ')
              || case when cardinality(v_cd) > 0
                      then ' · ' || cardinality(v_cd) || ' dia' || case when cardinality(v_cd) > 1 then 's' else '' end || ' em comum'
                      else '' end);
  end if;
  if p_me.pace = p_other.pace then
    v_reasons := v_reasons || jsonb_build_object('icon', 'timer', 'text', c_pace ->> p_other.pace);
  end if;
  if p_other.exam is not null and p_me.exam is distinct from p_other.exam then
    v_reasons := v_reasons || jsonb_build_object('icon', 'calendar', 'text', 'Prova diferente (' || p_other.exam || ')', 'weak', true);
  end if;

  return jsonb_build_object('ok', true, 'compat', greatest(40, least(99, round(v_raw)))::integer, 'kind', v_kind, 'reasons', v_reasons);
end
$$;

-- ---------------------------------------------------------------- 2) sinal de online
-- Chamada a cada 45 s nas telas do módulo e ao sair delas ("fora"). Grava a hora e a situação do perfil de estudo; sem perfil
-- não grava nada (e não cria perfil). "em_estacao" só vale com uma sala aberta da pessoa (p_room_id); senão fica "livre".
-- Fecha o que venceu (fechamento preguiçoso). → { server_now }
create or replace function public.app_dupla_heartbeat(p_status text, p_room_id uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------- 3) baralho
-- Quem aparece para mim: outro, com perfil, acesso ao módulo, radar ligado, sinal há menos de 2 minutos e fora de "fora", fora
-- de sala aberta, que eu não escolhi (para nenhum lado) nos últimos 7 dias e que não quer o mesmo papel específico que eu
-- (esses só entram em hidden_by_role). Ordem: maior compatibilidade, depois sinal mais recente. Instituição só com show_school;
-- estações feitas e média só com show_stats; nunca e-mail nem telefone.
-- Com sala aberta minha: cards [] e open_room { id, phase, partner_name } (a tela mostra "Sala aberta com …").
-- → { cards: [DeckCard], hidden_by_role, online, matches_today, open_room, server_now }
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
        and public.dupla_allowed(p.user_id)
        and not exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and p.user_id = any (r.member_ids))
        and not exists (select 1 from public.study_swipes s
                        where s.from_user = v_uid and s.to_user = p.user_id and s.created_at > now() - interval '7 days')
    ) x;
  end if;

  select count(*) into v_online
    from public.study_profiles p
   where p.user_id <> v_uid and p.radar_visible and p.last_seen_at > now() - interval '2 minutes' and p.status <> 'fora'
     and public.dupla_allowed(p.user_id);

  select count(*) into v_today
    from public.study_matches m
   where v_uid in (m.user_a, m.user_b)
     and m.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');

  return jsonb_build_object('cards', v_cards, 'hidden_by_role', v_hidden, 'online', v_online, 'matches_today', v_today,
                            'open_room', v_open, 'server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 4) escolha ("Pular" / "Estudar junto") e match
-- Grava (ou regrava) a minha escolha e o meu sinal. Se foi "Estudar junto" e o outro escolheu "Estudar junto" para mim nos
-- últimos 7 dias, com sinal há menos de 2 minutos (e fora de "fora"), os dois sem sala aberta e os dois com acesso, forma o
-- match: sala (fase dos papéis, rodada 1), match e convite de 60 s para o outro. Trava o par antes de ler, para dois
-- "Estudar junto" no mesmo instante darem um match só. → { matched: false } ou { matched: true, room_id, partner }
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

-- ---------------------------------------------------------------- 5) convite
-- Os convites que chegaram para mim: pendentes, no prazo (60 s) e de sala ainda aberta. Fecha o que venceu antes de ler.
-- → { invites: [{ id, room_id, from: { user_id, public_name }, expires_at }], server_now }
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
               'id', i.id, 'room_id', i.room_id,
               'from', jsonb_build_object('user_id', i.from_user, 'public_name', public.dupla_public_name(i.from_user)),
               'expires_at', i.expires_at) order by i.created_at desc)
        from public.study_invites i
       where i.to_user = v_uid and i.status = 'pending' and i.expires_at >= now()
         and exists (select 1 from public.checklist_rooms r where r.id = i.room_id and r.phase <> 'closed')
    ), '[]'::jsonb),
    'server_now', clock_timestamp()
  );
end
$$;

-- Responder um convite meu. Aceitar: o convite vira "accepted" e a sala soma 1 ao rev → { room_id }. Recusar: "declined" e a
-- sala fecha (convite_recusado, sem link) → { room_id: null }. Vencido: 'Convite expirado (60 s).' (a sala fecha na próxima
-- leitura, pelo fechamento preguiçoso). Já respondido: 'Convite já respondido.'.
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
  if not found then
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

-- ---------------------------------------------------------------- 6) sair da sala
-- Fecha a sala para os dois (motivo "saiu"), apaga o link da chamada, cancela o convite pendente e soma 1 ao rev. Sala que já
-- estava fechada não muda (nem o motivo). Devolve o estado da sala (RoomState).
create or replace function public.app_dupla_leave(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.checklist_rooms where id = p_room_id and v_uid = any (member_ids) for update;
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  if r.phase <> 'closed' then
    update public.study_invites set status = 'canceled' where room_id = r.id and status = 'pending';
    update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu', call_link = null, rev = rev + 1 where id = r.id;
    select * into r from public.checklist_rooms where id = p_room_id;
  end if;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access barra o resto.
-- As de apoio: só rodam dentro das funções do servidor (security definer).
revoke execute on function public.app_dupla_heartbeat(text, uuid) from public, anon;
revoke execute on function public.app_dupla_deck() from public, anon;
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.app_dupla_invites() from public, anon;
revoke execute on function public.app_dupla_answer_invite(uuid, boolean) from public, anon;
revoke execute on function public.app_dupla_leave(uuid) from public, anon;
revoke execute on function public.dupla_compat(public.study_profiles, public.study_profiles) from public, anon, authenticated;
revoke execute on function public.dupla_assign(text, text) from public, anon, authenticated;
