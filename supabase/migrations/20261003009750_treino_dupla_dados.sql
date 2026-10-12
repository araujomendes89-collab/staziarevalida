-- =============================================================================
-- Treino em Dupla, etapa 2: dados, acesso por plano, conteúdo por papel, tempo real e conta.
-- (Plano de 09/10: "migração 6500"; número 9750, no intervalo livre, depois das publicadas até 9630.)
-- Pode ser colada duas vezes: tudo é "if not exists", "create or replace", "drop … if exists" ou conferido. Nenhuma estação,
-- pessoa ou nota é criada aqui (nada de carga de dados). Colar não abre o módulo: a chave nasce DESLIGADA.
--
-- O QUE FAZ
--  1) app_settings: a lista de chaves aceitas passa a ter 'treino_dupla' (a lista é a UNIÃO do que existe hoje:
--     'trial_days', 'announcement' — a última refeita foi a de …1300_admin.sql:57; nenhuma migração depois (até a 9630) mexeu
--     nela). A linha 'treino_dupla' nasce {"aberto": false, "planos": ["pro", "elite"]} e, se já existir, não é tocada.
--  2) Acesso: dupla_allowed(uuid) é a regra única. Equipe (administrador e editor) e revisor médico entram sempre
--     (user_has_full_access, …9550). Aluno só com a chave ligada e um plano marcado em "planos": Pro/Elite pelo plano pago
--     de verdade (subscription_is_paid, …9550: ativo com data de fim no futuro, ou pagamento pendente até 3 dias depois);
--     teste grátis só "trialing" com a data de fim no futuro. app_dupla_access() diz à tela o que ela pode mostrar.
--  3) Tabelas novas: study_profiles, study_swipes, study_matches, checklist_room_marks. Ampliadas: checklist_rooms (a sala),
--     checklist_study_sessions (a avaliação de uma rodada). Em todas a leitura é só dos envolvidos e NINGUÉM grava direto:
--     quem grava são as funções app_dupla_* das próximas migrações (security definer).
--  4) Salas: saem a coluna "state", o gatilho checklist_rooms_guard, a função guard_checklist_room() e as políticas
--     "salas: membro cria" e "salas: membros atualizam" (…0400); convites: saem "convites: enviar" e "convites: responder ou
--     cancelar" (ficam a leitura e o gatilho study_invites_guard). As salas que já existiam são fechadas (phase 'closed',
--     motivo 'sem_sinal'); nada é apagado.
--  5) Conteúdo das estações (roteiro do ator, impressos, PEP): a política de leitura de …0400 ("aprovada e acesso Pro")
--     é trocada por "só a equipe". O aluno só recebe o que o papel dele na sala permite, por app_dupla_room_content.
--     O revisor médico segue lendo pela função app_admin_station_content (…8000), que não é tocada.
--  6) Tempo real (Presença): políticas em realtime.messages, só se esse esquema existir (sem permissão nele, avisa e segue): o canal 'dupla:online' para quem tem
--     acesso ao módulo e o canal 'room:<id>' só para os dois membros da sala. Só avisam e só presença.
--  7) Conta: app_export_my_data (a de …5300_termo_aceite.sql:318-357) ganha perfil de estudo, escolhas, matches e salas.
--     Excluir a conta apaga perfil, escolhas e matches (cascata) e deixa as avaliações do parceiro, sem o vínculo.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_export_my_data()  ← …5300_termo_aceite.sql:318-357 (a mais nova em produção; igual, mais 4 chaves no fim).
--   nenhuma outra função que já existia é refeita; as que esta migração USA, sem mudar: user_has_full_access,
--   subscription_is_paid (…9550), user_is_staff (…4600), is_staff (…0100), touch_updated_at (…0100).
-- POLÍTICAS E REGRAS REFEITAS: app_settings_key_check (←…1300:57); "estações: conteúdo (aprovada e acesso Pro quando exigido)"
--   (←…0400:37) vira "estações: conteúdo só da equipe".
-- REMOVIDAS DE PROPÓSITO (substituídas pelas funções do Treino): guard_checklist_room(), gatilho checklist_rooms_guard, coluna
--   checklist_rooms.state, "salas: membro cria", "salas: membros atualizam", "convites: enviar", "convites: responder ou cancelar".
--
-- COMO DESFAZER (antes de o módulo ser aberto; depois disso as salas e escolhas gravadas se perdem):
--   drop das tabelas study_profiles, study_swipes, study_matches e checklist_room_marks; nas salas, recriar a coluna state
--   (jsonb not null), o gatilho/função de …0400 e as políticas antigas; recriar a política de leitura das estações de …0400;
--   recolocar app_export_my_data de …5300; refazer app_settings_key_check sem 'treino_dupla' (e apagar essa linha); apagar as
--   funções dupla_* e app_dupla_*; apagar as políticas de realtime.messages "treino em dupla: …".
-- =============================================================================

-- ---------------------------------------------------------------- 1) chave do módulo
-- A lista de chaves aceitas: a união de todas as que existem (hoje as duas de …1300) mais a do Treino.
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings
  add constraint app_settings_key_check check (key in ('trial_days', 'announcement', 'treino_dupla'));

insert into public.app_settings (key, value)
values ('treino_dupla', '{"aberto": false, "planos": ["pro", "elite"]}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2) acesso por plano (regra única)
-- Pode usar o Treino em Dupla? Interna: o navegador nunca a chama (usa app_dupla_access / dupla_me_allowed).
create or replace function public.dupla_allowed(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_user is not null and (
    public.user_has_full_access(p_user)
    or exists (
      select 1
      from public.app_settings c
      join public.subscriptions s on s.user_id = p_user
      where c.key = 'treino_dupla'
        and c.value -> 'aberto' = 'true'::jsonb
        and jsonb_typeof(c.value -> 'planos') = 'array'
        and (c.value -> 'planos') ? s.plan::text
        and (
          (s.plan = 'trial' and s.status = 'trialing' and s.trial_ends_at > now())
          or (s.plan in ('pro', 'elite') and public.subscription_is_paid(s.plan, s.status, s.current_period_end))
        )
    )
  )
$$;

-- Quem chama (a própria pessoa) pode usar? Usada pelas políticas do tempo real; fica aberta a quem entra.
create or replace function public.dupla_me_allowed() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.dupla_allowed((select auth.uid())) $$;

-- Porteiro das funções app_dupla_*: devolve o id de quem chama ou recusa em português.
create or replace function public.dupla_assert_access() returns uuid
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if not public.dupla_allowed(v_uid) then
    raise exception 'Sem acesso ao Treinamento em Dupla.' using errcode = '42501';
  end if;
  return v_uid;
end
$$;

-- O que a tela precisa saber para abrir ou trancar o módulo: { aberto, permitido, planos, equipe }.
create or replace function public.app_dupla_access() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'aberto', coalesce((select c.value -> 'aberto' = 'true'::jsonb from public.app_settings c where c.key = 'treino_dupla'), false),
    'permitido', public.dupla_allowed((select auth.uid())),
    'planos', coalesce((select case when jsonb_typeof(c.value -> 'planos') = 'array' then c.value -> 'planos' end
                        from public.app_settings c where c.key = 'treino_dupla'), '[]'::jsonb),
    'equipe', public.user_is_staff((select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

-- Número e edição da prova a partir do id da estação (inep-2024-1-e01 → estação 1, edição "2024/1"; teste-inep2020-e01 → "2020").
-- Fora desse formato: tudo vazio.
create or replace function public.dupla_station_meta(p_id text) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when m is null
    then jsonb_build_object('number', null::integer, 'edition', null::text, 'reapplication', false)
    else jsonb_build_object('number', m[4]::integer, 'edition', m[1] || coalesce('/' || m[2], ''), 'reapplication', m[3] is not null)
  end
  from (select regexp_match(p_id, '^(?:teste-)?inep-?(\d{4})(?:-([12]))?(r)?-e(\d{1,2})$') as m) x
$$;

-- Rótulo da área do Banco de estações (…0400:14) → código curto do Treino. (A …8000 tem outra, checklist_station_area_code, com
-- os códigos do revisor médico; ficam as duas.)
create or replace function public.dupla_area_code(p_area text) returns text
  language sql immutable set search_path = ''
as $$
  select case p_area when 'Clínica Médica' then 'CM' when 'Cirurgia Geral' then 'CR' when 'Ginecologia e Obstetrícia' then 'GO'
                     when 'Pediatria' then 'PED' when 'Medicina de Família e Comunidade' then 'MFC' end
$$;

-- ---------------------------------------------------------------- 3) perfil de estudo
create table if not exists public.study_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_name text not null check (char_length(btrim(public_name)) between 3 and 40),
  school text check (char_length(school) <= 80),
  city text check (char_length(city) <= 80),
  goal text check (char_length(goal) <= 80),
  exam text check (exam ~ '^\d{4}/[12]$'),
  bio text not null default '' check (char_length(bio) <= 160),
  areas text[] not null default '{}' check (areas <@ array['CM', 'CR', 'GO', 'PED', 'MFC']::text[]),
  role_pref text not null default 'any' check (role_pref in ('med', 'ator', 'any')),
  pace text not null default 'cronometrado' check (pace in ('livre', 'cronometrado', 'simulacao')),
  days text[] not null default '{}' check (days <@ array['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']::text[]),
  shifts text[] not null default '{}' check (shifts <@ array['Manhã', 'Tarde', 'Noite']::text[]),
  radar_visible boolean not null default true,
  show_school boolean not null default true,
  show_stats boolean not null default true,
  status text not null default 'fora' check (status in ('livre', 'em_estacao', 'fora')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.study_profiles enable row level security;
drop policy if exists "perfil de estudo: ler o próprio" on public.study_profiles;
create policy "perfil de estudo: ler o próprio" on public.study_profiles
  for select to authenticated using (user_id = (select auth.uid()));
-- O cartão dos outros sai de app_dupla_deck (campos públicos); sem política de escrita: só as funções gravam.
drop trigger if exists study_profiles_touch on public.study_profiles;
create trigger study_profiles_touch before update on public.study_profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- escolhas ("Estudar junto" / "Pular")
create table if not exists public.study_swipes (
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  direction text not null check (direction in ('right', 'left')),
  station_id text references public.checklist_stations (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);
create index if not exists study_swipes_to_idx on public.study_swipes (to_user, direction, created_at desc);
alter table public.study_swipes enable row level security;
drop policy if exists "escolhas: ler as próprias" on public.study_swipes;
create policy "escolhas: ler as próprias" on public.study_swipes
  for select to authenticated using (from_user = (select auth.uid()));

-- ---------------------------------------------------------------- matches
-- room_id ganha a chave estrangeira mais abaixo (a sala também aponta para o match).
create table if not exists public.study_matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  station_id text references public.checklist_stations (id) on delete set null,
  room_id uuid,
  created_at timestamptz not null default now(),
  check (user_a <> user_b)
);
create index if not exists study_matches_a_idx on public.study_matches (user_a, created_at desc);
create index if not exists study_matches_b_idx on public.study_matches (user_b, created_at desc);
alter table public.study_matches enable row level security;
drop policy if exists "matches: os dois leem" on public.study_matches;
create policy "matches: os dois leem" on public.study_matches
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

-- ---------------------------------------------------------------- 4) a sala
-- As salas que já existem eram do modelo antigo (coluna state): fecham, sem apagar. Só na primeira colagem (enquanto "state" existe).
alter table public.checklist_rooms add column if not exists phase text not null default 'closed';
alter table public.checklist_rooms add column if not exists closed_reason text;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'checklist_rooms' and column_name = 'state') then
    update public.checklist_rooms set phase = 'closed', closed_reason = 'sem_sinal';
  end if;
end
$$;
alter table public.checklist_rooms alter column phase set default 'roles';

alter table public.checklist_rooms add column if not exists station_id text references public.checklist_stations (id) on delete set null;
alter table public.checklist_rooms add column if not exists match_id uuid references public.study_matches (id) on delete set null;
alter table public.checklist_rooms add column if not exists round integer not null default 1;
alter table public.checklist_rooms add column if not exists candidate_id uuid references auth.users (id) on delete set null;
alter table public.checklist_rooms add column if not exists evaluator_id uuid references auth.users (id) on delete set null;
alter table public.checklist_rooms add column if not exists confirmed_ids uuid[] not null default '{}';
alter table public.checklist_rooms add column if not exists connected_ids uuid[] not null default '{}';
alter table public.checklist_rooms add column if not exists ready_ids uuid[] not null default '{}';
alter table public.checklist_rooms add column if not exists call_link text;
alter table public.checklist_rooms add column if not exists duration_ms integer;
alter table public.checklist_rooms add column if not exists started_at timestamptz;
alter table public.checklist_rooms add column if not exists ends_at timestamptz;
alter table public.checklist_rooms add column if not exists paused_left_ms integer;
alter table public.checklist_rooms add column if not exists paused_at timestamptz;
alter table public.checklist_rooms add column if not exists paused_total_ms integer not null default 0;
alter table public.checklist_rooms add column if not exists released_pressings text[] not null default '{}';
alter table public.checklist_rooms add column if not exists finished_at timestamptz;   -- fim da estação (tempo usado = fim − início − pausas)

alter table public.checklist_rooms drop constraint if exists checklist_rooms_phase_check;
alter table public.checklist_rooms add constraint checklist_rooms_phase_check
  check (phase in ('roles', 'connecting', 'setup', 'running', 'review', 'result', 'closed'));
alter table public.checklist_rooms drop constraint if exists checklist_rooms_round_check;
alter table public.checklist_rooms add constraint checklist_rooms_round_check check (round >= 1);
alter table public.checklist_rooms drop constraint if exists checklist_rooms_call_link_check;
alter table public.checklist_rooms add constraint checklist_rooms_call_link_check
  check (call_link is null or (char_length(call_link) <= 500 and call_link ~ '^https://[^\s/.]+\.[^\s]+$'));
alter table public.checklist_rooms drop constraint if exists checklist_rooms_duration_ms_check;
alter table public.checklist_rooms add constraint checklist_rooms_duration_ms_check
  check (duration_ms is null or duration_ms between 60000 and 3600000);
alter table public.checklist_rooms drop constraint if exists checklist_rooms_paused_total_ms_check;
alter table public.checklist_rooms add constraint checklist_rooms_paused_total_ms_check check (paused_total_ms >= 0);
alter table public.checklist_rooms drop constraint if exists checklist_rooms_closed_reason_check;
alter table public.checklist_rooms add constraint checklist_rooms_closed_reason_check
  check (closed_reason is null or closed_reason in ('saiu', 'convite_recusado', 'convite_expirado', 'sem_sinal'));
create index if not exists checklist_rooms_members_idx on public.checklist_rooms using gin (member_ids);

-- A sala agora só muda pelas funções app_dupla_* (security definer): saem o gatilho e a função das regras antigas, a coluna
-- "state" e as políticas de criar e atualizar. Fica a leitura pelos membros ("salas: membros leem") e o gatilho de carimbo.
drop trigger if exists checklist_rooms_guard on public.checklist_rooms;
drop function if exists public.guard_checklist_room();
drop policy if exists "salas: membro cria" on public.checklist_rooms;
drop policy if exists "salas: membros atualizam" on public.checklist_rooms;
alter table public.checklist_rooms drop column if exists state;

-- O match aponta para a sala (e a sala para o match).
alter table public.study_matches drop constraint if exists study_matches_room_id_fkey;
alter table public.study_matches
  add constraint study_matches_room_id_fkey foreign key (room_id) references public.checklist_rooms (id) on delete set null;

-- ---------------------------------------------------------------- convites
-- Passam a ser criados e respondidos só por app_dupla_swipe / app_dupla_answer_invite. Ficam a leitura e study_invites_guard.
drop policy if exists "convites: enviar" on public.study_invites;
drop policy if exists "convites: responder ou cancelar" on public.study_invites;

-- ---------------------------------------------------------------- avaliação de uma rodada
-- A pessoa que sai deixa de ter vínculo, mas a avaliação fica para o parceiro (set null em vez de apagar junto).
alter table public.checklist_study_sessions alter column actor_id drop not null;
alter table public.checklist_study_sessions alter column doctor_id drop not null;
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_actor_id_fkey;
alter table public.checklist_study_sessions
  add constraint checklist_study_sessions_actor_id_fkey foreign key (actor_id) references auth.users (id) on delete set null;
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_doctor_id_fkey;
alter table public.checklist_study_sessions
  add constraint checklist_study_sessions_doctor_id_fkey foreign key (doctor_id) references auth.users (id) on delete set null;

alter table public.checklist_study_sessions add column if not exists round integer not null default 1;
alter table public.checklist_study_sessions add column if not exists feedback_pos text not null default '';
alter table public.checklist_study_sessions add column if not exists feedback_neg text not null default '';
alter table public.checklist_study_sessions add column if not exists feedback_gen text not null default '';
alter table public.checklist_study_sessions add column if not exists used_ms integer;
alter table public.checklist_study_sessions add column if not exists station_version text;
alter table public.checklist_study_sessions add column if not exists review_requested_at timestamptz;
alter table public.checklist_study_sessions add column if not exists review_reason text;
alter table public.checklist_study_sessions add column if not exists revised_at timestamptz;
alter table public.checklist_study_sessions add column if not exists score_before_review numeric(5, 3);

alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_feedback_check;
alter table public.checklist_study_sessions add constraint checklist_study_sessions_feedback_check
  check (char_length(feedback_pos) <= 1000 and char_length(feedback_neg) <= 1000 and char_length(feedback_gen) <= 1000);
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_review_reason_check;
alter table public.checklist_study_sessions add constraint checklist_study_sessions_review_reason_check
  check (review_reason is null or char_length(review_reason) <= 500);
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_round_check;
alter table public.checklist_study_sessions add constraint checklist_study_sessions_round_check check (round >= 1);

-- Uma avaliação por sala e rodada. Se já houver linhas antigas da mesma sala (antes de existir "rodada"), numera-as na ordem.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_study_sessions_room_round_key' and conrelid = 'public.checklist_study_sessions'::regclass) then
    update public.checklist_study_sessions t set round = x.n
    from (select id, row_number() over (partition by room_id order by finished_at, id) as n from public.checklist_study_sessions) x
    where x.id = t.id and x.n > 1;
    alter table public.checklist_study_sessions add constraint checklist_study_sessions_room_round_key unique (room_id, round);
  end if;
end
$$;

-- ---------------------------------------------------------------- marcações do PEP (uma por item, por rodada)
create table if not exists public.checklist_room_marks (
  room_id uuid not null references public.checklist_rooms (id) on delete cascade,
  round integer not null check (round >= 1),
  item_id text not null,
  evaluator_id uuid references auth.users (id) on delete set null,
  grade text check (grade in ('correct', 'partial', 'incorrect')),   -- vazio = pendente
  subitems_checked text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (room_id, round, item_id)
);
alter table public.checklist_room_marks enable row level security;
drop policy if exists "marcações: avaliador, e candidato após a avaliação" on public.checklist_room_marks;
create policy "marcações: avaliador, e candidato após a avaliação" on public.checklist_room_marks
  for select to authenticated using (
    evaluator_id = (select auth.uid())
    or exists (
      select 1 from public.checklist_study_sessions s
      where s.room_id = checklist_room_marks.room_id and s.round = checklist_room_marks.round and s.doctor_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------- 5) conteúdo das estações só para a equipe
-- Antes (…0400:37): aluno com estação aprovada (e Pro, quando exigido) lia o roteiro do ator e o PEP direto. Agora só a equipe;
-- o aluno recebe pelo papel que tem na sala (app_dupla_room_content). O revisor médico lê por app_admin_station_content (…8000).
drop policy if exists "estações: conteúdo (aprovada e acesso Pro quando exigido)" on public.checklist_station_contents;
drop policy if exists "estações: conteúdo só da equipe" on public.checklist_station_contents;
create policy "estações: conteúdo só da equipe" on public.checklist_station_contents
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------- 6) conteúdo por papel
-- O que a pessoa recebe da estação da sala, conforme o papel dela (RoomContent):
--   candidato: nome, área, cenário, tarefas, duração e só os impressos liberados, sem a linha "Liberação: …";
--   avaliador: tudo isso mais o roteiro do ator, todos os impressos (texto inteiro) e o PEP com pontos e critérios;
--   fases "roles" e "closed", ou sem papel: só identificação da estação e quantos impressos existem.
-- has_image: o impresso tem arquivo de imagem em content.pressing_assets, pela chave <id> ou p<ordem> (TODO(dono): confirmar a
-- chave com a Montagem de estações). Quem não é da sala recebe 'Sala não encontrada.'.
create or replace function public.app_dupla_room_content(p_room_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  st public.checklist_stations;
  c jsonb;
  v_role text;
  v_meta jsonb;
  v_station jsonb;
  v_pressings jsonb := '[]'::jsonb;
  v_items jsonb;
  v_arr jsonb;
  v_count integer;
begin
  select * into r from public.checklist_rooms where id = p_room_id and v_uid = any (member_ids);
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  if r.station_id is null then
    return jsonb_build_object('role', null, 'station', null, 'pressing_count', 0, 'pressings', '[]'::jsonb);
  end if;
  select * into st from public.checklist_stations where id = r.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = r.station_id;
  c := coalesce(c, '{}'::jsonb);
  v_arr := case when jsonb_typeof(c -> 'pressings') = 'array' then c -> 'pressings' else '[]'::jsonb end;
  v_count := jsonb_array_length(v_arr);
  v_meta := public.dupla_station_meta(st.id);

  v_role := case when r.phase in ('connecting', 'setup', 'running', 'review', 'result') then
              case when v_uid = r.candidate_id then 'candidate' when v_uid = r.evaluator_id then 'evaluator' end
            end;

  v_station := jsonb_build_object('id', st.id, 'name', st.name, 'area', st.area, 'area_code', public.dupla_area_code(st.area),
                                  'number', v_meta -> 'number', 'duration_ms', st.duration_ms);
  if v_role is null then
    return jsonb_build_object('role', null, 'station', v_station, 'pressing_count', v_count, 'pressings', '[]'::jsonb);
  end if;

  v_station := v_station || jsonb_build_object('version', c ->> 'version', 'doctor_scene', coalesce(c ->> 'doctor_scene', ''),
                                               'doctor_tasks', coalesce(c ->> 'doctor_tasks', ''));
  if v_role = 'evaluator' then
    v_station := v_station || jsonb_build_object('actor_script', coalesce(c ->> 'actor_script', ''));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.e ->> 'id',
           'index', p.n,
           'name', coalesce(p.e ->> 'name', ''),
           'content', case when v_role = 'evaluator' then coalesce(p.e ->> 'content', '')
                           else btrim(regexp_replace(regexp_replace(coalesce(p.e ->> 'content', ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n')
                      end,
           'has_image', coalesce(jsonb_typeof(c -> 'pressing_assets') = 'object'
                                 and ((c -> 'pressing_assets') ? (p.e ->> 'id') or (c -> 'pressing_assets') ? ('p' || p.n)), false)
         ) order by p.n), '[]'::jsonb)
    into v_pressings
  from jsonb_array_elements(v_arr) with ordinality as p(e, n)
  where v_role = 'evaluator' or (p.e ->> 'id') = any (r.released_pressings);

  if v_role = 'evaluator' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.e ->> 'id', 'order', i.e -> 'order', 'content', coalesce(i.e ->> 'content', ''), 'tip', coalesce(i.e ->> 'tip', ''),
             'grades', i.e -> 'grades', 'criteria', i.e -> 'criteria',
             'subitems', case when jsonb_typeof(i.e -> 'subitems') = 'array' then i.e -> 'subitems' else '[]'::jsonb end
           ) order by i.n), '[]'::jsonb)
      into v_items
    from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end)
         with ordinality as i(e, n);
    return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings,
                              'checklist_items', v_items);
  end if;
  return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings);
end
$$;

-- ---------------------------------------------------------------- 7) tempo real (Presença): quem entra em cada canal
-- A sala do tópico "room:<id>" é minha e tenho acesso ao módulo? Tópico fora do formato: falso, sem erro.
create or replace function public.dupla_room_member(p_topic text) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~* '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.dupla_me_allowed() and exists (
    select 1 from public.checklist_rooms r where r.id = substr(p_topic, 6)::uuid and (select auth.uid()) = any (r.member_ids)
  );
end
$$;

-- Só se o esquema do Realtime existir (no Supabase existe; no banco local, não). Só presença; broadcast e outros ficam de fora.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    drop policy if exists "treino em dupla: ler canais" on realtime.messages;
    create policy "treino em dupla: ler canais" on realtime.messages
      for select to authenticated using (
        (realtime.topic() = 'dupla:online' and public.dupla_me_allowed())
        or (realtime.topic() like 'room:%' and public.dupla_room_member(realtime.topic()))
      );
    drop policy if exists "treino em dupla: enviar presença" on realtime.messages;
    create policy "treino em dupla: enviar presença" on realtime.messages
      for insert to authenticated with check (
        extension = 'presence' and (
          (realtime.topic() = 'dupla:online' and public.dupla_me_allowed())
          or (realtime.topic() like 'room:%' and public.dupla_room_member(realtime.topic()))
        )
      );
  end if;
exception when insufficient_privilege then
  -- Sem permissão para mexer em realtime.messages: não derruba a colagem. Sem política, nenhum canal privado abre (o app usa as
  -- consultas de reserva); crie as duas políticas pelo painel do Supabase (Realtime > Policies) com as mesmas regras.
  raise notice 'Treino em Dupla: sem permissão em realtime.messages; as políticas do Realtime NÃO foram criadas.';
end
$$;

-- ---------------------------------------------------------------- 8) conta: exportação dos dados
-- Igual à de …5300_termo_aceite.sql:318-357 (a mais nova em produção) e, antes dos aceites, o que o Treino guarda da pessoa:
-- perfil de estudo, escolhas, matches e salas. SECURITY INVOKER: as políticas de leitura já limitam às linhas dela.
create or replace function public.app_export_my_data() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', (select auth.uid())),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'subscription', (select to_jsonb(s) - 'provider_customer_id' - 'provider_subscription_id'
                     from public.subscriptions s where s.user_id = (select auth.uid())),
    'practice_sessions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at), '[]'::jsonb)
                          from public.practice_sessions t where t.user_id = (select auth.uid())),
    'question_attempts', (select coalesce(jsonb_agg(to_jsonb(t) - 'seq' order by t.seq), '[]'::jsonb)
                          from public.question_attempts t where t.user_id = (select auth.uid())),
    'question_bookmarks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                           from public.question_bookmarks t where t.user_id = (select auth.uid())),
    'error_notes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at), '[]'::jsonb)
                    from public.error_notes t where t.user_id = (select auth.uid())),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.day, t.position), '[]'::jsonb)
                   from public.plan_tasks t where t.user_id = (select auth.uid())),
    'flashcards', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                   from public.flashcards t where t.owner_id = (select auth.uid())),
    'flashcard_states', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                         from public.flashcard_states t where t.user_id = (select auth.uid())),
    'flashcard_reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
                          from public.flashcard_reviews t where t.user_id = (select auth.uid())),
    'checklist_favorites', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                            from public.checklist_favorites t where t.user_id = (select auth.uid())),
    'checklist_station_reports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                  from public.checklist_station_reports t where t.user_id = (select auth.uid())),
    'checklist_event_confirmations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                      from public.checklist_event_confirmations t where t.user_id = (select auth.uid())),
    'checklist_study_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                 from public.checklist_study_sessions t
                                 where t.actor_id = (select auth.uid()) or t.doctor_id = (select auth.uid())),
    'study_profile', (select to_jsonb(t) from public.study_profiles t where t.user_id = (select auth.uid())),
    'study_swipes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                     from public.study_swipes t where t.from_user = (select auth.uid())),
    'study_matches', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                      from public.study_matches t where (select auth.uid()) in (t.user_a, t.user_b)),
    'checklist_rooms', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                        from public.checklist_rooms t where (select auth.uid()) = any (t.member_ids)),
    'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('document', t.document, 'version', t.version,
                                                                  'accepted_at', t.accepted_at, 'origin', t.origin,
                                                                  'user_agent', t.user_agent)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
-- Funções novas nascem executáveis por todos. As do app: só quem entra (visitante não). As de apoio: só rodam dentro das
-- funções do servidor (security definer), menos as duas que as políticas do tempo real chamam como a própria pessoa.
revoke execute on function public.app_dupla_access() from public, anon;
revoke execute on function public.app_dupla_room_content(uuid) from public, anon;
revoke execute on function public.dupla_me_allowed() from public, anon;
revoke execute on function public.dupla_room_member(text) from public, anon;
revoke execute on function public.dupla_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_assert_access() from public, anon, authenticated;
revoke execute on function public.dupla_station_meta(text) from public, anon, authenticated;
revoke execute on function public.dupla_area_code(text) from public, anon, authenticated;
