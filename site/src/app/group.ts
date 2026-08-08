import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import { saveState } from './storage';
import { updateProgress, updateGroupCoverage } from './progress';
import { applyRanking } from './wasm';
import { showView } from './views';
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
  if (dom.resumeButton) {
    dom.resumeButton.textContent =
      state.rankMode === 'pairwise' || state.rankPhase === 'pairwise'
        ? 'Continue the comparisons'
        : 'Continue the group sorts';
  }
}

function renumberRankBadges(container: Element) {
  container.querySelectorAll('.rank-badge').forEach((badge, i) => {
    badge.textContent = (i + 1).toString();
  });
}

/** Moves `item` one slot up (-1) or down (+1); no-op at the edges of the list. */
function moveSortItem(container: Element, item: HTMLElement, delta: number) {
  const items = Array.from(container.querySelectorAll<HTMLElement>('.sortable-item'));
  const from = items.indexOf(item);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return;

  const neighbour = items[to];
  container.insertBefore(item, delta < 0 ? neighbour : neighbour.nextSibling);
  renumberRankBadges(container);
  // Re-inserting a node drops focus, so restore it on the item the user moved.
  item.focus();

  const title = item.querySelector('.item-title')?.textContent ?? 'Title';
  setStatus(dom.sortLive, `${title} moved to position ${to + 1} of ${items.length}.`);
}

function handleSortKeydown(container: Element, event: KeyboardEvent) {
  const source = event.target;
  if (!(source instanceof HTMLElement)) return;
  const item = source.closest<HTMLElement>('.sortable-item');
  if (!item || item.parentElement !== container) return;

  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? -1 : 1;
    if (event.altKey || event.ctrlKey) {
      moveSortItem(container, item, delta);
      return;
    }
    const items = Array.from(container.querySelectorAll<HTMLElement>('.sortable-item'));
    items[items.indexOf(item) + delta]?.focus();
    return;
  }

  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const items = Array.from(container.querySelectorAll<HTMLElement>('.sortable-item'));
    const edge = event.key === 'Home' ? items[0] : items[items.length - 1];
    edge?.focus();
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
    li.tabIndex = 0;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.index = idx.toString();

    const badge = document.createElement('div');
    badge.className = 'rank-badge';
    badge.textContent = String(i + 1);

    const title = document.createElement('div');
    title.className = 'item-title';
    // textContent, not innerHTML: titles come from arbitrary CSV input.
    title.textContent = item.title;

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

    li.append(badge, title, handle);

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

    renumberRankBadges(container);
  };

  container.onkeydown = (event) => handleSortKeydown(container, event);
}

export function startGroupSort() {
  if (state.items.length < 2) return;
  const size = Math.min(5, state.items.length);
  state.currentGroup = buildRandomGroup(size);
  updateGroupCoverage();
  updateModeUI();
  showView('sort');
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
    // `dom.listStatus` lives in the List view, which is hidden while sorting —
    // the announcer is the only slot the user can perceive from this screen.
    setStatus(dom.sortLive, 'Moonsorter did not record the group sort. Do the group sort again.');
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
  showView('compare');
  renderPair();
}

export function skipSort() {
  state.currentGroup = null;
  if (state.rankMode === 'group' || state.rankPhase === 'group') {
    startGroupSort();
    return;
  }
  showView('compare');
  renderPair();
}
