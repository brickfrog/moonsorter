import { login, logout, getToken } from '../lib/auth';
import { updateScores } from '../lib/anilist';
import { setStatus } from '../lib/utils';
import { demoItems } from '../lib/demo';
import { dom, type StepKey } from './dom';
import { state } from './state';
import { showStep, navigateStep } from './steps';
import { handleChoice, undoLast, redoLast, renderPair } from './comparison';
import { showResults, renderResultsTable, setRenderTierListCallback } from './results';
import { renderTierList, downloadTierListImage } from './tier-list';
import { submitSort, skipSort, startGroupSort } from './group';
import { setImportPath, applyModeSelection, enterActiveStep } from './mode';
import { readMediaType } from './config';
import { handleImport, handleCsvImport } from './import';
import { resumeSession, clearSession, performClearSession } from './session';
import { buildUploadPayload, downloadSession, downloadResults, downloadCsv } from './export';
import { runAnalysis, handleFinish } from './analysis';
import { saveState } from './storage';
import type { RankGoal, RankMode } from '../lib/types';

export function setupEvents() {
  // Wire up tier list callback
  setRenderTierListCallback(renderTierList);

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
    if (dom.steps.compare?.classList.contains('hidden')) return;
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

  // Stepper navigation buttons
  dom.stepperButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-step-target') as StepKey | null;
      if (!target) return;
      navigateStep(target);
    });
  });

  // Connect buttons
  document.querySelectorAll('[data-action="connect"]').forEach((button) => {
    button.addEventListener('click', () => {
      try {
        login();
      } catch (error) {
        setStatus(
          dom.connectStatus,
          error instanceof Error ? error.message : 'Missing client ID.',
        );
      }
    });
  });

  // CSV import path buttons
  document.querySelectorAll('[data-action="csv"]').forEach((button) => {
    button.addEventListener('click', () => {
      setImportPath('csv');
      showStep('import');
      setStatus(dom.importStatus, 'Select a CSV file to begin.');
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
      showStep('mode');
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
  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      logout();
      setStatus(dom.importStatus, 'Disconnected.');
      showStep('connect');
    });
  }

  // Back to import button
  const backToImportButton = document.querySelector('[data-action="back-to-import"]');
  if (backToImportButton) {
    backToImportButton.addEventListener('click', () => {
      showStep('import');
    });
  }

  // Back to connect button
  const backToConnectButton = document.querySelector('[data-action="back-to-connect"]');
  if (backToConnectButton) {
    backToConnectButton.addEventListener('click', () => {
      showStep('connect');
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
      if (dom.earlyFinishModal) dom.earlyFinishModal.classList.add('hidden');
    });
  }

  // Confirm finish modal
  const confirmFinishButton = document.querySelector('[data-action="confirm-finish"]');
  if (confirmFinishButton) {
    confirmFinishButton.addEventListener('click', () => {
      if (dom.earlyFinishModal) dom.earlyFinishModal.classList.add('hidden');
      state.earlyFinishWarned = true;
      showResults();
    });
  }

  // Cancel start over modal
  const cancelStartOverButton = document.querySelector('[data-action="cancel-start-over"]');
  if (cancelStartOverButton) {
    cancelStartOverButton.addEventListener('click', () => {
      if (dom.startOverModal) dom.startOverModal.classList.add('hidden');
    });
  }

  // Confirm start over modal
  const confirmStartOverButton = document.querySelector('[data-action="confirm-start-over"]');
  if (confirmStartOverButton) {
    confirmStartOverButton.addEventListener('click', () => {
      if (dom.startOverModal) dom.startOverModal.classList.add('hidden');
      performClearSession();
    });
  }

  // Upload button
  if (dom.uploadButton) {
    dom.uploadButton.addEventListener('click', async () => {
      const token = getToken();
      if (!token) {
        setStatus(dom.connectStatus, 'Connect to AniList first.');
        return;
      }
      const updates = buildUploadPayload();
      if (!updates.length) {
        setStatus(dom.importStatus, 'Nothing selected to upload yet.');
        return;
      }
      dom.uploadButton!.textContent = 'Uploading...';
      try {
        await updateScores(token, updates);
        dom.uploadButton!.textContent = 'Uploaded!';
      } catch (error) {
        dom.uploadButton!.textContent = 'Upload selected';
        setStatus(
          dom.importStatus,
          error instanceof Error ? error.message : 'Upload failed.',
        );
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

  // Select all button
  const selectAllButton = document.querySelector('[data-action="select-all"]');
  if (selectAllButton) {
    selectAllButton.addEventListener('click', () => {
      if (!state.lastResults) return;
      state.selectedIndices = new Set((state.lastResults as any).rows.map((row: any) => row.index));
      renderResultsTable(state.lastResults as any);
    });
  }

  // Select none button
  const selectNoneButton = document.querySelector('[data-action="select-none"]');
  if (selectNoneButton) {
    selectNoneButton.addEventListener('click', () => {
      state.selectedIndices = new Set();
      if (state.lastResults) {
        renderResultsTable(state.lastResults as any);
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

      renderResultsTable(state.lastResults as any);
    });
  });

  // Run analysis button
  const runAnalysisButton = document.querySelector('[data-action="run-analysis"]');
  if (runAnalysisButton) {
    runAnalysisButton.addEventListener('click', runAnalysis);
  }

  // Mode selection buttons
  document.querySelectorAll('[data-rank-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const goal = button.getAttribute('data-rank-goal') as RankGoal | null;
      const mode = button.getAttribute('data-rank-mode') as RankMode | null;
      if (!goal || !mode) return;
      applyModeSelection(goal, mode);
    });
  });

  // Resume comparisons button
  const resumeComparisonsButton = document.querySelector('[data-action="resume-comparisons"]');
  if (resumeComparisonsButton) {
    resumeComparisonsButton.addEventListener('click', () => {
      if (state.rankMode === 'pairwise' || state.rankPhase === 'pairwise') {
        showStep('compare');
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
      showStep(getToken() ? 'import' : 'connect');
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
        renderTierList(state.lastResults as any);
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
