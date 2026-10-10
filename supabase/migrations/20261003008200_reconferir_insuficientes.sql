-- CC01 (2026-10-10, revista na rodada de correção 1): afirmação "insuficiente" que só a IA julgou volta a ser conferida.
-- "Só a IA julgou" quer dizer:
--   - sem nenhuma evidência vigente (nenhuma fonte cadastrada tinha trecho sobre ela); ou
--   - com evidência vigente só "insuficiente" dada pelo processamento. A busca por palavras acha trecho por termos comuns
--     ("pacientes", "tratamento"), e a IA, obrigada a escolher um trecho da lista, julga "insuficiente" contra um trecho de outro
--     assunto. Sem isso, a afirmação ficava presa mesmo depois que a fonte certa entrasse na biblioteca.
-- A afirmação com evidência dada por uma pessoa da equipe, ou com outro veredito, fica como está.
-- Ela é conferida de novo:
--   - quando é indexada uma fonte nova que entra na busca de evidências (etapa source_index chama ch_worker_recheck_insufficient);
--     consulta pública, relatório preliminar, diretriz de sociedade sem aprovação editorial e fonte substituída não disparam nada;
--   - quando a equipe manda reprocessar a conferência.
-- Na reconferência, a resposta nova da IA substitui a evidência "insuficiente" antiga dela (a antiga fica registrada no histórico
-- da afirmação); a mesma resposta de antes não grava nada.
-- Reconferência automática: a etapa de evidências roda sem mudar a situação do documento e só segue para o rascunho quando
-- alguma afirmação passa a ser compatível (marca "auto_recheck" no checkpoint do trabalho; "Reprocessar" apaga a marca). A marca
-- passa de etapa em etapa (ch_worker_next_marked): o rascunho só olha os temas dessas afirmações; tema que já tem unidade não
-- ganha versão nova sozinho, só um aviso na versão mais nova (ch_worker_theme_notice); materiais, arquivos e revisão automática
-- só rodam nas versões que o rascunho criou.
-- Rascunho: nunca grava apontamentos em versão fora do rascunho e não cria versão nova com o texto antigo da IA quando a mesma
-- base (mesmas afirmações compatíveis, mesmo texto, mesmo modelo) já virou versão da unidade, mesmo que a equipe tenha editado o
-- texto dela (coluna base_hash).
-- As funções redefinidas partem das versões mais novas (ch_worker_claims da 7600; ch_worker_mark_claim, ch_worker_link_evidence e
-- ch_worker_save_draft da 1500) e continuam só do servidor. Pode ser rodada mais de uma vez.

-- De que base (afirmações compatíveis, texto, modelo e versão do prompt) o processamento escreveu a versão. Edição da equipe não
-- muda este campo.
alter table public.ch_unit_versions add column if not exists base_hash text;

-- A afirmação só tem evidência vigente "insuficiente" dada pelo processamento (ou nenhuma evidência vigente).
create or replace function public.ch_claim_recheckable(p_claim_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.ch_evidence e
                     where e.claim_id = p_claim_id and not e.stale
                       and not (e.verdict = 'insufficient' and e.checked_by is null and coalesce(e.numeric_check ->> 'by', '') = 'worker'))
$$;

-- Afirmações do documento, agora com quantas evidências vigentes cada uma tem e se ela entra na reconferência.
create or replace function public.ch_worker_claims(p_document_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
           'critical_kinds', c.critical_kinds, 'context', c.context, 'theme_node_id', c.theme_node_id, 'block_id', c.block_id,
           'created_by_model', c.created_by_model,
           'evidence_count', (select count(*)::int from public.ch_evidence e where e.claim_id = c.id and not e.stale),
           'recheckable', c.status = 'insufficient' and public.ch_claim_recheckable(c.id)) order by c.created_at), '[]'::jsonb)
  from public.ch_claims c where c.document_id = p_document_id
$$;

-- Anotação do processamento numa afirmação. A "insuficiente" que só a IA julgou também muda de situação quando é conferida de
-- novo (por exemplo, vai para revisão humana se a evidência proposta for recusada); as demais regras ficam iguais.
create or replace function public.ch_worker_mark_claim(p_claim_id uuid, p_status text, p_note text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_claims c set status = p_status
   where c.id = p_claim_id
     and (c.status in ('extracted', 'evidence_linked') or (c.status = 'insufficient' and public.ch_claim_recheckable(c.id)));
  insert into public.ch_claim_history (claim_id, event, details) values (p_claim_id, 'worker_note', jsonb_build_object('status', p_status, 'note', p_note));
end
$$;

-- Evidência proposta pela IA: a mesma conferência numérica de app_ch_link_evidence; se o modelo disse "compatível" mas os
-- números/negações não batem, grava "insuficiente". Com "recheck" (reconferência de afirmação que só a IA julgou): a mesma
-- resposta de antes (mesmo trecho, mesmo veredito) não grava nada; resposta diferente substitui a evidência antiga da IA, que
-- fica registrada no histórico (evento evidence_replaced_by_ai).
create or replace function public.ch_worker_link_evidence(p_claim_id uuid, p_evidence jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_claims;
  s public.ch_sources;
  v_quote text := btrim(coalesce(p_evidence ->> 'quote', ''));
  v_verdict text := p_evidence ->> 'verdict';
  v_passage uuid := nullif(p_evidence ->> 'passage_id', '')::uuid;
  v_text text; v_missing text[]; v_neg_missing text[]; v_check jsonb; v_id uuid;
  v_replaced jsonb := '[]'::jsonb;
begin
  select * into c from public.ch_claims where id = p_claim_id;
  select * into s from public.ch_sources where id = (p_evidence ->> 'source_id')::uuid;
  if c.id is null or s.id is null or v_quote = '' then raise exception 'Evidência incompleta.' using errcode = '22023'; end if;
  v_text := coalesce(c.proposed_text, c.statement);
  select coalesce(array_agg(n), '{}') into v_missing from unnest(public.ch_numbers(v_text)) n where not (n = any (public.ch_numbers(v_quote)));
  select coalesce(array_agg(n), '{}') into v_neg_missing from unnest(public.ch_negations(v_text)) n where not (n = any (public.ch_negations(v_quote)));
  v_check := jsonb_build_object('claim_numbers', public.ch_numbers(v_text), 'evidence_numbers', public.ch_numbers(v_quote), 'missing_in_evidence', v_missing,
                                'negations_missing_in_evidence', v_neg_missing, 'ok', cardinality(v_missing) = 0 and cardinality(v_neg_missing) = 0, 'by', 'worker',
                                'model', p_evidence ->> 'model', 'simulated', coalesce(p_evidence ->> 'model', '') like 'mock%');
  if v_verdict = 'compatible' and not (v_check ->> 'ok')::boolean then v_verdict := 'insufficient'; end if;
  if v_verdict not in ('compatible', 'outdated', 'conflicting', 'insufficient', 'context_dependent') then v_verdict := 'insufficient'; end if;
  if coalesce((p_evidence ->> 'recheck')::boolean, false) and c.status = 'insufficient' and public.ch_claim_recheckable(c.id) then
    if exists (select 1 from public.ch_evidence e where e.claim_id = c.id and not e.stale and e.verdict = v_verdict and e.passage_id is not distinct from v_passage) then
      return jsonb_build_object('id', null, 'verdict', v_verdict, 'numeric_check', v_check, 'unchanged', true);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('evidence_id', e.id, 'source_id', e.source_id, 'passage_id', e.passage_id, 'section', e.section, 'page', e.page,
             'source_version', e.source_version, 'quote', e.quote, 'verdict', e.verdict, 'numeric_check', e.numeric_check, 'created_at', e.created_at)), '[]'::jsonb)
      into v_replaced from public.ch_evidence e where e.claim_id = c.id and not e.stale;
    delete from public.ch_evidence e where e.claim_id = c.id and not e.stale;
  end if;
  insert into public.ch_evidence (claim_id, source_id, passage_id, section, page, source_version, quote, verdict, numeric_check)
  values (p_claim_id, s.id, v_passage, p_evidence ->> 'section', nullif(p_evidence ->> 'page', '')::int, s.version, v_quote, v_verdict, v_check)
  returning id into v_id;
  update public.ch_claims set status = (
    select case when bool_or(e.verdict = 'conflicting') then 'conflicting' when bool_or(e.verdict = 'outdated') then 'outdated'
                when bool_or(e.verdict = 'context_dependent') then 'context_dependent' when bool_or(e.verdict = 'insufficient') then 'insufficient' else 'compatible' end
    from public.ch_evidence e where e.claim_id = p_claim_id and not e.stale)
  where id = p_claim_id;
  if jsonb_array_length(v_replaced) > 0 then
    insert into public.ch_claim_history (claim_id, event, details)
    values (p_claim_id, 'evidence_replaced_by_ai', jsonb_build_object('replaced', v_replaced, 'by_evidence_id', v_id, 'model', p_evidence ->> 'model'));
  end if;
  insert into public.ch_claim_history (claim_id, event, details) values (p_claim_id, 'evidence_by_ai', jsonb_build_object('evidence_id', v_id, 'verdict', v_verdict, 'model', p_evidence ->> 'model'));
  return jsonb_build_object('id', v_id, 'verdict', v_verdict, 'numeric_check', v_check);
end
$$;

-- Fonte nova indexada: devolve para a fila a etapa de evidências dos materiais de estudo que têm afirmação "insuficiente" que só
-- a IA julgou. Só quando a fonte entra na busca de evidências. Só documento cuja conferência já terminou (a que ainda vai rodar já
-- pega a fonte nova) e que não está com falha (documento com falha a equipe olha antes). O trabalho volta marcado como
-- reconferência automática. Devolve quantos documentos voltaram e, quando nada roda, o motivo.
drop function if exists public.ch_worker_recheck_insufficient(jsonb);
create or replace function public.ch_worker_recheck_insufficient(p_source_id uuid, p_versions jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d record;
  r jsonb;
  n integer := 0;
begin
  if not exists (select 1 from public.ch_sources s
                 where s.id = p_source_id and s.status = 'current' and s.kind not in ('preliminary', 'public_consultation')
                   and (s.kind <> 'society_guideline' or s.editorial_approved)) then
    return jsonb_build_object('documents', 0, 'skipped', 'source_not_searchable');
  end if;
  for d in
    select doc.id from public.ch_documents doc
    where doc.purpose = 'study_material' and doc.status <> 'failed'
      and exists (select 1 from public.ch_claims c where c.document_id = doc.id and c.status = 'insufficient' and public.ch_claim_recheckable(c.id))
      and exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence' and j.status = 'succeeded')
      and not exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence' and j.status in ('queued', 'running'))
    order by doc.created_at
  loop
    r := public.ch_worker_next(d.id, 'evidence', coalesce(p_versions, '{}'::jsonb), '');
    update public.ch_jobs set checkpoint = jsonb_build_object('auto_recheck', true, 'source_id', p_source_id)
     where id = (r ->> 'id')::uuid and status = 'queued';
    n := n + 1;
  end loop;
  return jsonb_build_object('documents', n);
end
$$;

-- Rascunho da unidade gerado pela IA: sempre em rascunho, sem aprovação nenhuma. Não cria versão nova quando
--   - o mesmo conteúdo já é versão da unidade (como antes); ou
--   - a mesma base (p_base_hash) já virou versão da unidade, mesmo que a equipe tenha editado o texto dela depois;
--   - versão de antes desta atualização (sem base registrada), escrita pelo mesmo modelo, que cita exatamente as mesmas
--     afirmações: fica ela, e passa a guardar a base.
-- Devolve também a situação da versão (o processamento só mexe em versão em rascunho).
drop function if exists public.ch_worker_save_draft(uuid, text, jsonb, text, text, text);
create or replace function public.ch_worker_save_draft(p_theme_node_id uuid, p_title text, p_content jsonb, p_origin text, p_model text, p_scope_note text,
                                                       p_base_hash text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_version uuid;
  v_hash text := public.ch_hash(p_content);
  v_ids uuid[] := public.ch_content_claim_ids(p_content);
begin
  select id into v_unit from public.ch_units where theme_node_id = p_theme_node_id order by created_at limit 1;
  if v_unit is null then
    insert into public.ch_units (theme_node_id, title, created_by) values (p_theme_node_id, btrim(p_title), null) returning id into v_unit;
  end if;
  -- idempotente: o mesmo conteúdo não gera nova versão
  select id into v_version from public.ch_unit_versions where unit_id = v_unit and content_hash = v_hash order by version desc limit 1;
  if v_version is null and p_base_hash is not null then
    select id into v_version from public.ch_unit_versions where unit_id = v_unit and base_hash = p_base_hash order by version desc limit 1;
    if v_version is null then
      select v.id into v_version from public.ch_unit_versions v
       where v.unit_id = v_unit and v.base_hash is null and v.generated_by_model is not distinct from p_model
         and (select coalesce(array_agg(uc.claim_id order by uc.claim_id), '{}') from public.ch_unit_claims uc where uc.unit_version_id = v.id)
             = (select coalesce(array_agg(i order by i), '{}') from (select distinct unnest(v_ids) as i) x)
       order by v.version desc limit 1;
    end if;
  end if;
  if v_version is null then
    insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash, scope_note, created_by, generated_by_model, base_hash)
    values (v_unit, coalesce((select max(version) + 1 from public.ch_unit_versions where unit_id = v_unit), 1), p_origin, 'draft', p_content, v_hash, p_scope_note, null, p_model, p_base_hash)
    returning id into v_version;
    insert into public.ch_unit_claims select v_version, i from unnest(v_ids) i;
  elsif p_base_hash is not null then
    update public.ch_unit_versions set base_hash = p_base_hash where id = v_version and base_hash is null;
  end if;
  return jsonb_build_object('unit_id', v_unit, 'version_id', v_version, 'status', (select status from public.ch_unit_versions where id = v_version));
end
$$;

-- Próxima etapa com a marca da reconferência automática: como ch_worker_next (cria o trabalho ou devolve o já existente para a
-- fila), mas o trabalho entra com o checkpoint dado, no mesmo passo (outro processamento não pega o trabalho sem a marca). Trabalho
-- que já estava na fila ou rodando fica como está (ele já vai rodar com tudo).
create or replace function public.ch_worker_next_marked(p_document_id uuid, p_step text, p_versions jsonb, p_scope_key text, p_checkpoint jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb;
begin
  r := public.ch_worker_enqueue(p_document_id, p_step, coalesce(p_scope_key, ''), p_versions, 3);
  if (r ->> 'duplicate')::boolean then
    update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null,
                              checkpoint = coalesce(p_checkpoint, '{}'::jsonb)
     where id = (r ->> 'id')::uuid and status in ('succeeded', 'failed', 'dead', 'blocked');
  else
    update public.ch_jobs set checkpoint = coalesce(p_checkpoint, '{}'::jsonb) where id = (r ->> 'id')::uuid and status = 'queued';
  end if;
  return r;
end
$$;

-- Reconferência automática num tema que já tem unidade: o processamento não faz versão nova sozinho (a equipe pode estar
-- revisando ou ter editado o texto). A versão mais nova da unidade recebe os avisos (p_notices), sem apagar nenhum apontamento e
-- sem repetir o aviso da mesma afirmação. Devolve a versão, ou nada quando o tema ainda não tem unidade com versão.
create or replace function public.ch_worker_theme_notice(p_theme_node_id uuid, p_notices jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v record;
  v_new jsonb;
begin
  select id into v_unit from public.ch_units where theme_node_id = p_theme_node_id order by created_at limit 1;
  if v_unit is null then return null; end if;
  select uv.id, uv.version, uv.status, uv.review_flags into v from public.ch_unit_versions uv where uv.unit_id = v_unit order by uv.version desc limit 1;
  if v.id is null then return null; end if;
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_new
    from jsonb_array_elements(case when jsonb_typeof(p_notices) = 'array' then p_notices else '[]'::jsonb end) n
   where not exists (select 1 from jsonb_array_elements(coalesce(v.review_flags, '[]'::jsonb)) f
                     where f ->> 'by' = n ->> 'by' and f ->> 'claim_id' = n ->> 'claim_id');
  if jsonb_array_length(v_new) > 0 then
    update public.ch_unit_versions set review_flags = coalesce(review_flags, '[]'::jsonb) || v_new where id = v.id;
  end if;
  return jsonb_build_object('version_id', v.id, 'version', v.version, 'status', v.status, 'notices', jsonb_array_length(v_new));
end
$$;

-- continuam só do servidor (o "create or replace" mantém as permissões; repetido aqui por segurança)
revoke execute on function public.ch_claim_recheckable(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_claims(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_mark_claim(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_link_evidence(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_recheck_insufficient(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_save_draft(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_next_marked(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_theme_notice(uuid, jsonb) from public, anon, authenticated;
