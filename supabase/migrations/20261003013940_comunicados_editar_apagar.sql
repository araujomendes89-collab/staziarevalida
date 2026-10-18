-- =============================================================================
-- COMUNICADOS: EDITAR, APAGAR (E RESTAURAR) E EDITOR PROFISSIONAL (pedido do dono, 18/10/2026; ramo comunicados-editor).
--
-- Depois da Central de Notificações (013830). Em Administração > Comunicados, o administrador passa a poder:
--   * EDITAR um comunicado já enviado: título, texto (com formatação do editor profissional) e link. O público (para quem) só muda
--     enquanto NENHUM aluno leu; depois disso fica fixo. O aluno vê a versão nova com o selo "editado" e a leitura dele não muda
--     (quem já leu continua com "lida"). Edição sem mudança nenhuma não cria versão.
--   * APAGAR (apagamento lógico): some do sino e da lista do aluno (também da leitura direta da tabela, pela regra de RLS), com data,
--     quem apagou e motivo opcional. Nada é apagado de verdade: RESTAURAR devolve tudo como era (inclusive o que o aluno já leu).
--   * Cada edição, apagamento e restauração fica no histórico (comunicados_historico: quem, quando, antes e depois) e no registro
--     geral da Administração (admin_audit_log: comunicado.editar / comunicado.apagar / comunicado.restaurar).
--   * Formatação: o texto oficial continua na coluna "texto" (projeção: texto + links, até 600 letras); a formatação (negrito,
--     itálico, listas, títulos) vai em "rico" (envelope sdoc v1, o mesmo padrão dos campos da 013110). Só vale quando a projeção
--     bate com o texto (o leitor do aluno confere com ricoValido e desenha com o leitor React, nunca HTML cru). Comunicado antigo,
--     só texto, fica com rico nulo e aparece igual a antes.
--   * E-mail: comunicado continua SÓ NA TELA (email_status 'so_tela' da 013830). Editar ou apagar não manda e-mail nenhum.
--
-- Segurança: tudo por função SECURITY DEFINER com assert_admin() (a mesma permissão de enviar: só administrador). O aluno continua
-- só lendo as próprias notificações e marcando como lidas; não edita, não apaga e não lê o histórico. Editor e revisor também não.
--
-- Mudanças de assinatura (o site novo e o antigo funcionam com esta migração; aplique ANTES de publicar o site novo):
--   * app_admin_comunicado_enviar ganha p_rico jsonb default null (a de 6 parâmetros sai; chamada antiga continua valendo).
--   * app_admin_comunicados ganha p_situacao text default 'ativos' ('ativos' | 'apagados'); a de 1 parâmetro sai.
--
-- ADITIVA e pode ser colada de novo. Depende da 013830 (comunicados_equipe, avisos_aluno.comunicado_id) e da 013110
-- (ch_formatacao_valida). Desfazer: supabase/desfazer/20261003013940_comunicados_editar_apagar.desfazer.sql.
-- Conferir: supabase/conferir/comunicados-editar-apagar.sql.
-- =============================================================================

-- ---------------------------------------------------------------- formatação válida para um comunicado
-- Envelope sdoc v1 (a forma que a 013110 aceita) e no máximo 60 KB (o texto tem até 600 letras; sobra para as marcas).
create or replace function public.comunicado_rico_ok(p_rico jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select p_rico is null
      or (jsonb_typeof(p_rico) = 'object'
          and octet_length(p_rico::text) <= 60000
          and public.ch_formatacao_valida(jsonb_build_object('texto', p_rico)))
$$;
revoke execute on function public.comunicado_rico_ok(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- colunas novas
alter table public.comunicados_equipe add column if not exists rico jsonb;
alter table public.comunicados_equipe add column if not exists versao integer not null default 1;
alter table public.comunicados_equipe add column if not exists editado_em timestamptz;
alter table public.comunicados_equipe add column if not exists editado_por uuid references auth.users (id) on delete set null;
alter table public.comunicados_equipe add column if not exists apagado_em timestamptz;
alter table public.comunicados_equipe add column if not exists apagado_por uuid references auth.users (id) on delete set null;
alter table public.comunicados_equipe add column if not exists apagado_motivo text;
alter table public.comunicados_equipe drop constraint if exists comunicados_equipe_rico_check;
alter table public.comunicados_equipe add constraint comunicados_equipe_rico_check check (public.comunicado_rico_ok(rico));
alter table public.comunicados_equipe drop constraint if exists comunicados_equipe_apagado_motivo_check;
alter table public.comunicados_equipe add constraint comunicados_equipe_apagado_motivo_check
  check (apagado_motivo is null or char_length(apagado_motivo) <= 300);
create index if not exists comunicados_equipe_apagados_idx on public.comunicados_equipe (apagado_em desc) where apagado_em is not null;

alter table public.avisos_aluno add column if not exists rico jsonb;
alter table public.avisos_aluno add column if not exists editado_em timestamptz;
alter table public.avisos_aluno add column if not exists apagado_em timestamptz;
alter table public.avisos_aluno drop constraint if exists avisos_aluno_rico_check;
alter table public.avisos_aluno add constraint avisos_aluno_rico_check check (public.comunicado_rico_ok(rico));
create index if not exists avisos_aluno_comunicado_idx on public.avisos_aluno (comunicado_id) where comunicado_id is not null;

-- O aluno lê só as próprias e NÃO as apagadas (nem pela tabela).
drop policy if exists "avisos do aluno: ler os próprios" on public.avisos_aluno;
create policy "avisos do aluno: ler os próprios" on public.avisos_aluno
  for select to authenticated using (user_id = (select auth.uid()) and apagado_em is null);

-- ---------------------------------------------------------------- histórico (auditoria das versões)
-- Sem chave estrangeira de propósito: o registro de auditoria sobrevive mesmo se o comunicado sumir (ex.: desfazer da 013830).
create table if not exists public.comunicados_historico (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null,
  acao text not null check (acao in ('editar', 'apagar', 'restaurar')),
  versao integer not null,
  antes jsonb not null,
  depois jsonb not null,
  motivo text check (motivo is null or char_length(motivo) <= 300),
  por uuid references auth.users (id) on delete set null,
  em timestamptz not null default now()
);
create index if not exists comunicados_historico_idx on public.comunicados_historico (comunicado_id, em desc, id desc);
alter table public.comunicados_historico enable row level security;
revoke all on public.comunicados_historico from public, anon, authenticated;

-- Fotografia de um comunicado para o histórico (o que o aluno via e para quem foi). Recebe to_jsonb(linha), não o tipo da tabela,
-- para não prender a tabela a esta função (o desfazer da 013830 continua conseguindo apagar a tabela).
create or replace function public.comunicado_foto(p_linha jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_build_object('titulo', p_linha -> 'titulo', 'texto', p_linha -> 'texto', 'rico', p_linha -> 'rico', 'link', p_linha -> 'link',
                            'publico', p_linha -> 'publico', 'filtro', p_linha -> 'filtro', 'destinatarios', p_linha -> 'destinatarios',
                            'versao', p_linha -> 'versao', 'apagado', jsonb_typeof(p_linha -> 'apagado_em') = 'string')
$$;
revoke execute on function public.comunicado_foto(jsonb) from public, anon, authenticated;

-- Linha de um comunicado como a Administração vê (lista e respostas de editar/apagar/restaurar).
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
revoke execute on function public.comunicado_admin_linha(bigint) from public, anon, authenticated;

-- Confere título, texto, link e formatação (mesmas regras do enviar) e devolve o link normalizado.
create or replace function public.comunicado_conferir_texto(p_titulo text, p_texto text, p_link text, p_rico jsonb) returns text
  language plpgsql immutable set search_path = ''
as $$
declare v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  if char_length(btrim(coalesce(p_titulo, ''))) not between 3 and 140 then raise exception 'O título precisa ter de 3 a 140 letras.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_texto, ''))) not between 3 and 600 then raise exception 'O texto precisa ter de 3 a 600 letras.' using errcode = '22023'; end if;
  if v_link like '/novo/%' then v_link := substr(v_link, 6); end if;
  if v_link is not null and not ((v_link ~ '^/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$' or v_link ~ '^https://[^\s<>"]+$') and char_length(v_link) <= 300) then
    raise exception 'O link precisa ser uma tela do app (ex.: /atualizacoes) ou um endereço https://.' using errcode = '22023';
  end if;
  if not public.comunicado_rico_ok(p_rico) then raise exception 'A formatação do texto veio num formato inválido.' using errcode = '22023'; end if;
  return v_link;
end
$$;
revoke execute on function public.comunicado_conferir_texto(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- enviar (agora com a formatação)
drop function if exists public.app_admin_comunicado_enviar(text, text, text, text, text, text);
create or replace function public.app_admin_comunicado_enviar(p_titulo text, p_texto text, p_link text, p_publico text, p_filtro text, p_idem text,
                                                              p_rico jsonb default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_texto text := btrim(coalesce(p_texto, ''));
  v_rico jsonb := case when jsonb_typeof(p_rico) = 'null' then null else p_rico end;
  v_link text;
  c public.comunicados_equipe;
  n integer;
begin
  perform public.assert_admin();
  perform public.comunicado_validar(p_publico, p_filtro);
  v_link := public.comunicado_conferir_texto(v_titulo, v_texto, p_link, v_rico);
  if p_idem is null or char_length(p_idem) not between 8 and 100 then raise exception 'Pedido inválido.' using errcode = '22023'; end if;

  select * into c from public.comunicados_equipe where idem_chave = p_idem;
  if found then return to_jsonb(c) || jsonb_build_object('repetido', true); end if;

  insert into public.comunicados_equipe (titulo, texto, rico, link, publico, filtro, idem_chave, enviado_por)
  values (v_titulo, v_texto, v_rico, v_link, p_publico, p_filtro, p_idem, (select auth.uid()))
  returning * into c;

  insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto, rico, rota, link, comunicado_id, email_status)
  select u, 'comunicado', 'comunicado:' || c.id, v_titulo, v_texto, v_rico, case when v_link is null then 'nenhuma' else 'link' end, v_link, c.id, 'so_tela'
  from public.comunicado_alunos(p_publico, p_filtro) u
  on conflict (user_id, chave) do nothing;
  get diagnostics n = row_count;

  update public.comunicados_equipe set destinatarios = n where id = c.id returning * into c;
  perform public.admin_log('comunicado.enviar', c.id::text,
    jsonb_build_object('titulo', v_titulo, 'publico', p_publico, 'filtro', p_filtro, 'destinatarios', n, 'formatado', v_rico is not null));
  return to_jsonb(c) || jsonb_build_object('repetido', false);
end
$$;

-- ---------------------------------------------------------------- editar
-- p_publico nulo = mantém o público. Mudar o público só enquanto ninguém leu (as notificações são refeitas para o público novo).
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

-- ---------------------------------------------------------------- apagar e restaurar (apagamento lógico)
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

create or replace function public.app_admin_comunicado_restaurar(p_id bigint) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.comunicados_equipe;
  d public.comunicados_equipe;
begin
  perform public.assert_admin();
  select * into c from public.comunicados_equipe where id = p_id for update;
  if not found then raise exception 'Comunicado não encontrado.' using errcode = 'P0002'; end if;
  if c.apagado_em is null then return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', false); end if;

  update public.avisos_aluno set apagado_em = null where comunicado_id = p_id;
  update public.comunicados_equipe set apagado_em = null, apagado_por = null, apagado_motivo = null where id = p_id returning * into d;
  insert into public.comunicados_historico (comunicado_id, acao, versao, antes, depois, motivo, por)
  values (p_id, 'restaurar', d.versao, public.comunicado_foto(to_jsonb(c)), public.comunicado_foto(to_jsonb(d)), c.apagado_motivo, (select auth.uid()));
  perform public.admin_log('comunicado.restaurar', p_id::text, jsonb_build_object('titulo', c.titulo));
  return public.comunicado_admin_linha(p_id) || jsonb_build_object('mudou', true);
end
$$;

-- ---------------------------------------------------------------- lista e histórico (Administração)
drop function if exists public.app_admin_comunicados(integer);
create or replace function public.app_admin_comunicados(p_limite integer default 30, p_situacao text default 'ativos') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if coalesce(p_situacao, 'ativos') not in ('ativos', 'apagados') then raise exception 'Filtro inválido.' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(public.comunicado_admin_linha(c.id) order by c.ordem desc, c.id desc)
         from (select x.id, case when p_situacao = 'apagados' then x.apagado_em else x.enviado_em end as ordem
               from public.comunicados_equipe x
               where (coalesce(p_situacao, 'ativos') = 'apagados') = (x.apagado_em is not null)
               order by 2 desc, x.id desc limit least(100, greatest(1, coalesce(p_limite, 30)))) c), '[]'::jsonb);
end
$$;

create or replace function public.app_admin_comunicado_historico(p_id bigint) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'acao', h.acao, 'versao', h.versao, 'antes', h.antes, 'depois', h.depois,
                                                       'motivo', h.motivo, 'em', h.em,
                                                       'por', coalesce(nullif(btrim(p.name), ''), u.email, 'Conta apagada'))
                                    order by h.em desc, h.id desc)
                   from public.comunicados_historico h
                   left join auth.users u on u.id = h.por left join public.profiles p on p.id = h.por
                   where h.comunicado_id = p_id), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- o aluno: a Central sem os apagados, com formatação e "editado"
-- Igual à da 013830, com: apagado_em is null (lista e contagem), 'rico' e 'editado'.
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
    'nao_lidas', (select count(*) from public.avisos_aluno a where a.user_id = v_user and a.apagado_em is null
                    and (a.visto_em is null or public.aviso_urgente_ativo(a.user_id, a.tipo, a.chave, a.criado_em))),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'rico', a.rico, 'rota', a.rota, 'link', a.link,
                         'acao', public.notificacao_acao(a.tipo, a.rota, a.titulo), 'em', a.criado_em,
                         'editado', a.editado_em is not null, 'editado_em', a.editado_em,
                         'urgente', a.urgente, 'lida', a.visto_em is not null and not a.urgente)
                       order by a.urgente desc, a.criado_em desc, a.id desc)
                     from (select x.*, public.aviso_urgente_ativo(x.user_id, x.tipo, x.chave, x.criado_em) as urgente
                           from public.avisos_aluno x where x.user_id = v_user and x.apagado_em is null
                           order by public.aviso_urgente_ativo(x.user_id, x.tipo, x.chave, x.criado_em) desc, x.criado_em desc, x.id desc
                           limit least(100, greatest(1, coalesce(p_limite, 30)))) a), '[]'::jsonb));
end
$$;

-- Igual à da 013830, sem tocar nas apagadas.
create or replace function public.app_notificacoes_lidas(p_ids bigint[] default null) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid()); n integer;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  update public.avisos_aluno set visto_em = now()
  where user_id = v_user and visto_em is null and apagado_em is null and (p_ids is null or id = any (p_ids))
    and not public.aviso_urgente_ativo(user_id, tipo, chave, criado_em);
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.comunicado_admin_linha(bigint) from public, anon, authenticated;
revoke execute on function public.comunicado_conferir_texto(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.app_admin_comunicado_enviar(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.app_admin_comunicado_enviar(text, text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.app_admin_comunicado_editar(bigint, text, text, text, jsonb, text, text, integer) from public, anon;
grant execute on function public.app_admin_comunicado_editar(bigint, text, text, text, jsonb, text, text, integer) to authenticated;
revoke execute on function public.app_admin_comunicado_apagar(bigint, text) from public, anon;
grant execute on function public.app_admin_comunicado_apagar(bigint, text) to authenticated;
revoke execute on function public.app_admin_comunicado_restaurar(bigint) from public, anon;
grant execute on function public.app_admin_comunicado_restaurar(bigint) to authenticated;
revoke execute on function public.app_admin_comunicados(integer, text) from public, anon;
grant execute on function public.app_admin_comunicados(integer, text) to authenticated;
revoke execute on function public.app_admin_comunicado_historico(bigint) from public, anon;
grant execute on function public.app_admin_comunicado_historico(bigint) to authenticated;
revoke execute on function public.app_minhas_notificacoes(integer) from public, anon;
grant execute on function public.app_minhas_notificacoes(integer) to authenticated;
revoke execute on function public.app_notificacoes_lidas(bigint[]) from public, anon;
grant execute on function public.app_notificacoes_lidas(bigint[]) to authenticated;
