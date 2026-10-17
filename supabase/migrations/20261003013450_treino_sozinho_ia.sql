-- =============================================================================
-- TREINO SOZINHO (2ª fase, grupo dupla-sozinho-ia) · PARTE 3 de 4: avaliação por IA (funções de SERVIÇO).
-- Depende da 013430 (solo_ia_status, função treino_avaliacao na Central) e da 013440 (solo_pep_rows, solo_finalize).
-- Plano: tarefa A1. Decisões do dono de 12/10: D5 (é o benefício Elite "correção de estação"), D6 (planos e limites ainda vazios =
-- IA bloqueada), D13 (usa o aceite do Tutor, sem documento novo).
--
-- Só o SERVIDOR (papel de serviço) executa estas três funções; o navegador não executa nenhuma (revoke de authenticated).
--   ch_worker_solo_prepare(p_user, p_attempt)         → todas as barreiras ANTES de qualquer gasto + reserva da cota + material da IA
--   ch_worker_solo_save_eval(p_user, p_attempt, eval) → a nota é calculada AQUI pelo banco (a IA só opina nos itens)
--   ch_worker_solo_fail(p_user, p_attempt, mensagem)  → devolve a cota e volta a "entregue"
--
-- Barreiras de ch_worker_solo_prepare, nesta ordem (cada recusa tem mensagem em português e NÃO gasta cota):
--   tentativa do próprio aluno e entregue → função "pronta" (comitê de empresas diferentes) → chave aberta → plano ou benefício Elite
--   → aceite do Tutor → limites preenchidos → cota do dia → cota do mês → texto não vazio e com pelo menos 20 palavras.
--   Equipe (administrador, editor, revisor médico) não depende de plano, aceite nem limite; a função pronta vale para todos.
-- O material enviado à IA tem o enunciado, as tarefas, TODOS os itens do PEP (níveis, pontos, critérios, subitens), o texto do aluno
-- por tarefa, os impressos abertos (com a hora) e o tempo usado. Não tem nome, e-mail, perfil, plano nem o roteiro do ator.
-- A cota é a própria tentativa: ia_reserved_at preenchido = uma avaliação usada hoje e no mês (fuso de São Paulo); uma falha devolve.
--
-- Pode ser colada duas vezes. Para desfazer: supabase/desfazer/20261003013450_treino_sozinho_ia.desfazer.sql
-- =============================================================================

create or replace function public.ch_worker_solo_prepare(p_user uuid, p_attempt uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.station_attempts;
  s public.checklist_stations;
  c jsonb;
  v_st jsonb;
  v_words integer;
  v_filled integer;
  v_material jsonb;
  v_status integer;
begin
  if p_user is null or p_attempt is null then
    return jsonb_build_object('ok', false, 'status', 400, 'message', 'Pedido inválido.');
  end if;
  -- uma de cada vez por aluno: dois cliques ou dois aparelhos não passam juntos da cota
  perform pg_advisory_xact_lock(hashtextextended('solo:' || p_user::text, 0));
  perform public.solo_sweep(p_attempt);
  select * into a from public.station_attempts where id = p_attempt and user_id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 403, 'message', 'Tentativa não encontrada.');
  end if;
  if a.status = 'evaluating' then
    return jsonb_build_object('ok', false, 'status', 409, 'message', 'A avaliação já está em andamento.');
  end if;
  if a.status = 'done' then
    return jsonb_build_object('ok', false, 'status', 409, 'message', 'Esta tentativa já foi avaliada.');
  end if;
  if a.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'status', 409, 'message', 'Entregue o treino antes de pedir a avaliação.');
  end if;

  v_st := public.solo_ia_status(p_user);
  if not coalesce((v_st ->> 'disponivel')::boolean, false) then
    v_status := case when v_st ->> 'motivo' like 'Você usou%' then 429 else 403 end;
    return jsonb_build_object('ok', false, 'status', v_status, 'message', coalesce(v_st ->> 'motivo', 'A avaliação por IA está indisponível agora.'));
  end if;

  select count(*), coalesce(sum(array_length(regexp_split_to_array(btrim(x ->> 'text'), '\s+'), 1)) filter (where btrim(x ->> 'text') <> ''), 0)
    into v_filled, v_words
    from jsonb_array_elements(a.answers) x
   where btrim(coalesce(x ->> 'text', '')) <> '';
  if v_filled = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'message', 'Escreva algo antes de pedir a avaliação.');
  end if;
  if v_words < 20 then
    return jsonb_build_object('ok', false, 'status', 422, 'message', 'Escreva um pouco mais (pelo menos 20 palavras) antes de pedir a avaliação.');
  end if;

  select * into s from public.checklist_stations where id = a.station_id;
  select k.content into c from public.checklist_station_contents k where k.station_id = a.station_id;
  c := coalesce(c, '{}'::jsonb);
  if jsonb_typeof(c -> 'checklist_items') is distinct from 'array' or jsonb_array_length(c -> 'checklist_items') = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'message', 'Esta estação não tem checklist.');
  end if;

  -- reserva da cota: a própria tentativa passa a "avaliando" com a hora da reserva
  update public.station_attempts set status = 'evaluating', how = 'ia', ia_reserved_at = now(), ia_message = null where id = a.id returning * into a;

  v_material := jsonb_build_object(
    'station', jsonb_build_object('id', s.id, 'name', s.name, 'area', s.area, 'version', coalesce(a.station_version, c ->> 'version')),
    'scene', public.solo_clean_text(c ->> 'doctor_scene'),
    'tasks', public.solo_clean_text(c ->> 'doctor_tasks'),
    'items', (select jsonb_agg(jsonb_build_object(
                'id', i ->> 'id', 'order', (i ->> 'order')::int, 'phase', i ->> 'phase', 'content', i ->> 'content',
                'tip', coalesce(i ->> 'tip', ''), 'grades', coalesce(i -> 'grades', '{}'::jsonb),
                'criteria', coalesce(i -> 'criteria', '{}'::jsonb), 'subitems', coalesce(i -> 'subitems', '[]'::jsonb)
              ) order by (i ->> 'order')::int)
                from jsonb_array_elements(c -> 'checklist_items') i),
    'answers', a.answers,
    'pressings_opened', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(p.e ->> 'name', ''), 'number', p.n, 'at_ms', (o ->> 'at_ms')::int) order by (o ->> 'at_ms')::int)
        from jsonb_array_elements(a.pressings_opened) o
        join public.dupla_pressings(c) p on p.id = o ->> 'id'), '[]'::jsonb),
    'used_ms', greatest(0, least((extract(epoch from (coalesce(a.submitted_at, now()) - coalesce(a.attendance_started_at, a.started_at))) * 1000)::bigint, 2147483647)),
    'duration_ms', s.duration_ms
  );
  return jsonb_build_object('ok', true, 'attempt_id', a.id, 'material', v_material);
end
$$;

-- Grava o resultado da IA. A NOTA É DO BANCO: a IA só diz o nível de cada item do PEP; item que ela não devolveu, nível que o item
-- não tem ou id inventado fica PENDENTE (vale 0, "Sem avaliação"). Quem valida o trecho literal é o servidor antes de chamar esta função.
-- p_eval: { items: [{ item_id, grade: correct|partial|incorrect|null, quote, reason, label }], note, diverged, members: [{company}], cost_usd }
-- label: 'divergiram' | 'sem_trecho' | 'nao_citado' | 'sem_avaliacao' | nulo.
create or replace function public.ch_worker_solo_save_eval(p_user uuid, p_attempt uuid, p_eval jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.station_attempts;
  c jsonb;
  v_grades jsonb := '{}'::jsonb;
  v_calc jsonb;
  v_rows jsonb;
  v_ia jsonb;
  i jsonb;
  e jsonb;
begin
  if p_eval is null or jsonb_typeof(p_eval) <> 'object' or jsonb_typeof(p_eval -> 'items') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'message', 'Resultado da avaliação inválido.');
  end if;
  select * into a from public.station_attempts where id = p_attempt and user_id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Tentativa não encontrada.');
  end if;
  if a.status = 'done' then
    return jsonb_build_object('ok', true, 'attempt_id', a.id, 'already', true);
  end if;
  if a.status <> 'evaluating' then
    return jsonb_build_object('ok', false, 'message', 'Esta tentativa não está sendo avaliada.');
  end if;
  select k.content into c from public.checklist_station_contents k where k.station_id = a.station_id;
  c := coalesce(c, '{}'::jsonb);

  -- a primeira resposta de cada item vale; id fora da estação é ignorado
  for i in select x from jsonb_array_elements(coalesce(c -> 'checklist_items', '[]'::jsonb)) x loop
    select y into e from jsonb_array_elements(p_eval -> 'items') y where y ->> 'item_id' = i ->> 'id' limit 1;
    if e is not null and e ->> 'grade' in ('correct', 'partial', 'incorrect') then
      v_grades := v_grades || jsonb_build_object(i ->> 'order', e ->> 'grade');
    end if;
    e := null;
  end loop;
  v_calc := public.solo_pep_rows(c, v_grades, false);

  -- acrescenta a cada linha o trecho do aluno, a razão e a etiqueta (a IA nunca mexe em pontos)
  select coalesce(jsonb_agg(
           r || case when y is null then jsonb_build_object('label', 'sem_avaliacao')
                     else jsonb_build_object(
                            'quote', case when r ->> 'grade' is not null and jsonb_typeof(y -> 'quote') = 'string' then left(y ->> 'quote', 600) end,
                            'reason', case when jsonb_typeof(y -> 'reason') = 'string' then left(y ->> 'reason', 240) end,
                            'label', case when y ->> 'label' in ('divergiram', 'sem_trecho', 'nao_citado') then y ->> 'label'
                                          when r ->> 'grade' is null then 'sem_avaliacao' end) end
           order by (r ->> 'order')::int), '[]'::jsonb)
    into v_rows
    from jsonb_array_elements(v_calc -> 'rows') r
    left join lateral (select z as y from jsonb_array_elements(p_eval -> 'items') z where z ->> 'item_id' = r ->> 'item_id' limit 1) m on true;
  v_calc := v_calc || jsonb_build_object('rows', v_rows);

  v_ia := jsonb_build_object(
    'note', left(coalesce(case when jsonb_typeof(p_eval -> 'note') = 'string' then p_eval ->> 'note' end, ''), 300),
    'diverged', coalesce(case when jsonb_typeof(p_eval -> 'diverged') = 'number' then (p_eval ->> 'diverged')::numeric::integer end, 0),
    'members', coalesce(p_eval -> 'members', '[]'::jsonb),
    'cost_usd', coalesce(case when jsonb_typeof(p_eval -> 'cost_usd') = 'number' then (p_eval ->> 'cost_usd')::numeric end, 0));
  a := public.solo_finalize(a.id, v_calc, 'ia', v_ia);
  return jsonb_build_object('ok', true, 'attempt_id', a.id);
end
$$;

-- Falha da IA (queda, tempo esgotado, resposta fora do formato, uma só IA respondeu): devolve a cota e volta a "entregue".
create or replace function public.ch_worker_solo_fail(p_user uuid, p_attempt uuid, p_message text) returns void
  language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.station_attempts
     set status = 'submitted', ia_reserved_at = null, ia_message = left(coalesce(nullif(btrim(p_message), ''), 'A avaliação por IA falhou.'), 400)
   where id = p_attempt and user_id = p_user and status = 'evaluating';
end
$$;

-- Gasto do mês com a função (para o painel "Uso do mês"): soma de ai_calls da função treino_avaliacao.
create or replace function public.solo_ia_month_cost(p_from timestamptz, p_to timestamptz) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(c.cost_usd), 0) from public.ai_calls c
   where c.function_key = 'treino_avaliacao' and c.created_at >= p_from and c.created_at < p_to
$$;

-- ---------------------------------------------------------------- permissões
-- Funções de serviço: o navegador não executa nenhuma.
revoke execute on function public.ch_worker_solo_prepare(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_solo_save_eval(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_solo_fail(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.solo_ia_month_cost(timestamptz, timestamptz) from public, anon, authenticated;
