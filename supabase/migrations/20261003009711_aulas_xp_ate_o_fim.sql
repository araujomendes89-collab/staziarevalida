-- Aulas (A08, decisão do dono em 11/10/2026): o aluno só ganha o XP de concluir a aula se ASSISTIU ATÉ O FIM.
--   * Concluir continua marcando a aula como feita (lesson_progress.completed_at), com ou sem o fim assistido.
--   * "Assistiu até o fim" = o player avisou o fim do vídeo (evento "ended") E o navegador mediu que o aluno assistiu a aula
--     inteira (soma dos trechos contínuos, sem contar o que foi pulado); o navegador manda isso por app_lesson_watch e o banco
--     guarda o instante em lesson_progress.watched_to_end_at (uma vez medido, não se desfaz) se o tempo for coerente.
--   * O XP (evento LESSON_COMPLETED, uma vez por aula) é pago quando as DUAS coisas existem, na ordem que acontecerem:
--     concluída E assistida até o fim. Sem medição do fim, sem XP.
--   * NADA é retroativo: esta migração não altera nenhuma linha de lesson_progress nem tira XP de ninguém; quem já ganhou
--     o XP antes continua com ele (o evento já existe e não é pago de novo).
-- Funções redefinidas: gam_process_lesson (parte da versão de 20261003008100_arena_regras_conferidas.sql, a mais nova).
-- app_lesson_progress (20261003004000) NÃO muda: ela só grava a conclusão; quem decide o XP é o gatilho.
-- Colar duas vezes não dá erro (tudo idempotente).

alter table public.lesson_progress add column if not exists watched_to_end_at timestamptz;

-- Concluir a aula vale XP (uma vez por aula) quando também foi assistida até o fim. Protegida: nunca derruba a gravação do aluno.
create or replace function public.gam_process_lesson() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if new.completed_at is null or new.watched_to_end_at is null then return null; end if;
    -- já valia antes desta mudança (as duas coisas já existiam): nada de novo a pagar
    if tg_op = 'UPDATE' and old.completed_at is not null and old.watched_to_end_at is not null then return null; end if;
    -- quem já ganhou o XP desta aula (inclusive antes desta regra) não ganha de novo
    if exists (select 1 from public.gamification_events e
                where e.user_id = new.user_id and e.event_type = 'LESSON_COMPLETED' and e.source_type = 'lesson' and e.source_id = new.lesson_id::text) then
      return null;
    end if;
    if not public.gam_flag('flags.gamification_enabled') then return null; end if;
    perform public.gam_ensure(new.user_id);
    perform public.gam_award(new.user_id, 'LESSON_COMPLETED', 'lesson', new.lesson_id::text, public.gam_num('xp.lesson_completed', 20)::int, 0,
                             (select jsonb_build_object('area', l.area, 'topic', l.topic, 'title', l.title) from public.lessons l where l.id = new.lesson_id));
    update public.user_gamification_stats set last_qualified_activity_at = clock_timestamp() where user_id = new.user_id;
    perform public.gam_after_activity(new.user_id);
  exception when others then
    perform public.gam_log_failure(new.user_id, 'lesson', new.lesson_id::text, sqlstate, sqlerrm);
  end;
  return null;
end
$$;
revoke execute on function public.gam_process_lesson() from public, anon, authenticated;

drop trigger if exists lesson_progress_play on public.lesson_progress;
create trigger lesson_progress_play after insert or update of completed_at, watched_to_end_at on public.lesson_progress
  for each row execute function public.gam_process_lesson();

-- O navegador avisa o TEMPO REALMENTE ASSISTIDO (p_seconds: trechos contínuos, sem contar o que foi pulado) e, quando o player
-- tocou até o fim, o fim (p_ended), junto com a duração que o próprio player informou (p_duration). Só aula publicada. Cada aluno
-- mexe só na própria linha. Devolve o XP pago AGORA (se o fim fechou o par com a conclusão).
-- O fim só é gravado com tempo assistido coerente: pelo menos 1 segundo e, se o player informou a duração, a duração menos 5 s de
-- folga; sem duração informada, metade da duração cadastrada da aula (quando houver). Um "fim" sem tempo (chamada direta com
-- p_seconds = 0) NÃO é gravado (watched_to_end_at continua vazio). LIMITE ACEITO: o tempo e a duração vêm do navegador; quem chama
-- a função direto pode informar qualquer par coerente. Para 20 XP não há como o banco provar a visualização.
drop function if exists public.app_lesson_watch(uuid, integer, boolean);
create or replace function public.app_lesson_watch(p_id uuid, p_seconds integer default null, p_ended boolean default false, p_duration integer default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  l public.lessons;
  v_secs integer := least(greatest(coalesce(p_seconds, 0), 0), 86400);
  v_need integer;
  v_end boolean;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  select * into l from public.lessons where id = p_id and published;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  v_need := case
    when coalesce(p_duration, 0) > 0 then least(p_duration, 86400) - 5
    when l.duration_minutes is not null then (l.duration_minutes * 60) / 2
    else 1 end;
  v_end := coalesce(p_ended, false) and v_secs >= 1 and v_secs >= v_need;
  insert into public.lesson_progress (user_id, lesson_id, seconds_watched, watched_to_end_at)
  values (v_uid, l.id, v_secs, case when v_end then now() end)
  on conflict (user_id, lesson_id) do update set
    seconds_watched = greatest(public.lesson_progress.seconds_watched, v_secs),
    watched_to_end_at = coalesce(public.lesson_progress.watched_to_end_at, case when v_end then now() end),
    last_at = now();
  return (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at, 'watched_to_end_at', p.watched_to_end_at,
            'xp', (select e.xp_awarded from public.gamification_events e where e.user_id = v_uid and e.event_type = 'LESSON_COMPLETED' and e.source_id = l.id::text and e.created_at >= now()))
          from public.lesson_progress p where p.user_id = v_uid and p.lesson_id = l.id);
end
$$;

-- Só leitura: o que o aluno já fez nesta aula (a tela mostra se falta assistir até o fim). Não cria linha de progresso.
create or replace function public.app_lesson_watch_state(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_uid constant uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return (select jsonb_build_object('seconds_watched', p.seconds_watched, 'completed_at', p.completed_at, 'watched_to_end_at', p.watched_to_end_at)
          from public.lesson_progress p join public.lessons l on l.id = p.lesson_id
          where p.user_id = v_uid and p.lesson_id = p_id and l.published);
end
$$;

revoke execute on function public.app_lesson_watch(uuid, integer, boolean, integer) from public, anon;
revoke execute on function public.app_lesson_watch_state(uuid) from public, anon;
grant execute on function public.app_lesson_watch(uuid, integer, boolean, integer) to authenticated;
grant execute on function public.app_lesson_watch_state(uuid) to authenticated;
