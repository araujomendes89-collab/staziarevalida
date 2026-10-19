-- DESFAZER da 20261003014000_treino_dupla_radar.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- dados que a regra antiga recusaria: arrumados antes (a avaliação salva na Central sai; quem estava 'sozinho' volta a 'livre';
-- treino entregue ou em avaliação vira abandonado, porque a regra antiga não conhece essas situações)
update public.app_settings set value = value - 'convites' where key = 'treino_dupla' and value ? 'convites';
-- gatilhos criados por ela
drop trigger if exists study_profiles_handle_fill on public.study_profiles;
-- funções criadas por ela
drop function if exists public.dupla_handle_message(text);
drop function if exists public.dupla_handle_next_change(uuid);
drop function if exists public.dupla_handle_wait_message(timestamp with time zone);
drop function if exists public.dupla_handle_generate();
drop function if exists public.study_profiles_handle_fill();
drop function if exists public.dupla_near(jsonb,jsonb);
drop function if exists public.app_dupla_invite(uuid,text);
drop function if exists public.dupla_invite_core(uuid,uuid,text,boolean,uuid);
drop function if exists public.dupla_credit_ok(uuid);
drop function if exists public.app_admin_save_dupla_radar(jsonb);
drop function if exists public.app_dupla_radar(text,text);
drop function if exists public.dupla_place(text);
drop function if exists public.app_admin_dupla_radar();
drop function if exists public.app_dupla_handle_check(text);
drop function if exists public.app_dupla_set_handle(text);
drop function if exists public.app_admin_dupla_handle_log(integer);
drop function if exists public.dupla_has_banned_word(text,boolean);
drop function if exists public.dupla_name_reserved(text);
drop function if exists public.dupla_handle_clean(text);
drop function if exists public.dupla_handle_problem(text,uuid);
drop function if exists public.dupla_radar_settings();
drop function if exists public.dupla_blocked(uuid,uuid);
drop function if exists public.dupla_hides(uuid,uuid);
-- índices criados por ela
drop index if exists public.study_invites_from_idx;
drop index if exists public.study_profiles_handle_key;
-- regras criadas por ela
alter table public.study_invites drop constraint if exists study_invites_kind_check;
alter table public.study_invites drop constraint if exists study_invites_kind_not_null;
alter table public.study_profiles drop constraint if exists study_profiles_allow_direct_invites_not_null;
alter table public.study_profiles drop constraint if exists study_profiles_handle_check;
alter table public.study_profiles drop constraint if exists study_profiles_handle_not_null;
-- colunas criadas por ela (o que estiver gravado nelas se perde)
alter table public.study_profiles drop column if exists allow_direct_invites cascade;
alter table public.study_profiles drop column if exists handle cascade;
alter table public.study_invites drop column if exists kind cascade;
-- tabelas criadas por ela (com o que estiver gravado nelas)
drop table if exists public.study_handle_log cascade;
-- configurações (app_settings): a linha criada sai; a mudada volta ao valor de antes só se ninguém a mudou depois
update public.app_settings set value = $cfg${"max": 600, "rajada": 5, "janela_s": 30, "palavras": ["idiota", "imbecil", "babaca", "otario", "porra", "caralho", "merda", "puta", "puto"], "guarda_denuncia_dias": null}$cfg$::jsonb where key = 'treino_dupla_chat' and value = $cfg${"max": 600, "rajada": 5, "janela_s": 30, "palavras": ["idiota", "imbecil", "babaca", "otario", "porra", "caralho", "merda", "puta", "puto"], "guarda_denuncia_dias": 180}$cfg$::jsonb;
