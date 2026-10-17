-- =============================================================================
-- Stazia Match, Etapas M2a e M2b: o crédito dos DOIS sai no início confirmado da sala, e a pré-checagem ao formar o match.
-- (Plano de 12/10: "migrações 9970 e 9971", juntas; este arquivo usa 013520, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013350 (app_dupla_start), 013380 (rodadas: "Treinar outra estação"), 013490/013500 (livro e funções) e 013510
-- (reservas por pessoa, app_dupla_swipe com o par canônico).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não grava dado. Nenhuma IA. Sem pagamento.
-- COTA DESLIGADA (creditos.ativa = false, o padrão): tudo se comporta como antes desta migração (nada debita, nada limita).
--
-- O QUE FAZ
--  1) app_dupla_start (início da estação, só o avaliador, com os dois prontos): NA MESMA TRANSAÇÃO debita 1 crédito de CADA UM
--     dos dois (credit_consume_pair: trava em ordem de UUID, confere os dois antes de gravar). Falta de saldo de qualquer um:
--     NINGUÉM paga, a sala NÃO muda e os dois recebem a MESMA mensagem neutra
--     'Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.' (hint INSUFFICIENT_CREDITS). Grava uma linha em
--     study_room_charges por aluno (equipe: bucket 'unlimited', sem lançamento) e checklist_rooms.charged_at.
--       - Chave por aluno: 'sala:<sala>:<aluno>' (rodada 1). Repetir NUNCA debita de novo (chave única + chave primária).
--       - "Treinar outra estação" (rodada 2 em diante, 013380) só cobra se creditos.match.cobra_rodada_extra = true (padrão
--         falso); então a chave é 'sala:<sala>:r<n>:<aluno>' e cada rodada tem a sua linha em study_room_charges.
--       - Chamar start de novo (clique duplo, outra aba, depois de timeout) continua recusado pela fase ('Esta ação não vale
--         nesta fase da sala.'), como na 013350: nunca debita duas vezes.
--       - Sair da sala depois de iniciar, fechar por falta de sinal, convite vencido/recusado: NÃO devolvem (app_dupla_leave e
--         dupla_sweep ficam como estão). Estorno só manual pela Administração (013530).
--  2) Pré-checagem (spec §3.4), sem debitar: app_dupla_swipe e app_dupla_answer_invite conferem o crédito ANTES de formar o par.
--       - "Estudar junto" de quem está sem crédito: { matched: false, reason: 'quota' } (a tela mostra "Sua cota de matches
--         acabou"); a escolha NÃO é gravada. "Pular" nunca é barrado.
--       - Quando o outro está sem crédito: { matched: false } IDÊNTICO a "o outro não escolheu" (não vaza que ele escolheu nem
--         que está sem crédito).
--       - Aceitar um convite sem crédito meu: 'Sua cota de matches acabou' (INSUFFICIENT_CREDITS). O crédito de quem convidou NÃO é
--         conferido ao aceitar (a resposta revelaria que ele está sem crédito); o início confere os dois. Recusar nunca é barrado.
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - O plano mandava refazer também dupla_room_state para devolver "charged". Não refiz: é peça comum (cartão, radar) e a tela
--    não precisa; quem quiser ver a cobrança lê app_credit_state. A sala NUNCA traz saldo, limite nem o motivo do outro.
--  - "Não foi possível formar a dupla agora." (hint PAIR_UNAVAILABLE) NÃO é usada: nem no "Estudar junto" (a resposta tem de ser
--    idêntica à de "o outro não escolheu") nem ao aceitar (revelaria o saldo de quem convidou). O texto fica reservado na tela.
--  - Com a cota ligada, o início exige que o convite da sala já tenha sido aceito ('O convite ainda não foi aceito.'). Achado da
--    revisão de segurança: sem isso, um convite pendente vencia (61 s) ou era recusado no meio da estação e fechava uma sala já paga.
--    Com a cota desligada, o início segue como antes.
--  - Escolha de quem está sem crédito não é gravada (sem "interesse parado" que forme match de surpresa no dia seguinte).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_start(uuid) ← 013350 (igual, mais o débito dos dois);
--   app_dupla_swipe(uuid, text, text) ← 013510 (igual, mais a pré-checagem);
--   app_dupla_answer_invite(uuid, boolean) ← 013320 (igual, mais a pré-checagem ao aceitar).
--   Usadas sem mudar: dupla_room_for_action, dupla_room_need, dupla_room_state (013350), credit_* (013500).
--
-- JUNÇÃO COM OUTROS GRUPOS: app_dupla_swipe, app_dupla_answer_invite e app_dupla_start são peças comuns. Quando existir o
--   CONVITE DIRETO do radar (app_dupla_invite), ele precisa chamar credit_available para os DOIS antes de criar a sala (mesmo
--   padrão do swipe) e responder igual ao "indisponível" sem dizer o motivo. A reserva por pessoa (013510) já cobre a sala.
--
-- COMO DESFAZER: colar de novo app_dupla_start da 013350, app_dupla_swipe da 013510 e app_dupla_answer_invite da 013320.
--   (Cobranças já feitas ficam no livro; devolvê-las é decisão do dono.)
-- =============================================================================

-- ---------------------------------------------------------------- 1) início da estação (base: 013350)
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
  if not (r.member_ids <@ r.ready_ids) then
    raise exception 'Os dois precisam estar prontos.' using errcode = '55000';
  end if;
  v_dur := coalesce(r.duration_ms, (select s.duration_ms from public.checklist_stations s where s.id = r.station_id), 600000);

  -- Crédito dos dois, na mesma transação: ou os dois pagam, ou nenhum paga (e a sala não muda).
  v_cobra := r.round = 1 or coalesce(public.credit_cfg() -> 'match' -> 'cobra_rodada_extra' = 'true'::jsonb, false);
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
$$;

-- ---------------------------------------------------------------- 2) escolha com pré-checagem (base: 013510)
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
  -- (O outro sem crédito cai aqui, na MESMA resposta de "o outro não escolheu": nada vaza.)
  if not coalesce(other.last_seen_at > now() - interval '2 minutes' and other.status <> 'fora', false)
     or not public.dupla_allowed(p_to)
     or not public.credit_available(p_to, 'match')
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

  -- Match + sala + convite numa só unidade: se a reserva da pessoa falhar (outra sala aberta que nasceu agora), nada fica.
  begin
    select m.id into v_match from public.study_matches m
     where least(m.user_a, m.user_b) = least(v_uid, p_to) and greatest(m.user_a, m.user_b) = greatest(v_uid, p_to);
    if not found then
      insert into public.study_matches (user_a, user_b, station_id) values (p_to, v_uid, v_station) returning id into v_match;
    end if;
    insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, candidate_id, evaluator_id, duration_ms)
    values (array[v_uid, p_to], 'roles', 1, v_match, v_station, v_cand, v_eval, v_dur)
    returning id into v_room;
    update public.study_matches set room_id = v_room, station_id = v_station where id = v_match;
    insert into public.study_invites (from_user, to_user, room_id) values (v_uid, p_to, v_room);
  exception when unique_violation then
    return jsonb_build_object('matched', false);
  end;

  return jsonb_build_object('matched', true, 'room_id', v_room,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$$;

-- ---------------------------------------------------------------- 3) responder convite com pré-checagem (base: 013320)
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
    -- Pré-checagem (sem debitar), só do MEU lado. O lado de quem convidou não é conferido aqui (a resposta diria que ele está sem
    -- crédito); o início confere os dois, com a mensagem neutra.
    if not public.credit_available(v_uid, 'match') then
      raise exception 'Sua cota de matches acabou' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
    end if;
    update public.study_invites set status = 'accepted' where id = inv.id;
    update public.checklist_rooms set rev = rev + 1 where id = r.id;
    return jsonb_build_object('room_id', r.id);
  end if;
  update public.study_invites set status = 'declined' where id = inv.id;
  update public.checklist_rooms set phase = 'closed', closed_reason = 'convite_recusado', call_link = null, rev = rev + 1 where id = r.id;
  return jsonb_build_object('room_id', null);
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_dupla_start(uuid) from public, anon;
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.app_dupla_answer_invite(uuid, boolean) from public, anon;
