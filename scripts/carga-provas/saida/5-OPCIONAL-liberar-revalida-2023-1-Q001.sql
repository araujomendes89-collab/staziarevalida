-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 5 — OPCIONAL (só se você decidir): liberar a questão REV-2023.1-Q001.
-- Ela está marcada "cita figura" e sem figura, por isso fica FORA dos treinos. A revisão conferiu a página 2 do caderno oficial:
-- a prova NÃO tem figura nessa questão (o eletrocardiograma vem descrito em texto). Fonte: revalida_2023_1/registro-extra.json: "A prova nao tem figura na Q1; needs_image=True no banco esta errado" (conferido também em figuras-novas/manifest.json)
-- O banco não deixa tirar a marca sem figura (regra de segurança da migração 9700). Este arquivo desliga essa regra SÓ durante
-- esta mudança, numa transação, e liga de novo. A mudança fica no histórico da questão.
-- Como colar: editor SQL do Supabase, arquivo INTEIRO, Run. Primeira linha: "OK: ...". Pode colar de novo.
-- =============================================================================
begin;
select set_config('sqie.reason', 'A prova não tem figura nesta questão (conferido no caderno oficial, revisão de 12/10/2026): a marca "cita figura" sai', true);
alter table public.questions disable trigger questions_keep_figure_flag;
update public.questions set needs_image = false where id = 'revalida_2023_1_q001' and needs_image and jsonb_array_length(images) = 0;
alter table public.questions enable trigger questions_keep_figure_flag;
select set_config('sqie.reason', '', true);
commit;
select case when not needs_image then 'OK: REV-2023.1-Q001 sem a marca "cita figura" (volta aos treinos)' else 'ATENÇÃO: a marca continua' end as resultado,
       (select tgenabled <> 'D' from pg_trigger where tgname = 'questions_keep_figure_flag' and tgrelid = 'public.questions'::regclass) as regra_de_seguranca_ligada_de_novo
from public.questions where id = 'revalida_2023_1_q001';
