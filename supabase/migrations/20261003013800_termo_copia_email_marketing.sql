-- =============================================================================
-- 013800 — Contrato 3.0: cópia do contrato por e-mail e caixa opcional de marketing (pedido do dono, 17/10/2026; ramo termo-funcoes)
--
-- 1) CÓPIA DO CONTRATO POR E-MAIL (Contrato 3.0, cláusulas 6.4 e 6.6; Política 3.0, seção 9.7)
--    Cada aceite do Contrato 3.0 em diante (cadastro, Google ou tela de aceite) põe UM e-mail na fila public.email_saida, por um
--    gatilho na prova do aceite (legal_acceptances). O envio é feito FORA do aceite, pelo servidor (tarefa agendada a cada 5 minutos,
--    rota /api/legal/email), com as funções ch_worker_email_pegar / ch_worker_email_marcar (só serviço). Assim:
--      * a tela nunca espera o e-mail; se o gatilho falhar por qualquer motivo, o aceite é gravado do mesmo jeito;
--      * sem duplicar: um e-mail por aceite (chave única 'contrato:<id do aceite>'); um envio que parou no meio vira "incerto" e não
--        é repetido;
--      * nova tentativa: falha antes de o servidor de e-mail aceitar a mensagem volta para a fila (5 min, 30 min, 2 h, 12 h; na 5ª,
--        "falhou");
--      * conta com e-mail ainda não confirmado: espera a confirmação (até 7 dias; depois, "cancelado");
--      * sem as variáveis SMTP no servidor, nada sai: os e-mails ficam na fila, "pendente".
--    Só versões com texto guardado pelo sistema (legal_texts, 3.0 em diante). Aceites anteriores a esta migração não recebem e-mail.
--
-- 2) CAIXA OPCIONAL DE MARKETING (Contrato 3.0, cláusulas 6.2 e 32; Política 3.0: "Marketing — até você retirar o consentimento")
--    public.marketing_consents: a escolha atual (uma linha por conta) e public.marketing_consent_log: o histórico (cada marcação ou
--    retirada com data, hora, origem e o texto mostrado), prova do consentimento (LGPD, art. 8º, § 2º). Nunca obrigatória: quem não
--    marca não tem linha nenhuma (= não recebe). Caminhos:
--      * cadastro por e-mail: a caixa separada e DESMARCADA manda marketing_opt_in = "true" nos metadados da conta; o gatilho
--        on_auth_user_marketing grava. Sem a caixa marcada, nada é gravado;
--      * cadastro com Google: a tela de aceite, na volta, chama app_marketing_set(true, 'cadastro_google') se a caixa estava marcada;
--      * Minha Conta → Privacidade e dados: chave para ligar e desligar (app_marketing_set(…, 'minha_conta')).
--    Ainda não há envio de e-mail de marketing; quando houver, só para opt_in = true e com link de descadastro (cláusula 32.2).
--
-- ORDEM: depois da 013740 (Termo 3.0) aplicada. Pode ser colada duas vezes. Conferência no fim (se algo não bater, PARA com erro).
-- Desfazer: supabase/desfazer/20261003013800_termo_copia_email_marketing.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- 0) o banco tem o que esta migração espera
do $confere$
begin
  if to_regclass('public.legal_texts') is null or to_regclass('public.legal_acceptances') is null
     or to_regprocedure('public.app_my_legal_documents()') is null then
    raise exception 'termo-funcoes 013800: aplique antes a 20261003013740_termo_v3.sql; nada foi mudado';
  end if;
end
$confere$;

-- ---------------------------------------------------------------- 1) fila de e-mails de serviço
create table if not exists public.email_saida (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('contrato_copia', 'aviso_inatividade')),
  user_id uuid not null references auth.users (id) on delete cascade,
  acceptance_id bigint references public.legal_acceptances (id) on delete cascade,
  chave text not null unique,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'incerto', 'cancelado')),
  tentativas smallint not null default 0,
  proxima_em timestamptz not null default now(),
  pego_em timestamptz,
  enviado_em timestamptz,
  erro text check (char_length(erro) <= 300),
  created_at timestamptz not null default now(),
  check (kind <> 'contrato_copia' or acceptance_id is not null)
);
comment on table public.email_saida is
  'Fila dos e-mails de serviço (cópia do contrato aceito, aviso de conta inativa). Um por chave (não duplica). Enviados pelo servidor '
  '(ch_worker_email_pegar / ch_worker_email_marcar). Sem acesso do navegador. Apagada junto com a conta.';
create index if not exists email_saida_fila_idx on public.email_saida (proxima_em, id) where status = 'pendente';
create index if not exists email_saida_user_idx on public.email_saida (user_id);
alter table public.email_saida enable row level security;
revoke all on table public.email_saida from public, anon, authenticated;

-- E-mail da conta confirmado? (com "Confirm email" desligado no Supabase, a conta já nasce confirmada). Banco sem a coluna
-- (ensaio local): conta como confirmado.
create or replace function public.email_conta_confirmada(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select case when to_jsonb(u) ? 'email_confirmed_at' then (to_jsonb(u) ->> 'email_confirmed_at') is not null else true end
                   from auth.users u where u.id = p_user), false)
$$;

-- Gatilho na prova do aceite: o aceite do Contrato (3.0 em diante, com texto guardado) põe a cópia na fila. Nunca impede o aceite.
create or replace function public.legal_copia_na_fila() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.document = 'termo_uso' and new.user_id is not null and new.origin in ('cadastro', 'google', 'tela_aceite')
     and exists (select 1 from public.legal_texts t where t.document = new.document and t.version = new.version) then
    begin
      insert into public.email_saida (kind, user_id, acceptance_id, chave)
      values ('contrato_copia', new.user_id, new.id, 'contrato:' || new.id)
      on conflict (chave) do nothing;
    exception when others then
      raise warning 'cópia do contrato não entrou na fila (aceite %): %', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;
drop trigger if exists legal_copia_na_fila on public.legal_acceptances;
create trigger legal_copia_na_fila after insert on public.legal_acceptances
  for each row execute function public.legal_copia_na_fila();

-- Pega um lote para enviar (só serviço). Marca "enviando" e devolve o que o e-mail precisa. Antes: envio parado há 15 min vira
-- "incerto" (não repete) e conta sem e-mail confirmado há 7 dias desiste ("cancelado").
-- Aviso de conta inativa: o prazo (a partir de quando a conta é apagada ou os Coins zerados) é calculado AQUI, na hora do envio:
-- o maior entre 12 meses do último acesso e 31 dias depois de hoje (horário de Brasília), e fica no payload.
create or replace function public.ch_worker_email_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.email_saida
     set status = 'incerto', erro = 'O envio parou no meio; não foi repetido para não mandar duas vezes.'
   where status = 'enviando' and pego_em < now() - interval '15 minutes';

  update public.email_saida e
     set status = 'cancelado', erro = 'E-mail da conta não confirmado em 7 dias.'
   where e.status = 'pendente' and e.created_at < now() - interval '7 days' and not public.email_conta_confirmada(e.user_id);

  select array_agg(x.id) into v_ids
  from (
    select e.id
    from public.email_saida e
    where e.status = 'pendente' and e.proxima_em <= now() and public.email_conta_confirmada(e.user_id)
    order by e.proxima_em, e.id
    limit greatest(1, least(coalesce(p_limite, 20), 100))
    for update of e skip locked
  ) x;
  if v_ids is null then
    return '[]'::jsonb;
  end if;

  update public.email_saida e
     set status = 'enviando', pego_em = now(), tentativas = e.tentativas + 1,
         payload = case when e.kind = 'aviso_inatividade' then e.payload || jsonb_build_object('prazo',
                     to_char(greatest(((e.payload ->> 'ultimo_acesso')::timestamptz at time zone 'America/Sao_Paulo')::date + interval '12 months' + interval '1 day',
                                      v_hoje + 31), 'YYYY-MM-DD'))
                    else e.payload end
   where e.id = any (v_ids);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'kind', e.kind, 'tentativas', e.tentativas, 'email', u.email,
             'nome', nullif(btrim(p.name), ''), 'payload', e.payload,
             'contrato', case when e.kind = 'contrato_copia' then jsonb_build_object(
                 'document', a.document, 'version', a.version, 'accepted_at', a.accepted_at, 'origin', a.origin,
                 'text_sha256', a.text_sha256, 'title', t.title, 'body', t.body, 'companions', coalesce(a.companions, '{}'::jsonb)) end)
           order by e.id)
    from public.email_saida e
    join auth.users u on u.id = e.user_id
    left join public.profiles p on p.id = e.user_id
    left join public.legal_acceptances a on a.id = e.acceptance_id
    left join public.legal_texts t on t.document = a.document and t.version = a.version
    where e.id = any (v_ids)), '[]'::jsonb);
end
$$;

-- Resultado de um envio (só serviço). p_resultado:
--   'enviado'        o servidor de e-mail aceitou a mensagem;
--   'tentar_de_novo' falhou ANTES de a mensagem ser aceita (conexão, login, recusa): volta para a fila (5 min, 30 min, 2 h, 12 h);
--                    na 5ª tentativa, "falhou";
--   'incerto'        caiu depois de a mensagem ter sido mandada: não repete (pode ter chegado);
--   'cancelado'      não dá para mandar (sem e-mail, texto sumiu).
create or replace function public.ch_worker_email_marcar(p_id bigint, p_resultado text, p_erro text default null) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tent smallint;
  v_status text;
begin
  if p_resultado not in ('enviado', 'tentar_de_novo', 'incerto', 'cancelado') then
    raise exception 'Resultado inválido: %', p_resultado using errcode = '22023';
  end if;
  select e.tentativas into v_tent from public.email_saida e where e.id = p_id and e.status = 'enviando' for update;
  if not found then
    return null;
  end if;
  v_status := case p_resultado
                when 'enviado' then 'enviado'
                when 'tentar_de_novo' then case when v_tent >= 5 then 'falhou' else 'pendente' end
                else p_resultado end;
  update public.email_saida e
     set status = v_status,
         enviado_em = case when v_status = 'enviado' then now() end,
         erro = case when v_status = 'enviado' then null else left(p_erro, 300) end,
         proxima_em = case when v_status = 'pendente'
                        then now() + (array[interval '5 minutes', interval '30 minutes', interval '2 hours', interval '12 hours'])[greatest(1, least(v_tent, 4))]
                        else e.proxima_em end
   where e.id = p_id;
  return v_status;
end
$$;

-- ---------------------------------------------------------------- 2) marketing: escolha atual e histórico
create table if not exists public.marketing_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  opt_in boolean not null,
  origin text not null check (origin in ('cadastro', 'cadastro_google', 'minha_conta', 'link_email')),
  updated_at timestamptz not null default now()
);
comment on table public.marketing_consents is
  'Comunicações promocionais por e-mail (Contrato 3.0, cláusulas 6.2 e 32): a escolha atual da pessoa. Sem linha = não recebe. '
  'Lida e gravada só por app_marketing_get / app_marketing_set e pelo gatilho do cadastro.';
alter table public.marketing_consents enable row level security;
revoke all on table public.marketing_consents from public, anon, authenticated;

create table if not exists public.marketing_consent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  opt_in boolean not null,
  origin text not null check (origin in ('cadastro', 'cadastro_google', 'minha_conta', 'link_email')),
  texto text not null check (char_length(texto) <= 300),
  at timestamptz not null default now()
);
comment on table public.marketing_consent_log is
  'Histórico do consentimento de marketing (prova, LGPD art. 8º, § 2º): cada marcação ou retirada com data, hora, origem e o texto mostrado.';
create index if not exists marketing_consent_log_user_idx on public.marketing_consent_log (user_id, at desc);
alter table public.marketing_consent_log enable row level security;
revoke all on table public.marketing_consent_log from public, anon, authenticated;

-- O texto da caixa (cadastro) e da chave (Minha Conta), guardado no histórico.
create or replace function public.marketing_texto(p_origin text) returns text
  language sql immutable set search_path = ''
as $$
  select case when p_origin in ('cadastro', 'cadastro_google') then 'Quero receber novidades e ofertas por e-mail.'
              when p_origin = 'link_email' then 'Descadastro pelo link do e-mail.'
              else 'Minha Conta: receber novidades e ofertas por e-mail.' end
$$;

create or replace function public.marketing_gravar(p_user uuid, p_opt_in boolean, p_origin text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or p_opt_in is null then
    return;
  end if;
  -- só grava (e põe no histórico) se mudou
  if exists (select 1 from public.marketing_consents c where c.user_id = p_user and c.opt_in = p_opt_in) then
    return;
  end if;
  if not exists (select 1 from public.marketing_consents c where c.user_id = p_user) and not p_opt_in then
    return; -- sem linha já é "não recebe"
  end if;
  insert into public.marketing_consents (user_id, opt_in, origin, updated_at) values (p_user, p_opt_in, p_origin, now())
  on conflict (user_id) do update set opt_in = excluded.opt_in, origin = excluded.origin, updated_at = excluded.updated_at;
  insert into public.marketing_consent_log (user_id, opt_in, origin, texto) values (p_user, p_opt_in, p_origin, public.marketing_texto(p_origin));
end
$$;

-- Cadastro por e-mail: a caixa marcada vem nos metadados (marketing_opt_in = "true"). Nunca impede a criação da conta.
create or replace function public.marketing_no_cadastro() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', '') = 'true' then
    begin
      perform public.marketing_gravar(new.id, true, 'cadastro');
    exception when others then
      raise warning 'marketing do cadastro não gravado (%): %', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;
drop trigger if exists on_auth_user_marketing on auth.users;
create trigger on_auth_user_marketing after insert on auth.users
  for each row execute function public.marketing_no_cadastro();

create or replace function public.app_marketing_get() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((select jsonb_build_object('opt_in', c.opt_in, 'updated_at', c.updated_at, 'origin', c.origin)
                   from public.marketing_consents c where c.user_id = v_user),
                  jsonb_build_object('opt_in', false, 'updated_at', null, 'origin', null));
end
$$;

create or replace function public.app_marketing_set(p_opt_in boolean, p_origin text default 'minha_conta') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_opt_in is null or coalesce(p_origin, '') not in ('minha_conta', 'cadastro_google') then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  perform public.marketing_gravar(v_user, p_opt_in, p_origin);
  return public.app_marketing_get();
end
$$;

-- ---------------------------------------------------------------- 3) permissões
revoke execute on function public.email_conta_confirmada(uuid) from public, anon, authenticated;
revoke execute on function public.legal_copia_na_fila() from public, anon, authenticated;
revoke execute on function public.ch_worker_email_pegar(integer) from public, anon, authenticated;
revoke execute on function public.ch_worker_email_marcar(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.marketing_texto(text) from public, anon, authenticated;
revoke execute on function public.marketing_gravar(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.marketing_no_cadastro() from public, anon, authenticated;
revoke execute on function public.app_marketing_get() from public, anon;
revoke execute on function public.app_marketing_set(boolean, text) from public, anon;
grant execute on function public.app_marketing_get() to authenticated;
grant execute on function public.app_marketing_set(boolean, text) to authenticated;
grant execute on function public.ch_worker_email_pegar(integer) to service_role;
grant execute on function public.ch_worker_email_marcar(bigint, text, text) to service_role;

-- ---------------------------------------------------------------- 4) conferência final (se algo não bater, PARA com erro)
do $confere_fim$
begin
  if not exists (select 1 from pg_trigger where tgname = 'legal_copia_na_fila' and tgrelid = 'public.legal_acceptances'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'on_auth_user_marketing' and tgrelid = 'auth.users'::regclass) then
    raise exception 'termo-funcoes 013800: gatilho não ficou no lugar';
  end if;
  if has_function_privilege('anon', 'public.ch_worker_email_pegar(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.ch_worker_email_pegar(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.ch_worker_email_marcar(bigint, text, text)', 'execute')
     or has_function_privilege('anon', 'public.app_marketing_set(boolean, text)', 'execute')
     or has_table_privilege('authenticated', 'public.email_saida', 'select')
     or has_table_privilege('authenticated', 'public.marketing_consents', 'insert')
     or has_table_privilege('anon', 'public.marketing_consent_log', 'select') then
    raise exception 'termo-funcoes 013800: permissão aberta demais';
  end if;
  if not has_function_privilege('authenticated', 'public.app_marketing_set(boolean, text)', 'execute') then
    raise exception 'termo-funcoes 013800: a chave de marketing ficou sem permissão para o aluno';
  end if;
end
$confere_fim$;
