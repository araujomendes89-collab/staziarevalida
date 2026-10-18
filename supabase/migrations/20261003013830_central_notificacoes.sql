-- =============================================================================
-- CENTRAL DE NOTIFICAÇÕES DO ALUNO (ramo notificacoes, 17/10/2026; entra no Pacote 2 junto com a cobrança).
--
-- O sino no topo do app (com o número de não lidas) e o painel "Notificações". FONTE ÚNICA: a tabela dos avisos de cobrança da
-- 013760 (public.avisos_aluno) passa a guardar também os outros tipos. Assim:
--   * tudo que o pop-up de cobrança mostra fica guardado na Central (é a mesma linha);
--   * ler no pop-up conta como lido na Central (é a mesma coluna visto_em = "lida em"), e vice-versa;
--   * a chave única por aluno (user_id, chave) continua sendo a trava contra duplicata para todos os tipos.
--
-- Tipos: cobrança (renovacao, pagamento_falhou, acesso_bloqueado, acesso_liberado: os da 013760, sem mudança), contrato_novo (aceitar a
-- versão nova do Contrato no prazo da cláusula 6.5-A) e comunicado (escrito pela equipe na Administração > Comunicados).
--
-- Segurança (mesma regra da 013780: tudo do aluno passa por função): o aluno só LÊ as próprias (RLS) e só MARCA COMO LIDA as próprias
-- (função app_notificacoes_lidas). Ele não cria, não altera texto e não apaga: sem permissão de gravação na tabela. O texto vem sempre
-- do servidor. Equipe e revisores não recebem notificação de aluno (o sino nem aparece para eles).
--
-- O pop-up de cobrança (app_meus_avisos) passa a mostrar SÓ os avisos de cobrança (comunicado e contrato ficam só na Central).
--
-- AVISOS URGENTES (decisão do dono 17/10): pagamento que falhou, acesso pausado e vencimento do Pix (ou do aceite para renovar) de
-- hoje/amanhã continuam valendo ATÉ o aluno resolver (pagamento confirmado / contrato aceito) ou o aviso perder a validade. Enquanto
-- isso: aparecem no pop-up a cada abertura do app (mesmo depois do "Entendi"), contam como não lidos e vêm em destaque no sino, e
-- "Marcar todas como lidas" não os cala. Os não urgentes (7 e 3 dias antes, acesso liberado, comunicado, contrato) seguem a regra
-- comum. O cartão que renova sozinho amanhã não é urgente (o aluno não precisa fazer nada).
--
-- ADITIVA e pode ser colada de novo: colunas "if not exists", regras de valores recriadas, tabela "if not exists", funções
-- "create or replace". Depende da 013760 (avisos_aluno), da 013740 (app_legal_state) e da 013640 (aluno_fases, para o público dos
-- comunicados). Desfazer: supabase/desfazer/20261003013830_central_notificacoes.desfazer.sql. Conferir: supabase/conferir/central-notificacoes.sql.
-- =============================================================================

-- ---------------------------------------------------------------- comunicados da equipe (registro de quem enviou o quê e para quem)
create table if not exists public.comunicados_equipe (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(btrim(titulo)) between 3 and 140),
  texto text not null check (char_length(btrim(texto)) between 3 and 600),
  -- link opcional: rota do app (ex.: /atualizacoes) ou página https
  link text check (link is null or ((link ~ '^/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$' or link ~ '^https://[^\s<>"]+$') and char_length(link) <= 300)),
  publico text not null check (publico in ('todos', 'plano', 'fase')),
  filtro text check ((publico = 'todos' and filtro is null)
                     or (publico = 'plano' and filtro in ('pro', 'pratica', 'elite', 'teste'))
                     or (publico = 'fase' and filtro in ('teoria', 'pratica'))),
  idem_chave text not null unique check (char_length(idem_chave) between 8 and 100),
  destinatarios integer not null default 0,
  enviado_por uuid references auth.users (id) on delete set null,
  enviado_em timestamptz not null default now()
);
create index if not exists comunicados_equipe_em_idx on public.comunicados_equipe (enviado_em desc);
alter table public.comunicados_equipe enable row level security;
revoke all on public.comunicados_equipe from public, anon, authenticated;

-- ---------------------------------------------------------------- avisos_aluno vira a Central (mesma tabela, tipos novos)
alter table public.avisos_aluno add column if not exists link text
  check (link is null or ((link ~ '^/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$' or link ~ '^https://[^\s<>"]+$') and char_length(link) <= 300));
alter table public.avisos_aluno add column if not exists comunicado_id bigint references public.comunicados_equipe (id) on delete cascade;
create index if not exists avisos_aluno_nao_lidas_idx on public.avisos_aluno (user_id) where visto_em is null;

alter table public.avisos_aluno drop constraint if exists avisos_aluno_tipo_check;
alter table public.avisos_aluno add constraint avisos_aluno_tipo_check
  check (tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado', 'acesso_liberado', 'contrato_novo', 'comunicado'));
-- botão: rota conhecida do app; "link" = o link gravado na linha (comunicado); "nenhuma" = sem botão
alter table public.avisos_aluno drop constraint if exists avisos_aluno_rota_check;
alter table public.avisos_aluno add constraint avisos_aluno_rota_check
  check (rota in ('planos', 'perfil', 'aceite', 'link', 'nenhuma') and (rota <> 'link' or link is not null));
-- "so_tela": notificação que nunca vai por e-mail (comunicado e contrato); o envio de e-mail só pega "pendente"
alter table public.avisos_aluno drop constraint if exists avisos_aluno_email_status_check;
alter table public.avisos_aluno add constraint avisos_aluno_email_status_check
  check (email_status in ('pendente', 'enviando', 'enviado', 'falhou', 'expirado', 'sem_email', 'so_tela'));

-- ---------------------------------------------------------------- apoio
-- Texto do botão de cada notificação (vem do servidor, como o resto do texto).
create or replace function public.notificacao_acao(p_tipo text, p_rota text, p_titulo text) returns text
  language sql immutable set search_path = ''
as $$
  select case
    when p_rota = 'nenhuma' then null
    when p_tipo in ('acesso_bloqueado', 'pagamento_falhou') then 'Pagar agora'
    when p_rota = 'aceite' then 'Ler o contrato'
    when p_tipo = 'renovacao' and p_titulo like '% vence %' then 'Pagar agora'
    when p_rota = 'perfil' then 'Ver assinatura'
    when p_rota = 'link' then 'Abrir'
    else 'Ver meu plano'
  end
$$;

-- Alunos de um público (comunicados). Aluno = papel student, sem área de revisão e sem acesso de equipe.
--   todos;  plano pro/pratica/elite = fase paga (ou pagamento pendente) desse plano e em vigor;  plano teste = teste em vigor;
--   fase teoria/pratica = acesso em vigor a essa fase (teste ou pago).
create or replace function public.comunicado_alunos(p_publico text, p_filtro text) returns setof uuid
  language sql stable security definer set search_path = ''
as $$
  select r.user_id from public.user_roles r
  where r.role = 'student'
    and not public.user_has_full_access(r.user_id)
    and (p_publico = 'todos'
      or (p_publico = 'plano' and p_filtro = 'teste' and exists (
            select 1 from public.aluno_fases f where f.user_id = r.user_id and f.situacao = 'teste' and (f.fim is null or f.fim > now())))
      or (p_publico = 'plano' and p_filtro in ('pro', 'pratica', 'elite') and exists (
            select 1 from public.aluno_fases f where f.user_id = r.user_id and f.plano = p_filtro
              and f.situacao in ('paga', 'pagamento_pendente') and (f.fim is null or f.fim > now())))
      or (p_publico = 'fase' and exists (
            select 1 from public.aluno_fases f where f.user_id = r.user_id and f.fase = p_filtro
              and f.situacao <> 'cancelada' and (f.fim is null or f.fim > now()))))
$$;

-- Contrato novo no prazo da cláusula 6.5-A (o mesmo que o aviso do topo mostra): cria a notificação uma vez por versão; depois do
-- aceite, a notificação da versão fica como lida sozinha.
create or replace function public.notificacao_contrato_sincronizar(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_legal jsonb;
  v_versao text;
begin
  if to_regprocedure('public.app_legal_state()') is null then return; end if;
  v_legal := public.app_legal_state();
  if v_legal is null then return; end if;
  v_versao := v_legal #>> '{termo_uso,current}';
  if coalesce((v_legal #>> '{termo_uso,valid}')::boolean, false) then
    update public.avisos_aluno set visto_em = now() where user_id = p_user and tipo = 'contrato_novo' and visto_em is null;
    return;
  end if;
  if v_versao is null or v_legal ->> 'grace_until' is null or coalesce((v_legal ->> 'gate_required')::boolean, false) then return; end if;
  insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rota, email_status)
  values (p_user, 'contrato_novo', left('contrato:' || v_versao, 120),
          left('Atualizamos o Contrato (versão ' || v_versao || ')', 140),
          'Você continua com o seu plano até ' || to_char(public.avisos_dia((v_legal ->> 'grace_until')::timestamptz), 'DD/MM/YYYY')
          || '. Para renovar depois disso, leia e aceite a nova versão.',
          'aceite', 'so_tela')
  on conflict (user_id, chave) do nothing;
end
$$;

-- Aviso de cobrança já resolvido? Pagamento que falhou / acesso pausado: um pagamento do plano confirmado depois do aviso.
-- Renovação (qualquer nível): a renovação daquele vencimento já paga (ou o período já passou desse dia); a do aceite: contrato aceito.
create or replace function public.aviso_resolvido(p_user uuid, p_tipo text, p_chave text, p_criado timestamptz) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare v_dia date;
begin
  if p_tipo in ('pagamento_falhou', 'acesso_bloqueado') then
    return exists (select 1 from public.billing_cobrancas x where x.user_id = p_user and x.tipo = 'plano'
                     and x.status in ('paga', 'devolvida_parcial') and coalesce(x.pago_em, x.criado_em) >= p_criado);
  end if;
  if p_tipo <> 'renovacao' or p_chave !~ '^renovacao(-aceite)?:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]+$' then return false; end if;
  v_dia := split_part(p_chave, ':', 2)::date;
  if p_chave like 'renovacao-aceite:%' then return public.billing_termo_vigente_ok(p_user); end if;
  return exists (select 1 from public.billing_pedidos p where p.user_id = p_user and p.motivo = 'renovacao' and p.status = 'pago'
                   and public.avisos_dia(p.renova_ate) = v_dia)
      or exists (select 1 from public.billing_contratos c where c.user_id = p_user and public.avisos_dia(c.periodo_fim) > v_dia);
end
$$;

-- Aviso urgente ainda sem solução? Pagamento que falhou / acesso pausado: até ser resolvido, por no máximo 30 dias. Vencimento de
-- hoje/amanhã (nível 1) do Pix ou do aceite para renovar: até ser resolvido, a renovação ser cancelada ou o dia passar (aí o aviso de
-- acesso pausado assume). Cartão que renova sozinho não é urgente.
create or replace function public.aviso_urgente_ativo(p_user uuid, p_tipo text, p_chave text, p_criado timestamptz) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.billing_contratos;
  v_dia date;
begin
  if p_tipo in ('pagamento_falhou', 'acesso_bloqueado') then
    return p_criado > now() - interval '30 days' and not public.aviso_resolvido(p_user, p_tipo, p_chave, p_criado);
  end if;
  if p_tipo <> 'renovacao' or p_chave !~ '^renovacao(-aceite)?:[0-9]{4}-[0-9]{2}-[0-9]{2}:1$' then return false; end if;
  v_dia := split_part(p_chave, ':', 2)::date;
  if v_dia < public.avisos_dia(now()) then return false; end if;
  select * into c from public.billing_contratos where user_id = p_user;
  if c.user_id is null or not c.renova then return false; end if;
  if p_chave like 'renovacao:%' and c.metodo <> 'pix' then return false; end if;
  return not public.aviso_resolvido(p_user, p_tipo, p_chave, p_criado);
end
$$;

-- ---------------------------------------------------------------- o aluno: a Central
-- Lista do mais novo para o mais antigo (até p_limite, no máximo 100) e o total de não lidas. Equipe e revisores: lista vazia.
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

-- O pop-up continua só com os avisos de cobrança. Igual à da 013760, com o filtro de tipo e a regra dos urgentes: o urgente sem solução
-- volta a cada abertura (mesmo visto); pagamento que falhou / acesso pausado já resolvido não aparece mais.
create or replace function public.app_meus_avisos() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'novos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'rota', a.rota, 'em', a.criado_em,
                                                           'urgente', a.urgente)
                                        order by a.urgente desc, a.criado_em desc)
                       from (select x.*, public.aviso_urgente_ativo(x.user_id, x.tipo, x.chave, x.criado_em) as urgente
                             from public.avisos_aluno x where x.user_id = v_user
                               and x.tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado', 'acesso_liberado')) a
                       where a.urgente or (a.visto_em is null and a.criado_em > now() - interval '30 days'
                                           and a.tipo not in ('pagamento_falhou', 'acesso_bloqueado')
                                           and not public.aviso_resolvido(a.user_id, a.tipo, a.chave, a.criado_em))), '[]'::jsonb),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'em', a.criado_em,
                                                              'visto', a.visto_em is not null, 'email', a.email_status = 'enviado') order by a.criado_em desc)
                          from (select * from public.avisos_aluno where user_id = v_user
                                  and tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado', 'acesso_liberado')
                                order by criado_em desc limit 10) a), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- Administração > Comunicados (só administrador)
create or replace function public.comunicado_validar(p_publico text, p_filtro text) returns void
  language plpgsql immutable set search_path = ''
as $$
begin
  if p_publico = 'todos' and p_filtro is null then return; end if;
  if p_publico = 'plano' and p_filtro in ('pro', 'pratica', 'elite', 'teste') then return; end if;
  if p_publico = 'fase' and p_filtro in ('teoria', 'pratica') then return; end if;
  raise exception 'Escolha para quem vai o comunicado.' using errcode = '22023';
end
$$;

-- Prévia: quantos alunos vão receber.
create or replace function public.app_admin_comunicado_previa(p_publico text, p_filtro text default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Só administradores.' using errcode = '42501'; end if;
  perform public.comunicado_validar(p_publico, p_filtro);
  return jsonb_build_object('destinatarios', (select count(*) from public.comunicado_alunos(p_publico, p_filtro)));
end
$$;

-- Envia: grava o comunicado e uma notificação para cada aluno do público (uma vez só por aluno; o mesmo p_idem não envia de novo).
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

-- ---------------------------------------------------------------- permissões
-- tabela: o aluno só lê as próprias (regra da 013760 continua); ninguém de fora grava
revoke all on public.avisos_aluno from public, anon, authenticated;
grant select on public.avisos_aluno to authenticated;

revoke execute on function public.notificacao_acao(text, text, text) from public, anon, authenticated;
revoke execute on function public.comunicado_alunos(text, text) from public, anon, authenticated;
revoke execute on function public.notificacao_contrato_sincronizar(uuid) from public, anon, authenticated;
revoke execute on function public.comunicado_validar(text, text) from public, anon, authenticated;
revoke execute on function public.aviso_urgente_ativo(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.aviso_resolvido(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.app_minhas_notificacoes(integer) from public, anon;
grant execute on function public.app_minhas_notificacoes(integer) to authenticated;
revoke execute on function public.app_notificacoes_lidas(bigint[]) from public, anon;
grant execute on function public.app_notificacoes_lidas(bigint[]) to authenticated;
revoke execute on function public.app_meus_avisos() from public, anon;
grant execute on function public.app_meus_avisos() to authenticated;
revoke execute on function public.app_admin_comunicado_previa(text, text) from public, anon;
grant execute on function public.app_admin_comunicado_previa(text, text) to authenticated;
revoke execute on function public.app_admin_comunicado_enviar(text, text, text, text, text, text) from public, anon;
grant execute on function public.app_admin_comunicado_enviar(text, text, text, text, text, text) to authenticated;
revoke execute on function public.app_admin_comunicados(integer) from public, anon;
grant execute on function public.app_admin_comunicados(integer) to authenticated;
