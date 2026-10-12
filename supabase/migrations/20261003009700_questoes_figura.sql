-- =============================================================================
-- Aba Questões, Q07 (decisão do dono, 11/10/2026): enviar a figura da questão pela tela.
--
--   * A equipe toda (editor e administrador) envia a figura; UMA figura por questão; o texto alternativo (de 10 a 300 letras) é
--     obrigatório. O arquivo é PNG ou JPG de até 5 MB, guardado num depósito PRIVADO ("question-figures") com nome sorteado
--     (nunca o nome do arquivo de quem enviou, nunca o código da questão). O servidor (/api/question-figures) prepara o envio,
--     confere o arquivo e só então chama estas funções; o aluno recebe um endereço assinado e de curta duração.
--   * A figura fica em questions.images como { path, alt }. O aluno lê essa coluna (practice_question_view), então nela só vão o
--     caminho sorteado e o texto alternativo: nada de nome de arquivo, tamanho, tipo nem quem enviou (isso fica no Registro).
--   * Vincular a figura LIBERA a questão que citava imagem sem imagem: a regra dos treinos (practice_pool: "cita figura e não tem
--     imagem fica de fora") já olha jsonb_array_length(images), então não muda.
--   * Desmarcar "Cita figura" NÃO libera a questão sem a imagem: um gatilho recusa tirar a marca enquanto não houver figura
--     (editor, SQL direto); a importação com "atualizar" não falha por isso, mas deixa a marca como estava.
--   * Questão que já tem VÁRIAS figuras (vindas do caderno oficial) não é mexida pelo envio.
--
-- Funções novas: app_admin_set_question_image, app_admin_remove_question_image (equipe), app_question_figure (aluno logado) e o gatilho questions_keep_figure_flag.
-- Redefinida: admin_import_merge_question (parte da …7700, a única versão): só muda a regra de "cita figura".
-- Pode ser colada duas vezes. Para desfazer: apagar o gatilho e as duas funções novas e recriar admin_import_merge_question como
-- na …7700 (as figuras já gravadas em questions.images continuam valendo).
-- =============================================================================

-- ---------------------------------------------------------------- depósito privado das figuras
-- No banco de testes (sem o esquema "storage" do Supabase) este bloco não faz nada.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('question-figures', 'question-figures', false, 5242880, array['image/png', 'image/jpeg'])
    on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg'];
  end if;
end
$$;

-- ---------------------------------------------------------------- vincular (ou trocar) a figura
-- p_image: { path, alt, content_type, size_bytes }. O servidor já conferiu o arquivo; aqui o banco confere de novo as regras que
-- valem para qualquer caminho (nome, tipo, tamanho, texto alternativo, arquivo de outra questão, mais de uma figura).
create or replace function public.app_admin_set_question_image(p_question_id text, p_image jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
  v_path constant text := btrim(coalesce(p_image ->> 'path', ''));
  v_alt constant text := btrim(coalesce(p_image ->> 'alt', ''));
  v_type constant text := p_image ->> 'content_type';
  v_size numeric;
  v_ext text;
  v_replaced boolean;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_image) is distinct from 'object' then
    raise exception 'Envie a figura da questão.' using errcode = '22023';
  end if;
  if char_length(v_alt) < 10 or char_length(v_alt) > 300 then
    raise exception 'Escreva o texto alternativo da figura (de 10 a 300 letras): ele descreve a imagem para quem não a vê.' using errcode = '22023';
  end if;
  if v_type is null or v_type not in ('image/png', 'image/jpeg') then
    raise exception 'Envie a figura em PNG ou JPG.' using errcode = '22023';
  end if;
  begin
    v_size := (p_image ->> 'size_bytes')::numeric;
  exception when others then
    v_size := null;
  end;
  if v_size is null or v_size <= 0 then
    raise exception 'O arquivo da figura está vazio.' using errcode = '22023';
  end if;
  if v_size > 5 * 1024 * 1024 then
    raise exception 'A figura pode ter no máximo 5 MB.' using errcode = '22023';
  end if;
  v_ext := case v_type when 'image/png' then 'png' else 'jpg' end;
  if v_path !~ ('^questoes/[0-9a-f]{32}\.' || v_ext || '$') then
    raise exception 'Caminho de figura inválido.' using errcode = '22023';
  end if;

  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_array_length(v.images) > 1 then
    raise exception 'Esta questão tem mais de uma figura vinda do caderno oficial: o envio trabalha com uma figura por questão e não troca nem tira essas.' using errcode = '22023';
  end if;
  if exists (select 1 from public.questions o where o.id <> v.id and exists (select 1 from jsonb_array_elements(o.images) i where i ->> 'path' = v_path)) then
    raise exception 'Este arquivo já é a figura de outra questão.' using errcode = '22023';
  end if;

  v_replaced := jsonb_array_length(v.images) = 1;
  update public.questions set images = jsonb_build_array(jsonb_build_object('path', v_path, 'alt', v_alt)) where id = v.id;
  perform public.admin_log('question.figure_set', v.id, jsonb_build_object('code', v.code, 'replaced', v_replaced, 'alt', v_alt));
  return public.app_admin_question(v.id);
end
$$;
revoke execute on function public.app_admin_set_question_image(text, jsonb) from public, anon;

-- ---------------------------------------------------------------- a figura como o aluno a recebe
-- Qualquer pessoa logada (como practice_question_view): devolve só { path, alt } (ou { url, alt } nas figuras do caderno), para o
-- servidor assinar o endereço. Visitante não chama.
create or replace function public.app_question_figure(p_question_id text, p_index integer default 0) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('path', q.images -> p_index ->> 'path', 'url', q.images -> p_index ->> 'url', 'alt', q.images -> p_index ->> 'alt'))
  from public.questions q
  where q.id = p_question_id and (select auth.uid()) is not null and p_index >= 0 and p_index < jsonb_array_length(q.images)
$$;
revoke execute on function public.app_question_figure(text, integer) from public, anon;

-- ---------------------------------------------------------------- tirar a figura
-- A marca "Cita figura" fica como estava: a questão que citava a figura volta para fora dos treinos; a que não citava continua valendo.
create or replace function public.app_admin_remove_question_image(p_question_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
begin
  perform public.assert_staff();
  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_array_length(v.images) > 1 then
    raise exception 'Esta questão tem mais de uma figura vinda do caderno oficial: o envio trabalha com uma figura por questão e não troca nem tira essas.' using errcode = '22023';
  end if;
  if jsonb_array_length(v.images) = 1 then
    update public.questions set images = '[]'::jsonb where id = v.id;
    perform public.admin_log('question.figure_removed', v.id, jsonb_build_object('code', v.code, 'needs_image', v.needs_image));
  end if;
  return public.app_admin_question(v.id);
end
$$;
revoke execute on function public.app_admin_remove_question_image(text) from public, anon;

-- ---------------------------------------------------------------- desmarcar "Cita figura" não libera a questão sem a imagem
create or replace function public.questions_keep_figure_flag() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if old.needs_image and not new.needs_image and jsonb_array_length(new.images) = 0 then
    raise exception 'Esta questão cita uma figura que ainda não foi enviada: envie a figura antes de tirar a marca "Cita figura". Sem a imagem, a questão não pode ir para os treinos.' using errcode = '22023';
  end if;
  return new;
end
$$;
revoke execute on function public.questions_keep_figure_flag() from public, anon, authenticated;
drop trigger if exists questions_keep_figure_flag on public.questions;
create trigger questions_keep_figure_flag before update of needs_image on public.questions
  for each row when (old.needs_image and not new.needs_image) execute function public.questions_keep_figure_flag();

-- ---------------------------------------------------------------- importação com "atualizar" (corpo da …7700)
-- Mais: a marca "cita figura" que o arquivo manda tirar não é tirada enquanto a questão não tem figura (a importação segue; a
-- questão continua fora dos treinos até a figura ser enviada).
create or replace function public.admin_import_merge_question(p_id text, q jsonb) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.questions set
    area = (q ->> 'area')::public.med_area,
    topic = btrim(q ->> 'topic'),
    subtopic = coalesce(nullif(btrim(coalesce(q ->> 'subtopic', '')), ''), subtopic),
    specialty = coalesce(nullif(btrim(coalesce(q ->> 'specialty', '')), ''), specialty),
    statement = btrim(q ->> 'statement'),
    options = public.admin_import_merge_options(options, q -> 'options'),
    expected_conduct = coalesce(nullif(btrim(coalesce(q ->> 'expected_conduct', '')), ''), expected_conduct),
    inep_intent = coalesce(nullif(btrim(coalesce(q ->> 'inep_intent', '')), ''), inep_intent),
    needs_image = case when q ->> 'needs_image_declared' = 'true'
                       then coalesce((q ->> 'needs_image')::boolean, needs_image) or (needs_image and jsonb_array_length(images) = 0)
                       else needs_image end,
    sources = case when jsonb_typeof(q -> 'sources') = 'array' and jsonb_array_length(q -> 'sources') > 0 then q -> 'sources' else sources end
  where id = p_id;
end
$$;
revoke execute on function public.admin_import_merge_question(text, jsonb) from public, anon, authenticated;
