# Algorithm Details

## Plackett-Luce Model

Primary model: **Plackett-Luce** (Luce 1959, Plackett 1975)

Extends Bradley-Terry to handle **full rankings** (not just pairwise).

### Probability Model

For a ranking where item `i` is selected from a set of remaining items:
```
P(i is chosen | remaining) = exp(strength_i) / sum_k(exp(strength_k))
```

**Pairwise special case (Bradley-Terry)**:
```
P(i beats j) = exp(strength_i) / (exp(strength_i) + exp(strength_j))
              = 1 / (1 + exp(-(strength_i - strength_j)))
```

### Identifiability Constraint
```
sum(strengths) = 0
```

Without this constraint, all strengths can shift by a constant without changing probabilities.

## MM (Minorization-Maximization) Algorithm

Reference: Hunter 2004 - "MM Algorithms for Generalized Bradley-Terry Models"

### Update Rule (Plackett-Luce)

```
gamma_i^new = (W_i + prior) / (denominator_i + prior)
```

Where:
- `gamma_i = exp(strength_i)` (always positive)
- `W_i` = number of times item `i` was selected (across all ranking positions)
- `denominator_i` = sum over all rankings and positions where `i` appears
- `prior` = MAP regularization parameter (default: 1.0)

### Denominator Calculation

For each ranking event `[item_1, item_2, ..., item_k]`:
```
denominator_i += sum over positions p where i appears {
  1 / (gamma_i + gamma_{i+1} + ... + gamma_k)
}
```

### MAP Regularization

**`newman_fit`** uses `prior = 1.0` (MAP estimation) to prevent degenerate solutions with sparse data.

**`pl_fit`** optionally accepts `use_map` parameter (default: false for MLE, true for MAP).

### Properties
- Guaranteed convergence to MLE (or MAP if prior > 0)
- Simpler than constrained optimization
- No line search or gradient computation needed
- Monotonic improvement in log-likelihood

### Convergence
Iterate until `max|gamma_i^new - gamma_i| < tolerance`

Typical: `tolerance = 1e-6`, `max_iter = 50`

## Implementations in Code

Three fitting functions in `src/types.mbt`:

1. **`mm_fit`** - Standard MM for pairwise Bradley-Terry (legacy)
2. **`newman_fit`** - MM with MAP prior for pairwise BT (used by `BradleyTerryRanker`)
3. **`pl_fit`** - MM for full Plackett-Luce rankings (used by `PlackettLuceRanker`)

Main rankers:
- `BradleyTerryRanker` converts pairwise to win matrix, uses `newman_fit`
- `PlackettLuceRanker` stores full ranking events, uses `pl_fit`
- `IndexedRanker` (in `indexed_ranker.mbt`) wraps `PlackettLuceRanker` for int-based API

## Uncertainty Quantification

Uses bootstrap resampling:
1. Resample ranking events with replacement
2. Refit PL model on resampled data
3. Repeat N times (e.g., N=100)
4. Compute confidence intervals from sample distribution

## Pair Selection Policies

Three modes:
0. **Random** - uniform random selection
1. **Uncertainty-based** - select pairs with highest uncertainty (max rank width)
2. **Coverage-based** - select pairs to ensure all items compared

## Elo Conversion (if needed)

```
Elo_i - Elo_j = 400 * log(gamma_i / gamma_j) / log(10)
              ≈ 400 * (strength_i - strength_j) / ln(10)
```

Where `gamma_i = exp(strength_i)`