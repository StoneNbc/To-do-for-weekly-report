import { defineConfig } from 'vitest/config';

// 默认使用快速 Node 环境；Renderer 测试通过文件头单独声明 jsdom。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
