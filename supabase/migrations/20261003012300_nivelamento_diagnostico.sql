-- =============================================================================
-- Diagnóstico de nivelamento (primeira tela do aluno novo)
--
-- O que faz:
-- - Cria tabelas para gravar o diagnóstico inicial e a proficiência por área.
-- - Funções internas para buscar as questões, sortear e calcular a proficiência.
-- - Funções `app_*` que formam o contrato com o front-end (DESENHO.md).
-- - Atualiza `app_today` para usar o resultado do diagnóstico no plano.
--
-- O que NÃO faz:
-- - Não grava em question_attempts (separado de XP/Coins/Arena).
-- - Não aplica a distribuição de dificuldade ao plano (só calcula e guarda).
--
-- Como desfazer: supabase/desfazer/20261003012300_nivelamento_diagnostico.desfazer.sql
-- Como conferir (só lê, responde OK/FALTA): supabase/conferir/nivelamento-diagnostico.sql
-- =============================================================================

create table if not exists public.nivelamento_config (
  id boolean primary key default true check (id),
  primeira_tela boolean not null default true,
  convite_inicio boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.nivelamento_config enable row level security;
revoke all on public.nivelamento_config from anon, authenticated;
insert into public.nivelamento_config (id) values (true) on conflict do nothing;

create table if not exists public.nivelamento_diagnosticos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  situacao text not null default 'novo' check (situacao in ('novo','adiado','bloco1','parcial','bloco2','concluido')),
  adiado_em timestamptz,
  iniciado_em timestamptz,
  bloco1_concluido_em timestamptz,
  concluido_em timestamptz,
  resultado jsonb,
  resultado_parcial jsonb,
  versao text not null default 'sdp-1',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.nivelamento_diagnosticos enable row level security;
revoke all on public.nivelamento_diagnosticos from anon, authenticated;
grant select on public.nivelamento_diagnosticos to authenticated;
drop policy if exists select_staff on public.nivelamento_diagnosticos;
create policy select_staff on public.nivelamento_diagnosticos for select to authenticated using (public.is_staff());

create table if not exists public.nivelamento_itens (
  diagnostico_id uuid references public.nivelamento_diagnosticos(id) on delete cascade,
  ordem smallint check (ordem between 1 and 30),
  bloco smallint check (bloco in (1,2)),
  question_id text not null references public.questions (id) on delete cascade,
  area public.med_area not null,
  faixa_planejada text check (faixa_planejada in ('facil','media','dificil')),
  faixa text check (faixa in ('facil','media','dificil')),
  fonte_dificuldade text check (fonte_dificuldade in ('validada_equipe','tri_calibrada','revisao_medica','estimativa_automatica')),
  grupo text not null,
  resposta char(1) check (resposta in ('A','B','C','D')),
  correta boolean,
  respondida_em timestamptz,
  primary key (diagnostico_id, ordem),
  unique (diagnostico_id, question_id),
  unique (diagnostico_id, grupo),
  check ((resposta is null) = (respondida_em is null))
);

alter table public.nivelamento_itens enable row level security;
revoke all on public.nivelamento_itens from anon, authenticated;
grant select on public.nivelamento_itens to authenticated;
drop policy if exists select_staff on public.nivelamento_itens;
create policy select_staff on public.nivelamento_itens for select to authenticated using (public.is_staff());

create table if not exists public.nivelamento_proficiencia (
  user_id uuid references auth.users (id) on delete cascade,
  area public.med_area,
  acertos int,
  total int check (total >= acertos and total >= 0),
  proficiencia numeric(4,1),
  prioridade numeric(4,1),
  variancia double precision,
  fonte text not null default 'diagnostico',
  atualizado_em timestamptz default now(),
  primary key (user_id, area)
);

alter table public.nivelamento_proficiencia enable row level security;
revoke all on public.nivelamento_proficiencia from anon, authenticated;
grant select on public.nivelamento_proficiencia to authenticated;
drop policy if exists select_own on public.nivelamento_proficiencia;
create policy select_own on public.nivelamento_proficiencia for select to authenticated
using (user_id = (select auth.uid()) or public.is_staff());

-- =============================================================================
-- Funções Internas
-- =============================================================================

create or replace function public.nivelamento_area_ordem(p_area public.med_area) returns smallint
  language sql immutable set search_path = ''
as $$
  select case p_area
    when 'CLINICA_MEDICA' then 1
    when 'CIRURGIA_GERAL' then 2
    when 'PEDIATRIA' then 3
    when 'GINECOLOGIA_OBSTETRICIA' then 4
    when 'MEDICINA_FAMILIA_COMUNIDADE' then 5
  end::smallint
$$;
revoke execute on function public.nivelamento_area_ordem from public, anon, authenticated;

create or replace function public.nivelamento_area_nome(p_area public.med_area) returns text
  language sql immutable set search_path = ''
as $$
  select case p_area
    when 'CLINICA_MEDICA' then 'Clínica Médica'
    when 'CIRURGIA_GERAL' then 'Cirurgia'
    when 'PEDIATRIA' then 'Pediatria'
    when 'GINECOLOGIA_OBSTETRICIA' then 'Ginecologia e Obstetrícia'
    when 'MEDICINA_FAMILIA_COMUNIDADE' then 'Medicina de Família e Comunidade'
  end
$$;
revoke execute on function public.nivelamento_area_nome from public, anon, authenticated;

create or replace function public.nivelamento_classificar(score numeric) returns jsonb
  language plpgsql immutable set search_path = ''
as $$
begin
  if score < 40 then
    return jsonb_build_object('nivel', 1, 'nome', 'Fundamentos', 'foco', 'Reconstruir conceitos fundamentais');
  elsif score < 55 then
    return jsonb_build_object('nivel', 2, 'nome', 'Em desenvolvimento', 'foco', 'Consolidar conhecimentos essenciais');
  elsif score < 70 then
    return jsonb_build_object('nivel', 3, 'nome', 'Intermediário', 'foco', 'Fortalecer raciocínio clínico e tomada de decisão');
  elsif score < 85 then
    return jsonb_build_object('nivel', 4, 'nome', 'Avançado', 'foco', 'Aprimorar casos complexos e questões difíceis');
  else
    return jsonb_build_object('nivel', 5, 'nome', 'Domínio elevado', 'foco', 'Refinar pontos específicos e manter desempenho');
  end if;
end
$$;
revoke execute on function public.nivelamento_classificar from public, anon, authenticated;

create or replace function public.nivelamento_distribuicao(p_proficiencia numeric) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case
    when p_proficiencia < 45 then jsonb_build_object('facil', 60, 'media', 30, 'dificil', 10)
    when p_proficiencia < 70 then jsonb_build_object('facil', 20, 'media', 60, 'dificil', 20)
    else jsonb_build_object('facil', 10, 'media', 40, 'dificil', 50)
  end
$$;
revoke execute on function public.nivelamento_distribuicao from public, anon, authenticated;

create or replace function public.nivelamento_calcular(p_contagens jsonb) returns jsonb
  language plpgsql immutable set search_path = ''
as $$
declare
  v_base jsonb;
  v_score numeric;
  v_desvio double precision;
  v_var_soma double precision := 0;
  v_limite_inf numeric;
  v_limite_sup numeric;
  v_instavel boolean := false;
  v_f integer;
  v_n jsonb;
  v_total int := 0;
  v_acertos int := 0;
  v_perfil jsonb := '[]'::jsonb;
  v_prioridades jsonb := '[]'::jsonb;
  v_insuficiente boolean := false;
  v_area public.med_area;
  v_area_str text;
  v_c jsonb;
  v_a int;
  v_t int;
  v_alpha int;
  v_beta int;
  v_prob numeric;
  v_var double precision;
  v_prof numeric(4,1);
  v_prio numeric(4,1);
  v_bruto numeric(4,1);
  v_i int;
  v_soma_prob numeric := 0;
  v_inf_bruto numeric;
  v_sup_bruto numeric;
begin
  for v_i in 1..5 loop
    v_area := (array['CLINICA_MEDICA','CIRURGIA_GERAL','PEDIATRIA','GINECOLOGIA_OBSTETRICIA','MEDICINA_FAMILIA_COMUNIDADE']::public.med_area[])[v_i];
    v_area_str := v_area::text;
    
    v_c := null;
    if p_contagens is not null then
      for v_f in 0 .. jsonb_array_length(p_contagens) - 1 loop
        if (p_contagens -> v_f ->> 'area') = v_area_str then
          v_c := p_contagens -> v_f;
          exit;
        end if;
      end loop;
    end if;
    
    if v_c is not null then
      v_a := (v_c ->> 'acertos')::int;
      v_t := (v_c ->> 'total')::int;
      if v_t is null or v_a is null or v_t < 0 or v_a < 0 or v_a > v_t then
        raise exception 'Contagem inválida' using errcode = '22023';
      end if;
    else
      v_a := 0;
      v_t := 0;
    end if;

    if v_t < 3 then
      v_insuficiente := true;
    end if;

    v_alpha := v_a + 1;
    v_beta := v_t - v_a + 1;
    v_prob := v_alpha::numeric / (v_alpha + v_beta);
    v_var := (v_alpha::numeric * v_beta) / ((v_alpha + v_beta) ^ 2 * (v_alpha + v_beta + 1));
    v_prof := round(100 * v_prob, 1);
    v_prio := round(100 * (1 - v_prob), 1);
    
    v_perfil := v_perfil || jsonb_build_object(
      'area', v_area_str,
      'nome', public.nivelamento_area_nome(v_area),
      'acertos', v_a,
      'total', v_t,
      'proficiencia', v_prof,
      'prioridade', v_prio,
      'variancia', round(v_var::numeric, 6)
    );
    
    v_acertos := v_acertos + v_a;
    v_total := v_total + v_t;
    v_var_soma := v_var_soma + v_var;
    v_soma_prob := v_soma_prob + v_prob;
  end loop;

  if p_contagens is not null then
    for v_f in 0 .. jsonb_array_length(p_contagens) - 1 loop
      if (p_contagens -> v_f ->> 'area') not in ('CLINICA_MEDICA','CIRURGIA_GERAL','PEDIATRIA','GINECOLOGIA_OBSTETRICIA','MEDICINA_FAMILIA_COMUNIDADE') then
        raise exception 'Área desconhecida' using errcode = '22023';
      end if;
    end loop;
  end if;

  if v_total > 0 then
    v_bruto := round(100.0 * v_acertos / v_total, 1);
  else
    v_bruto := null;
  end if;

  select jsonb_agg(q.area) into v_prioridades
  from (
    select (p->>'area') as area
    from jsonb_array_elements(v_perfil) p
    order by (p->>'prioridade')::numeric desc, public.nivelamento_area_ordem((p->>'area')::public.med_area)
  ) q;

  v_base := jsonb_build_object(
    'versao', 'sdp-1',
    'acertos', v_acertos,
    'total', v_total,
    'percentual_bruto', v_bruto,
    'perfil', v_perfil,
    'prioridades', coalesce(v_prioridades, '[]'::jsonb)
  );

  if v_insuficiente then
    return v_base || jsonb_build_object(
      'status', 'DADOS_INSUFICIENTES',
      'score', null,
      'nivel', null,
      'nivel_nome', null,
      'nivel_foco', null,
      'faixa_indicativa', null
    );
  end if;

  -- PG pela média das proficiências SEM arredondar (como o calculo.js); só a saída é arredondada
  v_score := 100 * v_soma_prob / 5;
  v_desvio := sqrt(v_var_soma / 25.0) * 100.0;
  v_inf_bruto := greatest(0, v_score - 1.645 * v_desvio::numeric);
  v_sup_bruto := least(100, v_score + 1.645 * v_desvio::numeric);
  v_limite_inf := round(v_inf_bruto, 1);
  v_limite_sup := round(v_sup_bruto, 1);

  v_instavel := (v_inf_bruto < 40 and v_sup_bruto >= 40) or
                (v_inf_bruto < 55 and v_sup_bruto >= 55) or
                (v_inf_bruto < 70 and v_sup_bruto >= 70) or
                (v_inf_bruto < 85 and v_sup_bruto >= 85);

  v_n := public.nivelamento_classificar(v_score);
  
  return v_base || jsonb_build_object(
    'status', case when v_total < 30 or v_instavel then 'PROVISORIO' else 'ESTIMATIVA_INICIAL' end,
    'score', round(v_score, 1),
    'nivel', v_n -> 'nivel',
    'nivel_nome', v_n -> 'nome',
    'nivel_foco', v_n -> 'foco',
    'faixa_indicativa', jsonb_build_array(v_limite_inf, v_limite_sup)
  );
end
$$;
revoke execute on function public.nivelamento_calcular from public, anon, authenticated;

create or replace function public.nivelamento_questao_view(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'number', q.number,
    'area', q.area,
    'exam', coalesce((select jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester, 'title', e.title)
                      from public.exams e where e.id = q.exam_id), null),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id')
                from jsonb_array_elements(q.options) o),
    'images', q.images,
    'origin', q.origin,
    'support', q.support,
    'preliminary', public.question_preliminary_info(q.id)
  )
  from public.questions q
  where q.id = p_question_id
$$;
revoke execute on function public.nivelamento_questao_view from public, anon, authenticated;

create or replace function public.nivelamento_candidatas(p_user uuid, p_area public.med_area default null)
returns table (
  question_id text,
  area public.med_area,
  topic text,
  competencia text,
  faixa text,
  fonte text,
  ordem_fonte smallint,
  grupo text
)
language sql stable security definer set search_path = ''
as $$
  with valid_questions as (
    select q.id, q.area, q.topic, q.origin, q.needs_image, q.images
    from public.questions q
    where q.status = 'valid' and q.correct_option is not null
      and (p_area is null or q.area = p_area)
      and not (q.needs_image = true and jsonb_array_length(coalesce(q.images, '[]'::jsonb)) = 0)
      and (q.origin = 'official' or (q.origin = 'staziamed' and q.retired_at is null and q.id in (select public.ineditas_released_ids_for(p_user))))
      and public.question_preliminary_info(q.id) is null
  ),
  filtered as (
    select v.*,
           dna.review_required, dna.competency,
           (select qe.group_id from public.question_equivalents qe where qe.question_id = v.id limit 1) as eq_group,
           (select r.level from public.question_difficulty_review r where r.question_id = v.id limit 1) as validada,
           (select i.b from public.irt_item_params i where i.question_id = v.id and i.estado = 'calibrada' limit 1) as tri,
           (select a.difficulty from public.question_analysis a where a.question_id = v.id and a.is_current = true and a.status in ('reviewed','published') limit 1) as revisao,
           dna.difficulty_estimate
    from valid_questions v
    left join public.question_dna dna on dna.question_id = v.id
    where coalesce(dna.review_required, false) = false
      and not exists (
        select 1 from public.question_update_cards c
        where c.question_id = v.id and c.status = 'published' and c.temporal_status <> 'UPDATED_BUT_SAME_ANSWER'
      )
      and not exists (
        select 1 from public.question_analysis a
        where a.question_id = v.id and a.is_current = true and a.status <> 'rejected'
          and a.temporal_status in ('PARTIALLY_OUTDATED','OUTDATED_EXPLANATION','OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT','NO_CURRENT_VALID_OPTION','CURRENTLY_AMBIGUOUS','MAJOR_GUIDELINE_CHANGE')
      )
      and not exists (
        select 1 from public.question_updates u
        where u.question_id = v.id and u.status in ('queued','analyzing','review_required')
          and u.impact_level in ('CURRENT_ANSWER_CHANGED','NO_VALID_ALTERNATIVE','MAJOR_CHANGE')
      )
  ),
  with_dif as (
    select f.*,
      coalesce(f.eq_group, f.id) as calc_group,
      case
        when f.validada is not null then
          case when f.validada in (1,2) then 'facil' when f.validada = 3 then 'media' else 'dificil' end
        when f.tri is not null then
          case when f.tri <= -0.5 then 'facil' when f.tri < 0.5 then 'media' else 'dificil' end
        when f.revisao is not null then
          case when f.revisao in (1,2) then 'facil' when f.revisao = 3 then 'media' else 'dificil' end
        when f.difficulty_estimate is not null then
          case when f.difficulty_estimate = 'LOW' then 'facil' when f.difficulty_estimate = 'MODERATE' then 'media' when f.difficulty_estimate = 'HIGH' then 'dificil' end
      end as calc_faixa,
      case
        when f.validada is not null then 'validada_equipe'
        when f.tri is not null then 'tri_calibrada'
        when f.revisao is not null then 'revisao_medica'
        when f.difficulty_estimate is not null then 'estimativa_automatica'
      end as calc_fonte,
      case
        when f.validada is not null then 1
        when f.tri is not null then 2
        when f.revisao is not null then 3
        when f.difficulty_estimate is not null then 4
      end::smallint as calc_ordem
    from filtered f
    where not exists (
      select 1 from public.question_attempts a where a.user_id = p_user and a.question_id = f.id
    )
    and not exists (
      select 1 from public.question_attempts a 
      join public.question_equivalents qe on qe.question_id = a.question_id
      where a.user_id = p_user and qe.group_id = f.eq_group
    )
  )
  select w.id as question_id, w.area, w.topic, w.competency as competencia, w.calc_faixa as faixa, w.calc_fonte as fonte, w.calc_ordem as ordem_fonte, w.calc_group as grupo
  from with_dif w
  where w.calc_faixa is not null
$$;
revoke execute on function public.nivelamento_candidatas from public, anon, authenticated;

create or replace function public.nivelamento_sortear_bloco(p_diag uuid, p_user uuid, p_bloco smallint) returns integer
  language plpgsql security definer set search_path = ''
as $$
-- Escolhe 15 questões (3 por área: uma por faixa planejada) e grava de uma vez, embaralhadas de forma estável por aluno.
-- Ordem de escolha: faixa pedida (ou a mais próxima), fonte de dificuldade mais confiável, tema ainda não usado, competência ainda
-- não usada na área e, por fim, md5(aluno:questão). Nunca repete questão nem grupo de equivalência do diagnóstico.
declare
  v_area public.med_area;
  v_faixa text;
  v_cand record;
  v_ids text[];
  v_grupos text[];
  v_topicos text[];
  v_comp text[];
  v_q text[] := '{}';
  v_a public.med_area[] := '{}';
  v_fp text[] := '{}';
  v_f text[] := '{}';
  v_fonte text[] := '{}';
  v_g text[] := '{}';
  v_n int;
begin
  select coalesce(array_agg(ni.question_id), '{}'), coalesce(array_agg(ni.grupo), '{}'),
         coalesce(array_agg(q.topic) filter (where q.topic is not null), '{}'),
         coalesce(array_agg(ni.area::text || '|' || d.competency) filter (where d.competency is not null), '{}')
    into v_ids, v_grupos, v_topicos, v_comp
  from public.nivelamento_itens ni
  join public.questions q on q.id = ni.question_id
  left join public.question_dna d on d.question_id = ni.question_id
  where ni.diagnostico_id = p_diag;

  foreach v_area in array array['CLINICA_MEDICA','CIRURGIA_GERAL','PEDIATRIA','GINECOLOGIA_OBSTETRICIA','MEDICINA_FAMILIA_COMUNIDADE']::public.med_area[] loop
    v_n := 0;
    foreach v_faixa in array array['facil','media','dificil'] loop
      v_cand := null;
      select c.* into v_cand
      from public.nivelamento_candidatas(p_user, v_area) c
      where c.question_id <> all (v_ids) and c.grupo <> all (v_grupos)
      order by
        case
          when c.faixa = v_faixa then 0
          when v_faixa = 'media' then 1
          when c.faixa = 'media' then 1
          else 2
        end,
        c.ordem_fonte,
        (c.topic is not null and c.topic = any (v_topicos)),
        (c.competencia is not null and (v_area::text || '|' || c.competencia) = any (v_comp)),
        md5(p_user::text || ':' || c.question_id)
      limit 1;
      continue when v_cand.question_id is null;
      v_n := v_n + 1;
      v_ids := v_ids || v_cand.question_id;
      v_grupos := v_grupos || v_cand.grupo;
      if v_cand.topic is not null then v_topicos := v_topicos || v_cand.topic; end if;
      if v_cand.competencia is not null then v_comp := v_comp || (v_area::text || '|' || v_cand.competencia); end if;
      v_q := v_q || v_cand.question_id;
      v_a := v_a || v_cand.area;
      v_fp := v_fp || v_faixa;
      v_f := v_f || v_cand.faixa;
      v_fonte := v_fonte || v_cand.fonte;
      v_g := v_g || v_cand.grupo;
    end loop;
    if v_n < 3 then
      raise exception 'Ainda não há questões válidas suficientes para montar o diagnóstico. Avise a equipe.' using errcode = 'P0002';
    end if;
  end loop;

  insert into public.nivelamento_itens (diagnostico_id, ordem, bloco, question_id, area, faixa_planejada, faixa, fonte_dificuldade, grupo)
  select p_diag,
         ((p_bloco - 1) * 15 + row_number() over (order by md5(p_user::text || ':' || p_bloco::text || ':' || x.q)))::smallint,
         p_bloco, x.q, x.a, x.fp, x.f, x.fonte, x.g
  from unnest(v_q, v_a, v_fp, v_f, v_fonte, v_g) as x (q, a, fp, f, fonte, g);
  return cardinality(v_q);
end
$$;
revoke execute on function public.nivelamento_sortear_bloco from public, anon, authenticated;

create or replace function public.nivelamento_estado_de(p_uid uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
-- O formato de app_nivelamento_estado (DESENHO.md). A faixa indicativa nunca sai para o aluno.
declare
  d public.nivelamento_diagnosticos;
  c public.nivelamento_config;
  v_aplicavel boolean;
  v_sit text;
  v_bloco smallint;
  v_resp int := 0;
  v_primeira boolean;
begin
  select * into d from public.nivelamento_diagnosticos where user_id = p_uid;
  select * into c from public.nivelamento_config limit 1;
  v_aplicavel := coalesce(public.current_app_role() = 'student', false)
    and not exists (select 1 from public.ch_reviewer_areas r where r.user_id = p_uid);
  v_sit := coalesce(d.situacao, 'novo');
  v_bloco := case v_sit when 'bloco1' then 1 when 'bloco2' then 2 end;
  if v_bloco is not null then
    select count(*)::int into v_resp from public.nivelamento_itens ni
    where ni.diagnostico_id = d.id and ni.bloco = v_bloco and ni.resposta is not null;
  end if;
  -- primeira tela: aluno novo (sem decisão e sem nenhuma resposta no app) ou que começou as 15 e ainda não adiou
  v_primeira := v_aplicavel and coalesce(c.primeira_tela, true) and d.adiado_em is null
    and ((v_sit = 'novo' and not exists (select 1 from public.question_attempts a where a.user_id = p_uid)) or v_sit = 'bloco1');
  return jsonb_build_object(
    'aplicavel', v_aplicavel,
    'primeira_tela', v_primeira,
    'convite', v_aplicavel and coalesce(c.convite_inicio, true) and v_sit <> 'concluido' and not v_primeira,
    'situacao', v_sit,
    'adiado', d.adiado_em is not null,
    'bloco', v_bloco,
    'respondidas', v_resp,
    'total_bloco', 15,
    'questoes_feitas', case when d.concluido_em is not null then 30 when d.bloco1_concluido_em is not null then 15 else 0 end,
    'resultado', d.resultado - 'faixa_indicativa'
  );
end
$$;
revoke execute on function public.nivelamento_estado_de from public, anon, authenticated;

-- =============================================================================
-- Funções do App (Aluno)
-- =============================================================================

create or replace function public.app_nivelamento_estado() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.nivelamento_estado_de((select auth.uid()));
$$;
revoke execute on function public.app_nivelamento_estado from public, anon;
grant execute on function public.app_nivelamento_estado to authenticated;

create or replace function public.app_nivelamento_prioridades() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with res as (
    select resultado from public.nivelamento_diagnosticos where user_id = (select auth.uid()) and situacao in ('parcial','bloco2','concluido')
  )
  select case 
    when not exists (select 1 from res) or ((select resultado from res) ->> 'status') = 'DADOS_INSUFICIENTES' then null
    else (
      with base as (
        select np.area, np.acertos as a_diag, np.total as q_diag
        from public.nivelamento_proficiencia np
        where np.user_id = (select auth.uid())
      ),
      first_attempts as (
        -- a PRIMEIRA resposta de cada questão (repetir a mesma questão não conta de novo); fora as do diagnóstico e as anuladas
        select q.area, count(*) filter (where f.is_correct)::int as a_train, count(*)::int as q_train
        from (
          select distinct on (a.question_id) a.question_id, a.is_correct
          from public.question_attempts a
          where a.user_id = (select auth.uid())
          order by a.question_id, a.answered_at, a.id
        ) f
        join public.questions q on q.id = f.question_id
        where f.is_correct is not null and q.status <> 'annulled'
          and not exists (
            select 1 from public.nivelamento_diagnosticos d
            join public.nivelamento_itens ni on ni.diagnostico_id = d.id
            where d.user_id = (select auth.uid()) and ni.question_id = q.id
          )
        group by q.area
      ),
      combined as (
        select b.area,
               b.a_diag + coalesce(fa.a_train, 0) as acertos,
               b.q_diag + coalesce(fa.q_train, 0) as total
        from base b
        left join first_attempts fa on fa.area = b.area
      ),
      calc as (
        select c.area, public.nivelamento_area_nome(c.area) as nome,
               c.acertos, c.total,
               round(100.0 * (c.acertos + 1) / (c.total + 2), 1) as proficiencia,
               100.0 - round(100.0 * (c.acertos + 1) / (c.total + 2), 1) as prioridade
        from combined c
      )
      select jsonb_agg(
        jsonb_build_object(
          'area', c.area, 'nome', c.nome, 'acertos', c.acertos, 'total', c.total,
          'proficiencia', c.proficiencia, 'prioridade', c.prioridade,
          'dificuldade', public.nivelamento_distribuicao(c.proficiencia)
        ) order by c.prioridade desc, public.nivelamento_area_ordem(c.area)
      )
      from calc c
    )
  end;
$$;
revoke execute on function public.app_nivelamento_prioridades from public, anon;
grant execute on function public.app_nivelamento_prioridades to authenticated;

create or replace function public.app_nivelamento_sessao() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diag public.nivelamento_diagnosticos;
  v_itens jsonb;
  v_bloco smallint;
begin
  select * into v_diag from public.nivelamento_diagnosticos d where d.user_id = v_uid;
  if v_diag is null or v_diag.situacao not in ('bloco1','bloco2') then
    return jsonb_build_object('situacao', coalesce(v_diag.situacao, 'novo'), 'bloco', null, 'total', 0, 'respondidas', 0, 'itens', '[]'::jsonb);
  end if;
  v_bloco := case when v_diag.situacao = 'bloco1' then 1 else 2 end;
  
  select jsonb_agg(
    jsonb_build_object(
      'ordem', ni.ordem,
      'posicao', (ni.ordem - 1) % 15 + 1,
      'resposta', ni.resposta,
      'questao', public.nivelamento_questao_view(ni.question_id)
    ) order by ni.ordem
  ) into v_itens
  from public.nivelamento_itens ni
  where ni.diagnostico_id = v_diag.id and ni.bloco = v_bloco;

  return jsonb_build_object(
    'situacao', v_diag.situacao,
    'bloco', v_bloco,
    'total', 15,
    'respondidas', (select count(*)::int from public.nivelamento_itens ni where ni.diagnostico_id = v_diag.id and ni.bloco = v_bloco and ni.resposta is not null),
    'itens', coalesce(v_itens, '[]'::jsonb)
  );
end
$$;
revoke execute on function public.app_nivelamento_sessao from public, anon;
grant execute on function public.app_nivelamento_sessao to authenticated;

create or replace function public.app_nivelamento_iniciar() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diag_id uuid;
  v_sit text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  insert into public.nivelamento_diagnosticos (user_id) values (v_uid) on conflict do nothing;
  
  select id, situacao into v_diag_id, v_sit from public.nivelamento_diagnosticos where user_id = v_uid for update;
  if v_sit = 'concluido' then
    raise exception 'Você já concluiu o diagnóstico de nivelamento.' using errcode = '55000';
  end if;
  if v_sit = 'parcial' then
    raise exception 'Você já fez as 15 primeiras questões do diagnóstico. Para seguir, escolha continuar até 30.' using errcode = '55000';
  end if;

  if v_sit in ('novo','adiado') then
    perform public.nivelamento_sortear_bloco(v_diag_id, v_uid, 1::smallint);
    update public.nivelamento_diagnosticos set situacao = 'bloco1', iniciado_em = coalesce(iniciado_em, now()), atualizado_em = now() where id = v_diag_id;
  end if;

  return public.app_nivelamento_sessao();
end
$$;
revoke execute on function public.app_nivelamento_iniciar from public, anon;
grant execute on function public.app_nivelamento_iniciar to authenticated;

create or replace function public.app_nivelamento_continuar() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diag_id uuid;
  v_sit text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select id, situacao into v_diag_id, v_sit from public.nivelamento_diagnosticos where user_id = v_uid for update;
  if v_sit not in ('parcial','bloco2') then
    raise exception 'Só dá para continuar até 30 depois de terminar as 15 primeiras questões.' using errcode = '55000';
  end if;

  if v_sit = 'parcial' then
    perform public.nivelamento_sortear_bloco(v_diag_id, v_uid, 2::smallint);
    update public.nivelamento_diagnosticos set situacao = 'bloco2', atualizado_em = now() where id = v_diag_id;
  end if;

  return public.app_nivelamento_sessao();
end
$$;
revoke execute on function public.app_nivelamento_continuar from public, anon;
grant execute on function public.app_nivelamento_continuar to authenticated;

create or replace function public.app_nivelamento_responder(p_ordem integer, p_resposta text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diag_id uuid;
  v_sit text;
  v_bloco smallint;
  v_item public.nivelamento_itens;
  v_gab text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  p_resposta := upper(btrim(coalesce(p_resposta, '')));
  if p_resposta not in ('A','B','C','D') then
    raise exception 'Resposta inválida: escolha A, B, C ou D.' using errcode = '22023';
  end if;

  select id, situacao into v_diag_id, v_sit from public.nivelamento_diagnosticos where user_id = v_uid for update;
  if v_sit not in ('bloco1','bloco2') then
    raise exception 'Não há diagnóstico em andamento.' using errcode = '55000';
  end if;

  v_bloco := case when v_sit = 'bloco1' then 1 else 2 end;
  
  select * into v_item from public.nivelamento_itens where diagnostico_id = v_diag_id and ordem = p_ordem and bloco = v_bloco;
  if not found then
    raise exception 'Esta questão não faz parte do diagnóstico em andamento.' using errcode = 'P0002';
  end if;

  select correct_option into v_gab from public.questions where id = v_item.question_id;

  update public.nivelamento_itens 
  set resposta = p_resposta, respondida_em = now(), correta = (p_resposta = v_gab)
  where diagnostico_id = v_diag_id and ordem = p_ordem;

  return jsonb_build_object(
    'ordem', p_ordem,
    'resposta', p_resposta,
    'respondidas', (select count(*)::int from public.nivelamento_itens where diagnostico_id = v_diag_id and bloco = v_bloco and resposta is not null),
    'total', 15
  );
end
$$;
revoke execute on function public.app_nivelamento_responder from public, anon;
grant execute on function public.app_nivelamento_responder to authenticated;

create or replace function public.app_nivelamento_finalizar() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diag_id uuid;
  v_sit text;
  v_bloco smallint;
  v_falta int;
  v_contagens jsonb;
  v_res jsonb;
  v_prof record;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select id, situacao into v_diag_id, v_sit from public.nivelamento_diagnosticos where user_id = v_uid for update;
  if v_sit not in ('bloco1','bloco2') then
    raise exception 'Não há diagnóstico em andamento.' using errcode = '55000';
  end if;
  v_bloco := case when v_sit = 'bloco1' then 1 else 2 end;

  select count(*)::int into v_falta from public.nivelamento_itens where diagnostico_id = v_diag_id and bloco = v_bloco and resposta is null;
  if v_falta > 0 then
    raise exception 'Responda todas as questões do bloco antes de finalizar (faltam %).', v_falta using errcode = '55000';
  end if;

  select jsonb_agg(jsonb_build_object('area', x.area, 'acertos', x.acertos, 'total', x.total)) into v_contagens
  from (
    select area, count(*) filter (where correta) as acertos, count(*) as total
    from public.nivelamento_itens
    where diagnostico_id = v_diag_id and resposta is not null
    group by area
  ) x;

  v_res := public.nivelamento_calcular(v_contagens);
  v_res := v_res || jsonb_build_object('bloco', v_bloco, 'calculado_em', now());

  update public.nivelamento_diagnosticos 
  set situacao = case when v_bloco = 1 then 'parcial' else 'concluido' end,
      resultado_parcial = case when v_bloco = 1 then v_res else resultado_parcial end,
      resultado = v_res,
      bloco1_concluido_em = coalesce(bloco1_concluido_em, case when v_bloco = 1 then now() else null end),
      concluido_em = coalesce(concluido_em, case when v_bloco = 2 then now() else null end),
      atualizado_em = now()
  where id = v_diag_id;

  if (v_res->>'status') <> 'DADOS_INSUFICIENTES' then
    for v_prof in select * from jsonb_array_elements(v_res->'perfil') loop
      insert into public.nivelamento_proficiencia (user_id, area, acertos, total, proficiencia, prioridade, variancia, fonte)
      values (v_uid, (v_prof.value->>'area')::public.med_area, (v_prof.value->>'acertos')::int, (v_prof.value->>'total')::int, (v_prof.value->>'proficiencia')::numeric, (v_prof.value->>'prioridade')::numeric, (v_prof.value->>'variancia')::float, 'diagnostico')
      on conflict (user_id, area) do update
      set acertos = excluded.acertos, total = excluded.total, proficiencia = excluded.proficiencia, prioridade = excluded.prioridade, variancia = excluded.variancia, atualizado_em = now();
    end loop;
  end if;

  return public.nivelamento_estado_de(v_uid);
end
$$;
revoke execute on function public.app_nivelamento_finalizar from public, anon;
grant execute on function public.app_nivelamento_finalizar to authenticated;

create or replace function public.app_nivelamento_adiar() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diag_id uuid;
  v_sit text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  insert into public.nivelamento_diagnosticos (user_id, situacao) values (v_uid, 'adiado') on conflict do nothing;
  
  select id, situacao into v_diag_id, v_sit from public.nivelamento_diagnosticos where user_id = v_uid for update;
  if v_sit = 'novo' then
    update public.nivelamento_diagnosticos set situacao = 'adiado', adiado_em = now(), atualizado_em = now() where id = v_diag_id;
  elsif v_sit not in ('concluido') then
    update public.nivelamento_diagnosticos set adiado_em = coalesce(adiado_em, now()), atualizado_em = now() where id = v_diag_id;
  end if;

  return public.nivelamento_estado_de(v_uid);
end
$$;
revoke execute on function public.app_nivelamento_adiar from public, anon;
grant execute on function public.app_nivelamento_adiar to authenticated;

create or replace function public.app_nivelamento_correcao() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with blocos as (
    select d.id, 1 as b from public.nivelamento_diagnosticos d where d.user_id = (select auth.uid()) and d.bloco1_concluido_em is not null
    union
    select d.id, 2 as b from public.nivelamento_diagnosticos d where d.user_id = (select auth.uid()) and d.concluido_em is not null
  )
  select jsonb_build_object(
    'itens', coalesce(jsonb_agg(
      jsonb_build_object(
        'ordem', ni.ordem,
        'bloco', ni.bloco,
        'posicao', (ni.ordem - 1) % 15 + 1,
        'resposta', ni.resposta,
        'correta', ni.correta,
        'gabarito', q.correct_option,
        'comentario', (select nullif(btrim(o ->> 'explanation'), '') from jsonb_array_elements(q.options) o
                       where o ->> 'id' = q.correct_option::text
                         and not ('explanation_' || q.correct_option::text) = any (public.question_hidden_fields(q.explanations_review, q.comment_review))),
        'topic', q.topic,
        'questao', public.nivelamento_questao_view(ni.question_id)
      ) order by ni.ordem
    ), '[]'::jsonb)
  )
  from public.nivelamento_itens ni
  join public.questions q on q.id = ni.question_id
  join blocos on blocos.id = ni.diagnostico_id and blocos.b = ni.bloco
$$;
revoke execute on function public.app_nivelamento_correcao from public, anon;
grant execute on function public.app_nivelamento_correcao to authenticated;

-- =============================================================================
-- Admin / Equipe
-- =============================================================================
create or replace function public.app_admin_nivelamento_cobertura() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
-- Equipe: quantas questões oficiais podem entrar no diagnóstico, por área, faixa e fonte da dificuldade.
declare
  v_res jsonb;
begin
  perform public.assert_staff();
  select coalesce(jsonb_agg(jsonb_build_object('area', x.area, 'faixa', x.faixa, 'fonte', x.fonte, 'total', x.n)
                            order by public.nivelamento_area_ordem(x.area), x.faixa, x.fonte), '[]'::jsonb)
    into v_res
  from (select c.area, c.faixa, c.fonte, count(*)::int as n from public.nivelamento_candidatas(null) c group by 1, 2, 3) x;
  return v_res;
end
$$;
revoke execute on function public.app_admin_nivelamento_cobertura from public, anon, authenticated;
grant execute on function public.app_admin_nivelamento_cobertura to authenticated;


-- =============================================================================
-- Atualização de app_today
-- Base: o corpo publicado (20261003000800_home_api.sql), o MESMO que está em produção (conferido em 16/10/2026 com
-- pg_get_functiondef; nenhuma migração depois da 000800 redefine app_today). A única mudança é o bloco do nivelamento
-- (v_niv): com diagnóstico feito, a tarefa de praticar vai para a área de maior prioridade e a tarefa antiga
-- "Diagnóstico inicial: 10 questões" (reason 'diagnostic'), se ainda não feita, sai do plano de hoje.
-- =============================================================================
create or replace function public.app_today(p_rebuild boolean default false) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_day constant date := public.today_br();
  v_minutes integer;
  v_count integer;
  v_attempts integer;
  v_wrong integer;
  v_area public.med_area;
  v_area_attempts integer;
  v_area_accuracy numeric;
  v_niv jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  -- Nivelamento: com o diagnóstico feito (15 ou 30), a área de maior prioridade PR_a define a tarefa de praticar.
  v_niv := public.app_nivelamento_prioridades();

  if coalesce(p_rebuild, false) then
    delete from public.plan_tasks where user_id = v_uid and day = v_day and done_at is null;
  end if;

  if v_niv is not null then
    delete from public.plan_tasks where user_id = v_uid and day = v_day and done_at is null and kind = 'praticar' and ref ->> 'reason' = 'diagnostic';
  end if;

  if not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'praticar') then
    select p.daily_minutes into v_minutes from public.profiles p where p.id = v_uid;
    v_count := case
      when v_minutes is null then 20
      when v_minutes <= 30 then 10
      when v_minutes <= 60 then 20
      when v_minutes <= 120 then 30
      else 50
    end;
    select count(*)::int into v_attempts from public.question_attempts a where a.user_id = v_uid;

    if v_niv is not null then
      v_area := (v_niv -> 0 ->> 'area')::public.med_area;
      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', format('%s questões de %s', v_count, public.area_label(v_area)),
              jsonb_build_object('count', v_count, 'area', v_area, 'reason', 'nivelamento',
                                 'proficiencia', v_niv -> 0 -> 'proficiencia',
                                 'prioridade', v_niv -> 0 -> 'prioridade',
                                 'dificuldade', v_niv -> 0 -> 'dificuldade'),
              v_count * 2);
    elsif v_attempts < 10 then
      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', 'Diagnóstico inicial: 10 questões nas 5 grandes áreas',
              jsonb_build_object('count', 10, 'reason', 'diagnostic'), 20);
    else
      select x.area, x.attempts, x.accuracy into v_area, v_area_attempts, v_area_accuracy
      from (
        select e.area, coalesce(st.attempts, 0) as attempts, st.accuracy
        from unnest(enum_range(null::public.med_area)) as e (area)
        left join public.my_area_stats st on st.area = e.area
      ) x
      order by (x.attempts < 5) desc, case when x.attempts < 5 then x.attempts end, x.accuracy nulls first, x.area
      limit 1;

      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', format('%s questões de %s', v_count, public.area_label(v_area)),
              jsonb_build_object('count', v_count, 'area', v_area,
                                 'reason', case when v_area_attempts < 5 then 'untrained' else 'lowest_accuracy' end,
                                 'attempts', v_area_attempts, 'accuracy', v_area_accuracy),
              v_count * 2);
    end if;
  end if;

  -- Revisão: enquanto não for concluída, a meta acompanha o caderno de erros
  -- (o que já foi revisto hoje + o que ainda está pendente, até 10 por dia).
  select count(*)::int into v_wrong from public.my_error_notebook e where e.status = 'para_revisar';

  update public.plan_tasks t
    set ref = t.ref || jsonb_build_object('count', n.target),
        title = case when n.target = 1 then 'Rever 1 questão errada' else format('Rever %s questões erradas', n.target) end,
        minutes = n.target * 2
    from (
      select t2.id, least(public.plan_task_progress(t2) + v_wrong, 10) as target
      from public.plan_tasks t2
      where t2.user_id = v_uid and t2.day = v_day and t2.kind = 'revisar' and t2.done_at is null
    ) n
    where t.id = n.id and n.target > 0;

  -- Os erros foram superados por outro caminho: não sobra nada para rever.
  delete from public.plan_tasks t
    where t.user_id = v_uid and t.day = v_day and t.kind = 'revisar' and t.done_at is null
      and v_wrong = 0 and public.plan_task_progress(t) = 0;

  if v_wrong > 0
     and not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'revisar') then
    v_wrong := least(v_wrong, 10);
    insert into public.plan_tasks (day, position, kind, title, ref, minutes)
    values (v_day, 2, 'revisar',
            case when v_wrong = 1 then 'Rever 1 questão errada' else format('Rever %s questões erradas', v_wrong) end,
            jsonb_build_object('count', v_wrong, 'reason', 'errors'), v_wrong * 2);
  end if;

  -- Cumpriu a meta do dia: conclui sozinho (a não ser que o aluno tenha desmarcado à mão).
  update public.plan_tasks t
    set done_at = now()
    where t.user_id = v_uid and t.day = v_day and t.done_at is null and not (t.ref ? 'manual')
      and public.plan_task_progress(t) >= coalesce((t.ref ->> 'count')::integer, 1);

  return (
    select jsonb_build_object(
      'day', v_day,
      'done', count(*) filter (where t.done_at is not null)::int,
      'total', count(*)::int,
      'tasks', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'kind', t.kind, 'title', t.title, 'minutes', t.minutes,
          'done', t.done_at is not null,
          'progress', least(public.plan_task_progress(t), coalesce((t.ref ->> 'count')::integer, 1)),
          'target', coalesce((t.ref ->> 'count')::integer, 1),
          'ref', t.ref - 'manual'
        ) order by t.position, t.created_at), '[]'::jsonb)
    )
    from public.plan_tasks t
    where t.user_id = v_uid and t.day = v_day
  );
end
$$;
