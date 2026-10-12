-- =============================================================================
-- Questões StaziaMed (Administração › Central de Conteúdo › Questões StaziaMed). Spec:
-- docs/superpowers/specs/2026-10-09-questoes-staziamed-design.md (§5 e §6).
--
--   pedido da equipe (staziamed_requests, uma vaga por questão)  →  tarefa da fila por vaga (question_generate)
--   →  rascunho em draft_questions (origem "servidor")  →  conferências (question_check) e busca de fonte oficial
--      (question_source → draft_source_proposals)  →  revisor médico da área aprova  →  administrador publica.
--
-- Pode ser colada de novo no Supabase sem estragar nada (create ... if not exists, create or replace, drop ... if exists antes
-- de criar política/gatilho/restrição, linhas de dados só quando faltam). Depende das migrações já publicadas (…1800 e …2100 dos
-- rascunhos, …1500 da fila, …9610 que já traz as etapas da fila); não depende da leva 3.
--
-- Regras no banco (não só na tela):
--   * o hash do conteúdo do rascunho é calculado AQUI (gatilho draft_questions_hash): conferência, proposta de fonte e
--     revisão valem só para o conteúdo exato que viram;
--   * a carga antiga (scripts/supabase/engine-seed.ts) não sobrescreve rascunho editado no servidor;
--   * pedidos, propostas e trilha: leitura só da equipe e dos revisores médicos; escrita só pelas funções do banco;
--   * nenhuma etapa automática passa de "aguardando revisão médica".
-- =============================================================================

-- ---------------------------------------------------------------- pedidos de geração
create table if not exists public.staziamed_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,                    -- quem pediu (sem chave estrangeira: o pedido fica no histórico)
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('tema', 'mais_cobrados')),
  area text,                                   -- código editorial (CLINICA_MEDICA, CIRURGIA, …); vazio = as 5 áreas
  topic text,                                  -- só no modo 'tema'
  count integer not null check (count between 1 and 20),
  estimate jsonb,                              -- custo estimado mostrado antes de confirmar
  slots jsonb not null default '[]'::jsonb,    -- [{slot, area, topic, subarea, competency, target, state, reason, draft_id, cost_usd}]
  state text not null default 'na_fila' check (state in ('na_fila', 'gerando', 'concluido')),
  cost_usd numeric(10, 5) not null default 0,
  finished_at timestamptz
);
create index if not exists staziamed_requests_created_idx on public.staziamed_requests (created_at desc);
alter table public.staziamed_requests enable row level security;
drop policy if exists "pedidos StaziaMed: equipe e revisores leem" on public.staziamed_requests;
create policy "pedidos StaziaMed: equipe e revisores leem" on public.staziamed_requests for select to authenticated
  using (public.is_staff() or public.ch_is_reviewer());

-- ---------------------------------------------------------------- rascunhos: origem, edição, geração e publicação
alter table public.draft_questions
  add column if not exists generated_by text not null default 'gerador_antigo' check (generated_by in ('gerador_antigo', 'servidor')),
  add column if not exists topic text,                                       -- tema da lista de temas das provas oficiais
  add column if not exists request_id uuid references public.staziamed_requests (id) on delete set null,
  add column if not exists edited_by uuid references auth.users (id) on delete set null,
  add column if not exists edited_at timestamptz,                            -- editado no servidor: a carga antiga não sobrescreve
  add column if not exists similar_question_id text references public.questions (id) on delete set null,
  add column if not exists generation jsonb not null default '{}'::jsonb,   -- trilha da geração: modelos, prompts, trechos, reescrita, custo
  add column if not exists question_id text references public.questions (id),
  add column if not exists published_hash text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users (id) on delete set null;
create index if not exists draft_questions_request_idx on public.draft_questions (request_id) where request_id is not null;

-- Hash do conteúdo: enunciado, tabela de apoio, alternativas, gabarito, explicações, decisão clínica, tema e citações.
-- Título, situação, revisão e trilha ficam de fora (não mudam o que o médico leu).
create or replace function public.draft_content_hash(d public.draft_questions) returns text
  language sql immutable security definer set search_path = ''
as $$
  select public.ch_hash(jsonb_build_object(
    'stem', d.stem,
    'support', jsonb_build_object('type', d.support_type, 'title', d.support_title, 'rows', d.support_rows),
    'alternatives', d.alternatives,
    'answer', d.correct_answer,
    'explanation', d.explanation,
    'alternative_explanations', d.alternative_explanations,
    'clinical_decision', d.clinical_decision,
    'topic', d.topic,
    'citations', d.source_citations))
$$;

create or replace function public.draft_questions_set_hash() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.content_hash := public.draft_content_hash(new);
  return new;
end
$$;
drop trigger if exists draft_questions_hash on public.draft_questions;
create trigger draft_questions_hash before insert or update on public.draft_questions
  for each row execute function public.draft_questions_set_hash();

-- Recalcula os que já existem (o hash antigo vinha do arquivo do gerador): conferências e revisões feitas sobre o hash
-- antigo ficam desatualizadas e são refeitas com as regras novas.
update public.draft_questions set content_hash = content_hash;

-- ---------------------------------------------------------------- propostas de fonte oficial ("Buscar fonte oficial")
create table if not exists public.draft_source_proposals (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.draft_questions (id) on delete cascade,
  content_hash text not null,                  -- versão do rascunho para a qual a proposta foi feita
  claims jsonb not null,                       -- [{claim, citation | null}] (trecho literal ou "não encontrada")
  complete boolean not null,                   -- decisão clínica e todos os números com trecho
  state text not null default 'pendente' check (state in ('pendente', 'aceita', 'descartada', 'obsoleta')),
  meta jsonb not null default '{}'::jsonb,     -- modelos, custo, trechos oferecidos
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create index if not exists draft_source_proposals_draft_idx on public.draft_source_proposals (draft_id, created_at desc);
alter table public.draft_source_proposals enable row level security;
drop policy if exists "propostas de fonte: equipe e revisores leem" on public.draft_source_proposals;
create policy "propostas de fonte: equipe e revisores leem" on public.draft_source_proposals for select to authenticated
  using (public.is_staff() or public.ch_is_reviewer());

-- ---------------------------------------------------------------- trilha de cada rascunho
create table if not exists public.draft_question_events (
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.draft_questions (id) on delete cascade,
  kind text not null check (kind in ('importada', 'gerada', 'editada', 'fonte_proposta', 'fonte_aceita', 'conferida', 'decisao',
                                     'publicada', 'republicada', 'recolhida')),
  actor_id uuid,                               -- quem (vazio = carga ou processamento automático)
  at timestamptz not null default now(),
  content_hash text,                           -- conteúdo do rascunho naquele momento
  previous jsonb,                              -- conteúdo anterior (na edição)
  note text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists draft_question_events_draft_idx on public.draft_question_events (draft_id, at);
alter table public.draft_question_events enable row level security;
drop policy if exists "trilha dos rascunhos: equipe e revisores leem" on public.draft_question_events;
create policy "trilha dos rascunhos: equipe e revisores leem" on public.draft_question_events for select to authenticated
  using (public.is_staff() or public.ch_is_reviewer());

-- Registra um passo na trilha com o hash ATUAL do rascunho. Ator: o informado ou quem está logado.
create or replace function public.draft_event(p_draft_id uuid, p_kind text, p_note text default null, p_previous jsonb default null,
                                   p_details jsonb default '{}'::jsonb, p_actor uuid default null) returns void
  language sql security definer set search_path = ''
as $$
  insert into public.draft_question_events (draft_id, kind, actor_id, content_hash, previous, note, details)
  values (p_draft_id, p_kind, coalesce(p_actor, (select auth.uid())),
          (select d.content_hash from public.draft_questions d where d.id = p_draft_id), p_previous, p_note, coalesce(p_details, '{}'::jsonb))
$$;

-- Rascunho do gerador antigo que entra pela carga: 'importada' na trilha (reaplicar a carga não repete: é atualização).
create or replace function public.draft_questions_log_import() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.draft_event(new.id, 'importada', null, null, jsonb_build_object('batch', new.batch, 'source_id', new.source_id));
  return null;
end
$$;
drop trigger if exists draft_questions_imported on public.draft_questions;
create trigger draft_questions_imported after insert on public.draft_questions
  for each row when (new.generated_by = 'gerador_antigo') execute function public.draft_questions_log_import();

-- Os que já estavam no banco antes desta migração.
insert into public.draft_question_events (draft_id, kind, content_hash, details)
select d.id, 'importada', d.content_hash, jsonb_build_object('batch', d.batch, 'source_id', d.source_id)
from public.draft_questions d
where d.generated_by = 'gerador_antigo'
  and not exists (select 1 from public.draft_question_events e where e.draft_id = d.id and e.kind = 'importada');

-- ---------------------------------------------------------------- fila: etapas novas (sem documento, como visual_render)
-- União das etapas de todos os ramos: as de antes (…5100_materiais_visuais), as das estações, as das Questões StaziaMed
-- e a da busca de fontes oficiais.
alter table public.ch_jobs drop constraint if exists ch_jobs_step_check;
alter table public.ch_jobs add constraint ch_jobs_step_check
  check (step in ('extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index', 'visual_render',
                  'station_pages', 'station_segment', 'station_draft',
                  'question_generate', 'question_check', 'question_source',
                  'source_search'));

-- ---------------------------------------------------------------- semelhança: o que o servidor compara
-- Enunciados das provas oficiais (origem 'official') e dos rascunhos não recusados (Questões StaziaMed ainda não publicadas ou
-- já publicadas: o rascunho fica ligado à questão). É plpgsql porque lê questions.origin, coluna da …9801 (o corpo só é
-- conferido ao rodar). Só o servidor chama.
create or replace function public.ch_worker_similarity_corpus() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  return jsonb_build_object(
    'official', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.statement) order by q.id)
                          from public.questions q where q.origin = 'official'), '[]'::jsonb),
    'staziamed', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'text', d.stem) order by d.batch, d.slot, d.id)
                           from public.draft_questions d where d.status <> 'rejected'), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- áreas: código editorial ⇄ med_area
-- Vagas e rascunhos usam o código editorial (CLINICA_MEDICA, CIRURGIA, GINECOLOGIA_OBSTETRICIA, PEDIATRIA, MFC: os de
-- ch_reviewer_areas); a conversão para med_area só acontece ao publicar (e ao ler as questões oficiais).
create or replace function public.staziamed_med_area(p_area text) returns public.med_area
  language sql immutable set search_path = ''
as $$
  select case p_area
           when 'CIRURGIA' then 'CIRURGIA_GERAL'::public.med_area
           when 'MFC' then 'MEDICINA_FAMILIA_COMUNIDADE'::public.med_area
           when 'CLINICA_MEDICA' then 'CLINICA_MEDICA'::public.med_area
           when 'GINECOLOGIA_OBSTETRICIA' then 'GINECOLOGIA_OBSTETRICIA'::public.med_area
           when 'PEDIATRIA' then 'PEDIATRIA'::public.med_area end
$$;

create or replace function public.staziamed_editorial_area(p_area public.med_area) returns text
  language sql immutable set search_path = ''
as $$
  select case p_area::text when 'CIRURGIA_GERAL' then 'CIRURGIA' when 'MEDICINA_FAMILIA_COMUNIDADE' then 'MFC' else p_area::text end
$$;

-- ---------------------------------------------------------------- acervo de fontes oficiais
-- Fontes oficiais com pelo menos um trecho: a regra de ch_worker_search_official_passages (nível A a D, final, vigente, sem
-- data de validade vencida). Sem nenhuma, "Gerar" e "Buscar fonte oficial" dizem "Cadastre fontes oficiais na Central de Conteúdo".
create or replace function public.staziamed_acervo() returns integer
  language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.ch_sources s
  where s.status = 'current' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final'
    and (s.valid_until is null or s.valid_until >= current_date)
    and exists (select 1 from public.ch_source_passages p where p.source_id = s.id)
$$;

create or replace function public.ch_worker_staziamed_acervo() returns integer
  language sql stable security definer set search_path = ''
as $$ select public.staziamed_acervo() $$;

-- ---------------------------------------------------------------- peso dos temas nas provas oficiais
-- peso(prova) = 0,5 ^ ((ref − período) / 6): meia-vida de 6 semestres. período = ano×2 + semestre (ENAMED = 2; sem semestre = 2);
-- ref = o maior período entre as provas oficiais. peso(tema) = soma dos pesos das questões oficiais não anuladas do tema.
-- plpgsql porque lê questions.origin (coluna da …9801: o corpo só é conferido ao rodar).
create or replace function public.staziamed_topic_weights(p_area text default null)
  returns table (area text, topic text, weight numeric, total integer)
  language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
  with per as (
    select q.id, public.staziamed_editorial_area(q.area) as area, q.topic,
           (e.year * 2 + case when e.kind = 'ENAMED' then 2 else coalesce(e.semester, 2) end)::int as period
    from public.questions q join public.exams e on e.id = q.exam_id
    where q.origin = 'official' and q.status <> 'annulled'
  ), ref as (select coalesce(max(period), 0) as r from per)
  select per.area, per.topic,
         round(sum(power(0.5::numeric, (ref.r - per.period)::numeric / 6)), 6) as weight,
         count(*)::int as total
  from per cross join ref
  where p_area is null or per.area = p_area
  group by per.area, per.topic
  order by per.area, weight desc, per.topic;
end
$$;

-- ---------------------------------------------------------------- vagas do pedido
-- Devolve [{ slot, area, topic, subarea, competency, target, state, reason, draft_id, cost_usd }].
--   'tema'          todas as vagas no (área, tema) pedidos;
--   'mais_cobrados' sem área: vagas por área pelo maior resto sobre as questões oficiais não anuladas de cada área (empate: código);
--                   numa área: temas por peso (desc) e nome; rodada 1 = 1 vaga por tema na ordem, rodada 2 = a 2ª vaga na mesma
--                   ordem, nunca 3 (se o pedido for maior que 2 vagas por tema, devolve só as que cabem);
--   subárea e competência: o par mais frequente do tema em question_dna das oficiais (empate: ordem alfabética), nulos sem DNA;
--   letra-alvo: n div 4 de cada; o resto vai para as letras com menos StaziaMed publicadas não recolhidas (empate: alfabética);
--               a vaga i recebe a i-ésima letra da sequência, em rodadas A→D, pulando as letras esgotadas.
create or replace function public.staziamed_plan_slots(p_mode text, p_area text, p_topic text, p_count integer) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pairs jsonb := '[]'::jsonb;   -- [{area, topic}] na ordem das vagas
  v_slots jsonb := '[]'::jsonb;
  v_n integer;
  v_base integer; v_rest integer;
  v_extra text[] := '{}';
  v_left jsonb;
  v_seq text[] := '{}';
  v_letter text;
  r record;
  v_i integer; v_take integer; v_topics text[]; v_total integer; v_alloc record;
  v_pair jsonb; v_sub text; v_comp text;
begin
  if p_count is null or p_count < 1 then return '[]'::jsonb; end if;
  if p_mode = 'tema' then
    select jsonb_agg(jsonb_build_object('area', p_area, 'topic', p_topic)) into v_pairs from generate_series(1, p_count);
  else
    -- quantas vagas por área
    for v_alloc in
      with c as (
        select public.staziamed_editorial_area(q.area) as area, count(*)::int as n
        from public.questions q where q.origin = 'official' and q.status <> 'annulled'
          and (nullif(p_area, '') is null or public.staziamed_editorial_area(q.area) = p_area)
        group by 1
      ), t as (select sum(n)::numeric as total from c),
      quota as (select c.area, floor(p_count * c.n / t.total)::int as base, (p_count * c.n / t.total) - floor(p_count * c.n / t.total) as frac from c cross join t),
      lacking as (select p_count - sum(base)::int as k from quota)
      select qu.area, qu.base + case when row_number() over (order by qu.frac desc, qu.area) <= (select k from lacking) then 1 else 0 end as n
      from quota qu order by qu.area
    loop
      continue when v_alloc.n <= 0;
      select array_agg(w.topic order by w.weight desc, w.topic) into v_topics from public.staziamed_topic_weights(v_alloc.area) w;
      v_total := coalesce(cardinality(v_topics), 0);
      continue when v_total = 0;
      v_take := least(v_alloc.n, v_total * 2);
      for v_i in 0 .. v_take - 1 loop
        v_pairs := v_pairs || jsonb_build_array(jsonb_build_object('area', v_alloc.area, 'topic', v_topics[1 + (v_i % v_total)]));
      end loop;
    end loop;
  end if;
  v_n := jsonb_array_length(v_pairs);
  if v_n = 0 then return '[]'::jsonb; end if;

  -- letras-alvo
  v_base := v_n / 4;
  v_rest := v_n % 4;
  select coalesce(array_agg(x.l order by x.n, x.l), '{}') into v_extra from (
    select l.l, (select count(*) from public.questions q
                 where q.origin = 'staziamed' and q.retired_at is null and q.correct_option::text = l.l) as n
    from (values ('A'), ('B'), ('C'), ('D')) as l (l)
    order by 2, 1 limit v_rest) x;
  v_left := jsonb_build_object('A', v_base + case when 'A' = any (v_extra) then 1 else 0 end,
                               'B', v_base + case when 'B' = any (v_extra) then 1 else 0 end,
                               'C', v_base + case when 'C' = any (v_extra) then 1 else 0 end,
                               'D', v_base + case when 'D' = any (v_extra) then 1 else 0 end);
  while cardinality(v_seq) < v_n loop
    foreach v_letter in array array['A', 'B', 'C', 'D'] loop
      if (v_left ->> v_letter)::int > 0 then
        v_seq := v_seq || v_letter;
        v_left := jsonb_set(v_left, array[v_letter], to_jsonb((v_left ->> v_letter)::int - 1));
      end if;
    end loop;
  end loop;

  -- subárea e competência mais frequentes do tema
  for v_i in 1 .. v_n loop
    v_pair := v_pairs -> (v_i - 1);
    select d.subarea, d.competency into v_sub, v_comp
    from public.question_dna d join public.questions q on q.id = d.question_id
    where q.origin = 'official' and q.topic = v_pair ->> 'topic' and public.staziamed_editorial_area(q.area) = v_pair ->> 'area'
      and d.subarea is not null and d.competency is not null
    group by d.subarea, d.competency
    order by count(*) desc, d.subarea, d.competency
    limit 1;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'slot', v_i, 'area', v_pair ->> 'area', 'topic', v_pair ->> 'topic', 'subarea', v_sub, 'competency', v_comp,
      'target', v_seq[v_i], 'state', 'na_fila', 'reason', null, 'draft_id', null, 'cost_usd', 0));
    v_sub := null; v_comp := null;
  end loop;
  return v_slots;
end
$$;

-- ---------------------------------------------------------------- lista de temas e pedido
create or replace function public.app_staziamed_topics(p_area text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('area', w.area, 'topic', w.topic, 'total', w.total) order by w.area, w.topic)
                   from public.staziamed_topic_weights(nullif(p_area, '')) w), '[]'::jsonb);
end
$$;

create or replace function public.app_staziamed_request_create(p_mode text, p_area text, p_topic text, p_count integer, p_estimate jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
  v_slots jsonb;
  v_req public.staziamed_requests;
  v_i integer;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Gerar questões StaziaMed é da equipe (administrador ou editor).' using errcode = '42501';
  end if;
  perform public.ch_assert_staff();
  if p_mode is null or p_mode not in ('tema', 'mais_cobrados') then raise exception 'Modo inválido.' using errcode = '22023'; end if;
  if p_count is null or p_count not between 1 and 20 then raise exception 'Escolha de 1 a 20 questões.' using errcode = '22023'; end if;
  if public.staziamed_acervo() = 0 then
    raise exception 'Cadastre fontes oficiais na Central de Conteúdo' using errcode = '55000';
  end if;
  if v_area is not null and public.staziamed_med_area(v_area) is null then raise exception 'Área inválida.' using errcode = '22023'; end if;
  if p_mode = 'tema' then
    if v_area is null or v_topic is null
       or not exists (select 1 from public.staziamed_topic_weights(v_area) w where w.topic = v_topic) then
      raise exception 'Escolha um tema da lista de temas das provas oficiais.' using errcode = '22023';
    end if;
  else
    v_topic := null;
  end if;
  if exists (select 1 from public.staziamed_requests r
             where r.created_by = v_uid and r.mode = p_mode and r.area is not distinct from v_area and r.topic is not distinct from v_topic
               and r.count = p_count and r.created_at > now() - interval '2 minutes' and r.state <> 'concluido') then
    raise exception 'Este pedido já está na fila.' using errcode = '55000';
  end if;
  v_slots := public.staziamed_plan_slots(p_mode, v_area, v_topic, p_count);
  if jsonb_array_length(v_slots) = 0 then
    raise exception 'As provas oficiais não têm temas suficientes para este pedido.' using errcode = '22023';
  end if;
  insert into public.staziamed_requests (created_by, mode, area, topic, count, estimate, slots)
  values (v_uid, p_mode, v_area, v_topic, p_count, coalesce(p_estimate, '{}'::jsonb), v_slots)
  returning * into v_req;
  for v_i in 1 .. jsonb_array_length(v_slots) loop
    insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, max_attempts)
    values (null, 'question_generate', 'staziamed:' || v_req.id || ':' || v_i, 'qgen:' || v_req.id || ':' || v_i, 3);
  end loop;
  perform public.ch_log('staziamed.request', v_req.id::text,
    jsonb_build_object('mode', p_mode, 'area', v_area, 'topic', v_topic, 'count', p_count, 'slots', jsonb_array_length(v_slots)));
  return jsonb_build_object('id', v_req.id, 'mode', v_req.mode, 'area', v_req.area, 'topic', v_req.topic, 'count', v_req.count,
                            'estimate', v_req.estimate, 'slots', v_req.slots, 'state', v_req.state, 'created_at', v_req.created_at);
end
$$;

-- Pedidos recentes, com a situação de cada vaga e da tarefa dela na fila (equipe e revisores leem).
create or replace function public.app_staziamed_requests(p_limit integer default 10) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'mode', r.mode, 'area', r.area, 'topic', r.topic, 'count', r.count, 'estimate', r.estimate, 'state', r.state,
      'created_at', r.created_at, 'finished_at', r.finished_at, 'cost_usd', r.cost_usd,
      'created_by_email', (select u.email from auth.users u where u.id = r.created_by),
      'summary', jsonb_build_object(
        'geradas', (select count(*)::int from jsonb_array_elements(r.slots) s where s ->> 'state' = 'gerada'),
        'puladas', (select count(*)::int from jsonb_array_elements(r.slots) s where s ->> 'state' = 'pulada'),
        'descartadas', (select count(*)::int from jsonb_array_elements(r.slots) s where s ->> 'state' = 'descartada')),
      'slots', (select coalesce(jsonb_agg(s || jsonb_build_object('job_status', j.status, 'job_error', j.error) order by (s ->> 'slot')::int), '[]'::jsonb)
                from jsonb_array_elements(r.slots) s
                left join public.ch_jobs j on j.idempotency_key = 'qgen:' || r.id || ':' || (s ->> 'slot'))
    ) order by r.created_at desc)
    from (select * from public.staziamed_requests order by created_at desc limit least(greatest(coalesce(p_limit, 10), 1), 50)) r
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.app_staziamed_topics(text) from public, anon;
grant execute on function public.app_staziamed_topics(text) to authenticated;
revoke execute on function public.app_staziamed_request_create(text, text, text, integer, jsonb) from public, anon;
grant execute on function public.app_staziamed_request_create(text, text, text, integer, jsonb) to authenticated;
revoke execute on function public.app_staziamed_requests(integer) from public, anon;
grant execute on function public.app_staziamed_requests(integer) to authenticated;

-- ---------------------------------------------------------------- funções de serviço e de apoio: fechadas para o app
do $revoke$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'ch\_worker\_%' or p.proname like 'draft\_%' or p.proname like 'staziamed\_%') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;
