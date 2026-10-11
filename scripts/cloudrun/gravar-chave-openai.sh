#!/bin/bash
# Grava a chave da OpenAI no processamento da Central de Conteúdo (tarefa stazia-pdf-worker no Google Cloud Run).
#
#   1. lê a linha OPENAI_API_KEY do .env da StaziaMed (a chave NÃO aparece na tela: só o tamanho é mostrado);
#   2. grava no Secret Manager do Google, no segredo stazia-openai-api-key (versão nova só se a chave mudou), e deixa a conta
#      do processamento ler esse segredo;
#   3. liga o segredo à tarefa com --update-secrets: só a OPENAI_API_KEY entra; as outras chaves da tarefa ficam como estão;
#   4. confere na tarefa que a OPENAI_API_KEY vem do segredo.
#
# Como rodar (no Terminal do Mac, com o gcloud já com login feito):
#   bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/scripts/cloudrun/gravar-chave-openai.sh"
#
# A chave vale a partir da próxima execução do processamento (o agendador roda a cada 10 minutos). Mesmas proteções de
# scripts/cloudrun/deploy-pdf-worker.sh e dos outros scripts de chave: a chave entra no Google pela entrada padrão (nunca na
# linha de comando) e o formato é conferido antes de mudar qualquer coisa.
set -euo pipefail

P=staziamed-revalida-prod
REGION=southamerica-east1
JOB=stazia-pdf-worker
SECRET=stazia-openai-api-key
SA="stazia-pdf-worker@${P}.iam.gserviceaccount.com"
# STAZIA_DIR só existe para o teste automático (pasta temporária com um .env de mentira)
# o projeto fica no disco StaziaMed (SSD); a cópia do Samsung é só backup e serve de reserva se a pasta principal não tiver o .env
DIR="${STAZIA_DIR:-/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida}"
if [ -z "${STAZIA_DIR:-}" ] && [ ! -f "$DIR/.env" ]; then DIR="/Volumes/Samsung/STAZIAMED REVALIDA/StaziaMed Revalida"; fi
G=(gcloud --project="$P" --quiet)
K=""
trap 'K=""; unset K' EXIT

cd "$DIR" 2>/dev/null || { echo "Não achei a pasta da StaziaMed ($DIR). Nada foi mudado."; exit 1; }
[ -f .env ] || { echo "Não achei o arquivo .env na pasta da StaziaMed. Nada foi mudado."; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "O gcloud não está instalado neste Mac. Nada foi mudado."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "O python3 não está instalado neste Mac. Nada foi mudado."; exit 1; }
if [ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]; then
  echo "O gcloud está sem login. Rode no Terminal: gcloud auth login   (e depois este script de novo). Nada foi mudado."
  exit 1
fi

echo "== 1/4 chave da OpenAI no .env (sem mostrar)"
# Só a linha OPENAI_API_KEY é lida. Nenhuma linha ou mais de uma: para, porque não dá para saber qual vale.
ler_chave() {
  python3 -I - <<'PY'
import re, sys
found = []
for line in open(".env", encoding="utf-8"):
    m = re.match(r"^\s*(?:export\s+)?OPENAI_API_KEY\s*=(.*)$", line.rstrip("\r\n"))
    if m:
        v = m.group(1).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        found.append(v)
if not found:
    sys.exit(3)
if len(found) > 1:
    sys.exit(4)
sys.stdout.write(found[0])
PY
}
RC=0
K="$(ler_chave 2>/dev/null)" || RC=$?
case "$RC" in
  0) ;;
  3) echo "Não achei a linha OPENAI_API_KEY no .env. Nada foi mudado."; exit 1 ;;
  4) echo "Há mais de uma linha OPENAI_API_KEY no .env: deixe só uma e rode de novo. Nada foi mudado."; exit 1 ;;
  *) echo "Não consegui ler o .env. Nada foi mudado."; exit 1 ;;
esac
# conferência só por tamanho e formato: começa com sk-, pelo menos 40 caracteres, só letras, números, - e _ (sem espaços)
if ! [[ ${#K} -ge 40 && "$K" =~ ^sk-[A-Za-z0-9_-]+$ ]] || [[ "$K" =~ ^sk-([Yy][Oo][Uu][Rr]|[Mm][Yy][_-]|xxx|XXX|changeme|CHANGEME|example|EXAMPLE) ]]; then
  echo "A OPENAI_API_KEY do .env não parece uma chave da OpenAI (começa com sk-, pelo menos 40 caracteres, sem espaços). Nada foi mudado."
  exit 1
fi
H=$(( ${#K} / 2 ))
if [ $(( ${#K} % 2 )) -eq 0 ] && [ "${K:0:$H}" = "${K:$H}" ]; then
  echo "A OPENAI_API_KEY do .env parece ter sido colada duas vezes. Deixe só uma vez e rode de novo. Nada foi mudado."
  exit 1
fi
echo "   chave encontrada: ${#K} caracteres, formato de chave da OpenAI"

echo "== 2/4 segredo $SECRET no Google (Secret Manager)"
"${G[@]}" secrets describe "$SECRET" >/dev/null 2>&1 || "${G[@]}" secrets create "$SECRET" --replication-policy=automatic >/dev/null
# versão nova só quando a chave mudou (comparado aqui, sem mostrar)
if [ "$("${G[@]}" secrets versions access latest --secret="$SECRET" 2>/dev/null || true)" != "$K" ]; then
  printf '%s' "$K" | "${G[@]}" secrets versions add "$SECRET" --data-file=- >/dev/null
  echo "   $SECRET: chave gravada (versão nova)"
else
  echo "   $SECRET: já estava com esta chave (sem mudança)"
fi
"${G[@]}" secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
echo "   a conta do processamento ($SA) pode ler o segredo"
K=""

echo "== 3/4 tarefa $JOB no Cloud Run ($REGION)"
if ! "${G[@]}" run jobs describe "$JOB" --region="$REGION" --format=json >/dev/null 2>&1; then
  echo "Não achei a tarefa $JOB no projeto $P ($REGION). A chave ficou guardada no segredo $SECRET, mas a tarefa não foi mudada."
  exit 1
fi
"${G[@]}" run jobs update "$JOB" --region="$REGION" --update-secrets="OPENAI_API_KEY=${SECRET}:latest" >/dev/null
echo "   tarefa atualizada (as outras chaves da tarefa ficaram como estavam)"

echo "== 4/4 conferência"
# mostra só de qual segredo a OPENAI_API_KEY vem (nome e versão), nunca valores
ORIGEM="$("${G[@]}" run jobs describe "$JOB" --region="$REGION" --format=json | python3 -I -c '
import json, sys
def walk(v):
    if isinstance(v, dict):
        if v.get("name") == "OPENAI_API_KEY" and isinstance(v.get("valueFrom"), dict):
            ref = v["valueFrom"].get("secretKeyRef") or {}
            yield "%s:%s" % (ref.get("name", ""), ref.get("key", ""))
        for x in v.values():
            yield from walk(x)
    elif isinstance(v, list):
        for x in v:
            yield from walk(x)
print(next(walk(json.load(sys.stdin)), ""))
' 2>/dev/null)" || ORIGEM=""
if [ "$ORIGEM" = "${SECRET}:latest" ]; then
  echo "   OPENAI_API_KEY vem do segredo ${SECRET}:latest"
else
  echo "A tarefa foi atualizada, mas a conferência não achou a OPENAI_API_KEY ligada ao segredo $SECRET. Confira no painel do Cloud Run (tarefa $JOB, aba Variáveis e segredos)."
  exit 1
fi

echo
echo "Pronto. A chave vale a partir da próxima execução do processamento (a cada 10 minutos). Para rodar uma vez agora:"
echo "  gcloud run jobs execute $JOB --region=$REGION --project=$P --wait"
echo "Pode avisar o Claude."
