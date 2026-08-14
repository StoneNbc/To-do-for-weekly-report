import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 只构建沙箱中的 Renderer；Main 与 Preload 由 tsup 独立输出。
export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  // 相对资源路径让打包后的 file:// 页面也能正确加载 JS/CSS。
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
