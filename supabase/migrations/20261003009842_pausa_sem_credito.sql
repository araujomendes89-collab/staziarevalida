-- =============================================================================
-- Fase 1 · Grupo A · CC06 — Central de Conteúdo › Processamento: a IA sem crédito (ou sem cota) deixa de virar "Falhou" depois de 3
-- tentativas: o trabalho fica PARADO (pendência, sem gastar tentativa) com aviso claro e volta sozinho, no máximo a cada 10 minutos
-- (cada volta é uma chamada que a IA recusa na hora, sem cobrança), até o crédito ser recarregado. Pode ser colada de novo no Supabase.
--
-- Parte da ÚNICA versão anterior de ch_worker_unblock (20261003001500_content_hub_worker.sql). Não mexe em ch_worker_block.
-- Site novo + SQL antigo: nada quebra (o aviso de pausa não é gravado e a volta é a cada rodada, como qualquer pendência).
-- SQL novo + site antigo: nada muda (nenhum trabalho tem a marca de pausa por crédito).
-- =============================================================================

-- O processamento anota a hora em que o trabalho parou por falta de crédito (só em trabalho pendente).
create or replace function public.ch_worker_note_credit_pause(p_job_id uuid) returns void
  language sql security definer set search_path = ''
as $$
  update public.ch_jobs set metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object('credit_pause_at', now())
   where id = p_job_id and status = 'blocked'
$$;

-- Configuração resolvida (ex.: IA passou a existir): os trabalhos pendentes voltam para a fila. O trabalho parado por falta de crédito
-- ("Sem crédito na IA ...") só volta depois de 10 minutos da última parada (ou se nunca foi anotado).
create or replace function public.ch_worker_unblock() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.ch_documents d set failure = null
   where d.failure like 'Pendência:%'
     and exists (select 1 from public.ch_jobs j
                  where j.document_id = d.id and j.status = 'blocked'
                    and (position('Sem crédito na IA' in coalesce(j.error, '')) = 0
                         or coalesce((j.metrics ->> 'credit_pause_at')::timestamptz, 'epoch'::timestamptz) < now() - interval '10 minutes'));
  update public.ch_jobs set status = 'queued', error = null, run_after = now()
   where status = 'blocked'
     and (position('Sem crédito na IA' in coalesce(error, '')) = 0
          or coalesce((metrics ->> 'credit_pause_at')::timestamptz, 'epoch'::timestamptz) < now() - interval '10 minutes');
  get diagnostics n = row_count;
  return n;
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_worker_note_credit_pause(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_unblock() from public, anon, authenticated;
end
$revoke$;
