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

const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music video',
  MANGA: 'Manga',
  NOVEL: 'Light novel',
  ONE_SHOT: 'One shot',
};

/**
 * The meta line under a Compare panel title, e.g. `TV · 2023 · 28 episodes`.
 * Every part is optional: CSV and demo lists carry a year at most, so the
 * caller gets whatever is actually known and an empty string when nothing is.
 */
export function formatEntryMeta(entry: {
  format?: string;
  episodes?: number;
  chapters?: number;
  airedYear?: number;
  seasonYear?: number;
  startedAtYear?: number;
}): string {
  const parts: string[] = [];
  if (entry.format) {
    parts.push(FORMAT_LABELS[entry.format] ?? entry.format);
  }
  const year = entry.airedYear || entry.seasonYear || entry.startedAtYear;
  if (year) parts.push(String(year));
  if (entry.episodes && entry.episodes > 0) {
    parts.push(`${entry.episodes} ${entry.episodes === 1 ? 'episode' : 'episodes'}`);
  } else if (entry.chapters && entry.chapters > 0) {
    parts.push(`${entry.chapters} ${entry.chapters === 1 ? 'chapter' : 'chapters'}`);
  }
  return parts.join(' · ');
}

/**
 * How many comparisons the ranker expects to need for `n` titles.
 *
 * MUST stay identical to `estimate_total_comparisons` in `src/types.mbt`,
 * which is what `get_progress_estimated` reports. The List headline promises
 * this number before the ranker exists and the Compare strip counts towards
 * it afterwards; if the two formulas drift, the same session advertises two
 * different targets on two screens.
 */
export function estimateTotalComparisons(n: number): number {
  if (n < 2) return 0;
  return Math.max(1, Math.round(n * Math.log(n + 1) * 2));
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
