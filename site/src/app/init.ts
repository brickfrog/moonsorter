import { consumeAuthResponse, getToken } from '../lib/auth';
import { setStatus } from '../lib/utils';
import { demoItems } from '../lib/demo';
import { dom } from './dom';
import { state } from './state';
import { showView } from './views';
import { setImportPath } from './mode';
import { readMediaType } from './config';
import { startRanking } from './ranking';
import { updateListView } from './list';

export function initFlow() {
  const hasToken = getToken();
  console.info('[rank] token present:', Boolean(hasToken));
  const params = new URLSearchParams(window.location.search);
  const importParam = params.get('import');
  if (params.get('demo') === '1') {
    // The demo skips the List view outright: `startRanking` runs with a
    // method already chosen, so it lands on the comparison surface.
    state.listSource = 'demo list';
    startRanking({
      list: demoItems,
      scoreFormat: state.scoreFormat,
      preserveRange: state.preserveRange,
      includeUnscored: state.includeUnscored,
      mediaType: readMediaType(),
      useScorePrior: false,
      importMode: 'all',
      sliceCount: demoItems.length,
      rankGoal: 'scratch',
      rankMode: 'pairwise',
      modeChosen: true,
    }).catch((error) => {
      // The status line lives in the List view, and this path never opened
      // one — without this the reader is left staring at the loading note.
      showView('list');
      setStatus(
        dom.listStatus,
        error instanceof Error ? error.message : 'The demo did not start. Reload the page and try again.',
      );
    });
    state.currentFilters = {};
    return;
  }

  // Every other entry point is the same screen; only the visible import
  // controls and the opening line of guidance differ.
  setImportPath(importParam === 'csv' ? 'csv' : 'anilist');
  updateListView();
  showView('list');
  if (importParam === 'csv') {
    setStatus(dom.listStatus, 'Open Advanced, select a CSV file, then press Import from CSV.');
  } else if (!hasToken && importParam === 'anilist') {
    setStatus(dom.listStatus, 'Connect to AniList to import your list.');
  }
}

export function initApp() {
  consumeAuthResponse()
    .catch((error) => {
      setStatus(
        dom.listStatus,
        error instanceof Error ? error.message : 'The authorization failed. Connect to AniList again.',
      );
    })
    .finally(initFlow);
}
