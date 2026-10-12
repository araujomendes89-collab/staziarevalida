-- =============================================================================
-- Fase 1 · Grupo A · CC07 — Central de Conteúdo › Documentos: quem é da equipe (editor ou administrador) passa a ver os documentos
-- enviados por QUALQUER pessoa da equipe. Antes só o dono do documento e o administrador viam; o editor não enxergava o documento
-- que outra pessoa enviou (nem a lista, nem as páginas, nem o texto extraído) e a mesma pessoa podia enviar o mesmo PDF duas vezes.
--
-- Pode ser colada de novo no Supabase sem estragar nada (create or replace / drop policy if exists). Não apaga nem altera dado.
-- Parte das ÚNICAS versões anteriores (20261003001400_content_hub.sql): ch_assert_document, app_ch_documents e as três políticas.
-- Continua valendo: aluno nunca vê; revisor médico que não é da equipe vê só o que ele mesmo enviou (como antes).
-- O envio do mesmo PDF continua "um por pessoa" (unique owner_id + sha256): editores diferentes podem ter o mesmo PDF cada um.
-- =============================================================================

-- Quem pode abrir o documento: o dono, ou qualquer editor/administrador.
create or replace function public.ch_assert_document(p_document_id uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.ch_documents d
                 where d.id = p_document_id and (d.owner_id = (select auth.uid()) or public.is_staff())) then
    raise exception 'Documento não encontrado ou sem acesso.' using errcode = '42501';
  end if;
end
$$;

-- Leitura direta das tabelas (RLS): dono ou equipe.
drop policy if exists "documentos: dono ou admin" on public.ch_documents;
drop policy if exists "documentos: dono ou equipe" on public.ch_documents;
create policy "documentos: dono ou equipe" on public.ch_documents for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_staff());

drop policy if exists "páginas: dono ou admin" on public.ch_pages;
drop policy if exists "páginas: dono ou equipe" on public.ch_pages;
create policy "páginas: dono ou equipe" on public.ch_pages for select to authenticated
  using (exists (select 1 from public.ch_documents d where d.id = document_id and (d.owner_id = (select auth.uid()) or public.is_staff())));

drop policy if exists "blocos: dono ou admin" on public.ch_blocks;
drop policy if exists "blocos: dono ou equipe" on public.ch_blocks;
create policy "blocos: dono ou equipe" on public.ch_blocks for select to authenticated
  using (exists (select 1 from public.ch_documents d where d.id = document_id and (d.owner_id = (select auth.uid()) or public.is_staff())));

-- Lista de documentos do painel: os seus e, sendo da equipe, os de todos.
create or replace function public.app_ch_documents() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'status', d.status, 'text_kind', d.text_kind, 'page_count', d.page_count, 'rights_status', d.rights_status,
        'created_at', d.created_at, 'failure', d.failure,
        'jobs', (select coalesce(jsonb_agg(jsonb_build_object('step', j.step, 'status', j.status, 'attempts', j.attempts, 'error', j.error) order by j.created_at), '[]'::jsonb) from public.ch_jobs j where j.document_id = d.id))
      order by d.created_at desc)
    from public.ch_documents d where d.owner_id = (select auth.uid()) or public.is_staff()), '[]'::jsonb);
end
$$;
