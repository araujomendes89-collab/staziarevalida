-- =============================================================================
-- Conferência independente dos rascunhos inéditos (Stazia Knowledge Engine, fase 3).
--
-- Camadas (cada uma grava UM resultado por rascunho; o histórico das chamadas de IA fica em ch_ai_runs):
--   software  regras sem IA: resposta única, números sem sustentação, semelhança, cópia, figura
--   sources   a afirmação central tem sustentação em fonte OFICIAL (nível A–D)?
--   currency  existe versão mais nova da fonte? a conduta mudou?
--   redteam   revisão clínica independente (opinião de IA, NÃO é evidência)
--
-- Nenhuma camada aprova ou publica: o resultado só informa e ordena a revisão do médico.
-- =============================================================================

-- O que o gerador entregou e a tela ainda não guardava (31 rascunhos têm tabela de apoio sem a qual não se responde).
alter table public.draft_questions add column support_type text;
alter table public.draft_questions add column support_title text;
alter table public.draft_questions add column support_rows jsonb not null default '[]'::jsonb;
alter table public.draft_questions add column clinical_decision text;
alter table public.draft_questions add column key_concepts jsonb not null default '[]'::jsonb;

-- Nível de autoridade da fonte (A = Ministério da Saúde/INEP/Conitec/Anvisa…, B = sociedades médicas,
-- C = organismos internacionais, D = revisões/periódicos, E = livros, apostilas e cursos).
-- Só A–D valem como evidência; E serve para descobrir afirmações.
alter table public.ch_sources add column authority_level text check (authority_level in ('A', 'B', 'C', 'D', 'E'));

create function public.app_ch_set_source_authority(p_source_id uuid, p_level text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_level not in ('A', 'B', 'C', 'D', 'E') then raise exception 'Nível de autoridade inválido (A a E).' using errcode = '22023'; end if;
  update public.ch_sources set authority_level = p_level where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('source.authority', p_source_id::text, jsonb_build_object('level', p_level));
  return true;
end
$$;

create table public.draft_checks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.draft_questions (id) on delete cascade,
  layer text not null check (layer in ('software', 'sources', 'currency', 'redteam')),
  verdict text not null check (verdict in ('pass', 'issues', 'fail', 'insufficient', 'inconclusive')),
  findings jsonb not null default '[]'::jsonb,     -- [{severity, code, where, detail}]
  provider text,
  model text,
  prompt_version text,
  input_hash text,
  content_hash text not null,                      -- conteúdo exato conferido (mudou? precisa conferir de novo)
  cost_usd numeric(10, 5),
  checked_at timestamptz not null default now(),
  unique (draft_id, layer)
);
create index draft_checks_verdict_idx on public.draft_checks (layer, verdict);
alter table public.draft_checks enable row level security;
create policy "conferências: equipe e revisores leem" on public.draft_checks for select to authenticated
  using (public.is_staff() or public.ch_is_reviewer());

-- ---------------------------------------------------------------- funções do processamento (só a chave de serviço)
-- Rascunhos que ainda não têm esta camada conferida para o conteúdo atual.
create function public.ch_worker_drafts_for_check(p_layer text, p_limit integer default 50, p_batch text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.batch, x.slot), '[]'::jsonb) from (
    select d.id, d.batch, d.source_id, d.slot, d.area, d.subarea, d.competency, d.title, d.stem, d.alternatives, d.correct_answer,
           d.explanation, d.alternative_explanations, d.source_citations, d.update_application, d.similarity_to_official,
           d.support_type, d.support_title, d.support_rows, d.clinical_decision, d.key_concepts, d.model, d.content_hash
    from public.draft_questions d
    where (p_batch is null or d.batch = p_batch)
      and not exists (select 1 from public.draft_checks c where c.draft_id = d.id and c.layer = p_layer and c.content_hash = d.content_hash)
    order by d.batch, d.slot
    limit least(greatest(coalesce(p_limit, 50), 1), 500)) x
$$;

create function public.ch_worker_save_draft_check(p_draft_id uuid, p_layer text, p_verdict text, p_findings jsonb, p_meta jsonb default '{}'::jsonb) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.draft_checks (draft_id, layer, verdict, findings, provider, model, prompt_version, input_hash, content_hash, cost_usd)
  values (p_draft_id, p_layer, p_verdict, coalesce(p_findings, '[]'::jsonb), p_meta ->> 'provider', p_meta ->> 'model', p_meta ->> 'prompt_version',
          p_meta ->> 'input_hash', (select content_hash from public.draft_questions where id = p_draft_id), nullif(p_meta ->> 'cost_usd', '')::numeric)
  on conflict (draft_id, layer) do update set verdict = excluded.verdict, findings = excluded.findings, provider = excluded.provider, model = excluded.model,
    prompt_version = excluded.prompt_version, input_hash = excluded.input_hash, content_hash = excluded.content_hash, cost_usd = excluded.cost_usd, checked_at = now()
  returning id into v_id;
  return v_id;
end
$$;

-- Busca só em fontes OFICIAIS vigentes (nível A–D), nunca em apostila, consulta pública ou relatório preliminar.
create function public.ch_worker_search_official_passages(p_query text, p_limit integer default 5) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.row order by x.rank desc), '[]'::jsonb) from (
    select ts_rank(p.tsv, q) as rank, jsonb_build_object('passage_id', p.id, 'source_id', s.id, 'source', s.title, 'organ', s.organ, 'version', s.version,
           'authority_level', s.authority_level, 'published_on', s.published_on, 'valid_until', s.valid_until, 'section', p.section, 'page', p.page, 'text', p.text) as row
    from public.ch_source_passages p join public.ch_sources s on s.id = p.source_id,
         websearch_to_tsquery('portuguese', coalesce(p_query, '')) q
    where p.tsv @@ q and s.status = 'current' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final'
    order by rank desc limit least(greatest(coalesce(p_limit, 5), 1), 20)) x
$$;

-- Fontes oficiais cadastradas (para dizer ao conferente de atualizações o que existe e de que data).
create function public.ch_worker_official_sources() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'organ', s.organ, 'version', s.version, 'authority_level', s.authority_level,
           'published_on', s.published_on, 'valid_until', s.valid_until, 'status', s.status, 'passages', (select count(*) from public.ch_source_passages p where p.source_id = s.id))), '[]'::jsonb)
  from public.ch_sources s where s.authority_level in ('A', 'B', 'C', 'D')
$$;

-- ---------------------------------------------------------------- painel: lista com o resultado de cada camada
create or replace function public.app_draft_questions(
  p_batch text default null, p_status text default null, p_area text default null, p_limit integer default 30, p_offset integer default 0
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'batches', (select coalesce(jsonb_agg(x order by x ->> 'batch'), '[]'::jsonb) from (
        select jsonb_build_object('batch', batch, 'total', count(*)::int,
          'awaiting', count(*) filter (where status = 'awaiting_medical_review')::int,
          'approved', count(*) filter (where status = 'approved')::int,
          'needs_changes', count(*) filter (where status = 'needs_changes')::int,
          'rejected', count(*) filter (where status = 'rejected')::int) as x
        from public.draft_questions group by batch) b),
    'checks', (select coalesce(jsonb_object_agg(layer, v), '{}'::jsonb) from (
        select c.layer, jsonb_object_agg(c.verdict, c.n) as v from (
          select c.layer, c.verdict, count(*)::int as n from public.draft_checks c
          join public.draft_questions d on d.id = c.draft_id and d.content_hash = c.content_hash
          where p_batch is null or d.batch = p_batch group by c.layer, c.verdict) c group by c.layer) t),
    'total', (select count(*)::int from public.draft_questions d
              where (p_batch is null or d.batch = p_batch) and (p_status is null or d.status = p_status) and (p_area is null or d.area = p_area)),
    'items', coalesce((select jsonb_agg(to_jsonb(d) - 'content_hash' || jsonb_build_object(
        'can_review', public.ch_is_reviewer(d.area),
        'reviewer', (select email from auth.users where id = d.reviewed_by),
        'review_outdated', d.reviewed_hash is not null and d.reviewed_hash <> d.content_hash,
        'checks', (select coalesce(jsonb_object_agg(c.layer, jsonb_build_object('verdict', c.verdict, 'findings', c.findings, 'model', c.model,
                     'checked_at', c.checked_at, 'current', c.content_hash = d.content_hash)), '{}'::jsonb)
                   from public.draft_checks c where c.draft_id = d.id)) order by d.batch, d.slot)
      from (select * from public.draft_questions d
            where (p_batch is null or d.batch = p_batch) and (p_status is null or d.status = p_status) and (p_area is null or d.area = p_area)
            order by d.batch, d.slot limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) d), '[]'::jsonb));
end
$$;

do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ch\_worker\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;
