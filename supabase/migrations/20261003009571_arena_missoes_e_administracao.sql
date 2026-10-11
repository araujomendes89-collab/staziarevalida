-- =============================================================================
-- AR04 (2026-10-11): o alvo padrão das Missões editado na Administração passa a valer.
-- Antes, toda missão lia o alvo de uma regra da aba Regras (missions.*) e o campo da aba Missões era ignorado.
-- Agora, salvar o alvo grava também a regra que o motor lê, e a lista mostra o alvo que vale de verdade.
-- Vale para as missões geradas daqui para a frente; as de hoje e da semana já geradas para os alunos não mudam.
-- Alvo zero completaria a missão de graça: o alvo precisa ser um número inteiro maior que zero.
-- =============================================================================

create or replace function public.app_admin_gamification_save_mission(p_mission jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(p_mission, '{}'::jsonb);
  v_row public.missions;
  v_target numeric;
begin
  perform public.assert_admin();
  select * into v_row from public.missions where slug = m ->> 'slug';
  if not found then raise exception 'Missão não encontrada.' using errcode = 'P0002'; end if;
  if m ? 'target_default' and jsonb_typeof(m -> 'target_default') <> 'null' then
    if jsonb_typeof(m -> 'target_default') <> 'number' then
      raise exception 'O alvo da missão precisa ser um número inteiro maior que zero.' using errcode = '22023';
    end if;
    v_target := (m ->> 'target_default')::numeric;
    if v_target < 1 or v_target <> trunc(v_target) or v_target > 1000000 then
      raise exception 'O alvo da missão precisa ser um número inteiro maior que zero.' using errcode = '22023';
    end if;
    if v_row.kind = 'accuracy' and v_target > 100 then
      raise exception 'O alvo da precisão precisa ficar entre 1 e 100.' using errcode = '22023';
    end if;
  end if;
  update public.missions set
    title = coalesce(m ->> 'title', title), target_default = coalesce(v_target::int, target_default),
    xp_reward = coalesce((m ->> 'xp_reward')::int, xp_reward), coins_reward = coalesce((m ->> 'coins_reward')::int, coins_reward),
    active = coalesce((m ->> 'active')::boolean, active)
    where slug = v_row.slug;
  if v_target is not null and v_row.target_rule is not null then
    update public.gamification_rules set value = to_jsonb(v_target::int), updated_at = now(), updated_by = (select auth.uid())
      where key = v_row.target_rule;
  end if;
  perform public.admin_log('gamification.mission', m ->> 'slug', m);
  return public.app_admin_gamification();
end
$$;

-- Administração (partida: a 20261003008100): igual, mas com o alvo real das missões.
create or replace function public.app_admin_gamification() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'rules', (select jsonb_agg(to_jsonb(r) order by r.key) from public.gamification_rules r),
    'rule_problems', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'problem', public.gam_rule_problem(r.key, r.value)) order by r.key)
                               from public.gamification_rules r where public.gam_rule_problem(r.key, r.value) is not null), '[]'::jsonb),
    'levels', (select jsonb_agg(to_jsonb(l) order by l.position) from public.levels l),
    'leagues', (select jsonb_agg(to_jsonb(l) order by l.position) from public.leagues l),
    'achievements', (select jsonb_agg(to_jsonb(a) order by a.category, a.position) from public.achievements a),
    -- AR04: o alvo mostrado é o que o motor usa de verdade (a regra, se estiver ligada e válida; senão o valor da própria missão)
    'missions', (select jsonb_agg(to_jsonb(m) || jsonb_build_object('target_default', coalesce(
                   (select (r.value #>> '{}')::numeric::int from public.gamification_rules r
                    where r.key = m.target_rule and r.enabled and public.gam_rule_problem(r.key, r.value) is null), m.target_default))
                 order by m.period, m.position) from public.missions m),
    'rewards', (select jsonb_agg(to_jsonb(x) order by x.position) from public.rewards x),
    'metrics', jsonb_build_object(
      'users_active', (select count(*) from public.user_gamification_stats where last_qualified_activity_at > now() - interval '7 days'),
      'users_total', (select count(*) from public.user_gamification_stats),
      'xp_today', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at >= public.today_br()::timestamptz),
      'xp_7d', (select coalesce(sum(xp_awarded), 0) from public.gamification_events where created_at > now() - interval '7 days'),
      'coins_issued', (select coalesce(sum(amount), 0) from public.coin_transactions where amount > 0),
      'missions_completed_7d', (select count(*) from public.user_missions where completed_at > now() - interval '7 days'),
      'achievements_7d', (select count(*) from public.user_achievements where unlocked_at > now() - interval '7 days'),
      'avg_streak', (select round(avg(current_streak), 1) from public.user_gamification_stats where current_streak > 0),
      'suspicious_7d', (select count(*) from public.gamification_events where not is_valid and created_at > now() - interval '7 days'),
      'suspicious_by_reason', (select coalesce(jsonb_object_agg(x.r, x.n), '{}'::jsonb) from (select fraud_reason as r, count(*) as n from public.gamification_events where not is_valid group by 1) x),
      'by_league', (select coalesce(jsonb_object_agg(x.l, x.n), '{}'::jsonb) from (select coalesce(current_league, 'sem liga') as l, count(*) as n from public.user_gamification_stats group by 1) x),
      'top10', coalesce((select jsonb_agg(public.gam_board_row(b.user_id, null) || jsonb_build_object('rank', b.rank, 'user_id', b.user_id) order by b.rank)
                         from public.gam_board('geral') b where b.rank <= 10), '[]'::jsonb),
      'events_24h', (select count(*) from public.gamification_events where created_at > now() - interval '24 hours'),
      'season', (select to_jsonb(s) from public.league_seasons s where s.status = 'open' order by s.starts_on desc limit 1),
      'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.ran_at desc) from (select * from public.gamification_jobs order by ran_at desc limit 10) j), '[]'::jsonb),
      'xp_failures_7d', (select count(*) from public.gamification_failures where created_at > now() - interval '7 days'),
      'xp_failures_recent', coalesce((select jsonb_agg(jsonb_build_object('created_at', f.created_at, 'step', f.step, 'bad_rules', f.bad_rules, 'detail', f.detail) order by f.id desc)
                                      from (select * from public.gamification_failures order by id desc limit 5) f), '[]'::jsonb)));
end
$$;

revoke execute on function public.app_admin_gamification_save_mission(jsonb) from anon;
revoke execute on function public.app_admin_gamification() from anon;
