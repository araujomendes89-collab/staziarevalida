#!/usr/bin/env bash
# Publica o VIGIA do Radar de Evidências no Google Cloud Run: uma TAREFA (Cloud Run Job, Node puro) e um AGENDADOR (Cloud Scheduler)
# que a dispara. A vigia é a cada 3 DIAS: o agendador dispara todo dia às 06h (Brasília) e a tarefa pula sozinha se a última rodada
# terminou há menos de 70 h (tabela radar_rodadas). Mesmo padrão de scripts/cloudrun/deploy-pdf-worker.sh.
#
#   PROJECT=staziamed-revalida-prod scripts/cloudrun/deploy-radar-vigia.sh
#
# ANTES: a migração 20261003010100_radar_evidencias.sql precisa estar aplicada no Supabase de produção.
# NÃO RODE sem o dono mandar ligar em produção. Nada aqui altera questão, aula, gabarito ou atualização: o vigia só avisa.
# Segredos (do .env para o Secret Manager, sem aparecer na tela): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e VERTEX_API_KEY (a mesma do site).
# Opcionais: REGION (padrão southamerica-east1), SCHEDULE (padrão "0 6 * * *"), RADAR_MODELO (padrão gemini-3.8-flash),
#            RADAR_TETO_USD (só pode diminuir o teto de US$ 5 por mês que está no código), RADAR_ENSAIO=1 (a tarefa lê tudo e NÃO grava nada).
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT="${PROJECT:?defina PROJECT=<id do projeto no Google Cloud>}"
REGION="${REGION:-southamerica-east1}"
SCHEDULE="${SCHEDULE:-0 6 * * *}"
JOB=stazia-radar-vigia
REPO=stazia
RUN_SA="stazia-radar-vigia@${PROJECT}.iam.gserviceaccount.com"
SCHED_SA="stazia-radar-scheduler@${PROJECT}.iam.gserviceaccount.com"
BUILD_SA="stazia-pdf-builder@${PROJECT}.iam.gserviceaccount.com"   # a mesma conta de montagem do pdf-worker (só monta imagens)
BUCKET="${PROJECT}-stazia-build"
G=(gcloud --project="$PROJECT" --quiet)

echo "== 1/5 APIs do projeto $PROJECT"
"${G[@]}" services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com iam.googleapis.com

echo "== 2/5 contas de serviço (a da tarefa só lê os 3 segredos; a do agendador só dispara a tarefa)"
"${G[@]}" iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-radar-vigia --display-name="Stazia: vigia do Radar de Evidencias"
"${G[@]}" iam service-accounts describe "$SCHED_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-radar-scheduler --display-name="Stazia: agendador do vigia do Radar"
"${G[@]}" iam service-accounts describe "$BUILD_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create stazia-pdf-builder --display-name="Stazia: montagem da imagem do processamento"

echo "== 3/5 segredos (do .env para o Secret Manager, sem mostrar)"
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
store_secret() {
  local NAME="$1" VALUE="$2" SECRET
  SECRET="$(secret_name "$NAME")"
  "${G[@]}" secrets describe "$SECRET" >/dev/null 2>&1 || "${G[@]}" secrets create "$SECRET" --replication-policy=automatic >/dev/null
  if [ "$("${G[@]}" secrets versions access latest --secret="$SECRET" 2>/dev/null)" != "$VALUE" ]; then
    printf '%s' "$VALUE" | "${G[@]}" secrets versions add "$SECRET" --data-file=- >/dev/null
    echo "   $SECRET: atualizado"
  else
    echo "   $SECRET: sem mudança"
  fi
  "${G[@]}" secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null
}
SECRETS=""
for NAME in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  VALUE="$(envvalue "$NAME")"
  [ -n "$VALUE" ] || { echo "Falta $NAME no .env"; exit 1; }
  store_secret "$NAME" "$VALUE"
  SECRETS="$SECRETS,$NAME=$(secret_name "$NAME"):latest"
done
VALUE="$(envvalue VERTEX_API_KEY)"
if [ -n "$VALUE" ]; then
  store_secret VERTEX_API_KEY "$VALUE"
  SECRETS="$SECRETS,VERTEX_API_KEY=$(secret_name VERTEX_API_KEY):latest"
else
  echo "   VERTEX_API_KEY ausente no .env: o vigia roda sem análise de IA (só registra as mudanças)"
fi
SECRETS="${SECRETS#,}"

echo "== 4/5 imagem (montada no Cloud Build) e tarefa no Cloud Run ($JOB)"
"${G[@]}" artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  "${G[@]}" artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Imagens da StaziaMed"
if ! "${G[@]}" storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  "${G[@]}" storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
"${G[@]}" storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer >/dev/null
"${G[@]}" artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer >/dev/null
"${G[@]}" projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter --condition=None >/dev/null
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/radar-vigia:$(git rev-parse --short HEAD)"
"${G[@]}" builds submit --region="$REGION" --config=cloudrun/radar-vigia/cloudbuild.yaml --substitutions=_IMAGE="$IMAGE" \
  --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA" --gcs-source-staging-dir="gs://$BUCKET/source" .
ENVVARS="NODE_ENV=production,RADAR_MODELO=${RADAR_MODELO:-gemini-3.8-flash},RADAR_PAUSA_MS=1500"
[ -n "${RADAR_TETO_USD:-}" ] && ENVVARS="$ENVVARS,RADAR_TETO_USD=$RADAR_TETO_USD"
[ "${RADAR_ENSAIO:-0}" = "1" ] && ENVVARS="$ENVVARS,RADAR_ENSAIO=1"
"${G[@]}" run jobs deploy "$JOB" --region="$REGION" --image="$IMAGE" --service-account="$RUN_SA" \
  --tasks=1 --max-retries=1 --task-timeout=1800 --cpu=1 --memory=512Mi \
  --set-env-vars="$ENVVARS" --set-secrets="$SECRETS"
"${G[@]}" run jobs add-iam-policy-binding "$JOB" --region="$REGION" --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker >/dev/null

echo "== 5/5 agendador ($SCHEDULE, horário de Brasília; a tarefa só trabalha a cada 3 dias)"
URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run"
if "${G[@]}" scheduler jobs describe "$JOB-agenda" --location="$REGION" >/dev/null 2>&1; then
  "${G[@]}" scheduler jobs update http "$JOB-agenda" --location="$REGION" --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" --uri="$URI" --http-method=POST --oauth-service-account-email="$SCHED_SA"
else
  "${G[@]}" scheduler jobs create http "$JOB-agenda" --location="$REGION" --schedule="$SCHEDULE" --time-zone="America/Sao_Paulo" --uri="$URI" --http-method=POST --oauth-service-account-email="$SCHED_SA"
fi

echo
echo "Pronto. Para rodar uma vez agora (ignora a regra dos 3 dias) e ver o resultado:"
echo "  gcloud run jobs execute $JOB --region=$REGION --project=$PROJECT --update-env-vars=RADAR_FORCAR=1 --wait"
echo "Na primeira rodada o vigia só grava a linha de base (nenhum evento). Para pausar: gcloud scheduler jobs pause $JOB-agenda --location=$REGION --project=$PROJECT"
