/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#F7F6F3',
          100: '#F0EEEA',
          200: '#E8E6E1',
          300: '#DAD8D2',
          400: '#C2BFB8',
          500: '#A5A29B',
          600: '#87847D',
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
      borderRadius: {
        none: '0',
        sm: '1px',
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
        xl: '5px',
        '2xl': '6px',
        '3xl': '8px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
