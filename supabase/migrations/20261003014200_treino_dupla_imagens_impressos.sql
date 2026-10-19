-- =============================================================================
-- Treino em Dupla (2ª fase): IMAGENS DOS IMPRESSOS na sala (ramo fase2-imagens, 18/10/2026). Número reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md. Depende da 013300 (checklist_station_contents da 2ª fase), 013390/013560 (folha e
-- app_dupla_print_path) e da 013350 (dupla_pressings_tela). Pode ser colada duas vezes. Nenhuma IA. Não grava dado de estação.
--
-- POR QUE EXISTE
--   A sala já sabe mostrar a imagem de um impresso: app_dupla_print_path (013560) procura content.pressing_assets[<id do
--   impresso>] = <id em public.station_assets> e devolve station_assets.storage_path. Mas a tabela station_assets é da
--   migração 006000 do ramo montagem-estacoes, que não está em produção: sem ela, o caminho é sempre nulo e o impresso
--   aparece em texto. Esta migração traz SÓ o que a sala lê dessa tabela (id → caminho), sem o resto da Montagem
--   (rascunhos, versões, revisões, recortes do PDF), e uma função do servidor para ligar uma imagem a um impresso.
--   app_dupla_print_path, app_dupla_room_content e a folha (013390) NÃO mudam.
--
-- REGRAS
--   1) Caminho opaco, conferido pelo banco: dupla/impressos/<sha256 do arquivo>.<png|jpg|webp>. O nome do arquivo (e o
--      endereço assinado que o navegador recebe) não diz a estação, o tema nem o impresso.
--   2) Ninguém do navegador grava; só a equipe (administrador ou editor) lê as linhas, e só para conferir. Aluno, revisor que
--      não é da equipe e visitante não leem nada. O arquivo fica no depósito PRIVADO content-hub, sem política de leitura:
--      chega à pessoa só pela rota /api/dupla, que pergunta ao banco (app_dupla_print_path) se ela pode ver (sala, papel,
--      fase e impresso liberado).
--   3) Ligar (ch_worker_dupla_impresso_ligar, só o servidor/SQL do dono): o impresso tem de existir no conteúdo da estação;
--      ligar a mesma imagem de novo não muda nada; impresso que já tem OUTRA imagem é recusado (nada é apagado nem trocado).
--      No Supabase, o arquivo tem de estar no depósito antes de ligar (sem o arquivo, a sala mostraria imagem quebrada).
--   4) Só a chave pressing_assets.<id do impresso> do conteúdo muda. A carga da estação (scripts/dupla/cargaEstacaoInep.ts)
--      já guarda pressing_assets quando roda de novo.
--
-- PARA A MONTAGEM DE ESTAÇÕES (ramo montagem-estacoes, quando entrar): a 006000 cria public.station_assets com outras
-- colunas (draft_id, document_id, page_no, bbox, kind recorte/derivado…). Ela terá de virar "alter table … add column" sobre
-- esta tabela, e o derivado que for à sala tem de seguir a regra 1 (o caminho stations/assets/<estação>/… da spec diria a
-- estação no endereço assinado).
--
-- COMO DESFAZER: supabase/desfazer/20261003014200_treino_dupla_imagens_impressos.desfazer.sql (tira as chaves das imagens
-- ligadas por esta tabela, a função e a tabela; os arquivos no depósito ficam).
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabela (o que a sala lê de station_assets)
create table if not exists public.station_assets (
  id uuid primary key default gen_random_uuid(),
  station_id text references public.checklist_stations (id) on delete cascade,
  impresso_id text check (impresso_id is null or char_length(impresso_id) between 1 and 120),
  kind text not null default 'impresso' check (kind = 'impresso'),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  bytes integer check (bytes is null or bytes > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint station_assets_caminho_opaco
    check (storage_path ~ '^dupla/impressos/[0-9a-f]{64}\.(png|jpg|webp)$' and split_part(split_part(storage_path, '/', 3), '.', 1) = sha256)
);
create index if not exists station_assets_station_idx on public.station_assets (station_id);

alter table public.station_assets enable row level security;
revoke all on table public.station_assets from anon, authenticated;
grant select on table public.station_assets to authenticated;
drop policy if exists "imagens das estações: só a equipe lê" on public.station_assets;
create policy "imagens das estações: só a equipe lê" on public.station_assets
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------- 2) ligar uma imagem a um impresso (só o servidor)
-- p_conferir_arquivo: no Supabase, recusa se o arquivo ainda não está no depósito content-hub. (Sem o esquema storage — banco
-- de testes — não confere.) Devolve { estado: 'ligado' | 'ja_ligado', asset_id, impresso_id, storage_path }.
create or replace function public.ch_worker_dupla_impresso_ligar(
  p_station_id text, p_impresso_id text, p_path text, p_sha256 text, p_width integer, p_height integer, p_bytes integer,
  p_conferir_arquivo boolean default true
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb;
  v_assets jsonb;
  v_n bigint;
  v_atual jsonb;
  v_alt jsonb;
  v_asset uuid;
  v_tem_arquivo boolean;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_path is null or p_path !~ ('^dupla/impressos/' || p_sha256 || '\.(png|jpg|webp)$') then
    raise exception 'Arquivo do impresso inválido: o caminho tem de ser dupla/impressos/<sha256>.png.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  select k.content into c from public.checklist_station_contents k where k.station_id = p_station_id for update;
  if c is null then
    raise exception 'A estação não tem conteúdo cadastrado.' using errcode = '22023';
  end if;
  select x.n into v_n
    from jsonb_array_elements(case when jsonb_typeof(c -> 'pressings') = 'array' then c -> 'pressings' else '[]'::jsonb end)
         with ordinality as x(e, n)
   where x.e ->> 'id' = p_impresso_id
   limit 1;
  if v_n is null then
    raise exception 'Impresso % não existe no conteúdo da estação.', p_impresso_id using errcode = '22023';
  end if;

  if coalesce(p_conferir_arquivo, true) and to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = $2)'
      into v_tem_arquivo using 'content-hub', p_path;
    if not v_tem_arquivo then
      raise exception 'O arquivo % ainda não está no depósito content-hub: envie a imagem antes de ligar.', p_path using errcode = '22023';
    end if;
  end if;

  -- a linha da imagem (mesmo arquivo de novo: a mesma linha)
  select a.id into v_asset from public.station_assets a where a.storage_path = p_path;
  if v_asset is null then
    insert into public.station_assets (station_id, impresso_id, storage_path, sha256, width_px, height_px, bytes)
    values (p_station_id, p_impresso_id, p_path, p_sha256, p_width, p_height, p_bytes)
    returning id into v_asset;
  end if;

  -- a sala lê pressing_assets pelo id do impresso ou por p<posição>: as duas têm de estar vazias ou já nesta imagem
  v_assets := case when jsonb_typeof(c -> 'pressing_assets') = 'object' then c -> 'pressing_assets' else '{}'::jsonb end;
  v_atual := v_assets -> p_impresso_id;
  v_alt := v_assets -> ('p' || v_n);
  if v_atual is not null and v_atual is distinct from to_jsonb(v_asset::text) then
    raise exception 'O impresso % já tem outra imagem ligada (%): nada foi trocado.', p_impresso_id, v_atual using errcode = '23505';
  end if;
  if v_atual is null and v_alt is not null then
    raise exception 'O impresso % já tem outra imagem ligada pela posição (p%): nada foi trocado.', p_impresso_id, v_n using errcode = '23505';
  end if;
  if v_atual is not null then
    return jsonb_build_object('estado', 'ja_ligado', 'asset_id', v_asset, 'impresso_id', p_impresso_id, 'storage_path', p_path);
  end if;

  update public.checklist_station_contents k
     set content = jsonb_set(k.content, '{pressing_assets}', v_assets || jsonb_build_object(p_impresso_id, v_asset::text))
   where k.station_id = p_station_id;
  return jsonb_build_object('estado', 'ligado', 'asset_id', v_asset, 'impresso_id', p_impresso_id, 'storage_path', p_path);
end
$$;

-- ---------------------------------------------------------------- 3) permissões
revoke execute on function public.ch_worker_dupla_impresso_ligar(text, text, text, text, integer, integer, integer, boolean)
  from public, anon, authenticated;
