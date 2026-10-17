-- =============================================================================
-- Mini Tutor (pedido do dono, 17/10/2026): as regras do mini tutor valendo também no SERVIDOR. Aditiva; pode ser colada de novo.
--
--   Decisão 3 (simulado em andamento: sem Tutor até a entrega) e decisão 4 (antes de responder, só pistas) estavam só na tela.
--   Quem chamasse o servidor direto conseguia a resolução de uma questão do simulado aberto. Agora:
--   * public.tutor_simulado_aberto_ids(p_user): as questões dos simulados que o aluno ainda não entregou (practice_sessions
--     kind = 'simulado', finished_at nulo, começados nos últimos 30 dias — simulado abandonado há mais de um mês não trava o Tutor
--     para sempre). Só o servidor usa (sem execute para anon/authenticated).
--   * Gatilho em tutor_sessions (antes de gravar):
--       - conversa nova, ou troca de questão, numa questão de simulado em andamento → recusada
--         ("O Tutor ajuda nesta questão depois que você entregar o simulado.");
--       - conversa que já existia (aberta antes do simulado) não sobe pista nem mostra resolução enquanto o simulado está aberto;
--       - pistas contadas por QUESTÃO, não por conversa: a conversa nova (ou a troca de questão) com a questão aberta herda o maior
--         nível de pista das conversas do mesmo aluno na mesma questão nas últimas 24 h (até 4; a 5ª é a resolução). Fechar e abrir
--         o mini tutor não zera mais as pistas.
--   * app_tutor_start e tutor_next_for: o sorteio de questão (modos questão/erros) pula as questões do simulado em andamento — sem
--     isso, o sorteio podia cair numa delas e o gatilho recusaria a conversa. Aplicado sobre a definição vigente
--     (pg_get_functiondef), mesma técnica da …13590; falha alto se o trecho esperado não existir (nem o já trocado).
--   * Nada muda para o aluno fora de simulado: o Tutor completo continua com as 5 pistas e a resolução a pedido (é o desenho dele).
--
-- Para desfazer: supabase/desfazer/20261003013630_mini_tutor.desfazer.sql
-- =============================================================================

-- ---------------------------------------------------------------- questões dos simulados em andamento
create or replace function public.tutor_simulado_aberto_ids(p_user uuid) returns text[]
  language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct x.qid), '{}'::text[])
  from public.practice_sessions s, unnest(s.question_ids) as x(qid)
  where s.user_id = p_user and s.kind = 'simulado' and s.finished_at is null and s.started_at > now() - interval '30 days'
$$;
revoke execute on function public.tutor_simulado_aberto_ids(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- gatilho: simulado em andamento e pistas por questão
create or replace function public.tutor_sessions_mini_tutor_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_nova boolean;
  v_sobe boolean;
  v_herda smallint;
begin
  if new.question_id is null then return new; end if;
  if tg_op = 'INSERT' then
    v_nova := true;
    v_sobe := false;
  else
    v_nova := new.question_id is distinct from old.question_id;
    v_sobe := new.hint_level > old.hint_level or (new.question_state = 'revealed' and old.question_state is distinct from 'revealed');
  end if;
  if v_nova or v_sobe then
    if new.question_id = any (public.tutor_simulado_aberto_ids(new.user_id)) then
      raise exception 'O Tutor ajuda nesta questão depois que você entregar o simulado.' using errcode = '42501';
    end if;
  end if;
  if v_nova and new.question_state = 'open' then
    select least(4, coalesce(max(s.hint_level), 0))::smallint into v_herda
    from public.tutor_sessions s
    where s.user_id = new.user_id and s.question_id = new.question_id and s.question_state = 'open'
      and s.created_at > now() - interval '24 hours' and s.id is distinct from new.id;
    if v_herda > new.hint_level then new.hint_level := v_herda; end if;
  end if;
  return new;
end
$$;
revoke execute on function public.tutor_sessions_mini_tutor_guard() from public, anon, authenticated;

drop trigger if exists tutor_sessions_mini_tutor_guard on public.tutor_sessions;
create trigger tutor_sessions_mini_tutor_guard
  before insert or update of question_id, hint_level, question_state on public.tutor_sessions
  for each row execute function public.tutor_sessions_mini_tutor_guard();

-- ---------------------------------------------------------------- sorteio de questão pula o simulado em andamento
do $patch$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.app_tutor_start(text, text, text, jsonb, text)'::regprocedure) into v_def;
  v_new := replace(v_def, $$public.tutor_pick_question(v_user, p_mode, 3::smallint, '{}', v_area)$$,
                          $$public.tutor_pick_question(v_user, p_mode, 3::smallint, public.tutor_simulado_aberto_ids(v_user), v_area)$$);
  if v_new = v_def and position('tutor_simulado_aberto_ids' in v_def) = 0 then
    raise exception 'app_tutor_start: trecho do sorteio de questão não encontrado (definição vigente diferente da esperada)';
  end if;
  if v_new <> v_def then execute v_new; end if;

  select pg_get_functiondef('public.tutor_next_for(uuid, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, $$coalesce(array[s.question_id], '{}'), s.settings ->> 'area')$$,
                          $$coalesce(array[s.question_id], '{}') || public.tutor_simulado_aberto_ids(v_user), s.settings ->> 'area')$$);
  if v_new = v_def and position('tutor_simulado_aberto_ids' in v_def) = 0 then
    raise exception 'tutor_next_for: trecho do sorteio da próxima questão não encontrado (definição vigente diferente da esperada)';
  end if;
  if v_new <> v_def then execute v_new; end if;
end
$patch$;
