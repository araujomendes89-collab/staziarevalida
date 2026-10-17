-- StaziaMed · AJUSTES DA COBRANÇA (013850) · CONFERIR (só lê; não altera nada). Rode ANTES e DEPOIS de colar
-- supabase/migrations/20261003013850_ajustes_cobranca.sql. Resposta: duas colunas.
--   resultado: "OK: ..." = tudo no banco; "FALTA: ..." = o que não entrou.
--   chaves: como estão as chaves da abertura (vendas, cadeados, extras à venda, alertas), para conferir a ordem de ligar.
with falta (ordem, item) as (
  select 1, 'requisito tabela ' || t from unnest(array['billing_config', 'billing_cobrancas', 'billing_reembolsos', 'billing_contratos', 'avisos_aluno']) t
   where to_regclass('public.' || t) is null
  union all select 2, 'tabela ' || t from unnest(array['alertas_dono', 'alertas_dono_config']) t where to_regclass('public.' || t) is null
  union all select 3, 'coluna ' || c from unnest(array['billing_reembolsos.origem', 'billing_reembolsos.motivo', 'billing_reembolsos.feito_por',
      'billing_reembolsos.acesso', 'billing_reembolsos.classificacao', 'billing_cobrancas.nota_pdf_url', 'billing_cobrancas.nota_status',
      'billing_cobrancas.nota_email_status']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = split_part(c, '.', 1) and column_name = split_part(c, '.', 2))
  union all select 4, 'função ' || f from unnest(array['ch_worker_billing_devolvido(text,text,integer)', 'ch_worker_billing_admin_devolucao(uuid,bigint,integer,text,text)',
      'ch_worker_billing_nota_salvar(text,text,jsonb)', 'ch_worker_billing_notas_pendentes(integer)', 'ch_worker_billing_notas_email_pegar(integer)',
      'ch_worker_billing_nota_email_marcar(bigint,boolean,text)', 'app_billing_historico()', 'app_admin_billing_pagamentos(uuid)',
      'app_admin_billing_devolucoes(integer)', 'ch_worker_alertas_dono_gerar()', 'ch_worker_alertas_dono_pegar(integer)',
      'ch_worker_alerta_dono_marcar(bigint,boolean,text)', 'app_admin_alertas_dono()', 'app_admin_alertas_dono_salvar(jsonb)']) f
   where to_regprocedure('public.' || f) is null
  union all select 5, 'a devolução nova não está no banco (ch_worker_billing_devolvido sem a classificação)'
   where to_regprocedure('public.ch_worker_billing_devolvido(text,text,integer)') is not null
     and position('classificacao' in pg_get_functiondef('public.ch_worker_billing_devolvido(text,text,integer)'::regprocedure)) = 0
  union all select 6, 'proteção (RLS) desligada em ' || t from unnest(array['alertas_dono', 'alertas_dono_config']) t
   where to_regclass('public.' || t) is not null and not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass)
  union all select 7, 'aluno lê ou grava ' || t from unnest(array['alertas_dono', 'alertas_dono_config']) t
   where to_regclass('public.' || t) is not null and (has_table_privilege('authenticated', 'public.' || t, 'select')
     or has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('anon', 'public.' || t, 'select'))
  union all select 8, 'aluno executando função do servidor ' || p.oid::regprocedure::text from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'ch\_worker\_billing\_%' or p.proname like 'ch\_worker\_alerta%' or p.proname in ('alertas_dono_criar', 'alertas_custo_alunos_hoje'))
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  union all select 9, 'visitante executando ' || f from unnest(array['app_admin_billing_pagamentos(uuid)', 'app_admin_billing_devolucoes(integer)',
      'app_admin_alertas_dono()', 'app_admin_alertas_dono_salvar(jsonb)', 'app_billing_historico()']) f
   where to_regprocedure('public.' || f) is not null and has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute')
)
select case when count(*) = 0 then 'OK: ajustes da cobrança (013850) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado,
  (select concat_ws(' · ',
     'vendas ' || case when (select b.vendas_ligadas from public.billing_config b) then 'LIGADAS' else 'desligadas' end,
     'cadeados ' || case when to_regclass('public.direitos_config') is null then '(sem a 013690)'
                         when (select (to_jsonb(d) ->> 'cadeados_ligados')::boolean from public.direitos_config d) then 'LIGADOS' else 'desligados' end,
     -- tabelas que podem não existir ainda: lidas por consulta dinâmica (a conferência roda também ANTES da migração)
     'extras à venda: ' || case when to_regclass('public.carteira_pacotes') is null then '(sem a 013680)' else coalesce((xpath('/row/v/text()', query_to_xml(
        $q$select string_agg(k.nome || ' ' || public.avisos_brl(k.preco_centavos), ', ' order by k.posicao) as v from public.carteira_pacotes k where k.preco_centavos > 0$q$,
        false, true, '')))[1]::text, 'nenhum') end,
     'alertas ' || case when to_regclass('public.alertas_dono_config') is null then '(sem a 013850)' else (xpath('/row/v/text()', query_to_xml(
        $q$select case when c.ligado then 'ligados para ' || c.email else 'desligados' end as v from public.alertas_dono_config c$q$, false, true, '')))[1]::text end)) as chaves
from falta;
