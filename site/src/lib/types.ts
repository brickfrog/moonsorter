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

export type RankingHistoryEntry = { indices: number[] };

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
  title: string;
  mediaId: number | null;
  originalScore: number;
  newScore: number;
  strength: number;
  rank: number;
  uncertainty: number;
  lowerBound: number;
  upperBound: number;
  coverImage?: string;
};

export type ResultsPayload = {
  rows: ResultRow[];
  config: ScoreConfig;
  totalComparisons: number;
  analysisSamples?: number;
  analysisTopK?: number;
  analysisIterations?: number;
  analysisComputedAt?: string;
};
