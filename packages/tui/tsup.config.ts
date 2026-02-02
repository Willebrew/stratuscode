import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@stratuscode/shared',
    '@stratuscode/tools',
    '@stratuscode/storage',
    '@sage/core',
    'react',
    'ink',
  ],
});
