-- =============================================================================
-- Treino em Dupla: FOLHA DO CANDIDATO gerada como IMAGEM, para todas as estações (pedido do dono de 16/10).
-- (Número reservado em .tmp-aulas/NUMEROS-MIGRACAO.md, ramo folha-candidato.)
-- Depende da 013300 (dupla_station_meta), 013340 (dupla_pressings) e 013350 (app_dupla_print_path, dupla_pressings_tela).
-- Pode ser colada duas vezes: "create table if not exists", "create or replace function" e permissões. Não grava dado de
-- estação sozinha. Nenhuma IA.
--
-- O QUE FAZ
--  1) Regra do relato (decisão do dono, item 5 do handoff de 11/10): quando o IMPRESSO 1 (e os seguintes, em sequência) se
--     chama "Relato do caso (clínico)" ou "Instruções ao/para o(a) participante", ele vai para a folha do candidato: fica
--     visível desde o início e sai da fila de liberação. Os outros impressos seguem numerados 1, 2, 3 (números de tela da
--     013350). Também vale para impresso marcado "initially_visible" com esse nome. Nova dupla_folha_impressos; a
--     dupla_pressings (013340) passa a usar a regra.
--  2) Fonte da folha (dupla_folha_fonte): número da estação (do id, como na sala), área, duração, cenário, tarefas e o texto
--     dos impressos que vão para a folha (sem as linhas "Liberação: …", como o candidato recebe). NUNCA o nome nem o tema.
--     A marca do conteúdo (dupla_folha_hash) é o md5 dessa fonte: mudou o conteúdo, a folha fica desatualizada.
--  3) Tabela dupla_station_sheets: uma linha por estação (pedido, imagem pronta, falha), só lida pelas funções.
--     A imagem fica no depósito privado (content-hub) em dupla/folhas/<sha256>.png (o nome do arquivo não diz a estação).
--  4) Ao gravar a imagem, o conteúdo da estação ganha pressing_assets.candidate_sheet = { "folha": "<sha256>" } (a chave que a
--     sala já lê para mostrar a folha em imagem: app_dupla_room_content devolve candidate_sheet.has_image). Só essa chave muda.
--  5) app_dupla_print_path (013350): para 'candidate_sheet' com { "folha": … } devolve o caminho da imagem gerada, só se ela
--     ainda corresponde ao conteúdo atual (desatualizada → nulo → a sala mostra o texto). O resto da função é igual.
--  6) Administração › Estações: app_admin_dupla_folhas (situação de todas), app_admin_dupla_folha (fonte, marca e situação de
--     uma, para a pré-visualização), app_admin_dupla_folha_pedir (pedir para gerar/regerar) e app_admin_dupla_folha_caminho
--     (caminho da imagem atual para a equipe ver). Ver e pedir: equipe (administrador ou editor); ver: também revisores.
--  7) Processamento (servidor, Cloud Run, comando): ch_worker_dupla_folha_fonte, ch_worker_dupla_folha_gravar,
--     ch_worker_dupla_folha_falha e ch_worker_dupla_folhas_a_gerar (pedidas; com p_todas, também as aprovadas sem folha
--     ou com folha desatualizada).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_pressings(jsonb) ← 013340 (igual, mais a regra do item 1);
--   app_dupla_print_path(uuid, text) ← 013350 (igual, mais o item 5).
--   NÃO redefine app_dupla_room_content nem dupla_room_state (a 013380, do ramo dupla-ajustes2, pode mexer nelas).
--
-- REGRA QUE NÃO MUDA: o candidato nunca recebe o tema antes do resultado (a folha não tem nome nem tema; o caminho do arquivo
-- é o sha256 da imagem); a coluna station_id de study_matches continua fora do alcance do aluno.
--
-- COMO DESFAZER: colar de novo dupla_pressings da 013340 e app_dupla_print_path da 013350; apagar as funções novas
--   (dupla_folha_nome_casa(text), dupla_folha_impressos(jsonb), dupla_folha_fonte(text), dupla_folha_hash(text),
--   dupla_folha_situacao(text), app_admin_dupla_folhas(), app_admin_dupla_folha(text), app_admin_dupla_folha_pedir(text),
--   app_admin_dupla_folha_caminho(text), ch_worker_dupla_folha_fonte(text), ch_worker_dupla_folha_gravar(uuid, text, text,
--   text, text, integer, integer, integer, text), ch_worker_dupla_folha_falha(text, text), ch_worker_dupla_folhas_a_gerar(
--   boolean, integer)) e a tabela dupla_station_sheets; tirar pressing_assets.candidate_sheet do conteúdo das estações que
--   tiverem { "folha": … }.
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabela
create table if not exists public.dupla_station_sheets (
  station_id text primary key references public.checklist_stations (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  -- última imagem gerada (continua valendo enquanto corresponder ao conteúdo, mesmo com um pedido novo)
  storage_path text check (storage_path is null or storage_path ~ '^dupla/folhas/[0-9a-f]{64}\.png$'),
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{32}$'),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  template_version text check (template_version is null or char_length(template_version) <= 40),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  bytes integer check (bytes is null or bytes > 0),
  error text check (error is null or char_length(error) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz,
  generated_by uuid references auth.users (id) on delete set null,
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.dupla_station_sheets enable row level security;
-- sem políticas: ninguém lê nem grava direto; só as funções abaixo
revoke all on table public.dupla_station_sheets from anon, authenticated;

-- ---------------------------------------------------------------- 2) regra do relato
-- O nome é do relato do caso ou das instruções ao participante? (sem diferença de maiúsculas; com ou sem acento)
create or replace function public.dupla_folha_nome_casa(p_name text) returns boolean
  language sql immutable security definer set search_path = ''
as $$
  select coalesce(lower(p_name), '') ~ '(relato\s+d[oea]\s+caso|instru[cçÇ][oõÕ]es\s+(\S+\s+){0,3}participante)'
$$;

-- Impressos que vão para a folha: a sequência que começa no impresso 1 com esses nomes, mais qualquer impresso marcado
-- "initially_visible" com esse nome. Na ordem do documento (posição n).
create or replace function public.dupla_folha_impressos(p_content jsonb) returns table (n bigint, id text)
  language sql immutable security definer set search_path = ''
as $$
  with p as (
    select x.n, x.e ->> 'id' as id, public.dupla_folha_nome_casa(x.e ->> 'name') as casa,
           coalesce(jsonb_typeof(x.e -> 'initially_visible') = 'boolean' and (x.e ->> 'initially_visible')::boolean, false) as inicial
    from jsonb_array_elements(case when jsonb_typeof(p_content -> 'pressings') = 'array' then p_content -> 'pressings' else '[]'::jsonb end)
         with ordinality as x(e, n)
  ), corte as (
    select coalesce(min(p.n), 9223372036854775807) as primeiro_fora from p where not p.casa
  )
  select p.n, p.id from p, corte where p.casa and (p.n < corte.primeiro_fora or p.inicial) order by p.n
$$;

-- Impressos com os números (base: 013340). Novo: o impresso que vai para a folha conta como inicial.
create or replace function public.dupla_pressings(p_content jsonb) returns table (
  n bigint, e jsonb, id text, display_number integer, source_number integer, initially_visible boolean
)
  language sql immutable security definer set search_path = ''
as $$
  select p.n, p.e, p.e ->> 'id',
         coalesce(case when jsonb_typeof(p.e -> 'display_number') = 'number' then (p.e ->> 'display_number')::integer end, p.n::integer),
         coalesce(case when jsonb_typeof(p.e -> 'source_number') = 'number' then (p.e ->> 'source_number')::integer end, p.n::integer),
         coalesce(case when jsonb_typeof(p.e -> 'initially_visible') = 'boolean' then (p.e ->> 'initially_visible')::boolean end, false)
           or exists (select 1 from public.dupla_folha_impressos(p_content) f where f.n = p.n)
  from jsonb_array_elements(case when jsonb_typeof(p_content -> 'pressings') = 'array' then p_content -> 'pressings' else '[]'::jsonb end)
       with ordinality as p(e, n)
$$;

-- ---------------------------------------------------------------- 3) fonte e marca da folha
-- O que entra na imagem, exatamente como está na estação (sem resumir nem corrigir). "bloqueio": por que não dá para gerar.
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
  elsif exists (select 1 from public.dupla_pressings(c) p
                 where p.initially_visible and not exists (select 1 from public.dupla_folha_impressos(c) f where f.n = p.n)) then
    v_bloqueio := 'A estação tem impresso visível desde o início que não é o relato do caso nem as instruções: com a folha em imagem ele deixaria de aparecer ao candidato. Confira os impressos antes de gerar.';
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

create or replace function public.dupla_folha_hash(p_station_id text) returns text
  language sql stable security definer set search_path = ''
as $$
  select md5(public.dupla_folha_fonte(p_station_id)::text)
$$;

-- Situação da folha de uma estação, para a Administração:
--   nenhuma | pedida | pronta | desatualizada | falhou, mais "bloqueio" (não dá para gerar e por quê).
-- "pronta" = imagem gravada, do conteúdo atual, e o conteúdo ainda aponta para ela (pressing_assets.candidate_sheet).
create or replace function public.dupla_folha_situacao(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.dupla_station_sheets;
  v_fonte jsonb := public.dupla_folha_fonte(p_station_id);
  v_hash text := md5(v_fonte::text);
  v_marca text;
  v_atual boolean;
  v_estado text;
begin
  select * into s from public.dupla_station_sheets where station_id = p_station_id;
  select k.content #>> '{pressing_assets,candidate_sheet,folha}' into v_marca
    from public.checklist_station_contents k where k.station_id = p_station_id;
  v_atual := s.storage_path is not null and s.source_hash = v_hash and v_marca is not distinct from s.sha256;
  v_estado := case
    when s.station_id is null then 'nenhuma'
    when s.status = 'pending' then 'pedida'
    when s.status = 'failed' then 'falhou'
    when s.storage_path is null then 'nenhuma'
    when v_atual then 'pronta'
    else 'desatualizada'
  end;
  return jsonb_build_object(
    'estado', v_estado,
    'imagem_valendo', coalesce(v_atual, false),
    'tem_imagem', s.storage_path is not null,
    'bloqueio', v_fonte ->> 'bloqueio',
    'com_relato', jsonb_array_length(coalesce(v_fonte -> 'impressos', '[]'::jsonb)) > 0,
    'gerada_em', s.generated_at,
    'pedida_em', s.requested_at,
    'modelo', s.template_version,
    'erro', s.error
  );
end
$$;

-- ---------------------------------------------------------------- 4) caminho da imagem na sala (base: 013350)
-- Igual à 013350, mais: a folha do candidato com { "folha": … } vem de dupla_station_sheets, só se ainda corresponde ao
-- conteúdo atual (senão nulo, e a sala mostra o texto).
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

-- ---------------------------------------------------------------- 5) Administração › Estações
-- Situação da folha de todas as estações: { "<id>": situação }. Equipe e revisores (como a aba Estações).
create or replace function public.app_admin_dupla_folhas() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.checklist_station_assert_staff();
  return coalesce((select jsonb_object_agg(s.id, public.dupla_folha_situacao(s.id)) from public.checklist_stations s), '{}'::jsonb);
end
$$;

-- Uma estação: a fonte (para a pré-visualização, com o mesmo modelo do servidor), a marca e a situação.
create or replace function public.app_admin_dupla_folha(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fonte jsonb;
begin
  perform public.checklist_station_assert_staff();
  v_fonte := public.dupla_folha_fonte(p_station_id);
  if v_fonte is null then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('fonte', v_fonte, 'hash', md5(v_fonte::text), 'situacao', public.dupla_folha_situacao(p_station_id));
end
$$;

-- Pedir para gerar (ou regerar) a folha: só a equipe (administrador ou editor). Quem gera é o servidor/processamento.
create or replace function public.app_admin_dupla_folha_pedir(p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_fonte jsonb;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Gerar a folha do candidato: só a equipe (administrador ou editor).' using errcode = '42501';
  end if;
  v_fonte := public.dupla_folha_fonte(p_station_id);
  if v_fonte is null then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  if v_fonte ->> 'bloqueio' is not null then
    raise exception '%', v_fonte ->> 'bloqueio' using errcode = '22023';
  end if;
  insert into public.dupla_station_sheets (station_id, status, requested_by, requested_at, error, updated_at)
  values (p_station_id, 'pending', v_uid, now(), null, now())
  on conflict (station_id) do update
    set status = 'pending', requested_by = excluded.requested_by, requested_at = excluded.requested_at, error = null, updated_at = now();
  return public.dupla_folha_situacao(p_station_id);
end
$$;

-- Caminho da imagem atual (mesmo desatualizada), para a equipe ver na Administração. Nulo sem imagem.
create or replace function public.app_admin_dupla_folha_caminho(p_station_id text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.checklist_station_assert_staff();
  return (select s.storage_path from public.dupla_station_sheets s where s.station_id = p_station_id);
end
$$;

-- ---------------------------------------------------------------- 6) processamento (só o servidor, com a chave de serviço)
create or replace function public.ch_worker_dupla_folha_fonte(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fonte jsonb := public.dupla_folha_fonte(p_station_id);
begin
  if v_fonte is null then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('fonte', v_fonte, 'hash', md5(v_fonte::text));
end
$$;

-- Grava a imagem gerada: confere que o conteúdo não mudou durante a geração (p_hash), registra e aponta o conteúdo da estação
-- para ela (pressing_assets.candidate_sheet = { "folha": sha256 }). p_actor: quem pediu (nulo = comando do administrador).
create or replace function public.ch_worker_dupla_folha_gravar(
  p_actor uuid, p_station_id text, p_hash text, p_path text, p_sha256 text, p_width integer, p_height integer, p_bytes integer,
  p_modelo text
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_fonte jsonb := public.dupla_folha_fonte(p_station_id);
begin
  if v_fonte is null then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  if p_actor is not null and not public.user_is_staff(p_actor) then
    raise exception 'Gerar a folha do candidato: só a equipe (administrador ou editor).' using errcode = '42501';
  end if;
  if v_fonte ->> 'bloqueio' is not null then
    raise exception '%', v_fonte ->> 'bloqueio' using errcode = '22023';
  end if;
  if p_hash is distinct from md5(v_fonte::text) then
    raise exception 'O conteúdo da estação mudou durante a geração: gere a folha de novo.' using errcode = '40001';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_path is distinct from 'dupla/folhas/' || p_sha256 || '.png' then
    raise exception 'Arquivo da folha inválido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.checklist_station_contents k where k.station_id = p_station_id) then
    raise exception 'A estação não tem conteúdo cadastrado.' using errcode = '22023';
  end if;

  insert into public.dupla_station_sheets (station_id, status, storage_path, source_hash, sha256, template_version, width_px, height_px,
                                           bytes, error, generated_by, generated_at, updated_at)
  values (p_station_id, 'ready', p_path, p_hash, p_sha256, left(p_modelo, 40), p_width, p_height, p_bytes, null, p_actor, now(), now())
  on conflict (station_id) do update
    set status = 'ready', storage_path = excluded.storage_path, source_hash = excluded.source_hash, sha256 = excluded.sha256,
        template_version = excluded.template_version, width_px = excluded.width_px, height_px = excluded.height_px,
        bytes = excluded.bytes, error = null, generated_by = excluded.generated_by, generated_at = excluded.generated_at,
        updated_at = now();

  update public.checklist_station_contents k
     set content = jsonb_set(k.content, '{pressing_assets}',
                             case when jsonb_typeof(k.content -> 'pressing_assets') = 'object' then k.content -> 'pressing_assets' else '{}'::jsonb end
                             || jsonb_build_object('candidate_sheet', jsonb_build_object('folha', p_sha256)))
   where k.station_id = p_station_id;
  return public.dupla_folha_situacao(p_station_id);
end
$$;

create or replace function public.ch_worker_dupla_folha_falha(p_station_id text, p_error text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.dupla_station_sheets (station_id, status, error, updated_at)
  values (p_station_id, 'failed', left(coalesce(nullif(btrim(p_error), ''), 'Falha sem mensagem.'), 500), now())
  on conflict (station_id) do update set status = 'failed', error = excluded.error, updated_at = now();
  return public.dupla_folha_situacao(p_station_id);
end
$$;

-- Estações para gerar agora: as pedidas (mais antigas primeiro); com p_todas, também as aprovadas pela revisão médica sem
-- folha valendo (nenhuma, desatualizada ou que falhou). As que têm bloqueio ficam de fora.
create or replace function public.ch_worker_dupla_folhas_a_gerar(p_todas boolean default false, p_limit integer default 50) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  return coalesce((
    select jsonb_agg(x.id order by x.ordem, x.quando, x.id)
    from (
      select s.id,
             case when f.status = 'pending' then 0 else 1 end as ordem,
             coalesce(f.requested_at, s.created_at) as quando
      from public.checklist_stations s
      left join public.dupla_station_sheets f on f.station_id = s.id
      where public.dupla_folha_fonte(s.id) ->> 'bloqueio' is null
        and (f.status = 'pending'
             or coalesce(p_todas, false) and s.medical_review = 'approved'
                and not coalesce((public.dupla_folha_situacao(s.id) ->> 'imagem_valendo')::boolean, false))
      order by 2, 3, 1
      limit greatest(1, least(coalesce(p_limit, 50), 500))
    ) x
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 7) permissões
-- Apoio: só dentro das funções (security definer).
revoke execute on function public.dupla_folha_nome_casa(text) from public, anon, authenticated;
revoke execute on function public.dupla_folha_impressos(jsonb) from public, anon, authenticated;
revoke execute on function public.dupla_pressings(jsonb) from public, anon, authenticated;
revoke execute on function public.dupla_folha_fonte(text) from public, anon, authenticated;
revoke execute on function public.dupla_folha_hash(text) from public, anon, authenticated;
revoke execute on function public.dupla_folha_situacao(text) from public, anon, authenticated;
-- Sala: logado (a função confere sala, papel e fase).
revoke execute on function public.app_dupla_print_path(uuid, text) from public, anon;
-- Administração: logado (as funções conferem equipe/revisor).
revoke execute on function public.app_admin_dupla_folhas() from public, anon;
revoke execute on function public.app_admin_dupla_folha(text) from public, anon;
revoke execute on function public.app_admin_dupla_folha_pedir(text) from public, anon;
revoke execute on function public.app_admin_dupla_folha_caminho(text) from public, anon;
grant execute on function public.app_admin_dupla_folhas() to authenticated;
grant execute on function public.app_admin_dupla_folha(text) to authenticated;
grant execute on function public.app_admin_dupla_folha_pedir(text) to authenticated;
grant execute on function public.app_admin_dupla_folha_caminho(text) to authenticated;
-- Processamento: só a chave de serviço.
revoke execute on function public.ch_worker_dupla_folha_fonte(text) from public, anon, authenticated;
revoke execute on function public.ch_worker_dupla_folha_gravar(uuid, text, text, text, text, integer, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_dupla_folha_falha(text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_dupla_folhas_a_gerar(boolean, integer) from public, anon, authenticated;
grant execute on function public.ch_worker_dupla_folha_fonte(text) to service_role;
grant execute on function public.ch_worker_dupla_folha_gravar(uuid, text, text, text, text, integer, integer, integer, text) to service_role;
grant execute on function public.ch_worker_dupla_folha_falha(text, text) to service_role;
grant execute on function public.ch_worker_dupla_folhas_a_gerar(boolean, integer) to service_role;
