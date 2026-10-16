#!/usr/bin/env bash
# Sobe a prévia do Voice Tutor: servidor de teste (127.0.0.1:31996) + página (http://127.0.0.1:31991).
# Precisa: gcloud com login do dono (Gemini Live pelo Vertex) e ~/.config/vertex-staziamed/vertex.env.
set -euo pipefail
cd "$(dirname "$0")/../.."
LOG=/Volumes/StaziaMed/.tmp-aulas/voice-tutor/previa-logs
mkdir -p "$LOG"
if lsof -nP -iTCP:31991 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "A prévia já está rodando: abra http://127.0.0.1:31991 (para reiniciar: pkill -f vozTeste/main.ts; pkill -f previa-voz/vite.config.mjs)"
  exit 0
fi
VOZ_MODO=previa nohup npx tsx server/vozTeste/main.ts > "$LOG/servidor.log" 2>&1 &
nohup npx vite --config scripts/previa-voz/vite.config.mjs > "$LOG/vite.log" 2>&1 &
sleep 4
echo "Prévia: http://127.0.0.1:31991  (logs em $LOG)"
