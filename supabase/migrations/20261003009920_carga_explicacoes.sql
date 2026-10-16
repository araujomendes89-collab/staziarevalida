-- =============================================================================
-- Carga das explicações das questões (pedido do dono de 2026-10-12). Os agentes Professor e Auditor escrevem, para as 1.300
-- questões oficiais: a explicação da A, B, C e D, a conduta esperada, "o que a questão avalia", o tema e o subtema; nas ANULADAS,
-- explicações de estudo ("Defensável." ou "Incorreta.", nunca "Correta."); nas DESATUALIZADAS, a nota "O que mudou desde a prova".
-- Esta migração é só a ESTRUTURA. Os textos vêm depois, uma parte por prova, geradas por scripts/carga-explicacoes/gerar-sql.mjs.
--
-- Onde cada texto fica (nada de estrutura paralela; os mesmos campos que a correção do aluno e o Tutor já leem):
--   explicação da A a D      → questions.options[].explanation (o texto da alternativa, o gabarito e a situação NÃO mudam)
--   conduta esperada         → questions.expected_conduct
--   o que a questão avalia   → questions.inep_intent
--   tema / subtema           → questions.topic / questions.subtopic (texto livre, como hoje; a Taxonomia Médica oficial vai
--                              reclassificar depois com ids estáveis, a partir do texto e do perfil; o texto antigo fica no histórico)
--   nota "O que mudou"       → question_update_notes (NOVA, uma por questão; só vai ao aluno aprovada por uma pessoa)
--   o que o Auditor apontou  → questions.comment_review -> 'carga' (só a equipe e o revisor médico leem; sai quando o revisor decide)
--   campos internos dos agentes (perfil, pontos de atenção, confiança, conferir diretriz, suspeita de gabarito, motivo provável da
--   anulação) NÃO vão para nenhum texto do aluno; o perfil é carregado pelo ramo da similaridade.
-- Histórico: toda troca de texto da questão passa pelo gatilho questions_change_trail (…9702), com o motivo "Carga das
-- explicações …"; a nota tem o seu registro no mesmo histórico (campo update_note).
--
-- Regras no banco (não só na tela):
--   * a carga é colada pelo dono no editor SQL do Supabase (question_explanations_apply, fechada ao app). Questão que não existe,
--     ou com gabarito ou situação diferente do que o Professor usou, é PULADA e listada (o gabarito nunca muda por aqui).
--     Texto novo ou alterado entra como "comentário em revisão": o aluno não vê até o revisor médico da área ou o administrador
--     aprovar. Texto igual ao que já está não volta para a revisão: colar de novo não muda nada (nem desfaz aprovação).
--   * regra B (opcional, o dono decide na hora de publicar): question_explanations_release libera direto ao aluno as questões de
--     uma lista que vieram da carga, se o texto ainda é o da carga, sem devolução e sem decisão anterior de revisor médico.
--   * "Aprovar a prova inteira" (app_admin_comment_review_approve_exam): revisor médico (só as questões das áreas dele) ou
--     administrador, com a nota do que conferiu e a conferência de que a lista da prova não mudou desde que a pessoa a abriu.
--     Grava uma decisão por questão (question_comment_reviews) e uma linha no Registro de ações (question.comment_approved_exam).
--     Nunca automático; as devolvidas ficam de fora; a nota "O que mudou desde a prova" não entra (é aprovada uma a uma).
--   * questão ANULADA: o aluno vê as explicações de estudo das quatro letras só quando TODAS começam com "Defensável." ou
--     "Incorreta." e nenhuma está em revisão (o texto antigo, escrito para a letra guardada, não sai). Continua fora de acertos
--     e erros (is_correct nulo), como na …7700.
--   * nota "O que mudou desde a prova": só aprovada por uma pessoa (revisor médico da área ou administrador; a importação nunca
--     aprova). Texto mudou, a aprovação cai. Se o quadro "Fontes vinculadas" (…9900) já mostra ao aluno uma nota aprovada da
--     referência atual, esta não aparece (sem repetir).
--
-- Funções redefinidas (partindo da versão mais nova): ch_raw_practice_correction_view (…9801) e app_admin_comment_review_queue
-- (…9701). Novas: question_update_note_clean, question_update_notes_guard, question_update_notes_trail, question_update_note_visible,
-- question_annulled_study_notes, question_explanations_fingerprint, question_read_fingerprint, question_explanations_apply,
-- question_explanations_release, question_comment_review_exam_rows (internas) e app_admin_comment_review_exams,
-- app_admin_comment_review_exam, app_admin_comment_review_approve_exam, app_admin_question_update_note,
-- app_admin_question_update_note_save, app_admin_question_update_note_decide (equipe e revisores médicos).
--
-- DEPENDE de: leva 3 (…9701, …9702) e leva 4 (…9801). Se a …9701 ou a …9801 forem coladas de novo, cole esta de novo depois.
-- Pode ser colada várias vezes (if not exists, create or replace, drop ... if exists).
-- Para desfazer: recriar ch_raw_practice_correction_view como na …9801 e app_admin_comment_review_queue como na …9701; apagar as
-- funções novas e a tabela question_update_notes (os textos carregados ficam; o histórico guarda os de antes).
-- =============================================================================

do $guard$
begin
  if to_regprocedure('public.question_hidden_fields(jsonb, jsonb)') is null
     or to_regprocedure('public.question_comment_fields(jsonb, text, text)') is null
     or to_regprocedure('public.question_comment_assert_access()') is null
     or to_regprocedure('public.app_admin_question_history(text, integer, integer)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'origin') then
    raise exception 'Cole antes a leva 3 (…9701 e …9702) e a leva 4 (…9801): esta migração parte delas.' using errcode = '55000';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- nota "O que mudou desde a prova" (uma por questão)
-- status: em_revisao (o aluno não vê) | aprovada (o aluno vê; precisa de pessoa e data) | devolvida (o aluno não vê; nota para quem
-- escreveu). origin: professor (veio da carga) | equipe (escrita ou mudada na Administração; a carga não passa por cima).
-- decided_by sem chave estrangeira: apagar a conta de quem aprovou não pode travar nem desfazer nada.
create table if not exists public.question_update_notes (
  question_id text primary key references public.questions (id) on delete cascade,
  note text not null check (char_length(note) between 10 and 1500),
  status text not null default 'em_revisao' check (status in ('em_revisao', 'aprovada', 'devolvida')),
  origin text not null default 'equipe' check (origin in ('professor', 'equipe')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) between 10 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists question_update_notes_status_idx on public.question_update_notes (status);
-- o aluno e o visitante não leem a tabela; a equipe também não lê direto: tudo pelas funções abaixo
alter table public.question_update_notes enable row level security;
revoke all on table public.question_update_notes from public, anon, authenticated;

-- O texto da nota como fica guardado: uma linha só, sem o título do bloco ("O que mudou desde a prova:"), que a tela já mostra.
create or replace function public.question_update_note_clean(p_note text) returns text
  language sql immutable set search_path = ''
as $$
  select case when x.t = '' then null else upper(left(x.t, 1)) || substr(x.t, 2) end
  from (select btrim(regexp_replace(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '^o que mudou desde a prova\s*:\s*', '', 'i')) as t) x
$$;
revoke execute on function public.question_update_note_clean(text) from public, anon, authenticated;

create or replace function public.question_update_notes_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.note := public.question_update_note_clean(new.note);
  if new.note is null then
    raise exception 'A nota "O que mudou desde a prova" não pode ficar vazia (para tirar a nota, apague-a).' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.note is distinct from old.note then
    -- texto novo: a aprovação (ou a devolução) era do texto antigo
    new.status := 'em_revisao';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
  end if;
  if new.status = 'aprovada' and (tg_op = 'INSERT' or old.status is distinct from 'aprovada') and (new.decided_by is null or new.decided_at is null) then
    raise exception 'A nota "O que mudou desde a prova" só vai ao aluno aprovada por uma pessoa (revisor médico da área ou administrador).' using errcode = '22023';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end
$$;
revoke execute on function public.question_update_notes_guard() from public, anon, authenticated;
drop trigger if exists question_update_notes_guard on public.question_update_notes;
create trigger question_update_notes_guard before insert or update on public.question_update_notes
  for each row execute function public.question_update_notes_guard();

-- Histórico: a troca do texto da nota entra no histórico da questão (campo update_note, antes e depois), com o mesmo motivo.
create or replace function public.question_update_notes_trail() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_qid text;
  v_de text;
  v_para text;
begin
  if tg_op = 'INSERT' then
    v_qid := new.question_id;
    v_para := new.note;
  elsif tg_op = 'UPDATE' then
    v_qid := new.question_id;
    v_de := old.note;
    v_para := new.note;
  else
    v_qid := old.question_id;
    v_de := old.note;
  end if;
  if v_de is not distinct from v_para then return null; end if;
  -- questão apagada (a nota sai junto, por cascata): o histórico dela também sai
  if not exists (select 1 from public.questions x where x.id = v_qid) then return null; end if;
  insert into public.question_change_log (question_id, changed_by, reason, changes)
  values (v_qid, (select auth.uid()), nullif(current_setting('sqie.reason', true), ''),
          jsonb_build_object('update_note', jsonb_build_object('de', v_de, 'para', v_para)));
  return null;
end
$$;
revoke execute on function public.question_update_notes_trail() from public, anon, authenticated;
drop trigger if exists question_update_notes_trail on public.question_update_notes;
create trigger question_update_notes_trail after insert or update or delete on public.question_update_notes
  for each row execute function public.question_update_notes_trail();

-- A nota que o aluno vê (nulo = nenhuma): aprovada por pessoa e, com as Fontes vinculadas (…9900) no banco, só se o quadro
-- "Fontes vinculadas" não mostra ao aluno uma nota aprovada da referência atual (mesma regra do quadro: questão não anulada e não
-- recolhida). A consulta às Fontes vinculadas é dinâmica: esta migração não depende daquele ramo e funciona antes ou depois dele.
create or replace function public.question_update_note_visible(p_question_id text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_note text;
  v_link boolean := false;
begin
  select n.note into v_note from public.question_update_notes n
   where n.question_id = p_question_id and n.status = 'aprovada' and n.decided_at is not null;
  if v_note is null then return null; end if;
  if to_regclass('public.question_source_links') is not null and to_regprocedure('public.question_source_link_hidden(uuid)') is not null then
    execute 'select exists (select 1 from public.question_source_links l join public.questions q on q.id = l.question_id
                             where l.question_id = $1 and l.temporal = ''vigente'' and l.update_note is not null
                               and q.status <> ''annulled'' and q.retired_at is null
                               and public.question_source_link_hidden(l.id) is null)'
      into v_link using p_question_id;
    if v_link then return null; end if;
  end if;
  return v_note;
end
$$;
revoke execute on function public.question_update_note_visible(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- anuladas: explicações de estudo
-- As quatro letras, só quando TODAS começam com "Defensável." ou "Incorreta." (nenhuma "Correta.") e nenhuma está escondida
-- (comentário em revisão ou marca de troca de gabarito). Fora disso, lista vazia: o texto antigo de uma anulada não sai.
create or replace function public.question_annulled_study_notes(p_status text, p_options jsonb, p_hidden text[]) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case
    when p_status = 'annulled'
     and (select count(distinct o ->> 'id')
          from jsonb_array_elements(case when jsonb_typeof(p_options) = 'array' then p_options else '[]'::jsonb end) o
          where o ->> 'id' in ('A', 'B', 'C', 'D')
            and not (('explanation_' || (o ->> 'id')) = any (coalesce(p_hidden, '{}'::text[])))
            and btrim(coalesce(o ->> 'explanation', '')) ~ '^(Defensável|Incorreta)\.\s*\S') = 4
    then (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', btrim(o ->> 'explanation')) order by o ->> 'id')
          from jsonb_array_elements(p_options) o where o ->> 'id' in ('A', 'B', 'C', 'D'))
    else '[]'::jsonb end
$$;
revoke execute on function public.question_annulled_study_notes(text, jsonb, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- impressões digitais (o gerador calcula as mesmas, em md5)
-- Os textos da carga: explicação A, B, C, D, conduta, "o que avalia", tema e subtema, separados pelo caractere 31.
create or replace function public.question_explanations_fingerprint(p_options jsonb, p_conduct text, p_intent text, p_topic text, p_subtopic text) returns text
  language sql immutable set search_path = ''
as $$
  select md5(concat_ws(chr(31),
    coalesce((select o ->> 'explanation' from jsonb_array_elements(p_options) o where o ->> 'id' = 'A' limit 1), ''),
    coalesce((select o ->> 'explanation' from jsonb_array_elements(p_options) o where o ->> 'id' = 'B' limit 1), ''),
    coalesce((select o ->> 'explanation' from jsonb_array_elements(p_options) o where o ->> 'id' = 'C' limit 1), ''),
    coalesce((select o ->> 'explanation' from jsonb_array_elements(p_options) o where o ->> 'id' = 'D' limit 1), ''),
    coalesce(p_conduct, ''), coalesce(p_intent, ''), coalesce(p_topic, ''), coalesce(p_subtopic, '')))
$$;
revoke execute on function public.question_explanations_fingerprint(jsonb, text, text, text, text) from public, anon, authenticated;

-- O que o Professor leu: enunciado e o texto das alternativas A a D (para saber se o banco ainda tem esse mesmo texto).
create or replace function public.question_read_fingerprint(p_statement text, p_options jsonb) returns text
  language sql immutable set search_path = ''
as $$
  select md5(concat_ws(chr(31), coalesce(p_statement, ''),
    coalesce((select o ->> 'text' from jsonb_array_elements(p_options) o where o ->> 'id' = 'A' limit 1), ''),
    coalesce((select o ->> 'text' from jsonb_array_elements(p_options) o where o ->> 'id' = 'B' limit 1), ''),
    coalesce((select o ->> 'text' from jsonb_array_elements(p_options) o where o ->> 'id' = 'C' limit 1), ''),
    coalesce((select o ->> 'text' from jsonb_array_elements(p_options) o where o ->> 'id' = 'D' limit 1), '')))
$$;
revoke execute on function public.question_read_fingerprint(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- a carga (só o dono, pelo editor SQL do Supabase)
-- p_items: [{ id, situacao ('valid'|'annulled'), gabarito, explicacoes {A,B,C,D}, conduta, avalia, tema, subtema, nota,
--             texto_lido (md5 do enunciado e alternativas que o Professor leu), carga {o que a equipe precisa saber} }]
-- Devolve { resumo, total, gravadas, iguais, em_revisao, ja_aprovadas, puladas: [{id, motivo}], notas: {...} }.
create or replace function public.question_explanations_apply(p_items jsonb, p_label text) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_label constant text := left(coalesce(nullif(btrim(p_label), ''), 'Carga das explicações (Professor e Auditor)'), 200);
  it jsonb;
  q public.questions;
  n public.question_update_notes;
  v_id text;
  v_annulled boolean;
  v_ex jsonb;
  v_letter text;
  v_text text;
  v_bad text;
  v_opts jsonb;
  v_conduct text;
  v_intent text;
  v_topic text;
  v_subtopic text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_campos text[];
  v_review jsonb;
  v_carga jsonb;
  v_diff boolean;
  v_note text;
  v_total integer := 0;
  v_gravadas integer := 0;
  v_iguais integer := 0;
  v_revisao integer := 0;
  v_aprovadas integer := 0;
  v_puladas jsonb := '[]'::jsonb;
  v_n_novas integer := 0;
  v_n_atualizadas integer := 0;
  v_n_iguais integer := 0;
  v_n_equipe integer := 0;
  v_n_retiradas integer := 0;
begin
  if (select auth.uid()) is not null then
    raise exception 'A carga das explicações é colada pelo dono no editor SQL do Supabase (não pelo app).' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'A carga precisa ser uma lista de questões.' using errcode = '22023';
  end if;
  perform set_config('sqie.reason', v_label, true);
  for it in select e from jsonb_array_elements(p_items) e loop
    v_total := v_total + 1;
    v_id := it ->> 'id';
    select * into q from public.questions x where x.id = v_id for update;
    if not found then
      v_puladas := v_puladas || jsonb_build_object('id', v_id, 'motivo', 'a questão não existe no banco (cole antes a carga das provas)');
      continue;
    end if;
    v_annulled := (it ->> 'situacao') = 'annulled';
    if v_annulled is distinct from (q.status = 'annulled') then
      v_puladas := v_puladas || jsonb_build_object('id', v_id, 'motivo',
        case when q.status = 'annulled' then 'no banco a questão está anulada, e as explicações foram escritas para a questão válida'
             else 'no banco a questão vale (não está anulada), e as explicações foram escritas para a questão anulada' end);
      continue;
    end if;
    if not v_annulled and q.correct_option::text is distinct from (it ->> 'gabarito') then
      v_puladas := v_puladas || jsonb_build_object('id', v_id, 'motivo',
        format('gabarito no banco: %s; as explicações foram escritas para o gabarito %s (o gabarito nunca muda por aqui)', q.correct_option, coalesce(it ->> 'gabarito', '(nenhum)')));
      continue;
    end if;
    -- as letras de novo, aqui no banco: anulada só "Defensável."/"Incorreta."; válida, "Correta." só na letra do gabarito
    v_ex := coalesce(it -> 'explicacoes', '{}'::jsonb);
    v_bad := null;
    foreach v_letter in array array['A', 'B', 'C', 'D'] loop
      v_text := btrim(coalesce(v_ex ->> v_letter, ''));
      if v_annulled then
        if v_text !~ '^(Defensável|Incorreta)\.\s*\S' then v_bad := v_letter; end if;
      elsif v_letter = q.correct_option::text then
        if v_text !~ '^Correta\.\s*\S' then v_bad := v_letter; end if;
      elsif v_text !~ '^Incorreta\.\s*\S' then
        v_bad := v_letter;
      end if;
    end loop;
    if v_bad is not null then
      v_puladas := v_puladas || jsonb_build_object('id', v_id, 'motivo',
        format('a explicação da %s não começa como deve (%s)', v_bad,
               case when v_annulled then 'anulada: "Defensável." ou "Incorreta."' else '"Correta." só na letra do gabarito, "Incorreta." nas outras' end));
      continue;
    end if;
    v_conduct := nullif(btrim(coalesce(it ->> 'conduta', '')), '');
    v_intent := nullif(btrim(coalesce(it ->> 'avalia', '')), '');
    if v_conduct is null or v_intent is null then
      v_puladas := v_puladas || jsonb_build_object('id', v_id, 'motivo', 'falta a conduta esperada ou "o que a questão avalia"');
      continue;
    end if;
    v_opts := (select jsonb_agg(o || jsonb_build_object('explanation', btrim(coalesce(v_ex ->> (o ->> 'id'), ''))) order by t.n)
               from jsonb_array_elements(q.options) with ordinality as t (o, n));
    v_topic := coalesce(nullif(btrim(coalesce(it ->> 'tema', '')), ''), q.topic);
    v_subtopic := coalesce(nullif(btrim(coalesce(it ->> 'subtema', '')), ''), q.subtopic);
    v_diff := nullif(it ->> 'texto_lido', '') is not null and (it ->> 'texto_lido') <> public.question_read_fingerprint(q.statement, q.options);
    v_carga := coalesce(it -> 'carga', '{}'::jsonb) || jsonb_build_object('texto_diferente', v_diff, 'rotulo', v_label);
    -- o que muda e o que espera revisão (a mesma conta do gatilho da …9701: texto novo ou diferente; os que já esperavam continuam)
    v_old := public.question_comment_fields(q.options, q.expected_conduct, q.inep_intent);
    v_new := public.question_comment_fields(v_opts, v_conduct, v_intent);
    v_changed := array(select e.k from jsonb_each_text(v_new) as e (k, v) where e.v <> '' and e.v is distinct from (v_old ->> e.k) order by e.k);
    v_campos := array(
      select c from (select jsonb_array_elements_text(coalesce(q.comment_review -> 'campos', '[]'::jsonb)) as c union select unnest(v_changed)) x
      where coalesce(v_new ->> c, '') <> '' order by c);
    if cardinality(v_campos) = 0 then
      v_review := null;                       -- nada novo e nada esperando: o que o revisor aprovou continua aprovado
    elsif cardinality(v_changed) > 0 then
      -- texto mudou: a devolução anterior (se houve) foi atendida e sai da marca
      v_review := jsonb_build_object('campos', to_jsonb(v_campos), 'desde', coalesce(q.comment_review -> 'desde', to_jsonb(now())),
                                     'por', null, 'ia', true, 'carga', v_carga);
    else
      v_review := q.comment_review || jsonb_build_object('campos', to_jsonb(v_campos), 'carga', v_carga);
    end if;
    if v_review is null and q.comment_review is null and cardinality(v_changed) = 0 then
      v_aprovadas := v_aprovadas + 1;
    end if;
    if v_opts is not distinct from q.options and v_conduct is not distinct from q.expected_conduct and v_intent is not distinct from q.inep_intent
       and v_topic is not distinct from q.topic and v_subtopic is not distinct from q.subtopic and v_review is not distinct from q.comment_review then
      v_iguais := v_iguais + 1;
    else
      update public.questions
         set options = v_opts, expected_conduct = v_conduct, inep_intent = v_intent, topic = v_topic, subtopic = v_subtopic, comment_review = v_review
       where id = q.id;
      v_gravadas := v_gravadas + 1;
    end if;
    if v_review is not null then v_revisao := v_revisao + 1; end if;
    -- a nota "O que mudou desde a prova" (sempre em revisão; a da equipe não é trocada; a do Professor ainda não aprovada sai
    -- quando a carga nova não a traz)
    v_note := public.question_update_note_clean(it ->> 'nota');
    select * into n from public.question_update_notes x where x.question_id = q.id for update;
    if v_note is not null then
      if n.question_id is null then
        insert into public.question_update_notes (question_id, note, status, origin) values (q.id, v_note, 'em_revisao', 'professor');
        v_n_novas := v_n_novas + 1;
      elsif n.origin = 'equipe' then
        v_n_equipe := v_n_equipe + 1;
      elsif n.note is distinct from v_note then
        update public.question_update_notes set note = v_note where question_id = q.id;
        v_n_atualizadas := v_n_atualizadas + 1;
      else
        v_n_iguais := v_n_iguais + 1;
      end if;
    elsif n.question_id is not null and n.origin = 'professor' and n.status <> 'aprovada' then
      delete from public.question_update_notes where question_id = q.id;
      v_n_retiradas := v_n_retiradas + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'resumo', format('%s: %s — %s questões: %s gravadas, %s já estavam iguais, %s puladas. Esperando o revisor médico: %s (o aluno só vê depois da aprovação). Notas "O que mudou desde a prova": %s novas, %s atualizadas (esperam aprovação), %s da equipe mantidas, %s retiradas.',
                     case when jsonb_array_length(v_puladas) = 0 then 'OK' else 'ATENÇÃO' end, v_label, v_total, v_gravadas, v_iguais,
                     jsonb_array_length(v_puladas), v_revisao, v_n_novas, v_n_atualizadas, v_n_equipe, v_n_retiradas),
    'total', v_total, 'gravadas', v_gravadas, 'iguais', v_iguais, 'em_revisao', v_revisao, 'ja_aprovadas', v_aprovadas,
    'puladas', v_puladas,
    'notas', jsonb_build_object('novas', v_n_novas, 'atualizadas', v_n_atualizadas, 'iguais', v_n_iguais, 'da_equipe_mantidas', v_n_equipe, 'retiradas', v_n_retiradas));
end
$$;
revoke execute on function public.question_explanations_apply(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- regra B (opcional): liberar direto ao aluno
-- p_items: [{ id, impressao }]. Libera (tira da revisão) só a questão cuja marca veio da carga, sem devolução do revisor, sem
-- decisão anterior de revisor médico, com o enunciado igual ao que o Professor leu e com o texto ainda igual ao da carga.
create or replace function public.question_explanations_release(p_items jsonb, p_label text) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_label constant text := left(coalesce(nullif(btrim(p_label), ''), 'Regra B da carga das explicações'), 200);
  it jsonb;
  q public.questions;
  v_id text;
  v_motivo text;
  v_ids text[] := '{}';
  v_ja integer := 0;
  v_puladas jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is not null then
    raise exception 'A regra B é colada pelo dono no editor SQL do Supabase (não pelo app).' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'A lista precisa ser uma lista de questões.' using errcode = '22023';
  end if;
  for it in select e from jsonb_array_elements(p_items) e loop
    v_id := it ->> 'id';
    select * into q from public.questions x where x.id = v_id for update;
    v_motivo := case
      when not found then 'a questão não existe no banco'
      when q.comment_review is null then null
      when not (q.comment_review ? 'carga') then 'em revisão por mudança feita na Administração (não veio da carga): decide o revisor médico'
      when q.comment_review ? 'devolvido' then 'devolvida pelo revisor médico: continua em revisão'
      when coalesce((q.comment_review -> 'carga' ->> 'texto_diferente')::boolean, false) then 'o enunciado ou as alternativas do banco não são os que o Professor leu: decide o revisor médico'
      when exists (select 1 from public.question_comment_reviews r where r.question_id = q.id) then 'já teve decisão de revisor médico: continua com ele'
      when public.question_explanations_fingerprint(q.options, q.expected_conduct, q.inep_intent, q.topic, q.subtopic) is distinct from (it ->> 'impressao')
        then 'o texto mudou depois da carga: decide o revisor médico'
      else '' end;
    if v_motivo is null then
      v_ja := v_ja + 1;                        -- nada esperando revisão (já aprovada ou já liberada)
    elsif v_motivo <> '' then
      v_puladas := v_puladas || jsonb_build_object('id', v_id, 'motivo', v_motivo);
    else
      update public.questions set comment_review = null where id = q.id;
      v_ids := v_ids || v_id;
    end if;
  end loop;
  if cardinality(v_ids) > 0 then
    perform public.admin_log('question.explanations_released', left(v_label, 200), jsonb_build_object('liberadas', cardinality(v_ids), 'ids', to_jsonb(v_ids), 'regra', 'B'));
  end if;
  return jsonb_build_object(
    'resumo', format('%s: %s — %s liberadas direto ao aluno, %s já não esperavam revisão, %s continuam com o revisor médico.',
                     case when jsonb_array_length(v_puladas) = 0 then 'OK' else 'ATENÇÃO' end, v_label, cardinality(v_ids), v_ja, jsonb_array_length(v_puladas)),
    'liberadas', cardinality(v_ids), 'ja_sem_revisao', v_ja, 'puladas', v_puladas);
end
$$;
revoke execute on function public.question_explanations_release(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- o que o aluno vê (corpo da …9801)
-- Igual à …9801, mais: annulled_notes (as explicações de estudo da anulada, regra acima) e update_note (a nota aprovada).
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
    and (q.origin = 'official' or public.has_ineditas())
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;
revoke execute on function public.ch_raw_practice_correction_view(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- a fila do revisor (corpo da …9701)
-- Mais: a questão com a nota "O que mudou desde a prova" esperando decisão também entra (note_pending), o filtro por prova
-- (exam_id) e, em cada item, a prova e se o comentário veio da carga (from_load). campos nunca vem nulo.
create or replace function public.app_admin_comment_review_queue(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_search constant text := nullif(btrim(coalesce(f ->> 'search', '')), '');
begin
  perform public.question_comment_assert_access();
  return (
    with mine as (
      select q.*, nn.status as note_status, nn.updated_at as note_since
      from public.questions q
      left join public.question_update_notes nn on nn.question_id = q.id and nn.status in ('em_revisao', 'devolvida')
      where (q.comment_review is not null or nn.question_id is not null)
        and (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area)))
        and (nullif(f ->> 'area', '') is null or q.area::text = f ->> 'area')
        and (nullif(f ->> 'exam_id', '') is null or q.exam_id = f ->> 'exam_id')
        and (v_search is null or q.code ilike '%' || v_search || '%'
             or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, '')) like '%' || public.fold_text(v_search) || '%')
    )
    select jsonb_build_object(
      'total', (select count(*)::int from mine),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'area', m.area, 'area_label', public.area_label(m.area), 'topic', m.topic, 'status', m.status,
          'exam_id', m.exam_id, 'excerpt', left(m.statement, 160), 'campos', coalesce(m.comment_review -> 'campos', '[]'::jsonb),
          'since', coalesce(m.comment_review -> 'desde', to_jsonb(m.note_since)),
          'ia', coalesce((m.comment_review ->> 'ia')::boolean, false), 'returned', coalesce(m.comment_review ? 'devolvido', false),
          'from_load', coalesce(m.comment_review ? 'carga', false), 'note_pending', m.note_status is not null,
          'note_returned', m.note_status = 'devolvida', 'can_review', public.question_can_review_comment(m.area))
          order by coalesce(m.comment_review ->> 'desde', to_jsonb(m.note_since) #>> '{}'), m.id)
        from (select * from mine order by coalesce(comment_review ->> 'desde', to_jsonb(note_since) #>> '{}'), id
              limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) m
      ), '[]'::jsonb)
    )
  );
end
$$;
revoke execute on function public.app_admin_comment_review_queue(jsonb, integer, integer) from public, anon;
grant execute on function public.app_admin_comment_review_queue(jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------- aprovar a prova inteira
-- As questões da prova com comentário em revisão que quem chama enxerga (equipe: todas; revisor médico: as das áreas dele), com a
-- impressão digital dos textos, se foram devolvidas e se quem chama pode aprovar.
create or replace function public.question_comment_review_exam_rows(p_exam_id text)
  returns table (id text, area public.med_area, campos jsonb, impressao text, devolvida boolean, pode boolean)
  language sql stable security definer set search_path = ''
as $$
  select q.id, q.area, coalesce(q.comment_review -> 'campos', '[]'::jsonb),
         public.question_explanations_fingerprint(q.options, q.expected_conduct, q.inep_intent, q.topic, q.subtopic),
         coalesce(q.comment_review ? 'devolvido', false), public.question_can_review_comment(q.area)
  from public.questions q
  where q.exam_id = p_exam_id and q.comment_review is not null
    and (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area)))
$$;
revoke execute on function public.question_comment_review_exam_rows(text) from public, anon, authenticated;

-- As provas com algo esperando decisão (para a escolha da prova na fila): pendentes, quantas quem chama pode aprovar de uma vez,
-- devolvidas e notas "O que mudou desde a prova" esperando decisão.
create or replace function public.app_admin_comment_review_exams() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.question_comment_assert_access();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'pendentes', c.pendentes, 'aprovaveis', c.aprovaveis,
                                        'devolvidas', c.devolvidas, 'notas', c.notas)
                     order by e.year desc, e.semester desc nulls last, e.kind)
    from public.exams e
    join (
      select q.exam_id,
             count(*) filter (where q.comment_review is not null)::int as pendentes,
             count(*) filter (where q.comment_review is not null and not (q.comment_review ? 'devolvido') and public.question_can_review_comment(q.area))::int as aprovaveis,
             count(*) filter (where q.comment_review ? 'devolvido')::int as devolvidas,
             count(*) filter (where nn.question_id is not null)::int as notas
      from public.questions q
      left join public.question_update_notes nn on nn.question_id = q.id and nn.status in ('em_revisao', 'devolvida')
      where (q.comment_review is not null or nn.question_id is not null)
        and (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area)))
      group by q.exam_id
    ) c on c.exam_id = e.id
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.app_admin_comment_review_exams() from public, anon;
grant execute on function public.app_admin_comment_review_exams() to authenticated;

-- O resumo de uma prova antes de aprovar: o que quem chama pode aprovar de uma vez e a impressão digital dessa lista (a aprovação
-- só vale se a lista for a mesma).
create or replace function public.app_admin_comment_review_exam(p_exam_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.question_comment_assert_access();
  if not exists (select 1 from public.exams e where e.id = p_exam_id) then
    raise exception 'Prova não encontrada.' using errcode = 'P0002';
  end if;
  return (
    select jsonb_build_object(
      'exam_id', p_exam_id,
      'title', (select e.title from public.exams e where e.id = p_exam_id),
      'pendentes', count(*)::int,
      'aprovaveis', count(*) filter (where r.pode and not r.devolvida)::int,
      'devolvidas', count(*) filter (where r.devolvida)::int,
      'outras_areas', count(*) filter (where not r.pode)::int,
      'notas', (select count(*)::int from public.question_update_notes nn join public.questions q on q.id = nn.question_id
                where q.exam_id = p_exam_id and nn.status in ('em_revisao', 'devolvida')
                  and (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area)))),
      'impressao', md5(coalesce(string_agg(r.id || ':' || r.impressao || ':' || r.campos::text, '|' order by r.id) filter (where r.pode and not r.devolvida), '')))
    from public.question_comment_review_exam_rows(p_exam_id) r
  );
end
$$;
revoke execute on function public.app_admin_comment_review_exam(text) from public, anon;
grant execute on function public.app_admin_comment_review_exam(text) to authenticated;

-- Aprovar de uma vez os comentários da prova que quem chama pode aprovar (revisor médico da área ou administrador). p_seen = a
-- impressão digital que a tela mostrou (app_admin_comment_review_exam): se a lista mudou, nada é aprovado.
create or replace function public.app_admin_comment_review_approve_exam(p_exam_id text, p_note text, p_seen text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_note constant text := btrim(coalesce(p_note, ''));
  v_ids text[];
  v_imp text;
begin
  perform public.question_comment_assert_access();
  if char_length(v_note) < 10 then
    raise exception 'Registre o que foi conferido na prova (pelo menos 10 caracteres).' using errcode = '22023';
  end if;
  if char_length(v_note) > 900 then
    raise exception 'A nota pode ter no máximo 900 caracteres.' using errcode = '22023';
  end if;
  -- trava as questões em revisão da prova enquanto confere e grava
  perform 1 from public.questions q where q.exam_id = p_exam_id and q.comment_review is not null for update;
  select array_agg(r.id order by r.id), md5(coalesce(string_agg(r.id || ':' || r.impressao || ':' || r.campos::text, '|' order by r.id), ''))
    into v_ids, v_imp
    from public.question_comment_review_exam_rows(p_exam_id) r
   where r.pode and not r.devolvida;
  if v_ids is null then
    raise exception 'Nada para aprovar nesta prova: não há comentário em revisão que você possa aprovar (as devolvidas e as de outras áreas ficam de fora).' using errcode = '22023';
  end if;
  if p_seen is distinct from v_imp then
    raise exception 'A lista desta prova mudou desde que você a abriu (alguém salvou, aprovou ou devolveu um comentário). Abra a prova de novo e confira antes de aprovar.' using errcode = '22023';
  end if;
  insert into public.question_comment_reviews (question_id, decision, decided_by, note, campos)
  select q.id, 'approve', (select auth.uid()), left('Aprovação da prova inteira: ' || v_note, 1000),
         coalesce(array(select jsonb_array_elements_text(q.comment_review -> 'campos') order by 1), '{}'::text[])
  from public.questions q where q.id = any (v_ids);
  update public.questions set comment_review = null where id = any (v_ids);
  perform public.admin_log('question.comment_approved_exam', p_exam_id,
    jsonb_build_object('prova', (select e.title from public.exams e where e.id = p_exam_id), 'aprovadas', cardinality(v_ids), 'ids', to_jsonb(v_ids), 'note', v_note));
  return public.app_admin_comment_review_exam(p_exam_id) || jsonb_build_object('aprovadas', cardinality(v_ids));
end
$$;
revoke execute on function public.app_admin_comment_review_approve_exam(text, text, text) from public, anon;
grant execute on function public.app_admin_comment_review_approve_exam(text, text, text) to authenticated;

-- ---------------------------------------------------------------- a nota na Administração
-- Ler: equipe ou revisor médico da área da questão. can_decide = revisor médico da área ou administrador; can_edit = equipe.
create or replace function public.app_admin_question_update_note(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  q public.questions;
  n public.question_update_notes;
  v_visible text;
begin
  perform public.question_comment_assert_access();
  select * into q from public.questions x where x.id = p_question_id;
  if not found then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  if not (public.is_staff() or public.ch_is_reviewer(public.guideline_area_code(q.area))) then
    raise exception 'Acesso restrito à equipe e aos revisores médicos.' using errcode = '42501';
  end if;
  select * into n from public.question_update_notes x where x.question_id = q.id;
  if n.question_id is not null then
    v_visible := public.question_update_note_visible(q.id);
  end if;
  return jsonb_build_object(
    'question_id', q.id, 'note', n.note, 'status', n.status, 'origin', n.origin, 'created_at', n.created_at, 'updated_at', n.updated_at,
    'decided_at', n.decided_at, 'decided_by', public.question_person_name(n.decided_by), 'decision_note', n.decision_note,
    'student_sees', v_visible is not null,
    'hidden_reason', case when n.status = 'aprovada' and v_visible is null
                          then 'Aprovada, mas o aluno não a vê aqui: o quadro "Fontes vinculadas" desta questão já mostra uma nota "O que mudou desde a prova" (sem repetir).' end,
    'can_decide', public.question_can_review_comment(q.area),
    'can_edit', public.is_staff());
end
$$;
revoke execute on function public.app_admin_question_update_note(text) from public, anon;
grant execute on function public.app_admin_question_update_note(text) to authenticated;

-- Escrever, mudar ou tirar a nota (equipe: editor ou administrador). Texto novo ou mudado volta para a revisão e passa a ser da
-- equipe (a carga não passa por cima); texto vazio tira a nota. O histórico da questão guarda o antes e o depois.
create or replace function public.app_admin_question_update_note_save(p_question_id text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  q public.questions;
  n public.question_update_notes;
  v_note constant text := public.question_update_note_clean(p_note);
begin
  perform public.assert_staff();
  select * into q from public.questions x where x.id = p_question_id;
  if not found then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  if char_length(coalesce(v_note, '')) > 1500 then
    raise exception 'A nota pode ter no máximo 1500 caracteres.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) < 10 then
    raise exception 'Escreva a nota com pelo menos 10 caracteres (ou apague tudo para tirar a nota).' using errcode = '22023';
  end if;
  select * into n from public.question_update_notes x where x.question_id = q.id for update;
  if v_note is null then
    if n.question_id is not null then
      delete from public.question_update_notes where question_id = q.id;
      perform public.admin_log('question.update_note_removed', q.id, jsonb_build_object('code', q.code, 'texto', left(n.note, 300)));
    end if;
  elsif n.question_id is null then
    insert into public.question_update_notes (question_id, note, status, origin) values (q.id, v_note, 'em_revisao', 'equipe');
    perform public.admin_log('question.update_note_saved', q.id, jsonb_build_object('code', q.code, 'texto', left(v_note, 300)));
  elsif n.note is distinct from v_note then
    update public.question_update_notes set note = v_note, origin = 'equipe' where question_id = q.id;
    perform public.admin_log('question.update_note_saved', q.id, jsonb_build_object('code', q.code, 'texto', left(v_note, 300)));
  end if;
  return public.app_admin_question_update_note(q.id);
end
$$;
revoke execute on function public.app_admin_question_update_note_save(text, text) from public, anon;
grant execute on function public.app_admin_question_update_note_save(text, text) to authenticated;

-- Aprovar ou devolver a nota (revisor médico da área ou administrador), com a nota do que conferiu (10 letras ou mais).
-- p_seen_text: a nota como a tela mostrou; aprovar só vale se ela não mudou depois da leitura.
create or replace function public.app_admin_question_update_note_decide(p_question_id text, p_decision text, p_note text, p_seen_text text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  q public.questions;
  n public.question_update_notes;
  v_note constant text := btrim(coalesce(p_note, ''));
begin
  perform public.question_comment_assert_access();
  if p_decision is null or p_decision not in ('approve', 'return') then
    raise exception 'A decisão deve ser aprovar ou devolver.' using errcode = '22023';
  end if;
  select * into q from public.questions x where x.id = p_question_id;
  if not found then
    raise exception 'Questão não encontrada.' using errcode = 'P0002';
  end if;
  if not public.question_can_review_comment(q.area) then
    raise exception 'A decisão sobre a nota desta questão é de um revisor médico cadastrado em % ou de um administrador.', public.area_label(q.area) using errcode = '42501';
  end if;
  select * into n from public.question_update_notes x where x.question_id = q.id for update;
  if n.question_id is null then
    raise exception 'Esta questão não tem nota "O que mudou desde a prova".' using errcode = '22023';
  end if;
  if char_length(v_note) < 10 then
    raise exception '%', case p_decision when 'approve' then 'Registre o que foi conferido na nota (pelo menos 10 caracteres).'
                                         else 'Escreva o motivo da devolução (pelo menos 10 caracteres).' end using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'A nota do revisor pode ter no máximo 1000 caracteres.' using errcode = '22023';
  end if;
  if p_decision = 'approve' then
    if n.status = 'aprovada' then
      raise exception 'Esta nota já está aprovada.' using errcode = '22023';
    end if;
    if public.question_update_note_clean(p_seen_text) is distinct from n.note then
      raise exception 'A nota mudou enquanto você revisava: outra pessoa salvou um texto depois da sua leitura. Veja o texto de agora e revise de novo.' using errcode = '22023';
    end if;
    update public.question_update_notes set status = 'aprovada', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note
     where question_id = q.id;
    perform public.admin_log('question.update_note_approved', q.id, jsonb_build_object('code', q.code, 'note', v_note, 'texto', left(n.note, 300)));
  else
    update public.question_update_notes set status = 'devolvida', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note
     where question_id = q.id;
    perform public.admin_log('question.update_note_returned', q.id, jsonb_build_object('code', q.code, 'note', v_note, 'texto', left(n.note, 300)));
  end if;
  return public.app_admin_question_update_note(q.id);
end
$$;
revoke execute on function public.app_admin_question_update_note_decide(text, text, text, text) from public, anon;
grant execute on function public.app_admin_question_update_note_decide(text, text, text, text) to authenticated;
