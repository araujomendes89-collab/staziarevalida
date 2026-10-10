-- Conferência por outra empresa (decisão do dono, 2026-10-10): o processamento da Central de Conteúdo precisa saber qual IA
-- escreveu cada afirmação e cada versão, para que a evidência e a revisão automática sejam feitas por IA de outra empresa
-- (server/ai/maestro.ts, maestroCheckerProvider). O banco já guarda isso (ch_claims.created_by_model e
-- ch_unit_versions.generated_by_model, migração 1500); estas três funções passam a devolver o campo. Nada mais muda: as
-- versões abaixo são as mais novas (1500 e 1600) com um campo a mais, e continuam só do servidor.

create or replace function public.ch_worker_claims(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
           'critical_kinds', c.critical_kinds, 'context', c.context, 'theme_node_id', c.theme_node_id, 'block_id', c.block_id,
           'created_by_model', c.created_by_model) order by c.created_at), '[]'::jsonb)
  from public.ch_claims c where c.document_id = p_document_id
$$;

create or replace function public.ch_worker_unit_versions(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('version_id', v.id, 'unit_id', v.unit_id, 'status', v.status, 'content', v.content,
           'content_hash', v.content_hash, 'version', v.version, 'created_at', v.created_at, 'origin', v.origin, 'scope_note', v.scope_note, 'review_flags', v.review_flags,
           'title', u.title, 'theme_node_id', u.theme_node_id, 'generated_by_model', v.generated_by_model)), '[]'::jsonb)
  from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id
  join public.ch_unit_claims uc on uc.unit_version_id = v.id join public.ch_claims c on c.id = uc.claim_id
  where c.document_id = p_document_id and v.status = 'draft'
$$;

create or replace function public.ch_worker_unit_version(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('version_id', v.id, 'unit_id', v.unit_id, 'status', v.status, 'content', v.content, 'content_hash', v.content_hash,
           'version', v.version, 'created_at', v.created_at, 'origin', v.origin, 'scope_note', v.scope_note, 'review_flags', v.review_flags,
           'title', u.title, 'theme_node_id', u.theme_node_id, 'generated_by_model', v.generated_by_model)
  from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id = p_version_id
$$;

-- continuam só do servidor (o "create or replace" mantém as permissões; repetido aqui por segurança)
revoke execute on function public.ch_worker_claims(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_unit_versions(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_unit_version(uuid) from public, anon, authenticated;
