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
select public.legal_publish('politica_privacidade', '3.0', 'Política de Privacidade', $politica_v3$# POLÍTICA DE PRIVACIDADE — StaziaMed Revalida
**Versão 3.0 — outubro de 2026** (acompanha o Contrato de Assinatura v3.0)

## CONTROLADORA DOS DADOS
STAZIA TECNOLOGIA E EDUCAÇÃO LTDA — CNPJ 64.964.213/0001-16
Rua Visconde do Rio Branco, 1488, Conj. 909, 9º andar, Centro, Curitiba/PR, CEP 80.420-210.
StaziaMed Revalida é um produto licenciado da Stazia.

**Encarregado pelo tratamento de dados (DPO):** João Paulo Mendes, privacidade@staziamed.com.br. **Atendimento:** suporte@staziamed.com.br; telefone/WhatsApp (41) 99903-1074, segunda a sexta, 9h às 18h. Endereço: Conj. 909, 9º andar.

## 1. Dados tratados

Podemos tratar dados de cadastro e autenticação, perfil, plano, pagamentos, dispositivo, IP, registros de acesso, suporte e dados de aprendizagem, como respostas, desempenho, metas, histórico e interações com o tutor.

Guardamos também o registro do aceite do Contrato e dos Termos de Uso, que inclui a declaração de que você tem 18 anos ou mais e é plenamente capaz, a data e a hora, o seu IP e outros dados, como prova da contratação (veja a seção 9).

Quando você usa o microfone do tutor, tratamos o áudio da sua voz e o texto da sua fala (transcrição), como explicado na seção 3.

Quando você contrata um plano ou um pacote extra, tratamos dados de cobrança: plano, valores, datas, forma e status do pagamento, e os dados exigidos pelo meio de pagamento (seção 4). Quando você usa funções de comunidade (Treino em Dupla e semelhantes), tratamos o perfil que você escolhe exibir, o conteúdo trocado e eventuais denúncias.

A plataforma é destinada a maiores de 18 anos e não coleta intencionalmente dados de crianças e adolescentes.

**Dados das funções do aplicativo.** Além do acima, tratamos: (a) **Nivelamento**: suas respostas ao diagnóstico e a estimativa de proficiência por área, usadas para montar o **Plano de Hoje**; (b) **estudo**: questões, simulados, flashcards, aulas vistas, caderno de erros, metas, cronograma; (c) **treino sozinho (2ª fase)**: o texto que você escreve e a avaliação feita por IA; (d) **perfil de Treino em Dupla, Match e Radar**: nome público, **@ único** (trocável a cada 15 dias), cidade que você informa, instituição, prova, áreas, papel, ritmo, disponibilidade e se aparece no radar, **nunca e-mail, telefone ou foto**; (e) **chat**: mensagens, que ficam registradas no banco de dados enquanto a conta existir (seção 5), e **denúncias** (conteúdo por 6 meses e registro mínimo por 3 anos após o fechamento); (e-bis) **memória de estilo do Tutor** (seção 3); (f) **gamificação**: XP, Coins, ligas, ranking, conquistas e preferências de sons; (g) **créditos e minutos**: registro de consumo de IA e de voz (o que consumiu, quando e quanto), para cobrar o limite do plano e dos extras; (h) **teste grátis**: conta com e-mail confirmado, para garantir um teste por conta e por fase (o cadastro não coleta mais telefone ou WhatsApp); (i-bis) **sessão da conta**: tipo de aparelho e navegador, hora de entrada e da última verificação e um código técnico cifrado do login (sem IP e sem localização), para permitir **uma sessão ativa por vez**; (i-ter) **IP no teste grátis**: usado como alerta antifraude (muitos testes do mesmo IP em poucos dias pedem verificação extra, sem bloqueio automático), guardado de forma minimizada (código/hash); (i) **e-mails de serviço**: confirmação de cadastro, recuperação de senha, avisos de segurança e de cobrança.

## 2. Como usamos os dados

Usamos os dados para criar e proteger sua conta, prestar o serviço, personalizar estudos, processar pagamentos, atender solicitações, prevenir fraudes, cumprir obrigações legais e melhorar a plataforma. As bases legais incluem execução de contrato, consentimento quando aplicável, obrigação legal e legítimo interesse avaliado nos termos da Lei nº 13.709/2018 - Lei Geral de Proteção de Dados Pessoais (LGPD).

**Finalidades e bases legais, em detalhe:**

| Finalidade | Dados | Base legal (LGPD) |
|---|---|---|
| Criar e manter a conta, autenticar | nome, e-mail, senha (guardada de forma protegida) | Execução do contrato (art. 7º, V) |
| Prestar o serviço e personalizar estudos | desempenho, respostas, plano, histórico | Execução do contrato; legítimo interesse (art. 7º, IX) |
| Cobrança, renovação, nota fiscal, reembolso | dados de cobrança, plano, valores, status, CPF (pedido só no pagamento) | Execução do contrato; obrigação legal e regulatória (art. 7º, II) |
| Registro do aceite do contrato (inclui IP) | veja a seção 9 | Execução do contrato (art. 7º, V); exercício regular de direitos (art. 7º, VI); legítimo interesse (art. 7º, IX, e art. 10) |
| Registros de acesso (IP, data e hora) | IP, data, hora | Obrigação legal (Marco Civil da Internet, art. 15) |
| Segurança e prevenção de fraude (inclui gamificação) | IP, dispositivo, registros, padrões de uso | Legítimo interesse (art. 7º, IX) |
| Sessão única por conta (segurança da conta e prevenção de compartilhamento) | tipo de aparelho e navegador (por exemplo, "Chrome · Windows"), hora de entrada, hora da última verificação e código técnico cifrado do login. **Não guardamos IP nem localização para isso** | Execução do contrato; legítimo interesse (art. 7º, IX) |
| Tutor de IA por texto | mensagens, contexto de estudo | Execução do contrato |
| Tutor por voz | áudio da voz (não gravado), transcrição | Consentimento (art. 7º, I), que pode ser retirado |
| Suporte | mensagens, dados da conta | Execução do contrato; legítimo interesse |
| Comunidade e Treino em Dupla (relatos, denúncias, moderação) | perfil exibido, conteúdo, denúncias | Execução do contrato; legítimo interesse; exercício regular de direitos |
| Novidades e ofertas (marketing) | e-mail | Consentimento (art. 7º, I), em caixa opcional e separada |
| Benefícios de empresas parceiras | status do plano e, só se necessário, dados indicados por você | Execução do contrato; consentimento específico quando houver envio de dados ao parceiro |
| Obrigações legais e defesa de direitos | dados necessários | Art. 7º, II e VI |
| Nivelamento e Plano de Hoje | respostas ao diagnóstico, desempenho | Execução do contrato |
| Treino sozinho com IA | texto do aluno, avaliação | Execução do contrato |
| Match e Radar | perfil público, cidade, preferências, curtidas, bloqueios | Execução do contrato; consentimento ao ligar "Aparecer no radar" |
| Controle de créditos e minutos | registro de consumo de IA e voz | Execução do contrato |
| Limite do teste grátis (um por conta) | conta e e-mail confirmado; sinais de segurança do acesso | Legítimo interesse (art. 7º, IX), prevenção de fraude |
| Alerta antifraude no teste grátis | IP de quem inicia o teste, guardado de forma minimizada (código/hash); serve só de alerta, nunca bloqueia sozinho | Legítimo interesse (art. 7º, IX, e art. 10), prevenção de fraude |
| E-mails de serviço | e-mail, nome, eventos da conta | Execução do contrato |
| Memória de estilo do Tutor | preferências de estilo de interação (sem dados pessoais e sem estado emocional ou de saúde) | Execução do contrato; legítimo interesse (art. 7º, IX) |

## 3. IA, voz e personalização

Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação. Não envie dados reais de pacientes, prontuários, informações sujeitas a sigilo ou dados sobre a sua própria saúde.

**Fornecedores dos Tutores de IA.** O Tutor usa **provedores de inteligência artificial** para escrever as respostas e processar o conteúdo, **provedores de voz** para a conversa ao vivo e a transcrição da fala, e **provedor de voz sintética** para a voz do professor (que recebe só o texto da resposta, e não a sua voz). Os provedores de IA não usam os dados dos alunos para treinar seus modelos, por contrato empresarial, e **a Stazia não usa as conversas com o Tutor para treinar IA**. Se um provedor que receba a sua voz mudar de modo relevante, atualizaremos esta Política e, se for material, pediremos novo aceite.

**Áudio da sua voz.** O microfone é opcional. Quando você o liga, o áudio é enviado ao fornecedor só para ser transformado em texto ou respondido na hora. O StaziaMed não grava o áudio, não usa a sua voz para identificar você, não cria cópia da sua voz e não a usa para treinar modelos. A base legal é o seu consentimento, que você pode retirar deixando de usar o microfone ou pedindo pelo suporte. A conversa por voz ao vivo consome os minutos de voz do seu plano ou dos pacotes extras; para medir o consumo, guardamos a duração das sessões.

**Transcrição.** O texto das falas da conversa por voz pode ficar no histórico da conversa por até 7 dias e depois é apagado automaticamente. As conversas por escrito ficam no histórico enquanto a conta existir. Em casos limitados (suporte a pedido seu, segurança, prevenção de abuso e apuração de violação do Contrato), pessoas autorizadas da Stazia, sujeitas a sigilo, podem acessar o conteúdo das conversas. Não usamos conversas para treinar IA.

**Adaptação de tom e memória de estilo.** Durante a conversa, o Tutor adapta o tom ao contexto da sua fala; essa adaptação momentânea vale só na sessão e não é diagnóstico. Para tornar a experiência mais imersiva, **guardamos o seu estilo de interação** (por exemplo, se gosta de humor, o ritmo, respostas curtas ou longas, a personalidade preferida e como aprende melhor). **Não guardamos dados pessoais nem estado emocional ou de saúde nessa memória.** Você pode **ver, apagar e desligar** essa memória nas Preferências do Tutor. Base legal: execução do contrato (personalização do serviço contratado) e, no que for além do necessário ao contrato, legítimo interesse (art. 7º, IX), garantido o seu direito de oposição ao desligar a função.

**Sigilo do sistema.** O Tutor não revela instruções internas, chaves nem a tecnologia usada.

**Janelinha do Tutor.** Nas Questões, Simulados e Aulas, a janelinha usa o contexto da tela (por exemplo, a questão aberta) para ajudar você; em simulado em andamento ela fica travada.

**Voz ao vivo e voz do professor.** Na voz ao vivo, o áudio vai a um provedor de IA de voz, só para a conversa; na voz do professor, só o texto da resposta vai ao provedor de voz sintética.

**Retenção nos fornecedores.** Cada fornecedor pode manter registros do que recebeu por um período limitado, conforme as próprias regras (por exemplo, para segurança e prevenção de abuso), e alguns processam dados fora do Brasil. Contratamos serviços profissionais pagos, nos quais, segundo as regras dos fornecedores, os dados não são usados para treinar modelos sem autorização.

**Palavrões e humor adulto.** Os 2 personagens (Stazi e Stazia) têm 2 personalidades cada (Durão/Durona e Tranquilo/Tranquila). Toda a plataforma é restrita a maiores de 18 anos (declaração do Contrato). O Durão e a Durona usam, **por padrão, gritos, ironia e palavrões**, sempre dirigidos à resposta e nunca à pessoa, depois de um aviso claro antes da primeira conversa. Você pode baixar o nível ou desligar a qualquer momento nas preferências do tutor, e escolher Tranquilo ou Tranquila evita totalmente a linguagem forte. Se você parecer ansioso, frustrado ou abalado, ela é suspensa naquela fala.

## 4. Compartilhamento

Dados podem ser compartilhados com fornecedores de hospedagem, banco de dados, autenticação, pagamentos, análise, suporte, IA e voz, sob obrigações de segurança. Os fornecedores de IA e voz dos tutores estão descritos por categoria na seção 3. Também poderá haver compartilhamento por exigência legal ou proteção de direitos. Alguns fornecedores podem processar dados fora do Brasil com salvaguardas adequadas. Essas salvaguardas incluem cláusulas contratuais padrão ou garantias equivalentes, conforme a LGPD (art. 33). **Não vendemos seus dados pessoais.**

**Pagamentos.** Os pagamentos são processados por uma **instituição de pagamento**. Para cobrar, enviamos a ela os dados necessários (nome, e-mail, CPF, plano e valor). **CPF:** a instituição de pagamento exige o CPF para emitir a cobrança; por isso o pedimos **só na hora de pagar** (não no cadastro) e o repassamos a ela. A finalidade é emitir a cobrança e cumprir obrigações fiscais; a base legal é a execução do contrato e a obrigação legal/fiscal (LGPD, art. 7º, II e V). O pagamento é sempre à vista, por Pix, cartão de crédito ou cartão de débito. Só o cartão de crédito renova automaticamente; no Pix e no cartão de débito, cada período gera uma nova cobrança, paga na hora, e o acesso é liberado pela confirmação de pagamento que ela envia. Os dados do cartão são digitados no ambiente dela e não são armazenados por nós. Recebemos o status do pagamento. A instituição de pagamento atua como controladora independente dos dados financeiros, para processar o pagamento e cumprir suas obrigações regulatórias, conforme a política de privacidade dela.

**Empresas parceiras.** Divulgamos descontos de empresas parceiras. Não entregamos seus dados a parceiros sem base legal. Se for preciso enviar dados ao parceiro para você usar um desconto, avisamos quais e pedimos seu consentimento específico, que você pode retirar. Depois do envio, o parceiro trata os dados conforme a política dele. O ideal é que você use o desconto por cupom ou link, sem envio de dados.

**Fornecedores que tratam dados em nosso nome.** Usamos, por **categoria e finalidade**: (a) **hospedagem e banco de dados**, para manter o aplicativo e os seus dados; (b) **provedores de inteligência artificial**, para o Tutor e o processamento de conteúdo; (c) **voz**, para a conversa ao vivo, a transcrição e a voz do professor; (d) **pagamentos**, para cobrar; e (e) **envio de e-mails** de serviço. Alguns podem estar **no exterior**, com as salvaguardas da LGPD (art. 33). A **lista nominal** é informada a você **sob pedido** pelo e-mail privacidade@staziamed.com.br (LGPD, arts. 9º e 18, VII).

**Outros alunos.** Nas funções de comunidade (Treino em Dupla, Match, Radar e chat), o perfil que você escolher exibir (por exemplo, nome ou apelido, foto, nível) pode ser visto por quem faz dupla com você. No ranking, você pode **esconder o seu nome** nas preferências do aplicativo.

## 5. Retenção e segurança

Mantemos os dados pelo tempo necessário ao serviço e às obrigações legais, fiscais, contratuais e de segurança, conforme a tabela abaixo. Aplicamos controles técnicos e organizacionais, mas nenhum sistema é totalmente imune a incidentes. Em caso de incidente de segurança que possa causar risco ou dano relevante, comunicaremos você e a ANPD na forma da lei (LGPD, art. 48).

| Dado | Prazo |
|---|---|
| Conta e dados de estudo | Enquanto a conta existir. Se você **pedir a exclusão da conta**, os dados de estudo são apagados em até 15 dias, mantendo-se só o que a lei exigir (dados fiscais, registros de acesso e registro do aceite). Se você apenas **cancelar a assinatura paga**, a conta continua na modalidade gratuita e o progresso é mantido; contas gratuitas **sem nenhum acesso por mais de 12 meses** terão os dados de estudo eliminados ou anonimizados, **mediante aviso prévio ao seu e-mail com pelo menos 30 dias de antecedência**. O aviso é enviado automaticamente. |
| Conversas do tutor por escrito | Enquanto a conta existir |
| Transcrição de voz | 7 dias |
| Áudio da voz | Não é gravado |
| Registros de acesso (IP, data e hora) | 6 meses (Marco Civil da Internet, art. 15) |
| Registro do aceite do contrato (com IP) | Durante o contrato e 5 (cinco) anos depois do término |
| Dados de cobrança e fiscais | 5 (cinco) anos |
| Denúncias | Conteúdo das mensagens denunciadas: **6 meses** após o fechamento da denúncia. Registro mínimo (quem, quando, motivo e decisão): **3 anos** após o fechamento, para exercício regular de direitos em eventuais ações de reparação civil (Código Civil, art. 206, § 3º, V) |
| Mensagens do chat | Enquanto a conta existir. Ao encerrar a conta, são eliminadas ou anonimizadas, exceto as que façam parte de uma denúncia (conteúdo por 6 meses após o fechamento; registro mínimo por 3 anos, para exercício regular de direitos) |
| Registro de consumo de créditos e minutos | Enquanto a conta existir e pelo prazo fiscal quando ligado à cobrança |
| Nivelamento e treino sozinho | Enquanto a conta existir |
| Memória de estilo do Tutor | Até você apagar ou excluir a conta |
| IP do teste grátis (código/hash, alerta antifraude) | 90 dias |
| Dados da sessão/aparelho | Os do aparelho atual ficam enquanto a conta existir; os de aparelhos que saíram são apagados em até 90 dias |
| Marketing | Até você retirar o consentimento |
| Cópia do contrato do Aluno | Disponível em Minha Conta enquanto a conta existir |

## 6. Seus direitos

Nos termos da LGPD, você pode solicitar confirmação, acesso, correção, portabilidade quando aplicável, informação sobre compartilhamento, revisão, oposição, anonimização ou exclusão. A exclusão pode preservar dados que a lei ou a defesa de direitos exijam manter. Também pode retirar a qualquer momento um consentimento dado (por exemplo, marketing ou voz) e reclamar à Autoridade Nacional de Proteção de Dados (ANPD). Para exercer seus direitos, fale com o encarregado (veja o topo). Respondemos em até 15 dias.

## 7. Cookies

Utilizamos apenas armazenamento local e cookies essenciais (sessão, segurança, preferências e funcionamento). **Não usamos ferramentas de estatística ou propaganda de terceiros.** Se a plataforma passar a usar cookies não essenciais, pediremos o seu consentimento prévio.

## 8. Alterações e contato

Esta Política pode ser atualizada para refletir mudanças legais ou do produto. Solicitações de privacidade podem ser feitas pelos canais de suporte disponibilizados na plataforma. Aplicam-se a LGPD e as demais leis brasileiras. Mudanças materiais serão avisadas e, quando alterarem o tratamento dos seus dados de modo relevante, poderão exigir novo aceite. A versão vigente fica sempre disponível antes e depois da contratação.

**Alunos atuais:** esta versão é uma mudança material e será mostrada no próximo acesso para aceite junto com o Contrato v3.0.

## 9. Registro do aceite e cópias do contrato

**9.1 O que guardamos no aceite.** Quando você aceita o Contrato de Assinatura e os Termos de Uso, guardamos: a versão e o código de integridade (hash SHA-256) do texto aceito; a data e a hora do servidor; o **endereço IP**; o navegador e o dispositivo; o plano escolhido; o preço e as condições vigentes; e o identificador da sua conta.

**9.2 Para que usamos.** Para provar que o contrato foi aceito e qual era o texto; para defender direitos da Stazia e do Aluno em eventual reclamação, procedimento administrativo ou processo; e para prevenir fraude e acesso indevido.

**9.3 Base legal.** Execução do contrato (LGPD, art. 7º, V); exercício regular de direitos em processo judicial, administrativo ou arbitral (art. 7º, VI); e legítimo interesse na prevenção a fraudes e na segurança (art. 7º, IX, e art. 10).

**9.4 Por quanto tempo.** Durante o contrato e por 5 (cinco) anos depois do término, prazo ligado à prescrição de ações de consumo e de cobrança (Código de Defesa do Consumidor, art. 27; Código Civil, art. 206, § 5º). Depois, o IP e os demais dados do registro são eliminados ou anonimizados.

**9.5 Se você apagar a conta.** O registro do aceite é mantido de forma íntegra, com a sua identificação, pelo prazo acima, em ambiente isolado e de acesso restrito, exclusivamente para servir de prova em questionamentos legais ou auditorias (LGPD, art. 7º, VI, e art. 16, I). Não é usado para nenhuma outra finalidade. Você pode pedir informações sobre ele ao encarregado.

**9.6 Segurança.** O registro fica em ambiente com acesso restrito, sem acesso pelo navegador, e não pode ser alterado depois de gravado.

**9.7 Duas cópias do contrato.** Guardamos o contrato que você aceitou em duas cópias: uma disponível a você (em Minha Conta, para download e enviada ao seu e-mail) e outra no nosso sistema, junto com o registro do aceite, sem possibilidade de alteração. A cópia do sistema é mantida pelo prazo da seção 9.4.

---
© 2026 Stazia. StaziaMed Revalida é um produto licenciado da Stazia. Todos os direitos reservados.
$politica_v3$, '3.0', false, '[]'::jsonb, true);

select public.legal_publish('regulamento', '1.0', 'Regulamento de Stazia Coins, XP, Ligas, Conquistas e Benefícios de Parceiros', $regulamento_v1$# REGULAMENTO DE STAZIA COINS, XP, LIGAS, CONQUISTAS E BENEFÍCIOS DE PARCEIROS
**Versão 1.0 — outubro de 2026** — parte integrante do Contrato de Assinatura v3.0 (cláusulas 21 a 23)

Operadora: Stazia Tecnologia e Educação Ltda, CNPJ 64.964.213/0001-16.

## 1. O QUE É ESTE REGULAMENTO
1.1. Explica como funcionam XP, Stazia Coins, níveis, sequências, missões, conquistas, medalhas, ligas, ranking e temporadas do StaziaMed Revalida, e os Benefícios de empresas parceiras.
1.2. Se houver conflito com o Contrato, vale o Contrato.

## 2. NATUREZA: SEM VALOR EM DINHEIRO
2.1. XP, Coins, medalhas, níveis e posições são **recursos de motivação dentro da plataforma**. **Não são dinheiro, moeda, criptoativo, crédito financeiro ou direito de crédito.**
2.2. **Não podem ser:** comprados com dinheiro, vendidos, trocados ou doados fora da plataforma, transferidos entre contas, convertidos em dinheiro ou reembolsados. Qualquer tentativa é fraude (item 8).
2.3. Não formam patrimônio do Aluno e não geram direito adquirido, expectativa de ganho ou indenização.
2.4. A plataforma **não realiza sorteios, apostas ou distribuição de prêmios em dinheiro ou bens por sorte**. Qualquer promoção com prêmios de valor depende de autorização e regulamento próprios, nos termos da lei.

## 3. COMO SE GANHA XP
3.1. XP é concedido pelo **servidor** por atividades de estudo (por exemplo, responder questões, revisar flashcards, concluir tarefas do plano, assistir aulas, fazer simulados), segundo tabela de regras mantida pela Stazia. O navegador nunca define pontos.
3.2. As regras têm limites para evitar abuso (por exemplo, limite de pontos em sequências muito rápidas de respostas). **Erro não vale XP nem moedas**; a mesma questão só volta a valer pontos **3 dias** depois da última resposta; chutes detectados podem ter multa de 5 XP a partir do 3º do dia. A tabela de referência está no **Anexo** deste Regulamento e também no painel do aplicativo.
3.3. O XP determina o **nível** do Aluno e as posições nas ligas.

3.4. **Sons e celebrações.** A plataforma toca sons e mostra animações ao acertar, ganhar XP ou Coins, concluir missões, subir de nível ou de liga. Você pode **desligar** os sons nas configurações. Os efeitos são apenas visuais e sonoros e não alteram pontos.
3.5. **Treino sozinho (2ª fase).** O treino sozinho com avaliação por IA conta no seu histórico e na sua nota e **dá XP de estudo**, mas **não conta para as ligas** e fica fora de rankings de competição.

## 4. STAZIA COINS
4.1. Coins são concedidos por conquistas, missões, promoção de liga e outras ações descritas na plataforma.
4.2. Os Coins são um **bônus sem valor monetário** e podem ser trocados, dentro da plataforma, por serviços e benefícios que a Stazia definir (por exemplo, itens de personalização, benefícios de parceiros ou desconto em pacotes). As opções de troca de Coins serão anunciadas no app, com as regras de cada uma, com **30 dias de aviso** antes de ficarem disponíveis. As trocas valem as regras publicadas na plataforma, que podem mudar com **aviso prévio de 30 dias** para trocas novas ou alteradas (item 7). Os Coins não compram a assinatura dos planos nem se convertem em dinheiro.
4.3. **Validade.** Os Stazia Coins não expiram enquanto a sua conta estiver ativa. Se a conta ficar inativa (sem acesso) por 12 meses seguidos, o saldo de Coins e XP pode ser zerado, mediante aviso por e-mail com 30 dias de antecedência.
4.4. Coins obtidos por erro, falha ou fraude podem ser estornados.
4.4-A. **Coins e créditos de IA.** As trocas disponíveis dependem da lista vigente; Coins não viram créditos de IA ou minutos de voz, salvo se a lista de trocas expressamente previr, e o contrário também não (Contrato, cláusula 17.1-A).
4.5. Encerrada a conta a pedido do Aluno, por inadimplência ou por violação do Contrato, os Coins e o XP se perdem, sem compensação financeira. Se o encerramento ocorrer por falha ou por iniciativa da Stazia sem justa causa, a Stazia restabelece o saldo se a conta for reativada. Se o Aluno exercer o direito de arrependimento do plano (Contrato, cláusula 13), os Coins, o XP e os itens virtuais obtidos com ele são revogados.

## 5. LIGAS, RANKING E TEMPORADAS
5.1. As ligas funcionam em **temporadas semanais**: alunos são reunidos em grupos, somam XP na semana e, ao fim, os mais bem colocados podem subir de liga, e os demais manter ou descer, conforme a tabela vigente.
5.2. **Calendário e desempate.** A semana vai de **segunda-feira 0h a domingo 23h59, horário de Brasília**. Em caso de empate, vale a ordem: **XP da semana, depois número de acertos, depois quem chegou primeiro** à pontuação.
5.3. **Só sobe de liga quem teve XP da semana maior que zero.** Quem não estudou na semana não é promovido.
5.4. A posição em liga ou ranking **não tem relação com classificação oficial** em qualquer exame.
5.4-A. **Nome no ranking.** O ranking e as ligas mostram o seu **nome público ou @** (nunca e-mail ou telefone). O @ é único e pode ser trocado a cada 15 dias (Contrato, cláusula 22.1-B). Ranking, ligas e Match são recursos da fase em que o seu plano dá acesso; recursos da 2ª fase podem estar fechados (Contrato, cláusula 2.2-A).
5.5. A exibição do seu nome ou apelido e foto no ranking segue suas configurações de privacidade; você pode optar por aparecer de forma anônima.

## 6. CONQUISTAS, MEDALHAS, MISSÕES E SEQUÊNCIAS
6.1. Dependem do cumprimento de critérios exibidos na plataforma. A sequência (dias seguidos) é contada pelo dia no horário de Brasília e pode ter proteções (por exemplo, congelamento) conforme a plataforma indicar.
6.2. Se a plataforma ficar indisponível por falha da Stazia por tempo que impeça o estudo no dia, as sequências ativas são congeladas ou restauradas.
6.3. A Stazia pode corrigir conquistas concedidas ou negadas por erro técnico.

## 7. MUDANÇA DAS REGRAS
7.1. A Stazia pode realizar ajustes e balanceamentos nas regras, tabelas, recompensas, temporadas e ligas, para manter a competição justa e o funcionamento técnico.
7.2. Avisa na plataforma com pelo menos **7 dias** de antecedência ou, se for urgente (fraude, falha), logo depois.
7.3. Recompensas **já conquistadas** não serão reduzidas retroativamente, salvo por erro, falha técnica ou fraude.
7.4. Se a Stazia decidir encerrar o sistema de gamificação por inteiro e em definitivo, avisa os alunos ativos com **30 dias** de antecedência. Por ser recurso acessório de motivação, o encerramento não gera reembolso do plano já usufruído, mas o Aluno pode **cancelar a renovação ou rescindir o contrato sem multa**, com devolução proporcional do período pago e não usufruído se a gamificação tiver sido anunciada como parte da oferta contratada.

## 8. ANTIFRAUDE
8.1. São proibidos: bots, scripts, automação; múltiplas contas; contas compartilhadas; exploração de falhas; respostas em massa sem estudo; combinar resultados entre alunos; qualquer meio de ganhar vantagem artificial.
8.2. A Stazia usa análises automáticas e manuais. Constatada irregularidade, pode: corrigir XP e Coins; retirar conquistas; excluir do ranking; suspender ou encerrar a conta, conforme gravidade e o Contrato (cláusula 27).
8.3. **Contestação.** O Aluno pode contestar pelo SAC (suporte@staziamed.com.br ou (41) 99903-1074), em até 15 dias, recebendo resposta fundamentada.

## 9. TREINO EM DUPLA E PONTOS DE INTERAÇÃO
9.1. O Treino em Dupla, o Stazia Match, o Radar e o chat seguem a cláusula 22 do Contrato (conduta, denúncia, bloqueio nos dois sentidos). As mensagens do chat ficam registradas pelo prazo da cláusula 22.3-A do Contrato; o conteúdo das mensagens denunciadas fica por 6 meses e o registro mínimo (quem, quando, motivo e decisão) por 3 anos após o fechamento da denúncia, para apuração e exercício regular de direitos, **sem prejuízo da guarda obrigatória dos registros de acesso a aplicações (IP, data e hora) por 6 meses, conforme o Marco Civil da Internet**. Pontos de atividades em dupla seguem as regras acima e podem ser retirados por denúncia procedente.

## 10. BENEFÍCIOS DE EMPRESAS PARCEIRAS
10.1. **Natureza.** Os Benefícios (descontos e ofertas de empresas parceiras em produtos e serviços) são **liberalidade da Stazia**, isto é, um **bônus voluntário**, que **não faz parte do preço, nem do conteúdo essencial** do plano, e **não gera obrigação** de oferecer qualquer parceiro, desconto, percentual ou quantidade.
10.2. **Revogável.** A Stazia pode **alterar, suspender ou encerrar** qualquer Benefício ou parceria, sem indenização, porque dependem de acordos com terceiros. Quando a decisão for da Stazia, avisa na plataforma com antecedência razoável; quando for imediata por decisão do parceiro, retira a oferta e avisa o mais rápido possível. Se o Benefício tiver sido anunciado como parte da oferta da assinatura, vale a cláusula 23.2 do Contrato.
10.3-A. Os Benefícios **não fazem parte** dos recursos de IA, créditos ou minutos do plano. A Stazia **evita** anunciar parceiros nas telas de preço e de comparação de planos. Se algum Benefício for exibido ali, será identificado como "bônus temporário, sujeito à disponibilidade do parceiro" e valerá a exceção da cláusula 23.2 do Contrato (manutenção pelo período do plano ou compensação equivalente).
10.3. **Elegibilidade.** Os Benefícios são oferecidos a **todos os planos pagos** com assinatura ativa e em dia. O teste grátis não dá acesso. A Stazia pode negar ou cancelar o Benefício em caso de fraude, uso indevido ou revenda de código.
10.4. **Como usar.** Pelo código, link ou procedimento indicado na oferta. Códigos são pessoais, e é proibido divulgá-los, revendê-los ou usá-los em nome de terceiros.
10.5. **Responsabilidade do parceiro.** A venda, a entrega, o preço, a qualidade, o prazo, a garantia, a nota fiscal, o atendimento, o arrependimento e a troca são de responsabilidade do parceiro, que é o fornecedor. A Stazia atua como divulgadora dos Benefícios, não vende, não garante e não intermedeia o pagamento, **exceto nos limites previstos na legislação de defesa do consumidor**. Reclamações sobre o produto ou serviço devem ser dirigidas ao parceiro. A Stazia pode, como cortesia, ajudar a encaminhar.
10.6. **Transparência.** A oferta de parceiro é identificada como tal. A Stazia pode receber remuneração de parceiros; isso não altera as condições do Benefício para o aluno (CDC, arts. 36 e 37).
10.7. **Dados e validação.** A Stazia não compartilha dados pessoais do Aluno com parceiros sem base legal. O Benefício é validado por **cupom ou código individual**, disponível na área do aluno, sem envio dos seus dados ao parceiro. Se algum parceiro precisar de dados, a Stazia informará quais e pedirá **consentimento específico e separado**, que pode ser revogado. O parceiro é controlador dos dados que receber dele e tem sua própria política.
10.8. **Valores e condições** dos descontos são os da oferta do parceiro, e podem mudar.
10.9. A divulgação não indica recomendação médica ou profissional dos produtos.

## 11. DADOS E PRIVACIDADE
11.1. O tratamento de dados da gamificação (atividade, XP, posição, nome ou apelido exibido) segue a Política de Privacidade. As bases legais são a execução do contrato (funcionamento do sistema) e o legítimo interesse e o exercício regular de direitos (segurança e prevenção a fraudes; LGPD, arts. 7º, VI e IX, e 10).

## 12. DISPOSIÇÕES FINAIS
12.1. Versões novas deste Regulamento são publicadas na plataforma. Mudanças materiais que prejudiquem o Aluno seguem a cláusula 6.5 do Contrato.
12.2. Foro e lei: os do Contrato (domicílio do consumidor; lei brasileira).

## ANEXO — TABELA DE REFERÊNCIA DE XP E MOEDAS
Valores de referência vigentes em outubro de 2026, ajustáveis pela Stazia com aviso (item 7). Erro vale 0 XP e 0 moedas.
| Ação | XP |
|---|---|
| Responder uma questão (parte do acerto) | 2 |
| Acertar questão | 6 |
| Acertar questão difícil (bônus) | 3 |
| Primeira tentativa correta (bônus) | 2 |
| Questão inédita, no acerto (bônus) | 2 |
| Acertar questão que errou antes (após a trava de 3 dias) | 4 |
| Corrigir erro anterior (após a trava) | 8 |
| 10 respostas válidas na sessão (1x ao dia) | 12 |
| 30 respostas válidas na sessão (1x ao dia) | 24 |
| Simulado completo (mín. 30 questões, nota mínima 60%, 1x ao dia) | 80 |
| Flashcard oficial revisado lembrando | 2 |
| Flashcard consolidado | 4 |
| Fila de flashcards do dia zerada (mín. 5 cartões) | 12 |
| Aula concluída | 16 |
| Plano de hoje concluído | 20 |
| Todas as missões do dia | 40 |
| Multa por chute detectado (a partir do 3º do dia) | −5 |
Moedas: 1 moeda a cada 10 acertos que pontuam no dia; 5 moedas por todas as missões do dia; 25 moedas por subir de liga. Os valores podem mudar; vale a tabela publicada no aplicativo.
$regulamento_v1$, '1.0', false, '[]'::jsonb, true);

select public.legal_publish('termo_uso', '3.0', 'Contrato de Assinatura e Termos de Uso', $contrato_v3$# CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS E ASSINATURA DE PLATAFORMA
## (com Termos de Uso integrados) — StaziaMed Revalida
**Versão 3.0 — outubro de 2026** (substitui o Termo de Aceite e Uso v2.0)

---

## QUADRO-RESUMO (leia primeiro)

Este quadro resume os pontos mais importantes. Ele não substitui o contrato completo, que você aceita ao marcar a caixa de aceite.

| Tema | Resumo |
|---|---|
| Quem presta o serviço | Stazia Tecnologia e Educação Ltda, CNPJ 64.964.213/0001-16 (cláusula 1) |
| O que é | Plataforma on-line de estudo para o Revalida e o ENAMED. É apoio educacional. **Não garante aprovação.** (cláusulas 2 e 3) |
| Quem pode contratar | Pessoa com **18 anos ou mais e plenamente capaz** (cláusula 5) |
| Teste grátis | 7 dias por fase, com limites de uso. Começa no cadastro, não pede cartão e não cobra sozinho ao fim. (cláusula 8) |
| Planos | PRO, PRÁTICA e ELITE, mensal ou trimestral, com os preços mostrados na hora da contratação (cláusula 9 e Anexo I) |
| Renovação | No cartão de crédito, a assinatura renova sozinha a cada período até você cancelar. No Pix e no cartão de débito, cada período é pago na hora. Você é avisado antes. (cláusula 10) |
| Cancelamento | A qualquer momento, pelo botão "Cancelar assinatura" em Minha Conta. Você usa o plano até o fim do período já pago. (cláusula 12) |
| Arrependimento | **7 dias** a partir da contratação, com devolução integral do que foi pago (cláusula 13) |
| Atraso de pagamento | Sem tolerância: se o pagamento não estiver confirmado no dia da renovação, o acesso pago é bloqueado na hora e volta sozinho quando pagar (cláusula 15) |
| Reajuste | Só na renovação, com aviso de no mínimo 30 dias. Se não concordar, cancele sem custo. (cláusula 16) |
| Extras de IA | Pacotes avulsos (Boost, Plus, Max) com validade de 30 dias (cláusula 17) |
| Tutor de IA | Pode errar. Não substitui médico, professor nem fonte oficial. Algumas personalidades usam palavrões, e você pode desligar. (cláusulas 18 a 20) |
| Coins, XP, ligas | Não valem dinheiro. Regras no Regulamento (cláusula 21) |
| Treino em Dupla e comunidade | Regras de conduta, denúncia e bloqueio (cláusula 22) |
| Parceiros | Descontos de empresas parceiras são um benefício opcional e revogável da Stazia (cláusula 23) |
| Seus dados | Política de Privacidade separada. Guardamos o IP e outros dados do aceite como prova (cláusulas 6 e 26) |
| Duas cópias do contrato | Uma é sua, outra fica no sistema com o registro do aceite (cláusula 6) |
| Quem já tem conta | Aceita a versão 3.0 no próximo acesso (cláusula 6.5-A) |
| Foro | O da sua cidade (cláusula 36) |

---

## 1. QUEM SOMOS E COMO FALAR COM A GENTE

1.1. **CONTRATADA:** STAZIA TECNOLOGIA E EDUCAÇÃO LTDA ("**Stazia**"), CNPJ 64.964.213/0001-16, com sede na Rua Visconde do Rio Branco, nº 1488, Conj. 909, 9º andar, Centro, Curitiba/PR, CEP 80.420-210. O StaziaMed Revalida é um produto licenciado da Stazia.

1.2. **CONTRATANTE:** a pessoa que cria conta e aceita este contrato ("**Aluno**" ou "**você**"), identificada pelos dados do cadastro.

1.3. **Atendimento (SAC):** suporte@staziamed.com.br; site www.staziamed.com.br. Telefone/WhatsApp: (41) 99903-1074, de segunda a sexta, das 9h às 18h. Prazo de resposta: confirmação imediata de recebimento por mensagem automática e resposta de mérito em até 5 dias úteis. Canais: suporte@staziamed.com.br (atendimento), privacidade@staziamed.com.br (dados pessoais) e (41) 99903-1074 (segunda a sexta, 9h às 18h) (Decreto 7.962/2013).

1.4. **Encarregado pelo tratamento de dados (DPO):** João Paulo Mendes, privacidade@staziamed.com.br. Pedidos de titulares são respondidos em até 15 dias.

1.5. Este contrato é formado por: (a) este texto; (b) o **Anexo I** (planos, limites e preços); (c) o **Regulamento de Stazia Coins, XP, Ligas e Benefícios de Parceiros** ("Regulamento"); e (d) a **Política de Privacidade**. Os documentos (b) e (c) integram o contrato. A Política de Privacidade é documento separado, que você declara ter tido acesso.

## 2. O QUE É O SERVIÇO

2.1. O StaziaMed Revalida é uma plataforma digital de **apoio educacional** para preparação ao Exame Nacional de Revalidação de Diplomas Médicos (Revalida) e ao ENAMED. Pode incluir aulas, Grandes Temas, questões, simulados, flashcards, revisões, caderno de erros, banco de imagens, cronogramas, análises de desempenho, estações práticas e simuladores da etapa prática, Treino em Dupla, Tutor de IA por texto e voz, gamificação e outros recursos. Quais recursos você usa depende do plano (Anexo I).

2.1-A. **Funções que podem fazer parte do serviço** (a lista pode mudar e depende do plano, conforme o Anexo I): **Nivelamento** (diagnóstico de proficiência, com cálculo automático, que estima seu nível por área e alimenta o **Plano de Hoje**); **Plano de Hoje** e cronograma; **Questões**, **Questões Inéditas** (autorais ou geradas por IA, sempre identificadas) e **simulados**; **Temas, Aulas, Mapas, Podcasts** (narração por voz sintética) e **Atualizações e Diretrizes**; **flashcards** e revisões; **caderno de erros**; **estações práticas, checklists e treino sozinho com avaliação por IA**; **Treino em Dupla, Stazia Match, Radar e chat**; **Tutor de IA** (texto, voz ao vivo e voz do professor, inclusive em janelinha dentro de Questões, Simulados e Aulas); **gamificação**; e **benefícios de parceiros**. Recursos novos podem ser lançados; a oferta exata aparece na tela do plano.

2.2-A. **Recursos "em breve" (2ª fase).** Funções marcadas "em breve" ainda não estão disponíveis. **Até a 2ª fase abrir, só o plano PRO fica à venda.** Os planos **PRÁTICA** e **ELITE** aparecem como "em breve" e **não podem ser contratados**. Quando a 2ª fase abrir, esses planos e seus preços entram à venda **com aviso** na plataforma e por e-mail. A Stazia **não promete data** de abertura. Quem já tem plano continua com o que contratou.

2.2. A Stazia **não tem vínculo** com o INEP, o Ministério da Educação, o Ministério da Saúde ou qualquer órgão que elabore, aplique ou corrija o Revalida ou o ENAMED, salvo se informado expressamente.

2.3. O serviço é prestado **à distância, pela internet**. Você precisa de aparelho, conexão e navegador compatíveis, por sua conta.

## 3. SEM GARANTIA DE APROVAÇÃO; CONTEÚDO MÉDICO

3.1. A obrigação da Stazia é **de meio**: oferecer as ferramentas e os conteúdos descritos, com cuidado e boa-fé. **A Stazia não garante aprovação, nota, classificação ou qualquer resultado em prova.** O resultado depende também de dedicação, conhecimento prévio e estratégia do Aluno, e de decisões de terceiros (banca, edital, INEP).

3.2. Estimativas, previsões de desempenho, simulados e rankings são ferramentas de estudo, não previsão oficial.

3.3. O conteúdo médico tem finalidade **exclusivamente educacional**. A medicina muda: protocolos, doses e condutas podem ser atualizados depois da publicação. A Stazia busca atualizar o conteúdo, sem garantir atualização instantânea. Havendo diferença entre o conteúdo da plataforma e edital, norma ou comunicado oficial, **prevalece o oficial**. Confira dados críticos nas fontes oficiais.

3.4. Casos clínicos, pacientes e estações são simulações, podem ser fictícios ou gerados por IA, e o desempenho neles não equivale ao resultado em prova oficial.

3.5. Questões autorais, simulados preditivos e questões geradas por IA **não são questões oficiais futuras**.

## 4. CADASTRO, CONTA E SEGURANÇA

4.1. Para usar o serviço você cria uma conta com dados verdadeiros, completos e atualizados (nome completo, e-mail e senha, ou conta Google). **O cadastro não pede telefone nem WhatsApp.** A **confirmação do cadastro por e-mail** (link enviado ao endereço informado) é necessária antes de liberar o acesso. Recomendações de segurança e avisos de conta (recuperação de senha, senha alterada, método de login vinculado) são enviados por e-mail.

4.2. A conta é **pessoal e intransferível**. Você é responsável pela guarda da senha e por tudo que ocorrer na sua conta, salvo se provar que o acesso indevido não decorreu de falha sua. Avise-nos logo em caso de suspeita de acesso indevido.

4.3. É proibido compartilhar, vender, emprestar ou alugar a conta, ou permitir que mais de uma pessoa use uma assinatura.

4.3-A. **Uma sessão ativa por vez.** A conta é pessoal e intransferível e só pode ter **uma sessão ativa por vez**. Se você entrar em um segundo aparelho ou navegador, a sessão do primeiro é encerrada, com o aviso "Sua conta foi aberta em outro aparelho". O uso simultâneo é bloqueado. Para isso, a Stazia registra o tipo de aparelho e navegador, a hora da entrada e da última verificação e um código técnico cifrado do login (sem IP e sem localização) (Política de Privacidade). Indício de compartilhamento da conta pode levar à suspensão, sempre com **direito de defesa** e contestação (cláusula 27).

4.4. Para proteger o serviço e os demais alunos, a Stazia pode monitorar sinais de uso incompatível com conta individual (por exemplo, sessões simultâneas, troca excessiva de dispositivos, localização aproximada) e, diante de indício, pedir nova autenticação ou restringir o acesso, respeitada a cláusula 27.

## 5. DECLARAÇÃO DE MAIORIDADE E CAPACIDADE

5.1. **Ao aceitar este contrato, você declara, sob sua responsabilidade, que tem 18 (dezoito) anos completos ou mais e que é plenamente capaz para contratar.** O serviço não é destinado a menores de 18 anos.

5.2. Você também declara que as informações do cadastro são verdadeiras.

5.3. Se a Stazia constatar que o Aluno é menor de 18 anos ou incapaz, a conta será encerrada e a contratação anulada, com a devolução dos valores pagos, e os dados serão tratados conforme a lei.

## 6. ACEITE ELETRÔNICO, VERSÕES E GUARDA DO CONTRATO

6.1. **Como você aceita.** O aceite é eletrônico (*clickwrap*): você marca a caixa, inicialmente desmarcada, com o texto "Li e aceito os Termos de Uso e o Contrato de Assinatura, declaro ter acesso à Política de Privacidade e declaro ter 18 anos ou mais", e clica em continuar. Os textos completos ficam acessíveis por link antes do aceite. A manifestação de vontade por meio eletrônico tem validade jurídica (Código Civil, art. 107; Medida Provisória 2.200-2/2001, art. 10, § 2º).

6.2. **Caixa de marketing separada.** O recebimento de comunicações promocionais depende de outra caixa, **opcional e desmarcada**. Não marcar não impede o uso do serviço (cláusula 32).

6.3. **O que fica registrado.** No momento do aceite a Stazia registra, em ambiente seguro: (a) a versão do contrato; (b) o código de integridade (*hash* SHA-256) do texto exato aceito; (c) a data e a hora, marcadas pelo servidor da Stazia; (d) o **endereço IP**; (e) o navegador e o dispositivo (*user agent*); (f) o plano escolhido; (g) o retrato do preço e das condições vigentes na contratação; (h) o identificador da sua conta. Esses dados servem para provar a contratação, o texto aceito e a autoria, e para prevenir fraude. As finalidades, a base legal e o prazo de guarda estão na Política de Privacidade.

6.4. **Duas cópias.** O contrato aceito é guardado em duas cópias: (a) a **cópia do Aluno**, disponível no painel (Minha Conta), para download e enviada ao e-mail cadastrado; (b) a **cópia do sistema**, mantida pela Stazia junto com o registro do aceite, de forma que não pode ser alterada depois (imutável). Em caso de dúvida, vale como prova o texto cujo código de integridade coincida com o registrado.

6.5. **Novas versões.** A Stazia pode atualizar este contrato por mudança legal, tecnológica, de funcionalidades ou de planos. A versão vigente fica sempre disponível na plataforma. Mudança **material** (que afete preço, limites, direitos, tratamento de dados ou o serviço contratado) será avisada com antecedência mínima de **30 dias** e dependerá de **novo aceite**. O simples uso do serviço depois do aviso **não** é aceite tácito de mudança material. Quem não aceitar poderá cancelar sem ônus (cláusula 12) e, se já pagou período que será afetado, ter devolução proporcional do período não usufruído. Mudanças não materiais (correção de texto, endereço, contatos) valem a partir da publicação.

6.5-A. **Alunos que já têm conta.** A versão 3.0 é uma mudança material. Quem já tem conta e aceitou versão anterior verá a nova versão **no próximo acesso**. Para renovar a assinatura e usar os recursos novos, será necessário aceitá-la na forma da cláusula 6.1. **Se você não aceitar, continua com o acesso do período já pago sob as regras da versão anterior até o fim desse período**; depois, a assinatura não renova e a conta passa para a amostra diária. Se preferir, pode cancelar na hora e pedir a devolução proporcional do período pago e não usufruído (cláusula 6.5). Quem está só no teste ou na amostra e não aceitar fica restrito à tela de aceite, ao pedido de cancelamento e à exportação dos próprios dados.

6.6. **Comunicações eletrônicas.** Você concorda em receber avisos contratuais e operacionais (cobrança, renovação, mudança do contrato, segurança) por e-mail e pela plataforma. A Stazia não usa telefone ou WhatsApp para avisos, salvo se você mesmo entrar em contato por esses canais. São e-mails de serviço: confirmação de cadastro, recuperação de senha, avisos de segurança, confirmação de contratação com a **sua cópia do contrato**, avisos de renovação, de cobrança, de fim de teste e de saldo de extras. Mantenha seus dados de contato atualizados.

## 7. LICENÇA DE USO E PROPRIEDADE INTELECTUAL

7.1. A interface, o software, a marca, as aulas, vídeos, áudios, textos, questões autorais, explicações, mapas, flashcards, simulados, imagens, personagens (inclusive Stazi e Stazia) e demais conteúdos da plataforma pertencem à Stazia ou a terceiros licenciantes e são protegidos pela Lei 9.610/1998 (direitos autorais), pela Lei 9.279/1996 (propriedade industrial) e demais normas.

7.2. A contratação dá a você **licença pessoal, limitada, temporária, revogável nos casos deste contrato, não exclusiva e intransferível**, para acessar e usar o conteúdo **para seu estudo individual**, enquanto o contrato estiver vigente. Nada transfere propriedade.

7.3. Além do que dispõe a cláusula 7-A, é proibido, sem autorização escrita: copiar, reproduzir, baixar em massa, gravar, redistribuir, publicar (em grupos, redes ou plataformas), vender ou ceder conteúdos; compartilhar acesso; fazer *scraping*, usar robôs, extrair o banco de questões; explorar APIs privadas; fazer engenharia reversa; remover marcas ou avisos; usar o conteúdo para treinar modelos de IA ou criar produto concorrente.

7.4. **Conteúdo seu.** Anotações, respostas e mensagens que você cria continuam sendo seus. Você dá à Stazia licença não exclusiva, gratuita e limitada à operação do serviço (guardar, exibir a você, processar para funcionalidades como o Tutor e a personalização) e para segurança e defesa de direitos. Você declara ter direito sobre o que enviar.

7.5. **Conteúdo de terceiros** (artigos, diretrizes, documentos oficiais, INEP) pertence aos respectivos titulares.

## 7-A. PROTEÇÃO DA PROPRIEDADE INTELECTUAL E DO SERVIÇO

7-A.1. **Titularidade.** São de titularidade da Stazia, ou licenciados a ela, todos os direitos sobre: aulas, vídeos, áudios, podcasts, questões inéditas, comentários e explicações, flashcards, mapas, textos, imagens, simulados, estações e checklists, bases de dados, o software e o código, o layout e a interface, as vozes e os personagens **Stazi** e **Stazia**, e as marcas **StaziaMed**, **Stazia**, **Stazi** e seus logotipos. Esses bens são protegidos pela Lei 9.610/1998 (direitos autorais), pela Lei 9.609/1998 (programas de computador) e pela Lei 9.279/1996 (propriedade industrial e marcas). Nada neste contrato transfere a você qualquer desses direitos.

7-A.2. **Licença.** A licença que você recebe é **pessoal, intransferível, não exclusiva, revogável nos casos previstos neste contrato e limitada ao seu estudo individual**, enquanto o contrato estiver vigente.

7-A.3. **É proibido, sem autorização escrita da Stazia:**
a) copiar, reproduzir, baixar além do que a plataforma permite, **gravar a tela**, **fotografar ou capturar** o conteúdo (por foto, captura de tela ou outro meio);
b) compartilhar, redistribuir, revender, sublicenciar, ceder, alugar ou publicar o conteúdo em grupos, redes sociais, sites, aplicativos de mensagem ou qualquer outro meio;
c) criar cursos, apostilas, resumos comercializados ou outros materiais derivados a partir do conteúdo;
d) usar o conteúdo, as respostas ou as bases de dados para **treinar, alimentar, ajustar ou avaliar sistemas de inteligência artificial**;
e) fazer ***scraping***, usar *crawlers*, *bots* ou automatizar acessos e extrações;
f) **contornar** travas, cadeados de plano, limites de uso, sessão única ou qualquer medida técnica de proteção;
g) fazer **engenharia reversa**, descompilar, desmontar ou tentar obter o código-fonte;
h) explorar falhas ou testar invasão sem autorização escrita (falhas devem ser comunicadas ao suporte);
i) criar **contas falsas ou múltiplas**, ou **compartilhar login e senha**;
j) usar as marcas, os logotipos, as vozes ou os personagens sem autorização.
Estudar com anotações pessoais e usar os recursos de impressão ou exportação que a própria plataforma oferecer **não** são violação.

7-A.4. **Medidas técnicas e monitoramento.** A Stazia pode adotar **marca d'água ou identificação** nos materiais, **registros de acesso**, **sessão única** e outros controles, e **monitorar o uso indevido** do serviço, sempre nos limites da LGPD e da Política de Privacidade (finalidade de segurança e proteção de direitos).

7-A.5. **Consequências.** Havendo **fraude ou má-fé comprovada**, a Stazia pode, garantido o **direito de defesa** (cláusula 27): suspender ou cancelar a conta; remover o conteúdo publicado indevidamente; comunicar as autoridades; e exigir reparação por **perdas e danos**. O uso indevido pode gerar **responsabilidade civil** (Lei 9.610/1998, arts. 101 a 110) e **criminal** (Código Penal, art. 184; Lei 9.609/1998, art. 12; Lei 9.279/1996, arts. 189 e 190). **Este contrato não cria multa contratual abusiva contra o consumidor**: a reparação é a prevista em lei, proporcional ao dano comprovado.

7-A.6. **Conteúdo do aluno e sugestões.** O conteúdo que você cria continua seu; você concede à Stazia licença não exclusiva e gratuita **apenas para operar o serviço** (cláusula 7.4). **Feedback e sugestões** que você enviar sobre o serviço podem ser usados pela Stazia **sem compensação**, sem que isso transfira a você qualquer direito sobre o serviço.

7-A.7. **Confidencialidade.** Informações não públicas a que você tenha acesso por meio da plataforma (por exemplo, materiais em desenvolvimento, funcionalidades em teste, dados internos) são confidenciais e não podem ser divulgadas.

7-A.8. **Tolerância.** A Stazia deixar de exigir um direito, uma vez ou várias, **não significa renúncia**.

## 8. TESTE GRÁTIS DE 7 DIAS

8.1. Novos alunos podem ter **7 (sete) dias de teste grátis para cada fase** (1ª fase e 2ª fase, esta quando for aberta). O teste é **um por conta**, e a conta exige **e-mail confirmado** (cláusula 4.1). O teste dá acesso a **amostras** do conteúdo e tem limites de uso. O teste **começa no cadastro**, não pede cartão e inclui, por dia, uma **amostra de até cerca de 20 questões, 1 simulado curto, 3 Temas/aulas e até 10 flashcards por dia**, mais **5 créditos de IA por dia** e **2 minutos de voz ao vivo no total**. Na 2ª fase, quando aberta, a amostra diária inclui 1 estação, 1 checklist e 1 simulado prático. Os limites podem ser ajustados com aviso. Terminado o teste, há uma **amostra diária** de conteúdo, conforme a plataforma indicar.

8.2. O teste é gratuito, **não pede cartão de crédito nem qualquer meio de pagamento** e **não renova nem passa a ser cobrado automaticamente** ao fim. Antes do fim, você será avisado (ver textos da tela).

8.3. Ao fim do teste sem contratação, e também ao fim de um plano vencido ou cancelado, o acesso volta à **amostra diária**, limitado, e seus dados e progresso são **preservados** pelo prazo da cláusula 26.6, para você contratar depois. Você pode contratar a qualquer momento durante o teste, e a assinatura paga **começa na hora**.

8.4. Contratar durante ou depois do teste não retira seu direito de arrependimento (cláusula 13). O teste não substitui esse direito.

8.5. Criar várias contas ou usar dados falsos para obter novos testes é conduta proibida e autoriza a Stazia a bloquear as contas duplicadas. A Stazia não usa telefone para controlar o teste; o controle é por conta e e-mail confirmado, e por sinais de segurança do acesso (cláusula 4.4).

## 9. PLANOS, PREÇOS E FORMAS DE PAGAMENTO

9.1. Os planos são **PRO** (1ª fase e ENAMED), **PRÁTICA** (2ª fase) e **ELITE** (completo), em periodicidade **mensal** ou **trimestral**. O que cada plano inclui e **não inclui** (cadeados), os limites de uso de IA e de voz e os preços de lista estão no **Anexo I**. O preço aplicável é o **exibido na tela de contratação**, junto com o resumo da oferta, antes de você confirmar.

9.2. O preço mostrado já é o **preço total** (impostos incluídos), com a periodicidade, a data da primeira cobrança, as datas de renovação e as eventuais restrições (Decreto 7.962/2013, art. 2º).

9.3. **Cobrança.** Os pagamentos são processados por **instituição de pagamento terceira**, por **Pix, cartão de crédito ou cartão de débito, sempre à vista**. **A renovação automática é feita só no cartão de crédito; no Pix e no cartão de débito, cada período é pago na hora.** **Não há parcelamento nem boleto**; o plano trimestral é pago de uma vez. A Stazia não armazena o número completo do seu cartão. A **nota fiscal é emitida automaticamente a cada pagamento** pelo sistema de cobrança. **CPF.** Para emitir a cobrança e a nota fiscal, a instituição de pagamento exige o seu CPF. A Stazia o **pede só na hora de pagar** (não no cadastro) e o repassa a essa instituição (Política de Privacidade).

9.4. Cupons e promoções valem apenas nas condições anunciadas e não se acumulam, salvo se dito expressamente.

9.5. **Mudança de plano.** Para um plano maior (upgrade), a mudança vale na hora, com cobrança da diferença proporcional ao tempo restante calculada proporcionalmente aos dias (*pro rata die*), abatendo o valor dos dias não utilizados do plano anterior; **você paga só a diferença proporcional aos dias restantes**. Para um plano menor (downgrade), você continua com o plano maior até o fim do período já pago, e a mudança e o novo valor valem a partir da próxima renovação. **Quem perde o acesso a um recurso por mudança de plano mantém o progresso guardado** (por exemplo, os cartões de revisão), que volta se assinar de novo um plano que inclua o recurso.

## 10. RENOVAÇÃO AUTOMÁTICA

10.1. Pagando no **cartão de crédito**, a assinatura **renova automaticamente** por períodos iguais (um mês ou um trimestre) até o cancelamento, pelo mesmo preço vigente, salvo reajuste informado conforme a cláusula 16. No **Pix** e no **cartão de débito** não há renovação automática: cada período é pago na hora.

10.2. Antes de cada renovação (mensal ou trimestral), a Stazia envia **aviso por e-mail e por aviso na tela do aplicativo (pop-up em Avisos)**, em **7, 3 e 1 dia antes do vencimento**, informando valor, data e como cancelar.

10.3. Pagando por **Pix** ou **cartão de débito**, a Stazia gera a **cobrança 7 dias antes do vencimento**, para dar tempo de compensar, e avisa você (não há cobrança automática). No **cartão de crédito**, a cobrança é feita **no dia da renovação**. **O acesso ao novo período só é liberado com a confirmação de pagamento pela instituição de pagamento.** Se não houver confirmação no dia, vale a cláusula 15.

10.4. Se o pagamento da renovação falhar, vale a cláusula 15.

## 11. COMO O ACESSO FUNCIONA NO PERÍODO PAGO

11.1. O acesso ao plano vale por todo o período pago. Durante o período, a Stazia pode ajustar a disponibilidade de funcionalidades nos termos da cláusula 31, sem reduzir de forma substancial o que foi contratado.

## 12. CANCELAMENTO PELO ALUNO

12.1. Você pode cancelar **a qualquer momento**, **sem multa**, pelo botão "Cancelar assinatura" em Minha Conta, ou pelo SAC. O cancelamento deve ser possível pelo mesmo meio da contratação (Decreto 7.962/2013, art. 5º).

12.2. O cancelamento **impede novas cobranças**. Você continua usando o plano **até o fim do período já pago**. A Stazia confirma o cancelamento por e-mail na hora.

12.3. A regra completa de cancelamento e devolução, com fórmula e exemplos, está na **cláusula 13-A**. Resumo: plano mensal, sem devolução do mês em andamento; plano trimestral, devolução dos meses inteiros ainda não iniciados menos 10%, com acesso até o fim do mês em curso.

12.4. Ao fim do período pago após o cancelamento, os recursos do plano ficam bloqueados, a conta volta à amostra diária e você recebe convite para renovar. Seus dados e progresso são preservados (cláusula 26.6).

## 13. DIREITO DE ARREPENDIMENTO E REEMBOLSO

13.1. Como a contratação é feita pela internet, você pode **desistir em até 7 (sete) dias corridos** contados da contratação (da confirmação do pedido ou do primeiro acesso ao plano pago, o que ocorrer por último, para sua proteção) (CDC, art. 49). Para os extras de IA, vale a cláusula 13-A.5.

13.2. Exerça pelo botão "Desistir da compra (7 dias)" em Minha Conta ou pelo SAC. A Stazia confirma por e-mail na hora.

13.3. **Devolução integral** do valor pago pelo plano, **sem desconto pelo uso** nesse período, pelo mesmo meio de pagamento (cláusula 13-A.6). O acesso ao plano é encerrado. Para os Extras de IA vale a cláusula 13-A.5.

13.4. O prazo de 7 dias é contado da contratação paga, **mesmo que você já tenha usado o teste grátis**.

13.5. O exercício do direito de arrependimento é incondicional e a devolução dentro do prazo de 7 dias **não será negada**. Se a Stazia constatar **fraude ou má-fé comprovada** (por exemplo, compras, uso e pedidos de devolução sucessivos e repetidos pela mesma pessoa para burlar o pagamento), poderá **suspender a conta** por violação deste contrato (Código Civil, art. 187; cláusula 27), **garantido o direito de defesa** e sem afetar a devolução já devida.

13.6. Depois dos 7 dias, a devolução ocorre apenas nos casos de cobrança indevida em duplicidade, falha grave do serviço não corrigida, cancelamento por iniciativa da Stazia sem justa causa (devolução proporcional), ou outras hipóteses legais.

13.7. Cobrança que você não reconheça: fale com o SAC **antes** de contestar no cartão. Isso agiliza a solução. A contestação direta (*chargeback*) não é proibida e não prejudica seus direitos, mas, enquanto estiver em análise, a Stazia pode suspender o acesso ligado à cobrança contestada.

## 13-A. REGRA DE DEVOLUÇÃO (resumo claro)

13-A.1. **Valor do mês no trimestral** = preço do trimestre ÷ 3. Cada mês do plano conta a partir da data da contratação.

13-A.2. **(a) Até 7 dias da contratação (arrependimento):** devolução **integral** do plano (cláusula 13).

13-A.3. **(b) Plano mensal, depois dos 7 dias:** não há devolução do mês em andamento; o acesso vai **até o fim do mês pago**.

13-A.4. **(c) Plano trimestral, depois dos 7 dias:** a Stazia devolve os **meses inteiros que ainda não começaram**, **menos 10% desse valor**. O consumo de Extras **não** é descontado da devolução do plano (os Extras têm regra própria, no item 13-A.5). O mês em curso **não é devolvido** e o acesso continua **até o fim dele**; em caso de reclamação, o atendimento **pode, por liberalidade e a critério da Stazia**, calcular o mês em curso por dia (*pro rata die*), sem que isso seja obrigação.
Fórmula do plano: devolução = (meses inteiros ainda não iniciados × valor do mês) × 0,90.
Exemplos (cancelando depois dos 7 dias):
| Plano | Preço do trimestre | Valor do mês | Cancelando no 1º mês (2 meses não iniciados) | Cancelando no 2º mês (1 mês não iniciado) |
|---|---|---|---|---|
| PRO | R$ 269,70 | R$ 89,90 | (2 × 89,90) − 10% = R$ 161,82 | 89,90 − 10% = R$ 80,91 |
| PRÁTICA | R$ 458,70 | R$ 152,90 | (2 × 152,90) − 10% = R$ 275,22 | 152,90 − 10% = R$ 137,61 |
| ELITE | R$ 539,70 | R$ 179,90 | (2 × 179,90) − 10% = R$ 323,82 | 179,90 − 10% = R$ 161,91 |
Cancelando no 3º mês não há meses não iniciados, e portanto não há devolução do plano; o acesso vai até o fim do trimestre.

13-A.5. **(d) Extras de IA.** **Dentro de 7 dias** da compra: devolução **integral**, inclusive do que já foi usado (cláusula 13); fraude ou má-fé comprovada leva à suspensão da conta, com direito de defesa (cláusula 13.5). **Depois dos 7 dias:** a Stazia devolve **só os créditos não usados**, em proporção ao preço do pacote, **menos 10%**. Fórmula: devolução = (créditos não usados ÷ créditos do pacote) × preço do pacote × 0,90. Os **minutos de voz ao vivo** do pacote seguem a mesma regra e a mesma proporção: minutos não usados ÷ minutos do pacote × preço × 0,90. Os créditos já usados não são devolvidos. Os Extras vencidos (30 dias) não são devolvidos.
Exemplo conjunto: PRO trimestral cancelado no 2º mês = **R$ 80,91** (plano) **+** IA Boost de R$ 24,90 com 50 de 100 créditos usados: 50% × R$ 24,90 = R$ 12,45, menos 10% = **R$ 11,21** (extra). **Total devolvido: R$ 92,12.**

13-A.6. **(e) Como e quando o dinheiro volta:** em caso de **arrependimento (7 dias) pago no cartão de crédito**, a Stazia comunica a administradora **imediatamente** para providenciar o estorno, que pode aparecer em até duas faturas. Nos **demais cancelamentos** e nos pagamentos por **Pix** ou **cartão de débito**, a devolução é feita por transferência para a conta que você indicar, em até **10 dias úteis** depois da confirmação do pedido e da informação dos dados bancários. No arrependimento pago no cartão de crédito, o valor aparece conforme o fechamento da fatura da operadora.

13-A.7. Falha grave do serviço, cobrança em duplicidade e cancelamento por iniciativa da Stazia sem justa causa seguem a cláusula 13.6.

## 14. FALHA DO SERVIÇO E VÍCIOS

14.1. Se o serviço contratado apresentar vício ou falha grave que a Stazia não corrija em prazo razoável, você pode exigir, nos termos do CDC (art. 20), a reexecução do serviço, a devolução proporcional do valor pago ou o abatimento do preço.

## 15. ATRASO OU FALHA DE PAGAMENTO

15.1. Se a cobrança não for paga ou for recusada, a Stazia tenta novamente e avisa você por e-mail e na plataforma.

15.2. **Não há tolerância de atraso.** No dia da renovação, se o pagamento não estiver confirmado, o acesso aos recursos pagos é **bloqueado na hora** e você volta à **amostra diária**. Sua conta, seus dados e seu progresso são **preservados** e o acesso é **restabelecido automaticamente** quando o pagamento for confirmado.

15.3. Se passarem **30 dias sem pagamento**, a assinatura é **encerrada**. Como o acesso pago fica bloqueado enquanto não houver pagamento, **nada é cobrado pelo período sem acesso**. Os dados seguem a regra das contas inativas da Política de Privacidade.

15.4. **Não há multa, juros nem correção por atraso**: o acesso pago simplesmente fica bloqueado até o pagamento ser confirmado (cláusula 15.2).

15.5. A Stazia não ameaça nem expõe o Aluno a ridículo na cobrança (CDC, art. 42).

## 16. REAJUSTE DE PREÇO

16.1. O preço contratado fica **mantido durante o período já pago**. Os preços podem ser reajustados na renovação, respeitada a periodicidade mínima de **12 (doze) meses** contados da contratação ou do último reajuste (Lei 9.069/1995, art. 28, § 1º), com base na variação positiva do IPCA/IBGE ou, na falta dele, de índice oficial que o substitua, além de eventuais repasses de custos tributários ou de fornecedores essenciais, sempre com o aviso da cláusula 16.2.

16.2. O reajuste só vale se for **avisado com no mínimo 30 dias de antecedência**, com o valor novo e a data. Se você não concordar, pode **cancelar sem ônus** até a renovação (cláusula 12).

16.3. A Stazia pode lançar novos planos e preços para novas contratações sem afetar assinaturas em curso. **Quem já assina mantém o preço contratado por 12 meses**, contados da contratação, salvo promoção anunciada como temporária; depois disso vale a cláusula 16.1. Reajuste ocorre no máximo **uma vez a cada 12 meses**.

## 17. EXTRAS DE IA (BOOST, PLUS, MAX) E MINUTOS DE VOZ AO VIVO

17.1. Cada plano inclui um limite de uso de IA por dia, por semana e por mês e uma franquia de minutos de voz ao vivo (Anexo I). Quando o limite acaba, você pode comprar **pacotes avulsos** ("**Extras**"):

| Extra | Conteúdo | Preço de lista | Validade |
|---|---|---|---|
| IA Boost | 100 créditos de IA + 10 min de voz ao vivo | R$ 24,90 | 30 dias |
| IA Plus | 300 créditos de IA + 30 min de voz ao vivo | R$ 59,90 | 30 dias |
| IA Max | 700 créditos de IA + 70 min de voz ao vivo | R$ 129,90 | 30 dias |



17.1-A. **O que é um crédito.** Cada crédito de IA equivale ao consumo de inteligência artificial de aproximadamente R$ 0,10 de custo para a Stazia. Cada uso gasta créditos **conforme o custo real**, mostrado a você **após a resposta** e no saldo. Gastam créditos: mensagens do **Tutor por texto**, o uso do **Tutor em janelinha** (Questões, Simulados, Aulas), a **correção de estação** (treino sozinho com IA) e as **dicas**. A tabela de quanto cada recurso consome fica visível na plataforma e em Minha Conta, antes do uso. **Minutos de voz** são medidos à parte (cláusula 17.5). Créditos de IA **não são Stazia Coins** e não se convertem entre si.

17.2. **Consumo.** Primeiro se gasta o limite do plano; depois, o saldo dos Extras, do mais antigo para o mais novo. O saldo e o consumo ficam visíveis em Minha Conta.

17.3. **Validade de 30 dias** contados da compra. Se você comprar outro Extra antes do vencimento, o saldo não usado é somado ao novo e a validade de todo o saldo é renovada por mais 30 dias. Terminado o prazo sem renovação, o saldo não usado expira. A Stazia avisa por e-mail antes de expirar com pelo menos 5 dias de antecedência.

17.4. Extras são **pessoais, não transferíveis, não reembolsáveis em dinheiro e não conversíveis**, ressalvados o direito de arrependimento (cláusula 13), falha do serviço (devolução ou recomposição do saldo) e a lei.

17.5. Os minutos de voz ao vivo são medidos **por segundo**, pela duração da sessão com microfone ligado, **sem arredondar para o minuto**. A voz de leitura do professor (síntese de voz do texto) não consome a franquia de voz ao vivo. Consomem **créditos**: Tutor por texto, janelinha do Tutor (nas Questões, Simulados e Aulas), dica do Tutor na questão e correção de estação por IA. A **voz ao vivo** consome **minutos**.

17.6. Falha técnica comprovada que cause perda de saldo gera recomposição do saldo.

## 18. TUTOR DE INTELIGÊNCIA ARTIFICIAL

18.1. A plataforma tem **Tutores de IA** por texto e por voz: **2 personagens**, **Stazi** (menino) e **Stazia** (menina), cada um com **2 personalidades**, ao todo 4: **Durão** (Stazi) e **Durona** (Stazia), mais exigentes, e **Tranquilo** (Stazi) e **Tranquila** (Stazia), mais calmos. Você escolhe o personagem e a personalidade; a voz acompanha o personagem. O Tutor explica, faz perguntas, corrige respostas, simula preceptor e sugere revisões.

18.2. **O Tutor pode errar.** As respostas são geradas por IA generativa e podem ser imprecisas, incompletas ou desatualizadas. **Nenhuma resposta do Tutor é fonte oficial do Revalida ou do ENAMED.** Confira informações importantes nas fontes oficiais.

18.3. **O Tutor não substitui** professor, preceptor, literatura científica, protocolo oficial, avaliação ou atendimento médico. **Não use o Tutor como única base para decisão sobre paciente real.** Casos do sistema são simulações.

18.4. **Não envie dados de pacientes reais** (nome, CPF, prontuário, exames identificados, fotos identificáveis etc.) nem de terceiros, por texto ou voz. Se precisar estudar um caso real, remova antes qualquer identificação.

18.5. **Sigilo técnico.** O Tutor é uma ferramenta de aprendizado e não revela instruções internas, chaves ou detalhes técnicos de segurança do sistema. Tentativas de manipular ou burlar o Tutor (injeção de comandos, extração de instruções) são condutas proibidas (cláusula 27).

18.6. **Registros de conversa.** As conversas por **escrito** ficam no seu histórico enquanto sua conta existir, para seu uso, para continuidade do estudo e para personalização. O **texto** das falas das conversas por **voz** (transcrição) fica por até **7 dias** e é apagado automaticamente. A Stazia **não grava o áudio da sua voz**. Em casos limitados (suporte a pedido seu, segurança, prevenção de abuso e investigação de violação deste contrato), pessoas autorizadas da Stazia podem ter acesso ao conteúdo das conversas, com dever de sigilo. **As conversas não são usadas para treinar IA nem para "melhoria" com dados identificáveis**; só são usadas métricas agregadas e anônimas de qualidade, se for o caso.

18.7. **Fornecedores de IA.** O Tutor usa **provedores de inteligência artificial, de nuvem e de voz**, que podem estar **no exterior**, com as salvaguardas da LGPD (cláusula 26.5). A **lista nominal** dos fornecedores é informada ao titular **sob pedido** pelo e-mail privacidade@staziamed.com.br (LGPD, arts. 9º e 18, VII). Os provedores de IA **não usam os dados dos alunos para treinar seus modelos**, por contrato empresarial, e **a Stazia não usa as conversas com o Tutor para treinar IA**. Se um provedor que receba sua voz for incluído ou trocado de modo relevante, a Política será atualizada e, se material, será pedido novo aceite.

18.8. **Voz.** Usar o microfone é opcional: todos os Tutores funcionam por escrito. Ao ligar o microfone pela primeira vez, você autoriza o envio do áudio ao fornecedor, somente para a conversa. A voz do Tutor é artificial. Você pode retirar a autorização a qualquer momento deixando de usar o microfone ou pedindo ao suporte.

18.9. **Conteúdo gerado pelo Tutor.** As respostas do Tutor são fornecidas a você sob a licença pessoal e intransferível da cláusula 7. A Stazia não reivindica direitos sobre as perguntas que você faz. A estrutura, o modelo e o método de resposta pertencem à Stazia ou aos seus fornecedores.

18.10. **Janelinha do Tutor.** Nas Questões, nos Simulados e nas Aulas o Tutor pode abrir em uma **janelinha** com o personagem em miniatura. Ela **consome seus créditos ou minutos**. **Durante um simulado em andamento ela fica travada** e só funciona depois que você entregar. Em questões, o Tutor **não revela o gabarito antes de você responder**.

18.11. **Consulta ao conteúdo.** Para responder, o Tutor pode consultar o banco da plataforma (aulas, fontes, diretrizes, protocolos, provas e questões) **aprovado e publicado**. Mesmo assim, ele **pode errar**, tem finalidade **educacional** e **não substitui conduta médica**, protocolo oficial ou decisão sobre pacientes.

18.12. **Adaptação de tom e memória de estilo.** Durante a conversa, o Tutor adapta o tom ao contexto da sua fala (por exemplo, se você está brincando ou com dificuldade em um tema). Essa adaptação momentânea vale só durante a sessão e **não é diagnóstico nem análise psicológica**. Para tornar a experiência mais imersiva, a Stazia também **guarda o seu estilo de interação**: por exemplo, se você gosta de humor, o ritmo, se prefere respostas curtas ou longas, a personalidade que escolhe e como aprende melhor. **Não guardamos dados pessoais nem estado emocional ou de saúde nessa memória.** Você pode **ver e apagar** essa memória a qualquer momento nas Preferências do Tutor e desligá-la; apagar não prejudica o uso do serviço. (Base legal: execução do contrato e legítimo interesse na personalização do serviço, Política de Privacidade.)

18.13. **Sigilo.** O Tutor não revela senhas, instruções internas, regras de segurança, chaves, nem a tecnologia que usa; ao ser perguntado, responde como o personagem e volta ao estudo. Tentar burlar essa proteção é conduta proibida (cláusula 24).

18.14. **Dois tipos de voz.** (a) **Voz ao vivo**: conversa em tempo real com o Tutor, que usa provedores de IA de voz; (b) **Voz do professor**: o texto da resposta é lido por voz sintética de outro provedor, que não recebe o áudio da sua voz. Só a voz ao vivo consome a franquia de minutos (cláusula 17.5).

## 19. PERSONALIDADES COM LINGUAGEM FORTE

19.1. Os personagens **Durão** e **Durona** são exigentes e, por padrão, usam **gritos, ironia, impaciência encenada, humor adulto e palavrões**, sempre dirigidos à resposta, ao erro ou à situação de estudo, **nunca a você como pessoa**. É um recurso de personagem da personalidade que você escolhe.

19.2. A linguagem forte **vem ligada por padrão** (nível forte) nessas duas personalidades, **somente para quem declarou, na cláusula 5, ter 18 anos ou mais**, e depois do aviso claro da cláusula 19.3. **Aviso antes da primeira conversa.** Antes da primeira conversa com o Durão ou a Durona, a plataforma mostra um aviso claro do que esperar (gritos e palavrões dirigidos à resposta, nunca à pessoa) e pede confirmação ("Estou ciente de que os Tutores usam Inteligência Artificial e podem errar, e de que o Durão e a Durona usam por padrão linguagem forte e palavrões; posso baixar o nível, desligar ou escolher o Tranquilo/Tranquila quando quiser").

19.3. **Aviso e aceite específico.** Antes do primeiro uso de um Tutor, e sempre que você escolher um nível com palavrões, a plataforma mostra um aviso claro e pede confirmação ("Estou ciente de que os Tutores usam Inteligência Artificial e podem errar, e de que o Durão e a Durona podem usar linguagem forte e palavrões; posso mudar ou desligar isso quando quiser").

19.4. **Como baixar ou desligar.** Você pode, a qualquer momento, nas preferências do Tutor: desligar palavrões, gritos e humor adulto; baixar o nível; ou trocar para **Tranquilo/Tranquila**. A mudança vale a partir da próxima fala. A bronca é sempre sobre a resposta, nunca contra a pessoa. **Se o Tutor perceber que você está ansioso, frustrado ou abalado, a linguagem forte é suspensa naquela fala.**

19.5. Mesmo nos níveis fortes, o Tutor não pode promover discriminação, racismo, xenofobia, ameaça real, assédio, humilhação sistemática ou incentivo a atos ilegais. Se algo assim ocorrer, avise o suporte.

19.6. Se você tiver dificuldade emocional séria, o Tutor não substitui apoio profissional. Em risco de vida, ligue 188 (CVV) ou 192 (SAMU).

## 20. SIMULAÇÕES E ESTAÇÕES PRÁTICAS

20.1. As simulações de 2ª fase (estações, checklists, Treino em Dupla) são treino e dependem de conteúdo que pode ter sido adaptado, gerado por IA ou transcrito de provas anteriores, sujeito a revisão. Quando faltar parte (por exemplo, roteiro do ator), isso é informado.

## 21. STAZIA COINS, XP, LIGAS, RANKING E CONQUISTAS

21.1. A plataforma tem elementos de gamificação (XP, **Stazia Coins**, níveis, sequências, missões, conquistas, medalhas, ligas, ranking e temporadas) para motivar o estudo.

21.2. **Não têm valor monetário.** Não são dinheiro, moeda, criptoativo nem título; **não podem ser comprados com dinheiro, vendidos, transferidos entre contas ou convertidos em dinheiro**, nem geram direito a reembolso. Não são patrimônio do Aluno. Os Coins são um **bônus** da Stazia e podem ser **trocados dentro da plataforma por serviços ou benefícios** que a Stazia definir (por exemplo, itens de parceiros ou desconto em pacotes), nas regras do Regulamento, com **aviso prévio** de qualquer mudança. Essas trocas são liberalidade da Stazia e dependem de disponibilidade. As trocas disponíveis serão **definidas pela Stazia e anunciadas com 30 dias de aviso** antes de começarem ou de mudarem.

21.3. **Regras podem mudar.** As regras, valores, prêmios, temporadas e a existência dos elementos podem mudar para manter a justiça e o equilíbrio do sistema, com aviso na plataforma antes ou, se urgente por fraude, logo depois. Mudanças não geram direito a indenização. Mudanças que reduzam recompensas **já conquistadas** não serão aplicadas retroativamente, salvo por fraude ou erro.

21.4. **Antifraude.** Automação, *bots*, *scripts*, múltiplas contas, exploração de falhas, manipulação de resultados ou outro meio de vantagem artificial levam à correção, perda de pontos e Coins, exclusão do ranking, e, se grave, suspensão (cláusula 27), com direito de contestação.

21.5. O ranking e as ligas **não têm relação com classificação oficial** no Revalida ou no ENAMED.

21.6. Os detalhes estão no **Regulamento**, parte deste contrato.

## 22. TREINO EM DUPLA, MATCH, RADAR E COMUNIDADE

22.1. Funções de interação entre alunos (como Treino em Dupla, Match, Radar e chat, quando disponíveis) permitem formar duplas e treinar. Ao usá-las, você aceita que outros alunos vejam as informações de perfil que você escolher exibir (por exemplo, nome ou apelido, foto, nível, áreas de interesse) e que sua atividade na dupla seja visível ao parceiro durante o treino.

22.1-A. **Funções.** (a) **Treino em Dupla**: treino de estações com outro aluno, em salas; (b) **Stazia Match**: sugestão de pares por compatibilidade (prova, áreas, ritmo, papel, disponibilidade), com "curtir" recíproco; (c) **Radar** ("Perto de você"): lista de alunos online ou próximos **por cidade**, só de quem escolheu "Aparecer no radar"; quem não aparece não vê a lista; (d) **chat** entre quem formou dupla; (e) **convite por link**; (f) **treino sozinho**, em que a IA avalia o que você escreveu (cláusulas 17 e 18), conta no seu histórico e **fica fora de rankings**.

22.1-B. **Seu nome público e @.** Você escolhe um nome público e um **@ único**. O @ pode ser **trocado a cada 15 dias**, não pode imitar equipe, marcas ou pessoas, e pode ser recusado ou alterado pela Stazia se violar o contrato. O perfil mostra apenas o que você escolher (por exemplo, iniciais, cidade, prova, áreas, ritmo, disponibilidade); **nunca e-mail, telefone ou foto**. A localização do Radar é a **cidade que você informa**, não a sua posição por GPS. O aplicativo **não coleta GPS nem a localização do aparelho**.

22.2. **Conduta.** Seja respeitoso. É proibido: ofender, discriminar, assediar, ameaçar, expor dados de terceiros, enviar conteúdo ilícito, sexual ou violento, fazer propaganda ou venda, enviar *spam*, gravar ou divulgar sessões e conversas de outro aluno sem autorização, ou usar as funções para fins diferentes do estudo.

22.3. **Denúncia, bloqueio e moderação.** Você pode **denunciar** condutas e **bloquear** outro aluno pela plataforma. A Stazia pode revisar denúncias, remover conteúdo, limitar ou encerrar funções e suspender contas, respeitada a cláusula 27. Para apurar denúncias e proteger alunos, a Stazia guarda os relatos e registros necessários (conteúdo por 6 meses e registro mínimo por 3 anos após o fechamento da denúncia) e pode acessar o conteúdo das interações denunciadas.

22.3-A. **Chat, denúncia e guarda.** As mensagens do chat (Treino em Dupla e Match) ficam registradas no banco de dados enquanto a sua conta existir. Ao encerrar a conta, as mensagens são eliminadas ou anonimizadas, **exceto** as que façam parte de uma **denúncia**: o **conteúdo das mensagens denunciadas** fica guardado por **6 meses** após o fechamento da denúncia e o **registro mínimo** (quem, quando, motivo e decisão) por **3 anos**, para segurança e defesa de direitos. Ao receber uma denúncia, a equipe da Stazia passa a ter acesso à conversa denunciada. O **bloqueio** vale nos dois sentidos, na hora: a pessoa bloqueada some do baralho e do radar e não pode convidar você.

22.4. **Conteúdo de terceiros.** A Stazia não controla previamente o que os alunos dizem uns aos outros. O Aluno é responsável pelo que publica e fala. A Stazia atua após ciência (denúncia) e cumpre ordem judicial (Lei 12.965/2014, art. 19). A Stazia pode fornecer dados à autoridade nos casos legais.

22.5. A Stazia não garante que haverá parceiro disponível nem a qualidade do treino com outro aluno. Os parceiros de treino não são empregados nem representantes da Stazia.

22.6. A 2ª fase e algumas dessas funções podem estar fechadas ("em breve") até o lançamento (cláusula 2.2-A). Algumas funções (como o formar dupla no Match) podem consumir cota ou créditos do plano, informados antes do uso (por exemplo, usos do Tutor e correção de estação por IA, conforme a cláusula 17.5).

## 23. EMPRESAS PARCEIRAS E BENEFÍCIOS

23.1. A Stazia pode divulgar **ofertas e descontos de empresas parceiras** em produtos e serviços ("**Benefícios**"). Os Benefícios são uma **liberalidade** da Stazia: um bônus voluntário e **não fazem parte do preço nem do serviço essencial contratado**.

23.2. A Stazia **não é obrigada** a manter, criar, renovar ou negociar Benefícios, e **pode alterar, suspender ou encerrar qualquer Benefício ou parceria**, porque a oferta depende do parceiro. Ao fazer isso por decisão sua, a Stazia avisa na plataforma com antecedência razoável; se o encerramento for imediato por decisão do parceiro, retira a oferta e avisa o mais rápido possível. **Exceção:** se um Benefício tiver sido anunciado expressamente como parte da oferta da sua assinatura, a Stazia o mantém pelo período do plano já contratado ou oferece compensação equivalente (CDC, art. 30). Por isso, a Stazia evita anunciar Benefícios como motivo principal da contratação.

23.3. **Responsabilidade do parceiro.** O produto ou serviço é vendido e entregue **pelo parceiro**, que responde pela oferta, preço, qualidade, entrega, garantia, nota fiscal, atendimento e pelo direito de arrependimento da compra feita com ele (CDC). A Stazia não é vendedora nem garante o produto, salvo se a lei determinar o contrário. A divulgação identifica claramente que se trata de oferta de parceiro e se a Stazia recebe remuneração por ela. Exigências de segurança do parceiro valem para você.

23.4. Elegibilidade, regras de uso (por exemplo, assinatura ativa e em dia) e dados compartilhados estão no Regulamento. **A Stazia não entrega seus dados pessoais a parceiros sem base legal e sem informar você**; quando exigir consentimento, ele será pedido de forma específica, separada e revogável (cláusula 26.4).

23.5. O desconto do parceiro não se acumula com outras promoções, salvo regra em contrário da oferta.

## 24. INTEGRIDADE DO BANCO DE QUESTÕES E CONDUTAS PROIBIDAS

24.1. Além do que já está dito, é **proibido**: praticar atos ilegais; invadir ou tentar acessar áreas administrativas; descobrir credenciais; explorar vulnerabilidades; atacar a infraestrutura; distribuir malware; fraudar pagamento, cupom, teste ou ranking; falsificar identidade; violar direitos autorais; compartilhar o conteúdo comercialmente; inserir dados de pacientes reais (cláusula 18.4); usar a plataforma para enviar spam ou conteúdo ilícito; assediar a equipe ou outros alunos.

24.2. Vulnerabilidade encontrada deve ser comunicada ao suporte, sem exploração.

## 25. DISPONIBILIDADE, MANUTENÇÃO E SUPORTE

25.1. A Stazia trabalha para manter a plataforma disponível, mas **não garante funcionamento ininterrupto nem disponibilidade de 100%**. Pode haver paradas para manutenção, atualização, falha de servidores, de provedores externos (IA, voz, pagamento, hospedagem), de internet ou por caso fortuito e força maior. **Manutenções programadas são avisadas com 48 horas de antecedência.**

25.2. **Interrupção não programada** que impeça o uso do plano por **mais de 72 horas seguidas**, por falha da Stazia, dá direito a **compensação proporcional em dias de acesso**, sem prejuízo de outros direitos legais.

25.3. O suporte é prestado pelos canais oficiais (cláusula 1.3). Pedidos por canais não oficiais podem não ser considerados.

## 26. PROTEÇÃO DE DADOS PESSOAIS (LGPD)

26.1. A Stazia é **controladora** dos seus dados pessoais e os trata conforme a Lei 13.709/2018 (LGPD) e a **Política de Privacidade**, que explica quais dados, para quê, com quem compartilhamos, por quanto tempo e como exercer seus direitos.

26.2. **Principais finalidades e bases legais** (resumo, detalhado na Política): criar e manter a conta, prestar o serviço, cobrar e emitir nota (execução do contrato); guardar o registro do aceite com IP e outros dados, e dados necessários à defesa em processos (exercício regular de direitos, art. 7º, VI, e legítimo interesse); guardar registros de acesso por prazo mínimo (obrigação legal, Marco Civil da Internet, art. 15); segurança e prevenção de fraude (legítimo interesse); personalização do estudo (execução do contrato/legítimo interesse); marketing (consentimento opcional); áudio de voz (consentimento).

26.3. **Registro do aceite.** O aceite grava o IP, a data e a hora, o navegador, a versão, o código de integridade do documento, o plano e o retrato do preço (cláusula 6.3). A finalidade é provar a contratação e o texto aceito, defender direitos em eventual disputa, e prevenir fraude. O prazo de guarda do registro de aceite é de 5 (cinco) anos após o fim do contrato, conforme a Política de Privacidade.

26.4. **Parceiros e terceiros.** Os dados são compartilhados com operadores (hospedagem, banco de dados, autenticação, pagamento, envio de e-mails, IA e voz, suporte) sob contrato e dever de segurança, e com autoridades por exigência legal. **Não vendemos seus dados.** Dados para empresas parceiras de Benefícios só com base legal informada e, se necessário, consentimento específico.

26.5. **Transferência internacional.** Alguns fornecedores (IA, nuvem, voz) processam dados fora do Brasil, com salvaguardas previstas na LGPD (art. 33), como cláusulas contratuais padrão ou garantias equivalentes.

26.6. **Retenção.** Os dados são guardados pelo tempo necessário. Resumo: conta ativa, enquanto existir; transcrição de voz, 7 dias; conversas escritas, enquanto a conta existir; registros de acesso, 6 meses (Marco Civil, art. 15); registro do aceite, dados de cobrança e histórico financeiro: **5 (cinco) anos após o fim do contrato**, para defesa em eventuais disputas (CDC, art. 27); após o encerramento da assinatura, os dados de progresso e histórico de estudo são preservados por 12 (doze) meses para facilitar o seu retorno; passado esse prazo, ou se você pedir a exclusão da conta, são eliminados ou anonimizados (eliminação em até 30 dias após o pedido, salvo o que a lei exigir). Podemos manter por mais tempo o que a lei ou a defesa de direitos exigirem.

26.6-A. **Dados das funções novas** (resumo, detalhes na Política): cidade e @ do perfil; chat (guardado conforme a cláusula 22.3-A); denúncias (conteúdo 6 meses e registro mínimo 3 anos após o fechamento); histórico do Nivelamento e do treino sozinho; consumo de créditos e de minutos de voz; e e-mails de serviço. **Cookies:** apenas essenciais (sessão, segurança, preferências), sem propaganda e sem estatística de terceiros.

26.7. **Seus direitos (LGPD, art. 18):** confirmação do tratamento, acesso, correção, anonimização, bloqueio ou eliminação, portabilidade, informação sobre compartilhamento, revogação de consentimento, oposição e revisão de decisões automatizadas. Peça ao encarregado (cláusula 1.4), que responde em até 15 dias. Também é possível reclamar à ANPD.

26.8. A plataforma é destinada a maiores de 18 anos e não coleta intencionalmente dados de crianças e adolescentes.

26.9. Incidente de segurança que possa causar risco relevante será comunicado ao Aluno e à ANPD na forma da lei (LGPD, art. 48).

## 27. SUSPENSÃO, BLOQUEIO E ENCERRAMENTO PELA STAZIA

27.1. A Stazia pode **suspender ou restringir** a conta quando houver **indício razoável** de fraude, compartilhamento de acesso, violação deste contrato, tentativa de invasão, abuso da infraestrutura, manipulação do ranking, conduta ofensiva contra outros alunos ou ordem legal. Em caso urgente, pode agir antes e explicar depois.

27.2. A Stazia comunica o motivo e o prazo e abre canal de **contestação**, com resposta em até 10 dias úteis. Se a contestação procede, o acesso é restabelecido e o período suspenso, estendido.

27.3. Em caso de **violação grave comprovada**, a Stazia pode **encerrar** o contrato. Nessa hipótese, não há devolução do período já usufruído, mas há devolução do período pago e não usufruído se o encerramento for sem justa causa.

27.4. A Stazia pode encerrar o serviço como um todo, por motivo empresarial, avisando com **30 dias** de antecedência e devolvendo proporcionalmente o que foi pago e não usufruído.

## 28. LIMITAÇÃO DE RESPONSABILIDADE

28.1. **Nada neste contrato exclui ou reduz direitos do consumidor garantidos por lei.** A Stazia responde pelos danos que causar nos termos do CDC.

28.2. Observados os direitos acima, a Stazia **não responde** por: resultado em prova; decisão de banca, edital, INEP ou mudança de regras do exame; uso do conteúdo ou do Tutor como única base de decisão clínica; interpretação equivocada ou falta de estudo do Aluno; dados de pacientes que o Aluno inserir contra o contrato; ato de terceiros, de parceiros ou de outros alunos; falha do equipamento, internet ou conta de terceiros do Aluno; uso indevido da conta pela falta de cuidado com a senha; eventos de força maior.

## 29. CONTESTAÇÃO, ATENDIMENTO E SOLUÇÃO DE CONFLITOS

29.1. Em caso de problema, primeiro fale com o SAC. A Stazia responde no prazo da cláusula 1.3. Você também pode procurar o Procon, a plataforma consumidor.gov.br e o Judiciário.

## 30. VIGÊNCIA E RESCISÃO

30.1. Este contrato vale a partir do aceite e dura enquanto sua conta existir e, havendo plano pago, enquanto durar a assinatura. Você pode encerrar a conta quando quiser (apagar a conta), sem prejuízo das obrigações já vencidas e da guarda legal de registros (cláusula 26.6).

30.2. Sobrevivem ao fim do contrato as cláusulas de propriedade intelectual, dados, responsabilidade, foro e as demais que, por natureza, devam continuar.

## 31. ALTERAÇÃO DE FUNCIONALIDADES

31.1. A Stazia pode criar, alterar, substituir ou remover funcionalidades para melhorar, aumentar a segurança, corrigir problemas, adaptar tecnologia ou cumprir a lei, **sem reduzir de modo substancial o que você contratou**. Mudança relevante será avisada. Se reduzir substancialmente o serviço contratado, aplica-se a cláusula 6.5 (cancelamento sem ônus e devolução proporcional).

## 32. COMUNICAÇÕES E MARKETING

32.1. Comunicações de **serviço** (cobrança, segurança, mudanças do contrato, suporte) são necessárias e não dependem de marketing.

32.2. Comunicações **promocionais** só com a sua autorização opcional (caixa separada) e podem ser canceladas a qualquer momento por link no e-mail ou nas configurações, sem afetar o serviço.

## 33. TERCEIROS E LINKS

33.1. A plataforma pode apontar para sites ou serviços de terceiros. A Stazia não controla nem responde pelo conteúdo ou políticas deles.

## 34. DISPOSIÇÕES GERAIS

34.1. **Cessão.** A Stazia pode ceder este contrato a empresa do seu grupo ou sucessora, mantidas as condições e informando você. O Aluno não pode ceder o contrato.

34.2. **Tolerância.** Deixar de exigir um direito não significa renúncia.

34.3. **Nulidade parcial.** Se uma cláusula for considerada inválida, as demais continuam valendo, e a cláusula inválida será interpretada da forma mais próxima possível do seu objetivo, nos limites da lei.

34.4. **Interpretação.** Em caso de dúvida, o contrato é interpretado da forma mais favorável ao consumidor (CDC, art. 47).

34.5. **Integralidade e precedência.** Este contrato, o Anexo I, o Regulamento e a Política de Privacidade formam o acordo completo. Havendo conflito, valem, nesta ordem: a lei aplicável; a Política de Privacidade (exclusivamente quanto a dados pessoais); este contrato; o Regulamento; e o Anexo I (quanto a preços e limites mais recentes).

34.6. **Força maior.** Nenhuma parte responde por descumprimento causado por caso fortuito ou força maior (Código Civil, art. 393).

34.7. **Prova.** Os registros eletrônicos mantidos pela Stazia, inclusive o registro do aceite, são aceitos como prova, sem prejuízo do direito do Aluno de produzir prova em contrário.

## 35. CLÁUSULAS EM DESTAQUE (CDC, art. 54, § 4º)

Chamamos sua atenção especialmente para as cláusulas que limitam direitos ou criam obrigações: **3** (sem garantia de aprovação), **6.5** (mudança de versão), **7-A** (proteção da propriedade intelectual), **10** (renovação automática), **12.3** (sem devolução proporcional após o período), **15** (atraso e suspensão), **16** (reajuste), **17.3 e 17.4** (validade e não reembolso de extras), **19** (linguagem forte), **21** (Coins e ligas), **22** (conduta e moderação), **23** (parceiros), **25** (disponibilidade), **27** (suspensão), **28** (limitação de responsabilidade).

## 36. LEI APLICÁVEL E FORO

36.1. Aplica-se a lei brasileira.

36.2. Fica eleito o foro do **domicílio do Aluno no Brasil** (consumidor) para resolver conflitos (CDC, art. 101, I, e art. 51, IV). Se o Aluno não tiver domicílio no Brasil no momento do conflito, fica eleito o foro da Comarca de Curitiba/PR, sendo garantido ao Aluno participar de eventuais audiências de forma integralmente virtual, nos termos da lei processual.

---

## ANEXO I — PLANOS, LIMITES E PREÇOS DE LISTA
(Valores vigentes em 17/10/2026, **sujeitos à confirmação antes do lançamento**; o preço que vale é o mostrado na tela de contratação.)

| | Teste grátis | PRO (1ª fase / ENAMED) | PRÁTICA (2ª fase) | ELITE (completo) |
|---|---|---|---|---|
| Mensal | R$ 0 (7 dias) | R$ 99,90 | R$ 169,90 | R$ 199,90 |
| Trimestral | n/a | R$ 269,70 | R$ 458,70 | R$ 539,70 |
| Inclui | Só amostras (flashcards: até 10 por dia) | Teoria completa, simulados Revalida/ENAMED, flashcards, grupo teórico | Estações, checklists, simulados práticos, Treino em Dupla, grupo prático | Tudo dos dois planos |
| **Não inclui (cadeado)** | Conteúdo completo | Prática, estações, checklists, simulados práticos, Treino em Dupla, grupo prático | Teoria completa, questões teóricas, simulados Revalida/ENAMED, flashcards, grupo teórico | Nada |
| IA por dia | 5 | 8 | 12 | 20 |
| IA por mês | n/a | até 180 | até 270 | até 450 |
| Voz ao vivo | 2 min no total | 10 min/mês | 20 min/mês | 40 min/mês |

Extras: ver cláusula 17.1. Até a 2ª fase abrir, só o PRO está à venda; PRÁTICA e ELITE aparecem como "em breve" (cláusula 2.2-A). Plano expirado ou cancelado: os recursos do plano ficam bloqueados, a conta volta à amostra diária e há convite para renovar. O teste de 7 dias vale por fase (cláusula 8.1). Os créditos e minutos acima são os da cláusula 17.1-A.
**Grupo teórico/prático:** grupos exclusivos de estudo dos assinantes, em canal definido pela Stazia. **Limites de IA:** não há limite semanal (só diário e mensal); o limite diário renova à **meia-noite de Brasília** e o mensal **no dia da contratação**. **Amostra diária:** ver cláusula 8.1.

---

**Versão do contrato:** 3.0 — outubro de 2026. Código de integridade (SHA-256) do texto aceito: gerado pelo sistema na publicação.
**Contratada:** Stazia Tecnologia e Educação Ltda — CNPJ 64.964.213/0001-16 — Rua Visconde do Rio Branco, 1488, Curitiba/PR.
$contrato_v3$, '3.0', true, $mudancas$["O Termo de Aceite e Uso virou o Contrato de Assinatura com os Termos de Uso juntos, com um quadro-resumo no começo.", "Planos PRO, PRÁTICA e ELITE, mensal ou trimestral. Até a 2ª fase abrir, só o PRO está à venda.", "Pagamento sempre à vista, por Pix, cartão de crédito ou cartão de débito. Só o cartão de crédito renova sozinho; no Pix e no débito, cada período é pago na hora. Sem multa, juros ou correção por atraso: o acesso pago fica pausado e volta quando o pagamento for confirmado.", "Cancele quando quiser, sem multa. Desistência em até 7 dias depois de contratar, com devolução total.", "Só para quem tem 18 anos ou mais. O Durão e a Durona usam linguagem forte por padrão, e você pode baixar ou desligar.", "Uma sessão ativa por vez em cada conta.", "No aceite guardamos a versão, a data e a hora, o IP e o navegador, como prova. A sua cópia fica em Minha Conta > Documentos.", "Nova Política de Privacidade 3.0 e novo Regulamento de Stazia Coins, XP, Ligas e Benefícios."]$mudancas$::jsonb, true);

-- a caixa do aceite continua trazendo a declaração de maioridade (cláusula 5; decisão do dono de 17/10: caixa única, sem "médico")
update public.legal_versions set requires_declarations = true where document = 'termo_uso' and not requires_declarations;

-- ---------------------------------------------------------------- 9) conferência final (se algo não bater, PARA com erro)
do $confere_fim$
declare
  r record;
begin
  for r in select * from (values
      ('termo_uso', '3.0', '0a9b58cff598fa27225043e476139521cb1b47a2355b937c02797006c39a1230'),
      ('politica_privacidade', '3.0', '479660a6b4c18ca560d5c857c59d3262d0e0a0b405cf353acd3904c94504f873'),
      ('regulamento', '1.0', 'b4494a46be46d1aa25ec613a731605bbdfa5ceea1b055f6958830552798d5e6b')) as x(doc, ver, sha)
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
