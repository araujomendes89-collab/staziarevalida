-- =============================================================================
-- 013807 — Abertura do Tutor escrita pela IA paga pela CARTEIRA do aluno (decisão do dono de 17/10/2026, Pacote 1).
--
--   * Recurso novo da carteira: 'tutor_abertura'. O servidor (server/tutor/opening.ts) RESERVA antes de usar a IA na abertura,
--     CONFIRMA pelo custo real só quando a conversa usa a fala da IA e DEVOLVE quando não usa (IA falhou, fala barrada, ficou a
--     reserva fixa). A abertura PREPARADA na entrada (013805) continua custo da casa enquanto não é usada (teto de 40 por dia e 15
--     sem uso); quando uma conversa a usa, o custo dela (o mesmo gravado no ai_usage_ledger) é cobrado da carteira do aluno.
--   * Com a chave DESLIGADA (cadeados_ligados = false, modo sombra): nada muda para o aluno. A reserva NÃO passa pela regra antiga
--     do Tutor (ch_worker_tutor_text_reserve: a abertura nunca gastou a cota de mensagens) e a carteira só anota.
--   * Com a chave LIGADA: o acesso é o mesmo do Tutor por texto (trancado ou sem créditos → recusa); recusada, a conversa abre com a
--     fala de reserva, sem IA.
--
-- O que muda no banco (aditivo):
--   1) carteira_movimentos.recurso aceita 'tutor_abertura';
--   2) ch_worker_carteira_reservar é REMENDADA sobre a versão do banco (pg_get_functiondef + troca de trechos; se algum trecho não
--      for encontrado, para com erro e nada é gravado): aceita o recurso, usa o acesso do Tutor por texto e confere se o Tutor está
--      ligado, como no Tutor por texto;
--   3) ch_worker_tutor_opening_ready_custo(user, ready_id): custo em US$ da abertura preparada (do ai_usage_ledger).
-- Pode ser colada de novo. Desfazer: supabase/desfazer/20261003013807_abertura_na_carteira.desfazer.sql
-- =============================================================================

-- 1) recurso novo nos movimentos da carteira
do $do$
declare
  c record;
begin
  for c in select con.conname from pg_constraint con
           where con.conrelid = 'public.carteira_movimentos'::regclass and con.contype = 'c'
             and pg_get_constraintdef(con.oid) like '%recurso%' and pg_get_constraintdef(con.oid) not like '%tutor_abertura%' loop
    execute format('alter table public.carteira_movimentos drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint con where con.conrelid = 'public.carteira_movimentos'::regclass and con.conname = 'carteira_movimentos_recurso_check') then
    alter table public.carteira_movimentos add constraint carteira_movimentos_recurso_check
      check (recurso in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia', 'voz_ao_vivo', 'tutor_abertura'));
  end if;
end
$do$;

-- 2) remendo da reserva
do $do$
declare
  v_def text := pg_get_functiondef('public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer)'::regprocedure);
  v_novo text;
  a1 constant text := $t$not in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia') then$t$;
  b1 constant text := $t$not in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia', 'tutor_abertura') then$t$;
  a2 constant text := $t$v_acesso := d #>> array['recursos', p_recurso, 'acesso'];$t$;
  b2 constant text := $t$v_acesso := d #>> array['recursos', case when p_recurso = 'tutor_abertura' then 'tutor_texto' else p_recurso end, 'acesso'];$t$;
  a3 constant text := $t$if v_tutor or p_recurso = 'dica_questao' then$t$;
  b3 constant text := $t$if v_tutor or p_recurso in ('dica_questao', 'tutor_abertura') then$t$;
begin
  if position(b1 in v_def) > 0 then
    raise notice '013807: ch_worker_carteira_reservar já aceita tutor_abertura';
    return;
  end if;
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception '013807: ch_worker_carteira_reservar: trecho esperado não encontrado (a função mudou depois do ensaio)';
  end if;
  v_novo := replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
  execute v_novo;
end
$do$;
revoke execute on function public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer) from public, anon, authenticated;

-- 3) custo da abertura preparada (para cobrar da carteira quando a conversa usa a fala)
create or replace function public.ch_worker_tutor_opening_ready_custo(p_user uuid, p_ready_id bigint) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select l.estimated_cost_usd
    from public.tutor_opening_ready r join public.ai_usage_ledger l on l.id = r.ledger_id
   where r.id = p_ready_id and r.user_id = p_user
$$;
revoke execute on function public.ch_worker_tutor_opening_ready_custo(uuid, bigint) from public, anon, authenticated;
