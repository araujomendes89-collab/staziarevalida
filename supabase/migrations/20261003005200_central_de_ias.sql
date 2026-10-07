-- =============================================================================
-- Central de IAs (Administração › Central de IAs, só administrador): qual IA e qual modelo cada função usa, em que
-- modo (sozinha, linha de produção ou comitê), preços, tetos de gasto e o registro de cada chamada.
-- Spec: docs/superpowers/specs/2026-10-07-central-de-ias-design.md (seções 5, 6 e 10).
--
--   o administrador liga as IAs e escolhe as funções na tela  →  o servidor grava pelas funções ch_worker_ai_*
--   →  o maestro (servidor) lê a configuração, chama as IAs e registra cada chamada em ai_calls
--   →  o gasto do mês (fuso de Brasília) alimenta os tetos e o painel.
--
-- Regras no banco (não só na tela):
--   * as 4 IAs (anthropic, openai, gemini, ollama) começam DESLIGADAS; tetos e seletor nas abas também;
--   * ligar uma IA registra quem e quando (a autorização) e vai para admin_audit_log;
--   * só o administrador grava (user_roles.role = 'admin'); a tabela é lida só por administrador (RLS) e escrita só
--     pelas funções do servidor;
--   * ai_functions começa vazia: ausência de linha = a função usa as variáveis de ambiente de hoje;
--   * a regra de independência entre criadora e conferentes é conferida no servidor (maestro), não aqui.
-- Valores de ai_functions.mode: 'sozinha' | 'linha_producao' | 'comite'. care: 'rapido' | 'caprichado'.
-- Nada aqui escreve conteúdo clínico: tudo continua rascunho até a aprovação de uma pessoa.
-- =============================================================================

-- ---------------------------------------------------------------- tabelas
create table public.ai_providers (
  id text primary key check (id in ('anthropic', 'openai', 'gemini', 'ollama')),
  enabled boolean not null default false,
  enabled_by uuid references auth.users (id) on delete set null,
  enabled_at timestamptz,
  -- [{id, label}]
  models jsonb not null default '[]'::jsonb check (jsonb_typeof(models) = 'array'),
  models_refreshed_at timestamptz,
  last_status text check (char_length(last_status) <= 60),
  last_status_detail text check (char_length(last_status_detail) <= 500),
  updated_at timestamptz not null default now()
);

create table public.ai_model_prices (
  provider text not null check (provider in ('anthropic', 'openai', 'gemini', 'ollama')),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  input_per_mtok numeric(12, 4) not null check (input_per_mtok >= 0),
  output_per_mtok numeric(12, 4) not null check (output_per_mtok >= 0),
  source_url text check (char_length(source_url) <= 500),
  checked_on date,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);

create table public.ai_functions (
  key text primary key check (key in ('criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar')),
  mode text not null check (mode in ('sozinha', 'linha_producao', 'comite')),
  -- {provider, model}
  primary_ref jsonb check (primary_ref is null or jsonb_typeof(primary_ref) = 'object'),
  fallback_ref jsonb check (fallback_ref is null or jsonb_typeof(fallback_ref) = 'object'),
  -- conferentes (linha de produção) ou membros (comitê): lista de {provider, model}, no máximo 4
  reviewers jsonb not null default '[]'::jsonb check (jsonb_typeof(reviewers) = 'array' and jsonb_array_length(reviewers) <= 4),
  care text not null default 'rapido' check (care in ('rapido', 'caprichado')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Linha única.
create table public.ai_settings (
  id boolean primary key default true check (id),
  monthly_cap_usd numeric(12, 2) check (monthly_cap_usd is null or monthly_cap_usd >= 0),
  per_run_cap_usd numeric(12, 2) check (per_run_cap_usd is null or per_run_cap_usd >= 0),
  caps_enabled boolean not null default false,
  tab_override_enabled boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.ai_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- uma execução = um pedido ao maestro, com todas as IAs que ele chamar
  run_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  function_key text not null check (char_length(function_key) between 1 and 60),
  mode text not null check (mode in ('sozinha', 'linha_producao', 'comite')),
  role text not null check (role in ('principal', 'reserva', 'criadora', 'conferente', 'membro')),
  provider text not null check (provider in ('anthropic', 'openai', 'gemini', 'ollama')),
  model text not null check (char_length(model) between 1 and 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  outcome text not null check (outcome in ('ok', 'falha', 'teto', 'bloqueada')),
  -- de onde veio o pedido (Central, aula, podcast…) e o item
  source text check (char_length(source) <= 60),
  item_id text check (char_length(item_id) <= 120),
  error text check (char_length(error) <= 1000)
);
create index ai_calls_created_idx on public.ai_calls (created_at desc);
create index ai_calls_function_idx on public.ai_calls (function_key, created_at desc);

-- ---------------------------------------------------------------- carga inicial
insert into public.ai_providers (id) values ('anthropic'), ('openai'), ('gemini'), ('ollama');
insert into public.ai_settings (id) values (true);

-- ---------------------------------------------------------------- RLS: leitura só do administrador; escrita só pelas funções
alter table public.ai_providers enable row level security;
alter table public.ai_model_prices enable row level security;
alter table public.ai_functions enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_calls enable row level security;
create policy "IAs: administrador lê" on public.ai_providers for select to authenticated using (public.is_admin());
create policy "preços de IA: administrador lê" on public.ai_model_prices for select to authenticated using (public.is_admin());
create policy "funções de IA: administrador lê" on public.ai_functions for select to authenticated using (public.is_admin());
create policy "ajustes de IA: administrador lê" on public.ai_settings for select to authenticated using (public.is_admin());
create policy "chamadas de IA: administrador lê" on public.ai_calls for select to authenticated using (public.is_admin());
-- escrita só pelas funções abaixo (servidor)

-- ---------------------------------------------------------------- apoio
-- Quem grava precisa ser administrador (mesmo texto de assert_admin()).
create function public.ai_assert_admin_actor(p_actor uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_actor is null or not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
end
$$;

-- {provider, model} válido? (IA entre as 4, modelo com 1 a 120 caracteres)
create function public.ai_valid_ref(p_ref jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select p_ref is not null and jsonb_typeof(p_ref) = 'object'
     and (p_ref ->> 'provider') in ('anthropic', 'openai', 'gemini', 'ollama')
     and jsonb_typeof(p_ref -> 'model') = 'string'
     and char_length(btrim(p_ref ->> 'model')) between 1 and 120
$$;

-- ---------------------------------------------------------------- leitura para o servidor
create function public.ch_worker_ai_config() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'providers', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.ai_providers p), '[]'::jsonb),
    'functions', coalesce((select jsonb_agg(to_jsonb(f) order by f.key) from public.ai_functions f), '[]'::jsonb),
    'settings', (select to_jsonb(s) - 'id' from public.ai_settings s),
    'prices', coalesce((select jsonb_agg(to_jsonb(x) order by x.provider, x.model) from public.ai_model_prices x), '[]'::jsonb)
  )
$$;

-- Gasto do mês corrente (fuso de Brasília) em dólares.
create function public.ch_worker_ai_month_spend(p_now timestamptz default now()) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
    from public.ai_calls
   where date_trunc('month', created_at at time zone 'America/Sao_Paulo') = date_trunc('month', p_now at time zone 'America/Sao_Paulo')
$$;

-- ---------------------------------------------------------------- registro de chamadas (maestro)
create function public.ch_worker_ai_log_calls(p_calls jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if p_calls is null or jsonb_typeof(p_calls) <> 'array' then raise exception 'Lista de chamadas inválida.' using errcode = '22023'; end if;
  insert into public.ai_calls (created_at, run_id, actor_id, function_key, mode, role, provider, model, input_tokens, output_tokens,
                               cost_usd, duration_ms, outcome, source, item_id, error)
  select coalesce(c.created_at, now()), c.run_id, c.actor_id, c.function_key, c.mode, c.role, c.provider, c.model,
         coalesce(c.input_tokens, 0), coalesce(c.output_tokens, 0), coalesce(c.cost_usd, 0), coalesce(c.duration_ms, 0),
         c.outcome, c.source, c.item_id, left(c.error, 1000)
    from jsonb_to_recordset(p_calls) as c(created_at timestamptz, run_id uuid, actor_id uuid, function_key text, mode text, role text,
                                         provider text, model text, input_tokens integer, output_tokens integer, cost_usd numeric,
                                         duration_ms integer, outcome text, source text, item_id text, error text);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Lista de modelos e última situação de uma IA (consulta ao provedor feita pelo servidor).
create function public.ch_worker_ai_store_models(p_provider text, p_models jsonb, p_status text, p_detail text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_models is not null and jsonb_typeof(p_models) <> 'array' then raise exception 'Lista de modelos inválida.' using errcode = '22023'; end if;
  update public.ai_providers
     set models = coalesce(p_models, models),
         models_refreshed_at = case when p_models is null then models_refreshed_at else now() end,
         last_status = left(p_status, 60),
         last_status_detail = left(p_detail, 500),
         updated_at = now()
   where id = p_provider;
  if not found then raise exception 'IA desconhecida: %.', p_provider using errcode = '22023'; end if;
end
$$;

-- ---------------------------------------------------------------- gravações do administrador
create function public.ch_worker_ai_set_provider(p_actor uuid, p_provider text, p_enabled boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v public.ai_providers;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_enabled is null then raise exception 'Informe ligar ou desligar.' using errcode = '22023'; end if;
  update public.ai_providers
     set enabled = p_enabled,
         enabled_by = case when p_enabled then p_actor else enabled_by end,
         enabled_at = case when p_enabled then now() else enabled_at end,
         updated_at = now()
   where id = p_provider
   returning * into v;
  if not found then raise exception 'IA desconhecida: %.', p_provider using errcode = '22023'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.provider', p_provider, jsonb_build_object('enabled', p_enabled));
  return to_jsonb(v);
end
$$;

-- p_config = null apaga a linha (a função volta a usar as variáveis de ambiente).
create function public.ch_worker_ai_save_function(p_actor uuid, p_key text, p_config jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ai_functions;
  v_mode text;
  v_care text;
  v_reviewers jsonb;
  v_item jsonb;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_key is null or p_key not in ('criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar') then
    raise exception 'Função de IA desconhecida: %.', p_key using errcode = '22023';
  end if;
  if p_config is null or jsonb_typeof(p_config) = 'null' then
    delete from public.ai_functions where key = p_key;
    insert into public.admin_audit_log (actor_id, action, target, details)
    values (p_actor, 'ai.function', p_key, jsonb_build_object('removed', true));
    return null;
  end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'Configuração inválida.' using errcode = '22023'; end if;
  v_mode := p_config ->> 'mode';
  v_care := coalesce(p_config ->> 'care', 'rapido');
  v_reviewers := coalesce(p_config -> 'reviewers', '[]'::jsonb);
  if v_mode is null or v_mode not in ('sozinha', 'linha_producao', 'comite') then raise exception 'Modo inválido: %.', v_mode using errcode = '22023'; end if;
  if v_care not in ('rapido', 'caprichado') then raise exception 'Cuidado inválido: %.', v_care using errcode = '22023'; end if;
  if jsonb_typeof(v_reviewers) <> 'array' or jsonb_array_length(v_reviewers) > 4 then
    raise exception 'No máximo 4 conferentes ou membros.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config -> 'primary_ref') = 'object' and not public.ai_valid_ref(p_config -> 'primary_ref') then
    raise exception 'IA ou modelo principal inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config -> 'fallback_ref') = 'object' and not public.ai_valid_ref(p_config -> 'fallback_ref') then
    raise exception 'IA ou modelo da reserva inválido.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(v_reviewers) loop
    if not public.ai_valid_ref(v_item) then raise exception 'IA ou modelo de conferente inválido.' using errcode = '22023'; end if;
  end loop;
  insert into public.ai_functions (key, mode, primary_ref, fallback_ref, reviewers, care, updated_by, updated_at)
  values (p_key, v_mode,
          case when jsonb_typeof(p_config -> 'primary_ref') = 'object' then p_config -> 'primary_ref' end,
          case when jsonb_typeof(p_config -> 'fallback_ref') = 'object' then p_config -> 'fallback_ref' end,
          v_reviewers, v_care, p_actor, now())
  on conflict (key) do update
     set mode = excluded.mode, primary_ref = excluded.primary_ref, fallback_ref = excluded.fallback_ref,
         reviewers = excluded.reviewers, care = excluded.care, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.function', p_key, to_jsonb(v) - 'key' - 'updated_by' - 'updated_at');
  return to_jsonb(v);
end
$$;

-- Só as chaves presentes em p_settings mudam; null em um teto tira o teto.
create function public.ch_worker_ai_save_settings(p_actor uuid, p_settings jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v public.ai_settings;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Ajustes inválidos.' using errcode = '22023'; end if;
  update public.ai_settings
     set monthly_cap_usd = case when p_settings ? 'monthly_cap_usd' then (p_settings ->> 'monthly_cap_usd')::numeric else monthly_cap_usd end,
         per_run_cap_usd = case when p_settings ? 'per_run_cap_usd' then (p_settings ->> 'per_run_cap_usd')::numeric else per_run_cap_usd end,
         caps_enabled = case when p_settings ? 'caps_enabled' then (p_settings ->> 'caps_enabled')::boolean else caps_enabled end,
         tab_override_enabled = case when p_settings ? 'tab_override_enabled' then (p_settings ->> 'tab_override_enabled')::boolean else tab_override_enabled end,
         updated_by = p_actor, updated_at = now()
   where id
   returning * into v;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.settings', 'ai_settings', p_settings);
  return to_jsonb(v) - 'id';
end
$$;

create function public.ch_worker_ai_save_price(p_actor uuid, p_provider text, p_model text, p_price jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v public.ai_model_prices;
begin
  perform public.ai_assert_admin_actor(p_actor);
  if p_provider is null or p_provider not in ('anthropic', 'openai', 'gemini', 'ollama') then raise exception 'IA desconhecida: %.', p_provider using errcode = '22023'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120 then raise exception 'Modelo inválido.' using errcode = '22023'; end if;
  if p_price is null or jsonb_typeof(p_price) <> 'object' then raise exception 'Preço inválido.' using errcode = '22023'; end if;
  insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok, source_url, checked_on, updated_by, updated_at)
  values (p_provider, btrim(p_model), (p_price ->> 'input_per_mtok')::numeric, (p_price ->> 'output_per_mtok')::numeric,
          nullif(p_price ->> 'source_url', ''), nullif(p_price ->> 'checked_on', '')::date, p_actor, now())
  on conflict (provider, model) do update
     set input_per_mtok = excluded.input_per_mtok, output_per_mtok = excluded.output_per_mtok, source_url = excluded.source_url,
         checked_on = excluded.checked_on, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (p_actor, 'ai.price', p_provider || ':' || v.model,
          jsonb_build_object('input_per_mtok', v.input_per_mtok, 'output_per_mtok', v.output_per_mtok, 'source_url', v.source_url, 'checked_on', v.checked_on));
  return to_jsonb(v);
end
$$;

-- ---------------------------------------------------------------- painel e resumo
create function public.app_admin_ai_overview() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month timestamp := date_trunc('month', now() at time zone 'America/Sao_Paulo');
  v_cfg jsonb;
begin
  perform public.assert_admin();
  v_cfg := public.ch_worker_ai_config();
  return v_cfg || jsonb_build_object(
    'spend_by_provider', coalesce((
      select jsonb_agg(jsonb_build_object('provider', provider, 'cost_usd', cost, 'calls', n) order by provider)
        from (select provider, sum(cost_usd) as cost, count(*) as n from public.ai_calls
               where date_trunc('month', created_at at time zone 'America/Sao_Paulo') = v_month group by provider) s), '[]'::jsonb),
    'spend_by_function', coalesce((
      select jsonb_agg(jsonb_build_object('function_key', function_key, 'cost_usd', cost, 'calls', n) order by function_key)
        from (select function_key, sum(cost_usd) as cost, count(*) as n from public.ai_calls
               where date_trunc('month', created_at at time zone 'America/Sao_Paulo') = v_month group by function_key) s), '[]'::jsonb),
    'month_spend', public.ch_worker_ai_month_spend(now()),
    'tutor_month_spend', (select coalesce(sum(estimated_cost_usd), 0) from public.ai_usage_ledger
                           where date_trunc('month', created_at at time zone 'America/Sao_Paulo') = v_month),
    'recent_calls', coalesce((select jsonb_agg(to_jsonb(c)) from (select * from public.ai_calls order by created_at desc, id desc limit 30) c), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h)) from (select id, actor_id, action, target, details, created_at from public.admin_audit_log
                                                             where action like 'ai.%' order by created_at desc, id desc limit 30) h), '[]'::jsonb)
  );
end
$$;

-- Equipe: quais funções já têm configuração própria, quais IAs estão ligadas e o gasto do mês (sem preços nem chaves).
create function public.app_ai_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'functions', (select jsonb_agg(jsonb_build_object('key', k.key, 'configured', f.key is not null, 'mode', f.mode) order by k.ord)
                    from unnest(array['criacao', 'verificacao', 'engenharia_reversa', 'assistente_preencher', 'assistente_conferir', 'assistente_revisar'])
                         with ordinality as k(key, ord)
                    left join public.ai_functions f on f.key = k.key),
    'providers_enabled', coalesce((select jsonb_agg(id order by id) from public.ai_providers where enabled), '[]'::jsonb),
    'month_spend', public.ch_worker_ai_month_spend(now())
  );
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.ai_assert_admin_actor(uuid) from public, anon, authenticated;
revoke execute on function public.ai_valid_ref(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_config() from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_month_spend(timestamptz) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_log_calls(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_store_models(text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_set_provider(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_save_function(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_save_settings(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_save_price(uuid, text, text, jsonb) from public, anon, authenticated;
