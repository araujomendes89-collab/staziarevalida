// Prévia das comemorações do Stazi no app, SEM login e sem banco (porta 31994). Não entra no build do site.
// Uso (na raiz do repositório): npx vite --config src/novo/app/play/celebracoes/previa/vite.previa.config.ts
// A sessão de verdade (src/novo/app/session.jsx) é trocada por ./sessaoFalsa.jsx só neste servidor.
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const RAIZ = path.resolve(__dirname, '../../../../../..');
const SESSAO_REAL = path.resolve(RAIZ, 'src/novo/app/session.jsx');
const SESSAO_FALSA = path.resolve(__dirname, 'sessaoFalsa.jsx');

function sessaoDePrevia(): Plugin {
  return {
    name: 'sessao-de-previa',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.endsWith('session.jsx')) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      return r && path.resolve(r.id.split('?')[0]) === SESSAO_REAL ? SESSAO_FALSA : null;
    },
  };
}

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(RAIZ, 'public'),
  plugins: [sessaoDePrevia(), react()],
  server: { port: 31994, strictPort: true, open: false, fs: { allow: [RAIZ] } },
  cacheDir: process.env.PREVIA_CACHE ?? path.resolve(RAIZ, 'node_modules/.vite-previa-celebracoes'),
});
