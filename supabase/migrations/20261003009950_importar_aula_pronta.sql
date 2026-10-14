-- =============================================================================
-- Central de Conteúdo › Unidades e revisão: "Importar aula pronta" (pedido do dono, 13/10/2026).
--
-- Antes: uma aula escrita fora do processamento de documentos (os 100 temas do roteiro, a começar pela GR-001 Tuberculose
-- pulmonar) só entrava na Central chamando à mão, uma a uma, as funções oficiais: cadastrar trecho, afirmação, evidência,
-- unidade, versão, cada material e enviar para revisão. Não existia função de importação.
-- Agora: app_ch_import_lesson_package(pacote) faz esse caminho inteiro numa transação, só com as regras que a Central já tem:
--   * só administrador ou editor (aluno, revisor sem papel de equipe e visitante são recusados);
--   * confere o pacote ANTES de gravar e recusa com a lista do que falta: tema que não existe na taxonomia publicada, fonte que
--     não está na biblioteca (procurada pelo endereço oficial normalizado), afirmação sem citação literal conferida, número da
--     afirmação que não está no trecho citado (a mesma conferência de app_ch_link_evidence), parágrafo clínico sem afirmação,
--     material que cita afirmação fora da aula, arquivo sem sha256. Negação ou condição da afirmação ("sem", "não", "apenas"...)
--     que não aparece no trecho: como no processamento (ch_worker_link_evidence), a evidência entra "insuficiente", com aviso ao
--     revisor, e a publicação fica travada até corrigir;
--   * acha (tema + título) ou cria a unidade (app_ch_create_unit), grava cada afirmação (app_ch_add_claim) com a evidência
--     (app_ch_link_evidence) apontando para a fonte e para um trecho da fonte (página + citação literal, marcado com o tipo de
--     leitura e com a conferência literal), grava o texto (app_ch_save_unit_version) e os materiais (app_ch_save_material:
--     aula, pontos-chave, cards, flashcards, questões de fixação) e envia para revisão (app_ch_submit_for_review);
--   * a versão importada termina SEMPRE "aguardando revisão": nunca aprovada, nunca publicada; aprovar e publicar continuam
--     sendo das pessoas (revisor médico da área + editorial; publicação só pelo administrador, com as chaves da Configuração);
--   * imagens e PDF: só referências (caminho no depósito "content-hub", sha256, texto alternativo); o envio dos arquivos é do
--     script scripts/aulas/subir-arquivos.mjs;
--   * o arquivo final da aula (PDF conferido, exigido para publicar) é gerado pelo processamento de sempre: a importação pede a
--     etapa "render" só desta versão (escopo "import:<versão>"), sem IA;
--   * colar de novo o mesmo pacote não muda nada; pacote com conteúdo diferente atualiza a versão importada que ainda não foi
--     aprovada (as aprovações dela deixam de valer, como em toda edição) ou, se a anterior já foi aprovada ou publicada, cria uma
--     versão nova candidata sem tocar nela;
--   * tudo fica no Registro (ch_audit, ação "unit.import");
--   * o aluno não recebe referência nenhuma da aula importada (decisão do dono, 13/10): sem lista de fontes, página ou trecho no
--     texto da aula publicada (ch_student_lesson); os materiais guardam as fontes só para a equipe (campo references da aula, que o
--     arquivo final conferido usa) e o pacote com marca de citação no texto ("[1]", "Referências", "Trechos citados") é recusado.
-- Partes redefinidas: admin_audit_title (última: 20261003009513) só para dar nome à ação nova no Registro; ch_student_lesson
-- (última: 20261003009861) só para tirar as fontes do texto do aluno na aula importada.
-- Pode ser colada duas ou três vezes (create or replace, add column if not exists, drop ... if exists).
-- =============================================================================

-- ---------------------------------------------------------------- 1. trecho: tipo de leitura e conferência literal
alter table public.ch_source_passages add column if not exists reading_kind text;
alter table public.ch_source_passages drop constraint if exists ch_source_passages_reading_kind_check;
alter table public.ch_source_passages add constraint ch_source_passages_reading_kind_check
  check (reading_kind is null or reading_kind in ('texto_digital', 'ocr'));
alter table public.ch_source_passages add column if not exists literal_check jsonb;

-- ---------------------------------------------------------------- 2. apoio
-- Tipos críticos achados por regra (a mesma de softwareCriticalKinds em server/contentHub/pipeline.ts): só acrescenta conferência humana.
create or replace function public.ch_import_critical_kinds(p_text text) returns text[]
  language sql immutable set search_path = ''
as $$
  select array_remove(array[
    case when coalesce(p_text, '') ~* '\d\s*(mg|mcg|µg|g|ml|ui)(/|\y)' then 'dose' end,
    case when coalesce(p_text, '') ~* '\d\s*(dias?|semanas?|meses|horas?)\y' or coalesce(p_text, '') ~* '\y(por|durante)\s+\d' then 'duration' end,
    case when coalesce(p_text, '') ~* '\y(\d+/\d+\s*h|a cada \d+|\d+\s*x\s*(ao|por)\s*dia|\d+\s*vezes)' then 'frequency' end,
    case when coalesce(p_text, '') ~ '\y(via oral|endovenos|intravenos|intramuscular|subcut[âa]ne|IV|IM|VO|SC)\y' then 'route' end,
    case when coalesce(p_text, '') ~* 'contraindica' then 'contraindication' end,
    case when coalesce(p_text, '') ~* 'rastreamento|rastreio' and coalesce(p_text, '') ~ '\d' then 'screening_interval' end
  ]::text[], null)
$$;

-- Números com unidade do texto que não aparecem no apoio (as afirmações citadas).
create or replace function public.ch_import_numbers_outside(p_text text, p_support text) returns text[]
  language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(n order by n), '{}') from unnest(public.ch_numbers(p_text)) n
  where not (n = any (public.ch_numbers(p_support)))
$$;

-- Troca os códigos locais das afirmações (ex.: TB01) pelos números delas no banco.
create or replace function public.ch_import_map_ids(p_ids jsonb, p_map jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(p_map -> x.id order by x.o), '[]'::jsonb)
  from (select min(t.o) as o, t.id from jsonb_array_elements_text(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end) with ordinality t (id, o) group by t.id) x
$$;
revoke execute on function public.ch_import_critical_kinds(text) from public, anon, authenticated;
revoke execute on function public.ch_import_numbers_outside(text, text) from public, anon, authenticated;
revoke execute on function public.ch_import_map_ids(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. a importação
create or replace function public.app_ch_import_lesson_package(p_package jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  pk constant jsonb := coalesce(p_package, '{}'::jsonb);
  v_pkg_hash constant text := public.ch_hash(coalesce(p_package, '{}'::jsonb));
  v_mark constant text := 'aula-pronta:' || public.ch_hash(coalesce(p_package, '{}'::jsonb));
  v_code text := btrim(coalesce(pk ->> 'codigo', ''));
  v_title text := btrim(coalesce(pk ->> 'titulo', ''));
  v_problems text[] := '{}';
  v_warnings jsonb := '[]'::jsonb;
  v_node uuid;
  v_area text;
  v_sources jsonb := '{}'::jsonb;     -- ref → {id, ...}
  v_claims jsonb := '{}'::jsonb;      -- código local → objeto da afirmação
  v_used jsonb := '{}'::jsonb;        -- códigos citados no texto da aula
  v_map jsonb := '{}'::jsonb;         -- código local → uuid
  v_negfail jsonb := '{}'::jsonb;     -- código local → negações da afirmação que faltam no trecho
  s jsonb; c jsonb; p jsonb; x jsonb; it jsonb;
  r record;
  v_src public.ch_sources;
  v_id uuid;
  v_txt text;
  v_sup text;
  v_miss text[];
  v_neg text[];
  i integer; j integer;
  v_unit uuid;
  v_new_unit boolean := false;
  v_version uuid;
  v_target public.ch_unit_versions;
  v_prev public.ch_unit_versions;
  v_content jsonb;
  v_hash text;
  v_refs jsonb;
  v_lesson jsonb; v_summary jsonb; v_cards jsonb; v_flash jsonb; v_questions jsonb;
  v_kinds text[] := '{}';
  v_files jsonb;
  v_new_claims integer := 0; v_new_passages integer := 0; v_new_evidence integer := 0;
  v_passage uuid;
  v_kinds_crit text[];
  v_result text;
  v_status text;
  v_render jsonb;
begin
  -- ------------------------------------------------ quem pode
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.is_staff() then
    raise exception 'Importar aula pronta é só para administrador ou editor da Central de Conteúdo.' using errcode = '42501';
  end if;

  -- ------------------------------------------------ conferência do pacote (nada é gravado se houver problema)
  if coalesce(pk ->> 'formato', '') <> 'staziamed.aula-pronta.v1' then
    raise exception 'Pacote em formato desconhecido (esperado "staziamed.aula-pronta.v1"). Gere o pacote com scripts/aulas/gerar-sql-importacao.mjs.' using errcode = '22023';
  end if;
  if v_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$' then v_problems := v_problems || 'Código da aula ausente ou inválido (ex.: GR-001).'::text; end if;
  if char_length(v_title) not between 1 and 200 then v_problems := v_problems || 'Título da aula ausente ou com mais de 200 caracteres.'::text; end if;

  -- tema: precisa existir na taxonomia PUBLICADA da Central (área > subárea > tema), ativo
  select n.id, public.ch_node_area_code(n.id) into v_node, v_area
    from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions tv on tv.id = n.version_id and tv.status = 'published'
    left join public.ch_taxonomy_nodes up on up.id = n.parent_id
   where n.level in ('theme', 'subtheme') and n.status = 'active'
     and public.fold_text(btrim(n.name)) = public.fold_text(btrim(coalesce(pk #>> '{tema,tema}', '')))
     and public.ch_node_area_code(n.id) = coalesce(pk #>> '{tema,area}', '')
     and (nullif(btrim(coalesce(pk #>> '{tema,subarea}', '')), '') is null
          or public.fold_text(btrim(up.name)) = public.fold_text(btrim(pk #>> '{tema,subarea}'))
          or exists (select 1 from public.ch_taxonomy_nodes g where g.id = up.parent_id and public.fold_text(btrim(g.name)) = public.fold_text(btrim(pk #>> '{tema,subarea}'))))
   order by case n.level when 'theme' then 0 else 1 end limit 1;
  if v_node is null then
    v_problems := v_problems || ('O tema "' || coalesce(pk #>> '{tema,tema}', '?') || '" (área ' || coalesce(pk #>> '{tema,area}', '?') || ', subárea ' ||
      coalesce(pk #>> '{tema,subarea}', '?') || ') não existe na taxonomia publicada da Central. Crie o tema em Central › Taxonomia (rascunho e publicar) ' ||
      'ou indique no pacote um tema que já existe' || coalesce(' (parecidos: ' || (
        select string_agg(distinct n.name, ', ') from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions tv on tv.id = n.version_id and tv.status = 'published'
         where n.level in ('theme', 'subtheme') and n.status = 'active'
           and public.fold_text(n.name) like '%' || split_part(public.fold_text(btrim(coalesce(pk #>> '{tema,tema}', ''))), ' ', 1) || '%') || ')', '') || '.');
  end if;

  -- fontes: achadas pelo endereço oficial normalizado; precisam estar na biblioteca e vigentes
  for s in select value from jsonb_array_elements(coalesce(pk -> 'fontes', '[]'::jsonb)) loop
    v_src := null;
    select * into v_src from public.ch_sources x
     where public.ch_url_norm(x.url) = public.ch_url_norm(s ->> 'url') and nullif(btrim(coalesce(s ->> 'url', '')), '') is not null
     order by (x.status = 'current') desc, (x.audience = 'oficial') desc, x.created_at desc limit 1;
    if v_src.id is null then
      v_problems := v_problems || ('Fonte fora da biblioteca: "' || coalesce(s ->> 'titulo', s ->> 'ref', '?') || '" (' || coalesce(s ->> 'url', 'sem endereço') ||
                                   '). Cadastre-a em Central › Fontes (ou cole o catálogo de fontes oficiais) antes de importar.');
    elsif v_src.status <> 'current' then
      v_problems := v_problems || ('Fonte substituída ou retirada na biblioteca: "' || v_src.title || '" (' || v_src.status || '). Use a versão vigente.');
    elsif v_src.kind in ('preliminary', 'public_consultation') then
      v_problems := v_problems || ('Fonte preliminar ou em consulta pública não sustenta conduta: "' || v_src.title || '".');
    else
      v_sources := v_sources || jsonb_build_object(s ->> 'ref', jsonb_build_object('id', v_src.id, 'title', v_src.title));
      if not public.ch_is_official_source(v_src.id) then
        v_warnings := v_warnings || jsonb_build_object('where', 'Fonte ' || v_src.title, 'detail',
          'A fonte está na biblioteca, mas sem nível oficial A a D vigente: a publicação ao aluno fica travada até o administrador definir o nível em Central › Fontes.');
      end if;
    end if;
  end loop;
  if jsonb_array_length(coalesce(pk -> 'fontes', '[]'::jsonb)) = 0 then v_problems := v_problems || 'O pacote não lista nenhuma fonte.'::text; end if;

  -- afirmações: cada uma com citação literal conferida, na página do PDF de uma fonte do pacote, e com os números e negações no trecho
  for c in select value from jsonb_array_elements(coalesce(pk -> 'afirmacoes', '[]'::jsonb)) loop
    v_txt := btrim(coalesce(c ->> 'texto', ''));
    if coalesce(c ->> 'id', '') = '' then v_problems := v_problems || 'Afirmação sem código.'::text; continue; end if;
    if v_claims ? (c ->> 'id') then v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ' repetida no pacote.'); continue; end if;
    v_claims := v_claims || jsonb_build_object(c ->> 'id', c);
    if v_txt = '' then v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ' sem texto.'); end if;
    if btrim(coalesce(c ->> 'citacao', '')) = '' then
      v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ' sem citação literal da fonte.');
    elsif coalesce((c #>> '{conferencia,ok}')::boolean, false) is not true then
      v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ': a citação não passou na conferência literal (conferencia.ok precisa ser true).');
    end if;
    if coalesce(c ->> 'pagina', '') !~ '^[1-9][0-9]{0,4}$' then v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ' sem página do PDF.'); end if;
    if coalesce(c ->> 'leitura', '') not in ('texto_digital', 'ocr') then
      v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ': informe o tipo de leitura do trecho (texto_digital ou ocr).');
    elsif c ->> 'leitura' = 'ocr' then
      v_warnings := v_warnings || jsonb_build_object('where', 'Afirmação ' || (c ->> 'id'), 'detail', 'Trecho lido por OCR: confira a citação no PDF original.');
    end if;
    if not (v_sources ? coalesce(c ->> 'fonte', '')) and not exists (select 1 from jsonb_array_elements(coalesce(pk -> 'fontes', '[]'::jsonb)) f where f ->> 'ref' = c ->> 'fonte') then
      v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ' cita a fonte "' || coalesce(c ->> 'fonte', '?') || '", que não está na lista de fontes do pacote.');
    end if;
    if exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(c -> 'tipos_criticos') = 'array' then c -> 'tipos_criticos' else '[]'::jsonb end) k
               where k not in ('dose', 'route', 'frequency', 'duration', 'contraindication', 'interaction', 'diagnostic_criterion', 'screening_interval', 'emergency_conduct')) then
      v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ': tipo crítico desconhecido.');
    end if;
    if v_txt <> '' and btrim(coalesce(c ->> 'citacao', '')) <> '' then
      select coalesce(array_agg(n), '{}') into v_miss from unnest(public.ch_numbers(v_txt)) n where not (n = any (public.ch_numbers(c ->> 'citacao')));
      select coalesce(array_agg(n), '{}') into v_neg from unnest(public.ch_negations(v_txt)) n where not (n = any (public.ch_negations(c ->> 'citacao')));
      if cardinality(v_miss) > 0 then
        v_problems := v_problems || ('Afirmação ' || (c ->> 'id') || ': valores que não constam do trecho citado: ' || array_to_string(v_miss, ', ') || '.');
      elsif cardinality(v_neg) > 0 then
        -- como o processamento faz (ch_worker_link_evidence): a evidência entra como "insuficiente", nunca "compatível", e a
        -- publicação fica travada até o revisor corrigir o texto da afirmação ou ligar um trecho que traga a condição
        v_negfail := v_negfail || jsonb_build_object(c ->> 'id', to_jsonb(v_neg));
        v_warnings := v_warnings || jsonb_build_object('where', 'Afirmação ' || (c ->> 'id'), 'detail',
          'A afirmação tem condição ou negação (' || array_to_string(v_neg, ', ') || ') que não aparece no trecho citado. Pela regra da Central a evidência entrou como '
          || '"insuficiente" e a publicação fica travada até corrigir o texto da afirmação (importando o pacote corrigido) ou ligar um trecho que traga a condição.');
      end if;
    end if;
  end loop;
  if v_claims = '{}'::jsonb then v_problems := v_problems || 'O pacote não tem nenhuma afirmação clínica.'::text; end if;

  -- texto da aula: parágrafo clínico cita afirmação; códigos existem; números do parágrafo clínico estão nas afirmações citadas
  if jsonb_typeof(pk #> '{aula,sections}') is distinct from 'array' or jsonb_array_length(pk #> '{aula,sections}') = 0 then
    v_problems := v_problems || 'O pacote não tem o texto da aula (aula.sections).'::text;
  end if;
  i := 0;
  for s in select value from jsonb_array_elements(case when jsonb_typeof(pk #> '{aula,sections}') = 'array' then pk #> '{aula,sections}' else '[]'::jsonb end) loop
    i := i + 1; j := 0;
    for p in select value from jsonb_array_elements(case when jsonb_typeof(s -> 'paragraphs') = 'array' then s -> 'paragraphs' else '[]'::jsonb end) loop
      j := j + 1;
      if btrim(coalesce(p ->> 'text', '')) = '' then v_problems := v_problems || ('Seção ' || i || ', parágrafo ' || j || ' sem texto.'); continue; end if;
      if coalesce((p ->> 'clinical')::boolean, false) and coalesce(jsonb_array_length(case when jsonb_typeof(p -> 'claim_ids') = 'array' then p -> 'claim_ids' end), 0) = 0 then
        v_problems := v_problems || ('Seção "' || coalesce(s ->> 'heading', i::text) || '", parágrafo ' || j || ': parágrafo clínico sem afirmação citada.');
      end if;
      select string_agg(k, ', ') into v_txt from jsonb_array_elements_text(case when jsonb_typeof(p -> 'claim_ids') = 'array' then p -> 'claim_ids' else '[]'::jsonb end) k where not (v_claims ? k);
      if v_txt is not null then v_problems := v_problems || ('Seção "' || coalesce(s ->> 'heading', i::text) || '", parágrafo ' || j || ' cita afirmação que não está no pacote: ' || v_txt || '.'); end if;
      select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) || v_used into v_used from jsonb_array_elements_text(case when jsonb_typeof(p -> 'claim_ids') = 'array' then p -> 'claim_ids' else '[]'::jsonb end) k;
      select string_agg(coalesce(v_claims #>> array[k, 'texto'], ''), ' ') into v_sup from jsonb_array_elements_text(case when jsonb_typeof(p -> 'claim_ids') = 'array' then p -> 'claim_ids' else '[]'::jsonb end) k;
      v_miss := public.ch_import_numbers_outside(p ->> 'text', coalesce(v_sup, ''));
      if cardinality(v_miss) > 0 then
        if coalesce((p ->> 'clinical')::boolean, false) then
          v_problems := v_problems || ('Seção "' || coalesce(s ->> 'heading', i::text) || '", parágrafo ' || j || ': número sem sustentação nas afirmações citadas: ' || array_to_string(v_miss, ', ') || '.');
        else
          v_warnings := v_warnings || jsonb_build_object('where', coalesce(s ->> 'heading', 'Seção ' || i) || ' §' || j,
            'detail', 'Parágrafo não clínico com números (' || array_to_string(v_miss, ', ') || '): confira que é só o caso ou o contexto, sem conduta.');
        end if;
      end if;
    end loop;
  end loop;

  -- materiais: só afirmações que estão no texto da aula (a mesma base revisada); números dos pontos-chave e flashcards sustentados
  for r in
    select 'Ponto-chave ' || o as onde, it2 as item, coalesce(it2 ->> 'text', '') as texto, true as numeros
      from jsonb_array_elements(coalesce(pk #> '{resumo,items}', '[]'::jsonb)) with ordinality t (it2, o)
    union all
    select 'Card ' || o, it2, coalesce(it2 ->> 'text', ''), true from jsonb_array_elements(coalesce(pk #> '{visuais,cards}', '[]'::jsonb)) with ordinality t (it2, o)
    union all
    select 'Flashcard ' || o, it2, coalesce(it2 ->> 'front', '') || ' ' || coalesce(it2 ->> 'back', ''), true from jsonb_array_elements(coalesce(pk #> '{flashcards,cards}', '[]'::jsonb)) with ordinality t (it2, o)
    union all
    select 'Questão ' || o, it2, coalesce((select string_agg(y ->> 'text', ' ') from jsonb_array_elements(coalesce(it2 -> 'options', '[]'::jsonb) || coalesce(it2 -> 'comments', '[]'::jsonb)) y), ''), false
      from jsonb_array_elements(coalesce(pk #> '{questoes,items}', '[]'::jsonb)) with ordinality t (it2, o)
    union all
    select 'Comando visual ' || coalesce(it2 ->> 'modelo', o::text), it2, '', false from jsonb_array_elements(coalesce(pk #> '{visuais,comandos}', '[]'::jsonb)) with ordinality t (it2, o)
  loop
    if coalesce(jsonb_array_length(case when jsonb_typeof(r.item -> 'claim_ids') = 'array' then r.item -> 'claim_ids' end), 0) = 0 then
      v_problems := v_problems || (r.onde || ' sem afirmação citada.'); continue;
    end if;
    select string_agg(k, ', ') into v_txt from jsonb_array_elements_text(r.item -> 'claim_ids') k where not (v_used ? k);
    if v_txt is not null then v_problems := v_problems || (r.onde || ' cita afirmação que não está no texto da aula: ' || v_txt || '.'); continue; end if;
    select string_agg(coalesce(v_claims #>> array[k, 'texto'], ''), ' ') into v_sup from jsonb_array_elements_text(r.item -> 'claim_ids') k;
    v_miss := public.ch_import_numbers_outside(r.texto, coalesce(v_sup, ''));
    if cardinality(v_miss) > 0 then
      if r.numeros then
        v_problems := v_problems || (r.onde || ': número sem sustentação nas afirmações citadas: ' || array_to_string(v_miss, ', ') || '.');
      else
        v_warnings := v_warnings || jsonb_build_object('where', r.onde, 'detail', 'Números fora das afirmações citadas (' || array_to_string(v_miss, ', ') || '): confira na revisão.');
      end if;
    end if;
  end loop;
  for r in select o, it2 from jsonb_array_elements(coalesce(pk #> '{flashcards,cards}', '[]'::jsonb)) with ordinality t (it2, o) loop
    if btrim(coalesce(r.it2 ->> 'front', '')) = '' or btrim(coalesce(r.it2 ->> 'back', '')) = '' then v_problems := v_problems || ('Flashcard ' || r.o || ' sem frente ou sem verso.'); end if;
  end loop;
  for r in select o, it2 from jsonb_array_elements(coalesce(pk #> '{questoes,items}', '[]'::jsonb)) with ordinality t (it2, o) loop
    if btrim(coalesce(r.it2 ->> 'stem', '')) = '' or jsonb_array_length(coalesce(r.it2 -> 'options', '[]'::jsonb)) <> 4
       or (select count(distinct y ->> 'id') from jsonb_array_elements(coalesce(r.it2 -> 'options', '[]'::jsonb)) y) <> 4
       or not exists (select 1 from jsonb_array_elements(coalesce(r.it2 -> 'options', '[]'::jsonb)) y where y ->> 'id' = r.it2 ->> 'correct') then
      v_problems := v_problems || ('Questão ' || r.o || ': precisa de enunciado, 4 alternativas diferentes e a letra certa entre elas.');
    end if;
  end loop;

  -- o que o aluno lê não leva referência (decisão do dono, 13/10): sem marca de citação ("[1]", "[TB01]"), sem seção "Referências" ou
  -- "Trechos citados" no texto da aula, nos pontos-chave, nos flashcards e nas questões
  for r in
    select 'Seção "' || coalesce(sec ->> 'heading', '') || '"' as onde, coalesce(sec ->> 'heading', '') as texto, true as titulo
      from jsonb_array_elements(case when jsonb_typeof(pk #> '{aula,sections}') = 'array' then pk #> '{aula,sections}' else '[]'::jsonb end) sec
    union all select 'Seção "' || coalesce(sec ->> 'heading', '') || '", parágrafo ' || o, coalesce(pa ->> 'text', ''), false
      from jsonb_array_elements(case when jsonb_typeof(pk #> '{aula,sections}') = 'array' then pk #> '{aula,sections}' else '[]'::jsonb end) sec,
           jsonb_array_elements(case when jsonb_typeof(sec -> 'paragraphs') = 'array' then sec -> 'paragraphs' else '[]'::jsonb end) with ordinality t (pa, o)
    union all select 'Ponto-chave ' || o, coalesce(it2 ->> 'text', ''), false from jsonb_array_elements(coalesce(pk #> '{resumo,items}', '[]'::jsonb)) with ordinality t (it2, o)
    union all select 'Flashcard ' || o, coalesce(it2 ->> 'front', '') || ' ' || coalesce(it2 ->> 'back', ''), false from jsonb_array_elements(coalesce(pk #> '{flashcards,cards}', '[]'::jsonb)) with ordinality t (it2, o)
    union all select 'Questão ' || o, coalesce(it2 ->> 'stem', '') || ' ' || coalesce((select string_agg(y ->> 'text', ' ') from jsonb_array_elements(coalesce(it2 -> 'options', '[]'::jsonb) || coalesce(it2 -> 'comments', '[]'::jsonb)) y), ''), false
      from jsonb_array_elements(coalesce(pk #> '{questoes,items}', '[]'::jsonb)) with ordinality t (it2, o)
  loop
    if r.texto ~ '\[\s*[A-Za-z]{0,4}\s*\d+[^\]]{0,40}\]' or public.fold_text(r.texto) ~ 'trechos citados'
       or (r.titulo and public.fold_text(btrim(r.texto)) in ('referencias', 'referencias bibliograficas', 'fontes', 'bibliografia')) then
      v_problems := v_problems || (r.onde || ': o texto do aluno não pode trazer referência (marca de citação, "Referências" ou "Trechos citados"); as fontes ficam só nas afirmações.');
    end if;
  end loop;

  -- arquivos (imagens e PDF): só referências conferíveis no depósito "content-hub"
  for r in select o, it2 from jsonb_array_elements(coalesce(pk -> 'arquivos', '[]'::jsonb)) with ordinality t (it2, o) loop
    if coalesce(r.it2 ->> 'caminho', '') !~ '^aulas-prontas/[A-Za-z0-9][A-Za-z0-9/_.-]*$' or r.it2 ->> 'caminho' ~ '\.\.' then
      v_problems := v_problems || ('Arquivo ' || r.o || ': caminho no depósito inválido (precisa começar com "aulas-prontas/").');
    end if;
    if coalesce(r.it2 ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then v_problems := v_problems || ('Arquivo ' || r.o || ' (' || coalesce(r.it2 ->> 'caminho', '?') || ') sem sha256.'); end if;
    if coalesce(r.it2 ->> 'material', '') not in ('lesson', 'visual_cards', 'flashcards', 'questions', 'summary') then
      v_problems := v_problems || ('Arquivo ' || r.o || ' (' || coalesce(r.it2 ->> 'caminho', '?') || '): material de destino desconhecido.');
    end if;
    if coalesce(r.it2 ->> 'tipo', '') ~ '^image/' and btrim(coalesce(r.it2 ->> 'texto_alternativo', '')) = '' then
      v_problems := v_problems || ('Imagem ' || coalesce(r.it2 ->> 'caminho', r.o::text) || ' sem texto alternativo.');
    end if;
  end loop;

  if cardinality(v_problems) > 0 then
    raise exception 'Aula não importada. Corrija o pacote: % ', array_to_string(v_problems, ' | ') using errcode = '22023';
  end if;

  -- ------------------------------------------------ unidade (tema + título)
  select u.id into v_unit from public.ch_units u where u.theme_node_id = v_node and lower(btrim(u.title)) = lower(v_title) order by u.created_at limit 1;

  -- mesmo pacote já importado nesta unidade: nada muda
  if v_unit is not null then
    select * into v_target from public.ch_unit_versions v where v.unit_id = v_unit and v.base_hash = v_mark order by v.version desc limit 1;
    if found then
      -- nada é gravado (nem no Registro). Só se o arquivo final da aula ainda não existe e o pedido ao processamento morreu (ex.: o
      -- processamento ainda era o antigo), o pedido volta para a fila; pedido já na fila fica como está.
      if v_target.status in ('draft', 'awaiting_review', 'approved')
         and not exists (select 1 from public.ch_materials m join public.ch_renders x on x.material_id = m.id and x.material_hash = m.content_hash
                          where m.unit_version_id = v_target.id and m.kind = 'lesson')
         and exists (select 1 from public.ch_jobs jb where jb.scope_key = 'import:' || v_target.id::text and jb.step = 'render' and jb.status in ('dead', 'failed', 'blocked')) then
        perform public.ch_worker_next(null, 'render', jsonb_build_object('content_hash', v_target.content_hash, 'package_hash', v_pkg_hash), 'import:' || v_target.id::text);
      end if;
      return jsonb_build_object('resultado', 'sem_mudanca', 'unit_id', v_unit, 'version_id', v_target.id, 'version', v_target.version, 'status', v_target.status,
        'afirmacoes', (select count(*)::int from public.ch_unit_claims uc where uc.unit_version_id = v_target.id),
        'materiais', (select coalesce(jsonb_agg(m.kind order by m.kind), '[]'::jsonb) from public.ch_materials m where m.unit_version_id = v_target.id),
        'avisos', v_warnings);
    end if;
  else
    v_unit := public.app_ch_create_unit(v_node, v_title);
    v_new_unit := true;
  end if;

  -- ------------------------------------------------ trechos, afirmações e evidências
  for c in select value from jsonb_array_elements(pk -> 'afirmacoes') loop
    v_src := null;
    select * into v_src from public.ch_sources where id = (v_sources #>> array[c ->> 'fonte', 'id'])::uuid;
    -- trecho da fonte: a página e a citação literal (reaproveitado se já existir igual)
    select sp.id into v_passage from public.ch_source_passages sp
     where sp.source_id = v_src.id and sp.page = (c ->> 'pagina')::int and sp.text = btrim(c ->> 'citacao') order by sp.id limit 1;
    if v_passage is null then
      insert into public.ch_source_passages (source_id, section, page, theme, text, reading_kind, literal_check)
      values (v_src.id, 'Página ' || (c ->> 'pagina') || ' do PDF' || coalesce(' (página impressa ' || nullif(btrim(c ->> 'pagina_impressa'), '') || ')', ''),
              (c ->> 'pagina')::int, (select n.name from public.ch_taxonomy_nodes n where n.id = v_node), btrim(c ->> 'citacao'), c ->> 'leitura',
              coalesce(c -> 'conferencia', '{}'::jsonb) || jsonb_build_object('aula', v_code, 'pagina_pdf', (c ->> 'pagina')::int, 'pagina_impressa', c ->> 'pagina_impressa'))
      returning id into v_passage;
      v_new_passages := v_new_passages + 1;
    elsif exists (select 1 from public.ch_source_passages sp where sp.id = v_passage and (sp.reading_kind is null or sp.literal_check is null)) then
      update public.ch_source_passages set reading_kind = coalesce(reading_kind, c ->> 'leitura'),
             literal_check = coalesce(literal_check, coalesce(c -> 'conferencia', '{}'::jsonb) || jsonb_build_object('aula', v_code, 'pagina_pdf', (c ->> 'pagina')::int, 'pagina_impressa', c ->> 'pagina_impressa'))
       where id = v_passage;
    end if;
    -- afirmação desta aula com o mesmo texto e a mesma evidência: reaproveitada (a conferência humana dela continua valendo)
    v_id := null;
    select cl.id into v_id from public.ch_claims cl
     where cl.context #>> '{aula_pronta,codigo}' = v_code and cl.context #>> '{aula_pronta,id}' = c ->> 'id' and cl.statement = btrim(c ->> 'texto')
       and exists (select 1 from public.ch_evidence e where e.claim_id = cl.id and e.source_id = v_src.id and e.passage_id = v_passage
                     and e.verdict = case when v_negfail ? (c ->> 'id') then 'insufficient' else 'compatible' end and e.discarded_at is null and not e.stale)
     order by cl.created_at desc limit 1;
    if v_id is null then
      v_kinds_crit := array(select distinct k from unnest(public.ch_import_critical_kinds(c ->> 'texto') ||
                              array(select jsonb_array_elements_text(case when jsonb_typeof(c -> 'tipos_criticos') = 'array' then c -> 'tipos_criticos' else '[]'::jsonb end))) k order by k);
      v_id := public.app_ch_add_claim(jsonb_build_object('statement', btrim(c ->> 'texto'), 'theme_node_id', v_node, 'critical_kinds', to_jsonb(v_kinds_crit),
                'context', jsonb_build_object('aula_pronta', jsonb_build_object('codigo', v_code, 'id', c ->> 'id', 'tipo', c ->> 'tipo'),
                                              'pagina_impressa', c ->> 'pagina_impressa', 'leitura', c ->> 'leitura')));
      update public.ch_claims set origin = 'manual' where id = v_id;
      perform public.app_ch_link_evidence(v_id, jsonb_build_object('source_id', v_src.id, 'passage_id', v_passage, 'quote', btrim(c ->> 'citacao'),
                                                                   'verdict', case when v_negfail ? (c ->> 'id') then 'insufficient' else 'compatible' end,
                                                                   'page', (c ->> 'pagina')::int));
      insert into public.ch_claim_history (claim_id, actor_id, event, details)
      values (v_id, (select auth.uid()), 'imported', jsonb_strip_nulls(jsonb_build_object('aula', v_code, 'id', c ->> 'id', 'conferencia', c -> 'conferencia', 'leitura', c ->> 'leitura',
                                                                          'negacoes_fora_do_trecho', v_negfail -> (c ->> 'id'))));
      v_new_claims := v_new_claims + 1; v_new_evidence := v_new_evidence + 1;
    end if;
    v_map := v_map || jsonb_build_object(c ->> 'id', v_id);
  end loop;

  -- ------------------------------------------------ texto da unidade e materiais (com os números das afirmações no banco)
  select jsonb_build_object('sections', coalesce(jsonb_agg(jsonb_build_object('heading', btrim(coalesce(sec ->> 'heading', '')),
           'paragraphs', (select coalesce(jsonb_agg(jsonb_build_object('text', btrim(pa ->> 'text'), 'clinical', coalesce((pa ->> 'clinical')::boolean, false),
                                  'claim_ids', public.ch_import_map_ids(pa -> 'claim_ids', v_map)) order by po), '[]'::jsonb)
                          from jsonb_array_elements(sec -> 'paragraphs') with ordinality t2 (pa, po) where btrim(coalesce(pa ->> 'text', '')) <> '')) order by so), '[]'::jsonb))
    into v_content
    from jsonb_array_elements(pk #> '{aula,sections}') with ordinality t (sec, so);
  v_hash := public.ch_hash(v_content);

  -- referências da aula: as fontes das evidências (com versão e página), como a aula montada pelo processamento
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('source', z.title, 'organ', z.organ, 'version', z.version, 'published_on', z.published_on, 'url', z.url, 'page', z.page))
                            order by z.fo, z.page), '[]'::jsonb)
    into v_refs
    from (select distinct sr.title, sr.organ, sr.version, sr.published_on, sr.url, (cc ->> 'pagina')::int as page,
                 (select min(fo2) from jsonb_array_elements(pk -> 'fontes') with ordinality f2 (fx, fo2) where fx ->> 'ref' = cc ->> 'fonte') as fo
            from jsonb_array_elements(pk -> 'afirmacoes') cc join public.ch_sources sr on sr.id = (v_sources #>> array[cc ->> 'fonte', 'id'])::uuid
           where v_used ? (cc ->> 'id')) z;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('caminho', f ->> 'caminho', 'sha256', f ->> 'sha256', 'tipo', f ->> 'tipo', 'bytes', (f ->> 'bytes')::bigint,
           'texto_alternativo', nullif(btrim(coalesce(f ->> 'texto_alternativo', '')), ''), 'descricao', nullif(btrim(coalesce(f ->> 'descricao', '')), ''),
           'deposito', 'content-hub', 'material', f ->> 'material')) order by fo), '[]'::jsonb)
    into v_files from jsonb_array_elements(coalesce(pk -> 'arquivos', '[]'::jsonb)) with ordinality t (f, fo);

  v_lesson := jsonb_build_object('title', v_title, 'sections', v_content -> 'sections', 'references', v_refs, 'label', coalesce(nullif(btrim(pk #>> '{aula,label}'), ''), 'Material StaziaMed'))
              || case when nullif(btrim(coalesce(pk ->> 'escopo', '')), '') is not null then jsonb_build_object('scope_note', btrim(pk ->> 'escopo')) else '{}'::jsonb end
              || case when exists (select 1 from jsonb_array_elements(v_files) f where f ->> 'material' = 'lesson')
                      then jsonb_build_object('arquivos', (select jsonb_agg(f) from jsonb_array_elements(v_files) f where f ->> 'material' = 'lesson')) else '{}'::jsonb end;
  if jsonb_array_length(coalesce(pk #> '{resumo,items}', '[]'::jsonb)) > 0 then
    v_summary := jsonb_build_object('title', v_title, 'items', (select jsonb_agg(jsonb_build_object('text', btrim(it2 ->> 'text'), 'claim_ids', public.ch_import_map_ids(it2 -> 'claim_ids', v_map)) order by o)
                                                               from jsonb_array_elements(pk #> '{resumo,items}') with ordinality t (it2, o)));
  end if;
  -- cards: os do pacote ou, como no processamento, os pontos-chave; mais os comandos do editor de Materiais visuais e as imagens
  if jsonb_array_length(coalesce(pk #> '{visuais,cards}', '[]'::jsonb)) > 0 or v_summary is not null then
    v_cards := jsonb_build_object('title', v_title, 'label', 'Card StaziaMed',
      'cards', case when jsonb_array_length(coalesce(pk #> '{visuais,cards}', '[]'::jsonb)) > 0
                    then (select jsonb_agg(jsonb_build_object('text', btrim(it2 ->> 'text'), 'claim_ids', public.ch_import_map_ids(it2 -> 'claim_ids', v_map)) order by o)
                            from jsonb_array_elements(pk #> '{visuais,cards}') with ordinality t (it2, o))
                    else v_summary -> 'items' end)
      || case when jsonb_array_length(coalesce(pk #> '{visuais,comandos}', '[]'::jsonb)) > 0
              then jsonb_build_object('comandos', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('modelo', it2 ->> 'modelo', 'titulo', it2 ->> 'titulo', 'comando', it2 ->> 'comando',
                                                                    'claim_ids', public.ch_import_map_ids(it2 -> 'claim_ids', v_map))) order by o)
                                                   from jsonb_array_elements(pk #> '{visuais,comandos}') with ordinality t (it2, o))) else '{}'::jsonb end
      || case when exists (select 1 from jsonb_array_elements(v_files) f where f ->> 'material' = 'visual_cards')
              then jsonb_build_object('arquivos', (select jsonb_agg(f) from jsonb_array_elements(v_files) f where f ->> 'material' = 'visual_cards')) else '{}'::jsonb end;
  end if;
  if jsonb_array_length(coalesce(pk #> '{flashcards,cards}', '[]'::jsonb)) > 0 then
    v_flash := jsonb_build_object('title', v_title, 'cards', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('front', btrim(it2 ->> 'front'), 'back', btrim(it2 ->> 'back'),
                                                                 'card_id', nullif(btrim(coalesce(it2 ->> 'card_id', '')), ''), 'claim_ids', public.ch_import_map_ids(it2 -> 'claim_ids', v_map))) order by o)
                                                              from jsonb_array_elements(pk #> '{flashcards,cards}') with ordinality t (it2, o)))
               || case when exists (select 1 from jsonb_array_elements(v_files) f where f ->> 'material' = 'flashcards')
                       then jsonb_build_object('arquivos', (select jsonb_agg(f) from jsonb_array_elements(v_files) f where f ->> 'material' = 'flashcards')) else '{}'::jsonb end;
  end if;
  if jsonb_array_length(coalesce(pk #> '{questoes,items}', '[]'::jsonb)) > 0 then
    v_questions := jsonb_build_object('title', v_title, 'items', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('number', it2 -> 'number', 'dimension', it2 ->> 'dimension', 'stem', btrim(it2 ->> 'stem'),
                                                                     'options', it2 -> 'options', 'correct', it2 ->> 'correct', 'comments', coalesce(it2 -> 'comments', '[]'::jsonb),
                                                                     'claim_ids', public.ch_import_map_ids(it2 -> 'claim_ids', v_map),
                                                                     'author', 'StaziaMed', 'official', false, 'label', 'Questão StaziaMed (não é questão oficial do Inep)')) order by o)
                                                                  from jsonb_array_elements(pk #> '{questoes,items}') with ordinality t (it2, o)));
  end if;

  -- ------------------------------------------------ versão: a importada ainda não aprovada é atualizada; senão, versão nova
  select * into v_target from public.ch_unit_versions v
   where v.unit_id = v_unit and v.status in ('draft', 'awaiting_review')
     and (coalesce(v.base_hash, '') like 'aula-pronta:%' or (v.content = '{"sections": []}'::jsonb and not exists (select 1 from public.ch_materials m where m.unit_version_id = v.id)))
   order by v.version desc limit 1;
  if found then
    v_result := case when v_new_unit then 'criada' else 'atualizada' end;
  else
    select * into v_prev from public.ch_unit_versions v where v.unit_id = v_unit and v.status in ('approved', 'published', 'needs_update') order by v.version desc limit 1;
    insert into public.ch_unit_versions (unit_id, version, origin, status, content, content_hash, candidate_of, candidate_reason)
    values (v_unit, (select max(version) + 1 from public.ch_unit_versions where unit_id = v_unit), 'independent', 'draft', '{"sections": []}'::jsonb,
            public.ch_hash('{"sections": []}'::jsonb), v_prev.id,
            case when v_prev.id is not null then 'Aula pronta ' || v_code || ' importada de novo com conteúdo diferente da versão ' || v_prev.version || ' (que continua como está).' end)
    returning * into v_target;
    v_result := 'nova_versao';
  end if;
  v_version := v_target.id;

  perform public.app_ch_save_unit_version(v_version, v_content, 'independent', nullif(btrim(coalesce(pk ->> 'escopo', '')), ''));
  perform public.app_ch_save_material(v_version, 'lesson', v_lesson, null, 'aula-pronta-1');
  v_kinds := array['lesson'];
  if v_summary is not null then perform public.app_ch_save_material(v_version, 'summary', v_summary, null, 'aula-pronta-1'); v_kinds := v_kinds || 'summary'::text; end if;
  if v_cards is not null then perform public.app_ch_save_material(v_version, 'visual_cards', v_cards, null, 'aula-pronta-1'); v_kinds := v_kinds || 'visual_cards'::text; end if;
  if v_flash is not null then perform public.app_ch_save_material(v_version, 'flashcards', v_flash, null, 'aula-pronta-1'); v_kinds := v_kinds || 'flashcards'::text; end if;
  if v_questions is not null then perform public.app_ch_save_material(v_version, 'questions', v_questions, null, 'aula-pronta-1'); v_kinds := v_kinds || 'questions'::text; end if;
  -- material de uma importação anterior que não veio neste pacote sai da versão (as aprovações já deixaram de valer acima)
  delete from public.ch_materials m where m.unit_version_id = v_version and not (m.kind = any (v_kinds));
  update public.ch_unit_versions set base_hash = v_mark, generated_by_model = null,
         review_flags = (select coalesce(jsonb_agg(jsonb_build_object('severity', 'minor', 'kind', 'other', 'where', w ->> 'where', 'detail', w ->> 'detail', 'by', 'importacao')), '[]'::jsonb)
                           from jsonb_array_elements(v_warnings) w)
   where id = v_version;
  if (select status from public.ch_unit_versions where id = v_version) = 'draft' then
    perform public.app_ch_submit_for_review(v_version);
  end if;

  -- arquivo final da aula e dos cards (PDF conferido): gerado pelo processamento de sempre, só desta versão, sem IA
  v_render := public.ch_worker_next(null, 'render', jsonb_build_object('content_hash', v_hash, 'package_hash', v_pkg_hash), 'import:' || v_version::text);

  select status into v_status from public.ch_unit_versions where id = v_version;
  perform public.ch_log('unit.import', v_version::text, jsonb_build_object('codigo', v_code, 'title', v_title, 'result', v_result, 'package_hash', v_pkg_hash,
    'content_hash', v_hash, 'claims', jsonb_array_length(pk -> 'afirmacoes'), 'new_claims', v_new_claims, 'new_passages', v_new_passages,
    'new_evidence', v_new_evidence, 'materials', to_jsonb(v_kinds), 'files', jsonb_array_length(v_files), 'warnings', jsonb_array_length(v_warnings),
    'render_job', v_render ->> 'id'));
  return jsonb_build_object('resultado', v_result, 'unit_id', v_unit, 'version_id', v_version,
    'version', (select version from public.ch_unit_versions where id = v_version), 'status', v_status, 'area_code', v_area,
    'afirmacoes', jsonb_array_length(pk -> 'afirmacoes'), 'afirmacoes_novas', v_new_claims, 'trechos_novos', v_new_passages, 'evidencias_novas', v_new_evidence,
    'materiais', to_jsonb(v_kinds), 'arquivos', jsonb_array_length(v_files), 'avisos', v_warnings, 'arquivo_final', 'pedido ao processamento');
end
$$;

-- ---------------------------------------------------------------- 4. Registro: nome da aula na ação nova (parte de 20261003009513)
create or replace function public.admin_audit_title(p_action text, p_target text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind constant text := split_part(coalesce(p_action, ''), '.', 1);
  v_title text;
begin
  if p_target is null then return null; end if;
  -- Central de Conteúdo: o alvo é a versão do conteúdo, o documento ou a fonte
  if p_action in ('publish', 'retire', 'unit.regenerate', 'approval.invalidate', 'unit.import', 'unit.new_version') or p_action like 'approve.%' then
    select u.title || ' (versão ' || v.version || ')' into v_title
      from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id::text = p_target;
    return v_title;
  end if;
  if p_action in ('document.register', 'document.rights', 'license.clean_references', 'license.undo_clean_references') then
    select d.name into v_title from public.ch_documents d where d.id::text = p_target;
    return v_title;
  end if;
  if p_action in ('source.register', 'source.authority', 'source.registry', 'source.change_resolved') then
    select s.title into v_title from public.ch_sources s where s.id::text = p_target;
    return v_title;
  end if;
  -- aulas e episódios; o alvo de "material de aula apagado" é o código do material (que já não existe), não o da aula
  if v_kind not in ('lesson', 'podcast') or p_action = 'lesson.material.delete' then return null; end if;
  if v_kind = 'lesson' then
    select l.title into v_title from public.lessons l where l.id::text = p_target;
  else
    select e.title into v_title from public.podcasts e where e.id::text = p_target;
  end if;
  if v_title is not null then return v_title; end if;
  -- item já apagado: o último título que o próprio registro guardou ao salvar
  select nullif(btrim(g.details ->> 'title'), '') into v_title
    from public.admin_audit_log g
   where g.target = p_target and g.action = v_kind || '.save'
   order by g.id desc limit 1;
  return v_title;
end
$$;


-- ---------------------------------------------------------------- 4b. o que o aluno lê da aula importada (parte de 20261003009861)
-- Igual à 9861, menos uma coisa: aula pronta importada não leva "Fontes oficiais desta aula" (nem página, nem trecho) ao aluno.
-- As outras unidades da Central continuam como antes.
create or replace function public.ch_student_lesson(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  u public.ch_units;
  v_topic text;
  v_rev timestamptz;
  v_updated boolean;
  v_head text;
  v_body text := '';
  v_refs text := '';
  v_points jsonb;
  s record;
  p record;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  select * into u from public.ch_units where id = v.unit_id;
  select n.name into v_topic from public.ch_taxonomy_nodes n where n.id = u.theme_node_id;
  select a.decided_at into v_rev from public.ch_approvals a
   where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash
   order by a.decided_at desc limit 1;
  v_updated := exists (select 1 from public.ch_publications x join public.ch_unit_versions xv on xv.id = x.unit_version_id
                       where xv.unit_id = u.id and x.unit_version_id <> p_version_id);
  v_head := 'Material StaziaMed · ' ||
    case when v_rev is null then 'aguardando revisão médica da área'
         else 'revisado por médico da área em ' || to_char((v_rev at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY') end ||
    case when v_updated then ' · atualizado em ' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY') else '' end ||
    ' · não é material oficial do Inep';
  for s in select x.sec from jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) with ordinality as x (sec, i) order by x.i loop
    if btrim(coalesce(s.sec ->> 'heading', '')) <> '' then v_body := v_body || btrim(s.sec ->> 'heading') || E'\n'; end if;
    for p in select y.t from jsonb_array_elements(coalesce(s.sec -> 'paragraphs', '[]'::jsonb)) with ordinality as z (para, j),
                  lateral (select btrim(coalesce(z.para ->> 'text', '')) as t) y
             where y.t <> '' order by z.j loop
      v_body := v_body || p.t || E'\n\n';
    end loop;
    if right(v_body, 1) <> E'\n' or right(v_body, 2) <> E'\n\n' then v_body := v_body || E'\n'; end if;
  end loop;
  -- unidade de aula pronta importada (qualquer versão dela, inclusive a "versão para corrigir") (9950, decisão do dono de 13/10): nenhuma referência nem lista de fontes no texto do aluno; as fontes e os
  -- trechos citados ficam na Central, para o revisor e a equipe
  for p in select distinct s2.organ, s2.title, s2.version, e.page
           from public.ch_unit_claims uc join public.ch_evidence e on e.claim_id = uc.claim_id
             join public.ch_sources s2 on s2.id = e.source_id
           where uc.unit_version_id = p_version_id and e.verdict = 'compatible' and public.ch_evidence_counts(e.id) and public.ch_is_official_source(s2.id)
             and not exists (select 1 from public.ch_unit_versions iv where iv.unit_id = v.unit_id and iv.base_hash like 'aula-pronta:%')
           order by s2.organ, s2.title, s2.version nulls last, e.page nulls last loop
    v_refs := v_refs || '• ' || p.organ || ' · ' || p.title || coalesce(' · versão ' || p.version, '') || coalesce(' · p. ' || p.page::text, '') || E'\n';
  end loop;
  select coalesce(jsonb_agg(btrim(it ->> 'text') order by o), '[]'::jsonb) into v_points
    from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'items', '[]'::jsonb)) with ordinality as t (it, o)
   where m.unit_version_id = p_version_id and m.kind = 'summary' and btrim(coalesce(it ->> 'text', '')) <> '';
  return jsonb_build_object(
    'title', u.title, 'topic', v_topic, 'area_code', public.ch_unit_area_code(p_version_id),
    'area', public.ch_student_area(public.ch_unit_area_code(p_version_id))::text,
    'summary', btrim(v_head || E'\n\n' || btrim(v_body) || case when v_refs <> '' then E'\n\nFontes oficiais desta aula\n' || btrim(v_refs) else '' end),
    'key_points', coalesce(v_points, '[]'::jsonb), 'reviewed_at', v_rev, 'updated', v_updated);
end
$$;
revoke execute on function public.ch_student_lesson(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 99. Permissões
revoke execute on function public.app_ch_import_lesson_package(jsonb) from public, anon;
grant execute on function public.app_ch_import_lesson_package(jsonb) to authenticated;
