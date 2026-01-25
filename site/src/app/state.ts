import type { WasmExports } from '../lib/wasm';
import type {
  Entry,
  RankingHistoryEntry,
  RankGoal,
  RankMode,
  RankPhase,
  RankObjective,
  YearFilters,
  ResultsPayload,
} from '../lib/types';
import type { MediaType, ScoreFormat } from '../lib/anilist';
import type { StartOptions } from '../lib/types';

export const STATE_KEY = 'moonsorter-state';

export type AppState = {
  wasm: WasmExports | null;
  currentPair: [number, number] | null;
  focusPair: [number, number] | null;
  currentGroup: number[] | null;
  items: Entry[];
  comparisons: RankingHistoryEntry[];
  redoStack: RankingHistoryEntry[];
  priorComparisons: RankingHistoryEntry[];
  includeUnscored: boolean;
  preserveRange: boolean;
  scoreFormat: ScoreFormat;
  detectedScoreFormat: ScoreFormat | undefined;
  mediaType: MediaType;
  importMode: string;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  sliceCount: number;
  useScorePrior: boolean;
  explorationEpsilon: number;
  uncertaintyPrior: number;
  currentFilters: YearFilters;
  lastResults: ResultsPayload | null;
  selectedIndices: Set<number>;
  analysisSamples: number;
  analysisTopK: number;
  analysisMaxIter: number;
  analysisComputedAt: string | null;
  rankGoal: RankGoal;
  rankMode: RankMode;
  rankPhase: RankPhase;
  rankObjective: RankObjective;
  modeChosen: boolean;
  pendingStart: StartOptions | null;
  importPath: 'anilist' | 'csv';
  earlyFinishWarned: boolean;
};

export const state: AppState = {
  wasm: null,
  currentPair: null,
  focusPair: null,
  currentGroup: null,
  items: [],
  comparisons: [],
  redoStack: [],
  priorComparisons: [],
  includeUnscored: false,
  preserveRange: true,
  scoreFormat: 'POINT_10',
  detectedScoreFormat: undefined,
  mediaType: 'ANIME',
  importMode: 'all',
  sortColumn: null,
  sortDirection: 'asc',
  sliceCount: 20,
  useScorePrior: true,
  explorationEpsilon: 0.1,
  uncertaintyPrior: 1.0,
  currentFilters: {},
  lastResults: null,
  selectedIndices: new Set(),
  analysisSamples: 200,
  analysisTopK: 10,
  analysisMaxIter: 40,
  analysisComputedAt: null,
  rankGoal: 'rescore',
  rankMode: 'pairwise',
  rankPhase: 'pairwise',
  rankObjective: 'full',
  modeChosen: false,
  pendingStart: null,
  importPath: 'anilist',
  earlyFinishWarned: false,
};

export function resetState() {
  state.comparisons = [];
  state.redoStack = [];
  state.priorComparisons = [];
  state.items = [];
  state.lastResults = null;
  state.selectedIndices = new Set();
  state.currentFilters = {};
  state.currentGroup = null;
  state.pendingStart = null;
  state.rankGoal = 'rescore';
  state.rankMode = 'pairwise';
  state.rankPhase = 'pairwise';
  state.rankObjective = 'full';
  state.modeChosen = false;
  state.analysisComputedAt = null;
  state.earlyFinishWarned = false;
}
