import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { showResults } from './results';

function parseIntInput(
  value: string | null | undefined,
  fallback: number,
  min: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const asInt = Math.floor(parsed);
  return asInt < min ? min : asInt;
}

export function runAnalysis() {
  if (!state.wasm) {
    setStatus(dom.importStatus, 'Load the ranker first.');
    return;
  }
  state.analysisSamples = parseIntInput(dom.analysisSamples?.value, state.analysisSamples, 10);
  state.analysisTopK = parseIntInput(dom.analysisTopK?.value, state.analysisTopK, 1);
  state.analysisMaxIter = parseIntInput(dom.analysisMaxIter?.value, state.analysisMaxIter, 5);
  if (dom.analysisStatus) {
    dom.analysisStatus.textContent = 'Running uncertainty analysis...';
  }
  state.wasm.set_sampling_seed(Date.now());
  const ok = state.wasm.compute_uncertainty(
    state.analysisSamples,
    state.analysisMaxIter,
    state.analysisTopK,
  );
  if (!ok) {
    if (dom.analysisStatus) {
      dom.analysisStatus.textContent = 'Uncertainty analysis failed.';
    }
    return;
  }
  state.analysisComputedAt = new Date().toISOString();
  if (dom.analysisStatus) {
    dom.analysisStatus.textContent = `Uncertainty ready (${state.analysisSamples} samples).`;
  }
  showResults();
}

export function handleFinish() {
  if (!state.wasm) return;
  const completed = state.wasm.get_progress_completed();
  const estimated = state.wasm.get_progress_estimated();
  const completion = estimated > 0 ? completed / estimated : 0;

  // Warn if less than 30% complete and haven't warned yet
  if (completion < 0.3 && !state.earlyFinishWarned) {
    const pct = Math.round(completion * 100);
    if (dom.earlyFinishModal && dom.earlyFinishMessage) {
      dom.earlyFinishMessage.textContent = `Only ${pct}% complete (${completed} of ~${estimated} comparisons). ` +
        `Results may be unreliable with this few comparisons.`;
      dom.earlyFinishModal.classList.remove('hidden');
      return;
    }
  }

  showResults();
}
