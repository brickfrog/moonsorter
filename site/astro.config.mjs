// @ts-check
import { defineConfig } from 'astro/config';

// Use base path for GitHub Pages, empty for custom domain/local
const base = process.env.GITHUB_PAGES === 'true' ? '/moonsorter' : '';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://brickfrog.github.io',
  base,
  // Astro 7 defaults this to 'jsx', which strips the space in markup like
  // `Rank <span data-sort-indicator>` and `(epsilon) <span class="help-dot">`.
  // `true` keeps HTML whitespace rules, which is what this markup assumes.
  compressHTML: true,
  redirects: {
    [`${base}/rank`]: `${base}/`,
  },
  integrations: [],
  vite: {
    optimizeDeps: { exclude: ['moonsorter.wasm'] },
  },
});
