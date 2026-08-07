import { setStatus } from '../lib/utils';
import { escapeCsv } from '../lib/csv';
import type { SavedState } from '../lib/types';
import { dom } from './dom';
import { state } from './state';
import { buildResultsPayload } from './results';

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
  const payload: SavedState = {
    items: state.items,
    comparisons: state.comparisons,
    priorComparisons: state.priorComparisons,
    scoreFormat: state.scoreFormat,
    preserveRange: state.preserveRange,
    includeUnscored: state.includeUnscored,
    mediaType: state.mediaType,
    importMode: state.importMode,
    sliceCount: state.sliceCount,
    useScorePrior: state.useScorePrior,
    explorationEpsilon: state.explorationEpsilon,
    uncertaintyPrior: state.uncertaintyPrior,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter-session.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadResults() {
  if (!state.lastResults) {
    setStatus(dom.importStatus, 'No results to export yet.');
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
    setStatus(dom.importStatus, 'No results to export yet.');
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
