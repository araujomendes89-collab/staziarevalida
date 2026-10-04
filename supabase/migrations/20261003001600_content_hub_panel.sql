-- =============================================================================
-- Central de Conteúdo: apoio ao painel.
--   - revisor médico enxerga a área de revisão (app_bootstrap traz as áreas dele);
--   - regenerar materiais e arquivos finais de UMA versão editada à mão (sem duplicar);
--   - trava: a aula (material) precisa ser exatamente o texto atual da unidade;
--   - consumo e custo das chamadas de IA.
-- =============================================================================

create or replace function public.app_bootstrap() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'onboarding' from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'reviewer_areas', coalesce((select jsonb_agg(r.area_code order by r.area_code) from public.ch_reviewer_areas r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'subscription', (
      select jsonb_build_object('plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = (select auth.uid())
    ),
    'has_pro', public.has_pro(),
    'streak_days', public.my_streak_days(),
    'flashcards_due', (
      select count(*)::int from public.flashcard_states f
      where f.user_id = (select auth.uid()) and f.due <= now()
    ),
    'days_to_exam', (
      select case when p.exam_date is null then null else greatest(p.exam_date - public.today_br(), 0) end
      from public.profiles p where p.id = (select auth.uid())
    ),
    'totals', jsonb_build_object(
      'questions', (select count(*)::int from public.questions),
      'answered', (select count(distinct a.question_id)::int from public.question_attempts a
                   where a.user_id = (select auth.uid()))
    )
  )
$$;

-- ---------------------------------------------------------------- fila: trabalho de uma versão (sem documento)
create or replace function public.ch_worker_enqueue(p_document_id uuid, p_step text, p_scope_key text, p_versions jsonb, p_max_attempts integer default 3) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := coalesce(p_document_id::text, 'sem-documento') || '|' || p_step || '|' || coalesce(p_scope_key, '') || '|' || public.ch_hash(coalesce(p_versions, '{}'::jsonb));
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

drop function public.ch_worker_next(uuid, text, jsonb);
create function public.ch_worker_next(p_document_id uuid, p_step text, p_versions jsonb, p_scope_key text default '') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb;
begin
  r := public.ch_worker_enqueue(p_document_id, p_step, coalesce(p_scope_key, ''), p_versions, 3);
  if (r ->> 'duplicate')::boolean then
    update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = '{}'::jsonb
     where id = (r ->> 'id')::uuid and status in ('succeeded', 'failed', 'dead', 'blocked');
  end if;
  return r;
end
$$;

create function public.ch_worker_unit_version(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('version_id', v.id, 'unit_id', v.unit_id, 'status', v.status, 'content', v.content, 'content_hash', v.content_hash,
           'version', v.version, 'created_at', v.created_at, 'origin', v.origin, 'scope_note', v.scope_note, 'review_flags', v.review_flags,
           'title', u.title, 'theme_node_id', u.theme_node_id)
  from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id = p_version_id
$$;

-- Depois de editar o texto de uma unidade: materiais, arquivos finais e revisão automática de novo,
-- só para esta versão. A versão volta a rascunho e as aprovações deixam de valer.
create function public.app_ch_regenerate(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_doc uuid;
  r jsonb;
begin
  perform public.ch_assert_staff();
  if not public.is_staff() then raise exception 'Somente editor ou administrador.' using errcode = '42501'; end if;
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status in ('published', 'retired', 'needs_update') then raise exception 'Versão publicada não se altera: crie uma nova versão.' using errcode = '22023'; end if;
  perform public.ch_invalidate_approvals(p_version_id, 'materiais gerados de novo');
  select c.document_id into v_doc from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id
   where uc.unit_version_id = p_version_id and c.document_id is not null order by c.created_at limit 1;
  r := public.ch_worker_next(v_doc, 'materials', jsonb_build_object('content_hash', v.content_hash), 'version:' || p_version_id::text);
  perform public.ch_log('unit.regenerate', p_version_id::text, jsonb_build_object('hash', v.content_hash));
  return r;
end
$$;

-- ---------------------------------------------------------------- trava: aula = texto atual da unidade
create or replace function public.ch_publish_problems(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  p text[] := public.ch_publish_problems_base(p_version_id);
  r record;
  v public.ch_unit_versions;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then return p; end if;
  if coalesce(v.generated_by_model, '') like 'mock%' then
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
  if not exists (select 1 from public.ch_materials m where m.unit_version_id = p_version_id and m.kind = 'lesson') then
    p := array_append(p, 'Falta a aula (material "lesson") desta versão.');
  elsif exists (select 1 from public.ch_materials m where m.unit_version_id = p_version_id and m.kind = 'lesson'
                and m.content -> 'sections' is distinct from v.content -> 'sections') then
    p := array_append(p, 'A aula não corresponde ao texto atual da unidade: gere os materiais de novo.');
  end if;
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

-- ---------------------------------------------------------------- consumo e custo da IA (piloto)
create function public.app_ch_ai_usage() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'by_step', coalesce((select jsonb_agg(x order by x ->> 'step', x ->> 'model') from (
        select jsonb_build_object('step', r.step, 'provider', r.provider, 'model', r.model, 'calls', count(*),
          'ok', count(*) filter (where r.status = 'ok'), 'rejected_by_check', count(*) filter (where r.status = 'rejected_by_check'),
          'invalid_output', count(*) filter (where r.status = 'invalid_output'), 'failed', count(*) filter (where r.status = 'failed'),
          'input_tokens', sum(r.input_tokens), 'output_tokens', sum(r.output_tokens), 'cost_usd', sum(r.cost_usd),
          'cost_known', count(r.cost_usd), 'avg_latency_ms', round(avg(r.latency_ms))) as x
        from public.ch_ai_runs r group by r.step, r.provider, r.model) s), '[]'::jsonb),
    'by_document', coalesce((select jsonb_agg(x order by (x ->> 'calls')::int desc) from (
        select jsonb_build_object('document_id', d.id, 'name', d.name, 'pages', d.page_count, 'calls', count(r.*),
          'input_tokens', sum(r.input_tokens), 'output_tokens', sum(r.output_tokens), 'cost_usd', sum(r.cost_usd)) as x
        from public.ch_documents d join public.ch_ai_runs r on r.document_id = d.id group by d.id limit 50) s), '[]'::jsonb),
    'jobs', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*)::int as n from public.ch_jobs group by status) s), '{}'::jsonb));
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
