-- Portão de atualidade: a tela "Atualidade dos 100 Grandes Temas" dava tempo esgotado (limite de 8 s do administrador).
-- Causa: ch_gt_source_of(source_id, url) percorre as fontes calculando ch_url_norm(url) em cada uma, para cada fonte de cada tema (~0,5 s por tema).
-- Correção: índice sobre a mesma expressão (ch_url_norm é imutável). Medido em produção, dentro de uma transação desfeita: atualidade de
-- 10 temas de 5,4 s para 0,1 s, com o mesmo resultado. Não muda dado nem regra. Pode ser colado de novo.
create index if not exists ch_sources_url_norm_idx on public.ch_sources ((public.ch_url_norm(url)));
analyze public.ch_sources;
