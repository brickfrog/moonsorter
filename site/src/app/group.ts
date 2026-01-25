import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { updateProgress, updateGroupCoverage } from './progress';
import { applyRanking } from './wasm';
import { showStep } from './steps';
import { renderPair } from './comparison';

export function buildRandomGroup(size: number): number[] {
  const pool = Array.from({ length: state.items.length }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export function updateModeUI() {
  if (!dom.switchToPairwise) return;
  const showSwitch =
    state.rankMode === 'group-pairwise' && state.rankPhase === 'group';
  dom.switchToPairwise.classList.toggle('hidden', !showSwitch);
  if (dom.analysisResumeButton) {
    dom.analysisResumeButton.textContent =
      state.rankMode === 'pairwise' || state.rankPhase === 'pairwise'
        ? 'Keep comparing'
        : 'Keep ranking';
  }
}

export function renderSortGroup() {
  const container = dom.sortableList;
  if (!container || !state.currentGroup) return;
  container.innerHTML = '';

  state.currentGroup.forEach((idx, i) => {
    const item = state.items[idx];
    if (!item) return;

    const li = document.createElement('li');
    li.className = 'sortable-item';
    li.draggable = true;
    li.dataset.index = idx.toString();

    li.innerHTML = `
      <div class="rank-badge">${i + 1}</div>
      <div class="item-title">${item.title}</div>
      <div class="drag-handle">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </div>
    `;

    li.addEventListener('dragstart', () => li.classList.add('dragging'));
    li.addEventListener('dragend', () => li.classList.remove('dragging'));

    container.appendChild(li);
  });

  container.ondragover = (event) => {
    event.preventDefault();
    const draggingItem = container.querySelector('.dragging');
    if (!draggingItem) return;
    const siblings = Array.from(
      container.querySelectorAll('.sortable-item:not(.dragging)'),
    );
    const nextSibling = siblings.find((sibling) => {
      const box = sibling.getBoundingClientRect();
      return event.clientY <= box.top + box.height / 2;
    });
    container.insertBefore(draggingItem, nextSibling || null);

    container.querySelectorAll('.rank-badge').forEach((badge, i) => {
      badge.textContent = (i + 1).toString();
    });
  };
}

export function startGroupSort() {
  if (state.items.length < 2) return;
  const size = Math.min(5, state.items.length);
  state.currentGroup = buildRandomGroup(size);
  updateGroupCoverage();
  updateModeUI();
  showStep('sortGroup');
  renderSortGroup();
}

export function submitSort() {
  if (!state.wasm || !state.currentGroup) return;
  const container = dom.sortableList;
  if (!container) return;

  const orderedIndices = Array.from(container.querySelectorAll('.sortable-item'))
    .map(li => parseInt((li as HTMLElement).dataset.index || '0', 10));

  if (orderedIndices.length < 2) return;

  const ok = applyRanking(state.wasm, orderedIndices);
  if (!ok) {
    setStatus(dom.importStatus, 'Failed to record group ranking.');
    return;
  }

  state.comparisons.push({ indices: orderedIndices });
  saveState();
  updateProgress();
  state.currentGroup = null;
  if (state.rankMode === 'group' || state.rankPhase === 'group') {
    startGroupSort();
    return;
  }
  showStep('compare');
  renderPair();
}

export function skipSort() {
  state.currentGroup = null;
  if (state.rankMode === 'group' || state.rankPhase === 'group') {
    startGroupSort();
    return;
  }
  showStep('compare');
  renderPair();
}
