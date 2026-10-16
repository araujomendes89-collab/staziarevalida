-- StaziaMed, LEVA 4: CONFERÊNCIA ANTES DE COLAR (só lê; não altera nada, não grava nada).
-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Mostre o resultado ao Claude antes de seguir.
with
contas as (
  select u.id,
         exists (select 1 from public.user_roles r where r.user_id = u.id and r.role in ('admin', 'editor')) as equipe,
         exists (select 1 from public.ch_reviewer_areas a where a.user_id = u.id) as revisor,
         coalesce(s.plan in ('pro', 'elite') and ((s.status = 'active' and s.current_period_end > now())
                                                  or (s.status = 'past_due' and s.current_period_end + interval '3 days' > now())), false) as pago_valido,
         coalesce(s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()), false) as teste_valendo,
         s.user_id is not null as tem_assinatura
  from auth.users u left join public.subscriptions s on s.user_id = u.id
),
linhas as (
  -- 1. rascunhos que existem hoje (os 200 do gerador antigo)
  select 10 as bloco, '1. Rascunhos de questão que existem hoje (todos do gerador antigo; citam apostila)' as conferencia, count(*)::text as d1,
         'aguardando revisão: ' || count(*) filter (where status = 'awaiting_medical_review')::text as d2,
         'já aprovados: ' || count(*) filter (where status = 'approved')::text as d3,
         'com ajustes: ' || count(*) filter (where status = 'needs_changes')::text || ' · recusados: ' || count(*) filter (where status = 'rejected')::text as d4,
         'Os já aprovados continuam aprovados, mas o banco recalcula o selo do texto: eles aparecem como "texto mudou depois da revisão" e precisam de nova revisão antes de publicar. Os que aguardam FICAM SEM PODER APROVAR até ter fonte oficial: Buscar fonte oficial > Usar > Conferir > revisão médica.' as d5
  from public.draft_questions
  union all
  select 11, '1. Rascunhos por área', d.area, count(*)::text, null, null, null from public.draft_questions d group by d.area
  union all
  -- 2. fontes oficiais disponíveis
  select 20, '2. Fontes oficiais vigentes (nível A a D, versão final) com trechos indexados: é o que permite gerar, buscar fonte e aprovar',
         count(*)::text, 'com pelo menos um trecho: ' || count(*) filter (where exists (select 1 from public.ch_source_passages p where p.source_id = s.id))::text,
         case when count(*) filter (where exists (select 1 from public.ch_source_passages p where p.source_id = s.id)) = 0 then 'NENHUMA: "Gerar" e "Buscar fonte oficial" não produzem nada até cadastrar uma fonte oficial com trechos' else 'ok' end, null, null
  from public.ch_sources s where s.status = 'current' and s.kind = 'final' and s.authority_level in ('A', 'B', 'C', 'D')
  union all
  select 21, '2. Fontes na Central por nível', s.authority_level::text, count(*)::text, null, null, null from public.ch_sources s where s.status = 'current' group by s.authority_level
  union all
  -- 3. candidatos a fonte (busca de fontes oficiais com IA)
  select 30, '3. Candidatos a fonte oficial achados pela IA, por situação', c.status::text, count(*)::text, null, null, null from public.ch_source_candidates c group by c.status
  union all
  select 31, '3. Candidatos a fonte oficial: total', count(*)::text, 'os já existentes ganham a marca "data não comprovada / sem comparação" até a IA rever (9820)', null, null, null from public.ch_source_candidates
  union all
  -- 4. IA da Central (pedidos pela tela exigem IA ligada, com função e preço)
  select 40, '4. IAs ligadas na Central de IAs (as ferramentas de IA só funcionam na Administração; nasce tudo desligado)', coalesce(string_agg(p.id, ', ' order by p.id), 'nenhuma'), 'total ligadas: ' || count(*)::text,
         case when count(*) = 0 then 'Nenhuma IA ligada: os pedidos de análise, de conferência e de geração ficam recusados em português até ligar na Central de IAs' else 'ok' end, null, null
  from public.ai_providers p where p.enabled
  union all
  select 41, '4. Funções da Central usadas por esta leva', f.key, coalesce(f.primary_ref ->> 'provider', '(sem IA escolhida)') || coalesce(' / ' || (f.primary_ref ->> 'model'), ''),
         case when f.primary_ref is null then 'FALTA escolher a IA' else 'configurada' end, null, null
  from public.ai_functions f where f.key in ('criacao', 'verificacao', 'engenharia_reversa')
  union all
  select 42, '4. Preços cadastrados (sem preço não há parada de segurança: o pedido é recusado)', count(*)::text, null, null, null, null from public.ai_model_prices
  union all
  -- 5. alunos e as Questões Inéditas (quem treina e quem vê fechado)
  select 50, '5. Contas que vão TREINAR as Questões Inéditas (equipe, revisor, plano pago válido ou teste grátis valendo)',
         count(*) filter (where equipe or revisor or pago_valido or teste_valendo)::text, null, null, null, null from contas
  union all
  select 51, '5. Contas que vão ver as Questões Inéditas FECHADAS com convite (teste vencido, plano vencido ou conta sem assinatura)',
         count(*) filter (where not (equipe or revisor or pago_valido or teste_valendo))::text, 'total de contas: ' || count(*)::text, 'só aparece algo para elas quando houver questão publicada', null, null from contas
  union all
  select 52, '5. Questões que existem hoje (todas oficiais; a prova "Questões Inéditas" nasce vazia)', count(*)::text, 'anuladas: ' || count(*) filter (where status = 'annulled')::text, null, null, null from public.questions
  union all
  -- 6. revisores
  select 60, '6. Revisores médicos cadastrados por área (só eles aprovam rascunho de questão da área; o administrador publica)', a.area_code, count(*)::text, null, null, null
  from public.ch_reviewer_areas a group by a.area_code
  union all
  select 61, '6. Áreas SEM nenhum revisor médico cadastrado (nelas ninguém aprova rascunho)', x.area, null, null, null, null
  from (select unnest(array['CLINICA_MEDICA', 'CIRURGIA', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MFC']) as area) x
  where not exists (select 1 from public.ch_reviewer_areas a where a.area_code = x.area)
  union all
  -- 7. fila de tarefas (a imagem do Cloud Run precisa ser publicada para entender as etapas novas)
  select 70, '7. Tarefas na fila agora (situação)', j.status::text, count(*)::text, null, null, null from public.ch_jobs j group by j.status
  union all
  -- 8. pré-requisitos e se já foi colada
  select 80, '8. Pré-requisito: leva 3 (9700 a 9732) já colada', case when to_regprocedure('public.simulado_gate()') is not null
                                                                       and to_regprocedure('public.ch_worker_lesson_files_renew(text, uuid)') is not null
                                                                       and to_regprocedure('public.ch_worker_podcast_files_renew(uuid, bigint, uuid)') is not null
                                                                       and to_regprocedure('public.app_question_figure(text, integer)') is not null then 'OK' else 'FALTA: cole a leva 3 antes' end, null, null, null, null
  union all
  select 81, '8. Pré-requisito: Fontes oficiais com IA (9610) e Fonte complementar (9620/9621) já coladas',
         case when to_regclass('public.ch_source_candidates') is not null and to_regclass('public.ch_file_holds') is not null
                   and to_regprocedure('public.app_ch_source_candidates(text)') is not null then 'OK' else 'FALTA: cole 9610 e 9620/9621 antes' end, null, null, null, null
  union all
  select 82, '8. Esta leva já foi colada?', case when to_regprocedure('public.draft_approval_blockers(uuid)') is not null and to_regprocedure('public.ch_draft_triage(uuid)') is not null
                                                  then 'SIM (colar de novo é seguro, da parte 1 até a última)' else 'NÃO (primeira colagem)' end, null, null, null, null
)
select l.conferencia, l.d1 as detalhe_1, l.d2 as detalhe_2, l.d3 as detalhe_3, l.d4 as detalhe_4, l.d5 as detalhe_5
from linhas l
order by l.bloco, l.d1, l.d2;
