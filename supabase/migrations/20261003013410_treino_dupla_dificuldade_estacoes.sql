-- =============================================================================
-- Estações: grau de dificuldade definido pela revisão médica (pedido do dono de 17/10). Número reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md: 013410.
-- Depende da …8000 (revisão médica das estações: checklist_station_assert_staff, checklist_station_can_review), da 013310
-- (app_dupla_stations) e da 013380 (app_admin_stations com a situação do resumo).
-- Pode ser colada duas vezes: só "create table if not exists", "create or replace function" e permissões. Não grava dado de
-- estação nenhuma: quem classifica são os revisores médicos, pela tela. Nenhuma IA.
--
-- O QUE FAZ
--   * Tabela checklist_station_difficulty (uma linha por estação): o grau (facil, medio, dificil), os itens da rubrica fixa
--     marcados (docs/estacoes/dificuldade-estacoes.md), a nota do que foi conferido (10 a 2.000 caracteres), quem definiu e
--     quando. Fica FORA de checklist_stations de propósito, como o registro da revisão (…8000): aquela tabela é o catálogo
--     que o aluno lê pela API, e quem definiu e a nota são internos. O aluno recebe só o grau, por app_dupla_stations().
--     Por ficar fora, mudar o grau não toca em checklist_stations e NÃO derruba a aprovação médica da estação (a trava
--     checklist_stations_review_guard só olha medical_review).
--   * Campos da recalibração prontos e vazios (calibrated_level, calibrated_at, calibrated_n): depois, com as notas dos
--     alunos, o grau poderá ser recalibrado. Nenhuma função grava neles ainda e nenhuma tela os mostra.
--   * app_admin_set_station_difficulty(p_station_id, p_level, p_criteria, p_note): só o revisor médico cadastrado na área da
--     estação ou o administrador (checklist_station_can_review), com a nota do que foi conferido (10 caracteres ou mais).
--     p_level nulo tira o grau (também pede a nota). Grava no Registro de ações ('station.difficulty').
--     Editor da equipe, revisor de outra área, aluno e visitante não gravam.
--   * app_admin_stations() devolve o grau, os itens marcados, a nota, quem definiu e quando.
--   * app_dupla_stations() devolve "difficulty" (null sem grau gravado: a tela não mostra selo nenhum).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: app_dupla_stations() ← 013310 (igual, mais "difficulty");
--   app_admin_stations() ← 013380 (igual, mais os campos da dificuldade). Nova: app_admin_set_station_difficulty.
--
-- COMO DESFAZER: apagar app_admin_set_station_difficulty(text, text, text[], text); colar de novo app_dupla_stations da 013310
--   e app_admin_stations da 013380; a tabela checklist_station_difficulty pode ficar (ou "drop table").
-- =============================================================================

create table if not exists public.checklist_station_difficulty (
  station_id text primary key references public.checklist_stations (id) on delete cascade,
  level text not null check (level in ('facil', 'medio', 'dificil')),
  criteria text[] not null default '{}'
    check (criteria <@ array['tarefas', 'raciocinio', 'procedimento', 'conduta_dose', 'comunicacao', 'tempo']::text[]),
  note text not null check (char_length(note) between 10 and 2000),
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  -- recalibração pelas notas dos alunos (depois): grau calculado, quando e com quantas avaliações
  calibrated_level text check (calibrated_level is null or calibrated_level in ('facil', 'medio', 'dificil')),
  calibrated_at timestamptz,
  calibrated_n integer check (calibrated_n is null or calibrated_n >= 0)
);
-- Duas trancas, como checklist_station_reviews: acesso por linha ligado sem política e nenhuma permissão para aluno e
-- visitante (nem para a equipe por fora das funções).
alter table public.checklist_station_difficulty enable row level security;
revoke all on table public.checklist_station_difficulty from public, anon, authenticated;

-- Definir (ou tirar) o grau de uma estação. → a lista da aba (app_admin_stations).
create or replace function public.app_admin_set_station_difficulty(p_station_id text, p_level text, p_criteria text[] default '{}',
                                                                   p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  v_old text;
  v_note text := btrim(coalesce(p_note, ''));
  v_criteria text[];
begin
  perform public.checklist_station_assert_staff();
  select * into s from public.checklist_stations where id = p_station_id;
  if not found then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  if not public.checklist_station_can_review(s.area) then
    raise exception 'O grau de dificuldade desta estação é definido por um revisor médico cadastrado em % ou por um administrador.', s.area
      using errcode = '42501';
  end if;
  if p_level is not null and p_level not in ('facil', 'medio', 'dificil') then
    raise exception 'Grau de dificuldade inválido.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_criteria from unnest(coalesce(p_criteria, '{}')) c;
  if not v_criteria <@ array['tarefas', 'raciocinio', 'procedimento', 'conduta_dose', 'comunicacao', 'tempo']::text[] then
    raise exception 'Item da rubrica desconhecido.' using errcode = '22023';
  end if;
  if char_length(v_note) < 10 then
    raise exception 'Registre o que foi conferido para definir o grau (pelo menos 10 caracteres).' using errcode = '22023';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'A nota tem no máximo 2.000 caracteres.' using errcode = '22023';
  end if;
  select d.level into v_old from public.checklist_station_difficulty d where d.station_id = s.id for update;
  if p_level is null then
    delete from public.checklist_station_difficulty where station_id = s.id;
  else
    insert into public.checklist_station_difficulty (station_id, level, criteria, note, set_by, set_at)
    values (s.id, p_level, v_criteria, v_note, (select auth.uid()), now())
    on conflict (station_id) do update
      set level = excluded.level, criteria = excluded.criteria, note = excluded.note, set_by = excluded.set_by, set_at = excluded.set_at;
  end if;
  perform public.admin_log('station.difficulty', s.id,
                           jsonb_build_object('from', v_old, 'to', p_level, 'criteria', to_jsonb(v_criteria), 'note', v_note, 'area', s.area));
  return public.app_admin_stations();
end
$$;

-- Lista da aba Estações (base: 013380): igual, mais o grau de dificuldade e o registro de quem definiu.
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
      'difficulty', dif.level,
      'difficulty_criteria', coalesce(to_jsonb(dif.criteria), '[]'::jsonb),
      'difficulty_note', dif.note,
      'difficulty_at', dif.set_at,
      'difficulty_by', (select nullif(p.name, '') from public.profiles p where p.id = dif.set_by),
      'reports', (select count(*)::int from public.checklist_station_reports r where r.station_id = s.id),
      'last_reports', (select coalesce(jsonb_agg(jsonb_build_object('message', r.message, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                       from (select * from public.checklist_station_reports r where r.station_id = s.id order by r.created_at desc limit 3) r)
    ) order by s.medical_review desc, s.area, s.name)
    from public.checklist_stations s
    left join public.checklist_station_reviews v on v.station_id = s.id
    left join public.checklist_station_difficulty dif on dif.station_id = s.id
  ), '[]'::jsonb);
end
$$;

-- Banco de estações (base: 013310): igual, mais "difficulty" (só o grau; quem definiu e a nota não saem para o aluno).
create or replace function public.app_dupla_stations() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  return coalesce((
    select jsonb_agg(x.j order by (x.ed is null), x.ed collate "C" desc, x.reap, x.num, x.nome collate "C", x.id)
    from (
      select
        jsonb_build_object(
          'id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'area_code', public.dupla_area_code(s.area),
          'number', m -> 'number', 'edition', m -> 'edition', 'reapplication', m -> 'reapplication',
          'institution', s.institution, 'styles', to_jsonb(s.styles), 'duration_ms', s.duration_ms, 'is_pro_only', s.is_pro_only,
          'criteria_count', case when jsonb_typeof(k.content -> 'checklist_items') = 'array'
                                 then jsonb_array_length(k.content -> 'checklist_items') else 0 end,
          'pressing_count', case when jsonb_typeof(k.content -> 'pressings') = 'array'
                                 then jsonb_array_length(k.content -> 'pressings') else 0 end,
          'difficulty', dif.level,
          'my_last_pct', mine.pct,
          'average_pct', case when coalesce(ev.n, 0) >= 5 then round(ev.a, 1) end,
          'evaluations', coalesce(ev.n, 0)
        ) as j,
        m ->> 'edition' as ed,
        (m ->> 'reapplication')::boolean as reap,
        (m ->> 'number')::integer as num,
        s.name as nome,
        s.id as id
      from public.checklist_stations s
      cross join lateral public.dupla_station_meta(s.id) m
      left join public.checklist_station_contents k on k.station_id = s.id
      left join public.checklist_station_difficulty dif on dif.station_id = s.id
      left join (
        select t.station_id, count(*) as n, avg(t.correctness) as a
        from public.checklist_study_sessions t group by t.station_id
      ) ev on ev.station_id = s.id
      left join (
        select distinct on (t.station_id) t.station_id, round(t.correctness)::integer as pct
        from public.checklist_study_sessions t where t.doctor_id = v_uid
        order by t.station_id, t.finished_at desc, t.created_at desc, t.id desc
      ) mine on mine.station_id = s.id
      where s.medical_review = 'approved' or public.is_staff()
    ) x
  ), '[]'::jsonb);
end
$$;

revoke execute on function public.app_admin_set_station_difficulty(text, text, text[], text) from public, anon;
revoke execute on function public.app_admin_stations() from public, anon;
revoke execute on function public.app_dupla_stations() from public, anon;
