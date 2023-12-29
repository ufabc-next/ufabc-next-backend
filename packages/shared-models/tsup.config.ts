import { defineConfig } from 'tsup';

export default defineConfig({
  format: 'esm',
  target: 'node20',
  bundle: false,
  entry: ['src/models.ts'],
  clean: true,
  dts: true,
});
