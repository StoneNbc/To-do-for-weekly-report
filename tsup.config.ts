import { defineConfig } from 'tsup';

// Electron 启动入口和 Preload 都输出 CJS；Renderer 仍由 Vite 生成浏览器 ESM。
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
    // Main 构建已经清理过共享 outDir，Preload 不能再次删除 Main 产物。
    clean: false,
    outExtension: () => ({ js: '.cjs' }),
    external: ['electron'],
  },
]);
