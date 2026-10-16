-- =============================================================================
-- Editor profissional, expansão — CENTRAL DE CONTEÚDO + AULAS (013160). NÃO APLICADA em produção.
--
-- 1. Materiais da unidade (Central › Unidades › Materiais): legenda e transcrição de áudio/vídeo com formatação.
--    * O texto continua em ch_unit_materials.content.legenda / .transcricao (é o que a busca, a trava de citação e o aluno antigo
--      leem). A formatação fica em content.formatacao = { legenda?: envelope sdoc, transcricao?: envelope sdoc }.
--    * Inserir (app_ch_unit_material_insert) aceita p_item.formatacao.
--    * NOVA app_ch_unit_material_textos(item, {caption, transcript, formatacao}): muda legenda/transcrição de um áudio/vídeo.
--      Regra do dono (16/10): SÓ formatação (ch_campos_so_formatacao, 013110) não derruba as aprovações da versão e vale também na
--      versão PUBLICADA (o aluno vê na hora); fica no histórico "unit.material.format" com a formatação anterior.
--      Mudou o texto (ou a formatação traz conteúdo: link, nível de título...) = conteúdo: mesma regra de inserir (versão no ar não
--      se edita; material que o aluno vê derruba as aprovações, ch_unit_materials_touch), histórico "unit.material.edit".
--    * Materiais não entram no hash de conteúdo da versão (013080): a aprovação deles é a regra do ch_unit_materials_touch (009980).
--    * Tabela: células continuam texto (nada muda).
-- 2. Aluno: app_tema_aula leva, em cada mídia, a chave "formatacao" SÓ quando há formatação de forma válida para um campo que tem
--    texto (legenda/transcrição), e "pontos_chave_ricos" SÓ quando a aula tem pontos-chave com formatação. Sem formatação, a resposta
--    é IDÊNTICA à de antes (as chaves nem aparecem). A tela confere a projeção de novo (ParagrafoRico) e nunca usa HTML cru.
--    Continua só para aula publicada (ch_tema_aula_aberta) e só mídia ativa que o aluno vê.
-- 3. Editar aula (tabela lessons): pontos-chave com formatação — lessons.key_points_rico = lista ALINHADA a key_points (mesma
--    posição; null = ponto sem formatação), mesmo padrão do summary_rico (013040):
--    * regra de forma lessons_key_points_rico_forma (lista do mesmo tamanho dos pontos; cada item null ou envelope sdoc v1);
--    * gatilho lessons_key_points_rico_guard: aula da Central trancada (muda lá); pontos mudados por um caminho que não conhece a
--      formatação → fica só a formatação dos pontos que continuam iguais na mesma posição;
--    * guarda de fonte complementar no rico (ch_guard_complementar_save('key_points_rico'));
--    * lesson_view leva key_points_rico só quando os pontos chegaram inteiros a quem lê (sem a retirada de fonte complementar);
--    * app_admin_save_lesson: só formatação dos pontos (textos idênticos e ch_campos_conteudo igual) não pede nova conferência.
--
-- Corpos de partida (a definição MAIS NOVA de cada função no ramo):
--   app_tema_aula(text)                         ← 20261003013020_editor_pro_ricos_aluno.sql
--   lesson_view(lessons)                        ← 20261003013040_editor_pro_resumo_rico.sql
--   app_admin_save_lesson(jsonb)                ← 20261003013040_editor_pro_resumo_rico.sql
--   app_ch_unit_material_insert(uuid, jsonb)    ← 20261003009980_central_unidades.sql
-- Funções novas: ch_material_formatacao_aluno(jsonb), lessons_pontos_rico_forma(jsonb, integer), lessons_pontos_conteudo(text[], jsonb),
--   lessons_key_points_rico_guard(), app_ch_unit_material_textos(uuid, jsonb).
-- Depende da 013080 (ch_rico_conteudo...), 013110 (ch_formatacao_valida, ch_campos_conteudo, ch_campos_so_formatacao) e 013040.
-- Pode ser colada duas vezes. CONFERIR/DESFAZER: /Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013160-conferir.sql e 013160-desfazer.sql.
-- =============================================================================

-- ---------------------------------------------------------------- 1. funções puras de apoio
-- Formatação de um material para o ALUNO: só legenda/transcrição que têm texto e envelope de forma válida. '{}' = nada (a chave some).
create or replace function public.ch_material_formatacao_aluno(p_content jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select coalesce((select jsonb_build_object('formatacao', jsonb_object_agg(e.key, e.value))
                     from jsonb_each(case when jsonb_typeof(p_content -> 'formatacao') = 'object' then p_content -> 'formatacao' else '{}'::jsonb end) e
                    where e.key in ('legenda', 'transcricao')
                      and btrim(coalesce(p_content ->> e.key, '')) <> ''
                      and public.ch_formatacao_valida(jsonb_build_object(e.key, e.value))
                   having count(*) > 0), '{}'::jsonb)
$$;
revoke execute on function public.ch_material_formatacao_aluno(jsonb) from public, anon, authenticated;

-- Forma da lista de formatação dos pontos-chave: null, ou lista do MESMO tamanho dos pontos com null ou envelope sdoc v1 em cada posição.
create or replace function public.lessons_pontos_rico_forma(p_rico jsonb, p_n integer) returns boolean
  language sql immutable set search_path = ''
as $$
  select p_rico is null or (
    jsonb_typeof(p_rico) = 'array'
    and jsonb_array_length(p_rico) = coalesce(p_n, 0)
    and octet_length(p_rico::text) <= 400000
    and not exists (select 1 from jsonb_array_elements(p_rico) e
                     where jsonb_typeof(e) <> 'null'
                       and not (jsonb_typeof(e) = 'object' and e -> 'f' = '"sdoc"'::jsonb and e -> 'v' = '1'::jsonb
                                and jsonb_typeof(e -> 'doc') = 'object' and e -> 'doc' -> 'type' = '"doc"'::jsonb
                                and jsonb_typeof(e -> 'doc' -> 'content') = 'array' and (e - 'f' - 'v' - 'doc') = '{}'::jsonb)))
$$;
-- (a regra de forma da tabela chama esta função como quem grava: a equipe precisa poder executá-la; visitante não)
revoke execute on function public.lessons_pontos_rico_forma(jsonb, integer) from public, anon;

-- O que, na formatação dos pontos, é CONTEÚDO (regra da 013110: ch_campos_conteudo, campo = posição do ponto). '{}' = só formatação.
create or replace function public.lessons_pontos_conteudo(p_pontos text[], p_rico jsonb) returns jsonb
  language sql stable set search_path = ''
as $$
  select public.ch_campos_conteudo(
    coalesce((select jsonb_object_agg(t.o::text, t.x) from unnest(coalesce(p_pontos, '{}'::text[])) with ordinality as t (x, o)), '{}'::jsonb),
    coalesce((select jsonb_object_agg(t.o::text, t.e) from jsonb_array_elements(case when jsonb_typeof(p_rico) = 'array' then p_rico else '[]'::jsonb end) with ordinality as t (e, o)
               where jsonb_typeof(t.e) = 'object'), '{}'::jsonb))
$$;
revoke execute on function public.lessons_pontos_conteudo(text[], jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. lessons.key_points_rico (coluna, forma, gatilhos)
alter table public.lessons add column if not exists key_points_rico jsonb;
alter table public.lessons drop constraint if exists lessons_key_points_rico_forma;
alter table public.lessons add constraint lessons_key_points_rico_forma check (public.lessons_pontos_rico_forma(key_points_rico, cardinality(key_points)));

create or replace function public.lessons_key_points_rico_guard() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.origin = 'central' and new.key_points_rico is distinct from old.key_points_rico
     and coalesce(current_setting('app.ch_distribute', true), '') <> 'on' then
    raise exception 'Esta aula vem da Central de Conteúdo: o texto, os pontos-chave, a área e a publicação mudam lá, com nova revisão médica.' using errcode = '22023';
  end if;
  if coalesce(cardinality(new.key_points), 0) = 0 then
    new.key_points_rico := null;
  elsif tg_op = 'UPDATE' and new.key_points is distinct from old.key_points and new.key_points_rico is not distinct from old.key_points_rico then
    -- os pontos mudaram por um caminho que não conhece a formatação: fica só a dos pontos que continuam iguais na mesma posição
    new.key_points_rico := (select case when bool_or(y.r is not null) then jsonb_agg(y.r order by y.o) end
                              from (select t.o, case when t.o <= coalesce(cardinality(old.key_points), 0) and old.key_points[t.o::int] = t.p
                                                     then nullif(old.key_points_rico -> (t.o - 1)::int, 'null'::jsonb) end as r
                                      from unnest(new.key_points) with ordinality as t (p, o)) y);
  end if;
  return new;
end
$$;
revoke execute on function public.lessons_key_points_rico_guard() from public, anon, authenticated;
drop trigger if exists lessons_key_points_rico_guard_trg on public.lessons;
create trigger lessons_key_points_rico_guard_trg before insert or update on public.lessons for each row execute function public.lessons_key_points_rico_guard();

-- o rico dos pontos também passa pela guarda de fonte complementar (a mesma do texto, 009621; como o summary_rico na 013040)
drop trigger if exists lessons_guard_complementar_pontos_rico on public.lessons;
create trigger lessons_guard_complementar_pontos_rico before insert or update of key_points_rico on public.lessons
  for each row execute function public.ch_guard_complementar_save('key_points_rico');

-- ---------------------------------------------------------------- 3. lesson_view (corpo da 013040 + key_points_rico)
-- O rico só vai quando o texto correspondente chegou inteiro a quem lê (a retirada de fonte complementar não mexeu nele).
create or replace function public.lesson_view(l public.lessons) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select v.j
    || case when l.summary_rico is not null and v.j ->> 'summary' is not distinct from l.summary
            then jsonb_build_object('summary_rico', l.summary_rico) else '{}'::jsonb end
    || case when l.key_points_rico is not null and v.j -> 'key_points' is not distinct from to_jsonb(l.key_points)
            then jsonb_build_object('key_points_rico', l.key_points_rico) else '{}'::jsonb end
  from (select public.ch_scrub_json(public.ch_raw_lesson_view(l)) as j) v
$$;

-- ---------------------------------------------------------------- 4. app_admin_save_lesson (corpo da 013040 + key_points_rico)
create or replace function public.app_admin_save_lesson(p_lesson jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_lesson, '{}'::jsonb);
  v_id uuid;
  v_points text[];
  v_old public.lessons;
  v_note text := btrim(coalesce(a ->> 'review_note', ''));
  v_publica boolean;
  v_exige boolean := false;
  v_confere boolean := v_note <> '';
  v_ai jsonb;
  v_rico jsonb;   -- resumo com formatação nova (envelope sdoc); só objeto entra, o resto vira nulo
  v_summary text;   -- o resumo como vai ficar
  v_so_formato boolean := false;   -- mudou só a formatação do resumo (o conteúdo é o mesmo): não pede nova conferência
  v_tem_pr boolean := a ? 'key_points_rico' and a ? 'key_points' and jsonb_typeof(a -> 'key_points') = 'array';   -- veio a formatação dos pontos
  v_pr jsonb;   -- formatação dos pontos, alinhada aos pontos que ficam (ponto vazio sai junto com a entrada dele)
  v_pontos_so_formato boolean := false;   -- mudou só a formatação dos pontos-chave: não pede nova conferência
begin
  perform public.assert_staff();
  if nullif(btrim(coalesce(a ->> 'title', '')), '') is null then raise exception 'Informe o título da aula.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'topic', '')), '') is null then raise exception 'Informe o tema da aula.' using errcode = '22023'; end if;
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  if a ? 'key_points' and jsonb_typeof(a -> 'key_points') = 'array' then
    select array_agg(btrim(x) order by o),
           jsonb_agg(case when jsonb_typeof(a -> 'key_points_rico' -> (o - 1)::int) = 'object' then a -> 'key_points_rico' -> (o - 1)::int end order by o)
      into v_points, v_pr
      from jsonb_array_elements_text(a -> 'key_points') with ordinality as t (x, o) where btrim(x) <> '';
  end if;
  if not v_tem_pr or not exists (select 1 from jsonb_array_elements(coalesce(v_pr, '[]'::jsonb)) e where jsonb_typeof(e) = 'object') then v_pr := null; end if;
  -- avisos da IA (até 30, 300 caracteres cada)
  if a ? 'ai_notes' and jsonb_typeof(a -> 'ai_notes') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(left(btrim(x), 300)) order by o), '[]'::jsonb) into v_ai
      from jsonb_array_elements_text(a -> 'ai_notes') with ordinality as t (x, o) where btrim(x) <> '' and o <= 30;
  end if;
  if a ? 'summary_rico' and jsonb_typeof(a -> 'summary_rico') = 'object' then v_rico := a -> 'summary_rico'; end if;
  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.lessons where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  end if;
  v_summary := case when a ? 'summary' then nullif(btrim(coalesce(a ->> 'summary', '')), '') else v_old.summary end;
  if v_old.id is not null and a ? 'summary_rico' and v_rico is distinct from v_old.summary_rico and v_summary is not distinct from v_old.summary then
    v_so_formato := to_regprocedure('public.ch_rico_conteudo(jsonb)') is not null
      and public.lessons_resumo_conteudo(v_rico, v_summary) = public.lessons_resumo_conteudo(v_old.summary_rico, v_old.summary);
  end if;
  -- pontos-chave: textos idênticos e o que a formatação traz de conteúdo igual ao de antes (regra da 013110) = só formatação
  if v_old.id is not null and v_tem_pr and v_pr is distinct from v_old.key_points_rico
     and coalesce(v_points, '{}') = coalesce(v_old.key_points, '{}') then
    v_pontos_so_formato := public.lessons_pontos_conteudo(coalesce(v_points, '{}'), v_pr) = public.lessons_pontos_conteudo(v_old.key_points, v_old.key_points_rico);
  end if;
  -- vai ficar publicada? Então precisa de conferência registrada quando acabou de ser publicada ou quando o texto do aluno mudou.
  v_publica := coalesce((a ->> 'published')::boolean, coalesce(v_old.published, false));
  if v_publica then
    v_exige := v_old.id is null or not v_old.published
      or btrim(a ->> 'title') is distinct from v_old.title
      or btrim(a ->> 'topic') is distinct from v_old.topic
      or (a ? 'summary' and nullif(btrim(coalesce(a ->> 'summary', '')), '') is distinct from v_old.summary)
      or (a ? 'summary_rico' and v_rico is distinct from v_old.summary_rico and not v_so_formato)   -- formatação do resumo: só pede se mexeu no conteúdo
      or (a ? 'key_points' and coalesce(v_points, '{}') is distinct from v_old.key_points)
      or (v_tem_pr and v_pr is distinct from v_old.key_points_rico and not v_pontos_so_formato);   -- formatação dos pontos: idem
    if v_exige and char_length(v_note) < 10 then
      raise exception 'Antes de publicar, registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
    end if;
  end if;
  -- nota preenchida vale sempre (inclusive em aula antiga sem registro), mas precisa dizer algo
  if v_confere and char_length(v_note) < 10 then
    raise exception 'Registre o que foi conferido no texto da aula (pelo menos 10 caracteres).' using errcode = '22023';
  end if;
  begin
    if v_old.id is null then
      insert into public.lessons (area, topic, title, duration_minutes, instructor, specialty, video_url, summary, summary_rico, key_points, key_points_rico, guideline_title, guideline_url, published, position, created_by)
      values ((a ->> 'area')::public.med_area, btrim(a ->> 'topic'), btrim(a ->> 'title'), (a ->> 'duration_minutes')::int, nullif(btrim(coalesce(a ->> 'instructor', '')), ''),
              nullif(btrim(coalesce(a ->> 'specialty', '')), ''), nullif(btrim(coalesce(a ->> 'video_url', '')), ''), nullif(btrim(coalesce(a ->> 'summary', '')), ''), v_rico,
              coalesce(v_points, '{}'), v_pr, nullif(btrim(coalesce(a ->> 'guideline_title', '')), ''), nullif(btrim(coalesce(a ->> 'guideline_url', '')), ''),
              v_publica, coalesce((a ->> 'position')::int, 0), (select auth.uid()))
      returning id into v_id;
    else
      v_id := v_old.id;
      update public.lessons set
        area = (a ->> 'area')::public.med_area, topic = btrim(a ->> 'topic'), title = btrim(a ->> 'title'),
        duration_minutes = case when a ? 'duration_minutes' then (a ->> 'duration_minutes')::int else duration_minutes end,
        instructor = case when a ? 'instructor' then nullif(btrim(a ->> 'instructor'), '') else instructor end,
        specialty = case when a ? 'specialty' then nullif(btrim(a ->> 'specialty'), '') else specialty end,
        video_url = case when a ? 'video_url' then nullif(btrim(a ->> 'video_url'), '') else video_url end,
        summary = case when a ? 'summary' then nullif(btrim(a ->> 'summary'), '') else summary end,
        summary_rico = case when a ? 'summary_rico' then v_rico else summary_rico end,
        key_points = case when a ? 'key_points' then coalesce(v_points, '{}') else key_points end,
        key_points_rico = case when v_tem_pr then v_pr else key_points_rico end,
        guideline_title = case when a ? 'guideline_title' then nullif(btrim(a ->> 'guideline_title'), '') else guideline_title end,
        guideline_url = case when a ? 'guideline_url' then nullif(btrim(a ->> 'guideline_url'), '') else guideline_url end,
        published = v_publica,
        position = coalesce((a ->> 'position')::int, position)
        where id = v_id;
    end if;
  exception when check_violation then
    raise exception 'Dados da aula inválidos: confira duração (1 a 600 min), endereços (https) e tamanhos dos textos.' using errcode = '22023';
  end;
  if v_confere or v_ai is not null then
    insert into public.lesson_reviews as r (lesson_id, reviewed_by, reviewed_at, review_note, ai_notes)
    values (v_id, case when v_confere then (select auth.uid()) end, case when v_confere then now() end, case when v_confere then v_note end, coalesce(v_ai, '[]'::jsonb))
    on conflict (lesson_id) do update set
      reviewed_by = case when v_confere then (select auth.uid()) else r.reviewed_by end,
      reviewed_at = case when v_confere then now() else r.reviewed_at end,
      review_note = case when v_confere then v_note else r.review_note end,
      ai_notes = coalesce(v_ai, r.ai_notes);
  end if;
  perform public.admin_log('lesson.save', v_id::text, a - 'summary' - 'summary_rico' - 'key_points_rico');
  if v_so_formato or v_pontos_so_formato then
    perform public.admin_log('lesson.format', v_id::text, jsonb_build_object('title', btrim(a ->> 'title'), 'published', v_publica)
      || case when v_pontos_so_formato then jsonb_build_object('pontos_chave', true) else '{}'::jsonb end);
  end if;
  if v_confere then
    perform public.admin_log('lesson.review', v_id::text, jsonb_build_object('title', btrim(a ->> 'title'), 'note', v_note));
  end if;
  return public.app_lesson(v_id) || (select public.lesson_review_view(l) from public.lessons l where l.id = v_id);
end
$$;
revoke execute on function public.app_admin_save_lesson(jsonb) from public, anon;
grant execute on function public.app_admin_save_lesson(jsonb) to authenticated;

-- ---------------------------------------------------------------- 5. app_tema_aula (corpo da 013020 + formatação dos materiais e dos pontos)
create or replace function public.app_tema_aula(p_tema_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb;
  v public.ch_unit_versions;
  l public.lessons;
  t public.grande_temas;
  rev public.ch_unit_materials;
  fc public.ch_unit_materials;
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  a := public.ch_tema_aula_aberta(p_tema_id);
  if a is null then return null; end if;   -- sem aula publicada: nada (nem rascunho, nem "aguardando revisão")
  perform public.ch_unit_materials_sync((a ->> 'version_id')::uuid);   -- a lista de materiais da versão existe mesmo que a equipe nunca tenha aberto a tela Unidades
  select * into v from public.ch_unit_versions where id = (a ->> 'version_id')::uuid;
  select * into l from public.lessons where id = (a ->> 'lesson_id')::uuid;
  select * into t from public.grande_temas where id = p_tema_id;
  select * into rev from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'revisao_aula' limit 1;
  select * into fc from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'flashcards_ilustrados' limit 1;
  r := jsonb_build_object(
    'lesson_id', l.id,
    'titulo', l.title, 'tema', t.titulo, 'area', t.area, 'area_nome', t.area_nome, 'subarea', t.subarea,
    'cabecalho', split_part(coalesce(l.summary, ''), E'\n', 1),
    'atualizado_em', l.central_updated_at,
    'doc_config', case when jsonb_typeof(v.content -> 'doc_config') = 'object' then v.content -> 'doc_config' else null end,
    'pontos_chave', to_jsonb(coalesce(l.key_points, '{}'::text[])),
    'secoes', (select coalesce(jsonb_agg(jsonb_build_object('titulo', s ->> 'heading',
                 'paragrafos', (select coalesce(jsonb_agg(p ->> 'text' order by k), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) with ordinality as y (p, k) where btrim(coalesce(p ->> 'text', '')) <> ''),
                 'ricos', (select coalesce(jsonb_agg(case when jsonb_typeof(p -> 'rico') = 'object' then p -> 'rico' else null end order by k), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) with ordinality as y (p, k) where btrim(coalesce(p ->> 'text', '')) <> '')
                 ) order by o), '[]'::jsonb)
               from jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) with ordinality as x (s, o)),
    'tabelas', (select coalesce(jsonb_agg(jsonb_build_object('titulo', x.title, 'posicao', x.position, 'headers', x.content -> 'headers', 'rows', x.content -> 'rows') order by x.position, x.created_at), '[]'::jsonb)
                from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'tabela'),
    'midias', (select coalesce(jsonb_agg(jsonb_build_object('tipo', x.kind, 'titulo', x.title, 'posicao', x.position, 'duracao_segundos', x.duration_seconds, 'embed_url', x.embed_url,
                 'legenda', x.content ->> 'legenda', 'transcricao', x.content ->> 'transcricao') || public.ch_material_formatacao_aluno(x.content) order by x.position, x.created_at), '[]'::jsonb)
               from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind in ('audio', 'video') and x.embed_url is not null),
    'revisao_aula', case when rev.id is null then null else jsonb_build_object('titulo', 'Revisão da Aula',
        'alt', 'Revisão da Aula: ' || coalesce(l.title, ''),
        'texto_alternativo', btrim(regexp_replace(coalesce(rev.files -> 0 ->> 'texto_alternativo', ''), 'GR-[0-9]{3}', '', 'g'))) end,
    'flashcards', case when fc.id is null then null else jsonb_build_object('cartoes', coalesce((
        select jsonb_agg(jsonb_build_object('n', t2.o, 'frente', t2.c ->> 'front', 'verso', t2.c ->> 'back',
                 'imagem', exists (select 1 from jsonb_array_elements(fc.files) f where f ->> 'caminho' ~* ('-digital-frente\.png$') and f ->> 'caminho' ~* ((t2.c ->> 'card_id') || '-digital-frente')))
               order by t2.o)
          from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) with ordinality as t2 (c, o)
         where m.unit_version_id = v.id and m.kind = 'flashcards'), '[]'::jsonb)) end,
    'questoes', (select jsonb_build_object('itens', coalesce((select jsonb_agg(jsonb_build_object('numero', q ->> 'number', 'enunciado', q ->> 'stem', 'alternativas', q -> 'options', 'correta', q ->> 'correct', 'comentarios', q -> 'comments') order by o)
                    from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'items', '[]'::jsonb)) with ordinality as t3 (q, o)
                   where m.unit_version_id = v.id and m.kind = 'questions'), '[]'::jsonb))
                  from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'questoes_fixacao' limit 1)
  );
  -- pontos-chave com formatação (Editar aula): a chave só aparece quando existe; a tela confere a projeção de cada ponto
  if public.lessons_pontos_rico_forma(l.key_points_rico, cardinality(l.key_points)) and l.key_points_rico is not null then
    r := r || jsonb_build_object('pontos_chave_ricos', l.key_points_rico);
  end if;
  return r;
end
$$;
revoke execute on function public.app_tema_aula(text) from public, anon;
grant execute on function public.app_tema_aula(text) to authenticated;

-- ---------------------------------------------------------------- 6. materiais: inserir (corpo da 009980 + formatação) e mudar textos
-- p_item: { kind: 'audio'|'video'|'tabela', title, visibility?, position?, url?, duration_seconds?, caption?, transcript?, formatacao?, headers?, rows?, claim_ids? }
create or replace function public.app_ch_unit_material_insert(p_version_id uuid, p_item jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions := public.ch_unit_materials_guard(p_version_id);
  it constant jsonb := coalesce(p_item, '{}'::jsonb);
  v_kind text := it ->> 'kind';
  v_title text := btrim(coalesce(it ->> 'title', ''));
  v_vis text := coalesce(nullif(it ->> 'visibility', ''), 'aluno');
  v_pos integer := coalesce(nullif(it ->> 'position', '')::int, 0);
  v_dur integer := nullif(it ->> 'duration_seconds', '')::int;
  v_embed text;
  v_content jsonb := '{}'::jsonb;
  v_ids uuid[] := '{}';
  v_text text;
  v_id uuid;
  v_form jsonb;   -- formatação da legenda/transcrição (editor profissional, 013160)
begin
  if v_kind not in ('audio', 'video', 'tabela') then
    raise exception 'Por aqui a equipe insere tabela, áudio e vídeo. Os outros materiais (imagens e PDFs da aula) entram pela importação da aula.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 1 and 200 then raise exception 'Informe o título (até 200 caracteres).' using errcode = '22023'; end if;
  if v_vis not in ('aluno', 'equipe') then raise exception 'Quem vê: aluno ou equipe.' using errcode = '22023'; end if;
  if v_pos < 0 or v_pos > 50 then raise exception 'Posição na aula inválida.' using errcode = '22023'; end if;
  if v_kind in ('audio', 'video') then
    if v_dur is null or v_dur not between 1 and 86400 then raise exception 'Informe a duração em segundos (1 a 86.400).' using errcode = '22023'; end if;
    v_embed := public.ch_embed_url(it ->> 'url');
    if v_embed is null then
      raise exception 'O link precisa ser do YouTube ou do Vimeo (player dentro do sistema). Link direto para arquivo não é aceito: o envio de arquivo de áudio/vídeo é uma etapa futura.' using errcode = '22023';
    end if;
    v_content := jsonb_strip_nulls(jsonb_build_object('legenda', nullif(btrim(coalesce(it ->> 'caption', '')), ''), 'transcricao', nullif(btrim(coalesce(it ->> 'transcript', '')), '')));
    -- formatação: só de legenda/transcrição que têm texto; a forma é conferida aqui (a projeção, na tela de quem lê)
    if jsonb_typeof(it -> 'formatacao') = 'object' then
      if not public.ch_formatacao_valida(it -> 'formatacao') then raise exception 'A formatação da legenda ou da transcrição está num formato inválido.' using errcode = '22023'; end if;
      select jsonb_object_agg(e.key, e.value) into v_form from jsonb_each(it -> 'formatacao') e where e.key in ('legenda', 'transcricao') and v_content ? e.key;
      if v_form is not null then v_content := v_content || jsonb_build_object('formatacao', v_form); end if;
    end if;
    v_text := coalesce(v_content ->> 'legenda', '') || ' ' || coalesce(v_content ->> 'transcricao', '');
    if char_length(v_text) > 40000 then raise exception 'Legenda e transcrição passam de 40.000 caracteres.' using errcode = '22023'; end if;
  else
    if jsonb_typeof(it -> 'headers') is distinct from 'array' or jsonb_typeof(it -> 'rows') is distinct from 'array' or jsonb_array_length(it -> 'headers') = 0 or jsonb_array_length(it -> 'rows') = 0 then
      raise exception 'A tabela precisa de cabeçalhos e de pelo menos uma linha.' using errcode = '22023';
    end if;
    if jsonb_array_length(it -> 'rows') > 100 or jsonb_array_length(it -> 'headers') > 12 then raise exception 'Tabela grande demais (até 12 colunas e 100 linhas).' using errcode = '22023'; end if;
    v_content := jsonb_build_object('headers', it -> 'headers', 'rows', it -> 'rows');
    v_text := v_content::text;
    -- tabela é conteúdo clínico: precisa de afirmação da unidade
    select coalesce(array_agg(distinct x::uuid), '{}') into v_ids from jsonb_array_elements_text(coalesce(it -> 'claim_ids', '[]'::jsonb)) x;
    if cardinality(v_ids) = 0 and v_vis = 'aluno' then raise exception 'Tabela para o aluno precisa citar afirmações validadas da unidade (claim_ids).' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.ch_unit_claims uc where uc.unit_version_id = p_version_id and uc.claim_id = i)) then
      raise exception 'A tabela usa uma afirmação que não faz parte da base revisada desta unidade.' using errcode = '22023';
    end if;
  end if;
  if v_vis = 'aluno' and (public.ch_has_citation_mark(v_title) or public.ch_has_citation_mark(v_text)) then
    raise exception 'O texto do aluno não pode trazer referência (marca de citação, "Referências" ou "Trechos citados").' using errcode = '22023';
  end if;
  insert into public.ch_unit_materials (unit_version_id, kind, title, visibility, origin, source, position, duration_seconds, url, embed_url, content, claim_ids, created_by)
  values (p_version_id, v_kind, v_title, v_vis, 'inserido', case when v_kind = 'tabela' then 'conteudo' else 'link' end, v_pos, v_dur,
          case when v_kind in ('audio', 'video') then btrim(it ->> 'url') end, v_embed, v_content, v_ids, (select auth.uid()))
  returning id into v_id;
  if v_vis = 'aluno' then
    perform public.ch_unit_materials_touch(p_version_id, 'unit.material.insert', v_id, jsonb_build_object('kind', v_kind, 'title', v_title, 'visibility', v_vis));
  else
    perform public.ch_log('unit.material.insert', p_version_id::text, jsonb_build_object('item', v_id, 'kind', v_kind, 'title', v_title, 'visibility', v_vis));
  end if;
  return jsonb_build_object('id', v_id, 'status', (select status from public.ch_unit_versions where id = p_version_id));
end
$$;

-- Mudar legenda/transcrição (e a formatação delas) de um áudio/vídeo. p_item: { caption?, transcript?, formatacao? } — chave ausente =
-- fica como está (sem "formatacao", a formatação dos campos cujo texto não mudou continua).
create or replace function public.app_ch_unit_material_textos(p_item_id uuid, p_item jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  it constant jsonb := coalesce(p_item, '{}'::jsonb);
  x public.ch_unit_materials;
  v public.ch_unit_versions;
  v_textos_antes jsonb;
  v_textos jsonb;
  v_form_antes jsonb;
  v_form jsonb;
  v_content jsonb;
  v_text text;
begin
  if (select auth.uid()) is null or not public.is_staff() then raise exception 'Mudar legenda ou transcrição é só do administrador ou editor.' using errcode = '42501'; end if;
  select * into x from public.ch_unit_materials where id = p_item_id for update;
  if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  if x.kind not in ('audio', 'video') then raise exception 'Só áudio e vídeo têm legenda e transcrição.' using errcode = '22023'; end if;
  select * into v from public.ch_unit_versions where id = x.unit_version_id;
  if v.status = 'retired' then raise exception 'A versão foi retirada e não se edita.' using errcode = '22023'; end if;
  v_textos_antes := jsonb_strip_nulls(jsonb_build_object('legenda', x.content -> 'legenda', 'transcricao', x.content -> 'transcricao'));
  v_textos := jsonb_strip_nulls(jsonb_build_object(
    'legenda', case when it ? 'caption' then to_jsonb(nullif(btrim(coalesce(it ->> 'caption', '')), '')) else x.content -> 'legenda' end,
    'transcricao', case when it ? 'transcript' then to_jsonb(nullif(btrim(coalesce(it ->> 'transcript', '')), '')) else x.content -> 'transcricao' end));
  v_form_antes := case when jsonb_typeof(x.content -> 'formatacao') = 'object' then x.content -> 'formatacao' end;
  if it ? 'formatacao' then
    if jsonb_typeof(it -> 'formatacao') = 'object' then
      if not public.ch_formatacao_valida(it -> 'formatacao') then raise exception 'A formatação da legenda ou da transcrição está num formato inválido.' using errcode = '22023'; end if;
      select jsonb_object_agg(e.key, e.value) into v_form from jsonb_each(it -> 'formatacao') e where e.key in ('legenda', 'transcricao') and v_textos ? e.key;
    end if;
  else
    select jsonb_object_agg(e.key, e.value) into v_form from jsonb_each(coalesce(v_form_antes, '{}'::jsonb)) e
     where v_textos ? e.key and v_textos -> e.key = v_textos_antes -> e.key;
  end if;
  v_content := (x.content - 'legenda' - 'transcricao' - 'formatacao') || v_textos
               || case when v_form is not null then jsonb_build_object('formatacao', v_form) else '{}'::jsonb end;
  if v_content = x.content then
    return jsonb_build_object('id', x.id, 'status', v.status, 'so_formatacao', true, 'sem_mudanca', true);
  end if;
  if public.ch_campos_so_formatacao(v_textos_antes, v_form_antes, v_textos, v_form) then
    -- SÓ formatação (decisão do dono 16/10): aprovações ficam; vale também na versão publicada (o aluno vê na hora)
    update public.ch_unit_materials set content = v_content where id = x.id;
    perform public.ch_log('unit.material.format', x.unit_version_id::text,
      jsonb_build_object('item', x.id, 'kind', x.kind, 'title', x.title, 'versao', v.status, 'antes', coalesce(v_form_antes, '{}'::jsonb)));
    return jsonb_build_object('id', x.id, 'status', v.status, 'so_formatacao', true);
  end if;
  -- conteúdo: mesma regra de inserir (versão no ar não se edita; o que o aluno vê derruba as aprovações)
  perform public.ch_unit_materials_guard(x.unit_version_id);
  v_text := coalesce(v_textos ->> 'legenda', '') || ' ' || coalesce(v_textos ->> 'transcricao', '');
  if char_length(v_text) > 40000 then raise exception 'Legenda e transcrição passam de 40.000 caracteres.' using errcode = '22023'; end if;
  if x.visibility = 'aluno' and public.ch_has_citation_mark(v_text) then
    raise exception 'O texto do aluno não pode trazer referência (marca de citação, "Referências" ou "Trechos citados").' using errcode = '22023';
  end if;
  update public.ch_unit_materials set content = v_content where id = x.id;
  if x.visibility = 'aluno' then
    perform public.ch_unit_materials_touch(x.unit_version_id, 'unit.material.edit', x.id, jsonb_build_object('kind', x.kind, 'title', x.title, 'antes', x.content));
  else
    perform public.ch_log('unit.material.edit', x.unit_version_id::text, jsonb_build_object('item', x.id, 'kind', x.kind, 'title', x.title, 'antes', x.content));
  end if;
  return jsonb_build_object('id', x.id, 'status', (select status from public.ch_unit_versions where id = x.unit_version_id), 'so_formatacao', false);
end
$$;

do $perm$
declare f text;
begin
  foreach f in array array['app_ch_unit_material_insert(uuid, jsonb)', 'app_ch_unit_material_textos(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$perm$;
