-- Desfaz a 20261003013900_tutor_status_creditos.sql (volta à 013610): app_tutor_status volta a converter daily_limit e used_today
-- para inteiro. ATENÇÃO: com a carteira ligada, isso traz de volta o erro 22P02 para o aluno que gastou créditos quebrados.
-- Pode rodar de novo. Aplicado sobre a definição vigente (pg_get_functiondef), só troca os dois trechos.
do $desfazer$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_status()'::regprocedure) into v_def;
  v_new := replace(v_def, $$'daily_limit', (e #>> '{text,limit}')::numeric, 'used_today', (e #>> '{text,used}')::numeric,$$,
                          $$'daily_limit', (e #>> '{text,limit}')::int, 'used_today', (e #>> '{text,used}')::int,$$);
  if v_new <> v_def then execute v_new; end if;
end
$desfazer$;
