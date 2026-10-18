-- Desfaz a 20261003013940_comunicados_editar_apagar.sql (editar, apagar e restaurar comunicados; editor profissional no comunicado).
-- Volta tudo ao que era na 013830 (Central de Notificações), com as mesmas funções e assinaturas.
-- ATENÇÃO, antes de colar:
--   * os comunicados APAGADOS são retirados de vez dos alunos (as notificações deles são excluídas), para não voltarem ao sino;
--     o registro do comunicado na Administração fica (sem a marca de apagado);
--   * a formatação (negrito, listas, títulos) some: o aluno passa a ver o texto puro (os links aparecem como [texto](endereço));
--   * o histórico de versões (comunicados_historico) é apagado; o registro geral (admin_audit_log) continua com as edições.
-- Pode ser colado de novo sem erro.

-- 1) apagados saem de vez do aluno (sem a coluna apagado_em eles voltariam a aparecer)
do $d$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'avisos_aluno' and column_name = 'apagado_em') then
    execute 'delete from public.avisos_aluno where apagado_em is not null';
  end if;
end
$d$;

-- 2) funções novas saem; as alteradas voltam à 013830
drop function if exists public.app_admin_comunicado_historico(bigint);
drop function if exists public.app_admin_comunicado_restaurar(bigint);
drop function if exists public.app_admin_comunicado_apagar(bigint, text);
drop function if exists public.app_admin_comunicado_editar(bigint, text, text, text, jsonb, text, text, integer);
drop function if exists public.app_admin_comunicado_enviar(text, text, text, text, text, text, jsonb);
drop function if exists public.app_admin_comunicados(integer, text);
drop function if exists public.comunicado_admin_linha(bigint);
drop function if exists public.comunicado_conferir_texto(text, text, text, jsonb);
drop function if exists public.comunicado_foto(jsonb);

-- (corpos abaixo copiados da 013830, sem mudança)
create or replace function public.app_minhas_notificacoes(p_limite integer default 30) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if public.user_has_full_access(v_user) then
    return jsonb_build_object('itens', '[]'::jsonb, 'nao_lidas', 0, 'aluno', false);
  end if;
  perform public.notificacao_contrato_sincronizar(v_user);
  -- aviso de cobrança já resolvido (pago, aceito) ou pagamento que falhou / acesso pausado vencido: fica lido sozinho
  update public.avisos_aluno a set visto_em = now()
  where a.user_id = v_user and a.visto_em is null and a.tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado')
    and (public.aviso_resolvido(a.user_id, a.tipo, a.chave, a.criado_em)
         or (a.tipo <> 'renovacao' and not public.aviso_urgente_ativo(a.user_id, a.tipo, a.chave, a.criado_em)));
  return jsonb_build_object(
    'aluno', true,
    'nao_lidas', (select count(*) from public.avisos_aluno a where a.user_id = v_user
                    and (a.visto_em is null or public.aviso_urgente_ativo(a.user_id, a.tipo, a.chave, a.criado_em))),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'rota', a.rota, 'link', a.link,
                         'acao', public.notificacao_acao(a.tipo, a.rota, a.titulo), 'em', a.criado_em,
                         'urgente', a.urgente, 'lida', a.visto_em is not null and not a.urgente)
                       order by a.urgente desc, a.criado_em desc, a.id desc)
                     from (select x.*, public.aviso_urgente_ativo(x.user_id, x.tipo, x.chave, x.criado_em) as urgente
                           from public.avisos_aluno x where x.user_id = v_user
                           order by public.aviso_urgente_ativo(x.user_id, x.tipo, x.chave, x.criado_em) desc, x.criado_em desc, x.id desc
                           limit least(100, greatest(1, coalesce(p_limite, 30)))) a), '[]'::jsonb));
end
$$;

-- Marca como lidas as próprias (p_ids nulo = todas). Devolve quantas mudaram. Nunca toca nas de outro aluno nem nos avisos urgentes
-- ainda sem solução (esses só saem quando o aluno resolve).
create or replace function public.app_notificacoes_lidas(p_ids bigint[] default null) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid()); n integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  update public.avisos_aluno set visto_em = now()
  where user_id = v_user and visto_em is null and (p_ids is null or id = any (p_ids))
    and not public.aviso_urgente_ativo(user_id, tipo, chave, criado_em);
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.app_admin_comunicado_enviar(p_titulo text, p_texto text, p_link text, p_publico text, p_filtro text, p_idem text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_texto text := btrim(coalesce(p_texto, ''));
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  c public.comunicados_equipe;
  n integer;
begin
  if not public.is_admin() then raise exception 'Só administradores.' using errcode = '42501'; end if;
  perform public.comunicado_validar(p_publico, p_filtro);
  if char_length(v_titulo) not between 3 and 140 then raise exception 'O título precisa ter de 3 a 140 letras.' using errcode = '22023'; end if;
  if char_length(v_texto) not between 3 and 600 then raise exception 'O texto precisa ter de 3 a 600 letras.' using errcode = '22023'; end if;
  if v_link like '/novo/%' then v_link := substr(v_link, 6); end if;
  if v_link is not null and not ((v_link ~ '^/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$' or v_link ~ '^https://[^\s<>"]+$') and char_length(v_link) <= 300) then
    raise exception 'O link precisa ser uma tela do app (ex.: /atualizacoes) ou um endereço https://.' using errcode = '22023';
  end if;
  if p_idem is null or char_length(p_idem) not between 8 and 100 then raise exception 'Pedido inválido.' using errcode = '22023'; end if;

  select * into c from public.comunicados_equipe where idem_chave = p_idem;
  if found then return to_jsonb(c) || jsonb_build_object('repetido', true); end if;

  insert into public.comunicados_equipe (titulo, texto, link, publico, filtro, idem_chave, enviado_por)
  values (v_titulo, v_texto, v_link, p_publico, p_filtro, p_idem, (select auth.uid()))
  returning * into c;

  insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rota, link, comunicado_id, email_status)
  select u, 'comunicado', 'comunicado:' || c.id, v_titulo, v_texto, case when v_link is null then 'nenhuma' else 'link' end, v_link, c.id, 'so_tela'
  from public.comunicado_alunos(p_publico, p_filtro) u
  on conflict (user_id, chave) do nothing;
  get diagnostics n = row_count;

  update public.comunicados_equipe set destinatarios = n where id = c.id returning * into c;
  perform public.admin_log('comunicado.enviar', c.id::text,
    jsonb_build_object('titulo', v_titulo, 'publico', p_publico, 'filtro', p_filtro, 'destinatarios', n));
  return to_jsonb(c) || jsonb_build_object('repetido', false);
end
$$;

-- Comunicados enviados (mais novo primeiro), com quem enviou e quantos alunos já leram.
create or replace function public.app_admin_comunicados(p_limite integer default 30) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Só administradores.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
             'id', c.id, 'titulo', c.titulo, 'texto', c.texto, 'link', c.link, 'publico', c.publico, 'filtro', c.filtro,
             'destinatarios', c.destinatarios, 'enviado_em', c.enviado_em,
             'enviado_por', coalesce(nullif(btrim(p.name), ''), u.email, 'Conta apagada'),
             'lidas', (select count(*) from public.avisos_aluno a where a.comunicado_id = c.id and a.visto_em is not null))
           order by c.enviado_em desc, c.id desc)
         from (select * from public.comunicados_equipe order by enviado_em desc, id desc limit least(100, greatest(1, coalesce(p_limite, 30)))) c
         left join auth.users u on u.id = c.enviado_por
         left join public.profiles p on p.id = c.enviado_por), '[]'::jsonb);
end
$$;

revoke execute on function public.app_minhas_notificacoes(integer) from public, anon;
grant execute on function public.app_minhas_notificacoes(integer) to authenticated;
revoke execute on function public.app_notificacoes_lidas(bigint[]) from public, anon;
grant execute on function public.app_notificacoes_lidas(bigint[]) to authenticated;
revoke execute on function public.app_admin_comunicado_enviar(text, text, text, text, text, text) from public, anon;
grant execute on function public.app_admin_comunicado_enviar(text, text, text, text, text, text) to authenticated;
revoke execute on function public.app_admin_comunicados(integer) from public, anon;
grant execute on function public.app_admin_comunicados(integer) to authenticated;

-- 3) regra de leitura do aluno volta à da 013760
drop policy if exists "avisos do aluno: ler os próprios" on public.avisos_aluno;
create policy "avisos do aluno: ler os próprios" on public.avisos_aluno
  for select to authenticated using (user_id = (select auth.uid()));

-- 4) histórico, colunas e regras novas
drop table if exists public.comunicados_historico;
drop index if exists public.avisos_aluno_comunicado_idx;
drop index if exists public.comunicados_equipe_apagados_idx;
alter table public.avisos_aluno drop constraint if exists avisos_aluno_rico_check;
alter table public.avisos_aluno drop column if exists apagado_em;
alter table public.avisos_aluno drop column if exists editado_em;
alter table public.avisos_aluno drop column if exists rico;
alter table if exists public.comunicados_equipe drop constraint if exists comunicados_equipe_rico_check;
alter table if exists public.comunicados_equipe drop constraint if exists comunicados_equipe_apagado_motivo_check;
alter table if exists public.comunicados_equipe drop column if exists apagado_motivo;
alter table if exists public.comunicados_equipe drop column if exists apagado_por;
alter table if exists public.comunicados_equipe drop column if exists apagado_em;
alter table if exists public.comunicados_equipe drop column if exists editado_por;
alter table if exists public.comunicados_equipe drop column if exists editado_em;
alter table if exists public.comunicados_equipe drop column if exists versao;
alter table if exists public.comunicados_equipe drop column if exists rico;
drop function if exists public.comunicado_rico_ok(jsonb);
