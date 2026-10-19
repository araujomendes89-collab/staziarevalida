-- =============================================================================
-- JUNÇÃO DA ETAPA 2 (fase2-etapa2, 19/10/2026): renumerada de 013407 para 013990, para ficar DEPOIS da 013980 (a ordem dos
-- arquivos passa a ser a mesma da produção, onde a 2ª fase base já está gravada). Ordem: 013990 (3ª leva), radar 014000/014010,
-- Stazia Match 014020–014070, convite por link 014080, treino sozinho 014090–014120.
-- Revisada e testada na junção: sem mudança de texto; o convite direto do radar (014000) passa a usar a mesma trava por pessoa.
-- Treino em Dupla: correções da revisão antes de publicar a 2ª fase, 3ª leva (17/10). (Número reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md: 013990, depois da 013406.)
-- Depende da 013300 (sala, avaliações), 013320 (escolhas e match), 013330 (tentativas do treino sozinho), 013370 (chat),
-- 013405 (quem já viu, escolha e match) e 013406 (aviso em qualquer sala).
-- Pode ser colada duas vezes: "create or replace function" e permissões. Não cria estação, pessoa nem nota. Nenhuma IA.
--
-- REGRA DO DONO: o candidato NUNCA fica sabendo o tema, o nome ou o id da estação antes do resultado da rodada. Quem já viu a
-- estação pode ser candidato, com o aviso "Você já viu esta estação".
--
-- O QUE FAZ
--  1) QUEM JÁ VIU, TAMBÉM COMO CANDIDATA E NO TREINO SOZINHO. dupla_room_seen (aviso me.seen_station / partner.seen_station de
--     dupla_room_state) passa a contar, além do que a 013406 já contava (escolheu a estação ou foi avaliadora, em qualquer
--     sala):
--       a) avaliações em que a PESSOA foi a candidata (checklist_study_sessions com doctor_id = pessoa e a mesma estação): ela
--          já viu o nome e o tema no resultado da rodada;
--       b) tentativas do treino sozinho da própria pessoa na mesma estação (station_attempts com user_id = pessoa): ela
--          escolheu a estação no catálogo, com o nome. A tabela só existe depois da 013330: a checagem usa to_regclass e, sem
--          a tabela (desfazer da 013330), simplesmente não conta.
--     Continua devolvendo só verdadeiro/falso sobre a estação da própria sala: nunca diz QUAL estação é. Sai de "sql stable"
--     para "plpgsql stable" só por causa da checagem da tabela (a função não grava nada).
--  2) CORRIDA DE DUAS SALAS PARA A MESMA PESSOA. A trava de antes era por PAR (dupla-par:A:B). Se A curtia B ao mesmo tempo em que
--     C curtia A, as duas chamadas tomavam travas diferentes (A-B e A-C), as duas viam "A sem sala aberta" e criavam duas salas
--     abertas com A. Agora app_dupla_swipe e app_dupla_chat_room (as únicas funções que criam sala) tomam, logo depois da trava
--     do par e ANTES de olhar se há sala aberta, uma trava por USUÁRIO (pg_advisory_xact_lock) para cada um dos dois, sempre
--     na mesma ordem (menor uuid, depois o maior), pela função de apoio nova dupla_lock_users(uuid, uuid). Sem deadlock: toda
--     chamada pega primeiro a trava do par e depois as dos usuários em ordem crescente de uuid, então não há ciclo de espera.
--     Escolhi trava (e não gatilho ou índice único) porque a regra "uma sala aberta por pessoa" é sobre uma LISTA (member_ids,
--     índice gin) e o fechamento da sala é por fase: um índice único não a expressa, e um gatilho de "BEFORE INSERT" só é
--     seguro se também tomar a trava, e ainda mudaria o erro que os testes existentes esperam ("sala aberta" devolvida como
--     matched=false / mensagem do chat). A trava não muda nenhuma mensagem nem nenhuma tabela.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_room_seen(checklist_rooms, uuid) ← 013406 (igual, mais doctor_id e station_attempts);
--   app_dupla_swipe(uuid, text, text) ← 013405 (igual, mais dupla_lock_users);
--   app_dupla_chat_room(uuid) ← 013370 (igual, mais dupla_lock_users).
--   Nova: dupla_lock_users(uuid, uuid). Nenhuma coluna nem tabela nova.
--
-- RECOLAR: colar de novo uma migração ANTERIOR do Treino (013300 a 013406) volta as versões antigas destas funções.
--   Recolar sempre a cadeia inteira, na ordem, até esta (013990).
--
-- COMO DESFAZER: colar de novo dupla_room_seen da 013406, app_dupla_swipe da 013405 e app_dupla_chat_room da 013370;
--   apagar dupla_lock_users(uuid, uuid).
-- =============================================================================

-- ---------------------------------------------------------------- 2) trava por usuário (nova)
-- Toma, até o fim da transação, a trava de cada um dos dois usuários, sempre na mesma ordem. Só funções de sala a chamam.
create or replace function public.dupla_lock_users(p_a uuid, p_b uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_a is not null then
    perform pg_advisory_xact_lock(hashtextextended('dupla-usuario:' || least(p_a, coalesce(p_b, p_a))::text, 0));
  end if;
  if p_b is not null and p_b is distinct from p_a then
    perform pg_advisory_xact_lock(hashtextextended('dupla-usuario:' || greatest(p_a, p_b)::text, 0));
  end if;
end
$$;

-- ---------------------------------------------------------------- 1) quem já viu (base: 013406)
-- A pessoa já viu a estação ATUAL desta sala? Escolheu ou foi avaliadora (em qualquer sala), foi candidata numa avaliação,
-- ou treinou a estação sozinha. Só verdadeiro/falso: nunca diz qual estação é.
create or replace function public.dupla_room_seen(p_room public.checklist_rooms, p_uid uuid) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_visto boolean;
begin
  if p_room.station_id is null or p_uid is null then
    return false;
  end if;
  select exists (select 1 from public.checklist_room_station_views v
                  where v.station_id = p_room.station_id and v.user_id = p_uid)
      or exists (select 1 from public.checklist_study_sessions s
                  where s.station_id = p_room.station_id and p_uid in (s.actor_id, s.doctor_id))
    into v_visto;
  if v_visto then
    return true;
  end if;
  -- Treino sozinho (013330): a tabela pode não existir neste banco.
  if to_regclass('public.station_attempts') is not null then
    execute 'select exists (select 1 from public.station_attempts a where a.station_id = $1 and a.user_id = $2)'
      into v_visto using p_room.station_id, p_uid;
  end if;
  return coalesce(v_visto, false);
end
$$;

-- ---------------------------------------------------------------- 2) escolha e match (base: 013405)
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
$$;

-- ---------------------------------------------------------------- 2) "Abrir sala" no chat (base: 013370)
create or replace function public.app_dupla_chat_room(p_chat_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
  perform public.dupla_lock_users(v_uid, v_partner);
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
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access barra o resto. As de apoio: só por dentro.
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.app_dupla_chat_room(uuid) from public, anon;
revoke execute on function public.dupla_room_seen(public.checklist_rooms, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_lock_users(uuid, uuid) from public, anon, authenticated;
