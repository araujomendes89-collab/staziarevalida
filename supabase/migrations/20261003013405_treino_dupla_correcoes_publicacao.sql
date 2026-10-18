-- =============================================================================
-- Treino em Dupla: correções da revisão antes de publicar a 2ª fase (17/10). (Número reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md: 013405, depois da 013400.)
-- Depende da 013300 (sala, avaliações), 013320 (escolhas e match), 013340 (exportação das salas), 013350 (estado da sala e
-- ações), 013380 (estação e confirmação) e da …4600 (user_is_staff).
-- Pode ser colada duas vezes: "create table if not exists", "create or replace function", "drop trigger if exists",
-- "on conflict do nothing" e permissões. Não cria estação, pessoa nem nota. Nenhuma IA.
--
-- REGRA DO DONO: o candidato NUNCA fica sabendo o tema, o nome ou o id da estação antes do resultado da rodada (nem por tela,
-- nem por resposta de função, nem pela exportação, nem por tentativa e erro). Quem escolheu a estação, ou já a viu como
-- avaliador, pode ser candidato, mas recebe o aviso "Você já viu esta estação" (decisão de 16/10).
--
-- O QUE FAZ
--  1) QUEM JÁ VIU A ESTAÇÃO DA SALA (achados 1, 2 e 4). Tabela nova checklist_room_station_views (sala, estação, pessoa,
--     como viu: 'escolheu' | 'avaliador'). Uma linha por (sala, estação, pessoa), que nunca sai enquanto a sala existir.
--     Por que tabela e não uma coluna uuid[] na sala: a estação pode ser trocada várias vezes na fase dos papéis (A escolhe Y,
--     troca por X, os papéis viram, B escolhe Y de novo). Uma lista única por sala ou daria aviso falso (viu X, a sala está em
--     Y) ou perderia quem viu Y antes da troca. Guardando por estação, o aviso vale exatamente para a estação atual.
--     Quem entra na lista, por um gatilho na sala (checklist_rooms_station_views, depois de criar a sala ou de mudar estação,
--     avaliador ou quem escolheu), em qualquer caminho que exista hoje ou venha a existir:
--       - o avaliador, sempre que a sala tem estação e avaliador (ele recebe o nome na hora);
--       - quem escolheu a estação (station_chosen_by): na sala (app_dupla_set_station) ou no Banco de estações (match).
--     No match (app_dupla_swipe), a sala passa a gravar station_chosen_by = quem forneceu a estação; se os dois tinham
--     escolhido a mesma estação, os dois entram.
--     Trocar os papéis depois de escolhida a estação continua permitido (decisão de 16/10: os dois escolhem os papéis), mas
--     quem passou por avaliador fica na lista: se voltar a candidato, recebe o aviso.
--  2) ESTADO DA SALA (dupla_room_state, base 013350): sai "me.picked_station" (olhava as escolhas do Banco de estações, que o
--     candidato podia gravar à vontade para testar estações até o aviso acender: achado 2). Entram:
--       - me.seen_station: a estação ATUAL da sala está na lista de quem já viu, para mim. Só informa sobre a estação da
--         própria sala, e só verdadeiro se eu já a vi (escolhi ou fui avaliador). O candidato não muda a estação (só o
--         avaliador), e nada que ele grave fora da sala mexe na lista: não há como testar.
--       - partner.seen_station: verdadeiro só quando o parceiro é o CANDIDATO e já viu a estação atual (o avaliador fica
--         sabendo, para combinarem trocar de estação). Para o candidato, este campo é sempre falso (o parceiro dele é o
--         avaliador).
--     O nome e o id continuam só para o avaliador e, no resultado, para os dois (v_named, igual à 013350). Já ter visto NÃO
--     faz o candidato receber o nome.
--  3) EXPORTAÇÃO (dupla_export_rooms, base 013340; achado 3). Lista as colunas da sala (sem to_jsonb). station_id e os ids
--     verdadeiros dos impressos liberados só saem a quem pode saber o tema da rodada atual: o avaliador, quem está na lista
--     de quem já viu esta estação, ou qualquer um dos dois quando a rodada chegou ao resultado (fase 'result' ou avaliação da
--     rodada gravada). Nos outros casos (inclusive sala FECHADA antes do resultado: 'saiu', 'sem_sinal', convite) o candidato
--     recebe a sala sem station_id e com os impressos liberados pela chave de tela ('d1', 'd2'…), como a tela.
--     Cada sala leva também "station_views": as minhas linhas da lista (estação, como, quando), só as minhas (já vistas).
--     app_export_my_data (versão final da 013370, com 'declarations' e 'study_chat') NÃO muda: ela já lê as salas por
--     dupla_export_rooms(); as avaliações (checklist_study_sessions) só nascem no resultado.
--  4) ESTAÇÃO SEM APROVAÇÃO MÉDICA (achado 5). Nova regra única dupla_station_liberada(estação, membros): aprovada pela
--     revisão médica, ou, se não aprovada, só quando TODOS da sala são da equipe (administrador ou editor). Vale em
--     app_dupla_set_station, app_dupla_confirm_roles (por garantia: a estação pode ter voltado a pendente) e app_dupla_swipe
--     (a escolha com estação e a sala do match). Antes valia "aprovada ou quem escolhe é da equipe", e a equipe podia levar
--     estação pendente a um aluno.
--     Equipe escolhendo estação pendente para treinar com aluno: 'Estação ainda sem aprovação médica: só dá para treinar
--     entre a equipe.' Aluno: continua 'Estação não encontrada.' (não diz que a estação existe).
--  (O achado 6, o cabeçalho da 013330, foi corrigido no próprio arquivo: ela é toda repetível.)
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_room_state(checklist_rooms, uuid) ← 013350 (igual, menos picked_station, mais seen_station em me e partner);
--   app_dupla_set_station(uuid, text) ← 013380 (igual, mais a regra do item 4);
--   app_dupla_confirm_roles(uuid) ← 013380 (igual, mais a regra do item 4);
--   app_dupla_swipe(uuid, text, text) ← 013320 (igual, mais a regra do item 4, station_chosen_by e quem já viu);
--   dupla_export_rooms() ← 013340 (colunas listadas e a regra do item 3).
--   Novas: tabela checklist_room_station_views; dupla_station_liberada(text, uuid[]), dupla_room_seen(checklist_rooms, uuid),
--   dupla_room_seen_add(uuid, text, uuid, text), dupla_room_views_track() e o gatilho checklist_rooms_station_views.
--   Usadas sem mudar: dupla_assert_access, dupla_station_meta, dupla_area_code (013300); dupla_sweep, dupla_public_name,
--   dupla_assign (013310, 013320); dupla_pressings_tela, dupla_room_for_action, dupla_room_need (013350);
--   dupla_station_done_in_room (013380); tutor_is_pro, user_is_staff (…4600); dupla_allowed (013300).
--
-- RECOLAR: colar de novo uma migração ANTERIOR do Treino (013300 a 013400) volta as versões antigas destas funções.
--   Recolar sempre a cadeia inteira, na ordem, até esta (013405).
--
-- COMO DESFAZER: apagar o gatilho checklist_rooms_station_views, as funções novas e a tabela checklist_room_station_views;
--   colar de novo dupla_room_state e app_dupla_room_content da 013350/013380, app_dupla_set_station e
--   app_dupla_confirm_roles da 013380, app_dupla_swipe da 013320 e dupla_export_rooms da 013340.
-- =============================================================================

-- ---------------------------------------------------------------- 1) quem já viu a estação da sala
create table if not exists public.checklist_room_station_views (
  room_id uuid not null references public.checklist_rooms (id) on delete cascade,
  station_id text not null references public.checklist_stations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  how text not null check (how in ('escolheu', 'avaliador')),
  seen_at timestamptz not null default now(),
  primary key (room_id, station_id, user_id)
);
create index if not exists checklist_room_station_views_user_idx on public.checklist_room_station_views (user_id);
-- Fechada para aluno e visitante (acesso por linha ligado, sem política, sem permissão): só as funções leem e gravam.
alter table public.checklist_room_station_views enable row level security;
revoke all on table public.checklist_room_station_views from public, anon, authenticated;

-- Grava que a pessoa já viu a estação nesta sala (a primeira forma fica).
create or replace function public.dupla_room_seen_add(p_room_id uuid, p_station_id text, p_user uuid, p_how text) returns void
  language sql security definer set search_path = ''
as $$
  insert into public.checklist_room_station_views (room_id, station_id, user_id, how)
  select p_room_id, p_station_id, p_user, p_how
   where p_room_id is not null and p_station_id is not null and p_user is not null
     and exists (select 1 from public.checklist_stations s where s.id = p_station_id)
     and exists (select 1 from auth.users u where u.id = p_user)
  on conflict (room_id, station_id, user_id) do nothing
$$;

-- A pessoa já viu a estação ATUAL desta sala?
create or replace function public.dupla_room_seen(p_room public.checklist_rooms, p_uid uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_room.station_id is not null and p_uid is not null and exists (
    select 1 from public.checklist_room_station_views v
     where v.room_id = p_room.id and v.station_id = p_room.station_id and v.user_id = p_uid)
$$;

-- Gatilho: a sala tem estação → quem escolheu e o avaliador entram na lista.
create or replace function public.dupla_room_views_track() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.station_id is not null then
    perform public.dupla_room_seen_add(new.id, new.station_id, new.station_chosen_by, 'escolheu');
    perform public.dupla_room_seen_add(new.id, new.station_id, new.evaluator_id, 'avaliador');
  end if;
  return null;
end
$$;
drop trigger if exists checklist_rooms_station_views on public.checklist_rooms;
create trigger checklist_rooms_station_views
  after insert or update of station_id, evaluator_id, station_chosen_by on public.checklist_rooms
  for each row execute function public.dupla_room_views_track();

-- Salas que já existirem (nenhuma em produção na publicação; vale para recolar): mesma regra do gatilho.
insert into public.checklist_room_station_views (room_id, station_id, user_id, how)
select r.id, r.station_id, r.station_chosen_by, 'escolheu'
  from public.checklist_rooms r
 where r.station_id is not null and r.station_chosen_by is not null
   and exists (select 1 from public.checklist_stations s where s.id = r.station_id)
   and exists (select 1 from auth.users u where u.id = r.station_chosen_by)
on conflict (room_id, station_id, user_id) do nothing;
insert into public.checklist_room_station_views (room_id, station_id, user_id, how)
select r.id, r.station_id, r.evaluator_id, 'avaliador'
  from public.checklist_rooms r
 where r.station_id is not null and r.evaluator_id is not null
   and exists (select 1 from public.checklist_stations s where s.id = r.station_id)
   and exists (select 1 from auth.users u where u.id = r.evaluator_id)
on conflict (room_id, station_id, user_id) do nothing;

-- ---------------------------------------------------------------- 4) estação liberada para a sala
-- Aprovada pela revisão médica; não aprovada só quando todos da sala são da equipe (administrador ou editor).
create or replace function public.dupla_station_liberada(p_station_id text, p_members uuid[]) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.checklist_stations s
     where s.id = p_station_id
       and (s.medical_review = 'approved'
            or (coalesce(cardinality(p_members), 0) > 0
                and not exists (select 1 from unnest(p_members) m where m is null or not public.user_is_staff(m)))))
$$;

-- ---------------------------------------------------------------- 2) estado da sala (base: 013350)
create or replace function public.dupla_room_state(p_room public.checklist_rooms, p_uid uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  st public.checklist_stations;
  v_meta jsonb;
  v_station jsonb := null;
  v_named boolean := p_room.evaluator_id is not null and p_uid = p_room.evaluator_id or p_room.phase = 'result';
  v_released jsonb := to_jsonb(p_room.released_pressings);
  v_partner uuid := (select x from unnest(p_room.member_ids) x where x is distinct from p_uid limit 1);
  v_me_seen boolean;
  v_partner_seen boolean;
  v_seen integer;
  v_my_pref text;
  v_their_pref text;
  v_note text := null;
  v_closed_by jsonb := null;
  v_short constant jsonb := '{"med": "quer ser médico(a)", "ator": "quer ser ator/avaliador", "any": "topa qualquer papel"}'::jsonb;
begin
  if p_room.station_id is not null then
    select * into st from public.checklist_stations where id = p_room.station_id;
    if found then
      v_meta := public.dupla_station_meta(st.id);
      v_station := jsonb_build_object(
        'label', case when v_meta ->> 'number' is not null then 'Estação ' || (v_meta ->> 'number') else 'Estação' end,
        'area', st.area, 'area_code', public.dupla_area_code(st.area),
        'number', v_meta -> 'number', 'edition', v_meta -> 'edition', 'reapplication', v_meta -> 'reapplication',
        'institution', st.institution, 'duration_ms', st.duration_ms, 'is_pro_only', st.is_pro_only
      );
      if v_named then
        v_station := v_station || jsonb_build_object('id', st.id, 'name', st.name);
      else
        -- Quem não vê o nome recebe os impressos liberados pela chave de tela ('d<n>', n contínuo), nunca pelo id verdadeiro.
        select coalesce(jsonb_agg('d' || p.screen_number order by p.screen_number), '[]'::jsonb) into v_released
          from public.dupla_pressings_tela((select k.content from public.checklist_station_contents k where k.station_id = st.id)) p
         where p.id = any (p_room.released_pressings) and not p.initially_visible;
      end if;
    end if;
  end if;

  -- Já viu a estação ATUAL desta sala (escolheu ou foi avaliador nela). Só a lista da própria sala; nada de fora conta.
  v_me_seen := coalesce(public.dupla_room_seen(p_room, p_uid), false);
  -- O parceiro só conta quando ele é o candidato (o avaliador fica sabendo; para o candidato isto é sempre falso).
  v_partner_seen := coalesce(v_partner is not null and v_partner = p_room.candidate_id and public.dupla_room_seen(p_room, v_partner), false);

  select greatest(0, least(extract(epoch from (now() - p.last_seen_at)) * 1000, 2147483647))::integer into v_seen
    from public.study_profiles p where p.user_id = v_partner;

  -- Faixa "Definido pelo match": rodada 1, sala do match, fase dos papéis e o match teve sugestão (não são os dois "qualquer").
  if p_room.round = 1 and p_room.match_id is not null and p_room.phase = 'roles' then
    select p.role_pref into v_my_pref from public.study_profiles p where p.user_id = p_uid;
    select p.role_pref into v_their_pref from public.study_profiles p where p.user_id = v_partner;
    if v_my_pref is not null and v_their_pref is not null and not (v_my_pref = 'any' and v_their_pref = 'any') then
      v_note := 'Definido pelo match: você ' || (v_short ->> v_my_pref) || ' e '
                || split_part(btrim(public.dupla_public_name(v_partner)), ' ', 1) || ' ' || (v_short ->> v_their_pref)
                || '. Vocês ainda podem trocar.';
    end if;
  end if;

  -- Quem encerrou: só quando a pessoa saiu ou recusou o convite (nos outros fechamentos ninguém "encerrou").
  if p_room.phase = 'closed' and p_room.closed_reason in ('saiu', 'convite_recusado') and p_room.updated_by is not null then
    v_closed_by := jsonb_build_object('user_id', p_room.updated_by, 'public_name', public.dupla_public_name(p_room.updated_by),
                                      'me', p_room.updated_by = p_uid);
  end if;

  return jsonb_build_object(
    'id', p_room.id,
    'rev', p_room.rev,
    'phase', p_room.phase,
    'round', p_room.round,
    'server_now', clock_timestamp(),
    'station', v_station,
    'duration_ms', coalesce(p_room.duration_ms, st.duration_ms),
    'me', jsonb_build_object(
      'user_id', p_uid,
      'public_name', public.dupla_public_name(p_uid),
      'role', case when p_uid = p_room.candidate_id then 'candidate' when p_uid = p_room.evaluator_id then 'evaluator' end,
      'confirmed', p_uid = any (p_room.confirmed_ids),
      'connected', p_uid = any (p_room.connected_ids),
      'ready', p_uid = any (p_room.ready_ids),
      'seen_station', v_me_seen
    ),
    'partner', jsonb_build_object(
      'user_id', case when exists (select 1 from auth.users u where u.id = v_partner) then v_partner end,
      'public_name', public.dupla_public_name(v_partner),
      'role', case when v_partner = p_room.candidate_id then 'candidate' when v_partner = p_room.evaluator_id then 'evaluator' end,
      'confirmed', coalesce(v_partner = any (p_room.confirmed_ids), false),
      'connected', coalesce(v_partner = any (p_room.connected_ids), false),
      'ready', coalesce(v_partner = any (p_room.ready_ids), false),
      'seen_ms_ago', v_seen,
      'seen_station', v_partner_seen
    ),
    'match_note', v_note,
    'invite_pending', exists (select 1 from public.study_invites i
                              where i.room_id = p_room.id and i.status = 'pending' and i.expires_at >= now()),
    'call_link', p_room.call_link,
    'started_at', p_room.started_at,
    'ends_at', p_room.ends_at,
    'paused_left_ms', p_room.paused_left_ms,
    'paused_at', p_room.paused_at,
    'finished_at', p_room.finished_at,
    'released_pressings', v_released,
    'closed_reason', p_room.closed_reason,
    'closed_by', v_closed_by
  );
end
$$;

-- ---------------------------------------------------------------- 4) estação na sala (base: 013380)
-- Só o avaliador escolhe (ou troca) a estação, e só depois dos papéis. Novo: estação não aprovada só com todos da equipe.
create or replace function public.app_dupla_set_station(p_room_id uuid, p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
$$;

-- Confirmar papéis e estação (base: 013380). Novo: a estação precisa seguir liberada para esta sala.
create or replace function public.app_dupla_confirm_roles(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_ids uuid[];
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  if r.station_id is null then
    raise exception 'Escolha a estação antes de confirmar.' using errcode = '55000';
  end if;
  if r.candidate_id is null or r.evaluator_id is null then
    raise exception 'Definam os papéis antes de confirmar.' using errcode = '55000';
  end if;
  if not public.dupla_station_liberada(r.station_id, r.member_ids) then
    raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
  end if;
  if public.dupla_station_done_in_room(r, r.station_id) then
    raise exception 'Vocês já treinaram esta estação nesta sala. Escolham outra.' using errcode = '22023';
  end if;
  if v_uid = any (r.confirmed_ids) then
    return public.dupla_room_state(r, v_uid);
  end if;
  v_ids := r.confirmed_ids || v_uid;
  update public.checklist_rooms
     set confirmed_ids = v_ids,
         phase = case when member_ids <@ v_ids then 'connecting' else phase end,
         connected_ids = case when member_ids <@ v_ids then '{}' else connected_ids end,
         ready_ids = case when member_ids <@ v_ids then '{}' else ready_ids end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 1) e 4) escolha e match (base: 013320)
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

-- ---------------------------------------------------------------- 3) exportação das salas (base: 013340)
-- Só as salas de quem chama (visitante: lista vazia). Colunas listadas. station_id e ids verdadeiros dos impressos só a quem
-- pode saber o tema da rodada atual (avaliador, quem já viu esta estação, ou rodada que chegou ao resultado).
create or replace function public.dupla_export_rooms() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with eu as (select (select auth.uid()) as uid),
  salas as (
    select t.*,
           (t.station_id is not null and (
              eu.uid = t.evaluator_id
              or t.phase = 'result'
              or exists (select 1 from public.checklist_study_sessions s where s.room_id = t.id and s.round = t.round)
              or exists (select 1 from public.checklist_room_station_views v
                          where v.room_id = t.id and v.station_id = t.station_id and v.user_id = eu.uid))) as ve_tema,
           eu.uid as quem
      from public.checklist_rooms t, eu
     where eu.uid is not null and eu.uid = any (t.member_ids)
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', x.id, 'member_ids', x.member_ids, 'phase', x.phase, 'round', x.round, 'closed_reason', x.closed_reason,
             'match_id', x.match_id, 'candidate_id', x.candidate_id, 'evaluator_id', x.evaluator_id,
             'station_chosen_by', x.station_chosen_by,
             'confirmed_ids', x.confirmed_ids, 'connected_ids', x.connected_ids, 'ready_ids', x.ready_ids,
             'call_link', x.call_link, 'duration_ms', x.duration_ms, 'started_at', x.started_at, 'ends_at', x.ends_at,
             'paused_left_ms', x.paused_left_ms, 'paused_at', x.paused_at, 'paused_total_ms', x.paused_total_ms,
             'finished_at', x.finished_at, 'rev', x.rev, 'updated_by', x.updated_by,
             'created_at', x.created_at, 'updated_at', x.updated_at,
             'station_views', (select coalesce(jsonb_agg(jsonb_build_object('station_id', v.station_id, 'how', v.how, 'seen_at', v.seen_at)
                                                         order by v.seen_at, v.station_id), '[]'::jsonb)
                                 from public.checklist_room_station_views v where v.room_id = x.id and v.user_id = x.quem)
           )
           || case when x.ve_tema
                   then jsonb_build_object('station_id', x.station_id, 'released_pressings', to_jsonb(x.released_pressings))
                   else jsonb_build_object('released_pressings', case when x.station_id is null then '[]'::jsonb else (
                          select coalesce(jsonb_agg('d' || p.screen_number order by p.screen_number), '[]'::jsonb)
                            from public.dupla_pressings_tela((select k.content from public.checklist_station_contents k
                                                               where k.station_id = x.station_id)) p
                           where p.id = any (x.released_pressings) and not p.initially_visible) end)
              end
           order by x.created_at), '[]'::jsonb)
  from salas x
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access barra o resto. As de apoio: só por dentro.
revoke execute on function public.app_dupla_set_station(uuid, text) from public, anon;
revoke execute on function public.app_dupla_confirm_roles(uuid) from public, anon;
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.dupla_room_state(public.checklist_rooms, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_room_seen_add(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.dupla_room_seen(public.checklist_rooms, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_room_views_track() from public, anon, authenticated;
revoke execute on function public.dupla_station_liberada(text, uuid[]) from public, anon, authenticated;
-- A exportação roda com os direitos de quem chama, inclusive do visitante (lista vazia): igual à 013340.
revoke execute on function public.dupla_export_rooms() from public;
grant execute on function public.dupla_export_rooms() to anon, authenticated;
