import type { Config } from 'tailwindcss';

// content 仅扫描 Renderer，Main/Preload 不应依赖任何 UI 样式。
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        note: '#FFF8E7',
      },
    },
  },
  plugins: [],
} satisfies Config;
