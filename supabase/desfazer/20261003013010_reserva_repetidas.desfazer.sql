-- Desfaz 20261003013010_reserva_repetidas: devolve toda questão da reserva à situação de antes, tira funções, gatilho, coluna e a situação nova.
do $$
begin
  if to_regclass('public.draft_questions') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'draft_questions' and column_name = 'reserve') then
    perform set_config('stazia.reserva_mexer', 'on', true);
    update public.draft_questions
       set status = case when coalesce(reserve ->> 'status_before', '') in ('approved', 'needs_changes') then reserve ->> 'status_before' else 'awaiting_medical_review' end
     where status = 'reserve';
    perform set_config('stazia.reserva_mexer', '', true);
  end if;
end $$;
drop trigger if exists draft_questions_reserve_guard on public.draft_questions;
drop function if exists public.draft_questions_reserve_guard();
drop function if exists public.app_draft_reserve(jsonb, text);
drop function if exists public.app_draft_unreserve(uuid[]);
alter table public.draft_questions drop column if exists reserve;
alter table public.draft_questions drop constraint if exists draft_questions_status_check;
alter table public.draft_questions add constraint draft_questions_status_check
  check (status in ('awaiting_medical_review', 'approved', 'needs_changes', 'rejected'));

-- volta "Conferir pendentes" como era na …9800
create or replace function public.app_staziamed_pending_checks(p_filters jsonb default '{}'::jsonb) returns uuid[]
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_staff() then
    raise exception 'Conferir é da equipe (administrador ou editor).' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(x.id order by x.batch, x.slot) from (
      select d.id, d.batch, d.slot from public.draft_questions d
      where d.status <> 'rejected' and public.draft_matches_filters(d, p_filters) and public.draft_checks_current(d) < 4
      order by d.batch, d.slot limit 200) x), '{}'::uuid[]);
end
$$;
