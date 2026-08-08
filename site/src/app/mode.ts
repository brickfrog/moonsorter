import { getToken } from '../lib/auth';
import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { showView } from './views';
import { updatePairPolicy } from './wasm';
import { updateModeUI, startGroupSort } from './group';
import { renderPair } from './comparison';
import type { RankMode, StartOptions } from '../lib/types';

// Forward declaration for startRanking
let startRankingCallback: ((options: StartOptions) => Promise<void>) | null = null;

export function setStartRankingCallback(fn: (options: StartOptions) => Promise<void>) {
  startRankingCallback = fn;
}

/**
 * "Import from AniList" and "Disconnect" are meaningless without a token, and
 * "Connect AniList" is noise once you have one. Runs after the import-path
 * pass because both rules drive the same `hidden` class and auth wins.
 */
export function updateAuthUi() {
  const connected = Boolean(getToken());
  dom.authGated.forEach((el) => {
    const requirement = el.getAttribute('data-requires');
    el.classList.toggle(
      'hidden',
      requirement === 'connected' ? !connected : connected,
    );
  });
}

export function setImportPath(path: 'anilist' | 'csv') {
  state.importPath = path;
  dom.anilistOnly.forEach((el) => el.classList.toggle('hidden', path !== 'anilist'));
  dom.csvOnly.forEach((el) => el.classList.toggle('hidden', path !== 'csv'));
  updateAuthUi();
}

export function enterActiveStep() {
  updatePairPolicy();
  if (state.rankMode === 'pairwise' || state.rankPhase === 'pairwise') {
    state.rankPhase = 'pairwise';
    updateModeUI();
    showView('compare');
    renderPair();
    return;
  }
  state.rankPhase = 'group';
  startGroupSort();
}

export async function applyModeSelection(mode: RankMode) {
  // The method radios carry interaction style only. "Use existing scores as
  // priors" is the whole rescore-vs-scratch decision now, so read the goal
  // back off the checkbox instead of pairing a goal with every method.
  const useScorePrior = dom.useScorePrior?.checked ?? true;
  state.useScorePrior = useScorePrior;
  state.rankGoal = useScorePrior ? 'rescore' : 'scratch';
  state.rankMode = mode;
  state.rankObjective =
    state.rankGoal === 'scratch'
      ? dom.scratchGoal?.value === 'top-k'
        ? 'top-k'
        : 'full'
      : 'full';
  state.modeChosen = true;

  const startOptions = state.pendingStart;
  if (startOptions && startRankingCallback) {
    state.pendingStart = null;
    try {
      await startRankingCallback({
        ...startOptions,
        useScorePrior: state.useScorePrior,
        rankGoal: state.rankGoal,
        rankMode: state.rankMode,
        rankPhase: state.rankMode === 'pairwise' ? 'pairwise' : 'group',
        rankObjective: state.rankObjective,
        modeChosen: state.modeChosen,
      });
    } catch (error) {
      setStatus(
        dom.listStatus,
        error instanceof Error ? error.message : 'Moonsorter did not start the ranking. Try again.',
      );
    }
    return;
  }

  if (state.rankMode === 'pairwise') {
    state.rankPhase = 'pairwise';
  } else {
    state.rankPhase = 'group';
  }
  updatePairPolicy();
  saveState();
  enterActiveStep();
}
