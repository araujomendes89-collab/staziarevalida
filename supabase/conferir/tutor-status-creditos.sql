-- StaziaMed · TUTOR: STATUS COM CRÉDITOS QUEBRADOS (013900) · CONFERIR (só lê). Resposta: uma linha "OK: ..." ou "FALTA: ...".
with f as (select to_regprocedure('public.app_tutor_status()') p),
falta (ordem, item) as (
  select 1, 'função app_tutor_status()' from f where p is null
  union all select 2, 'app_tutor_status ainda converte o uso do dia para inteiro (quebra com 2.5 créditos: erro 22P02)'
   from f where p is not null and pg_get_functiondef(p) ~ '\{text,(used|limit)\}''\)::int'
  union all select 3, 'app_tutor_status sem used_today/daily_limit em número'
   from f where p is not null and position($$'used_today', (e #>> '{text,used}')::numeric$$ in pg_get_functiondef(p)) = 0
  union all select 4, 'visitante executando app_tutor_status()' from f where p is not null and has_function_privilege('anon', p, 'execute')
  union all select 5, 'aluno sem acesso a app_tutor_status()' from f where p is not null and not has_function_privilege('authenticated', p, 'execute')
)
select case when count(*) = 0 then 'OK: app_tutor_status aceita créditos quebrados (013900)' else 'FALTA: ' || string_agg(item, '; ' order by ordem, item) end as resultado
from falta;
