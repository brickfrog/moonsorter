import { login, logout, getToken } from '../lib/auth';
import { updateScores } from '../lib/anilist';
import { setStatus } from '../lib/utils';
import { demoItems } from '../lib/demo';
import { dom, type NavTarget } from './dom';
import { state } from './state';
import { showView, navigateView } from './views';
import { handleChoice, undoLast, redoLast, renderPair } from './comparison';
import { showResults, renderResultsTable } from './results';
import { renderTierList, downloadTierListImage } from './tier-list';
import { submitSort, skipSort, startGroupSort } from './group';
import { setImportPath, applyModeSelection, enterActiveStep, updateAuthUi } from './mode';
import { readMediaType } from './config';
import { handleImport, handleCsvImport } from './import';
import { updateListView } from './list';
import { resumeSession, clearSession, performClearSession } from './session';
import {
  buildUploadPayload,
  downloadSession,
  downloadResults,
  downloadCsv,
  loadSessionFile,
  sessionStartOptions,
} from './export';
import { runAnalysis, handleFinish } from './analysis';
import { startRanking } from './ranking';
import { closeModal, isAnyModalOpen } from './modal';
import { saveState } from './storage';
import type { RankMode } from '../lib/types';

export function setupEvents() {
  // Choice buttons for pairwise comparison
  dom.choiceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const choice = button.getAttribute('data-choice');
      if (choice === 'A') handleChoice(1);
      if (choice === 'TIE') handleChoice(2);
      if (choice === 'B') handleChoice(3);
    });
  });

  // Keyboard shortcuts for comparison
  document.addEventListener('keydown', (event) => {
    if (dom.views.compare?.classList.contains('hidden')) return;
    // A .modal-overlay is `fixed inset-0`, which blocks the pointer but not
    // the keyboard; without this the shortcuts keep firing behind a dialog.
    if (isAnyModalOpen()) return;
    // Let focused controls (the action buttons) keep their own Space/Enter
    // behaviour.
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input, button, select, textarea')
    ) {
      return;
    }
    if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
      handleChoice(1);
    }
    if (event.key === 'b' || event.key === 'B' || event.key === 'ArrowRight') {
      handleChoice(3);
    }
    if (event.key === ' ') {
      event.preventDefault();
      handleChoice(2);
    }
    if (event.key === 'u' || event.key === 'U') {
      undoLast();
    }
    if ((event.key === 'y' || event.key === 'Y') && event.ctrlKey) {
      event.preventDefault();
      redoLast();
    }
  });

  // Top-bar view navigation
  dom.navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-view-target') as NavTarget | null;
      if (!target) return;
      navigateView(target);
    });
  });

  // Start comparing button
  if (dom.startButton) {
    dom.startButton.addEventListener('click', () => {
      const selected = dom.methodRadios.find((radio) => radio.checked);
      const mode = selected?.getAttribute('data-rank-mode') as RankMode | null;
      applyModeSelection(mode ?? 'pairwise');
    });
  }

  // Connect buttons
  document.querySelectorAll('[data-action="connect"]').forEach((button) => {
    button.addEventListener('click', () => {
      try {
        login();
      } catch (error) {
        setStatus(
          dom.listStatus,
          error instanceof Error ? error.message : 'The client ID is missing. Set PUBLIC_ANILIST_CLIENT_ID in .env',
        );
      }
    });
  });

  // CSV import path buttons
  document.querySelectorAll('[data-action="csv"]').forEach((button) => {
    button.addEventListener('click', () => {
      setImportPath('csv');
      showView('list');
      // The file input sits in the collapsed Advanced panel. Pointing at a
      // control the reader cannot see is how the old flow lost people.
      dom.csvFile?.closest('details')?.setAttribute('open', '');
      dom.csvFile?.focus();
      setStatus(dom.listStatus, 'Select a CSV file, then press Import from CSV.');
    });
  });

  // Demo mode buttons
  document.querySelectorAll('[data-action="demo"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.pendingStart = {
        list: demoItems,
        scoreFormat: state.scoreFormat,
        preserveRange: state.preserveRange,
        includeUnscored: state.includeUnscored,
        mediaType: readMediaType(),
        useScorePrior: false,
        importMode: 'all',
        sliceCount: demoItems.length,
      };
      state.currentFilters = {};
      state.modeChosen = false;
      state.listSource = 'demo list';
      updateListView();
      showView('list');
      setStatus(dom.listStatus, 'The demo list is ready. Press Start comparing.');
    });
  });

  // Import button
  const importButton = document.querySelector('[data-action="import"]');
  if (importButton) {
    importButton.addEventListener('click', handleImport);
  }

  // CSV import button
  const importCsvButton = document.querySelector('[data-action="import-csv"]');
  if (importCsvButton) {
    importCsvButton.addEventListener('click', handleCsvImport);
  }

  // Logout button
  const logoutButton = dom.logoutButton;
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      logout();
      updateAuthUi();
      setStatus(dom.listStatus, 'Moonsorter disconnected from AniList.');
      showView('list');
    });
  }

  // Resume session button
  const resumeButton = document.querySelector('[data-action="resume"]');
  if (resumeButton) {
    resumeButton.addEventListener('click', resumeSession);
  }

  // Clear session button
  const clearButton = document.querySelector('[data-action="clear"]');
  if (clearButton) {
    clearButton.addEventListener('click', clearSession);
  }

  // Undo button
  const undoButton = document.querySelector('[data-action="undo"]');
  if (undoButton) {
    undoButton.addEventListener('click', undoLast);
  }

  // Redo button
  const redoButton = document.querySelector('[data-action="redo"]');
  if (redoButton) {
    redoButton.addEventListener('click', redoLast);
  }

  // Finish button
  const finishButton = document.querySelector('[data-action="finish"]');
  if (finishButton) {
    finishButton.addEventListener('click', handleFinish);
  }

  // Cancel finish modal
  const cancelFinishButton = document.querySelector('[data-action="cancel-finish"]');
  if (cancelFinishButton) {
    cancelFinishButton.addEventListener('click', () => {
      if (dom.earlyFinishModal) closeModal(dom.earlyFinishModal);
    });
  }

  // Confirm finish modal
  const confirmFinishButton = document.querySelector('[data-action="confirm-finish"]');
  if (confirmFinishButton) {
    confirmFinishButton.addEventListener('click', () => {
      if (dom.earlyFinishModal) closeModal(dom.earlyFinishModal);
      state.earlyFinishWarned = true;
      showResults();
    });
  }

  // Cancel start over modal
  const cancelStartOverButton = document.querySelector('[data-action="cancel-start-over"]');
  if (cancelStartOverButton) {
    cancelStartOverButton.addEventListener('click', () => {
      if (dom.startOverModal) closeModal(dom.startOverModal);
    });
  }

  // Confirm start over modal
  const confirmStartOverButton = document.querySelector('[data-action="confirm-start-over"]');
  if (confirmStartOverButton) {
    confirmStartOverButton.addEventListener('click', () => {
      if (dom.startOverModal) closeModal(dom.startOverModal);
      performClearSession();
    });
  }

  // Upload button
  const uploadButton = dom.uploadButton;
  if (uploadButton) {
    uploadButton.addEventListener('click', async () => {
      const token = getToken();
      if (!token) {
        setStatus(dom.uploadStatus, 'Connect to AniList first.');
        return;
      }
      const updates = buildUploadPayload();
      if (!updates.length) {
        setStatus(dom.uploadStatus, 'You did not select any titles to upload.');
        return;
      }
      uploadButton.disabled = true;
      uploadButton.textContent = `Uploaded 0/${updates.length}`;
      try {
        // Paced by updateScores to stay under the AniList rate limit, so a
        // large list takes minutes; report progress rather than looking hung.
        await updateScores(token, updates, {
          onProgress: (done, total) => {
            uploadButton.textContent = `Uploaded ${done}/${total}`;
          },
        });
        uploadButton.textContent = 'Uploaded';
        setStatus(dom.uploadStatus, `Moonsorter uploaded ${updates.length} scores.`);
      } catch (error) {
        uploadButton.textContent = 'Upload to AniList';
        setStatus(
          dom.uploadStatus,
          error instanceof Error ? error.message : 'The upload failed. Try the upload again.',
        );
      } finally {
        uploadButton.disabled = false;
      }
    });
  }

  // Download results button
  const downloadResultsButton = document.querySelector('[data-action="download-results"]');
  if (downloadResultsButton) {
    downloadResultsButton.addEventListener('click', downloadResults);
  }

  // Download CSV button
  const downloadCsvButton = document.querySelector('[data-action="download-csv"]');
  if (downloadCsvButton) {
    downloadCsvButton.addEventListener('click', downloadCsv);
  }

  // Download session button
  const downloadSessionButton = document.querySelector('[data-action="download-session"]');
  if (downloadSessionButton) {
    downloadSessionButton.addEventListener('click', downloadSession);
  }

  // Load a downloaded .session file back in
  const sessionFile = dom.sessionFile;
  if (sessionFile) {
    sessionFile.addEventListener('change', async () => {
      const file = sessionFile.files?.[0];
      if (!file) return;
      // Allow re-picking the same file after a failed load.
      sessionFile.value = '';
      const saved = loadSessionFile(await file.text());
      if (!saved) {
        setStatus(dom.listStatus, 'That file is not a valid session.');
        return;
      }
      try {
        state.listSource = 'saved session';
        await startRanking(sessionStartOptions(saved));
        setStatus(dom.listStatus, `Moonsorter loaded ${saved.items.length} titles from the file.`);
      } catch (error) {
        setStatus(
          dom.listStatus,
          error instanceof Error ? error.message : 'Moonsorter did not load that session. Select a different file.',
        );
      }
    });
  }

  // Select all button
  const selectAllButton = document.querySelector('[data-action="select-all"]');
  if (selectAllButton) {
    selectAllButton.addEventListener('click', () => {
      if (!state.lastResults) return;
      state.selectedIndices = new Set(state.lastResults.rows.map((row) => row.index));
      renderResultsTable(state.lastResults);
    });
  }

  // Select none button
  const selectNoneButton = document.querySelector('[data-action="select-none"]');
  if (selectNoneButton) {
    selectNoneButton.addEventListener('click', () => {
      state.selectedIndices = new Set();
      state.selectionInitialized = true;
      if (state.lastResults) {
        renderResultsTable(state.lastResults);
      }
    });
  }

  // Table column sorting
  document.querySelectorAll('[data-sort]').forEach((header) => {
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-sort');
      if (!column || !state.lastResults) return;

      if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
      }

      renderResultsTable(state.lastResults);
    });
  });

  // Run analysis button
  const runAnalysisButton = document.querySelector('[data-action="run-analysis"]');
  if (runAnalysisButton) {
    runAnalysisButton.addEventListener('click', runAnalysis);
  }

  // Resume comparisons button
  const resumeComparisonsButton = document.querySelector('[data-action="resume-comparisons"]');
  if (resumeComparisonsButton) {
    resumeComparisonsButton.addEventListener('click', () => {
      if (state.rankMode === 'pairwise' || state.rankPhase === 'pairwise') {
        showView('compare');
        renderPair();
        return;
      }
      startGroupSort();
    });
  }

  // Restart button
  const restartButton = document.querySelector('[data-action="restart"]');
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      clearSession();
      showView('list');
    });
  }

  // Download tier list button
  const downloadTierlistButton = document.querySelector('[data-action="download-tierlist"]');
  if (downloadTierlistButton) {
    downloadTierlistButton.addEventListener('click', downloadTierListImage);
  }

  // Tier K value change
  if (dom.tierKValue) {
    dom.tierKValue.addEventListener('change', () => {
      if (state.lastResults) {
        renderTierList(state.lastResults);
      }
    });
  }

  // Submit sort button
  const submitSortButton = document.querySelector('[data-action="submit-sort"]');
  if (submitSortButton) {
    submitSortButton.addEventListener('click', submitSort);
  }

  // Skip sort button
  const skipSortButton = document.querySelector('[data-action="skip-sort"]');
  if (skipSortButton) {
    skipSortButton.addEventListener('click', skipSort);
  }

  // Switch to pairwise button
  if (dom.switchToPairwise) {
    dom.switchToPairwise.addEventListener('click', () => {
      state.rankPhase = 'pairwise';
      saveState();
      enterActiveStep();
    });
  }
}
