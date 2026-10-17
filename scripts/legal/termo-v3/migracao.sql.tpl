-- =============================================================================
-- 013740 — Textos legais 3.0 (pedido do dono, 17/10/2026): Contrato de Assinatura com os Termos de Uso v3.0, Política de Privacidade
-- v3.0 e Regulamento de Stazia Coins, XP, Ligas e Benefícios v1.0, com NOVO ACEITE dos alunos e registro de versões.
-- Textos: rascunho para revisão de advogado (pasta .tmp-aulas/juridico/FINAL, copiados sem a linha de aviso interno do topo);
-- cópias no site em src/novo/app/legal/textos/*.md (o teste termoV3Banco confere que são idênticas às daqui).
--
-- SQL ÚNICO: cria a estrutura, publica os 3 textos, troca a versão vigente para 3.0 e confere tudo no fim (se algo não bater, PARA com
-- erro e, colado numa transação, nada muda). Pode ser colado de novo sem estragar nada.
--
-- ORDEM DE PUBLICAÇÃO: 1) publicar o SITE do ramo termo-v3 (com o banco ainda sem esta migração, o site novo funciona igual ao de
-- hoje: Termo 2.0 tirado do próprio site); 2) colar ESTE SQL numa transação. Na hora em que ele entra, a versão vigente vira 3.0: todo
-- ALUNO que abrir o app vê a tela "Atualizamos nosso Contrato" e só segue depois de aceitar; contas novas aceitam a 3.0 no cadastro.
-- Equipe e revisores médicos continuam dispensados (regra de antes, legal_is_student). O aceite dos Tutores (tutor_ia 2.0) não muda.
-- NÃO colar antes de publicar o site: o site antigo não tem o texto 3.0 e mostraria o 2.0 na tela de aceite da versão 3.0.
--
-- O que muda no banco:
--   * legal_texts (NOVA): a cópia do sistema de cada texto publicado, com o código de integridade (SHA-256) calculado pelo banco.
--     Não pode ser alterada nem apagada depois de gravada (gatilho). Texto novo = versão nova (legal_publish).
--     acceptance_group: versões do mesmo grupo valem o MESMO aceite. Ex.: depois da revisão do advogado, uma correção que não muda
--     direitos sai como 3.0.1 no grupo '3.0' (ninguém aceita de novo; quem entra novo aceita a 3.0.1); mudança relevante sai como 3.1
--     no grupo '3.1' (todos os alunos aceitam de novo). collects_ip: o aceite desta versão guarda o IP (Política 3.0, seção 9).
--     changes: o resumo "o que mudou" mostrado na tela de aceite.
--   * legal_versions: passa a guardar também a versão vigente da Política (politica_privacidade) e do Regulamento (regulamento).
--   * legal_acceptances (a prova) ganha: account_id (identificador da conta, que FICA quando a conta é apagada, Política 9.5), ip (só
--     nas versões com collects_ip, lido do cabeçalho da requisição), text_sha256 (código do texto aceito), companions (versão e código
--     da Política e do Regulamento vigentes no aceite) e plan (plano e situação da assinatura no aceite). Tudo preenchido pelo banco
--     (gatilho), nunca pelo navegador. A prova não pode ser alterada nem apagada (gatilho); as únicas mudanças aceitas: a conta
--     apagada (user_id vira nulo, como antes) e o IP do cadastro por e-mail preenchido uma vez, até 5 minutos depois do aceite
--     (app_legal_cadastro_ip: o cadastro passa pelo serviço de login, que não entrega o IP ao banco; o mesmo navegador chama logo
--     depois, com o número da conta recém-criada, que só ele conhece).
--   * app_legal_state: igual à de …13660 (sem WhatsApp) e passa a liberar quem aceitou QUALQUER versão do mesmo grupo de aceite da
--     vigente (termo_uso.valid) e, pela cláusula 6.5-A, quem tem plano pago ativo até o fim do período pago (grace_until). Formato
--     igual ao de antes, mais as chaves termo_uso.valid e grace_until.
--   * app_export_my_data: os aceites exportados ganham ip, text_sha256 e companions (remendo da versão que está no banco).
--   * funções novas para o site: app_legal_current (versões vigentes e o resumo, também sem login), app_legal_text (texto de uma
--     versão publicada, também sem login: páginas /novo/termos, /novo/privacidade e /novo/regulamento), app_my_legal_documents
--     (Minha Conta → Documentos: o que a pessoa aceitou, com data, hora e código) e app_legal_cadastro_ip (acima).
--
-- Ensaiada só no PGlite (src/__tests__/termoV3Banco.test.ts: aplicada duas vezes, desfeita e aplicada de novo). NÃO aplicada em produção.
-- Desfazer: supabase/desfazer/20261003013740_termo_v3.desfazer.sql (volta o 2.0 vigente; nenhum aceite é apagado).
-- =============================================================================

-- ---------------------------------------------------------------- 0) o banco tem o que esta migração espera
do $confere$
begin
  if to_regclass('public.legal_versions') is null or to_regclass('public.legal_acceptances') is null
     or to_regclass('public.legal_declarations') is null
     or to_regprocedure('public.legal_record(uuid, text, text, text, text, boolean, boolean)') is null
     or to_regprocedure('public.app_legal_state()') is null then
    raise exception 'termo 3.0: falta a estrutura do Termo (…5300, …11500); nada foi mudado';
  end if;
  if position('or v_phone_missing' in pg_get_functiondef('public.app_legal_state()'::regprocedure)) > 0 then
    raise exception 'termo 3.0: aplique antes a 20261003013660_cadastro_sem_whatsapp.sql; nada foi mudado';
  end if;
end
$confere$;

-- ---------------------------------------------------------------- 1) versões vigentes também da Política e do Regulamento
alter table public.legal_versions drop constraint if exists legal_versions_document_check;
alter table public.legal_versions add constraint legal_versions_document_check
  check (document in ('termo_uso', 'tutor_ia', 'politica_privacidade', 'regulamento'));

-- ---------------------------------------------------------------- 2) textos publicados (a cópia do sistema)
-- Mesmo cálculo de legal_email_hash (SHA-256 em hexadecimal do texto em UTF-8), sem mexer no texto.
create or replace function public.legal_text_sha256(p_body text) returns text
  language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_body, 'UTF8')), 'hex') $$;

create table if not exists public.legal_texts (
  document text not null check (document in ('termo_uso', 'politica_privacidade', 'regulamento')),
  version text not null check (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'),
  title text not null check (char_length(title) between 3 and 200),
  body text not null check (char_length(body) > 100),
  sha256 text generated always as (public.legal_text_sha256(body)) stored,
  acceptance_group text not null check (acceptance_group ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'),
  collects_ip boolean not null default false,
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  published_at timestamptz not null default now(),
  primary key (document, version)
);
comment on table public.legal_texts is
  'Cópia do sistema de cada texto legal publicado (imutável). sha256 = código de integridade do texto exato. acceptance_group: versões '
  'do mesmo grupo valem o mesmo aceite (correção sem mudança relevante = mesmo grupo; mudança relevante = grupo novo e novo aceite). '
  'Sem políticas: o navegador lê só pelas funções app_legal_current, app_legal_text e app_my_legal_documents.';
alter table public.legal_texts enable row level security;

create or replace function public.legal_texts_imutavel() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  raise exception 'Texto legal publicado não pode ser alterado nem apagado: publique uma versão nova.' using errcode = '42501';
end
$$;
drop trigger if exists legal_texts_imutavel on public.legal_texts;
create trigger legal_texts_imutavel before update or delete on public.legal_texts
  for each row execute function public.legal_texts_imutavel();

-- Publica um texto (e, se p_vigente, o torna a versão vigente). Só pelo editor de SQL (nenhum papel do app executa).
-- A mesma versão com o mesmo texto: não faz nada. A mesma versão com texto diferente: recusa (publique outra versão).
create or replace function public.legal_publish(
  p_document text, p_version text, p_title text, p_body text, p_acceptance_group text,
  p_collects_ip boolean, p_changes jsonb, p_vigente boolean
) returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_sha text;
begin
  select t.sha256 into v_sha from public.legal_texts t where t.document = p_document and t.version = p_version;
  if found then
    if v_sha <> public.legal_text_sha256(p_body) then
      raise exception 'A versão % de % já foi publicada com outro texto: publique uma versão nova.', p_version, p_document using errcode = '22023';
    end if;
  else
    insert into public.legal_texts (document, version, title, body, acceptance_group, collects_ip, changes)
    values (p_document, p_version, p_title, p_body, p_acceptance_group, coalesce(p_collects_ip, false), coalesce(p_changes, '[]'::jsonb));
    v_sha := public.legal_text_sha256(p_body);
  end if;
  if p_vigente then
    insert into public.legal_versions (document, version) values (p_document, p_version)
    on conflict (document) do update set version = excluded.version;
  end if;
  return v_sha;
end
$$;

-- ---------------------------------------------------------------- 3) a prova do aceite ganha o que a Política 3.0 (seção 9) pede
alter table public.legal_acceptances add column if not exists account_id uuid;
alter table public.legal_acceptances add column if not exists ip inet;
alter table public.legal_acceptances add column if not exists text_sha256 text;
alter table public.legal_acceptances add column if not exists companions jsonb;
alter table public.legal_acceptances add column if not exists plan jsonb;
comment on column public.legal_acceptances.account_id is 'Identificador da conta no aceite. Fica mesmo depois de a conta ser apagada (Política 3.0, 9.5).';
comment on column public.legal_acceptances.ip is 'IP do aceite (só nas versões com legal_texts.collects_ip; Política 3.0, seção 9). Guardado por 5 anos depois do fim do contrato.';
comment on column public.legal_acceptances.text_sha256 is 'Código de integridade (SHA-256) do texto aceito, igual a legal_texts.sha256.';
comment on column public.legal_acceptances.companions is 'Versão e código da Política de Privacidade e do Regulamento vigentes no aceite do Contrato.';
comment on column public.legal_acceptances.plan is 'Plano e situação da assinatura no momento do aceite.';
-- quem já aceitou antes: o identificador é o próprio user_id (antes de a trava de alteração existir)
do $preenche$
begin
  if not exists (select 1 from pg_trigger where tgname = 'legal_acceptances_imutavel' and tgrelid = 'public.legal_acceptances'::regclass) then
    update public.legal_acceptances set account_id = user_id where account_id is null and user_id is not null;
  end if;
end
$preenche$;
create index if not exists legal_acceptances_account_idx on public.legal_acceptances (account_id, document);

-- IP de quem chama, lido dos cabeçalhos que a API do Supabase entrega ao banco (request.headers). Fora da API (gatilho do cadastro,
-- editor de SQL) não há cabeçalho: devolve nulo. Nunca falha.
create or replace function public.legal_request_ip() returns inet
  language plpgsql stable set search_path = ''
as $$
declare
  h jsonb;
  v text;
begin
  h := nullif(current_setting('request.headers', true), '')::jsonb;
  if h is null then
    return null;
  end if;
  v := coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''),
                nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''),
                nullif(btrim(h ->> 'x-real-ip'), ''));
  return v::inet;
exception when others then
  return null;
end
$$;

-- Carimbo: preenche, no momento do aceite, o que o navegador não pode mandar.
create or replace function public.legal_acceptances_carimbo() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_sha text;
  v_ip boolean;
begin
  new.account_id := coalesce(new.user_id, new.account_id);
  select t.sha256, t.collects_ip into v_sha, v_ip from public.legal_texts t where t.document = new.document and t.version = new.version;
  new.text_sha256 := v_sha;
  new.ip := case when coalesce(v_ip, false) then public.legal_request_ip() end;
  if new.document = 'termo_uso' then
    new.companions := (
      select jsonb_object_agg(v.document, jsonb_build_object('version', v.version, 'sha256', t.sha256))
      from public.legal_versions v
      left join public.legal_texts t on t.document = v.document and t.version = v.version
      where v.document in ('politica_privacidade', 'regulamento'));
  end if;
  new.plan := (select jsonb_build_object('plan', s.plan, 'status', s.status) from public.subscriptions s where s.user_id = new.user_id);
  return new;
end
$$;
drop trigger if exists legal_acceptances_carimbo on public.legal_acceptances;
create trigger legal_acceptances_carimbo before insert on public.legal_acceptances
  for each row execute function public.legal_acceptances_carimbo();

-- A prova não muda depois de gravada. Exceções: conta apagada (user_id → nulo, pela chave estrangeira) e o IP do cadastro por e-mail,
-- uma vez, até 5 minutos depois do aceite. Apagar só com a chave de expurgo ligada na própria transação (rotina dos 5 anos).
create or replace function public.legal_acceptances_imutavel() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.legal_expurgo', true), '') = 'on' then
      return old;
    end if;
    raise exception 'A prova do aceite não pode ser apagada.' using errcode = '42501';
  end if;
  if old.user_id is not null and new.user_id is null
     and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
    return new;
  end if;
  if old.ip is null and new.ip is not null and old.origin = 'cadastro' and old.accepted_at > now() - interval '5 minutes'
     and (to_jsonb(new) - 'ip') = (to_jsonb(old) - 'ip') then
    return new;
  end if;
  raise exception 'A prova do aceite não pode ser alterada.' using errcode = '42501';
end
$$;
drop trigger if exists legal_acceptances_imutavel on public.legal_acceptances;
create trigger legal_acceptances_imutavel before update or delete on public.legal_acceptances
  for each row execute function public.legal_acceptances_imutavel();

-- Cadastro por e-mail: o mesmo navegador manda, logo depois de criar a conta, o número dela; o banco grava o IP desta chamada no
-- aceite 'cadastro' sem IP, só se a versão guarda IP e só nos 5 primeiros minutos. Aberta sem login (com a confirmação de e-mail
-- ligada, a conta nasce sem sessão); o número da conta é aleatório e só quem acabou de criar a conta o tem.
create or replace function public.app_legal_cadastro_ip(p_user uuid) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_ip constant inet := public.legal_request_ip();
begin
  if p_user is null or v_ip is null then
    return false;
  end if;
  update public.legal_acceptances a set ip = v_ip
  where a.account_id = p_user and a.user_id = p_user and a.origin = 'cadastro' and a.ip is null
    and a.accepted_at > now() - interval '5 minutes'
    and exists (select 1 from public.legal_texts t where t.document = a.document and t.version = a.version and t.collects_ip);
  return found;
end
$$;

-- ---------------------------------------------------------------- 4) dados de abertura: libera quem aceitou o mesmo grupo de aceite
-- Igual à de …11500 com o remendo da …13660 (sem WhatsApp na regra). Novo: termo_uso.valid = a pessoa aceitou a versão vigente ou
-- outra do MESMO grupo de aceite (legal_texts.acceptance_group); sem texto publicado da vigente, vale só a mesma versão (como antes).
-- "accepted" continua sendo a versão aceita mais próxima da vigente (a vigente; senão, a do mesmo grupo; senão, a mais recente).
-- Contrato 3.0, cláusula 6.5-A (decisão do dono de 17/10): quem JÁ tinha aceitado uma versão anterior e tem plano pago ATIVO (plano
-- que não é o teste, situação "active", fim do período no futuro) continua usando o app até o fim do período pago sem a tela de
-- aceite (grace_until = fim do período; o app mostra um aviso com o botão para ler e aceitar). Depois disso, a tela volta a ser
-- obrigatória. Quem está no teste ou na amostra vê a tela na hora. Renovar o plano exigirá o aceite novo (regra da cobrança).
create or replace function public.app_legal_state() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  v_docs jsonb;
  v_student boolean;
  v_phone_missing boolean;
  v_requires boolean;
  v_group text;
  v_valid boolean;
  v_grace timestamptz;
begin
  if v_user is null then
    return null;
  end if;

  select t.acceptance_group into v_group
  from public.legal_versions v join public.legal_texts t on t.document = v.document and t.version = v.version
  where v.document = 'termo_uso';

  select jsonb_object_agg(v.document, jsonb_build_object('current', v.version, 'accepted', a.version, 'accepted_at', a.accepted_at))
    into v_docs
  from public.legal_versions v
  left join lateral (
    select x.version, x.accepted_at
    from public.legal_acceptances x
    left join public.legal_texts g on g.document = x.document and g.version = x.version
    where x.user_id = v_user and x.document = v.document
    order by (x.version = v.version) desc, (v.document = 'termo_uso' and g.acceptance_group is not distinct from v_group and v_group is not null) desc,
             x.accepted_at desc, x.id desc
    limit 1
  ) a on true
  where v.document in ('termo_uso', 'tutor_ia');

  v_valid := exists (
    select 1
    from public.legal_acceptances x
    join public.legal_versions v on v.document = x.document
    left join public.legal_texts g on g.document = x.document and g.version = x.version
    where x.user_id = v_user and x.document = 'termo_uso'
      and (x.version = v.version or (v_group is not null and g.acceptance_group = v_group)));

  if not v_valid and exists (select 1 from public.legal_acceptances x where x.user_id = v_user and x.document = 'termo_uso') then
    select s.current_period_end into v_grace
    from public.subscriptions s
    where s.user_id = v_user and s.plan::text <> 'trial' and s.status::text = 'active' and s.current_period_end > now();
  end if;

  v_student := public.legal_is_student(v_user);
  v_phone_missing := not exists (select 1 from public.profiles p where p.id = v_user and p.phone is not null);
  v_requires := coalesce((select v.requires_declarations from public.legal_versions v where v.document = 'termo_uso'), false);

  return jsonb_build_object(
    'termo_uso', (v_docs -> 'termo_uso') || jsonb_build_object('valid', v_valid),
    'tutor_ia', v_docs -> 'tutor_ia',
    'student', v_student,
    'phone_missing', v_phone_missing,
    'grace_until', case when v_student then v_grace end,
    'gate_required', v_student and not v_valid and v_grace is null
  ) || case when v_requires then jsonb_build_object('declarations_required', true) else '{}'::jsonb end;
end
$$;

-- ---------------------------------------------------------------- 5) funções do site
-- Versões vigentes (sem o texto) e o resumo do que mudou. Aberta também sem login (cadastro e páginas públicas).
create or replace function public.app_legal_current() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(v.document, jsonb_build_object(
           'version', v.version, 'title', t.title, 'sha256', t.sha256, 'acceptance_group', t.acceptance_group,
           'collects_ip', t.collects_ip, 'changes', coalesce(t.changes, '[]'::jsonb), 'published_at', t.published_at)), '{}'::jsonb)
  from public.legal_versions v
  left join public.legal_texts t on t.document = v.document and t.version = v.version
$$;

-- Texto de uma versão publicada (sem p_version: a vigente). Nulo se não existir. Aberta também sem login: os textos são públicos.
create or replace function public.app_legal_text(p_document text, p_version text default null) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('document', t.document, 'version', t.version, 'title', t.title, 'body', t.body, 'sha256', t.sha256,
                            'acceptance_group', t.acceptance_group, 'published_at', t.published_at)
  from public.legal_texts t
  where t.document = p_document
    and t.version = coalesce(p_version, (select v.version from public.legal_versions v where v.document = p_document))
$$;

-- Minha Conta → Documentos: os aceites do Contrato/Termo da própria pessoa, do mais novo ao mais velho, com o código do texto e as
-- versões da Política e do Regulamento vigentes no aceite. Sem IP nem navegador aqui (estão na exportação dos dados).
create or replace function public.app_my_legal_documents() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'document', a.document, 'version', a.version, 'accepted_at', a.accepted_at, 'origin', a.origin,
             'text_sha256', a.text_sha256, 'title', t.title, 'stored', t.document is not null,
             'companions', coalesce(a.companions, '{}'::jsonb))
           order by a.accepted_at desc, a.id desc)
    from public.legal_acceptances a
    left join public.legal_texts t on t.document = a.document and t.version = a.version
    where a.user_id = v_user and a.document = 'termo_uso'), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- 6) exportação dos dados: o aceite com IP e código do texto
-- Remendo da versão que está no banco (…11500): só o trecho dos aceites. Já remendada: não faz nada.
do $exporta$
declare
  v_fn constant regprocedure := to_regprocedure('public.app_export_my_data()');
  v_def text;
  v_de constant text := '''user_agent'', t.user_agent)';
  v_para constant text := '''user_agent'', t.user_agent, ''ip'', host(t.ip), ''text_sha256'', t.text_sha256, ''companions'', t.companions)';
begin
  if v_fn is null then
    raise exception 'termo 3.0: public.app_export_my_data() não existe';
  end if;
  v_def := pg_get_functiondef(v_fn);
  if position(v_para in v_def) > 0 then
    return;
  end if;
  if position(v_de in v_def) = 0 then
    raise exception 'termo 3.0: app_export_my_data no banco é diferente da esperada (trecho dos aceites); nada foi mudado';
  end if;
  execute replace(v_def, v_de, v_para);
end
$exporta$;

-- ---------------------------------------------------------------- 7) permissões
revoke execute on function public.legal_text_sha256(text) from public, anon, authenticated;
revoke execute on function public.legal_publish(text, text, text, text, text, boolean, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.legal_request_ip() from public, anon, authenticated;
revoke execute on function public.legal_acceptances_carimbo() from public, anon, authenticated;
revoke execute on function public.legal_acceptances_imutavel() from public, anon, authenticated;
revoke execute on function public.legal_texts_imutavel() from public, anon, authenticated;
revoke execute on function public.app_my_legal_documents() from public, anon;
grant execute on function public.app_my_legal_documents() to authenticated;
grant execute on function public.app_legal_current() to anon, authenticated;
grant execute on function public.app_legal_text(text, text) to anon, authenticated;
grant execute on function public.app_legal_cadastro_ip(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- 8) os textos 3.0 e a troca da versão vigente
-- A partir daqui o 3.0 vale: quem entra no app aceita de novo. O IP passa a ser guardado no aceite do Contrato (Política 3.0, 9.1).
select public.legal_publish('politica_privacidade', '3.0', 'Política de Privacidade', $politica_v3${{POLITICA}}$politica_v3$, '3.0', false, '[]'::jsonb, true);

select public.legal_publish('regulamento', '1.0', 'Regulamento de Stazia Coins, XP, Ligas, Conquistas e Benefícios de Parceiros', $regulamento_v1${{REGULAMENTO}}$regulamento_v1$, '1.0', false, '[]'::jsonb, true);

select public.legal_publish('termo_uso', '3.0', 'Contrato de Assinatura e Termos de Uso', $contrato_v3${{CONTRATO}}$contrato_v3$, '3.0', true, {{MUDANCAS}}::jsonb, true);

-- a caixa do aceite continua trazendo a declaração de maioridade (cláusula 5; decisão do dono de 17/10: caixa única, sem "médico")
update public.legal_versions set requires_declarations = true where document = 'termo_uso' and not requires_declarations;

-- ---------------------------------------------------------------- 9) conferência final (se algo não bater, PARA com erro)
do $confere_fim$
declare
  r record;
begin
  for r in select * from (values
      ('termo_uso', '3.0', '{{SHA_CONTRATO}}'),
      ('politica_privacidade', '3.0', '{{SHA_POLITICA}}'),
      ('regulamento', '1.0', '{{SHA_REGULAMENTO}}')) as x(doc, ver, sha)
  loop
    if not exists (select 1 from public.legal_versions v join public.legal_texts t on t.document = v.document and t.version = v.version
                   where v.document = r.doc and v.version = r.ver and t.sha256 = r.sha) then
      raise exception 'termo 3.0: % % não ficou vigente com o texto esperado (código %); nada foi mudado', r.doc, r.ver, r.sha;
    end if;
  end loop;
  if not (select requires_declarations from public.legal_versions where document = 'termo_uso') then
    raise exception 'termo 3.0: a declaração de maioridade não ficou obrigatória';
  end if;
  if (select version from public.legal_versions where document = 'tutor_ia') is null then
    raise exception 'termo 3.0: o aceite dos Tutores sumiu de legal_versions';
  end if;
  if position('v_phone_missing)' in pg_get_functiondef('public.app_legal_state()'::regprocedure)) > 0
     or position('not v_valid and v_grace is null' in pg_get_functiondef('public.app_legal_state()'::regprocedure)) = 0 then
    raise exception 'termo 3.0: app_legal_state não ficou com a regra nova';
  end if;
  if has_function_privilege('anon', 'public.legal_publish(text, text, text, text, text, boolean, jsonb, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.legal_publish(text, text, text, text, text, boolean, jsonb, boolean)', 'execute')
     or has_function_privilege('anon', 'public.app_my_legal_documents()', 'execute') then
    raise exception 'termo 3.0: permissão aberta demais';
  end if;
end
$confere_fim$;
