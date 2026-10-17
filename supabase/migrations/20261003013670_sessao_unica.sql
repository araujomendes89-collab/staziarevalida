-- =============================================================================
-- Sessão única: UMA SESSÃO ATIVA POR VEZ em cada conta (decisão do dono, 17/10/2026)
--
-- Objetivo: duas pessoas não estudarem ao mesmo tempo com o mesmo login. Quando a conta entra num segundo aparelho ou
-- navegador, o primeiro sai sozinho com o aviso "Sua conta foi aberta em outro aparelho" (e um botão para entrar de novo,
-- que por sua vez derruba o outro).
--
-- COMO FUNCIONA
--  - "Sessão" = a sessão de login do Supabase (claim session_id do token). Todas as abas do mesmo navegador usam o mesmo
--    login, então contam como UM aparelho. Sem session_id no token (só no banco local de desenvolvimento) vale o
--    p_session_id que o app gera e guarda no navegador. Com session_id no token, o p_session_id é IGNORADO: ninguém se
--    declara dono de outra sessão.
--  - app_sessao_vigente: uma linha por conta com a sessão que vale agora (guardada como md5, nunca o token), o aparelho
--    resumido (ex.: "Chrome · Windows", até 60 caracteres), quando entrou e quando foi visto pela última vez.
--  - app_sessao_derrubada: as sessões que já perderam a vez. Uma sessão derrubada NUNCA volta a valer (nem recarregando a
--    página): para voltar é preciso entrar de novo (login novo = sessão nova).
--  - app_session_claim(p_session_id, p_device): "estou aqui". Sessão nova vira a vigente e a anterior vai para as
--    derrubadas. Sessão derrubada recebe vigente = false.
--  - app_session_check(p_session_id, p_device): "ainda sou eu?". Mesma regra (uma sessão que o banco ainda não conhece,
--    por exemplo aberta antes de a regra ser ligada, passa a valer e derruba a outra; a derrubada nunca volta).
--  - Nenhum IP é guardado. Nada de nome, e-mail ou localização: só o aparelho resumido e os horários.
--
-- CHAVE (app_settings 'sessao_unica'), nasce DESLIGADA:
--   { "ativa": false, "incluir_equipe": false, "incluir_revisores": false }
--   ativa             = liga a regra para os alunos. Desligada: claim e check respondem vigente = true e não gravam nada.
--   incluir_equipe    = a regra vale também para administrador e editor (padrão: não, para trabalhar em vários aparelhos).
--   incluir_revisores = a regra vale também para revisor médico (quem tem área em ch_reviewer_areas). Padrão: não.
--   Ligar:    update public.app_settings set value = jsonb_set(value, '{ativa}', 'true'), updated_at = now() where key = 'sessao_unica';
--   Desligar: update public.app_settings set value = jsonb_set(value, '{ativa}', 'false'), updated_at = now() where key = 'sessao_unica';
--   (ou, como administrador logado: select public.app_admin_sessao_unica('{"ativa": true}'::jsonb);)
--
-- SEGURANÇA
--  - Funções SECURITY DEFINER com search_path vazio; só gravam a linha de auth.uid() (não há parâmetro de usuário).
--  - Visitante (sem login) é recusado. O aluno não grava nas tabelas direto (sem insert/update/delete); lê só a própria
--    linha da vigente (é o que o Realtime usa para avisar o aparelho derrubado na hora). A tabela de derrubadas não é lida
--    pelo navegador.
--  - Funções internas (sessao_unica_*) sem execute para o navegador.
--
-- FUNÇÕES REDEFINIDAS: nenhuma. Só a constraint app_settings_key_check, refeita como a UNIÃO das chaves conhecidas com as
-- que já estão gravadas (padrão da 013490): colar esta migração nunca recusa uma chave já existente.
-- Pode ser colada duas vezes (if not exists / create or replace / on conflict do nothing).
--
-- COMO DESFAZER (nesta ordem):
--   alter publication supabase_realtime drop table public.app_sessao_vigente;   -- se estiver na publicação
--   drop function if exists public.app_admin_sessao_unica(jsonb);
--   drop function if exists public.app_session_check(text, text);
--   drop function if exists public.app_session_claim(text, text);
--   drop function if exists public.sessao_unica_assumir(text, text, interval);
--   drop function if exists public.sessao_unica_vale(uuid);
--   drop function if exists public.sessao_unica_id(text);
--   drop table if exists public.app_sessao_derrubada;
--   drop table if exists public.app_sessao_vigente;
--   delete from public.app_settings where key = 'sessao_unica';   -- a constraint pode ficar (só aceita a chave a mais)
--   O site antigo não chama nada disto; o site novo, sem as funções, segue funcionando (o app ignora a falha e não derruba).
-- =============================================================================

-- ---------------------------------------------------------------- 1) chave de configuração
do $$
declare
  v_keys text[];
begin
  select coalesce(array_agg(distinct k order by k), '{}') into v_keys
    from (
      select unnest(array['trial_days', 'announcement', 'simulado_ineditas_pct', 'sessao_unica']) as k
      union
      select key from public.app_settings
    ) x;
  alter table public.app_settings drop constraint if exists app_settings_key_check;
  execute format('alter table public.app_settings add constraint app_settings_key_check check (key in (%s))',
                 (select string_agg(quote_literal(k), ', ') from unnest(v_keys) k));
end
$$;

insert into public.app_settings (key, value)
values ('sessao_unica', '{"ativa": false, "incluir_equipe": false, "incluir_revisores": false}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2) tabelas
create table if not exists public.app_sessao_vigente (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sessao text not null check (sessao ~ '^[0-9a-f]{32}$'),
  aparelho text not null default '' check (char_length(aparelho) <= 60),
  criada_em timestamptz not null default now(),
  visto_em timestamptz not null default now()
);
comment on table public.app_sessao_vigente is
  'Sessão única: a sessão de login que vale agora em cada conta (md5 da identificação da sessão, nunca o token), o aparelho resumido e os horários. Sem IP.';

create table if not exists public.app_sessao_derrubada (
  user_id uuid not null references auth.users (id) on delete cascade,
  sessao text not null check (sessao ~ '^[0-9a-f]{32}$'),
  aparelho text not null default '' check (char_length(aparelho) <= 60),
  derrubada_em timestamptz not null default now(),
  primary key (user_id, sessao)
);
comment on table public.app_sessao_derrubada is
  'Sessão única: sessões que perderam a vez (nunca voltam a valer). Gravada só pelas funções app_session_*.';

alter table public.app_sessao_vigente enable row level security;
alter table public.app_sessao_derrubada enable row level security;

drop policy if exists "sessão vigente: a própria" on public.app_sessao_vigente;
create policy "sessão vigente: a própria" on public.app_sessao_vigente
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.app_sessao_vigente from public, anon, authenticated;
grant select on table public.app_sessao_vigente to authenticated;
revoke all on table public.app_sessao_derrubada from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) funções internas
-- Identificação da sessão: a do token (session_id) quando existe; senão a que o app mandou (banco local). Devolve o md5.
create or replace function public.sessao_unica_id(p_session_id text) returns text
  language plpgsql stable set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sid text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_sid := nullif(btrim(coalesce(v_claims ->> 'session_id', '')), '');
  if v_sid is null then
    v_sid := nullif(btrim(coalesce(p_session_id, '')), '');
  end if;
  if v_sid is null or v_sid !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'Sessão inválida.' using errcode = '22023';
  end if;
  return md5(v_sid);
end
$$;

-- A regra vale para esta conta agora? (chave ligada; equipe e revisor médico só se a chave mandar incluir)
create or replace function public.sessao_unica_vale(p_uid uuid) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_role text;
begin
  select s.value into v_cfg from public.app_settings s where s.key = 'sessao_unica';
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or coalesce(v_cfg ->> 'ativa', 'false') <> 'true' then
    return false;
  end if;
  select r.role::text into v_role from public.user_roles r where r.user_id = p_uid;
  if v_role in ('admin', 'editor') and coalesce(v_cfg ->> 'incluir_equipe', 'false') <> 'true' then
    return false;
  end if;
  if coalesce(v_cfg ->> 'incluir_revisores', 'false') <> 'true'
     and to_regclass('public.ch_reviewer_areas') is not null
     and exists (select 1 from public.ch_reviewer_areas ra where ra.user_id = p_uid) then
    return false;
  end if;
  return true;
end
$$;

-- "Estou aqui": sessão nova vira a vigente (a anterior vai para as derrubadas); derrubada responde vigente = false.
-- p_toque: só atualiza visto_em se a última visita tiver mais que este intervalo (evita uma gravação a cada conferência).
create or replace function public.sessao_unica_assumir(p_session_id text, p_device text, p_toque interval) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_hash text;
  v_device text;
  v_cur public.app_sessao_vigente;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if not public.sessao_unica_vale(v_uid) then
    return jsonb_build_object('vigente', true, 'regra', false);
  end if;
  v_hash := public.sessao_unica_id(p_session_id);
  -- aparelho resumido: sem caracteres de controle, até 60 caracteres
  v_device := left(btrim(regexp_replace(coalesce(p_device, ''), '[[:cntrl:]]+', ' ', 'g')), 60);

  -- a mesma conta entrando em dois aparelhos ao mesmo tempo: um de cada vez
  insert into public.app_sessao_vigente (user_id, sessao, aparelho) values (v_uid, v_hash, v_device)
  on conflict (user_id) do nothing;
  select * into v_cur from public.app_sessao_vigente where user_id = v_uid for update;

  if v_cur.sessao = v_hash then
    if v_cur.visto_em < now() - p_toque or (v_cur.aparelho = '' and v_device <> '') then
      update public.app_sessao_vigente
         set visto_em = now(), aparelho = case when aparelho = '' then v_device else aparelho end
       where user_id = v_uid;
    end if;
    return jsonb_build_object('vigente', true, 'regra', true);
  end if;

  if exists (select 1 from public.app_sessao_derrubada d where d.user_id = v_uid and d.sessao = v_hash) then
    return jsonb_build_object('vigente', false, 'regra', true, 'aparelho', nullif(v_cur.aparelho, ''), 'desde', v_cur.criada_em);
  end if;

  insert into public.app_sessao_derrubada (user_id, sessao, aparelho) values (v_uid, v_cur.sessao, v_cur.aparelho)
  on conflict (user_id, sessao) do nothing;
  update public.app_sessao_vigente
     set sessao = v_hash, aparelho = v_device, criada_em = now(), visto_em = now()
   where user_id = v_uid;
  -- guarda só o que serve: derrubadas de mais de 400 dias saem (o login do Supabase não dura tanto sem uso)
  delete from public.app_sessao_derrubada d where d.user_id = v_uid and d.derrubada_em < now() - interval '400 days';
  return jsonb_build_object('vigente', true, 'regra', true, 'derrubou', true);
end
$$;

-- ---------------------------------------------------------------- 4) funções do app
-- Ao entrar ou abrir o app com sessão.
create or replace function public.app_session_claim(p_session_id text, p_device text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  return public.sessao_unica_assumir(p_session_id, p_device, interval '1 minute');
end
$$;

-- Conferência periódica (a cada 60 s, ao voltar à aba, no aviso do Realtime) e nas rotas de IA do servidor.
create or replace function public.app_session_check(p_session_id text default null, p_device text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  return public.sessao_unica_assumir(p_session_id, p_device, interval '5 minutes');
end
$$;

-- Administrador: lê e (com p_patch) muda a chave. Só aceita as três opções, sempre verdadeiro/falso.
create or replace function public.app_admin_sessao_unica(p_patch jsonb default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_key text;
begin
  perform public.assert_admin();
  select s.value into v_cfg from public.app_settings s where s.key = 'sessao_unica';
  v_cfg := coalesce(v_cfg, '{"ativa": false, "incluir_equipe": false, "incluir_revisores": false}'::jsonb);
  if p_patch is not null then
    if jsonb_typeof(p_patch) <> 'object' then
      raise exception 'Configuração inválida.' using errcode = '22023';
    end if;
    for v_key in select jsonb_object_keys(p_patch) loop
      if v_key not in ('ativa', 'incluir_equipe', 'incluir_revisores') or jsonb_typeof(p_patch -> v_key) <> 'boolean' then
        raise exception 'Configuração inválida: %.', v_key using errcode = '22023';
      end if;
    end loop;
    v_cfg := v_cfg || p_patch;
    insert into public.app_settings (key, value, updated_at, updated_by)
    values ('sessao_unica', v_cfg, now(), (select auth.uid()))
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
    perform public.admin_log('settings.sessao_unica', null, p_patch);
  end if;
  return v_cfg;
end
$$;

revoke execute on function public.sessao_unica_id(text) from public, anon, authenticated;
revoke execute on function public.sessao_unica_vale(uuid) from public, anon, authenticated;
revoke execute on function public.sessao_unica_assumir(text, text, interval) from public, anon, authenticated;
revoke execute on function public.app_session_claim(text, text) from public, anon;
revoke execute on function public.app_session_check(text, text) from public, anon;
revoke execute on function public.app_admin_sessao_unica(jsonb) from public, anon;
grant execute on function public.app_session_claim(text, text) to authenticated;
grant execute on function public.app_session_check(text, text) to authenticated;
grant execute on function public.app_admin_sessao_unica(jsonb) to authenticated;

-- ---------------------------------------------------------------- 5) Realtime: o aparelho derrubado fica sabendo na hora
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_sessao_vigente') then
    alter publication supabase_realtime add table public.app_sessao_vigente;
  end if;
end
$$;
