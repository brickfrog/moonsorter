# Codebase Structure

```
moonsorter/
├── src/                      # Core library
│   ├── types.mbt             # Core types and PL fitting logic
│   ├── indexed_ranker.mbt    # Main IndexedRanker API
│   ├── clustering.mbt        # K-means tier clustering
│   └── types_wbtest.mbt      # Whitebox tests
├── web/                      # WASM web interface
│   ├── web.mbt               # Web bindings
│   ├── index.html            # Frontend HTML
│   └── web.wasm              # Compiled WASM
├── cmd/main/                 # Main entry point
│   └── main.mbt              # WASM exports definition
├── moon.mod.json             # Module definition
├── moon.pkg.json             # Root package config
└── target/                   # Build artifacts

## Package Aliases
- `web/` imports `src/` as `ranker`
- WASM exports defined in `cmd/main/moon.pkg.json`

## WASM Exports
The web interface exposes ~40 functions including:
- Ranker lifecycle: `create_ranker`
- Input: `add_ranking`, `add_to_ranking`, `commit_ranking`
- Output: `get_rank_for`, `compute_ordinal_rankings`
- Pair selection: `get_next_pair_encoded`, `set_pair_policy`
- Uncertainty: `compute_uncertainty`, `get_uncertainty_*`
- Tiers: `compute_tiers`, `get_tier_for`
- Undo: `undo_last`