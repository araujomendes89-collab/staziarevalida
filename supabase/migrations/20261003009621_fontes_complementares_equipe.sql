-- =============================================================================
-- Fontes complementares, parte da EQUIPE (APOIO-B). Vem DEPOIS da 20261003009620 (não a edita).
--
-- Regra do dono: as apostilas ("Sangue nos Olhos") valem como fonte para a IA e para a equipe, mas nada que as identifique
-- chega ao aluno. A 9620 filtra o que sai para o aluno. Esta migração faz o lado da equipe:
--   1. CHECAGEM AO SALVAR (gatilhos): o que a equipe digita e o aluno lê não pode citar o nome de uma fonte complementar CADASTRADA.
--      Recusa com a mesma mensagem para todos, administrador inclusive. Só confere o campo que MUDOU (uma edição de outro
--      campo de uma linha antiga que já cita não é barrada). Gravação interna do servidor/worker (sem usuário logado, como
--      ch_worker_*) não é barrada: sai um aviso no log do banco e o texto de IA continua valendo pela conferência do servidor.
--      Tabelas: lessons, guideline_updates, questions, podcasts, podcast_sources (só renomear), app_settings (aviso geral).
--   2. VARREDURA AMPLIADA (app_ch_complementar_mentions): agora olha todos os campos acima e também análise/comentário/
--      cartão, materiais da aula, nome das fontes de podcast, mensagens e resumos do Tutor, estações e o aviso geral. Cada
--      resultado traz tabela, id, campo e um trecho curto, só para o administrador.
--   3. FONTE DE PODCAST: app_admin_podcast_source_complementar passa a ser só do administrador (marcar e voltar a oficial) e
--      grava o nome da fonte no Registro; podcast_admin_view mostra a marca a cada fonte.
--
-- Decisões:
--   * REGRA DO DONO de 2026-10-11: "Sangue nos Olhos" e a palavra "apostila" SOLTAS não barram nada (podem ser texto médico legítimo,
--     como a queixa "sangue nos olhos"). Vale só o que está CADASTRADO na biblioteca como fonte complementar.
--   * A comparação do gatilho NÃO usa ch_complementar_hit: ela também acusa texto que é PARTE do título de uma fonte complementar
--     (ex.: o tema "Pediatria" dentro de "Sangue nos Olhos — Pediatria"), o que barraria texto médico legítimo. O gatilho usa
--     ch_complementar_regex(): o título/órgão de cada fonte complementar da biblioteca como expressão inteira (palavra por
--     palavra) e as siglas cadastradas (ch_sources.aliases), menos os nomes que também são de fonte OFICIAL. O link
--     (ch_url_norm) confere igual ao da biblioteca.
--   * Parte das versões mais novas: app_admin_podcast_source_complementar (9620), podcast_admin_view (4700, ninguém mais redefiniu),
--     app_ch_complementar_mentions (9620). Nenhuma função app_admin_* de salvar é redefinida: tudo por gatilho.
-- Pode ser colada duas vezes sem erro e não apaga nem muda nenhum dado.
-- =============================================================================

-- ---------------------------------------------------------------- 1. termos e expressão
-- Termos (já sem acento nem pontuação) que o texto voltado ao aluno não pode citar: título e órgão das fontes complementares
-- cadastradas e as siglas cadastradas (aliases). Nada fixo: "Sangue nos Olhos" só entra se for o título cadastrado.
create or replace function public.ch_complementar_terms_keys() returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct k.t), '{}'::text[])
  from (
    select x.t from (
      select public.ch_text_key(s.title) as t from public.ch_sources s where s.audience = 'complementar'
      union
      select public.ch_text_key(s.organ) from public.ch_sources s where s.audience = 'complementar'
    ) x
    where char_length(x.t) >= case when position(' ' in x.t) > 0 then 5 else 7 end
      -- nome que também é de fonte oficial não identifica a apostila (evita barrar texto médico legítimo)
      and x.t not in (select public.ch_text_key(o.title) from public.ch_sources o where o.audience = 'oficial'
                      union select public.ch_text_key(o.organ) from public.ch_sources o where o.audience = 'oficial')
    union
    -- siglas e apelidos cadastrados pelo administrador (ch_sources.aliases); mesma proteção contra nome de fonte oficial
    select x.t from (
      select public.ch_text_key(a) as t from public.ch_sources s cross join lateral unnest(s.aliases) a where s.audience = 'complementar'
    ) x
    where char_length(x.t) >= 3
      and x.t not in (select public.ch_text_key(o.title) from public.ch_sources o where o.audience = 'oficial'
                      union select public.ch_text_key(o.organ) from public.ch_sources o where o.audience = 'oficial')
  ) k
$$;

-- Expressão regular (sobre texto sem acento e em minúsculas, ver fold_text) que acha qualquer termo cadastrado como palavra inteira
-- e o link de fonte complementar escrito no texto. A palavra "apostila" solta NÃO entra.
create or replace function public.ch_complementar_regex() returns text
  language sql stable security definer set search_path = ''
as $$
  select '(?:^|[^a-z0-9])(?:' || string_agg(a.alt, '|') || ')(?:[^a-z0-9]|$)'
  from (
    select replace(k, ' ', '[^a-z0-9]+') as alt from unnest(public.ch_complementar_terms_keys()) k
    -- o endereço (link) de uma fonte complementar, escrito dentro do texto
    union all
    select regexp_replace(public.fold_text(btrim(s.url)), '([^a-z0-9])', '\\\1', 'g')
      from public.ch_sources s where s.audience = 'complementar' and char_length(btrim(coalesce(s.url, ''))) >= 12
  ) a
$$;

-- Trecho curto (até uns 150 caracteres) ao redor da primeira citação; nulo quando o texto não cita.
create or replace function public.ch_complementar_snippet(p_text text, p_regex text) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  v_m text[];
begin
  if p_text is null or p_regex is null or p_regex = '' then return null; end if;
  v_m := regexp_match(public.fold_text(p_text), '^(.*?)' || p_regex);
  if v_m is null then return null; end if;
  return btrim(regexp_replace(substr(p_text, greatest(char_length(v_m[1]) - 40, 1), 150), '\s+', ' ', 'g'));
end
$$;

-- O link é o mesmo de uma fonte complementar da biblioteca?
create or replace function public.ch_complementar_url_hit(p_url text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select nullif(btrim(coalesce(p_url, '')), '') is not null
     and exists (select 1 from public.ch_sources s where s.audience = 'complementar' and s.url is not null and public.ch_url_norm(p_url) = public.ch_url_norm(s.url))
$$;

-- ---------------------------------------------------------------- 2. gatilho de checagem ao salvar
-- Argumentos do gatilho: nomes das colunas a conferir. "url:coluna" compara o link com os da biblioteca; "coluna.chave" olha
-- só uma chave de uma coluna jsonb (usado no aviso geral).
create or replace function public.ch_guard_complementar_save() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_regex text;
  v_arg text;
  v_name text;
  v_is_url boolean;
  v_nv jsonb;
  v_text text;
  v_hit boolean;
  i integer;
begin
  if tg_table_name = 'app_settings' and (v_new ->> 'key') is distinct from 'announcement' then return new; end if;
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;
  for i in 0 .. tg_nargs - 1 loop
    v_arg := tg_argv[i];
    v_is_url := v_arg like 'url:%';
    v_name := case when v_is_url then substr(v_arg, 5) else v_arg end;
    v_nv := v_new #> string_to_array(v_name, '.');
    if v_nv is null or jsonb_typeof(v_nv) = 'null' then continue; end if;
    if tg_op = 'UPDATE' and v_nv is not distinct from (v_old #> string_to_array(v_name, '.')) then continue; end if;   -- campo que não mudou
    v_text := v_nv #>> '{}';
    if btrim(coalesce(v_text, '')) = '' then continue; end if;
    if v_is_url then
      v_hit := public.ch_complementar_url_hit(v_text);
    else
      if v_regex is null then v_regex := public.ch_complementar_regex(); end if;
      v_hit := public.fold_text(v_text) ~ v_regex;
    end if;
    if v_hit then
      if (select auth.uid()) is null then
        -- gravação interna (servidor/worker): não barra; o texto de IA já passa pela conferência do servidor
        raise warning 'Texto cita fonte complementar (gravação interna): %.%', tg_table_name, v_name;
      else
        raise exception 'Este texto cita uma fonte complementar cadastrada (o aluno não pode ver). Reescreva sem citar o nome desse material.' using errcode = '22023';
      end if;
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists lessons_guard_complementar on public.lessons;
create trigger lessons_guard_complementar before insert or update of title, topic, instructor, specialty, summary, key_points, guideline_title, guideline_url on public.lessons
  for each row execute function public.ch_guard_complementar_save('title', 'topic', 'instructor', 'specialty', 'summary', 'key_points', 'guideline_title', 'url:guideline_url');

drop trigger if exists guideline_updates_guard_complementar on public.guideline_updates;
create trigger guideline_updates_guard_complementar before insert or update of topic, subtopic, publication_label, institution, document_title, source_url, before_text, timeline,
    current_conduct, clinical_impact, exam_impact, trap, search_terms, flashcards, practice_questions, review_note, legacy on public.guideline_updates
  for each row execute function public.ch_guard_complementar_save('topic', 'subtopic', 'publication_label', 'institution', 'document_title', 'url:source_url', 'before_text', 'timeline',
    'current_conduct', 'clinical_impact', 'exam_impact', 'trap', 'search_terms', 'flashcards', 'practice_questions', 'review_note', 'legacy');

drop trigger if exists questions_guard_complementar on public.questions;
create trigger questions_guard_complementar before insert or update of topic, subtopic, specialty, options, key_finding, expected_conduct, inep_intent, sources on public.questions
  for each row execute function public.ch_guard_complementar_save('topic', 'subtopic', 'specialty', 'options', 'key_finding', 'expected_conduct', 'inep_intent', 'sources');

drop trigger if exists podcasts_guard_complementar on public.podcasts;
create trigger podcasts_guard_complementar before insert or update of title, topic, script, approval_note on public.podcasts
  for each row execute function public.ch_guard_complementar_save('title', 'topic', 'script', 'approval_note');

-- nome da fonte: só ao renomear (o envio do arquivo é do servidor e o nome do arquivo pode ser o da própria apostila, que a
-- equipe marca como complementar)
drop trigger if exists podcast_sources_guard_complementar on public.podcast_sources;
create trigger podcast_sources_guard_complementar before update of title on public.podcast_sources
  for each row execute function public.ch_guard_complementar_save('title');

drop trigger if exists app_settings_guard_complementar on public.app_settings;
create trigger app_settings_guard_complementar before insert or update of value on public.app_settings
  for each row execute function public.ch_guard_complementar_save('value.title', 'value.text');

-- ---------------------------------------------------------------- 3. fonte de podcast: marcar / voltar a oficial (só administrador)
-- Parte da 9620 (staff); agora só o administrador e com o nome da fonte no Registro. Vale também com o episódio publicado
-- (marcar só esconde da transcrição do aluno).
create or replace function public.app_admin_podcast_source_complementar(p_source_id uuid, p_complementar boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_podcast uuid;
  v_title text;
  v_before boolean;
begin
  perform public.assert_admin();
  select podcast_id, title, complementar into v_podcast, v_title, v_before from public.podcast_sources where id = p_source_id;
  if v_podcast is null then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  update public.podcast_sources set complementar = coalesce(p_complementar, false) where id = p_source_id;
  perform public.admin_log('podcast.source_complementar', v_podcast::text,
    jsonb_build_object('source', p_source_id, 'title', v_title, 'from', case when v_before then 'complementar' else 'oficial' end,
                       'to', case when coalesce(p_complementar, false) then 'complementar' else 'oficial' end));
  return public.podcast_admin_view(v_podcast);
end
$$;

-- Episódio para a equipe: parte da 20261003004700; cada fonte ganha 'complementar' (a marca) e 'student_hidden' (o aluno não a vê:
-- marcada à mão ou com nome, arquivo ou SHA-256 que bate com uma fonte complementar da biblioteca).
create or replace function public.podcast_admin_view(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select to_jsonb(p) || jsonb_build_object(
    'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id),
    'approved_by_name', (select coalesce(nullif(pr.name, ''), u.email) from auth.users u left join public.profiles pr on pr.id = u.id where u.id = p.approved_by),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title, 'url', s.url, 'lesson_id', s.lesson_id, 'pages', s.pages, 'chars', s.chars, 'storage_path', s.storage_path,
                                          'chunks', (select count(*)::int from public.podcast_chunks c where c.source_id = s.id), 'created_at', s.created_at,
                                          'complementar', s.complementar,
                                          'student_hidden', (s.complementar or public.ch_complementar_hit(s.title, s.url) or public.ch_complementar_file(s.sha256, s.storage_path)))
                       order by s.position, s.created_at)
      from public.podcast_sources s where s.podcast_id = p.id), '[]'::jsonb),
    'chunks_total', (select count(*)::int from public.podcast_chunks c where c.podcast_id = p.id),
    'cited', coalesce((
      select jsonb_object_agg(c.id::text, jsonb_build_object('source', s.title, 'page', c.page, 'excerpt', left(c.text, 600)))
      from public.podcast_chunks c join public.podcast_sources s on s.id = c.source_id
      where c.podcast_id = p.id
        and c.id in (select (jsonb_array_elements_text(l -> 'sources'))::bigint from jsonb_array_elements(coalesce(p.script -> 'lines', '[]'::jsonb)) l)), '{}'::jsonb))
  from public.podcasts p where p.id = p_id
$$;

-- ---------------------------------------------------------------- 4. varredura ampliada (só administrador)
-- Texto que JÁ está gravado e cita o título/órgão/sigla de fonte complementar cadastrada ("apostila" e "Sangue nos Olhos" soltos não entram).
-- Cada item: kind (tipo), tabela, id, campo (nome em português), onde (descrição), aba (onde a equipe edita), item (qual abrir),
-- trecho (uns 150 caracteres), publicado. Não lista o campo que a 9620 já esconde do aluno (diretriz/documento que bate com a biblioteca,
-- material da aula escondido, fonte de podcast marcada como complementar).
-- Pode ter falso positivo (um órgão com nome comum, por exemplo): a equipe lê e decide. No máximo 600 itens; mensagens do Tutor:
-- as 300 respostas mais recentes.
create or replace function public.app_ch_complementar_mentions() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_re text;
begin
  perform public.assert_admin();
  v_re := public.ch_complementar_regex();
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', r.kind, 'tabela', r.tabela, 'id', r.id, 'campo', r.campo, 'onde', r.onde, 'aba', r.aba, 'item', r.item,
                                        'trecho', r.trecho, 'publicado', r.publicado) order by r.kind, r.onde, r.campo, r.id)
    from (
      select * from (
        -- questões
        select 'questao'::text as kind, 'questions'::text as tabela, q.id::text as id, f.campo, ('Questão ' || q.code)::text as onde, 'questoes'::text as aba, q.id::text as item,
               true as publicado, false as escondido, public.ch_complementar_snippet(f.txt, v_re) as trecho
          from public.questions q cross join lateral (values
            ('Tema', q.topic), ('Subtema', q.subtopic), ('Especialidade', q.specialty), ('Enunciado', q.statement),
            ('Alternativas e explicações', q.options::text), ('Achado-chave', q.key_finding), ('Conduta esperada', q.expected_conduct),
            ('O que a questão avalia', q.inep_intent), ('Fontes', q.sources::text)) as f (campo, txt)
        union all
        -- análise, comentário e cartão de atualização publicados
        select 'analise', 'question_analysis', a.question_id, 'Análise publicada', 'Análise publicada da questão ' || a.question_id, 'central', a.question_id, true, false,
               public.ch_complementar_snippet(concat_ws(' ', a.question_core, a.trap, a.golden_rule, a.key_data::text,
                 (select string_agg(concat_ws(' ', o.reasoning, o.why_plausible, o.why_wrong, o.when_correct, o.concept_difference, o.trap), ' ')
                    from public.question_option_analysis o where o.analysis_id = a.id)), v_re)
          from public.question_analysis a where a.is_current and a.status = 'published'
        union all
        select 'comentario', 'question_comments', c.analysis_id::text, 'Comentário publicado', 'Comentário publicado da questão ' || c.question_id, 'central', c.question_id, true, false,
               public.ch_complementar_snippet(c.content::text, v_re)
          from public.question_comments c where c.status = 'published'
        union all
        select 'cartao', 'question_update_cards', k.question_id, 'Cartão de atualização', 'Cartão de atualização publicado da questão ' || k.question_id, 'central', k.question_id, true, false,
               public.ch_complementar_snippet(concat_ws(' ', k.what_changed, k.why_it_matters, k.options_affected::text), v_re)
          from public.question_update_cards k where k.status = 'published'
        union all
        -- aulas e materiais
        select 'aula', 'lessons', l.id::text, f.campo, 'Aula: ' || l.title, 'aulas', l.id::text, l.published, f.escondido, public.ch_complementar_snippet(f.txt, v_re)
          from public.lessons l cross join lateral (values
            ('Título', l.title, false), ('Tema', l.topic, false), ('Professor', l.instructor, false), ('Especialidade', l.specialty, false),
            ('Resumo', l.summary, false), ('Pontos-chave', array_to_string(l.key_points, ' | '), false),
            ('Título da diretriz', l.guideline_title, l.guideline_hidden), ('Link da diretriz', l.guideline_url, l.guideline_hidden)) as f (campo, txt, escondido)
        union all
        select 'material_aula', 'lesson_materials', m.id::text, 'Título do material', 'Material da aula: ' || l.title, 'aulas', l.id::text, l.published, m.hidden_from_student,
               public.ch_complementar_snippet(coalesce(m.title, '') || ' ' || coalesce(m.url, ''), v_re)
          from public.lesson_materials m join public.lessons l on l.id = m.lesson_id
        union all
        -- atualizações e diretrizes
        select 'atualizacao', 'guideline_updates', u.id::text, f.campo, 'Atualização: ' || u.topic, 'atualizacoes', u.id::text, u.published, f.escondido, public.ch_complementar_snippet(f.txt, v_re)
          from public.guideline_updates u cross join lateral (values
            ('Tema', u.topic, false), ('Subtema', u.subtopic, false), ('Rótulo da publicação', u.publication_label, false),
            ('Instituição', u.institution, u.source_hidden), ('Título do documento', u.document_title, u.source_hidden), ('Link do documento', u.source_url, u.source_hidden),
            ('Antes', u.before_text, false), ('Linha do tempo', u.timeline::text, false), ('Conduta atual', u.current_conduct, false),
            ('Impacto clínico', u.clinical_impact, false), ('Impacto na prova', u.exam_impact, false), ('Pegadinha', u.trap, false),
            ('Termos de busca', u.search_terms, false), ('Flashcards', u.flashcards::text, false), ('Questões de treino', u.practice_questions::text, false),
            ('Nota da conferência', u.review_note, false), ('Dados do app antigo', u.legacy::text, false)) as f (campo, txt, escondido)
        union all
        -- podcasts
        select 'podcast', 'podcasts', p.id::text, f.campo, 'Podcast: ' || p.title, 'podcasts', p.id::text, p.status = 'published', false, public.ch_complementar_snippet(f.txt, v_re)
          from public.podcasts p cross join lateral (values
            ('Título', p.title), ('Tema', p.topic), ('Falas do roteiro', p.script::text), ('Nota da aprovação', p.approval_note)) as f (campo, txt)
        union all
        select 'fonte_podcast', 'podcast_sources', s.id::text, 'Nome da fonte', 'Fonte do podcast: ' || p.title, 'podcasts', p.id::text, p.status = 'published', s.complementar,
               public.ch_complementar_snippet(coalesce(s.title, '') || ' ' || coalesce(s.url, ''), v_re)
          from public.podcast_sources s join public.podcasts p on p.id = s.podcast_id
        union all
        -- Tutor (conversas dos alunos)
        select 'tutor_resumo', 'tutor_sessions', ts.id::text, 'Resumo da conversa', 'Conversa do Tutor: ' || ts.title, 'tutor', ts.id::text, true, false,
               public.ch_complementar_snippet(ts.summary::text, v_re)
          from public.tutor_sessions ts where ts.summary is not null
        union all
        select 'tutor_mensagem', 'tutor_messages', m.id::text, 'Resposta do Tutor', 'Conversa do Tutor (resposta)', 'tutor', m.session_id::text, true, false,
               public.ch_complementar_snippet(m.content || ' ' || m.meta::text, v_re)
          from (select * from public.tutor_messages where role = 'tutor' order by id desc limit 300) m
        union all
        -- estações
        select 'estacao', 'checklist_station_contents', c.station_id, 'Roteiro e impressos', 'Estação: ' || st.name, 'estacoes', c.station_id, st.medical_review = 'approved', false,
               public.ch_complementar_snippet(c.content::text, v_re)
          from public.checklist_station_contents c join public.checklist_stations st on st.id = c.station_id
        union all
        -- aviso geral
        select 'aviso', 'app_settings', a.key, 'Aviso geral', 'Aviso geral para os alunos', 'configuracoes', a.key, coalesce((a.value ->> 'active')::boolean, false), false,
               public.ch_complementar_snippet(concat_ws(' ', a.value ->> 'title', a.value ->> 'text'), v_re)
          from public.app_settings a where a.key = 'announcement'
      ) x
      where x.trecho is not null and not x.escondido   -- o que a 9620 já esconde do aluno não precisa de correção
      order by x.kind, x.onde, x.campo
      limit 600
    ) r
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 99. permissões
do $perm$
begin
  -- internas: só o banco chama
  revoke execute on function public.ch_complementar_terms_keys() from public, anon, authenticated;
  revoke execute on function public.ch_complementar_regex() from public, anon, authenticated;
  revoke execute on function public.ch_complementar_snippet(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_complementar_url_hit(text) from public, anon, authenticated;
  revoke execute on function public.ch_guard_complementar_save() from public, anon, authenticated;
  revoke execute on function public.podcast_admin_view(uuid) from public, anon, authenticated;
  -- telas
  revoke execute on function public.app_admin_podcast_source_complementar(uuid, boolean) from public, anon;
  revoke execute on function public.app_ch_complementar_mentions() from public, anon;
end
$perm$;
