/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Single config for dev, build and tests. Keeping Vitest's `test` block here
 * avoids two separate Vite instances resolving different plugin types.
 */
export default defineConfig({
  plugins: [react()],
  // Relative base so the production build also works from a file:// path or a
  // sub-directory on any static host.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
