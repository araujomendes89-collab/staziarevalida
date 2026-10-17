-- Conferência da 20261003013720_onboarding.sql (só leitura). Rodar no SQL Editor do Supabase depois de colar a migração.

-- 1) as duas tabelas existem, com RLS ligada e só leitura para o aluno
select c.relname tabela, c.relrowsecurity rls_ligada,
       has_table_privilege('authenticated', c.oid, 'select') aluno_le,
       has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
         or has_table_privilege('authenticated', c.oid, 'delete') aluno_grava_direto   -- tem de ser false
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('aluno_onboarding', 'aluno_preferencias_estudo');

-- 2) funções: as app_* para o aluno logado; as internas fechadas (visitante e aluno não executam)
select p.proname, p.prosecdef security_definer, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'execute') aluno_executa,
       has_function_privilege('anon', p.oid, 'execute') visitante_executa                 -- tem de ser false
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('app_onboarding_estado', 'app_onboarding_salvar', 'app_onboarding_tour', 'app_onboarding_dica_vista',
                    'onboarding_estado_de', 'onboarding_garantir', 'onboarding_adiar_nivelamento', 'onboarding_conta_antiga', 'onboarding_ordem')
order by 1;

-- 3) como estão os alunos (contagens, sem dados pessoais)
select status, origem, count(*) from public.aluno_onboarding group by 1, 2 order by 1, 2;
select tour_status, count(*) from public.aluno_onboarding group by 1 order by 1;
select jeito_estudar, count(*) from public.aluno_preferencias_estudo group by 1 order by 1;

-- 4) quantas contas de aluno veriam o onboarding sozinho ao entrar (contas novas sem registro e sem estudo)
select count(*) contas_novas_sem_onboarding
from auth.users u
where not public.user_has_full_access(u.id)
  and not exists (select 1 from public.aluno_onboarding o where o.user_id = u.id)
  and not public.onboarding_conta_antiga(u.id);
