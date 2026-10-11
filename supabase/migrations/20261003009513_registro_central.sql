-- =============================================================================
-- Administração › Registro, correção RG01 (11/10/2026): o que se faz na Central de Conteúdo aparece no Registro.
--
-- Antes: a Central de Conteúdo grava o que a equipe faz (aprovar e publicar conteúdo para o aluno, retirar conteúdo,
-- nomear revisor médico, mudar o gabarito oficial, salvar e conferir atualização, ligar e desligar chaves...) numa tabela
-- própria, ch_audit, que nenhuma tela mostrava, e o Registro prometia que "toda alteração aparece aqui".
-- Agora: app_admin_audit_page (da …9512) junta as duas listas, ordenadas pelo instante, com os mesmos filtros e a mesma
-- paginação. Cada linha diz de onde veio (source = 'administracao' ou 'central') e tem uma chave única (key), porque os
-- números de linha das duas tabelas se repetem.
--  * O que as duas tabelas guardam juntas (mesma ação, mesmo alvo, mesmo instante: por exemplo o gabarito oficial, que a
--    …7700 grava nas duas) aparece uma vez só, com a linha da Administração, que é a mais completa.
--  * title: além de aulas e episódios (…9511), o nome do conteúdo da Central (título e versão), do documento e da fonte.
--  * subject: também as áreas de um revisor médico (reviewer.areas) dizem de quem foram.
-- Os dados não são mexidos e nada é copiado de uma tabela para a outra. Quem lê continua sendo só o administrador (a
-- tabela ch_audit já era só dele). Pode ser colada de novo sem erro (create or replace e revoke).
-- Partem da versão mais nova de cada função (grep em todas as migrações): admin_audit_title, admin_audit_subject e
-- app_admin_audit_page, todas da faixa …9511 e …9512 deste mesmo grupo de correções. Colar depois da 9512.
-- =============================================================================

create or replace function public.admin_audit_title(p_action text, p_target text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kind constant text := split_part(coalesce(p_action, ''), '.', 1);
  v_title text;
begin
  if p_target is null then return null; end if;
  -- Central de Conteúdo: o alvo é a versão do conteúdo, o documento ou a fonte
  if p_action in ('publish', 'retire', 'unit.regenerate', 'approval.invalidate') or p_action like 'approve.%' then
    select u.title || ' (versão ' || v.version || ')' into v_title
      from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id::text = p_target;
    return v_title;
  end if;
  if p_action in ('document.register', 'document.rights', 'license.clean_references', 'license.undo_clean_references') then
    select d.name into v_title from public.ch_documents d where d.id::text = p_target;
    return v_title;
  end if;
  if p_action in ('source.register', 'source.authority', 'source.registry', 'source.change_resolved') then
    select s.title into v_title from public.ch_sources s where s.id::text = p_target;
    return v_title;
  end if;
  -- aulas e episódios; o alvo de "material de aula apagado" é o código do material (que já não existe), não o da aula
  if v_kind not in ('lesson', 'podcast') or p_action = 'lesson.material.delete' then return null; end if;
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

create or replace function public.admin_audit_subject(p_action text, p_target text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email text;
begin
  -- a exclusão da conta já guardou o e-mail dela no próprio registro: serve de pessoa (e o filtro por pessoa a encontra)
  if p_action = 'user.delete' then
    return (select nullif(btrim(g.details ->> 'email'), '') from public.admin_audit_log g
             where g.action = 'user.delete' and g.target = p_target order by g.id desc limit 1);
  end if;
  if p_action not in ('user.role', 'user.subscription', 'gamification.recalculate', 'reviewer.areas')
     or p_target is null or p_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select u.email into v_email from auth.users u where u.id = p_target::uuid;
  return v_email;
end
$$;

create or replace function public.app_admin_audit_page(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  f jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_action text := nullif(btrim(coalesce(f ->> 'action', '')), '');
  v_person text := nullif(lower(btrim(coalesce(f ->> 'person', ''))), '');
  v_from date;
  v_to date;
  v_total integer;
  v_items jsonb;
begin
  perform public.assert_admin();
  begin
    v_from := nullif(btrim(coalesce(f ->> 'from', '')), '')::date;
    v_to := nullif(btrim(coalesce(f ->> 'to', '')), '')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Data inválida: use o formato dia/mês/ano.' using errcode = '22023';
  end;

  with every as (
    select 'administracao'::text as src, l.id, l.action, l.target, l.details, l.created_at, l.actor_id from public.admin_audit_log l
    union all
    -- a Central, sem o que a Administração já guardou junto (mesma ação, alvo e instante)
    select 'central'::text, c.id, c.action, c.target, c.details, c.created_at, c.actor_id from public.ch_audit c
     where not exists (select 1 from public.admin_audit_log a where a.action = c.action and a.target is not distinct from c.target and a.created_at = c.created_at)
  ),
  hit as (
    select e.*
      from every e
      left join auth.users u on u.id = e.actor_id
     where (v_action is null or e.action = v_action)
       and (v_from is null or (e.created_at at time zone 'America/Sao_Paulo')::date >= v_from)
       and (v_to is null or (e.created_at at time zone 'America/Sao_Paulo')::date <= v_to)
       and (v_person is null
            or position(v_person in lower(coalesce(u.email, ''))) > 0
            or position(v_person in lower(coalesce(public.admin_audit_subject(e.action, e.target), ''))) > 0)
  )
  select (select count(*)::integer from hit),
         coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'key', case p.src when 'central' then 'c:' else 'a:' end || p.id, 'source', p.src,
                                                       'action', p.action, 'target', p.target, 'details', p.details,
                                                       'created_at', p.created_at, 'actor', u.email,
                                                       'title', public.admin_audit_title(p.action, p.target),
                                                       'subject', public.admin_audit_subject(p.action, p.target))
                                   order by p.created_at desc, p.id desc, p.src)
                     from (select h.* from hit h order by h.created_at desc, h.id desc, h.src limit v_limit offset v_offset) p
                     left join auth.users u on u.id = p.actor_id), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object(
    'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'actions', (select coalesce(jsonb_agg(a order by a), '[]'::jsonb)
                  from (select action as a from public.admin_audit_log union select action from public.ch_audit) x),
    'items', v_items);
end
$$;

revoke execute on function public.app_admin_audit_page(jsonb, integer, integer) from public, anon;
revoke execute on function public.admin_audit_title(text, text) from public, anon, authenticated;
revoke execute on function public.admin_audit_subject(text, text) from public, anon, authenticated;
