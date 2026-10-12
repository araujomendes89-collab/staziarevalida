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
--   * Falha ao apagar não desfaz nada: o arquivo fica "pendente" com o erro anotado e é tentado de novo na PRÓXIMA limpeza de
--     qualquer episódio (a fila é única, não depende do episódio que a causou); a operação principal já terminou.
--   * RESERVA DO CAMINHO (corrida entre "conferir se está em uso" e "apagar"): quem vai apagar primeiro RESERVA o caminho no banco
--     (estado "apagando", ch_worker_podcast_files_pending, que devolve um CÓDIGO da reserva) e só então apaga. Enquanto a reserva vale
--     (10 minutos), quem tenta criar uma referência ao caminho (episódio, fonte, material de aula, retenção) é RECUSADO com aviso em
--     português (gatilho podcast_files_guard_ref). As duas pontas usam o mesmo cadeado do banco, então não há "conferi, alguém usou, apaguei".
--   * ANTES DE CADA exclusão o servidor RENOVA a reserva (ch_worker_podcast_files_renew): o banco confere o código, que a reserva não
--     venceu e que nenhuma linha passou a usar o caminho; se não confirmar, o servidor PULA o arquivo. Reserva vencida nunca autoriza
--     apagar. Cada reserva tem um código próprio (reserve_token): a confirmação (ch_worker_podcast_files_done) só vale com o código
--     vigente, então a resposta atrasada de uma tentativa antiga não mexe na reserva de uma tentativa nova.
--   * Nenhum evento se perde: se o caminho já tem entrada aberta, o novo evento marca "reavaliar" (nunca é descartado) e, se a limpeza
--     encerrou o caminho como "mantido", o evento seguinte abre uma entrada nova; além disso a limpeza reavalia periodicamente as
--     entradas "mantido" antigas (uma hora), que é a rede de segurança para o último uso liberado.
--   * Servidor ANTIGO (janela curta "SQL novo + site antigo"): ele apaga direto, sem reserva, EXATAMENTE como já faz hoje. O que o SQL
--     faz por ele: app_admin_delete_podcast passa a devolver só os caminhos que nenhuma outra linha usa.
--   * O que foi apagado vai para o Registro da Administração (podcast.files.cleanup): quais arquivos e quantos.
--
-- Funções novas (os gatilhos pegam qualquer caminho que mude o áudio ou apague a fonte):
--   gatilhos podcast_files_queue_audio / podcast_files_queue_audio_del / podcast_files_queue_source (anotam na fila) e
--   podcast_files_guard_ref (recusa referência a caminho reservado);
--   ch_worker_podcast_files_pending(p_user, p_podcast), ch_worker_podcast_files_renew(p_user, p_id, p_token) e
--   ch_worker_podcast_files_done(p_user, p_results): só o servidor chama; podcast_files_blocked(caminho) é interna.
-- Função existente redefinida: app_admin_delete_podcast (versão da 4700; só muda a lista de caminhos devolvida ao servidor antigo).
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
  status text not null default 'pendente' check (status in ('pendente', 'apagando', 'apagado', 'mantido')),
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  reserved_at timestamptz,                              -- quando o servidor reservou (ou renovou) o caminho para apagar (estado 'apagando')
  reserve_token uuid,                                   -- código da reserva vigente: só quem o tem confirma ou renova
  reavaliar boolean not null default false,             -- chegou um novo evento enquanto a entrada estava aberta: reavaliar antes de encerrar
  resolved_at timestamptz
);
alter table public.podcast_files_released add column if not exists reserve_token uuid;
alter table public.podcast_files_released add column if not exists reavaliar boolean not null default false;
-- um caminho tem no máximo UMA linha em andamento (pendente ou reservada)
drop index if exists public.podcast_files_released_pending_uq;
create unique index if not exists podcast_files_released_open_uq on public.podcast_files_released (storage_path) where status in ('pendente', 'apagando');
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
  on conflict (storage_path) where status in ('pendente', 'apagando') do update set reavaliar = true;
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
  on conflict (storage_path) where status in ('pendente', 'apagando') do update set reavaliar = true;
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
  on conflict (storage_path) where status in ('pendente', 'apagando') do update set reavaliar = true;
  return null;
end
$$;
drop trigger if exists podcast_files_queue_source on public.podcast_sources;
create trigger podcast_files_queue_source after delete on public.podcast_sources
  for each row when (old.storage_path is not null) execute function public.podcast_files_queue_source();

-- ---------------------------------------------------------------- reserva: quem cria referência respeita o caminho reservado
-- Trava (mesmo cadeado de ch_worker_podcast_files_pending) e recusa se o caminho está reservado para apagar. A reserva vale 10 minutos
-- (se o servidor que reservou caiu, ela vence e o caminho volta a ser reavaliado). Só olha caminhos podcasts/...: o resto passa direto.
create or replace function public.podcast_files_guard_ref() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_path text := to_jsonb(new) ->> TG_ARGV[0];
begin
  if v_path is null or v_path not like 'podcasts/%' then return new; end if;
  if TG_OP = 'UPDATE' and (to_jsonb(old) ->> TG_ARGV[0]) is not distinct from v_path then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('podcast-file:' || v_path, 0));
  if exists (select 1 from public.podcast_files_released r
              where r.storage_path = v_path and r.status = 'apagando' and r.reserved_at > clock_timestamp() - interval '10 minutes') then
    raise exception 'Este arquivo está sendo apagado do depósito agora. Tente de novo em instantes.' using errcode = '55P03';
  end if;
  return new;
end
$$;
drop trigger if exists podcast_files_guard_audio on public.podcasts;
create trigger podcast_files_guard_audio before insert or update of audio_path on public.podcasts
  for each row execute function public.podcast_files_guard_ref('audio_path');
drop trigger if exists podcast_files_guard_source on public.podcast_sources;
create trigger podcast_files_guard_source before insert or update of storage_path on public.podcast_sources
  for each row execute function public.podcast_files_guard_ref('storage_path');
drop trigger if exists podcast_files_guard_material on public.lesson_materials;
create trigger podcast_files_guard_material before insert or update of storage_path on public.lesson_materials
  for each row execute function public.podcast_files_guard_ref('storage_path');
drop trigger if exists podcast_files_guard_hold on public.ch_file_holds;
create trigger podcast_files_guard_hold before insert or update of storage_path on public.ch_file_holds
  for each row execute function public.podcast_files_guard_ref('storage_path');

-- ---------------------------------------------------------------- servidor: reserva o que pode ser apagado agora
-- Regra única de "este caminho NÃO pode ser apagado": formato diferente de podcasts/<id de episódio>/<arquivo>, ou alguma linha do banco
-- (episódio, fonte, material de aula, retenção da Fonte complementar) ainda o usa. O formato aceita a pasta de QUALQUER episódio: um
-- arquivo compartilhado fica na pasta do primeiro episódio que o criou, e o último a soltá-lo é quem o libera.
create or replace function public.podcast_files_blocked(p_path text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_path !~ '^podcasts/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_./-]+$'
      or p_path like '%..%'
      or exists (select 1 from public.podcasts x where x.audio_path = p_path)
      or exists (select 1 from public.podcast_sources s where s.storage_path = p_path)
      or exists (select 1 from public.lesson_materials m where m.storage_path = p_path)
      or exists (select 1 from public.ch_file_holds h where h.storage_path = p_path)
$$;

-- Percorre a fila inteira (p_podcast nulo) ou só a de um episódio. Para cada caminho pendente (ou com reserva vencida): se nada o
-- usa, RESERVA ('apagando', com um código novo que invalida qualquer reserva anterior) e devolve {id, path, reason, token}; senão vira
-- "mantido" e não é apagado. Quem tem reserva em andamento, ou está sendo mexido agora por outra operação, é pulado. No máximo 50
-- por chamada. Rede de segurança: até 10 entradas "mantido" com mais de uma hora são reavaliadas (se o último uso já foi liberado e o
-- evento se perdeu, o arquivo sai agora; se ainda é usado, continuam "mantido").
create or replace function public.ch_worker_podcast_files_pending(p_user uuid, p_podcast uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_token uuid;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  for v_row in
    select r.id, r.storage_path, r.reason
      from public.podcast_files_released r
     where (r.status = 'pendente' or (r.status = 'apagando' and r.reserved_at <= clock_timestamp() - interval '10 minutes'))
       and (p_podcast is null or r.podcast_id = p_podcast)
     order by r.attempts, r.id
     limit 50
       for update skip locked
  loop
    -- outra operação está criando referência a este caminho agora: fica para a próxima limpeza
    if not pg_try_advisory_xact_lock(hashtextextended('podcast-file:' || v_row.storage_path, 0)) then continue; end if;
    if public.podcast_files_blocked(v_row.storage_path) then
      update public.podcast_files_released
         set status = 'mantido', resolved_at = now(), reserved_at = null, reserve_token = null, reavaliar = false where id = v_row.id;
    else
      v_token := gen_random_uuid();
      update public.podcast_files_released
         set status = 'apagando', reserved_at = clock_timestamp(), reserve_token = v_token, reavaliar = false where id = v_row.id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_row.id, 'path', v_row.storage_path, 'reason', v_row.reason, 'token', v_token));
    end if;
  end loop;
  -- reavaliação periódica das entradas "mantido" antigas
  for v_row in
    select r.id, r.storage_path, r.reason
      from public.podcast_files_released r
     where r.status = 'mantido' and r.resolved_at <= now() - interval '1 hour'
       and (p_podcast is null or r.podcast_id = p_podcast)
     order by r.resolved_at, r.id
     limit 10
       for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('podcast-file:' || v_row.storage_path, 0)) then continue; end if;
    if public.podcast_files_blocked(v_row.storage_path)
       or exists (select 1 from public.podcast_files_released o where o.storage_path = v_row.storage_path and o.status in ('pendente', 'apagando')) then
      update public.podcast_files_released set resolved_at = now() where id = v_row.id;
    else
      v_token := gen_random_uuid();
      update public.podcast_files_released
         set status = 'apagando', reserved_at = clock_timestamp(), reserve_token = v_token, resolved_at = null, reavaliar = false where id = v_row.id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_row.id, 'path', v_row.storage_path, 'reason', v_row.reason, 'token', v_token));
    end if;
  end loop;
  return v_out;
end
$$;

-- O servidor chama ANTES DE CADA exclusão. Devolve o que fazer com o arquivo:
--   'ok'         a reserva ainda é a dele (código vigente, não vencida, nada usa o caminho): renovada por mais 10 minutos; PODE apagar;
--   'em_uso'     passou a ser usado por alguma linha: encerrado como mantido, NÃO apagar e não há limpeza pendente;
--   'resolvida'  outra tentativa já terminou este caminho (apagado ou mantido): nada a fazer;
--   'incompleta' a reserva venceu, voltou a pendente ou o código não é mais este: NÃO apagar, o arquivo segue na fila (o servidor tenta de novo);
--   'outra'      outra tentativa tem uma reserva vigente deste caminho: NÃO apagar; a limpeza está com ela.
-- Reserva vencida nunca autoriza apagar. O relógio é o REAL (clock_timestamp), lido DEPOIS de obter o cadeado do caminho e a linha: now()
-- é a hora de início da transação e, depois de esperar uma trava, daria uma autorização que já nasce vencida. Usa o mesmo cadeado por
-- caminho do gatilho podcast_files_guard_ref, então "renovei" e "alguém criou uma referência" acontecem numa ordem só.
-- (a primeira versão devolvia boolean; trocar o tipo de retorno exige apagar a função antes — nada a usa além desta migração)
drop function if exists public.ch_worker_podcast_files_renew(uuid, bigint, uuid);
create or replace function public.ch_worker_podcast_files_renew(p_user uuid, p_id bigint, p_token uuid) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_path text;
  v_row public.podcast_files_released;
  v_agora timestamptz;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  if p_id is null or p_token is null then return 'incompleta'; end if;
  select storage_path into v_path from public.podcast_files_released where id = p_id;
  if v_path is null then return 'resolvida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('podcast-file:' || v_path, 0));
  select * into v_row from public.podcast_files_released where id = p_id for update;  -- relê já com o cadeado e a linha travada
  v_agora := clock_timestamp();                                                          -- só agora: depois de toda a espera
  if not found or v_row.status in ('apagado', 'mantido') then return 'resolvida'; end if;
  if v_row.status = 'pendente' then return 'incompleta'; end if;
  if v_row.reserve_token is distinct from p_token then
    return case when v_row.reserved_at > v_agora - interval '10 minutes' then 'outra' else 'incompleta' end;
  end if;
  if v_row.reserved_at <= v_agora - interval '10 minutes' then return 'incompleta'; end if;
  if public.podcast_files_blocked(v_row.storage_path) then
    -- passou a ter uso: encerra como mantido (ou volta para pendente se chegou novo evento) e o servidor não apaga
    update public.podcast_files_released
       set status = case when v_row.reavaliar then 'pendente' else 'mantido' end,
           resolved_at = case when v_row.reavaliar then null else now() end,
           reserved_at = null, reserve_token = null, reavaliar = false
     where id = p_id;
    return 'em_uso';
  end if;
  update public.podcast_files_released set reserved_at = clock_timestamp() where id = p_id;
  return 'ok';
end
$$;

-- O servidor diz o que fez: [{ id, token, ok, error }]. SÓ vale para a reserva VIGENTE (estado 'apagando' e o mesmo código): quem foi
-- apagado sai da fila e entra no Registro (uma vez, só o que esta chamada confirmou); quem falhou volta a 'pendente' com o erro, para a
-- próxima limpeza. Resposta atrasada de uma tentativa antiga (código que não é mais o vigente) é ignorada.
create or replace function public.ch_worker_podcast_files_done(p_user uuid, p_results jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if not public.user_is_staff(p_user) then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  if jsonb_typeof(p_results) <> 'array' then return 0; end if;
  -- UPDATE ... RETURNING: o Registro parte das linhas que ESTA chamada mudou de fato (id repetido, id que ninguém reservou, código
  -- que não é o vigente ou chamada repetida não geram Registro). Um item por episódio: quais arquivos, quantos áudios e arquivos de fonte, falhas.
  with got as (
    select (e ->> 'id')::bigint as id, (e ->> 'token')::uuid as token,
           bool_or((e ->> 'ok')::boolean is true) as ok, max(e ->> 'error') as err
      from jsonb_array_elements(p_results) e
     where (e ->> 'id') ~ '^[0-9]{1,18}$'
       and (e ->> 'token') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     group by 1, 2
  ), upd as (
    update public.podcast_files_released r
       set status = case when g.ok then 'apagado' else 'pendente' end,
           resolved_at = case when g.ok then now() else null end,
           reserved_at = null,
           reserve_token = null,
           reavaliar = case when g.ok then r.reavaliar else false end,
           attempts = case when g.ok then r.attempts else r.attempts + 1 end,
           last_error = case when g.ok then r.last_error else left(coalesce(g.err, 'erro sem texto'), 300) end
      from got g
     where r.id = g.id and r.status = 'apagando' and r.reserve_token = g.token
    returning r.id, r.podcast_id, r.storage_path, g.ok
  ), reg as (
    insert into public.admin_audit_log (actor_id, action, target, details)
    select p_user, 'podcast.files.cleanup', d.podcast_id::text,
           jsonb_build_object('arquivos', to_jsonb(array_agg(regexp_replace(d.storage_path, '^.*/', '') order by d.id) filter (where d.ok)),
                              'audios', (count(*) filter (where d.ok and d.storage_path ~ '/audio-[^/]*$'))::int,
                              'fontes', (count(*) filter (where d.ok and d.storage_path !~ '/audio-[^/]*$'))::int,
                              'falhas', (count(*) filter (where not d.ok))::int)
      from upd d
     group by d.podcast_id
    having count(*) filter (where d.ok) > 0
    returning 1
  )
  select count(*)::int into v_deleted from upd where ok;
  return v_deleted;
end
$$;

-- ---------------------------------------------------------------- servidor antigo: só devolve para apagar o que nenhuma outra linha usa
-- Mesma função da 4700 (a única definição anterior). A única mudança: a lista `paths` (que o servidor ANTIGO apaga do depósito direto)
-- não traz caminho que outro episódio, fonte de outro episódio, material de aula ou retenção ainda usa. O servidor novo não usa
-- `paths`: os caminhos entram na fila pelos gatilhos e passam pela reserva.
create or replace function public.app_admin_delete_podcast(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_paths jsonb;
begin
  perform public.assert_admin();
  select coalesce(jsonb_agg(t.x), '[]'::jsonb) into v_paths from (
    select audio_path x from public.podcasts where id = p_id and audio_path is not null
    union all select storage_path from public.podcast_sources where podcast_id = p_id and storage_path is not null) t
   where not exists (select 1 from public.podcasts o where o.id <> p_id and o.audio_path = t.x)
     and not exists (select 1 from public.podcast_sources o where o.podcast_id <> p_id and o.storage_path = t.x)
     and not exists (select 1 from public.lesson_materials m where m.storage_path = t.x)
     and not exists (select 1 from public.ch_file_holds h where h.storage_path = t.x);
  delete from public.podcasts where id = p_id;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  perform public.admin_log('podcast.delete', p_id::text, '{}'::jsonb);
  return jsonb_build_object('deleted', true, 'paths', v_paths);
end
$$;

do $perm$
begin
  revoke execute on function public.podcast_files_queue_audio() from public, anon, authenticated;
  revoke execute on function public.podcast_files_queue_audio_del() from public, anon, authenticated;
  revoke execute on function public.podcast_files_queue_source() from public, anon, authenticated;
  revoke execute on function public.podcast_files_guard_ref() from public, anon, authenticated;
  revoke execute on function public.podcast_files_blocked(text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_files_pending(uuid, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_files_renew(uuid, bigint, uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_podcast_files_done(uuid, jsonb) from public, anon, authenticated;
end
$perm$;
