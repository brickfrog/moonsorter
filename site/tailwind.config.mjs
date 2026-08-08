/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      // Mirrors the CSS custom properties in `global.css`. Keep the two in
      // sync: the component layer reads `var(--token)`, utility classes in
      // markup read these.
      colors: {
        paper: '#F3F3EC',
        panel: '#E9E9DF',
        'panel-hover': '#E2E2D6',
        stripe: '#DEDED3',
        ink: '#1B1D16',
        'ink-70': '#4A4D42',
        muted: '#6E7166',
        'muted-light': '#8A8C80',
        faint: '#A0A296',
        rule: '#DCDCD2',
        'rule-light': '#E4E4DA',
        'rule-track': '#E0E0D6',
        edge: '#C9C9BE',
        signal: '#2E7D51',
        uncertain: '#B57A16',
        negative: '#A5482F',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
