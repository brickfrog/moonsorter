import type { MediaType, ScoreFormat } from '../lib/anilist';
import { resolveScoreFormat, getScoreConfig } from '../lib/scores';
import { getYearRange } from '../lib/filters';
import { clamp01, parsePositive } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';

export function readMediaType(): MediaType {
  if (!dom.mediaType) return state.mediaType;
  return dom.mediaType.value === 'MANGA' ? 'MANGA' : 'ANIME';
}

function localResolveScoreFormat(selected: string | undefined): ScoreFormat {
  return resolveScoreFormat(selected, state.detectedScoreFormat);
}

export function updateScoreFormatLabel() {
  if (!dom.scoreFormat) return;
  const autoOption = dom.scoreFormat.querySelector('option[value="AUTO"]');
  if (!autoOption) return;
  if (!state.detectedScoreFormat) {
    autoOption.textContent = 'Use AniList format (auto)';
    return;
  }
  const config = getScoreConfig(state.detectedScoreFormat);
  autoOption.textContent = `Use AniList format (auto: ${config.label})`;
}

function getYearRangeFromInputs(
  fromEl: HTMLInputElement | null,
  toEl: HTMLInputElement | null,
): { min?: number; max?: number } | null {
  return getYearRange(fromEl?.value, toEl?.value);
}

export function readImportOptions(): { selectedFormat: string } {
  state.importMode = dom.importMode ? dom.importMode.value : 'all';
  state.sliceCount = dom.importCount ? Number(dom.importCount.value) || 20 : 20;
  state.includeUnscored = dom.includeUnscored ? dom.includeUnscored.checked : false;
  state.useScorePrior = dom.useScorePrior ? dom.useScorePrior.checked : true;
  state.preserveRange = dom.preserveRange ? dom.preserveRange.checked : true;
  state.mediaType = readMediaType();
  const selectedFormat = dom.scoreFormat ? dom.scoreFormat.value : 'AUTO';
  state.scoreFormat = localResolveScoreFormat(selectedFormat);
  state.explorationEpsilon = dom.exploration
    ? clamp01(Number(dom.exploration.value))
    : state.explorationEpsilon;
  state.uncertaintyPrior = dom.uncertaintyPrior
    ? parsePositive(Number(dom.uncertaintyPrior.value), state.uncertaintyPrior)
    : state.uncertaintyPrior;
  const airedRange = getYearRangeFromInputs(dom.airedFrom, dom.airedTo);
  const startedRange = getYearRangeFromInputs(dom.startedFrom, dom.startedTo);
  const completedRange = getYearRangeFromInputs(dom.completedFrom, dom.completedTo);
  const updatedRange = getYearRangeFromInputs(dom.updatedFrom, dom.updatedTo);
  state.currentFilters = {
    aired: airedRange,
    started: startedRange,
    completed: completedRange,
    updated: updatedRange,
  };
  state.analysisComputedAt = null;
  if (dom.analysisStatus) {
    dom.analysisStatus.textContent = '';
  }
  return { selectedFormat };
}
