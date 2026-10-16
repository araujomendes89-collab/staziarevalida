-- =============================================================================
-- A aula dentro do Grande Tema, para o ALUNO (14/10/2026). Só leitura. Nada aqui publica, aprova ou mostra rascunho:
-- o aluno só recebe a aula quando a unidade foi PUBLICADA pela Central (aprovação médica + editorial + portão de atualidade),
-- isto é, quando existe a aula da Central (lessons.origin = 'central', published) ligada à unidade do tema.
--
--   * ch_tema_aula_aberta(tema): a aula publicada do tema (apoio interno, o aluno não chama).
--   * app_temas_com_aula(): lista de temas que têm aula publicada (só o identificador do tema; o cartão mostra "Abrir a aula").
--   * app_tema_aula(tema): a aula para ler: seções, tabela, pontos-chave, fixação, flashcards ilustrados, Revisão da Aula e mídias
--     (só link embutido de YouTube/Vimeo). NUNCA devolve: PDF, material só da equipe, caminho de arquivo, afirmações, fontes,
--     apontamentos de conferência, código GR-xxx.
--   * ch_worker_aula_aluno_arquivo(tema, qual, n): o caminho da imagem (Revisão da Aula A4 ou flashcard ilustrado) para o SERVIDOR ler do
--     depósito protegido. Só execução do servidor (service_role), que antes confere o login; o navegador nunca recebe o caminho.
-- Depende das migrações 9861, 9862, 9950, 9980 e 9981. Pode ser colada duas ou mais vezes.
-- =============================================================================

-- Aula publicada do tema: { lesson_id, version_id, unit_id } ou nulo. Exige a aula da Central no ar E publicação ativa da versão.
create or replace function public.ch_tema_aula_aberta(p_tema text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('lesson_id', l.id, 'version_id', l.ch_version_id, 'unit_id', l.ch_unit_id, 'updated_at', l.central_updated_at)
    from public.lessons l
    join public.ch_unit_versions v on v.id = l.ch_version_id and v.unit_id = l.ch_unit_id and v.status = 'published'
   where l.origin = 'central' and l.published and public.ch_unit_code(l.ch_unit_id) = p_tema
     and exists (select 1 from public.ch_publications p where p.unit_version_id = v.id and p.retired_at is null)
   limit 1
$$;
revoke execute on function public.ch_tema_aula_aberta(text) from public, anon, authenticated;

create or replace function public.app_temas_com_aula() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(t.id order by t.ordem) from public.grande_temas t where public.ch_tema_aula_aberta(t.id) is not null), '[]'::jsonb);
end
$$;
revoke execute on function public.app_temas_com_aula() from public, anon;
grant execute on function public.app_temas_com_aula() to authenticated;

create or replace function public.app_tema_aula(p_tema_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb;
  v public.ch_unit_versions;
  l public.lessons;
  t public.grande_temas;
  rev public.ch_unit_materials;
  fc public.ch_unit_materials;
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  a := public.ch_tema_aula_aberta(p_tema_id);
  if a is null then return null; end if;   -- sem aula publicada: nada (nem rascunho, nem "aguardando revisão")
  perform public.ch_unit_materials_sync((a ->> 'version_id')::uuid);   -- a lista de materiais da versão existe mesmo que a equipe nunca tenha aberto a tela Unidades
  select * into v from public.ch_unit_versions where id = (a ->> 'version_id')::uuid;
  select * into l from public.lessons where id = (a ->> 'lesson_id')::uuid;
  select * into t from public.grande_temas where id = p_tema_id;
  select * into rev from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'revisao_aula' limit 1;
  select * into fc from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'flashcards_ilustrados' limit 1;
  r := jsonb_build_object(
    'lesson_id', l.id,
    'titulo', l.title, 'tema', t.titulo, 'area', t.area, 'area_nome', t.area_nome, 'subarea', t.subarea,
    'cabecalho', split_part(coalesce(l.summary, ''), E'\n', 1),
    'atualizado_em', l.central_updated_at,
    'pontos_chave', to_jsonb(coalesce(l.key_points, '{}'::text[])),
    'secoes', (select coalesce(jsonb_agg(jsonb_build_object('titulo', s ->> 'heading',
                 'paragrafos', (select coalesce(jsonb_agg(p ->> 'text'), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) p where btrim(coalesce(p ->> 'text', '')) <> ''))
                 order by o), '[]'::jsonb)
               from jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) with ordinality as x (s, o)),
    'tabelas', (select coalesce(jsonb_agg(jsonb_build_object('titulo', x.title, 'posicao', x.position, 'headers', x.content -> 'headers', 'rows', x.content -> 'rows') order by x.position, x.created_at), '[]'::jsonb)
                from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'tabela'),
    'midias', (select coalesce(jsonb_agg(jsonb_build_object('tipo', x.kind, 'titulo', x.title, 'posicao', x.position, 'duracao_segundos', x.duration_seconds, 'embed_url', x.embed_url,
                 'legenda', x.content ->> 'legenda', 'transcricao', x.content ->> 'transcricao') order by x.position, x.created_at), '[]'::jsonb)
               from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind in ('audio', 'video') and x.embed_url is not null),
    'revisao_aula', case when rev.id is null then null else jsonb_build_object('titulo', 'Revisão da Aula',
        'alt', 'Revisão da Aula: ' || coalesce(l.title, ''),
        'texto_alternativo', btrim(regexp_replace(coalesce(rev.files -> 0 ->> 'texto_alternativo', ''), 'GR-[0-9]{3}', '', 'g'))) end,
    'flashcards', case when fc.id is null then null else jsonb_build_object('cartoes', coalesce((
        select jsonb_agg(jsonb_build_object('n', t2.o, 'frente', t2.c ->> 'front', 'verso', t2.c ->> 'back',
                 'imagem', exists (select 1 from jsonb_array_elements(fc.files) f where f ->> 'caminho' ~* ('-digital-frente\.png$') and f ->> 'caminho' ~* ((t2.c ->> 'card_id') || '-digital-frente')))
               order by t2.o)
          from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) with ordinality as t2 (c, o)
         where m.unit_version_id = v.id and m.kind = 'flashcards'), '[]'::jsonb)) end,
    'questoes', (select jsonb_build_object('itens', coalesce((select jsonb_agg(jsonb_build_object('numero', q ->> 'number', 'enunciado', q ->> 'stem', 'alternativas', q -> 'options', 'correta', q ->> 'correct', 'comentarios', q -> 'comments') order by o)
                    from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'items', '[]'::jsonb)) with ordinality as t3 (q, o)
                   where m.unit_version_id = v.id and m.kind = 'questions'), '[]'::jsonb))
                  from public.ch_unit_materials x where x.unit_version_id = v.id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'questoes_fixacao' limit 1)
  );
  return r;
end
$$;
revoke execute on function public.app_tema_aula(text) from public, anon;
grant execute on function public.app_tema_aula(text) to authenticated;

-- Caminho da imagem para o servidor ler. qual: 'revisao' | 'frente' | 'verso' (n = número do cartão, de 1).
create or replace function public.ch_worker_aula_aluno_arquivo(p_tema_id text, p_qual text, p_n integer default 1) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb;
  v_card text;
  f jsonb;
begin
  a := public.ch_tema_aula_aberta(p_tema_id);   -- o servidor já conferiu o login; aqui só vale aula PUBLICADA
  if a is null then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  perform public.ch_unit_materials_sync((a ->> 'version_id')::uuid);
  if p_qual = 'revisao' then
    select x.files -> 0 into f from public.ch_unit_materials x
     where x.unit_version_id = (a ->> 'version_id')::uuid and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'revisao_aula' limit 1;
  elsif p_qual in ('frente', 'verso') then
    select c ->> 'card_id' into v_card from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) with ordinality as t (c, o)
     where m.unit_version_id = (a ->> 'version_id')::uuid and m.kind = 'flashcards' and t.o = p_n;
    if v_card is null or v_card !~ '^[A-Za-z0-9-]{3,40}$' then raise exception 'Arquivo não encontrado.' using errcode = 'P0002'; end if;
    select ff into f from public.ch_unit_materials x, jsonb_array_elements(x.files) ff
     where x.unit_version_id = (a ->> 'version_id')::uuid and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'flashcards_ilustrados'
       and ff ->> 'caminho' ~* ('/' || v_card || '-digital-' || p_qual || '\.png$') limit 1;
  else
    raise exception 'Arquivo não encontrado.' using errcode = 'P0002';
  end if;
  if f is null or (f ->> 'tipo') is distinct from 'image/png' then raise exception 'Arquivo não encontrado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('caminho', f ->> 'caminho', 'tipo', f ->> 'tipo');
end
$$;
revoke execute on function public.ch_worker_aula_aluno_arquivo(text, text, integer) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.ch_worker_aula_aluno_arquivo(text, text, integer) to service_role; end if; end $g$;
