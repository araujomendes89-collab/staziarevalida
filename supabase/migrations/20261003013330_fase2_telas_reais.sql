-- =============================================================================
-- 2ª fase: telas de verdade (Início, Banco de estações, estação sozinho, Meus PEPs, Desempenho prático).
--
-- Antes: as telas da 2ª fase eram maquete (estações e notas de exemplo, pessoas inventadas) e não liam o banco.
-- Agora elas leem, por funções seguras:
--   * o catálogo de estações APROVADAS pela revisão médica (checklist_stations, sem o conteúdo);
--   * as tentativas do próprio aluno treinando sozinho (station_attempts, tabela nova, fechada);
--   * as estações que o aluno fez como médico em dupla (checklist_study_sessions, só leitura).
--
-- Regras desta migração:
--   * QUEM ENTRA: public.fase2_allowed() (hoje só a equipe, igual ao "Em breve" do aplicativo). É o ÚNICO ponto a mudar quando o
--     dono liberar a 2ª fase aos alunos. Todas as funções abaixo conferem isso no banco, não só na tela.
--   * GABARITO NA HORA CERTA: a estação é entregue em etapas e o servidor decide o que sai em cada uma:
--       leitura      -> cenário e tarefas (sem impressos, sem roteiro do ator, sem checklist);
--       atendimento  -> + impressos (os resultados que o ator entregaria);
--       avaliação    -> + checklist do PEP (só depois de encerrar o atendimento, passo sem volta);
--       concluída    -> o aluno marca cada item, o servidor calcula a nota (o aluno nunca manda nota).
--     O roteiro do ator (actor_script) nunca sai por aqui.
--   * A tabela station_attempts fica FECHADA (acesso por linha ligado, sem política e sem permissão para aluno e visitante):
--     só estas funções leem e gravam. Nada de nota, ranking ou XP: treino sozinho não vale ponto na Arena.
--   * Sem dado, a tela mostra estado vazio: nenhuma função devolve exemplo.
-- Esta migração é colada uma vez só. Colada de novo por engano, para no primeiro comando ("already exists") e não muda nada.
-- Para desfazer: supabase/desfazer/20261003013330_fase2_telas_reais.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- acesso
create or replace function public.fase2_allowed() returns boolean
  language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and public.is_staff() $$;

create or replace function public.fase2_assert() returns uuid
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.fase2_allowed() then
    raise exception 'A 2ª fase ainda não está aberta para o seu perfil.' using errcode = '42501';
  end if;
  return (select auth.uid());
end
$$;

-- ---------------------------------------------------------------- tentativas sozinho
create table if not exists public.station_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  station_id text not null references public.checklist_stations (id) on delete cascade,
  status text not null default 'reading' check (status in ('reading', 'attending', 'scoring', 'done', 'abandoned')),
  started_at timestamptz not null default now(),
  attendance_started_at timestamptz,
  attendance_ended_at timestamptz,
  finished_at timestamptz,
  -- [{order, phase, content, grade, points, max}] gravado pelo servidor ao concluir
  marks jsonb not null default '[]'::jsonb check (jsonb_typeof(marks) = 'array'),
  score numeric(5, 3),
  max_score numeric(5, 3),
  correctness numeric(4, 1) check (correctness is null or correctness between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists station_attempts_user_idx on public.station_attempts (user_id, finished_at desc);
-- Duas trancas: acesso por linha ligado sem nenhuma política, e nenhuma permissão para aluno e visitante.
alter table public.station_attempts enable row level security;
revoke all on table public.station_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------- avaliações (sozinho + em dupla como médico)
-- Uma linha por estação avaliada do próprio aluno; nota de 0 a 10.
create or replace function public.fase2_evaluations(p_uid uuid)
  returns table (id text, origin text, station_id text, at timestamptz, score10 numeric)
  language sql stable security definer set search_path = ''
as $$
  select a.id::text, 'solo'::text, a.station_id, a.finished_at, round(a.correctness / 10, 1)
    from public.station_attempts a where a.user_id = p_uid and a.status = 'done'
  union all
  select s.id, 'dupla'::text, s.station_id, s.finished_at, round(s.correctness / 10, 1)
    from public.checklist_study_sessions s where s.doctor_id = p_uid
$$;

-- ---------------------------------------------------------------- catálogo
-- Estações APROVADAS (sem o conteúdo), com a melhor nota e o número de vezes do próprio aluno.
create or replace function public.app_fase2_stations() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  v_pro boolean := public.has_pro();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'setting', s.setting,
      'institution', s.institution, 'year', s.year, 'duration_ms', s.duration_ms,
      'is_pro_only', s.is_pro_only, 'locked', (s.is_pro_only and not v_pro),
      'my_best', (select max(e.score10) from public.fase2_evaluations(v_uid) e where e.station_id = s.id),
      'my_last', (select e.score10 from public.fase2_evaluations(v_uid) e where e.station_id = s.id order by e.at desc limit 1),
      'my_count', (select count(*)::int from public.fase2_evaluations(v_uid) e where e.station_id = s.id)
    ) order by s.area, s.name)
    from public.checklist_stations s
    where s.medical_review = 'approved'
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- Início da 2ª fase
create or replace function public.app_fase2_overview() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
begin
  return jsonb_build_object(
    'stations_total', (select count(*)::int from public.checklist_stations where medical_review = 'approved'),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('area', t.area, 'total', t.n) order by t.area)
        from (select area, count(*)::int as n from public.checklist_stations where medical_review = 'approved' group by area) t
    ), '[]'::jsonb),
    'done_count', (select count(*)::int from public.fase2_evaluations(v_uid)),
    'avg_score10', (select round(avg(e.score10), 1) from public.fase2_evaluations(v_uid) e),
    'last', (
      select jsonb_build_object('id', e.id, 'origin', e.origin, 'station_id', e.station_id, 'name', s.name, 'area', s.area,
                                'at', e.at, 'score10', e.score10)
        from public.fase2_evaluations(v_uid) e join public.checklist_stations s on s.id = e.station_id
       order by e.at desc limit 1
    ),
    'open_attempt', (
      select jsonb_build_object('id', a.id, 'station_id', a.station_id, 'name', s.name, 'status', a.status)
        from public.station_attempts a join public.checklist_stations s on s.id = a.station_id
       where a.user_id = v_uid and a.status in ('reading', 'attending', 'scoring')
       order by a.started_at desc limit 1
    )
  );
end
$$;

-- ---------------------------------------------------------------- uma tentativa, em qualquer etapa
-- O que sai depende SÓ da etapa gravada no servidor.
create or replace function public.fase2_attempt_payload(a public.station_attempts) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  c jsonb;
  v jsonb;
begin
  select * into s from public.checklist_stations where id = a.station_id;
  select content into c from public.checklist_station_contents where station_id = a.station_id;
  v := jsonb_build_object(
    'attempt_id', a.id, 'status', a.status, 'server_now', now(),
    'station', jsonb_build_object('id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'setting', s.setting,
                                  'institution', s.institution, 'year', s.year, 'duration_ms', s.duration_ms),
    'scene', coalesce(c ->> 'doctor_scene', ''),
    'tasks', coalesce(c ->> 'doctor_tasks', ''),
    'started_at', a.started_at, 'attendance_started_at', a.attendance_started_at, 'attendance_ended_at', a.attendance_ended_at
  );
  if a.status in ('attending', 'scoring', 'done') then
    v := v || jsonb_build_object('pressings', coalesce((
      select jsonb_agg(jsonb_build_object('id', p ->> 'id', 'name', p ->> 'name', 'content', p ->> 'content'))
        from jsonb_array_elements(coalesce(c -> 'pressings', '[]'::jsonb)) p
    ), '[]'::jsonb));
  end if;
  if a.status = 'scoring' then
    v := v || jsonb_build_object('checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order', (i ->> 'order')::int, 'phase', i ->> 'phase', 'content', i ->> 'content', 'tip', coalesce(i ->> 'tip', ''),
        'max', (i -> 'grades' ->> 'correct')::numeric,
        'partial', case when jsonb_typeof(i -> 'grades' -> 'partial') = 'number' then (i -> 'grades' ->> 'partial')::numeric end,
        'criteria', coalesce(i -> 'criteria', '{}'::jsonb), 'subitems', coalesce(i -> 'subitems', '[]'::jsonb)
      ) order by (i ->> 'order')::int)
        from jsonb_array_elements(coalesce(c -> 'checklist_items', '[]'::jsonb)) i
    ), '[]'::jsonb));
  end if;
  if a.status = 'done' then
    v := v || jsonb_build_object('result', jsonb_build_object(
      'score', a.score, 'max_score', a.max_score, 'score10', round(a.correctness / 10, 1), 'finished_at', a.finished_at,
      'marks', a.marks));
  end if;
  return v;
end
$$;

create or replace function public.app_fase2_attempt(p_attempt_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- Começa (ou retoma) uma estação sozinho. Só estação aprovada; Pro quando a estação exige.
create or replace function public.app_fase2_start(p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  s public.checklist_stations;
  a public.station_attempts;
begin
  select * into s from public.checklist_stations where id = p_station_id and medical_review = 'approved';
  if not found then
    raise exception 'Estação não encontrada ou ainda sem aprovação médica.' using errcode = 'P0002';
  end if;
  if s.is_pro_only and not public.has_pro() then
    raise exception 'Esta estação é do plano Pro.' using errcode = '42501';
  end if;
  -- só uma tentativa aberta por pessoa: a de outra estação é encerrada; a da mesma estação é retomada
  update public.station_attempts set status = 'abandoned'
   where user_id = v_uid and status in ('reading', 'attending', 'scoring') and station_id <> p_station_id;
  select * into a from public.station_attempts
   where user_id = v_uid and station_id = p_station_id and status in ('reading', 'attending', 'scoring')
   order by started_at desc limit 1;
  if not found then
    insert into public.station_attempts (user_id, station_id) values (v_uid, p_station_id) returning * into a;
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- Leitura -> atendimento (começa o relógio). Repetir a chamada não reinicia o relógio.
create or replace function public.app_fase2_begin(p_attempt_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'reading' then
    update public.station_attempts set status = 'attending', attendance_started_at = now() where id = a.id returning * into a;
  elsif a.status <> 'attending' then
    raise exception 'O atendimento desta tentativa já terminou.' using errcode = '22023';
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- Atendimento -> avaliação pelo PEP. Passo sem volta: é aqui que o checklist passa a sair.
create or replace function public.app_fase2_finish(p_attempt_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'attending' then
    update public.station_attempts set status = 'scoring', attendance_ended_at = now() where id = a.id returning * into a;
  elsif a.status <> 'scoring' then
    raise exception 'Inicie o atendimento antes de abrir o PEP.' using errcode = '22023';
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- O aluno marca cada item do PEP ('correct', 'partial' ou 'incorrect', por número do item); o servidor confere e calcula a nota.
-- p_marks: {"1": "correct", "2": "partial", ...}. Todos os itens precisam ser marcados; 'partial' só onde o item admite.
create or replace function public.app_fase2_submit(p_attempt_id uuid, p_marks jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
  c jsonb;
  i jsonb;
  v_grade text;
  v_points numeric;
  v_max numeric;
  v_total numeric := 0;
  v_sum_max numeric := 0;
  v_out jsonb := '[]'::jsonb;
  v_n int := 0;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'done' then
    return public.fase2_attempt_payload(a);
  end if;
  if a.status <> 'scoring' then
    raise exception 'Abra o PEP antes de marcar os itens.' using errcode = '22023';
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'object' then
    raise exception 'Marcação inválida.' using errcode = '22023';
  end if;
  select content into c from public.checklist_station_contents where station_id = a.station_id;
  for i in select x from jsonb_array_elements(coalesce(c -> 'checklist_items', '[]'::jsonb)) x order by (x ->> 'order')::int loop
    v_n := v_n + 1;
    v_grade := p_marks ->> (i ->> 'order');
    v_max := (i -> 'grades' ->> 'correct')::numeric;
    if v_grade = 'correct' then v_points := v_max;
    elsif v_grade = 'incorrect' then v_points := coalesce((i -> 'grades' ->> 'incorrect')::numeric, 0);
    elsif v_grade = 'partial' and jsonb_typeof(i -> 'grades' -> 'partial') = 'number' then v_points := (i -> 'grades' ->> 'partial')::numeric;
    else
      raise exception 'Marque todos os itens do PEP (item %).', i ->> 'order' using errcode = '22023';
    end if;
    v_total := v_total + v_points;
    v_sum_max := v_sum_max + v_max;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'order', (i ->> 'order')::int, 'phase', i ->> 'phase', 'content', i ->> 'content',
      'grade', v_grade, 'points', v_points, 'max', v_max));
  end loop;
  if v_n = 0 then
    raise exception 'Esta estação não tem checklist.' using errcode = '22023';
  end if;
  update public.station_attempts
     set status = 'done', finished_at = now(), marks = v_out, score = v_total, max_score = v_sum_max,
         correctness = least(100, round(v_total / nullif(v_sum_max, 0) * 100, 1))
   where id = a.id returning * into a;
  return public.fase2_attempt_payload(a);
end
$$;

create or replace function public.app_fase2_abandon(p_attempt_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
begin
  update public.station_attempts set status = 'abandoned'
   where id = p_attempt_id and user_id = v_uid and status in ('reading', 'attending', 'scoring');
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------- Meus PEPs
create or replace function public.app_fase2_peps(p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'origin', e.origin, 'station_id', e.station_id, 'name', s.name, 'area', s.area,
      'at', e.at, 'score10', e.score10) order by e.at desc)
      from (select * from public.fase2_evaluations(v_uid) order by at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) e
      join public.checklist_stations s on s.id = e.station_id
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- Desempenho prático
create or replace function public.app_fase2_performance() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
begin
  return jsonb_build_object(
    'count', (select count(*)::int from public.fase2_evaluations(v_uid)),
    'avg_score10', (select round(avg(score10), 1) from public.fase2_evaluations(v_uid)),
    'best_score10', (select max(score10) from public.fase2_evaluations(v_uid)),
    'by_area', coalesce((
      select jsonb_agg(jsonb_build_object('area', t.area, 'count', t.n, 'avg_score10', t.avg) order by t.area)
        from (select s.area, count(*)::int as n, round(avg(e.score10), 1) as avg
                from public.fase2_evaluations(v_uid) e join public.checklist_stations s on s.id = e.station_id group by s.area) t
    ), '[]'::jsonb),
    'evolution', coalesce((
      select jsonb_agg(jsonb_build_object('at', t.at, 'score10', t.score10) order by t.at)
        from (select at, score10 from public.fase2_evaluations(v_uid) order by at desc limit 20) t
    ), '[]'::jsonb),
    -- onde perde pontos: só das estações treinadas sozinho (a dupla não guarda o item a item neste formato)
    'by_phase', coalesce((
      select jsonb_agg(jsonb_build_object('phase', t.phase, 'earned', t.earned, 'max', t.mx,
                                          'pct', round(t.earned / nullif(t.mx, 0) * 100, 1)) order by t.earned / nullif(t.mx, 0))
        from (select m ->> 'phase' as phase, sum((m ->> 'points')::numeric) as earned, sum((m ->> 'max')::numeric) as mx
                from public.station_attempts a, jsonb_array_elements(a.marks) m
               where a.user_id = v_uid and a.status = 'done' group by m ->> 'phase') t
    ), '[]'::jsonb),
    'lost_items', coalesce((
      select jsonb_agg(jsonb_build_object('phase', t.phase, 'content', t.content, 'lost', t.lost, 'times', t.n) order by t.lost desc)
        from (select m ->> 'phase' as phase, m ->> 'content' as content, count(*)::int as n,
                     sum((m ->> 'max')::numeric - (m ->> 'points')::numeric) as lost
                from public.station_attempts a, jsonb_array_elements(a.marks) m
               where a.user_id = v_uid and a.status = 'done' and (m ->> 'points')::numeric < (m ->> 'max')::numeric
               group by m ->> 'phase', m ->> 'content' order by sum((m ->> 'max')::numeric - (m ->> 'points')::numeric) desc limit 5) t
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------- permissões
-- Funções do aluno: só quem está logado (a regra de quem entra está dentro de cada uma, em fase2_assert).
revoke execute on function public.app_fase2_stations() from public, anon;
revoke execute on function public.app_fase2_overview() from public, anon;
revoke execute on function public.app_fase2_attempt(uuid) from public, anon;
revoke execute on function public.app_fase2_start(text) from public, anon;
revoke execute on function public.app_fase2_begin(uuid) from public, anon;
revoke execute on function public.app_fase2_finish(uuid) from public, anon;
revoke execute on function public.app_fase2_submit(uuid, jsonb) from public, anon;
revoke execute on function public.app_fase2_abandon(uuid) from public, anon;
revoke execute on function public.app_fase2_peps(integer) from public, anon;
revoke execute on function public.app_fase2_performance() from public, anon;
-- Auxiliares internas: ninguém as chama de fora (rodam só por dentro das funções acima).
revoke execute on function public.fase2_allowed() from public, anon, authenticated;
revoke execute on function public.fase2_assert() from public, anon, authenticated;
revoke execute on function public.fase2_evaluations(uuid) from public, anon, authenticated;
revoke execute on function public.fase2_attempt_payload(public.station_attempts) from public, anon, authenticated;
