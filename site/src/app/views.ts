import { dom, type Views, type ViewKey, type NavTarget } from './dom';
import { state } from './state';

/**
 * The app has three named views. `sort` is not a fourth destination: it is the
 * group-sort form of Compare, so the nav resolves `compare` to whichever of
 * the two the current ranking method is using.
 */
export function canCompare(): boolean {
  return !!state.wasm && state.items.length > 1;
}

export function canShowResults(): boolean {
  return !!state.lastResults;
}

/** Which comparison surface the current method wants. */
export function activeCompareView(): Extract<ViewKey, 'compare' | 'sort'> {
  return state.rankMode === 'pairwise' || state.rankPhase === 'pairwise'
    ? 'compare'
    : 'sort';
}

function navKeyFor(view: ViewKey): NavTarget {
  if (view === 'sort') return 'compare';
  return view;
}

export function sessionLabel(): string {
  if (state.items.length === 0) return '';
  const source = state.listSource ?? 'list';
  const noun = state.items.length === 1 ? 'title' : 'titles';
  return `· ${source}, ${state.items.length} ${noun}`;
}

export function updateChrome(active: ViewKey) {
  if (dom.sessionLabel) {
    dom.sessionLabel.textContent = sessionLabel();
  }
  const activeNav = navKeyFor(active);
  dom.navButtons.forEach((button) => {
    const target = button.getAttribute('data-view-target') as NavTarget | null;
    if (!target) return;
    const enabled =
      target === 'list' ||
      (target === 'compare' && canCompare()) ||
      (target === 'results' && canShowResults());
    button.disabled = !enabled;
    if (target === activeNav) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

export function showView(name: ViewKey) {
  if (dom.loading) {
    dom.loading.classList.add('hidden');
  }
  (Object.keys(dom.views) as Array<keyof Views>).forEach((key) => {
    dom.views[key]?.classList.toggle('hidden', key !== name);
  });
  updateChrome(name);
}

/**
 * Nav-bar navigation. Unreachable targets fall back to the nearest view that
 * is actually available and say why, rather than showing an empty screen.
 */
export function navigateView(target: NavTarget) {
  if (target === 'compare') {
    if (!canCompare()) {
      showView('list');
      if (dom.listStatus) {
        dom.listStatus.textContent =
          'Import a list first. Then choose a method and start comparing.';
      }
      return;
    }
    showView(activeCompareView());
    return;
  }
  if (target === 'results' && !canShowResults()) {
    showView(canCompare() ? activeCompareView() : 'list');
    if (dom.listStatus) {
      dom.listStatus.textContent = 'Answer a few comparisons to see results.';
    }
    return;
  }
  showView(target);
}
