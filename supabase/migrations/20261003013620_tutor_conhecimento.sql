-- =============================================================================
-- CÉREBRO DO TUTOR: conhecimento aprovado, numa busca só, sem demora perceptível (pedido do dono de 17/10/2026: "o cérebro tem que
-- ter acesso a aulas, documentos, fontes médicas, protocolos, diretrizes, provas, tudo que estiver no banco ... porém sem latência").
-- Desenho: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/DESENHO.md. Aditiva; pode ser colada de novo.
--
--   * public.tutor_kb_trechos: trechos curtos (até 1.200 caracteres) de fontes oficiais, aulas publicadas, atualizações aprovadas,
--     explicações de questões, flashcards publicados, mapas mentais e da PORTA das estações aprovadas. Cada um com título, ano,
--     seção e página para citar. Índice de palavras (GIN) e, em public.tutor_kb_vetores, o vetor (gemini-embedding-2, 768, HNSW).
--   * PORTÃO DE APROVAÇÃO conferido DUAS vezes no banco: (1) ch_worker_tutor_kb_gravar recusa trecho de origem não aprovada (ou de
--     versão diferente da aprovada) e (2) a busca reconfere, linha a linha, cada trecho que vai devolver (tutor_kb_versao_atual).
--     Uma aula recolhida, uma atualização despublicada ou uma fonte substituída some da busca NA HORA, antes de qualquer limpeza.
--   * NUNCA entram: rascunhos (draft_questions), atualização pendente ou do app antigo (legacy_app), documentos em revisão
--     (ch_documents/ch_blocks: o documento aprovado chega como FONTE), questões de fixação (ch_materials), apostila (fonte
--     complementar), e da estação o roteiro do ator, o checklist, as pressões e a cena do médico (o portão nem lê esses campos).
--   * ch_worker_tutor_kb_buscar: numa ida ao banco confere o aluno, a ligação de voz, o limite de frequência e a chave da IA; exclui a
--     questão aberta, as equivalentes e relacionadas, as questões de simulado/prova em andamento, as que o aluno ainda não respondeu
--     (regra padrão) e as Inéditas fora do plano; junta palavras e significado (RRF, k = 60) usando o índice HNSW de verdade (sem
--     filtro de distância no where) e devolve a citação pronta. Registra os trechos entregues (tutor_kb_entregas).
--   * ch_worker_tutor_kb_pacote: o MATERIAL DO TEMA da abertura da conversa, sem chamar o Google (vetor da questão ou do tema,
--     guardado na indexação). Nunca leva explicação de questão nem estação.
--   * public.tutor_kb_regras: as decisões do dono (padrões conservadores até ele decidir).
--   * Só o servidor lê e grava: RLS ligada sem políticas e execução revogada de public/anon/authenticated. Funções SECURITY DEFINER
--     com search_path vazio. A busca da Central (ch_worker_search_official_passages) NÃO muda.
--
-- Para desfazer: supabase/desfazer/20261003013620_tutor_conhecimento.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- regras do dono (1 linha)
create table if not exists public.tutor_kb_regras (
  id boolean primary key default true check (id),
  -- decisão 1: os trechos de fontes sem aprovação editorial ficam fora do Tutor (só do Tutor; a Central continua igual)
  fontes_exigem_aprovacao_editorial boolean not null default true,
  -- decisão 2: revisão mínima para o Tutor citar a explicação de uma questão: 'humana' | 'dois_revisores_ia' | 'ia'
  questoes_nivel_minimo text not null default 'humana' check (questoes_nivel_minimo in ('humana', 'dois_revisores_ia', 'ia')),
  -- decisão 3: explicação só de questão que o aluno já respondeu
  questoes_so_respondidas boolean not null default true,
  -- decisão 4: tamanho do material da abertura (tokens; ~4 caracteres por token)
  pacote_tokens integer not null default 4000 check (pacote_tokens between 0 and 40000),
  updated_at timestamptz not null default now()
);
insert into public.tutor_kb_regras (id) values (true) on conflict (id) do nothing;
alter table public.tutor_kb_regras enable row level security;

-- ---------------------------------------------------------------- trechos
create table if not exists public.tutor_kb_trechos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fonte', 'aula', 'atualizacao', 'questao', 'flashcard', 'mapa', 'estacao')),
  origem_id text not null,                 -- passage_id, lesson_id, guideline_updates.id, questions.id, flashcards.id, slug do mapa, station id
  origem_versao text not null,             -- versão aprovada de onde o trecho saiu (tutor_kb_versao_atual); mudou → o trecho deixa de valer
  grupo text not null,                     -- fonte (ch_sources.id), aula, atualização...: no máximo 2 trechos do mesmo grupo por busca
  parte integer not null default 0 check (parte between 0 and 500),
  questao_id text,                         -- tipo 'questao': trava do gabarito
  estacao_id text,                         -- tipo 'estacao'
  tema_ids text[] not null default '{}',
  area text,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 300),
  ano integer check (ano between 1900 and 2200),
  secao text check (char_length(secao) <= 300),
  pagina integer,
  texto text not null check (char_length(texto) between 20 and 1200),
  nivel_revisao text not null check (nivel_revisao in ('oficial', 'humana', 'dois_revisores_ia', 'ia')),
  plano_minimo text,                       -- null = todos; outros valores ficam travados até o cadeado do plano existir
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  tsv tsvector generated always as (to_tsvector('portuguese', titulo || ' ' || coalesce(secao, '') || ' ' || texto)) stored,
  criado_em timestamptz not null default now(),
  unique (tipo, origem_id, parte),
  check ((tipo = 'questao') = (questao_id is not null)),
  check ((tipo = 'estacao') = (estacao_id is not null))
);
create index if not exists tutor_kb_trechos_tsv_idx on public.tutor_kb_trechos using gin (tsv);
create index if not exists tutor_kb_trechos_temas_idx on public.tutor_kb_trechos using gin (tema_ids);
create index if not exists tutor_kb_trechos_questao_idx on public.tutor_kb_trechos (questao_id) where questao_id is not null;
alter table public.tutor_kb_trechos enable row level security;

-- vetor de cada trecho (mesmo modelo da Central)
create table if not exists public.tutor_kb_vetores (
  trecho_id uuid primary key references public.tutor_kb_trechos (id) on delete cascade,
  model text not null check (char_length(model) between 1 and 80),
  hash text not null,
  embedding real[] not null check (array_ndims(embedding) = 1 and array_length(embedding, 1) = 768),
  criado_em timestamptz not null default now()
);
alter table public.tutor_kb_vetores enable row level security;

-- vetores dos rótulos (tema, questão), para o pacote da abertura sem chamar o Google
create table if not exists public.tutor_kb_rotulos (
  chave text primary key check (char_length(chave) between 1 and 400), -- 'q:<question_id>' ou o rótulo dobrado (public.fold_text)
  texto text not null check (char_length(texto) between 1 and 2000),
  model text not null,
  embedding real[] not null check (array_ndims(embedding) = 1 and array_length(embedding, 1) = 768),
  criado_em timestamptz not null default now()
);
alter table public.tutor_kb_rotulos enable row level security;

-- cache compartilhado dos vetores das perguntas (todas as instâncias e a ponte enxergam; a busca lê por dentro)
create table if not exists public.tutor_kb_consultas (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  model text not null,
  embedding real[] not null check (array_ndims(embedding) = 1 and array_length(embedding, 1) = 768),
  usos integer not null default 1,
  ultimo_uso timestamptz not null default now()
);
alter table public.tutor_kb_consultas enable row level security;

-- o que foi entregue a cada conversa (evidência da conferência da fala + auditoria): só ids, nunca o texto
create table if not exists public.tutor_kb_entregas (
  id bigint generated always as identity primary key,
  sessao_id uuid not null references public.tutor_sessions (id) on delete cascade,
  voice_call_id uuid,
  trecho_ids uuid[] not null,
  via text not null check (via in ('texto', 'voz', 'ponte', 'pacote', 'avaliacao')),
  criado_em timestamptz not null default now()
);
create index if not exists tutor_kb_entregas_sessao_idx on public.tutor_kb_entregas (sessao_id, criado_em desc);
alter table public.tutor_kb_entregas enable row level security;

-- pgvector, quando o banco tiver (Supabase): índices HNSW pelo cosseno sobre o vetor convertido (como a migração 5000)
do $vec$
declare v_schema text;
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create schema if not exists extensions;
    create extension if not exists vector with schema extensions;
    select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
    execute format('create index if not exists tutor_kb_vetores_hnsw on public.tutor_kb_vetores using hnsw ((embedding::%1$I.vector(768)) %1$I.vector_cosine_ops)', v_schema);
    execute format('create index if not exists tutor_kb_rotulos_hnsw on public.tutor_kb_rotulos using hnsw ((embedding::%1$I.vector(768)) %1$I.vector_cosine_ops)', v_schema);
  end if;
end
$vec$;

-- ---------------------------------------------------------------- portão de aprovação
-- Nível de revisão da explicação de uma questão. 'humana': comment_review com ia = false e um revisor (pessoa) registrado.
-- 'dois_revisores_ia': Inédita sem comment_review (a carga registra "2 revisores médicos (skill revisor-medico)", que é IA).
-- 'ia': conferida só por IA. Qualquer outra coisa: 'sem_revisao' (nunca entra).
create or replace function public.tutor_kb_nivel_questao(p_origin text, p_review jsonb) returns text
  language sql immutable set search_path = ''
as $$
  select case
    when p_review ->> 'ia' = 'false' and nullif(btrim(coalesce(p_review ->> 'por', '')), '') is not null then 'humana'
    when p_review is null and p_origin = 'staziamed' then 'dois_revisores_ia'
    when p_review ->> 'ia' = 'true' then 'ia'
    else 'sem_revisao' end
$$;

create or replace function public.tutor_kb_nivel_rank(p_nivel text) returns integer
  language sql immutable set search_path = ''
as $$ select case p_nivel when 'oficial' then 4 when 'humana' then 3 when 'dois_revisores_ia' then 2 when 'ia' then 1 else 0 end $$;

-- A versão APROVADA de uma origem agora, ou nulo se a origem não pode chegar ao aluno. É o portão único: a gravação compara com a
-- versão que o indexador leu e a busca compara com a versão gravada em cada trecho (mudou ou deixou de valer → o trecho some).
create or replace function public.tutor_kb_versao_atual(p_tipo text, p_origem text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.tutor_kb_regras;
  v text;
  uuid_ok constant boolean := coalesce(p_origem, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select * into r from public.tutor_kb_regras where id;
  if not found then r := row(true, true, 'humana', true, 4000, now())::public.tutor_kb_regras; end if;
  case p_tipo
    when 'fonte' then
      if not uuid_ok then return null; end if;
      select md5(s.title || '|' || coalesce(s.organ, '') || '|' || coalesce(p.section, '') || '|' || coalesce(p.page::text, '') || '|' || p.text) into v
        from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
       where p.id = p_origem::uuid
         and s.status = 'current' and s.audience is distinct from 'complementar' and s.retracted_at is null
         and (s.valid_until is null or s.valid_until >= current_date)
         and ((s.kind = 'final' and s.authority_level in ('A', 'B', 'C', 'D'))
              or (s.kind = 'society_guideline' and s.editorial_approved and coalesce(s.authority_level, 'A') in ('A', 'B', 'C', 'D')))
         and (not r.fontes_exigem_aprovacao_editorial or s.editorial_approved);
    when 'aula' then
      if not uuid_ok then return null; end if;
      select l.ch_version_id::text into v
        from public.lessons l join public.ch_unit_versions uv on uv.id = l.ch_version_id
       where l.id = p_origem::uuid and l.published and l.origin = 'central' and uv.status = 'published'
         and exists (select 1 from public.ch_publications pb where pb.unit_version_id = uv.id and pb.retired_at is null);
    when 'atualizacao' then
      if not uuid_ok then return null; end if;
      select md5(concat_ws('|', g.topic, g.subtopic, g.document_title, g.institution, g.publication_label, g.years::text, g.before_text,
                            g.current_conduct, g.clinical_impact, g.exam_impact, g.trap, g.timeline::text)) into v
        from public.guideline_updates g
       where g.id = p_origem::uuid and g.published and g.review_status = 'approved' and g.origin = 'manual';
    when 'questao' then
      select md5(concat_ws('|', q.statement, q.options::text, q.correct_option, q.expected_conduct, q.sources::text, q.comment_review::text, q.status)) into v
        from public.questions q
       where q.id = p_origem and q.retired_at is null and q.status = 'valid'
         and (q.origin = 'staziamed'
              or exists (select 1 from public.question_official_answers a where a.question_id = q.id and a.is_current and a.answer_status = 'FINAL'))
         and public.tutor_kb_nivel_rank(public.tutor_kb_nivel_questao(q.origin, q.comment_review)) >= public.tutor_kb_nivel_rank(r.questoes_nivel_minimo);
    when 'flashcard' then
      if not uuid_ok then return null; end if;
      select md5(concat_ws('|', f.topic, f.front, f.back, f.mnemonic, f.review_status)) into v
        from public.flashcards f
       where f.id = p_origem::uuid and f.published and f.owner_id is null and f.review_status in ('medical_reviewed', 'approved');
    when 'estacao' then
      -- só o que o candidato vê na PORTA; o portão nem lê roteiro do ator, checklist, pressões ou cena do médico
      select md5(concat_ws('|', s.name, s.topic, s.area, s.setting, s.is_pro_only::text, (select c.content -> 'doctor_tasks' from public.checklist_station_contents c where c.station_id = s.id)::text)) into v
        from public.checklist_stations s
       where s.id = p_origem and s.medical_review = 'approved';
    when 'mapa' then
      -- os mapas mentais são arquivos do app (já abertos a todos os alunos); a versão é a que o indexador gravou
      select t.origem_versao into v from public.tutor_kb_trechos t where t.tipo = 'mapa' and t.origem_id = p_origem limit 1;
    else
      return null;
  end case;
  return v;
end
$$;

-- O plano do aluno libera um trecho? Sem cadeado (null): sim. Cadeados futuros ficam travados até a regra existir.
create or replace function public.tutor_kb_plano_libera(p_user uuid, p_plano text) returns boolean
  language sql stable security definer set search_path = ''
as $$ select p_plano is null $$;

-- ---------------------------------------------------------------- indexador (só o servidor/processamento)
-- Origens aprovadas que ainda não estão no índice com a versão atual (ou todas, com p_todas). Devolve só os campos que podem virar
-- trecho: nada de practice_questions, roteiro do ator, checklist, gabarito oficial em separado etc.
create or replace function public.ch_worker_tutor_kb_origens(p_tipo text, p_limite integer default 50, p_depois text default '', p_todas boolean default false) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  n constant integer := least(greatest(coalesce(p_limite, 50), 1), 500);
  d constant text := coalesce(p_depois, '');
  out jsonb;
begin
  if p_tipo = 'fonte' then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into out from (
      select p.id::text as k, jsonb_build_object('origem_id', p.id, 'versao', public.tutor_kb_versao_atual('fonte', p.id::text), 'grupo', s.id,
               'titulo', s.title, 'orgao', s.organ, 'versao_doc', s.version, 'ano', extract(year from coalesce(s.published_on, s.effective_date))::int,
               'secao', p.section, 'pagina', p.page, 'tema', coalesce(p.theme, s.theme), 'texto', p.text,
               'nivel', 'oficial', 'tem_vetor_central', exists (select 1 from public.ch_passage_embeddings e where e.passage_id = p.id)) as o
        from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
       where p.id::text > d and public.tutor_kb_versao_atual('fonte', p.id::text) is not null
         and (p_todas or not exists (select 1 from public.tutor_kb_trechos t where t.tipo = 'fonte' and t.origem_id = p.id::text
                                         and t.origem_versao = public.tutor_kb_versao_atual('fonte', p.id::text)))
       order by p.id::text limit n) x;
  elsif p_tipo = 'aula' then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into out from (
      select l.id::text as k, jsonb_build_object('origem_id', l.id, 'versao', l.ch_version_id, 'grupo', l.id, 'titulo', l.title, 'area', l.area::text,
               'ano', (select extract(year from max(pb.published_at))::int from public.ch_publications pb where pb.unit_version_id = l.ch_version_id and pb.retired_at is null),
               'tema_ids', coalesce((select jsonb_agg(u.theme_node_id) from public.ch_units u join public.ch_unit_versions uv on uv.unit_id = u.id where uv.id = l.ch_version_id and u.theme_node_id is not null), '[]'::jsonb),
               'secoes', coalesce((select jsonb_agg(jsonb_build_object('titulo', sec ->> 'heading',
                                   'paragrafos', coalesce((select jsonb_agg(pp ->> 'text' order by o2) from jsonb_array_elements(case when jsonb_typeof(sec -> 'paragraphs') = 'array' then sec -> 'paragraphs' else '[]'::jsonb end) with ordinality as z (pp, o2)), '[]'::jsonb))
                                   order by o1)
                           from public.ch_unit_versions uv, jsonb_array_elements(case when jsonb_typeof(uv.content -> 'sections') = 'array' then uv.content -> 'sections' else '[]'::jsonb end) with ordinality as y (sec, o1)
                          where uv.id = l.ch_version_id), '[]'::jsonb),
               'nivel', 'oficial') as o
        from public.lessons l
       where l.id::text > d and public.tutor_kb_versao_atual('aula', l.id::text) is not null
         and (p_todas or not exists (select 1 from public.tutor_kb_trechos t where t.tipo = 'aula' and t.origem_id = l.id::text and t.origem_versao = l.ch_version_id::text))
       order by l.id::text limit n) x;
  elsif p_tipo = 'atualizacao' then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into out from (
      select g.id::text as k, jsonb_build_object('origem_id', g.id, 'versao', public.tutor_kb_versao_atual('atualizacao', g.id::text), 'grupo', g.id,
               'titulo', coalesce(nullif(btrim(g.document_title), ''), g.topic), 'tema', g.topic, 'subtema', g.subtopic, 'instituicao', g.institution,
               'rotulo', g.publication_label, 'area', g.area::text, 'ano', (select max(y) from unnest(g.years) y),
               'antes', g.before_text, 'conduta', g.current_conduct, 'impacto_clinico', g.clinical_impact, 'impacto_prova', g.exam_impact, 'armadilha', g.trap,
               'linha_do_tempo', g.timeline, 'nivel', 'oficial') as o
        from public.guideline_updates g
       where g.id::text > d and public.tutor_kb_versao_atual('atualizacao', g.id::text) is not null
         and (p_todas or not exists (select 1 from public.tutor_kb_trechos t where t.tipo = 'atualizacao' and t.origem_id = g.id::text
                                         and t.origem_versao = public.tutor_kb_versao_atual('atualizacao', g.id::text)))
       order by g.id::text limit n) x;
  elsif p_tipo = 'questao' then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into out from (
      select q.id as k, jsonb_build_object('origem_id', q.id, 'versao', public.tutor_kb_versao_atual('questao', q.id), 'grupo', q.id,
               'prova', coalesce(e.title, q.exam_id), 'ano', e.year, 'numero', q.number, 'origem', q.origin, 'area', q.area::text, 'tema', q.topic, 'subtema', q.subtopic,
               'enunciado', q.statement, 'correta', q.correct_option,
               'explicacao_correta', (select o ->> 'explanation' from jsonb_array_elements(q.options) o where o ->> 'id' = q.correct_option::text limit 1),
               'texto_correta', (select o ->> 'text' from jsonb_array_elements(q.options) o where o ->> 'id' = q.correct_option::text limit 1),
               'conduta', q.expected_conduct, 'fontes', q.sources,
               'tema_ids', coalesce((select jsonb_agg(pr.taxonomy_node_id) from public.question_profiles pr where pr.question_id = q.id and pr.taxonomy_node_id is not null), '[]'::jsonb),
               'nivel', public.tutor_kb_nivel_questao(q.origin, q.comment_review)) as o
        from public.questions q left join public.exams e on e.id = q.exam_id
       where q.id > d and public.tutor_kb_versao_atual('questao', q.id) is not null
         and (p_todas or not exists (select 1 from public.tutor_kb_trechos t where t.tipo = 'questao' and t.origem_id = q.id
                                         and t.origem_versao = public.tutor_kb_versao_atual('questao', q.id)))
       order by q.id limit n) x;
  elsif p_tipo = 'flashcard' then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into out from (
      select f.id::text as k, jsonb_build_object('origem_id', f.id, 'versao', public.tutor_kb_versao_atual('flashcard', f.id::text), 'grupo', coalesce(f.ch_unit_id::text, f.topic),
               'tema', f.topic, 'area', f.area::text, 'frente', f.front, 'verso', f.back, 'mnemonico', f.mnemonic, 'nivel', 'oficial',
               'ano', extract(year from f.created_at)::int) as o
        from public.flashcards f
       where f.id::text > d and public.tutor_kb_versao_atual('flashcard', f.id::text) is not null
         and (p_todas or not exists (select 1 from public.tutor_kb_trechos t where t.tipo = 'flashcard' and t.origem_id = f.id::text
                                         and t.origem_versao = public.tutor_kb_versao_atual('flashcard', f.id::text)))
       order by f.id::text limit n) x;
  elsif p_tipo = 'estacao' then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into out from (
      select s.id as k, jsonb_build_object('origem_id', s.id, 'versao', public.tutor_kb_versao_atual('estacao', s.id), 'grupo', s.id,
               'titulo', s.name, 'tema', s.topic, 'area', s.area, 'cenario', s.setting, 'pro', s.is_pro_only,
               'tarefas', (select c.content -> 'doctor_tasks' from public.checklist_station_contents c where c.station_id = s.id), 'nivel', 'oficial') as o
        from public.checklist_stations s
       where s.id > d and public.tutor_kb_versao_atual('estacao', s.id) is not null
         and (p_todas or not exists (select 1 from public.tutor_kb_trechos t where t.tipo = 'estacao' and t.origem_id = s.id
                                         and t.origem_versao = public.tutor_kb_versao_atual('estacao', s.id)))
       order by s.id limit n) x;
  else
    raise exception 'Tipo de conhecimento inválido.' using errcode = '22023';
  end if;
  return out;
end
$$;

-- Grava os trechos de UMA origem: [{texto, secao?, pagina?, hash}] + metadados {titulo, ano, area, grupo, tema_ids, nivel, plano_minimo,
-- questao_id, estacao_id}. O banco reconfere o portão: origem não aprovada (ou versão diferente da aprovada) → apaga o que houver
-- dela e recusa. Trecho com o mesmo texto (hash) mantém o vetor; texto novo perde o vetor (o indexador refaz).
create or replace function public.ch_worker_tutor_kb_gravar(p_tipo text, p_origem text, p_versao text, p_meta jsonb, p_trechos jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_atual text := public.tutor_kb_versao_atual(p_tipo, p_origem);
  m constant jsonb := coalesce(p_meta, '{}'::jsonb);
  n integer := 0;
  x jsonb;
  i integer := 0;
  v_nivel text := coalesce(m ->> 'nivel', 'oficial');
begin
  if p_tipo not in ('fonte', 'aula', 'atualizacao', 'questao', 'flashcard', 'mapa', 'estacao') then
    raise exception 'Tipo de conhecimento inválido.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_versao), '') = '' then raise exception 'Versão da origem ausente.' using errcode = '22023'; end if;
  -- mapa: arquivo do app (sem origem no banco); o indexador manda a revisão do arquivo
  if p_tipo <> 'mapa' and v_atual is distinct from p_versao then
    delete from public.tutor_kb_trechos where tipo = p_tipo and origem_id = p_origem;
    return jsonb_build_object('ok', false, 'motivo', case when v_atual is null then 'nao_aprovado' else 'versao_mudou' end);
  end if;
  -- questão: o nível é o do banco, não o que o indexador disse
  if p_tipo = 'questao' then
    select public.tutor_kb_nivel_questao(q.origin, q.comment_review) into v_nivel from public.questions q where q.id = p_origem;
  end if;
  if v_nivel not in ('oficial', 'humana', 'dois_revisores_ia', 'ia') then raise exception 'Nível de revisão inválido.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_trechos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_trechos, '[]'::jsonb)) > 400 then
    raise exception 'Trechos inválidos.' using errcode = '22023';
  end if;
  for x in select e from jsonb_array_elements(coalesce(p_trechos, '[]'::jsonb)) e loop
    insert into public.tutor_kb_trechos as t (tipo, origem_id, origem_versao, grupo, parte, questao_id, estacao_id, tema_ids, area, titulo, ano, secao, pagina,
                                             texto, nivel_revisao, plano_minimo, hash)
    values (p_tipo, p_origem, p_versao, coalesce(nullif(m ->> 'grupo', ''), p_origem), i,
            case when p_tipo = 'questao' then p_origem end, case when p_tipo = 'estacao' then p_origem end,
            coalesce((select array_agg(z) from jsonb_array_elements_text(case when jsonb_typeof(m -> 'tema_ids') = 'array' then m -> 'tema_ids' else '[]'::jsonb end) z), '{}'),
            nullif(m ->> 'area', ''), left(m ->> 'titulo', 300), nullif(m ->> 'ano', '')::integer,
            left(coalesce(nullif(x ->> 'secao', ''), nullif(m ->> 'secao', '')), 300), coalesce(nullif(x ->> 'pagina', ''), nullif(m ->> 'pagina', ''))::integer,
            x ->> 'texto', v_nivel, nullif(m ->> 'plano_minimo', ''), x ->> 'hash')
    on conflict (tipo, origem_id, parte) do update set
      origem_versao = excluded.origem_versao, grupo = excluded.grupo, questao_id = excluded.questao_id, estacao_id = excluded.estacao_id,
      tema_ids = excluded.tema_ids, area = excluded.area, titulo = excluded.titulo, ano = excluded.ano, secao = excluded.secao, pagina = excluded.pagina,
      texto = excluded.texto, nivel_revisao = excluded.nivel_revisao, plano_minimo = excluded.plano_minimo, hash = excluded.hash,
      criado_em = case when t.hash = excluded.hash then t.criado_em else now() end;
    i := i + 1;
  end loop;
  get diagnostics n = row_count;
  delete from public.tutor_kb_trechos where tipo = p_tipo and origem_id = p_origem and parte >= i;
  -- vetor de texto antigo não vale para o texto novo
  delete from public.tutor_kb_vetores v using public.tutor_kb_trechos t where t.id = v.trecho_id and t.tipo = p_tipo and t.origem_id = p_origem and v.hash <> t.hash;
  return jsonb_build_object('ok', true, 'trechos', i);
end
$$;

-- Fontes: o vetor que a Central já gerou (ch_passage_embeddings) vale para o trecho que é o mesmo texto do trecho da fonte (sem custo).
-- Trecho de fonte longa (cortado em partes) ou com texto retirado pela limpeza ganha vetor novo.
create or replace function public.ch_worker_tutor_kb_copiar_vetores_fontes(p_model text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  insert into public.tutor_kb_vetores (trecho_id, model, hash, embedding)
  select t.id, e.model, t.hash, e.embedding
    from public.tutor_kb_trechos t
    join public.ch_source_passages p on p.id::text = t.origem_id
    join public.ch_passage_embeddings e on e.passage_id = p.id and e.model = p_model
   where t.tipo = 'fonte' and t.parte = 0
     and not exists (select 1 from public.tutor_kb_trechos t2 where t2.tipo = 'fonte' and t2.origem_id = t.origem_id and t2.parte > 0)
     and regexp_replace(btrim(t.texto), '\s+', ' ', 'g') = regexp_replace(btrim(p.text), '\s+', ' ', 'g') -- a limpeza só junta espaços
     and not exists (select 1 from public.tutor_kb_vetores v where v.trecho_id = t.id and v.model = p_model and v.hash = t.hash)
  on conflict (trecho_id) do update set model = excluded.model, hash = excluded.hash, embedding = excluded.embedding, criado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- Trechos sem vetor do modelo (ou com vetor de texto antigo).
create or replace function public.ch_worker_tutor_kb_a_vetorizar(p_model text, p_limite integer default 50) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'secao', x.secao, 'texto', x.texto, 'hash', x.hash) order by x.id), '[]'::jsonb)
  from (select t.id, t.titulo, t.secao, t.texto, t.hash from public.tutor_kb_trechos t
         where not exists (select 1 from public.tutor_kb_vetores v where v.trecho_id = t.id and v.model = p_model and v.hash = t.hash)
         order by t.id limit least(greatest(coalesce(p_limite, 50), 1), 500)) x
$$;

-- Grava vetores [{trecho_id, hash, embedding}]; trecho apagado ou com texto mudado no meio do caminho é ignorado.
create or replace function public.ch_worker_tutor_kb_gravar_vetores(p_model text, p_itens jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if coalesce(btrim(p_model), '') = '' then raise exception 'Modelo dos vetores ausente.' using errcode = '22023'; end if;
  insert into public.tutor_kb_vetores (trecho_id, model, hash, embedding)
  select t.id, btrim(p_model), t.hash, array(select v::real from jsonb_array_elements_text(x -> 'embedding') with ordinality as z (v, i) order by i)
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
    join public.tutor_kb_trechos t on t.id::text = x ->> 'trecho_id' and t.hash = x ->> 'hash'
  on conflict (trecho_id) do update set model = excluded.model, hash = excluded.hash, embedding = excluded.embedding, criado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- Rótulos que ainda não têm vetor: o enunciado de cada questão válida (sem alternativas nem explicações; o aluno vê o enunciado) e os
-- temas (questões, aulas, atualizações, taxonomia, 100 grandes temas). Servem SÓ para achar o material do tema; nunca voltam ao aluno.
create or replace function public.ch_worker_tutor_kb_rotulos_a_vetorizar(p_model text, p_limite integer default 100) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with todos as (
    select 'q:' || q.id as chave, left(concat_ws(' — ', q.topic, q.subtopic, q.statement), 2000) as texto
      from public.questions q where q.retired_at is null and q.status = 'valid'
    union
    select public.fold_text(btrim(v)), btrim(v)
      from (select q.topic as v from public.questions q where q.retired_at is null
            union select concat_ws(' ', q.topic, q.subtopic) from public.questions q where q.retired_at is null and q.subtopic is not null
            union select l.title from public.lessons l where l.published
            union select l.topic from public.lessons l where l.published
            union select g.topic from public.guideline_updates g where g.published
            union select n.name from public.ch_taxonomy_nodes n where n.status is distinct from 'rejected'
            union select gt.titulo from public.grande_temas gt) z
     where char_length(btrim(coalesce(v, ''))) between 3 and 300)
  select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'texto', x.texto) order by x.chave), '[]'::jsonb)
    from (select t.chave, t.texto from todos t
           where t.chave is not null and t.chave <> ''
             and not exists (select 1 from public.tutor_kb_rotulos r where r.chave = t.chave and r.model = p_model)
           order by t.chave limit least(greatest(coalesce(p_limite, 100), 1), 500)) x
$$;

create or replace function public.ch_worker_tutor_kb_gravar_rotulos(p_model text, p_itens jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if coalesce(btrim(p_model), '') = '' then raise exception 'Modelo dos vetores ausente.' using errcode = '22023'; end if;
  insert into public.tutor_kb_rotulos (chave, texto, model, embedding)
  select left(x ->> 'chave', 400), left(x ->> 'texto', 2000), btrim(p_model), array(select v::real from jsonb_array_elements_text(x -> 'embedding') with ordinality as z (v, i) order by i)
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
   where coalesce(x ->> 'chave', '') <> '' and coalesce(x ->> 'texto', '') <> ''
  on conflict (chave) do update set texto = excluded.texto, model = excluded.model, embedding = excluded.embedding, criado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- Limpeza: tira os trechos cuja origem deixou de valer (ou mudou de versão), os mapas que não existem mais, o cache de perguntas velho
-- e o registro de entregas com mais de 90 dias.
create or replace function public.ch_worker_tutor_kb_limpar(p_mapas text[] default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare a integer; b integer := 0; c integer; e integer;
begin
  delete from public.tutor_kb_trechos t
   where t.tipo <> 'mapa' and public.tutor_kb_versao_atual(t.tipo, t.origem_id) is distinct from t.origem_versao;
  get diagnostics a = row_count;
  if p_mapas is not null then
    delete from public.tutor_kb_trechos t where t.tipo = 'mapa' and not (t.origem_id = any (p_mapas));
    get diagnostics b = row_count;
  end if;
  delete from public.tutor_kb_consultas where ultimo_uso < now() - interval '30 days';
  get diagnostics c = row_count;
  delete from public.tutor_kb_entregas where criado_em < now() - interval '90 days';
  get diagnostics e = row_count;
  return jsonb_build_object('trechos', a + b, 'consultas', c, 'entregas', e);
end
$$;

-- Contagens por tipo (painel e relatório).
create or replace function public.ch_worker_tutor_kb_situacao(p_model text default 'gemini-embedding-2') returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'por_tipo', coalesce((select jsonb_object_agg(x.tipo, jsonb_build_object('trechos', x.n, 'origens', x.o, 'com_vetor', x.v)) from (
        select t.tipo, count(*) as n, count(distinct t.origem_id) as o,
               count(*) filter (where exists (select 1 from public.tutor_kb_vetores v where v.trecho_id = t.id and v.model = p_model and v.hash = t.hash)) as v
          from public.tutor_kb_trechos t group by t.tipo) x), '{}'::jsonb),
    'rotulos', (select count(*) from public.tutor_kb_rotulos r where r.model = p_model),
    'consultas_em_cache', (select count(*) from public.tutor_kb_consultas),
    'regras', (select to_jsonb(r) - 'id' from public.tutor_kb_regras r where r.id),
    'indice_vetorial', exists (select 1 from pg_extension where extname = 'vector'))
$$;

-- ---------------------------------------------------------------- vizinhos por significado (índice de verdade)
-- Os k trechos mais próximos do vetor, SEM filtro de distância no where: com o filtro, o banco lia os vetores um a um (60,7 ms);
-- sem ele, o índice HNSW entra (1 a 4 ms). Os filtros de exclusão e o piso de semelhança vêm DEPOIS, no resultado.
create or replace function public.tutor_kb_vizinhos(p_vetor real[], p_model text, p_k integer, p_tabela text default 'trechos') returns table (id text, distancia double precision)
  language plpgsql stable security definer set search_path = ''
as $$
declare v_schema text; k constant integer := least(greatest(coalesce(p_k, 120), 1), 400);
begin
  if p_vetor is null or coalesce(array_length(p_vetor, 1), 0) <> 768 then return; end if;
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
  if v_schema is not null then
    -- o HNSW devolve no máximo ef_search vizinhos: sobe para k; varredura iterativa (pgvector 0.8+) se faltar depois do filtro de modelo
    perform set_config('hnsw.ef_search', greatest(k, 40)::text, true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
    if p_tabela = 'rotulos' then
      return query execute format(
        'select x.chave, x.d from (select r.chave, r.model, ((r.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)))::float8 as d
           from public.tutor_kb_rotulos r order by (r.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)) limit $3) x where x.model = $2', v_schema)
        using p_vetor, p_model, k;
    else
      return query execute format(
        'select x.trecho_id::text, x.d from (select v.trecho_id, v.model, ((v.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)))::float8 as d
           from public.tutor_kb_vetores v order by (v.embedding::%1$I.vector(768)) operator(%1$I.<=>) ($1::%1$I.vector(768)) limit $3) x where x.model = $2', v_schema)
        using p_vetor, p_model, k;
    end if;
  elsif p_tabela = 'rotulos' then
    return query select r.chave, (1 - public.ch_cosine(r.embedding, p_vetor))::float8 as d from public.tutor_kb_rotulos r where r.model = p_model order by 2 limit k;
  else
    return query select v.trecho_id::text, (1 - public.ch_cosine(v.embedding, p_vetor))::float8 as d from public.tutor_kb_vetores v where v.model = p_model order by 2 limit k;
  end if;
end
$$;

-- jsonb {model, values[768]} → real[] (nulo se não servir)
create or replace function public.tutor_kb_vetor_de(p jsonb) returns real[]
  language sql immutable set search_path = ''
as $$
  select case when p is null or jsonb_typeof(p -> 'values') is distinct from 'array' or jsonb_array_length(p -> 'values') <> 768 then null
              else array(select v::real from jsonb_array_elements_text(p -> 'values') with ordinality as z (v, i) order by i) end
$$;

-- tsquery montada pelo servidor (consulta.ts: termos ligados por |, frases por <->); se vier mal formada, a pergunta crua.
create or replace function public.tutor_kb_tsquery(p_tsquery text, p_consulta text) returns tsquery
  language plpgsql stable set search_path = ''
as $$
begin
  if coalesce(btrim(p_tsquery), '') <> '' then
    begin
      return to_tsquery('portuguese', p_tsquery);
    exception when others then null;
    end;
  end if;
  return websearch_to_tsquery('portuguese', coalesce(p_consulta, ''));
end
$$;

-- Questões que o aluno NÃO pode ver explicadas agora: a aberta, as equivalentes e relacionadas a ela, e as de simulado/prova
-- em andamento.
create or replace function public.tutor_kb_questoes_travadas(p_user uuid, p_sessao uuid) returns text[]
  language sql stable security definer set search_path = ''
as $$
  with s as (select t.question_id from public.tutor_sessions t where t.id = p_sessao and t.user_id = p_user and t.question_id is not null and t.question_state = 'open')
  select coalesce(array_agg(distinct z.id), '{}') from (
    select s.question_id as id from s
    union select e2.question_id from s join public.question_equivalents e1 on e1.question_id = s.question_id join public.question_equivalents e2 on e2.group_id = e1.group_id
    union select r.question_b from s join public.question_relations r on r.question_a = s.question_id
    union select r.question_a from s join public.question_relations r on r.question_b = s.question_id
    union select unnest(ps.question_ids) from public.practice_sessions ps where ps.user_id = p_user and ps.finished_at is null and ps.kind in ('simulado', 'prova')
  ) z where z.id is not null
$$;

-- ---------------------------------------------------------------- a busca do Tutor
-- p_vetor {model, values}: vetor da pergunta (a ponte ou o servidor geraram). Sem ele, procura no cache pelo hash da pergunta
-- normalizada; sem nada, só palavras. p_bucket: conta no limite de frequência do aluno (voz). p_checar_ia: confere a chave da IA.
-- Devolve {ok, trechos:[{ref, tipo, titulo, ano, secao, pagina, citacao, texto, por}], vetor:'recebido'|'cache'|'nenhum'} ou {ok:false, motivo}.
create or replace function public.ch_worker_tutor_kb_buscar(
  p_user uuid, p_sessao uuid, p_consulta text, p_tsquery text default null, p_vetor jsonb default null, p_hash text default null,
  p_limite integer default 5, p_voice_call uuid default null, p_via text default 'texto', p_bucket text default null, p_checar_ia boolean default false
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  n constant integer := least(greatest(coalesce(p_limite, 5), 1), 8);
  r public.tutor_kb_regras;
  s public.tutor_sessions;
  v_vetor real[];
  v_model text;
  v_origem_vetor text := 'nenhum';
  v_travadas text[];
  v_respondidas text[];
  v_ineditas text[];
  v_ineditas_lidas boolean := false;
  q tsquery;
  rate jsonb;
  c record;
  out jsonb := '[]'::jsonb;
  ids uuid[] := '{}';
  grupos jsonb := '{}'::jsonb;
  k integer := 0;
begin
  if coalesce(p_via, '') not in ('texto', 'voz', 'ponte', 'avaliacao') then raise exception 'Via inválida.' using errcode = '22023'; end if;
  select * into s from public.tutor_sessions t where t.user_id = p_user and t.id = coalesce(p_sessao, (select v.session_id from public.tutor_voice_calls v where v.id = p_voice_call and v.user_id = p_user));
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if p_voice_call is not null and not exists (select 1 from public.tutor_voice_calls v where v.id = p_voice_call and v.user_id = p_user and v.session_id = s.id and v.status = 'active') then
    raise exception 'A conversa por voz foi encerrada.' using errcode = 'P0001';
  end if;
  if p_checar_ia and not (public.ch_flag('enabled') and public.ch_flag('ai_enabled')) then
    return jsonb_build_object('ok', false, 'motivo', 'ia_desligada');
  end if;
  if p_bucket is not null then
    rate := public.ch_worker_tutor_rate_hit(p_user, p_bucket);
    if coalesce((rate ->> 'ok')::boolean, true) = false then
      return jsonb_build_object('ok', false, 'motivo', 'limite', 'limite', rate ->> 'reason', 'retry_after_s', rate -> 'retry_after_s');
    end if;
  end if;
  select * into r from public.tutor_kb_regras where id;
  if not found then r := row(true, true, 'humana', true, 4000, now())::public.tutor_kb_regras; end if;

  -- vetor: o recebido (e guardado no cache) ou o do cache
  v_vetor := public.tutor_kb_vetor_de(p_vetor);
  if v_vetor is not null then
    v_model := p_vetor ->> 'model';
    v_origem_vetor := 'recebido';
    if coalesce(p_hash, '') ~ '^[0-9a-f]{64}$' and v_model is not null then
      insert into public.tutor_kb_consultas as cq (hash, model, embedding) values (p_hash, v_model, v_vetor)
      on conflict (hash) do update set usos = cq.usos + 1, ultimo_uso = now(), model = excluded.model, embedding = excluded.embedding;
    end if;
  elsif coalesce(p_hash, '') ~ '^[0-9a-f]{64}$' then
    update public.tutor_kb_consultas cq set usos = cq.usos + 1, ultimo_uso = now() where cq.hash = p_hash returning cq.embedding, cq.model into v_vetor, v_model;
    if v_vetor is not null then v_origem_vetor := 'cache'; end if;
  end if;

  q := public.tutor_kb_tsquery(p_tsquery, p_consulta);
  v_travadas := public.tutor_kb_questoes_travadas(p_user, s.id);
  select coalesce(array_agg(distinct a.question_id), '{}') into v_respondidas from public.question_attempts a where a.user_id = p_user;
  -- a questão da conversa já respondida (ou revelada) também conta como respondida
  if s.question_id is not null and s.question_state in ('answered', 'revealed') then v_respondidas := v_respondidas || s.question_id; end if;

  for c in
    with lex as (
      select t.id::text as id, row_number() over (order by ts_rank(t.tsv, q) desc, t.id) as rk
        from public.tutor_kb_trechos t where q is not null and t.tsv @@ q
       order by ts_rank(t.tsv, q) desc, t.id limit 60),
    sem as (
      select z.id, row_number() over (order by z.distancia, z.id) as rk, z.distancia
        from public.tutor_kb_vizinhos(v_vetor, v_model, 120) z),
    fused as (
      select u.id, sum(1.0 / (60 + u.rk)) as score, bool_or(u.via = 'p') as por_palavras, bool_or(u.via = 's') as por_significado, min(u.distancia) as distancia
        from (select id, rk, 'p' as via, null::float8 as distancia from lex union all select id, rk, 's', distancia from sem) u
       group by u.id)
    select t.*, f.score, f.por_palavras, f.por_significado, f.distancia
      from fused f join public.tutor_kb_trechos t on t.id = f.id::uuid
     order by f.score desc, t.id
     limit 180
  loop
    exit when k >= n;
    -- regras do aluno (baratas primeiro)
    continue when c.tipo = 'estacao' and s.context_id is not null and c.estacao_id = s.context_id;
    continue when not public.tutor_kb_plano_libera(p_user, c.plano_minimo);
    if c.tipo = 'questao' then
      continue when c.questao_id = any (v_travadas);
      continue when r.questoes_so_respondidas and not (c.questao_id = any (v_respondidas));
      continue when public.tutor_kb_nivel_rank(c.nivel_revisao) < public.tutor_kb_nivel_rank(r.questoes_nivel_minimo);
      if exists (select 1 from public.questions qq where qq.id = c.questao_id and qq.origin = 'staziamed') then
        if not v_ineditas_lidas then
          select coalesce(array_agg(x), '{}') into v_ineditas from public.ineditas_released_ids_for(p_user) x;
          v_ineditas_lidas := true;
        end if;
        continue when not (c.questao_id = any (v_ineditas));
      end if;
    end if;
    -- variedade: no máximo 2 trechos do mesmo grupo
    continue when coalesce((grupos ->> c.grupo)::integer, 0) >= 2;
    -- portão de novo, linha a linha: a origem ainda vale e na mesma versão
    continue when public.tutor_kb_versao_atual(c.tipo, c.origem_id) is distinct from c.origem_versao;
    k := k + 1;
    grupos := grupos || jsonb_build_object(c.grupo, coalesce((grupos ->> c.grupo)::integer, 0) + 1);
    ids := ids || c.id;
    out := out || jsonb_build_array(jsonb_build_object(
      'ref', 'C' || k, 'id', c.id, 'tipo', c.tipo, 'titulo', c.titulo, 'ano', c.ano, 'secao', c.secao, 'pagina', c.pagina,
      'citacao', c.titulo || coalesce(' (' || c.ano || ')', '') || coalesce(', seção "' || c.secao || '"', '') || coalesce(', p. ' || c.pagina, ''),
      'texto', c.texto, 'nivel', c.nivel_revisao,
      'por', case when c.por_palavras and c.por_significado then 'ambos' when c.por_significado then 'significado' else 'palavras' end,
      'semelhanca', case when c.distancia is null then null else round((1 - c.distancia)::numeric, 3) end));
  end loop;

  if k > 0 then
    insert into public.tutor_kb_entregas (sessao_id, voice_call_id, trecho_ids, via) values (s.id, p_voice_call, ids, p_via);
  end if;
  -- indice: false enquanto o indexador nunca rodou (o servidor usa a busca antiga só nesse caso)
  return jsonb_build_object('ok', true, 'trechos', out, 'vetor', v_origem_vetor, 'indice', k > 0 or exists (select 1 from public.tutor_kb_trechos));
end
$$;

-- ---------------------------------------------------------------- o material do tema (abertura), sem chamar o Google
-- Vetor: o do enunciado da questão da conversa ('q:<id>') ou o do tema/rótulo (fold_text). Palavras: p_tsquery (o servidor monta do
-- tema). Só aula, atualização, fonte, flashcard e mapa: NUNCA explicação de questão nem estação. Equilíbrio: até 2 seções de aula,
-- 1 atualização, 5 trechos de fonte, 2 flashcards e 1 mapa, até o orçamento de caracteres (regras.pacote_tokens × 4).
create or replace function public.ch_worker_tutor_kb_pacote(p_user uuid, p_sessao uuid, p_tsquery text default null, p_rotulo text default null,
                                                            p_orcamento_chars integer default null, p_voice_call uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.tutor_kb_regras;
  s public.tutor_sessions;
  v_vetor real[];
  v_model text;
  v_chave text;
  v_rotulo text;
  q tsquery;
  orc integer;
  usados integer := 0;
  cotas jsonb := '{"aula": 2, "atualizacao": 1, "fonte": 5, "flashcard": 2, "mapa": 1}'::jsonb;
  conta jsonb := '{}'::jsonb;
  grupos jsonb := '{}'::jsonb;
  c record;
  out jsonb := '[]'::jsonb;
  ids uuid[] := '{}';
  k integer := 0;
begin
  select * into s from public.tutor_sessions t where t.user_id = p_user and t.id = coalesce(p_sessao, (select v.session_id from public.tutor_voice_calls v where v.id = p_voice_call and v.user_id = p_user));
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  if p_voice_call is not null and not exists (select 1 from public.tutor_voice_calls v where v.id = p_voice_call and v.user_id = p_user and v.session_id = s.id and v.status = 'active') then
    raise exception 'A conversa por voz foi encerrada.' using errcode = 'P0001';
  end if;
  select * into r from public.tutor_kb_regras where id;
  if not found then r := row(true, true, 'humana', true, 4000, now())::public.tutor_kb_regras; end if;
  orc := least(greatest(coalesce(p_orcamento_chars, r.pacote_tokens * 4), 0), 160000);
  if orc = 0 then return jsonb_build_object('ok', true, 'trechos', '[]'::jsonb, 'chars', 0, 'vetor', 'nenhum'); end if;

  v_rotulo := coalesce(nullif(btrim(p_rotulo), ''), nullif(btrim(s.context_label), ''), nullif(btrim(s.topic), ''));
  if s.question_id is not null then
    select x.embedding, x.model, x.chave into v_vetor, v_model, v_chave from public.tutor_kb_rotulos x where x.chave = 'q:' || s.question_id;
  end if;
  if v_vetor is null and v_rotulo is not null then
    select x.embedding, x.model, x.chave into v_vetor, v_model, v_chave from public.tutor_kb_rotulos x where x.chave = public.fold_text(v_rotulo);
  end if;
  q := case when coalesce(btrim(p_tsquery), '') = '' and v_rotulo is null then null else public.tutor_kb_tsquery(p_tsquery, v_rotulo) end;
  if v_vetor is null and q is null then return jsonb_build_object('ok', true, 'trechos', '[]'::jsonb, 'chars', 0, 'vetor', 'nenhum'); end if;

  for c in
    with lex as (
      select t.id::text as id, row_number() over (order by ts_rank(t.tsv, q) desc, t.id) as rk
        from public.tutor_kb_trechos t where q is not null and t.tsv @@ q and t.tipo in ('aula', 'atualizacao', 'fonte', 'flashcard', 'mapa')
       order by ts_rank(t.tsv, q) desc, t.id limit 80),
    sem as (
      select z.id, row_number() over (order by z.distancia, z.id) as rk
        from public.tutor_kb_vizinhos(v_vetor, v_model, 160) z join public.tutor_kb_trechos t on t.id = z.id::uuid
       where t.tipo in ('aula', 'atualizacao', 'fonte', 'flashcard', 'mapa')),
    fused as (select u.id, sum(1.0 / (60 + u.rk)) as score from (select id, rk from lex union all select id, rk from sem) u group by u.id)
    select t.* from fused f join public.tutor_kb_trechos t on t.id = f.id::uuid order by f.score desc, t.id limit 200
  loop
    exit when usados >= orc;
    continue when c.tipo not in ('aula', 'atualizacao', 'fonte', 'flashcard', 'mapa');
    continue when coalesce((conta ->> c.tipo)::integer, 0) >= (cotas ->> c.tipo)::integer;
    continue when coalesce((grupos ->> c.grupo)::integer, 0) >= 2;
    continue when usados + char_length(c.texto) > orc and k > 0;
    continue when not public.tutor_kb_plano_libera(p_user, c.plano_minimo);
    continue when public.tutor_kb_versao_atual(c.tipo, c.origem_id) is distinct from c.origem_versao;
    k := k + 1;
    usados := usados + char_length(c.texto);
    conta := conta || jsonb_build_object(c.tipo, coalesce((conta ->> c.tipo)::integer, 0) + 1);
    grupos := grupos || jsonb_build_object(c.grupo, coalesce((grupos ->> c.grupo)::integer, 0) + 1);
    ids := ids || c.id;
    out := out || jsonb_build_array(jsonb_build_object(
      'ref', 'M' || k, 'id', c.id, 'tipo', c.tipo, 'titulo', c.titulo, 'ano', c.ano, 'secao', c.secao, 'pagina', c.pagina,
      'citacao', c.titulo || coalesce(' (' || c.ano || ')', '') || coalesce(', seção "' || c.secao || '"', '') || coalesce(', p. ' || c.pagina, ''),
      'texto', c.texto));
  end loop;

  if k > 0 then
    insert into public.tutor_kb_entregas (sessao_id, voice_call_id, trecho_ids, via) values (s.id, p_voice_call, ids, 'pacote');
  end if;
  return jsonb_build_object('ok', true, 'trechos', out, 'chars', usados, 'vetor', case when v_vetor is null then 'nenhum' else coalesce(v_chave, 'rotulo') end);
end
$$;

-- Textos entregues a uma conversa nas últimas horas (evidência da conferência da fala da voz: vale em qualquer instância do servidor).
-- Só reconfere o portão: um trecho cuja origem deixou de valer não serve de evidência.
create or replace function public.ch_worker_tutor_kb_evidencias(p_user uuid, p_sessao uuid, p_horas integer default 6) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('citacao', x.citacao, 'texto', x.texto) order by x.quando desc), '[]'::jsonb)
  from (
    select distinct on (t.id) t.id, t.titulo || coalesce(' (' || t.ano || ')', '') as citacao, t.texto, e.criado_em as quando
      from public.tutor_sessions s
      join public.tutor_kb_entregas e on e.sessao_id = s.id and e.criado_em > now() - make_interval(hours => least(greatest(coalesce(p_horas, 6), 1), 48))
      join public.tutor_kb_trechos t on t.id = any (e.trecho_ids)
     where s.id = p_sessao and s.user_id = p_user
       and public.tutor_kb_versao_atual(t.tipo, t.origem_id) is not distinct from t.origem_versao
     order by t.id, e.criado_em desc
     limit 60) x
$$;

-- ---------------------------------------------------------------- só o servidor
do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'tutor\_kb\_%' or p.proname like 'ch\_worker\_tutor\_kb\_%') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  revoke all on table public.tutor_kb_regras, public.tutor_kb_trechos, public.tutor_kb_vetores, public.tutor_kb_rotulos, public.tutor_kb_consultas, public.tutor_kb_entregas
    from anon, authenticated;
end
$revoke$;
