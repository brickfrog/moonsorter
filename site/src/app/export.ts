import { setStatus } from '../lib/utils';
import { escapeCsv } from '../lib/csv';
import { getScoreConfig, getScoreRange, mapRankToScore } from '../lib/scores';
import type { SavedState } from '../lib/types';
import { dom } from './dom';
import { state } from './state';

function shouldPreserveScoreSlots(): boolean {
  return state.preserveRange && state.useScorePrior;
}

export function buildUploadPayload() {
  if (!state.wasm || !state.items.length) return [];
  const useSelection = state.lastResults != null;
  if (useSelection && state.selectedIndices.size === 0) {
    return [];
  }
  const config = getScoreConfig(state.scoreFormat);
  const range = state.preserveRange ? getScoreRange(state.items) : null;

  // Build score slots for preserving range
  const scoreSlots = shouldPreserveScoreSlots()
    ? state.items
        .map((entry) => entry.score)
        .filter((score) => score > 0)
        .sort((a, b) => b - a)
    : [];

  const entries = state.items
    .map((item, index) => ({
      index,
      title: item.title,
      mediaId: item.mediaId,
      originalScore: item.score,
      rank: state.wasm!.get_rank_for(index),
    }))
    .filter((entry) => entry.rank > 0 && entry.mediaId != null)
    .filter((entry) => !useSelection || state.selectedIndices.has(entry.index))
    .filter((entry) => state.includeUnscored || entry.originalScore > 0)
    .sort((a, b) => a.rank - b.rank);

  const total = entries.length;

  // Assign scores by rank using slots
  const scoredEntries = entries
    .filter((entry) => entry.originalScore > 0)
    .sort((a, b) => a.rank - b.rank);
  const limit = Math.min(scoredEntries.length, scoreSlots.length);
  const slotMap = new Map<number, number>();
  for (let i = 0; i < limit; i += 1) {
    slotMap.set(scoredEntries[i].index, scoreSlots[i]);
  }

  return entries.map((entry) => {
    const score =
      slotMap.get(entry.index) ??
      mapRankToScore(entry.rank, total, config, range);
    return { mediaId: entry.mediaId as number, score };
  });
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
  (state.lastResults as any).rows.forEach((row: any) => {
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
