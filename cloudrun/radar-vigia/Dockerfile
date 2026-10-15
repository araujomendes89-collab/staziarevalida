# Radar de Evidências: vigia das fontes oficiais (Google Cloud Run Job). Node puro (fetch do Node + API REST do Supabase, sem pacotes npm)
# mais Python com PyMuPDF só para ler o TEXTO dos PDFs do calendário de vacinação (o gov.br serve o calendário técnico como PDF).
# Sem navegador e sem OCR. Só leva os scripts do Radar e os dois mapas dos 100 Grandes Temas.
FROM node:22-slim
ENV NODE_ENV=production RADAR_PYTHON=/opt/pdf/bin/python
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/pdf \
 && /opt/pdf/bin/pip install --no-cache-dir "pymupdf>=1.24,<2"
WORKDIR /app
COPY scripts/radar/lib.mjs scripts/radar/custo.mjs scripts/radar/estado.mjs scripts/radar/ia.mjs scripts/radar/nucleo.mjs scripts/radar/job.mjs scripts/radar/extrair-pdf.py ./scripts/radar/
COPY scripts/radar/adaptadores ./scripts/radar/adaptadores
COPY scripts/portao-atualidade/dossies-100.json ./scripts/portao-atualidade/dossies-100.json
COPY scripts/grandes-temas/ligacao-questoes.json ./scripts/grandes-temas/ligacao-questoes.json
USER node
CMD ["node", "scripts/radar/job.mjs"]
