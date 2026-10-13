-- =============================================================================
-- VIGILÂNCIA CIENTÍFICA E VALIDAÇÃO DE FONTES (pedido do dono, 2026-10-12; etapas 1 e 2 da proposta guardada em
-- Documents/Prompts guardados/2026-10-12-motor-vinculacao-e-vigilancia-de-fontes.md). Spec: docs/superpowers/specs/2026-10-12-vigilancia-cientifica.md
--
-- NÃO cria vigia paralelo: ESTENDE o que já roda na produção (ch_source_watch + ch_worker_watch_due/ch_worker_watch_result,
-- chamados pela tarefa do Cloud Run a cada minuto; 159 fontes vigiadas desde 12/10/2026).
--
--   1. frequência por SITE: coluna watch_interval_days em ch_official_domains (MS, Conitec, Anvisa, Inep: 1 dia; sociedades,
--      OMS/OPAS, legislação: 7 dias; nulo = padrão pelo tipo). Só endereços da lista de sites oficiais ATIVOS são baixados;
--      os sites oficiais que as fontes vigiadas já usam entram na lista (Inep, DOU, Planalto, Linhas de Cuidado, Aids, INCA...).
--   2. vigia: lote por rodada com reserva (duas tarefas ao mesmo tempo não baixam a mesma fonte), cabeçalhos (ETag, Last-Modified,
--      tamanho, tipo), texto de página HTML comparado SEM a data da própria página ("Publicado em", "Atualizado em"), PDF com
--      impressão do texto (bytes diferentes e texto igual = só metadados); link fora do ar duas vezes seguidas vira item da fila.
--   3. detector de versões (sem IA): o processamento acha links de PDF novos, atos (portarias), datas e "anexo alterado" e grava
--      em ch_source_changes.version_candidates (a coluna antiga candidate_versions continua sendo o NÚMERO de versões candidatas
--      de aulas criadas por ch_flag_dependents).
--   4. retratação: doi e pmid em ch_sources (preenchidos a partir do catálogo importado em 12/10); a conferência semanal no
--      Crossref (API pública, sem chave) marca retracted_at; fonte retratada sai das vigentes (status withdrawn), as evidências
--      ficam desatualizadas e o que dependia dela vai para revisão (ch_flag_dependents). Nenhuma evidência nova a sustenta.
--   5. confiabilidade e quarentena: nota por regras (autenticidade 25, situação normativa 25, metodologia 20, correspondência
--      clínica 20 - nula no nível da fonte -, rastreabilidade 10; pesos são CONFIGURAÇÃO, não escala validada); quarentena por
--      nota baixa ou sem origem conferível; retratada ou bloqueada = bloqueio obrigatório, qualquer nota.
--   6. fila de auditoria (ch_vigilance_items): mudança, versão nova, retratada, quarentena, fora do ar, fonte nova.
--   7. regras de publicação automática (tabela 7 da proposta) NO BANCO: ch_auto_change_policy + gatilhos que recusam mudança
--      clínica feita pela automação (gabarito oficial: nunca por nenhuma automação; o resto clínico: nunca pela vigilância).
--
-- Só a equipe lê (RLS); escrita só pelas funções; aluno e anônimo nunca veem nada disto.
-- Pode ser colada mais de uma vez (if not exists / create or replace / drop ... if exists / on conflict).
-- Numeração: 20261003009940 (depois da rodada 2 e das explicações; 9950 é a importação de aula pronta).
-- Redefine (partindo das versões mais novas): ch_worker_watch_due (2800, agora com lote), ch_worker_watch_result (2800, vira
-- atalho para ch_worker_watch_report). Quem mexer nelas depois parte do corpo desta.
-- =============================================================================

-- ---------------------------------------------------------------- 1. regras de publicação automática (tabela 7)
create table if not exists public.ch_auto_change_policy (
  kind text primary key,
  category text not null check (category in ('link', 'metadado', 'catalogo', 'retratacao', 'revisao', 'clinico', 'gabarito')),
  automatic boolean not null,
  label text not null check (char_length(btrim(label)) between 3 and 300)
);
-- clínico e gabarito NUNCA mudam sozinhos (nem trocando a linha no editor SQL)
alter table public.ch_auto_change_policy drop constraint if exists ch_auto_change_policy_clinico_nunca;
alter table public.ch_auto_change_policy add constraint ch_auto_change_policy_clinico_nunca check (category not in ('clinico', 'gabarito') or not automatic);
alter table public.ch_auto_change_policy enable row level security;
drop policy if exists "publicação automática: equipe lê" on public.ch_auto_change_policy;
create policy "publicação automática: equipe lê" on public.ch_auto_change_policy for select to authenticated using (public.is_staff());

insert into public.ch_auto_change_policy (kind, category, automatic, label) values
  ('link_fora_do_ar', 'link', true, 'Marcar link fora do ar (e fechar o aviso quando ele volta)'),
  ('metadados', 'metadado', true, 'Metadados do link: tamanho, tipo, cabeçalhos, data da conferência, arquivo novo com o mesmo texto'),
  ('doi_confirmado', 'metadado', true, 'DOI conferido no Crossref'),
  ('nova_versao_catalogo', 'catalogo', true, 'Registrar mudança e versões candidatas na fila (trocar a versão vigente continua com a equipe)'),
  ('retratacao', 'retratacao', true, 'Marcar artigo retratado e bloquear como evidência'),
  ('marcar_para_revisao', 'revisao', true, 'Mandar para revisão o que dependia da fonte (evidência desatualizada, questão para reanálise, versão candidata de aula)'),
  ('justificativa_alternativa', 'clinico', false, 'Enunciado, alternativas, justificativas e dados clínicos da questão'),
  ('analise_questao', 'clinico', false, 'Análise da questão (conduta atual, raciocínio, publicação)'),
  ('comentario_questao', 'clinico', false, 'Comentário da questão'),
  ('atualizacao_questao', 'clinico', false, 'Cartão de atualização da questão'),
  ('afirmacao_clinica', 'clinico', false, 'Texto de afirmação clínica'),
  ('conduta_aula', 'clinico', false, 'Conteúdo de aula, material ou conduta'),
  ('conduta_atualizacao', 'clinico', false, 'Atualizações & Diretrizes (conduta atual)'),
  ('publicacao_aluno', 'clinico', false, 'Publicar qualquer conteúdo ao aluno'),
  ('gabarito_oficial', 'gabarito', false, 'Gabarito oficial do Inep: nunca por diretriz; só por retificação oficial registrada por uma pessoa da equipe')
on conflict (kind) do update set category = excluded.category, automatic = excluded.automatic, label = excluded.label;

-- Quem está gravando: 'vigilancia' (funções da vigilância científica, marca local da transação), 'servico' (qualquer
-- processamento com a chave de serviço) ou nulo (pessoa da equipe pela tela, ou o dono no editor SQL).
create or replace function public.ch_automation_context() returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when current_setting('staziamed.automacao', true) = 'vigilancia' then 'vigilancia'
    when coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role' then 'servico'
  end
$$;

create or replace function public.ch_auto_change_allowed(p_kind text) returns boolean
  language sql stable security definer set search_path = ''
as $$ select coalesce((select p.automatic from public.ch_auto_change_policy p where p.kind = p_kind), false) $$;

create or replace function public.ch_auto_change_assert(p_kind text) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.ch_auto_change_allowed(p_kind) then
    raise exception 'Regra de publicação automática: "%" não muda sozinho; precisa de uma pessoa da equipe.',
      coalesce((select p.label from public.ch_auto_change_policy p where p.kind = p_kind), p_kind) using errcode = '42501';
  end if;
end
$$;

create or replace function public.ch_auto_change_refuse(p_kind text, p_table text) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  raise exception 'Regra de publicação automática: "%" nunca muda por automação (tabela %); precisa de revisão de uma pessoa da equipe.',
    coalesce((select p.label from public.ch_auto_change_policy p where p.kind = p_kind), p_kind), p_table using errcode = '42501';
end
$$;

-- Gatilho genérico da trava clínica. Argumentos: 0 tipo (ch_auto_change_policy.kind) · 1 alcance ('vigilancia' = só a
-- vigilância científica; 'automacao' = vigilância OU chave de serviço) · 2 incluir/apagar linha ('recusa' | 'permite') ·
-- 3... colunas clínicas (mudar qualquer uma é recusado; '*' = qualquer coluna).
create or replace function public.ch_auto_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ctx text := public.ch_automation_context();
  v_kind text := tg_argv[0];
  o jsonb;
  n jsonb;
  i integer;
begin
  if v_ctx is null or (tg_argv[1] = 'vigilancia' and v_ctx <> 'vigilancia') or public.ch_auto_change_allowed(v_kind) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    if tg_argv[2] = 'recusa' then perform public.ch_auto_change_refuse(v_kind, tg_table_name); end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  o := to_jsonb(old);
  n := to_jsonb(new);
  for i in 3 .. tg_nargs - 1 loop
    if tg_argv[i] = '*' then
      if (o - 'updated_at') is distinct from (n - 'updated_at') then perform public.ch_auto_change_refuse(v_kind, tg_table_name); end if;
    elsif (o -> tg_argv[i]) is distinct from (n -> tg_argv[i]) then
      perform public.ch_auto_change_refuse(v_kind, tg_table_name);
    end if;
  end loop;
  return new;
end
$$;

-- Unidades da Central: a vigilância pode marcar "requer atualização"/voltar a rascunho e criar versão candidata EM RASCUNHO
-- (ch_flag_dependents); nunca muda o conteúdo nem aprova ou publica.
create or replace function public.ch_auto_guard_unit_versions() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if public.ch_automation_context() is distinct from 'vigilancia' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then perform public.ch_auto_change_refuse('conduta_aula', tg_table_name); end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then perform public.ch_auto_change_refuse('conduta_aula', tg_table_name); end if;
    return new;
  end if;
  if (old.content, old.content_hash, old.origin, old.scope_note) is distinct from (new.content, new.content_hash, new.origin, new.scope_note)
     or (new.status is distinct from old.status and new.status not in ('needs_update', 'draft')) then
    perform public.ch_auto_change_refuse('conduta_aula', tg_table_name);
  end if;
  return new;
end
$$;

do $guards$
declare
  g record;
begin
  for g in select * from (values
      ('question_official_answers', 'ch_auto_guard_gabarito', 'insert or update or delete', $a$'gabarito_oficial', 'automacao', 'recusa', '*'$a$),
      ('questions', 'ch_auto_guard_gabarito', 'update of correct_option', $a$'gabarito_oficial', 'automacao', 'permite', 'correct_option'$a$),
      ('questions', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'justificativa_alternativa', 'vigilancia', 'recusa', 'statement', 'options', 'correct_option', 'expected_conduct', 'key_finding', 'inep_intent', 'sources', 'status', 'topic', 'subtopic'$a$),
      ('question_option_analysis', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'justificativa_alternativa', 'vigilancia', 'recusa', '*'$a$),
      ('question_comments', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'comentario_questao', 'vigilancia', 'recusa', '*'$a$),
      ('question_analysis', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'analise_questao', 'vigilancia', 'recusa', 'question_core', 'key_data', 'reasoning_types', 'difficulty', 'difficulty_components', 'trap', 'golden_rule', 'pedagogy', 'current_best_answer', 'status', 'is_current', 'official_answer_at_analysis'$a$),
      ('question_update_cards', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'atualizacao_questao', 'vigilancia', 'recusa', '*'$a$),
      ('ch_claims', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'afirmacao_clinica', 'vigilancia', 'recusa', 'statement', 'proposed_text', 'change_rationale', 'critical_kinds', 'context', 'origin', 'theme_node_id'$a$),
      ('ch_materials', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'conduta_aula', 'vigilancia', 'permite', 'content', 'content_hash', 'claim_ids', 'kind', 'unit_version_id'$a$),
      ('ch_publications', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'publicacao_aluno', 'vigilancia', 'recusa', '*'$a$),
      ('lessons', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'conduta_aula', 'vigilancia', 'recusa', 'title', 'topic', 'summary', 'key_points', 'guideline_title', 'guideline_url', 'published', 'video_url'$a$),
      ('lesson_materials', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'conduta_aula', 'vigilancia', 'recusa', '*'$a$),
      ('guideline_updates', 'ch_auto_guard_clinico', 'insert or update or delete', $a$'conduta_atualizacao', 'vigilancia', 'recusa', 'current_conduct', 'clinical_impact', 'exam_impact', 'timeline', 'before_text', 'trap', 'published', 'practice_questions', 'flashcards', 'review_status'$a$)
    ) as t(tbl, name, events, args) loop
    if to_regclass('public.' || g.tbl) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', g.name, g.tbl);
    execute format('create trigger %I before %s on public.%I for each row execute function public.ch_auto_guard(%s)', g.name, g.events, g.tbl, g.args);
  end loop;
end
$guards$;
drop trigger if exists ch_auto_guard_clinico on public.ch_unit_versions;
create trigger ch_auto_guard_clinico before insert or update or delete on public.ch_unit_versions for each row execute function public.ch_auto_guard_unit_versions();

-- ---------------------------------------------------------------- 2. sites oficiais: frequência do vigia por site
alter table public.ch_official_domains add column if not exists watch_interval_days integer;
alter table public.ch_official_domains drop constraint if exists ch_official_domains_watch_interval_check;
alter table public.ch_official_domains add constraint ch_official_domains_watch_interval_check check (watch_interval_days is null or watch_interval_days between 1 and 90);

-- sites oficiais que as fontes vigiadas do catálogo (12/10/2026) já usam; colar de novo não mexe no que o dono mudou
insert into public.ch_official_domains (address, institution, kind) values
  ('linhasdecuidado.saude.gov.br', 'Ministério da Saúde (Linhas de Cuidado)', 'governo'),
  ('www.gov.br/aids', 'Ministério da Saúde (HIV, aids, IST, hepatites virais e tuberculose)', 'governo'),
  ('www.gov.br/inep', 'Inep', 'governo'),
  ('download.inep.gov.br', 'Inep (arquivos das provas)', 'governo'),
  ('www.in.gov.br', 'Imprensa Nacional (Diário Oficial da União)', 'governo'),
  ('www.planalto.gov.br', 'Presidência da República (legislação)', 'governo'),
  ('www.inca.gov.br', 'INCA', 'governo'),
  ('ninho.inca.gov.br', 'INCA (repositório)', 'governo'),
  ('www.gov.br/mec', 'Ministério da Educação', 'governo'),
  ('portal.cfm.org.br', 'Conselho Federal de Medicina', 'governo')
on conflict (address) do nothing;

-- frequências da proposta: MS, Conitec, Anvisa e Inep todo dia; legislação, sociedades e OMS/OPAS toda semana
update public.ch_official_domains d set watch_interval_days = x.dias
  from (values ('www.gov.br/saude', 1), ('bvsms.saude.gov.br', 1), ('linhasdecuidado.saude.gov.br', 1), ('www.gov.br/aids', 1),
               ('www.gov.br/inca', 1), ('www.inca.gov.br', 1), ('ninho.inca.gov.br', 1), ('www.gov.br/conitec', 1), ('www.gov.br/anvisa', 1),
               ('www.gov.br/inep', 1), ('download.inep.gov.br', 1), ('www.in.gov.br', 7), ('www.planalto.gov.br', 7), ('www.gov.br/mec', 7),
               ('portal.cfm.org.br', 7), ('who.int', 7), ('paho.org', 7), ('iris.paho.org', 7), ('febrasgo.org.br', 7), ('sbp.com.br', 7),
               ('portal.cardiol.br', 7)) as x(address, dias)
 where d.address = x.address and d.watch_interval_days is null;

-- Site ATIVO da lista que contém o link (o de endereço mais longo, o mais específico), ou nulo. Mesma regra de casamento de
-- ch_source_site_match (https, porta 443, host igual ou subdomínio, caminho inteiro).
create or replace function public.ch_watch_domain_of(p_url text) returns uuid
  language sql stable security definer set search_path = ''
as $$
  with u as (
    select m[1] as host, coalesce(m[2], '') as path
      from (select regexp_match(lower(btrim(coalesce(p_url, ''))), '^https://([^/?#:@\s]+)(?::443)?(?=[/?#]|$)(/[^?#]*)?') as m) x
     where m is not null
  )
  select d.id
    from public.ch_official_domains d, u
   where d.active
     and (u.host = split_part(d.address, '/', 1)
          or right(u.host, char_length(split_part(d.address, '/', 1)) + 1) = '.' || split_part(d.address, '/', 1))
     and (position('/' in d.address) = 0
          or u.path = substr(d.address, position('/' in d.address))
          or left(u.path, char_length(substr(d.address, position('/' in d.address))) + 1) = substr(d.address, position('/' in d.address)) || '/')
   order by char_length(d.address) desc, d.created_at, d.id
   limit 1
$$;

-- Frequência que vale para o site (nulo na linha = padrão pelo tipo: governo 1 dia, os outros 7).
create or replace function public.ch_watch_interval_for(p_domain_id uuid) returns integer
  language sql stable security definer set search_path = ''
as $$ select coalesce(d.watch_interval_days, case d.kind when 'governo' then 1 else 7 end) from public.ch_official_domains d where d.id = p_domain_id $$;

-- ---------------------------------------------------------------- 3. vigia: colunas novas
alter table public.ch_source_watch add column if not exists domain_id uuid references public.ch_official_domains (id) on delete set null;
alter table public.ch_source_watch add column if not exists hash_method text;
alter table public.ch_source_watch add column if not exists text_hash text;
alter table public.ch_source_watch add column if not exists content_type text;
alter table public.ch_source_watch add column if not exists content_length bigint;
alter table public.ch_source_watch add column if not exists etag text;
alter table public.ch_source_watch add column if not exists last_modified text;
alter table public.ch_source_watch add column if not exists final_url text;
alter table public.ch_source_watch add column if not exists facts jsonb;
alter table public.ch_source_watch add column if not exists last_error text;
alter table public.ch_source_watch add column if not exists fail_count integer not null default 0;
alter table public.ch_source_watch add column if not exists checking_since timestamptz;

-- O site do link decide a frequência; link trocado = leitura nova do zero (a impressão antiga era de outro endereço).
create or replace function public.ch_source_watch_domain_trg() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.domain_id := public.ch_watch_domain_of(new.url);
  if new.domain_id is not null then new.interval_days := public.ch_watch_interval_for(new.domain_id); end if;
  if tg_op = 'UPDATE' and new.url is distinct from old.url then
    new.last_hash := null; new.hash_method := null; new.text_hash := null; new.etag := null; new.last_modified := null;
    new.facts := null; new.fail_count := 0; new.last_error := null;
  end if;
  return new;
end
$$;
drop trigger if exists ch_source_watch_domain on public.ch_source_watch;
create trigger ch_source_watch_domain before insert or update of url on public.ch_source_watch for each row execute function public.ch_source_watch_domain_trg();

alter table public.ch_source_changes add column if not exists version_candidates jsonb not null default '[]'::jsonb;
alter table public.ch_source_changes add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.ch_source_changes drop constraint if exists ch_source_changes_version_candidates_check;
alter table public.ch_source_changes add constraint ch_source_changes_version_candidates_check check (jsonb_typeof(version_candidates) = 'array');

-- ---------------------------------------------------------------- 4. fontes: identificadores e retratação
alter table public.ch_sources add column if not exists doi text;
alter table public.ch_sources add column if not exists pmid text;
alter table public.ch_sources add column if not exists retracted_at date;
alter table public.ch_sources add column if not exists retraction_note text;
alter table public.ch_sources add column if not exists retraction_notice_doi text;
alter table public.ch_sources drop constraint if exists ch_sources_doi_check;
alter table public.ch_sources add constraint ch_sources_doi_check check (doi is null or (doi ~ '^10\.[0-9]{4,9}/\S+$' and doi = lower(doi) and char_length(doi) <= 300));
alter table public.ch_sources drop constraint if exists ch_sources_pmid_check;
alter table public.ch_sources add constraint ch_sources_pmid_check check (pmid is null or pmid ~ '^[0-9]{1,9}$');
alter table public.ch_sources drop constraint if exists ch_sources_retraction_note_check;
alter table public.ch_sources add constraint ch_sources_retraction_note_check check (retraction_note is null or char_length(retraction_note) <= 1000);
create index if not exists ch_sources_doi_idx on public.ch_sources (doi) where doi is not null;

-- Estado da vigilância por fonte: bloqueio pela equipe, decisão sobre a quarentena e conferência no Crossref.
create table if not exists public.ch_source_vigilance (
  source_id uuid primary key references public.ch_sources (id) on delete cascade,
  blocked boolean not null default false,
  blocked_note text,
  blocked_by uuid references auth.users (id) on delete set null,
  blocked_at timestamptz,
  -- situação da fonte antes do bloqueio ou da retratação (para devolver ao desbloquear)
  prior_status text,
  -- nulo = vale a regra; true/false = decisão da equipe (com nota)
  quarantine_override boolean,
  override_note text,
  override_by uuid references auth.users (id) on delete set null,
  override_at timestamptz,
  crossref_status text check (crossref_status is null or crossref_status in ('ok', 'retratada', 'nao_encontrado', 'erro')),
  crossref_checked_at timestamptz,
  crossref_next_at timestamptz,
  crossref_error text,
  crossref_title text,
  crossref_alerts jsonb not null default '[]'::jsonb check (jsonb_typeof(crossref_alerts) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.ch_source_vigilance enable row level security;
drop policy if exists "vigilância da fonte: equipe lê" on public.ch_source_vigilance;
create policy "vigilância da fonte: equipe lê" on public.ch_source_vigilance for select to authenticated using (public.is_staff());

-- Configuração (uma linha): pesos da nota (proposta do dono, NÃO é escala validada) e o corte da quarentena.
create table if not exists public.ch_vigilance_config (
  id boolean primary key default true check (id),
  weights jsonb not null default '{"autenticidade": 25, "situacao_normativa": 25, "metodologia": 20, "correspondencia_clinica": 20, "rastreabilidade": 10}'::jsonb
    check (weights ?& array['autenticidade', 'situacao_normativa', 'metodologia', 'correspondencia_clinica', 'rastreabilidade']),
  quarantine_below integer not null default 50 check (quarantine_below between 0 and 100),
  crossref_interval_days integer not null default 7 check (crossref_interval_days between 1 and 90),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.ch_vigilance_config (id) values (true) on conflict (id) do nothing;
alter table public.ch_vigilance_config enable row level security;
drop policy if exists "configuração da vigilância: equipe lê" on public.ch_vigilance_config;
create policy "configuração da vigilância: equipe lê" on public.ch_vigilance_config for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------- 5. fila de auditoria
create table if not exists public.ch_vigilance_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.ch_sources (id) on delete cascade,
  kind text not null check (kind in ('mudanca', 'nova_versao', 'retratada', 'quarentena', 'fora_do_ar', 'fonte_nova')),
  change_id uuid references public.ch_source_changes (id) on delete cascade,
  detected_at timestamptz not null default now(),
  summary text not null check (char_length(summary) between 1 and 600),
  version_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(version_candidates) = 'array'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'pendente' check (status in ('pendente', 'vista', 'bloqueada', 'resolvida')),
  note text check (note is null or char_length(note) <= 1000),
  seen_by uuid references auth.users (id) on delete set null,
  seen_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  -- análise do que mudou (IA, só quando a equipe pede e a função está ligada): sugestão, nunca muda nada
  analysis_status text check (analysis_status is null or analysis_status in ('pedida', 'pendente', 'pronta', 'sem_texto', 'falhou')),
  analysis jsonb,
  analysis_job_id uuid references public.ch_jobs (id) on delete set null,
  analysis_requested_by uuid references auth.users (id) on delete set null,
  analysis_requested_at timestamptz
);
create index if not exists ch_vigilance_items_status_idx on public.ch_vigilance_items (status, detected_at desc);
create index if not exists ch_vigilance_items_source_idx on public.ch_vigilance_items (source_id);
create unique index if not exists ch_vigilance_items_change_key on public.ch_vigilance_items (change_id) where change_id is not null;
create unique index if not exists ch_vigilance_items_open_key on public.ch_vigilance_items (source_id, kind)
  where status in ('pendente', 'vista') and kind in ('retratada', 'quarentena', 'fora_do_ar', 'fonte_nova');
alter table public.ch_vigilance_items enable row level security;
drop policy if exists "fila da vigilância: equipe lê" on public.ch_vigilance_items;
create policy "fila da vigilância: equipe lê" on public.ch_vigilance_items for select to authenticated using (public.is_staff());

revoke all on table public.ch_auto_change_policy, public.ch_source_vigilance, public.ch_vigilance_config, public.ch_vigilance_items from anon;

-- data de Brasília para os textos
create or replace function public.ch_br_date(p_at timestamptz) returns text
  language sql immutable set search_path = ''
as $$ select to_char(p_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') $$;

-- mudança registrada pelo vigia → item da fila (versão nova quando há candidatas)
create or replace function public.ch_vigilance_on_change() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer := jsonb_array_length(coalesce(new.version_candidates, '[]'::jsonb));
  v_first text := coalesce(new.version_candidates -> 0 ->> 'ato', new.version_candidates -> 0 ->> 'titulo');
begin
  insert into public.ch_vigilance_items (source_id, kind, change_id, detected_at, summary, version_candidates, details)
  values (new.source_id, case when n > 0 then 'nova_versao' else 'mudanca' end, new.id, new.detected_at,
          case when n > 0 then 'Possível versão nova: ' || n || ' candidata(s) encontrada(s) no link' || coalesce(' (' || left(v_first, 200) || ')', '') || '.'
               when new.details ->> 'metodo' = 'pdf-sha256' then 'O arquivo PDF do link mudou (texto diferente do conferido em ' || coalesce(public.ch_br_date((new.details ->> 'conferido_antes')::timestamptz), 'conferência anterior') || ').'
               else 'O conteúdo do link mudou desde a conferência anterior.' end,
          coalesce(new.version_candidates, '[]'::jsonb), coalesce(new.details, '{}'::jsonb))
  on conflict do nothing;
  return null;
end
$$;
drop trigger if exists ch_vigilance_on_change on public.ch_source_changes;
create trigger ch_vigilance_on_change after insert on public.ch_source_changes for each row execute function public.ch_vigilance_on_change();

-- mudança resolvida pela tela Fontes (app_ch_resolve_source_change) → item resolvido com a mesma nota
create or replace function public.ch_vigilance_on_change_resolved() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.ch_vigilance_items set status = 'resolvida', decided_by = coalesce(decided_by, new.resolved_by), decided_at = coalesce(decided_at, new.resolved_at),
         note = coalesce(note, left(new.note, 1000))
   where change_id = new.id and status in ('pendente', 'vista');
  return null;
end
$$;
drop trigger if exists ch_vigilance_on_change_resolved on public.ch_source_changes;
create trigger ch_vigilance_on_change_resolved after update of resolved_at on public.ch_source_changes for each row
  when (old.resolved_at is null and new.resolved_at is not null) execute function public.ch_vigilance_on_change_resolved();

-- fonte nova vigente → item "fonte nova" (as 417 do catálogo de 12/10 entraram antes: não viram item)
create or replace function public.ch_vigilance_on_source() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ch_vigilance_items (source_id, kind, summary)
  values (new.id, 'fonte_nova', 'Fonte nova na biblioteca: ' || left(new.title, 300) || '.')
  on conflict do nothing;
  return null;
end
$$;
drop trigger if exists ch_vigilance_on_source on public.ch_sources;
create trigger ch_vigilance_on_source after insert on public.ch_sources for each row when (new.status = 'current') execute function public.ch_vigilance_on_source();

-- ---------------------------------------------------------------- 6. confiabilidade, quarentena e bloqueio
-- Nota por REGRAS a partir do que existe (proposta do dono, não validada). Cada dimensão em PONTOS (0 até o peso dela); total =
-- soma. Correspondência clínica só existe no vínculo com a questão: nula aqui. A quarentena compara o PERCENTUAL (total sobre
-- o máximo possível no nível da fonte) com quarantine_below.
create or replace function public.ch_source_quality_eval(p_source_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.ch_sources;
  v public.ch_source_vigilance;
  c public.ch_vigilance_config;
  w jsonb;
  v_dom uuid;
  v_watched boolean;
  a numeric; sn numeric; m numeric; rz numeric := 0;
  ea text; esn text; em text; erz text[] := '{}';
  v_total integer;
  v_rule boolean;
  v_quar boolean;
  v_reason text;
begin
  select * into s from public.ch_sources where id = p_source_id;
  if not found then return null; end if;
  select * into v from public.ch_source_vigilance where source_id = p_source_id;
  select * into c from public.ch_vigilance_config where id;
  w := coalesce(c.weights, '{"autenticidade": 25, "situacao_normativa": 25, "metodologia": 20, "correspondencia_clinica": 20, "rastreabilidade": 10}'::jsonb);
  v_dom := public.ch_watch_domain_of(s.url);
  v_watched := exists (select 1 from public.ch_source_watch x where x.source_id = s.id and x.last_hash is not null);

  -- autenticidade: de onde vem
  if v_dom is not null then a := 1; ea := 'Link em site oficial da lista.';
  elsif coalesce(s.url, '') ~ '^https://' and s.is_primary_source and s.authority_level in ('A', 'B') then a := 0.7; ea := 'Link https da própria instituição (fora da lista de sites oficiais).';
  elsif s.doi is not null then a := 0.6; ea := 'Fora dos sites oficiais, mas com DOI.';
  elsif coalesce(s.url, '') ~ '^https://' then a := 0.3; ea := 'Link https fora da lista de sites oficiais.';
  else a := 0; ea := 'Sem origem conferível (sem link oficial nem DOI).';
  end if;
  if v_dom is null and not s.is_primary_source and a > 0.5 then a := 0.5; ea := ea || ' Cópia de terceiros (não é a fonte primária).'; end if;

  -- situação normativa: vigente, substituída, preliminar, retratada (a idade sozinha não decide)
  if s.retracted_at is not null then sn := 0; esn := 'Artigo retratado.';
  elsif s.status = 'withdrawn' then sn := 0; esn := 'Fonte retirada.';
  elsif s.status = 'superseded' then sn := 0.3; esn := 'Versão substituída (vale só como histórico).';
  elsif s.kind in ('preliminary', 'public_consultation') then sn := 0.4; esn := 'Documento preliminar ou consulta pública (evidência preliminar).';
  elsif s.kind = 'society_guideline' and not s.editorial_approved then sn := 0.5; esn := 'Diretriz de sociedade sem aprovação editorial.';
  else
    sn := case s.authority_level when 'A' then 1 when 'B' then 0.9 when 'C' then 0.8 when 'D' then 0.6 else 0.4 end;
    esn := 'Vigente, nível ' || coalesce(s.authority_level, 'não informado') || '.';
  end if;
  if s.valid_until is not null and s.valid_until < current_date and sn > 0.3 then sn := 0.3; esn := esn || ' A vigência informada já passou.'; end if;
  if s.update_in_progress and sn > 0.1 then sn := sn - 0.1; esn := esn || ' Atualização em andamento.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(v.crossref_alerts, '[]'::jsonb)) x where x ->> 'tipo' in ('expression_of_concern', 'partial_retraction')) and sn > 0.5 then
    sn := 0.5; esn := esn || ' Há manifestação de preocupação ou retratação parcial (Crossref).';
  end if;

  -- metodologia: pelo tipo de documento e o nível (proposta, não validada)
  m := case
    when s.source_type in ('GUIDELINE', 'PCDT', 'CONSENSUS', 'SYSTEMATIC_REVIEW', 'LAW', 'OFFICIAL_EXAM', 'OFFICIAL_ANSWER_KEY', 'MANUAL')
      then case when s.authority_level in ('A', 'B') then 1 else 0.8 end
    when s.source_type in ('DOCUMENT', 'WEB_PAGE') then case when s.authority_level in ('A', 'B') then 0.7 else 0.4 end
    when s.source_type = 'ARTICLE' then 0.6
    when s.source_type = 'BOOK' then 0.5
    when s.source_type is null then case when s.kind = 'society_guideline' or s.authority_level in ('A', 'B') then 0.8 else 0.5 end
    else 0.4 end;
  em := 'Tipo ' || coalesce(s.source_type, 'não informado') || ', nível ' || coalesce(s.authority_level, 'não informado') || '.';

  -- rastreabilidade: impressão digital, documento guardado, identificadores, versão e data
  if s.sha256 is not null then rz := rz + 0.4; erz := erz || 'SHA-256 do arquivo'; end if;
  if v_watched then rz := rz + 0.3; erz := erz || 'link conferido pelo vigia'; end if;
  if s.document_id is not null then rz := rz + 0.2; erz := erz || 'documento guardado'; end if;
  if s.doi is not null or s.pmid is not null then rz := rz + 0.2; erz := erz || 'DOI/PMID'; end if;
  if nullif(btrim(coalesce(s.version, '')), '') is not null then rz := rz + 0.1; erz := erz || 'versão'; end if;
  if coalesce(s.published_on, s.effective_date, s.revision_date) is not null then rz := rz + 0.1; erz := erz || 'data'; end if;
  rz := least(rz, 1);

  v_total := round(100 * ((w ->> 'autenticidade')::numeric * a + (w ->> 'situacao_normativa')::numeric * sn + (w ->> 'metodologia')::numeric * m
                          + (w ->> 'rastreabilidade')::numeric * rz)
                   / nullif((w ->> 'autenticidade')::numeric + (w ->> 'situacao_normativa')::numeric + (w ->> 'metodologia')::numeric + (w ->> 'rastreabilidade')::numeric, 0));
  -- regra: só fonte OFICIAL vigente entra em quarentena (a complementar já é outra classe, com as travas dela)
  v_rule := s.audience = 'oficial' and s.status = 'current' and s.retracted_at is null and (a = 0 or coalesce(v_total, 0) < c.quarantine_below);
  v_quar := coalesce(v.quarantine_override, v_rule);
  v_reason := case
    when v.quarantine_override is not null then 'Decisão da equipe: ' || coalesce(v.override_note, '')
    when v_rule and a = 0 then 'Sem origem conferível (sem link de site oficial nem DOI): fica em quarentena até a equipe conferir.'
    when v_rule then 'Nota ' || v_total || '% abaixo de ' || c.quarantine_below || '%: fica em quarentena até a equipe conferir.'
  end;
  return jsonb_build_object(
    -- pontos: cada dimensão vai de 0 ao peso dela; total = soma (correspondência clínica é nula aqui: máximo 80 com os pesos padrão)
    'total', round(a * (w ->> 'autenticidade')::numeric + sn * (w ->> 'situacao_normativa')::numeric + m * (w ->> 'metodologia')::numeric
                   + rz * (w ->> 'rastreabilidade')::numeric, 1),
    'total_maximo', (w ->> 'autenticidade')::numeric + (w ->> 'situacao_normativa')::numeric + (w ->> 'metodologia')::numeric + (w ->> 'rastreabilidade')::numeric,
    'percentual', v_total,
    'dimensoes', jsonb_build_object('autenticidade', round(a * (w ->> 'autenticidade')::numeric, 1), 'situacao_normativa', round(sn * (w ->> 'situacao_normativa')::numeric, 1),
                                    'metodologia', round(m * (w ->> 'metodologia')::numeric, 1), 'correspondencia_clinica', null,
                                    'rastreabilidade', round(rz * (w ->> 'rastreabilidade')::numeric, 1)),
    'explicacao', jsonb_build_object('autenticidade', ea, 'situacao_normativa', esn, 'metodologia', em,
                                     'correspondencia_clinica', 'Só existe no vínculo com a questão ou a afirmação (não no nível da fonte).',
                                     'rastreabilidade', case when cardinality(erz) = 0 then 'Sem impressão digital, identificador, versão nem data.' else 'Tem: ' || array_to_string(erz, ', ') || '.' end),
    'pesos', w,
    'pesos_aviso', 'Pesos propostos pelo dono; não são uma escala validada.',
    'quarentena', v_quar,
    'motivo', case when v_quar or v.quarantine_override is not null then v_reason end,
    'bloqueada', s.retracted_at is not null or coalesce(v.blocked, false),
    'retratada', s.retracted_at is not null,
    'retratacao', case when s.retracted_at is not null then jsonb_build_object('data', s.retracted_at, 'nota', s.retraction_note, 'doi', s.retraction_notice_doi) end,
    'sobreposicao', case when v.quarantine_override is not null then jsonb_build_object('quarentena', v.quarantine_override, 'nota', v.override_note,
                      'por', (select u.email from auth.users u where u.id = v.override_by), 'em', v.override_at) end
  );
end
$$;

-- Por que a fonte não pode sustentar afirmação: 'retratada' | 'bloqueada' | 'quarentena' | nulo.
create or replace function public.ch_source_block_reason(p_source_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when s.retracted_at is not null then 'retratada'
    when coalesce(v.blocked, false) then 'bloqueada'
    when coalesce((public.ch_source_quality_eval(s.id) ->> 'quarentena')::boolean, false) then 'quarentena'
  end
  from public.ch_sources s left join public.ch_source_vigilance v on v.source_id = s.id
  where s.id = p_source_id
$$;

-- Evidência de fonte bloqueada nunca sustenta nada. Pessoa da equipe: recusa com o motivo. Processamento (IA): a evidência é
-- gravada como "insuficiente" (a afirmação não fica "compatível" por causa dela) e marcada com o motivo.
create or replace function public.ch_evidence_vigilance_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare v_reason text;
begin
  if new.stale or new.verdict = 'insufficient' then return new; end if;
  v_reason := public.ch_source_block_reason(new.source_id);
  if v_reason is null then return new; end if;
  if (select auth.uid()) is not null and public.ch_automation_context() is null then
    raise exception 'Esta fonte está %: não pode sustentar afirmação. Veja a Vigilância científica.',
      case v_reason when 'retratada' then 'retratada (artigo retirado pela revista)' when 'bloqueada' then 'bloqueada pela equipe' else 'em quarentena' end
      using errcode = '22023';
  end if;
  new.verdict := 'insufficient';
  new.numeric_check := coalesce(new.numeric_check, '{}'::jsonb) || jsonb_build_object('ok', false, 'fonte_bloqueada', v_reason);
  return new;
end
$$;
drop trigger if exists ch_evidence_vigilance_guard on public.ch_evidence;
create trigger ch_evidence_vigilance_guard before insert or update of verdict, stale, source_id on public.ch_evidence
  for each row execute function public.ch_evidence_vigilance_guard();

-- Bloqueio pela equipe ou retratação: a fonte sai das vigentes (o status antigo fica guardado) e o que dependia dela vai para
-- revisão (evidências desatualizadas, questões para reanálise, versão candidata das aulas).
create or replace function public.ch_vigilance_withdraw(p_source_id uuid, p_reason text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare s public.ch_sources;
begin
  select * into s from public.ch_sources where id = p_source_id for update;
  if not found then return 0; end if;
  insert into public.ch_source_vigilance (source_id) values (p_source_id) on conflict (source_id) do nothing;
  if s.status = 'current' then
    update public.ch_source_vigilance set prior_status = 'current', updated_at = now() where source_id = p_source_id;
    update public.ch_sources set status = 'withdrawn' where id = p_source_id;
  end if;
  return public.ch_flag_dependents(p_source_id, p_reason);
end
$$;

-- ---------------------------------------------------------------- 7. funções do processamento (Cloud Run)
create or replace function public.ch_vigilance_clean_text(p_value text, p_max integer) returns text
  language sql immutable set search_path = ''
as $$
  select nullif(btrim(left(regexp_replace(coalesce(p_value, ''), '[\u0001-\u001f\u007f​-‏‪-‮⁦-⁩﻿]+', ' ', 'g'), p_max)), '')
$$;

-- Versões candidatas vindas do processamento: SÓ dado (nada aqui é interpretado). Campos url (https e dentro da lista de sites
-- oficiais; senão fica sem link), titulo, data (AAAA-MM-DD) e ato; no máximo 20; candidata vazia sai.
create or replace function public.ch_vigilance_clean_candidates(p_list jsonb) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by o), '[]'::jsonb) from (
    select x.o, jsonb_build_object(
             'url', case when public.ch_vigilance_clean_text(x.v ->> 'url', 2000) ~ '^https://[^\s]+$' and public.ch_watch_domain_of(x.v ->> 'url') is not null
                         then public.ch_vigilance_clean_text(x.v ->> 'url', 2000) end,
             'titulo', public.ch_vigilance_clean_text(x.v ->> 'titulo', 300),
             'data', case when (x.v ->> 'data') ~ '^\d{4}-\d{2}-\d{2}$' then x.v ->> 'data' end,
             'ato', public.ch_vigilance_clean_text(x.v ->> 'ato', 200)) as c
      from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) with ordinality as x(v, o)
     where jsonb_typeof(x.v) = 'object'
     limit 20) y
  where coalesce(c ->> 'url', c ->> 'ato', c ->> 'data') is not null
$$;

-- Fontes vigiadas que venceram (ou que alguém pediu), em lote, com reserva de 20 minutos. Endereço fora da lista de sites
-- oficiais ATIVOS não é baixado: fica "fora_da_lista" e volta a ser olhado em 1 dia.
drop function if exists public.ch_worker_watch_due();
create or replace function public.ch_worker_watch_due(p_limit integer default 40) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  update public.ch_source_watch w set domain_id = public.ch_watch_domain_of(w.url)
   where (w.next_check_at <= now() or w.requested_at is not null)
     and (w.checking_since is null or w.checking_since < now() - interval '20 minutes')
     and w.domain_id is distinct from public.ch_watch_domain_of(w.url);
  update public.ch_source_watch w
     set last_status = 'fora_da_lista', last_checked_at = now(), requested_at = null, checking_since = null,
         last_error = 'Endereço fora da lista de sites oficiais ativos: o vigia não baixa.', next_check_at = now() + interval '1 day'
   where (w.next_check_at <= now() or w.requested_at is not null) and w.domain_id is null;
  with picked as (
    select w.source_id from public.ch_source_watch w
     where (w.next_check_at <= now() or w.requested_at is not null)
       and w.domain_id is not null
       and (w.checking_since is null or w.checking_since < now() - interval '20 minutes')
     order by (w.requested_at is null), w.next_check_at, w.source_id
     limit least(greatest(coalesce(p_limit, 40), 1), 200)
     for update skip locked
  ), upd as (
    update public.ch_source_watch w set checking_since = now() from picked p where w.source_id = p.source_id returning w.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('source_id', u.source_id, 'url', u.url, 'last_hash', u.last_hash, 'hash_method', u.hash_method,
           'text_hash', u.text_hash, 'etag', u.etag, 'last_modified', u.last_modified, 'facts', u.facts, 'domain', d.address)
           order by u.next_check_at), '[]'::jsonb) into v
    from upd u join public.ch_official_domains d on d.id = u.domain_id;
  return v;
end
$$;

-- Sites oficiais ativos (o processamento confere cada redirecionamento contra esta lista).
create or replace function public.ch_worker_vigilance_domains() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'address', d.address, 'institution', d.institution, 'kind', d.kind) order by d.address), '[]'::jsonb)
    from public.ch_official_domains d where d.active
$$;

-- Resultado de uma conferência do vigia. p_report: status ('ok' | 'not_modified' | 'unreachable'), hash, method
-- ('pdf-sha256' | 'html-texto-v2' | 'texto-v2'), text_hash (texto do PDF), size, content_type, etag, last_modified, final_url,
-- facts (o que a página tem: links, atos, datas), candidates (versões candidatas), error.
--   * primeira leitura ou método de comparação novo: vira a base, sem acusar mudança;
--   * PDF com bytes diferentes e o MESMO texto: só metadados (não é mudança);
--   * mudança: ch_source_changes (com as candidatas) + item da fila + revisão do que dependia da fonte (como antes);
--   * fora do ar duas vezes seguidas: item "fora do ar"; voltou a responder: o item se fecha sozinho.
create or replace function public.ch_worker_watch_report(p_source_id uuid, p_report jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  w public.ch_source_watch;
  r jsonb := coalesce(p_report, '{}'::jsonb);
  v_status text := r ->> 'status';
  v_hash text := lower(nullif(r ->> 'hash', ''));
  v_method text := nullif(r ->> 'method', '');
  v_text_hash text := lower(nullif(r ->> 'text_hash', ''));
  v_cands jsonb := public.ch_vigilance_clean_candidates(r -> 'candidates');
  v_changed boolean := false;
  v_rebase boolean := false;
  v_meta boolean := false;
  v_change uuid;
  n integer := 0;
  v_prev text := current_setting('staziamed.automacao', true);
begin
  perform set_config('staziamed.automacao', 'vigilancia', true);
  select * into w from public.ch_source_watch where source_id = p_source_id for update;
  if not found then
    perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
    return null;
  end if;
  if v_status is null or v_status not in ('ok', 'not_modified', 'unreachable') then raise exception 'Situação inválida do vigia: %.', v_status using errcode = '22023'; end if;
  if v_text_hash is not null and v_text_hash !~ '^[0-9a-f]{64}$' then v_text_hash := null; end if;
  if v_status = 'ok' and (v_hash is null or v_hash !~ '^[0-9a-f]{64}$') then
    v_status := 'unreachable';
    r := r || jsonb_build_object('error', 'Resposta sem impressão digital válida.');
  end if;

  if v_status = 'unreachable' then
    perform public.ch_auto_change_assert('link_fora_do_ar');
    update public.ch_source_watch
       set last_status = 'unreachable', last_checked_at = now(), requested_at = null, checking_since = null,
           last_error = coalesce(public.ch_vigilance_clean_text(r ->> 'error', 300), 'Sem resposta.'), fail_count = fail_count + 1,
           next_check_at = now() + make_interval(days => least(interval_days, 1))
     where source_id = p_source_id returning * into w;
    if w.fail_count >= 2 then
      if exists (select 1 from public.ch_vigilance_items i where i.source_id = p_source_id and i.kind = 'fora_do_ar' and i.status in ('pendente', 'vista')) then
        update public.ch_vigilance_items set details = jsonb_build_object('erro', w.last_error, 'falhas', w.fail_count, 'url', w.url),
               summary = 'O link não respondeu em ' || w.fail_count || ' conferências seguidas (' || w.last_error || ').'
         where source_id = p_source_id and kind = 'fora_do_ar' and status in ('pendente', 'vista');
      else
        insert into public.ch_vigilance_items (source_id, kind, summary, details)
        values (p_source_id, 'fora_do_ar', left('O link não respondeu em ' || w.fail_count || ' conferências seguidas (' || w.last_error || ').', 600),
                jsonb_build_object('erro', w.last_error, 'falhas', w.fail_count, 'url', w.url));
      end if;
    end if;
    update public.ch_sources set freshness_status = public.ch_source_freshness(p_source_id) where id = p_source_id;
    perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
    return jsonb_build_object('changed', false, 'status', 'unreachable', 'fail_count', w.fail_count);
  end if;

  -- respondeu: o aviso de fora do ar se fecha sozinho
  update public.ch_vigilance_items
     set status = 'resolvida', decided_at = now(),
         note = left(coalesce(note || ' ', '') || 'O link voltou a responder em ' || public.ch_br_date(now()) || '.', 1000)
   where source_id = p_source_id and kind = 'fora_do_ar' and status in ('pendente', 'vista');

  if v_status = 'not_modified' then
    perform public.ch_auto_change_assert('metadados');
    update public.ch_source_watch
       set last_status = 'ok', last_checked_at = now(), requested_at = null, checking_since = null, last_error = null, fail_count = 0,
           next_check_at = now() + make_interval(days => interval_days)
     where source_id = p_source_id;
    update public.ch_sources set freshness_status = public.ch_source_freshness(p_source_id) where id = p_source_id;
    perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
    return jsonb_build_object('changed', false, 'status', 'not_modified');
  end if;

  if w.last_hash is null then v_rebase := true;
  elsif w.hash_method is distinct from v_method and not (w.hash_method is null and v_method = 'pdf-sha256') then v_rebase := true;
  elsif v_hash = w.last_hash then null;
  elsif v_method = 'pdf-sha256' and w.text_hash is not null and v_text_hash is not null and v_text_hash = w.text_hash then v_meta := true;
  else v_changed := true;
  end if;

  if v_changed then
    perform public.ch_auto_change_assert('nova_versao_catalogo');
    perform public.ch_auto_change_assert('marcar_para_revisao');
    n := public.ch_flag_dependents(p_source_id, 'A publicação monitorada mudou (conteúdo diferente do conferido): rever as afirmações.');
    insert into public.ch_source_changes (source_id, old_hash, new_hash, candidate_versions, version_candidates, details)
    values (p_source_id, w.last_hash, v_hash, n, v_cands,
            jsonb_strip_nulls(jsonb_build_object('metodo', v_method, 'tipo', public.ch_vigilance_clean_text(r ->> 'content_type', 200),
              'tamanho', case when (r ->> 'size') ~ '^\d{1,15}$' then (r ->> 'size')::bigint end,
              'tamanho_antes', w.content_length, 'last_modified', public.ch_vigilance_clean_text(r ->> 'last_modified', 100),
              'url_final', case when (r ->> 'final_url') ~ '^https://' then public.ch_vigilance_clean_text(r ->> 'final_url', 2000) end,
              'conferido_antes', w.last_checked_at, 'texto_do_pdf_igual', null)))
    returning id into v_change;
  else
    perform public.ch_auto_change_assert('metadados');
  end if;

  update public.ch_source_watch set
     last_status = case when v_changed then 'changed' else 'ok' end, last_checked_at = now(), requested_at = null, checking_since = null,
     last_error = null, fail_count = 0, last_hash = v_hash, hash_method = v_method,
     text_hash = case when v_text_hash is not null then v_text_hash when v_changed or v_rebase then null else text_hash end,
     content_type = public.ch_vigilance_clean_text(r ->> 'content_type', 200),
     content_length = case when (r ->> 'size') ~ '^\d{1,15}$' then (r ->> 'size')::bigint end,
     etag = public.ch_vigilance_clean_text(r ->> 'etag', 300),
     last_modified = public.ch_vigilance_clean_text(r ->> 'last_modified', 100),
     final_url = case when (r ->> 'final_url') ~ '^https://' then public.ch_vigilance_clean_text(r ->> 'final_url', 2000) else final_url end,
     facts = case when jsonb_typeof(r -> 'facts') = 'object' and pg_column_size(r -> 'facts') <= 300000 then r -> 'facts'
                  when v_method = 'pdf-sha256' then null else facts end,
     next_check_at = now() + make_interval(days => interval_days)
   where source_id = p_source_id;
  update public.ch_sources set freshness_status = public.ch_source_freshness(p_source_id) where id = p_source_id;
  perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
  return jsonb_build_object('changed', v_changed, 'change_id', v_change, 'rebaselined', v_rebase, 'metadata_only', v_meta,
                            'candidate_versions', n, 'version_candidates', jsonb_array_length(v_cands));
end
$$;

-- A tarefa antiga do Cloud Run (antes da imagem nova) continua funcionando: mesma assinatura e mesma resposta.
create or replace function public.ch_worker_watch_result(p_source_id uuid, p_hash text, p_status text) returns jsonb
  language sql security definer set search_path = ''
as $$
  select public.ch_worker_watch_report(p_source_id, jsonb_build_object('status', case when p_status = 'ok' then 'ok' else 'unreachable' end, 'hash', p_hash, 'method', null))
$$;

-- Fontes com DOI a conferir no Crossref (semanal; retratada não volta a ser conferida), com reserva de 30 minutos.
create or replace function public.ch_worker_identifiers_due(p_limit integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  with picked as (
    select s.id, s.doi, s.pmid
      from public.ch_sources s left join public.ch_source_vigilance x on x.source_id = s.id
     where s.doi is not null and s.retracted_at is null and (x.crossref_next_at is null or x.crossref_next_at <= now())
     order by x.crossref_next_at nulls first, s.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ), lease as (
    insert into public.ch_source_vigilance (source_id, crossref_next_at)
    select id, now() + interval '30 minutes' from picked
    on conflict (source_id) do update set crossref_next_at = excluded.crossref_next_at, updated_at = now()
    returning source_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('source_id', p.id, 'doi', p.doi, 'pmid', p.pmid) order by p.id), '[]'::jsonb) into v
    from picked p where p.id in (select source_id from lease);
  return v;
end
$$;

-- Resultado do Crossref. p_report: status ('ok' | 'retratada' | 'nao_encontrado' | 'erro'), titulo, retracao {data, doi, rotulo,
-- origem}, alertas [{tipo, rotulo, data, doi, origem}], erro.
create or replace function public.ch_worker_identifier_report(p_source_id uuid, p_report jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.ch_sources;
  r jsonb := coalesce(p_report, '{}'::jsonb);
  v_status text := r ->> 'status';
  v_days integer := coalesce((select c.crossref_interval_days from public.ch_vigilance_config c where c.id), 7);
  v_date date;
  v_note text;
  n integer := 0;
  v_prev text := current_setting('staziamed.automacao', true);
begin
  if v_status is null or v_status not in ('ok', 'retratada', 'nao_encontrado', 'erro') then raise exception 'Situação inválida do Crossref: %.', v_status using errcode = '22023'; end if;
  perform set_config('staziamed.automacao', 'vigilancia', true);
  select * into s from public.ch_sources where id = p_source_id for update;
  if not found then
    perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
    return null;
  end if;
  insert into public.ch_source_vigilance (source_id) values (p_source_id) on conflict (source_id) do nothing;
  if v_status = 'erro' then
    update public.ch_source_vigilance set crossref_status = 'erro', crossref_error = public.ch_vigilance_clean_text(r ->> 'erro', 300),
           crossref_checked_at = now(), crossref_next_at = now() + interval '1 day', updated_at = now() where source_id = p_source_id;
  elsif v_status = 'retratada' and s.retracted_at is null then
    perform public.ch_auto_change_assert('retratacao');
    perform public.ch_auto_change_assert('marcar_para_revisao');
    v_date := case when (r #>> '{retracao,data}') ~ '^\d{4}-\d{2}-\d{2}$' then (r #>> '{retracao,data}')::date else current_date end;
    v_note := left('Retratação registrada no Crossref (' || coalesce(public.ch_vigilance_clean_text(r #>> '{retracao,origem}', 60), 'origem não informada')
                   || coalesce(', aviso ' || public.ch_vigilance_clean_text(r #>> '{retracao,doi}', 300), '') || ').', 1000);
    update public.ch_sources set retracted_at = v_date, retraction_note = v_note,
           retraction_notice_doi = lower(public.ch_vigilance_clean_text(r #>> '{retracao,doi}', 300)) where id = p_source_id;
    n := public.ch_vigilance_withdraw(p_source_id, 'Artigo retratado (Crossref): a fonte não pode sustentar nenhuma afirmação; rever o que dependia dela.');
    update public.ch_source_vigilance set crossref_status = 'retratada', crossref_error = null, crossref_checked_at = now(), crossref_next_at = null,
           crossref_title = public.ch_vigilance_clean_text(r ->> 'titulo', 500),
           crossref_alerts = case when jsonb_typeof(r -> 'alertas') = 'array' then r -> 'alertas' else '[]'::jsonb end, updated_at = now()
     where source_id = p_source_id;
    insert into public.ch_vigilance_items (source_id, kind, summary, details)
    values (p_source_id, 'retratada', 'Artigo retratado em ' || to_char(v_date, 'DD/MM/YYYY') || ' (Crossref): bloqueado como evidência; ' || n
              || ' versão(ões) candidata(s) de aula e as questões ligadas foram para revisão.',
            jsonb_strip_nulls(jsonb_build_object('doi', s.doi, 'aviso_doi', r #>> '{retracao,doi}', 'origem', r #>> '{retracao,origem}')))
    on conflict do nothing;
  else
    perform public.ch_auto_change_assert('doi_confirmado');
    update public.ch_source_vigilance
       set crossref_status = case when v_status = 'retratada' then 'retratada' else v_status end, crossref_error = null, crossref_checked_at = now(),
           crossref_next_at = case when v_status = 'retratada' then null else now() + make_interval(days => v_days) end,
           crossref_title = coalesce(public.ch_vigilance_clean_text(r ->> 'titulo', 500), crossref_title),
           crossref_alerts = case when jsonb_typeof(r -> 'alertas') = 'array' then r -> 'alertas' else crossref_alerts end, updated_at = now()
     where source_id = p_source_id;
  end if;
  perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
  return jsonb_build_object('status', v_status, 'dependentes', n);
end
$$;

-- Quarentena em dia com a nota: cria o item das fontes que entraram e fecha o das que saíram. Roda a cada rodada da tarefa.
create or replace function public.ch_worker_vigilance_sync() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_new integer := 0;
  v_closed integer := 0;
  v_prev text := current_setting('staziamed.automacao', true);
begin
  perform set_config('staziamed.automacao', 'vigilancia', true);
  for r in
    select s.id, q.q from public.ch_sources s, lateral (select public.ch_source_quality_eval(s.id) as q) q
     where s.status = 'current' and s.audience = 'oficial'
  loop
    if coalesce((r.q ->> 'quarentena')::boolean, false) then
      if not exists (select 1 from public.ch_vigilance_items i where i.source_id = r.id and i.kind = 'quarentena' and i.status in ('pendente', 'vista')) then
        insert into public.ch_vigilance_items (source_id, kind, summary, details)
        values (r.id, 'quarentena', left(coalesce(r.q ->> 'motivo', 'Em quarentena.'), 600), jsonb_build_object('nota', r.q -> 'total'));
        v_new := v_new + 1;
      end if;
    end if;
  end loop;
  update public.ch_vigilance_items i set status = 'resolvida', decided_at = now(),
         note = left(coalesce(i.note || ' ', '') || 'Saiu da quarentena em ' || public.ch_br_date(now()) || '.', 1000)
   where i.kind = 'quarentena' and i.status in ('pendente', 'vista')
     and not coalesce((public.ch_source_quality_eval(i.source_id) ->> 'quarentena')::boolean, false);
  get diagnostics v_closed = row_count;
  perform set_config('staziamed.automacao', coalesce(v_prev, ''), true);
  return jsonb_build_object('quarentena_nova', v_new, 'quarentena_fechada', v_closed);
end
$$;

-- ---------------------------------------------------------------- 8. dados que já existem
-- frequência e site de cada fonte vigiada (o gatilho acerta site e intervalo); próxima conferência dentro do novo prazo;
-- o que já estava fora do ar conta uma falha (a próxima falha abre o item)
update public.ch_source_watch set url = url;
update public.ch_source_watch set next_check_at = least(next_check_at, coalesce(last_checked_at, now()) + make_interval(days => interval_days))
 where domain_id is not null;
update public.ch_source_watch set fail_count = 1 where last_status = 'unreachable' and fail_count = 0;

-- DOI e PMID do catálogo de fontes importado em 12/10/2026 (só onde o catálogo traz o identificador do próprio documento, no
-- campo "versão"); a ligação é pelo registro da importação (ch_audit 'source.catalog_import'). Em outro banco não faz nada.
update public.ch_sources s set doi = coalesce(s.doi, x.doi), pmid = coalesce(s.pmid, x.pmid)
  from (values
    ('ssc-adultos-2026', '10.1097/ccm.0000000000007075', null),
    ('wses-apendicite-jerusalem-2020', '10.1186/s13017-020-00306-3', null),
    ('sbc-hipertensao-2025', '10.36660/abc.20250624', null),
    ('sbc-sca-sem-supra-2021', '10.36660/abc.20210180', null),
    ('sbc-dor-toracica-2025', '10.36660/abc.20250620', null),
    ('sbc-sindrome-coronariana-cronica-2025', '10.36660/abc.20250619', null),
    ('sbc-fa-2025', '10.36660/abc.20250618', null),
    ('sbc-dislipidemias-2025', '10.36660/abc.20250640', null),
    ('sbc-obesidade-cv-2025', '10.36660/abc.20250621', null),
    ('sbd-diretriz-2026', '10.29327/5881296', null),
    ('sbd-cad', '10.29327/5238993.2023-6', null),
    ('sbd-shhnc', '10.29327/5660187.2025-5', null),
    ('sbd-dmg-rastreamento', '10.29327/557753.2022-11', null),
    ('sbd-dmg-farmacologico', '10.29327/5881296.2026-10', null),
    ('sbd-dm2-manejo', '10.29327/5881296.2026-2', null),
    ('sbem-choosing-wisely-2021', '10.20945/2359-3997000000323', null),
    ('sbpt-asma-2020', '10.1590/1806-3713/e20190307', null),
    ('sbc-tev-2022', '10.36660/abc.20220213', null),
    ('ese-hiponatremia-2014', '10.1530/eje-13-1020', null),
    ('hda-varicosa-sbh-2010', '10.1590/s0004-28032010000200017', null),
    ('drge-fbg-2024', '10.1590/s0004-2803.24612023-154', null),
    ('dhemd-masld-sbem-sbh-abeso-2023', '10.20945/2359-4292-2023-0123', null),
    ('sbd-dmg-metas-monitorizacao-2026', '10.29327/5937145.2026-1', null),
    ('reanimacao-neonatal-sbp-2026-ge34', '10.25060/prn-sbp-2026-1', null),
    ('reanimacao-neonatal-sbp-2026-lt34', '10.25060/prn-sbp-2026-2', null),
    ('sbc-iamcsst-2015', '10.5935/abc.20150107', null),
    ('sbc-valvopatias-2020', '10.36660/abc.20201047', null),
    ('sbem-hipotireoidismo-subclinico-2013', '10.1590/s0004-27302013000300003', null),
    ('sbem-hipertireoidismo-2013', '10.1590/s0004-27302013000300006', null),
    ('sbem-nodulos-2013', '10.1590/s0004-27302013000400002', null),
    ('cirrose-easl-descompensada-2018', '10.1016/j.jhep.2018.03.024', null),
    ('dup-hpylori-iv-consenso-2018', '10.1590/s0004-2803.201800000-20', null),
    ('hda-nao-varicosa-esge-2026', '10.1055/a-2863-8314', null),
    ('pancreatite-aguda-acg-2024', '10.14309/ajg.0000000000002645', null),
    ('wses-apendicite-jerusalem-2025', '10.1001/jamasurg.2025.6218', '41604201'),
    ('amib-sbpt-vm-2025', '10.36416/1806-3756/e20240255', '39936726'),
    ('sbc-ic-2026', '10.36660/abc.20260830', null),
    ('sbc-valvopatias-2026', '10.36660/abc.20260796', null),
    ('sbpt-tep-tratamento-2025', '10.36416/1806-3756/e20240314', null),
    ('hpylori-v-consenso-2026', '10.1590/s0004-2803.24612026-043', null),
    ('estado-mal-epileptico-brasil-caboclo-2025', '10.1055/s-0045-1801872', null)
  ) as x(cid, doi, pmid)
 where s.id = (select (a.details ->> 'source_id')::uuid from public.ch_audit a
                where a.action = 'source.catalog_import' and a.target = x.cid and a.details ? 'source_id' order by a.id desc limit 1)
   and (s.doi is null or s.pmid is null);

-- ---------------------------------------------------------------- 9. permissões
do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ch_worker_watch_due', 'ch_worker_watch_report', 'ch_worker_watch_result', 'ch_worker_vigilance_domains',
             'ch_worker_identifiers_due', 'ch_worker_identifier_report', 'ch_worker_vigilance_sync', 'ch_automation_context', 'ch_auto_change_allowed',
             'ch_auto_change_assert', 'ch_auto_change_refuse', 'ch_auto_guard', 'ch_auto_guard_unit_versions', 'ch_watch_domain_of', 'ch_watch_interval_for',
             'ch_source_watch_domain_trg', 'ch_vigilance_on_change', 'ch_vigilance_on_change_resolved', 'ch_vigilance_on_source', 'ch_source_quality_eval',
             'ch_source_block_reason', 'ch_evidence_vigilance_guard', 'ch_vigilance_withdraw', 'ch_vigilance_clean_candidates', 'ch_vigilance_clean_text', 'ch_br_date') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;

-- quarentena inicial (fontes oficiais vigentes que já entram em quarentena pela regra viram item da fila)
select public.ch_worker_vigilance_sync();
