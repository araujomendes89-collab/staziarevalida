-- DESFAZER da 20261003011500_termo_v2_declaracoes.sql. NÃO aplicado em produção (ensaiado no PGlite com rollback).
-- ANTES: se a ativação foi colada, cole primeiro supabase/desfazer/20261003011510_termo_v2_ativar.desfazer.sql (volta o Termo 1.0).
-- Volta as funções ao corpo de antes (…5300 e …9732), apaga a função de aceitar com declarações, a de 7 parâmetros, a tabela das
-- declarações (PERDE a prova das declarações já feitas — exporte antes se houver alguma) e a coluna requires_declarations.



-- ---------------------------------------------------------------- legal_record de 5 parâmetros (…5300)
create or replace function public.legal_record(p_user uuid, p_document text, p_version text, p_origin text, p_user_agent text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_current text;
  v_email text;
begin
  select v.version into v_current from public.legal_versions v where v.document = p_document;
  if not found then
    raise exception 'Documento inválido.' using errcode = '22023';
  end if;
  if p_version is distinct from v_current then
    raise exception 'Versão desatualizada do termo.' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  -- conta sem e-mail (não acontece com e-mail nem com Google): o código fica o do texto vazio, para o aceite não travar a pessoa
  insert into public.legal_acceptances (user_id, document, version, origin, user_agent, email_hash)
  values (p_user, p_document, p_version, p_origin, left(p_user_agent, 300), public.legal_email_hash(coalesce(v_email, '')))
  on conflict (user_id, document, version) do nothing;
end
$$;

-- ---------------------------------------------------------------- cadastro (…9732)
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_days integer := coalesce((select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'trial_days'), 7);
  -- a chave "Oferecer teste grátis no cadastro" (aba Planos, plano Teste grátis); sem a linha do plano, vale como hoje (oferece)
  v_offer boolean := coalesce((select p.active from public.plans p where p.code = 'trial'), true);
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120));
  insert into public.user_roles (user_id) values (new.id);
  if v_offer then
    insert into public.subscriptions (user_id, plan, status, trial_ends_at)
    values (new.id, 'trial', 'trialing', now() + make_interval(days => v_days));
  else
    -- sem teste grátis no cadastro (PL06): nasce no acesso gratuito (sem plano pago e sem teste), situação "Expirado" e sem data de fim
    insert into public.subscriptions (user_id, plan, status, trial_ends_at)
    values (new.id, 'trial', 'expired', null);
  end if;

  begin
    if (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then
      update public.profiles set phone = new.raw_user_meta_data ->> 'phone' where id = new.id;
    end if;
  exception when others then
    raise warning 'handle_new_user: WhatsApp não gravado (%): %', sqlstate, sqlerrm;
  end;

  begin
    if (new.raw_user_meta_data ->> 'terms_version') = (select v.version from public.legal_versions v where v.document = 'termo_uso') then
      perform public.legal_record(new.id, 'termo_uso', new.raw_user_meta_data ->> 'terms_version', 'cadastro', new.raw_user_meta_data ->> 'user_agent');
    end if;
  exception when others then
    raise warning 'handle_new_user: aceite do termo não gravado (%): %', sqlstate, sqlerrm;
  end;

  return new;
end
$$;

-- ---------------------------------------------------------------- abertura (…5300)
create or replace function public.app_legal_state() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  v_docs jsonb;
  v_student boolean;
  v_phone_missing boolean;
begin
  if v_user is null then
    return null;
  end if;

  select jsonb_object_agg(v.document, jsonb_build_object('current', v.version, 'accepted', a.version, 'accepted_at', a.accepted_at))
    into v_docs
  from public.legal_versions v
  left join lateral (
    select x.version, x.accepted_at
    from public.legal_acceptances x
    where x.user_id = v_user and x.document = v.document
    order by (x.version = v.version) desc, x.accepted_at desc, x.id desc
    limit 1
  ) a on true;

  v_student := public.legal_is_student(v_user);
  v_phone_missing := not exists (select 1 from public.profiles p where p.id = v_user and p.phone is not null);

  return jsonb_build_object(
    'termo_uso', v_docs -> 'termo_uso',
    'tutor_ia', v_docs -> 'tutor_ia',
    'student', v_student,
    'phone_missing', v_phone_missing,
    'gate_required', v_student and ((v_docs #>> '{termo_uso,accepted}') is distinct from (v_docs #>> '{termo_uso,current}') or v_phone_missing)
  );
end
$$;

-- ---------------------------------------------------------------- exportação (…5300)
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
    'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('document', t.document, 'version', t.version,
                                                                  'accepted_at', t.accepted_at, 'origin', t.origin,
                                                                  'user_agent', t.user_agent)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- o que a 011500 criou
drop function if exists public.app_accept_terms_declared(text, text, boolean, boolean, text, text, text);
drop function if exists public.legal_record(uuid, text, text, text, text, boolean, boolean);
drop table if exists public.legal_declarations;
alter table public.legal_versions drop column if exists requires_declarations;

