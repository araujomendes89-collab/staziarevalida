-- =============================================================================
-- Administração › Registro, correções RG03 e RG02 (11/10/2026): o Registro diz de qual aula ou episódio foi a ação e
-- de quem foi o papel ou o plano alterado.
--
--  * RG03 (título): "Aula apagada" e "Podcast tirado do ar" só guardam o código do item. O banco passa a devolver, junto de
--    cada linha do Registro, o título da aula ou do episódio (campo "title"): o de agora, se o item ainda existe; se já foi
--    apagado, o último título que o próprio Registro guardou ao salvar (lesson.save e podcast.save). O nome e o resumo em
--    português de cada ação estão na tela (src/novo/app/admin/auditLog.js).
--  * RG02 (pessoa): papel e plano alterados só guardam o código da conta. O banco devolve o e-mail da pessoa afetada
--    (campo "subject"), buscado na hora de mostrar: nada é copiado para o registro (sem novo dado pessoal guardado) e as
--    linhas que já existem também passam a mostrar a pessoa. Se a conta foi apagada, vem vazio e a tela diz "conta
--    excluída" (a exclusão guarda o e-mail no próprio registro). Só o administrador chama a função (como sempre): o
--    e-mail não sai para mais ninguém.
--
-- Nada nos dados é mexido. Pode ser colada de novo no Supabase sem erro (create or replace e revoke).
-- app_admin_audit parte da versão de …1300_admin.sql (a única; conferido com grep em todas as migrações), com
-- security definer e search_path vazio. Os campos antigos continuam iguais: a tela antiga ignora os novos.
-- =============================================================================

-- Título da aula ou do episódio de uma linha do Registro (vazio para as outras ações).
create or replace function public.admin_audit_title(p_action text, p_target text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind constant text := split_part(coalesce(p_action, ''), '.', 1);
  v_title text;
begin
  -- o alvo de "material de aula apagado" é o código do material (que já não existe), não o da aula
  if p_target is null or v_kind not in ('lesson', 'podcast') or p_action = 'lesson.material.delete' then return null; end if;
  if v_kind = 'lesson' then
    select l.title into v_title from public.lessons l where l.id::text = p_target;
  else
    select e.title into v_title from public.podcasts e where e.id::text = p_target;
  end if;
  if v_title is not null then return v_title; end if;
  -- item já apagado: o último título que o próprio registro guardou ao salvar
  select nullif(btrim(g.details ->> 'title'), '') into v_title
    from public.admin_audit_log g
   where g.target = p_target and g.action = v_kind || '.save'
   order by g.id desc limit 1;
  return v_title;
end
$$;

-- E-mail da pessoa afetada por uma ação do Registro (vazio se a ação não é sobre uma conta ou se a conta já foi apagada).
create or replace function public.admin_audit_subject(p_action text, p_target text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email text;
begin
  if p_action not in ('user.role', 'user.subscription', 'gamification.recalculate')
     or p_target is null or p_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select u.email into v_email from auth.users u where u.id = p_target::uuid;
  return v_email;
end
$$;

create or replace function public.app_admin_audit(p_limit integer default 100) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'target', l.target, 'details', l.details,
                                        'created_at', l.created_at, 'actor', u.email,
                                        'title', public.admin_audit_title(l.action, l.target),
                                        'subject', public.admin_audit_subject(l.action, l.target)) order by l.id desc)
    from (select * from public.admin_audit_log order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) l
    left join auth.users u on u.id = l.actor_id
  ), '[]'::jsonb);
end
$$;

-- Só quem está logado chama (e a função confere que é administrador); as duas auxiliares são internas.
revoke execute on function public.app_admin_audit(integer) from public, anon;
revoke execute on function public.admin_audit_title(text, text) from public, anon, authenticated;
revoke execute on function public.admin_audit_subject(text, text) from public, anon, authenticated;
