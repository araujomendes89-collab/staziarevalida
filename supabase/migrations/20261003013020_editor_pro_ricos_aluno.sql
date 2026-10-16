-- =============================================================================
-- A aula dentro do Grande Tema, para o ALUNO, com suporte a texto rico.
-- Esta migração atualiza a função app_tema_aula para devolver a configuração
-- do documento (doc_config) e o conteúdo rico (ricos) de cada parágrafo,
-- preservando a mesma estrutura anterior.
-- O aluno continua sem receber afirmações, fontes ou comentários.
-- Depende da migração 9992. Pode ser colada duas vezes.
-- =============================================================================

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
    'doc_config', case when jsonb_typeof(v.content -> 'doc_config') = 'object' then v.content -> 'doc_config' else null end,
    'pontos_chave', to_jsonb(coalesce(l.key_points, '{}'::text[])),
    'secoes', (select coalesce(jsonb_agg(jsonb_build_object('titulo', s ->> 'heading',
                 'paragrafos', (select coalesce(jsonb_agg(p ->> 'text' order by k), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) with ordinality as y (p, k) where btrim(coalesce(p ->> 'text', '')) <> ''),
                 'ricos', (select coalesce(jsonb_agg(case when jsonb_typeof(p -> 'rico') = 'object' then p -> 'rico' else null end order by k), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) with ordinality as y (p, k) where btrim(coalesce(p ->> 'text', '')) <> '')
                 ) order by o), '[]'::jsonb)
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
