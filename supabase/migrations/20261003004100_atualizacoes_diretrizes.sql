-- =============================================================================
-- Atualizações & Diretrizes: o que mudou nas condutas (antes × agora), o que lembrar para o Revalida e a fonte
-- oficial. Substitui a tela "Materiais oficiais" do app novo.
--
-- Regras (as mesmas do SQIE):
--  * conduta só é apresentada como vigente depois que um revisor médico da área confere no documento oficial
--    e registra o endereço da fonte (review_status = 'approved'); a aprovação fica registrada (quem e quando);
--  * quem publica para o aluno é o administrador; publicado sem conferência mostra o aviso na tela do aluno;
--  * editar o conteúdo depois de conferido volta a revisão para pendente;
--  * nada aqui é escrito pelo navegador: só pelas funções abaixo, com o papel conferido no banco.
--
-- As 19 atualizações do app anterior (src/data/protocolUpdatesData.ts) entram como RASCUNHO para revisão:
-- em 06/10/2026 os 19 endereços oficiais delas davam "página não encontrada" (404), todas traziam o mesmo selo
-- "validado" e a mesma data de verificação, e as 3 questões de prova citadas não conferem com o banco oficial.
-- Esses dados ficam em "legacy" para o revisor; nada disso é mostrado ao aluno.
-- =============================================================================

create table public.guideline_updates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  area public.med_area not null,
  topic text not null check (char_length(btrim(topic)) between 3 and 200),
  subtopic text check (char_length(subtopic) <= 200),
  years smallint[] not null default '{}',
  priority smallint not null default 2 check (priority between 1 and 4),
  publication_label text check (char_length(publication_label) <= 80),
  institution text check (char_length(institution) <= 200),
  document_title text check (char_length(document_title) <= 300),
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_checked_at timestamptz,
  before_text text check (char_length(before_text) <= 4000),
  timeline jsonb not null default '[]'::jsonb check (jsonb_typeof(timeline) = 'array'),
  current_conduct text check (char_length(current_conduct) <= 4000),
  clinical_impact text check (char_length(clinical_impact) <= 4000),
  exam_impact text check (char_length(exam_impact) <= 4000),
  trap text check (char_length(trap) <= 2000),
  search_terms text check (char_length(search_terms) <= 120),
  flashcards jsonb not null default '[]'::jsonb check (jsonb_typeof(flashcards) = 'array'),
  practice_questions jsonb not null default '[]'::jsonb check (jsonb_typeof(practice_questions) = 'array'),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  published boolean not null default false,
  origin text not null default 'manual' check (origin in ('manual', 'legacy_app')),
  legacy jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_status <> 'approved' or (source_url is not null and source_checked_at is not null and reviewed_by is not null))
);
create index guideline_updates_list_idx on public.guideline_updates (published, priority, position);
alter table public.guideline_updates enable row level security;
create policy "atualizações: publicadas para logados; todas para a equipe e revisores" on public.guideline_updates
  for select to authenticated using (published or public.is_staff() or public.ch_is_reviewer());
create trigger guideline_updates_touch before update on public.guideline_updates for each row execute function public.touch_updated_at();

-- Código editorial da área do revisor (mesma regra de question_area_code).
create function public.guideline_area_code(p_area public.med_area) returns text
  language sql immutable set search_path = ''
as $$ select case p_area::text when 'CIRURGIA_GERAL' then 'CIRURGIA' when 'MEDICINA_FAMILIA_COMUNIDADE' then 'MFC' else p_area::text end $$;

-- O que o aluno vê. A fonte só aparece com endereço registrado; "reviewed" só com conferência de revisor.
create function public.guideline_update_view(u public.guideline_updates, p_full boolean) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'slug', u.slug, 'area', u.area, 'area_label', public.area_label(u.area), 'topic', u.topic, 'subtopic', u.subtopic,
    'years', to_jsonb(u.years), 'priority', u.priority, 'publication_label', u.publication_label, 'institution', u.institution,
    'document_title', u.document_title, 'source_url', u.source_url, 'before_text', u.before_text, 'current_conduct', u.current_conduct,
    'reviewed', u.review_status = 'approved', 'reviewed_at', case when u.review_status = 'approved' then u.reviewed_at end,
    'published', u.published, 'updated_at', u.updated_at)
  || case when p_full then jsonb_build_object(
    'timeline', u.timeline, 'clinical_impact', u.clinical_impact, 'exam_impact', u.exam_impact,
    'trap', u.trap, 'flashcards', u.flashcards, 'practice_questions', u.practice_questions, 'search_terms', u.search_terms) else '{}'::jsonb end
$$;

-- Lista do aluno: só publicadas (mesmo para a equipe: a tela mostra o que o aluno vê).
create function public.app_guideline_updates(p_area text default null, p_year integer default null, p_search text default null) returns jsonb
  language sql stable set search_path = ''
as $$
  with pub as (select * from public.guideline_updates u where u.published),
  hit as (
    select * from pub u
    where (nullif(p_area, '') is null or u.area::text = p_area)
      and (p_year is null or p_year::smallint = any (u.years))
      and (nullif(btrim(coalesce(p_search, '')), '') is null
           or public.fold_text(concat_ws(' ', u.topic, u.subtopic, u.institution, u.document_title, u.before_text, u.current_conduct, u.timeline::text))
              like '%' || public.fold_text(btrim(p_search)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*)::int from pub),
    'by_area', (select coalesce(jsonb_object_agg(x.area, x.n), '{}'::jsonb) from (select area, count(*)::int n from pub group by area) x),
    'years', (select coalesce(jsonb_agg(distinct y order by y), '[]'::jsonb) from pub, unnest(pub.years) y),
    'items', coalesce((select jsonb_agg(public.guideline_update_view(h, false) order by h.priority, h.position, h.topic) from hit h), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create function public.app_guideline_update(p_slug text) returns jsonb
  language sql stable set search_path = ''
as $$
  select public.guideline_update_view(u, true) || jsonb_build_object(
    'questions_count', case when nullif(btrim(coalesce(u.search_terms, '')), '') is null then 0
                            else (select count(*)::int from public.practice_pool(jsonb_build_object('area', u.area, 'search', u.search_terms))) end)
  from public.guideline_updates u where u.slug = p_slug
$$;

-- "Treinar questões deste tema": questões oficiais da área com os termos da atualização; sem termos (ou sem achados), a área.
create function public.app_start_guideline_questions(p_slug text, p_count integer default 20) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  u public.guideline_updates;
  v_filters jsonb;
begin
  select * into u from public.guideline_updates where slug = p_slug;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  v_filters := jsonb_build_object('area', u.area);
  if nullif(btrim(coalesce(u.search_terms, '')), '') is not null
     and (select count(*) from public.practice_pool(v_filters || jsonb_build_object('search', u.search_terms))) > 0 then
    v_filters := v_filters || jsonb_build_object('search', u.search_terms);
  end if;
  return public.app_start_session('questoes', v_filters, coalesce(p_count, 20)) || jsonb_build_object('filters', v_filters);
end
$$;

-- ---------------------------------------------------------------- equipe e revisores
create function public.app_admin_guideline_updates() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return jsonb_build_object(
    'is_admin', public.is_admin(),
    'review_areas', (select coalesce(jsonb_agg(e.area), '[]'::jsonb) from unnest(enum_range(null::public.med_area)) as e (area)
                     where public.ch_is_reviewer(public.guideline_area_code(e.area))),
    'items', coalesce((select jsonb_agg(public.guideline_update_view(u, true) || jsonb_build_object(
        'review_status', u.review_status, 'review_note', u.review_note, 'reviewed_at', u.reviewed_at,
        'reviewer', (select nullif(p.name, '') from public.profiles p where p.id = u.reviewed_by),
        'source_checked_at', u.source_checked_at, 'origin', u.origin, 'legacy', u.legacy, 'position', u.position,
        'can_review', public.ch_is_reviewer(public.guideline_area_code(u.area)))
      order by u.published desc, u.priority, u.position, u.topic) from public.guideline_updates u), '[]'::jsonb));
end
$$;

create function public.app_admin_save_guideline_update(p_update jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb := coalesce(p_update, '{}'::jsonb);
  v_old public.guideline_updates;
  v_new public.guideline_updates;
  v_area public.med_area;
  v_timeline jsonb;
  v_years smallint[];
  v_reset boolean := false;
  v_skip constant text[] := array['updated_at', 'updated_by', 'position', 'priority', 'search_terms', 'review_status', 'review_note',
                                  'reviewed_by', 'reviewed_at', 'source_checked_at', 'published', 'legacy', 'created_at'];
begin
  perform public.ch_assert_staff();
  if a ->> 'area' is null or not (a ->> 'area' = any (enum_range(null::public.med_area)::text[])) then raise exception 'Escolha a grande área.' using errcode = '22023'; end if;
  v_area := (a ->> 'area')::public.med_area;
  if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(v_area))) then
    raise exception 'Você revisa outra área: esta atualização é de %.', public.area_label(v_area) using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(a ->> 'topic', ''))) < 3 then raise exception 'Informe o tema.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(a ->> 'source_url', '')), '') is not null and not (btrim(a ->> 'source_url') ~ '^https://') then
    raise exception 'O endereço da fonte precisa começar com https://.' using errcode = '22023';
  end if;
  -- linha do tempo: [{year, text}] com ano de 2000 a 2100 e texto; os anos da atualização saem dela
  select coalesce(jsonb_agg(jsonb_build_object('year', (t ->> 'year')::int, 'text', btrim(t ->> 'text')) order by (t ->> 'year')::int), '[]'::jsonb),
         coalesce(array_agg(distinct (t ->> 'year')::smallint), '{}')
    into v_timeline, v_years
    from jsonb_array_elements(case when jsonb_typeof(a -> 'timeline') = 'array' then a -> 'timeline' else '[]'::jsonb end) t
    where (t ->> 'year') ~ '^\d{4}$'
      and (case when (t ->> 'year') ~ '^\d{4}$' then (t ->> 'year')::int end) between 2000 and 2100
      and nullif(btrim(coalesce(t ->> 'text', '')), '') is not null;

  if nullif(a ->> 'id', '') is not null then
    select * into v_old from public.guideline_updates where id = (a ->> 'id')::uuid for update;
    if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
    v_new := v_old;
  else
    v_new.id := gen_random_uuid();
    v_new.slug := coalesce(nullif(a ->> 'slug', ''), 'atualizacao-' || substr(md5(gen_random_uuid()::text), 1, 10));
    v_new.priority := 2; v_new.position := 0; v_new.review_status := 'pending'; v_new.published := false; v_new.origin := 'manual';
    v_new.legacy := '{}'::jsonb; v_new.flashcards := '[]'::jsonb; v_new.practice_questions := '[]'::jsonb; v_new.created_at := now(); v_new.updated_at := now();
  end if;
  v_new.area := v_area;
  v_new.topic := btrim(a ->> 'topic');
  v_new.subtopic := nullif(btrim(coalesce(a ->> 'subtopic', '')), '');
  v_new.years := v_years;
  v_new.timeline := v_timeline;
  v_new.priority := coalesce((a ->> 'priority')::smallint, v_new.priority);
  v_new.position := coalesce((a ->> 'position')::int, v_new.position);
  v_new.publication_label := nullif(btrim(coalesce(a ->> 'publication_label', '')), '');
  v_new.institution := nullif(btrim(coalesce(a ->> 'institution', '')), '');
  v_new.document_title := nullif(btrim(coalesce(a ->> 'document_title', '')), '');
  v_new.source_url := nullif(btrim(coalesce(a ->> 'source_url', '')), '');
  v_new.before_text := nullif(btrim(coalesce(a ->> 'before_text', '')), '');
  v_new.current_conduct := nullif(btrim(coalesce(a ->> 'current_conduct', '')), '');
  v_new.clinical_impact := nullif(btrim(coalesce(a ->> 'clinical_impact', '')), '');
  v_new.exam_impact := nullif(btrim(coalesce(a ->> 'exam_impact', '')), '');
  v_new.trap := nullif(btrim(coalesce(a ->> 'trap', '')), '');
  v_new.search_terms := nullif(btrim(coalesce(a ->> 'search_terms', '')), '');
  v_new.updated_by := (select auth.uid());
  -- flashcards [{front, back}] e questões de treino [{statement, options[A-D]{id,text,justification}, answer, commentary}]
  if a ? 'flashcards' then
    if jsonb_typeof(a -> 'flashcards') <> 'array' or exists (
         select 1 from jsonb_array_elements(a -> 'flashcards') f
         where char_length(btrim(coalesce(f ->> 'front', ''))) not between 3 and 2000 or char_length(btrim(coalesce(f ->> 'back', ''))) not between 1 and 2000) then
      raise exception 'Cada flashcard precisa de frente e verso (até 2.000 caracteres).' using errcode = '22023';
    end if;
    v_new.flashcards := (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', f ->> 'type', 'front', btrim(f ->> 'front'), 'back', btrim(f ->> 'back')))), '[]'::jsonb)
                         from jsonb_array_elements(a -> 'flashcards') f);
  end if;
  if a ? 'practice_questions' then
    if jsonb_typeof(a -> 'practice_questions') <> 'array' or exists (
         select 1 from jsonb_array_elements(a -> 'practice_questions') q
         where char_length(btrim(coalesce(q ->> 'statement', ''))) < 20 or coalesce(q ->> 'answer', '') not in ('A', 'B', 'C', 'D')
            or jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') <> 4
            or (select count(distinct o ->> 'id') from jsonb_array_elements(q -> 'options') o
                where o ->> 'id' in ('A', 'B', 'C', 'D') and char_length(btrim(coalesce(o ->> 'text', ''))) > 0) <> 4) then
      raise exception 'Cada questão de treino precisa de enunciado, quatro alternativas (A a D) e o gabarito.' using errcode = '22023';
    end if;
    v_new.practice_questions := a -> 'practice_questions';
  end if;

  -- o que o aluno lê mudou: a conferência anterior (aprovada ou recusada) não vale mais
  if v_old.id is not null and v_old.review_status <> 'pending'
     and (to_jsonb(v_new) - v_skip) is distinct from (to_jsonb(v_old) - v_skip) then
    v_new.review_status := 'pending'; v_new.review_note := 'Conteúdo alterado depois da conferência: revisar de novo.';
    v_new.reviewed_by := null; v_new.reviewed_at := null; v_new.source_checked_at := null; v_reset := true;
  end if;

  begin
    if v_old.id is null then
      insert into public.guideline_updates select v_new.*;
    else
      update public.guideline_updates g set
        area = v_new.area, topic = v_new.topic, subtopic = v_new.subtopic, years = v_new.years, timeline = v_new.timeline,
        priority = v_new.priority, position = v_new.position, publication_label = v_new.publication_label, institution = v_new.institution,
        document_title = v_new.document_title, source_url = v_new.source_url, before_text = v_new.before_text,
        current_conduct = v_new.current_conduct, clinical_impact = v_new.clinical_impact, exam_impact = v_new.exam_impact,
        trap = v_new.trap, search_terms = v_new.search_terms, flashcards = v_new.flashcards,
        practice_questions = v_new.practice_questions, updated_by = v_new.updated_by,
        review_status = v_new.review_status, review_note = v_new.review_note, reviewed_by = v_new.reviewed_by,
        reviewed_at = v_new.reviewed_at, source_checked_at = v_new.source_checked_at
        where g.id = v_new.id;
    end if;
  exception when check_violation then
    raise exception 'Dados inválidos: confira os tamanhos dos textos, a prioridade (1 a 4) e o endereço da fonte.' using errcode = '22023';
  when unique_violation then
    raise exception 'Já existe uma atualização com este identificador.' using errcode = '23505';
  end;
  perform public.ch_log('guideline_update.save', v_new.id::text, jsonb_build_object('topic', v_new.topic, 'review_reset', v_reset));
  return (select public.guideline_update_view(u, true) || jsonb_build_object('review_status', u.review_status, 'review_note', u.review_note)
          from public.guideline_updates u where u.id = v_new.id);
end
$$;

-- Conferência médica: só revisor cadastrado na área; aprovar exige a fonte oficial registrada.
create function public.app_admin_review_guideline_update(p_id uuid, p_decision text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  u public.guideline_updates;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into u from public.guideline_updates where id = p_id for update;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_is_reviewer(public.guideline_area_code(u.area)) then
    raise exception 'A conferência médica desta atualização é de um revisor cadastrado em %.', public.area_label(u.area) using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decisão inválida.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Registre o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  if p_decision = 'approve' and (u.source_url is null or u.current_conduct is null) then
    raise exception 'Para aprovar, registre o endereço do documento oficial conferido e a conduta vigente.' using errcode = '22023';
  end if;
  update public.guideline_updates set
    review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    review_note = btrim(p_note), reviewed_by = (select auth.uid()), reviewed_at = now(),
    source_checked_at = case when p_decision = 'approve' then now() end
    where id = p_id;
  perform public.ch_log('guideline_update.' || p_decision, p_id::text, jsonb_build_object('topic', u.topic, 'note', btrim(p_note)));
  return public.app_admin_guideline_updates();
end
$$;

-- Publicar para o aluno é decisão do administrador (sem conferência, a tela do aluno mostra o aviso).
create function public.app_admin_publish_guideline_update(p_id uuid, p_published boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  u public.guideline_updates;
begin
  perform public.assert_admin();
  select * into u from public.guideline_updates where id = p_id for update;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(p_published, false) and u.review_status = 'rejected' then
    raise exception 'Esta atualização foi recusada na conferência médica: corrija e peça nova conferência antes de publicar.' using errcode = '22023';
  end if;
  update public.guideline_updates set published = coalesce(p_published, false) where id = p_id;
  perform public.admin_log(case when coalesce(p_published, false) then 'guideline_update.publish' else 'guideline_update.unpublish' end, p_id::text,
                           jsonb_build_object('topic', u.topic, 'review_status', u.review_status));
  return public.app_admin_guideline_updates();
end
$$;

create function public.app_admin_delete_guideline_update(p_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_topic text;
begin
  perform public.assert_admin();
  delete from public.guideline_updates where id = p_id returning topic into v_topic;
  if v_topic is null then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('guideline_update.delete', p_id::text, jsonb_build_object('topic', v_topic));
  return true;
end
$$;

revoke execute on function public.app_guideline_updates(text, integer, text) from anon;
revoke execute on function public.app_guideline_update(text) from anon;
revoke execute on function public.app_start_guideline_questions(text, integer) from anon;

-- ---------------------------------------------------------------- conteúdo do app anterior (rascunho para revisão)
insert into public.guideline_updates (slug, area, topic, subtopic, years, priority, publication_label, institution, document_title,
  before_text, timeline, current_conduct, clinical_impact, exam_impact, trap, search_terms, flashcards, practice_questions,
  review_status, published, origin, legacy, position)
select x.slug, x.area::public.med_area, x.topic, x.subtopic, array(select jsonb_array_elements_text(x.years)::smallint), x.priority,
       x.publication_label, x.institution, x.document_title, x.before_text, x.timeline, x.current_conduct, x.clinical_impact,
       x.exam_impact, x.trap, x.search_terms, x.flashcards, x.practice_questions, 'pending', false, 'legacy_app', x.legacy, x.position
from jsonb_to_recordset($legado$[{"slug":"prot-go-hpv-dna-2025","area":"GINECOLOGIA_OBSTETRICIA","topic":"Rastreamento do Câncer de Colo do Útero por Teste Molecular DNA-HPV no SUS","subtopic":"Oncologia Ginecológica & Rastreamento na APS","years":[2025,2026],"priority":1,"publication_label":"03/2025 (Revisão 01/2026)","institution":"Ministério da Saúde / CONITEC / INCA","document_title":"PCDT para Prevenção e Rastreamento do Câncer do Colo do Útero — Testagem Molecular DNA-HPV","before_text":"Rastreamento exclusivamente por citopatologia convencional (Papanicolaou) dos 25 aos 64 anos, realizado anualmente e, após dois resultados normais consecutivos, a cada 3 anos.","timeline":[{"year":2025,"text":"Incorporação e início da transição nacional para o Teste Molecular de DNA-HPV de alto risco oncogênico (genotipagem 16 e 18 + pool oncogênico) no SUS como método de escolha de 5 em 5 anos para mulheres de 25 a 64 anos."},{"year":2026,"text":"Publicação das diretrizes de triagem reflexa com citologia em base líquida e conduta direta para colposcopia em genótipos 16/18 positivos mesmo com citologia negativa, além de ampliação da cobertura na Atenção Primária."}],"current_conduct":"Mulheres de 25 a 64 anos realizam Teste de DNA-HPV a cada 5 anos. Se DNA-HPV negativo: repetir em 5 anos. Se HPV 16 ou 18 positivo: colposcopia imediata. Se outros genótipos de alto risco positivos: citologia reflexa (se citologia ASC-US ou pior ➔ colposcopia; se negativa ➔ repetir DNA-HPV em 12 meses).","clinical_impact":"Aumenta a sensibilidade para detecção de lesões precursoras de alto grau (NIC 2/NIC 3) e prolonga com segurança o intervalo de rastreio de 3 para 5 anos nos casos negativos.","exam_impact":"O INEP cobrará o intervalo de 5 anos para teste de DNA-HPV negativo e a indicação direta de colposcopia para genótipos 16 e 18 positivos, contrastando com o antigo fluxo trienal de Papanicolaou.","trap":"Candidatos desatualizados escolherão repetir o exame em 1 ou 3 anos ou indicar colposcopia apenas se a citologia for alterada, esquecendo que HPV 16/18 positivo vai direto para colposcopia.","search_terms":"colo do útero","flashcards":[{"type":"O_QUE_MUDOU","front":"Qual é o intervalo de rastreamento do câncer de colo uterino no SUS quando utilizado o teste molecular de DNA-HPV negativo?","back":"Intervalo de 5 anos (para mulheres de 25 a 64 anos)."},{"type":"PEGADINHA","front":"Mulher de 32 anos realiza teste de DNA-HPV com resultado positivo para genótipo 16 e citologia reflexa negativa. Qual a conduta?","back":"Encaminhar diretamente para Colposcopia (HPV 16 ou 18 positivo indica colposcopia imediata, independente da citologia)."}],"practice_questions":[{"difficulty":"MEDIO","statement":"Mulher de 34 anos, assintomática, comparece à Unidade Básica de Saúde para exame de rotina. Realizou teste molecular de DNA-HPV pelo SUS, que evidenciou presença de HPV tipo 16. A citologia reflexa em meio líquido não revelou atipias celulares. Considerando as diretrizes vigentes do Ministério da Saúde / INCA, qual é a conduta correta?","options":[{"id":"A","text":"Repetir o teste de DNA-HPV em 12 meses.","justification":"Incorreto. Essa conduta é para pool de alto risco não 16/18 com citologia negativa.","old_protocol_trap":false},{"id":"B","text":"Encaminhar a paciente para colposcopia imediata.","justification":"Correto. Pelo protocolo do MS/INCA, a presença de HPV 16 ou 18 confere altíssimo risco oncogênico e impõe colposcopia direta.","old_protocol_trap":false},{"id":"C","text":"Repetir a citologia oncótica convencional em 6 meses.","justification":"Incorreto. Rastreio citológico isolado não deve atrasar a colposcopia no HPV 16.","old_protocol_trap":true},{"id":"D","text":"Prescrever imunoterapia tópica com imiquimode e reavaliar em 1 ano.","justification":"Incorreto. Não há indicação de tratamento tópico em colo sem confirmação histológica de NIC.","old_protocol_trap":false}],"answer":"B","commentary":"No rastreamento com DNA-HPV, a identificação dos genótipos 16 e 18 impõe colposcopia diagnóstica imediata, independentemente do resultado citológico reflexo."}],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/conitec/pt-br/assuntos/avaliacao-de-tecnologias-em-saude/pcdt-rastreamento-hpv-dna","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[{"exam_code":"REV-2022.2-GO-14","claimed_answer":"Alternativa B (Papanicolaou a cada 3 anos após dois normais anuais)","warning":"Atenção: esta questão utilizou a diretriz de citologia trienal vigente em 2022. A conduta atual incorpora o DNA-HPV a cada 5 anos.","matched_question_id":"revalida_2022_2_q014","matched_topic":"Dispareunia"}],"imported_on":"2026-10-06"},"position":1},{"slug":"prot-go-preeclampsia-2025","area":"GINECOLOGIA_OBSTETRICIA","topic":"Prevenção da Pré-Eclâmpsia com AAS e Cálcio em Gestantes de Alto Risco","subtopic":"Obstetrícia de Alto Risco / Síndromes Hipertensivas","years":[2025],"priority":1,"publication_label":"05/2025","institution":"FEBRASGO / Ministério da Saúde","document_title":"Diretrizes de Manejo e Profilaxia da Pré-Eclâmpsia na Gestação","before_text":"Prescrição de ácido acetilsalicílico (AAS) na dose de 100 mg/dia iniciada entre 12 e 16 semanas para gestantes de alto risco, e suplementação de cálcio 1g/dia apenas em áreas de baixa ingesta.","timeline":[{"year":2025,"text":"Padronização da dose de AAS em 150 mg/dia (em tomada noturna única), iniciada entre a 12ª e a 16ª semana (podendo ser iniciada até a 20ª semana) até a 36ª semana, associada a Carbonato de Cálcio 1,5 g a 2,0 g/dia para todas as gestantes com baixa ingesta de cálcio dietético."}],"current_conduct":"Gestantes com alto risco para pré-eclâmpsia (história prévia de PE, hipertensão crônica, DM prévio, DRC, doença autoimune como LES/SAF): AAS 150 mg à noite (12 a 36 semanas) + Carbonato de Cálcio elementar 1,5 g a 2,0 g/dia fracionado (a partir de 12 semanas até o parto).","clinical_impact":"A dose de 150 mg de AAS à noite é superior à dose de 100 mg na inibição da síntese de tromboxano A2 placentário e na redução de pré-eclâmpsia precoce e restrição de crescimento fetal.","exam_impact":"O INEP frequentemente cobra a dose exata e o horário (noturno) de administração do AAS (150 mg à noite) e o rastreamento dos fatores de risco maiores e moderados.","trap":"Assinalar AAS 100 mg pela manhã ou iniciar após 20 semanas; esquecer de prescrever cálcio 1,5g/dia conjuntamente.","search_terms":"pré-eclâmpsia","flashcards":[{"type":"O_QUE_MUDOU","front":"Qual é a dose e o período de uso do AAS para profilaxia de pré-eclâmpsia em gestantes de alto risco segundo as diretrizes atuais?","back":"AAS 150 mg/dia em tomada noturna, iniciado entre 12 e 16 semanas (máximo até 20 sem) e mantido até 36 semanas."}],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.febrasgo.org.br/preeclampsia-profilaxia-2025","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[{"exam_code":"REV-2021-GO-45","claimed_answer":"Alternativa C (AAS 100 mg)","warning":"Atenção: à época da prova de 2021, a dose de 100 mg era aceita. Atualmente, a FEBRASGO e o MS preconizam 150 mg/dia.","matched_question_id":"revalida_2021_1_q045","matched_topic":"Doenças hipertensivas da gestação"}],"imported_on":"2026-10-06"},"position":2},{"slug":"prot-go-vsr-vacina-2025","area":"GINECOLOGIA_OBSTETRICIA","topic":"Vacina Bivalente Materna contra o Vírus Sincicial Respiratório (VSR)","subtopic":"Vacinação da Gestante & Imunização Neonatal","years":[2025,2026],"priority":1,"publication_label":"11/2025 (Edição PNI 2026)","institution":"Ministério da Saúde / PNI / ANVISA / FEBRASGO","document_title":"Nota Técnica PNI/MS — Imunização Materna contra o VSR para Prevenção da Bronquiolite","before_text":"Não existia vacina materna aprovada para prevenção de infecção por VSR no recém-nascido; a proteção era restrita ao palivizumabe em prematuros extremos selecionados.","timeline":[{"year":2025,"text":"Aprovação e recomendação da vacina bivalente contra VSR (proteína F recombinante pré-fusão) para administração em dose única em gestantes entre a 32ª e a 36ª semana de idade gestacional."},{"year":2026,"text":"Inclusão nas estratégias sazonais do SUS para proteção passiva do lactente nos primeiros 6 meses de vida contra doença do trato respiratório inferior associada ao VSR."}],"current_conduct":"Administrar 1 dose da vacina contra VSR para gestantes entre 32 e 36 semanas de gestação (idealmente 32 a 36 semanas), em conjunto com o calendário habitual da gestante (dTpa a partir da 20ª semana, Hepatite B, Influenza e Covid-19).","clinical_impact":"Reduz em mais de 80% o risco de hospitalização por bronquiolite grave e necessidade de UTI neonatal por VSR nos primeiros 90 a 180 dias de vida da criança.","exam_impact":"O INEP poderá questionar a idade gestacional exata para aplicação (32 a 36 semanas) e a via de proteção (imunização passiva via transferência transplacentária de anticorpos IgG).","trap":"Confundir a indicação com palivizumabe ou nirsevimabe (que são aplicados na criança) ou indicar a vacina em primeiro trimestre.","search_terms":"sincicial","flashcards":[{"type":"DATA_PROTOCOLO","front":"Em qual faixa de idade gestacional a vacina materna contra o VSR deve ser aplicada?","back":"Entre a 32ª e a 36ª semana de gestação (dose única IM)."}],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/pni-vacina-vsr-gestantes","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":3},{"slug":"prot-go-hpp-tranexamico-2025","area":"GINECOLOGIA_OBSTETRICIA","topic":"Manejo da Hemorragia Pós-Parto (HPP) e Protocolo Zero Morte Materna","subtopic":"Urgências Obstétricas","years":[2025],"priority":1,"publication_label":"04/2025","institution":"Ministério da Saúde / OPAS / FEBRASGO","document_title":"Estratégia Zero Morte Materna por Hemorragia — Guia de Manejo Clínico da HPP","before_text":"Definição de HPP baseada em perda volumétrica estimada (> 500 mL no parto vaginal e > 1.000 mL na cesariana). Uso tardio de ácido tranexâmico apenas após falha de ocitocina e misoprostol.","timeline":[{"year":2025,"text":"Definição precoce de HPP por perda sanguínea cumulativa ≥ 1.000 mL ou qualquer perda acompanhada de sinais de choque (Índice de Choque = FC / PAS ≥ 0,9). Uso obrigatório de Ácido Tranexâmico 1g IV em 10 minutos NA PRIMEIRA HORA do sangramento (com repetição de 1g se sangramento persistir após 30 min), em paralelo à ocitocina e massagem uterina bimanual."}],"current_conduct":"1) Medida profilática: Ocitocina 10 UI IM no desprendimento do ombro anterior. 2) Se HPP confirmada (ou Índice de Choque ≥ 0,9): Ocitocina IV em infusão + Ácido Tranexâmico 1g IV em 10 min (dentro dos primeiros 60 min) + Massagem bimanual (Hamilton) + Sondagem vesical de alívio. Se atonia refratária: Balão de Tamponamento Intrauterino (Bakri) antes da abordagem cirúrgica.","clinical_impact":"O uso do ácido tranexâmico na 1ª hora reduz a mortalidade por sangramento materno em cerca de 30% sem aumentar eventos tromboembólicos.","exam_impact":"O INEP cobra o cálculo do Índice de Choque (FC/PAS ≥ 0,9 indicando transfusão precoce/gravidade) e a sequência de condutas na atonia uterina (ocitocina + ácido tranexâmico ➔ balão intrauterino ➔ laparotomia/B-Lynch/histerectomia).","trap":"Esperar o resultado laboratorial de hematócrito para iniciar o ácido tranexâmico ou prescrever ergotamina em gestante hipertensa.","search_terms":"hemorragia pós-parto","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/zero-morte-materna-hpp","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":4},{"slug":"prot-ped-vip-vop-2025","area":"PEDIATRIA","topic":"Extinção da VOP (Gotinha) e Transição para Esquema 100% Injetável VIP no PNI","subtopic":"Imunizações na Infância","years":[2025,2026],"priority":1,"publication_label":"01/2025 (Consolidado 2026)","institution":"Ministério da Saúde / Secretaria de Vigilância em Saúde e Ambiente (SVSA) / PNI","document_title":"Informe Técnico PNI/MS — Substituição da Vacina Oral Poliomielite (VOPb) pela Vacina Inativada Poliomielite (VIP)","before_text":"Esquema básico com 3 doses de VIP aos 2, 4 e 6 meses, seguido de 2 doses de reforço com a vacina oral atenuada (VOPb - gotinha) aos 15 meses e aos 4 anos de idade.","timeline":[{"year":2025,"text":"Extinção completa da VOP no Brasil. Os reforços dos 15 meses e 4 anos passaram a ser realizados exclusivamente com a Vacina Inativada Poliomielite (VIP injetável)."},{"year":2026,"text":"Padronização do esquema vacinal 100% VIP de 4 doses: 2 meses (1ª dose), 4 meses (2ª dose), 6 meses (3ª dose) e reforço único aos 15 meses de idade com VIP (eliminação definitiva do reforço dos 4 anos no SUS)."}],"current_conduct":"Esquema contra Poliomielite no SUS: 1ª dose: 2 meses (VIP injetável); 2ª dose: 4 meses (VIP injetável); 3ª dose: 6 meses (VIP injetável); Reforço: 15 meses (VIP injetável). A vacina VOP (gotinha) NÃO É MAIS UTILIZADA no Brasil.","clinical_impact":"Elimina o risco de poliomielite vacinal associada ao vírus atenuado derivado e alinha o Brasil às metas da OMS de erradicação global da poliomielite.","exam_impact":"Questão clássica de calendário vacinal: o INEP cobrará a aplicação de VIP aos 15 meses e a ausência da VOP aos 4 anos.","trap":"Assinalar VOP aos 15 meses ou marcar que a criança de 4 anos ainda precisa tomar a gotinha de reforço.","search_terms":"poliomielite","flashcards":[{"type":"O_QUE_MUDOU","front":"Qual é o esquema vacinal oficial contra Poliomielite no Brasil atualmente?","back":"4 doses de VIP injetável: aos 2, 4, 6 meses e reforço aos 15 meses. A VOP foi extinta."}],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/pni-esquema-vip-exclusivo","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[{"exam_code":"REV-2022.1-PED-19","claimed_answer":"Alternativa B (VOP oral aos 15 meses e aos 4 anos)","warning":"Atenção: esta questão utilizou o calendário antigo com VOP. Atualmente o PNI utiliza 100% VIP injetável.","matched_question_id":"revalida_2022_1_q019","matched_topic":"Gestação ectópica"}],"imported_on":"2026-10-06"},"position":5},{"slug":"prot-ped-nirsevimabe-2025","area":"PEDIATRIA","topic":"Profilaxia do VSR com Nirsevimabe em Recém-Nascidos de Alto Risco","subtopic":"Infectopediatria & Neonatologia","years":[2025,2026],"priority":1,"publication_label":"08/2025 (PCDT MS 2026)","institution":"Ministério da Saúde / CONITEC / Sociedade Brasileira de Pediatria (SBP)","document_title":"PCDT para Prevenção da Infecção Grave pelo Vírus Sincicial Respiratório em Lactentes","before_text":"Uso de Palivizumabe em 5 doses mensais consecutivas intramusculares durante a estação de circulação do VSR para prematuros < 29 semanas e cardiopatas/pneumopatas graves < 2 anos.","timeline":[{"year":2025,"text":"Incorporação do Nirsevimabe (anticorpo monoclonal de meia-vida estendida) no SUS para prematuros < 35 semanas e crianças com cardiopatia congênita com repercussão hemodinâmica ou doença pulmonar crônica da prematuridade."},{"year":2026,"text":"Esquema em dose única intramuscular antes ou no início do período sazonal de circulação do VSR, substituindo progressivamente as 5 aplicações do palivizumabe."}],"current_conduct":"Nirsevimabe em DOSE ÚNICA IM (50 mg para < 5 kg e 100 mg para ≥ 5 kg) no primeiro ano de vida para recém-nascidos prematuros (< 35 semanas) e lactentes de alto risco (cardiopatas e pneumopatas crônicos).","clinical_impact":"Substitui 5 injeções dolorosas mensais por 1 única dose protetora para toda a temporada de circulação do VSR com eficácia superior a 80%.","exam_impact":"O INEP cobrará a posologia em dose única e a indicação nos grupos de risco neonatal.","trap":"Prescrever 5 doses de nirsevimabe (como se fosse palivizumabe) ou não reconhecer a dose única.","search_terms":"sincicial","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/conitec/pcdt-nirsevimabe-lactentes","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":6},{"slug":"prot-ped-bronquiolite-2025","area":"PEDIATRIA","topic":"Diretrizes de Manejo da Bronquiolite Viral Aguda (BVA) na Emergência e APS","subtopic":"Pneumopediatria / Emergências Pediátricas","years":[2025],"priority":1,"publication_label":"06/2025","institution":"Sociedade Brasileira de Pediatria (SBP) / Ministério da Saúde","document_title":"Documento Científico SBP: Atualização no Manejo da Bronquiolite Viral Aguda","before_text":"Muitos serviços ainda realizavam teste terapêutico com broncodilatador inalatório (salbutamol) ou prescreviam nebulização com solução salina hipertônica 3% e corticoides orais.","timeline":[{"year":2025,"text":"Contraindicação estrita do uso de rotina de beta-2 agonistas (salbutamol/fenoterol), corticoides sistêmicos ou inalatórios, solução salina hipertônica e antibióticos em lactentes com primeiro episódio de BVA típica."}],"current_conduct":"O tratamento da BVA é estritamente de suporte: 1) Oxigenoterapia se SpO2 < 90-92% (alvo ≥ 92%); 2) Desobstrução de vias aéreas superiores com soro fisiológico 0,9%; 3) Hidratação e suporte nutricional adequado; 4) Suporte ventilatório não invasivo (CNAF - Cânula Nasal de Alto Fluxo / CPAP) se desconforto moderado a grave. NÃO usar salbutamol, corticoide nem antibiótico.","clinical_impact":"Evita eventos adversos farmacológicos (taquicardia, hipocalemia, efeitos colaterais de corticoides) e custos desnecessários em um quadro viral autoimune autolimitado.","exam_impact":"O INEP coloca casos de lactentes com coriza, febre baixa e sibilância bilateral e tenta induzir o candidato a prescrever nebulização com salbutamol ou prednisolona. A resposta correta é lavagem nasal e oxigênio se necessário.","trap":"Assinalar nebulização com salbutamol ou corticoide sistêmico como 'teste terapêutico'.","search_terms":"bronquiolite","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.sbp.com.br/diretrizes-bronquiolite-2025","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":7},{"slug":"prot-ped-hpv-dose-unica-2025","area":"PEDIATRIA","topic":"Vacina HPV Papilomavírus Humano em Dose Única no Calendário do SUS","subtopic":"Saúde do Adolescente & Imunizações","years":[2025],"priority":1,"publication_label":"04/2025","institution":"Ministério da Saúde / PNI / OPAS","document_title":"Nota Técnica PNI/MS — Adoção do Esquema de Dose Única da Vacina HPV Quadrivalente","before_text":"Esquema de 2 doses (0 e 6 meses) para meninas e meninos de 9 a 14 anos de idade.","timeline":[{"year":2025,"text":"Adoção do esquema de DOSE ÚNICA da vacina HPV quadrivalente para a faixa etária de 9 a 14 anos (9 a 14 anos, 11 meses e 29 dias) para ambos os sexos no SUS."}],"current_conduct":"População geral de 9 a 14 anos: 1 dose única da vacina HPV quadrivalente. Exceção (Imunossuprimidos, pessoas com HIV/aids, transplantados, vítimas de violência sexual e pacientes oncológicos de 9 a 45 anos): manter esquema de 3 doses (0, 2 e 6 meses).","clinical_impact":"Evidências robustas comprovam imunogenicidade e proteção contra infecção persistente e lesões pré-cancerosas com 1 única dose em adolescentes hígidos, ampliando drasticamente a cobertura vacinal.","exam_impact":"O INEP explorará a diferença entre a população geral hígida de 9 a 14 anos (1 dose única) versus imunocomprometidos e vítimas de violência (3 doses: 0, 2 e 6 meses).","trap":"Recomendar 2 doses para adolescente hígido de 12 anos ou aplicar dose única em paciente portador de HIV.","search_terms":"HPV","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/pni-hpv-dose-unica","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":8},{"slug":"prot-cm-has-sbc-2026","area":"CLINICA_MEDICA","topic":"Diretrizes Brasileiras de Hipertensão Arterial 2026 — Terapia Combinada Precoce","subtopic":"Cardiologia & Atenção Primária","years":[2026],"priority":1,"publication_label":"04/2026","institution":"Sociedade Brasileira de Cardiologia (SBC) / SBH / SBN","document_title":"Diretrizes Brasileiras de Hipertensão Arterial Sistêmica — SBC/SBH/SBN 2026","before_text":"Monoterapia inicial em hipertensão estágio 1 de baixo ou moderado risco cardiovascular, reservando combinação dupla apenas para estágio 2/3 ou alto risco.","timeline":[{"year":2025,"text":"Indicação de combinação fixa de dois fármacos em dose baixa para estágio 1 com múltiplos fatores de risco e meta < 130x80 mmHg em alto risco."},{"year":2026,"text":"Consolidação da terapia combinada inicial (dupla terapia em dose fixa única) como primeira escolha para a MAIORIA dos hipertensos (exceto idosos muito frágeis ou hipertensos estágio 1 de muito baixo risco), com meta pressórica < 130/80 mmHg para todos os pacientes de risco cardiovascular moderado ou alto."}],"current_conduct":"Tratamento farmacológico inicial de escolha: Combinação de 2 fármacos de classes diferentes em comprimido único (IECA ou BRA + Bloqueador de Canal de Cálcio OU Diurético Tiazídico). Monoterapia é restrita a hipertensos estágio 1 de baixo risco ou idosos frágeis. Alvo pressórico: < 130/80 mmHg para risco moderado/alto e < 140/90 mmHg para baixo risco.","clinical_impact":"Atingimento da meta pressórica em menor tempo, melhor adesão terapêutica devido ao comprimido único e redução de desfechos cardiovasculares maiores (IAM e AVC).","exam_impact":"O INEP apresentará um paciente estágio 1 com fator de risco (ex: tabagista ou dislipidêmico) e exigirá a combinação de dois anti-hipertensivos em vez de monoterapia.","trap":"Assinalar monoterapia com Enalapril ou Losartana isolados para paciente estágio 1 com risco cardiovascular associado.","search_terms":"hipertensão arterial","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://abccardiol.org/diretriz-has-sbc-2026","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":9},{"slug":"prot-cm-dm2-sbd-2026","area":"CLINICA_MEDICA","topic":"Diretrizes da Sociedade Brasileira de Diabetes (SBD 2026) — Benefício Cardiorrenal dos iSGLT2 e análogos GLP-1","subtopic":"Endocrinologia & Nefrologia","years":[2025,2026],"priority":1,"publication_label":"02/2026","institution":"Sociedade Brasileira de Diabetes (SBD) / CONITEC","document_title":"Diretrizes da Sociedade Brasileira de Diabetes — Edição Oficial 2026","before_text":"Metformina como primeiro degrau obrigatório e isolado em todos os pacientes com DM2, escalonando novas drogas apenas se a meta de HbA1c não fosse atingida após 3 meses.","timeline":[{"year":2025,"text":"Inclusão formal dos inibidores de SGLT2 (Dapagliflozina/Empagliflozina) no SUS para pacientes com DM2 e Insuficiência Cardíaca ou Doença Renal Crônica."},{"year":2026,"text":"Indicação de iSGLT2 ou análogos do receptor de GLP-1 na PRIMEIRA LINHA de tratamento (junto ou até antes da metformina), INDEPENDENTE do valor da HbA1c basal, em qualquer paciente com DM2 que apresente: Doença Cardiovascular Estabelecida (DAC, AVC, DAP), Insuficiência Cardíaca (qualquer fração de ejeção) ou Doença Renal Crônica (RFG 20 a 60 mL/min/1,73m² ou albuminúria > 30 mg/g)."}],"current_conduct":"No paciente com DM2 e IC, DRC ou alto risco cardiovascular: Prescrever iSGLT2 (ex: Dapagliflozina 10 mg/dia) de imediato como cardioproteção e nefroproteção, independente do nível de HbA1c e paralelamente à Metformina e controle de estilo de vida.","clinical_impact":"Redução drástica de internações por descompensação de insuficiência cardíaca, retardo da progressão para diálise e queda na mortalidade cardiovascular global.","exam_impact":"O INEP apresentará caso de paciente com DM2 e albuminúria ou IC compensada com HbA1c quase na meta (ex: 7,1%) e cobrará a introdução de iSGLT2 com foco em proteção de órgãos-alvo.","trap":"Assinalar que não é necessário adicionar medicação porque a glicemia está quase controlada, ignorando o benefício de órgão-alvo do iSGLT2.","search_terms":"diabetes","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://diretriz.diabetes.org.br/edicao-2026","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":10},{"slug":"prot-cm-asma-gina-2026","area":"CLINICA_MEDICA","topic":"Manejo da Asma — Proibição de SABA Isolado e Terapia SMART (GINA / SBPT)","subtopic":"Pneumologia & Atenção Primária","years":[2026],"priority":1,"publication_label":"05/2026","institution":"Global Initiative for Asthma (GINA) / SBPT","document_title":"Relatório Global para Manejo e Prevenção da Asma (GINA 2026) — Adaptação Brasileira","before_text":"Uso de broncodilatador de curta duração isolado (SABA, ex: salbutamol) como medicação de alívio no degrau 1 (asma intermitente).","timeline":[{"year":2025,"text":"Reforço contra o uso de SABA isolado em adolescentes e adultos devido ao risco de dessensibilização de receptores beta e aumento de exacerbações graves."},{"year":2026,"text":"Consolidação da Estratégia Preferencial (Trilha 1 GINA): Corticoide Inalatório em dose baixa associado a Formoterol (CI + Formoterol) como droga de escolha tanto para ALÍVIO de sintomas quanto para MANUTENÇÃO (estratégia SMART) a partir do degrau 1 em todos os pacientes ≥ 12 anos."}],"current_conduct":"Na asma leve (degraus 1 e 2): Corticoide Inalatório + Formoterol sob demanda para alívio dos sintomas. Na asma moderada a grave (degraus 3 a 5): Corticoide Inalatório + Formoterol diário de manutenção e como alívio nas crises (SMART). O uso de Salbutamol isolado em monoterapia é formalmente contraindicado.","clinical_impact":"Reduz em 60-70% as internações e idas a prontos-socorros por crise asmática ao tratar a inflamação de base em toda e qualquer crise sintomática.","exam_impact":"O INEP apresentará paciente com sintomas eventuais de asma e opções com 'Salbutamol de resgate' versus 'Budesonida + Formoterol de resgate'. A alternativa correta é a associação com corticoide inalatório.","trap":"Prescrever salbutamol inalatório isolado para o alívio das crises leves.","search_terms":"asma","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://ginasthma.org/reports-2026","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":11},{"slug":"prot-cm-ic-quadrupla-2025","area":"CLINICA_MEDICA","topic":"Terapia Farmacológica Quádrupla Padrão-Ouro na Insuficiência Cardíaca com FE Reduzida (ICFEr)","subtopic":"Cardiologia & Terapia Intensiva","years":[2025],"priority":1,"publication_label":"03/2025","institution":"Sociedade Brasileira de Cardiologia (SBC) / DEIC","document_title":"Diretriz Brasileira de Insuficiência Cardíaca com Fração de Ejeção Reduzida","before_text":"Tríplice terapia clássica com IECA/BRA + Betabloqueador + Antagonista de Receptor Mineralocorticoide (Espironolactona), introduzindo iSGLT2 apenas em etapas posteriores.","timeline":[{"year":2025,"text":"Indicação formal dos 4 pilares farmacológicos simultâneos ou de rápida titulação na internação ou ambulatorial em todos os pacientes com FEVE ≤ 40%: 1) Sacubitril/Valsartana (ARNI) ou IECA/BRA; 2) Betabloqueador (Carvedilol, Succinato de Metoprolol ou Bisoprolol); 3) Espironolactona; 4) Inibidor de SGLT2 (Dapagliflozina ou Empagliflozina 10mg)."}],"current_conduct":"Quádrupla terapia instituída precocemente para todo paciente com ICFEr sintomático ou assintomático com FEVE ≤ 40%, pois cada pilar atua em uma via fisiopatológica distinta reduzindo mortalidade.","clinical_impact":"A quádrupla terapia reduz em mais de 60% a mortalidade cardiovascular em 2 anos comparada ao tratamento convencional antigo.","exam_impact":"O INEP frequentemente questiona qual fármaco com impacto comprovado na sobrevida está faltando no esquema de um paciente que usa apenas IECA + Betabloqueador (resposta: Espironolactona e/ou Dapagliflozina).","trap":"Confundir diuréticos de alça (Furosemida) como redutor de mortalidade (furosemida melhora sintomas e congestão, mas não reduz sobrevida isoladamente).","search_terms":"insuficiência cardíaca","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://abccardiol.org/diretriz-icfer-sbc-2025","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":12},{"slug":"prot-inf-hiv-dtg-3tc-2025","area":"CLINICA_MEDICA","topic":"PCDT Manejo da Infecção pelo HIV no Adulto — Terapia Dupla DTG + 3TC de Primeira Linha","subtopic":"Infectologia & IST","years":[2025,2026],"priority":1,"publication_label":"02/2025 (Revisão 2026)","institution":"Ministério da Saúde / DATHI / SVSA","document_title":"Protocolo Clínico e Diretrizes Terapêuticas para Manejo da Infecção pelo HIV em Adultos — PCDT HIV","before_text":"Terapia antirretroviral de 1ª linha universalmente composta por 3 fármacos: Tenofovir (TDF) + Lamivudina (3TC) + Dolutegravir (DTG 50mg) em comprimido único diário.","timeline":[{"year":2025,"text":"Aprovação do esquema de terapia dupla DTG 50mg + 3TC 300mg como opção preferencial de primeira linha para pessoas vivendo com HIV virgens de tratamento com carga viral < 500.000 cópias/mL e sem coinfecção por Hepatite B."},{"year":2026,"text":"Disponibilização do comprimido em coformulação única em dose fixa combinada (Dolutegravir + Lamivudina) no SUS e extensão para simplificação terapêutica em pacientes com supressão viral sustentada."}],"current_conduct":"Esquema inicial para PVHIV virgens de tratamento sem coinfecção com Hepatite B e CV < 500.000 cópias/mL: DTG + 3TC (terapia dupla). Se coinfecção com Hepatite B, TB ativa em uso de rifampicina ou CV > 500.000 cópias/mL: manter esquema triplo TDF + 3TC + DTG.","clinical_impact":"Menor toxicidade óssea e renal a longo prazo por eliminar a exposição ao tenofovir nos pacientes elegíveis, mantendo excelente barreira genética.","exam_impact":"O INEP cobrará os critérios de elegibilidade para o esquema duplo (ausência de HBsAg positivo e CV < 500.000) e o manejo da coinfecção com Tuberculose (necessidade de dobrar a dose de Dolutegravir para 50mg de 12/12h devido à indução enzimática pela Rifampicina).","trap":"Prescrever esquema duplo para paciente coinfectado com Hepatite B crônica (onde o Tenofovir é obrigatório para tratar o HBV).","search_terms":"HIV","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/aids/pcdt-hiv-adultos","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":13},{"slug":"prot-inf-dengue-6ed-2025","area":"CLINICA_MEDICA","topic":"Manejo Clínico da Dengue — Guia do Ministério da Saúde 6ª Edição","subtopic":"Infectologia & Urgências na Atenção Primária / UPA","years":[2025],"priority":1,"publication_label":"01/2025","institution":"Ministério da Saúde / SVSA","document_title":"Dengue: Diagnóstico e Manejo Clínico (Adulto e Criança) — 6ª Edição","before_text":"Esquemas com volumes e tempos variáveis de expansão volêmica no Grupo C e uso de salina 0,9% em bolus despadronizados.","timeline":[{"year":2025,"text":"Padronização estrita dos 4 grupos de estadiamento da Dengue: Grupo A (sem sinais de alarme e sem comorbidades), Grupo B (sem alarme mas com risco social/comorbidades/lactentes/gestantes/idosos), Grupo C (com pelo menos 1 sinal de alarme) e Grupo D (dengue grave / choque / sangramento grave / disfunção orgânica)."}],"current_conduct":"Conduta por grupo: Grupo A: Hidratação oral ambulatorial (60 mL/kg/dia, 1/3 soro de reidratação oral e 2/3 líquidos caseiros). Grupo B: Hemograma obrigatório e hidratação oral supervisionada na unidade até resultado. Grupo C (Alarme presente: dor abdominal intensa, vômitos persistentes, hipotensão postural, lipotímia, hepatomegalia > 2cm, hemoconcentração, sangramento de mucosa, letargia): HIDRATAÇÃO VENOSA IMEDIATA com 20 mL/kg em 2 HORAS (soro fisiológico ou ringer lactato) e reavaliação. Grupo D (Choque: PA convergente, TEC > 2s, pulso filiforme): HIDRATAÇÃO VENOSA RÁPIDA com 20 mL/kg em 20 MINUTOS.","clinical_impact":"A hidratação parenteral imediata no Grupo C antes de qualquer exame confirmatório previne a progressão para choque hemorrágico e colapso circulatório.","exam_impact":"O INEP cobra a identificação precisa dos sinais de alarme (Grupo C) e a prescrição exata de 20 mL/kg em 2 horas em leito de observação por no mínimo 48 horas.","trap":"Aguardar sorologia ou teste de antígeno NS1 para iniciar a hidratação parenteral em paciente com sinais de alarme; ou enviar paciente com vômitos incoercíveis para hidratação em casa.","search_terms":"dengue","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/dengue-guia-6ed","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":14},{"slug":"prot-inf-tuberculose-3hp-2025","area":"CLINICA_MEDICA","topic":"Tratamento da Infecção Latente da Tuberculose (ILTB) com Esquema Curto 3HP","subtopic":"Pneumologia & Infectologia","years":[2025,2026],"priority":1,"publication_label":"03/2025","institution":"Ministério da Saúde / CONITEC / Programa Nacional de Controle da Tuberculose","document_title":"PCDT para Controle da Tuberculose e Infecção Latente pelo Mycobacterium tuberculosis","before_text":"Monoterapia com Isoniazida diária por 6 a 9 meses (270 doses) com alta taxa de abandono do tratamento preventivo.","timeline":[{"year":2025,"text":"Adoção do esquema ultracurto 3HP (Rifapentina associada à Isoniazida) administrado em apenas 1 dose por semana durante 12 semanas (total de 12 doses semanais) como tratamento preferencial de primeira linha para ILTB no SUS para maiores de 2 anos."}],"current_conduct":"Na indicação de tratamento de ILTB (contatos domiciliares de TB bacilífera com PPD/IGRA positivo, pessoas vivendo com HIV com CD4 < 350 ou PPD ≥ 5mm, pacientes antes de iniciar imunobiológicos anti-TNF): Prescrever Esquema 3HP (Isoniazida + Rifapentina uma vez por semana por 12 semanas supervisionadas).","clinical_impact":"Aumenta a taxa de adesão e conclusão do tratamento de 50% para mais de 85%, com perfil de segurança e menor hepatotoxicidade que a isoniazida isolada por 9 meses.","exam_impact":"O INEP cobrará o esquema semanal de 12 doses (3HP) e o manejo dos contatos de TB bacilífera pulmonar.","trap":"Assinalar 9 meses de isoniazida diária quando o esquema de 12 semanas com rifapentina + isoniazida estiver disponível.","search_terms":"tuberculose","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/pcdt-tuberculose-iltb","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":15},{"slug":"prot-cir-trauma-atls-2025","area":"CIRURGIA_GERAL","topic":"Ressuscitação Hemostática no Choque Hemorrágico do Trauma (ATLS / SBAIT)","subtopic":"Trauma & Cirurgia de Emergência","years":[2025,2026],"priority":1,"publication_label":"05/2025","institution":"Colégio Americano de Cirurgiões (ATLS) / SBAIT / CBC","document_title":"Diretrizes Brasileiras de Atendimento ao Politraumatizado e Controle de Danos — SBAIT/CBC","before_text":"Infusão agressiva inicial de 2 litros de cristaloide isotônico aquecido antes da administração de hemoderivados.","timeline":[{"year":2025,"text":"Restrição rigorosa de cristaloides: infusão inicial de no máximo 1.000 mL de cristaloide balanceado. Ativação precoce de Protocolo de Transfusão Maciça com proporção balanceada 1:1:1 (1 Concentrado de Hemácias : 1 Plasma Fresco Congelado : 1 Concentrado de Plaquetas) e uso precoce de Ácido Tranexâmico 1g IV em 10 min na PRIMEIRA HORA do trauma."}],"current_conduct":"No paciente politraumatizado chocado: 1) Hipotensão permissiva (alvo de PAS 80-90 mmHg ou PAM 50-60 mmHg até o controle cirúrgico da hemostasia, exceto no TCE grave onde a meta de PAS é ≥ 100-110 mmHg); 2) Ácido Tranexâmico 1g IV em 10 min na 1ª hora + 1g em 8h; 3) Protocolo de transfusão maciça 1:1:1 precoce; 4) Cirurgia de controle de danos se tríade da morte (acidose, hipotermia e coagulopatia).","clinical_impact":"Evita a coagulopatia dilucional induzida por cristaloides e reduz a mortalidade por sangramento exanguinante no trauma grave.","exam_impact":"O INEP cobra a restrição de cristaloides (máximo 1L), o uso do Ácido Tranexâmico na 1ª hora (estudo CRASH-2) e a proporção balanceada de hemoderivados 1:1:1.","trap":"Prescrever 2 a 3 litros de soro fisiológico rápido para paciente com sangramento pélvico ou abdominal ativo em vez de iniciar sangue total ou proporção balanceada 1:1:1.","search_terms":"trauma","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://sbait.org.br/diretrizes-trauma-2025","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":16},{"slug":"prot-cir-sepse-ilas-2026","area":"CIRURGIA_GERAL","topic":"Pacote de 1 Hora da Sepse e Choque Séptico — Diretrizes ILAS / AMIB 2026","subtopic":"Terapia Intensiva & Medicina de Emergência","years":[2026],"priority":1,"publication_label":"06/2026","institution":"Instituto Latino-Americano de Sepse (ILAS) / AMIB","document_title":"Diretrizes Brasileiras para o Manejo da Sepse e Choque Séptico — Edição 2026","before_text":"Pacotes fragmentados de 3 horas e 6 horas; espera pelo término da infusão completa de 30 mL/kg de cristaloides para iniciar vasopressor.","timeline":[{"year":2025,"text":"Foco no Pacote de 1 Hora e uso periférico precoce de noradrenalina em cateter venoso bem posicionado enquanto se providencia o acesso central."},{"year":2026,"text":"Consolidação dos 5 passos essenciais executados na PRIMEIRA HORA de admissão com suspeita de sepse/choque: 1) Dosar lactato sérico (redosar em 2-4h se inicial > 2 mmol/L); 2) Coletar 2 pares de hemoculturas antes do antibiótico; 3) Iniciar antimicrobiano de amplo espectro na primeira hora; 4) Iniciar ressuscitação volêmica com cristaloides balanceados 30 mL/kg para hipotensão ou lactato ≥ 4 mmol/L; 5) Iniciar Noradrenalina precoce (meta de PAM ≥ 65 mmHg) se hipotensão refratária durante a reposição volêmica."}],"current_conduct":"Na suspeita de Sepse com disfunção orgânica (SOFA ≥ 2): Executar integralmente o Pacote de 1 Hora (Lactato + Culturas + Antibiótico na 1ª hora + 30 mL/kg cristaloide + Noradrenalina se PAM < 65 mmHg).","clinical_impact":"Cada hora de atraso no início do antibiótico adequado na sepse com choque aumenta a mortalidade em cerca de 4 a 8%.","exam_impact":"O INEP cobra a sequência cronológica imediata: coleta de culturas antes de administrar o antibiótico de amplo espectro na 1ª hora.","trap":"Esperar a internação em UTI para colher hemoculturas ou iniciar noradrenalina somente após 4 a 6 horas de soro.","search_terms":"sepse","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://ilas.org.br/diretrizes-sepse-2026","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":17},{"slug":"prot-sm-internacao-involuntaria-2025","area":"MEDICINA_FAMILIA_COMUNIDADE","topic":"Legislação e Prazos Obrigatórios da Internação Psiquiátrica Involuntária no Brasil","subtopic":"Saúde Mental & RAPS / Bioética e Legislação Médica","years":[2025,2026],"priority":1,"publication_label":"02/2025","institution":"Ministério da Saúde / Conselho Federal de Medicina (CFM) / Ministério Público","document_title":"Manual de Normas e Procedimentos Ético-Legais da Internação Psiquiátrica Involuntária (Lei 10.216 / Lei 13.840)","before_text":"Dúvidas frequentes entre prazos municipais heterogêneos e leis antigas quanto ao prazo e ao órgão fiscalizador da internação involuntária.","timeline":[{"year":2025,"text":"Uniformização e rigor fiscalizatório: Toda internação involuntária (realizada sem o consentimento do paciente a pedido de terceiros/familiares) deve ser autorizada por médico registrado no CRM e NOTIFICADA OBRIGATORIAMENTE ao Ministério Público Estadual no prazo máximo e improrrogável de 72 HORAS, bem como a sua alta/desinternação."}],"current_conduct":"1) A internação involuntária exige laudo médico circunstanciado registrado no CRM; 2) Deve ser comunicada ao Ministério Público Estadual (MPE) em até 72 horas após o ato; 3) A alta médica também deve ser comunicada ao MPE em até 72 horas; 4) Não depende de autorização judicial prévia, mas está sujeita à fiscalização do MP.","clinical_impact":"Garante proteção aos direitos humanos do paciente psiquiátrico, evita internações asilares abusivas e resguarda a responsabilidade técnica do médico assistente.","exam_impact":"O INEP cobra exatamente o prazo legal (72 horas) e o destinatário obrigatório da comunicação (Ministério Público Estadual, e NÃO o juiz de direito ou conselho tutelar para adultos).","trap":"Assinalar 15 dias, 24 horas ou comunicação ao Ministério Público Federal / Juizado Cível como regra geral.","search_terms":"internação involuntária","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/saude-mental-legislacao-internacao","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":18},{"slug":"prot-sc-notificacao-compulsoria-2026","area":"MEDICINA_FAMILIA_COMUNIDADE","topic":"Lista Nacional de Notificação Compulsória de Doenças, Agravos e Eventos de Saúde Pública 2026","subtopic":"Vigilância Epidemiológica & Saúde Pública","years":[2026],"priority":1,"publication_label":"01/2026","institution":"Ministério da Saúde / Secretaria de Vigilância em Saúde e Ambiente (SVSA)","document_title":"Portaria de Consolidação da Lista Nacional de Notificação Compulsória do SUS — Atualização 2026","before_text":"Lista desatualizada sem inclusão de febre oropouche, síndromes neurológicas pós-arbovirose e novos fluxos de notificação imediata em 24h.","timeline":[{"year":2025,"text":"Inclusão de casos confirmados e óbitos suspeitos por Febre Oropouche e Mpox na lista nacional."},{"year":2026,"text":"Padronização da periodicidade da notificação: 1) IMEDIATA (até 24 horas) para o Ministério da Saúde/Secretarias em agravos graves/epidemias (ex: Botulismo, Cólera, Febre Amarela, Dengue com óbito, Raiva humana, Peste, Varíola dos macacos/Mpox grave, Violência sexual e suicídio tentado); 2) SEMANAL para agravos endêmicos (ex: Tuberculose, Hanseníase, Sífilis adquirida/gestante/congênita, HIV em gestante, Hepatites virais, Acidente de trabalho sem óbito)."}],"current_conduct":"A notificação compulsória é obrigatória a todos os médicos e profissionais de saúde diante da simples SUSPEITA clínica (não necessita de confirmação laboratorial prévia). A notificação de violência sexual e tentativa de suicídio é IMEDIATA (em até 24 horas).","clinical_impact":"Permite a deflagração rápida de bloqueios vacinais, vigilância entomológica e investigações epidemiológicas de surtos pelo SUS.","exam_impact":"O INEP cobra se a notificação deve aguardar o resultado de exames (NÃO! Notifica-se na suspeita) e a distinção entre notificação imediata (24h) versus semanal.","trap":"Assinalar que deve aguardar o isolamento da bactéria ou confirmação sorológica antes de preencher a ficha do SINAN.","search_terms":"notificação compulsória","flashcards":[],"practice_questions":[],"legacy":{"status_label":"VALIDADO_OFICIAL_SUS","last_verification_claim":"2026-08-30","original_url":"https://www.gov.br/saude/lista-nacional-notificacao-compulsoria-2026","original_url_check":{"http_status":404,"checked_on":"2026-10-06"},"cited_questions":[],"imported_on":"2026-10-06"},"position":19}]$legado$::jsonb) as x (
  slug text, area text, topic text, subtopic text, years jsonb, priority smallint, publication_label text, institution text,
  document_title text, before_text text, timeline jsonb, current_conduct text, clinical_impact text, exam_impact text, trap text,
  search_terms text, flashcards jsonb, practice_questions jsonb, legacy jsonb, position integer)
on conflict (slug) do nothing;
