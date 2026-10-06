-- =============================================================================
-- "Stazia Play" passa a se chamar "Stazia Arena" (pedido do dono, 2026-10-06). Só os textos guardados no banco mudam; o motor,
-- as tabelas (gamification_*, levels) e as funções (gam_*, app_gamification_*) seguem iguais. As telas mudaram no código.
-- =============================================================================
update public.gamification_rules set description = replace(description, 'o Stazia Play', 'a Stazia Arena') where description like '%Stazia Play%';
update public.levels set description = 'O topo da Stazia Arena.' where slug = 'lenda' and description = 'O topo do Stazia Play.';
