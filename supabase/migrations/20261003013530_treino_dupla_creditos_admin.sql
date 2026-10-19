-- =============================================================================
-- Stazia Match, Etapa M4a: administração dos créditos (configuração, concessão, estorno, extrato, uso de hoje e conciliação).
-- (Plano de 12/10: "migração 9980"; este arquivo usa 013530, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md.)
-- Depende da 013490/013500 (livro e funções credit_*) e de assert_admin/admin_log (…1300).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não grava dado. Nenhuma IA. Sem pagamento.
-- SÓ ADMINISTRADOR (assert_admin: editor, revisor médico e aluno são barrados). Toda ação vai para o registro da Administração
-- (admin_log), com o autor: a configuração (antes e depois), a concessão, o estorno, a conciliação e a LEITURA do extrato.
--
-- O QUE FAZ
--  1) app_admin_credit_config() / app_admin_save_credit_config(config): lê e grava app_settings.creditos. Valida: ativa
--     booleano; limites do match inteiros de 0 a 100000 ou vazios; cobra_rodada_extra booleano; ordem com os 3 baldes sem
--     repetir; IA ("ia"): plano com número, ou objeto com dia/semana/mes, e "pesos" com inteiros. RECUSA ligar "ativa" sem pelo
--     menos um plano do match preenchido ("Preencha ao menos um plano antes de ligar a cota."). Plano sem número = ZERO crédito
--     quando a cota estiver ligada (aviso para a tela).
--  2) app_admin_credit_grant(aluno, moeda, quantidade, motivo, chave): concede como BÔNUS (nunca "comprado": não há compra).
--     Motivo obrigatório. A chave (opcional, uma por clique) impede conceder duas vezes se o botão for apertado duas vezes.
--  3) app_admin_credit_refund(lançamento, motivo, compensar): estorna UM consumo, para o mesmo balde, uma vez só. Motivo
--     obrigatório. Consumo diário de DIA PASSADO: só reduz o uso daquele dia (não cria cota nova hoje); se "compensar" for
--     verdadeiro, concede a mesma quantidade como bônus separado e auditado (spec §4.4).
--  4) app_admin_credit_statement(aluno, moeda, dias): o extrato (estado + lançamentos + cobranças das salas), 1 a 365 dias.
--  5) app_admin_credit_today(): uso de hoje por moeda (quantos créditos, quantos alunos), para o "Uso do mês".
--  6) app_admin_credit_reconcile(moeda): confere o resumo contra o livro (credit_reconcile).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - O motivo digitado pelo administrador aparece no extrato do próprio aluno (coluna "reason" do livro). Aviso na tela.
--  - A concessão tem teto de 10000 por vez (erro de digitação não vira milhões de créditos).
--  - Para escolher o aluno a tela reaproveita app_admin_users (busca por nome ou e-mail) que já existe.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: nenhuma (todas novas).
-- COMO DESFAZER: apagar as 7 funções app_admin_credit_* e app_admin_save_credit_config. (Concessões e estornos já feitos ficam
--   no livro; a configuração fica em app_settings.)
-- =============================================================================

-- ---------------------------------------------------------------- 1) configuração
-- → a chave "creditos" como está (com os padrões que faltarem).
create or replace function public.app_admin_credit_config() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_admin();
  v := public.credit_cfg();
  return jsonb_build_object(
    'ativa', coalesce(v -> 'ativa' = 'true'::jsonb, false),
    'match', jsonb_build_object('cobra_rodada_extra', true) || coalesce(case when jsonb_typeof(v -> 'match') = 'object' then v -> 'match' end, '{}'::jsonb),
    'ia', coalesce(case when jsonb_typeof(v -> 'ia') = 'object' then v -> 'ia' end, '{}'::jsonb)
  );
end
$$;

-- Valida e grava. Devolve a configuração gravada. Registro "credito.config" com o antes e o depois.
create or replace function public.app_admin_save_credit_config(p_config jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_ativa boolean;
  v_match jsonb;
  v_ia jsonb;
  v_out_match jsonb := '{}'::jsonb;
  v_out_ia jsonb := '{}'::jsonb;
  v_plano text;
  v_x jsonb;
  v_k text;
  v_filled boolean := false;
  v_ord jsonb;
begin
  perform public.assert_admin();
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração de créditos inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config -> 'ativa') is distinct from 'boolean' then
    raise exception 'Configuração de créditos inválida: diga se a cota está ligada.' using errcode = '22023';
  end if;
  v_ativa := (p_config ->> 'ativa')::boolean;

  -- Matches (moeda "match")
  v_match := coalesce(p_config -> 'match', '{}'::jsonb);
  if jsonb_typeof(v_match) <> 'object' then
    raise exception 'Configuração dos matches inválida.' using errcode = '22023';
  end if;
  for v_plano in select unnest(array['trial', 'pro', 'elite']) loop
    v_x := v_match -> v_plano;
    if v_x is null or jsonb_typeof(v_x) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_x) <> 'number' or (v_x #>> '{}')::numeric <> trunc((v_x #>> '{}')::numeric)
       or (v_x #>> '{}')::numeric not between 0 and 100000 then
      raise exception 'Créditos por dia (%): um número inteiro de 0 a 100000, ou vazio.', v_plano using errcode = '22023';
    end if;
    v_out_match := v_out_match || jsonb_build_object(v_plano, v_x);
    v_filled := true;
  end loop;
  v_x := v_match -> 'cobra_rodada_extra';
  if v_x is not null and jsonb_typeof(v_x) not in ('boolean', 'null') then
    raise exception 'Configuração dos matches inválida: "cada estação nova gasta crédito" é sim ou não.' using errcode = '22023';
  end if;
  v_out_match := v_out_match || jsonb_build_object('cobra_rodada_extra', case when v_x is null or jsonb_typeof(v_x) = 'null' then true else v_x = 'true'::jsonb end);
  v_ord := v_match -> 'ordem';
  if v_ord is not null and jsonb_typeof(v_ord) <> 'null' then
    if jsonb_typeof(v_ord) <> 'array' or jsonb_array_length(v_ord) <> 3
       or (select count(distinct e) from jsonb_array_elements_text(v_ord) e) <> 3
       or exists (select 1 from jsonb_array_elements_text(v_ord) e where e not in ('daily', 'bonus', 'purchased')) then
      raise exception 'Ordem do débito inválida: use os três tipos (diária, bônus, comprados) sem repetir.' using errcode = '22023';
    end if;
    v_out_match := v_out_match || jsonb_build_object('ordem', v_ord);
  end if;

  -- IA (moeda "ia"): guardada para o treino sozinho; cada plano com número, ou objeto com dia/semana/mes; "pesos" com inteiros.
  v_ia := coalesce(p_config -> 'ia', '{}'::jsonb);
  if jsonb_typeof(v_ia) <> 'object' then
    raise exception 'Configuração de IA inválida.' using errcode = '22023';
  end if;
  for v_k in select jsonb_object_keys(v_ia) loop
    v_x := v_ia -> v_k;
    if v_k in ('trial', 'pro', 'elite') then
      if jsonb_typeof(v_x) = 'null' then
        continue;
      elsif jsonb_typeof(v_x) = 'number' then
        if (v_x #>> '{}')::numeric <> trunc((v_x #>> '{}')::numeric) or (v_x #>> '{}')::numeric not between 0 and 100000 then
          raise exception 'Configuração de IA inválida.' using errcode = '22023';
        end if;
      elsif jsonb_typeof(v_x) = 'object' then
        if exists (select 1 from jsonb_object_keys(v_x) kk where kk not in ('dia', 'semana', 'mes'))
           or exists (select 1 from jsonb_each(v_x) e
                       where jsonb_typeof(e.value) not in ('number', 'null')
                          or (jsonb_typeof(e.value) = 'number' and ((e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
                                                                    or (e.value #>> '{}')::numeric not between 0 and 100000))) then
          raise exception 'Configuração de IA inválida.' using errcode = '22023';
        end if;
      else
        raise exception 'Configuração de IA inválida.' using errcode = '22023';
      end if;
    elsif v_k = 'pesos' then
      if jsonb_typeof(v_x) <> 'object' or exists (select 1 from jsonb_each(v_x) e
                       where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
                          or (e.value #>> '{}')::numeric not between 0 and 100000) then
        raise exception 'Configuração de IA inválida: os pesos são números inteiros.' using errcode = '22023';
      end if;
    else
      raise exception 'Configuração de IA inválida.' using errcode = '22023';
    end if;
    v_out_ia := v_out_ia || jsonb_build_object(v_k, v_x);
  end loop;

  if v_ativa and not v_filled then
    raise exception 'Preencha ao menos um plano antes de ligar a cota.' using errcode = '22023';
  end if;

  v_old := public.credit_cfg();
  v_new := jsonb_build_object('ativa', v_ativa, 'match', v_out_match, 'ia', v_out_ia);
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('creditos', v_new, now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('credito.config', 'creditos', jsonb_build_object('antes', v_old, 'depois', v_new));
  return v_new;
end
$$;

-- ---------------------------------------------------------------- 2) conceder
-- → { already, ledger_id, bucket }
create or replace function public.app_admin_credit_grant(
  p_user uuid, p_pool text, p_n integer, p_reason text, p_key text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
  v_key text := nullif(left(btrim(coalesce(p_key, '')), 80), '');
  v_res jsonb;
begin
  perform public.assert_admin();
  if p_pool is null or p_pool not in ('match', 'ia') then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  if p_n is null or p_n < 1 or p_n > 10000 then
    raise exception 'Quantidade inválida: de 1 a 10000.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Diga o motivo da concessão.' using errcode = '22023';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Aluno não encontrado.' using errcode = '22023';
  end if;
  v_res := public.credit_grant(p_user, p_pool, p_n, v_reason, 'admin-grant:' || coalesce(v_key, gen_random_uuid()::text), 'bonus');
  if not coalesce((v_res ->> 'already')::boolean, false) then
    perform public.admin_log('credito.conceder', p_user::text, jsonb_build_object('pool', p_pool, 'n', p_n, 'motivo', v_reason, 'ledger_id', v_res -> 'ledger_id'));
  end if;
  return v_res;
end
$$;

-- ---------------------------------------------------------------- 3) estornar
-- → { already, ledger_id, bucket, day, same_day, compensacao: { ledger_id } | null }
create or replace function public.app_admin_credit_refund(p_ledger_id bigint, p_reason text, p_compensar boolean default false)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
  l public.credit_ledger;
  v_res jsonb;
  v_comp jsonb := null;
begin
  perform public.assert_admin();
  if v_reason is null then
    raise exception 'Diga o motivo do estorno.' using errcode = '22023';
  end if;
  select * into l from public.credit_ledger x where x.id = p_ledger_id;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = '22023';
  end if;
  v_res := public.credit_refund(p_ledger_id, v_reason);
  -- A compensação é idempotente pela chave 'compensa:<id>': pedir de novo (ou depois do estorno simples) não concede duas vezes.
  if coalesce(p_compensar, false) and l.bucket = 'daily' and not coalesce((v_res ->> 'same_day')::boolean, false) then
    v_comp := public.credit_grant(l.user_id, l.pool, l.amount, 'Compensação do estorno do lançamento ' || l.id::text || ': ' || v_reason,
                                  'compensa:' || l.id::text, 'bonus');
  end if;
  if not coalesce((v_res ->> 'already')::boolean, false) then
    perform public.admin_log('credito.estornar', l.user_id::text,
                             jsonb_build_object('pool', l.pool, 'consumo', l.id, 'n', l.amount, 'balde', l.bucket, 'dia', l.day,
                                                'motivo', v_reason, 'compensou', v_comp is not null));
  end if;
  return v_res || jsonb_build_object('compensacao', v_comp);
end
$$;

-- ---------------------------------------------------------------- 4) extrato do aluno
create or replace function public.app_admin_credit_statement(p_user uuid, p_pool text, p_days integer default 30) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from date;
begin
  perform public.assert_admin();
  if p_pool is null or p_pool not in ('match', 'ia') then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Aluno não encontrado.' using errcode = '22023';
  end if;
  v_from := public.credit_day(now()) - (v_days - 1);
  perform public.admin_log('credito.extrato', p_user::text, jsonb_build_object('pool', p_pool, 'dias', v_days));
  return jsonb_build_object(
    'user', jsonb_build_object('id', p_user,
                               'name', coalesce((select pr.name from public.profiles pr where pr.id = p_user), ''),
                               'email', (select u.email from auth.users u where u.id = p_user)),
    'pool', p_pool,
    'dias', v_days,
    'state', public.credit_state(p_user, p_pool, now()),
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'day', g.day, 'kind', g.kind, 'bucket', g.bucket, 'amount', g.amount,
               'ref_type', g.ref_type, 'ref_id', g.ref_id, 'reverses_id', g.reverses_id, 'reason', g.reason,
               'created_by', g.created_by, 'created_at', g.created_at,
               'estornado', g.kind = 'consume' and exists (select 1 from public.credit_ledger f where f.reverses_id = g.id))
             order by g.id desc)
        from public.credit_ledger g where g.user_id = p_user and g.pool = p_pool and g.day >= v_from), '[]'::jsonb),
    'cobrancas', coalesce((
      select jsonb_agg(jsonb_build_object('room_id', c.room_id, 'round', c.round, 'bucket', c.bucket, 'usage_date', c.usage_date,
                                          'ledger_id', c.ledger_id, 'created_at', c.created_at) order by c.created_at desc)
        from public.study_room_charges c where c.user_id = p_user and p_pool = 'match' and c.usage_date >= v_from), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------- 5) uso de hoje
-- → { day, ativa, match: { creditos, alunos, salas }, ia: { creditos, alunos } }
create or replace function public.app_admin_credit_today() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_day date := public.credit_day(now());
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'day', v_day,
    'ativa', public.credit_ativa(),
    -- (Do livro, em TODOS os baldes: consumo menos estorno do dia. Só a cota diária não conta o que saiu de bônus ou comprados.)
    'match', jsonb_build_object(
      'creditos', coalesce((select sum(case g.kind when 'consume' then g.amount when 'refund' then -g.amount else 0 end)
                              from public.credit_ledger g where g.pool = 'match' and g.day = v_day), 0)::integer,
      'alunos', (select count(*) from (select g.user_id from public.credit_ledger g where g.pool = 'match' and g.day = v_day
                                        group by g.user_id
                                       having sum(case g.kind when 'consume' then g.amount when 'refund' then -g.amount else 0 end) > 0) q)::integer,
      'salas', (select count(distinct c.room_id) from public.study_room_charges c where c.usage_date = v_day)::integer),
    'ia', jsonb_build_object(
      'creditos', coalesce((select sum(case g.kind when 'consume' then g.amount when 'refund' then -g.amount else 0 end)
                              from public.credit_ledger g where g.pool = 'ia' and g.day = v_day), 0)::integer,
      'alunos', (select count(*) from (select g.user_id from public.credit_ledger g where g.pool = 'ia' and g.day = v_day
                                        group by g.user_id
                                       having sum(case g.kind when 'consume' then g.amount when 'refund' then -g.amount else 0 end) > 0) q)::integer)
  );
end
$$;

-- ---------------------------------------------------------------- 6) conciliação
create or replace function public.app_admin_credit_reconcile(p_pool text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_admin();
  v := public.credit_reconcile(p_pool);
  perform public.admin_log('credito.conciliar', p_pool, jsonb_build_object('ok', v -> 'ok', 'total', v -> 'total'));
  return v;
end
$$;

-- ---------------------------------------------------------------- permissões
-- Do administrador: só quem entra (visitante não); assert_admin barra o resto.
revoke execute on function public.app_admin_credit_config() from public, anon;
revoke execute on function public.app_admin_save_credit_config(jsonb) from public, anon;
revoke execute on function public.app_admin_credit_grant(uuid, text, integer, text, text) from public, anon;
revoke execute on function public.app_admin_credit_refund(bigint, text, boolean) from public, anon;
revoke execute on function public.app_admin_credit_statement(uuid, text, integer) from public, anon;
revoke execute on function public.app_admin_credit_today() from public, anon;
revoke execute on function public.app_admin_credit_reconcile(text) from public, anon;
