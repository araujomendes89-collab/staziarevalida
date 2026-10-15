-- =============================================================================
-- RADAR DE EVIDÊNCIAS STAZIAMED: MIGRAÇÃO PROPOSTA (NÃO APLICAR; fica em supabase/propostas de propósito, fora de supabase/migrations).
-- Depende de: ch_sources, ch_vigilance_items (9940), ch_taxonomy_nodes, public.is_staff(). Documentação: docs/radar-evidencias.md.
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
--   * a análise da IA é gravada como texto de apoio com precisa_revisao_medica = true (constraint).
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
  origem text not null check (origem in ('fonte_oficial_mudou', 'arquivo_local_diferente_do_catalogo', 'versoes_divergem_na_biblioteca', 'documento_novo')),
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

create table if not exists public.radar_afetados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.radar_eventos (id) on delete cascade,
  tipo text not null check (tipo in ('questao', 'aula', 'atualizacao', 'flashcard')),
  ref text not null check (char_length(ref) between 1 and 200),    -- question_id, código do Grande Tema (GR-xxx), id da atualização
  acao text not null default 'revalidar' check (acao = 'revalidar'),   -- o radar só marca; nunca altera o item
  status text not null default 'pendente' check (status in ('pendente', 'em_revisao', 'revalidado', 'sem_impacto')),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_em timestamptz,
  unique (evento_id, tipo, ref)
);
create index if not exists radar_afetados_ref_idx on public.radar_afetados (tipo, ref, status);

-- acesso: equipe lê, ninguém grava direto
alter table public.radar_fontes enable row level security;
alter table public.radar_eventos enable row level security;
alter table public.radar_afetados enable row level security;
drop policy if exists "radar fontes: equipe lê" on public.radar_fontes;
create policy "radar fontes: equipe lê" on public.radar_fontes for select to authenticated using (public.is_staff());
drop policy if exists "radar eventos: equipe lê" on public.radar_eventos;
create policy "radar eventos: equipe lê" on public.radar_eventos for select to authenticated using (public.is_staff());
drop policy if exists "radar afetados: equipe lê" on public.radar_afetados;
create policy "radar afetados: equipe lê" on public.radar_afetados for select to authenticated using (public.is_staff());
revoke all on table public.radar_fontes, public.radar_eventos, public.radar_afetados from anon;
revoke insert, update, delete, truncate on table public.radar_fontes, public.radar_eventos, public.radar_afetados from authenticated;

-- entrada do relatório do vigia (chamada pelo processamento com a chave de serviço, nunca pelo navegador)
create or replace function public.radar_registrar_evento(p_doc_id text, p_evento jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_fonte uuid; v_evento uuid; v_item jsonb;
begin
  select id into v_fonte from public.radar_fontes where library_doc_id = p_doc_id;
  if v_fonte is null then raise exception 'fonte desconhecida no radar: %', p_doc_id; end if;
  insert into public.radar_eventos (fonte_id, origem, doc_id_comparado, sha256_antigo, sha256_novo, resumo, itens, analise_ia, ia_modelo, ia_custo_usd)
  values (v_fonte, p_evento ->> 'origem', p_evento ->> 'doc_id_comparado', p_evento ->> 'sha256_antigo', p_evento ->> 'sha256_novo',
          coalesce(p_evento -> 'resumo', '{}'::jsonb), coalesce(p_evento -> 'itens', '[]'::jsonb), p_evento -> 'analise_ia', p_evento ->> 'ia_modelo', (p_evento ->> 'ia_custo_usd')::numeric)
  returning id into v_evento;
  for v_item in select * from jsonb_array_elements(coalesce(p_evento -> 'afetados', '[]'::jsonb)) loop
    insert into public.radar_afetados (evento_id, tipo, ref) values (v_evento, v_item ->> 'tipo', v_item ->> 'ref') on conflict do nothing;
  end loop;
  -- vai para a fila de auditoria que já existe (a equipe vê no mesmo painel); sem mudar nada no conteúdo
  insert into public.ch_vigilance_items (source_id, kind, summary, details)
  select f.source_id, 'mudanca', left('Radar: ' || (p_evento ->> 'origem') || ' em ' || p_doc_id, 600), jsonb_build_object('radar_evento_id', v_evento)
  from public.radar_fontes f where f.id = v_fonte and f.source_id is not null;
  return v_evento;
end $$;
revoke all on function public.radar_registrar_evento(text, jsonb) from public, anon, authenticated;

-- leitura da equipe: o que fica "revalidar" por item (para mostrar na ficha da questão/aula)
create or replace function public.app_admin_radar_pendencias(p_tipo text, p_ref text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then coalesce(jsonb_agg(jsonb_build_object('evento', e.id, 'fonte', f.library_doc_id, 'referencia', f.referencia, 'origem', e.origem, 'detectado_em', e.detectado_em, 'status', a.status)), '[]'::jsonb) else '[]'::jsonb end
  from public.radar_afetados a join public.radar_eventos e on e.id = a.evento_id join public.radar_fontes f on f.id = e.fonte_id
  where a.tipo = p_tipo and a.ref = p_ref and a.status in ('pendente', 'em_revisao');
$$;
grant execute on function public.app_admin_radar_pendencias(text, text) to authenticated;
-- Para desfazer: drop function app_admin_radar_pendencias(text,text), radar_registrar_evento(text,jsonb); drop table radar_afetados, radar_eventos, radar_fontes;
