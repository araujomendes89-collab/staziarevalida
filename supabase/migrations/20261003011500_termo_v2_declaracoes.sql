-- =============================================================================
-- 011500 — Termo v2.0 (Tutor de voz): declaração de maioridade e de formação em Medicina gravada junto do aceite.
-- Pedido do dono (2026-10-15). Texto proposto e quadro "o que mudou": docs/voice-tutor/04-termo-voz.md.
--
-- PROPOSTA: NÃO aplicada em produção. Ensaiada só no PGlite (src/__tests__/termoV2Declaracoes.test.ts, inclusive aplicada duas
-- vezes e desfeita dentro de uma transação com rollback). Pode ser colada de novo sem estragar nada (if not exists / or replace).
--
-- ESTA MIGRAÇÃO SOZINHA NÃO MUDA NADA PARA O ALUNO: só cria a estrutura. Enquanto nenhuma versão vigente pedir as declarações
-- (legal_versions.requires_declarations = false, o padrão), tudo funciona exatamente como hoje (Termo 1.0).
-- Quem liga a versão 2.0 e o reaceite é o arquivo separado supabase/ativar/20261003011500_termo_v2.ativar.sql, colado quando o
-- dono decidir, junto com a publicação do site com TERMO_VERSAO = "2.0".
--
--   * legal_versions.requires_declarations: a versão vigente exige as declarações (maioridade e médico);
--   * legal_declarations: a prova das declarações, uma por aceite (ligada a legal_acceptances.id). Ao apagar a conta, o aceite
--     fica sem a pessoa (user_id nulo) e a declaração continua presa a ele (mesma regra da prova do aceite);
--   * legal_record com 7 parâmetros (com as declarações); a de 5 parâmetros passa a chamar esta sem declarações, então recusa
--     quando a versão vigente exige (o gatilho do cadastro e app_accept_terms continuam com a mesma assinatura);
--   * handle_new_user: igual à de …9732 (teste grátis pela chave do plano) e lê dos metadados declares_adult / declares_physician
--     ("true"), que o cadastro manda quando a versão pede;
--   * app_accept_terms_declared: igual a app_accept_terms, com p_adult e p_physician (tela de aceite e volta do Google);
--   * app_legal_state: igual à de …5300 e, SÓ quando a versão vigente do Termo pede as declarações, ganha
--     "declarations_required": true (sem a chave, o formato é idêntico ao de hoje);
--   * app_export_my_data: igual à de …5300 e ganha a chave "declarations" (as declarações da própria pessoa).
--
-- Desfazer: supabase/desfazer/20261003011500_termo_v2_declaracoes.desfazer.sql (antes, desfazer a ativação, se foi colada).
-- =============================================================================

-- ---------------------------------------------------------------- versão que exige as declarações
alter table public.legal_versions add column if not exists requires_declarations boolean not null default false;
comment on column public.legal_versions.requires_declarations is
  'A versão vigente exige as declarações de maioridade (18+) e de formação em Medicina junto do aceite (Termo 2.0 em diante).';

-- ---------------------------------------------------------------- prova das declarações
create table if not exists public.legal_declarations (
  acceptance_id bigint primary key references public.legal_acceptances (id) on delete cascade,
  -- só "sim" é gravado: quem não declara não aceita
  adult boolean not null check (adult),
  physician boolean not null check (physician),
  declared_at timestamptz not null default now()
);
comment on table public.legal_declarations is
  'Declarações feitas junto do aceite (maioridade e formação em Medicina). Uma por aceite. Gravada só por legal_record (servidor).';
alter table public.legal_declarations enable row level security;
drop policy if exists "declarações: ler as próprias" on public.legal_declarations;
create policy "declarações: ler as próprias" on public.legal_declarations
  for select to authenticated
  using (exists (select 1 from public.legal_acceptances a where a.id = acceptance_id and a.user_id = (select auth.uid())));
-- Sem INSERT/UPDATE/DELETE para o navegador: só as funções do servidor gravam.

-- ---------------------------------------------------------------- gravar o aceite (com as declarações)
-- Como a de 5 parâmetros (…5300) e mais: se a versão vigente exige, as duas declarações têm de vir "sim"; a declaração fica presa ao
-- aceite gravado agora. Repetir não duplica (a primeira prova é a que vale, com ou sem declaração).
create or replace function public.legal_record(
  p_user uuid, p_document text, p_version text, p_origin text, p_user_agent text, p_adult boolean, p_physician boolean
) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_current text;
  v_requires boolean;
  v_email text;
  v_id bigint;
begin
  select v.version, v.requires_declarations into v_current, v_requires from public.legal_versions v where v.document = p_document;
  if not found then
    raise exception 'Documento inválido.' using errcode = '22023';
  end if;
  if p_version is distinct from v_current then
    raise exception 'Versão desatualizada do termo.' using errcode = '22023';
  end if;
  if v_requires and not (coalesce(p_adult, false) and coalesce(p_physician, false)) then
    raise exception 'Confirme que você tem 18 anos ou mais e que é médico(a).' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  insert into public.legal_acceptances (user_id, document, version, origin, user_agent, email_hash)
  values (p_user, p_document, p_version, p_origin, left(p_user_agent, 300), public.legal_email_hash(coalesce(v_email, '')))
  on conflict (user_id, document, version) do nothing
  returning id into v_id;
  if v_id is not null and coalesce(p_adult, false) and coalesce(p_physician, false) then
    insert into public.legal_declarations (acceptance_id, adult, physician) values (v_id, true, true)
    on conflict (acceptance_id) do nothing;
  end if;
end
$$;

-- A de 5 parâmetros (gatilho antigo, app_accept_terms): agora passa pela de 7, sem declarações. Com a versão 1.0 nada muda;
-- com uma versão que exige as declarações, recusa com a mensagem acima.
create or replace function public.legal_record(p_user uuid, p_document text, p_version text, p_origin text, p_user_agent text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.legal_record(p_user, p_document, p_version, p_origin, p_user_agent, null::boolean, null::boolean);
end
$$;

-- ---------------------------------------------------------------- cadastro (…9732 + declarações)
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
      perform public.legal_record(new.id, 'termo_uso', new.raw_user_meta_data ->> 'terms_version', 'cadastro', new.raw_user_meta_data ->> 'user_agent',
                                  (new.raw_user_meta_data ->> 'declares_adult') = 'true', (new.raw_user_meta_data ->> 'declares_physician') = 'true');
    end if;
  exception when others then
    -- inclui a versão que exige as declarações sem elas: a conta nasce e a tela de aceite pede depois
    raise warning 'handle_new_user: aceite do termo não gravado (%): %', sqlstate, sqlerrm;
  end;

  return new;
end
$$;

-- ---------------------------------------------------------------- aceitar com as declarações
-- Igual a app_accept_terms (…5300), com p_adult e p_physician. A tela usa esta só quando a abertura do app diz
-- "declarations_required" (assim o site novo funciona também num banco sem esta migração).
create or replace function public.app_accept_terms_declared(
  p_document text,
  p_version text,
  p_adult boolean,
  p_physician boolean,
  p_origin text default 'tela_aceite',
  p_phone text default null,
  p_user_agent text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_origin is null or p_origin not in ('google', 'tela_aceite', 'tutor') or (p_document = 'tutor_ia' and p_origin <> 'tutor') then
    raise exception 'Origem do aceite inválida.' using errcode = '22023';
  end if;
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Informe o WhatsApp com código do país.' using errcode = '22023';
  end if;

  perform public.legal_record(v_user, p_document, p_version, p_origin, p_user_agent, p_adult, p_physician);
  if p_phone is not null then
    update public.profiles set phone = p_phone where id = v_user;
  end if;
  return public.app_bootstrap();
end
$$;

-- ---------------------------------------------------------------- dados de abertura do app (…5300 + declarations_required)
create or replace function public.app_legal_state() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  v_docs jsonb;
  v_student boolean;
  v_phone_missing boolean;
  v_requires boolean;
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
  v_requires := coalesce((select v.requires_declarations from public.legal_versions v where v.document = 'termo_uso'), false);

  -- O aceite da versão que exige as declarações só existe com elas (legal_record), então "aceitou a vigente" já basta para a tela.
  return jsonb_build_object(
    'termo_uso', v_docs -> 'termo_uso',
    'tutor_ia', v_docs -> 'tutor_ia',
    'student', v_student,
    'phone_missing', v_phone_missing,
    'gate_required', v_student and ((v_docs #>> '{termo_uso,accepted}') is distinct from (v_docs #>> '{termo_uso,current}') or v_phone_missing)
  ) || case when v_requires then jsonb_build_object('declarations_required', true) else '{}'::jsonb end;
end
$$;

-- ---------------------------------------------------------------- exportação dos dados (…5300 + declarations)
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
                    from public.legal_acceptances t where t.user_id = (select auth.uid())),
    'declarations', (select coalesce(jsonb_agg(jsonb_build_object('document', a.document, 'version', a.version,
                                                                   'adult', d.adult, 'physician', d.physician, 'declared_at', d.declared_at)
                                               order by d.declared_at, a.id), '[]'::jsonb)
                     from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                     where a.user_id = (select auth.uid()))
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
-- A de 7 parâmetros é de apoio (só o servidor); a de 5 já estava fechada (…5300) e "or replace" mantém isso.
revoke execute on function public.legal_record(uuid, text, text, text, text, boolean, boolean) from public, anon, authenticated;
-- app_accept_terms_declared fica como app_accept_terms: aberta, com o login conferido dentro (sem login recusa).
