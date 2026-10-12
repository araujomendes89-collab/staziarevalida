-- Aulas (A07, decisão do dono em 11/10/2026): quando a equipe REMOVE um material de aula (ou o troca por outro, ou apaga a aula),
-- o ARQUIVO guardado no depósito "lessons" também é apagado, como já acontece nos Podcasts.
--
-- Como funciona (nada que já existe é redefinido: só se ACRESCENTA uma fila, funções novas e gatilhos de conferência):
--   1. Um gatilho em lesson_materials anota na fila (lesson_files_pending_delete) o caminho do arquivo de toda linha que sai
--      (remover material, trocar PDF/áudio, liberar áudio que substitui outro, apagar a aula em cascata). Se anotar falhar, a
--      remoção do material continua valendo (o gatilho nunca derruba a ação).
--   2. RESERVA ANTES DE APAGAR. O servidor chama ch_worker_lesson_files_reserve(): o banco confere que ninguém mais usa o caminho
--      (outro material, fonte de episódio de podcast, retenção ch_file_holds) e MARCA o caminho como 'apagando' na fila. Só o que
--      foi reservado é devolvido para apagar. Enquanto o caminho está reservado, NINGUÉM consegue criar uma referência a ele (um
--      gatilho recusa material de aula, fonte de podcast ou retenção para esse caminho), então o arquivo não pode ganhar uso entre
--      "conferir" e "apagar". A conferência e a reserva (e cada criação de referência) rodam sob o mesmo trava por caminho
--      (pg_advisory_xact_lock), por isso uma criação simultânea ou é vista pela reserva ou é recusada por ela.
--   3. O servidor apaga o arquivo no depósito e confirma com ch_worker_lesson_files_done(): só então o caminho sai da fila e a
--      ação "lesson.file.delete" (Arquivo de aula apagado do depósito, com o caminho) vai para o Registro da Administração. SÓ
--      vale para o que foi reservado (nada é registrado sem reserva).
--   4. Se o depósito falhar, o servidor devolve o caminho (ch_worker_lesson_files_release): volta a 'pendente' e a remoção do
--      material não é desfeita. Se o servidor cair no meio (ou a confirmação falhar DEPOIS de apagar), a reserva vence em 10 minutos:
--      a próxima limpeza pega o caminho de novo, o servidor apaga (o que não existe é ignorado) e confirma, e o Registro ganha a
--      anotação. Reserva vencida não bloqueia ninguém.
--   5. Apagar e confirmar são funções de SERVIÇO (ch_worker_*): quem é da equipe e fala direto com o banco NÃO consegue chamar,
--      logo não consegue "confirmar" um apagamento que não houve nem esvaziar a fila.
-- Não há apagamento retroativo: arquivos que já ficaram órfãos antes desta migração não estão na fila e não são tocados.
-- Colar duas vezes não dá erro (tudo idempotente).

create table if not exists public.lesson_files_pending_delete (
  storage_path text primary key,
  lesson_id uuid,
  material_kind text,
  queued_by uuid,
  queued_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending', 'deleting')),
  reserved_at timestamptz,
  reserved_by uuid
);
alter table public.lesson_files_pending_delete add column if not exists state text not null default 'pending';
alter table public.lesson_files_pending_delete add column if not exists reserved_at timestamptz;
alter table public.lesson_files_pending_delete add column if not exists reserved_by uuid;
alter table public.lesson_files_pending_delete enable row level security;
revoke all on public.lesson_files_pending_delete from public, anon, authenticated;

-- (versão anterior desta rotina, que a equipe chamava direto: some; só o servidor limpa)
drop function if exists public.app_admin_lesson_files_purge();
drop function if exists public.app_admin_lesson_files_done(text[]);

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

-- Quem cria uma referência a um caminho (material de aula, fonte de podcast, retenção) respeita a reserva "apagando".
-- Sob o mesmo trava por caminho da reserva: ou a reserva já está gravada (a criação é recusada) ou a criação já está gravada
-- (a reserva a enxerga e desiste do apagamento). Reserva vencida (10 minutos) não bloqueia.
create or replace function public.lesson_file_reference_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.storage_path is null then return new; end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-file:' || new.storage_path, 0));
  if exists (select 1 from public.lesson_files_pending_delete q
              where q.storage_path = new.storage_path and q.state = 'deleting' and q.reserved_at > now() - interval '10 minutes') then
    raise exception 'Este arquivo está sendo apagado do depósito neste momento. Envie o arquivo de novo em instantes.' using errcode = '55006';
  end if;
  return new;
end
$$;
revoke execute on function public.lesson_file_reference_guard() from public, anon, authenticated;

drop trigger if exists lesson_materials_file_reference_guard on public.lesson_materials;
create trigger lesson_materials_file_reference_guard before insert or update of storage_path on public.lesson_materials
  for each row execute function public.lesson_file_reference_guard();
drop trigger if exists podcast_sources_file_reference_guard on public.podcast_sources;
create trigger podcast_sources_file_reference_guard before insert or update of storage_path on public.podcast_sources
  for each row execute function public.lesson_file_reference_guard();
do $$
begin
  -- ch_file_holds nasce na 9620 (já no ar); se ainda não existe, a 9620 colada depois não recebe o gatilho: cole esta de novo
  if to_regclass('public.ch_file_holds') is not null then
    drop trigger if exists ch_file_holds_file_reference_guard on public.ch_file_holds;
    create trigger ch_file_holds_file_reference_guard before insert on public.ch_file_holds
      for each row execute function public.lesson_file_reference_guard();
  end if;
end
$$;

-- Reserva os arquivos que podem ser apagados AGORA (até 200 por chamada; o servidor repete até acabar) e devolve só esses caminhos.
-- Função de serviço (o servidor já conferiu que quem pediu é da equipe). p_actor = quem pediu a limpeza (vai para o Registro).
create or replace function public.ch_worker_lesson_files_reserve(p_actor uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_paths text[] := '{}';
begin
  -- quem voltou a ser usado (outro material ou fonte de podcast) sai da fila sem apagar; sem limite, para não ocupar o lote
  delete from public.lesson_files_pending_delete q
   where (q.state = 'pending' or q.reserved_at is null or q.reserved_at <= now() - interval '10 minutes')
     and (exists (select 1 from public.lesson_materials m where m.storage_path = q.storage_path)
          or exists (select 1 from public.podcast_sources s where s.storage_path = q.storage_path));
  -- candidatos: pendentes ou com reserva vencida, SEM retenção de arquivo (retido fica na fila até a retenção cair e não ocupa o lote)
  for r in
    select q.storage_path from public.lesson_files_pending_delete q
     where (q.state = 'pending' or q.reserved_at is null or q.reserved_at <= now() - interval '10 minutes')
       and not exists (select 1 from public.ch_file_holds h where h.storage_path = q.storage_path)
     order by q.queued_at, q.storage_path
     limit 200
     for update of q skip locked
  loop
    perform pg_advisory_xact_lock(hashtextextended('lesson-file:' || r.storage_path, 0));
    if exists (select 1 from public.lesson_materials m where m.storage_path = r.storage_path)
       or exists (select 1 from public.podcast_sources s where s.storage_path = r.storage_path) then
      delete from public.lesson_files_pending_delete where storage_path = r.storage_path; -- voltou a ser usado: não se apaga
    elsif exists (select 1 from public.ch_file_holds h where h.storage_path = r.storage_path) then
      null; -- ganhou retenção no meio do caminho: fica na fila
    else
      update public.lesson_files_pending_delete
         set state = 'deleting', reserved_at = now(), reserved_by = p_actor
       where storage_path = r.storage_path;
      v_paths := v_paths || r.storage_path;
    end if;
  end loop;
  return jsonb_build_object('paths', to_jsonb(v_paths));
end
$$;

-- O servidor apagou estes arquivos no depósito: tira da fila e registra. SÓ vale para caminho que está reservado ('apagando').
create or replace function public.ch_worker_lesson_files_done(p_paths text[], p_actor uuid default null) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  p text;
  r record;
  n integer := 0;
begin
  foreach p in array coalesce(p_paths, '{}') loop
    delete from public.lesson_files_pending_delete where storage_path = p and state = 'deleting'
    returning lesson_id, material_kind, reserved_by into r;
    if found then
      n := n + 1;
      insert into public.admin_audit_log (actor_id, action, target, details)
      values (coalesce(p_actor, r.reserved_by), 'lesson.file.delete', r.lesson_id::text, jsonb_build_object('path', p, 'kind', r.material_kind));
    end if;
  end loop;
  return n;
end
$$;

-- O depósito não conseguiu apagar: devolve a reserva (o caminho volta a 'pendente' e sai na próxima limpeza).
create or replace function public.ch_worker_lesson_files_release(p_paths text[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.lesson_files_pending_delete set state = 'pending', reserved_at = null, reserved_by = null
   where storage_path = any (coalesce(p_paths, '{}')) and state = 'deleting';
  get diagnostics n = row_count;
  return n;
end
$$;

revoke execute on function public.ch_worker_lesson_files_reserve(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_lesson_files_done(text[], uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_lesson_files_release(text[]) from public, anon, authenticated;
