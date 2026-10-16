-- =============================================================================
-- Editor profissional: mudança SÓ DE FORMATAÇÃO não derruba a aprovação (decisão do dono, 16/10/2026 ~15h).
--
-- Regra (conferida AQUI no banco, nunca no navegador):
--   * O hash da versão (ch_unit_versions.content_hash, ao qual as aprovações ficam presas) passa a ser o HASH DE CONTEÚDO:
--     o conteúdo inteiro, MENOS "doc_config" (página/estilos) e MENOS a parte de formatação do "rico" de cada parágrafo.
--   * Continua igual por obrigação: "text" de todos os parágrafos (o texto oficial, que já traz os links), ordem e número de
--     seções e parágrafos, títulos, "clinical", afirmações (claims/claim_ids), campos pdf_*, referências e qualquer outra chave.
--   * Do "rico" só é formatação: as marcas bold, italic, underline, textStyle (cor/fonte/tamanho), highlight e os atributos da lista
--     public.ch_formato_atributos() (alinhamento, entrelinha, recuos, espaços, cor, fonte, tamanho, largura de coluna, borda de
--     parágrafo, estilo do marcador/numeração da lista, largura / alinhamento / disposição / borda / cantos / sombra de imagem). TODO o resto conta como conteúdo: nó de módulo (imagem, nota,
--     citação, fórmula...) com seus atributos (arquivo, legenda, texto alternativo, recorte, giro...), texto dentro deles, links
--     (destino), sobrescrito/subscrito (10⁵ ≠ 105), tachado, nível de título, células mescladas e qualquer coisa nova. Na dúvida,
--     é conteúdo.
--   * Conteúdo sem "rico" e sem "doc_config" (tudo que existe hoje) tem o MESMO hash de antes: nenhuma aprovação muda.
-- O que muda nas funções:
--   * app_ch_save_unit_version: compara pelo hash de conteúdo. Mudou conteúdo → aprovações deixam de valer (como antes).
--     Só formatação → aprovações continuam, fica registrado quem/quando (ch_unit_format_changes + registro "unit.format"), e
--     isso vale também para a versão PUBLICADA: a formatação nova aparece ao aluno na hora (a tela do aluno lê a versão no ar),
--     sem republicar. Mudança de conteúdo numa versão publicada continua proibida (cria-se versão nova).
--   * app_ch_format_changes(versão): lista para a equipe o que mudou só de formatação (quem, quando, hashes).
-- Depende da 001400 (definição mais nova de app_ch_save_unit_version no main 55f837f6). Pode ser colada duas vezes.
-- DESFAZER e CONFERIR: /Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013080-desfazer.sql e 013080-conferir.sql.
-- =============================================================================

create or replace function public.ch_formato_marcas() returns text[]
  language sql immutable set search_path = ''
as $$ select array['bold', 'italic', 'underline', 'textStyle', 'highlight']::text[] $$;

create or replace function public.ch_formato_atributos() returns text[]
  language sql immutable set search_path = ''
as $$ select array['ref', 'textAlign', 'lineHeight', 'indent', 'firstLineIndent', 'spacingBefore', 'spacingAfter', 'marginTop', 'marginBottom',
                   'color', 'backgroundColor', 'fontFamily', 'fontSize', 'colwidth', 'cellBackground', 'borderColor', 'borderStyle',
                   'largura', 'alinhamento', 'disposicao', 'borda', 'cantos', 'sombra', 'listStyle']::text[] $$;

-- Nós do núcleo cujo texto já está no "text" do parágrafo (a projeção). Nó fora desta lista é conteúdo, e o texto dentro dele também.
create or replace function public.ch_nos_do_texto() returns text[]
  language sql immutable set search_path = ''
as $$ select array['doc', 'paragraph', 'text', 'hardBreak', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote',
                   'table', 'tableRow', 'tableCell', 'tableHeader']::text[] $$;

-- Itens de conteúdo de um nó do documento rico, em ordem (sem os links, que vão à parte).
create or replace function public.ch_rico_itens(p_no jsonb, p_dentro boolean default false, p_prof integer default 0) returns jsonb
  language plpgsql immutable set search_path = ''
as $$
declare
  v_tipo text;
  v_nucleo boolean;
  v_attrs jsonb;
  v_out jsonb := '[]'::jsonb;
  m jsonb;
  f jsonb;
begin
  if p_prof > 60 or jsonb_typeof(p_no) is distinct from 'object' then return jsonb_build_array(jsonb_build_object('bruto', p_no)); end if;
  v_tipo := p_no ->> 'type';
  v_nucleo := v_tipo = any (public.ch_nos_do_texto());
  v_attrs := case when jsonb_typeof(p_no -> 'attrs') = 'object' then (p_no -> 'attrs') - public.ch_formato_atributos()
                  when p_no ? 'attrs' and jsonb_typeof(p_no -> 'attrs') <> 'null' then jsonb_build_object('bruto', p_no -> 'attrs')
                  else '{}'::jsonb end;
  if not v_nucleo or v_attrs <> '{}'::jsonb then
    v_out := v_out || jsonb_build_array(jsonb_build_object('t', v_tipo, 'a', v_attrs));
  end if;
  if v_tipo = 'text' and p_dentro then v_out := v_out || jsonb_build_array(jsonb_build_object('x', p_no -> 'text')); end if;
  for m in select x from jsonb_array_elements(case when jsonb_typeof(p_no -> 'marks') = 'array' then p_no -> 'marks' else '[]'::jsonb end) x loop
    if jsonb_typeof(m) = 'object' and ((m ->> 'type') = 'link' or (m ->> 'type') = any (public.ch_formato_marcas())) then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('m', case when jsonb_typeof(m) = 'object' then m ->> 'type' end,
               'a', case when jsonb_typeof(m -> 'attrs') = 'object' then (m -> 'attrs') - public.ch_formato_atributos() else coalesce(m -> 'attrs', m) end));
  end loop;
  for f in select x from jsonb_array_elements(case when jsonb_typeof(p_no -> 'content') = 'array' then p_no -> 'content' else '[]'::jsonb end) x loop
    v_out := v_out || public.ch_rico_itens(f, p_dentro or not v_nucleo, p_prof + 1);
  end loop;
  return v_out;
end
$$;

-- Destinos de link no texto com marcas: [texto](https://...)
create or replace function public.ch_links_do_texto(p_text text) returns jsonb
  language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct to_jsonb(x[1]) order by to_jsonb(x[1])), '[]'::jsonb)
    from regexp_matches(coalesce(p_text, ''), '\]\((https://[^\s()<>"\\]+)\)', 'g') as t (x)
$$;

-- "Conteúdo" de um rico (envelope sdoc v1): itens de conteúdo + destinos de link. Envelope estranho = ele inteiro (conteúdo).
create or replace function public.ch_rico_conteudo(p_rico jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(p_rico) = 'object' and p_rico ->> 'f' = 'sdoc' and p_rico -> 'v' = '1'::jsonb and jsonb_typeof(p_rico -> 'doc') = 'object'
         and (p_rico - 'f' - 'v' - 'doc') = '{}'::jsonb then
      jsonb_build_object('itens', public.ch_rico_itens(p_rico -> 'doc'),
        'links', (select coalesce(jsonb_agg(distinct h order by h), '[]'::jsonb)
                    from jsonb_path_query(p_rico -> 'doc', 'lax $.**.marks[*] ? (@.type == "link").attrs.href') as q (h)))
    else jsonb_build_object('bruto', p_rico) end
$$;

-- O mesmo, para um parágrafo SEM rico: só os links do texto.
create or replace function public.ch_texto_conteudo(p_text text) returns jsonb
  language sql immutable set search_path = ''
as $$ select jsonb_build_object('itens', '[]'::jsonb, 'links', public.ch_links_do_texto(p_text)) $$;

-- Parágrafo como entra no hash de conteúdo: sem "rico"; se o rico tiver conteúdo além do que o texto já diz, entra "rico_conteudo".
create or replace function public.ch_paragrafo_conteudo(p jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'object' or not (p ? 'rico') then p
    when public.ch_rico_conteudo(p -> 'rico') = public.ch_texto_conteudo(p ->> 'text') then p - 'rico'
    else (p - 'rico') || jsonb_build_object('rico_conteudo', public.ch_rico_conteudo(p -> 'rico'))
  end
$$;

-- Hash de conteúdo da versão (o que os revisores aprovam). Sem rico e sem doc_config = igual a ch_hash(conteúdo).
create or replace function public.ch_conteudo_hash(p_content jsonb) returns text
  language sql immutable set search_path = ''
as $$
  select public.ch_hash(
    case when jsonb_typeof(p_content -> 'sections') = 'array' then
      jsonb_set(p_content - 'doc_config', '{sections}', (
        select coalesce(jsonb_agg(
                 case when jsonb_typeof(s) = 'object' and jsonb_typeof(s -> 'paragraphs') = 'array' then
                   jsonb_set(s, '{paragraphs}', (select coalesce(jsonb_agg(public.ch_paragrafo_conteudo(p) order by k), '[]'::jsonb)
                                                   from jsonb_array_elements(s -> 'paragraphs') with ordinality as y (p, k)))
                 else s end order by o), '[]'::jsonb)
          from jsonb_array_elements(p_content -> 'sections') with ordinality as x (s, o)))
    when jsonb_typeof(p_content) = 'object' then p_content - 'doc_config'
    else p_content end)
$$;

revoke execute on function public.ch_formato_marcas() from public, anon;
revoke execute on function public.ch_formato_atributos() from public, anon;
revoke execute on function public.ch_nos_do_texto() from public, anon;
revoke execute on function public.ch_rico_itens(jsonb, boolean, integer) from public, anon;
revoke execute on function public.ch_links_do_texto(text) from public, anon;
revoke execute on function public.ch_rico_conteudo(jsonb) from public, anon;
revoke execute on function public.ch_texto_conteudo(text) from public, anon;
revoke execute on function public.ch_paragrafo_conteudo(jsonb) from public, anon;
revoke execute on function public.ch_conteudo_hash(jsonb) from public, anon;

-- Registro do que mudou SÓ de formatação (a versão aprovada continua rastreável: o conteúdo anterior inteiro fica aqui).
create table if not exists public.ch_unit_format_changes (
  id bigint generated always as identity primary key,
  unit_version_id uuid not null references public.ch_unit_versions (id) on delete cascade,
  changed_by uuid default auth.uid() references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  version_status text not null,
  content_hash text not null,          -- hash de conteúdo (não muda numa mudança só de formatação)
  full_hash_before text not null,      -- hash do conteúdo inteiro antes
  full_hash_after text not null,       -- e depois
  content_before jsonb not null
);
create index if not exists ch_unit_format_changes_version on public.ch_unit_format_changes (unit_version_id, changed_at desc);
alter table public.ch_unit_format_changes enable row level security;
revoke all on public.ch_unit_format_changes from anon, authenticated;

create or replace function public.app_ch_save_unit_version(p_version_id uuid, p_content jsonb, p_origin text default null, p_scope_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  v_ids uuid[];
  v_hash text;
  v_so_formato boolean;
begin
  perform public.ch_assert_staff();
  select * into v from public.ch_unit_versions where id = p_version_id for update;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_content -> 'sections') is distinct from 'array' then raise exception 'O conteúdo precisa ter a lista "sections".' using errcode = '22023'; end if;
  v_hash := public.ch_conteudo_hash(p_content);
  v_so_formato := v_hash = v.content_hash;
  if v.status = 'retired' or (v.status = 'published' and not v_so_formato) then
    raise exception 'Versão publicada não se edita: crie uma nova versão. (Numa versão publicada só dá para mudar a formatação.)' using errcode = '22023';
  end if;
  if v_so_formato then
    -- só formatação: aprovações, afirmações e status ficam como estão; fica registrado quem mudou e quando
    if p_content is distinct from v.content or p_origin is not null or nullif(btrim(p_scope_note), '') is not null then
      if p_content is distinct from v.content then
        insert into public.ch_unit_format_changes (unit_version_id, version_status, content_hash, full_hash_before, full_hash_after, content_before)
        values (p_version_id, v.status, v.content_hash, public.ch_hash(v.content), public.ch_hash(p_content), v.content);
        perform public.ch_log('unit.format', p_version_id::text, jsonb_build_object('hash', v.content_hash, 'antes', public.ch_hash(v.content), 'depois', public.ch_hash(p_content)));
      end if;
      update public.ch_unit_versions set content = p_content,
             origin = case when v.status = 'published' then origin else coalesce(p_origin, origin) end,
             scope_note = case when v.status = 'published' then scope_note else coalesce(nullif(btrim(p_scope_note), ''), scope_note) end
       where id = p_version_id;
    end if;
    return jsonb_build_object('content_hash', v_hash, 'claims', (select count(*) from public.ch_unit_claims where unit_version_id = p_version_id), 'so_formatacao', true);
  end if;
  v_ids := public.ch_content_claim_ids(p_content);
  if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.ch_claims c where c.id = i)) then
    raise exception 'O conteúdo cita uma afirmação que não existe.' using errcode = '22023';
  end if;
  perform public.ch_invalidate_approvals(p_version_id, 'conteúdo alterado');
  update public.ch_unit_versions set content = p_content, content_hash = v_hash, origin = coalesce(p_origin, origin), scope_note = coalesce(nullif(btrim(p_scope_note), ''), scope_note) where id = p_version_id;
  delete from public.ch_unit_claims where unit_version_id = p_version_id;
  insert into public.ch_unit_claims select p_version_id, i from unnest(v_ids) i;
  return jsonb_build_object('content_hash', v_hash, 'claims', cardinality(v_ids), 'so_formatacao', false);
end
$$;

create or replace function public.app_ch_format_changes(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.ch_assert_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('em', f.changed_at, 'por', u.email, 'status', f.version_status,
                                                      'hash', f.content_hash, 'antes', f.full_hash_before, 'depois', f.full_hash_after) order by f.changed_at desc)
                     from public.ch_unit_format_changes f left join auth.users u on u.id = f.changed_by
                    where f.unit_version_id = p_version_id), '[]'::jsonb);
end
$$;
revoke execute on function public.app_ch_format_changes(uuid) from public, anon;
grant execute on function public.app_ch_format_changes(uuid) to authenticated;

-- Conferências da publicação passam a comparar o CONTEÚDO (sem formatação). Remendo por texto na definição que estiver no banco
-- (a casca da 9960 guarda a original como *_antes_tema): troca só os dois trechos abaixo; se já trocado, não faz nada.
--   * ch_publish_problems_base: "content_hash <> ch_hash(content)"  → compara com ch_conteudo_hash(content)
--   * ch_publish_problems(_antes_tema): "aula (material lesson) = texto atual" compara as seções sem a formatação
do $remendo$
declare
  f record;
  v_def text;
  v_novo text;
begin
  for f in select * from (values
      ('ch_publish_problems_base', 'uuid', 'v.content_hash <> public.ch_hash(v.content)', 'v.content_hash <> public.ch_conteudo_hash(v.content)'),
      ('ch_publish_problems_antes_tema', 'uuid', 'm.content -> ''sections'' is distinct from v.content -> ''sections''',
       'public.ch_conteudo_hash(jsonb_build_object(''sections'', m.content -> ''sections'')) is distinct from public.ch_conteudo_hash(jsonb_build_object(''sections'', v.content -> ''sections''))'),
      ('ch_publish_problems', 'uuid', 'm.content -> ''sections'' is distinct from v.content -> ''sections''',
       'public.ch_conteudo_hash(jsonb_build_object(''sections'', m.content -> ''sections'')) is distinct from public.ch_conteudo_hash(jsonb_build_object(''sections'', v.content -> ''sections''))')
    ) as x(nome, args, de, para) loop
    if to_regprocedure(format('public.%s(%s)', f.nome, f.args)) is null then continue; end if;
    v_def := pg_get_functiondef(to_regprocedure(format('public.%s(%s)', f.nome, f.args)));
    if position(f.de in v_def) > 0 then
      v_novo := replace(v_def, f.de, f.para);
      execute v_novo;
    end if;
  end loop;
end
$remendo$;
