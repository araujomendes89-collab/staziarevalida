-- =============================================================================
-- VIGILÂNCIA CIENTÍFICA (2/2): funções do painel "Vigilância científica" (Administração › Central de Conteúdo, ramo
-- vigilancia-painel) e a função de IA "Análise do que mudou" (DESLIGADA até a equipe configurar na Central de IAs).
-- Spec: docs/superpowers/specs/2026-10-12-vigilancia-cientifica.md (contrato do painel).
--
-- Todas: security definer, search_path vazio, só a EQUIPE (administrador e editor); aluno e anônimo barrados (assert_staff e
-- revoke). Cada decisão vai para o Registro da Administração (admin_audit_log).
-- Vocabulário que o banco devolve: fonte.nivel = nível de autoridade da biblioteca (A a E; nulo = não informado);
-- fonte.status = situação na biblioteca (current = vigente, superseded = substituída, withdrawn = retirada/retratada/bloqueada).
-- Precisa da 9910 (ai_function_keys). Função nova da Central de IAs: analise_mudancas. As restrições ch_jobs_step_check e ai_functions_key_check são refeitas com a UNIÃO do que existe.
-- Pode ser colada mais de uma vez.
-- =============================================================================

-- ---------------------------------------------------------------- 1. fila e Central de IAs: valores novos (união)
do $union$
declare
  v_def text;
  v_vals text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c where c.conrelid = 'public.ch_jobs'::regclass and c.conname = 'ch_jobs_step_check';
  v_vals := array['source_change_analysis'] || coalesce(array(select m[1] from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') as m), '{}');
  v_vals := array(select distinct x from unnest(v_vals) x order by x);
  alter table public.ch_jobs drop constraint if exists ch_jobs_step_check;
  execute format('alter table public.ch_jobs add constraint ch_jobs_step_check check (step in (%s))', (select string_agg(quote_literal(x), ', ') from unnest(v_vals) x));

  -- chaves das funções: a ORDEM da restrição é a ordem da Central de IAs (ai_function_keys); a nova vai para o fim
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c where c.conrelid = 'public.ai_functions'::regclass and c.conname = 'ai_functions_key_check';
  v_vals := coalesce(array(select m[1] from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') as m), '{}');
  if not ('analise_mudancas' = any (v_vals)) then v_vals := v_vals || 'analise_mudancas'::text; end if;
  alter table public.ai_functions drop constraint if exists ai_functions_key_check;
  execute format('alter table public.ai_functions add constraint ai_functions_key_check check (key in (%s))', (select string_agg(quote_literal(x), ', ') from unnest(v_vals) x));
end
$union$;

-- ch_worker_ai_save_function e app_ai_summary já leem a lista de funções da restrição (ai_function_keys, migração 9910):
-- basta a união acima para a função nova aparecer e poder ser salva.

-- "Análise do que mudou" ligada: configuração salva com IA principal (ou reserva) LIGADA na Central de IAs.
create or replace function public.ch_vigilance_analysis_on() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.ai_functions f
                  where f.key = 'analise_mudancas' and f.primary_ref is not null
                    and exists (select 1 from public.ai_providers p where p.enabled
                                  and (p.id = f.primary_ref ->> 'provider' or p.id = f.fallback_ref ->> 'provider')))
$$;

-- ---------------------------------------------------------------- 2. leitura
create or replace function public.ch_vigilance_item_json(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'tipo', i.kind,
    -- documento descoberto numa página-índice (ainda fora da biblioteca): fonte sem id, com o título e o link achados, status 'descoberto'
    'fonte', case when s.id is not null then jsonb_build_object('id', s.id, 'titulo', s.title, 'orgao', s.organ, 'versao', s.version, 'url', s.url, 'nivel', s.authority_level, 'status', s.status)
                  else jsonb_build_object('id', null, 'titulo', i.version_candidates -> 0 ->> 'titulo', 'orgao', i.details ->> 'pagina_titulo', 'versao', null,
                                          'url', i.version_candidates -> 0 ->> 'url', 'nivel', null, 'status', 'descoberto') end,
    'detectado_em', i.detected_at, 'resumo', i.summary, 'versoes_candidatas', i.version_candidates, 'situacao', i.status,
    'questoes_afetadas', case when i.kind = 'fonte_nova' then null else
      (select count(distinct qc.question_id)::int from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id where e.source_id = s.id) end,
    'tema', case when i.theme_node_id is not null then jsonb_build_object('id', i.theme_node_id, 'nome', (select n.name from public.ch_taxonomy_nodes n where n.id = i.theme_node_id)) end,
    'nota', i.note,
    'analise', case when i.analysis_status is not null then jsonb_build_object('situacao', i.analysis_status, 'resultado', i.analysis, 'pedida_em', i.analysis_requested_at, 'job_id', i.analysis_job_id) end,
    'detalhes', i.details)
  from public.ch_vigilance_items i left join public.ch_sources s on s.id = i.source_id
  where i.id = p_id
$$;

create or replace function public.app_admin_vigilance_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'novas_fontes', (select count(*)::int from public.ch_vigilance_items where kind = 'fonte_nova' and status = 'pendente'),
    'em_revisao', (select count(distinct source_id)::int from public.ch_vigilance_items where kind <> 'fonte_nova' and status in ('pendente', 'vista')),
    'bloqueadas', (select count(*)::int from public.ch_sources s left join public.ch_source_vigilance v on v.source_id = s.id
                    where s.retracted_at is not null or coalesce(v.blocked, false)),
    'quarentena', (select count(*)::int from public.ch_sources s
                    where s.status = 'current' and coalesce((public.ch_source_quality_eval(s.id) ->> 'quarentena')::boolean, false)),
    'vigiadas', (select count(*)::int from public.ch_source_watch where domain_id is not null),
    'links_fora_do_ar', (select count(*)::int from public.ch_source_watch where last_status = 'unreachable'),
    'proxima_verificacao', (select min(next_check_at) from public.ch_source_watch where domain_id is not null),
    'ultima_execucao', (select greatest((select max(last_checked_at) from public.ch_source_watch), (select max(crossref_checked_at) from public.ch_source_vigilance))),
    'funcao_analise_ligada', public.ch_vigilance_analysis_on(),
    'identificadores', jsonb_build_object('com_doi', (select count(*)::int from public.ch_sources where doi is not null),
                                          'proxima_conferencia', (select min(v.crossref_next_at) from public.ch_source_vigilance v join public.ch_sources s on s.id = v.source_id where s.doi is not null)),
    'por_dominio', coalesce((select jsonb_agg(jsonb_build_object('dominio', d.address, 'intervalo_dias', public.ch_watch_interval_for(d.id), 'fontes', x.n,
                                  'ultima_verificacao', x.last, 'proxima_verificacao', x.next) order by x.n desc, d.address)
                             from public.ch_official_domains d
                             cross join lateral (select count(w.source_id)::int as n, max(w.last_checked_at) as last, min(w.next_check_at) as next
                                                   from public.ch_source_watch w where w.domain_id = d.id) x
                            where d.active), '[]'::jsonb));
end
$$;

create or replace function public.app_admin_vigilance_queue(p_filter text default 'pendentes', p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_f text := coalesce(p_filter, 'pendentes');
  v_kind text;
begin
  perform public.assert_staff();
  if v_f not in ('pendentes', 'mudancas', 'novas_versoes', 'retratadas', 'quarentena', 'fora_do_ar', 'todas') then
    raise exception 'Filtro desconhecido: %.', v_f using errcode = '22023';
  end if;
  v_kind := case v_f when 'mudancas' then 'mudanca' when 'novas_versoes' then 'nova_versao' when 'retratadas' then 'retratada'
                     when 'quarentena' then 'quarentena' when 'fora_do_ar' then 'fora_do_ar' end;
  return (
    with f as (
      select i.id, i.status, i.detected_at from public.ch_vigilance_items i
       where (v_f <> 'pendentes' or i.status in ('pendente', 'vista')) and (v_kind is null or i.kind = v_kind)
    )
    select jsonb_build_object('total', (select count(*)::int from f),
      'items', coalesce((select jsonb_agg(public.ch_vigilance_item_json(p.id) order by p.ord)
                           from (select f.id, row_number() over (order by (f.status in ('pendente', 'vista')) desc, f.detected_at desc, f.id) as ord from f
                                 order by ord offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)) p), '[]'::jsonb)));
end
$$;

create or replace function public.app_admin_source_quality(p_source_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_staff();
  v := public.ch_source_quality_eval(p_source_id);
  if v is null then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  return v;
end
$$;

-- ---------------------------------------------------------------- 3. decisões da equipe
-- Bloquear = bloquear a FONTE: sai das vigentes e o que dependia dela vai para revisão.
create or replace function public.ch_vigilance_block(p_source_id uuid, p_note text, p_uid uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ch_source_vigilance (source_id) values (p_source_id) on conflict (source_id) do nothing;
  if exists (select 1 from public.ch_source_vigilance where source_id = p_source_id and blocked) then return; end if;
  update public.ch_source_vigilance set blocked = true, blocked_note = p_note, blocked_by = p_uid, blocked_at = now(), updated_at = now() where source_id = p_source_id;
  perform public.ch_vigilance_withdraw(p_source_id, left('Fonte bloqueada pela equipe: ' || p_note, 500));
end
$$;

create or replace function public.app_admin_vigilance_mark(p_id uuid, p_action text, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  i public.ch_vigilance_items;
  s public.ch_sources;
  v public.ch_source_vigilance;
  v_uid uuid := (select auth.uid());
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  perform public.assert_staff();
  if p_action is null or p_action not in ('vista', 'bloquear', 'desbloquear', 'resolver') then
    raise exception 'Ação desconhecida: %.', p_action using errcode = '22023';
  end if;
  select * into i from public.ch_vigilance_items where id = p_id for update;
  if not found then raise exception 'Item da vigilância não encontrado.' using errcode = 'P0002'; end if;
  select * into s from public.ch_sources where id = i.source_id for update;
  select * into v from public.ch_source_vigilance where source_id = i.source_id;
  if i.source_id is null and p_action in ('bloquear', 'desbloquear') then
    raise exception 'Este documento ainda não está na biblioteca: cadastre a fonte (Fontes) antes de bloquear ou desbloquear.' using errcode = '22023';
  end if;

  if p_action = 'vista' then
    update public.ch_vigilance_items set status = case when status = 'pendente' then 'vista' else status end,
           seen_by = coalesce(seen_by, v_uid), seen_at = coalesce(seen_at, now()), note = coalesce(v_note, note) where id = p_id;
  elsif p_action = 'bloquear' then
    if char_length(coalesce(v_note, '')) < 10 then raise exception 'Escreva o motivo do bloqueio (pelo menos 10 caracteres).' using errcode = '22023'; end if;
    perform public.ch_vigilance_block(i.source_id, v_note, v_uid);
    update public.ch_vigilance_items set status = 'bloqueada', decided_by = v_uid, decided_at = now(), note = v_note where id = p_id;
  elsif p_action = 'desbloquear' then
    if s.retracted_at is not null then
      raise exception 'Artigo retratado continua bloqueado (regra do sistema). Se o DOI desta fonte estiver errado, corrija o DOI.' using errcode = '22023';
    end if;
    if not coalesce(v.blocked, false) then raise exception 'Esta fonte não está bloqueada.' using errcode = '22023'; end if;
    update public.ch_source_vigilance set blocked = false, blocked_note = null, blocked_by = null, blocked_at = null, prior_status = null, updated_at = now()
     where source_id = i.source_id;
    -- volta a vigente só se era vigente e nenhuma versão nova a substituiu; as evidências continuam pedindo nova conferência
    if v.prior_status = 'current' and s.status = 'withdrawn' and s.superseded_by is null then
      update public.ch_sources set status = 'current' where id = i.source_id;
    end if;
    update public.ch_vigilance_items set status = 'resolvida', decided_by = v_uid, decided_at = now(), note = coalesce(v_note, 'Fonte desbloqueada.') where id = p_id;
  else
    if i.kind = 'quarentena' then
      -- conferida pela equipe: sai da quarentena (decisão gravada; pode ser desfeita em app_admin_source_quality_override)
      insert into public.ch_source_vigilance (source_id) values (i.source_id) on conflict (source_id) do nothing;
      update public.ch_source_vigilance set quarantine_override = false, override_note = coalesce(v_note, 'Conferida pela equipe na fila da vigilância.'),
             override_by = v_uid, override_at = now(), updated_at = now() where source_id = i.source_id;
    end if;
    if i.change_id is not null then
      update public.ch_source_changes set resolved_at = now(), resolved_by = v_uid, note = coalesce(v_note, 'Resolvida na Vigilância científica.')
       where id = i.change_id and resolved_at is null;
      update public.ch_sources set freshness_status = public.ch_source_freshness(i.source_id) where id = i.source_id and status = 'current';
    end if;
    update public.ch_vigilance_items set status = 'resolvida', decided_by = v_uid, decided_at = now(), note = coalesce(v_note, note) where id = p_id;
  end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (v_uid, 'vigilance.mark', p_id::text, jsonb_build_object('acao', p_action, 'fonte', i.source_id, 'titulo', s.title, 'tipo', i.kind, 'nota', v_note));
  return public.ch_vigilance_item_json(p_id);
end
$$;

create or replace function public.app_admin_vigilance_set_interval(p_domain text, p_interval_days integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.ch_official_domains;
  v_addr text := lower(btrim(coalesce(p_domain, '')));
begin
  perform public.assert_staff();
  if p_interval_days is null or p_interval_days not between 1 and 90 then
    raise exception 'A frequência vai de 1 a 90 dias.' using errcode = '22023';
  end if;
  select * into d from public.ch_official_domains where address = v_addr for update;
  if not found then raise exception 'Site fora da lista de sites oficiais: %.', v_addr using errcode = 'P0002'; end if;
  update public.ch_official_domains set watch_interval_days = p_interval_days, updated_by = (select auth.uid()), updated_at = now() where id = d.id;
  update public.ch_source_watch set interval_days = p_interval_days,
         next_check_at = least(next_check_at, coalesce(last_checked_at, now()) + make_interval(days => p_interval_days))
   where domain_id = d.id;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.interval', v_addr, jsonb_build_object('antes', public.ch_watch_interval_for(d.id), 'dias', p_interval_days));
  return jsonb_build_object('dominio', v_addr, 'intervalo_dias', p_interval_days);
end
$$;

create or replace function public.app_admin_source_quality_override(p_source_id uuid, p_quarentena boolean, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  perform public.assert_staff();
  if not exists (select 1 from public.ch_sources where id = p_source_id) then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if char_length(coalesce(v_note, '')) < 10 then raise exception 'Escreva o motivo da decisão (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  insert into public.ch_source_vigilance (source_id) values (p_source_id) on conflict (source_id) do nothing;
  -- p_quarentena nulo devolve a decisão à regra
  update public.ch_source_vigilance set quarantine_override = p_quarentena, override_note = case when p_quarentena is null then null else v_note end,
         override_by = case when p_quarentena is null then null else (select auth.uid()) end, override_at = case when p_quarentena is null then null else now() end,
         updated_at = now()
   where source_id = p_source_id;
  perform public.ch_worker_vigilance_sync();
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.quality_override', p_source_id::text,
          jsonb_build_object('quarentena', p_quarentena, 'nota', v_note, 'titulo', (select title from public.ch_sources where id = p_source_id)));
  return public.ch_source_quality_eval(p_source_id);
end
$$;

-- Corrigir DOI/PMID (ex.: DOI errado que trouxe uma retratação de outro artigo). Trocar o DOI apaga a retratação vinda do
-- Crossref e pede nova conferência; a fonte volta a vigente só se era vigente e não foi substituída.
create or replace function public.app_admin_source_set_identifiers(p_source_id uuid, p_doi text, p_pmid text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.ch_sources;
  v public.ch_source_vigilance;
  v_doi text := lower(nullif(btrim(regexp_replace(coalesce(p_doi, ''), '^\s*(https?://(dx\.)?doi\.org/|doi:\s*)', '', 'i')), ''));
  v_pmid text := nullif(btrim(coalesce(p_pmid, '')), '');
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  perform public.assert_staff();
  select * into s from public.ch_sources where id = p_source_id for update;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if char_length(coalesce(v_note, '')) < 10 then raise exception 'Escreva o motivo da correção (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if v_doi is not null and v_doi !~ '^10\.[0-9]{4,9}/\S+$' then raise exception 'DOI inválido (formato 10.xxxx/...).' using errcode = '22023'; end if;
  if v_pmid is not null and v_pmid !~ '^[0-9]{1,9}$' then raise exception 'PMID inválido (só números).' using errcode = '22023'; end if;
  select * into v from public.ch_source_vigilance where source_id = p_source_id;
  update public.ch_sources set doi = v_doi, pmid = v_pmid where id = p_source_id;
  if v_doi is distinct from s.doi then
    if s.retracted_at is not null then
      update public.ch_sources set retracted_at = null, retraction_note = null, retraction_notice_doi = null,
             status = case when v.prior_status = 'current' and status = 'withdrawn' and superseded_by is null and not coalesce(v.blocked, false) then 'current' else status end
       where id = p_source_id;
      update public.ch_vigilance_items set status = 'resolvida', decided_by = (select auth.uid()), decided_at = now(), note = 'DOI corrigido: ' || v_note
       where source_id = p_source_id and kind = 'retratada' and status in ('pendente', 'vista');
    end if;
    insert into public.ch_source_vigilance (source_id) values (p_source_id) on conflict (source_id) do nothing;
    update public.ch_source_vigilance set crossref_status = null, crossref_next_at = null, crossref_checked_at = null, crossref_title = null,
           crossref_alerts = '[]'::jsonb, updated_at = now() where source_id = p_source_id;
  end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.identifiers', p_source_id::text, jsonb_build_object('titulo', s.title, 'doi', v_doi, 'pmid', v_pmid, 'doi_antes', s.doi, 'nota', v_note));
  return jsonb_build_object('id', p_source_id, 'doi', v_doi, 'pmid', v_pmid);
end
$$;

-- ---------------------------------------------------------------- 4. análise do que mudou (IA só quando a equipe pede)
create or replace function public.app_admin_vigilance_request_analysis(p_item_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  i public.ch_vigilance_items;
  v_job uuid;
begin
  perform public.assert_staff();
  select * into i from public.ch_vigilance_items where id = p_item_id for update;
  if not found then raise exception 'Item da vigilância não encontrado.' using errcode = 'P0002'; end if;
  if i.kind not in ('mudanca', 'nova_versao') then
    raise exception 'A análise do que mudou só existe para mudança de conteúdo ou versão nova.' using errcode = '22023';
  end if;
  if not public.ch_vigilance_analysis_on() then
    raise exception 'A função ''Análise do que mudou'' está desligada na Central de IAs.' using errcode = 'P0001';
  end if;
  if i.analysis_job_id is not null and exists (select 1 from public.ch_jobs j where j.id = i.analysis_job_id and j.status in ('queued', 'running', 'blocked')) then
    return jsonb_build_object('pedido', true, 'job_id', i.analysis_job_id, 'repetido', true);
  end if;
  insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts)
  values (null, 'source_change_analysis', 'vigilancia:' || i.id::text, 'vigilancia:' || i.id::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint, '{}'::jsonb, 2)
  returning id into v_job;
  update public.ch_vigilance_items set analysis_job_id = v_job, analysis_status = 'pedida', analysis = null,
         analysis_requested_by = (select auth.uid()), analysis_requested_at = now() where id = i.id;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.analysis_request', i.id::text, jsonb_build_object('fonte', i.source_id, 'job_id', v_job));
  return jsonb_build_object('pedido', true, 'job_id', v_job);
end
$$;

-- O que o processamento manda para a IA: só dados (metadados, candidatas e os trechos que mudaram, cortados).
create or replace function public.ch_worker_vigilance_analysis_input(p_item_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'item_id', i.id, 'tipo', i.kind, 'situacao_analise', i.analysis_status, 'pedido_por', i.analysis_requested_by,
    'fonte', jsonb_build_object('titulo', s.title, 'orgao', s.organ, 'versao', s.version, 'url', s.url, 'nivel', s.authority_level),
    'detectado_em', i.detected_at, 'versoes_candidatas', i.version_candidates,
    'trechos', coalesce((select jsonb_agg(jsonb_build_object('secao', x.section, 'antes', left(x.old_text, 1500), 'depois', left(x.new_text, 1500),
                                   'tipo', x.change_type, 'critico', x.critical) order by x.critical desc, x.idx)
                          from (select it.* from public.ch_source_diff_items it
                                 where it.diff_id = (select d.id from public.ch_source_diffs d where d.source_id = i.source_id
                                                       and d.created_at >= i.detected_at - interval '5 minutes' order by d.created_at desc limit 1)
                                   and it.kind <> 'UNCHANGED' order by it.critical desc, it.idx limit 40) x), '[]'::jsonb))
  from public.ch_vigilance_items i join public.ch_sources s on s.id = i.source_id
  where i.id = p_item_id
$$;

-- Resultado: só no próprio item (sugestão da IA para a equipe conferir). Nunca toca questão, aula nem fonte.
create or replace function public.ch_worker_vigilance_analysis_save(p_item_id uuid, p_status text, p_result jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_prev text := current_setting('staziamed.automacao', true);
begin
  if p_status is null or p_status not in ('pendente', 'pronta', 'sem_texto', 'falhou') then raise exception 'Situação inválida: %.', p_status using errcode = '22023'; end if;
  perform set_config('staziamed.automacao', 'vigilancia', true);
  update public.ch_vigilance_items set analysis_status = p_status, analysis = case when jsonb_typeof(p_result) = 'object' and pg_column_size(p_result) <= 200000 then p_result end
   where id = p_item_id;
  perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
end
$$;

-- trabalho da análise que morreu: o item mostra "falhou"
create or replace function public.ch_vigilance_analysis_job_dead() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_vigilance_items set analysis_status = 'falhou',
         analysis = jsonb_build_object('erro', left(coalesce(new.error, 'O processamento não terminou.'), 500))
   where analysis_job_id = new.id and analysis_status in ('pedida', 'pendente');
  return null;
end
$$;
drop trigger if exists ch_jobs_vigilance_analysis_dead on public.ch_jobs;
create trigger ch_jobs_vigilance_analysis_dead after update of status on public.ch_jobs for each row
  when (new.step = 'source_change_analysis' and new.status in ('dead', 'failed') and old.status is distinct from new.status)
  execute function public.ch_vigilance_analysis_job_dead();

-- ---------------------------------------------------------------- 5. permissões
do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ch_vigilance_analysis_on', 'ch_vigilance_item_json', 'ch_vigilance_block',
             'ch_worker_vigilance_analysis_input', 'ch_worker_vigilance_analysis_save', 'ch_vigilance_analysis_job_dead') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('app_admin_vigilance_summary', 'app_admin_vigilance_queue', 'app_admin_vigilance_mark',
             'app_admin_vigilance_set_interval', 'app_admin_source_quality', 'app_admin_source_quality_override', 'app_admin_source_set_identifiers',
             'app_admin_vigilance_request_analysis') loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$revoke$;
