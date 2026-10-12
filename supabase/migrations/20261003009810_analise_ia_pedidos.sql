-- =============================================================================
-- Pedir a IA pela tela (sem linha de comando): análise de questões históricas e conferência dos rascunhos inéditos.
-- Administração › Central de Conteúdo › "Análise de questões" e "Questões inéditas".
--
--   a pessoa escolhe a prova (ou o lote) e a quantidade; a tela mostra ANTES quantas questões entram e quanto deve custar
--   →  app_ch_question_analysis_request / app_ch_draft_check_request validam, gravam o pedido (ch_ai_requests) e põem uma
--      tarefa na fila (ch_jobs, etapa question_analysis ou draft_check, sem documento)
--   →  o processamento (tarefa do Cloud Run) roda runQuestionAnalysis / runDraftChecks só para as questões do pedido,
--      grava o gasto na Central de IAs (ai_calls) e o resultado no pedido (ch_worker_ai_request_update)
--   →  as análises caem em "Rascunhos"/"Para revisar" e a conferência dos rascunhos vira o selo de triagem.
--
-- NADA é publicado nem aprovado por aqui: a análise nasce "rascunho de IA" (depois "conferida por regras") e o aluno só
-- recebe o que um revisor médico da área aprovar; o gabarito oficial nunca é tocado; a triagem dos rascunhos inéditos é
-- só triagem ("A IA não aprova: quem decide é o revisor médico").
--
-- Regras no banco (números fixos, em ch_ai_request_limit; a tela só mostra):
--   * análise de questões: no máximo 50 questões por pedido e 100 por dia por pessoa; padrão 3;
--   * conferência de rascunhos: no máximo 20 por pedido e 60 por dia por pessoa; padrão 10;
--   * "dia" = dia de Brasília (UTC-3, sem horário de verão); pedido que falhou sem fazer nada não gasta a cota do dia;
--   * quem pede: administrador (qualquer área) ou revisor médico cadastrado (só as questões das áreas dele); editor sem
--     área, aluno e quem entrou sem conta são barrados;
--   * recusa em português quando a Central de Conteúdo ou a IA da função não estão prontas (a análise usa a função
--     "Engenharia reversa" e a conferência usa a "Verificação"; as chaves de ai_functions não mudam);
--   * idempotente: o mesmo pedido (mesmas questões, mesmas opções) enquanto ainda anda não duplica: volta o que existe;
--   * análise já PUBLICADA ou REVISADA nunca é substituída por este caminho (publicada sai do ar se a atual for trocada);
--   * pedido pode ser cancelado enquanto está na fila ou pendente (não durante a execução);
--   * parada de segurança por pedido: o processamento para se o gasto real passar do dobro do pior caso estimado.
--
-- Triagem dos rascunhos (ch_draft_triage, só a partir das conferências ATUAIS, com o mesmo conteúdo):
--   reprovada · sem_fonte · com_apontamentos · so_regras · nao_conferida · sem_apontamentos
--   rascunho SEM FONTE OFICIAL (nível A a D) fica com a aprovação BLOQUEADA no banco (app_draft_question_decide): a
--   camada "Fontes" disse "insuficiente", ou (sem a camada Fontes aprovada) a camada de regras viu que não cita fonte
--   oficial cadastrada. Pedir ajustes e recusar continuam livres.
--
-- Esta migração:
--   * recria ch_jobs_step_check com a UNIÃO do que existe agora (lida da própria restrição) + as 17 etapas conhecidas até
--     a 9610 + question_analysis + draft_check (colar depois de outras migrações que acrescentem etapa não apaga a delas);
--   * NÃO redefine nenhuma função de app_admin_question*, practice_correction_view, tutor_truth nem app_question_commentary;
--   * redefine app_draft_questions (parte da versão da 2100, com 2 parâmetros novos com padrão) e app_draft_question_decide
--     (parte da versão da 1800). Quem criar outra migração depois que mexa nelas parte do corpo desta;
--   * pode ser colada mais de uma vez (create ... if not exists, create or replace, drop ... if exists).
-- Numeração: 20261003009810 (intervalo 9810 a 9819 desta frente).
-- =============================================================================

-- ---------------------------------------------------------------- fila: etapas novas (união)
do $steps$
declare
  v_def text;
  v_steps text[] := array['extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index',
                          'visual_render', 'station_pages', 'station_segment', 'station_draft', 'question_generate', 'question_check',
                          'question_source', 'source_search', 'question_analysis', 'draft_check'];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.ch_jobs'::regclass and c.conname = 'ch_jobs_step_check';
  if v_def is not null then
    v_steps := v_steps || array(select m[1] from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m);
  end if;
  v_steps := array(select distinct s from unnest(v_steps) as s order by s);
  alter table public.ch_jobs drop constraint if exists ch_jobs_step_check;
  execute format('alter table public.ch_jobs add constraint ch_jobs_step_check check (step in (%s))',
                 (select string_agg(quote_literal(s), ', ') from unnest(v_steps) as s));
end
$steps$;

-- ---------------------------------------------------------------- pedidos
create table if not exists public.ch_ai_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('question_analysis', 'draft_check')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  -- mesmo pedido = mesma chave (tipo, itens e opções); só vale enquanto o pedido anda (índice abaixo)
  request_key text not null,
  -- prova/lote, área, quantidade, camadas, "só sem análise"/"conferir de novo"
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  -- ids congelados na hora do pedido (questões ou rascunhos): o processamento roda exatamente estes
  target_ids text[] not null check (cardinality(target_ids) between 1 and 50),
  item_count integer not null check (item_count between 1 and 50),
  -- estimativa mostrada antes de confirmar (típica) e parada de segurança; nulos quando falta preço cadastrado
  estimate_usd numeric(12, 6) check (estimate_usd is null or estimate_usd >= 0),
  ceiling_usd numeric(12, 6) check (ceiling_usd is null or ceiling_usd >= 0),
  status text not null default 'na_fila' check (status in ('na_fila', 'analisando', 'concluido', 'falhou', 'pendente')),
  job_id uuid references public.ch_jobs (id) on delete set null,
  done_count integer not null default 0 check (done_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  calls integer not null default 0 check (calls >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  message text check (message is null or char_length(message) <= 1000),
  -- resultado por tipo (vereditos, camadas); sem texto de questão
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ch_ai_requests_person_idx on public.ch_ai_requests (requested_by, kind, created_at desc);
create index if not exists ch_ai_requests_job_idx on public.ch_ai_requests (job_id);
create unique index if not exists ch_ai_requests_active_key on public.ch_ai_requests (request_key)
  where status in ('na_fila', 'analisando', 'pendente');

alter table public.ch_ai_requests enable row level security;
drop policy if exists "pedidos de IA: administrador lê tudo, cada pessoa os seus" on public.ch_ai_requests;
create policy "pedidos de IA: administrador lê tudo, cada pessoa os seus" on public.ch_ai_requests for select to authenticated
  using (public.is_admin() or requested_by = (select auth.uid()));
-- escrita só pelas funções abaixo

-- ---------------------------------------------------------------- apoio (fechadas para quem chama de fora)
create or replace function public.ch_ai_request_limit(p_kind text, p_what text) returns integer
  language sql immutable security definer set search_path = ''
as $$
  select case p_kind || ':' || p_what
    when 'question_analysis:per_request' then 50
    when 'question_analysis:per_day' then 100
    when 'question_analysis:default' then 3
    when 'draft_check:per_request' then 20
    when 'draft_check:per_day' then 60
    when 'draft_check:default' then 10
  end
$$;

-- Começo do dia de Brasília (UTC-3, sem horário de verão) como instante.
create or replace function public.ch_ai_day_start() returns timestamptz
  language sql stable security definer set search_path = ''
as $$
  select (date_trunc('day', (now() at time zone 'UTC') - interval '3 hours') + interval '3 hours') at time zone 'UTC'
$$;

-- Quantos itens a pessoa já pediu hoje deste tipo (pedido que falhou conta só o que chegou a fazer).
create or replace function public.ch_ai_used_today(p_user uuid, p_kind text) returns integer
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case when r.status = 'falhou' then r.done_count else r.item_count end), 0)::int
    from public.ch_ai_requests r
   where r.requested_by = p_user and r.kind = p_kind and r.created_at >= public.ch_ai_day_start()
$$;

-- Quem pode pedir e de quais áreas: administrador (nulo = todas as áreas, ou só p_area se vier) ou revisor médico (as áreas
-- dele). Aluno, editor sem área e quem não entrou são barrados. Também exige a Central de Conteúdo ligada (ch_assert_staff).
create or replace function public.ch_ai_request_scope(p_area text) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_areas text[];
begin
  perform public.ch_assert_staff();
  if public.is_admin() then
    return case when p_area is null then null else array[p_area] end;
  end if;
  select array_agg(r.area_code order by r.area_code) into v_areas from public.ch_reviewer_areas r where r.user_id = (select auth.uid());
  if v_areas is null then
    raise exception 'Só administrador ou revisor médico de uma área pode pedir análise por IA.' using errcode = '42501';
  end if;
  if p_area is not null then
    if not (p_area = any (v_areas)) then
      raise exception 'Você não é revisor médico da área %.', p_area using errcode = '42501';
    end if;
    return array[p_area];
  end if;
  return v_areas;
end
$$;

-- Motivo (em português) de a IA de uma função da Central de IAs não estar pronta; nulo quando está. Só o que o banco enxerga:
-- interruptores da Central de Conteúdo e IA ligada na Central de IAs. Chave de API ausente no servidor aparece depois, no
-- próprio pedido (fica "pendente" com o motivo).
create or replace function public.ch_ai_function_problem(p_key text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f public.ai_functions;
  v_name text := case p_key when 'engenharia_reversa' then 'Engenharia reversa' when 'verificacao' then 'Verificação' when 'criacao' then 'Criação' else p_key end;
  v_label text;
begin
  if not public.ch_flag('enabled') then
    return 'A Central de Conteúdo está desligada pelo administrador.';
  end if;
  if not public.ch_flag('ai_enabled') then
    return 'A IA da Central de Conteúdo está desligada pelo administrador (interruptor "IA" da Central de Conteúdo).';
  end if;
  select * into f from public.ai_functions where key = p_key;
  if found then
    if f.primary_ref is null or coalesce(f.primary_ref ->> 'provider', '') = '' then
      return format('A função "%s" da Central de IAs está sem IA escolhida: escolha uma na Central de IAs.', v_name);
    end if;
    if exists (select 1 from public.ai_providers p where p.id = f.primary_ref ->> 'provider' and p.enabled) then return null; end if;
    if f.fallback_ref is not null and exists (select 1 from public.ai_providers p where p.id = f.fallback_ref ->> 'provider' and p.enabled) then return null; end if;
    v_label := case f.primary_ref ->> 'provider' when 'anthropic' then 'Claude' when 'openai' then 'OpenAI' when 'gemini' then 'Gemini' when 'ollama' then 'Ollama' else 'A IA' end;
    return format('A IA escolhida para "%s" (%s) está desligada na Central de IAs. Ligue-a ou escolha outra.', v_name, v_label);
  end if;
  if not exists (select 1 from public.ai_providers p where p.enabled) then
    return format('Nenhuma IA está ligada na Central de IAs: ligue uma e configure a função "%s".', v_name);
  end if;
  return null;
end
$$;

-- Custo em dólares pelo preço cadastrado; nulo quando falta a IA ou o preço; Ollama custa zero.
create or replace function public.ch_ai_cost_usd(p_ref jsonb, p_in numeric, p_out numeric) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select case
           when p_ref is null or coalesce(p_ref ->> 'provider', '') = '' then null
           when p_ref ->> 'provider' = 'ollama' then 0
           else (select (coalesce(p_in, 0) * pr.input_per_mtok + coalesce(p_out, 0) * pr.output_per_mtok) / 1000000.0
                   from public.ai_model_prices pr
                  where pr.provider = p_ref ->> 'provider' and pr.model = p_ref ->> 'model')
         end
$$;

-- ---------------------------------------------------------------- análise de questões: escolha das questões
-- Questões que entram: as sem análise para o conteúdo atual (p_only_missing) ou todas as que NÃO têm análise publicada nem
-- revisada (essas nunca são trocadas por aqui). Em ordem de prova e número; p_limit nulo = todas.
create or replace function public.ch_qa_pick(p_exam text, p_area text, p_areas text[], p_only_missing boolean, p_limit integer)
  returns table (id text, exam_id text, number integer, area text, chars integer)
  language sql stable security definer set search_path = ''
as $$
  select q.id, q.exam_id, q.number::int, public.question_area_code(q.id),
         (char_length(q.statement) + char_length(q.options::text) + 300)::int
    from public.questions q
   where q.status <> 'annulled' and q.correct_option is not null
     and (p_exam is null or q.exam_id = p_exam)
     and (p_area is null or public.question_area_code(q.id) = p_area)
     and (p_areas is null or public.question_area_code(q.id) = any (p_areas))
     and not exists (select 1 from public.question_analysis a
                      where a.question_id = q.id and a.is_current and a.status in ('published', 'reviewed'))
     and (not coalesce(p_only_missing, true)
          or not exists (select 1 from public.question_analysis a
                          where a.question_id = q.id and a.is_current
                            and a.basis_hash = public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option))))
   order by q.exam_id, q.number
   limit p_limit
$$;

-- Estimativa: por questão, entrada = texto/4 + 1135 (instruções e formato), saída típica 2.600 e máxima 12.000 tokens (os
-- números de estimateAnalysisTokens e do pedido ao maestro). Preço da IA principal da função "Engenharia reversa".
create or replace function public.ch_qa_estimate(p_chars integer[]) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_n integer := coalesce(cardinality(p_chars), 0);
  v_in numeric := coalesce((select sum(ceil(c / 4.0)) from unnest(p_chars) as c), 0) + v_n * 1135;
  v_out numeric := v_n * 2600;
  v_max numeric := v_n * 12000;
  v_ref jsonb := (select f.primary_ref from public.ai_functions f where f.key = 'engenharia_reversa');
  v_typical numeric := public.ch_ai_cost_usd(v_ref, v_in, v_n * 2600);
  v_worst numeric := public.ch_ai_cost_usd(v_ref, v_in, v_n * 12000);
  v_note text;
begin
  if v_ref is null then
    v_note := 'A função "Engenharia reversa" não tem configuração salva na Central de IAs: o servidor usa o padrão dele e o valor em dólar não pode ser estimado aqui.';
  elsif v_typical is null then
    v_note := format('Sem preço cadastrado para %s (%s) na Central de IAs: o valor em dólar não pode ser estimado.', v_ref ->> 'model', v_ref ->> 'provider');
  end if;
  return jsonb_build_object('calls', v_n, 'input_tokens', v_in, 'output_tokens_typical', v_out, 'output_tokens_max', v_max,
                            'typical_usd', round(v_typical, 4), 'max_usd', round(v_worst, 4),
                            'provider', v_ref ->> 'provider', 'model', v_ref ->> 'model', 'note', v_note);
end
$$;

-- ---------------------------------------------------------------- análise de questões: tela
-- Antes de confirmar: quantas questões entram, estimativa em dólares, o que sobra da cota de hoje e se a IA está pronta.
-- Não grava nada; parâmetros fora da faixa são ajustados (quem recusa é o pedido).
create or replace function public.app_ch_question_analysis_preview(p_exam text default null, p_count integer default 3,
                                                                   p_only_missing boolean default true, p_area text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_areas text[];
  v_per constant integer := public.ch_ai_request_limit('question_analysis', 'per_request');
  v_day constant integer := public.ch_ai_request_limit('question_analysis', 'per_day');
  v_count integer;
  v_pick record;
  v_ids text[];
  v_chars integer[];
  v_available integer;
  v_used integer;
  v_problem text;
begin
  v_areas := public.ch_ai_request_scope(p_area);
  v_count := least(greatest(coalesce(p_count, public.ch_ai_request_limit('question_analysis', 'default')), 1), v_per);
  select count(*)::int into v_available from public.ch_qa_pick(p_exam, p_area, v_areas, p_only_missing, null);
  select array_agg(x.id order by x.exam_id, x.number), array_agg(x.chars order by x.exam_id, x.number) into v_ids, v_chars
    from public.ch_qa_pick(p_exam, p_area, v_areas, p_only_missing, v_count) x;
  v_used := public.ch_ai_used_today((select auth.uid()), 'question_analysis');
  v_problem := public.ch_ai_function_problem('engenharia_reversa');
  return jsonb_build_object(
    'kind', 'question_analysis',
    'limits', jsonb_build_object('per_request', v_per, 'per_day', v_day, 'default', public.ch_ai_request_limit('question_analysis', 'default')),
    'available', v_available,
    'will_analyze', coalesce(cardinality(v_ids), 0),
    'used_today', v_used,
    'remaining_today', greatest(v_day - v_used, 0),
    'estimate', public.ch_qa_estimate(coalesce(v_chars, '{}'::integer[])),
    'ai', jsonb_build_object('ready', v_problem is null, 'reason', v_problem),
    'areas', to_jsonb(v_areas));
end
$$;

-- Pede a análise: valida, grava o pedido e põe na fila. Devolve {id, duplicate, status, items, estimate_usd}.
create or replace function public.app_ch_question_analysis_request(p_exam text default null, p_count integer default 3,
                                                                   p_only_missing boolean default true, p_area text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_areas text[];
  v_per constant integer := public.ch_ai_request_limit('question_analysis', 'per_request');
  v_day constant integer := public.ch_ai_request_limit('question_analysis', 'per_day');
  v_count integer := coalesce(p_count, public.ch_ai_request_limit('question_analysis', 'default'));
  v_ids text[];
  v_chars integer[];
  v_problem text;
  v_key text;
  v_dup public.ch_ai_requests;
  v_used integer;
  v_est jsonb;
  v_id uuid;
  v_job uuid;
  v_only boolean := coalesce(p_only_missing, true);
begin
  v_areas := public.ch_ai_request_scope(p_area);
  if v_count < 1 or v_count > v_per then
    raise exception 'Escolha de 1 a % questões por pedido (máximo de % por pedido).', v_per, v_per using errcode = '22023';
  end if;
  if p_exam is not null and not exists (select 1 from public.exams e where e.id = p_exam) then
    raise exception 'Prova não encontrada.' using errcode = 'P0002';
  end if;
  v_problem := public.ch_ai_function_problem('engenharia_reversa');
  if v_problem is not null then raise exception '%', v_problem using errcode = '55000'; end if;

  select array_agg(x.id order by x.exam_id, x.number), array_agg(x.chars order by x.exam_id, x.number) into v_ids, v_chars
    from public.ch_qa_pick(p_exam, p_area, v_areas, v_only, v_count) x;
  if v_ids is null then
    raise exception 'Nenhuma questão para analisar com estes filtros: todas já têm análise, ou não são de uma área em que você é revisor.' using errcode = '22023';
  end if;

  v_key := public.ch_hash(jsonb_build_object('kind', 'question_analysis', 'ids', to_jsonb(v_ids), 'only_missing', v_only));
  select * into v_dup from public.ch_ai_requests r where r.request_key = v_key and r.status in ('na_fila', 'analisando', 'pendente');
  if found then
    return jsonb_build_object('id', v_dup.id, 'duplicate', true, 'status', v_dup.status, 'items', v_dup.item_count, 'estimate_usd', v_dup.estimate_usd);
  end if;

  v_used := public.ch_ai_used_today((select auth.uid()), 'question_analysis');
  if v_used + cardinality(v_ids) > v_day then
    raise exception 'Limite de % questões por dia atingido: você já pediu % hoje e este pedido tem %. O limite recomeça amanhã (horário de Brasília).',
      v_day, v_used, cardinality(v_ids) using errcode = '53400';
  end if;

  v_est := public.ch_qa_estimate(v_chars);
  insert into public.ch_ai_requests (kind, requested_by, request_key, params, target_ids, item_count, estimate_usd, ceiling_usd)
  values ('question_analysis', (select auth.uid()), v_key,
          jsonb_build_object('exam', p_exam, 'area', p_area, 'count', v_count, 'only_missing', v_only),
          v_ids, cardinality(v_ids), (v_est ->> 'typical_usd')::numeric, round(((v_est ->> 'max_usd')::numeric) * 2, 4))
  on conflict (request_key) where status in ('na_fila', 'analisando', 'pendente') do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_dup from public.ch_ai_requests r where r.request_key = v_key and r.status in ('na_fila', 'analisando', 'pendente');
    return jsonb_build_object('id', v_dup.id, 'duplicate', true, 'status', v_dup.status, 'items', v_dup.item_count, 'estimate_usd', v_dup.estimate_usd);
  end if;
  insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts)
  values (null, 'question_analysis', 'ai_request:' || v_id::text, 'ai_request:' || v_id::text, '{}'::jsonb, 2)
  returning id into v_job;
  update public.ch_ai_requests set job_id = v_job where id = v_id;
  perform public.ch_log('question_analysis.request', v_id::text,
                        jsonb_build_object('exam', p_exam, 'area', p_area, 'items', cardinality(v_ids), 'only_missing', v_only,
                                           'estimate_usd', (v_est ->> 'typical_usd')::numeric, 'job_id', v_job));
  return jsonb_build_object('id', v_id, 'duplicate', false, 'status', 'na_fila', 'items', cardinality(v_ids), 'estimate_usd', (v_est ->> 'typical_usd')::numeric);
end
$$;

-- ---------------------------------------------------------------- conferência de rascunhos: escolha e estimativa
-- p_layers já vem validado (subconjunto de software, sources, currency, redteam). Rascunhos aguardando revisão médica, na ordem
-- de lote e número; p_recheck = todos, senão só os que ainda não têm conferência ATUAL em alguma camada pedida.
create or replace function public.ch_dc_pick(p_batch text, p_area text, p_areas text[], p_layers text[], p_recheck boolean, p_limit integer)
  returns table (id uuid, batch text, slot integer, base_chars integer, key_chars integer)
  language sql stable security definer set search_path = ''
as $$
  select d.id, d.batch, d.slot,
         (char_length(d.stem) + char_length(d.alternatives::text) + coalesce(char_length(d.support_rows::text), 0) + 100)::int,
         (char_length(d.stem) + char_length(d.alternatives::text) + coalesce(char_length(d.support_rows::text), 0) + 100
          + coalesce(char_length(d.explanation), 0) + char_length(d.alternative_explanations::text) + char_length(d.source_citations::text)
          + coalesce(char_length(d.clinical_decision), 0))::int
    from public.draft_questions d
   where d.status = 'awaiting_medical_review'
     and (p_batch is null or d.batch = p_batch)
     and (p_area is null or d.area = p_area)
     and (p_areas is null or d.area = any (p_areas))
     and (coalesce(p_recheck, false)
          or exists (select 1 from unnest(p_layers) as l
                      where not exists (select 1 from public.draft_checks c where c.draft_id = d.id and c.layer = l and c.content_hash = d.content_hash)))
   order by d.batch, d.slot
   limit p_limit
$$;

-- Camadas pedidas, validadas: só as 4 conhecidas; "software" entra sempre (é grátis).
create or replace function public.ch_dc_layers(p_layers text[]) returns text[]
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  v_bad text;
begin
  select l into v_bad from unnest(coalesce(p_layers, array['software'])) as l where l not in ('software', 'sources', 'currency', 'redteam') limit 1;
  if v_bad is not null then raise exception 'Camada de conferência desconhecida: %.', v_bad using errcode = '22023'; end if;
  return array(select l from unnest(array['software', 'sources', 'currency', 'redteam']) as l
                where l = 'software' or l = any (coalesce(p_layers, array['software'])));
end
$$;

-- Estimativa por camada de IA: fontes e atualidade 1 chamada cada (entrada = texto/4 + 500 + 3.750 de trechos oficiais, no
-- pior caso; saída típica 350), revisão clínica 2 chamadas (às cegas e com o gabarito; saída típica 1.100). Máximo de 4.096 de
-- saída por chamada. Preço de cada papel: conferente da posição (fontes 0, atualidade 1, revisão clínica 2) ou a principal da
-- função "Verificação". A troca automática para outra empresa pode mudar o modelo na hora: o valor é aproximado.
create or replace function public.ch_dc_estimate(p_base integer[], p_key integer[], p_layers text[]) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f public.ai_functions;
  v_n integer := coalesce(cardinality(p_base), 0);
  v_base numeric := coalesce((select sum(ceil(c / 4.0)) from unnest(p_base) as c), 0);
  v_keyed numeric := coalesce((select sum(ceil(c / 4.0)) from unnest(p_key) as c), 0);
  v_layer text;
  v_idx integer;
  v_ref jsonb;
  v_in numeric;
  v_out numeric;
  v_calls integer;
  v_cost numeric;
  v_cost_max numeric;
  v_typical numeric := 0;
  v_max numeric := 0;
  v_unknown boolean := false;
  v_total_calls integer := 0;
  v_tokens_in numeric := 0;
  v_tokens_out numeric := 0;
  v_note text;
  v_by jsonb := '{}'::jsonb;
begin
  select * into f from public.ai_functions where key = 'verificacao';
  foreach v_layer in array p_layers loop
    continue when v_layer = 'software';
    v_idx := case v_layer when 'sources' then 0 when 'currency' then 1 else 2 end;
    v_ref := coalesce(f.reviewers -> v_idx, f.primary_ref);
    if v_layer = 'redteam' then
      v_calls := 2 * v_n;
      v_in := v_base + 500 * v_n + v_keyed + 500 * v_n;
      v_out := 1100 * v_n;
    else
      v_calls := v_n;
      v_in := v_base + 500 * v_n + 3750 * v_n;
      v_out := 350 * v_n;
    end if;
    v_cost := public.ch_ai_cost_usd(v_ref, v_in, v_out);
    v_cost_max := public.ch_ai_cost_usd(v_ref, v_in, v_calls * 4096);
    if v_cost is null then v_unknown := true; else v_typical := v_typical + v_cost; v_max := v_max + v_cost_max; end if;
    v_total_calls := v_total_calls + v_calls;
    v_tokens_in := v_tokens_in + v_in;
    v_tokens_out := v_tokens_out + v_out;
    v_by := v_by || jsonb_build_object(v_layer, jsonb_build_object('calls', v_calls, 'provider', v_ref ->> 'provider', 'model', v_ref ->> 'model', 'usd', round(v_cost, 4)));
  end loop;
  if v_total_calls > 0 and (f.key is null) then
    v_note := 'A função "Verificação" não tem configuração salva na Central de IAs: o servidor usa o padrão dele e o valor em dólar não pode ser estimado aqui.';
  elsif v_unknown then
    v_note := 'Falta preço cadastrado para a IA de alguma camada na Central de IAs: o valor em dólar não pode ser estimado por inteiro.';
  end if;
  return jsonb_build_object('calls', v_total_calls, 'input_tokens', v_tokens_in, 'output_tokens_typical', v_tokens_out,
                            'typical_usd', case when v_total_calls = 0 then 0 when v_unknown or f.key is null then null else round(v_typical, 4) end,
                            'max_usd', case when v_total_calls = 0 then 0 when v_unknown or f.key is null then null else round(v_max, 4) end,
                            'by_layer', v_by, 'note', v_note);
end
$$;

-- ---------------------------------------------------------------- conferência de rascunhos: tela
create or replace function public.app_ch_draft_check_preview(p_batch text default null, p_area text default null, p_count integer default 10,
                                                             p_layers text[] default array['software'], p_recheck boolean default false) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_areas text[];
  v_layers text[];
  v_per constant integer := public.ch_ai_request_limit('draft_check', 'per_request');
  v_day constant integer := public.ch_ai_request_limit('draft_check', 'per_day');
  v_count integer;
  v_ids uuid[];
  v_base integer[];
  v_key integer[];
  v_available integer;
  v_used integer;
  v_problem text;
begin
  v_areas := public.ch_ai_request_scope(p_area);
  v_layers := public.ch_dc_layers(p_layers);
  v_count := least(greatest(coalesce(p_count, public.ch_ai_request_limit('draft_check', 'default')), 1), v_per);
  select count(*)::int into v_available from public.ch_dc_pick(p_batch, p_area, v_areas, v_layers, p_recheck, null);
  select array_agg(x.id order by x.batch, x.slot), array_agg(x.base_chars order by x.batch, x.slot), array_agg(x.key_chars order by x.batch, x.slot)
    into v_ids, v_base, v_key
    from public.ch_dc_pick(p_batch, p_area, v_areas, v_layers, p_recheck, v_count) x;
  v_used := public.ch_ai_used_today((select auth.uid()), 'draft_check');
  v_problem := case when v_layers <> array['software'] then public.ch_ai_function_problem('verificacao') end;
  return jsonb_build_object(
    'kind', 'draft_check',
    'layers', to_jsonb(v_layers),
    'limits', jsonb_build_object('per_request', v_per, 'per_day', v_day, 'default', public.ch_ai_request_limit('draft_check', 'default')),
    'available', v_available,
    'will_check', coalesce(cardinality(v_ids), 0),
    'used_today', v_used,
    'remaining_today', greatest(v_day - v_used, 0),
    'estimate', public.ch_dc_estimate(coalesce(v_base, '{}'::integer[]), coalesce(v_key, '{}'::integer[]), v_layers),
    'ai', jsonb_build_object('ready', v_problem is null, 'reason', v_problem, 'needed', v_layers <> array['software']),
    'areas', to_jsonb(v_areas));
end
$$;

create or replace function public.app_ch_draft_check_request(p_batch text default null, p_area text default null, p_count integer default 10,
                                                             p_layers text[] default array['software'], p_recheck boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_areas text[];
  v_layers text[];
  v_per constant integer := public.ch_ai_request_limit('draft_check', 'per_request');
  v_day constant integer := public.ch_ai_request_limit('draft_check', 'per_day');
  v_count integer := coalesce(p_count, public.ch_ai_request_limit('draft_check', 'default'));
  v_ids uuid[];
  v_base integer[];
  v_keyed integer[];
  v_problem text;
  v_key text;
  v_dup public.ch_ai_requests;
  v_used integer;
  v_est jsonb;
  v_id uuid;
  v_job uuid;
  v_recheck boolean := coalesce(p_recheck, false);
begin
  v_areas := public.ch_ai_request_scope(p_area);
  v_layers := public.ch_dc_layers(p_layers);
  if v_count < 1 or v_count > v_per then
    raise exception 'Escolha de 1 a % rascunhos por pedido (máximo de % por pedido).', v_per, v_per using errcode = '22023';
  end if;
  if v_layers <> array['software'] then
    v_problem := public.ch_ai_function_problem('verificacao');
    if v_problem is not null then raise exception '%', v_problem using errcode = '55000'; end if;
  end if;

  select array_agg(x.id order by x.batch, x.slot), array_agg(x.base_chars order by x.batch, x.slot), array_agg(x.key_chars order by x.batch, x.slot)
    into v_ids, v_base, v_keyed
    from public.ch_dc_pick(p_batch, p_area, v_areas, v_layers, v_recheck, v_count) x;
  if v_ids is null then
    raise exception 'Nenhum rascunho para conferir com estes filtros: todos já têm esta conferência, ou não são de uma área em que você é revisor.' using errcode = '22023';
  end if;

  v_key := public.ch_hash(jsonb_build_object('kind', 'draft_check', 'ids', to_jsonb(v_ids), 'layers', to_jsonb(v_layers), 'recheck', v_recheck));
  select * into v_dup from public.ch_ai_requests r where r.request_key = v_key and r.status in ('na_fila', 'analisando', 'pendente');
  if found then
    return jsonb_build_object('id', v_dup.id, 'duplicate', true, 'status', v_dup.status, 'items', v_dup.item_count, 'estimate_usd', v_dup.estimate_usd);
  end if;

  v_used := public.ch_ai_used_today((select auth.uid()), 'draft_check');
  if v_used + cardinality(v_ids) > v_day then
    raise exception 'Limite de % rascunhos por dia atingido: você já pediu % hoje e este pedido tem %. O limite recomeça amanhã (horário de Brasília).',
      v_day, v_used, cardinality(v_ids) using errcode = '53400';
  end if;

  v_est := public.ch_dc_estimate(v_base, v_keyed, v_layers);
  insert into public.ch_ai_requests (kind, requested_by, request_key, params, target_ids, item_count, estimate_usd, ceiling_usd)
  values ('draft_check', (select auth.uid()), v_key,
          jsonb_build_object('batch', p_batch, 'area', p_area, 'count', v_count, 'layers', to_jsonb(v_layers), 'recheck', v_recheck),
          array(select unnest(v_ids)::text), cardinality(v_ids), (v_est ->> 'typical_usd')::numeric,
          case when v_est ->> 'max_usd' is null then null else round(((v_est ->> 'max_usd')::numeric) * 2, 4) end)
  on conflict (request_key) where status in ('na_fila', 'analisando', 'pendente') do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_dup from public.ch_ai_requests r where r.request_key = v_key and r.status in ('na_fila', 'analisando', 'pendente');
    return jsonb_build_object('id', v_dup.id, 'duplicate', true, 'status', v_dup.status, 'items', v_dup.item_count, 'estimate_usd', v_dup.estimate_usd);
  end if;
  insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts)
  values (null, 'draft_check', 'ai_request:' || v_id::text, 'ai_request:' || v_id::text, '{}'::jsonb, 2)
  returning id into v_job;
  update public.ch_ai_requests set job_id = v_job where id = v_id;
  perform public.ch_log('draft_check.request', v_id::text,
                        jsonb_build_object('batch', p_batch, 'area', p_area, 'items', cardinality(v_ids), 'layers', to_jsonb(v_layers),
                                           'recheck', v_recheck, 'estimate_usd', (v_est ->> 'typical_usd')::numeric, 'job_id', v_job));
  return jsonb_build_object('id', v_id, 'duplicate', false, 'status', 'na_fila', 'items', cardinality(v_ids), 'estimate_usd', (v_est ->> 'typical_usd')::numeric);
end
$$;

-- ---------------------------------------------------------------- tela: pedidos recentes e cancelar
-- Administrador vê os de todos; cada pessoa vê os seus.
create or replace function public.app_ch_ai_requests(p_kind text default null, p_limit integer default 10) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((
    select jsonb_agg(x.item order by x.created_at desc, x.id)
      from (select r.id, r.created_at,
                   (to_jsonb(r) - 'request_key' - 'target_ids')
                   || jsonb_build_object('job_status', j.status, 'job_error', j.error,
                                         'can_cancel', r.status in ('na_fila', 'pendente') and (r.requested_by = (select auth.uid()) or public.is_admin()),
                                         'requested_by_email', case when public.is_admin() then (select u.email from auth.users u where u.id = r.requested_by) end) as item
              from public.ch_ai_requests r
              left join public.ch_jobs j on j.id = r.job_id
             where (p_kind is null or r.kind = p_kind)
               and (public.is_admin() or r.requested_by = (select auth.uid()))
             order by r.created_at desc, r.id
             limit greatest(1, least(coalesce(p_limit, 10), 50))) x), '[]'::jsonb);
end
$$;

-- Cancela o pedido que ainda não começou (na fila ou pendente). Quem pediu ou o administrador.
create or replace function public.app_ch_ai_request_cancel(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.ch_ai_requests;
begin
  perform public.ch_assert_staff();
  select * into r from public.ch_ai_requests where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if r.requested_by <> (select auth.uid()) and not public.is_admin() then
    raise exception 'Só quem fez o pedido ou um administrador pode cancelá-lo.' using errcode = '42501';
  end if;
  if r.status not in ('na_fila', 'pendente') then
    raise exception 'Este pedido já começou ou terminou e não pode ser cancelado.' using errcode = '22023';
  end if;
  update public.ch_ai_requests set status = 'falhou', message = 'Pedido cancelado antes de começar.', finished_at = now() where id = r.id;
  update public.ch_jobs set status = 'dead', error = 'Pedido cancelado antes de começar.', finished_at = now(), locked_at = null
   where id = r.job_id and status in ('queued', 'blocked');
  perform public.ch_log('ai_request.cancel', r.id::text, jsonb_build_object('kind', r.kind, 'items', r.item_count));
  return jsonb_build_object('id', r.id, 'status', 'falhou');
end
$$;

-- ---------------------------------------------------------------- processamento (servidor)
create or replace function public.ch_worker_ai_request_get(p_request_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select to_jsonb(r) from public.ch_ai_requests r where r.id = p_request_id
$$;

-- Só as chaves presentes em p_patch mudam: status, message, done_count, skipped_count, calls, cost_usd, summary. Ao chegar a um
-- estado final (concluido, falhou) grava finished_at e o resultado no registro (ch_audit, em nome de quem pediu).
create or replace function public.ch_worker_ai_request_update(p_request_id uuid, p_patch jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.ch_ai_requests;
  v_old text;
  v_status text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Alteração do pedido inválida.' using errcode = '22023'; end if;
  select * into r from public.ch_ai_requests where id = p_request_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  v_old := r.status;
  v_status := case when p_patch ? 'status' then p_patch ->> 'status' else r.status end;
  if v_status is null or v_status not in ('na_fila', 'analisando', 'concluido', 'falhou', 'pendente') then
    raise exception 'Situação do pedido inválida: %.', v_status using errcode = '22023';
  end if;
  -- pedido que já terminou não volta a andar (cancelado, ou fechado por outra execução)
  if v_old in ('concluido', 'falhou') and v_status not in ('concluido', 'falhou') then return; end if;
  update public.ch_ai_requests
     set status = v_status,
         message = case when p_patch ? 'message' then left(p_patch ->> 'message', 1000) else message end,
         done_count = case when p_patch ? 'done_count' then least(greatest(coalesce((p_patch ->> 'done_count')::integer, 0), 0), item_count) else done_count end,
         skipped_count = case when p_patch ? 'skipped_count' then greatest(coalesce((p_patch ->> 'skipped_count')::integer, 0), 0) else skipped_count end,
         calls = case when p_patch ? 'calls' then greatest(coalesce((p_patch ->> 'calls')::integer, 0), 0) else calls end,
         cost_usd = case when p_patch ? 'cost_usd' then greatest(coalesce((p_patch ->> 'cost_usd')::numeric, 0), 0) else cost_usd end,
         summary = case when p_patch ? 'summary' and jsonb_typeof(p_patch -> 'summary') = 'object' then p_patch -> 'summary' else summary end,
         finished_at = case when v_status not in ('concluido', 'falhou') then null
                            when v_old in ('concluido', 'falhou') and finished_at is not null then finished_at
                            else now() end
   where id = r.id
   returning * into r;
  if r.status in ('concluido', 'falhou') and v_old not in ('concluido', 'falhou') then
    if r.kind = 'question_analysis' then
      insert into public.ch_audit (actor_id, action, target, details)
      values (r.requested_by, 'question_analysis.result', r.id::text,
              jsonb_build_object('status', r.status, 'message', r.message, 'items', r.item_count, 'done', r.done_count, 'skipped', r.skipped_count,
                                 'calls', r.calls, 'cost_usd', r.cost_usd, 'verdicts', r.summary -> 'verdicts'));
    else
      insert into public.ch_audit (actor_id, action, target, details)
      values (r.requested_by, 'draft_check.result', r.id::text,
              jsonb_build_object('status', r.status, 'message', r.message, 'items', r.item_count, 'done', r.done_count, 'skipped', r.skipped_count,
                                 'calls', r.calls, 'cost_usd', r.cost_usd, 'layers', r.summary -> 'layers'));
    end if;
  end if;
end
$$;

-- Tarefa que morre (tentativas esgotadas, ou a própria fila a encerra) fecha o pedido ainda andando como "falhou", com o motivo.
create or replace function public.ch_ai_request_job_dead() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_message text;
begin
  v_message := coalesce(
    nullif(regexp_replace(btrim(coalesce(new.error, '')),
                          '^(Interrompido sem concluir\.)( Falha anterior: Interrompido sem concluir\.)+$', '\1'), ''),
    'A tarefa parou sem concluir.');
  for v_id in
    select r.id from public.ch_ai_requests r where r.job_id = new.id and r.status not in ('concluido', 'falhou')
  loop
    perform public.ch_worker_ai_request_update(v_id, jsonb_build_object('status', 'falhou', 'message', v_message));
  end loop;
  return null;
end
$$;
drop trigger if exists ch_jobs_ai_request_dead on public.ch_jobs;
create trigger ch_jobs_ai_request_dead
  after update of status on public.ch_jobs
  for each row
  when (new.step in ('question_analysis', 'draft_check') and new.status in ('dead', 'failed') and old.status is distinct from new.status)
  execute function public.ch_ai_request_job_dead();

-- Questões do pedido, no mesmo formato de ch_worker_questions_for_analysis (1 sem análise para o conteúdo atual, quando
-- p_only_missing). Nunca devolve questão cuja análise atual já foi publicada ou revisada.
create or replace function public.ch_worker_questions_for_analysis_ids(p_ids text[], p_only_missing boolean default true) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.exam_id, x.number), '[]'::jsonb) from (
    select q.id, q.exam_id, q.number, q.area, q.statement, q.status, q.correct_option, q.images,
           (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text', 'explanation', nullif(btrim(o ->> 'explanation'), '')) order by o ->> 'id') from jsonb_array_elements(q.options) o) as options,
           e.year as exam_year,
           (select jsonb_build_object('answer', a.answer, 'status', a.answer_status, 'source', a.source) from public.question_official_answers a where a.question_id = q.id and a.is_current) as official,
           (select jsonb_build_object('subarea', d.subarea, 'competency', d.competency, 'care_setting', d.care_setting, 'patient_group', d.patient_group,
                     'clinical_decision', d.detail ->> 'clinical_decision', 'concept', d.detail ->> 'correct_answer_concept', 'intent', d.detail ->> 'question_intent',
                     'distractor_patterns', d.detail -> 'distractor_patterns', 'protocol_topics', d.detail -> 'protocol_topics') from public.question_dna d where d.question_id = q.id) as dna,
           public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option)) as basis_hash
    from public.questions q join public.exams e on e.id = q.exam_id
    where q.id = any (p_ids) and q.status <> 'annulled' and q.correct_option is not null
      and not exists (select 1 from public.question_analysis a where a.question_id = q.id and a.is_current and a.status in ('published', 'reviewed'))
      and (not coalesce(p_only_missing, true)
           or not exists (select 1 from public.question_analysis a where a.question_id = q.id and a.is_current
                            and a.basis_hash = public.ch_hash(jsonb_build_object('s', q.statement, 'o', q.options, 'a', q.correct_option))))
    order by q.exam_id, q.number) x
$$;

-- Rascunhos do pedido (mesmas colunas de ch_worker_drafts_for_check). Sem p_force, só os que ainda não têm esta camada
-- conferida para o conteúdo atual.
create or replace function public.ch_worker_drafts_for_check_ids(p_layer text, p_ids uuid[], p_force boolean default false) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.batch, x.slot), '[]'::jsonb) from (
    select d.id, d.batch, d.source_id, d.slot, d.area, d.subarea, d.competency, d.title, d.stem, d.alternatives, d.correct_answer,
           d.explanation, d.alternative_explanations, d.source_citations, d.update_application, d.similarity_to_official,
           d.support_type, d.support_title, d.support_rows, d.clinical_decision, d.key_concepts, d.model, d.content_hash
    from public.draft_questions d
    where d.id = any (p_ids)
      and (coalesce(p_force, false)
           or not exists (select 1 from public.draft_checks c where c.draft_id = d.id and c.layer = p_layer and c.content_hash = d.content_hash))
    order by d.batch, d.slot) x
$$;

-- ---------------------------------------------------------------- triagem dos rascunhos inéditos
-- Sempre a partir das conferências ATUAIS (mesmo conteúdo do rascunho). Devolve {code, rank, blocked, reason}.
create or replace function public.ch_draft_triage(p_draft_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hash text;
  v_n integer;
  v_fail boolean;
  v_issue boolean;
  v_ai boolean;
  v_src text;
  v_blocked boolean;
  v_code text;
  v_rank integer;
  v_reason text;
begin
  select content_hash into v_hash from public.draft_questions where id = p_draft_id;
  select count(*)::int, coalesce(bool_or(c.verdict = 'fail'), false), coalesce(bool_or(c.verdict <> 'pass'), false), coalesce(bool_or(c.layer <> 'software'), false)
    into v_n, v_fail, v_issue, v_ai
    from public.draft_checks c where c.draft_id = p_draft_id and c.content_hash = v_hash;
  select c.verdict into v_src from public.draft_checks c where c.draft_id = p_draft_id and c.layer = 'sources' and c.content_hash = v_hash;
  v_blocked := v_src = 'insufficient'
    or (coalesce(v_src, '') <> 'pass'
        and exists (select 1 from public.draft_checks c, jsonb_array_elements(c.findings) f
                     where c.draft_id = p_draft_id and c.layer = 'software' and c.content_hash = v_hash
                       and f ->> 'code' in ('no_citation', 'third_party_source_only')));
  v_reason := case when v_blocked then 'Sem fonte oficial (nível A a D) para a afirmação central: a aprovação fica bloqueada até haver o documento oficial cadastrado.' end;
  if v_n = 0 then v_code := 'nao_conferida'; v_rank := 5;
  elsif v_fail then v_code := 'reprovada'; v_rank := 1;
  elsif v_blocked then v_code := 'sem_fonte'; v_rank := 2;
  elsif v_issue then v_code := 'com_apontamentos'; v_rank := 3;
  elsif not v_ai then v_code := 'so_regras'; v_rank := 4;
  else v_code := 'sem_apontamentos'; v_rank := 6;
  end if;
  return jsonb_build_object('code', v_code, 'rank', v_rank, 'blocked', coalesce(v_blocked, false), 'reason', v_reason);
end
$$;

-- Lista do painel (parte da versão da 2100): agora com o selo de triagem por rascunho, a contagem por selo e filtro/ordem por
-- selo. p_order: nulo = lote e número; 'problematicos' = reprovadas e sem fonte primeiro; 'limpos' = sem apontamentos primeiro.
drop function if exists public.app_draft_questions(text, text, text, integer, integer);
create or replace function public.app_draft_questions(
  p_batch text default null, p_status text default null, p_area text default null, p_limit integer default 30, p_offset integer default 0,
  p_triage text default null, p_order text default null
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  if p_triage is not null and p_triage not in ('nao_conferida', 'reprovada', 'sem_fonte', 'com_apontamentos', 'so_regras', 'sem_apontamentos') then
    raise exception 'Selo de triagem inválido.' using errcode = '22023';
  end if;
  if p_order is not null and p_order not in ('problematicos', 'limpos') then
    raise exception 'Ordem inválida.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'batches', (select coalesce(jsonb_agg(x order by x ->> 'batch'), '[]'::jsonb) from (
        select jsonb_build_object('batch', batch, 'total', count(*)::int,
          'awaiting', count(*) filter (where status = 'awaiting_medical_review')::int,
          'approved', count(*) filter (where status = 'approved')::int,
          'needs_changes', count(*) filter (where status = 'needs_changes')::int,
          'rejected', count(*) filter (where status = 'rejected')::int) as x
        from public.draft_questions group by batch) b),
    'checks', (select coalesce(jsonb_object_agg(layer, v), '{}'::jsonb) from (
        select c.layer, jsonb_object_agg(c.verdict, c.n) as v from (
          select c.layer, c.verdict, count(*)::int as n from public.draft_checks c
          join public.draft_questions d on d.id = c.draft_id and d.content_hash = c.content_hash
          where p_batch is null or d.batch = p_batch group by c.layer, c.verdict) c group by c.layer) t),
    'triage_counts', (select coalesce(jsonb_object_agg(t.code, t.n), '{}'::jsonb) from (
        select tr ->> 'code' as code, count(*)::int as n
          from public.draft_questions d, lateral public.ch_draft_triage(d.id) tr
         where (p_batch is null or d.batch = p_batch) and (p_status is null or d.status = p_status) and (p_area is null or d.area = p_area)
         group by tr ->> 'code') t),
    'total', (select count(*)::int from public.draft_questions d
              where (p_batch is null or d.batch = p_batch) and (p_status is null or d.status = p_status) and (p_area is null or d.area = p_area)
                and (p_triage is null or public.ch_draft_triage(d.id) ->> 'code' = p_triage)),
    'items', coalesce((select jsonb_agg(to_jsonb(d) - 'content_hash' || jsonb_build_object(
        'can_review', public.ch_is_reviewer(d.area),
        'reviewer', (select email from auth.users where id = d.reviewed_by),
        'review_outdated', d.reviewed_hash is not null and d.reviewed_hash <> d.content_hash,
        'triage', d.tr ->> 'code',
        'triage_rank', (d.tr ->> 'rank')::int,
        'blocked_no_source', (d.tr ->> 'blocked')::boolean,
        'blocked_reason', d.tr ->> 'reason',
        'checks', (select coalesce(jsonb_object_agg(c.layer, jsonb_build_object('verdict', c.verdict, 'findings', c.findings, 'model', c.model,
                     'checked_at', c.checked_at, 'current', c.content_hash = d.content_hash)), '{}'::jsonb)
                   from public.draft_checks c where c.draft_id = d.id)) order by d.ord_rank, d.batch, d.slot)
      from (select dq.*, public.ch_draft_triage(dq.id) as tr,
                   case p_order when 'problematicos' then (public.ch_draft_triage(dq.id) ->> 'rank')::int
                                when 'limpos' then -(public.ch_draft_triage(dq.id) ->> 'rank')::int
                                else 0 end as ord_rank
              from public.draft_questions dq
             where (p_batch is null or dq.batch = p_batch) and (p_status is null or dq.status = p_status) and (p_area is null or dq.area = p_area)
               and (p_triage is null or public.ch_draft_triage(dq.id) ->> 'code' = p_triage)
             order by 12, dq.batch, dq.slot
             limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) d), '[]'::jsonb));
end
$$;

-- Decisão de uma PESSOA (parte da versão da 1800): aprovar fica bloqueado quando o rascunho não tem fonte oficial (nível A a D);
-- pedir ajustes e recusar continuam livres. O resto é igual.
create or replace function public.app_draft_question_decide(p_id uuid, p_decision text, p_note text default null) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_triage jsonb;
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
  if p_decision = 'approved' then
    v_triage := public.ch_draft_triage(d.id);
    if (v_triage ->> 'blocked')::boolean then
      raise exception 'Aprovação bloqueada: este rascunho não tem fonte oficial (nível A a D) para a afirmação central. Cadastre o documento oficial em Fontes oficiais e peça a conferência de novo, ou peça ajustes.' using errcode = '22023';
    end if;
  end if;
  update public.draft_questions set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(),
         review_note = nullif(btrim(p_note), ''), reviewed_hash = d.content_hash where id = p_id;
  perform public.ch_log('draft_question.' || p_decision, p_id::text, jsonb_build_object('hash', d.content_hash));
  return true;
end
$$;

-- ---------------------------------------------------------------- permissões
-- Funções de apoio e do servidor: fechadas para quem chama de fora (só o próprio banco e o serviço).
revoke execute on function public.ch_ai_request_limit(text, text) from public, anon, authenticated;
revoke execute on function public.ch_ai_day_start() from public, anon, authenticated;
revoke execute on function public.ch_ai_used_today(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_ai_request_scope(text) from public, anon, authenticated;
revoke execute on function public.ch_ai_function_problem(text) from public, anon, authenticated;
revoke execute on function public.ch_ai_cost_usd(jsonb, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.ch_qa_pick(text, text, text[], boolean, integer) from public, anon, authenticated;
revoke execute on function public.ch_qa_estimate(integer[]) from public, anon, authenticated;
revoke execute on function public.ch_dc_pick(text, text, text[], text[], boolean, integer) from public, anon, authenticated;
revoke execute on function public.ch_dc_layers(text[]) from public, anon, authenticated;
revoke execute on function public.ch_dc_estimate(integer[], integer[], text[]) from public, anon, authenticated;
revoke execute on function public.ch_draft_triage(uuid) from public, anon, authenticated;
revoke execute on function public.ch_ai_request_job_dead() from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_request_get(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_ai_request_update(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_questions_for_analysis_ids(text[], boolean) from public, anon, authenticated;
revoke execute on function public.ch_worker_drafts_for_check_ids(text, uuid[], boolean) from public, anon, authenticated;
-- Funções da tela: só quem entrou (a conferência de papel fica dentro de cada uma).
revoke execute on function public.app_ch_question_analysis_preview(text, integer, boolean, text) from public, anon;
revoke execute on function public.app_ch_question_analysis_request(text, integer, boolean, text) from public, anon;
revoke execute on function public.app_ch_draft_check_preview(text, text, integer, text[], boolean) from public, anon;
revoke execute on function public.app_ch_draft_check_request(text, text, integer, text[], boolean) from public, anon;
revoke execute on function public.app_ch_ai_requests(text, integer) from public, anon;
revoke execute on function public.app_ch_ai_request_cancel(uuid) from public, anon;
revoke execute on function public.app_draft_questions(text, text, text, integer, integer, text, text) from public, anon;
revoke execute on function public.app_draft_question_decide(uuid, text, text) from public, anon;
