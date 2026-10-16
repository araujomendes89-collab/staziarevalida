-- Desfaz a 010900 (devolve a permissão como estava depois da 9990).
grant execute on function public.draft_approval_blockers(uuid) to authenticated;
