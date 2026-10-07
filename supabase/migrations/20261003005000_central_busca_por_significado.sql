-- =============================================================================
-- Central de Conteúdo: BUSCA POR SIGNIFICADO (embeddings). Pendência da Administração ("a busca de evidências usa palavras;
-- depende de escolher o modelo de embeddings"), resolvida em 2026-10-06 com o modelo escolhido pelo dono: Gemini Embedding 2,
-- 768 dimensões (server/contentHub/embeddings.ts).
--
-- Cada trecho de fonte ganha um vetor, gravado só pelo processamento (chave de serviço). A busca junta as duas listas, por
-- palavras (como antes) e por significado (vizinhos mais próximos do vetor da pergunta), pela fusão das posições (RRF, k = 60):
-- um trecho bem colocado nas duas sobe; sem vetor na busca, o resultado é o mesmo de antes.
-- No Supabase, o pgvector faz o índice (HNSW, cosseno) sobre o vetor convertido; onde não há pgvector (bancos de teste e o
-- banco do navegador), a comparação é feita direto, sem índice.
-- =============================================================================

create table public.ch_passage_embeddings (
  passage_id uuid primary key references public.ch_source_passages (id) on delete cascade,
  model text not null check (char_length(model) between 1 and 80),
  embedding real[] not null check (array_ndims(embedding) = 1 and array_length(embedding, 1) = 768),
  created_at timestamptz not null default now()
);
create index ch_passage_embeddings_model_idx on public.ch_passage_embeddings (model);
alter table public.ch_passage_embeddings enable row level security;
-- sem políticas: só as funções do servidor leem e gravam

-- pgvector, quando o banco tiver (Supabase): índice pelo cosseno sobre o vetor convertido
do $vec$
declare v_schema text;
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create schema if not exists extensions;
    create extension if not exists vector with schema extensions;
    select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
    execute format('create index ch_passage_embeddings_hnsw on public.ch_passage_embeddings using hnsw ((embedding::%1$I.vector(768)) %1$I.vector_cosine_ops)', v_schema);
  end if;
end
$vec$;

-- Cosseno entre dois vetores (bancos sem pgvector).
create function public.ch_cosine(a real[], b real[]) returns double precision
  language sql immutable parallel safe set search_path = ''
as $$
  select case when coalesce(sqrt(sum(x * x)) * sqrt(sum(y * y)), 0) = 0 then 0
              else sum(x::float8 * y) / (sqrt(sum(x::float8 * x)) * sqrt(sum(y::float8 * y))) end
  from unnest(a, b) as t (x, y)
$$;

-- Os trechos mais próximos do vetor da busca ({"model", "values", "min_similarity"?}), do modelo certo. Sem vetor: nada.
-- min_similarity (0 a 1, opcional; padrão 0 = sem piso) corta o que é pouco parecido; serve para calibrar com dados reais.
create function public.ch_semantic_candidates(p_embedding jsonb, p_k integer default 100) returns table (passage_id uuid, distance double precision)
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_model text := p_embedding ->> 'model';
  v_values real[];
  v_schema text;
  v_k constant integer := least(greatest(coalesce(p_k, 100), 1), 500);
  v_max_distance float8 := 1 - least(greatest(coalesce((p_embedding ->> 'min_similarity')::float8, 0), 0), 1);
begin
  if p_embedding is null or v_model is null or jsonb_typeof(p_embedding -> 'values') is distinct from 'array' then return; end if;
  select array_agg(x::real order by i) into v_values from jsonb_array_elements_text(p_embedding -> 'values') with ordinality as t (x, i);
  if coalesce(array_length(v_values, 1), 0) <> 768 then raise exception 'Vetor da busca com tamanho diferente de 768.' using errcode = '22023'; end if;
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
  if v_schema is not null then
    return query execute format(
      'select e.passage_id, ((e.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)))::float8
         from public.ch_passage_embeddings e
        where e.model = $2 and ((e.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768))) <= $4
        order by (e.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)) limit $3', v_schema)
      using v_values, v_model, v_k, v_max_distance;
  else
    return query
      select c.passage_id, c.d
      from (select e.passage_id, (1 - public.ch_cosine(e.embedding, v_values))::float8 as d
              from public.ch_passage_embeddings e where e.model = v_model) c
      where c.d <= v_max_distance
      order by c.d limit v_k;
  end if;
end
$$;

-- ---------------------------------------------------------------- busca da equipe (painel), agora com o vetor opcional
drop function public.app_ch_search_passages(text, jsonb, integer);
create function public.app_ch_search_passages(p_query text, p_filters jsonb default '{}'::jsonb, p_limit integer default 20, p_embedding jsonb default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  q tsquery := websearch_to_tsquery('portuguese', coalesce(p_query, ''));
  n constant integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  perform public.ch_assert_staff();
  return coalesce((
    with lex as (
      select p.id, row_number() over (order by ts_rank(p.tsv, q) desc, p.id) as r
      from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
      where p.tsv @@ q
        and (nullif(f ->> 'theme', '') is null or public.fold_text(p.theme) like '%' || public.fold_text(f ->> 'theme') || '%')
        and (nullif(f ->> 'population', '') is null or public.fold_text(p.population) like '%' || public.fold_text(f ->> 'population') || '%')
        and (nullif(f ->> 'care_setting', '') is null or public.fold_text(p.care_setting) like '%' || public.fold_text(f ->> 'care_setting') || '%')
        and (nullif(f ->> 'status', '') is null or s.status = f ->> 'status')
        and (nullif(f ->> 'valid_on', '') is null or ((s.published_on is null or s.published_on <= (f ->> 'valid_on')::date) and (s.valid_until is null or s.valid_until >= (f ->> 'valid_on')::date)))
        and (s.kind <> 'society_guideline' or s.editorial_approved)
      order by ts_rank(p.tsv, q) desc, p.id limit 60),
    sem as (
      select p.id, row_number() over (order by c.distance, p.id) as r, c.distance
      from public.ch_semantic_candidates(p_embedding, 200) c
      join public.ch_source_passages p on p.id = c.passage_id join public.ch_sources s on s.id = p.source_id
      where (nullif(f ->> 'theme', '') is null or public.fold_text(p.theme) like '%' || public.fold_text(f ->> 'theme') || '%')
        and (nullif(f ->> 'population', '') is null or public.fold_text(p.population) like '%' || public.fold_text(f ->> 'population') || '%')
        and (nullif(f ->> 'care_setting', '') is null or public.fold_text(p.care_setting) like '%' || public.fold_text(f ->> 'care_setting') || '%')
        and (nullif(f ->> 'status', '') is null or s.status = f ->> 'status')
        and (nullif(f ->> 'valid_on', '') is null or ((s.published_on is null or s.published_on <= (f ->> 'valid_on')::date) and (s.valid_until is null or s.valid_until >= (f ->> 'valid_on')::date)))
        and (s.kind <> 'society_guideline' or s.editorial_approved)
      order by c.distance, p.id limit 60),
    fused as (
      select u.id, sum(1.0 / (60 + u.r)) as score, bool_or(u.via = 'w') as by_words, bool_or(u.via = 's') as by_meaning, min(u.distance) as distance
      from (select id, r, 'w' as via, null::float8 as distance from lex union all select id, r, 's', distance from sem) u
      group by u.id)
    select jsonb_agg(x.row order by x.score desc, x.id) from (
      select fu.id, fu.score, jsonb_build_object(
        'passage_id', p.id, 'source_id', s.id, 'source', s.title, 'organ', s.organ, 'kind', s.kind, 'version', s.version, 'status', s.status,
        'section', p.section, 'page', p.page, 'population', p.population, 'care_setting', p.care_setting,
        'published_on', s.published_on, 'valid_until', s.valid_until, 'text', p.text,
        'match', case when fu.by_words and fu.by_meaning then 'ambos' when fu.by_meaning then 'significado' else 'palavras' end,
        'similarity', case when fu.distance is null then null else round((1 - fu.distance)::numeric, 3) end) as row
      from fused fu join public.ch_source_passages p on p.id = fu.id join public.ch_sources s on s.id = p.source_id
      order by fu.score desc, fu.id limit n) x
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- busca de evidências do processamento
drop function public.ch_worker_search_passages(text, integer);
create function public.ch_worker_search_passages(p_query text, p_limit integer default 5, p_embedding jsonb default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  q tsquery := websearch_to_tsquery('portuguese', coalesce(p_query, ''));
  n constant integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  return coalesce((
    with lex as (
      select p.id, row_number() over (order by ts_rank(p.tsv, q) desc, p.id) as r
      from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
      where p.tsv @@ q and s.status = 'current' and s.kind not in ('preliminary', 'public_consultation') and (s.kind <> 'society_guideline' or s.editorial_approved)
      order by ts_rank(p.tsv, q) desc, p.id limit 40),
    sem as (
      select p.id, row_number() over (order by c.distance, p.id) as r
      from public.ch_semantic_candidates(p_embedding, 120) c
      join public.ch_source_passages p on p.id = c.passage_id join public.ch_sources s on s.id = p.source_id
      where s.status = 'current' and s.kind not in ('preliminary', 'public_consultation') and (s.kind <> 'society_guideline' or s.editorial_approved)
      order by c.distance, p.id limit 40),
    fused as (select u.id, sum(1.0 / (60 + u.r)) as score from (select id, r from lex union all select id, r from sem) u group by u.id)
    select jsonb_agg(x.row order by x.score desc, x.id) from (
      select fu.id, fu.score, jsonb_build_object('passage_id', p.id, 'source_id', s.id, 'source', s.title, 'organ', s.organ, 'version', s.version,
             'section', p.section, 'page', p.page, 'population', p.population, 'care_setting', p.care_setting, 'text', p.text) as row
      from fused fu join public.ch_source_passages p on p.id = fu.id join public.ch_sources s on s.id = p.source_id
      order by fu.score desc, fu.id limit n) x
  ), '[]'::jsonb);
end
$$;

-- Só fontes OFICIAIS vigentes (nível A–D), nunca apostila, consulta pública ou relatório preliminar.
drop function public.ch_worker_search_official_passages(text, integer);
create function public.ch_worker_search_official_passages(p_query text, p_limit integer default 5, p_embedding jsonb default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  q tsquery := websearch_to_tsquery('portuguese', coalesce(p_query, ''));
  n constant integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  return coalesce((
    with lex as (
      select p.id, row_number() over (order by ts_rank(p.tsv, q) desc, p.id) as r
      from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
      where p.tsv @@ q and s.status = 'current' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final'
      order by ts_rank(p.tsv, q) desc, p.id limit 40),
    sem as (
      select p.id, row_number() over (order by c.distance, p.id) as r
      from public.ch_semantic_candidates(p_embedding, 120) c
      join public.ch_source_passages p on p.id = c.passage_id join public.ch_sources s on s.id = p.source_id
      where s.status = 'current' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final'
      order by c.distance, p.id limit 40),
    fused as (select u.id, sum(1.0 / (60 + u.r)) as score from (select id, r from lex union all select id, r from sem) u group by u.id)
    select jsonb_agg(x.row order by x.score desc, x.id) from (
      select fu.id, fu.score, jsonb_build_object('passage_id', p.id, 'source_id', s.id, 'source', s.title, 'organ', s.organ, 'version', s.version,
             'authority_level', s.authority_level, 'published_on', s.published_on, 'valid_until', s.valid_until, 'section', p.section, 'page', p.page, 'text', p.text) as row
      from fused fu join public.ch_source_passages p on p.id = fu.id join public.ch_sources s on s.id = p.source_id
      order by fu.score desc, fu.id limit n) x
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- vetores: o que falta, gravar, situação
-- Trechos sem vetor do modelo (ou com vetor de outro modelo), das fontes que não foram retiradas.
create function public.ch_worker_passages_to_embed(p_model text, p_limit integer default 50) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'section', x.section, 'text', x.text) order by x.ord), '[]'::jsonb)
  from (
    select p.id, s.title, p.section, p.text, row_number() over (order by s.created_at, p.page nulls last, p.id) as ord
    from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
    left join public.ch_passage_embeddings e on e.passage_id = p.id and e.model = p_model
    where e.passage_id is null and s.status <> 'withdrawn'
    order by s.created_at, p.page nulls last, p.id
    limit least(greatest(coalesce(p_limit, 50), 1), 500)) x
$$;

-- Grava os vetores [{passage_id, embedding: [768 números]}]; trecho apagado no meio do caminho é ignorado.
create function public.ch_worker_save_embeddings(p_model text, p_items jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if coalesce(btrim(p_model), '') = '' then raise exception 'Modelo dos vetores ausente.' using errcode = '22023'; end if;
  insert into public.ch_passage_embeddings (passage_id, model, embedding)
  select (x ->> 'passage_id')::uuid, btrim(p_model),
         array(select v::real from jsonb_array_elements_text(x -> 'embedding') with ordinality as t (v, i) order by i)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  where exists (select 1 from public.ch_source_passages p where p.id = (x ->> 'passage_id')::uuid)
  on conflict (passage_id) do update set model = excluded.model, embedding = excluded.embedding, created_at = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- Quantos trechos já têm vetor do modelo (painel).
create function public.ch_worker_embedding_stats(p_model text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'passages', (select count(*) from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id where s.status <> 'withdrawn'),
    'embedded', (select count(*) from public.ch_passage_embeddings e join public.ch_source_passages p on p.id = e.passage_id
                   join public.ch_sources s on s.id = p.source_id where e.model = p_model and s.status <> 'withdrawn'),
    'vector_index', exists (select 1 from pg_extension where extname = 'vector'))
$$;

do $revoke$
declare f text;
begin
  revoke execute on function public.ch_cosine(real[], real[]) from public, anon, authenticated;
  revoke execute on function public.ch_semantic_candidates(jsonb, integer) from public, anon, authenticated;
  revoke execute on function public.app_ch_search_passages(text, jsonb, integer, jsonb) from public, anon;
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ch\_worker\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;

-- Para desfazer: drop das funções novas e da tabela ch_passage_embeddings; recriar app_ch_search_passages(text, jsonb, integer),
-- ch_worker_search_passages(text, integer) e ch_worker_search_official_passages(text, integer) como nas migrações 1400, 1500 e 2100.
