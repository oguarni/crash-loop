import { defineConfig } from 'vite';

// base './' keeps asset URLs relative so the build works from GitHub Pages,
// itch.io, or a plain file:// open without further configuration.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
