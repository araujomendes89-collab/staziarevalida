-- =============================================================================
-- Conta: exportar os próprios dados e excluir a conta (LGPD).
-- =============================================================================

-- Tudo o que o aluno gerou no app, num só arquivo. SECURITY INVOKER: cada consulta passa
-- pelo RLS, então só saem as linhas dele.
create function public.app_export_my_data() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', (select auth.uid())),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'subscription', (select to_jsonb(s) - 'provider_customer_id' - 'provider_subscription_id'
                     from public.subscriptions s where s.user_id = (select auth.uid())),
    'practice_sessions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at), '[]'::jsonb)
                          from public.practice_sessions t where t.user_id = (select auth.uid())),
    'question_attempts', (select coalesce(jsonb_agg(to_jsonb(t) - 'seq' order by t.seq), '[]'::jsonb)
                          from public.question_attempts t where t.user_id = (select auth.uid())),
    'question_bookmarks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                           from public.question_bookmarks t where t.user_id = (select auth.uid())),
    'error_notes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at), '[]'::jsonb)
                    from public.error_notes t where t.user_id = (select auth.uid())),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.day, t.position), '[]'::jsonb)
                   from public.plan_tasks t where t.user_id = (select auth.uid())),
    'flashcards', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                   from public.flashcards t where t.owner_id = (select auth.uid())),
    'flashcard_states', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                         from public.flashcard_states t where t.user_id = (select auth.uid())),
    'flashcard_reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
                          from public.flashcard_reviews t where t.user_id = (select auth.uid())),
    'checklist_favorites', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                            from public.checklist_favorites t where t.user_id = (select auth.uid())),
    'checklist_station_reports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                  from public.checklist_station_reports t where t.user_id = (select auth.uid())),
    'checklist_event_confirmations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                      from public.checklist_event_confirmations t where t.user_id = (select auth.uid())),
    'checklist_study_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                 from public.checklist_study_sessions t
                                 where t.actor_id = (select auth.uid()) or t.doctor_id = (select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

-- Exclui a conta e, em cascata, todos os dados do aluno. Os registros de pagamento ficam,
-- sem o vínculo com a pessoa (billing_events.user_id vira nulo), por obrigação fiscal.
-- SECURITY DEFINER porque o aluno não tem permissão sobre auth.users; só apaga a própria linha.
create function public.app_delete_my_account(p_confirm text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_confirm is distinct from 'EXCLUIR' then
    raise exception 'Digite EXCLUIR para confirmar.' using errcode = '22023';
  end if;
  delete from auth.users where id = v_uid;
  return true;
end
$$;
revoke execute on function public.app_delete_my_account(text) from anon;
