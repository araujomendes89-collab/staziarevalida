-- Central de Conteúdo: o conteúdo inteiro das unidades publicadas e a tabela de publicações ficam só para a equipe.
-- Correção imediata (decisão do dono em 2026-10-10; spec da publicação da Central para o aluno, §4 "Gabarito vazando").
-- Antes: app_ch_published_units() (20261003001400_content_hub.sql:1221) entregava a qualquer aluno logado o content inteiro de cada
-- versão publicada, com o gabarito das questões e rastros internos (claim_ids, official_check, review_flags, scope_note), e a política
-- "publicações: alunos leem as ativas" deixava o aluno ler ch_publications direto. Nenhuma tela do aluno usa nenhuma das duas.
-- Depois: a função recusa quem não é da equipe ("Acesso restrito à equipe de conteúdo.") e devolve à equipe o mesmo de antes;
-- a leitura de ch_publications passa a ser só da equipe (editores, administradores e revisores médicos).
-- Pode ser colada de novo no Supabase sem erro (create or replace, drop policy if exists) e não mexe em nenhum dado.

-- 1. app_ch_published_units: só a equipe (parte de 20261003001400_content_hub.sql:1221, a única definição)
create or replace function public.app_ch_published_units() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return (
    select coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'title', u.title, 'version', v.version, 'published_at', p.published_at,
             'content', v.content, 'materials', (select coalesce(jsonb_object_agg(m.kind, m.content), '{}'::jsonb) from public.ch_materials m where m.unit_version_id = v.id))
             order by u.title), '[]'::jsonb)
    from public.ch_publications p join public.ch_unit_versions v on v.id = p.unit_version_id join public.ch_units u on u.id = v.unit_id
    where p.retired_at is null and v.status in ('published', 'needs_update'));
end
$$;

-- 2. ch_publications: leitura direta só da equipe (troca "publicações: alunos leem as ativas")
drop policy if exists "publicações: alunos leem as ativas" on public.ch_publications;
drop policy if exists "publicações: equipe lê" on public.ch_publications;
create policy "publicações: equipe lê" on public.ch_publications
  for select to authenticated using (public.is_staff() or public.ch_is_reviewer());

-- 99. Permissões
revoke execute on function public.app_ch_published_units() from public, anon;
