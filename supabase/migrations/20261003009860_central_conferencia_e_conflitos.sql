-- Central de Conteúdo, Unidades e Detalhe: quem confere dose e contraindicação (CC12) e conflito decidido que destrava a publicação (CC13).
-- Fase 1 do gerenciamento (grupo B), 12/10/2026. Pode ser colada duas ou três vezes (create or replace, add column if not exists).
--
-- CC12 - Hoje qualquer pessoa da equipe confirma a "conferência humana" de uma afirmação crítica (dose, via, frequência, contraindicação...).
--   Agora só um revisor médico cadastrado na área da afirmação (a área do tema da afirmação, do trecho de onde ela veio ou da unidade que
--   a usa). Afirmação sem área definida não pode ser conferida: primeiro se classifica o trecho ou a unidade.
-- CC13 - Hoje decidir um conflito (aba Conflitos) não muda a afirmação, e uma evidência ligada errado não tem como ser corrigida: a
--   unidade continua com "Afirmação pendente" e "Conflito não resolvido" para sempre. Agora:
--     * conflito decidido por um administrador a favor da fonte que sustenta deixa de bloquear (a fonte que perdeu fica de lado, e a evidência
--       dela continua guardada); decidido a favor da fonte que discorda continua bloqueando (o texto da afirmação precisa mudar);
--     * "Descartar evidência" (equipe, com motivo; evidência de conflito ou de desatualização só o administrador) tira a evidência ligada
--       errado do cálculo, sem apagá-la, e registra no histórico da afirmação.
--   A situação da afirmação passa a ser calculada por uma função só (ch_claim_recompute_status), e a trava de publicação enxerga a decisão
--   mesmo que o processamento automático recalcule a situação depois.
-- Partes: app_ch_confirm_critical (1400:960), app_ch_link_evidence (1400:903), ch_publish_problems_base (1400:1072, renomeada em 1500:522),
-- app_ch_conflict_decide (2900:325). Nenhuma delas foi redefinida depois.

-- ---------------------------------------------------------------- evidência descartada
alter table public.ch_evidence add column if not exists discarded_at timestamptz;
alter table public.ch_evidence add column if not exists discarded_by uuid references auth.users (id) on delete set null;
alter table public.ch_evidence add column if not exists discard_reason text;

-- ---------------------------------------------------------------- áreas de uma afirmação
create or replace function public.ch_node_area_code(p_node_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select n.* from public.ch_taxonomy_nodes n where n.id = p_node_id
    union all
    select p.* from public.ch_taxonomy_nodes p join up on up.parent_id = p.id)
  select code from up where level = 'area' limit 1
$$;

-- Áreas (códigos editoriais) a que a afirmação pertence: tema dela, trechos de onde veio e unidades que a usam.
create or replace function public.ch_claim_area_codes(p_claim_id uuid) returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct x.a order by x.a) filter (where x.a is not null), '{}')
  from (
    select public.ch_node_area_code(c.theme_node_id) a from public.ch_claims c where c.id = p_claim_id
    union
    select public.ch_node_area_code(bn.node_id) from public.ch_claims c join public.ch_block_nodes bn on bn.block_id = c.block_id where c.id = p_claim_id
    union
    select public.ch_unit_area_code(uc.unit_version_id) from public.ch_unit_claims uc where uc.claim_id = p_claim_id
  ) x
$$;
revoke execute on function public.ch_node_area_code(uuid) from public, anon, authenticated;
revoke execute on function public.ch_claim_area_codes(uuid) from public, anon, authenticated;

-- A tela pergunta se a pessoa pode confirmar (e de qual área é a conferência) antes de mostrar o botão.
create or replace function public.app_ch_claim_can_confirm(p_claim_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_areas text[];
begin
  perform public.ch_assert_staff();
  v_areas := public.ch_claim_area_codes(p_claim_id);
  return jsonb_build_object('areas', to_jsonb(v_areas),
    'can', exists (select 1 from public.ch_reviewer_areas r where r.user_id = (select auth.uid()) and r.area_code = any (v_areas)));
end
$$;

-- ---------------------------------------------------------------- CC12: conferência de dose só pelo revisor da área
create or replace function public.app_ch_confirm_critical(p_claim_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_areas text[];
begin
  perform public.ch_assert_staff();
  if not exists (select 1 from public.ch_claims where id = p_claim_id) then raise exception 'Afirmação não encontrada.' using errcode = 'P0002'; end if;
  v_areas := public.ch_claim_area_codes(p_claim_id);
  if cardinality(v_areas) = 0 then
    raise exception 'Esta afirmação ainda não tem área definida: classifique o trecho ou a unidade antes de conferir dose, via, frequência ou contraindicação.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ch_reviewer_areas r where r.user_id = (select auth.uid()) and r.area_code = any (v_areas)) then
    raise exception 'A conferência de dose, via, frequência e contraindicação é de um revisor médico cadastrado na área (%).', array_to_string(v_areas, ', ') using errcode = '42501';
  end if;
  if not exists (select 1 from public.ch_evidence e where e.claim_id = p_claim_id and e.verdict = 'compatible' and public.ch_evidence_counts(e.id) and (e.numeric_check ->> 'ok')::boolean) then
    raise exception 'Confirme só depois de haver evidência compatível e conferida.' using errcode = '22023';
  end if;
  update public.ch_claims set critical_checked_by = (select auth.uid()), critical_checked_at = now() where id = p_claim_id;
  insert into public.ch_claim_history (claim_id, actor_id, event) values (p_claim_id, (select auth.uid()), 'critical_confirmed');
  return true;
end
$$;

-- ---------------------------------------------------------------- CC13: conflito decidido e evidência descartada
-- Evidência de conflito ou de desatualização "assentada": um administrador decidiu o conflito a favor da OUTRA fonte.
create or replace function public.ch_evidence_settled(p_evidence_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ch_evidence e join public.ch_conflicts k on k.claim_id = e.claim_id and k.status = 'resolved'
    where e.id = p_evidence_id and e.verdict in ('conflicting', 'outdated')
      and e.source_id in (k.source_a, k.source_b) and k.chosen_source is distinct from e.source_id)
$$;

-- Evidência que ainda conta: não é de fonte substituída, não foi descartada e o conflito dela não foi decidido contra ela.
create or replace function public.ch_evidence_counts(p_evidence_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.ch_evidence e where e.id = p_evidence_id and not e.stale and e.discarded_at is null)
     and not public.ch_evidence_settled(p_evidence_id)
$$;

-- O pior veredito entre as evidências que ainda contam (nulo quando nenhuma conta).
create or replace function public.ch_claim_effective_status(p_claim_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case when bool_or(e.verdict = 'conflicting') then 'conflicting' when bool_or(e.verdict = 'outdated') then 'outdated'
              when bool_or(e.verdict = 'context_dependent') then 'context_dependent' when bool_or(e.verdict = 'insufficient') then 'insufficient'
              else 'compatible' end
  from public.ch_evidence e where e.claim_id = p_claim_id and public.ch_evidence_counts(e.id)
  having count(*) > 0
$$;

create or replace function public.ch_claim_recompute_status(p_claim_id uuid) returns text
  language plpgsql security definer set search_path = ''
as $$
declare v text := public.ch_claim_effective_status(p_claim_id);
begin
  update public.ch_claims set status = coalesce(v, case when status in ('conflicting', 'outdated', 'insufficient', 'context_dependent', 'compatible') then 'extracted' else status end)
   where id = p_claim_id;
  return (select status from public.ch_claims where id = p_claim_id);
end
$$;
revoke execute on function public.ch_evidence_settled(uuid) from public, anon, authenticated;
revoke execute on function public.ch_evidence_counts(uuid) from public, anon, authenticated;
revoke execute on function public.ch_claim_effective_status(uuid) from public, anon, authenticated;
revoke execute on function public.ch_claim_recompute_status(uuid) from public, anon, authenticated;

-- Vincular evidência (parte de 1400:903): igual, mas a situação da afirmação vem do cálculo único.
create or replace function public.app_ch_link_evidence(p_claim_id uuid, p_evidence jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_claims;
  s public.ch_sources;
  v_quote text := btrim(coalesce(p_evidence ->> 'quote', ''));
  v_verdict text := coalesce(p_evidence ->> 'verdict', '');
  v_text text;
  v_claim_nums text[]; v_ev_nums text[]; v_missing text[]; v_neg_claim text[]; v_neg_ev text[]; v_neg_missing text[];
  v_check jsonb;
  v_id uuid;
begin
  perform public.ch_assert_staff();
  select * into c from public.ch_claims where id = p_claim_id;
  if not found then raise exception 'Afirmação não encontrada.' using errcode = 'P0002'; end if;
  select * into s from public.ch_sources where id = (p_evidence ->> 'source_id')::uuid;
  if not found then raise exception 'Fonte não cadastrada.' using errcode = 'P0002'; end if;
  if v_quote = '' then raise exception 'A evidência precisa do trecho citado da fonte.' using errcode = '22023'; end if;
  if v_verdict not in ('compatible', 'outdated', 'conflicting', 'insufficient', 'context_dependent') then raise exception 'Conferência inválida.' using errcode = '22023'; end if;
  if s.kind = 'society_guideline' and not s.editorial_approved then raise exception 'Diretriz de sociedade só vale como evidência com aprovação editorial.' using errcode = '22023'; end if;
  if s.status <> 'current' and v_verdict = 'compatible' then raise exception 'Fonte substituída ou retirada não sustenta uma afirmação atual.' using errcode = '22023'; end if;
  if s.kind in ('preliminary', 'public_consultation') and v_verdict = 'compatible' then raise exception 'Consulta pública ou relatório preliminar não sustenta conduta: use o documento final.' using errcode = '22023'; end if;
  if nullif(p_evidence ->> 'passage_id', '') is not null
     and not exists (select 1 from public.ch_source_passages p where p.id = (p_evidence ->> 'passage_id')::uuid and p.source_id = s.id) then
    raise exception 'O trecho informado não pertence a essa fonte.' using errcode = '22023';
  end if;

  v_text := coalesce(c.proposed_text, c.statement);
  v_claim_nums := public.ch_numbers(v_text);
  v_ev_nums := public.ch_numbers(v_quote);
  select coalesce(array_agg(n), '{}') into v_missing from unnest(v_claim_nums) n where not (n = any (v_ev_nums));
  v_neg_claim := public.ch_negations(v_text);
  v_neg_ev := public.ch_negations(v_quote);
  select coalesce(array_agg(n), '{}') into v_neg_missing from unnest(v_neg_claim) n where not (n = any (v_neg_ev));
  v_check := jsonb_build_object('claim_numbers', v_claim_nums, 'evidence_numbers', v_ev_nums, 'missing_in_evidence', v_missing,
                                'claim_negations', v_neg_claim, 'negations_missing_in_evidence', v_neg_missing,
                                'ok', cardinality(v_missing) = 0 and cardinality(v_neg_missing) = 0);
  if v_verdict = 'compatible' and not (v_check ->> 'ok')::boolean then
    raise exception 'O texto traz valores ou negações que não constam do trecho citado: % %', v_missing, v_neg_missing using errcode = '22023';
  end if;

  insert into public.ch_evidence (claim_id, source_id, passage_id, section, page, source_version, quote, verdict, numeric_check, checked_by)
  values (p_claim_id, s.id, nullif(p_evidence ->> 'passage_id', '')::uuid, p_evidence ->> 'section', nullif(p_evidence ->> 'page', '')::int, s.version, v_quote, v_verdict, v_check, (select auth.uid()))
  returning id into v_id;
  -- situação da afirmação: o pior veredito entre as evidências que ainda contam (conflito > desatualizada > depende de contexto > insuficiente > compatível)
  perform public.ch_claim_recompute_status(p_claim_id);
  insert into public.ch_claim_history (claim_id, actor_id, event, details) values (p_claim_id, (select auth.uid()), 'evidence', jsonb_build_object('evidence_id', v_id, 'verdict', v_verdict, 'numeric_ok', v_check -> 'ok'));
  return jsonb_build_object('id', v_id, 'numeric_check', v_check, 'claim_status', (select status from public.ch_claims where id = p_claim_id));
end
$$;

-- Descartar uma evidência ligada errado (a equipe, com motivo). Evidência que aponta conflito ou desatualização só o administrador descarta.
-- Nada é apagado: a evidência fica guardada com quem descartou, quando e por quê, e sai do cálculo da afirmação (e de todo o sistema).
create or replace function public.app_ch_discard_evidence(p_evidence_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  e public.ch_evidence;
  v_status text;
begin
  perform public.ch_assert_staff();
  select * into e from public.ch_evidence where id = p_evidence_id for update;
  if not found then raise exception 'Evidência não encontrada.' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Registre o motivo do descarte (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if e.discarded_at is not null then raise exception 'Esta evidência já foi descartada.' using errcode = '22023'; end if;
  if e.verdict in ('conflicting', 'outdated') and not public.is_admin() then
    raise exception 'Descartar evidência de conflito ou de desatualização é decisão de um administrador.' using errcode = '42501';
  end if;
  -- stale = true: o resto do sistema (confiança, perguntas, atualizações) também deixa de contar esta evidência
  update public.ch_evidence set discarded_at = now(), discarded_by = (select auth.uid()), discard_reason = btrim(p_reason), stale = true where id = p_evidence_id;
  v_status := public.ch_claim_recompute_status(e.claim_id);
  insert into public.ch_claim_history (claim_id, actor_id, event, details)
  values (e.claim_id, (select auth.uid()), 'evidence_discarded', jsonb_build_object('evidence_id', e.id, 'verdict', e.verdict, 'reason', btrim(p_reason)));
  perform public.ch_log('evidence.discard', e.id::text, jsonb_build_object('claim', e.claim_id, 'reason', btrim(p_reason)));
  return jsonb_build_object('claim_status', v_status);
end
$$;

-- Evidências de uma afirmação com o que a tela precisa para corrigir (a lista comum não traz o número da evidência).
create or replace function public.app_ch_claim_evidence(p_claim_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'source', s.title, 'organ', s.organ, 'version', e.source_version, 'page', e.page,
           'quote', e.quote, 'verdict', e.verdict, 'stale', e.stale, 'discarded', e.discarded_at is not null, 'discard_reason', e.discard_reason,
           'settled', public.ch_evidence_settled(e.id)) order by e.created_at)
         from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = p_claim_id), '[]'::jsonb);
end
$$;

-- Decidir conflito (parte de 2900:325): igual, e a afirmação é recalculada na hora (o conflito decidido deixa de bloquear a publicação).
create or replace function public.app_ch_conflict_decide(p_conflict_id uuid, p_status text, p_chosen_source uuid, p_note text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare k public.ch_conflicts;
begin
  perform public.assert_admin();
  select * into k from public.ch_conflicts where id = p_conflict_id for update;
  if not found then raise exception 'Conflito não encontrado.' using errcode = 'P0002'; end if;
  if p_status not in ('resolved', 'deferred', 'open') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if p_status <> 'open' and char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Registre o motivo da decisão (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_status = 'resolved' and p_chosen_source is distinct from k.source_a and p_chosen_source is distinct from k.source_b then
    raise exception 'Escolha uma das duas fontes do conflito.' using errcode = '22023';
  end if;
  update public.ch_conflicts set status = p_status, chosen_source = case when p_status = 'resolved' then p_chosen_source end, resolution = nullif(btrim(p_note), ''),
         decided_by = (select auth.uid()), decided_at = now() where id = p_conflict_id;
  perform public.ch_claim_recompute_status(k.claim_id);
  insert into public.ch_claim_history (claim_id, actor_id, event, details)
  values (k.claim_id, (select auth.uid()), 'conflict_' || p_status, jsonb_build_object('conflict_id', p_conflict_id, 'chosen', p_chosen_source));
  perform public.ch_log('conflict.' || p_status, p_conflict_id::text, jsonb_build_object('claim', k.claim_id, 'chosen', p_chosen_source, 'note', btrim(p_note)));
  return true;
end
$$;

-- Trava de publicação, parte de base (parte de 1400:1072): as mesmas regras, mas a evidência de conflito decidido a favor da outra fonte,
-- a descartada e a de fonte substituída não contam; a "Afirmação pendente (conflito/desatualizada)" olha só o que ainda conta.
create or replace function public.ch_publish_problems_base(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  p text[] := '{}';
  r record;
  v_area text := public.ch_unit_area_code(p_version_id);
  v_status text;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then return array['Versão não encontrada.']; end if;
  if v.content_hash <> public.ch_hash(v.content) then p := array_append(p, 'O conteúdo não confere com o hash registrado.'); end if;
  if not exists (select 1 from public.ch_unit_claims where unit_version_id = p_version_id) then p := array_append(p, 'A unidade não tem nenhuma afirmação clínica vinculada.'); end if;
  -- parágrafos clínicos precisam citar afirmações
  if exists (select 1 from jsonb_path_query(v.content, 'lax $.sections[*].paragraphs[*]') para
             where coalesce((para ->> 'clinical')::boolean, false) and coalesce(jsonb_array_length(para -> 'claim_ids'), 0) = 0) then
    p := array_append(p, 'Há parágrafo clínico sem afirmação vinculada.');
  end if;
  for r in select c.* from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = p_version_id loop
    if not exists (select 1 from public.ch_evidence e where e.claim_id = r.id and e.verdict = 'compatible' and public.ch_evidence_counts(e.id)) then
      p := array_append(p, ('Afirmação sem evidência compatível: ' || left(r.statement, 80)));
    end if;
    v_status := case when r.status in ('conflicting', 'outdated') then coalesce(public.ch_claim_effective_status(r.id), r.status) else r.status end;
    if v_status in ('conflicting', 'outdated', 'insufficient', 'context_dependent', 'needs_review', 'extracted') then
      p := array_append(p, ('Afirmação pendente (' || v_status || '): ' || left(r.statement, 80)));
    end if;
    if exists (select 1 from public.ch_evidence e where e.claim_id = r.id and e.verdict = 'conflicting' and public.ch_evidence_counts(e.id)) then
      p := array_append(p, ('Conflito entre referências não resolvido: ' || left(r.statement, 80)));
    end if;
    if cardinality(r.critical_kinds) > 0 and r.critical_checked_by is null then
      p := array_append(p, ('Afirmação crítica (' || array_to_string(r.critical_kinds, ', ') || ') sem conferência humana: ' || left(r.statement, 80)));
    end if;
    if r.block_id is not null and exists (select 1 from public.ch_blocks b where b.id = r.block_id and b.status in ('pending', 'illegible')) then
      p := array_append(p, ('Afirmação vinda de trecho ilegível/pendente: ' || left(r.statement, 80)));
    end if;
    if r.block_id is not null and exists (select 1 from public.ch_blocks b where b.id = r.block_id and b.flags @> '[{"code":"doubtful_ocr_critical"}]'::jsonb) then
      p := array_append(p, ('OCR duvidoso em informação crítica: ' || left(r.statement, 80)));
    end if;
    if v.origin = 'adaptation' and exists (select 1 from public.ch_documents d where d.id = r.document_id and d.rights_status not in ('own', 'licensed_adaptation')) then
      p := array_append(p, ('Adaptação bloqueada: o documento de origem não tem autorização de uso (' || (select d.rights_status from public.ch_documents d where d.id = r.document_id) || ').'));
    end if;
  end loop;
  -- materiais: mesma base, sem alteração
  for r in select * from public.ch_materials m where m.unit_version_id = p_version_id loop
    if r.content_hash <> public.ch_hash(r.content) then p := array_append(p, ('O material "' || r.kind || '" foi alterado depois de gerado.')); end if;
  end loop;
  -- aprovações válidas para este hash
  if not exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash and a.area_code = v_area) then
    p := array_append(p, 'Falta a aprovação médica de um revisor da área (' || coalesce(v_area, '?') || ') para esta versão exata.');
  end if;
  if not exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'editorial' and a.invalidated_at is null and a.content_hash = v.content_hash) then
    p := array_append(p, 'Falta a aprovação editorial para esta versão exata.');
  end if;
  return p;
end
$$;
revoke execute on function public.ch_publish_problems_base(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 99. Permissões
revoke execute on function public.app_ch_claim_can_confirm(uuid) from public, anon;
revoke execute on function public.app_ch_confirm_critical(uuid) from public, anon;
revoke execute on function public.app_ch_link_evidence(uuid, jsonb) from public, anon;
revoke execute on function public.app_ch_claim_evidence(uuid) from public, anon;
revoke execute on function public.app_ch_discard_evidence(uuid, text) from public, anon;
revoke execute on function public.app_ch_conflict_decide(uuid, text, uuid, text) from public, anon;
grant execute on function public.app_ch_claim_can_confirm(uuid) to authenticated;
grant execute on function public.app_ch_confirm_critical(uuid) to authenticated;
grant execute on function public.app_ch_link_evidence(uuid, jsonb) to authenticated;
grant execute on function public.app_ch_claim_evidence(uuid) to authenticated;
grant execute on function public.app_ch_discard_evidence(uuid, text) to authenticated;
grant execute on function public.app_ch_conflict_decide(uuid, text, uuid, text) to authenticated;
