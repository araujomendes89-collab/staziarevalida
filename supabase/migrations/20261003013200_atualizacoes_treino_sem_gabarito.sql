-- =============================================================================
-- Correção de segurança (16/10/2026): a questão de treino de uma Atualização não entrega mais o gabarito antes de o aluno responder.
-- Antes: app_guideline_update (e a leitura direta da tabela) entregava as questões de treino inteiras (gabarito, justificativas,
-- comentário e a marca da "pegadinha do protocolo antigo"); o bloqueio era só na tela.
-- Agora:
--   * ch_raw_guideline_update_view: quem NÃO é equipe nem revisor recebe de cada questão só o enunciado e as alternativas (letra e texto);
--   * a coluna practice_questions sai da leitura direta do aluno (API REST);
--   * app_guideline_practice_check(slug, posição, letra marcada): devolve gabarito, justificativas e comentário daquela questão SÓ
--     quando o aluno manda a resposta dele (validada pelo envio). Mesma regra de acesso e mesma retirada de fonte complementar
--     (ch_scrub_json) do detalhe.
-- Parte das definições mais novas: ch_raw_guideline_update_view e app_guideline_update da 20261003009620; guideline_update_view
-- (9620) não muda e continua passando por ch_scrub_json. Pode ser colada duas vezes.
-- ATENÇÃO: colar a 9620 de novo DEPOIS desta devolve a coluna practice_questions à leitura direta; nesse caso cole esta de novo.
-- Conferir: /Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013200-conferir.sql · desfazer: 013200-desfazer.sql
-- =============================================================================

-- Questões de treino como o aluno pode ver ANTES de responder: só enunciado e alternativas (letra e texto), na mesma ordem.
create or replace function public.guideline_practice_sem_gabarito(p_questions jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(
           case when jsonb_typeof(q) = 'object' then jsonb_build_object(
             'statement', q -> 'statement',
             'options', (select coalesce(jsonb_agg(case when jsonb_typeof(o) = 'object' then jsonb_build_object('id', o -> 'id', 'text', o -> 'text') else 'null'::jsonb end order by k), '[]'::jsonb)
                           from jsonb_array_elements(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' else '[]'::jsonb end) with ordinality as x (o, k)))
           else 'null'::jsonb end order by n), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end) with ordinality as t (q, n)
$$;
revoke execute on function public.guideline_practice_sem_gabarito(jsonb) from public, anon, authenticated;

-- Atualização/diretriz (corpo da 20261003009620 + questões de treino sem gabarito para quem não é equipe nem revisor).
create or replace function public.ch_raw_guideline_update_view(u public.guideline_updates, p_full boolean) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'slug', u.slug, 'area', u.area, 'area_label', public.area_label(u.area), 'topic', u.topic, 'subtopic', u.subtopic,
    'years', to_jsonb(u.years), 'priority', u.priority, 'publication_label', u.publication_label, 'institution', case when u.source_hidden and not public.is_staff() then null else u.institution end,
    'document_title', case when u.source_hidden and not public.is_staff() then null else u.document_title end,
    'source_url', case when u.source_hidden and not public.is_staff() then null else u.source_url end, 'before_text', u.before_text, 'current_conduct', u.current_conduct,
    'reviewed', u.review_status = 'approved' and not (u.source_hidden and not public.is_staff()), 'reviewed_at', case when u.review_status = 'approved' and not (u.source_hidden and not public.is_staff()) then u.reviewed_at end,
    'published', u.published, 'updated_at', u.updated_at)
  || case when p_full then jsonb_build_object(
    'timeline', u.timeline, 'clinical_impact', u.clinical_impact, 'exam_impact', u.exam_impact,
    'trap', u.trap, 'flashcards', u.flashcards,
    -- o gabarito, as justificativas e o comentário só a equipe e os revisores recebem aqui; o aluno, por app_guideline_practice_check
    'practice_questions', case when public.is_staff() or public.ch_is_reviewer() then u.practice_questions
                               else public.guideline_practice_sem_gabarito(u.practice_questions) end,
    'search_terms', u.search_terms) else '{}'::jsonb end
$$;
revoke execute on function public.ch_raw_guideline_update_view(public.guideline_updates, boolean) from public, anon, authenticated;

-- Detalhe do aluno (corpo da 20261003009620): as questões de treino SEMPRE sem gabarito, para qualquer papel (a tela é a mesma;
-- a correção vem de app_guideline_practice_check).
create or replace function public.app_guideline_update(p_slug text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.guideline_update_view(u, true) || jsonb_build_object(
    'practice_questions', coalesce(public.ch_scrub_json(public.guideline_practice_sem_gabarito(u.practice_questions)), '[]'::jsonb),
    'questions_count', case when nullif(btrim(coalesce(u.search_terms, '')), '') is null then 0
                            else (select count(*)::int from public.practice_pool(jsonb_build_object('area', u.area, 'search', u.search_terms))) end)
  from public.guideline_updates u where u.slug = p_slug and (select auth.uid()) is not null
    and (u.published or public.is_staff() or public.ch_is_reviewer())
$$;
revoke execute on function public.app_guideline_update(text) from public, anon;
grant execute on function public.app_guideline_update(text) to authenticated;

-- Correção de UMA questão de treino, só depois de o aluno responder: p_index é a posição da questão (0 = primeira) e p_selected a
-- letra que ele marcou. Devolve o gabarito, se acertou, a justificativa de cada alternativa e o comentário.
create or replace function public.app_guideline_practice_check(p_slug text, p_index integer, p_selected text) returns jsonb
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
  -- validada pelo envio: só corrige quando chega uma das alternativas da questão
  if v_sel = '' or not exists (select 1 from jsonb_array_elements(q -> 'options') o where jsonb_typeof(o) = 'object' and o ->> 'id' = v_sel) then
    raise exception 'Marque uma das alternativas antes de confirmar.' using errcode = '22023';
  end if;
  return public.ch_scrub_json(jsonb_build_object(
    'index', p_index,
    'selected', v_sel,
    'answer', q -> 'answer',
    'correct', (q ->> 'answer') = v_sel,
    'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o -> 'id', 'justification', o -> 'justification') order by k), '[]'::jsonb)
                  from jsonb_array_elements(q -> 'options') with ordinality as x (o, k) where jsonb_typeof(o) = 'object'),
    'commentary', q -> 'commentary'));
end
$$;
revoke execute on function public.app_guideline_practice_check(text, integer, text) from public, anon;
grant execute on function public.app_guideline_practice_check(text, integer, text) to authenticated;

-- Leitura direta (API REST): a coluna com o gabarito sai do que o aluno lê na tabela (a equipe lê pelas funções do painel).
revoke select (practice_questions) on table public.guideline_updates from anon, authenticated;
