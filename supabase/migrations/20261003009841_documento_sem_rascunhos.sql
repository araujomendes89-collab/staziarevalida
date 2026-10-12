-- =============================================================================
-- Fase 1 · Grupo A · CC03 — Central de Conteúdo › Processamento: o documento que termina SEM nenhum rascunho para revisar deixa de
-- aparecer como "Aguardando revisão". Ganha a situação própria "Sem rascunhos" (no_drafts), com o motivo na própria linha do
-- documento (Pendência: ...). Pode ser colada de novo no Supabase sem estragar nada. Não apaga nem altera nenhum documento.
--
-- Depende só da tabela ch_documents (20261003001400). Site novo + SQL antigo: o processamento tenta gravar "Sem rascunhos", o banco
-- antigo recusa e ele grava o jeito de antes (Aguardando revisão) com a mesma explicação em "Pendência", sem derrubar a etapa.
-- =============================================================================

do $$
declare c text;
begin
  -- a regra de situação do documento é a única restrição de ch_documents que cita "awaiting_review"
  for c in select conname from pg_constraint
            where conrelid = 'public.ch_documents'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%awaiting_review%'
  loop
    execute format('alter table public.ch_documents drop constraint %I', c);
  end loop;
  alter table public.ch_documents add constraint ch_documents_status_check
    check (status in ('received', 'extracting', 'classifying', 'verifying_sources', 'drafting', 'awaiting_review', 'no_drafts', 'failed'));
end
$$;
