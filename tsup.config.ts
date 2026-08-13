import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'main/index': 'src/main/index.ts' },
    outDir: 'dist-electron',
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    bundle: true,
    sourcemap: true,
    clean: true,
    outExtension: () => ({ js: '.cjs' }),
    external: ['electron'],
  },
  {
    entry: { 'preload/index': 'src/preload/index.ts' },
    outDir: 'dist-electron',
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    bundle: true,
    sourcemap: true,
    clean: false,
    outExtension: () => ({ js: '.cjs' }),
    external: ['electron'],
  },
]);
