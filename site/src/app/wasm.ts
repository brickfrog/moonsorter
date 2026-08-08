import { loadWasm, type WasmExports } from '../lib/wasm';
import type { RankingHistoryEntry } from '../lib/types';
import { state } from './state';

export async function ensureWasm(): Promise<WasmExports> {
  if (!state.wasm) {
    console.info('[rank] loading WASM');
    state.wasm = (await loadWasm()) as WasmExports;
    console.info('[rank] WASM loaded');
  }
  return state.wasm;
}

export function applyRanking(wasm: WasmExports, indices: number[]): boolean {
  if (indices.length === 0) return true;
  wasm.clear_ranking();
  for (const idx of indices) {
    wasm.add_to_ranking(idx);
  }
  return wasm.commit_ranking();
}

/**
 * Seed the model with an ordering the user never answered.
 *
 * Same staging as `applyRanking`, but commits through the prior path so the
 * ordering informs the fit without advancing progress or adding an undo step.
 */
export function applyPriorRanking(
  wasm: WasmExports,
  indices: number[],
): boolean {
  if (indices.length === 0) return true;
  wasm.clear_ranking();
  for (const idx of indices) {
    wasm.add_to_ranking(idx);
  }
  return wasm.commit_prior_ranking();
}

/**
 * Replay one recorded decision.
 *
 * A tie goes through `add_comparison`, which records both orderings as a
 * single comparison and a single undo step; anything else is a plain ordering.
 */
export function applyHistoryEntry(
  wasm: WasmExports,
  entry: RankingHistoryEntry,
): boolean {
  if (entry.tie && entry.indices.length === 2) {
    return wasm.add_comparison(entry.indices[0], entry.indices[1], 2);
  }
  return applyRanking(wasm, entry.indices);
}

export function resolvePairPolicy(): number {
  if (state.rankGoal === 'rescore') return 0;
  if (state.rankObjective === 'top-k') return 1;
  return 2;
}

export function updatePairPolicy() {
  if (!state.wasm) return;
  state.wasm.set_pair_policy(resolvePairPolicy());
}
