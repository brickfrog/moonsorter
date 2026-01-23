export type WasmExports = {
  create_ranker: (count: number) => boolean;
  add_comparison: (indexA: number, indexB: number, result: number) => boolean;
  add_ranking: (indices: number[]) => boolean;
  clear_ranking: () => void;
  add_to_ranking: (idx: number) => void;
  commit_ranking: () => boolean;
  get_next_pair_encoded: (epsilon: number, random: number) => number;
  get_progress_completed: () => number;
  get_progress_estimated: () => number;
  get_rank_for: (index: number) => number;
  set_uncertainty_prior: (prior: number) => boolean;
  set_pair_policy: (policy: number) => boolean;
  set_sampling_seed: (seed: number) => boolean;
  compute_uncertainty: (
    samples: number,
    maxIter: number,
    topK: number,
  ) => boolean;
  get_uncertainty_ready: () => boolean;
  get_uncertainty_samples: () => number;
  get_uncertainty_top_k: () => number;
  get_uncertainty_width_for: (index: number) => number;
  get_uncertainty_median_width: () => number;
  get_uncertainty_p90_width: () => number;
  get_uncertainty_width_target: () => number;
  get_uncertainty_order_index: (position: number) => number;
  get_topk_stable_count: (threshold: number) => number;
  get_rank_ci_low: (index: number) => number;
  get_rank_ci_high: (index: number) => number;
  get_rank_mean: (index: number) => number;
  get_topk_confidence: (index: number) => number;
  compute_tiers: (k: number) => number;
  get_tier_for: (index: number) => number;
  undo_last: () => boolean;
};

type RawExports = WebAssembly.Exports & {
  create_ranker: (count: number) => boolean;
  add_comparison: (indexA: number, indexB: number, result: number) => boolean;
  add_ranking: (indices: number[]) => boolean;
  clear_ranking: () => void;
  add_to_ranking: (idx: number) => void;
  commit_ranking: () => boolean;
  get_next_pair_encoded: (epsilon: number, random: number) => number;
  get_progress_completed: () => number;
  get_progress_estimated: () => number;
  get_rank_for: (index: number) => number;
  set_uncertainty_prior: (prior: number) => boolean;
  set_pair_policy: (policy: number) => boolean;
  set_sampling_seed: (seed: number) => boolean;
  compute_uncertainty: (
    samples: number,
    maxIter: number,
    topK: number,
  ) => boolean;
  get_uncertainty_ready: () => boolean;
  get_uncertainty_samples: () => number;
  get_uncertainty_top_k: () => number;
  get_uncertainty_width_for: (index: number) => number;
  get_uncertainty_median_width: () => number;
  get_uncertainty_p90_width: () => number;
  get_uncertainty_width_target: () => number;
  get_uncertainty_order_index: (position: number) => number;
  get_topk_stable_count: (threshold: number) => number;
  get_rank_ci_low: (index: number) => number;
  get_rank_ci_high: (index: number) => number;
  get_rank_mean: (index: number) => number;
  get_topk_confidence: (index: number) => number;
  compute_tiers: (k: number) => number;
  get_tier_for: (index: number) => number;
  undo_last: () => boolean;
};

let wasm: WasmExports | null = null;

function safeCall<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    console.error(`[wasm] ${label} failed`, error);
    throw error;
  }
}

function wrapExports(exports: RawExports): WasmExports {
  return {
    create_ranker: (count: number) =>
      safeCall('create_ranker', () => exports.create_ranker(count)),
    add_comparison: (indexA: number, indexB: number, result: number) =>
      safeCall('add_comparison', () =>
        exports.add_comparison(indexA, indexB, result),
      ),
    add_ranking: (indices: number[]) =>
      safeCall('add_ranking', () => exports.add_ranking(indices)),
    clear_ranking: () => safeCall('clear_ranking', () => exports.clear_ranking()),
    add_to_ranking: (idx: number) =>
      safeCall('add_to_ranking', () => exports.add_to_ranking(idx)),
    commit_ranking: () =>
      safeCall('commit_ranking', () => exports.commit_ranking()),
    get_next_pair_encoded: (epsilon: number, random: number) =>
      safeCall('get_next_pair_encoded', () =>
        exports.get_next_pair_encoded(epsilon, random),
      ),
    get_progress_completed: () =>
      safeCall('get_progress_completed', () => exports.get_progress_completed()),
    get_progress_estimated: () =>
      safeCall('get_progress_estimated', () => exports.get_progress_estimated()),
    get_rank_for: (index: number) =>
      safeCall('get_rank_for', () => exports.get_rank_for(index)),
    set_uncertainty_prior: (prior: number) =>
      safeCall('set_uncertainty_prior', () =>
        exports.set_uncertainty_prior(prior),
      ),
    set_pair_policy: (policy: number) =>
      safeCall('set_pair_policy', () => exports.set_pair_policy(policy)),
    set_sampling_seed: (seed: number) =>
      safeCall('set_sampling_seed', () => exports.set_sampling_seed(seed)),
    compute_uncertainty: (samples: number, maxIter: number, topK: number) =>
      safeCall('compute_uncertainty', () =>
        exports.compute_uncertainty(samples, maxIter, topK),
      ),
    get_uncertainty_ready: () =>
      safeCall('get_uncertainty_ready', () =>
        exports.get_uncertainty_ready(),
      ),
    get_uncertainty_samples: () =>
      safeCall('get_uncertainty_samples', () =>
        exports.get_uncertainty_samples(),
      ),
    get_uncertainty_top_k: () =>
      safeCall('get_uncertainty_top_k', () => exports.get_uncertainty_top_k()),
    get_uncertainty_width_for: (index: number) =>
      safeCall('get_uncertainty_width_for', () =>
        exports.get_uncertainty_width_for(index),
      ),
    get_uncertainty_median_width: () =>
      safeCall('get_uncertainty_median_width', () =>
        exports.get_uncertainty_median_width(),
      ),
    get_uncertainty_p90_width: () =>
      safeCall('get_uncertainty_p90_width', () =>
        exports.get_uncertainty_p90_width(),
      ),
    get_uncertainty_width_target: () =>
      safeCall('get_uncertainty_width_target', () =>
        exports.get_uncertainty_width_target(),
      ),
    get_uncertainty_order_index: (position: number) =>
      safeCall('get_uncertainty_order_index', () =>
        exports.get_uncertainty_order_index(position),
      ),
    get_topk_stable_count: (threshold: number) =>
      safeCall('get_topk_stable_count', () =>
        exports.get_topk_stable_count(threshold),
      ),
    get_rank_ci_low: (index: number) =>
      safeCall('get_rank_ci_low', () => exports.get_rank_ci_low(index)),
    get_rank_ci_high: (index: number) =>
      safeCall('get_rank_ci_high', () => exports.get_rank_ci_high(index)),
    get_rank_mean: (index: number) =>
      safeCall('get_rank_mean', () => exports.get_rank_mean(index)),
    get_topk_confidence: (index: number) =>
      safeCall('get_topk_confidence', () =>
        exports.get_topk_confidence(index),
      ),
    compute_tiers: (k: number) =>
      safeCall('compute_tiers', () => exports.compute_tiers(k)),
    get_tier_for: (index: number) =>
      safeCall('get_tier_for', () => exports.get_tier_for(index)),
    undo_last: () => safeCall('undo_last', () => exports.undo_last()),
  };
}

export async function loadWasm(): Promise<WasmExports> {
  if (wasm) return wasm;
  const base = import.meta.env.BASE_URL || '';
  const response = await fetch(`${base}/moonsorter.wasm`);
  if (!response.ok) {
    throw new Error(`Failed to load WASM: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.instantiate(bytes, {});
  console.info('[wasm] exports:', Object.keys(module.instance.exports));
  wasm = wrapExports(module.instance.exports as RawExports);
  return wasm;
}

export function getWasm(): WasmExports {
  if (!wasm) {
    throw new Error('WASM not loaded');
  }
  return wasm;
}
