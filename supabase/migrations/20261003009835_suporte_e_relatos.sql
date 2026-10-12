-- =============================================================================
-- Fase 1 · Suporte dentro do app (B12 e B4 da prontidão de 12/10): pode ser colada várias vezes (create or replace / if not exists).
--
--  1) Contato de suporte: UMA configuração só (e-mail), editável pelo administrador em Administração > Configurações. O padrão é
--     suporte@staziamed.com.br. Aparece no login, na Conta (Ajuda e suporte) e nos avisos de acesso bloqueado. Qualquer pessoa (inclusive
--     quem ainda não entrou) pode LER só esse e-mail, pela função app_support_contact (a tela de login precisa dele).
--  2) Relatos dos alunos ("Relatar um problema"): o aluno escreve uma mensagem e ela chega à Administração, com data, aluno, tela e texto.
--     Só o próprio aluno grava (RLS + gatilho); só a equipe lê e marca como resolvido. Limites: mensagem de 10 a 1000 caracteres e
--     no máximo 5 relatos por aluno nas últimas 24 horas. Nada de dados de pacientes: a tela avisa e o texto é só do aluno.
--
-- Só cria coisas novas: nenhuma função, tabela ou política existente é alterada. Sem este SQL o site continua igual (o contato aparece
-- com o e-mail padrão e "Relatar um problema" mostra um aviso simples de que ainda não está disponível).
-- Para desfazer: drop function app_support_contact(), app_admin_save_support_contact(text), app_report_problem(text,text),
-- app_admin_reports(text,integer,integer), app_admin_report_resolve(bigint,boolean), student_reports_guard(); drop table student_reports, support_config.
-- =============================================================================

-- ---------------------------------------------------------------- 1) contato de suporte
create table if not exists public.support_config (
  id boolean primary key default true check (id),   -- uma linha só
  email text not null check (char_length(email) between 5 and 120 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.support_config enable row level security;
-- nenhuma política: o app só chega aqui pelas funções abaixo
revoke all on table public.support_config from public, anon, authenticated;
insert into public.support_config (id, email) values (true, 'suporte@staziamed.com.br') on conflict (id) do nothing;

-- Quem pergunta (até o visitante do login) recebe só o e-mail; se a linha sumir, vale o padrão.
create or replace function public.app_support_contact() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('email', coalesce((select c.email from public.support_config c where c.id), 'suporte@staziamed.com.br'))
$$;
revoke execute on function public.app_support_contact() from public;
grant execute on function public.app_support_contact() to anon, authenticated;

create or replace function public.app_admin_save_support_contact(p_email text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform public.assert_admin();
  if v_email = '' or char_length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail de suporte válido (exemplo: suporte@staziamed.com.br).' using errcode = '22023';
  end if;
  insert into public.support_config (id, email, updated_at, updated_by) values (true, v_email, now(), (select auth.uid()))
  on conflict (id) do update set email = excluded.email, updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('support.contact', null, jsonb_build_object('email', v_email));
  return public.app_support_contact();
end
$$;
revoke execute on function public.app_admin_save_support_contact(text) from public, anon;
grant execute on function public.app_admin_save_support_contact(text) to authenticated;

-- ---------------------------------------------------------------- 2) relatos dos alunos
create table if not exists public.student_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  screen text check (screen is null or char_length(screen) <= 60),
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
create index if not exists student_reports_status_idx on public.student_reports (status, created_at desc);
create index if not exists student_reports_user_idx on public.student_reports (user_id, created_at desc);

alter table public.student_reports enable row level security;
revoke all on table public.student_reports from public, anon, authenticated;
grant select, insert on table public.student_reports to authenticated;   -- o que cada um pode é decidido pelas políticas abaixo
drop policy if exists "relatos: o aluno grava o próprio" on public.student_reports;
create policy "relatos: o aluno grava o próprio" on public.student_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "relatos: só a equipe lê" on public.student_reports;
create policy "relatos: só a equipe lê" on public.student_reports
  for select to authenticated using ((select public.is_staff()));

-- Regras que valem em qualquer caminho de gravação: texto limpo, sempre "aberto", sem data nem resolução inventadas, no máximo 5 por 24 horas.
create or replace function public.student_reports_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  new.message := btrim(coalesce(new.message, ''));
  new.screen := nullif(left(btrim(coalesce(new.screen, '')), 60), '');
  if char_length(new.message) < 10 then
    raise exception 'Conte o problema com um pouco mais de detalhe (pelo menos 10 letras).' using errcode = '22023';
  end if;
  if char_length(new.message) > 1000 then
    raise exception 'O relato pode ter no máximo 1000 caracteres.' using errcode = '22023';
  end if;
  if (select count(*) from public.student_reports r where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Você já enviou 5 relatos nas últimas 24 horas. Tente de novo mais tarde.' using errcode = '54000';
  end if;
  new.status := 'open';
  new.created_at := now();
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end
$$;
revoke execute on function public.student_reports_guard() from public, anon, authenticated;
drop trigger if exists student_reports_guard on public.student_reports;
create trigger student_reports_guard before insert on public.student_reports
  for each row execute function public.student_reports_guard();

-- O app usa esta função (mensagens em português). Só o próprio aluno logado grava; o dono do relato é SEMPRE quem está logado.
create or replace function public.app_report_problem(p_screen text, p_message text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para enviar o relato.' using errcode = '42501';
  end if;
  insert into public.student_reports (user_id, screen, message) values (v_uid, p_screen, p_message);
  return jsonb_build_object('ok', true);
end
$$;
revoke execute on function public.app_report_problem(text, text) from public, anon;
grant execute on function public.app_report_problem(text, text) to authenticated;

-- Lista da Administração: p_status 'open' (padrão), 'resolved' ou 'all'. Só a equipe.
create or replace function public.app_admin_reports(p_status text default 'open', p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_status text := case when p_status in ('open', 'resolved') then p_status else null end;   -- qualquer outro valor = todos
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'open', (select count(*)::int from public.student_reports where status = 'open'),
    'total', (select count(*)::int from public.student_reports r where v_status is null or r.status = v_status),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'created_at', x.created_at, 'status', x.status, 'screen', x.screen, 'message', x.message,
          'student_name', x.student_name, 'student_email', x.student_email,
          'resolved_at', x.resolved_at, 'resolved_by_name', x.resolved_by_name) order by x.created_at desc, x.id desc)
      from (
        select r.id, r.created_at, r.status, r.screen, r.message, r.resolved_at,
               nullif(p.name, '') as student_name, u.email::text as student_email,
               nullif(pr.name, '') as resolved_by_name
        from public.student_reports r
        left join public.profiles p on p.id = r.user_id
        left join auth.users u on u.id = r.user_id
        left join public.profiles pr on pr.id = r.resolved_by
        where v_status is null or r.status = v_status
        order by r.created_at desc, r.id desc
        limit v_limit offset v_offset
      ) x), '[]'::jsonb));
end
$$;
revoke execute on function public.app_admin_reports(text, integer, integer) from public, anon;
grant execute on function public.app_admin_reports(text, integer, integer) to authenticated;

-- Marcar como resolvido (ou reabrir). Só a equipe; o Registro guarda quem fez (sem copiar o texto do aluno).
create or replace function public.app_admin_report_resolve(p_id bigint, p_resolved boolean default true) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.student_reports;
begin
  perform public.assert_staff();
  update public.student_reports set
    status = case when coalesce(p_resolved, true) then 'resolved' else 'open' end,
    resolved_at = case when coalesce(p_resolved, true) then now() else null end,
    resolved_by = case when coalesce(p_resolved, true) then (select auth.uid()) else null end
  where id = p_id returning * into v_row;
  if not found then
    raise exception 'Relato não encontrado.' using errcode = 'P0002';
  end if;
  perform public.admin_log('report.resolve', p_id::text, jsonb_build_object('resolved', coalesce(p_resolved, true), 'screen', v_row.screen));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end
$$;
revoke execute on function public.app_admin_report_resolve(bigint, boolean) from public, anon;
grant execute on function public.app_admin_report_resolve(bigint, boolean) to authenticated;
