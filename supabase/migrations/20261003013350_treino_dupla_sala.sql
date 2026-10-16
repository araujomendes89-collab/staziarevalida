-- =============================================================================
-- Treino em Dupla, Etapa 5 (Tarefa 14): ações da sala ao vivo, cronômetro, marcações do PEP, finalização e caminho da imagem
-- do impresso. (Plano de 12/10: "migração 9910"; este arquivo usa 013350, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013300 (colunas da sala, marcações, avaliação), 013310 (dupla_sweep, dupla_room_state), 013320 (escolhas, saída) e
-- 013340 (dupla_pressings, conteúdo por papel, sala sem leitura direta).
-- Pode ser colada duas vezes: "add column if not exists", "create or replace function", "drop trigger if exists" e permissões.
-- Não grava dado. Nenhuma IA.
--
-- O QUE FAZ
--  1) Sala: coluna nova checklist_rooms.station_chosen_by (quem escolheu a estação na sala).
--  2) Ações da sala (todas "app_dupla_*", security definer, devolvem o estado da sala depois de rev + 1, menos mark e
--     print_path): papéis (set_roles, draw_roles), estação (set_station, só o avaliador e só depois dos papéis), confirmar
--     (confirm_roles), conexão (connected), prontidão (ready), duração (set_duration), cronômetro (start, pause, resume,
--     adjust ±1 min), impressos (release, só liberáveis e só com a estação em andamento), marcações do PEP (mark, sem mexer no
--     rev), encerrar (finish → review) e finalizar (finalize → result, cria a avaliação da rodada com a nota do servidor).
--     NÃO existe app_dupla_set_link (decisão do dono: os dois conversam fora do app). A coluna call_link fica.
--  3) Caminho da imagem do impresso (app_dupla_print_path), lido pela rota /api/dupla/rooms/:id/prints/:pressing/{link,file}.
--  4) Números de tela CONTÍNUOS por grupo (decisão do dono de 16/10): iniciais 1, 2, 3… e liberáveis 1, 2, 3…, na ordem
--     (display_number do dado, posição), iguais para os dois papéis; "source_number" (o número da prova) só o avaliador vê.
--     Apoio novo dupla_pressings_tela; usado no estado, no conteúdo, na liberação e no caminho da imagem.
--  5) Estado da sala: "me.picked_station" (a estação da sala foi escolhida por mim: na sala, ou no Banco de estações pela minha
--     escolha "Estudar junto" com essa estação para o parceiro). Só para "me"; não revela o tema. A tela mostra "Você escolheu
--     esta estação, então já conhece o tema." quando quem escolheu fica como candidato (decisão do dono de 16/10).
--  6) Conteúdo do avaliador ganha "summary" (resumo do tema, decisão D9) e "candidate_sheet": { has_image }. O candidato nunca
--     recebe o resumo (revela o tema).
--  7) Aviso de tempo real: gatilho checklist_rooms_notify (depois de cada update que muda o rev) manda
--     realtime.send({ "rev": n }, 'sala', 'room:<id>', true): broadcast PRIVADO, evento "sala", tópico "room:<id>", só o rev
--     (nenhum dado da estação). Motivo: a 013340 tirou a leitura direta de checklist_rooms (política "salas: membros leem"),
--     então o postgres_changes não chega mais ao navegador; o aviso vai por broadcast no canal privado room:<id>, que as
--     políticas de realtime.messages da 013300 ("treino em dupla: ler canais") já liberam só aos dois membros. O tempo real
--     só avisa: quem diz o estado são as funções. Só chama realtime.send se ela existir (no Supabase existe; no banco local
--     não) e nunca derruba a ação (qualquer erro do envio é ignorado).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_room_state(checklist_rooms, uuid) ← 013340; app_dupla_room_content(uuid) ← 013340.
--   Novas: dupla_pressings_tela, dupla_room_for_action, dupla_room_need, dupla_room_notify e as app_dupla_* do item 2 e 3.
--   Usadas sem mudar: dupla_assert_access, dupla_station_meta, dupla_area_code (013300); dupla_sweep, dupla_public_name
--   (013310); dupla_pressings (013340); tutor_is_pro (…9550); is_staff (…0100).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - Repetir uma ação que não muda nada (confirmar de novo, pausar já pausada, liberar já liberado, ficar pronto de novo)
--    devolve o estado sem somar ao rev (clique duplo, duas abas).
--  - Ao entrar em "connecting" a conexão e a prontidão começam vazias; ao entrar em "setup" a prontidão começa vazia.
--  - set_roles com alguém que não é da sala, ready ou release sem verdadeiro/falso: 'Escolha inválida.' (mensagem que já existe).
--  - Liberar em "setup": 'Disponível depois de iniciar a estação.' (texto do plano de 12/10); nas outras fases, a de fase.
--  - mark: nível em minúsculas ('correct' | 'partial' | 'incorrect'), aceito só se o item tiver número nesse nível; subitens
--    desconhecidos são ignorados (ficam os que existem no item, na ordem do item, sem repetir).
--  - finish grava finished_at = agora mesmo se o tempo já tinha acabado (o tempo usado pode passar da duração).
--  - finalize: avaliação revisada (sessão da rodada já existente com a sala em "review") atualiza nota, respostas, versão e
--    feedback; a nota de antes fica em score_before_review (só a primeira).
--  - print_path: o candidato pede pela chave de tela ('i<n>', 'd<n>') ou 'candidate_sheet'; qualquer outra coisa recebe
--    'Impresso não liberado.' (não diz se o impresso existe). O avaliador pede pelo id verdadeiro (ou pela chave de tela).
-- TODO(dono): chave e formato de pressing_assets/candidate_sheet com a Montagem (hoje: o valor é o id em
--   public.station_assets, como texto, ou um objeto com "asset_id"; a imagem do impresso pela chave <id verdadeiro> ou
--   p<posição>). public.station_assets é da migração 6000 da Montagem (outro ramo): sem a tabela, o caminho é sempre nulo.
--
-- REGRA (vem da 013340): a avaliação da rodada (checklist_study_sessions) só nasce em app_dupla_finalize, no resultado, porque
-- o candidato lê o station_id dela.
--
-- COMO DESFAZER: apagar o gatilho checklist_rooms_notify e as funções novas (app_dupla_set_roles(uuid, uuid),
--   app_dupla_draw_roles(uuid), app_dupla_set_station(uuid, text), app_dupla_confirm_roles(uuid), app_dupla_connected(uuid),
--   app_dupla_ready(uuid, boolean), app_dupla_set_duration(uuid, integer), app_dupla_start(uuid), app_dupla_pause(uuid),
--   app_dupla_resume(uuid), app_dupla_adjust(uuid, integer), app_dupla_release(uuid, text, boolean),
--   app_dupla_mark(uuid, text, text, text[]), app_dupla_finish(uuid), app_dupla_finalize(uuid, jsonb),
--   app_dupla_print_path(uuid, text), dupla_pressings_tela(jsonb), dupla_room_for_action(uuid, uuid),
--   dupla_room_need(checklist_rooms, uuid, text[], boolean), dupla_room_notify()); colar de novo dupla_room_state e
--   app_dupla_room_content da 013340; apagar a coluna checklist_rooms.station_chosen_by.
-- =============================================================================

-- ---------------------------------------------------------------- 1) quem escolheu a estação na sala
alter table public.checklist_rooms add column if not exists station_chosen_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------- 2) apoios
-- Impressos com o número de tela contínuo por grupo (iniciais 1, 2, 3…; liberáveis 1, 2, 3…), na ordem (display_number, posição).
create or replace function public.dupla_pressings_tela(p_content jsonb) returns table (
  n bigint, e jsonb, id text, display_number integer, source_number integer, initially_visible boolean, screen_number integer
)
  language sql immutable security definer set search_path = ''
as $$
  select p.n, p.e, p.id, p.display_number, p.source_number, p.initially_visible,
         (row_number() over (partition by p.initially_visible order by p.display_number, p.n))::integer
  from public.dupla_pressings(p_content) p
$$;

-- A sala para uma ação: confere que a pessoa é membro ('Sala não encontrada.'), fecha o que venceu e trava a linha.
create or replace function public.dupla_room_for_action(p_room_id uuid, p_uid uuid) returns public.checklist_rooms
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.checklist_rooms;
begin
  if not exists (select 1 from public.checklist_rooms x where x.id = p_room_id and p_uid = any (x.member_ids)) then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  perform public.dupla_sweep(p_room_id);
  select * into r from public.checklist_rooms where id = p_room_id and p_uid = any (member_ids) for update;
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  return r;
end
$$;

-- Fase certa e, se pedido, só o avaliador.
create or replace function public.dupla_room_need(p_room public.checklist_rooms, p_uid uuid, p_phases text[], p_evaluator boolean)
  returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (p_room.phase = any (p_phases)) then
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  if p_evaluator and p_room.evaluator_id is distinct from p_uid then
    raise exception 'Só o avaliador pode fazer isso.' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------- 3) estado da sala (base: 013340)
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
  v_picked boolean;
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

  -- A estação da sala foi escolhida por mim: na sala (set_station) ou no Banco de estações (minha escolha com essa estação).
  v_picked := coalesce(p_room.station_id is not null and (
                p_room.station_chosen_by = p_uid
                or exists (select 1 from public.study_swipes w
                           where w.from_user = p_uid and w.to_user = v_partner and w.station_id = p_room.station_id)), false);

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
      'picked_station', v_picked
    ),
    'partner', jsonb_build_object(
      'user_id', case when exists (select 1 from auth.users u where u.id = v_partner) then v_partner end,
      'public_name', public.dupla_public_name(v_partner),
      'role', case when v_partner = p_room.candidate_id then 'candidate' when v_partner = p_room.evaluator_id then 'evaluator' end,
      'confirmed', coalesce(v_partner = any (p_room.confirmed_ids), false),
      'connected', coalesce(v_partner = any (p_room.connected_ids), false),
      'ready', coalesce(v_partner = any (p_room.ready_ids), false),
      'seen_ms_ago', v_seen
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

-- ---------------------------------------------------------------- 4) conteúdo por papel (base: 013340)
create or replace function public.app_dupla_room_content(p_room_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
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
  select * into r from public.checklist_rooms where id = p_room_id and v_uid = any (member_ids);
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  if r.station_id is null then
    return jsonb_build_object('role', null, 'station', null, 'pressing_count', 0, 'pressings', '[]'::jsonb);
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
    -- Resumo do tema (D9): só o avaliador. Texto não vazio, ou a lista como está; o resto vira nulo.
    v_station := v_station || jsonb_build_object(
      'actor_script', coalesce(c ->> 'actor_script', ''),
      'summary', case when jsonb_typeof(c -> 'summary') = 'string' and btrim(c ->> 'summary') <> '' then c -> 'summary'
                      when jsonb_typeof(c -> 'summary') = 'array' then c -> 'summary' end);
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

-- ---------------------------------------------------------------- 5) papéis e estação (fase "roles")
-- Qualquer membro define quem é o candidato; o outro vira avaliador. Zera as confirmações; a estação não muda.
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
         confirmed_ids = '{}', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Sorteio dos papéis no servidor. Zera as confirmações.
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
         confirmed_ids = '{}', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Só o avaliador escolhe (ou troca) a estação, e só depois dos papéis. Aprovada (a equipe vê todas); só dos planos Pro/Elite
-- com os dois em plano pago. Duração da estação, confirmações zeradas e quem escolheu gravado.
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
  select * into st from public.checklist_stations s where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff());
  if not found then
    raise exception 'Estação não encontrada.' using errcode = '22023';
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

-- Confirmar papéis e estação. Os dois confirmados → "connecting".
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

-- ---------------------------------------------------------------- 6) conexão e prontidão
-- "Estou na chamada". Os dois → "setup".
create or replace function public.app_dupla_connected(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_ids uuid[];
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['connecting'], false);
  if v_uid = any (r.connected_ids) then
    return public.dupla_room_state(r, v_uid);
  end if;
  v_ids := r.connected_ids || v_uid;
  update public.checklist_rooms
     set connected_ids = v_ids,
         phase = case when member_ids <@ v_ids then 'setup' else phase end,
         ready_ids = case when member_ids <@ v_ids then '{}' else ready_ids end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Pronto / não pronto (fase "setup").
create or replace function public.app_dupla_ready(p_room_id uuid, p_ready boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['setup'], false);
  if p_ready is null then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  if p_ready = (v_uid = any (r.ready_ids)) then
    return public.dupla_room_state(r, v_uid);
  end if;
  update public.checklist_rooms
     set ready_ids = case when p_ready then ready_ids || v_uid else array_remove(ready_ids, v_uid) end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 7) cronômetro (o servidor manda no tempo)
-- Duração da rodada: de 1 minuto até a duração da estação. Só o avaliador, antes de iniciar.
create or replace function public.app_dupla_set_duration(p_room_id uuid, p_duration_ms integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_max integer;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['setup'], true);
  select least(s.duration_ms, 3600000) into v_max from public.checklist_stations s where s.id = r.station_id;
  if p_duration_ms is null or v_max is null or p_duration_ms < 60000 or p_duration_ms > v_max then
    raise exception 'Duração fora do permitido.' using errcode = '22023';
  end if;
  update public.checklist_rooms set duration_ms = p_duration_ms, rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Iniciar: só o avaliador, com os dois prontos. Chamar de novo (outra aba) recusa pela fase e não duplica nada.
create or replace function public.app_dupla_start(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_dur integer;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['setup'], true);
  if not (r.member_ids <@ r.ready_ids) then
    raise exception 'Os dois precisam estar prontos.' using errcode = '55000';
  end if;
  v_dur := coalesce(r.duration_ms, (select s.duration_ms from public.checklist_stations s where s.id = r.station_id), 600000);
  update public.checklist_rooms
     set phase = 'running', started_at = now(), ends_at = now() + v_dur * interval '1 millisecond',
         paused_left_ms = null, paused_at = null, paused_total_ms = 0, released_pressings = '{}', finished_at = null,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Pausar: guarda o que falta e para o relógio. Já pausada: só devolve o estado.
create or replace function public.app_dupla_pause(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['running'], true);
  if r.paused_at is not null then
    return public.dupla_room_state(r, v_uid);
  end if;
  update public.checklist_rooms
     set paused_left_ms = greatest(0, least(coalesce(extract(epoch from (ends_at - now())) * 1000, 0), 2147483647))::integer,
         paused_at = now(), ends_at = null, rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Retomar: o relógio volta com o que faltava; a pausa entra no total. Não pausada: só devolve o estado.
create or replace function public.app_dupla_resume(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['running'], true);
  if r.paused_at is null then
    return public.dupla_room_state(r, v_uid);
  end if;
  update public.checklist_rooms
     set ends_at = now() + coalesce(paused_left_ms, 0) * interval '1 millisecond',
         paused_total_ms = paused_total_ms + greatest(0, least(extract(epoch from (now() - paused_at)) * 1000, 2147483647))::integer,
         paused_at = null, paused_left_ms = null, rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ±1 minuto. Correndo: nunca menos de 30 s a partir de agora. Pausada: nunca menos de 30 s guardados.
create or replace function public.app_dupla_adjust(p_room_id uuid, p_delta_ms integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['running'], true);
  if p_delta_ms is null or p_delta_ms not in (60000, -60000) then
    raise exception 'Ajuste inválido.' using errcode = '22023';
  end if;
  if r.paused_at is not null then
    update public.checklist_rooms
       set paused_left_ms = greatest(30000, coalesce(paused_left_ms, 0) + p_delta_ms), rev = rev + 1, updated_by = v_uid
     where id = r.id
    returning * into r;
  else
    update public.checklist_rooms
       set ends_at = greatest(now() + interval '30 seconds', coalesce(ends_at, now()) + p_delta_ms * interval '1 millisecond'),
           rev = rev + 1, updated_by = v_uid
     where id = r.id
    returning * into r;
  end if;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 8) impressos
-- Liberar ou ocultar um impresso LIBERÁVEL (pelo id verdadeiro), só com a estação em andamento e só o avaliador.
create or replace function public.app_dupla_release(p_room_id uuid, p_pressing_id text, p_released boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_initial boolean;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  if r.phase = 'setup' then
    raise exception 'Disponível depois de iniciar a estação.' using errcode = '55000';
  end if;
  perform public.dupla_room_need(r, v_uid, array['running'], true);
  if p_released is null then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  select p.initially_visible into v_initial
    from public.dupla_pressings_tela((select k.content from public.checklist_station_contents k where k.station_id = r.station_id)) p
   where p.id = p_pressing_id
   limit 1;
  if not found then
    raise exception 'Impresso não encontrado.' using errcode = '22023';
  end if;
  if v_initial then
    raise exception 'Este impresso já está visível desde o início.' using errcode = '22023';
  end if;
  if p_released = (p_pressing_id = any (r.released_pressings)) then
    return public.dupla_room_state(r, v_uid);
  end if;
  update public.checklist_rooms
     set released_pressings = case when p_released then released_pressings || p_pressing_id
                                   else array_remove(released_pressings, p_pressing_id) end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 9) marcações do PEP
-- Marca (ou volta a pendente, com nível nulo) um item da estação, com os subitens. Não mexe no rev: o parceiro não vê as
-- marcações durante a rodada. → { ok: true }
create or replace function public.app_dupla_mark(p_room_id uuid, p_item_id text, p_grade text, p_subitems text[] default '{}')
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  c jsonb;
  v_item jsonb;
  v_grade text := nullif(lower(btrim(p_grade)), '');
  v_subs text[];
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['running', 'review'], true);
  select k.content into c from public.checklist_station_contents k where k.station_id = r.station_id;
  select i.e into v_item
    from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end) i(e)
   where i.e ->> 'id' = p_item_id
   limit 1;
  if v_item is null then
    raise exception 'Item do checklist não encontrado.' using errcode = '22023';
  end if;
  if v_grade is not null and (v_grade not in ('correct', 'partial', 'incorrect')
                              or coalesce(jsonb_typeof(v_item -> 'grades' -> v_grade), '') <> 'number') then
    raise exception 'Nível inválido para este item.' using errcode = '22023';
  end if;
  v_subs := array(
    select s.e ->> 'id'
      from jsonb_array_elements(case when jsonb_typeof(v_item -> 'subitems') = 'array' then v_item -> 'subitems' else '[]'::jsonb end)
           with ordinality as s(e, n)
     where s.e ->> 'id' = any (coalesce(p_subitems, '{}'))
     order by s.n
  );
  insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade, subitems_checked, updated_at)
  values (r.id, r.round, p_item_id, v_uid, v_grade, v_subs, now())
  on conflict (room_id, round, item_id) do update
    set evaluator_id = excluded.evaluator_id, grade = excluded.grade, subitems_checked = excluded.subitems_checked, updated_at = now();
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------- 10) encerrar e finalizar
-- Encerrar a estação (avaliador): "review", fim gravado; pausa em curso entra no total.
create or replace function public.app_dupla_finish(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
$$;

-- Finalizar (avaliador, em "review"): nota calculada aqui com os itens ATUAIS da estação (pendente vale 0; marcação de item que
-- sumiu não conta), feedback, e a avaliação da rodada. → "result". Clique duplo (já em "result" com a avaliação): só devolve o
-- estado. Revisão (sessão já existente com a sala em "review"): atualiza a avaliação e guarda a nota de antes.
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

-- ---------------------------------------------------------------- 11) caminho da imagem do impresso
-- Ids aceitos: 'candidate_sheet' (folha do candidato), o id verdadeiro (avaliador) ou a chave de tela 'i<n>' / 'd<n>'.
-- Candidato: só com a estação em andamento, e só a folha, um impresso inicial ou um liberado. Avaliador: setup, running e review.
-- A imagem: content.pressing_assets pela chave <id verdadeiro> ou p<posição> (a folha: 'candidate_sheet'); o valor é o id em
-- public.station_assets (texto) ou um objeto com "asset_id". Sem a tabela, sem a chave ou sem a linha → nulo.
-- TODO(dono): chave e formato de pressing_assets/candidate_sheet com a Montagem.
create or replace function public.app_dupla_print_path(p_room_id uuid, p_pressing_id text) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  c jsonb;
  v_assets jsonb;
  v_cand boolean;
  v_key text;
  v_alt text := null;
  v_val jsonb;
  v_asset text;
  v_path text;
  p record;
begin
  if not exists (select 1 from public.checklist_rooms x where x.id = p_room_id and v_uid = any (x.member_ids)) then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  perform public.dupla_sweep(p_room_id);
  select * into r from public.checklist_rooms where id = p_room_id;
  v_cand := coalesce(r.candidate_id = v_uid, false);
  if not (v_cand and r.phase = 'running'
          or coalesce(r.evaluator_id = v_uid, false) and r.phase in ('setup', 'running', 'review')) then
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;

  select k.content into c from public.checklist_station_contents k where k.station_id = r.station_id;
  c := coalesce(c, '{}'::jsonb);
  v_assets := case when jsonb_typeof(c -> 'pressing_assets') = 'object' then c -> 'pressing_assets' else '{}'::jsonb end;

  if p_pressing_id = 'candidate_sheet' then
    v_key := 'candidate_sheet';
  else
    select x.* into p
      from public.dupla_pressings_tela(c) x
     where (not v_cand and x.id = p_pressing_id)
        or p_pressing_id = case when x.initially_visible then 'i' else 'd' end || x.screen_number
     order by (x.id = p_pressing_id) desc, x.n
     limit 1;
    if not found then
      if v_cand then
        raise exception 'Impresso não liberado.' using errcode = '42501';
      end if;
      raise exception 'Impresso não encontrado.' using errcode = '22023';
    end if;
    if v_cand and not p.initially_visible and not (p.id = any (r.released_pressings)) then
      raise exception 'Impresso não liberado.' using errcode = '42501';
    end if;
    v_key := p.id;
    v_alt := 'p' || p.n;
  end if;

  v_val := coalesce(v_assets -> v_key, case when v_alt is not null then v_assets -> v_alt end);
  v_asset := case jsonb_typeof(v_val)
               when 'string' then v_val #>> '{}'
               when 'object' then case when jsonb_typeof(v_val -> 'asset_id') = 'string' then v_val ->> 'asset_id' end
             end;
  if v_asset is null or v_asset !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or to_regclass('public.station_assets') is null then
    return null;
  end if;
  execute 'select a.storage_path from public.station_assets a where a.id = $1' into v_path using v_asset::uuid;
  return v_path;
end
$$;

-- ---------------------------------------------------------------- 12) aviso de tempo real (só o rev)
-- Broadcast privado: evento 'sala', tópico 'room:<id>', payload { rev }. Só se realtime.send existir; nunca derruba a ação.
create or replace function public.dupla_room_notify() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null then
      perform realtime.send(jsonb_build_object('rev', new.rev), 'sala', 'room:' || new.id::text, true);
    end if;
  exception when others then
    null; -- o aviso é só conveniência: as telas também consultam o estado
  end;
  return null;
end
$$;

drop trigger if exists checklist_rooms_notify on public.checklist_rooms;
create trigger checklist_rooms_notify after update on public.checklist_rooms
  for each row when (new.rev is distinct from old.rev) execute function public.dupla_room_notify();

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access barra o resto.
-- As de apoio: só rodam dentro das funções do servidor (security definer).
revoke execute on function public.app_dupla_set_roles(uuid, uuid) from public, anon;
revoke execute on function public.app_dupla_draw_roles(uuid) from public, anon;
revoke execute on function public.app_dupla_set_station(uuid, text) from public, anon;
revoke execute on function public.app_dupla_confirm_roles(uuid) from public, anon;
revoke execute on function public.app_dupla_connected(uuid) from public, anon;
revoke execute on function public.app_dupla_ready(uuid, boolean) from public, anon;
revoke execute on function public.app_dupla_set_duration(uuid, integer) from public, anon;
revoke execute on function public.app_dupla_start(uuid) from public, anon;
revoke execute on function public.app_dupla_pause(uuid) from public, anon;
revoke execute on function public.app_dupla_resume(uuid) from public, anon;
revoke execute on function public.app_dupla_adjust(uuid, integer) from public, anon;
revoke execute on function public.app_dupla_release(uuid, text, boolean) from public, anon;
revoke execute on function public.app_dupla_mark(uuid, text, text, text[]) from public, anon;
revoke execute on function public.app_dupla_finish(uuid) from public, anon;
revoke execute on function public.app_dupla_finalize(uuid, jsonb) from public, anon;
revoke execute on function public.app_dupla_print_path(uuid, text) from public, anon;
revoke execute on function public.dupla_pressings_tela(jsonb) from public, anon, authenticated;
revoke execute on function public.dupla_room_for_action(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_room_need(public.checklist_rooms, uuid, text[], boolean) from public, anon, authenticated;
revoke execute on function public.dupla_room_notify() from public, anon, authenticated;
