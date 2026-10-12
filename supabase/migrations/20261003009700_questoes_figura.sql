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
-- Rodada de correções da revisão: o banco só aceita como figura um arquivo que o SERVIDOR conferiu (tabela question_figure_files,
--   gravada só por ch_worker_question_figure_confirm, do serviço); o arquivo é reservado a uma questão só e só pode ser apagado do
--   depósito depois de liberado (ch_worker_question_figure_drop); o gatilho questions_images_guard vale para qualquer gravação.
--
-- Funções novas: app_admin_set_question_image, app_admin_remove_question_image (equipe), app_question_figure (aluno logado), as do
--   serviço ch_worker_question_figure_confirm e ch_worker_question_figure_drop, e os gatilhos questions_keep_figure_flag e questions_images_guard.
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

-- ---------------------------------------------------------------- arquivos que o SERVIDOR conferiu
-- Só o servidor (service_role) grava aqui, depois de olhar o arquivo no depósito (tipo, tamanho, cabeçalho e estrutura da imagem).
-- O banco só aceita como figura um caminho que está nesta tabela: um editor que chame a função direto pela API, com um caminho
-- inventado, não consegue vincular nada. A coluna question_id é a "reserva" do arquivo: ele é de UMA questão só (o vínculo e a
-- troca acontecem com a linha do arquivo travada, então duas confirmações ao mesmo tempo não passam as duas). O arquivo só pode
-- ser apagado do depósito depois que o banco o liberou (estado 'releasing', que ninguém mais vincula). A linha 'releasing' NÃO sai
-- depois de apagar o arquivo: ela é a lápide que impede o mesmo caminho de ser conferido e vinculado de novo (tamanho 0 = nunca
-- foi conferido).
create table if not exists public.question_figure_files (
  path text primary key check (path ~ '^questoes/[0-9a-f]{32}\.(png|jpg)$'),
  content_type text not null check (content_type in ('image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes between 0 and 5242880),
  state text not null default 'confirmed' check (state in ('confirmed', 'releasing')),
  question_id text references public.questions (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  check (state = 'confirmed' or question_id is null)
);
create index if not exists question_figure_files_question_idx on public.question_figure_files (question_id) where question_id is not null;
alter table public.question_figure_files enable row level security;
revoke all on table public.question_figure_files from public, anon, authenticated;

-- O servidor registra o arquivo que conferiu. Idempotente: o mesmo arquivo de novo não muda nada; outro tipo ou tamanho para o
-- mesmo caminho é recusado.
create or replace function public.ch_worker_question_figure_confirm(p_path text, p_content_type text, p_size_bytes numeric) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_path constant text := btrim(coalesce(p_path, ''));
  f public.question_figure_files;
begin
  if p_content_type is null or p_content_type not in ('image/png', 'image/jpeg') then
    raise exception 'Envie a figura em PNG ou JPG.' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'O arquivo da figura está vazio.' using errcode = '22023';
  end if;
  if p_size_bytes > 5 * 1024 * 1024 then
    raise exception 'A figura pode ter no máximo 5 MB.' using errcode = '22023';
  end if;
  if v_path !~ ('^questoes/[0-9a-f]{32}\.' || case p_content_type when 'image/png' then 'png' else 'jpg' end || '$') then
    raise exception 'Caminho de figura inválido.' using errcode = '22023';
  end if;
  insert into public.question_figure_files (path, content_type, size_bytes) values (v_path, p_content_type, p_size_bytes::integer)
  on conflict (path) do nothing;
  select * into f from public.question_figure_files where path = v_path;
  if f.state <> 'confirmed' then
    raise exception 'Este arquivo já foi liberado para ser apagado. Envie a figura de novo.' using errcode = '22023';
  end if;
  if f.content_type <> p_content_type or f.size_bytes <> p_size_bytes::integer then
    raise exception 'Este arquivo já foi conferido com outro tipo ou tamanho.' using errcode = '22023';
  end if;
  return true;
end
$$;
revoke execute on function public.ch_worker_question_figure_confirm(text, text, numeric) from public, anon, authenticated;

-- O servidor pergunta se pode apagar o arquivo do depósito: só pode se nenhuma questão o usa. Com a linha travada, uma vinculação
-- ao mesmo tempo espera; depois que o arquivo vira 'releasing' (lápide), ninguém o vincula nem o confere de novo. Quem apaga
-- do depósito só apaga depois de receber true daqui.
create or replace function public.ch_worker_question_figure_drop(p_path text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  f public.question_figure_files;
begin
  if p_path is null or p_path !~ '^questoes/[0-9a-f]{32}\.(png|jpg)$' then
    raise exception 'Caminho de figura inválido.' using errcode = '22023';
  end if;
  insert into public.question_figure_files (path, content_type, size_bytes, state)
  values (p_path, case when p_path like '%.png' then 'image/png' else 'image/jpeg' end, 0, 'releasing')
  on conflict (path) do nothing;
  select * into f from public.question_figure_files where path = p_path for update;
  if f.question_id is not null
     or exists (select 1 from public.questions q where exists (select 1 from jsonb_array_elements(q.images) i where i ->> 'path' = p_path)) then
    return false;
  end if;
  update public.question_figure_files set state = 'releasing', question_id = null where path = p_path;
  return true;
end
$$;
revoke execute on function public.ch_worker_question_figure_drop(text) from public, anon, authenticated;

-- Quem grava a figura de uma questão (qualquer meio, inclusive SQL direto) só pode usar um arquivo conferido e reservado a ela.
create or replace function public.questions_images_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_path text;
begin
  for v_path in select i ->> 'path' from jsonb_array_elements(new.images) i where i ? 'path' loop
    if not exists (select 1 from public.question_figure_files f where f.path = v_path and f.state = 'confirmed' and f.question_id = new.id) then
      raise exception 'Esta figura não foi conferida pelo servidor ou é de outra questão. Envie a figura de novo.' using errcode = '22023';
    end if;
  end loop;
  return new;
end
$$;
revoke execute on function public.questions_images_guard() from public, anon, authenticated;
drop trigger if exists questions_images_guard on public.questions;
create trigger questions_images_guard before insert or update of images on public.questions
  for each row when (new.images @? '$[*].path') execute function public.questions_images_guard();

-- ---------------------------------------------------------------- vincular (ou trocar) a figura
-- p_image: { path, alt }. O caminho precisa ser de um arquivo que o servidor conferiu (tipo e tamanho vêm da conferência dele,
-- não do que o editor diz). Mais: texto alternativo, arquivo reservado a outra questão, questão com várias figuras do caderno.
-- O resultado traz released_path: o arquivo da figura anterior (que o servidor pode apagar do depósito), quando houve troca.
create or replace function public.app_admin_set_question_image(p_question_id text, p_image jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
  f public.question_figure_files;
  v_path text;
  v_alt text;
  v_old text;
  v_replaced boolean;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_image) is distinct from 'object' then
    raise exception 'Envie a figura da questão.' using errcode = '22023';
  end if;
  v_path := btrim(coalesce(p_image ->> 'path', ''));
  v_alt := btrim(coalesce(p_image ->> 'alt', ''));
  if char_length(v_alt) < 10 or char_length(v_alt) > 300 then
    raise exception 'Escreva o texto alternativo da figura (de 10 a 300 letras): ele descreve a imagem para quem não a vê.' using errcode = '22023';
  end if;
  if v_path !~ '^questoes/[0-9a-f]{32}\.(png|jpg)$' then
    raise exception 'Caminho de figura inválido.' using errcode = '22023';
  end if;

  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_array_length(v.images) > 1 then
    raise exception 'Esta questão tem mais de uma figura vinda do caderno oficial: o envio trabalha com uma figura por questão e não troca nem tira essas.' using errcode = '22023';
  end if;

  -- o arquivo precisa ter sido conferido pelo servidor; a linha dele fica travada até o fim, então duas vinculações ao mesmo tempo
  -- do mesmo arquivo se enfileiram e a segunda enxerga a reserva da primeira
  select * into f from public.question_figure_files x where x.path = v_path for update;
  if not found or f.state <> 'confirmed' then
    raise exception 'O servidor ainda não conferiu o arquivo desta figura. Envie a figura de novo.' using errcode = '22023';
  end if;
  if f.question_id is not null and f.question_id <> v.id then
    raise exception 'Este arquivo já é a figura de outra questão.' using errcode = '22023';
  end if;

  v_old := v.images -> 0 ->> 'path';
  v_replaced := jsonb_array_length(v.images) = 1;
  update public.question_figure_files set question_id = v.id where path = v_path;
  update public.questions set images = jsonb_build_array(jsonb_build_object('path', v_path, 'alt', v_alt)) where id = v.id;
  if v_old is not null and v_old <> v_path then
    update public.question_figure_files set state = 'releasing', question_id = null where path = v_old and question_id = v.id;
  else
    v_old := null;
  end if;
  perform public.admin_log('question.figure_set', v.id, jsonb_build_object('code', v.code, 'replaced', v_replaced, 'alt', v_alt));
  return public.app_admin_question(v.id) || jsonb_build_object('released_path', to_jsonb(v_old));
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
  v_old text;
begin
  perform public.assert_staff();
  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_array_length(v.images) > 1 then
    raise exception 'Esta questão tem mais de uma figura vinda do caderno oficial: o envio trabalha com uma figura por questão e não troca nem tira essas.' using errcode = '22023';
  end if;
  if jsonb_array_length(v.images) = 1 then
    v_old := v.images -> 0 ->> 'path';
    update public.questions set images = '[]'::jsonb where id = v.id;
    if v_old is not null then
      update public.question_figure_files set state = 'releasing', question_id = null where path = v_old and question_id = v.id;
    end if;
    perform public.admin_log('question.figure_removed', v.id, jsonb_build_object('code', v.code, 'needs_image', v.needs_image));
  end if;
  return public.app_admin_question(v.id) || jsonb_build_object('released_path', to_jsonb(v_old));
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
