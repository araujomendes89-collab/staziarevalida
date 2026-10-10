-- =============================================================================
-- Estações: aprovar é revisão médica de verdade (problema ES03), no modelo das Atualizações
-- (app_admin_review_guideline_update + ch_is_reviewer, em …4100_atualizacoes_diretrizes.sql).
--
-- Antes (…1300_admin.sql): qualquer pessoa da equipe (até o editor) aprovava com um clique, sem ser revisor médico, e não
-- ficava registrado quem conferiu nem o quê. O revisor médico que não é da equipe nem abria a lista.
-- Agora:
--   * aprovar = revisor médico cadastrado na área da estação (ch_reviewer_areas) ou administrador, com a nota do que foi
--     conferido (10 caracteres ou mais); grava quem aprovou e quando;
--   * devolver para revisão = equipe ou revisor médico, com o motivo (10 caracteres ou mais); grava quem devolveu e quando;
--   * o revisor médico abre a lista e o conteúdo das estações (roteiro, impressos, checklist) para conferir;
--   * aluno e visitante continuam barrados; o que o aluno pode ler (RLS das tabelas) não muda.
-- As estações aprovadas antes desta migração continuam aprovadas, sem revisor registrado (a tela avisa).
-- =============================================================================

alter table public.checklist_stations
  add column review_note text check (char_length(review_note) <= 2000),
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column reviewed_at timestamptz;

-- Código da área do revisor médico (ch_reviewer_areas.area_code, mesma regra de guideline_area_code) a partir da área da estação.
create function public.checklist_station_area_code(p_area text) returns text
  language sql immutable security definer set search_path = ''
as $$
  select case p_area when 'Clínica Médica' then 'CLINICA_MEDICA' when 'Cirurgia Geral' then 'CIRURGIA'
                     when 'Ginecologia e Obstetrícia' then 'GINECOLOGIA_OBSTETRICIA' when 'Pediatria' then 'PEDIATRIA'
                     when 'Medicina de Família e Comunidade' then 'MFC' end
$$;

-- Quem chama pode aprovar uma estação desta área? Administrador ou revisor médico cadastrado na área.
-- (área desconhecida → só o administrador: ch_is_reviewer(null) valeria para qualquer área)
create function public.checklist_station_can_review(p_area text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.is_admin()
    or (public.checklist_station_area_code(p_area) is not null and public.ch_is_reviewer(public.checklist_station_area_code(p_area)))
  )
$$;

-- Lista da aba Estações: igual à anterior (…1300), mas também para o revisor médico (ch_assert_staff), com o registro da
-- última decisão (nota, quem, quando) e se quem chama pode aprovar cada estação.
create or replace function public.app_admin_stations() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'topic', s.topic, 'area', s.area, 'medical_review', s.medical_review,
      'is_pro_only', s.is_pro_only, 'institution', s.institution,
      'review_note', s.review_note, 'reviewed_at', s.reviewed_at,
      'reviewer', (select nullif(p.name, '') from public.profiles p where p.id = s.reviewed_by),
      'can_review', public.checklist_station_can_review(s.area),
      'reports', (select count(*)::int from public.checklist_station_reports r where r.station_id = s.id),
      'last_reports', (select coalesce(jsonb_agg(jsonb_build_object('message', r.message, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                       from (select * from public.checklist_station_reports r where r.station_id = s.id order by r.created_at desc limit 3) r)
    ) order by s.medical_review desc, s.area, s.name)
    from public.checklist_stations s
  ), '[]'::jsonb);
end
$$;

-- Conteúdo completo da estação (roteiro, impressos, checklist) para a equipe e o revisor médico conferirem.
create function public.app_admin_station_content(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return (select c.content from public.checklist_station_contents c where c.station_id = p_station_id);
end
$$;

-- A versão anterior (só p_station_id e p_status) aprovava sem nota: sai, para não sobrar um caminho sem a regra.
drop function public.app_admin_set_station_review(text, text);

create function public.app_admin_set_station_review(p_station_id text, p_status text, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.checklist_stations;
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform public.ch_assert_staff();
  if p_status is null or p_status not in ('pending', 'approved') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  select * into s from public.checklist_stations where id = p_station_id for update;
  if not found then
    raise exception 'Estação não encontrada.' using errcode = 'P0002';
  end if;
  if p_status = 'approved' then
    if not public.checklist_station_can_review(s.area) then
      raise exception 'A aprovação desta estação é de um revisor médico cadastrado em % ou de um administrador.', s.area using errcode = '42501';
    end if;
    if s.medical_review = 'approved' then
      raise exception 'Esta estação já está aprovada.' using errcode = '22023';
    end if;
    if char_length(v_note) < 10 then
      raise exception 'Registre o que foi conferido no roteiro, nos impressos e no checklist (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
  else
    if s.medical_review = 'pending' then
      raise exception 'Esta estação já aguarda revisão.' using errcode = '22023';
    end if;
    if char_length(v_note) < 10 then
      raise exception 'Escreva o motivo para voltar à revisão (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'A nota tem no máximo 2.000 caracteres.' using errcode = '22023';
  end if;
  update public.checklist_stations
     set medical_review = p_status, review_note = v_note, reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = s.id;
  perform public.admin_log('station.review', s.id, jsonb_build_object('from', s.medical_review, 'to', p_status, 'note', v_note, 'area', s.area));
  return public.app_admin_stations();
end
$$;

revoke execute on function public.checklist_station_area_code(text) from public, anon, authenticated;
revoke execute on function public.checklist_station_can_review(text) from public, anon, authenticated;
