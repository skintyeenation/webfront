import type { Config } from 'tailwindcss';

// Skin Tyee palette — logo colours (cyan, orange) + green (added), per docs/plan.md.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00B8EC', // cyan (logo)
        accent: '#EC6A37',  // orange (logo)
        success: '#9ECD3B', // green (added)
        ink: '#1D1D1D',     // text / dark surfaces
      },
    },
  },
  plugins: [],
};

export default config;
