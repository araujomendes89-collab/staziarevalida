-- =============================================================================
-- Fontes complementares (APOIO-1): as apostilas "Sangue nos Olhos" (e material do mesmo tipo) entram na biblioteca de fontes
-- como FONTE COMPLEMENTAR. Valem como fonte para a IA e para a equipe (busca, evidência, conferência), mas NADA que as
-- identifique chega ao aluno: título, órgão, link, arquivo, trecho, página, contagem.
--
-- Duas classes na biblioteca (ch_sources.audience):
--   oficial        fonte confiável (provas e gabaritos da banca Inep Revalida/Enamed, PCDT, órgãos oficiais, diretrizes). Funciona como hoje:
--                  pode ser mostrada ao aluno e só ela dá os selos do aluno.
--   complementar   fonte complementar (apostilas). A equipe vê; o aluno não vê nada. Nunca dá selo: por regra do banco ela só pode ter
--                  nível de autoridade E (ou nenhum), e todas as travas "oficial" do sistema exigem nível A a D.
-- Decisões:
--   * Fonte nova de nível E nasce complementar. As fontes que já existem continuam oficiais; nada é marcado sozinho.
--   * Só administrador muda a classe (app_ch_set_source_audience), com registro em ch_audit e no Registro da Administração.
--     Passar para complementar leva o nível de autoridade para E (o nível anterior fica no registro).
--   * Toda saída ao aluno que carrega fonte passa por ch_student_sources / ch_student_text (equipe e revisor continuam vendo tudo):
--     correção, comentário da questão, cartão de atualização, linha do tempo, Tutor, podcast, aula e Atualizações & Diretrizes.
--   * O que a equipe digita em campos de fonte (fontes de podcast, material de aula, diretriz da aula, documento da atualização) é
--     comparado com a biblioteca (título COMPLETO e exato, órgão distintivo, siglas, link, arquivo, SHA-256); quem bate some da resposta ao aluno.
--   * REGRA DO DONO de 2026-10-11: a expressão "Sangue nos Olhos" e a palavra "apostila" SOLTAS não escondem nem barram nada (podem ser
--     texto médico legítimo, como a queixa "sangue nos olhos"). Só vale o que está CADASTRADO como fonte complementar.
--
-- As funções redefinidas partem das versões mais novas de todas as migrações e dos ramos entregues:
--   app_question_commentary, practice_correction_view, tutor_truth: 20261003007700 · app_question_timeline: 20261003002600
--   app_podcast: 20261003009593 · lesson_view, lesson_materials_json, app_lesson_material: 20261003009580 (com a conferência do áudio, review_status) · guideline_update_view: 20261003004100
--   app_ch_set_source_authority: 20261003002100.
-- Pode ser colada duas vezes sem erro e não apaga nenhum dado.
-- PRECISA da 20261003009580 (conferência do áudio das aulas: review_status, lesson_can_release) já aplicada: lesson_materials_json e app_lesson_material
-- partem dela e mantêm a conferência.
--
-- REGRA DO DONO (confirmada): conteúdo que chega ao aluno como conferido/sustentado exige pelo menos UMA fonte OFICIAL (nível A a D).
-- A fonte complementar sozinha sustenta rascunho e análise da equipe, nunca dá selo, atualidade nem "conduta atual".
--
-- ATENÇÃO AO COLAR DE NOVO: as migrações 9580 (aulas) e 9593 (podcasts) redefinem lesson_materials_json, app_lesson_material e app_podcast
-- sem o filtro desta migração. "Colar de novo" uma delas = colar dela até a última, na ordem (9580, 9591, 9592, 9593, 9610, 9620).
-- Conferir depois de colar: select public.app_ch_complementar_check(); (administrador) deve devolver {"ok": true}.
-- Esta migração também parte da 9580 e da 9593 como estão hoje: quem mudar essas funções depois deve levar o filtro junto.
-- =============================================================================

-- ---------------------------------------------------------------- 1. classe da fonte
alter table public.ch_sources add column if not exists audience text not null default 'oficial';
-- siglas e apelidos da fonte ("SNO"): o administrador cadastra; o aluno nunca pode ver texto que os cite
alter table public.ch_sources add column if not exists aliases text[] not null default '{}';
alter table public.ch_sources drop constraint if exists ch_sources_audience_check;
alter table public.ch_sources add constraint ch_sources_audience_check check (audience in ('oficial', 'complementar'));
-- complementar nunca tem nível A a D: assim nenhuma trava "fonte oficial" (selos, atualidade, evidência para publicar) a aceita
alter table public.ch_sources drop constraint if exists ch_sources_complementar_nivel;
alter table public.ch_sources add constraint ch_sources_complementar_nivel check (audience = 'oficial' or authority_level is null or authority_level = 'E');

create or replace function public.ch_sources_audience_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- fonte nova de nível E (livro, apostila, curso) nasce complementar
    if new.authority_level = 'E' and new.audience = 'oficial' then new.audience := 'complementar'; end if;
  else
    if new.authority_level = 'E' and old.authority_level is distinct from 'E' and new.audience = 'oficial' and old.audience = 'oficial' then
      new.audience := 'complementar';
    end if;
  end if;
  if new.audience = 'complementar' and new.authority_level in ('A', 'B', 'C', 'D') then
    if tg_op = 'UPDATE' and old.audience = 'oficial' then
      new.authority_level := 'E';   -- passou a complementar: o nível vai para E
    else
      raise exception 'Fonte complementar só pode ter nível E. Para dar nível A a D, a fonte precisa ser oficial.' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists ch_sources_audience_guard on public.ch_sources;
create trigger ch_sources_audience_guard before insert or update of audience, authority_level on public.ch_sources
  for each row execute function public.ch_sources_audience_guard();

-- Registro de TODA mudança de classe (pelo administrador, ou sozinha quando se dá nível E a uma fonte oficial, ou fonte nova que
-- já nasce complementar): ch_audit e Registro da Administração, com o nível de antes (para poder voltar).
create or replace function public.ch_sources_audience_log() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_det jsonb;
begin
  if tg_op = 'INSERT' and new.audience = 'oficial' then return new; end if;
  if tg_op = 'UPDATE' and old.audience = new.audience then return new; end if;
  v_det := jsonb_build_object('title', new.title, 'from', case when tg_op = 'INSERT' then null else old.audience end, 'to', new.audience,
                              'level_before', case when tg_op = 'INSERT' then null else old.authority_level end, 'level_after', new.authority_level,
                              'auto', coalesce(current_setting('apoio.manual', true), '') <> 'on',
                              'reason', nullif(coalesce(current_setting('apoio.reason', true), ''), ''));
  perform public.ch_log('source.audience', new.id::text, v_det);
  perform public.admin_log('source.audience', new.id::text, v_det);
  return new;
end
$$;
drop trigger if exists ch_sources_audience_log on public.ch_sources;
create trigger ch_sources_audience_log after insert or update on public.ch_sources
  for each row execute function public.ch_sources_audience_log();

-- ---------------------------------------------------------------- 2. comparação com a biblioteca (internas)
-- Texto normalizado para comparar: sem etiquetas HTML, sem entidades nem %20, NFKC, sem marcas combinantes (acento solto),
-- sem caracteres de largura zero, com letras parecidas do cirílico e do grego trocadas pelas latinas, sem pontuação, sem caixa,
-- com espaço simples. A mesma normalização vale no servidor (server/contentHub/complementarGuard.ts).
-- Entidades HTML decodificadas como no servidor (complementarGuard.ts, normalizeKey): numéricas decimais (&#97;) e hexadecimais
-- (&#x61;, &#X61;) viram o caractere; as nomeadas comuns (nbsp amp quot lt gt apos shy) também; qualquer outra, ou um código
-- impossível (zero, acima de U+10FFFF, metade de par substituto), vira espaço. Uma passada só: "&amp;#97;" vira "&#97;", não "a".
create or replace function public.ch_decode_entities(p_text text) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  v_rest text := coalesce(p_text, '');
  v_out text := '';
  v_m text[];
  v_e text;
  v_digits text;
  v_code integer;
  v_chr text;
begin
  if position('&' in v_rest) = 0 then return v_rest; end if;
  loop
    v_m := regexp_match(v_rest, '^(.*?)&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);');
    exit when v_m is null;
    v_e := v_m[2];
    v_chr := ' ';
    if v_e like '#%' then
      if substr(v_e, 2, 1) in ('x', 'X') then
        v_digits := ltrim(substr(v_e, 3), '0');
        if v_digits = '' then v_code := 0;
        elsif char_length(v_digits) > 6 then v_code := null;
        else v_code := ('x' || lpad(v_digits, 8, '0'))::bit(32)::integer; end if;
      else
        v_digits := ltrim(substr(v_e, 2), '0');
        if v_digits = '' then v_code := 0;
        elsif char_length(v_digits) > 7 then v_code := null;
        else v_code := v_digits::integer; end if;
      end if;
      if v_code is not null and v_code between 1 and 1114111 and v_code not between 55296 and 57343 then v_chr := chr(v_code); end if;
    else
      v_chr := case lower(v_e) when 'nbsp' then ' ' when 'amp' then '&' when 'quot' then '"' when 'lt' then '<' when 'gt' then '>'
                               when 'shy' then '' when 'apos' then '''' else ' ' end;
    end if;
    v_out := v_out || v_m[1] || v_chr;
    v_rest := substr(v_rest, char_length(v_m[1]) + char_length(v_e) + 3);
  end loop;
  return v_out || v_rest;
end
$$;

create or replace function public.ch_text_key(p_text text) returns text
  language sql stable set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(
      lower(regexp_replace(
        normalize(normalize(
          regexp_replace(public.ch_decode_entities(regexp_replace(coalesce(p_text, ''), '<[^>]*>', '', 'g')),
                         '%[0-9a-fA-F]{2}', ' ', 'g'),
          NFKC), NFD),
        '[̀-ͯ​-‏‪-‮⁠-⁤﻿­]', '', 'g')),
      'аеорсхуіјѕԁԛԝкмнтαεοιυκρτν',
      'aeopcxyijsdqwkmhtaeoiukptv'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- A mesma chave sem espaços ("SangueNosOlhos", "S a n g u e").
create or replace function public.ch_text_key_ns(p_text text) returns text
  language sql stable set search_path = ''
as $$ select replace(public.ch_text_key(p_text), ' ', '') $$;

-- Endereço do site de um link (sem "www."), ou nulo se não for link. Sites genéricos de hospedagem não contam como "mesmo site".
create or replace function public.ch_url_host(p_url text) returns text
  language sql immutable set search_path = ''
as $$
  select case when h in ('drive.google.com', 'docs.google.com', 'dropbox.com', 'github.com', 'youtube.com', 'youtu.be', 'wikipedia.org', 'scribd.com', 'issuu.com', 'files.wordpress.com') then null else h end
  from (select nullif(lower(regexp_replace(substring(coalesce(p_url, '') from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#:]+)'), '^www\.', '')), '') as h) x
$$;

-- Chaves de comparação das fontes complementares da biblioteca: título, órgão, nome do arquivo (com e sem extensão) e editora do
-- documento ligado (ch_documents). Só as chaves "distintivas" (3 palavras ou mais e 20 letras ou mais) valem como pedaço de um
-- texto maior; as demais só valem quando o texto inteiro é igual à chave (nunca por pedaço: um título genérico não esconde a fonte
-- oficial "PCDT Hepatite B").
create or replace function public.ch_complementar_keys() returns table (chave text, distintiva boolean)
  language sql stable security definer set search_path = ''
as $$
  select distinct k.chave, k.dist or (char_length(k.chave) >= 20 and array_length(string_to_array(k.chave, ' '), 1) >= 3)
  from (
    select public.ch_text_key(v.x) as chave, false as dist
    from public.ch_sources s left join public.ch_documents d on d.id = s.document_id
    cross join lateral (values (s.title), (s.organ), (s.authors), (d.name), (regexp_replace(d.name, '\.(pdf|docx?|pptx?|txt|epub)\s*$', '', 'i')), (d.publisher), (d.author)) v (x)
    where s.audience = 'complementar' and v.x is not null
    union all
    -- siglas e apelidos cadastrados pelo administrador: valem também como palavra dentro de um texto
    select public.ch_text_key(a), true
    from public.ch_sources s cross join lateral unnest(s.aliases) a
    where s.audience = 'complementar'
  ) k
  where char_length(k.chave) >= 3 and (k.dist or char_length(k.chave) >= 5)
$$;

-- O texto (ou o link) identifica uma fonte complementar? Sim quando é IGUAL (normalizado) a uma chave da biblioteca, quando contém
-- uma chave distintiva (também sem espaços e com letras parecidas), ou quando o link é o mesmo ou do mesmo site.
-- A palavra "apostila" e a expressão "Sangue nos Olhos" SOLTAS não contam (regra do dono de 2026-10-11): só o que está cadastrado.
create or replace function public.ch_complementar_hit(p_text text, p_url text default null) returns boolean
  language sql stable security definer set search_path = ''
as $$
  with k as (select public.ch_text_key(p_text) as t, public.ch_text_key_ns(p_text) as n)
  select exists (
        select 1 from public.ch_complementar_keys() c, k
        where k.t <> '' and (k.t = c.chave
          or (c.distintiva and (' ' || k.t || ' ' like '% ' || c.chave || ' %' or (char_length(replace(c.chave, ' ', '')) >= 12 and k.n like '%' || replace(c.chave, ' ', '') || '%')))))
      or (nullif(btrim(coalesce(p_url, '')), '') is not null
          and exists (select 1 from public.ch_sources s
                       where s.audience = 'complementar' and s.url is not null
                         and (public.ch_url_norm(p_url) = public.ch_url_norm(s.url)
                              or (public.ch_url_host(p_url) is not null and public.ch_url_host(p_url) = public.ch_url_host(s.url)))))
$$;

-- O arquivo (pelo SHA-256 ou pelo nome) é de um documento de fonte complementar?
create or replace function public.ch_complementar_file(p_sha text, p_name text default null) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select (nullif(btrim(coalesce(p_sha, '')), '') is not null and exists (
            select 1 from public.ch_sources s left join public.ch_documents d on d.id = s.document_id
             where s.audience = 'complementar' and (s.sha256 = lower(btrim(p_sha)) or d.sha256 = lower(btrim(p_sha)))))
      or (nullif(btrim(coalesce(p_name, '')), '') is not null and public.ch_complementar_hit(regexp_replace(p_name, '^.*/', ''), null))
$$;

-- Texto LIVRE já publicado que cita uma chave distintiva (título completo, órgão distintivo ou sigla) de fonte complementar cadastrada.
-- A palavra "apostila" e "Sangue nos Olhos" soltas não contam (regra do dono de 2026-10-11).
-- (Texto livre não casa por igualdade: só por citação.) Ponto único para refinar o que conta como citação.
create or replace function public.ch_text_cites(p_text text, p_keys text[]) returns boolean
  language sql stable set search_path = ''
as $$
  select exists (select 1 from unnest(p_keys) k where k <> '' and (' ' || public.ch_text_key(p_text) || ' ' like '% ' || k || ' %'
                                                                    or (char_length(replace(k, ' ', '')) >= 12 and public.ch_text_key_ns(p_text) like '%' || replace(k, ' ', '') || '%')))
$$;

-- Tira de um JSON (só para o aluno; nada é apagado no banco) todo texto que cita a apostila: o campo vira nulo e o item de lista some.
-- O aluno vê NADA no lugar. Equipe e revisor veem tudo. A varredura do administrador (app_ch_complementar_mentions) lista esses textos
-- para a equipe corrigir na origem.
create or replace function public.ch_scrub_json(p_json jsonb, p_keys text[]) returns jsonb
  language plpgsql stable set search_path = ''
as $$
declare
  r jsonb;
  k text;
  v jsonb;
begin
  if p_json is null then return null; end if;
  case jsonb_typeof(p_json)
    when 'string' then
      if public.ch_text_cites(p_json #>> '{}', p_keys) then return null; end if;
      return p_json;
    when 'object' then
      r := '{}'::jsonb;
      for k, v in select e.key, e.value from jsonb_each(p_json) e loop
        r := r || jsonb_build_object(k, public.ch_scrub_json(v, p_keys));
      end loop;
      return r;
    when 'array' then
      select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb) into r
        from (select public.ch_scrub_json(t.e, p_keys) as e, t.o from jsonb_array_elements(p_json) with ordinality as t (e, o)) x
       where x.e is not null;
      return r;
    else
      return p_json;
  end case;
end
$$;

create or replace function public.ch_scrub_json(p_json jsonb) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when p_json is null or public.is_staff() or public.ch_is_reviewer() then p_json
              else public.ch_scrub_json(p_json, coalesce((select array_agg(c.chave) from public.ch_complementar_keys() c where c.distintiva), '{}'::text[])) end
$$;

-- Um item de lista de fontes (objeto com title, organ, url... ou texto) identifica fonte complementar?
create or replace function public.ch_source_item_hit(p_item jsonb) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select case
    when p_item is null or jsonb_typeof(p_item) = 'null' then false
    when jsonb_typeof(p_item) = 'string' then public.ch_complementar_hit(p_item #>> '{}', p_item #>> '{}')
    when jsonb_typeof(p_item) = 'object' then
      (p_item ? 'source_id' and exists (select 1 from public.ch_sources s where s.audience = 'complementar' and s.id::text = p_item ->> 'source_id'))
      or exists (select 1 from jsonb_each_text(p_item) e where public.ch_complementar_hit(e.value, e.value))
    else false end
$$;

-- Lista de fontes que o ALUNO pode ver: tira as que identificam fonte complementar. Equipe e revisor veem tudo.
create or replace function public.ch_student_sources(p_sources jsonb) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case
    when p_sources is null or jsonb_typeof(p_sources) <> 'array' then coalesce(p_sources, '[]'::jsonb)
    when public.is_staff() or public.ch_is_reviewer() then p_sources
    else coalesce((select jsonb_agg(x.item order by x.ord) from jsonb_array_elements(p_sources) with ordinality as x (item, ord)
                   where not public.ch_source_item_hit(x.item)), '[]'::jsonb) end
$$;

-- Texto de fonte para o aluno: nulo quando identifica fonte complementar.
create or replace function public.ch_student_text(p_text text, p_url text default null) returns text
  language sql stable security definer set search_path = ''
as $$
  select case when p_text is null then null
              when public.is_staff() or public.ch_is_reviewer() then p_text
              when public.ch_complementar_hit(p_text, p_url) then null
              else p_text end
$$;

-- Cartão de atualização só vai ao aluno se pelo menos uma fonte OFICIAL o sustenta (regra do dono): cartão cujas fontes eram todas
-- complementares, ou que não tem fonte nenhuma gravada, não mostra "Conduta atual conferida".
create or replace function public.ch_card_shows(p_sources jsonb) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_staff() or public.ch_is_reviewer()
      or jsonb_array_length(case when jsonb_typeof(public.ch_student_sources(p_sources)) = 'array' then public.ch_student_sources(p_sources) else '[]'::jsonb end) > 0
$$;

-- Termos que nenhum texto voltado ao aluno pode citar (o servidor confere a saída da IA contra esta lista).
create or replace function public.ch_worker_complementar_terms() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct t.term), '[]'::jsonb)
  from (
    select btrim(v.x) as term, v.kind
    from public.ch_sources s left join public.ch_documents d on d.id = s.document_id
    cross join lateral (values ('titulo', s.title), ('outro', s.organ), ('outro', s.authors), ('outro', d.name),
                               ('outro', regexp_replace(d.name, '\.(pdf|docx?|pptx?|txt|epub)\s*$', '', 'i')), ('outro', d.publisher), ('outro', d.author),
                               ('outro', replace(public.ch_url_host(s.url), '.', ' '))) v (kind, x)
    where s.audience = 'complementar' and v.x is not null
    union select btrim(a), 'sigla' from public.ch_sources s cross join lateral unnest(s.aliases) a where s.audience = 'complementar'
    ) t
  where char_length(t.term) >= case when t.kind = 'sigla' then 3 else 5 end
    -- título genérico (2 palavras curtas) não vira termo de busca em texto livre: esconderia texto médico legítimo.
    -- Órgão, editora, autor, arquivo e site só valem quando DISTINTIVOS (3 palavras e 20 letras): um órgão chamado só "Sangue nos Olhos"
    -- não pode barrar a queixa clínica "sangue nos olhos" (decisão do dono, 2026-10-11).
    and (t.kind = 'sigla'
         or (t.kind = 'titulo' and (array_length(string_to_array(public.ch_text_key(t.term), ' '), 1) >= 3 or char_length(public.ch_text_key(t.term)) >= 20))
         or (t.kind = 'outro' and array_length(string_to_array(public.ch_text_key(t.term), ' '), 1) >= 3 and char_length(public.ch_text_key(t.term)) >= 20))
$$;

-- ---------------------------------------------------------------- 3. campos de fonte digitados pela equipe: marca guardada
alter table public.lessons add column if not exists guideline_hidden boolean not null default false;
alter table public.lesson_materials add column if not exists hidden_from_student boolean not null default false;
alter table public.guideline_updates add column if not exists source_hidden boolean not null default false;
alter table public.podcast_sources add column if not exists complementar boolean not null default false;
-- SHA-256 do arquivo enviado (o servidor grava por ch_worker_file_sha): reconhece a apostila mesmo com nome de arquivo neutro
alter table public.lesson_materials add column if not exists sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
alter table public.podcast_sources add column if not exists sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
-- mesma coluna da 20261003009593 (o app_podcast abaixo depende dela; colar a 9620 antes da 9593 também funciona)
alter table public.podcast_sources add column if not exists title_by_staff boolean not null default false;

create or replace function public.ch_lessons_hidden_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.guideline_hidden := public.ch_complementar_hit(new.guideline_title, new.guideline_url);
  return new;
end
$$;
drop trigger if exists lessons_hidden_flag on public.lessons;
create trigger lessons_hidden_flag before insert or update of guideline_title, guideline_url on public.lessons
  for each row execute function public.ch_lessons_hidden_flag();

create or replace function public.ch_lesson_materials_hidden_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.hidden_from_student := public.ch_complementar_hit(new.title, new.url) or public.ch_complementar_file(new.sha256, new.storage_path);
  return new;
end
$$;
drop trigger if exists lesson_materials_hidden_flag on public.lesson_materials;
create trigger lesson_materials_hidden_flag before insert or update of title, url, storage_path, sha256 on public.lesson_materials
  for each row execute function public.ch_lesson_materials_hidden_flag();

create or replace function public.ch_guideline_updates_hidden_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.source_hidden := public.ch_complementar_hit(coalesce(new.institution, '') || ' ' || coalesce(new.document_title, ''), new.source_url);
  return new;
end
$$;
drop trigger if exists guideline_updates_hidden_flag on public.guideline_updates;
create trigger guideline_updates_hidden_flag before insert or update of institution, document_title, source_url on public.guideline_updates
  for each row execute function public.ch_guideline_updates_hidden_flag();

-- Recalcula as marcas (depois de mudar a classe de uma fonte). Só mexe nas linhas em que a marca muda.
create or replace function public.ch_refresh_hidden_flags() returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.lessons set guideline_hidden = public.ch_complementar_hit(guideline_title, guideline_url)
   where guideline_hidden is distinct from public.ch_complementar_hit(guideline_title, guideline_url);
  update public.lesson_materials set hidden_from_student = (public.ch_complementar_hit(title, url) or public.ch_complementar_file(sha256, storage_path))
   where hidden_from_student is distinct from (public.ch_complementar_hit(title, url) or public.ch_complementar_file(sha256, storage_path));
  update public.guideline_updates set source_hidden = public.ch_complementar_hit(coalesce(institution, '') || ' ' || coalesce(document_title, ''), source_url)
   where source_hidden is distinct from public.ch_complementar_hit(coalesce(institution, '') || ' ' || coalesce(document_title, ''), source_url);
end
$$;
-- (a marca é recalculada com o gatilho acima; o UPDATE desta função só roda quando a marca muda)

-- Recalcula as marcas quando uma fonte complementar é criada ou renomeada, ou quando o documento ligado a ela muda de nome.
create or replace function public.ch_refresh_hidden_flags_trg() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_refresh_hidden_flags();
  return null;
end
$$;
-- Dispara quando a fonte É complementar (criada ou editada), quando MUDA de nível ou de classe (inclusive o nível E que a torna
-- complementar sozinha, e a saída da classe complementar, para a marca voltar) e quando uma fonte complementar é apagada.
-- Em UPDATE a coluna listada vale se o comando a cita (authority_level é citada por app_ch_set_source_authority; a troca de classe
-- feita pelo gatilho ch_sources_audience_guard acontece no mesmo comando).
drop trigger if exists ch_sources_refresh_flags on public.ch_sources;
drop trigger if exists ch_sources_refresh_flags_ins on public.ch_sources;
drop trigger if exists ch_sources_refresh_flags_del on public.ch_sources;
create trigger ch_sources_refresh_flags after update of title, organ, url, authors, aliases, sha256, document_id, authority_level, audience on public.ch_sources
  for each row when (new.audience = 'complementar' or old.audience = 'complementar') execute function public.ch_refresh_hidden_flags_trg();
create trigger ch_sources_refresh_flags_ins after insert on public.ch_sources
  for each row when (new.audience = 'complementar') execute function public.ch_refresh_hidden_flags_trg();
create trigger ch_sources_refresh_flags_del after delete on public.ch_sources
  for each row when (old.audience = 'complementar') execute function public.ch_refresh_hidden_flags_trg();
drop trigger if exists ch_documents_refresh_flags on public.ch_documents;
create trigger ch_documents_refresh_flags after update of name, author, publisher, sha256 on public.ch_documents
  for each row execute function public.ch_refresh_hidden_flags_trg();

-- O servidor (que tem os bytes do arquivo) grava o SHA-256 do arquivo enviado em aula ou podcast; a marca é recalculada.
create or replace function public.ch_worker_file_sha(p_path text, p_sha text) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer := 0; m integer;
begin
  if p_sha is null or p_sha !~ '^[0-9a-f]{64}$' or nullif(btrim(coalesce(p_path, '')), '') is null then return 0; end if;
  update public.lesson_materials set sha256 = p_sha where storage_path = p_path and sha256 is distinct from p_sha;
  get diagnostics m = row_count; n := n + m;
  update public.podcast_sources set sha256 = p_sha where storage_path = p_path and sha256 is distinct from p_sha;
  get diagnostics m = row_count; n := n + m;
  return n;
end
$$;

-- (A política de leitura de lesson_materials fica como a 20261003009580 deixou: só a equipe lê a tabela direto.)

-- ---------------------------------------------------------------- 4. administrador: classe da fonte
create or replace function public.app_ch_set_source_audience(p_source_id uuid, p_audience text, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  s public.ch_sources;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  if p_audience is null or p_audience not in ('oficial', 'complementar') then
    raise exception 'Classe inválida: escolha oficial ou complementar.' using errcode = '22023';
  end if;
  select * into s from public.ch_sources where id = p_source_id for update;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  if p_audience = 'complementar' and s.audience <> 'complementar' then
    -- título identificável: com menos de 3 palavras, ou igual ao rótulo de uma fonte oficial, esconderia fonte oficial do aluno
    if array_length(string_to_array(public.ch_text_key(s.title), ' '), 1) < 3 then
      raise exception 'O título desta fonte tem menos de 3 palavras (%): corrija o título para algo identificável antes de marcar como complementar.', s.title using errcode = '22023';
    end if;
    if exists (select 1 from public.ch_sources o where o.id <> s.id and o.audience = 'oficial' and public.ch_text_key(o.title) = public.ch_text_key(s.title)) then
      raise exception 'Existe uma fonte oficial com o mesmo título (%): corrija o título desta antes de marcar como complementar.', s.title using errcode = '22023';
    end if;
  end if;
  if s.audience <> p_audience then
    -- o registro (ch_audit e Registro da Administração) é gravado pelo gatilho ch_sources_audience_log, que também pega as trocas
    -- automáticas (dar nível E a uma fonte oficial a torna complementar)
    perform set_config('apoio.manual', 'on', true);
    perform set_config('apoio.reason', coalesce(v_reason, ''), true);
    update public.ch_sources set audience = p_audience where id = p_source_id returning * into s;
    perform set_config('apoio.manual', '', true);
    perform set_config('apoio.reason', '', true);
    perform public.ch_refresh_hidden_flags();
  end if;
  return jsonb_build_object('id', s.id, 'audience', s.audience, 'authority_level', s.authority_level);
end
$$;

-- Classe de cada fonte (a lista de fontes da equipe junta isto com app_ch_sources).
create or replace function public.app_ch_source_audiences() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_object_agg(s.id::text, s.audience) from public.ch_sources s), '{}'::jsonb);
end
$$;

-- Nível de autoridade: fonte complementar só aceita E.
create or replace function public.app_ch_set_source_authority(p_source_id uuid, p_level text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_level not in ('A', 'B', 'C', 'D', 'E') then raise exception 'Nível de autoridade inválido (A a E).' using errcode = '22023'; end if;
  if p_level in ('A', 'B', 'C', 'D') and exists (select 1 from public.ch_sources where id = p_source_id and audience = 'complementar') then
    raise exception 'Fonte complementar só pode ter nível E. Para dar nível A a D, passe a fonte para oficial antes.' using errcode = '22023';
  end if;
  update public.ch_sources set authority_level = p_level where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('source.authority', p_source_id::text, jsonb_build_object('level', p_level));
  return true;
end
$$;

-- ---------------------------------------------------------------- 5. saídas ao aluno
-- Comentário da questão (corpo da 20261003007700): fontes e fontes do cartão de atualização passam por ch_student_sources; só fonte oficial.
create or replace function public.ch_raw_app_question_commentary(p_question_id text, p_level text default 'full') returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'question_id', a.question_id, 'version', a.version, 'reviewed_at', a.reviewed_at, 'analysis_date', a.analysis_date,
    'question_core', a.question_core, 'key_data', a.key_data, 'trap', a.trap, 'golden_rule', a.golden_rule,
    'official_answer', (select o.answer from public.question_official_answers o where o.question_id = a.question_id and o.is_current),
    'official_status', (select o.answer_status from public.question_official_answers o where o.question_id = a.question_id and o.is_current),
    'temporal_status', a.temporal_status, 'current_best_answer', a.current_best_answer,
    'options', (select jsonb_agg(jsonb_build_object('option_id', x.option_id, 'is_official_correct', x.is_official_correct, 'distractor_kind', x.distractor_kind, 'reasoning', x.reasoning,
                  'why_plausible', x.why_plausible, 'why_wrong', x.why_wrong, 'when_correct', x.when_correct, 'concept_difference', x.concept_difference, 'trap', x.trap) order by x.option_id)
                from public.question_option_analysis x where x.analysis_id = a.id),
    'comment', (select c.content from public.question_comments c where c.analysis_id = a.id and c.level = p_level and c.status = 'published'),
    'sources', public.ch_student_sources(coalesce((select jsonb_agg(distinct jsonb_build_object('title', s.title, 'organ', s.organ, 'version', e.source_version, 'page', e.page, 'published_on', s.published_on, 'url', s.url))
                         from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                         join public.ch_sources s on s.id = e.source_id and s.audience = 'oficial' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'
                         where qc.question_id = a.question_id), '[]'::jsonb)),
    'sources_checked_at', (select max(e.created_at) from public.question_claims qc join public.ch_evidence e on e.claim_id = qc.claim_id and e.verdict = 'compatible' and not e.stale
                           join public.ch_sources s on s.id = e.source_id and s.audience = 'oficial' and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current' where qc.question_id = a.question_id),
    -- selo: atualidade conferida por revisor E fontes oficiais monitoradas, com a conferência em dia (frescor >= 80)
    'seal', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and a.last_source_check_at is not null and (public.question_freshness(a.question_id) ->> 'score')::int >= 80 then 'UPDATED' end,
    'seal_checked_at', case when a.temporal_status in ('CURRENT', 'UPDATED_BUT_SAME_ANSWER') and (public.question_freshness(a.question_id) ->> 'score')::int >= 80 then a.last_source_check_at end,
    'freshness', public.question_freshness(a.question_id),
    -- nova atualização em revisão: a conduta mostrada segue a última versão revisada
    'update_in_review', exists (select 1 from public.question_updates u where u.question_id = a.question_id and u.status in ('queued', 'analyzing', 'review_required')
                      and not exists (select 1 from public.ch_sources os where os.id = u.old_source_id and os.audience = 'complementar')
                      and not exists (select 1 from public.ch_sources ns where ns.id = u.new_source_id and ns.audience = 'complementar')),
    'update_card', (select jsonb_build_object('version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level, 'official_answer', k.official_answer, 'official_status', k.official_status,
                      'official_source', public.ch_student_text(k.official_source), 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'why_it_matters', k.why_it_matters, 'options_affected', k.options_affected,
                      'sources', public.ch_student_sources(k.sources), 'effective_date', k.effective_date, 'verified_at', k.verified_at)
                    from public.question_update_cards k where k.question_id = a.question_id and k.status = 'published'
                      and public.question_analysis_fits(k.question_id, k.official_answer) and public.ch_card_shows(k.sources)))
  from public.question_analysis a
  where a.question_id = p_question_id and a.is_current and a.status = 'published' and public.question_viewable(a.question_id)
    and public.question_analysis_fits(a.question_id, a.official_answer_at_analysis)
$$;
-- app_question_commentary: o corpo acima (ch_raw_app_question_commentary) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.app_question_commentary(p_question_id text, p_level text default 'full') returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_app_question_commentary(p_question_id, p_level))
$$;
revoke execute on function public.ch_raw_app_question_commentary(text, text) from public, anon, authenticated;


-- Correção para o aluno (corpo da 20261003007700): o gabarito/fonte da questão passa por ch_student_sources.
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
    'expected_conduct', case when 'expected_conduct' = any (h.campos) then null else q.expected_conduct end,
    'inep_intent', q.inep_intent,
    'sources', public.ch_student_sources(q.sources)
  )
  from public.questions q
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb))), '{}'::text[]) as campos
  ) h
  where q.id = p_question_id
    and (
      public.is_staff()
      or exists (select 1 from public.question_attempts a
                 where a.user_id = (select auth.uid()) and a.question_id = q.id)
      or exists (select 1 from public.practice_sessions s
                 where s.user_id = (select auth.uid()) and s.finished_at is not null and q.id = any (s.question_ids))
    )
$$;
-- practice_correction_view: o corpo acima (ch_raw_practice_correction_view) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.practice_correction_view(p_question_id text, p_selected text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_practice_correction_view(p_question_id, p_selected))
$$;
revoke execute on function public.ch_raw_practice_correction_view(text, text) from public, anon, authenticated;


-- O que o Tutor recebe da questão (corpo da 20261003007700).
create or replace function public.ch_raw_tutor_truth(p_question_id text, p_level text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'area', q.area, 'topic', q.topic, 'subtopic', q.subtopic, 'statement', q.statement,
    'exam', (select x.kind || ' ' || x.year from public.exams x where x.id = q.exam_id), 'number', q.number,
    'options', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text',
                  'explanation', case when p_level in ('hint', 'full') and q.status <> 'annulled'
                                       and not ('explanation_' || (o ->> 'id')) = any (h.campos)
                                      then nullif(btrim(o ->> 'explanation'), '') end) order by o ->> 'id') from jsonb_array_elements(q.options) o),
    'official_answer', case when p_level in ('hint', 'full') then q.correct_option end,
    'expected_conduct', case when p_level in ('hint', 'full') and not 'expected_conduct' = any (h.campos) then q.expected_conduct end,
    'inep_intent', case when p_level in ('hint', 'full') then q.inep_intent end,
    'sources', case when p_level = 'full' and jsonb_array_length(q.sources) > 0 then public.ch_student_sources(q.sources) end,
    'analysis', case when p_level = 'full' then (select jsonb_build_object('question_core', a.question_core, 'trap', a.trap, 'golden_rule', a.golden_rule,
                     'options', (select jsonb_agg(jsonb_build_object('option_id', o.option_id, 'reasoning', o.reasoning, 'why_wrong', o.why_wrong, 'trap', o.trap) order by o.option_id) from public.question_option_analysis o where o.analysis_id = a.id))
                   from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published'
                     and public.question_analysis_fits(q.id, a.official_answer_at_analysis)) end,
    'update_card', case when p_level = 'full' then (select jsonb_build_object('official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'sources', public.ch_student_sources(k.sources))
                   from public.question_update_cards k where k.question_id = q.id and k.status = 'published'
                     and public.question_analysis_fits(q.id, k.official_answer) and public.ch_card_shows(k.sources)) end)
  from public.questions q
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(coalesce(q.explanations_review -> 'campos', '[]'::jsonb))), '{}'::text[]) as campos
  ) h
  where q.id = p_question_id
$$;
-- tutor_truth: o corpo acima (ch_raw_tutor_truth) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.tutor_truth(p_question_id text, p_level text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_tutor_truth(p_question_id, p_level))
$$;
revoke execute on function public.ch_raw_tutor_truth(text, text) from public, anon, authenticated;
revoke execute on function public.tutor_truth(text, text) from public, anon, authenticated;


-- Linha do tempo da questão (corpo da 20261003002600): a fonte do gabarito oficial passa por ch_student_text.
create or replace function public.ch_raw_app_question_timeline(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_staff boolean := public.is_staff() or public.ch_is_reviewer();
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not public.question_viewable(p_question_id) then return '[]'::jsonb; end if;
  if not exists (select 1 from public.question_analysis where question_id = p_question_id and status = 'published') and not v_staff then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(e.ev order by e.at, e.ord) from (
    select o.recorded_at as at, 1 as ord, jsonb_build_object('type', 'OFFICIAL_ANSWER', 'at', o.recorded_at, 'version', o.version, 'answer', o.answer, 'status', o.answer_status, 'source', public.ch_student_text(o.source), 'published_at', o.published_at) as ev
      from public.question_official_answers o where o.question_id = p_question_id
    union all
    select a.reviewed_at, 2, jsonb_build_object('type', 'ANALYSIS_PUBLISHED', 'at', a.reviewed_at, 'version', a.version)
      from public.question_analysis a where a.question_id = p_question_id and a.status = 'published' and a.reviewed_at is not null
    union all
    select k.verified_at, 3, jsonb_build_object('type', 'UPDATE_CARD', 'at', k.verified_at, 'version', k.version, 'temporal_status', k.temporal_status, 'impact_level', k.impact_level,
             'official_answer', k.official_answer, 'current_answer', k.current_answer, 'what_changed', k.what_changed, 'effective_date', k.effective_date, 'superseded', k.status = 'superseded')
      from public.question_update_cards k where k.question_id = p_question_id and public.ch_card_shows(k.sources)
    union all
    select u.detected_at, 4, jsonb_build_object('type', 'SOURCE_CHANGE_DETECTED', 'at', u.detected_at, 'impact_level', u.impact_level, 'status', u.status, 'critical', u.critical, 'triage_kind', u.triage_kind, 'reason', u.reason)
      from public.question_updates u where v_staff and u.question_id = p_question_id
    union all
    select l.changed_at, 5, jsonb_build_object('type', 'QUESTION_EDITED', 'at', l.changed_at, 'reason', l.reason, 'fields', (select jsonb_agg(k) from jsonb_object_keys(l.changes) k))
      from public.question_change_log l where v_staff and l.question_id = p_question_id) e), '[]'::jsonb);
end
$$;
-- app_question_timeline: o corpo acima (ch_raw_app_question_timeline) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.app_question_timeline(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_app_question_timeline(p_question_id))
$$;
revoke execute on function public.ch_raw_app_question_timeline(text) from public, anon, authenticated;


-- Podcast publicado (corpo da 20261003009593, a mais nova): fonte marcada como complementar, ou que bate com a biblioteca, não aparece (nem as páginas dela).
create or replace function public.ch_raw_app_podcast(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'title', p.title, 'topic', p.topic, 'area', p.area, 'seconds', p.audio_seconds, 'published_at', p.published_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', l ->> 'text') order by o) from jsonb_array_elements(p.script -> 'lines') with ordinality as x (l, o)), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'title', case when s.kind in ('pdf', 'docx') and not s.title_by_staff then 'Documento ' || s.n::text else s.title end,
                         'kind', s.kind, 'url', s.url, 'pages',
                         (select jsonb_agg(distinct c.page order by c.page) from public.podcast_chunks c
                          where c.source_id = s.id and c.page is not null
                            and c.id in (select (jsonb_array_elements_text(l -> 'sources'))::bigint from jsonb_array_elements(p.script -> 'lines') l)))
                       order by s.n)
      from (select x.*, row_number() over (order by x.position, x.created_at) as n from public.podcast_sources x where x.podcast_id = p.id
               and (public.is_staff() or public.ch_is_reviewer() or not (x.complementar or public.ch_complementar_hit(x.title, x.url) or public.ch_complementar_file(x.sha256, x.storage_path)))) s), '[]'::jsonb),
    'lesson', (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l where l.id = p.lesson_id and l.published))
  from public.podcasts p
  where p.id = p_id and p.status = 'published' and (select auth.uid()) is not null
$$;
-- app_podcast: o corpo acima (ch_raw_app_podcast) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.app_podcast(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_app_podcast(p_id))
$$;
revoke execute on function public.ch_raw_app_podcast(uuid) from public, anon, authenticated;


-- Aula (corpos da 20261003009580, a mais nova): material e diretriz marcados como complementares não saem ao aluno.
create or replace function public.lesson_materials_json(p_lesson uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by x.position, x.created_at), '[]'::jsonb)
  from (
    select m.position, m.created_at,
      jsonb_build_object(
        'id', m.id, 'kind', m.kind,
        'title', case m.kind when 'slides' then 'Material complementar' when 'flashcast' then 'Áudio Flashcast'
                             when 'guideline' then case when m.storage_path is null then m.title else 'Diretriz' end
                             else 'Material ' || row_number() over (partition by m.kind order by m.position, m.created_at) end,
        'has_file', m.storage_path is not null, 'content_type', m.content_type, 'size_bytes', m.size_bytes, 'url', m.url)
      || case when public.is_staff() then jsonb_build_object('file_title', m.title, 'storage_path', m.storage_path, 'review_status', m.review_status,
                                                            'reviewed_at', m.reviewed_at,
                                                            'reviewer', (select coalesce(nullif(p.name, ''), u.email) from auth.users u left join public.profiles p on p.id = u.id where u.id = m.reviewed_by),
                                                            'can_release', public.lesson_can_release(l.area))
              else '{}'::jsonb end as j
    from public.lesson_materials m join public.lessons l on l.id = m.lesson_id
    where m.lesson_id = p_lesson
      and (l.published or public.is_staff())
      and (m.review_status = 'approved' or public.is_staff()) -- áudio aguardando conferência: o aluno não vê
      and (not m.hidden_from_student or public.is_staff())    -- fonte complementar: o aluno não vê
  ) x
$$;
revoke execute on function public.lesson_materials_json(uuid) from public, anon;
grant execute on function public.lesson_materials_json(uuid) to authenticated;

create or replace function public.ch_raw_lesson_view(l public.lessons) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'area', l.area, 'area_label', public.area_label(l.area), 'topic', l.topic, 'title', l.title,
    'duration_minutes', l.duration_minutes, 'instructor', l.instructor, 'specialty', l.specialty, 'video_url', l.video_url,
    'summary', l.summary, 'key_points', to_jsonb(l.key_points), 'guideline_title', case when l.guideline_hidden and not public.is_staff() then null else l.guideline_title end,
    'guideline_url', case when l.guideline_hidden and not public.is_staff() then null else l.guideline_url end,
    'published', l.published, 'position', l.position, 'updated_at', l.updated_at,
    'materials', public.lesson_materials_json(l.id),
    'progress', (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at, 'last_at', p.last_at)
                 from public.lesson_progress p where p.lesson_id = l.id and p.user_id = (select auth.uid())))
$$;
-- lesson_view: o corpo acima (ch_raw_lesson_view) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.lesson_view(l public.lessons) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_lesson_view(l))
$$;
revoke execute on function public.ch_raw_lesson_view(public.lessons) from public, anon, authenticated;


create or replace function public.app_lesson_material(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'kind', m.kind,
           'title', case when public.is_staff() then m.title else case m.kind when 'slides' then 'Material complementar' when 'flashcast' then 'Áudio Flashcast' else 'Material' end end,
           'storage_path', m.storage_path, 'content_type', m.content_type, 'url', m.url)
  from public.lesson_materials m join public.lessons l on l.id = m.lesson_id
  where m.id = p_id and (select auth.uid()) is not null and (l.published or public.is_staff())
    and (m.review_status = 'approved' or public.is_staff()) -- áudio aguardando conferência: nem o link assinado sai para o aluno
    and (not m.hidden_from_student or public.is_staff())    -- fonte complementar: o aluno não vê
$$;
revoke execute on function public.app_lesson_material(uuid) from public, anon;
grant execute on function public.app_lesson_material(uuid) to authenticated;

-- Atualização/diretriz (corpo da 20261003004100): instituição, título e link do documento somem quando identificam fonte complementar.
create or replace function public.ch_raw_guideline_update_view(u public.guideline_updates, p_full boolean) returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'slug', u.slug, 'area', u.area, 'area_label', public.area_label(u.area), 'topic', u.topic, 'subtopic', u.subtopic,
    'years', to_jsonb(u.years), 'priority', u.priority, 'publication_label', u.publication_label, 'institution', case when u.source_hidden and not public.is_staff() then null else u.institution end,
    'document_title', case when u.source_hidden and not public.is_staff() then null else u.document_title end,
    'source_url', case when u.source_hidden and not public.is_staff() then null else u.source_url end, 'before_text', u.before_text, 'current_conduct', u.current_conduct,
    'reviewed', u.review_status = 'approved' and not (u.source_hidden and not public.is_staff()), 'reviewed_at', case when u.review_status = 'approved' and not (u.source_hidden and not public.is_staff()) then u.reviewed_at end,
    'published', u.published, 'updated_at', u.updated_at)
  || case when p_full then jsonb_build_object(
    'timeline', u.timeline, 'clinical_impact', u.clinical_impact, 'exam_impact', u.exam_impact,
    'trap', u.trap, 'flashcards', u.flashcards, 'practice_questions', u.practice_questions, 'search_terms', u.search_terms) else '{}'::jsonb end
$$;
-- guideline_update_view: o corpo acima (ch_raw_guideline_update_view) mais a retirada, só para o aluno, de texto já publicado que cita a apostila.
create or replace function public.guideline_update_view(u public.guideline_updates, p_full boolean) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.ch_scrub_json(public.ch_raw_guideline_update_view(u, p_full))
$$;
revoke execute on function public.ch_raw_guideline_update_view(public.guideline_updates, boolean) from public, anon, authenticated;


-- Leitura direta do aluno (API REST): os campos de fonte digitados pela equipe saem do que o aluno lê nas tabelas. As funções abaixo
-- passam a ser security definer (eles continuam chegando pelas telas, já filtrados) ou a pedir só as colunas que o aluno pode ler.
create or replace function public.app_lessons(p_area text default null, p_search text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with mine as (
    select * from public.lessons l
    where l.published
      and (nullif(p_area, '') is null or l.area::text = p_area)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
           or public.fold_text(l.title || ' ' || l.topic || ' ' || coalesce(l.instructor, '') || ' ' || coalesce(l.summary, '')) like '%' || public.fold_text(btrim(p_search)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*)::int from public.lessons where published),
    'by_area', (select coalesce(jsonb_object_agg(x.area, x.n), '{}'::jsonb) from (select area, count(*)::int n from public.lessons where published group by area) x),
    'completed', (select count(*)::int from public.lesson_progress p join public.lessons l on l.id = p.lesson_id where p.user_id = (select auth.uid()) and p.completed_at is not null and l.published),
    'lessons', coalesce((select jsonb_agg(public.lesson_view(m) order by m.position, m.created_at) from mine m), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create or replace function public.app_lesson(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.lesson_view(l) || jsonb_build_object(
    'questions_topic', (select count(*)::int from public.practice_pool(jsonb_build_object('area', l.area, 'topic', l.topic))),
    'questions_area', (select count(*)::int from public.practice_pool(jsonb_build_object('area', l.area))))
  from public.lessons l where l.id = p_id and (select auth.uid()) is not null and (l.published or public.is_staff())
$$;

create or replace function public.app_start_lesson_questions(p_id uuid, p_count integer default 20) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  l record; -- só id, área e tema: os campos de fonte da aula o aluno não lê
  v_filters jsonb;
begin
  select id, area, topic into l from public.lessons where id = p_id;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  v_filters := jsonb_build_object('area', l.area, 'topic', l.topic);
  if (select count(*) from public.practice_pool(v_filters)) = 0 then v_filters := jsonb_build_object('area', l.area); end if;
  return public.app_start_session('questoes', v_filters, coalesce(p_count, 20)) || jsonb_build_object('filters', v_filters, 'lesson_id', l.id);
end
$$;

-- A busca do aluno olha só campos que ele vê (não a instituição nem o título do documento, que podem estar escondidos).
create or replace function public.app_guideline_updates(p_area text default null, p_year integer default null, p_search text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with pub as (select * from public.guideline_updates u where u.published),
  hit as (
    select * from pub u
    where (nullif(p_area, '') is null or u.area::text = p_area)
      and (p_year is null or p_year::smallint = any (u.years))
      and (nullif(btrim(coalesce(p_search, '')), '') is null
           or public.fold_text(concat_ws(' ', u.topic, u.subtopic, u.before_text, u.current_conduct, u.timeline::text))
              like '%' || public.fold_text(btrim(p_search)) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*)::int from pub),
    'by_area', (select coalesce(jsonb_object_agg(x.area, x.n), '{}'::jsonb) from (select area, count(*)::int n from pub group by area) x),
    'years', (select coalesce(jsonb_agg(distinct y order by y), '[]'::jsonb) from pub, unnest(pub.years) y),
    'items', coalesce((select jsonb_agg(public.guideline_update_view(h, false) order by h.priority, h.position, h.topic) from hit h), '[]'::jsonb))
  where (select auth.uid()) is not null
$$;

create or replace function public.app_guideline_update(p_slug text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select public.guideline_update_view(u, true) || jsonb_build_object(
    'questions_count', case when nullif(btrim(coalesce(u.search_terms, '')), '') is null then 0
                            else (select count(*)::int from public.practice_pool(jsonb_build_object('area', u.area, 'search', u.search_terms))) end)
  from public.guideline_updates u where u.slug = p_slug and (select auth.uid()) is not null
    and (u.published or public.is_staff() or public.ch_is_reviewer())
$$;

create or replace function public.app_start_guideline_questions(p_slug text, p_count integer default 20) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  u record; -- só id, área e termos de busca: os campos de fonte da atualização o aluno não lê
  v_filters jsonb;
begin
  select id, area, search_terms into u from public.guideline_updates where slug = p_slug;
  if not found then raise exception 'Atualização não encontrada.' using errcode = 'P0002'; end if;
  v_filters := jsonb_build_object('area', u.area);
  if nullif(btrim(coalesce(u.search_terms, '')), '') is not null
     and (select count(*) from public.practice_pool(v_filters || jsonb_build_object('search', u.search_terms))) > 0 then
    v_filters := v_filters || jsonb_build_object('search', u.search_terms);
  end if;
  return public.app_start_session('questoes', v_filters, coalesce(p_count, 20)) || jsonb_build_object('filters', v_filters);
end
$$;


do $cols$
declare
  v_cols text;
begin
  -- questions: a coluna de fontes não é mais lida direto pelo aluno (a correção devolve a fonte filtrada)
  revoke select (sources) on table public.questions from anon, authenticated;
  -- lessons e guideline_updates: o aluno lê direto só as colunas que não carregam fonte digitada pela equipe
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lessons' and column_name not in ('guideline_title', 'guideline_url', 'guideline_hidden', 'created_by');
  revoke select on table public.lessons from anon, authenticated;
  execute format('grant select (%s) on table public.lessons to anon, authenticated', v_cols);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'guideline_updates' and column_name not in ('institution', 'document_title', 'source_url', 'source_hidden', 'source_checked_at', 'review_note', 'reviewed_by', 'updated_by', 'legacy', 'origin');
  revoke select on table public.guideline_updates from anon, authenticated;
  execute format('grant select (%s) on table public.guideline_updates to anon, authenticated', v_cols);
end
$cols$;

create or replace function public.ch_worker_claims_by_ids(p_ids uuid[]) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'statement', c.statement, 'proposed_text', c.proposed_text, 'status', c.status,
           'critical_kinds', c.critical_kinds, 'context', c.context, 'document_id', c.document_id,
           'evidence', (select coalesce(jsonb_agg(jsonb_build_object('source_id', s.id, 'source', s.title, 'organ', s.organ, 'version', e.source_version,
                          'url', s.url, 'audience', s.audience, 'published_on', s.published_on, 'section', e.section, 'page', e.page, 'quote', e.quote, 'verdict', e.verdict,
                          'simulated', coalesce((e.numeric_check ->> 'simulated')::boolean, false)) order by e.created_at), '[]'::jsonb)
                        from public.ch_evidence e join public.ch_sources s on s.id = e.source_id where e.claim_id = c.id and not e.stale))), '[]'::jsonb)
  from public.ch_claims c where c.id = any (p_ids)
$$;
revoke execute on function public.ch_worker_claims_by_ids(uuid[]) from public, anon, authenticated;

-- Envolve funções existentes SEM copiar o corpo: a função antiga passa a se chamar ch_raw_<nome> (só uma vez; colar de novo não
-- renomeia de novo) e o nome original fica com um invólucro que filtra a saída ao aluno ou confere a entrada da equipe.
create or replace function public.ch_take_raw(p_name text, p_args text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_oid oid := to_regprocedure('public.' || p_name || '(' || p_args || ')');
begin
  if v_oid is null then raise exception 'Função % não existe.', p_name; end if;
  if position('ch_wrapper' in pg_get_functiondef(v_oid)) = 0 then
    execute format('alter function public.%I(%s) rename to %I', p_name, p_args, 'ch_raw_' || p_name);
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated', 'ch_raw_' || p_name, p_args);
  end if;
end
$$;
revoke execute on function public.ch_take_raw(text, text) from public, anon, authenticated;

select public.ch_take_raw('app_tutor_session', 'uuid');
select public.ch_take_raw('app_podcasts', 'text');
select public.ch_take_raw('app_announcement', '');
select public.ch_take_raw('app_admin_podcast_approve', 'uuid, text');
select public.ch_take_raw('app_admin_podcast_publish', 'uuid, boolean');
select public.ch_take_raw('app_admin_review_guideline_update', 'uuid, text, text');
select public.ch_take_raw('app_admin_publish_guideline_update', 'uuid, boolean');

-- Conversa do Tutor e lista de podcasts: mesma retirada de texto que cita a apostila, só para o aluno (histórico antigo incluído).
create or replace function public.app_tutor_session(p_session_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select public.ch_scrub_json(public.ch_raw_app_tutor_session(p_session_id)) /* ch_wrapper */ $$;
create or replace function public.app_podcasts(p_area text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select public.ch_scrub_json(public.ch_raw_app_podcasts(p_area)) /* ch_wrapper */ $$;
create or replace function public.app_announcement() returns jsonb
  language sql stable security definer set search_path = ''
as $$ select public.ch_scrub_json(public.ch_raw_app_announcement()) /* ch_wrapper */ $$;
revoke execute on function public.app_announcement() from public, anon;
revoke execute on function public.app_tutor_session(uuid) from public, anon;
revoke execute on function public.app_podcasts(text) from public, anon;

-- Aprovar ou publicar roteiro de podcast que cita a apostila: recusado (o aviso cites_material não é só aviso).
create or replace function public.ch_podcast_script_check(p_id uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.podcasts p
              where p.id = p_id and public.ch_text_cites(concat_ws(' ', p.title, p.topic, (select string_agg(l ->> 'text', ' ') from jsonb_array_elements(coalesce(p.script -> 'lines', '[]'::jsonb)) l)),
                    coalesce((select array_agg(c.chave) from public.ch_complementar_keys() c where c.distintiva), '{}'::text[]))) then
    raise exception 'O roteiro cita uma fonte complementar cadastrada (nome do material, da editora ou sigla). Tire a citação antes de aprovar ou publicar.' using errcode = '22023';
  end if;
end
$$;
revoke execute on function public.ch_podcast_script_check(uuid) from public, anon, authenticated;
create or replace function public.app_admin_podcast_approve(p_id uuid, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff(); -- ch_wrapper
  perform public.ch_podcast_script_check(p_id);
  return public.ch_raw_app_admin_podcast_approve(p_id, p_note);
end
$$;
create or replace function public.app_admin_podcast_publish(p_id uuid, p_published boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff(); -- ch_wrapper
  if coalesce(p_published, false) then perform public.ch_podcast_script_check(p_id); end if;
  return public.ch_raw_app_admin_podcast_publish(p_id, p_published);
end
$$;
revoke execute on function public.app_admin_podcast_approve(uuid, text) from public, anon;
revoke execute on function public.app_admin_podcast_publish(uuid, boolean) from public, anon;

-- Atualização/diretriz: aprovar e publicar só com documento OFICIAL (o documento escondido é uma fonte complementar).
create or replace function public.ch_guideline_official_check(p_id uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.guideline_updates u where u.id = p_id and u.source_hidden) then
    raise exception 'O documento desta atualização é uma fonte complementar (apostila): o aluno não pode ver essa fonte. Para aprovar ou publicar, use um documento oficial.' using errcode = '22023';
  end if;
end
$$;
revoke execute on function public.ch_guideline_official_check(uuid) from public, anon, authenticated;
create or replace function public.app_admin_review_guideline_update(p_id uuid, p_decision text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_decision = 'approve' and (select auth.uid()) is not null and (public.is_staff() or public.ch_is_reviewer()) then perform public.ch_guideline_official_check(p_id); end if; -- ch_wrapper
  return public.ch_raw_app_admin_review_guideline_update(p_id, p_decision, p_note);
end
$$;
create or replace function public.app_admin_publish_guideline_update(p_id uuid, p_published boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p_published, false) and (select auth.uid()) is not null and (public.is_staff() or public.ch_is_reviewer()) then perform public.ch_guideline_official_check(p_id); end if; -- ch_wrapper
  return public.ch_raw_app_admin_publish_guideline_update(p_id, p_published);
end
$$;
revoke execute on function public.app_admin_review_guideline_update(uuid, text, text) from public, anon;
revoke execute on function public.app_admin_publish_guideline_update(uuid, boolean) from public, anon;

-- Marca guardada das linhas que já existem (só onde bate com a biblioteca).
select public.ch_refresh_hidden_flags();

-- Fonte de podcast: a equipe marca que é complementar (o aluno deixa de ver a fonte e as páginas dela).
create or replace function public.app_admin_podcast_source_complementar(p_source_id uuid, p_complementar boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_podcast uuid;
begin
  perform public.assert_staff();
  update public.podcast_sources set complementar = coalesce(p_complementar, false) where id = p_source_id returning podcast_id into v_podcast;
  if v_podcast is null then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.admin_log('podcast.source_complementar', v_podcast::text, jsonb_build_object('source', p_source_id, 'complementar', coalesce(p_complementar, false)));
  return public.podcast_admin_view(v_podcast);
end
$$;

-- Varredura para o administrador: texto JÁ publicado ao aluno que cita o título completo, o órgão distintivo ou a sigla de uma
-- fonte complementar cadastrada ("apostila" e "Sangue nos Olhos" soltos não entram, regra do dono de 2026-10-11) (a conferência da IA só vale para textos novos). Pode ter falso positivo: a equipe lê e decide.
create or replace function public.ch_text_mentions(p_text text, p_terms text[]) returns boolean
  language sql stable set search_path = ''
as $$
  select exists (select 1 from unnest(p_terms) k where k <> '' and ' ' || public.ch_text_key(p_text) || ' ' like '% ' || k || ' %')
$$;

create or replace function public.app_ch_complementar_mentions() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_terms text[];
begin
  perform public.assert_admin();
  select coalesce(array_agg(distinct x.t), '{}') into v_terms
    from (select c.chave as t from public.ch_complementar_keys() c where c.distintiva) x;
  return coalesce((select jsonb_agg(r.item order by r.kind, r.id) from (
    select 'analise' as kind, a.question_id as id, jsonb_build_object('kind', 'analise', 'id', a.question_id, 'onde', 'Análise publicada da questão') as item
      from public.question_analysis a
     where a.is_current and a.status = 'published'
       and public.ch_text_mentions(concat_ws(' ', a.question_core, a.trap, a.golden_rule, a.key_data::text, (select string_agg(concat_ws(' ', o.reasoning, o.why_plausible, o.why_wrong, o.when_correct, o.concept_difference, o.trap), ' ') from public.question_option_analysis o where o.analysis_id = a.id)), v_terms)
    union all
    select 'comentario', c.analysis_id::text, jsonb_build_object('kind', 'comentario', 'id', c.analysis_id::text, 'onde', 'Comentário publicado da questão')
      from public.question_comments c where c.status = 'published' and public.ch_text_mentions(c.content::text, v_terms)
    union all
    select 'cartao', k.question_id, jsonb_build_object('kind', 'cartao', 'id', k.question_id, 'onde', 'Cartão de atualização publicado')
      from public.question_update_cards k where k.status = 'published' and public.ch_text_mentions(concat_ws(' ', k.what_changed, k.why_it_matters, k.options_affected::text), v_terms)
    union all
    select 'aula', l.id::text, jsonb_build_object('kind', 'aula', 'id', l.id::text, 'onde', 'Aula publicada: ' || l.title)
      from public.lessons l where l.published and public.ch_text_mentions(concat_ws(' ', l.title, l.topic, l.summary, array_to_string(l.key_points, ' ')), v_terms)
    union all
    select 'podcast', p.id::text, jsonb_build_object('kind', 'podcast', 'id', p.id::text, 'onde', 'Podcast publicado: ' || p.title)
      from public.podcasts p where p.status = 'published' and public.ch_text_mentions(concat_ws(' ', p.title, p.topic, p.script::text), v_terms)
    union all
    select 'atualizacao', u.id::text, jsonb_build_object('kind', 'atualizacao', 'id', u.id::text, 'onde', 'Atualização publicada: ' || u.topic)
      from public.guideline_updates u where u.published and public.ch_text_mentions(concat_ws(' ', u.before_text, u.current_conduct, u.clinical_impact, u.exam_impact, u.trap), v_terms)
  ) r), '[]'::jsonb);
end
$$;

-- Conferência depois de colar migrações: lista as funções do aluno que perderam o filtro da fonte complementar (acontece se a 9580
-- ou a 9593 for colada DE NOVO depois da 9620: elas redefinem lesson_materials_json, app_lesson_material e app_podcast sem o filtro).
-- Quando "ok" for falso, cole a 9620 de novo.
create or replace function public.app_ch_complementar_check() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_falta text[] := '{}';
  r record;
begin
  perform public.assert_admin();
  for r in
    select x.nome, x.marca from (values
      ('app_question_commentary', 'ch_scrub_json'), ('practice_correction_view', 'ch_scrub_json'), ('tutor_truth', 'ch_scrub_json'),
      ('app_question_timeline', 'ch_scrub_json'), ('app_podcast', 'ch_scrub_json'), ('lesson_view', 'ch_scrub_json'),
      ('guideline_update_view', 'ch_scrub_json'), ('lesson_materials_json', 'hidden_from_student'), ('app_lesson_material', 'hidden_from_student'),
      ('app_tutor_session', 'ch_wrapper'), ('app_announcement', 'ch_wrapper'), ('app_podcasts', 'ch_wrapper'), ('app_admin_podcast_approve', 'ch_wrapper'), ('app_admin_podcast_publish', 'ch_wrapper'), ('app_admin_review_guideline_update', 'ch_wrapper'), ('app_admin_publish_guideline_update', 'ch_wrapper'),
      ('app_lessons', 'security definer'), ('app_lesson', 'security definer'), ('app_guideline_updates', 'security definer'), ('app_guideline_update', 'security definer')
    ) as x (nome, marca)
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = r.nome and position(r.marca in lower(pg_get_functiondef(p.oid))) > 0) then
      v_falta := v_falta || r.nome;
    end if;
  end loop;
  return jsonb_build_object('ok', cardinality(v_falta) = 0, 'faltando', to_jsonb(v_falta));
end
$$;

-- Siglas e apelidos da fonte ("SNO"): só administrador. Texto que cite um deles nunca chega ao aluno.
create or replace function public.app_ch_set_source_aliases(p_source_id uuid, p_aliases text[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_list text[];
begin
  perform public.assert_admin();
  select coalesce(array_agg(distinct btrim(a)), '{}') into v_list from unnest(coalesce(p_aliases, '{}')) a where char_length(public.ch_text_key(a)) >= 3;
  update public.ch_sources set aliases = v_list where id = p_source_id;
  if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_log('source.aliases', p_source_id::text, jsonb_build_object('aliases', to_jsonb(v_list)));
  return jsonb_build_object('id', p_source_id, 'aliases', to_jsonb(v_list));
end
$$;

-- Evidências de uma afirmação para a IA e a equipe: agora com a classe da fonte (a seção "Referências" do material publicado só
-- imprime fonte OFICIAL; corpo da 20261003001500, a única definição).

-- ---------------------------------------------------------------- 99. permissões
do $perm$
begin
  -- internas: só o banco chama
  revoke execute on function public.ch_sources_audience_guard() from public, anon, authenticated;
  revoke execute on function public.ch_sources_audience_log() from public, anon, authenticated;
  revoke execute on function public.ch_complementar_keys() from public, anon, authenticated;
  revoke execute on function public.ch_text_cites(text, text[]) from public, anon, authenticated;
  revoke execute on function public.ch_scrub_json(jsonb, text[]) from public, anon, authenticated;
  revoke execute on function public.ch_scrub_json(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_card_shows(jsonb) from public, anon, authenticated;
  revoke execute on function public.app_ch_complementar_check() from public, anon;
  revoke execute on function public.app_lessons(text, text) from anon;
  revoke execute on function public.app_lesson(uuid) from anon;
  revoke execute on function public.app_guideline_updates(text, integer, text) from anon;
  revoke execute on function public.app_guideline_update(text) from anon;
  revoke execute on function public.ch_text_key(text) from public, anon, authenticated;
  revoke execute on function public.ch_text_key_ns(text) from public, anon, authenticated;
  revoke execute on function public.ch_url_host(text) from public, anon, authenticated;
  revoke execute on function public.ch_complementar_file(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_refresh_hidden_flags_trg() from public, anon, authenticated;
  revoke execute on function public.ch_worker_file_sha(text, text) from public, anon, authenticated;
  revoke execute on function public.app_ch_set_source_aliases(uuid, text[]) from public, anon;
  revoke execute on function public.ch_complementar_hit(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_decode_entities(text) from public, anon, authenticated;
  revoke execute on function public.ch_source_item_hit(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_student_sources(jsonb) from public, anon, authenticated;
  revoke execute on function public.ch_student_text(text, text) from public, anon, authenticated;
  revoke execute on function public.ch_worker_complementar_terms() from public, anon, authenticated;
  revoke execute on function public.ch_lessons_hidden_flag() from public, anon, authenticated;
  revoke execute on function public.ch_lesson_materials_hidden_flag() from public, anon, authenticated;
  revoke execute on function public.ch_guideline_updates_hidden_flag() from public, anon, authenticated;
  revoke execute on function public.ch_refresh_hidden_flags() from public, anon, authenticated;
  -- telas
  revoke execute on function public.app_ch_set_source_audience(uuid, text, text) from public, anon;
  revoke execute on function public.ch_text_mentions(text, text[]) from public, anon, authenticated;
  revoke execute on function public.app_ch_complementar_mentions() from public, anon;
  revoke execute on function public.app_ch_source_audiences() from public, anon;
  revoke execute on function public.app_admin_podcast_source_complementar(uuid, boolean) from public, anon;
  revoke execute on function public.app_ch_set_source_authority(uuid, text) from public, anon;
  revoke execute on function public.app_question_commentary(text, text) from public, anon;
  revoke execute on function public.tutor_truth(text, text) from public, anon, authenticated;
  revoke execute on function public.app_question_timeline(text) from public, anon;
  revoke execute on function public.app_podcast(uuid) from public, anon;
end
$perm$;
