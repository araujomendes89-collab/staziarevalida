-- =============================================================================
-- Depósito privado dos arquivos da Central de Conteúdo (PDFs originais e arquivos finais).
-- Só o servidor acessa, com a chave de serviço: nenhuma política libera leitura ao navegador;
-- os arquivos chegam às pessoas pelas rotas /api/content-hub, que conferem o acesso.
-- No banco de testes (sem o esquema "storage" do Supabase) este arquivo não faz nada.
-- =============================================================================
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('content-hub', 'content-hub', false, 314572800, array['application/pdf', 'text/html'])
    on conflict (id) do update set public = false;
  end if;
end
$$;
