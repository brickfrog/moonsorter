import { dom } from './dom';
import { state } from './state';

export function updateGroupCoverage() {
  if (!dom.groupCoverage && !dom.groupEstimate) return;
  const total = state.items.length;
  if (total <= 0) {
    if (dom.groupCoverage) {
      dom.groupCoverage.textContent =
        'Coverage: 0 / 0 titles touched (0 remaining)';
    }
    if (dom.groupEstimate) {
      dom.groupEstimate.textContent =
        'Baseline target: ~0 group sorts (~2x touches).';
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
    dom.groupCoverage.textContent = `Coverage: ${covered} / ${total} titles touched (${remaining} remaining)`;
  }

  if (dom.groupEstimate) {
    const groupSize = state.currentGroup ? state.currentGroup.length : Math.min(5, total);
    const targetTouches = total * 2;
    const estimatedSorts =
      groupSize > 0 ? Math.ceil(targetTouches / groupSize) : 0;
    const avgTouches = totalTouches / total;
    dom.groupEstimate.textContent = `Baseline target: ~${estimatedSorts} group sorts (~${avgTouches.toFixed(1)}x touches so far).`;
  }
}

function paintProgress(completed: number, estimated: number) {
  if (!dom.progressText || !dom.progressFill || !dom.progressMeta) return;
  const pct =
    estimated > 0 ? Math.min(100, Math.round((completed / estimated) * 100)) : 0;
  dom.progressFill.style.width = `${pct}%`;

  const track = document.querySelector('[data-progress-track]');
  if (track) {
    track.setAttribute('aria-valuenow', pct.toString());
    track.setAttribute(
      'aria-valuetext',
      estimated > 0 ? `${completed} of ${estimated} comparisons` : 'No comparisons yet',
    );
  }

  // Color code based on completion percentage
  dom.progressFill.classList.remove('progress-low', 'progress-medium', 'progress-high');
  if (pct < 30) {
    dom.progressFill.classList.add('progress-low');
  } else if (pct < 70) {
    dom.progressFill.classList.add('progress-medium');
  } else {
    dom.progressFill.classList.add('progress-high');
  }

  dom.progressText.textContent = `${completed} / ${estimated} comparisons`;
  const metaSpan = dom.progressMeta.querySelector('span');
  if (metaSpan) {
    metaSpan.textContent = `Estimated total: ${estimated} comparisons`;
  } else {
    dom.progressMeta.textContent = `Estimated total: ${estimated} comparisons`;
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
