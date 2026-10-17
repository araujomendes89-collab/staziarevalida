-- =============================================================================
-- Editor profissional, expansão: ATUALIZAÇÕES com formatação (16/10/2026). Decisão do dono: mudança SÓ de formatação não derruba
-- a conferência médica nem tira do ar. Padrão da 013110: o texto oficial continua nas colunas de sempre (buscas, travas, conferência,
-- treino e telas antigas leem o texto); a formatação fica numa coluna nova guideline_updates.formatacao (chave do campo → envelope
-- sdoc v1) e só vale quando a projeção dela é igual ao texto do campo (a tela confere de novo: ricoValido; índice trocado = some sozinho).
-- Chaves (estáveis, índice começa em 0, na ordem GRAVADA):
--   before_text, current_conduct, clinical_impact, exam_impact, trap   (colunas de mesmo nome)
--   timeline.N                       texto do ano N da linha do tempo (timeline[N].text; a lista é gravada em ordem de ano)
--   flashcard.N.frente / .verso      flashcards[N].front / flashcards[N].back
--   questao.N.enunciado              practice_questions[N].statement
--   questao.N.alt.X                  texto da alternativa X (A a D) da questão N
--   questao.N.justificativa.X        justificativa da alternativa X da questão N (o aluno só recebe na correção)
--   questao.N.comentario             practice_questions[N].commentary (o aluno só recebe na correção)
-- O que muda:
--   * app_admin_save_guideline_update (corpo da 20261003009510): grava a formatação (sem a chave no pedido = mantém; null ou {} =
--     apaga), forma conferida por ch_formatacao_valida. A formatação fica FORA da comparação de conteúdo (v_skip) e entra
--     ch_campos_conteudo antigo × novo: só formatação → não volta a pendente nem sai do ar (registro "so_formatacao" no ch_log);
--     conteúdo segue a regra de hoje. A linha do tempo passa a ser ordenada por ano e, no empate, pela ordem enviada (antes o
--     empate ficava em ordem indefinida; a tela já mostrava assim).
--   * app_admin_guideline_updates (corpo da 20261003009510): cada item leva a formatação inteira (equipe e revisores editam);
--     o salvar também devolve a formatação.
--   * Aluno: funções NOVAS, sem mexer nas da 20261003013200 (que vem depois na ordem numérica e já está em produção; redefinir
--     as dela aqui deixaria o banco de teste diferente do de produção):
--       app_guideline_update_formatacao(slug): só a formatação que o aluno já vê no detalhe (sem justificativas e comentários);
--       app_guideline_practice_formatacao(slug, posição, letra): a das justificativas e do comentário daquela questão, só com a
--       resposta (mesma validação de app_guideline_practice_check). As duas com a mesma regra de acesso e ch_scrub_json.
--   * Sem formatação gravada, as respostas de sempre ficam idênticas às de antes (a chave "formatacao" nem aparece); as funções
--     do aluno da 013200 (app_guideline_update, app_guideline_practice_check, ch_raw_guideline_update_view) NÃO mudam.
--   * Fontes complementares: gatilho guideline_updates_guard_complementar_rico na coluna nova (como o summary_rico da 013040).
--   * Nada de grant de coluna: a formatação só sai pelas funções.
-- Depende da 013110 (ch_formatacao_valida, ch_campos_conteudo). Independe da ordem com a 013200. Pode ser colada duas vezes.
-- ATENÇÃO: colar a 9620 de novo DEPOIS desta devolve a leitura direta das colunas (inclusive esta); cole a 013200 e esta de novo.
-- Conferir: /Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013130-conferir.sql · desfazer: 013130-desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- 1. coluna (sem grant: o aluno não lê a coluna)
alter table public.guideline_updates add column if not exists formatacao jsonb;
alter table public.guideline_updates drop constraint if exists guideline_updates_formatacao_valida;
alter table public.guideline_updates add constraint guideline_updates_formatacao_valida check (public.ch_formatacao_valida(formatacao));
revoke select (formatacao) on table public.guideline_updates from anon, authenticated;

-- ---------------------------------------------------------------- 2. apoio
-- Os textos da atualização nas chaves da formatação (só campos com texto).
create or replace function public.guideline_formatacao_textos(u public.guideline_updates) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_strip_nulls(
    jsonb_build_object('before_text', u.before_text, 'current_conduct', u.current_conduct, 'clinical_impact', u.clinical_impact,
                       'exam_impact', u.exam_impact, 'trap', u.trap)
    || coalesce((select jsonb_object_agg('timeline.' || (n - 1), t ->> 'text')
                   from jsonb_array_elements(case when jsonb_typeof(u.timeline) = 'array' then u.timeline else '[]'::jsonb end) with ordinality as x (t, n)
                  where jsonb_typeof(t) = 'object'), '{}'::jsonb)
    || coalesce((select jsonb_object_agg('flashcard.' || (n - 1) || '.frente', f ->> 'front') || jsonb_object_agg('flashcard.' || (n - 1) || '.verso', f ->> 'back')
                   from jsonb_array_elements(case when jsonb_typeof(u.flashcards) = 'array' then u.flashcards else '[]'::jsonb end) with ordinality as x (f, n)
                  where jsonb_typeof(f) = 'object'), '{}'::jsonb)
    || coalesce((select jsonb_object_agg('questao.' || (n - 1) || '.enunciado', q ->> 'statement') || jsonb_object_agg('questao.' || (n - 1) || '.comentario', q ->> 'commentary')
                   from jsonb_array_elements(case when jsonb_typeof(u.practice_questions) = 'array' then u.practice_questions else '[]'::jsonb end) with ordinality as x (q, n)
                  where jsonb_typeof(q) = 'object'), '{}'::jsonb)
    || coalesce((select jsonb_object_agg('questao.' || (n - 1) || '.alt.' || (o ->> 'id'), o ->> 'text')
                        || jsonb_object_agg('questao.' || (n - 1) || '.justificativa.' || (o ->> 'id'), o ->> 'justification')
                   from jsonb_array_elements(case when jsonb_typeof(u.practice_questions) = 'array' then u.practice_questions else '[]'::jsonb end) with ordinality as x (q, n)
                   cross join lateral jsonb_array_elements(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' else '[]'::jsonb end) o
                  where jsonb_typeof(q) = 'object' and jsonb_typeof(o) = 'object' and (o ->> 'id') ~ '^[A-Z]$'), '{}'::jsonb))
$$;
revoke execute on function public.guideline_formatacao_textos(public.guideline_updates) from public, anon, authenticated;

-- Só as entradas que quem lê pode ver, e só de campos que existem com texto. NULL quando não sobra nenhuma.
--   p_correcao NULL: antes de responder (sem justificativas e sem comentários das questões de treino);
--   p_correcao = N: só as justificativas e o comentário da questão N (vão com a correção dela).
create or replace function public.guideline_formatacao_filtro(p_formatacao jsonb, p_textos jsonb, p_correcao integer) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(p_formatacao) is distinct from 'object' then null
    else (select jsonb_object_agg(e.key, e.value) from jsonb_each(p_formatacao) e
           where jsonb_typeof(e.value) = 'object'
             and nullif(btrim(coalesce(p_textos ->> e.key, '')), '') is not null
             and case when p_correcao is null then e.key !~ '^questao\.[0-9]+\.(justificativa\.[A-Z]|comentario)$'
                      else e.key ~ ('^questao\.' || p_correcao || '\.(justificativa\.[A-Z]|comentario)$') end) end
$$;
revoke execute on function public.guideline_formatacao_filtro(jsonb, jsonb, integer) from public, anon, authenticated;

-- {"formatacao": ...} ou {} (sem formatação a resposta fica idêntica à de antes).
create or replace function public.guideline_formatacao_chave(p_formatacao jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(p_formatacao) = 'object' and p_formatacao <> '{}'::jsonb then jsonb_build_object('formatacao', p_formatacao) else '{}'::jsonb end
$$;
revoke execute on function public.guideline_formatacao_chave(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. fontes complementares: a formatação passa pela mesma guarda do texto
drop trigger if exists guideline_updates_guard_complementar_rico on public.guideline_updates;
-- ("execute procedure" = "execute function" no Postgres; escrito assim para o teste de ordem das migrações não confundir o uso do
-- gatilho com uma redefinição da função)
create trigger guideline_updates_guard_complementar_rico before insert or update of formatacao on public.guideline_updates
  for each row execute procedure public.ch_guard_complementar_save('formatacao');

-- ---------------------------------------------------------------- 4. leitura
-- Equipe: a lista da aba (corpo da 20261003009510) + a formatação inteira de cada atualização (para editar). Conferir e publicar
-- devolvem esta lista, então também levam a formatação.
create or replace function public.app_admin_guideline_updates() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.guideline_update_assert_staff();
  return jsonb_build_object(
    'is_admin', public.is_admin(),
    'review_areas', (select coalesce(jsonb_agg(e.area), '[]'::jsonb) from unnest(enum_range(null::public.med_area)) as e (area)
                     where public.ch_is_reviewer(public.guideline_area_code(e.area))),
    'items', coalesce((select jsonb_agg(public.guideline_update_view(u, true) || jsonb_build_object(
        'review_status', u.review_status, 'review_note', u.review_note, 'reviewed_at', u.reviewed_at,
        'reviewer', (select nullif(p.name, '') from public.profiles p where p.id = u.reviewed_by),
        'source_checked_at', u.source_checked_at, 'origin', u.origin, 'legacy', u.legacy, 'position', u.position,
        'can_review', public.ch_is_reviewer(public.guideline_area_code(u.area)))
        || public.guideline_formatacao_chave(u.formatacao)   -- 013130 (sem formatação: item idêntico ao de antes)
      order by u.published desc, u.priority, u.position, u.topic) from public.guideline_updates u), '[]'::jsonb));
end
$$;
revoke execute on function public.app_admin_guideline_updates() from public, anon;

-- Aluno, detalhe: a formatação que ele pode ver ANTES de responder (sem justificativas e comentários das questões de treino), com a
-- mesma regra de acesso de app_guideline_update (013200) e a mesma retirada de fonte complementar. Função NOVA (a 013200 é dona do
-- detalhe e da correção; esta não muda nenhuma das duas). Sem formatação: null. Mesma resposta para qualquer papel.
create or replace function public.app_guideline_update_formatacao(p_slug text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.guideline_formatacao_filtro(u.formatacao, public.guideline_formatacao_textos(u), null))
  from public.guideline_updates u where u.slug = p_slug and (select auth.uid()) is not null
    and (u.published or public.is_staff() or public.ch_is_reviewer())
$$;
revoke execute on function public.app_guideline_update_formatacao(text) from public, anon;
grant execute on function public.app_guideline_update_formatacao(text) to authenticated;

-- Aluno, correção: a formatação das justificativas e do comentário de UMA questão de treino, só com a resposta dele (a mesma
-- validação de app_guideline_practice_check, 013200: sem uma das alternativas da questão, recusa sem entregar nada). Sem
-- formatação: null.
create or replace function public.app_guideline_practice_formatacao(p_slug text, p_index integer, p_selected text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.guideline_updates;
  q jsonb;
  v_sel text := upper(btrim(coalesce(p_selected, '')));
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into u from public.guideline_updates g where g.slug = p_slug and (g.published or public.is_staff() or public.ch_is_reviewer());
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  if p_index is null or p_index < 0 or jsonb_typeof(u.practice_questions) <> 'array' or p_index >= jsonb_array_length(u.practice_questions) then
    raise exception 'Questão de treino não encontrada.' using errcode = 'P0002';
  end if;
  q := u.practice_questions -> p_index;
  if jsonb_typeof(q) <> 'object' or jsonb_typeof(q -> 'options') <> 'array' then raise exception 'Questão de treino não encontrada.' using errcode = 'P0002'; end if;
  if v_sel = '' or not exists (select 1 from jsonb_array_elements(q -> 'options') o where jsonb_typeof(o) = 'object' and o ->> 'id' = v_sel) then
    raise exception 'Marque uma das alternativas antes de confirmar.' using errcode = '22023';
  end if;
  return public.ch_scrub_json(public.guideline_formatacao_filtro(u.formatacao, public.guideline_formatacao_textos(u), p_index));
end
$$;
revoke execute on function public.app_guideline_practice_formatacao(text, integer, text) from public, anon;
grant execute on function public.app_guideline_practice_formatacao(text, integer, text) to authenticated;

-- ---------------------------------------------------------------- 5. salvar (corpo da 20261003009510 + formatação)
create or replace function public.app_admin_save_guideline_update(p_update jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_update, '{}'::jsonb);
  v_old public.guideline_updates;
  v_new public.guideline_updates;
  v_area public.med_area;
  v_timeline jsonb;
  v_years smallint[];
  v_reset boolean := false;
  v_unpublished boolean := false;
  v_form jsonb;
  v_conteudo boolean := false;
  v_so_formatacao boolean := false;
  -- 013130: a formatação fica fora desta comparação; entra abaixo só o que ela traz de CONTEÚDO (ch_campos_conteudo)
  v_skip constant text[] := array['updated_at', 'updated_by', 'position', 'priority', 'search_terms', 'review_status', 'review_note',
                                  'reviewed_by', 'reviewed_at', 'source_checked_at', 'published', 'legacy', 'created_at', 'formatacao'];
begin
  perform public.guideline_update_assert_staff();
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  v_area := (a ->> 'area')::public.med_area;
  -- quem não é da equipe edita só a área que revisa. Primeiro a área GRAVADA (revisão rodada 1 da …7800: senão um revisor
  -- de outra área trocaria a área para a dele e mudaria, tiraria do ar e conferiria uma atualização que não é dele)...
  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.guideline_updates where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
    if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(v_old.area))) then
      raise exception 'Você revisa outra área: esta atualização é de %.', public.area_label(v_old.area) using errcode = '42501';
    end if;
  end if;
  -- ...depois a área MANDADA. Se a atualização é da área dele e ele tenta levá-la para uma área que não revisa, a mensagem
  -- diz exatamente isso (antes dizia "esta atualização é de <área para onde ele tentou levar>", o que não era verdade).
  if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(v_area))) then
    if v_old.id is not null then
      raise exception 'Você não pode levar esta atualização de % para %: você não revisa %. Para mudar a área, peça a um administrador ou editor.',
        public.area_label(v_old.area), public.area_label(v_area), public.area_label(v_area) using errcode = '42501';
    end if;
    raise exception 'Você revisa outra área: esta atualização é de %.', public.area_label(v_area) using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(a ->> 'topic', ''))) < 3 then raise exception 'Informe o tema.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'source_url', '')), '') is not null and not (btrim(a ->> 'source_url') ~ '^https://') then
    raise exception 'O endereço da fonte precisa começar com https://.' using errcode = '22023';
  end if;
  -- formatação (013130): sem a chave = mantém a gravada; null ou {} = apaga
  if a ? 'formatacao' then
    v_form := case when jsonb_typeof(a -> 'formatacao') = 'object' and a -> 'formatacao' <> '{}'::jsonb then a -> 'formatacao'
                   when jsonb_typeof(a -> 'formatacao') in ('object', 'null') then null
                   else a -> 'formatacao' end;
    if not public.ch_formatacao_valida(v_form) then
      raise exception 'Formatação inválida: tire a formatação de alguns campos (até 64 campos formatados) e salve de novo.' using errcode = '22023';
    end if;
  end if;
  -- linha do tempo: [{year, text}] com ano de 2000 a 2100 e texto; os anos da atualização saem dela. Ordem: ano e, no empate, a
  -- ordem enviada (013130: a chave timeline.N da formatação segue esta ordem)
  select coalesce(jsonb_agg(jsonb_build_object('year', (t ->> 'year')::int, 'text', btrim(t ->> 'text')) order by (t ->> 'year')::int, n), '[]'::jsonb),
         coalesce(array_agg(distinct (t ->> 'year')::smallint), '{}')
    into v_timeline, v_years
    from jsonb_array_elements(case when jsonb_typeof(a -> 'timeline') = 'array' then a -> 'timeline' else '[]'::jsonb end) with ordinality as x (t, n)
    where (t ->> 'year') ~ '^\d{4}$'
      and (case when (t ->> 'year') ~ '^\d{4}$' then (t ->> 'year')::int end) between 2000 and 2100
      and nullif(btrim(coalesce(t ->> 'text', '')), '') is not null;

  if v_old.id is not null then
    v_new := v_old;
  else
    v_new.id := gen_random_uuid();
    v_new.slug := coalesce(nullif(a ->> 'slug', ''), 'atualizacao-' || substr(md5(gen_random_uuid()::text), 1, 10));
    v_new.priority := 2; v_new.position := 0; v_new.review_status := 'pending'; v_new.published := false; v_new.origin := 'manual';
    v_new.legacy := '{}'::jsonb; v_new.flashcards := '[]'::jsonb; v_new.practice_questions := '[]'::jsonb; v_new.created_at := now(); v_new.updated_at := now();
  end if;
  v_new.area := v_area;
  v_new.topic := btrim(a ->> 'topic');
  v_new.subtopic := nullif(btrim(coalesce(a ->> 'subtopic', '')), '');
  v_new.years := v_years;
  v_new.timeline := v_timeline;
  v_new.priority := coalesce((a ->> 'priority')::smallint, v_new.priority);
  v_new.position := coalesce((a ->> 'position')::int, v_new.position);
  v_new.publication_label := nullif(btrim(coalesce(a ->> 'publication_label', '')), '');
  v_new.institution := nullif(btrim(coalesce(a ->> 'institution', '')), '');
  v_new.document_title := nullif(btrim(coalesce(a ->> 'document_title', '')), '');
  v_new.source_url := nullif(btrim(coalesce(a ->> 'source_url', '')), '');
  v_new.before_text := nullif(btrim(coalesce(a ->> 'before_text', '')), '');
  v_new.current_conduct := nullif(btrim(coalesce(a ->> 'current_conduct', '')), '');
  v_new.clinical_impact := nullif(btrim(coalesce(a ->> 'clinical_impact', '')), '');
  v_new.exam_impact := nullif(btrim(coalesce(a ->> 'exam_impact', '')), '');
  v_new.trap := nullif(btrim(coalesce(a ->> 'trap', '')), '');
  v_new.search_terms := nullif(btrim(coalesce(a ->> 'search_terms', '')), '');
  v_new.updated_by := (select auth.uid());
  if a ? 'formatacao' then v_new.formatacao := v_form; end if;
  -- flashcards [{front, back}] e questões de treino [{statement, options[A-D]{id,text,justification}, answer, commentary}]
  if a ? 'flashcards' then
    if jsonb_typeof(a -> 'flashcards') <> 'array' or exists (
         select 1 from jsonb_array_elements(a -> 'flashcards') f
         where char_length(btrim(coalesce(f ->> 'front', ''))) not between 3 and 2000 or char_length(btrim(coalesce(f ->> 'back', ''))) not between 1 and 2000) then
      raise exception 'Cada flashcard precisa de frente e verso (até 2.000 caracteres).' using errcode = '22023';
    end if;
    v_new.flashcards := (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', f ->> 'type', 'front', btrim(f ->> 'front'), 'back', btrim(f ->> 'back')))), '[]'::jsonb)
                         from jsonb_array_elements(a -> 'flashcards') f);
  end if;
  if a ? 'practice_questions' then
    if jsonb_typeof(a -> 'practice_questions') <> 'array' or exists (
         select 1 from jsonb_array_elements(a -> 'practice_questions') q
         where char_length(btrim(coalesce(q ->> 'statement', ''))) < 20 or coalesce(q ->> 'answer', '') not in ('A', 'B', 'C', 'D')
            or jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') <> 4
            or (select count(distinct o ->> 'id') from jsonb_array_elements(q -> 'options') o
                where o ->> 'id' in ('A', 'B', 'C', 'D') and char_length(btrim(coalesce(o ->> 'text', ''))) > 0) <> 4) then
      raise exception 'Cada questão de treino precisa de enunciado, quatro alternativas (A a D) e o gabarito.' using errcode = '22023';
    end if;
    v_new.practice_questions := a -> 'practice_questions';
  end if;

  -- o que o aluno lê mudou: a conferência anterior (aprovada ou recusada) não vale mais e, se estava no ar, sai do ar
  -- até um revisor conferir de novo e o administrador publicar outra vez. 013130: a formatação só conta pelo que ela traz de
  -- conteúdo (imagem, link, nota...); negrito, cor, alinhamento etc. sozinhos não derrubam (decisão do dono 16/10).
  if v_old.id is not null then
    v_conteudo := (to_jsonb(v_new) - v_skip) is distinct from (to_jsonb(v_old) - v_skip)
      or public.ch_campos_conteudo(public.guideline_formatacao_textos(v_new), v_new.formatacao)
         is distinct from public.ch_campos_conteudo(public.guideline_formatacao_textos(v_old), v_old.formatacao);
    v_so_formatacao := not v_conteudo and v_new.formatacao is distinct from v_old.formatacao;
  end if;
  if v_conteudo then
    if v_old.published then
      v_new.published := false; v_unpublished := true;
    end if;
    if v_old.review_status <> 'pending' or v_unpublished then
      v_new.review_status := 'pending';
      v_new.review_note := case when v_unpublished
        then 'Conteúdo alterado depois da conferência: revisar de novo. Saiu do ar para os alunos até a nova conferência; depois dela, o administrador publica outra vez.'
        else 'Conteúdo alterado depois da conferência: revisar de novo.' end;
      v_new.reviewed_by := null; v_new.reviewed_at := null; v_new.source_checked_at := null; v_reset := true;
    end if;
  end if;

  begin
    if v_old.id is null then
      insert into public.guideline_updates select v_new.*;
    else
      update public.guideline_updates g set
        area = v_new.area, topic = v_new.topic, subtopic = v_new.subtopic, years = v_new.years, timeline = v_new.timeline,
        priority = v_new.priority, position = v_new.position, publication_label = v_new.publication_label, institution = v_new.institution,
        document_title = v_new.document_title, source_url = v_new.source_url, before_text = v_new.before_text,
        current_conduct = v_new.current_conduct, clinical_impact = v_new.clinical_impact, exam_impact = v_new.exam_impact,
        trap = v_new.trap, search_terms = v_new.search_terms, flashcards = v_new.flashcards,
        practice_questions = v_new.practice_questions, formatacao = v_new.formatacao, updated_by = v_new.updated_by,
        review_status = v_new.review_status, review_note = v_new.review_note, reviewed_by = v_new.reviewed_by,
        reviewed_at = v_new.reviewed_at, source_checked_at = v_new.source_checked_at, published = v_new.published
        where g.id = v_new.id;
    end if;
  exception when check_violation then
    raise exception 'Dados inválidos: confira os tamanhos dos textos, a prioridade (1 a 4) e o endereço da fonte.' using errcode = '22023';
  when unique_violation then
    raise exception 'Já existe uma atualização com este identificador.' using errcode = '23505';
  end;
  -- quando a área muda (só a equipe, ou o revisor das duas áreas), o registro diz quem levou de qual área para qual
  perform public.ch_log('guideline_update.save', v_new.id::text,
                        jsonb_build_object('topic', v_new.topic, 'review_reset', v_reset, 'unpublished', v_unpublished)
                        || case when v_old.id is not null and v_old.area is distinct from v_new.area
                                then jsonb_build_object('area_de', v_old.area, 'area_para', v_new.area) else '{}'::jsonb end
                        -- 013130: só a formatação mudou (conferência e publicação mantidas)
                        || case when v_so_formatacao then jsonb_build_object('so_formatacao', true) else '{}'::jsonb end);
  if v_unpublished then
    perform public.admin_log('guideline_update.unpublish', v_new.id::text,
                             jsonb_build_object('topic', v_new.topic, 'motivo', 'Texto alterado depois da conferência: saiu do ar até nova conferência.'));
  end if;
  return (select public.guideline_update_view(u, true) || jsonb_build_object('review_status', u.review_status, 'review_note', u.review_note)
                 || public.guideline_formatacao_chave(u.formatacao)
          from public.guideline_updates u where u.id = v_new.id);
end
$$;
revoke execute on function public.app_admin_save_guideline_update(jsonb) from public, anon;
