-- DESFAZER da 20261003014020_treino_dupla_creditos_tabelas.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- gatilhos criados por ela
drop trigger if exists credit_ledger_no_change on public.credit_ledger;
drop trigger if exists credit_ledger_no_truncate on public.credit_ledger;
-- funções criadas por ela
drop function if exists public.credit_ledger_guard();
-- colunas criadas por ela (o que estiver gravado nelas se perde)
alter table public.checklist_rooms drop column if exists charged_at cascade;
-- tabelas criadas por ela (com o que estiver gravado nelas)
drop table if exists public.credit_wallets cascade;
drop table if exists public.credit_daily cascade;
drop table if exists public.credit_ledger cascade;
drop table if exists public.study_room_charges cascade;
-- regras refeitas ou apagadas: voltam como eram (se houver linha gravada fora da regra antiga, ela recusa: corrija o dado antes)
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check CHECK ((key = ANY (ARRAY['trial_days'::text, 'announcement'::text, 'simulado_ineditas_pct'::text, 'treino_dupla'::text, 'treino_dupla_chat'::text, 'creditos'::text])));
-- configurações (app_settings): a linha criada sai; a mudada volta ao valor de antes só se ninguém a mudou depois
delete from public.app_settings where key = 'creditos';
