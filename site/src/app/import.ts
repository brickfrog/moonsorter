import { setStatus } from '../lib/utils';
import { fetchMediaList } from '../lib/anilist';
import { getToken } from '../lib/auth';
import { parseCsvEntries } from '../lib/csv';
import { inferScoreFormat } from '../lib/scores';
import { withinYearRange, applyImportMode } from '../lib/filters';
import type { Entry } from '../lib/types';
import { dom } from './dom';
import { state } from './state';
import { showStep } from './steps';
import { readMediaType, readImportOptions, updateScoreFormatLabel } from './config';

export function applyListFilters(list: Entry[]) {
  const airedRange = state.currentFilters.aired ?? null;
  const startedRange = state.currentFilters.started ?? null;
  const completedRange = state.currentFilters.completed ?? null;
  const updatedRange = state.currentFilters.updated ?? null;
  const yearFiltered = list.filter((entry) => {
    const airedYear = entry.airedYear ?? entry.seasonYear;
    return (
      withinYearRange(airedYear, airedRange) &&
      withinYearRange(entry.startedAtYear, startedRange) &&
      withinYearRange(entry.completedAtYear, completedRange) &&
      withinYearRange(entry.updatedAtYear, updatedRange)
    );
  });
  const scoredCount = yearFiltered.filter((entry) => entry.score > 0).length;
  const unscoredCount = yearFiltered.length - scoredCount;
  const working = state.includeUnscored
    ? yearFiltered
    : yearFiltered.filter((entry) => entry.score > 0);
  const filtered = applyImportMode(working, state.importMode, state.sliceCount);
  const filteredScored = filtered.filter((entry) => entry.score > 0).length;
  const filteredUnscored = filtered.length - filteredScored;
  return {
    filtered,
    unscoredCount,
    filteredScored,
    filteredUnscored,
  };
}

export async function handleImport() {
  setStatus(dom.importStatus, 'Importing from AniList...');
  const token = getToken();
  if (!token) {
    setStatus(dom.importStatus, 'Connect to AniList first.');
    return;
  }
  try {
    state.mediaType = readMediaType();
    const result = await fetchMediaList(token, state.mediaType);
    state.detectedScoreFormat = result.scoreFormat ?? inferScoreFormat(result.entries);
    updateScoreFormatLabel();

    const list = result.entries;
    console.info('[rank] fetched AniList entries', {
      count: list.length,
      mediaType: state.mediaType,
    });

    const { selectedFormat } = readImportOptions();
    console.info('[rank] score settings', {
      detected: state.detectedScoreFormat,
      selected: selectedFormat,
      resolved: state.scoreFormat,
      mediaType: state.mediaType,
      preserveRange: state.preserveRange,
      useScorePrior: state.useScorePrior,
      includeUnscored: state.includeUnscored,
      explorationEpsilon: state.explorationEpsilon,
      uncertaintyPrior: state.uncertaintyPrior,
    });

    const {
      filtered,
      unscoredCount,
      filteredScored,
      filteredUnscored,
    } = applyListFilters(list);

    console.info('[rank] filtered entries', {
      count: filtered.length,
      mode: state.importMode,
      sliceCount: state.sliceCount,
    });

    const details = state.includeUnscored
      ? `${filteredScored} scored, ${filteredUnscored} unscored included`
      : `${filteredScored} scored, ${unscoredCount} unscored excluded`;
    setStatus(dom.importStatus, `Imported ${filtered.length} titles (${details}).`);
    state.pendingStart = {
      list: filtered,
      scoreFormat: state.scoreFormat,
      preserveRange: state.preserveRange,
      includeUnscored: state.includeUnscored,
      useScorePrior: state.useScorePrior,
      mediaType: state.mediaType,
      importMode: state.importMode,
      sliceCount: state.sliceCount,
      explorationEpsilon: state.explorationEpsilon,
      uncertaintyPrior: state.uncertaintyPrior,
    };
    state.modeChosen = false;
    showStep('mode');
  } catch (error) {
    console.error('[rank] import failed', error);
    setStatus(
      dom.importStatus,
      error instanceof Error ? error.message : 'Import failed.',
    );
  }
}

export async function handleCsvImport() {
  setStatus(dom.importStatus, 'Importing from CSV...');
  const file = dom.csvFile?.files?.[0];
  if (!file) {
    setStatus(dom.importStatus, 'Select a CSV file first.');
    return;
  }
  try {
    const text = await file.text();
    const list = parseCsvEntries(text);
    if (list.length < 2) {
      setStatus(dom.importStatus, 'Need at least two valid titles to rank.');
      return;
    }

    state.detectedScoreFormat = inferScoreFormat(list);
    updateScoreFormatLabel();
    const { selectedFormat } = readImportOptions();

    console.info('[rank] parsed CSV entries', { count: list.length });
    console.info('[rank] score settings', {
      detected: state.detectedScoreFormat,
      selected: selectedFormat,
      resolved: state.scoreFormat,
      mediaType: state.mediaType,
      preserveRange: state.preserveRange,
      useScorePrior: state.useScorePrior,
      includeUnscored: state.includeUnscored,
      explorationEpsilon: state.explorationEpsilon,
      uncertaintyPrior: state.uncertaintyPrior,
    });

    const {
      filtered,
      unscoredCount,
      filteredScored,
      filteredUnscored,
    } = applyListFilters(list);

    console.info('[rank] filtered CSV entries', {
      count: filtered.length,
      mode: state.importMode,
      sliceCount: state.sliceCount,
    });

    const details = state.includeUnscored
      ? `${filteredScored} scored, ${filteredUnscored} unscored included`
      : `${filteredScored} scored, ${unscoredCount} unscored excluded`;
    setStatus(dom.importStatus, `Imported ${filtered.length} titles (${details}).`);
    state.pendingStart = {
      list: filtered,
      scoreFormat: state.scoreFormat,
      preserveRange: state.preserveRange,
      includeUnscored: state.includeUnscored,
      mediaType: state.mediaType,
      useScorePrior: state.useScorePrior,
      importMode: state.importMode,
      sliceCount: state.sliceCount,
      explorationEpsilon: state.explorationEpsilon,
      uncertaintyPrior: state.uncertaintyPrior,
    };
    state.modeChosen = false;
    showStep('mode');
  } catch (error) {
    console.error('[rank] CSV import failed', error);
    setStatus(
      dom.importStatus,
      error instanceof Error ? error.message : 'CSV import failed.',
    );
  }
}
