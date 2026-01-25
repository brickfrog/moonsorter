import type { Entry } from './types';

export function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function normalizeCsvHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '_');
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      if (char === '\r' && text[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    cell += char;
    i += 1;
  }

  row.push(cell);
  if (row.some((c) => c.trim() !== '')) {
    rows.push(row);
  }

  return rows;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCsvEntries(text: string): Entry[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headerRow = rows[0].map(normalizeCsvHeader);
  const titleIndex = headerRow.findIndex(
    (h) => h === 'title' || h === 'name' || h === 'series_title',
  );
  const scoreIndex = headerRow.findIndex(
    (h) => h === 'score' || h === 'rating' || h === 'my_score',
  );
  const idIndex = headerRow.findIndex(
    (h) =>
      h === 'media_id' ||
      h === 'mediaid' ||
      h === 'id' ||
      h === 'anilist_id' ||
      h === 'series_animedb_id',
  );
  const airedIndex = headerRow.findIndex(
    (h) =>
      h === 'aired_year' ||
      h === 'airedyear' ||
      h === 'year' ||
      h === 'series_season',
  );
  const startedIndex = headerRow.findIndex(
    (h) =>
      h === 'started_year' ||
      h === 'startedyear' ||
      h === 'start_year' ||
      h === 'my_start_date',
  );
  const completedIndex = headerRow.findIndex(
    (h) =>
      h === 'completed_year' ||
      h === 'completedyear' ||
      h === 'end_year' ||
      h === 'my_finish_date',
  );
  const updatedIndex = headerRow.findIndex(
    (h) => h === 'updated_year' || h === 'updatedyear' || h === 'update_on_import',
  );
  const coverIndex = headerRow.findIndex(
    (h) => h === 'cover' || h === 'cover_image' || h === 'coverimage' || h === 'image',
  );

  if (titleIndex < 0) return [];

  const entries: Entry[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const title = row[titleIndex]?.trim();
    if (!title) continue;

    let mediaId: number | null = null;
    if (idIndex >= 0) {
      const raw = row[idIndex]?.trim();
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) mediaId = parsed;
      }
    }

    let score = 0;
    if (scoreIndex >= 0) {
      const raw = row[scoreIndex]?.trim();
      if (raw) {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) score = parsed;
      }
    }

    const airedRaw = airedIndex >= 0 ? row[airedIndex]?.trim() : undefined;
    const startedRaw = startedIndex >= 0 ? row[startedIndex]?.trim() : undefined;
    const completedRaw = completedIndex >= 0 ? row[completedIndex]?.trim() : undefined;
    const updatedRaw = updatedIndex >= 0 ? row[updatedIndex]?.trim() : undefined;
    const coverRaw = coverIndex >= 0 ? row[coverIndex]?.trim() : undefined;

    entries.push({
      title,
      mediaId,
      score,
      airedYear: parseOptionalInt(airedRaw?.slice(0, 4)),
      seasonYear: parseOptionalInt(airedRaw?.slice(0, 4)),
      startedAtYear: parseOptionalInt(startedRaw?.slice(0, 4)),
      completedAtYear: parseOptionalInt(completedRaw?.slice(0, 4)),
      updatedAtYear: parseOptionalInt(updatedRaw?.slice(0, 4)),
      coverImage: coverRaw || undefined,
    });
  }

  return entries;
}
