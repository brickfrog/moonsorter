import { setStatus } from '../lib/utils';
import { escapeCsv } from '../lib/csv';
import type { SavedState, StartOptions } from '../lib/types';
import { dom } from './dom';
import { state } from './state';
import { buildResultsPayload } from './results';
import { buildSavedState, normalizeSavedState, SESSION_VERSION } from './storage';

/**
 * Scores to write back to AniList.
 *
 * Built from the same rows the results table renders, so an uploaded score can
 * never disagree with the score the user was shown. Selection and the unscored
 * filter choose *which* rows are sent; they must not influence *how* a score is
 * computed, which depends on rank across the whole ranked set.
 */
export function buildUploadPayload() {
  const payload = buildResultsPayload();
  if (!payload) return [];
  const useSelection = state.lastResults != null;
  if (useSelection && state.selectedIndices.size === 0) {
    return [];
  }
  return payload.rows
    .filter((row) => row.mediaId != null)
    .filter((row) => !useSelection || state.selectedIndices.has(row.index))
    .filter((row) => state.includeUnscored || row.originalScore > 0)
    .map((row) => ({ mediaId: row.mediaId as number, score: row.newScore }));
}

export function downloadSession() {
  const payload = buildSavedState();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter.session';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** One recorded decision: `{ indices: number[]; tie?: boolean }`. */
function isHistoryEntry(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  if (!('indices' in entry) || !Array.isArray(entry.indices)) return false;
  if (!entry.indices.every((index) => typeof index === 'number')) return false;
  if (!('tie' in entry)) return true;
  return entry.tie === undefined || typeof entry.tie === 'boolean';
}

/**
 * Parses a downloaded `.session` file back into a resumable state.
 *
 * The file is user-supplied and may be hand-edited, truncated, or from another
 * app entirely, so every structural assumption the ranker depends on is checked
 * here; anything else returns null rather than throwing at the caller.
 * A missing `version` predates versioning and is treated as version 1.
 */
export function loadSessionFile(text: string): SavedState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  if ('version' in parsed && parsed.version !== undefined && parsed.version !== SESSION_VERSION) {
    return null;
  }
  if (!('items' in parsed) || !Array.isArray(parsed.items) || !parsed.items.length) {
    return null;
  }
  const titled = parsed.items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'title' in item &&
      typeof item.title === 'string',
  );
  if (!titled) return null;
  if (!('comparisons' in parsed) || !Array.isArray(parsed.comparisons)) return null;
  if (!parsed.comparisons.every(isHistoryEntry)) return null;
  if (!('priorComparisons' in parsed) || !Array.isArray(parsed.priorComparisons)) {
    return null;
  }
  if (!parsed.priorComparisons.every(isHistoryEntry)) return null;
  // Shape verified above; normalizeSavedState supplies every remaining default.
  return normalizeSavedState(parsed as SavedState);
}

/**
 * Maps a restored session onto the ranker's start arguments. `SavedState` and
 * `StartOptions` are deliberately different shapes (`items` vs `list`), so the
 * translation lives in one place.
 */
export function sessionStartOptions(saved: SavedState): StartOptions {
  return {
    list: saved.items,
    comparisons: saved.comparisons,
    priorComparisons: saved.priorComparisons,
    scoreFormat: saved.scoreFormat,
    preserveRange: saved.preserveRange,
    includeUnscored: saved.includeUnscored,
    mediaType: saved.mediaType,
    useScorePrior: saved.useScorePrior,
    importMode: saved.importMode,
    sliceCount: saved.sliceCount,
    explorationEpsilon: saved.explorationEpsilon,
    uncertaintyPrior: saved.uncertaintyPrior,
    rankGoal: saved.rankGoal,
    rankMode: saved.rankMode,
    rankPhase: saved.rankPhase,
    rankObjective: saved.rankObjective,
    modeChosen: saved.modeChosen ?? true,
  };
}

export function downloadResults() {
  if (!state.lastResults) {
    setStatus(dom.listStatus, 'There are no results to export.');
    return;
  }
  const blob = new Blob([JSON.stringify(state.lastResults, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter-results.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv() {
  if (!state.lastResults) {
    setStatus(dom.listStatus, 'There are no results to export.');
    return;
  }
  const lines = [
    [
      'rank',
      'title',
      'original_score',
      'new_score',
      'media_id',
      'rank_ci_low',
      'rank_ci_high',
      'rank_mean',
      'topk_confidence',
    ].join(','),
  ];
  state.lastResults.rows.forEach((row) => {
    lines.push(
      [
        row.rank.toString(),
        escapeCsv(row.title),
        row.originalScore.toString(),
        row.newScore.toString(),
        row.mediaId != null ? row.mediaId.toString() : '',
        row.rankLow?.toString() ?? '',
        row.rankHigh?.toString() ?? '',
        row.rankMean != null ? row.rankMean.toFixed(2) : '',
        row.topKConfidence != null
          ? row.topKConfidence.toFixed(4)
          : '',
      ].join(','),
    );
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter-results.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
