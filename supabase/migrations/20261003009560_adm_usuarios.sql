-- Administração › Usuários (frente adm-usuarios, 2026-10-11). Pode ser colada de novo no Supabase sem erro
-- (create or replace) e não apaga nem altera nenhum dado.
--
-- US02  Excluir usuário que já aprovou/publicou conteúdo na Central de Conteúdo (ch_approvals.reviewer_id,
--       ch_publications.published_by/retired_by) ou conferiu um cartão de atualização de questão
--       (question_update_cards.reviewed_by, on delete restrict) era recusado pelo banco com erro técnico, e a tela
--       só dizia "Não foi possível concluir". Agora a função devolve o motivo em português e o que fazer.
--       Nenhum registro é apagado e a regra das chaves continua a mesma: o histórico de quem aprovou precisa ficar.
--       Parte da única versão anterior: 20261003001300_admin.sql (app_admin_delete_user).
-- US05  A lista e a ficha passam a trazer as áreas de revisão médica de cada pessoa (reviewer_areas), para a tela
--       mostrar o selo "Revisor médico". Parte da única versão anterior: 20261003001300_admin.sql (admin_user_row).
--       Só os administradores chegam aqui (app_admin_users/app_admin_user continuam com assert_admin; admin_user_row
--       não é chamável por ninguém de fora).

-- 1. US05 · admin_user_row ganha reviewer_areas (lista de códigos, vazia para quem não revisa)
-- (INT) Parte da versão de 20261003007710_correcoes_questoes_ajustes.sql (respondidas e acertos sem as anuladas), que esta migração, por vir depois, sobrescreveria.
create or replace function public.admin_user_row(p_user_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at,
    'name', p.name, 'phase', p.phase, 'exam_type', p.exam_type, 'target_edition', p.target_edition,
    'role', coalesce(r.role, 'student'),
    'plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'answered', (select count(*)::int from public.question_attempts a join public.questions q on q.id = a.question_id
                 where a.user_id = u.id and q.status <> 'annulled'),
    'correct', (select count(*)::int from public.question_attempts a join public.questions q on q.id = a.question_id
                where a.user_id = u.id and a.is_correct and q.status <> 'annulled'),
    'last_activity', greatest(
      (select max(a.answered_at) from public.question_attempts a where a.user_id = u.id),
      (select max(f.reviewed_at) from public.flashcard_reviews f where f.user_id = u.id)),
    'reviewer_areas', coalesce((select jsonb_agg(ra.area_code order by ra.area_code) from public.ch_reviewer_areas ra where ra.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles r on r.user_id = u.id
  left join public.subscriptions s on s.user_id = u.id
  where u.id = p_user_id
$$;
revoke execute on function public.admin_user_row(uuid) from public, anon, authenticated;

-- 2. US02 · app_admin_delete_user explica por que não pode excluir
create or replace function public.app_admin_delete_user(p_user_id uuid, p_confirm_email text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_table text;
begin
  perform public.assert_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'Para excluir a própria conta, use Conta › Privacidade e dados.' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) is distinct from lower(v_email) then
    raise exception 'Digite o e-mail do usuário para confirmar.' using errcode = '22023';
  end if;
  begin
    perform public.admin_log('user.delete', p_user_id::text, jsonb_build_object('email', v_email));
    delete from auth.users where id = p_user_id;
  exception when foreign_key_violation or restrict_violation then
    -- o bloco desfaz o registro acima: uma exclusão recusada não aparece como feita
    get stacked diagnostics v_table = table_name;
    raise exception '%', case
      when v_table in ('ch_approvals', 'ch_publications') then
        'Esta pessoa aprovou ou publicou conteúdo na Central de Conteúdo, e esse registro precisa ficar. Para encerrar o acesso dela sem perder o histórico, mude o papel para Aluno e o plano para Expirado.'
      when v_table = 'question_update_cards' then
        'Esta pessoa conferiu cartões de atualização de questões, e esse registro precisa ficar. Para encerrar o acesso dela sem perder o histórico, mude o papel para Aluno e o plano para Expirado.'
      else
        'Esta pessoa tem registros no sistema que precisam ficar. Para encerrar o acesso dela sem perder o histórico, mude o papel para Aluno e o plano para Expirado.'
    end using errcode = '23001';
  end;
  return true;
end
$$;
revoke execute on function public.app_admin_delete_user(uuid, text) from public, anon;
