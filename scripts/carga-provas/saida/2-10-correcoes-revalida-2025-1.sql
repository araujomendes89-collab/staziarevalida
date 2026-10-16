-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 2 (Revalida 2025/1, revalida-2025-1): texto fiel ao caderno oficial do Inep.
-- Gerado por scripts/carga-provas/gerar-correcoes.mjs (ramo carga-provas). Não edite à mão.
-- O que faz: 8 correções de texto em 8 questões (8 campos: enunciado ou alternativa).
--   * Cada campo só é trocado se o texto no banco ainda é EXATAMENTE o de 12/10/2026 (o que a revisão comparou com o PDF).
--     Se alguém mudou esse texto depois, o campo é PULADO e aparece na lista do fim. Nada é apagado.
--   * O texto antigo fica no histórico da questão (Administração > Questões > Editar > Ver histórico de mudanças), com o motivo.
--   * NÃO mexe em gabarito, situação (anulada), explicações, conduta esperada, "o que a questão avalia", tema, figuras.
--   * Regra do sistema (migração 9500): se a questão tinha Análise Stazia publicada, ela sai do ar (explicava o texto antigo);
--     a contagem aparece no fim.
-- Como colar: editor SQL do Supabase, o arquivo INTEIRO, Run. A primeira linha do resultado começa com "OK:" (ou "ATENÇÃO:" se
-- algum campo foi pulado; mostre ao Claude). Pode colar de novo: a segunda vez não muda nada.
-- =============================================================================
create temp table if not exists _carga_texto_resultado (prova text, questao text, codigo text, campo text, situacao text);
delete from _carga_texto_resultado where prova = 'revalida-2025-1';

do $carga_texto$
declare
  v_dados constant jsonb := $carga_dados$[{"id":"revalida_2025_1_q001","code":"REV-2025.1-Q001","campos":{"statement":{"antes_md5":"8009e11f370e19206ffcbc76f099b638","depois":"Homem de 62 anos vai a uma unidade de pronto atendimento (UPA) referindo cansaço e tontura ao se levantar há 2 semanas. Nega outras queixas, comorbidades ou cirurgias prévias, assim como o uso de medicamentos. Ao exame físico, apresenta-se corado, hidratado, lúcido e orientado em tempo e espaço; pressão arterial de 120 x 70 mmHg; frequência cardíaca de 45 bpm; saturação de O₂ de 96% em ar ambiente; ritmo cardíaco regular, sem turgência jugular; murmúrio vesicular fisiológico, sem ruídos acessórios; e enchimento capilar de 2 segundos. Diante disso, o médico solicita um eletrocardiograma de 12 derivações: A partir desse quadro clínico e da interpretação do eletrocardiograma, a conduta adequada consiste em"}}},{"id":"revalida_2025_1_q006","code":"REV-2025.1-Q006","campos":{"statement":{"antes_md5":"75cef5306c9e625f0f62840098a0d6fa","depois":"Mulher de 38 anos, com deficiência congênita de IgA, é atendida em ambulatório de clínica médica devido a insucesso terapêutico no tratamento de infecção por Helicobacter pylori. Apresentava diagnóstico de úlcera duodenal, tendo sido prescrito omeprazol, amoxicilina e claritromicina. Apesar da melhora clínica, observou-se persistência da infecção em teste respiratório com C¹³. Atribuiu-se o insucesso terapêutico ao uso recorrente de macrolídeos e fluoroquinolonas. Nesse caso, deve-se prescrever"}}},{"id":"revalida_2025_1_q024","code":"REV-2025.1-Q024","campos":{"B":{"antes_md5":"2d2e150a137d2ee7f350bca2633f1012","depois":"Descolamento prematuro de placenta; iniciar a administração de reposição volêmica com cristaloides e com oxigênio e iniciar a monitorização contínua materno-fetal, enquanto a paciente é preparada para o parto vaginal induzido."}}},{"id":"revalida_2025_1_q027","code":"REV-2025.1-Q027","campos":{"D":{"antes_md5":"85f22b5ffcc95c0c9b19c2b2186a0dbf","depois":"Dor à descompressão entre a espinha ilíaca ântero-superior e o umbigo."}}},{"id":"revalida_2025_1_q040","code":"REV-2025.1-Q040","campos":{"A":{"antes_md5":"efb0d6b9b0695c45ef0af78f8d93f7ef","depois":"Solicitar ressonância magnética da coluna lombar, devido à irradiação da dor para membro inferior; prescrever anti-inflamatório não esteroide associado a paracetamol."}}},{"id":"revalida_2025_1_q079","code":"REV-2025.1-Q079","campos":{"statement":{"antes_md5":"6ee07e203c01db468c401ace20791acc","depois":"Multípara de 43 anos, lactante no 2º mês de amamentação, procura atendimento afirmando área de hiperemia e dor no quadrante superior-lateral de mama esquerda, há 5 dias. Relata que, inicialmente, a área afetada era próxima à aréola e que depois foi se estendendo para a região axilar homolateral. Verifica-se ponto de flutuação e adenopatia dolorosa na axila esquerda. Paciente febril no momento do atendimento. Diante desse quadro, deve-se realizar"}}},{"id":"revalida_2025_1_q083","code":"REV-2025.1-Q083","campos":{"B":{"antes_md5":"4fec911039bebf30c667dc7e747c7663","depois":"resposta à administração de ferro oral é resistente; deve-se repor com ferro endovenoso e investigar a má absorção por doença celíaca."}}},{"id":"revalida_2025_1_q086","code":"REV-2025.1-Q086","campos":{"statement":{"antes_md5":"5d1052687d1c9dddc6514d4d7484cf11","depois":"Homem de 68 anos em quimioterapia paliativa para câncer gástrico avançado é internado devido à queda do estado geral e dispneia. Ao ser atendido, apresenta Saturação de O₂ de 86%, sendo prescrita oxigenioterapia. A tomografia computadorizada de tórax evidencia padrão sugestivo de extensa linfangite carcinomatosa bilateral e pequeno derrame pleural à esquerda. Apesar do registro em prontuário da “diretiva antecipada de vontade” de não ser submetido a procedimentos invasivos, um de seus filhos insiste que o paciente seja submetido à ventilação mecânica invasiva. Nesse caso, a conduta adequada diante da piora respiratória do paciente é"}}}]$carga_dados$::jsonb;
  r jsonb;
  c record;
  q public.questions;
  v_statement text;
  v_options jsonb;
  v_atual text;
  v_situacao text;
  v_muda boolean;
  v_analises integer := 0;
begin
  perform set_config('sqie.reason', 'Texto fiel ao caderno oficial do Inep (carga das provas corrigidas, revisão de 12/10/2026)', true);
  for r in select value from jsonb_array_elements(v_dados) loop
    select * into q from public.questions x where x.id = r ->> 'id' for update;
    if not found then
      insert into _carga_texto_resultado values ('revalida-2025-1', r ->> 'id', r ->> 'code', '-', 'pulado: questão não encontrada no banco');
      continue;
    end if;
    v_statement := q.statement;
    v_options := q.options;
    v_muda := false;
    for c in select key as campo, value as v from jsonb_each(r -> 'campos') loop
      v_atual := case when c.campo = 'statement' then q.statement
                      else (select o ->> 'text' from jsonb_array_elements(q.options) o where o ->> 'id' = c.campo limit 1) end;
      if v_atual is not distinct from (c.v ->> 'depois') or md5(v_atual) is not distinct from (c.v ->> 'sem_tabela_md5') then
        v_situacao := 'já estava corrigido';
      elsif v_atual is not null and md5(v_atual) = c.v ->> 'antes_md5' then
        v_situacao := 'corrigido agora';
        v_muda := true;
        if c.campo = 'statement' then
          v_statement := c.v ->> 'depois';
        else
          v_options := (select jsonb_agg(case when o ->> 'id' = c.campo then jsonb_set(o, '{text}', to_jsonb(c.v ->> 'depois')) else o end order by n)
                        from jsonb_array_elements(v_options) with ordinality as x (o, n));
        end if;
      else
        v_situacao := 'pulado: o texto no banco mudou depois de 12/10/2026';
      end if;
      insert into _carga_texto_resultado values ('revalida-2025-1', q.id, q.code, case c.campo when 'statement' then 'enunciado' else 'alternativa ' || c.campo end, v_situacao);
    end loop;
    if v_muda then
      v_analises := v_analises + (select count(*)::int from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published');
      update public.questions set statement = v_statement, options = v_options where id = q.id;
      perform public.admin_log('question.updated', q.id, jsonb_build_object('status', q.status, 'reason', 'Texto fiel ao caderno oficial do Inep (carga das provas corrigidas, revisão de 12/10/2026)'));
    end if;
  end loop;
  insert into _carga_texto_resultado values ('revalida-2025-1', '-', '-', 'análises', 'análises publicadas que saíram do ar: ' || v_analises);
  perform set_config('sqie.reason', '', true);
end
$carga_texto$;

select resultado, detalhe from (
  select 0 as ordem,
         case when count(*) filter (where situacao like 'pulado%') = 0 then 'OK: ' else 'ATENÇÃO: ' end
           || 'Revalida 2025/1: '
           || count(distinct questao) filter (where situacao = 'corrigido agora') || ' questões corrigidas agora ('
           || count(*) filter (where situacao = 'corrigido agora') || ' campos); '
           || count(*) filter (where situacao = 'já estava corrigido') || ' campos já estavam corrigidos; '
           || count(*) filter (where situacao like 'pulado%') || ' pulados (de 8)' as resultado,
         max(situacao) filter (where campo = 'análises') as detalhe
  from _carga_texto_resultado where prova = 'revalida-2025-1'
  union all
  select 1, 'PULADO: ' || codigo || ' (' || campo || ')', situacao
  from _carga_texto_resultado where prova = 'revalida-2025-1' and situacao like 'pulado%'
) x order by ordem, resultado;
