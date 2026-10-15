-- =============================================================================
-- Aulas do aluno: Saúde Mental e Saúde Coletiva passam a ser publicadas dentro de "Medicina de Família e Comunidade" (15/10/2026,
-- decisão do assistente a pedido do dono "publique o que está aprovado"; revisar quando o campo de área passar de 5 para 7 valores).
-- Hoje o enum das aulas (med_area) tem 5 áreas; a trava de publicação (9861) barrava as duas áreas por não terem correspondente.
-- Só troca a função de apoio ch_student_area: nada de dados muda. Pode ser colada duas ou mais vezes.
-- =============================================================================
create or replace function public.ch_student_area(p_area_code text) returns public.med_area
  language sql immutable set search_path = ''
as $$
  select case p_area_code
    when 'CLINICA_MEDICA' then 'CLINICA_MEDICA'::public.med_area
    when 'CIRURGIA' then 'CIRURGIA_GERAL'::public.med_area
    when 'GINECOLOGIA_OBSTETRICIA' then 'GINECOLOGIA_OBSTETRICIA'::public.med_area
    when 'PEDIATRIA' then 'PEDIATRIA'::public.med_area
    when 'MFC' then 'MEDICINA_FAMILIA_COMUNIDADE'::public.med_area
    when 'SAUDE_MENTAL' then 'MEDICINA_FAMILIA_COMUNIDADE'::public.med_area   -- ponte até o enum de 7 áreas
    when 'SAUDE_COLETIVA' then 'MEDICINA_FAMILIA_COMUNIDADE'::public.med_area  -- ponte até o enum de 7 áreas
    else null end
$$;
