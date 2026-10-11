# Processamento de PDF da Central de Conteúdo no Google Cloud Run

Escrito para: o dono do produto (decisão e custo) e quem for manter.

## Por que fora da Vercel
O extrator (`scripts/content-hub/extract_pdf.py`) precisa de Python com PyMuPDF e do Tesseract (OCR em português, espanhol e inglês),
e o gerador dos PDFs finais precisa de um navegador (Chromium/Playwright). Uma página pode levar minutos. As funções da Vercel não têm
nada disso. A fila já é durável no Supabase (`ch_jobs`, `ch_worker_claim`): qualquer máquina com a chave de serviço pode processá-la.

## Como fica
- **Envio**: o aluno/equipe envia o PDF pelo site (Vercel); o arquivo vai para o Storage do Supabase e o trabalho entra na fila.
- **Processamento**: uma *tarefa* do Cloud Run (`stazia-pdf-worker`, imagem `cloudrun/pdf-worker/Dockerfile`) esvazia a fila, confere as
  fontes oficiais vencidas e termina. Entrada: `scripts/content-hub/worker-job.ts`.
- **Disparo**: o Cloud Scheduler roda a tarefa a cada 10 minutos. Fila vazia: ela sai em segundos.
- **Recuperação**: trabalho sem sinal por 30 min (`CONTENT_HUB_STALE_SECONDS`) volta para a fila; cada faixa de páginas tem 20 min.
  A tarefa tem 60 min e para de pegar trabalho novo aos 50.
- **Chaves**: só `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, no Secret Manager. A IA da Central continua
  desligada até o dono autorizar provedor e gasto.

## Publicar ou atualizar
```
gcloud auth login <conta com o projeto>
PROJECT=<id do projeto> scripts/cloudrun/deploy-pdf-worker.sh
gcloud run jobs execute stazia-pdf-worker --region=southamerica-east1 --project=<id> --wait
```
O projeto precisa de cobrança ativa (exigência do Cloud Run). A imagem é montada no Cloud Build, não no Mac.

## Custo (estimativa)
2 vCPU e 4 GiB só enquanto a tarefa roda. Com a fila vazia, cada disparo dura segundos: a cada 10 min dá alguns dólares por mês;
o resto é proporcional ao tempo de processamento real. Conferir na página de preços do Cloud Run (região São Paulo) antes de lançar.

## Com o Cloud Run no ar
Desligar o processamento no servidor local (`CONTENT_HUB_WORKER=0` no `.env` do Mac) para uma fila ter um só dono no dia a dia
(os dois juntos não estragam nada: a fila não entrega o mesmo trabalho a dois ao mesmo tempo).

## Relato do processamento no painel (2026-10-06)

O servidor do site (Vercel) não lê PDF, não faz OCR nem gera os arquivos finais; quem faz isso é esta tarefa. Por isso o painel da Central (Administração › Central de Conteúdo) não testa o próprio servidor: a cada execução a tarefa grava em `ch_worker_heartbeats` (função `ch_worker_report`, só com a chave de serviço) o que tem pronto (gerador de PDF, Python com PyMuPDF, idiomas do OCR, logo, fonte, IA) e o painel mostra esse relato (`ch_worker_last_report`):

- sem relato: "O processamento da Central … ainda não rodou: ele roda como tarefa no Google Cloud Run, que ainda não foi implantada";
- relato com mais de 30 minutos (o agendador roda a cada 10): "não roda desde …";
- relato recente: só as pendências reais do processamento.

A fonte do Design System (Plus Jakarta Sans, licença SIL OFL, 6 pesos em `server/contentHub/fonts`) vai dentro da imagem; `CONTENT_HUB_FONT_DIR` só é preciso para trocar a pasta. O logo já era copiado.

## Correção da imagem antes da primeira implantação (2026-10-06)

Uma simulação local da montagem, só com os arquivos que vão para o Cloud Build, mostrou dois problemas. Eles fariam a imagem não
montar e, depois de corrigida a montagem, fariam a tarefa cair logo ao iniciar:

1. **O pacote do processamento usa mais que `server/` e `scripts/content-hub/`.** Pelo caminho das importações entram `src/`
   (tipos, normalização de questões e a carga do banco de desenvolvimento) e `scripts/supabase/`. O `.gcloudignore` excluía `src` e
   a regra `supabase` (sem a barra inicial) excluía também `scripts/supabase`. Agora as regras valem só para a raiz, e a imagem copia
   `server`, `scripts` e `src` na etapa de montagem.
2. **Bibliotecas do processamento que no site são de desenvolvimento** (Playwright, que gera os PDFs finais, e PGlite) ficavam
   de fora com `npm ci --omit=dev`. Agora a montagem gera a lista mínima de bibliotecas do pacote (`scripts/cloudrun/worker-deps.mjs`,
   a partir do relatório do esbuild e nas versões do `package-lock`). A imagem final instala só essa lista: 6 bibliotecas, cerca de
   100 MB, sem Vite, React nem ferramentas de teste.

O que foi conferido no Mac:
- **Envio:** 707 arquivos (13 MB), nenhum `.env`, e de `public/` só o logo (`gcloud meta list-files-for-upload`).
- **Montagem:** o pacote monta só com esses arquivos.
- **Inicialização:** com só as 6 bibliotecas instaladas, a tarefa inicia e para no aviso de banco não configurado, o esperado sem as
  chaves.

## Implantado em 2026-10-06 (projeto `staziamed-revalida-prod`, escolhido pelo dono)

O projeto foi escolhido por ser o único da conta com cobrança ativa. Ele também é o projeto do Firebase do app antigo, por isso
nada do Firebase foi tocado. Tudo o que foi criado tem nome `stazia-*`:
- **Contas de serviço:** `stazia-pdf-worker` (a tarefa: só lê os três segredos), `stazia-pdf-scheduler` (só dispara a tarefa) e
  `stazia-pdf-builder` (só monta a imagem).
- **Onde a montagem pode mexer:** só a pasta temporária `gs://staziamed-revalida-prod-stazia-build`, que apaga o envio em 7 dias,
  o repositório `stazia` e o registro da montagem.
- **Conta padrão do Compute Engine:** é a mesma das funções do Firebase e não ganhou nenhuma permissão.
- **Segredos:** 3, todos no Secret Manager.
- **Repositório de imagens:** Artifact Registry `stazia`, em São Paulo.
- **Tarefa:** `stazia-pdf-worker`, com 2 vCPU e 4 GiB.
- **Agendador:** `stazia-pdf-worker-agenda`, a cada 10 minutos.

Duas correções no caminho:
- **Máquina do Cloud Build:** `E2_HIGHCPU_4` não existe (o gcloud responde ".options.machineType: unused"). Agora a montagem usa
  a máquina padrão.
- **Conta da montagem:** a montagem rodava com a conta padrão do Compute Engine, sem permissão. Agora roda com a própria conta.

Primeira execução (2026-10-06 22h35):
- Banco Supabase, gerador de PDF, PyMuPDF e OCR prontos.
- Fila vazia.
- Única pendência: a IA do processamento, desligada até o dono autorizar provedor e gasto.

## Publicar a reconferência automática e a chave da OpenAI (CC01 e CC32, ramo adm-conteudo)

Esta parte só descreve o passo a passo para o dono; nada foi executado. A ordem importa:

1. **SQL primeiro.** No Supabase, colar `supabase/migrations/20261003009540_reconferir_insuficientes.sql`, depois de tudo que já está
   publicado (a última é a 8300). Pode ser colada duas vezes sem erro. O código novo funciona sem ela (a etapa só anota "falta aplicar
   a migração 9540" no registro do trabalho), mas as funções novas só existem depois dela. O código antigo continua funcionando com
   ela colada.
2. **Imagem nova do Cloud Run, só pelo caminho curto (montar a imagem e trocar só a imagem da tarefa):**
   - montar: `gcloud --project=staziamed-revalida-prod builds submit --region=southamerica-east1 --config=cloudrun/pdf-worker/cloudbuild.yaml --substitutions=_IMAGE=southamerica-east1-docker.pkg.dev/staziamed-revalida-prod/stazia/pdf-worker:<commit curto> --service-account=projects/staziamed-revalida-prod/serviceAccounts/stazia-pdf-builder@staziamed-revalida-prod.iam.gserviceaccount.com --gcs-source-staging-dir=gs://staziamed-revalida-prod-stazia-build/source .`
   - trocar: `gcloud --project=staziamed-revalida-prod run jobs update stazia-pdf-worker --region=southamerica-east1 --image=<a mesma imagem>`
   - **Nunca** rodar `scripts/cloudrun/deploy-pdf-worker.sh` para isso: ele usa `run jobs deploy` com `--set-env-vars` e `--set-secrets`, que
     trocam a lista inteira de variáveis e segredos da tarefa (e podem derrubar a busca por significado pelo Vertex e a chave da OpenAI
     que já estão ligadas). Com `jobs update --image`, as variáveis e os segredos ficam como estão.
3. **Chave da OpenAI, uma vez só:** no Terminal, `bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/scripts/cloudrun/gravar-chave-openai.sh"`.
   Ele lê a chave do `.env` sem mostrá-la, grava no Secret Manager (`stazia-openai-api-key`) e liga o segredo à tarefa com
   `--update-secrets` (só a `OPENAI_API_KEY` muda). Vale a partir da próxima execução (a cada 10 minutos). Pode ser repetido sem dano.
   Precisa do `gcloud` com login feito. Não copie o script para outra pasta.

Depois de publicar, conferir numa fonte de teste: o registro da etapa "ler a fonte" mostra `vectors` (vetores feitos na própria
leitura) e, se algo faltou, `vectors_error` ou `vectors_pending`; a reconferência entra na fila logo depois (`recheck_documents`).
Esses avisos ficam só no registro do trabalho (a tela "Etapas do processamento" ainda não os mostra).

Como a reconferência usa os vetores: a etapa de leitura da fonte gera os vetores dos trechos da fonte nova (até 8 minutos por etapa,
no máximo 5.000 trechos; `CONTENT_HUB_SOURCE_EMBED_SECONDS` muda o tempo) antes de pôr a reconferência na fila. Se o Google estiver
parado ou sem crédito, a leitura da fonte não falha: a reconferência desta fonte segue só por palavras e o aviso fica no registro.
Os vetores que faltaram saem no fim da rodada, mas **a reconferência não se repete sozinha depois disso**; nesse caso, usar
"Reprocessar" na conferência do material.
