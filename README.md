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

**MAP Regularization**: Uses `prior = 1.0` by default to prevent degenerate solutions with sparse data.

Converges to MLE without gradient computation or line search. Constraint: `sum(strengths) = 0` for identifiability.

## Build

Requires [MoonBit](https://www.moonbitlang.com/) toolchain.

```bash
# Build WASM
moon build --target wasm-gc

# Copy output to web directory
cp target/wasm-gc/release/build/web/web.wasm web/
```

## Run

Serve the `web/` directory with any static file server:

```bash
cd web
python -m http.server 8000
```

Visit `http://localhost:8000` and start comparing items.

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
  types.mbt           # Core PL model, MM fitting
  indexed_ranker.mbt  # Main API with uncertainty quantification
  clustering.mbt      # K-means tier clustering
web/
  web.mbt             # WASM bindings
  index.html          # Frontend
cmd/main/
  main.mbt            # WASM export definitions
```

## Features

- **Full rankings**: Input complete orderings, not just pairwise
- **Uncertainty quantification**: Bootstrap confidence intervals for ranks
- **Pair selection policies**: Random, uncertainty-based, coverage-based
- **Tier clustering**: Group similarly-ranked items via k-means
- **Undo**: Revert last comparison

## Code Style

- Block-style organization with `///|` separators
- Snapshot testing with `inspect` (prefer over `assert_eq`)
- `*_wbtest.mbt` for whitebox tests

## References

- Luce (1959): *Individual Choice Behavior*
- Plackett (1975): *The Analysis of Permutations*
- Hunter (2004): *MM Algorithms for Generalized Bradley-Terry Models*
- Bradley & Terry (1952): *Rank Analysis of Incomplete Block Designs*
