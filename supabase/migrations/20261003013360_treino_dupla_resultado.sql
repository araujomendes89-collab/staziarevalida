-- =============================================================================
-- Treino em Dupla, Etapa 6 (Tarefa 18): resultado — pedido de revisão da nota, "Rever a nota", inverter papéis (rodada
-- seguinte) e o uso do mês no painel. (Plano de 12/10: "migração 9920"; este arquivo usa 013360, reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md.) Depende da 013300 (sala, avaliação), 013310 (dupla_room_state, app_dupla_result,
-- app_dupla_stations), 013340 e 013350 (dupla_room_for_action, dupla_room_need, finalize que já revisa a avaliação existente).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não cria tabela nem grava dado. Nenhuma IA.
--
-- O QUE FAZ
--  1) app_dupla_request_review: o candidato da rodada pede a revisão da nota, uma vez, com motivo (1 a 500 caracteres),
--     com a sala no resultado dessa rodada. Grava review_requested_at e review_reason; a sala soma 1 ao rev (o aviso de tempo
--     real da 013350 chega ao avaliador).
--  2) app_dupla_redo_review: o avaliador da rodada, só depois do pedido e uma vez, volta a sala para "review". As marcações da
--     rodada continuam; o app_dupla_finalize da 013350 atualiza a avaliação existente (nota, respostas, feedback), guarda a nota
--     de antes em score_before_review e marca revised_at. O resultado (app_dupla_result) já mostra "review".
--  3) app_dupla_swap ("Treinar novamente — Inverter papéis"): qualquer membro, só no resultado → rodada seguinte na fase dos
--     papéis, com os papéis TROCADOS, confirmações, conexão e prontidão vazias, cronômetro zerado, impressos liberados vazios e a
--     duração da estação. A estação NÃO troca sozinha (o novo avaliador pode "Trocar estação" pela regra da 013350); quem
--     escolheu a estação (station_chosen_by) fica como está, então quem escolheu e agora é candidato recebe
--     me.picked_station = true. O link da chamada fica. Dois cliques (duas abas): o segundo recusa pela fase, não pula rodada.
--  4) app_admin_dupla_usage (painel, só administrador): uso de um mês de Brasília.
--  5) app_dupla_result (resultado de uma rodada, com o nome da estação): o CANDIDATO só o recebe com a sala no resultado
--     daquela rodada (ou de uma rodada que já passou). Antes, bastava a avaliação existir: com "Rever a nota" a sala volta à
--     conferência e a avaliação já existe, então o candidato leria o tema fora do resultado. O avaliador continua lendo.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: app_dupla_result(uuid, integer) ← 013310 (igual, mais a trava do item 5). As
--   outras são novas. Usadas sem mudar: dupla_assert_access (013300);
--   dupla_room_state (013350); dupla_room_for_action, dupla_room_need (013350); assert_admin (…1300).
--
-- DECISÕES PEQUENAS (o dono pode mudar)
--  - Mensagem nova (para aprovar): 'Só o candidato pode pedir a revisão.'. Rodada diferente da atual ou sala fora do
--    resultado: 'Esta ação não vale nesta fase da sala.'.
--  - Enquanto o avaliador revê a nota (sala em "review"), o candidato volta a ver "Estação N" sem o nome (a regra da 013340
--    só mostra o nome no resultado); o nome volta quando a revisão é finalizada.
--  - Uso do mês: "rodadas avaliadas" são as avaliações (checklist_study_sessions) com finished_at no mês; "alunos", as pessoas
--    distintas (avaliador ou candidato) dessas avaliações; "impressos por rodada", a média do tamanho de pressings_released
--    (que, desde a 013350, guarda só os liberáveis liberados), com uma casa; "salas", as salas criadas no mês.
--
-- PERGUNTA PARA O DONO: na rodada 2 sem trocar a estação, o novo candidato já viu o tema como avaliador da rodada 1 (ele lê
--   o resultado da rodada 1, com o nome, e teve o roteiro e o PEP). Nenhuma regra nova foi inventada: o aviso "Você escolheu
--   esta estação, então já conhece o tema." só aparece para quem escolheu. O dono decide se quer outro aviso ou trocar a
--   estação de propósito ao inverter.
--
-- COMO DESFAZER: apagar as funções app_dupla_request_review(uuid, integer, text), app_dupla_redo_review(uuid, integer),
--   app_dupla_swap(uuid) e app_admin_dupla_usage(text). Pedidos e revisões já gravados ficam nas avaliações.
-- =============================================================================

-- ---------------------------------------------------------------- 1) pedido de revisão da nota
create or replace function public.app_dupla_request_review(p_room_id uuid, p_round integer, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  s public.checklist_study_sessions;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  if r.phase <> 'result' or p_round is distinct from r.round then
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  select * into s from public.checklist_study_sessions where room_id = r.id and round = r.round for update;
  if not found then
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  if s.doctor_id is distinct from v_uid then
    raise exception 'Só o candidato pode pedir a revisão.' using errcode = '42501';
  end if;
  if s.review_requested_at is not null then
    raise exception 'Revisão já solicitada.' using errcode = '55000';
  end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 500 then
    raise exception 'Escreva o motivo (até 500 caracteres).' using errcode = '22023';
  end if;
  update public.checklist_study_sessions set review_requested_at = now(), review_reason = v_reason where id = s.id;
  update public.checklist_rooms set rev = rev + 1, updated_by = v_uid where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 2) rever a nota
create or replace function public.app_dupla_redo_review(p_room_id uuid, p_round integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  s public.checklist_study_sessions;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  if r.phase <> 'result' or p_round is distinct from r.round then
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  select * into s from public.checklist_study_sessions where room_id = r.id and round = r.round;
  if not found then
    raise exception 'Esta ação não vale nesta fase da sala.' using errcode = '55000';
  end if;
  if s.actor_id is distinct from v_uid or r.evaluator_id is distinct from v_uid then
    raise exception 'Só o avaliador pode fazer isso.' using errcode = '42501';
  end if;
  if s.review_requested_at is null or s.revised_at is not null then
    raise exception 'A revisão só vale depois do pedido, uma vez.' using errcode = '55000';
  end if;
  update public.checklist_rooms set phase = 'review', rev = rev + 1, updated_by = v_uid where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 3) inverter papéis (rodada seguinte)
create or replace function public.app_dupla_swap(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_dur integer;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['result'], false);
  select case when s.duration_ms between 60000 and 3600000 then s.duration_ms end into v_dur
    from public.checklist_stations s where s.id = r.station_id;
  update public.checklist_rooms
     set phase = 'roles', round = round + 1,
         candidate_id = r.evaluator_id, evaluator_id = r.candidate_id,
         confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         duration_ms = v_dur, started_at = null, ends_at = null, paused_left_ms = null, paused_at = null, paused_total_ms = 0,
         finished_at = null, released_pressings = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 4) painel: uso do mês
-- Mês 'YYYY-MM' no fuso de Brasília (padrão: o atual). → { month, salas, rodadas_avaliadas, alunos, impressos_por_rodada }
-- impressos_por_rodada: média com uma casa, ou nulo sem rodada avaliada no mês.
create or replace function public.app_admin_dupla_usage(p_month text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month text;
  v_from timestamptz;
  v_to timestamptz;
  v_salas integer;
  v_rodadas integer;
  v_alunos integer;
  v_impressos numeric;
begin
  perform public.assert_admin();
  v_month := coalesce(p_month, to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido.' using errcode = '22023';
  end if;
  v_from := (v_month || '-01')::timestamp at time zone 'America/Sao_Paulo';
  v_to := ((v_month || '-01')::timestamp + interval '1 month') at time zone 'America/Sao_Paulo';

  select count(*) into v_salas from public.checklist_rooms r where r.created_at >= v_from and r.created_at < v_to;

  select count(*),
         round(avg(case when jsonb_typeof(s.pressings_released) = 'array' then jsonb_array_length(s.pressings_released) else 0 end), 1)
    into v_rodadas, v_impressos
    from public.checklist_study_sessions s
   where s.room_id is not null and s.finished_at >= v_from and s.finished_at < v_to;

  select count(distinct x.u) into v_alunos
    from public.checklist_study_sessions s
    cross join lateral (values (s.actor_id), (s.doctor_id)) as x(u)
   where s.room_id is not null and s.finished_at >= v_from and s.finished_at < v_to and x.u is not null;

  return jsonb_build_object('month', v_month, 'salas', v_salas, 'rodadas_avaliadas', v_rodadas, 'alunos', v_alunos,
                            'impressos_por_rodada', v_impressos);
end
$$;

-- ---------------------------------------------------------------- 5) resultado da rodada (base: 013310)
-- Só depois de a avaliação existir e só para os dois dela. O candidato, além disso, só com a sala no resultado da rodada pedida
-- (ou numa rodada que já passou, depois de inverter os papéis): na conferência (inclusive "Rever a nota") o tema segue reservado.
create or replace function public.app_dupla_result(p_room_id uuid, p_round integer) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  s public.checklist_study_sessions;
  r public.checklist_rooms;
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_items jsonb;
  v_prev integer;
begin
  select * into s from public.checklist_study_sessions where room_id = p_room_id and round = p_round;
  if not found or (v_uid is distinct from s.doctor_id and v_uid is distinct from s.actor_id) then
    raise exception 'Resultado ainda não liberado.' using errcode = '42501';
  end if;
  if v_uid = s.doctor_id and v_uid is distinct from s.actor_id then
    select * into r from public.checklist_rooms where id = p_room_id;
    if found and r.round = p_round and r.phase <> 'result' then
      raise exception 'Resultado ainda não liberado.' using errcode = '42501';
    end if;
  end if;
  select * into st from public.checklist_stations where id = s.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = s.station_id;
  v_meta := public.dupla_station_meta(s.station_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.e ->> 'id',
           'order', coalesce(i.e -> 'order', to_jsonb(i.n)),
           'content', coalesce(i.e ->> 'content', ''),
           'max_points', coalesce((i.e -> 'grades' ->> 'correct')::numeric, 0),
           'grade', a.grade,
           'points', case when a.grade is null then 0 else coalesce((i.e -> 'grades' ->> a.grade)::numeric, 0) end
         ) order by i.n), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end)
       with ordinality as i(e, n)
  left join lateral (
    select lower(x ->> 'grade') as grade
    from jsonb_array_elements(case when jsonb_typeof(s.checklist_answers) = 'array' then s.checklist_answers else '[]'::jsonb end) x
    where x ->> 'id' = i.e ->> 'id' and lower(x ->> 'grade') in ('correct', 'partial', 'incorrect')
    limit 1
  ) a on true;

  select round(p.correctness)::integer into v_prev
    from public.checklist_study_sessions p
   where p.doctor_id = s.doctor_id and p.station_id = s.station_id and p.id <> s.id
     and (p.finished_at, p.created_at, p.id) < (s.finished_at, s.created_at, s.id)
   order by p.finished_at desc, p.created_at desc, p.id desc
   limit 1;

  return jsonb_build_object(
    'round', s.round,
    'viewer', case when v_uid = s.doctor_id then 'candidate' else 'evaluator' end,
    'station', jsonb_build_object(
      'id', st.id, 'name', st.name, 'area', st.area, 'area_code', public.dupla_area_code(st.area),
      'number', v_meta -> 'number', 'edition', v_meta -> 'edition', 'reapplication', v_meta -> 'reapplication',
      'institution', st.institution, 'duration_ms', st.duration_ms
    ),
    'score', s.score,
    'max_score', s.max_score,
    'pct', case when s.max_score > 0 then round(s.score / s.max_score * 100)::integer else 0 end,
    'previous_pct', v_prev,
    'items', v_items,
    'evaluator', jsonb_build_object('user_id', s.actor_id, 'public_name', public.dupla_public_name(s.actor_id)),
    'candidate', jsonb_build_object('user_id', s.doctor_id, 'public_name', public.dupla_public_name(s.doctor_id)),
    'finished_at', s.finished_at,
    'used_ms', s.used_ms,
    'feedback', jsonb_build_object('pos', s.feedback_pos, 'neg', s.feedback_neg, 'gen', s.feedback_gen),
    'review', jsonb_build_object('requested_at', s.review_requested_at, 'reason', s.review_reason,
                                 'revised_at', s.revised_at, 'score_before_review', s.score_before_review)
  );
end
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access / assert_admin barra o resto.
revoke execute on function public.app_dupla_request_review(uuid, integer, text) from public, anon;
revoke execute on function public.app_dupla_redo_review(uuid, integer) from public, anon;
revoke execute on function public.app_dupla_swap(uuid) from public, anon;
revoke execute on function public.app_admin_dupla_usage(text) from public, anon;
