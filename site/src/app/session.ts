import { getToken } from '../lib/auth';
import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state, resetState } from './state';
import { loadState, clearStoredState } from './storage';
import { showStep } from './steps';
import { startRanking } from './ranking';

export function resumeSession(): boolean {
  const saved = loadState();
  if (!saved) {
    setStatus(dom.sessionStatus, 'No saved session found.');
    return false;
  }
  state.pendingStart = null;

  if (dom.includeUnscored) dom.includeUnscored.checked = saved.includeUnscored;
  if (dom.preserveRange) dom.preserveRange.checked = saved.preserveRange;
  if (dom.scoreFormat) dom.scoreFormat.value = saved.scoreFormat;
  if (dom.mediaType) dom.mediaType.value = saved.mediaType;
  if (dom.importMode && saved.importMode) dom.importMode.value = saved.importMode;
  if (dom.importCount && Number.isFinite(saved.sliceCount)) {
    dom.importCount.value = saved.sliceCount.toString();
  }
  if (dom.useScorePrior) dom.useScorePrior.checked = saved.useScorePrior;
  if (dom.exploration) dom.exploration.value = saved.explorationEpsilon.toString();
  if (dom.uncertaintyPrior) {
    dom.uncertaintyPrior.value = saved.uncertaintyPrior.toString();
  }
  if (dom.scratchGoal && saved.rankObjective) {
    dom.scratchGoal.value = saved.rankObjective;
  }

  const resolvedModeChosen = saved.modeChosen ?? true;
  startRanking({
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
    modeChosen: resolvedModeChosen,
  }).then(() => {
    if (saved.optInTierList != null && dom.optInTierList) {
      dom.optInTierList.checked = saved.optInTierList;
    }
    setStatus(dom.sessionStatus, 'Session resumed.');
  })
    .catch((error) => {
      setStatus(
        dom.sessionStatus,
        error instanceof Error ? error.message : 'Resume failed.',
      );
    });
  return true;
}

export function clearSession() {
  const modal = dom.startOverModal;
  if (modal) {
    modal.classList.remove('hidden');
  }
}

export function performClearSession() {
  clearStoredState();
  resetState();
  if (dom.analysisStatus) {
    dom.analysisStatus.textContent = '';
  }
  setStatus(dom.sessionStatus, 'Session cleared.');
  showStep(getToken() ? 'import' : 'connect');
}
