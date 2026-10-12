-- Central de Conteúdo > Materiais visuais: material com dose ou contraindicação só sai para baixar depois da revisão médica (CC28).
-- Fase 1 do gerenciamento (grupo B), 12/10/2026. Pode ser colada duas ou três vezes.
--
-- Hoje o material visual que a equipe escreve (card, A4, story, flashcard) fica "Pronto" e baixável assim que a conferência técnica passa,
-- mesmo com dose, via ou contraindicação, sem nenhum médico ter olhado. Agora:
--   * o banco reconhece o conteúdo clínico pelo texto (número com unidade de medicamento, "dose", "posologia", "contraindicação"...);
--     na dúvida, pede a revisão (errar para pedir revisão custa pouco; errar para soltar sem revisão, muito);
--   * versão com conteúdo clínico fica TRAVADA para download (tela, rota do servidor e comando do administrador) até um revisor médico
--     cadastrado na área da especialidade do material registrar a revisão (quem, quando, o que conferiu);
--   * cada edição é uma versão nova e pede a revisão de novo; versão repetida sem mudança mantém a revisão.
-- A equipe continua criando e gerando normalmente; só o download fica travado. Material sem conteúdo clínico não muda nada.
-- Partes: app_ch_visual_list, app_ch_visual_material, app_ch_visual_file e ch_worker_visual_files (todas de 5100, nunca redefinidas depois).

alter table public.ch_visual_versions add column if not exists medical_review_by uuid references auth.users (id) on delete set null;
alter table public.ch_visual_versions add column if not exists medical_review_at timestamptz;
alter table public.ch_visual_versions add column if not exists medical_review_note text check (medical_review_note is null or char_length(medical_review_note) <= 500);

-- Todo o texto do conteúdo (os campos do formulário), numa string só.
create or replace function public.ch_visual_text(p_content jsonb) returns text
  language sql immutable set search_path = ''
as $$
  select coalesce(string_agg(v #>> '{}', ' '), '') from jsonb_path_query(coalesce(p_content, '{}'::jsonb), 'lax $.**') v where jsonb_typeof(v) = 'string'
$$;

-- Tem conteúdo clínico (dose, medicamento, contraindicação)? Pelo texto, sem acento nem caixa.
create or replace function public.ch_visual_is_clinical(p_content jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select lower(public.ch_visual_text(p_content)) ~ '[0-9]([.,][0-9]+)?\s*(mg|mcg|µg|ug|g|ml|ui|meq|mmol|gotas?|comprimidos?|cp|ampolas?|gtt)\M'
      or lower(public.ch_visual_text(p_content)) ~ '\m(mg|mcg|ui|ml|g)/(kg|dia|h|hora|dl|ml|min)\M'
      or public.fold_text(public.ch_visual_text(p_content)) ~ '\m(doses?|dosagem|dosagens|posologia|contra-?indica[a-z]*|contra indica[a-z]*)\M'
$$;

-- Área do revisor para a especialidade do material (nulo = especialidade "outra": qualquer revisor médico serve).
create or replace function public.ch_visual_area_code(p_key text) returns text
  language sql immutable set search_path = ''
as $$
  select case p_key when 'ginecologia' then 'GINECOLOGIA_OBSTETRICIA' when 'pediatria' then 'PEDIATRIA' when 'clinica_medica' then 'CLINICA_MEDICA'
                    when 'cirurgia' then 'CIRURGIA' when 'preventiva_mfc' then 'MFC' else null end
$$;

-- Aguardando revisão médica: tem conteúdo clínico e ninguém revisou esta versão.
create or replace function public.ch_visual_review_pending(p_version_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.ch_visual_is_clinical(v.content) and v.medical_review_at is null from public.ch_visual_versions v where v.id = p_version_id), false)
$$;

create or replace function public.ch_visual_can_review(p_key text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    (public.ch_visual_area_code(p_key) is not null and public.ch_is_reviewer(public.ch_visual_area_code(p_key)))
    or (public.ch_visual_area_code(p_key) is null and public.ch_is_reviewer()))
$$;
revoke execute on function public.ch_visual_text(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_visual_is_clinical(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_visual_area_code(text) from public, anon, authenticated;
revoke execute on function public.ch_visual_review_pending(uuid) from public, anon, authenticated;
revoke execute on function public.ch_visual_can_review(text) from public, anon, authenticated;

-- Registrar a revisão médica de uma versão (revisor cadastrado na área da especialidade do material).
create or replace function public.app_ch_visual_review(p_version_id uuid, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v record;
begin
  perform public.assert_staff();
  select vv.id, vv.material_id, vv.version, vv.content, vv.specialty_key, vv.medical_review_at into v from public.ch_visual_versions vv where vv.id = p_version_id for update;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_visual_is_clinical(v.content) then
    raise exception 'Este material não tem dose nem contraindicação: não precisa de revisão médica.' using errcode = '22023';
  end if;
  if not public.ch_visual_can_review(v.specialty_key) then
    raise exception 'A revisão médica deste material é de um revisor médico cadastrado na área (%).', coalesce(public.ch_visual_area_code(v.specialty_key), 'qualquer área') using errcode = '42501';
  end if;
  update public.ch_visual_versions set medical_review_by = (select auth.uid()), medical_review_at = now(), medical_review_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_version_id;
  insert into public.ch_audit (actor_id, action, target, details)
  values ((select auth.uid()), 'visual.medical_review', v.material_id::text, jsonb_build_object('version', v.version, 'version_id', v.id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  return jsonb_build_object('version_id', v.id, 'reviewed', true);
end
$$;

-- Lista (parte de 5100): + sinal de revisão médica pendente na versão atual.
create or replace function public.app_ch_visual_list(p_filters jsonb default '{}'::jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_model text := nullif(p_filters ->> 'model', '');
  v_key text := nullif(p_filters ->> 'specialty_key', '');
  v_status text := nullif(p_filters ->> 'status', '');
  v_q text := nullif(btrim(coalesce(p_filters ->> 'q', '')), '');
begin
  perform public.assert_staff();
  return coalesce((
    select jsonb_agg(item order by (item ->> 'updated_at') desc)
    from (
      select jsonb_build_object('id', m.id, 'model', m.model, 'specialty_key', m.specialty_key, 'specialty_label', m.specialty_label, 'title', m.title,
               'card_id', m.card_id, 'batch_label', m.batch_label, 'batch_order', m.batch_order, 'current_version', m.current_version,
               'status', v.render_status, 'render_error', v.render_error, 'rendered_at', v.rendered_at, 'created_at', m.created_at, 'updated_at', m.updated_at,
               'created_by_name', public.ch_visual_person(m.created_by), 'updated_by_name', public.ch_visual_person(m.updated_by),
               'files', (select count(*)::int from public.ch_visual_files fl where fl.version_id = v.id), 'duplicated_from', m.duplicated_from,
               'review_pending', public.ch_visual_review_pending(v.id)) as item
      from public.ch_visual_materials m
      join public.ch_visual_versions v on v.material_id = m.id and v.version = m.current_version
      where (v_model is null or m.model = v_model)
        and (v_key is null or m.specialty_key = v_key)
        and (v_status is null or v.render_status = v_status)
        and (v_q is null or m.title ilike '%' || v_q || '%' or m.card_id ilike '%' || v_q || '%' or m.specialty_label ilike '%' || v_q || '%')
      order by m.updated_at desc
      limit 300
    ) x), '[]'::jsonb);
end
$$;

-- Página do material (parte de 5100): + a revisão médica de cada versão (precisa? foi feita? por quem? posso fazer?).
create or replace function public.app_ch_visual_material(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.assert_staff();
  select to_jsonb(m) || jsonb_build_object(
           'created_by_name', public.ch_visual_person(m.created_by),
           'updated_by_name', public.ch_visual_person(m.updated_by),
           'versions', coalesce((
             select jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'content', v.content, 'content_hash', v.content_hash,
                      'specialty_key', v.specialty_key, 'specialty_label', v.specialty_label, 'note', v.note, 'created_at', v.created_at,
                      'created_by_name', public.ch_visual_person(v.created_by), 'render_status', v.render_status, 'render_error', v.render_error,
                      'rendered_at', v.rendered_at, 'template_version', v.template_version, 'check_result', v.check_result,
                      'medical_review', jsonb_build_object('required', public.ch_visual_is_clinical(v.content), 'done', v.medical_review_at is not null,
                                          'at', v.medical_review_at, 'by_name', case when v.medical_review_at is null then null else public.ch_visual_person(v.medical_review_by) end,
                                          'note', v.medical_review_note, 'area', public.ch_visual_area_code(v.specialty_key), 'can_review', public.ch_visual_can_review(v.specialty_key)),
                      'job', (select jsonb_build_object('status', j.status, 'attempts', j.attempts, 'error', j.error, 'run_after', j.run_after, 'created_at', j.created_at)
                              from public.ch_jobs j where j.scope_key = 'visual:' || v.id::text order by j.created_at desc limit 1),
                      'files', coalesce((select jsonb_agg(jsonb_build_object('id', fl.id, 'format', fl.format, 'side', fl.side, 'pages', fl.pages, 'width', fl.width,
                                           'height', fl.height, 'bytes', fl.bytes, 'card_id', fl.card_id, 'specialty_key', fl.specialty_key,
                                           'batch_order', fl.batch_order, 'template_version', fl.template_version, 'created_at', fl.created_at)
                                         order by fl.format, fl.side)
                                         from public.ch_visual_files fl where fl.version_id = v.id), '[]'::jsonb))
                    order by v.version desc)
             from public.ch_visual_versions v where v.material_id = m.id), '[]'::jsonb))
    into r
  from public.ch_visual_materials m where m.id = p_id;
  if r is null then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  return r;
end
$$;

-- Arquivo para baixar (parte de 5100): recusa a versão com dose ou contraindicação que ainda não teve revisão médica.
create or replace function public.app_ch_visual_file(p_file_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.assert_staff();
  select jsonb_build_object('storage_path', fl.storage_path, 'format', fl.format, 'side', fl.side, 'pages', fl.pages, 'card_id', fl.card_id,
                            'model', m.model, 'title', m.title, 'version', v.version, 'specialty_key', fl.specialty_key, 'render_status', v.render_status)
    into r
  from public.ch_visual_files fl join public.ch_visual_versions v on v.id = fl.version_id join public.ch_visual_materials m on m.id = v.material_id
  where fl.id = p_file_id;
  if r is null then raise exception 'Arquivo não encontrado.' using errcode = 'P0002'; end if;
  if public.ch_visual_review_pending((select fl.version_id from public.ch_visual_files fl where fl.id = p_file_id)) then
    raise exception 'Este material tem dose ou contraindicação e ainda não passou pela revisão médica da área: o download fica travado até lá.' using errcode = '55000';
  end if;
  return r;
end
$$;

-- Arquivos de uma versão para o comando do administrador (parte de 5100): sem os arquivos enquanto a revisão médica estiver pendente.
create or replace function public.ch_worker_visual_files(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('version', v.version, 'model', m.model, 'card_id', m.card_id, 'title', m.title, 'render_status', v.render_status,
           'render_error', v.render_error, 'check_result', v.check_result, 'review_pending', public.ch_visual_review_pending(v.id),
           'files', case when public.ch_visual_review_pending(v.id) then '[]'::jsonb else
             coalesce((select jsonb_agg(jsonb_build_object('format', f.format, 'side', f.side, 'pages', f.pages, 'storage_path', f.storage_path,
                                'card_id', f.card_id, 'specialty_key', f.specialty_key, 'batch_order', f.batch_order) order by f.format, f.side)
                              from public.ch_visual_files f where f.version_id = v.id), '[]'::jsonb) end)
  from public.ch_visual_versions v join public.ch_visual_materials m on m.id = v.material_id
  where v.id = p_version_id
$$;

-- ---------------------------------------------------------------- 99. Permissões
revoke execute on function public.app_ch_visual_review(uuid, text) from public, anon;
revoke execute on function public.app_ch_visual_list(jsonb) from public, anon;
revoke execute on function public.app_ch_visual_material(uuid) from public, anon;
revoke execute on function public.app_ch_visual_file(uuid) from public, anon;
revoke execute on function public.ch_worker_visual_files(uuid) from public, anon, authenticated;
grant execute on function public.app_ch_visual_review(uuid, text) to authenticated;
grant execute on function public.app_ch_visual_list(jsonb) to authenticated;
grant execute on function public.app_ch_visual_material(uuid) to authenticated;
grant execute on function public.app_ch_visual_file(uuid) to authenticated;
