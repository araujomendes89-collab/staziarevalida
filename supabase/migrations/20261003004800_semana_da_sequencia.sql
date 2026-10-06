-- =============================================================================
-- Semana da sequência, para a animação de conquista (pedido de 2026-10-06: "estilo da animação para colocar quando um aluno
-- tiver uma conquista", vídeo de referência da sequência diária). Devolve os 7 dias da semana do aluno (segunda a domingo, no
-- fuso dele) e o que houve em cada um: estudou (a sequência contou), protegido (proteção de sequência usada), hoje, perdido ou
-- ainda por vir. Só lê os eventos do próprio aluno; nada é gravado.
-- =============================================================================
create function public.app_play_streak_week() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  v_today date;
  v_monday date;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  v_today := public.gam_today(v_user);
  v_monday := public.gam_week_start(v_today);
  return jsonb_build_object(
    'today', v_today,
    'streak', coalesce((select s.current_streak from public.user_gamification_stats s where s.user_id = v_user), 0),
    'days', (
      select jsonb_agg(jsonb_build_object('date', d, 'state',
               case when exists (select 1 from public.gamification_events e
                                 where e.user_id = v_user and e.event_type = 'STREAK_INCREMENTED' and e.source_type = 'day' and e.source_id = d::text) then 'done'
                    when exists (select 1 from public.gamification_events e
                                 where e.user_id = v_user and e.event_type = 'STREAK_FREEZE_USED' and e.source_type = 'day' and e.source_id = d::text) then 'frozen'
                    when d = v_today then 'today'
                    when d > v_today then 'future'
                    else 'missed' end) order by d)
      from (select (v_monday + i) as d from generate_series(0, 6) as g (i)) w));
end
$$;
revoke execute on function public.app_play_streak_week() from public, anon;

-- Para desfazer: drop function public.app_play_streak_week();
