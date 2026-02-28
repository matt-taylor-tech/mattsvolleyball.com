/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#FFF8F0',
          100: '#FEF3E2',
          200: '#FDE8C8',
          300: '#F0C987',
          400: '#D4A056',
          500: '#C08B3F',
          600: '#A07030',
        },
        ocean: {
          500: '#2A6F97',
          600: '#1B4965',
          700: '#143A52',
          800: '#0D2B3E',
          900: '#061C2B',
        },
        coral: {
          400: '#FF8C5A',
          500: '#FF6B35',
          600: '#E55A20',
          700: '#CC4A10',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
