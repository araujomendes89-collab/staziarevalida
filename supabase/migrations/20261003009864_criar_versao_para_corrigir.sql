-- Central de Conteúdo, Unidades: "Criar versão para corrigir" (CC02, fecha o ciclo corrigir depois de publicado).
-- Fase 1 do gerenciamento (grupo B), 12/10/2026. Pode ser colada duas ou três vezes.
--
-- Hoje a versão publicada não se edita ("crie uma nova versão") e não existe botão para criar a nova. Agora a equipe cria, a partir da
-- versão no ar, um RASCUNHO com o mesmo texto, as mesmas afirmações e os mesmos materiais; corrige, gera os materiais de novo, passa
-- pela revisão médica da área e pela editorial, e o administrador publica: a mesma aula do aluno é atualizada (progresso mantido).
-- Enquanto isso a versão no ar continua. Se já existe um rascunho nascido desta versão, é ele que volta (nunca cria dois).
-- Mesma cópia que o sistema já faz quando uma fonte oficial muda (ch_flag_dependents, 1400:780).

create or replace function public.app_ch_new_version(p_from_version_id uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.ch_unit_versions;
  v_new uuid;
  r2 record;
begin
  perform public.ch_assert_staff();
  select * into s from public.ch_unit_versions where id = p_from_version_id for update;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if s.status not in ('published', 'needs_update') then raise exception 'Só uma versão no ar ganha versão para corrigir.' using errcode = '22023'; end if;
  select c.id into v_new from public.ch_unit_versions c
   where c.candidate_of = s.id and c.status in ('draft', 'awaiting_review', 'approved') order by c.version desc limit 1;
  if v_new is not null then return v_new; end if;
  insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash, scope_note, candidate_of, candidate_reason)
  values (s.unit_id, (select max(version) + 1 from public.ch_unit_versions where unit_id = s.unit_id), s.origin, 'draft', s.content, s.content_hash, s.scope_note, s.id,
          'Correção da versão ' || s.version)
  returning id into v_new;
  insert into public.ch_unit_claims select v_new, claim_id from public.ch_unit_claims where unit_version_id = s.id;
  for r2 in select * from public.ch_materials where unit_version_id = s.id loop
    insert into public.ch_materials (unit_version_id, kind, content, content_hash, claim_ids, generated_by_model, template_version)
    values (v_new, r2.kind, r2.content, r2.content_hash, r2.claim_ids, r2.generated_by_model, r2.template_version);
  end loop;
  perform public.ch_log('unit.new_version', v_new::text, jsonb_build_object('from', s.id));
  return v_new;
end
$$;

revoke execute on function public.app_ch_new_version(uuid) from public, anon;
grant execute on function public.app_ch_new_version(uuid) to authenticated;
