import { defineConfig } from 'vite';

// Base path is set for GitHub Pages project-site deployment at
// https://<user>.github.io/karafence/
export default defineConfig({
  base: '/karafence/',
  build: {
    outDir: 'dist',
  },
});
