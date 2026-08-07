# moonsorter

Moonsorter is a ranking system that runs in the browser. It uses the Plackett-Luce model and calculates the uncertainty of each rank. The source code is MoonBit. The build compiles the source code to WebAssembly.

## What it does

Moonsorter ranks items from comparisons or from complete rankings. It uses the Plackett-Luce (PL) statistical model. The model estimates the relative strength of each item. Bootstrap resampling gives the confidence interval of each rank.

## Algorithm

**Plackett-Luce Model** (Luce 1959, Plackett 1975): This model extends Bradley-Terry to complete rankings. The formula applies to a ranking that puts item `i` before item `j`:

```
P(i > j | remaining items) = exp(strength_i) / sum_k(exp(strength_k))
```

For a comparison of two items, the Bradley-Terry special case applies:
```
P(i beats j) = 1 / (1 + exp(-(strength_i - strength_j)))
```

**MM Algorithm** (Hunter 2004): This algorithm does iterative majorization-minimization for the MLE. The update rule is:
```
gamma_i^new = (W_i + prior) / (denominator_i + prior)
```

In this rule, `gamma_i = exp(strength_i)` and `W_i` is the number of wins at position `i`. The denominator sums over the ranking positions.

**MAP Regularization**: The browser app uses `prior = 1.0` for every fit. If the comparison graph is not strongly connected, an unregularized Plackett-Luce likelihood has no finite maximizer. Early in a session, the graph is never strongly connected. The prior keeps every fit finite.

The algorithm converges to the MAP estimate. It does not use a gradient computation or a line search. Each iteration rescales the values so that `mean(gamma) = 1`. This rescale fixes the scale that the model leaves free.

**Uncertainty**: `compute_uncertainty` runs a parametric bootstrap. For each replicate, the function resamples every recorded event from the fitted model. Then the function fits the model again and records the rank distribution.

`get_rank_ci_low` and `get_rank_ci_high` return the 10th and 90th percentile ranks. These two ranks are an 80% interval. The point estimate and the bootstrap replicates use the same estimator. A shown rank is therefore always inside its own interval.

## Build

Install the [MoonBit](https://www.moonbitlang.com/) toolchain.

```bash
# Build the WASM module and install it where the browser app loads it from
moon build --target wasm-gc --release
cp _build/wasm-gc/release/build/web/web.wasm site/public/moonsorter.wasm
```

The repository contains `site/public/moonsorter.wasm`. If this file does not
match a fresh build of `src/` and `web/`, CI stops the deploy.

## Run

```bash
cd site
bun install
bun run dev
```

Open `http://localhost:4321` in your browser. Then rank the items. To skip the
import step, append `?demo=1` to the URL. Moonsorter then shows a built-in
sample list.

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

The browser can pass only numbers across the WebAssembly boundary. Therefore
`web/` holds one global ranker and exposes index-based functions over it. To
add an export, you must edit three files:

- `web/web.mbt`
- the export list in `web/moon.pkg`
- `WasmExports` in `site/src/lib/wasm.ts`

## Features

- **Full rankings**: Moonsorter accepts a complete ordering of a group, not only a comparison of two items.
- **Uncertainty quantification**: The bootstrap gives a rank interval for each item and a confidence value for the top-K set.
- **Pair selection policies**: Moonsorter has three policies for pair selection: A-optimal (0), Thompson top-pair (1), and Thompson neighbor (2). Each policy can add epsilon-greedy random exploration.
- **Tier clustering**: k-means groups the items that have a similar rank into tiers.
- **Undo**: Moonsorter reverts the last decision. It also reverts a tie in one step.

## Code Style

- The code uses block-style organization with `///|` separators.
- The tests use snapshot testing with `inspect` instead of `assert_eq`.
- The `*_wbtest.mbt` files hold the whitebox tests.

## References

- Luce (1959): *Individual Choice Behavior*
- Plackett (1975): *The Analysis of Permutations*
- Hunter (2004): *MM Algorithms for Generalized Bradley-Terry Models*
- Bradley & Terry (1952): *Rank Analysis of Incomplete Block Designs*
