// Tailwind 3 runs as a PostCSS plugin. Astro dropped its Tailwind 3
// integration, so this does the same job: global.css carries the @tailwind
// directives and is imported once in Layout.astro.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
