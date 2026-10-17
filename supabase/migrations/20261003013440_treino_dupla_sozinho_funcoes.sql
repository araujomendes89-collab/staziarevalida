-- =============================================================================
-- TREINO SOZINHO (2ª fase, grupo dupla-sozinho-ia) · PARTE 2 de 4: as funções do treino sozinho (app_fase2_*).
-- Depende da 013430 (colunas e peças) e da 013330 (a casca da 2ª fase). Plano: tarefas S2, S3 (banco) e S6 (nota).
--
-- O fluxo do aluno (todo na tabela station_attempts, estado decidido pelo servidor):
--   reading → (Iniciar) attending → (Entregar) submitted → escolhe a correção:
--       "Eu mesmo avalio com o PEP" → scoring → (Concluir) done           [fonte autoavaliacao]
--       "Avaliar com IA"            → evaluating → done  (ou volta a submitted se falhar)   [fonte ia; migração 013450]
--   O PEP (itens, pontos e critérios) só sai em scoring e done; o roteiro do ator nunca sai.
--   Escrito por tarefa (answers), impressos abertos com a hora (pressings_opened) e a nota calculada pelo servidor.
--
-- O QUE MUDA em relação à 013330 (funções refeitas a partir dela):
--   fase2_attempt_payload   ← 013330:134  (texto sem as linhas "Liberação:", impressos só abertos, respostas, IA, resultado com fonte)
--   app_fase2_overview      ← 013330:102  (a tentativa aberta inclui entregue e avaliando)
--   app_fase2_attempt       ← 013330:178  (destrava avaliação presa por mais de 3 min)
--   app_fase2_start         ← 013330:194  (guarda a versão da estação; não derruba avaliação em andamento)
--   app_fase2_begin         ← 013330:223  (igual)
--   app_fase2_finish        ← 013330:244  (agora também vai da entrega à autoavaliação; guarda how = 'self')
--   app_fase2_submit        ← 013330:266  (nota pela peça solo_pep_rows; espelha em checklist_study_sessions)
--   app_fase2_abandon       ← 013330:323  (inclui entregue)
--   app_fase2_peps          ← 013330:336  (ganha a fonte: ia / autoavaliacao)
--   fase2_evaluations       ← 013330:66   (ganha a fonte; a dupla só conta mode = 'dupla')
-- NOVAS: solo_clean_text, solo_pep_rows, solo_has_image, solo_finalize, solo_sweep, app_fase2_save_answers, app_fase2_open_pressing,
--   app_fase2_print_path, app_fase2_deliver, app_fase2_report_ia.
--
-- Pode ser colada duas vezes. Para desfazer: supabase/desfazer/20261003013440_treino_dupla_sozinho_funcoes.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- peças compartilhadas
-- Texto da estação para quem treina: sem as linhas "Liberação: …" (instrução ao avaliador na sala; aqui não há ator).
create or replace function public.solo_clean_text(p_text text) returns text
  language sql immutable security definer set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n')
$$;

-- Nota de um treino sozinho a partir das marcações. p_grades: { "<ordem do item>": "correct" | "partial" | "incorrect" | null }.
-- Estrito (autoavaliação): todo item precisa de nível válido. Não estrito (IA): item sem nível válido fica PENDENTE (vale 0, grade nula).
-- Mesma conta da 013330 e da sala em dupla: correto = pontos do item; inadequado = grades.incorrect (padrão 0); parcial = grades.partial
-- (só se o item admite). → { rows, score, max_score, correctness }
create or replace function public.solo_pep_rows(p_content jsonb, p_grades jsonb, p_strict boolean) returns jsonb
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  i jsonb;
  v_grade text;
  v_points numeric;
  v_max numeric;
  v_total numeric := 0;
  v_sum numeric := 0;
  v_out jsonb := '[]'::jsonb;
  v_n int := 0;
begin
  for i in select x from jsonb_array_elements(case when jsonb_typeof(p_content -> 'checklist_items') = 'array' then p_content -> 'checklist_items' else '[]'::jsonb end) x
            order by (x ->> 'order')::int loop
    v_n := v_n + 1;
    v_grade := case when jsonb_typeof(p_grades -> (i ->> 'order')) = 'string' then p_grades ->> (i ->> 'order') end;
    v_max := coalesce((i -> 'grades' ->> 'correct')::numeric, 0);
    if v_grade = 'correct' then v_points := v_max;
    elsif v_grade = 'incorrect' then v_points := coalesce((i -> 'grades' ->> 'incorrect')::numeric, 0);
    elsif v_grade = 'partial' and jsonb_typeof(i -> 'grades' -> 'partial') = 'number' then v_points := (i -> 'grades' ->> 'partial')::numeric;
    elsif p_strict then
      raise exception 'Marque todos os itens do PEP (item %).', i ->> 'order' using errcode = '22023';
    else
      v_grade := null;
      v_points := 0;
    end if;
    v_total := v_total + v_points;
    v_sum := v_sum + v_max;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'order', (i ->> 'order')::int, 'item_id', i ->> 'id', 'phase', i ->> 'phase', 'content', i ->> 'content',
      'grade', v_grade, 'points', v_points, 'max', v_max));
  end loop;
  if v_n = 0 then
    raise exception 'Esta estação não tem checklist.' using errcode = '22023';
  end if;
  return jsonb_build_object('rows', v_out, 'score', v_total, 'max_score', v_sum,
                            'correctness', least(100, round(v_total / nullif(v_sum, 0) * 100, 1)));
end
$$;

-- O impresso tem imagem cadastrada? (content.pressing_assets pela chave <id> ou p<posição>, como na sala)
create or replace function public.solo_has_image(p_content jsonb, p_id text, p_n bigint) returns boolean
  language sql immutable security definer set search_path = ''
as $$
  select jsonb_typeof(p_content -> 'pressing_assets') = 'object'
     and ((p_content -> 'pressing_assets') ? p_id or (p_content -> 'pressing_assets') ? ('p' || p_n))
$$;

-- Destrava a avaliação por IA presa por mais de 3 minutos: volta a "entregue", devolve a cota e deixa a mensagem.
create or replace function public.solo_sweep(p_attempt uuid) returns void
  language sql volatile security definer set search_path = ''
as $$
  update public.station_attempts
     set status = 'submitted', ia_reserved_at = null,
         ia_message = 'A avaliação demorou demais. Tente de novo ou corrija você mesmo.'
   where id = p_attempt and status = 'evaluating' and ia_reserved_at < now() - interval '3 minutes'
$$;

-- Fecha o treino: grava a nota, a fonte, o resultado da IA (se houver) e ESPELHA a avaliação em checklist_study_sessions
-- (mode 'sozinho'), para "Sua última nota", "Média geral" e o cartão público enxergarem o treino (decisão D7 do dono).
-- p_calc: o resultado de solo_pep_rows (já com o que a IA acrescentou às linhas). Idempotente: treino já concluído não muda.
create or replace function public.solo_finalize(p_attempt uuid, p_calc jsonb, p_source text, p_ia jsonb) returns public.station_attempts
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.station_attempts;
  c jsonb;
  v_started timestamptz;
  v_used integer;
  v_answers jsonb;
  v_opened jsonb;
  v_sid text;
begin
  select * into a from public.station_attempts where id = p_attempt for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status = 'done' then
    return a;
  end if;
  select k.content into c from public.checklist_station_contents k where k.station_id = a.station_id;
  v_started := coalesce(a.attendance_started_at, a.started_at);
  v_used := greatest(0, least((extract(epoch from (coalesce(a.submitted_at, a.attendance_ended_at, now()) - v_started)) * 1000)::bigint, 2147483647))::integer;
  v_opened := coalesce((select jsonb_agg(o ->> 'id') from jsonb_array_elements(a.pressings_opened) o), '[]'::jsonb);
  v_answers := coalesce((
    select jsonb_agg(jsonb_build_object('id', r ->> 'item_id', 'grade', initcap(r ->> 'grade'), 'subitems', '[]'::jsonb) order by (r ->> 'order')::int)
      from jsonb_array_elements(p_calc -> 'rows') r where r ->> 'grade' is not null), '[]'::jsonb);
  v_sid := gen_random_uuid()::text;

  insert into public.checklist_study_sessions
    (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, pressings_released, checklist_answers,
     score, max_score, correctness, used_ms, station_version, mode, source, solo_run_id)
  values
    (v_sid, a.station_id, a.id, 1, null, a.user_id, v_started, now(), v_opened, v_answers,
     (p_calc ->> 'score')::numeric, (p_calc ->> 'max_score')::numeric, (p_calc ->> 'correctness')::numeric, v_used,
     coalesce(a.station_version, c ->> 'version'), 'sozinho', p_source, a.id)
  on conflict (room_id, round) do nothing;
  select s.id into v_sid from public.checklist_study_sessions s where s.room_id = a.id and s.round = 1;

  update public.station_attempts
     set status = 'done', finished_at = now(), marks = p_calc -> 'rows', score = (p_calc ->> 'score')::numeric,
         max_score = (p_calc ->> 'max_score')::numeric, correctness = (p_calc ->> 'correctness')::numeric,
         source = p_source, ia = p_ia, session_id = v_sid, station_version = coalesce(station_version, c ->> 'version'),
         attendance_ended_at = coalesce(attendance_ended_at, submitted_at, now()), submitted_at = coalesce(submitted_at, now())
   where id = a.id
  returning * into a;
  return a;
end
$$;

-- ---------------------------------------------------------------- avaliações (sozinho + em dupla como médico)
-- Uma linha por estação avaliada do próprio aluno; nota de 0 a 10. Base: 013330:66. Novo: a fonte (ia / autoavaliacao) e a dupla
-- só olha mode = 'dupla' (o treino sozinho espelhado em checklist_study_sessions já está em station_attempts).
drop function if exists public.fase2_evaluations(uuid);
create function public.fase2_evaluations(p_uid uuid)
  returns table (id text, origin text, station_id text, at timestamptz, score10 numeric, source text)
  language sql stable security definer set search_path = ''
as $$
  select a.id::text, 'solo'::text, a.station_id, a.finished_at, round(a.correctness / 10, 1), a.source
    from public.station_attempts a where a.user_id = p_uid and a.status = 'done'
  union all
  select s.id, 'dupla'::text, s.station_id, s.finished_at, round(s.correctness / 10, 1), null::text
    from public.checklist_study_sessions s where s.doctor_id = p_uid and s.mode = 'dupla'
$$;

-- ---------------------------------------------------------------- uma tentativa, em qualquer etapa (base: 013330:134)
-- O que sai depende SÓ da etapa gravada no servidor. Nunca: roteiro do ator, itens do PEP antes de scoring, empresa/modelo/custo da IA.
create or replace function public.fase2_attempt_payload(a public.station_attempts) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  c jsonb;
  v jsonb;
  v_started timestamptz;
  v_ia jsonb;
begin
  select * into s from public.checklist_stations where id = a.station_id;
  select content into c from public.checklist_station_contents where station_id = a.station_id;
  c := coalesce(c, '{}'::jsonb);
  v := jsonb_build_object(
    'attempt_id', a.id, 'status', a.status, 'server_now', now(),
    'station', jsonb_build_object('id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'setting', s.setting,
                                  'institution', s.institution, 'year', s.year, 'duration_ms', s.duration_ms),
    'scene', public.solo_clean_text(c ->> 'doctor_scene'),
    'tasks', public.solo_clean_text(c ->> 'doctor_tasks'),
    'started_at', a.started_at, 'attendance_started_at', a.attendance_started_at, 'attendance_ended_at', a.attendance_ended_at,
    'submitted_at', a.submitted_at,
    'ends_at', case when a.attendance_started_at is not null then a.attendance_started_at + (s.duration_ms * interval '1 millisecond') end,
    'answers', a.answers, 'how', a.how, 'source', a.source
  );
  if a.status in ('attending', 'submitted', 'evaluating', 'scoring', 'done') then
    -- impressos: a lista inteira (nome e número), o texto só dos já abertos e dos iniciais (relato do caso)
    v := v || jsonb_build_object('pressings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'number', p.n, 'name', coalesce(p.e ->> 'name', ''),
               'initial', p.initially_visible,
               'opened', p.initially_visible or exists (select 1 from jsonb_array_elements(a.pressings_opened) o where o ->> 'id' = p.id),
               'content', case when p.initially_visible or exists (select 1 from jsonb_array_elements(a.pressings_opened) o where o ->> 'id' = p.id)
                               then public.solo_clean_text(p.e ->> 'content') end,
               'has_image', public.solo_has_image(c, p.id, p.n)
             ) order by p.n)
        from public.dupla_pressings(c) p), '[]'::jsonb));
  end if;
  if a.status = 'submitted' then
    v_ia := public.solo_ia_status(a.user_id);
    v := v || jsonb_build_object('ia', jsonb_build_object('available', (v_ia ->> 'disponivel')::boolean, 'reason', v_ia ->> 'motivo',
                                                           'consent_required', (v_ia ->> 'aceite_pendente')::boolean),
                                 'ia_message', a.ia_message);
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
    v_started := coalesce(a.attendance_started_at, a.started_at);
    v := v || jsonb_build_object('result', jsonb_build_object(
      'score', a.score, 'max_score', a.max_score, 'score10', round(a.correctness / 10, 1), 'finished_at', a.finished_at,
      'source', a.source,
      'used_ms', greatest(0, least((extract(epoch from (coalesce(a.submitted_at, a.finished_at) - v_started)) * 1000)::bigint, 2147483647)),
      'marks', a.marks,
      -- só o que a IA diz ao aluno: observação curta e quantos itens divergiram. Nada de empresa, modelo, prompt nem custo.
      'ia', case when a.source = 'ia' then jsonb_build_object('note', coalesce(a.ia ->> 'note', ''), 'diverged', coalesce((a.ia ->> 'diverged')::int, 0)) end,
      'positive', coalesce((select jsonb_agg(m ->> 'content' order by (m ->> 'order')::int) from jsonb_array_elements(a.marks) m where m ->> 'grade' = 'correct'), '[]'::jsonb),
      'negative', coalesce((select jsonb_agg(m ->> 'content' order by (m ->> 'order')::int) from jsonb_array_elements(a.marks) m
                             where m ->> 'grade' in ('partial', 'incorrect')), '[]'::jsonb)));
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------- Início da 2ª fase (base: 013330:102)
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
                                'at', e.at, 'score10', e.score10, 'source', e.source)
        from public.fase2_evaluations(v_uid) e join public.checklist_stations s on s.id = e.station_id
       order by e.at desc limit 1
    ),
    'open_attempt', (
      select jsonb_build_object('id', a.id, 'station_id', a.station_id, 'name', s.name, 'status', a.status)
        from public.station_attempts a join public.checklist_stations s on s.id = a.station_id
       where a.user_id = v_uid and a.status in ('reading', 'attending', 'submitted', 'evaluating', 'scoring')
       order by a.started_at desc limit 1
    )
  );
end
$$;

-- ---------------------------------------------------------------- abrir uma tentativa (base: 013330:178)
-- Volátil: destrava a avaliação por IA presa por mais de 3 minutos antes de responder.
create or replace function public.app_fase2_attempt(p_attempt_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
begin
  perform public.solo_sweep(p_attempt_id);
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- Começa (ou retoma) uma estação sozinho (base: 013330:194). Só estação aprovada; Pro quando a estação exige.
-- Novo: guarda a versão da estação; uma avaliação por IA em andamento não é derrubada por outro começo.
create or replace function public.app_fase2_start(p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  s public.checklist_stations;
  a public.station_attempts;
  v_version text;
begin
  select * into s from public.checklist_stations where id = p_station_id and medical_review = 'approved';
  if not found then
    raise exception 'Estação não encontrada ou ainda sem aprovação médica.' using errcode = 'P0002';
  end if;
  if s.is_pro_only and not public.has_pro() then
    raise exception 'Esta estação é do plano Pro.' using errcode = '42501';
  end if;
  perform public.solo_sweep(t.id) from public.station_attempts t where t.user_id = v_uid and t.status = 'evaluating';
  if exists (select 1 from public.station_attempts t where t.user_id = v_uid and t.status = 'evaluating' and t.station_id <> p_station_id) then
    raise exception 'Espere a avaliação em andamento terminar.' using errcode = '55000';
  end if;
  -- só uma tentativa aberta por pessoa: a de outra estação é encerrada; a da mesma estação é retomada
  update public.station_attempts set status = 'abandoned'
   where user_id = v_uid and status in ('reading', 'attending', 'submitted', 'scoring') and station_id <> p_station_id;
  select * into a from public.station_attempts
   where user_id = v_uid and station_id = p_station_id and status in ('reading', 'attending', 'submitted', 'evaluating', 'scoring')
   order by started_at desc limit 1;
  if not found then
    select k.content ->> 'version' into v_version from public.checklist_station_contents k where k.station_id = p_station_id;
    insert into public.station_attempts (user_id, station_id, station_version) values (v_uid, p_station_id, v_version) returning * into a;
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- Leitura -> atendimento (começa o relógio) (base: 013330:223). Repetir a chamada não reinicia o relógio.
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

-- ---------------------------------------------------------------- texto por tarefa, impressos e entrega
-- Respostas: lista de { task: 1 a 30, text } (até 4.000 caracteres cada, 20.000 no total). Só em atendimento.
create or replace function public.solo_clean_answers(p_answers jsonb) returns jsonb
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  x jsonb;
  v_out jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_text text;
  v_task integer;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Respostas inválidas.' using errcode = '22023';
  end if;
  for x in select e from jsonb_array_elements(p_answers) e loop
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'task') <> 'number' or jsonb_typeof(x -> 'text') <> 'string' then
      raise exception 'Respostas inválidas.' using errcode = '22023';
    end if;
    v_task := (x ->> 'task')::numeric::integer;
    v_text := x ->> 'text';
    if v_task < 1 or v_task > 30 then
      raise exception 'Respostas inválidas.' using errcode = '22023';
    end if;
    if char_length(v_text) > 4000 then
      raise exception 'Texto longo demais.' using errcode = '22001';
    end if;
    v_total := v_total + char_length(v_text);
    v_out := v_out || jsonb_build_array(jsonb_build_object('task', v_task, 'text', v_text));
  end loop;
  if v_total > 20000 then
    raise exception 'Texto longo demais.' using errcode = '22001';
  end if;
  return v_out;
end
$$;

create or replace function public.app_fase2_save_answers(p_attempt_id uuid, p_answers jsonb) returns jsonb
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
  if a.status <> 'attending' then
    raise exception 'Esta tentativa não aceita mais texto.' using errcode = '55000';
  end if;
  update public.station_attempts set answers = public.solo_clean_answers(p_answers) where id = a.id;
  return jsonb_build_object('ok', true, 'saved_at', now());
end
$$;

-- Abre um impresso: grava a hora (desde o início do atendimento, no relógio do servidor) uma vez só e devolve o texto.
create or replace function public.app_fase2_open_pressing(p_attempt_id uuid, p_pressing_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
  c jsonb;
  p record;
  v_at integer;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid for update;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status not in ('attending', 'submitted') then
    raise exception 'Esta tentativa não aceita mais impressos.' using errcode = '55000';
  end if;
  select k.content into c from public.checklist_station_contents k where k.station_id = a.station_id;
  select * into p from public.dupla_pressings(coalesce(c, '{}'::jsonb)) x where x.id = p_pressing_id;
  if not found then
    raise exception 'Impresso não encontrado.' using errcode = '22023';
  end if;
  if not p.initially_visible and not exists (select 1 from jsonb_array_elements(a.pressings_opened) o where o ->> 'id' = p.id) then
    v_at := greatest(0, least((extract(epoch from (now() - coalesce(a.attendance_started_at, now()))) * 1000)::bigint, 2147483647))::integer;
    update public.station_attempts set pressings_opened = pressings_opened || jsonb_build_array(jsonb_build_object('id', p.id, 'at_ms', v_at))
     where id = a.id;
  end if;
  return jsonb_build_object('id', p.id, 'number', p.n, 'name', coalesce(p.e ->> 'name', ''),
                            'content', public.solo_clean_text(p.e ->> 'content'), 'has_image', public.solo_has_image(c, p.id, p.n));
end
$$;

-- Caminho do arquivo da imagem de um impresso JÁ ABERTO (ou inicial) deste treino, ou nulo (base: app_dupla_print_path, 013390).
create or replace function public.app_fase2_print_path(p_attempt_id uuid, p_pressing_id text) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
  c jsonb;
  p record;
  v_assets jsonb;
  v_val jsonb;
  v_asset text;
  v_path text;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status not in ('attending', 'submitted', 'evaluating', 'scoring', 'done') then
    raise exception 'Impresso não liberado.' using errcode = '42501';
  end if;
  select k.content into c from public.checklist_station_contents k where k.station_id = a.station_id;
  c := coalesce(c, '{}'::jsonb);
  select * into p from public.dupla_pressings(c) x where x.id = p_pressing_id;
  if not found then
    raise exception 'Impresso não encontrado.' using errcode = '22023';
  end if;
  if not p.initially_visible and not exists (select 1 from jsonb_array_elements(a.pressings_opened) o where o ->> 'id' = p.id) then
    raise exception 'Impresso não liberado.' using errcode = '42501';
  end if;
  v_assets := case when jsonb_typeof(c -> 'pressing_assets') = 'object' then c -> 'pressing_assets' else '{}'::jsonb end;
  v_val := coalesce(v_assets -> p.id, v_assets -> ('p' || p.n));
  v_asset := case jsonb_typeof(v_val)
               when 'string' then v_val #>> '{}'
               when 'object' then case when jsonb_typeof(v_val -> 'asset_id') = 'string' then v_val ->> 'asset_id' end
             end;
  if v_asset is null or v_asset !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or to_regclass('public.station_assets') is null then
    return null;
  end if;
  execute 'select a.storage_path from public.station_assets a where a.id = $1' into v_path using v_asset::uuid;
  return v_path;
end
$$;

-- Entregar: atendimento -> entregue. Grava o texto final (se vier) e a hora; a escolha da correção vem depois.
create or replace function public.app_fase2_deliver(p_attempt_id uuid, p_answers jsonb default null) returns jsonb
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
    update public.station_attempts
       set status = 'submitted', submitted_at = now(), attendance_ended_at = now(),
           answers = case when p_answers is null then answers else public.solo_clean_answers(p_answers) end
     where id = a.id returning * into a;
  elsif a.status = 'reading' then
    raise exception 'Inicie o atendimento antes de entregar.' using errcode = '22023';
  elsif a.status not in ('submitted', 'evaluating', 'scoring', 'done') then
    raise exception 'Esta tentativa já foi encerrada.' using errcode = '22023';
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- ---------------------------------------------------------------- autoavaliação com o PEP
-- Atendimento ou entregue -> avaliação pelo PEP (base: 013330:244). Passo sem volta: é aqui que o checklist passa a sair.
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
  if a.status in ('attending', 'submitted') then
    update public.station_attempts
       set status = 'scoring', how = 'self',
           attendance_ended_at = coalesce(attendance_ended_at, now()), submitted_at = coalesce(submitted_at, now())
     where id = a.id returning * into a;
  elsif a.status = 'evaluating' then
    raise exception 'A avaliação por IA está em andamento.' using errcode = '55000';
  elsif a.status <> 'scoring' then
    raise exception 'Inicie o atendimento antes de abrir o PEP.' using errcode = '22023';
  end if;
  return public.fase2_attempt_payload(a);
end
$$;

-- O aluno marca cada item do PEP ('correct', 'partial' ou 'incorrect', por número do item); o servidor confere e calcula a nota
-- (base: 013330:266). p_marks: {"1": "correct", "2": "partial", ...}. Todos os itens marcados; 'partial' só onde o item admite.
create or replace function public.app_fase2_submit(p_attempt_id uuid, p_marks jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
  c jsonb;
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
  a := public.solo_finalize(a.id, public.solo_pep_rows(coalesce(c, '{}'::jsonb), p_marks, true), 'autoavaliacao', null);
  return public.fase2_attempt_payload(a);
end
$$;

-- Sai do treino sem concluir (base: 013330:323). Uma avaliação por IA em andamento não é abandonada.
create or replace function public.app_fase2_abandon(p_attempt_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
begin
  update public.station_attempts set status = 'abandoned'
   where id = p_attempt_id and user_id = v_uid and status in ('reading', 'attending', 'submitted', 'scoring');
  return jsonb_build_object('ok', true);
end
$$;

-- "Avisar a equipe que a avaliação errou": grava em checklist_station_reports, com o treino e o item. Só o dono, só de IA concluída.
create or replace function public.app_fase2_report_ia(p_attempt_id uuid, p_order integer default null, p_note text default '') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
  a public.station_attempts;
  v_msg text;
begin
  select * into a from public.station_attempts where id = p_attempt_id and user_id = v_uid;
  if not found then
    raise exception 'Tentativa não encontrada.' using errcode = 'P0002';
  end if;
  if a.status <> 'done' or a.source is distinct from 'ia' then
    raise exception 'Só dá para avisar sobre uma avaliação por IA concluída.' using errcode = '22023';
  end if;
  if p_order is not null and not exists (select 1 from jsonb_array_elements(a.marks) m where (m ->> 'order')::int = p_order) then
    raise exception 'Item do checklist não encontrado.' using errcode = '22023';
  end if;
  v_msg := left('Avaliação por IA do treino sozinho (tentativa ' || a.id::text || case when p_order is not null then ', item ' || p_order::text else '' end
                || '): a aluna ou o aluno avisou que a avaliação errou.' || case when btrim(coalesce(p_note, '')) <> '' then ' Observação: ' || btrim(p_note) else '' end, 2000);
  insert into public.checklist_station_reports (station_id, user_id, message) values (a.station_id, v_uid, v_msg);
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------- Meus PEPs (base: 013330:336)
create or replace function public.app_fase2_peps(p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.fase2_assert();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'origin', e.origin, 'source', e.source, 'station_id', e.station_id, 'name', s.name, 'area', s.area,
      'at', e.at, 'score10', e.score10) order by e.at desc)
      from (select * from public.fase2_evaluations(v_uid) order by at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) e
      join public.checklist_stations s on s.id = e.station_id
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_fase2_overview() from public, anon;
revoke execute on function public.app_fase2_attempt(uuid) from public, anon;
revoke execute on function public.app_fase2_start(text) from public, anon;
revoke execute on function public.app_fase2_begin(uuid) from public, anon;
revoke execute on function public.app_fase2_finish(uuid) from public, anon;
revoke execute on function public.app_fase2_submit(uuid, jsonb) from public, anon;
revoke execute on function public.app_fase2_abandon(uuid) from public, anon;
revoke execute on function public.app_fase2_peps(integer) from public, anon;
revoke execute on function public.app_fase2_save_answers(uuid, jsonb) from public, anon;
revoke execute on function public.app_fase2_open_pressing(uuid, text) from public, anon;
revoke execute on function public.app_fase2_print_path(uuid, text) from public, anon;
revoke execute on function public.app_fase2_deliver(uuid, jsonb) from public, anon;
revoke execute on function public.app_fase2_report_ia(uuid, integer, text) from public, anon;
-- Auxiliares internas: ninguém as chama de fora.
revoke execute on function public.solo_clean_text(text) from public, anon, authenticated;
revoke execute on function public.solo_pep_rows(jsonb, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.solo_has_image(jsonb, text, bigint) from public, anon, authenticated;
revoke execute on function public.solo_sweep(uuid) from public, anon, authenticated;
revoke execute on function public.solo_finalize(uuid, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.solo_clean_answers(jsonb) from public, anon, authenticated;
revoke execute on function public.fase2_evaluations(uuid) from public, anon, authenticated;
revoke execute on function public.fase2_attempt_payload(public.station_attempts) from public, anon, authenticated;
