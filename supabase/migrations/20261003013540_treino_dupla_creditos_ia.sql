-- =============================================================================
-- Stazia Match, Etapa M3 (PREPARAÇÃO): a moeda "ia" no mesmo livro, com janelas de dia, semana e mês, e estorno por referência.
-- (Plano de 12/10: "migração 9975"; este arquivo usa 013540, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013490/013500. Pode ser colada duas vezes: só "create or replace function" e permissões. Não grava dado.
-- COTA DESLIGADA (creditos.ativa = false, o padrão): nada muda. Nenhuma IA é chamada aqui. Sem pagamento.
--
-- POR QUE É "PREPARAÇÃO" E NÃO A M3 INTEIRA
--   A M3 liga o treino SOZINHO com avaliação por IA (ramo dupla-sozinho-ia, funções ch_worker_solo_prepare / _fail) ao livro. Esse
--   ramo ainda não foi juntado a este e conta a cota por conta própria (station_attempts.ia_reserved_at, limite_dia e limite_mes
--   em app_settings.treino_dupla.sozinho.ia). Este arquivo entrega só o que NÃO depende dele e que a ligação vai precisar:
--     1) credit_avail / credit_state para a moeda "ia" com as janelas de DIA, SEMANA (segunda a domingo, Brasília) e MÊS:
--        creditos.ia.<plano> = número (só dia) ou { dia, semana, mes } (cada um número ou vazio). Janela vazia não limita
--        aquela janela, MAS plano sem nenhuma janela = ZERO (falha fechada: vazio = IA bloqueada). O disponível diário é o MENOR
--        entre o que sobra no dia, na semana e no mês; bônus e comprados valem depois (saldo avulso depois do limite do plano).
--        A moeda "match" não muda (só dia).
--     2) credit_refund_ref(tipo, ref, motivo): estorna, de uma vez, os consumos ainda não estornados de uma referência (a tentativa
--        do treino sozinho), cada um ao seu balde. É o que ch_worker_solo_fail vai chamar.
--   A LIGAÇÃO (feita na junção, depois de a 6B estar no mesmo ramo e de o dono dar os números):
--     - ch_worker_solo_prepare: trocar a contagem por ia_reserved_at pela reserva
--         credit_consume(p_user, 'ia', <peso em creditos.ia.pesos.avaliacao_sozinho>, 'solo_run', p_attempt, 'solo:' || p_attempt)
--       (peso vazio = bloqueada: 'Avaliação por IA indisponível.'; sem saldo → a mesma mensagem de "Você usou as avaliações de hoje");
--     - ch_worker_solo_fail: perform public.credit_refund_ref('solo_run', p_attempt, 'Falha da avaliação por IA');
--     - solo_ia_status: ler public.credit_state(p_uid, 'ia') (usados_hoje, disponivel) no lugar de usadas_dia/usadas_mes;
--     - tela do sozinho: app_credit_state('ia') (já existe, 013500).
--   O ai_usage_ledger segue só para CUSTO. O Tutor não muda.
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - Semana = segunda a domingo no fuso de São Paulo; mês = mês civil nesse fuso.
--  - As janelas somam credit_daily.used (consumo diário líquido de estornos): estornar um consumo diário reduz o dia do consumo
--    e, portanto, também a semana e o mês dele. Bônus e comprados não entram em janela nenhuma.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: credit_avail(uuid, text, timestamptz) ← 013500; credit_state(uuid, text, timestamptz)
--   ← 013500 (igual, mais as chaves de semana e mês). Nova: credit_refund_ref.
-- COMO DESFAZER: colar de novo credit_avail e credit_state da 013500; apagar credit_refund_ref(text, uuid, text, timestamptz).
-- =============================================================================

create or replace function public.credit_avail(p_uid uuid, p_pool text, p_now timestamptz default now()) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer := 0;
  w public.credit_wallets;
  v_day date := public.credit_day(p_now);
  v_plan text;
  v_x jsonb;
  v_dia integer; v_sem integer; v_mes integer;
  v_used_w integer := 0; v_used_m integer := 0;
  v_daily integer;
begin
  if not public.credit_ativa() then
    return jsonb_build_object('off', true, 'unlimited', false, 'limit', null, 'used', 0, 'daily', 0, 'bonus', 0, 'purchased', 0);
  end if;
  if public.user_has_full_access(p_uid) then
    return jsonb_build_object('off', false, 'unlimited', true, 'limit', null, 'used', 0, 'daily', 0, 'bonus', 0, 'purchased', 0);
  end if;
  select coalesce(d.used, 0) into v_used
    from public.credit_daily d where d.user_id = p_uid and d.pool = p_pool and d.day = v_day;
  v_used := coalesce(v_used, 0);
  select * into w from public.credit_wallets x where x.user_id = p_uid and x.pool = p_pool;

  if p_pool = 'ia' then
    -- Janelas de dia, semana e mês (creditos.ia.<plano>: número = só dia; objeto = { dia, semana, mes }).
    v_plan := public.credit_plan(p_uid, p_now);
    v_x := case when v_plan is null then null else public.credit_cfg() -> 'ia' -> v_plan end;
    if jsonb_typeof(v_x) = 'number' then
      v_x := jsonb_build_object('dia', v_x);
    end if;
    if jsonb_typeof(v_x) = 'object' then
      v_dia := case when jsonb_typeof(v_x -> 'dia') = 'number' and (v_x ->> 'dia')::numeric between 0 and 100000 then trunc((v_x ->> 'dia')::numeric)::integer end;
      v_sem := case when jsonb_typeof(v_x -> 'semana') = 'number' and (v_x ->> 'semana')::numeric between 0 and 1000000 then trunc((v_x ->> 'semana')::numeric)::integer end;
      v_mes := case when jsonb_typeof(v_x -> 'mes') = 'number' and (v_x ->> 'mes')::numeric between 0 and 10000000 then trunc((v_x ->> 'mes')::numeric)::integer end;
    end if;
    select coalesce(sum(d.used), 0)::integer into v_used_w
      from public.credit_daily d
     where d.user_id = p_uid and d.pool = p_pool and d.day between v_day - (extract(isodow from v_day)::integer - 1) and v_day;
    select coalesce(sum(d.used), 0)::integer into v_used_m
      from public.credit_daily d
     where d.user_id = p_uid and d.pool = p_pool and d.day between date_trunc('month', v_day)::date and v_day;
    if v_dia is null and v_sem is null and v_mes is null then
      v_daily := 0;                                         -- plano sem nenhuma janela = bloqueada (falha fechada)
    else
      -- (greatest ignora nulo: janela vazia é tratada à parte, nunca por "greatest(0, nulo)")
      v_daily := least(
        case when v_dia is null then 2147483647 else greatest(0, v_dia - v_used) end,
        case when v_sem is null then 2147483647 else greatest(0, v_sem - v_used_w) end,
        case when v_mes is null then 2147483647 else greatest(0, v_mes - v_used_m) end);
      if v_daily = 2147483647 then
        v_daily := 0;                                       -- (inalcançável: ao menos uma janela existe)
      end if;
    end if;
    return jsonb_build_object('off', false, 'unlimited', false, 'limit', v_dia, 'used', v_used, 'daily', v_daily,
                              'bonus', coalesce(w.bonus_balance, 0), 'purchased', coalesce(w.purchased_balance, 0),
                              'week_limit', v_sem, 'week_used', v_used_w, 'month_limit', v_mes, 'month_used', v_used_m);
  end if;

  v_limit := public.credit_limit(p_uid, p_pool, p_now);
  return jsonb_build_object('off', false, 'unlimited', false, 'limit', v_limit, 'used', v_used,
                            'daily', greatest(0, v_limit - v_used),
                            'bonus', coalesce(w.bonus_balance, 0), 'purchased', coalesce(w.purchased_balance, 0));
end
$$;

create or replace function public.credit_state(p_uid uuid, p_pool text, p_now timestamptz default now()) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  a jsonb := public.credit_avail(p_uid, p_pool, p_now);
begin
  if (a ->> 'off')::boolean then
    return jsonb_build_object('ativa', false, 'ilimitado', false, 'limite_dia', null, 'usados_hoje', 0, 'bonus', 0, 'comprados', 0, 'disponivel', null);
  end if;
  if (a ->> 'unlimited')::boolean then
    return jsonb_build_object('ativa', true, 'ilimitado', true, 'limite_dia', null, 'usados_hoje', 0, 'bonus', 0, 'comprados', 0, 'disponivel', null);
  end if;
  return jsonb_build_object('ativa', true, 'ilimitado', false, 'limite_dia', a -> 'limit', 'usados_hoje', a -> 'used',
                            'bonus', a -> 'bonus', 'comprados', a -> 'purchased',
                            'disponivel', (a ->> 'daily')::integer + (a ->> 'bonus')::integer + (a ->> 'purchased')::integer)
         || case when a ? 'week_used'
                 then jsonb_build_object('limite_semana', a -> 'week_limit', 'usados_semana', a -> 'week_used',
                                         'limite_mes', a -> 'month_limit', 'usados_mes', a -> 'month_used')
                 else '{}'::jsonb end;
end
$$;

-- Estorna, uma vez cada, os consumos de uma referência que ainda não foram estornados (cada um ao seu balde).
-- → { estornados: n, ledger_ids: [...] }. Sem consumo pendente: { estornados: 0 }.
create or replace function public.credit_refund_ref(p_ref_type text, p_ref_id uuid, p_reason text, p_now timestamptz default now()) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_ids jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_res jsonb;
begin
  if p_ref_type is null or p_ref_id is null then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  for r in
    select l.id from public.credit_ledger l
     where l.ref_type = p_ref_type and l.ref_id = p_ref_id and l.kind = 'consume'
       and not exists (select 1 from public.credit_ledger f where f.reverses_id = l.id)
     order by l.id
  loop
    v_res := public.credit_refund(r.id, p_reason, p_now);
    if not coalesce((v_res ->> 'already')::boolean, false) then
      v_n := v_n + 1;
      v_ids := v_ids || to_jsonb(v_res -> 'ledger_id');
    end if;
  end loop;
  return jsonb_build_object('estornados', v_n, 'ledger_ids', v_ids);
end
$$;

revoke execute on function public.credit_avail(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_state(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_refund_ref(text, uuid, text, timestamptz) from public, anon, authenticated;
