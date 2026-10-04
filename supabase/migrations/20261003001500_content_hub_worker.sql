-- =============================================================================
-- Central de Conteúdo: funções do processamento em segundo plano (worker), registro das
-- chamadas de IA, arquivos renderizados e monitoramento de fontes.
--
-- As funções ch_worker_* só são executáveis pelo servidor (service_role). Elas gravam
-- resultados "sugeridos" — nunca aprovam, nunca publicam e nunca confirmam afirmação crítica.
-- =============================================================================

-- ---------------------------------------------------------------- etapas e fontes em PDF
alter table public.ch_jobs drop constraint ch_jobs_step_check;
alter table public.ch_jobs add constraint ch_jobs_step_check
  check (step in ('extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index'));

-- O acervo de validação também entra como PDF (documento completo), separado do material importado.
alter table public.ch_documents add column purpose text not null default 'study_material' check (purpose in ('study_material', 'reference_source'));
alter table public.ch_sources add column document_id uuid references public.ch_documents (id) on delete set null;

-- Trechos de uma fonte gerados a partir do documento completo extraído (idempotente por fonte).
create function public.ch_worker_replace_passages(p_source_id uuid, p_passages jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  delete from public.ch_source_passages where source_id = p_source_id;
  insert into public.ch_source_passages (source_id, section, page, population, care_setting, theme, text)
  select p_source_id, x ->> 'section', nullif(x ->> 'page', '')::int, x ->> 'population', x ->> 'care_setting', x ->> 'theme', x ->> 'text'
  from jsonb_array_elements(p_passages) x where char_length(btrim(coalesce(x ->> 'text', ''))) > 0;
  get diagnostics n = row_count;
  return n;
end
$$;

create function public.ch_worker_source_for_document(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$ select to_jsonb(s) from public.ch_sources s where s.document_id = p_document_id $$;

create function public.app_ch_attach_source_document(p_source_id uuid, p_document_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform public.ch_assert_document(p_document_id);
  update public.ch_documents set purpose = 'reference_source', rights_status = case when rights_status = 'unknown' then 'reference_only' else rights_status end where id = p_document_id;
  update public.ch_sources set document_id = p_document_id,
         sha256 = coalesce(sha256, (select d.sha256 from public.ch_documents d where d.id = p_document_id)) where id = p_source_id;
  return true;
end
$$;

-- ---------------------------------------------------------------- execuções de IA
create table public.ch_ai_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ch_jobs (id) on delete set null,
  document_id uuid references public.ch_documents (id) on delete set null,
  step text not null,
  provider text not null,                 -- anthropic | gemini | mock (só desenvolvimento)
  model text not null,
  prompt_id text not null,
  prompt_version text not null,
  schema_version text not null,
  input_hash text not null,
  status text not null check (status in ('ok', 'invalid_output', 'rejected_by_check', 'failed')),
  output jsonb,
  rejections jsonb not null default '[]'::jsonb,   -- o que as verificações de software recusaram
  input_tokens integer, output_tokens integer,
  cost_usd numeric(10, 5),
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);
create index ch_ai_runs_doc_idx on public.ch_ai_runs (document_id, created_at desc);
alter table public.ch_ai_runs enable row level security;
create policy "execuções: admin lê" on public.ch_ai_runs for select to authenticated using (public.is_admin());

-- Arquivos gerados a partir de um material (PDF da aula, cards em imagem…), com a conferência do resultado.
create table public.ch_renders (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.ch_materials (id) on delete cascade,
  format text not null check (format in ('pdf', 'png', 'html')),
  storage_path text not null,
  sha256 text not null,
  template_version text not null,
  brand_version text not null,
  material_hash text not null,            -- o material exato que foi renderizado
  check_result jsonb not null default '{}'::jsonb,   -- texto completo presente, referências, páginas
  created_at timestamptz not null default now(),
  unique (material_id, format, material_hash)
);
alter table public.ch_renders enable row level security;
create policy "renderizações: equipe lê" on public.ch_renders for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- Revisão automática (separada da redação): só aponta problemas, nunca aprova.
alter table public.ch_unit_versions add column review_flags jsonb not null default '[]'::jsonb;
alter table public.ch_unit_versions add column generated_by_model text;

-- ---------------------------------------------------------------- monitoramento de fontes
create table public.ch_source_watch (
  source_id uuid primary key references public.ch_sources (id) on delete cascade,
  url text not null,
  interval_days integer not null default 7 check (interval_days between 1 and 365),
  last_checked_at timestamptz,
  last_hash text,
  last_status text,                       -- ok | changed | unreachable
  next_check_at timestamptz not null default now()
);
alter table public.ch_source_watch enable row level security;
create policy "monitoramento: equipe lê" on public.ch_source_watch for select to authenticated using (public.is_staff());

create table public.ch_source_changes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ch_sources (id) on delete cascade,
  detected_at timestamptz not null default now(),
  old_hash text, new_hash text,
  candidate_versions integer not null default 0,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  note text
);
alter table public.ch_source_changes enable row level security;
create policy "mudanças de fonte: equipe lê" on public.ch_source_changes for select to authenticated using (public.is_staff());

create function public.app_ch_watch_source(p_source_id uuid, p_url text, p_interval_days integer default 7) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_url !~ '^https://' then raise exception 'Use o endereço https da publicação oficial.' using errcode = '22023'; end if;
  insert into public.ch_source_watch (source_id, url, interval_days) values (p_source_id, p_url, coalesce(p_interval_days, 7))
  on conflict (source_id) do update set url = excluded.url, interval_days = excluded.interval_days, next_check_at = now();
  return true;
end
$$;

create function public.ch_worker_watch_due() returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('source_id', w.source_id, 'url', w.url, 'last_hash', w.last_hash)), '[]'::jsonb)
  from public.ch_source_watch w where w.next_check_at <= now()
$$;

-- Resultado de uma conferência periódica. Mudou o arquivo publicado: os materiais dependentes
-- ganham versões candidatas (as publicadas continuam no ar, marcadas "requer atualização").
create function public.ch_worker_watch_result(p_source_id uuid, p_hash text, p_status text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  w public.ch_source_watch;
  n integer := 0;
begin
  select * into w from public.ch_source_watch where source_id = p_source_id;
  if not found then return null; end if;
  if p_status = 'ok' and w.last_hash is not null and p_hash is distinct from w.last_hash then
    n := public.ch_flag_dependents(p_source_id, 'A publicação monitorada mudou (conteúdo diferente do conferido): rever as afirmações.');
    insert into public.ch_source_changes (source_id, old_hash, new_hash, candidate_versions) values (p_source_id, w.last_hash, p_hash, n);
    update public.ch_source_watch set last_status = 'changed' where source_id = p_source_id;
  else
    update public.ch_source_watch set last_status = p_status where source_id = p_source_id;
  end if;
  update public.ch_source_watch set last_checked_at = now(), last_hash = case when p_status = 'ok' then p_hash else last_hash end,
         next_check_at = now() + make_interval(days => interval_days) where source_id = p_source_id;
  return jsonb_build_object('changed', n > 0 or (p_status = 'ok' and w.last_hash is not null and p_hash is distinct from w.last_hash), 'candidate_versions', n);
end
$$;

-- ---------------------------------------------------------------- funções do worker
create function public.ch_worker_document(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$ select to_jsonb(d) from public.ch_documents d where d.id = p_document_id $$;

create function public.ch_worker_document_meta(p_document_id uuid, p_meta jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_documents set
    page_count = coalesce(nullif(p_meta ->> 'page_count', '')::integer, page_count),
    text_kind = coalesce(nullif(p_meta ->> 'text_kind', ''), text_kind),
    author = coalesce(author, nullif(p_meta ->> 'author', '')),
    status = coalesce(nullif(p_meta ->> 'status', ''), status),
    failure = case when p_meta ? 'failure' then nullif(p_meta ->> 'failure', '') else failure end,
    provenance = provenance || coalesce(p_meta -> 'provenance', '{}'::jsonb)
  where id = p_document_id;
end
$$;

create function public.ch_worker_blocks(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'page_no', b.page_no, 'idx', b.idx, 'type', b.type, 'status', b.status,
           'text', coalesce(b.revised_text, b.original_text), 'original_text', b.original_text, 'flags', b.flags) order by b.page_no, b.idx), '[]'::jsonb)
  from public.ch_blocks b where b.document_id = p_document_id
$$;

create function public.ch_worker_catalog() returns jsonb
  language sql security definer set search_path = ''
as $$
  with recursive tree as (
    select n.id, n.parent_id, n.level, n.name, n.code, n.name::text as path, n.code as area_code
    from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id
    where v.status = 'published' and n.parent_id is null and n.status = 'active'
    union all
    select c.id, c.parent_id, c.level, c.name, c.code, t.path || ' > ' || c.name, t.area_code
    from public.ch_taxonomy_nodes c join tree t on c.parent_id = t.id where c.status = 'active')
  select jsonb_build_object('version', (select version from public.ch_taxonomy_versions where status = 'published'),
    'nodes', jsonb_agg(jsonb_build_object('id', id, 'level', level, 'path', path, 'area_code', area_code) order by path))
  from tree
$$;

-- Classificação sugerida pela IA (precisa de confirmação humana para valer).
create function public.ch_worker_classify_blocks(p_block_ids uuid[], p_node_ids uuid[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  insert into public.ch_block_nodes (block_id, node_id, suggested_by_ai)
  select b, n2, true from unnest(p_block_ids) b cross join unnest(p_node_ids) n2
  where exists (select 1 from public.ch_taxonomy_nodes t where t.id = n2 and t.status = 'active')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;

create function public.ch_worker_add_claim(p_claim jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.ch_claims
   where document_id = (p_claim ->> 'document_id')::uuid and block_id is not distinct from nullif(p_claim ->> 'block_id', '')::uuid and statement = btrim(p_claim ->> 'statement');
  if v_id is not null then return v_id; end if;   -- idempotente no reprocessamento
  insert into public.ch_claims (document_id, block_id, theme_node_id, statement, context, critical_kinds, created_by_model)
  values ((p_claim ->> 'document_id')::uuid, nullif(p_claim ->> 'block_id', '')::uuid, nullif(p_claim ->> 'theme_node_id', '')::uuid, btrim(p_claim ->> 'statement'),
          coalesce(p_claim -> 'context', '{}'::jsonb), coalesce(array(select jsonb_array_elements_text(p_claim -> 'critical_kinds')), '{}'), p_claim ->> 'model')
  returning id into v_id;
  insert into public.ch_claim_history (claim_id, event, details) values (v_id, 'extracted_by_ai', jsonb_build_object('model', p_claim ->> 'model'));
  return v_id;
end
$$;

create function public.ch_worker_claims(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
           'critical_kinds', c.critical_kinds, 'context', c.context, 'theme_node_id', c.theme_node_id, 'block_id', c.block_id) order by c.created_at), '[]'::jsonb)
  from public.ch_claims c where c.document_id = p_document_id
$$;

create function public.ch_worker_search_passages(p_query text, p_limit integer default 5) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.row order by x.rank desc), '[]'::jsonb) from (
    select ts_rank(p.tsv, q) as rank, jsonb_build_object('passage_id', p.id, 'source_id', s.id, 'source', s.title, 'organ', s.organ, 'version', s.version,
           'section', p.section, 'page', p.page, 'population', p.population, 'care_setting', p.care_setting, 'text', p.text) as row
    from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id,
         websearch_to_tsquery('portuguese', coalesce(p_query, '')) q
    where p.tsv @@ q and s.status = 'current' and s.kind not in ('preliminary', 'public_consultation') and (s.kind <> 'society_guideline' or s.editorial_approved)
    order by rank desc limit least(greatest(coalesce(p_limit, 5), 1), 20)) x
$$;

-- Evidência proposta pela IA: a mesma conferência numérica de app_ch_link_evidence; se o
-- modelo disse "compatível" mas os números/negações não batem, grava "insuficiente".
create function public.ch_worker_link_evidence(p_claim_id uuid, p_evidence jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_claims;
  s public.ch_sources;
  v_quote text := btrim(coalesce(p_evidence ->> 'quote', ''));
  v_verdict text := p_evidence ->> 'verdict';
  v_text text; v_missing text[]; v_neg_missing text[]; v_check jsonb; v_id uuid;
begin
  select * into c from public.ch_claims where id = p_claim_id;
  select * into s from public.ch_sources where id = (p_evidence ->> 'source_id')::uuid;
  if c.id is null or s.id is null or v_quote = '' then raise exception 'Evidência incompleta.' using errcode = '22023'; end if;
  v_text := coalesce(c.proposed_text, c.statement);
  select coalesce(array_agg(n), '{}') into v_missing from unnest(public.ch_numbers(v_text)) n where not (n = any (public.ch_numbers(v_quote)));
  select coalesce(array_agg(n), '{}') into v_neg_missing from unnest(public.ch_negations(v_text)) n where not (n = any (public.ch_negations(v_quote)));
  v_check := jsonb_build_object('claim_numbers', public.ch_numbers(v_text), 'evidence_numbers', public.ch_numbers(v_quote), 'missing_in_evidence', v_missing,
                                'negations_missing_in_evidence', v_neg_missing, 'ok', cardinality(v_missing) = 0 and cardinality(v_neg_missing) = 0, 'by', 'worker',
                                'model', p_evidence ->> 'model', 'simulated', coalesce(p_evidence ->> 'model', '') like 'mock%');
  if v_verdict = 'compatible' and not (v_check ->> 'ok')::boolean then v_verdict := 'insufficient'; end if;
  if v_verdict not in ('compatible', 'outdated', 'conflicting', 'insufficient', 'context_dependent') then v_verdict := 'insufficient'; end if;
  insert into public.ch_evidence (claim_id, source_id, passage_id, section, page, source_version, quote, verdict, numeric_check)
  values (p_claim_id, s.id, nullif(p_evidence ->> 'passage_id', '')::uuid, p_evidence ->> 'section', nullif(p_evidence ->> 'page', '')::int, s.version, v_quote, v_verdict, v_check)
  returning id into v_id;
  update public.ch_claims set status = (
    select case when bool_or(e.verdict = 'conflicting') then 'conflicting' when bool_or(e.verdict = 'outdated') then 'outdated'
                when bool_or(e.verdict = 'context_dependent') then 'context_dependent' when bool_or(e.verdict = 'insufficient') then 'insufficient' else 'compatible' end
    from public.ch_evidence e where e.claim_id = p_claim_id and not e.stale)
  where id = p_claim_id;
  insert into public.ch_claim_history (claim_id, event, details) values (p_claim_id, 'evidence_by_ai', jsonb_build_object('evidence_id', v_id, 'verdict', v_verdict, 'model', p_evidence ->> 'model'));
  return jsonb_build_object('id', v_id, 'verdict', v_verdict, 'numeric_check', v_check);
end
$$;

create function public.ch_worker_mark_claim(p_claim_id uuid, p_status text, p_note text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_claims set status = p_status where id = p_claim_id and status in ('extracted', 'evidence_linked');
  insert into public.ch_claim_history (claim_id, event, details) values (p_claim_id, 'worker_note', jsonb_build_object('status', p_status, 'note', p_note));
end
$$;

-- Rascunho da unidade gerado pela IA: sempre em rascunho, sem aprovação nenhuma.
create function public.ch_worker_save_draft(p_theme_node_id uuid, p_title text, p_content jsonb, p_origin text, p_model text, p_scope_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_version uuid;
  v_hash text := public.ch_hash(p_content);
  v_ids uuid[] := public.ch_content_claim_ids(p_content);
begin
  select id into v_unit from public.ch_units where theme_node_id = p_theme_node_id order by created_at limit 1;
  if v_unit is null then
    insert into public.ch_units (theme_node_id, title, created_by) values (p_theme_node_id, btrim(p_title), null) returning id into v_unit;
  end if;
  -- idempotente: o mesmo conteúdo não gera nova versão
  select id into v_version from public.ch_unit_versions where unit_id = v_unit and content_hash = v_hash;
  if v_version is null then
    insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash, scope_note, created_by, generated_by_model)
    values (v_unit, coalesce((select max(version) + 1 from public.ch_unit_versions where unit_id = v_unit), 1), p_origin, 'draft', p_content, v_hash, p_scope_note, null, p_model)
    returning id into v_version;
    insert into public.ch_unit_claims select v_version, i from unnest(v_ids) i;
  end if;
  return jsonb_build_object('unit_id', v_unit, 'version_id', v_version);
end
$$;

create function public.ch_worker_save_material(p_version_id uuid, p_kind text, p_content jsonb, p_model text, p_template text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[] := public.ch_content_claim_ids(p_content);
  v_id uuid;
begin
  if exists (select 1 from public.ch_unit_versions where id = p_version_id and status not in ('draft')) then
    raise exception 'Materiais automáticos só entram em versão em rascunho.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.ch_unit_claims uc where uc.unit_version_id = p_version_id and uc.claim_id = i)) then
    raise exception 'O material usa afirmação fora da base da unidade.' using errcode = '22023';
  end if;
  insert into public.ch_materials (unit_version_id, kind, content, content_hash, claim_ids, generated_by_model, template_version)
  values (p_version_id, p_kind, p_content, public.ch_hash(p_content), v_ids, p_model, p_template)
  on conflict (unit_version_id, kind) do update set content = excluded.content, content_hash = excluded.content_hash, claim_ids = excluded.claim_ids,
    generated_by_model = excluded.generated_by_model, template_version = excluded.template_version
  returning id into v_id;
  update public.ch_approvals set invalidated_at = now() where unit_version_id = p_version_id and invalidated_at is null;
  return jsonb_build_object('id', v_id);
end
$$;

create function public.ch_worker_review_flags(p_version_id uuid, p_flags jsonb) returns void
  language sql security definer set search_path = ''
as $$ update public.ch_unit_versions set review_flags = coalesce(p_flags, '[]'::jsonb) where id = p_version_id $$;

create function public.ch_worker_save_render(p_render jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.ch_renders (material_id, format, storage_path, sha256, template_version, brand_version, material_hash, check_result)
  values ((p_render ->> 'material_id')::uuid, p_render ->> 'format', p_render ->> 'storage_path', p_render ->> 'sha256', p_render ->> 'template_version',
          p_render ->> 'brand_version', p_render ->> 'material_hash', coalesce(p_render -> 'check_result', '{}'::jsonb))
  on conflict (material_id, format, material_hash) do update set storage_path = excluded.storage_path, sha256 = excluded.sha256, check_result = excluded.check_result
  returning id into v_id;
  return v_id;
end
$$;

create function public.ch_worker_log_ai_run(p_run jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.ch_ai_runs (job_id, document_id, step, provider, model, prompt_id, prompt_version, schema_version, input_hash, status, output, rejections,
                                 input_tokens, output_tokens, cost_usd, latency_ms, error)
  values (nullif(p_run ->> 'job_id', '')::uuid, nullif(p_run ->> 'document_id', '')::uuid, p_run ->> 'step', p_run ->> 'provider', p_run ->> 'model',
          p_run ->> 'prompt_id', p_run ->> 'prompt_version', p_run ->> 'schema_version', p_run ->> 'input_hash', p_run ->> 'status', p_run -> 'output',
          coalesce(p_run -> 'rejections', '[]'::jsonb), nullif(p_run ->> 'input_tokens', '')::int, nullif(p_run ->> 'output_tokens', '')::int,
          nullif(p_run ->> 'cost_usd', '')::numeric, nullif(p_run ->> 'latency_ms', '')::int, p_run ->> 'error')
  returning id into v_id;
  return v_id;
end
$$;

create function public.ch_worker_unit_versions(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('version_id', v.id, 'unit_id', v.unit_id, 'status', v.status, 'content', v.content,
           'content_hash', v.content_hash, 'version', v.version, 'created_at', v.created_at, 'origin', v.origin, 'scope_note', v.scope_note, 'review_flags', v.review_flags,
           'title', u.title, 'theme_node_id', u.theme_node_id)), '[]'::jsonb)
  from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id
  join public.ch_unit_claims uc on uc.unit_version_id = v.id join public.ch_claims c on c.id = uc.claim_id
  where c.document_id = p_document_id and v.status = 'draft'
$$;

create function public.ch_worker_materials(p_version_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'content', m.content, 'content_hash', m.content_hash)), '[]'::jsonb)
  from public.ch_materials m where m.unit_version_id = p_version_id
$$;

create function public.ch_worker_block_themes(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.block_id, x.nodes), '{}'::jsonb) from (
    select bn.block_id, jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'level', n.level)) as nodes
    from public.ch_block_nodes bn join public.ch_blocks b on b.id = bn.block_id join public.ch_taxonomy_nodes n on n.id = bn.node_id
    where b.document_id = p_document_id and n.level in ('theme', 'subtheme') and n.status = 'active'
    group by bn.block_id) x
$$;

-- ---------------------------------------------------------------- fila: pendência, falha definitiva, encadeamento
-- "blocked" = falta configuração (IA, credencial, fonte vinculada): o trabalho espera sem gastar tentativa.
alter table public.ch_jobs drop constraint ch_jobs_status_check;
alter table public.ch_jobs add constraint ch_jobs_status_check check (status in ('queued', 'running', 'succeeded', 'failed', 'dead', 'blocked'));

create function public.ch_worker_block(p_job_id uuid, p_reason text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_doc uuid;
begin
  update public.ch_jobs set status = 'blocked', attempts = greatest(attempts - 1, 0), error = p_reason, locked_at = null
   where id = p_job_id and status = 'running' returning document_id into v_doc;
  if v_doc is not null then
    update public.ch_documents set failure = left('Pendência: ' || p_reason, 500) where id = v_doc;
  end if;
end
$$;

-- Configuração resolvida (ex.: IA passou a existir): os trabalhos pendentes voltam para a fila.
create function public.ch_worker_unblock() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.ch_documents d set failure = null
   where d.failure like 'Pendência:%' and exists (select 1 from public.ch_jobs j where j.document_id = d.id and j.status = 'blocked');
  update public.ch_jobs set status = 'queued', error = null, run_after = now() where status = 'blocked';
  get diagnostics n = row_count;
  return n;
end
$$;

-- Falha que uma nova tentativa não resolve (arquivo protegido, corrompido, hash diferente).
create function public.ch_worker_fail(p_job_id uuid, p_error text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_doc uuid;
begin
  update public.ch_jobs set status = 'dead', error = p_error, locked_at = null, finished_at = now()
   where id = p_job_id and status = 'running' returning document_id into v_doc;
  if v_doc is not null then
    update public.ch_documents set status = 'failed', failure = left(p_error, 500) where id = v_doc;
  end if;
end
$$;

-- Próxima etapa: cria o trabalho ou, no reprocessamento, devolve o já existente para a fila (sem duplicar).
create function public.ch_worker_next(p_document_id uuid, p_step text, p_versions jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb;
begin
  r := public.ch_worker_enqueue(p_document_id, p_step, '', p_versions, 3);
  if (r ->> 'duplicate')::boolean then
    update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = '{}'::jsonb
     where id = (r ->> 'id')::uuid and status in ('succeeded', 'failed', 'dead', 'blocked');
  end if;
  return r;
end
$$;

-- Reaproveita a resposta de uma chamada idêntica (mesmo prompt, modelo e entrada): reprocessar não paga de novo.
create function public.ch_worker_cached_run(p_prompt_id text, p_prompt_version text, p_model text, p_input_hash text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select r.output from public.ch_ai_runs r
  where r.prompt_id = p_prompt_id and r.prompt_version = p_prompt_version and r.model = p_model and r.input_hash = p_input_hash
    and r.status in ('ok', 'rejected_by_check') and r.output is not null
  order by r.created_at desc limit 1
$$;

create function public.ch_worker_claims_by_ids(p_ids uuid[]) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
           'critical_kinds', c.critical_kinds, 'context', c.context, 'document_id', c.document_id,
           'evidence', (select coalesce(jsonb_agg(jsonb_build_object('source_id', s.id, 'source', s.title, 'organ', s.organ, 'version', e.source_version,
                          'url', s.url, 'published_on', s.published_on, 'section', e.section, 'page', e.page, 'quote', e.quote, 'verdict', e.verdict,
                          'simulated', coalesce((e.numeric_check ->> 'simulated')::boolean, false)) order by e.created_at), '[]'::jsonb)
                        from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id and not e.stale))), '[]'::jsonb)
  from public.ch_claims c where c.id = any (p_ids)
$$;

-- Painel: tentar de novo / reprocessar uma etapa (pessoa da equipe com acesso ao documento).
create function public.app_ch_retry_job(p_job_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_doc uuid;
begin
  perform public.ch_assert_staff();
  select document_id into v_doc from public.ch_jobs where id = p_job_id;
  if not found then raise exception 'Etapa não encontrada.' using errcode = 'P0002'; end if;
  if v_doc is null then perform public.assert_admin(); else perform public.ch_assert_document(v_doc); end if;
  -- reprocessar recomeça a etapa (o checkpoint só serve para retomar uma execução interrompida)
  update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = '{}'::jsonb
   where id = p_job_id and status in ('succeeded', 'failed', 'dead', 'blocked');
  if not found then raise exception 'A etapa já está na fila ou em execução.' using errcode = '22023'; end if;
  update public.ch_documents set failure = null, status = case when status = 'failed' then 'received' else status end where id = v_doc;
  perform public.ch_log('job.retry', p_job_id::text, '{}'::jsonb);
  return true;
end
$$;

-- ---------------------------------------------------------------- trava de publicação pelo arquivo final
-- O material final (PDF da aula, cards) precisa ter sido renderizado A PARTIR DA VERSÃO ATUAL e
-- conferido: texto completo, referências presentes, nada cortado.
alter function public.ch_publish_problems(uuid) rename to ch_publish_problems_base;
create function public.ch_publish_problems(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  p text[] := public.ch_publish_problems_base(p_version_id);
  r record;
begin
  if exists (select 1 from public.ch_unit_versions v where v.id = p_version_id and coalesce(v.generated_by_model, '') like 'mock%') then
    p := array_append(p, 'Versão criada pela simulação de desenvolvimento (não é IA nem revisão): não pode ser publicada.');
  end if;
  if exists (select 1 from public.ch_materials m where m.unit_version_id = p_version_id and coalesce(m.generated_by_model, '') like 'mock%') then
    p := array_append(p, 'Há material criado pela simulação de desenvolvimento: não pode ser publicado.');
  end if;
  for r in select c.statement from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id
           where uc.unit_version_id = p_version_id
             and exists (select 1 from public.ch_evidence e where e.claim_id = c.id and e.verdict = 'compatible' and not e.stale)
             and not exists (select 1 from public.ch_evidence e where e.claim_id = c.id and e.verdict = 'compatible' and not e.stale
                             and not coalesce((e.numeric_check ->> 'simulated')::boolean, false)) loop
    p := array_append(p, ('Afirmação sustentada só por evidência simulada: ' || left(r.statement, 80)));
  end loop;
  for r in select m.* from public.ch_materials m where m.unit_version_id = p_version_id and m.kind in ('lesson', 'visual_cards') loop
    if not exists (select 1 from public.ch_renders x where x.material_id = r.id and x.material_hash = r.content_hash) then
      p := array_append(p, ('O arquivo final de "' || r.kind || '" não foi gerado a partir da versão atual.'));
    elsif exists (select 1 from public.ch_renders x where x.material_id = r.id and x.material_hash = r.content_hash and not coalesce((x.check_result ->> 'ok')::boolean, false)) then
      p := array_append(p, ('O arquivo final de "' || r.kind || '" falhou na conferência (texto cortado, referência perdida ou página vazia).'));
    end if;
  end loop;
  return p;
end
$$;
revoke execute on function public.ch_publish_problems_base(uuid) from public, anon, authenticated;

do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ch\_worker\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;

-- =============================================================================
-- Leitura para o painel
-- =============================================================================
create function public.app_ch_document(p_document_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_document(p_document_id);
  return (select jsonb_build_object(
    'document', to_jsonb(d) - 'owner_id',
    'inventory', public.app_ch_inventory(p_document_id),
    'pages', (select coalesce(jsonb_agg(to_jsonb(p) - 'document_id' order by p.page_no), '[]'::jsonb) from public.ch_pages p where p.document_id = d.id),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'step', j.step, 'status', j.status, 'attempts', j.attempts, 'max_attempts', j.max_attempts,
                 'error', j.error, 'checkpoint', j.checkpoint, 'metrics', j.metrics, 'created_at', j.created_at, 'finished_at', j.finished_at) order by j.created_at), '[]'::jsonb)
             from public.ch_jobs j where j.document_id = d.id),
    'ai_runs', (select coalesce(jsonb_agg(jsonb_build_object('step', r.step, 'provider', r.provider, 'model', r.model, 'prompt', r.prompt_id || '@' || r.prompt_version,
                 'status', r.status, 'input_tokens', r.input_tokens, 'output_tokens', r.output_tokens, 'cost_usd', r.cost_usd, 'latency_ms', r.latency_ms,
                 'rejections', jsonb_array_length(r.rejections), 'error', r.error, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                from public.ch_ai_runs r where r.document_id = d.id and public.is_admin()),
    'claims', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
                 'critical_kinds', c.critical_kinds, 'critical_checked', c.critical_checked_by is not null, 'block_id', c.block_id,
                 'page_no', (select b.page_no from public.ch_blocks b where b.id = c.block_id),
                 'evidence', (select coalesce(jsonb_agg(jsonb_build_object('source', s.title, 'organ', s.organ, 'version', e.source_version, 'section', e.section,
                                'page', e.page, 'quote', e.quote, 'verdict', e.verdict, 'numeric_check', e.numeric_check, 'stale', e.stale) order by e.created_at), '[]'::jsonb)
                              from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id)) order by c.created_at), '[]'::jsonb)
               from public.ch_claims c where c.document_id = d.id))
    from public.ch_documents d where d.id = p_document_id);
end
$$;

create function public.app_ch_blocks(p_document_id uuid, p_page integer) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_document(p_document_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'idx', b.idx, 'type', b.type, 'bbox', b.bbox, 'original_text', b.original_text,
           'revised_text', b.revised_text, 'status', b.status, 'exclusion_reason', b.exclusion_reason, 'ocr_confidence', b.ocr_confidence, 'flags', b.flags, 'data', b.data,
           'nodes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'suggested', bn.suggested_by_ai and bn.confirmed_by is null)), '[]'::jsonb)
                     from public.ch_block_nodes bn join public.ch_taxonomy_nodes n on n.id = bn.node_id where bn.block_id = b.id)) order by b.idx)
    from public.ch_blocks b where b.document_id = p_document_id and b.page_no = p_page), '[]'::jsonb);
end
$$;

create function public.app_ch_units() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('unit_id', u.id, 'title', u.title, 'theme_node_id', u.theme_node_id,
           'area_code', public.ch_unit_area_code(v.id),
           'versions', (select jsonb_agg(jsonb_build_object('id', x.id, 'version', x.version, 'status', x.status, 'origin', x.origin, 'content_hash', x.content_hash,
                         'candidate_reason', x.candidate_reason, 'generated_by_model', x.generated_by_model, 'created_at', x.created_at) order by x.version desc)
                        from public.ch_unit_versions x where x.unit_id = u.id)) order by u.title)
    from public.ch_units u join lateral (select id from public.ch_unit_versions where unit_id = u.id order by version desc limit 1) v on true), '[]'::jsonb);
end
$$;

create function public.app_ch_unit_version(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return (select jsonb_build_object(
    'version', to_jsonb(v), 'title', u.title, 'area_code', public.ch_unit_area_code(v.id),
    'problems', to_jsonb(public.ch_publish_problems(v.id)),
    'claims', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
                 'critical_kinds', c.critical_kinds, 'critical_checked', c.critical_checked_by is not null,
                 'evidence', (select coalesce(jsonb_agg(jsonb_build_object('source', s.title, 'organ', s.organ, 'version', e.source_version, 'section', e.section, 'page', e.page,
                                'quote', e.quote, 'verdict', e.verdict, 'numeric_check', e.numeric_check, 'stale', e.stale)), '[]'::jsonb)
                              from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id))), '[]'::jsonb)
               from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = v.id),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'content', m.content, 'content_hash', m.content_hash,
                   'generated_by_model', m.generated_by_model,
                   'renders', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'format', r.format, 'check', r.check_result, 'current', r.material_hash = m.content_hash)), '[]'::jsonb)
                               from public.ch_renders r where r.material_id = m.id))), '[]'::jsonb)
                  from public.ch_materials m where m.unit_version_id = v.id),
    'approvals', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'reviewer', (select email from auth.users where id = a.reviewer_id), 'area_code', a.area_code,
                   'content_hash', a.content_hash, 'decided_at', a.decided_at, 'valid', a.invalidated_at is null and a.content_hash = v.content_hash, 'note', a.note) order by a.decided_at desc), '[]'::jsonb)
                  from public.ch_approvals a where a.unit_version_id = v.id),
    'publications', (select coalesce(jsonb_agg(jsonb_build_object('published_at', p.published_at, 'retired_at', p.retired_at, 'content_hash', p.content_hash)), '[]'::jsonb)
                     from public.ch_publications p where p.unit_version_id = v.id))
    from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id = p_version_id);
end
$$;

create function public.app_ch_sources() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
      'passages', (select count(*)::int from public.ch_source_passages p where p.source_id = s.id),
      'watch', (select to_jsonb(w) - 'source_id' from public.ch_source_watch w where w.source_id = s.id),
      'changes', (select count(*)::int from public.ch_source_changes c where c.source_id = s.id and c.resolved_at is null)) order by s.organ, s.title, s.created_at desc)
    from public.ch_sources s), '[]'::jsonb);
end
$$;

-- =============================================================================
-- Papéis no painel: admin, editor (equipe), revisor médico por área, aluno
-- =============================================================================
create function public.app_ch_whoami() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('admin', public.is_admin(), 'staff', public.is_staff(),
    'reviewer_areas', coalesce((select jsonb_agg(r.area_code order by r.area_code) from public.ch_reviewer_areas r where r.user_id = (select auth.uid())), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create function public.app_ch_reviewers() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'email', x.email, 'areas', x.areas) order by x.email)
    from (select r.user_id, u.email, jsonb_agg(r.area_code order by r.area_code) as areas
          from public.ch_reviewer_areas r join auth.users u on u.id = r.user_id group by r.user_id, u.email) x), '[]'::jsonb);
end
$$;

-- O administrador define em quais áreas a pessoa é revisora médica (lista vazia = deixa de ser revisora).
create function public.app_ch_set_reviewer_areas(p_user_id uuid, p_area_codes text[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.assert_admin();
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'Usuário não encontrado.' using errcode = 'P0002'; end if;
  if exists (select 1 from unnest(coalesce(p_area_codes, '{}')) c
             where not exists (select 1 from public.ch_taxonomy_nodes t where t.level = 'area' and t.code = c)) then
    raise exception 'Área desconhecida na taxonomia.' using errcode = '22023';
  end if;
  delete from public.ch_reviewer_areas where user_id = p_user_id;
  insert into public.ch_reviewer_areas (user_id, area_code) select distinct p_user_id, c from unnest(coalesce(p_area_codes, '{}')) c;
  get diagnostics n = row_count;
  perform public.ch_log('reviewer.areas', p_user_id::text, jsonb_build_object('areas', p_area_codes));
  return n;
end
$$;

-- Arquivo final: a equipe vê todos; o aluno só o arquivo atual de uma versão publicada e ativa.
create function public.app_ch_render(p_render_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r record;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select x.storage_path, x.format, m.unit_version_id, x.material_hash = m.content_hash as current into r
  from public.ch_renders x join public.ch_materials m on m.id = x.material_id where x.id = p_render_id;
  if not found then raise exception 'Arquivo não encontrado.' using errcode = 'P0002'; end if;
  if not (public.is_staff() or public.ch_is_reviewer())
     and not (r.current and exists (select 1 from public.ch_publications p where p.unit_version_id = r.unit_version_id and p.retired_at is null)) then
    raise exception 'Arquivo não disponível.' using errcode = '42501';
  end if;
  return jsonb_build_object('storage_path', r.storage_path, 'format', r.format);
end
$$;
