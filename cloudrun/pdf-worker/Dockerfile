# Processamento de PDF da Central de Conteúdo (Google Cloud Run Job).
# Node + Chromium (gerador dos PDFs finais, Playwright) + Python com PyMuPDF + Tesseract (OCR em português, espanhol e inglês).
# Mesma versão do Playwright do package.json, para o navegador da imagem servir à biblioteca instalada.

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY server ./server
COPY scripts/content-hub ./scripts/content-hub
RUN npx esbuild scripts/content-hub/worker-job.ts --bundle --platform=node --format=cjs --packages=external --target=node22 --outfile=dist-worker/worker-job.cjs

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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist-worker ./dist-worker
COPY scripts/content-hub/*.py ./scripts/content-hub/
COPY public/novo-assets/logo-horizontal.png ./public/novo-assets/logo-horizontal.png
USER pwuser
CMD ["node", "dist-worker/worker-job.cjs"]
