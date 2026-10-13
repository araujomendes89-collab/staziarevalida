-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 1: aviso "gabarito preliminar" na correção do aluno (migração 20261003009930_gab).
-- Cole INTEIRO no editor SQL do Supabase e clique em Run. Pode colar de novo. No fim: "OK: 1-aviso colada" e uma coluna "true".
-- =============================================================================
-- Carga das provas corrigidas (12 e 13/10/2026): selo "GABARITO PRELIMINAR" nas questões cujo gabarito oficial ainda é o
-- PRELIMINAR do Inep (a prova nova 2026/2), com a data em que o Inep divulga o definitivo (decisão do dono, 13/10/2026).
--
--   * exams.final_answer_expected_on (novo, data): quando o Inep divulga o gabarito definitivo da prova. É DADO, não código: para
--     trocar, basta um update nesta coluna (sem publicar o site). Nulo = data ainda não informada.
--   * O selo vale enquanto o gabarito oficial ATUAL da questão (question_official_answers.is_current) for 'PRELIMINARY'. Quando a
--     equipe registrar o definitivo pela função oficial (app_admin_set_official_answer, situação FINAL), o selo some sozinho.
--   * Onde o aluno vê: practice_question_view (treino, simulado, sessão reaberta, resultado da sessão e o caderno de erros aberto),
--     practice_correction_view (a correção) e app_error_notebook (a lista do caderno de erros) ganham
--       preliminary = { expected_on } (nulo quando o gabarito não é preliminar) e, na correção, answer_preliminary (sim/não).
--     Nada novo é liberado: o aluno continua sem ler question_official_answers e sem ver a letra antes de responder.
--
-- Redefinidas: practice_question_view (corpo da …9801), practice_correction_view (o invólucro da …9620; o corpo
--   ch_raw_practice_correction_view NÃO muda, então esta migração não colide com a …9920 das explicações) e app_error_notebook
--   (corpo da …0900). Nova: question_preliminary_info (interna). Se a …9620 ou a …9801 forem coladas de novo, cole esta de novo.
-- Pode ser colada duas vezes. Para desfazer: recriar as três como nas migrações citadas e apagar a função e a coluna.
-- =============================================================================

alter table public.exams add column if not exists final_answer_expected_on date;

-- { expected_on } quando o gabarito oficial atual da questão é o preliminar; nulo nos outros casos. Interna.
create or replace function public.question_preliminary_info(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('expected_on', e.final_answer_expected_on)
  from public.question_official_answers o
  join public.questions q on q.id = o.question_id
  join public.exams e on e.id = q.exam_id
  where o.question_id = p_question_id and o.is_current and o.answer_status = 'PRELIMINARY'
$$;
revoke execute on function public.question_preliminary_info(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- a questão para o aluno (corpo da …9801 + preliminary)
create or replace function public.practice_question_view(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'number', q.number,
    'area', q.area,
    'exam', (select jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester, 'title', e.title)
             from public.exams e where e.id = q.exam_id),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id')
                from jsonb_array_elements(q.options) o),
    'images', q.images,
    'origin', q.origin,
    'support', q.support,
    'preliminary', public.question_preliminary_info(q.id)
  )
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null
    and (q.origin = 'official' or public.has_ineditas())
$$;

-- ---------------------------------------------------------------- a correção (invólucro da …9620 + o selo)
create or replace function public.practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_practice_correction_view(p_question_id, p_selected))
         || jsonb_build_object('answer_preliminary', public.question_preliminary_info(p_question_id) is not null,
                               'preliminary', public.question_preliminary_info(p_question_id))
$$;

-- ---------------------------------------------------------------- a lista do caderno de erros (corpo da …0900 + preliminary)
create or replace function public.app_error_notebook() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'pending', count(*) filter (where e.status = 'para_revisar')::int,
      'overcome', count(*) filter (where e.status = 'superada')::int,
      'recurrent', count(*) filter (where e.wrong_count >= 2)::int
    ),
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'question_id', e.question_id, 'area', e.area, 'topic', e.topic, 'status', e.status,
        'wrong_count', e.wrong_count, 'last_attempt_at', e.last_attempt_at,
        'has_note', e.note is not null or e.reason is not null,
        'excerpt', left(q.statement, 200), 'number', q.number,
        'exam', (select jsonb_build_object('kind', x.kind, 'year', x.year, 'semester', x.semester)
                 from public.exams x where x.id = q.exam_id),
        -- pela visão da questão (que já roda com os direitos do dono): a interna question_preliminary_info fica fechada ao aluno
        'preliminary', public.practice_question_view(q.id) -> 'preliminary'
      ) order by e.last_attempt_at desc), '[]'::jsonb)
  )
  from public.my_error_notebook e
  join public.questions q on q.id = e.question_id
$$;

select 'OK: 1-aviso colada' as resultado,
  pg_get_functiondef('public.practice_correction_view(text, text)'::regprocedure) like '%answer_preliminary%' as correcao_traz_o_selo,
  pg_get_functiondef('public.practice_question_view(text)'::regprocedure) like '%question_preliminary_info%' as questao_traz_o_selo,
  pg_get_functiondef('public.app_error_notebook()'::regprocedure) like '%preliminary%' as caderno_de_erros_traz_o_selo,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'exams' and column_name = 'final_answer_expected_on') as data_do_definitivo_na_prova,
  not has_function_privilege('authenticated', 'public.question_preliminary_info(text)', 'execute') as funcao_interna_fechada_ao_aluno,
  pg_get_functiondef('public.practice_correction_view(text, text)'::regprocedure) like '%ch_raw_practice_correction_view%' as continua_com_as_regras_de_quem_ve;
