-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 2 (Revalida 2023/2, revalida-2023-2): texto fiel ao caderno oficial do Inep.
-- Gerado por scripts/carga-provas/gerar-correcoes.mjs (ramo carga-provas). Não edite à mão.
-- O que faz: 12 correções de texto em 11 questões (11 campos: enunciado ou alternativa).
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
delete from _carga_texto_resultado where prova = 'revalida-2023-2';

do $carga_texto$
declare
  v_dados constant jsonb := $carga_dados$[{"id":"revalida_2023_2_q004","code":"REV-2023.2-Q004","campos":{"statement":{"antes_md5":"4608da5825f4f7d03b393e43fb9728fb","depois":"Uma mulher de 49 anos comparece à unidade básica de saúde para consulta de rotina. Ela relata ao médico que ficou muito preocupada depois de ler uma matéria na internet sobre os riscos da osteoporose após a menopausa. Sua última menstruação ocorreu há 15 meses. A paciente afirma não praticar atividade física regularmente, mas relata alimentação balanceada e sem restrições. Ela nega doenças crônicas, uso de medicações contínuas, etilismo ou tabagismo. Na história familiar, relata que sua mãe, de 67 anos de idade, possui diagnóstico de hipertensão arterial e de hipotireoidismo. Ao exame, a paciente apresenta pressão arterial de 126 × 78 mmHg, índice de massa corporal 27 kg/m². Sua tireoide é normal à palpação. Os exames das mamas, do aparelho cardiovascular e do abdome apresentam-se dentro dos limites da normalidade. Nesse caso, para prevenção primária da osteoporose, o médico deve"}}},{"id":"revalida_2023_2_q016","code":"REV-2023.2-Q016","campos":{"statement":{"antes_md5":"9db26d23ed78cb8e1b90ed2c4d0c4e8d","depois":"Uma mulher de 28 anos é avaliada em unidade básica de saúde com queixa de diarreia crônica. A paciente refere estar preocupada, pois sua mãe e irmã têm doença de Crohn. Ela relata que a diarreia tem 2 anos de evolução, sendo, às vezes, intercalada por períodos de constipação intestinal. Afirma, também, que nunca foi despertada do sono em função da diarreia e que há dor abdominal recorrente que sempre alivia com a evacuação. Refere que não notou emagrecimento ao longo desse período e afirma, ainda, que as fezes não flutuam no vaso sanitário nem contêm muco, pus ou sangue. Ao exame físico, a paciente revela-se eutrófica (índice de massa corporal de 25 kg/m²), normocorada, acianótica, sem edemas e com sinais vitais normais. O resultado de sua colonoscopia está normal e ela ainda aguarda o resultado do exame histopatológico. Acerca do caso relatado, a principal hipótese diagnóstica é"}}},{"id":"revalida_2023_2_q022","code":"REV-2023.2-Q022","campos":{"statement":{"antes_md5":"54928a29e2ec33415a54f8a7f751e183","depois":"Uma mulher de 45 anos procura o pronto-socorro com queixa de dor abdominal há 3 dias em região epigástrica e hipocôndrio direito, de intensidade crescente, associada a náusea e vômitos. Refere sudorese e calafrios, porém não aferiu temperatura corporal. Além disso, apresenta urina de coloração escurecida. A paciente nega episódios anteriores e não possui antecedentes pessoais relevantes. Ao exame físico, apresenta regular estado geral, corada e hidratada; ictérica 2+/4+; frequência cardíaca de 108 batimentos por minuto; pressão arterial de 110 × 70 mmHg; saturação de oxigênio de 97% em ar ambiente; frequência respiratória de 23 incursões respiratórias por minuto; e temperatura axilar de 38,5 °C; abdome doloroso à palpação em região epigástrica e em hipocôndrio direito. Os exames laboratoriais apresentaram o seguinte resultado: Exame Resultado Valor de Referência Leucócitos 16 150 mm³ 4 500 a 11 000 mm³ Transaminase glutâmico 81 U/L 0 a 35 U/L oxalacética (TGO) Transaminase glutâmico 79 U/L 0 a 35 U/L pirúvica (TGP) Fosfatase alcalina 850 U/L 30 a 120 U/L Gama glutamil transferase 790 U/L 1 a 94 U/L GGT Bilirrubinas totais 6,90 mg/dL 0,3 a 1,0 mg/dL Bilirrubinas diretas 6,50 mg/dL 0,1 a 0,3 mg/dL Amilase 45 U/L 20 a 160 U/L Proteína C Reativa (PCR) 220 mg/dL < 8 mg/dL Ultrassonografia de abdome: vesícula biliar de paredes finas, com múltiplos pequenos cálculos em seu interior, e moderada dilatação de vias biliares, sem evidência de fator obstrutivo ao método; fígado e pâncreas estavam sem alterações. Acerca do quadro dessa paciente, qual é a principal hipótese diagnóstica e a conduta imediata adequada?","sem_tabela_md5":"93103593ccdd0225c83015a36e8a0d0f"}}},{"id":"revalida_2023_2_q031","code":"REV-2023.2-Q031","campos":{"statement":{"antes_md5":"f193a76cf635e71b3c19e602591d4a3d","depois":"Um homem branco de 56 anos, sexualmente ativo, portador de síndrome metabólica, retorna ao ambulatório de referência 2 semanas após ter sido diagnosticado com artrite gotosa aguda em joelho direito, através de artrocentese com análise do líquido sinovial. Após o diagnóstico, o paciente manteve o uso de colchicina e interrompeu o tratamento com alopurinol. Segundo relato, apresentou melhora nos seus sintomas com o uso do anti-inflamatório não esteroidal prescrito. Ao exame físico, a articulação do joelho direito revela-se novamente bastante inflamada, com intenso rubor, calor e edema, além de impotência funcional. Realiza nova artrocentese, cujos resultados iniciais revelam 120 000 leucócitos/mm³, com 95% de polimorfonucleares. Considerando a situação desse paciente, a melhor explicação para o quadro articular atual é"}}},{"id":"revalida_2023_2_q057","code":"REV-2023.2-Q057","campos":{"statement":{"antes_md5":"37c5d2751a6b63527b55fdeb7a257713","depois":"Uma paciente de 35 anos possui hérnia incisional em cicatriz mediana infraumbilical de moderado volume, decorrente de apendicectomia realizada há 10 anos, e colo herniário de cerca de 15 × 7 cm. Ela apresenta índice de massa corporal de 37 kg/m² e nega sintomas álgicos, tabagismo, etilismo e outras comorbidades. Em relação ao manejo pré-operatório dessa paciente, a conduta médica adequada, neste momento, é"}}},{"id":"revalida_2023_2_q062","code":"REV-2023.2-Q062","campos":{"A":{"antes_md5":"489286f02bea0cbe9a28931921d7cedf","depois":"aspiração, cânula orofaríngea e máscara de O₂."}}},{"id":"revalida_2023_2_q071","code":"REV-2023.2-Q071","campos":{"statement":{"antes_md5":"c922d5729b9b3bb638d5d60a3fa4cfa0","depois":"Um homem de 68 anos retorna do ambulatório de referência devido a dores em coluna torácica e em lombar, de intensidade progressivamente maior nos últimos 3 meses. Os exames realizados apresentaram os seguintes resultados: Exame Resultado Valor de Referência Hemoglobina 7,5 g/dL 13 a 15 g/dL Hematócrito 23% 36 a 47% Leucócitos totais 8 000 mm³ 4 500 a 11 000 mm³ Proteínas totais 9,4 g/dL 6,5 a 8,1 g/dL Albumina 2,2 g/dL 3,5 a 5,2 g/dL Cálcio sérico 12,3 mg/dL 8,8 a 10,4 mg/dL Creatinina 1,4 mg/dL 0,6 a 1,2 mg/dL Imunoeletroforese de proteínas – banda monoclonal de imunoglobulina (Ig): IgA 5 200 mg/dL 40 a 350 mg/dL IgG 180 mg/dL 700 a 1 600 mg/dL IgM 100 mg/dL 50 a 300 mg/dL A radiografia de coluna vertebral mostrou lesões osteolíticas e fraturas vertebrais em T11, T12, L1 e L2. Nas últimas 2 semanas, o paciente apresenta-se excessivamente sonolento. Considerando essas informações, a hipótese diagnóstica e o exame mais adequado para confirmá-la são, respectivamente,","sem_tabela_md5":"1a291e2ab45e403edfc3da58cf6b97ef"}}},{"id":"revalida_2023_2_q081","code":"REV-2023.2-Q081","campos":{"statement":{"antes_md5":"0d0f59a42161126dfef0d1761ecc8fd1","depois":"Um homem de 43 anos procura a unidade de pronto atendimento por aumento do volume abdominal há 4 semanas, associado a edema de membros inferiores. Ele nega ingestão de bebida alcoólica. Não possui alteração do hábito intestinal ou sintomas dispépticos. Relata que, quando tinha 22 anos, sofreu um atropelamento com fratura de tíbia e recebeu 2 unidades de concentrado de hemácias, quando foi diagnosticado com hepatite por vírus C. Não possui histórico médico familiar relevante. Ao exame físico, apresenta sinais vitais normais, mucosas hipocoradas +/4+ e icterícia +/4+. Os exames do aparelho cardiovascular e respiratório estão normais. O abdome apresenta-se globoso, com ruídos hidroaéreos presentes, indolor à palpação e com sinal de Piparote e macicez móvel positivos. Presença de edema em membros inferiores; pulsos arteriais presentes bilateralmente. Uma paracentese de alívio foi realizada com a drenagem de 2 litros de liquido ascítico de aspecto amarelo citrino. A contagem de células veio com 450 leucócitos por mm³, sendo 320 polimorfonucleares. Não houve acidente de punção e o diferencial entre a albumina sérica e ascítica teve resultado de 1,3. Considerando o caso clínico apresentado, a conduta terapêutica mais adequada para tratamento dessa complicação é prescrever"}}},{"id":"revalida_2023_2_q086","code":"REV-2023.2-Q086","campos":{"C":{"antes_md5":"cddecc88bedd35e5a29a8c64a7ba37eb","depois":"Taxa de filtração glomerular estimada eletronicamente inferior a 45 mL/min/1,73 m²."}}},{"id":"revalida_2023_2_q094","code":"REV-2023.2-Q094","campos":{"statement":{"antes_md5":"20ea09e43b8c52dec128237e67971c7b","depois":"Uma paciente primigesta, de 33 anos, com idade gestacional de 29 semanas e 4 dias, está em tratamento para infecção urinária e é admitida em trabalho de parto pré-termo. A paciente relata ser tabagista eventual e frequentar academia 3 vezes por semana com exercícios de Pilates e de hidroginástica desde os 30 anos. Em seu cartão de pré-natal, lê-se: índice de massa corporal de 30,4 kg/m², hemoglobina de 9 g/dL e hematócrito de 32%. A partir das informações coletadas acerca dessa paciente, quais são fatores de risco identificados para trabalho de parto pré-termo?"}}},{"id":"revalida_2023_2_q097","code":"REV-2023.2-Q097","campos":{"C":{"antes_md5":"6569e2fd344115df339f999ef2ff64a6","depois":"Informar à paciente sobre os critérios de indicação de cirurgia bariátrica, como IMC > 40 Kg/m² e presença de comorbidades, e encaminhá-la à equipe multidisciplinar para traçar plano de cuidados individualizado e estratégia conservadora com acompanhamento semanal."}}}]$carga_dados$::jsonb;
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
      insert into _carga_texto_resultado values ('revalida-2023-2', r ->> 'id', r ->> 'code', '-', 'pulado: questão não encontrada no banco');
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
      insert into _carga_texto_resultado values ('revalida-2023-2', q.id, q.code, case c.campo when 'statement' then 'enunciado' else 'alternativa ' || c.campo end, v_situacao);
    end loop;
    if v_muda then
      v_analises := v_analises + (select count(*)::int from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published');
      update public.questions set statement = v_statement, options = v_options where id = q.id;
      perform public.admin_log('question.updated', q.id, jsonb_build_object('status', q.status, 'reason', 'Texto fiel ao caderno oficial do Inep (carga das provas corrigidas, revisão de 12/10/2026)'));
    end if;
  end loop;
  insert into _carga_texto_resultado values ('revalida-2023-2', '-', '-', 'análises', 'análises publicadas que saíram do ar: ' || v_analises);
  perform set_config('sqie.reason', '', true);
end
$carga_texto$;

select resultado, detalhe from (
  select 0 as ordem,
         case when count(*) filter (where situacao like 'pulado%') = 0 then 'OK: ' else 'ATENÇÃO: ' end
           || 'Revalida 2023/2: '
           || count(distinct questao) filter (where situacao = 'corrigido agora') || ' questões corrigidas agora ('
           || count(*) filter (where situacao = 'corrigido agora') || ' campos); '
           || count(*) filter (where situacao = 'já estava corrigido') || ' campos já estavam corrigidos; '
           || count(*) filter (where situacao like 'pulado%') || ' pulados (de 11)' as resultado,
         max(situacao) filter (where campo = 'análises') as detalhe
  from _carga_texto_resultado where prova = 'revalida-2023-2'
  union all
  select 1, 'PULADO: ' || codigo || ' (' || campo || ')', situacao
  from _carga_texto_resultado where prova = 'revalida-2023-2' and situacao like 'pulado%'
) x order by ordem, resultado;
