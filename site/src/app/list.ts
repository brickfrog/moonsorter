import type { Entry } from '../lib/types';
import { estimateTotalComparisons } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';

/**
 * Below two titles there is no pair to compare, so there is no estimate to
 * show.
 */
function headline(count: number): string {
  if (count < 2) return 'Rank a list by pairwise comparison';
  // Must be the ranker's own estimate, not an independent n·log(n): the
  // Compare strip counts towards `get_progress_estimated`, and a headline
  // promising a different total makes one session advertise two targets.
  const questions = estimateTotalComparisons(count);
  return `${count} titles · ~${questions} comparisons`;
}

function listRow(entry: Entry, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'list-row';

  const main = document.createElement('span');
  main.className = 'list-row-main';

  const ordinal = document.createElement('span');
  ordinal.className = 'list-index';
  ordinal.textContent = String(index + 1);

  const title = document.createElement('span');
  title.className = 'list-title';
  title.textContent = entry.title;

  main.append(ordinal, title);

  const seed = document.createElement('span');
  seed.className = 'list-seed';
  // An em dash, not `0`: an unscored title has no seed, and a zero would read
  // as the worst score on the scale rather than the absence of one.
  seed.textContent = entry.score > 0 ? String(entry.score) : '—';

  row.append(main, seed);
  return row;
}

/**
 * Repaints everything on the List view that depends on the loaded list.
 * Call it after an import, after a session restore and on first load.
 */
export function updateListView() {
  // Titles that are ranked already, else the ones an import has staged.
  const entries: Entry[] =
    state.items.length > 0 ? state.items : state.pendingStart?.list ?? [];
  const count = entries.length;

  if (dom.listHeadline) {
    dom.listHeadline.textContent = headline(count);
  }
  if (dom.listCount) {
    dom.listCount.textContent = count > 0 ? ` · ${count}` : '';
  }
  if (dom.startButton) {
    dom.startButton.disabled = count < 2;
  }
  if (!dom.listBody) return;

  if (count === 0) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'Nothing imported yet.';
    dom.listBody.replaceChildren(empty);
    return;
  }
  dom.listBody.replaceChildren(...entries.map(listRow));
}
