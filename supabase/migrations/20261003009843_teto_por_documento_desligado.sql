-- =============================================================================
-- Fase 1 · Grupo A · CC05 — Central de Conteúdo › Processamento: a ESTRUTURA do teto de gasto de IA por documento. Nasce DESLIGADA
-- (decisão do dono: tetos e preços só depois do aplicativo finalizado) e sem valor: ligá-la não acontece sozinha. Quando ligada pelo
-- administrador, o processamento para o documento (pendência, sem gastar tentativa) no momento em que o gasto dele já registrado em
-- ai_calls alcança o teto, e volta quando o administrador sobe o teto ou o desliga.
-- Pode ser colada de novo no Supabase sem estragar nada. Não apaga nem altera nenhum dado existente.
-- =============================================================================

create table if not exists public.ch_processing_settings (
  id boolean primary key default true check (id),
  document_cap_enabled boolean not null default false,
  document_cap_usd numeric(12, 2) check (document_cap_usd is null or document_cap_usd > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ch_processing_settings (id) values (true) on conflict (id) do nothing;
alter table public.ch_processing_settings enable row level security;
drop policy if exists "ajustes do processamento: administrador lê" on public.ch_processing_settings;
create policy "ajustes do processamento: administrador lê" on public.ch_processing_settings for select to authenticated using (public.is_admin());

-- Lê o teto por documento (só administrador).
create or replace function public.app_ch_processing_settings() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select jsonb_build_object('document_cap_enabled', s.document_cap_enabled, 'document_cap_usd', s.document_cap_usd) from public.ch_processing_settings s where s.id);
end
$$;

-- Liga/desliga o teto por documento e muda o valor (só administrador). Ligar exige um valor maior que zero.
create or replace function public.app_ch_set_processing_settings(p_document_cap_enabled boolean, p_document_cap_usd numeric default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_cap numeric(12, 2) := case when p_document_cap_usd is null then null else round(p_document_cap_usd, 2) end;
begin
  perform public.assert_admin();
  if coalesce(p_document_cap_enabled, false) and (v_cap is null or v_cap <= 0) then
    raise exception 'Para ligar o teto por documento, informe um valor maior que zero.' using errcode = '22023';
  end if;
  if v_cap is not null and v_cap <= 0 then
    raise exception 'O teto por documento precisa ser maior que zero (deixe vazio para não ter valor).' using errcode = '22023';
  end if;
  update public.ch_processing_settings
     set document_cap_enabled = coalesce(p_document_cap_enabled, false), document_cap_usd = v_cap, updated_by = (select auth.uid()), updated_at = now()
   where id;
  perform public.ch_log('processing.settings', 'document_cap', jsonb_build_object('enabled', coalesce(p_document_cap_enabled, false), 'cap_usd', v_cap));
  return public.app_ch_processing_settings();
end
$$;

-- O processamento lê o teto (service_role).
create or replace function public.ch_worker_processing_settings() returns jsonb
  language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('document_cap_enabled', s.document_cap_enabled, 'document_cap_usd', s.document_cap_usd) from public.ch_processing_settings s where s.id $$;

-- Gasto de IA já registrado para o documento (todas as chamadas da Central com o documento como item, as que falharam inclusive).
create or replace function public.ch_worker_document_spend(p_document_id uuid) returns numeric
  language sql stable security definer set search_path = ''
as $$ select coalesce(sum(c.cost_usd), 0) from public.ai_calls c where c.source = 'central' and c.item_id = p_document_id::text $$;

do $revoke$
begin
  revoke execute on function public.app_ch_processing_settings() from public, anon;
  revoke execute on function public.app_ch_set_processing_settings(boolean, numeric) from public, anon;
  revoke execute on function public.ch_worker_processing_settings() from public, anon, authenticated;
  revoke execute on function public.ch_worker_document_spend(uuid) from public, anon, authenticated;
end
$revoke$;
