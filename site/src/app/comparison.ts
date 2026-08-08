import { formatEntryMeta, setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { updateProgress } from './progress';
import { applyHistoryEntry } from './wasm';

type Side = 'A' | 'B';

function paintSide(side: Side, item: typeof state.items[number] | undefined) {
  const title = document.querySelector(`[data-choice-title="${side}"]`);
  const meta = document.querySelector(`[data-choice-meta="${side}"]`);
  const cover = document.querySelector<HTMLImageElement>(
    `[data-choice-cover="${side}"]`,
  );
  const fallback = document.querySelector(`[data-choice-fallback="${side}"]`);

  if (title) title.textContent = item?.title ?? 'Unknown';
  if (meta) meta.textContent = item ? formatEntryMeta(item) : '';

  // The seed score badge used to sit here. It is gone deliberately: showing the
  // prior score during a forced choice biases the answer, and the model then
  // reads that bias back as fresh evidence.

  if (!cover) return;
  // `coverArt` is the extraLarge asset. `coverImage` is a 100px thumbnail and
  // belongs to the tier-list export only; it is unusable at poster size.
  const src = item?.coverArt;
  if (src) {
    cover.onerror = () => {
      cover.classList.add('hidden');
      fallback?.classList.remove('hidden');
    };
    cover.src = src;
    cover.classList.remove('hidden');
    fallback?.classList.add('hidden');
  } else {
    cover.onerror = null;
    cover.removeAttribute('src');
    cover.classList.add('hidden');
    fallback?.classList.remove('hidden');
  }
}

function paintPair(leftIndex: number, rightIndex: number) {
  const left = state.items[leftIndex];
  const right = state.items[rightIndex];
  paintSide('A', left);
  paintSide('B', right);

  // Cover art is decided per pair, never per panel. An asymmetric pair would
  // make one option visually richer and bias a forced choice, corrupting the
  // data the Plackett-Luce model fits, so one missing poster drops both.
  if (dom.arena) {
    dom.arena.dataset.art = left?.coverArt && right?.coverArt ? 'art' : 'text';
  }
}

// Forward declaration - will be set by results module
let showResultsCallback: (() => void) | null = null;

export function setShowResultsCallback(fn: () => void) {
  showResultsCallback = fn;
}

export function renderPair() {
  if (!state.wasm || !dom.leftTitle || !dom.rightTitle) return;

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
      paintPair(leftIndex, rightIndex);
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
  paintPair(leftIndex, rightIndex);
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

  // result: 1=A wins, 2=Tie, 3=B wins — the same encoding `add_comparison`
  // takes. Routing the tie through it keeps both orderings in the model while
  // still costing one comparison and one undo step.
  const ok = state.wasm.add_comparison(left, right, result);
  if (!ok) {
    setStatus(dom.listStatus, 'Moonsorter did not record the comparison. Make the comparison again.');
    return;
  }
  state.comparisons.push(
    result === 2
      ? { indices: [left, right], tie: true }
      : { indices: result === 3 ? [right, left] : [left, right] },
  );
  saveState();
  updateProgress();
  renderPair();
}

export function undoLast() {
  if (!state.wasm) return;
  if (state.comparisons.length === 0) {
    setStatus(dom.listStatus, 'There are no comparisons to undo.');
    return;
  }
  const ok = state.wasm.undo_last();
  if (!ok) {
    setStatus(dom.listStatus, 'The undo operation failed. Try again.');
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
    setStatus(dom.listStatus, 'There are no comparisons to redo.');
    return;
  }
  const toRedo = state.redoStack.pop();
  if (!toRedo) return;

  const ok = applyHistoryEntry(state.wasm, toRedo);
  if (!ok) {
    setStatus(dom.listStatus, 'The redo operation failed. Try again.');
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
