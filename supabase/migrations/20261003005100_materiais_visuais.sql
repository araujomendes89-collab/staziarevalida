-- =============================================================================
-- Materiais visuais educacionais (Administração › Central de Conteúdo › Materiais visuais): card para feed,
-- página A4, story e flashcards frente e verso (digital e A6 para impressão), com os modelos do pacote
-- "StaziaMed Revalida — Modelos educacionais" (2026-10-06). Mapa: docs/architecture/MATERIAIS_VISUAIS.md.
--
--   a equipe preenche (formulário ou comando)  →  o servidor valida (src/shared/visualMaterials) e grava uma VERSÃO
--   →  a geração entra na fila durável (ch_jobs, etapa visual_render)  →  o processamento (Cloud Run em produção,
--      o próprio servidor no desenvolvimento) gera PNG/PDF com o Chromium e confere  →  arquivos no depósito
--      privado "content-hub" (pasta visual/), entregues só pelas rotas /api/content-hub/visual.
--
-- Regras no banco (não só na tela):
--   * só a equipe (administrador ou editor) cria, edita, duplica e gera; escrita só pelas funções do servidor;
--   * cada edição vira uma versão nova; versões e arquivos antigos continuam guardados;
--   * flashcard: card_id único e fixo em todas as versões; frente e verso são gravados JUNTOS, com o mesmo
--     card_id, specialty_key e ordem; o A6 só tem o PDF com os dois lados (nunca um lado sozinho);
--   * especialidade: uma das 6 chaves e o nome por extenso (a cor nunca é o único identificador).
-- Nada aqui escreve conteúdo clínico: o conteúdo é o que a equipe fornece.
-- =============================================================================

-- ---------------------------------------------------------------- fila: nova etapa
alter table public.ch_jobs drop constraint ch_jobs_step_check;
alter table public.ch_jobs add constraint ch_jobs_step_check
  check (step in ('extract', 'classify', 'claims', 'evidence', 'draft', 'materials', 'render', 'review_check', 'source_index', 'visual_render'));

-- ---------------------------------------------------------------- depósito: PNG das peças e imagens das ilustrações
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set allowed_mime_types = case when allowed_mime_types is null then null
                                     else array(select distinct x from unnest(allowed_mime_types || array['image/png', 'image/jpeg', 'image/webp']) x) end
     where id = 'content-hub';
  end if;
end
$$;

-- ---------------------------------------------------------------- materiais, versões e arquivos
create sequence public.ch_visual_card_seq;

create table public.ch_visual_materials (
  id uuid primary key default gen_random_uuid(),
  model text not null check (model in ('feed', 'a4', 'story', 'flashcard_digital', 'flashcard_a6')),
  specialty_key text not null check (specialty_key in ('ginecologia', 'pediatria', 'clinica_medica', 'cirurgia', 'preventiva_mfc', 'fallback')),
  specialty_label text not null check (char_length(btrim(specialty_label)) between 1 and 60),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- flashcard: mesmo ID na frente e no verso, em todas as versões
  card_id text unique check (card_id is null or card_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$'),
  batch_label text check (char_length(batch_label) <= 80),
  batch_order integer not null default 1 check (batch_order between 1 and 9999),
  current_version integer not null default 1 check (current_version >= 1),
  duplicated_from uuid references public.ch_visual_materials (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint ch_visual_card_id_pair check ((model in ('flashcard_digital', 'flashcard_a6')) = (card_id is not null))
);
create index ch_visual_materials_updated_idx on public.ch_visual_materials (updated_at desc);

create table public.ch_visual_versions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.ch_visual_materials (id) on delete cascade,
  version integer not null check (version >= 1),
  -- conteúdo validado (nomes dos campos do formulário), como foi salvo
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 65536),
  content_hash text not null,
  specialty_key text not null check (specialty_key in ('ginecologia', 'pediatria', 'clinica_medica', 'cirurgia', 'preventiva_mfc', 'fallback')),
  specialty_label text not null,
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- geração: rascunho → na fila → gerando → pronto (ou reprovado na conferência / falhou); o rascunho nunca se perde
  render_status text not null default 'draft' check (render_status in ('draft', 'queued', 'rendering', 'ready', 'check_failed', 'failed')),
  render_error text check (char_length(render_error) <= 1000),
  rendered_at timestamptz,
  template_version text,
  check_result jsonb not null default '{}'::jsonb check (jsonb_typeof(check_result) = 'object'),
  unique (material_id, version)
);

create table public.ch_visual_files (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ch_visual_versions (id) on delete cascade,
  format text not null check (format in ('pdf', 'png')),
  -- single: peça de um lado; front/back: PNG de cada lado; pair: PDF com frente e verso em sequência
  side text not null check (side in ('single', 'front', 'back', 'pair')),
  pages integer not null default 1 check (pages between 1 and 2),
  width integer check (width > 0),
  height integer check (height > 0),
  storage_path text not null check (storage_path ~ '^visual/[A-Za-z0-9/_.-]+$' and storage_path !~ '\.\.'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes > 0),
  -- identificação do par: igual em todos os arquivos da versão (e igual à do material)
  card_id text,
  specialty_key text not null,
  batch_order integer not null,
  template_version text not null,
  created_at timestamptz not null default now(),
  unique (version_id, format, side)
);

-- Imagens das ilustrações: só as enviadas pela equipe pela rota do servidor (tipo e tamanho conferidos lá).
create table public.ch_visual_assets (
  name text primary key check (name ~ '^[0-9a-f]{64}\.(png|jpg|webp)$'),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  bytes integer not null check (bytes between 1 and 10485760),
  storage_path text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ch_visual_materials enable row level security;
alter table public.ch_visual_versions enable row level security;
alter table public.ch_visual_files enable row level security;
alter table public.ch_visual_assets enable row level security;
create policy "materiais visuais: equipe lê" on public.ch_visual_materials for select to authenticated using (public.is_staff());
create policy "versões visuais: equipe lê" on public.ch_visual_versions for select to authenticated using (public.is_staff());
create policy "arquivos visuais: equipe lê" on public.ch_visual_files for select to authenticated using (public.is_staff());
create policy "imagens visuais: equipe lê" on public.ch_visual_assets for select to authenticated using (public.is_staff());
-- escrita só pelas funções abaixo (servidor)

-- ---------------------------------------------------------------- apoio
create function public.ch_visual_card_prefix(p_key text) returns text
  language sql immutable set search_path = ''
as $$
  select case p_key when 'ginecologia' then 'GO' when 'pediatria' then 'PED' when 'clinica_medica' then 'CM'
                    when 'cirurgia' then 'CIR' when 'preventiva_mfc' then 'MFC' else 'GER' end
$$;

create function public.ch_visual_assert_actor(p_actor uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_actor is null or not public.user_is_staff(p_actor) then
    raise exception 'Acesso restrito à equipe de conteúdo (administrador ou editor).' using errcode = '42501';
  end if;
end
$$;

-- Comando do administrador (terminal): quem assina o material, pelo e-mail.
create function public.ch_worker_visual_actor(p_email text) returns uuid
  language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_id is null then raise exception 'Conta não encontrada: %.', p_email using errcode = 'P0002'; end if;
  perform public.ch_visual_assert_actor(v_id);
  return v_id;
end
$$;

-- Fila: cria o trabalho da versão ou devolve o já existente para a fila (sem duplicar).
create function public.ch_visual_enqueue(p_version_id uuid, p_template text) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  v_key constant text := 'visual:' || p_version_id::text || ':' || coalesce(p_template, '');
  v_id uuid;
begin
  insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, max_attempts)
  values (null, 'visual_render', 'visual:' || p_version_id::text, v_key, jsonb_build_object('template', p_template), 3)
  on conflict (idempotency_key) do update
     set status = 'queued', attempts = 0, error = null, run_after = now(), finished_at = null, locked_at = null, checkpoint = '{}'::jsonb
   where public.ch_jobs.status not in ('queued', 'running')
  returning id into v_id;
  if v_id is null then select id into v_id from public.ch_jobs where idempotency_key = v_key; end if;
  update public.ch_visual_versions set render_status = 'queued', render_error = null where id = p_version_id and render_status <> 'rendering';
  return v_id;
end
$$;

-- ---------------------------------------------------------------- gravar (formulário e comando: mesma função)
-- p_content já validado pelo servidor (validateVisualInput). O banco confere de novo o que é estrutural.
create function public.ch_worker_visual_save(p_actor uuid, p_material_id uuid, p_content jsonb, p_generate boolean, p_template text, p_note text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m public.ch_visual_materials;
  cur public.ch_visual_versions;
  v_model text := p_content ->> 'model';
  v_key text := p_content #>> '{specialty,key}';
  v_label text := btrim(coalesce(p_content #>> '{specialty,label}', ''));
  v_pair boolean;
  v_card text := nullif(btrim(coalesce(p_content ->> 'card_id', '')), '');
  v_order integer := coalesce(nullif(p_content ->> 'ordem', '')::integer, 1);
  v_title text;
  v_hash text;
  v_version integer;
  v_version_id uuid;
  v_created boolean := false;
  v_unchanged boolean := false;
  v_image text := nullif(p_content #>> '{ilustracao,imagem}', '');
begin
  perform public.ch_visual_assert_actor(p_actor);
  if p_content is null or jsonb_typeof(p_content) <> 'object' then raise exception 'Conteúdo inválido.' using errcode = '22023'; end if;
  if v_model not in ('feed', 'a4', 'story', 'flashcard_digital', 'flashcard_a6') then raise exception 'Modelo inválido: %.', v_model using errcode = '22023'; end if;
  if v_key is null or v_key not in ('ginecologia', 'pediatria', 'clinica_medica', 'cirurgia', 'preventiva_mfc', 'fallback') then
    raise exception 'Especialidade inválida.' using errcode = '22023';
  end if;
  if v_label = '' then raise exception 'Escreva o nome da especialidade por extenso.' using errcode = '22023'; end if;
  if v_image is not null and not exists (select 1 from public.ch_visual_assets a where a.name = v_image) then
    raise exception 'A imagem da ilustração não está no acervo: envie a imagem de novo.' using errcode = '22023';
  end if;
  v_pair := v_model in ('flashcard_digital', 'flashcard_a6');
  v_title := left(btrim(coalesce(case when v_pair then nullif(p_content ->> 'tema', '') else null end,
                                 case when v_pair then p_content ->> 'pergunta' else p_content ->> 'titulo' end, '')), 200);
  if v_title = '' then raise exception 'Preencha o título (ou a pergunta, no flashcard).' using errcode = '22023'; end if;

  if p_material_id is not null then
    select * into m from public.ch_visual_materials where id = p_material_id for update;
    if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
    if m.model <> v_model then
      raise exception 'O modelo de um material não muda. Para outro modelo, crie um material novo (o comando copiado do atual serve de ponto de partida).' using errcode = '22023';
    end if;
  end if;

  -- card_id: gerado na criação quando não vem; depois não muda
  if v_pair then
    if p_material_id is null then
      if v_card is null then
        loop
          v_card := public.ch_visual_card_prefix(v_key) || '-' || lpad(nextval('public.ch_visual_card_seq')::text, 4, '0');
          exit when not exists (select 1 from public.ch_visual_materials x where x.card_id = v_card);
        end loop;
      elsif exists (select 1 from public.ch_visual_materials x where x.card_id = v_card) then
        raise exception 'Já existe um card com o ID %.', v_card using errcode = '23505';
      end if;
    else
      if v_card is not null and v_card <> m.card_id then
        raise exception 'O ID do card não muda (é o mesmo na frente, no verso e em todas as versões). Para outro ID, duplique o material.' using errcode = '22023';
      end if;
      v_card := m.card_id;
    end if;
  else
    v_card := null;
  end if;
  p_content := jsonb_set(p_content, '{card_id}', to_jsonb(coalesce(v_card, '')));
  v_hash := public.ch_hash(p_content);

  if p_material_id is null then
    insert into public.ch_visual_materials (model, specialty_key, specialty_label, title, card_id, batch_label, batch_order, current_version, created_by, updated_by)
    values (v_model, v_key, v_label, v_title, v_card, nullif(btrim(coalesce(p_content ->> 'lote', '')), ''), v_order, 1, p_actor, p_actor)
    returning * into m;
    v_created := true;
    v_version := 1;
  else
    select * into cur from public.ch_visual_versions where material_id = m.id and version = m.current_version;
    if found and cur.content_hash = v_hash then
      v_unchanged := true;
      v_version := cur.version;
      v_version_id := cur.id;
    else
      v_version := m.current_version + 1;
      update public.ch_visual_materials
         set specialty_key = v_key, specialty_label = v_label, title = v_title, batch_label = nullif(btrim(coalesce(p_content ->> 'lote', '')), ''),
             batch_order = v_order, current_version = v_version, updated_by = p_actor, updated_at = now()
       where id = m.id;
    end if;
  end if;

  if not v_unchanged then
    insert into public.ch_visual_versions (material_id, version, content, content_hash, specialty_key, specialty_label, note, created_by)
    values (m.id, v_version, p_content, v_hash, v_key, v_label, nullif(btrim(coalesce(p_note, '')), ''), p_actor)
    returning id into v_version_id;
  end if;

  if p_generate then perform public.ch_visual_enqueue(v_version_id, p_template); end if;
  insert into public.ch_audit (actor_id, action, target, details)
  values (p_actor, case when v_created then 'visual.create' when v_unchanged then 'visual.keep' else 'visual.version' end, m.id::text,
          jsonb_build_object('version', v_version, 'model', v_model, 'specialty_key', v_key, 'card_id', v_card, 'generate', p_generate));
  return jsonb_build_object('material_id', m.id, 'version_id', v_version_id, 'version', v_version, 'card_id', v_card,
                            'created', v_created, 'unchanged', v_unchanged, 'queued', p_generate);
end
$$;

-- Duplicar: material novo com o conteúdo da versão atual (flashcard ganha card_id novo), como rascunho.
create function public.ch_worker_visual_duplicate(p_actor uuid, p_material_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m public.ch_visual_materials;
  cur public.ch_visual_versions;
  r jsonb;
begin
  perform public.ch_visual_assert_actor(p_actor);
  select * into m from public.ch_visual_materials where id = p_material_id;
  if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  select * into cur from public.ch_visual_versions where material_id = m.id and version = m.current_version;
  r := public.ch_worker_visual_save(p_actor, null, jsonb_set(cur.content, '{card_id}', '""'::jsonb), false, null, 'Cópia de ' || coalesce(m.card_id, m.title));
  update public.ch_visual_materials set duplicated_from = m.id where id = (r ->> 'material_id')::uuid;
  insert into public.ch_audit (actor_id, action, target, details) values (p_actor, 'visual.duplicate', m.id::text, jsonb_build_object('copy', r ->> 'material_id'));
  return r || jsonb_build_object('duplicated_from', m.id);
end
$$;

-- Gerar de novo uma versão (a atual, se não disser qual): falhou, mudou o modelo ou faltou o processamento.
create function public.ch_worker_visual_regenerate(p_actor uuid, p_material_id uuid, p_version integer, p_template text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m public.ch_visual_materials;
  v public.ch_visual_versions;
  v_job uuid;
begin
  perform public.ch_visual_assert_actor(p_actor);
  select * into m from public.ch_visual_materials where id = p_material_id;
  if not found then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  select * into v from public.ch_visual_versions where material_id = m.id and version = coalesce(p_version, m.current_version);
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  v_job := public.ch_visual_enqueue(v.id, p_template);
  insert into public.ch_audit (actor_id, action, target, details) values (p_actor, 'visual.regenerate', m.id::text, jsonb_build_object('version', v.version));
  return jsonb_build_object('material_id', m.id, 'version_id', v.id, 'version', v.version, 'job_id', v_job);
end
$$;

-- Imagem enviada pela equipe (o servidor já conferiu tipo, assinatura do arquivo e tamanho).
create function public.ch_worker_visual_register_asset(p_actor uuid, p_asset jsonb) returns text
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ch_visual_assert_actor(p_actor);
  insert into public.ch_visual_assets (name, mime, width, height, bytes, storage_path, created_by)
  values (p_asset ->> 'name', p_asset ->> 'mime', (p_asset ->> 'width')::int, (p_asset ->> 'height')::int, (p_asset ->> 'bytes')::int, p_asset ->> 'storage_path', p_actor)
  on conflict (name) do nothing;
  return p_asset ->> 'name';
end
$$;

-- ---------------------------------------------------------------- processamento
create function public.ch_worker_visual_job(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('version_id', v.id, 'material_id', m.id, 'version', v.version, 'model', m.model, 'card_id', m.card_id,
                            'batch_order', m.batch_order, 'specialty_key', v.specialty_key, 'specialty_label', v.specialty_label,
                            'title', m.title, 'content', v.content, 'render_status', v.render_status)
  from public.ch_visual_versions v join public.ch_visual_materials m on m.id = v.material_id
  where v.id = p_version_id
$$;

create function public.ch_worker_visual_status(p_version_id uuid, p_status text, p_error text default null) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('queued', 'rendering', 'failed') then raise exception 'Situação inválida: %.', p_status using errcode = '22023'; end if;
  update public.ch_visual_versions set render_status = p_status, render_error = left(p_error, 1000) where id = p_version_id;
end
$$;

-- Arquivos de uma versão, gravados de uma vez: o conjunto precisa estar completo (o par frente e verso vai junto)
-- e todos com a identificação do material. Os arquivos anteriores da MESMA versão saem; os de outras versões ficam.
create function public.ch_worker_visual_save_files(p_version_id uuid, p_files jsonb, p_check jsonb, p_template text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v record;
  f jsonb;
  v_required text[];
  v_got text[];
  v_removed text[];
begin
  select vv.id, vv.specialty_key, m.model, m.card_id, m.batch_order into v
    from public.ch_visual_versions vv join public.ch_visual_materials m on m.id = vv.material_id
   where vv.id = p_version_id for update of vv;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'Nenhum arquivo para gravar.' using errcode = '22023';
  end if;
  for f in select x from jsonb_array_elements(p_files) x loop
    if coalesce(f ->> 'card_id', '') is distinct from coalesce(v.card_id, '')
       or (f ->> 'specialty_key') is distinct from v.specialty_key
       or (f ->> 'batch_order')::int is distinct from v.batch_order then
      raise exception 'Arquivo com identificação diferente do material (card_id, especialidade ou ordem).' using errcode = '22023';
    end if;
  end loop;
  v_required := case v.model
    when 'flashcard_digital' then array['pdf:pair', 'png:back', 'png:front']
    when 'flashcard_a6' then array['pdf:pair']
    else array['pdf:single', 'png:single'] end;
  v_got := array(select (x ->> 'format') || ':' || (x ->> 'side') from jsonb_array_elements(p_files) x order by 1);
  if v_got is distinct from v_required then
    raise exception 'Conjunto de arquivos incompleto para o modelo % (esperado: %; recebido: %). Frente e verso são gravados juntos.',
      v.model, array_to_string(v_required, ', '), array_to_string(v_got, ', ') using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) x where x ->> 'side' = 'pair' and (x ->> 'pages')::int <> 2) then
    raise exception 'O PDF do par precisa ter frente e verso (2 páginas).' using errcode = '22023';
  end if;
  v_removed := array(select fl.storage_path from public.ch_visual_files fl
                      where fl.version_id = p_version_id
                        and fl.storage_path not in (select x ->> 'storage_path' from jsonb_array_elements(p_files) x));
  delete from public.ch_visual_files where version_id = p_version_id;
  insert into public.ch_visual_files (version_id, format, side, pages, width, height, storage_path, sha256, bytes, card_id, specialty_key, batch_order, template_version)
  select p_version_id, x ->> 'format', x ->> 'side', coalesce((x ->> 'pages')::int, 1), (x ->> 'width')::int, (x ->> 'height')::int,
         x ->> 'storage_path', x ->> 'sha256', (x ->> 'bytes')::int, nullif(x ->> 'card_id', ''), x ->> 'specialty_key', (x ->> 'batch_order')::int, p_template
  from jsonb_array_elements(p_files) x;
  update public.ch_visual_versions
     set render_status = case when coalesce((p_check ->> 'ok')::boolean, false) then 'ready' else 'check_failed' end,
         render_error = null, rendered_at = now(), template_version = p_template, check_result = coalesce(p_check, '{}'::jsonb)
   where id = p_version_id;
  return jsonb_build_object('saved', jsonb_array_length(p_files), 'removed', to_jsonb(v_removed));
end
$$;

-- Comando do administrador: pega o trabalho DESTA versão (se ainda estiver na fila) para gerar na hora, pelo mesmo
-- caminho do processamento (runJob → etapa visual_render). Se o processamento já pegou, devolve nulo.
create function public.ch_worker_visual_claim(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare j public.ch_jobs;
begin
  select * into j from public.ch_jobs
   where scope_key = 'visual:' || p_version_id::text and step = 'visual_render' and status in ('queued', 'blocked')
   order by created_at desc limit 1 for update skip locked;
  if not found then return null; end if;
  update public.ch_jobs set status = 'running', attempts = attempts + 1, locked_at = now(), started_at = coalesce(started_at, now()), run_after = now()
   where id = j.id returning * into j;
  return to_jsonb(j);
end
$$;

-- Arquivos de uma versão (comando do administrador: baixar para uma pasta).
create function public.ch_worker_visual_files(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('version', v.version, 'model', m.model, 'card_id', m.card_id, 'title', m.title, 'render_status', v.render_status,
           'render_error', v.render_error, 'check_result', v.check_result,
           'files', coalesce((select jsonb_agg(jsonb_build_object('format', f.format, 'side', f.side, 'pages', f.pages, 'storage_path', f.storage_path,
                                'card_id', f.card_id, 'specialty_key', f.specialty_key, 'batch_order', f.batch_order) order by f.format, f.side)
                              from public.ch_visual_files f where f.version_id = v.id), '[]'::jsonb))
  from public.ch_visual_versions v join public.ch_visual_materials m on m.id = v.material_id
  where v.id = p_version_id
$$;

revoke execute on function public.ch_visual_card_prefix(text) from public, anon, authenticated;
revoke execute on function public.ch_visual_assert_actor(uuid) from public, anon, authenticated;
revoke execute on function public.ch_visual_enqueue(uuid, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_actor(text) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_save(uuid, uuid, jsonb, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_duplicate(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_regenerate(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_register_asset(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_job(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_save_files(uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_claim(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_visual_files(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- painel (equipe, com o token da própria pessoa)
create function public.ch_visual_person(p_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(pr.name, ''), u.email) from auth.users u left join public.profiles pr on pr.id = u.id where u.id = p_id $$;
revoke execute on function public.ch_visual_person(uuid) from public, anon, authenticated;

create function public.app_ch_visual_list(p_filters jsonb default '{}'::jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_model text := nullif(p_filters ->> 'model', '');
  v_key text := nullif(p_filters ->> 'specialty_key', '');
  v_status text := nullif(p_filters ->> 'status', '');
  v_q text := nullif(btrim(coalesce(p_filters ->> 'q', '')), '');
begin
  perform public.assert_staff();
  return coalesce((
    select jsonb_agg(item order by (item ->> 'updated_at') desc)
    from (
      select jsonb_build_object('id', m.id, 'model', m.model, 'specialty_key', m.specialty_key, 'specialty_label', m.specialty_label, 'title', m.title,
               'card_id', m.card_id, 'batch_label', m.batch_label, 'batch_order', m.batch_order, 'current_version', m.current_version,
               'status', v.render_status, 'render_error', v.render_error, 'rendered_at', v.rendered_at, 'created_at', m.created_at, 'updated_at', m.updated_at,
               'created_by_name', public.ch_visual_person(m.created_by), 'updated_by_name', public.ch_visual_person(m.updated_by),
               'files', (select count(*)::int from public.ch_visual_files fl where fl.version_id = v.id), 'duplicated_from', m.duplicated_from) as item
      from public.ch_visual_materials m
      join public.ch_visual_versions v on v.material_id = m.id and v.version = m.current_version
      where (v_model is null or m.model = v_model)
        and (v_key is null or m.specialty_key = v_key)
        and (v_status is null or v.render_status = v_status)
        and (v_q is null or m.title ilike '%' || v_q || '%' or m.card_id ilike '%' || v_q || '%' or m.specialty_label ilike '%' || v_q || '%')
      order by m.updated_at desc
      limit 300
    ) x), '[]'::jsonb);
end
$$;

create function public.app_ch_visual_material(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.assert_staff();
  select to_jsonb(m) || jsonb_build_object(
           'created_by_name', public.ch_visual_person(m.created_by),
           'updated_by_name', public.ch_visual_person(m.updated_by),
           'versions', coalesce((
             select jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'content', v.content, 'content_hash', v.content_hash,
                      'specialty_key', v.specialty_key, 'specialty_label', v.specialty_label, 'note', v.note, 'created_at', v.created_at,
                      'created_by_name', public.ch_visual_person(v.created_by), 'render_status', v.render_status, 'render_error', v.render_error,
                      'rendered_at', v.rendered_at, 'template_version', v.template_version, 'check_result', v.check_result,
                      'job', (select jsonb_build_object('status', j.status, 'attempts', j.attempts, 'error', j.error, 'run_after', j.run_after, 'created_at', j.created_at)
                              from public.ch_jobs j where j.scope_key = 'visual:' || v.id::text order by j.created_at desc limit 1),
                      'files', coalesce((select jsonb_agg(jsonb_build_object('id', fl.id, 'format', fl.format, 'side', fl.side, 'pages', fl.pages, 'width', fl.width,
                                           'height', fl.height, 'bytes', fl.bytes, 'card_id', fl.card_id, 'specialty_key', fl.specialty_key,
                                           'batch_order', fl.batch_order, 'template_version', fl.template_version, 'created_at', fl.created_at)
                                         order by fl.format, fl.side)
                                         from public.ch_visual_files fl where fl.version_id = v.id), '[]'::jsonb))
                    order by v.version desc)
             from public.ch_visual_versions v where v.material_id = m.id), '[]'::jsonb))
    into r
  from public.ch_visual_materials m where m.id = p_id;
  if r is null then raise exception 'Material não encontrado.' using errcode = 'P0002'; end if;
  return r;
end
$$;

-- Arquivo para baixar (a rota do servidor lê do depósito privado depois desta conferência).
create function public.app_ch_visual_file(p_file_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.assert_staff();
  select jsonb_build_object('storage_path', fl.storage_path, 'format', fl.format, 'side', fl.side, 'pages', fl.pages, 'card_id', fl.card_id,
                            'model', m.model, 'title', m.title, 'version', v.version, 'specialty_key', fl.specialty_key, 'render_status', v.render_status)
    into r
  from public.ch_visual_files fl join public.ch_visual_versions v on v.id = fl.version_id join public.ch_visual_materials m on m.id = v.material_id
  where fl.id = p_file_id;
  if r is null then raise exception 'Arquivo não encontrado.' using errcode = 'P0002'; end if;
  return r;
end
$$;

create function public.app_ch_visual_asset(p_name text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.assert_staff();
  select jsonb_build_object('name', a.name, 'mime', a.mime, 'width', a.width, 'height', a.height, 'storage_path', a.storage_path) into r
  from public.ch_visual_assets a where a.name = p_name;
  if r is null then raise exception 'Imagem não encontrada.' using errcode = 'P0002'; end if;
  return r;
end
$$;
