-- DESFAZER da 20261003014060_treino_dupla_creditos_admin.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- funções criadas por ela
drop function if exists public.app_admin_credit_statement(uuid,text,integer);
drop function if exists public.app_admin_credit_config();
drop function if exists public.app_admin_save_credit_config(jsonb);
drop function if exists public.app_admin_credit_grant(uuid,text,integer,text,text);
drop function if exists public.app_admin_credit_refund(bigint,text,boolean);
drop function if exists public.app_admin_credit_reconcile(text);
drop function if exists public.app_admin_credit_today();
