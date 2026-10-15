-- 010400 — Simulado TRI só com questões oficiais do Inep (pedido do dono, 2026-10-15).
-- As Questões Inéditas StaziaMed (origin = 'staziamed', exam_id = 'staziamed') não são do Inep e não têm calibração oficial:
-- não podem entrar na calibração do TRI nem na nota TRI de um simulado. Aditiva: só `create or replace` das 3 funções da 9996,
-- com o corpo IGUAL ao de lá, mais um filtro por origem. Para questões oficiais nada muda (mesma matriz, mesmos itens, mesma nota).
--   * irt_calibration_matrix  FILTRA: a matriz que alimenta scripts/tri/calibrar.ts só traz questões oficiais.
--   * irt_save_calibration    FILTRA: item de questão inédita é ignorado (entra em "ignored"), nunca grava dificuldade; id
--                             desconhecido segue recusado como antes. (Não recusa a rodada toda: um item inédito perdido não deve
--                             derrubar a calibração das oficiais.)
--   * irt_score_session       FILTRA: a inédita não vira linha de irt_responses, então fica fora do θ, da nota, dos totais por
--                             área/tema e dos contadores. Sessão só com oficiais: resultado idêntico ao de antes.
-- A resolução e a correção comuns (acertou/errou, histórico) das inéditas não mudam; só a conta TRI.
--
-- DESFAZER (cole no editor SQL; devolve os corpos da 9996): reaplique as 3 definições `create or replace function`
-- de supabase/migrations/20261003009996_simulado_tri.sql (irt_score_session, irt_calibration_matrix, irt_save_calibration)
-- e rode `select public.irt_score_session(id) from public.practice_sessions where config ->> 'scoring' = 'irt' and finished_at is not null;`
-- se quiser recalcular os simulados já feitos. Os grants não mudam (create or replace os preserva).

-- ----- irt_score_session
create or replace function public.irt_score_session(p_session_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.practice_sessions;
  v_est jsonb;
  v_area jsonb;
  v_topic jsonb;
  c record;
  r public.irt_session_results;
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found or s.kind <> 'simulado' or s.finished_at is null or coalesce(s.config ->> 'scoring', 'classic') <> 'irt' then
    return null;
  end if;

  delete from public.irt_responses where session_id = s.id;
  insert into public.irt_responses (session_id, question_id, user_id, ord, area, topic, selected_option, score, excluded_reason,
                                    key_preliminary, b_used, b_estado, b_origem)
  select s.id, q.id, s.user_id, u.ord, q.area, q.topic, a.selected_option,
         case when x.reason is null then case when a.selected_option = q.correct_option then 1 else 0 end end,
         x.reason,
         public.question_preliminary_info(q.id) is not null,
         d.b, d.estado, d.origem
  from unnest(s.question_ids) with ordinality as u (question_id, ord)
  join public.questions q on q.id = u.question_id and q.origin = 'official' -- 010400: inédita StaziaMed fica fora da conta TRI
  left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
  cross join lateral public.irt_item_difficulty(q.id) d
  cross join lateral (
    select case
      when q.status = 'annulled'
        or exists (select 1 from public.question_official_answers o
                   where o.question_id = q.id and o.is_current and o.answer_status = 'ANNULLED') then 'anulada'
      when d.estado = 'rejeitado' then 'item_rejeitado'
    end as reason
  ) x
  on conflict (session_id, question_id) do nothing;

  select public.irt_estimar_theta(coalesce(array_agg(t.score order by t.ord), '{}'), coalesce(array_agg(t.b_used order by t.ord), '{}'))
    into v_est
  from public.irt_responses t where t.session_id = s.id and t.score is not null;

  -- por área: acertos × esperado pelo modelo (com o θ geral) e a tendência da área (θ só com as questões dela, faixa larga)
  select coalesce(jsonb_agg(jsonb_build_object(
           'area', g.area, 'n_items', g.n, 'n_correct', g.c,
           'expected', round(g.esperado::numeric, 1)::double precision,
           'theta', g.est -> 'theta', 'se', g.est -> 'se',
           'nota', g.est -> 'nota', 'nota_lo', g.est -> 'nota_lo', 'nota_hi', g.est -> 'nota_hi'
         ) order by g.area), '[]'::jsonb)
    into v_area
  from (
    select t.area, count(*)::int as n, sum(t.score)::int as c,
           sum(1 / (1 + exp(-((v_est ->> 'theta')::double precision - t.b_used)))) as esperado,
           public.irt_estimar_theta(array_agg(t.score order by t.ord), array_agg(t.b_used order by t.ord)) as est
    from public.irt_responses t where t.session_id = s.id and t.score is not null
    group by t.area
  ) g;

  -- por tema: acertos × esperado (poucos itens: só a comparação, sem nota)
  select coalesce(jsonb_agg(jsonb_build_object(
           'area', g.area, 'topic', g.topic, 'n_items', g.n, 'n_correct', g.c,
           'expected', round(g.esperado::numeric, 1)::double precision
         ) order by g.area, g.topic), '[]'::jsonb)
    into v_topic
  from (
    select t.area, t.topic, count(*)::int as n, sum(t.score)::int as c,
           sum(1 / (1 + exp(-((v_est ->> 'theta')::double precision - t.b_used)))) as esperado
    from public.irt_responses t where t.session_id = s.id and t.score is not null
    group by t.area, t.topic
  ) g;

  select count(*) filter (where t.score is not null and t.selected_option is null)::int as n_blank,
         count(*) filter (where t.excluded_reason = 'anulada')::int as n_annulled,
         count(*) filter (where t.excluded_reason = 'item_rejeitado')::int as n_rejected,
         count(*) filter (where t.score is not null and t.b_estado = 'provisoria')::int as n_provisional,
         count(*) filter (where t.score is not null and t.b_estado = 'calibrada')::int as n_calibrated,
         count(*) filter (where t.score is not null and t.key_preliminary)::int as n_preliminary
    into c
  from public.irt_responses t where t.session_id = s.id;

  insert into public.irt_session_results as cur (
    session_id, user_id, method, prior_mu, prior_sigma, theta, se, theta_lo, theta_hi, nota, nota_lo, nota_hi,
    n_items, n_correct, n_blank, n_annulled, n_rejected, n_provisional, n_calibrated, n_preliminary, by_area, by_topic)
  values (
    s.id, s.user_id, 'EAP', 0, 1,
    (v_est ->> 'theta')::double precision, (v_est ->> 'se')::double precision,
    (v_est ->> 'theta_lo')::double precision, (v_est ->> 'theta_hi')::double precision,
    (v_est ->> 'nota')::double precision, (v_est ->> 'nota_lo')::double precision, (v_est ->> 'nota_hi')::double precision,
    (v_est ->> 'n_items')::int, (v_est ->> 'n_correct')::int, c.n_blank, c.n_annulled, c.n_rejected, c.n_provisional,
    c.n_calibrated, c.n_preliminary, v_area, v_topic)
  on conflict (session_id) do update set
    theta = excluded.theta, se = excluded.se, theta_lo = excluded.theta_lo, theta_hi = excluded.theta_hi,
    nota = excluded.nota, nota_lo = excluded.nota_lo, nota_hi = excluded.nota_hi,
    n_items = excluded.n_items, n_correct = excluded.n_correct, n_blank = excluded.n_blank, n_annulled = excluded.n_annulled,
    n_rejected = excluded.n_rejected, n_provisional = excluded.n_provisional, n_calibrated = excluded.n_calibrated,
    n_preliminary = excluded.n_preliminary, by_area = excluded.by_area, by_topic = excluded.by_topic,
    recomputed_at = clock_timestamp(), times_computed = cur.times_computed + 1
  returning * into r;

  return public.irt_result_json(r);
end
$$;

-- ----- irt_calibration_matrix
create or replace function public.irt_calibration_matrix()
  returns table (person text, question_id text, area public.med_area, score smallint)
  language sql stable security definer set search_path = ''
as $$
  with sess as (
    -- simulado finalizado com pelo menos 80% respondido (mesmo critério da gamificação)
    select s.id, s.user_id, s.started_at, s.question_ids
    from public.practice_sessions s
    where s.kind in ('simulado', 'prova') and s.finished_at is not null
      and (select count(*) from public.question_attempts a where a.session_id = s.id) >= ceil(0.8 * cardinality(s.question_ids))
  ), cells as (
    select s.user_id, s.id as session_id, u.question_id
    from sess s cross join lateral unnest(s.question_ids) as u (question_id)
  ), exposures as (
    -- toda vez que o aluno viu a questão (ou a equivalente de outra prova): respostas em qualquer sessão (no início da sessão;
    -- sem sessão, na hora da resposta) e as questões de todo simulado aberto
    select a.user_id, coalesce(e.group_id, a.question_id) as grp, coalesce(ps.started_at, a.answered_at) as at, a.session_id
    from public.question_attempts a
    left join public.practice_sessions ps on ps.id = a.session_id
    left join public.question_equivalents e on e.question_id = a.question_id
    union all
    select s.user_id, coalesce(e.group_id, u.question_id), s.started_at, s.id
    from public.practice_sessions s
    cross join lateral unnest(s.question_ids) as u (question_id)
    left join public.question_equivalents e on e.question_id = u.question_id
    where s.kind in ('simulado', 'prova')
  ), first_seen as (
    select distinct on (x.user_id, x.grp) x.user_id, x.grp, x.session_id
    from exposures x
    order by x.user_id, x.grp, x.at, x.session_id
  )
  select md5(c.user_id::text), q.id, q.area,
         (case when a.selected_option = q.correct_option then 1 else 0 end)::smallint
  from cells c
  join public.questions q on q.id = c.question_id
  left join public.question_equivalents e on e.question_id = q.id
  join first_seen f on f.user_id = c.user_id and f.grp = coalesce(e.group_id, q.id) and f.session_id = c.session_id
  left join public.question_attempts a on a.session_id = c.session_id and a.question_id = q.id
  where q.origin = 'official' -- 010400: inédita StaziaMed não entra na calibração
    and q.status <> 'annulled'
    and not exists (select 1 from public.question_official_answers o
                    where o.question_id = q.id and o.is_current and o.answer_status = 'ANNULLED')
$$;

-- ----- irt_save_calibration
create or replace function public.irt_save_calibration(p_method text, p_items jsonb, p_notes jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_run uuid;
  it jsonb;
  v_b double precision;
  v_n integer;
  v_reason text;
  v_saved integer := 0;
  v_ignored integer := 0;
begin
  if p_method is null or p_method not in ('jmle', 'cmle') then
    raise exception 'Método de calibração inválido: %', p_method using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'A lista de itens precisa ser uma lista.' using errcode = '22023';
  end if;
  insert into public.irt_calibration_runs (method, n_persons, n_responses, notes)
  values (p_method, nullif(p_notes ->> 'n_persons', '')::int, nullif(p_notes ->> 'n_responses', '')::int, coalesce(p_notes, '{}'::jsonb))
  returning id into v_run;

  for it in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.questions q where q.id = it ->> 'question_id') then
      raise exception 'Questão desconhecida na calibração: %', it ->> 'question_id' using errcode = '22023';
    end if;
    -- 010400: inédita StaziaMed não tem calibração oficial; o item é ignorado (conta em "ignored"), nunca grava dificuldade
    if exists (select 1 from public.questions q where q.id = it ->> 'question_id' and q.origin <> 'official') then
      v_ignored := v_ignored + 1;
      continue;
    end if;
    v_b := nullif(it ->> 'b', '')::double precision;
    if v_b is null or abs(v_b) > 10 or v_b = 'NaN'::double precision then
      raise exception 'Dificuldade fora da faixa (de −10 a 10) na questão %: %', it ->> 'question_id', it ->> 'b' using errcode = '22023';
    end if;
    v_n := coalesce(nullif(it ->> 'n_resp', '')::int, 0);
    if v_n < 30 then
      v_ignored := v_ignored + 1;
      continue;
    end if;
    v_reason := coalesce(nullif(btrim(it ->> 'reject_reason'), ''), case when abs(v_b) > 6.5 then '|b| > 6,5' end);
    insert into public.irt_item_params (question_id, b, se_b, n_resp, n_correct, infit, outfit, origem, estado, reject_reason, run_id, updated_at)
    values (it ->> 'question_id', v_b, nullif(it ->> 'se_b', '')::double precision, v_n, coalesce(nullif(it ->> 'n_correct', '')::int, 0),
            nullif(it ->> 'infit', '')::double precision, nullif(it ->> 'outfit', '')::double precision, 'rasch',
            case when v_reason is not null then 'rejeitado' when v_n >= 100 then 'calibrada' else 'provisoria' end,
            v_reason, v_run, now())
    on conflict (question_id) do update set
      b = excluded.b, se_b = excluded.se_b, n_resp = excluded.n_resp, n_correct = excluded.n_correct, infit = excluded.infit,
      outfit = excluded.outfit, origem = 'rasch', estado = excluded.estado, reject_reason = excluded.reject_reason,
      run_id = excluded.run_id, updated_at = now();
    v_saved := v_saved + 1;
  end loop;

  update public.irt_calibration_runs set n_items = v_saved where id = v_run;
  return jsonb_build_object('run_id', v_run, 'saved', v_saved, 'ignored', v_ignored);
end
$$;
