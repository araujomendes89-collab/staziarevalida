import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {chavePaginaInicial} from './src/inicio/chave.js';

export default defineConfig(({mode}) => {
  // Chaves da página inicial (PAGINA_INICIAL e PAGINA_INICIAL_TEXTOS, ver src/inicio/chave.js): variável do ambiente (Vercel) ou .env
  const env = {...loadEnv(mode, process.cwd(), 'PAGINA_INICIAL'), ...process.env};
  return {
    plugins: [react(), tailwindcss(), chavePaginaInicial(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // O PGlite (banco local de desenvolvimento) carrega .wasm/.data ao lado do próprio módulo;
    // o pré-empacotamento do Vite quebra esses caminhos.
    optimizeDeps: {
      exclude: ['@electric-sql/pglite'],
    },
    build: {
      rollupOptions: {
        // Três páginas: a página inicial pública (index.html, leve e sem React), o app novo (novo.html, em /novo)
        // e a página "não encontrada" (404.html). O app antigo saiu do build (a entrada dele ficou em app-antigo.html).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          novo: path.resolve(__dirname, 'novo.html'),
          naoEncontrada: path.resolve(__dirname, '404.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
