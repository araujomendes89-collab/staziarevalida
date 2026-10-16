-- StaziaMed, LEVA 3: CONFERÊNCIA ANTES DE COLAR (só lê; não altera nada, não grava nada).
-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Mostre o resultado ao Claude antes de seguir.
-- Se a lista do bloco 1 passar de 1000 linhas, o editor corta a lista; o total certo está na linha do bloco 2.
with
contas as (
  select u.id, u.email, s.plan::text as plano, s.status::text as situacao, s.trial_ends_at, s.current_period_end, s.tutor_trial_started_at,
         exists (select 1 from public.user_roles r where r.user_id = u.id and r.role in ('admin', 'editor')) as equipe,
         exists (select 1 from public.ch_reviewer_areas a where a.user_id = u.id) as revisor,
         coalesce(s.plan in ('pro', 'elite') and ((s.status = 'active' and s.current_period_end > now())
                                                  or (s.status = 'past_due' and s.current_period_end + interval '3 days' > now())), false) as pago_valido,
         coalesce(s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()), false) as teste_valendo,
         s.user_id is not null as tem_assinatura
  from auth.users u left join public.subscriptions s on s.user_id = u.id
),
sem_acesso as (
  select c.*, (select tc.requires_pro from public.tutor_config tc limit 1) as tutor_cobra,
         coalesce((select (x.value #>> '{}')::integer from public.app_settings x where x.key = 'trial_days'), 7) as dias_teste_tutor
  from contas c where not c.equipe and not c.revisor and not c.pago_valido and not c.teste_valendo
),
aulas as (
  select l.*,
         case when coalesce(l.video_url, '') = '' then 'sem vídeo'
              when l.video_url ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be|player\.vimeo\.com|vimeo\.com)/' or l.video_url ~* '\.(mp4|webm)(\?|$)' then 'mede o fim'
              when l.video_url ~* '\.m3u8' then 'link .m3u8'
              else 'outro endereço' end as tipo_video
  from public.lessons l where l.published
),
linhas as (
  -- 1. quem perde, por e-mail
  select 10 as bloco, '1. PERDE os simulados completos (e o teste novo do Tutor) ao colar a parte 4' as conferencia, sa.email::text as d1,
         coalesce(sa.plano, 'sem assinatura') as d2, coalesce(sa.situacao, '-') as d3,
         case when sa.plano is null then 'conta sem nenhuma linha de assinatura'
              when sa.plano in ('pro', 'elite') then 'plano pago até ' || coalesce(sa.current_period_end::date::text, 'sem data')
              when sa.trial_ends_at is null then 'teste sem data de fim (cadastro sem teste)'
              else 'teste até ' || sa.trial_ends_at::date::text end as d4,
         case when not coalesce(sa.tutor_cobra, false) then 'Tutor: aberto a todos (a chave do Tutor está desligada)'
              when sa.tutor_trial_started_at is not null and now() < sa.tutor_trial_started_at + make_interval(days => sa.dias_teste_tutor) then 'Tutor: segue até o fim do teste do Tutor'
              else 'Tutor: PERDE o teste novo do Tutor' end as d5
  from sem_acesso sa
  union all
  select 20, '2. Total de contas que perdem os simulados completos', count(*)::text,
         'Perdem também o teste novo do Tutor: ' || count(*) filter (where coalesce(tutor_cobra, false) and not (tutor_trial_started_at is not null and now() < tutor_trial_started_at + make_interval(days => dias_teste_tutor)))::text,
         null, null, null
  from sem_acesso
  union all
  -- 3. contas por situação
  select 30, '3. Contas por situação', x.situacao, count(*)::text, null, null, null
  from (select case when equipe then 'Equipe (administrador ou editor)'
                    when revisor then 'Revisor médico (sem papel de equipe)'
                    when pago_valido and plano = 'elite' then 'Plano Elite pago e válido'
                    when pago_valido then 'Plano Pro pago e válido'
                    when teste_valendo then 'Teste grátis valendo'
                    when not tem_assinatura then 'SEM linha de assinatura'
                    when plano = 'trial' then 'Teste grátis vencido (ou cadastro sem teste)'
                    else 'Plano pago vencido, cancelado ou expirado' end as situacao from contas) x
  group by x.situacao
  union all
  select 31, '3. Contas por situação', 'TOTAL de contas', count(*)::text, null, null, null from contas
  union all
  -- 4. chaves que a leva passa a respeitar
  select 40, '4. Chave "Oferecer teste grátis no cadastro" (Planos > Teste grátis): a 9732 faz ela valer de verdade',
         coalesce((select case when p.active then 'LIGADA (cadastro novo continua com teste)' else 'DESLIGADA (cadastro novo passa a nascer SEM teste)' end from public.plans p where p.code = 'trial'), 'sem linha do plano (vale como ligada)'),
         null, null, null, null
  union all
  select 41, '4. Tutor hoje (enabled / só planos pagos + teste)', 'enabled=' || tc.enabled::text, 'requires_pro=' || tc.requires_pro::text,
         'quem já começou o teste do Tutor: ' || (select count(*) from public.subscriptions where tutor_trial_started_at is not null)::text, null, null
  from public.tutor_config tc
  union all
  -- 5. Aulas
  select 50, '5. Aulas publicadas e o que acontece com o XP de concluir (9711)', a.tipo_video, count(*)::text,
         case a.tipo_video when 'mede o fim' then 'dá XP só a quem assistiu até o fim' else 'DEIXA de dar XP (não dá para medir o fim)' end, null, null
  from aulas a group by a.tipo_video
  union all
  select 51, '5. Materiais de aula (9710 passa a apagar o arquivo ao remover)', 'materiais com arquivo no depósito', count(*) filter (where storage_path is not null)::text,
         'materiais só com link: ' || count(*) filter (where storage_path is null)::text, 'total: ' || count(*)::text, null
  from public.lesson_materials
  union all
  select 52, '5. Alunos que já concluíram aula (não perdem XP: nada é retroativo)', count(distinct user_id)::text, 'aulas concluídas: ' || count(*) filter (where completed_at is not null)::text, null, null, null
  from public.lesson_progress
  union all
  -- 6. Podcasts
  select 60, '6. Podcasts: episódios, fontes e arquivos (9721 só limpa a partir de agora)', 'episódios: ' || count(*)::text, 'com áudio no depósito: ' || count(*) filter (where audio_path is not null)::text,
         'sem grande área (só o administrador aprova): ' || count(*) filter (where area is null)::text, null, null
  from public.podcasts
  union all
  select 61, '6. Fontes de podcast com arquivo no depósito', count(*) filter (where storage_path is not null)::text, 'fontes só com link: ' || count(*) filter (where storage_path is null)::text, null, null, null
  from public.podcast_sources
  union all
  select 62, '6. Arquivos de podcast que HOJE aparecem como esquecidos no depósito (nada é apagado; a lista inteira está no arquivo OPCIONAL)',
         count(*)::text || case when count(*) = 1 then ' arquivo' else ' arquivos' end, round(coalesce(sum(e.bytes), 0) / 1048576.0, 1)::text || ' MB', null, null, null
  from (
    select o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes
    from storage.objects o
    where o.bucket_id = 'podcasts' and o.name !~ '(^|/)\.emptyFolderPlaceholder$'
      and not exists (select 1 from public.podcasts p where p.audio_path = o.name)
      and not exists (select 1 from public.podcast_sources s where s.storage_path = o.name)
      and not exists (select 1 from public.lesson_materials m where m.storage_path = o.name)
      and not exists (select 1 from public.ch_file_holds h where h.storage_path = o.name)
      and (o.name !~ '/tmp/' or o.created_at < now() - interval '1 day')
  ) e
  union all
  -- 7. Questões
  select 70, '7. Questões que citam figura e estão SEM imagem (hoje ficam fora do treino; a 9700 deixa a equipe enviar a figura)',
         count(*) filter (where needs_image and jsonb_array_length(images) = 0)::text,
         'com figura já cadastrada: ' || count(*) filter (where jsonb_array_length(images) > 0)::text,
         'com mais de uma figura: ' || count(*) filter (where jsonb_array_length(images) > 1)::text,
         'figura com o campo "path" (deve ser 0): ' || count(*) filter (where images @? '$[*].path')::text, null
  from public.questions
  union all
  select 71, '7. Questões com explicação, conduta ou "o que avalia" já gravados (continuam visíveis; só texto NOVO ou alterado vai para "Em revisão")',
         count(*) filter (where expected_conduct is not null and btrim(expected_conduct) <> ''
                           or inep_intent is not null and btrim(inep_intent) <> ''
                           or exists (select 1 from jsonb_array_elements(options) o where btrim(coalesce(o ->> 'explanation', '')) <> ''))::text,
         'total de questões: ' || count(*)::text, null, null, null
  from public.questions
  union all
  select 72, '7. Revisores médicos cadastrados por área (só eles e o administrador aprovam comentário de questão e roteiro de podcast)',
         a.area_code, count(*)::text, null, null, null
  from public.ch_reviewer_areas a group by a.area_code
  union all
  select 73, '7. Áreas SEM nenhum revisor médico cadastrado (nelas só o administrador aprova)',
         x.area, null, null, null, null
  from (select unnest(array['CLINICA_MEDICA', 'CIRURGIA', 'GINECOLOGIA_OBSTETRICIA', 'PEDIATRIA', 'MFC']) as area) x
  where not exists (select 1 from public.ch_reviewer_areas a where a.area_code = x.area)
  union all
  -- 8. pré-requisitos (a leva exige as migrações anteriores já coladas)
  select 80, '8. Pré-requisito: Fonte complementar (9620/9621) já colada', case when to_regclass('public.ch_file_holds') is not null
                                                                                and to_regprocedure('public.ch_raw_practice_correction_view(text, text)') is not null
                                                                                and to_regprocedure('public.ch_raw_app_admin_podcast_approve(uuid, text)') is not null then 'OK' else 'FALTA: cole a Fonte complementar antes' end, null, null, null, null
  union all
  select 81, '8. Pré-requisito: correções da aba Questões (7700) e acesso (9550) já coladas',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'explanations_review')
                   and to_regprocedure('public.subscription_is_paid(public.plan_code, public.subscription_status, timestamp with time zone)') is not null
                   and to_regprocedure('public.user_has_full_access(uuid)') is not null then 'OK' else 'FALTA: cole as partes 1 a 7 do pacote de 11/10 antes' end, null, null, null, null
  union all
  select 82, '8. Esta leva já foi colada?', case when to_regprocedure('public.simulado_gate()') is not null then 'SIM (a 9730 já está no banco; colar de novo é seguro)' else 'NÃO (primeira colagem)' end, null, null, null, null
)
select l.conferencia, l.d1 as detalhe_1, l.d2 as detalhe_2, l.d3 as detalhe_3, l.d4 as detalhe_4, l.d5 as detalhe_5
from linhas l
order by l.bloco, l.d1, l.d2;
