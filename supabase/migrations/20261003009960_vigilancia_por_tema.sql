-- =============================================================================
-- VIGILÂNCIA POR TEMA (pedido do dono, 13/10/2026): "um motor de busca de atualizações sobre cada tema, para não montarmos
-- questões, aulas, nem corrigirmos questões com informações erradas". Sem IA. Precisa da 9940, da 9941 e da 9950 (importar aula pronta); número 9960 para rodar DEPOIS da 9950.
--
--   1. DOSSIÊ DE EVIDÊNCIA POR TEMA: tema da taxonomia da Central (ch_taxonomy_nodes) ↔ fontes da biblioteca (ch_sources), N:N,
--      com papel (principal, complementar, histórica); palavras-chave do tema (editáveis); data da última verificação pela equipe;
--      mudanças pendentes das fontes; o que depende do tema (unidades/aulas, flashcards, questões ligadas às fontes).
--      Semente: Tuberculose (aula GR-001) e Rotina do pré-natal de risco habitual (fontes validadas da aula de pré-natal).
--   2. DESCOBERTA DE DOCUMENTO NOVO: o vigia também lê PÁGINAS-ÍNDICE oficiais (notas informativas do gov.br/aids por ano,
--      publicações de tuberculose do gov.br/saude, PCDT da Conitec, provas do Inep...). Entre duas leituras, item novo (link +
--      título + data) que casa com as palavras-chave de um tema vira item "fonte_nova" (documento novo) da fila, por tema.
--      O documento descoberto NÃO entra na biblioteca sozinho: a equipe confere e cadastra.
--   3. PORTÃO POR TEMA: ch_topic_freshness(tema) → ok | vencido | mudanca_pendente | sem_dossie, com motivos. Configuração em
--      ch_vigilance_config.topic_gate: 'desligado' (padrão), 'aviso' (o motivo aparece para a equipe na importação de aula e na
--      prévia da publicação) ou 'bloqueia' (a publicação e a importação param). Só o administrador muda o modo. O aluno nunca vê.
--
-- Liga o portão por fora das funções que já existem (sem reescrevê-las): app_ch_import_lesson_package, app_ch_publish_preview e
-- ch_publish_problems ganham uma "casca" que chama a versão de antes (renomeada para *_antes_tema). Quem recolar a 9861 ou a 9950
-- depois disto precisa recolar esta migração (ela refaz a casca sem duplicar).
-- Pode ser colada mais de uma vez.
-- =============================================================================

-- ---------------------------------------------------------------- 1. dossiê do tema
create table if not exists public.ch_topic_dossiers (
  theme_node_id uuid primary key references public.ch_taxonomy_nodes (id) on delete cascade,
  keywords text[] not null default '{}' check (cardinality(keywords) <= 60),
  -- prazo para a equipe conferir de novo o dossiê (dias)
  max_age_days integer not null default 90 check (max_age_days between 1 and 730),
  last_verified_at timestamptz,
  last_verified_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ch_topic_sources (
  theme_node_id uuid not null references public.ch_topic_dossiers (theme_node_id) on delete cascade,
  source_id uuid not null references public.ch_sources (id) on delete cascade,
  role text not null check (role in ('principal', 'complementar', 'historica')),
  note text check (note is null or char_length(note) <= 500),
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (theme_node_id, source_id)
);
create index if not exists ch_topic_sources_source_idx on public.ch_topic_sources (source_id);

-- ---------------------------------------------------------------- 2. páginas-índice oficiais
create table if not exists public.ch_index_pages (
  id uuid primary key default gen_random_uuid(),
  url text not null unique check (url ~ '^https://' and char_length(url) <= 2000),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  active boolean not null default true,
  domain_id uuid references public.ch_official_domains (id) on delete set null,
  items jsonb,                                   -- última leitura: [{url, titulo, descricao, data}]
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  checking_since timestamptz,
  last_status text check (last_status is null or last_status in ('ok', 'unreachable', 'fora_da_lista')),
  last_error text,
  fail_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ch_vigilance_config add column if not exists topic_gate text not null default 'desligado';
alter table public.ch_vigilance_config drop constraint if exists ch_vigilance_config_topic_gate_check;
alter table public.ch_vigilance_config add constraint ch_vigilance_config_topic_gate_check check (topic_gate in ('desligado', 'aviso', 'bloqueia'));

-- documento descoberto numa página-índice: item da fila SEM fonte da biblioteca (ainda), ligado ao tema e à página
alter table public.ch_vigilance_items drop constraint if exists ch_vigilance_items_index_page_fk;
alter table public.ch_vigilance_items add constraint ch_vigilance_items_index_page_fk foreign key (index_page_id) references public.ch_index_pages (id) on delete cascade;
alter table public.ch_vigilance_items drop constraint if exists ch_vigilance_items_origin_check;
alter table public.ch_vigilance_items add constraint ch_vigilance_items_origin_check check (source_id is not null or (index_page_id is not null and kind = 'fonte_nova'));
create unique index if not exists ch_vigilance_items_discovery_key on public.ch_vigilance_items (discovery_key) where discovery_key is not null;
create index if not exists ch_vigilance_items_theme_idx on public.ch_vigilance_items (theme_node_id);

alter table public.ch_topic_dossiers enable row level security;
alter table public.ch_topic_sources enable row level security;
alter table public.ch_index_pages enable row level security;
drop policy if exists "dossiê do tema: equipe lê" on public.ch_topic_dossiers;
create policy "dossiê do tema: equipe lê" on public.ch_topic_dossiers for select to authenticated using (public.is_staff());
drop policy if exists "fontes do tema: equipe lê" on public.ch_topic_sources;
create policy "fontes do tema: equipe lê" on public.ch_topic_sources for select to authenticated using (public.is_staff());
drop policy if exists "páginas-índice: equipe lê" on public.ch_index_pages;
create policy "páginas-índice: equipe lê" on public.ch_index_pages for select to authenticated using (public.is_staff());
revoke all on table public.ch_topic_dossiers, public.ch_topic_sources, public.ch_index_pages from anon;
revoke insert, update, delete, truncate on table public.ch_topic_dossiers, public.ch_topic_sources, public.ch_index_pages from authenticated;

-- ---------------------------------------------------------------- 3. situação do tema (portão)
-- ok | vencido | mudanca_pendente | sem_dossie, com os motivos em português (só para a equipe).
create or replace function public.ch_topic_freshness(p_theme_node_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.ch_topic_dossiers;
  v_motivos text[] := '{}';
  v_pend text[] := '{}';
  v_venc text[] := '{}';
  r record;
begin
  select * into d from public.ch_topic_dossiers where theme_node_id = p_theme_node_id;
  if not found then
    return jsonb_build_object('status', 'sem_dossie', 'motivos', jsonb_build_array('O tema não tem dossiê de evidência (fontes vigentes conferidas).'));
  end if;
  if not exists (select 1 from public.ch_topic_sources t join public.ch_sources s on s.id = t.source_id
                  where t.theme_node_id = d.theme_node_id and t.role = 'principal' and s.status = 'current') then
    return jsonb_build_object('status', 'sem_dossie', 'motivos', jsonb_build_array('O dossiê do tema não tem nenhuma fonte principal vigente.'));
  end if;
  -- fontes do dossiê que deixaram de valer
  for r in select s.title, s.status, s.retracted_at from public.ch_topic_sources t join public.ch_sources s on s.id = t.source_id
            where t.theme_node_id = d.theme_node_id and t.role in ('principal', 'complementar') and (s.status <> 'current' or s.retracted_at is not null) loop
    v_pend := v_pend || ('Fonte "' || left(r.title, 120) || '" ' || case when r.retracted_at is not null then 'foi retratada.'
                                                                        when r.status = 'superseded' then 'foi substituída por versão nova.' else 'foi retirada ou bloqueada.' end);
  end loop;
  -- itens abertos da fila: das fontes do dossiê e documentos novos achados para o tema
  for r in select i.kind, i.summary, s.title from public.ch_vigilance_items i left join public.ch_sources s on s.id = i.source_id
            where i.status in ('pendente', 'vista') and i.kind in ('mudanca', 'nova_versao', 'retratada', 'quarentena', 'fonte_nova')
              and ((i.kind <> 'fonte_nova' and i.source_id in (select t.source_id from public.ch_topic_sources t where t.theme_node_id = d.theme_node_id and t.role <> 'historica'))
                   or (i.kind = 'fonte_nova' and i.theme_node_id = d.theme_node_id))
            order by i.detected_at desc limit 10 loop
    v_pend := v_pend || (case r.kind when 'fonte_nova' then 'Documento oficial novo para o tema: ' when 'nova_versao' then 'Possível versão nova: '
                                     when 'retratada' then 'Fonte retratada: ' when 'quarentena' then 'Fonte em quarentena: ' else 'Fonte mudou: ' end
                         || left(coalesce(r.title, r.summary), 200));
  end loop;
  -- prazos
  if d.last_verified_at is null then v_venc := v_venc || 'O dossiê nunca foi conferido pela equipe.'::text;
  elsif d.last_verified_at < now() - make_interval(days => d.max_age_days) then
    v_venc := v_venc || ('Última conferência do dossiê em ' || public.ch_br_date(d.last_verified_at) || ' (prazo de ' || d.max_age_days || ' dias).');
  end if;
  for r in select s.title, w.last_status, w.last_checked_at, w.interval_days from public.ch_topic_sources t join public.ch_sources s on s.id = t.source_id
             join public.ch_source_watch w on w.source_id = s.id
            where t.theme_node_id = d.theme_node_id and t.role = 'principal'
              and (w.last_status = 'unreachable' or w.last_checked_at is null or w.last_checked_at < now() - make_interval(days => 2 * w.interval_days + 1)) loop
    v_venc := v_venc || ('Fonte "' || left(r.title, 120) || '" ' || case when r.last_status = 'unreachable' then 'está com o link fora do ar.' else 'está com a conferência do link atrasada.' end);
  end loop;
  v_motivos := v_pend || v_venc;
  return jsonb_build_object('status', case when cardinality(v_pend) > 0 then 'mudanca_pendente' when cardinality(v_venc) > 0 then 'vencido' else 'ok' end,
                            'motivos', to_jsonb(v_motivos), 'verificado_em', d.last_verified_at);
end
$$;

-- Portão: modo atual e a situação do tema. 'bloqueia' só quando o administrador ligou; 'desligado' nunca diz nada.
create or replace function public.ch_topic_gate(p_theme_node_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('modo', c.topic_gate, 'tema_id', p_theme_node_id,
    'tema', (select n.name from public.ch_taxonomy_nodes n where n.id = p_theme_node_id)) || public.ch_topic_freshness(p_theme_node_id)
  from public.ch_vigilance_config c where c.id
$$;

-- ---------------------------------------------------------------- 4. portão nas funções que já existem (casca)
do $casca$
declare
  f record;
begin
  -- para cada função: se a que está no banco NÃO é a casca (primeira colagem, ou alguém recolou a 9861/9950 ou o pacote da aula),
  -- ela vira a "_antes_tema" (a anterior, se houver, sai) e a casca abaixo é criada de novo por cima
  for f in select * from (values ('ch_publish_problems', 'uuid'), ('app_ch_publish_preview', 'uuid, jsonb'), ('app_ch_import_lesson_package', 'jsonb')) as x(nome, args) loop
    if to_regprocedure(format('public.%s(%s)', f.nome, f.args)) is not null
       and position('_antes_tema' in (select p.prosrc from pg_proc p where p.oid = to_regprocedure(format('public.%s(%s)', f.nome, f.args)))) = 0 then
      execute format('drop function if exists public.%s_antes_tema(%s)', f.nome, f.args);
      execute format('alter function public.%s(%s) rename to %s_antes_tema', f.nome, f.args, f.nome);
    end if;
  end loop;
end
$casca$;
-- recolar a 9861/9950 (ou o pacote da aula GR-001) recria as originais: colar esta migração de novo refaz a casca por cima delas

-- modo 'bloqueia': o tema fora de "ok" vira problema que trava a publicação (ch_publish_impl recusa com a lista)
create or replace function public.ch_publish_problems(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  p text[] := public.ch_publish_problems_antes_tema(p_version_id);
  g jsonb;
begin
  g := public.ch_topic_gate((select u.theme_node_id from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id = p_version_id));
  if g ->> 'modo' = 'bloqueia' and g ->> 'status' <> 'ok' then
    p := p || ('Tema "' || coalesce(g ->> 'tema', '?') || '" com evidência ' || case g ->> 'status' when 'sem_dossie' then 'sem dossiê' when 'vencido' then 'vencida'
                 else 'com mudança pendente' end || ' (Vigilância científica): ' || coalesce((select string_agg(m, ' ') from jsonb_array_elements_text(g -> 'motivos') m), ''));
  end if;
  return p;
end
$$;
revoke execute on function public.ch_publish_problems(uuid) from public, anon, authenticated;
revoke execute on function public.ch_publish_problems_antes_tema(uuid) from public, anon, authenticated;

create or replace function public.app_ch_publish_preview(p_version_id uuid, p_options jsonb default '{}'::jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  r jsonb := public.app_ch_publish_preview_antes_tema(p_version_id, p_options);
  g jsonb := public.ch_topic_gate((select u.theme_node_id from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id = p_version_id));
begin
  return r || jsonb_build_object('tema', case when g ->> 'modo' = 'desligado' then jsonb_build_object('modo', 'desligado') else g end);
end
$$;
revoke execute on function public.app_ch_publish_preview(uuid, jsonb) from public, anon;
grant execute on function public.app_ch_publish_preview(uuid, jsonb) to authenticated;
revoke execute on function public.app_ch_publish_preview_antes_tema(uuid, jsonb) from public, anon, authenticated;

-- importação de aula pronta: o tema do pacote é conferido ANTES de gravar ('bloqueia' recusa; 'aviso' devolve o motivo junto)
create or replace function public.app_ch_import_lesson_package(p_package jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_node uuid;
  g jsonb;
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.is_staff() then
    raise exception 'Importar aula pronta é só para administrador ou editor da Central de Conteúdo.' using errcode = '42501';
  end if;
  select n.id into v_node
    from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions tv on tv.id = n.version_id and tv.status = 'published'
   where n.level in ('theme', 'subtheme') and n.status = 'active'
     and public.fold_text(btrim(n.name)) = public.fold_text(btrim(coalesce(p_package #>> '{tema,tema}', '')))
     and public.ch_node_area_code(n.id) = coalesce(p_package #>> '{tema,area}', '')
   order by case n.level when 'theme' then 0 else 1 end limit 1;
  g := case when v_node is not null then public.ch_topic_gate(v_node) end;
  if g ->> 'modo' = 'bloqueia' and g ->> 'status' <> 'ok' then
    raise exception 'Importação parada pela Vigilância científica: o tema "%" está com evidência %. %', g ->> 'tema',
      case g ->> 'status' when 'sem_dossie' then 'sem dossiê' when 'vencido' then 'vencida' else 'com mudança pendente' end,
      coalesce((select string_agg(m, ' ') from jsonb_array_elements_text(g -> 'motivos') m), '') using errcode = '55000';
  end if;
  r := public.app_ch_import_lesson_package_antes_tema(p_package);
  if g ->> 'modo' = 'aviso' then r := r || jsonb_build_object('tema', g); end if;
  return r;
end
$$;
revoke execute on function public.app_ch_import_lesson_package(jsonb) from public, anon;
grant execute on function public.app_ch_import_lesson_package(jsonb) to authenticated;
revoke execute on function public.app_ch_import_lesson_package_antes_tema(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. processamento: páginas-índice
create or replace function public.ch_worker_index_pages_due(p_limit integer default 10) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  update public.ch_index_pages p set domain_id = public.ch_watch_domain_of(p.url) where p.active and p.next_check_at <= now();
  update public.ch_index_pages p set last_status = 'fora_da_lista', last_checked_at = now(), next_check_at = now() + interval '1 day',
         last_error = 'Endereço fora da lista de sites oficiais ativos: o vigia não baixa.'
   where p.active and p.next_check_at <= now() and p.domain_id is null;
  with picked as (
    select p.id from public.ch_index_pages p
     where p.active and p.domain_id is not null and p.next_check_at <= now()
       and (p.checking_since is null or p.checking_since < now() - interval '20 minutes')
     order by p.next_check_at limit least(greatest(coalesce(p_limit, 10), 1), 50) for update skip locked
  ), upd as (update public.ch_index_pages p set checking_since = now() from picked k where p.id = k.id returning p.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'url', u.url, 'title', u.title, 'items', u.items)), '[]'::jsonb) into v from upd u;
  return v;
end
$$;

-- Resultado de uma página-índice. p_report: status ('ok' | 'unreachable'), items [{url, titulo, descricao, data}], error.
-- Primeira leitura = base (nada é "novo"). Depois: item novo que casa com as palavras-chave de um tema → item "fonte_nova" da fila
-- daquele tema (um por documento e tema); item já cadastrado na biblioteca (mesmo link) não é avisado.
create or replace function public.ch_worker_index_page_report(p_page_id uuid, p_report jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  pg public.ch_index_pages;
  r jsonb := coalesce(p_report, '{}'::jsonb);
  v_items jsonb;
  v_days integer;
  it jsonb;
  t record;
  v_text text;
  v_hits text[];
  v_new integer := 0;
  v_found integer := 0;
  v_prev text := current_setting('staziamed.automacao', true);
begin
  perform set_config('staziamed.automacao', 'vigilancia', true);
  select * into pg from public.ch_index_pages where id = p_page_id for update;
  if not found then perform set_config('staziamed.automacao', coalesce(v_prev, ''), true); return null; end if;
  v_days := coalesce(public.ch_watch_interval_for(pg.domain_id), 1);
  if coalesce(r ->> 'status', '') <> 'ok' or jsonb_typeof(r -> 'items') <> 'array' then
    update public.ch_index_pages set last_status = 'unreachable', last_checked_at = now(), checking_since = null, fail_count = fail_count + 1,
           last_error = coalesce(public.ch_vigilance_clean_text(r ->> 'error', 300), 'Sem resposta.'), next_check_at = now() + interval '1 day'
     where id = p_page_id;
    perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
    return jsonb_build_object('status', 'unreachable');
  end if;
  perform public.ch_auto_change_assert('nova_versao_catalogo');
  -- itens limpos (só dado): link https dentro dos sites oficiais, título, descrição e data
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_items from (
    select jsonb_build_object('url', public.ch_vigilance_clean_text(e ->> 'url', 2000), 'titulo', public.ch_vigilance_clean_text(e ->> 'titulo', 300),
                              'descricao', public.ch_vigilance_clean_text(e ->> 'descricao', 500),
                              'data', case when (e ->> 'data') ~ '^\d{4}-\d{2}-\d{2}$' then e ->> 'data' end) as x
      from jsonb_array_elements(r -> 'items') e
     where jsonb_typeof(e) = 'object' and (e ->> 'url') ~ '^https://\S+$' and public.ch_watch_domain_of(e ->> 'url') is not null
       and public.ch_vigilance_clean_text(e ->> 'titulo', 300) is not null
     limit 500) y;
  if pg.items is not null then
    for it in select e from jsonb_array_elements(v_items) e
               where not exists (select 1 from jsonb_array_elements(pg.items) o where o ->> 'url' = e ->> 'url') loop
      v_found := v_found + 1;
      if exists (select 1 from public.ch_sources s where public.ch_url_norm(s.url) = public.ch_url_norm(it ->> 'url')) then continue; end if;
      v_text := public.fold_text(coalesce(it ->> 'titulo', '') || ' ' || coalesce(it ->> 'descricao', ''));
      for t in select d.theme_node_id, d.keywords from public.ch_topic_dossiers d where cardinality(d.keywords) > 0 loop
        select array_agg(k) into v_hits from unnest(t.keywords) k
         where char_length(btrim(k)) > 0
           and (case when char_length(public.fold_text(btrim(k))) <= 4
                     then (' ' || regexp_replace(v_text, '[^a-z0-9]+', ' ', 'g') || ' ') like '% ' || public.fold_text(btrim(k)) || ' %'
                     else v_text like '%' || public.fold_text(btrim(k)) || '%' end);
        if v_hits is null then continue; end if;
        insert into public.ch_vigilance_items (source_id, kind, theme_node_id, index_page_id, discovery_key, summary, version_candidates, details)
        values (null, 'fonte_nova', t.theme_node_id, pg.id, md5(t.theme_node_id::text || '|' || public.ch_url_norm(it ->> 'url')),
                left('Documento oficial novo para o tema "' || coalesce((select n.name from public.ch_taxonomy_nodes n where n.id = t.theme_node_id), '?') || '": '
                     || (it ->> 'titulo') || coalesce(' — ' || (it ->> 'descricao'), ''), 600),
                jsonb_build_array(jsonb_build_object('url', it ->> 'url', 'titulo', it ->> 'titulo', 'data', it ->> 'data', 'ato', it ->> 'titulo')),
                jsonb_build_object('pagina', pg.url, 'pagina_titulo', pg.title, 'palavras', to_jsonb(v_hits), 'descricao', it ->> 'descricao'))
        on conflict do nothing;
        if found then v_new := v_new + 1; end if;
      end loop;
    end loop;
  end if;
  update public.ch_index_pages set items = v_items, last_status = 'ok', last_error = null, fail_count = 0, last_checked_at = now(), checking_since = null,
         next_check_at = now() + make_interval(days => v_days)
   where id = p_page_id;
  perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
  return jsonb_build_object('status', 'ok', 'itens', jsonb_array_length(v_items), 'novos_na_pagina', v_found, 'avisos', v_new, 'base', pg.items is null);
end
$$;

-- ---------------------------------------------------------------- 6. funções da equipe (painel)
create or replace function public.ch_topic_dependents(p_theme_node_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'titulo', u.title,
                   'versao', (select jsonb_build_object('id', v.id, 'versao', v.version, 'status', v.status) from public.ch_unit_versions v where v.unit_id = u.id order by v.version desc limit 1),
                   'aula_publicada', exists (select 1 from public.lessons l where l.ch_unit_id = u.id and l.published)) order by u.title)
                 from public.ch_units u where u.theme_node_id = p_theme_node_id), '[]'::jsonb),
    'flashcards', (select count(*)::int from public.ch_materials m join public.ch_unit_versions v on v.id = m.unit_version_id join public.ch_units u on u.id = v.unit_id
                    where u.theme_node_id = p_theme_node_id and m.kind = 'flashcards'),
    'questoes', (select count(distinct q)::int from (
                   select l.question_id as q from public.question_source_links l join public.ch_topic_sources t on t.source_id = l.source_id where t.theme_node_id = p_theme_node_id
                   union select qc.question_id from public.question_claims qc join public.ch_claims c on c.id = qc.claim_id where c.theme_node_id = p_theme_node_id) x))
$$;

create or replace function public.ch_topic_json(p_theme_node_id uuid, p_full boolean) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('tema_id', d.theme_node_id, 'tema', n.name, 'area', public.ch_node_area_code(n.id), 'palavras_chave', to_jsonb(d.keywords),
    'prazo_dias', d.max_age_days, 'verificado_em', d.last_verified_at, 'verificado_por', (select u.email from auth.users u where u.id = d.last_verified_by), 'nota', d.note,
    'situacao', public.ch_topic_freshness(d.theme_node_id),
    'fontes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'titulo', s.title, 'orgao', s.organ, 'versao', s.version, 'url', s.url, 'nivel', s.authority_level,
                  'status', s.status, 'papel', t.role, 'ultima_conferencia', w.last_checked_at, 'link', w.last_status, 'retratada', s.retracted_at is not null)
                  order by case t.role when 'principal' then 0 when 'complementar' then 1 else 2 end, s.title)
               from public.ch_topic_sources t join public.ch_sources s on s.id = t.source_id left join public.ch_source_watch w on w.source_id = s.id
              where t.theme_node_id = d.theme_node_id), '[]'::jsonb),
    'pendencias', (select count(*)::int from public.ch_vigilance_items i where i.status in ('pendente', 'vista')
                    and (i.theme_node_id = d.theme_node_id or i.source_id in (select t.source_id from public.ch_topic_sources t where t.theme_node_id = d.theme_node_id))))
    || case when p_full then jsonb_build_object('depende', public.ch_topic_dependents(d.theme_node_id),
         'itens', coalesce((select jsonb_agg(public.ch_vigilance_item_json(i.id) order by i.detected_at desc) from public.ch_vigilance_items i
                            where i.status in ('pendente', 'vista') and (i.theme_node_id = d.theme_node_id
                                  or i.source_id in (select t.source_id from public.ch_topic_sources t where t.theme_node_id = d.theme_node_id))), '[]'::jsonb))
       else '{}'::jsonb end
  from public.ch_topic_dossiers d join public.ch_taxonomy_nodes n on n.id = d.theme_node_id
  where d.theme_node_id = p_theme_node_id
$$;

-- cartões por tema (equipe)
create or replace function public.app_admin_topics() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object('modo_portao', (select topic_gate from public.ch_vigilance_config where id),
    'temas', coalesce((select jsonb_agg(public.ch_topic_json(d.theme_node_id, false) order by n.name) from public.ch_topic_dossiers d
                        join public.ch_taxonomy_nodes n on n.id = d.theme_node_id), '[]'::jsonb));
end
$$;

create or replace function public.app_admin_topic(p_theme_node_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_staff();
  v := public.ch_topic_json(p_theme_node_id, true);
  if v is null then
    if not exists (select 1 from public.ch_taxonomy_nodes where id = p_theme_node_id) then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
    return jsonb_build_object('tema_id', p_theme_node_id, 'tema', (select name from public.ch_taxonomy_nodes where id = p_theme_node_id),
                              'situacao', public.ch_topic_freshness(p_theme_node_id), 'fontes', '[]'::jsonb, 'depende', public.ch_topic_dependents(p_theme_node_id));
  end if;
  return v;
end
$$;

-- situação do tema de uma unidade (detalhe da unidade na Central)
create or replace function public.app_admin_unit_topic(p_unit_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_node uuid;
begin
  perform public.assert_staff();
  select theme_node_id into v_node from public.ch_units where id = p_unit_id;
  if not found then raise exception 'Unidade não encontrada.' using errcode = 'P0002'; end if;
  return public.ch_topic_gate(v_node);
end
$$;

create or replace function public.app_admin_topic_save(p_theme_node_id uuid, p_keywords text[], p_max_age_days integer default null, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if not exists (select 1 from public.ch_taxonomy_nodes where id = p_theme_node_id) then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  if p_max_age_days is not null and p_max_age_days not between 1 and 730 then raise exception 'Prazo de 1 a 730 dias.' using errcode = '22023'; end if;
  insert into public.ch_topic_dossiers (theme_node_id, keywords, max_age_days, note)
  values (p_theme_node_id, coalesce(array(select distinct left(btrim(k), 60) from unnest(p_keywords) k where btrim(k) <> ''), '{}'), coalesce(p_max_age_days, 90), left(nullif(btrim(coalesce(p_note, '')), ''), 1000))
  on conflict (theme_node_id) do update set
    keywords = case when p_keywords is null then ch_topic_dossiers.keywords else excluded.keywords end,
    max_age_days = coalesce(p_max_age_days, ch_topic_dossiers.max_age_days), note = coalesce(excluded.note, ch_topic_dossiers.note), updated_at = now();
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_theme_node_id::text, jsonb_build_object('acao', 'salvar', 'palavras', to_jsonb(p_keywords), 'prazo', p_max_age_days));
  return public.ch_topic_json(p_theme_node_id, true);
end
$$;

-- fonte no dossiê (papel nulo tira a fonte)
create or replace function public.app_admin_topic_set_source(p_theme_node_id uuid, p_source_id uuid, p_role text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if not exists (select 1 from public.ch_topic_dossiers where theme_node_id = p_theme_node_id) then raise exception 'Crie o dossiê do tema primeiro.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.ch_sources where id = p_source_id) then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if p_role is null then
    delete from public.ch_topic_sources where theme_node_id = p_theme_node_id and source_id = p_source_id;
  elsif p_role not in ('principal', 'complementar', 'historica') then
    raise exception 'Papel inválido: %.', p_role using errcode = '22023';
  else
    insert into public.ch_topic_sources (theme_node_id, source_id, role, added_by) values (p_theme_node_id, p_source_id, p_role, (select auth.uid()))
    on conflict (theme_node_id, source_id) do update set role = excluded.role;
  end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_theme_node_id::text, jsonb_build_object('acao', 'fonte', 'fonte', p_source_id, 'papel', p_role));
  return public.ch_topic_json(p_theme_node_id, true);
end
$$;

-- a equipe conferiu o dossiê agora (com nota)
create or replace function public.app_admin_topic_verified(p_theme_node_id uuid, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  perform public.assert_staff();
  if char_length(coalesce(v_note, '')) < 10 then raise exception 'Escreva o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.ch_topic_dossiers set last_verified_at = now(), last_verified_by = (select auth.uid()), note = v_note, updated_at = now() where theme_node_id = p_theme_node_id;
  if not found then raise exception 'Crie o dossiê do tema primeiro.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_theme_node_id::text, jsonb_build_object('acao', 'conferido', 'nota', v_note));
  return public.ch_topic_json(p_theme_node_id, true);
end
$$;

-- modo do portão: só o ADMINISTRADOR (decisão do dono; nunca liga sozinho)
create or replace function public.app_admin_vigilance_set_gate(p_mode text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_mode is null or p_mode not in ('desligado', 'aviso', 'bloqueia') then raise exception 'Modo inválido: use desligado, aviso ou bloqueia.' using errcode = '22023'; end if;
  update public.ch_vigilance_config set topic_gate = p_mode, updated_at = now(), updated_by = (select auth.uid()) where id;
  insert into public.admin_audit_log (actor_id, action, target, details) values ((select auth.uid()), 'vigilance.topic', 'portao', jsonb_build_object('modo', p_mode));
  return jsonb_build_object('modo_portao', p_mode);
end
$$;

create or replace function public.app_admin_index_pages() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url, 'titulo', p.title, 'ativa', p.active, 'itens', coalesce(jsonb_array_length(p.items), 0),
           'ultima_leitura', p.last_checked_at, 'proxima_leitura', p.next_check_at, 'situacao', p.last_status, 'erro', p.last_error,
           'site_oficial', p.domain_id is not null) order by p.title) from public.ch_index_pages p), '[]'::jsonb);
end
$$;

create or replace function public.app_admin_index_page_save(p_url text, p_title text, p_active boolean default true) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_url text := btrim(coalesce(p_url, ''));
begin
  perform public.assert_staff();
  if v_url !~ '^https://\S+$' then raise exception 'Use o endereço https da página oficial.' using errcode = '22023'; end if;
  if public.ch_watch_domain_of(v_url) is null then raise exception 'A página precisa estar num site da lista de sites oficiais.' using errcode = '22023'; end if;
  insert into public.ch_index_pages (url, title, active, domain_id, created_by)
  values (v_url, left(btrim(coalesce(p_title, v_url)), 200), coalesce(p_active, true), public.ch_watch_domain_of(v_url), (select auth.uid()))
  on conflict (url) do update set title = excluded.title, active = excluded.active, next_check_at = least(ch_index_pages.next_check_at, now());
  insert into public.admin_audit_log (actor_id, action, target, details) values ((select auth.uid()), 'vigilance.topic', v_url, jsonb_build_object('acao', 'pagina_indice', 'ativa', p_active));
  return public.app_admin_index_pages();
end
$$;

-- ---------------------------------------------------------------- 7. semente (dados reais das aulas-piloto; em outro banco, só o que existir)
insert into public.ch_index_pages (url, title) values
  ('https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2026', 'Notas informativas 2026 (HIV, IST, hepatites, tuberculose)'),
  ('https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2025', 'Notas informativas 2025 (HIV, IST, hepatites, tuberculose)'),
  ('https://www.gov.br/aids/pt-br/central-de-conteudo/notas-tecnicas', 'Notas técnicas (HIV, IST, hepatites, tuberculose)'),
  ('https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/tuberculose', 'Publicações de tuberculose (SVSA/MS)'),
  ('https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/guias-e-manuais/2026', 'Guias e manuais do Ministério da Saúde 2026'),
  ('https://www.gov.br/conitec/pt-br/assuntos/avaliacao-de-tecnologias-em-saude/protocolos-clinicos-e-diretrizes-terapeuticas', 'PCDT da Conitec'),
  ('https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/revalida/provas-e-gabaritos', 'Revalida: provas e gabaritos (Inep)')
on conflict (url) do nothing;
update public.ch_index_pages set domain_id = public.ch_watch_domain_of(url) where domain_id is null;

insert into public.ch_topic_dossiers (theme_node_id, keywords, note)
select n.id, x.kw, x.nota
  from (values
    ('CLINICA_MEDICA', 'tuberculose',
     array['tubercul', 'TB', 'BPaLM', 'TPT', 'ILTB', 'rifampicina', 'rifapentina', 'isoniazida', 'bedaquilina', 'pretomanida', 'micobacter', 'baciloscopia', 'antituberculos'],
     'Semente: fontes conferidas da aula GR-001 (aulas-piloto/GR-001/fontes.json).'),
    ('GINECOLOGIA_OBSTETRICIA', 'rotina do pre-natal de risco habitual',
     array['pré-natal', 'pre-natal', 'prenatal', 'gestante', 'gestação', 'gravidez', 'caderneta da gestante', 'Rede Alyne', 'Rede Cegonha', 'transmissão vertical'],
     'Semente: fontes conferidas da aula de pré-natal (aulas-piloto/_trabalho/val_pn.json).')
  ) as x(area, tema, kw, nota)
  join public.ch_taxonomy_nodes n on public.fold_text(n.name) = x.tema and n.level in ('theme', 'subtheme') and n.status = 'active'
  join public.ch_taxonomy_versions tv on tv.id = n.version_id and tv.status = 'published'
 where public.ch_node_area_code(n.id) = x.area
on conflict (theme_node_id) do nothing;

insert into public.ch_topic_sources (theme_node_id, source_id, role, note)
select d.theme_node_id, s.id, x.papel, 'Semente das aulas-piloto'
  from (values
    ('tuberculose', 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/vigilancia/guia-de-vigilancia-em-saude-volume-2-6a-edicao/@@download/file', 'principal'),
    ('tuberculose', 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/tuberculose/manual-de-recomendacoes-e-controle-da-tuberculose-no-brasil-2a-ed.pdf/@@download/file', 'principal'),
    ('tuberculose', 'https://www.gov.br/aids/pt-br/central-de-conteudo/notas-informativas/2024/nota-informativa-no-5-2024-cgtm.pdf/@@display-file/file', 'principal'),
    ('rotina do pre-natal de risco habitual', 'https://bvsms.saude.gov.br/bvs/publicacoes/cadernos_atencao_basica_32_prenatal.pdf', 'principal'),
    ('rotina do pre-natal de risco habitual', 'https://www.gov.br/saude/pt-br/vacinacao/publicacoes/instrucao-normativa-que-instrui-o-calendario-nacional-de-vacinacao-2026.pdf/@@download/file', 'principal'),
    ('rotina do pre-natal de risco habitual', 'https://bvsms.saude.gov.br/bvs/publicacoes/protocolo_clinico_hiv_sifilis_hepatites.pdf', 'principal'),
    ('rotina do pre-natal de risco habitual', 'https://bvsms.saude.gov.br/bvs/publicacoes/manual_gestacao_alto_risco.pdf', 'complementar'),
    ('rotina do pre-natal de risco habitual', 'https://bvsms.saude.gov.br/bvs/publicacoes/protocolos_atencao_basica_saude_mulheres.pdf', 'complementar')
  ) as x(tema, url, papel)
  join public.ch_topic_dossiers d on public.fold_text((select n.name from public.ch_taxonomy_nodes n where n.id = d.theme_node_id)) = x.tema
  join lateral (select s.id from public.ch_sources s where public.ch_url_norm(s.url) = public.ch_url_norm(x.url) order by (s.status = 'current') desc, s.created_at desc limit 1) s on true
on conflict (theme_node_id, source_id) do nothing;

-- ---------------------------------------------------------------- 8. permissões
do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ch_topic_freshness', 'ch_topic_gate', 'ch_worker_index_pages_due', 'ch_worker_index_page_report',
             'ch_topic_dependents', 'ch_topic_json') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('app_admin_topics', 'app_admin_topic', 'app_admin_unit_topic', 'app_admin_topic_save', 'app_admin_topic_set_source',
             'app_admin_topic_verified', 'app_admin_vigilance_set_gate', 'app_admin_index_pages', 'app_admin_index_page_save') loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$revoke$;
