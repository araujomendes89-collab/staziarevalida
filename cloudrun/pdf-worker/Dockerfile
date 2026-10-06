# Processamento de PDF da Central de Conteudo (Google Cloud Run Job).
# Node + Chromium (gerador dos PDFs finais, Playwright) + Python com PyMuPDF + Tesseract (OCR em portugues, espanhol e ingles).
# Mesma versao do Playwright do package.json, para o navegador da imagem servir a biblioteca instalada.

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=optional --ignore-scripts
COPY server ./server
COPY scripts/content-hub ./scripts/content-hub
RUN mkdir -p dist-worker && ./node_modules/.bin/esbuild scripts/content-hub/worker-job.ts --bundle --platform=node --format=cjs --packages=external --target=node22 --outfile=dist-worker/worker-job.cjs

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
COPY server/contentHub/fonts ./server/contentHub/fonts
USER pwuser
CMD ["node", "dist-worker/worker-job.cjs"]
