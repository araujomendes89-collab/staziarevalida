-- Visão geral da Administração mais honesta (GE01, GE03, GE04, GE05).
-- Parte da versão mais nova de app_admin_overview (…4600_equipe_acesso_completo.sql). Mudanças:
--  GE01  teste que já passou do prazo aparece como "expirado" (antes ficava "em teste" para sempre);
--  GE03  os números de usuários, planos e gasto de IA só vão para o administrador (o editor não os recebe);
--  GE04  "ativos" inclui quem viu aula ou conversou com o Nexus, e não conta a equipe;
--  GE05  novo bloco "pending_review" (o que espera revisão por aba) e "ai_month" (gasto de IA do mês, só administrador).
-- PUBLICAR O SITE ANTES de colar a 9601 (o site antigo quebra a aba Geral para o editor se a 9601 entrar antes; o contrário é seguro).
-- Cada contagem nova é isolada: se uma tabela de outra aba mudar de forma, só aquele número some, a Visão geral não quebra.
-- Pode ser colada duas vezes. Nenhum dado é alterado.
create or replace function public.app_admin_overview() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_admin boolean;
  v_lessons integer; v_podcasts integer; v_updates integer; v_content integer;
  v_central numeric; v_tutor numeric;
  v_result jsonb;
begin
  perform public.assert_staff();
  v_admin := public.is_admin();

  begin
    select count(*)::int into v_lessons from public.lessons where not published;
  exception when others then v_lessons := null; end;
  begin
    select count(*)::int into v_podcasts from public.podcasts where status = 'script_ready';
  exception when others then v_podcasts := null; end;
  begin
    select count(*)::int into v_updates from public.guideline_updates where review_status = 'pending';
  exception when others then v_updates := null; end;
  begin
    select count(*)::int into v_content from public.ch_unit_versions where status = 'awaiting_review';
  exception when others then v_content := null; end;

  v_result := jsonb_build_object(
    'questions', jsonb_build_object(
      'total', (select count(*)::int from public.questions),
      'annulled', (select count(*)::int from public.questions where status = 'annulled'),
      'needs_image', (select count(*)::int from public.questions where needs_image and jsonb_array_length(images) = 0),
      'exams', (select count(*)::int from public.exams)
    ),
    'activity', jsonb_build_object(
      'attempts', (select count(*)::int from public.question_attempts),
      'attempts_7d', (select count(*)::int from public.question_attempts where answered_at > now() - interval '7 days'),
      'flashcard_reviews', (select count(*)::int from public.flashcard_reviews)
    ),
    'stations', jsonb_build_object(
      'pending', (select count(*)::int from public.checklist_stations where medical_review = 'pending'),
      'approved', (select count(*)::int from public.checklist_stations where medical_review = 'approved'),
      'reports', (select count(*)::int from public.checklist_station_reports)
    ),
    'pending_review', jsonb_strip_nulls(jsonb_build_object(
      'stations', (select count(*)::int from public.checklist_stations where medical_review = 'pending'),
      'lessons_draft', v_lessons,
      'podcasts', v_podcasts,
      'updates', v_updates,
      'content', v_content
    ))
  );

  if v_admin then
    begin
      select coalesce(sum(c.cost_usd), 0) into v_central from public.ai_calls c
      where c.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    exception when others then v_central := null; end;
    begin
      -- só o Tutor/Nexus (feature tutor_*): roteiro e áudio do podcast e o assistente da aula também gravam no ledger,
      -- mas esse custo já entra em ai_calls (Central de IAs) e apareceria em dobro
      select coalesce(sum(l.estimated_cost_usd), 0) into v_tutor from public.ai_usage_ledger l
      where left(l.feature, 6) = 'tutor_' and l.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    exception when others then v_tutor := null; end;

    v_result := v_result || jsonb_build_object(
      'ai_month', jsonb_strip_nulls(jsonb_build_object('central_usd', v_central, 'tutor_usd', v_tutor)),
      'users', jsonb_build_object(
        'total', (select count(*)::int from auth.users),
        'new_7d', (select count(*)::int from auth.users where created_at > now() - interval '7 days'),
        -- estudou nos últimos 7 dias: respondeu questão, revisou flashcard, viu aula ou conversou com o Nexus (só alunos)
        'active_7d', (select count(distinct x.user_id)::int from (
          select user_id from public.question_attempts where answered_at > now() - interval '7 days'
          union all
          select user_id from public.flashcard_reviews where reviewed_at > now() - interval '7 days'
          union all
          select user_id from public.lesson_progress where last_at > now() - interval '7 days'
          union all
          select user_id from public.tutor_messages where role = 'student' and created_at > now() - interval '7 days') x
          where not public.user_is_staff(x.user_id)),
        'by_role', (select coalesce(jsonb_object_agg(r.role::text, r.n), '{}'::jsonb)
                    from (select role, count(*)::int as n from public.user_roles group by role) r),
        -- teste que passou do prazo conta como "expired" (a assinatura no banco continua como está)
        'by_plan', (select coalesce(jsonb_object_agg(s.k, s.n), '{}'::jsonb)
                    from (select plan || ':' || (case when status = 'trialing' and trial_ends_at is not null and trial_ends_at <= now()
                                                      then 'expired' else status::text end) as k, count(*)::int as n
                          from public.subscriptions x
                          where not public.user_is_staff(x.user_id) group by 1) s)
      )
    );
  end if;
  return v_result;
end
$$;
revoke execute on function public.app_admin_overview() from public, anon;
grant execute on function public.app_admin_overview() to authenticated;

-- Para desfazer: recriar app_admin_overview como está em …4600_equipe_acesso_completo.sql.
