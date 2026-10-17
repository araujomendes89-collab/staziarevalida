-- =============================================================================
-- Stazia Match, Etapas M2c e M2e: UMA PESSOA, UMA SALA ABERTA, e UM PAR, UMA CONEXÃO, garantidos no banco. Sem crédito.
-- (Plano de 12/10: "migrações 9972 e 9973", juntas; este arquivo usa 013510, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013300 (checklist_rooms com phase/member_ids, study_matches), 013320 (app_dupla_swipe) e 013500 (nada daqui usa crédito).
-- Pode ser colada duas vezes: "create table if not exists", "create or replace function", "drop trigger if exists", "create
-- unique index if not exists" e permissões; o preenchimento das reservas é idempotente. Não grava dado de aluno além das reservas.
--
-- O QUE FAZ
--  1) study_room_claims (user_id PRIMARY KEY, room_id): a reserva da pessoa enquanto está numa sala aberta. A chave primária é
--     a garantia, no banco, de "no máximo uma sala aberta por pessoa", mesmo com duas escolhas ao mesmo tempo (A com B e A com C).
--     Um gatilho em checklist_rooms mantém as reservas: depois de INSERT de uma sala aberta reserva os membros (em ordem crescente
--     de UUID, para duas transações nunca se travarem em cruz); depois de a fase virar "closed" solta as reservas da sala. Assim
--     todo caminho (escolha, convite direto do radar, aceite, saída, varredura, recusa) fica coberto sem refazer cada função.
--     Violação → 'Você já está em uma sala.' (23505, hint ALREADY_IN_SESSION). Outro gatilho recusa trocar os membros de uma sala aberta.
--     Preenchimento das salas que já existem abertas: a mais antiga fica com a pessoa; se outra sala aberta disputar a mesma
--     pessoa, essa outra FECHA (closed_reason 'sem_sinal'). Hoje não há dado publicado, então nada fecha.
--  2) Par canônico: índice único em (menor uuid, maior uuid) de study_matches = uma conexão por par, na ordem que for. A
--     migração RECUSA ser colada se achar o mesmo par duas vezes (com o aviso e como resolver); não apaga nada sozinha.
--  3) app_dupla_swipe refeita: o segundo "Estudar junto" do mesmo par REUSA a conexão (study_matches) e cria só a sala nova e o
--     convite de 60 s; study_matches.room_id passa a ser "a sala mais recente" e station_id "a estação mais recente". Se a
--     reserva da pessoa falhar (corrida), devolve { matched: false } sem gravar match, sala nem convite.
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - O plano mandava refazer também app_dupla_answer_invite "para traduzir a violação". Não é preciso: a sala (e as reservas)
--    nascem na escolha; aceitar só marca o convite. Fica fora desta migração (menos conflito com o grupo do radar).
--  - O contador "matches hoje" do baralho (app_dupla_deck, 013320) conta linhas de study_matches; com a conexão reusada, o
--    segundo encontro do mesmo par no mesmo dia não soma. Não mexi no baralho (peça do radar); anotado para a junção.
--  - Salas fechadas já não prendem ninguém. Salas em "result" CONTINUAM abertas até alguém sair (como antes: a escolha já
--    barrava "sala aberta" com phase <> 'closed').
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: app_dupla_swipe(uuid, text, text) ← 013320 (igual, mais o reuso do par e a
--   corrida das reservas). Novas: dupla_room_claims() (gatilho). Usadas sem mudar: dupla_assert_access, dupla_sweep,
--   dupla_assign, dupla_allowed, tutor_is_pro.
--
-- JUNÇÃO COM OUTROS GRUPOS: app_dupla_swipe é peça comum (radar, créditos). Esta é a base; a 013520 refaz a partir dela.
--
-- COMO DESFAZER: apagar os gatilhos checklist_rooms_claims e checklist_rooms_members_guard, as funções dupla_room_claims() e dupla_room_members_guard(), o índice study_matches_par_uniq e a
--   tabela study_room_claims; colar de novo app_dupla_swipe da 013320.
-- =============================================================================

-- ---------------------------------------------------------------- 1) reservas por pessoa
create table if not exists public.study_room_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id uuid not null references public.checklist_rooms (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists study_room_claims_room_idx on public.study_room_claims (room_id);
alter table public.study_room_claims enable row level security;
revoke all on public.study_room_claims from public, anon, authenticated;

create or replace function public.dupla_room_claims() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.phase = 'closed' and new.phase <> 'closed') then
    if new.phase <> 'closed' then
      begin
        -- Em ordem crescente de UUID: duas transações com pessoas em comum nunca se esperam em cruz.
        insert into public.study_room_claims (user_id, room_id)
        select m.u, new.id from (select distinct x as u from unnest(new.member_ids) x where x is not null order by x) m;
      exception when unique_violation then
        raise exception 'Você já está em uma sala.' using errcode = '23505', hint = 'ALREADY_IN_SESSION';
      end;
    end if;
  elsif tg_op = 'UPDATE' and new.phase = 'closed' and old.phase <> 'closed' then
    delete from public.study_room_claims where room_id = new.id;
  end if;
  return null;
end
$$;
revoke execute on function public.dupla_room_claims() from public, anon, authenticated;

-- Os membros de uma sala aberta não mudam (as reservas por pessoa seguem o INSERT; hoje nenhuma função troca membros).
create or replace function public.dupla_room_members_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.member_ids is distinct from old.member_ids and old.phase <> 'closed' then
    raise exception 'Os membros de uma sala aberta não mudam.' using errcode = '55000';
  end if;
  return new;
end
$$;
revoke execute on function public.dupla_room_members_guard() from public, anon, authenticated;
drop trigger if exists checklist_rooms_members_guard on public.checklist_rooms;
create trigger checklist_rooms_members_guard before update of member_ids on public.checklist_rooms
  for each row execute function public.dupla_room_members_guard();

drop trigger if exists checklist_rooms_claims on public.checklist_rooms;
create trigger checklist_rooms_claims after insert or update of phase on public.checklist_rooms
  for each row execute function public.dupla_room_claims();

-- Preenchimento (idempotente): a sala aberta mais antiga fica com a pessoa; a outra que a disputar fecha.
do $$
declare
  r record;
begin
  for r in select id, member_ids from public.checklist_rooms where phase <> 'closed' order by created_at, id loop
    if exists (select 1 from public.study_room_claims c where c.user_id = any (r.member_ids) and c.room_id <> r.id) then
      update public.checklist_rooms
         set phase = 'closed', closed_reason = 'sem_sinal', call_link = null, rev = rev + 1
       where id = r.id;
    else
      insert into public.study_room_claims (user_id, room_id)
      select m.u, r.id from (select distinct x as u from unnest(r.member_ids) x where x is not null order by x) m
      on conflict (user_id) do nothing;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------- 2) par canônico único
do $$
begin
  if exists (select 1 from public.study_matches group by least(user_a, user_b), greatest(user_a, user_b) having count(*) > 1) then
    raise exception 'Existem matches repetidos do mesmo par em study_matches. Junte-os antes de colar esta migração (uma conexão por par): select least(user_a, user_b), greatest(user_a, user_b), count(*) from public.study_matches group by 1, 2 having count(*) > 1;'
      using errcode = '23505';
  end if;
end
$$;
create unique index if not exists study_matches_par_uniq on public.study_matches (least(user_a, user_b), greatest(user_a, user_b));

-- ---------------------------------------------------------------- 3) escolha ("Pular" / "Estudar junto") e match (base: 013320)
-- Igual à 013320, com duas mudanças: (a) o par que já tem conexão a REUSA (e atualiza sala e estação mais recentes);
-- (b) a corrida das reservas (a mesma pessoa em dois matches ao mesmo tempo) vira { matched: false }, sem gravar nada do match.
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
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
