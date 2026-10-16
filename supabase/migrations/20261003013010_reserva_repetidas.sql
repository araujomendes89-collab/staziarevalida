-- StaziaMed · RESERVA de rascunhos de questões repetidos (decisão do dono, 16/10/2026).
-- As questões que repetem outra que segue na fila ficam GUARDADAS como "reserva": fora do banco do aluno, fora da fila de revisão
-- médica (não contam como pendentes), visíveis para a equipe no filtro "Reserva" com o motivo e a questão "irmã" que ficou, e podem
-- voltar à fila depois. Nada é apagado: o texto, as conferências e as revisões continuam no registro (o hash do conteúdo não muda).
--
-- Jeito menos invasivo: uma situação nova ('reserve') + uma coluna `reserve` com o motivo. As funções da lista e da decisão NÃO são
-- reescritas: a lista já aceita qualquer situação no filtro; todas as contas "aguardando" olham só 'awaiting_medical_review', então
-- a reserva sai delas sozinha. Quem não é 'rejected' continua entrando nas contas de repetição/equilíbrio do gerador (de propósito:
-- o gerador não deve recriar uma questão que está na reserva).
-- Segurança: um gatilho impede entrar/sair da reserva por qualquer caminho que não seja as duas funções abaixo; assim a reserva não
-- é aprovada, editada ou publicada sem querer. O aluno nunca lê esta tabela (RLS: só equipe e revisores).
-- Idempotente. Para desfazer: supabase/desfazer/20261003013010_reserva_repetidas.desfazer.sql. Conferir: supabase/conferir/20261003013010_reserva_repetidas.conferir.sql.

alter table public.draft_questions add column if not exists reserve jsonb;   -- {group, reason, sibling_id, sibling_code, sibling_ids, status_before, since, by, note}

do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.draft_questions'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%awaiting_medical_review%' loop
    execute format('alter table public.draft_questions drop constraint %I', r.conname);
  end loop;
  alter table public.draft_questions add constraint draft_questions_status_check
    check (status in ('awaiting_medical_review', 'approved', 'needs_changes', 'rejected', 'reserve'));
end $$;

-- Só as duas funções abaixo mexem na reserva (elas ligam a chave `stazia.reserva_mexer` só dentro da própria transação).
create or replace function public.draft_questions_reserve_guard() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE') and (old.status = 'reserve') is distinct from (new.status = 'reserve')
     and coalesce(current_setting('stazia.reserva_mexer', true), '') <> 'on' then
    raise exception 'Esta questão está na reserva (repete outra que segue na fila). Use "Voltar à fila" antes de editar, conferir ou decidir.' using errcode = '22023';
  end if;
  return new;
end
$$;
revoke execute on function public.draft_questions_reserve_guard() from public, anon, authenticated;
drop trigger if exists draft_questions_reserve_guard on public.draft_questions;
create trigger draft_questions_reserve_guard before update on public.draft_questions
  for each row execute function public.draft_questions_reserve_guard();

-- Guarda rascunhos na reserva. p_items = [{id, group, reason, sibling_id, sibling_code, sibling_ids}]. Equipe. Atômica na chamada.
-- Aceita só rascunho ainda não publicado e não recusado. Repetir a chamada só atualiza o motivo (não perde a situação de antes).
create or replace function public.app_draft_reserve(p_items jsonb, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb;
  d public.draft_questions;
  v_new integer := 0;
  v_old integer := 0;
  v_before text;
begin
  perform public.ch_assert_staff();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe as questões que vão para a reserva.' using errcode = '22023';
  end if;
  perform set_config('stazia.reserva_mexer', 'on', true);
  for it in select * from jsonb_array_elements(p_items) loop
    select * into d from public.draft_questions where id = (it ->> 'id')::uuid for update;
    if not found then raise exception 'Questão % não encontrada.', it ->> 'id' using errcode = 'P0002'; end if;
    if d.question_id is not null then raise exception 'A questão % já foi publicada: recolha-a em vez de guardar na reserva.', d.id using errcode = '22023'; end if;
    if d.status = 'rejected' then raise exception 'A questão % está recusada.', d.id using errcode = '22023'; end if;
    if char_length(btrim(coalesce(it ->> 'reason', ''))) = 0 then raise exception 'Informe o motivo da reserva (questão %).', d.id using errcode = '22023'; end if;
    v_before := case when d.status = 'reserve' then coalesce(d.reserve ->> 'status_before', 'awaiting_medical_review') else d.status end;
    update public.draft_questions set status = 'reserve',
      reserve = jsonb_build_object('group', it ->> 'group', 'reason', btrim(it ->> 'reason'), 'sibling_id', it ->> 'sibling_id',
        'sibling_code', it ->> 'sibling_code', 'sibling_ids', coalesce(it -> 'sibling_ids', '[]'::jsonb), 'status_before', v_before,
        'since', coalesce(d.reserve ->> 'since', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        'by', coalesce(d.reserve ->> 'by', (select auth.uid())::text), 'note', nullif(btrim(coalesce(p_note, '')), ''))
     where id = d.id;
    if d.status = 'reserve' then v_old := v_old + 1;
    else
      v_new := v_new + 1;
      perform public.draft_event(d.id, 'decisao', 'Guardada na reserva: ' || btrim(it ->> 'reason'), null,
        jsonb_build_object('decisao', 'reserva', 'grupo', it ->> 'group', 'irmao', it ->> 'sibling_id', 'situacao_antes', v_before));
      perform public.ch_log('draft_question.reserve', d.id::text, jsonb_build_object('grupo', it ->> 'group', 'irmao', it ->> 'sibling_id'));
    end if;
  end loop;
  perform set_config('stazia.reserva_mexer', '', true);
  return jsonb_build_object('guardadas', v_new, 'ja_estavam', v_old);
end
$$;

-- Tira da reserva e devolve cada uma à situação que tinha antes (fila de revisão, em geral). Equipe.
create or replace function public.app_draft_unreserve(p_ids uuid[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  d public.draft_questions;
  v_back integer := 0;
  v_to text;
begin
  perform public.ch_assert_staff();
  perform set_config('stazia.reserva_mexer', 'on', true);
  for d in select * from public.draft_questions where id = any (coalesce(p_ids, '{}'::uuid[])) and status = 'reserve' order by batch, slot for update loop
    v_to := coalesce(nullif(d.reserve ->> 'status_before', ''), 'awaiting_medical_review');
    if v_to in ('reserve', 'rejected') then v_to := 'awaiting_medical_review'; end if;
    update public.draft_questions set status = v_to, reserve = null where id = d.id;
    perform public.draft_event(d.id, 'decisao', 'Voltou da reserva para a fila.', d.reserve,
      jsonb_build_object('decisao', 'volta_da_reserva', 'situacao', v_to));
    perform public.ch_log('draft_question.unreserve', d.id::text, jsonb_build_object('situacao', v_to));
    v_back := v_back + 1;
  end loop;
  perform set_config('stazia.reserva_mexer', '', true);
  return jsonb_build_object('voltaram', v_back);
end
$$;

revoke execute on function public.app_draft_reserve(jsonb, text) from public, anon;
grant execute on function public.app_draft_reserve(jsonb, text) to authenticated;
revoke execute on function public.app_draft_unreserve(uuid[]) from public, anon;
grant execute on function public.app_draft_unreserve(uuid[]) to authenticated;

-- "Conferir pendentes" (gasta IA): a reserva fica de fora, como as recusadas. Única função existente que tocamos; o resto igual à da …9800.
create or replace function public.app_staziamed_pending_checks(p_filters jsonb default '{}'::jsonb) returns uuid[]
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_staff() then
    raise exception 'Conferir é da equipe (administrador ou editor).' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(x.id order by x.batch, x.slot) from (
      select d.id, d.batch, d.slot from public.draft_questions d
      where d.status not in ('rejected', 'reserve') and public.draft_matches_filters(d, p_filters) and public.draft_checks_current(d) < 4
      order by d.batch, d.slot limit 200) x), '{}'::uuid[]);
end
$$;
revoke execute on function public.app_staziamed_pending_checks(jsonb) from public, anon;
grant execute on function public.app_staziamed_pending_checks(jsonb) to authenticated;
