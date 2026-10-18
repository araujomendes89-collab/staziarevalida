-- =============================================================================
-- COMUNICADOS: LEITURA POR VERSÃO E E-MAIL (decisões do dono, 18/10/2026; ramo comunicados-editor). Vem DEPOIS da 013940
-- (editar, apagar, restaurar e editor profissional), que já está em produção e não muda.
--
--   * EDITAR VOLTA A "NÃO LIDO": mudar título, texto, formatação ou link zera a leitura (todos os alunos veem de novo como não lido,
--     com o selo "editado"). A Administração mostra quantos leram a versão atual (lidas) e "lido antes da edição: N" (lidas_antes).
--     O público só muda enquanto ninguém leu nenhuma versão (lido_alguma_vez) e o e-mail não saiu.
--   * COMUNICADO POR E-MAIL ("Enviar também por e-mail", no envio ou depois, na edição; uma vez só): app_admin_comunicado_email.
--     Vai pela fila de e-mails de serviço da 013800 (public.email_saida; rota /api/legal/email de 5 em 5 minutos; SMTP do Google
--     Workspace), SÓ para quem aceitou receber novidades (public.marketing_consents.opt_in, no onboarding ou em Minha Conta) e tem o
--     e-mail da conta confirmado. Os outros veem só no sino. O texto é montado na hora do envio (versão atual); o que já saiu não
--     muda e editar não reenvia. Apagar cancela o que ainda não saiu. Rodapé com link de descadastro (um clique + confirmação) e
--     cabeçalho List-Unsubscribe (página /api/legal/descadastro; função ch_worker_marketing_descadastro, só servidor).
--   * LIMITE DO GOOGLE WORKSPACE: 2.000 e-mails por dia por conta. A fila usa no máximo 1.500 por dia (email_saida_teto_dia), em
--     lotes de 20 a cada 5 minutos; o resto fica para o dia seguinte. Os 500 que sobram ficam para o que sai pela mesma conta fora
--     da fila (confirmação de cadastro e senha do Supabase, avisos de cobrança). O aviso de conta inativa sai antes do comunicado.
--   * Prévia (app_admin_comunicado_previa) diz também quantos recebem por e-mail; passa a usar assert_admin().
--
-- Sem mudança de assinatura das funções da 013940 (o site do commit 1278fcda continua funcionando com esta migração). Função nova:
-- app_admin_comunicado_email(bigint). Funções redefinidas: app_admin_comunicado_previa, app_admin_comunicado_editar,
-- app_admin_comunicado_apagar, comunicado_admin_linha e ch_worker_email_pegar (013800).
--
-- ADITIVA e pode ser colada de novo. Depende da 013940 e da 013800. Desfazer: supabase/desfazer/20261003013950_comunicados_email_leitura.desfazer.sql
-- (volta às versões da 013940/013800). Conferir: supabase/conferir/comunicados-email-leitura.sql.
-- =============================================================================

do $confere$
begin
  if to_regclass('public.comunicados_historico') is null or to_regprocedure('public.app_admin_comunicado_restaurar(bigint)') is null
     or to_regclass('public.email_saida') is null or to_regclass('public.marketing_consents') is null then
    raise exception '013950: aplique antes a 20261003013940_comunicados_editar_apagar.sql e a 20261003013800 (fila de e-mail); nada foi mudado';
  end if;
end
$confere$;

-- Leitura por versão (decisão do dono, 18/10): mudar título, texto, formatação ou link zera a leitura (volta a "não lida" para todos).
--   lidas_antes     = quantos tinham lido a versão anterior (a Administração mostra "lido antes da edição: N");
--   lido_alguma_vez = alguém já leu alguma versão (aí o público não muda mais).
-- E-mail (decisão do dono, 18/10): por_email / email_em = o comunicado foi também por e-mail (uma vez só; editar não reenvia).
alter table public.comunicados_equipe add column if not exists lidas_antes integer not null default 0;
alter table public.comunicados_equipe add column if not exists lido_alguma_vez boolean not null default false;
alter table public.comunicados_equipe add column if not exists por_email boolean not null default false;
alter table public.comunicados_equipe add column if not exists email_em timestamptz;

-- ---------------------------------------------------------------- e-mail do comunicado (fila de serviço da 013800)
-- Vai pela MESMA fila dos e-mails de serviço (public.email_saida; rota /api/legal/email de 5 em 5 minutos; SMTP do Workspace).
-- Só para quem aceitou receber novidades por e-mail (public.marketing_consents.opt_in = true: onboarding ou Minha Conta). Quem não
-- aceitou vê só no sino. O texto do e-mail é montado NA HORA DO ENVIO a partir da versão atual (um e-mail ainda na fila sai com a
-- versão editada; o que já saiu não muda). Comunicado apagado ou pessoa que retirou o consentimento: o e-mail que ainda não saiu é
-- cancelado. Rodapé com link de descadastro (um clique + confirmação) e cabeçalho List-Unsubscribe.
alter table public.email_saida drop constraint if exists email_saida_kind_check;
alter table public.email_saida add constraint email_saida_kind_check check (kind in ('aviso_inatividade', 'comunicado'));
create index if not exists email_saida_comunicado_idx on public.email_saida (((payload ->> 'comunicado_id')::bigint)) where kind = 'comunicado';
create index if not exists email_saida_pego_idx on public.email_saida (pego_em) where pego_em is not null;

-- Endereço de descadastro de cada pessoa (um código aleatório por conta; o link do e-mail leva só o código, nunca o e-mail).
create table if not exists public.marketing_descadastro (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);
alter table public.marketing_descadastro enable row level security;
revoke all on public.marketing_descadastro from public, anon, authenticated;

create or replace function public.marketing_token(p_user uuid) returns text
  language plpgsql security definer set search_path = ''
as $$
declare v text;
begin
  select token into v from public.marketing_descadastro where user_id = p_user;
  if v is not null then return v; end if;
  insert into public.marketing_descadastro (user_id, token)
  values (p_user, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (user_id) do nothing;
  select token into v from public.marketing_descadastro where user_id = p_user;
  return v;
end
$$;
revoke execute on function public.marketing_token(uuid) from public, anon, authenticated;

-- LIMITE DIÁRIO DO GOOGLE WORKSPACE: uma conta manda até 2.000 e-mails por dia (smtp.gmail.com com senha de app; limite oficial
-- do Workspace por usuário, contando todos os destinatários). A fila usa no máximo 1.500 por dia (dia de Brasília), deixando 500
-- para o que sai pela mesma conta fora da fila: confirmação de cadastro e senha do Supabase (SMTP do Workspace, ligado 17/10) e os
-- avisos de cobrança (server/avisos). O aviso de conta inativa sai antes do comunicado. O que passar do limite fica na fila e sai
-- no dia seguinte (a tarefa roda de 5 em 5 minutos, em lotes de 20).
create or replace function public.email_saida_teto_dia() returns integer
  language sql immutable set search_path = ''
as $$ select 1500 $$;
revoke execute on function public.email_saida_teto_dia() from public, anon, authenticated;

-- Alunos de um comunicado que recebem o e-mail: na lista do comunicado, com consentimento e e-mail da conta confirmado.
create or replace function public.comunicado_email_alunos(p_comunicado bigint) returns setof uuid
  language sql stable security definer set search_path = ''
as $$
  select a.user_id from public.avisos_aluno a
  join public.marketing_consents m on m.user_id = a.user_id and m.opt_in
  where a.comunicado_id = p_comunicado and a.apagado_em is null and public.email_conta_confirmada(a.user_id)
$$;
revoke execute on function public.comunicado_email_alunos(bigint) from public, anon, authenticated;

-- Põe o e-mail do comunicado na fila (uma vez por aluno). Devolve quantos entraram.
create or replace function public.comunicado_email_enfileirar(p_comunicado bigint) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  insert into public.email_saida (kind, user_id, chave, payload)
  select 'comunicado', u, 'comunicado:' || p_comunicado || ':' || u, jsonb_build_object('comunicado_id', p_comunicado)
  from public.comunicado_email_alunos(p_comunicado) u
  on conflict (chave) do nothing;
  get diagnostics n = row_count;
  update public.comunicados_equipe set por_email = true, email_em = coalesce(email_em, now()) where id = p_comunicado;
  return n;
end
$$;
revoke execute on function public.comunicado_email_enfileirar(bigint) from public, anon, authenticated;

-- Fila (só serviço): a da 013800 com o comunicado, a ordem (aviso de conta inativa primeiro) e o limite do dia.
create or replace function public.ch_worker_email_pegar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio_dia constant timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_restante integer;
begin
  update public.email_saida
     set status = 'incerto', erro = 'O envio parou no meio; não foi repetido para não mandar duas vezes.'
   where status = 'enviando' and pego_em < now() - interval '15 minutes';

  update public.email_saida e
     set status = 'cancelado', erro = 'E-mail da conta não confirmado em 30 dias.'
   where e.status = 'pendente' and e.created_at < now() - interval '30 days' and not public.email_conta_confirmada(e.user_id);

  -- comunicado apagado, ou a pessoa retirou o consentimento: o e-mail que ainda não saiu não sai mais
  update public.email_saida e
     set status = 'cancelado', erro = 'Comunicado apagado.'
   where e.status = 'pendente' and e.kind = 'comunicado'
     and not exists (select 1 from public.comunicados_equipe c where c.id = (e.payload ->> 'comunicado_id')::bigint and c.apagado_em is null);
  update public.email_saida e
     set status = 'cancelado', erro = 'A pessoa não quer mais receber e-mails de novidades.'
   where e.status = 'pendente' and e.kind = 'comunicado'
     and not exists (select 1 from public.marketing_consents m where m.user_id = e.user_id and m.opt_in);

  -- limite do dia (Google Workspace): conta o que já foi pego hoje
  v_restante := public.email_saida_teto_dia() - (select count(*) from public.email_saida where pego_em >= v_inicio_dia)::integer;
  if v_restante <= 0 then
    return '[]'::jsonb;
  end if;

  select array_agg(x.id) into v_ids
  from (
    select e.id
    from public.email_saida e
    where e.status = 'pendente' and e.kind in ('aviso_inatividade', 'comunicado') and e.proxima_em <= now() and public.email_conta_confirmada(e.user_id)
    order by (e.kind <> 'aviso_inatividade'), e.proxima_em, e.id
    limit least(greatest(1, least(coalesce(p_limite, 20), 100)), v_restante)
    for update of e skip locked
  ) x;
  if v_ids is null then
    return '[]'::jsonb;
  end if;

  update public.email_saida e
     set status = 'enviando', pego_em = now(), tentativas = e.tentativas + 1,
         payload = case
                     when e.kind = 'aviso_inatividade' then e.payload || jsonb_build_object('prazo',
                       to_char(greatest(((e.payload ->> 'ultimo_acesso')::timestamptz at time zone 'America/Sao_Paulo')::date + interval '12 months' + interval '1 day',
                                        v_hoje + 31), 'YYYY-MM-DD'))
                     when e.kind = 'comunicado' then e.payload || coalesce((
                       select jsonb_build_object('titulo', c.titulo, 'texto', c.texto, 'rico', c.rico, 'link', c.link, 'versao', c.versao,
                                                 'descadastro', public.marketing_token(e.user_id))
                       from public.comunicados_equipe c where c.id = (e.payload ->> 'comunicado_id')::bigint), '{}'::jsonb)
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
revoke execute on function public.ch_worker_email_pegar(integer) from public, anon, authenticated;
grant execute on function public.ch_worker_email_pegar(integer) to service_role;

-- Descadastro pelo link do e-mail (só serviço; a página /api/legal/descadastro chama). p_confirmar = false: só diz se o código vale
-- e se a pessoa ainda recebe (a página mostra o botão de confirmar; abrir o link NÃO descadastra: leitores de e-mail abrem links
-- sozinhos). p_confirmar = true: retira o consentimento (histórico com origem link_email) e cancela os e-mails que ainda não saíram.
create or replace function public.ch_worker_marketing_descadastro(p_token text, p_confirmar boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_recebe boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valido', false); end if;
  select user_id into v_user from public.marketing_descadastro where token = p_token;
  if v_user is null then return jsonb_build_object('valido', false); end if;
  v_recebe := exists (select 1 from public.marketing_consents m where m.user_id = v_user and m.opt_in);
  if p_confirmar and v_recebe then
    perform public.marketing_gravar(v_user, false, 'link_email');
    update public.email_saida set status = 'cancelado', erro = 'Descadastro pelo link do e-mail.'
     where user_id = v_user and kind = 'comunicado' and status = 'pendente';
    v_recebe := false;
  end if;
  return jsonb_build_object('valido', true, 'recebe', v_recebe);
end
$$;
revoke execute on function public.ch_worker_marketing_descadastro(text, boolean) from public, anon, authenticated;
grant execute on function public.ch_worker_marketing_descadastro(text, boolean) to service_role;

-- ---------------------------------------------------------------- linha da Administração
create or replace function public.comunicado_admin_linha(p_id bigint) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'titulo', c.titulo, 'texto', c.texto, 'rico', c.rico, 'link', c.link, 'publico', c.publico, 'filtro', c.filtro,
    'destinatarios', c.destinatarios, 'enviado_em', c.enviado_em,
    'enviado_por', coalesce(nullif(btrim(pe.name), ''), ue.email, 'Conta apagada'),
    -- leitura da versão atual (editar zera) e de antes da última edição
    'lidas', (select count(*) from public.avisos_aluno a where a.comunicado_id = c.id and a.visto_em is not null),
    'lidas_antes', c.lidas_antes,
    'pode_mudar_publico', not c.lido_alguma_vez and c.email_em is null
                          and not exists (select 1 from public.avisos_aluno a where a.comunicado_id = c.id and a.visto_em is not null),
    'versao', c.versao, 'editado_em', c.editado_em,
    'editado_por', case when c.editado_em is null then null else coalesce(nullif(btrim(pd.name), ''), ud.email, 'Conta apagada') end,
    'apagado_em', c.apagado_em, 'apagado_motivo', c.apagado_motivo,
    'apagado_por', case when c.apagado_em is null then null else coalesce(nullif(btrim(pa.name), ''), ua.email, 'Conta apagada') end,
    'por_email', c.por_email, 'email_em', c.email_em,
    'email', case when c.por_email then (
       select jsonb_build_object(
         'na_fila', count(*) filter (where e.status in ('pendente', 'enviando')),
         'enviados', count(*) filter (where e.status = 'enviado'),
         'incertos', count(*) filter (where e.status = 'incerto'),
         'nao_enviados', count(*) filter (where e.status in ('falhou', 'cancelado')))
       from public.email_saida e where e.kind = 'comunicado' and (e.payload ->> 'comunicado_id')::bigint = c.id) end)
  from public.comunicados_equipe c
  left join auth.users ue on ue.id = c.enviado_por left join public.profiles pe on pe.id = c.enviado_por
  left join auth.users ud on ud.id = c.editado_por left join public.profiles pd on pd.id = c.editado_por
  left join auth.users ua on ua.id = c.apagado_por left join public.profiles pa on pa.id = c.apagado_por
  where c.id = p_id
$$;
revoke execute on function public.comunicado_admin_linha(bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------- prévia (agora com quantos recebem também por e-mail)
create or replace function public.app_admin_comunicado_previa(p_publico text, p_filtro text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform public.comunicado_validar(p_publico, p_filtro);
  return (select jsonb_build_object(
            'destinatarios', count(*),
            'por_email', count(*) filter (where exists (select 1 from public.marketing_consents m where m.user_id = u and m.opt_in)
                                            and public.email_conta_confirmada(u)))
          from public.comunicado_alunos(p_publico, p_filtro) u);
end
$$;

-- ---------------------------------------------------------------- editar
-- p_publico nulo = mantém o público. O público só muda enquanto ninguém leu nenhuma versão e o e-mail não saiu.
-- Mudar título, texto, formatação ou link ZERA A LEITURA (decisão do dono, 18/10): volta a "não lida" para todos.
-- E-mail: editar NÃO reenvia (o e-mail que já saiu não muda); mandar por e-mail depois é app_admin_comunicado_email.
-- p_versao (opcional): a versão que a tela abriu; se outra pessoa salvou antes, recusa (para ninguém sobrescrever sem ver).
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
  v_muda_conteudo boolean;
  v_lidas integer;
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
  v_muda_conteudo := v_titulo <> c.titulo or v_texto <> c.texto or v_rico is distinct from c.rico or v_link is distinct from c.link;

  if not v_muda_publico and not v_muda_conteudo then
    return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', false);
  end if;

  -- trava as notificações deste comunicado (ninguém marca como lida no meio)
  perform 1 from public.avisos_aluno where comunicado_id = p_id for update;
  select count(*) into v_lidas from public.avisos_aluno where comunicado_id = p_id and visto_em is not null;

  if v_muda_publico then
    perform public.comunicado_validar(p_publico, p_filtro);
    if v_lidas > 0 or c.lido_alguma_vez then
      raise exception 'Algum aluno já leu este comunicado: o público não pode mais mudar. Edite só o título e o texto.' using errcode = '22023';
    end if;
    if c.email_em is not null then
      raise exception 'Este comunicado já foi por e-mail: o público não pode mais mudar.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.comunicado_alunos(p_publico, p_filtro)) then
      raise exception 'Nenhum aluno neste público. Escolha outro.' using errcode = '22023';
    end if;
    delete from public.avisos_aluno where comunicado_id = p_id;
    insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rico, rota, link, comunicado_id, email_status, editado_em)
    select u, 'comunicado', 'comunicado:' || c.id, v_titulo, v_texto, v_rico, case when v_link is null then 'nenhuma' else 'link' end, v_link, c.id, 'so_tela',
           case when v_muda_conteudo then now() end
    from public.comunicado_alunos(p_publico, p_filtro) u
    on conflict (user_id, chave) do nothing;
    get diagnostics n = row_count;
  else
    n := c.destinatarios;
    if v_muda_conteudo then
      update public.avisos_aluno set titulo = v_titulo, texto = v_texto, rico = v_rico, link = v_link,
                                     rota = case when v_link is null then 'nenhuma' else 'link' end, editado_em = now(), visto_em = null
      where comunicado_id = p_id;
    end if;
  end if;

  update public.comunicados_equipe set titulo = v_titulo, texto = v_texto, rico = v_rico, link = v_link,
         publico = case when v_muda_publico then p_publico else publico end,
         filtro = case when v_muda_publico then p_filtro else filtro end,
         destinatarios = n,
         versao = versao + 1, editado_em = now(), editado_por = (select auth.uid()),
         lidas_antes = case when v_muda_conteudo then v_lidas else lidas_antes end,
         lido_alguma_vez = lido_alguma_vez or v_lidas > 0
  where id = p_id;
  select * into d from public.comunicados_equipe where id = p_id;

  insert into public.comunicados_historico (comunicado_id, acao, versao, antes, depois, por)
  values (p_id, 'editar', d.versao, public.comunicado_foto(to_jsonb(c)) || jsonb_build_object('lidas', v_lidas),
          public.comunicado_foto(to_jsonb(d)) || jsonb_build_object('por_email', d.por_email), (select auth.uid()));
  perform public.admin_log('comunicado.editar', p_id::text,
    jsonb_build_object('titulo', v_titulo, 'titulo_antes', c.titulo, 'versao', d.versao, 'publico', d.publico, 'filtro', d.filtro,
                       'mudou_publico', v_muda_publico, 'destinatarios', d.destinatarios,
                       'leitura_zerada', v_muda_conteudo, 'lidas_antes', case when v_muda_conteudo then v_lidas end));
  return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', true);
end
$$;

-- ---------------------------------------------------------------- apagar e restaurar (apagamento lógico)
create or replace function public.app_admin_comunicado_apagar(p_id bigint, p_motivo text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.comunicados_equipe;
  d public.comunicados_equipe;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cancelados integer;
begin
  perform public.assert_admin();
  if char_length(v_motivo) > 300 then raise exception 'O motivo pode ter até 300 letras.' using errcode = '22023'; end if;
  select * into c from public.comunicados_equipe where id = p_id for update;
  if not found then raise exception 'Comunicado não encontrado.' using errcode = 'P0002'; end if;
  if c.apagado_em is not null then return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', false); end if;

  update public.avisos_aluno set apagado_em = now() where comunicado_id = p_id and apagado_em is null;
  -- e-mail que ainda não saiu não sai mais (o que já saiu não volta)
  update public.email_saida set status = 'cancelado', erro = 'Comunicado apagado.'
   where kind = 'comunicado' and status = 'pendente' and (payload ->> 'comunicado_id')::bigint = p_id;
  get diagnostics v_cancelados = row_count;
  update public.comunicados_equipe set apagado_em = now(), apagado_por = (select auth.uid()), apagado_motivo = v_motivo
  where id = p_id returning * into d;
  insert into public.comunicados_historico (comunicado_id, acao, versao, antes, depois, motivo, por)
  values (p_id, 'apagar', d.versao, public.comunicado_foto(to_jsonb(c)), public.comunicado_foto(to_jsonb(d)), v_motivo, (select auth.uid()));
  perform public.admin_log('comunicado.apagar', p_id::text,
    jsonb_build_object('titulo', c.titulo, 'motivo', v_motivo, 'destinatarios', c.destinatarios, 'emails_cancelados', v_cancelados));
  return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', true, 'emails_cancelados', v_cancelados);
end
$$;


-- ---------------------------------------------------------------- mandar por e-mail (uma vez só)
-- "Enviar também por e-mail": a tela chama logo depois de enviar (comunicado novo) ou na edição (comunicado que só foi ao sino).
-- Uma vez só por comunicado: se já foi, não manda de novo (editar não reenvia). Só para quem aceitou receber novidades.
create or replace function public.app_admin_comunicado_email(p_id bigint) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.comunicados_equipe;
  n integer;
begin
  perform public.assert_admin();
  select * into c from public.comunicados_equipe where id = p_id for update;
  if not found then raise exception 'Comunicado não encontrado.' using errcode = 'P0002'; end if;
  if c.apagado_em is not null then raise exception 'Este comunicado está apagado. Restaure antes de mandar por e-mail.' using errcode = '22023'; end if;
  if c.email_em is not null then
    return public.comunicado_admin_linha(p_id) || jsonb_build_object('emails', 0, 'ja_enviado', true);
  end if;
  n := public.comunicado_email_enfileirar(p_id);
  perform public.admin_log('comunicado.email', p_id::text, jsonb_build_object('titulo', c.titulo, 'emails', n));
  return public.comunicado_admin_linha(p_id) || jsonb_build_object('emails', n, 'ja_enviado', false);
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_admin_comunicado_previa(text, text) from public, anon;
grant execute on function public.app_admin_comunicado_previa(text, text) to authenticated;
revoke execute on function public.app_admin_comunicado_editar(bigint, text, text, text, jsonb, text, text, integer) from public, anon;
grant execute on function public.app_admin_comunicado_editar(bigint, text, text, text, jsonb, text, text, integer) to authenticated;
revoke execute on function public.app_admin_comunicado_apagar(bigint, text) from public, anon;
grant execute on function public.app_admin_comunicado_apagar(bigint, text) to authenticated;
revoke execute on function public.app_admin_comunicado_email(bigint) from public, anon;
grant execute on function public.app_admin_comunicado_email(bigint) to authenticated;
