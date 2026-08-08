import { getToken } from '../lib/auth';
import type { ResultRow, ResultsPayload, ScoreConfig } from '../lib/types';
import {
  getScoreConfig,
  getScoreRange,
  roundToStep,
  formatScore,
  mapRankToScore,
} from '../lib/scores';
import { dom } from './dom';
import { state } from './state';
import { showView } from './views';
import { saveState } from './storage';
import { renderPair } from './comparison';

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

export function buildResultsPayload(): ResultsPayload | null {
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

/**
 * Send the user back to the comparison step with `row` paired against its
 * least-certain rank neighbour. Shared by the uncertain rows in the results
 * table and by the sidebar chips in renderAnalysisSummary.
 */
function focusComparisonFor(row: ResultRow, rows: ResultRow[]) {
  if (!state.wasm) return;
  const rowByRank = new Map(rows.map((r) => [r.rank, r]));
  const prev = rowByRank.get(row.rank - 1);
  const next = rowByRank.get(row.rank + 1);
  let neighbor: ResultRow | undefined;
  if (prev && next) {
    neighbor =
      state.wasm.get_uncertainty_width_for(prev.index) >=
      state.wasm.get_uncertainty_width_for(next.index)
        ? prev
        : next;
  } else {
    neighbor = prev ?? next;
  }
  if (!neighbor) return;
  state.rankPhase = 'pairwise';
  saveState();
  state.focusPair = [row.index, neighbor.index];
  showView('compare');
  renderPair();
}

function updateSelectionStatus(total: number) {
  if (!dom.selectionStatus) return;
  dom.selectionStatus.textContent = `${state.selectedIndices.size} / ${total} selected`;
}

export function renderResultsTable(payload: ResultsPayload) {
  if (!dom.rankingsBody) return;
  dom.rankingsBody.innerHTML = '';
  // Default to everything selected on the first render only. Inferring intent
  // from an empty set would silently re-select every row after "Select none"
  // or after the user unchecks the last one and re-sorts.
  if (!state.selectionInitialized) {
    state.selectedIndices = new Set(payload.rows.map((row) => row.index));
    state.selectionInitialized = true;
  }
  const config = getScoreConfig(payload.scoreFormat);
  const analysisReady = Boolean(payload.analysis && state.wasm);
  const widthTarget =
    analysisReady && state.wasm ? state.wasm.get_uncertainty_width_target() : null;
  // Every interval is drawn against ranks 1..n, not against its own row, so
  // the bars share one axis and overlaps are legible down the column.
  const total = payload.rows.length;

  // Sort rows if a column is selected. payload.rows arrives in rank order, and
  // Array.prototype.sort is stable, so equal keys keep rank as the tie-break.
  const sortKeys: Record<string, (row: ResultRow) => number | string> = {
    rank: (row) => row.rank,
    title: (row) => row.title.toLowerCase(),
    newScore: (row) => row.newScore,
    // The cell renders a bar proportional to interval WIDTH, so order by
    // width. Ordering by the lower bound just reproduces rank order and reads
    // as a broken sort.
    rankCI: (row) =>
      row.rankLow != null && row.rankHigh != null
        ? row.rankHigh - row.rankLow
        : -1,
  };
  const sortedRows = [...payload.rows];
  const sortKey = state.sortColumn ? sortKeys[state.sortColumn] : undefined;
  if (sortKey) {
    const direction = state.sortDirection === 'asc' ? 1 : -1;
    sortedRows.sort((a, b) => {
      const aVal = sortKey(a);
      const bVal = sortKey(b);
      if (aVal < bVal) return -direction;
      if (aVal > bVal) return direction;
      return 0;
    });
  }

  // Update sort indicators. The arrow glyph lives in the button's indicator
  // span; aria-sort belongs on the owning columnheader, which is what AT
  // announces.
  document.querySelectorAll('[data-sort-indicator]').forEach((el) => {
    el.textContent = '';
    el.closest('[role="columnheader"]')?.setAttribute('aria-sort', 'none');
  });
  if (state.sortColumn) {
    const indicator = document.querySelector(`[data-sort-indicator="${state.sortColumn}"]`);
    if (indicator) {
      indicator.textContent = state.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
      indicator
        .closest('[role="columnheader"]')
        ?.setAttribute(
          'aria-sort',
          state.sortDirection === 'asc' ? 'ascending' : 'descending',
        );
    }
  }

  sortedRows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'rank-row';
    rowEl.setAttribute('role', 'row');
    rowEl.dataset.index = row.index.toString();
    if (analysisReady && state.wasm && widthTarget != null) {
      const width = state.wasm.get_uncertainty_width_for(row.index);
      if (width > widthTarget) {
        // The amber bar says the row is unsettled; this makes it actionable.
        rowEl.title = 'Compare this title next';
        rowEl.addEventListener('click', (event) => {
          if (event.target instanceof HTMLElement && event.target.closest('input')) {
            return;
          }
          focusComparisonFor(row, payload.rows);
        });
      }
    }

    const selectCell = document.createElement('span');
    selectCell.setAttribute('role', 'cell');
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

    const ordinalCell = document.createElement('span');
    ordinalCell.className = 'rank-ordinal';
    ordinalCell.setAttribute('role', 'cell');
    ordinalCell.textContent = row.rank.toString();

    const titleCell = document.createElement('span');
    titleCell.className = 'rank-title-cell';
    titleCell.setAttribute('role', 'cell');
    const titleText = document.createElement('span');
    titleText.className = 'rank-title';
    titleText.textContent = row.title;
    titleCell.appendChild(titleText);
    if (row.originalScore > 0) {
      const delta = row.newScore - row.originalScore;
      const deltaEl = document.createElement('span');
      deltaEl.className =
        'rank-delta ' +
        (delta > 0.001 ? 'is-up' : delta < -0.001 ? 'is-down' : 'is-flat');
      // U+2212, not a hyphen: at 12px a hyphen reads as a separator. The
      // colour carries the direction, so there is no arrow glyph either.
      const sign = delta > 0.001 ? '+' : delta < -0.001 ? '\u2212' : '';
      deltaEl.textContent = `${sign}${formatScore(Math.abs(delta), config)}`;
      titleCell.appendChild(deltaEl);
    }

    let axisCell: HTMLSpanElement;
    if (row.rankLow && row.rankHigh) {
      axisCell = document.createElement('span');
      axisCell.className = 'rank-axis';
      const base = document.createElement('span');
      base.className = 'rank-axis-base';
      const span = row.rankHigh - row.rankLow + 1;
      const left = ((row.rankLow - 1) / total) * 100;
      const bar = document.createElement('span');
      bar.className = span >= 3 ? 'rank-axis-bar is-wide' : 'rank-axis-bar';
      bar.style.left = `${left}%`;
      bar.style.width = `${(span / total) * 100}%`;
      const label = document.createElement('span');
      label.className = 'rank-axis-label';
      label.style.left = `${left}%`;
      label.textContent = `${row.rankLow}\u2013${row.rankHigh}`;
      axisCell.append(base, bar, label);
    } else {
      axisCell = document.createElement('span');
      axisCell.className = 'rank-axis-empty';
      axisCell.textContent = '—';
    }
    axisCell.setAttribute('role', 'cell');

    const scoreCell = document.createElement('span');
    scoreCell.className = 'rank-score';
    scoreCell.setAttribute('role', 'cell');
    scoreCell.textContent =
      row.newScore > 0 ? formatScore(row.newScore, config) : '—';

    rowEl.append(selectCell, ordinalCell, titleCell, axisCell, scoreCell);
    dom.rankingsBody!.appendChild(rowEl);
  });
  updateSelectionStatus(payload.rows.length);
  updateResultsHeadline();
}

function updateResultsHeadline() {
  if (!dom.resultsHeadline) return;
  // The stability qualifier that used to live here is now the Top-K lock-in
  // stat in the sidebar; repeating it turned the 34px headline into a
  // paragraph.
  const count = state.comparisons.length;
  dom.resultsHeadline.textContent = `Ranking after ${count} ${
    count === 1 ? 'comparison' : 'comparisons'
  }`;
}

export function renderAnalysisSummary(payload: ResultsPayload) {
  const stats = [dom.statMedian, dom.statTopK, dom.statSamples, dom.statPairs];
  if (!payload.analysis || !state.wasm || !state.wasm.get_uncertainty_ready()) {
    for (const stat of stats) {
      if (stat) stat.textContent = '—';
    }
    dom.uncertainCallout?.classList.add('hidden');
    if (dom.uncertainChips) dom.uncertainChips.innerHTML = '';
    return;
  }
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

  if (dom.statMedian) {
    dom.statMedian.innerHTML = `${medianWidth} <span class="stat-unit">ranks · p90 ${p90Width}</span>`;
  }
  if (dom.statTopK) {
    const pct = topKRows > 0 ? (topKStable / topKRows) * 100 : 0;
    dom.statTopK.innerHTML = `${pct.toFixed(1)}<span class="stat-unit">%</span>`;
  }
  if (dom.statSamples) {
    dom.statSamples.textContent = payload.analysis.samples.toString();
  }
  if (dom.statPairs) {
    dom.statPairs.textContent = state.comparisons.length.toString();
  }
  if (dom.uncertainBody) {
    if (groupOnly) {
      dom.uncertainBody.textContent = stable
        ? 'The ranking is stable. If a group looks incorrect, do more group sorts.'
        : 'The ranking needs more data. Do more group sorts to make the confidence intervals smaller.';
    } else {
      dom.uncertainBody.textContent = stable
        ? 'The ranking is stable. If a title looks incorrect, click it below to compare it again.'
        : 'The ranking needs more comparisons. Click a title below to compare it with its nearest neighbor.';
    }
  }
  if (dom.uncertainChips) {
    dom.uncertainChips.innerHTML = '';
    // Group mode has no pair queue to seed, so the callout body is the whole
    // advice; chips would point at comparisons the user cannot answer yet.
    if (!groupOnly) {
      const rowByIndex = new Map(payload.rows.map((row) => [row.index, row]));
      const limit = Math.min(6, payload.rows.length);
      for (let i = 0; i < limit; i += 1) {
        const idx = state.wasm.get_uncertainty_order_index(i);
        if (idx < 0) break;
        const row = rowByIndex.get(idx);
        if (!row) continue;
        const width = state.wasm.get_uncertainty_width_for(idx);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'analysis-chip';
        button.textContent = `#${row.rank} ${row.title} (CI ${width})`;
        button.addEventListener('click', () => focusComparisonFor(row, payload.rows));
        dom.uncertainChips.appendChild(button);
      }
    }
  }
  dom.uncertainCallout?.classList.remove('hidden');
}

// Forward declaration for tier list rendering
let renderTierListCallback: ((payload: ResultsPayload) => void) | null = null;

export function setRenderTierListCallback(fn: (payload: ResultsPayload) => void) {
  renderTierListCallback = fn;
}

export function showResults() {
  const payload = buildResultsPayload();
  if (!payload) return;
  state.lastResults = payload;
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

  showView('results');
}
