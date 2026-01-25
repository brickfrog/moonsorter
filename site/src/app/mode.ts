import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { showStep } from './steps';
import { updatePairPolicy } from './wasm';
import { updateModeUI, startGroupSort } from './group';
import { renderPair } from './comparison';
import type { RankGoal, RankMode, StartOptions } from '../lib/types';

// Forward declaration for startRanking
let startRankingCallback: ((options: StartOptions) => Promise<void>) | null = null;

export function setStartRankingCallback(fn: (options: StartOptions) => Promise<void>) {
  startRankingCallback = fn;
}

export function setImportPath(path: 'anilist' | 'csv') {
  state.importPath = path;
  if (dom.importTitle) {
    dom.importTitle.textContent = path === 'csv' ? 'Upload your CSV' : 'Import your list';
  }
  if (dom.importDesc) {
    dom.importDesc.textContent =
      path === 'csv'
        ? 'Select a CSV file with title and score columns.'
        : 'Pull your AniList items, then choose how much to rank now.';
  }
  dom.importPathElements.forEach((el) => {
    const elPath = el.getAttribute('data-import-path');
    el.style.display = elPath === path ? '' : 'none';
  });
}

export function enterActiveStep() {
  updatePairPolicy();
  if (state.rankMode === 'pairwise' || state.rankPhase === 'pairwise') {
    state.rankPhase = 'pairwise';
    updateModeUI();
    showStep('compare');
    renderPair();
    return;
  }
  state.rankPhase = 'group';
  startGroupSort();
}

export async function applyModeSelection(goal: RankGoal, mode: RankMode) {
  state.rankGoal = goal;
  state.rankMode = mode;
  state.rankObjective =
    goal === 'scratch'
      ? dom.scratchGoal?.value === 'top-k'
        ? 'top-k'
        : 'full'
      : 'full';
  state.modeChosen = true;
  if (goal === 'scratch') {
    state.useScorePrior = false;
    if (dom.useScorePrior) dom.useScorePrior.checked = false;
  } else {
    state.useScorePrior = true;
    if (dom.useScorePrior) dom.useScorePrior.checked = true;
  }

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
        dom.importStatus,
        error instanceof Error ? error.message : 'Failed to start ranking.',
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
