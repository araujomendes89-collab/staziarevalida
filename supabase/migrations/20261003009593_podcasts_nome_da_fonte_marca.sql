-- =============================================================================
-- Podcasts: o nome da fonte que o aluno vê passa a depender de uma marca ("título da equipe"), não do final do título.
-- Antes (20261003009591): o aluno via "Documento N" quando o título de um PDF/DOCX terminava em .pdf/.doc/.docx. Dois defeitos:
-- (1) nome de arquivo longo (cortado em 200 caracteres) ou sem extensão passava e o aluno lia o nome do arquivo;
-- (2) se a equipe renomeasse a fonte para um nome que termina em ".pdf" (ex.: "PCDT.pdf"), o aluno continuava vendo "Documento N".
-- Depois: coluna podcast_sources.title_by_staff (padrão false). PDF e DOCX com title_by_staff = false aparecem ao aluno como
-- "Documento N" (N = a posição da fonte), seja qual for o nome do arquivo. Renomear pela equipe liga a marca e o nome vale como está.
-- Link, aula e texto colado mantêm o título. Pode ser colada de novo no Supabase sem erro e não apaga nem muda nenhum dado existente.
-- =============================================================================

alter table public.podcast_sources add column if not exists title_by_staff boolean not null default false;

-- app_podcast: parte de 20261003009591 (a mais nova); só muda a regra do título das fontes
create or replace function public.app_podcast(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'seconds', p.audio_seconds, 'published_at', p.published_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', l ->> 'text') order by o) from jsonb_array_elements(p.script -> 'lines') with ordinality as x (l, o)), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'title', case when s.kind in ('pdf', 'docx') and not s.title_by_staff then 'Documento ' || s.n::text else s.title end,
                         'kind', s.kind, 'url', s.url, 'pages',
                         (select jsonb_agg(distinct c.page order by c.page) from public.podcast_chunks c
                          where c.source_id = s.id and c.page is not null
                            and c.id in (select (jsonb_array_elements_text(l -> 'sources'))::bigint from jsonb_array_elements(p.script -> 'lines') l)))
                       order by s.n)
      from (select x.*, row_number() over (order by x.position, x.created_at) as n from public.podcast_sources x where x.podcast_id = p.id) s), '[]'::jsonb),
    'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id and l.published))
  from public.podcasts p
  where p.id = p_id and p.status = 'published' and (select auth.uid()) is not null
$$;

-- renomear (equipe): parte de 20261003009591; liga a marca
create or replace function public.app_admin_podcast_rename_source(p_source_id uuid, p_title text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_podcast uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  perform public.assert_staff();
  if v_title = '' or length(v_title) > 200 then raise exception 'Dê um nome de 1 a 200 caracteres.' using errcode = '22023'; end if;
  select podcast_id into v_podcast from public.podcast_sources where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if (select status from public.podcasts where id = v_podcast) = 'published' then raise exception 'Despublique o episódio antes de mexer nas fontes.' using errcode = '22023'; end if;
  update public.podcast_sources set title = v_title, title_by_staff = true where id = p_source_id;
  update public.podcasts set updated_at = now() where id = v_podcast;
  perform public.admin_log('podcast.source_rename', v_podcast::text, jsonb_build_object('source', p_source_id));
  return public.podcast_admin_view(v_podcast);
end
$$;

revoke execute on function public.app_podcast(uuid) from public, anon;
revoke execute on function public.app_admin_podcast_rename_source(uuid, text) from public, anon;
