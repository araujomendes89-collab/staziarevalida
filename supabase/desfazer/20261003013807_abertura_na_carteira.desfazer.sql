-- Desfaz supabase/migrations/20261003013807_abertura_na_carteira.sql (abertura do Tutor paga pela carteira).
-- Desfaça também no servidor (sem o recurso, a reserva da abertura é recusada pelo banco e a conversa abre com a fala de reserva).
-- Os movimentos já gravados como 'tutor_abertura' passam a constar como 'tutor_texto' (o saldo do aluno não muda).
-- Pode ser rodado de novo sem erro.

drop function if exists public.ch_worker_tutor_opening_ready_custo(uuid, bigint);

do $do$
declare
  v_def text;
  b1 constant text := $t$not in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia', 'tutor_abertura') then$t$;
  a1 constant text := $t$not in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia') then$t$;
  b2 constant text := $t$v_acesso := d #>> array['recursos', case when p_recurso = 'tutor_abertura' then 'tutor_texto' else p_recurso end, 'acesso'];$t$;
  a2 constant text := $t$v_acesso := d #>> array['recursos', p_recurso, 'acesso'];$t$;
  b3 constant text := $t$if v_tutor or p_recurso in ('dica_questao', 'tutor_abertura') then$t$;
  a3 constant text := $t$if v_tutor or p_recurso = 'dica_questao' then$t$;
begin
  if to_regprocedure('public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer)') is null then return; end if;
  v_def := pg_get_functiondef('public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer)'::regprocedure);
  if position(b1 in v_def) = 0 then return; end if;
  execute replace(replace(replace(v_def, b1, a1), b2, a2), b3, a3);
  revoke execute on function public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer) from public, anon, authenticated;
end
$do$;

do $do$
begin
  if to_regclass('public.carteira_movimentos') is null then return; end if;
  update public.carteira_movimentos set recurso = 'tutor_texto' where recurso = 'tutor_abertura';
  alter table public.carteira_movimentos drop constraint if exists carteira_movimentos_recurso_check;
  alter table public.carteira_movimentos add constraint carteira_movimentos_recurso_check
    check (recurso in ('tutor_texto', 'tutor_janela', 'dica_questao', 'correcao_estacao_ia', 'voz_ao_vivo'));
end
$do$;
