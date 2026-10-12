-- =============================================================================
-- Fontes vinculadas da questão (pedido do dono de 2026-10-12, entra ANTES do lançamento da Fase 1 objetiva).
-- Pode ser colada várias vezes (create ... if not exists, create or replace, drop ... if exists).
--
-- Cada questão pode ter 1 ou mais fontes ligadas ao TRECHO exato do documento oficial: documento e versão (ch_sources, a
-- biblioteca de fontes que já existe), página, seção e citação curta. Pode haver uma fonte para o diagnóstico e outra para
-- a conduta (papel). Duas referências (temporal):
--   * vigente   = "Referência atual": a versão vigente do documento, com a data em que a vigência foi conferida;
--   * historica = "Versão da época da prova": SÓ histórico (explica por que o Inep deu aquele gabarito); nunca aparece como
--                 conduta atual. Questão StaziaMed não tem prova do Inep, então não tem esta referência.
-- Um registro por questão guarda o resultado da conferência da referência atual (question_source_checks):
--   * sem registro            = "ainda não conferida": o aluno não vê aviso nenhum;
--   * confirmada              = o aluno vê a referência atual confirmada;
--   * nao_confirmada          = o aluno vê "Fonte não confirmada" (nunca um protocolo parecido no lugar).
--
-- Regras no banco (não só na tela):
--   * o aluno e o visitante NÃO leem as tabelas direto; a equipe (editor, administrador, revisor médico) lê; a escrita é só
--     pelas funções da equipe (Confirmar / Tirar, com Registro) e pelo SQL do gerador que o dono cola (scripts/fontes-vinculadas);
--   * só fonte OFICIAL pode ser vinculada (fonte complementar nunca aparece ao aluno); vínculo confirmado precisa da citação e da
--     página ou seção; citação curta (até 400 caracteres);
--   * o aluno lê pela função app_question_source_links SÓ vínculos confirmados de questão válida (não anulada, não recolhida), só
--     depois de responder (a mesma regra do comentário: question_viewable). Referência atual só de fonte vigente (não substituída,
--     não retirada, não consulta pública/preliminar; diretriz de sociedade só com aprovação editorial);
--   * "O que mudou desde a prova": a referência atual que diverge do gabarito pode trazer uma nota (update_note). A nota só vai
--     ao aluno depois de aprovada pela equipe ("Confirmar" na Administração › Questões, com quem e quando); o gabarito não muda;
--   * nada aqui mexe no gabarito: o gabarito oficial do Inep nunca muda por diretriz;
--   * nenhuma IA: Confirmar e Tirar são da equipe, na Administração › Questões.
--
-- DEPENDE de: 9620 (ch_sources.audience), leva 3 (question_person_name, 9701) e leva 4 (questions.origin e retired_at, 9801).
-- Só cria coisas novas: nenhuma função, tabela ou política existente é alterada. Sem este SQL o site continua igual (o quadro
-- "Fontes vinculadas" simplesmente não aparece ao aluno).
-- Para desfazer: drop function app_question_source_links(text), app_admin_question_source_links(text),
-- app_admin_question_source_link_confirm(uuid), app_admin_question_source_link_remove(uuid, text), question_source_link_hidden(uuid),
-- question_source_vigente_problem(uuid), question_source_links_guard(); drop table question_source_links, question_source_checks.
-- =============================================================================

do $guard$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'origin')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'retired_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ch_sources' and column_name = 'audience')
     or to_regprocedure('public.question_viewable(text)') is null
     or to_regprocedure('public.question_person_name(uuid)') is null
     or to_regprocedure('public.ch_scrub_json(jsonb)') is null then
    raise exception 'Cole antes a fonte complementar (9620), a leva 3 e a leva 4 (Questões StaziaMed): esta migração parte delas.'
      using errcode = '55000';
  end if;
end
$guard$;

-- ---------------------------------------------------------------- vínculo questão → fonte → trecho
create table if not exists public.question_source_links (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  source_id uuid not null references public.ch_sources (id),
  -- o trecho indexado da fonte, quando houver; os trechos são refeitos quando a fonte é indexada de novo, por isso o vínculo
  -- guarda a sua própria página, seção e citação
  passage_id uuid references public.ch_source_passages (id) on delete set null,
  role text not null check (role in ('diagnostico', 'conduta', 'exame', 'tratamento', 'prevencao', 'conceito', 'outro')),
  temporal text not null check (temporal in ('vigente', 'historica')),
  page integer check (page is null or page between 1 and 100000),
  page_label text check (page_label is null or char_length(page_label) between 1 and 40),     -- ex.: "p. 34" ou "Quadro 3"
  section text check (section is null or char_length(section) between 1 and 200),
  quote text check (quote is null or char_length(quote) between 1 and 400),                 -- citação CURTA, literal
  act text check (act is null or char_length(act) between 1 and 200),                       -- ato que aprovou a versão (ex.: portaria)
  update_note text check (update_note is null or char_length(update_note) between 1 and 1000), -- "O que mudou desde a prova" (só na referência atual)
  status text not null default 'em_revisao' check (status in ('confirmada', 'nao_confirmada', 'em_revisao')),
  reason text check (reason is null or char_length(reason) <= 500),
  origin text not null default 'equipe' check (origin in ('importacao', 'equipe')),
  validity_checked_on date,                                                                 -- referência atual: vigência conferida em
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_source_links_confirmed_has_passage
    check (status <> 'confirmada' or (quote is not null and (page is not null or page_label is not null or section is not null))),
  constraint question_source_links_update_note_current check (update_note is null or temporal = 'vigente')
);
-- um vínculo = um trecho: a mesma fonte pode sustentar o mesmo papel com mais de um trecho (citações diferentes)
create unique index if not exists question_source_links_uniq on public.question_source_links (question_id, source_id, role, temporal, md5(coalesce(quote, '')));
create index if not exists question_source_links_source_idx on public.question_source_links (source_id);

-- ---------------------------------------------------------------- resultado da conferência da referência atual (um por questão)
create table if not exists public.question_source_checks (
  question_id text primary key references public.questions (id) on delete cascade,
  status text not null check (status in ('confirmada', 'nao_confirmada')),
  note text check (note is null or char_length(note) <= 1000),
  origin text not null default 'equipe' check (origin in ('importacao', 'equipe')),
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- acesso: a equipe lê; ninguém grava direto
alter table public.question_source_links enable row level security;
alter table public.question_source_checks enable row level security;
revoke all on table public.question_source_links from public, anon, authenticated;
revoke all on table public.question_source_checks from public, anon, authenticated;
grant select on table public.question_source_links to authenticated;   -- o que cada um lê é decidido pelas políticas abaixo
grant select on table public.question_source_checks to authenticated;
drop policy if exists "fontes vinculadas: equipe lê" on public.question_source_links;
create policy "fontes vinculadas: equipe lê" on public.question_source_links
  for select to authenticated using ((select public.is_staff()) or (select public.ch_is_reviewer()));
drop policy if exists "conferência das fontes vinculadas: equipe lê" on public.question_source_checks;
create policy "conferência das fontes vinculadas: equipe lê" on public.question_source_checks
  for select to authenticated using ((select public.is_staff()) or (select public.ch_is_reviewer()));

-- ---------------------------------------------------------------- regras que valem em qualquer caminho de gravação
create or replace function public.question_source_links_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_audience text;
  v_origin text;
begin
  -- texto limpo (quebras de linha do PDF viram espaço); nada além disso é mudado
  new.quote := nullif(btrim(regexp_replace(coalesce(new.quote, ''), '\s+', ' ', 'g')), '');
  new.section := nullif(btrim(regexp_replace(coalesce(new.section, ''), '\s+', ' ', 'g')), '');
  new.page_label := nullif(btrim(coalesce(new.page_label, '')), '');
  new.act := nullif(btrim(coalesce(new.act, '')), '');
  new.reason := nullif(btrim(coalesce(new.reason, '')), '');
  new.update_note := nullif(btrim(regexp_replace(coalesce(new.update_note, ''), '[ \t]+', ' ', 'g')), '');
  -- a nota do que mudou só vai ao aluno aprovada por uma pessoa da equipe (o "Confirmar" grava quem): importação não a libera
  if new.status = 'confirmada' and new.update_note is not null and new.verified_by is null then
    raise exception 'A nota "O que mudou desde a prova" só vai ao aluno depois de aprovada pela equipe: grave o vínculo em revisão e use "Confirmar" na Administração › Questões.' using errcode = '22023';
  end if;
  select s.audience into v_audience from public.ch_sources s where s.id = new.source_id;
  if not found then
    raise exception 'Fonte não encontrada na biblioteca de fontes.' using errcode = 'P0002';
  end if;
  if v_audience is distinct from 'oficial' then
    raise exception 'Só fonte oficial pode ser vinculada à questão (fonte complementar nunca aparece ao aluno).' using errcode = '22023';
  end if;
  if new.passage_id is not null and not exists (select 1 from public.ch_source_passages p where p.id = new.passage_id and p.source_id = new.source_id) then
    raise exception 'O trecho escolhido não é deste documento.' using errcode = '22023';
  end if;
  select q.origin into v_origin from public.questions q where q.id = new.question_id;
  if new.temporal = 'historica' and v_origin = 'staziamed' then
    raise exception 'Questão StaziaMed não tem "versão da época da prova": vincule só a referência atual.' using errcode = '22023';
  end if;
  if new.status = 'confirmada' then
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  if new.temporal = 'vigente' and new.status = 'confirmada' then
    new.validity_checked_on := coalesce(new.validity_checked_on, current_date);
  elsif new.temporal = 'historica' then
    new.validity_checked_on := null;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end
$$;
revoke execute on function public.question_source_links_guard() from public, anon, authenticated;
drop trigger if exists question_source_links_guard on public.question_source_links;
create trigger question_source_links_guard before insert or update on public.question_source_links
  for each row execute function public.question_source_links_guard();

-- Por que uma fonte não vale como REFERÊNCIA ATUAL (nulo = vale). Regra única: tela da equipe, Confirmar e o que o aluno lê.
create or replace function public.question_source_vigente_problem(p_source_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when s.id is null then 'Fonte não encontrada na biblioteca de fontes.'
    when s.audience is distinct from 'oficial' then 'Fonte complementar: nunca aparece ao aluno.'
    when s.status <> 'current' then 'A fonte foi substituída por uma versão mais nova (ou retirada): confira o trecho na versão vigente e vincule a versão nova.'
    when s.kind in ('public_consultation', 'preliminary') then 'Consulta pública ou versão preliminar não vale como referência atual.'
    when s.kind = 'society_guideline' and not s.editorial_approved then 'Diretriz de sociedade médica ainda sem aprovação editorial na biblioteca de fontes.'
    else null end
  from (select p_source_id as id) x left join public.ch_sources s on s.id = x.id
$$;
revoke execute on function public.question_source_vigente_problem(uuid) from public, anon, authenticated;

-- Por que um vínculo NÃO aparece ao aluno (nulo = aparece). Usada pela função do aluno e pela tela da equipe.
create or replace function public.question_source_link_hidden(p_link_id uuid) returns text
  language sql stable security definer set search_path = ''
as $$
  select case
    when l.id is null then 'Vínculo não encontrado.'
    when l.status <> 'confirmada' then 'Ainda não confirmado: o aluno não vê.'
    when s.audience is distinct from 'oficial' then 'Fonte complementar: nunca aparece ao aluno.'
    when l.temporal = 'vigente' and public.question_source_vigente_problem(l.source_id) is not null then public.question_source_vigente_problem(l.source_id)
    when l.temporal = 'vigente' and c.status = 'nao_confirmada' then 'A conferência desta questão deu "não confirmada": o aluno vê o aviso "Fonte não confirmada", e não esta referência.'
    else null end
  from (select p_link_id as id) x
  left join public.question_source_links l on l.id = x.id
  left join public.ch_sources s on s.id = l.source_id
  left join public.question_source_checks c on c.question_id = l.question_id
$$;
revoke execute on function public.question_source_link_hidden(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- o que o aluno lê (depois de responder)
-- Nulo quando não há nada a mostrar: questão anulada ou recolhida, ainda não respondida, ou sem conferência e sem vínculo
-- confirmado. Campos mínimos: título, órgão, ano, versão, ato, link público, página, seção, citação, referência, papel e datas.
create or replace function public.app_question_source_links(p_question_id text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with alvo as (
    select q.id from public.questions q
    where q.id = p_question_id and (select auth.uid()) is not null
      and q.status <> 'annulled' and q.retired_at is null
      and public.question_viewable(q.id)
  ), chk as (
    select c.status, c.checked_at from public.question_source_checks c join alvo a on a.id = c.question_id
  ), itens as (
    select l.temporal, l.role, l.created_at, l.id,
           jsonb_build_object(
             'title', s.title, 'organ', s.organ, 'year', extract(year from coalesce(s.published_on, s.effective_date))::int,
             'version', s.version, 'act', l.act, 'url', case when s.url ~* '^https?://' then s.url end,
             'page', l.page, 'page_label', l.page_label, 'section', l.section, 'quote', l.quote,
             'temporal', l.temporal, 'role', l.role, 'verified_at', l.verified_at, 'validity_checked_on', l.validity_checked_on,
             'update_note', case when l.temporal = 'vigente' then l.update_note end) as item
    from public.question_source_links l
    join alvo a on a.id = l.question_id
    join public.ch_sources s on s.id = l.source_id
    where public.question_source_link_hidden(l.id) is null
  )
  select case
    when not exists (select 1 from alvo) then null
    when not exists (select 1 from chk) and not exists (select 1 from itens) then null
    else public.ch_scrub_json(jsonb_build_object(
      'status', (select status from chk),
      'checked_at', (select checked_at from chk),
      'current', coalesce((select jsonb_agg(i.item order by array_position(array['diagnostico', 'exame', 'conduta', 'tratamento', 'prevencao', 'conceito', 'outro'], i.role), i.created_at, i.id)
                           from itens i where i.temporal = 'vigente'), '[]'::jsonb),
      'historical', coalesce((select jsonb_agg(i.item order by array_position(array['diagnostico', 'exame', 'conduta', 'tratamento', 'prevencao', 'conceito', 'outro'], i.role), i.created_at, i.id)
                              from itens i where i.temporal = 'historica'), '[]'::jsonb)))
  end
$$;
revoke execute on function public.app_question_source_links(text) from public, anon;
grant execute on function public.app_question_source_links(text) to authenticated;

-- ---------------------------------------------------------------- Administração › Questões (equipe: editor ou administrador)
create or replace function public.app_admin_question_source_links(p_question_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'check', (select jsonb_build_object('status', c.status, 'note', c.note, 'origin', c.origin, 'checked_at', c.checked_at, 'checked_by', public.question_person_name(c.checked_by))
              from public.question_source_checks c where c.question_id = p_question_id),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'role', l.role, 'temporal', l.temporal, 'status', l.status, 'page', l.page, 'page_label', l.page_label,
               'section', l.section, 'quote', l.quote, 'act', l.act, 'update_note', l.update_note, 'reason', l.reason, 'origin', l.origin,
               'validity_checked_on', l.validity_checked_on, 'verified_at', l.verified_at, 'verified_by', public.question_person_name(l.verified_by),
               'hidden', public.question_source_link_hidden(l.id),
               'source', jsonb_build_object('id', s.id, 'title', s.title, 'organ', s.organ, 'version', s.version, 'url', s.url, 'status', s.status, 'kind', s.kind,
                                            'year', extract(year from coalesce(s.published_on, s.effective_date))::int))
             order by l.temporal desc, array_position(array['diagnostico', 'exame', 'conduta', 'tratamento', 'prevencao', 'conceito', 'outro'], l.role), l.created_at, l.id)
      from public.question_source_links l join public.ch_sources s on s.id = l.source_id
      where l.question_id = p_question_id), '[]'::jsonb));
end
$$;
revoke execute on function public.app_admin_question_source_links(text) from public, anon;
grant execute on function public.app_admin_question_source_links(text) to authenticated;

-- Confirmar: a pessoa da equipe conferiu o trecho no documento. Referência atual confirmada = conferência "confirmada".
create or replace function public.app_admin_question_source_link_confirm(p_link_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  l public.question_source_links;
  v_problem text;
  v_title text;
begin
  perform public.assert_staff();
  select * into l from public.question_source_links where id = p_link_id for update;
  if not found then
    raise exception 'Vínculo não encontrado.' using errcode = 'P0002';
  end if;
  if l.quote is null or (l.page is null and l.page_label is null and l.section is null) then
    raise exception 'Para confirmar, o vínculo precisa da citação do trecho e da página ou da seção do documento.' using errcode = '22023';
  end if;
  if l.temporal = 'vigente' then
    v_problem := public.question_source_vigente_problem(l.source_id);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = '22023';
    end if;
  end if;
  update public.question_source_links
     set status = 'confirmada', reason = null, verified_by = (select auth.uid()), verified_at = now(),
         validity_checked_on = case when temporal = 'vigente' then current_date end
   where id = p_link_id;
  if l.temporal = 'vigente' then
    insert into public.question_source_checks as c (question_id, status, note, origin, checked_by, checked_at)
    values (l.question_id, 'confirmada', null, 'equipe', (select auth.uid()), now())
    on conflict (question_id) do update
      set status = 'confirmada', origin = 'equipe', checked_by = excluded.checked_by, checked_at = now(),
          note = case when c.status = 'confirmada' then c.note end;
  end if;
  select s.title into v_title from public.ch_sources s where s.id = l.source_id;
  perform public.admin_log('question.source_link_confirmed', l.question_id, jsonb_build_object('source', v_title, 'role', l.role, 'temporal', l.temporal, 'page', coalesce(l.page_label, l.page::text), 'section', l.section, 'update_note', l.update_note));
  return public.app_admin_question_source_links(l.question_id);
end
$$;
revoke execute on function public.app_admin_question_source_link_confirm(uuid) from public, anon;
grant execute on function public.app_admin_question_source_link_confirm(uuid) to authenticated;

-- Tirar: o vínculo sai (o Registro guarda o que era). Sem nenhuma referência atual confirmada, a conferência "confirmada" deixa de
-- valer e a questão volta a "ainda não conferida" (o aluno não vê nada, até nova conferência).
create or replace function public.app_admin_question_source_link_remove(p_link_id uuid, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  l public.question_source_links;
  v_title text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_staff();
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'O motivo pode ter no máximo 500 caracteres.' using errcode = '22023';
  end if;
  delete from public.question_source_links where id = p_link_id returning * into l;
  if not found then
    raise exception 'Vínculo não encontrado.' using errcode = 'P0002';
  end if;
  if l.temporal = 'vigente' and not exists (select 1 from public.question_source_links x where x.question_id = l.question_id and x.temporal = 'vigente' and x.status = 'confirmada') then
    delete from public.question_source_checks where question_id = l.question_id and status = 'confirmada';
  end if;
  select s.title into v_title from public.ch_sources s where s.id = l.source_id;
  perform public.admin_log('question.source_link_removed', l.question_id, jsonb_build_object('source', v_title, 'role', l.role, 'temporal', l.temporal, 'was', l.status, 'quote', left(l.quote, 200), 'reason', v_reason));
  return public.app_admin_question_source_links(l.question_id);
end
$$;
revoke execute on function public.app_admin_question_source_link_remove(uuid, text) from public, anon;
grant execute on function public.app_admin_question_source_link_remove(uuid, text) to authenticated;
