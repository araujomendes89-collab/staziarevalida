-- Dificuldade das questões CLASSIFICADA POR AGENTES (Gemini do Vertex + conferência do agente Claude), escala 1 a 5.
-- Pedido do dono (16/10/2026): "Quero uma classificacao geral do nivel de dificuldade de todas as questoes".
--
-- ADITIVA e separada da dificuldade validada: NÃO é validação humana e NUNCA aparece como "validada pela equipe".
--   * question_difficulty_review (20261003010500) continua sendo só cadastro humano (validated_by NOT NULL). Esta migração não
--     escreve nela, não a altera e não apaga nada dela.
--   * question_difficulty_agents (nova): uma linha por questão, com nível 1 a 5, faixa, motivo, confiança e a origem
--     'classificada_agentes' (única permitida). Só a equipe lê; ninguém grava pela API (a carga vem por SQL do servidor).
--   * question_difficulty_effective(question_id): devolve a dificuldade a usar e DE ONDE ela vem, na ordem de confiança:
--       1 validada_equipe  >  2 classificada_agentes
--     (a estimativa automática do motor, question_dna.difficulty_estimate, fica abaixo; as fontes TRI calibrada e revisão
--     médica do nivelamento se encaixam entre as duas: quem usa a função decide a posição delas).
--   * app_admin_difficulty_agents_summary(): resumo para a equipe (área x faixa x origem).
-- O aluno não lê nada disto. A dificuldade que o aluno vê após responder (app_question_difficulty) segue sendo só a validada.

create table if not exists public.question_difficulty_agents (
  question_id text primary key references public.questions (id) on delete cascade,
  level smallint not null check (level between 1 and 5),
  band text not null check (band in ('facil', 'media', 'dificil')),
  reason text check (reason is null or char_length(reason) <= 600),
  confidence text not null default 'media' check (confidence in ('alta', 'media', 'baixa')),
  origin text not null default 'classificada_agentes' check (origin = 'classificada_agentes'),
  gemini_level smallint check (gemini_level is null or gemini_level between 1 and 5),
  claude_checked boolean not null default false,
  claude_adjusted boolean not null default false,
  model text,
  classified_at timestamptz not null default now(),
  constraint question_difficulty_agents_level_band_check check (
    (level in (1, 2) and band = 'facil') or (level = 3 and band = 'media') or (level in (4, 5) and band = 'dificil'))
);
create index if not exists question_difficulty_agents_band_idx on public.question_difficulty_agents (band);
alter table public.question_difficulty_agents enable row level security;
revoke all on table public.question_difficulty_agents from public, anon, authenticated;
grant select on table public.question_difficulty_agents to authenticated;
drop policy if exists "dificuldade por agentes: só a equipe lê" on public.question_difficulty_agents;
create policy "dificuldade por agentes: só a equipe lê" on public.question_difficulty_agents
  for select to authenticated using ((select public.is_staff()));

-- Dificuldade a usar para uma questão e de onde ela vem. Interna (servidor/outras funções): a validada da equipe manda;
-- sem ela, a classificada por agentes; sem nenhuma das duas, não devolve linha.
create or replace function public.question_difficulty_effective(p_question_id text)
  returns table (level smallint, band text, source text, source_order smallint)
  language sql stable security definer set search_path = ''
as $$
  select r.level,
         case when r.level in (1, 2) then 'facil' when r.level = 3 then 'media' else 'dificil' end,
         'validada_equipe'::text, 1::smallint
  from public.question_difficulty_review r where r.question_id = p_question_id
  union all
  select a.level, a.band, 'classificada_agentes'::text, 2::smallint
  from public.question_difficulty_agents a
  where a.question_id = p_question_id
    and not exists (select 1 from public.question_difficulty_review r where r.question_id = p_question_id)
$$;
revoke execute on function public.question_difficulty_effective(text) from public, anon, authenticated;

-- Resumo para a equipe: por área e faixa, quantas questões válidas há em cada origem da dificuldade.
create or replace function public.app_admin_difficulty_agents_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return (
    with base as (
      select q.id, q.area::text as area,
             case when r.level is not null then 'validada_equipe' when a.level is not null then 'classificada_agentes' else 'sem_dificuldade' end as source,
             coalesce(case when r.level in (1, 2) then 'facil' when r.level = 3 then 'media' when r.level in (4, 5) then 'dificil' end, a.band) as band
      from public.questions q
      left join public.question_difficulty_review r on r.question_id = q.id
      left join public.question_difficulty_agents a on a.question_id = q.id
      where q.status = 'valid'
    )
    select jsonb_build_object(
      'total', (select count(*)::int from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('area', area, 'band', band, 'source', source, 'n', n) order by area, source, band)
                        from (select area, band, source, count(*)::int as n from base group by area, band, source) s), '[]'::jsonb)
    )
  );
end
$$;
revoke execute on function public.app_admin_difficulty_agents_summary() from public, anon;
grant execute on function public.app_admin_difficulty_agents_summary() to authenticated;
