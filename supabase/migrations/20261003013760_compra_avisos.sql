-- =============================================================================
-- PLANOS · ETAPA 4 (ramo fase1-compra, 17/10/2026): avisos de renovação e de pagamento (e-mail E aviso na tela), troca da forma
-- de pagamento, histórico com recibo, aceite do contrato na compra e "o que sobra da amostra hoje" para as telas de cadeado.
--
-- Decisões do dono (não mudar): avisos 7, 3 e 1 dia antes do vencimento, por e-mail E na tela (pop-up), UMA vez cada um, nunca
-- duplicado; aviso quando o pagamento falhar e quando o acesso for bloqueado/liberado; cartão renova sozinho; Pix gerado 7 dias
-- antes; sem tolerância, sem multa, sem juros; aceite do contrato na hora da contratação, registrado no banco.
--
-- DESLIGADO POR PADRÃO: os avisos nascem só de contratos/cobranças da cobrança nova (013700), que só existem com o fornecedor
-- ligado no servidor e as vendas ligadas. O e-mail só sai com as variáveis SMTP_* no servidor (sem elas, o aviso fica só na tela e
-- o e-mail "pendente" vira "expirado" depois de 48 h: nunca chega atrasado). As telas de amostra só aparecem com os cadeados ligados.
--
-- Uma vez só: cada aviso tem uma CHAVE única por aluno (ex.: "renovacao:2026-11-17:7"); o e-mail é "pego" por um envio de cada vez
-- (FOR UPDATE SKIP LOCKED) e, se o envio cair no meio, NÃO é repetido (prefere-se perder um e-mail a mandar dois).
--
-- ADITIVA: tabela nova, colunas novas (billing_cobrancas.recibo_url, billing_config.contrato_url) e funções novas. Não recria
-- nenhuma função das migrações 013640–013720. Depende da 013700 (cobrança) e da 013640/013680/013690 (planos).
-- Pode ser colada de novo. Desfazer: supabase/desfazer/20261003013760_compra_avisos.desfazer.sql.
-- Conferir: supabase/conferir/compra-avisos.sql.
-- =============================================================================

-- ---------------------------------------------------------------- avisos ao aluno (tela + e-mail)
create table if not exists public.avisos_aluno (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado', 'acesso_liberado')),
  chave text not null check (char_length(chave) between 3 and 120),
  titulo text not null check (char_length(titulo) between 3 and 140),
  texto text not null check (char_length(texto) between 3 and 600),
  -- botão do aviso: rota do app (só rotas conhecidas)
  rota text not null default 'planos' check (rota in ('planos', 'perfil')),
  criado_em timestamptz not null default now(),
  visto_em timestamptz,
  email_status text not null default 'pendente' check (email_status in ('pendente', 'enviando', 'enviado', 'falhou', 'expirado', 'sem_email')),
  email_tentado_em timestamptz,
  email_enviado_em timestamptz,
  email_erro text check (char_length(email_erro) <= 300),
  unique (user_id, chave)
);
create index if not exists avisos_aluno_email_idx on public.avisos_aluno (email_status, id) where email_status in ('pendente', 'enviando');
create index if not exists avisos_aluno_user_idx on public.avisos_aluno (user_id, criado_em desc);
alter table public.avisos_aluno enable row level security;
drop policy if exists "avisos do aluno: ler os próprios" on public.avisos_aluno;
create policy "avisos do aluno: ler os próprios" on public.avisos_aluno
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.avisos_aluno from public, anon, authenticated;
grant select on public.avisos_aluno to authenticated;

-- ---------------------------------------------------------------- colunas novas da cobrança
-- Recibo do fornecedor (página do comprovante/fatura, onde a nota fiscal também aparece quando emitida). Só https.
alter table public.billing_cobrancas add column if not exists recibo_url text check (recibo_url is null or (recibo_url ~ '^https://' and char_length(recibo_url) <= 500));
-- Página do Contrato de Assinatura vigente (o link da caixa de aceite). null = Termos de Uso (/novo/termos).
alter table public.billing_config add column if not exists contrato_url text
  check (contrato_url is null or ((contrato_url ~ '^/novo/[a-z0-9/_-]+$' or contrato_url ~ '^https://') and char_length(contrato_url) <= 300));

-- ---------------------------------------------------------------- apoio
create or replace function public.avisos_brl(p_centavos integer) returns text
  language sql immutable set search_path = ''
as $$
  select 'R$ ' || regexp_replace((coalesce(p_centavos, 0) / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
         || ',' || lpad((coalesce(p_centavos, 0) % 100)::text, 2, '0')
$$;

create or replace function public.avisos_dia(p_quando timestamptz) returns date
  language sql immutable set search_path = ''
as $$ select (p_quando at time zone 'America/Sao_Paulo')::date $$;

-- Grava um aviso (uma vez só pela chave). Equipe e revisores (acesso completo) não recebem aviso de cobrança. true = novo.
create or replace function public.avisos_criar(p_user uuid, p_tipo text, p_chave text, p_titulo text, p_texto text, p_rota text default 'planos')
  returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or public.user_has_full_access(p_user) then return false; end if;
  insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rota)
  values (p_user, p_tipo, left(p_chave, 120), left(p_titulo, 140), left(p_texto, 600), coalesce(p_rota, 'planos'))
  on conflict (user_id, chave) do nothing;
  return found;
end
$$;

-- ---------------------------------------------------------------- avisos que nascem da própria cobrança
-- Depois de gravar/alterar uma cobrança do PLANO:
--   * falhou (cartão recusado na renovação, ou Pix da renovação vencido): "pagamento não passou / acesso pausado";
--   * paga: primeira compra = "pagamento confirmado"; paga depois de uma falha ou depois do fim do período = "acesso liberado".
--     Renovação normal (sem falha, no prazo) não gera aviso.
-- A chave do bloqueio é a mesma da tarefa diária ("bloqueado:<dia do vencimento>"): um bloqueio vira UM aviso só.
create or replace function public.avisos_da_cobranca() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.billing_contratos;
  v_plano text := upper(new.codigo);
  v_ultimo timestamptz;
  v_falhou boolean;
begin
  if new.tipo <> 'plano' or new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into c from public.billing_contratos where user_id = new.user_id;

  if new.status = 'falhou' then
    if c.user_id is null then return new; end if; -- 1ª compra que não passou: a própria tela mostra
    if new.metodo = 'cartao' then
      perform public.avisos_criar(new.user_id, 'acesso_bloqueado', 'bloqueado:' || public.avisos_dia(c.periodo_fim)::text,
        'A renovação no cartão não passou',
        'Não conseguimos cobrar a renovação do seu ' || v_plano || ' (' || public.avisos_brl(new.valor_centavos) || ') no cartão, e o acesso pago foi pausado hoje. '
        || 'Pague a mesma cobrança por Pix em Meu plano e ele volta na hora. Se o cartão passar numa nova tentativa, o acesso volta sozinho, sem cobrança em dobro. Seus dados estão guardados.');
    else
      perform public.avisos_criar(new.user_id, 'acesso_bloqueado', 'bloqueado:' || public.avisos_dia(c.periodo_fim)::text,
        'Seu acesso pago foi pausado',
        'O Pix da renovação do seu ' || v_plano || ' (' || public.avisos_brl(new.valor_centavos) || ') não foi pago até o vencimento. '
        || 'Ele continua valendo em Meu plano: pague e o acesso volta na hora. Seus dados estão guardados.');
    end if;
    return new;
  end if;

  if new.status = 'paga' and (tg_op = 'INSERT' or old.status is distinct from 'paga') then
    if c.user_id is null then
      perform public.avisos_criar(new.user_id, 'acesso_liberado', 'liberado:' || new.provider || ':' || new.provider_payment_id,
        'Pagamento confirmado',
        'Recebemos ' || public.avisos_brl(new.valor_centavos) || ' (' || case new.metodo when 'pix' then 'Pix' else 'cartão de crédito' end || '). '
        || 'Seu ' || v_plano || ' está ativo' || coalesce(' até ' || to_char(public.avisos_dia(new.periodo_fim), 'DD/MM/YYYY'), '') || '. Bons estudos!');
      return new;
    end if;
    select max(x.pago_em) into v_ultimo from public.billing_cobrancas x
    where x.user_id = new.user_id and x.tipo = 'plano' and x.id <> new.id and x.status in ('paga', 'devolvida_parcial');
    v_falhou := (tg_op = 'UPDATE' and old.status = 'falhou') or exists (
      select 1 from public.billing_cobrancas f where f.user_id = new.user_id and f.tipo = 'plano' and f.status = 'falhou'
        and f.id <> new.id and f.criado_em > coalesce(v_ultimo, '-infinity'::timestamptz));
    if v_falhou or c.periodo_fim <= coalesce(new.pago_em, now()) then
      perform public.avisos_criar(new.user_id, 'acesso_liberado', 'liberado:' || new.provider || ':' || new.provider_payment_id,
        'Pagamento confirmado: acesso liberado',
        'Recebemos ' || public.avisos_brl(new.valor_centavos) || ' e o seu ' || v_plano || ' voltou a valer'
        || coalesce(' até ' || to_char(public.avisos_dia(new.periodo_fim), 'DD/MM/YYYY'), '') || '. Seus dados continuam todos aí.');
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists avisos_da_cobranca on public.billing_cobrancas;
create trigger avisos_da_cobranca after insert or update of status on public.billing_cobrancas
  for each row execute function public.avisos_da_cobranca();

-- ---------------------------------------------------------------- tarefa diária: renovação (7, 3, 1 dia) e bloqueio por falta de pagamento
-- Renovação: um aviso por vencimento e nível. Se a tarefa ficar dias sem rodar, sai só o nível de hoje (nunca 7, 3 e 1 juntos).
-- Bloqueio: contrato que renovava e cujo período acabou sem pagamento confirmado (Pix não pago, ou aviso de recusa que não chegou).
-- Devolve quantos avisos novos saíram.
create or replace function public.ch_worker_avisos_cobranca() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer := 0;
  v_hoje date := public.avisos_dia(now());
  x record;
  v_dias integer;
  v_nivel integer;
  v_plano text;
  v_titulo text;
  v_texto text;
begin
  for x in select c.*, public.avisos_dia(c.periodo_fim) as dia_fim from public.billing_contratos c
           where c.periodo_fim > now() and c.periodo_fim <= now() + interval '8 days' loop
    v_dias := x.dia_fim - v_hoje;
    v_nivel := case when v_dias <= 1 then 1 when v_dias <= 3 then 3 when v_dias <= 7 then 7 end;
    continue when v_nivel is null;
    v_plano := upper(x.plano);
    if not x.renova then
      v_titulo := 'Seu ' || v_plano || ' termina ' || case v_dias when 0 then 'hoje' when 1 then 'amanhã' else 'em ' || v_dias || ' dias' end;
      v_texto := 'A renovação está cancelada: o acesso pago vai até ' || to_char(x.dia_fim, 'DD/MM/YYYY') || '. Para continuar, é só assinar de novo em Meu plano. Seus dados ficam guardados.';
    elsif x.metodo = 'cartao' then
      v_titulo := 'Seu ' || v_plano || ' renova ' || case v_dias when 0 then 'hoje' when 1 then 'amanhã' else 'em ' || v_dias || ' dias' end;
      v_texto := 'Em ' || to_char(x.dia_fim, 'DD/MM/YYYY') || ', ' || public.avisos_brl(x.valor_centavos) || ' serão cobrados à vista no seu cartão de crédito. '
                 || 'Você não precisa fazer nada. Para trocar para Pix ou cancelar (sem multa), vá em Minha conta > Assinatura.';
    else
      v_titulo := 'Seu ' || v_plano || ' vence ' || case v_dias when 0 then 'hoje' when 1 then 'amanhã' else 'em ' || v_dias || ' dias' end;
      v_texto := 'O Pix da renovação (' || public.avisos_brl(x.valor_centavos) || ') já está em Meu plano. Pague até ' || to_char(x.dia_fim, 'DD/MM/YYYY')
                 || ' para o acesso não pausar. Se preferir, troque para cartão de crédito em Minha conta > Assinatura.';
    end if;
    if public.avisos_criar(x.user_id, 'renovacao', 'renovacao:' || x.dia_fim::text || ':' || v_nivel, v_titulo, v_texto) then n := n + 1; end if;
  end loop;

  for x in select c.*, public.avisos_dia(c.periodo_fim) as dia_fim from public.billing_contratos c
           where c.renova and c.periodo_fim <= now() and c.periodo_fim > now() - interval '3 days' loop
    if public.avisos_criar(x.user_id, 'acesso_bloqueado', 'bloqueado:' || x.dia_fim::text,
         'Seu acesso pago foi pausado',
         'A renovação do seu ' || upper(x.plano) || ' (' || public.avisos_brl(x.valor_centavos) || ') não foi confirmada até ' || to_char(x.dia_fim, 'DD/MM/YYYY')
         || '. Pague em Meu plano e o acesso volta na hora. Seus dados estão guardados.') then
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------- e-mail dos avisos (o servidor envia)
-- Pega até p_limite avisos com e-mail pendente (de no máximo p_horas atrás), marcando "enviando". Os mais velhos viram "expirado"
-- (sem e-mail configurado o aviso fica só na tela) e "enviando" parado há mais de 30 min vira "falhou" (sem reenviar: nunca duplica).
create or replace function public.ch_worker_avisos_email_pegar(p_limite integer default 20, p_horas integer default 48) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare r jsonb;
begin
  update public.avisos_aluno set email_status = 'expirado'
  where email_status = 'pendente' and criado_em < now() - make_interval(hours => greatest(1, coalesce(p_horas, 48)));
  update public.avisos_aluno set email_status = 'falhou', email_erro = 'Envio interrompido; não repetido para não duplicar.'
  where email_status = 'enviando' and email_tentado_em < now() - interval '30 minutes';
  with alvo as (
    select a.id from public.avisos_aluno a where a.email_status = 'pendente' order by a.id
    limit least(100, greatest(1, coalesce(p_limite, 20))) for update skip locked
  ), marcados as (
    update public.avisos_aluno a set email_status = 'enviando', email_tentado_em = now() from alvo where a.id = alvo.id returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'titulo', m.titulo, 'texto', m.texto, 'rota', m.rota,
                                               'email', u.email, 'nome', coalesce(nullif(btrim(p.name), ''), null)) order by m.id), '[]'::jsonb)
    into r
  from marcados m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id;
  -- conta sem e-mail: não há para onde mandar
  update public.avisos_aluno a set email_status = 'sem_email'
  where a.email_status = 'enviando' and exists (select 1 from auth.users u where u.id = a.user_id and coalesce(btrim(u.email), '') = '');
  return (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(r) e where coalesce(e ->> 'email', '') <> '');
end
$$;

create or replace function public.ch_worker_aviso_email_marcar(p_id bigint, p_ok boolean, p_erro text default null) returns void
  language sql security definer set search_path = ''
as $$
  update public.avisos_aluno set email_status = case when p_ok then 'enviado' else 'falhou' end,
    email_enviado_em = case when p_ok then now() end, email_erro = case when p_ok then null else left(p_erro, 300) end
  where id = p_id and email_status = 'enviando'
$$;

-- ---------------------------------------------------------------- o aluno: avisos na tela
create or replace function public.app_meus_avisos() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'novos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'rota', a.rota, 'em', a.criado_em)
                                        order by a.criado_em desc)
                       from public.avisos_aluno a where a.user_id = v_user and a.visto_em is null and a.criado_em > now() - interval '30 days'), '[]'::jsonb),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'em', a.criado_em,
                                                              'visto', a.visto_em is not null, 'email', a.email_status = 'enviado') order by a.criado_em desc)
                          from (select * from public.avisos_aluno where user_id = v_user order by criado_em desc limit 10) a), '[]'::jsonb));
end
$$;

create or replace function public.app_avisos_vistos(p_ids bigint[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid()); n integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  update public.avisos_aluno set visto_em = now() where user_id = v_user and id = any (coalesce(p_ids, '{}')) and visto_em is null;
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- histórico de pagamentos (Minha conta > Assinatura)
create or replace function public.app_billing_historico() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'codigo', x.codigo, 'ciclo', x.ciclo, 'metodo', x.metodo,
                             'valor_centavos', x.valor_centavos, 'status', x.status, 'pago_em', x.pago_em, 'em', x.criado_em,
                             'devolvido_centavos', x.devolvido_centavos, 'periodo_fim', x.periodo_fim, 'recibo_url', x.recibo_url)
                             order by x.criado_em desc)
                           from (select * from public.billing_cobrancas where user_id = v_user order by criado_em desc limit 50) x), '[]'::jsonb),
    -- o aceite do contrato da compra (o último): versão e data, para o aluno ver o que aceitou
    'aceite', (select jsonb_build_object('em', p.aceite ->> 'registrado_em', 'versao', p.aceite ->> 'contrato_versao', 'plano', p.nome)
               from public.billing_pedidos p where p.user_id = v_user and p.aceite is not null and p.status in ('pago', 'devolvido', 'devolvido_parcial')
               order by p.criado_em desc limit 1),
    'contrato_url', coalesce((select b.contrato_url from public.billing_config b), '/novo/termos'));
end
$$;

-- ---------------------------------------------------------------- servidor: recibo, documento do contrato e aceite
create or replace function public.ch_worker_billing_recibo_salvar(p_provider text, p_payment text, p_url text) returns void
  language sql security definer set search_path = ''
as $$
  update public.billing_cobrancas set recibo_url = p_url
  where provider = p_provider and provider_payment_id = p_payment and p_url ~ '^https://' and char_length(p_url) <= 500
$$;

create or replace function public.ch_worker_billing_contrato_doc() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('versao', b.contrato_versao, 'url', coalesce(b.contrato_url, '/novo/termos')) from public.billing_config b
$$;

-- O aceite da compra também vira prova em legal_acceptances (como o aceite do cadastro) QUANDO o documento do Contrato de
-- Assinatura existir no banco (ramo termo-v3: documento 'contrato_assinatura', origem 'contratacao'). Até lá, a prova fica no
-- pedido (billing_pedidos.aceite: versão, SHA-256, hora do banco, IP, navegador e retrato da oferta). Nunca impede a compra.
create or replace function public.ch_worker_billing_aceite_registrar(p_user uuid, p_user_agent text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_versao text;
begin
  select v.version into v_versao from public.legal_versions v where v.document = 'contrato_assinatura';
  if v_versao is null then return false; end if;
  begin
    perform public.legal_record(p_user, 'contrato_assinatura', v_versao, 'contratacao', p_user_agent);
    return true;
  exception when others then
    return false;
  end;
end
$$;

-- ---------------------------------------------------------------- troca da forma de pagamento (Minha conta > Assinatura)
-- Situação para trocar: só com contrato que renova, período em vigor e sem renovação do cartão recusada (essa se paga por Pix).
create or replace function public.ch_worker_billing_troca_situacao(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when c.user_id is null then null else jsonb_build_object(
    'plano', c.plano, 'ciclo', c.ciclo, 'metodo', c.metodo, 'valor_centavos', c.valor_centavos, 'renova', c.renova,
    'provider', c.provider, 'subscription_id', c.provider_subscription_id, 'periodo_fim', c.periodo_fim,
    'vigente', c.periodo_fim > now(),
    'pendente', public.ch_worker_billing_renovacao_pendente(p_user) is not null,
    'customer_id', (select k.customer_id from public.billing_clientes k where k.user_id = c.user_id and k.provider = c.provider),
    'pix_aberto', (select jsonb_build_object('id', p.id, 'provider', p.provider, 'payment_id', p.provider_payment_id)
                   from public.billing_pedidos p where p.user_id = c.user_id and p.tipo = 'plano' and p.status = 'aberto'
                     and p.motivo = 'renovacao' and p.metodo = 'pix' limit 1),
    'troca_aberta', (select to_jsonb(p) from public.billing_pedidos p where p.user_id = c.user_id and p.tipo = 'plano' and p.status = 'aberto'
                       and p.motivo = 'renovacao' and p.metodo = 'cartao' and p.renova_ate = c.periodo_fim limit 1)) end
  from public.billing_contratos c where c.user_id = p_user
$$;

-- Cartão -> Pix (o servidor já cancelou a assinatura no fornecedor). O Pix da renovação sai 7 dias antes pela tarefa diária.
create or replace function public.ch_worker_billing_para_pix(p_user uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare c public.billing_contratos; v_sub text;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  select * into c from public.billing_contratos where user_id = p_user for update;
  if c.user_id is null or not c.renova or c.periodo_fim <= now() then
    raise exception 'sem_renovacao: Você não tem uma assinatura que renova para trocar a forma de pagamento.';
  end if;
  if c.metodo = 'pix' then return jsonb_build_object('metodo', 'pix', 'periodo_fim', c.periodo_fim); end if;
  v_sub := c.provider_subscription_id;
  update public.billing_contratos set metodo = 'pix', provider_subscription_id = null, atualizado_em = now() where user_id = p_user;
  if v_sub is not null then
    update public.subscriptions set provider_subscription_id = null, updated_at = now() where user_id = p_user and provider_subscription_id = v_sub;
  end if;
  return jsonb_build_object('metodo', 'pix', 'periodo_fim', c.periodo_fim);
end
$$;

-- Pix -> cartão: abre um pedido de RENOVAÇÃO no cartão (assinatura cuja 1ª cobrança vence no fim do período atual). O aluno digita o
-- cartão na página segura do fornecedor e paga essa renovação ali (pagar antes do vencimento não perde dias). Enquanto não pagar,
-- o contrato continua Pix. O pedido vale o tempo normal de um pedido (60 min); vencido, a tarefa cancela a assinatura criada.
-- O Pix de renovação aberto deve ter sido cancelado antes pelo servidor (e conferido que não foi pago).
create or replace function public.ch_worker_billing_troca_cartao_abrir(p_user uuid, p_idem text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.billing_config;
  c public.billing_contratos;
  p public.billing_pedidos;
begin
  if p_idem is null or char_length(p_idem) not between 8 and 100 then raise exception 'Pedido inválido.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user::text, 0));
  select * into cfg from public.billing_config;
  select * into p from public.billing_pedidos where user_id = p_user and idem_chave = p_idem;
  if found then return to_jsonb(p) || jsonb_build_object('repetido', true); end if;
  select * into c from public.billing_contratos where user_id = p_user;
  if c.user_id is null or not c.renova or c.periodo_fim <= now() then
    raise exception 'sem_renovacao: Você não tem uma assinatura que renova para trocar a forma de pagamento.';
  end if;
  if c.metodo = 'cartao' then raise exception 'ja_no_cartao: Sua assinatura já renova no cartão de crédito.'; end if;
  update public.billing_pedidos set status = 'expirado', atualizado_em = now()
  where user_id = p_user and tipo = 'plano' and status = 'aberto' and expira_em <= now();
  if exists (select 1 from public.billing_pedidos x where x.user_id = p_user and x.tipo = 'plano' and x.status = 'aberto') then
    raise exception 'pedido_aberto: Você já tem um pagamento do plano em aberto. Conclua ou cancele antes de trocar.';
  end if;
  if exists (select 1 from public.billing_pedidos x where x.user_id = p_user and x.motivo = 'renovacao' and x.renova_ate = c.periodo_fim and x.status = 'pago') then
    raise exception 'renovacao_paga: A próxima renovação já está paga. A troca para cartão fica para depois dela.';
  end if;
  insert into public.billing_pedidos (user_id, tipo, codigo, ciclo, metodo, motivo, nome, valor_centavos, idem_chave, expira_em, renova_ate)
  values (p_user, 'plano', c.plano, c.ciclo, 'cartao', 'renovacao',
          upper(c.plano) || case when c.ciclo = 'trimestral' then ' trimestral' else ' mensal' end || ' (troca para cartão)',
          c.valor_centavos, p_idem, now() + make_interval(mins => cfg.pedido_validade_minutos), c.periodo_fim)
  returning * into p;
  return to_jsonb(p);
end
$$;

-- ---------------------------------------------------------------- amostra de hoje (telas de cadeado)
-- O que sobra hoje da amostra (questões, simulados e flashcards), com as mesmas contas dos cadeados (013690). Só vale com os
-- cadeados ligados; desligados, devolve {"ligado": false} e as telas ficam como hoje.
create or replace function public.app_amostra_hoje() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  d jsonb;
  v_ini timestamptz;
  v_q integer; v_s integer; v_f integer;
  r jsonb := '{}'::jsonb;
  k text;
  v_lim integer;
  v_usados integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.direitos_cadeados_ligados() then return jsonb_build_object('ligado', false); end if;
  d := public.direitos_do_aluno(v_user);
  v_ini := public.cadeado_inicio_do_dia();
  select count(*) into v_q from public.question_attempts a left join public.practice_sessions s on s.id = a.session_id
  where a.user_id = v_user and a.answered_at >= v_ini and s.kind is distinct from 'simulado';
  select count(*) into v_s from public.practice_sessions s where s.user_id = v_user and s.kind = 'simulado' and s.started_at >= v_ini;
  select count(*) into v_f from public.flashcard_reviews f where f.user_id = v_user and f.reviewed_at >= v_ini;
  foreach k in array array['questoes', 'simulados_teoricos', 'flashcards'] loop
    v_usados := case k when 'questoes' then v_q when 'simulados_teoricos' then v_s else v_f end;
    v_lim := case when d #>> array['recursos', k, 'amostra', 'modo'] = 'por_dia' then (d #>> array['recursos', k, 'amostra', 'limite'])::int end;
    r := r || jsonb_build_object(k, jsonb_build_object(
      'acesso', d #>> array['recursos', k, 'acesso'], 'mensagem', d #>> array['recursos', k, 'mensagem'],
      'limite', v_lim, 'usados', v_usados, 'restam', case when v_lim is null then null else greatest(0, v_lim - v_usados) end,
      'unidade', d #>> array['recursos', k, 'amostra', 'unidade'], 'ofertas', coalesce(d #> array['recursos', k, 'ofertas'], '[]'::jsonb)));
  end loop;
  return jsonb_build_object('ligado', true, 'perfil', d ->> 'perfil', 'recursos', r,
    'simulado_max_questoes', (select c.amostra_simulado_max_questoes from public.direitos_config c),
    'teste', jsonb_build_object('fim', d #>> '{teste,fim}', 'usado', d #> '{teste,usado}'));
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.avisos_brl(integer) from public, anon, authenticated;
revoke execute on function public.avisos_dia(timestamptz) from public, anon, authenticated;
revoke execute on function public.avisos_criar(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.avisos_da_cobranca() from public, anon, authenticated;
revoke execute on function public.ch_worker_avisos_cobranca() from public, anon, authenticated;
revoke execute on function public.ch_worker_avisos_email_pegar(integer, integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_aviso_email_marcar(bigint, boolean, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_recibo_salvar(text, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_contrato_doc() from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_aceite_registrar(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_troca_situacao(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_para_pix(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_billing_troca_cartao_abrir(uuid, text) from public, anon, authenticated;
revoke execute on function public.app_meus_avisos() from public, anon;
grant execute on function public.app_meus_avisos() to authenticated;
revoke execute on function public.app_avisos_vistos(bigint[]) from public, anon;
grant execute on function public.app_avisos_vistos(bigint[]) to authenticated;
revoke execute on function public.app_billing_historico() from public, anon;
grant execute on function public.app_billing_historico() to authenticated;
revoke execute on function public.app_amostra_hoje() from public, anon;
grant execute on function public.app_amostra_hoje() to authenticated;
