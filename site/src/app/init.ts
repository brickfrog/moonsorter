import { consumeAuthResponse, getToken } from '../lib/auth';
import { setStatus } from '../lib/utils';
import { demoItems } from '../lib/demo';
import { dom } from './dom';
import { state } from './state';
import { showStep } from './steps';
import { setImportPath } from './mode';
import { readMediaType } from './config';
import { startRanking } from './ranking';

export function initFlow() {
  const hasToken = getToken();
  console.info('[rank] token present:', Boolean(hasToken));
  const params = new URLSearchParams(window.location.search);
  const importParam = params.get('import');
  if (params.get('demo') === '1') {
    startRanking({
      list: demoItems,
      scoreFormat: state.scoreFormat,
      preserveRange: state.preserveRange,
      includeUnscored: state.includeUnscored,
      mediaType: readMediaType(),
      useScorePrior: false,
      importMode: 'all',
      sliceCount: demoItems.length,
    });
    state.currentFilters = {};
  } else if (importParam === 'csv') {
    setImportPath('csv');
    showStep('import');
    setStatus(dom.importStatus, 'Select a CSV file to begin.');
  } else if (importParam === 'anilist') {
    if (hasToken) {
      setImportPath('anilist');
      showStep('import');
    } else {
      showStep('connect');
      setStatus(dom.connectStatus, 'Connect to AniList to import your list.');
    }
  } else if (hasToken) {
    setImportPath('anilist');
    showStep('import');
  } else {
    showStep('connect');
  }
}

export function initApp() {
  consumeAuthResponse()
    .catch((error) => {
      setStatus(
        dom.connectStatus,
        error instanceof Error ? error.message : 'Authorization failed.',
      );
    })
    .finally(initFlow);
}
