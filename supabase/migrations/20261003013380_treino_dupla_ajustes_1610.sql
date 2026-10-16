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

-- ================================================================ PARTE 2: resumo sobre o tema, com revisão médica (D9)
-- Pedido 4 do dono (16/10). "Materiais › Resumo sobre o tema" na sala do avaliador.
--  - Onde a equipe escreve: Administração › Estações, no cartão da estação ("Resumo sobre o tema"). Não existe coluna
--    "summary" em checklist_stations; o "summary" que existia é o do conteúdo da estação (checklist_station_contents.content,
--    "Resumo dos temas" que vem da Montagem). Ele NÃO vai mais para a sala: a sala só mostra o resumo aprovado desta tabela.
--    A aba pode copiar aquele texto para o rascunho (a equipe confere e manda à revisão).
--  - Situação: rascunho → aprovado. Aprova só o revisor médico cadastrado na área da estação ou um administrador (mesma regra
--    da aprovação da estação, checklist_station_can_review), com registro de quem aprovou e quando. Se o texto mudar, por
--    qualquer caminho (função da aba ou comando direto), volta a rascunho e o registro da aprovação é apagado (gatilho).
--  - Na sala: app_dupla_room_content entrega "summary" SÓ ao avaliador e SÓ com resumo aprovado. O candidato nunca recebe.
--  - A tabela fica fora do alcance de aluno e visitante (acesso por linha ligado, sem política, sem permissão): só as funções
--    leem e gravam.
--  - Central de IAs (futuro, NÃO ligado): a coluna "origin" já aceita 'ia_sugestao' para um rascunho sugerido pela IA, que
--    entraria sempre como rascunho e passaria pela mesma revisão médica. Nenhuma função desta migração grava 'ia_sugestao'.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_room_content(uuid) ← 013350 (igual, mas o "summary" do avaliador vem do resumo aprovado desta tabela);
--   app_admin_stations() ← …8000 (igual, mais "summary_status": null | 'draft' | 'approved').
--   Novas: app_admin_station_summary(text), app_admin_save_station_summary(text, text),
--   app_admin_review_station_summary(text, text), checklist_station_summary_guard() e a tabela checklist_station_summaries.
--   Usadas sem mudar: checklist_station_assert_staff, checklist_station_can_review (…8000); admin_log (…1300);
--   dupla_assert_access, dupla_station_meta, dupla_area_code (013300); dupla_pressings, dupla_pressings_tela (013340, 013350).
--
-- COMO DESFAZER (parte 2): apagar as funções novas e a tabela checklist_station_summaries; colar de novo
--   app_dupla_room_content da 013350 e app_admin_stations da …8000.

create table if not exists public.checklist_station_summaries (
  station_id text primary key references public.checklist_stations (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  origin text not null default 'equipe' check (origin in ('equipe', 'ia_sugestao')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  check (status = 'draft' or approved_at is not null)
);
alter table public.checklist_station_summaries enable row level security;
revoke all on table public.checklist_station_summaries from public, anon, authenticated;

-- Texto novo (ou linha nova) → rascunho, sem registro de aprovação. Só a mudança da situação, com o mesmo texto, aprova.
create or replace function public.checklist_station_summary_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if new.status = 'draft' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists checklist_station_summary_guard on public.checklist_station_summaries;
create trigger checklist_station_summary_guard before insert or update on public.checklist_station_summaries
  for each row execute function public.checklist_station_summary_guard();

-- Resumo de uma estação para a aba (equipe ou revisor médico). → { station_id, body, status, origin, updated_at, updated_by,
-- approved_at, approved_by, can_approve } (body e status nulos quando não há resumo).
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
    'can_approve', public.checklist_station_can_review(s.area)
  );
end
$$;

-- Salvar o rascunho (equipe ou revisor médico). Texto vazio apaga o resumo. Texto igual ao gravado não muda nada (nem a
-- aprovação). Texto diferente volta a rascunho (gatilho).
create or replace function public.app_admin_save_station_summary(p_station_id text, p_body text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  m public.checklist_station_summaries;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public.checklist_station_assert_staff();
  select * into s from public.checklist_stations where id = p_station_id;
  if not found then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  if char_length(v_body) > 8000 then
    raise exception 'O resumo tem no máximo 8.000 caracteres.' using errcode = '22023';
  end if;
  select * into m from public.checklist_station_summaries where station_id = s.id for update;
  if v_body = '' then
    if found then
      delete from public.checklist_station_summaries where station_id = s.id;
      perform public.admin_log('station.summary.save', s.id, jsonb_build_object('action', 'deleted', 'from', m.status));
    end if;
    return public.app_admin_station_summary(s.id);
  end if;
  if found and m.body = v_body then
    return public.app_admin_station_summary(s.id);
  end if;
  insert into public.checklist_station_summaries (station_id, body, origin, updated_by, updated_at)
  values (s.id, v_body, 'equipe', (select auth.uid()), now())
  on conflict (station_id) do update
    set body = excluded.body, origin = 'equipe', updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.admin_log('station.summary.save', s.id,
                           jsonb_build_object('action', 'saved', 'from', m.status, 'chars', char_length(v_body)));
  return public.app_admin_station_summary(s.id);
end
$$;

-- Aprovar ('approved': revisor médico da área ou administrador; só um rascunho com texto) ou voltar a rascunho ('draft':
-- equipe ou revisor médico; só um resumo aprovado). Grava quem aprovou e quando.
create or replace function public.app_admin_review_station_summary(p_station_id text, p_status text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  m public.checklist_station_summaries;
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
    update public.checklist_station_summaries
       set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
     where station_id = s.id;
  else
    if m.status = 'draft' then
      raise exception 'Este resumo já está em rascunho.' using errcode = '22023';
    end if;
    update public.checklist_station_summaries set status = 'draft' where station_id = s.id;
  end if;
  perform public.admin_log('station.summary.review', s.id, jsonb_build_object('from', m.status, 'to', p_status, 'area', s.area));
  return public.app_admin_station_summary(s.id);
end
$$;

-- Lista da aba Estações (base: …8000): igual, mais a situação do resumo sobre o tema.
create or replace function public.app_admin_stations() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.checklist_station_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'medical_review', s.medical_review,
      'is_pro_only', s.is_pro_only, 'institution', s.institution,
      'review_note', v.review_note, 'reviewed_at', v.reviewed_at,
      'reviewer', (select nullif(p.name, '') from public.profiles p where p.id = v.reviewed_by),
      'can_review', public.checklist_station_can_review(s.area),
      'summary_status', (select m.status from public.checklist_station_summaries m where m.station_id = s.id),
      'reports', (select count(*)::int from public.checklist_station_reports r where r.station_id = s.id),
      'last_reports', (select coalesce(jsonb_agg(jsonb_build_object('message', r.message, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                       from (select * from public.checklist_station_reports r where r.station_id = s.id order by r.created_at desc limit 3) r)
    ) order by s.medical_review desc, s.area, s.name)
    from public.checklist_stations s
    left join public.checklist_station_reviews v on v.station_id = s.id
  ), '[]'::jsonb);
end
$$;

-- Conteúdo por papel (base: 013350). Única mudança: o "summary" do avaliador (ver acima).
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
  v_named boolean;
  v_pressings jsonb := '[]'::jsonb;
  v_items jsonb;
  v_count integer;
  v_assets jsonb;
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
  v_assets := case when jsonb_typeof(c -> 'pressing_assets') = 'object' then c -> 'pressing_assets' else '{}'::jsonb end;
  select count(*) into v_count from public.dupla_pressings(c) p where not p.initially_visible;
  v_meta := public.dupla_station_meta(st.id);
  v_named := r.evaluator_id is not null and v_uid = r.evaluator_id or r.phase = 'result';

  v_role := case when r.phase in ('connecting', 'setup', 'running', 'review', 'result') then
              case when v_uid = r.candidate_id then 'candidate' when v_uid = r.evaluator_id then 'evaluator' end
            end;

  v_station := jsonb_build_object('label', case when v_meta ->> 'number' is not null then 'Estação ' || (v_meta ->> 'number') else 'Estação' end,
                                  'area', st.area, 'area_code', public.dupla_area_code(st.area),
                                  'number', v_meta -> 'number', 'duration_ms', st.duration_ms);
  if v_named then
    v_station := v_station || jsonb_build_object('id', st.id, 'name', st.name);
  end if;
  if v_role is null then
    return jsonb_build_object('role', null, 'station', v_station, 'pressing_count', v_count, 'pressings', '[]'::jsonb);
  end if;

  v_station := v_station || jsonb_build_object('version', c ->> 'version', 'doctor_scene', coalesce(c ->> 'doctor_scene', ''),
                                               'doctor_tasks', coalesce(c ->> 'doctor_tasks', ''),
                                               'candidate_sheet', jsonb_build_object('has_image', v_assets ? 'candidate_sheet'));
  if v_role = 'evaluator' then
    -- Resumo sobre o tema (D9, 013380): só o avaliador e só o APROVADO pela revisão médica (checklist_station_summaries).
    -- O "summary" do conteúdo da estação não vai mais para a sala. Sem resumo aprovado: nulo (a tela não mostra Materiais).
    v_station := v_station || jsonb_build_object(
      'actor_script', coalesce(c ->> 'actor_script', ''),
      'summary', (select m.body from public.checklist_station_summaries m
                   where m.station_id = st.id and m.status = 'approved' and btrim(m.body) <> ''));
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'index', p.n, 'display_number', p.screen_number, 'source_number', p.source_number,
             'initially_visible', p.initially_visible,
             'name', coalesce(p.e ->> 'name', ''), 'content', coalesce(p.e ->> 'content', ''),
             'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
           ) order by p.n), '[]'::jsonb)
      into v_pressings
    from public.dupla_pressings_tela(c) p;

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

  -- Candidato: folha (cenário, tarefas, imagem se houver), impressos iniciais e os liberados; nunca o nome, o id verdadeiro,
  -- o número de origem, o resumo nem o nome de arquivo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', case when p.initially_visible then 'i' else 'd' end || p.screen_number,
           'display_number', p.screen_number, 'initially_visible', p.initially_visible,
           'name', coalesce(p.e ->> 'name', ''),
           'content', btrim(regexp_replace(regexp_replace(coalesce(p.e ->> 'content', ''), '[ \t]*Libera[cç][aã]o[ \t]*:[^\n]*(\n|$)', '', 'gi'), '\n{3,}', E'\n\n', 'g'), E' \t\r\n'),
           'has_image', v_assets ? p.id or v_assets ? ('p' || p.n)
         ) order by p.initially_visible desc, p.screen_number, p.n), '[]'::jsonb)
    into v_pressings
  from public.dupla_pressings_tela(c) p
  where p.initially_visible or p.id = any (r.released_pressings);
  return jsonb_build_object('role', v_role, 'station', v_station, 'pressing_count', v_count, 'pressings', v_pressings);
end
$$;

-- ---------------------------------------------------------------- permissões (parte 2)
-- Funções da aba: só usuário logado (a checagem interna decide quem é da equipe ou revisor); visitante fica de fora.
revoke execute on function public.app_admin_station_summary(text) from public, anon;
revoke execute on function public.app_admin_save_station_summary(text, text) from public, anon;
revoke execute on function public.app_admin_review_station_summary(text, text) from public, anon;
revoke execute on function public.app_admin_stations() from public, anon;
revoke execute on function public.app_dupla_room_content(uuid) from public, anon;
-- Gatilho: ninguém chama de fora.
revoke execute on function public.checklist_station_summary_guard() from public, anon, authenticated;
