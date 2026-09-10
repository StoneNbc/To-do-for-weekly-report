import type { Config } from 'tailwindcss';
import { DEFAULT_NOTE_COLOR } from './src/shared/constants';

// content 仅扫描 Renderer，Main/Preload 不应依赖任何 UI 样式。
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        note: DEFAULT_NOTE_COLOR,
      },
    },
  },
  plugins: [],
} satisfies Config;
