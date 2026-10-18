-- =============================================================================
-- 2ª fase: junção com o main (18/10/2026, ramo publicar-fase2-v2). Número reservado em .tmp-aulas/NUMEROS-MIGRACAO.md: 013980.
-- Pode ser colada duas vezes: "create or replace function" e um remendo que confere antes de mexer. Não cria estação, pessoa nem
-- nota. Nenhuma IA. Não abre nada ao aluno.
--
-- POR QUE EXISTE
--   As migrações da 2ª fase (013300 a 013560) têm números MENORES que as do main publicadas depois delas (013570 a 013960), mas em
--   produção são coladas DEPOIS. Duas funções ficariam com a versão errada no fim, conforme a ordem:
--   1) app_dupla_room_content(uuid): a 013406 (publicar-fase2) acrescentou o fechamento pela dupla_sweep e o aviso "Esta estação
--      ficou indisponível" sobre a versão da 013380; a 013560 (fase2-telas, impresso visível desde o início, "in_sheet", ids
--      'v<n>') também partiu da 013380 e, colada depois, desfaz o acréscimo da 013406. Aqui: a versão da 013560 MAIS o acréscimo
--      da 013406 (deixa de ser "stable" porque chama dupla_sweep, que pode fechar a rodada).
--   2) app_export_my_data(): o Termo 3.0 (013740, já em produção) remendou a exportação (aceites com ip, text_sha256 e
--      companions). As migrações da 2ª fase (013300, 013340, 013370, 013380, 013400, 013405, 013406) redefinem a função inteira a
--      partir da versão de antes do Termo 3.0; coladas depois, tiram o remendo. Aqui: o MESMO remendo da 013740 (seção 6), que
--      não faz nada se a função já estiver remendada (banco montado na ordem dos números) e recusa se o trecho mudou.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_room_content(uuid) ← 013560 (+ 013406); app_export_my_data() ← a que estiver no banco (só o trecho dos aceites).
--
-- COMO DESFAZER: colar de novo app_dupla_room_content da 013560. O remendo da exportação não se desfaz (é o do Termo 3.0).
-- =============================================================================

-- ---------------------------------------------------------------- 1) conteúdo da sala por papel (013560 + 013406)
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
$$;
revoke execute on function public.app_dupla_room_content(uuid) from public, anon;

-- ---------------------------------------------------------------- 2) exportação dos dados: o remendo do Termo 3.0 (igual à 013740)
do $exporta$
declare
  v_fn constant regprocedure := to_regprocedure('public.app_export_my_data()');
  v_def text;
  v_de constant text := '''user_agent'', t.user_agent)';
  v_para constant text := '''user_agent'', t.user_agent, ''ip'', host(t.ip), ''text_sha256'', t.text_sha256, ''companions'', t.companions)';
begin
  if v_fn is null then
    raise exception '2ª fase (013980): public.app_export_my_data() não existe';
  end if;
  -- sem as colunas do Termo 3.0 (banco antes da 013740): nada a remendar aqui; a 013740 remenda quando vier
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'legal_acceptances' and column_name = 'text_sha256') then
    return;
  end if;
  v_def := pg_get_functiondef(v_fn);
  if position(v_para in v_def) > 0 then
    return;
  end if;
  if position(v_de in v_def) = 0 then
    raise exception '2ª fase (013980): app_export_my_data no banco é diferente da esperada (trecho dos aceites); nada foi mudado';
  end if;
  execute replace(v_def, v_de, v_para);
end
$exporta$;
