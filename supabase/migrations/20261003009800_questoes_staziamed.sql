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
