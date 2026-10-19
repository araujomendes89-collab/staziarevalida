-- Conferência da 20261003014220_treino_dupla_acesso_por_fase.sql (2ª fase pela chave "prática"). Só lê; pode rodar a qualquer hora.
-- Cada linha: o que se confere e "ok" (true) ou não. Tudo true = a regra por fase está no banco e nada abriu sem querer.
select item, ok from (values
  ('fase2_acesso existe e é interna (aluno e visitante não chamam)',
     to_regprocedure('public.fase2_acesso(uuid,text)') is not null
     and not has_function_privilege('authenticated', 'public.fase2_acesso(uuid,text)', 'execute')
     and not has_function_privilege('anon', 'public.fase2_acesso(uuid,text)', 'execute')),
  ('dupla_allowed segue o plano por fase (não lê mais subscriptions nem a lista "planos")',
     pg_get_functiondef('public.dupla_allowed(uuid)'::regprocedure) like '%fase2_acesso(p_user, ''treino_dupla'')%'
     and pg_get_functiondef('public.dupla_allowed(uuid)'::regprocedure) not like '%subscriptions%'),
  ('dupla_allowed continua interna',
     not has_function_privilege('authenticated', 'public.dupla_allowed(uuid)', 'execute')),
  ('app_dupla_access devolve fase2 e dupla; só quem entra chama',
     pg_get_functiondef('public.app_dupla_access()'::regprocedure) like '%''fase2'', public.fase2_acesso%'
     and has_function_privilege('authenticated', 'public.app_dupla_access()', 'execute')
     and not has_function_privilege('anon', 'public.app_dupla_access()', 'execute')),
  ('fase2_allowed: equipe ou 2ª fase liberada/amostra pela regra por fase',
     pg_get_functiondef('public.fase2_allowed()'::regprocedure) like '%fase2_acesso((select auth.uid()), ''estacoes'')%'),
  ('gatilho da amostra da 2ª fase em station_attempts',
     exists (select 1 from pg_trigger where tgname = 'fase2_amostra_station_attempts' and tgrelid = 'public.station_attempts'::regclass and not tgisinternal)),
  ('gatilho "só o PRO à venda até a 2ª fase abrir" em billing_pedidos',
     exists (select 1 from pg_trigger where tgname = 'fase2_venda_pedidos' and tgrelid = 'public.billing_pedidos'::regclass and not tgisinternal)),
  ('funções dos gatilhos não são chamáveis pela API',
     not has_function_privilege('authenticated', 'public.fase2_amostra_station_attempts()', 'execute')
     and not has_function_privilege('authenticated', 'public.fase2_venda_pedidos()', 'execute')),
  ('Treino em Dupla na amostra: trancado (decisão do dono 17/10: amostra sem Dupla)',
     (select amostra_modo from public.direitos_recursos where codigo = 'treino_dupla') = 'trancado'),
  ('PRÁTICA e ELITE fora de venda enquanto a 2ª fase não abrir',
     (select coalesce(fase2_aberta_alunos, false) from public.direitos_config)
     or not exists (select 1 from public.direitos_planos where a_venda and 'pratica' = any (fases))),
  ('chave treino_dupla DESLIGADA (só a equipe). Depois que o dono ligar, esta linha passa a false de propósito',
     not coalesce((select value -> 'aberto' = 'true'::jsonb from public.app_settings where key = 'treino_dupla'), false))
) as t(item, ok);
