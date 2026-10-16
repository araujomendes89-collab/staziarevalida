-- StaziaMed · NIVELAMENTO (diagnóstico do aluno novo) · CONFERIR (só lê; não altera nada). Rode ANTES (mostra o que falta) e DEPOIS de
-- colar supabase/migrations/20261003012300_nivelamento_diagnostico.sql.
-- Resposta: uma linha. "OK: ..." = tudo no banco. "FALTA: ..." = o que não entrou (mostre ao Claude). Funciona mesmo em banco incompleto.
with fn (assinatura, aluno) as (
  values ('nivelamento_area_ordem(public.med_area)', false), ('nivelamento_area_nome(public.med_area)', false),
         ('nivelamento_classificar(numeric)', false), ('nivelamento_distribuicao(numeric)', false),
         ('nivelamento_calcular(jsonb)', false), ('nivelamento_questao_view(text)', false),
         ('nivelamento_candidatas(uuid,public.med_area)', false), ('nivelamento_sortear_bloco(uuid,uuid,smallint)', false),
         ('nivelamento_estado_de(uuid)', false),
         ('app_nivelamento_estado()', true), ('app_nivelamento_prioridades()', true), ('app_nivelamento_sessao()', true),
         ('app_nivelamento_iniciar()', true), ('app_nivelamento_continuar()', true), ('app_nivelamento_responder(integer,text)', true),
         ('app_nivelamento_finalizar()', true), ('app_nivelamento_adiar()', true), ('app_nivelamento_correcao()', true),
         ('app_admin_nivelamento_cobertura()', true)
), fx as (
  select f.assinatura, f.aluno, to_regprocedure('public.' || f.assinatura) as oid from fn f
), tb (nome) as (
  values ('nivelamento_config'), ('nivelamento_diagnosticos'), ('nivelamento_itens'), ('nivelamento_proficiencia')
), falta (ordem, item) as (
  select 1, 'requisito (migrações anteriores) ' || x from unnest(array[
      'today_br()', 'plan_task_progress(public.plan_tasks)', 'area_label(public.med_area)', 'current_app_role()', 'is_staff()',
      'assert_staff()', 'ineditas_released_ids_for(uuid)', 'question_preliminary_info(text)', 'question_hidden_fields(jsonb,jsonb)']) x
   where to_regprocedure('public.' || x) is null
  union all select 2, 'tabela ' || t.nome from tb t where to_regclass('public.' || t.nome) is null
  union all select 3, 'segurança por linha desligada em ' || t.nome from tb t
   where to_regclass('public.' || t.nome) is not null
     and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t.nome))
  union all select 4, 'regra de leitura ' || x from unnest(array['nivelamento_diagnosticos.select_staff', 'nivelamento_itens.select_staff',
                                                               'nivelamento_proficiencia.select_own']) x
   where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename || '.' || p.policyname = x)
  union all select 5, 'linha de configuração em nivelamento_config'
   where to_regclass('public.nivelamento_config') is not null
     and (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.nivelamento_config', false, true, '')))[1]::text = '0'
  union all select 6, 'função ' || f.assinatura from fx f where f.oid is null
  union all select 7, 'aluno sem permissão em ' || f.assinatura from fx f
   where f.aluno and f.oid is not null and not has_function_privilege('authenticated', f.oid, 'execute')
  union all select 8, 'visitante (anon) com permissão em ' || f.assinatura from fx f
   where f.oid is not null and has_function_privilege('anon', f.oid, 'execute')
  union all select 9, 'função interna aberta ao aluno: ' || f.assinatura from fx f
   where not f.aluno and f.oid is not null and has_function_privilege('authenticated', f.oid, 'execute')
  union all select 10, 'app_today sem o nivelamento (cole a 012300 inteira; ela termina em app_today)'
   where to_regprocedure('public.app_today(boolean)') is null
      or pg_get_functiondef('public.app_today(boolean)'::regprocedure) not like '%app_nivelamento_prioridades%'
  union all select 11, 'aluno sem permissão em app_today'
   where to_regprocedure('public.app_today(boolean)') is not null
     and not has_function_privilege('authenticated', 'public.app_today(boolean)'::regprocedure, 'execute')
)
select case
  when exists (select 1 from falta) then 'FALTA: ' || (select string_agg(item, ' · ' order by ordem, item) from falta)
  else 'OK: nivelamento no banco (4 tabelas com segurança por linha, ' || (select count(*) from fx where oid is not null)
       || ' funções com permissões certas, app_today com o nivelamento); diagnósticos gravados: '
       || (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.nivelamento_diagnosticos', false, true, '')))[1]::text
end as resultado;
