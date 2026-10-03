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
        // Duas páginas: o app atual (index.html) e o app novo do design system (novo.html, em /novo).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          novo: path.resolve(__dirname, 'novo.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
