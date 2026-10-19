-- =============================================================================
-- Treino em Dupla, FLUXO SIMPLES (desenho de 19/10), parte 3 de 3: INÍCIO, PAPÉIS E RODADAS. Número 014150 (folga do ramo
-- fase2-etapa2, registrado em .tmp-aulas/NUMEROS-MIGRACAO.md). Depende da 013350, 013380, 013405, 013406, 014050 e da 014130.
-- Pode ser colada duas vezes: "drop function if exists" da assinatura antiga, "create or replace", "drop trigger if exists" e
-- permissões. Não grava dado. Nenhuma IA. Cota de créditos continua DESLIGADA (a pré-checagem da 014050 é mantida).
--
-- O QUE FAZ (decisões do dono de 19/10, perguntas 2b, 4 e 7)
--  1) app_dupla_start: UM TOQUE DO ATOR. Só o avaliador, em "setup", com a estação escolhida ('Escolha a estação antes de
--     iniciar.') e o convite da sala já aceito ('O convite ainda não foi aceito.', agora sempre, não só com a cota ligada). Sai a
--     exigência dos dois "prontos". O débito de crédito da 014050 continua igual (só com a cota ligada).
--     APITO E PORTA (dono, 19/10): started_at = toque do ator + 2 s (a duração do apito, APITO_MS de src/novo/app/dupla/porta.js e
--     de playWhistle) e ends_at = started_at + duração. Nesses 2 s, pelo relógio do servidor, os dois aparelhos tocam o apito e
--     só o do candidato abre a porta (DONO-1: o ator fica na tela de trabalho); o cronômetro conta a partir da porta aberta.
--     Durante esses 2 s o candidato não recebe nada da estação (DONO-2: regra da 014140, now() < started_at).
--  2) app_dupla_set_roles / app_dupla_draw_roles: definidos os papéis, a sala vai DIRETO a "setup" (sem "connecting", "pronto"
--     e "confirmar"). O sorteio é de PAPÉIS (não existe sortear estação). Se quem trouxe a estação (station_chosen_by) virar o
--     candidato, a estação é limpa (dono, 19/10: ele já conhece o tema) e o ator escolhe outra.
--  2b) app_dupla_swipe (match): perfil, baralho, compatibilidade e dupla_assign iguais à 014050; a única mudança é a mesma
--     regra: se quem trouxe a estação virar o candidato, a sala nasce sem estação.
--  3) app_dupla_set_station: só o avaliador, em "roles" (com os papéis definidos: estação que caiu, 013406) ou em "setup"; a sala
--     fica em "setup". Mesmas regras de estação (dupla_station_liberada, já treinada na sala, Pro/Elite).
--  4) app_dupla_next_station(p_room_id, p_papel): 'mesmo' (padrão) ou 'trocar'. A rodada seguinte nasce em "setup", com os
--     papéis mantidos ou invertidos e SEM estação: só o ator da rodada escolhe. Mantém a pré-checagem de crédito da 014050. A
--     assinatura antiga (uuid) é apagada; a tela antiga, que chama só com p_room_id, cai no padrão 'mesmo'.
--  5) Gatilho study_invites_accepted_setup: convite ACEITO numa sala em "roles" com os dois papéis definidos (match em que as
--     preferências decidiram, "Abrir sala" do chat, convite por link) leva a sala a "setup". Sem papéis definidos, a sala fica
--     nos papéis até alguém escolher ou sortear (item 2).
--  6) app_dupla_finish e app_dupla_finalize (ordem do controlador, achado da revisão da 014140): durante os 2 s do apito
--     (now() < started_at) o ator não encerra nem envia a nota ('A estação ainda não começou. Espere o apito terminar.'). A
--     avaliação da rodada (checklist_study_sessions, que o candidato lê direto pela API) só nasce no "Enviar a nota"; nos 2 s
--     ela entregaria a estação antes de a porta abrir. Fora isso, iguais à 013350.
--  app_dupla_ready, app_dupla_confirm_roles e app_dupla_connected continuam existindo, sem mudança, para salas antigas.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_start(uuid) ← 014050 (linhas 65-127); app_dupla_swipe(uuid, text, text) ← 014050 (165-293);
--   app_dupla_set_roles(uuid, uuid) e app_dupla_draw_roles(uuid) ← 013350 (322-364); app_dupla_set_station(uuid, text) ← 013405
--   (266-303); app_dupla_finish(uuid) e app_dupla_finalize(uuid, jsonb) ← 013350 (695-714 e 719-807).
--   Apagada: app_dupla_next_station(uuid) (014050, 132-162);
--   nova: app_dupla_next_station(uuid, text). Novas: dupla_invite_accepted_setup() e o gatilho study_invites_accepted_setup.
--
-- COMO DESFAZER: supabase/desfazer/20261003014150_treino_dupla_fluxo_sala.desfazer.sql (apaga o gatilho e as funções novas,
--   volta as refeitas e recria app_dupla_next_station(uuid) da 014050).
-- =============================================================================

drop function if exists public.app_dupla_next_station(uuid);

-- ---------------------------------------------------------------- 2) papéis → preparação (base: 013350)
create or replace function public.app_dupla_set_roles(p_room_id uuid, p_candidate_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  if p_candidate_id is null or not (p_candidate_id = any (r.member_ids)) then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  update public.checklist_rooms
     set candidate_id = p_candidate_id,
         evaluator_id = (select x from unnest(r.member_ids) x where x <> p_candidate_id limit 1),
         -- quem trouxe a estação e virou candidato fica sem ela (já conhece o tema): o ator escolhe outra
         station_id = case when r.station_chosen_by = p_candidate_id then null else station_id end,
         duration_ms = case when r.station_chosen_by = p_candidate_id then null else duration_ms end,
         station_chosen_by = case when r.station_chosen_by = p_candidate_id then null else station_chosen_by end,
         phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

create or replace function public.app_dupla_draw_roles(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_cand uuid;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  v_cand := r.member_ids[1 + floor(random() * 2)::integer];
  update public.checklist_rooms
     set candidate_id = v_cand,
         evaluator_id = (select x from unnest(r.member_ids) x where x <> v_cand limit 1),
         station_id = case when r.station_chosen_by = v_cand then null else station_id end,
         duration_ms = case when r.station_chosen_by = v_cand then null else duration_ms end,
         station_chosen_by = case when r.station_chosen_by = v_cand then null else station_chosen_by end,
         phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 3) estação na preparação (base: 013405)
create or replace function public.app_dupla_set_station(p_room_id uuid, p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  st public.checklist_stations;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles', 'setup'], false);
  if r.candidate_id is null or r.evaluator_id is null then
    raise exception 'Definam os papéis antes de escolher a estação.' using errcode = '55000';
  end if;
  if r.evaluator_id <> v_uid then
    raise exception 'Só o avaliador escolhe a estação.' using errcode = '42501';
  end if;
  if not public.dupla_station_liberada(p_station_id, r.member_ids) then
    if public.is_staff() and exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
      raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
    end if;
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;
  select * into st from public.checklist_stations s where s.id = p_station_id;
  if public.dupla_station_done_in_room(r, st.id) then
    raise exception 'Vocês já treinaram esta estação nesta sala. Escolham outra.' using errcode = '22023';
  end if;
  if st.is_pro_only and not (public.tutor_is_pro(r.member_ids[1]) and public.tutor_is_pro(r.member_ids[2])) then
    raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
  end if;
  update public.checklist_rooms
     set station_id = st.id, station_chosen_by = v_uid,
         duration_ms = case when st.duration_ms between 60000 and 3600000 then st.duration_ms end,
         phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 4) nova rodada: mesmo papel ou trocar (base: 014050)
create or replace function public.app_dupla_next_station(p_room_id uuid, p_papel text default 'mesmo') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_m uuid;
begin
  if p_papel is null or p_papel not in ('mesmo', 'trocar') then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['result'], false);
  if public.credit_ativa() and public.credit_cobra_rodada() then
    foreach v_m in array r.member_ids loop
      if not public.credit_available(v_m, 'match') then
        raise exception 'Não foi possível abrir outra estação agora. Confirmem a cota de hoje e tentem de novo.'
          using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
      end if;
    end loop;
  end if;
  update public.checklist_rooms
     set phase = 'setup', round = round + 1,
         candidate_id = case when p_papel = 'trocar' then r.evaluator_id else r.candidate_id end,
         evaluator_id = case when p_papel = 'trocar' then r.candidate_id else r.evaluator_id end,
         station_id = null, station_chosen_by = null, duration_ms = null,
         confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         started_at = null, ends_at = null, paused_left_ms = null, paused_at = null, paused_total_ms = 0,
         finished_at = null, released_pressings = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 5) convite aceito com papéis definidos → preparação
create or replace function public.dupla_invite_accepted_setup() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.checklist_rooms r
       set phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}', rev = r.rev + 1
     where r.id = new.room_id and r.phase = 'roles'
       and r.candidate_id is not null and r.evaluator_id is not null;
  end if;
  return null;
end
$$;
drop trigger if exists study_invites_accepted_setup on public.study_invites;
create trigger study_invites_accepted_setup after update of status on public.study_invites
  for each row execute function public.dupla_invite_accepted_setup();

-- ---------------------------------------------------------------- 1) início por um toque do ator (base: 014050, linhas 65-127)
create or replace function public.app_dupla_start(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_dur integer;
  v_now timestamptz := now();
  v_cobra boolean;
  v_res jsonb;
  v_x jsonb;
  v_u uuid;
  v_any boolean := false;
  v_hint text;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['setup'], true);
  -- 014150 (fluxo simples): um toque do ator. Sem "pronto" dos dois; precisa da estação e do convite aceito (sempre).
  if r.station_id is null then
    raise exception 'Escolha a estação antes de iniciar.' using errcode = '55000';
  end if;
  if exists (select 1 from public.study_invites i where i.room_id = r.id and i.status = 'pending') then
    raise exception 'O convite ainda não foi aceito.' using errcode = '55000';
  end if;
  v_dur := coalesce(r.duration_ms, (select s.duration_ms from public.checklist_stations s where s.id = r.station_id), 600000);

  -- Crédito dos dois, na mesma transação: ou os dois pagam, ou nenhum paga (e a sala não muda).
  v_cobra := r.round = 1 or public.credit_cobra_rodada();
  if v_cobra and public.credit_ativa() and cardinality(r.member_ids) = 2 then
    -- Só se cobra sala cujo convite foi aceito: um convite pendente venceria (ou seria recusado) no meio da estação e fecharia
    -- uma sala já paga (dupla_sweep e a recusa fecham a sala em qualquer fase).
    if exists (select 1 from public.study_invites i where i.room_id = r.id and i.status = 'pending') then
      raise exception 'O convite ainda não foi aceito.' using errcode = '55000';
    end if;
    begin
      v_res := public.credit_consume_pair(
        'match', r.member_ids[1], r.member_ids[2], 'room', r.id,
        case when r.round = 1 then 'sala:' || r.id::text else 'sala:' || r.id::text || ':r' || r.round::text end, v_now);
    exception when sqlstate '54000' then
      get stacked diagnostics v_hint = pg_exception_hint;
      if v_hint is distinct from 'INSUFFICIENT_CREDITS' then
        raise;
      end if;
      raise exception 'Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.'
        using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
    end;
    foreach v_u in array r.member_ids loop
      v_x := v_res -> v_u::text;
      if v_x ->> 'bucket' is not null then
        insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date, ledger_id)
        values (r.id, v_u, r.round, v_x ->> 'bucket', public.credit_day(v_now), (v_x ->> 'ledger_id')::bigint)
        on conflict (room_id, user_id, round) do nothing;
      end if;
      v_any := v_any or coalesce((v_x ->> 'charged')::boolean, false);
    end loop;
  end if;

  update public.checklist_rooms
     -- 014150: o início fica 2 s à frente (o apito; APITO_MS em src/novo/app/dupla/porta.js): a porta abre durante o apito e o
     -- cronômetro conta a partir da porta aberta, igual nos dois aparelhos (relógio do servidor).
     set phase = 'running', started_at = now() + interval '2 seconds',
         ends_at = now() + interval '2 seconds' + v_dur * interval '1 millisecond',
         paused_left_ms = null, paused_at = null, paused_total_ms = 0, released_pressings = '{}', finished_at = null,
         charged_at = case when v_any then v_now else charged_at end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 2b) match: estação de quem virou candidato (base: 014050, linhas 165-293)
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
  -- Estação da escolha: aprovada, ou não aprovada só entre duas pessoas da equipe.
  if p_station_id is not null and not public.dupla_station_liberada(p_station_id, array[v_uid, p_to]) then
    if public.is_staff() and exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
      raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
    end if;
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;
  -- Bloqueio entre os dois (chat): a escolha não é gravada e não há match; quem escolheu não fica sabendo do motivo.
  if public.dupla_hides(v_uid, p_to) then
    return jsonb_build_object('matched', false);
  end if;
  -- Pré-checagem (sem debitar): sem crédito meu, não há "Estudar junto" (a escolha nem é gravada). "Pular" nunca é barrado.
  if p_direction = 'right' and not public.credit_available(v_uid, 'match') then
    update public.study_profiles set last_seen_at = now(), status = case when status = 'fora' then 'livre' else status end
     where user_id = v_uid;
    return jsonb_build_object('matched', false, 'reason', 'quota');
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
     -- (O outro sem crédito cai aqui, na MESMA resposta de "o outro não escolheu": nada vaza.)
     or not public.credit_available(p_to, 'match')
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
  -- 014150 (dono, 19/10): quem trouxe a estação e virou candidato não fica com ela (já conhece o tema); o ator escolhe outra na
  -- sala. Papéis e o resto do match não mudam.
  if v_station is not null and v_chooser is not null and v_chooser = v_cand then
    v_station := null; v_chooser := null; v_dur := null;
  end if;

  -- Match + sala + convite numa só unidade: se a reserva da pessoa falhar (outra sala aberta que nasceu agora), nada fica.
  -- O mesmo par reusa a conexão (par canônico): não nasce um segundo match dos dois.
  begin
    select m.id into v_match from public.study_matches m
     where least(m.user_a, m.user_b) = least(v_uid, p_to) and greatest(m.user_a, m.user_b) = greatest(v_uid, p_to);
    if not found then
      insert into public.study_matches (user_a, user_b, station_id) values (p_to, v_uid, v_station) returning id into v_match;
    end if;
    insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, station_chosen_by, candidate_id, evaluator_id, duration_ms)
    values (array[v_uid, p_to], 'roles', 1, v_match, v_station, v_chooser, v_cand, v_eval, v_dur)
    returning id into v_room;
    -- Os dois escolheram a mesma estação no Banco: os dois já viram.
    if v_station is not null and p_station_id is not null and v_theirs.station_id = v_station then
      perform public.dupla_room_seen_add(v_room, v_station, p_to, 'escolheu');
    end if;
    update public.study_matches set room_id = v_room, station_id = v_station where id = v_match;
    insert into public.study_invites (from_user, to_user, room_id) values (v_uid, p_to, v_room);
  exception when unique_violation then
    return jsonb_build_object('matched', false);
  end;
  -- Pedido de treino por link pendente entre os dois: o match já resolveu.
  if to_regclass('public.study_train_requests') is not null then
    execute 'update public.study_train_requests set status = ''canceled'', answered_at = now() where status = ''pending'' and least(from_user, to_user) = least($1, $2) and greatest(from_user, to_user) = greatest($1, $2)' using v_uid, p_to;
  end if;

  return jsonb_build_object('matched', true, 'room_id', v_room,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$$;

-- ---------------------------------------------------------------- 6) encerrar e enviar a nota esperam o início marcado (base: 013350, linhas 695-714 e 719-807)
create or replace function public.app_dupla_finish(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['running'], true);
  -- 014150 (ordem do controlador): durante os 2 s do apito (início marcado ainda no futuro) não se encerra nem se envia a nota:
  -- a avaliação da rodada (que o candidato lê direto) entregaria a estação antes de a porta abrir.
  if r.started_at is not null and now() < r.started_at then
    raise exception 'A estação ainda não começou. Espere o apito terminar.' using errcode = '55000';
  end if;
  update public.checklist_rooms
     set phase = 'review', finished_at = now(),
         paused_total_ms = paused_total_ms + case when paused_at is not null
                             then greatest(0, least(extract(epoch from (now() - paused_at)) * 1000, 2147483647))::integer else 0 end,
         paused_at = null, paused_left_ms = null,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

create or replace function public.app_dupla_finalize(p_room_id uuid, p_feedback jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  s public.checklist_study_sessions;
  v_exists boolean;
  c jsonb;
  v_items jsonb;
  v_pos text;
  v_neg text;
  v_gen text;
  v_score numeric;
  v_max numeric;
  v_pct numeric;
  v_answers jsonb;
  v_released jsonb;
  v_ini timestamptz;
  v_fim timestamptz;
  v_used integer;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['review', 'result'], true);
  -- 014150 (ordem do controlador): durante os 2 s do apito (início marcado ainda no futuro) não se encerra nem se envia a nota:
  -- a avaliação da rodada (que o candidato lê direto) entregaria a estação antes de a porta abrir.
  if r.started_at is not null and now() < r.started_at then
    raise exception 'A estação ainda não começou. Espere o apito terminar.' using errcode = '55000';
  end if;
  select * into s from public.checklist_study_sessions where room_id = r.id and round = r.round;
  v_exists := found;
  if r.phase = 'result' then
    if v_exists then
      return public.dupla_room_state(r, v_uid);
    end if;
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  if r.station_id is null then
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;

  v_pos := btrim(case when jsonb_typeof(p_feedback -> 'pos') = 'string' then p_feedback ->> 'pos' else '' end);
  v_neg := btrim(case when jsonb_typeof(p_feedback -> 'neg') = 'string' then p_feedback ->> 'neg' else '' end);
  v_gen := btrim(case when jsonb_typeof(p_feedback -> 'gen') = 'string' then p_feedback ->> 'gen' else '' end);
  if char_length(v_pos) > 1000 or char_length(v_neg) > 1000 or char_length(v_gen) > 1000 then
    raise exception 'Feedback: máximo de 1000 caracteres em cada campo.' using errcode = '22001';
  end if;

  select k.content into c from public.checklist_station_contents k where k.station_id = r.station_id;
  c := coalesce(c, '{}'::jsonb);
  v_items := case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end;

  select coalesce(sum(case when m.grade is not null and jsonb_typeof(i.e -> 'grades' -> m.grade) = 'number'
                           then (i.e -> 'grades' ->> m.grade)::numeric else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(i.e -> 'grades' -> 'correct') = 'number'
                           then (i.e -> 'grades' ->> 'correct')::numeric else 0 end), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', i.e ->> 'id', 'grade', initcap(m.grade), 'subitems', to_jsonb(m.subitems_checked))
                            order by i.n) filter (where m.grade is not null), '[]'::jsonb)
    into v_score, v_max, v_answers
  from jsonb_array_elements(v_items) with ordinality as i(e, n)
  left join public.checklist_room_marks m on m.room_id = r.id and m.round = r.round and m.item_id = i.e ->> 'id';
  v_pct := case when v_max > 0 then round(v_score / v_max * 100, 1) else 0 end;

  -- Só os liberáveis que o avaliador liberou (os iniciais não contam como "liberados").
  select coalesce(jsonb_agg(p.id order by p.n), '[]'::jsonb) into v_released
    from public.dupla_pressings_tela(c) p
   where p.id = any (r.released_pressings) and not p.initially_visible;

  v_fim := coalesce(r.finished_at, now());
  v_ini := coalesce(r.started_at, v_fim);
  v_used := greatest(0, least((extract(epoch from (v_fim - v_ini)) * 1000)::bigint - r.paused_total_ms, 2147483647))::integer;

  if v_exists then
    update public.checklist_study_sessions
       set score_before_review = coalesce(score_before_review, score),
           score = v_score, max_score = v_max, correctness = v_pct, checklist_answers = v_answers,
           station_version = c ->> 'version', feedback_pos = v_pos, feedback_neg = v_neg, feedback_gen = v_gen,
           revised_at = now()
     where id = s.id;
  else
    insert into public.checklist_study_sessions
      (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, pressings_released, checklist_answers,
       score, max_score, correctness, used_ms, station_version, feedback_pos, feedback_neg, feedback_gen)
    values
      (gen_random_uuid()::text, r.station_id, r.id, r.round, r.evaluator_id, r.candidate_id, v_ini, v_fim, v_released, v_answers,
       v_score, v_max, v_pct, v_used, c ->> 'version', v_pos, v_neg, v_gen);
  end if;

  update public.checklist_rooms set phase = 'result', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_dupla_start(uuid) from public, anon;
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.app_dupla_set_roles(uuid, uuid) from public, anon;
revoke execute on function public.app_dupla_draw_roles(uuid) from public, anon;
revoke execute on function public.app_dupla_set_station(uuid, text) from public, anon;
revoke execute on function public.app_dupla_next_station(uuid, text) from public, anon;
revoke execute on function public.app_dupla_finish(uuid) from public, anon;
revoke execute on function public.app_dupla_finalize(uuid, jsonb) from public, anon;
revoke execute on function public.dupla_invite_accepted_setup() from public, anon, authenticated;
