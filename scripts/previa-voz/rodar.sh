#!/usr/bin/env bash
# Sobe a prévia do Voice Tutor: servidor de teste (127.0.0.1:31996) + página (http://127.0.0.1:31991).
# Na página: escolha Stazi ou Stazia e a personalidade, e clique em "Iniciar conversa" (Chrome, permitir o microfone).
# Precisa: gcloud com login do dono (Gemini Live pelo Vertex) e ~/.config/vertex-staziamed/vertex.env.
# Para parar: pkill -f vozTeste/main.ts; pkill -f previa-voz/vite.config.mjs
set -euo pipefail
cd "$(dirname "$0")/../.."
LOG=/Volumes/StaziaMed/.tmp-aulas/voice-tutor/previa-logs
mkdir -p "$LOG"
ouvindo() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
if ouvindo 31996; then echo "Servidor de teste já está rodando (31996)."; else
  VOZ_MODO=previa nohup npx tsx server/vozTeste/main.ts > "$LOG/servidor.log" 2>&1 &
fi
if ouvindo 31991; then echo "Página já está rodando (31991)."; else
  nohup npx vite --config scripts/previa-voz/vite.config.mjs > "$LOG/vite.log" 2>&1 &
fi
for _ in $(seq 1 30); do ouvindo 31996 && ouvindo 31991 && break; sleep 1; done
echo "Prévia: http://127.0.0.1:31991  (logs em $LOG)"
