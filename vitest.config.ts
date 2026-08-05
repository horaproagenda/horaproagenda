import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: [
      { find: /^sonner$/, replacement: path.resolve(__dirname, './src/lib/toast.ts') },
      { find: /^sonner-original$/, replacement: path.resolve(__dirname, './node_modules/sonner') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});