-- Dificuldade das questões na ESCALA DO INEP (índice de facilidade), escala 1 a 5. Recalibração pedida pelo dono (16/10/2026):
-- "temos que recalibrar essas questoes, usar um padrao matematico, medico, os mesmos que o inep utiliza para classificar as questoes".
--
-- Padrão usado (fontes no roteiro do ramo e no comentário da tabela):
--   * Índice de facilidade = proporção de acerto (p) do item (Teoria Clássica). Faixas oficiais do Enade (Relatório Síntese de
--     Área, seção 1.5.1, Tabela 1.2, MEC/Inep/Daes): p >= 0,86 muito fácil; 0,61 a 0,85 fácil; 0,41 a 0,60 médio;
--     0,16 a 0,40 difícil; p <= 0,15 muito difícil. Aqui: nível 1 a 5 nessa ordem, com p arredondado a 2 casas.
--   * TRI: o Enamed (e o Revalida, que usa a mesma Matriz de Referência Comum) usa o modelo de Rasch (só o parâmetro b),
--     Nota Técnica Inep 42/2025 (item 5.2) e 19/2025 (item 7.5). Quando o Inep publica o b do item, ele é guardado aqui.
--   * Discriminação: correlação bisserial publicada pelo Inep (guardada quando existe).
--
-- Dois tipos de linha:
--   * 'medida'   — p calculado dos microdados oficiais do Inep (respostas reais), com b e bisserial do próprio Inep.
--   * 'estimada' — p previsto por rubrica médica explícita, calibrada por regressão contra as questões medidas
--                  (erro da validação cruzada registrado em source). Nunca aparece como medida nem como validada.
--
-- ADITIVA: não escreve em question_difficulty_review (validação humana, que continua mandando) e não muda gabarito nem texto.
-- O aluno não lê nada disto. A dificuldade que o aluno vê após responder (app_question_difficulty) segue sendo só a validada.

create table if not exists public.question_difficulty_agents (
  question_id text primary key references public.questions (id) on delete cascade,
  level smallint not null check (level between 1 and 5),
  inep_band text not null check (inep_band in ('muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil')),
  band text not null check (band in ('facil', 'media', 'dificil')),
  p numeric(5, 4) not null check (p between 0 and 1),
  p_low numeric(5, 4) check (p_low is null or p_low between 0 and 1),
  p_high numeric(5, 4) check (p_high is null or p_high between 0 and 1),
  method text not null check (method in ('medida', 'estimada')),
  source text not null check (char_length(source) between 3 and 400),
  n_respondents integer check (n_respondents is null or n_respondents > 0),
  irt_model text check (irt_model is null or irt_model = 'rasch'),
  irt_b double precision check (irt_b is null or irt_b between -10 and 10),
  point_biserial double precision check (point_biserial is null or point_biserial between -1 and 1),
  confidence text not null default 'media' check (confidence in ('alta', 'media', 'baixa')),
  reason text check (reason is null or char_length(reason) <= 600),
  rubric jsonb,
  origin text not null default 'classificada_agentes' check (origin = 'classificada_agentes'),
  classified_at timestamptz not null default now(),
  -- nível = faixa do Inep pelo p arredondado a 2 casas
  constraint question_difficulty_agents_level_p_check check (
    level = case when round(p, 2) >= 0.86 then 1 when round(p, 2) >= 0.61 then 2 when round(p, 2) >= 0.41 then 3
                 when round(p, 2) >= 0.16 then 4 else 5 end),
  constraint question_difficulty_agents_level_inep_band_check check (
    inep_band = (array['muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil'])[level]),
  -- faixa curta (fácil/média/difícil), a mesma que o nivelamento usa
  constraint question_difficulty_agents_level_band_check check (
    (level in (1, 2) and band = 'facil') or (level = 3 and band = 'media') or (level in (4, 5) and band = 'dificil')),
  constraint question_difficulty_agents_method_medida_check check (
    method <> 'medida' or (n_respondents is not null and p_low is null and p_high is null)),
  constraint question_difficulty_agents_method_estimada_check check (
    method <> 'estimada' or (n_respondents is null and irt_b is null and point_biserial is null
                             and p_low is not null and p_high is not null and p_low <= p and p <= p_high)),
  constraint question_difficulty_agents_irt_pair_check check ((irt_b is null) = (irt_model is null))
);
comment on table public.question_difficulty_agents is
  'Dificuldade na escala do Inep (índice de facilidade p; faixas do Enade, Relatório Síntese de Área 1.5.1). medida = microdados do Inep; estimada = rubrica médica calibrada contra as medidas. Não é validação humana.';
create index if not exists question_difficulty_agents_level_idx on public.question_difficulty_agents (level);
create index if not exists question_difficulty_agents_method_idx on public.question_difficulty_agents (method);
alter table public.question_difficulty_agents enable row level security;
revoke all on table public.question_difficulty_agents from public, anon, authenticated;
grant select on table public.question_difficulty_agents to authenticated;
drop policy if exists "dificuldade por agentes: só a equipe lê" on public.question_difficulty_agents;
create policy "dificuldade por agentes: só a equipe lê" on public.question_difficulty_agents
  for select to authenticated using ((select public.is_staff()));

-- Dificuldade a usar para uma questão e de onde ela vem, na ordem de confiança:
--   1 validada_equipe  >  2 medida_inep  >  3 estimada_rubrica. Interna (servidor/outras funções).
create or replace function public.question_difficulty_effective(p_question_id text)
  returns table (level smallint, band text, source text, source_order smallint, p numeric, method text)
  language sql stable security definer set search_path = ''
as $$
  select r.level,
         case when r.level in (1, 2) then 'facil' when r.level = 3 then 'media' else 'dificil' end,
         'validada_equipe'::text, 1::smallint, null::numeric, null::text
  from public.question_difficulty_review r where r.question_id = p_question_id
  union all
  select a.level, a.band,
         case a.method when 'medida' then 'medida_inep' else 'estimada_rubrica' end,
         case a.method when 'medida' then 2::smallint else 3::smallint end,
         a.p, a.method
  from public.question_difficulty_agents a
  where a.question_id = p_question_id
    and not exists (select 1 from public.question_difficulty_review r where r.question_id = p_question_id)
$$;
revoke execute on function public.question_difficulty_effective(text) from public, anon, authenticated;

-- Resumo para a equipe: por área, faixa do Inep e origem (validada / medida / estimada / sem dificuldade).
create or replace function public.app_admin_difficulty_agents_summary() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return (
    with base as (
      select q.id, q.area::text as area,
             case when r.level is not null then 'validada_equipe'
                  when a.method = 'medida' then 'medida_inep'
                  when a.method = 'estimada' then 'estimada_rubrica'
                  else 'sem_dificuldade' end as source,
             coalesce((array['muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil'])[r.level], a.inep_band) as inep_band
      from public.questions q
      left join public.question_difficulty_review r on r.question_id = q.id
      left join public.question_difficulty_agents a on a.question_id = q.id
      where q.status = 'valid'
    )
    select jsonb_build_object(
      'total', (select count(*)::int from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('area', area, 'inep_band', inep_band, 'source', source, 'n', n)
                                         order by area, source, inep_band)
                        from (select area, inep_band, source, count(*)::int as n from base group by area, inep_band, source) s), '[]'::jsonb)
    )
  );
end
$$;
revoke execute on function public.app_admin_difficulty_agents_summary() from public, anon;
grant execute on function public.app_admin_difficulty_agents_summary() to authenticated;
