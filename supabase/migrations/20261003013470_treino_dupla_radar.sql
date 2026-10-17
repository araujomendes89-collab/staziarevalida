-- =============================================================================
-- Treino em Dupla, radar de quem está online + convite direto (adendo de 12/10, Etapa 6C, tarefa R1; parte 1 de 2).
-- (Plano de 12/10: "migração 9920"; número 013470, reservado para esta frente em .tmp-aulas/NUMEROS-MIGRACAO.md. A parte 2,
-- 013480, refaz o baralho, o match, os convites e o perfil para respeitarem o que nasce aqui.)
-- Depende das migrações do Treino: 013300 (dados, dupla_allowed), 013310 (dupla_sweep, dupla_public_name), 013320 (match:
-- dupla_compat, dupla_assign) e 013370 (chat: study_chat_blocks, dupla_chat_sweep).
-- Pode ser colada duas vezes: colunas e índices "if not exists", "drop constraint if exists", "create or replace" e permissões.
-- Não cria tabela, não apaga dado e não abre nada ao aluno (o módulo continua mandado pela chave "treino_dupla").
--
-- DECISÕES DO DONO QUE MANDAM AQUI (17/10, sobre a D8 e a D9 de 12/10)
--  - A lista do radar é aberta a todos com acesso ao módulo (D8): quem desliga "Aparecer no radar" some da lista dos outros, mas
--    continua vendo a lista. Não existe regra de reciprocidade.
--  - O BLOQUEIO é o do chat (study_chat_blocks), um só: quem bloqueou ou foi bloqueado some do baralho e do radar, nos dois
--    sentidos, e as duas pessoas não se convidam. Não há segundo sistema de bloqueio nem botão novo no convite.
--  - Limites de convite a definir (D9): por hora, por dia e espera depois de recusa ficam VAZIOS (sem limite) até o dono
--    preencher em Administração › Configurações. Só "1 convite pendente por vez" é fixo, por segurança.
--  - Chat: as denúncias encerradas passam a ser guardadas por 180 dias (e depois apagadas pela limpeza que já existe na 013370).
--
-- O QUE FAZ
--  1) study_profiles.allow_direct_invites ("Permitir convites diretos"), padrão ligado, como no pacote de design.
--  2) study_invites.kind: 'match' (o "Deu match!" de sempre, o padrão) ou 'direto' (convite do radar, 60 s).
--  3) Limites dos convites diretos dentro da chave que já existe, app_settings.treino_dupla, no bloco "convites"
--     (por_hora, por_dia, espera_min; ausente ou vazio = sem limite). Nenhuma chave nova em app_settings.
--  4) dupla_blocked / dupla_hides: a regra interna do bloqueio (usa o registro do chat).
--  5) app_dupla_radar(p_station_id): quem está online agora, com o cartão público do baralho, a compatibilidade e a situação
--     (livre | em_sala | sozinho). Nunca e-mail, telefone ou foto.
--  6) app_dupla_invite(p_to, p_station_id): convite direto. Cria a sala na fase dos papéis (sem match) e o convite de 60 s.
--  7) Painel: app_admin_dupla_radar() lê e app_admin_save_dupla_radar(jsonb) grava o bloco "convites" SEM tocar no resto da
--     chave "treino_dupla" (aberto, planos e o que outras frentes guardarem ali).
--  8) Chat: "guarda_denuncia_dias" da chave treino_dupla_chat passa de vazio para 180 (só se estiver vazio).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: nenhuma. Todas as funções desta migração são novas. Usadas sem mudar:
--   dupla_assert_access, dupla_allowed (013300); dupla_sweep, dupla_public_name, dupla_station_meta (013310); dupla_compat,
--   dupla_assign (013320); tutor_is_pro (…9550); is_staff (…0100); assert_admin, admin_log (…1300).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - O convite NUNCA leva o nome da estação ao convidado: quem recebe ainda pode virar o candidato, e o tema não vai ao
--    candidato antes do resultado. O convite traz só "Estação N", a área e a duração (a 013480 monta isso).
--  - Quem desligou "Aparecer no radar" pode convidar (é quem escolhe chamar) e vê a lista.
--  - Convite direto só para quem está online (sinal < 2 min e situação diferente de "fora"), livre (nem em sala nem treinando
--    sozinho), com o radar e os convites diretos ligados, sem convite pendente de outra pessoa e sem bloqueio entre os dois.
--  - A espera para reconvidar a mesma pessoa só vale quando o convite anterior foi RECUSADO ou VENCEU (sala fechada por
--    convite_recusado / convite_expirado); quem saiu da própria sala não fica de castigo.
--  - 'sozinho' (treino sozinho) é uma situação do perfil criada por outra frente; aqui só é LIDA: antes de ela existir, nunca
--    aparece e nada muda.
--  - Mensagens novas (para o dono aprovar): 'Você já tem um convite aguardando resposta.', 'Muitos convites seguidos. Tente de
--    novo em N min.', 'Você convidou X há pouco. Tente de novo em N min.', 'X não pode receber convites agora.', 'Você já está
--    em uma sala aberta. Saia dela antes de convidar.', 'Estação exclusiva dos planos Pro e Elite.', 'Configuração dos
--    convites inválida.'.
--
-- COMO DESFAZER: apagar as funções criadas aqui (dupla_radar_settings(), dupla_blocked(uuid, uuid), dupla_hides(uuid, uuid),
--   app_dupla_radar(text), app_dupla_invite(uuid, text), app_admin_dupla_radar(), app_admin_save_dupla_radar(jsonb)); tirar o
--   índice study_invites_from_idx e a restrição study_invites_kind_check; as colunas study_invites.kind e
--   study_profiles.allow_direct_invites podem ficar (inofensivas); recolocar as funções da 013480 pelas da 013310/013320.
--   Salas e convites já criados ficam. O prazo de 180 dias das denúncias volta a vazio em Administração › Configurações.
-- =============================================================================

-- ---------------------------------------------------------------- 1) colunas
alter table public.study_profiles add column if not exists allow_direct_invites boolean not null default true;

alter table public.study_invites add column if not exists kind text not null default 'match';
alter table public.study_invites drop constraint if exists study_invites_kind_check;
alter table public.study_invites add constraint study_invites_kind_check check (kind in ('match', 'direto'));
create index if not exists study_invites_from_idx on public.study_invites (from_user, created_at desc);

-- ---------------------------------------------------------------- 2) ajustes (com padrões)
-- Interna. { pendentes (sempre 1), por_hora, por_dia, espera_min }; os três últimos nulos = sem limite. Valor de tipo errado ou fora
-- da faixa vira "sem limite" (nunca derruba o radar).
create or replace function public.dupla_radar_settings() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_hora integer;
  v_dia integer;
  v_espera integer;
  x jsonb;
begin
  select c.value into v from public.app_settings c where c.key = 'treino_dupla';
  if v is not null and jsonb_typeof(v) = 'object' then
    x := v #> '{convites,por_hora}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 60 then v_hora := (x #>> '{}')::integer; end if;
    x := v #> '{convites,por_dia}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 200 then v_dia := (x #>> '{}')::integer; end if;
    x := v #> '{convites,espera_min}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 1440 then v_espera := (x #>> '{}')::integer; end if;
  end if;
  return jsonb_build_object('pendentes', 1, 'por_hora', v_hora, 'por_dia', v_dia, 'espera_min', v_espera);
end
$$;

-- ---------------------------------------------------------------- 3) bloqueio
-- Há bloqueio entre as duas pessoas, em qualquer sentido? (A tabela é a do chat: um bloqueio só.)
create or replace function public.dupla_blocked(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.study_chat_blocks k
     where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a))
$$;

-- O bloqueio faz uma sumir para a outra no baralho e no radar (decisão do dono de 17/10). Hoje é só o bloqueio; fica separada
-- para um único ponto de decisão.
create or replace function public.dupla_hides(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.dupla_blocked(a, b)
$$;

-- ---------------------------------------------------------------- 4) radar
-- Quem está online agora (sinal há menos de 2 minutos, situação diferente de "fora"), com acesso ao módulo, perfil e
-- "Aparecer no radar" ligado, sem bloqueio entre as duas pessoas. A lista é aberta a todos com acesso (quem está invisível a vê). Cartão público igual ao do baralho: instituição só com show_school;
-- estações e média só com show_stats; nunca e-mail, telefone ou foto. Ordem: livres, depois compatibilidade, depois sinal mais
-- recente; no máximo 50. Mesmo papel específico NÃO esconde a pessoa (a sala deixa trocar os papéis): vem sem compatibilidade.
-- Com a estação (p_station_id) a lista já diz quem pode receber aquele convite.
-- → { people: [{ user_id, public_name, school, city, exam, bio, goal, areas, role_pref, pace, days, shifts, stats, compat,
--                reasons, online, state: livre|em_sala|sozinho, can_invite, why_not }],
--     online, open_room, me: { radar_visible, allow_direct_invites }, server_now }
create or replace function public.app_dupla_radar(p_station_id text default null) returns jsonb
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
begin
  perform public.dupla_sweep();
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
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

  select coalesce(jsonb_agg(z.person order by z.rank, z.compat desc nulls last, z.seen desc), '[]'::jsonb)
    into v_people
  from (
    select x.person, x.compat, x.seen, case when x.state = 'livre' then 0 else 1 end as rank
    from (
      select
        (k.c ->> 'compat')::integer as compat,
        p.last_seen_at as seen,
        s.state,
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
          'compat', case when (k.c ->> 'ok')::boolean then (k.c ->> 'compat')::integer end,
          'reasons', case when (k.c ->> 'ok')::boolean then k.c -> 'reasons' else '[]'::jsonb end,
          'online', true,
          'state', s.state,
          'can_invite', w.why is null,
          'why_not', w.why
        ) as person
      from public.study_profiles p
      cross join lateral (select public.dupla_compat(me, p) as c) k
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
    ) x
    order by case when x.state = 'livre' then 0 else 1 end, x.compat desc nulls last, x.seen desc
    limit 50
  ) z;

  select count(*) into v_online
    from public.study_profiles p
   where p.user_id <> v_uid and p.radar_visible and p.last_seen_at > now() - interval '2 minutes' and p.status <> 'fora'
     and public.dupla_allowed(p.user_id) and not public.dupla_hides(v_uid, p.user_id);

  return jsonb_build_object('people', v_people, 'online', v_online, 'open_room', v_open,
                            'me', jsonb_build_object('radar_visible', me.radar_visible, 'allow_direct_invites', me.allow_direct_invites),
                            'server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 5) convite direto
-- Convida p_to (que está no radar) para treinar. Cria a sala na fase dos papéis (sem match, com a estação e os papéis
-- sugeridos por dupla_assign) e o convite de 60 s (kind 'direto'). Quem convida entra na sala; quem recebe vê o aviso.
-- Trava a minha fila e o par antes de ler (dois convites juntos para a mesma pessoa: um só passa).
-- → { room_id, partner: { user_id, public_name }, expires_at }
create or replace function public.app_dupla_invite(p_to uuid, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
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
     or not other.radar_visible
     or not other.allow_direct_invites
     or coalesce(other.last_seen_at, '-infinity'::timestamptz) <= now() - interval '2 minutes'
     or other.status in ('fora', 'em_estacao', 'sozinho')
     or public.dupla_hides(v_uid, p_to)
     or exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and p_to = any (r.member_ids))
     or exists (select 1 from public.study_invites i where i.to_user = p_to and i.status = 'pending' and i.expires_at > now()) then
    raise exception '% não pode receber convites agora.', other.public_name using errcode = '42501';
  end if;

  -- Estação: aprovada (ou equipe); só dos planos Pro/Elite exige plano pago nos dois.
  if p_station_id is not null then
    select * into st from public.checklist_stations s
     where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff());
    if not found then
      raise exception 'Estação não encontrada.' using errcode = '22023';
    end if;
    if st.is_pro_only and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(p_to)) then
      raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
    end if;
    v_station := st.id;
    v_dur := case when st.duration_ms between 60000 and 3600000 then st.duration_ms end;
  end if;

  -- Limites (o fechamento preguiçoso acima já cancelou os vencidos). O de 1 pendente é fixo; os outros só valem se o dono preencher.
  select count(*), min(i.created_at) into v_n, v_old from public.study_invites i
   where i.from_user = v_uid and i.kind = 'direto' and i.created_at > now() - interval '1 hour';
  if cfg ->> 'por_hora' is not null and v_n >= (cfg ->> 'por_hora')::integer then
    v_min := greatest(1, ceil(extract(epoch from (v_old + interval '1 hour' - now())) / 60.0)::integer);
    raise exception 'Muitos convites seguidos. Tente de novo em % min.', v_min using errcode = '42501';
  end if;
  select count(*), min(i.created_at) into v_n, v_old from public.study_invites i
   where i.from_user = v_uid and i.kind = 'direto' and i.created_at > now() - interval '24 hours';
  if cfg ->> 'por_dia' is not null and v_n >= (cfg ->> 'por_dia')::integer then
    v_min := greatest(1, ceil(extract(epoch from (v_old + interval '24 hours' - now())) / 60.0)::integer);
    raise exception 'Muitos convites seguidos. Tente de novo em % min.', v_min using errcode = '42501';
  end if;

  -- Depois de recusa ou vencimento, espera antes de reconvidar a mesma pessoa.
  if cfg ->> 'espera_min' is not null then
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

  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, candidate_id, evaluator_id, duration_ms)
  values (array[v_uid, p_to], 'roles', 1, null, v_station, v_cand, v_eval, v_dur)
  returning id into v_room;
  insert into public.study_invites (from_user, to_user, room_id, kind) values (v_uid, p_to, v_room, 'direto')
  returning expires_at into v_exp;
  update public.study_profiles set last_seen_at = now() where user_id = v_uid;

  return jsonb_build_object('room_id', v_room, 'expires_at', v_exp,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$$;

-- ---------------------------------------------------------------- 6) painel (só administrador)
-- Os valores em vigor (vazio = sem limite). → { convites: { pendentes (fixo 1), por_hora, por_dia, espera_min } }
create or replace function public.app_admin_dupla_radar() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object('convites', public.dupla_radar_settings());
end
$$;

-- Grava SÓ o bloco "convites" de app_settings.treino_dupla (por_hora, por_dia, espera_min; nulo ou vazio = sem limite); o resto
-- da chave (aberto, planos, outras frentes) fica como está. → o mesmo de app_admin_dupla_radar()
create or replace function public.app_admin_save_dupla_radar(p_config jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb;
  k text;
  v_new jsonb := '{}'::jsonb;
begin
  perform public.assert_admin();
  if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config -> 'convites') is distinct from 'object' then
    raise exception 'Configuração dos convites inválida.' using errcode = '22023';
  end if;
  c := p_config -> 'convites';
  foreach k in array array['por_hora', 'por_dia', 'espera_min'] loop
    if c -> k is null or jsonb_typeof(c -> k) = 'null' then
      v_new := v_new || jsonb_build_object(k, null);
    elsif jsonb_typeof(c -> k) <> 'number' or (c ->> k) !~ '^\d{1,4}$' then
      raise exception 'Configuração dos convites inválida.' using errcode = '22023';
    else
      v_new := v_new || jsonb_build_object(k, (c ->> k)::integer);
    end if;
  end loop;
  if (v_new ->> 'por_hora') is not null and (v_new ->> 'por_hora')::integer not between 1 and 60
     or (v_new ->> 'por_dia') is not null and (v_new ->> 'por_dia')::integer not between 1 and 200
     or (v_new ->> 'espera_min') is not null and (v_new ->> 'espera_min')::integer not between 1 and 1440 then
    raise exception 'Configuração dos convites inválida.' using errcode = '22023';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('treino_dupla', jsonb_build_object('aberto', false, 'planos', '[]'::jsonb, 'convites', v_new), now(), (select auth.uid()))
  on conflict (key) do update
    set value = jsonb_set(case when jsonb_typeof(public.app_settings.value) = 'object' then public.app_settings.value else '{}'::jsonb end,
                          '{convites}', v_new, true),
        updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('dupla.convites', null, v_new);
  return public.app_admin_dupla_radar();
end
$$;

-- ---------------------------------------------------------------- 7) chat: denúncias encerradas guardadas por 180 dias
-- Decisão do dono de 17/10. Só preenche quando estava vazio (colar de novo não desfaz uma mudança feita no painel para outro
-- valor); a limpeza é a dupla_chat_sweep da 013370, que roda a cada chamada do chat.
update public.app_settings
   set value = jsonb_set(value, '{guarda_denuncia_dias}', '180'::jsonb, true), updated_at = now()
 where key = 'treino_dupla_chat'
   and jsonb_typeof(value) = 'object'
   and (value -> 'guarda_denuncia_dias' is null or jsonb_typeof(value -> 'guarda_denuncia_dias') = 'null');

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access / assert_admin barra o resto.
-- As de apoio: só rodam dentro das funções do servidor (security definer).
revoke execute on function public.app_dupla_radar(text) from public, anon;
revoke execute on function public.app_dupla_invite(uuid, text) from public, anon;
revoke execute on function public.app_admin_dupla_radar() from public, anon;
revoke execute on function public.app_admin_save_dupla_radar(jsonb) from public, anon;
revoke execute on function public.dupla_radar_settings() from public, anon, authenticated;
revoke execute on function public.dupla_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_hides(uuid, uuid) from public, anon, authenticated;
