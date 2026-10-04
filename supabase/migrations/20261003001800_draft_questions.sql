-- =============================================================================
-- Questões inéditas StaziaMed geradas pelo motor (rascunhos): ficam FORA do banco de questões
-- até a revisão médica. A revisão automática (IA) vem junto só como apontamento; quem aprova é
-- um revisor médico cadastrado na área. Nunca são atribuídas ao Inep.
-- =============================================================================

create table public.draft_questions (
  id uuid primary key default gen_random_uuid(),
  batch text not null,                     -- ex.: simulado_preditivo_2026_2_001
  source_id text not null,                 -- id dentro do lote (repete entre lotes)
  slot integer not null,
  area text not null,                      -- código da taxonomia editorial (CLINICA_MEDICA, CIRURGIA, …)
  subarea text,
  competency text,
  title text,
  stem text not null,
  alternatives jsonb not null,             -- {"A": "...", ...}
  correct_answer char(1) not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanation text,
  alternative_explanations jsonb not null default '{}'::jsonb,
  source_citations jsonb not null default '[]'::jsonb,
  update_application text,
  similarity_to_official numeric(5, 1),    -- % máxima de semelhança com questão oficial (originalidade)
  model text,
  generated_at timestamptz,
  ai_review jsonb,                         -- revisão automática: NÃO é aprovação
  content_hash text not null,
  status text not null default 'awaiting_medical_review'
    check (status in ('awaiting_medical_review', 'approved', 'needs_changes', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  reviewed_hash text,                      -- o conteúdo exato que foi revisado
  unique (batch, source_id)
);
create index draft_questions_status_idx on public.draft_questions (status, area);
alter table public.draft_questions enable row level security;
create policy "rascunhos: equipe e revisores leem" on public.draft_questions for select to authenticated
  using (public.is_staff() or public.ch_is_reviewer());

create function public.app_draft_questions(
  p_batch text default null, p_status text default null, p_area text default null, p_limit integer default 30, p_offset integer default 0
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'batches', (select coalesce(jsonb_agg(x order by x ->> 'batch'), '[]'::jsonb) from (
        select jsonb_build_object('batch', batch, 'total', count(*)::int,
          'awaiting', count(*) filter (where status = 'awaiting_medical_review')::int,
          'approved', count(*) filter (where status = 'approved')::int,
          'needs_changes', count(*) filter (where status = 'needs_changes')::int,
          'rejected', count(*) filter (where status = 'rejected')::int) as x
        from public.draft_questions group by batch) b),
    'total', (select count(*)::int from public.draft_questions d
              where (p_batch is null or d.batch = p_batch) and (p_status is null or d.status = p_status) and (p_area is null or d.area = p_area)),
    'items', coalesce((select jsonb_agg(to_jsonb(d) - 'content_hash' || jsonb_build_object(
        'can_review', public.ch_is_reviewer(d.area),
        'reviewer', (select email from auth.users where id = d.reviewed_by),
        'review_outdated', d.reviewed_hash is not null and d.reviewed_hash <> d.content_hash) order by d.batch, d.slot)
      from (select * from public.draft_questions d
            where (p_batch is null or d.batch = p_batch) and (p_status is null or d.status = p_status) and (p_area is null or d.area = p_area)
            order by d.batch, d.slot limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) d), '[]'::jsonb));
end
$$;

-- Decisão de uma PESSOA: revisor médico cadastrado na área da questão. Registra quem, quando e o hash.
create function public.app_draft_question_decide(p_id uuid, p_decision text, p_note text default null) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare d public.draft_questions;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into d from public.draft_questions where id = p_id;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_is_reviewer(d.area) then
    raise exception 'A revisão médica desta questão é de um revisor cadastrado na área %.', d.area using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'needs_changes', 'rejected') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if p_decision <> 'approved' and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Explique o motivo para pedir ajustes ou recusar.' using errcode = '22023';
  end if;
  update public.draft_questions set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(),
         review_note = nullif(btrim(p_note), ''), reviewed_hash = d.content_hash where id = p_id;
  perform public.ch_log('draft_question.' || p_decision, p_id::text, jsonb_build_object('hash', d.content_hash));
  return true;
end
$$;
