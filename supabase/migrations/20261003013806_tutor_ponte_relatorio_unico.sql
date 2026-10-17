-- =============================================================================
-- Auditoria de segurança de 17/10/2026 (ramo tutor-personagens). Aditiva; pode ser colada de novo.
--
--   O relatório de uso assinado da PONTE de voz (POST /api/tutor/voice/ponte-uso) era aceito de novo durante os 10 minutos de
--   validade: o mesmo relatório reenviado contava o custo da ligação duas vezes. Agora ch_worker_tutor_ponte_uso grava o relatório
--   uma vez só (marca de uso único, o resumo do corpo assinado, em public.tutor_ponte_relatorios) e devolve se gravou.
--
-- Para desfazer: supabase/desfazer/20261003013806_tutor_ponte_relatorio_unico.desfazer.sql
-- =============================================================================

create table if not exists public.tutor_ponte_relatorios (
  hash text primary key check (char_length(hash) between 16 and 128),
  created_at timestamptz not null default now()
);
alter table public.tutor_ponte_relatorios enable row level security;
revoke all on table public.tutor_ponte_relatorios from public, anon, authenticated;

-- Grava o relatório assinado no registro de custos só na primeira vez que ele chega (p_hash = resumo do corpo assinado). Devolve se gravou.
create or replace function public.ch_worker_tutor_ponte_uso(p_user uuid, p_session_id uuid, p_hash text, p_entry jsonb) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if p_hash is null or char_length(p_hash) not between 16 and 128 then raise exception 'Relatório inválido.' using errcode = '22023'; end if;
  -- as marcas só precisam durar mais que a validade do relatório (10 min)
  delete from public.tutor_ponte_relatorios where created_at < now() - interval '1 day';
  insert into public.tutor_ponte_relatorios (hash) values (p_hash) on conflict (hash) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  perform public.ch_worker_tutor_ledger(p_user, p_session_id, p_entry);
  return true;
end
$$;
revoke execute on function public.ch_worker_tutor_ponte_uso(uuid, uuid, text, jsonb) from public, anon, authenticated;
