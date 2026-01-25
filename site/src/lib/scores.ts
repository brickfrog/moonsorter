import type { ScoreFormat } from './anilist';
import type { Entry, ScoreConfig, ScoreRange } from './types';

const SCORE_CONFIGS: Record<ScoreFormat, ScoreConfig> = {
  POINT_100: { max: 100, step: 1, label: '100-point' },
  POINT_10_DECIMAL: { max: 10, step: 0.1, label: '10-point (decimal)' },
  POINT_10: { max: 10, step: 1, label: '10-point' },
  POINT_5: { max: 5, step: 1, label: '5-point' },
  POINT_3: { max: 3, step: 1, label: '3-point' },
};

export function getScoreConfig(format: ScoreFormat): ScoreConfig {
  return SCORE_CONFIGS[format] ?? SCORE_CONFIGS.POINT_10;
}

export function resolveScoreFormat(
  selected: string | undefined,
  detected: ScoreFormat | undefined,
): ScoreFormat {
  if (selected && selected !== 'AUTO' && selected in SCORE_CONFIGS) {
    return selected as ScoreFormat;
  }
  return detected ?? 'POINT_10';
}

export function inferScoreFormat(entries: Entry[]): ScoreFormat | undefined {
  const scores = entries.map((e) => e.score).filter((s) => s > 0);
  if (scores.length === 0) return undefined;
  const hasDecimal = scores.some((s) => s !== Math.floor(s));
  const max = Math.max(...scores);
  if (hasDecimal) return 'POINT_10_DECIMAL';
  if (max > 10) return 'POINT_100';
  if (max <= 3) return 'POINT_3';
  if (max <= 5) return 'POINT_5';
  return 'POINT_10';
}

export function roundToStep(value: number, step: number): number {
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

export function formatScore(value: number, config: ScoreConfig): string {
  const rounded = roundToStep(value, config.step);
  return config.step < 1 ? rounded.toFixed(1) : String(rounded);
}

export function getScoreRange(entries: Entry[]): ScoreRange | null {
  const scores = entries.map((e) => e.score).filter((s) => s > 0);
  if (scores.length === 0) return null;
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

export function mapRankToScore(
  rank: number,
  total: number,
  config: ScoreConfig,
  originalRange: ScoreRange | null,
): number {
  const effectiveMax = originalRange?.max ?? config.max;
  const effectiveMin = originalRange?.min ?? 1;
  if (total <= 1) return effectiveMax;
  const t = (total - 1 - rank) / (total - 1);
  const raw = effectiveMin + t * (effectiveMax - effectiveMin);
  return roundToStep(Math.max(1, raw), config.step);
}
