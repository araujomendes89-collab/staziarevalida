-- =============================================================================
-- Estações da 2ª fase: segunda rodada de decisões do dono de 17/10 (número reservado em .tmp-aulas/NUMEROS-MIGRACAO.md: 013560,
-- ramo fase2-telas). Depende da 013300 (dupla_station_meta), 013350 (dupla_pressings_tela, estado da sala), 013380 (conteúdo da
-- sala), 013390 (folha do candidato) e 013400 (resultado e histórico). Pode ser colada duas vezes: "create table if not exists",
-- "create or replace function", "drop policy if exists" e "on conflict do nothing". Não cria estação nem grava nota. Nenhuma IA.
--
-- O QUE FAZ
--  1) SUBÁREA "Reumatologia" (Clínica Médica). Até aqui a lista de subáreas do app existia só como o texto da coluna
--     grande_temas.subarea (009970), sem tabela. Nova tabela area_subareas (grande área, subárea) com as subáreas já usadas pelos
--     100 grandes temas mais "Reumatologia" em Clínica Médica, e a função app_area_subareas() que devolve a lista por grande área
--     (quem entrou). As estações usam a subárea no cabeçalho do roteiro do ator e nos temas pequenos (styles); a 2025-1/01 usa
--     Reumatologia. A árvore da Central (…1400) já tinha Reumatologia.
--  2) IMPRESSO VISÍVEL DESDE O INÍCIO (decisão do dono de 17/10). Quando o INEP diz que um impresso está disponível desde o início
--     (por exemplo "em cima da maca", como o monitor e a bandeja da 2025-1/08), a estação o marca com initially_visible = true e
--     ele aparece sozinho para o candidato junto com a folha, sem o avaliador liberar. Continua numerado 1, 2, 3 com os demais.
--     Diferença para o relato/as instruções: o relato vai PARA a folha (dupla_folha_impressos, 013390) e não é numerado; o impresso
--     visível desde o início fica na lista de impressos, numerado.
--       * dupla_folha_fonte (base 013390): sai o bloqueio "impresso visível desde o início que não é o relato" (a folha em imagem
--         não esconde mais nada: esse impresso aparece na lista de impressos). Os outros bloqueios continuam.
--       * dupla_pressings_tela (base 013350, mesmas colunas): o número de tela é contínuo para tudo o que NÃO está na folha
--         (visíveis desde o início e liberáveis juntos); os impressos da folha têm contagem própria, como antes.
--       * app_dupla_room_content (base 013380): cada impresso ganha "in_sheet" (está na folha); o id de tela do candidato é 'i<n>'
--         para os da folha, 'v<n>' para os visíveis desde o início e 'd<n>' para os liberáveis; pressing_count conta os
--         impressos fora da folha (visíveis + liberáveis), que são os lugares da lista do candidato.
--       * app_dupla_print_path (base 013390): entende o id 'v<n>'.
--       * Nada muda em app_dupla_release (recusa impresso inicial: "Este impresso já está visível desde o início."), em
--         dupla_room_state nem na finalização: eles só olham os liberáveis.
--  3) "O QUE MUDOU DESDE A PROVA" (decisão do dono de 17/10). As notas de conduta atual que os revisores deixaram ficam no
--     conteúdo da estação em conduct_notes = [{ "item_order": <número do item do PEP, opcional>, "text": "<texto curto>" }] e
--     aparecem ao ALUNO só no RESULTADO (sala e histórico, Meus PEPs), depois da avaliação pelo PEP original. Não mudam a nota.
--     dupla_result_payload (base 013400) devolve conduct_notes; app_dupla_result e app_dupla_history_result já passam por ela
--     (mesmas travas: o candidato só com a sala no resultado da rodada; no histórico, só depois da revisão da nota, se pedida).
--     O conteúdo da estação só é lido por funções que escolhem os campos (a política da tabela é só da equipe), e nem o conteúdo da
--     sala, nem o estado, nem a exportação de dados trazem conduct_notes.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_folha_fonte(text) ← 013390; dupla_pressings_tela(jsonb) ← 013350; app_dupla_room_content(uuid) ← 013380;
--   app_dupla_print_path(uuid, text) ← 013390; dupla_result_payload(checklist_study_sessions, uuid) ← 013400.
--   Novas: tabela area_subareas e app_area_subareas().
--   Observação para a junção com outros ramos: o ramo publicar-fase2 (013405) redefine dupla_room_state e dupla_export_rooms; esta
--   migração não mexe nessas duas e continua valendo depois dela (só olham os impressos liberáveis, pelo id 'd<n>').
--
-- COMO DESFAZER: colar de novo dupla_folha_fonte e app_dupla_print_path da 013390, dupla_pressings_tela da 013350,
--   app_dupla_room_content da 013380 e dupla_result_payload da 013400; apagar app_area_subareas() e a tabela area_subareas.
--   conduct_notes que já estiverem gravadas nas estações ficam sem aparecer.
-- =============================================================================

-- ---------------------------------------------------------------- 1) subáreas por grande área
create table if not exists public.area_subareas (
  area text not null check (area in ('Clínica Médica', 'Cirurgia Geral', 'Ginecologia e Obstetrícia', 'Pediatria',
                                     'Medicina de Família e Comunidade', 'Saúde Mental', 'Saúde Coletiva')),
  subarea text not null check (char_length(btrim(subarea)) between 2 and 80),
  created_at timestamptz not null default now(),
  primary key (area, subarea)
);
alter table public.area_subareas enable row level security;
revoke all on table public.area_subareas from public, anon, authenticated;
grant select on table public.area_subareas to authenticated;
drop policy if exists "subáreas: quem entrou lê" on public.area_subareas;
create policy "subáreas: quem entrou lê" on public.area_subareas for select to authenticated using (true);

-- As subáreas que os 100 grandes temas já usam (a lista que existia, só como texto) e a nova.
do $seed$
begin
  if to_regclass('public.grande_temas') is not null then
    execute $q$
      insert into public.area_subareas (area, subarea)
      select distinct case t.area_nome when 'Cirurgia' then 'Cirurgia Geral' else t.area_nome end, btrim(t.subarea)
        from public.grande_temas t
       where nullif(btrim(t.subarea), '') is not null
         and (case t.area_nome when 'Cirurgia' then 'Cirurgia Geral' else t.area_nome end) in
             ('Clínica Médica', 'Cirurgia Geral', 'Ginecologia e Obstetrícia', 'Pediatria', 'Medicina de Família e Comunidade', 'Saúde Mental', 'Saúde Coletiva')
      on conflict do nothing
    $q$;
  end if;
end
$seed$;
insert into public.area_subareas (area, subarea) values ('Clínica Médica', 'Reumatologia') on conflict do nothing;

-- A lista por grande área: { "Clínica Médica": ["Cardiologia", …], … }, em ordem alfabética.
create or replace function public.app_area_subareas() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_object_agg(x.area, x.subareas order by x.area)
      from (select s.area, jsonb_agg(s.subarea order by s.subarea) as subareas from public.area_subareas s group by s.area) x
  ), '{}'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 2) impresso visível desde o início
-- Fonte da folha (base 013390): sem o bloqueio de impresso visível desde o início que não é o relato.
create or replace function public.dupla_folha_fonte(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_cenario text;
  v_tarefas text;
  v_impressos jsonb;
  v_bloqueio text := null;
begin
  select * into st from public.checklist_stations where id = p_station_id;
  if not found then
    return null;
  end if;
  select k.content into c from public.checklist_station_contents k where k.station_id = st.id;
  c := coalesce(c, '{}'::jsonb);
  v_meta := public.dupla_station_meta(st.id);
  v_cenario := case when jsonb_typeof(c -> 'doctor_scene') = 'string' then c ->> 'doctor_scene' else '' end;
  v_tarefas := case when jsonb_typeof(c -> 'doctor_tasks') = 'string' then c ->> 'doctor_tasks' else '' end;
  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', coalesce(p.e ->> 'name', ''),
           'texto', btrim(regexp_replace(regexp_replace(coalesce(p.e ->> 'content', ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n')
         ) order by p.n), '[]'::jsonb)
    into v_impressos
  from public.dupla_pressings(c) p
  where exists (select 1 from public.dupla_folha_impressos(c) f where f.n = p.n);

  if btrim(v_cenario) = '' and btrim(v_tarefas) = '' then
    v_bloqueio := 'A estação não tem cenário nem tarefas do participante para pôr na folha.';
  elsif exists (select 1 from jsonb_array_elements(v_impressos) x where btrim(x ->> 'texto') = '') then
    v_bloqueio := 'O relato do caso (impresso 1) está sem texto: confira o conteúdo antes de gerar a folha.';
  end if;

  return jsonb_build_object(
    'numero', v_meta -> 'number',
    'area', st.area,
    'duracao_ms', st.duration_ms,
    'cenario', v_cenario,
    'tarefas', v_tarefas,
    'impressos', v_impressos,
    'bloqueio', v_bloqueio
  );
end
$$;

-- Impressos com o número de tela: o que está na folha tem contagem própria; o que NÃO está na folha (visíveis desde o início e
-- liberáveis) tem uma contagem só, na ordem (display_number, posição). Base 013350 (mesmas colunas).
create or replace function public.dupla_pressings_tela(p_content jsonb) returns table (
  n bigint, e jsonb, id text, display_number integer, source_number integer, initially_visible boolean, screen_number integer
)
  language sql immutable security definer set search_path = ''
as $$
  select p.n, p.e, p.id, p.display_number, p.source_number, p.initially_visible,
         (row_number() over (partition by (f.n is not null) order by p.display_number, p.n))::integer
  from public.dupla_pressings(p_content) p
  left join public.dupla_folha_impressos(p_content) f on f.n = p.n
$$;

-- Conteúdo por papel (base 013380): in_sheet em cada impresso, ids 'i'/'v'/'d' do candidato e pressing_count sem os da folha.
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

-- Caminho da imagem (base 013390): o id de tela 'v<n>' (visível desde o início, fora da folha) também vale.
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
$$;

-- ---------------------------------------------------------------- 3) o que mudou desde a prova
-- Corpo do resultado (base 013400), mais conduct_notes.
create or replace function public.dupla_result_payload(s public.checklist_study_sessions, p_uid uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_items jsonb;
  v_prev integer;
begin
  select * into st from public.checklist_stations where id = s.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = s.station_id;
  v_meta := public.dupla_station_meta(s.station_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.e ->> 'id',
           'order', coalesce(i.e -> 'order', to_jsonb(i.n)),
           'content', coalesce(i.e ->> 'content', ''),
           'max_points', coalesce((i.e -> 'grades' ->> 'correct')::numeric, 0),
           'grade', a.grade,
           'points', case when a.grade is null then 0 else coalesce((i.e -> 'grades' ->> a.grade)::numeric, 0) end
         ) order by i.n), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end)
       with ordinality as i(e, n)
  left join lateral (
    select lower(x ->> 'grade') as grade
    from jsonb_array_elements(case when jsonb_typeof(s.checklist_answers) = 'array' then s.checklist_answers else '[]'::jsonb end) x
    where x ->> 'id' = i.e ->> 'id' and lower(x ->> 'grade') in ('correct', 'partial', 'incorrect')
    limit 1
  ) a on true;

  select round(p.correctness)::integer into v_prev
    from public.checklist_study_sessions p
   where p.doctor_id = s.doctor_id and p.station_id = s.station_id and p.id <> s.id
     and (p.finished_at, p.created_at, p.id) < (s.finished_at, s.created_at, s.id)
   order by p.finished_at desc, p.created_at desc, p.id desc
   limit 1;

  return jsonb_build_object(
    'round', s.round,
    'viewer', case when p_uid = s.doctor_id then 'candidate' else 'evaluator' end,
    'station', jsonb_build_object(
      'id', st.id, 'name', st.name, 'area', st.area, 'area_code', public.dupla_area_code(st.area),
      'number', v_meta -> 'number', 'edition', v_meta -> 'edition', 'reapplication', v_meta -> 'reapplication',
      'institution', st.institution, 'duration_ms', st.duration_ms
    ),
    'score', s.score,
    'max_score', s.max_score,
    'pct', case when s.max_score > 0 then round(s.score / s.max_score * 100)::integer else 0 end,
    'previous_pct', v_prev,
    'items', v_items,
    'evaluator', jsonb_build_object('user_id', s.actor_id, 'public_name', public.dupla_public_name(s.actor_id)),
    'candidate', jsonb_build_object('user_id', s.doctor_id, 'public_name', public.dupla_public_name(s.doctor_id)),
    'finished_at', s.finished_at,
    'used_ms', s.used_ms,
    'feedback', jsonb_build_object('pos', s.feedback_pos, 'neg', s.feedback_neg, 'gen', s.feedback_gen),
    'review', jsonb_build_object('requested_at', s.review_requested_at, 'reason', s.review_reason,
                                 'revised_at', s.revised_at, 'score_before_review', s.score_before_review),
    -- "O que mudou desde a prova" (013560): só aqui, no resultado; não mexe na nota
    'conduct_notes', coalesce((
      select jsonb_agg(jsonb_build_object('item_order', case when jsonb_typeof(n.e -> 'item_order') = 'number' then n.e -> 'item_order' end,
                                          'text', btrim(n.e ->> 'text')) order by n.o)
        from jsonb_array_elements(case when jsonb_typeof(c -> 'conduct_notes') = 'array' then c -> 'conduct_notes' else '[]'::jsonb end)
             with ordinality as n(e, o)
       where jsonb_typeof(n.e) = 'object' and jsonb_typeof(n.e -> 'text') = 'string' and btrim(n.e ->> 'text') <> ''
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------- permissões (as mesmas das migrações de base)
revoke execute on function public.dupla_folha_fonte(text) from public, anon, authenticated;
revoke execute on function public.dupla_pressings_tela(jsonb) from public, anon, authenticated;
revoke execute on function public.app_dupla_room_content(uuid) from public, anon;
revoke execute on function public.app_dupla_print_path(uuid, text) from public, anon;
revoke execute on function public.dupla_result_payload(public.checklist_study_sessions, uuid) from public, anon, authenticated;
revoke execute on function public.app_area_subareas() from public, anon;
grant execute on function public.app_area_subareas() to authenticated;
