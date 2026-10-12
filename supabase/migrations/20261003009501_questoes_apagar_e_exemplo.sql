-- =============================================================================
-- Questões: a linha de exemplo do modelo não vira questão, e apagar questão sem resposta de aluno (Q08, 2026-10-11).
--
-- 1. O modelo de planilha traz uma linha de exemplo (Revalida 2026/2, questão 1, com textos como "Tema principal da questão" e
--    "Texto da alternativa A") que passava em todas as conferências: entrava nos treinos como prova oficial ou, com "atualizar",
--    sobrescrevia a questão 1 real da prova. Agora a conferência do banco (admin_question_problem, a mesma do editor, da
--    importação e da prévia) recusa qualquer questão com um desses textos de exemplo, inteiro, em tema, subtema, enunciado,
--    texto ou explicação de alternativa, conduta esperada, o que a questão avalia ou fonte. Espaços repetidos, maiúsculas e
--    acentos não escapam; uma frase que só contém o texto não é recusada. admin_question_problem é a da …1300, com a conferência
--    a mais no fim. A lista de textos fica em admin_example_texts e é a do modelo (questionImport.js: o teste confere as duas).
--
-- 2. Apagar questão (nova app_admin_delete_question): só administrador e só quando nenhum aluno tem algo ligado a ela:
--    resposta, anotação de erro, resposta ou conversa no Tutor, marcação, ou sessão de treino que a recebeu. Qualquer um desses
--    recusa, com o motivo; a saída para uma questão que não deve mais valer é anulá-la pelo registro do gabarito oficial. Apagar
--    leva junto o que é da própria questão (análise, gabarito oficial registrado, histórico de mudanças, DNA); o registro de ações
--    guarda uma cópia inteira da questão (question.delete), para ela poder ser recriada.
--
-- Pode ser colada duas vezes: só "create or replace" e "revoke".
-- =============================================================================

-- ---------------------------------------------------------------- textos de exemplo do modelo (1)
-- Já sem acento e em minúsculas (public.fold_text), com espaços repetidos tratados como um só.
create or replace function public.admin_example_texts() returns text[]
  language sql immutable set search_path = ''
as $$
  select array[
    'tema principal da questao',
    'subtema (opcional)',
    'texto completo do enunciado, como esta no caderno de prova.',
    'texto da alternativa a',
    'texto da alternativa b',
    'texto da alternativa c',
    'texto da alternativa d',
    'por que a alternativa correta esta certa (opcional)',
    'conduta esperada (opcional)',
    'gabarito oficial definitivo (opcional)'
  ]
$$;
revoke execute on function public.admin_example_texts() from public, anon, authenticated;

-- Conferência de uma questão do editor ou da importação (corpo da …1300), com a recusa do texto de exemplo no fim.
create or replace function public.admin_question_problem(q jsonb) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  v_options jsonb := q -> 'options';
  v_status text := coalesce(nullif(q ->> 'status', ''), 'valid');
begin
  if coalesce(q ->> 'kind', '') not in ('REVALIDA', 'ENAMED') then return 'Prova deve ser REVALIDA ou ENAMED.'; end if;
  if coalesce(q ->> 'year', '') !~ '^(20\d\d|2100)$' then return 'Ano da prova inválido.'; end if;
  if coalesce(q ->> 'semester', '') not in ('', '1', '2') then return 'Semestre deve ser 1 ou 2.'; end if;
  if coalesce(q ->> 'number', '') !~ '^[1-9]\d{0,3}$' then return 'Número da questão inválido.'; end if;
  if coalesce(q ->> 'area', '') not in ('CLINICA_MEDICA', 'CIRURGIA_GERAL', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MEDICINA_FAMILIA_COMUNIDADE') then
    return 'Grande área inválida.';
  end if;
  if char_length(btrim(coalesce(q ->> 'topic', ''))) = 0 then return 'Informe o tema.'; end if;
  if char_length(btrim(coalesce(q ->> 'statement', ''))) < 20 then return 'Enunciado vazio ou curto demais.'; end if;
  if jsonb_typeof(v_options) is distinct from 'array' or jsonb_array_length(v_options) <> 4 then return 'São necessárias 4 alternativas (A a D).'; end if;
  if (select array_agg(o ->> 'id' order by o ->> 'id') from jsonb_array_elements(v_options) o) <> array['A', 'B', 'C', 'D'] then
    return 'As alternativas devem ser A, B, C e D.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_options) o where char_length(btrim(coalesce(o ->> 'text', ''))) = 0) then
    return 'Há alternativa sem texto.';
  end if;
  if v_status not in ('valid', 'annulled', 'changed_after_appeal') then return 'Situação inválida.'; end if;
  if v_status <> 'annulled' and coalesce(q ->> 'correct_option', '') not in ('A', 'B', 'C', 'D') then
    return 'Informe o gabarito (A, B, C ou D).';
  end if;
  if nullif(q ->> 'correct_option', '') is not null and (q ->> 'correct_option') not in ('A', 'B', 'C', 'D') then
    return 'Gabarito deve ser A, B, C ou D.';
  end if;
  -- Q08: o texto de exemplo do modelo de planilha não vira questão
  if exists (
    select 1
    from (
      select q ->> 'topic' as t
      union all select q ->> 'subtopic'
      union all select q ->> 'statement'
      union all select q ->> 'expected_conduct'
      union all select q ->> 'inep_intent'
      union all select o ->> 'text' from jsonb_array_elements(v_options) o
      union all select o ->> 'explanation' from jsonb_array_elements(v_options) o
      union all select s ->> 'title' from jsonb_array_elements(case when jsonb_typeof(q -> 'sources') = 'array' then q -> 'sources' else '[]'::jsonb end) s
    ) x
    where public.fold_text(btrim(regexp_replace(coalesce(x.t, ''), '\s+', ' ', 'g'))) = any (public.admin_example_texts())
  ) then
    return 'Esta é a linha de exemplo do modelo de planilha: apague-a ou troque o texto de exemplo pelos dados reais da questão.';
  end if;
  return null;
end
$$;
-- só as funções app_admin_* (security definer) a chamam
revoke execute on function public.admin_question_problem(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- apagar questão (2)
create or replace function public.app_admin_delete_question(p_question_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
  v_attempts integer;
  v_notes integer;
  v_tutor integer;
  v_tutor_sessions integer;
  v_bookmarks integer;
  v_sessions integer;
  v_why text[] := '{}';
begin
  perform public.assert_admin();
  -- a trava da linha faz uma resposta que chegue agora esperar: ela ou é contada abaixo, ou falha por a questão não existir mais
  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;

  select count(*)::int into v_attempts from public.question_attempts a where a.question_id = v.id;
  select count(*)::int into v_notes from public.error_notes n where n.question_id = v.id;
  select count(*)::int into v_tutor from public.tutor_answers t where t.question_id = v.id;
  select count(*)::int into v_tutor_sessions from public.tutor_sessions s where s.question_id = v.id;
  select count(*)::int into v_bookmarks from public.question_bookmarks b where b.question_id = v.id;
  select count(*)::int into v_sessions from public.practice_sessions s where v.id = any (s.question_ids);
  if v_attempts > 0 then v_why := v_why || (v_attempts || case when v_attempts = 1 then ' resposta de aluno' else ' respostas de alunos' end); end if;
  if v_notes > 0 then v_why := v_why || (v_notes || case when v_notes = 1 then ' anotação de erro de aluno' else ' anotações de erro de alunos' end); end if;
  if v_tutor > 0 then v_why := v_why || (v_tutor || case when v_tutor = 1 then ' resposta dada no Tutor' else ' respostas dadas no Tutor' end); end if;
  if v_tutor_sessions > 0 then v_why := v_why || (v_tutor_sessions || case when v_tutor_sessions = 1 then ' conversa do Tutor' else ' conversas do Tutor' end); end if;
  if v_bookmarks > 0 then v_why := v_why || ('marcada por ' || v_bookmarks || case when v_bookmarks = 1 then ' aluno' else ' alunos' end); end if;
  if v_sessions > 0 then v_why := v_why || (v_sessions || case when v_sessions = 1 then ' sessão de treino de aluno' else ' sessões de treino de alunos' end); end if;
  if cardinality(v_why) > 0 then
    raise exception 'Esta questão não pode ser apagada: tem %. Se ela não deve mais valer, anule a questão pelo registro do gabarito oficial.', array_to_string(v_why, ', ')
      using errcode = '22023';
  end if;

  -- cópia inteira no registro de ações, para a questão poder ser recriada
  perform public.admin_log('question.delete', v.id, jsonb_build_object(
    'code', v.code, 'exam_id', v.exam_id, 'number', v.number, 'topic', v.topic, 'status', v.status,
    'excerpt', left(v.statement, 160), 'snapshot', to_jsonb(v) - 'search'));
  delete from public.questions where id = v.id;
  perform public.admin_refresh_exam_counts();
  return jsonb_build_object('deleted', true, 'id', v.id, 'code', v.code);
end
$$;
revoke execute on function public.app_admin_delete_question(text) from public, anon;

-- Para desfazer: recriar admin_question_problem como na …1300, apagar admin_example_texts e app_admin_delete_question. As questões
-- já apagadas voltam do "snapshot" do registro de ações (question.delete).
