-- =============================================================================
-- Modo sombra de verdade: com o modo sombra ligado (ou a publicação desligada), a análise de questão e o cartão de atualização
-- aprovados NÃO chegam ao aluno (CC19, 2026-10-12).
--
-- Antes: a tela da Configuração dizia "Modo sombra ligado: nada é publicado", mas só as unidades da Central obedeciam. A análise
-- de uma questão aprovada por um revisor médico (e o cartão de atualização) chegava ao aluno na correção, no Tutor, no diagnóstico
-- do erro e na linha do tempo da questão, mesmo com o modo sombra ligado e a publicação desligada.
--
-- Agora: o aluno só recebe esse conteúdo quando o administrador desliga o modo sombra E liga a publicação (a mesma regra que as
-- unidades da Central já seguiam). A equipe e os revisores médicos continuam vendo tudo. Nada é apagado nem desaprovado: o que
-- foi aprovado fica guardado e aparece ao aluno no instante em que as duas chaves mudarem.
--
-- Funções redefinidas partindo das versões mais novas: question_analysis_fits (…7700), ch_card_shows (…9620) e
-- ch_raw_app_question_timeline (…9620). As demais funções do aluno (comentário, Tutor, diagnóstico) já passam por essas duas.
-- ANTES DE COLAR: confira se há análise já publicada ao aluno (consulta no relatório): ela some até as chaves mudarem.
-- Pode ser colada várias vezes.
-- =============================================================================

-- O aluno já pode receber o que a Central aprovou? (modo sombra desligado e publicação ligada)
create or replace function public.ch_student_released() returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.ch_flag('publish_enabled') and not public.ch_flag('shadow_mode') $$;
revoke execute on function public.ch_student_released() from public, anon, authenticated;

-- A análise publicada (e o cartão de atualização, que repete o gabarito oficial da prova) só chega ao aluno quando:
--   - as chaves da Central estão liberadas (ch_student_released) — equipe e revisores médicos sempre veem;
--   - foi feita para o gabarito gravado agora (p_answer = official_answer_at_analysis ou official_answer do cartão; nulo =
--     registro antigo sem o gabarito anotado);
--   - a questão não está anulada;
--   - a questão não está marcada com a análise a revisar depois de troca de gabarito (campo "analise").
create or replace function public.question_analysis_fits(p_question_id text, p_answer char(1)) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.questions q
                 where q.id = p_question_id and q.status <> 'annulled'
                   and (p_answer is null or q.correct_option is not distinct from p_answer)
                   and not coalesce(q.explanations_review -> 'campos', '[]'::jsonb) ? 'analise')
     and (public.is_staff() or public.ch_is_reviewer() or public.ch_student_released())
$$;
revoke execute on function public.question_analysis_fits(text, char) from public, anon, authenticated;

-- Cartão de atualização só vai ao aluno se pelo menos uma fonte OFICIAL o sustenta (regra do dono) e se as chaves da Central
-- estão liberadas. Equipe e revisores sempre veem.
create or replace function public.ch_card_shows(p_sources jsonb) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_staff() or public.ch_is_reviewer()
      or (public.ch_student_released()
          and jsonb_array_length(case when jsonb_typeof(public.ch_student_sources(p_sources)) = 'array' then public.ch_student_sources(p_sources) else '[]'::jsonb end) > 0)
$$;
revoke execute on function public.ch_card_shows(jsonb) from public, anon, authenticated;

-- Linha do tempo da questão (corpo da …9620): para o aluno, vazia enquanto as chaves da Central não estão liberadas.
create or replace function public.ch_raw_app_question_timeline(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_staff boolean := public.is_staff() or public.ch_is_reviewer();
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.question_viewable(p_question_id) then return '[]'::jsonb; end if;
  if not v_staff and not public.ch_student_released() then return '[]'::jsonb; end if;
  if not exists (select 1 from public.question_analysis where question_id = p_question_id and status = 'published') and not v_staff then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(e.ev order by e.at, e.ord) from (
    select o.recorded_at as at, 1 as ord, jsonb_build_object('type', 'OFFICIAL_ANSWER', 'at', o.recorded_at, 'version', o.version, 'answer', o.answer, 'status', o.answer_status, 'source', public.ch_student_text(o.source), 'published_at', o.published_at) as ev
      from public.question_official_answers o where o.question_id = p_question_id
    union all
    select a.reviewed_at, 2, jsonb_build_object('type', 'ANALYSIS_PUBLISHED', 'at', a.reviewed_at, 'version', a.version)
      from public.question_analysis a where a.question_id = p_question_id and a.status = 'published' and a.reviewed_at is not null
    union all
    select k.verified_at, 3, jsonb_build_object('type', 'UPDATE_CARD', 'at', k.verified_at, 'version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level,
             'official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'superseded', k.status = 'superseded')
      from public.question_update_cards k where k.question_id = p_question_id and public.ch_card_shows(k.sources)
    union all
    select u.detected_at, 4, jsonb_build_object('type', 'SOURCE_CHANGE_DETECTED', 'at', u.detected_at, 'impact_level', u.impact_level, 'status', u.status, 'critical', u.critical, 'triage_kind', u.triage_kind, 'reason', u.reason)
      from public.question_updates u where v_staff and u.question_id = p_question_id
    union all
    select l.changed_at, 5, jsonb_build_object('type', 'QUESTION_EDITED', 'at', l.changed_at, 'reason', l.reason, 'fields', (select jsonb_agg(k) from jsonb_object_keys(l.changes) k))
      from public.question_change_log l where v_staff and l.question_id = p_question_id) e), '[]'::jsonb);
end
$$;
revoke execute on function public.ch_raw_app_question_timeline(text) from public, anon, authenticated;
