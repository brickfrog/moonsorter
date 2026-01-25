import { setStatus, suggestAnalysisSamples, suggestAnalysisIterations, suggestTopK, clamp01, parsePositive } from '../lib/utils';
import { getScoreConfig } from '../lib/scores';
import type { Entry, RankingHistoryEntry, StartOptions, ScoreConfig } from '../lib/types';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { showStep } from './steps';
import { updateProgress } from './progress';
import { ensureWasm, applyRanking, resolvePairPolicy } from './wasm';
import { enterActiveStep } from './mode';

function applyAnalysisDefaults(total: number) {
  const suggestedSamples = suggestAnalysisSamples(total);
  const suggestedTopKVal = suggestTopK(total, state.importMode, state.sliceCount);
  const suggestedIterations = suggestAnalysisIterations(total);
  state.analysisSamples = suggestedSamples;
  state.analysisTopK = suggestedTopKVal;
  state.analysisMaxIter = suggestedIterations;
  if (dom.analysisSamples) dom.analysisSamples.value = suggestedSamples.toString();
  if (dom.analysisTopK) dom.analysisTopK.value = suggestedTopKVal.toString();
  if (dom.analysisMaxIter) dom.analysisMaxIter.value = suggestedIterations.toString();
}

function buildScorePriors(
  list: Entry[],
  config: ScoreConfig,
): RankingHistoryEntry[] {
  const scored = list
    .map((entry, index) => ({ index, score: entry.score }))
    .filter((entry) => entry.score > 0);
  if (scored.length < 2) return [];

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const priors: RankingHistoryEntry[] = [];
  const maxPriors = Math.min(400, list.length * 4);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const a = current.index;
    const b = next.index;

    const diff = current.score - next.score;
    if (diff === 0) continue;

    let weight = 1;
    const normalized = config.max > 0 ? diff / config.max : 0;
    if (normalized >= 0.15) weight += 1;
    if (normalized >= 0.3) weight += 1;

    for (let k = 0; k < weight; k += 1) {
      priors.push({ indices: [a, b] });
      if (priors.length >= maxPriors) return priors;
    }
  }
  return priors;
}

export async function startRanking(options: StartOptions) {
  const cleaned = options.list
    .map((entry) => ({
      title: typeof entry.title === 'string' ? entry.title.trim() : '',
      mediaId: entry.mediaId,
      score: Number.isFinite(entry.score) ? entry.score : 0,
      airedYear: entry.airedYear,
      seasonYear: entry.seasonYear,
      startedAtYear: entry.startedAtYear,
      completedAtYear: entry.completedAtYear,
      updatedAtYear: entry.updatedAtYear,
      coverImage: entry.coverImage,
    }))
    .filter((entry) => entry.title.length > 0);

  if (cleaned.length < 2) {
    setStatus(dom.importStatus, 'Need at least two valid titles to rank.');
    return;
  }

  state.items = cleaned;
  state.comparisons = options.comparisons ? options.comparisons.slice() : [];
  state.priorComparisons = options.priorComparisons
    ? options.priorComparisons.slice()
    : [];
  state.scoreFormat = options.scoreFormat;
  state.preserveRange = options.preserveRange;
  state.includeUnscored = options.includeUnscored;
  state.mediaType = options.mediaType ?? state.mediaType;
  state.importMode = options.importMode ?? state.importMode;
  state.sliceCount = options.sliceCount ?? state.sliceCount;
  state.useScorePrior = options.useScorePrior ?? state.useScorePrior;
  state.explorationEpsilon = clamp01(
    options.explorationEpsilon ?? state.explorationEpsilon,
  );
  state.uncertaintyPrior = parsePositive(
    options.uncertaintyPrior ?? state.uncertaintyPrior,
    state.uncertaintyPrior,
  );
  state.rankGoal = options.rankGoal ?? state.rankGoal;
  state.rankMode = options.rankMode ?? state.rankMode;
  if (state.rankMode === 'pairwise') {
    state.rankPhase = 'pairwise';
  } else if (state.rankMode === 'group') {
    state.rankPhase = 'group';
  } else {
    state.rankPhase = options.rankPhase ?? 'group';
  }
  state.rankObjective = options.rankObjective ?? state.rankObjective;
  state.modeChosen = options.modeChosen ?? state.modeChosen;
  applyAnalysisDefaults(state.items.length);
  state.analysisComputedAt = null;
  if (dom.analysisStatus) {
    dom.analysisStatus.textContent = '';
  }

  // Disable tier list by default if no cover images (CSV imports)
  const hasCoverImages = state.items.some(item => item.coverImage);
  if (dom.optInTierList) {
    if (!hasCoverImages) {
      dom.optInTierList.checked = false;
      dom.optInTierList.disabled = true;
      const label = dom.optInTierList.parentElement;
      if (label) {
        label.title = 'Tier list requires cover images (only available for AniList imports)';
        label.style.opacity = '0.5';
      }
    } else {
      dom.optInTierList.disabled = false;
      dom.optInTierList.checked = true;
      const label = dom.optInTierList.parentElement;
      if (label) {
        label.title = '';
        label.style.opacity = '1';
      }
    }
  }

  const config = getScoreConfig(state.scoreFormat);
  if (state.useScorePrior && state.priorComparisons.length === 0) {
    state.priorComparisons = buildScorePriors(state.items, config);
  }

  console.info('[rank] starting ranking', {
    count: state.items.length,
    sample: state.items.slice(0, 3).map((entry) => entry.title),
    comparisons: state.comparisons.length,
    priors: state.priorComparisons.length,
    scoreFormat: state.scoreFormat,
    mediaType: state.mediaType,
  });

  const wasmApi = await ensureWasm();
  try {
    const ok = wasmApi.create_ranker(state.items.length);
    if (!ok) {
      console.error('[rank] create_ranker returned false');
      setStatus(dom.importStatus, 'Failed to create ranker.');
      return;
    }
    wasmApi.set_uncertainty_prior(state.uncertaintyPrior);
    wasmApi.set_pair_policy(resolvePairPolicy());
  } catch (error) {
    console.error('[rank] create_ranker threw', error);
    setStatus(
      dom.importStatus,
      error instanceof Error
        ? `Ranker init failed: ${error.message}`
        : 'Ranker init failed.',
    );
    return;
  }

  if (state.priorComparisons.length > 0) {
    console.info('[rank] applying priors', state.priorComparisons.length);
    state.priorComparisons.forEach((entry) => {
      const ok = applyRanking(wasmApi, entry.indices);
      if (!ok) {
        console.warn('[rank] failed to apply prior', entry);
      }
    });
  }

  if (state.comparisons.length > 0) {
    console.info('[rank] replaying comparisons', state.comparisons.length);
    state.comparisons.forEach((entry) => {
      const ok = applyRanking(wasmApi, entry.indices);
      if (!ok) {
        console.warn('[rank] failed to replay comparison', entry);
      }
    });
  }

  saveState();
  updateProgress();
  if (state.modeChosen) {
    enterActiveStep();
  } else {
    showStep('mode');
  }
}
