-- =============================================================================
-- Tempo de estudo por dia: mais opções na tela "Personalizar plano" (pedido do dono, 17/10/2026)
--
-- Opções da tela: 15 min, 30 min, 45 min, 1 h, 1 h 30, 2 h, 3 h, 4 h, 5 h ou mais.
-- O banco já aceita qualquer valor de 0 a 1440 minutos (profiles.daily_minutes), então não há check novo:
-- quem já escolheu 30, 60, 120 ou 180 continua com o mesmo tempo e com a MESMA quantidade de questões de antes.
--
-- Regra única de questões por dia (public.daily_question_target), agora usada também pelo Plano de hoje (app_today),
-- que antes repetia a tabela dentro da função:
--   até 15 min = 5   | até 30 min = 10 | até 45 min = 15 | até 60 min = 20 | até 90 min = 25
--   até 120 min = 30 | até 180 min = 50 | até 240 min = 65 | mais que isso (5 h ou mais) = 80
--   sem tempo definido = 20
-- Os degraus que já existiam (30 = 10, 60 = 20, 120 = 30, 180 = 50) ficam exatamente iguais; os novos preenchem
-- os intervalos (15, 45, 90) ou continuam o ritmo das 3 h (4 h = 65, 5 h ou mais = 80, cerca de 3,7 min por questão).
-- Cada tarefa do plano segue contando 2 min por questão (minutes = count * 2), como antes.
--
-- Corpo de app_today: o MESMO que está em produção (conferido em 17/10/2026 com pg_get_functiondef, igual ao da
-- migração 012300); a única mudança é trocar a tabela fixa pela chamada de daily_question_target.
-- Pode ser colada duas vezes (create or replace; nenhuma tabela é tocada).
-- =============================================================================
create or replace function public.daily_question_target(p_minutes integer) returns integer
  language sql immutable set search_path = ''
as $$
  select case
    when p_minutes is null then 20
    when p_minutes <= 15 then 5
    when p_minutes <= 30 then 10
    when p_minutes <= 45 then 15
    when p_minutes <= 60 then 20
    when p_minutes <= 90 then 25
    when p_minutes <= 120 then 30
    when p_minutes <= 180 then 50
    when p_minutes <= 240 then 65
    else 80
  end
$$;

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
  v_niv jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  -- Nivelamento: com o diagnóstico feito (15 ou 30), a área de maior prioridade PR_a define a tarefa de praticar.
  v_niv := public.app_nivelamento_prioridades();

  if coalesce(p_rebuild, false) then
    delete from public.plan_tasks where user_id = v_uid and day = v_day and done_at is null;
  end if;

  if v_niv is not null then
    delete from public.plan_tasks where user_id = v_uid and day = v_day and done_at is null and kind = 'praticar' and ref ->> 'reason' = 'diagnostic';
  end if;

  if not exists (select 1 from public.plan_tasks where user_id = v_uid and day = v_day and kind = 'praticar') then
    select p.daily_minutes into v_minutes from public.profiles p where p.id = v_uid;
    v_count := public.daily_question_target(v_minutes);
    select count(*)::int into v_attempts from public.question_attempts a where a.user_id = v_uid;

    if v_niv is not null then
      v_area := (v_niv -> 0 ->> 'area')::public.med_area;
      insert into public.plan_tasks (day, position, kind, title, ref, minutes)
      values (v_day, 1, 'praticar', format('%s questões de %s', v_count, public.area_label(v_area)),
              jsonb_build_object('count', v_count, 'area', v_area, 'reason', 'nivelamento',
                                 'proficiencia', v_niv -> 0 -> 'proficiencia',
                                 'prioridade', v_niv -> 0 -> 'prioridade',
                                 'dificuldade', v_niv -> 0 -> 'dificuldade'),
              v_count * 2);
    elsif v_attempts < 10 then
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

