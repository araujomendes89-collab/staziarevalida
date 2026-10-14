-- =============================================================================
-- Anotação POR SEÇÃO da aula (14/10/2026, decisão do dono). Antes: 1 bloco de "Minhas anotações" por aula (lesson_notes.note).
-- Agora: cada seção da aula do aluno tem a sua caixa de anotação; todas ficam guardadas e voltam ao reabrir a aula.
--   * lesson_section_notes: uma linha por (aluno, aula, seção). Seção = 'geral' (a anotação única de antes) ou 'sec-N'
--     (N = número da seção na aula, o mesmo das caixas "Marcar esta seção como estudada"). Texto de 1 a 20.000 caracteres;
--     texto apagado = linha removida. No máximo 300 anotações por aluno em cada aula.
--   * Migra o que já existe: toda anotação antiga não vazia vira a chave 'geral' (mesmo texto, mesma data). Nada é apagado:
--     lesson_notes continua com as caixas marcadas e com a cópia da 'geral'.
--   * app_lesson_notes(aula): lê as suas: { note (= geral, para a tela antiga), notas: { chave: texto }, checks, updated_at }.
--   * app_lesson_section_note_save(aula, seção, texto): grava UMA seção (repetir o mesmo pedido não duplica).
--   * app_lesson_checks_save(aula, caixas): grava só as caixas marcadas, sem mexer nas anotações.
--   * app_lesson_notes_save (tela antiga) continua funcionando e passa a gravar a 'geral' também (a tela antiga e a nova convivem
--     enquanto o site novo não sobe).
-- Privacidade: cada aluno só lê as suas (RLS) e só grava pelas funções; a equipe/administrador NÃO lê anotações de alunos.
-- Aula que não está publicada: leitura vazia e gravação recusada. Sem pontos, sem XP, sem IA.
-- Depende de 4000 (lessons) e 9981 (lesson_notes). Pode ser colada duas ou mais vezes.
-- =============================================================================

create table if not exists public.lesson_section_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  section_key text not null check (section_key ~ '^(geral|sec-[1-9][0-9]{0,2})$'),
  note text not null check (char_length(note) between 1 and 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id, section_key)
);
alter table public.lesson_section_notes enable row level security;
revoke all on table public.lesson_section_notes from public, anon, authenticated;
grant select on table public.lesson_section_notes to authenticated;
drop policy if exists "anotações por seção: cada aluno lê as suas" on public.lesson_section_notes;
create policy "anotações por seção: cada aluno lê as suas" on public.lesson_section_notes for select to authenticated using (user_id = (select auth.uid()));

-- Migração das anotações de bloco único. "do nothing": se a 'geral' já existe (colagem repetida), fica a mais nova.
insert into public.lesson_section_notes (user_id, lesson_id, section_key, note, updated_at)
select n.user_id, n.lesson_id, 'geral', n.note, n.updated_at from public.lesson_notes n where n.note <> ''
on conflict (user_id, lesson_id, section_key) do nothing;

-- Apoio interno: confere o mapa de caixas marcadas (mesmas regras da 9981).
create or replace function public.lesson_checks_validate(p_checks jsonb) returns void
  language plpgsql immutable set search_path = ''
as $$
declare k text; val jsonb;
begin
  if p_checks is null or jsonb_typeof(p_checks) <> 'object' then raise exception 'As caixas marcadas precisam ser um mapa.' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_checks)) > 300 then raise exception 'Caixas demais (até 300).' using errcode = '22023'; end if;
  for k, val in select * from jsonb_each(p_checks) loop
    if char_length(k) not between 1 and 80 or jsonb_typeof(val) <> 'boolean' then raise exception 'Caixa marcada inválida: use chave curta e verdadeiro/falso.' using errcode = '22023'; end if;
  end loop;
end
$$;

-- Apoio interno: grava (ou apaga, se vazio) a anotação de uma seção do aluno logado. Quem chama já conferiu login e aula publicada.
create or replace function public.lesson_section_note_put(p_user uuid, p_lesson_id uuid, p_secao text, p_note text) returns timestamptz
  language plpgsql security definer set search_path = ''
as $$
declare v_note text := coalesce(p_note, ''); v_at timestamptz;
begin
  if p_secao is null or p_secao !~ '^(geral|sec-[1-9][0-9]{0,2})$' then raise exception 'Seção inválida.' using errcode = '22023'; end if;
  if char_length(v_note) > 20000 then raise exception 'A anotação passa de 20.000 caracteres.' using errcode = '22023'; end if;
  if v_note = '' then
    delete from public.lesson_section_notes where user_id = p_user and lesson_id = p_lesson_id and section_key = p_secao;
    return null;
  end if;
  if not exists (select 1 from public.lesson_section_notes where user_id = p_user and lesson_id = p_lesson_id and section_key = p_secao)
     and (select count(*) from public.lesson_section_notes where user_id = p_user and lesson_id = p_lesson_id) >= 300 then
    raise exception 'Anotações demais nesta aula (até 300).' using errcode = '22023';
  end if;
  insert into public.lesson_section_notes (user_id, lesson_id, section_key, note) values (p_user, p_lesson_id, p_secao, v_note)
  on conflict (user_id, lesson_id, section_key) do update set note = excluded.note, updated_at = now()
  returning updated_at into v_at;
  return v_at;
end
$$;

create or replace function public.app_lesson_notes(p_lesson_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r public.lesson_notes; v_notas jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson_id and l.published) then
    return jsonb_build_object('note', '', 'notas', '{}'::jsonb, 'checks', '{}'::jsonb, 'updated_at', null);
  end if;
  select * into r from public.lesson_notes where user_id = (select auth.uid()) and lesson_id = p_lesson_id;
  select coalesce(jsonb_object_agg(s.section_key, s.note), '{}'::jsonb) into v_notas
    from public.lesson_section_notes s where s.user_id = (select auth.uid()) and s.lesson_id = p_lesson_id;
  return jsonb_build_object('note', coalesce(v_notas ->> 'geral', ''), 'notas', v_notas, 'checks', coalesce(r.checks, '{}'::jsonb), 'updated_at', r.updated_at);
end
$$;

create or replace function public.app_lesson_section_note_save(p_lesson_id uuid, p_secao text, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_note text := coalesce(p_note, ''); v_at timestamptz;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson_id and l.published) then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  v_at := public.lesson_section_note_put(v_uid, p_lesson_id, p_secao, v_note);
  if p_secao = 'geral' then -- a cópia na tabela antiga fica igual (a tela antiga lê dela e colar o SQL de novo não ressuscita texto apagado)
    insert into public.lesson_notes (user_id, lesson_id, note) values (v_uid, p_lesson_id, v_note)
    on conflict (user_id, lesson_id) do update set note = excluded.note, updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'secao', p_secao, 'updated_at', v_at);
end
$$;

create or replace function public.app_lesson_checks_save(p_lesson_id uuid, p_checks jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_checks jsonb := coalesce(p_checks, '{}'::jsonb);
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson_id and l.published) then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  perform public.lesson_checks_validate(v_checks);
  insert into public.lesson_notes (user_id, lesson_id, note, checks)
  values (v_uid, p_lesson_id, coalesce((select s.note from public.lesson_section_notes s where s.user_id = v_uid and s.lesson_id = p_lesson_id and s.section_key = 'geral'), ''), v_checks)
  on conflict (user_id, lesson_id) do update set checks = excluded.checks, updated_at = now();
  return jsonb_build_object('ok', true);
end
$$;

-- Tela antiga: mesma assinatura e mesmas regras da 9981; agora também grava a 'geral'.
create or replace function public.app_lesson_notes_save(p_lesson_id uuid, p_note text, p_checks jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_checks jsonb := coalesce(p_checks, '{}'::jsonb);
  v_note text := coalesce(p_note, '');
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson_id and l.published) then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  if char_length(v_note) > 20000 then raise exception 'A anotação passa de 20.000 caracteres.' using errcode = '22023'; end if;
  perform public.lesson_checks_validate(v_checks);
  insert into public.lesson_notes (user_id, lesson_id, note, checks) values (v_uid, p_lesson_id, v_note, v_checks)
  on conflict (user_id, lesson_id) do update set note = excluded.note, checks = excluded.checks, updated_at = now();
  perform public.lesson_section_note_put(v_uid, p_lesson_id, 'geral', v_note);
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.lesson_checks_validate(jsonb) from public, anon, authenticated;
revoke execute on function public.lesson_section_note_put(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.app_lesson_notes(uuid) from public, anon;
grant execute on function public.app_lesson_notes(uuid) to authenticated;
revoke execute on function public.app_lesson_section_note_save(uuid, text, text) from public, anon;
grant execute on function public.app_lesson_section_note_save(uuid, text, text) to authenticated;
revoke execute on function public.app_lesson_checks_save(uuid, jsonb) from public, anon;
grant execute on function public.app_lesson_checks_save(uuid, jsonb) to authenticated;
revoke execute on function public.app_lesson_notes_save(uuid, text, jsonb) from public, anon;
grant execute on function public.app_lesson_notes_save(uuid, text, jsonb) to authenticated;
