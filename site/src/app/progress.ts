import { dom } from './dom';
import { state } from './state';

export function updateGroupCoverage() {
  if (!dom.groupCoverage && !dom.groupEstimate) return;
  const total = state.items.length;
  if (total <= 0) {
    if (dom.groupCoverage) {
      dom.groupCoverage.textContent =
        'Coverage: 0 / 0 titles compared (0 not compared)';
    }
    if (dom.groupEstimate) {
      dom.groupEstimate.textContent =
        'Baseline target: ~0 group sorts (~2 sorts per title).';
    }
    return;
  }

  const touched = new Set<number>();
  let totalTouches = 0;
  for (const entry of state.comparisons) {
    totalTouches += entry.indices.length;
    for (const idx of entry.indices) {
      touched.add(idx);
    }
  }

  const covered = touched.size;
  const remaining = Math.max(0, total - covered);
  if (dom.groupCoverage) {
    dom.groupCoverage.textContent = `Coverage: ${covered} / ${total} titles compared (${remaining} not compared)`;
  }

  if (dom.groupEstimate) {
    const groupSize = state.currentGroup ? state.currentGroup.length : Math.min(5, total);
    const targetTouches = total * 2;
    const estimatedSorts =
      groupSize > 0 ? Math.ceil(targetTouches / groupSize) : 0;
    const avgTouches = totalTouches / total;
    dom.groupEstimate.textContent = `Baseline target: ~${estimatedSorts} group sorts (~${avgTouches.toFixed(1)} sorts per title now).`;
  }
}

function paintProgress(completed: number, estimated: number) {
  if (!dom.progressCount || !dom.progressFill) return;
  const pct =
    estimated > 0 ? Math.min(100, Math.round((completed / estimated) * 100)) : 0;
  dom.progressFill.style.width = `${pct}%`;

  if (dom.progressTrack) {
    dom.progressTrack.setAttribute('aria-valuenow', pct.toString());
    dom.progressTrack.setAttribute(
      'aria-valuetext',
      estimated > 0 ? `${completed} of ${estimated} comparisons` : 'No comparisons are complete yet.',
    );
  }

  dom.progressCount.textContent = `${completed} of ~${estimated} answered`;

  if (dom.progressCI) {
    // The bootstrap only produces a median width once an analysis has run;
    // until then the design omits the figure rather than showing a placeholder.
    const ranker = state.wasm;
    dom.progressCI.textContent =
      ranker && ranker.get_uncertainty_ready()
        ? `median CI ±${ranker.get_uncertainty_median_width()}`
        : '';
  }
}

export function updateProgress() {
  updateGroupCoverage();
  // No ranker (fresh load, or after "Start over"): render an explicit zero state
  // instead of leaving the bar frozen at the previous session's width.
  if (!state.wasm) {
    paintProgress(0, 0);
    return;
  }
  paintProgress(
    state.wasm.get_progress_completed(),
    state.wasm.get_progress_estimated(),
  );
}
