# Processamento de PDF da Central de Conteúdo (Google Cloud Run Job).
# Node + Chromium (gerador dos PDFs finais, Playwright) + Python com PyMuPDF + Tesseract (OCR em português, espanhol e inglês).
# Mesma versão do Playwright do package.json, para o navegador da imagem servir à biblioteca instalada.

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# o pacote do processamento usa o servidor, os scripts e partes de src/ (tipos, normalização de questões e a carga do banco
# de desenvolvimento, que vem junto pelo caminho das importações mesmo sem ser usada em produção)
COPY server ./server
COPY scripts ./scripts
COPY src ./src
RUN npx esbuild scripts/content-hub/worker-job.ts --bundle --platform=node --format=cjs --packages=external --target=node22 \
      --outfile=dist-worker/worker-job.cjs --metafile=dist-worker/meta.json \
 && node scripts/cloudrun/worker-deps.mjs dist-worker/meta.json dist-worker/package.json

FROM mcr.microsoft.com/playwright:v1.62.1-noble
ENV NODE_ENV=production \
    CONTENT_HUB_PYTHON=/opt/pdf/bin/python \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-venv tesseract-ocr tesseract-ocr-por tesseract-ocr-spa tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/pdf \
 && /opt/pdf/bin/pip install --no-cache-dir "pymupdf>=1.24,<2"
WORKDIR /app
# só as bibliotecas que o pacote usa, nas versões do package-lock (scripts/cloudrun/worker-deps.mjs): Playwright, Supabase,
# provedores de IA... e nada de Vite, React ou ferramentas de teste
COPY --from=build /app/dist-worker/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist-worker/worker-job.cjs ./dist-worker/worker-job.cjs
COPY scripts/content-hub/*.py ./scripts/content-hub/
COPY public/brand/horizontal-480w.png ./public/brand/horizontal-480w.png
# logotipo da folha do candidato do Treino em Dupla (server/dupla/folha.ts)
COPY public/novo-assets/logo-staziamed-revalida-v2.png ./public/novo-assets/logo-staziamed-revalida-v2.png
COPY server/contentHub/fonts ./server/contentHub/fonts
USER pwuser
CMD ["node", "dist-worker/worker-job.cjs"]
