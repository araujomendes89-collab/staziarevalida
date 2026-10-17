-- =============================================================================
-- Treino em Dupla, convite por link do @ e pedido de treino de 24 horas (pedido do dono de 17/10, junto do radar).
-- Número 013550, reservado para esta frente em .tmp-aulas/NUMEROS-MIGRACAO.md. Depende da 013470 (handle, dupla_invite_core,
-- dupla_hides, dupla_radar_settings) e da 013480.
-- Pode ser colada duas vezes: tabela e índices "if not exists", "create or replace" e permissões. Não grava dado e não abre nada
-- ao aluno (o módulo continua mandado pela chave "treino_dupla").
--
-- COMO FUNCIONA
--  A pessoa copia o link do perfil ou do radar: https://…/novo/convite/<@> (opcional ?estacao=<id>). Quem abre, com conta e acesso
--  ao Treino em Dupla, vê o cartão público do dono do @ e "Pedir para treinar com {nome}":
--   - dono ONLINE e LIVRE (sinal < 2 min, fora de sala e de treino sozinho, sem convite esperando): vira o convite direto normal
--     de 60 s (dupla_invite_core), mesmo com o radar do dono desligado (o link foi compartilhado por ele);
--   - dono OFFLINE ou ocupado: vira um PEDIDO DE TREINO que vale 24 h (study_train_requests). Ele o vê ao abrir o app (Praticar,
--     perfil ou radar), com Aceitar e Agora não. Aceitar cria a sala (com a estação do pedido) e convida quem pediu, pelo fluxo do
--     convite direto de 60 s. Agora não só encerra (quem pediu não fica sabendo do motivo).
--  Regras: o bloqueio do chat vale nos dois sentidos (o link some: "Este convite não está disponível."); "Permitir convites
--  diretos" desligado: o link diz que a pessoa não recebe convites; 1 pedido pendente por par (fixo); a quantidade de pedidos por
--  dia e a espera depois de uma recusa seguem o bloco "convites" de treino_dupla (pedidos_por_dia, espera_min; vazio = sem
--  limite). Trocar o @ invalida o link antigo (o @ antigo deixa de existir). O link só leva o @: nenhum dado pessoal, nunca e-mail.
--
-- FUNÇÕES: dupla_can_receive_now (apoio), app_dupla_link_lookup, app_dupla_link_request, app_dupla_requests,
--   app_dupla_answer_request. Todas novas; nenhuma redefinida. Usadas sem mudar: dupla_assert_access, dupla_allowed (013300),
--   dupla_sweep, dupla_public_name (013310), dupla_compat (013320), dupla_station_meta, dupla_area_code (013300),
--   dupla_invite_core, dupla_hides, dupla_radar_settings (013470), tutor_is_pro (…9550), is_staff (…0100).
--
-- DECISÕES PEQUENAS (fora do pedido; o dono pode mudar)
--  - O pedido, como o convite, nunca leva o nome da estação ao outro lado: só "Estação N", a área e a duração.
--  - Aceitar um pedido exige que quem pediu esteja online e livre naquele momento (é um convite direto de 60 s); se não estiver,
--    a mensagem diz que não pode receber convites agora e o pedido continua valendo até vencer.
--  - Pedidos vencidos viram "expired" na próxima leitura e as linhas com mais de 7 dias são apagadas.
--  - Mensagens novas (para o dono aprovar): 'Este convite não está disponível.', 'Você já pediu para treinar com X. Aguarde a
--    resposta.', 'X já pediu para treinar com você.', 'Muitos pedidos seguidos. Tente de novo em N min.', 'Você pediu há
--    pouco para treinar com X. Tente de novo em N min.', 'Pedido não encontrado.', 'Pedido vencido.', 'Pedido já respondido.',
--    'Este é o seu próprio link.'.
--
-- COMO DESFAZER: apagar as funções acima e a tabela study_train_requests. Salas e convites já criados ficam.
-- =============================================================================

create table if not exists public.study_train_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  station_id text references public.checklist_stations (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'canceled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  answered_at timestamptz,
  room_id uuid references public.checklist_rooms (id) on delete set null,
  check (from_user <> to_user)
);
-- 1 pedido pendente por par (em qualquer sentido).
create unique index if not exists study_train_requests_pair_key
  on public.study_train_requests (least(from_user, to_user), greatest(from_user, to_user)) where status = 'pending';
create index if not exists study_train_requests_to_idx on public.study_train_requests (to_user, status, expires_at);
create index if not exists study_train_requests_from_idx on public.study_train_requests (from_user, created_at desc);
alter table public.study_train_requests enable row level security;

-- ---------------------------------------------------------------- apoios
-- Fecha o que venceu e apaga o muito antigo (fechamento preguiçoso, sem tarefa agendada).
create or replace function public.dupla_requests_sweep() returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.study_train_requests set status = 'expired' where status = 'pending' and expires_at <= now();
  delete from public.study_train_requests where expires_at < now() - interval '7 days';
end
$$;

-- A pessoa pode receber um convite de 60 s agora? Online (sinal < 2 min, fora de "fora"), livre (nem em sala nem treinando sozinho),
-- com acesso, sem outro convite esperando. Mesmo critério do convite direto, sem exigir o radar ligado (o link é dela).
create or replace function public.dupla_can_receive_now(p_to uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.dupla_allowed(p_to)
     and exists (select 1 from public.study_profiles o
                  where o.user_id = p_to and o.allow_direct_invites
                    and coalesce(o.last_seen_at, '-infinity'::timestamptz) > now() - interval '2 minutes'
                    and o.status not in ('fora', 'em_estacao', 'sozinho'))
     and not exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and p_to = any (r.member_ids))
     and not exists (select 1 from public.study_invites i where i.to_user = p_to and i.status = 'pending' and i.expires_at > now())
$$;

-- Resumo da estação sem o nome (só "Estação N", a área e a duração). Nulo se a estação não existe ou não pode ser vista.
create or replace function public.dupla_station_public(p_station_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'id_ok', true,
           'label', case when m ->> 'number' is not null then 'Estação ' || (m ->> 'number') else 'Estação' end,
           'number', m -> 'number', 'area', s.area, 'area_code', public.dupla_area_code(s.area),
           'duration_ms', s.duration_ms, 'is_pro_only', s.is_pro_only)
    from public.checklist_stations s
    cross join lateral public.dupla_station_meta(s.id) m
   where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff())
$$;

-- ---------------------------------------------------------------- 1) abrir o link
-- O que a tela do link mostra. { found, self, person, mode: convite | pedido | indisponivel, why_not, station, pending, incoming }
--   found false: @ que não existe, sem acesso, ou com bloqueio entre os dois (sem dizer qual).
--   person: o cartão público (instituição só com show_school; estações e média só com show_stats; nunca e-mail ou telefone),
--           com a compatibilidade se quem olha já tem perfil de estudo.
--   pending: eu já pedi a esta pessoa (aguardando); incoming: ela já pediu a mim.
create or replace function public.app_dupla_link_lookup(p_handle text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------- 2) pedir para treinar
-- Dono online e livre → convite direto de 60 s → { kind: 'convite', room_id, partner, expires_at }.
-- Senão → pedido de 24 h → { kind: 'pedido', request_id, expires_at, partner }.
create or replace function public.app_dupla_link_request(p_handle text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
    if v_pub is null then
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
$$;

-- ---------------------------------------------------------------- 3) os pedidos que chegaram para mim
-- Pendentes e no prazo (24 h), sem os de quem tem bloqueio comigo. A estação vem sem o nome.
-- → { requests: [{ id, from: { user_id, public_name, handle }, station, expires_at }], server_now }
create or replace function public.app_dupla_requests() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
$$;

-- Aceitar: cria a sala (com a estação do pedido) e convida quem pediu, pelo convite direto de 60 s → { room_id, partner, expires_at }.
-- Agora não: encerra o pedido → { room_id: null }. Quem pediu não vê o motivo.
create or replace function public.app_dupla_answer_request(p_request_id uuid, p_accept boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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

  v_res := public.dupla_invite_core(v_uid, r.from_user, r.station_id, true);
  update public.study_train_requests
     set status = 'accepted', answered_at = now(), room_id = (v_res ->> 'room_id')::uuid where id = r.id;
  return v_res;
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_dupla_link_lookup(text, text) from public, anon;
revoke execute on function public.app_dupla_link_request(text, text) from public, anon;
revoke execute on function public.app_dupla_requests() from public, anon;
revoke execute on function public.app_dupla_answer_request(uuid, boolean) from public, anon;
revoke execute on function public.dupla_requests_sweep() from public, anon, authenticated;
revoke execute on function public.dupla_can_receive_now(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_station_public(text) from public, anon, authenticated;
