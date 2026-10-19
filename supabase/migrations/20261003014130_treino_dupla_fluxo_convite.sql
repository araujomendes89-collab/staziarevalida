-- =============================================================================
-- Treino em Dupla, FLUXO SIMPLES (desenho aprovado pelo dono em 19/10: docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md),
-- parte 1 de 3: convite e lista. Número 014130, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md (folga do ramo fase2-etapa2).
-- Depende da 014000 (radar, dupla_invite_core), 014010 (convites), 014080 (pedido de 24 h) e da 013405 (dupla_station_liberada).
-- Pode ser colada duas vezes: "drop function if exists" da assinatura antiga, "create or replace" e permissões. Não grava dado.
-- Não abre nada ao aluno (o módulo continua mandado pela chave "treino_dupla", desligada).
--
-- O QUE FAZ (decisões do dono de 19/10, perguntas 1, 2, 6 e 8)
--  1) Convite direto do radar (app_dupla_invite): QUEM CONVIDA É O ATOR/AVALIADOR e quem recebe é o CANDIDATO (ignora role_pref e
--     dupla_assign). A estação é OBRIGATÓRIA ('Escolha a estação antes de convidar.'). A sala nasce direto em "setup" (preparação),
--     sem passar por papéis e conexão; enquanto o convite espera, o ator já lê a estação e "Iniciar" fica recusado até o aceite
--     (014150).
--  2) dupla_invite_core ganha o último argumento p_fixed (padrão falso). A assinatura antiga de 5 argumentos é APAGADA (com as
--     duas, uma chamada de 4 ou 5 argumentos ficaria ambígua). p_fixed falso (papéis pelas preferências, sala em "roles") fica
--     para quem ainda chamar o miolo do jeito antigo; o link do @ deixa de chamá-lo (item 4).
--  3) app_dupla_invites: o convite NÃO leva nada da estação (station sempre nulo; antes ia "Estação N", área e duração) e ganha
--     "role" (o papel de quem recebe na sala: 'candidate' no convite direto).
--  4) CONVITE POR LINK DO @ SAI (dono, 19/10, 2ª rodada): app_dupla_link_lookup, app_dupla_link_request e
--     app_dupla_answer_request recusam ('O convite por link saiu. …', depois do porteiro de acesso); app_dupla_requests devolve
--     a lista vazia. A tabela study_train_requests e o @ ficam como estão (dados antigos inofensivos: nada mais os lê).
--  5) app_dupla_radar: só as abas 'online' e 'perto' ("Perto de você"); a aba 'atores' sai ('Aba inválida.').
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_invite_core ← 014000 (linhas 600-737) + p_fixed; app_dupla_invite ← 014000 (739-745);
--   app_dupla_radar ← 014000 (452-571) sem a aba 'atores'; app_dupla_invites ← 014010 (233-260) sem a estação;
--   app_dupla_link_lookup, app_dupla_link_request, app_dupla_requests e app_dupla_answer_request ← 014080 (recusam / lista
--   vazia). Conferido em 19/10: nenhuma migração depois delas as refaz.
--
-- COMO DESFAZER: supabase/desfazer/20261003014130_treino_dupla_fluxo_convite.desfazer.sql (volta as sete funções da etapa 2,
--   apaga o miolo de 6 argumentos e recria o de 5). Salas e convites já criados ficam.
-- =============================================================================

drop function if exists public.dupla_invite_core(uuid, uuid, text, boolean, uuid);

-- ---------------------------------------------------------------- 3) convites que chegaram para mim (base: 014010)
-- Pendentes, no prazo (60 s) e de sala ainda aberta. Nada da estação (quem recebe pode ser o candidato); "role" é o papel de
-- quem recebe na sala ('candidate' | 'evaluator' | nulo quando o match ainda não decidiu).
-- → { invites: [{ id, room_id, kind, role, from: { user_id, public_name }, station: null, expires_at }], server_now }
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
               'role', case when r.candidate_id = v_uid then 'candidate' when r.evaluator_id = v_uid then 'evaluator' end,
               'from', jsonb_build_object('user_id', i.from_user, 'public_name', public.dupla_public_name(i.from_user)),
               'station', null,
               'expires_at', i.expires_at) order by i.created_at desc)
        from public.study_invites i
        join public.checklist_rooms r on r.id = i.room_id and r.phase <> 'closed'
       where i.to_user = v_uid and i.status = 'pending' and i.expires_at >= now()
         and not public.dupla_hides(v_uid, i.from_user)
    ), '[]'::jsonb),
    'server_now', clock_timestamp()
  );
end
$$;

-- ---------------------------------------------------------------- 4) convite por link do @ sai (base: 014080)
-- O porteiro de acesso vem primeiro (aluno e visitante continuam recebendo a mesma recusa de sempre).
create or replace function public.app_dupla_link_lookup(p_handle text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  raise exception 'O convite por link saiu. Chame o colega pela lista de quem está online.' using errcode = '42501';
end
$$;

create or replace function public.app_dupla_link_request(p_handle text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  raise exception 'O convite por link saiu. Chame o colega pela lista de quem está online.' using errcode = '42501';
end
$$;

create or replace function public.app_dupla_answer_request(p_request_id uuid, p_accept boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  raise exception 'O convite por link saiu. Chame o colega pela lista de quem está online.' using errcode = '42501';
end
$$;

-- Pedidos de 24 h: a lista fica sempre vazia (os antigos ficam guardados e não aparecem). → { requests: [], server_now }
create or replace function public.app_dupla_requests() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  return jsonb_build_object('requests', '[]'::jsonb, 'server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 1) convite direto (base: 014000)
-- Quem convida é o ator e escolhe a estação (obrigatória); quem recebe é o candidato. → { room_id, partner, expires_at }
create or replace function public.app_dupla_invite(p_to uuid, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  return public.dupla_invite_core(public.dupla_assert_access(), p_to, p_station_id, false, null, true);
end
$$;

-- ---------------------------------------------------------------- 2) miolo do convite (base: 014000, linhas 600-737)
create or replace function public.dupla_invite_core(v_uid uuid, p_to uuid, p_station_id text, p_free boolean, p_chosen_by uuid default null,
                                                    p_fixed boolean default false) returns jsonb
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
  -- 014130 (fluxo simples): no convite direto do radar a estação é obrigatória (quem convida é o ator e escolhe a estação).
  if p_fixed and p_station_id is null then
    raise exception 'Escolha a estação antes de convidar.' using errcode = '22023';
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

  -- 014130: no convite direto do radar os papéis são fixos (quem convida é o ator/avaliador; quem recebe, o candidato).
  -- O convite por link e o pedido de 24 h (p_fixed falso) seguem as preferências (dupla_assign), como antes.
  if p_fixed then
    v_cand := p_to; v_eval := v_uid;
  else
    v_assign := public.dupla_assign(me.role_pref, other.role_pref);
    if v_assign = 'candidato' then
      v_cand := v_uid; v_eval := p_to;
    elsif v_assign = 'ator' then
      v_cand := p_to; v_eval := v_uid;
    end if;
  end if;

  -- Quem trouxe a estação (quem convida, ou quem pediu o treino pelo link) fica gravado como quem a escolheu: já viu o tema
  -- (aviso "Você já viu esta estação", 013405). Quem recebe o convite vê só "Estação N".
  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, station_chosen_by, candidate_id, evaluator_id, duration_ms)
  values (array[v_uid, p_to], case when p_fixed then 'setup' else 'roles' end, 1, null, v_station, case when v_station is not null then coalesce(p_chosen_by, v_uid) end, v_cand, v_eval, v_dur)
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

-- ---------------------------------------------------------------- 5) lista (base: 014000, linhas 452-571)
create or replace function public.app_dupla_radar(p_station_id text default null, p_aba text default 'online') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
  if p_aba is null or p_aba not in ('online', 'perto') then
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
        and (p_aba = 'online' or (p_aba = 'perto' and n.near is not null))
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
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.dupla_invite_core(uuid, uuid, text, boolean, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.app_dupla_invite(uuid, text) from public, anon;
revoke execute on function public.app_dupla_invites() from public, anon;
revoke execute on function public.app_dupla_requests() from public, anon;
revoke execute on function public.app_dupla_link_lookup(text, text) from public, anon;
revoke execute on function public.app_dupla_link_request(text, text) from public, anon;
revoke execute on function public.app_dupla_answer_request(uuid, boolean) from public, anon;
revoke execute on function public.app_dupla_radar(text, text) from public, anon;
