-- Aulas (A07, decisão do dono em 11/10/2026): quando a equipe REMOVE um material de aula (ou o troca por outro, ou apaga a aula),
-- o ARQUIVO guardado no depósito "lessons" também é apagado, como já acontece nos Podcasts.
--
-- Como funciona (nada que já existe é redefinido: só se ACRESCENTA uma fila e duas funções novas):
--   1. Um gatilho em lesson_materials anota na fila (lesson_files_pending_delete) o caminho do arquivo de toda linha que sai
--      (remover material, trocar PDF/áudio, liberar áudio que substitui outro, apagar a aula em cascata). Se anotar falhar, a
--      remoção do material continua valendo (o gatilho nunca derruba a ação).
--   2. O servidor chama app_admin_lesson_files_purge(): devolve só os caminhos que podem ser apagados agora. Um caminho NÃO é
--      devolvido se outra linha ainda o usa (outro material, fonte de episódio de podcast) ou se ele está em retenção
--      (ch_file_holds, da Fonte complementar); se outra linha o usa, ele sai da fila sem ser apagado.
--   3. O servidor apaga cada arquivo no depósito e confirma com app_admin_lesson_files_done(): só então o caminho sai da fila e
--      a ação "lesson.file.delete" (Arquivo de aula apagado do depósito, com o caminho) vai para o Registro da Administração.
--      Se o depósito falhar, nada é confirmado: o caminho continua na fila e volta na próxima limpeza (a remoção do material
--      não é desfeita).
-- Não há apagamento retroativo: arquivos que já ficaram órfãos antes desta migração não estão na fila e não são tocados.
-- Colar duas vezes não dá erro (tudo idempotente).

create table if not exists public.lesson_files_pending_delete (
  storage_path text primary key,
  lesson_id uuid,
  material_kind text,
  queued_by uuid,
  queued_at timestamptz not null default now()
);
alter table public.lesson_files_pending_delete enable row level security;
revoke all on public.lesson_files_pending_delete from public, anon, authenticated;

create or replace function public.lesson_material_file_queue() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if old.storage_path is null or (tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path) then return null; end if;
    insert into public.lesson_files_pending_delete (storage_path, lesson_id, material_kind, queued_by)
    values (old.storage_path, old.lesson_id, old.kind, (select auth.uid()))
    on conflict (storage_path) do nothing;
  exception when others then
    -- a remoção do material vale mesmo que a fila falhe (o arquivo só fica sem apagar)
    raise warning 'lesson_material_file_queue: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end
$$;
revoke execute on function public.lesson_material_file_queue() from public, anon, authenticated;

drop trigger if exists lesson_materials_file_queue_del on public.lesson_materials;
create trigger lesson_materials_file_queue_del after delete on public.lesson_materials
  for each row execute function public.lesson_material_file_queue();
drop trigger if exists lesson_materials_file_queue_upd on public.lesson_materials;
create trigger lesson_materials_file_queue_upd after update of storage_path on public.lesson_materials
  for each row when (old.storage_path is not null and old.storage_path is distinct from new.storage_path)
  execute function public.lesson_material_file_queue();

-- Um caminho "em uso" não é apagado: outro material de aula, fonte de episódio de podcast ou retenção de arquivo.
create or replace function public.lesson_file_in_use(p_path text) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
begin
  -- (plpgsql, não sql: ch_file_holds nasce na 9620 e a checagem só roda quando a função é chamada)
  return exists (select 1 from public.lesson_materials m where m.storage_path = p_path)
      or exists (select 1 from public.podcast_sources s where s.storage_path = p_path)
      or exists (select 1 from public.ch_file_holds h where h.storage_path = p_path);
end
$$;
revoke execute on function public.lesson_file_in_use(text) from public, anon, authenticated;

-- Quais arquivos podem ser apagados agora. Equipe (editor ou administrador). Quem chama só recebe a lista: apagar é feito pelo servidor.
create or replace function public.app_admin_lesson_files_purge() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_paths text[] := '{}';
begin
  perform public.assert_staff();
  for r in select q.storage_path from public.lesson_files_pending_delete q order by q.queued_at, q.storage_path limit 200 for update skip locked loop
    if exists (select 1 from public.lesson_materials m where m.storage_path = r.storage_path)
       or exists (select 1 from public.podcast_sources s where s.storage_path = r.storage_path) then
      delete from public.lesson_files_pending_delete where storage_path = r.storage_path; -- voltou a ser usado: não se apaga
    elsif exists (select 1 from public.ch_file_holds h where h.storage_path = r.storage_path) then
      null; -- retenção de arquivo: fica na fila até cair
    else
      v_paths := v_paths || r.storage_path;
    end if;
  end loop;
  return jsonb_build_object('paths', to_jsonb(v_paths));
end
$$;

-- O servidor apagou estes arquivos no depósito: tira da fila e registra. Só vale para caminho que está na fila e que continua sem uso.
create or replace function public.app_admin_lesson_files_done(p_paths text[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  p text;
  r record;
  n integer := 0;
begin
  perform public.assert_staff();
  foreach p in array coalesce(p_paths, '{}') loop
    if public.lesson_file_in_use(p) then continue; end if;
    delete from public.lesson_files_pending_delete where storage_path = p returning lesson_id, material_kind into r;
    if found then
      n := n + 1;
      perform public.admin_log('lesson.file.delete', r.lesson_id::text, jsonb_build_object('path', p, 'kind', r.material_kind));
    end if;
  end loop;
  return n;
end
$$;

revoke execute on function public.app_admin_lesson_files_purge() from public, anon;
revoke execute on function public.app_admin_lesson_files_done(text[]) from public, anon;
grant execute on function public.app_admin_lesson_files_purge() to authenticated;
grant execute on function public.app_admin_lesson_files_done(text[]) to authenticated;
