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
