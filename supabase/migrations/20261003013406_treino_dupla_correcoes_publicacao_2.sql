-- =============================================================================
-- Treino em Dupla: correções da revisão antes de publicar a 2ª fase, 2ª leva (17/10). (Número reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md: 013406, depois da 013405.)
-- Depende da 013300 (sala, avaliações), 013310 (fechamento preguiçoso), 013330 (tentativas sozinho), 013350 (fases da sala),
-- 013370 (exportação com o chat), 013380 (conteúdo por papel), 013405 (quem já viu, estação liberada) e da …4600
-- (user_is_staff).
-- Pode ser colada duas vezes: "add column if not exists", "create or replace function" e permissões. Não cria estação,
-- pessoa nem nota. Nenhuma IA.
--
-- REGRA DO DONO: o candidato NUNCA fica sabendo o tema, o nome ou o id da estação antes do resultado da rodada. Quem já viu a
-- estação (escolheu ou foi avaliador) pode ser candidato, com o aviso "Você já viu esta estação". Aluno só treina estação
-- aprovada pela revisão médica.
--
-- O QUE FAZ
--  1) QUEM JÁ VIU, EM QUALQUER SALA (achado IMPORTANTE). Na 013405 o aviso só olhava a própria sala: saindo e abrindo outra
--     sala, dava para trocar de papel na mesma estação sem aviso. dupla_room_seen (usada por dupla_room_state para
--     me.seen_station e partner.seen_station) passa a olhar o que a PESSOA já viu da estação ATUAL em qualquer sala:
--       - linhas de checklist_room_station_views da mesma estação e pessoa (esta sala ou outras; escolheu ou foi avaliador);
--       - avaliações em que ela foi a avaliadora (checklist_study_sessions com actor_id = pessoa e station_id = estação),
--         inclusive as do app antigo.
--     Continua só um verdadeiro/falso sobre a estação da própria sala: nunca diz QUAL estação é. A pessoa só fica em uma sala
--     aberta por vez (match e chat recusam a segunda), e só o avaliador muda a estação: o candidato não tem como mudar o que
--     já viu enquanto a estação da sala está fixa, então não há tentativa e erro. O aviso só acende para estação que a
--     própria pessoa já viu.
--     A exportação das salas (dupla_export_rooms, 013405) NÃO muda: o station_id de uma sala sem resultado só sai a quem viu
--     a estação NAQUELA sala (o aviso diz "já viu", a exportação não diz qual).
--  2) ESTAÇÃO QUE VOLTOU A PENDENTE COM ALUNO NA SALA (menor). Antes a aprovação médica só era conferida ao escolher e ao
--     confirmar. Agora o fechamento preguiçoso (dupla_sweep, base 013310), que roda antes de ler a sala (app_dupla_room), antes
--     de cada ação (dupla_room_for_action), antes do caminho da imagem e, novo, antes do conteúdo por papel, também "fecha a
--     rodada" de toda sala ainda sem resultado (fases roles, connecting, setup, running, review, sem avaliação da rodada)
--     cuja estação deixou de ser liberada (dupla_station_liberada, 013405: não aprovada e alguém da sala não é da equipe):
--       a sala volta para a fase dos papéis, com os MESMOS papéis e a MESMA rodada, sem estação, sem cronômetro, sem impressos
--       liberados e sem as marcações do PEP desta rodada; nenhuma avaliação é criada (não conta como estação treinada, não
--       vale nota, nada é cobrado). Coluna nova checklist_rooms.station_dropped_round guarda a rodada em que isso aconteceu.
--     Mensagem neutra (não diz o motivo nem a estação), igual para os dois: "Esta estação ficou indisponível. Escolham outra."
--       - no estado da sala (dupla_room_state, campo novo "notice") enquanto a sala estiver nos papéis, sem estação, na mesma
--         rodada; some quando o avaliador escolhe outra estação ou a rodada muda;
--       - no conteúdo por papel (app_dupla_room_content): nada da estação é entregue e a resposta traz o mesmo "notice";
--       - nas ações de outras fases (conectar, pronto, iniciar, encerrar, finalizar…): dupla_room_need recusa com a mesma
--         mensagem (a tela relê o estado); confirmar papéis sem estação depois disso também.
--     Sala só da equipe com estação pendente segue como antes (pode). Rodada que já tem avaliação (revisão da nota) e salas no
--     resultado ou fechadas não são tocadas.
--  3) EXPORTAÇÃO DOS DADOS (menor). app_export_my_data (base 013370) ganha "station_attempts": as tentativas do treino
--     sozinho da própria pessoa, colunas listadas (id, station_id, status, horários, marks, score, max_score, correctness,
--     created_at). Nada aí revela tema de rodada sem resultado: no treino sozinho é a própria pessoa que escolhe a estação no
--     catálogo (com o nome), e o PEP (marks) só é gravado ao concluir. A tabela é fechada ao navegador (013330), então a
--     leitura é por uma função de apoio nova, export_station_attempts() (só as linhas de quem chama; visitante ou tabela
--     ausente depois do desfazer da 013330: lista vazia), como dupla_export_rooms.
--  4) DECISÃO REGISTRADA (sem mudança de código): o candidato recebe a folha (cenário e tarefas, imagem da folha, impressos
--     iniciais) já nas fases connecting e setup, como na prova real, em que o candidato lê as instruções na porta antes de
--     entrar. Fica assim. Conferido (teste): nessas fases o candidato NÃO recebe nome, id, tema (topic), caminho da
--     taxonomia, roteiro do ator, resumo, PEP, número de origem dos impressos nem impresso liberável não liberado; só
--     rótulo "Estação <n>", área, duração, versão do conteúdo e a folha do candidato.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_room_seen(checklist_rooms, uuid) ← 013405 (agora em qualquer sala e nas avaliações como avaliador);
--   dupla_sweep(uuid) ← 013310 (igual, mais o item 2);
--   dupla_room_need(checklist_rooms, uuid, text[], boolean) ← 013350 (igual, mais a mensagem neutra do item 2);
--   app_dupla_confirm_roles(uuid) ← 013405 (igual, mais a mensagem neutra do item 2);
--   dupla_room_state(checklist_rooms, uuid) ← 013405 (igual, mais "notice");
--   app_dupla_room_content(uuid) ← 013380 (igual, mais o item 2; deixa de ser "stable" porque passa a chamar dupla_sweep);
--   app_export_my_data() ← 013370 (igual, mais "station_attempts").
--   Nova: export_station_attempts(). Coluna nova: checklist_rooms.station_dropped_round.
--   Usadas sem mudar: dupla_assert_access, dupla_station_meta, dupla_area_code (013300); dupla_public_name (013310);
--   dupla_export_rooms (013405), dupla_export_chat (013370); dupla_pressings, dupla_pressings_tela (013340, 013350);
--   dupla_room_for_action (013350); dupla_station_done_in_room (013380); dupla_station_liberada (013405); user_is_staff (…4600).
--
-- RECOLAR: colar de novo uma migração ANTERIOR do Treino (013300 a 013405) volta as versões antigas destas funções.
--   Recolar sempre a cadeia inteira, na ordem, até esta (013406).
--
-- COMO DESFAZER: colar de novo dupla_room_seen, app_dupla_confirm_roles e dupla_room_state da 013405, dupla_sweep da 013310,
--   dupla_room_need da 013350, app_dupla_room_content da 013380 e app_export_my_data da 013370; apagar export_station_attempts()
--   e a coluna checklist_rooms.station_dropped_round.
-- =============================================================================

-- ---------------------------------------------------------------- 2) coluna: rodada fechada por estação indisponível
alter table public.checklist_rooms add column if not exists station_dropped_round integer;

-- ---------------------------------------------------------------- 1) quem já viu, em qualquer sala (base: 013405)
-- A pessoa já viu a estação ATUAL desta sala? Em qualquer sala (escolheu ou foi avaliadora) ou numa avaliação como avaliadora.
create or replace function public.dupla_room_seen(p_room public.checklist_rooms, p_uid uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_room.station_id is not null and p_uid is not null and (
    exists (select 1 from public.checklist_room_station_views v
             where v.station_id = p_room.station_id and v.user_id = p_uid)
    or exists (select 1 from public.checklist_study_sessions s
                where s.station_id = p_room.station_id and s.actor_id = p_uid))
$$;

-- ---------------------------------------------------------------- 2) fechamento preguiçoso (base: 013310)
-- Igual à 013310, mais: rodada sem resultado com estação que deixou de ser liberada volta aos papéis (sem estação, sem nota).
create or replace function public.dupla_sweep(p_room_id uuid default null) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  with vencidos as (
    update public.study_invites i set status = 'canceled'
    where i.status = 'pending' and i.expires_at < now() and (p_room_id is null or i.room_id = p_room_id)
    returning i.room_id
  )
  update public.checklist_rooms r
     set phase = 'closed', closed_reason = 'convite_expirado', call_link = null, rev = r.rev + 1
   where r.phase <> 'closed' and r.id in (select v.room_id from vencidos v);

  update public.checklist_rooms r
     set phase = 'closed', closed_reason = 'sem_sinal', call_link = null, rev = r.rev + 1
   where r.phase <> 'closed'
     and (p_room_id is null or r.id = p_room_id)
     and r.updated_at < now() - interval '15 minutes'
     and not exists (
       select 1 from public.study_profiles p
       where p.user_id = any (r.member_ids) and p.last_seen_at > now() - interval '15 minutes'
     );

  -- Estação que voltou a pendente (ou sumiu) com aluno na sala: a rodada fecha sem avaliação e a sala volta aos papéis.
  with caidas as (
    update public.checklist_rooms r
       set phase = 'roles', station_id = null, station_chosen_by = null, duration_ms = null,
           confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
           started_at = null, ends_at = null, paused_left_ms = null, paused_at = null, paused_total_ms = 0,
           finished_at = null, released_pressings = '{}', station_dropped_round = r.round,
           rev = r.rev + 1
     where r.phase in ('roles', 'connecting', 'setup', 'running', 'review')
       and (p_room_id is null or r.id = p_room_id)
       and r.station_id is not null
       and not public.dupla_station_liberada(r.station_id, r.member_ids)
       and not exists (select 1 from public.checklist_study_sessions s where s.room_id = r.id and s.round = r.round)
    returning r.id, r.round
  )
  delete from public.checklist_room_marks m using caidas c where m.room_id = c.id and m.round = c.round;
end
$$;

-- Rodada desta sala fechada porque a estação ficou indisponível (sala nos papéis, sem estação, na mesma rodada).
-- (Sem função à parte: a condição é repetida em dupla_room_need, app_dupla_confirm_roles, dupla_room_state e no conteúdo.)

-- ---------------------------------------------------------------- 2) fase certa (base: 013350)
create or replace function public.dupla_room_need(p_room public.checklist_rooms, p_uid uuid, p_phases text[], p_evaluator boolean)
  returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (p_room.phase = any (p_phases)) then
    if p_room.phase = 'roles' and p_room.station_id is null and p_room.station_dropped_round = p_room.round then
      raise exception 'Esta estação ficou indisponível. Escolham outra.' using errcode = '55000';
    end if;
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  if p_evaluator and p_room.evaluator_id is distinct from p_uid then
    raise exception 'Só o avaliador pode fazer isso.' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------- 2) confirmar papéis e estação (base: 013405)
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
    if r.station_dropped_round = r.round then
      raise exception 'Esta estação ficou indisponível. Escolham outra.' using errcode = '55000';
    end if;
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

-- ---------------------------------------------------------------- 1) e 2) estado da sala (base: 013405)
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
  v_notice text := null;
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

  -- Já viu a estação ATUAL desta sala, em qualquer sala (escolheu ou foi avaliador) ou numa avaliação como avaliador (013406).
  -- Só verdadeiro/falso sobre a estação da própria sala: nunca diz qual é.
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

  -- Rodada fechada porque a estação ficou indisponível (013406): mensagem neutra até escolherem outra.
  if p_room.phase = 'roles' and p_room.station_id is null and p_room.station_dropped_round = p_room.round then
    v_notice := 'Esta estação ficou indisponível. Escolham outra.';
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
    'notice', v_notice,
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

-- ---------------------------------------------------------------- 2) e 4) conteúdo por papel (base: 013380)
-- Igual à 013380, mais: antes de entregar, o fechamento preguiçoso (com a regra do item 2). Estação que ficou indisponível
-- com aluno na sala: nada da estação sai, e a resposta traz a mensagem neutra. Deixa de ser "stable" (pode gravar a sala).
-- Item 4 (decisão): o candidato recebe a folha já em connecting/setup, nunca o nome, o id, o tema nem o PEP.
create or replace function public.app_dupla_room_content(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  st public.checklist_stations;
  c jsonb;
  v_role text;
  v_meta jsonb;
  v_station jsonb;
  v_named boolean;
  v_pressings jsonb := '[]'::jsonb;
  v_items jsonb;
  v_count integer;
  v_assets jsonb;
begin
  if not exists (select 1 from public.checklist_rooms x where x.id = p_room_id and v_uid = any (x.member_ids)) then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  perform public.dupla_sweep(p_room_id);
  select * into r from public.checklist_rooms where id = p_room_id and v_uid = any (member_ids);
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  if r.station_id is null then
    return jsonb_build_object('role', null, 'station', null, 'pressing_count', 0, 'pressings', '[]'::jsonb)
           || case when r.phase = 'roles' and r.station_dropped_round = r.round
                   then jsonb_build_object('notice', 'Esta estação ficou indisponível. Escolham outra.')
                   else '{}'::jsonb end;
  end if;
  select * into st from public.checklist_stations where id = r.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = r.station_id;
  c := coalesce(c, '{}'::jsonb);
  v_assets := case when jsonb_typeof(c -> 'pressing_assets') = 'object' then c -> 'pressing_assets' else '{}'::jsonb end;
  select count(*) into v_count from public.dupla_pressings(c) p where not p.initially_visible;
  v_meta := public.dupla_station_meta(st.id);
  v_named := r.evaluator_id is not null and v_uid = r.evaluator_id or r.phase = 'result';

  v_role := case when r.phase in ('connecting', 'setup', 'running', 'review', 'result') then
              case when v_uid = r.candidate_id then 'candidate' when v_uid = r.evaluator_id then 'evaluator' end
            end;

  v_station := jsonb_build_object('label', case when v_meta ->> 'number' is not null then 'Estação ' || (v_meta ->> 'number') else 'Estação' end,
                                  'area', st.area, 'area_code', public.dupla_area_code(st.area),
                                  'number', v_meta -> 'number', 'duration_ms', st.duration_ms);
  if v_named then
    v_station := v_station || jsonb_build_object('id', st.id, 'name', st.name);
  end if;
  if v_role is null then
    return jsonb_build_object('role', null, 'station', v_station, 'pressing_count', v_count, 'pressings', '[]'::jsonb);
  end if;

  v_station := v_station || jsonb_build_object('version', c ->> 'version', 'doctor_scene', coalesce(c ->> 'doctor_scene', ''),
                                               'doctor_tasks', coalesce(c ->> 'doctor_tasks', ''),
                                               'candidate_sheet', jsonb_build_object('has_image', v_assets ? 'candidate_sheet'));
  if v_role = 'evaluator' then
    -- Resumo sobre o tema (D9, 013380): só o avaliador e só o APROVADO pela revisão médica (checklist_station_summaries).
    -- O "summary" do conteúdo da estação não vai mais para a sala. Sem resumo aprovado: nulo (a tela não mostra Materiais).
    v_station := v_station || jsonb_build_object(
      'actor_script', coalesce(c ->> 'actor_script', ''),
      'summary', (select m.body from public.checklist_station_summaries m
                   where m.station_id = st.id and m.status = 'approved' and btrim(m.body) <> ''));
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'index', p.n, 'display_number', p.screen_number, 'source_number', p.source_number,
             'initially_visible', p.initially_visible,
             'name', coalesce(p.e ->> 'name', ''), 'content', coalesce(p.e ->> 'content', ''),
             'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
           ) order by p.n), '[]'::jsonb)
      into v_pressings
    from public.dupla_pressings_tela(c) p;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.e ->> 'id', 'order', i.e -> 'order', 'content', coalesce(i.e ->> 'content', ''), 'tip', coalesce(i.e ->> 'tip', ''),
             'grades', i.e -> 'grades', 'criteria', i.e -> 'criteria',
             'subitems', case when jsonb_typeof(i.e -> 'subitems') = 'array' then i.e -> 'subitems' else '[]'::jsonb end
           ) order by i.n), '[]'::jsonb)
      into v_items
    from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end)
         with ordinality as i(e, n);
    return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings,
                              'checklist_items', v_items);
  end if;

  -- Candidato: folha (cenário, tarefas, imagem se houver), impressos iniciais e os liberados; nunca o nome, o id verdadeiro,
  -- o número de origem, o resumo nem o nome de arquivo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', case when p.initially_visible then 'i' else 'd' end || p.screen_number,
           'display_number', p.screen_number, 'initially_visible', p.initially_visible,
           'name', coalesce(p.e ->> 'name', ''),
           'content', btrim(regexp_replace(regexp_replace(coalesce(p.e ->> 'content', ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n'),
           'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
         ) order by p.initially_visible desc, p.screen_number, p.n), '[]'::jsonb)
    into v_pressings
  from public.dupla_pressings_tela(c) p
  where p.initially_visible or p.id = any (r.released_pressings);
  return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings);
end
$$;

-- ---------------------------------------------------------------- 3) exportação: tentativas do treino sozinho
-- Só as de quem chama (visitante: lista vazia). Colunas listadas. Sem a tabela (o desfazer da 013330 a apaga): lista vazia,
-- para a exportação nunca quebrar. Nome fora do prefixo fase2_ de propósito: o desfazer da 013330 apaga as fase2_* e esta fica.
create or replace function public.export_station_attempts() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_out jsonb;
begin
  if v_uid is null or to_regclass('public.station_attempts') is null then
    return '[]'::jsonb;
  end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'station_id', a.station_id, 'status', a.status, 'started_at', a.started_at,
             'attendance_started_at', a.attendance_started_at, 'attendance_ended_at', a.attendance_ended_at,
             'finished_at', a.finished_at, 'marks', a.marks, 'score', a.score, 'max_score', a.max_score,
             'correctness', a.correctness, 'created_at', a.created_at)
           order by a.started_at, a.id), '[]'::jsonb)
      from public.station_attempts a
     where a.user_id = $1
  $q$ into v_out using v_uid;
  return v_out;
end
$$;

-- Base: 013370 (igual, mais "station_attempts" no fim).
create or replace function public.app_export_my_data() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', (select auth.uid())),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'subscription', (select to_jsonb(s) - 'provider_customer_id' - 'provider_subscription_id'
                     from public.subscriptions s where s.user_id = (select auth.uid())),
    'practice_sessions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at), '[]'::jsonb)
                          from public.practice_sessions t where t.user_id = (select auth.uid())),
    'question_attempts', (select coalesce(jsonb_agg(to_jsonb(t) - 'seq' order by t.seq), '[]'::jsonb)
                          from public.question_attempts t where t.user_id = (select auth.uid())),
    'question_bookmarks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                           from public.question_bookmarks t where t.user_id = (select auth.uid())),
    'error_notes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at), '[]'::jsonb)
                    from public.error_notes t where t.user_id = (select auth.uid())),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.day, t.position), '[]'::jsonb)
                   from public.plan_tasks t where t.user_id = (select auth.uid())),
    'flashcards', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                   from public.flashcards t where t.owner_id = (select auth.uid())),
    'flashcard_states', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                         from public.flashcard_states t where t.user_id = (select auth.uid())),
    'flashcard_reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
                          from public.flashcard_reviews t where t.user_id = (select auth.uid())),
    'checklist_favorites', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                            from public.checklist_favorites t where t.user_id = (select auth.uid())),
    'checklist_station_reports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                  from public.checklist_station_reports t where t.user_id = (select auth.uid())),
    'checklist_event_confirmations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                      from public.checklist_event_confirmations t where t.user_id = (select auth.uid())),
    'checklist_study_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                 from public.checklist_study_sessions t
                                 where t.actor_id = (select auth.uid()) or t.doctor_id = (select auth.uid())),
    'study_profile', (select to_jsonb(t) from public.study_profiles t where t.user_id = (select auth.uid())),
    'study_swipes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                     from public.study_swipes t where t.from_user = (select auth.uid())),
    -- sem station_id: o tema da estação não sai pela exportação (a coluna nem é legível pelo aluno, 013300)
    'study_matches', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'user_a', t.user_a, 'user_b', t.user_b,
                                                                   'room_id', t.room_id, 'created_at', t.created_at)
                                                order by t.created_at), '[]'::jsonb)
                      from public.study_matches t where (select auth.uid()) in (t.user_a, t.user_b)),
    'checklist_rooms', public.dupla_export_rooms(),
    'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('document', t.document, 'version', t.version,
                                                                  'accepted_at', t.accepted_at, 'origin', t.origin,
                                                                  'user_agent', t.user_agent)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid())),
    'declarations', (select coalesce(jsonb_agg(jsonb_build_object('document', a.document, 'version', a.version,
                                                                   'adult', d.adult, 'physician', d.physician, 'declared_at', d.declared_at)
                                               order by d.declared_at, a.id), '[]'::jsonb)
                     from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                     where a.user_id = (select auth.uid())),
    'study_chat', public.dupla_export_chat(),
    -- treino sozinho (013330): a própria pessoa escolhe a estação; o PEP só é gravado ao concluir
    'station_attempts', public.export_station_attempts()
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access barra o resto. As de apoio: só por dentro.
revoke execute on function public.app_dupla_confirm_roles(uuid) from public, anon;
revoke execute on function public.app_dupla_room_content(uuid) from public, anon;
revoke execute on function public.dupla_room_seen(public.checklist_rooms, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_sweep(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_room_need(public.checklist_rooms, uuid, text[], boolean) from public, anon, authenticated;
revoke execute on function public.dupla_room_state(public.checklist_rooms, uuid) from public, anon, authenticated;
-- A exportação roda com os direitos de quem chama, inclusive do visitante (lista vazia): igual a dupla_export_rooms.
revoke execute on function public.export_station_attempts() from public;
grant execute on function public.export_station_attempts() to anon, authenticated;
