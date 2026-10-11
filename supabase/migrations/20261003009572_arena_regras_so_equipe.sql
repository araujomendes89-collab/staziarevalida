-- =============================================================================
-- Stazia Arena: as regras só a equipe lê (correção AR09, 2026-10-11). Cole depois da 20261003009571.
--
-- Antes, qualquer aluno logado podia ler a tabela de regras inteira, inclusive os limites do antifraude (tempo mínimo
-- por resposta, respostas por minuto, repetição de questão). Agora só administrador e editor leem direto na tabela.
--
-- O aluno não perde nada: as telas dele nunca leem essa tabela; o cálculo de XP, as missões e o ranking leem as regras
-- por funções internas do banco (security definer), que continuam funcionando. Nenhum dado é apagado ou alterado.
-- Cole quantas vezes quiser.
-- =============================================================================
drop policy if exists "regras do play: leitura para logados" on public.gamification_rules;
drop policy if exists "regras do play: só a equipe lê" on public.gamification_rules;
create policy "regras do play: só a equipe lê" on public.gamification_rules
  for select to authenticated using (public.is_staff());
