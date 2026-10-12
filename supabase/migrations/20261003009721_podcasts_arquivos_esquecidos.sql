-- =============================================================================
-- Podcasts: arquivos antigos que ficavam ESQUECIDOS no depósito (P08, decisão do dono em 2026-10-11).
--
-- Antes: editar o roteiro, gerar outro roteiro ou tirar uma fonte só desligava o vínculo do áudio no banco (audio_path = null) e o
-- MP3 antigo continuava guardado; o arquivo de uma fonte tirada também podia ficar. Só refazer o áudio e apagar o episódio
-- apagavam (às vezes) o arquivo.
-- Depois: CONSERVADOR e POR EVENTO. Quando um áudio deixa de valer, ou um episódio / uma fonte com arquivo some, o banco anota o
-- caminho numa fila (podcast_files_released) e o servidor apaga o arquivo logo em seguida, DEPOIS de conferir que nenhuma linha do
-- banco ainda usa o caminho (outro episódio ou fonte, material de aula, retenção de arquivo da Fonte complementar ch_file_holds).
-- Quem ainda é usado fica como "mantido" e NÃO é apagado. Apagar é sem volta, por isso:
--   * NÃO há varredura automática dos arquivos que já estão esquecidos hoje: para esses existe só uma LISTA de leitura
--     (supabase/rotinas/lista-podcasts-arquivos-esquecidos.sql), que o dono roda no Supabase e decide.
--   * A fila só recebe caminhos de eventos DESTA migração em diante, e só caminhos no formato podcasts/<id do episódio>/<arquivo>.
--   * Falha ao apagar não desfaz nada: o arquivo fica "pendente" com o erro anotado e é tentado de novo no próximo evento do
--     mesmo episódio; a operação principal (editar, gerar, tirar fonte, apagar) já terminou.
--   * O que foi apagado vai para o Registro da Administração (podcast.files.cleanup): quais arquivos e quantos.
--
-- Funções novas (nenhuma função existente é redefinida; os gatilhos pegam qualquer caminho que mude o áudio ou apague a fonte):
--   gatilhos podcast_files_queue_audio / podcast_files_queue_audio_del / podcast_files_queue_source;
--   ch_worker_podcast_files_pending(p_user, p_podcast) e ch_worker_podcast_files_done(p_user, p_results): só o servidor chama.
-- PRÉ-REQUISITO: a 20261003009620 (cria ch_file_holds). Pode ser colada duas vezes e não muda nenhum dado existente.
-- =============================================================================

do $$
begin
  if to_regclass('public.ch_file_holds') is null then
    raise exception 'Cole antes a migração 20261003009620 (Fontes complementares): ela cria a retenção de arquivos (ch_file_holds).';
  end if;
end
$$;

create table if not exists public.podcast_files_released (
  id bigint generated always as identity primary key,
  podcast_id uuid,                                      -- sem chave estrangeira: o episódio pode já ter sido apagado
  storage_path text not null check (char_length(storage_path) <= 300),
  reason text not null check (reason in ('audio_invalidado', 'audio_refeito', 'fonte_tirada', 'episodio_apagado')),
  status text not null default 'pendente' check (status in ('pendente', 'apagado', 'mantido')),
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists podcast_files_released_pending_uq on public.podcast_files_released (storage_path) where status = 'pendente';
create index if not exists podcast_files_released_podcast_idx on public.podcast_files_released (podcast_id) where status = 'pendente';
alter table public.podcast_files_released enable row level security;
revoke all on public.podcast_files_released from public, anon, authenticated;

-- ---------------------------------------------------------------- gatilhos: anotam o caminho que ficou sem uso
create or replace function public.podcast_files_queue_audio() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.podcast_files_released (podcast_id, storage_path, reason)
  values (new.id, old.audio_path, case when new.audio_path is null then 'audio_invalidado' else 'audio_refeito' end)
  on conflict (storage_path) where status = 'pendente' do nothing;
  return null;
end
$$;
drop trigger if exists podcast_files_queue_audio on public.podcasts;
create trigger podcast_files_queue_audio after update of audio_path on public.podcasts
  for each row when (old.audio_path is not null and old.audio_path is distinct from new.audio_path) execute function public.podcast_files_queue_audio();

create or replace function public.podcast_files_queue_audio_del() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.podcast_files_released (podcast_id, storage_path, reason)
  values (old.id, old.audio_path, 'episodio_apagado')
  on conflict (storage_path) where status = 'pendente' do nothing;
  return null;
end
$$;
drop trigger if exists podcast_files_queue_audio_del on public.podcasts;
create trigger podcast_files_queue_audio_del after delete on public.podcasts
  for each row when (old.audio_path is not null) execute function public.podcast_files_queue_audio_del();

create or replace function public.podcast_files_queue_source() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.podcast_files_released (podcast_id, storage_path, reason)
  values (old.podcast_id, old.storage_path,
          case when exists (select 1 from public.podcasts p where p.id = old.podcast_id) then 'fonte_tirada' else 'episodio_apagado' end)
  on conflict (storage_path) where status = 'pendente' do nothing;
  return null;
end
$$;
drop trigger if exists podcast_files_queue_source on public.podcast_sources;
create trigger podcast_files_queue_source after delete on public.podcast_sources
  for each row when (old.storage_path is not null) execute function public.podcast_files_queue_source();

-- ---------------------------------------------------------------- servidor: o que pode ser apagado agora
-- Devolve os arquivos pendentes do episódio que NENHUMA linha do banco usa mais. O que ainda é usado (ou não tem o formato
-- podcasts/<id do episódio>/<arquivo>) vira "mantido" e nunca é apagado. No máximo 50 por chamada.
create or replace function public.ch_worker_podcast_files_pending(p_user uuid, p_podcast uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  update public.podcast_files_released r set status = 'mantido', resolved_at = now()
   where r.status = 'pendente' and r.podcast_id = p_podcast
     and (r.storage_path !~ ('^podcasts/' || p_podcast::text || '/[A-Za-z0-9_./-]+$') or r.storage_path like '%..%'
          or exists (select 1 from public.podcasts x where x.audio_path = r.storage_path)
          or exists (select 1 from public.podcast_sources s where s.storage_path = r.storage_path)
          or exists (select 1 from public.lesson_materials m where m.storage_path = r.storage_path)
          or exists (select 1 from public.ch_file_holds h where h.storage_path = r.storage_path));
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'path', t.storage_path, 'reason', t.reason) order by t.id)
                     from (select * from public.podcast_files_released r where r.status = 'pendente' and r.podcast_id = p_podcast order by r.id limit 50) t), '[]'::jsonb);
end
$$;

-- O servidor diz o que apagou: [{ id, ok, error }]. Quem foi apagado sai da fila e entra no Registro; quem falhou fica para a próxima.
create or replace function public.ch_worker_podcast_files_done(p_user uuid, p_results jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_deleted integer := 0;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  if jsonb_typeof(p_results) <> 'array' then return 0; end if;
  update public.podcast_files_released r set status = 'apagado', resolved_at = now()
   where r.status = 'pendente' and r.id in (select (x ->> 'id')::bigint from jsonb_array_elements(p_results) x where (x ->> 'ok')::boolean is true);
  get diagnostics v_deleted = row_count;
  update public.podcast_files_released r set attempts = r.attempts + 1, last_error = left(coalesce(x.err, 'erro sem texto'), 300)
    from (select (e ->> 'id')::bigint as id, e ->> 'error' as err from jsonb_array_elements(p_results) e where (e ->> 'ok')::boolean is not true) x
   where r.id = x.id and r.status = 'pendente';
  -- Registro: um item por episódio com o que foi apagado agora (quais arquivos, quantos áudios e quantos arquivos de fonte)
  for v_row in
    select r.podcast_id,
           array_agg(regexp_replace(r.storage_path, '^.*/', '') order by r.id) as arquivos,
           count(*) filter (where r.storage_path ~ '/audio-[^/]*$')::int as audios,
           count(*) filter (where r.storage_path !~ '/audio-[^/]*$')::int as fontes
      from public.podcast_files_released r
     where r.status = 'apagado' and r.id in (select (x ->> 'id')::bigint from jsonb_array_elements(p_results) x where (x ->> 'ok')::boolean is true)
     group by r.podcast_id
  loop
    insert into public.admin_audit_log (actor_id, action, target, details)
    values (p_user, 'podcast.files.cleanup', v_row.podcast_id::text,
            jsonb_build_object('arquivos', to_jsonb(v_row.arquivos), 'audios', v_row.audios, 'fontes', v_row.fontes,
                               'falhas', (select count(*)::int from jsonb_array_elements(p_results) e where (e ->> 'ok')::boolean is not true)));
  end loop;
  return v_deleted;
end
$$;

do $perm$
begin
  revoke execute on function public.podcast_files_queue_audio() from public, anon, authenticated;
  revoke execute on function public.podcast_files_queue_audio_del() from public, anon, authenticated;
  revoke execute on function public.podcast_files_queue_source() from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_files_pending(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_files_done(uuid, jsonb) from public, anon, authenticated;
end
$perm$;
