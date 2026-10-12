-- =============================================================================
-- Reanálise de questões e conferência das fontes monitoradas pedidas pela tela (CC18 e CC23, 2026-10-12).
--
-- CC18: "Aguardando reanálise" só andava se alguém rodasse um comando no terminal. Agora:
--   - o administrador pede a reanálise pelo botão "Reanalisar agora" (app_ch_reanalysis_request);
--   - com a chave "Análise automática" ligada na Configuração, o processamento reanalisa sozinho a cada rodada;
--   - a tela mostra quantas questões esperam e o resultado da última rodada (app_ch_reanalysis_status).
--   A IA continua só PROPONDO: nada vai ao aluno sem decisão de um revisor médico.
-- CC23: "Conferir fontes monitoradas" dava erro no site (quem confere é o processamento no Google). Agora o botão deixa o
--   pedido marcado em cada fonte monitorada (app_ch_request_sources_check) e o processamento atende na próxima rodada.
--
-- Funções novas; nada existente é redefinido. Pode ser colada várias vezes.
-- =============================================================================

-- Controle do pedido de reanálise (uma linha só): quem pediu, quando começou e terminou a última rodada, o que aconteceu.
create table if not exists public.ch_reanalysis_control (
  id boolean primary key default true check (id),
  requested_at timestamptz,
  requested_by uuid references auth.users (id) on delete set null,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_manual boolean not null default false,
  last_summary jsonb not null default '{}'::jsonb
);
alter table public.ch_reanalysis_control enable row level security;
revoke all on public.ch_reanalysis_control from public, anon, authenticated;
insert into public.ch_reanalysis_control (id) values (true) on conflict (id) do nothing;

-- Quantas questões esperam a reanálise por IA (mesma regra de ch_worker_updates_for_reanalysis).
create or replace function public.ch_reanalysis_waiting() returns integer
  language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.questions q
   where q.correct_option is not null and q.status <> 'annulled'
     and exists (select 1 from public.question_updates u where u.question_id = q.id and u.proposal is null and u.status in ('queued', 'review_required')
                 and u.impact_level = 'UNDETERMINED' and u.diff_item_id is not null and u.triage_kind in ('NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED'))
$$;
revoke execute on function public.ch_reanalysis_waiting() from public, anon, authenticated;

-- Situação para a tela (equipe): quantas esperam, se há pedido, se a rodada automática está ligada e como foi a última.
create or replace function public.app_ch_reanalysis_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare c public.ch_reanalysis_control;
begin
  perform public.ch_assert_staff();
  select * into c from public.ch_reanalysis_control where id;
  return jsonb_build_object(
    'waiting', public.ch_reanalysis_waiting(),
    'requested_at', c.requested_at,
    'last_started_at', c.last_started_at,
    'last_finished_at', c.last_finished_at,
    'last_manual', coalesce(c.last_manual, false),
    'last_summary', coalesce(c.last_summary, '{}'::jsonb),
    'auto', public.ch_flag('auto_analysis_enabled'));
end
$$;

-- Pedido do administrador: o processamento atende na próxima rodada (a cada ~10 minutos). Pedir de novo enquanto há pedido não duplica.
create or replace function public.app_ch_reanalysis_request() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_waiting integer;
  v_already boolean;
begin
  perform public.assert_admin();
  v_waiting := public.ch_reanalysis_waiting();
  if v_waiting = 0 then raise exception 'Nenhuma questão está esperando reanálise agora.' using errcode = '22023'; end if;
  insert into public.ch_reanalysis_control (id) values (true) on conflict (id) do nothing;
  select requested_at is not null into v_already from public.ch_reanalysis_control where id;
  if not v_already then
    update public.ch_reanalysis_control set requested_at = now(), requested_by = (select auth.uid()) where id;
    perform public.ch_log('question_analysis.reanalysis_request', 'reanalysis', jsonb_build_object('waiting', v_waiting));
  end if;
  return jsonb_build_object('waiting', v_waiting, 'already', v_already);
end
$$;

-- Processamento: pega o pedido (manual) ou a vez da rodada automática. Devolve { run, manual }.
create or replace function public.ch_worker_reanalysis_claim() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_reanalysis_control;
  v_manual boolean;
  v_run boolean;
begin
  insert into public.ch_reanalysis_control (id) values (true) on conflict (id) do nothing;
  select * into c from public.ch_reanalysis_control where id for update;
  v_manual := c.requested_at is not null;
  v_run := v_manual or public.ch_flag('auto_analysis_enabled');
  if not v_run then return jsonb_build_object('run', false, 'manual', false); end if;
  if public.ch_reanalysis_waiting() = 0 then
    -- nada a fazer: o pedido (se havia) se encerra sem rodada
    if v_manual then
      update public.ch_reanalysis_control set requested_at = null, last_started_at = now(), last_finished_at = now(), last_manual = true,
             last_summary = jsonb_build_object('considered', 0, 'saved', 0, 'skipped', 0) where id;
    end if;
    return jsonb_build_object('run', false, 'manual', v_manual);
  end if;
  update public.ch_reanalysis_control set requested_at = null, last_started_at = now(), last_finished_at = null, last_manual = v_manual where id;
  return jsonb_build_object('run', true, 'manual', v_manual);
end
$$;

create or replace function public.ch_worker_reanalysis_done(p_summary jsonb) returns void
  language sql security definer set search_path = ''
as $$ update public.ch_reanalysis_control set last_finished_at = now(), last_summary = coalesce(p_summary, '{}'::jsonb) where id $$;

-- Conferir as fontes monitoradas agora: marca o pedido em cada fonte e o processamento confere na próxima rodada.
create or replace function public.app_ch_request_sources_check() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  perform public.assert_admin();
  update public.ch_source_watch set requested_at = now() where requested_at is null;
  select count(*)::int into n from public.ch_source_watch where requested_at is not null;
  if n > 0 then
    update public.ch_sources set freshness_status = 'CHECKING'
     where status = 'current' and id in (select source_id from public.ch_source_watch where requested_at is not null);
    perform public.ch_log('source.check_request', 'monitored', jsonb_build_object('sources', n));
  end if;
  return n;
end
$$;

do $revoke$
begin
  revoke execute on function public.app_ch_reanalysis_status() from public, anon;
  revoke execute on function public.app_ch_reanalysis_request() from public, anon;
  revoke execute on function public.app_ch_request_sources_check() from public, anon;
  grant execute on function public.app_ch_reanalysis_status() to authenticated;
  grant execute on function public.app_ch_reanalysis_request() to authenticated;
  grant execute on function public.app_ch_request_sources_check() to authenticated;
  revoke execute on function public.ch_worker_reanalysis_claim() from public, anon, authenticated;
  revoke execute on function public.ch_worker_reanalysis_done(jsonb) from public, anon, authenticated;
end
$revoke$;
