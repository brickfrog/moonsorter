import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state, resetState } from './state';
import { loadState, clearStoredState } from './storage';
import { showView } from './views';
import { openModal } from './modal';
import { updateProgress } from './progress';
import { updateListView } from './list';
import { startRanking } from './ranking';

export function resumeSession(): boolean {
  const saved = loadState();
  if (!saved) {
    setStatus(dom.listStatus, 'There is no saved session.');
    return false;
  }
  state.pendingStart = null;
  state.listSource = 'saved session';

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
  })
    .then(() => {
      setStatus(dom.listStatus, 'Moonsorter resumed the session.');
    })
    .catch((error) => {
      setStatus(
        dom.listStatus,
        error instanceof Error ? error.message : 'The resume failed. Try again.',
      );
    });
  return true;
}

export function clearSession() {
  if (dom.startOverModal) {
    openModal(dom.startOverModal);
  }
}

export function performClearSession() {
  clearStoredState();
  resetState();
  if (dom.analysisStatus) {
    dom.analysisStatus.textContent = '';
  }
  setStatus(dom.listStatus, 'Moonsorter cleared the session.');
  // resetState() drops the ranker, so the progress bar would otherwise keep
  // showing the cleared session's counts.
  updateProgress();
  // resetState() also emptied the list, so the headline, the count and the
  // start button all still describe the session that just went away.
  updateListView();
  showView('list');
}
