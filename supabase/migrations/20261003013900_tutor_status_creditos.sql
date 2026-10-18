-- StaziaMed · TUTOR: app_tutor_status aceita créditos quebrados (defeito no ar de 18/10/2026).
--
-- O que acontecia: com a carteira ligada (013680), tutor_entitlement devolve o uso do dia em CRÉDITOS (numeric: "1.0", "2.5").
-- app_tutor_status ainda fazia (e #>> '{text,used}')::int e (e #>> '{text,limit}')::int, da época em que eram mensagens inteiras.
-- Assim que o aluno usava o Tutor uma vez, '2.5'::int dava erro 22P02 e TODA tela atrás do portão do Tutor (Análise Inteligente e
-- o próprio Tutor) mostrava "Algum valor está em formato inválido". Equipe não via: segue a regra antiga (inteiros).
--
-- O conserto: os dois campos saem como numeric. Para quem segue a regra antiga nada muda (5 continua 5 no JSON); com a carteira,
-- sai o número exato (2.5). O servidor já devolvia esses números quebrados na resposta do Tutor (server/tutor/engine.ts) e as telas
-- já tratam como número. O resto da função é a definição vigente, remendada com pg_get_functiondef (mesma técnica da 013610):
-- os privilégios ficam como estão. Falha alto se o trecho esperado não estiver lá (nem o já trocado). Pode rodar de novo.
-- Desfazer: supabase/desfazer/20261003013900_tutor_status_creditos.desfazer.sql. Conferir: supabase/conferir/tutor-status-creditos.sql.
do $patch$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_status()'::regprocedure) into v_def;
  v_new := replace(v_def, $$'daily_limit', (e #>> '{text,limit}')::int, 'used_today', (e #>> '{text,used}')::int,$$,
                          $$'daily_limit', (e #>> '{text,limit}')::numeric, 'used_today', (e #>> '{text,used}')::numeric,$$);
  if v_new = v_def and position($$'used_today', (e #>> '{text,used}')::numeric,$$ in v_def) = 0 then
    raise exception 'app_tutor_status: trecho de daily_limit/used_today não encontrado.';
  end if;
  if v_new <> v_def then execute v_new; end if;
end
$patch$;
