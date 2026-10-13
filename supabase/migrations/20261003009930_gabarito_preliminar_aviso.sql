-- =============================================================================
-- Carga das provas corrigidas (12/10/2026): o aluno passa a saber quando o gabarito da questão ainda é o PRELIMINAR do Inep.
--
-- Antes: a correção mostrava "A correta é B" igual para gabarito preliminar e definitivo (o registro oficial,
--   question_official_answers.answer_status = 'PRELIMINARY', só aparecia para a equipe). A prova nova 2026/2 entra com o
--   gabarito preliminar do Inep.
-- Agora: a correção (practice_correction_view, que serve o treino, o simulado, a sessão reaberta e o resultado) ganha
--   answer_preliminary = verdadeiro quando o gabarito oficial ATUAL da questão é o preliminar. A tela mostra um aviso discreto:
--   "Gabarito preliminar do Inep: pode mudar quando o Inep publicar o definitivo." Quando a equipe registrar o definitivo pela
--   função oficial (app_admin_set_official_answer, situação FINAL), o aviso some sozinho.
--   Só depois de responder (a correção já exige isso); nada novo é liberado: o aluno continua sem ler question_official_answers.
--
-- Redefinida: practice_correction_view (o invólucro da …9620; o corpo ch_raw_practice_correction_view NÃO muda, então esta
--   migração não colide com a …9920 das explicações, que redefine o corpo). Se a …9620 for colada de novo, cole esta de novo.
-- Pode ser colada duas vezes. Para desfazer: recriar practice_correction_view como na …9620.
-- =============================================================================

create or replace function public.practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_practice_correction_view(p_question_id, p_selected))
         || jsonb_build_object('answer_preliminary', exists (
              select 1 from public.question_official_answers o
              where o.question_id = p_question_id and o.is_current and o.answer_status = 'PRELIMINARY'))
$$;
