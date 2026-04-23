import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08101f',
        panel: '#101a31',
        accent: '#38bdf8'
      }
    }
  },
  plugins: []
};

export default config;
