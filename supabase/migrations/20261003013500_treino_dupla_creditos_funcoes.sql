-- =============================================================================
-- Stazia Match, Etapas M1b e M1c: as funções do livro de créditos, o que o aluno vê, exportação e exclusão da conta.
-- (Plano de 12/10: "migrações 9961 e 9962", juntas; este arquivo usa 013500, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013490 (tabelas), 013370 (última app_export_my_data) e das regras de acesso (user_has_full_access, subscription_is_paid).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não grava dado. Nenhuma IA. Sem pagamento.
-- Com "creditos.ativa" = false (nasce assim) NENHUMA função debita, limita ou grava lançamento: o sistema segue como era.
--
-- O QUE FAZ (todas "security definer set search_path = ''")
--  Internas (o navegador nunca chama; "revoke … from public, anon, authenticated"):
--    credit_day, credit_cfg, credit_ativa, credit_plan, credit_limit, credit_order, credit_avail, credit_state,
--    credit_available (boolean, não debita), credit_assert_available (pré-checagem, não debita),
--    credit_consume (um aluno), credit_consume_pair (os dois, ou nenhum), credit_refund, credit_grant, credit_reconcile.
--  Do aluno: app_credit_state(pool) (só o próprio estado: cota do dia, bônus, comprados, quando renova).
--  Exportação: dupla_export_creditos() + app_export_my_data refeita (chave nova "study_credits", com colunas LISTADAS).
--  Exclusão da conta: as 4 tabelas somem junto, por "on delete cascade" (013490); a conta do colega não é tocada.
--
-- REGRAS (spec §3.6 e §4; o dono pode mudar)
--  - Dia = America/Sao_Paulo, calculado UMA vez por operação a partir de p_now (nunca exposto ao navegador).
--  - Limite diário = o do plano VIVO (teste dentro do prazo, ou plano pago vigente) em creditos.<moeda>.<plano>
--    (número, ou objeto com "dia" para a moeda "ia"). Plano sem número = ZERO quando a cota está ligada (falha fechada).
--    Equipe (user_has_full_access: administrador, editor, revisor médico) não é limitada e não gasta ("unlimited").
--  - Ordem do débito: diária, depois bônus, depois comprados (creditos.<moeda>.ordem pode trocar, com os 3 baldes).
--  - Chave de operação (idem_key) única: a mesma operação nunca debita duas vezes; devolve o que já foi feito.
--  - Trava por aluno e moeda: pg_advisory_xact_lock('credito:<moeda>:<uuid>'). O par trava em ordem CRESCENTE de UUID e confere
--    os dois ANTES de gravar qualquer coisa: se um não tem saldo, nenhum é cobrado.
--  - Estorno: volta ao MESMO balde, uma vez só (chave 'refund:<id do lançamento>'). Consumo diário de dia passado: o estorno é
--    lançado no dia original, reduz o uso daquele dia e NÃO cria cota nova hoje (compensação, se houver, é concessão de bônus).
--  - Mensagens ao aluno nunca trazem o saldo nem o motivo do outro. Erro de máquina: errcode 54000 + hint INSUFFICIENT_CREDITS.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_export_my_data() ← 013370 (igual, mais "study_credits" no fim). Todas as credit_* e app_credit_state são novas.
--   Usadas sem mudar: user_has_full_access, subscription_is_paid (…9550); admin_log (…1300) só nas funções do administrador (013530).
--
-- JUNÇÃO COM OUTROS GRUPOS: app_export_my_data é peça comum. Quem juntar deve partir da definição MAIS NOVA entre os ramos e
--   acrescentar apenas a linha 'study_credits' (a função dupla_export_creditos faz o trabalho).
--
-- COMO DESFAZER: colar de novo app_export_my_data da 013370; apagar dupla_export_creditos(), app_credit_state(text) e as
--   credit_* listadas acima. (As tabelas e o livro ficam: são registro.)
-- =============================================================================

-- ---------------------------------------------------------------- 1) apoios de configuração
create or replace function public.credit_day(p_now timestamptz default now()) returns date
  language sql stable security definer set search_path = ''
as $$ select (p_now at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.credit_cfg() returns jsonb
  language sql stable security definer set search_path = ''
as $$ select coalesce((select c.value from public.app_settings c where c.key = 'creditos'), '{"ativa": false}'::jsonb) $$;

create or replace function public.credit_ativa() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce(public.credit_cfg() -> 'ativa' = 'true'::jsonb, false) $$;

-- Plano vivo do aluno: 'trial' (teste dentro do prazo), 'pro' ou 'elite' (pago e vigente); nulo se não tem nenhum.
create or replace function public.credit_plan(p_uid uuid, p_now timestamptz default now()) returns text
  language sql stable security definer set search_path = ''
as $$
  select case
           when s.plan = 'trial' and s.status = 'trialing' and s.trial_ends_at > p_now then 'trial'
           when s.plan in ('pro', 'elite') and public.subscription_is_paid(s.plan, s.status, s.current_period_end) then s.plan::text
         end
    from public.subscriptions s
   where s.user_id = p_uid
$$;

-- Limite diário do aluno na moeda. NULO = sem limite (cota desligada ou equipe). Plano vivo sem número = 0.
create or replace function public.credit_limit(p_uid uuid, p_pool text, p_now timestamptz default now()) returns integer
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_plan text;
  v_x jsonb;
  v_n numeric;
begin
  if not public.credit_ativa() or public.user_has_full_access(p_uid) then
    return null;
  end if;
  v_plan := public.credit_plan(p_uid, p_now);
  if v_plan is null then
    return 0;
  end if;
  v_x := public.credit_cfg() -> p_pool -> v_plan;
  if jsonb_typeof(v_x) = 'object' then
    v_x := v_x -> 'dia';
  end if;
  if jsonb_typeof(v_x) = 'number' then
    v_n := (v_x #>> '{}')::numeric;
    return case when v_n >= 0 and v_n <= 100000 then trunc(v_n)::integer else 0 end;
  end if;
  return 0;
end
$$;

-- "Treinar outra estação" (rodada 2 em diante) cobra? Decisão do dono de 17/10: SIM, cada estação nova na mesma sala é uma sessão nova.
-- Verdadeiro quando a chave está ausente, nula ou verdadeira; só um "false" explícito (desligado à mão na Administração) deixa de cobrar.
create or replace function public.credit_cobra_rodada() returns boolean
  language sql stable security definer set search_path = ''
as $$ select (public.credit_cfg() -> 'match' -> 'cobra_rodada_extra') is distinct from 'false'::jsonb $$;

-- Ordem do débito da moeda (padrão do documento: diária, bônus, comprados).
create or replace function public.credit_order(p_pool text) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_x jsonb := public.credit_cfg() -> p_pool -> 'ordem';
  v_arr text[];
begin
  if jsonb_typeof(v_x) = 'array' and jsonb_array_length(v_x) = 3 then
    v_arr := array(select e #>> '{}' from jsonb_array_elements(v_x) e);
    if v_arr @> array['daily', 'bonus', 'purchased'] and cardinality(v_arr) = 3 then
      return v_arr;
    end if;
  end if;
  return array['daily', 'bonus', 'purchased'];
end
$$;

-- ---------------------------------------------------------------- 2) o que há para gastar (não trava, não grava)
-- → { off, unlimited, limit, used, daily, bonus, purchased }  (off = cota desligada; unlimited = equipe com a cota ligada)
create or replace function public.credit_avail(p_uid uuid, p_pool text, p_now timestamptz default now()) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
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
$$;

-- O estado para a tela e para a Administração: { ativa, ilimitado, limite_dia, usados_hoje, bonus, comprados, disponivel }.
-- disponivel = diária que sobra + bônus + comprados; nulo quando a cota está desligada ou a pessoa é da equipe.
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
                            'disponivel', (a ->> 'daily')::integer + (a ->> 'bonus')::integer + (a ->> 'purchased')::integer);
end
$$;

-- Tem pelo menos p_n para gastar agora? (cota desligada ou equipe: sempre sim). Não debita, não levanta erro.
create or replace function public.credit_available(p_uid uuid, p_pool text, p_n integer default 1, p_now timestamptz default now()) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  a jsonb := public.credit_avail(p_uid, p_pool, p_now);
begin
  if (a ->> 'off')::boolean or (a ->> 'unlimited')::boolean then
    return true;
  end if;
  return (a ->> 'daily')::integer + (a ->> 'bonus')::integer + (a ->> 'purchased')::integer >= coalesce(p_n, 1);
end
$$;

-- Pré-checagem (spec §3.4): não debita. Sem crédito → 'sem_credito' (54000, hint INSUFFICIENT_CREDITS).
create or replace function public.credit_assert_available(p_uid uuid, p_pool text, p_now timestamptz default now()) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.credit_available(p_uid, p_pool, 1, p_now) then
    raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
  end if;
end
$$;

-- ---------------------------------------------------------------- 3) debitar (um aluno)
-- → { charged, already, bucket, ledger_id, buckets: [{ bucket, n, ledger_id }] }
--   cota desligada → { charged: false }; equipe → { charged: false, bucket: 'unlimited' }, ambos sem lançamento.
--   Repetir a mesma p_idem devolve o que já foi feito e NÃO debita.
create or replace function public.credit_consume(
  p_uid uuid, p_pool text, p_n integer, p_ref_type text, p_ref_id uuid, p_idem text, p_now timestamptz default now()
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  l public.credit_ledger;
  a jsonb;
  v_day date := public.credit_day(p_now);
  v_left integer := p_n;
  v_take integer;
  v_avail integer;
  v_b text;
  v_i integer := 0;
  v_id bigint;
  v_list jsonb := '[]'::jsonb;
  v_first_b text;
  v_first_id bigint;
begin
  if p_uid is null or p_pool is null or p_pool not in ('match', 'ia') then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  if p_n is null or p_n < 1 or p_idem is null or char_length(btrim(p_idem)) = 0 then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credito:' || p_pool || ':' || p_uid::text, 0));

  select * into l from public.credit_ledger x where x.idem_key = p_idem;
  if found then
    if l.user_id <> p_uid or l.kind <> 'consume' then
      raise exception 'Operação inválida.' using errcode = '22023';
    end if;
    return jsonb_build_object('charged', true, 'already', true, 'bucket', l.bucket, 'ledger_id', l.id, 'day', l.day);
  end if;

  a := public.credit_avail(p_uid, p_pool, p_now);
  if (a ->> 'off')::boolean then
    return jsonb_build_object('charged', false, 'already', false, 'bucket', null, 'ledger_id', null);
  end if;
  if (a ->> 'unlimited')::boolean then
    return jsonb_build_object('charged', false, 'already', false, 'bucket', 'unlimited', 'ledger_id', null);
  end if;
  if (a ->> 'daily')::integer + (a ->> 'bonus')::integer + (a ->> 'purchased')::integer < p_n then
    raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.credit_wallets (user_id, pool) values (p_uid, p_pool) on conflict (user_id, pool) do nothing;

  foreach v_b in array public.credit_order(p_pool) loop
    exit when v_left <= 0;
    v_avail := (a ->> v_b)::integer;
    v_take := least(v_left, v_avail);
    continue when v_take <= 0;
    v_i := v_i + 1;
    -- (created_by fica nulo no consumo: quem aperta "iniciar" é o avaliador, não "quem lançou" os créditos dos dois.)
    insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, ref_type, ref_id, idem_key)
    values (p_uid, p_pool, v_day, 'consume', v_b, v_take, p_ref_type, p_ref_id,
            case when v_i = 1 then p_idem else p_idem || '#' || v_i end)
    returning id into v_id;
    if v_b = 'daily' then
      insert into public.credit_daily (user_id, pool, day, used) values (p_uid, p_pool, v_day, v_take)
      on conflict (user_id, pool, day) do update set used = public.credit_daily.used + excluded.used, updated_at = now();
    elsif v_b = 'bonus' then
      update public.credit_wallets set bonus_balance = bonus_balance - v_take, updated_at = now() where user_id = p_uid and pool = p_pool;
    else
      update public.credit_wallets set purchased_balance = purchased_balance - v_take, updated_at = now() where user_id = p_uid and pool = p_pool;
    end if;
    v_list := v_list || jsonb_build_object('bucket', v_b, 'n', v_take, 'ledger_id', v_id);
    if v_i = 1 then
      v_first_b := v_b;
      v_first_id := v_id;
    end if;
    v_left := v_left - v_take;
  end loop;

  return jsonb_build_object('charged', true, 'already', false, 'bucket', v_first_b, 'ledger_id', v_first_id, 'day', v_day, 'buckets', v_list);
end
$$;

-- ---------------------------------------------------------------- 4) debitar os dois (ou nenhum)
-- Trava os dois em ordem crescente de UUID, confere os dois ANTES de gravar e só então debita 1 de cada (chaves
-- p_idem_prefix || ':' || uuid). Falta de saldo em qualquer um → 'sem_credito' (nada gravado). Quem já foi cobrado com a mesma
-- chave conta como "pago". → { "<uuid a>": {charged,…}, "<uuid b>": {charged,…} } (nunca o saldo).
create or replace function public.credit_consume_pair(
  p_pool text, p_a uuid, p_b uuid, p_ref_type text, p_ref_id uuid, p_idem_prefix text, p_now timestamptz default now()
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_lo uuid;
  v_hi uuid;
  ra jsonb;
  rb jsonb;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  if p_pool is null or p_pool not in ('match', 'ia') or p_idem_prefix is null or char_length(btrim(p_idem_prefix)) = 0 then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  v_lo := least(p_a, p_b);
  v_hi := greatest(p_a, p_b);
  perform pg_advisory_xact_lock(hashtextextended('credito:' || p_pool || ':' || v_lo::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('credito:' || p_pool || ':' || v_hi::text, 0));

  -- 1) conferir os dois antes de gravar qualquer coisa
  if not exists (select 1 from public.credit_ledger x where x.idem_key = p_idem_prefix || ':' || v_lo::text)
     and not public.credit_available(v_lo, p_pool, 1, p_now) then
    raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
  end if;
  if not exists (select 1 from public.credit_ledger x where x.idem_key = p_idem_prefix || ':' || v_hi::text)
     and not public.credit_available(v_hi, p_pool, 1, p_now) then
    raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
  end if;

  -- 2) debitar, em ordem de UUID
  ra := public.credit_consume(v_lo, p_pool, 1, p_ref_type, p_ref_id, p_idem_prefix || ':' || v_lo::text, p_now);
  rb := public.credit_consume(v_hi, p_pool, 1, p_ref_type, p_ref_id, p_idem_prefix || ':' || v_hi::text, p_now);
  return jsonb_build_object(v_lo::text, ra, v_hi::text, rb);
end
$$;

-- ---------------------------------------------------------------- 5) estornar e conceder
-- Estorno de UM lançamento de consumo, para o MESMO balde, uma vez só. O lançamento do estorno leva o dia do consumo.
-- Diária: reduz o uso daquele dia (se for de dia passado, isso NÃO cria cota nova hoje). Bônus e comprados: voltam ao saldo.
-- → { already, ledger_id, bucket, day, same_day }
create or replace function public.credit_refund(p_ledger_id bigint, p_reason text, p_now timestamptz default now()) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  l public.credit_ledger;
  f public.credit_ledger;
  v_id bigint;
begin
  select * into l from public.credit_ledger x where x.id = p_ledger_id;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = '22023';
  end if;
  if l.kind <> 'consume' then
    raise exception 'Só um consumo pode ser estornado.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credito:' || l.pool || ':' || l.user_id::text, 0));
  select * into f from public.credit_ledger x where x.idem_key = 'refund:' || l.id::text;
  if found then
    return jsonb_build_object('already', true, 'ledger_id', f.id, 'bucket', l.bucket, 'day', l.day, 'same_day', l.day = public.credit_day(p_now));
  end if;
  insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, ref_type, ref_id, idem_key, reverses_id, reason, created_by)
  values (l.user_id, l.pool, l.day, 'refund', l.bucket, l.amount, l.ref_type, l.ref_id, 'refund:' || l.id::text, l.id,
          nullif(left(btrim(coalesce(p_reason, '')), 300), ''), (select auth.uid()))
  returning id into v_id;
  if l.bucket = 'daily' then
    update public.credit_daily set used = greatest(0, used - l.amount), updated_at = now()
     where user_id = l.user_id and pool = l.pool and day = l.day;
  elsif l.bucket = 'bonus' then
    insert into public.credit_wallets (user_id, pool) values (l.user_id, l.pool) on conflict (user_id, pool) do nothing;
    update public.credit_wallets set bonus_balance = bonus_balance + l.amount, updated_at = now() where user_id = l.user_id and pool = l.pool;
  else
    insert into public.credit_wallets (user_id, pool) values (l.user_id, l.pool) on conflict (user_id, pool) do nothing;
    update public.credit_wallets set purchased_balance = purchased_balance + l.amount, updated_at = now() where user_id = l.user_id and pool = l.pool;
  end if;
  return jsonb_build_object('already', false, 'ledger_id', v_id, 'bucket', l.bucket, 'day', l.day, 'same_day', l.day = public.credit_day(p_now));
end
$$;

-- Concessão ao saldo: 'bonus' (concessão manual, kind grant) ou 'purchased' (compra futura, kind purchase; a Stripe segue parada).
-- Mesma p_idem devolve o que já foi feito. Só chamada por funções do administrador (ou, no futuro, pela confirmação de pagamento).
create or replace function public.credit_grant(
  p_uid uuid, p_pool text, p_n integer, p_reason text, p_idem text, p_bucket text default 'bonus', p_now timestamptz default now()
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  l public.credit_ledger;
  v_id bigint;
begin
  if p_uid is null or p_pool is null or p_pool not in ('match', 'ia') or p_bucket not in ('bonus', 'purchased') then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  if p_n is null or p_n < 1 or p_n > 100000 or p_idem is null or char_length(btrim(p_idem)) = 0 then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credito:' || p_pool || ':' || p_uid::text, 0));
  select * into l from public.credit_ledger x where x.idem_key = p_idem;
  if found then
    if l.user_id <> p_uid or l.kind not in ('grant', 'purchase') then
      raise exception 'Operação inválida.' using errcode = '22023';
    end if;
    return jsonb_build_object('already', true, 'ledger_id', l.id, 'bucket', l.bucket);
  end if;
  insert into public.credit_wallets (user_id, pool) values (p_uid, p_pool) on conflict (user_id, pool) do nothing;
  insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key, reason, created_by)
  values (p_uid, p_pool, public.credit_day(p_now), case when p_bucket = 'bonus' then 'grant' else 'purchase' end, p_bucket, p_n, p_idem,
          nullif(left(btrim(coalesce(p_reason, '')), 300), ''), (select auth.uid()))
  returning id into v_id;
  if p_bucket = 'bonus' then
    update public.credit_wallets set bonus_balance = bonus_balance + p_n, updated_at = now() where user_id = p_uid and pool = p_pool;
  else
    update public.credit_wallets set purchased_balance = purchased_balance + p_n, updated_at = now() where user_id = p_uid and pool = p_pool;
  end if;
  return jsonb_build_object('already', false, 'ledger_id', v_id, 'bucket', p_bucket);
end
$$;

-- ---------------------------------------------------------------- 6) conciliação (spec §12.2, linha 22)
-- Compara o resumo com o livro. → { pool, ok, total, problemas: [{ tipo, user_id, … }] } (até 200 problemas)
--   uso_do_dia: credit_daily.used ≠ consumos diários do dia − estornos diários do dia;
--   saldo_bonus / saldo_comprados: saldo ≠ concessões/compras/estornos/ajustes − consumos/revogações do balde;
--   cobranca_sem_lancamento: linha de study_room_charges (fora "unlimited") sem o lançamento de consumo do mesmo aluno.
create or replace function public.credit_reconcile(p_pool text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_items jsonb;
  v_total integer;
begin
  if p_pool is null or p_pool not in ('match', 'ia') then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  with
  dia as (
    select coalesce(d.user_id, l.user_id) as user_id, coalesce(d.day, l.day) as day, coalesce(d.used, 0) as no_resumo, coalesce(l.s, 0) as no_livro
      from (select * from public.credit_daily where pool = p_pool) d
      full join (select user_id, day,
                        sum(case kind when 'consume' then amount when 'refund' then -amount else 0 end)::integer as s
                   from public.credit_ledger where pool = p_pool and bucket = 'daily' group by user_id, day) l
        on l.user_id = d.user_id and l.day = d.day
  ),
  saldo as (
    select u.user_id, b.bucket,
           case b.bucket when 'bonus' then coalesce(w.bonus_balance, 0) else coalesce(w.purchased_balance, 0) end as no_resumo,
           coalesce((select sum(case g.kind when 'consume' then -g.amount when 'revoke' then -g.amount else g.amount end)
                       from public.credit_ledger g where g.user_id = u.user_id and g.pool = p_pool and g.bucket = b.bucket), 0)::integer as no_livro
      from (select x.user_id from public.credit_wallets x where x.pool = p_pool
            union
            select y.user_id from public.credit_ledger y where y.pool = p_pool and y.bucket in ('bonus', 'purchased')) u
      cross join (values ('bonus'), ('purchased')) as b(bucket)
      left join public.credit_wallets w on w.user_id = u.user_id and w.pool = p_pool
  ),
  probs as (
    select jsonb_build_object('tipo', 'uso_do_dia', 'user_id', user_id, 'day', day, 'no_resumo', no_resumo, 'no_livro', no_livro) as j
      from dia where no_resumo <> no_livro
    union all
    select jsonb_build_object('tipo', case bucket when 'bonus' then 'saldo_bonus' else 'saldo_comprados' end,
                              'user_id', user_id, 'no_resumo', no_resumo, 'no_livro', no_livro)
      from saldo where no_resumo <> no_livro
    union all
    select jsonb_build_object('tipo', 'cobranca_sem_lancamento', 'room_id', c.room_id, 'user_id', c.user_id, 'round', c.round)
      from public.study_room_charges c
     where p_pool = 'match' and c.bucket <> 'unlimited'
       and not exists (select 1 from public.credit_ledger x
                        where x.id = c.ledger_id and x.user_id = c.user_id and x.kind = 'consume' and x.pool = 'match')
  )
  select coalesce(jsonb_agg(j) filter (where rn <= 200), '[]'::jsonb), max(rn)
    into v_items, v_total
    from (select j, row_number() over () as rn from probs) q;
  return jsonb_build_object('pool', p_pool, 'ok', coalesce(v_total, 0) = 0, 'total', coalesce(v_total, 0), 'problemas', v_items);
end
$$;

-- ---------------------------------------------------------------- 7) o que o aluno vê (M1c)
-- O estado do PRÓPRIO aluno. Não exige acesso ao Treino (serve também à IA). → credit_state + { pool, renova_em }
create or replace function public.app_credit_state(p_pool text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_pool is null or p_pool not in ('match', 'ia') then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  return public.credit_state(v_uid, p_pool, now())
         || jsonb_build_object('pool', p_pool,
                               'renova_em', ((public.credit_day(now()) + 1)::timestamp at time zone 'America/Sao_Paulo'));
end
$$;

-- ---------------------------------------------------------------- 8) exportação dos dados do aluno (colunas LISTADAS)
-- Nunca to_jsonb(linha): o livro tem colunas internas (idem_key, created_by) que não saem.
create or replace function public.dupla_export_creditos() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('pool', w.pool, 'bonus_balance', w.bonus_balance,
                                                              'purchased_balance', w.purchased_balance, 'updated_at', w.updated_at)
                                          order by w.pool)
                           from public.credit_wallets w where w.user_id = (select auth.uid())), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('pool', d.pool, 'day', d.day, 'used', d.used) order by d.day, d.pool)
                         from public.credit_daily d where d.user_id = (select auth.uid())), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'pool', g.pool, 'day', g.day, 'kind', g.kind, 'bucket', g.bucket,
                                                             'amount', g.amount, 'ref_type', g.ref_type, 'ref_id', g.ref_id,
                                                             'reverses_id', g.reverses_id, 'reason', g.reason, 'created_at', g.created_at)
                                         order by g.id)
                          from public.credit_ledger g where g.user_id = (select auth.uid())), '[]'::jsonb),
    'room_charges', coalesce((select jsonb_agg(jsonb_build_object('room_id', c.room_id, 'round', c.round, 'bucket', c.bucket,
                                                                   'usage_date', c.usage_date, 'ledger_id', c.ledger_id,
                                                                   'created_at', c.created_at)
                                               order by c.created_at, c.room_id)
                                from public.study_room_charges c where c.user_id = (select auth.uid())), '[]'::jsonb)
  ) end
$$;

-- Base: 013370 (igual, mais "study_credits" no fim).
create or replace function public.app_export_my_data() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', (select auth.uid())),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'subscription', (select to_jsonb(s) - 'provider_customer_id' - 'provider_subscription_id'
                     from public.subscriptions s where s.user_id = (select auth.uid())),
    'practice_sessions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at), '[]'::jsonb)
                          from public.practice_sessions t where t.user_id = (select auth.uid())),
    'question_attempts', (select coalesce(jsonb_agg(to_jsonb(t) - 'seq' order by t.seq), '[]'::jsonb)
                          from public.question_attempts t where t.user_id = (select auth.uid())),
    'question_bookmarks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                           from public.question_bookmarks t where t.user_id = (select auth.uid())),
    'error_notes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at), '[]'::jsonb)
                    from public.error_notes t where t.user_id = (select auth.uid())),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.day, t.position), '[]'::jsonb)
                   from public.plan_tasks t where t.user_id = (select auth.uid())),
    'flashcards', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                   from public.flashcards t where t.owner_id = (select auth.uid())),
    'flashcard_states', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                         from public.flashcard_states t where t.user_id = (select auth.uid())),
    'flashcard_reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
                          from public.flashcard_reviews t where t.user_id = (select auth.uid())),
    'checklist_favorites', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                            from public.checklist_favorites t where t.user_id = (select auth.uid())),
    'checklist_station_reports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                  from public.checklist_station_reports t where t.user_id = (select auth.uid())),
    'checklist_event_confirmations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                      from public.checklist_event_confirmations t where t.user_id = (select auth.uid())),
    'checklist_study_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                 from public.checklist_study_sessions t
                                 where t.actor_id = (select auth.uid()) or t.doctor_id = (select auth.uid())),
    'study_profile', (select to_jsonb(t) from public.study_profiles t where t.user_id = (select auth.uid())),
    'study_swipes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                     from public.study_swipes t where t.from_user = (select auth.uid())),
    -- sem station_id: o tema da estação não sai pela exportação (a coluna nem é legível pelo aluno, 013300)
    'study_matches', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'user_a', t.user_a, 'user_b', t.user_b,
                                                                   'room_id', t.room_id, 'created_at', t.created_at)
                                                order by t.created_at), '[]'::jsonb)
                      from public.study_matches t where (select auth.uid()) in (t.user_a, t.user_b)),
    'checklist_rooms', public.dupla_export_rooms(),
    'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('document', t.document, 'version', t.version,
                                                                  'accepted_at', t.accepted_at, 'origin', t.origin,
                                                                  'user_agent', t.user_agent)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid())),
    'declarations', (select coalesce(jsonb_agg(jsonb_build_object('document', a.document, 'version', a.version,
                                                                   'adult', d.adult, 'physician', d.physician, 'declared_at', d.declared_at)
                                               order by d.declared_at, a.id), '[]'::jsonb)
                     from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                     where a.user_id = (select auth.uid())),
    'study_chat', public.dupla_export_chat(),
    'study_credits', public.dupla_export_creditos()
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
-- Internas: só dentro das funções do servidor.
revoke execute on function public.credit_day(timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_cfg() from public, anon, authenticated;
revoke execute on function public.credit_ativa() from public, anon, authenticated;
revoke execute on function public.credit_cobra_rodada() from public, anon, authenticated;
revoke execute on function public.credit_plan(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_limit(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_order(text) from public, anon, authenticated;
revoke execute on function public.credit_avail(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_state(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_available(uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_assert_available(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_consume(uuid, text, integer, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_consume_pair(text, uuid, uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_refund(bigint, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_grant(uuid, text, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.credit_reconcile(text) from public, anon, authenticated;
-- Do aluno: só quem entra (visitante não); a função confere de novo.
revoke execute on function public.app_credit_state(text) from public, anon;
-- Roda como definer, mas só devolve as linhas de auth.uid() (como dupla_export_chat na 013370); a exportação a chama com os direitos de quem pede.
revoke execute on function public.dupla_export_creditos() from public;
grant execute on function public.dupla_export_creditos() to anon, authenticated;
