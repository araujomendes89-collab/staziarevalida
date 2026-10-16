-- =============================================================================
-- Anotações do aluno na aula (13/10/2026): "Minhas anotações" e as caixas marcadas, guardadas no banco por aluno e por aula.
-- Só o lado do banco (a tela do aluno é outra tarefa). Cada aluno só vê e grava as suas (RLS + funções); o administrador não lê.
--   * lesson_notes: uma linha por (aluno, aula): texto livre (até 20.000 caracteres) e as caixas marcadas (mapa chave → verdadeiro/falso).
--   * app_lesson_notes(p_lesson_id): lê as suas; aula que não está publicada para o aluno devolve vazio (nada de vazar rascunho).
--   * app_lesson_notes_save(p_lesson_id, p_note, p_checks): grava (a aula precisa estar publicada); sem pontos, sem XP.
-- Pode ser colada duas ou mais vezes.
-- =============================================================================

create table if not exists public.lesson_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 20000),
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.lesson_notes enable row level security;
revoke all on table public.lesson_notes from public, anon, authenticated;
grant select on table public.lesson_notes to authenticated;
drop policy if exists "anotações: cada aluno lê as suas" on public.lesson_notes;
create policy "anotações: cada aluno lê as suas" on public.lesson_notes for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.app_lesson_notes(p_lesson_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare r public.lesson_notes;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson_id and l.published) then return jsonb_build_object('note', '', 'checks', '{}'::jsonb, 'updated_at', null); end if;
  select * into r from public.lesson_notes where user_id = (select auth.uid()) and lesson_id = p_lesson_id;
  return jsonb_build_object('note', coalesce(r.note, ''), 'checks', coalesce(r.checks, '{}'::jsonb), 'updated_at', r.updated_at);
end
$$;

create or replace function public.app_lesson_notes_save(p_lesson_id uuid, p_note text, p_checks jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  k text; val jsonb;
  v_checks jsonb := coalesce(p_checks, '{}'::jsonb);
  v_note text := coalesce(p_note, '');
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson_id and l.published) then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  if char_length(v_note) > 20000 then raise exception 'A anotação passa de 20.000 caracteres.' using errcode = '22023'; end if;
  if jsonb_typeof(v_checks) <> 'object' then raise exception 'As caixas marcadas precisam ser um mapa.' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(v_checks)) > 300 then raise exception 'Caixas demais (até 300).' using errcode = '22023'; end if;
  for k, val in select * from jsonb_each(v_checks) loop
    if char_length(k) not between 1 and 80 or jsonb_typeof(val) <> 'boolean' then raise exception 'Caixa marcada inválida: use chave curta e verdadeiro/falso.' using errcode = '22023'; end if;
  end loop;
  insert into public.lesson_notes (user_id, lesson_id, note, checks) values ((select auth.uid()), p_lesson_id, v_note, v_checks)
  on conflict (user_id, lesson_id) do update set note = excluded.note, checks = excluded.checks, updated_at = now();
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.app_lesson_notes(uuid) from public, anon;
grant execute on function public.app_lesson_notes(uuid) to authenticated;
revoke execute on function public.app_lesson_notes_save(uuid, text, jsonb) from public, anon;
grant execute on function public.app_lesson_notes_save(uuid, text, jsonb) to authenticated;
