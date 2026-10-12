-- =============================================================================
-- Podcasts: "Usar como Flashcast da aula" passa a ser só do administrador e só de episódio PUBLICADO.
-- Antes (20261003004700_podcasts.sql:420): qualquer pessoa da equipe (editor) copiava o áudio de um episódio ainda não publicado
-- para uma aula já no ar, sem passar pela publicação do administrador, e trocava o Flashcast que a aula já tinha.
-- Depois: a função recusa quem não é administrador ("Acesso restrito a administradores.") e episódio que não está publicado.
-- O servidor (server/podcasts/router.ts) também exige a confirmação do administrador antes de copiar.
-- Pode ser colada de novo no Supabase sem erro (create or replace) e não mexe em nenhum dado.
-- =============================================================================

create or replace function public.ch_worker_podcast_flashcast(p_user uuid, p_podcast uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare p public.podcasts;
begin
  if p_user is null or not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  select * into p from public.podcasts where id = p_podcast;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.status <> 'published' or p.approved_at is null or p.audio_path is null then
    raise exception 'O Flashcast precisa do episódio publicado (roteiro aprovado e áudio pronto).' using errcode = '22023';
  end if;
  return jsonb_build_object('title', p.title, 'lesson_id', p.lesson_id, 'audio_path', p.audio_path, 'audio_bytes', p.audio_bytes, 'seconds', p.audio_seconds);
end
$$;

revoke execute on function public.ch_worker_podcast_flashcast(uuid, uuid) from public, anon, authenticated;
