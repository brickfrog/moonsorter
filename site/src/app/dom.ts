export type ViewKey = 'list' | 'compare' | 'sort' | 'results';

/** What the top-bar buttons address. `sort` is reached through `compare`. */
export type NavTarget = 'list' | 'compare' | 'results';

export type Views = Record<ViewKey, HTMLElement | null>;

function query<T extends HTMLElement = HTMLElement>(selector: string): T | null {
  return document.querySelector(selector) as T | null;
}

function queryAll<T extends HTMLElement = HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll(selector)) as T[];
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export const dom = {
  // Shell
  views: {
    list: query('[data-view="list"]'),
    compare: query('[data-view="compare"]'),
    sort: query('[data-view="sort"]'),
    results: query('[data-view="results"]'),
  } as Views,
  navButtons: queryAll<HTMLButtonElement>('[data-view-target]'),
  sessionLabel: query('[data-session-label]'),
  loading: query('[data-loading]'),

  // List view
  listStatus: query('[data-list-status]'),
  listHeadline: query('[data-list-headline]'),
  listBody: query('[data-list-body]'),
  listCount: query('[data-list-count]'),
  methodRadios: queryAll<HTMLInputElement>('[data-rank-mode]'),
  anilistOnly: queryAll('[data-anilist-only]'),
  csvOnly: queryAll('[data-csv-only]'),
  authGated: queryAll('[data-requires]'),
  startButton: query<HTMLButtonElement>('[data-action="start"]'),
  logoutButton: query<HTMLButtonElement>('[data-action="logout"]'),
  sessionFile: query<HTMLInputElement>('[data-session-file]'),

  // Compare view
  arena: query('[data-arena]'),
  choiceButtons: queryAll('[data-choice]'),
  leftTitle: query('[data-choice-title="A"]'),
  rightTitle: query('[data-choice-title="B"]'),
  progressCount: query('[data-progress-count]'),
  progressTrack: query('[data-progress-track]'),
  progressFill: query<HTMLDivElement>('[data-progress-fill]'),
  progressCI: query('[data-progress-ci]'),
  redoButton: query<HTMLButtonElement>('[data-action="redo"]'),

  // Sort view
  sortableList: query('[data-sortable-list]'),
  sortLive: query('[data-sort-group-live]'),
  groupCoverage: query('[data-group-coverage]'),
  groupEstimate: query('[data-group-estimate]'),
  switchToPairwise: query('[data-action="switch-to-pairwise"]'),

  // Results view
  resultsHeadline: query('[data-results-headline]'),
  rankingsBody: query('[data-rankings-body]'),
  selectionStatus: query('[data-selection-status]'),
  uploadButton: query<HTMLButtonElement>('[data-action="upload"]'),
  uploadStatus: query('[data-upload-status]'),

  // Results sidebar — stability
  statMedian: query('[data-stat-median]'),
  statTopK: query('[data-stat-topk]'),
  statSamples: query('[data-stat-samples]'),
  statPairs: query('[data-stat-pairs]'),
  analysisStatus: query('[data-analysis-status]'),
  runAnalysisButton: query<HTMLButtonElement>('[data-action="run-analysis"]'),

  // Results sidebar — undecided callout
  uncertainCallout: query('[data-uncertain-callout]'),
  uncertainBody: query('[data-uncertain-body]'),
  uncertainChips: query<HTMLDivElement>('[data-uncertain-chips]'),
  resumeButton: query<HTMLButtonElement>('[data-action="resume-comparisons"]'),

  // Results sidebar — tiers
  tierBlock: query('[data-tier-block]'),
  tierLines: query('[data-tier-lines]'),
  tierExport: query('[data-tier-export]'),
  tierStatus: query('[data-tierlist-status]'),
  tierTemplate: byId<HTMLTemplateElement>('tier-row-template'),

  // Import form inputs
  mediaType: byId<HTMLSelectElement>('media-type'),
  importMode: byId<HTMLSelectElement>('import-mode'),
  importCount: byId<HTMLInputElement>('import-count'),
  csvFile: byId<HTMLInputElement>('csv-file'),
  includeUnscored: byId<HTMLInputElement>('include-unscored'),
  useScorePrior: byId<HTMLInputElement>('use-score-prior'),
  preserveRange: byId<HTMLInputElement>('preserve-range'),
  scoreFormat: byId<HTMLSelectElement>('score-format'),
  exploration: byId<HTMLInputElement>('exploration-epsilon'),
  uncertaintyPrior: byId<HTMLInputElement>('uncertainty-prior'),
  scratchGoal: byId<HTMLSelectElement>('scratch-goal'),

  // Date filters
  airedFrom: byId<HTMLInputElement>('filter-aired-from'),
  airedTo: byId<HTMLInputElement>('filter-aired-to'),
  startedFrom: byId<HTMLInputElement>('filter-started-from'),
  startedTo: byId<HTMLInputElement>('filter-started-to'),
  completedFrom: byId<HTMLInputElement>('filter-completed-from'),
  completedTo: byId<HTMLInputElement>('filter-completed-to'),
  updatedFrom: byId<HTMLInputElement>('filter-updated-from'),
  updatedTo: byId<HTMLInputElement>('filter-updated-to'),

  // Analysis inputs
  analysisSamples: byId<HTMLInputElement>('analysis-samples'),
  analysisTopK: byId<HTMLInputElement>('analysis-topk'),
  analysisMaxIter: byId<HTMLInputElement>('analysis-max-iter'),
  tierKValue: byId<HTMLInputElement>('tier-k-value'),

  // Modals
  earlyFinishModal: query('[data-early-finish-modal]'),
  earlyFinishMessage: query('[data-early-finish-message]'),
  startOverModal: query('[data-start-over-modal]'),
};
