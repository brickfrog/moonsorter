import type { SavedState } from '../lib/types';
import { state, STATE_KEY } from './state';

/** Bump when the persisted shape changes incompatibly. */
export const SESSION_VERSION = 1;

/**
 * The single definition of a persisted session. localStorage and the
 * downloadable `.session` file both serialise this, so the two cannot drift.
 */
export function buildSavedState(): SavedState {
  return {
    version: SESSION_VERSION,
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
  };
}

/**
 * Fills in defaults for fields added after a session was written, so an old
 * payload from localStorage or a `.session` file resumes with sane settings
 * instead of `undefined` leaking into the ranker.
 */
export function normalizeSavedState(parsed: SavedState): SavedState {
  return {
    ...parsed,
    version: SESSION_VERSION,
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
  };
}

export function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(buildSavedState()));
  } catch (error) {
    // Persistence is best-effort: callers must still update the comparison UI
    // and retain the current ranking (which can be downloaded as a session).
    console.warn('[rank] could not save session; ranking remains in memory', error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHistory(value: unknown, itemCount: number): boolean {
  return Array.isArray(value) && value.every((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.indices)) return false;
    const indices = entry.indices;
    return indices.length >= 2 &&
      indices.every((index) => Number.isInteger(index) && index >= 0 && index < itemCount) &&
      new Set(indices).size === indices.length &&
      (entry.tie === undefined || typeof entry.tie === 'boolean') &&
      (entry.tie !== true || indices.length === 2);
  });
}

/** Validate before replay; never drop titles and shift recorded indices. */
function isSavedState(value: unknown): value is SavedState {
  if (!isRecord(value)) return false;
  if (value.version !== undefined && value.version !== SESSION_VERSION) return false;
  if (!Array.isArray(value.items) || !value.items.every((item) =>
    isRecord(item) && typeof item.title === 'string' && item.title.trim().length > 0,
  )) return false;
  if (!isHistory(value.comparisons, value.items.length)) return false;
  // Sessions predating score priors may omit this field.
  if (value.priorComparisons !== undefined &&
    !isHistory(value.priorComparisons, value.items.length)) return false;
  for (const key of ['preserveRange', 'includeUnscored', 'useScorePrior', 'modeChosen']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
  }
  for (const key of ['scoreFormat', 'importMode']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  return true;
}

export function loadState(): SavedState | null {
  try {
    // Accessing localStorage itself can throw when browser policy blocks it.
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSavedState(parsed)) return null;
    return normalizeSavedState({
      ...parsed,
      priorComparisons: parsed.priorComparisons ?? [],
      scoreFormat: parsed.scoreFormat ?? 'POINT_10',
      preserveRange: parsed.preserveRange ?? true,
      includeUnscored: parsed.includeUnscored ?? false,
    });
  } catch (error) {
    console.warn('[rank] could not read saved session', error);
    return null;
  }
}

export function clearStoredState() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch (error) {
    // A blocked remove must not prevent Start over from resetting app state.
    console.warn('[rank] could not remove saved session', error);
  }
}
