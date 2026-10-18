-- 012200 — Inéditas misturadas nos simulados comuns (pedido do dono, 16/10/2026: "podem entrar também").
-- ADITIVA: cria 2 funções, uma chave de configuração e redefine 5 funções (app_start_session, app_start_simulado_tri,
-- app_finish_session, practice_result, app_admin_save_settings). Pode ser colada de novo sem estragar nada. NÃO APLICADA em produção.
-- Cole DEPOIS da …012000. Para desfazer: supabase/desfazer/20261003012200_simulado_ineditas_misturadas.desfazer.sql;
-- para conferir: supabase/conferir/simulado-ineditas-misturadas.sql.
--
-- O que muda para o aluno:
--   * Simulado Rápido, Geral, Por área e Por tema (nenhuma prova escolhida) passa a levar Questões Inéditas misturadas, no máximo o
--     percentual do administrador (padrão 10%: 3 em 30, 5 em 50, 10 em 100), em posições sorteadas. Respeita os filtros de área e tema.
--   * Só entram inéditas que o plano do aluno libera (mesma regra e mesmo limite do treino). Sem inéditas liberadas (limite 0, sem acesso),
--     o simulado sai 100% oficial, sem erro. Equipe e planos "todas" sorteiam entre todas as publicadas.
--   * Continuam 100% oficiais: o simulado TRI, o simulado de uma prova escolhida e o simulado de área aberto pela Trilha.
--     Escolhendo a prova "Questões Inéditas" o simulado segue 100% inédito (…012000).
--   * No resultado, o placar ganha "ineditas": { total, answered, correct }, à parte do placar geral.
--   * Finalizar nunca mais é recusado por causa de inédita que o plano deixou de liberar no meio do simulado (baixou o limite, venceu o
--     teste, carga nova trocou as liberadas): a resposta daquela inédita simplesmente não é gravada (a limitação da …012000).
-- Para o administrador: Administração > Configurações guarda a chave simulado_ineditas_pct (0 a 50) com registro no histórico (settings.save).
--
-- Como o TRI continua oficial: app_start_simulado_tri liga a marca stazia.simulado_so_oficial só dentro da transação; o sorteio comum a lê.
-- A mistura também só acontece quando a chamada vem do próprio aluno (current_user = authenticated): a Trilha chama o sorteio como dono
-- da função, sem o limite do plano, e por isso fica fora.

-- ---------------------------------------------------------------- configuração do administrador
-- A tabela só aceitava duas chaves; entra a terceira. (O nome da regra é descoberto pelo conteúdo, para não depender do nome automático.)
do $$
declare
  r record;
begin
  for r in select c.conname from pg_constraint c
           where c.conrelid = 'public.app_settings'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%trial_days%' loop
    execute format('alter table public.app_settings drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.app_settings drop constraint if exists app_settings_key_check;
-- 18/10/2026 (2ª fase, publicar-fase2-v2): a lista já inclui as chaves do Treino em Dupla ('treino_dupla', 013300, e
-- 'treino_dupla_chat', 013370), para colar esta migração de novo DEPOIS delas não esbarrar nas linhas gravadas ("app_settings_key_check
-- is violated by some row"). Em banco sem a 2ª fase nada muda: as duas chaves só passam a ser aceitas.
alter table public.app_settings add constraint app_settings_key_check check (key in ('trial_days', 'announcement', 'simulado_ineditas_pct', 'treino_dupla', 'treino_dupla_chat'));
-- Padrão do dono: até 10% do simulado. "on conflict do nothing": colar de novo não desfaz o que o administrador mudou.
insert into public.app_settings (key, value) values ('simulado_ineditas_pct', '10'::jsonb) on conflict (key) do nothing;

-- O percentual vigente (0 a 50). A tabela de configurações é só da equipe; o aluno pergunta por esta função (definer).
create or replace function public.simulado_ineditas_pct() returns integer
  language sql stable security definer set search_path = ''
as $$
  select least(greatest(coalesce((select case when jsonb_typeof(s.value) = 'number' then round((s.value #>> '{}')::numeric)::int end
                                  from public.app_settings s where s.key = 'simulado_ineditas_pct'), 10), 0), 50)
$$;
revoke execute on function public.simulado_ineditas_pct() from public, anon;
grant execute on function public.simulado_ineditas_pct() to authenticated;

-- ---------------------------------------------------------------- o sorteio (era um trecho dentro de app_start_session)
-- Devolve até p_limit ids, uma só questão por grupo de equivalentes, equilibrado entre as áreas. Roda como quem chama (a leitura da
-- tabela de questões, e com ela o limite do plano, vale). Só devolve ids de questões que a própria pessoa já pode sortear.
create or replace function public.practice_draw(p_filters jsonb, p_limit integer) returns text[]
  language sql set search_path = ''
as $$
  select array_agg(picked.question_id order by picked.rn, picked.r)
  from (
    select p.question_id, p.rn, p.r
    from (
      select u.question_id,
             row_number() over (partition by u.area order by random()) as rn,
             random() as r
      from (
        -- uma só questão por grupo de equivalentes (a mesma questão em duas provas)
        select pool.question_id, pool.area,
               row_number() over (partition by coalesce(e.group_id, pool.question_id) order by random()) as dup
        from public.practice_pool(coalesce(p_filters, '{}'::jsonb)) pool
        left join public.question_equivalents e on e.question_id = pool.question_id
      ) u
      where u.dup = 1
    ) p
    order by p.rn, p.r
    limit greatest(coalesce(p_limit, 0), 0)
  ) picked
$$;
revoke execute on function public.practice_draw(jsonb, integer) from public, anon;
grant execute on function public.practice_draw(jsonb, integer) to authenticated;

-- ---------------------------------------------------------------- app_start_session (…012000 + mistura)
create or replace function public.app_start_session(
  p_kind text,
  p_filters jsonb,
  p_count integer,
  p_time_limit_seconds integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_filters constant jsonb := coalesce(p_filters, '{}'::jsonb);
  v_count constant integer := least(greatest(coalesce(p_count, 20), 1), 200);
  v_ids text[];
  v_id uuid;
  v_gate text;
  v_mix boolean;
  v_pct integer := 0;
  v_cap integer := 0;
  v_off text[];
  v_ined text[] := '{}';
  v_m integer;
  v_k integer := 0;
  v_total integer;
  v_pos integer[];
  v_oi integer := 1;
  v_ii integer := 1;
  p integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para treinar.' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('questoes', 'simulado') then
    raise exception 'Tipo de sessão inválido: %', p_kind using errcode = '22023';
  end if;
  if p_time_limit_seconds is not null and (p_kind <> 'simulado' or p_time_limit_seconds not between 60 and 43200) then
    raise exception 'Tempo limite inválido.' using errcode = '22023';
  end if;
  if p_kind = 'simulado' then
    v_gate := public.simulado_gate();
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
  end if;
  -- Questões Inéditas: teste vencido, plano vencido/cancelado e conta sem assinatura ficam fechados, com o aviso em português
  if v_filters ->> 'exam_id' = 'staziamed' then
    v_gate := public.ineditas_gate();
    if v_gate is not null then raise exception '%', v_gate using errcode = '42501'; end if;
  end if;

  -- Simulado comum (Rápido, Geral, Por área, Por tema: nenhuma prova escolhida) mistura Questões Inéditas, no máximo o percentual do
  -- administrador (app_settings.simulado_ineditas_pct, padrão 10). Não mistura: no simulado TRI (ele marca stazia.simulado_so_oficial), em
  -- prova escolhida (oficial ou a própria "Questões Inéditas") e quando chamada por função do servidor (a Trilha roda como dono, sem o
  -- limite do plano). Só entram as inéditas que o plano do aluno libera (a leitura da tabela filtra); sem inéditas liberadas, o simulado
  -- sai 100% oficial, sem erro.
  v_mix := p_kind = 'simulado'
       and nullif(btrim(coalesce(v_filters ->> 'exam_id', '')), '') is null
       and current_user = 'authenticated'
       and coalesce(current_setting('stazia.simulado_so_oficial', true), '') <> '1'
       and coalesce(public.has_ineditas(), false);
  if v_mix then
    v_pct := public.simulado_ineditas_pct();
    v_cap := floor(v_count * v_pct / 100.0)::int;
  end if;

  if v_cap > 0 then
    v_off := public.practice_draw(v_filters, v_count);
    v_ined := coalesce(public.practice_draw(v_filters || jsonb_build_object('exam_id', 'staziamed'), v_cap), '{}');
    v_m := coalesce(cardinality(v_off), 0);
    -- nunca mais que o percentual do simulado que realmente sai (se faltarem oficiais, as inéditas diminuem junto)
    v_k := least(cardinality(v_ined), v_cap, floor(v_m * v_pct / (100.0 - v_pct))::int);
    if v_k > 0 then
      v_off := v_off[1 : least(v_m, v_count - v_k)];
      v_total := cardinality(v_off) + v_k;
      -- as inéditas caem em posições sorteadas no meio das oficiais (a ordem das oficiais, equilibrada por área, é mantida)
      v_pos := array(select g from generate_series(1, v_total) g order by random() limit v_k);
      v_ids := '{}';
      for p in 1 .. v_total loop
        if p = any (v_pos) then
          v_ids := v_ids || v_ined[v_ii];
          v_ii := v_ii + 1;
        else
          v_ids := v_ids || v_off[v_oi];
          v_oi := v_oi + 1;
        end if;
      end loop;
    else
      v_ids := v_off[1 : v_count];
    end if;
  else
    v_ids := public.practice_draw(v_filters, v_count);
  end if;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Nenhuma questão encontrada com esses filtros.' using errcode = 'P0002';
  end if;

  insert into public.practice_sessions (kind, config, question_ids, time_limit_seconds)
  values (p_kind,
          jsonb_build_object('filters', v_filters, 'requested', v_count)
            || case when v_mix then jsonb_build_object('ineditas_mix', jsonb_build_object('pct', v_pct, 'count', v_k)) else '{}'::jsonb end,
          v_ids, p_time_limit_seconds)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'count', cardinality(v_ids));
end
$$;
revoke execute on function public.app_start_session(text, jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_session(text, jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------- app_start_simulado_tri (…012000 + marca de só oficiais)
create or replace function public.app_start_simulado_tri(
  p_filters jsonb,
  p_count integer,
  p_time_limit_seconds integer default null
) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v jsonb;
begin
  if coalesce(p_count, 0) < 30 then
    raise exception 'O simulado TRI precisa de pelo menos 30 questões (a estimativa fica mais precisa com 100).' using errcode = '22023';
  end if;
  -- Simulado TRI continua SÓ com questões oficiais do Inep (inédita não tem calibração oficial; a …010400 já a deixa fora da nota)
  if lower(btrim(coalesce(p_filters ->> 'exam_id', ''))) = 'staziamed' then
    raise exception 'O simulado TRI usa apenas questões oficiais do Inep: a nota depende da dificuldade medida de cada questão, e as Questões Inéditas ainda não têm essa medida. Para um simulado com as Questões Inéditas, escolha a correção Clássica.' using errcode = '22023';
  end if;
  -- o TRI é sempre 100% oficial: avisa o sorteio comum (marca só vale nesta transação e é desligada logo depois)
  perform set_config('stazia.simulado_so_oficial', '1', true);
  v := public.app_start_session('simulado', p_filters, p_count, p_time_limit_seconds);
  perform set_config('stazia.simulado_so_oficial', '', true);
  if (v ->> 'count')::int < 30 then
    raise exception 'Com esses filtros há só % questões; o simulado TRI precisa de pelo menos 30 questões.', v ->> 'count'
      using errcode = '22023';
  end if;
  update public.practice_sessions
    set config = config || jsonb_build_object('scoring', 'irt', 'scoring_version', 1)
    where id = (v ->> 'session_id')::uuid;
  return v || jsonb_build_object('scoring', 'irt');
end
$$;revoke execute on function public.app_start_simulado_tri(jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_simulado_tri(jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------- app_finish_session (…4300 + inédita fora do plano não derruba o Finalizar)
create or replace function public.app_finish_session(p_session_id uuid) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  s public.practice_sessions;
begin
  select * into s from public.practice_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if s.finished_at is null then
    if s.kind = 'simulado' then
      insert into public.question_attempts (question_id, session_id, selected_option, active_ms)
      select d.key, s.id, d.value ->> 'option', (d.value ->> 'ms')::integer
      from jsonb_each(s.answers) d
      where d.key = any (s.question_ids) and d.value ->> 'option' in ('A', 'B', 'C', 'D')
        -- Questão que a leitura da tabela não mostra mais para este aluno (inédita fora do plano, teste ou plano vencido): a resposta dela
        -- não é gravada e o simulado termina; sem isto o gatilho de resposta das inéditas recusava o Finalizar inteiro
        and exists (select 1 from public.questions q where q.id = d.key)
      on conflict (session_id, question_id) where session_id is not null do nothing;
    end if;
    update public.practice_sessions
      set finished_at = clock_timestamp(),
          paused_ms = paused_ms + case when paused_at is null then 0
                                       else greatest(floor(extract(epoch from clock_timestamp() - paused_at) * 1000), 0)::bigint end,
          paused_at = null
      where id = s.id;
  end if;

  return public.app_get_session(p_session_id);
end
$$;
-- ---------------------------------------------------------------- practice_result (…9801 + quantas eram inéditas)
create or replace function public.practice_result(p_session_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with s as (
    select * from public.practice_sessions where id = p_session_id and user_id = (select auth.uid())
  ),
  every_question as (
    select q.area, q.origin = 'staziamed' as ined, q.status = 'annulled' as annulled, a.id is not null as answered, coalesce(a.is_correct, false) as correct, coalesce(a.active_ms, 0) as ms
    from s
    cross join lateral unnest(s.question_ids) as u (question_id)
    join public.questions q on q.id = u.question_id
    left join public.question_attempts a on a.session_id = s.id and a.question_id = q.id
  ),
  answered as (
    select * from every_question where not annulled
  )
  select jsonb_build_object(
    'total', (select count(*)::int from answered),
    'answered', (select count(*)::int from answered where answered),
    'correct', (select count(*)::int from answered where correct),
    'annulled', (select count(*)::int from every_question where annulled),
    'active_seconds', (select (coalesce(sum(ms), 0) / 1000)::int from every_question),
    'elapsed_seconds', (select greatest(extract(epoch from (coalesce(s.finished_at, now()) - s.started_at))
                                        - s.paused_ms / 1000.0
                                        - case when s.paused_at is null then 0
                                               else extract(epoch from (coalesce(s.finished_at, now()) - s.paused_at)) end, 0)::int
                        from s),
    'paused_seconds', (select (s.paused_ms / 1000)::int from s),
    -- quantas das questões eram Questões Inéditas (à parte do placar geral): total na sessão, respondidas e certas
    'ineditas', jsonb_build_object(
      'total', (select count(*)::int from answered where ined),
      'answered', (select count(*)::int from answered where ined and answered),
      'correct', (select count(*)::int from answered where ined and correct)),
    'by_area', coalesce((
      select jsonb_agg(jsonb_build_object('area', x.area, 'total', x.total, 'answered', x.answered, 'correct', x.correct) order by x.area)
      from (
        select area, count(*)::int as total, count(*) filter (where answered)::int as answered,
               count(*) filter (where correct)::int as correct
        from answered group by area
      ) x
    ), '[]'::jsonb)
  )
$$;
-- ---------------------------------------------------------------- app_admin_save_settings (…1300 + simulado_ineditas_pct)
create or replace function public.app_admin_save_settings(p_settings jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_announcement jsonb := p_settings -> 'announcement';
begin
  perform public.assert_admin();
  if p_settings ? 'trial_days' then
    if (p_settings ->> 'trial_days') !~ '^\d{1,2}$' or (p_settings ->> 'trial_days')::int > 90 then
      raise exception 'Dias de teste: de 0 a 90.' using errcode = '22023';
    end if;
    update public.app_settings set value = to_jsonb((p_settings ->> 'trial_days')::int), updated_at = now(), updated_by = (select auth.uid())
    where key = 'trial_days';
  end if;
  -- Inéditas nos simulados comuns: no máximo este percentual do simulado (0 a 50; 0 = nenhuma)
  if p_settings ? 'simulado_ineditas_pct' then
    if (p_settings ->> 'simulado_ineditas_pct') !~ '^\d{1,2}$' or (p_settings ->> 'simulado_ineditas_pct')::int > 50 then
      raise exception 'Questões Inéditas nos simulados: de 0 a 50 por cento.' using errcode = '22023';
    end if;
    insert into public.app_settings (key, value, updated_at, updated_by)
    values ('simulado_ineditas_pct', to_jsonb((p_settings ->> 'simulado_ineditas_pct')::int), now(), (select auth.uid()))
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  if v_announcement is not null then
    if coalesce(v_announcement ->> 'tone', '') not in ('info', 'warning', 'success', 'brand')
       or char_length(coalesce(v_announcement ->> 'title', '')) > 120
       or char_length(coalesce(v_announcement ->> 'text', '')) > 600 then
      raise exception 'Aviso inválido: título até 120 e texto até 600 caracteres.' using errcode = '22023';
    end if;
    if coalesce((v_announcement ->> 'active')::boolean, false) and btrim(coalesce(v_announcement ->> 'title', '')) = '' then
      raise exception 'Para publicar o aviso, escreva o título.' using errcode = '22023';
    end if;
    update public.app_settings set
      value = jsonb_build_object('active', coalesce((v_announcement ->> 'active')::boolean, false),
                                 'tone', v_announcement ->> 'tone',
                                 'title', btrim(coalesce(v_announcement ->> 'title', '')),
                                 'text', btrim(coalesce(v_announcement ->> 'text', ''))),
      updated_at = now(), updated_by = (select auth.uid())
    where key = 'announcement';
  end if;
  perform public.admin_log('settings.save', null, p_settings);
  return public.app_admin_settings();
end
$$;