import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/backend/server.ts', 'src/auth.ts'],
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
    '@willebrew/sage-core',
  ],
});
