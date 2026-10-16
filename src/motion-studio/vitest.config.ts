import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Testes do Motion Studio, isolados do vitest.config.ts do app.
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, '../..'),
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/motion-studio/__tests__/**/*.test.{ts,tsx}'],
  },
});
