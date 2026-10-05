-- =============================================================================
-- Content Lab, fundação: o que a especificação pede e a Central de Conteúdo (ch_*) ainda não tinha.
-- Nada aqui apaga ou renomeia dados existentes. Ver docs/architecture/STAZIA_CONTENT_LAB.md.
--   1. sinalizadores (liga/desliga, IA, publicação, modo sombra) com trava NO BANCO
--   2. aliases de tema e busca de equivalentes
--   3. natureza da fonte (diretriz, PCDT, lei…)
--   4. texto dos prompts guardado por versão
--   5. conflitos entre fontes com a decisão registrada
--   6. confiança composta e explicável por afirmação
-- =============================================================================

-- ---------------------------------------------------------------- 1. sinalizadores
create table public.ch_flags (
  key text primary key check (key in ('enabled', 'ai_enabled', 'publish_enabled', 'notebook_provider_enabled', 'auto_analysis_enabled', 'shadow_mode')),
  value boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
-- padrão seguro: módulo ligado, IA ligada, publicação DESLIGADA, modo sombra LIGADO
insert into public.ch_flags (key, value) values
  ('enabled', true), ('ai_enabled', true), ('publish_enabled', false), ('notebook_provider_enabled', false), ('auto_analysis_enabled', false), ('shadow_mode', true);
alter table public.ch_flags enable row level security;
create policy "sinalizadores: equipe lê" on public.ch_flags for select to authenticated using (public.is_staff());

create function public.ch_flag(p_key text) returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce((select value from public.ch_flags where key = p_key), false) $$;

create function public.app_ch_flags() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_staff() then raise exception 'Acesso restrito à equipe de conteúdo.' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(key, value) from public.ch_flags), '{}'::jsonb);
end
$$;

create function public.app_ch_set_flag(p_key text, p_value boolean, p_reason text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_old boolean;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo da mudança (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  select value into v_old from public.ch_flags where key = p_key;
  if not found then raise exception 'Sinalizador desconhecido.' using errcode = '22023'; end if;
  update public.ch_flags set value = p_value, updated_at = now(), updated_by = (select auth.uid()) where key = p_key;
  perform public.ch_log('flag.set', p_key, jsonb_build_object('from', v_old, 'to', p_value, 'reason', btrim(p_reason)));
  return true;
end
$$;

-- o servidor consulta antes de chamar a IA
create function public.ch_worker_flag(p_key text) returns boolean
  language sql stable security definer set search_path = ''
as $$ select public.ch_flag(p_key) $$;

-- módulo desligado: nenhuma função da equipe responde (o aluno não é afetado)
create or replace function public.ch_assert_staff() returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (public.is_staff() or public.ch_is_reviewer()) then
    raise exception 'Acesso restrito à equipe de conteúdo.' using errcode = '42501';
  end if;
  if not public.ch_flag('enabled') then
    raise exception 'Content Lab desligado pelo administrador.' using errcode = '55000';
  end if;
end
$$;

-- publicação de unidades: só com a publicação ligada e o modo sombra desligado
alter function public.app_ch_publish(uuid) rename to ch_publish_impl;
create function public.app_ch_publish(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if public.ch_flag('shadow_mode') then
    raise exception 'Modo sombra ligado: a IA analisa e sugere, mas nada é publicado. Um administrador precisa desligá-lo.' using errcode = '55000';
  end if;
  if not public.ch_flag('publish_enabled') then
    raise exception 'Publicação desligada. Um administrador precisa ligá-la em Configuração.' using errcode = '55000';
  end if;
  return public.ch_publish_impl(p_version_id);
end
$$;

-- ---------------------------------------------------------------- 2. aliases de tema
-- Chave do caminho do nó (áreas > subárea > tema > subtema, sem acento e sem caixa): estável entre versões da taxonomia,
-- que copiam os nós com ids novos.
create function public.ch_taxonomy_keys(p_version uuid) returns table (node_id uuid, path_key text, path text, level text, name_key text)
  language sql stable security definer set search_path = ''
as $$
  with recursive t as (
    select n.id, n.level, n.name, public.fold_text(btrim(n.name)) k, public.fold_text(btrim(n.name)) pk, n.name::text p from public.ch_taxonomy_nodes n where n.version_id = p_version and n.parent_id is null
    union all
    select c.id, c.level, c.name, public.fold_text(btrim(c.name)), t.pk || ' > ' || public.fold_text(btrim(c.name)), t.p || ' > ' || c.name
    from public.ch_taxonomy_nodes c join t on c.parent_id = t.id where c.version_id = p_version)
  select id, pk, p, level, k from t
$$;

create table public.ch_taxonomy_aliases (
  id uuid primary key default gen_random_uuid(),
  path_key text not null,
  alias text not null check (char_length(btrim(alias)) between 1 and 120),
  alias_key text not null unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ch_taxonomy_aliases enable row level security;
create policy "aliases de tema: equipe lê" on public.ch_taxonomy_aliases for select to authenticated using (public.is_staff());

-- Procura equivalentes de um texto (nome igual, alias, nome que contém, palavras em comum) antes de criar um tema novo.
create function public.app_ch_taxonomy_find(p_text text, p_limit integer default 8) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_key text := regexp_replace(public.fold_text(btrim(coalesce(p_text, ''))), '\s+', ' ', 'g');
  v_pub uuid;
  v_tokens text[];
begin
  perform public.ch_assert_staff();
  if char_length(v_key) < 2 then return '[]'::jsonb; end if;
  select id into v_pub from public.ch_taxonomy_versions where status = 'published';
  v_tokens := array(select distinct t from unnest(string_to_array(v_key, ' ')) t where char_length(t) > 2);
  return coalesce((select jsonb_agg(jsonb_build_object('node_id', x.node_id, 'path', x.path, 'level', x.level, 'via', x.via, 'alias', x.alias, 'score', x.score) order by x.score desc, x.path)
    from (
      select k.node_id, k.path, k.level, a.alias,
             case when k.name_key = v_key then 'name' when a.alias_key = v_key then 'alias' when k.name_key like '%' || v_key || '%' or v_key like '%' || k.name_key || '%' then 'contains' else 'words' end via,
             case when k.name_key = v_key or a.alias_key = v_key then 1.0
                  when k.name_key like '%' || v_key || '%' or v_key like '%' || k.name_key || '%' then 0.8
                  else round(coalesce((select count(*)::numeric from unnest(v_tokens) tk where k.name_key like '%' || tk || '%'), 0) / greatest(cardinality(v_tokens), 1), 2) * 0.7 end score
      from public.ch_taxonomy_keys(v_pub) k left join public.ch_taxonomy_aliases a on a.path_key = k.path_key
      where k.name_key = v_key or a.alias_key = v_key or k.name_key like '%' || v_key || '%' or v_key like '%' || k.name_key || '%'
         or (cardinality(v_tokens) > 0 and (select count(*) from unnest(v_tokens) tk where k.name_key like '%' || tk || '%') * 2 >= cardinality(v_tokens))
      order by 6 desc limit least(greatest(coalesce(p_limit, 8), 1), 30)) x), '[]'::jsonb);
end
$$;

create function public.app_ch_taxonomy_add_alias(p_node_id uuid, p_alias text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ver uuid;
  v_node record;
  v_key text := regexp_replace(public.fold_text(btrim(coalesce(p_alias, ''))), '\s+', ' ', 'g');
  v_other text;
  v_id uuid;
begin
  perform public.assert_staff();
  if char_length(v_key) = 0 then raise exception 'Informe o alias.' using errcode = '22023'; end if;
  select version_id into v_ver from public.ch_taxonomy_nodes where id = p_node_id;
  if not found then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  select * into v_node from public.ch_taxonomy_keys(v_ver) k where k.node_id = p_node_id;
  if v_node.name_key = v_key then raise exception 'O alias é igual ao nome do tema.' using errcode = '22023'; end if;
  select k.path into v_other from public.ch_taxonomy_keys(v_ver) k where k.name_key = v_key and k.node_id <> p_node_id limit 1;
  if v_other is not null then raise exception 'Já existe um tema com esse nome: %.', v_other using errcode = '22023'; end if;
  select k.path into v_other from public.ch_taxonomy_aliases a join public.ch_taxonomy_keys(v_ver) k on k.path_key = a.path_key where a.alias_key = v_key limit 1;
  if v_other is not null then raise exception 'Esse alias já pertence a: %.', v_other using errcode = '22023'; end if;
  insert into public.ch_taxonomy_aliases (path_key, alias, alias_key) values (v_node.path_key, btrim(p_alias), v_key) returning id into v_id;
  perform public.ch_log('taxonomy.alias_add', v_id::text, jsonb_build_object('path', v_node.path, 'alias', btrim(p_alias)));
  return jsonb_build_object('id', v_id, 'path', v_node.path);
end
$$;

create function public.app_ch_taxonomy_remove_alias(p_alias_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_alias text;
begin
  perform public.assert_staff();
  delete from public.ch_taxonomy_aliases where id = p_alias_id returning alias into v_alias;
  if not found then raise exception 'Alias não encontrado.' using errcode = 'P0002'; end if;
  perform public.ch_log('taxonomy.alias_remove', p_alias_id::text, jsonb_build_object('alias', v_alias));
  return true;
end
$$;

-- Aliases por tema da taxonomia publicada; os que perderam o tema (renomeado) aparecem como órfãos.
create function public.app_ch_taxonomy_aliases() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_pub uuid;
begin
  perform public.ch_assert_staff();
  select id into v_pub from public.ch_taxonomy_versions where status = 'published';
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'alias', a.alias, 'node_id', k.node_id, 'path', k.path, 'orphan', k.node_id is null) order by k.path nulls last, a.alias)
                   from public.ch_taxonomy_aliases a left join public.ch_taxonomy_keys(v_pub) k on k.path_key = a.path_key), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 3. natureza da fonte
alter table public.ch_sources add column source_type text check (source_type in (
  'GUIDELINE', 'PCDT', 'LAW', 'MANUAL', 'CONSENSUS', 'ARTICLE', 'SYSTEMATIC_REVIEW', 'BOOK', 'OFFICIAL_EXAM', 'OFFICIAL_ANSWER_KEY', 'VIDEO', 'AUDIO', 'WEB_PAGE', 'SLIDES', 'DOCUMENT', 'OTHER'));
alter table public.ch_sources add column authors text;
alter table public.ch_sources add column language text not null default 'pt';
alter table public.ch_sources add column is_primary_source boolean not null default false;

-- Campos do registro (item 60): país, SUS, especialidade, tema, vigência, revisão e "em atualização".
create or replace function public.app_ch_set_source_registry(p_source_id uuid, p_fields jsonb) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_fields ? 'country' and coalesce(p_fields ->> 'country', '') !~ '^[A-Z]{2}$' then
    raise exception 'País: use a sigla de duas letras (ex.: BR).' using errcode = '22023';
  end if;
  update public.ch_sources set
    country = case when p_fields ? 'country' then p_fields ->> 'country' else country end,
    applies_to_sus = case when p_fields ? 'applies_to_sus' then coalesce((p_fields ->> 'applies_to_sus')::boolean, false) else applies_to_sus end,
    specialty = case when p_fields ? 'specialty' then nullif(btrim(p_fields ->> 'specialty'), '') else specialty end,
    theme = case when p_fields ? 'theme' then nullif(btrim(p_fields ->> 'theme'), '') else theme end,
    effective_date = case when p_fields ? 'effective_date' then nullif(p_fields ->> 'effective_date', '')::date else effective_date end,
    revision_date = case when p_fields ? 'revision_date' then nullif(p_fields ->> 'revision_date', '')::date else revision_date end,
    update_in_progress = case when p_fields ? 'update_in_progress' then coalesce((p_fields ->> 'update_in_progress')::boolean, false) else update_in_progress end,
    source_type = case when p_fields ? 'source_type' then nullif(p_fields ->> 'source_type', '') else source_type end,
    authors = case when p_fields ? 'authors' then nullif(btrim(p_fields ->> 'authors'), '') else authors end,
    language = case when p_fields ? 'language' then coalesce(nullif(btrim(p_fields ->> 'language'), ''), 'pt') else language end,
    is_primary_source = case when p_fields ? 'is_primary_source' then coalesce((p_fields ->> 'is_primary_source')::boolean, false) else is_primary_source end
  where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('source.registry', p_source_id::text, p_fields);
  return true;
end
$$;


-- ---------------------------------------------------------------- 4. prompts guardados
create table public.ch_prompt_versions (
  id bigint generated always as identity primary key,
  prompt_id text not null,
  version text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  system text not null,
  schema jsonb,
  first_seen_at timestamptz not null default now(),
  unique (prompt_id, version, content_hash)
);
alter table public.ch_prompt_versions enable row level security;
create policy "prompts: equipe lê" on public.ch_prompt_versions for select to authenticated using (public.is_staff());

create function public.ch_worker_register_prompt(p_prompt_id text, p_version text, p_hash text, p_system text, p_schema jsonb) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  insert into public.ch_prompt_versions (prompt_id, version, content_hash, system, schema) values (p_prompt_id, p_version, p_hash, p_system, p_schema)
  on conflict (prompt_id, version, content_hash) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

create function public.app_ch_prompt_versions(p_prompt_id text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.prompt_id, p.first_seen_at desc) from (
    select prompt_id, version, content_hash, first_seen_at, char_length(system) as system_length from public.ch_prompt_versions where p_prompt_id is null or prompt_id = p_prompt_id) p), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 5. conflitos entre fontes
create table public.ch_conflicts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.ch_claims (id) on delete cascade,
  source_a uuid not null references public.ch_sources (id) on delete cascade,      -- a que sustenta a afirmação
  source_b uuid not null references public.ch_sources (id) on delete cascade,      -- a que discorda
  nature text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'deferred')),
  chosen_source uuid references public.ch_sources (id),
  resolution text,
  detected_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  unique (claim_id, source_a, source_b),
  check (source_a <> source_b),
  check (status <> 'resolved' or chosen_source in (source_a, source_b))
);
alter table public.ch_conflicts enable row level security;
create policy "conflitos: equipe lê" on public.ch_conflicts for select to authenticated using (public.is_staff());

-- Procura afirmações com uma fonte vigente que sustenta e OUTRA fonte vigente que discorda ou diz desatualizado.
create function public.app_ch_conflicts_detect() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.assert_staff();
  insert into public.ch_conflicts (claim_id, source_a, source_b, nature)
  select distinct ok.claim_id, ok.source_id, bad.source_id,
         case when bad.verdict = 'conflicting' then 'Recomendação divergente' else 'Outra fonte indica conduta desatualizada' end
  from public.ch_evidence ok join public.ch_sources sa on sa.id = ok.source_id and sa.status = 'current'
    join public.ch_evidence bad on bad.claim_id = ok.claim_id and bad.verdict in ('conflicting', 'outdated') and not bad.stale
    join public.ch_sources sb on sb.id = bad.source_id and sb.status = 'current'
  where ok.verdict = 'compatible' and not ok.stale and ok.source_id <> bad.source_id
  on conflict (claim_id, source_a, source_b) do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform public.ch_log('conflict.detect', null, jsonb_build_object('new', n)); end if;
  return n;
end
$$;

create function public.app_ch_conflicts(p_status text default 'open') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', k.id, 'status', k.status, 'nature', k.nature, 'detected_at', k.detected_at, 'claim_id', k.claim_id, 'statement', c.statement,
      'a', jsonb_build_object('source_id', sa.id, 'title', sa.title, 'organ', sa.organ, 'version', sa.version, 'authority', sa.authority_level, 'published_on', sa.published_on,
            'quote', (select e.quote from public.ch_evidence e where e.claim_id = k.claim_id and e.source_id = sa.id and not e.stale and e.verdict = 'compatible' limit 1)),
      'b', jsonb_build_object('source_id', sb.id, 'title', sb.title, 'organ', sb.organ, 'version', sb.version, 'authority', sb.authority_level, 'published_on', sb.published_on,
            'quote', (select e.quote from public.ch_evidence e where e.claim_id = k.claim_id and e.source_id = sb.id and not e.stale and e.verdict in ('conflicting', 'outdated') limit 1)),
      'chosen_source', k.chosen_source, 'resolution', k.resolution, 'decided_at', k.decided_at,
      'questions', (select count(distinct qc.question_id)::int from public.question_claims qc where qc.claim_id = k.claim_id)) order by k.detected_at desc)
    from public.ch_conflicts k join public.ch_claims c on c.id = k.claim_id join public.ch_sources sa on sa.id = k.source_a join public.ch_sources sb on sb.id = k.source_b
    where p_status is null or k.status = p_status), '[]'::jsonb);
end
$$;

-- Decisão de um administrador, com motivo. A escolha nunca é silenciosa e nunca apaga a evidência.
create function public.app_ch_conflict_decide(p_conflict_id uuid, p_status text, p_chosen_source uuid, p_note text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare k public.ch_conflicts;
begin
  perform public.assert_admin();
  select * into k from public.ch_conflicts where id = p_conflict_id for update;
  if not found then raise exception 'Conflito não encontrado.' using errcode = 'P0002'; end if;
  if p_status not in ('resolved', 'deferred', 'open') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if p_status <> 'open' and char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Registre o motivo da decisão (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_status = 'resolved' and p_chosen_source is distinct from k.source_a and p_chosen_source is distinct from k.source_b then
    raise exception 'Escolha uma das duas fontes do conflito.' using errcode = '22023';
  end if;
  update public.ch_conflicts set status = p_status, chosen_source = case when p_status = 'resolved' then p_chosen_source end, resolution = nullif(btrim(p_note), ''),
         decided_by = (select auth.uid()), decided_at = now() where id = p_conflict_id;
  perform public.ch_log('conflict.' || p_status, p_conflict_id::text, jsonb_build_object('claim', k.claim_id, 'chosen', p_chosen_source, 'note', btrim(p_note)));
  return true;
end
$$;

-- "evidência pronta": conflito resolvido por um administrador a favor da OUTRA fonte deixa de bloquear
create or replace function public.question_evidence_ready(p_question_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.question_claims where question_id = p_question_id and role = 'solves')
     and not exists (
       select 1 from public.question_claims qc
       where qc.question_id = p_question_id and qc.role = 'solves'
         and (not exists (select 1 from public.ch_evidence e join public.ch_sources s on s.id = e.source_id
                          where e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale and e.checked_by is not null
                            and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current')
              or exists (select 1 from public.ch_evidence c join public.ch_sources s2 on s2.id = c.source_id
                         where c.claim_id = qc.claim_id and c.verdict in ('conflicting', 'outdated') and not c.stale
                           and s2.authority_level in ('A', 'B', 'C', 'D') and s2.kind = 'final' and s2.status = 'current'
                           and not exists (select 1 from public.ch_conflicts k where k.claim_id = qc.claim_id and k.status = 'resolved'
                                           and c.source_id in (k.source_a, k.source_b) and k.chosen_source is distinct from c.source_id))))
$$;

-- ---------------------------------------------------------------- 6. confiança composta
-- Nunca é uma "porcentagem": é um nível calculado por regras, com os componentes à vista.
--   REVIEW_REQUIRED  conflito aberto, sem fonte oficial compatível, número/negação sem sustentação ou dado crítico sem conferência humana
--   HIGH             citação com página + conferência humana + números ok + (fonte nível A ou duas fontes oficiais concordantes)
--   MODERATE         o resto
create function public.ch_claim_confidence(p_claim_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.ch_claims;
  v_best text;
  v_sources integer;
  v_cited boolean;
  v_human boolean;
  v_numeric boolean;
  v_conflict boolean;
  v_critical boolean;
  v_level text;
begin
  select * into c from public.ch_claims where id = p_claim_id;
  if not found then return null; end if;
  select min(s.authority_level), count(distinct s.id)::int, coalesce(bool_or(e.page is not null and char_length(btrim(e.quote)) > 0), false),
         coalesce(bool_or(e.checked_by is not null), false), coalesce(bool_and(coalesce((e.numeric_check ->> 'ok')::boolean, true)), true)
    into v_best, v_sources, v_cited, v_human, v_numeric
  from public.ch_evidence e join public.ch_sources s on s.id = e.source_id and s.status = 'current' and s.authority_level in ('A', 'B', 'C', 'D')
  where e.claim_id = p_claim_id and e.verdict = 'compatible' and not e.stale;
  v_sources := coalesce(v_sources, 0);
  v_conflict := exists (select 1 from public.ch_conflicts k where k.claim_id = p_claim_id and k.status = 'open')
             or exists (select 1 from public.ch_evidence e where e.claim_id = p_claim_id and e.verdict = 'conflicting' and not e.stale);
  v_critical := cardinality(c.critical_kinds) > 0 and c.critical_checked_at is null;
  v_level := case
    when v_conflict or v_sources = 0 or not coalesce(v_numeric, true) or v_critical then 'REVIEW_REQUIRED'
    when v_cited and v_human and (v_best = 'A' or v_sources >= 2) then 'HIGH'
    else 'MODERATE' end;
  return jsonb_build_object('level', v_level, 'components', jsonb_build_object(
    'best_authority', v_best, 'official_sources', v_sources, 'cited_with_page', coalesce(v_cited, false), 'human_checked', coalesce(v_human, false),
    'numbers_supported', coalesce(v_numeric, true), 'conflict', v_conflict, 'critical_pending', v_critical));
end
$$;

create function public.app_ch_claim_confidence(p_claim_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return public.ch_claim_confidence(p_claim_id);
end
$$;

do $revoke$
begin
  revoke execute on function public.ch_flag(text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_flag(text) from public, anon, authenticated;
  revoke execute on function public.ch_publish_impl(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_taxonomy_keys(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_worker_register_prompt(text, text, text, text, jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_claim_confidence(uuid) from public, anon, authenticated;
  revoke execute on function public.question_evidence_ready(text) from public, anon, authenticated;
  revoke execute on function public.app_ch_flags() from public, anon;
  revoke execute on function public.app_ch_set_flag(text, boolean, text) from public, anon;
  revoke execute on function public.app_ch_publish(uuid) from public, anon;
  revoke execute on function public.app_ch_taxonomy_find(text, integer) from public, anon;
  revoke execute on function public.app_ch_taxonomy_add_alias(uuid, text) from public, anon;
  revoke execute on function public.app_ch_taxonomy_remove_alias(uuid) from public, anon;
  revoke execute on function public.app_ch_taxonomy_aliases() from public, anon;
  revoke execute on function public.app_ch_set_source_registry(uuid, jsonb) from public, anon;
  revoke execute on function public.app_ch_prompt_versions(text) from public, anon;
  revoke execute on function public.app_ch_conflicts_detect() from public, anon;
  revoke execute on function public.app_ch_conflicts(text) from public, anon;
  revoke execute on function public.app_ch_conflict_decide(uuid, text, uuid, text) from public, anon;
  revoke execute on function public.app_ch_claim_confidence(uuid) from public, anon;
end
$revoke$;
