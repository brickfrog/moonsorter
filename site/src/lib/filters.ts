import type { Entry, YearRange, YearFilters } from './types';

export function parseYearInput(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return undefined;
  return n;
}

export function getYearRange(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
): YearRange | null {
  const min = parseYearInput(fromValue);
  const max = parseYearInput(toValue);
  if (min === undefined && max === undefined) return null;
  return { min, max };
}

export function withinYearRange(
  value: number | undefined,
  range: YearRange | null | undefined,
): boolean {
  if (!range) return true;
  if (value === undefined) return true;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

export function applyImportMode(
  list: Entry[],
  mode: string,
  count: number,
): Entry[] {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  switch (mode) {
    case 'top':
      return sorted.slice(0, count);
    case 'bottom':
      return sorted.slice(-count);
    case 'top-bottom': {
      const top = sorted.slice(0, count);
      const bottom = sorted.slice(-count);
      const ids = new Set(top.map((e) => e.mediaId ?? e.title));
      const unique = bottom.filter((e) => !ids.has(e.mediaId ?? e.title));
      return [...top, ...unique];
    }
    default:
      return list;
  }
}

export function applyYearFilters(list: Entry[], filters: YearFilters): Entry[] {
  return list.filter((entry) => {
    if (!withinYearRange(entry.airedYear ?? entry.seasonYear, filters.aired)) {
      return false;
    }
    if (!withinYearRange(entry.startedAtYear, filters.started)) {
      return false;
    }
    if (!withinYearRange(entry.completedAtYear, filters.completed)) {
      return false;
    }
    if (!withinYearRange(entry.updatedAtYear, filters.updated)) {
      return false;
    }
    return true;
  });
}
