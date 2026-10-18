-- StaziaMed · NOTA FISCAL: NOVO PEDIDO E PENDÊNCIAS (013860) · CONFERIR (só lê). Resposta: uma linha "OK: ..." ou "FALTA: ...".
with falta (ordem, item) as (
  select 1, 'requisito tabela billing_cobrancas (013700)' where to_regclass('public.billing_cobrancas') is null
  union all select 2, 'coluna billing_cobrancas.' || c from unnest(array['nota_pedidos', 'nota_pedido_em', 'nota_erro']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'billing_cobrancas' and column_name = c)
  union all select 3, 'função ' || f from unnest(array['ch_worker_billing_nota_pedido(text,text,boolean,text)', 'ch_worker_billing_notas_pendentes(integer)',
      'app_admin_billing_notas_pendencias()']) f where to_regprocedure('public.' || f) is null
  union all select 4, 'a tarefa de hora em hora ainda não sabe pedir de novo (ch_worker_billing_notas_pendentes sem pedir_de_novo)'
   where to_regprocedure('public.ch_worker_billing_notas_pendentes(integer)') is not null
     and position('pedir_de_novo' in pg_get_functiondef(to_regprocedure('public.ch_worker_billing_notas_pendentes(integer)'))) = 0
  union all select 5, 'visitante ou aluno executando ' || f from unnest(array['ch_worker_billing_nota_pedido(text,text,boolean,text)', 'ch_worker_billing_notas_pendentes(integer)']) f
   where to_regprocedure('public.' || f) is not null
     and (has_function_privilege('anon', to_regprocedure('public.' || f), 'execute') or has_function_privilege('authenticated', to_regprocedure('public.' || f), 'execute'))
  union all select 6, 'visitante executando app_admin_billing_notas_pendencias()'
   where to_regprocedure('public.app_admin_billing_notas_pendencias()') is not null
     and has_function_privilege('anon', to_regprocedure('public.app_admin_billing_notas_pendencias()'), 'execute')
)
select case when count(*) = 0 then 'OK: nota fiscal com novo pedido e pendências (013860) no banco' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
