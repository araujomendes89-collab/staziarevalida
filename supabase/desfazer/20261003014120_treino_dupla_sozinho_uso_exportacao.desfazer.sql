-- DESFAZER da 20261003014120_treino_dupla_sozinho_uso_exportacao.sql (gerado em 19/10/2026 por publicar-etapa2/desfazer-gerador/gerar.mjs, comparando o banco antes e depois dela).
-- Cole em ordem INVERSA (014120 → 013990): cada um volta o banco ao estado de antes da sua migração. Pode ser colado duas vezes.
-- Os dados gravados nas tabelas e colunas novas se perdem. Fora o que vier dito abaixo, nada mexe nas linhas de quem já usava o app.
-- função refeita: app_export_my_data() volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_export_my_data()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
                                 where t.actor_id = (select auth.uid()) or t.doctor_id = (select auth.uid())),
    'study_profile', (select to_jsonb(t) from public.study_profiles t where t.user_id = (select auth.uid())),
    'study_swipes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                     from public.study_swipes t where t.from_user = (select auth.uid())),
    -- sem station_id: o tema da estação não sai pela exportação (a coluna nem é legível pelo aluno, 013300)
    'study_matches', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'user_a', t.user_a, 'user_b', t.user_b,
                                                                   'room_id', t.room_id, 'created_at', t.created_at)
                                                order by t.created_at), '[]'::jsonb)
                      from public.study_matches t where (select auth.uid()) in (t.user_a, t.user_b)),
    'checklist_rooms', public.dupla_export_rooms(),
    'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('document', t.document, 'version', t.version,
                                                                  'accepted_at', t.accepted_at, 'origin', t.origin,
                                                                  'user_agent', t.user_agent, 'ip', host(t.ip), 'text_sha256', t.text_sha256, 'companions', t.companions)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid())),
    'declarations', (select coalesce(jsonb_agg(jsonb_build_object('document', a.document, 'version', a.version,
                                                                   'adult', d.adult, 'physician', d.physician, 'declared_at', d.declared_at)
                                               order by d.declared_at, a.id), '[]'::jsonb)
                     from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                     where a.user_id = (select auth.uid())),
    'study_chat', public.dupla_export_chat(),
    -- treino sozinho (013330): a própria pessoa escolhe a estação; o PEP só é gravado ao concluir
    'station_attempts', public.export_station_attempts(),
    -- Stazia Match (014030): o livro de créditos da própria pessoa
    'study_credits', public.dupla_export_creditos()
  )
  where (select auth.uid()) is not null
$function$;
-- função refeita: app_admin_dupla_usage(text) volta como era antes desta migração
CREATE OR REPLACE FUNCTION public.app_admin_dupla_usage(p_month text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_month text;
  v_from timestamptz;
  v_to timestamptz;
  v_salas integer;
  v_rodadas integer;
  v_alunos integer;
  v_impressos numeric;
begin
  perform public.assert_admin();
  v_month := coalesce(p_month, to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido.' using errcode = '22023';
  end if;
  v_from := (v_month || '-01')::timestamp at time zone 'America/Sao_Paulo';
  v_to := ((v_month || '-01')::timestamp + interval '1 month') at time zone 'America/Sao_Paulo';

  select count(*) into v_salas from public.checklist_rooms r where r.created_at >= v_from and r.created_at < v_to;

  select count(*),
         round(avg(case when jsonb_typeof(s.pressings_released) = 'array' then jsonb_array_length(s.pressings_released) else 0 end), 1)
    into v_rodadas, v_impressos
    from public.checklist_study_sessions s
   where s.room_id is not null and s.mode = 'dupla' and s.finished_at >= v_from and s.finished_at < v_to;

  select count(distinct x.u) into v_alunos
    from public.checklist_study_sessions s
    cross join lateral (values (s.actor_id), (s.doctor_id)) as x(u)
   where s.room_id is not null and s.mode = 'dupla' and s.finished_at >= v_from and s.finished_at < v_to and x.u is not null;

  return jsonb_build_object('month', v_month, 'salas', v_salas, 'rodadas_avaliadas', v_rodadas, 'alunos', v_alunos,
                            'impressos_por_rodada', v_impressos);
end
$function$;
-- funções criadas por ela
drop function if exists public.dupla_export_solo();
