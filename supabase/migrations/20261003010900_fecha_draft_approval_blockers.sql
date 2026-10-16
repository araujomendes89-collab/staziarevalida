-- 010900 — Segurança (2026-10-15): a 9990 (portão de atualidade) recriou public.draft_approval_blockers(uuid) e ela voltou a poder
-- ser chamada por qualquer usuário logado. Pela regra da 9800, funções draft_* são internas (chamadas só por outras funções
-- security definer do fluxo de aprovação). Nada no site, no servidor ou no Cloud Run a chama direto. Só tira a permissão.
-- Desfazer: supabase/desfazer/20261003010900_fecha_draft_approval_blockers.desfazer.sql
revoke execute on function public.draft_approval_blockers(uuid) from public, anon, authenticated;
