import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { updateProgress } from './progress';
import { applyRanking } from './wasm';

function updatePairMetadata(leftIndex: number, rightIndex: number) {
  const leftMeta = document.querySelector('[data-choice-meta="A"]');
  const rightMeta = document.querySelector('[data-choice-meta="B"]');
  const leftItem = state.items[leftIndex];
  const rightItem = state.items[rightIndex];

  if (leftMeta && leftItem) {
    const parts: string[] = [];
    const year = leftItem.airedYear || leftItem.seasonYear || leftItem.startedAtYear;
    if (year) parts.push(`${year}`);
    if (leftItem.score > 0) parts.push(`Original: ${leftItem.score}`);
    if (parts.length > 0) {
      leftMeta.textContent = parts.join(' \u2022 ');
      leftMeta.classList.remove('hidden');
    } else {
      leftMeta.classList.add('hidden');
    }
  }

  if (rightMeta && rightItem) {
    const parts: string[] = [];
    const year = rightItem.airedYear || rightItem.seasonYear || rightItem.startedAtYear;
    if (year) parts.push(`${year}`);
    if (rightItem.score > 0) parts.push(`Original: ${rightItem.score}`);
    if (parts.length > 0) {
      rightMeta.textContent = parts.join(' \u2022 ');
      rightMeta.classList.remove('hidden');
    } else {
      rightMeta.classList.add('hidden');
    }
  }
}

function updatePairStrategyBadge() {
  const badge = dom.pairStrategyBadge;
  if (!badge) return;

  // Epsilon controls exploration: high = random, low = focused
  if (state.explorationEpsilon >= 0.25) {
    badge.textContent = '\uD83C\uDFB2 Random exploration';
    badge.classList.remove('hidden');
  } else if (state.explorationEpsilon >= 0.1) {
    badge.textContent = '\uD83D\uDCCA Balanced sampling';
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '\uD83C\uDFAF Uncertainty-focused';
    badge.classList.remove('hidden');
  }
}

// Forward declaration - will be set by results module
let showResultsCallback: (() => void) | null = null;

export function setShowResultsCallback(fn: () => void) {
  showResultsCallback = fn;
}

export function renderPair() {
  if (!state.wasm || !dom.leftTitle || !dom.rightTitle) return;
  updatePairStrategyBadge();

  if (state.focusPair) {
    const [leftIndex, rightIndex] = state.focusPair;
    state.focusPair = null;
    if (
      leftIndex >= 0 &&
      rightIndex >= 0 &&
      leftIndex < state.items.length &&
      rightIndex < state.items.length &&
      leftIndex !== rightIndex
    ) {
      state.currentPair = [leftIndex, rightIndex];
      dom.leftTitle.textContent = state.items[leftIndex]?.title ?? 'Unknown';
      dom.rightTitle.textContent = state.items[rightIndex]?.title ?? 'Unknown';
      updatePairMetadata(leftIndex, rightIndex);
      return;
    }
  }
  const encoded = state.wasm.get_next_pair_encoded(
    state.explorationEpsilon,
    Math.random(),
  );
  if (encoded < 0) {
    if (showResultsCallback) showResultsCallback();
    return;
  }
  const leftIndex = Math.floor(encoded / state.items.length);
  const rightIndex = encoded % state.items.length;
  if (leftIndex < 0 || rightIndex < 0) {
    console.warn('[rank] invalid pair encoded', encoded);
    return;
  }
  state.currentPair = [leftIndex, rightIndex];
  dom.leftTitle.textContent = state.items[leftIndex]?.title ?? 'Unknown';
  dom.rightTitle.textContent = state.items[rightIndex]?.title ?? 'Unknown';
  updatePairMetadata(leftIndex, rightIndex);
}

export function handleChoice(result: number) {
  if (!state.wasm || !state.currentPair) return;
  const [left, right] = state.currentPair;

  // Add visual feedback for selected choice
  const choiceMap: Record<number, string> = { 1: 'A', 2: 'TIE', 3: 'B' };
  const btn = document.querySelector(`[data-choice="${choiceMap[result]}"]`);
  if (btn) {
    btn.classList.add('choice-selected');
    setTimeout(() => btn.classList.remove('choice-selected'), 300);
  }

  // Clear redo stack on new comparison
  state.redoStack = [];
  updateRedoButton();

  // result: 1=A wins, 2=Tie, 3=B wins
  let indices: number[];
  if (result === 1) {
    indices = [left, right];
  } else if (result === 3) {
    indices = [right, left];
  } else {
    // Tie handles by adding both directions (approximate)
    indices = [left, right];
    const ok1 = applyRanking(state.wasm, [left, right]);
    const ok2 = applyRanking(state.wasm, [right, left]);
    if (!ok1 || !ok2) {
      setStatus(dom.importStatus, 'Failed to record tie.');
      return;
    }
    state.comparisons.push({ indices: [left, right] });
    state.comparisons.push({ indices: [right, left] });
    saveState();
    updateProgress();
    renderPair();
    return;
  }

  const ok = applyRanking(state.wasm, indices);
  if (!ok) {
    setStatus(dom.importStatus, 'Failed to record comparison.');
    return;
  }
  state.comparisons.push({ indices });
  saveState();
  updateProgress();
  renderPair();
}

export function undoLast() {
  if (!state.wasm) return;
  if (state.comparisons.length === 0) {
    setStatus(dom.importStatus, 'No comparisons to undo yet.');
    return;
  }
  const ok = state.wasm.undo_last();
  if (!ok) {
    setStatus(dom.importStatus, 'Undo failed.');
    return;
  }
  const undone = state.comparisons.pop();
  if (undone) {
    state.redoStack.push(undone);
  }
  saveState();
  updateProgress();
  renderPair();
  updateRedoButton();
}

export function redoLast() {
  if (!state.wasm) return;
  if (state.redoStack.length === 0) {
    setStatus(dom.importStatus, 'Nothing to redo.');
    return;
  }
  const toRedo = state.redoStack.pop();
  if (!toRedo) return;

  const ok = applyRanking(state.wasm, toRedo.indices);
  if (!ok) {
    setStatus(dom.importStatus, 'Redo failed.');
    state.redoStack.push(toRedo); // put it back
    return;
  }
  state.comparisons.push(toRedo);
  saveState();
  updateProgress();
  renderPair();
  updateRedoButton();
}

export function updateRedoButton() {
  const redoBtn = document.querySelector('[data-action="redo"]');
  if (redoBtn) {
    (redoBtn as HTMLButtonElement).disabled = state.redoStack.length === 0;
  }
}
