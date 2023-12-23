import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/setup.ts'],
  format: 'esm',
  platform: 'node',
  sourcemap: true,
  dts: true,
});
