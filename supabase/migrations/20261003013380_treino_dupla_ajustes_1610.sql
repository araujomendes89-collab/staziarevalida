-- =============================================================================
-- Treino em Dupla: ajustes pedidos pelo dono em 16/10. (Número reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013300 (sala, avaliação), 013340, 013350 (ações da sala, conteúdo por papel) e 013360 (resultado).
-- Pode ser colada duas vezes: "create table if not exists", "drop function if exists", "create or replace function",
-- "drop trigger if exists" e permissões. Não grava dado de estação. Nenhuma IA.
--
-- O QUE FAZ
--  1) SEM INVERTER PAPÉIS NA MESMA ESTAÇÃO (pedido 1 do dono). Na rodada 2 com a mesma estação, o novo candidato já tinha
--     visto o tema como avaliador. Por isso:
--     - sai app_dupla_swap (da 013360, "Treinar novamente — Inverter papéis");
--     - entra app_dupla_next_station ("Treinar outra estação"): qualquer um dos dois, só no resultado → rodada seguinte na
--       fase dos papéis, o mesmo par, SEM papéis e SEM estação (os dois escolhem de novo os papéis; o avaliador escolhe a
--       estação), confirmações, conexão e prontidão vazias, cronômetro zerado, impressos liberados vazios. O link fica.
--       Dois cliques (duas abas): o segundo recusa pela fase, não pula rodada;
--     - app_dupla_set_station e app_dupla_confirm_roles recusam estação que a dupla JÁ TREINOU NESTA SALA (qualquer rodada
--       anterior, não só a última: em toda rodada anterior um dos dois foi avaliador e o outro leu o tema no resultado):
--       'Vocês já treinaram esta estação nesta sala. Escolham outra.';
--     - app_dupla_room_done_stations: ids das estações das rodadas anteriores desta sala, para a janela de escolha mostrar
--       "Já treinada nesta sala". Só para os dois da sala. Não revela tema novo: as duas pessoas já viram o resultado
--       (com o nome) de cada rodada anterior.
--  2) RESUMO SOBRE O TEMA (D9, pedido 4 do dono): ver a parte 2, mais abaixo.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_set_station(uuid, text) ← 013350 (igual, mais a recusa da estação já treinada);
--   app_dupla_confirm_roles(uuid) ← 013350 (igual, mais a mesma recusa, por garantia).
--   Apagada: app_dupla_swap(uuid) (013360). Novas: app_dupla_next_station(uuid), app_dupla_room_done_stations(uuid),
--   dupla_station_done_in_room(checklist_rooms, text).
--   Usadas sem mudar: dupla_assert_access (013300); dupla_room_state, dupla_room_for_action, dupla_room_need (013350).
--
-- REGRA QUE NÃO MUDA: o candidato nunca recebe o tema antes do resultado; a coluna station_id de study_matches continua
-- fora do alcance do aluno; a exportação (app_export_my_data) não é tocada.
--
-- COMO DESFAZER (parte 1): apagar app_dupla_next_station(uuid), app_dupla_room_done_stations(uuid) e
--   dupla_station_done_in_room(checklist_rooms, text); colar de novo app_dupla_set_station e app_dupla_confirm_roles da 013350
--   e app_dupla_swap da 013360.
-- =============================================================================

-- ================================================================ PARTE 1: outra estação em vez de inverter papéis

drop function if exists public.app_dupla_swap(uuid);

-- A estação já foi treinada por esta dupla nesta sala (avaliação de uma rodada anterior)?
create or replace function public.dupla_station_done_in_room(p_room public.checklist_rooms, p_station_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_station_id is not null and exists (
    select 1 from public.checklist_study_sessions x
     where x.room_id = p_room.id and x.round < p_room.round and x.station_id = p_station_id)
$$;

-- "Treinar outra estação": rodada seguinte, mesmo par, papéis e estação em branco.
create or replace function public.app_dupla_next_station(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['result'], false);
  update public.checklist_rooms
     set phase = 'roles', round = round + 1,
         candidate_id = null, evaluator_id = null,
         station_id = null, station_chosen_by = null, duration_ms = null,
         confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         started_at = null, ends_at = null, paused_left_ms = null, paused_at = null, paused_total_ms = 0,
         finished_at = null, released_pressings = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Estações das rodadas anteriores desta sala (para a janela de escolha). → ["id", …]
create or replace function public.app_dupla_room_done_stations(p_room_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.checklist_rooms where id = p_room_id and v_uid = any (member_ids);
  if not found then
    raise exception 'Sala não encontrada.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(distinct x.station_id)
                     from public.checklist_study_sessions x
                    where x.room_id = r.id and x.round < r.round and x.station_id is not null), '[]'::jsonb);
end
$$;

-- Só o avaliador escolhe (ou troca) a estação, e só depois dos papéis (base: 013350). Novo: recusa a estação que a dupla já
-- treinou nesta sala.
create or replace function public.app_dupla_set_station(p_room_id uuid, p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  st public.checklist_stations;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  if r.candidate_id is null or r.evaluator_id is null then
    raise exception 'Definam os papéis antes de escolher a estação.' using errcode = '55000';
  end if;
  if r.evaluator_id <> v_uid then
    raise exception 'Só o avaliador escolhe a estação.' using errcode = '42501';
  end if;
  select * into st from public.checklist_stations s where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff());
  if not found then
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;
  if public.dupla_station_done_in_room(r, st.id) then
    raise exception 'Vocês já treinaram esta estação nesta sala. Escolham outra.' using errcode = '22023';
  end if;
  if st.is_pro_only and not (public.tutor_is_pro(r.member_ids[1]) and public.tutor_is_pro(r.member_ids[2])) then
    raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
  end if;
  update public.checklist_rooms
     set station_id = st.id, station_chosen_by = v_uid,
         duration_ms = case when st.duration_ms between 60000 and 3600000 then st.duration_ms end,
         confirmed_ids = '{}', rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- Confirmar papéis e estação (base: 013350). Novo: a mesma recusa da estação já treinada nesta sala, por garantia.
create or replace function public.app_dupla_confirm_roles(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_ids uuid[];
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  if r.station_id is null then
    raise exception 'Escolha a estação antes de confirmar.' using errcode = '55000';
  end if;
  if r.candidate_id is null or r.evaluator_id is null then
    raise exception 'Definam os papéis antes de confirmar.' using errcode = '55000';
  end if;
  if public.dupla_station_done_in_room(r, r.station_id) then
    raise exception 'Vocês já treinaram esta estação nesta sala. Escolham outra.' using errcode = '22023';
  end if;
  if v_uid = any (r.confirmed_ids) then
    return public.dupla_room_state(r, v_uid);
  end if;
  v_ids := r.confirmed_ids || v_uid;
  update public.checklist_rooms
     set confirmed_ids = v_ids,
         phase = case when member_ids <@ v_ids then 'connecting' else phase end,
         connected_ids = case when member_ids <@ v_ids then '{}' else connected_ids end,
         ready_ids = case when member_ids <@ v_ids then '{}' else ready_ids end,
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- permissões (parte 1)
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access barra o resto. A de apoio: só por dentro.
revoke execute on function public.app_dupla_next_station(uuid) from public, anon;
revoke execute on function public.app_dupla_room_done_stations(uuid) from public, anon;
revoke execute on function public.app_dupla_set_station(uuid, text) from public, anon;
revoke execute on function public.app_dupla_confirm_roles(uuid) from public, anon;
revoke execute on function public.dupla_station_done_in_room(public.checklist_rooms, text) from public, anon, authenticated;
