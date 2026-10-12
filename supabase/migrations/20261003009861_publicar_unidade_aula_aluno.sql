-- Central de Conteúdo: "Publicar" passa a levar a unidade ao aluno, como AULA em Estudar > Aulas (CC02, etapa 1: a aula).
-- Fase 1 do gerenciamento (grupo B), 12/10/2026. Desenho: plano aprovado "Publicar da Central para o aluno"
-- (docs/superpowers/plans/2026-10-10-publicacao-central-para-aluno.md, ramo caminho-documento) reduzido ao mínimo seguro.
-- Pode ser colada duas ou três vezes (create or replace, add column if not exists, drop ... if exists).
--
-- O que muda:
--  * Uma unidade vira UMA aula para sempre (lessons.ch_unit_id único); versão nova atualiza a mesma aula (o progresso do aluno fica).
--  * O aluno só recebe o que é dele: texto revisado, pontos-chave, selo "revisado por médico da área" com a data (sem nome) e as fontes
--    oficiais. Nunca afirmações, trechos, apontamentos das conferências, nota de escopo, nome de arquivo de origem, de IA ou de modelo.
--  * O texto vai montado para lessons.summary e lessons.key_points (a tela do aluno e a busca já leem daí). A aula da Central fica
--    TRANCADA na tela Aulas: texto, pontos-chave, área, publicação e vínculo só mudam por aqui, com nova revisão médica.
--  * Travas novas (no banco): cada afirmação com fonte OFICIAL vigente (nível A a D), área da unidade com grande área nas Aulas,
--    sem e-mail ou perfil @ de terceiros no que vai ao aluno, limites de tamanho. Aula parecida (mesma área e mesmo tema) exige confirmação.
--  * Prévia (app_ch_publish_preview): mostra tudo e não grava nada. Retirar (app_ch_retire) tira a aula do ar sem apagar nada.
--  * Publicação continua DESLIGADA e em modo sombra por padrão (ch_flags); só administrador publica.
-- Fica para depois (ver relatório): PDF do aluno, flashcards (9862), questões (fila Questões StaziaMed), marcas de terceiros da Etapa 1,
-- "Continuar na mesma aula", aviso "Em atualização".
-- Partes: app_ch_publish (7100:9, que chama ch_publish_impl de 1400:1179), app_ch_retire (1400:1206), ch_publish_problems (1600:107).

-- ---------------------------------------------------------------- 1. aulas ligadas à unidade
alter table public.lessons add column if not exists origin text not null default 'manual';
alter table public.lessons drop constraint if exists lessons_origin_check;
alter table public.lessons add constraint lessons_origin_check check (origin in ('manual', 'central'));
alter table public.lessons add column if not exists ch_unit_id uuid references public.ch_units (id) on delete restrict;
alter table public.lessons add column if not exists ch_version_id uuid references public.ch_unit_versions (id);
alter table public.lessons add column if not exists central_updated_at timestamptz;
alter table public.lessons drop constraint if exists lessons_central_check;
alter table public.lessons add constraint lessons_central_check check ((origin = 'central') = (ch_unit_id is not null));
create unique index if not exists lessons_ch_unit_uidx on public.lessons (ch_unit_id) where ch_unit_id is not null;

-- O resumo da aula da Central leva o texto inteiro revisado: o limite de 8.000 caracteres vale só para aula feita à mão.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.lessons'::regclass and contype = 'c' and conname <> 'lessons_summary_len_check'
             and pg_get_constraintdef(oid) like '%char_length(summary)%' loop
    execute format('alter table public.lessons drop constraint %I', c.conname);
  end loop;
end
$$;
alter table public.lessons drop constraint if exists lessons_summary_len_check;
alter table public.lessons add constraint lessons_summary_len_check
  check (summary is null or char_length(summary) <= case when origin = 'central' then 60000 else 8000 end);

alter table public.ch_publications add column if not exists lesson_id uuid references public.lessons (id);
alter table public.ch_publications add column if not exists distribution jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------- 2. aula da Central trancada na tela Aulas
create or replace function public.lessons_central_guard() returns trigger
  language plpgsql set search_path = ''
as $$
declare v_ok constant boolean := coalesce(current_setting('app.ch_distribute', true), '') = 'on';
begin
  if v_ok then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.origin = 'central' then
      raise exception 'Aula da Central de Conteúdo não se apaga aqui: retire a unidade na Central.' using errcode = '22023';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.origin = 'central' then
      raise exception 'Aula da Central de Conteúdo só nasce quando a unidade é publicada na Central.' using errcode = '22023';
    end if;
    return new;
  end if;
  if old.origin = 'central' and (new.origin is distinct from old.origin or new.ch_unit_id is distinct from old.ch_unit_id
       or new.ch_version_id is distinct from old.ch_version_id or new.central_updated_at is distinct from old.central_updated_at
       or new.area is distinct from old.area or new.summary is distinct from old.summary
       or new.key_points is distinct from old.key_points or new.published is distinct from old.published) then
    raise exception 'Esta aula vem da Central de Conteúdo: o texto, os pontos-chave, a área e a publicação mudam lá, com nova revisão médica.' using errcode = '22023';
  end if;
  if old.origin <> 'central' and new.origin = 'central' then
    raise exception 'Aula feita à mão não vira aula da Central.' using errcode = '22023';
  end if;
  return new;
end
$$;
drop trigger if exists lessons_central_guard_trg on public.lessons;
create trigger lessons_central_guard_trg before insert or update or delete on public.lessons for each row execute function public.lessons_central_guard();
revoke execute on function public.lessons_central_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. regras de apoio
-- Área editorial da Central -> grande área das Aulas. Saúde Mental e Saúde Coletiva não têm correspondente (nulo: a trava barra).
create or replace function public.ch_student_area(p_area_code text) returns public.med_area
  language sql immutable set search_path = ''
as $$
  select case p_area_code
    when 'CLINICA_MEDICA' then 'CLINICA_MEDICA'::public.med_area
    when 'CIRURGIA' then 'CIRURGIA_GERAL'::public.med_area
    when 'GINECOLOGIA_OBSTETRICIA' then 'GINECOLOGIA_OBSTETRICIA'::public.med_area
    when 'PEDIATRIA' then 'PEDIATRIA'::public.med_area
    when 'MFC' then 'MEDICINA_FAMILIA_COMUNIDADE'::public.med_area
    else null end
$$;

-- Fonte oficial vigente: nível A a D, documento final, em vigor e dentro da validade (a mesma regra da busca de evidências).
create or replace function public.ch_is_official_source(p_source_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.ch_sources s
                 where s.id = p_source_id and s.authority_level in ('A', 'B', 'C', 'D') and s.kind = 'final' and s.status = 'current'
                   and (s.valid_until is null or s.valid_until >= current_date))
$$;

-- Ganchos preenchidos pela migração 9862 (flashcards): aqui não fazem nada.
create or replace function public.ch_cards_plan(p_version_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('added', 0, 'kept', 0, 'hidden', 0, 'total', 0) $$;
create or replace function public.ch_distribute_cards(p_version_id uuid, p_lesson_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$ select jsonb_build_object('added', 0, 'kept', 0, 'hidden', 0, 'total', 0) $$;
create or replace function public.ch_hide_cards(p_version_id uuid) returns integer
  language sql security definer set search_path = ''
as $$ select 0 $$;
create or replace function public.ch_publish_problems_cards(p_version_id uuid) returns text[]
  language sql stable security definer set search_path = ''
as $$ select '{}'::text[] $$;

-- O que o aluno vai ler desta versão, montado do texto revisado (nunca de afirmações, apontamentos ou arquivos de origem).
create or replace function public.ch_student_lesson(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  u public.ch_units;
  v_topic text;
  v_rev timestamptz;
  v_updated boolean;
  v_head text;
  v_body text := '';
  v_refs text := '';
  v_points jsonb;
  s record;
  p record;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  select * into u from public.ch_units where id = v.unit_id;
  select n.name into v_topic from public.ch_taxonomy_nodes n where n.id = u.theme_node_id;
  select a.decided_at into v_rev from public.ch_approvals a
   where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash
   order by a.decided_at desc limit 1;
  v_updated := exists (select 1 from public.ch_publications x join public.ch_unit_versions xv on xv.id = x.unit_version_id
                       where xv.unit_id = u.id and x.unit_version_id <> p_version_id);
  v_head := 'Material StaziaMed · ' ||
    case when v_rev is null then 'aguardando revisão médica da área'
         else 'revisado por médico da área em ' || to_char((v_rev at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY') end ||
    case when v_updated then ' · atualizado em ' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY') else '' end ||
    ' · não é material oficial do Inep';
  for s in select x.sec from jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) with ordinality as x (sec, i) order by x.i loop
    if btrim(coalesce(s.sec ->> 'heading', '')) <> '' then v_body := v_body || btrim(s.sec ->> 'heading') || E'\n'; end if;
    for p in select y.t from jsonb_array_elements(coalesce(s.sec -> 'paragraphs', '[]'::jsonb)) with ordinality as z (para, j),
                  lateral (select btrim(coalesce(z.para ->> 'text', '')) as t) y
             where y.t <> '' order by z.j loop
      v_body := v_body || p.t || E'\n\n';
    end loop;
    if right(v_body, 1) <> E'\n' or right(v_body, 2) <> E'\n\n' then v_body := v_body || E'\n'; end if;
  end loop;
  for p in select distinct s2.organ, s2.title, s2.version, e.page
           from public.ch_unit_claims uc join public.ch_evidence e on e.claim_id = uc.claim_id
             join public.ch_sources s2 on s2.id = e.source_id
           where uc.unit_version_id = p_version_id and e.verdict = 'compatible' and public.ch_evidence_counts(e.id) and public.ch_is_official_source(s2.id)
           order by s2.organ, s2.title, s2.version nulls last, e.page nulls last loop
    v_refs := v_refs || '• ' || p.organ || ' · ' || p.title || coalesce(' · versão ' || p.version, '') || coalesce(' · p. ' || p.page::text, '') || E'\n';
  end loop;
  select coalesce(jsonb_agg(btrim(it ->> 'text') order by o), '[]'::jsonb) into v_points
    from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'items', '[]'::jsonb)) with ordinality as t (it, o)
   where m.unit_version_id = p_version_id and m.kind = 'summary' and btrim(coalesce(it ->> 'text', '')) <> '';
  return jsonb_build_object(
    'title', u.title, 'topic', v_topic, 'area_code', public.ch_unit_area_code(p_version_id),
    'area', public.ch_student_area(public.ch_unit_area_code(p_version_id))::text,
    'summary', btrim(v_head || E'\n\n' || btrim(v_body) || case when v_refs <> '' then E'\n\nFontes oficiais desta aula\n' || btrim(v_refs) else '' end),
    'key_points', coalesce(v_points, '[]'::jsonb), 'reviewed_at', v_rev, 'updated', v_updated);
end
$$;

-- ---------------------------------------------------------------- 4. travas novas da publicação (todas no banco)
create or replace function public.ch_publish_problems_student(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  p text[] := '{}';
  r record;
  st jsonb;
  v_area text := public.ch_unit_area_code(p_version_id);
  v_hit text;
  v_where text;
  c_mail constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  c_user constant text := '(?:^|[^A-Za-z0-9._%+-])@[A-Za-z0-9_.]{3,}';
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then return p; end if;
  -- cada afirmação precisa de fonte OFICIAL vigente (a conferência comum aceita também apostila e fonte sem nível)
  for r in select c.id, c.statement from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id where uc.unit_version_id = p_version_id loop
    if not exists (select 1 from public.ch_evidence e where e.claim_id = r.id and e.verdict = 'compatible' and public.ch_evidence_counts(e.id) and public.ch_is_official_source(e.source_id)) then
      p := array_append(p, 'Afirmação sem fonte oficial vigente (nível A a D): ' || left(r.statement, 80));
    end if;
  end loop;
  if public.ch_student_area(v_area) is null then
    p := array_append(p, 'A área da unidade (' || coalesce(v_area, '?') || ') não tem grande área correspondente nas Aulas do aluno.');
  end if;
  if not exists (select 1 from jsonb_path_query(v.content, 'lax $.sections[*].paragraphs[*].text') t where btrim(t #>> '{}') <> '') then
    p := array_append(p, 'A unidade não tem texto de aula para o aluno.');
  end if;
  st := public.ch_student_lesson(p_version_id);
  if char_length(st ->> 'title') > 200 or char_length(coalesce(st ->> 'topic', '')) > 200 then
    p := array_append(p, 'O título da unidade ou o nome do tema passa de 200 caracteres: encurte antes de publicar.');
  end if;
  if char_length(st ->> 'summary') > 60000 then p := array_append(p, 'O texto da aula passa de 60.000 caracteres: divida a unidade.'); end if;
  if jsonb_array_length(st -> 'key_points') > 30 then p := array_append(p, 'A aula pode ter no máximo 30 pontos-chave.'); end if;
  -- contato de terceiros no que vai ao aluno
  for r in
    select 'título e texto da aula' as onde, t as texto from (
      select u.title as t from public.ch_units u where u.id = v.unit_id
      union all select s.sec ->> 'heading' from jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) s (sec)
      union all select pa ->> 'text' from jsonb_path_query(v.content, 'lax $.sections[*].paragraphs[*]') pa) a
    union all
    select 'pontos-chave', it ->> 'text' from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'items', '[]'::jsonb)) it where m.unit_version_id = p_version_id and m.kind = 'summary'
    union all
    select 'flashcards', x from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) cd, lateral (values (cd ->> 'front'), (cd ->> 'back')) f (x)
     where m.unit_version_id = p_version_id and m.kind = 'flashcards'
  loop
    v_hit := coalesce(substring(r.texto from c_mail), substring(r.texto from c_user));
    if v_hit is not null then
      v_where := r.onde;
      p := array_append(p, 'Contato de terceiros no que vai ao aluno: "' || btrim(v_hit) || '" (' || v_where || ').');
      exit;
    end if;
  end loop;
  return p || public.ch_publish_problems_cards(p_version_id);
end
$$;

-- Trava de publicação (parte de 1600:107): as mesmas regras, mais as da publicação ao aluno.
create or replace function public.ch_publish_problems(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  p text[] := public.ch_publish_problems_base(p_version_id);
  r record;
  v public.ch_unit_versions;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then return p; end if;
  if coalesce(v.generated_by_model, '') like 'mock%' then
    p := array_append(p, 'Versão criada pela simulação de desenvolvimento (não é IA nem revisão): não pode ser publicada.');
  end if;
  if exists (select 1 from public.ch_materials m where m.unit_version_id = p_version_id and coalesce(m.generated_by_model, '') like 'mock%') then
    p := array_append(p, 'Há material criado pela simulação de desenvolvimento: não pode ser publicado.');
  end if;
  for r in select c.statement from public.ch_claims c join public.ch_unit_claims uc on uc.claim_id = c.id
           where uc.unit_version_id = p_version_id
             and exists (select 1 from public.ch_evidence e where e.claim_id = c.id and e.verdict = 'compatible' and not e.stale)
             and not exists (select 1 from public.ch_evidence e where e.claim_id = c.id and e.verdict = 'compatible' and not e.stale
                             and not coalesce((e.numeric_check ->> 'simulated')::boolean, false)) loop
    p := array_append(p, ('Afirmação sustentada só por evidência simulada: ' || left(r.statement, 80)));
  end loop;
  if not exists (select 1 from public.ch_materials m where m.unit_version_id = p_version_id and m.kind = 'lesson') then
    p := array_append(p, 'Falta a aula (material "lesson") desta versão.');
  elsif exists (select 1 from public.ch_materials m where m.unit_version_id = p_version_id and m.kind = 'lesson'
                and m.content -> 'sections' is distinct from v.content -> 'sections') then
    p := array_append(p, 'A aula não corresponde ao texto atual da unidade: gere os materiais de novo.');
  end if;
  for r in select m.* from public.ch_materials m where m.unit_version_id = p_version_id and m.kind in ('lesson', 'visual_cards') loop
    if not exists (select 1 from public.ch_renders x where x.material_id = r.id and x.material_hash = r.content_hash) then
      p := array_append(p, ('O arquivo final de "' || r.kind || '" não foi gerado a partir da versão atual.'));
    elsif exists (select 1 from public.ch_renders x where x.material_id = r.id and x.material_hash = r.content_hash and not coalesce((x.check_result ->> 'ok')::boolean, false)) then
      p := array_append(p, ('O arquivo final de "' || r.kind || '" falhou na conferência (texto cortado, referência perdida ou página vazia).'));
    end if;
  end loop;
  return p || public.ch_publish_problems_student(p_version_id);
end
$$;

-- ---------------------------------------------------------------- 5. plano, prévia e publicação
-- Só lê. Diz o que a publicação vai fazer: aula nova ou a mesma aula atualizada, aulas parecidas, cartões e o texto como o aluno verá.
create or replace function public.ch_distribution_plan(p_version_id uuid, p_options jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  l public.lessons;
  st jsonb;
  v_area public.med_area;
  v_similar jsonb;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  st := public.ch_student_lesson(p_version_id);
  v_area := st ->> 'area';
  select * into l from public.lessons x where x.ch_unit_id = v.unit_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title) order by x.title), '[]'::jsonb) into v_similar
    from public.lessons x
   where x.published and x.ch_unit_id is distinct from v.unit_id and v_area is not null and x.area = v_area
     and public.fold_text(btrim(x.topic)) = public.fold_text(btrim(coalesce(st ->> 'topic', '')));
  return jsonb_build_object(
    'lesson', jsonb_build_object('action', case when l.id is null then 'create' else 'update' end, 'id', l.id,
                                 'title', coalesce(l.title, st ->> 'title'), 'topic', coalesce(l.topic, st ->> 'topic'),
                                 'area', st ->> 'area', 'area_label', case when v_area is null then null else public.area_label(v_area) end),
    'similar', v_similar, 'confirm_similar', coalesce((p_options ->> 'confirm_similar')::boolean, false),
    'key_points', jsonb_array_length(st -> 'key_points'), 'cards', public.ch_cards_plan(p_version_id),
    'student_text', st ->> 'summary', 'student_key_points', st -> 'key_points');
end
$$;

-- Prévia "Publicar para os alunos": não grava nada.
create or replace function public.app_ch_publish_preview(p_version_id uuid, p_options jsonb default '{}'::jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
begin
  perform public.assert_admin();
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  return public.ch_distribution_plan(p_version_id, coalesce(p_options, '{}'::jsonb)) || jsonb_build_object(
    'version_id', v.id, 'status', v.status, 'title', (select u.title from public.ch_units u where u.id = v.unit_id),
    'problems', to_jsonb(public.ch_publish_problems(p_version_id)),
    'shadow_mode', public.ch_flag('shadow_mode'), 'publish_enabled', public.ch_flag('publish_enabled'));
end
$$;

-- Leva a versão publicada ao aluno: cria a aula da unidade (ou atualiza a mesma) e, na 9862, os cartões. Tudo na mesma transação de quem chama.
create or replace function public.ch_distribute(p_version_id uuid, p_options jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  u public.ch_units;
  l public.lessons;
  st jsonb;
  plan jsonb;
  v_area public.med_area;
  v_action text;
  v_rev record;
  v_cards jsonb;
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  if not found then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;
  select * into u from public.ch_units where id = v.unit_id for update;
  st := public.ch_student_lesson(p_version_id);
  v_area := st ->> 'area';
  if v_area is null then raise exception 'A área da unidade não tem grande área correspondente nas Aulas do aluno.' using errcode = '22023'; end if;
  plan := public.ch_distribution_plan(p_version_id, p_options);
  if plan #>> '{lesson,action}' = 'create' and jsonb_array_length(plan -> 'similar') > 0 and not coalesce((p_options ->> 'confirm_similar')::boolean, false) then
    raise exception 'Já existe aula parecida publicada: “%”. Marque “Publicar mesmo assim” na prévia.', plan #>> '{similar,0,title}' using errcode = '22023';
  end if;
  perform set_config('app.ch_distribute', 'on', true);
  select * into l from public.lessons x where x.ch_unit_id = u.id for update;
  if not found then
    v_action := 'create';
    insert into public.lessons (area, topic, title, summary, key_points, published, origin, ch_unit_id, ch_version_id, central_updated_at, created_by)
    values (v_area, st ->> 'topic', st ->> 'title', st ->> 'summary', array(select jsonb_array_elements_text(st -> 'key_points')), true, 'central', u.id, v.id, now(), (select auth.uid()))
    returning * into l;
  else
    v_action := 'update';
    update public.lessons set area = v_area, summary = st ->> 'summary', key_points = array(select jsonb_array_elements_text(st -> 'key_points')),
           published = true, ch_version_id = v.id, central_updated_at = now()
     where id = l.id returning * into l;
  end if;
  -- registro da conferência da aula (quem aprovou na área e quando), como a tela Aulas pede para aula publicada
  select a.reviewer_id, a.decided_at into v_rev from public.ch_approvals a
   where a.unit_version_id = p_version_id and a.kind = 'medical' and a.invalidated_at is null and a.content_hash = v.content_hash
   order by a.decided_at desc limit 1;
  insert into public.lesson_reviews as r (lesson_id, reviewed_by, reviewed_at, review_note)
  values (l.id, v_rev.reviewer_id, v_rev.decided_at, 'Revisão médica e editorial na Central de Conteúdo (versão ' || v.version || ').')
  on conflict (lesson_id) do update set reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, review_note = excluded.review_note;
  v_cards := public.ch_distribute_cards(p_version_id, l.id);
  update public.ch_publications set lesson_id = l.id,
         distribution = jsonb_build_object('lesson', jsonb_build_object('id', l.id, 'action', v_action), 'flashcards', v_cards)
   where unit_version_id = p_version_id and retired_at is null;
  perform public.ch_log('publish.distribute', p_version_id::text, jsonb_build_object('lesson', l.id, 'action', v_action, 'flashcards', v_cards));
  return jsonb_build_object('lesson', jsonb_build_object('id', l.id, 'action', v_action), 'flashcards', v_cards);
end
$$;

-- Tira do ar: a aula some da lista do aluno (continua na Administração); nada do que o aluno fez é apagado.
create or replace function public.ch_undistribute(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_hidden integer;
  v_lesson uuid;
begin
  select unit_id into v_unit from public.ch_unit_versions where id = p_version_id;
  perform set_config('app.ch_distribute', 'on', true);
  update public.lessons set published = false where ch_unit_id = v_unit and ch_version_id = p_version_id and published returning id into v_lesson;
  v_hidden := public.ch_hide_cards(p_version_id);
  return jsonb_build_object('lesson_hidden', v_lesson is not null, 'flashcards_hidden', v_hidden);
end
$$;

-- Publicar (parte de 7100:9): as mesmas travas de sempre (modo sombra, publicação ligada, administrador) e, na mesma transação, a aula do aluno.
create or replace function public.app_ch_publish(p_version_id uuid, p_options jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  d jsonb;
begin
  perform public.assert_admin();
  if public.ch_flag('shadow_mode') then
    raise exception 'Modo sombra ligado: a IA analisa e sugere, mas nada é publicado. Um administrador precisa desligá-lo.' using errcode = '55000';
  end if;
  if not public.ch_flag('publish_enabled') then
    raise exception 'Publicação desligada. Um administrador precisa ligá-la em Configuração.' using errcode = '55000';
  end if;
  r := public.ch_publish_impl(p_version_id);
  d := public.ch_distribute(p_version_id, coalesce(p_options, '{}'::jsonb));
  return r || jsonb_build_object('distribution', d);
end
$$;
create or replace function public.app_ch_publish(p_version_id uuid) returns jsonb
  language sql security definer set search_path = ''
as $$ select public.app_ch_publish(p_version_id, '{}'::jsonb) $$;

-- Retirar (parte de 1400:1206): igual, e a aula e os cartões saem do ar.
create or replace function public.app_ch_retire(p_version_id uuid, p_reason text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo da retirada.' using errcode = '22023'; end if;
  update public.ch_publications set retired_at = now(), retired_by = (select auth.uid()) where unit_version_id = p_version_id and retired_at is null;
  if not found then raise exception 'Não há publicação ativa dessa versão.' using errcode = 'P0002'; end if;
  update public.ch_unit_versions set status = 'retired' where id = p_version_id;
  perform public.ch_undistribute(p_version_id);
  perform public.ch_log('retire', p_version_id::text, jsonb_build_object('reason', p_reason));
  return true;
end
$$;

-- ---------------------------------------------------------------- 99. Permissões
revoke execute on function public.ch_student_area(text) from public, anon, authenticated;
revoke execute on function public.ch_is_official_source(uuid) from public, anon, authenticated;
revoke execute on function public.ch_cards_plan(uuid) from public, anon, authenticated;
revoke execute on function public.ch_distribute_cards(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ch_hide_cards(uuid) from public, anon, authenticated;
revoke execute on function public.ch_publish_problems_cards(uuid) from public, anon, authenticated;
revoke execute on function public.ch_student_lesson(uuid) from public, anon, authenticated;
revoke execute on function public.ch_publish_problems_student(uuid) from public, anon, authenticated;
revoke execute on function public.ch_distribution_plan(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_distribute(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_undistribute(uuid) from public, anon, authenticated;
revoke execute on function public.ch_publish_problems(uuid) from public, anon, authenticated;
revoke execute on function public.app_ch_publish_preview(uuid, jsonb) from public, anon;
revoke execute on function public.app_ch_publish(uuid, jsonb) from public, anon;
revoke execute on function public.app_ch_publish(uuid) from public, anon;
revoke execute on function public.app_ch_retire(uuid, text) from public, anon;
grant execute on function public.app_ch_publish_preview(uuid, jsonb) to authenticated;
grant execute on function public.app_ch_publish(uuid, jsonb) to authenticated;
grant execute on function public.app_ch_publish(uuid) to authenticated;
grant execute on function public.app_ch_retire(uuid, text) to authenticated;
