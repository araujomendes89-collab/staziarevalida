-- StaziaMed · PLANOS ETAPA 3 (cadeados por fase no banco; só valem com a chave ligada) · CONFERIR (só lê; não altera nada). Rode
-- ANTES (mostra o que falta) e DEPOIS de colar supabase/migrations/20261003013690_cadeados_por_fase.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
-- Também avisa se alguma migração posterior recriou simulado_gate por cima do porteiro (a regra nova do simulado sumiria).
with falta (ordem, item) as (
  select 1, 'requisito (013640/013680) função ' || f from unnest(array['direitos_do_aluno(uuid)', 'user_has_access(uuid,text)', 'carteira_numeros(uuid,text,timestamptz)', 'carteira_achar_usuario(text)']) f
   where to_regprocedure('public.' || f) is null
  union all select 2, 'função desta migração ' || f from unnest(array['cadeado_conferir(uuid,text,integer)', 'cadeado_pode_ler(text)', 'app_cadeado(text)',
      'simulado_gate_regra_antiga()', 'ch_worker_teste_ativar(uuid,text,text)', 'ch_worker_teste_ips_limpar()',
      'direitos_escolher_teste(uuid,text)', 'app_admin_direitos_dar_plano(text,text,timestamp with time zone,text)', 'app_admin_direitos_tirar_plano(text,text)',
      'app_admin_testes_alerta()', 'app_admin_teste_verificado(text)']) f
   where to_regprocedure('public.' || f) is null
  union all select 3, 'porteiro sumiu (recriada por cima): ' || f from unnest(array['simulado_gate()']) f
   where to_regprocedure('public.' || f) is not null
     and position('regra_antiga' in pg_get_functiondef(to_regprocedure('public.' || f))) = 0
  union all select 4, 'gatilho ' || g from unnest(array['cadeado_practice_sessions', 'cadeado_question_attempts', 'cadeado_flashcard_reviews', 'cadeado_tutor_sessions', 'cadeado_diagnostico_itens']) g
   where not exists (select 1 from pg_trigger t where t.tgname = g and not t.tgisinternal)
  union all select 5, 'regra de leitura "' || pol || '"' from unnest(array['cadeado: 1ª fase (questões)', 'cadeado: 1ª fase (flashcards)', 'cadeado: 2ª fase (estações)',
      'cadeado: 2ª fase (conteúdo das estações)', 'cadeado: 2ª fase (simulados práticos)', 'cadeado: 2ª fase (salas da dupla)', 'cadeado: 2ª fase (convites da dupla)']) pol
   where not exists (select 1 from pg_policies p where p.policyname = pol and p.permissive = 'RESTRICTIVE')
  union all select 6, 'visitante ou aluno executando ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cadeado_conferir', 'simulado_gate_regra_antiga', 'ch_worker_teste_ativar', 'ch_worker_teste_ips_limpar',
                       'direitos_escolher_teste', 'app_escolher_teste')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all select 7, 'tabela teste_ips (só o hash do IP)' where to_regclass('public.teste_ips') is null
  union all select 8, 'aluno logado lê teste_ips' where to_regclass('public.teste_ips') is not null and has_table_privilege('authenticated', 'public.teste_ips', 'select')
)
select case when count(*) = 0 then 'OK: cadeados por fase no banco, ' ||
              coalesce((select case when c.cadeados_ligados then 'VALENDO (chave ligada)' else 'esperando a chave (modo sombra: nada muda)' end from public.direitos_config c), '?')
              || '; porteiros no lugar; funções internas fechadas ao navegador'
            else 'FALTA: ' || string_agg(item, ' | ' order by ordem, item) end as resultado from falta;
