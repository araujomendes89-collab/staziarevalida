-- DESFAZER da 20261003013640_direitos_por_fase.sql (planos, etapa 1: direitos por fase em modo sombra).
-- Apaga só o que a 13640 criou: o gatilho novo da assinatura, as funções novas e as tabelas novas (com o que o dono editou nelas:
-- preços, franquias, amostras, chaves, e a escolha de teste dos alunos). NÃO toca em nada que já existia: assinaturas, planos
-- antigos, funções antigas e regras de acesso ficam exatamente como estavam (a 13640 não mudou nenhuma delas).
-- Pode ser rodado de novo sem erro ("if exists").
-- Antes de rodar, se quiser guardar os números editados: select * from public.direitos_planos; select * from public.direitos_recursos;
-- select * from public.direitos_config; (e a escolha dos alunos: select * from public.aluno_testes where escolhido_em is not null;)

drop trigger if exists direitos_por_fase_sincronia on public.subscriptions;

drop function if exists public.app_admin_direitos_aluno(text);
drop function if exists public.app_admin_direitos_salvar(jsonb);
drop function if exists public.app_admin_direitos();
drop function if exists public.direitos_regra_atual(uuid);
drop function if exists public.app_escolher_teste(text);
drop function if exists public.app_my_entitlements();
drop function if exists public.user_has_access(uuid, text);
drop function if exists public.direitos_do_aluno(uuid);
drop function if exists public.direitos_cadeados_ligados();
drop function if exists public.direitos_teste_repetido(uuid);
drop function if exists public.direitos_assinatura_gatilho();
drop function if exists public.direitos_sincronizar_assinatura(uuid);

drop table if exists public.aluno_fases;
drop table if exists public.aluno_testes;
drop table if exists public.direitos_recursos;
drop table if exists public.direitos_planos;
drop table if exists public.direitos_config;
