-- =============================================================================
-- Relato do processamento da Central de Conteúdo.
--
-- Quem lê os PDFs (PyMuPDF), faz OCR (Tesseract) e gera os arquivos finais (Chromium) é o processamento: a tarefa
-- no Google Cloud Run ou, no desenvolvimento, o próprio servidor. O servidor do site na Vercel não processa nada,
-- então o painel não deve testar a si mesmo: a cada execução o processamento registra aqui o que tem pronto e o
-- painel mostra esse relato (ou avisa que o processamento nunca rodou / parou de rodar).
-- Escrita e leitura só pelo servidor (chave de serviço).
-- =============================================================================
create table public.ch_worker_heartbeats (
  worker text primary key check (char_length(worker) between 1 and 60),
  reported_at timestamptz not null default now(),
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object')
);
alter table public.ch_worker_heartbeats enable row level security;
-- sem políticas: ninguém além do servidor lê ou escreve

create function public.ch_worker_report(p_worker text, p_report jsonb) returns void
  language sql security definer set search_path = ''
as $$
  insert into public.ch_worker_heartbeats (worker, reported_at, report) values (p_worker, now(), coalesce(p_report, '{}'::jsonb))
  on conflict (worker) do update set reported_at = now(), report = excluded.report
$$;

create function public.ch_worker_last_report() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('worker', h.worker, 'reported_at', h.reported_at, 'report', h.report)
  from public.ch_worker_heartbeats h order by h.reported_at desc limit 1
$$;

revoke execute on function public.ch_worker_report(text, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_last_report() from public, anon, authenticated;
