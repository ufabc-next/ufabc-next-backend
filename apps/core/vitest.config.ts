import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
});
