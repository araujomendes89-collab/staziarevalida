-- =============================================================================
-- AJUSTES DA COBRANÇA ANTES DE ABRIR AS VENDAS (ramo ajustes-cobranca, 17/10/2026; decisões do dono de 17/10).
--
-- 1. DEVOLUÇÃO FEITA NO PAINEL DO ASAAS NÃO CORTA O ACESSO POR ENGANO. Antes, qualquer devolução total de uma cobrança do plano feita
--    direto no painel cortava o acesso na hora, mesmo a cobrança repetida de um pagamento em dobro (ou a de um mês que já tinha
--    acabado). Agora o aviso de devolução é classificado e registrado (billing_reembolsos, origem "painel"):
--      duplicada         = outra cobrança paga cobre o MESMO período (diferença de até 20 dias): o acesso continua;
--      parcial           = devolveu só parte: o acesso continua;
--      periodo_encerrado = a cobrança era de um período que já acabou: o acesso de hoje (de outra cobrança) não muda;
--      conferir          = há uma renovação já paga para DEPOIS deste período: o acesso continua e o dono recebe um alerta;
--      unica             = desistência / devolução total da ÚNICA cobrança do período em curso: aí sim o acesso acaba agora e a
--                          renovação é desligada (o servidor cancela a assinatura do cartão no fornecedor);
--      extra_total       = extra de IA devolvido por inteiro: os créditos dele são cancelados.
--    Botão "Devolver pagamento" da Administração (só administrador): motivo obrigatório, "devolver e manter acesso" ou "devolver e
--    encerrar acesso", valor total ou parcial; grava quem fez (billing_reembolsos.feito_por + registro de ações).
-- 2. NOTA FISCAL: o servidor guarda a nota de cada pagamento (aviso INVOICE_AUTHORIZED do Asaas, ou a conferência da tarefa de hora
--    em hora) e manda NÓS MESMOS o e-mail "Sua nota fiscal" com o link do PDF (uma vez por nota). Os clientes continuam criados com
--    os avisos do Asaas desligados. O link da nota aparece no histórico de Minha conta > Assinatura.
-- 3. ALERTAS DE GASTO DE IA POR E-MAIL PARA O DONO: 80% e 100% do teto diário da conta, aluno acima de um limite fora do comum,
--    resumo diário (desligável) e devolução feita no painel que pede conferência. Uma vez só por evento (chave única); endereço
--    configurável na Administração (padrão suporte@staziamed.com.br). Gerados e enviados pela tarefa de hora em hora que já existe
--    (/api/cobranca/cron).
--
-- Ponto de ligação com o ramo notificacoes (Central de Notificações, 013830): quando a nota é autorizada, se existir a função
-- public.notificacao_nota_fiscal(p_user uuid, p_cobranca bigint, p_pdf_url text) ela é chamada (aviso na tela). Esta migração NÃO
-- cria essa função (para não sobrescrever a do outro ramo); quem juntar os ramos cria numa migração posterior.
--
-- Substitui (create or replace, mesma assinatura): ch_worker_billing_devolvido (013700) e app_billing_historico (013760). O resto é
-- novo (colunas, tabelas e funções). Pode ser colada de novo. Depende da 013700 e da 013760; usa a 013680 (carteira) e a 012800
-- (voz) quando existem. Desfazer: supabase/desfazer/20261003013850_ajustes_cobranca.desfazer.sql (devolve as versões antigas).
-- Conferir: supabase/conferir/ajustes-cobranca.sql.
-- =============================================================================

-- ---------------------------------------------------------------- devoluções: origem, motivo, quem fez, escolha do acesso
alter table public.billing_reembolsos add column if not exists origem text not null default 'aluno';
alter table public.billing_reembolsos add column if not exists motivo text;
alter table public.billing_reembolsos add column if not exists feito_por uuid references auth.users (id) on delete set null;
alter table public.billing_reembolsos add column if not exists acesso text;
alter table public.billing_reembolsos add column if not exists classificacao text;
alter table public.billing_reembolsos add column if not exists conferir boolean not null default false;
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_origem_check;
alter table public.billing_reembolsos add constraint billing_reembolsos_origem_check check (origem in ('aluno', 'equipe', 'painel'));
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_acesso_check;
alter table public.billing_reembolsos add constraint billing_reembolsos_acesso_check check (acesso is null or acesso in ('manter', 'encerrar'));
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_motivo_check;
alter table public.billing_reembolsos add constraint billing_reembolsos_motivo_check check (motivo is null or char_length(motivo) <= 300);
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_classificacao_check;
alter table public.billing_reembolsos add constraint billing_reembolsos_classificacao_check
  check (classificacao is null or classificacao in ('duplicada', 'parcial', 'periodo_encerrado', 'conferir', 'unica', 'extra_total'));
-- a equipe precisa escrever o motivo e escolher o acesso
alter table public.billing_reembolsos drop constraint if exists billing_reembolsos_equipe_check;
alter table public.billing_reembolsos add constraint billing_reembolsos_equipe_check
  check (origem <> 'equipe' or (acesso is not null and char_length(btrim(coalesce(motivo, ''))) >= 5));
create index if not exists billing_reembolsos_recentes_idx on public.billing_reembolsos (criado_em desc);

-- ---------------------------------------------------------------- nota fiscal de cada pagamento
alter table public.billing_cobrancas add column if not exists nota_id text check (nota_id is null or char_length(nota_id) <= 100);
alter table public.billing_cobrancas add column if not exists nota_status text;
alter table public.billing_cobrancas add column if not exists nota_numero text check (nota_numero is null or char_length(nota_numero) <= 40);
alter table public.billing_cobrancas add column if not exists nota_pdf_url text
  check (nota_pdf_url is null or (nota_pdf_url ~ '^https://' and char_length(nota_pdf_url) <= 500));
alter table public.billing_cobrancas add column if not exists nota_autorizada_em timestamptz;
alter table public.billing_cobrancas add column if not exists nota_email_status text;
alter table public.billing_cobrancas add column if not exists nota_email_em timestamptz;
alter table public.billing_cobrancas add column if not exists nota_email_erro text check (nota_email_erro is null or char_length(nota_email_erro) <= 300);
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_status_check;
alter table public.billing_cobrancas add constraint billing_cobrancas_nota_status_check
  check (nota_status is null or nota_status in ('agendada', 'autorizada', 'cancelando', 'cancelada', 'erro'));
alter table public.billing_cobrancas drop constraint if exists billing_cobrancas_nota_email_status_check;
alter table public.billing_cobrancas add constraint billing_cobrancas_nota_email_status_check
  check (nota_email_status is null or nota_email_status in ('pendente', 'enviando', 'enviado', 'falhou', 'expirado', 'sem_email'));
create index if not exists billing_cobrancas_nota_email_idx on public.billing_cobrancas (nota_email_status, id) where nota_email_status in ('pendente', 'enviando');

-- ---------------------------------------------------------------- alertas ao dono (e-mail)
create table if not exists public.alertas_dono_config (
  id boolean primary key default true check (id),
  -- para onde vão os alertas (padrão: suporte da empresa)
  email text not null default 'suporte@staziamed.com.br' check (email ~ '^[^\s@<>"'',;]+@[^\s@<>"'',;]+\.[^\s@<>"'',;]+$' and char_length(email) <= 200),
  -- chave geral: desligada, nenhum alerta novo nasce
  ligado boolean not null default true,
  -- resumo do custo de IA do dia anterior, de manhã (desligável)
  resumo_diario boolean not null default true,
  -- "fora do comum": um aluno que passou deste custo de IA num dia (US$)
  aluno_limite_usd_dia numeric(10, 2) not null default 1.00 check (aluno_limite_usd_dia > 0 and aluno_limite_usd_dia <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.alertas_dono_config enable row level security;
revoke all on public.alertas_dono_config from public, anon, authenticated;
insert into public.alertas_dono_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.alertas_dono (
  id bigint generated always as identity primary key,
  -- uma vez só por evento: a chave diz qual evento é (ex.: "teto80:2026-10-17", "aluno:<id>:2026-10-17", "resumo:2026-10-16")
  chave text not null unique check (char_length(chave) between 3 and 160),
  tipo text not null check (tipo in ('teto_80', 'teto_100', 'aluno_fora_do_comum', 'resumo_diario', 'devolucao_conferir')),
  titulo text not null check (char_length(titulo) between 3 and 160),
  texto text not null check (char_length(texto) between 3 and 2000),
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  email_status text not null default 'pendente' check (email_status in ('pendente', 'enviando', 'enviado', 'falhou', 'expirado')),
  email_para text,
  email_tentado_em timestamptz,
  email_enviado_em timestamptz,
  email_erro text check (email_erro is null or char_length(email_erro) <= 300)
);
create index if not exists alertas_dono_email_idx on public.alertas_dono (email_status, id) where email_status in ('pendente', 'enviando');
create index if not exists alertas_dono_recentes_idx on public.alertas_dono (criado_em desc);
alter table public.alertas_dono enable row level security;
revoke all on public.alertas_dono from public, anon, authenticated;

-- Grava um alerta (uma vez só pela chave). true = novo.
create or replace function public.alertas_dono_criar(p_chave text, p_tipo text, p_titulo text, p_texto text, p_dados jsonb default '{}'::jsonb)
  returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce((select c.ligado from public.alertas_dono_config c), true) then return false; end if;
  insert into public.alertas_dono (chave, tipo, titulo, texto, dados)
  values (left(p_chave, 160), p_tipo, left(p_titulo, 160), left(p_texto, 2000), coalesce(p_dados, '{}'::jsonb))
  on conflict (chave) do nothing;
  return found;
end
$$;

create or replace function public.alertas_usd(p numeric) returns text
  language sql immutable set search_path = ''
as $$ select 'US$ ' || replace(to_char(round(coalesce(p, 0), 2), 'FM9999999990.00'), '.', ',') $$;

-- ---------------------------------------------------------------- DEVOLUÇÃO CONFIRMADA PELO FORNECEDOR (substitui a da 013700)
-- p_devolvido = total devolvido até agora (centavos). Três origens:
--   aluno  (Pedir a devolução / Desistir da compra): o acesso vai até o acesso_ate calculado pela regra do dono;
--   equipe (botão Devolver pagamento): "manter" não mexe no acesso; "encerrar" acaba agora e desliga a renovação;
--   painel (feita direto no painel do Asaas, sem pedido nosso): classificada (veja o cabeçalho) e registrada.
-- Devolve cancelar_assinatura (id no fornecedor) quando a renovação do cartão precisa ser cancelada lá.
create or replace function public.ch_worker_billing_devolvido(p_provider text, p_payment text, p_devolvido integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  r public.billing_reembolsos;
  c public.billing_contratos;
  v_total boolean;
  v_delta integer;
  v_ate timestamptz;
  v_class text;
  v_outra bigint;
  v_conferir boolean := false;
  v_contrato_todo boolean := false;
  v_cancelar_extra boolean := false;
  v_sub text;
  v_email text;
begin
  select * into x from public.billing_cobrancas where provider = p_provider and provider_payment_id = p_payment for update;
  if not found then return jsonb_build_object('conhecida', false); end if;
  v_total := p_devolvido >= x.valor_centavos;
  v_delta := greatest(0, least(x.valor_centavos, p_devolvido) - x.devolvido_centavos);
  update public.billing_cobrancas set devolvido_centavos = least(valor_centavos, greatest(devolvido_centavos, p_devolvido)),
    status = case when v_total then 'devolvida' else 'devolvida_parcial' end, atualizado_em = now()
  where id = x.id;
  update public.billing_pedidos set status = case when v_total then 'devolvido' else 'devolvido_parcial' end, atualizado_em = now()
  where id = x.pedido_id;
  update public.billing_reembolsos set status = 'feito', atualizado_em = now()
  where cobranca_id = x.id and status in ('solicitado', 'equipe')
  returning * into r;

  if r.id is not null and r.origem = 'equipe' then
    -- botão da Administração: vale a escolha de quem devolveu
    v_class := 'equipe_' || r.acesso;
    if r.acesso = 'encerrar' then v_ate := now(); v_contrato_todo := true; v_cancelar_extra := true; end if;
  elsif r.id is not null then
    -- pedido do aluno (regra do dono): integral = agora; trimestral depois de 7 dias = fim do mês em curso; extra = créditos cancelados
    v_class := 'aluno';
    v_ate := r.acesso_ate;
    v_cancelar_extra := true;
  elsif v_delta = 0 then
    -- aviso repetido (o mesmo valor já estava registrado): nada muda
    return jsonb_build_object('conhecida', true, 'total', v_total, 'repetido', true, 'user_id', x.user_id);
  else
    -- feita direto no painel do fornecedor: classifica antes de mexer no acesso
    if x.tipo = 'extra' then
      v_class := case when v_total then 'extra_total' else 'parcial' end;
      v_cancelar_extra := v_total;
    elsif not v_total then
      v_class := 'parcial';
    else
      select y.id into v_outra from public.billing_cobrancas y
      where y.user_id = x.user_id and y.id <> x.id and y.tipo = 'plano' and y.status in ('paga', 'devolvida_parcial')
        and y.periodo_fim is not null and x.periodo_fim is not null
        and y.periodo_fim between x.periodo_fim - interval '20 days' and x.periodo_fim + interval '20 days'
      order by y.pago_em desc nulls last limit 1;
      if v_outra is not null then
        v_class := 'duplicada';
        -- o contrato passa a apontar para a cobrança que ficou (a base da devolução do aluno, se ele pedir depois)
        update public.billing_contratos set ultima_cobranca_id = v_outra, atualizado_em = now()
        where user_id = x.user_id and ultima_cobranca_id = x.id;
      elsif x.periodo_fim is not null and x.periodo_fim <= now() then
        v_class := 'periodo_encerrado';
      elsif exists (select 1 from public.billing_cobrancas y where y.user_id = x.user_id and y.id <> x.id and y.tipo = 'plano'
                      and y.status in ('paga', 'devolvida_parcial') and y.periodo_fim > coalesce(x.periodo_fim, now()) + interval '20 days') then
        v_class := 'conferir';
        v_conferir := true;
      else
        v_class := 'unica';
        v_ate := now();
      end if;
    end if;
    insert into public.billing_reembolsos (user_id, cobranca_id, valor_centavos, total, regra, acesso_ate, status, origem, motivo, classificacao, conferir)
    values (x.user_id, x.id, v_delta, v_total, jsonb_build_object('classificacao', v_class, 'devolvido_total_centavos', least(x.valor_centavos, p_devolvido)),
            v_ate, 'feito', 'painel', 'Devolução feita no painel do fornecedor', v_class, v_conferir)
    returning * into r;
    if v_conferir then
      select u.email into v_email from auth.users u where u.id = x.user_id;
      perform public.alertas_dono_criar('devolucao:' || r.id, 'devolucao_conferir',
        'Devolução no painel do Asaas para conferir',
        'Uma cobrança do plano de ' || coalesce(v_email, 'um aluno') || ' (' || public.avisos_brl(x.valor_centavos) || ') foi devolvida por inteiro no painel do Asaas, '
        || 'mas o aluno já tem a renovação seguinte paga. O acesso NÃO foi cortado. Se a ideia era encerrar a assinatura, use Administração > Usuários > '
        || 'ficha do aluno > Pagamentos > Devolver pagamento (encerrar acesso).',
        jsonb_build_object('cobranca_id', x.id, 'user_id', x.user_id));
    end if;
  end if;

  if x.tipo = 'plano' and v_ate is not null and x.user_id is not null then
    select * into c from public.billing_contratos where user_id = x.user_id for update;
    if c.user_id is not null and (v_contrato_todo or c.ultima_cobranca_id = x.id) then
      v_sub := case when c.renova and c.metodo = 'cartao' then c.provider_subscription_id end;
      update public.billing_contratos set periodo_fim = least(periodo_fim, v_ate), renova = false, atualizado_em = now()
      where user_id = x.user_id;
    end if;
    if not public.user_has_full_access(x.user_id) then
      update public.subscriptions set current_period_end = least(current_period_end, v_ate),
        status = case when v_ate <= now() then 'canceled'::public.subscription_status else status end, updated_at = now()
      where user_id = x.user_id and (v_contrato_todo or plan::text = x.codigo);
    end if;
  elsif x.tipo = 'extra' and v_cancelar_extra and to_regclass('public.carteira_extras') is not null then
    execute $q$ update public.carteira_extras set cancelado_em = coalesce(cancelado_em, now()), cancelado_motivo = 'Devolução do pagamento'
                where referencia = $1 $q$ using p_provider || ':' || p_payment;
  end if;
  return jsonb_build_object('conhecida', true, 'total', v_total, 'acesso_ate', v_ate, 'user_id', x.user_id,
                            'classificacao', v_class, 'conferir', v_conferir, 'cancelar_assinatura', v_sub);
end
$$;

-- ---------------------------------------------------------------- botão "Devolver pagamento" (Administração; o servidor chama)
-- p_admin = quem clicou (o servidor tira do login; aqui confere que é administrador). p_valor null = tudo o que ainda não voltou.
-- Registra a devolução ANTES de chamar o fornecedor (como o pedido do aluno). Um pedido do aluno que ficou "para a equipe" é assumido
-- por este (mesma linha). Devolve o que o servidor precisa para pedir ao fornecedor.
create or replace function public.ch_worker_billing_admin_devolucao(p_admin uuid, p_cobranca bigint, p_valor integer, p_motivo text, p_acesso text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  r public.billing_reembolsos;
  v_motivo text := btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
  v_disp integer;
  v_valor integer;
  v_total boolean;
begin
  if p_admin is null or not exists (select 1 from public.user_roles ur where ur.user_id = p_admin and ur.role = 'admin') then
    raise exception 'so_admin: Só o administrador pode devolver pagamentos.';
  end if;
  if char_length(v_motivo) < 5 then raise exception 'motivo_obrigatorio: Escreva o motivo da devolução (pelo menos 5 letras).'; end if;
  if char_length(v_motivo) > 300 then raise exception 'motivo_obrigatorio: O motivo pode ter até 300 caracteres.'; end if;
  if p_acesso is null or p_acesso not in ('manter', 'encerrar') then
    raise exception 'acesso_obrigatorio: Escolha entre devolver e manter o acesso ou devolver e encerrar o acesso.';
  end if;
  select * into x from public.billing_cobrancas where id = p_cobranca;
  if not found then raise exception 'sem_devolucao: Pagamento não encontrado.'; end if;
  if x.user_id is not null then perform pg_advisory_xact_lock(hashtextextended('billing:' || x.user_id::text, 0)); end if;
  select * into x from public.billing_cobrancas where id = p_cobranca for update;
  if x.status not in ('paga', 'devolvida_parcial') then
    raise exception 'sem_devolucao: Este pagamento não pode ser devolvido (situação: %).', x.status;
  end if;
  v_disp := x.valor_centavos - x.devolvido_centavos;
  v_valor := coalesce(p_valor, v_disp);
  if v_valor <= 0 or v_valor > v_disp then
    raise exception 'valor_invalido: O valor precisa ser maior que zero e no máximo % (o que ainda não foi devolvido).', public.avisos_brl(v_disp);
  end if;
  if exists (select 1 from public.billing_reembolsos where cobranca_id = x.id and status = 'solicitado') then
    raise exception 'devolucao_em_andamento: Já há uma devolução deste pagamento esperando a confirmação da instituição de pagamento.';
  end if;
  v_total := x.devolvido_centavos + v_valor >= x.valor_centavos;
  update public.billing_reembolsos set valor_centavos = v_valor, total = v_total, origem = 'equipe', motivo = v_motivo, feito_por = p_admin,
    acesso = p_acesso, acesso_ate = case when p_acesso = 'encerrar' then now() end, status = 'solicitado', erro = null,
    regra = regra || jsonb_build_object('assumido_pela_equipe', true), atualizado_em = now()
  where cobranca_id = x.id and status = 'equipe'
  returning * into r;
  if r.id is null then
    insert into public.billing_reembolsos (user_id, cobranca_id, valor_centavos, total, regra, acesso_ate, status, origem, motivo, feito_por, acesso)
    values (x.user_id, x.id, v_valor, v_total, jsonb_build_object('regra', 'equipe'), case when p_acesso = 'encerrar' then now() end,
            'solicitado', 'equipe', v_motivo, p_admin, p_acesso)
    returning * into r;
  end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_admin, 'cobranca.devolver', x.user_id::text,
          jsonb_build_object('cobranca_id', x.id, 'reembolso_id', r.id, 'valor_centavos', v_valor, 'total', v_total, 'acesso', p_acesso, 'motivo', v_motivo));
  return jsonb_build_object('id', r.id, 'user_id', x.user_id, 'tipo', x.tipo, 'valor_centavos', v_valor, 'total', v_total, 'acesso', p_acesso,
                            'provider', x.provider, 'payment_id', x.provider_payment_id,
                            -- devolução de tudo de uma vez: o fornecedor recebe o pedido "total" (sem valor)
                            'pedir_total', x.devolvido_centavos = 0 and v_valor = x.valor_centavos);
end
$$;

-- ---------------------------------------------------------------- nota fiscal
-- Guarda a nota lida na API do fornecedor (o servidor relê a nota; o aviso sozinho não vale). Na primeira vez que ela aparece
-- AUTORIZADA com PDF, o e-mail "Sua nota fiscal" fica pendente (uma vez só por pagamento).
create or replace function public.ch_worker_billing_nota_salvar(p_provider text, p_payment text, p_nota jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.billing_cobrancas;
  v_status text := p_nota ->> 'status';
  v_pdf text := nullif(p_nota ->> 'pdf_url', '');
  v_novo boolean := false;
begin
  if v_status is null or v_status not in ('agendada', 'autorizada', 'cancelando', 'cancelada', 'erro') then
    raise exception 'Situação de nota inválida.' using errcode = '22023';
  end if;
  if v_pdf is not null and (v_pdf !~ '^https://' or char_length(v_pdf) > 500) then v_pdf := null; end if;
  select * into x from public.billing_cobrancas where provider = p_provider and provider_payment_id = p_payment for update;
  if not found then return jsonb_build_object('conhecida', false); end if;
  -- uma nota cancelada nunca volta a "autorizada" por um aviso velho que chegou atrasado
  if x.nota_status = 'cancelada' and v_status <> 'cancelada' and x.nota_id is not distinct from (p_nota ->> 'id') then
    return jsonb_build_object('conhecida', true, 'ignorada', true, 'user_id', x.user_id);
  end if;
  v_novo := v_status = 'autorizada' and v_pdf is not null and x.nota_email_status is null and x.user_id is not null;
  update public.billing_cobrancas set
    nota_id = left(p_nota ->> 'id', 100), nota_status = v_status, nota_numero = left(nullif(p_nota ->> 'numero', ''), 40),
    nota_pdf_url = coalesce(v_pdf, nota_pdf_url),
    nota_autorizada_em = case when v_status = 'autorizada' then coalesce(nota_autorizada_em, now()) else nota_autorizada_em end,
    nota_email_status = case when v_novo then 'pendente' else nota_email_status end,
    atualizado_em = now()
  where id = x.id;
  -- aviso na tela (Central de Notificações, ramo notificacoes): só se a função existir
  if v_novo and to_regprocedure('public.notificacao_nota_fiscal(uuid,bigint,text)') is not null then
    begin
      execute 'select public.notificacao_nota_fiscal($1, $2, $3)' using x.user_id, x.id, v_pdf;
    exception when others then null; -- o aviso na tela nunca impede a nota de ficar guardada
    end;
  end if;
  return jsonb_build_object('conhecida', true, 'user_id', x.user_id, 'email_pendente', v_novo);
end
$$;

-- Pagamentos dos últimos 15 dias sem nota final (para a tarefa de hora em hora perguntar ao fornecedor; serve se o aviso não chegar).
create or replace function public.ch_worker_billing_notas_pendentes(p_limite integer default 30) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('provider', x.provider, 'payment_id', x.provider_payment_id) order by x.pago_em desc), '[]'::jsonb)
  from (select * from public.billing_cobrancas x
        where x.status in ('paga', 'devolvida_parcial') and x.pago_em > now() - interval '15 days'
          and (x.nota_status is null or x.nota_status = 'agendada')
        order by x.pago_em desc limit least(100, greatest(1, coalesce(p_limite, 30)))) x
$$;

-- E-mails "Sua nota fiscal" pendentes (mesma regra dos avisos: 48 h, um envio por vez, nunca repete um que caiu no meio).
create or replace function public.ch_worker_billing_notas_email_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb;
begin
  update public.billing_cobrancas set nota_email_status = 'expirado'
  where nota_email_status = 'pendente' and nota_autorizada_em < now() - interval '48 hours';
  update public.billing_cobrancas set nota_email_status = 'falhou', nota_email_erro = 'Envio interrompido; não repetido para não duplicar.'
  where nota_email_status = 'enviando' and nota_email_em < now() - interval '30 minutes';
  update public.billing_cobrancas x set nota_email_status = 'sem_email'
  where x.nota_email_status = 'pendente' and not exists (select 1 from auth.users u where u.id = x.user_id and coalesce(btrim(u.email), '') <> '');
  with alvo as (
    select x.id from public.billing_cobrancas x where x.nota_email_status = 'pendente' order by x.id
    limit least(100, greatest(1, coalesce(p_limite, 20))) for update skip locked
  ), marcados as (
    update public.billing_cobrancas x set nota_email_status = 'enviando', nota_email_em = now() from alvo where x.id = alvo.id returning x.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'email', u.email, 'nome', nullif(btrim(p.name), ''), 'tipo', m.tipo, 'codigo', m.codigo,
                                               'ciclo', m.ciclo, 'valor_centavos', m.valor_centavos, 'pago_em', m.pago_em, 'numero', m.nota_numero,
                                               'pdf_url', m.nota_pdf_url,
                                               'nome_extra', (select k.nome from public.billing_pedidos k where k.id = m.pedido_id)) order by m.id), '[]'::jsonb)
    into r
  from marcados m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id;
  return r;
end
$$;

create or replace function public.ch_worker_billing_nota_email_marcar(p_id bigint, p_ok boolean, p_erro text default null) returns void
  language sql security definer set search_path = ''
as $$
  update public.billing_cobrancas set nota_email_status = case when p_ok then 'enviado' else 'falhou' end, nota_email_em = now(),
    nota_email_erro = case when p_ok then null else left(p_erro, 300) end
  where id = p_id and nota_email_status = 'enviando'
$$;

-- ---------------------------------------------------------------- histórico do aluno (substitui a da 013760: + nota fiscal)
create or replace function public.app_billing_historico() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo,
                             'valor_centavos', x.valor_centavos, 'status', x.status, 'pago_em', x.pago_em, 'em', x.criado_em,
                             'devolvido_centavos', x.devolvido_centavos, 'periodo_fim', x.periodo_fim, 'recibo_url', x.recibo_url,
                             -- a nota só aparece autorizada (com o PDF) ou cancelada (sem o link)
                             'nota_status', case when x.nota_status in ('autorizada', 'cancelada') then x.nota_status end,
                             'nota_numero', case when x.nota_status = 'autorizada' then x.nota_numero end,
                             'nota_url', case when x.nota_status = 'autorizada' then x.nota_pdf_url end)
                             order by x.criado_em desc)
                           from (select * from public.billing_cobrancas where user_id = v_user order by criado_em desc limit 50) x), '[]'::jsonb),
    'aceite', (select jsonb_build_object('em', p.aceite ->> 'registrado_em', 'versao', p.aceite ->> 'contrato_versao', 'plano', p.nome)
               from public.billing_pedidos p where p.user_id = v_user and p.aceite is not null and p.status in ('pago', 'devolvido', 'devolvido_parcial')
               order by p.criado_em desc limit 1),
    'contrato_url', coalesce((select b.contrato_url from public.billing_config b), '/novo/termos'));
end
$$;

-- ---------------------------------------------------------------- Administração: pagamentos e devoluções (só administrador)
create or replace function public.app_admin_billing_pagamentos(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo, 'valor_centavos', x.valor_centavos,
        'devolvido_centavos', x.devolvido_centavos, 'status', x.status, 'pago_em', x.pago_em, 'em', x.criado_em, 'periodo_fim', x.periodo_fim,
        'recibo_url', x.recibo_url, 'nota_status', x.nota_status, 'nota_url', x.nota_pdf_url, 'nota_email', x.nota_email_status,
        'nome', (select k.nome from public.billing_pedidos k where k.id = x.pedido_id),
        'devolucoes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'valor_centavos', r.valor_centavos, 'status', r.status, 'origem', r.origem,
                                  'motivo', r.motivo, 'acesso', r.acesso, 'classificacao', r.classificacao, 'conferir', r.conferir, 'erro', r.erro,
                                  'feito_por', (select u.email from auth.users u where u.id = r.feito_por), 'em', r.criado_em) order by r.criado_em desc)
                                from public.billing_reembolsos r where r.cobranca_id = x.id), '[]'::jsonb))
        order by x.criado_em desc)
      from (select * from public.billing_cobrancas where user_id = p_user order by criado_em desc limit 60) x), '[]'::jsonb),
    'contrato', (select jsonb_build_object('plano', c.plano, 'ciclo', c.ciclo, 'metodo', c.metodo, 'renova', c.renova, 'periodo_fim', c.periodo_fim)
                 from public.billing_contratos c where c.user_id = p_user));
end
$$;

-- Devoluções recentes de todos (aba Planos): pedidos que ficaram para a equipe, feitas no painel e as da equipe.
create or replace function public.app_admin_billing_devolucoes(p_limite integer default 40) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(j order by em desc) from (
    select r.criado_em as em, jsonb_build_object('id', r.id, 'user_id', r.user_id, 'email', u.email, 'cobranca_id', r.cobranca_id,
             'valor_centavos', r.valor_centavos, 'total', r.total, 'status', r.status, 'origem', r.origem, 'motivo', r.motivo, 'acesso', r.acesso,
             'classificacao', r.classificacao, 'conferir', r.conferir, 'erro', r.erro, 'em', r.criado_em,
             'feito_por', (select a.email from auth.users a where a.id = r.feito_por),
             'pagamento', (select jsonb_build_object('tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo, 'valor_centavos', x.valor_centavos)
                           from public.billing_cobrancas x where x.id = r.cobranca_id)) as j
    from public.billing_reembolsos r left join auth.users u on u.id = r.user_id
    order by (r.status in ('equipe', 'solicitado') or r.conferir) desc, r.criado_em desc
    limit least(200, greatest(1, coalesce(p_limite, 40)))) s), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- alertas de gasto de IA (tarefa de hora em hora)
-- Custo de IA de HOJE por aluno (US$): pedidos da carteira (custo real; sem ele, pelos créditos) + voz ao vivo (segundos × preço do
-- painel). Sem a carteira (013680) instalada: vazio.
create or replace function public.alertas_custo_alunos_hoje() returns table (user_id uuid, usd numeric)
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('public.carteira_movimentos') is null or to_regclass('public.direitos_config') is null then return; end if;
  return query execute $q$
    with c as (select coalesce(x.credito_valor_centavos, 10) as cv, coalesce(x.cotacao_dolar, 5.08) as cot from public.direitos_config x),
    txt as (
      select m.user_id, sum(case when m.situacao = 'confirmado' and m.custo_usd is not null then m.custo_usd
                                 else m.creditos * c.cv / 100.0 / c.cot end) as usd
      from public.carteira_movimentos m cross join c
      where m.dia = (now() at time zone 'America/Sao_Paulo')::date and m.recurso <> 'voz_ao_vivo' and m.modo <> 'equipe'
        and m.situacao in ('confirmado', 'reservado')
      group by m.user_id),
    voz as (
      select v.user_id, sum(case when v.status = 'active' then greatest(0, extract(epoch from (v.lease_until - v.started_at)))
                                 else v.consumed_seconds end * t.live_price_per_min_usd / 60.0) as usd
      from public.tutor_voice_calls v cross join public.tutor_config t
      where v.day = (now() at time zone 'America/Sao_Paulo')::date and v.provider <> 'tts'
      group by v.user_id)
    select coalesce(a.user_id, b.user_id), round(coalesce(a.usd, 0) + coalesce(b.usd, 0), 4)::numeric
    from txt a full join voz b on b.user_id = a.user_id $q$;
exception when undefined_table or undefined_column or undefined_function then
  return;
end
$$;

-- Gera os alertas que faltam (uma vez só cada). Devolve quantos nasceram.
create or replace function public.ch_worker_alertas_dono_gerar() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.alertas_dono_config;
  n integer := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ontem date := (now() at time zone 'America/Sao_Paulo')::date - 1;
  v_teto numeric;
  v_gasto numeric;
  v_cot numeric;
  a record;
  v_email text;
  v_res jsonb;
  v_top text;
begin
  select * into cfg from public.alertas_dono_config;
  if not coalesce(cfg.ligado, true) then return 0; end if;
  -- 80% e 100% do teto diário da conta (Carteira de IA, 013680)
  if to_regprocedure('public.carteira_gasto_hoje_usd()') is not null and to_regclass('public.direitos_config') is not null then
    execute 'select c.teto_custo_dia_usd, coalesce(c.cotacao_dolar, 5.08) from public.direitos_config c' into v_teto, v_cot;
    if v_teto is not null and v_teto > 0 then
      execute 'select public.carteira_gasto_hoje_usd()' into v_gasto;
      if v_gasto >= v_teto and public.alertas_dono_criar('teto100:' || v_hoje, 'teto_100',
           'Gasto de IA passou do teto de hoje (100%)',
           'O custo de IA de hoje chegou a ' || public.alertas_usd(v_gasto) || ', e o teto diário da conta é ' || public.alertas_usd(v_teto) || '. '
           || 'Com os cadeados ligados, a IA dos alunos para até amanhã (a equipe continua usando). Para mudar o teto: Administração > Planos > Carteira de IA > Ajustes da carteira.',
           jsonb_build_object('gasto_usd', round(v_gasto, 4), 'teto_usd', v_teto, 'dia', v_hoje)) then n := n + 1; end if;
      if v_gasto >= v_teto * 0.8 and public.alertas_dono_criar('teto80:' || v_hoje, 'teto_80',
           'Gasto de IA em 80% do teto de hoje',
           'O custo de IA de hoje chegou a ' || public.alertas_usd(v_gasto) || ' (' || round(v_gasto * 100 / v_teto) || '% do teto diário de ' || public.alertas_usd(v_teto) || '). '
           || 'Quando passar de 100%, a IA dos alunos para até amanhã (com os cadeados ligados). Veja quem mais usou em Administração > Planos > Carteira de IA.',
           jsonb_build_object('gasto_usd', round(v_gasto, 4), 'teto_usd', v_teto, 'dia', v_hoje)) then n := n + 1; end if;
    end if;
  end if;
  -- aluno acima do limite "fora do comum" (um alerta por aluno por dia)
  for a in select * from public.alertas_custo_alunos_hoje() s where s.usd >= cfg.aluno_limite_usd_dia
             and not public.user_has_full_access(s.user_id) order by s.usd desc limit 20 loop
    select u.email into v_email from auth.users u where u.id = a.user_id;
    if public.alertas_dono_criar('aluno:' || a.user_id || ':' || v_hoje, 'aluno_fora_do_comum',
         'Aluno com gasto de IA fora do comum',
         coalesce(v_email, 'Um aluno') || ' já gastou ' || public.alertas_usd(a.usd) || ' de IA hoje (o limite de alerta é ' || public.alertas_usd(cfg.aluno_limite_usd_dia) || ' por dia). '
         || 'Pode ser uso intenso ou abuso. Veja a carteira dele em Administração > Planos > Carteira de IA > Carteira de um aluno.',
         jsonb_build_object('user_id', a.user_id, 'email', v_email, 'usd', a.usd, 'dia', v_hoje)) then n := n + 1; end if;
  end loop;
  -- resumo do dia anterior, a partir das 8h de Brasília (desligável)
  if cfg.resumo_diario and extract(hour from (now() at time zone 'America/Sao_Paulo')) >= 8 and to_regclass('public.carteira_movimentos') is not null
     and not exists (select 1 from public.alertas_dono d where d.chave = 'resumo:' || v_ontem) then
    begin
      execute $q$
        select jsonb_build_object(
          'pedidos', count(*) filter (where m.situacao = 'confirmado'),
          'custo_usd', round(coalesce(sum(m.custo_usd) filter (where m.situacao = 'confirmado'), 0), 4),
          'alunos', count(distinct m.user_id) filter (where m.modo <> 'equipe'),
          'barrados', count(*) filter (where m.teria_bloqueado))
        from public.carteira_movimentos m where m.dia = $1 and m.recurso <> 'voz_ao_vivo' $q$ into v_res using v_ontem;
      execute $q$
        select string_agg(t.email || ': ' || public.alertas_usd(t.usd), '; ' order by t.usd desc) from (
          select u.email, round(coalesce(sum(m.custo_usd) filter (where m.situacao = 'confirmado'), 0), 4) usd
          from public.carteira_movimentos m join auth.users u on u.id = m.user_id
          where m.dia = $1 and m.modo <> 'equipe' and m.recurso <> 'voz_ao_vivo' group by u.email order by 2 desc limit 5) t $q$ into v_top using v_ontem;
    exception when undefined_column or undefined_table then v_res := null;
    end;
    if v_res is not null then
      v_cot := coalesce(v_cot, 5.08);
      if public.alertas_dono_criar('resumo:' || v_ontem, 'resumo_diario',
           'Resumo do custo de IA de ' || to_char(v_ontem, 'DD/MM/YYYY'),
           'Ontem (' || to_char(v_ontem, 'DD/MM/YYYY') || '): ' || (v_res ->> 'pedidos') || ' pedidos de IA de texto, custo de '
           || public.alertas_usd((v_res ->> 'custo_usd')::numeric) || ' (cerca de ' || public.avisos_brl(round((v_res ->> 'custo_usd')::numeric * v_cot * 100)::int) || '), '
           || (v_res ->> 'alunos') || ' aluno(s) usaram. ' || case when (v_res ->> 'barrados')::int > 0 then (v_res ->> 'barrados') || ' pedido(s) seriam barrados pela regra nova. ' else '' end
           || coalesce('Quem mais gastou: ' || v_top || '. ', '')
           || 'A voz ao vivo tem o painel próprio (Central de IAs). Para não receber este resumo: Administração > Planos > Carteira de IA > Alertas por e-mail.',
           v_res || jsonb_build_object('dia', v_ontem)) then n := n + 1; end if;
    end if;
  end if;
  return n;
end
$$;

-- E-mails de alerta pendentes, com o endereço configurado AGORA (mesma regra dos avisos: 48 h, nunca repete um que caiu no meio).
create or replace function public.ch_worker_alertas_dono_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb; v_para text := (select c.email from public.alertas_dono_config c);
begin
  update public.alertas_dono set email_status = 'expirado' where email_status = 'pendente' and criado_em < now() - interval '48 hours';
  update public.alertas_dono set email_status = 'falhou', email_erro = 'Envio interrompido; não repetido para não duplicar.'
  where email_status = 'enviando' and email_tentado_em < now() - interval '30 minutes';
  if v_para is null then return '[]'::jsonb; end if;
  with alvo as (
    select d.id from public.alertas_dono d where d.email_status = 'pendente' order by d.id
    limit least(100, greatest(1, coalesce(p_limite, 20))) for update skip locked
  ), marcados as (
    update public.alertas_dono d set email_status = 'enviando', email_tentado_em = now(), email_para = v_para from alvo where d.id = alvo.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'titulo', m.titulo, 'texto', m.texto, 'email', m.email_para) order by m.id), '[]'::jsonb)
    into r from marcados m;
  return r;
end
$$;

create or replace function public.ch_worker_alerta_dono_marcar(p_id bigint, p_ok boolean, p_erro text default null) returns void
  language sql security definer set search_path = ''
as $$
  update public.alertas_dono set email_status = case when p_ok then 'enviado' else 'falhou' end,
    email_enviado_em = case when p_ok then now() end, email_erro = case when p_ok then null else left(p_erro, 300) end
  where id = p_id and email_status = 'enviando'
$$;

-- Administração: configuração e últimos alertas.
create or replace function public.app_admin_alertas_dono() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare c public.alertas_dono_config;
begin
  perform public.assert_admin();
  select * into c from public.alertas_dono_config;
  return jsonb_build_object(
    'config', jsonb_build_object('email', c.email, 'ligado', c.ligado, 'resumo_diario', c.resumo_diario, 'aluno_limite_usd_dia', c.aluno_limite_usd_dia,
                                 'atualizado_em', c.updated_at),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'titulo', d.titulo, 'em', d.criado_em,
                            'email_status', d.email_status, 'email_para', d.email_para, 'erro', d.email_erro) order by d.criado_em desc)
                          from (select * from public.alertas_dono order by criado_em desc limit 20) d), '[]'::jsonb));
end
$$;

create or replace function public.app_admin_alertas_dono_salvar(p_dados jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(btrim(coalesce(p_dados ->> 'email', ''))); v_lim text := replace(btrim(coalesce(p_dados ->> 'aluno_limite_usd_dia', '')), ',', '.');
begin
  perform public.assert_admin();
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Nada para salvar.' using errcode = '22023'; end if;
  if v_email !~ '^[^\s@<>"'',;]+@[^\s@<>"'',;]+\.[^\s@<>"'',;]+$' or char_length(v_email) > 200 then
    raise exception 'E-mail dos alertas inválido.' using errcode = '22023';
  end if;
  if v_lim !~ '^\d{1,4}(\.\d{1,2})?$' or v_lim::numeric <= 0 then
    raise exception 'Limite por aluno: um valor em dólar maior que zero (ex.: 1 ou 2,50).' using errcode = '22023';
  end if;
  update public.alertas_dono_config set email = v_email,
    ligado = coalesce((p_dados ->> 'ligado')::boolean, ligado), resumo_diario = coalesce((p_dados ->> 'resumo_diario')::boolean, resumo_diario),
    aluno_limite_usd_dia = v_lim::numeric, updated_at = now(), updated_by = (select auth.uid());
  perform public.admin_log('alertas_dono.save', null, p_dados);
  return public.app_admin_alertas_dono();
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.alertas_dono_criar(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.alertas_usd(numeric) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_devolvido(text, text, integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_admin_devolucao(uuid, bigint, integer, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_nota_salvar(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_notas_pendentes(integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_notas_email_pegar(integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_nota_email_marcar(bigint, boolean, text) from public, anon, authenticated;
revoke execute on function public.alertas_custo_alunos_hoje() from public, anon, authenticated;
revoke execute on function public.ch_worker_alertas_dono_gerar() from public, anon, authenticated;
revoke execute on function public.ch_worker_alertas_dono_pegar(integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_alerta_dono_marcar(bigint, boolean, text) from public, anon, authenticated;
revoke execute on function public.app_billing_historico() from public, anon;
grant execute on function public.app_billing_historico() to authenticated;
revoke execute on function public.app_admin_billing_pagamentos(uuid) from public, anon;
grant execute on function public.app_admin_billing_pagamentos(uuid) to authenticated;
revoke execute on function public.app_admin_billing_devolucoes(integer) from public, anon;
grant execute on function public.app_admin_billing_devolucoes(integer) to authenticated;
revoke execute on function public.app_admin_alertas_dono() from public, anon;
grant execute on function public.app_admin_alertas_dono() to authenticated;
revoke execute on function public.app_admin_alertas_dono_salvar(jsonb) from public, anon;
grant execute on function public.app_admin_alertas_dono_salvar(jsonb) to authenticated;
