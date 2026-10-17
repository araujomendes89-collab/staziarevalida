-- =============================================================================
-- TREINO SOZINHO (2ª fase, grupo dupla-sozinho-ia) · PARTE 1 de 4: dados, regras da IA e peças compartilhadas.
-- Spec:  docs/superpowers/specs/2026-10-12-treino-dupla-sozinho-e-radar.md (e as decisões do dono de 12/10 no fim dela)
-- Plano: docs/superpowers/plans/2026-10-12-treino-dupla-sozinho-e-radar.md (tarefas S1, S8, S8b e A1, adaptadas à casca da 2ª fase)
-- Números: 013430 a 013460 (NUMEROS-MIGRACAO.md). Esta é a primeira; depois dela vêm a 013440 (funções do treino sozinho),
-- a 013450 (avaliação por IA) e a 013460 (uso do mês e exportação).
--
-- COMO O TREINO SOZINHO SE ENCAIXA (decisão do coordenador, ao ler o ramo fase2-telas):
--   * a casca da 2ª fase já tem o treino sozinho (013330: tabela station_attempts e as funções app_fase2_*). Em vez de criar uma
--     segunda tabela (study_solo_runs do plano de 12/10), esta migração AMPLIA a station_attempts: texto escrito por tarefa,
--     impressos abertos com a hora, entrega, escolha da correção (IA ou eu mesmo), resultado da IA e a nota.
--   * quando o treino termina (nota calculada pelo servidor), ele é ESPELHADO em checklist_study_sessions com mode = 'sozinho'
--     (source 'ia' ou 'autoavaliacao'). Assim "Sua última nota", "Média geral" e o cartão público (decisão D7 do dono: os treinos
--     sozinhos CONTAM) passam a enxergá-lo sem mexer nas funções do cartão do banco (de outros grupos). O histórico da dupla,
--     "Última vez" do resultado em dupla e o "Uso do mês" da dupla passam a olhar só mode = 'dupla'.
--
-- O QUE FAZ:
--  1) station_attempts: novas situações (submitted = entregue, evaluating = IA avaliando) e colunas do texto, dos impressos
--     abertos, da forma de correção, do resultado da IA e da reserva de cota. Continua fechada (sem política, sem permissão).
--  2) checklist_study_sessions: colunas mode ('dupla' | 'sozinho'), source ('avaliador' | 'ia' | 'autoavaliacao') e solo_run_id.
--  3) study_profiles.status aceita 'sozinho' (a restrição é refeita com a UNIÃO do que existe); app_dupla_heartbeat também.
--  4) app_admin_save_dupla(boolean, text[]): continua com a mesma assinatura, mas agora MESCLA no valor de 'treino_dupla' em vez de
--     substituí-lo (senão salvar "aberto/planos" apagaria os blocos 'sozinho', 'radar' e 'convites').
--  5) app_admin_save_dupla_ia(jsonb): grava só 'treino_dupla' → 'sozinho' → 'ia' { aberto, planos, limite_dia, limite_mes }.
--     Vazio = bloqueado (falha fechada); nenhum número é proposto aqui (decisão D6 do dono: os limites ainda vão entrar no cálculo).
--  6) A função "Avaliação do treino sozinho" (chave treino_avaliacao) entra na Central de IAs, NASCE DESLIGADA (sem linha salva)
--     e só fica pronta com comitê de IAs de EMPRESAS DIFERENTES (regra "conferência por outra empresa").
--  7) Regras da IA no banco: solo_ia_function_ready() e solo_ia_status(uid) (internas) dizem se a avaliação por IA está liberada
--     e o motivo curto quando não está. A cota fica na própria tentativa (ia_reserved_at), no fuso de São Paulo.
--  8) Cortes por mode: app_dupla_history, dupla_result_payload ("Última vez" só do mesmo modo) e app_admin_dupla_usage (nesta
--     parte só ganha o filtro; as linhas do sozinho ficam na 013460).
--
-- FUNÇÕES REFEITAS (base = a definição mais nova no ramo fase2-telas):
--   app_dupla_heartbeat ← 013320:141; app_admin_save_dupla ← 013310:471; app_dupla_history ← 013400:139;
--   dupla_result_payload ← 013400:43; app_admin_dupla_usage ← 013360:139.
--
-- Pode ser colada duas vezes. Para desfazer: supabase/desfazer/20261003013430_treino_sozinho_dados.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- 1) tentativas do treino sozinho (station_attempts)
alter table public.station_attempts add column if not exists answers jsonb not null default '[]'::jsonb;
alter table public.station_attempts add column if not exists pressings_opened jsonb not null default '[]'::jsonb;
alter table public.station_attempts add column if not exists submitted_at timestamptz;
alter table public.station_attempts add column if not exists how text;
alter table public.station_attempts add column if not exists source text;
alter table public.station_attempts add column if not exists ia jsonb;
alter table public.station_attempts add column if not exists ia_reserved_at timestamptz;
alter table public.station_attempts add column if not exists ia_message text;
alter table public.station_attempts add column if not exists station_version text;
alter table public.station_attempts add column if not exists session_id text;

alter table public.station_attempts drop constraint if exists station_attempts_status_check;
alter table public.station_attempts add constraint station_attempts_status_check
  check (status in ('reading', 'attending', 'submitted', 'evaluating', 'scoring', 'done', 'abandoned'));
alter table public.station_attempts drop constraint if exists station_attempts_how_check;
alter table public.station_attempts add constraint station_attempts_how_check check (how is null or how in ('ia', 'self'));
alter table public.station_attempts drop constraint if exists station_attempts_source_check;
alter table public.station_attempts add constraint station_attempts_source_check check (source is null or source in ('ia', 'autoavaliacao'));
alter table public.station_attempts drop constraint if exists station_attempts_answers_check;
alter table public.station_attempts add constraint station_attempts_answers_check check (jsonb_typeof(answers) = 'array' and jsonb_typeof(pressings_opened) = 'array');
alter table public.station_attempts drop constraint if exists station_attempts_ia_message_check;
alter table public.station_attempts add constraint station_attempts_ia_message_check check (ia_message is null or char_length(ia_message) <= 400);
create index if not exists station_attempts_ia_idx on public.station_attempts (user_id, ia_reserved_at) where ia_reserved_at is not null;
-- uma tentativa aberta por pessoa (as funções já abandonam a de outra estação ao começar uma; este índice garante também numa corrida)
-- (não é único: a 013330 permite o reaproveitamento da mesma estação; a regra continua nas funções)

-- ---------------------------------------------------------------- 2) avaliações: modo e fonte
alter table public.checklist_study_sessions add column if not exists mode text not null default 'dupla';
alter table public.checklist_study_sessions add column if not exists source text not null default 'avaliador';
alter table public.checklist_study_sessions add column if not exists solo_run_id uuid;
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_mode_check;
alter table public.checklist_study_sessions add constraint checklist_study_sessions_mode_check check (mode in ('dupla', 'sozinho'));
alter table public.checklist_study_sessions drop constraint if exists checklist_study_sessions_source_check;
alter table public.checklist_study_sessions add constraint checklist_study_sessions_source_check check (source in ('avaliador', 'ia', 'autoavaliacao'));
create index if not exists checklist_sessions_doctor_mode_idx on public.checklist_study_sessions (doctor_id, mode, finished_at desc);

-- ---------------------------------------------------------------- 3) situação "sozinho" no perfil de estudo
do $status$
declare
  v_def text;
  v_vals text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.study_profiles'::regclass and c.conname = 'study_profiles_status_check';
  v_vals := array['livre', 'em_estacao', 'fora', 'sozinho'] || coalesce(array(select m[1] from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') as m), '{}');
  v_vals := array(select distinct x from unnest(v_vals) x order by x);
  alter table public.study_profiles drop constraint if exists study_profiles_status_check;
  execute format('alter table public.study_profiles add constraint study_profiles_status_check check (status in (%s))',
                 (select string_agg(quote_literal(x), ', ') from unnest(v_vals) x));
end
$status$;

-- Sinal de online (base: 013320). Novo: 'sozinho' só vale com um treino aberto da pessoa; senão fica 'livre'.
create or replace function public.app_dupla_heartbeat(p_status text, p_room_id uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  v_status text := p_status;
begin
  if p_status is null or p_status not in ('livre', 'em_estacao', 'fora', 'sozinho') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if v_status = 'em_estacao' and not exists (
       select 1 from public.checklist_rooms r where r.id = p_room_id and v_uid = any (r.member_ids) and r.phase <> 'closed') then
    v_status := 'livre';
  end if;
  if v_status = 'sozinho' and not exists (
       select 1 from public.station_attempts a where a.user_id = v_uid and a.status in ('attending', 'submitted', 'evaluating', 'scoring')) then
    v_status := 'livre';
  end if;
  update public.study_profiles set status = v_status, last_seen_at = now() where user_id = v_uid;
  perform public.dupla_sweep();
  return jsonb_build_object('server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 4) chave do módulo: mesclar, não substituir
-- Base: 013310:471. Mesma assinatura e mesma resposta; a única mudança é que o valor novo é MESCLADO ao antigo, para não apagar
-- os blocos que outras partes gravam em 'treino_dupla' ('sozinho', 'radar', 'convites').
create or replace function public.app_admin_save_dupla(p_aberto boolean, p_planos text[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_planos text[];
  v_aberto boolean := coalesce(p_aberto, false);
begin
  perform public.assert_admin();
  if p_planos is null or not (p_planos <@ array['trial', 'pro', 'elite']::text[]) then
    raise exception 'Planos inválidos.' using errcode = '22023';
  end if;
  v_planos := array(select p from unnest(array['trial', 'pro', 'elite']::text[]) p where p = any (p_planos));
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('treino_dupla', jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos)), now(), (select auth.uid()))
  on conflict (key) do update
    set value = (case when jsonb_typeof(public.app_settings.value) = 'object' then public.app_settings.value else '{}'::jsonb end)
                || jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos)),
        updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('dupla.save', null, jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos)));
  return jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos));
end
$$;

-- ---------------------------------------------------------------- 5) painel: avaliação por IA do treino sozinho
-- { aberto: boolean, planos: ['trial'|'pro'|'elite'], limite_dia: inteiro ≥ 1 ou nulo, limite_mes: inteiro ≥ 1 ou nulo }
-- Só administrador. Grava só 'sozinho' → 'ia' dentro de 'treino_dupla' e deixa o resto como está. Vazio = IA bloqueada.
create or replace function public.app_admin_save_dupla_ia(p_config jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_aberto boolean;
  v_planos text[];
  v_dia integer;
  v_mes integer;
  v_ia jsonb;
begin
  perform public.assert_admin();
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config -> 'aberto') is distinct from 'boolean' then
    raise exception 'Informe se a avaliação por IA está aberta.' using errcode = '22023';
  end if;
  v_aberto := (p_config ->> 'aberto')::boolean;
  if jsonb_typeof(p_config -> 'planos') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_config -> 'planos') x where jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('trial', 'pro', 'elite')) then
    raise exception 'Planos inválidos.' using errcode = '22023';
  end if;
  v_planos := array(select p.v from unnest(array['trial', 'pro', 'elite']::text[]) with ordinality as p(v, n)
                     where p.v in (select x #>> '{}' from jsonb_array_elements(p_config -> 'planos') x) order by p.n);
  v_dia := case when jsonb_typeof(p_config -> 'limite_dia') = 'number' then (p_config ->> 'limite_dia')::numeric::integer end;
  v_mes := case when jsonb_typeof(p_config -> 'limite_mes') = 'number' then (p_config ->> 'limite_mes')::numeric::integer end;
  if (p_config ? 'limite_dia' and jsonb_typeof(p_config -> 'limite_dia') not in ('number', 'null'))
     or (p_config ? 'limite_mes' and jsonb_typeof(p_config -> 'limite_mes') not in ('number', 'null'))
     or (v_dia is not null and (v_dia < 1 or v_dia > 1000))
     or (v_mes is not null and (v_mes < 1 or v_mes > 10000))
     or (v_dia is not null and v_mes is not null and v_mes < v_dia) then
    raise exception 'Limites inválidos: use números inteiros de 1 em diante, com o do mês maior ou igual ao do dia.' using errcode = '22023';
  end if;
  v_ia := jsonb_build_object('aberto', v_aberto, 'planos', to_jsonb(v_planos), 'limite_dia', to_jsonb(v_dia), 'limite_mes', to_jsonb(v_mes));
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('treino_dupla', jsonb_build_object('aberto', false, 'planos', jsonb_build_array('pro', 'elite'), 'sozinho', jsonb_build_object('ia', v_ia)),
          now(), (select auth.uid()))
  on conflict (key) do update
    set value = jsonb_set(
          case when jsonb_typeof(public.app_settings.value) = 'object' then public.app_settings.value else '{}'::jsonb end,
          '{sozinho}',
          (case when jsonb_typeof(public.app_settings.value -> 'sozinho') = 'object' then public.app_settings.value -> 'sozinho' else '{}'::jsonb end)
            || jsonb_build_object('ia', v_ia),
          true),
        updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('dupla.ia.save', null, v_ia);
  return v_ia;
end
$$;

-- O que o painel mostra da avaliação por IA: a configuração, o estado da função na Central e o gasto do mês. Só a equipe.
create or replace function public.app_admin_dupla_ia() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_ia jsonb;
  v_ready jsonb;
  v_elite boolean := false;
begin
  perform public.assert_staff();
  if to_regclass('public.plan_benefits') is not null then
    execute 'select coalesce((select b.elite_station_feedback from public.plan_benefits b), false)' into v_elite;
  end if;
  select c.value into v from public.app_settings c where c.key = 'treino_dupla';
  v_ia := case when jsonb_typeof(v -> 'sozinho' -> 'ia') = 'object' then v -> 'sozinho' -> 'ia' else '{}'::jsonb end;
  v_ready := public.solo_ia_function_ready();
  return jsonb_build_object(
    'aberto', coalesce(v_ia -> 'aberto' = 'true'::jsonb, false),
    'planos', case when jsonb_typeof(v_ia -> 'planos') = 'array' then v_ia -> 'planos' else '[]'::jsonb end,
    'limite_dia', case when jsonb_typeof(v_ia -> 'limite_dia') = 'number' then v_ia -> 'limite_dia' end,
    'limite_mes', case when jsonb_typeof(v_ia -> 'limite_mes') = 'number' then v_ia -> 'limite_mes' end,
    'funcao_pronta', coalesce((v_ready ->> 'ready')::boolean, false),
    'funcao_motivo', v_ready ->> 'reason',
    'elite_libera', v_elite
  );
end
$$;

-- ---------------------------------------------------------------- 6) Central de IAs: a função "Avaliação do treino sozinho"
-- A lista de chaves vem da restrição (ai_function_keys, …9910); a nova vai para o fim. Sem linha salva = função desligada.
do $keys$
declare
  v_def text;
  v_vals text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c where c.conrelid = 'public.ai_functions'::regclass and c.conname = 'ai_functions_key_check';
  v_vals := coalesce(array(select m[1] from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') as m), '{}');
  if not ('treino_avaliacao' = any (v_vals)) then v_vals := v_vals || 'treino_avaliacao'::text; end if;
  alter table public.ai_functions drop constraint if exists ai_functions_key_check;
  execute format('alter table public.ai_functions add constraint ai_functions_key_check check (key in (%s))', (select string_agg(quote_literal(x), ', ') from unnest(v_vals) x));
end
$keys$;

-- A empresa por trás de cada IA cadastrada (regra "conferência por outra empresa", decisão do dono de 10/10).
create or replace function public.solo_ia_company(p_provider text) returns text
  language sql immutable set search_path = ''
as $$ select case p_provider when 'anthropic' then 'anthropic' when 'openai' then 'openai' when 'gemini' then 'google' when 'ollama' then 'ollama' else null end $$;

-- A função treino_avaliacao está pronta? Linha salva no modo comitê, com a principal e pelo menos um membro, todos de IAs LIGADAS
-- e de pelo menos DUAS empresas diferentes. Interna (só as funções do servidor e as do banco chamam).
-- → { ready: boolean, reason: texto curto ou nulo, companies: n }
create or replace function public.solo_ia_function_ready() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f public.ai_functions;
  v_members jsonb;
  v_n integer;
  v_companies integer;
  v_off text;
begin
  select * into f from public.ai_functions where key = 'treino_avaliacao';
  if not found or f.primary_ref is null then
    return jsonb_build_object('ready', false, 'reason', 'A avaliação por IA está indisponível agora.', 'detail', 'Função sem configuração salva (desligada).', 'companies', 0);
  end if;
  if f.mode <> 'comite' then
    return jsonb_build_object('ready', false, 'reason', 'A avaliação por IA está indisponível agora.', 'detail', 'A função precisa do modo comitê, com IAs de empresas diferentes.', 'companies', 0);
  end if;
  v_members := jsonb_build_array(f.primary_ref) || coalesce(f.reviewers, '[]'::jsonb);
  select count(*), count(distinct public.solo_ia_company(m ->> 'provider')),
         string_agg(distinct m ->> 'provider', ', ') filter (where not exists (select 1 from public.ai_providers p where p.id = m ->> 'provider' and p.enabled))
    into v_n, v_companies, v_off
    from jsonb_array_elements(v_members) m;
  if v_n < 2 or v_companies < 2 then
    return jsonb_build_object('ready', false, 'reason', 'A avaliação por IA está indisponível agora.', 'detail', 'O comitê precisa de pelo menos dois membros de empresas diferentes.', 'companies', coalesce(v_companies, 0));
  end if;
  if v_off is not null then
    return jsonb_build_object('ready', false, 'reason', 'A avaliação por IA está indisponível agora.', 'detail', 'IA desligada na Central: ' || v_off || '.', 'companies', v_companies);
  end if;
  return jsonb_build_object('ready', true, 'reason', null, 'companies', v_companies);
end
$$;

-- Dia e mês (fuso de São Paulo) de uma data: usados na cota.
create or replace function public.solo_sp_day(p_at timestamptz) returns date
  language sql immutable set search_path = ''
as $$ select (p_at at time zone 'America/Sao_Paulo')::date $$;

-- A pessoa pode pedir a avaliação por IA agora? Todas as barreiras, nesta ordem, SEM gastar nada:
--   função pronta → (equipe passa daqui) → chave 'aberto' → plano (ou benefício Elite) → aceite do Tutor → limites preenchidos → cota do dia → cota do mês.
-- Equipe (administrador, editor, revisor médico) não depende de plano, aceite nem limite; a função pronta vale para todos.
-- → { disponivel: boolean, motivo: texto curto ou nulo, aceite_pendente: boolean, equipe: boolean, usadas_dia, usadas_mes }
create or replace function public.solo_ia_status(p_uid uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_ia jsonb;
  v_ready jsonb;
  v_staff boolean;
  v_plan_ok boolean;
  v_dia integer;
  v_mes integer;
  v_used_dia integer;
  v_used_mes integer;
  v_hoje date := public.solo_sp_day(now());
begin
  v_staff := coalesce(public.user_has_full_access(p_uid), false);
  v_ready := public.solo_ia_function_ready();
  select count(*)::int into v_used_dia from public.station_attempts a
   where a.user_id = p_uid and a.ia_reserved_at is not null and public.solo_sp_day(a.ia_reserved_at) = v_hoje;
  select count(*)::int into v_used_mes from public.station_attempts a
   where a.user_id = p_uid and a.ia_reserved_at is not null
     and to_char(a.ia_reserved_at at time zone 'America/Sao_Paulo', 'YYYY-MM') = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  if not coalesce((v_ready ->> 'ready')::boolean, false) then
    return jsonb_build_object('disponivel', false, 'motivo', v_ready ->> 'reason', 'aceite_pendente', false, 'equipe', v_staff, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  if v_staff then
    return jsonb_build_object('disponivel', true, 'motivo', null, 'aceite_pendente', false, 'equipe', true, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  select c.value into v from public.app_settings c where c.key = 'treino_dupla';
  v_ia := case when jsonb_typeof(v -> 'sozinho' -> 'ia') = 'object' then v -> 'sozinho' -> 'ia' else '{}'::jsonb end;
  -- plano: o marcado em 'planos' (mesma regra de validade de dupla_allowed) ou o benefício Elite "correção de estação" (decisão D5)
  v_plan_ok := (public.station_feedback_for(p_uid))
            or exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(v_ia -> 'planos') = 'array' then v_ia -> 'planos' else '[]'::jsonb end) pl
                        where public.solo_plan_matches(p_uid, pl));
  if v_ia -> 'aberto' is distinct from 'true'::jsonb then
    return jsonb_build_object('disponivel', false, 'motivo', 'A avaliação por IA está indisponível agora.', 'aceite_pendente', false, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  if not v_plan_ok then
    return jsonb_build_object('disponivel', false, 'motivo', 'Disponível em outro plano.', 'aceite_pendente', false, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  if public.tutor_consent_pending(p_uid) then
    return jsonb_build_object('disponivel', false, 'motivo', 'Aceite o aviso para usar a IA.', 'aceite_pendente', true, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  v_dia := case when jsonb_typeof(v_ia -> 'limite_dia') = 'number' then (v_ia ->> 'limite_dia')::numeric::integer end;
  v_mes := case when jsonb_typeof(v_ia -> 'limite_mes') = 'number' then (v_ia ->> 'limite_mes')::numeric::integer end;
  -- limite não preenchido = bloqueada (falha fechada; os números são do dono)
  if v_dia is null or v_mes is null then
    return jsonb_build_object('disponivel', false, 'motivo', 'A avaliação por IA está indisponível agora.', 'aceite_pendente', false, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  if v_used_dia >= v_dia then
    return jsonb_build_object('disponivel', false, 'motivo', 'Você usou as avaliações de hoje.', 'aceite_pendente', false, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  if v_used_mes >= v_mes then
    return jsonb_build_object('disponivel', false, 'motivo', 'Você usou as avaliações do mês.', 'aceite_pendente', false, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
  end if;
  return jsonb_build_object('disponivel', true, 'motivo', null, 'aceite_pendente', false, 'equipe', false, 'usadas_dia', v_used_dia, 'usadas_mes', v_used_mes);
end
$$;

-- O plano da pessoa vale para a marca 'trial' | 'pro' | 'elite'? Pro e Elite só com plano pago válido; teste grátis só dentro do prazo.
-- (mesma regra de dupla_allowed, 013300)
create or replace function public.solo_plan_matches(p_uid uuid, p_plan text) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.subscriptions;
begin
  select * into s from public.subscriptions where user_id = p_uid;
  if not found then return false; end if;
  if p_plan = 'trial' then
    return s.plan::text = 'trial' and s.status = 'trialing' and s.trial_ends_at > now();
  end if;
  return s.plan::text = p_plan and s.plan::text in ('pro', 'elite') and public.subscription_is_paid(s.plan, s.status, s.current_period_end);
end
$$;

-- Benefício Elite "correção de estação com devolutiva" (009731), por pessoa: Elite com plano pago válido e a chave ligada.
create or replace function public.station_feedback_for(p_uid uuid) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v boolean := false;
begin
  if p_uid is null then return false; end if;
  -- o benefício Elite vem da migração 009731 (leva 3); se ela ainda não foi colada, não há benefício
  if to_regprocedure('public.user_is_paid_elite(uuid)') is null or to_regclass('public.plan_benefits') is null then return false; end if;
  execute 'select public.user_is_paid_elite($1) and coalesce((select b.elite_station_feedback from public.plan_benefits b), false)' into v using p_uid;
  return coalesce(v, false);
end
$$;

-- ---------------------------------------------------------------- 7) cortes por modo
-- Histórico das rodadas em dupla (base: 013400:139). Novo: só mode = 'dupla' (o treino sozinho espelhado não é rodada).
create or replace function public.app_dupla_history(p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.fim desc, x.sid desc)
      from (
        select s.finished_at as fim, s.id as sid, jsonb_build_object(
                 'room_id', s.room_id,
                 'round', s.round,
                 'role', case when s.doctor_id = v_uid then 'candidate' else 'evaluator' end,
                 'status', case when z.ok then 'concluida' else 'aguardando_revisao' end,
                 'revised', s.revised_at is not null,
                 'finished_at', s.finished_at,
                 'partner', jsonb_build_object('public_name',
                              public.dupla_public_name(case when s.doctor_id = v_uid then s.actor_id else s.doctor_id end)),
                 'station', jsonb_build_object(
                   'number', z.meta -> 'number',
                   'area', st.area,
                   'area_code', public.dupla_area_code(st.area),
                   'name', case when z.ok then st.name end,
                   'edition', case when z.ok then z.meta -> 'edition' end),
                 'score', case when z.ok then s.score end,
                 'max_score', case when z.ok then s.max_score end,
                 'pct', case when z.ok and s.max_score > 0 then round(s.score / s.max_score * 100)::integer end
               ) as j
          from public.checklist_study_sessions s
          left join public.checklist_stations st on st.id = s.station_id
          cross join lateral (select public.dupla_history_released(s) as ok, public.dupla_station_meta(s.station_id) as meta) z
         where s.room_id is not null and s.mode = 'dupla'
           and (s.doctor_id = v_uid or s.actor_id = v_uid)
         order by s.finished_at desc nulls last, s.id desc
         limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) x
  ), '[]'::jsonb);
end
$$;

-- Corpo do resultado de uma rodada (base: 013400:43). Novo: "Última vez" (previous_pct) compara só com avaliação do MESMO modo
-- (nota de avaliador humano e nota de IA não se misturam).
create or replace function public.dupla_result_payload(s public.checklist_study_sessions, p_uid uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  st public.checklist_stations;
  c jsonb;
  v_meta jsonb;
  v_items jsonb;
  v_prev integer;
begin
  select * into st from public.checklist_stations where id = s.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = s.station_id;
  v_meta := public.dupla_station_meta(s.station_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.e ->> 'id',
           'order', coalesce(i.e -> 'order', to_jsonb(i.n)),
           'content', coalesce(i.e ->> 'content', ''),
           'max_points', coalesce((i.e -> 'grades' ->> 'correct')::numeric, 0),
           'grade', a.grade,
           'points', case when a.grade is null then 0 else coalesce((i.e -> 'grades' ->> a.grade)::numeric, 0) end
         ) order by i.n), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(case when jsonb_typeof(c -> 'checklist_items') = 'array' then c -> 'checklist_items' else '[]'::jsonb end)
       with ordinality as i(e, n)
  left join lateral (
    select lower(x ->> 'grade') as grade
    from jsonb_array_elements(case when jsonb_typeof(s.checklist_answers) = 'array' then s.checklist_answers else '[]'::jsonb end) x
    where x ->> 'id' = i.e ->> 'id' and lower(x ->> 'grade') in ('correct', 'partial', 'incorrect')
    limit 1
  ) a on true;

  select round(p.correctness)::integer into v_prev
    from public.checklist_study_sessions p
   where p.doctor_id = s.doctor_id and p.station_id = s.station_id and p.id <> s.id and p.mode = s.mode
     and (p.finished_at, p.created_at, p.id) < (s.finished_at, s.created_at, s.id)
   order by p.finished_at desc, p.created_at desc, p.id desc
   limit 1;

  return jsonb_build_object(
    'round', s.round,
    'viewer', case when p_uid = s.doctor_id then 'candidate' else 'evaluator' end,
    'station', jsonb_build_object(
      'id', st.id, 'name', st.name, 'area', st.area, 'area_code', public.dupla_area_code(st.area),
      'number', v_meta -> 'number', 'edition', v_meta -> 'edition', 'reapplication', v_meta -> 'reapplication',
      'institution', st.institution, 'duration_ms', st.duration_ms
    ),
    'score', s.score,
    'max_score', s.max_score,
    'pct', case when s.max_score > 0 then round(s.score / s.max_score * 100)::integer else 0 end,
    'previous_pct', v_prev,
    'items', v_items,
    'evaluator', jsonb_build_object('user_id', s.actor_id, 'public_name', public.dupla_public_name(s.actor_id)),
    'candidate', jsonb_build_object('user_id', s.doctor_id, 'public_name', public.dupla_public_name(s.doctor_id)),
    'finished_at', s.finished_at,
    'used_ms', s.used_ms,
    'feedback', jsonb_build_object('pos', s.feedback_pos, 'neg', s.feedback_neg, 'gen', s.feedback_gen),
    'review', jsonb_build_object('requested_at', s.review_requested_at, 'reason', s.review_reason,
                                 'revised_at', s.revised_at, 'score_before_review', s.score_before_review)
  );
end
$$;

-- Uso do mês (base: 013360:139). Nesta parte só ganha o corte por modo: salas, rodadas avaliadas, alunos e impressos continuam
-- só da dupla. As linhas do treino sozinho entram na 013460.
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
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_dupla_heartbeat(text, uuid) from public, anon;
revoke execute on function public.app_admin_save_dupla(boolean, text[]) from public, anon;
revoke execute on function public.app_admin_save_dupla_ia(jsonb) from public, anon;
revoke execute on function public.app_admin_dupla_ia() from public, anon;
revoke execute on function public.app_dupla_history(integer) from public, anon;
revoke execute on function public.app_admin_dupla_usage(text) from public, anon;
-- Apoios: só rodam por dentro das funções acima (security definer).
revoke execute on function public.solo_ia_company(text) from public, anon, authenticated;
revoke execute on function public.solo_ia_function_ready() from public, anon, authenticated;
revoke execute on function public.solo_sp_day(timestamptz) from public, anon, authenticated;
revoke execute on function public.solo_ia_status(uuid) from public, anon, authenticated;
revoke execute on function public.solo_plan_matches(uuid, text) from public, anon, authenticated;
revoke execute on function public.station_feedback_for(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_result_payload(public.checklist_study_sessions, uuid) from public, anon, authenticated;
