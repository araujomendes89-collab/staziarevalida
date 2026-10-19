-- =============================================================================
-- TREINO SOZINHO (2ª fase, grupo dupla-sozinho-ia) · PARTE 4 de 4: "Uso do mês" com o sozinho à parte e exportação dos dados.
-- Depende da 013430 (corte por mode), da 013440 e da 013450 (solo_ia_month_cost). Plano: tarefa S8b e a exportação da §5 da spec.
--
--  1) app_admin_dupla_usage (base: 013430, que veio da 013360:139): os números da dupla ficam como estavam (salas, rodadas avaliadas,
--     alunos, impressos por rodada, só mode = 'dupla') e ganha o bloco "sozinho" SEPARADO, nunca somado:
--     { treinos, ia, autoavaliacao, alunos, gasto_ia_usd } (mês de Brasília; treinos concluídos; gasto = soma das chamadas da
--     função treino_avaliacao no registro da Central de IAs).
--  2) app_export_my_data (base: 013370:710): ganha 'solo_attempts' (os treinos sozinhos da pessoa, com o texto escrito; o resultado
--     da IA sem empresa, modelo nem custo). Excluir a conta apaga os treinos (station_attempts.user_id on delete cascade).
--     ATENÇÃO NA JUNÇÃO: outras frentes também refazem app_export_my_data; quem colar por último precisa partir da definição MAIS NOVA
--     e manter as chaves das outras (esta só acrescenta 'solo_attempts' no fim).
--
-- Pode ser colada duas vezes. Para desfazer: supabase/desfazer/20261003013460_treino_dupla_sozinho_uso_exportacao.desfazer.sql
-- =============================================================================

create or replace function public.app_admin_dupla_usage(p_month text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month text;
  v_from timestamptz;
  v_to timestamptz;
  v_salas integer;
  v_rodadas integer;
  v_alunos integer;
  v_impressos numeric;
  v_sozinho jsonb;
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

  select jsonb_build_object(
           'treinos', count(*)::int,
           'ia', (count(*) filter (where a.source = 'ia'))::int,
           'autoavaliacao', (count(*) filter (where a.source = 'autoavaliacao'))::int,
           'alunos', count(distinct a.user_id)::int,
           'gasto_ia_usd', public.solo_ia_month_cost(v_from, v_to))
    into v_sozinho
    from public.station_attempts a
   where a.status = 'done' and a.finished_at >= v_from and a.finished_at < v_to;

  return jsonb_build_object('month', v_month, 'salas', v_salas, 'rodadas_avaliadas', v_rodadas, 'alunos', v_alunos,
                            'impressos_por_rodada', v_impressos, 'sozinho', v_sozinho);
end
$$;

-- Os treinos sozinhos da própria pessoa, para a exportação (a tabela é fechada ao navegador; esta função lê como o dono).
-- O resultado da IA sai SEM empresa, modelo nem custo.
create or replace function public.dupla_export_solo() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'station_id', t.station_id, 'status', t.status, 'started_at', t.started_at,
           'attendance_started_at', t.attendance_started_at, 'submitted_at', t.submitted_at, 'finished_at', t.finished_at,
           'answers', t.answers, 'pressings_opened', t.pressings_opened, 'how', t.how, 'source', t.source,
           'score', t.score, 'max_score', t.max_score, 'correctness', t.correctness, 'marks', t.marks,
           'ia', case when t.ia is null then null else t.ia - 'members' - 'cost_usd' end)
           order by t.started_at), '[]'::jsonb)
  from public.station_attempts t
  where (select auth.uid()) is not null and t.user_id = (select auth.uid())
$$;

-- Exportação dos dados da pessoa (base: 013370:710). Novo: 'solo_attempts', os treinos sozinhos dela (texto escrito, impressos abertos,
-- notas e o resultado da IA SEM empresa, modelo nem custo). Quem refizer esta função depois parte da definição mais nova e mantém esta chave.
create or replace function public.app_export_my_data() returns jsonb
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
                                                                  'user_agent', t.user_agent)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid())),
    'declarations', (select coalesce(jsonb_agg(jsonb_build_object('document', a.document, 'version', a.version,
                                                                   'adult', d.adult, 'physician', d.physician, 'declared_at', d.declared_at)
                                               order by d.declared_at, a.id), '[]'::jsonb)
                     from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                     where a.user_id = (select auth.uid())),
    'study_chat', public.dupla_export_chat(),
    'solo_attempts', public.dupla_export_solo()
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_admin_dupla_usage(text) from public, anon;
-- (app_export_my_data mantém as permissões de antes: create or replace não as muda; o visitante recebe nulo)
revoke execute on function public.dupla_export_solo() from public;
grant execute on function public.dupla_export_solo() to anon, authenticated;
