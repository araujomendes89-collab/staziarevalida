-- =============================================================================
-- RADAR DE EVIDÊNCIAS STAZIAMED (aprovada pelo dono em 2026-10-15: banco de desenvolvimento primeiro, produção depois).
-- Só CRIA coisas novas (tabelas radar_*, funções radar_* e app_admin_radar_*): nenhuma tabela, função ou política existente muda.
-- Depende de: ch_sources, ch_vigilance_items (9940), public.is_staff(), public.is_admin(). Documentação: docs/radar-evidencias.md.
--
-- NÃO duplica a vigilância que já roda (ch_source_watch, ch_source_changes, ch_source_diffs, ch_vigilance_items, ch_topic_*):
-- ESTENDE com o que falta:
--   1. radar_fontes     : uma linha por fonte vigiada com a CLASSIFICAÇÃO da referência (vigente | proposta | revogada |
--                         evidencia_complementar | desconhecido | proibida_samu) e os campos separados (vigência normativa, data
--                         da edição, última conferência, tema clínico, status de revisão);
--   2. radar_eventos    : cada mudança detectada, com o diff por página/trecho e a explicação da IA (sugestão, nunca ordem);
--   3. radar_afetados   : itens (questão, aula, atualização, flashcard) que usam a fonte e ficam marcados "revalidar".
--
-- Regras no banco (não só no script):
--   * só a equipe lê (RLS); escrita só pelas funções radar_* (security definer); aluno e anônimo nunca veem nada;
--   * fonte proibida (SAMU) nunca pode ter uso 'conduta';
--   * a automação NUNCA grava em questions, question_official_answers, aulas ou gabarito: radar_afetados só aponta; quem resolve é
--     o revisor (ch_auto_change_policy da 9940 continua valendo);
--   * a análise da IA é gravada como texto de apoio com precisa_revisao_medica = true (constraint);
--   * "revalidar" SÓ AVISA (decisão do dono): o item continua visível ao aluno e entra na fila de revisão; nada aqui bloqueia
--     publicação. O Radar dá gravidade a cada evento: grave (revogação da fonte ou mudança de conduta) vai também para a decisão do
--     dono; leve (redação, numeração) fica só com os 2 revisores, com prazo de 48 h (prazo_revisao_ate).
-- Pode ser colada mais de uma vez (if not exists / create or replace / drop policy if exists).
-- =============================================================================

create table if not exists public.radar_fontes (
  id uuid primary key default gen_random_uuid(),
  library_doc_id text not null unique,                                  -- doc_id da biblioteca local de fontes
  source_id uuid references public.ch_sources (id) on delete set null,  -- liga à fonte do banco quando existir
  url text,
  referencia text not null check (referencia in ('vigente', 'proposta', 'revogada', 'evidencia_complementar', 'desconhecido', 'proibida_samu')),
  esfera text not null default 'outra' check (esfera in ('sus', 'sociedade', 'oms', 'outra')),
  norma_sus boolean not null default false,
  uso_permitido text not null default 'conduta_apos_conferencia' check (uso_permitido in ('conduta', 'conduta_apos_conferencia', 'apoio', 'historico', 'nenhum')),
  gabarito_inep_imutavel boolean not null default false,
  -- campos separados por fonte (pedido do dono)
  vigencia_normativa text,                 -- ato/portaria e data, como no catálogo
  data_edicao text,                        -- ano/edição do documento
  ultima_conferencia timestamptz,          -- quando o radar/a equipe conferiu a fonte
  tema_clinico text[] not null default '{}',
  status_revisao text not null default 'pendente_revisao_medica' check (status_revisao in ('pendente_revisao_medica', 'em_revisao', 'revisada', 'dispensada')),
  ultimo_sha256 text,
  ultimo_texto_sha256 text,
  ultima_leitura_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint radar_fontes_samu_sem_conduta check (referencia <> 'proibida_samu' or uso_permitido = 'nenhum')
);
create index if not exists radar_fontes_ref_idx on public.radar_fontes (referencia);

create table if not exists public.radar_eventos (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references public.radar_fontes (id) on delete cascade,
  origem text not null check (origem in ('fonte_oficial_mudou', 'arquivo_local_diferente_do_catalogo', 'versoes_divergem_na_biblioteca', 'documento_novo', 'adaptador_novo', 'adaptador_mudou')),
  gravidade text not null default 'leve' check (gravidade in ('grave', 'leve')),
  motivo_gravidade text check (motivo_gravidade is null or char_length(motivo_gravidade) <= 400),
  prazo_revisao_ate timestamptz not null default (now() + interval '48 hours'),     -- 2 agentes revisores, até 48 h
  precisa_decisao_dono boolean generated always as (gravidade = 'grave') stored,    -- só as graves vão ao dono
  doc_id_comparado text,
  detectado_em timestamptz not null default now(),
  sha256_antigo text,
  sha256_novo text,
  resumo jsonb not null default '{}'::jsonb check (jsonb_typeof(resumo) = 'object'),   -- contagem por tipo (NUMERIC, NEGATION, ...)
  -- diff por trecho e página: [{kind, critical, pagina_antiga, pagina_nova, texto_antigo, texto_novo, trecho:{antes,depois}}], até 200
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 200),
  analise_ia jsonb check (analise_ia is null or (jsonb_typeof(analise_ia) = 'object' and (analise_ia ->> 'precisa_revisao_medica') = 'true')),
  ia_modelo text,
  ia_custo_usd numeric(10, 6),
  status text not null default 'pendente' check (status in ('pendente', 'vista', 'em_revisao', 'resolvida', 'descartada')),
  vigilance_item_id uuid references public.ch_vigilance_items (id) on delete set null,   -- item na fila de auditoria já existente
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_em timestamptz,
  nota text check (nota is null or char_length(nota) <= 1000)
);
create index if not exists radar_eventos_status_idx on public.radar_eventos (status, detectado_em desc);
create index if not exists radar_eventos_fonte_idx on public.radar_eventos (fonte_id);
-- repetir a rodada (falha no meio) não duplica o aviso do mesmo item na mesma versão
create unique index if not exists radar_eventos_adaptador_unico on public.radar_eventos (fonte_id, origem, sha256_novo) where sha256_novo is not null and origem in ('adaptador_novo', 'adaptador_mudou');
create index if not exists radar_eventos_graves_idx on public.radar_eventos (detectado_em desc) where gravidade = 'grave' and status in ('pendente', 'vista', 'em_revisao');

create table if not exists public.radar_afetados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.radar_eventos (id) on delete cascade,
  tipo text not null check (tipo in ('questao', 'aula', 'atualizacao', 'flashcard')),
  ref text not null check (char_length(ref) between 1 and 200),    -- question_id, código do Grande Tema (GR-xxx), id da atualização
  acao text not null default 'revalidar' check (acao = 'revalidar'),   -- o radar só marca; nunca altera o item
  nivel text not null default 'tema' check (nivel in ('trecho', 'tema')),   -- trecho = vínculo com página/seção da fonte; tema = só pelo Grande Tema
  paginas integer[] not null default '{}',                              -- páginas da fonte que sustentam o item (quando nivel = trecho)
  citacao text check (citacao is null or char_length(citacao) <= 400),
  status text not null default 'pendente' check (status in ('pendente', 'em_revisao', 'revalidado', 'sem_impacto')),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_em timestamptz,
  unique (evento_id, tipo, ref)
);
create index if not exists radar_afetados_ref_idx on public.radar_afetados (tipo, ref, status);

-- linha de base dos adaptadores (Conitec, DOU/portais, vacinação, Febrasgo): o que o vigia já viu em cada fonte
create table if not exists public.radar_itens_vistos (
  adaptador text not null check (adaptador in ('conitec', 'dou', 'vacinacao', 'febrasgo')),
  chave text not null check (char_length(chave) between 1 and 600),      -- URL ou identificador estável do item
  titulo text,
  versao text,
  data_item date,
  url text not null,
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  texto text check (texto is null or char_length(texto) <= 2000000),      -- texto normalizado, só das páginas comparadas por conteúdo
  primeira_vez_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  primary key (adaptador, chave)
);

-- registro de cada rodada do vigia (auditoria e agendamento: o job roda a cada 3 DIAS; o Cloud Scheduler dispara todo dia e o job
-- pula se a última rodada terminou há menos de ~70 h)
create table if not exists public.radar_rodadas (
  id uuid primary key default gen_random_uuid(),
  iniciou_em timestamptz not null default now(),
  terminou_em timestamptz,
  ensaio boolean not null default false,
  resumo jsonb not null default '{}'::jsonb check (jsonb_typeof(resumo) = 'object')
);
create index if not exists radar_rodadas_fim_idx on public.radar_rodadas (terminou_em desc);

-- contador de custo da IA (teto mensal no código do vigia; aqui fica o número persistido)
create table if not exists public.radar_custo_mensal (
  mes text primary key check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  usd numeric(10, 6) not null default 0 check (usd >= 0),
  chamadas integer not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_saida bigint not null default 0,
  updated_at timestamptz not null default now()
);


-- acesso: equipe lê, ninguém grava direto
alter table public.radar_fontes enable row level security;
alter table public.radar_eventos enable row level security;
alter table public.radar_afetados enable row level security;
alter table public.radar_itens_vistos enable row level security;
alter table public.radar_custo_mensal enable row level security;
alter table public.radar_rodadas enable row level security;
drop policy if exists "radar fontes: equipe lê" on public.radar_fontes;
create policy "radar fontes: equipe lê" on public.radar_fontes for select to authenticated using (public.is_staff());
drop policy if exists "radar eventos: equipe lê" on public.radar_eventos;
create policy "radar eventos: equipe lê" on public.radar_eventos for select to authenticated using (public.is_staff());
drop policy if exists "radar afetados: equipe lê" on public.radar_afetados;
create policy "radar afetados: equipe lê" on public.radar_afetados for select to authenticated using (public.is_staff());
drop policy if exists "radar itens vistos: equipe lê" on public.radar_itens_vistos;
create policy "radar itens vistos: equipe lê" on public.radar_itens_vistos for select to authenticated using (public.is_staff());
drop policy if exists "radar custo: equipe lê" on public.radar_custo_mensal;
create policy "radar custo: equipe lê" on public.radar_custo_mensal for select to authenticated using (public.is_staff());
drop policy if exists "radar rodadas: equipe lê" on public.radar_rodadas;
create policy "radar rodadas: equipe lê" on public.radar_rodadas for select to authenticated using (public.is_staff());
revoke all on table public.radar_fontes, public.radar_eventos, public.radar_afetados, public.radar_itens_vistos, public.radar_custo_mensal, public.radar_rodadas from anon;
revoke insert, update, delete, truncate on table public.radar_fontes, public.radar_eventos, public.radar_afetados, public.radar_itens_vistos, public.radar_custo_mensal, public.radar_rodadas from authenticated;

-- entrada do relatório do vigia (chamada pelo processamento com a chave de serviço, nunca pelo navegador).
-- Fonte nova de adaptador (p_evento -> 'fonte') é criada na hora, sempre como 'desconhecido' até alguém conferir.
create or replace function public.radar_registrar_evento(p_doc_id text, p_evento jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_fonte uuid; v_evento uuid; v_item jsonb; v_grav text;
begin
  select id into v_fonte from public.radar_fontes where library_doc_id = p_doc_id;
  if v_fonte is null and p_evento ? 'fonte' then
    insert into public.radar_fontes (library_doc_id, url, referencia, esfera, norma_sus, uso_permitido)
    values (p_doc_id, p_evento -> 'fonte' ->> 'url', coalesce(p_evento -> 'fonte' ->> 'referencia', 'desconhecido'),
            coalesce(p_evento -> 'fonte' ->> 'esfera', 'outra'), coalesce((p_evento -> 'fonte' ->> 'norma_sus')::boolean, false),
            coalesce(p_evento -> 'fonte' ->> 'uso_permitido', 'conduta_apos_conferencia'))
    on conflict (library_doc_id) do nothing;
    select id into v_fonte from public.radar_fontes where library_doc_id = p_doc_id;
  end if;
  if v_fonte is null then raise exception 'fonte desconhecida no radar: %', p_doc_id; end if;
  v_grav := case when p_evento ->> 'gravidade' = 'grave' then 'grave' else 'leve' end;
  select id into v_evento from public.radar_eventos where fonte_id = v_fonte and origem = p_evento ->> 'origem' and sha256_novo = p_evento ->> 'sha256_novo'
    and origem in ('adaptador_novo', 'adaptador_mudou');
  if v_evento is not null then return v_evento; end if;   -- já registrado em rodada anterior
  insert into public.radar_eventos (fonte_id, origem, gravidade, motivo_gravidade, doc_id_comparado, sha256_antigo, sha256_novo, resumo, itens, analise_ia, ia_modelo, ia_custo_usd)
  values (v_fonte, p_evento ->> 'origem', v_grav, left(p_evento ->> 'motivo_gravidade', 400), p_evento ->> 'doc_id_comparado', p_evento ->> 'sha256_antigo', p_evento ->> 'sha256_novo',
          coalesce(p_evento -> 'resumo', '{}'::jsonb), coalesce(p_evento -> 'itens', '[]'::jsonb), p_evento -> 'analise_ia', p_evento ->> 'ia_modelo', (p_evento ->> 'ia_custo_usd')::numeric)
  returning id into v_evento;
  for v_item in select * from jsonb_array_elements(coalesce(p_evento -> 'afetados', '[]'::jsonb)) loop
    insert into public.radar_afetados (evento_id, tipo, ref, nivel, paginas, citacao)
    values (v_evento, v_item ->> 'tipo', v_item ->> 'ref', case when v_item ->> 'nivel' = 'trecho' then 'trecho' else 'tema' end,
            coalesce(array(select jsonb_array_elements_text(coalesce(v_item -> 'paginas', '[]'::jsonb))::integer), '{}'), left(v_item ->> 'citacao', 400))
    on conflict do nothing;
  end loop;
  -- vai para a fila de auditoria que já existe (a equipe vê no mesmo painel); sem mudar nada no conteúdo
  insert into public.ch_vigilance_items (source_id, kind, summary, details)
  select f.source_id, 'mudanca', left('Radar (' || v_grav || '): ' || (p_evento ->> 'origem') || ' em ' || p_doc_id, 600), jsonb_build_object('radar_evento_id', v_evento)
  from public.radar_fontes f where f.id = v_fonte and f.source_id is not null;
  return v_evento;
end $$;
revoke all on function public.radar_registrar_evento(text, jsonb) from public, anon, authenticated;

-- soma o custo da IA no mês (atômico; só a chave de serviço). Devolve o total do mês depois da soma.
create or replace function public.radar_custo_somar(p_mes text, p_usd numeric, p_entrada bigint, p_saida bigint) returns numeric
language sql security definer set search_path = public as $$
  insert into public.radar_custo_mensal as c (mes, usd, chamadas, tokens_entrada, tokens_saida)
  values (p_mes, greatest(p_usd, 0), 1, greatest(p_entrada, 0), greatest(p_saida, 0))
  on conflict (mes) do update set usd = c.usd + greatest(excluded.usd, 0), chamadas = c.chamadas + 1,
    tokens_entrada = c.tokens_entrada + excluded.tokens_entrada, tokens_saida = c.tokens_saida + excluded.tokens_saida, updated_at = now()
  returning c.usd;
$$;
revoke all on function public.radar_custo_somar(text, numeric, bigint, bigint) from public, anon, authenticated;

-- fila da equipe: eventos pendentes com prazo; só_graves = o que o dono precisa decidir
create or replace function public.app_admin_radar_fila(p_somente_graves boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then coalesce(jsonb_agg(jsonb_build_object(
      'evento', e.id, 'fonte', f.library_doc_id, 'url', f.url, 'origem', e.origem, 'gravidade', e.gravidade, 'motivo', e.motivo_gravidade,
      'detectado_em', e.detectado_em, 'prazo_revisao_ate', e.prazo_revisao_ate, 'vencido', e.prazo_revisao_ate < now(), 'status', e.status,
      'precisa_decisao_dono', e.precisa_decisao_dono,
      'afetados', (select count(*) from public.radar_afetados a where a.evento_id = e.id and a.status in ('pendente', 'em_revisao')))
      order by (e.gravidade = 'grave') desc, e.prazo_revisao_ate), '[]'::jsonb) else '[]'::jsonb end
  from public.radar_eventos e join public.radar_fontes f on f.id = e.fonte_id
  where e.status in ('pendente', 'vista', 'em_revisao') and (not p_somente_graves or e.gravidade = 'grave');
$$;
grant execute on function public.app_admin_radar_fila(boolean) to authenticated;

-- decisão: a equipe (revisores) resolve leves e dá parecer nas graves; só o administrador (dono) encerra uma grave.
-- Mexe SÓ em radar_eventos e radar_afetados: nunca em questão, gabarito, aula ou atualização.
create or replace function public.app_admin_radar_decidir(p_evento uuid, p_status text, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_grav text;
begin
  if not public.is_staff() then raise exception 'Só a equipe decide.' using errcode = '42501'; end if;
  if p_status not in ('vista', 'em_revisao', 'resolvida', 'descartada') then raise exception 'Status inválido.' using errcode = '22023'; end if;
  select gravidade into v_grav from public.radar_eventos where id = p_evento;
  if v_grav is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if v_grav = 'grave' and p_status in ('resolvida', 'descartada') and not public.is_admin() then
    raise exception 'Mudança grave: quem encerra é o dono (administrador).' using errcode = '42501';
  end if;
  update public.radar_eventos set status = p_status, nota = left(p_nota, 1000),
    decidido_por = case when p_status in ('resolvida', 'descartada') then auth.uid() else decidido_por end,
    decidido_em = case when p_status in ('resolvida', 'descartada') then now() else decidido_em end
  where id = p_evento;
  if p_status in ('resolvida', 'descartada') then
    update public.radar_afetados set status = case when p_status = 'resolvida' then 'revalidado' else 'sem_impacto' end, revisado_por = auth.uid(), revisado_em = now()
    where evento_id = p_evento and status in ('pendente', 'em_revisao');
  end if;
end $$;
grant execute on function public.app_admin_radar_decidir(uuid, text, text) to authenticated;

-- leitura da equipe: o que fica "revalidar" por item (para mostrar na ficha da questão/aula)
create or replace function public.app_admin_radar_pendencias(p_tipo text, p_ref text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then coalesce(jsonb_agg(jsonb_build_object('evento', e.id, 'fonte', f.library_doc_id, 'referencia', f.referencia, 'origem', e.origem, 'detectado_em', e.detectado_em, 'status', a.status)), '[]'::jsonb) else '[]'::jsonb end
  from public.radar_afetados a join public.radar_eventos e on e.id = a.evento_id join public.radar_fontes f on f.id = e.fonte_id
  where a.tipo = p_tipo and a.ref = p_ref and a.status in ('pendente', 'em_revisao');
$$;
grant execute on function public.app_admin_radar_pendencias(text, text) to authenticated;
-- Para desfazer: drop function app_admin_radar_decidir(uuid,text,text), app_admin_radar_fila(boolean), app_admin_radar_pendencias(text,text), radar_custo_somar(text,numeric,bigint,bigint), radar_registrar_evento(text,jsonb);
--   drop table radar_afetados, radar_eventos, radar_itens_vistos, radar_custo_mensal, radar_rodadas, radar_fontes;
