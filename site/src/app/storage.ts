import type { SavedState } from '../lib/types';
import { state, STATE_KEY } from './state';
import { dom } from './dom';

export function saveState() {
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
    rankGoal: state.rankGoal,
    rankMode: state.rankMode,
    rankPhase: state.rankPhase,
    rankObjective: state.rankObjective,
    modeChosen: state.modeChosen,
    optInTierList: dom.optInTierList?.checked ?? true,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(payload));
}

export function loadState(): SavedState | null {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedState;
    if (!parsed.items || !parsed.comparisons) return null;
    return {
      ...parsed,
      mediaType: parsed.mediaType === 'MANGA' ? 'MANGA' : 'ANIME',
      importMode: parsed.importMode ?? 'all',
      sliceCount: Number.isFinite(parsed.sliceCount) ? parsed.sliceCount : 20,
      useScorePrior: parsed.useScorePrior ?? true,
      explorationEpsilon: Number.isFinite(parsed.explorationEpsilon)
        ? parsed.explorationEpsilon
        : 0.1,
      uncertaintyPrior: Number.isFinite(parsed.uncertaintyPrior)
        ? parsed.uncertaintyPrior
        : 1.0,
      rankGoal: parsed.rankGoal === 'scratch' ? 'scratch' : 'rescore',
      rankMode:
        parsed.rankMode === 'group' || parsed.rankMode === 'group-pairwise'
          ? parsed.rankMode
          : 'pairwise',
      rankPhase: parsed.rankPhase === 'group' ? 'group' : 'pairwise',
      rankObjective: parsed.rankObjective === 'top-k' ? 'top-k' : 'full',
      modeChosen: parsed.modeChosen ?? false,
      optInTierList: parsed.optInTierList ?? true,
    };
  } catch (error) {
    console.error('[rank] failed to parse saved state', error);
    return null;
  }
}

export function clearStoredState() {
  localStorage.removeItem(STATE_KEY);
}
