-- =============================================================================
-- Fontes oficiais com IA (Administração › Central de Conteúdo › Fontes, só administrador): uma IA procura documentos
-- oficiais SÓ nos sites da lista, o servidor confere e baixa cada achado, e o dono confere, aprova ou rejeita.
-- Só o aprovado vira fonte do sistema. Spec: docs/superpowers/specs/2026-10-09-fontes-oficiais-ia-design.md (§5, §6, §7).
--
--   o administrador pede a busca (área, tema ou "temas mais cobrados", texto livre)
--   →  app_ch_source_search_start grava uma busca por tema e põe na fila (ch_jobs, etapa source_search, sem documento)
--   →  o processamento (tarefa do Cloud Run em produção) lê a busca (ch_worker_source_search_get), chama a função
--      "Busca de fontes oficiais" (busca_fontes) da Central de IAs, confere cada achado no servidor (lista de sites,
--      https, download, SHA-256, repetidos por ch_worker_source_known, trecho no texto) e grava os bons como candidatos
--      "aguardando sua conferência" (ch_worker_source_candidate_create); o resultado vai para a busca
--      (ch_worker_source_search_update)
--   →  o dono vê os candidatos (app_ch_source_candidates), ajusta os dados (app_ch_source_candidate_save) e aprova ou
--      rejeita; só a aprovação cria a fonte.
--
-- Regras no banco (não só na tela):
--   * nada vira fonte sozinho: o processamento nunca passa de "aguardando";
--   * sites oficiais: a equipe lê; só o administrador grava (app_ch_save_official_domain); endereço só ASCII, sem https://,
--     pode ter caminho (gov.br/saude);
--   * buscas e candidatos: só o administrador lê (RLS) e decide; escrita só pelas funções;
--   * tarefa da busca que morre (tentativas esgotadas), inclusive quando a própria fila a encerra no SQL (ch_worker_claim),
--     põe a busca ainda andando em "falhou" com o motivo (gatilho em ch_jobs); busca que falhou, ou cuja tarefa morreu, não
--     impede repetir o mesmo pedido;
--   * nível E nunca entra: nem da IA, nem na edição (A–D só);
--   * repetido não volta: mesmo link normalizado (ch_url_norm: sem #…, sem utm_*, sem :443, host em minúsculas) ou mesmo
--     SHA-256 de fonte cadastrada, endereço vigiado, documento da Central ou candidato (aguardando, aprovado ou rejeitado);
--   * substituição de fonte: regra ÚNICA em ch_source_replacement (fonte vigente com o mesmo título e órgão, sem caixa,
--     E arquivo ou versão diferente), usada pelo aviso da tela (replaces), pela confirmação da aprovação e por
--     app_ch_register_source;
--   * função busca_fontes da Central de IAs: sem configuração salva fica DESLIGADA (não usa as variáveis de ambiente);
--     só modo sozinha (principal + reserva), sem conferentes, Ollama e Gemini recusados; de 1 a 10 buscas por pedido (nulo = padrão
--     do servidor, 5);
--   * regras recriadas com a união de todos os ramos, para a ordem das migrações não apagar nada: etapas de ch_jobs
--     (até materiais visuais, estações, Questões StaziaMed e source_search) e chaves de ai_functions (as 6 + busca_fontes).
-- Numeração (2026-10-11): 20261003009610 (antes 6400, depois 8700). Roda DEPOIS da 9540 (Central de Conteúdo), que redefine
-- ch_worker_finish, ch_worker_block, ch_worker_fail, ch_worker_checkpoint, ch_worker_next e cria os gatilhos
-- ch_jobs_worker_exit e ch_jobs_worker_enter (colunas requeue e lease). Esta migração NÃO redefine nenhuma delas: o gatilho
-- ch_jobs_source_search_dead é AFTER UPDATE e vê o status final, depois do gatilho da 9540. As funções que ela recria
-- (app_ai_summary, app_ch_register_source, ch_worker_ai_log_calls, ch_worker_ai_save_function e ch_worker_ai_save_price)
-- partem da versão mais nova que existe (5200 e 1400): nenhuma migração, até a 9540, as recria de novo. Quem criar outra
-- migração depois desta que mexa nelas parte do corpo desta.
-- Pode ser colada mais de uma vez no Supabase (create ... if not exists, create or replace, drop ... if exists, sites
-- da lista com on conflict do nothing): colar de novo não apaga busca, candidato nem site que o dono já mexeu.
-- Migração aplicada antes desta que acrescente etapas de ch_jobs ou chaves de ai_functions (ex.: a 8400 da auditoria das
-- questões) obriga esta a trazer esses valores também.
-- Estados da busca: na_fila, buscando, conferindo, concluida, nada_encontrado, pendente, falhou.
-- Estados do candidato: aguardando, aprovado, rejeitado. Tipos de site: governo, internacional, sociedade.
-- =============================================================================

-- ---------------------------------------------------------------- fila: etapa nova (união com os outros ramos)
alter table public.ch_jobs drop constraint if exists ch_jobs_step_check;
alter table public.ch_jobs add constraint ch_jobs_step_check
  check (step in ('extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index', 'visual_render',
                  'station_pages', 'station_segment', 'station_draft',
                  'question_generate', 'question_check', 'question_source',
                  'source_search'));

-- ---------------------------------------------------------------- Central de IAs: função nova, buscas e preço por busca
alter table public.ai_functions drop constraint if exists ai_functions_key_check;
alter table public.ai_functions add constraint ai_functions_key_check
  check (key in ('criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar', 'busca_fontes'));
-- máximo de buscas na internet por pedido (só busca_fontes; nulo = padrão do servidor)
alter table public.ai_functions add column if not exists max_searches smallint check (max_searches is null or max_searches between 1 and 10);
-- preço por busca na internet (dólares por busca), além do preço por token
alter table public.ai_model_prices add column if not exists per_search_usd numeric(12, 6) check (per_search_usd is null or per_search_usd >= 0);
alter table public.ai_calls add column if not exists web_searches integer not null default 0 check (web_searches >= 0);

-- ---------------------------------------------------------------- fontes: aprovação editorial com quem e quando
alter table public.ch_sources add column if not exists editorial_approved_by uuid references auth.users (id) on delete set null;
alter table public.ch_sources add column if not exists editorial_approved_at timestamptz;

-- ---------------------------------------------------------------- sites oficiais
create table if not exists public.ch_official_domains (
  id uuid primary key default gen_random_uuid(),
  -- sem https://, minúsculas, só ASCII; host (subdomínios valem) e, se houver, o começo do caminho
  address text not null unique check (char_length(address) <= 200
    and address ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/[a-z0-9._~-]+)*$'),
  institution text not null check (char_length(btrim(institution)) between 2 and 200),
  kind text not null check (kind in ('governo', 'internacional', 'sociedade')),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ch_official_domains (address, institution, kind) values
  ('www.gov.br/saude', 'Ministério da Saúde', 'governo'),
  ('bvsms.saude.gov.br', 'Biblioteca Virtual em Saúde do Ministério da Saúde', 'governo'),
  ('www.gov.br/conitec', 'Conitec', 'governo'),
  ('www.gov.br/inca', 'INCA', 'governo'),
  ('www.gov.br/anvisa', 'Anvisa', 'governo'),
  ('who.int', 'Organização Mundial da Saúde', 'internacional'),
  ('paho.org', 'Organização Pan-Americana da Saúde', 'internacional'),
  ('iris.paho.org', 'Repositório IRIS da OPAS', 'internacional'),
  ('febrasgo.org.br', 'Febrasgo', 'sociedade'),
  ('sbp.com.br', 'Sociedade Brasileira de Pediatria', 'sociedade'),
  ('portal.cardiol.br', 'Sociedade Brasileira de Cardiologia', 'sociedade')
on conflict (address) do nothing;

-- ---------------------------------------------------------------- buscas (uma por tema)
create table if not exists public.ch_source_searches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users (id) on delete cascade,
  -- nulo = todas as áreas
  area text check (area is null or area in ('CLINICA_MEDICA', 'CIRURGIA_GERAL', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MEDICINA_FAMILIA_COMUNIDADE')),
  theme text not null check (char_length(btrim(theme)) between 1 and 120),
  free_text text check (free_text is null or char_length(free_text) <= 300),
  -- tema escrito pelo dono ou escolhido pela incidência oficial ("temas mais cobrados")
  origin text not null check (origin in ('tema', 'incidencia')),
  status text not null default 'na_fila'
    check (status in ('na_fila', 'buscando', 'conferindo', 'concluida', 'nada_encontrado', 'pendente', 'falhou')),
  job_id uuid references public.ch_jobs (id) on delete set null,
  -- execução da Central de IAs (ai_calls.run_id), IA e modelo que responderam
  run_id uuid,
  provider text check (provider is null or provider in ('anthropic', 'openai', 'gemini', 'ollama')),
  model text check (model is null or char_length(model) <= 120),
  web_searches integer not null default 0 check (web_searches >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  found_count integer not null default 0 check (found_count >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  discarded_count integer not null default 0 check (discarded_count >= 0),
  -- [{link, titulo, motivo}]
  discarded jsonb not null default '[]'::jsonb check (jsonb_typeof(discarded) = 'array'),
  message text check (message is null or char_length(message) <= 1000),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ch_source_searches_created_idx on public.ch_source_searches (created_at desc);
create index if not exists ch_source_searches_job_idx on public.ch_source_searches (job_id);

-- ---------------------------------------------------------------- candidatos ("aguardando sua conferência")
create table if not exists public.ch_source_candidates (
  id uuid primary key default gen_random_uuid(),
  -- a busca pode sair; o candidato (e o "não volta" do rejeitado) fica
  search_id uuid references public.ch_source_searches (id) on delete set null,
  domain_id uuid references public.ch_official_domains (id) on delete set null,
  -- o site como estava na hora do achado
  site_address text not null,
  site_kind text not null check (site_kind in ('governo', 'internacional', 'sociedade')),
  site_institution text not null,
  requested_url text not null check (char_length(requested_url) between 10 and 2000),
  final_url text not null check (char_length(final_url) between 10 and 2000),
  url_norm text not null unique,
  final_url_norm text not null,
  -- o que a IA disse (nunca troca sozinho o que o dono edita)
  ai_title text check (char_length(ai_title) <= 300),
  ai_institution text check (char_length(ai_institution) <= 200),
  ai_published text check (char_length(ai_published) <= 40),
  ai_nature text check (char_length(ai_nature) <= 80),
  ai_kind text check (char_length(ai_kind) <= 40),
  ai_level text check (ai_level is null or ai_level in ('A', 'B', 'C', 'D')),
  ai_reason text check (char_length(ai_reason) <= 300),
  -- o que o servidor achou no arquivo
  file_title text check (char_length(file_title) <= 300),
  file_date text check (char_length(file_date) <= 40),
  quote text not null check (char_length(quote) between 20 and 400),
  quote_page integer check (quote_page is null or quote_page > 0),
  -- o link apareceu nos resultados da busca da IA (só um sinal; o que prova é o trecho no arquivo)
  seen_in_search boolean not null default false,
  file_kind text not null check (file_kind in ('pdf', 'html')),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  page_count integer check (page_count is null or page_count > 0),
  -- arquivo guardado no depósito privado content-hub; nulo depois da rejeição (o SHA-256 e o link ficam)
  storage_path text check (storage_path is null or storage_path ~ '^source-candidates/[0-9a-f]{64}\.(pdf|html)$'),
  preview text check (char_length(preview) <= 6000),
  suggested_level text not null check (suggested_level in ('A', 'B', 'C', 'D')),
  suggested_kind text not null check (suggested_kind in ('final', 'public_consultation', 'preliminary', 'rectification', 'society_guideline')),
  suggested_nature text check (suggested_nature is null or suggested_nature in (
    'GUIDELINE', 'PCDT', 'LAW', 'MANUAL', 'CONSENSUS', 'ARTICLE', 'SYSTEMATIC_REVIEW', 'BOOK', 'OFFICIAL_EXAM', 'OFFICIAL_ANSWER_KEY',
    'VIDEO', 'AUDIO', 'WEB_PAGE', 'SLIDES', 'DOCUMENT', 'OTHER')),
  -- dados ajustados pelo dono: institution, title, version, published_on, kind, nature, level, area, theme, valid_until
  edited jsonb not null default '{}'::jsonb check (jsonb_typeof(edited) = 'object'),
  status text not null default 'aguardando' check (status in ('aguardando', 'aprovado', 'rejeitado')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000),
  source_id uuid references public.ch_sources (id) on delete set null,
  document_id uuid references public.ch_documents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ch_source_candidates_status_idx on public.ch_source_candidates (status, created_at desc);
create index if not exists ch_source_candidates_final_url_idx on public.ch_source_candidates (final_url_norm);
create index if not exists ch_source_candidates_search_idx on public.ch_source_candidates (search_id);

-- ---------------------------------------------------------------- RLS: sites para a equipe; buscas e candidatos só administrador
alter table public.ch_official_domains enable row level security;
alter table public.ch_source_searches enable row level security;
alter table public.ch_source_candidates enable row level security;
drop policy if exists "sites oficiais: equipe lê" on public.ch_official_domains;
create policy "sites oficiais: equipe lê" on public.ch_official_domains for select to authenticated using (public.is_staff());
drop policy if exists "buscas de fontes: administrador lê" on public.ch_source_searches;
create policy "buscas de fontes: administrador lê" on public.ch_source_searches for select to authenticated using (public.is_admin());
drop policy if exists "fontes encontradas: administrador lê" on public.ch_source_candidates;
create policy "fontes encontradas: administrador lê" on public.ch_source_candidates for select to authenticated using (public.is_admin());
-- escrita só pelas funções abaixo

-- ---------------------------------------------------------------- apoio
-- Link normalizado para achar repetidos: esquema e host em minúsculas (usuário e senha, se houver, ficam como vieram),
-- sem "#…", sem parâmetros cujo nome começa por utm_ (sem caixa), sem ":443" e sem "?" vazio. Pedaços vazios entre "&"
-- também saem (?a=1&&b=2 vira ?a=1&b=2 e ?a=1& vira ?a=1). O caminho e os outros parâmetros ficam como vieram (nada é
-- decodificado nem reordenado, e nenhuma "/" é acrescentada). Texto que não parece link volta só sem "#…" e sem espaços
-- nas pontas; vazio volta nulo. A versão do servidor (normalizeLink) segue esta mesma regra.
create or replace function public.ch_url_norm(p_url text) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  v text := split_part(btrim(coalesce(p_url, '')), '#', 1);
  m text[];
  v_host text;
  v_query text;
begin
  if v = '' then return null; end if;
  m := regexp_match(v, '^([A-Za-z][A-Za-z0-9+.-]*)://([^/?]*)([^?]*)(\?(.*))?$');
  if m is null then return v; end if;
  v_host := case when position('@' in m[2]) > 0
                 then substring(m[2] from '^(.*@)') || lower(substring(m[2] from '@([^@]*)$'))
                 else lower(m[2]) end;
  v_host := regexp_replace(v_host, ':443$', '');
  select string_agg(x.part, '&' order by x.i) into v_query
    from unnest(string_to_array(coalesce(m[5], ''), '&')) with ordinality as x(part, i)
   where x.part <> '' and lower(x.part) !~ '^utm_';
  return lower(m[1]) || '://' || v_host || m[3] || coalesce('?' || nullif(v_query, ''), '');
end
$$;

-- Regra ÚNICA de substituição de fonte (aviso da tela, confirmação da aprovação e app_ch_register_source): a fonte vigente
-- mais recente com o mesmo título e o mesmo órgão (sem caixa) é substituída quando o arquivo (SHA-256) ou a versão é
-- diferente. Devolve o id da fonte que seria substituída, ou nulo. p_exclude: a própria fonte recém-gravada.
create or replace function public.ch_source_replacement(p_title text, p_organ text, p_sha256 text, p_version text, p_exclude uuid default null)
  returns uuid
  language sql stable security definer set search_path = ''
as $$
  select x.id
    from (select s.id, s.sha256, s.version
            from public.ch_sources s
           where s.status = 'current' and s.id is distinct from p_exclude
             and lower(s.title) = lower(btrim(p_title)) and lower(s.organ) = lower(btrim(p_organ))
           order by s.created_at desc
           limit 1) x
   where x.sha256 is distinct from nullif(p_sha256, '') or x.version is distinct from nullif(p_version, '')
$$;

-- Um candidato como a tela mostra: as colunas, a busca de onde veio e a fonte vigente que a aprovação substituiria
-- (com o que o dono editou antes do que a IA disse; só enquanto aguarda).
create or replace function public.ch_source_candidate_item(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select to_jsonb(c) || jsonb_build_object(
           'search', (select jsonb_build_object('theme', s.theme, 'area', s.area, 'created_at', s.created_at, 'provider', s.provider, 'model', s.model)
                        from public.ch_source_searches s where s.id = c.search_id),
           'replaces', case when c.status = 'aguardando' then (
             select jsonb_build_object('id', x.id, 'title', x.title, 'version', x.version)
               from public.ch_sources x
              where x.id = public.ch_source_replacement(coalesce(nullif(btrim(c.edited ->> 'title'), ''), c.ai_title),
                                                        coalesce(nullif(btrim(c.edited ->> 'institution'), ''), c.ai_institution),
                                                        c.sha256, c.edited ->> 'version')) end)
    from public.ch_source_candidates c
   where c.id = p_id
$$;

-- ---------------------------------------------------------------- cadastro de fonte: a substituição passa pela regra única
-- Corpo de 20261003001400_content_hub.sql (nenhuma migração posterior a redefiniu); muda só a escolha da fonte substituída,
-- que agora vem de ch_source_replacement. "superseded" volta nulo quando nada foi substituído.
create or replace function public.app_ch_register_source(p_source jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_old public.ch_sources;
  v_old_id uuid;
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

  -- Nova versão do mesmo documento (mesmo título e órgão, arquivo ou versão diferente): a anterior é substituída e quem
  -- dependia dela é sinalizado.
  v_old_id := public.ch_source_replacement(p_source ->> 'title', p_source ->> 'organ', p_source ->> 'sha256', p_source ->> 'version', v_id);
  if v_old_id is not null then
    select * into v_old from public.ch_sources where id = v_old_id;
    update public.ch_sources set status = 'superseded', superseded_by = v_id where id = v_old.id;
    v_candidates := public.ch_flag_dependents(v_old.id, 'Fonte substituída: ' || coalesce(v_old.version, 'versão anterior') || ' → ' || coalesce(p_source ->> 'version', 'nova versão'));
  end if;
  perform public.ch_log('source.register', v_id::text, jsonb_build_object('title', p_source ->> 'title', 'candidates', v_candidates));
  return jsonb_build_object('id', v_id, 'superseded', v_old_id, 'candidate_versions', v_candidates);
end
$$;

-- ---------------------------------------------------------------- tela: sites oficiais
create or replace function public.app_ch_official_domains() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(to_jsonb(d) order by array_position(array['governo', 'internacional', 'sociedade'], d.kind), d.address)
                     from public.ch_official_domains d), '[]'::jsonb);
end
$$;

-- p_domain = {id?, address, institution, kind, active}. Sem id cria; com id altera (active omitido mantém o atual).
create or replace function public.app_ch_save_official_domain(p_domain jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_official_domains;
  v_id uuid;
  v_address text;
  v_institution text;
  v_kind text;
  v_active boolean;
begin
  perform public.assert_admin();
  if p_domain is null or jsonb_typeof(p_domain) <> 'object' then raise exception 'Dados do site inválidos.' using errcode = '22023'; end if;
  v_id := nullif(p_domain ->> 'id', '')::uuid;
  v_address := regexp_replace(regexp_replace(lower(btrim(coalesce(p_domain ->> 'address', ''))), '^https?://', ''), '/+$', '');
  v_institution := btrim(coalesce(p_domain ->> 'institution', ''));
  v_kind := btrim(coalesce(p_domain ->> 'kind', ''));
  v_active := (p_domain ->> 'active')::boolean;
  if v_address = '' then raise exception 'Informe o endereço do site (ex.: gov.br/saude).' using errcode = '22023'; end if;
  if octet_length(v_address) <> char_length(v_address) or v_address ~ '[^a-z0-9./_~-]' then
    raise exception 'Endereço do site: use só letras sem acento, números, ponto, hífen e barra.' using errcode = '22023';
  end if;
  if char_length(v_address) > 200 or v_address !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/[a-z0-9._~-]+)*$' then
    raise exception 'Endereço do site inválido: escreva como gov.br/saude (sem https://).' using errcode = '22023';
  end if;
  if char_length(v_institution) not between 2 and 200 then
    raise exception 'Informe a instituição do site (de 2 a 200 caracteres).' using errcode = '22023';
  end if;
  if v_kind not in ('governo', 'internacional', 'sociedade') then
    raise exception 'Tipo do site: governo, internacional ou sociedade.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ch_official_domains d where d.address = v_address and d.id is distinct from v_id) then
    raise exception 'Este site já está na lista.' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.ch_official_domains (address, institution, kind, active, created_by, updated_by)
    values (v_address, v_institution, v_kind, coalesce(v_active, true), (select auth.uid()), (select auth.uid()))
    returning * into v;
  else
    update public.ch_official_domains
       set address = v_address, institution = v_institution, kind = v_kind, active = coalesce(v_active, active),
           updated_by = (select auth.uid()), updated_at = now()
     where id = v_id
     returning * into v;
    if not found then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;
  end if;
  perform public.ch_log('source_domain.save', v.id::text,
                        jsonb_build_object('address', v.address, 'institution', v.institution, 'kind', v.kind, 'active', v.active, 'created', v_id is null));
  return to_jsonb(v);
end
$$;

-- ---------------------------------------------------------------- tela: pedir busca e acompanhar
-- p_request = {area (nula = todas), theme, top_themes (1 a 10), free_text}: exatamente um entre tema e "temas mais cobrados"
-- (JSON null conta como ausente). Uma busca por tema, cada uma com o seu trabalho na fila (sem documento). Busca igual
-- (área, tema e texto livre, sem caixa) que ainda está andando não se repete: volta a existente com duplicate = true.
-- "Andando" = estado não final E a tarefa da fila ainda viva: busca cuja tarefa morreu (dead/failed) não bloqueia o pedido.
create or replace function public.app_ch_source_search_start(p_request jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_area text;
  v_theme text;
  v_top jsonb;
  v_top_n numeric;
  v_free text;
  v_themes text[];
  v_origin text;
  v_item text;
  v_dup public.ch_source_searches;
  v_id uuid;
  v_job uuid;
  v_out jsonb := '[]'::jsonb;
begin
  perform public.assert_admin();
  if p_request is null or jsonb_typeof(p_request) <> 'object' then raise exception 'Pedido de busca inválido.' using errcode = '22023'; end if;
  v_area := nullif(btrim(coalesce(p_request ->> 'area', '')), '');
  if v_area is not null and v_area not in ('CLINICA_MEDICA', 'CIRURGIA_GERAL', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MEDICINA_FAMILIA_COMUNIDADE') then
    raise exception 'Área inválida: %.', v_area using errcode = '22023';
  end if;
  v_theme := nullif(btrim(coalesce(p_request ->> 'theme', '')), '');
  v_top := nullif(p_request -> 'top_themes', 'null'::jsonb);
  v_free := nullif(btrim(coalesce(p_request ->> 'free_text', '')), '');
  if (v_theme is null) = (v_top is null) then
    raise exception 'Escolha um tema ou ''temas mais cobrados''.' using errcode = '22023';
  end if;
  if v_free is not null and char_length(v_free) > 300 then raise exception 'O texto livre pode ter até 300 caracteres.' using errcode = '22023'; end if;

  if v_theme is not null then
    if char_length(v_theme) > 120 then raise exception 'O tema pode ter até 120 caracteres.' using errcode = '22023'; end if;
    v_themes := array[v_theme];
    v_origin := 'tema';
  else
    if jsonb_typeof(v_top) <> 'number' then raise exception 'Temas mais cobrados: escolha de 1 a 10.' using errcode = '22023'; end if;
    v_top_n := (v_top #>> '{}')::numeric;
    if v_top_n <> trunc(v_top_n) or v_top_n not between 1 and 10 then
      raise exception 'Temas mais cobrados: escolha de 1 a 10.' using errcode = '22023';
    end if;
    -- incidência oficial na hora do pedido (a fila roda sem usuário): os temas que a área tem, até o número pedido
    v_themes := array(select left(btrim(r.item ->> 'key'), 120)
                        from jsonb_array_elements(public.app_incidence('topic', v_area) -> 'rows') with ordinality as r(item, i)
                       where nullif(btrim(r.item ->> 'key'), '') is not null
                       order by r.i
                       limit v_top_n::int);
    if coalesce(array_length(v_themes, 1), 0) = 0 then
      raise exception 'Não há questões oficiais catalogadas nesta área para escolher os temas mais cobrados.' using errcode = '22023';
    end if;
    v_origin := 'incidencia';
  end if;

  foreach v_item in array v_themes loop
    select s.* into v_dup from public.ch_source_searches s
      join public.ch_jobs j on j.id = s.job_id and j.status not in ('dead', 'failed')
     where s.area is not distinct from v_area and lower(s.theme) = lower(v_item)
       and lower(coalesce(s.free_text, '')) = lower(coalesce(v_free, ''))
       and s.status in ('na_fila', 'buscando', 'conferindo', 'pendente')
     order by s.created_at desc
     limit 1;
    if found then
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_dup.id, 'theme', v_dup.theme, 'duplicate', true));
      continue;
    end if;
    insert into public.ch_source_searches (requested_by, area, theme, free_text, origin)
    values ((select auth.uid()), v_area, v_item, v_free, v_origin)
    returning id into v_id;
    insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts)
    values (null, 'source_search', 'search:' || v_id::text, 'source_search:' || v_id::text, '{}'::jsonb, 2)
    returning id into v_job;
    update public.ch_source_searches set job_id = v_job where id = v_id;
    perform public.ch_log('source_search.request', v_id::text,
                          jsonb_build_object('area', v_area, 'theme', v_item, 'free_text', v_free, 'origin', v_origin, 'job_id', v_job));
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'theme', v_item, 'duplicate', false));
  end loop;
  return jsonb_build_object('searches', v_out);
end
$$;

-- Buscas recentes, com a situação do trabalho na fila.
create or replace function public.app_ch_source_searches(p_limit integer default 20) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(x.item order by x.created_at desc, x.id)
      from (select s.id, s.created_at, to_jsonb(s) || jsonb_build_object('job_status', j.status, 'job_error', j.error) as item
              from public.ch_source_searches s
              left join public.ch_jobs j on j.id = s.job_id
             order by s.created_at desc, s.id
             limit greatest(1, least(coalesce(p_limit, 20), 100))) x), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- tela: candidatos
-- Ordem: governo brasileiro primeiro, depois a data mais recente (a editada, a que a IA disse, a achada no arquivo), depois
-- os mais novos. Até 200 por situação; os contadores contam todos.
create or replace function public.app_ch_source_candidates(p_status text default 'aguardando') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_status text := coalesce(nullif(btrim(p_status), ''), 'aguardando');
begin
  perform public.assert_admin();
  if v_status not in ('aguardando', 'aprovado', 'rejeitado') then raise exception 'Situação inválida: %.', v_status using errcode = '22023'; end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(public.ch_source_candidate_item(x.id) order by x.ord)
        from (select c.id,
                     row_number() over (order by (c.site_kind = 'governo') desc,
                                                 coalesce(nullif(c.edited ->> 'published_on', ''), nullif(c.ai_published, ''), nullif(c.file_date, '')) desc nulls last,
                                                 c.created_at desc, c.id) as ord
                from public.ch_source_candidates c
               where c.status = v_status
               order by ord
               limit 200) x), '[]'::jsonb),
    'counts', jsonb_build_object(
      'aguardando', (select count(*)::int from public.ch_source_candidates where status = 'aguardando'),
      'aprovado', (select count(*)::int from public.ch_source_candidates where status = 'aprovado'),
      'rejeitado', (select count(*)::int from public.ch_source_candidates where status = 'rejeitado')));
end
$$;

create or replace function public.app_ch_source_candidate(p_candidate_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.assert_admin();
  r := public.ch_source_candidate_item(p_candidate_id);
  if r is null then raise exception 'Candidato não encontrado.' using errcode = 'P0002'; end if;
  return r;
end
$$;

-- Ajustes do dono antes de decidir: só as chaves da conferência entram em "edited" (as outras são ignoradas); valor vazio
-- ou nulo tira a chave. Datas inteiras (AAAA-MM-DD): ano sozinho não vira data. Nível E nunca.
create or replace function public.app_ch_source_candidate_save(p_candidate_id uuid, p_fields jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_source_candidates;
  v_edited jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_date_ok boolean;
begin
  perform public.assert_admin();
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'Dados inválidos.' using errcode = '22023'; end if;
  select * into c from public.ch_source_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Candidato não encontrado.' using errcode = 'P0002'; end if;
  if c.status <> 'aguardando' then raise exception 'Este candidato já foi decidido.' using errcode = '22023'; end if;
  v_edited := c.edited;
  foreach v_key in array array['institution', 'title', 'version', 'published_on', 'kind', 'nature', 'level', 'area', 'theme', 'valid_until'] loop
    continue when not (p_fields ? v_key);
    v_val := nullif(btrim(coalesce(p_fields ->> v_key, '')), '');
    if v_val is null then
      v_edited := v_edited - v_key;
    else
      if v_key = 'level' then
        v_val := upper(v_val);
        if v_val = 'E' then raise exception 'Nível E não entra pela busca: escolha de A a D.' using errcode = '22023'; end if;
        if v_val not in ('A', 'B', 'C', 'D') then raise exception 'Escolha o nível de A a D.' using errcode = '22023'; end if;
      elsif v_key = 'kind' then
        if v_val not in ('final', 'public_consultation', 'preliminary', 'rectification', 'society_guideline') then
          raise exception 'Tipo de fonte inválido.' using errcode = '22023';
        end if;
      elsif v_key = 'nature' then
        if v_val not in ('GUIDELINE', 'PCDT', 'LAW', 'MANUAL', 'CONSENSUS', 'ARTICLE', 'SYSTEMATIC_REVIEW', 'BOOK', 'OFFICIAL_EXAM',
                         'OFFICIAL_ANSWER_KEY', 'VIDEO', 'AUDIO', 'WEB_PAGE', 'SLIDES', 'DOCUMENT', 'OTHER') then
          raise exception 'Natureza da fonte inválida.' using errcode = '22023';
        end if;
      elsif v_key = 'area' then
        if v_val not in ('CLINICA_MEDICA', 'CIRURGIA_GERAL', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MEDICINA_FAMILIA_COMUNIDADE') then
          raise exception 'Área inválida: %.', v_val using errcode = '22023';
        end if;
      elsif v_key in ('published_on', 'valid_until') then
        begin
          v_date_ok := v_val ~ '^\d{4}-\d{2}-\d{2}$' and to_char(v_val::date, 'YYYY-MM-DD') = v_val;
        exception when others then
          v_date_ok := false;
        end;
        if not v_date_ok then
          raise exception '%: use uma data válida no formato AAAA-MM-DD.', case v_key when 'published_on' then 'Data de publicação' else 'Vigência' end
            using errcode = '22023';
        end if;
      elsif v_key = 'title' and char_length(v_val) > 300 then
        raise exception 'O título pode ter até 300 caracteres.' using errcode = '22023';
      elsif v_key = 'institution' and char_length(v_val) > 200 then
        raise exception 'A instituição pode ter até 200 caracteres.' using errcode = '22023';
      elsif v_key = 'version' and char_length(v_val) > 60 then
        raise exception 'A versão pode ter até 60 caracteres.' using errcode = '22023';
      elsif v_key = 'theme' and char_length(v_val) > 120 then
        raise exception 'O tema pode ter até 120 caracteres.' using errcode = '22023';
      end if;
      v_edited := v_edited || jsonb_build_object(v_key, v_val);
    end if;
    v_changed := v_changed || jsonb_build_object(v_key, v_val);
  end loop;
  update public.ch_source_candidates set edited = v_edited where id = c.id;
  perform public.ch_log('source_candidate.edit', c.id::text, jsonb_build_object('fields', v_changed));
  return public.ch_source_candidate_item(c.id);
end
$$;

-- ---------------------------------------------------------------- processamento (servidor)
-- A busca e os sites ATIVOS da lista (a IA só procura neles; o servidor confere cada link de novo).
create or replace function public.ch_worker_source_search_get(p_search_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select to_jsonb(s) || jsonb_build_object('domains', coalesce((
           select jsonb_agg(jsonb_build_object('id', d.id, 'address', d.address, 'institution', d.institution, 'kind', d.kind)
                            order by array_position(array['governo', 'internacional', 'sociedade'], d.kind), d.address)
             from public.ch_official_domains d
            where d.active), '[]'::jsonb))
    from public.ch_source_searches s
   where s.id = p_search_id
$$;

-- Só as chaves presentes em p_patch mudam: status, message, provider, model, run_id, web_searches, cost_usd, found_count,
-- verified_count, discarded ([{link, titulo, motivo}]; discarded_count = tamanho da lista). Ao chegar a um estado final
-- (concluida, nada_encontrado, falhou) grava finished_at e o resultado no registro (ch_audit, em nome de quem pediu).
create or replace function public.ch_worker_source_search_update(p_search_id uuid, p_patch jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.ch_source_searches;
  v_old_status text;
  v_status text;
  v_final constant text[] := array['concluida', 'nada_encontrado', 'falhou'];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Alteração da busca inválida.' using errcode = '22023'; end if;
  select * into s from public.ch_source_searches where id = p_search_id for update;
  if not found then raise exception 'Busca não encontrada.' using errcode = 'P0002'; end if;
  v_old_status := s.status;
  v_status := case when p_patch ? 'status' then p_patch ->> 'status' else s.status end;
  if v_status is null or v_status not in ('na_fila', 'buscando', 'conferindo', 'concluida', 'nada_encontrado', 'pendente', 'falhou') then
    raise exception 'Situação da busca inválida: %.', v_status using errcode = '22023';
  end if;
  if p_patch ? 'discarded' and jsonb_typeof(p_patch -> 'discarded') <> 'array' then
    raise exception 'Lista de descartados inválida.' using errcode = '22023';
  end if;
  update public.ch_source_searches
     set status = v_status,
         message = case when p_patch ? 'message' then left(p_patch ->> 'message', 1000) else message end,
         provider = case when p_patch ? 'provider' then p_patch ->> 'provider' else provider end,
         model = case when p_patch ? 'model' then left(p_patch ->> 'model', 120) else model end,
         run_id = case when p_patch ? 'run_id' then (p_patch ->> 'run_id')::uuid else run_id end,
         web_searches = case when p_patch ? 'web_searches' then coalesce((p_patch ->> 'web_searches')::integer, 0) else web_searches end,
         cost_usd = case when p_patch ? 'cost_usd' then coalesce((p_patch ->> 'cost_usd')::numeric, 0) else cost_usd end,
         found_count = case when p_patch ? 'found_count' then coalesce((p_patch ->> 'found_count')::integer, 0) else found_count end,
         verified_count = case when p_patch ? 'verified_count' then coalesce((p_patch ->> 'verified_count')::integer, 0) else verified_count end,
         discarded = case when p_patch ? 'discarded' then p_patch -> 'discarded' else discarded end,
         discarded_count = case when p_patch ? 'discarded' then jsonb_array_length(p_patch -> 'discarded') else discarded_count end,
         finished_at = case when v_status <> all (v_final) then null
                            when v_old_status = any (v_final) and finished_at is not null then finished_at
                            else now() end
   where id = s.id
   returning * into s;
  if s.status = any (v_final) and v_old_status <> all (v_final) then
    insert into public.ch_audit (actor_id, action, target, details)
    values (s.requested_by, 'source_search.result', s.id::text,
            jsonb_build_object('status', s.status, 'message', s.message, 'found_count', s.found_count, 'verified_count', s.verified_count,
                               'discarded_count', s.discarded_count, 'web_searches', s.web_searches, 'cost_usd', s.cost_usd,
                               'provider', s.provider, 'model', s.model, 'run_id', s.run_id));
  end if;
end
$$;

-- Tarefa da busca que morreu (tentativas esgotadas) sem o processamento fechar a busca. A fila encerra a tarefa sozinha,
-- só no SQL, quando a execução cai nas 2 tentativas (ch_worker_claim: "Interrompido sem concluir."), ou no último erro
-- (ch_worker_finish / ch_worker_fail). A busca ainda andando vai a "falhou" com o motivo da tarefa (finished_at e registro
-- em nome de quem pediu, por ch_worker_source_search_update). Busca já em estado final (o processamento já gravou o motivo
-- dele) fica como está. Gatilho em vez de refazer ch_worker_claim/ch_worker_finish, que outros ramos também redefinem
-- (as estações trocam ch_worker_claim por outra versão). A fila acrescenta "Interrompido sem concluir." a cada recuperação
-- ("Interrompido sem concluir. Falha anterior: Interrompido sem concluir."): a busca mostra essa frase uma vez só.
-- Tentar de novo a tarefa morta (app_ch_retry_job) não reabre a busca: o caminho é pedir a mesma busca outra vez.
create or replace function public.ch_source_search_job_dead() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_message text;
begin
  v_message := coalesce(
    nullif(regexp_replace(btrim(coalesce(new.error, '')),
                          '^(Interrompido sem concluir\.)( Falha anterior: Interrompido sem concluir\.)+$', '\1'), ''),
    'A tarefa parou sem concluir.');
  for v_id in
    select s.id from public.ch_source_searches s
     where s.job_id = new.id and s.status not in ('concluida', 'nada_encontrado', 'falhou')
  loop
    perform public.ch_worker_source_search_update(v_id, jsonb_build_object('status', 'falhou', 'message', v_message));
  end loop;
  return null;
end
$$;
drop trigger if exists ch_jobs_source_search_dead on public.ch_jobs;
create trigger ch_jobs_source_search_dead
  after update of status on public.ch_jobs
  for each row
  when (new.step = 'source_search' and new.status in ('dead', 'failed') and old.status is distinct from new.status)
  execute function public.ch_source_search_job_dead();

-- Já conhecido? Nulo = novo. Pelo link normalizado e/ou pelo SHA-256 (qualquer um pode vir nulo), nesta ordem.
create or replace function public.ch_worker_source_known(p_url text, p_sha256 text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_norm text := public.ch_url_norm(p_url);
  v_sha text := lower(nullif(btrim(coalesce(p_sha256, '')), ''));
  v_status text;
begin
  if v_norm is null and v_sha is null then return null; end if;
  if exists (select 1 from public.ch_sources s
              where (v_sha is not null and s.sha256 = v_sha)
                 or (v_norm is not null and s.url is not null and public.ch_url_norm(s.url) = v_norm)) then
    return 'Repetido: fonte já cadastrada.';
  end if;
  if v_norm is not null and exists (select 1 from public.ch_source_watch w where public.ch_url_norm(w.url) = v_norm) then
    return 'Repetido: endereço já vigiado.';
  end if;
  if v_sha is not null and exists (select 1 from public.ch_documents d where d.sha256 = v_sha) then
    return 'Repetido: documento já está na Central.';
  end if;
  select c.status into v_status
    from public.ch_source_candidates c
   where (v_sha is not null and c.sha256 = v_sha)
      or (v_norm is not null and (c.url_norm = v_norm or c.final_url_norm = v_norm))
   order by array_position(array['aguardando', 'aprovado', 'rejeitado'], c.status)
   limit 1;
  return case v_status
    when 'aguardando' then 'Repetido: candidato aguardando sua conferência.'
    when 'aprovado' then 'Repetido: já aprovado antes.'
    when 'rejeitado' then 'Repetido: rejeitado antes.'
  end;
end
$$;

-- Candidato novo, "aguardando". O link (pedido e final) é normalizado aqui; o site vem da lista (domain_id) quando os
-- campos site_* não vêm. Mesmo link ou mesmo SHA-256 de outro candidato → {id do existente, duplicate: true}.
create or replace function public.ch_worker_source_candidate_create(p_candidate jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  p jsonb := p_candidate;
  d public.ch_official_domains;
  v_url text;
  v_final text;
  v_url_norm text;
  v_final_norm text;
  v_sha text;
  v_id uuid;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Candidato inválido.' using errcode = '22023'; end if;
  v_url := btrim(coalesce(p ->> 'requested_url', ''));
  v_final := coalesce(nullif(btrim(coalesce(p ->> 'final_url', '')), ''), v_url);
  v_url_norm := public.ch_url_norm(v_url);
  v_final_norm := public.ch_url_norm(v_final);
  v_sha := lower(nullif(btrim(coalesce(p ->> 'sha256', '')), ''));
  if v_url_norm is null or v_sha is null then raise exception 'Candidato sem link ou sem SHA-256.' using errcode = '22023'; end if;

  select c.id into v_id from public.ch_source_candidates c
   where c.sha256 = v_sha or c.url_norm in (v_url_norm, v_final_norm) or c.final_url_norm in (v_url_norm, v_final_norm)
   order by c.created_at
   limit 1;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;

  if nullif(p ->> 'domain_id', '') is not null then
    select * into d from public.ch_official_domains where id = (p ->> 'domain_id')::uuid;
    if not found then raise exception 'Site da lista não encontrado.' using errcode = 'P0002'; end if;
  end if;
  insert into public.ch_source_candidates (
    search_id, domain_id, site_address, site_kind, site_institution, requested_url, final_url, url_norm, final_url_norm,
    ai_title, ai_institution, ai_published, ai_nature, ai_kind, ai_level, ai_reason, file_title, file_date, quote, quote_page,
    seen_in_search, file_kind, sha256, size_bytes, page_count, storage_path, preview, suggested_level, suggested_kind, suggested_nature)
  values (
    nullif(p ->> 'search_id', '')::uuid, d.id,
    coalesce(nullif(p ->> 'site_address', ''), d.address), coalesce(nullif(p ->> 'site_kind', ''), d.kind),
    coalesce(nullif(p ->> 'site_institution', ''), d.institution),
    v_url, v_final, v_url_norm, v_final_norm,
    left(nullif(p ->> 'ai_title', ''), 300), left(nullif(p ->> 'ai_institution', ''), 200), left(nullif(p ->> 'ai_published', ''), 40),
    left(nullif(p ->> 'ai_nature', ''), 80), left(nullif(p ->> 'ai_kind', ''), 40), nullif(p ->> 'ai_level', ''),
    left(nullif(p ->> 'ai_reason', ''), 300), left(nullif(p ->> 'file_title', ''), 300), left(nullif(p ->> 'file_date', ''), 40),
    p ->> 'quote', nullif(p ->> 'quote_page', '')::integer,
    coalesce((p ->> 'seen_in_search')::boolean, false), p ->> 'file_kind', v_sha, (p ->> 'size_bytes')::bigint,
    nullif(p ->> 'page_count', '')::integer, nullif(p ->> 'storage_path', ''), left(p ->> 'preview', 6000),
    p ->> 'suggested_level', p ->> 'suggested_kind', nullif(p ->> 'suggested_nature', ''))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    -- outro processamento gravou o mesmo link ou arquivo agora mesmo
    select c.id into v_id from public.ch_source_candidates c
     where c.sha256 = v_sha or c.url_norm in (v_url_norm, v_final_norm) or c.final_url_norm in (v_url_norm, v_final_norm)
     order by c.created_at
     limit 1;
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end
$$;

-- A busca já gravou candidato para este link? (retomada: o candidato foi criado, mas o ponto da conferência não chegou a ser
-- guardado; sem isto o achado voltaria como "Repetido" de si mesmo.) Só candidato desta busca conta.
create or replace function public.ch_worker_source_search_has_candidate(p_search_id uuid, p_url text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.ch_source_candidates c
                  where c.search_id = p_search_id
                    and public.ch_url_norm(p_url) is not null
                    and (c.url_norm = public.ch_url_norm(p_url) or c.final_url_norm = public.ch_url_norm(p_url)))
$$;

-- ---------------------------------------------------------------- Central de IAs: funções recriadas com busca_fontes
-- (corpos de 20261003005200_central_de_ias.sql; nenhuma migração posterior as redefiniu)

-- p_config = null apaga a linha: as outras funções voltam às variáveis de ambiente; busca_fontes fica desligada.
-- busca_fontes: só modo sozinha, sem conferentes, sem Ollama e sem Gemini (não limita a pesquisa aos sites oficiais), max_searches nulo ou de 1 a 10. Nas outras, max_searches nulo.
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
  if p_key is null or p_key not in ('criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar', 'busca_fontes') then
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

-- Equipe: as 7 funções (sem preços nem chaves).
create or replace function public.app_ai_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'functions', (select jsonb_agg(jsonb_build_object('key', k.key, 'configured', f.key is not null, 'mode', f.mode) order by k.ord)
                    from unnest(array['criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar', 'busca_fontes'])
                         with ordinality as k(key, ord)
                    left join public.ai_functions f on f.key = k.key),
    'providers_enabled', coalesce((select jsonb_agg(id order by id) from public.ai_providers where enabled), '[]'::jsonb),
    'month_spend', public.ch_worker_ai_month_spend(now())
  );
end
$$;

-- Registro de chamadas com as buscas na internet de cada uma (web_searches, 0 quando não vem).
create or replace function public.ch_worker_ai_log_calls(p_calls jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if p_calls is null or jsonb_typeof(p_calls) <> 'array' then raise exception 'Lista de chamadas inválida.' using errcode = '22023'; end if;
  insert into public.ai_calls (created_at, run_id, actor_id, function_key, mode, role, provider, model, input_tokens, output_tokens,
                               cost_usd, duration_ms, outcome, source, item_id, error, web_searches)
  select coalesce(c.created_at, now()), c.run_id, c.actor_id, c.function_key, c.mode, c.role, c.provider, c.model,
         coalesce(c.input_tokens, 0), coalesce(c.output_tokens, 0), coalesce(c.cost_usd, 0), coalesce(c.duration_ms, 0),
         c.outcome, c.source, c.item_id, left(c.error, 1000), coalesce(c.web_searches, 0)
    from jsonb_to_recordset(p_calls) as c(created_at timestamptz, run_id uuid, actor_id uuid, function_key text, mode text, role text,
                                         provider text, model text, input_tokens integer, output_tokens integer, cost_usd numeric,
                                         duration_ms integer, outcome text, source text, item_id text, error text, web_searches integer);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Preço por busca (per_search_usd) só muda quando a chave vem em p_price (null tira o preço); os outros campos como antes.
create or replace function public.ch_worker_ai_save_price(p_actor uuid, p_provider text, p_model text, p_price jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v public.ai_model_prices;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_provider is null or p_provider not in ('anthropic', 'openai', 'gemini', 'ollama') then raise exception 'IA desconhecida: %.', p_provider using errcode = '22023'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120 then raise exception 'Modelo inválido.' using errcode = '22023'; end if;
  if p_price is null or jsonb_typeof(p_price) <> 'object' then raise exception 'Preço inválido.' using errcode = '22023'; end if;
  insert into public.ai_model_prices as cur (provider, model, input_per_mtok, output_per_mtok, per_search_usd, source_url, checked_on, updated_by, updated_at)
  values (p_provider, btrim(p_model), (p_price ->> 'input_per_mtok')::numeric, (p_price ->> 'output_per_mtok')::numeric,
          nullif(p_price ->> 'per_search_usd', '')::numeric,
          nullif(p_price ->> 'source_url', ''), nullif(p_price ->> 'checked_on', '')::date, p_actor, now())
  on conflict (provider, model) do update
     set input_per_mtok = excluded.input_per_mtok, output_per_mtok = excluded.output_per_mtok,
         per_search_usd = case when p_price ? 'per_search_usd' then excluded.per_search_usd else cur.per_search_usd end,
         source_url = excluded.source_url, checked_on = excluded.checked_on, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.price', p_provider || ':' || v.model,
          jsonb_build_object('input_per_mtok', v.input_per_mtok, 'output_per_mtok', v.output_per_mtok, 'per_search_usd', v.per_search_usd,
                             'source_url', v.source_url, 'checked_on', v.checked_on));
  return to_jsonb(v);
end
$$;

-- ---------------------------------------------------------------- aprovar e rejeitar (só administrador)
-- Aprovar é a ÚNICA porta pela qual um achado vira fonte. Quem decide é o administrador (assert_admin); o banco confere de
-- novo que o candidato ainda aguarda, que o administrador marcou "conferi o documento no arquivo guardado", que escolheu o
-- nível (A a D; o nível sugerido pela IA ou pelo tipo de site NÃO vale sozinho), que o link final do arquivo continua dentro
-- de um site ATIVO da lista, que o arquivo não entrou na Central por outro caminho e, se a fonte vigente seria substituída,
-- que o administrador confirmou. Tudo numa transação só: ou cria a fonte, o documento e o vínculo, ou não cria nada.

-- Primeiro site ATIVO da lista que contém o link: https, porta 443 (ou sem porta), host igual ao do site ou subdomínio dele
-- e, se o site tem caminho, o caminho do link começa por ele inteiro (/saude e /saude/x passam, /saudemental não). Sem
-- caixa. Nenhum site → nulo.
create or replace function public.ch_source_site_match(p_url text) returns uuid
  language sql stable security definer set search_path = ''
as $$
  with u as (
    select m[1] as host, coalesce(m[2], '') as path
      from (select regexp_match(lower(btrim(coalesce(p_url, ''))), '^https://([^/?#:@\s]+)(?::443)?(?=[/?#]|$)(/[^?#]*)?') as m) x
     where m is not null
  )
  select d.id
    from public.ch_official_domains d, u
   where d.active
     and (u.host = split_part(d.address, '/', 1)
          or right(u.host, char_length(split_part(d.address, '/', 1)) + 1) = '.' || split_part(d.address, '/', 1))
     and (position('/' in d.address) = 0
          or u.path = substr(d.address, position('/' in d.address))
          or left(u.path, char_length(substr(d.address, position('/' in d.address))) + 1) = substr(d.address, position('/' in d.address)) || '/')
   order by d.created_at, d.id
   limit 1
$$;

-- Data inteira AAAA-MM-DD válida → a data; qualquer outra coisa (ano sozinho, texto, dia que não existe) → nulo. Nada de
-- inventar o dia.
create or replace function public.ch_source_iso_date(p_text text) returns date
  language plpgsql immutable set search_path = ''
as $$
begin
  if p_text is null or btrim(p_text) !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  if to_char(btrim(p_text)::date, 'YYYY-MM-DD') <> btrim(p_text) then return null; end if;
  return btrim(p_text)::date;
exception when others then
  return null;
end
$$;

-- p_fields: as chaves de edição (institution, title, version, published_on, kind, nature, level, area, theme, valid_until),
-- que passam pelas mesmas regras de app_ch_source_candidate_save e ficam guardadas no candidato, mais checked (verdadeiro,
-- booleano) e confirm_replace (verdadeiro, booleano). Vale o que o administrador mandou, depois o que ele já tinha salvo,
-- depois o que a IA disse (título e órgão) ou o servidor achou (data inteira no arquivo). Tipo: o salvo ou o sugerido.
-- Natureza: a salva ou a sugerida (nunca o texto livre da IA). Nível, área e tema: só os que o administrador escolheu.
create or replace function public.app_ch_source_candidate_approve(p_candidate_id uuid, p_fields jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_source_candidates;
  s public.ch_source_searches;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  e jsonb;
  v_title text;
  v_organ text;
  v_kind text;
  v_nature text;
  v_level text;
  v_version text;
  v_published date;
  v_valid date;
  v_year text;
  v_rep public.ch_sources;
  v_dup public.ch_sources;
  v_doc_name text;
  v_reg jsonb;
  v_source_id uuid;
  v_document_id uuid;
  v_day date;
begin
  perform public.assert_admin();
  if jsonb_typeof(f) <> 'object' then raise exception 'Dados inválidos.' using errcode = '22023'; end if;
  select * into c from public.ch_source_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Candidato não encontrado.' using errcode = 'P0002'; end if;
  if c.status <> 'aguardando' then raise exception 'Este candidato já foi decidido.' using errcode = '22023'; end if;
  if f -> 'checked' is distinct from 'true'::jsonb then
    raise exception 'Confirme que conferiu o documento no arquivo guardado.' using errcode = '22023';
  end if;

  -- os ajustes do formulário passam pelas regras da edição (nível E, datas, tipos...) e ficam no candidato
  perform public.app_ch_source_candidate_save(c.id, f);
  select * into c from public.ch_source_candidates where id = c.id;
  e := c.edited;

  v_level := e ->> 'level';
  if v_level is null then raise exception 'Escolha o nível de A a D.' using errcode = '22023'; end if;
  if v_level = 'E' then raise exception 'Nível E não entra pela busca: escolha de A a D.' using errcode = '22023'; end if;
  if v_level not in ('A', 'B', 'C', 'D') then raise exception 'Escolha o nível de A a D.' using errcode = '22023'; end if;

  v_title := coalesce(nullif(btrim(e ->> 'title'), ''), nullif(btrim(c.ai_title), ''));
  v_organ := coalesce(nullif(btrim(e ->> 'institution'), ''), nullif(btrim(c.ai_institution), ''), nullif(btrim(c.site_institution), ''));
  if v_title is null or v_organ is null then raise exception 'Informe título e órgão da fonte.' using errcode = '22023'; end if;

  -- o site continua na lista, ativo, e o endereço final do arquivo continua dentro dele
  if public.ch_source_site_match(c.final_url) is null then
    raise exception 'O site % saiu da lista de sites oficiais ou foi desativado: reative-o ou rejeite este candidato.', c.site_address using errcode = '22023';
  end if;
  if c.storage_path is null then
    raise exception 'O arquivo guardado não está mais disponível: rejeite este candidato e peça a busca de novo.' using errcode = '22023';
  end if;

  select d.name into v_doc_name from public.ch_documents d where d.sha256 = c.sha256 order by d.created_at limit 1;
  if found then
    raise exception 'Este arquivo já está na Central como documento "%": vincule por lá ou rejeite este candidato.', v_doc_name using errcode = '22023';
  end if;

  v_kind := coalesce(nullif(e ->> 'kind', ''), c.suggested_kind);
  v_nature := coalesce(nullif(e ->> 'nature', ''), c.suggested_nature);
  v_valid := public.ch_source_iso_date(e ->> 'valid_until');
  -- data de publicação: a do administrador; senão uma data INTEIRA achada no arquivo ou dita pela IA; ano sozinho não vira data
  v_published := coalesce(public.ch_source_iso_date(e ->> 'published_on'), public.ch_source_iso_date(c.file_date), public.ch_source_iso_date(c.ai_published));
  v_version := nullif(btrim(e ->> 'version'), '');
  if v_version is null and v_published is null then
    v_year := coalesce((regexp_match(btrim(coalesce(c.file_date, '')), '^(\d{4})$'))[1], (regexp_match(btrim(coalesce(c.ai_published, '')), '^(\d{4})$'))[1]);
    v_version := v_year;
  end if;

  -- substituição da fonte vigente: só com a confirmação do administrador (mesma regra do aviso da tela)
  v_rep := null;
  select x.* into v_rep from public.ch_sources x
   where x.id = public.ch_source_replacement(v_title, v_organ, c.sha256, v_version);
  if v_rep.id is not null and f -> 'confirm_replace' is distinct from 'true'::jsonb then
    raise exception 'Confirme a substituição: esta aprovação substitui a fonte vigente "%" (versão %).', v_rep.title, coalesce(v_rep.version, 'sem versão') using errcode = '22023';
  end if;

  -- fonte vigente que já é este mesmo arquivo (SHA-256 e versão iguais) ou este mesmo endereço, ainda que sem documento na
  -- Central: criar outra deixaria duas fontes vigentes iguais. Pede a mesma confirmação; confirmada, a anterior fica substituída.
  select x.* into v_dup from public.ch_sources x
   where x.status = 'current' and x.id is distinct from v_rep.id
     and ((x.sha256 is not null and x.sha256 = c.sha256 and x.version is not distinct from v_version)
          or (x.url is not null and public.ch_url_norm(x.url) in (public.ch_url_norm(c.final_url), public.ch_url_norm(c.requested_url))))
   order by x.created_at desc
   limit 1;
  if v_dup.id is not null and f -> 'confirm_replace' is distinct from 'true'::jsonb then
    raise exception 'Confirme a substituição: já existe a fonte vigente "%" (versão %) com o mesmo arquivo ou endereço; esta aprovação a substitui.', v_dup.title, coalesce(v_dup.version, 'sem versão') using errcode = '22023';
  end if;

  select * into s from public.ch_source_searches where id = c.search_id;
  v_day := (c.created_at at time zone 'America/Sao_Paulo')::date;

  v_reg := public.app_ch_register_source(jsonb_build_object(
    'title', v_title, 'organ', v_organ, 'kind', v_kind, 'url', c.final_url, 'version', v_version,
    'published_on', v_published, 'valid_until', v_valid, 'accessed_on', v_day, 'sha256', c.sha256, 'editorial_approved', true));
  v_source_id := (v_reg ->> 'id')::uuid;
  if v_dup.id is not null then
    update public.ch_sources set status = 'superseded', superseded_by = v_source_id where id = v_dup.id and status = 'current';
    perform public.ch_flag_dependents(v_dup.id, 'Fonte substituída: ' || coalesce(v_dup.version, 'versão anterior') || ' → ' || coalesce(v_version, 'nova versão'));
  end if;

  insert into public.ch_documents (owner_id, name, publisher, edition_date, page_count, sha256, storage_path, mime, rights_status, purpose, provenance)
  values (auth.uid(), left(v_title, 300), v_organ, v_published::text, c.page_count, c.sha256, c.storage_path,
          case c.file_kind when 'html' then 'text/html' else 'application/pdf' end, 'reference_only', 'reference_source',
          jsonb_build_object(
            'requested_url', c.requested_url, 'final_url', c.final_url, 'site', c.site_address, 'institution', c.site_institution,
            'sha256', c.sha256, 'size_bytes', c.size_bytes, 'file_kind', c.file_kind,
            'found', 'encontrado pela busca em ' || to_char(c.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
            'search_id', c.search_id, 'provider', s.provider, 'model', s.model, 'run_id', s.run_id, 'candidate_id', c.id))
  returning id into v_document_id;

  update public.ch_sources
     set authority_level = v_level, source_type = v_nature, specialty = nullif(e ->> 'area', ''), theme = nullif(e ->> 'theme', ''),
         editorial_approved_by = auth.uid(), editorial_approved_at = now(), document_id = v_document_id
   where id = v_source_id;

  update public.ch_source_candidates
     set status = 'aprovado', decided_by = auth.uid(), decided_at = now(), source_id = v_source_id, document_id = v_document_id
   where id = c.id;

  perform public.ch_log('source_candidate.approve', c.id::text,
    jsonb_build_object('source_id', v_source_id, 'document_id', v_document_id, 'level', v_level, 'site', c.site_address, 'superseded', v_reg -> 'superseded'));
  return jsonb_build_object('source_id', v_source_id, 'document_id', v_document_id, 'superseded', v_reg -> 'superseded',
                            'candidate_versions', coalesce((v_reg ->> 'candidate_versions')::int, 0), 'file_kind', c.file_kind);
end
$$;

-- Rejeitar: guarda o motivo e solta o caminho do arquivo (o servidor apaga o arquivo do depósito com o caminho devolvido);
-- o SHA-256 e o link continuam, então o mesmo achado não volta.
create or replace function public.app_ch_source_candidate_reject(p_candidate_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_source_candidates;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.assert_admin();
  if char_length(v_reason) < 10 then raise exception 'Escreva o motivo (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if char_length(v_reason) > 1000 then raise exception 'O motivo pode ter até 1000 caracteres.' using errcode = '22023'; end if;
  select * into c from public.ch_source_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Candidato não encontrado.' using errcode = 'P0002'; end if;
  if c.status <> 'aguardando' then raise exception 'Este candidato já foi decidido.' using errcode = '22023'; end if;
  update public.ch_source_candidates
     set status = 'rejeitado', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason, storage_path = null
   where id = c.id;
  perform public.ch_log('source_candidate.reject', c.id::text, jsonb_build_object('reason', v_reason, 'site', c.site_address));
  return jsonb_build_object('storage_path', c.storage_path);
end
$$;

-- Lista de fontes (corpo de 20261003002500_sqie_source_diff.sql; nenhuma migração posterior a redefiniu) com duas
-- informações novas: se a fonte foi achada pela busca (existe candidato aprovado ligado a ela) e a situação do documento de
-- referência dela.
create or replace function public.app_ch_sources() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
      'passages', (select count(*)::int from public.ch_source_passages p where p.source_id = s.id),
      'watch', (select to_jsonb(w) - 'source_id' - 'snapshot' from public.ch_source_watch w where w.source_id = s.id),
      'changes', (select count(*)::int from public.ch_source_changes c where c.source_id = s.id and c.resolved_at is null),
      'freshness', public.ch_source_freshness(s.id),
      'diffs', (select count(*)::int from public.ch_source_diffs d where d.source_id = s.id or d.new_source_id = s.id),
      'successor_passages', (select count(*)::int from public.ch_source_passages p where p.source_id = s.superseded_by),
      'found_by_search', exists (select 1 from public.ch_source_candidates k where k.source_id = s.id),
      'document_status', (select d.status from public.ch_documents d where d.id = s.document_id)) order by s.organ, s.title, s.created_at desc)
    from public.ch_sources s), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- preço por busca do catálogo (só onde está vazio)
-- Preços oficiais por busca na internet, conferidos em 2026-10-11 (server/ai/prices.ts): Claude e OpenAI US$ 0,01 por busca;
-- Gemini 3 em diante US$ 0,014 por consulta; Gemini 2.5 US$ 0,035 por prompt com busca. Preenche SÓ o que está nulo: o que o
-- dono digitou nunca é sobrescrito, e rodar de novo não muda nada.
update public.ai_model_prices p
   set per_search_usd = v.usd
  from (values
  ('anthropic', 'claude-fable-5-1', 0.01),
  ('anthropic', 'claude-opus-5-5', 0.01),
  ('anthropic', 'claude-opus-5', 0.01),
  ('anthropic', 'claude-sonnet-5-5', 0.01),
  ('anthropic', 'claude-haiku-4-5-20251001', 0.01),
  ('anthropic', 'claude-haiku-5-5', 0.01),
  ('openai', 'gpt-6-astra', 0.01),
  ('openai', 'gpt-6.1-sol', 0.01),
  ('openai', 'gpt-6-sol', 0.01),
  ('openai', 'gpt-6-luna', 0.01),
  ('openai', 'gpt-5.6-sol', 0.01),
  ('openai', 'gpt-5.6-terra', 0.01),
  ('openai', 'gpt-5.6-luna', 0.01),
  ('openai', 'gpt-5.5', 0.01),
  ('openai', 'gpt-5.4', 0.01),
  ('openai', 'gpt-5.4-mini', 0.01),
  ('openai', 'gpt-5.4-nano', 0.01),
  ('openai', 'gpt-5-mini', 0.01),
  ('gemini', 'gemini-3.8-flash', 0.014),
  ('gemini', 'gemini-3.7-flash', 0.014),
  ('gemini', 'gemini-3.6-flash', 0.014),
  ('gemini', 'gemini-3.5-flash', 0.014),
  ('gemini', 'gemini-3.5-flash-lite', 0.014),
  ('gemini', 'gemini-3.1-flash-lite', 0.014),
  ('gemini', 'gemini-3.1-pro-preview', 0.014),
  ('gemini', 'gemini-2.5-pro', 0.035),
  ('gemini', 'gemini-2.5-flash', 0.035),
  ('gemini', 'gemini-2.5-flash-lite', 0.035)
  ) as v(provider, model, usd)
 where p.provider = v.provider and p.model = v.model and p.per_search_usd is null;

-- ---------------------------------------------------------------- permissões
-- Funções do servidor e de apoio: fechadas para quem chama de fora (só o próprio banco e o serviço).
revoke execute on function public.ch_url_norm(text) from public, anon, authenticated;
revoke execute on function public.ch_source_replacement(text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.ch_source_candidate_item(uuid) from public, anon, authenticated;
revoke execute on function public.ch_source_site_match(text) from public, anon, authenticated;
revoke execute on function public.ch_source_iso_date(text) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_search_get(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_search_update(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_source_search_job_dead() from public, anon, authenticated;
revoke execute on function public.ch_worker_source_known(text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_candidate_create(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_search_has_candidate(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_save_function(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_log_calls(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_save_price(uuid, text, text, jsonb) from public, anon, authenticated;
-- Funções da tela: só quem entrou (a conferência de papel fica dentro de cada uma).
revoke execute on function public.app_ch_official_domains() from public, anon;
revoke execute on function public.app_ch_save_official_domain(jsonb) from public, anon;
revoke execute on function public.app_ch_source_search_start(jsonb) from public, anon;
revoke execute on function public.app_ch_source_searches(integer) from public, anon;
revoke execute on function public.app_ch_source_candidates(text) from public, anon;
revoke execute on function public.app_ch_source_candidate(uuid) from public, anon;
revoke execute on function public.app_ch_source_candidate_save(uuid, jsonb) from public, anon;
revoke execute on function public.app_ai_summary() from public, anon;
revoke execute on function public.app_ch_source_candidate_approve(uuid, jsonb) from public, anon;
revoke execute on function public.app_ch_source_candidate_reject(uuid, text) from public, anon;
revoke execute on function public.app_ch_sources() from public, anon;
revoke execute on function public.app_ch_register_source(jsonb) from public, anon;
