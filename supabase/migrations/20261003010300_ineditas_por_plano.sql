-- =============================================================================
-- Questões Inéditas por plano (pedido do dono, 2026-10-15). SÓ ADITIVA; pode ser colada de novo no Supabase sem estragar nada
-- (create if not exists / create or replace / drop policy if exists). NÃO APLICADA em produção: ensaiada no PGlite e com rollback.
--
-- O que muda para o aluno:
--   * Cada plano libera um NÚMERO de Questões Inéditas (origin = 'staziamed'): o teste grátis começa com 20; Pro e Elite começam com
--     "todas" (valor nulo). O administrador troca esses números em Administração > Planos (função app_admin_save_ineditas_limits).
--   * A tela mostra o TOTAL existente ("20 de 74 liberadas no seu plano") e convida a conhecer os planos; as não liberadas não podem
--     ser sorteadas, lidas, respondidas, nem abertas pela lista de "questões relacionadas".
--   * Conta sem acesso (teste vencido, plano vencido/cancelado, sem assinatura) continua sem receber NENHUMA (limite 0).
--   * Equipe e revisor médico: todas (como já era). Questões oficiais do Inep: NÃO são tocadas (todo filtro novo vale só para origin = 'staziamed').
--   * Antes de responder o aluno continua sem ver gabarito, explicação, fontes nem códigos: nenhuma função devolve um campo novo da questão.
--
-- A REGRA DOS N (determinística, estável por aluno, sem sorteio a cada acesso):
--   ordem do aluno = md5(id_do_aluno || ':' || id_da_questão), a mesma sempre; liberadas = as já respondidas por ele + as primeiras da
--   ordem dele que ainda não respondeu, até completar N. Efeitos: recarregar a página não muda nada; trocar de aparelho não muda nada;
--   cada aluno recebe um conjunto diferente (espalha as 74 entre os alunos e mistura as áreas, em vez de todos pegarem o lote L01);
--   responder uma questão não "gasta" outra (as respondidas contam dentro do N); subir o limite só ACRESCENTA questões; baixar o limite
--   nunca tira o que o aluno já respondeu. Carga nova de questões só pode trocar as AINDA NÃO respondidas (nunca as respondidas).
--
-- Funções novas:
--   ineditas_plan_limits (tabela, só o banco lê/grava)   ineditas_limit_for(uuid)  [interna]   ineditas_released_ids_for(uuid) [interna]
--   ineditas_released_ids() [usada pela política]        ineditas_can_open(text)   [interna]   app_my_ineditas() [aluno]
--   app_admin_ineditas_limits() / app_admin_save_ineditas_limits(jsonb) [só administrador, com registro de ações]
-- Redefinidas (corpo igual ao mais novo + a regra de "liberada"): política da tabela questions, gatilho question_attempts_ineditas_gate,
--   practice_question_view (9930), ch_raw_practice_correction_view (9920), app_question_figure (9801), app_related_questions e
--   app_start_related_question (9910), app_question_filters (9801: ganha released/limited/answered na opção "Questões Inéditas").
-- Depende de …9801, 9910, 9920 e 9930 já aplicadas (a tabela de planos usa o enum plan_code do núcleo).
-- Para desfazer: o bloco "DESFAZER" no fim deste arquivo.
-- =============================================================================

-- ---------------------------------------------------------------- configuração do administrador
create table if not exists public.ineditas_plan_limits (
  plan public.plan_code primary key,
  -- quantas Questões Inéditas o plano libera; nulo = TODAS
  max_ineditas integer check (max_ineditas is null or max_ineditas between 0 and 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.ineditas_plan_limits enable row level security;
-- Sem política e sem acesso direto: só as funções abaixo (security definer) leem e gravam.
revoke all on public.ineditas_plan_limits from public, anon, authenticated;
-- Padrão do dono: teste grátis = 20; planos pagos = todas. "on conflict do nothing": colar de novo não desfaz o que o administrador mudou.
insert into public.ineditas_plan_limits (plan, max_ineditas) values ('trial', 20), ('pro', null), ('elite', null)
on conflict (plan) do nothing;

-- ---------------------------------------------------------------- quantas a pessoa pode ter (interna)
-- nulo = todas (equipe, revisor médico, plano cujo limite é "todas"); 0 = nenhuma (sem login ou sem acesso); N = o limite do plano.
-- O plano que vale é o que dá o acesso HOJE: plano pago válido usa o limite do próprio plano; teste grátis válido usa o do teste
-- (mesmo que a linha diga Pro/Elite com situação "Em teste"). Linha de plano ausente na tabela: teste = 20, pagos = todas.
create or replace function public.ineditas_limit_for(p_user uuid) returns integer
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.subscriptions;
  v_tier public.plan_code;
  v_found boolean;
  v_max integer;
begin
  if p_user is null or not public.ineditas_user_access(p_user) then return 0; end if;
  if public.user_has_full_access(p_user) then return null; end if;
  select * into s from public.subscriptions where user_id = p_user;
  v_tier := case when public.subscription_is_paid(s.plan, s.status, s.current_period_end) then s.plan else 'trial'::public.plan_code end;
  select true, l.max_ineditas into v_found, v_max from public.ineditas_plan_limits l where l.plan = v_tier;
  if not coalesce(v_found, false) then return case when v_tier = 'trial' then 20 else null end; end if;
  return v_max;
end
$$;
revoke execute on function public.ineditas_limit_for(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- quais a pessoa pode abrir (interna)
-- As já respondidas (histórico fica igual em toda tela) + as liberadas pelo plano, na ordem estável do aluno. Sem limite: todas as
-- StaziaMed (inclusive as recolhidas, como a leitura da tabela já fazia). Com limite: só as publicadas, até completar N contando as
-- respondidas. Sem acesso: só as respondidas (o resto continua fechado pela regra de acesso do Planos).
create or replace function public.ineditas_released_ids_for(p_user uuid) returns setof text
  language sql stable security definer set search_path = ''
as $$
  with lim as (
    select public.ineditas_limit_for(p_user) as n, public.ineditas_user_access(p_user) as ok
  ), ans as (
    select distinct a.question_id
    from public.question_attempts a join public.questions q on q.id = a.question_id
    where a.user_id = p_user and q.origin = 'staziamed'
  ), used as (
    select count(*)::int as c from ans a join public.questions q on q.id = a.question_id where q.retired_at is null
  )
  select a.question_id from ans a
  union
  select q.id from public.questions q cross join lim
  where p_user is not null and lim.ok and lim.n is null and q.origin = 'staziamed'
  union
  select r.id from (
    select q.id, row_number() over (order by md5(p_user::text || ':' || q.id), q.id) as rn
    from public.questions q
    where q.origin = 'staziamed' and q.retired_at is null
      and not exists (select 1 from ans a where a.question_id = q.id)
  ) r cross join lim cross join used
  where p_user is not null and lim.ok and lim.n is not null and r.rn <= greatest(lim.n - used.c, 0)
$$;
revoke execute on function public.ineditas_released_ids_for(uuid) from public, anon, authenticated;

-- A da pessoa logada, para a política de leitura da tabela (que roda como o aluno). Sem login: vazio.
create or replace function public.ineditas_released_ids() returns setof text
  language sql stable security definer set search_path = ''
as $$
  select public.ineditas_released_ids_for((select auth.uid()))
$$;
revoke execute on function public.ineditas_released_ids() from public;
grant execute on function public.ineditas_released_ids() to anon, authenticated;

-- A pessoa logada tem acesso E esta inédita está liberada no plano dela (ou já foi respondida por ela)? Interna: usada por funções definer.
create or replace function public.ineditas_can_open(p_question_id text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select coalesce(public.has_ineditas(), false)
     and p_question_id in (select public.ineditas_released_ids_for((select auth.uid())))
$$;
revoke execute on function public.ineditas_can_open(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- o que a tela do aluno mostra
-- total = quantas Inéditas publicadas existem; released = quantas o plano dele libera (só publicadas); answered = quantas ele já respondeu;
-- limit = o número do plano (nulo = todas); limited = há limite; locked = sem acesso. Nada de conteúdo de questão sai daqui.
create or replace function public.app_my_ineditas() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_total integer;
  v_lim integer;
  v_access boolean;
begin
  if v_uid is null then
    return jsonb_build_object('total', 0, 'released', 0, 'answered', 0, 'limit', 0, 'limited', true, 'locked', true, 'lock_message', null);
  end if;
  select count(*)::int into v_total from public.questions q where q.origin = 'staziamed' and q.retired_at is null;
  v_access := public.ineditas_user_access(v_uid);
  v_lim := public.ineditas_limit_for(v_uid);
  return jsonb_build_object(
    'total', v_total,
    'released', case when not v_access then 0 else (
      select count(*)::int from public.questions q
      where q.origin = 'staziamed' and q.retired_at is null and q.id in (select public.ineditas_released_ids_for(v_uid))) end,
    'answered', (select count(distinct a.question_id)::int from public.question_attempts a join public.questions q on q.id = a.question_id
                 where a.user_id = v_uid and q.origin = 'staziamed' and q.retired_at is null),
    'limit', v_lim,
    'limited', v_lim is not null,
    'locked', not v_access,
    'lock_message', public.ineditas_gate_for(v_uid));
end
$$;
revoke execute on function public.app_my_ineditas() from public;
grant execute on function public.app_my_ineditas() to anon, authenticated;

-- ---------------------------------------------------------------- política de leitura da tabela questions
drop policy if exists "questões: oficiais, acesso às inéditas e as já respondidas" on public.questions;
drop policy if exists "questões: oficiais, as inéditas liberadas no plano e as já respondidas" on public.questions;
create policy "questões: oficiais, as inéditas liberadas no plano e as já respondidas" on public.questions
  for select to authenticated
  using (
    origin = 'official'
    or id in (select public.ineditas_released_ids())
  );

-- ---------------------------------------------------------------- responder: só as liberadas
create or replace function public.question_attempts_ineditas_gate() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_gate text;
begin
  if exists (select 1 from public.questions q where q.id = new.question_id and q.origin = 'staziamed') then
    v_gate := public.ineditas_gate_for(new.user_id);
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
    if new.question_id not in (select public.ineditas_released_ids_for(new.user_id)) then
      raise exception 'Esta Questão Inédita não está liberada no seu plano. Veja os planos para liberar mais.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.question_attempts_ineditas_gate() from public, anon, authenticated;

-- ---------------------------------------------------------------- Administração (só administrador)
create or replace function public.app_admin_ineditas_limits() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'published', (select count(*)::int from public.questions q where q.origin = 'staziamed' and q.retired_at is null),
    'plans', (select jsonb_agg(jsonb_build_object(
                'plan', p.plan, 'limit', l.max_ineditas, 'all', l.max_ineditas is null,
                'updated_at', l.updated_at) order by p.ord)
              from (values ('trial'::public.plan_code, 1), ('pro', 2), ('elite', 3)) as p (plan, ord)
              left join public.ineditas_plan_limits l on l.plan = p.plan));
end
$$;
revoke execute on function public.app_admin_ineditas_limits() from public, anon;

-- p_limits = { "trial": 20, "pro": null, "elite": null }: número inteiro de 0 a 100000, ou nulo = TODAS. Plano ausente do objeto não muda.
create or replace function public.app_admin_save_ineditas_limits(p_limits jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_plan text;
  v_val jsonb;
  v_before jsonb;
  v_n integer;
begin
  perform public.assert_admin();
  if p_limits is null or jsonb_typeof(p_limits) <> 'object' or p_limits = '{}'::jsonb then
    raise exception 'Informe o limite de pelo menos um plano.' using errcode = '22023';
  end if;
  for v_plan, v_val in select * from jsonb_each(p_limits) loop
    if v_plan not in ('trial', 'pro', 'elite') then
      raise exception 'Plano desconhecido: %.', v_plan using errcode = '22023';
    end if;
    if jsonb_typeof(v_val) not in ('number', 'null') then
      raise exception 'O limite de % deve ser um número inteiro ou vazio (todas).', v_plan using errcode = '22023';
    end if;
    if jsonb_typeof(v_val) = 'number' and ((v_val #>> '{}') !~ '^\d{1,6}$' or (v_val #>> '{}')::int > 100000) then
      raise exception 'O limite de % deve ser um número inteiro de 0 a 100000, ou vazio para liberar todas.', v_plan using errcode = '22023';
    end if;
  end loop;
  select jsonb_object_agg(l.plan, l.max_ineditas) into v_before from public.ineditas_plan_limits l;
  for v_plan, v_val in select * from jsonb_each(p_limits) loop
    v_n := case when jsonb_typeof(v_val) = 'null' then null else (v_val #>> '{}')::int end;
    insert into public.ineditas_plan_limits (plan, max_ineditas, updated_at, updated_by)
    values (v_plan::public.plan_code, v_n, now(), (select auth.uid()))
    on conflict (plan) do update set max_ineditas = excluded.max_ineditas, updated_at = now(), updated_by = excluded.updated_by;
  end loop;
  perform public.admin_log('plan.ineditas_limits', 'ineditas', jsonb_build_object(
    'from', coalesce(v_before, '{}'::jsonb),
    'to', (select jsonb_object_agg(l.plan, l.max_ineditas) from public.ineditas_plan_limits l)));
  return public.app_admin_ineditas_limits();
end
$$;
revoke execute on function public.app_admin_save_ineditas_limits(jsonb) from public, anon;

-- ---------------------------------------------------------------- funções do aluno com a regra de "liberada"
-- (o corpo é o MAIS NOVO de cada uma; muda só a condição marcada)

-- practice_question_view (corpo da …9930)
create or replace function public.practice_question_view(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'number', q.number,
    'area', q.area,
    'exam', (select jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester, 'title', e.title)
             from public.exams e where e.id = q.exam_id),
    'statement', q.statement,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by o ->> 'id')
                from jsonb_array_elements(q.options) o),
    'images', q.images,
    'origin', q.origin,
    'support', q.support,
    'preliminary', public.question_preliminary_info(q.id)
  )
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
$$;

-- correção (corpo da …9920)
create or replace function public.ch_raw_practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'is_correct', case when p_selected is null or q.status = 'annulled' then null else p_selected = q.correct_option::text end,
    'correct_option', q.correct_option,
    'annulled', q.status = 'annulled',
    'in_review', cardinality(h.campos) > 0,
    'topic', q.topic,
    'subtopic', q.subtopic,
    'explanation', (select nullif(btrim(o ->> 'explanation'), '')
                    from jsonb_array_elements(q.options) o
                    where q.status <> 'annulled'
                      and o ->> 'id' = q.correct_option::text and not ('explanation_' || (o ->> 'id')) = any (h.campos)),
    'option_notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'explanation')) order by o ->> 'id')
      from jsonb_array_elements(q.options) o
      where q.status <> 'annulled'
        and o ->> 'id' <> q.correct_option::text and nullif(btrim(o ->> 'explanation'), '') is not null
        and not ('explanation_' || (o ->> 'id')) = any (h.campos)
    ), '[]'::jsonb),
    'annulled_notes', public.question_annulled_study_notes(q.status, q.options, h.campos),
    'expected_conduct', case when 'expected_conduct' = any (h.campos) then null else q.expected_conduct end,
    'inep_intent', case when 'inep_intent' = any (h.campos) then null else q.inep_intent end,
    'update_note', public.question_update_note_visible(q.id),
    'sources', public.ch_student_sources(q.sources),
    'origin', q.origin,
    'support', q.support,
    'official_sources', case when q.origin = 'staziamed' then q.source_quotes end
  )
  from public.questions q
  cross join lateral (
    select public.question_hidden_fields(q.explanations_review, q.comment_review) as campos
  ) h
  where q.id = p_question_id
    and (q.origin = 'official' or public.ineditas_can_open(q.id))
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;
revoke execute on function public.ch_raw_practice_correction_view(text, text) from public, anon, authenticated;

-- figura (corpo da …9801)
create or replace function public.app_question_figure(p_question_id text, p_index integer default 0) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('path', q.images -> p_index ->> 'path', 'url', q.images -> p_index ->> 'url', 'alt', q.images -> p_index ->> 'alt'))
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null and (q.origin = 'official' or public.ineditas_can_open(q.id)) and p_index >= 0 and p_index < jsonb_array_length(q.images)
$$;

-- relacionadas (corpo da …9910)
create or replace function public.app_related_questions(p_question_id text, p_limit integer default 8) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n constant integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_src public.questions;
  v_access boolean;
  v_group text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into v_src from public.questions where id = p_question_id;
  if not found then return jsonb_build_object('items', '[]'::jsonb); end if;
  v_access := coalesce(public.has_ineditas(), false);
  -- NOVO (limite por plano): as inéditas que a pessoa pode abrir são só as liberadas no plano dela (mais as que já respondeu)
  -- a questão de origem segue a regra de leitura da tabela: oficial, com acesso às inéditas, ou já respondida por quem pede
  if v_src.origin <> 'official' and not exists (select 1 from public.question_attempts a where a.user_id = v_uid and a.question_id = v_src.id)
     and not (v_access and v_src.id in (select public.ineditas_released_ids_for(v_uid))) then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;
  select e.group_id into v_group from public.question_equivalents e where e.question_id = v_src.id;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(y.item order by y.prio, y.approved desc, y.score desc, y.id) from (
      select x.* from (
        select distinct on (coalesce(e.group_id, q.id))
               q.id, r.score,
               case r.relation when 'mesmo_raciocinio' then 1 when 'complementar' then 2 when 'mesmo_subtema' then 3 else 4 end as prio,
               r.status = 'aprovada' as approved,
               jsonb_build_object(
                 'id', q.id, 'code', q.code,
                 'exam_label', case when ex.kind = 'STAZIAMED' then 'Questões Inéditas' else coalesce(ex.title, ex.kind || ' ' || ex.year) end,
                 'number', q.number, 'area', q.area, 'tema', q.topic, 'subtema', q.subtopic,
                 'relation', r.relation,
                 'reason', case r.relation when 'mesmo_raciocinio' then 'Raciocínio semelhante'
                                           when 'complementar' then 'Questão complementar: mesmo assunto, outra etapa'
                                           when 'mesmo_subtema' then 'Mesmo subtema'
                                           else 'Mesmo tema, outra abordagem' end,
                 'answered', exists (select 1 from public.question_attempts a where a.user_id = v_uid and a.question_id = q.id),
                 -- só vêm questões que a pessoa pode abrir (a inédita fechada nem aparece): o cadeado fica sempre aberto aqui
                 'locked', false) as item
        from public.question_relations r
        join public.questions q on q.id = case when r.question_a = v_src.id then r.question_b else r.question_a end
        join public.exams ex on ex.id = q.exam_id
        left join public.question_equivalents e on e.question_id = q.id
        where (r.question_a = v_src.id or r.question_b = v_src.id)
          and r.relation in ('mesmo_raciocinio', 'complementar', 'mesmo_subtema', 'mesmo_tema')
          -- aprovada por pessoa, ou proposta do motor (regra ou vetor) com confiança alta; o que a IA reclassificou só depois de aprovado
          and (r.status = 'aprovada' or (r.status = 'proposta' and r.origin in ('regra', 'vetor') and r.confidence >= 0.8 and not r.stale))
          and q.status <> 'annulled'
          and not (q.needs_image and jsonb_array_length(q.images) = 0)
          and (q.origin = 'official' or (q.retired_at is null and v_access and q.id in (select public.ineditas_released_ids_for(v_uid))))
          and (v_group is null or e.group_id is distinct from v_group)
        order by coalesce(e.group_id, q.id),
                 case r.relation when 'mesmo_raciocinio' then 1 when 'complementar' then 2 when 'mesmo_subtema' then 3 else 4 end,
                 (r.status = 'aprovada') desc, r.score desc) x
      order by x.prio, x.approved desc, x.score desc, x.id
      limit v_n) y), '[]'::jsonb));
end
$$;

create or replace function public.app_start_related_question(p_question_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_q public.questions;
  v_gate text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta para treinar.' using errcode = '28000'; end if;
  select * into v_q from public.questions where id = p_question_id;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if v_q.origin = 'staziamed' then
    v_gate := public.ineditas_gate();
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
    if v_q.id not in (select public.ineditas_released_ids_for(v_uid)) then
      raise exception 'Esta Questão Inédita não está liberada no seu plano.' using errcode = '42501';
    end if;
    if v_q.retired_at is not null then raise exception 'Esta Questão Inédita foi recolhida e não entra mais em treino.' using errcode = '22023'; end if;
  end if;
  if v_q.status = 'annulled' then raise exception 'Questão anulada pela banca: não entra em treino.' using errcode = '22023'; end if;
  if v_q.needs_image and jsonb_array_length(v_q.images) = 0 then
    raise exception 'Esta questão depende de uma figura que ainda não está disponível.' using errcode = '22023';
  end if;
  insert into public.practice_sessions (user_id, kind, config, question_ids)
  values (v_uid, 'questoes', jsonb_build_object('filters', '{}'::jsonb, 'requested', 1, 'related_to', v_q.id), array[v_q.id])
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'count', 1);
end
$$;

-- a lista de provas (corpo da …9801)
create or replace function public.app_question_filters() returns jsonb
  language sql stable set search_path = ''
as $$
  with pool as (
    select * from public.practice_pool('{}'::jsonb)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from pool),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'year', e.year, 'semester', e.semester,
                                          'title', e.title, 'total', c.total)
                       order by e.year desc, e.semester desc nulls last, e.kind)
      from public.exams e
      join (select exam_id, count(*)::int as total from pool group by exam_id) c on c.exam_id = e.id
    ), '[]'::jsonb)
    -- a opção "Questões Inéditas" (prova staziamed) entra no fim da lista; fechada, vai com locked e o aviso
    || coalesce((
      select jsonb_build_array(jsonb_build_object('id', 'staziamed', 'kind', 'STAZIAMED', 'year', 2026, 'semester', null,
                                                    'title', 'Questões Inéditas', 'total', o.total, 'locked', o.locked,
                                                    'lock_message', o.lock_message,
                                                    -- NOVO: quantas o plano libera, quantas já respondeu e se há limite (nada de conteúdo de questão)
                                                    'released', m.released, 'answered', m.answered, 'limited', m.limited))
      from public.ineditas_option() o
      cross join lateral (
        select (x ->> 'released')::int as released, (x ->> 'answered')::int as answered, (x ->> 'limited')::boolean as limited
        from (select public.app_my_ineditas() as x) y
      ) m
      where o.total > 0
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('area', t.area, 'topic', t.topic, 'total', t.total) order by t.total desc, t.topic)
      from (
        select area, topic, count(*)::int as total,
               row_number() over (partition by area order by count(*) desc, topic) as rn
        from pool group by area, topic
      ) t
      where t.rn <= 6
    ), '[]'::jsonb)
  )
$$;

-- =============================================================================
-- DESFAZER (cole só se for preciso; nada de dado do aluno é apagado):
--   1) recriar a política "questões: oficiais, acesso às inéditas e as já respondidas" (using: origin = 'official' or (select public.has_ineditas())
--      or exists (select 1 from public.question_attempts a where a.user_id = (select auth.uid()) and a.question_id = questions.id))
--      e apagar a nova: drop policy "questões: oficiais, as inéditas liberadas no plano e as já respondidas" on public.questions;
--   2) recolar as versões anteriores de question_attempts_ineditas_gate (…9801), practice_question_view (…9930),
--      ch_raw_practice_correction_view (…9920), app_question_figure (…9801), app_related_questions e app_start_related_question (…9910)
--      e app_question_filters (…9801);
--   3) drop function public.app_admin_save_ineditas_limits(jsonb), public.app_admin_ineditas_limits(), public.app_my_ineditas(),
--      public.ineditas_can_open(text), public.ineditas_released_ids(), public.ineditas_released_ids_for(uuid), public.ineditas_limit_for(uuid);
--   4) drop table public.ineditas_plan_limits;
-- =============================================================================
