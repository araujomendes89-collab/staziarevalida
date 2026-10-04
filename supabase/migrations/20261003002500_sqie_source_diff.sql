-- =============================================================================
-- SQIE, fase 3: o vigia passa a comparar o CONTEÚDO das fontes (não só o arquivo) e o impacto da mudança é
-- calculado por afirmação. A comparação é triagem para o revisor médico: nunca decide a conduta atual.
-- =============================================================================

-- Uma comparação entre duas versões de uma fonte (outra linha de ch_sources) ou entre duas leituras da mesma publicação.
create table public.ch_source_diffs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ch_sources (id) on delete cascade,        -- fonte antiga (a que sustentava as evidências)
  new_source_id uuid references public.ch_sources (id) on delete set null,            -- nova versão, quando há
  origin text not null check (origin in ('version', 'snapshot')),                      -- version: duas fontes; snapshot: mesma URL em duas conferências
  old_hash text, new_hash text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ch_source_diffs_source_idx on public.ch_source_diffs (source_id, created_at desc);
alter table public.ch_source_diffs enable row level security;
create policy "comparações de fonte: equipe lê" on public.ch_source_diffs for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

create table public.ch_source_diff_items (
  id uuid primary key default gen_random_uuid(),
  diff_id uuid not null references public.ch_source_diffs (id) on delete cascade,
  idx integer not null,
  kind text not null check (kind in ('UNCHANGED', 'EDITORIAL', 'MINOR_WORDING', 'NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED', 'ADDED')),
  section text,
  old_text text, new_text text,
  similarity numeric,
  critical boolean not null default false,
  unique (diff_id, idx)
);
alter table public.ch_source_diff_items enable row level security;
create policy "itens de comparação: equipe lê" on public.ch_source_diff_items for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- Última leitura (parágrafos) de uma publicação monitorada em HTML ou texto; PDF continua só com a impressão digital.
alter table public.ch_source_watch add column snapshot jsonb;

-- Triagem na fila de atualização: o que mudou, se é crítico e de qual comparação veio.
alter table public.question_updates add column diff_id uuid references public.ch_source_diffs (id) on delete set null;
alter table public.question_updates add column diff_item_id uuid references public.ch_source_diff_items (id) on delete set null;
alter table public.question_updates add column critical boolean not null default false;
alter table public.question_updates add column triage_kind text;

-- ---------------------------------------------------------------- funções do worker (só chave de serviço)
create function public.ch_worker_source_passages(p_source_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'section', p.section, 'page', p.page, 'text', p.text) order by p.page nulls last, p.id), '[]'::jsonb)
  from public.ch_source_passages p where p.source_id = p_source_id
$$;

create function public.ch_worker_source_evidence(p_source_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('evidence_id', e.id, 'claim_id', e.claim_id, 'passage_id', e.passage_id, 'quote', e.quote)), '[]'::jsonb)
  from public.ch_evidence e where e.source_id = p_source_id
$$;

-- Versão que esta fonte substituiu (para comparar sozinho quando o PDF novo termina de ser lido).
create function public.ch_worker_predecessor_source(p_source_id uuid) returns uuid
  language sql stable security definer set search_path = ''
as $$ select id from public.ch_sources where superseded_by = p_source_id order by created_at desc limit 1 $$;

-- Guarda a leitura atual e devolve a anterior (para o worker comparar).
create function public.ch_worker_watch_snapshot(p_source_id uuid, p_passages jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_old jsonb;
begin
  select snapshot into v_old from public.ch_source_watch where source_id = p_source_id;
  update public.ch_source_watch set snapshot = p_passages where source_id = p_source_id;
  return v_old;
end
$$;

-- Grava a comparação e aplica o impacto às atualizações já enfileiradas (só as da fonte comparada).
--   p_diff: {source_id, new_source_id, origin, old_hash, new_hash, summary, items:[{kind, section, old_text, new_text, similarity, critical}],
--            impacts:[{claim_id, level, critical, kind, item_index, reason}]}
create function public.ch_worker_record_source_diff(p_diff jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_diff uuid;
  i jsonb;
  v_item uuid;
  v_ids uuid[] := '{}';
  v_touched integer := 0;
  n integer;
begin
  insert into public.ch_source_diffs (source_id, new_source_id, origin, old_hash, new_hash, summary)
  values ((p_diff ->> 'source_id')::uuid, nullif(p_diff ->> 'new_source_id', '')::uuid, p_diff ->> 'origin', p_diff ->> 'old_hash', p_diff ->> 'new_hash', coalesce(p_diff -> 'summary', '{}'::jsonb))
  returning id into v_diff;
  for i in select * from jsonb_array_elements(coalesce(p_diff -> 'items', '[]'::jsonb)) loop
    insert into public.ch_source_diff_items (diff_id, idx, kind, section, old_text, new_text, similarity, critical)
    values (v_diff, coalesce(array_length(v_ids, 1), 0), i ->> 'kind', i ->> 'section', i ->> 'old_text', i ->> 'new_text', nullif(i ->> 'similarity', '')::numeric, coalesce((i ->> 'critical')::boolean, false))
    returning id into v_item;
    v_ids := v_ids || v_item;
  end loop;
  for i in select * from jsonb_array_elements(coalesce(p_diff -> 'impacts', '[]'::jsonb)) loop
    -- a fila já existe (nasceu da mudança da fonte); aqui ela ganha triagem. Quem já foi decidido por pessoa não é tocado.
    update public.question_updates u set
      impact_level = i ->> 'level',
      status = 'review_required',
      critical = coalesce((i ->> 'critical')::boolean, false),
      triage_kind = i ->> 'kind',
      diff_id = v_diff,
      diff_item_id = case when nullif(i ->> 'item_index', '') is null then null else v_ids[(i ->> 'item_index')::int + 1] end,
      reason = left(coalesce(u.reason, '') || case when u.reason is null then '' else ' | ' end || 'Comparação de conteúdo: ' || (i ->> 'reason'), 1000)
    where u.old_claim_id = (i ->> 'claim_id')::uuid and u.old_source_id = (p_diff ->> 'source_id')::uuid and u.status in ('queued', 'review_required') and u.diff_id is null;
    get diagnostics n = row_count;
    v_touched := v_touched + n;
  end loop;
  return jsonb_build_object('diff_id', v_diff, 'items', coalesce(array_length(v_ids, 1), 0), 'updates_triaged', v_touched);
end
$$;

-- ---------------------------------------------------------------- leitura para a equipe
create function public.app_source_diffs(p_source_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'origin', d.origin, 'created_at', d.created_at, 'summary', d.summary, 'new_source_id', d.new_source_id,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'section', x.section, 'old_text', x.old_text, 'new_text', x.new_text, 'similarity', x.similarity, 'critical', x.critical) order by x.idx)
                filter (where x.kind <> 'UNCHANGED'), '[]'::jsonb) from public.ch_source_diff_items x where x.diff_id = d.id)) order by d.created_at desc)
    from public.ch_source_diffs d where d.source_id = p_source_id or d.new_source_id = p_source_id), '[]'::jsonb);
end
$$;

-- painel de alertas: acrescenta a triagem (críticos e quantos já têm comparação de conteúdo)
create or replace function public.app_question_update_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'questions_with_claims', (select count(distinct question_id)::int from public.question_claims),
    'claims', (select count(*)::int from public.ch_claims where origin = 'question_dna'),
    'claims_with_official_evidence', (select count(distinct c.id)::int from public.ch_claims c join public.question_claims qc on qc.claim_id = c.id
        join public.ch_evidence e on e.claim_id = c.id and e.verdict = 'compatible' and not e.stale join public.ch_sources s on s.id = e.source_id and s.authority_level in ('A', 'B', 'C', 'D')),
    'by_status', coalesce((select jsonb_object_agg(x.status, x.n) from (select status, count(distinct question_id)::int n from public.question_updates group by status) x), '{}'::jsonb),
    'by_impact', coalesce((select jsonb_object_agg(x.impact_level, x.n) from (select impact_level, count(distinct question_id)::int n from public.question_updates where status in ('queued', 'analyzing', 'review_required') group by impact_level) x), '{}'::jsonb),
    'critical_open', (select count(distinct question_id)::int from public.question_updates where critical and status in ('queued', 'analyzing', 'review_required')),
    'with_content_diff', (select count(distinct question_id)::int from public.question_updates where diff_id is not null));
end
$$;

-- o que a pessoa que revisa vê de cada questão ganha a triagem
create or replace function public.app_question_knowledge(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'question_id', p_question_id,
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'claim_id', c.id, 'role', qc.role, 'statement', c.statement, 'status', c.status, 'origin', c.origin, 'context', c.context,
        'shared_with', (select count(*)::int from public.question_claims o where o.claim_id = c.id and o.question_id <> p_question_id),
        'evidence', coalesce((select jsonb_agg(jsonb_build_object('source', s.title, 'organ', s.organ, 'authority_level', s.authority_level, 'version', e.source_version, 'page', e.page,
                       'section', e.section, 'quote', e.quote, 'verdict', e.verdict, 'stale', e.stale, 'source_status', s.status, 'source_kind', s.kind, 'url', s.url, 'published_on', s.published_on,
                       'valid_until', s.valid_until, 'official', s.authority_level in ('A', 'B', 'C', 'D')) order by e.created_at)
                     from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id), '[]'::jsonb)) order by qc.role, c.created_at)
      from public.question_claims qc join public.ch_claims c on c.id = qc.claim_id where qc.question_id = p_question_id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'detected_at', u.detected_at, 'change_type', u.change_type, 'impact_level', u.impact_level, 'status', u.status, 'reason', u.reason,
                'critical', u.critical, 'triage_kind', u.triage_kind, 'diff_id', u.diff_id) order by u.detected_at desc)
      from public.question_updates u where u.question_id = p_question_id), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- registro de fontes: campos, frescor e ciclo da mudança
-- Uma só regra para "esta fonte está em dia?". Fonte substituída ou retirada mantém o que já estava gravado.
--   SOURCE_CHANGED   a publicação mudou e ninguém analisou ainda
--   REVIEW_REQUIRED  há afirmação cuja única evidência nesta fonte ficou desatualizada
--   FRESH            monitorada, última conferência ok e dentro do prazo
--   CHECK_DUE        monitorada, mas a conferência está vencida ou a publicação ficou inacessível
--   UNKNOWN          não monitorada: ninguém confere se mudou
create function public.ch_source_freshness(p_source_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when s.status <> 'current' then s.freshness_status
    when exists (select 1 from public.ch_source_changes c where c.source_id = s.id and c.resolved_at is null) then 'SOURCE_CHANGED'
    when exists (select 1 from public.ch_evidence e where e.source_id = s.id and e.stale
                 and not exists (select 1 from public.ch_evidence f where f.claim_id = e.claim_id and f.source_id = s.id and not f.stale)) then 'REVIEW_REQUIRED'
    when w.source_id is null then 'UNKNOWN'
    when w.last_checked_at is null or w.next_check_at < now() or w.last_status = 'unreachable' then 'CHECK_DUE'
    else 'FRESH' end
  from public.ch_sources s left join public.ch_source_watch w on w.source_id = s.id
  where s.id = p_source_id
$$;

-- O vigia passa a gravar o frescor a cada conferência (a regra de mudança é a mesma de antes).
create or replace function public.ch_worker_watch_result(p_source_id uuid, p_hash text, p_status text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  w public.ch_source_watch;
  n integer := 0;
  v_changed boolean;
begin
  select * into w from public.ch_source_watch where source_id = p_source_id;
  if not found then return null; end if;
  v_changed := p_status = 'ok' and w.last_hash is not null and p_hash is distinct from w.last_hash;
  if v_changed then
    n := public.ch_flag_dependents(p_source_id, 'A publicação monitorada mudou (conteúdo diferente do conferido): rever as afirmações.');
    insert into public.ch_source_changes (source_id, old_hash, new_hash, candidate_versions) values (p_source_id, w.last_hash, p_hash, n);
  end if;
  update public.ch_source_watch set last_status = case when v_changed then 'changed' else p_status end, last_checked_at = now(),
         last_hash = case when p_status = 'ok' then p_hash else last_hash end, next_check_at = now() + make_interval(days => interval_days)
   where source_id = p_source_id;
  update public.ch_sources set freshness_status = public.ch_source_freshness(p_source_id) where id = p_source_id;
  return jsonb_build_object('changed', v_changed, 'candidate_versions', n);
end
$$;

-- Campos do registro (item 60): país, SUS, especialidade, tema, vigência, revisão e "em atualização".
create function public.app_ch_set_source_registry(p_source_id uuid, p_fields jsonb) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_fields ? 'country' and coalesce(p_fields ->> 'country', '') !~ '^[A-Z]{2}$' then
    raise exception 'País: use a sigla de duas letras (ex.: BR).' using errcode = '22023';
  end if;
  update public.ch_sources set
    country = case when p_fields ? 'country' then p_fields ->> 'country' else country end,
    applies_to_sus = case when p_fields ? 'applies_to_sus' then coalesce((p_fields ->> 'applies_to_sus')::boolean, false) else applies_to_sus end,
    specialty = case when p_fields ? 'specialty' then nullif(btrim(p_fields ->> 'specialty'), '') else specialty end,
    theme = case when p_fields ? 'theme' then nullif(btrim(p_fields ->> 'theme'), '') else theme end,
    effective_date = case when p_fields ? 'effective_date' then nullif(p_fields ->> 'effective_date', '')::date else effective_date end,
    revision_date = case when p_fields ? 'revision_date' then nullif(p_fields ->> 'revision_date', '')::date else revision_date end,
    update_in_progress = case when p_fields ? 'update_in_progress' then coalesce((p_fields ->> 'update_in_progress')::boolean, false) else update_in_progress end
  where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('source.registry', p_source_id::text, p_fields);
  return true;
end
$$;

-- A mudança detectada foi analisada por uma pessoa (com nota). Não devolve validade a nenhuma evidência:
-- quem ficou desatualizado continua exigindo nova conferência (o frescor passa a "revisão necessária").
create function public.app_ch_resolve_source_change(p_source_id uuid, p_note text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Descreva o que foi analisado (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.ch_source_changes set resolved_at = now(), resolved_by = (select auth.uid()), note = btrim(p_note) where source_id = p_source_id and resolved_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Não há mudança pendente nesta fonte.' using errcode = 'P0002'; end if;
  update public.ch_sources set freshness_status = public.ch_source_freshness(p_source_id) where id = p_source_id and status = 'current';
  perform public.ch_log('source.change_resolved', p_source_id::text, jsonb_build_object('changes', n, 'note', btrim(p_note)));
  return n;
end
$$;

-- lista de fontes: frescor calculado, quantas comparações existem e se dá para comparar com a versão nova
-- (a leitura guardada pelo vigia não vai para o navegador)
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
      'successor_passages', (select count(*)::int from public.ch_source_passages p where p.source_id = s.superseded_by)) order by s.organ, s.title, s.created_at desc)
    from public.ch_sources s), '[]'::jsonb);
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_predecessor_source(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_source_passages(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_source_evidence(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_watch_snapshot(uuid, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_worker_record_source_diff(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_source_freshness(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_watch_result(uuid, text, text) from public, anon, authenticated;
  revoke execute on function public.app_ch_set_source_registry(uuid, jsonb) from public, anon;
  revoke execute on function public.app_ch_resolve_source_change(uuid, text) from public, anon;
  revoke execute on function public.app_ch_sources() from public, anon;
  revoke execute on function public.app_source_diffs(uuid) from public, anon;
  revoke execute on function public.app_question_update_summary() from public, anon;
  revoke execute on function public.app_question_knowledge(text) from public, anon;
end
$revoke$;
