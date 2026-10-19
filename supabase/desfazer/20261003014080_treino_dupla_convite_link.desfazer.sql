-- DESFAZER da 20261003014080_treino_dupla_convite_link.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- funções criadas por ela
drop function if exists public.app_dupla_link_request(text,text);
drop function if exists public.dupla_can_receive_now(uuid);
drop function if exists public.dupla_station_public(text);
drop function if exists public.app_dupla_link_lookup(text,text);
drop function if exists public.app_dupla_requests();
drop function if exists public.app_dupla_answer_request(uuid,boolean);
drop function if exists public.dupla_requests_sweep();
-- tabelas criadas por ela (com o que estiver gravado nelas)
drop table if exists public.study_train_requests cascade;
