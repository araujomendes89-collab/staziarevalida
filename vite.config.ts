import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
