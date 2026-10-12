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
--   * aluno e visitante continuam barrados; o que o aluno pode ler não muda: checklist_stations fica como estava, e o
--     registro da revisão (nota, quem, quando) é interno, numa tabela própria (checklist_station_reviews) que só as funções
--     da aba leem e gravam. Aluno e visitante não a leem nem direto pelo banco (sem permissão e sem política de acesso);
--   * a aba continua funcionando com a Central de Conteúdo desligada (não depende de ch_flags);
--   * o registro (quem, quando, nota) só vale quando a situação muda pela função de revisão: qualquer outra mudança da
--     situação (comando direto no banco, nova carga do seed) apaga o registro, para o cartão nunca atribuir a decisão nova a
--     quem tomou a anterior (trava checklist_stations_review_guard);
--   * as funções da aba ficam fechadas para visitante (anon), como a …6100 faz com app_admin_save_question.
-- As estações aprovadas antes desta migração continuam aprovadas, sem revisor registrado (a tela avisa).
-- Esta migração é colada uma vez só. Colada de novo por engano, para no primeiro comando ("already exists") e não muda nada.
-- =============================================================================

-- Registro interno da última decisão da revisão de cada estação: o que foi conferido (ou o motivo da devolução), quem e
-- quando. Fica FORA de checklist_stations de propósito: aquela tabela é o catálogo que o aluno lê (política de
-- …0400_checklist_bank.sql e permissão padrão do Supabase em todas as colunas); uma coluna ali sairia para qualquer aluno
-- em /rest/v1/checklist_stations?select=review_note,reviewed_by,reviewed_at.
create table public.checklist_station_reviews (
  station_id text primary key references public.checklist_stations (id) on delete cascade,
  review_note text not null check (char_length(review_note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now()
);
-- Duas trancas: acesso por linha ligado sem nenhuma política, e nenhuma permissão para aluno e visitante.
-- Só as funções da aba (abaixo, que rodam como o dono) e o servidor leem e gravam.
alter table public.checklist_station_reviews enable row level security;
revoke all on table public.checklist_station_reviews from public, anon, authenticated;

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

-- Quem abre a aba Estações: a equipe (editor ou administrador) ou um revisor médico cadastrado em alguma área.
-- Não usa ch_assert_staff de propósito: aquela também exige a Central de Conteúdo ligada (ch_flags.enabled,
-- …2900_content_lab_foundation.sql), e desligar a Central não pode travar a aba Estações, que antes não dependia dela.
create function public.checklist_station_assert_staff() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (public.is_staff() or public.ch_is_reviewer()) then
    raise exception 'Acesso restrito à equipe e aos revisores médicos.' using errcode = '42501';
  end if;
end
$$;

-- Lista da aba Estações: igual à anterior (…1300), mas também para o revisor médico, com o registro da
-- última decisão (nota, quem, quando) e se quem chama pode aprovar cada estação.
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
      'reports', (select count(*)::int from public.checklist_station_reports r where r.station_id = s.id),
      'last_reports', (select coalesce(jsonb_agg(jsonb_build_object('message', r.message, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
                       from (select * from public.checklist_station_reports r where r.station_id = s.id order by r.created_at desc limit 3) r)
    ) order by s.medical_review desc, s.area, s.name)
    from public.checklist_stations s
    left join public.checklist_station_reviews v on v.station_id = s.id
  ), '[]'::jsonb);
end
$$;

-- Conteúdo completo da estação (roteiro, impressos, checklist) para a equipe e o revisor médico conferirem.
create function public.app_admin_station_content(p_station_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.checklist_station_assert_staff();
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
  perform public.checklist_station_assert_staff();
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
  -- A mudança da situação dispara a trava (checklist_stations_review_guard), que apaga o registro da decisão anterior;
  -- o registro desta decisão é gravado logo em seguida, na mesma transação.
  update public.checklist_stations set medical_review = p_status where id = s.id;
  insert into public.checklist_station_reviews (station_id, review_note, reviewed_by, reviewed_at)
  values (s.id, v_note, (select auth.uid()), now())
  on conflict (station_id) do update
    set review_note = excluded.review_note, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  perform public.admin_log('station.review', s.id, jsonb_build_object('from', s.medical_review, 'to', p_status, 'note', v_note, 'area', s.area));
  return public.app_admin_stations();
end
$$;

-- Trava do registro da revisão: toda vez que a situação (medical_review) muda, o registro da decisão anterior (nota, quem,
-- quando) é apagado. Pela função de revisão, o registro novo entra logo depois; por fora dela — o SQL direto que o README
-- ensinava, ou a carga do seed colada de novo (on conflict … set medical_review = 'pending') — a estação fica sem registro.
-- Sem isso, o cartão diria "Aprovada por <quem só devolveu>" ou "Devolvida por <quem aprovou>".
-- Estação aprovada assim aparece como "Aprovada sem registro de quem conferiu" (a tela pede para conferir de novo).
create function public.checklist_stations_review_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.checklist_station_reviews where station_id = new.id;
  return null;
end
$$;
create trigger checklist_stations_review_guard after update on public.checklist_stations
  for each row when (new.medical_review is distinct from old.medical_review)
  execute function public.checklist_stations_review_guard();

-- Funções da aba: só usuário logado (a checagem interna decide quem é da equipe ou revisor); visitante fica de fora.
revoke execute on function public.app_admin_stations() from public, anon;
revoke execute on function public.app_admin_station_content(text) from public, anon;
revoke execute on function public.app_admin_set_station_review(text, text, text) from public, anon;

-- Funções internas: ninguém chama de fora.
revoke execute on function public.checklist_stations_review_guard() from public, anon, authenticated;
revoke execute on function public.checklist_station_assert_staff() from public, anon, authenticated;
revoke execute on function public.checklist_station_area_code(text) from public, anon, authenticated;
revoke execute on function public.checklist_station_can_review(text) from public, anon, authenticated;
