-- =============================================================================
-- Migração 20261003013060: Editor profissional — histórico, rascunho automático e trava de edição.
--
-- O que esta migração faz:
-- 1. Cria tabelas para rascunhos automáticos (ch_doc_drafts), travas de edição
--    concorrente (ch_doc_locks) e histórico de versões salvas (ch_doc_history).
--    Todas com RLS ativada e permissões revogadas de public, anon e authenticated
--    (acesso estritamente através das funções da equipe).
-- 2. Cria gatilhos em ch_unit_versions:
--    - BEFORE UPDATE: impede salvar por cima quando outra pessoa tem trava ativa
--      ou avisa se a versão mudou desde que a pessoa abriu o editor.
--    - AFTER UPDATE: guarda histórico (inclusive o estado anterior no primeiro
--      salvamento), atualiza a trava e remove o rascunho de quem salvou.
-- 3. Cria funções seguras (security definer) para manipulação de rascunhos, travas,
--    consulta de histórico e restauração de textos anteriores ou de outras versões.
--
-- Regra da aprovação (migração 013080, decisão do dono 16/10): o content_hash da versão é o hash de CONTEÚDO; mudança só de formatação
-- não o muda e não derruba aprovação. Por isso aqui tudo olha o TEXTO INTEIRO (content), não só o content_hash: a trava e o histórico
-- valem também para mudança só de formatação, e o histórico guarda o hash completo (ch_hash(content)). Esta migração não mexe na regra
-- da aprovação: quem decide continua sendo app_ch_save_unit_version.
--
-- Totalmente idempotente: pode ser executada duas ou mais vezes sem erro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabelas
-- -----------------------------------------------------------------------------

-- Rascunho automático do editor completo, um por pessoa por versão
create table if not exists public.ch_doc_drafts (
  unit_version_id uuid not null references public.ch_unit_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  doc jsonb not null check (octet_length(doc::text) <= 3000000),
  config jsonb not null default '{}'::jsonb,
  base_hash text,
  updated_at timestamptz not null default now(),
  primary key (unit_version_id, user_id)
);

alter table public.ch_doc_drafts enable row level security;
revoke all on table public.ch_doc_drafts from public, anon, authenticated;

-- Trava de edição (uma por versão; vale por 2 minutos sem sinal de atividade)
create table if not exists public.ch_doc_locks (
  unit_version_id uuid primary key references public.ch_unit_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  base_hash text,                 -- hash de conteúdo da versão que a pessoa abriu
  base_completo text,             -- hash do texto inteiro (com formatação) quando a trava foi pega com a tela em dia
  desde timestamptz not null default now(),
  visto_em timestamptz not null default now()
);

alter table public.ch_doc_locks enable row level security;
revoke all on table public.ch_doc_locks from public, anon, authenticated;

-- Histórico de cada texto salvo de verdade na versão
create table if not exists public.ch_doc_history (
  id uuid primary key default gen_random_uuid(),
  unit_version_id uuid not null references public.ch_unit_versions(id) on delete cascade,
  content jsonb not null,
  content_hash text not null,     -- hash do texto inteiro: public.ch_hash(content)
  so_formatacao boolean not null default false,   -- o salvamento mudou só a formatação (aprovações mantidas)
  origem text not null check (origem in ('anterior', 'salvo', 'restaurado')),
  detalhe text,
  autor uuid references auth.users(id) on delete set null,
  em timestamptz not null default now()
);

create index if not exists ch_doc_history_version_em_idx
  on public.ch_doc_history (unit_version_id, em desc);

alter table public.ch_doc_history enable row level security;
revoke all on table public.ch_doc_history from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Gatilhos em public.ch_unit_versions
-- -----------------------------------------------------------------------------

-- Gatilho BEFORE UPDATE: validação de trava e concorrência antes de salvar
create or replace function public.ch_doc_trava_antes_salvar() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid;
  v_lock record;
  v_email text;
  v_desde text;
begin
  -- Se auth.uid() é nulo (servidor/sistema/rotinas internas), deixa passar
  v_uid := (select auth.uid());
  if v_uid is null then
    return new;
  end if;

  -- Procura trava válida (não vencida) desta versão
  select l.*, u.email into v_lock
  from public.ch_doc_locks l
  left join auth.users u on u.id = l.user_id
  where l.unit_version_id = new.id;

  if v_lock.unit_version_id is not null then
    -- Se existe trava não vencida de outra pessoa, bloqueia
    if v_lock.visto_em > now() - interval '2 minutes' then
      if v_lock.user_id <> v_uid then
        v_email := coalesce(v_lock.email, 'outro usuário');
        v_desde := to_char(v_lock.desde at time zone 'America/Sao_Paulo', 'HH24:MI');
        raise exception 'Outra pessoa (%) está editando esta aula no editor completo desde %. Para não salvar por cima, espere ela salvar ou sair do editor.', v_email, v_desde
          using errcode = '55006';
      end if;
    end if;

    -- Se a trava é da própria pessoa e base_hash não é nulo e base_hash <> old.content_hash
    if v_lock.user_id = v_uid and ((v_lock.base_hash is not null and v_lock.base_hash <> old.content_hash)
        or (v_lock.base_completo is not null and v_lock.base_completo <> public.ch_hash(old.content))) then
      raise exception 'Esta aula foi salva por outra pessoa depois que você começou a editar. Seu texto ficou guardado no rascunho: recarregue a página para ver a versão nova.'
        using errcode = '40001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ch_doc_trava_antes_salvar on public.ch_unit_versions;
create trigger ch_doc_trava_antes_salvar
  before update on public.ch_unit_versions
  for each row
  when (old.content is distinct from new.content)
  execute function public.ch_doc_trava_antes_salvar();

-- Gatilho AFTER UPDATE: gravação do histórico e manutenção de trava/rascunho
create or replace function public.ch_doc_historico_depois_salvar() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid;
  v_origem text;
  v_detalhe text;
begin
  v_uid := (select auth.uid());

  -- Se ainda não há nenhuma linha de ch_doc_history para esta versão, insere o texto anterior
  if not exists (select 1 from public.ch_doc_history where unit_version_id = new.id) then
    insert into public.ch_doc_history (unit_version_id, content, content_hash, origem, detalhe, autor, em)
    values (new.id, old.content, public.ch_hash(old.content), 'anterior', null, null, clock_timestamp() - interval '1 millisecond');
  end if;

  -- Insere o texto novo salvo ou restaurado
  if current_setting('stazia.historico_origem', true) = 'restaurado' then
    v_origem := 'restaurado';
  else
    v_origem := 'salvo';
  end if;
  v_detalhe := nullif(current_setting('stazia.historico_detalhe', true), '');

  insert into public.ch_doc_history (unit_version_id, content, content_hash, so_formatacao, origem, detalhe, autor, em)
  values (new.id, new.content, public.ch_hash(new.content), old.content_hash is not distinct from new.content_hash, v_origem, v_detalhe, v_uid, clock_timestamp());

  -- Mantém no máximo as 100 linhas mais recentes por versão
  delete from public.ch_doc_history
  where unit_version_id = new.id
    and id not in (
      select id from public.ch_doc_history
      where unit_version_id = new.id
      order by em desc, id desc
      limit 100
    );

  -- Se a pessoa que salvou tem a trava desta versão, renova base_hash e visto_em
  if v_uid is not null then
    update public.ch_doc_locks
    set base_hash = new.content_hash,
        base_completo = public.ch_hash(new.content),
        visto_em = now()
    where unit_version_id = new.id and user_id = v_uid;

    -- Apaga o rascunho de quem acabou de salvar
    delete from public.ch_doc_drafts
    where unit_version_id = new.id and user_id = v_uid;
  end if;

  return new;
end;
$$;

drop trigger if exists ch_doc_historico_depois_salvar on public.ch_unit_versions;
create trigger ch_doc_historico_depois_salvar
  after update on public.ch_unit_versions
  for each row
  when (old.content is distinct from new.content)
  execute function public.ch_doc_historico_depois_salvar();

-- -----------------------------------------------------------------------------
-- 3. Funções da API do Editor Profissional
-- -----------------------------------------------------------------------------

-- Salva rascunho automático do editor
create or replace function public.app_ch_doc_rascunho_salvar(
  p_version_id uuid,
  p_doc jsonb,
  p_config jsonb default '{}'::jsonb,
  p_base_hash text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid;
  v_updated_at timestamptz;
begin
  perform public.ch_assert_staff();

  if not exists (select 1 from public.ch_unit_versions where id = p_version_id) then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or coalesce(p_doc ->> 'type', '') <> 'doc' then
    raise exception 'Rascunho inválido.' using errcode = '22023';
  end if;

  if octet_length(p_doc::text) > 3000000 then
    raise exception 'Rascunho grande demais.' using errcode = '22023';
  end if;

  v_uid := (select auth.uid());

  insert into public.ch_doc_drafts (unit_version_id, user_id, doc, config, base_hash, updated_at)
  values (p_version_id, v_uid, p_doc, coalesce(p_config, '{}'::jsonb), p_base_hash, now())
  on conflict (unit_version_id, user_id) do update set
    doc = excluded.doc,
    config = excluded.config,
    base_hash = excluded.base_hash,
    updated_at = now()
  returning updated_at into v_updated_at;

  return jsonb_build_object('em', v_updated_at);
end;
$$;

-- Lê o rascunho da própria pessoa logada
create or replace function public.app_ch_doc_rascunho_ler(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hash_atual text;
  v_draft record;
begin
  perform public.ch_assert_staff();

  select content_hash into v_hash_atual
  from public.ch_unit_versions
  where id = p_version_id;

  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  select doc, config, base_hash, updated_at
  into v_draft
  from public.ch_doc_drafts
  where unit_version_id = p_version_id and user_id = (select auth.uid());

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'doc', v_draft.doc,
    'config', v_draft.config,
    'base_hash', v_draft.base_hash,
    'em', v_draft.updated_at,
    'hash_atual', v_hash_atual
  );
end;
$$;

-- Apaga o rascunho da própria pessoa logada
create or replace function public.app_ch_doc_rascunho_apagar(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();

  if not exists (select 1 from public.ch_unit_versions where id = p_version_id) then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  delete from public.ch_doc_drafts
  where unit_version_id = p_version_id and user_id = (select auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;

-- Gerencia a trava de edição concorrente
create or replace function public.app_ch_doc_trava(
  p_version_id uuid,
  p_base_hash text default null,
  p_assumir boolean default false
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_version record;
  v_lock record;
  v_uid uuid;
  v_valida boolean;
  v_base_hash text;
  v_base_completo text;
  v_desde timestamptz;
begin
  perform public.ch_assert_staff();

  select status, content_hash, public.ch_hash(content) as completo
  into v_version
  from public.ch_unit_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  -- versão no ar aceita "Ajustar formatação" (013080); retirada não se edita
  if v_version.status = 'retired' then
    raise exception 'Versão retirada não se edita.' using errcode = '22023';
  end if;

  v_uid := (select auth.uid());

  select l.*, u.email
  into v_lock
  from public.ch_doc_locks l
  left join auth.users u on u.id = l.user_id
  where l.unit_version_id = p_version_id;

  v_valida := (v_lock.unit_version_id is not null and v_lock.visto_em > now() - interval '2 minutes');

  -- Se existe trava válida de outra pessoa e não foi pedido assumir: não muda nada
  if v_valida and v_lock.user_id <> v_uid and not coalesce(p_assumir, false) then
    return jsonb_build_object(
      'minha', false,
      'quem', v_lock.email,
      'desde', v_lock.desde,
      'visto_em', v_lock.visto_em,
      'hash_atual', v_version.content_hash
    );
  end if;

  -- Se a trava já é da própria pessoa: só renova visto_em
  if v_lock.unit_version_id is not null and v_lock.user_id = v_uid then
    update public.ch_doc_locks
    set visto_em = now()
    where unit_version_id = p_version_id;

    v_desde := v_lock.desde;
    v_base_hash := v_lock.base_hash;
    v_base_completo := v_lock.base_completo;
  else
    -- Se não é minha (livre, vencida ou assumida)
    if v_valida and v_lock.user_id <> v_uid then
      perform public.ch_log('unit.editor_assumido', p_version_id::text, jsonb_build_object('de', coalesce(v_lock.email, '')));
    end if;

    v_base_hash := coalesce(p_base_hash, v_version.content_hash);
    v_base_completo := case when v_base_hash = v_version.content_hash then v_version.completo end;
    v_desde := now();

    insert into public.ch_doc_locks (unit_version_id, user_id, base_hash, base_completo, desde, visto_em)
    values (p_version_id, v_uid, v_base_hash, v_base_completo, v_desde, v_desde)
    on conflict (unit_version_id) do update set
      user_id = excluded.user_id,
      base_hash = excluded.base_hash,
      base_completo = excluded.base_completo,
      desde = excluded.desde,
      visto_em = excluded.visto_em;
  end if;

  return jsonb_build_object(
    'minha', true,
    'desde', v_desde,
    'hash_atual', v_version.content_hash,
    -- mudou = alguém salvou (conteúdo ou só formatação) depois que esta tela abriu
    'mudou', (v_base_hash is distinct from v_version.content_hash
              or (v_base_completo is not null and v_base_completo <> v_version.completo))
  );
end;
$$;

-- Libera a trava da versão se pertencer à pessoa logada
create or replace function public.app_ch_doc_trava_soltar(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();

  delete from public.ch_doc_locks
  where unit_version_id = p_version_id and user_id = (select auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;

-- Lista o histórico de salvamentos e versões da unidade
create or replace function public.app_ch_doc_historico(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rec record;
  v_salvamentos jsonb;
  v_versoes jsonb;
begin
  perform public.ch_assert_staff();

  select id, unit_id, version, status, content_hash, public.ch_hash(content) as completo
  into v_rec
  from public.ch_unit_versions
  where id = p_version_id;

  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'origem', h.origem,
    'detalhe', h.detalhe,
    'quem', u.email,
    'em', h.em,
    'content_hash', h.content_hash,
    'so_formatacao', h.so_formatacao,
    'igual_ao_atual', (h.content_hash = v_rec.completo)
  ) order by h.em desc, h.id desc), '[]'::jsonb)
  into v_salvamentos
  from public.ch_doc_history h
  left join auth.users u on u.id = h.autor
  where h.unit_version_id = p_version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'version', v.version,
    'status', v.status,
    'quem', u.email,
    'em', v.created_at,
    'content_hash', v.content_hash,
    'igual_ao_atual', (public.ch_hash(v.content) = v_rec.completo),
    'atual', (v.id = p_version_id)
  ) order by v.version desc), '[]'::jsonb)
  into v_versoes
  from public.ch_unit_versions v
  left join auth.users u on u.id = v.created_by
  where v.unit_id = v_rec.unit_id;

  return jsonb_build_object(
    'atual', jsonb_build_object(
      'id', v_rec.id,
      'version', v_rec.version,
      'status', v_rec.status,
      'content_hash', v_rec.content_hash
    ),
    'salvamentos', v_salvamentos,
    'versoes', v_versoes
  );
end;
$$;

-- Abre o conteúdo completo de um registro do histórico ou de outra versão
create or replace function public.app_ch_doc_historico_abrir(
  p_version_id uuid,
  p_historico_id uuid default null,
  p_de_versao_id uuid default null
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unit_id uuid;
  v_content jsonb;
  v_hash text;
  v_origem_unit_id uuid;
begin
  perform public.ch_assert_staff();

  if (p_historico_id is null and p_de_versao_id is null) or
     (p_historico_id is not null and p_de_versao_id is not null) then
    raise exception 'Escolha uma gravação do histórico ou outra versão da aula.' using errcode = '22023';
  end if;

  select unit_id into v_unit_id
  from public.ch_unit_versions
  where id = p_version_id;

  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  if p_historico_id is not null then
    select h.content, h.content_hash, v.unit_id
    into v_content, v_hash, v_origem_unit_id
    from public.ch_doc_history h
    join public.ch_unit_versions v on v.id = h.unit_version_id
    where h.id = p_historico_id;

    if not found or v_origem_unit_id <> v_unit_id then
      raise exception 'Esse texto não é desta aula.' using errcode = '22023';
    end if;
  else
    select v.content, public.ch_hash(v.content), v.unit_id
    into v_content, v_hash, v_origem_unit_id
    from public.ch_unit_versions v
    where v.id = p_de_versao_id;

    if not found or v_origem_unit_id <> v_unit_id then
      raise exception 'Esse texto não é desta aula.' using errcode = '22023';
    end if;
  end if;

  return jsonb_build_object(
    'content', v_content,
    'content_hash', v_hash
  );
end;
$$;

-- Restaura o texto de uma gravação do histórico ou de outra versão
create or replace function public.app_ch_doc_restaurar(
  p_version_id uuid,
  p_historico_id uuid default null,
  p_de_versao_id uuid default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_target_unit_id uuid;
  v_target_status text;
  v_content jsonb;
  v_detalhe text;
  v_origem_unit_id uuid;
  v_res jsonb;
begin
  perform public.ch_assert_staff();

  if (p_historico_id is null and p_de_versao_id is null) or
     (p_historico_id is not null and p_de_versao_id is not null) then
    raise exception 'Escolha uma gravação do histórico ou outra versão da aula.' using errcode = '22023';
  end if;

  select unit_id, status
  into v_target_unit_id, v_target_status
  from public.ch_unit_versions
  where id = p_version_id;

  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;

  -- quem decide o que pode (versão no ar só aceita formatação; mudança de conteúdo derruba as aprovações) é app_ch_save_unit_version
  if v_target_status = 'retired' then
    raise exception 'Versão retirada não se edita.' using errcode = '22023';
  end if;

  if p_historico_id is not null then
    select h.content, v.unit_id,
           'salvo em ' || to_char(h.em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
    into v_content, v_origem_unit_id, v_detalhe
    from public.ch_doc_history h
    join public.ch_unit_versions v on v.id = h.unit_version_id
    where h.id = p_historico_id;

    if not found or v_origem_unit_id <> v_target_unit_id then
      raise exception 'Esse texto não é desta aula.' using errcode = '22023';
    end if;
  else
    select v.content, v.unit_id,
           'versão ' || v.version::text
    into v_content, v_origem_unit_id, v_detalhe
    from public.ch_unit_versions v
    where v.id = p_de_versao_id;

    if not found or v_origem_unit_id <> v_target_unit_id then
      raise exception 'Esse texto não é desta aula.' using errcode = '22023';
    end if;
  end if;

  perform set_config('stazia.historico_origem', 'restaurado', true);
  perform set_config('stazia.historico_detalhe', v_detalhe, true);

  begin
    v_res := public.app_ch_save_unit_version(p_version_id, v_content);
    perform set_config('stazia.historico_origem', '', true);
    perform set_config('stazia.historico_detalhe', '', true);
    return v_res;
  exception when others then
    perform set_config('stazia.historico_origem', '', true);
    perform set_config('stazia.historico_detalhe', '', true);
    raise;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permissões
-- -----------------------------------------------------------------------------

revoke execute on function public.ch_doc_trava_antes_salvar() from public, anon;
revoke execute on function public.ch_doc_historico_depois_salvar() from public, anon;

do $perm$
declare
  f text;
begin
  foreach f in array array[
    'app_ch_doc_rascunho_salvar(uuid, jsonb, jsonb, text)',
    'app_ch_doc_rascunho_ler(uuid)',
    'app_ch_doc_rascunho_apagar(uuid)',
    'app_ch_doc_trava(uuid, text, boolean)',
    'app_ch_doc_trava_soltar(uuid)',
    'app_ch_doc_historico(uuid)',
    'app_ch_doc_historico_abrir(uuid, uuid, uuid)',
    'app_ch_doc_restaurar(uuid, uuid, uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$perm$;
