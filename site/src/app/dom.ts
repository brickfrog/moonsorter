export type Steps = {
  connect: HTMLElement | null;
  import: HTMLElement | null;
  mode: HTMLElement | null;
  compare: HTMLElement | null;
  compareActions: HTMLElement | null;
  results: HTMLElement | null;
  sortGroup: HTMLElement | null;
};

export type StepKey = 'connect' | 'import' | 'mode' | 'compare' | 'results';

function query<T extends HTMLElement = HTMLElement>(selector: string): T | null {
  return document.querySelector(selector) as T | null;
}

function queryAll(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
}

export const dom = {
  // Step containers
  steps: {
    connect: query('[data-step="connect"]'),
    import: query('[data-step="import"]'),
    mode: query('[data-step="mode"]'),
    compare: query('[data-step="compare"]'),
    compareActions: query('[data-step="compare-actions"]'),
    results: query('[data-step="results"]'),
    sortGroup: query('[data-step="sort-group"]'),
  } as Steps,

  // Stepper navigation
  stepperButtons: queryAll('[data-step-target]') as HTMLButtonElement[],
  stepperStatus: query('[data-stepper-status]'),
  rankLoading: query('[data-rank-loading]'),

  // Status displays
  connectStatus: query('[data-connect-status]'),
  importStatus: query('[data-import-status]'),
  sessionStatus: query('[data-session-status]'),

  // Progress elements
  progressText: query('[data-progress-text]'),
  progressFill: query<HTMLDivElement>('[data-progress-fill]'),
  progressMeta: query('[data-progress-meta]'),
  groupCoverage: query('[data-group-coverage]'),
  groupEstimate: query('[data-group-estimate]'),

  // Comparison UI
  leftTitle: query('[data-choice-title="A"]'),
  rightTitle: query('[data-choice-title="B"]'),
  choiceButtons: queryAll('[data-choice]'),
  pairStrategyBadge: query('[data-pair-strategy]'),

  // Results UI
  rankingsBody: query('[data-rankings-body]'),
  selectionStatus: query('[data-selection-status]'),

  // Analysis UI
  analysisSummary: query('[data-analysis-summary]'),
  analysisMedian: query('[data-analysis-median]'),
  analysisTopKSummary: query('[data-analysis-topk]'),
  analysisRecommendation: query('[data-analysis-recommendation]'),
  analysisUncertainList: query<HTMLDivElement>('[data-analysis-uncertain-list]'),
  analysisResumeButton: query<HTMLButtonElement>('[data-action="resume-comparisons"]'),
  analysisStatus: query('[data-analysis-status]'),

  // Tier list
  tierList: query('[data-tier-list]'),
  tierContainer: query('.tier-container'),
  tierTemplate: document.getElementById('tier-row-template') as HTMLTemplateElement | null,

  // Form inputs
  mediaType: document.getElementById('media-type') as HTMLSelectElement | null,
  importMode: document.getElementById('import-mode') as HTMLSelectElement | null,
  importCount: document.getElementById('import-count') as HTMLInputElement | null,
  csvFile: document.getElementById('csv-file') as HTMLInputElement | null,
  includeUnscored: document.getElementById('include-unscored') as HTMLInputElement | null,
  useScorePrior: document.getElementById('use-score-prior') as HTMLInputElement | null,
  preserveRange: document.getElementById('preserve-range') as HTMLInputElement | null,
  scoreFormat: document.getElementById('score-format') as HTMLSelectElement | null,
  exploration: document.getElementById('exploration-epsilon') as HTMLInputElement | null,
  uncertaintyPrior: document.getElementById('uncertainty-prior') as HTMLInputElement | null,

  // Date filters
  airedFrom: document.getElementById('filter-aired-from') as HTMLInputElement | null,
  airedTo: document.getElementById('filter-aired-to') as HTMLInputElement | null,
  startedFrom: document.getElementById('filter-started-from') as HTMLInputElement | null,
  startedTo: document.getElementById('filter-started-to') as HTMLInputElement | null,
  completedFrom: document.getElementById('filter-completed-from') as HTMLInputElement | null,
  completedTo: document.getElementById('filter-completed-to') as HTMLInputElement | null,
  updatedFrom: document.getElementById('filter-updated-from') as HTMLInputElement | null,
  updatedTo: document.getElementById('filter-updated-to') as HTMLInputElement | null,

  // Mode options
  scratchGoal: document.getElementById('scratch-goal') as HTMLSelectElement | null,
  optInTierList: document.getElementById('opt-in-tier-list') as HTMLInputElement | null,

  // Analysis inputs
  analysisSamples: document.getElementById('analysis-samples') as HTMLInputElement | null,
  analysisTopK: document.getElementById('analysis-topk') as HTMLInputElement | null,
  analysisMaxIter: document.getElementById('analysis-max-iter') as HTMLInputElement | null,

  // Tier list input
  tierKValue: document.getElementById('tier-k-value') as HTMLInputElement | null,

  // Modals
  earlyFinishModal: query('[data-early-finish-modal]'),
  earlyFinishMessage: query('[data-early-finish-message]'),
  startOverModal: query('[data-start-over-modal]'),

  // Mode-specific
  switchToPairwise: query('[data-action="switch-to-pairwise"]'),

  // Import path toggle
  importTitle: query('[data-import-title]'),
  importDesc: query('[data-import-desc]'),
  importPathElements: queryAll('[data-import-path]'),

  // Sortable list container
  sortableList: query('[data-sortable-list]'),

  // Upload button
  uploadButton: query<HTMLButtonElement>('[data-action="upload"]'),
};

export function getStepElement(name: keyof Steps): HTMLElement | null {
  return dom.steps[name];
}
