// @ts-check
import { defineConfig } from 'astro/config';

// Use base path for GitHub Pages, empty for custom domain/local
const base = process.env.GITHUB_PAGES === 'true' ? '/moonsorter' : '';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://brickfrog.github.io',
  base,
  redirects: {
    [`${base}/rank`]: `${base}/`,
  },
  integrations: [],
  vite: {
    optimizeDeps: { exclude: ['moonsorter.wasm'] },
  },
});
