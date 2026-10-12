-- =============================================================================
-- PDF de fonte oficial que já tinha sido enviado em Documentos (CC24, 2026-10-12).
--
-- Antes: o mesmo arquivo enviado antes em Documentos e depois como PDF completo de uma fonte era reconhecido como repetido e a
-- fila não criava trabalho novo (a leitura "já tinha rodado"). A fonte ficava ligada ao documento, mas sem trechos citáveis.
--
-- Agora o servidor consulta esta função: se a leitura do arquivo já terminou, manda direto indexar os trechos da fonte (sem ler
-- o PDF de novo, que apagaria o trabalho já feito no documento); se a leitura falhou, refaz; se está na fila ou rodando, deixa
-- terminar (a leitura confere no fim se o documento virou fonte).
-- Função nova, só para o processamento. Pode ser colada várias vezes.
-- =============================================================================
create or replace function public.ch_worker_document_extraction(p_document_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'extract_status', (select j.status from public.ch_jobs j where j.document_id = p_document_id and j.step = 'extract' order by j.created_at desc limit 1),
    'blocks', (select count(*)::int from public.ch_blocks b where b.document_id = p_document_id))
$$;
revoke execute on function public.ch_worker_document_extraction(uuid) from public, anon, authenticated;
