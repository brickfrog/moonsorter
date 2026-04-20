import { getToken } from '../lib/auth';
import type { ResultsPayload, ScoreConfig } from '../lib/types';
import {
  getScoreConfig,
  getScoreRange,
  roundToStep,
  formatScore,
  mapRankToScore,
} from '../lib/scores';
import { dom } from './dom';
import { state } from './state';
import { showStep } from './steps';
import { saveState } from './storage';
import { renderPair } from './comparison';

export type ResultRow = {
  index: number;
  mediaId: number | null;
  title: string;
  originalScore: number;
  rank: number;
  newScore: number;
  rankLow?: number;
  rankHigh?: number;
  rankMean?: number;
  topKConfidence?: number;
  coverImage?: string;
};

export type LocalResultsPayload = {
  generatedAt: string;
  scoreFormat: string;
  preserveRange: boolean;
  includeUnscored: boolean;
  mediaType: string;
  importMode: string;
  sliceCount: number;
  useScorePrior: boolean;
  filters: Record<string, unknown>;
  analysis?: {
    samples: number;
    topK: number;
    maxIter: number;
    computedAt: string;
  };
  rows: ResultRow[];
};

function shouldPreserveScoreSlots(): boolean {
  return state.preserveRange && state.useScorePrior;
}

function buildScoreSlots(entries: { score: number }[], config: ScoreConfig): number[] {
  return entries
    .map((entry) => entry.score)
    .filter((score) => score > 0)
    .sort((a, b) => b - a)
    .map((score) => roundToStep(score, config.step));
}

function assignScoresByRank(
  entries: Array<{ index: number; rank: number; originalScore: number }>,
  scoreSlots: number[],
): Map<number, number> {
  const scoredEntries = entries
    .filter((entry) => entry.originalScore > 0)
    .sort((a, b) => a.rank - b.rank);
  const limit = Math.min(scoredEntries.length, scoreSlots.length);
  const map = new Map<number, number>();
  for (let i = 0; i < limit; i += 1) {
    map.set(scoredEntries[i].index, scoreSlots[i]);
  }
  return map;
}

export function buildResultsPayload(): LocalResultsPayload | null {
  if (!state.wasm) return null;
  const analysisReady = state.wasm.get_uncertainty_ready();
  const analysisMeta = analysisReady
    ? {
        samples: state.wasm.get_uncertainty_samples(),
        topK: state.wasm.get_uncertainty_top_k(),
        maxIter: state.analysisMaxIter,
        computedAt: state.analysisComputedAt ?? new Date().toISOString(),
      }
    : undefined;
  const entries = state.items
    .map((item, index) => ({
      index,
      title: item.title,
      originalScore: item.score,
      rank: state.wasm!.get_rank_for(index),
      mediaId: item.mediaId,
      coverImage: item.coverImage,
    }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => a.rank - b.rank);

  const config = getScoreConfig(state.scoreFormat);
  const range = state.preserveRange ? getScoreRange(state.items) : null;
  const total = entries.length;
  const scoreSlots = shouldPreserveScoreSlots()
    ? buildScoreSlots(state.items, config)
    : [];
  const slotMap =
    scoreSlots.length > 1 ? assignScoresByRank(entries, scoreSlots) : null;

  const rows: ResultRow[] = entries.map((entry) => {
    const newScore =
      slotMap?.get(entry.index) ??
      mapRankToScore(entry.rank, total, config, range);
    const rankLow = analysisReady ? state.wasm!.get_rank_ci_low(entry.index) : -1;
    const rankHigh = analysisReady ? state.wasm!.get_rank_ci_high(entry.index) : -1;
    const rankMean = analysisReady ? state.wasm!.get_rank_mean(entry.index) : -1;
    const topKConfidence = analysisReady
      ? state.wasm!.get_topk_confidence(entry.index)
      : -1;
    return {
      index: entry.index,
      mediaId: entry.mediaId,
      title: entry.title,
      originalScore: entry.originalScore,
      rank: entry.rank,
      newScore,
      coverImage: entry.coverImage,
      rankLow: rankLow > 0 ? rankLow : undefined,
      rankHigh: rankHigh > 0 ? rankHigh : undefined,
      rankMean: rankMean >= 0 ? rankMean : undefined,
      topKConfidence: topKConfidence >= 0 ? topKConfidence : undefined,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scoreFormat: state.scoreFormat,
    preserveRange: state.preserveRange,
    includeUnscored: state.includeUnscored,
    mediaType: state.mediaType,
    importMode: state.importMode,
    sliceCount: state.sliceCount,
    useScorePrior: state.useScorePrior,
    filters: state.currentFilters,
    analysis: analysisMeta,
    rows,
  };
}

function updateSelectionStatus(total: number) {
  if (!dom.selectionStatus) return;
  dom.selectionStatus.textContent = `${state.selectedIndices.size} / ${total} selected`;
}

export function renderResultsTable(payload: LocalResultsPayload) {
  if (!dom.rankingsBody) return;
  dom.rankingsBody.innerHTML = '';
  if (!state.selectedIndices.size) {
    state.selectedIndices = new Set(payload.rows.map((row) => row.index));
  }
  const config = getScoreConfig(payload.scoreFormat as any);
  const analysisReady = Boolean(payload.analysis && state.wasm);
  const widthTarget =
    analysisReady && state.wasm ? state.wasm.get_uncertainty_width_target() : null;

  // Sort rows if a column is selected
  let sortedRows = [...payload.rows];
  if (state.sortColumn) {
    sortedRows.sort((a, b) => {
      let aVal: any, bVal: any;
      if (state.sortColumn === 'rank') {
        aVal = a.rank;
        bVal = b.rank;
      } else if (state.sortColumn === 'title') {
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
      } else if (state.sortColumn === 'originalScore') {
        aVal = a.originalScore;
        bVal = b.originalScore;
      } else if (state.sortColumn === 'newScore') {
        aVal = a.newScore;
        bVal = b.newScore;
      } else if (state.sortColumn === 'rankCI') {
        aVal = a.rankLow ?? 9999;
        bVal = b.rankLow ?? 9999;
      } else if (state.sortColumn === 'topKConfidence') {
        aVal = a.topKConfidence ?? -1;
        bVal = b.topKConfidence ?? -1;
      }
      if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Update sort indicators
  document.querySelectorAll('[data-sort-indicator]').forEach(el => {
    el.textContent = '';
  });
  if (state.sortColumn) {
    const indicator = document.querySelector(`[data-sort-indicator="${state.sortColumn}"]`);
    if (indicator) {
      indicator.textContent = state.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
    }
  }

  // For CI-bar scaling: find the widest CI span in the whole payload.
  let maxCIWidth = 1;
  for (const row of payload.rows) {
    if (row.rankLow && row.rankHigh) {
      const w = row.rankHigh - row.rankLow + 1;
      if (w > maxCIWidth) maxCIWidth = w;
    }
  }

  sortedRows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.dataset.index = row.index.toString();
    let isUncertain = false;
    if (analysisReady && state.wasm && widthTarget != null) {
      const width = state.wasm.get_uncertainty_width_for(row.index);
      if (width > widthTarget) {
        tr.classList.add('is-uncertain');
        isUncertain = true;
      }
    }

    const selectCell = document.createElement('td');
    selectCell.className = 'col-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedIndices.has(row.index);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.selectedIndices.add(row.index);
      } else {
        state.selectedIndices.delete(row.index);
      }
      updateSelectionStatus(payload.rows.length);
    });
    selectCell.appendChild(checkbox);

    const rankCell = document.createElement('td');
    rankCell.className = 'col-rank';
    const rankNum = document.createElement('span');
    rankNum.className = 'rank-num';
    rankNum.textContent = row.rank.toString();
    rankCell.appendChild(rankNum);

    const titleCell = document.createElement('td');
    titleCell.className = 'col-title';
    titleCell.textContent = row.title;

    const originalCell = document.createElement('td');
    originalCell.className = 'col-score';
    originalCell.textContent =
      row.originalScore > 0
        ? formatScore(row.originalScore, config)
        : '—';

    // New score + delta
    const newCell = document.createElement('td');
    newCell.className = 'col-score';
    if (row.newScore > 0) {
      const scoreSpan = document.createElement('span');
      scoreSpan.textContent = formatScore(row.newScore, config);
      newCell.appendChild(scoreSpan);
      if (row.originalScore > 0) {
        const delta = row.newScore - row.originalScore;
        const deltaSpan = document.createElement('span');
        deltaSpan.className =
          'score-delta ' +
          (delta > 0.001 ? 'is-up' : delta < -0.001 ? 'is-down' : 'is-flat');
        const arrow = delta > 0.001 ? '▲' : delta < -0.001 ? '▼' : '·';
        const formattedDelta = formatScore(Math.abs(delta), config);
        const sign = delta > 0.001 ? '+' : delta < -0.001 ? '-' : '';
        deltaSpan.textContent = ` ${arrow}${sign}${formattedDelta}`;
        newCell.appendChild(deltaSpan);
      }
    } else {
      newCell.textContent = '—';
    }

    // CI cell — range label + bar viz
    const ciCell = document.createElement('td');
    ciCell.className = 'col-ci';
    if (row.rankLow && row.rankHigh) {
      const range = document.createElement('span');
      range.className = 'ci-range';
      range.textContent = `[${row.rankLow} – ${row.rankHigh}]`;
      const bar = document.createElement('span');
      bar.className = 'ci-bar';
      const fill = document.createElement('span');
      fill.className = 'ci-bar-fill';
      const widthPct = Math.max(
        4,
        ((row.rankHigh - row.rankLow + 1) / maxCIWidth) * 100,
      );
      fill.style.width = `${widthPct}%`;
      bar.appendChild(fill);
      ciCell.append(range, bar);
      if (isUncertain) {
        const mark = document.createElement('span');
        mark.className = 'ci-uncertain-mark';
        mark.title = 'High uncertainty';
        mark.textContent = '▓▓';
        ciCell.appendChild(mark);
      }
    } else {
      ciCell.textContent = '—';
    }

    // Top-K cell — percentage + mini bar
    const topKCell = document.createElement('td');
    topKCell.className = 'col-topk';
    if (row.topKConfidence != null) {
      const pct = Math.round(row.topKConfidence * 100);
      const label = document.createElement('span');
      label.className = 'topk-label';
      label.textContent = `${pct}%`;
      const bar = document.createElement('span');
      bar.className = 'topk-bar';
      const fill = document.createElement('span');
      fill.className = 'topk-bar-fill';
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      topKCell.append(label, bar);
    } else {
      topKCell.textContent = '—';
    }

    tr.append(
      selectCell,
      rankCell,
      titleCell,
      originalCell,
      newCell,
      ciCell,
      topKCell,
    );
    dom.rankingsBody!.appendChild(tr);
  });
  updateSelectionStatus(payload.rows.length);
  updateResultsHeadline(payload);
}

function updateResultsHeadline(payload: LocalResultsPayload) {
  if (!dom.resultsHeadline) return;
  const count = payload.rows.length;
  if (!payload.analysis || !state.wasm || !state.wasm.get_uncertainty_ready()) {
    dom.resultsHeadline.textContent = `${count} titles, ordered.`;
    return;
  }
  const topKSize = payload.analysis.topK;
  const topKThreshold = 0.8;
  const topKStable = state.wasm.get_topk_stable_count(topKThreshold);
  const topKRows = Math.min(topKSize, count);
  const pct = topKRows > 0 ? (topKStable / topKRows) * 100 : 0;
  const stable = pct >= 80;
  const qualifier = stable ? 'Stable' : 'Unsettled';
  dom.resultsHeadline.innerHTML =
    `${count} titles, ordered. ` +
    `<em>${qualifier}</em> at ${pct.toFixed(1)}%.`;
}

export function renderAnalysisSummary(payload: LocalResultsPayload) {
  if (!dom.analysisSummary) return;
  if (!payload.analysis || !state.wasm || !state.wasm.get_uncertainty_ready()) {
    dom.analysisSummary.classList.add('hidden');
    dom.uncertainCard?.classList.add('hidden');
    dom.analysisControlsCard?.classList.remove('hidden');
    if (dom.analysisUncertainList) {
      dom.analysisUncertainList.innerHTML = '';
    }
    return;
  }
  dom.analysisControlsCard?.classList.add('hidden');
  const medianWidth = state.wasm.get_uncertainty_median_width();
  const p90Width = state.wasm.get_uncertainty_p90_width();
  const widthTarget = state.wasm.get_uncertainty_width_target();
  const topKSize = payload.analysis.topK;
  const topKThreshold = 0.8;
  const topKRows = Math.min(topKSize, payload.rows.length);
  const topKStable = state.wasm.get_topk_stable_count(topKThreshold);
  const topKTarget = Math.max(1, Math.floor(topKSize * 0.7));
  const stable =
    medianWidth <= widthTarget && topKStable >= topKTarget && topKRows > 0;
  const groupOnly = state.rankMode === 'group' && state.rankPhase === 'group';

  if (dom.analysisEyebrow) {
    dom.analysisEyebrow.textContent = `Bootstrap · ${payload.analysis.samples} resamples`;
  }
  if (dom.analysisMedian) {
    dom.analysisMedian.innerHTML = `${medianWidth} <span class="stat-unit">ranks · p90 ${p90Width}</span>`;
  }
  if (dom.analysisTopKSummary) {
    const pct = topKRows > 0 ? (topKStable / topKRows) * 100 : 0;
    dom.analysisTopKSummary.innerHTML = `${pct.toFixed(1)}<span class="stat-unit">%</span>`;
  }
  if (dom.statIters) {
    dom.statIters.innerHTML = `${payload.analysis.maxIter}<span class="stat-unit">/sample</span>`;
  }
  if (dom.statPairs) {
    dom.statPairs.textContent = state.comparisons.length.toString();
  }
  if (dom.analysisRecommendation) {
    if (groupOnly) {
      dom.analysisRecommendation.textContent = stable
        ? 'Looks stable. Keep ranking more groups if anything still feels off.'
        : 'Needs more ranking. Keep sorting new groups to tighten the intervals.';
    } else {
      dom.analysisRecommendation.textContent = stable
        ? 'Looks stable. Spot-check anything that still feels off using the chips below.'
        : 'Needs more comparisons. Click a title below to compare it with its nearest neighbor.';
    }
  }
  if (dom.analysisUncertainList) {
    dom.analysisUncertainList.innerHTML = '';
    if (groupOnly) {
      dom.analysisUncertainList.textContent =
        'Group mode: continue ranking batches to tighten the uncertainty bands.';
      dom.analysisSummary.classList.remove('hidden');
      dom.uncertainCard?.classList.remove('hidden');
      return;
    }
    const rowByIndex = new Map(payload.rows.map((row) => [row.index, row]));
    const rowByRank = new Map(payload.rows.map((row) => [row.rank, row]));
    const ranked: Array<{
      index: number;
      title: string;
      rank: number;
      width: number;
    }> = [];
    const limit = Math.min(6, payload.rows.length);
    for (let i = 0; i < limit; i += 1) {
      const idx = state.wasm.get_uncertainty_order_index(i);
      if (idx < 0) break;
      const row = rowByIndex.get(idx);
      if (!row) continue;
      ranked.push({
        index: idx,
        title: row.title,
        rank: row.rank,
        width: state.wasm.get_uncertainty_width_for(idx),
      });
    }
    const pickNeighborIndex = (row: ResultRow): number | null => {
      const prev = rowByRank.get(row.rank - 1);
      const next = rowByRank.get(row.rank + 1);
      if (prev && next) {
        const prevWidth = state.wasm!.get_uncertainty_width_for(prev.index);
        const nextWidth = state.wasm!.get_uncertainty_width_for(next.index);
        return prevWidth >= nextWidth ? prev.index : next.index;
      }
      if (prev) return prev.index;
      if (next) return next.index;
      return null;
    };
    ranked.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'analysis-chip';
      button.textContent = `#${entry.rank} ${entry.title} (CI ${entry.width})`;
      button.addEventListener('click', () => {
        const row = rowByIndex.get(entry.index);
        if (!row) return;
        const neighborIndex = pickNeighborIndex(row);
        if (neighborIndex == null) return;
        state.rankPhase = 'pairwise';
        saveState();
        state.focusPair = [entry.index, neighborIndex];
        showStep('compare');
        renderPair();
      });
      dom.analysisUncertainList!.appendChild(button);
    });
  }
  dom.analysisSummary.classList.remove('hidden');
  dom.uncertainCard?.classList.remove('hidden');
}

// Forward declaration for tier list rendering
let renderTierListCallback: ((payload: LocalResultsPayload) => void) | null = null;

export function setRenderTierListCallback(fn: (payload: LocalResultsPayload) => void) {
  renderTierListCallback = fn;
}

export function showResults() {
  const payload = buildResultsPayload();
  if (!payload) return;
  state.lastResults = payload as unknown as ResultsPayload;
  renderResultsTable(payload);
  renderAnalysisSummary(payload);
  if (renderTierListCallback) renderTierListCallback(payload);

  // Show upload button only if connected to AniList
  if (dom.uploadButton) {
    if (getToken()) {
      dom.uploadButton.classList.remove('hidden');
    } else {
      dom.uploadButton.classList.add('hidden');
    }
  }

  showStep('results');
}
