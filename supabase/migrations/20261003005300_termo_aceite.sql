-- =============================================================================
-- Termo de Aceite e Uso obrigatório: WhatsApp no perfil, versões vigentes dos documentos, tabela de aceites (a prova),
-- cadastro que já grava o aceite e a função de aceitar.
-- Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seção 9).
--
--   cadastro com e-mail: o app manda nos metadados da conta o nome, o WhatsApp, a versão do termo e o navegador  →  o gatilho
--     de criação da conta grava o WhatsApp e o aceite 'cadastro' (mesmo sem sessão, com a confirmação de e-mail ligada);
--   Google, tela de aceite e Tutor: o app chama app_accept_terms (login obrigatório).
--
-- Regras no banco (não só na tela):
--   * a versão vigente de cada documento fica em legal_versions, num lugar só; só a versão vigente pode ser aceita;
--   * a prova (legal_acceptances) é gravada só por funções do servidor (security definer); a pessoa só lê as próprias;
--   * a prova não guarda endereço de internet (IP); o e-mail fica só em código (SHA-256 do e-mail em minúsculas);
--   * ao apagar a conta, a ligação com a pessoa some (user_id vira nulo) e ficam versão, data, origem e o e-mail em código;
--   * a criação da conta NUNCA falha por causa da parte nova do gatilho;
--   * o WhatsApp só entra no formato internacional ("+" e de 8 a 15 dígitos, o primeiro de 1 a 9), também direto na tabela,
--     porque a política "perfil: editar o próprio" deixa a pessoa gravar qualquer coluna do próprio perfil.
-- =============================================================================

-- ---------------------------------------------------------------- WhatsApp no perfil
-- Vazio no banco para contas antigas e equipe; a tela de aceite exige o WhatsApp dos alunos.
alter table public.profiles add column phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
comment on column public.profiles.phone is 'WhatsApp no formato internacional (ex.: +5541999998888).';

-- ---------------------------------------------------------------- versões vigentes
create table public.legal_versions (
  document text primary key check (document in ('termo_uso', 'tutor_ia')),
  version text not null,
  updated_at timestamptz not null default now()
);
comment on table public.legal_versions is 'Versão vigente de cada documento aceito pelo aluno. Sem políticas: só as funções do servidor leem. Versão nova = trocar aqui.';
alter table public.legal_versions enable row level security;
insert into public.legal_versions (document, version) values ('termo_uso', '1.0'), ('tutor_ia', '1.0');
create trigger legal_versions_touch before update on public.legal_versions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- aceites (a prova)
create table public.legal_acceptances (
  id bigint generated always as identity primary key,
  -- vira nulo quando a conta é apagada: a prova fica sem a pessoa
  user_id uuid references auth.users (id) on delete set null,
  document text not null check (document in ('termo_uso', 'tutor_ia')),
  version text not null,
  accepted_at timestamptz not null default now(),
  origin text not null check (origin in ('cadastro', 'google', 'tela_aceite', 'tutor')),
  user_agent text check (char_length(user_agent) <= 300),
  -- SHA-256 (hexadecimal) do e-mail em minúsculas: não mostra o e-mail, mas quem tem um e-mail confere se é o mesmo
  email_hash text not null,
  unique (user_id, document, version)
);
comment on table public.legal_acceptances is 'Prova do aceite dos documentos legais. Sem endereço de internet (IP). Gravada só por legal_record (servidor).';
alter table public.legal_acceptances enable row level security;
create policy "aceites: ler os próprios" on public.legal_acceptances
  for select to authenticated using (user_id = (select auth.uid()));
-- Sem INSERT/UPDATE/DELETE para o navegador: só as funções do servidor gravam.

-- ---------------------------------------------------------------- apoio (só o servidor executa)
-- Código do e-mail: mesmo estilo de ch_hash (SHA-256 em hexadecimal), com o e-mail aparado e em minúsculas.
create function public.legal_email_hash(p_email text) returns text
  language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex') $$;

-- "Aluno" para o aceite: papel student e nenhuma área de revisão médica. Equipe e revisor médico ficam dispensados.
create function public.legal_is_student(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'student')
     and not exists (select 1 from public.ch_reviewer_areas a where a.user_id = p_user)
$$;

-- Grava o aceite da versão vigente (repetir não duplica: a primeira prova é a que vale). O e-mail vem de auth.users.
create function public.legal_record(p_user uuid, p_document text, p_version text, p_origin text, p_user_agent text) returns void
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

-- ---------------------------------------------------------------- cadastro
-- Igual ao de antes (…1300_admin: perfil, papel de aluno e teste pelos dias da configuração) e, no fim, a parte nova: guarda o
-- WhatsApp vindo dos metadados da conta (phone, só se válido) e, quando a versão do termo vinda dos metadados (terms_version) é a
-- vigente, grava o aceite 'cadastro' (navegador em user_agent). Cada parte fica no seu bloco com exceção: um erro ali NUNCA impede
-- a criação da conta (a tela de aceite pede depois) e uma parte não derruba a outra.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_days integer := coalesce((select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'trial_days'), 7);
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120));
  insert into public.user_roles (user_id) values (new.id);
  insert into public.subscriptions (user_id, plan, status, trial_ends_at)
  values (new.id, 'trial', 'trialing', now() + make_interval(days => v_days));

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

-- ---------------------------------------------------------------- aceitar
-- Tela de aceite, volta do Google e cartão do Tutor. Exige login; só a versão vigente; origem 'google', 'tela_aceite' ou 'tutor'
-- ('cadastro' é só do gatilho) e o aceite dos Tutores só vale pelo 'tutor'; grava o WhatsApp quando vier (com validação);
-- repetir não duplica. Devolve os dados de abertura do app já atualizados.
create function public.app_accept_terms(
  p_document text,
  p_version text,
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

  perform public.legal_record(v_user, p_document, p_version, p_origin, p_user_agent);
  if p_phone is not null then
    update public.profiles set phone = p_phone where id = v_user;
  end if;
  return public.app_bootstrap();
end
$$;

-- ---------------------------------------------------------------- perfil
-- Parte da versão de …3800_stazia_play (fuso horário) e passa a aceitar o WhatsApp (phone), com a mesma validação e a mesma
-- mensagem do aceite; vazio também é inválido.
create or replace function public.app_update_profile(p_patch jsonb) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  allowed constant text[] := array['name', 'avatar_seed', 'phase', 'exam_type', 'target_edition', 'exam_date',
                                   'daily_minutes', 'study_days_per_week', 'graduation_country',
                                   'graduation_university', 'graduation_year', 'theme', 'timezone', 'phone'];
  k text;
  v_probe timestamp;
begin
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then
      raise exception 'Campo de perfil não permitido: %', k using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'timezone' then
    begin
      v_probe := now() at time zone (p_patch ->> 'timezone');
    exception when others then
      raise exception 'Fuso horário inválido.' using errcode = '22023';
    end;
  end if;
  if p_patch ? 'phone' and ((p_patch ->> 'phone') is null or (p_patch ->> 'phone') !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'Informe o WhatsApp com código do país.' using errcode = '22023';
  end if;

  update public.profiles p set
    name = coalesce(p_patch ->> 'name', p.name),
    avatar_seed = case when p_patch ? 'avatar_seed' then p_patch ->> 'avatar_seed' else p.avatar_seed end,
    phase = coalesce((p_patch ->> 'phase')::smallint, p.phase),
    exam_type = coalesce(p_patch ->> 'exam_type', p.exam_type),
    target_edition = case when p_patch ? 'target_edition' then p_patch ->> 'target_edition' else p.target_edition end,
    exam_date = case when p_patch ? 'exam_date' then (p_patch ->> 'exam_date')::date else p.exam_date end,
    daily_minutes = case when p_patch ? 'daily_minutes' then (p_patch ->> 'daily_minutes')::int else p.daily_minutes end,
    study_days_per_week = case when p_patch ? 'study_days_per_week' then (p_patch ->> 'study_days_per_week')::smallint else p.study_days_per_week end,
    graduation_country = case when p_patch ? 'graduation_country' then p_patch ->> 'graduation_country' else p.graduation_country end,
    graduation_university = case when p_patch ? 'graduation_university' then p_patch ->> 'graduation_university' else p.graduation_university end,
    graduation_year = case when p_patch ? 'graduation_year' then (p_patch ->> 'graduation_year')::smallint else p.graduation_year end,
    theme = coalesce(p_patch ->> 'theme', p.theme),
    timezone = coalesce(p_patch ->> 'timezone', p.timezone),
    phone = case when p_patch ? 'phone' then p_patch ->> 'phone' else p.phone end
  where p.id = (select auth.uid());

  return public.app_bootstrap();
end
$$;

-- ---------------------------------------------------------------- permissões
-- Funções novas nascem executáveis por todos: as de apoio só rodam dentro das funções do servidor (security definer).
revoke execute on function public.legal_email_hash(text) from public, anon, authenticated;
revoke execute on function public.legal_is_student(uuid) from public, anon, authenticated;
revoke execute on function public.legal_record(uuid, text, text, text, text) from public, anon, authenticated;
