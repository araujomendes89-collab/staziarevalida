-- =============================================================================
-- Administração › Registro, correção RG05 (11/10/2026): página e filtros.
--
-- Antes: a tela pedia "as últimas 200 ações" (app_admin_audit, no máximo 500) e não havia página seguinte nem filtro.
-- Agora: app_admin_audit_page devolve uma página do Registro com o total, a lista de tipos de ação que existem e os
-- filtros que a tela usa:
--   * action  = tipo de ação (nome técnico gravado, ex.: 'user.role');
--   * person  = pedaço do e-mail de quem fez OU da pessoa afetada (papel, plano, recálculo de pontos), sem diferença de
--               maiúsculas; % e _ valem como letras comuns;
--   * from/to = datas AAAA-MM-DD, as duas inclusive, pelo dia de Brasília.
-- Mais novo primeiro. Página de 1 a 200 linhas (padrão 50). Cada linha traz os mesmos campos de app_admin_audit
-- (inclusive title e subject, da …9511). app_admin_audit continua como está, para quem ainda a usa.
--
-- Só o administrador chama (como o Registro sempre foi). Nada nos dados é mexido. Pode ser colada de novo sem erro
-- (create or replace e revoke). Função nova: não há versão anterior; usa admin_audit_title e admin_audit_subject da …9511,
-- que precisa ter sido colada antes (security definer e search_path vazio).
-- =============================================================================

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

  with hit as (
    select l.id, l.action, l.target, l.details, l.created_at, l.actor_id
      from public.admin_audit_log l
      left join auth.users u on u.id = l.actor_id
     where (v_action is null or l.action = v_action)
       and (v_from is null or (l.created_at at time zone 'America/Sao_Paulo')::date >= v_from)
       and (v_to is null or (l.created_at at time zone 'America/Sao_Paulo')::date <= v_to)
       and (v_person is null
            or position(v_person in lower(coalesce(u.email, ''))) > 0
            or position(v_person in lower(coalesce(public.admin_audit_subject(l.action, l.target), ''))) > 0)
  )
  select (select count(*)::integer from hit),
         coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'action', p.action, 'target', p.target, 'details', p.details,
                                                       'created_at', p.created_at, 'actor', u.email,
                                                       'title', public.admin_audit_title(p.action, p.target),
                                                       'subject', public.admin_audit_subject(p.action, p.target)) order by p.created_at desc, p.id desc)
                     from (select h.* from hit h order by h.created_at desc, h.id desc limit v_limit offset v_offset) p
                     left join auth.users u on u.id = p.actor_id), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object(
    'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'actions', (select coalesce(jsonb_agg(a order by a), '[]'::jsonb) from (select distinct action as a from public.admin_audit_log) x),
    'items', v_items);
end
$$;

revoke execute on function public.app_admin_audit_page(jsonb, integer, integer) from public, anon;
