-- =============================================================================
-- Banco de estações: a origem do catálogo e a situação do conteúdo no cartão (pedido de 17/10, depois do catálogo da 013420).
-- Número reservado em .tmp-aulas/NUMEROS-MIGRACAO.md: 013425. Depende da 013410 (app_dupla_stations com a dificuldade) e da
-- 013420 (colunas origin_label e content_status em checklist_stations).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não grava dado. Nenhuma IA.
--
-- O QUE FAZ
--   * app_dupla_stations() passa a devolver:
--     - "origin_label": a origem gravada no catálogo ("Revalida 2020 · INEP"; nas edições de 2011 a 2017, só "Revalida 2013").
--       Vazio vira null, e a tela volta ao cálculo pela edição e pela instituição;
--     - "content_status": 'awaiting_content' | 'content_ready'. Só a equipe recebe cartões 'awaiting_content': para o aluno, o
--       cartão sem conteúdo é sempre pendente (trava da 013420) e app_dupla_stations só entrega a ele as aprovadas.
--   * O resto é igual à 013410 (mesma ordem, mesmas notas, mesmo grau).
--
-- FUNÇÃO REDEFINIDA E A BASE: app_dupla_stations() ← 013410 (igual, mais os dois campos).
-- COMO DESFAZER: colar de novo app_dupla_stations da 013410.
-- =============================================================================

-- Banco de estações (base: 013410): igual, mais "origin_label" e "content_status" (colunas da 013420).
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
          'origin_label', nullif(btrim(s.origin_label), ''),
          'content_status', s.content_status,
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

revoke execute on function public.app_dupla_stations() from public, anon;
