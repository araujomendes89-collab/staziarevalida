-- Desfaz a 20261003013950_comunicados_email_leitura.sql (leitura por versão e comunicado por e-mail). Volta às versões da 013940
-- (editar, apagar, lista), da 013830 (prévia) e da 013800 (fila de e-mails). A 013940 continua inteira.
-- ATENÇÃO, antes de colar:
--   * os e-mails de comunicado saem da fila (os que ainda não saíram não saem mais; a fila volta a aceitar só o aviso de conta
--     inativa); os códigos de descadastro (marketing_descadastro) são apagados: links de descadastro de e-mails já enviados deixam
--     de funcionar (a pessoa ainda pode desligar em Minha Conta → Privacidade e dados);
--   * a leitura NÃO volta: quem tinha lido uma versão antes de uma edição continua como "não lido" até ler de novo;
--     "lido antes da edição" some da Administração.
-- Pode ser colado de novo sem erro.

-- 1) e-mails de comunicado saem da fila
do $e$
begin
  if to_regclass('public.email_saida') is not null then
    execute 'delete from public.email_saida where kind = ''comunicado''';
  end if;
end
$e$;

-- 2) funções novas saem; as alteradas voltam às versões anteriores (corpos copiados sem mudança)
drop function if exists public.app_admin_comunicado_email(bigint);
drop function if exists public.ch_worker_marketing_descadastro(text, boolean);
drop function if exists public.comunicado_email_enfileirar(bigint);
drop function if exists public.comunicado_email_alunos(bigint);
drop function if exists public.email_saida_teto_dia();
drop function if exists public.marketing_token(uuid);

create or replace function public.ch_worker_email_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.email_saida
     set status = 'incerto', erro = 'O envio parou no meio; não foi repetido para não mandar duas vezes.'
   where status = 'enviando' and pego_em < now() - interval '15 minutes';

  update public.email_saida e
     set status = 'cancelado', erro = 'E-mail da conta não confirmado em 30 dias.'
   where e.status = 'pendente' and e.created_at < now() - interval '30 days' and not public.email_conta_confirmada(e.user_id);

  select array_agg(x.id) into v_ids
  from (
    select e.id
    from public.email_saida e
    where e.status = 'pendente' and e.kind = 'aviso_inatividade' and e.proxima_em <= now() and public.email_conta_confirmada(e.user_id)
    order by e.proxima_em, e.id
    limit greatest(1, least(coalesce(p_limite, 20), 100))
    for update of e skip locked
  ) x;
  if v_ids is null then
    return '[]'::jsonb;
  end if;

  update public.email_saida e
     set status = 'enviando', pego_em = now(), tentativas = e.tentativas + 1,
         payload = case when e.kind = 'aviso_inatividade' then e.payload || jsonb_build_object('prazo',
                     to_char(greatest(((e.payload ->> 'ultimo_acesso')::timestamptz at time zone 'America/Sao_Paulo')::date + interval '12 months' + interval '1 day',
                                      v_hoje + 31), 'YYYY-MM-DD'))
                    else e.payload end
   where e.id = any (v_ids);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'kind', e.kind, 'tentativas', e.tentativas, 'email', u.email,
             'nome', nullif(btrim(p.name), ''), 'payload', e.payload)
           order by e.id)
    from public.email_saida e
    join auth.users u on u.id = e.user_id
    left join public.profiles p on p.id = e.user_id
    where e.id = any (v_ids)), '[]'::jsonb);
end
$$;

create or replace function public.app_admin_comunicado_previa(p_publico text, p_filtro text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Só administradores.' using errcode = '42501'; end if;
  perform public.comunicado_validar(p_publico, p_filtro);
  return jsonb_build_object('destinatarios', (select count(*) from public.comunicado_alunos(p_publico, p_filtro)));
end
$$;

create or replace function public.comunicado_admin_linha(p_id bigint) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'titulo', c.titulo, 'texto', c.texto, 'rico', c.rico, 'link', c.link, 'publico', c.publico, 'filtro', c.filtro,
    'destinatarios', c.destinatarios, 'enviado_em', c.enviado_em,
    'enviado_por', coalesce(nullif(btrim(pe.name), ''), ue.email, 'Conta apagada'),
    'lidas', (select count(*) from public.avisos_aluno a where a.comunicado_id = c.id and a.visto_em is not null),
    'versao', c.versao, 'editado_em', c.editado_em,
    'editado_por', case when c.editado_em is null then null else coalesce(nullif(btrim(pd.name), ''), ud.email, 'Conta apagada') end,
    'apagado_em', c.apagado_em, 'apagado_motivo', c.apagado_motivo,
    'apagado_por', case when c.apagado_em is null then null else coalesce(nullif(btrim(pa.name), ''), ua.email, 'Conta apagada') end,
    -- comunicado nunca vai por e-mail (013830: so_tela); fica na resposta para a tela dizer isso com certeza
    'por_email', exists (select 1 from public.avisos_aluno a where a.comunicado_id = c.id and a.email_status <> 'so_tela'))
  from public.comunicados_equipe c
  left join auth.users ue on ue.id = c.enviado_por left join public.profiles pe on pe.id = c.enviado_por
  left join auth.users ud on ud.id = c.editado_por left join public.profiles pd on pd.id = c.editado_por
  left join auth.users ua on ua.id = c.apagado_por left join public.profiles pa on pa.id = c.apagado_por
  where c.id = p_id
$$;

create or replace function public.app_admin_comunicado_editar(p_id bigint, p_titulo text, p_texto text, p_link text, p_rico jsonb default null,
                                                              p_publico text default null, p_filtro text default null, p_versao integer default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.comunicados_equipe;
  d public.comunicados_equipe;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_texto text := btrim(coalesce(p_texto, ''));
  v_rico jsonb := case when jsonb_typeof(p_rico) = 'null' then null else p_rico end;
  v_link text;
  v_muda_publico boolean;
  n integer;
begin
  perform public.assert_admin();
  select * into c from public.comunicados_equipe where id = p_id for update;
  if not found then raise exception 'Comunicado não encontrado.' using errcode = 'P0002'; end if;
  if c.apagado_em is not null then raise exception 'Este comunicado está apagado. Restaure antes de editar.' using errcode = '22023'; end if;
  if p_versao is not null and p_versao <> c.versao then
    raise exception 'Outra pessoa da equipe editou este comunicado agora há pouco. Feche e abra de novo para ver a versão atual.' using errcode = '40001';
  end if;
  v_link := public.comunicado_conferir_texto(v_titulo, v_texto, p_link, v_rico);
  v_muda_publico := p_publico is not null and (p_publico, p_filtro) is distinct from (c.publico, c.filtro);

  if not v_muda_publico and v_titulo = c.titulo and v_texto = c.texto and v_rico is not distinct from c.rico and v_link is not distinct from c.link then
    return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', false);
  end if;

  if v_muda_publico then
    perform public.comunicado_validar(p_publico, p_filtro);
    -- trava as notificações deste comunicado (ninguém marca como lida no meio) e confere que ninguém leu
    perform 1 from public.avisos_aluno where comunicado_id = p_id for update;
    if exists (select 1 from public.avisos_aluno where comunicado_id = p_id and visto_em is not null) then
      raise exception 'Algum aluno já leu este comunicado: o público não pode mais mudar. Edite só o título e o texto.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.comunicado_alunos(p_publico, p_filtro)) then
      raise exception 'Nenhum aluno neste público. Escolha outro.' using errcode = '22023';
    end if;
    delete from public.avisos_aluno where comunicado_id = p_id;
    insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rico, rota, link, comunicado_id, email_status, editado_em)
    select u, 'comunicado', 'comunicado:' || c.id, v_titulo, v_texto, v_rico, case when v_link is null then 'nenhuma' else 'link' end, v_link, c.id, 'so_tela', now()
    from public.comunicado_alunos(p_publico, p_filtro) u
    on conflict (user_id, chave) do nothing;
    get diagnostics n = row_count;
  else
    update public.avisos_aluno set titulo = v_titulo, texto = v_texto, rico = v_rico, link = v_link,
                                   rota = case when v_link is null then 'nenhuma' else 'link' end, editado_em = now()
    where comunicado_id = p_id;
    n := c.destinatarios;
  end if;

  update public.comunicados_equipe set titulo = v_titulo, texto = v_texto, rico = v_rico, link = v_link,
         publico = case when v_muda_publico then p_publico else publico end,
         filtro = case when v_muda_publico then p_filtro else filtro end,
         destinatarios = n, versao = versao + 1, editado_em = now(), editado_por = (select auth.uid())
  where id = p_id returning * into d;

  insert into public.comunicados_historico (comunicado_id, acao, versao, antes, depois, por)
  values (p_id, 'editar', d.versao, public.comunicado_foto(to_jsonb(c)), public.comunicado_foto(to_jsonb(d)), (select auth.uid()));
  perform public.admin_log('comunicado.editar', p_id::text,
    jsonb_build_object('titulo', v_titulo, 'titulo_antes', c.titulo, 'versao', d.versao, 'publico', d.publico, 'filtro', d.filtro,
                       'mudou_publico', v_muda_publico, 'destinatarios', d.destinatarios));
  return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', true);
end
$$;

create or replace function public.app_admin_comunicado_apagar(p_id bigint, p_motivo text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.comunicados_equipe;
  d public.comunicados_equipe;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform public.assert_admin();
  if char_length(v_motivo) > 300 then raise exception 'O motivo pode ter até 300 letras.' using errcode = '22023'; end if;
  select * into c from public.comunicados_equipe where id = p_id for update;
  if not found then raise exception 'Comunicado não encontrado.' using errcode = 'P0002'; end if;
  if c.apagado_em is not null then return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', false); end if;

  update public.avisos_aluno set apagado_em = now() where comunicado_id = p_id and apagado_em is null;
  update public.comunicados_equipe set apagado_em = now(), apagado_por = (select auth.uid()), apagado_motivo = v_motivo
  where id = p_id returning * into d;
  insert into public.comunicados_historico (comunicado_id, acao, versao, antes, depois, motivo, por)
  values (p_id, 'apagar', d.versao, public.comunicado_foto(to_jsonb(c)), public.comunicado_foto(to_jsonb(d)), v_motivo, (select auth.uid()));
  perform public.admin_log('comunicado.apagar', p_id::text, jsonb_build_object('titulo', c.titulo, 'motivo', v_motivo, 'destinatarios', c.destinatarios));
  return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', true);
end
$$;

-- 3) regras, tabela e colunas novas
drop table if exists public.marketing_descadastro;
drop index if exists public.email_saida_comunicado_idx;
drop index if exists public.email_saida_pego_idx;
do $k$
begin
  if to_regclass('public.email_saida') is not null then
    alter table public.email_saida drop constraint if exists email_saida_kind_check;
    alter table public.email_saida add constraint email_saida_kind_check check (kind in ('aviso_inatividade'));
  end if;
end
$k$;
alter table if exists public.comunicados_equipe drop column if exists email_em;
alter table if exists public.comunicados_equipe drop column if exists por_email;
alter table if exists public.comunicados_equipe drop column if exists lido_alguma_vez;
alter table if exists public.comunicados_equipe drop column if exists lidas_antes;
