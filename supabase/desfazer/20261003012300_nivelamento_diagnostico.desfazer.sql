-- DESFAZER da 20261003012300_nivelamento_diagnostico.sql (pode rodar mais de uma vez).
-- 1) Devolve app_today ao corpo da 20261003000800_home_api.sql, que é o mesmo de produção antes do nivelamento
--    (conferido em 16/10/2026 com pg_get_functiondef). Vem PRIMEIRO para o Plano de hoje nunca chamar uma função já apagada.
-- 2) Apaga as funções do nivelamento.
-- 3) Os dados (diagnósticos, itens e proficiência dos alunos) FICAM guardados. Para apagar também, tire o "-- " das 4
--    últimas linhas (não tem volta).
-- As tarefas de hoje já criadas com reason 'nivelamento' continuam no plano até o fim do dia (são tarefas comuns de praticar).

create or replace function public.app_today(p_rebuild boolean default false) returns jsonb
  language plpgsql set search_path = ''
as $$
declare
  v_uid constant uuid := (select auth.uid());
  v_day constant date := public.today_br();
  v_minutes integer;
  v_count integer;
  v_attempts integer;
  v_wrong integer;
  v_area public.med_area;
  v_area_attempts integer;
  v_area_accuracy numeric;
begin
  if v_uid is null then
    return null;
  end if;

  if coalesce(p_rebuild, false) then
    delete from public.plan_tasks where user_id = v_uid and day = v_day and done_at is null;
  end if;

  if not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'praticar') then
    select p.daily_minutes into v_minutes from public.profiles p where p.id = v_uid;
    v_count := case
      when v_minutes is null then 20
      when v_minutes <= 30 then 10
      when v_minutes <= 60 then 20
      when v_minutes <= 120 then 30
      else 50
    end;
    select count(*)::int into v_attempts from public.question_attempts a where a.user_id = v_uid;

    if v_attempts < 10 then
      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', 'Diagnóstico inicial: 10 questões nas 5 grandes áreas',
              jsonb_build_object('count', 10, 'reason', 'diagnostic'), 20);
    else
      select x.area, x.attempts, x.accuracy into v_area, v_area_attempts, v_area_accuracy
      from (
        select e.area, coalesce(st.attempts, 0) as attempts, st.accuracy
        from unnest(enum_range(null::public.med_area)) as e (area)
        left join public.my_area_stats st on st.area = e.area
      ) x
      order by (x.attempts < 5) desc, case when x.attempts < 5 then x.attempts end, x.accuracy nulls first, x.area
      limit 1;

      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', format('%s questões de %s', v_count, public.area_label(v_area)),
              jsonb_build_object('count', v_count, 'area', v_area,
                                 'reason', case when v_area_attempts < 5 then 'untrained' else 'lowest_accuracy' end,
                                 'attempts', v_area_attempts, 'accuracy', v_area_accuracy),
              v_count * 2);
    end if;
  end if;

  -- Revisão: enquanto não for concluída, a meta acompanha o caderno de erros
  -- (o que já foi revisto hoje + o que ainda está pendente, até 10 por dia).
  select count(*)::int into v_wrong from public.my_error_notebook e where e.status = 'para_revisar';

  update public.plan_tasks t
    set ref = t.ref || jsonb_build_object('count', n.target),
        title = case when n.target = 1 then 'Rever 1 questão errada' else format('Rever %s questões erradas', n.target) end,
        minutes = n.target * 2
    from (
      select t2.id, least(public.plan_task_progress(t2) + v_wrong, 10) as target
      from public.plan_tasks t2
      where t2.user_id = v_uid and t2.day = v_day and t2.kind = 'revisar' and t2.done_at is null
    ) n
    where t.id = n.id and n.target > 0;

  -- Os erros foram superados por outro caminho: não sobra nada para rever.
  delete from public.plan_tasks t
    where t.user_id = v_uid and t.day = v_day and t.kind = 'revisar' and t.done_at is null
      and v_wrong = 0 and public.plan_task_progress(t) = 0;

  if v_wrong > 0
     and not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'revisar') then
    v_wrong := least(v_wrong, 10);
    insert into public.plan_tasks (day, position, kind, title, ref, minutes)
    values (v_day, 2, 'revisar',
            case when v_wrong = 1 then 'Rever 1 questão errada' else format('Rever %s questões erradas', v_wrong) end,
            jsonb_build_object('count', v_wrong, 'reason', 'errors'), v_wrong * 2);
  end if;

  -- Cumpriu a meta do dia: conclui sozinho (a não ser que o aluno tenha desmarcado à mão).
  update public.plan_tasks t
    set done_at = now()
    where t.user_id = v_uid and t.day = v_day and t.done_at is null and not (t.ref ? 'manual')
      and public.plan_task_progress(t) >= coalesce((t.ref ->> 'count')::integer, 1);

  return (
    select jsonb_build_object(
      'day', v_day,
      'done', count(*) filter (where t.done_at is not null)::int,
      'total', count(*)::int,
      'tasks', coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'kind', t.kind, 'title', t.title, 'minutes', t.minutes,
          'done', t.done_at is not null,
          'progress', least(public.plan_task_progress(t), coalesce((t.ref ->> 'count')::integer, 1)),
          'target', coalesce((t.ref ->> 'count')::integer, 1),
          'ref', t.ref - 'manual'
        ) order by t.position, t.created_at), '[]'::jsonb)
    )
    from public.plan_tasks t
    where t.user_id = v_uid and t.day = v_day
  );
end
$$;

drop function if exists public.app_admin_nivelamento_cobertura();
drop function if exists public.app_nivelamento_correcao();
drop function if exists public.app_nivelamento_adiar();
drop function if exists public.app_nivelamento_finalizar();
drop function if exists public.app_nivelamento_responder(integer, text);
drop function if exists public.app_nivelamento_continuar();
drop function if exists public.app_nivelamento_iniciar();
drop function if exists public.app_nivelamento_sessao();
drop function if exists public.app_nivelamento_prioridades();
drop function if exists public.app_nivelamento_estado();
drop function if exists public.nivelamento_estado_de(uuid);
drop function if exists public.nivelamento_sortear_bloco(uuid, uuid, smallint);
drop function if exists public.nivelamento_candidatas(uuid, public.med_area);
drop function if exists public.nivelamento_questao_view(text);
drop function if exists public.nivelamento_calcular(jsonb);
drop function if exists public.nivelamento_distribuicao(numeric);
drop function if exists public.nivelamento_classificar(numeric);
drop function if exists public.nivelamento_area_nome(public.med_area);
drop function if exists public.nivelamento_area_ordem(public.med_area);

-- APAGAR TAMBÉM OS DADOS (não tem volta)
-- drop table if exists public.nivelamento_proficiencia;
-- drop table if exists public.nivelamento_itens;
-- drop table if exists public.nivelamento_diagnosticos;
-- drop table if exists public.nivelamento_config;
