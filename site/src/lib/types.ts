import type { MediaType, ScoreFormat } from './anilist';

export type Entry = {
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

/**
 * One recorded decision. `tie` marks the both-directions pair so that replay
 * and undo treat it as the single decision the user actually made.
 */
export type RankingHistoryEntry = { indices: number[]; tie?: boolean };

export type RankGoal = 'rescore' | 'scratch';
export type RankMode = 'pairwise' | 'group' | 'group-pairwise';
export type RankPhase = 'pairwise' | 'group';
export type RankObjective = 'full' | 'top-k';

export type YearRange = { min?: number; max?: number };
export type YearFilters = {
  aired?: YearRange | null;
  started?: YearRange | null;
  completed?: YearRange | null;
  updated?: YearRange | null;
};

export type ScoreConfig = { max: number; step: number; label: string };
export type ScoreRange = { min: number; max: number };

export type SavedState = {
  /** Session format version; absent in files written before versioning. */
  version?: number;
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

export type StartOptions = {
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

export type ResultRow = {
  index: number;
  mediaId: number | null;
  title: string;
  originalScore: number;
  /** 1-based ordinal rank from the ranker. */
  rank: number;
  newScore: number;
  /** Bootstrap rank interval; absent until an analysis has been run. */
  rankLow?: number;
  rankHigh?: number;
  rankMean?: number;
  topKConfidence?: number;
  coverImage?: string;
};

export type ResultsPayload = {
  generatedAt: string;
  scoreFormat: ScoreFormat;
  preserveRange: boolean;
  includeUnscored: boolean;
  mediaType: MediaType;
  importMode: string;
  sliceCount: number;
  useScorePrior: boolean;
  filters: Record<string, unknown>;
  analysis?: {
    samples: number;
    topK: number;
    maxIter: number;
    computedAt: string;
  };
  rows: ResultRow[];
};
