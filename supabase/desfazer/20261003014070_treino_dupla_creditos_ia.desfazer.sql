-- DESFAZER da 20261003014070_treino_dupla_creditos_ia.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- função refeita: credit_avail(uuid,text,timestamp with time zone) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.credit_avail(p_uid uuid, p_pool text, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer;
  v_used integer := 0;
  w public.credit_wallets;
begin
  if not public.credit_ativa() then
    return jsonb_build_object('off', true, 'unlimited', false, 'limit', null, 'used', 0, 'daily', 0, 'bonus', 0, 'purchased', 0);
  end if;
  if public.user_has_full_access(p_uid) then
    return jsonb_build_object('off', false, 'unlimited', true, 'limit', null, 'used', 0, 'daily', 0, 'bonus', 0, 'purchased', 0);
  end if;
  v_limit := public.credit_limit(p_uid, p_pool, p_now);
  select coalesce(d.used, 0) into v_used
    from public.credit_daily d where d.user_id = p_uid and d.pool = p_pool and d.day = public.credit_day(p_now);
  v_used := coalesce(v_used, 0);
  select * into w from public.credit_wallets x where x.user_id = p_uid and x.pool = p_pool;
  return jsonb_build_object('off', false, 'unlimited', false, 'limit', v_limit, 'used', v_used,
                            'daily', greatest(0, v_limit - v_used),
                            'bonus', coalesce(w.bonus_balance, 0), 'purchased', coalesce(w.purchased_balance, 0));
end
$function$;
-- função refeita: credit_state(uuid,text,timestamp with time zone) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.credit_state(p_uid uuid, p_pool text, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                            'disponivel', (a ->> 'daily')::integer + (a ->> 'bonus')::integer + (a ->> 'purchased')::integer);
end
$function$;
-- funções criadas por ela
drop function if exists public.credit_refund_ref(text,uuid,text,timestamp with time zone);
