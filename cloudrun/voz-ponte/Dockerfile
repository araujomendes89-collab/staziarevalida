# PONTE DE VOZ do Tutor (Google Cloud Run, serviço "stazia-voz-ponte"): navegador ⇄ Gemini Live no Vertex AI.
# Node puro + a biblioteca "ws" (na versão do package-lock). Nada de Vite, React ou banco: a ponte só abre o bilhete selado pelo
# app (VOZ_PONTE_SEGREDO) e fala com o Vertex com a conta de serviço do próprio Cloud Run.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY server ./server
# humor da ligação (server/tutor/humorVoz.ts → personalityEngine.ts) usa o catálogo de reações em src/shared
COPY src/shared ./src/shared
RUN npx esbuild server/vozPonte/main.ts --bundle --platform=node --format=cjs --target=node22 --external:ws --external:bufferutil --external:utf-8-validate \
      --outfile=dist-ponte/ponte.cjs \
 && node -e "const p=require('./package-lock.json').packages['node_modules/ws'];require('fs').writeFileSync('dist-ponte/package.json',JSON.stringify({name:'stazia-voz-ponte',private:true,dependencies:{ws:p.version}}))"

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist-ponte/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist-ponte/ponte.cjs ./ponte.cjs
USER node
CMD ["node", "ponte.cjs"]
