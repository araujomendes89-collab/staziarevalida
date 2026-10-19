-- DESFAZER da 20261003014150_treino_dupla_fluxo_sala.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014150 → 014130): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- No fim, acrescentado à mão (o gerador não recria função apagada): app_dupla_next_station(uuid) volta da 014050, depois de a (uuid, text) sair.
-- gatilhos criados por ela
drop trigger if exists study_invites_accepted_setup on public.study_invites;
-- função refeita: app_dupla_set_roles(uuid,uuid) volta como era antes desta migração (definição da 013350)
CREATE OR REPLACE FUNCTION public.app_dupla_set_roles(p_room_id uuid, p_candidate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         confirmed_ids = '{}', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$function$;
-- função refeita: app_dupla_draw_roles(uuid) volta como era antes desta migração (definição da 013350)
CREATE OR REPLACE FUNCTION public.app_dupla_draw_roles(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         confirmed_ids = '{}', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$function$;
-- função refeita: app_dupla_swipe(uuid,text,text) volta como era antes desta migração (definição da 014050)
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
$function$;
-- função refeita: app_dupla_finalize(uuid,jsonb) volta como era antes desta migração (definição da 013350)
CREATE OR REPLACE FUNCTION public.app_dupla_finalize(p_room_id uuid, p_feedback jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
-- função refeita: app_dupla_finish(uuid) volta como era antes desta migração (definição da 013350)
CREATE OR REPLACE FUNCTION public.app_dupla_finish(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['running'], true);
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
$function$;
-- função refeita: app_dupla_set_station(uuid,text) volta como era antes desta migração (definição da 013405)
CREATE OR REPLACE FUNCTION public.app_dupla_set_station(p_room_id uuid, p_station_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  st public.checklist_stations;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
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
         confirmed_ids = '{}', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$function$;
-- função refeita: app_dupla_start(uuid) volta como era antes desta migração (definição da 014050)
CREATE OR REPLACE FUNCTION public.app_dupla_start(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not (r.member_ids <@ r.ready_ids) then
    raise exception 'Os dois precisam estar prontos.' using errcode = '55000';
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
     set phase = 'running', started_at = now(), ends_at = now() + v_dur * interval '1 millisecond',
         paused_left_ms = null, paused_at = null, paused_total_ms = 0, released_pressings = '{}', finished_at = null,
         charged_at = case when v_any then v_now else charged_at end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$function$;
-- funções criadas por ela
drop function if exists public.app_dupla_next_station(uuid,text);
drop function if exists public.dupla_invite_accepted_setup();
drop function if exists public.dupla_room_trouxe(public.checklist_rooms,uuid);

-- função apagada por ela: app_dupla_next_station(uuid) volta como era (014050, linhas 132-162)
create or replace function public.app_dupla_next_station(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_m uuid;
begin
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
     set phase = 'roles', round = round + 1,
         candidate_id = null, evaluator_id = null,
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
revoke execute on function public.app_dupla_next_station(uuid) from public, anon;
