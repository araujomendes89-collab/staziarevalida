-- Configurações internas só para a equipe (CF07).
-- Antes: qualquer aluno logado lia, direto nas tabelas, o rascunho do aviso, os dias de teste, os preços, os limites e o
-- "só equipe" (app_settings e tutor_config tinham leitura liberada para todo logado). O aluno nunca precisou disso: o app
-- dele usa funções (app_announcement, app_tutor_status, app_home, ...). Todas as outras funções que leem essas tabelas já
-- são security definer; a única que dependia da leitura do aluno era app_announcement, que passa a ser security definer.
-- Pode ser colada duas vezes. Nenhum dado é apagado.

-- 1) O aviso que o aluno vê continua igual (só o aviso ativo, sem o campo "active"); agora a função lê pela dona.
create or replace function public.app_announcement() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when (s.value ->> 'active')::boolean then s.value - 'active' end
  from public.app_settings s where s.key = 'announcement'
$$;
-- Só quem está logado (como era: o visitante recebia vazio pela leitura bloqueada).
revoke execute on function public.app_announcement() from public, anon;
grant execute on function public.app_announcement() to authenticated;

-- 2) Leitura direta das tabelas: só a equipe.
drop policy if exists "configurações: leitura para logados" on public.app_settings;
drop policy if exists "configurações: equipe lê" on public.app_settings;
create policy "configurações: equipe lê" on public.app_settings
  for select to authenticated using (public.is_staff());

drop policy if exists "configuração do tutor: logados leem" on public.tutor_config;
drop policy if exists "configuração do tutor: equipe lê" on public.tutor_config;
create policy "configuração do tutor: equipe lê" on public.tutor_config
  for select to authenticated using (public.is_staff());

-- Para desfazer: recriar as duas políticas antigas com "using (true)" (…1300 e …3100) e app_announcement sem security definer.
