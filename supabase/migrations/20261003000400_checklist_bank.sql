-- =============================================================================
-- 2ª fase: Banco de Checklists, estudo em dupla em tempo real e simulados.
-- Especificação: checklists-pack/docs/especificacao-banco-checklists-simulados.md
-- =============================================================================

-- ---------------------------------------------------------------- estações
-- Catálogo enxuto (filtros, lista) separado do conteúdo completo (roteiro, impressos, PEP),
-- para que o conteúdo Pro e o que aguarda revisão médica não vazem pela listagem.
create table public.checklist_stations (
  id text primary key,
  name text not null,
  topic text not null,
  area text not null check (area in (
    'Clínica Médica', 'Cirurgia Geral', 'Pediatria', 'Ginecologia e Obstetrícia', 'Medicina de Família e Comunidade'
  )),
  setting text,
  taxonomy_path text[] not null default '{}',
  goal text not null default 'Revalida',
  institution text,                      -- 'INEP' = oficial; null = autoral
  year text,
  styles text[] not null default '{}',
  is_pro_only boolean not null default false,
  medical_review text not null default 'pending' check (medical_review in ('pending', 'approved')),
  max_score numeric(4, 2) not null default 10 check (max_score = 10),
  duration_ms integer not null default 600000 check (duration_ms > 0),
  created_at timestamptz not null default now()
);
alter table public.checklist_stations enable row level security;
create policy "estações: catálogo (aprovadas, ou equipe)" on public.checklist_stations
  for select to authenticated using (medical_review = 'approved' or public.is_staff());

create table public.checklist_station_contents (
  station_id text primary key references public.checklist_stations (id) on delete cascade,
  content jsonb not null          -- Station completo: roteiro, impressos, checklist_items, summary
);
alter table public.checklist_station_contents enable row level security;
create policy "estações: conteúdo (aprovada e acesso Pro quando exigido)" on public.checklist_station_contents
  for select to authenticated using (
    public.is_staff() or exists (
      select 1 from public.checklist_stations s
      where s.id = station_id and s.medical_review = 'approved' and (not s.is_pro_only or public.has_pro())
    )
  );

-- ---------------------------------------------------------------- favoritos e relatos
create table public.checklist_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  station_id text not null references public.checklist_stations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);
alter table public.checklist_favorites enable row level security;
create policy "favoritos: ler os próprios" on public.checklist_favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "favoritos: adicionar" on public.checklist_favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favoritos: remover" on public.checklist_favorites
  for delete to authenticated using (user_id = (select auth.uid()));

create table public.checklist_station_reports (
  id uuid primary key default gen_random_uuid(),
  station_id text not null references public.checklist_stations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.checklist_station_reports enable row level security;
create policy "relatos: enviar" on public.checklist_station_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "relatos: equipe lê" on public.checklist_station_reports
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------- simulados
create table public.checklist_events (
  id text primary key,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  station_ids text[] not null check (cardinality(station_ids) = 5),
  cover_url text,
  is_pro_only boolean not null default false,
  type text not null default 'Public'
);
alter table public.checklist_events enable row level security;
create policy "simulados: leitura para logados" on public.checklist_events for select to authenticated using (true);

create table public.checklist_event_confirmations (
  event_id text not null references public.checklist_events (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  confirmed_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.checklist_event_confirmations enable row level security;
-- A lista de participantes é visível a todos os inscritos no app (spec §2.2).
create policy "inscrições: leitura para logados" on public.checklist_event_confirmations
  for select to authenticated using (true);
create policy "inscrições: confirmar a própria" on public.checklist_event_confirmations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "inscrições: cancelar a própria" on public.checklist_event_confirmations
  for delete to authenticated using (user_id = (select auth.uid()));

-- Fila de estações de um aluno num simulado (escrita só pelo backend).
create table public.checklist_study_schedules (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text references public.checklist_events (id) on delete cascade,
  mode text not null default 'Classic',
  sessions jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array'),
  created_at timestamptz not null default now()
);
create index checklist_schedules_event_idx on public.checklist_study_schedules (event_id);
alter table public.checklist_study_schedules enable row level security;
-- Ranking do simulado: correctness de cada fila é visível aos logados.
create policy "filas: leitura para logados" on public.checklist_study_schedules
  for select to authenticated using (true);

-- Estação concluída. Só o backend grava, recalculando a nota a partir dos grades.
create table public.checklist_study_sessions (
  id text primary key,
  station_id text not null references public.checklist_stations (id),
  room_id uuid not null,
  schedule_id text references public.checklist_study_schedules (id) on delete set null,
  event_id text references public.checklist_events (id) on delete set null,
  actor_id uuid not null references auth.users (id) on delete cascade,
  doctor_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  pressings_released jsonb not null default '[]'::jsonb,
  checklist_answers jsonb not null default '[]'::jsonb,
  score numeric(5, 3) not null,
  max_score numeric(5, 3) not null,
  correctness numeric(4, 1) not null check (correctness between 0 and 100),
  actor_notes text not null default '' check (char_length(actor_notes) <= 1000),
  created_at timestamptz not null default now()
);
create index checklist_sessions_doctor_idx on public.checklist_study_sessions (doctor_id, finished_at desc);
create index checklist_sessions_actor_idx on public.checklist_study_sessions (actor_id, finished_at desc);
alter table public.checklist_study_sessions enable row level security;
create policy "sessões práticas: médico e ator leem" on public.checklist_study_sessions
  for select to authenticated using ((select auth.uid()) in (doctor_id, actor_id));

-- ---------------------------------------------------------------- sala em tempo real
create table public.checklist_rooms (
  id uuid primary key default gen_random_uuid(),
  member_ids uuid[] not null check (cardinality(member_ids) = 2 and member_ids[1] <> member_ids[2]),
  state jsonb not null,
  rev integer not null default 0,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.checklist_rooms enable row level security;
create policy "salas: membros leem" on public.checklist_rooms
  for select to authenticated using ((select auth.uid()) = any (member_ids));
create policy "salas: membro cria" on public.checklist_rooms
  for insert to authenticated with check ((select auth.uid()) = any (member_ids));
create policy "salas: membros atualizam" on public.checklist_rooms
  for update to authenticated using ((select auth.uid()) = any (member_ids))
  with check ((select auth.uid()) = any (member_ids));

-- Regras da sala (spec §5): transições válidas, só o ator escreve na avaliação,
-- só o backend marca a sessão como salva, rev cresce de 1 em 1.
create function public.guard_checklist_room() returns trigger
  language plpgsql set search_path = ''
as $$
declare
  uid uuid;
  o jsonb := old.state;
  n jsonb := new.state;
  o_status text := o ->> 'status';
  n_status text := n ->> 'status';
  actor uuid := nullif(o #>> '{roles,actor_id}', '')::uuid;
  was_saved boolean := (o #>> '{session,saved_session_id}') is not null;
  new_session_empty boolean := coalesce(n -> 'session', 'null'::jsonb) = 'null'::jsonb;
  ending_by_timeout boolean := false;
  elapsed_ms bigint;
  -- Campos da sessão que só o ator altera
  actor_fields text[] := array['station_id', 'allowed_pressings', 'checklists', 'started_at', 'finished_at',
                               'paused_at', 'paused_total_ms', 'is_paused', 'actor_notes', 'maximum_duration', 'show_clock'];
  f text;
begin
  -- Backend (service_role) não passa por estas regras.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  uid := (select auth.uid());

  if new.member_ids is distinct from old.member_ids then
    raise exception 'Os membros da sala não podem ser alterados.' using errcode = '42501';
  end if;
  if new.rev <> old.rev + 1 then
    raise exception 'Versão desatualizada da sala (rev %, esperado %).', new.rev, old.rev + 1 using errcode = '40001';
  end if;
  if (n #>> '{session,saved_session_id}') is distinct from (o #>> '{session,saved_session_id}')
     and not (new_session_empty and was_saved) then
    raise exception 'Só o servidor marca a sessão como salva.' using errcode = '42501';
  end if;
  if (n -> 'schedule') is distinct from (o -> 'schedule') then
    raise exception 'A fila de estações é alterada só pelo servidor.' using errcode = '42501';
  end if;

  -- 1) Papéis: escolhidos ao sair de Idle (sem sessão) ou zerados num "novo treino" após salvar.
  if (n -> 'roles') is distinct from (o -> 'roles') then
    if o_status = 'Idle' and n_status = 'WaitingActorChooseStation' and new_session_empty
       and (n #>> '{roles,actor_id}')::uuid = any (new.member_ids)
       and (n #>> '{roles,doctor_id}')::uuid = any (new.member_ids)
       and (n #>> '{roles,actor_id}') <> (n #>> '{roles,doctor_id}') then
      return new;
    elsif o_status = 'OnReview' and n_status = 'Idle' and was_saved and new_session_empty
          and coalesce(n -> 'roles', 'null'::jsonb) = 'null'::jsonb then
      return new;
    end if;
    raise exception 'Papéis só são escolhidos no início, entre os dois membros.' using errcode = '42501';
  end if;

  -- 2) Transições de estado (spec §5.4)
  if n_status is distinct from o_status then
    if (o_status = 'WaitingActorChooseStation' and n_status = 'WaitingActorStartStation')
       or (o_status = 'WaitingActorStartStation' and n_status in ('OnStation', 'WaitingActorChooseStation')) then
      if uid is distinct from actor then
        raise exception 'Só o ator escolhe e inicia a estação.' using errcode = '42501';
      end if;
    elsif o_status = 'OnStation' and n_status = 'OnReview' then
      if uid is distinct from actor then
        -- O médico só encerra se o tempo acabou (timer derivado dos timestamps).
        elapsed_ms := (extract(epoch from (now() - (o #>> '{session,started_at}')::timestamptz)) * 1000)::bigint
                      - coalesce((o #>> '{session,paused_total_ms}')::bigint, 0);
        if coalesce((o #>> '{session,is_paused}')::boolean, false) then
          elapsed_ms := elapsed_ms - (extract(epoch from (now() - (o #>> '{session,paused_at}')::timestamptz)) * 1000)::bigint;
        end if;
        if elapsed_ms < coalesce((o #>> '{session,maximum_duration}')::bigint, 600000) then
          raise exception 'Só o ator encerra a estação antes do fim do tempo.' using errcode = '42501';
        end if;
        ending_by_timeout := true;
      end if;
    elsif o_status = 'OnReview' and n_status = 'WaitingActorChooseStation' then
      -- Próxima estação (ex.: simulado): mesma dupla e papéis, sessão zerada.
      if not was_saved or not new_session_empty then
        raise exception 'Finalize e salve a estação antes de começar outra.' using errcode = '42501';
      end if;
      return new;
    else
      raise exception 'Transição inválida: % → %.', o_status, n_status using errcode = '42501';
    end if;
  end if;

  -- 3) Avaliação: só o ator altera; depois de salva, ninguém altera.
  foreach f in array actor_fields loop
    if (n -> 'session' -> f) is distinct from (o -> 'session' -> f) then
      if was_saved then
        raise exception 'A estação já foi salva; a avaliação não pode mudar.' using errcode = '42501';
      end if;
      if uid is distinct from actor and not (ending_by_timeout and f = 'finished_at') then
        raise exception 'Só o ator altera "%" durante a estação.', f using errcode = '42501';
      end if;
    end if;
  end loop;
  if char_length(coalesce(n #>> '{session,actor_notes}', '')) > 1000 then
    raise exception 'Observações do ator: máximo de 1000 caracteres.' using errcode = '22001';
  end if;
  return new;
end
$$;

create function public.stamp_checklist_room() returns trigger
  language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); new.updated_by := (select auth.uid()); return new; end $$;

create trigger checklist_rooms_guard before update on public.checklist_rooms
  for each row execute function public.guard_checklist_room();
create trigger checklist_rooms_stamp before update on public.checklist_rooms
  for each row execute function public.stamp_checklist_room();

-- ---------------------------------------------------------------- convites
create table public.study_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  room_id uuid not null references public.checklist_rooms (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  check (from_user <> to_user)
);
create index study_invites_to_idx on public.study_invites (to_user, created_at desc);
alter table public.study_invites enable row level security;
create policy "convites: envolvidos leem" on public.study_invites
  for select to authenticated using ((select auth.uid()) in (from_user, to_user));
create policy "convites: enviar" on public.study_invites
  for insert to authenticated with check (
    from_user = (select auth.uid()) and status = 'pending'
    and exists (select 1 from public.checklist_rooms r
                where r.id = room_id and from_user = any (r.member_ids) and to_user = any (r.member_ids))
  );
create policy "convites: responder ou cancelar" on public.study_invites
  for update to authenticated using ((select auth.uid()) in (from_user, to_user));

create function public.guard_study_invite() returns trigger
  language plpgsql set search_path = ''
as $$
declare uid uuid;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  uid := (select auth.uid());
  if (new.from_user, new.to_user, new.room_id, new.created_at, new.expires_at)
     is distinct from (old.from_user, old.to_user, old.room_id, old.created_at, old.expires_at) then
    raise exception 'Só o status do convite pode mudar.' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'Convite já respondido.' using errcode = '42501';
  end if;
  if new.status in ('accepted', 'declined') and uid <> old.to_user then
    raise exception 'Só o convidado aceita ou recusa.' using errcode = '42501';
  end if;
  if new.status = 'canceled' and uid <> old.from_user then
    raise exception 'Só quem convidou cancela.' using errcode = '42501';
  end if;
  if new.status = 'accepted' and now() > old.expires_at then
    raise exception 'Convite expirado (60 s).' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger study_invites_guard before update on public.study_invites
  for each row execute function public.guard_study_invite();

-- ---------------------------------------------------------------- tempo real
-- Salas e convites chegam aos clientes pelo Supabase Realtime (respeitando o RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.checklist_rooms, public.study_invites;
  end if;
end
$$;
