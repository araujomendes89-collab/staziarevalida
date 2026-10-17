-- 013780 — seguranca-fase1 (auditoria de segurança de 17/10/2026)
--
-- Endurecimento das permissões do banco. Hoje a proteção de verdade é o RLS (todas as tabelas
-- do esquema public têm RLS ligado e as tabelas de saldo, plano, papel e gabarito não têm regra
-- de gravação para o aluno). Mas as permissões herdadas do Supabase ainda "concedem" gravação a
-- visitante e aluno em todas as tabelas: se um dia alguém desligar o RLS de uma tabela por engano,
-- ela fica aberta. Esta migração tira essas permissões onde nenhuma regra (policy) as usa,
-- para que haja duas travas em vez de uma.
--
-- 1) TRUNCATE, TRIGGER e REFERENCES saem de visitante (anon) e aluno (authenticated) em todas as
--    tabelas do public. O app não usa nenhuma delas e TRUNCATE nem passa pelo RLS.
-- 2) Visitante (anon) perde INSERT/UPDATE/DELETE em todas as tabelas do public que não têm regra
--    de gravação para ele (hoje: nenhuma tem). O visitante não grava nada no app.
-- 3) Aluno (authenticated) perde INSERT/UPDATE/DELETE nas tabelas sensíveis (papel, saldo de
--    moedas/XP, gabarito, configurações, registro de auditoria) que não têm regra de gravação para
--    ele. As funções do app (security definer) continuam gravando normalmente: rodam como dono.
--
-- Nada muda para quem usa o app: onde há regra de gravação, a permissão fica. Cada comando só é
-- retirado se NÃO houver regra permissiva (para anon, authenticated ou public) daquele comando.
-- Fica de fora de propósito (área de outros ramos): subscriptions, plans, billing_events,
-- legal_*, tutor_* — ver o relatório da auditoria.

do $$
declare
  r record;
  c text;
  t text;
  v_sensiveis constant text[] := array[
    'user_roles', 'ch_reviewer_areas',                                   -- papel (admin/editor/revisor)
    'user_gamification_stats', 'coin_transactions', 'gamification_events', -- saldo de moedas e XP
    'user_achievements', 'user_rewards', 'user_missions', 'league_memberships', 'ranking_snapshots',
    'rewards', 'achievements', 'levels', 'leagues', 'missions', 'gamification_rules',
    'questions', 'question_official_answers', 'question_option_analysis', -- gabarito
    'app_settings', 'ai_settings', 'admin_audit_log'                      -- configurações e auditoria
  ];
begin
  -- 1) TRUNCATE / TRIGGER / REFERENCES
  for r in
    select c2.oid::regclass as tab
    from pg_class c2 join pg_namespace n on n.oid = c2.relnamespace
    where n.nspname = 'public' and c2.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, trigger, references on %s from anon, authenticated', r.tab);
  end loop;

  -- 2) visitante: sem gravação onde não há regra de gravação para ele
  for r in
    select c2.relname
    from pg_class c2 join pg_namespace n on n.oid = c2.relnamespace
    where n.nspname = 'public' and c2.relkind in ('r', 'p')
  loop
    foreach c in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if exists (select 1 from pg_policies p
                 where p.schemaname = 'public' and p.tablename = r.relname and p.permissive = 'PERMISSIVE'
                   and p.cmd in (c, 'ALL') and p.roles && array['anon', 'public']::name[]) then
        raise notice 'seguranca 013780: % em % mantido para anon (há regra de gravação)', c, r.relname;
        continue;
      end if;
      execute format('revoke %s on public.%I from anon', c, r.relname);
    end loop;
  end loop;

  -- 3) aluno: sem gravação nas tabelas sensíveis sem regra de gravação para ele
  foreach t in array v_sensiveis loop
    if to_regclass('public.' || t) is null then continue; end if;
    foreach c in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if exists (select 1 from pg_policies p
                 where p.schemaname = 'public' and p.tablename = t and p.permissive = 'PERMISSIVE'
                   and p.cmd in (c, 'ALL') and p.roles && array['authenticated', 'public']::name[]) then
        raise notice 'seguranca 013780: % em % mantido para authenticated (há regra de gravação)', c, t;
        continue;
      end if;
      execute format('revoke %s on public.%I from authenticated', c, t);
    end loop;
  end loop;
end
$$;

-- tabelas novas criadas depois desta migração (pelo mesmo dono) já nascem sem TRUNCATE/TRIGGER/REFERENCES
-- para visitante e aluno
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
