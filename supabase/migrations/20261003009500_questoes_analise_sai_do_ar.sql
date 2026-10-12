-- =============================================================================
-- Questões: a análise publicada sai do ar quando o enunciado ou o texto de uma alternativa muda (Q10, 2026-10-11).
--
-- Antes: a Análise Stazia publicada de uma questão continuava no ar para o aluno (correção, Tutor e diagnóstico do erro)
-- depois de a equipe mudar o enunciado ou o texto de uma alternativa, pelo editor ou pela importação com "atualizar". A análise
-- explica o texto antigo. (A troca do gabarito já é tratada desde a …7700: question_analysis_fits.)
--
-- Agora: um gatilho em questions, que vale para qualquer caminho que grave a questão (editor, importação, SQL à mão), tira do ar
-- a análise publicada da questão quando o enunciado ou o texto de uma alternativa muda:
--   - a análise passa de "publicada" para "recusada", com a data e o motivo somados à observação do revisor (quem aprovou e
--     quando continuam como estavam); o comentário dela também. Nada é apagado;
--   - o que não muda o que a análise explica NÃO tira: explicação de alternativa, conduta esperada, o que a questão avalia,
--     tema, subtema e espaços repetidos ou nas pontas do texto;
--   - análise que ainda não foi publicada (rascunho, conferida) não é mexida: a revisão já não deixa aprová-la se a questão mudou
--     depois dela ("A questão mudou depois desta análise: gere a análise de novo.");
--   - fica no registro de ações (question.analysis_unpublished). A análise volta quando uma nova, feita para o texto de agora, for
--     aprovada por um revisor médico.
-- Não há função redefinida: só duas novas (internas) e o gatilho. Pode ser colada duas vezes.
-- Análises já publicadas e já desatualizadas por edições antigas não são mexidas aqui (a Administração só lista "a questão mudou
-- depois da análise" para os revisores).
-- =============================================================================

-- O que a análise explica: enunciado e texto de cada alternativa, com espaços repetidos tratados como um só. As explicações
-- das alternativas não entram (são outro assunto).
create or replace function public.question_analysis_basis_text(p_statement text, p_options jsonb) returns text
  language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_statement, ''), '\s+', ' ', 'g'))
         || chr(31)
         || coalesce((select string_agg((o ->> 'id') || ':' || btrim(regexp_replace(coalesce(o ->> 'text', ''), '\s+', ' ', 'g')), chr(31) order by o ->> 'id')
                      from jsonb_array_elements(case when jsonb_typeof(p_options) = 'array' then p_options else '[]'::jsonb end) o), '')
$$;
revoke execute on function public.question_analysis_basis_text(text, jsonb) from public, anon, authenticated;

create or replace function public.questions_unpublish_stale_analysis() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if public.question_analysis_basis_text(new.statement, new.options) = public.question_analysis_basis_text(old.statement, old.options) then
    return null;
  end if;
  with gone as (
    update public.question_analysis a set
      status = 'rejected',
      review_note = concat_ws(E'\n', nullif(a.review_note, ''),
        'Saiu do ar em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') ||
        ': o enunciado ou o texto de uma alternativa mudou depois da análise. Uma nova análise precisa ser gerada e aprovada por um revisor médico.')
    where a.question_id = new.id and a.is_current and a.status = 'published'
    returning a.id)
  select array_agg(gone.id) into v_ids from gone;
  if v_ids is null then
    return null;
  end if;
  update public.question_comments set status = 'rejected' where analysis_id = any (v_ids) and status = 'published';
  perform public.admin_log('question.analysis_unpublished', new.id,
    jsonb_build_object('analysis_ids', v_ids, 'motivo', 'o enunciado ou o texto de uma alternativa mudou'));
  return null;
end
$$;
revoke execute on function public.questions_unpublish_stale_analysis() from public, anon, authenticated;

drop trigger if exists questions_unpublish_stale_analysis on public.questions;
create trigger questions_unpublish_stale_analysis after update of statement, options on public.questions
  for each row when (old.statement is distinct from new.statement or old.options is distinct from new.options)
  execute function public.questions_unpublish_stale_analysis();

-- Para desfazer: drop trigger questions_unpublish_stale_analysis on public.questions e apagar as duas funções. As análises que já
-- saíram do ar ficam recusadas (para voltar, uma nova análise aprovada).
