#!/usr/bin/env bash
# Publica a PONTE DE VOZ do Tutor no Google Cloud Run (serviço "stazia-voz-ponte"): navegador ⇄ Gemini Live no Vertex AI.
# Mesmo padrão de scripts/cloudrun/deploy-radar-vigia.sh. NÃO RODE sem o dono mandar ligar (o orquestrador faz junto com ele).
#
#   PROJECT=staziamed-revalida-prod scripts/cloudrun/deploy-voz-ponte.sh
#
# O que faz: (1) liga as APIs; (2) cria a conta de serviço da ponte, só com permissão de usar o Vertex AI; (3) cria o segredo
# VOZ_PONTE_SEGREDO no Secret Manager (aleatório, só se ainda não existir; não aparece na tela); (4) monta a imagem no Cloud Build;
# (5) publica o serviço (aberto à internet porque o navegador precisa chegar nele; quem entra sem bilhete selado é recusado).
# Depois: na Vercel, VOZ_PONTE_URL=wss://<endereço>/ponte e VOZ_PONTE_SEGREDO (o MESMO do Secret Manager; o script copia para a
# área de transferência do Mac se você pedir COPIAR=1), além das travas TUTOR_VOICE_ALLOW_EXTERNAL=1 e TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1.
#
# Opcionais: REGION (padrão us-central1, a mesma região do Gemini Live no Vertex), ORIGENS (padrão o site do app),
#            MIN_INSTANCES (padrão 0; 1 evita a partida a frio de ~1-3 s na primeira ligação, com custo fixo), COPIAR=1.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT="${PROJECT:?defina PROJECT=staziamed-revalida-prod}"
REGION="${REGION:-us-central1}"
SERVICE=stazia-voz-ponte
REPO=stazia
RUN_SA="stazia-voz-ponte@${PROJECT}.iam.gserviceaccount.com"
BUILD_SA="stazia-pdf-builder@${PROJECT}.iam.gserviceaccount.com"   # a mesma conta de montagem dos outros serviços (só monta imagens)
BUCKET="${PROJECT}-stazia-build"
SECRET=stazia-voz-ponte-segredo
ORIGENS="${ORIGENS:-https://app.staziamed.com.br,https://staziamed-revalida.vercel.app}"
APP_RELATORIO="${APP_RELATORIO:-https://app.staziamed.com.br/api/tutor/voice/ponte-uso}"
G=(gcloud --project="$PROJECT" --quiet)

echo "== 1/5 APIs do projeto $PROJECT"
"${G[@]}" services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com aiplatform.googleapis.com

echo "== 2/5 conta de serviço da ponte (só usa o Vertex AI)"
"${G[@]}" iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create "$SERVICE" --display-name="Stazia: ponte de voz (Gemini Live no Vertex)"
"${G[@]}" projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUN_SA" --role=roles/aiplatform.user --condition=None >/dev/null
"${G[@]}" iam service-accounts describe "$BUILD_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-pdf-builder --display-name="Stazia: montagem de imagens"

echo "== 3/5 segredo da ponte (Secret Manager; o valor não aparece)"
if ! "${G[@]}" secrets describe "$SECRET" >/dev/null 2>&1; then
  "${G[@]}" secrets create "$SECRET" --replication-policy=automatic >/dev/null
  openssl rand -hex 32 | tr -d '\n' | "${G[@]}" secrets versions add "$SECRET" --data-file=- >/dev/null
  echo "   $SECRET: criado"
else
  echo "   $SECRET: já existe (mantido)"
fi
"${G[@]}" secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null

echo "== 4/5 imagem (Cloud Build)"
"${G[@]}" artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  "${G[@]}" artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Imagens da StaziaMed"
if ! "${G[@]}" storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  "${G[@]}" storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
"${G[@]}" storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer >/dev/null
"${G[@]}" artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer >/dev/null
"${G[@]}" projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter --condition=None >/dev/null
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/voz-ponte:$(git rev-parse --short HEAD)"
"${G[@]}" builds submit --region="$REGION" --config=cloudrun/voz-ponte/cloudbuild.yaml --substitutions=_IMAGE="$IMAGE" \
  --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA" --gcs-source-staging-dir="gs://$BUCKET/source" .

echo "== 5/5 serviço no Cloud Run ($SERVICE, $REGION)"
# WebSocket: tempo máximo de requisição 60 min (a ponte corta antes, no limite do bilhete); afinidade de sessão; 1 CPU / 512 MB
"${G[@]}" run deploy "$SERVICE" --region="$REGION" --image="$IMAGE" --service-account="$RUN_SA" \
  --allow-unauthenticated --timeout=3600 --session-affinity --concurrency=60 --cpu=1 --memory=512Mi \
  --min-instances="${MIN_INSTANCES:-0}" --max-instances=10 \
  --set-env-vars="^@^NODE_ENV=production@VOZ_PONTE_PROJETO=$PROJECT@VOZ_PONTE_REGIAO=us-central1@VOZ_PONTE_ORIGENS=$ORIGENS@VOZ_PONTE_RELATORIO_URL=$APP_RELATORIO" \
  --set-secrets="VOZ_PONTE_SEGREDO=$SECRET:latest"

URL="$("${G[@]}" run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo
echo "Pronto. Saúde: curl $URL/saude"
echo "Na Vercel (Production): VOZ_PONTE_URL=${URL/https:/wss:}/ponte"
echo "                        VOZ_PONTE_SEGREDO=<o mesmo do segredo $SECRET>"
if [ "${COPIAR:-0}" = "1" ]; then
  "${G[@]}" secrets versions access latest --secret="$SECRET" | pbcopy
  echo "   (o valor de VOZ_PONTE_SEGREDO foi copiado para a área de transferência; cole direto no painel da Vercel)"
fi
echo "Logs: gcloud run services logs read $SERVICE --region=$REGION --project=$PROJECT --limit=50"
