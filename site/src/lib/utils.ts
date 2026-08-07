export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function parsePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function setStatus(target: Element | null, message: string): void {
  if (target) target.textContent = message;
}

export function suggestAnalysisSamples(total: number): number {
  if (total < 20) return 100;
  if (total < 50) return 150;
  return 200;
}

export function suggestAnalysisIterations(total: number): number {
  if (total < 20) return 20;
  if (total < 50) return 30;
  return 40;
}

export function suggestTopK(total: number, importMode: string, sliceCount: number): number {
  if (
    importMode === 'top' ||
    importMode === 'bottom' ||
    importMode === 'top-bottom'
  ) {
    return Math.max(1, Math.min(sliceCount, total));
  }
  if (total <= 10) return total;
  if (total <= 30) return 10;
  if (total <= 100) return 15;
  return 20;
}

/**
 * Join a site-root-relative path onto Astro's base path.
 *
 * `import.meta.env.BASE_URL` mirrors `base` in astro.config.mjs verbatim: ''
 * locally and '/moonsorter' -- with NO trailing slash -- on GitHub Pages.
 * Interpolating it directly yields '/moonsortermoonsorter.wasm'; adding a
 * slash unconditionally yields '//moonsorter.wasm', which the browser reads as
 * scheme-relative and tries to DNS-resolve. Both of those have shipped.
 * Normalise both sides instead of trusting either to carry the separator.
 */
export function withBase(path = ''): string {
  const base = (import.meta.env.BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}
