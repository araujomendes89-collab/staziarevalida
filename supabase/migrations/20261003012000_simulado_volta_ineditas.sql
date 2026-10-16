-- 012000 — Simulados voltam a aceitar as Questões Inéditas (pedido do dono, 2026-10-16: "Simulados também entram as questões inéditas").
-- SÓ ADITIVA: só `create or replace` de 2 funções; pode ser colada de novo sem estragar nada. NÃO APLICADA em produção.
-- Cole DEPOIS da …010800 (e de qualquer outra que redefina app_start_session). Para desfazer: supabase/desfazer/20261003012000_simulado_volta_ineditas.desfazer.sql.
--
-- O que muda:
--   * app_start_session: sai o bloqueio que a …010800 pôs (o simulado recusava a prova "Questões Inéditas", exam_id = 'staziamed').
--     Volta ao corpo da …9801: simulado rápido, por área, geral, por tema ou personalizado aceita a prova "Questões Inéditas",
--     do mesmo jeito que o treino aceita. O resto da função é IDÊNTICO ao da …010800 (mesmos avisos, mesmas permissões).
--   * app_start_simulado_tri: o TRI continua SÓ com questões oficiais do Inep (a nota precisa de itens com calibração oficial, e a
--     …010400 já deixa a inédita fora da calibração e da nota). Mudou só o texto da recusa: antes dizia que as inéditas são
--     "exclusivas do treino", o que deixou de ser verdade; agora manda escolher a correção Clássica.
--
-- O que NÃO muda (os testes conferem):
--   * Sem escolher a prova "Questões Inéditas", o sorteio é só de questões oficiais (practice_pool da …9970). A sessão nunca mistura
--     as duas coleções: decisão do dono de 11/10 (§0 da especificação das Questões Inéditas). Misturar seria outro pedido.
--   * Limite por plano (…010300): vale no simulado igual ao treino. O sorteio lê `questions` como o próprio aluno, e a política de
--     leitura só deixa ele enxergar as inéditas liberadas no plano dele (mais as que ele já respondeu). Teste grátis = 20 hoje; o
--     administrador muda em Administração > Planos.
--   * Teste vencido, plano vencido e conta sem assinatura: o simulado continua fechado (simulado_gate) e as inéditas também (ineditas_gate).
--   * O aluno não vê gabarito, explicação, fontes nem códigos antes de responder; as fontes das inéditas seguem fora do servidor (…010500).
--   * Calibração e nota do TRI: só oficiais (…010400). Simulado clássico com inéditas não entra na matriz de calibração.
--   * Permissões: visitante (sem login) continua sem executar as duas funções; quem está logado executa.

-- ---------------------------------------------------------------- app_start_session (corpo da …9801: o simulado aceita a prova "Questões Inéditas")
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

  select array_agg(picked.question_id order by picked.rn, picked.r) into v_ids
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
        from public.practice_pool(v_filters) pool
        left join public.question_equivalents e on e.question_id = pool.question_id
      ) u
      where u.dup = 1
    ) p
    order by p.rn, p.r
    limit v_count
  ) picked;

  if v_ids is null then
    raise exception 'Nenhuma questão encontrada com esses filtros.' using errcode = 'P0002';
  end if;

  insert into public.practice_sessions (kind, config, question_ids, time_limit_seconds)
  values (p_kind, jsonb_build_object('filters', v_filters, 'requested', v_count), v_ids, p_time_limit_seconds)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'count', cardinality(v_ids));
end
$$;
revoke execute on function public.app_start_session(text, jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_session(text, jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------- app_start_simulado_tri
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
  v := public.app_start_session('simulado', p_filters, p_count, p_time_limit_seconds);
  if (v ->> 'count')::int < 30 then
    raise exception 'Com esses filtros há só % questões; o simulado TRI precisa de pelo menos 30 questões.', v ->> 'count'
      using errcode = '22023';
  end if;
  update public.practice_sessions
    set config = config || jsonb_build_object('scoring', 'irt', 'scoring_version', 1)
    where id = (v ->> 'session_id')::uuid;
  return v || jsonb_build_object('scoring', 'irt');
end
$$;
revoke execute on function public.app_start_simulado_tri(jsonb, integer, integer) from public, anon;
grant execute on function public.app_start_simulado_tri(jsonb, integer, integer) to authenticated;
