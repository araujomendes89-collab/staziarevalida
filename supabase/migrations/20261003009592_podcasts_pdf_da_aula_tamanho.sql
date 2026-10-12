-- =============================================================================
-- Podcasts: o PDF da aula usado como fonte passa a respeitar o limite de 30 MB das outras fontes.
-- Antes (20261003004700_podcasts.sql:408, ch_worker_podcast_lesson): só o caminho do PDF ia ao servidor, que baixava o arquivo
-- inteiro (uma aula aceita PDF de até 200 MB) e lia tudo de uma vez.
-- Depois: a função também devolve o tamanho guardado do PDF ("slides_bytes"), e o servidor só baixa e lê o PDF até 30 MB.
-- Pode ser colada de novo no Supabase sem erro (create or replace) e não mexe em nenhum dado.
-- =============================================================================

-- ch_worker_podcast_lesson: parte de 20261003004700_podcasts.sql:408 (a única definição); só acrescenta 'slides_bytes'
create or replace function public.ch_worker_podcast_lesson(p_user uuid, p_lesson uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', l.id, 'title', l.title, 'topic', l.topic, 'area', l.area, 'summary', l.summary, 'key_points', l.key_points,
            'slides', (select m.storage_path from public.lesson_materials m where m.lesson_id = l.id and m.kind = 'slides' and m.storage_path is not null limit 1),
            'slides_bytes', (select m.size_bytes from public.lesson_materials m where m.lesson_id = l.id and m.kind = 'slides' and m.storage_path is not null limit 1))
          from public.lessons l where l.id = p_lesson);
end
$$;

revoke execute on function public.ch_worker_podcast_lesson(uuid, uuid) from public, anon, authenticated;
