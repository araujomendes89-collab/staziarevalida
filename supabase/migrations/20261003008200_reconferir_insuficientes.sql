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
-- Rodada de correção 2:
--   - a reconferência automática não entra no meio de uma reexecução: documento com Extração, Classificação, Afirmações ou
--     Conferência na fila, rodando ou pendente fica de fora (quem vai rodar já pega a fonte nova); e a etapa anterior que acha a
--     reconferência automática ainda na fila tira a marca dela (ch_worker_next), para a conferência rodar inteira;
--   - a marca só deixa parcial a etapa que já tinha terminado inteira; etapa normal pendente, na fila ou com falha roda inteira, do
--     começo; duas reconferências automáticas da mesma etapa se juntam (ch_worker_next_marked);
--   - trabalho da reconferência automática que falha, fica pendente ou é interrompido não muda a situação do documento nem grava
--     "Pendência" nele (ch_worker_finish, ch_worker_block, ch_worker_fail, ch_worker_claim); o erro fica só na etapa, avisando que
--     o documento continua como estava. A reconferência que falhou volta a rodar na próxima fonte nova.
-- Rodada de correção 3 (dois processamentos ao mesmo tempo: o agendador dispara a tarefa do Cloud Run a cada 10 minutos e cada
-- execução pega trabalho por até 50, então execuções se sobrepõem):
--   - pedido para uma etapa que está rodando em outro processamento não se perde mais: fica guardado no trabalho (coluna
--     requeue) e vale quando ele termina, de qualquer jeito que termine (gatilho ch_jobs_worker_exit). O pedido da etapa inteira
--     (ch_worker_next) faz a etapa rodar inteira de novo; a reconferência automática (ch_worker_next_marked) segue as mesmas regras
--     de quando a etapa não está rodando. Sem isso, "Reprocessar" parava no meio com o documento em "Classificando";
--   - fonte nova indexada enquanto a conferência roda em outro processamento: a reconferência fica guardada e roda depois;
--   - o aviso da reconferência não aponta a afirmação que a versão mais nova já cita;
--   - a proteção do trabalho interrompido (ch_worker_claim, rodada 2) passou para o gatilho: a 8200 não redefine mais
--     ch_worker_claim (veja a nota abaixo).
-- As funções redefinidas partem das versões mais novas (ch_worker_claims da 7600; ch_worker_mark_claim, ch_worker_link_evidence,
-- ch_worker_save_draft, ch_worker_block e ch_worker_fail da 1500; ch_worker_next da 1600; ch_worker_finish da 1400) e continuam
-- só do servidor. Pode ser rodada mais de uma vez.
--
-- NOTA PARA QUEM JUNTAR O RAMO montagem-estacoes (migração 20261003005900_estacoes_importacao.sql, ainda não publicada):
--   A 5900 apaga ch_worker_claim(integer) e cria ch_worker_claim(integer, text[]). A 8200 NÃO mexe em ch_worker_claim (ela ficou
--   como na 1400, ou como a 5900 deixar), então as duas convivem em qualquer ordem: colada no Supabase antes ou depois da 5900, e
--   num banco novo (onde a 5900 roda antes, pela ordem dos arquivos). A proteção da reconferência automática está no gatilho
--   ch_jobs_worker_exit, que a 5900 não recria. Para ela continuar valendo, a ch_worker_claim da 5900 (ou qualquer versão futura)
--   precisa manter, nesta ordem, estes dois trechos da 1400, que ela já tem iguais:
--     update public.ch_jobs set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
--            error = 'Interrompido sem concluir.' || coalesce(' Falha anterior: ' || error, ''), locked_at = null
--      where status = 'running' and locked_at < now() - make_interval(secs => p_stale_seconds);
--     update public.ch_documents d set status = 'failed', failure = left(j2.error, 500)
--       from public.ch_jobs j2 where j2.document_id = d.id and j2.status = 'dead' and j2.finished_at is null;
--   Ou seja: o trabalho interrompido sai de 'running' por um UPDATE em ch_jobs (é nele que o gatilho age: devolve à fila o que
--   ficou pedido, preenche finished_at da reconferência automática que morreu ali e põe o aviso no erro) e o documento só vira
--   "Falhou" por trabalho morto com "finished_at is null" (a reconferência automática morta já sai com finished_at preenchido).
--   Não apague o gatilho ch_jobs_worker_exit nem a coluna ch_jobs.requeue; se for reescrever ch_worker_next, ch_worker_next_marked,
--   ch_worker_finish, ch_worker_block ou ch_worker_fail, parta das versões desta migração.

-- De que base (afirmações compatíveis, texto, modelo e versão do prompt) o processamento escreveu a versão. Edição da equipe não
-- muda este campo.
alter table public.ch_unit_versions add column if not exists base_hash text;

-- Pedido guardado para um trabalho que está rodando em outro processamento (rodada de correção 3): '{}' = rodar a etapa inteira
-- de novo (ch_worker_next); com "auto_recheck" = reconferência automática, com a marca (ch_worker_next_marked). Vale quando o
-- trabalho termina (gatilho ch_jobs_worker_exit, no fim desta migração), que apaga o pedido.
alter table public.ch_jobs add column if not exists requeue jsonb;

-- Junta duas marcas da reconferência automática: temas, afirmações e versões das duas, sem repetir; o resto vem da nova (p_new).
-- O ponto em que a etapa parou (theme, chunk...) não entra: ela recomeça do início.
create or replace function public.ch_worker_merge_marks(p_old jsonb, p_new jsonb) returns jsonb
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  v_old jsonb := coalesce(p_old, '{}'::jsonb);
  v jsonb := coalesce(p_new, '{}'::jsonb);
  k text;
begin
  foreach k in array array['themes', 'claims', 'versions'] loop
    if v_old ? k or v ? k then
      v := v || jsonb_build_object(k, (
        select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) from (
          select jsonb_array_elements_text(case when jsonb_typeof(v_old -> k) = 'array' then v_old -> k else '[]'::jsonb end) as x
          union
          select jsonb_array_elements_text(case when jsonb_typeof(v -> k) = 'array' then v -> k else '[]'::jsonb end)) s));
    end if;
  end loop;
  return v;
end
$$;

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
-- a IA julgou. Só quando a fonte entra na busca de evidências. Só documento que não está com falha (documento com falha a equipe
-- olha antes) e cuja conferência já terminou (ou cuja reconferência automática anterior falhou). Fica de fora o documento com
-- Extração, Classificação ou Afirmações na fila, rodando ou pendente, ou com a Conferência na fila ou pendente: quem ainda vai
-- rodar já pega a fonte nova, e a reexecução pedida pela equipe (ou a conferência dela que ficou pendente) roda inteira, sem virar
-- reconferência automática (rodada de correção 2). O trabalho volta marcado como reconferência automática
-- (ch_worker_next_marked). Rodada de correção 3: a conferência que está rodando em outro processamento pode já ter buscado os
-- trechos antes desta fonte; o documento entra e a reconferência fica guardada para quando ela terminar (ch_worker_next_marked
-- guarda o pedido; ela não entra no meio da que está rodando). Devolve quantos documentos voltaram (ou ficaram com a reconferência
-- guardada) e, quando nada roda, o motivo.
drop function if exists public.ch_worker_recheck_insufficient(jsonb);
create or replace function public.ch_worker_recheck_insufficient(p_source_id uuid, p_versions jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d record;
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
      and (exists (select 1 from public.ch_claims c where c.document_id = doc.id and c.status = 'insufficient' and public.ch_claim_recheckable(c.id))
           -- conferindo agora: as afirmações dela ainda podem ficar "insuficientes"
           or exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence' and j.status = 'running'))
      and exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence'
                   and (j.status in ('succeeded', 'running') or (j.status in ('failed', 'dead') and coalesce(j.checkpoint ->> 'auto_recheck', '') = 'true')))
      and not exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step in ('extract', 'classify', 'claims')
                       and j.status in ('queued', 'running', 'blocked'))
      and not exists (select 1 from public.ch_jobs j where j.document_id = doc.id and j.step = 'evidence' and j.status in ('queued', 'blocked'))
    order by doc.created_at
  loop
    perform public.ch_worker_next_marked(d.id, 'evidence', coalesce(p_versions, '{}'::jsonb), '', jsonb_build_object('auto_recheck', true, 'source_id', p_source_id));
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
-- fila), mas o trabalho entra com a marca, no mesmo passo (outro processamento não pega o trabalho sem ela). Rodada de correção 2:
--   - só a etapa que já tinha terminado inteira (succeeded) roda de novo só para o que mudou;
--   - etapa normal pendente, na fila ou com falha roda inteira, do começo (o que ela já fez não se repete: rascunho, aviso e
--     materiais iguais são reaproveitados); a marca não entra nela;
--   - outra reconferência automática da mesma etapa ainda por fazer, pendente ou que falhou: as duas marcas se juntam e ela
--     recomeça do início (a pendente continua pendente).
-- Rodada de correção 3: trabalho rodando em outro processamento guarda o pedido (coluna requeue), que vale quando ele terminar
-- (gatilho ch_jobs_worker_exit, pelas mesmas regras acima); dois pedidos guardados se juntam, e um pedido da etapa inteira
-- (ch_worker_next) já guardado cobre este.
create or replace function public.ch_worker_next_marked(p_document_id uuid, p_step text, p_versions jsonb, p_scope_key text, p_checkpoint jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  j public.ch_jobs;
  v_mark jsonb := coalesce(p_checkpoint, '{}'::jsonb);
begin
  r := public.ch_worker_enqueue(p_document_id, p_step, coalesce(p_scope_key, ''), p_versions, 3);
  select * into j from public.ch_jobs where id = (r ->> 'id')::uuid for update;
  if not (r ->> 'duplicate')::boolean then
    update public.ch_jobs set checkpoint = v_mark where id = j.id and status = 'queued';
  elsif j.status = 'running' then
    if j.requeue is null or coalesce(j.requeue ->> 'auto_recheck', '') = 'true' then
      update public.ch_jobs set requeue = public.ch_worker_merge_marks(j.requeue, v_mark) where id = j.id;
    end if;
  elsif coalesce(j.checkpoint ->> 'auto_recheck', '') = 'true' and j.status in ('queued', 'blocked', 'failed', 'dead') then
    v_mark := public.ch_worker_merge_marks(j.checkpoint, v_mark);
    if j.status = 'blocked' then
      update public.ch_jobs set checkpoint = v_mark where id = j.id;
    else
      update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = v_mark
       where id = j.id;
    end if;
  elsif j.status = 'succeeded' then
    update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = v_mark
     where id = j.id;
  elsif j.status in ('queued', 'blocked') then
    update public.ch_jobs set checkpoint = '{}'::jsonb where id = j.id;
  elsif j.status in ('failed', 'dead') then
    update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = '{}'::jsonb
     where id = j.id;
  end if;
  return r;
end
$$;

-- Próxima etapa (o processamento segue de uma etapa para a outra; parte da versão da 1600). Rodada de correção 2: a etapa
-- anterior que acha a reconferência automática da próxima ainda na fila tira a marca dela, para ela rodar inteira (sem isso, uma
-- reexecução pedida pela equipe parava no meio quando uma fonte nova era indexada antes de ela chegar à conferência).
-- Rodada de correção 3: a próxima etapa rodando em outro processamento (por exemplo, a reconferência automática) guarda o pedido
-- (requeue = '{}'): quando ela termina, de qualquer jeito, volta para a fila e roda inteira (gatilho ch_jobs_worker_exit). Antes, o
-- pedido se perdia e a reexecução parava ali, com o documento em "Classificando". O trabalho fica travado enquanto se decide,
-- para o fim dele não passar no meio.
create or replace function public.ch_worker_next(p_document_id uuid, p_step text, p_versions jsonb, p_scope_key text default '') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb; j public.ch_jobs;
begin
  r := public.ch_worker_enqueue(p_document_id, p_step, coalesce(p_scope_key, ''), p_versions, 3);
  if (r ->> 'duplicate')::boolean then
    select * into j from public.ch_jobs where id = (r ->> 'id')::uuid for update;
    if j.status = 'running' then
      update public.ch_jobs set requeue = '{}'::jsonb where id = j.id;
    elsif j.status in ('succeeded', 'failed', 'dead', 'blocked') or (j.status = 'queued' and coalesce(j.checkpoint ->> 'auto_recheck', '') = 'true') then
      update public.ch_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = '{}'::jsonb
       where id = j.id;
    end if;
  end if;
  return r;
end
$$;

-- Fim de um trabalho (parte da versão da 1400). Rodada de correção 2: o trabalho da reconferência automática que gasta as
-- tentativas não muda a situação do documento; o erro fica só na etapa, avisando que o documento continua como estava.
-- Rodada de correção 3: com um pedido guardado (coluna requeue), o gatilho ch_jobs_worker_exit pode devolver o trabalho para a
-- fila em vez de deixá-lo morto; o documento só falha quando o trabalho termina morto mesmo. Devolve a situação final.
create or replace function public.ch_worker_finish(p_job_id uuid, p_ok boolean, p_error text default null, p_metrics jsonb default '{}'::jsonb) returns text
  language plpgsql security definer set search_path = ''
as $$
declare j public.ch_jobs; v_status text; v_auto boolean; v_final text;
begin
  select * into j from public.ch_jobs where id = p_job_id and status = 'running';
  if not found then raise exception 'Trabalho não está em execução.' using errcode = 'P0002'; end if;
  v_auto := coalesce(j.checkpoint ->> 'auto_recheck', '') = 'true';
  if p_ok then v_status := 'succeeded';
  elsif j.attempts >= j.max_attempts then v_status := 'dead';
  else v_status := 'queued'; end if;
  update public.ch_jobs set status = v_status,
    error = case when p_ok then null
                 when v_auto then 'Reconferência automática (fonte nova): o documento continua como estava. ' || coalesce(p_error, 'Falha sem detalhe.')
                 else p_error end,
    locked_at = null, metrics = coalesce(p_metrics, '{}'::jsonb),
    finished_at = case when v_status in ('succeeded', 'dead') then now() end,
    run_after = case when v_status = 'queued' then now() + make_interval(secs => 30 * attempts) else run_after end where id = p_job_id
  returning status into v_final;
  if v_final = 'dead' and j.document_id is not null and not v_auto then
    update public.ch_documents set status = 'failed', failure = left(coalesce(p_error, 'Falha sem detalhe.'), 500) where id = j.document_id;
  end if;
  return v_final;
end
$$;

-- Trabalho pendente por falta de configuração (parte da versão da 1500). Rodada de correção 2: o da reconferência automática não
-- grava "Pendência" no documento; o motivo fica só na etapa. Rodada de correção 3: o trabalho que o gatilho ch_jobs_worker_exit
-- devolveu para a fila (pedido guardado) também não grava.
create or replace function public.ch_worker_block(p_job_id uuid, p_reason text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_doc uuid; v_auto boolean; v_final text;
begin
  update public.ch_jobs set status = 'blocked', attempts = greatest(attempts - 1, 0),
         error = case when coalesce(checkpoint ->> 'auto_recheck', '') = 'true'
                      then 'Reconferência automática (fonte nova): o documento continua como estava. ' || p_reason else p_reason end,
         locked_at = null
   where id = p_job_id and status = 'running'
   returning document_id, coalesce(checkpoint ->> 'auto_recheck', '') = 'true', status into v_doc, v_auto, v_final;
  if v_doc is not null and not v_auto and v_final = 'blocked' then
    update public.ch_documents set failure = left('Pendência: ' || p_reason, 500) where id = v_doc;
  end if;
end
$$;

-- Falha que nova tentativa não resolve (parte da versão da 1500). Rodada de correção 2: a da reconferência automática não muda a
-- situação do documento. Rodada de correção 3: o trabalho que o gatilho ch_jobs_worker_exit devolveu para a fila (pedido
-- guardado da etapa inteira) também não.
create or replace function public.ch_worker_fail(p_job_id uuid, p_error text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_doc uuid; v_auto boolean; v_final text;
begin
  update public.ch_jobs set status = 'dead',
         error = case when coalesce(checkpoint ->> 'auto_recheck', '') = 'true'
                      then 'Reconferência automática (fonte nova): o documento continua como estava. ' || p_error else p_error end,
         locked_at = null, finished_at = now()
   where id = p_job_id and status = 'running'
   returning document_id, coalesce(checkpoint ->> 'auto_recheck', '') = 'true', status into v_doc, v_auto, v_final;
  if v_doc is not null and not v_auto and v_final = 'dead' then
    update public.ch_documents set status = 'failed', failure = left(p_error, 500) where id = v_doc;
  end if;
end
$$;

-- Fim de um trabalho que estava rodando, por qualquer caminho (ch_worker_finish, ch_worker_block, ch_worker_fail, ou
-- ch_worker_claim quando ele ficou parado sem sinal). Rodada de correção 3, num gatilho para valer com qualquer versão de
-- ch_worker_claim (a 1400 ou a que o ramo montagem-estacoes cria na 5900):
--   1) pedido guardado enquanto ele rodava (coluna requeue):
--      - da etapa inteira (ch_worker_next): volta para a fila e roda inteira, do começo;
--      - da reconferência automática (ch_worker_next_marked), como se tivesse chegado agora: trabalho que terminou inteiro roda de
--        novo só para o que mudou; reconferência automática que não terminou junta as duas marcas e recomeça do início (a
--        pendente continua pendente); etapa normal que vai tentar de novo ou ficou pendente recomeça inteira, sem a marca; etapa
--        normal que falhou de vez fica com a falha para a equipe (o pedido automático não a faz rodar de novo sozinha);
--   2) reconferência automática que termina sem concluir: o erro começa com o aviso de que o documento continua como estava e,
--      se ela morreu ali, já sai com finished_at preenchido, para ch_worker_claim não marcar o documento como "Falhou" (ele só
--      marca por trabalho morto com finished_at vazio). Esta parte era feita na ch_worker_claim da rodada de correção 2.
create or replace function public.ch_jobs_worker_exit() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_req jsonb := new.requeue;
  v_fresh boolean := false;
  c_note constant text := 'Reconferência automática (fonte nova): o documento continua como estava. ';
begin
  if v_req is not null then
    new.requeue := null;
    if coalesce(v_req ->> 'auto_recheck', '') <> 'true' then
      new.status := 'queued';
      new.checkpoint := '{}'::jsonb;
      v_fresh := true;
    elsif new.status = 'succeeded' then
      new.status := 'queued';
      new.checkpoint := v_req;
      v_fresh := true;
    elsif coalesce(new.checkpoint ->> 'auto_recheck', '') = 'true' then
      new.checkpoint := public.ch_worker_merge_marks(new.checkpoint, v_req);
      if new.status <> 'blocked' then
        new.status := 'queued';
        v_fresh := true;
      end if;
    elsif new.status in ('queued', 'blocked') then
      new.checkpoint := '{}'::jsonb;
    end if;
    if v_fresh then
      new.attempts := 0;
      new.error := null;
      new.run_after := now();
      new.finished_at := null;
      new.locked_at := null;
    end if;
  end if;
  if coalesce(new.checkpoint ->> 'auto_recheck', '') = 'true' and new.status in ('queued', 'blocked', 'failed', 'dead') then
    if new.status in ('failed', 'dead') and new.finished_at is null then
      new.finished_at := now();
    end if;
    if new.error is not null and left(new.error, length(c_note)) <> c_note then
      new.error := c_note || new.error;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists ch_jobs_worker_exit on public.ch_jobs;
create trigger ch_jobs_worker_exit before update on public.ch_jobs
  for each row when (old.status = 'running' and new.status is distinct from 'running')
  execute function public.ch_jobs_worker_exit();

-- Reconferência automática num tema que já tem unidade: o processamento não faz versão nova sozinho (a equipe pode estar
-- revisando ou ter editado o texto). A versão mais nova da unidade recebe os avisos (p_notices), sem apagar nenhum apontamento e
-- sem repetir o aviso da mesma afirmação. Devolve a versão, ou nada quando o tema ainda não tem unidade com versão. Rodada de
-- correção 3: a afirmação que a versão mais nova já cita não ganha aviso (com dois processamentos, o rascunho de uma reexecução
-- pode ter usado a afirmação antes de a reconferência pedida no meio rodar).
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
                     where f ->> 'by' = n ->> 'by' and f ->> 'claim_id' = n ->> 'claim_id')
     and not exists (select 1 from public.ch_unit_claims uc where uc.unit_version_id = v.id and uc.claim_id::text = n ->> 'claim_id');
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
revoke execute on function public.ch_worker_next(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_finish(uuid, boolean, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_block(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_fail(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_merge_marks(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_jobs_worker_exit() from public, anon, authenticated;
