-- CC01 (2026-10-10): afirmação marcada "insuficiente" porque nenhuma fonte cadastrada tinha trecho sobre ela (a conferência não
-- achou nada para comparar, então não há evidência vigente) volta a ser conferida:
--   - quando uma fonte nova é indexada (etapa source_index do processamento chama ch_worker_recheck_insufficient);
--   - quando a equipe manda reprocessar a conferência (a etapa de evidências passa a pegar essas afirmações também).
-- Só essas voltam: a afirmação que a conferência já julgou com um trecho (insuficiente COM evidência) fica como está.
-- As funções abaixo partem das versões mais novas (ch_worker_claims da 7600; ch_worker_mark_claim da 1500) e continuam só do
-- servidor.

-- Afirmações do documento, agora com quantas evidências vigentes (não substituídas) cada uma tem.
create or replace function public.ch_worker_claims(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
           'critical_kinds', c.critical_kinds, 'context', c.context, 'theme_node_id', c.theme_node_id, 'block_id', c.block_id,
           'created_by_model', c.created_by_model,
           'evidence_count', (select count(*)::int from public.ch_evidence e where e.claim_id = c.id and not e.stale)) order by c.created_at), '[]'::jsonb)
  from public.ch_claims c where c.document_id = p_document_id
$$;

-- Anotação do processamento numa afirmação. A "insuficiente" sem evidência vigente também muda de situação quando é conferida
-- de novo (por exemplo, vai para revisão humana se a evidência proposta for recusada); as demais regras ficam iguais.
create or replace function public.ch_worker_mark_claim(p_claim_id uuid, p_status text, p_note text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_claims c set status = p_status
   where c.id = p_claim_id
     and (c.status in ('extracted', 'evidence_linked')
          or (c.status = 'insufficient' and not exists (select 1 from public.ch_evidence e where e.claim_id = c.id and not e.stale)));
  insert into public.ch_claim_history (claim_id, event, details) values (p_claim_id, 'worker_note', jsonb_build_object('status', p_status, 'note', p_note));
end
$$;

-- Fonte nova indexada: devolve para a fila a etapa de evidências dos materiais de estudo que têm afirmação insuficiente sem
-- evidência vigente. Só documento cuja conferência já terminou (a que ainda vai rodar já pega a fonte nova) e que não está com
-- falha (documento com falha a equipe olha antes). Devolve quantos documentos voltaram para a conferência.
create or replace function public.ch_worker_recheck_insufficient(p_versions jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  d record;
  n integer := 0;
begin
  for d in
    select doc.id from public.ch_documents doc
    where doc.purpose = 'study_material' and doc.status <> 'failed'
      and exists (select 1 from public.ch_claims c
                  where c.document_id = doc.id and c.status = 'insufficient'
                    and not exists (select 1 from public.ch_evidence e where e.claim_id = c.id and not e.stale))
      and exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence' and j.status = 'succeeded')
      and not exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence' and j.status in ('queued', 'running'))
    order by doc.created_at
  loop
    perform public.ch_worker_next(d.id, 'evidence', coalesce(p_versions, '{}'::jsonb), '');
    n := n + 1;
  end loop;
  return n;
end
$$;

-- continuam só do servidor (o "create or replace" mantém as permissões; repetido aqui por segurança)
revoke execute on function public.ch_worker_claims(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_mark_claim(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_recheck_insufficient(jsonb) from public, anon, authenticated;
