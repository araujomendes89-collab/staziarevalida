-- DESFAZER da 20261003014140_treino_dupla_fluxo_sigilo.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014150 → 014130): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- função refeita: app_dupla_room_content(uuid) volta como era antes desta migração (definição da 013980)
CREATE OR REPLACE FUNCTION public.app_dupla_room_content(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- os números de tela (slots) são os impressos que NÃO estão na folha: liberáveis e visíveis desde o início
  select count(*) into v_count from public.dupla_pressings(c) p
   where not exists (select 1 from public.dupla_folha_impressos(c) f where f.n = p.n);
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
             'initially_visible', p.initially_visible, 'in_sheet', s.in_sheet,
             'name', coalesce(p.e ->> 'name', ''), 'content', coalesce(p.e ->> 'content', ''),
             'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
           ) order by p.n), '[]'::jsonb)
      into v_pressings
    from public.dupla_pressings_tela(c) p
    cross join lateral (select exists (select 1 from public.dupla_folha_impressos(c) f where f.n = p.n) as in_sheet) s;

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
           'id', case when s.in_sheet then 'i' when p.initially_visible then 'v' else 'd' end || p.screen_number,
           'display_number', p.screen_number, 'initially_visible', p.initially_visible, 'in_sheet', s.in_sheet,
           'name', coalesce(p.e ->> 'name', ''),
           'content', btrim(regexp_replace(regexp_replace(coalesce(p.e ->> 'content', ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n'),
           'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
         ) order by s.in_sheet desc, p.screen_number, p.n), '[]'::jsonb)
    into v_pressings
  from public.dupla_pressings_tela(c) p
  cross join lateral (select exists (select 1 from public.dupla_folha_impressos(c) f where f.n = p.n) as in_sheet) s
  where p.initially_visible or p.id = any (r.released_pressings);
  return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings);
end
$function$;
-- função refeita: dupla_room_state(checklist_rooms,uuid) volta como era antes desta migração (definição da 013406)
CREATE OR REPLACE FUNCTION public.dupla_room_state(p_room checklist_rooms, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
-- função refeita: app_dupla_result(uuid,integer) volta como era antes desta migração (definição da 013400)
CREATE OR REPLACE FUNCTION public.app_dupla_result(p_room_id uuid, p_round integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := public.dupla_assert_access();
  s public.checklist_study_sessions;
  r public.checklist_rooms;
begin
  select * into s from public.checklist_study_sessions where room_id = p_room_id and round = p_round;
  if not found or (v_uid is distinct from s.doctor_id and v_uid is distinct from s.actor_id) then
    raise exception 'Resultado ainda não liberado.' using errcode = '42501';
  end if;
  if v_uid = s.doctor_id and v_uid is distinct from s.actor_id then
    select * into r from public.checklist_rooms where id = p_room_id;
    if found and r.round = p_round and r.phase <> 'result' then
      raise exception 'Resultado ainda não liberado.' using errcode = '42501';
    end if;
  end if;
  return public.dupla_result_payload(s, v_uid);
end
$function$;
-- função refeita: app_dupla_history_result(uuid,integer) volta como era antes desta migração (definição da 013400)
CREATE OR REPLACE FUNCTION public.app_dupla_history_result(p_room_id uuid, p_round integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  s public.checklist_study_sessions;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  select * into s from public.checklist_study_sessions where room_id = p_room_id and round = p_round;
  if not found or (v_uid is distinct from s.doctor_id and v_uid is distinct from s.actor_id) then
    raise exception 'Resultado ainda não liberado.' using errcode = '42501';
  end if;
  if not public.dupla_history_released(s) then
    raise exception 'Aguardando revisão da nota.' using errcode = '55000';
  end if;
  return public.dupla_result_payload(s, v_uid);
end
$function$;
-- função refeita: app_dupla_history(integer) volta como era antes desta migração (definição da 014090)
CREATE OR REPLACE FUNCTION public.app_dupla_history(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.fim desc, x.sid desc)
      from (
        select s.finished_at as fim, s.id as sid, jsonb_build_object(
                 'room_id', s.room_id,
                 'round', s.round,
                 'role', case when s.doctor_id = v_uid then 'candidate' else 'evaluator' end,
                 'status', case when z.ok then 'concluida' else 'aguardando_revisao' end,
                 'revised', s.revised_at is not null,
                 'finished_at', s.finished_at,
                 'partner', jsonb_build_object('public_name',
                              public.dupla_public_name(case when s.doctor_id = v_uid then s.actor_id else s.doctor_id end)),
                 'station', jsonb_build_object(
                   'number', z.meta -> 'number',
                   'area', st.area,
                   'area_code', public.dupla_area_code(st.area),
                   'name', case when z.ok then st.name end,
                   'edition', case when z.ok then z.meta -> 'edition' end),
                 'score', case when z.ok then s.score end,
                 'max_score', case when z.ok then s.max_score end,
                 'pct', case when z.ok and s.max_score > 0 then round(s.score / s.max_score * 100)::integer end
               ) as j
          from public.checklist_study_sessions s
          left join public.checklist_stations st on st.id = s.station_id
          cross join lateral (select public.dupla_history_released(s) as ok, public.dupla_station_meta(s.station_id) as meta) z
         where s.room_id is not null and s.mode = 'dupla'
           and (s.doctor_id = v_uid or s.actor_id = v_uid)
         order by s.finished_at desc nulls last, s.id desc
         limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) x
  ), '[]'::jsonb);
end
$function$;
-- função refeita: app_dupla_print_path(uuid,text) volta como era antes desta migração (definição da 013560)
CREATE OR REPLACE FUNCTION public.app_dupla_print_path(p_room_id uuid, p_pressing_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        or p_pressing_id = case when exists (select 1 from public.dupla_folha_impressos(c) f where f.n = x.n) then 'i'
                                when x.initially_visible then 'v' else 'd' end || x.screen_number
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

  -- folha gerada pelo app (013390): a imagem de dupla_station_sheets, se ainda for do conteúdo atual
  if v_key = 'candidate_sheet' and jsonb_typeof(v_val) = 'object' and jsonb_typeof(v_val -> 'folha') = 'string' then
    select s.storage_path into v_path
      from public.dupla_station_sheets s
     where s.station_id = r.station_id and s.storage_path is not null and s.sha256 = v_val ->> 'folha'
       and s.source_hash = public.dupla_folha_hash(r.station_id);
    return v_path;
  end if;

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
$function$;
-- funções criadas por ela
drop function if exists public.dupla_porta(text);
drop function if exists public.dupla_antes_do_inicio(public.checklist_rooms);
