# Manual de uso pelo Terminal

## Revalida Reverse Engine

Este manual explica como importar, verificar, processar e exportar provas do
Revalida e do Enamed usando o Terminal do macOS. O sistema preserva os PDFs
originais e grava um checkpoint depois de cada questão.

## 1. Verificações iniciais

Confirme que o PortableSSD está conectado e que o projeto existe em:

```text
/Volumes/PortableSSD/Projetos/revalida-reverse-engine
```

A pasta de entrada de cada edição deve conter somente dois PDFs: a prova e o
gabarito oficial.

Para processamento local, confira o Ollama e os modelos:

```bash
ollama list
```

Devem aparecer:

- `qwen3:8b`, usado nas questões textuais;
- `qwen3-vl:8b-instruct`, usado nas questões com imagens.

Se o Ollama não estiver ativo:

```bash
brew services start ollama
```

## 2. Entrar no projeto

Abra o Terminal e execute:

```bash
cd "/Volumes/PortableSSD/Projetos/revalida-reverse-engine"
```

Confira o programa:

```bash
./revalida --help
```

Todos os comandos seguintes devem ser executados dentro dessa pasta.

## 3. Listar as edições cadastradas

```bash
./revalida exams
```

O campo `exam_id` é o identificador utilizado nos comandos. Exemplos:

- `revalida_2026_1`
- `revalida_2025_2`
- `enamed_2025`

## 4. Preparar uma prova e seu gabarito

Organize a entrada assim:

```text
Pasta da edição/
├── prova.pdf
└── gabarito.pdf
```

Para preparar o Enamed 2025:

```bash
./revalida prepare-folder "/Volumes/PortableSSD/Provas revalida/Enamed"
```

Essa etapa identifica os PDFs, detecta as questões, confere a numeração, lê o
gabarito, diferencia anulações de exclusões estatísticas, extrai imagens e cria
o master normalizado. Ela é local e não acessa a OpenAI.

Não use `--force` normalmente. Essa opção substitui arquivos já cadastrados e
deve ser usada somente após conferir que os novos PDFs pertencem à mesma edição:

```bash
./revalida prepare-folder "/caminho/da/pasta" --force
```

## 5. Validar uma edição sem gastar créditos

Enamed 2025:

```bash
./revalida validate-exam enamed_2025
```

Revalida 2026/1:

```bash
./revalida validate-exam revalida_2026_1
```

A validação confere master, taxonomias, gabarito e imagens. Nenhuma API é
acessada.

## 6. Processar tudo somente com modelos locais

Este é o modo recomendado para começar:

```bash
caffeinate -i ./revalida automate "/Volumes/PortableSSD/Provas revalida/Enamed" \
  --backend local \
  --local-model qwen3:8b \
  --local-vision-model qwen3-vl:8b-instruct \
  --max-openai-reviews 0
```

O `caffeinate -i` evita que o Mac entre em repouso durante a execução.

O fluxo completo realiza:

1. Importação e validação.
2. Primeiro passe independente.
3. Segundo passe independente.
4. Comparação dos passes.
5. Adjudicação automática das divergências.
6. Construção do DNA canônico.
7. Auditoria final.
8. Exportação para o StaziaMed.

O Terminal mostra cada questão concluída e o total salvo no checkpoint.

## 7. Usar o modo híbrido

O modo híbrido classifica localmente e envia exceções para a Luna. Pode consumir
créditos da OpenAI e, por isso, exige autorização explícita.

Exemplo com limite de 20 revisões pagas por passe:

```bash
caffeinate -i ./revalida automate "/Volumes/PortableSSD/Provas revalida/Enamed" \
  --backend hybrid \
  --local-model qwen3:8b \
  --local-vision-model qwen3-vl:8b-instruct \
  --review-model gpt-5.6-luna \
  --max-openai-reviews 20 \
  --allow-openai
```

Sem `--allow-openai`, o sistema não inicia chamadas pagas.

## 8. Usar somente a OpenAI

Use apenas quando desejar classificação integral pela API e houver saldo:

```bash
caffeinate -i ./revalida automate "/caminho/da/pasta" \
  --backend openai \
  --allow-openai
```

Esse é o modo com maior custo. Para uso comum, prefira local ou híbrido.

## 9. Interromper e continuar depois

Para interromper uma execução em primeiro plano, pressione `Control + C`.

As questões concluídas permanecem salvas. Para continuar, execute novamente o
mesmo comando. O sistema carrega o checkpoint e pula os registros existentes.

Não inicie duas execuções simultâneas da mesma edição.

## 10. Acompanhar o andamento

Durante a execução aparecem mensagens semelhantes a:

```text
Classificando Q013...
CHECKPOINT: 8/90
```

O estado geral fica em:

```text
data/runs/<exam_id>_pipeline.json
```

Para abrir o estado do Enamed:

```bash
open data/runs/enamed_2025_pipeline.json
```

Para contar as questões concluídas no primeiro passe do Enamed:

```bash
python3 -c 'import json; p="data/processed/dna/production/enamed_2025_dna_v2_pass1_final.json"; print(len(json.load(open(p))["questions"]))'
```

Os dois passes ficam em:

```text
data/processed/dna/production/<exam_id>_dna_v2_pass1_final.json
data/processed/dna/production/<exam_id>_dna_v2_pass2_final.json
```

## 11. Localização dos resultados

Master normalizado:

```text
data/processed/<exam_id>_master_v1_0.json
```

Imagens extraídas:

```text
data/processed/visual_assets_v2/<exam_id>/
```

Classificações, comparações e DNA canônico:

```text
data/processed/dna/production/
```

Estado das execuções:

```text
data/runs/
```

Pacote para o StaziaMed:

```text
data/exports/staziamed/<exam_id>/
```

## 12. Exportar novamente para o StaziaMed

Depois da conclusão do DNA canônico:

```bash
./revalida export-staziamed enamed_2025
```

O pacote mantém separadas as questões ativas, anuladas, excluídas
estatisticamente, classificações e imagens.

Se aparecer `DNA canônico não encontrado`, os dois passes e a adjudicação ainda
não terminaram.

## 13. Gerar questões inéditas

A geração legada utiliza a OpenAI e exige autorização explícita. A fonte pode
ser um PDF ou uma pasta com arquivos `.pdf`, `.md`, `.txt` ou `.json`.

Exemplo para gerar 20 rascunhos:

```bash
./revalida generate-questions enamed_2025 \
  --count 20 \
  --updates-dir "/Volumes/PortableSSD/MATERIAIS SANGUE NOS OLHOS/Atualizacoes" \
  --allow-openai
```

As questões geradas são rascunhos e precisam de revisão médica antes do uso
educacional.

## 14. Comandos de manutenção

Reconstruir o master:

```bash
./revalida build-master enamed_2025
```

Executar novamente a adjudicação automática:

```bash
./revalida auto-adjudicate enamed_2025
```

Consultar todos os comandos:

```bash
./revalida --help
```

Consultar as opções de uma operação:

```bash
./revalida automate --help
```

## 15. Solução de problemas

### Ollama não está acessível

```bash
brew services start ollama
ollama list
```

Depois, repita o comando que foi interrompido.

### Modelo local não instalado

```bash
ollama pull qwen3:8b
ollama pull qwen3-vl:8b-instruct
```

Os modelos estão configurados para armazenamento no PortableSSD.

### Outra execução já está usando este checkpoint

Já existe uma classificação da mesma edição em andamento. Aguarde a execução
atual ou interrompa o Terminal correspondente.

### A pasta deve conter exatamente dois PDFs

Deixe na pasta somente a prova e o gabarito. Remova PDFs adicionais.

### Não foi possível identificar a prova ou o gabarito

Use nomes claros, por exemplo:

```text
enamed_2025_prova.pdf
enamed_2025_gabarito.pdf
```

### PDF ou imagem não encontrado

Confira se o PortableSSD continua conectado no mesmo caminho. Não desconecte o
disco durante o processamento.

### O Mac reiniciou ou o Terminal foi fechado

Conecte o PortableSSD, entre no projeto e repita o mesmo comando. O checkpoint
será carregado automaticamente.

## 16. Rotina recomendada para cada edição

1. Criar uma pasta contendo somente prova e gabarito.
2. Entrar no projeto pelo Terminal.
3. Executar `prepare-folder`.
4. Anotar o `exam_id` informado.
5. Executar `validate-exam`.
6. Executar `automate` em modo local.
7. Aguardar os dois passes.
8. Conferir divergências e auditoria.
9. Abrir o pacote do StaziaMed.
10. Usar o modo híbrido apenas quando desejar revisão adicional.

## Comando recomendado para o Enamed 2025

```bash
cd "/Volumes/PortableSSD/Projetos/revalida-reverse-engine"

caffeinate -i ./revalida automate "/Volumes/PortableSSD/Provas revalida/Enamed" \
  --backend local \
  --local-model qwen3:8b \
  --local-vision-model qwen3-vl:8b-instruct \
  --max-openai-reviews 0
```

Esse comando processa ou retoma toda a edição sem usar créditos da OpenAI.
## 17. Recursos avançados

## Encontrar questões gêmeas

```bash
./revalida find-twins --theme cardiologia --limit 50
```

O comando é inteiramente local e compara apenas edições diferentes.
Ele separa repetição quase literal, caso clínico semelhante e gêmea temática.

## Estatísticas de recorrência

```bash
./revalida topic-recurrence
```

As saídas JSON, CSV e Markdown ficam em `data/processed/reports/` e apresentam
contagem, percentual, cobertura por edição, primeira e última ocorrência e
tendência recente por área, subárea, tema, conceito-chave e diagnóstico.

## Gerar uma prova completa

Antes de iniciar uma geração longa, valide o plano, os filtros e as fontes sem
carregar o modelo:

```bash
./revalida generate-full-exam \
  --updates-dir "/Volumes/PortableSSD/MATERIAIS SANGUE NOS OLHOS/ATUALIZAÇÕES 2025-2026.pdf" \
  --output-name simulado_001 \
  --validate-only
```

Para gerar, revisar e montar os três PDFs com o modelo local:

```bash
./revalida generate-full-exam \
  --updates-dir "/Volumes/PortableSSD/MATERIAIS SANGUE NOS OLHOS/ATUALIZAÇÕES 2025-2026.pdf" \
  --output-name simulado_001
```

Saída:

```text
data/exports/generated/revalida_enamed_2026_2/simulado_001/
├── generated_exam.json
├── reviewed_exam.json
├── prova.pdf
├── gabarito.pdf
├── correcao_comentada.pdf
└── manifest.json
```

Para gerar por tema e nível:

```bash
./revalida generate-full-exam \
  --updates-dir "/Volumes/PortableSSD/MATERIAIS SANGUE NOS OLHOS/ATUALIZAÇÕES 2025-2026.pdf" \
  --output-name pediatria_dificil \
  --count 20 \
  --theme pediatria \
  --level difícil
```

## Coletar respostas e calibrar

```bash
./revalida response-template \
  data/exports/generated/revalida_enamed_2026_2/simulado_001/reviewed_exam.json \
  --output respostas_simulado_001.csv
```

Preencha `candidate_id`, `response`, `response_time_seconds`, `confidence` de 1
a 5 e `exposure_count`. Depois execute:

```bash
./revalida calibrate-rasch \
  data/exports/generated/revalida_enamed_2026_2/simulado_001/reviewed_exam.json \
  respostas_simulado_001.csv \
  --output calibracao_simulado_001.json
```

As provas históricas nunca recebem parâmetros TRI. Elas servem somente para
recorrência e engenharia reversa. Os itens inéditos recebem primeiro um alvo
editorial e só ganham `b` empírico após respostas reais suficientes.

## 18. Fechamento operacional e importação no StaziaMed

Para conferir todas as edições, corrigir estados antigos, atualizar o painel e
montar o pacote consolidado de importação, execute:

```bash
cd "/Volumes/PortableSSD/Projetos/revalida-reverse-engine"
./revalida finalize-operation
```

Esse comando não reclassifica questões e não chama a OpenAI. Ele valida os
artefatos já existentes antes de marcar uma edição como concluída.

O painel fica em:

```text
data/processed/dashboard/painel_progresso.html
data/processed/dashboard/painel_progresso.json
```

Para abrir o painel no macOS:

```bash
open data/processed/dashboard/painel_progresso.html
```

Para apenas atualizar o painel, sem remontar o pacote de importação:

```bash
./revalida progress-dashboard
```

O pacote definitivo do StaziaMed fica em:

```text
data/exports/staziamed_import_ready/v1/
├── questions_active.jsonl
├── questions_all.jsonl
├── editions.json
├── assets/
└── manifest.json
```

Use `questions_active.jsonl` para importar somente questões válidas. O arquivo
`questions_all.jsonl` também inclui questões anuladas e excluídas
estatisticamente, preservadas para auditoria. O `manifest.json` contém as
contagens e os hashes que permitem verificar a integridade da importação.

## 19. Rotina final recomendada

1. Conecte o PortableSSD.
2. Entre na pasta do projeto.
3. Execute `./revalida finalize-operation`.
4. Abra `data/processed/dashboard/painel_progresso.html`.
5. Confirme que todas as edições mostram `PIPELINE_COMPLETED` e 100%.
6. Importe `data/exports/staziamed_import_ready/v1/questions_active.jsonl` no
   StaziaMed.
7. Preserve `manifest.json` junto da importação para controle de versão e
   integridade.
