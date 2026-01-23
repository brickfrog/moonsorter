import { consumeAuthResponse, getToken, login, logout } from '../lib/auth';
import {
  fetchMediaList,
  updateScores,
  type MediaType,
  type ScoreFormat,
} from '../lib/anilist';
import { loadWasm, type WasmExports } from '../lib/wasm';

function applyRanking(wasm: WasmExports, indices: number[]) {
  if (indices.length === 0) return true;
  wasm.clear_ranking();
  for (const idx of indices) {
    wasm.add_to_ranking(idx);
  }
  return wasm.commit_ranking();
}

const STATE_KEY = 'moonsorter.ranker_state';

type Entry = {
  title: string;
  mediaId: number | null;
  score: number;
  airedYear?: number;
  seasonYear?: number;
  startedAtYear?: number;
  completedAtYear?: number;
  updatedAtYear?: number;
  coverImage?: string;
};

type RankingHistoryEntry = { indices: number[] };

type RankGoal = 'rescore' | 'scratch';
type RankMode = 'pairwise' | 'group' | 'group-pairwise';
type RankPhase = 'pairwise' | 'group';
type RankObjective = 'full' | 'top-k';

type SavedState = {
  items: Entry[];
  comparisons: RankingHistoryEntry[];
  priorComparisons: RankingHistoryEntry[];
  scoreFormat: ScoreFormat;
  preserveRange: boolean;
  includeUnscored: boolean;
  mediaType: MediaType;
  importMode: string;
  sliceCount: number;
  useScorePrior: boolean;
  explorationEpsilon: number;
  uncertaintyPrior: number;
  rankGoal?: RankGoal;
  rankMode?: RankMode;
  rankPhase?: RankPhase;
  rankObjective?: RankObjective;
  modeChosen?: boolean;
  optInTierList?: boolean;
};

type Steps = {
  connect: HTMLElement | null;
  import: HTMLElement | null;
  mode: HTMLElement | null;
  compare: HTMLElement | null;
  compareActions: HTMLElement | null;
  results: HTMLElement | null;
  sortGroup: HTMLElement | null;
};

type StepKey = 'connect' | 'import' | 'mode' | 'compare' | 'results';

type ScoreConfig = { max: number; step: number; label: string };

type ScoreRange = { min: number; max: number };
type YearRange = { min?: number; max?: number };
type YearFilters = {
  aired?: YearRange | null;
  started?: YearRange | null;
  completed?: YearRange | null;
  updated?: YearRange | null;
};

type StartOptions = {
  list: Entry[];
  comparisons?: RankingHistoryEntry[];
  priorComparisons?: RankingHistoryEntry[];
  scoreFormat: ScoreFormat;
  preserveRange: boolean;
  includeUnscored: boolean;
  mediaType?: MediaType;
  useScorePrior?: boolean;
  importMode?: string;
  sliceCount?: number;
  explorationEpsilon?: number;
  uncertaintyPrior?: number;
  rankGoal?: RankGoal;
  rankMode?: RankMode;
  rankPhase?: RankPhase;
  rankObjective?: RankObjective;
  modeChosen?: boolean;
};

type ResultRow = {
  index: number;
  mediaId: number | null;
  title: string;
  originalScore: number;
  rank: number;
  newScore: number;
  rankLow?: number;
  rankHigh?: number;
  rankMean?: number;
  topKConfidence?: number;
  coverImage?: string;
};

type ResultsPayload = {
  generatedAt: string;
  scoreFormat: ScoreFormat;
  preserveRange: boolean;
  includeUnscored: boolean;
  mediaType: MediaType;
  importMode: string;
  sliceCount: number;
  useScorePrior: boolean;
  filters: YearFilters;
  analysis?: {
    samples: number;
    topK: number;
    maxIter: number;
    computedAt: string;
  };
  rows: ResultRow[];
};

const SCORE_CONFIGS: Record<ScoreFormat, ScoreConfig> = {
  POINT_100: { max: 100, step: 1, label: '100-point' },
  POINT_10_DECIMAL: { max: 10, step: 0.1, label: '10-point (decimal)' },
  POINT_10: { max: 10, step: 1, label: '10-point' },
  POINT_5: { max: 5, step: 1, label: '5-point' },
  POINT_3: { max: 3, step: 1, label: '3-point' },
};

const demoItems: Entry[] = [
  { title: 'Cowboy Bebop', mediaId: null, score: 8 },
  { title: 'Frieren', mediaId: null, score: 9 },
  { title: 'Mob Psycho 100', mediaId: null, score: 8 },
  { title: 'Made in Abyss', mediaId: null, score: 7 },
  { title: 'Odd Taxi', mediaId: null, score: 8 },
  { title: 'Ping Pong', mediaId: null, score: 7 },
  { title: 'Vinland Saga', mediaId: null, score: 8 },
  { title: 'Trigun', mediaId: null, score: 7 },
];

const steps: Steps = {
  connect: document.querySelector('[data-step="connect"]'),
  import: document.querySelector('[data-step="import"]'),
  mode: document.querySelector('[data-step="mode"]'),
  compare: document.querySelector('[data-step="compare"]'),
  compareActions: document.querySelector('[data-step="compare-actions"]'),
  results: document.querySelector('[data-step="results"]'),
  sortGroup: document.querySelector('[data-step="sort-group"]'),
};

const stepperButtons = Array.from(
  document.querySelectorAll('[data-step-target]'),
) as HTMLButtonElement[];
const stepperStatus = document.querySelector('[data-stepper-status]');
const rankLoadingEl = document.querySelector('[data-rank-loading]');
const connectStatus = document.querySelector('[data-connect-status]');
const importStatus = document.querySelector('[data-import-status]');
const sessionStatus = document.querySelector('[data-session-status]');
const progressText = document.querySelector('[data-progress-text]');
const progressFill = document.querySelector('[data-progress-fill]') as
  | HTMLDivElement
  | null;
const progressMeta = document.querySelector('[data-progress-meta]');
const leftTitle = document.querySelector('[data-choice-title="A"]');
const rightTitle = document.querySelector('[data-choice-title="B"]');
const rankingsBody = document.querySelector('[data-rankings-body]');
const selectionStatus = document.querySelector('[data-selection-status]');
const analysisSummary = document.querySelector('[data-analysis-summary]');
const analysisMedian = document.querySelector('[data-analysis-median]');
const analysisTopKSummary = document.querySelector('[data-analysis-topk]');
const analysisRecommendation = document.querySelector(
  '[data-analysis-recommendation]',
);
const analysisUncertainList = document.querySelector(
  '[data-analysis-uncertain-list]',
) as HTMLDivElement | null;
const analysisResumeButton = document.querySelector(
  '[data-action="resume-comparisons"]',
) as HTMLButtonElement | null;

const mediaTypeEl = document.getElementById(
  'media-type',
) as HTMLSelectElement | null;
const modeEl = document.getElementById('import-mode') as HTMLSelectElement | null;
const countEl = document.getElementById('import-count') as HTMLInputElement | null;
const csvFileEl = document.getElementById('csv-file') as HTMLInputElement | null;
const includeUnscoredEl = document.getElementById(
  'include-unscored',
) as HTMLInputElement | null;
const useScorePriorEl = document.getElementById(
  'use-score-prior',
) as HTMLInputElement | null;
const preserveRangeEl = document.getElementById(
  'preserve-range',
) as HTMLInputElement | null;
const scoreFormatEl = document.getElementById(
  'score-format',
) as HTMLSelectElement | null;
const explorationEl = document.getElementById(
  'exploration-epsilon',
) as HTMLInputElement | null;
const uncertaintyPriorEl = document.getElementById(
  'uncertainty-prior',
) as HTMLInputElement | null;
const airedFromEl = document.getElementById(
  'filter-aired-from',
) as HTMLInputElement | null;
const airedToEl = document.getElementById(
  'filter-aired-to',
) as HTMLInputElement | null;
const startedFromEl = document.getElementById(
  'filter-started-from',
) as HTMLInputElement | null;
const startedToEl = document.getElementById(
  'filter-started-to',
) as HTMLInputElement | null;
const completedFromEl = document.getElementById(
  'filter-completed-from',
) as HTMLInputElement | null;
const completedToEl = document.getElementById(
  'filter-completed-to',
) as HTMLInputElement | null;
const updatedFromEl = document.getElementById(
  'filter-updated-from',
) as HTMLInputElement | null;
const updatedToEl = document.getElementById(
  'filter-updated-to',
) as HTMLInputElement | null;
const scratchGoalEl = document.getElementById(
  'scratch-goal',
) as HTMLSelectElement | null;
const analysisSamplesEl = document.getElementById(
  'analysis-samples',
) as HTMLInputElement | null;
const analysisTopKEl = document.getElementById(
  'analysis-topk',
) as HTMLInputElement | null;
const analysisMaxIterEl = document.getElementById(
  'analysis-max-iter',
) as HTMLInputElement | null;
const optInTierListEl = document.getElementById(
  'opt-in-tier-list',
) as HTMLInputElement | null;
const analysisStatus = document.querySelector('[data-analysis-status]');
const switchToPairwiseButton = document.querySelector(
  '[data-action="switch-to-pairwise"]',
);
const groupCoverageEl = document.querySelector('[data-group-coverage]');
const groupEstimateEl = document.querySelector('[data-group-estimate]');

let wasm: WasmExports | null = null;
let currentPair: [number, number] | null = null;
let focusPair: [number, number] | null = null;
let currentGroup: number[] | null = null;
let items: Entry[] = [];
let comparisons: RankingHistoryEntry[] = [];
let redoStack: RankingHistoryEntry[] = [];
let priorComparisons: RankingHistoryEntry[] = [];
let includeUnscored = false;
let preserveRange = true;
let scoreFormat: ScoreFormat = 'POINT_10';
let detectedScoreFormat: ScoreFormat | undefined;
let mediaType: MediaType = 'ANIME';
let importMode = 'all';
let sortColumn: string | null = null;
let sortDirection: 'asc' | 'desc' = 'asc';
let sliceCount = 20;
let useScorePrior = true;
let explorationEpsilon = 0.1;
let uncertaintyPrior = 1.0;
let currentFilters: YearFilters = {};
let lastResults: ResultsPayload | null = null;
let selectedIndices = new Set<number>();
let analysisSamples = 200;
let analysisTopK = 10;
let analysisMaxIter = 40;
let analysisComputedAt: string | null = null;
let rankGoal: RankGoal = 'rescore';
let rankMode: RankMode = 'pairwise';
let rankPhase: RankPhase = 'pairwise';
let rankObjective: RankObjective = 'full';
let modeChosen = false;
let pendingStart: StartOptions | null = null;

function resolveStepKey(name: keyof Steps): StepKey {
  if (name === 'sortGroup' || name === 'compareActions') return 'compare';
  return name === 'results' ? 'results' : (name as StepKey);
}

function canShowMode(): boolean {
  return !!pendingStart || items.length > 0;
}

function canShowCompare(): boolean {
  return !!wasm && items.length > 1;
}

function canShowResults(): boolean {
  return !!lastResults;
}

function nearestAvailableStep(): StepKey {
  if (canShowCompare()) return 'compare';
  if (canShowMode()) return 'mode';
  return getToken() ? 'import' : 'connect';
}

function updateStepper(active: keyof Steps) {
  if (!stepperButtons.length) return;
  const activeKey = resolveStepKey(active);
  stepperButtons.forEach((button) => {
    const target = button.getAttribute('data-step-target') as StepKey | null;
    if (!target) return;
    const enabled =
      target === 'connect' ||
      target === 'import' ||
      (target === 'mode' && canShowMode()) ||
      (target === 'compare' && canShowCompare()) ||
      (target === 'results' && canShowResults());
    button.disabled = !enabled;
    button.classList.toggle('is-active', target === activeKey);
  });
}

function navigateStep(target: StepKey) {
  let next: StepKey = target;
  if (target === 'results' && !canShowResults()) {
    next = nearestAvailableStep();
    if (stepperStatus) {
      stepperStatus.textContent =
        'Finish a few comparisons to unlock results.';
    }
  } else if (target === 'compare' && !canShowCompare()) {
    next = nearestAvailableStep();
    if (stepperStatus) {
      stepperStatus.textContent =
        'Import a list and choose a mode to start comparing.';
    }
  } else if (target === 'mode' && !canShowMode()) {
    next = getToken() ? 'import' : 'connect';
    if (stepperStatus) {
      stepperStatus.textContent = 'Import a list to choose a ranking mode.';
    }
  } else if (stepperStatus) {
    stepperStatus.textContent = '';
  }
  showStep(next);
}

function showStep(name: keyof Steps) {
  if (rankLoadingEl) {
    rankLoadingEl.classList.add('hidden');
  }
  Object.entries(steps).forEach(([key, element]) => {
    if (!element) return;
    element.classList.toggle('hidden', key !== name);
  });
  if (name === 'compare' && steps.compareActions) {
    steps.compareActions.classList.remove('hidden');
  } else if (steps.compareActions) {
    steps.compareActions.classList.add('hidden');
  }
  if (name === 'sortGroup' && steps.compareActions) {
    steps.compareActions.classList.remove('hidden');
  }
  if (name === 'results' && steps.results) {
    steps.results.classList.remove('hidden');
  }
  updateStepper(name);
}

function updateModeUI() {
  if (!switchToPairwiseButton) return;
  const showSwitch =
    rankMode === 'group-pairwise' && rankPhase === 'group';
  switchToPairwiseButton.classList.toggle('hidden', !showSwitch);
  if (analysisResumeButton) {
    analysisResumeButton.textContent =
      rankMode === 'pairwise' || rankPhase === 'pairwise'
        ? 'Keep comparing'
        : 'Keep ranking';
  }
}

function buildRandomGroup(size: number): number[] {
  const pool = Array.from({ length: items.length }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

function startGroupSort() {
  if (items.length < 2) return;
  const size = Math.min(5, items.length);
  currentGroup = buildRandomGroup(size);
  updateGroupCoverage();
  updateModeUI();
  showStep('sortGroup');
  renderSortGroup();
}

function enterActiveStep() {
  updatePairPolicy();
  if (rankMode === 'pairwise' || rankPhase === 'pairwise') {
    rankPhase = 'pairwise';
    updateModeUI();
    showStep('compare');
    renderPair();
    return;
  }
  rankPhase = 'group';
  startGroupSort();
}

function resolvePairPolicy(): number {
  if (rankGoal === 'rescore') return 0;
  if (rankObjective === 'top-k') return 1;
  return 2;
}

function updatePairPolicy() {
  if (!wasm) return;
  wasm.set_pair_policy(resolvePairPolicy());
}

function applyModeSelection(goal: RankGoal, mode: RankMode) {
  rankGoal = goal;
  rankMode = mode;
  rankObjective =
    goal === 'scratch'
      ? scratchGoalEl?.value === 'top-k'
        ? 'top-k'
        : 'full'
      : 'full';
  modeChosen = true;
  if (goal === 'scratch') {
    useScorePrior = false;
    if (useScorePriorEl) useScorePriorEl.checked = false;
  } else {
    useScorePrior = true;
    if (useScorePriorEl) useScorePriorEl.checked = true;
  }

  const startOptions = pendingStart;
  if (startOptions) {
    pendingStart = null;
    startRanking({
      ...startOptions,
      useScorePrior,
      rankGoal,
      rankMode,
      rankPhase: rankMode === 'pairwise' ? 'pairwise' : 'group',
      rankObjective,
      modeChosen,
    }).catch((error) => {
      setStatus(
        importStatus,
        error instanceof Error ? error.message : 'Failed to start ranking.',
      );
    });
    return;
  }

  if (rankMode === 'pairwise') {
    rankPhase = 'pairwise';
  } else {
    rankPhase = 'group';
  }
  updatePairPolicy();
  saveState();
  enterActiveStep();
}

function setStatus(target: Element | null, message: string) {
  if (target) target.textContent = message;
}

function getScoreConfig(format: ScoreFormat): ScoreConfig {
  return SCORE_CONFIGS[format] ?? SCORE_CONFIGS.POINT_10;
}

function resolveScoreFormat(selected: string | undefined): ScoreFormat {
  if (!selected || selected === 'AUTO') {
    return detectedScoreFormat ?? 'POINT_10';
  }
  return (SCORE_CONFIGS[selected as ScoreFormat]
    ? selected
    : 'POINT_10') as ScoreFormat;
}

function inferScoreFormat(entries: Entry[]): ScoreFormat | undefined {
  const scores = entries.map((entry) => entry.score).filter((score) => score > 0);
  if (!scores.length) return undefined;
  const max = Math.max(...scores);
  const hasDecimal = scores.some((score) => Math.abs(score % 1) > 1.0e-6);
  if (max > 10) return 'POINT_100';
  if (hasDecimal) return 'POINT_10_DECIMAL';
  if (max <= 3) return 'POINT_3';
  if (max <= 5) return 'POINT_5';
  return 'POINT_10';
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function formatScore(value: number, config: ScoreConfig): string {
  if (config.step < 1) return value.toFixed(1);
  return Math.round(value).toString();
}

function getScoreRange(entries: Entry[]): ScoreRange | null {
  const scored = entries.map((entry) => entry.score).filter((score) => score > 0);
  if (scored.length < 2) return null;
  const min = Math.min(...scored);
  const max = Math.max(...scored);
  if (min === max) return null;
  return { min, max };
}

function mapRankToScore(
  rank: number,
  total: number,
  config: ScoreConfig,
  range: ScoreRange | null,
): number {
  if (rank <= 0 || total <= 0) return 0;
  const normalized = total > 1 ? (total - rank) / (total - 1) : 1;
  const minScore = range ? range.min : 1;
  const maxScore = range ? range.max : config.max;
  const raw = minScore + normalized * (maxScore - minScore);
  const rounded = roundToStep(raw, config.step);
  if (rounded < minScore) return minScore;
  if (rounded > maxScore) return maxScore;
  return rounded;
}

function updateScoreFormatLabel() {
  if (!scoreFormatEl) return;
  const autoOption = scoreFormatEl.querySelector('option[value="AUTO"]');
  if (!autoOption) return;
  if (!detectedScoreFormat) {
    autoOption.textContent = 'Use AniList format (auto)';
    return;
  }
  const config = getScoreConfig(detectedScoreFormat);
  autoOption.textContent = `Use AniList format (auto: ${config.label})`;
}

function shouldPreserveScoreSlots(): boolean {
  return preserveRange && useScorePrior;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parsePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value > 0 ? value : fallback;
}

function suggestAnalysisSamples(total: number): number {
  if (total <= 50) return 200;
  if (total <= 150) return 300;
  return 500;
}

function suggestAnalysisIterations(total: number): number {
  if (total <= 50) return 30;
  if (total <= 150) return 40;
  return 50;
}

function suggestTopK(total: number): number {
  if (
    importMode === 'top' ||
    importMode === 'bottom' ||
    importMode === 'top-bottom'
  ) {
    return Math.max(1, Math.min(sliceCount, total));
  }
  return Math.max(1, Math.min(10, total));
}

function applyAnalysisDefaults(total: number) {
  const suggestedSamples = suggestAnalysisSamples(total);
  const suggestedTopK = suggestTopK(total);
  const suggestedIterations = suggestAnalysisIterations(total);
  analysisSamples = suggestedSamples;
  analysisTopK = suggestedTopK;
  analysisMaxIter = suggestedIterations;
  if (analysisSamplesEl) analysisSamplesEl.value = suggestedSamples.toString();
  if (analysisTopKEl) analysisTopKEl.value = suggestedTopK.toString();
  if (analysisMaxIterEl) analysisMaxIterEl.value = suggestedIterations.toString();
}

function parseYearInput(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function getYearRange(
  fromEl: HTMLInputElement | null,
  toEl: HTMLInputElement | null,
): YearRange | null {
  const min = parseYearInput(fromEl?.value ?? undefined);
  const max = parseYearInput(toEl?.value ?? undefined);
  if (min == null && max == null) return null;
  return { min, max };
}

function withinYearRange(
  value: number | undefined,
  range: YearRange | null,
): boolean {
  if (!range) return true;
  if (value == null) return false;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function readMediaType(): MediaType {
  if (!mediaTypeEl) return mediaType;
  return mediaTypeEl.value === 'MANGA' ? 'MANGA' : 'ANIME';
}

function readImportOptions(): { selectedFormat: string } {
  importMode = modeEl ? modeEl.value : 'all';
  sliceCount = countEl ? Number(countEl.value) || 20 : 20;
  includeUnscored = includeUnscoredEl ? includeUnscoredEl.checked : false;
  useScorePrior = useScorePriorEl ? useScorePriorEl.checked : true;
  preserveRange = preserveRangeEl ? preserveRangeEl.checked : true;
  mediaType = readMediaType();
  const selectedFormat = scoreFormatEl ? scoreFormatEl.value : 'AUTO';
  scoreFormat = resolveScoreFormat(selectedFormat);
  explorationEpsilon = explorationEl
    ? clamp01(Number(explorationEl.value))
    : explorationEpsilon;
  uncertaintyPrior = uncertaintyPriorEl
    ? parsePositive(Number(uncertaintyPriorEl.value), uncertaintyPrior)
    : uncertaintyPrior;
  const airedRange = getYearRange(airedFromEl, airedToEl);
  const startedRange = getYearRange(startedFromEl, startedToEl);
  const completedRange = getYearRange(completedFromEl, completedToEl);
  const updatedRange = getYearRange(updatedFromEl, updatedToEl);
  currentFilters = {
    aired: airedRange,
    started: startedRange,
    completed: completedRange,
    updated: updatedRange,
  };
  analysisComputedAt = null;
  if (analysisStatus) {
    analysisStatus.textContent = '';
  }
  return { selectedFormat };
}

function buildScoreSlots(entries: Entry[], config: ScoreConfig): number[] {
  return entries
    .map((entry) => entry.score)
    .filter((score) => score > 0)
    .sort((a, b) => b - a)
    .map((score) => roundToStep(score, config.step));
}

function assignScoresByRank(
  entries: Array<{ index: number; rank: number; originalScore: number }>,
  scoreSlots: number[],
): Map<number, number> {
  const scoredEntries = entries
    .filter((entry) => entry.originalScore > 0)
    .sort((a, b) => a.rank - b.rank);
  const limit = Math.min(scoredEntries.length, scoreSlots.length);
  const map = new Map<number, number>();
  for (let i = 0; i < limit; i += 1) {
    map.set(scoredEntries[i].index, scoreSlots[i]);
  }
  return map;
}

async function ensureWasm(): Promise<WasmExports> {
  if (!wasm) {
    console.info('[rank] loading WASM');
    wasm = (await loadWasm()) as WasmExports;
    console.info('[rank] WASM loaded');
  }
  return wasm;
}

function saveState() {
  const payload: SavedState = {
    items,
    comparisons,
    priorComparisons,
    scoreFormat,
    preserveRange,
    includeUnscored,
    mediaType,
    importMode,
    sliceCount,
    useScorePrior,
    explorationEpsilon,
    uncertaintyPrior,
    rankGoal,
    rankMode,
    rankPhase,
    rankObjective,
    modeChosen,
    optInTierList: optInTierListEl?.checked ?? true,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(payload));
}

function loadState(): SavedState | null {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedState;
    if (!parsed.items || !parsed.comparisons) return null;
    return {
      ...parsed,
      mediaType: parsed.mediaType === 'MANGA' ? 'MANGA' : 'ANIME',
      importMode: parsed.importMode ?? 'all',
      sliceCount: Number.isFinite(parsed.sliceCount) ? parsed.sliceCount : 20,
      useScorePrior: parsed.useScorePrior ?? true,
      explorationEpsilon: Number.isFinite(parsed.explorationEpsilon)
        ? parsed.explorationEpsilon
        : 0.1,
      uncertaintyPrior: Number.isFinite(parsed.uncertaintyPrior)
        ? parsed.uncertaintyPrior
        : 1.0,
      rankGoal: parsed.rankGoal === 'scratch' ? 'scratch' : 'rescore',
      rankMode:
        parsed.rankMode === 'group' || parsed.rankMode === 'group-pairwise'
          ? parsed.rankMode
          : 'pairwise',
      rankPhase: parsed.rankPhase === 'group' ? 'group' : 'pairwise',
      rankObjective: parsed.rankObjective === 'top-k' ? 'top-k' : 'full',
      modeChosen: parsed.modeChosen ?? false,
      optInTierList: parsed.optInTierList ?? true,
    };
  } catch (error) {
    console.error('[rank] failed to parse saved state', error);
    return null;
  }
}

function updateProgress() {
  updateGroupCoverage();
  if (!wasm || !progressText || !progressFill || !progressMeta) return;
  const completed = wasm.get_progress_completed();
  const estimated = wasm.get_progress_estimated();
  const pct =
    estimated > 0 ? Math.min(100, Math.round((completed / estimated) * 100)) : 0;
  progressFill.style.width = `${pct}%`;

  // Color code based on completion percentage
  progressFill.classList.remove('progress-low', 'progress-medium', 'progress-high');
  if (pct < 30) {
    progressFill.classList.add('progress-low');
  } else if (pct < 70) {
    progressFill.classList.add('progress-medium');
  } else {
    progressFill.classList.add('progress-high');
  }

  progressText.textContent = `${completed} / ${estimated} comparisons`;
  const metaSpan = progressMeta.querySelector('span');
  if (metaSpan) {
    metaSpan.textContent = `Estimated total: ${estimated} comparisons`;
  } else {
    progressMeta.textContent = `Estimated total: ${estimated} comparisons`;
  }
}

function updateGroupCoverage() {
  if (!groupCoverageEl && !groupEstimateEl) return;
  const total = items.length;
  if (total <= 0) {
    if (groupCoverageEl) {
      groupCoverageEl.textContent =
        'Coverage: 0 / 0 titles touched (0 remaining)';
    }
    if (groupEstimateEl) {
      groupEstimateEl.textContent =
        'Baseline target: ~0 group sorts (~2x touches).';
    }
    return;
  }

  const touched = new Set<number>();
  let totalTouches = 0;
  for (const entry of comparisons) {
    totalTouches += entry.indices.length;
    for (const idx of entry.indices) {
      touched.add(idx);
    }
  }

  const covered = touched.size;
  const remaining = Math.max(0, total - covered);
  if (groupCoverageEl) {
    groupCoverageEl.textContent = `Coverage: ${covered} / ${total} titles touched (${remaining} remaining)`;
  }

  if (groupEstimateEl) {
    const groupSize = currentGroup ? currentGroup.length : Math.min(5, total);
    const targetTouches = total * 2;
    const estimatedSorts =
      groupSize > 0 ? Math.ceil(targetTouches / groupSize) : 0;
    const avgTouches = totalTouches / total;
    groupEstimateEl.textContent = `Baseline target: ~${estimatedSorts} group sorts (~${avgTouches.toFixed(1)}x touches so far).`;
  }
}

function updatePairMetadata(leftIndex: number, rightIndex: number) {
  const leftMeta = document.querySelector('[data-choice-meta="A"]');
  const rightMeta = document.querySelector('[data-choice-meta="B"]');
  const leftItem = items[leftIndex];
  const rightItem = items[rightIndex];

  if (leftMeta && leftItem) {
    const parts: string[] = [];
    const year = leftItem.airedYear || leftItem.seasonYear || leftItem.startedAtYear;
    if (year) parts.push(`${year}`);
    if (leftItem.score > 0) parts.push(`Original: ${leftItem.score}`);
    if (parts.length > 0) {
      leftMeta.textContent = parts.join(' • ');
      leftMeta.classList.remove('hidden');
    } else {
      leftMeta.classList.add('hidden');
    }
  }

  if (rightMeta && rightItem) {
    const parts: string[] = [];
    const year = rightItem.airedYear || rightItem.seasonYear || rightItem.startedAtYear;
    if (year) parts.push(`${year}`);
    if (rightItem.score > 0) parts.push(`Original: ${rightItem.score}`);
    if (parts.length > 0) {
      rightMeta.textContent = parts.join(' • ');
      rightMeta.classList.remove('hidden');
    } else {
      rightMeta.classList.add('hidden');
    }
  }
}

function updatePairStrategyBadge() {
  const badge = document.querySelector('[data-pair-strategy]');
  if (!badge) return;

  // Epsilon controls exploration: high = random, low = focused
  if (explorationEpsilon >= 0.25) {
    badge.textContent = '🎲 Random exploration';
    badge.classList.remove('hidden');
  } else if (explorationEpsilon >= 0.1) {
    badge.textContent = '📊 Balanced sampling';
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '🎯 Uncertainty-focused';
    badge.classList.remove('hidden');
  }
}

function renderPair() {
  if (!wasm || !leftTitle || !rightTitle) return;
  updatePairStrategyBadge();

  if (focusPair) {
    const [leftIndex, rightIndex] = focusPair;
    focusPair = null;
    if (
      leftIndex >= 0 &&
      rightIndex >= 0 &&
      leftIndex < items.length &&
      rightIndex < items.length &&
      leftIndex !== rightIndex
    ) {
      currentPair = [leftIndex, rightIndex];
      leftTitle.textContent = items[leftIndex]?.title ?? 'Unknown';
      rightTitle.textContent = items[rightIndex]?.title ?? 'Unknown';
      updatePairMetadata(leftIndex, rightIndex);
      return;
    }
  }
  const encoded = wasm.get_next_pair_encoded(
    explorationEpsilon,
    Math.random(),
  );
  if (encoded < 0) {
    showResults();
    return;
  }
  const leftIndex = Math.floor(encoded / items.length);
  const rightIndex = encoded % items.length;
  if (leftIndex < 0 || rightIndex < 0) {
    console.warn('[rank] invalid pair encoded', encoded);
    return;
  }
  currentPair = [leftIndex, rightIndex];
  leftTitle.textContent = items[leftIndex]?.title ?? 'Unknown';
  rightTitle.textContent = items[rightIndex]?.title ?? 'Unknown';
  updatePairMetadata(leftIndex, rightIndex);
}

function buildResultsPayload(): ResultsPayload | null {
  if (!wasm) return null;
  const analysisReady = wasm.get_uncertainty_ready();
  const analysisMeta = analysisReady
    ? {
      samples: wasm.get_uncertainty_samples(),
      topK: wasm.get_uncertainty_top_k(),
      maxIter: analysisMaxIter,
      computedAt: analysisComputedAt ?? new Date().toISOString(),
    }
    : undefined;
  const entries = items
    .map((item, index) => ({
      index,
      title: item.title,
      originalScore: item.score,
      rank: wasm!.get_rank_for(index),
      mediaId: item.mediaId,
      coverImage: item.coverImage,
    }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => a.rank - b.rank);

  const config = getScoreConfig(scoreFormat);
  const range = preserveRange ? getScoreRange(items) : null;
  const total = entries.length;
  const scoreSlots = shouldPreserveScoreSlots()
    ? buildScoreSlots(items, config)
    : [];
  const slotMap =
    scoreSlots.length > 1 ? assignScoresByRank(entries, scoreSlots) : null;

  const rows: ResultRow[] = entries.map((entry) => {
    const newScore =
      slotMap?.get(entry.index) ??
      mapRankToScore(entry.rank, total, config, range);
    const rankLow = analysisReady ? wasm!.get_rank_ci_low(entry.index) : -1;
    const rankHigh = analysisReady ? wasm!.get_rank_ci_high(entry.index) : -1;
    const rankMean = analysisReady ? wasm!.get_rank_mean(entry.index) : -1;
    const topKConfidence = analysisReady
      ? wasm!.get_topk_confidence(entry.index)
      : -1;
    return {
      index: entry.index,
      mediaId: entry.mediaId,
      title: entry.title,
      originalScore: entry.originalScore,
      rank: entry.rank,
      newScore,
      coverImage: entry.coverImage,
      rankLow: rankLow > 0 ? rankLow : undefined,
      rankHigh: rankHigh > 0 ? rankHigh : undefined,
      rankMean: rankMean >= 0 ? rankMean : undefined,
      topKConfidence: topKConfidence >= 0 ? topKConfidence : undefined,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scoreFormat,
    preserveRange,
    includeUnscored,
    mediaType,
    importMode,
    sliceCount,
    useScorePrior,
    filters: currentFilters,
    analysis: analysisMeta,
    rows,
  };
}

function updateSelectionStatus(total: number) {
  if (!selectionStatus) return;
  selectionStatus.textContent = `${selectedIndices.size} / ${total} selected`;
}

function renderResultsTable(payload: ResultsPayload) {
  if (!rankingsBody) return;
  rankingsBody.innerHTML = '';
  if (!selectedIndices.size) {
    selectedIndices = new Set(payload.rows.map((row) => row.index));
  }
  const config = getScoreConfig(payload.scoreFormat);
  const analysisReady = Boolean(payload.analysis && wasm);
  const widthTarget =
    analysisReady && wasm ? wasm.get_uncertainty_width_target() : null;

  // Sort rows if a column is selected
  let sortedRows = [...payload.rows];
  if (sortColumn) {
    sortedRows.sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortColumn === 'rank') {
        aVal = a.rank;
        bVal = b.rank;
      } else if (sortColumn === 'title') {
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
      } else if (sortColumn === 'originalScore') {
        aVal = a.originalScore;
        bVal = b.originalScore;
      } else if (sortColumn === 'newScore') {
        aVal = a.newScore;
        bVal = b.newScore;
      } else if (sortColumn === 'rankCI') {
        aVal = a.rankLow ?? 9999;
        bVal = b.rankLow ?? 9999;
      } else if (sortColumn === 'topKConfidence') {
        aVal = a.topKConfidence ?? -1;
        bVal = b.topKConfidence ?? -1;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Update sort indicators
  document.querySelectorAll('[data-sort-indicator]').forEach(el => {
    el.textContent = '';
  });
  if (sortColumn) {
    const indicator = document.querySelector(`[data-sort-indicator="${sortColumn}"]`);
    if (indicator) {
      indicator.textContent = sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
  }

  sortedRows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.dataset.index = row.index.toString();
    if (analysisReady && wasm && widthTarget != null) {
      const width = wasm.get_uncertainty_width_for(row.index);
      if (width > widthTarget) {
        tr.classList.add('is-uncertain');
      }
    }

    const selectCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedIndices.has(row.index);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedIndices.add(row.index);
      } else {
        selectedIndices.delete(row.index);
      }
      updateSelectionStatus(payload.rows.length);
    });
    selectCell.appendChild(checkbox);

    const rankCell = document.createElement('td');
    rankCell.textContent = row.rank.toString();

    const titleCell = document.createElement('td');
    titleCell.textContent = row.title;

    const originalCell = document.createElement('td');
    originalCell.textContent =
      row.originalScore > 0
        ? formatScore(row.originalScore, config)
        : 'unscored';

    const newCell = document.createElement('td');
    newCell.textContent =
      row.newScore > 0 ? formatScore(row.newScore, config) : 'unscored';

    const ciCell = document.createElement('td');
    ciCell.textContent =
      row.rankLow && row.rankHigh
        ? `${row.rankLow}-${row.rankHigh}`
        : '--';

    const topKCell = document.createElement('td');
    topKCell.textContent =
      row.topKConfidence != null
        ? `${Math.round(row.topKConfidence * 100)}%`
        : '--';

    tr.append(
      selectCell,
      rankCell,
      titleCell,
      originalCell,
      newCell,
      ciCell,
      topKCell,
    );
    rankingsBody.appendChild(tr);
  });
  updateSelectionStatus(payload.rows.length);
}

let earlyFinishWarned = false;

function handleFinish() {
  if (!wasm) return;
  const completed = wasm.get_progress_completed();
  const estimated = wasm.get_progress_estimated();
  const completion = estimated > 0 ? completed / estimated : 0;

  // Warn if less than 30% complete and haven't warned yet
  if (completion < 0.3 && !earlyFinishWarned) {
    const pct = Math.round(completion * 100);
    const modal = document.querySelector('[data-early-finish-modal]');
    const message = document.querySelector('[data-early-finish-message]');
    if (modal && message) {
      message.textContent = `Only ${pct}% complete (${completed} of ~${estimated} comparisons). ` +
        `Results may be unreliable with this few comparisons.`;
      modal.classList.remove('hidden');
      return;
    }
  }

  showResults();
}

function showResults() {
  const payload = buildResultsPayload();
  if (!payload) return;
  lastResults = payload;
  renderResultsTable(payload);
  renderAnalysisSummary(payload);
  renderTierList(payload);

  // Show upload button only if connected to AniList
  const uploadButton = document.querySelector('[data-action="upload"]');
  if (uploadButton) {
    if (getToken()) {
      uploadButton.classList.remove('hidden');
    } else {
      uploadButton.classList.add('hidden');
    }
  }

  showStep('results');
}

function renderTierList(payload: ResultsPayload) {
  const tierListEl = document.querySelector('[data-tier-list]');
  const tierContainer = document.querySelector('.tier-container');
  const template = document.getElementById('tier-row-template') as HTMLTemplateElement | null;
  if (!wasm || !tierListEl || !tierContainer || !template) return;

  const showTierList = optInTierListEl?.checked ?? true;
  if (!showTierList) {
    tierListEl.classList.add('hidden');
    return;
  }

  tierListEl.classList.remove('hidden');
  tierContainer.innerHTML = '';

  // Read K value from input
  const kInput = document.getElementById('tier-k-value') as HTMLInputElement | null;
  let k = kInput ? parseInt(kInput.value, 10) : 5;
  k = Math.max(3, Math.min(7, k)); // clamp to 3-7

  // Generate tier labels dynamically
  const allLabels = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
  const tierLabels = allLabels.slice(0, k);
  wasm.compute_tiers(k);

  const tierGroups = Array.from({ length: k }, () => [] as ResultRow[]);

  console.log(`[tierlist] rendering ${payload.rows.length} items into ${k} tiers`);

  payload.rows.forEach(row => {
    const tierIdx = wasm!.get_tier_for(row.index);
    if (tierIdx >= 0 && tierIdx < k) {
      tierGroups[tierIdx].push(row);
    } else {
      console.warn(`[tierlist] item ${row.index} ("${row.title}") has invalid tier ${tierIdx}`);
    }
  });

  const nonEmptyTiers = tierGroups.filter(g => g.length > 0).length;
  console.log(`[tierlist] found ${nonEmptyTiers} non-empty tiers`);

  tierGroups.forEach((group, i) => {

    const clone = template.content.cloneNode(true) as DocumentFragment;
    const rowEl = clone.querySelector('.tier-row')!;
    const labelEl = clone.querySelector('.tier-label')!;
    const itemsEl = clone.querySelector('.tier-items')!;

    labelEl.textContent = tierLabels[i] || '?';

    group.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'tier-item';
      itemEl.title = item.title;

      const img = document.createElement('img');
      img.alt = item.title;
      img.loading = 'lazy';

      if (item.coverImage) {
        img.src = item.coverImage;
        img.onerror = () => {
          // Fallback to text-only card
          itemEl.classList.add('no-image');
          img.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.className = 'tier-item-text';
          fallback.textContent = item.title;
          itemEl.insertBefore(fallback, itemEl.firstChild);
        };
      } else {
        // No image available, show text
        itemEl.classList.add('no-image');
        img.style.display = 'none';
        const fallback = document.createElement('div');
        fallback.className = 'tier-item-text';
        fallback.textContent = item.title;
        itemEl.insertBefore(fallback, itemEl.firstChild);
      }

      const tooltip = document.createElement('div');
      tooltip.className = 'item-tooltip';
      tooltip.textContent = item.title;

      itemEl.appendChild(img);
      itemEl.appendChild(tooltip);

      itemEl.onclick = () => {
        // Option to compare this item next if clicked?
        focusPair = [item.index, -1]; // special flag or just scroll to table
        const tableRow = document.querySelector(`tr[data-index="${item.index}"]`);
        tableRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tableRow?.classList.add('highlight-flash');
        setTimeout(() => tableRow?.classList.remove('highlight-flash'), 2000);
      };

      itemsEl.appendChild(itemEl);
    });

    tierContainer.appendChild(clone);
  });
}


function applyImportMode(list: Entry[], mode: string, count: number): Entry[] {
  if (mode === 'all') return list;
  if (list.length < 2) return list;
  const sorted = [...list].sort((a, b) => b.score - a.score);
  if (mode === 'top') {
    const safeCount = Math.max(1, Math.min(count, list.length));
    return sorted.slice(0, safeCount);
  }
  if (mode === 'bottom') {
    const safeCount = Math.max(1, Math.min(count, list.length));
    return sorted.slice(-safeCount);
  }
  if (mode === 'top-bottom') {
    const safeCount = Math.max(1, Math.min(count, Math.floor(list.length / 2)));
    const top = sorted.slice(0, safeCount);
    const bottom = sorted.slice(-safeCount);
    const merged = new Map<string, Entry>();
    [...top, ...bottom].forEach((item) => {
      const key =
        item.mediaId != null ? `id:${item.mediaId}` : `title:${item.title}`;
      merged.set(key, item);
    });
    return Array.from(merged.values());
  }
  return list;
}

function applyListFilters(list: Entry[]) {
  const airedRange = currentFilters.aired ?? null;
  const startedRange = currentFilters.started ?? null;
  const completedRange = currentFilters.completed ?? null;
  const updatedRange = currentFilters.updated ?? null;
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
  const working = includeUnscored
    ? yearFiltered
    : yearFiltered.filter((entry) => entry.score > 0);
  const filtered = applyImportMode(working, importMode, sliceCount);
  const filteredScored = filtered.filter((entry) => entry.score > 0).length;
  const filteredUnscored = filtered.length - filteredScored;
  return {
    filtered,
    unscoredCount,
    filteredScored,
    filteredUnscored,
  };
}

function buildScorePriors(
  list: Entry[],
  config: ScoreConfig,
): RankingHistoryEntry[] {
  const scored = list
    .map((entry, index) => ({ index, score: entry.score }))
    .filter((entry) => entry.score > 0);
  if (scored.length < 2) return [];

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const priors: RankingHistoryEntry[] = [];
  const maxPriors = Math.min(400, list.length * 4);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const a = current.index;
    const b = next.index;

    const diff = current.score - next.score;
    if (diff === 0) continue;

    let weight = 1;
    const normalized = config.max > 0 ? diff / config.max : 0;
    if (normalized >= 0.15) weight += 1;
    if (normalized >= 0.3) weight += 1;

    for (let k = 0; k < weight; k += 1) {
      priors.push({ indices: [a, b] });
      if (priors.length >= maxPriors) return priors;
    }
  }
  return priors;
}

async function startRanking(options: StartOptions) {
  const cleaned = options.list
    .map((entry) => ({
      title: typeof entry.title === 'string' ? entry.title.trim() : '',
      mediaId: entry.mediaId,
      score: Number.isFinite(entry.score) ? entry.score : 0,
      airedYear: entry.airedYear,
      seasonYear: entry.seasonYear,
      startedAtYear: entry.startedAtYear,
      completedAtYear: entry.completedAtYear,
      updatedAtYear: entry.updatedAtYear,
      coverImage: entry.coverImage,
    }))
    .filter((entry) => entry.title.length > 0);

  if (cleaned.length < 2) {
    setStatus(importStatus, 'Need at least two valid titles to rank.');
    return;
  }

  items = cleaned;
  comparisons = options.comparisons ? options.comparisons.slice() : [];
  priorComparisons = options.priorComparisons
    ? options.priorComparisons.slice()
    : [];
  scoreFormat = options.scoreFormat;
  preserveRange = options.preserveRange;
  includeUnscored = options.includeUnscored;
  mediaType = options.mediaType ?? mediaType;
  importMode = options.importMode ?? importMode;
  sliceCount = options.sliceCount ?? sliceCount;
  useScorePrior = options.useScorePrior ?? useScorePrior;
  explorationEpsilon = clamp01(
    options.explorationEpsilon ?? explorationEpsilon,
  );
  uncertaintyPrior = parsePositive(
    options.uncertaintyPrior ?? uncertaintyPrior,
    uncertaintyPrior,
  );
  rankGoal = options.rankGoal ?? rankGoal;
  rankMode = options.rankMode ?? rankMode;
  if (rankMode === 'pairwise') {
    rankPhase = 'pairwise';
  } else if (rankMode === 'group') {
    rankPhase = 'group';
  } else {
    rankPhase = options.rankPhase ?? 'group';
  }
  rankObjective = options.rankObjective ?? rankObjective;
  modeChosen = options.modeChosen ?? modeChosen;
  applyAnalysisDefaults(items.length);
  analysisComputedAt = null;
  if (analysisStatus) {
    analysisStatus.textContent = '';
  }

  // Disable tier list by default if no cover images (CSV imports)
  const hasCoverImages = items.some(item => item.coverImage);
  if (optInTierListEl) {
    if (!hasCoverImages) {
      optInTierListEl.checked = false;
      optInTierListEl.disabled = true;
      const label = optInTierListEl.parentElement;
      if (label) {
        label.title = 'Tier list requires cover images (only available for AniList imports)';
        label.style.opacity = '0.5';
      }
    } else {
      optInTierListEl.disabled = false;
      optInTierListEl.checked = true;
      const label = optInTierListEl.parentElement;
      if (label) {
        label.title = '';
        label.style.opacity = '1';
      }
    }
  }

  const config = getScoreConfig(scoreFormat);
  if (useScorePrior && priorComparisons.length === 0) {
    priorComparisons = buildScorePriors(items, config);
  }

  console.info('[rank] starting ranking', {
    count: items.length,
    sample: items.slice(0, 3).map((entry) => entry.title),
    comparisons: comparisons.length,
    priors: priorComparisons.length,
    scoreFormat,
    mediaType,
  });

  const wasmApi = await ensureWasm();
  try {
    const ok = wasmApi.create_ranker(items.length);
    if (!ok) {
      console.error('[rank] create_ranker returned false');
      setStatus(importStatus, 'Failed to create ranker.');
      return;
    }
    wasmApi.set_uncertainty_prior(uncertaintyPrior);
    wasmApi.set_pair_policy(resolvePairPolicy());
  } catch (error) {
    console.error('[rank] create_ranker threw', error);
    setStatus(
      importStatus,
      error instanceof Error
        ? `Ranker init failed: ${error.message}`
        : 'Ranker init failed.',
    );
    return;
  }

  if (priorComparisons.length > 0) {
    console.info('[rank] applying priors', priorComparisons.length);
    priorComparisons.forEach((entry) => {
      const ok = applyRanking(wasmApi, entry.indices);
      if (!ok) {
        console.warn('[rank] failed to apply prior', entry);
      }
    });
  }

  if (comparisons.length > 0) {
    console.info('[rank] replaying comparisons', comparisons.length);
    comparisons.forEach((entry) => {
      const ok = applyRanking(wasmApi, entry.indices);
      if (!ok) {
        console.warn('[rank] failed to replay comparison', entry);
      }
    });
  }

  saveState();
  updateProgress();
  if (modeChosen) {
    enterActiveStep();
  } else {
    showStep('mode');
  }
}

async function handleImport() {
  setStatus(importStatus, 'Importing from AniList...');
  const token = getToken();
  if (!token) {
    setStatus(importStatus, 'Connect to AniList first.');
    return;
  }
  try {
    mediaType = readMediaType();
    const result = await fetchMediaList(token, mediaType);
    detectedScoreFormat = result.scoreFormat ?? inferScoreFormat(result.entries);
    updateScoreFormatLabel();

    const list = result.entries;
    console.info('[rank] fetched AniList entries', {
      count: list.length,
      mediaType,
    });

    const { selectedFormat } = readImportOptions();
    console.info('[rank] score settings', {
      detected: detectedScoreFormat,
      selected: selectedFormat,
      resolved: scoreFormat,
      mediaType,
      preserveRange,
      useScorePrior,
      includeUnscored,
      explorationEpsilon,
      uncertaintyPrior,
    });

    const {
      filtered,
      unscoredCount,
      filteredScored,
      filteredUnscored,
    } = applyListFilters(list);

    console.info('[rank] filtered entries', {
      count: filtered.length,
      mode: importMode,
      sliceCount,
    });

    const details = includeUnscored
      ? `${filteredScored} scored, ${filteredUnscored} unscored included`
      : `${filteredScored} scored, ${unscoredCount} unscored excluded`;
    setStatus(importStatus, `Imported ${filtered.length} titles (${details}).`);
    pendingStart = {
      list: filtered,
      scoreFormat,
      preserveRange,
      includeUnscored,
      useScorePrior,
      mediaType,
      importMode,
      sliceCount,
      explorationEpsilon,
      uncertaintyPrior,
    };
    modeChosen = false;
    showStep('mode');
  } catch (error) {
    console.error('[rank] import failed', error);
    setStatus(
      importStatus,
      error instanceof Error ? error.message : 'Import failed.',
    );
  }
}

async function handleCsvImport() {
  setStatus(importStatus, 'Importing from CSV...');
  const file = csvFileEl?.files?.[0];
  if (!file) {
    setStatus(importStatus, 'Select a CSV file first.');
    return;
  }
  try {
    const text = await file.text();
    const list = parseCsvEntries(text);
    if (list.length < 2) {
      setStatus(importStatus, 'Need at least two valid titles to rank.');
      return;
    }

    detectedScoreFormat = inferScoreFormat(list);
    updateScoreFormatLabel();
    const { selectedFormat } = readImportOptions();

    console.info('[rank] parsed CSV entries', { count: list.length });
    console.info('[rank] score settings', {
      detected: detectedScoreFormat,
      selected: selectedFormat,
      resolved: scoreFormat,
      mediaType,
      preserveRange,
      useScorePrior,
      includeUnscored,
      explorationEpsilon,
      uncertaintyPrior,
    });

    const {
      filtered,
      unscoredCount,
      filteredScored,
      filteredUnscored,
    } = applyListFilters(list);

    console.info('[rank] filtered CSV entries', {
      count: filtered.length,
      mode: importMode,
      sliceCount,
    });

    const details = includeUnscored
      ? `${filteredScored} scored, ${filteredUnscored} unscored included`
      : `${filteredScored} scored, ${unscoredCount} unscored excluded`;
    setStatus(importStatus, `Imported ${filtered.length} titles (${details}).`);
    pendingStart = {
      list: filtered,
      scoreFormat,
      preserveRange,
      includeUnscored,
      mediaType,
      useScorePrior,
      importMode,
      sliceCount,
      explorationEpsilon,
      uncertaintyPrior,
    };
    modeChosen = false;
    showStep('mode');
  } catch (error) {
    console.error('[rank] CSV import failed', error);
    setStatus(
      importStatus,
      error instanceof Error ? error.message : 'CSV import failed.',
    );
  }
}

function handleChoice(result: number) {
  if (!wasm || !currentPair) return;
  const [left, right] = currentPair;

  // Add visual feedback for selected choice
  const choiceMap: Record<number, string> = { 1: 'A', 2: 'TIE', 3: 'B' };
  const btn = document.querySelector(`[data-choice="${choiceMap[result]}"]`);
  if (btn) {
    btn.classList.add('choice-selected');
    setTimeout(() => btn.classList.remove('choice-selected'), 300);
  }

  // Clear redo stack on new comparison
  redoStack = [];
  updateRedoButton();

  // result: 1=A wins, 2=Tie, 3=B wins
  let indices: number[];
  if (result === 1) {
    indices = [left, right];
  } else if (result === 3) {
    indices = [right, left];
  } else {
    // Tie handles by adding both directions (approximate)
    indices = [left, right];
    const ok1 = applyRanking(wasm, [left, right]);
    const ok2 = applyRanking(wasm, [right, left]);
    if (!ok1 || !ok2) {
      setStatus(importStatus, 'Failed to record tie.');
      return;
    }
    comparisons.push({ indices: [left, right] });
    comparisons.push({ indices: [right, left] });
    saveState();
    updateProgress();
    renderPair();
    return;
  }

  const ok = applyRanking(wasm, indices);
  if (!ok) {
    setStatus(importStatus, 'Failed to record comparison.');
    return;
  }
  comparisons.push({ indices });
  saveState();
  updateProgress();
  renderPair();
}

function undoLast() {
  if (!wasm) return;
  if (comparisons.length === 0) {
    setStatus(importStatus, 'No comparisons to undo yet.');
    return;
  }
  const ok = wasm.undo_last();
  if (!ok) {
    setStatus(importStatus, 'Undo failed.');
    return;
  }
  const undone = comparisons.pop();
  if (undone) {
    redoStack.push(undone);
  }
  saveState();
  updateProgress();
  renderPair();
  updateRedoButton();
}

function redoLast() {
  if (!wasm) return;
  if (redoStack.length === 0) {
    setStatus(importStatus, 'Nothing to redo.');
    return;
  }
  const toRedo = redoStack.pop();
  if (!toRedo) return;

  const ok = applyRanking(wasm, toRedo.indices);
  if (!ok) {
    setStatus(importStatus, 'Redo failed.');
    redoStack.push(toRedo); // put it back
    return;
  }
  comparisons.push(toRedo);
  saveState();
  updateProgress();
  renderPair();
  updateRedoButton();
}

function updateRedoButton() {
  const redoBtn = document.querySelector('[data-action="redo"]');
  if (redoBtn) {
    (redoBtn as HTMLButtonElement).disabled = redoStack.length === 0;
  }
}

function resumeSession() {
  const saved = loadState();
  if (!saved) {
    setStatus(sessionStatus, 'No saved session found.');
    return false;
  }
  pendingStart = null;

  if (includeUnscoredEl) includeUnscoredEl.checked = saved.includeUnscored;
  if (preserveRangeEl) preserveRangeEl.checked = saved.preserveRange;
  if (scoreFormatEl) scoreFormatEl.value = saved.scoreFormat;
  if (mediaTypeEl) mediaTypeEl.value = saved.mediaType;
  if (modeEl && saved.importMode) modeEl.value = saved.importMode;
  if (countEl && Number.isFinite(saved.sliceCount)) {
    countEl.value = saved.sliceCount.toString();
  }
  if (useScorePriorEl) useScorePriorEl.checked = saved.useScorePrior;
  if (explorationEl) explorationEl.value = saved.explorationEpsilon.toString();
  if (uncertaintyPriorEl) {
    uncertaintyPriorEl.value = saved.uncertaintyPrior.toString();
  }
  if (scratchGoalEl && saved.rankObjective) {
    scratchGoalEl.value = saved.rankObjective;
  }

  const resolvedModeChosen = saved.modeChosen ?? true;
  startRanking({
    list: saved.items,
    comparisons: saved.comparisons,
    priorComparisons: saved.priorComparisons,
    scoreFormat: saved.scoreFormat,
    preserveRange: saved.preserveRange,
    includeUnscored: saved.includeUnscored,
    mediaType: saved.mediaType,
    useScorePrior: saved.useScorePrior,
    importMode: saved.importMode,
    sliceCount: saved.sliceCount,
    explorationEpsilon: saved.explorationEpsilon,
    uncertaintyPrior: saved.uncertaintyPrior,
    rankGoal: saved.rankGoal,
    rankMode: saved.rankMode,
    rankPhase: saved.rankPhase,
    rankObjective: saved.rankObjective,
    modeChosen: resolvedModeChosen,
  }).then(() => {
    if (saved.optInTierList != null && optInTierListEl) {
      optInTierListEl.checked = saved.optInTierList;
    }
    setStatus(sessionStatus, 'Session resumed.');
  })
    .catch((error) => {
      setStatus(
        sessionStatus,
        error instanceof Error ? error.message : 'Resume failed.',
      );
    });
  return true;
}

function clearSession() {
  const modal = document.querySelector('[data-start-over-modal]');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function performClearSession() {
  localStorage.removeItem(STATE_KEY);
  comparisons = [];
  redoStack = [];
  priorComparisons = [];
  items = [];
  lastResults = null;
  selectedIndices = new Set();
  currentFilters = {};
  currentGroup = null;
  pendingStart = null;
  rankGoal = 'rescore';
  rankMode = 'pairwise';
  rankPhase = 'pairwise';
  rankObjective = 'full';
  modeChosen = false;
  analysisComputedAt = null;
  if (analysisStatus) {
    analysisStatus.textContent = '';
  }
  setStatus(sessionStatus, 'Session cleared.');
  showStep(getToken() ? 'import' : 'connect');
}

function buildUploadPayload() {
  if (!wasm || !items.length) return [];
  const useSelection = lastResults != null;
  if (useSelection && selectedIndices.size === 0) {
    return [];
  }
  const config = getScoreConfig(scoreFormat);
  const range = preserveRange ? getScoreRange(items) : null;
  const entries = items
    .map((item, index) => ({
      index,
      title: item.title,
      mediaId: item.mediaId,
      originalScore: item.score,
      rank: wasm!.get_rank_for(index),
    }))
    .filter((entry) => entry.rank > 0 && entry.mediaId != null)
    .filter((entry) => !useSelection || selectedIndices.has(entry.index))
    .filter((entry) => includeUnscored || entry.originalScore > 0)
    .sort((a, b) => a.rank - b.rank);

  const total = entries.length;
  const scoreSlots = shouldPreserveScoreSlots()
    ? buildScoreSlots(items, config)
    : [];
  const slotMap =
    scoreSlots.length > 1 ? assignScoresByRank(entries, scoreSlots) : null;
  return entries.map((entry) => {
    const score =
      slotMap?.get(entry.index) ??
      mapRankToScore(entry.rank, total, config, range);
    return { mediaId: entry.mediaId as number, score };
  });
}

function downloadSession() {
  const payload: SavedState = {
    items,
    comparisons,
    priorComparisons,
    scoreFormat,
    preserveRange,
    includeUnscored,
    mediaType,
    importMode,
    sliceCount,
    useScorePrior,
    explorationEpsilon,
    uncertaintyPrior,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter-session.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadResults() {
  if (!lastResults) {
    setStatus(importStatus, 'No results to export yet.');
    return;
  }
  const blob = new Blob([JSON.stringify(lastResults, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter-results.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER_ALIASES: Record<string, keyof Entry> = {
  title: 'title',
  name: 'title',
  score: 'score',
  rating: 'score',
  mediaid: 'mediaId',
  id: 'mediaId',
  airedyear: 'airedYear',
  seasonyear: 'seasonYear',
  startedyear: 'startedAtYear',
  startedatyear: 'startedAtYear',
  completedyear: 'completedAtYear',
  completedatyear: 'completedAtYear',
  updatedyear: 'updatedAtYear',
  updatedatyear: 'updatedAtYear',
};

function normalizeCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;
  const pushRow = () => {
    if (row.length === 0 && value.trim().length === 0) {
      value = '';
      return;
    }
    row.push(value);
    rows.push(row);
    row = [];
    value = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(value);
      value = '';
      continue;
    }
    if (char === '\n') {
      pushRow();
      continue;
    }
    if (char === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      pushRow();
      continue;
    }
    value += char;
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function parseCsvEntries(text: string): Entry[] {
  const rows = parseCsvRows(text).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );
  if (rows.length === 0) return [];
  const headerCandidate = rows[0].map(normalizeCsvHeader);
  const hasHeader = headerCandidate.some(
    (header) => header in CSV_HEADER_ALIASES,
  );
  const columnMap = new Map<keyof Entry, number>();
  let startIndex = 0;
  if (hasHeader) {
    headerCandidate.forEach((header, index) => {
      const key = CSV_HEADER_ALIASES[header];
      if (key && !columnMap.has(key)) {
        columnMap.set(key, index);
      }
    });
    startIndex = 1;
  } else {
    columnMap.set('title', 0);
    if (rows[0].length > 1) {
      columnMap.set('score', 1);
    }
    if (rows[0].length > 2) {
      columnMap.set('mediaId', 2);
    }
  }

  const entries: Entry[] = [];
  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const titleIndex = columnMap.get('title');
    const title = titleIndex != null ? row[titleIndex]?.trim() : '';
    if (!title) continue;
    const scoreIndex = columnMap.get('score');
    const scoreRaw = scoreIndex != null ? row[scoreIndex] : undefined;
    const scoreValue = Number(scoreRaw);
    const mediaIndex = columnMap.get('mediaId');
    const mediaRaw = mediaIndex != null ? row[mediaIndex] : undefined;
    const mediaValue = Number(mediaRaw);
    entries.push({
      title,
      mediaId:
        Number.isFinite(mediaValue) && mediaValue > 0
          ? Math.floor(mediaValue)
          : null,
      score: Number.isFinite(scoreValue) ? scoreValue : 0,
      airedYear: parseOptionalInt(
        row[columnMap.get('airedYear') ?? -1],
      ),
      seasonYear: parseOptionalInt(
        row[columnMap.get('seasonYear') ?? -1],
      ),
      startedAtYear: parseOptionalInt(
        row[columnMap.get('startedAtYear') ?? -1],
      ),
      completedAtYear: parseOptionalInt(
        row[columnMap.get('completedAtYear') ?? -1],
      ),
      updatedAtYear: parseOptionalInt(
        row[columnMap.get('updatedAtYear') ?? -1],
      ),
    });
  }
  return entries;
}

function parseIntInput(
  value: string | null | undefined,
  fallback: number,
  min: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const asInt = Math.floor(parsed);
  return asInt < min ? min : asInt;
}

function downloadCsv() {
  if (!lastResults) {
    setStatus(importStatus, 'No results to export yet.');
    return;
  }
  const lines = [
    [
      'rank',
      'title',
      'original_score',
      'new_score',
      'media_id',
      'rank_ci_low',
      'rank_ci_high',
      'rank_mean',
      'topk_confidence',
    ].join(','),
  ];
  lastResults.rows.forEach((row) => {
    lines.push(
      [
        row.rank.toString(),
        escapeCsv(row.title),
        row.originalScore.toString(),
        row.newScore.toString(),
        row.mediaId != null ? row.mediaId.toString() : '',
        row.rankLow?.toString() ?? '',
        row.rankHigh?.toString() ?? '',
        row.rankMean != null ? row.rankMean.toFixed(2) : '',
        row.topKConfidence != null
          ? row.topKConfidence.toFixed(4)
          : '',
      ].join(','),
    );
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'moonsorter-results.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderAnalysisSummary(payload: ResultsPayload) {
  if (!analysisSummary) return;
  if (!payload.analysis || !wasm || !wasm.get_uncertainty_ready()) {
    analysisSummary.classList.add('hidden');
    if (analysisUncertainList) {
      analysisUncertainList.innerHTML = '';
    }
    return;
  }
  const medianWidth = wasm.get_uncertainty_median_width();
  const p90Width = wasm.get_uncertainty_p90_width();
  const widthTarget = wasm.get_uncertainty_width_target();
  const topKSize = payload.analysis.topK;
  const topKThreshold = 0.8;
  const topKRows = Math.min(topKSize, payload.rows.length);
  const topKStable = wasm.get_topk_stable_count(topKThreshold);
  const topKTarget = Math.max(1, Math.floor(topKSize * 0.7));
  const stable =
    medianWidth <= widthTarget && topKStable >= topKTarget && topKRows > 0;
  const groupOnly = rankMode === 'group' && rankPhase === 'group';

  if (analysisMedian) {
    analysisMedian.textContent = `Typical CI width: ${medianWidth} ranks (90% <= ${p90Width})`;
  }
  if (analysisTopKSummary) {
    analysisTopKSummary.textContent = `Top-${topKSize} locked: ${topKStable}/${topKRows} at >= ${Math.round(
      topKThreshold * 100,
    )}%`;
  }
  if (analysisRecommendation) {
    if (groupOnly) {
      analysisRecommendation.textContent = stable
        ? 'Looks stable. Keep ranking more groups if anything still feels off.'
        : 'Needs more ranking. Keep sorting new groups to tighten the intervals.';
    } else {
      analysisRecommendation.textContent = stable
        ? 'Looks stable. Spot-check anything that still feels off using the chips below.'
        : 'Needs more comparisons. Click a title below to compare it with its nearest neighbor.';
    }
  }
  if (analysisUncertainList) {
    analysisUncertainList.innerHTML = '';
    if (groupOnly) {
      analysisUncertainList.textContent =
        'Group mode: continue ranking batches to tighten the uncertainty bands.';
      analysisSummary.classList.remove('hidden');
      return;
    }
    const rowByIndex = new Map(payload.rows.map((row) => [row.index, row]));
    const rowByRank = new Map(payload.rows.map((row) => [row.rank, row]));
    const ranked: Array<{
      index: number;
      title: string;
      rank: number;
      width: number;
    }> = [];
    const limit = Math.min(6, payload.rows.length);
    for (let i = 0; i < limit; i += 1) {
      const idx = wasm.get_uncertainty_order_index(i);
      if (idx < 0) break;
      const row = rowByIndex.get(idx);
      if (!row) continue;
      ranked.push({
        index: idx,
        title: row.title,
        rank: row.rank,
        width: wasm.get_uncertainty_width_for(idx),
      });
    }
    const pickNeighborIndex = (row: ResultRow): number | null => {
      const prev = rowByRank.get(row.rank - 1);
      const next = rowByRank.get(row.rank + 1);
      if (prev && next) {
        const prevWidth = wasm!.get_uncertainty_width_for(prev.index);
        const nextWidth = wasm!.get_uncertainty_width_for(next.index);
        return prevWidth >= nextWidth ? prev.index : next.index;
      }
      if (prev) return prev.index;
      if (next) return next.index;
      return null;
    };
    ranked.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'analysis-chip';
      button.textContent = `#${entry.rank} ${entry.title} (CI ${entry.width})`;
      button.addEventListener('click', () => {
        const row = rowByIndex.get(entry.index);
        if (!row) return;
        const neighborIndex = pickNeighborIndex(row);
        if (neighborIndex == null) return;
        rankPhase = 'pairwise';
        saveState();
        focusPair = [entry.index, neighborIndex];
        showStep('compare');
        renderPair();
      });
      analysisUncertainList.appendChild(button);
    });
  }
  analysisSummary.classList.remove('hidden');
}

function runAnalysis() {
  if (!wasm) {
    setStatus(importStatus, 'Load the ranker first.');
    return;
  }
  analysisSamples = parseIntInput(analysisSamplesEl?.value, analysisSamples, 10);
  analysisTopK = parseIntInput(analysisTopKEl?.value, analysisTopK, 1);
  analysisMaxIter = parseIntInput(analysisMaxIterEl?.value, analysisMaxIter, 5);
  if (analysisStatus) {
    analysisStatus.textContent = 'Running uncertainty analysis...';
  }
  wasm.set_sampling_seed(Date.now());
  const ok = wasm.compute_uncertainty(
    analysisSamples,
    analysisMaxIter,
    analysisTopK,
  );
  if (!ok) {
    if (analysisStatus) {
      analysisStatus.textContent = 'Uncertainty analysis failed.';
    }
    return;
  }
  analysisComputedAt = new Date().toISOString();
  if (analysisStatus) {
    analysisStatus.textContent = `Uncertainty ready (${analysisSamples} samples).`;
  }
  showResults();
}

document.querySelectorAll('[data-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    const choice = button.getAttribute('data-choice');
    if (choice === 'A') handleChoice(1);
    if (choice === 'TIE') handleChoice(2);
    if (choice === 'B') handleChoice(3);
  });
});

document.addEventListener('keydown', (event) => {
  if (steps.compare?.classList.contains('hidden')) return;
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

function renderSortGroup() {
  const container = document.querySelector('[data-sortable-list]');
  if (!container || !currentGroup) return;
  container.innerHTML = '';

  currentGroup.forEach((idx, i) => {
    const item = items[idx];
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

function submitSort() {
  if (!wasm || !currentGroup) return;
  const container = document.querySelector('[data-sortable-list]');
  if (!container) return;

  const orderedIndices = Array.from(container.querySelectorAll('.sortable-item'))
    .map(li => parseInt((li as HTMLElement).dataset.index || '0', 10));

  if (orderedIndices.length < 2) return;

  const ok = applyRanking(wasm, orderedIndices);
  if (!ok) {
    setStatus(importStatus, 'Failed to record group ranking.');
    return;
  }

  comparisons.push({ indices: orderedIndices });
  saveState();
  updateProgress();
  currentGroup = null;
  if (rankMode === 'group' || rankPhase === 'group') {
    startGroupSort();
    return;
  }
  showStep('compare');
  renderPair();
}

function skipSort() {
  currentGroup = null;
  if (rankMode === 'group' || rankPhase === 'group') {
    startGroupSort();
    return;
  }
  showStep('compare');
  renderPair();
}

const submitSortButton = document.querySelector('[data-action="submit-sort"]');
if (submitSortButton) {
  submitSortButton.addEventListener('click', submitSort);
}

const skipSortButton = document.querySelector('[data-action="skip-sort"]');
if (skipSortButton) {
  skipSortButton.addEventListener('click', skipSort);
}

if (switchToPairwiseButton) {
  switchToPairwiseButton.addEventListener('click', () => {
    rankPhase = 'pairwise';
    saveState();
    enterActiveStep();
  });
}

stepperButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.getAttribute('data-step-target') as StepKey | null;
    if (!target) return;
    navigateStep(target);
  });
});


document.querySelectorAll('[data-action="connect"]').forEach((button) => {
  button.addEventListener('click', () => {
    try {
      login();
    } catch (error) {
      setStatus(
        connectStatus,
        error instanceof Error ? error.message : 'Missing client ID.',
      );
    }
  });
});

document.querySelectorAll('[data-action="csv"]').forEach((button) => {
  button.addEventListener('click', () => {
    showStep('import');
    setStatus(importStatus, 'Select a CSV file to begin.');
  });
});

document.querySelectorAll('[data-action="demo"]').forEach((button) => {
  button.addEventListener('click', () => {
    pendingStart = {
      list: demoItems,
      scoreFormat,
      preserveRange,
      includeUnscored,
      mediaType: readMediaType(),
      useScorePrior: false,
      importMode: 'all',
      sliceCount: demoItems.length,
    };
    currentFilters = {};
    modeChosen = false;
    showStep('mode');
  });
});

const importButton = document.querySelector('[data-action="import"]');
if (importButton) {
  importButton.addEventListener('click', handleImport);
}

const importCsvButton = document.querySelector('[data-action="import-csv"]');
if (importCsvButton) {
  importCsvButton.addEventListener('click', handleCsvImport);
}

const logoutButton = document.querySelector('[data-action="logout"]');
if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    logout();
    setStatus(importStatus, 'Disconnected.');
    showStep('connect');
  });
}

const backToImportButton = document.querySelector(
  '[data-action="back-to-import"]',
);
if (backToImportButton) {
  backToImportButton.addEventListener('click', () => {
    showStep('import');
  });
}

const resumeButton = document.querySelector('[data-action="resume"]');
if (resumeButton) {
  resumeButton.addEventListener('click', resumeSession);
}

const clearButton = document.querySelector('[data-action="clear"]');
if (clearButton) {
  clearButton.addEventListener('click', clearSession);
}

const undoButton = document.querySelector('[data-action="undo"]');
if (undoButton) {
  undoButton.addEventListener('click', undoLast);
}

const redoButton = document.querySelector('[data-action="redo"]');
if (redoButton) {
  redoButton.addEventListener('click', redoLast);
}

const finishButton = document.querySelector('[data-action="finish"]');
if (finishButton) {
  finishButton.addEventListener('click', handleFinish);
}

const cancelFinishButton = document.querySelector('[data-action="cancel-finish"]');
if (cancelFinishButton) {
  cancelFinishButton.addEventListener('click', () => {
    const modal = document.querySelector('[data-early-finish-modal]');
    if (modal) modal.classList.add('hidden');
  });
}

const confirmFinishButton = document.querySelector('[data-action="confirm-finish"]');
if (confirmFinishButton) {
  confirmFinishButton.addEventListener('click', () => {
    const modal = document.querySelector('[data-early-finish-modal]');
    if (modal) modal.classList.add('hidden');
    earlyFinishWarned = true;
    showResults();
  });
}

const cancelStartOverButton = document.querySelector('[data-action="cancel-start-over"]');
if (cancelStartOverButton) {
  cancelStartOverButton.addEventListener('click', () => {
    const modal = document.querySelector('[data-start-over-modal]');
    if (modal) modal.classList.add('hidden');
  });
}

const confirmStartOverButton = document.querySelector('[data-action="confirm-start-over"]');
if (confirmStartOverButton) {
  confirmStartOverButton.addEventListener('click', () => {
    const modal = document.querySelector('[data-start-over-modal]');
    if (modal) modal.classList.add('hidden');
    performClearSession();
  });
}

const uploadButton = document.querySelector('[data-action="upload"]') as
  | HTMLButtonElement
  | null;
if (uploadButton) {
  uploadButton.addEventListener('click', async () => {
    const token = getToken();
    if (!token) {
      setStatus(connectStatus, 'Connect to AniList first.');
      return;
    }
    const updates = buildUploadPayload();
    if (!updates.length) {
      setStatus(importStatus, 'Nothing selected to upload yet.');
      return;
    }
    uploadButton.textContent = 'Uploading...';
    try {
      await updateScores(token, updates);
      uploadButton.textContent = 'Uploaded!';
    } catch (error) {
      uploadButton.textContent = 'Upload selected';
      setStatus(
        importStatus,
        error instanceof Error ? error.message : 'Upload failed.',
      );
    }
  });
}

const downloadResultsButton = document.querySelector(
  '[data-action="download-results"]',
);
if (downloadResultsButton) {
  downloadResultsButton.addEventListener('click', downloadResults);
}

const downloadCsvButton = document.querySelector(
  '[data-action="download-csv"]',
);
if (downloadCsvButton) {
  downloadCsvButton.addEventListener('click', downloadCsv);
}

const downloadSessionButton = document.querySelector(
  '[data-action="download-session"]',
);
if (downloadSessionButton) {
  downloadSessionButton.addEventListener('click', downloadSession);
}

const selectAllButton = document.querySelector('[data-action="select-all"]');
if (selectAllButton) {
  selectAllButton.addEventListener('click', () => {
    if (!lastResults) return;
    selectedIndices = new Set(lastResults.rows.map((row) => row.index));
    renderResultsTable(lastResults);
  });
}

const selectNoneButton = document.querySelector('[data-action="select-none"]');
if (selectNoneButton) {
  selectNoneButton.addEventListener('click', () => {
    selectedIndices = new Set();
    if (lastResults) {
      renderResultsTable(lastResults);
    }
  });
}

// Table column sorting
document.querySelectorAll('[data-sort]').forEach((header) => {
  header.addEventListener('click', () => {
    const column = header.getAttribute('data-sort');
    if (!column || !lastResults) return;

    if (sortColumn === column) {
      // Toggle direction
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column
      sortColumn = column;
      sortDirection = 'asc';
    }

    renderResultsTable(lastResults);
  });
});

const runAnalysisButton = document.querySelector('[data-action="run-analysis"]');
if (runAnalysisButton) {
  runAnalysisButton.addEventListener('click', runAnalysis);
}

document.querySelectorAll('[data-rank-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    const goal = button.getAttribute('data-rank-goal') as RankGoal | null;
    const mode = button.getAttribute('data-rank-mode') as RankMode | null;
    if (!goal || !mode) return;
    applyModeSelection(goal, mode);
  });
});

const resumeComparisonsButton = document.querySelector(
  '[data-action="resume-comparisons"]',
);
if (resumeComparisonsButton) {
  resumeComparisonsButton.addEventListener('click', () => {
    if (rankMode === 'pairwise' || rankPhase === 'pairwise') {
      showStep('compare');
      renderPair();
      return;
    }
    startGroupSort();
  });
}

const restartButton = document.querySelector('[data-action="restart"]');
if (restartButton) {
  restartButton.addEventListener('click', () => {
    clearSession();
    showStep(getToken() ? 'import' : 'connect');
  });
}

const downloadTierlistButton = document.querySelector('[data-action="download-tierlist"]');
if (downloadTierlistButton) {
  downloadTierlistButton.addEventListener('click', async () => {
    const container = document.querySelector('.tier-container') as HTMLElement;
    if (!container) return;

    const originalText = downloadTierlistButton.textContent;
    downloadTierlistButton.textContent = 'Generating...';
    downloadTierlistButton.setAttribute('disabled', 'true');

    // To fix CORS for canvas, we temporarily use our proxy for images
    const imgs = Array.from(container.querySelectorAll('img'));
    const originalSrcs = new Map<HTMLImageElement, string>();

    imgs.forEach(img => {
      originalSrcs.set(img, img.src);
      if (img.src && !img.src.startsWith(window.location.origin)) {
        img.crossOrigin = "anonymous";
        img.src = `/api/proxy-image?url=${encodeURIComponent(img.src)}`;
      }
    });

    try {
      const h2c = (window as any).html2canvas;
      if (!h2c) {
        throw new Error('html2canvas not loaded');
      }

      // Small delay to ensure proxied images start loading if not cached
      await new Promise(r => setTimeout(r, 100));

      const canvas = await h2c(container, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#111',
        scale: 2,
        logging: false,
      });

      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `moonsorter-tierlist-${new Date().getTime()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      downloadTierlistButton.textContent = 'Saved!';
    } catch (error) {
      console.error('[tierlist] Export failed', error);
      alert('Export failed. Browser security still blocked the images. Manual screenshot is the safest bet!');
      downloadTierlistButton.textContent = 'Failed';
    } finally {
      // Restore original sources
      imgs.forEach(img => {
        const original = originalSrcs.get(img);
        if (original) {
          img.src = original;
          img.removeAttribute('crossOrigin');
        }
      });

      setTimeout(() => {
        downloadTierlistButton.textContent = originalText;
        downloadTierlistButton.removeAttribute('disabled');
      }, 2000);
    }
  });
}

// Re-render tier list when K value changes
const tierKInput = document.getElementById('tier-k-value');
if (tierKInput) {
  tierKInput.addEventListener('change', () => {
    if (lastResults) {
      renderTierList(lastResults);
    }
  });
}



function initFlow() {
  const hasToken = getToken();
  console.info('[rank] token present:', Boolean(hasToken));
  const params = new URLSearchParams(window.location.search);
  const importParam = params.get('import');
  if (params.get('demo') === '1') {
    startRanking({
      list: demoItems,
      scoreFormat,
      preserveRange,
      includeUnscored,
      mediaType: readMediaType(),
      useScorePrior: false,
      importMode: 'all',
      sliceCount: demoItems.length,
    });
    currentFilters = {};
  } else if (importParam === 'csv') {
    showStep('import');
    setStatus(importStatus, 'Select a CSV file to begin.');
  } else if (importParam === 'anilist') {
    if (hasToken) {
      showStep('import');
    } else {
      showStep('connect');
      setStatus(connectStatus, 'Connect to AniList to import your list.');
    }
  } else if (hasToken) {
    showStep('import');
  } else {
    showStep('connect');
  }
}

consumeAuthResponse()
  .catch((error) => {
    setStatus(
      connectStatus,
      error instanceof Error ? error.message : 'Authorization failed.',
    );
  })
  .finally(initFlow);
