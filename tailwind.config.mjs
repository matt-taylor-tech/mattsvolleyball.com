/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#F5F0EA',
          100: '#EFE6DD',
          200: '#ECE2D0',
          300: '#DDD0BA',
          400: '#C5B598',
          500: '#A99A7D',
          600: '#8B7D64',
        },
        ocean: {
          500: '#64748B',
          600: '#4B5563',
          700: '#363133',
          800: '#231F20',
          900: '#171415',
        },
        coral: {
          400: '#CD5844',
          500: '#BB4430',
          600: '#A13926',
          700: '#87301F',
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
