-- DESFAZER da 20261003014110_treino_dupla_sozinho_ia.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- funções criadas por ela
drop function if exists public.ch_worker_solo_prepare(uuid,uuid);
drop function if exists public.ch_worker_solo_save_eval(uuid,uuid,jsonb);
drop function if exists public.ch_worker_solo_fail(uuid,uuid,text);
drop function if exists public.solo_ia_month_cost(timestamp with time zone,timestamp with time zone);
