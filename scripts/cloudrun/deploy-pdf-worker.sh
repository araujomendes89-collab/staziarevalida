#!/usr/bin/env bash
# Publica o processamento de PDF da Central de Conteúdo no Google Cloud Run: uma TAREFA (Cloud Run Job) que esvazia a fila
# do Supabase e termina, e um AGENDADOR que a dispara a cada 10 minutos. Paga-se só o tempo em que a tarefa roda.
#
#   PROJECT=staziamed-revalida-prod scripts/cloudrun/deploy-pdf-worker.sh
#
# Opcionais: REGION (padrão southamerica-east1, São Paulo), SCHEDULE (padrão "*/10 * * * *").
# As três chaves (SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) saem do .env direto para o Secret Manager,
# sem aparecer na tela. A IA da Central continua desligada (nenhuma chave de IA de texto é enviada).
# Busca por significado (Gemini Embedding 2, autorizada pelo dono em 2026-10-06): com GEMINI_API_KEY (ou GOOGLE_GEMINI_API_KEY)
# no .env, a chave vai para o Secret Manager e a tarefa gera os vetores dos trechos das fontes. EMBEDDINGS=0 desliga.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT="${PROJECT:?defina PROJECT=<id do projeto no Google Cloud>}"
REGION="${REGION:-southamerica-east1}"
SCHEDULE="${SCHEDULE:-*/10 * * * *}"
JOB=stazia-pdf-worker
REPO=stazia
RUN_SA="stazia-pdf-worker@${PROJECT}.iam.gserviceaccount.com"
SCHED_SA="stazia-pdf-scheduler@${PROJECT}.iam.gserviceaccount.com"
# A montagem da imagem roda com uma conta só dela: a conta padrão do Compute Engine (a mesma das funções do Firebase) não
# ganha permissão nenhuma. A pasta temporária do envio fica na região e se apaga sozinha em 7 dias.
BUILD_SA="stazia-pdf-builder@${PROJECT}.iam.gserviceaccount.com"
BUCKET="${PROJECT}-stazia-build"
G=(gcloud --project="$PROJECT" --quiet)

echo "== 1/6 APIs do projeto $PROJECT"
"${G[@]}" services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com iam.googleapis.com

echo "== 2/6 contas de serviço (a da tarefa só lê os segredos; a do agendador só dispara a tarefa; a da montagem só monta a imagem)"
"${G[@]}" iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-pdf-worker --display-name="Stazia: processamento de PDF"
"${G[@]}" iam service-accounts describe "$SCHED_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-pdf-scheduler --display-name="Stazia: agendador do processamento de PDF"
"${G[@]}" iam service-accounts describe "$BUILD_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-pdf-builder --display-name="Stazia: montagem da imagem do processamento"

echo "== 3/6 segredos (do .env para o Secret Manager, sem mostrar)"
envvalue() {
  python3 - "$1" <<'PY'
import re, sys
name = sys.argv[1]
for line in open(".env", encoding="utf-8"):
    m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line.rstrip("\n"))
    if m and m.group(1) == name:
        v = m.group(2).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        sys.stdout.write(v)
        break
PY
}

secret_name() { echo "stazia-$(echo "$1" | tr 'A-Z_' 'a-z-')"; }
# Grava um segredo do .env no Secret Manager (sem mostrar) e dá leitura à conta da tarefa.
store_secret() {
  local NAME="$1" VALUE="$2"
  local SECRET
  SECRET="$(secret_name "$NAME")"
  "${G[@]}" secrets describe "$SECRET" >/dev/null 2>&1 || "${G[@]}" secrets create "$SECRET" --replication-policy=automatic >/dev/null
  # versão nova só quando o valor mudou (comparado aqui, sem mostrar)
  if [ "$("${G[@]}" secrets versions access latest --secret="$SECRET" 2>/dev/null)" != "$VALUE" ]; then
    printf '%s' "$VALUE" | "${G[@]}" secrets versions add "$SECRET" --data-file=- >/dev/null
    echo "   $SECRET: atualizado"
  else
    echo "   $SECRET: sem mudança"
  fi
  "${G[@]}" secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null
}

for NAME in SUPABASE_URL VITE_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  VALUE="$(envvalue "$NAME")"
  [ -n "$VALUE" ] || { echo "Falta $NAME no .env"; exit 1; }
  store_secret "$NAME" "$VALUE"
done

# Chaves das IAs: opcionais, vão para a tarefa só as que estiverem no .env. Elas só são usadas quando a IA está ligada
# na Central de IAs (ligar e desligar continua sendo no painel). Uma chave tirada do .env sai da tarefa na próxima
# implantação, porque o --set-secrets substitui a lista inteira.
AI_SECRETS=""
for NAME in ANTHROPIC_API_KEY GEMINI_API_KEY OPENAI_API_KEY; do
  VALUE="$(envvalue "$NAME")"
  if [ -z "$VALUE" ]; then
    echo "   $NAME: ausente no .env (a tarefa fica sem essa IA)"
  else
    store_secret "$NAME" "$VALUE"
    AI_SECRETS="$AI_SECRETS,$NAME=$(secret_name "$NAME"):latest"
  fi
done

# busca por significado: usa a mesma chave do Gemini das IAs (acima); sem ela, a tarefa segue só com palavras
EMB_ENV=""
if [ "${EMBEDDINGS:-1}" = "1" ] && [[ "$AI_SECRETS" == *",GEMINI_API_KEY="* ]]; then
  EMB_ENV=",CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1"
  echo "   busca por significado: ligada na tarefa"
else
  echo "   busca por significado: sem GEMINI_API_KEY no .env; a tarefa segue só com palavras"
fi

echo "== 4/6 imagem (montada no Cloud Build, não no Mac)"
"${G[@]}" artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  "${G[@]}" artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Imagens da StaziaMed"
if ! "${G[@]}" storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  "${G[@]}" storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
  LIFE="$(mktemp)"
  printf '%s' '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7}}]}' > "$LIFE"
  "${G[@]}" storage buckets update "gs://$BUCKET" --lifecycle-file="$LIFE" >/dev/null
  rm -f "$LIFE"
fi
# permissões mínimas da montagem: ler o envio, gravar a imagem no repositório e escrever o registro da montagem
"${G[@]}" storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer >/dev/null
"${G[@]}" artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer >/dev/null
"${G[@]}" projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter --condition=None >/dev/null
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/pdf-worker:$(git rev-parse --short HEAD)"
"${G[@]}" builds submit --region="$REGION" --config=cloudrun/pdf-worker/cloudbuild.yaml --substitutions=_IMAGE="$IMAGE" \
  --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA" --gcs-source-staging-dir="gs://$BUCKET/source" .

echo "== 5/6 tarefa no Cloud Run ($JOB)"
"${G[@]}" run jobs deploy "$JOB" --region="$REGION" --image="$IMAGE" --service-account="$RUN_SA" \
  --tasks=1 --max-retries=0 --task-timeout=3600 --cpu=2 --memory=4Gi \
  --set-env-vars="NODE_ENV=production,CONTENT_HUB_JOB_BUDGET_MIN=50,CONTENT_HUB_STALE_SECONDS=1800${EMB_ENV}" \
  --set-secrets="SUPABASE_URL=stazia-supabase-url:latest,VITE_SUPABASE_ANON_KEY=stazia-vite-supabase-anon-key:latest,SUPABASE_SERVICE_ROLE_KEY=stazia-supabase-service-role-key:latest${AI_SECRETS}"
"${G[@]}" run jobs add-iam-policy-binding "$JOB" --region="$REGION" --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker >/dev/null

echo "== 6/6 agendador ($SCHEDULE, horário de Brasília)"
URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run"
if "${G[@]}" scheduler jobs describe "$JOB-agenda" --location="$REGION" >/dev/null 2>&1; then
  "${G[@]}" scheduler jobs update http "$JOB-agenda" --location="$REGION" --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" \
    --uri="$URI" --http-method=POST --oauth-service-account-email="$SCHED_SA"
else
  "${G[@]}" scheduler jobs create http "$JOB-agenda" --location="$REGION" --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" \
    --uri="$URI" --http-method=POST --oauth-service-account-email="$SCHED_SA"
fi

echo
echo "Pronto. Para rodar uma vez agora e ver o resultado:"
echo "  gcloud run jobs execute $JOB --region=$REGION --project=$PROJECT --wait"
