-- =============================================================================
-- Treino em Dupla, Etapa P (pacote de design de 11/10): o candidato NUNCA recebe o tema da estação; impressos iniciais.
-- (Plano de 12/10: "migração 9900". O número 9900 já é de outra frente no main; este arquivo usa 012900, reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md.) Depende da 9750, 9760 e 9770 do Treino e da 011500 (Termo 2.0) do main.
-- Pode ser colada duas vezes: só "create or replace function", "drop policy if exists" e permissões. Não cria tabela nem
-- grava dado.
--
-- O QUE FAZ
--  1) dupla_room_state (estado da sala): a estação só traz o nome (e o id) para o AVALIADOR, ou para os dois no RESULTADO.
--     Os outros recebem "label" = 'Estação N' (ou 'Estação' sem número), área, número, edição, instituição e duração.
--     Sem avaliador definido (fase dos papéis) ninguém recebe o nome. Os impressos liberados ("released_pressings") vão ao
--     candidato com a chave de tela 'd<número de tela>' (o id verdadeiro do impresso pode conter o nome da estação).
--  2) app_dupla_room_content (conteúdo por papel), conforme o pacote:
--     candidato: estação sem nome e sem id (com "label"), cenário, tarefas, duração, "candidate_sheet": { has_image } e os
--       impressos INICIAIS (initially_visible, visíveis desde o início, sem liberação) mais os liberados, cada um com
--       { id ('i<n>' inicial, 'd<n>' liberável; n = número de tela), display_number, name, content (sem a linha "Liberação: …"),
--       has_image, initially_visible }; os números de tela são contados à parte para iniciais e liberáveis (como na P1).
--       sem source_number. "pressing_count" conta só os liberáveis (os iniciais ficam fora).
--     avaliador: tudo, com id verdadeiro, display_number, source_number e initially_visible de cada impresso.
--     Padrão para estação sem os campos novos: source_number = display_number = posição; nenhum impresso inicial.
--  3) Sala lida direto da tabela: sai a política "salas: membros leem" (o app só lê a sala pelas funções acima; a leitura direta
--     entregava o station_id e os ids dos impressos ao candidato). A exportação dos dados lê as salas por dupla_export_rooms.
--  4) app_export_my_data: refeita a partir da MAIS NOVA do main (…011500_termo_v2_declaracoes.sql, com "declarations"),
--     mais as 4 chaves do Treino (as mesmas da 9750). A 9750 partia da …5300 e apagaria "declarations" ao ser colada.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_room_state(checklist_rooms, uuid) ← 9760; app_dupla_room_content(uuid) ← 9750;
--   app_export_my_data() ← 011500 (+ chaves do Treino da 9750). Nova: dupla_export_rooms().
--
-- REGRA PARA AS PRÓXIMAS (9910/T14): o resultado (app_dupla_result) só pode existir depois da fase "review"; a avaliação
-- (checklist_study_sessions) não pode ser criada antes do resultado, senão o candidato leria o nome por ali.
-- TODO(dono): a chave da imagem da folha do candidato em content.pressing_assets ('candidate_sheet') e os 3 campos do
-- impresso (source_number, display_number, initially_visible) precisam ser combinados com a Montagem de estações.
--
-- COMO DESFAZER: colar de novo dupla_room_state da 9760, app_dupla_room_content da 9750 e app_export_my_data da 011500
--   (mais as 4 chaves do Treino); recriar a política "salas: membros leem" da …0400
--   (for select to authenticated using ((select auth.uid()) = any (member_ids))); apagar dupla_export_rooms().
-- =============================================================================

-- ---------------------------------------------------------------- 1) apoio: impressos da estação com os números
-- Uma linha por impresso, na ordem do documento: posição, id, número de tela, número de origem e se é inicial.
-- Interna (só as funções do servidor chamam).
create or replace function public.dupla_pressings(p_content jsonb) returns table (
  n bigint, e jsonb, id text, display_number integer, source_number integer, initially_visible boolean
)
  language sql immutable security definer set search_path = ''
as $$
  select p.n, p.e, p.e ->> 'id',
         coalesce(case when jsonb_typeof(p.e -> 'display_number') = 'number' then (p.e ->> 'display_number')::integer end, p.n::integer),
         coalesce(case when jsonb_typeof(p.e -> 'source_number') = 'number' then (p.e ->> 'source_number')::integer end, p.n::integer),
         coalesce(case when jsonb_typeof(p.e -> 'initially_visible') = 'boolean' then (p.e ->> 'initially_visible')::boolean end, false)
  from jsonb_array_elements(case when jsonb_typeof(p_content -> 'pressings') = 'array' then p_content -> 'pressings' else '[]'::jsonb end)
       with ordinality as p(e, n)
$$;

-- ---------------------------------------------------------------- 2) estado da sala (base: 9760)
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
        -- Quem não vê o nome recebe os impressos liberados pela chave de tela ('d<n>'), nunca pelo id verdadeiro.
        select coalesce(jsonb_agg('d' || p.display_number order by p.n), '[]'::jsonb) into v_released
          from public.dupla_pressings((select k.content from public.checklist_station_contents k where k.station_id = st.id)) p
         where p.id = any (p_room.released_pressings) and not p.initially_visible;
      end if;
    end if;
  end if;

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
      'ready', p_uid = any (p_room.ready_ids)
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

-- ---------------------------------------------------------------- 3) conteúdo por papel (base: 9750)
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
                                               'doctor_tasks', coalesce(c ->> 'doctor_tasks', ''));
  if v_role = 'evaluator' then
    v_station := v_station || jsonb_build_object('actor_script', coalesce(c ->> 'actor_script', ''));
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'index', p.n, 'display_number', p.display_number, 'source_number', p.source_number,
             'initially_visible', p.initially_visible,
             'name', coalesce(p.e ->> 'name', ''), 'content', coalesce(p.e ->> 'content', ''),
             'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
           ) order by p.n), '[]'::jsonb)
      into v_pressings
    from public.dupla_pressings(c) p;

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
  -- o número de origem nem o nome de arquivo. TODO(dono): chave 'candidate_sheet' combinada com a Montagem de estações.
  v_station := v_station || jsonb_build_object('candidate_sheet', jsonb_build_object('has_image', v_assets ? 'candidate_sheet'));
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', case when p.initially_visible then 'i' else 'd' end || p.display_number,
           'display_number', p.display_number, 'initially_visible', p.initially_visible,
           'name', coalesce(p.e ->> 'name', ''),
           'content', btrim(regexp_replace(regexp_replace(coalesce(p.e ->> 'content', ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n'),
           'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
         ) order by p.initially_visible desc, p.display_number, p.n), '[]'::jsonb)
    into v_pressings
  from public.dupla_pressings(c) p
  where p.initially_visible or p.id = any (r.released_pressings);
  return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings);
end
$$;

-- ---------------------------------------------------------------- 4) leitura direta da sala: fechada
-- O app lê a sala só pelas funções (app_dupla_room, app_dupla_room_content). Ninguém grava direto desde a 9750.
drop policy if exists "salas: membros leem" on public.checklist_rooms;

-- Salas da própria pessoa para a exportação dos dados. Sala aberta em que a pessoa é candidata (antes do resultado): sem a
-- estação e sem os impressos liberados.
create or replace function public.dupla_export_rooms() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(
           case when t.phase not in ('closed', 'result') and (select auth.uid()) is distinct from t.evaluator_id
                then to_jsonb(t) - 'station_id' - 'released_pressings'
                else to_jsonb(t) end
           order by t.created_at), '[]'::jsonb)
  from public.checklist_rooms t
  where (select auth.uid()) is not null and (select auth.uid()) = any (t.member_ids)
$$;

-- ---------------------------------------------------------------- 5) exportação dos dados (base: 011500 + chaves do Treino)
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
    -- sem station_id: o tema da estação não sai pela exportação (a coluna nem é legível pelo aluno)
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
                     where a.user_id = (select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
-- "create or replace" mantém as permissões das funções que já existiam. As novas: só dentro do servidor, menos a da
-- exportação: app_export_my_data roda com os direitos de quem chama (inclusive o visitante, que recebe nulo), e o banco confere
-- a permissão de dupla_export_rooms antes de olhar o "where"; ela só devolve as salas de quem está logado (visitante: lista vazia).
revoke execute on function public.dupla_pressings(jsonb) from public, anon, authenticated;
revoke execute on function public.dupla_export_rooms() from public;
grant execute on function public.dupla_export_rooms() to anon, authenticated;
