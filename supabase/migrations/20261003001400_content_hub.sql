-- =============================================================================
-- Central de Conteúdo Revalida: importação de PDFs, extração, referências, afirmações
-- clínicas, evidências, unidades didáticas, materiais, aprovações e publicação.
--
-- Cadeia de dependência: fonte → afirmação → unidade didática → material.
-- Regras no banco (não só na tela):
--   * quem processa (worker, IA) nunca aprova nem publica: aprovar exige uma pessoa;
--   * aprovação médica exige revisor cadastrado na área da unidade;
--   * a aprovação vale para um hash exato; qualquer alteração a invalida;
--   * publicar só passa em ch_publish_problems() == vazio.
-- A taxonomia é EDITORIAL (não é classificação oficial do Inep).
-- =============================================================================

-- ---------------------------------------------------------------- acesso
create table public.ch_reviewer_areas (
  user_id uuid not null references auth.users (id) on delete cascade,
  area_code text not null,                       -- código editorial da área (ch_taxonomy_nodes.code)
  created_at timestamptz not null default now(),
  primary key (user_id, area_code)
);
alter table public.ch_reviewer_areas enable row level security;
create policy "revisores: leitura própria ou admin" on public.ch_reviewer_areas
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create function public.ch_is_reviewer(p_area_code text default null) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.ch_reviewer_areas r
                 where r.user_id = (select auth.uid()) and (p_area_code is null or r.area_code = p_area_code))
$$;

create function public.ch_assert_staff() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (public.is_staff() or public.ch_is_reviewer()) then
    raise exception 'Acesso restrito à equipe de conteúdo.' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------- taxonomia versionada
create table public.ch_taxonomy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index ch_taxonomy_one_draft on public.ch_taxonomy_versions ((status)) where status = 'draft';
create unique index ch_taxonomy_one_published on public.ch_taxonomy_versions ((status)) where status = 'published';

create table public.ch_taxonomy_nodes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ch_taxonomy_versions (id) on delete cascade,
  parent_id uuid references public.ch_taxonomy_nodes (id) on delete cascade,
  level text not null check (level in ('area', 'subarea', 'theme', 'subtheme')),
  code text,                                      -- só nas áreas; identificador editorial estável
  name text not null check (char_length(btrim(name)) between 1 and 160),
  matrix_competencies text[] not null default '{}',   -- competências da matriz (texto livre, não códigos do Inep)
  status text not null default 'active' check (status in ('active', 'suggested', 'rejected')),
  suggested_by_ai boolean not null default false,
  position integer not null default 0,
  check ((level = 'area') = (parent_id is null)),
  check (level <> 'area' or code is not null)
);
create unique index ch_nodes_unique_name on public.ch_taxonomy_nodes (version_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index ch_nodes_parent_idx on public.ch_taxonomy_nodes (parent_id);

-- ---------------------------------------------------------------- documentos
create table public.ch_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 300),
  author text,
  publisher text,
  edition_date text,
  language text not null default 'pt-BR',
  page_count integer check (page_count > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,                              -- arquivo original preservado
  mime text not null default 'application/pdf',
  text_kind text check (text_kind in ('text', 'scanned', 'mixed')),
  rights_status text not null default 'unknown'
    check (rights_status in ('unknown', 'own', 'licensed_adaptation', 'reference_only', 'unauthorized')),
  rights_note text,
  provenance jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'extracting', 'classifying', 'verifying_sources', 'drafting', 'awaiting_review', 'failed')),
  failure text,
  created_at timestamptz not null default now(),
  unique (owner_id, sha256)
);

create table public.ch_pages (
  document_id uuid not null references public.ch_documents (id) on delete cascade,
  page_no integer not null check (page_no > 0),
  printed_no text,
  kind text not null check (kind in ('text', 'scanned', 'empty')),
  width real, height real,
  ocr_used boolean not null default false,
  primary key (document_id, page_no)
);

create table public.ch_blocks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ch_documents (id) on delete cascade,
  page_no integer not null,
  idx integer not null,                           -- ordem de leitura dentro da página
  type text not null check (type in ('heading', 'paragraph', 'list', 'table', 'figure', 'caption', 'footnote', 'reference', 'other')),
  bbox jsonb,                                     -- [x0, y0, x1, y1] na página
  original_text text,                             -- NUNCA é alterado depois da extração
  revised_text text,                              -- revisão humana, separada
  status text not null default 'extracted' check (status in ('extracted', 'pending', 'illegible', 'excluded')),
  exclusion_reason text,
  ocr_confidence real check (ocr_confidence between 0 and 1),
  flags jsonb not null default '[]'::jsonb,       -- ex.: possible_prompt_injection, doubtful_ocr_critical
  data jsonb not null default '{}'::jsonb,        -- tabela (linhas/células), legenda, etc.
  unique (document_id, page_no, idx),
  foreign key (document_id, page_no) references public.ch_pages (document_id, page_no) on delete cascade,
  check (status <> 'excluded' or char_length(btrim(coalesce(exclusion_reason, ''))) > 0)
);
create index ch_blocks_doc_idx on public.ch_blocks (document_id, status);

-- O texto original é imutável (nem para administradores, só pela função de extração, que reescreve a extração inteira).
create function public.ch_block_original_guard() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.original_text is distinct from old.original_text and current_setting('ch.extraction', true) is distinct from 'on' then
    raise exception 'O texto extraído original não pode ser alterado; use o texto revisado.' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger ch_blocks_original_guard before update on public.ch_blocks
  for each row execute function public.ch_block_original_guard();

create table public.ch_block_nodes (
  block_id uuid not null references public.ch_blocks (id) on delete cascade,
  node_id uuid not null references public.ch_taxonomy_nodes (id) on delete cascade,
  suggested_by_ai boolean not null default false,
  confirmed_by uuid references auth.users (id) on delete set null,
  primary key (block_id, node_id)
);

-- ---------------------------------------------------------------- fontes de referência (acervo de validação)
create table public.ch_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) > 0),
  organ text not null,                            -- ex.: Ministério da Saúde, Conitec, INCA, PNI, Anvisa
  kind text not null default 'final' check (kind in ('final', 'public_consultation', 'preliminary', 'rectification', 'society_guideline')),
  url text,
  version text,
  published_on date,
  valid_until date,
  accessed_on date,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  editorial_approved boolean not null default false,   -- sociedades médicas só entram com aprovação editorial
  status text not null default 'current' check (status in ('current', 'superseded', 'withdrawn')),
  superseded_by uuid references public.ch_sources (id),
  created_at timestamptz not null default now()
);

-- Trechos do documento COMPLETO da fonte (resultado de busca ou título de página não valem como evidência).
create table public.ch_source_passages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ch_sources (id) on delete cascade,
  section text,
  page integer,
  population text,
  care_setting text,
  theme text,
  text text not null check (char_length(btrim(text)) > 0),
  tsv tsvector generated always as (to_tsvector('portuguese', coalesce(theme, '') || ' ' || coalesce(section, '') || ' ' || text)) stored
);
create index ch_passages_tsv_idx on public.ch_source_passages using gin (tsv);

-- ---------------------------------------------------------------- afirmações clínicas e evidências
create table public.ch_claims (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.ch_documents (id) on delete set null,
  block_id uuid references public.ch_blocks (id) on delete set null,
  theme_node_id uuid references public.ch_taxonomy_nodes (id) on delete set null,
  statement text not null check (char_length(btrim(statement)) > 0),     -- o que o PDF afirma
  context jsonb not null default '{}'::jsonb,                            -- população, cenário, escopo, condições
  critical_kinds text[] not null default '{}'
    check (critical_kinds <@ array['dose', 'route', 'frequency', 'duration', 'contraindication', 'interaction', 'diagnostic_criterion', 'screening_interval', 'emergency_conduct']),
  proposed_text text,                                                    -- texto proposto para o material StaziaMed
  change_rationale text,
  status text not null default 'extracted'
    check (status in ('extracted', 'evidence_linked', 'compatible', 'outdated', 'conflicting', 'insufficient', 'context_dependent', 'needs_review')),
  critical_checked_by uuid references auth.users (id) on delete set null,   -- conferência humana explícita
  critical_checked_at timestamptz,
  created_by_model text,
  created_at timestamptz not null default now()
);

create table public.ch_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.ch_claims (id) on delete cascade,
  source_id uuid not null references public.ch_sources (id),
  passage_id uuid references public.ch_source_passages (id),
  section text, page integer,
  source_version text,
  quote text not null check (char_length(btrim(quote)) > 0),             -- o que a referência estabelece
  verdict text not null check (verdict in ('compatible', 'outdated', 'conflicting', 'insufficient', 'context_dependent')),
  numeric_check jsonb not null default '{}'::jsonb,                     -- números/unidades do texto conferidos contra o trecho
  stale boolean not null default false,                                 -- a fonte foi substituída
  checked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ch_evidence_claim_idx on public.ch_evidence (claim_id);

create table public.ch_claim_history (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.ch_claims (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- unidades didáticas e materiais
create table public.ch_units (
  id uuid primary key default gen_random_uuid(),
  theme_node_id uuid not null references public.ch_taxonomy_nodes (id),
  title text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ch_unit_versions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.ch_units (id) on delete cascade,
  version integer not null,
  origin text not null default 'independent' check (origin in ('independent', 'adaptation')),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_review', 'approved', 'published', 'needs_update', 'retired')),
  content jsonb not null default '{"sections": []}'::jsonb,
  content_hash text not null,
  scope_note text,                                -- escopo explícito quando só parte do PDF foi validada
  candidate_of uuid references public.ch_unit_versions (id),   -- versão candidata gerada por mudança de fonte
  candidate_reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (unit_id, version)
);

create table public.ch_unit_claims (
  unit_version_id uuid not null references public.ch_unit_versions (id) on delete cascade,
  claim_id uuid not null references public.ch_claims (id),
  primary key (unit_version_id, claim_id)
);

create table public.ch_materials (
  id uuid primary key default gen_random_uuid(),
  unit_version_id uuid not null references public.ch_unit_versions (id) on delete cascade,
  kind text not null check (kind in ('lesson', 'summary', 'visual_cards', 'flashcards', 'table', 'questions', 'station')),
  content jsonb not null,
  content_hash text not null,
  claim_ids uuid[] not null default '{}',
  generated_by_model text,
  template_version text,
  created_at timestamptz not null default now(),
  unique (unit_version_id, kind)
);

create table public.ch_approvals (
  id uuid primary key default gen_random_uuid(),
  unit_version_id uuid not null references public.ch_unit_versions (id) on delete cascade,
  kind text not null check (kind in ('medical', 'editorial')),
  reviewer_id uuid not null references auth.users (id),
  area_code text,
  content_hash text not null,                     -- hash exato do que foi aprovado
  note text,
  decided_at timestamptz not null default now(),
  invalidated_at timestamptz
);

create table public.ch_publications (
  id uuid primary key default gen_random_uuid(),
  unit_version_id uuid not null references public.ch_unit_versions (id),
  content_hash text not null,
  published_by uuid not null references auth.users (id),
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references auth.users (id)
);

-- ---------------------------------------------------------------- fila durável de processamento
create table public.ch_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.ch_documents (id) on delete cascade,
  step text not null check (step in ('extract', 'classify', 'claims', 'evidence', 'draft', 'review_check')),
  scope_key text not null default '',             -- ex.: faixa de páginas ou tema
  idempotency_key text not null unique,           -- documento + etapa + escopo + versões (parser, modelo, taxonomia)
  versions jsonb not null default '{}'::jsonb,    -- parser, modelo, prompt, template, taxonomia
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  checkpoint jsonb not null default '{}'::jsonb,
  error text,
  locked_at timestamptz,
  run_after timestamptz not null default now(),
  started_at timestamptz, finished_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,     -- tempo, tokens, custo
  created_at timestamptz not null default now()
);
create index ch_jobs_pick_idx on public.ch_jobs (status, run_after);

create table public.ch_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS: leitura por papel; escrita só por funções
alter table public.ch_taxonomy_versions enable row level security;
alter table public.ch_taxonomy_nodes enable row level security;
alter table public.ch_documents enable row level security;
alter table public.ch_pages enable row level security;
alter table public.ch_blocks enable row level security;
alter table public.ch_block_nodes enable row level security;
alter table public.ch_sources enable row level security;
alter table public.ch_source_passages enable row level security;
alter table public.ch_claims enable row level security;
alter table public.ch_evidence enable row level security;
alter table public.ch_claim_history enable row level security;
alter table public.ch_units enable row level security;
alter table public.ch_unit_versions enable row level security;
alter table public.ch_unit_claims enable row level security;
alter table public.ch_materials enable row level security;
alter table public.ch_approvals enable row level security;
alter table public.ch_publications enable row level security;
alter table public.ch_jobs enable row level security;
alter table public.ch_audit enable row level security;

create policy "taxonomia: equipe lê" on public.ch_taxonomy_versions for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
create policy "taxonomia: equipe lê nós" on public.ch_taxonomy_nodes for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
-- Arquivos e extração: só o dono do documento e administradores.
create policy "documentos: dono ou admin" on public.ch_documents for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());
create policy "páginas: dono ou admin" on public.ch_pages for select to authenticated
  using (exists (select 1 from public.ch_documents d where d.id = document_id and (d.owner_id = (select auth.uid()) or public.is_admin())));
create policy "blocos: dono ou admin" on public.ch_blocks for select to authenticated
  using (exists (select 1 from public.ch_documents d where d.id = document_id and (d.owner_id = (select auth.uid()) or public.is_admin())));
create policy "fontes: equipe lê" on public.ch_sources for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
create policy "trechos: equipe lê" on public.ch_source_passages for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
create policy "unidades: equipe lê" on public.ch_units for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
create policy "versões: equipe lê" on public.ch_unit_versions for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
create policy "aprovações: equipe lê" on public.ch_approvals for select to authenticated using (public.is_staff() or public.ch_is_reviewer());
-- Só o que foi publicado chega ao aluno.
create policy "publicações: alunos leem as ativas" on public.ch_publications for select to authenticated using (retired_at is null or public.is_staff());
-- Fila e registro: só administradores.
create policy "fila: admin lê" on public.ch_jobs for select to authenticated using (public.is_admin());
create policy "registro: admin lê" on public.ch_audit for select to authenticated using (public.is_admin());

create function public.ch_log(p_action text, p_target text, p_details jsonb default '{}'::jsonb) returns void
  language sql security definer set search_path = ''
as $$ insert into public.ch_audit (actor_id, action, target, details) values ((select auth.uid()), p_action, p_target, coalesce(p_details, '{}'::jsonb)) $$;
revoke execute on function public.ch_log(text, text, jsonb) from public, anon, authenticated;

create function public.ch_hash(p_value jsonb) returns text
  language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_value::text, 'UTF8')), 'hex') $$;

-- Acesso a um documento: dono ou administrador.
create function public.ch_assert_document(p_document_id uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.ch_documents d
                 where d.id = p_document_id and (d.owner_id = (select auth.uid()) or public.is_admin())) then
    raise exception 'Documento não encontrado ou sem acesso.' using errcode = '42501';
  end if;
end
$$;

-- =============================================================================
-- Taxonomia
-- =============================================================================
create function public.ch_seed_node(p_version uuid, p_parent uuid, p_level text, p_name text, p_code text, p_pos integer) returns uuid
  language sql security definer set search_path = ''
as $$
  insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name, code, position)
  values (p_version, p_parent, p_level, p_name, p_code, p_pos) returning id
$$;
revoke execute on function public.ch_seed_node(uuid, uuid, text, text, text, integer) from public, anon, authenticated;

do $seed$
declare
  v_version uuid;
  v_tree constant jsonb := $json$[
    {"code":"CLINICA_MEDICA","name":"Clínica Médica","subareas":[
      {"name":"Cardiologia","themes":[{"name":"Insuficiência cardíaca","subthemes":["Diagnóstico","Tratamento ambulatorial"]},{"name":"Síndromes coronarianas agudas","subthemes":["Diagnóstico","Conduta inicial"]}]},
      {"name":"Pneumologia","themes":[{"name":"Asma no adulto","subthemes":["Classificação","Tratamento"]}]},
      {"name":"Gastroenterologia/Hepatologia"},{"name":"Nefrologia"},{"name":"Endocrinologia","themes":[{"name":"Diabetes mellitus tipo 2","subthemes":["Diagnóstico","Tratamento"]}]},
      {"name":"Neurologia"},{"name":"Infectologia","themes":[{"name":"Tuberculose","subthemes":["Diagnóstico","Tratamento"]}]},
      {"name":"Hematologia"},{"name":"Reumatologia"},{"name":"Dermatologia"},{"name":"Geriatria"}]},
    {"code":"GINECOLOGIA_OBSTETRICIA","name":"Ginecologia e Obstetrícia","subareas":[
      {"name":"Pré-natal","themes":[{"name":"Rotina do pré-natal de risco habitual","subthemes":["Consultas e exames"]}]},
      {"name":"Gestação de alto risco","themes":[{"name":"Síndromes hipertensivas na gestação","subthemes":["Diagnóstico","Conduta"]}]},
      {"name":"Parto e puerpério"},{"name":"Emergências obstétricas"},{"name":"Contracepção"},{"name":"Sangramento uterino"},
      {"name":"Climatério"},{"name":"Infecções ginecológicas e ISTs"},{"name":"Oncologia ginecológica","themes":[{"name":"Rastreamento do câncer do colo do útero","subthemes":["Intervalos e população"]}]}]},
    {"code":"PEDIATRIA","name":"Pediatria","subareas":[
      {"name":"Neonatologia"},{"name":"Crescimento e desenvolvimento"},{"name":"Nutrição"},
      {"name":"Imunizações","themes":[{"name":"Calendário nacional de vacinação da criança","subthemes":["Esquema básico"]}]},
      {"name":"Doenças infecciosas"},{"name":"Doenças respiratórias","themes":[{"name":"Bronquiolite viral aguda","subthemes":["Diagnóstico","Manejo"]}]},
      {"name":"Emergências pediátricas"},{"name":"Proteção da criança e do adolescente"}]},
    {"code":"CIRURGIA","name":"Cirurgia","subareas":[
      {"name":"Trauma","themes":[{"name":"Atendimento inicial ao politraumatizado","subthemes":["Avaliação primária"]}]},
      {"name":"Abdome agudo","themes":[{"name":"Apendicite aguda","subthemes":["Diagnóstico","Conduta"]}]},
      {"name":"Cirurgia digestiva"},{"name":"Hérnias"},{"name":"Cuidados perioperatórios"},
      {"name":"Interface com Urologia"},{"name":"Interface com Ortopedia"},{"name":"Interface com Cirurgia Vascular"}]},
    {"code":"MFC","name":"Medicina de Família e Comunidade","subareas":[
      {"name":"Atenção primária"},{"name":"Abordagem familiar e comunitária"},
      {"name":"Prevenção e rastreamento","themes":[{"name":"Rastreamento do câncer colorretal","subthemes":["População e método"]}]},
      {"name":"Condições crônicas","themes":[{"name":"Hipertensão arterial sistêmica na atenção primária","subthemes":["Diagnóstico","Seguimento"]}]},
      {"name":"Multimorbidade"},{"name":"Cuidados domiciliares"},{"name":"Comunicação clínica"},{"name":"Organização do SUS"}]},
    {"code":"SAUDE_MENTAL","name":"Saúde Mental","subareas":[
      {"name":"Transtornos de humor e ansiedade"},{"name":"Urgências em saúde mental"},{"name":"Uso de substâncias"},{"name":"Rede de atenção psicossocial"}]},
    {"code":"SAUDE_COLETIVA","name":"Saúde Coletiva","subareas":[
      {"name":"Epidemiologia"},{"name":"Vigilância em saúde"},{"name":"Políticas de saúde e SUS"},{"name":"Ética e legislação em saúde"}]}
  ]$json$::jsonb;
  a jsonb; s jsonb; t jsonb; st text;
  v_area uuid; v_sub uuid; v_theme uuid; i integer; j integer; k integer;
begin
  insert into public.ch_taxonomy_versions (version, status, note, published_at)
  values (1, 'published', 'Taxonomia editorial inicial (não é classificação oficial do Inep).', now()) returning id into v_version;
  i := 0;
  for a in select value from jsonb_array_elements(v_tree) loop
    i := i + 1;
    v_area := public.ch_seed_node(v_version, null, 'area', a ->> 'name', a ->> 'code', i);
    j := 0;
    for s in select value from jsonb_array_elements(coalesce(a -> 'subareas', '[]'::jsonb)) loop
      j := j + 1;
      v_sub := public.ch_seed_node(v_version, v_area, 'subarea', s ->> 'name', null, j);
      k := 0;
      for t in select value from jsonb_array_elements(coalesce(s -> 'themes', '[]'::jsonb)) loop
        k := k + 1;
        v_theme := public.ch_seed_node(v_version, v_sub, 'theme', t ->> 'name', null, k);
        for st in select jsonb_array_elements_text(coalesce(t -> 'subthemes', '[]'::jsonb)) loop
          perform public.ch_seed_node(v_version, v_theme, 'subtheme', st, null, 0);
        end loop;
      end loop;
    end loop;
  end loop;
end
$seed$;

create function public.app_ch_taxonomy(p_version integer default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return (
    select jsonb_build_object(
      'version', v.version, 'status', v.status, 'note', v.note,
      'versions', (select jsonb_agg(jsonb_build_object('version', x.version, 'status', x.status) order by x.version desc) from public.ch_taxonomy_versions x),
      'nodes', coalesce((
        select jsonb_agg(jsonb_build_object('id', n.id, 'parent_id', n.parent_id, 'level', n.level, 'code', n.code, 'name', n.name,
                                            'status', n.status, 'suggested_by_ai', n.suggested_by_ai, 'matrix_competencies', n.matrix_competencies)
                         order by n.position, n.name)
        from public.ch_taxonomy_nodes n where n.version_id = v.id), '[]'::jsonb))
    from public.ch_taxonomy_versions v
    where (p_version is null and v.status = 'published') or v.version = p_version
  );
end
$$;

-- Abre (ou devolve) a versão em rascunho, copiando a publicada.
create function public.app_ch_taxonomy_draft() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_draft public.ch_taxonomy_versions;
  v_pub public.ch_taxonomy_versions;
  v_map jsonb := '{}'::jsonb;
  r record;
  v_new uuid;
begin
  perform public.assert_staff();
  select * into v_draft from public.ch_taxonomy_versions where status = 'draft';
  if found then return v_draft.version; end if;
  select * into v_pub from public.ch_taxonomy_versions where status = 'published';
  insert into public.ch_taxonomy_versions (version, status, note, created_by)
  values ((select max(version) + 1 from public.ch_taxonomy_versions), 'draft', 'Rascunho', (select auth.uid()))
  returning * into v_draft;
  for r in with recursive tree as (
             select *, 0 as depth from public.ch_taxonomy_nodes where version_id = v_pub.id and parent_id is null
             union all
             select n.*, t.depth + 1 from public.ch_taxonomy_nodes n join tree t on n.parent_id = t.id)
           select * from tree order by depth, position loop
    insert into public.ch_taxonomy_nodes (version_id, parent_id, level, code, name, matrix_competencies, status, suggested_by_ai, position)
    values (v_draft.id, nullif(v_map ->> r.parent_id::text, '')::uuid, r.level, r.code, r.name, r.matrix_competencies, r.status, r.suggested_by_ai, r.position)
    returning id into v_new;
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
  end loop;
  perform public.ch_log('taxonomy.draft', v_draft.version::text);
  return v_draft.version;
end
$$;

create function public.app_ch_taxonomy_save_node(p_node jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_draft public.ch_taxonomy_versions;
  v_parent public.ch_taxonomy_nodes;
  v_level text;
  v_id uuid;
begin
  perform public.assert_staff();
  select * into v_draft from public.ch_taxonomy_versions where status = 'draft';
  if not found then raise exception 'Abra um rascunho da taxonomia antes de editar.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_node ->> 'name', ''))) = 0 then raise exception 'Informe o nome.' using errcode = '22023'; end if;

  if nullif(p_node ->> 'id', '') is not null then
    update public.ch_taxonomy_nodes set name = btrim(p_node ->> 'name'),
      matrix_competencies = case when p_node ? 'matrix_competencies'
                                 then array(select jsonb_array_elements_text(p_node -> 'matrix_competencies')) else matrix_competencies end
      where id = (p_node ->> 'id')::uuid and version_id = v_draft.id returning id into v_id;
    if v_id is null then raise exception 'Nó não encontrado no rascunho.' using errcode = 'P0002'; end if;
  else
    select * into v_parent from public.ch_taxonomy_nodes where id = (p_node ->> 'parent_id')::uuid and version_id = v_draft.id;
    if not found then raise exception 'Escolha onde o item entra (nó pai do rascunho).' using errcode = '22023'; end if;
    v_level := case v_parent.level when 'area' then 'subarea' when 'subarea' then 'theme' when 'theme' then 'subtheme' end;
    if v_level is null then raise exception 'Subtemas não têm filhos.' using errcode = '22023'; end if;
    insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name, status, suggested_by_ai)
    values (v_draft.id, v_parent.id, v_level, btrim(p_node ->> 'name'), 'active', false) returning id into v_id;
  end if;
  perform public.ch_log('taxonomy.node', v_id::text, p_node);
  return jsonb_build_object('id', v_id);
end
$$;

-- Sugestão de tema pela IA (worker): entra como "sugerido" e só vale depois da decisão editorial.
create function public.ch_worker_suggest_node(p_parent uuid, p_name text) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  v_parent public.ch_taxonomy_nodes;
  v_id uuid;
begin
  select n.* into v_parent from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id
  where n.id = p_parent and v.status = 'published';
  if not found or v_parent.level = 'subtheme' then raise exception 'Nó pai inválido.' using errcode = '22023'; end if;
  insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name, status, suggested_by_ai)
  values (v_parent.version_id, v_parent.id,
          case v_parent.level when 'area' then 'subarea' when 'subarea' then 'theme' else 'subtheme' end,
          btrim(p_name), 'suggested', true)
  on conflict do nothing returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.ch_worker_suggest_node(uuid, text) from public, anon, authenticated;

create function public.app_ch_taxonomy_decide(p_node_id uuid, p_approve boolean) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  update public.ch_taxonomy_nodes set status = case when p_approve then 'active' else 'rejected' end
  where id = p_node_id and status = 'suggested';
  if not found then raise exception 'Sugestão não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('taxonomy.decide', p_node_id::text, jsonb_build_object('approved', p_approve));
  return true;
end
$$;

create function public.app_ch_taxonomy_publish(p_note text default null) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_draft public.ch_taxonomy_versions;
begin
  perform public.assert_admin();
  select * into v_draft from public.ch_taxonomy_versions where status = 'draft';
  if not found then raise exception 'Não há rascunho para publicar.' using errcode = 'P0002'; end if;
  update public.ch_taxonomy_versions set status = 'archived' where status = 'published';
  update public.ch_taxonomy_versions set status = 'published', published_at = now(), note = coalesce(nullif(btrim(p_note), ''), note) where id = v_draft.id;
  perform public.ch_log('taxonomy.publish', v_draft.version::text);
  return v_draft.version;
end
$$;

-- =============================================================================
-- Documentos, extração e inventário
-- =============================================================================
create function public.app_ch_register_document(p_doc jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_id uuid;
  v_new boolean := false;
begin
  perform public.ch_assert_staff();
  if coalesce(p_doc ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'Hash do arquivo inválido.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_doc ->> 'name', ''))) = 0 then raise exception 'Informe o nome do documento.' using errcode = '22023'; end if;
  if coalesce(p_doc ->> 'rights_status', 'unknown') not in ('unknown', 'own', 'licensed_adaptation', 'reference_only', 'unauthorized') then
    raise exception 'Situação de direitos inválida.' using errcode = '22023';
  end if;
  select id into v_id from public.ch_documents where owner_id = v_uid and sha256 = p_doc ->> 'sha256';
  if v_id is null then
    insert into public.ch_documents (owner_id, name, author, publisher, edition_date, language, page_count, sha256, storage_path, mime, rights_status, rights_note, provenance)
    values (v_uid, btrim(p_doc ->> 'name'), nullif(p_doc ->> 'author', ''), nullif(p_doc ->> 'publisher', ''), nullif(p_doc ->> 'edition_date', ''),
            coalesce(nullif(p_doc ->> 'language', ''), 'pt-BR'), nullif(p_doc ->> 'page_count', '')::integer, p_doc ->> 'sha256', nullif(p_doc ->> 'storage_path', ''),
            coalesce(nullif(p_doc ->> 'mime', ''), 'application/pdf'), coalesce(p_doc ->> 'rights_status', 'unknown'), nullif(p_doc ->> 'rights_note', ''),
            coalesce(p_doc -> 'provenance', '{}'::jsonb))
    returning id into v_id;
    v_new := true;
    perform public.ch_log('document.register', v_id::text, jsonb_build_object('sha256', p_doc ->> 'sha256'));
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', not v_new);
end
$$;

create function public.app_ch_set_rights(p_document_id uuid, p_status text, p_note text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_document(p_document_id);
  if p_status not in ('unknown', 'own', 'licensed_adaptation', 'reference_only', 'unauthorized') then raise exception 'Situação de direitos inválida.' using errcode = '22023'; end if;
  if p_status in ('own', 'licensed_adaptation') and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Descreva a autorização ou licença que cobre a adaptação.' using errcode = '22023';
  end if;
  update public.ch_documents set rights_status = p_status, rights_note = nullif(btrim(p_note), '') where id = p_document_id;
  perform public.ch_log('document.rights', p_document_id::text, jsonb_build_object('status', p_status));
  return true;
end
$$;

-- Gravação do resultado da extração (worker). Idempotente: refazer a extração substitui a anterior
-- sem duplicar; revisões humanas de blocos já existentes são preservadas pela chave (página, ordem).
create function public.ch_worker_save_extraction(p_document_id uuid, p_text_kind text, p_pages jsonb, p_blocks jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  b jsonb; pg jsonb; n integer := 0;
begin
  perform set_config('ch.extraction', 'on', true);
  update public.ch_documents set text_kind = p_text_kind, status = 'classifying',
    page_count = coalesce(page_count, jsonb_array_length(p_pages)) where id = p_document_id;
  for pg in select value from jsonb_array_elements(p_pages) loop
    insert into public.ch_pages (document_id, page_no, printed_no, kind, width, height, ocr_used)
    values (p_document_id, (pg ->> 'page_no')::int, nullif(pg ->> 'printed_no', ''), pg ->> 'kind', (pg ->> 'width')::real, (pg ->> 'height')::real, coalesce((pg ->> 'ocr_used')::boolean, false))
    on conflict (document_id, page_no) do update set printed_no = excluded.printed_no, kind = excluded.kind, ocr_used = excluded.ocr_used;
  end loop;
  for b in select value from jsonb_array_elements(p_blocks) loop
    insert into public.ch_blocks (document_id, page_no, idx, type, bbox, original_text, status, exclusion_reason, ocr_confidence, flags, data)
    values (p_document_id, (b ->> 'page_no')::int, (b ->> 'idx')::int, b ->> 'type', b -> 'bbox', b ->> 'text',
            coalesce(b ->> 'status', 'extracted'), b ->> 'exclusion_reason', nullif(b ->> 'ocr_confidence', '')::real,
            coalesce(b -> 'flags', '[]'::jsonb), coalesce(b -> 'data', '{}'::jsonb))
    on conflict (document_id, page_no, idx) do update set
      type = excluded.type, bbox = excluded.bbox, original_text = excluded.original_text, ocr_confidence = excluded.ocr_confidence, flags = excluded.flags, data = excluded.data,
      -- uma decisão humana (excluído/ilegível resolvido) não é desfeita por reprocessamento
      status = case when public.ch_blocks.status in ('excluded') then public.ch_blocks.status else excluded.status end,
      exclusion_reason = case when public.ch_blocks.status = 'excluded' then public.ch_blocks.exclusion_reason else excluded.exclusion_reason end;
    n := n + 1;
  end loop;
  perform set_config('ch.extraction', 'off', true);
  return jsonb_build_object('blocks', n);
end
$$;
revoke execute on function public.ch_worker_save_extraction(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- Inventário: a extração só é "completa" quando nenhum elemento está pendente ou ilegível.
create function public.app_ch_inventory(p_document_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.ch_assert_document(p_document_id);
  select jsonb_build_object(
    'pages', (select count(*)::int from public.ch_pages where document_id = p_document_id),
    'expected_pages', (select page_count from public.ch_documents where id = p_document_id),
    'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*)::int as n from public.ch_blocks where document_id = p_document_id group by status) s), '{}'::jsonb),
    'by_type', coalesce((select jsonb_object_agg(s.type, s.n) from (select type, count(*)::int as n from public.ch_blocks where document_id = p_document_id group by type) s), '{}'::jsonb),
    'pages_without_blocks', coalesce((select jsonb_agg(p.page_no order by p.page_no) from public.ch_pages p
        where p.document_id = p_document_id and p.kind <> 'empty'
          and not exists (select 1 from public.ch_blocks b where b.document_id = p_document_id and b.page_no = p.page_no)), '[]'::jsonb),
    'unresolved', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'page', b.page_no, 'status', b.status, 'type', b.type) order by b.page_no, b.idx)
        from public.ch_blocks b where b.document_id = p_document_id and b.status in ('pending', 'illegible')), '[]'::jsonb),
    'flagged', (select count(*)::int from public.ch_blocks b where b.document_id = p_document_id and jsonb_array_length(b.flags) > 0)
  ) into v;
  return v || jsonb_build_object('complete',
    (v -> 'pages')::int = coalesce((v ->> 'expected_pages')::int, (v -> 'pages')::int)
    and jsonb_array_length(v -> 'unresolved') = 0 and jsonb_array_length(v -> 'pages_without_blocks') = 0
    and (v -> 'pages')::int > 0);
end
$$;

-- Resolver um bloco: o original não muda; a revisão fica em revised_text.
create function public.app_ch_resolve_block(p_block_id uuid, p_status text, p_revised_text text default null, p_reason text default null) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_doc uuid;
begin
  select document_id into v_doc from public.ch_blocks where id = p_block_id;
  if v_doc is null then raise exception 'Bloco não encontrado.' using errcode = 'P0002'; end if;
  perform public.ch_assert_document(v_doc);
  if p_status not in ('extracted', 'pending', 'illegible', 'excluded') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  if p_status = 'excluded' and char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Excluir exige uma justificativa.' using errcode = '22023'; end if;
  if p_status = 'extracted' and (select b.status from public.ch_blocks b where b.id = p_block_id) in ('pending', 'illegible')
     and char_length(btrim(coalesce(p_revised_text, ''))) = 0 then
    raise exception 'Para resolver um trecho ilegível ou pendente, informe o texto revisado conferido no original.' using errcode = '22023';
  end if;
  update public.ch_blocks set status = p_status, revised_text = coalesce(nullif(btrim(p_revised_text), ''), revised_text),
    exclusion_reason = case when p_status = 'excluded' then btrim(p_reason) else null end where id = p_block_id;
  perform public.ch_log('block.resolve', p_block_id::text, jsonb_build_object('status', p_status));
  return true;
end
$$;

create function public.app_ch_classify_block(p_block_id uuid, p_node_ids uuid[]) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_doc uuid;
begin
  select document_id into v_doc from public.ch_blocks where id = p_block_id;
  if v_doc is null then raise exception 'Bloco não encontrado.' using errcode = 'P0002'; end if;
  perform public.ch_assert_document(v_doc);
  if exists (select 1 from unnest(p_node_ids) n where not exists (select 1 from public.ch_taxonomy_nodes t where t.id = n and t.status = 'active')) then
    raise exception 'Há tema inexistente ou ainda não validado editorialmente.' using errcode = '22023';
  end if;
  delete from public.ch_block_nodes where block_id = p_block_id;
  insert into public.ch_block_nodes (block_id, node_id, confirmed_by) select p_block_id, n, (select auth.uid()) from unnest(p_node_ids) n;   -- um conteúdo pode estar em mais de uma área
  return true;
end
$$;

-- =============================================================================
-- Fontes e busca
-- =============================================================================
create function public.app_ch_register_source(p_source jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_old public.ch_sources;
  v_candidates integer := 0;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_source ->> 'title', ''))) = 0 or char_length(btrim(coalesce(p_source ->> 'organ', ''))) = 0 then
    raise exception 'Informe título e órgão da fonte.' using errcode = '22023';
  end if;
  if coalesce(p_source ->> 'kind', 'final') not in ('final', 'public_consultation', 'preliminary', 'rectification', 'society_guideline') then
    raise exception 'Tipo de fonte inválido.' using errcode = '22023';
  end if;
  insert into public.ch_sources (title, organ, kind, url, version, published_on, valid_until, accessed_on, sha256, editorial_approved)
  values (btrim(p_source ->> 'title'), btrim(p_source ->> 'organ'), coalesce(p_source ->> 'kind', 'final'), nullif(p_source ->> 'url', ''), nullif(p_source ->> 'version', ''),
          nullif(p_source ->> 'published_on', '')::date, nullif(p_source ->> 'valid_until', '')::date, coalesce(nullif(p_source ->> 'accessed_on', '')::date, current_date),
          nullif(p_source ->> 'sha256', ''), coalesce((p_source ->> 'editorial_approved')::boolean, false))
  returning id into v_id;

  -- Nova versão do mesmo documento (mesmo título e órgão): a anterior é substituída e quem dependia dela é sinalizado.
  select * into v_old from public.ch_sources
   where id <> v_id and status = 'current' and lower(title) = lower(btrim(p_source ->> 'title')) and lower(organ) = lower(btrim(p_source ->> 'organ'))
   order by created_at desc limit 1;
  if found and (v_old.sha256 is distinct from nullif(p_source ->> 'sha256', '') or v_old.version is distinct from nullif(p_source ->> 'version', '')) then
    update public.ch_sources set status = 'superseded', superseded_by = v_id where id = v_old.id;
    v_candidates := public.ch_flag_dependents(v_old.id, 'Fonte substituída: ' || coalesce(v_old.version, 'versão anterior') || ' → ' || coalesce(p_source ->> 'version', 'nova versão'));
  end if;
  perform public.ch_log('source.register', v_id::text, jsonb_build_object('title', p_source ->> 'title', 'candidates', v_candidates));
  return jsonb_build_object('id', v_id, 'superseded', v_old.id, 'candidate_versions', v_candidates);
end
$$;

-- Fonte mudou: evidências ficam desatualizadas, afirmações voltam à revisão, versões publicadas são
-- marcadas "requer atualização" (continuam no ar até alguém decidir) e nasce uma versão candidata em rascunho.
create function public.ch_flag_dependents(p_old_source uuid, p_reason text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  r2 record;
  v_new uuid;
  n integer := 0;
begin
  update public.ch_evidence set stale = true where source_id = p_old_source;
  update public.ch_claims set status = 'needs_review', critical_checked_by = null, critical_checked_at = null
   where id in (select claim_id from public.ch_evidence where source_id = p_old_source);
  -- rascunhos e versões em revisão: perdem aprovações e voltam a rascunho (as afirmações já estão em revisão)
  update public.ch_approvals set invalidated_at = now()
   where invalidated_at is null and unit_version_id in (
     select uc.unit_version_id from public.ch_unit_claims uc join public.ch_evidence e on e.claim_id = uc.claim_id and e.source_id = p_old_source);
  update public.ch_unit_versions set status = 'draft'
   where status = 'awaiting_review' and id in (
     select uc.unit_version_id from public.ch_unit_claims uc join public.ch_evidence e on e.claim_id = uc.claim_id and e.source_id = p_old_source);
  -- aprovadas e publicadas: "requer atualização" (a publicada continua no ar) + versão candidata em rascunho
  for r in select distinct uv.* from public.ch_unit_versions uv
            join public.ch_unit_claims uc on uc.unit_version_id = uv.id
            join public.ch_evidence e on e.claim_id = uc.claim_id and e.source_id = p_old_source
           where uv.status in ('approved', 'published') loop
    update public.ch_unit_versions set status = 'needs_update', candidate_reason = p_reason where id = r.id;
    if not exists (select 1 from public.ch_unit_versions c where c.candidate_of = r.id and c.status = 'draft') then
      insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash, scope_note, candidate_of, candidate_reason)
      values (r.unit_id, (select max(version) + 1 from public.ch_unit_versions where unit_id = r.unit_id), r.origin, 'draft', r.content, r.content_hash, r.scope_note, r.id, p_reason)
      returning id into v_new;
      insert into public.ch_unit_claims select v_new, claim_id from public.ch_unit_claims where unit_version_id = r.id;
      for r2 in select * from public.ch_materials where unit_version_id = r.id loop
        insert into public.ch_materials (unit_version_id, kind, content, content_hash, claim_ids, generated_by_model, template_version)
        values (v_new, r2.kind, r2.content, r2.content_hash, r2.claim_ids, r2.generated_by_model, r2.template_version);
      end loop;
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;
revoke execute on function public.ch_flag_dependents(uuid, text) from public, anon, authenticated;

create function public.app_ch_add_passage(p_source_id uuid, p_passage jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.assert_admin();
  insert into public.ch_source_passages (source_id, section, page, population, care_setting, theme, text)
  values (p_source_id, p_passage ->> 'section', nullif(p_passage ->> 'page', '')::int, p_passage ->> 'population', p_passage ->> 'care_setting', p_passage ->> 'theme', p_passage ->> 'text')
  returning id into v_id;
  return v_id;
end
$$;

-- Busca por palavras (português) com filtros de tema, população, contexto, data e situação da fonte.
-- A busca por significado (embeddings) depende de pgvector e de um modelo de embeddings: ver a pendência no README.
create function public.app_ch_search_passages(p_query text, p_filters jsonb default '{}'::jsonb, p_limit integer default 20) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  q tsquery := websearch_to_tsquery('portuguese', coalesce(p_query, ''));
begin
  perform public.ch_assert_staff();
  return coalesce((
    select jsonb_agg(x.row order by x.rank desc) from (
      select ts_rank(p.tsv, q) as rank, jsonb_build_object(
        'passage_id', p.id, 'source_id', s.id, 'source', s.title, 'organ', s.organ, 'kind', s.kind, 'version', s.version, 'status', s.status,
        'section', p.section, 'page', p.page, 'population', p.population, 'care_setting', p.care_setting,
        'published_on', s.published_on, 'valid_until', s.valid_until, 'text', p.text) as row
      from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id
      where p.tsv @@ q
        and (nullif(f ->> 'theme', '') is null or public.fold_text(p.theme) like '%' || public.fold_text(f ->> 'theme') || '%')
        and (nullif(f ->> 'population', '') is null or public.fold_text(p.population) like '%' || public.fold_text(f ->> 'population') || '%')
        and (nullif(f ->> 'care_setting', '') is null or public.fold_text(p.care_setting) like '%' || public.fold_text(f ->> 'care_setting') || '%')
        and (nullif(f ->> 'status', '') is null or s.status = f ->> 'status')
        and (nullif(f ->> 'valid_on', '') is null or ((s.published_on is null or s.published_on <= (f ->> 'valid_on')::date) and (s.valid_until is null or s.valid_until >= (f ->> 'valid_on')::date)))
        and (s.kind <> 'society_guideline' or s.editorial_approved)
      order by rank desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) x
  ), '[]'::jsonb);
end
$$;

-- =============================================================================
-- Afirmações clínicas e evidências
-- =============================================================================
create function public.ch_numbers(p_text text) returns text[]
  language sql immutable set search_path = ''
as $$
  -- número + unidade, normalizados (vírgula decimal, sem espaços, minúsculas); inclui os sinais < > ≤ ≥ antes do número
  select coalesce(array_agg(distinct lower(regexp_replace(replace(m[1], ',', '.'), '\s+', '', 'g')) order by lower(regexp_replace(replace(m[1], ',', '.'), '\s+', '', 'g'))), '{}')
  from regexp_matches(coalesce(p_text, ''),
       '((?:[<>≤≥]=?\s*)?\d+(?:[.,]\d+)?\s*(?:mg/kg/dia|mg/kg/dose|mg/kg/h|mcg/kg/min|µg/kg/min|mg/kg|mcg/kg|µg/kg|ui/kg|mg/dl|mg/ml|mg/h|g/h|ml/h|ui/h|gotas/min|g/dl|mg|mcg|µg|g|ml/kg|ml|ui|%|mmhg|bpm|kg|cm|mm|dias?|horas?|h|semanas?|meses|mês|anos?|min|vezes)(?![[:alpha:]]))', 'gi') as m
$$;

-- Negações e limites que mudam a conduta: precisam constar de forma equivalente na evidência.
create function public.ch_negations(p_text text) returns text[]
  language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(m[1]) order by lower(m[1])), '{}')
  from regexp_matches(coalesce(p_text, ''), '\m(não|nunca|exceto|contraindicad[oa]s?|proibid[oa]s?|evitar|somente|apenas|sem)\M', 'gi') as m
$$;

create function public.app_ch_add_claim(p_claim jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_doc uuid := nullif(p_claim ->> 'document_id', '')::uuid;
begin
  perform public.ch_assert_staff();
  if v_doc is not null then perform public.ch_assert_document(v_doc); end if;
  if char_length(btrim(coalesce(p_claim ->> 'statement', ''))) = 0 then raise exception 'Informe a afirmação.' using errcode = '22023'; end if;
  insert into public.ch_claims (document_id, block_id, theme_node_id, statement, context, critical_kinds, proposed_text, change_rationale, created_by_model)
  values (v_doc, nullif(p_claim ->> 'block_id', '')::uuid, nullif(p_claim ->> 'theme_node_id', '')::uuid, btrim(p_claim ->> 'statement'), coalesce(p_claim -> 'context', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p_claim -> 'critical_kinds')), '{}'), nullif(btrim(coalesce(p_claim ->> 'proposed_text', '')), ''), nullif(btrim(coalesce(p_claim ->> 'change_rationale', '')), ''), p_claim ->> 'model')
  returning id into v_id;
  insert into public.ch_claim_history (claim_id, actor_id, event) values (v_id, (select auth.uid()), 'created');
  return v_id;
end
$$;

-- Vincula uma evidência: o texto da afirmação (o proposto, se houver) é conferido por regra de software
-- contra o trecho citado (números, unidades, sinais e negações). Divergência → a evidência não pode valer como "compatível".
create function public.app_ch_link_evidence(p_claim_id uuid, p_evidence jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_claims;
  s public.ch_sources;
  v_quote text := btrim(coalesce(p_evidence ->> 'quote', ''));
  v_verdict text := coalesce(p_evidence ->> 'verdict', '');
  v_text text;
  v_claim_nums text[]; v_ev_nums text[]; v_missing text[]; v_neg_claim text[]; v_neg_ev text[]; v_neg_missing text[];
  v_check jsonb;
  v_id uuid;
begin
  perform public.ch_assert_staff();
  select * into c from public.ch_claims where id = p_claim_id;
  if not found then raise exception 'Afirmação não encontrada.' using errcode = 'P0002'; end if;
  select * into s from public.ch_sources where id = (p_evidence ->> 'source_id')::uuid;
  if not found then raise exception 'Fonte não cadastrada.' using errcode = 'P0002'; end if;
  if v_quote = '' then raise exception 'A evidência precisa do trecho citado da fonte.' using errcode = '22023'; end if;
  if v_verdict not in ('compatible', 'outdated', 'conflicting', 'insufficient', 'context_dependent') then raise exception 'Conferência inválida.' using errcode = '22023'; end if;
  if s.kind = 'society_guideline' and not s.editorial_approved then raise exception 'Diretriz de sociedade só vale como evidência com aprovação editorial.' using errcode = '22023'; end if;
  if s.status <> 'current' and v_verdict = 'compatible' then raise exception 'Fonte substituída ou retirada não sustenta uma afirmação atual.' using errcode = '22023'; end if;
  if s.kind in ('preliminary', 'public_consultation') and v_verdict = 'compatible' then raise exception 'Consulta pública ou relatório preliminar não sustenta conduta: use o documento final.' using errcode = '22023'; end if;
  if nullif(p_evidence ->> 'passage_id', '') is not null
     and not exists (select 1 from public.ch_source_passages p where p.id = (p_evidence ->> 'passage_id')::uuid and p.source_id = s.id) then
    raise exception 'O trecho informado não pertence a essa fonte.' using errcode = '22023';
  end if;

  v_text := coalesce(c.proposed_text, c.statement);
  v_claim_nums := public.ch_numbers(v_text);
  v_ev_nums := public.ch_numbers(v_quote);
  select coalesce(array_agg(n), '{}') into v_missing from unnest(v_claim_nums) n where not (n = any (v_ev_nums));
  v_neg_claim := public.ch_negations(v_text);
  v_neg_ev := public.ch_negations(v_quote);
  select coalesce(array_agg(n), '{}') into v_neg_missing from unnest(v_neg_claim) n where not (n = any (v_neg_ev));
  v_check := jsonb_build_object('claim_numbers', v_claim_nums, 'evidence_numbers', v_ev_nums, 'missing_in_evidence', v_missing,
                                'claim_negations', v_neg_claim, 'negations_missing_in_evidence', v_neg_missing,
                                'ok', cardinality(v_missing) = 0 and cardinality(v_neg_missing) = 0);
  if v_verdict = 'compatible' and not (v_check ->> 'ok')::boolean then
    raise exception 'O texto traz valores ou negações que não constam do trecho citado: % %', v_missing, v_neg_missing using errcode = '22023';
  end if;

  insert into public.ch_evidence (claim_id, source_id, passage_id, section, page, source_version, quote, verdict, numeric_check, checked_by)
  values (p_claim_id, s.id, nullif(p_evidence ->> 'passage_id', '')::uuid, p_evidence ->> 'section', nullif(p_evidence ->> 'page', '')::int, s.version, v_quote, v_verdict, v_check, (select auth.uid()))
  returning id into v_id;
  -- situação da afirmação: o pior veredito vence (conflito > desatualizada > depende de contexto > insuficiente > compatível)
  update public.ch_claims set status = (
    select case when bool_or(e.verdict = 'conflicting') then 'conflicting' when bool_or(e.verdict = 'outdated') then 'outdated'
                when bool_or(e.verdict = 'context_dependent') then 'context_dependent' when bool_or(e.verdict = 'insufficient') then 'insufficient' else 'compatible' end
    from public.ch_evidence e where e.claim_id = p_claim_id and not e.stale)
  where id = p_claim_id;
  insert into public.ch_claim_history (claim_id, actor_id, event, details) values (p_claim_id, (select auth.uid()), 'evidence', jsonb_build_object('evidence_id', v_id, 'verdict', v_verdict, 'numeric_ok', v_check -> 'ok'));
  return jsonb_build_object('id', v_id, 'numeric_check', v_check, 'claim_status', (select status from public.ch_claims where id = p_claim_id));
end
$$;

-- Conferência humana explícita de afirmação crítica (dose, via, frequência etc.).
create function public.app_ch_confirm_critical(p_claim_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  if not exists (select 1 from public.ch_evidence e where e.claim_id = p_claim_id and e.verdict = 'compatible' and not e.stale and (e.numeric_check ->> 'ok')::boolean) then
    raise exception 'Confirme só depois de haver evidência compatível e conferida.' using errcode = '22023';
  end if;
  update public.ch_claims set critical_checked_by = (select auth.uid()), critical_checked_at = now() where id = p_claim_id;
  insert into public.ch_claim_history (claim_id, actor_id, event) values (p_claim_id, (select auth.uid()), 'critical_confirmed');
  return true;
end
$$;

-- =============================================================================
-- Unidades didáticas e materiais
-- =============================================================================
create function public.ch_content_claim_ids(p_content jsonb) returns uuid[]
  language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct x::uuid), '{}') from jsonb_path_query(p_content, 'lax $.**.claim_ids[*]') as j, lateral (select j #>> '{}') as t(x)
$$;

create function public.ch_invalidate_approvals(p_version_id uuid, p_why text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_approvals set invalidated_at = now() where unit_version_id = p_version_id and invalidated_at is null;
  update public.ch_unit_versions set status = 'draft' where id = p_version_id and status in ('approved', 'awaiting_review');
  perform public.ch_log('approval.invalidate', p_version_id::text, jsonb_build_object('why', p_why));
end
$$;
revoke execute on function public.ch_invalidate_approvals(uuid, text) from public, anon, authenticated;

create function public.app_ch_create_unit(p_theme_node_id uuid, p_title text) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_unit uuid;
begin
  perform public.ch_assert_staff();
  if not exists (select 1 from public.ch_taxonomy_nodes n where n.id = p_theme_node_id and n.level in ('theme', 'subtheme') and n.status = 'active') then
    raise exception 'Escolha um tema ou subtema ativo da taxonomia.' using errcode = '22023';
  end if;
  insert into public.ch_units (theme_node_id, title) values (p_theme_node_id, btrim(p_title)) returning id into v_unit;
  insert into public.ch_unit_versions (unit_id, version, content_hash, content) values (v_unit, 1, public.ch_hash('{"sections": []}'::jsonb), '{"sections": []}'::jsonb);
  return v_unit;
end
$$;

create function public.app_ch_save_unit_version(p_version_id uuid, p_content jsonb, p_origin text default null, p_scope_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_ids uuid[];
  v_hash text;
begin
  perform public.ch_assert_staff();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status in ('published', 'retired') then raise exception 'Versão publicada não se edita: crie uma nova versão.' using errcode = '22023'; end if;
  if jsonb_typeof(p_content -> 'sections') is distinct from 'array' then raise exception 'O conteúdo precisa ter a lista "sections".' using errcode = '22023'; end if;
  v_ids := public.ch_content_claim_ids(p_content);
  if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.ch_claims c where c.id = i)) then
    raise exception 'O conteúdo cita uma afirmação que não existe.' using errcode = '22023';
  end if;
  v_hash := public.ch_hash(p_content);
  if v_hash <> v.content_hash then perform public.ch_invalidate_approvals(p_version_id, 'conteúdo alterado'); end if;
  update public.ch_unit_versions set content = p_content, content_hash = v_hash, origin = coalesce(p_origin, origin), scope_note = coalesce(nullif(btrim(p_scope_note), ''), scope_note) where id = p_version_id;
  delete from public.ch_unit_claims where unit_version_id = p_version_id;
  insert into public.ch_unit_claims select p_version_id, i from unnest(v_ids) i;
  return jsonb_build_object('content_hash', v_hash, 'claims', cardinality(v_ids));
end
$$;

create function public.app_ch_save_material(p_version_id uuid, p_kind text, p_content jsonb, p_model text default null, p_template text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_ids uuid[] := public.ch_content_claim_ids(p_content);
  v_hash text := public.ch_hash(p_content);
begin
  perform public.ch_assert_staff();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status in ('published', 'retired') then raise exception 'Versão publicada não se edita.' using errcode = '22023'; end if;
  -- todo material nasce da mesma base: só pode usar afirmações da unidade
  if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.ch_unit_claims uc where uc.unit_version_id = p_version_id and uc.claim_id = i)) then
    raise exception 'O material usa uma afirmação que não faz parte da base revisada desta unidade.' using errcode = '22023';
  end if;
  perform public.ch_invalidate_approvals(p_version_id, 'material alterado');
  insert into public.ch_materials (unit_version_id, kind, content, content_hash, claim_ids, generated_by_model, template_version)
  values (p_version_id, p_kind, p_content, v_hash, v_ids, p_model, p_template)
  on conflict (unit_version_id, kind) do update set content = excluded.content, content_hash = excluded.content_hash, claim_ids = excluded.claim_ids,
    generated_by_model = excluded.generated_by_model, template_version = excluded.template_version;
  return jsonb_build_object('content_hash', v_hash);
end
$$;

-- =============================================================================
-- Verificações de publicação (todas no banco)
-- =============================================================================
create function public.ch_unit_area_code(p_version_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select n.* from public.ch_taxonomy_nodes n join public.ch_units u on u.theme_node_id = n.id join public.ch_unit_versions v on v.unit_id = u.id where v.id = p_version_id
    union all select p.* from public.ch_taxonomy_nodes p join up on up.parent_id = p.id)
  select code from up where level = 'area'
$$;

create function public.ch_publish_problems(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  p text[] := '{}';
  r record;
  v_area text := public.ch_unit_area_code(p_version_id);
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then return array['Versão não encontrada.']; end if;
  if v.content_hash <> public.ch_hash(v.content) then p := array_append(p, 'O conteúdo não confere com o hash registrado.'); end if;
  if not exists (select 1 from public.ch_unit_claims where unit_version_id = p_version_id) then p := array_append(p, 'A unidade não tem nenhuma afirmação clínica vinculada.'); end if;
  -- parágrafos clínicos precisam citar afirmações
  if exists (select 1 from jsonb_path_query(v.content, 'lax $.sections[*].paragraphs[*]') para
             where coalesce((para ->> 'clinical')::boolean, false) and coalesce(jsonb_array_length(para -> 'claim_ids'), 0) = 0) then
    p := array_append(p, 'Há parágrafo clínico sem afirmação vinculada.');
  end if;
  for r in select c.* from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = p_version_id loop
    if not exists (select 1 from public.ch_evidence e where e.claim_id = r.id and e.verdict = 'compatible' and not e.stale) then
      p := array_append(p, ('Afirmação sem evidência compatível: ' || left(r.statement, 80)));
    end if;
    if r.status in ('conflicting', 'outdated', 'insufficient', 'context_dependent', 'needs_review', 'extracted') then
      p := array_append(p, ('Afirmação pendente (' || r.status || '): ' || left(r.statement, 80)));
    end if;
    if exists (select 1 from public.ch_evidence e where e.claim_id = r.id and e.verdict = 'conflicting' and not e.stale) then
      p := array_append(p, ('Conflito entre referências não resolvido: ' || left(r.statement, 80)));
    end if;
    if cardinality(r.critical_kinds) > 0 and r.critical_checked_by is null then
      p := array_append(p, ('Afirmação crítica (' || array_to_string(r.critical_kinds, ', ') || ') sem conferência humana: ' || left(r.statement, 80)));
    end if;
    if r.block_id is not null and exists (select 1 from public.ch_blocks b where b.id = r.block_id and b.status in ('pending', 'illegible')) then
      p := array_append(p, ('Afirmação vinda de trecho ilegível/pendente: ' || left(r.statement, 80)));
    end if;
    if r.block_id is not null and exists (select 1 from public.ch_blocks b where b.id = r.block_id and b.flags @> '[{"code":"doubtful_ocr_critical"}]'::jsonb) then
      p := array_append(p, ('OCR duvidoso em informação crítica: ' || left(r.statement, 80)));
    end if;
    if v.origin = 'adaptation' and exists (select 1 from public.ch_documents d where d.id = r.document_id and d.rights_status not in ('own', 'licensed_adaptation')) then
      p := array_append(p, ('Adaptação bloqueada: o documento de origem não tem autorização de uso (' || (select d.rights_status from public.ch_documents d where d.id = r.document_id) || ').'));
    end if;
  end loop;
  -- materiais: mesma base, sem alteração
  for r in select * from public.ch_materials m where m.unit_version_id = p_version_id loop
    if r.content_hash <> public.ch_hash(r.content) then p := array_append(p, ('O material "' || r.kind || '" foi alterado depois de gerado.')); end if;
  end loop;
  -- aprovações válidas para este hash
  if not exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash and a.area_code = v_area) then
    p := array_append(p, 'Falta a aprovação médica de um revisor da área (' || coalesce(v_area, '?') || ') para esta versão exata.');
  end if;
  if not exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'editorial' and a.invalidated_at is null and a.content_hash = v.content_hash) then
    p := array_append(p, 'Falta a aprovação editorial para esta versão exata.');
  end if;
  return p;
end
$$;

create function public.app_ch_publish_problems(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return to_jsonb(public.ch_publish_problems(p_version_id));
end
$$;

create function public.app_ch_submit_for_review(p_version_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  update public.ch_unit_versions set status = 'awaiting_review' where id = p_version_id and status = 'draft';
  if not found then raise exception 'Só uma versão em rascunho vai para revisão.' using errcode = '22023'; end if;
  return true;
end
$$;

-- Aprovação: só pessoa. Médica = revisor cadastrado na área da unidade; editorial = editor ou administrador.
create function public.app_ch_approve(p_version_id uuid, p_kind text, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_area text := public.ch_unit_area_code(p_version_id);
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status not in ('awaiting_review', 'approved') then raise exception 'A versão precisa estar aguardando revisão.' using errcode = '22023'; end if;
  if p_kind = 'medical' then
    if not public.ch_is_reviewer(v_area) then raise exception 'Aprovação médica exige revisor cadastrado na área %.', v_area using errcode = '42501'; end if;
  elsif p_kind = 'editorial' then
    if not public.is_staff() then raise exception 'Aprovação editorial exige editor ou administrador.' using errcode = '42501'; end if;
  else
    raise exception 'Tipo de aprovação inválido.' using errcode = '22023';
  end if;
  update public.ch_approvals set invalidated_at = now() where unit_version_id = p_version_id and kind = p_kind and invalidated_at is null;
  insert into public.ch_approvals (unit_version_id, kind, reviewer_id, area_code, content_hash, note)
  values (p_version_id, p_kind, (select auth.uid()), case when p_kind = 'medical' then v_area end, v.content_hash, nullif(btrim(p_note), ''));
  if exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null)
     and exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'editorial' and a.invalidated_at is null) then
    update public.ch_unit_versions set status = 'approved' where id = p_version_id;
  end if;
  perform public.ch_log('approve.' || p_kind, p_version_id::text, jsonb_build_object('hash', v.content_hash));
  return jsonb_build_object('hash', v.content_hash, 'status', (select status from public.ch_unit_versions where id = p_version_id));
end
$$;

create function public.app_ch_publish(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_problems text[];
  v_id uuid;
begin
  perform public.assert_admin();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status <> 'approved' then raise exception 'Só uma versão aprovada pode ser publicada.' using errcode = '22023'; end if;
  v_problems := public.ch_publish_problems(p_version_id);
  if cardinality(v_problems) > 0 then
    raise exception 'Publicação bloqueada: %', array_to_string(v_problems, ' | ') using errcode = '22023';
  end if;
  -- uma publicação ativa por unidade: a anterior é retirada
  update public.ch_publications set retired_at = now(), retired_by = (select auth.uid())
   where retired_at is null and unit_version_id in (select id from public.ch_unit_versions where unit_id = v.unit_id and id <> p_version_id);
  update public.ch_unit_versions set status = 'retired' where unit_id = v.unit_id and status in ('published', 'needs_update') and id <> p_version_id;
  update public.ch_unit_versions set status = 'published' where id = p_version_id;
  insert into public.ch_publications (unit_version_id, content_hash, published_by) values (p_version_id, v.content_hash, (select auth.uid())) returning id into v_id;
  perform public.ch_log('publish', p_version_id::text, jsonb_build_object('hash', v.content_hash));
  return jsonb_build_object('publication_id', v_id, 'content_hash', v.content_hash);
end
$$;

create function public.app_ch_retire(p_version_id uuid, p_reason text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo da retirada.' using errcode = '22023'; end if;
  update public.ch_publications set retired_at = now(), retired_by = (select auth.uid()) where unit_version_id = p_version_id and retired_at is null;
  if not found then raise exception 'Não há publicação ativa dessa versão.' using errcode = 'P0002'; end if;
  update public.ch_unit_versions set status = 'retired' where id = p_version_id;
  perform public.ch_log('retire', p_version_id::text, jsonb_build_object('reason', p_reason));
  return true;
end
$$;

-- O que o aluno lê: só versões publicadas e ainda ativas, sem rastros internos.
create function public.app_ch_published_units() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'title', u.title, 'version', v.version, 'published_at', p.published_at,
           'content', v.content, 'materials', (select coalesce(jsonb_object_agg(m.kind, m.content), '{}'::jsonb) from public.ch_materials m where m.unit_version_id = v.id))
           order by u.title), '[]'::jsonb)
  from public.ch_publications p join public.ch_unit_versions v on v.id = p.unit_version_id join public.ch_units u on u.id = v.unit_id
  where p.retired_at is null and v.status in ('published', 'needs_update') and (select auth.uid()) is not null
$$;

-- =============================================================================
-- Fila durável (worker): idempotência, tentativas limitadas, checkpoints, recuperação
-- =============================================================================
create function public.ch_worker_enqueue(p_document_id uuid, p_step text, p_scope_key text, p_versions jsonb, p_max_attempts integer default 3) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := p_document_id::text || '|' || p_step || '|' || coalesce(p_scope_key, '') || '|' || public.ch_hash(coalesce(p_versions, '{}'::jsonb));
  v_id uuid;
begin
  insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts)
  values (p_document_id, p_step, coalesce(p_scope_key, ''), v_key, coalesce(p_versions, '{}'::jsonb), p_max_attempts)
  on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.ch_jobs where idempotency_key = v_key;
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end
$$;

-- Pega o próximo trabalho. Trabalho "running" parado há mais de p_stale_seconds volta para a fila (recuperação de queda).
create function public.ch_worker_claim(p_stale_seconds integer default 600) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare j public.ch_jobs;
begin
  update public.ch_jobs set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
         error = 'Interrompido sem concluir.' || coalesce(' Falha anterior: ' || error, ''), locked_at = null
   where status = 'running' and locked_at < now() - make_interval(secs => p_stale_seconds);
  update public.ch_documents d set status = 'failed', failure = left(j2.error, 500)
    from public.ch_jobs j2 where j2.document_id = d.id and j2.status = 'dead' and j2.finished_at is null;
  update public.ch_jobs set finished_at = now() where status = 'dead' and finished_at is null;
  select * into j from public.ch_jobs where status = 'queued' and run_after <= now() order by run_after, created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.ch_jobs set status = 'running', attempts = attempts + 1, locked_at = now(), started_at = coalesce(started_at, now()) where id = j.id returning * into j;
  return to_jsonb(j);
end
$$;

create function public.ch_worker_checkpoint(p_job_id uuid, p_checkpoint jsonb) returns void
  language sql security definer set search_path = ''
as $$ update public.ch_jobs set checkpoint = p_checkpoint, locked_at = now() where id = p_job_id and status = 'running' $$;

create function public.ch_worker_finish(p_job_id uuid, p_ok boolean, p_error text default null, p_metrics jsonb default '{}'::jsonb) returns text
  language plpgsql security definer set search_path = ''
as $$
declare j public.ch_jobs; v_status text;
begin
  select * into j from public.ch_jobs where id = p_job_id and status = 'running';
  if not found then raise exception 'Trabalho não está em execução.' using errcode = 'P0002'; end if;
  if p_ok then v_status := 'succeeded';
  elsif j.attempts >= j.max_attempts then v_status := 'dead';
  else v_status := 'queued'; end if;
  update public.ch_jobs set status = v_status, error = case when p_ok then null else p_error end, locked_at = null, metrics = coalesce(p_metrics, '{}'::jsonb),
    finished_at = case when v_status in ('succeeded', 'dead') then now() end,
    run_after = case when v_status = 'queued' then now() + make_interval(secs => 30 * attempts) else run_after end where id = p_job_id;
  if v_status = 'dead' and j.document_id is not null then
    update public.ch_documents set status = 'failed', failure = left(coalesce(p_error, 'Falha sem detalhe.'), 500) where id = j.document_id;
  end if;
  return v_status;
end
$$;
revoke execute on function public.ch_worker_enqueue(uuid, text, text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_claim(integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_checkpoint(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_finish(uuid, boolean, text, jsonb) from public, anon, authenticated;

-- Painel: documentos e andamento.
create function public.app_ch_documents() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'status', d.status, 'text_kind', d.text_kind, 'page_count', d.page_count, 'rights_status', d.rights_status,
        'created_at', d.created_at, 'failure', d.failure,
        'jobs', (select coalesce(jsonb_agg(jsonb_build_object('step', j.step, 'status', j.status, 'attempts', j.attempts, 'error', j.error) order by j.created_at), '[]'::jsonb) from public.ch_jobs j where j.document_id = d.id))
      order by d.created_at desc)
    from public.ch_documents d where d.owner_id = (select auth.uid()) or public.is_admin()), '[]'::jsonb);
end
$$;
