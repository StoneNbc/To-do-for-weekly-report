import type { Config } from 'tailwindcss';

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
