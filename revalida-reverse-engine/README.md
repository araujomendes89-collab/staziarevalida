# revalida-reverse-engine

Motor de engenharia reversa e análise das provas da 1ª etapa do Revalida INEP.

## Operação automática: apenas prova e gabarito

Crie uma pasta para a nova edição e coloque nela exatamente dois PDFs. Os nomes
devem conter ano e edição, por exemplo:

```text
entrada/Revalida 2027-1/
├── 2027_1_prova.pdf
└── 2027_1_gabarito.pdf
```

Para conferir tudo localmente, sem enviar conteúdo para serviços externos:

```bash
./revalida automate "entrada/Revalida 2027-1"
```

O sistema identifica prova e gabarito, detecta a edição, extrai a sequência de
questões, valida A/B/C/D e anulações, copia os PDFs com hash, extrai imagens,
cria a configuração da edição e monta o master. Se qualquer associação não for
segura, o processamento é interrompido antes da classificação.

Para executar também os dois passes independentes de classificação, comparação,
adjudicação local, consolidação, auditoria e exportação para o StaziaMed:

```bash
./revalida automate "entrada/Revalida 2027-1" --allow-openai
```

O comando automático usa por padrão o modo híbrido: `qwen3:8b` no Ollama para
classificação local e `gpt-5.6-luna` somente para questões com imagem, saída
inválida, revisão solicitada ou confiança inferior a 0,86. No máximo 40 revisões
pagas são permitidas por passe; o limite pode ser reduzido com
`--max-openai-reviews`. Para usar somente o modelo local, sem chamadas externas:

```bash
./revalida automate "entrada/Revalida 2027-1" --backend local
```

`--allow-openai` é uma autorização explícita para as revisões híbridas enviarem
enunciados, alternativas, gabaritos e imagens necessárias à OpenAI. A execução é reiniciável:
se for interrompida, basta repetir o comando e os checkpoints válidos serão
reutilizados.

O modelo local fica em `/Volumes/PortableSSD/ModelosOllama`. O PortableSSD deve
estar conectado antes de iniciar o processamento.

## Saída para o StaziaMed Revalida

Cada edição concluída é exportada para
`data/exports/staziamed/<exam_id>/`, contendo:

- `question_bank.json`: banco completo e versionado;
- `questions_active.jsonl`: somente questões válidas para importação;
- `questions_all.jsonl`: inclui também as anuladas para rastreabilidade;
- `questions/qNNN.json`: uma questão por arquivo;
- `generation_profile.json`: distribuição da banca e blueprints para inéditas;
- `manifest.json`: quantidades, versão do esquema e nomes dos arquivos.

Cada questão ativa inclui enunciado, alternativas, gabarito, explicação,
decisão clínica, conceitos-chave, DNA canônico, imagens e proveniência. Questões
anuladas nunca entram no arquivo ativo.

O perfil de geração usa apenas padrões agregados. Ele exige um pacote local de
atualizações médicas antes da geração de inéditas e determina que todo conteúdo
gerado permaneça como rascunho para revisão editorial antes da publicação.

Para gerar rascunhos inéditos, informe um PDF revisado ou uma pasta com resumos
de diretrizes, notas técnicas e atualizações. São aceitos arquivos `.pdf`,
`.md`, `.txt` e `.json`. Depois execute:

```bash
./revalida generate-questions revalida_2025_2 \
  --count 10 \
  --updates-dir "atualizacoes/2026" \
  --target-b=-0.40 \
  --allow-openai
```

Somente o blueprint agregado escolhido e o conteúdo da pasta de atualizações
são enviados à OpenAI. Os enunciados oficiais permanecem locais e são usados
apenas para a verificação de similaridade. Qualquer rascunho com similaridade
igual ou superior a 80% é rejeitado. A saída fica em
`data/exports/staziamed/<exam_id>/generated/novel_questions_v2.jsonl`, sempre com
status `DRAFT_REVIEW_REQUIRED`.

`--target-b` é usado exclusivamente na criação das questões inéditas. Ele
orienta o desenho editorial do item, mas não é apresentado como dificuldade
empírica. As provas oficiais, seus DNAs e seus gabaritos não recebem parâmetros
TRI e não são modificados por esse recurso.

Também é possível solicitar a geração ao final do comando único:

```bash
./revalida automate "entrada/Revalida 2027-1" \
  --allow-openai \
  --generate-count 10 \
  --updates-dir "atualizacoes/2027"
```

## Instalação e testes

```bash
python -m pip install -e ".[test]"
python -m pytest -q
```

O iniciador portátil `./revalida` já usa o ambiente virtual do projeto, sem
exigir instalação adicional. Após uma instalação editável, a CLI também fica
disponível globalmente no ambiente como `revalida`.

## Edições configuradas

As configurações ficam em `src/config/exams.py`. Cada edição declara seu
`exam_id`, versão e quantidade de questões, master, diretórios de imagens,
taxonomias de classificação e consolidação e adapter de gabarito.

Para listar as edições disponíveis:

```bash
python -m src.cli.main exams
```

Para verificar se todos os recursos locais de uma edição estão prontos:

```bash
python -m src.cli.main validate-exam revalida_2026_1
python -m src.cli.main validate-exam revalida_2025_2
```

Essa validação confere o contrato do adapter, mas não abre PDFs, não executa o
parser, não lê credenciais e não acessa APIs.

O Revalida 2025/2 já está configurado com prova, gabarito definitivo, adapter
próprio, master de 100 questões e três recursos visuais (Q005, Q091 e Q100).
As questões Q007, Q009, Q011, Q043, Q055, Q085 e Q087 estão preservadas no
master como anuladas e são excluídas automaticamente dos dois passes de DNA.

Quando os PDFs e recursos visuais de uma edição já estiverem configurados, o
master pode ser reconstruído de forma determinística:

```bash
python -m src.cli.main build-master revalida_2025_2
```

## Classificação Question DNA

Os dois passes são independentes e usam o mesmo master e a mesma taxonomia
configurada, sem compartilhar classificações entre si.

Cada registro novo informa `classification_source`, `local_model`,
`review_model` e `review_trigger`, permitindo auditar exatamente onde houve
revisão paga. Classificações antigas permanecem intactas.

```bash
python -m src.classification.classify_dna_all \
  --exam-id revalida_2026_1 --pass-number 1

python -m src.classification.classify_dna_all \
  --exam-id revalida_2026_1 --pass-number 2
```

É possível limitar a execução com `--start` e `--end`. O processo valida o
master e o checkpoint antes de criar o cliente OpenAI.

Use `--max-new-questions N` para impedir que uma execução faça mais chamadas
novas do que o limite autorizado. Retry e timeout são definidos por edição.

Para conferir uma edição sem ler credenciais, criar arquivos ou acessar a API:

```bash
python -m src.classification.classify_dna_all \
  --exam-id revalida_2026_1 --pass-number 1 --validate-only
```

Os pilotos também aceitam `--validate-only`:

```bash
python -m src.classification.classify_dna_pilot \
  --exam-id revalida_2026_1 --validate-only
python -m src.classification.classify_dna_pilot_pass2 \
  --exam-id revalida_2026_1 --validate-only
```

## Comparação, consolidação e auditoria

```bash
python -m src.verification.compare_dna_production --exam-id revalida_2026_1
python -m src.ingestion.build_canonical_dna --exam-id revalida_2026_1
python -m src.verification.audit_canonical_dna --exam-id revalida_2026_1
```

Uma divergência pode ser validada ou registrada pela CLI:

```bash
./revalida adjudicate revalida_2026_1 1 cognitive_task \
  CHOOSE_INITIAL_TREATMENT --dry-run
```

Sem `--dry-run`, a decisão é gravada atomicamente no arquivo de adjudicações.

## Nova matriz Revalida/Enamed e camada psicométrica

O DNA original permanece congelado. A análise de competências da nova matriz
é gravada separadamente em `data/processed/dna/matrix_v1/`, evitando misturar
versões ou alterar os resultados consolidados de 2026/1.

Antes de iniciar, valide localmente as duas edições, sem acessar a OpenAI:

```bash
python -m src.classification.classify_matrix_dna \
  --exam-id revalida_2026_1 --pass-number 1 --validate-only
python -m src.classification.classify_matrix_dna \
  --exam-id enamed_2025 --pass-number 1 --validate-only
```

Para produzir os dois passes independentes usando somente o Ollama:

```bash
python -m src.classification.classify_matrix_dna \
  --exam-id revalida_2026_1 --pass-number 1
python -m src.classification.classify_matrix_dna \
  --exam-id revalida_2026_1 --pass-number 2
python -m src.classification.classify_matrix_dna \
  --exam-id enamed_2025 --pass-number 1
python -m src.classification.classify_matrix_dna \
  --exam-id enamed_2025 --pass-number 2
```

Para executar a mesma análise no GPT-5.6 Luna, com checkpoints e até cinco
chamadas simultâneas:

```bash
python -m src.classification.classify_matrix_dna \
  --exam-id revalida_2026_1 --pass-number 1 \
  --backend openai --openai-model gpt-5.6-luna --workers 5
```

Repita o comando para o passe 2 e para `enamed_2025`. O conteúdo da prova só é
enviado à OpenAI quando `--backend openai` é informado explicitamente.

Essa camada registra `asks_for`, estágios diagnóstico e terapêutico, dependência
do SUS/protocolo, pistas discriminadoras, sinais de alarme, modelos de erro dos
distratores, profundidade do conhecimento, complexidade decisória, relevância
generalista e a escala competência-versus-memorização.

Depois de completar os dois passes, gere a comparação quantitativa:

```bash
python -m src.analysis.compare_new_matrix
python -m src.analysis.report_new_matrix
```

O arquivo resultante fica em
`data/processed/reports/new_matrix_comparison.json`; a síntese editorial fica em
`data/processed/reports/new_matrix_comparison.md`, acompanhada do manifesto da
etapa 2 com hashes dos quatro passes. Use `--allow-partial`
somente para acompanhar cobertura durante o processamento; resultados parciais
não devem ser interpretados como o DNA final da banca.

O módulo `src.models.psychometrics` mantém dificuldade-alvo editorial separada
de `irt_difficulty_b`. Parâmetros Rasch empíricos só são aceitos quando houver
fonte, população e tamanho de amostra. O sistema não converte dificuldade
estimada por IA em dificuldade TRI. Essa camada é anexada somente a questões
inéditas geradas; nunca às provas oficiais usadas como fonte histórica.

## Blueprint institucional para o próximo Revalida/Inep 2026

As provas históricas são usadas exclusivamente para recorrência, recência e
engenharia reversa agregada. Nenhum enunciado histórico é exportado no blueprint
e nenhuma prova passada recebe parâmetro TRI.

```bash
python -m src.analysis.build_institutional_blueprint
python -m src.verification.audit_institutional_blueprint
```

O plano resultante possui 100 posições para questões inéditas. Cada posição
recebe área, subárea, competência, tarefa cognitiva e um alvo editorial Rasch.
Esses alvos são obrigatórios para as inéditas do próximo Revalida/Inep 2026,
mas todas começam como `UNCALIBRATED`; o parâmetro `b` empírico só pode ser
calculado depois da aplicação e coleta de respostas reais.

## Questões gêmeas

Para encontrar questões com tema, competência e decisão semelhantes em edições
diferentes, sem acessar APIs:

```bash
./revalida find-twins
./revalida find-twins --theme cardiologia --limit 50
```

O resultado fica em `data/processed/reports/twin_questions.json`. As provas
históricas são usadas somente para comparação e engenharia reversa.

Cada par é classificado como repetição quase literal, caso clínico semelhante
ou gêmea temática. A comparação combina tema, decisão clínica, conceitos-chave,
diagnósticos, tarefa cognitiva e semelhança do enunciado.

## Estatísticas de recorrência temática

```bash
./revalida topic-recurrence
```

O comando gera `topic_recurrence.json`, `topic_recurrence.csv` e
`topic_recurrence.md` em `data/processed/reports/`. Os relatórios mostram
contagem, percentual, cobertura entre edições, primeira e última ocorrência e
tendência recente para áreas, subáreas, temas, conceitos e diagnósticos.

## Comando único para uma prova inédita completa

Informe um PDF de atualizações médicas revisadas ou uma pasta com arquivos
`.pdf`, `.md`, `.txt` ou `.json`. O arquivo existente no PortableSSD pode ser
validado diretamente:

```bash
./revalida generate-full-exam \
  --updates-dir "/Volumes/PortableSSD/MATERIAIS SANGUE NOS OLHOS/ATUALIZAÇÕES 2025-2026.pdf" \
  --output-name simulado_001 \
  --validate-only
```

Essa validação não inicia o modelo local e não acessa a OpenAI. Para começar a
geração, a revisão e a montagem dos PDFs, retire `--validate-only`:

```bash
./revalida generate-full-exam \
  --updates-dir "/Volumes/PortableSSD/MATERIAIS SANGUE NOS OLHOS/ATUALIZAÇÕES 2025-2026.pdf" \
  --output-name simulado_001
```

O comando usa o Ollama local, gera as questões, realiza revisão médica e
pedagógica independentes e monta `prova.pdf`, `gabarito.pdf` e
`correcao_comentada.pdf`. Os checkpoints permitem retomar uma interrupção.

Filtros opcionais:

```bash
./revalida generate-full-exam \
  --updates-dir atualizacoes/2026 \
  --output-name cardiologia_corte \
  --count 20 \
  --theme cardiologia \
  --level corte
```

Níveis aceitos: `fácil`, `corte`, `moderada` e `difícil`. Eles correspondem a
alvos editoriais Rasch, não a parâmetros empíricos.

## Coleta de respostas e calibração Rasch

Crie o modelo CSV para a prova revisada:

```bash
./revalida response-template \
  data/exports/generated/revalida_enamed_2026_2/simulado_001/reviewed_exam.json \
  --output respostas_simulado_001.csv
```

Após preencher uma linha por candidato e questão, calcule dificuldade `b`,
infit, outfit, correlação ponto-bisserial e informação no corte:

```bash
./revalida calibrate-rasch \
  data/exports/generated/revalida_enamed_2026_2/simulado_001/reviewed_exam.json \
  respostas_simulado_001.csv \
  --output calibracao_simulado_001.json
```

Somente primeiras exposições completas entram na calibração. De 200 a 499
candidatos o resultado é provisório; com 500 ou mais pode ser marcado como
calibrado. Itens com ajuste ou discriminação inadequados são encaminhados para
revisão.

## Nova edição manual

Para adicionar uma edição, inclua um novo `ExamConfig` no registro `EXAMS`.
Não reutilize automaticamente o parser de gabarito de 2026/1: cada edição deve
declarar seu próprio adapter depois que o PDF oficial for inspecionado. Os
artefatos congelados de edições anteriores não devem ser alterados.

O fluxo automático registra novas edições em `data/config/exams/` e usa o
adapter textual conservador. Se o layout do gabarito não produzir uma sequência
completa e inequívoca, ele solicita um adapter específico em vez de adivinhar.

## Fechamento, painel e importação consolidada

```bash
./revalida finalize-operation
```

O comando reconcilia os estados com os artefatos reais, gera o painel em
`data/processed/dashboard/painel_progresso.html` e prepara o pacote definitivo
em `data/exports/staziamed_import_ready/v1/`. Para atualizar somente o painel,
execute `./revalida progress-dashboard`.
