-- =============================================================================
-- MOTOR DE SIMILARIDADE CLÍNICA E PEDAGÓGICA (pedido do dono de 2026-10-12; proposta em
-- Documents/Prompts guardados/2026-10-12-motor-similaridade-clinica.md; spec docs/superpowers/specs/2026-10-12-similaridade-clinica.md).
--
-- Acha questões que cobram o mesmo raciocínio, o mesmo subtema ou etapas complementares do mesmo assunto, e marca as
-- duplicadas. MESMO TEMA NÃO É EQUIVALENTE: "mesmo raciocínio" exige a mesma competência e o mesmo problema central;
-- "duplicada semântica" (paráfrase) e "duplicada exata" exigem texto quase igual (ou o grupo de equivalentes que o motor de engenharia reversa já trouxe).
--
--   perfil da questão (question_profiles, 1:1 com question_dna pela mesma chave; sem perfil, o motor usa o question_dna)
--   →  textos de busca por questão (temático e clínico) com a impressão digital de cada um (question_similarity_state)
--   →  vetores (question_embeddings, Gemini Embedding 2, 768 dimensões, como a busca da Central na …5000) SÓ quando o dono
--      liga a função "Questões parecidas" (similaridade) na Central de IAs; sem ela, nada vai ao Google
--   →  candidatas por texto igual, grupo de equivalentes, palavras (tsvector das questões) e vetor (top-K na mesma área)
--   →  o servidor pontua (raciocínio 40, conceitos/subtema 30, competência 20, achados 10: pesos iniciais, NÃO são precisão
--      comprovada) e aplica as regras; grava os pares em question_relations como PROPOSTA
--   →  a equipe (ou o revisor médico da área) aprova ou rejeita; a IA da função só reclassifica pares DUVIDOSOS, em lote
--      pedido na Administração, e nunca aprova.
--
-- Regras no banco (não só na tela):
--   * só o que mudou é processado: cada questão guarda a impressão digital dos textos (basis_hash) e a dos pares calculados
--     (relations_basis, com a versão do motor e a marca "com vetor"); nada de comparar todas com todas;
--   * par ordenado sem repetição (question_a < question_b); par revisado (aprovada/rejeitada) nunca é trocado pelo motor:
--     se a questão mudou e o motor calcula outra coisa, o par fica "desatualizado" (stale) para nova revisão;
--   * o aluno e o visitante não leem nenhuma tabela daqui; o aluno só recebe app_related_questions: questões publicadas
--     que ele pode abrir (cadeado das Questões Inéditas respeitado), relações aprovadas ou de confiança alta, nunca
--     duplicata exata ou semântica, nunca gabarito nem explicação;
--   * a fila (ch_jobs, etapa similarity) tem trava contra duplicação: um processamento de questões parecidas por vez;
--   * nada de IA na abertura da questão: a lista do aluno é só leitura do banco;
--   * a relação proposta só chega ao aluno com confiança ALTA (0,8) vinda do motor (regra ou vetor); a que a IA reclassificou
--     só depois que uma pessoa aprova.
--
-- TAXONOMIA MÉDICA OFICIAL (decisão do dono de 2026-10-12): o motor DEPENDE dela. O perfil guarda taxonomy_node_id (id estável
-- do nó, nulo enquanto a taxonomia não é aprovada e a questão não é reclassificada) além do tema e subtema em texto (auditoria).
-- As candidatas "por tema" e o peso de conceitos/subtema (30%) usam o nó (ou o pai); sem o nó em uma das duas questões, o par
-- NÃO vira relação definitiva: fica a duplicata exata (fato do texto, confiança 1) e, como proposta de confiança BAIXA, só o
-- enunciado quase igual e a candidata achada pelo vetor. Por isso o motor só deve ser LIGADO depois da taxonomia aprovada e das
-- questões reclassificadas; antes disso, "Reprocessar" grava só as duplicatas.
--
-- Esta migração também:
--   * recria ch_jobs_step_check e ai_functions_key_check com a UNIÃO do que existe (lida da própria restrição) + similarity e
--     similaridade (colar depois de outra migração que acrescente etapa ou função não apaga a dela);
--   * recria ch_worker_ai_save_function e app_ai_summary partindo do corpo da …9610 (a mais nova que existe), agora com a lista
--     de funções lida da restrição (ai_function_keys): quem criar outra migração que mexa nelas parte do corpo desta.
-- Pode ser colada mais de uma vez no Supabase (if not exists, create or replace, drop ... if exists).
-- Numeração: 20261003009910 (9900 reservado para outro ramo).
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.has_ineditas()') is null or to_regclass('public.question_dna') is null
     or to_regprocedure('public.ch_draft_scope()') is null or to_regprocedure('public.staziamed_editorial_area(public.med_area)') is null then
    raise exception 'Cole antes as migrações das Questões StaziaMed e da análise pedida pela tela (…9800, …9801, …9810 e …9830).'
      using errcode = '55000';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- fila e Central de IAs: etapa e função novas (união)
do $steps$
declare
  v_def text;
  v_steps text[] := array['extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index',
                          'visual_render', 'station_pages', 'station_segment', 'station_draft', 'question_generate', 'question_check',
                          'question_source', 'source_search', 'question_analysis', 'draft_check', 'similarity'];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.ch_jobs'::regclass and c.conname = 'ch_jobs_step_check';
  if v_def is not null then v_steps := v_steps || array(select m[1] from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m); end if;
  v_steps := array(select distinct s from unnest(v_steps) as s order by s);
  alter table public.ch_jobs drop constraint if exists ch_jobs_step_check;
  execute format('alter table public.ch_jobs add constraint ch_jobs_step_check check (step in (%s))',
                 (select string_agg(quote_literal(s), ', ') from unnest(v_steps) as s));
end
$steps$;

do $keys$
declare
  v_def text;
  v_keys text[] := array['criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar',
                         'busca_fontes', 'similaridade'];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.ai_functions'::regclass and c.conname = 'ai_functions_key_check';
  if v_def is not null then v_keys := v_keys || array(select m[1] from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m); end if;
  v_keys := array(select distinct k from unnest(v_keys) as k order by k);
  alter table public.ai_functions drop constraint if exists ai_functions_key_check;
  execute format('alter table public.ai_functions add constraint ai_functions_key_check check (key in (%s))',
                 (select string_agg(quote_literal(k), ', ') from unnest(v_keys) as k));
end
$keys$;

-- As funções da Central de IAs que o banco aceita, lidas da restrição, na ordem da tela (as conhecidas primeiro).
create or replace function public.ai_function_keys() returns text[]
  language sql stable security definer set search_path = ''
as $$
  with def as (
    select pg_get_constraintdef(c.oid) as d from pg_constraint c
     where c.conrelid = 'public.ai_functions'::regclass and c.conname = 'ai_functions_key_check'),
  ks as (select distinct m[1] as k from def, regexp_matches(def.d, '''([a-z_]+)''', 'g') as m)
  select coalesce(array_agg(k order by coalesce(array_position(array['criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher',
           'assistente_conferir', 'assistente_revisar', 'busca_fontes', 'similaridade'], k), 1000), k), '{}'::text[])
  from ks
$$;

-- Parte do corpo da …9610: a lista de funções vem da restrição (ai_function_keys), em vez de escrita aqui.
create or replace function public.ch_worker_ai_save_function(p_actor uuid, p_key text, p_config jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ai_functions;
  v_mode text;
  v_care text;
  v_reviewers jsonb;
  v_item jsonb;
  v_max smallint;
  v_max_n numeric;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_key is null or not (p_key = any (public.ai_function_keys())) then
    raise exception 'Função de IA desconhecida: %.', p_key using errcode = '22023';
  end if;
  if p_config is null or jsonb_typeof(p_config) = 'null' then
    delete from public.ai_functions where key = p_key;
    insert into public.admin_audit_log (actor_id, action, target, details)
    values (p_actor, 'ai.function', p_key, jsonb_build_object('removed', true));
    return null;
  end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'Configuração inválida.' using errcode = '22023'; end if;
  v_mode := p_config ->> 'mode';
  v_care := coalesce(p_config ->> 'care', 'caprichado');
  v_reviewers := coalesce(p_config -> 'reviewers', '[]'::jsonb);
  if v_mode is null or v_mode not in ('sozinha', 'linha', 'comite') then raise exception 'Modo inválido: %.', v_mode using errcode = '22023'; end if;
  if v_care not in ('rapido', 'caprichado') then raise exception 'Cuidado inválido: %.', v_care using errcode = '22023'; end if;
  if jsonb_typeof(v_reviewers) <> 'array' or jsonb_array_length(v_reviewers) > 4 then
    raise exception 'No máximo 4 conferentes ou membros.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config -> 'primary_ref') = 'object' and not public.ai_valid_ref(p_config -> 'primary_ref') then
    raise exception 'IA ou modelo principal inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config -> 'fallback_ref') = 'object' and not public.ai_valid_ref(p_config -> 'fallback_ref') then
    raise exception 'IA ou modelo da reserva inválido.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(v_reviewers) loop
    if not public.ai_valid_ref(v_item) then raise exception 'IA ou modelo de conferente inválido.' using errcode = '22023'; end if;
  end loop;
  if p_key = 'busca_fontes' then
    if v_mode <> 'sozinha' then raise exception 'A busca de fontes oficiais só usa o modo sozinha.' using errcode = '22023'; end if;
    if jsonb_array_length(v_reviewers) > 0 then
      raise exception 'A busca de fontes oficiais não tem conferentes: escolha só a IA principal e a reserva.' using errcode = '22023';
    end if;
    if (p_config #>> '{primary_ref,provider}') = 'ollama' or (p_config #>> '{fallback_ref,provider}') = 'ollama' then
      raise exception 'Ollama não busca na internet.' using errcode = '22023';
    end if;
    if (p_config #>> '{primary_ref,provider}') = 'gemini' or (p_config #>> '{fallback_ref,provider}') = 'gemini' then
      raise exception 'A busca de fontes oficiais não funciona com o Gemini: ele não consegue limitar a pesquisa aos sites oficiais. Escolha Claude ou OpenAI.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_config -> 'max_searches') = 'number' then
      v_max_n := (p_config ->> 'max_searches')::numeric;
      if v_max_n <> trunc(v_max_n) or v_max_n not between 1 and 10 then
        raise exception 'Máximo de buscas por pedido: de 1 a 10.' using errcode = '22023';
      end if;
      v_max := v_max_n::smallint;
    elsif coalesce(jsonb_typeof(p_config -> 'max_searches'), 'null') <> 'null' then
      raise exception 'Máximo de buscas por pedido: de 1 a 10.' using errcode = '22023';
    end if;
  end if;
  insert into public.ai_functions (key, mode, primary_ref, fallback_ref, reviewers, care, max_searches, updated_by, updated_at)
  values (p_key, v_mode,
          case when jsonb_typeof(p_config -> 'primary_ref') = 'object' then p_config -> 'primary_ref' end,
          case when jsonb_typeof(p_config -> 'fallback_ref') = 'object' then p_config -> 'fallback_ref' end,
          v_reviewers, v_care, v_max, p_actor, now())
  on conflict (key) do update
     set mode = excluded.mode, primary_ref = excluded.primary_ref, fallback_ref = excluded.fallback_ref,
         reviewers = excluded.reviewers, care = excluded.care, max_searches = excluded.max_searches,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.function', p_key, to_jsonb(v) - 'key' - 'updated_by' - 'updated_at');
  return to_jsonb(v);
end
$$;

-- Equipe: as funções da Central (sem preços nem chaves). Parte do corpo da …9610.
create or replace function public.app_ai_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'functions', (select jsonb_agg(jsonb_build_object('key', k.key, 'configured', f.key is not null, 'mode', f.mode) order by k.ord)
                    from unnest(public.ai_function_keys()) with ordinality as k(key, ord)
                    left join public.ai_functions f on f.key = k.key),
    'providers_enabled', coalesce((select jsonb_agg(id order by id) from public.ai_providers where enabled), '[]'::jsonb),
    'month_spend', public.ch_worker_ai_month_spend(now())
  );
end
$$;

-- ---------------------------------------------------------------- tabelas
-- Perfil semântico da questão (INTERNO: traz o problema central, que pode entregar a resposta). Mesma chave do question_dna
-- (1:1). Origem: revisao_local (agentes da revisão, sem chave do sistema e SEM revisão médica), ia, revisor (pessoa da equipe),
-- dna (cópia do question_dna). basis_hash = impressão digital do enunciado e das alternativas quando o perfil foi feito: se a
-- questão mudar depois, o perfil aparece como desatualizado.
create table if not exists public.question_profiles (
  question_id text primary key references public.questions (id) on delete cascade,
  area text check (area is null or char_length(area) <= 80),
  tema text check (tema is null or char_length(tema) <= 200),
  subtema text check (subtema is null or char_length(subtema) <= 300),
  -- Taxonomia Médica Oficial (proposta em andamento em 2026-10-12): id estável do nó (ex.: área.grupo.tema) e do pai. Nulo até a
  -- taxonomia ser aprovada e a questão reclassificada; tema e subtema em texto livre ficam guardados para auditoria.
  taxonomy_node_id text check (taxonomy_node_id is null or (char_length(taxonomy_node_id) <= 200 and taxonomy_node_id ~ '^[a-z0-9][a-z0-9._-]*$')),
  taxonomy_parent_id text check (taxonomy_parent_id is null or (char_length(taxonomy_parent_id) <= 200 and taxonomy_parent_id ~ '^[a-z0-9][a-z0-9._-]*$')),
  competencia text check (competencia is null or competencia in ('diagnostico', 'conduta_inicial', 'tratamento', 'exame_complementar',
    'prevencao_rastreamento', 'prognostico_complicacoes', 'fisiopatologia_conceito', 'saude_coletiva_epidemiologia', 'etica_legislacao', 'organizacao_sus')),
  cenario text check (cenario is null or cenario in ('atencao_primaria', 'urgencia_emergencia', 'enfermaria_hospital', 'ambulatorio_especializado',
    'centro_obstetrico', 'comunidade_territorio', 'nao_se_aplica')),
  problema_central text check (problema_central is null or char_length(problema_central) <= 300),
  conceitos text[] not null default '{}' check (cardinality(conceitos) <= 12),
  achados_discriminatorios text[] not null default '{}' check (cardinality(achados_discriminatorios) <= 10),
  raciocinio_cobrado text check (raciocinio_cobrado is null or char_length(raciocinio_cobrado) <= 600),
  tipo text check (tipo is null or tipo in ('caso_clinico', 'conceitual', 'imagem', 'dados_epidemiologicos')),
  complexidade smallint check (complexidade is null or complexidade between 1 and 3),
  confianca real check (confianca is null or confianca between 0 and 1),
  origem text not null check (origem in ('revisao_local', 'ia', 'revisor', 'dna')),
  basis_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists question_profiles_taxonomy_idx on public.question_profiles (taxonomy_node_id) where taxonomy_node_id is not null;
create index if not exists question_profiles_taxonomy_parent_idx on public.question_profiles (taxonomy_parent_id) where taxonomy_parent_id is not null;

-- Vetores de cada questão: dois por questão (temático: área, tema, subtema e conceitos; clínico: competência, cenário,
-- problema, achados, raciocínio e o caso). Modelo, dimensões, versão do texto e a impressão digital do texto que virou vetor.
create table if not exists public.question_embeddings (
  question_id text not null references public.questions (id) on delete cascade,
  kind text not null check (kind in ('tematico', 'clinico')),
  model text not null check (char_length(model) between 1 and 80),
  dims smallint not null default 768 check (dims = 768),
  version text not null check (char_length(version) between 1 and 40),
  basis_hash text not null,
  embedding real[] not null check (array_ndims(embedding) = 1 and array_length(embedding, 1) = 768),
  created_at timestamptz not null default now(),
  primary key (question_id, kind)
);
create index if not exists question_embeddings_kind_model_idx on public.question_embeddings (kind, model);

-- Relações entre questões: par ordenado sem repetição.
create table if not exists public.question_relations (
  id uuid primary key default gen_random_uuid(),
  question_a text not null references public.questions (id) on delete cascade,
  question_b text not null references public.questions (id) on delete cascade,
  relation text not null check (relation in ('duplicada_exata', 'duplicada_semantica', 'mesmo_raciocinio', 'mesmo_subtema', 'mesmo_tema', 'complementar', 'nao_relacionada')),
  score numeric(5, 4) not null check (score between 0 and 1),
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  reason text check (reason is null or char_length(reason) <= 1000),        -- justificativa (equipe)
  signals jsonb not null default '{}'::jsonb check (jsonb_typeof(signals) = 'object'),
  origin text not null check (origin in ('regra', 'vetor', 'ia', 'revisor')),
  status text not null default 'proposta' check (status in ('proposta', 'aprovada', 'rejeitada')),
  stale boolean not null default false,                                     -- revisada, mas a questão mudou e o motor calculou outra coisa
  basis_a text,                                                             -- impressão digital de cada questão quando o par foi calculado
  basis_b text,
  engine_version text check (engine_version is null or char_length(engine_version) <= 40),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_relations_ordered check (question_a < question_b),
  constraint question_relations_pair unique (question_a, question_b)
);
create index if not exists question_relations_b_idx on public.question_relations (question_b);
create index if not exists question_relations_status_idx on public.question_relations (status, relation);

-- Histórico (criada, recalculada, removida, aprovada, rejeitada, ia): fica mesmo depois de o par sair.
create table if not exists public.question_relation_history (
  id bigint generated always as identity primary key,
  relation_id uuid,
  question_a text not null,
  question_b text not null,
  event text not null check (event in ('criada', 'recalculada', 'removida', 'desatualizada', 'aprovada', 'rejeitada', 'ia')),
  actor_id uuid references auth.users (id) on delete set null,
  run_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index if not exists question_relation_history_rel_idx on public.question_relation_history (relation_id, at);

-- Situação de cada questão no motor: impressões digitais atuais e as do último cálculo dos pares.
create table if not exists public.question_similarity_state (
  question_id text primary key references public.questions (id) on delete cascade,
  text_hash text not null,                 -- enunciado + alternativas normalizados (duplicata exata)
  tematico_hash text not null,
  clinico_hash text not null,
  basis_hash text not null,                -- dos dois textos e do texto da questão
  relations_basis text,                    -- basis_hash:vetor(v|l):versão do motor do último cálculo dos pares
  relations_at timestamptz,
  requested_at timestamptz,                -- reprocessar mesmo sem mudança (pedido da equipe)
  last_run uuid,
  updated_at timestamptz not null default now()
);
create index if not exists question_similarity_state_text_idx on public.question_similarity_state (text_hash);

-- Cada execução do motor: o que fez, quanto custou e quanto tempo levou.
create table if not exists public.similarity_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ch_jobs (id) on delete set null,
  mode text not null check (mode in ('motor', 'ia')),
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'rodando' check (status in ('rodando', 'concluida', 'falhou', 'pendente')),
  engine_version text,
  model text,
  questions integer not null default 0,
  embedded integer not null default 0,
  relations_new integer not null default 0,
  relations_changed integer not null default 0,
  relations_removed integer not null default 0,
  ai_pairs integer not null default 0,
  tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  duration_ms integer not null default 0,
  message text check (message is null or char_length(message) <= 1000),
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists similarity_runs_started_idx on public.similarity_runs (started_at desc);

-- ---------------------------------------------------------------- RLS: aluno e visitante sem acesso direto
alter table public.question_profiles enable row level security;
alter table public.question_embeddings enable row level security;
alter table public.question_relations enable row level security;
alter table public.question_relation_history enable row level security;
alter table public.question_similarity_state enable row level security;
alter table public.similarity_runs enable row level security;
drop policy if exists "perfis das questões: equipe lê" on public.question_profiles;
create policy "perfis das questões: equipe lê" on public.question_profiles for select to authenticated using (public.is_staff());
drop policy if exists "relações entre questões: equipe lê" on public.question_relations;
create policy "relações entre questões: equipe lê" on public.question_relations for select to authenticated using (public.is_staff());
drop policy if exists "histórico das relações: equipe lê" on public.question_relation_history;
create policy "histórico das relações: equipe lê" on public.question_relation_history for select to authenticated using (public.is_staff());
drop policy if exists "execuções do motor: equipe lê" on public.similarity_runs;
create policy "execuções do motor: equipe lê" on public.similarity_runs for select to authenticated using (public.is_staff());
-- vetores e situação: sem política (só as funções do servidor)
revoke all on table public.question_profiles, public.question_embeddings, public.question_relations, public.question_relation_history,
  public.question_similarity_state, public.similarity_runs from anon;
revoke insert, update, delete, truncate, references, trigger on table public.question_profiles, public.question_embeddings,
  public.question_relations, public.question_relation_history, public.question_similarity_state, public.similarity_runs from authenticated;

-- pgvector, quando o banco tiver (Supabase): um índice HNSW (cosseno) por tipo de vetor, como na …5000
do $vec$
declare v_schema text;
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create schema if not exists extensions;
    create extension if not exists vector with schema extensions;
    select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'question_embeddings_tematico_hnsw') then
      execute format('create index question_embeddings_tematico_hnsw on public.question_embeddings using hnsw ((embedding::%1$I.vector(768)) %1$I.vector_cosine_ops) where kind = ''tematico''', v_schema);
    end if;
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'question_embeddings_clinico_hnsw') then
      execute format('create index question_embeddings_clinico_hnsw on public.question_embeddings using hnsw ((embedding::%1$I.vector(768)) %1$I.vector_cosine_ops) where kind = ''clinico''', v_schema);
    end if;
  end if;
end
$vec$;

-- ---------------------------------------------------------------- textos, impressões digitais e perfil efetivo
-- Texto normalizado: minúsculas, sem acento, só letras e números, espaços simples.
create or replace function public.similarity_norm(p_text text) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(public.fold_text(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- Duplicata exata: enunciado + alternativas normalizados (as alternativas em ordem alfabética: a mesma questão com as letras
-- embaralhadas em outra prova também conta).
create or replace function public.similarity_text_hash(p_statement text, p_options jsonb) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select md5(public.similarity_norm(p_statement) || '|' || coalesce((
    select string_agg(t, '|' order by t) from (
      select public.similarity_norm(o ->> 'text') as t
      from jsonb_array_elements(case when jsonb_typeof(p_options) = 'array' then p_options else '[]'::jsonb end) o) x), ''))
$$;

-- Tradução do vocabulário do question_dna (inglês) para o do perfil (aproximação de vocabulário, sem conteúdo novo).
create or replace function public.similarity_dna_competency(p text) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select case
    when p in ('DIAGNOSIS', 'DIFFERENTIAL_DIAGNOSIS') then 'diagnostico'
    when p in ('SELECT_TREATMENT', 'PHARMACOLOGIC_TREATMENT', 'SURGICAL_MANAGEMENT', 'NONPHARMACOLOGIC_TREATMENT', 'CONTRAINDICATION_ASSESSMENT') then 'tratamento'
    when p in ('SELECT_DIAGNOSTIC_TEST', 'INTERPRET_DIAGNOSTIC_TEST') then 'exame_complementar'
    when p in ('EMERGENCY_STABILIZATION', 'INITIAL_ASSESSMENT') then 'conduta_inicial'
    when p in ('PUBLIC_HEALTH_ACTION', 'EPIDEMIOLOGIC_REASONING') then 'saude_coletiva_epidemiologia'
    when p = 'ETHICAL_LEGAL_DECISION' then 'etica_legislacao'
    when p = 'REFERRAL' then 'organizacao_sus'
    when p in ('PREVENTION', 'VACCINATION', 'SCREENING', 'RISK_FACTOR_ASSESSMENT') then 'prevencao_rastreamento'
    when p in ('FOLLOW_UP', 'RECOGNIZE_COMPLICATION', 'PROGNOSIS', 'RISK_STRATIFICATION') then 'prognostico_complicacoes'
  end
$$;

create or replace function public.similarity_dna_setting(p text) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select case
    when p = 'PRIMARY_CARE' then 'atencao_primaria'
    when p in ('EMERGENCY_DEPARTMENT', 'ICU') then 'urgencia_emergencia'
    when p = 'OUTPATIENT_SPECIALTY' then 'ambulatorio_especializado'
    when p in ('HOSPITAL_WARD', 'NEONATAL_UNIT', 'OPERATING_ROOM') then 'enfermaria_hospital'
    when p = 'COMMUNITY_PUBLIC_HEALTH' then 'comunidade_territorio'
    when p in ('MATERNITY', 'DELIVERY_ROOM') then 'centro_obstetrico'
    when p = 'UNSPECIFIED' then 'nao_se_aplica'
  end
$$;

-- Perfil efetivo (interno): o perfil gravado; sem ele, o question_dna; sem os dois, só tema e subtema da questão.
create or replace function public.similarity_profiles(p_ids text[]) returns table (question_id text, profile jsonb)
  language sql stable security definer set search_path = ''
as $$
  select q.id, jsonb_build_object(
    'id', q.id,
    'area', q.area::text,
    'origin', q.origin,
    'topic', q.topic,
    'subtopic', q.subtopic,
    'tema', coalesce(nullif(btrim(p.tema), ''), q.topic),
    'subtema', coalesce(nullif(btrim(p.subtema), ''), nullif(btrim(q.subtopic), '')),
    'taxonomy_node_id', p.taxonomy_node_id,
    -- o pai gravado; sem ele, o prefixo do id (os ids da taxonomia são caminhos com ponto)
    'taxonomy_parent_id', coalesce(p.taxonomy_parent_id, case when strpos(p.taxonomy_node_id, '.') > 0 then regexp_replace(p.taxonomy_node_id, '\.[^.]+$', '') end),
    'competencia', case when p.question_id is not null then p.competencia else public.similarity_dna_competency(d.competency) end,
    'cenario', case when p.question_id is not null then p.cenario else public.similarity_dna_setting(d.care_setting) end,
    'problema_central', case when p.question_id is not null then nullif(btrim(p.problema_central), '')
                             else nullif(btrim(d.detail -> 'diagnoses_or_conditions' ->> 0), '') end,
    'conceitos', case when p.question_id is not null then to_jsonb(p.conceitos)
                      when jsonb_typeof(d.detail -> 'key_concepts') = 'array' then d.detail -> 'key_concepts' else '[]'::jsonb end,
    'achados', case when p.question_id is not null then to_jsonb(p.achados_discriminatorios) else '[]'::jsonb end,
    'raciocinio', case when p.question_id is not null then nullif(btrim(p.raciocinio_cobrado), '') else nullif(btrim(d.detail ->> 'clinical_decision'), '') end,
    'tipo', case when p.question_id is not null then p.tipo when q.needs_image then 'imagem' end,
    'complexidade', case when p.question_id is not null then p.complexidade
                         else (case d.difficulty_estimate when 'LOW' then 1 when 'MODERATE' then 2 when 'HIGH' then 3 end) end,
    'confianca', case when p.question_id is not null then p.confianca else d.classification_confidence end,
    'fonte', case when p.question_id is not null then 'perfil' when d.question_id is not null then 'dna' else 'questao' end,
    'perfil_desatualizado', p.question_id is not null and p.basis_hash is distinct from public.similarity_text_hash(q.statement, q.options))
  from public.questions q
  left join public.question_profiles p on p.question_id = q.id
  left join public.question_dna d on d.question_id = q.id
  where p_ids is null or q.id = any (p_ids)
$$;

-- Os dois textos que viram vetor (formato versão 1).
create or replace function public.similarity_texts(p_ids text[]) returns table (question_id text, tematico text, clinico text, text_hash text)
  language sql stable security definer set search_path = ''
as $$
  with pr as (select * from public.similarity_profiles(p_ids))
  select q.id,
         concat_ws(' | ',
           'Área: ' || (pr.profile ->> 'area'),
           'Taxonomia: ' || nullif(pr.profile ->> 'taxonomy_node_id', ''),
           'Tema: ' || nullif(pr.profile ->> 'tema', ''),
           'Subtema: ' || nullif(pr.profile ->> 'subtema', ''),
           'Conceitos: ' || nullif((select string_agg(x, '; ') from jsonb_array_elements_text(pr.profile -> 'conceitos') x), '')),
         concat_ws(' | ',
           'Competência: ' || nullif(pr.profile ->> 'competencia', ''),
           'Cenário: ' || nullif(pr.profile ->> 'cenario', ''),
           'Problema central: ' || nullif(pr.profile ->> 'problema_central', ''),
           'Achados que decidem: ' || nullif((select string_agg(x, '; ') from jsonb_array_elements_text(pr.profile -> 'achados') x), ''),
           'Raciocínio cobrado: ' || nullif(pr.profile ->> 'raciocinio', ''),
           'Caso: ' || left(regexp_replace(q.statement, '\s+', ' ', 'g'), 1500)),
         public.similarity_text_hash(q.statement, q.options)
  from pr join public.questions q on q.id = pr.question_id
$$;

-- Atualiza a situação de todas as questões (ou das pedidas): impressões digitais atuais. Devolve quantas mudaram.
create or replace function public.similarity_refresh_state(p_ids text[] default null) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  insert into public.question_similarity_state as s (question_id, text_hash, tematico_hash, clinico_hash, basis_hash, updated_at)
  select t.question_id, t.text_hash, md5(t.tematico), md5(t.clinico), md5(t.text_hash || '§' || md5(t.tematico) || '§' || md5(t.clinico)), now()
  from public.similarity_texts(p_ids) t
  on conflict (question_id) do update
     set text_hash = excluded.text_hash, tematico_hash = excluded.tematico_hash, clinico_hash = excluded.clinico_hash,
         basis_hash = excluded.basis_hash, updated_at = now()
   where (s.text_hash, s.tematico_hash, s.clinico_hash, s.basis_hash)
         is distinct from (excluded.text_hash, excluded.tematico_hash, excluded.clinico_hash, excluded.basis_hash);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Versão do motor que o banco espera (a mesma constante ENGINE_VERSION de server/contentHub/similarity/engine.ts; um teste
-- confere as duas). Trocar a versão no servidor exige uma migração que troque esta também: aí todos os pares são recalculados.
create or replace function public.similarity_engine_version() returns text
  language sql immutable set search_path = ''
as $$ select 'sim-1'::text $$;

-- Questões cujos pares precisam ser (re)calculados: mudou o texto ou o perfil, mudou a versão do motor, ganhou vetor, ou a
-- equipe pediu. p_engine nulo = a versão que o banco espera; p_model nulo = não confere a marca "com vetor".
create or replace function public.similarity_pending_ids(p_model text, p_engine text, p_limit integer default null) returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(x.question_id order by x.forced desc, x.question_id), '{}'::text[]) from (
    select s.question_id, (s.requested_at is not null and (s.relations_at is null or s.requested_at > s.relations_at)) as forced
    from public.question_similarity_state s
    where (s.requested_at is not null and (s.relations_at is null or s.requested_at > s.relations_at))
       or s.relations_basis is null
       or split_part(s.relations_basis, ':', 1) <> s.basis_hash
       or split_part(s.relations_basis, ':', 3) <> coalesce(p_engine, public.similarity_engine_version())
       or (p_model is not null and split_part(s.relations_basis, ':', 2) = 'l' and exists (
             select 1 from public.question_embeddings e
             where e.question_id = s.question_id and e.model = p_model and e.kind = 'tematico' and e.basis_hash = s.tematico_hash)
           and exists (
             select 1 from public.question_embeddings e
             where e.question_id = s.question_id and e.model = p_model and e.kind = 'clinico' and e.basis_hash = s.clinico_hash))
    order by 2 desc, 1
    limit least(greatest(coalesce(p_limit, 100000), 1), 100000)) x
$$;

-- ---------------------------------------------------------------- fila: um processamento de questões parecidas por vez
-- O trabalho que impede outro: qualquer um na fila ou rodando; parado (teto de gasto da IA) só impede outro do MESMO modo (o
-- pedido de IA parado no teto não segura o reprocessamento do motor).
create or replace function public.similarity_active_job(p_mode text) returns uuid
  language sql stable security definer set search_path = ''
as $$
  select j.id from public.ch_jobs j
   where j.step = 'similarity'
     and (j.status in ('queued', 'running') or (j.status = 'blocked' and coalesce(j.checkpoint ->> 'mode', 'motor') = p_mode))
   order by j.created_at limit 1
$$;

create or replace function public.similarity_enqueue(p_mode text, p_actor uuid, p_params jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_job uuid; v_active uuid;
begin
  if p_mode not in ('motor', 'ia') then raise exception 'Modo inválido.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('staziamed:similaridade'));
  v_active := public.similarity_active_job(p_mode);
  if v_active is not null then return jsonb_build_object('job_id', v_active, 'duplicate', true); end if;
  insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts, checkpoint)
  values (null, 'similarity', 'similarity:' || p_mode, 'similarity:' || gen_random_uuid()::text, '{}'::jsonb, 3,
          jsonb_build_object('mode', p_mode, 'requested_by', p_actor) || coalesce(p_params, '{}'::jsonb))
  returning id into v_job;
  return jsonb_build_object('job_id', v_job, 'duplicate', false);
end
$$;

-- ---------------------------------------------------------------- processamento (servidor, chave de serviço)
-- Começo de uma execução: atualiza a situação das questões e abre (ou retoma) o registro da execução.
create or replace function public.ch_worker_similarity_begin(p_job_id uuid, p_mode text, p_engine text, p_model text, p_run_id uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_run uuid := p_run_id; v_changed integer; j public.ch_jobs;
begin
  select * into j from public.ch_jobs where id = p_job_id;
  v_changed := public.similarity_refresh_state(null);
  if v_run is null or not exists (select 1 from public.similarity_runs where id = v_run) then
    insert into public.similarity_runs (job_id, mode, requested_by, engine_version, model)
    values (p_job_id, coalesce(p_mode, 'motor'), nullif(j.checkpoint ->> 'requested_by', '')::uuid, p_engine, p_model)
    returning id into v_run;
  else
    update public.similarity_runs set status = 'rodando', message = null where id = v_run;
  end if;
  return jsonb_build_object('run_id', v_run, 'changed', v_changed,
                            'function_on', exists (select 1 from public.ai_functions where key = 'similaridade'));
end
$$;

-- Próximas questões cujos pares precisam ser (re)calculados (o servidor chama em lotes).
create or replace function public.ch_worker_similarity_pending(p_model text, p_engine text, p_limit integer default 25) returns text[]
  language sql stable security definer set search_path = ''
as $$ select public.similarity_pending_ids(p_model, p_engine, least(greatest(coalesce(p_limit, 25), 1), 500)) $$;

-- Textos que ainda não viraram vetor deste modelo e desta versão (ou mudaram).
create or replace function public.ch_worker_similarity_to_embed(p_model text, p_version text, p_limit integer default 50) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_ids text[];
begin
  select array_agg(distinct x.question_id) into v_ids from (
    select s.question_id from public.question_similarity_state s
    where not exists (select 1 from public.question_embeddings e where e.question_id = s.question_id and e.kind = 'tematico'
                        and e.model = p_model and e.version = p_version and e.basis_hash = s.tematico_hash)
       or not exists (select 1 from public.question_embeddings e where e.question_id = s.question_id and e.kind = 'clinico'
                        and e.model = p_model and e.version = p_version and e.basis_hash = s.clinico_hash)
    order by s.question_id
    limit least(greatest(coalesce(p_limit, 50), 1), 500)) x;
  if v_ids is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(i order by i ->> 'question_id', i ->> 'kind') from (
      select jsonb_build_object('question_id', t.question_id, 'kind', k.kind, 'text', k.txt, 'basis_hash', md5(k.txt)) as i
      from public.similarity_texts(v_ids) t
      cross join lateral (values ('tematico', t.tematico), ('clinico', t.clinico)) as k(kind, txt)
      where not exists (select 1 from public.question_embeddings e where e.question_id = t.question_id and e.kind = k.kind
                          and e.model = p_model and e.version = p_version and e.basis_hash = md5(k.txt))) y), '[]'::jsonb);
end
$$;

-- Grava os vetores [{question_id, kind, basis_hash, embedding: [768]}]; questão apagada no meio do caminho é ignorada.
create or replace function public.ch_worker_similarity_save_embeddings(p_model text, p_version text, p_items jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if coalesce(btrim(p_model), '') = '' or coalesce(btrim(p_version), '') = '' then raise exception 'Modelo ou versão dos vetores ausente.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
             where coalesce(jsonb_array_length(x -> 'embedding'), 0) <> 768 or (x ->> 'kind') not in ('tematico', 'clinico')) then
    raise exception 'Vetor com tamanho diferente de 768 ou tipo inválido.' using errcode = '22023';
  end if;
  insert into public.question_embeddings (question_id, kind, model, dims, version, basis_hash, embedding)
  select x ->> 'question_id', x ->> 'kind', btrim(p_model), 768, btrim(p_version), x ->> 'basis_hash',
         array(select v::real from jsonb_array_elements_text(x -> 'embedding') with ordinality as t (v, i) order by i)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  where exists (select 1 from public.questions q where q.id = x ->> 'question_id')
  on conflict (question_id, kind) do update
     set model = excluded.model, dims = excluded.dims, version = excluded.version, basis_hash = excluded.basis_hash,
         embedding = excluded.embedding, created_at = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- Os vizinhos de uma questão pelo vetor (top-K). Com pgvector (Supabase): na MESMA ÁREA a conta é exata sobre as questões da
-- área (o índice HNSW devolve poucos vizinhos e o filtro por área depois dele deixaria a lista curta); em QUALQUER área usa o
-- índice HNSW do tipo de vetor. Sem pgvector (bancos de teste e o banco do navegador): cosseno direto.
create or replace function public.similarity_vector_neighbors(p_question_id text, p_kind text, p_model text, p_k integer, p_same_area boolean)
  returns table (question_id text, cos double precision)
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_vec real[];
  v_area public.med_area;
  v_schema text;
  v_k constant integer := least(greatest(coalesce(p_k, 20), 1), 200);
begin
  if p_kind is null or p_kind not in ('tematico', 'clinico') then return; end if;
  select e.embedding into v_vec from public.question_embeddings e where e.question_id = p_question_id and e.kind = p_kind and e.model = p_model;
  if v_vec is null then return; end if;
  select q.area into v_area from public.questions q where q.id = p_question_id;
  select n.nspname into v_schema from pg_extension x join pg_namespace n on n.oid = x.extnamespace where x.extname = 'vector';
  if v_schema is not null and coalesce(p_same_area, true) then
    return query execute format(
      'with da_area as materialized (
         select e.question_id, e.embedding from public.question_embeddings e join public.questions q on q.id = e.question_id
          where e.kind = %2$L and e.model = $2 and e.question_id <> $3 and q.area = $5)
       select d.question_id, (1 - ((d.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768))))::float8
         from da_area d order by 2 desc, 1 limit $4', v_schema, p_kind)
      using v_vec, p_model, p_question_id, v_k, v_area;
  elsif v_schema is not null then
    return query execute format(
      'select e.question_id, (1 - ((e.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768))))::float8
         from public.question_embeddings e
        where e.kind = %2$L and e.model = $2 and e.question_id <> $3
        order by (e.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)) limit $4', v_schema, p_kind)
      using v_vec, p_model, p_question_id, v_k;
  else
    return query
      select e.question_id, public.ch_cosine(e.embedding, v_vec)
      from public.question_embeddings e join public.questions q on q.id = e.question_id
      where e.kind = p_kind and e.model = p_model and e.question_id <> p_question_id and (not coalesce(p_same_area, true) or q.area = v_area)
      order by 2 desc, 1 limit v_k;
  end if;
end
$$;

-- A questão e as candidatas, com o perfil efetivo e os sinais (texto igual, equivalentes, palavras, taxonomia ou tema, vetores).
-- Sem IA. As candidatas "por tema" saem da taxonomia (mesmo nó ou mesmo pai); sem o nó, do tema da questão (texto).
create or replace function public.ch_worker_similarity_candidates(p_question_id text, p_model text, p_k integer default 20) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q public.questions;
  v_s public.question_similarity_state;
  v_k constant integer := least(greatest(coalesce(p_k, 20), 5), 60);
  v_group text;
  v_query tsquery;
  v_t real[];
  v_c real[];
  v_node text;
  v_parent text;
  v_cand jsonb;
  v_ids text[];
  v_cos jsonb := '{}'::jsonb;
  v_schema text;
begin
  select * into v_q from public.questions where id = p_question_id;
  if not found then return null; end if;
  select pr.profile ->> 'taxonomy_node_id', pr.profile ->> 'taxonomy_parent_id' into v_node, v_parent from public.similarity_profiles(array[p_question_id]) pr;
  select * into v_s from public.question_similarity_state where question_id = p_question_id;
  select e.group_id into v_group from public.question_equivalents e where e.question_id = p_question_id;
  select e.embedding into v_t from public.question_embeddings e where e.question_id = p_question_id and e.kind = 'tematico' and e.model = p_model;
  select e.embedding into v_c from public.question_embeddings e where e.question_id = p_question_id and e.kind = 'clinico' and e.model = p_model;
  -- palavras: qualquer um dos termos (já reduzidos) do enunciado, tema e subtema da própria questão
  select string_agg(quote_literal(l), ' | ')::tsquery into v_query
    from (select l from unnest(tsvector_to_array(v_q.search)) as l where char_length(l) > 2 limit 300) x;

  -- 1) candidatas (cada uma com os caminhos por onde foi achada)
  with c as (
    select s.question_id as id, 'texto_igual'::text as via, null::real as lex from public.question_similarity_state s
     where v_s.text_hash is not null and s.text_hash = v_s.text_hash and s.question_id <> p_question_id
    union all
    select e.question_id, 'equivalente', null from public.question_equivalents e
     where v_group is not null and e.group_id = v_group and e.question_id <> p_question_id
    union all
    (select q.id, 'palavras', ts_rank(q.search, v_query) from public.questions q
      where v_query is not null and q.id <> p_question_id and q.area = v_q.area and q.search @@ v_query order by 3 desc, 1 limit v_k)
    union all
    (select q.id, 'palavras_outra_area', ts_rank(q.search, v_query) from public.questions q
      where v_query is not null and q.id <> p_question_id and q.area <> v_q.area and q.search @@ v_query order by 3 desc, 1 limit 5)
    union all
    (select p.question_id, 'taxonomia', null from public.question_profiles p
      where v_node is not null and p.question_id <> p_question_id
        and (p.taxonomy_node_id = v_node or p.taxonomy_parent_id = v_node or p.taxonomy_node_id = v_parent
             or (v_parent is not null and (p.taxonomy_parent_id = v_parent
                  or (p.taxonomy_parent_id is null and strpos(p.taxonomy_node_id, '.') > 0 and regexp_replace(p.taxonomy_node_id, '\.[^.]+$', '') = v_parent))))
      order by (p.taxonomy_node_id = v_node) desc, p.question_id limit v_k)
    union all
    (select q.id, 'tema', null from public.questions q where v_node is null and q.id <> p_question_id and q.topic = v_q.topic order by q.id limit v_k)
    union all
    select n.question_id, 'vetor_tematico', null from public.similarity_vector_neighbors(p_question_id, 'tematico', p_model, v_k, true) n
    union all
    select n.question_id, 'vetor_clinico', null from public.similarity_vector_neighbors(p_question_id, 'clinico', p_model, v_k, true) n
    union all
    -- questão mal classificada de área: só o vizinho clínico muito próximo de outra área
    select n.question_id, 'vetor_outra_area', null from public.similarity_vector_neighbors(p_question_id, 'clinico', p_model, 5, false) n where n.cos >= 0.9
  )
  select coalesce(jsonb_object_agg(g.id, jsonb_build_object('via', g.via, 'lex', g.lex)), '{}'::jsonb), array_agg(g.id)
    into v_cand, v_ids
    from (select c.id, jsonb_agg(distinct c.via) as via, max(c.lex) as lex from c group by c.id) g;

  -- 2) cosseno de cada candidata com a questão (pgvector quando existe; senão, a conta direta)
  if v_ids is not null and (v_t is not null or v_c is not null) then
    select n.nspname into v_schema from pg_extension x join pg_namespace n on n.oid = x.extnamespace where x.extname = 'vector';
    if v_schema is not null then
      execute format(
        'select coalesce(jsonb_object_agg(e.question_id || '':'' || e.kind,
                  round((1 - ((e.embedding::%1$I.vector(768)) operator(%1$I.<=>) ((case e.kind when ''tematico'' then $1 else $2 end)::%1$I.vector(768))))::numeric, 4)), ''{}''::jsonb)
           from public.question_embeddings e
          where e.model = $3 and e.question_id = any ($4) and ((e.kind = ''tematico'' and $1 is not null) or (e.kind = ''clinico'' and $2 is not null))', v_schema)
        into v_cos using v_t, v_c, p_model, v_ids;
    else
      select coalesce(jsonb_object_agg(e.question_id || ':' || e.kind,
               round(public.ch_cosine(e.embedding, case e.kind when 'tematico' then v_t else v_c end)::numeric, 4)), '{}'::jsonb)
        into v_cos
        from public.question_embeddings e
       where e.model = p_model and e.question_id = any (v_ids) and ((e.kind = 'tematico' and v_t is not null) or (e.kind = 'clinico' and v_c is not null));
    end if;
  end if;

  -- 3) a questão e as candidatas com o perfil efetivo
  return jsonb_build_object(
    'question', (select pr.profile || jsonb_build_object('text_hash', v_s.text_hash, 'basis_hash', v_s.basis_hash, 'group_id', v_group,
                   'statement', public.similarity_norm(v_q.statement), 'has_vectors', v_t is not null and v_c is not null)
                 from public.similarity_profiles(array[p_question_id]) pr),
    'candidates', coalesce((
      select jsonb_agg(pr.profile || jsonb_build_object(
               'text_hash', s.text_hash, 'group_id', e.group_id, 'statement', public.similarity_norm(q.statement),
               'via', v_cand -> pr.question_id -> 'via', 'lex', v_cand -> pr.question_id -> 'lex',
               'cos_t', v_cos -> (pr.question_id || ':tematico'), 'cos_c', v_cos -> (pr.question_id || ':clinico'))
             order by pr.question_id)
      from public.similarity_profiles(coalesce(v_ids, '{}'::text[])) pr
      join public.questions q on q.id = pr.question_id
      left join public.question_similarity_state s on s.question_id = pr.question_id
      left join public.question_equivalents e on e.question_id = pr.question_id), '[]'::jsonb));
end
$$;

-- Grava os pares calculados para uma questão. Par revisado não muda (só fica "desatualizado" se a questão mudou e o motor
-- calculou outra coisa); par da IA com a mesma base fica; o resto é atualizado. Par proposto que saiu da lista é removido
-- quando a base da questão mudou (ou a versão do motor). Devolve as contagens.
create or replace function public.ch_worker_similarity_save(p_question_id text, p_basis text, p_engine text, p_run_id uuid, p_items jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_other text;
  v_a text; v_b text;
  v_ba text; v_bb text;
  v_rel text;
  r public.question_relations;
  v_new integer := 0; v_changed integer := 0; v_removed integer := 0; v_kept integer := 0;
  v_seen text[] := '{}';
  v_mine text := (select basis_hash from public.question_similarity_state where question_id = p_question_id);
begin
  if not exists (select 1 from public.questions where id = p_question_id) then return null; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_other := v_item ->> 'other';
    v_rel := v_item ->> 'relation';
    if v_other is null or v_other = p_question_id or v_rel is null or v_rel = 'nao_relacionada'
       or v_rel not in ('duplicada_exata', 'duplicada_semantica', 'mesmo_raciocinio', 'mesmo_subtema', 'mesmo_tema', 'complementar')
       or (v_item ->> 'origin') not in ('regra', 'vetor')
       or not exists (select 1 from public.questions where id = v_other) then
      continue;
    end if;
    v_a := least(p_question_id, v_other); v_b := greatest(p_question_id, v_other);
    v_seen := v_seen || v_other;
    select basis_hash into v_ba from public.question_similarity_state where question_id = v_a;
    select basis_hash into v_bb from public.question_similarity_state where question_id = v_b;
    select * into r from public.question_relations where question_a = v_a and question_b = v_b for update;
    if not found then
      insert into public.question_relations (question_a, question_b, relation, score, confidence, reason, signals, origin, basis_a, basis_b, engine_version)
      values (v_a, v_b, v_rel, least(greatest((v_item ->> 'score')::numeric, 0), 1), least(greatest((v_item ->> 'confidence')::numeric, 0), 1),
              left(v_item ->> 'reason', 1000), coalesce(v_item -> 'signals', '{}'::jsonb), v_item ->> 'origin', v_ba, v_bb, p_engine)
      returning * into r;
      insert into public.question_relation_history (relation_id, question_a, question_b, event, run_id, after)
      values (r.id, v_a, v_b, 'criada', p_run_id, jsonb_build_object('relation', r.relation, 'score', r.score, 'confidence', r.confidence, 'origin', r.origin));
      v_new := v_new + 1;
    elsif r.status in ('aprovada', 'rejeitada') then
      if (r.basis_a, r.basis_b) is distinct from (v_ba, v_bb) and r.relation is distinct from v_rel and not r.stale then
        update public.question_relations set stale = true, updated_at = now() where id = r.id;
        insert into public.question_relation_history (relation_id, question_a, question_b, event, run_id, before, after)
        values (r.id, v_a, v_b, 'desatualizada', p_run_id, jsonb_build_object('relation', r.relation, 'status', r.status),
                jsonb_build_object('relation_calculada', v_rel));
      end if;
      v_kept := v_kept + 1;
    elsif r.origin = 'ia' and (r.basis_a, r.basis_b) is not distinct from (v_ba, v_bb) then
      v_kept := v_kept + 1;
    else
      update public.question_relations
         set relation = v_rel, score = least(greatest((v_item ->> 'score')::numeric, 0), 1),
             confidence = least(greatest((v_item ->> 'confidence')::numeric, 0), 1), reason = left(v_item ->> 'reason', 1000),
             signals = coalesce(v_item -> 'signals', '{}'::jsonb), origin = v_item ->> 'origin', basis_a = v_ba, basis_b = v_bb,
             engine_version = p_engine, updated_at = now()
       where id = r.id;
      if r.relation is distinct from v_rel then
        insert into public.question_relation_history (relation_id, question_a, question_b, event, run_id, before, after)
        values (r.id, v_a, v_b, 'recalculada', p_run_id, jsonb_build_object('relation', r.relation, 'score', r.score, 'origin', r.origin),
                jsonb_build_object('relation', v_rel, 'score', v_item -> 'score', 'origin', v_item ->> 'origin'));
        v_changed := v_changed + 1;
      else
        v_kept := v_kept + 1;
      end if;
    end if;
  end loop;

  -- pares desta questão que saíram da lista
  for r in select * from public.question_relations x
            where (x.question_a = p_question_id or x.question_b = p_question_id)
              and not (case when x.question_a = p_question_id then x.question_b else x.question_a end = any (v_seen))
            for update loop
    if (case when r.question_a = p_question_id then r.basis_a else r.basis_b end) is not distinct from v_mine
       and r.engine_version is not distinct from p_engine then
      continue;  -- a base desta questão não mudou: o par veio do cálculo da outra questão e continua valendo
    end if;
    if r.status = 'proposta' then
      delete from public.question_relations where id = r.id;
      insert into public.question_relation_history (relation_id, question_a, question_b, event, run_id, before)
      values (r.id, r.question_a, r.question_b, 'removida', p_run_id, jsonb_build_object('relation', r.relation, 'score', r.score, 'origin', r.origin));
      v_removed := v_removed + 1;
    elsif not r.stale and (case when r.question_a = p_question_id then r.basis_a else r.basis_b end) is distinct from v_mine then
      update public.question_relations set stale = true, updated_at = now() where id = r.id;
      insert into public.question_relation_history (relation_id, question_a, question_b, event, run_id, before, after)
      values (r.id, r.question_a, r.question_b, 'desatualizada', p_run_id, jsonb_build_object('relation', r.relation, 'status', r.status),
              jsonb_build_object('relation_calculada', null));
    end if;
  end loop;

  update public.question_similarity_state set relations_basis = p_basis, relations_at = now(), last_run = p_run_id where question_id = p_question_id;
  return jsonb_build_object('new', v_new, 'changed', v_changed, 'removed', v_removed, 'kept', v_kept);
end
$$;

-- Pares duvidosos para a IA (só os do motor, ainda propostos, com confiança baixa). Leva o texto das duas questões.
create or replace function public.ch_worker_similarity_doubtful(p_limit integer default 20, p_max_confidence numeric default 0.6) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.score desc, x.id), '[]'::jsonb) from (
    select r.id, r.score, jsonb_build_object(
      'id', r.id, 'relation', r.relation, 'score', r.score, 'confidence', r.confidence, 'signals', r.signals,
      'a', (select pa.profile || jsonb_build_object('enunciado', qa.statement,
                 'alternativas', (select jsonb_agg(jsonb_build_object('letra', o ->> 'id', 'texto', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(qa.options) o),
                 'gabarito_oficial', case when qa.status = 'annulled' then null else qa.correct_option end)
            from public.similarity_profiles(array[r.question_a]) pa join public.questions qa on qa.id = pa.question_id),
      'b', (select pb.profile || jsonb_build_object('enunciado', qb.statement,
                 'alternativas', (select jsonb_agg(jsonb_build_object('letra', o ->> 'id', 'texto', o ->> 'text') order by o ->> 'id') from jsonb_array_elements(qb.options) o),
                 'gabarito_oficial', case when qb.status = 'annulled' then null else qb.correct_option end)
            from public.similarity_profiles(array[r.question_b]) pb join public.questions qb on qb.id = pb.question_id)) as item
    from public.question_relations r
    where r.status = 'proposta' and r.origin in ('regra', 'vetor') and r.relation <> 'duplicada_exata' and not r.stale
      and r.confidence < least(greatest(coalesce(p_max_confidence, 0.6), 0), 1)
    order by r.score desc, r.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)) x
$$;

-- Resultado da IA [{id, relation, confidence, reason, model}]: só em par ainda proposto. A IA nunca aprova.
create or replace function public.ch_worker_similarity_save_ai(p_run_id uuid, p_items jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_item jsonb; r public.question_relations; n integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (v_item ->> 'relation') not in ('duplicada_exata', 'duplicada_semantica', 'mesmo_raciocinio', 'mesmo_subtema', 'mesmo_tema', 'complementar', 'nao_relacionada') then continue; end if;
    select * into r from public.question_relations where id = (v_item ->> 'id')::uuid and status = 'proposta' for update;
    if not found then continue; end if;
    update public.question_relations
       set relation = v_item ->> 'relation', origin = 'ia',
           confidence = least(greatest(coalesce((v_item ->> 'confidence')::numeric, 0), 0), 1),
           reason = left(coalesce(v_item ->> 'reason', ''), 1000),
           signals = r.signals || jsonb_build_object('ia', jsonb_build_object('relation_do_motor', r.relation, 'model', v_item ->> 'model', 'run_id', p_run_id)),
           updated_at = now()
     where id = r.id;
    insert into public.question_relation_history (relation_id, question_a, question_b, event, run_id, before, after)
    values (r.id, r.question_a, r.question_b, 'ia', p_run_id, jsonb_build_object('relation', r.relation, 'confidence', r.confidence, 'origin', r.origin),
            jsonb_build_object('relation', v_item ->> 'relation', 'confidence', v_item -> 'confidence', 'model', v_item ->> 'model'));
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Fim (ou andamento) de uma execução: soma os números e grava situação, tempo e custo.
create or replace function public.ch_worker_similarity_finish(p_run_id uuid, p_patch jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.similarity_runs set
    status = coalesce(p_patch ->> 'status', status),
    questions = coalesce((p_patch ->> 'questions')::integer, questions),
    embedded = coalesce((p_patch ->> 'embedded')::integer, embedded),
    relations_new = coalesce((p_patch ->> 'relations_new')::integer, relations_new),
    relations_changed = coalesce((p_patch ->> 'relations_changed')::integer, relations_changed),
    relations_removed = coalesce((p_patch ->> 'relations_removed')::integer, relations_removed),
    ai_pairs = coalesce((p_patch ->> 'ai_pairs')::integer, ai_pairs),
    tokens = coalesce((p_patch ->> 'tokens')::integer, tokens),
    cost_usd = coalesce((p_patch ->> 'cost_usd')::numeric, cost_usd),
    duration_ms = coalesce((p_patch ->> 'duration_ms')::integer, duration_ms),
    message = case when p_patch ? 'message' then left(p_patch ->> 'message', 1000) else message end,
    details = details || coalesce(p_patch -> 'details', '{}'::jsonb),
    finished_at = case when coalesce(p_patch ->> 'status', status) in ('concluida', 'falhou') then now() else finished_at end
  where id = p_run_id;
end
$$;

-- Fila automática: só com a função "Questões parecidas" ligada na Central de IAs, com questão pendente e sem outro
-- processamento na fila. Devolve se pôs um trabalho na fila.
create or replace function public.ch_worker_similarity_autoqueue() returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.ai_functions where key = 'similaridade') then return false; end if;
  if public.similarity_active_job('motor') is not null then return false; end if;
  perform public.similarity_refresh_state(null);
  if cardinality(public.similarity_pending_ids(null, null, 1)) = 0 then return false; end if;
  return not ((public.similarity_enqueue('motor', null, jsonb_build_object('auto', true)) ->> 'duplicate')::boolean);
end
$$;

-- ---------------------------------------------------------------- telas: item de uma relação (Administração)
create or replace function public.similarity_relation_item(r public.question_relations) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'a', (select jsonb_build_object('id', q.id, 'code', q.code, 'excerpt', left(regexp_replace(q.statement, '\s+', ' ', 'g'), 160),
                                    'subtema', coalesce(nullif(btrim(p.subtema), ''), q.subtopic), 'area', q.area, 'status', q.status)
          from public.questions q left join public.question_profiles p on p.question_id = q.id where q.id = r.question_a),
    'b', (select jsonb_build_object('id', q.id, 'code', q.code, 'excerpt', left(regexp_replace(q.statement, '\s+', ' ', 'g'), 160),
                                    'subtema', coalesce(nullif(btrim(p.subtema), ''), q.subtopic), 'area', q.area, 'status', q.status)
          from public.questions q left join public.question_profiles p on p.question_id = q.id where q.id = r.question_b),
    'relation', r.relation, 'score', r.score, 'confidence', r.confidence,
    'confidence_level', case when r.confidence >= 0.8 then 'alta' when r.confidence >= 0.6 then 'media' else 'baixa' end,
    'reason', r.reason, 'status', r.status, 'origin', r.origin,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'stale', r.stale, 'signals', r.signals,
    'reviewed_at', r.reviewed_at, 'review_note', r.review_note)
$$;

-- O revisor médico só vê e decide pares em que as DUAS questões são das áreas dele; a equipe (editor e administrador) vê tudo.
create or replace function public.similarity_pair_in_scope(p_a text, p_b text, p_scope text[]) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_scope is null or (
    exists (select 1 from public.questions q where q.id = p_a and public.staziamed_editorial_area(q.area) = any (p_scope))
    and exists (select 1 from public.questions q where q.id = p_b and public.staziamed_editorial_area(q.area) = any (p_scope)))
$$;

create or replace function public.similarity_assert_team() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (public.is_staff() or public.ch_is_reviewer()) then
    raise exception 'Acesso restrito à equipe de conteúdo.' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------- CONTRATO das telas
-- Aluno: questões relacionadas a uma questão. Só o que ele pode abrir, só relações aprovadas ou de confiança alta, nunca
-- duplicata exata ou semântica (nem outra cópia da mesma questão), nunca gabarito nem explicação. Só leitura (nada de IA aqui).
create or replace function public.app_related_questions(p_question_id text, p_limit integer default 8) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n constant integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_src public.questions;
  v_access boolean;
  v_group text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into v_src from public.questions where id = p_question_id;
  if not found then return jsonb_build_object('items', '[]'::jsonb); end if;
  v_access := coalesce(public.has_ineditas(), false);
  -- a questão de origem segue a regra de leitura da tabela: oficial, com acesso às inéditas, ou já respondida por quem pede
  if v_src.origin <> 'official' and not v_access
     and not exists (select 1 from public.question_attempts a where a.user_id = v_uid and a.question_id = v_src.id) then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;
  select e.group_id into v_group from public.question_equivalents e where e.question_id = v_src.id;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(y.item order by y.prio, y.approved desc, y.score desc, y.id) from (
      select x.* from (
        select distinct on (coalesce(e.group_id, q.id))
               q.id, r.score,
               case r.relation when 'mesmo_raciocinio' then 1 when 'complementar' then 2 when 'mesmo_subtema' then 3 else 4 end as prio,
               r.status = 'aprovada' as approved,
               jsonb_build_object(
                 'id', q.id, 'code', q.code,
                 'exam_label', case when ex.kind = 'STAZIAMED' then 'Questões Inéditas' else coalesce(ex.title, ex.kind || ' ' || ex.year) end,
                 'number', q.number, 'area', q.area, 'tema', q.topic, 'subtema', q.subtopic,
                 'relation', r.relation,
                 'reason', case r.relation when 'mesmo_raciocinio' then 'Raciocínio semelhante'
                                           when 'complementar' then 'Questão complementar: mesmo assunto, outra etapa'
                                           when 'mesmo_subtema' then 'Mesmo subtema'
                                           else 'Mesmo tema, outra abordagem' end,
                 'answered', exists (select 1 from public.question_attempts a where a.user_id = v_uid and a.question_id = q.id),
                 -- só vêm questões que a pessoa pode abrir (a inédita fechada nem aparece): o cadeado fica sempre aberto aqui
                 'locked', false) as item
        from public.question_relations r
        join public.questions q on q.id = case when r.question_a = v_src.id then r.question_b else r.question_a end
        join public.exams ex on ex.id = q.exam_id
        left join public.question_equivalents e on e.question_id = q.id
        where (r.question_a = v_src.id or r.question_b = v_src.id)
          and r.relation in ('mesmo_raciocinio', 'complementar', 'mesmo_subtema', 'mesmo_tema')
          -- aprovada por pessoa, ou proposta do motor (regra ou vetor) com confiança alta; o que a IA reclassificou só depois de aprovado
          and (r.status = 'aprovada' or (r.status = 'proposta' and r.origin in ('regra', 'vetor') and r.confidence >= 0.8 and not r.stale))
          and q.status <> 'annulled'
          and not (q.needs_image and jsonb_array_length(q.images) = 0)
          and (q.origin = 'official' or (q.retired_at is null and v_access))
          and (v_group is null or e.group_id is distinct from v_group)
        order by coalesce(e.group_id, q.id),
                 case r.relation when 'mesmo_raciocinio' then 1 when 'complementar' then 2 when 'mesmo_subtema' then 3 else 4 end,
                 (r.status = 'aprovada') desc, r.score desc) x
      order by x.prio, x.approved desc, x.score desc, x.id
      limit v_n) y), '[]'::jsonb));
end
$$;

-- Aluno: abrir uma questão relacionada como um treino de uma questão só (pedido das telas). Mesmas travas do treino: Questão
-- Inédita fechada recusa com o aviso do plano (42501); recolhida, anulada ou sem a figura de que depende não entra.
create or replace function public.app_start_related_question(p_question_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.questions;
  v_gate text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta para treinar.' using errcode = '28000'; end if;
  select * into v_q from public.questions where id = p_question_id;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if v_q.origin = 'staziamed' then
    v_gate := public.ineditas_gate();
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
    if v_q.retired_at is not null then raise exception 'Esta Questão Inédita foi recolhida e não entra mais em treino.' using errcode = '22023'; end if;
  end if;
  if v_q.status = 'annulled' then raise exception 'Questão anulada pela banca: não entra em treino.' using errcode = '22023'; end if;
  if v_q.needs_image and jsonb_array_length(v_q.images) = 0 then
    raise exception 'Esta questão depende de uma figura que ainda não está disponível.' using errcode = '22023';
  end if;
  insert into public.practice_sessions (user_id, kind, config, question_ids)
  values (v_uid, 'questoes', jsonb_build_object('filters', '{}'::jsonb, 'requested', 1, 'related_to', v_q.id), array[v_q.id])
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'count', 1);
end
$$;

-- Administração: lista de relações. p_filter: duplicadas | baixa_confianca | propostas | todas.
create or replace function public.app_admin_question_relations(p_filter text default 'propostas', p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_f constant text := coalesce(nullif(p_filter, ''), 'propostas');
  v_n constant integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off constant integer := greatest(coalesce(p_offset, 0), 0);
  v_scope text[];
begin
  perform public.similarity_assert_team();
  if v_f not in ('duplicadas', 'baixa_confianca', 'propostas', 'todas') then raise exception 'Filtro inválido.' using errcode = '22023'; end if;
  v_scope := public.ch_draft_scope();
  return (
    with base as (
      select r.* from public.question_relations r
      where public.similarity_pair_in_scope(r.question_a, r.question_b, v_scope)
        and case v_f
              when 'duplicadas' then r.relation in ('duplicada_exata', 'duplicada_semantica') and r.status <> 'rejeitada'
              when 'baixa_confianca' then r.status = 'proposta' and r.confidence < 0.6
              when 'propostas' then r.status = 'proposta' or r.stale
              else true end)
    select jsonb_build_object(
      'total', (select count(*)::int from base),
      'items', coalesce((select jsonb_agg(public.similarity_relation_item(b) order by
                           case when v_f = 'baixa_confianca' then b.confidence end asc,
                           case when v_f = 'todas' then b.created_at end desc,
                           b.score desc, b.id)
                         from (select * from base order by
                                 case when v_f = 'baixa_confianca' then confidence end asc,
                                 case when v_f = 'todas' then created_at end desc,
                                 score desc, id
                               limit v_n offset v_off) b), '[]'::jsonb)));
end
$$;

-- Administração: aprovar ou rejeitar uma relação (e corrigir o tipo ao aprovar). Registra no histórico e no admin_audit_log.
create or replace function public.app_admin_review_relation(p_id uuid, p_decision text, p_relation text default null, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.question_relations;
  v_new public.question_relations;
  v_rel text;
  v_ba text; v_bb text;
begin
  perform public.similarity_assert_team();
  if p_decision is null or p_decision not in ('aprovar', 'rejeitar') then raise exception 'Decisão inválida: use aprovar ou rejeitar.' using errcode = '22023'; end if;
  if p_relation is not null and p_relation not in ('duplicada_exata', 'duplicada_semantica', 'mesmo_raciocinio', 'mesmo_subtema', 'mesmo_tema', 'complementar', 'nao_relacionada') then
    raise exception 'Tipo de relação inválido.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Observação com mais de 1.000 caracteres.' using errcode = '22023'; end if;
  select * into r from public.question_relations where id = p_id for update;
  if not found then raise exception 'Relação não encontrada.' using errcode = 'P0002'; end if;
  if not public.similarity_pair_in_scope(r.question_a, r.question_b, public.ch_draft_scope()) then
    raise exception 'Só o revisor médico das áreas destas questões (ou a equipe) pode decidir esta relação.' using errcode = '42501';
  end if;
  v_rel := case when p_decision = 'aprovar' then coalesce(p_relation, r.relation) else r.relation end;
  select basis_hash into v_ba from public.question_similarity_state where question_id = r.question_a;
  select basis_hash into v_bb from public.question_similarity_state where question_id = r.question_b;
  update public.question_relations
     set status = case when p_decision = 'aprovar' then 'aprovada' else 'rejeitada' end,
         relation = v_rel,
         origin = case when v_rel is distinct from r.relation then 'revisor' else origin end,
         stale = false, basis_a = coalesce(v_ba, basis_a), basis_b = coalesce(v_bb, basis_b),
         reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where id = r.id
  returning * into v_new;
  insert into public.question_relation_history (relation_id, question_a, question_b, event, actor_id, before, after)
  values (r.id, r.question_a, r.question_b, case when p_decision = 'aprovar' then 'aprovada' else 'rejeitada' end, (select auth.uid()),
          jsonb_build_object('relation', r.relation, 'status', r.status, 'origin', r.origin),
          jsonb_build_object('relation', v_new.relation, 'status', v_new.status, 'note', v_new.review_note));
  perform public.admin_log('similarity.relation.review', r.id::text,
    jsonb_build_object('decision', p_decision, 'question_a', r.question_a, 'question_b', r.question_b,
                       'relation_before', r.relation, 'relation_after', v_new.relation, 'note', v_new.review_note));
  return public.similarity_relation_item(v_new);
end
$$;

-- Administração: reprocessar. Sem lista = só o que mudou; com lista = essas questões de novo, mesmo sem mudança.
-- Põe UM trabalho na fila (sem duplicar). Os vetores só são gerados com a função ligada na Central de IAs.
create or replace function public.app_admin_similarity_reprocess(p_question_ids text[] default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_pending integer; v_job jsonb; v_marked integer := 0;
begin
  if (select auth.uid()) is null or not public.is_staff() then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  if p_question_ids is not null and cardinality(p_question_ids) > 5000 then raise exception 'No máximo 5.000 questões por pedido.' using errcode = '22023'; end if;
  perform public.similarity_refresh_state(null);
  if p_question_ids is not null then
    update public.question_similarity_state set requested_at = clock_timestamp() where question_id = any (p_question_ids);
    get diagnostics v_marked = row_count;
  end if;
  v_pending := cardinality(public.similarity_pending_ids(null, null, null));
  if v_pending = 0 then
    return jsonb_build_object('queued', 0, 'job_id', null, 'duplicate', false);
  end if;
  v_job := public.similarity_enqueue('motor', (select auth.uid()), '{}'::jsonb);
  perform public.admin_log('similarity.reprocess', null,
    jsonb_build_object('questions', coalesce(cardinality(p_question_ids), 0), 'marked', v_marked, 'queued', v_pending,
                       'job_id', v_job ->> 'job_id', 'duplicate', (v_job ->> 'duplicate')::boolean));
  return jsonb_build_object('queued', v_pending, 'job_id', v_job ->> 'job_id', 'duplicate', (v_job ->> 'duplicate')::boolean);
end
$$;

-- Administração (além do contrato): classificar por IA os pares duvidosos, em lote. Só administrador e só com a função
-- "Questões parecidas" configurada na Central de IAs (ela começa desligada). A IA nunca aprova: o par continua proposto.
create or replace function public.app_admin_similarity_classify(p_limit integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_n constant integer := least(greatest(coalesce(p_limit, 20), 1), 100); v_pairs integer; v_job jsonb;
begin
  perform public.assert_admin();
  if not exists (select 1 from public.ai_functions where key = 'similaridade') then
    raise exception 'A função "Questões parecidas" está desligada na Central de IAs: configure-a lá antes de pedir a classificação por IA.' using errcode = '55000';
  end if;
  select count(*)::int into v_pairs from public.question_relations r
   where r.status = 'proposta' and r.origin in ('regra', 'vetor') and r.relation <> 'duplicada_exata' and not r.stale and r.confidence < 0.6;
  v_pairs := least(v_pairs, v_n);
  if v_pairs = 0 then return jsonb_build_object('queued', 0, 'job_id', null, 'duplicate', false); end if;
  v_job := public.similarity_enqueue('ia', (select auth.uid()), jsonb_build_object('limit', v_n));
  perform public.admin_log('similarity.classify', null, jsonb_build_object('pairs', v_pairs, 'job_id', v_job ->> 'job_id', 'duplicate', (v_job ->> 'duplicate')::boolean));
  return jsonb_build_object('queued', v_pairs, 'job_id', v_job ->> 'job_id', 'duplicate', (v_job ->> 'duplicate')::boolean);
end
$$;

-- Administração: situação do motor.
create or replace function public.app_admin_similarity_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.similarity_assert_team();
  return jsonb_build_object(
    'perfis', (select count(*)::int from public.question_profiles),
    'com_vetor', (select count(*)::int from (select e.question_id from public.question_embeddings e group by e.question_id having count(distinct e.kind) = 2) x),
    'relacoes', (select count(*)::int from public.question_relations where status <> 'rejeitada' and relation <> 'nao_relacionada'),
    'pendentes_revisao', (select count(*)::int from public.question_relations where status = 'proposta' or stale),
    -- data ISO do fim da última execução (ou do começo, se ainda roda); nulo = nunca rodou
    'ultima_execucao', (select to_jsonb(coalesce(r.finished_at, r.started_at)) from public.similarity_runs r order by r.started_at desc limit 1),
    'ultima_execucao_detalhe', (select jsonb_build_object('id', r.id, 'mode', r.mode, 'status', r.status, 'started_at', r.started_at, 'finished_at', r.finished_at,
                                                  'duration_ms', r.duration_ms, 'cost_usd', r.cost_usd, 'tokens', r.tokens, 'questions', r.questions,
                                                  'embedded', r.embedded, 'relations_new', r.relations_new, 'relations_changed', r.relations_changed,
                                                  'relations_removed', r.relations_removed, 'ai_pairs', r.ai_pairs, 'message', r.message)
                        from public.similarity_runs r order by r.started_at desc limit 1),
    -- além do contrato
    'questoes', (select count(*)::int from public.questions),
    'duplicadas', (select count(*)::int from public.question_relations where relation in ('duplicada_exata', 'duplicada_semantica') and status <> 'rejeitada'),
    'baixa_confianca', (select count(*)::int from public.question_relations where status = 'proposta' and confidence < 0.6),
    'desatualizadas', (select count(*)::int from public.question_relations where stale),
    'perfis_desatualizados', (select count(*)::int from public.question_profiles p join public.questions q on q.id = p.question_id
                               where p.basis_hash is distinct from public.similarity_text_hash(q.statement, q.options)),
    'pendentes_processar', cardinality(public.similarity_pending_ids(null, null, null)),
    'na_fila', exists (select 1 from public.ch_jobs where step = 'similarity' and status in ('queued', 'running', 'blocked')),
    'versao_do_motor', public.similarity_engine_version(),
    'funcao_ia_ligada', exists (select 1 from public.ai_functions where key = 'similaridade'));
end
$$;

-- ---------------------------------------------------------------- permissões das funções
do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'similarity\_%' or p.proname like 'ch\_worker\_similarity\_%' or p.proname = 'ai_function_keys') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  revoke execute on function public.ch_worker_ai_save_function(uuid, text, jsonb) from public, anon, authenticated;
  revoke execute on function public.app_ai_summary() from public, anon;
  revoke execute on function public.app_related_questions(text, integer) from public, anon;
  revoke execute on function public.app_start_related_question(text) from public, anon;
  revoke execute on function public.app_admin_question_relations(text, integer, integer) from public, anon;
  revoke execute on function public.app_admin_review_relation(uuid, text, text, text) from public, anon;
  revoke execute on function public.app_admin_similarity_reprocess(text[]) from public, anon;
  revoke execute on function public.app_admin_similarity_classify(integer) from public, anon;
  revoke execute on function public.app_admin_similarity_status() from public, anon;
  grant execute on function public.app_related_questions(text, integer) to authenticated;
  grant execute on function public.app_start_related_question(text) to authenticated;
  grant execute on function public.app_admin_question_relations(text, integer, integer) to authenticated;
  grant execute on function public.app_admin_review_relation(uuid, text, text, text) to authenticated;
  grant execute on function public.app_admin_similarity_reprocess(text[]) to authenticated;
  grant execute on function public.app_admin_similarity_classify(integer) to authenticated;
  grant execute on function public.app_admin_similarity_status() to authenticated;
end
$revoke$;

-- Para desfazer: drop das funções app_related_questions, app_start_related_question, app_admin_question_relations, app_admin_review_relation,
-- app_admin_similarity_*, ch_worker_similarity_*, similarity_* e ai_function_keys; drop das tabelas question_relation_history,
-- question_relations, question_embeddings, question_similarity_state, similarity_runs e question_profiles; recriar
-- ch_worker_ai_save_function e app_ai_summary como na …9610 e tirar 'similarity'/'similaridade' das duas restrições.
