import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@stratuscode/shared', '@stratuscode/storage', '@sage/core'],
});
