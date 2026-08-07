# moonsorter

Browser-based ranking system using the Plackett-Luce model with uncertainty quantification. Built in MoonBit, compiled to WebAssembly.

## What it does

Ranks items through pairwise comparisons or full ranking inputs. Uses the Plackett-Luce (PL) statistical model to estimate relative strengths and compute confidence intervals via bootstrap resampling.

## Algorithm

**Plackett-Luce Model** (Luce 1959, Plackett 1975): Extends Bradley-Terry to full rankings. For a ranking where item `i` is placed above item `j`:

```
P(i > j | remaining items) = exp(strength_i) / sum_k(exp(strength_k))
```

For pairwise comparisons (Bradley-Terry special case):
```
P(i beats j) = 1 / (1 + exp(-(strength_i - strength_j)))
```

**MM Algorithm** (Hunter 2004): Iterative majorization-minimization for MLE. Update rule:
```
gamma_i^new = (W_i + prior) / (denominator_i + prior)
```

where `gamma_i = exp(strength_i)`, `W_i` = wins at position `i`, and denominator aggregates over ranking positions.

**MAP Regularization**: `prior = 1.0` for every fit the browser app performs. An unregularized Plackett-Luce likelihood has no finite maximizer unless the comparison graph is strongly connected, which it never is early in a session.

Converges to the MAP estimate without gradient computation or line search. Each iteration rescales so that `mean(gamma) = 1`, fixing the scale that the model leaves free.

**Uncertainty**: `compute_uncertainty` runs a parametric bootstrap — each recorded event is resampled from the fitted model, refit, and the rank distribution collected. `get_rank_ci_low`/`get_rank_ci_high` return the 10th and 90th percentile ranks, an 80% interval. The point estimate and the bootstrap replicates use the same estimator, so a displayed rank always falls inside its own interval.

## Build

Requires the [MoonBit](https://www.moonbitlang.com/) toolchain.

```bash
# Build the WASM module and install it where the browser app loads it from
moon build --target wasm-gc --release
cp _build/wasm-gc/release/build/web/web.wasm site/public/moonsorter.wasm
```

`site/public/moonsorter.wasm` is committed, and CI fails the deploy if it does
not match a fresh build of `src/` + `web/`.

## Run

```bash
cd site
bun install
bun run dev
```

Visit `http://localhost:4321` and start ranking items. Append `?demo=1` to skip
the import step and rank a built-in sample list.

## Development

```bash
# Typecheck + format
moon check && moon fmt

# Generate interface files (always run after changes)
moon info

# Run tests
moon test

# Update test snapshots after behavior changes
moon test --update

# Coverage report
moon coverage analyze > uncovered.log
```

## Project Structure

```
src/
  types.mbt           # Plackett-Luce solver, string-keyed rankers
  indexed_ranker.mbt  # Index-keyed ranker with bootstrap uncertainty
  clustering.mbt      # K-means tier clustering
web/
  web.mbt             # Flat numeric FFI surface exported to WebAssembly
  moon.pkg            # Export list; mirrors WasmExports in site/src/lib/wasm.ts
site/
  src/                # Astro site source
  public/
    moonsorter.wasm   # Compiled WASM binary (committed, verified in CI)
```

The browser can only pass numbers across the WebAssembly boundary, so `web/`
holds a single global ranker and exposes index-based functions over it. Adding
an export means editing `web/web.mbt`, the export list in `web/moon.pkg`, and
`WasmExports` in `site/src/lib/wasm.ts`.

## Features

- **Full rankings**: Input complete orderings, not just pairwise
- **Uncertainty quantification**: Bootstrap rank intervals, top-K confidence
- **Pair selection policies**: A-optimal (0), Thompson top-pair (1), Thompson neighbour (2), each with optional epsilon-greedy random exploration
- **Tier clustering**: Group similarly-ranked items via k-means
- **Undo**: Revert the last decision; a tie undoes in one step

## Code Style

- Block-style organization with `///|` separators
- Snapshot testing with `inspect` (prefer over `assert_eq`)
- `*_wbtest.mbt` for whitebox tests

## References

- Luce (1959): *Individual Choice Behavior*
- Plackett (1975): *The Analysis of Permutations*
- Hunter (2004): *MM Algorithms for Generalized Bradley-Terry Models*
- Bradley & Terry (1952): *Rank Analysis of Incomplete Block Designs*
