-- =============================================================================
-- PORTÃO DE ATUALIDADE (pedido do dono, 13/10/2026): "nenhum conteúdo (aula, questão, explicação, correção) pode ir ao aluno com fonte
-- desatualizada; sempre buscar a atualização mais recente". Sem IA, sem chave. Precisa da 9940, 9941, 9950 e 9960; número 9990.
--
--   1. DOSSIÊS DOS 100 GRANDES TEMAS (GR-001 a GR-100): cada tema ↔ fontes oficiais (principal, complementar, histórica), com a EVIDÊNCIA
--      do vínculo (termo no título, nos temas do catálogo ou páginas do texto do PDF). É PROPOSTA automática por correspondência de texto:
--      só vira "conferida" quando a equipe clica "Marcar conferido" (com nome e data). Tema sem fonte principal cadastrada = "sem dossiê".
--      Não depende da tabela grande_temas (pacote à parte): a chave é o código GR-xxx.
--   2. REGRA "EM DIA" (ch_gt_freshness): em dia / atenção / desatualizado / sem dossiê, com os motivos em português simples.
--      Prazo por tipo de fonte: 30 dias (retificação, prévia, consulta pública), 90 dias (Ministério da Saúde e órgãos oficiais),
--      180 dias (só sociedades/internacionais); o prazo do dossiê pode ser mudado pela equipe.
--   3. ENCAIXE (por cima do que já existe, sem reescrevê-lo): importação/publicação de aula (ch_topic_gate agora entende os 100 temas),
--      questão inédita (draft_approval_blockers), explicações da Fila de revisão médica (SÓ AVISA: app_admin_comment_atualidade e o
--      resultado de aprovar). O gabarito oficial NUNCA é tocado por nada daqui (ele só muda por retificação do Inep).
--   4. Descoberta de documento novo também por tema dos 100 (palavras-chave editáveis), no mesmo vigia das páginas-índice.
--   5. Funções da tela do administrador: app_admin_gt_list / app_admin_gt / app_admin_gt_verified / app_admin_gt_set_source /
--      app_admin_gt_add_source / app_admin_gt_save. Modo do portão continua em app_admin_vigilance_set_gate (padrão: desligado).
-- Pode ser colada mais de uma vez. Se alguém colar de novo a 9800/9830/9701/9920/9950/9960, cole esta de novo.
-- =============================================================================

-- ---------------------------------------------------------------- 1. tabelas
create table if not exists public.ch_gt_dossiers (
  tema_id text primary key check (tema_id ~ '^GR-[0-9]{3}$'),
  titulo text not null,
  area text,
  subarea text,
  nomes text[] not null default '{}' check (cardinality(nomes) <= 60),         -- nomes (sem acento na busca) pelos quais a Central/Questões chamam o tema
  keywords text[] not null default '{}' check (cardinality(keywords) <= 60),    -- descoberta de documento novo
  max_age_days integer check (max_age_days is null or max_age_days between 1 and 730),   -- nulo = automático pelo tipo da fonte
  last_verified_at timestamptz,
  last_verified_by uuid references auth.users (id) on delete set null,
  last_verified_name text check (last_verified_name is null or char_length(last_verified_name) between 3 and 120),
  note text check (note is null or char_length(note) <= 1000),
  proposed_at date not null default current_date,
  updated_at timestamptz not null default now()
);
create table if not exists public.ch_gt_fontes (
  tema_id text not null references public.ch_gt_dossiers (tema_id) on delete cascade,
  catalogo_id text not null,
  url text not null,
  titulo text not null,
  orgao text,
  ano text,
  nivel text,
  papel text not null check (papel in ('principal', 'complementar', 'historica')),
  evidencia jsonb not null default '[]'::jsonb,
  ajuste text,
  source_id uuid references public.ch_sources (id) on delete set null,          -- só quando a equipe escolheu a fonte da biblioteca à mão
  removida boolean not null default false,
  added_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tema_id, catalogo_id)
);
create index if not exists ch_gt_fontes_source_idx on public.ch_gt_fontes (source_id);

alter table public.ch_vigilance_items add column if not exists gt_tema_id text;
create index if not exists ch_vigilance_items_gt_idx on public.ch_vigilance_items (gt_tema_id);

alter table public.ch_gt_dossiers enable row level security;
alter table public.ch_gt_fontes enable row level security;
drop policy if exists "dossiê dos 100 temas: equipe lê" on public.ch_gt_dossiers;
create policy "dossiê dos 100 temas: equipe lê" on public.ch_gt_dossiers for select to authenticated using (public.is_staff());
drop policy if exists "fontes dos 100 temas: equipe lê" on public.ch_gt_fontes;
create policy "fontes dos 100 temas: equipe lê" on public.ch_gt_fontes for select to authenticated using (public.is_staff());
revoke all on table public.ch_gt_dossiers, public.ch_gt_fontes from anon;
revoke insert, update, delete, truncate on table public.ch_gt_dossiers, public.ch_gt_fontes from authenticated;

-- ---------------------------------------------------------------- 2. a fonte da biblioteca que corresponde a uma linha do dossiê
create or replace function public.ch_gt_source_of(p_source_id uuid, p_url text) returns uuid
  language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.id from public.ch_sources s where s.id = p_source_id),
    (select s.id from public.ch_sources s where public.ch_url_norm(s.url) = public.ch_url_norm(p_url) order by (s.status = 'current') desc, s.created_at desc limit 1))
$$;

-- ---------------------------------------------------------------- 3. a regra "em dia"
-- nivel: em_dia | atencao | desatualizado | sem_dossie.   status (compatível com o portão): ok | vencido | mudanca_pendente | sem_dossie.
-- DESATUALIZADO: fonte principal trocada/retratada/vencida, mudança ou documento novo pendente na fila, dossiê nunca conferido ou com a
--   conferência fora do prazo, link de fonte principal fora do ar.  ATENÇÃO: conferência vence em até 15 dias, fonte complementar com
--   problema, conferência do link atrasada.  SEM DOSSIÊ: nenhuma fonte principal cadastrada e vigente na biblioteca (lista o que falta).
create or replace function public.ch_gt_freshness(p_tema_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.ch_gt_dossiers;
  r record;
  v_pend text[] := '{}';
  v_venc text[] := '{}';
  v_aten text[] := '{}';
  v_faltam text[] := '{}';
  v_n_princ integer := 0;
  v_prazo integer;
  v_tipo text := 'sociedades';
  v_status text;
  v_nivel text;
begin
  select * into d from public.ch_gt_dossiers where tema_id = p_tema_id;
  if not found then
    return jsonb_build_object('status', 'sem_dossie', 'nivel', 'sem_dossie', 'motivos', jsonb_build_array('O tema não tem dossiê de evidência.'), 'faltam', '[]'::jsonb);
  end if;
  for r in
    select f.papel, f.titulo as ftitulo, s.id as sid, s.title, s.status, s.retracted_at, s.valid_until, s.kind, s.organ, w.last_status, w.last_checked_at, w.interval_days
      from public.ch_gt_fontes f
      left join lateral (select x.* from public.ch_sources x where x.id = public.ch_gt_source_of(f.source_id, f.url)) s on true
      left join public.ch_source_watch w on w.source_id = s.id
     where f.tema_id = d.tema_id and not f.removida and f.papel in ('principal', 'complementar')
  loop
    if r.sid is null then
      if r.papel = 'principal' then v_faltam := v_faltam || left(r.ftitulo, 160); end if;
      continue;
    end if;
    if r.papel = 'principal' and r.status = 'current' and r.retracted_at is null then
      v_n_princ := v_n_princ + 1;
      if r.kind in ('rectification', 'preliminary', 'public_consultation') then v_tipo := 'retificacao';
      elsif v_tipo <> 'retificacao' and r.organ ~* '(minist|conitec|anvisa|inca|sus\M|saúde|saude|inep|planalto|oficial)' then v_tipo := 'oficial'; end if;
    end if;
    if r.status <> 'current' or r.retracted_at is not null then
      if r.papel = 'principal' then
        v_pend := v_pend || ('Fonte principal "' || left(r.title, 120) || '" ' || case when r.retracted_at is not null then 'foi retratada.'
                              when r.status = 'superseded' then 'foi substituída por versão nova.' else 'foi retirada ou bloqueada.' end);
      else
        v_aten := v_aten || ('Fonte complementar "' || left(r.title, 120) || '" ' || case when r.retracted_at is not null then 'foi retratada.' when r.status = 'superseded' then 'foi substituída por versão nova.' else 'foi retirada.' end);
      end if;
      continue;
    end if;
    if r.valid_until is not null and r.valid_until < current_date then
      if r.papel = 'principal' then v_venc := v_venc || ('Fonte principal "' || left(r.title, 120) || '" passou da validade (' || to_char(r.valid_until, 'DD/MM/YYYY') || ').');
      else v_aten := v_aten || ('Fonte complementar "' || left(r.title, 120) || '" passou da validade (' || to_char(r.valid_until, 'DD/MM/YYYY') || ').'); end if;
    end if;
    if r.papel = 'principal' and r.last_status = 'unreachable' then
      v_venc := v_venc || ('Fonte principal "' || left(r.title, 120) || '" está com o link fora do ar.');
    elsif r.papel = 'principal' and r.last_checked_at is not null and r.last_checked_at < now() - make_interval(days => 2 * coalesce(r.interval_days, 30) + 1) then
      v_aten := v_aten || ('A conferência do link da fonte "' || left(r.title, 120) || '" está atrasada.');
    end if;
  end loop;
  -- itens abertos da fila: das fontes do dossiê e documentos novos achados para o tema
  for r in
    select i.kind, i.summary, s.title, f.papel
      from public.ch_vigilance_items i
      left join public.ch_sources s on s.id = i.source_id
      left join public.ch_gt_fontes f on f.tema_id = d.tema_id and not f.removida and f.papel in ('principal', 'complementar') and i.source_id is not null
                                     and public.ch_gt_source_of(f.source_id, f.url) = i.source_id
     where i.status in ('pendente', 'vista') and i.kind in ('mudanca', 'nova_versao', 'retratada', 'quarentena', 'fonte_nova')
       and ((i.kind = 'fonte_nova' and i.gt_tema_id = d.tema_id) or (i.kind <> 'fonte_nova' and f.papel is not null))
     order by i.detected_at desc limit 12
  loop
    if r.kind = 'fonte_nova' or r.papel = 'principal' then
      v_pend := v_pend || (case r.kind when 'fonte_nova' then 'Documento oficial novo para o tema: ' when 'nova_versao' then 'Possível versão nova: '
                           when 'retratada' then 'Fonte retratada: ' when 'quarentena' then 'Fonte em quarentena: ' else 'Fonte mudou: ' end || left(coalesce(r.title, r.summary), 200));
    else
      v_aten := v_aten || ('Fonte complementar com aviso na fila: ' || left(coalesce(r.title, r.summary), 160));
    end if;
  end loop;
  if v_n_princ = 0 then
    return jsonb_build_object('status', 'sem_dossie', 'nivel', 'sem_dossie',
      'motivos', to_jsonb(array['O tema não tem nenhuma fonte principal vigente cadastrada na biblioteca.'] || v_pend),
      'faltam', to_jsonb(v_faltam), 'verificado_em', d.last_verified_at);
  end if;
  -- prazo pelo tipo da fonte principal (a equipe pode fixar outro no dossiê)
  v_prazo := coalesce(d.max_age_days, case v_tipo when 'retificacao' then 30 when 'oficial' then 90 else 180 end);
  if d.last_verified_at is null then
    v_venc := v_venc || 'O dossiê nunca foi conferido pela equipe (clique em "Marcar conferido" depois de conferir as fontes).'::text;
  elsif d.last_verified_at < now() - make_interval(days => v_prazo) then
    v_venc := v_venc || ('Última conferência do dossiê em ' || public.ch_br_date(d.last_verified_at) || ' (prazo de ' || v_prazo || ' dias).');
  elsif d.last_verified_at < now() - make_interval(days => greatest(v_prazo - 15, 1)) then
    v_aten := v_aten || ('A conferência do dossiê (de ' || public.ch_br_date(d.last_verified_at) || ') vence em menos de 15 dias.');
  end if;
  if cardinality(v_faltam) > 0 then v_aten := v_aten || ('Fontes principais indicadas e ainda não cadastradas na biblioteca: ' || array_to_string(v_faltam, '; ') || '.'); end if;
  v_status := case when cardinality(v_pend) > 0 then 'mudanca_pendente' when cardinality(v_venc) > 0 then 'vencido' else 'ok' end;
  v_nivel := case when v_status <> 'ok' then 'desatualizado' when cardinality(v_aten) > 0 then 'atencao' else 'em_dia' end;
  return jsonb_build_object('status', v_status, 'nivel', v_nivel, 'motivos', to_jsonb(v_pend || v_venc), 'avisos', to_jsonb(v_aten), 'faltam', to_jsonb(v_faltam),
                            'verificado_em', d.last_verified_at, 'verificado_por', d.last_verified_name, 'prazo_dias', v_prazo);
end
$$;

-- dossiês dos 100 temas que respondem por um nome (tema da Central, assunto da questão inédita)
create or replace function public.ch_gt_match(p_names text[]) returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct d.tema_id), '{}')
    from public.ch_gt_dossiers d
   where exists (select 1 from unnest(p_names) n, unnest(d.nomes) m
                  where char_length(btrim(coalesce(n, ''))) > 2 and public.fold_text(btrim(n)) = public.fold_text(btrim(m)))
$$;

-- o pior dos resultados (sem dossiê > mudança pendente > vencido > ok), para o portão
create or replace function public.ch_gt_gate_for(p_node_id uuid, p_names text[]) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_modo text := (select c.topic_gate from public.ch_vigilance_config c where c.id);
  v_ids text[] := public.ch_gt_match(p_names);
  v_best jsonb;
  v_cur jsonb;
  v_rank integer := -1;
  v_r integer;
  t text;
begin
  if p_node_id is not null and exists (select 1 from public.ch_topic_dossiers x where x.theme_node_id = p_node_id) then
    v_cur := public.ch_topic_freshness(p_node_id);
    if not (v_cur ->> 'status' = 'sem_dossie' and cardinality(v_ids) > 0) then v_best := v_cur; v_rank := case v_cur ->> 'status' when 'sem_dossie' then 3 when 'mudanca_pendente' then 2 when 'vencido' then 1 else 0 end; end if;
  end if;
  foreach t in array v_ids loop
    v_cur := public.ch_gt_freshness(t);
    v_r := case v_cur ->> 'status' when 'sem_dossie' then 3 when 'mudanca_pendente' then 2 when 'vencido' then 1 else 0 end;
    if v_r > v_rank then v_best := v_cur || jsonb_build_object('grande_tema', t); v_rank := v_r; end if;
  end loop;
  if v_best is null then
    v_best := jsonb_build_object('status', 'sem_dossie', 'nivel', 'sem_dossie', 'motivos', jsonb_build_array('O tema não está entre os 100 Grandes Temas e não tem dossiê de evidência.'));
  end if;
  return jsonb_build_object('modo', v_modo, 'tema_id', p_node_id, 'tema', coalesce(p_names[1], '?')) || v_best;
end
$$;

-- o portão da Central (substitui o da 9960; as cascas de importação/publicação continuam chamando este nome)
create or replace function public.ch_topic_gate(p_theme_node_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_gt_gate_for(p_theme_node_id, array[(select n.name from public.ch_taxonomy_nodes n where n.id = p_theme_node_id)])
$$;

-- ---------------------------------------------------------------- 4. encaixe: questão inédita, explicações da Fila de revisão médica
do $casca$
declare
  f record;
begin
  for f in select * from (values ('draft_approval_blockers', 'uuid'), ('app_admin_question_comment_decide', 'text, text, text, jsonb'),
                                 ('app_admin_comment_review_approve_exam', 'text, text, text')) as x(nome, args) loop
    if to_regprocedure(format('public.%s(%s)', f.nome, f.args)) is not null
       and position('_antes_atual' in (select p.prosrc from pg_proc p where p.oid = to_regprocedure(format('public.%s(%s)', f.nome, f.args)))) = 0 then
      execute format('drop function if exists public.%s_antes_atual(%s)', f.nome, f.args);
      execute format('alter function public.%s(%s) rename to %s_antes_atual', f.nome, f.args, f.nome);
    end if;
  end loop;
end
$casca$;

-- Avisos de atualidade das fontes que sustentam a explicação de uma questão (só informa; nunca trava, nunca toca no gabarito).
create or replace function public.ch_question_atualidade(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('total', count(*)::int, 'avisos', coalesce(jsonb_agg(x.txt order by x.txt), '[]'::jsonb))
  from (
    select distinct 'Fonte citada "' || left(s.title, 100) || '" ' ||
           case when s.retracted_at is not null then 'foi retratada.'
                when s.status = 'superseded' then 'foi substituída por versão nova.'
                when s.status <> 'current' then 'foi retirada ou bloqueada.'
                when s.valid_until is not null and s.valid_until < current_date then 'passou da validade.'
                else 'tem mudança pendente na Vigilância científica.' end as txt
      from public.question_source_links l
      join public.ch_sources s on s.id = l.source_id
     where l.question_id = p_question_id and l.temporal = 'vigente' and l.status <> 'nao_confirmada'
       and (s.status <> 'current' or s.retracted_at is not null or (s.valid_until is not null and s.valid_until < current_date)
            or exists (select 1 from public.ch_vigilance_items i where i.source_id = s.id and i.status in ('pendente', 'vista')
                         and i.kind in ('mudanca', 'nova_versao', 'retratada', 'quarentena')))
  ) x
$$;

-- a tela da Fila chama ao abrir a questão
create or replace function public.app_admin_comment_atualidade(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.question_comment_assert_access();
  return public.ch_question_atualidade(p_question_id);
end
$$;

create or replace function public.draft_approval_blockers(p_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  p text[] := public.draft_approval_blockers_antes_atual(p_id);
  d public.draft_questions;
  g jsonb;
begin
  select * into d from public.draft_questions where id = p_id;
  if found then
    g := public.ch_gt_gate_for(null, array[d.subarea, d.title, d.competency]);
    if g ->> 'modo' = 'bloqueia' and g ->> 'status' <> 'ok' then
      p := p || ('Portão de atualidade: o tema da questão está ' || case g ->> 'status' when 'sem_dossie' then 'sem dossiê de evidência' when 'vencido' then 'com a evidência vencida'
                   else 'com mudança pendente' end || ' (Vigilância científica): ' || coalesce((select string_agg(m, ' ') from jsonb_array_elements_text(g -> 'motivos') m), ''));
    end if;
  end if;
  return p;
end
$$;

create or replace function public.app_admin_question_comment_decide(p_question_id text, p_decision text, p_note text, p_seen_texts jsonb default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_av jsonb := public.ch_question_atualidade(p_question_id);
  r jsonb;
begin
  r := public.app_admin_question_comment_decide_antes_atual(p_question_id, p_decision, p_note, p_seen_texts);
  if p_decision = 'approve' and (v_av ->> 'total')::int > 0 then r := r || jsonb_build_object('aviso_atualidade', v_av); end if;
  return r;
end
$$;

create or replace function public.app_admin_comment_review_approve_exam(p_exam_id text, p_note text, p_seen text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_av jsonb;
  r jsonb;
begin
  select jsonb_build_object('questoes', count(*)::int, 'exemplos', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'avisos', x.av -> 'avisos')) filter (where x.n <= 10), '[]'::jsonb))
    into v_av
    from (select q.id, public.ch_question_atualidade(q.id) as av, row_number() over (order by q.id) as n
            from public.questions q where q.exam_id = p_exam_id and q.comment_review is not null) x
   where (x.av ->> 'total')::int > 0;
  r := public.app_admin_comment_review_approve_exam_antes_atual(p_exam_id, p_note, p_seen);
  if (v_av ->> 'questoes')::int > 0 then r := r || jsonb_build_object('aviso_atualidade', v_av); end if;
  return r;
end
$$;

-- ---------------------------------------------------------------- 5. descoberta de documento novo, agora também pelos 100 temas
create or replace function public.ch_kw_hits(p_text text, p_keywords text[]) returns text[]
  language sql immutable set search_path = ''
as $$
  select array_agg(k) from unnest(p_keywords) k
   where char_length(btrim(k)) > 0
     and (case when char_length(public.fold_text(btrim(k))) <= 4
               then (' ' || regexp_replace(p_text, '[^a-z0-9]+', ' ', 'g') || ' ') like '% ' || public.fold_text(btrim(k)) || ' %'
               else p_text like '%' || public.fold_text(btrim(k)) || '%' end)
$$;

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
      -- temas da taxonomia (dossiê antigo)
      for t in select d.theme_node_id, d.keywords from public.ch_topic_dossiers d where cardinality(d.keywords) > 0 loop
        v_hits := public.ch_kw_hits(v_text, t.keywords);
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
      -- os 100 Grandes Temas
      for t in select d.tema_id, d.titulo, d.keywords, d.nomes from public.ch_gt_dossiers d where cardinality(d.keywords) > 0 loop
        v_hits := public.ch_kw_hits(v_text, t.keywords);
        if v_hits is null then continue; end if;
        -- o mesmo documento já avisado pelo dossiê antigo do mesmo tema: um aviso só (o item passa a valer também para o tema dos 100)
        update public.ch_vigilance_items i set gt_tema_id = t.tema_id
         where i.index_page_id = pg.id and i.kind = 'fonte_nova' and i.gt_tema_id is null and i.theme_node_id is not null
           and i.discovery_key = md5(i.theme_node_id::text || '|' || public.ch_url_norm(it ->> 'url'))
           and exists (select 1 from public.ch_taxonomy_nodes n, unnest(t.nomes) m where n.id = i.theme_node_id and public.fold_text(btrim(n.name)) = public.fold_text(btrim(m)));
        if found then continue; end if;
        insert into public.ch_vigilance_items (source_id, kind, gt_tema_id, index_page_id, discovery_key, summary, version_candidates, details)
        values (null, 'fonte_nova', t.tema_id, pg.id, md5(t.tema_id || '|' || public.ch_url_norm(it ->> 'url')),
                left('Documento oficial novo para o tema ' || t.tema_id || ' "' || t.titulo || '": ' || (it ->> 'titulo') || coalesce(' — ' || (it ->> 'descricao'), ''), 600),
                jsonb_build_array(jsonb_build_object('url', it ->> 'url', 'titulo', it ->> 'titulo', 'data', it ->> 'data', 'ato', it ->> 'titulo')),
                jsonb_build_object('pagina', pg.url, 'pagina_titulo', pg.title, 'palavras', to_jsonb(v_hits), 'descricao', it ->> 'descricao', 'grande_tema', t.tema_id))
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

-- ---------------------------------------------------------------- 6. funções da tela do administrador
create or replace function public.ch_gt_card(p_tema_id text, p_full boolean) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with fr as (select public.ch_gt_freshness(d.tema_id) as f, d.* from public.ch_gt_dossiers d where d.tema_id = p_tema_id)
  select jsonb_build_object('tema_id', fr.tema_id, 'titulo', fr.titulo, 'area', fr.area, 'subarea', fr.subarea,
      'nivel', fr.f ->> 'nivel', 'status', fr.f ->> 'status', 'motivos', fr.f -> 'motivos', 'avisos', coalesce(fr.f -> 'avisos', '[]'::jsonb), 'faltam', coalesce(fr.f -> 'faltam', '[]'::jsonb),
      'verificado_em', fr.last_verified_at, 'verificado_nome', fr.last_verified_name, 'prazo_dias', fr.f -> 'prazo_dias',
      'n_principais', (select count(*)::int from public.ch_gt_fontes x where x.tema_id = fr.tema_id and x.papel = 'principal' and not x.removida),
      'n_principais_cadastradas', (select count(*)::int from public.ch_gt_fontes x where x.tema_id = fr.tema_id and x.papel = 'principal' and not x.removida
                                    and public.ch_gt_source_of(x.source_id, x.url) is not null),
      'pendencias', (select count(*)::int from public.ch_vigilance_items i where i.status in ('pendente', 'vista') and i.gt_tema_id = fr.tema_id))
    || case when p_full then jsonb_build_object('palavras_chave', to_jsonb(fr.keywords), 'nomes', to_jsonb(fr.nomes), 'nota', fr.note, 'prazo_fixo_dias', fr.max_age_days, 'proposto_em', fr.proposed_at,
         'fontes', coalesce((select jsonb_agg(jsonb_build_object('catalogo_id', x.catalogo_id, 'titulo', x.titulo, 'orgao', x.orgao, 'ano', x.ano, 'nivel', x.nivel, 'url', x.url,
                       'papel', x.papel, 'removida', x.removida, 'evidencia', x.evidencia, 'ajuste', x.ajuste,
                       'cadastrada', public.ch_gt_source_of(x.source_id, x.url) is not null,
                       'status', (select s.status from public.ch_sources s where s.id = public.ch_gt_source_of(x.source_id, x.url)),
                       'retratada', (select s.retracted_at is not null from public.ch_sources s where s.id = public.ch_gt_source_of(x.source_id, x.url)),
                       'validade', (select s.valid_until from public.ch_sources s where s.id = public.ch_gt_source_of(x.source_id, x.url)),
                       'ultima_conferencia', (select w.last_checked_at from public.ch_source_watch w where w.source_id = public.ch_gt_source_of(x.source_id, x.url)))
                     order by case x.papel when 'principal' then 0 when 'complementar' then 1 else 2 end, x.titulo)
                  from public.ch_gt_fontes x where x.tema_id = fr.tema_id), '[]'::jsonb),
         'itens', coalesce((select jsonb_agg(public.ch_vigilance_item_json(i.id) order by i.detected_at desc) from public.ch_vigilance_items i
                             where i.status in ('pendente', 'vista') and i.gt_tema_id = fr.tema_id), '[]'::jsonb))
       else '{}'::jsonb end
  from fr
$$;

create or replace function public.app_admin_gt_list() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_staff();
  select coalesce(jsonb_agg(public.ch_gt_card(d.tema_id, false) order by d.tema_id), '[]'::jsonb) into v from public.ch_gt_dossiers d;
  return jsonb_build_object('modo_portao', (select topic_gate from public.ch_vigilance_config where id), 'temas', v,
    'resumo', jsonb_build_object('em_dia', (select count(*)::int from jsonb_array_elements(v) x where x ->> 'nivel' = 'em_dia'),
                                 'atencao', (select count(*)::int from jsonb_array_elements(v) x where x ->> 'nivel' = 'atencao'),
                                 'desatualizado', (select count(*)::int from jsonb_array_elements(v) x where x ->> 'nivel' = 'desatualizado'),
                                 'sem_dossie', (select count(*)::int from jsonb_array_elements(v) x where x ->> 'nivel' = 'sem_dossie')));
end
$$;

create or replace function public.app_admin_gt(p_tema_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if not exists (select 1 from public.ch_gt_dossiers where tema_id = p_tema_id) then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  return public.ch_gt_card(p_tema_id, true);
end
$$;

-- a equipe conferiu as fontes do tema (nome de quem conferiu e o que foi conferido; a data é a de agora)
create or replace function public.app_admin_gt_verified(p_tema_id text, p_name text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  perform public.assert_staff();
  if char_length(v_name) < 3 then raise exception 'Escreva o nome de quem conferiu.' using errcode = '22023'; end if;
  if char_length(coalesce(v_note, '')) < 10 then raise exception 'Escreva o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.ch_gt_dossiers set last_verified_at = now(), last_verified_by = (select auth.uid()), last_verified_name = left(v_name, 120), note = v_note, updated_at = now()
   where tema_id = p_tema_id;
  if not found then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_tema_id, jsonb_build_object('acao', 'conferido_gt', 'nome', v_name, 'nota', v_note));
  return public.ch_gt_card(p_tema_id, true);
end
$$;

-- papel nulo = tira a fonte do dossiê (fica marcada como removida, não some do histórico)
create or replace function public.app_admin_gt_set_source(p_tema_id text, p_catalogo_id text, p_role text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_role is not null and p_role not in ('principal', 'complementar', 'historica') then raise exception 'Papel inválido: %.', p_role using errcode = '22023'; end if;
  update public.ch_gt_fontes set removida = (p_role is null), papel = coalesce(p_role, papel), updated_at = now() where tema_id = p_tema_id and catalogo_id = p_catalogo_id;
  if not found then raise exception 'Fonte do dossiê não encontrada.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_tema_id, jsonb_build_object('acao', 'gt_fonte', 'fonte', p_catalogo_id, 'papel', p_role));
  return public.ch_gt_card(p_tema_id, true);
end
$$;

create or replace function public.app_admin_gt_add_source(p_tema_id text, p_source_id uuid, p_role text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare s public.ch_sources;
begin
  perform public.assert_staff();
  if p_role is null or p_role not in ('principal', 'complementar', 'historica') then raise exception 'Papel inválido.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ch_gt_dossiers where tema_id = p_tema_id) then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  select * into s from public.ch_sources where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada na biblioteca.' using errcode = 'P0002'; end if;
  insert into public.ch_gt_fontes (tema_id, catalogo_id, url, titulo, orgao, ano, papel, evidencia, source_id, added_by)
  values (p_tema_id, 'manual:' || s.id, coalesce(s.url, 'https://invalido.local/' || s.id), s.title, s.organ, extract(year from s.published_on)::text, p_role,
          jsonb_build_array(jsonb_build_object('tipo', 'equipe', 'nota', 'Escolhida pela equipe na biblioteca.')), s.id, (select auth.uid()))
  on conflict (tema_id, catalogo_id) do update set papel = excluded.papel, removida = false, updated_at = now();
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_tema_id, jsonb_build_object('acao', 'gt_fonte_manual', 'fonte', p_source_id, 'papel', p_role));
  return public.ch_gt_card(p_tema_id, true);
end
$$;

create or replace function public.app_admin_gt_save(p_tema_id text, p_keywords text[], p_max_age_days integer default null, p_clear_age boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_max_age_days is not null and p_max_age_days not between 1 and 730 then raise exception 'Prazo de 1 a 730 dias.' using errcode = '22023'; end if;
  update public.ch_gt_dossiers set
    keywords = case when p_keywords is null then keywords else coalesce(array(select distinct left(btrim(k), 60) from unnest(p_keywords) k where btrim(k) <> ''), '{}') end,
    max_age_days = case when p_clear_age then null else coalesce(p_max_age_days, max_age_days) end, updated_at = now()
   where tema_id = p_tema_id;
  if not found then raise exception 'Tema não encontrado.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_log (actor_id, action, target, details)
  values ((select auth.uid()), 'vigilance.topic', p_tema_id, jsonb_build_object('acao', 'gt_salvar', 'palavras', to_jsonb(p_keywords), 'prazo', p_max_age_days));
  return public.ch_gt_card(p_tema_id, true);
end
$$;
