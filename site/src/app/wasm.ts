import { loadWasm, type WasmExports } from '../lib/wasm';
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

export function resolvePairPolicy(): number {
  if (state.rankGoal === 'rescore') return 0;
  if (state.rankObjective === 'top-k') return 1;
  return 2;
}

export function updatePairPolicy() {
  if (!state.wasm) return;
  state.wasm.set_pair_policy(resolvePairPolicy());
}
