-- =============================================================================
-- 013960 — LISTA DE INTERESSE DA 2ª FASE (pedido do dono, 18/10/2026; ramo lista-interesse)
--
-- O botão "Entrar na lista de interesse" da página inicial (www.staziamed.com.br) guarda o contato da pessoa e a leva ao GRUPO DO
-- WHATSAPP da 2ª fase (decisão do dono, 18/10: o aviso é feito pelo grupo). O contato serve SÓ para o aviso da 2ª fase (sem marketing).
--
--   * WHATSAPP OBRIGATÓRIO, em E.164 (+5511987654321), único por fase (o mesmo número não duplica). Brasil com DDD; aceita números de
--     fora (Paraguai, Bolívia, Argentina e outros, com o código do país). "Não verificado": não mandamos mensagem automática pelo
--     WhatsApp (não há API); quem entra no grupo é a própria pessoa.
--   * E-MAIL OPCIONAL, com DUPLA CONFIRMAÇÃO (LGPD): só se a pessoa informou. Só e-mail confirmado recebe o aviso por e-mail ("Avisar
--     todos", na Administração). E-mail não confirmado em 30 dias é retirado da inscrição (o WhatsApp continua).
--   * GRUPO: o link de convite fica em public.lista_interesse_config (Administração → Lista de interesse; só https://chat.whatsapp.com/…),
--     NUNCA no código. Sem link, a tela mostra só "Pronto". O botão passa pelo servidor (/api/interesse/grupo), que registra o clique.
--   * PROVA DO CONSENTIMENTO: o texto exato da caixa aceita, a versão e a data e hora (lista_interesse_consentimento(versao)).
--   * SEM DADO A MAIS: IP só como código (HMAC feito no servidor; o IP nunca chega ao banco) e o navegador resumido ("Chrome · Android").
--   * LIMITES NO BANCO (não em memória): por IP (10 em 10 minutos, 50 por dia); por e-mail (3 e-mails de confirmação por dia, com 2
--     minutos entre eles; passando disso, a resposta é a MESMA e nada sai); teto geral de 500 confirmações por e-mail por dia, para não
--     gastar o limite diário do Google Workspace (1.500 da fila; email_saida_teto_dia da 013950).
--   * MESMA FILA DE E-MAILS DE SERVIÇO (public.email_saida, 013800/013950; rota /api/legal/email de 5 em 5 minutos; SMTP do Workspace).
--     A fila passa a aceitar e-mail sem conta (interessado_id, user_id vazio) e dois tipos novos: interesse_confirmar (logo depois do
--     aviso de conta inativa) e interesse_aviso (por último, depois dos comunicados). ch_worker_email_pegar é a da 013950 com isso.
--   * ADMINISTRAÇÃO (só administrador; o servidor confere e cada função confere de novo com assert_admin): resumo por dia, lista com
--     busca (WhatsApp, e-mail, data, se clicou no grupo), exportação (registrada), link do grupo, tirar alguém da lista e "Avisar todos
--     que a 2ª fase abriu" por e-mail (prévia + número esperado; só e-mails confirmados; uma vez por pessoa: chave única na fila).
--   * Tabelas com RLS ligado e SEM acesso de anon/authenticated. Inscrever, confirmar, sair, grupo e limpar: funções ch_worker_* (só o
--     servidor, papel de serviço). Administração: app_admin_interesse_* (o servidor chama como o administrador logado).
--
-- ORDEM: depois da 013950 (comunicados por e-mail) aplicada. ADITIVA e pode ser colada de novo. Conferência no fim (se algo não bater,
-- PARA com erro). Desfazer: supabase/desfazer/20261003013960_lista_interesse.desfazer.sql. Conferir: supabase/conferir/lista-interesse.sql.
-- =============================================================================

do $confere$
begin
  if to_regclass('public.email_saida') is null or to_regprocedure('public.email_saida_teto_dia()') is null
     or to_regclass('public.marketing_descadastro') is null or to_regprocedure('public.assert_admin()') is null then
    raise exception 'lista-interesse 013960: aplique antes a 20261003013950_comunicados_email_leitura.sql; nada foi mudado';
  end if;
end
$confere$;

-- ---------------------------------------------------------------- 1) validação (num lugar só)
-- WhatsApp → E.164 ou null. Aceita "+55 (11) 98765-4321", "11987654321", "5511987654321", "+595 981 123456", "00 54 9 11 1234-5678".
-- Sem "+" nem "00": número do Brasil (10 ou 11 dígitos com DDD, ou 12/13 começando com 55). Brasil: DDD válido e celular com 9 na frente
-- (11 dígitos) ou fixo (10). Outros países: código do país e 8 a 15 dígitos no total (padrão E.164).
create or replace function public.lista_interesse_whatsapp(p text) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  v_txt text := btrim(coalesce(p, ''));
  v_intl boolean := v_txt ~ '^(\+|00)';
  d text := regexp_replace(v_txt, '[^0-9]', '', 'g');
begin
  if v_txt = '' or v_txt ~ '[^0-9+().[:space:]-]' or v_txt ~ '.\+' or char_length(v_txt) > 30 then return null; end if;
  if v_intl then
    if v_txt ~ '^00' then d := substr(d, 3); end if;
  else
    d := regexp_replace(d, '^0', '');                  -- "0 11 9…" (com o zero do interurbano)
    if char_length(d) in (10, 11) then d := '55' || d; end if;
  end if;
  if d ~ '^55' then
    -- Brasil: DDD 11–99 (sem zero) e 8 dígitos (fixo, começa com 2–5) ou 9 dígitos (celular, começa com 9)
    if d !~ '^55[1-9][1-9]([2-5][0-9]{7}|9[0-9]{8})$' then return null; end if;
  elsif d !~ '^[1-9][0-9]{7,14}$' or not v_intl then
    return null;
  end if;
  return '+' || d;
end
$$;

create or replace function public.lista_interesse_email(p text) returns text
  language sql immutable set search_path = ''
as $$
  select case when e ~ '^[^[:space:]@<>"'',;]+@[^[:space:]@<>"'',;]+\.[^[:space:]@<>"'',;]+$' and e !~ '\.\.'
                   and char_length(e) between 6 and 254 and char_length(split_part(e, '@', 1)) <= 64 then e end
  from (select lower(btrim(coalesce(p, ''))) as e) x
$$;

-- Os limites (num lugar só; mudar aqui e colar de novo).
create or replace function public.lista_interesse_limites() returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'ip_10min', 10,               -- inscrições do mesmo IP em 10 minutos
    'ip_dia', 50,                 -- inscrições do mesmo IP em 24 horas
    'email_dia', 3,               -- e-mails de confirmação para o mesmo endereço em 24 horas
    'email_intervalo_seg', 120,   -- tempo mínimo entre dois e-mails de confirmação para o mesmo endereço
    'confirmacoes_dia', 500,      -- teto geral de e-mails de confirmação em 24 horas (a fila toda tem 1.500 por dia)
    'validade_confirmar_dias', 7, -- o link de confirmação do e-mail vale 7 dias
    'email_pendente_dias', 30,    -- e-mail não confirmado sai da inscrição em 30 dias (o WhatsApp continua)
    'descadastrado_dias', 30)     -- quem saiu da lista é apagado de vez 30 dias depois
$$;

-- Texto EXATO da caixa de consentimento de cada versão (o mesmo do formulário do site; server/interesse/consentimento.ts).
create or replace function public.lista_interesse_consentimento(p_versao text) returns text
  language sql immutable set search_path = ''
as $$
  select case p_versao
    when '2a_fase-v1' then 'Quero receber avisos da 2ª fase do StaziaMed pelo WhatsApp (e por e-mail, se informei). Posso sair a qualquer momento.'
  end
$$;

create or replace function public.lista_interesse_token() returns text
  language sql volatile set search_path = ''
as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

-- ---------------------------------------------------------------- 2) inscrições, tentativas e configuração
create table if not exists public.lista_interesse (
  id bigint generated always as identity primary key,
  fase text not null default '2a_fase' check (fase in ('2a_fase')),
  whatsapp text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$' and whatsapp = public.lista_interesse_whatsapp(whatsapp)),
  whatsapp_verificado boolean not null default false,
  nome text check (nome is null or char_length(nome) between 1 and 80),
  email text check (email is null or email = public.lista_interesse_email(email)),
  email_estado text not null default 'sem_email' check (email_estado in ('sem_email', 'pendente', 'confirmado', 'avisado')),
  origem text not null default 'site' check (origem ~ '^[a-z0-9_-]{1,40}$'),
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object' and pg_column_size(utm) <= 2000),
  consentimento_texto text not null check (char_length(consentimento_texto) between 10 and 500),
  consentimento_versao text not null check (consentimento_versao ~ '^[a-z0-9_-]{1,40}$'),
  consentimento_em timestamptz not null,
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (char_length(user_agent) <= 80),
  estado text not null default 'ativo' check (estado in ('ativo', 'descadastrado')),
  token_grupo text not null unique check (token_grupo ~ '^[0-9a-f]{64}$'),
  token_confirmar text unique check (token_confirmar ~ '^[0-9a-f]{64}$'),
  token_confirmar_em timestamptz,
  token_sair text not null unique check (token_sair ~ '^[0-9a-f]{64}$'),
  grupo_clicado_em timestamptz,
  grupo_cliques integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  email_confirmado_em timestamptz,
  aviso_na_fila_em timestamptz,
  avisado_em timestamptz,
  descadastrado_em timestamptz,
  descadastrado_por text check (descadastrado_por in ('link_email', 'equipe')),
  unique (fase, whatsapp),
  check ((email is null) = (email_estado = 'sem_email'))
);
comment on table public.lista_interesse is
  'Lista de interesse da 2ª fase (013960): WhatsApp em E.164 (único por fase, não verificado), nome e e-mail opcionais (e-mail com dupla '
  'confirmação), origem/utm, prova do consentimento (texto, versão, data), IP só como código (HMAC), navegador resumido e o clique no '
  'grupo. Serve só para o aviso da 2ª fase. Sem acesso do navegador: só funções ch_worker_interesse_* (servidor) e app_admin_interesse_*.';
-- o mesmo e-mail não fica em duas inscrições da mesma fase
create unique index if not exists lista_interesse_email_uidx on public.lista_interesse (fase, email) where email is not null;
create index if not exists lista_interesse_estado_idx on public.lista_interesse (fase, estado, email_estado);
create index if not exists lista_interesse_criado_idx on public.lista_interesse (criado_em);
alter table public.lista_interesse enable row level security;
revoke all on table public.lista_interesse from public, anon, authenticated;

-- Tentativas por IP (só o código do IP e a hora), para o limite por IP. Apagadas depois de 2 dias.
create table if not exists public.lista_interesse_tentativas (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  em timestamptz not null default now()
);
create index if not exists lista_interesse_tentativas_ip_idx on public.lista_interesse_tentativas (ip_hash, em);
alter table public.lista_interesse_tentativas enable row level security;
revoke all on table public.lista_interesse_tentativas from public, anon, authenticated;

-- Configuração (Administração → Lista de interesse): o link de convite do grupo do WhatsApp da fase. Vazio = sem botão.
create table if not exists public.lista_interesse_config (
  fase text primary key check (fase in ('2a_fase')),
  grupo_link text check (grupo_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
insert into public.lista_interesse_config (fase) values ('2a_fase') on conflict (fase) do nothing;
alter table public.lista_interesse_config enable row level security;
revoke all on table public.lista_interesse_config from public, anon, authenticated;

do $seq$
declare s text;
begin
  for s in select pg_get_serial_sequence('public.' || t, 'id') from unnest(array['lista_interesse', 'lista_interesse_tentativas']) t loop
    execute format('revoke all on sequence %s from public, anon, authenticated', s);
  end loop;
end
$seq$;

-- ---------------------------------------------------------------- 3) a fila de e-mails de serviço aceita e-mail sem conta
alter table public.email_saida add column if not exists interessado_id bigint references public.lista_interesse (id) on delete cascade;
alter table public.email_saida alter column user_id drop not null;
alter table public.email_saida drop constraint if exists email_saida_kind_check;
alter table public.email_saida add constraint email_saida_kind_check
  check (kind in ('aviso_inatividade', 'comunicado', 'interesse_confirmar', 'interesse_aviso'));
alter table public.email_saida drop constraint if exists email_saida_destino_check;
alter table public.email_saida add constraint email_saida_destino_check
  check (case when kind in ('interesse_confirmar', 'interesse_aviso') then interessado_id is not null and user_id is null
              else user_id is not null and interessado_id is null end);
create index if not exists email_saida_interessado_idx on public.email_saida (interessado_id, kind, created_at) where interessado_id is not null;

-- Põe um e-mail de confirmação na fila, respeitando os limites (por endereço e teto geral). Devolve o que fez:
--   enviado | limite_email | teto (teto geral do dia: nada sai agora; a pessoa pode pedir de novo depois)
-- O anterior que ainda não saiu é cancelado (vale o link mais novo).
create or replace function public.lista_interesse_enfileirar_confirmacao(p_id bigint) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  lim constant jsonb := public.lista_interesse_limites();
  v_n integer;
  v_ultimo timestamptz;
begin
  select count(*), max(e.created_at) into v_n, v_ultimo from public.email_saida e
   where e.interessado_id = p_id and e.kind = 'interesse_confirmar' and e.created_at > now() - interval '24 hours';
  if v_n >= (lim ->> 'email_dia')::int or v_ultimo > now() - make_interval(secs => (lim ->> 'email_intervalo_seg')::int) then
    return 'limite_email';
  end if;
  if (select count(*) from public.email_saida e where e.kind = 'interesse_confirmar' and e.created_at > now() - interval '24 hours') >= (lim ->> 'confirmacoes_dia')::int then
    return 'teto';
  end if;
  update public.email_saida set status = 'cancelado', erro = 'Trocado por um e-mail de confirmação mais novo.'
   where interessado_id = p_id and kind = 'interesse_confirmar' and status = 'pendente';
  insert into public.email_saida (kind, user_id, interessado_id, chave, payload)
  values ('interesse_confirmar', null, p_id, 'interesse_confirmar:' || p_id || ':' || gen_random_uuid(), '{}'::jsonb);
  return 'enviado';
end
$$;

-- ---------------------------------------------------------------- 4) inscrever (só servidor: POST /api/interesse)
-- Resposta para o servidor. O site recebe a MESMA mensagem em todo caso "ok" (novo ou repetido) e o código do botão do grupo
-- ("grupo"); "acao" e "email" são só para o registro e os testes:
--   resultado: ok | whatsapp_invalido | email_invalido | versao_invalida | limite_ip
--   acao (com ok): novo | ja_na_lista | voltou
--   email (com ok): sem_email | enviado | limite_email | teto | ja_confirmado | em_outra_inscricao | ignorado
create or replace function public.ch_worker_interesse_inscrever(p_whatsapp text, p_email text default null, p_nome text default null,
                                                                p_origem text default null, p_utm jsonb default null,
                                                                p_versao text default null, p_ip_hash text default null,
                                                                p_user_agent text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  lim constant jsonb := public.lista_interesse_limites();
  v_whats text := public.lista_interesse_whatsapp(p_whatsapp);
  v_email text := public.lista_interesse_email(p_email);
  v_texto text := public.lista_interesse_consentimento(p_versao);
  v_nome text := nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_nome, ''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g')), 80), '');
  v_origem text := case when p_origem ~ '^[a-z0-9_-]{1,40}$' then p_origem else 'site' end;
  v_ip text := case when p_ip_hash ~ '^[0-9a-f]{64}$' then p_ip_hash end;
  v_ua text := nullif(left(btrim(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]<>]', '', 'g')), 80), '');
  v_utm jsonb;
  r public.lista_interesse;
  v_acao text;
  v_mail text := 'sem_email';
begin
  if v_whats is null then
    return jsonb_build_object('resultado', 'whatsapp_invalido');
  end if;
  if btrim(coalesce(p_email, '')) <> '' and v_email is null then
    return jsonb_build_object('resultado', 'email_invalido');
  end if;
  if v_texto is null then
    return jsonb_build_object('resultado', 'versao_invalida');
  end if;
  select coalesce(jsonb_object_agg(k, left(v, 100)), '{}'::jsonb) into v_utm
  from jsonb_each_text(case when jsonb_typeof(p_utm) = 'object' then p_utm else '{}'::jsonb end) as x(k, v)
  where k in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') and btrim(v) <> '';

  -- limite por IP (contado no banco)
  if v_ip is not null then
    if (select count(*) from public.lista_interesse_tentativas t where t.ip_hash = v_ip and t.em > now() - interval '10 minutes') >= (lim ->> 'ip_10min')::int
       or (select count(*) from public.lista_interesse_tentativas t where t.ip_hash = v_ip and t.em > now() - interval '24 hours') >= (lim ->> 'ip_dia')::int then
      return jsonb_build_object('resultado', 'limite_ip');
    end if;
    insert into public.lista_interesse_tentativas (ip_hash) values (v_ip);
  end if;

  -- e-mail já usado em OUTRA inscrição (outro WhatsApp): a inscrição vale sem o e-mail (nada revelado)
  if v_email is not null and exists (select 1 from public.lista_interesse i where i.fase = '2a_fase' and i.email = v_email and i.whatsapp <> v_whats) then
    v_email := null;
    v_mail := 'em_outra_inscricao';
  end if;

  insert into public.lista_interesse (fase, whatsapp, nome, email, email_estado, origem, utm, consentimento_texto, consentimento_versao,
                                      consentimento_em, ip_hash, user_agent, token_grupo, token_confirmar, token_confirmar_em, token_sair)
  values ('2a_fase', v_whats, v_nome, v_email, case when v_email is null then 'sem_email' else 'pendente' end, v_origem, v_utm, v_texto,
          p_versao, now(), v_ip, v_ua, public.lista_interesse_token(),
          case when v_email is not null then public.lista_interesse_token() end, case when v_email is not null then now() end,
          public.lista_interesse_token())
  on conflict (fase, whatsapp) do nothing
  returning * into r;
  if found then
    v_acao := 'novo';
    if v_email is not null then v_mail := public.lista_interesse_enfileirar_confirmacao(r.id); end if;
    return jsonb_build_object('resultado', 'ok', 'acao', v_acao, 'email', v_mail, 'grupo', r.token_grupo);
  end if;

  select * into r from public.lista_interesse where fase = '2a_fase' and whatsapp = v_whats for update;

  if r.estado = 'descadastrado' then
    -- voltou depois de sair: inscrição nova (novo consentimento; e-mail, se veio, com nova confirmação)
    update public.lista_interesse
       set estado = 'ativo', nome = v_nome, email = v_email, email_estado = case when v_email is null then 'sem_email' else 'pendente' end,
           origem = v_origem, utm = v_utm, consentimento_texto = v_texto, consentimento_versao = p_versao, consentimento_em = now(),
           ip_hash = v_ip, user_agent = v_ua,
           token_confirmar = case when v_email is not null then public.lista_interesse_token() end,
           token_confirmar_em = case when v_email is not null then now() end,
           email_confirmado_em = null, descadastrado_em = null, descadastrado_por = null, atualizado_em = now()
     where id = r.id
    returning * into r;
    if v_email is not null then v_mail := public.lista_interesse_enfileirar_confirmacao(r.id); end if;
    return jsonb_build_object('resultado', 'ok', 'acao', 'voltou', 'email', v_mail, 'grupo', r.token_grupo);
  end if;

  -- já está na lista: o WhatsApp, o nome e o e-mail confirmado não mudam (ninguém altera a inscrição de outra pessoa).
  -- Só o e-mail pode ENTRAR (inscrição sem e-mail) ou ter a confirmação pedida de novo (o mesmo e-mail ainda pendente); quem
  -- confirma é o dono do e-mail.
  if v_email is not null then
    if r.email is null then
      update public.lista_interesse
         set email = v_email, email_estado = 'pendente', token_confirmar = public.lista_interesse_token(), token_confirmar_em = now(),
             consentimento_texto = v_texto, consentimento_versao = p_versao, consentimento_em = now(), atualizado_em = now()
       where id = r.id;
      v_mail := public.lista_interesse_enfileirar_confirmacao(r.id);
    elsif r.email = v_email and r.email_estado = 'pendente' then
      update public.lista_interesse
         set consentimento_texto = v_texto, consentimento_versao = p_versao, consentimento_em = now(),
             token_confirmar = case when token_confirmar_em > now() - make_interval(days => (lim ->> 'validade_confirmar_dias')::int - 1)
                                    then token_confirmar else public.lista_interesse_token() end,
             token_confirmar_em = case when token_confirmar_em > now() - make_interval(days => (lim ->> 'validade_confirmar_dias')::int - 1)
                                       then token_confirmar_em else now() end,
             atualizado_em = now()
       where id = r.id;
      v_mail := public.lista_interesse_enfileirar_confirmacao(r.id);
    elsif r.email = v_email then
      v_mail := 'ja_confirmado';
    else
      v_mail := 'ignorado';
    end if;
  end if;
  return jsonb_build_object('resultado', 'ok', 'acao', 'ja_na_lista', 'email', v_mail, 'grupo', r.token_grupo);
end
$$;

-- ---------------------------------------------------------------- 5) grupo, confirmar e sair (só servidor)
-- Botão "Entrar no grupo do WhatsApp" (/api/interesse/grupo?t=…): registra o clique e devolve o link do grupo (null = sem link).
create or replace function public.ch_worker_interesse_grupo(p_token text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_link text := (select grupo_link from public.lista_interesse_config where fase = '2a_fase');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valido', false); end if;
  update public.lista_interesse
     set grupo_cliques = grupo_cliques + 1, grupo_clicado_em = coalesce(grupo_clicado_em, now())
   where token_grupo = p_token and estado = 'ativo' and v_link is not null
  returning id into v_id;
  if v_id is null and not exists (select 1 from public.lista_interesse where token_grupo = p_token and estado = 'ativo') then
    return jsonb_build_object('valido', false);
  end if;
  return jsonb_build_object('valido', true, 'link', v_link);
end
$$;

-- Há link do grupo? (o servidor decide se mostra o botão na resposta da inscrição)
create or replace function public.ch_worker_interesse_tem_grupo() returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce((select grupo_link is not null from public.lista_interesse_config where fase = '2a_fase'), false) $$;

-- Confirmar o e-mail. p_confirmar = false: só diz se o código vale e em que estado está (a página mostra o botão; abrir o link não muda
-- nada, porque programas de e-mail abrem links sozinhos). p_confirmar = true: confirma.
create or replace function public.ch_worker_interesse_confirmar(p_token text, p_confirmar boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.lista_interesse;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valido', false); end if;
  select * into r from public.lista_interesse where token_confirmar = p_token and estado = 'ativo' for update;
  if not found then return jsonb_build_object('valido', false); end if;
  if r.email_estado = 'pendente' and r.token_confirmar_em < now() - make_interval(days => (public.lista_interesse_limites() ->> 'validade_confirmar_dias')::int) then
    return jsonb_build_object('valido', false, 'expirado', true);
  end if;
  if p_confirmar and r.email_estado = 'pendente' then
    update public.lista_interesse set email_estado = 'confirmado', email_confirmado_em = now(), atualizado_em = now() where id = r.id;
    r.email_estado := 'confirmado';
  end if;
  return jsonb_build_object('valido', true, 'email_estado', r.email_estado, 'grupo', r.token_grupo);
end
$$;

-- Sair da lista (link dos e-mails; um clique + confirmação; também o POST de um clique do List-Unsubscribe). Cancela o que não saiu.
create or replace function public.ch_worker_interesse_sair(p_token text, p_confirmar boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.lista_interesse;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valido', false); end if;
  select * into r from public.lista_interesse where token_sair = p_token for update;
  if not found then return jsonb_build_object('valido', false); end if;
  if p_confirmar and r.estado <> 'descadastrado' then
    perform public.lista_interesse_descadastrar(r.id, 'link_email');
    r.estado := 'descadastrado';
  end if;
  return jsonb_build_object('valido', true, 'inscrito', r.estado <> 'descadastrado');
end
$$;

create or replace function public.lista_interesse_descadastrar(p_id bigint, p_por text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.lista_interesse
     set estado = 'descadastrado', descadastrado_em = now(), descadastrado_por = p_por, token_confirmar = null, token_confirmar_em = null,
         email_estado = case when email_estado = 'pendente' then 'sem_email' else email_estado end,
         email = case when email_estado = 'pendente' then null else email end,
         atualizado_em = now()
   where id = p_id and estado <> 'descadastrado';
  update public.email_saida set status = 'cancelado', erro = 'Saiu da lista de interesse.'
   where interessado_id = p_id and status = 'pendente';
end
$$;

-- Limpeza diária (rota /api/legal/diaria): e-mail não confirmado em 30 dias sai da inscrição (o WhatsApp continua); quem saiu da lista
-- é apagado de vez 30 dias depois; tentativas de IP de mais de 2 dias.
create or replace function public.ch_worker_interesse_limpar() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  lim constant jsonb := public.lista_interesse_limites();
  a integer;
  b integer;
  c integer;
begin
  update public.email_saida e set status = 'cancelado', erro = 'E-mail não confirmado a tempo.'
   where e.status = 'pendente' and e.kind = 'interesse_confirmar'
     and exists (select 1 from public.lista_interesse i where i.id = e.interessado_id and i.email_estado = 'pendente'
                   and i.token_confirmar_em < now() - make_interval(days => (lim ->> 'email_pendente_dias')::int));
  update public.lista_interesse
     set email = null, email_estado = 'sem_email', token_confirmar = null, token_confirmar_em = null, atualizado_em = now()
   where email_estado = 'pendente' and token_confirmar_em < now() - make_interval(days => (lim ->> 'email_pendente_dias')::int);
  get diagnostics a = row_count;
  delete from public.lista_interesse
   where estado = 'descadastrado' and descadastrado_em < now() - make_interval(days => (lim ->> 'descadastrado_dias')::int);
  get diagnostics b = row_count;
  delete from public.lista_interesse_tentativas where em < now() - interval '2 days';
  get diagnostics c = row_count;
  return jsonb_build_object('emails_nao_confirmados_retirados', a, 'descadastrados_apagados', b, 'tentativas_apagadas', c);
end
$$;

-- Aviso que saiu (o servidor de e-mail aceitou): o e-mail da pessoa passa a "avisado".
create or replace function public.lista_interesse_aviso_enviado() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.lista_interesse set email_estado = 'avisado', avisado_em = now(), atualizado_em = now()
   where id = new.interessado_id and email_estado = 'confirmado';
  return null;
end
$$;
drop trigger if exists lista_interesse_aviso_enviado on public.email_saida;
create trigger lista_interesse_aviso_enviado after update of status on public.email_saida
  for each row when (new.kind = 'interesse_aviso' and new.status = 'enviado' and old.status is distinct from 'enviado')
  execute function public.lista_interesse_aviso_enviado();

-- ---------------------------------------------------------------- 6) fila (só serviço): a da 013950 + lista de interesse
-- Mudanças: e-mail sem conta (interessado_id) não depende de "conta confirmada"; ordem: aviso de conta inativa, confirmação da lista,
-- comunicado, aviso da 2ª fase; quem saiu da lista (ou já confirmou) não recebe o que ainda estava na fila; o link vai no payload na hora.
create or replace function public.ch_worker_email_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio_dia constant timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_restante integer;
begin
  update public.email_saida
     set status = 'incerto', erro = 'O envio parou no meio; não foi repetido para não mandar duas vezes.'
   where status = 'enviando' and pego_em < now() - interval '15 minutes';

  update public.email_saida e
     set status = 'cancelado', erro = 'E-mail da conta não confirmado em 30 dias.'
   where e.status = 'pendente' and e.user_id is not null and e.created_at < now() - interval '30 days' and not public.email_conta_confirmada(e.user_id);

  -- comunicado apagado, ou a pessoa retirou o consentimento: o e-mail que ainda não saiu não sai mais
  update public.email_saida e
     set status = 'cancelado', erro = 'Comunicado apagado.'
   where e.status = 'pendente' and e.kind = 'comunicado'
     and not exists (select 1 from public.comunicados_equipe c where c.id = (e.payload ->> 'comunicado_id')::bigint and c.apagado_em is null);
  update public.email_saida e
     set status = 'cancelado', erro = 'A pessoa não quer mais receber e-mails de novidades.'
   where e.status = 'pendente' and e.kind = 'comunicado'
     and not exists (select 1 from public.marketing_consents m where m.user_id = e.user_id and m.opt_in);

  -- lista de interesse: confirmação de quem já confirmou ou saiu, e aviso de quem saiu, não saem mais
  update public.email_saida e
     set status = 'cancelado', erro = 'E-mail já confirmado ou fora da lista.'
   where e.status = 'pendente' and e.kind = 'interesse_confirmar'
     and not exists (select 1 from public.lista_interesse i where i.id = e.interessado_id and i.estado = 'ativo' and i.email_estado = 'pendente'
                       and i.token_confirmar is not null);
  update public.email_saida e
     set status = 'cancelado', erro = 'Saiu da lista de interesse.'
   where e.status = 'pendente' and e.kind = 'interesse_aviso'
     and not exists (select 1 from public.lista_interesse i where i.id = e.interessado_id and i.estado = 'ativo' and i.email_estado = 'confirmado');

  -- limite do dia (Google Workspace): conta o que já foi pego hoje
  v_restante := public.email_saida_teto_dia() - (select count(*) from public.email_saida where pego_em >= v_inicio_dia)::integer;
  if v_restante <= 0 then
    return '[]'::jsonb;
  end if;

  select array_agg(x.id) into v_ids
  from (
    select e.id
    from public.email_saida e
    where e.status = 'pendente' and e.kind in ('aviso_inatividade', 'comunicado', 'interesse_confirmar', 'interesse_aviso') and e.proxima_em <= now()
      and (e.user_id is null or public.email_conta_confirmada(e.user_id))
    order by case e.kind when 'aviso_inatividade' then 0 when 'interesse_confirmar' then 1 when 'comunicado' then 2 else 3 end, e.proxima_em, e.id
    limit least(greatest(1, least(coalesce(p_limite, 20), 100)), v_restante)
    for update of e skip locked
  ) x;
  if v_ids is null then
    return '[]'::jsonb;
  end if;

  update public.email_saida e
     set status = 'enviando', pego_em = now(), tentativas = e.tentativas + 1,
         payload = case
                     when e.kind = 'aviso_inatividade' then e.payload || jsonb_build_object('prazo',
                       to_char(greatest(((e.payload ->> 'ultimo_acesso')::timestamptz at time zone 'America/Sao_Paulo')::date + interval '12 months' + interval '1 day',
                                        v_hoje + 31), 'YYYY-MM-DD'))
                     when e.kind = 'comunicado' then e.payload || coalesce((
                       select jsonb_build_object('titulo', c.titulo, 'texto', c.texto, 'rico', c.rico, 'link', c.link, 'versao', c.versao,
                                                 'descadastro', public.marketing_token(e.user_id))
                       from public.comunicados_equipe c where c.id = (e.payload ->> 'comunicado_id')::bigint), '{}'::jsonb)
                     when e.kind in ('interesse_confirmar', 'interesse_aviso') then e.payload || coalesce((
                       select jsonb_build_object('fase', i.fase, 'sair', i.token_sair, 'grupo', i.token_grupo, 'tem_grupo', public.ch_worker_interesse_tem_grupo())
                              || case when e.kind = 'interesse_confirmar' then jsonb_build_object('confirmar', i.token_confirmar) else '{}'::jsonb end
                       from public.lista_interesse i where i.id = e.interessado_id), '{}'::jsonb)
                     else e.payload end
   where e.id = any (v_ids);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'kind', e.kind, 'tentativas', e.tentativas, 'email', coalesce(u.email, i.email),
             'nome', coalesce(nullif(btrim(p.name), ''), i.nome), 'payload', e.payload)
           order by e.id)
    from public.email_saida e
    left join auth.users u on u.id = e.user_id
    left join public.profiles p on p.id = e.user_id
    left join public.lista_interesse i on i.id = e.interessado_id
    where e.id = any (v_ids)), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 7) Administração (só administrador)
create or replace function public.lista_interesse_admin_linha(i public.lista_interesse) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', i.id, 'whatsapp', i.whatsapp, 'whatsapp_verificado', i.whatsapp_verificado, 'nome', i.nome,
                            'email', i.email, 'email_estado', i.email_estado, 'estado', i.estado, 'origem', i.origem, 'utm', i.utm,
                            'consentimento_versao', i.consentimento_versao, 'consentimento_em', i.consentimento_em,
                            'criado_em', i.criado_em, 'email_confirmado_em', i.email_confirmado_em, 'grupo_clicado_em', i.grupo_clicado_em,
                            'grupo_cliques', i.grupo_cliques, 'aviso_na_fila_em', i.aviso_na_fila_em, 'avisado_em', i.avisado_em,
                            'descadastrado_em', i.descadastrado_em, 'descadastrado_por', i.descadastrado_por)
$$;

-- Resumo: totais, por dia (inscrições, e-mails confirmados e cliques no grupo; dia de Brasília), andamento do aviso e o link do grupo.
create or replace function public.app_admin_interesse_resumo(p_dias integer default 30) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_dias constant integer := greatest(1, least(coalesce(p_dias, 30), 365));
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.lista_interesse where estado = 'ativo'),
    'contagem', (select jsonb_build_object(
                   'ativos', count(*) filter (where estado = 'ativo'),
                   'descadastrados', count(*) filter (where estado = 'descadastrado'),
                   'clicaram_grupo', count(*) filter (where estado = 'ativo' and grupo_clicado_em is not null),
                   'com_email', count(*) filter (where estado = 'ativo' and email is not null),
                   'email_pendente', count(*) filter (where estado = 'ativo' and email_estado = 'pendente'),
                   'email_confirmado', count(*) filter (where estado = 'ativo' and email_estado = 'confirmado'),
                   'email_avisado', count(*) filter (where estado = 'ativo' and email_estado = 'avisado'))
                 from public.lista_interesse),
    'por_dia', (with ins as (select (criado_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n from public.lista_interesse
                             where criado_em >= now() - make_interval(days => v_dias + 1) group by 1),
                     con as (select (email_confirmado_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n from public.lista_interesse
                             where email_confirmado_em >= now() - make_interval(days => v_dias + 1) group by 1),
                     gru as (select (grupo_clicado_em at time zone 'America/Sao_Paulo')::date as d, count(*) as n from public.lista_interesse
                             where grupo_clicado_em >= now() - make_interval(days => v_dias + 1) group by 1)
                select coalesce(jsonb_agg(jsonb_build_object('dia', to_char(x.d, 'YYYY-MM-DD'), 'inscritos', coalesce(ins.n, 0),
                                                             'emails_confirmados', coalesce(con.n, 0), 'cliques_grupo', coalesce(gru.n, 0))
                                          order by x.d desc), '[]'::jsonb)
                from (select g::date as d from generate_series((v_hoje - (v_dias - 1))::timestamp, v_hoje::timestamp, interval '1 day') g) x
                left join ins on ins.d = x.d left join con on con.d = x.d left join gru on gru.d = x.d),
    'a_avisar', (select count(*) from public.lista_interesse where estado = 'ativo' and email_estado = 'confirmado' and aviso_na_fila_em is null),
    'aviso', (select jsonb_build_object(
                'na_fila', count(*) filter (where e.status in ('pendente', 'enviando')),
                'enviados', count(*) filter (where e.status = 'enviado'),
                'incertos', count(*) filter (where e.status = 'incerto'),
                'nao_enviados', count(*) filter (where e.status in ('falhou', 'cancelado')),
                'primeiro_em', min(e.created_at))
              from public.email_saida e where e.kind = 'interesse_aviso'),
    'grupo', (select jsonb_build_object('link', c.grupo_link, 'atualizado_em', c.atualizado_em,
                                        'atualizado_por', case when c.grupo_link is null and c.atualizado_por is null then null
                                                               else coalesce(nullif(btrim(p.name), ''), u.email) end)
              from public.lista_interesse_config c left join auth.users u on u.id = c.atualizado_por left join public.profiles p on p.id = c.atualizado_por
              where c.fase = '2a_fase'));
end
$$;

-- Lista com busca (WhatsApp, e-mail ou nome) e filtro.
--   p_filtro: ativos | descadastrados | clicaram_grupo | nao_clicaram_grupo | email_pendente | email_confirmado | email_avisado | sem_email
create or replace function public.lista_interesse_filtro(i public.lista_interesse, p_filtro text) returns boolean
  language sql stable set search_path = ''
as $$
  select case p_filtro
    when 'ativos' then i.estado = 'ativo'
    when 'descadastrados' then i.estado = 'descadastrado'
    when 'clicaram_grupo' then i.estado = 'ativo' and i.grupo_clicado_em is not null
    when 'nao_clicaram_grupo' then i.estado = 'ativo' and i.grupo_clicado_em is null
    when 'email_pendente' then i.estado = 'ativo' and i.email_estado = 'pendente'
    when 'email_confirmado' then i.estado = 'ativo' and i.email_estado = 'confirmado'
    when 'email_avisado' then i.estado = 'ativo' and i.email_estado = 'avisado'
    when 'sem_email' then i.estado = 'ativo' and i.email_estado = 'sem_email'
    else true end
$$;

create or replace function public.lista_interesse_filtro_valido(p_filtro text) returns void
  language plpgsql immutable set search_path = ''
as $$
begin
  if p_filtro is not null and p_filtro not in ('ativos', 'descadastrados', 'clicaram_grupo', 'nao_clicaram_grupo', 'email_pendente',
                                               'email_confirmado', 'email_avisado', 'sem_email') then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
end
$$;

create or replace function public.app_admin_interesse_lista(p_busca text default null, p_filtro text default null,
                                                            p_limite integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_padrao text;
  v_digitos text;
begin
  perform public.assert_admin();
  perform public.lista_interesse_filtro_valido(p_filtro);
  if char_length(v_busca) > 100 then raise exception 'A busca pode ter até 100 letras.' using errcode = '22023'; end if;
  v_padrao := '%' || replace(replace(replace(lower(coalesce(v_busca, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_digitos := nullif(regexp_replace(coalesce(v_busca, ''), '[^0-9]', '', 'g'), '');
  return (
    with f as (
      select i.* from public.lista_interesse i
      where public.lista_interesse_filtro(i, p_filtro)
        and (v_busca is null or coalesce(i.email, '') like v_padrao or lower(coalesce(i.nome, '')) like v_padrao
             or (char_length(v_digitos) >= 3 and i.whatsapp like '%' || v_digitos || '%'))
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'itens', coalesce((select jsonb_agg(public.lista_interesse_admin_linha(x) order by x.criado_em desc, x.id desc)
                         from (select * from f order by criado_em desc, id desc
                               limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'::jsonb)));
end
$$;

-- Exportação (o servidor monta o CSV). Fica no registro da Administração (quem, quando, quantas linhas).
create or replace function public.app_admin_interesse_exportar(p_filtro text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_admin();
  perform public.lista_interesse_filtro_valido(p_filtro);
  select coalesce(jsonb_agg(public.lista_interesse_admin_linha(i) order by i.criado_em, i.id), '[]'::jsonb) into v
  from public.lista_interesse i where public.lista_interesse_filtro(i, p_filtro);
  perform public.admin_log('interesse.exportar', '2a_fase', jsonb_build_object('filtro', p_filtro, 'linhas', jsonb_array_length(v)));
  return v;
end
$$;

-- Link do grupo do WhatsApp (vazio = sem botão). Só convite do WhatsApp: https://chat.whatsapp.com/CÓDIGO (sem "?…").
create or replace function public.app_admin_interesse_grupo_salvar(p_link text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_antes text;
begin
  perform public.assert_admin();
  if v_link is not null and v_link !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$' then
    raise exception 'O link precisa ser um convite de grupo do WhatsApp: https://chat.whatsapp.com/… (sem nada depois do código).' using errcode = '22023';
  end if;
  select grupo_link into v_antes from public.lista_interesse_config where fase = '2a_fase' for update;
  insert into public.lista_interesse_config (fase, grupo_link, atualizado_em, atualizado_por) values ('2a_fase', v_link, now(), (select auth.uid()))
  on conflict (fase) do update set grupo_link = excluded.grupo_link, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;
  perform public.admin_log('interesse.grupo_link', '2a_fase', jsonb_build_object('antes', v_antes, 'depois', v_link));
  return jsonb_build_object('link', v_link);
end
$$;

-- Tirar alguém da lista (pedido pelo WhatsApp, por e-mail ou pelo privacidade@). Cancela o que não saiu.
create or replace function public.app_admin_interesse_tirar(p_id bigint) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.lista_interesse;
begin
  perform public.assert_admin();
  select * into r from public.lista_interesse where id = p_id for update;
  if not found then raise exception 'Inscrição não encontrada.' using errcode = 'P0002'; end if;
  perform public.lista_interesse_descadastrar(p_id, 'equipe');
  perform public.admin_log('interesse.tirar', p_id::text, jsonb_build_object('whatsapp', r.whatsapp));
  return (select public.lista_interesse_admin_linha(i) from public.lista_interesse i where i.id = p_id);
end
$$;

-- Prévia do aviso por e-mail: quantos recebem (e-mail confirmado, ainda fora da fila do aviso).
create or replace function public.app_admin_interesse_aviso_previa() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select jsonb_build_object(
            'destinatarios', count(*) filter (where estado = 'ativo' and email_estado = 'confirmado' and aviso_na_fila_em is null),
            'ja_na_fila_ou_avisados', count(*) filter (where aviso_na_fila_em is not null),
            'email_pendente', count(*) filter (where estado = 'ativo' and email_estado = 'pendente'),
            'so_whatsapp', count(*) filter (where estado = 'ativo' and email_estado = 'sem_email'))
          from public.lista_interesse);
end
$$;

-- "Avisar todos que a 2ª fase abriu" (por e-mail): só e-mails confirmados, uma vez por pessoa (chave única na fila), em lotes pela fila.
-- p_esperado: o número que a prévia mostrou; se mudou, recusa (a pessoa vê a prévia de novo).
create or replace function public.app_admin_interesse_avisar(p_esperado integer) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  n integer;
begin
  perform public.assert_admin();
  select coalesce(array_agg(id), '{}') into v_ids from (
    select id from public.lista_interesse where estado = 'ativo' and email_estado = 'confirmado' and aviso_na_fila_em is null order by id for update) x;
  if cardinality(v_ids) = 0 then
    raise exception 'Não há ninguém com e-mail confirmado esperando o aviso.' using errcode = '22023';
  end if;
  if p_esperado is null or p_esperado <> cardinality(v_ids) then
    raise exception 'O número de pessoas mudou (agora são %). Veja a prévia de novo antes de avisar.', cardinality(v_ids) using errcode = '40001';
  end if;
  insert into public.email_saida (kind, user_id, interessado_id, chave, payload)
  select 'interesse_aviso', null, i, 'interesse_aviso:2a_fase:' || i, '{}'::jsonb from unnest(v_ids) i
  on conflict (chave) do nothing;
  get diagnostics n = row_count;
  update public.lista_interesse set aviso_na_fila_em = now(), atualizado_em = now() where id = any (v_ids);
  perform public.admin_log('interesse.avisar', '2a_fase', jsonb_build_object('emails', n, 'esperado', p_esperado));
  return jsonb_build_object('emails', n);
end
$$;

-- ---------------------------------------------------------------- 8) permissões
do $perm$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname as nome from pg_proc p where p.pronamespace = 'public'::regnamespace
             and (p.proname like 'lista_interesse_%' or p.proname like 'ch_worker_interesse_%' or p.proname like 'app_admin_interesse_%'
                  or p.proname = 'ch_worker_email_pegar') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nome like 'ch_worker_%' then execute format('grant execute on function %s to service_role', f.sig); end if;
    if f.nome like 'app_admin_interesse_%' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end
$perm$;

-- ---------------------------------------------------------------- 9) conferência final (se algo não bater, PARA com erro)
do $confere_fim$
declare t text;
begin
  foreach t in array array['lista_interesse', 'lista_interesse_tentativas', 'lista_interesse_config'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'lista-interesse 013960: proteção (RLS) desligada em %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('anon', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'update') or has_table_privilege('authenticated', 'public.' || t, 'update') then
      raise exception 'lista-interesse 013960: aluno ou visitante com acesso direto a %', t;
    end if;
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
               and (p.proname like 'ch_worker_interesse_%' or p.proname like 'lista_interesse_%' or p.proname = 'ch_worker_email_pegar')
               and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception 'lista-interesse 013960: aluno ou visitante executa função interna da lista';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'app_admin_interesse_%'
               and (has_function_privilege('anon', p.oid, 'execute') or not p.prosecdef or position('assert_admin()' in p.prosrc) = 0)) then
    raise exception 'lista-interesse 013960: função da Administração aberta ao visitante ou sem assert_admin';
  end if;
  if position('interesse_confirmar' in (select prosrc from pg_proc where oid = 'public.ch_worker_email_pegar(integer)'::regprocedure)) = 0
     or position('email_saida_teto_dia' in (select prosrc from pg_proc where oid = 'public.ch_worker_email_pegar(integer)'::regprocedure)) = 0 then
    raise exception 'lista-interesse 013960: a fila de e-mail não entrega a lista de interesse ou perdeu o limite do dia';
  end if;
  if public.lista_interesse_whatsapp('(11) 98765-4321') is distinct from '+5511987654321'
     or public.lista_interesse_whatsapp('+595 981 123456') is distinct from '+595981123456'
     or public.lista_interesse_whatsapp('12345') is not null then
    raise exception 'lista-interesse 013960: a validação do WhatsApp não está certa';
  end if;
end
$confere_fim$;
