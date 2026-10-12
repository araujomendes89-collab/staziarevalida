-- StaziaMed, LEVA 5 (finalização do gerenciamento da Fase 1): CONFERÊNCIA ANTES DE COLAR (só lê; não altera nada, não grava nada).
-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Mostre o resultado ao Claude antes de seguir.
-- Cada linha tem a conferência e até 5 detalhes. Linhas do bloco 0 com "FALTA" em detalhe_1: PARE e avise o Claude.
with
analises as (
  select count(*) filter (where status = 'published') as publicadas, count(*) as total from public.question_analysis
),
cartoes as (
  select count(*) filter (where status = 'published') as publicados, count(*) as total from public.question_update_cards
),
chaves as (
  select coalesce(max(value::int) filter (where key = 'shadow_mode'), 0) = 1 as sombra,
         coalesce(max(value::int) filter (where key = 'publish_enabled'), 0) = 1 as publica,
         count(*) as n
  from public.ch_flags
),
contas as (
  select u.id, u.email, s.plan::text as plano, s.status::text as situacao,
         exists (select 1 from public.user_roles r where r.user_id = u.id and r.role in ('admin', 'editor')) as equipe,
         coalesce(s.plan in ('pro', 'elite') and ((s.status = 'active' and s.current_period_end > now())
                                                  or (s.status = 'past_due' and s.current_period_end + interval '3 days' > now())), false) as pago_valido,
         coalesce(s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()), false) as teste_valendo
  from auth.users u left join public.subscriptions s on s.user_id = u.id
),
linhas as (
  -- 0. pré-requisitos (o que já precisa estar no ar)
  select 0 as bloco, '0. Pré-requisito: leva 3 (9731 benefícios do Elite) colada' as conferencia,
         case when to_regclass('public.plan_benefits') is not null then 'OK' else 'FALTA: cole a leva 3 antes' end as d1, null::text as d2, null::text as d3, null::text as d4, null::text as d5
  union all
  select 1, '0. Pré-requisito: Fonte complementar (9620) e Central de IAs (5200) coladas',
         case when to_regclass('public.ch_source_watch') is not null and to_regclass('public.ai_settings') is not null and to_regclass('public.ai_usage_ledger') is not null then 'OK' else 'FALTA: cole o que falta do pacote anterior' end, null, null, null, null
  union all
  select 2, '0. Pré-requisito: Central de Conteúdo (documentos, unidades, publicações, aulas, cartões) existe',
         case when to_regclass('public.ch_documents') is not null and to_regclass('public.ch_publications') is not null and to_regclass('public.lessons') is not null
                   and to_regclass('public.flashcards') is not null and to_regclass('public.question_analysis') is not null then 'OK' else 'FALTA: tabela da Central' end, null, null, null, null
  union all
  -- 1. esta leva já foi colada?
  select 10, '1. Esta leva já foi colada? (tabelas novas que ela cria)',
         case when to_regclass('public.support_config') is not null and to_regclass('public.ch_processing_settings') is not null and to_regclass('public.ch_reanalysis_control') is not null
              then 'SIM (já colada; pode colar de novo sem estragar)' when to_regclass('public.support_config') is null and to_regclass('public.ch_processing_settings') is null and to_regclass('public.ch_reanalysis_control') is null
              then 'NÃO (primeira vez)' else 'PARCIAL (alguma parte já foi colada)' end,
         'suporte e relatos (parte 1): ' || case when to_regclass('public.support_config') is not null then 'colada' else 'não' end,
         'documentos (parte 2): ' || case when to_regclass('public.ch_processing_settings') is not null then 'colada' else 'não' end,
         'análise e reanálise (parte 4): ' || case when to_regclass('public.ch_reanalysis_control') is not null then 'colada' else 'não' end,
         'planos e microfone (parte 5): ' || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tutor_config' and column_name = 'stt_team_only') then 'colada' else 'não' end
  union all
  -- 2. CC19 (modo sombra): o que o aluno recebe hoje e vai sumir
  select 20, '2. MODO SOMBRA (parte 4, 9871): análises de questão e cartões de atualização que o aluno VÊ hoje e que SOMEM se as chaves estiverem no padrão',
         'análises publicadas: ' || a.publicadas::text, 'cartões de atualização publicados: ' || c.publicados::text,
         'modo sombra: ' || case when k.sombra then 'LIGADO' else 'desligado' end, 'publicação: ' || case when k.publica then 'LIGADA' else 'desligada' end,
         case when (a.publicadas + c.publicados) = 0 then 'Nada publicado: nada some.'
              when k.sombra or not k.publica then 'ATENÇÃO: some do aluno até desligar o modo sombra E ligar a publicação (Configuração > Chaves liga e desliga).'
              else 'As duas chaves já estão liberadas: nada some.' end
  from analises a, cartoes c, chaves k
  union all
  select 21, '2. Linhas da tabela de chaves da Central (devem ser 6)', n::text, null, null, null, null from chaves
  union all
  -- 3. documentos (parte 2)
  select 30, '3. Documentos por situação (os que já estão "Aguardando revisão" sem rascunho NÃO mudam sozinhos; só os próximos processamentos)', d.status, count(*)::text, null, null, null
  from public.ch_documents d group by d.status
  union all
  select 31, '3. Documentos por dono (o editor passará a ver os de todos da equipe)', 'donos diferentes: ' || count(distinct owner_id)::text, 'documentos no total: ' || count(*)::text, null, null, null
  from public.ch_documents
  union all
  -- 4. unidades e publicação ao aluno (parte 3)
  select 40, '4. Unidades por situação da versão (publicar ao aluno cria aula e cartões; publicação segue desligada de fábrica)', v.status, count(*)::text, null, null, null
  from public.ch_unit_versions v group by v.status
  union all
  select 41, '4. Publicações da Central AINDA NO AR (sem aula do aluno: não ganham aula sozinhas; use "Criar versão para corrigir" e publique de novo)',
         count(*) filter (where retired_at is null)::text, 'já retiradas: ' || count(*) filter (where retired_at is not null)::text, null, null, null
  from public.ch_publications
  union all
  select 42, '4. Aulas e cartões que já existem hoje (a parte 3 passa a trancar só as aulas que vierem da Central)', 'aulas: ' || (select count(*) from public.lessons)::text,
         'aulas publicadas: ' || (select count(*) from public.lessons where published)::text, 'cartões: ' || (select count(*) from public.flashcards)::text, null, null
  union all
  select 43, '4. Materiais visuais com texto de dose/posologia/contraindicação (a parte 3 trava o download até um revisor médico da área revisar)',
         count(*)::text, 'versões de material no total: ' || (select count(*) from public.ch_visual_versions)::text, null, null, null
  from public.ch_visual_versions where content::text ~* '(dose|posologia|contraindica|mg/kg|[0-9] ?(mg|mcg|ml|ui)\y)'
  union all
  select 44, '4. Revisores médicos cadastrados por área (só eles, e quem for revisor da área, confirmam dose; administrador que também é revisor da área também)',
         a.area_code, count(*)::text, null, null, null
  from public.ch_reviewer_areas a group by a.area_code
  union all
  -- 5. taxonomia, fontes monitoradas (parte 4)
  select 50, '5. Taxonomia: versões por situação (um rascunho aberto com tema já renomeado volta ao nome antigo ao publicar; rascunho NOVO não tem esse limite)', t.status, count(*)::text, null, null, null
  from public.ch_taxonomy_versions t group by t.status
  union all
  select 51, '5. Fontes monitoradas (o botão "Conferir fontes monitoradas" passa a deixar o pedido para a próxima rodada do processamento, em até 10 minutos)',
         count(*)::text, 'fontes oficiais vigentes: ' || (select count(*) from public.ch_sources where status = 'current')::text, null, null, null
  from public.ch_source_watch
  union all
  select 52, '5. Questões esperando reanálise por mudança de fonte (botão "Reanalisar agora")', count(*)::text, null, null, null, null
  from public.questions q
  where q.correct_option is not null and q.status <> 'annulled'
    and exists (select 1 from public.question_updates u where u.question_id = q.id and u.proposal is null and u.status in ('queued', 'review_required')
                and u.impact_level = 'UNDETERMINED' and u.diff_item_id is not null and u.triage_kind in ('NUMERIC', 'NEGATION', 'SUBSTANTIVE', 'REMOVED'))
  union all
  -- 6. Tutor, microfone e tetos (parte 5)
  select 60, '6. Tutor hoje (parte 5, 9891: o microfone da Nexus nasce SÓ DA EQUIPE; aluno com plano pago perde o microfone até o dono preencher os tetos e abrir)',
         'tutor ligado: ' || tc.enabled::text, 'só planos pagos: ' || tc.requires_pro::text, 'voz ligada: ' || tc.voice_enabled::text,
         'transcrições dos últimos 7 dias (registro de uso): ' || (select count(*) from public.ai_usage_ledger l where l.feature = 'tutor_stt' and l.day >= (now() at time zone 'America/Sao_Paulo')::date - 7)::text, null
  from public.tutor_config tc
  union all
  select 61, '6. Contas que usariam o microfone se estivesse aberto: planos pagos válidos (não equipe)', count(*) filter (where pago_valido and not equipe)::text,
         'em teste valendo: ' || count(*) filter (where teste_valendo and not equipe and not pago_valido)::text, 'equipe: ' || count(*) filter (where equipe)::text, null, null
  from contas
  union all
  select 62, '6. Tetos de IA hoje (9892 cria o teto geral do mês, que nasce desligado e vazio; só avisa)', 'tetos da Central ligados: ' || s.caps_enabled::text,
         'teto mensal: ' || coalesce(s.monthly_cap_usd::text, 'vazio'), 'teto por chamada: ' || coalesce(s.per_run_cap_usd::text, 'vazio'), null, null
  from public.ai_settings s
  union all
  -- 7. planos (parte 5, tela informativa) e suporte (parte 1)
  select 70, '7. Planos: o que o aluno vai ler na tela de Planos (sem preço, sem botão de assinar). Plano ativo sem descrição aparece como "A equipe ainda vai descrever..."',
         p.code::text, 'ativo: ' || p.active::text, 'descrição: ' || case when coalesce(btrim(p.description), '') = '' then 'VAZIA' else 'preenchida' end,
         'recursos escritos: ' || jsonb_array_length(p.features)::text, null
  from public.plans p
  union all
  select 71, '7. Contas por situação (para saber a quem a tela de Planos e o "Seu plano" na Conta falam)', x.situacao, count(*)::text, null, null, null
  from (select case when equipe then 'Equipe (administrador ou editor)' when pago_valido and plano = 'elite' then 'Plano Elite pago e válido' when pago_valido then 'Plano Pro pago e válido'
                    when teste_valendo then 'Teste grátis valendo' when plano is null then 'SEM linha de assinatura' else 'Sem acesso pago (teste vencido, plano vencido ou cancelado)' end as situacao from contas) x
  group by x.situacao
  union all
  select 72, '7. Total de contas', count(*)::text, null, null, null, null from contas
)
select conferencia, d1 as detalhe_1, d2 as detalhe_2, d3 as detalhe_3, d4 as detalhe_4, d5 as detalhe_5
from linhas order by bloco, d1, d2;
