-- =============================================================================
-- Central de Conteúdo › Unidades (pedido do dono, 13/10/2026): a ferramenta da equipe para aulas como a GR-001.
--
--   1. ch_unit_materials: lista de materiais da unidade (tipo, quem vê, estado, posição). Os materiais que já existem
--      (ch_materials e os arquivos da aula importada) entram sozinhos como itens; a equipe INSERE (tabela, áudio, vídeo por
--      link/embed seguro, ou devolve um item retirado), RETIRA (o item fica no histórico, nada é apagado) e PRÉ-VISUALIZA.
--      PDF interativo, PDF da A4, card de feed, story e flashcards A6 são SEMPRE só da equipe (regra do banco, não da tela).
--   2. Ficha do revisor médico (ch_review_sheets/ch_review_decisions): decisões, pontos a conferir, notas das questões,
--      o que ficou fora; cada decisão do revisor é gravada com quem, quando e a observação.
--   3. Aprovação médica: administrador OU revisor médico da área (decisão do dono, 13/10). Editor e aluno nunca; sem usuário
--      (processamento, IA, automação) nunca. A aprovação grava o hash exato da versão, a ficha das decisões e o resumo do que
--      foi aprovado. Continua separada da aprovação editorial e da publicação; não publica nada sozinha.
--   4. RPCs de leitura da tela: lista de unidades, cabeçalho + caminho até publicar, resumo para o aprovador, histórico.
--
-- Não redefine funções de outras migrações além de app_ch_approve (1400). Não mexe na casca do portão (9960).
-- Pode ser colada duas ou mais vezes (if not exists, create or replace, drop ... if exists).
-- =============================================================================

-- ---------------------------------------------------------------- 1. materiais da unidade
create table if not exists public.ch_unit_materials (
  id uuid primary key default gen_random_uuid(),
  unit_version_id uuid not null references public.ch_unit_versions (id) on delete cascade,
  kind text not null check (kind in ('texto_aula', 'tabela', 'questoes_fixacao', 'flashcards_ilustrados', 'revisao_aula', 'pdf_interativo', 'pdf_a4',
                                     'card_feed', 'story', 'flashcards_a6', 'audio', 'video')),
  ref_key text,                                   -- itens que vêm dos materiais/arquivos da aula (um por versão); inseridos pela equipe ficam sem
  title text not null check (char_length(btrim(title)) between 1 and 200),
  visibility text not null check (visibility in ('aluno', 'equipe')),
  status text not null default 'ativo' check (status in ('ativo', 'retirado')),
  origin text not null check (origin in ('importado', 'inserido')),
  source text not null check (source in ('derivado', 'link', 'conteudo')),
  position integer not null default 0 check (position >= 0),     -- 0 = antes da aula; n = depois da seção n
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  url text check (url is null or url ~ '^https://'),
  embed_url text check (embed_url is null or embed_url ~ '^https://'),
  content jsonb not null default '{}'::jsonb,     -- tabela (headers, rows), legenda, transcrição, nota
  files jsonb not null default '[]'::jsonb,       -- arquivos do depósito protegido (caminho, sha256, tipo): só a equipe abre
  claim_ids uuid[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  retired_by uuid references auth.users (id) on delete set null,
  retired_at timestamptz,
  retire_reason text,
  constraint ch_unit_materials_so_equipe check (kind not in ('pdf_interativo', 'pdf_a4', 'card_feed', 'story', 'flashcards_a6') or visibility = 'equipe'),
  constraint ch_unit_materials_midia check (kind not in ('audio', 'video') or (source = 'link' and embed_url is not null))
);
create unique index if not exists ch_unit_materials_ref_idx on public.ch_unit_materials (unit_version_id, ref_key) where ref_key is not null;
create index if not exists ch_unit_materials_version_idx on public.ch_unit_materials (unit_version_id);
alter table public.ch_unit_materials enable row level security;
revoke all on table public.ch_unit_materials from public, anon, authenticated;     -- leitura e escrita só pelas funções abaixo (aluno nunca lê)

-- ---------------------------------------------------------------- 2. ficha do revisor médico
create table if not exists public.ch_review_sheets (
  unit_version_id uuid primary key references public.ch_unit_versions (id) on delete cascade,
  sheet jsonb not null,                           -- {intro, decisoes[{n,titulo,pergunta,como_esta,onde}], pontos[], fixacao[], fora[], apresentacao[]}
  sheet_hash text not null,
  origin_name text,                               -- ex.: para-o-revisor-medico.md (v3)
  imported_by uuid references auth.users (id) on delete set null,
  imported_at timestamptz not null default now()
);
alter table public.ch_review_sheets enable row level security;
revoke all on table public.ch_review_sheets from public, anon, authenticated;

create table if not exists public.ch_review_decisions (
  id bigint generated always as identity primary key,
  unit_version_id uuid not null references public.ch_unit_versions (id) on delete cascade,
  n integer not null check (n between 1 and 99),
  decision text not null check (decision in ('de_acordo', 'mudar')),
  note text check (note is null or char_length(note) <= 4000),
  decided_by uuid not null references auth.users (id),
  decided_at timestamptz not null default now()
);
create index if not exists ch_review_decisions_idx on public.ch_review_decisions (unit_version_id, n, id desc);
alter table public.ch_review_decisions enable row level security;
revoke all on table public.ch_review_decisions from public, anon, authenticated;

alter table public.ch_approvals add column if not exists sheet jsonb;      -- as decisões da ficha como estavam quando aprovou
alter table public.ch_approvals add column if not exists summary jsonb;    -- o resumo que o aprovador viu (versão, afirmações, o que mudou)

-- ---------------------------------------------------------------- 3. apoio
-- Quem pode dar a aprovação médica: administrador ou revisor médico da área. Nunca editor, aluno nem processamento (sem usuário).
create or replace function public.ch_can_approve_medical(p_area_code text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (public.is_admin() or public.ch_is_reviewer(p_area_code))
$$;
revoke execute on function public.ch_can_approve_medical(text) from public, anon, authenticated;

create or replace function public.ch_unit_code(p_unit_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select a.details ->> 'codigo' from public.ch_audit a
   where a.action = 'unit.import' and a.target in (select v.id::text from public.ch_unit_versions v where v.unit_id = p_unit_id) and a.details ->> 'codigo' is not null
   order by a.id limit 1
$$;
revoke execute on function public.ch_unit_code(uuid) from public, anon, authenticated;

create or replace function public.ch_unit_words(p_version_id uuid) returns integer
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(coalesce(array_length(regexp_split_to_array(btrim(p #>> '{}'), '\s+'), 1), 0)), 0)::int
    from public.ch_unit_versions v, jsonb_path_query(v.content, 'lax $.sections[*].paragraphs[*].text') p
   where v.id = p_version_id and btrim(p #>> '{}') <> ''
$$;
revoke execute on function public.ch_unit_words(uuid) from public, anon, authenticated;

-- Subárea (nível acima do tema) e nome da área, para o cabeçalho.
create or replace function public.ch_unit_path(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select n.* from public.ch_taxonomy_nodes n join public.ch_units u on u.theme_node_id = n.id join public.ch_unit_versions v on v.unit_id = u.id where v.id = p_version_id
    union all select p.* from public.ch_taxonomy_nodes p join up on up.parent_id = p.id)
  select jsonb_build_object('area', (select name from up where level = 'area'), 'area_code', (select code from up where level = 'area'),
                            'subarea', (select name from up where level = 'subarea'), 'tema', (select name from up where level in ('theme', 'subtheme') order by level limit 1))
$$;
revoke execute on function public.ch_unit_path(uuid) from public, anon, authenticated;

-- Questões ligadas ao tema (tabela dos Grandes Temas, se já existir no banco): só contagem real; sem a tabela, nulo.
create or replace function public.ch_unit_questions_linked(p_unit_id uuid) returns integer
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_code text := public.ch_unit_code(p_unit_id);
  n integer;
begin
  if v_code is null or to_regclass('public.grande_tema_questoes') is null or to_regclass('public.questions') is null then return null; end if;
  execute 'select count(*)::int from public.grande_tema_questoes g where g.tema_id = $1 and exists (select 1 from public.questions q where q.id::text = g.question_id)' into n using v_code;
  return n;
end
$$;
revoke execute on function public.ch_unit_questions_linked(uuid) from public, anon, authenticated;

-- Endereço de áudio/vídeo que pode ser exibido dentro do sistema: só YouTube (sem cookies) e Vimeo, sempre como player embutido.
-- Link direto para arquivo (.mp3/.mp4) NÃO entra: o aluno ganharia o endereço do arquivo.
create or replace function public.ch_embed_url(p_url text) returns text
  language plpgsql immutable set search_path = ''
as $$
declare
  u text := btrim(coalesce(p_url, ''));
  m text[];
begin
  m := regexp_match(u, '^https://(?:www\.|m\.)?youtube\.com/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$');
  if m is null then m := regexp_match(u, '^https://youtu\.be/([A-Za-z0-9_-]{11})(?:[?#].*)?$'); end if;
  if m is null then m := regexp_match(u, '^https://(?:www\.)?youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]{11})(?:[?#].*)?$'); end if;
  if m is not null then return 'https://www.youtube-nocookie.com/embed/' || m[1]; end if;
  m := regexp_match(u, '^https://(?:www\.)?vimeo\.com/([0-9]{6,12})(?:[/?#].*)?$');
  if m is null then m := regexp_match(u, '^https://player\.vimeo\.com/video/([0-9]{6,12})(?:[?#].*)?$'); end if;
  if m is not null then return 'https://player.vimeo.com/video/' || m[1]; end if;
  return null;
end
$$;

-- Marca de citação no texto do aluno (a mesma regra da importação de aula pronta).
create or replace function public.ch_has_citation_mark(p_text text) returns boolean
  language sql immutable set search_path = ''
as $$
  select coalesce(p_text, '') ~ '\[\s*[A-Za-z]{0,4}\s*\d+[^\]]{0,40}\]'
      or lower(translate(coalesce(p_text, ''), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) like '%trechos citados%'
$$;

-- Itens que a aula já tem (materiais e arquivos da importação) viram linhas da lista, uma vez por versão. A versão para corrigir herda
-- a lista da versão de origem (inclusive o que estava retirado). Idempotente.
create or replace function public.ch_unit_materials_sync(p_version_id uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  m record;
  f jsonb;
  pdfs jsonb;
  imgs jsonb;
  n integer;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then return; end if;
  if v.candidate_of is not null and not exists (select 1 from public.ch_unit_materials x where x.unit_version_id = p_version_id) then
    insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, status, origin, source, position, duration_seconds, url, embed_url, content, files, claim_ids,
                                          created_by, created_at, retired_by, retired_at, retire_reason)
    select p_version_id, kind, ref_key, title, visibility, status, origin, source, position, duration_seconds, url, embed_url, content, files, claim_ids,
           created_by, created_at, retired_by, retired_at, retire_reason
      from public.ch_unit_materials x where x.unit_version_id = v.candidate_of;
  end if;
  for m in select * from public.ch_materials where unit_version_id = p_version_id loop
    if m.kind = 'lesson' then
      n := coalesce(jsonb_array_length(m.content -> 'sections'), 0);
      insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, position, claim_ids)
      values (p_version_id, 'texto_aula', 'lesson', 'Texto da aula (' || n || ' seções)', 'aluno', 'importado', 'derivado', 0, m.claim_ids) on conflict do nothing;
      -- PDF interativo do aluno: arquivo da aula (só equipe; o aluno nunca baixa PDF)
      pdfs := coalesce((select jsonb_agg(a) from jsonb_array_elements(coalesce(m.content -> 'arquivos', '[]'::jsonb)) a where a ->> 'tipo' = 'application/pdf'), '[]'::jsonb);
      if jsonb_array_length(pdfs) > 0 then
        insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, files)
        values (p_version_id, 'pdf_interativo', 'pdf_interativo', 'PDF interativo da aula (só equipe)', 'equipe', 'importado', 'derivado', pdfs) on conflict do nothing;
      end if;
    elsif m.kind = 'questions' then
      insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, position, claim_ids)
      values (p_version_id, 'questoes_fixacao', 'questions', 'Questões de fixação (' || coalesce(jsonb_array_length(m.content -> 'items'), 0) || ')', 'aluno', 'importado', 'derivado', 99, m.claim_ids) on conflict do nothing;
    elsif m.kind = 'table' then
      insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, content, claim_ids)
      values (p_version_id, 'tabela', 'table', 'Tabela da aula', 'aluno', 'importado', 'derivado', m.content, m.claim_ids) on conflict do nothing;
    elsif m.kind = 'flashcards' then
      imgs := coalesce((select jsonb_agg(a order by a ->> 'caminho') from jsonb_array_elements(coalesce(m.content -> 'arquivos', '[]'::jsonb)) a
                         where a ->> 'caminho' ~* '-digital-(frente|verso)\.png$'), '[]'::jsonb);
      insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, position, files, claim_ids)
      values (p_version_id, 'flashcards_ilustrados', 'flashcards', 'Flashcards ilustrados (' || coalesce(jsonb_array_length(m.content -> 'cards'), 0) || ' cartões)', 'aluno', 'importado', 'derivado', 99, imgs, m.claim_ids) on conflict do nothing;
      imgs := coalesce((select jsonb_agg(a order by a ->> 'caminho') from jsonb_array_elements(coalesce(m.content -> 'arquivos', '[]'::jsonb)) a
                         where a ->> 'caminho' ~* '-a6(\.pdf|-frente-previa\.png|-verso-previa\.png)$'), '[]'::jsonb);
      if jsonb_array_length(imgs) > 0 then
        insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, files)
        values (p_version_id, 'flashcards_a6', 'flashcards_a6', 'Flashcards A6 para impressão (só equipe)', 'equipe', 'importado', 'derivado', imgs) on conflict do nothing;
      end if;
    elsif m.kind = 'visual_cards' then
      for f in select a from jsonb_array_elements(coalesce(m.content -> 'arquivos', '[]'::jsonb)) a loop
        if f ->> 'caminho' ~* 'pagina-a4\.png$' then
          insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, position, files)
          values (p_version_id, 'revisao_aula', 'revisao_aula', 'Revisão da Aula (página A4, vista dentro da aula)', 'aluno', 'importado', 'derivado', 98, jsonb_build_array(f)) on conflict do nothing;
        elsif f ->> 'caminho' ~* 'pagina-a4\.pdf$' then
          insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, files)
          values (p_version_id, 'pdf_a4', 'pdf_a4', 'PDF da página A4 (só equipe)', 'equipe', 'importado', 'derivado', jsonb_build_array(f)) on conflict do nothing;
        elsif f ->> 'caminho' ~* 'card-feed\.png$' then
          insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, files)
          values (p_version_id, 'card_feed', 'card_feed', 'Card de feed (só equipe)', 'equipe', 'importado', 'derivado', jsonb_build_array(f)) on conflict do nothing;
        elsif f ->> 'caminho' ~* 'card-story\.png$' then
          insert into public.ch_unit_materials (unit_version_id, kind, ref_key, title, visibility, origin, source, files)
          values (p_version_id, 'story', 'story', 'Story (só equipe)', 'equipe', 'importado', 'derivado', jsonb_build_array(f)) on conflict do nothing;
        end if;
      end loop;
    end if;
  end loop;
end
$$;
revoke execute on function public.ch_unit_materials_sync(uuid) from public, anon, authenticated;

-- Mudar item que o aluno vê, depois de aprovado: a aprovação deixa de valer (o aluno veria algo que o revisor não viu).
create or replace function public.ch_unit_materials_touch(p_version_id uuid, p_action text, p_item uuid, p_details jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.invalidated_at is null) then
    perform public.ch_invalidate_approvals(p_version_id, 'material da unidade alterado');
  end if;
  perform public.ch_log(p_action, p_version_id::text, p_details || jsonb_build_object('item', p_item));
end
$$;
revoke execute on function public.ch_unit_materials_touch(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. materiais: ler, inserir, retirar
create or replace function public.app_ch_unit_materials(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  if not exists (select 1 from public.ch_unit_versions where id = p_version_id) then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_unit_materials_sync(p_version_id);
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'title', x.title, 'visibility', x.visibility, 'status', x.status, 'origin', x.origin,
           'source', x.source, 'position', x.position, 'duration_seconds', x.duration_seconds, 'url', x.url, 'embed_url', x.embed_url, 'content', x.content,
           'files', (select coalesce(jsonb_agg(jsonb_build_object('idx', t.i - 1, 'tipo', f ->> 'tipo', 'bytes', f ->> 'bytes', 'texto_alternativo', f ->> 'texto_alternativo', 'rotulo', regexp_replace(f ->> 'caminho', '^.*/', '')) order by t.i), '[]'::jsonb)
                       from jsonb_array_elements(x.files) with ordinality as t (f, i)),
           'created_at', x.created_at, 'created_by', (select email from auth.users where id = x.created_by), 'retired_at', x.retired_at,
           'retired_by', (select email from auth.users where id = x.retired_by), 'retire_reason', x.retire_reason)
           order by (x.status = 'retirado'), x.visibility, x.position, x.created_at, x.kind)
    from public.ch_unit_materials x where x.unit_version_id = p_version_id), '[]'::jsonb);
end
$$;

-- Só a equipe (administrador ou editor) mexe nos materiais; versão no ar não se edita (cria-se a versão para corrigir).
create or replace function public.ch_unit_materials_guard(p_version_id uuid) returns public.ch_unit_versions
  language plpgsql stable security definer set search_path = ''
as $$
declare v public.ch_unit_versions;
begin
  if (select auth.uid()) is null or not public.is_staff() then raise exception 'Inserir ou retirar material é só do administrador ou editor.' using errcode = '42501'; end if;
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status in ('published', 'retired', 'needs_update') then raise exception 'A versão está no ar ou foi retirada e não se edita: crie a versão para corrigir.' using errcode = '22023'; end if;
  return v;
end
$$;
revoke execute on function public.ch_unit_materials_guard(uuid) from public, anon, authenticated;

-- p_item: { kind: 'audio'|'video'|'tabela', title, visibility?, position?, url?, duration_seconds?, caption?, transcript?, headers?, rows?, claim_ids? }
create or replace function public.app_ch_unit_material_insert(p_version_id uuid, p_item jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions := public.ch_unit_materials_guard(p_version_id);
  it constant jsonb := coalesce(p_item, '{}'::jsonb);
  v_kind text := it ->> 'kind';
  v_title text := btrim(coalesce(it ->> 'title', ''));
  v_vis text := coalesce(nullif(it ->> 'visibility', ''), 'aluno');
  v_pos integer := coalesce(nullif(it ->> 'position', '')::int, 0);
  v_dur integer := nullif(it ->> 'duration_seconds', '')::int;
  v_embed text;
  v_content jsonb := '{}'::jsonb;
  v_ids uuid[] := '{}';
  v_text text;
  v_id uuid;
begin
  if v_kind not in ('audio', 'video', 'tabela') then
    raise exception 'Por aqui a equipe insere tabela, áudio e vídeo. Os outros materiais (imagens e PDFs da aula) entram pela importação da aula.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 1 and 200 then raise exception 'Informe o título (até 200 caracteres).' using errcode = '22023'; end if;
  if v_vis not in ('aluno', 'equipe') then raise exception 'Quem vê: aluno ou equipe.' using errcode = '22023'; end if;
  if v_pos < 0 or v_pos > 50 then raise exception 'Posição na aula inválida.' using errcode = '22023'; end if;
  if v_kind in ('audio', 'video') then
    if v_dur is null or v_dur not between 1 and 86400 then raise exception 'Informe a duração em segundos (1 a 86.400).' using errcode = '22023'; end if;
    v_embed := public.ch_embed_url(it ->> 'url');
    if v_embed is null then
      raise exception 'O link precisa ser do YouTube ou do Vimeo (player dentro do sistema). Link direto para arquivo não é aceito: o envio de arquivo de áudio/vídeo é uma etapa futura.' using errcode = '22023';
    end if;
    v_content := jsonb_strip_nulls(jsonb_build_object('legenda', nullif(btrim(coalesce(it ->> 'caption', '')), ''), 'transcricao', nullif(btrim(coalesce(it ->> 'transcript', '')), '')));
    v_text := coalesce(v_content ->> 'legenda', '') || ' ' || coalesce(v_content ->> 'transcricao', '');
    if char_length(v_text) > 40000 then raise exception 'Legenda e transcrição passam de 40.000 caracteres.' using errcode = '22023'; end if;
  else
    if jsonb_typeof(it -> 'headers') is distinct from 'array' or jsonb_typeof(it -> 'rows') is distinct from 'array' or jsonb_array_length(it -> 'headers') = 0 or jsonb_array_length(it -> 'rows') = 0 then
      raise exception 'A tabela precisa de cabeçalhos e de pelo menos uma linha.' using errcode = '22023';
    end if;
    if jsonb_array_length(it -> 'rows') > 100 or jsonb_array_length(it -> 'headers') > 12 then raise exception 'Tabela grande demais (até 12 colunas e 100 linhas).' using errcode = '22023'; end if;
    v_content := jsonb_build_object('headers', it -> 'headers', 'rows', it -> 'rows');
    v_text := v_content::text;
    -- tabela é conteúdo clínico: precisa de afirmação da unidade
    select coalesce(array_agg(distinct x::uuid), '{}') into v_ids from jsonb_array_elements_text(coalesce(it -> 'claim_ids', '[]'::jsonb)) x;
    if cardinality(v_ids) = 0 and v_vis = 'aluno' then raise exception 'Tabela para o aluno precisa citar afirmações validadas da unidade (claim_ids).' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.ch_unit_claims uc where uc.unit_version_id = p_version_id and uc.claim_id = i)) then
      raise exception 'A tabela usa uma afirmação que não faz parte da base revisada desta unidade.' using errcode = '22023';
    end if;
  end if;
  if v_vis = 'aluno' and (public.ch_has_citation_mark(v_title) or public.ch_has_citation_mark(v_text)) then
    raise exception 'O texto do aluno não pode trazer referência (marca de citação, "Referências" ou "Trechos citados").' using errcode = '22023';
  end if;
  insert into public.ch_unit_materials (unit_version_id, kind, title, visibility, origin, source, position, duration_seconds, url, embed_url, content, claim_ids, created_by)
  values (p_version_id, v_kind, v_title, v_vis, 'inserido', case when v_kind = 'tabela' then 'conteudo' else 'link' end, v_pos, v_dur,
          case when v_kind in ('audio', 'video') then btrim(it ->> 'url') end, v_embed, v_content, v_ids, (select auth.uid()))
  returning id into v_id;
  if v_vis = 'aluno' then
    perform public.ch_unit_materials_touch(p_version_id, 'unit.material.insert', v_id, jsonb_build_object('kind', v_kind, 'title', v_title, 'visibility', v_vis));
  else
    perform public.ch_log('unit.material.insert', p_version_id::text, jsonb_build_object('item', v_id, 'kind', v_kind, 'title', v_title, 'visibility', v_vis));
  end if;
  return jsonb_build_object('id', v_id, 'status', (select status from public.ch_unit_versions where id = p_version_id));
end
$$;

-- Retirar não apaga: o item fica na lista como "retirado", com quem, quando e por quê, e no histórico da unidade.
create or replace function public.app_ch_unit_material_retire(p_item_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.ch_unit_materials;
  v public.ch_unit_versions;
begin
  select * into x from public.ch_unit_materials where id = p_item_id;
  if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  v := public.ch_unit_materials_guard(x.unit_version_id);
  if x.kind = 'texto_aula' then raise exception 'O texto da aula não se retira: a publicação depende dele. Edite o texto ou crie uma nova versão.' using errcode = '22023'; end if;
  if x.status = 'retirado' then return jsonb_build_object('id', x.id, 'status', v.status, 'ja_retirado', true); end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo da retirada.' using errcode = '22023'; end if;
  update public.ch_unit_materials set status = 'retirado', retired_at = now(), retired_by = (select auth.uid()), retire_reason = btrim(p_reason) where id = x.id;
  if x.visibility = 'aluno' then
    perform public.ch_unit_materials_touch(x.unit_version_id, 'unit.material.retire', x.id, jsonb_build_object('kind', x.kind, 'title', x.title, 'reason', btrim(p_reason)));
  else
    perform public.ch_log('unit.material.retire', x.unit_version_id::text, jsonb_build_object('item', x.id, 'kind', x.kind, 'title', x.title, 'reason', btrim(p_reason)));
  end if;
  return jsonb_build_object('id', x.id, 'status', (select status from public.ch_unit_versions where id = x.unit_version_id));
end
$$;

-- Devolve à lista um item retirado (inserir de novo).
create or replace function public.app_ch_unit_material_restore(p_item_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  x public.ch_unit_materials;
begin
  select * into x from public.ch_unit_materials where id = p_item_id;
  if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  perform public.ch_unit_materials_guard(x.unit_version_id);
  if x.status <> 'retirado' then return jsonb_build_object('id', x.id, 'ja_ativo', true); end if;
  update public.ch_unit_materials set status = 'ativo', retired_at = null, retired_by = null, retire_reason = null where id = x.id;
  if x.visibility = 'aluno' then
    perform public.ch_unit_materials_touch(x.unit_version_id, 'unit.material.restore', x.id, jsonb_build_object('kind', x.kind, 'title', x.title));
  else
    perform public.ch_log('unit.material.restore', x.unit_version_id::text, jsonb_build_object('item', x.id, 'kind', x.kind, 'title', x.title));
  end if;
  return jsonb_build_object('id', x.id, 'status', (select status from public.ch_unit_versions where id = x.unit_version_id));
end
$$;

-- Arquivo de um item (só equipe e revisor): o servidor lê do depósito protegido; o navegador nunca recebe o caminho.
create or replace function public.app_ch_unit_material_file(p_item_id uuid, p_idx integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare x public.ch_unit_materials; f jsonb;
begin
  perform public.ch_assert_staff();
  select * into x from public.ch_unit_materials where id = p_item_id;
  if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  f := x.files -> coalesce(p_idx, 0);
  if f is null then raise exception 'Este material não tem arquivo.' using errcode = 'P0002'; end if;
  return jsonb_build_object('caminho', f ->> 'caminho', 'tipo', f ->> 'tipo');
end
$$;

-- Pré-visualização "como aluno": só o que o aluno veria (itens ativos e visíveis ao aluno), sem caminho de arquivo e sem PDF.
create or replace function public.app_ch_unit_student_preview(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  l jsonb;
  v_status text;
begin
  perform public.ch_assert_staff();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_unit_materials_sync(p_version_id);
  l := public.ch_student_lesson(p_version_id);
  return jsonb_build_object(
    'titulo', l ->> 'title', 'tema', l ->> 'topic', 'area', l ->> 'area',
    'cabecalho', split_part(l ->> 'summary', E'\n', 1), 'revisado_em', l -> 'reviewed_at',
    'pontos_chave', l -> 'key_points',
    'secoes', (select coalesce(jsonb_agg(jsonb_build_object('titulo', s ->> 'heading', 'paragrafos', (select coalesce(jsonb_agg(p ->> 'text'), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) p))), '[]'::jsonb)
                 from jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) s),
    'tabelas', (select coalesce(jsonb_agg(jsonb_build_object('titulo', x.title, 'posicao', x.position, 'headers', x.content -> 'headers', 'rows', x.content -> 'rows') order by x.position, x.created_at), '[]'::jsonb)
                from public.ch_unit_materials x where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'tabela'),
    'midias', (select coalesce(jsonb_agg(jsonb_build_object('tipo', x.kind, 'titulo', x.title, 'posicao', x.position, 'duracao_segundos', x.duration_seconds, 'embed_url', x.embed_url,
                  'legenda', x.content ->> 'legenda', 'transcricao', x.content ->> 'transcricao') order by x.position, x.created_at), '[]'::jsonb)
               from public.ch_unit_materials x where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind in ('audio', 'video')),
    'revisao_aula', (select jsonb_build_object('titulo', x.title, 'texto_alternativo', x.files -> 0 ->> 'texto_alternativo', 'item_id', x.id)
                     from public.ch_unit_materials x where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'revisao_aula' limit 1),
    'flashcards', (select jsonb_build_object('titulo', x.title, 'item_id', x.id, 'cartoes', coalesce((select jsonb_agg(jsonb_build_object('frente', c ->> 'front', 'verso', c ->> 'back', 'ilustrado', true) order by o)
                                                  from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) with ordinality as t (c, o)
                                                 where m.unit_version_id = p_version_id and m.kind = 'flashcards'), '[]'::jsonb))
                   from public.ch_unit_materials x where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'flashcards_ilustrados' limit 1),
    'questoes', (select jsonb_build_object('titulo', x.title, 'itens', coalesce((select jsonb_agg(jsonb_build_object('numero', q ->> 'number', 'rotulo', q ->> 'label', 'enunciado', q ->> 'stem', 'alternativas', q -> 'options', 'correta', q ->> 'correct', 'comentarios', q -> 'comments') order by o)
                                                  from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'items', '[]'::jsonb)) with ordinality as t (q, o)
                                                 where m.unit_version_id = p_version_id and m.kind = 'questions'), '[]'::jsonb))
                 from public.ch_unit_materials x where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'questoes_fixacao' limit 1),
    'situacao', v.status);
end
$$;

-- ---------------------------------------------------------------- 5. ficha do revisor médico
create or replace function public.ch_sheet_version(p_version_id uuid) returns uuid
  language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.unit_version_id from public.ch_review_sheets s where s.unit_version_id = p_version_id),
                  (select s.unit_version_id from public.ch_review_sheets s join public.ch_unit_versions v on v.candidate_of = s.unit_version_id where v.id = p_version_id))
$$;
revoke execute on function public.ch_sheet_version(uuid) from public, anon, authenticated;

create or replace function public.ch_sheet_decisions(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('n', d.n, 'decision', d.decision, 'note', d.note, 'por', (select email from auth.users where id = d.decided_by), 'em', d.decided_at) order by d.n), '[]'::jsonb)
    from (select distinct on (n) * from public.ch_review_decisions where unit_version_id = p_version_id order by n, id desc) d
$$;
revoke execute on function public.ch_sheet_decisions(uuid) from public, anon, authenticated;

-- A equipe importa a ficha (lida do para-o-revisor-medico.md pelo script scripts/aulas/ficha-revisor.mjs). Mesma ficha de novo: nada muda.
create or replace function public.app_ch_review_sheet_import(p_version_id uuid, p_sheet jsonb, p_origin_name text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_hash text := public.ch_hash(coalesce(p_sheet, '{}'::jsonb));
  d jsonb;
  old text;
begin
  if (select auth.uid()) is null or not public.is_staff() then raise exception 'A ficha do revisor é importada só pelo administrador ou editor.' using errcode = '42501'; end if;
  if not exists (select 1 from public.ch_unit_versions where id = p_version_id) then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_sheet -> 'decisoes') is distinct from 'array' or jsonb_array_length(p_sheet -> 'decisoes') = 0 then raise exception 'A ficha precisa da lista "decisoes".' using errcode = '22023'; end if;
  for d in select x from jsonb_array_elements(p_sheet -> 'decisoes') x loop
    if coalesce((d ->> 'n')::int, 0) < 1 or btrim(coalesce(d ->> 'titulo', '')) = '' then raise exception 'Cada decisão da ficha precisa de número e título.' using errcode = '22023'; end if;
  end loop;
  select s.sheet_hash into old from public.ch_review_sheets s where s.unit_version_id = p_version_id;
  if old = v_hash then return jsonb_build_object('resultado', 'sem_mudanca', 'decisoes', jsonb_array_length(p_sheet -> 'decisoes')); end if;
  insert into public.ch_review_sheets (unit_version_id, sheet, sheet_hash, origin_name, imported_by)
  values (p_version_id, p_sheet, v_hash, p_origin_name, (select auth.uid()))
  on conflict (unit_version_id) do update set sheet = excluded.sheet, sheet_hash = excluded.sheet_hash, origin_name = excluded.origin_name, imported_by = excluded.imported_by, imported_at = now();
  if old is not null then
    delete from public.ch_review_decisions where unit_version_id = p_version_id;    -- ficha trocada: as decisões da ficha antiga não valem
    if exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.invalidated_at is null) then perform public.ch_invalidate_approvals(p_version_id, 'ficha do revisor trocada'); end if;
  end if;
  perform public.ch_log('review.sheet_import', p_version_id::text, jsonb_build_object('hash', v_hash, 'decisoes', jsonb_array_length(p_sheet -> 'decisoes'), 'origem', p_origin_name));
  return jsonb_build_object('resultado', case when old is null then 'criada' else 'atualizada' end, 'decisoes', jsonb_array_length(p_sheet -> 'decisoes'));
end
$$;

create or replace function public.app_ch_review_sheet(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare sv uuid;
begin
  perform public.ch_assert_staff();
  sv := public.ch_sheet_version(p_version_id);
  if sv is null then return jsonb_build_object('existe', false); end if;
  return jsonb_build_object('existe', true, 'origem', (select origin_name from public.ch_review_sheets where unit_version_id = sv),
    'importada_em', (select imported_at from public.ch_review_sheets where unit_version_id = sv),
    'ficha', (select sheet from public.ch_review_sheets where unit_version_id = sv),
    'decisoes', public.ch_sheet_decisions(p_version_id),
    'historico', (select coalesce(jsonb_agg(jsonb_build_object('n', d.n, 'decision', d.decision, 'note', d.note, 'por', (select email from auth.users where id = d.decided_by), 'em', d.decided_at) order by d.id desc), '[]'::jsonb)
                    from public.ch_review_decisions d where d.unit_version_id = p_version_id));
end
$$;

-- Decisão do revisor (administrador ou revisor médico da área). Grava quem, quando e a observação; trocar a decisão depois de aprovar derruba a aprovação médica.
create or replace function public.app_ch_review_decide(p_version_id uuid, p_n integer, p_decision text, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  sv uuid;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if not public.ch_can_approve_medical(public.ch_unit_area_code(p_version_id)) then
    raise exception 'As decisões da ficha são do administrador ou do revisor médico da área.' using errcode = '42501';
  end if;
  if v.status not in ('awaiting_review', 'approved', 'draft') then raise exception 'A versão está no ar ou foi retirada: as decisões não mudam mais.' using errcode = '22023'; end if;
  if p_decision not in ('de_acordo', 'mudar') then raise exception 'Decisão inválida (de_acordo ou mudar).' using errcode = '22023'; end if;
  sv := public.ch_sheet_version(p_version_id);
  if sv is null or not exists (select 1 from public.ch_review_sheets s, jsonb_array_elements(s.sheet -> 'decisoes') d where s.unit_version_id = sv and (d ->> 'n')::int = p_n) then
    raise exception 'Essa decisão não existe na ficha da versão.' using errcode = '22023';
  end if;
  insert into public.ch_review_decisions (unit_version_id, n, decision, note, decided_by) values (p_version_id, p_n, p_decision, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()));
  if exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null) then
    update public.ch_approvals set invalidated_at = now() where unit_version_id = p_version_id and kind = 'medical' and invalidated_at is null;
    update public.ch_unit_versions set status = 'awaiting_review' where id = p_version_id and status = 'approved';
  end if;
  perform public.ch_log('review.decision', p_version_id::text, jsonb_build_object('n', p_n, 'decision', p_decision, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  return public.ch_sheet_decisions(p_version_id);
end
$$;

-- ---------------------------------------------------------------- 6. resumo para o aprovador, lista, cabeçalho, histórico
create or replace function public.ch_changes_since_previous(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  pv public.ch_unit_versions;
  a_new text[]; a_old text[];
  c_new uuid[]; c_old uuid[];
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  select * into pv from public.ch_unit_versions x where x.unit_id = v.unit_id and x.version < v.version order by x.version desc limit 1;
  if pv.id is null then return jsonb_build_object('primeira_versao', true); end if;
  select coalesce(array_agg(p ->> 'text'), '{}') into a_new from jsonb_path_query(v.content, 'lax $.sections[*].paragraphs[*]') p;
  select coalesce(array_agg(p ->> 'text'), '{}') into a_old from jsonb_path_query(pv.content, 'lax $.sections[*].paragraphs[*]') p;
  select coalesce(array_agg(claim_id), '{}') into c_new from public.ch_unit_claims where unit_version_id = v.id;
  select coalesce(array_agg(claim_id), '{}') into c_old from public.ch_unit_claims where unit_version_id = pv.id;
  return jsonb_build_object('primeira_versao', false, 'versao_anterior', pv.version, 'status_anterior', pv.status,
    'paragrafos_novos', (select count(*) from unnest(a_new) t where t <> all (a_old)),
    'paragrafos_removidos', (select count(*) from unnest(a_old) t where t <> all (a_new)),
    'afirmacoes_novas', (select count(*) from unnest(c_new) c where c <> all (c_old)),
    'afirmacoes_removidas', (select count(*) from unnest(c_old) c where c <> all (c_new)),
    'palavras_antes', public.ch_unit_words(pv.id), 'palavras_agora', public.ch_unit_words(v.id),
    'texto_igual', v.content_hash = pv.content_hash);
end
$$;
revoke execute on function public.ch_changes_since_previous(uuid) from public, anon, authenticated;

-- Afirmações "validadas": evidência compatível, atual, com trecho citado (página) e conferência literal.
create or replace function public.ch_claims_summary(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with c as (
    select cl.id, cl.status, cl.critical_kinds, cl.critical_checked_by,
           exists (select 1 from public.ch_evidence e left join public.ch_source_passages sp on sp.id = e.passage_id
                    where e.claim_id = cl.id and e.verdict = 'compatible' and not e.stale and e.page is not null and char_length(btrim(e.quote)) > 0
                      and (sp.id is null or sp.literal_check is null or coalesce((sp.literal_check ->> 'ok')::boolean, true))) as validada,
           (select max(coalesce(nullif(sp.literal_check ->> 'em', ''), e.created_at::text)) from public.ch_evidence e left join public.ch_source_passages sp on sp.id = e.passage_id where e.claim_id = cl.id) as em
      from public.ch_claims cl join public.ch_unit_claims uc on uc.claim_id = cl.id where uc.unit_version_id = p_version_id)
  select jsonb_build_object('total', count(*)::int, 'validadas', count(*) filter (where validada)::int,
    'sem_validacao', count(*) filter (where not validada)::int,
    'criticas', count(*) filter (where cardinality(critical_kinds) > 0)::int,
    'criticas_sem_conferencia', count(*) filter (where cardinality(critical_kinds) > 0 and critical_checked_by is null)::int,
    'ultima_conferencia', max(em))
  from c
$$;
revoke execute on function public.ch_claims_summary(uuid) from public, anon, authenticated;

create or replace function public.app_ch_approval_summary(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  sv uuid;
begin
  perform public.ch_assert_staff();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  sv := public.ch_sheet_version(p_version_id);
  return jsonb_build_object(
    'titulo', (select title from public.ch_units where id = v.unit_id), 'versao', v.version, 'hash', v.content_hash, 'palavras', public.ch_unit_words(p_version_id),
    'afirmacoes', public.ch_claims_summary(p_version_id),
    'ficha', jsonb_build_object('existe', sv is not null, 'decisoes_total', case when sv is null then 0 else (select jsonb_array_length(s.sheet -> 'decisoes') from public.ch_review_sheets s where s.unit_version_id = sv) end,
      'decisoes', public.ch_sheet_decisions(p_version_id)),
    'mudancas', public.ch_changes_since_previous(p_version_id),
    'materiais_aluno', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'title', x.title)), '[]'::jsonb) from public.ch_unit_materials x where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno'));
end
$$;

-- Aprovação (substitui a da migração 1400). Médica: administrador OU revisor médico da área (decisão do dono, 13/10/2026). Editorial: administrador ou editor.
-- Sem usuário (processamento, IA, automação) nunca aprova. Grava o hash exato, a ficha das decisões e o resumo.
create or replace function public.app_ch_approve(p_version_id uuid, p_kind text, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_area text := public.ch_unit_area_code(p_version_id);
  v_sheet jsonb;
  v_total integer;
  v_pend text[];
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status not in ('awaiting_review', 'approved') then raise exception 'A versão precisa estar aguardando revisão.' using errcode = '22023'; end if;
  if p_kind = 'medical' then
    if not public.ch_can_approve_medical(v_area) then raise exception 'A aprovação médica é do administrador ou do revisor médico da área %.', v_area using errcode = '42501'; end if;
    v_sheet := public.ch_sheet_decisions(p_version_id);
    if public.ch_sheet_version(p_version_id) is not null then
      select jsonb_array_length(s.sheet -> 'decisoes') into v_total from public.ch_review_sheets s where s.unit_version_id = public.ch_sheet_version(p_version_id);
      select coalesce(array_agg(d ->> 'n' order by (d ->> 'n')::int), '{}') into v_pend
        from jsonb_array_elements((select s.sheet -> 'decisoes' from public.ch_review_sheets s where s.unit_version_id = public.ch_sheet_version(p_version_id))) d
       where not exists (select 1 from jsonb_array_elements(v_sheet) x where x ->> 'n' = d ->> 'n' and x ->> 'decision' = 'de_acordo');
      if cardinality(v_pend) > 0 then
        raise exception 'Marque "de acordo" em todas as % decisões da ficha antes de aprovar. Faltam ou pedem mudança: %.', v_total, array_to_string(v_pend, ', ') using errcode = '22023';
      end if;
    end if;
  elsif p_kind = 'editorial' then
    if not public.is_staff() then raise exception 'Aprovação editorial exige editor ou administrador.' using errcode = '42501'; end if;
  else
    raise exception 'Tipo de aprovação inválido.' using errcode = '22023';
  end if;
  update public.ch_approvals set invalidated_at = now() where unit_version_id = p_version_id and kind = p_kind and invalidated_at is null;
  insert into public.ch_approvals (unit_version_id, kind, reviewer_id, area_code, content_hash, note, sheet, summary)
  values (p_version_id, p_kind, (select auth.uid()), case when p_kind = 'medical' then v_area end, v.content_hash, nullif(btrim(p_note), ''),
          case when p_kind = 'medical' then v_sheet end,
          jsonb_build_object('versao', v.version, 'palavras', public.ch_unit_words(p_version_id), 'afirmacoes', public.ch_claims_summary(p_version_id), 'mudancas', public.ch_changes_since_previous(p_version_id)));
  if exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null)
     and exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'editorial' and a.invalidated_at is null) then
    update public.ch_unit_versions set status = 'approved' where id = p_version_id;
  end if;
  perform public.ch_log('approve.' || p_kind, p_version_id::text, jsonb_build_object('hash', v.content_hash));
  return jsonb_build_object('hash', v.content_hash, 'status', (select status from public.ch_unit_versions where id = p_version_id));
end
$$;
revoke execute on function public.app_ch_approve(uuid, text, text) from public, anon;
grant execute on function public.app_ch_approve(uuid, text, text) to authenticated;

-- Conferência de dose, via, frequência e contraindicação (CC12, migração 9860): continua sendo ato médico, agora também do ADMINISTRADOR
-- (o dono é médico e faz a aprovação médica, decisão de 13/10/2026). Editor, aluno e sem usuário continuam recusados. Só esta frase mudou
-- em relação à 9860: "revisor da área" → "administrador ou revisor da área".
create or replace function public.app_ch_confirm_critical(p_claim_id uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare v_areas text[];
begin
  perform public.ch_assert_staff();
  if not exists (select 1 from public.ch_claims where id = p_claim_id) then raise exception 'Afirmação não encontrada.' using errcode = 'P0002'; end if;
  v_areas := public.ch_claim_area_codes(p_claim_id);
  if not public.is_admin() then
    if cardinality(v_areas) = 0 then
      raise exception 'Esta afirmação ainda não tem área definida: classifique o trecho ou a unidade antes de conferir dose, via, frequência ou contraindicação.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.ch_reviewer_areas r where r.user_id = (select auth.uid()) and r.area_code = any (v_areas)) then
      raise exception 'A conferência de dose, via, frequência e contraindicação é do administrador ou de um revisor médico cadastrado na área (%).', array_to_string(v_areas, ', ') using errcode = '42501';
    end if;
  end if;
  if not exists (select 1 from public.ch_evidence e where e.claim_id = p_claim_id and e.verdict = 'compatible' and public.ch_evidence_counts(e.id) and (e.numeric_check ->> 'ok')::boolean) then
    raise exception 'Confirme só depois de haver evidência compatível e conferida.' using errcode = '22023';
  end if;
  update public.ch_claims set critical_checked_by = (select auth.uid()), critical_checked_at = now() where id = p_claim_id;
  insert into public.ch_claim_history (claim_id, actor_id, event) values (p_claim_id, (select auth.uid()), 'critical_confirmed');
  return true;
end
$$;

create or replace function public.app_ch_claim_can_confirm(p_claim_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_areas text[];
begin
  perform public.ch_assert_staff();
  v_areas := public.ch_claim_area_codes(p_claim_id);
  return jsonb_build_object('areas', to_jsonb(v_areas),
    'can', public.is_admin() or exists (select 1 from public.ch_reviewer_areas r where r.user_id = (select auth.uid()) and r.area_code = any (v_areas)));
end
$$;

create or replace function public.app_ch_unit_overview(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  u public.ch_units;
  v_area text;
  v_gate jsonb;
  v_claims jsonb;
  v_problems text[];
  m_med record;
  m_ed record;
  v_pub record;
begin
  perform public.ch_assert_staff();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  select * into u from public.ch_units where id = v.unit_id;
  v_area := public.ch_unit_area_code(p_version_id);
  perform public.ch_unit_materials_sync(p_version_id);
  v_gate := public.ch_topic_gate(u.theme_node_id);
  v_claims := public.ch_claims_summary(p_version_id);
  v_problems := public.ch_publish_problems(p_version_id);
  select a.*, (select email from auth.users where id = a.reviewer_id) as email into m_med from public.ch_approvals a
   where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash order by a.decided_at desc limit 1;
  select a.*, (select email from auth.users where id = a.reviewer_id) as email into m_ed from public.ch_approvals a
   where a.unit_version_id = p_version_id and a.kind = 'editorial' and a.invalidated_at is null and a.content_hash = v.content_hash order by a.decided_at desc limit 1;
  select p.* into v_pub from public.ch_publications p where p.unit_version_id = p_version_id and p.retired_at is null order by p.published_at desc limit 1;
  return jsonb_build_object(
    'unit', jsonb_build_object('id', u.id, 'code', public.ch_unit_code(u.id), 'title', u.title, 'caminho', public.ch_unit_path(p_version_id), 'theme_node_id', u.theme_node_id),
    'version', jsonb_build_object('id', v.id, 'version', v.version, 'status', v.status, 'date', v.created_at, 'hash', v.content_hash, 'candidate_reason', v.candidate_reason),
    'palavras', public.ch_unit_words(p_version_id),
    'questoes_ligadas', public.ch_unit_questions_linked(u.id),
    'afirmacoes', v_claims,
    'auditoria', jsonb_build_object(
      'estado', case when (v_claims ->> 'total')::int = 0 then 'pendente' when (v_claims ->> 'sem_validacao')::int = 0 then 'feita' else 'com_pendencias' end,
      'data', v_claims ->> 'ultima_conferencia'),
    'aprovacao_medica', case when m_med.id is null then jsonb_build_object('valida', false)
                             else jsonb_build_object('valida', true, 'por', m_med.email, 'em', m_med.decided_at, 'hash', m_med.content_hash, 'area', m_med.area_code, 'nota', m_med.note) end,
    'aprovacao_editorial', case when m_ed.id is null then jsonb_build_object('valida', false)
                                else jsonb_build_object('valida', true, 'por', m_ed.email, 'em', m_ed.decided_at, 'hash', m_ed.content_hash) end,
    'portao', v_gate,
    'publicacao', jsonb_build_object('no_ar', v_pub.id is not null, 'em', v_pub.published_at, 'problemas', to_jsonb(v_problems)),
    'ficha', jsonb_build_object('existe', public.ch_sheet_version(p_version_id) is not null, 'decisoes', public.ch_sheet_decisions(p_version_id),
                                'total', coalesce((select jsonb_array_length(s.sheet -> 'decisoes') from public.ch_review_sheets s where s.unit_version_id = public.ch_sheet_version(p_version_id)), 0)),
    'pode', jsonb_build_object('editar', public.is_staff() and v.status not in ('published', 'retired', 'needs_update'),
                               'aprovar_medica', public.ch_can_approve_medical(v_area) and v.status in ('awaiting_review', 'approved'),
                               'conferir_criticas', public.ch_can_approve_medical(v_area),
                               'aprovar_editorial', public.is_staff() and v.status in ('awaiting_review', 'approved'),
                               'publicar', public.is_admin() and v.status = 'approved' and v_gate ->> 'status' = 'ok' and cardinality(v_problems) = 0));
end
$$;

-- Publicar ao aluno pela tela de Unidades: administrador, versão aprovada (médica E editorial, hash atual) e portão de atualidade em ordem
-- (ch_topic_freshness = "ok"), QUALQUER que seja o modo do portão (o modo 'desligado' continua valendo para as outras telas e para a importação).
-- Depois chama a publicação de sempre (app_ch_publish), com todas as travas dela.
create or replace function public.app_ch_unit_publish(p_version_id uuid, p_options jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  g jsonb;
begin
  perform public.assert_admin();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if v.status <> 'approved' then raise exception 'Só uma versão aprovada pode ser publicada.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ch_approvals a where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash) then
    raise exception 'Falta a aprovação médica desta versão.' using errcode = '22023';
  end if;
  g := public.ch_topic_freshness((select u.theme_node_id from public.ch_units u where u.id = v.unit_id));
  if g ->> 'status' <> 'ok' then
    raise exception 'Portão de atualidade da Vigilância: o tema está com evidência % . %', case g ->> 'status' when 'sem_dossie' then 'sem dossiê' when 'vencido' then 'vencida' else 'com mudança pendente' end,
      coalesce((select string_agg(m, ' ') from jsonb_array_elements_text(g -> 'motivos') m), '') using errcode = '55000';
  end if;
  return public.app_ch_publish(p_version_id, coalesce(p_options, '{}'::jsonb));
end
$$;
revoke execute on function public.app_ch_unit_publish(uuid, jsonb) from public, anon;
grant execute on function public.app_ch_unit_publish(uuid, jsonb) to authenticated;

create or replace function public.app_ch_unit_overview_list() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'unit_id', u.id, 'code', public.ch_unit_code(u.id), 'title', u.title, 'version_id', v.id, 'version', v.version, 'status', v.status, 'date', v.created_at,
      'caminho', public.ch_unit_path(v.id), 'area_code', public.ch_unit_area_code(v.id), 'palavras', public.ch_unit_words(v.id),
      'questoes_ligadas', public.ch_unit_questions_linked(u.id), 'afirmacoes', (public.ch_claims_summary(v.id) ->> 'total')::int,
      'candidate_reason', v.candidate_reason) order by public.ch_unit_code(u.id) nulls last, u.title)
    from public.ch_units u join lateral (select * from public.ch_unit_versions x where x.unit_id = u.id order by x.version desc limit 1) v on true), '[]'::jsonb);
end
$$;

create or replace function public.app_ch_unit_history(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare u uuid;
begin
  perform public.ch_assert_staff();
  select unit_id into u from public.ch_unit_versions where id = p_version_id;
  if u is null then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('em', a.created_at, 'quem', (select email from auth.users where id = a.actor_id), 'acao', a.action,
           'versao', (select version from public.ch_unit_versions where id::text = a.target), 'detalhes', a.details) order by a.id desc)
    from (select * from public.ch_audit x where x.target in (select id::text from public.ch_unit_versions where unit_id = u)
             and (x.action like 'unit.%' or x.action like 'approve.%' or x.action like 'review.%' or x.action in ('publish', 'retire', 'approval.invalidate'))
           order by x.id desc limit 300) a), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 99. permissões
-- funções puras de apoio: ninguém de fora executa (as funções da tela, que rodam como dono, é que as usam)
revoke execute on function public.ch_embed_url(text) from public, anon, authenticated;
revoke execute on function public.ch_has_citation_mark(text) from public, anon, authenticated;

do $perm$
declare f text;
begin
  foreach f in array array[
    'app_ch_unit_materials(uuid)', 'app_ch_unit_material_insert(uuid, jsonb)', 'app_ch_unit_material_retire(uuid, text)', 'app_ch_unit_material_restore(uuid)',
    'app_ch_unit_material_file(uuid, integer)', 'app_ch_unit_student_preview(uuid)', 'app_ch_review_sheet_import(uuid, jsonb, text)', 'app_ch_review_sheet(uuid)',
    'app_ch_review_decide(uuid, integer, text, text)', 'app_ch_approval_summary(uuid)', 'app_ch_unit_overview(uuid)', 'app_ch_unit_overview_list()', 'app_ch_unit_history(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$perm$;
