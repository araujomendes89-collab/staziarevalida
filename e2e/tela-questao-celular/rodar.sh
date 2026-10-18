#!/usr/bin/env bash
# Tela de questão no iPhone: nada pode ficar mais largo que a tela (hotfix 18/10/2026). Um comando só:
#   bash e2e/tela-questao-celular/rodar.sh
# Sobe a prévia da tela de questão (dados simulados, sem banco e sem rede), abre no WebKit com o perfil de iPhone (390×844,
# 375×667 e 430×932), com o texto normal e com A+, antes e depois de responder, e FALHA se a página ficar mais larga que a tela
# (document.documentElement.scrollWidth > innerWidth) ou se algum elemento, mesmo fixo ou animado, passar da borda.
# Precisa do WebKit do Playwright: npx playwright install webkit
set -euo pipefail
cd "$(dirname "$0")/../.."
PORTA="${PORTA:-31979}"
SAIDA="${SAIDA:-/Volumes/StaziaMed/.tmp-aulas/tela-questao-celular}"
mkdir -p "$SAIDA/tmp"
export TMPDIR="$SAIDA/tmp"
npm run -s ds:icons >/dev/null 2>&1 || true
if lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1; then echo "A porta $PORTA já está em uso. Use PORTA=outra." >&2; exit 1; fi
npx vite --config scripts/previa-questoes/vite.config.mjs --port "$PORTA" >"$SAIDA/previa.log" 2>&1 &
PREVIA=$!
trap 'kill $PREVIA 2>/dev/null || true; wait $PREVIA 2>/dev/null || true; rm -rf "$SAIDA/tmp"' EXIT
for i in $(seq 1 120); do curl -sf -o /dev/null "http://127.0.0.1:$PORTA/" && break; kill -0 $PREVIA 2>/dev/null || { echo "A prévia não subiu. Veja $SAIDA/previa.log" >&2; exit 1; }; sleep 1; done
BASE="http://127.0.0.1:$PORTA" SAIDA="$SAIDA" node e2e/tela-questao-celular/celular.mjs
