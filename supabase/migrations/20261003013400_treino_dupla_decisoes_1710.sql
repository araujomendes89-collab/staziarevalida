-- =============================================================================
-- Treino em Dupla: decisões do dono de 17/10 (reservado em .tmp-aulas/NUMEROS-MIGRACAO.md: 013400).
-- Depende da 013300 (sala, avaliações), 013310/013340/013360 (resultado), 013380 (resumo sobre o tema) e da …8000 (revisão
-- médica das estações). Pode ser colada duas vezes: só "create or replace", "add column if not exists", "drop … if exists"
-- e permissões. Nenhuma IA, nenhum dado gravado.
--
-- PARTE 1 — (c) o resultado de cada rodada no histórico (Meus PEPs), inclusive depois de a sala fechar.
--   Antes (013360): com a sala encerrada, o candidato não abria mais o resultado da última rodada.
--   * app_dupla_history(p_limit): as rodadas avaliadas em que a pessoa foi CANDIDATA ou AVALIADORA, e só essas.
--     Cada linha: sala, rodada, papel, data, situação, nome público do colega e a estação como "Estação N · Área".
--     O nome e a edição da estação e a nota só saem com a situação 'concluida'. A rodada só existe aqui depois do resultado
--     (a avaliação nasce na finalização, que leva a sala ao resultado), então o tema nunca aparece antes dele.
--   * Revisão da nota: com o pedido feito e a nota ainda não revisada, a situação é 'aguardando_revisao' (sem nome, sem nota,
--     sem abrir). Depois da revisão, volta a 'concluida', com "revisada".
--   * app_dupla_history_result(p_room_id, p_round): o mesmo resultado que a sala mostra (dupla_result_payload), só para os
--     dois da rodada e só 'concluida'; vale com a sala aberta, encerrada ou já em outra rodada.
--   * dupla_result_payload: o corpo do resultado da 013360, sem mudar nada; app_dupla_result passa a usá-lo (mesmas travas).
--   * Quem entra: qualquer pessoa logada, só com as próprias rodadas (o filtro está na função). Não depende do plano nem da
--     chave do módulo: são os dados da própria pessoa.
--   * Exportação (app_export_my_data): não muda. Nenhuma tabela nova; as salas e avaliações já saem pela exportação.
--
-- PARTE 2 — (d) aprovar o "Resumo sobre o tema" pede a nota do que foi conferido (como a aprovação da estação, …8000):
--   * coluna approval_note em checklist_station_summaries (até 2.000 caracteres), guardada com quem aprovou e quando;
--   * app_admin_review_station_summary(p_station_id, p_status, p_note): aprovar exige 10 caracteres ou mais; voltar a
--     rascunho não pede nota (o dono não pediu) e apaga a nota junto com o registro da aprovação;
--   * o gatilho checklist_station_summary_guard apaga também a nota quando o texto muda ou volta a rascunho;
--   * app_admin_station_summary devolve approval_note; o Registro de ações guarda a nota da aprovação.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: app_dupla_result(uuid, integer) ← 013360 (igual; o corpo foi para
--   dupla_result_payload); checklist_station_summary_guard(), app_admin_station_summary(text) ← 013380 (iguais, mais a nota);
--   app_admin_review_station_summary: a de 2 argumentos (013380) é apagada e entra a de 3 (p_note com padrão nulo).
--   Novas: dupla_result_payload, dupla_history_released, app_dupla_history, app_dupla_history_result.
--
-- COMO DESFAZER: apagar app_dupla_history(integer), app_dupla_history_result(uuid, integer), dupla_history_released(…) e
--   dupla_result_payload(…); colar de novo app_dupla_result da 013360; apagar app_admin_review_station_summary(text, text, text)
--   e colar de novo a de 2 argumentos, o gatilho e app_admin_station_summary da 013380; a coluna approval_note pode ficar.
-- =============================================================================

-- ================================================================ PARTE 1: histórico com o resultado

-- Corpo do resultado de uma rodada (013360, sem mudança): estação com o nome, nota, itens do PEP, feedback e revisão.
-- Interna: quem chama já conferiu que p_uid é o candidato ou o avaliador da rodada e que o resultado está liberado.
create or replace function public.dupla_result_payload(s public.checklist_study_sessions, p_uid uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_items jsonb;
  v_prev integer;
begin
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
    'viewer', case when p_uid = s.doctor_id then 'candidate' else 'evaluator' end,
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

-- Resultado da rodada na sala (base: 013360; mesmas travas, o corpo agora vem de dupla_result_payload).
create or replace function public.app_dupla_result(p_room_id uuid, p_round integer) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  s public.checklist_study_sessions;
  r public.checklist_rooms;
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
  return public.dupla_result_payload(s, v_uid);
end
$$;

-- A rodada está liberada no histórico? Não, enquanto a revisão da nota foi pedida e ainda não foi feita.
create or replace function public.dupla_history_released(s public.checklist_study_sessions) returns boolean
  language sql immutable security definer set search_path = ''
as $$ select s.review_requested_at is null or s.revised_at is not null $$;

-- Histórico das rodadas da pessoa (candidata ou avaliadora), da mais nova para a mais antiga.
-- → [{ room_id, round, role, status ('concluida' | 'aguardando_revisao'), revised, finished_at, partner { public_name },
--      station { number, area, area_code, name?, edition? }, score?, max_score?, pct? }]
create or replace function public.app_dupla_history(p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.fim desc, x.sid desc)
      from (
        select s.finished_at as fim, s.id as sid, jsonb_build_object(
                 'room_id', s.room_id,
                 'round', s.round,
                 'role', case when s.doctor_id = v_uid then 'candidate' else 'evaluator' end,
                 'status', case when z.ok then 'concluida' else 'aguardando_revisao' end,
                 'revised', s.revised_at is not null,
                 'finished_at', s.finished_at,
                 'partner', jsonb_build_object('public_name',
                              public.dupla_public_name(case when s.doctor_id = v_uid then s.actor_id else s.doctor_id end)),
                 'station', jsonb_build_object(
                   'number', z.meta -> 'number',
                   'area', st.area,
                   'area_code', public.dupla_area_code(st.area),
                   'name', case when z.ok then st.name end,
                   'edition', case when z.ok then z.meta -> 'edition' end),
                 'score', case when z.ok then s.score end,
                 'max_score', case when z.ok then s.max_score end,
                 'pct', case when z.ok and s.max_score > 0 then round(s.score / s.max_score * 100)::integer end
               ) as j
          from public.checklist_study_sessions s
          left join public.checklist_stations st on st.id = s.station_id
          cross join lateral (select public.dupla_history_released(s) as ok, public.dupla_station_meta(s.station_id) as meta) z
         where s.room_id is not null
           and (s.doctor_id = v_uid or s.actor_id = v_uid)
         order by s.finished_at desc nulls last, s.id desc
         limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) x
  ), '[]'::jsonb);
end
$$;

-- Resultado de uma rodada pelo histórico: só os dois da rodada e só liberada; com a sala aberta, encerrada ou noutra rodada.
create or replace function public.app_dupla_history_result(p_room_id uuid, p_round integer) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  s public.checklist_study_sessions;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  select * into s from public.checklist_study_sessions where room_id = p_room_id and round = p_round;
  if not found or (v_uid is distinct from s.doctor_id and v_uid is distinct from s.actor_id) then
    raise exception 'Resultado ainda não liberado.' using errcode = '42501';
  end if;
  if not public.dupla_history_released(s) then
    raise exception 'Aguardando revisão da nota.' using errcode = '55000';
  end if;
  return public.dupla_result_payload(s, v_uid);
end
$$;

revoke execute on function public.dupla_result_payload(public.checklist_study_sessions, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_history_released(public.checklist_study_sessions) from public, anon, authenticated;
revoke execute on function public.app_dupla_history(integer) from public, anon;
revoke execute on function public.app_dupla_history_result(uuid, integer) from public, anon;

-- ================================================================ PARTE 2: nota ao aprovar o resumo sobre o tema

alter table public.checklist_station_summaries
  add column if not exists approval_note text check (approval_note is null or char_length(approval_note) <= 2000);

-- Gatilho (base: 013380): texto novo (ou linha nova) → rascunho, sem registro de aprovação, agora também sem a nota.
create or replace function public.checklist_station_summary_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
    new.approval_note := null;
  end if;
  if new.status = 'draft' then
    new.approved_by := null;
    new.approved_at := null;
    new.approval_note := null;
  end if;
  return new;
end
$$;

-- Resumo de uma estação para a aba (base: 013380), mais "approval_note".
create or replace function public.app_admin_station_summary(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  m public.checklist_station_summaries;
begin
  perform public.checklist_station_assert_staff();
  select * into s from public.checklist_stations where id = p_station_id;
  if not found then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  select * into m from public.checklist_station_summaries where station_id = s.id;
  return jsonb_build_object(
    'station_id', s.id,
    'body', m.body,
    'status', m.status,
    'origin', m.origin,
    'updated_at', m.updated_at,
    'updated_by', (select nullif(p.name, '') from public.profiles p where p.id = m.updated_by),
    'approved_at', m.approved_at,
    'approved_by', (select nullif(p.name, '') from public.profiles p where p.id = m.approved_by),
    'approval_note', m.approval_note,
    'can_approve', public.checklist_station_can_review(s.area)
  );
end
$$;

-- Aprovar ou voltar a rascunho (base: 013380). Aprovar pede a nota do que foi conferido (10 a 2.000 caracteres).
drop function if exists public.app_admin_review_station_summary(text, text);
create or replace function public.app_admin_review_station_summary(p_station_id text, p_status text, p_note text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  m public.checklist_station_summaries;
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform public.checklist_station_assert_staff();
  if p_status is null or p_status not in ('draft', 'approved') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  select * into s from public.checklist_stations where id = p_station_id;
  if not found then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  select * into m from public.checklist_station_summaries where station_id = s.id for update;
  if not found then
    raise exception 'Esta estação ainda não tem resumo.' using errcode = '22023';
  end if;
  if p_status = 'approved' then
    if not public.checklist_station_can_review(s.area) then
      raise exception 'A aprovação deste resumo é de um revisor médico cadastrado em % ou de um administrador.', s.area using errcode = '42501';
    end if;
    if m.status = 'approved' then
      raise exception 'Este resumo já está aprovado.' using errcode = '22023';
    end if;
    if char_length(v_note) < 10 then
      raise exception 'Registre o que foi conferido no resumo (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
    if char_length(v_note) > 2000 then
      raise exception 'A nota tem no máximo 2.000 caracteres.' using errcode = '22023';
    end if;
    update public.checklist_station_summaries
       set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approval_note = v_note
     where station_id = s.id;
    perform public.admin_log('station.summary.review', s.id,
                             jsonb_build_object('from', m.status, 'to', p_status, 'area', s.area, 'note', v_note));
  else
    if m.status = 'draft' then
      raise exception 'Este resumo já está em rascunho.' using errcode = '22023';
    end if;
    update public.checklist_station_summaries set status = 'draft' where station_id = s.id;
    perform public.admin_log('station.summary.review', s.id, jsonb_build_object('from', m.status, 'to', p_status, 'area', s.area));
  end if;
  return public.app_admin_station_summary(s.id);
end
$$;

revoke execute on function public.app_admin_review_station_summary(text, text, text) from public, anon;
revoke execute on function public.checklist_station_summary_guard() from public, anon, authenticated;
