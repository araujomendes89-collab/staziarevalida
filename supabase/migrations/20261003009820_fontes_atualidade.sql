-- =============================================================================
-- Fontes oficiais com IA: ATUALIDADE da fonte achada ("sempre buscar as fontes mais atuais") e pedido de busca a partir das
-- abas (Questões, Atualizações...). Cole DEPOIS da 20261003009610 (e das demais). Pode colar quantas vezes quiser.
--
--   * o candidato guarda a data de publicação COMPROVADA (a que aparece no texto do documento ou na própria página), a vigência
--     dita pela IA e o ESTADO DE ATUALIDADE em relação à biblioteca e aos outros achados do mesmo documento:
--       versao_mais_nova | mesma_versao | versao_mais_antiga | outra_mais_nova | data_nao_comprovada | sem_comparacao
--     (quem decide o estado é o servidor, server/contentHub/sources/currency.ts; o banco só guarda e ordena);
--   * a lista de candidatos vem com os mais atuais primeiro;
--   * aprovar uma versão mais antiga (que a fonte vigente da biblioteca, ou que outro achado do mesmo documento) exige uma
--     confirmação PRÓPRIA (confirm_older) e diz que a aprovação substitui a mais nova pela mais antiga;
--   * app_ch_source_search_check: antes de pedir uma busca a partir de uma aba, o administrador vê se já existe busca do mesmo
--     tema nos últimos 7 dias ou candidatos aguardando, e acompanha o andamento da busca pedida.
-- Nada vira fonte sozinho: o processamento nunca passa de "aguardando".
--
-- Funções redefinidas e a versão usada como base (a mais nova que existe; nenhuma migração posterior à 9610 as recria):
--   ch_worker_source_candidate_create  base: 20261003009610 (acrescenta ai_valid_until, currency_date, currency_info)
--   app_ch_source_candidates           base: 20261003009610 (muda só a ordem)
--   app_ch_source_candidate_approve    base: 20261003009610 (acrescenta a confirmação da versão mais antiga e o registro dela)
-- Funções novas: ch_worker_source_library_for_theme, ch_worker_source_currency_context, ch_worker_source_currency_set,
--   app_ch_source_search_check.
-- Para desfazer: recolocar as três funções do 9610 (cada uma está inteira lá); as colunas novas podem ficar.
-- =============================================================================

-- ---------------------------------------------------------------- colunas novas do candidato
alter table public.ch_source_candidates add column if not exists ai_valid_until text check (ai_valid_until is null or char_length(ai_valid_until) <= 40);
alter table public.ch_source_candidates add column if not exists currency text;
alter table public.ch_source_candidates add column if not exists currency_date text check (currency_date is null or char_length(currency_date) <= 40);
alter table public.ch_source_candidates add column if not exists currency_info jsonb not null default '{}'::jsonb check (jsonb_typeof(currency_info) = 'object');
alter table public.ch_source_candidates drop constraint if exists ch_source_candidates_currency_check;
alter table public.ch_source_candidates add constraint ch_source_candidates_currency_check
  check (currency is null or currency in ('versao_mais_nova', 'mesma_versao', 'versao_mais_antiga', 'outra_mais_nova', 'data_nao_comprovada', 'sem_comparacao'));

-- ---------------------------------------------------------------- candidato novo (corpo da 9610 com os campos de atualidade)
-- Os campos novos são opcionais: quem chama sem eles (versão antiga do servidor) grava como antes.

create or replace function public.ch_worker_source_candidate_create(p_candidate jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  p jsonb := p_candidate;
  d public.ch_official_domains;
  v_url text;
  v_final text;
  v_url_norm text;
  v_final_norm text;
  v_sha text;
  v_id uuid;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Candidato inválido.' using errcode = '22023'; end if;
  v_url := btrim(coalesce(p ->> 'requested_url', ''));
  v_final := coalesce(nullif(btrim(coalesce(p ->> 'final_url', '')), ''), v_url);
  v_url_norm := public.ch_url_norm(v_url);
  v_final_norm := public.ch_url_norm(v_final);
  v_sha := lower(nullif(btrim(coalesce(p ->> 'sha256', '')), ''));
  if v_url_norm is null or v_sha is null then raise exception 'Candidato sem link ou sem SHA-256.' using errcode = '22023'; end if;

  select c.id into v_id from public.ch_source_candidates c
   where c.sha256 = v_sha or c.url_norm in (v_url_norm, v_final_norm) or c.final_url_norm in (v_url_norm, v_final_norm)
   order by c.created_at
   limit 1;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;

  if nullif(p ->> 'domain_id', '') is not null then
    select * into d from public.ch_official_domains where id = (p ->> 'domain_id')::uuid;
    if not found then raise exception 'Site da lista não encontrado.' using errcode = 'P0002'; end if;
  end if;
  insert into public.ch_source_candidates (
    search_id, domain_id, site_address, site_kind, site_institution, requested_url, final_url, url_norm, final_url_norm,
    ai_title, ai_institution, ai_published, ai_valid_until, ai_nature, ai_kind, ai_level, ai_reason, file_title, file_date, quote, quote_page,
    currency_date, currency_info, seen_in_search, file_kind, sha256, size_bytes, page_count, storage_path, preview, suggested_level, suggested_kind, suggested_nature)
  values (
    nullif(p ->> 'search_id', '')::uuid, d.id,
    coalesce(nullif(p ->> 'site_address', ''), d.address), coalesce(nullif(p ->> 'site_kind', ''), d.kind),
    coalesce(nullif(p ->> 'site_institution', ''), d.institution),
    v_url, v_final, v_url_norm, v_final_norm,
    left(nullif(p ->> 'ai_title', ''), 300), left(nullif(p ->> 'ai_institution', ''), 200), left(nullif(p ->> 'ai_published', ''), 40),
    left(nullif(p ->> 'ai_valid_until', ''), 40), left(nullif(p ->> 'ai_nature', ''), 80), left(nullif(p ->> 'ai_kind', ''), 40), nullif(p ->> 'ai_level', ''),
    left(nullif(p ->> 'ai_reason', ''), 300), left(nullif(p ->> 'file_title', ''), 300), left(nullif(p ->> 'file_date', ''), 40),
    p ->> 'quote', nullif(p ->> 'quote_page', '')::integer,
    left(nullif(p ->> 'currency_date', ''), 40),
    case when jsonb_typeof(p -> 'currency_info') = 'object' then p -> 'currency_info' else '{}'::jsonb end,
    coalesce((p ->> 'seen_in_search')::boolean, false), p ->> 'file_kind', v_sha, (p ->> 'size_bytes')::bigint,
    nullif(p ->> 'page_count', '')::integer, nullif(p ->> 'storage_path', ''), left(p ->> 'preview', 6000),
    p ->> 'suggested_level', p ->> 'suggested_kind', nullif(p ->> 'suggested_nature', ''))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    -- outro processamento gravou o mesmo link ou arquivo agora mesmo
    select c.id into v_id from public.ch_source_candidates c
     where c.sha256 = v_sha or c.url_norm in (v_url_norm, v_final_norm) or c.final_url_norm in (v_url_norm, v_final_norm)
     order by c.created_at
     limit 1;
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end
$$;

-- ---------------------------------------------------------------- apoio da busca e da atualidade (servidor)
-- Fontes VIGENTES da biblioteca que falam do tema (campo tema igual, ou o tema dentro do título): título, órgão, versão e datas,
-- para a IA procurar uma versão mais nova delas. Só isso; nenhum texto de documento. Até 12, as de data mais nova primeiro.
create or replace function public.ch_worker_source_library_for_theme(p_theme text) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.published_on desc nulls last, x.title), '[]'::jsonb)
    from (select s.title, s.published_on,
                 jsonb_build_object('titulo', left(s.title, 200), 'orgao', left(s.organ, 120), 'versao', s.version,
                                    'publicada_em', s.published_on, 'vigente_ate', s.valid_until) as item
            from public.ch_sources s
           where s.status = 'current' and nullif(btrim(coalesce(p_theme, '')), '') is not null
             and (lower(btrim(coalesce(s.theme, ''))) = lower(btrim(p_theme))
                  or position(lower(btrim(p_theme)) in lower(s.title)) > 0)
           order by s.published_on desc nulls last, s.title
           limit 12) x
$$;

-- Candidatos AGUARDANDO que a atualidade precisa comparar depois de uma busca: os dela e os outros candidatos aguardando do
-- mesmo documento (mesmo título e órgão da IA, sem caixa), de qualquer busca. Cada item traz a fonte vigente da biblioteca com o
-- mesmo título e órgão (a mesma regra de ch_source_replacement) e os "irmãos" com a data comprovada.
create or replace function public.ch_worker_source_currency_context(p_search_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  with mine as (
    select distinct lower(btrim(coalesce(c.ai_title, ''))) as t, lower(btrim(coalesce(c.ai_institution, ''))) as o
      from public.ch_source_candidates c
     where c.search_id = p_search_id and c.status = 'aguardando'
  ), grp as (
    select c.*
      from public.ch_source_candidates c
      join mine m on lower(btrim(coalesce(c.ai_title, ''))) = m.t and lower(btrim(coalesce(c.ai_institution, ''))) = m.o
     where c.status = 'aguardando'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'title', g.ai_title,
           'currency', g.currency,
           'date', g.currency_date,
           'info', g.currency_info,
           'library', (select jsonb_build_object('id', s.id, 'title', s.title, 'version', s.version, 'published_on', s.published_on, 'valid_until', s.valid_until)
                         from public.ch_sources s
                        where s.status = 'current' and lower(s.title) = lower(btrim(coalesce(g.ai_title, ''))) and lower(s.organ) = lower(btrim(coalesce(g.ai_institution, '')))
                        order by s.created_at desc limit 1),
           'siblings', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.currency_date) order by o.created_at, o.id)
                                   from grp o
                                  where o.id <> g.id and nullif(o.currency_date, '') is not null
                                    and lower(btrim(coalesce(o.ai_title, ''))) = lower(btrim(coalesce(g.ai_title, '')))
                                    and lower(btrim(coalesce(o.ai_institution, ''))) = lower(btrim(coalesce(g.ai_institution, '')))), '[]'::jsonb)) order by g.created_at, g.id), '[]'::jsonb)
    from grp g
$$;

-- Grava o estado de atualidade: p_updates = [{id, currency, info}]. Só candidato AGUARDANDO muda; "info" é juntado ao que já
-- existe (data, base da prova, avisos, fonte da biblioteca comparada). Devolve quantos mudaram. Valor de estado inválido para tudo.
create or replace function public.ch_worker_source_currency_set(p_updates jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  u jsonb;
  v_n integer := 0;
  v_rows integer;
begin
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then raise exception 'Lista de atualidade inválida.' using errcode = '22023'; end if;
  for u in select * from jsonb_array_elements(p_updates) loop
    if u ->> 'currency' is null or u ->> 'currency' not in ('versao_mais_nova', 'mesma_versao', 'versao_mais_antiga', 'outra_mais_nova', 'data_nao_comprovada', 'sem_comparacao') then
      raise exception 'Estado de atualidade inválido.' using errcode = '22023';
    end if;
    update public.ch_source_candidates
       set currency = u ->> 'currency',
           currency_info = currency_info || case when jsonb_typeof(u -> 'info') = 'object' then u -> 'info' else '{}'::jsonb end
     where id = (u ->> 'id')::uuid and status = 'aguardando';
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  return v_n;
end
$$;

-- ---------------------------------------------------------------- tela: lista de candidatos, mais atuais primeiro
-- Ordem: estado de atualidade (mais nova que a biblioteca, documento novo, mesma versão, sem prova, outra mais nova, mais antiga;
-- candidato sem estado conta como "sem prova"), governo brasileiro primeiro, depois a data mais recente (a editada, a comprovada,
-- a que a IA disse, a achada no arquivo), depois os mais novos. Até 200 por situação; os contadores contam todos.

create or replace function public.app_ch_source_candidates(p_status text default 'aguardando') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_status text := coalesce(nullif(btrim(p_status), ''), 'aguardando');
begin
  perform public.assert_admin();
  if v_status not in ('aguardando', 'aprovado', 'rejeitado') then raise exception 'Situação inválida: %.', v_status using errcode = '22023'; end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(public.ch_source_candidate_item(x.id) order by x.ord)
        from (select c.id,
                     row_number() over (order by
                                          case c.currency when 'versao_mais_nova' then 0 when 'sem_comparacao' then 1 when 'mesma_versao' then 2
                                                          when 'outra_mais_nova' then 4 when 'versao_mais_antiga' then 5 else 3 end,
                                          (c.site_kind = 'governo') desc,
                                          coalesce(nullif(c.edited ->> 'published_on', ''), nullif(c.currency_date, ''), nullif(c.ai_published, ''), nullif(c.file_date, '')) desc nulls last,
                                          c.created_at desc, c.id) as ord
                from public.ch_source_candidates c
               where c.status = v_status
               order by ord
               limit 200) x), '[]'::jsonb),
    'counts', jsonb_build_object(
      'aguardando', (select count(*)::int from public.ch_source_candidates where status = 'aguardando'),
      'aprovado', (select count(*)::int from public.ch_source_candidates where status = 'aprovado'),
      'rejeitado', (select count(*)::int from public.ch_source_candidates where status = 'rejeitado')));
end
$$;

create or replace function public.app_ch_source_candidate_approve(p_candidate_id uuid, p_fields jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.ch_source_candidates;
  s public.ch_source_searches;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  e jsonb;
  v_title text;
  v_organ text;
  v_kind text;
  v_nature text;
  v_level text;
  v_version text;
  v_published date;
  v_valid date;
  v_year text;
  v_rep public.ch_sources;
  v_dup public.ch_sources;
  v_doc_name text;
  v_reg jsonb;
  v_source_id uuid;
  v_document_id uuid;
  v_day date;
  v_older boolean := false;
  v_confirm boolean;
begin
  perform public.assert_admin();
  if jsonb_typeof(f) <> 'object' then raise exception 'Dados inválidos.' using errcode = '22023'; end if;
  select * into c from public.ch_source_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Candidato não encontrado.' using errcode = 'P0002'; end if;
  if c.status <> 'aguardando' then raise exception 'Este candidato já foi decidido.' using errcode = '22023'; end if;
  if f -> 'checked' is distinct from 'true'::jsonb then
    raise exception 'Confirme que conferiu o documento no arquivo guardado.' using errcode = '22023';
  end if;

  -- os ajustes do formulário passam pelas regras da edição (nível E, datas, tipos...) e ficam no candidato
  perform public.app_ch_source_candidate_save(c.id, f);
  select * into c from public.ch_source_candidates where id = c.id;
  e := c.edited;

  v_level := e ->> 'level';
  if v_level is null then raise exception 'Escolha o nível de A a D.' using errcode = '22023'; end if;
  if v_level = 'E' then raise exception 'Nível E não entra pela busca: escolha de A a D.' using errcode = '22023'; end if;
  if v_level not in ('A', 'B', 'C', 'D') then raise exception 'Escolha o nível de A a D.' using errcode = '22023'; end if;

  v_title := coalesce(nullif(btrim(e ->> 'title'), ''), nullif(btrim(c.ai_title), ''));
  v_organ := coalesce(nullif(btrim(e ->> 'institution'), ''), nullif(btrim(c.ai_institution), ''), nullif(btrim(c.site_institution), ''));
  if v_title is null or v_organ is null then raise exception 'Informe título e órgão da fonte.' using errcode = '22023'; end if;

  -- o site continua na lista, ativo, e o endereço final do arquivo continua dentro dele
  if public.ch_source_site_match(c.final_url) is null then
    raise exception 'O site % saiu da lista de sites oficiais ou foi desativado: reative-o ou rejeite este candidato.', c.site_address using errcode = '22023';
  end if;
  if c.storage_path is null then
    raise exception 'O arquivo guardado não está mais disponível: rejeite este candidato e peça a busca de novo.' using errcode = '22023';
  end if;

  select d.name into v_doc_name from public.ch_documents d where d.sha256 = c.sha256 order by d.created_at limit 1;
  if found then
    raise exception 'Este arquivo já está na Central como documento "%": vincule por lá ou rejeite este candidato.', v_doc_name using errcode = '22023';
  end if;

  v_kind := coalesce(nullif(e ->> 'kind', ''), c.suggested_kind);
  v_nature := coalesce(nullif(e ->> 'nature', ''), c.suggested_nature);
  v_valid := public.ch_source_iso_date(e ->> 'valid_until');
  -- data de publicação: a do administrador; senão uma data INTEIRA achada no arquivo ou dita pela IA; ano sozinho não vira data
  v_published := coalesce(public.ch_source_iso_date(e ->> 'published_on'), public.ch_source_iso_date(c.file_date), public.ch_source_iso_date(c.ai_published));
  v_version := nullif(btrim(e ->> 'version'), '');
  if v_version is null and v_published is null then
    v_year := coalesce((regexp_match(btrim(coalesce(c.file_date, '')), '^(\d{4})$'))[1], (regexp_match(btrim(coalesce(c.ai_published, '')), '^(\d{4})$'))[1]);
    v_version := v_year;
  end if;

  -- substituição da fonte vigente: só com a confirmação do administrador (mesma regra do aviso da tela)
  v_rep := null;
  select x.* into v_rep from public.ch_sources x
   where x.id = public.ch_source_replacement(v_title, v_organ, c.sha256, v_version);
  -- versão mais antiga: a busca marcou o candidato como mais antigo que a fonte vigente ou que outro achado do mesmo documento, ou
  -- a data que o administrador escolheu é anterior à da fonte vigente. Exige confirmação PRÓPRIA (confirm_older); confirmada, ela
  -- vale também como confirmação da substituição.
  v_older := c.currency in ('versao_mais_antiga', 'outra_mais_nova')
             or (v_rep.id is not null and v_rep.published_on is not null and v_published is not null and v_published < v_rep.published_on);
  v_confirm := f -> 'confirm_replace' is not distinct from 'true'::jsonb or (v_older and f -> 'confirm_older' is not distinct from 'true'::jsonb);
  if v_older and f -> 'confirm_older' is distinct from 'true'::jsonb then
    if v_rep.id is not null then
      raise exception 'Confirme a versão mais antiga: esta fonte (%) é mais antiga que a vigente "%" (versão %, %) e aprovar vai SUBSTITUIR a mais nova pela mais antiga.',
        coalesce(to_char(v_published, 'DD/MM/YYYY'), 'sem data inteira'), v_rep.title, coalesce(v_rep.version, 'sem versão'), coalesce(to_char(v_rep.published_on, 'DD/MM/YYYY'), 'sem data') using errcode = '22023';
    end if;
    raise exception 'Confirme a versão mais antiga: a busca achou outra versão mais nova deste mesmo documento, e aprovar esta não traz a mais nova.' using errcode = '22023';
  end if;
  if v_rep.id is not null and not v_confirm then
    raise exception 'Confirme a substituição: esta aprovação substitui a fonte vigente "%" (versão %).', v_rep.title, coalesce(v_rep.version, 'sem versão') using errcode = '22023';
  end if;

  -- fonte vigente que já é este mesmo arquivo (SHA-256 e versão iguais) ou este mesmo endereço, ainda que sem documento na
  -- Central: criar outra deixaria duas fontes vigentes iguais. Pede a mesma confirmação; confirmada, a anterior fica substituída.
  select x.* into v_dup from public.ch_sources x
   where x.status = 'current' and x.id is distinct from v_rep.id
     and ((x.sha256 is not null and x.sha256 = c.sha256 and x.version is not distinct from v_version)
          or (x.url is not null and public.ch_url_norm(x.url) in (public.ch_url_norm(c.final_url), public.ch_url_norm(c.requested_url))))
   order by x.created_at desc
   limit 1;
  if v_dup.id is not null and not v_confirm then
    raise exception 'Confirme a substituição: já existe a fonte vigente "%" (versão %) com o mesmo arquivo ou endereço; esta aprovação a substitui.', v_dup.title, coalesce(v_dup.version, 'sem versão') using errcode = '22023';
  end if;

  select * into s from public.ch_source_searches where id = c.search_id;
  v_day := (c.created_at at time zone 'America/Sao_Paulo')::date;

  v_reg := public.app_ch_register_source(jsonb_build_object(
    'title', v_title, 'organ', v_organ, 'kind', v_kind, 'url', c.final_url, 'version', v_version,
    'published_on', v_published, 'valid_until', v_valid, 'accessed_on', v_day, 'sha256', c.sha256, 'editorial_approved', true));
  v_source_id := (v_reg ->> 'id')::uuid;
  if v_dup.id is not null then
    update public.ch_sources set status = 'superseded', superseded_by = v_source_id where id = v_dup.id and status = 'current';
    perform public.ch_flag_dependents(v_dup.id, 'Fonte substituída: ' || coalesce(v_dup.version, 'versão anterior') || ' → ' || coalesce(v_version, 'nova versão'));
  end if;

  insert into public.ch_documents (owner_id, name, publisher, edition_date, page_count, sha256, storage_path, mime, rights_status, purpose, provenance)
  values (auth.uid(), left(v_title, 300), v_organ, v_published::text, c.page_count, c.sha256, c.storage_path,
          case c.file_kind when 'html' then 'text/html' else 'application/pdf' end, 'reference_only', 'reference_source',
          jsonb_build_object(
            'requested_url', c.requested_url, 'final_url', c.final_url, 'site', c.site_address, 'institution', c.site_institution,
            'sha256', c.sha256, 'size_bytes', c.size_bytes, 'file_kind', c.file_kind,
            'found', 'encontrado pela busca em ' || to_char(c.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
            'search_id', c.search_id, 'provider', s.provider, 'model', s.model, 'run_id', s.run_id, 'candidate_id', c.id))
  returning id into v_document_id;

  update public.ch_sources
     set authority_level = v_level, source_type = v_nature, specialty = nullif(e ->> 'area', ''), theme = nullif(e ->> 'theme', ''),
         editorial_approved_by = auth.uid(), editorial_approved_at = now(), document_id = v_document_id
   where id = v_source_id;

  update public.ch_source_candidates
     set status = 'aprovado', decided_by = auth.uid(), decided_at = now(), source_id = v_source_id, document_id = v_document_id
   where id = c.id;

  perform public.ch_log('source_candidate.approve', c.id::text,
    jsonb_build_object('source_id', v_source_id, 'document_id', v_document_id, 'level', v_level, 'site', c.site_address, 'superseded', v_reg -> 'superseded',
      'currency', c.currency, 'confirmed_older', v_older));
  return jsonb_build_object('source_id', v_source_id, 'document_id', v_document_id, 'superseded', v_reg -> 'superseded',
                            'candidate_versions', coalesce((v_reg ->> 'candidate_versions')::int, 0), 'file_kind', c.file_kind);
end
$$;


-- ---------------------------------------------------------------- tela: pedir busca a partir de uma aba
-- Antes de pedir (e durante o andamento): busca do mesmo tema nos últimos 7 dias (sem as que falharam), candidatos aguardando
-- do tema (pelo tema da busca ou pelo tema que o administrador escreveu no candidato) e a situação da busca pedida
-- (p_search_id). Tema sem caixa; área nula casa com qualquer área. Só administrador.
create or replace function public.app_ch_source_search_check(p_area text, p_theme text, p_search_id uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_theme text := lower(btrim(coalesce(p_theme, '')));
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'recent', case when v_theme = '' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'created_at', x.created_at, 'found_count', x.found_count, 'verified_count', x.verified_count) order by x.created_at desc)
        from (select s.* from public.ch_source_searches s
               where lower(btrim(s.theme)) = v_theme and (v_area is null or s.area is null or s.area = v_area)
                 and s.created_at > now() - interval '7 days' and s.status <> 'falhou'
               order by s.created_at desc limit 5) x), '[]'::jsonb) end,
    'waiting', case when v_theme = '' then 0 else (
      select count(*)::int from public.ch_source_candidates c
       where c.status = 'aguardando'
         and (lower(btrim(coalesce(c.edited ->> 'theme', ''))) = v_theme
              or exists (select 1 from public.ch_source_searches s
                          where s.id = c.search_id and lower(btrim(s.theme)) = v_theme and (v_area is null or s.area is null or s.area = v_area)))) end,
    'search', case when p_search_id is null then null else (
      select jsonb_build_object('id', s.id, 'status', s.status, 'message', s.message, 'found_count', s.found_count, 'verified_count', s.verified_count,
                                'discarded_count', s.discarded_count, 'job_status', j.status)
        from public.ch_source_searches s left join public.ch_jobs j on j.id = s.job_id
       where s.id = p_search_id) end);
end
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function public.ch_worker_source_candidate_create(jsonb) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_library_for_theme(text) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_currency_context(uuid) from public, anon, authenticated;
revoke execute on function public.ch_worker_source_currency_set(jsonb) from public, anon, authenticated;
revoke execute on function public.app_ch_source_candidates(text) from public, anon;
revoke execute on function public.app_ch_source_candidate_approve(uuid, jsonb) from public, anon;
revoke execute on function public.app_ch_source_search_check(text, text, uuid) from public, anon;
