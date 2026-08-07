///|
/// A single ranking event using indices.
pub struct IndexedRankingEvent {
  items : Array[Int]
}

///|
/// History entry for undo.
pub struct IndexedHistoryEntry {
  strengths : Array[Double]
  events : Array[IndexedRankingEvent]
  iteration_count : Int
}

///|
/// Indexed Plackett-Luce ranker for WASM numeric interop.
pub struct IndexedRanker {
  n : Int
  mut strengths : Array[Double]
  mut events : Array[IndexedRankingEvent]
  mut iteration_count : Int
  mut uncertainty_prior : Double
  mut pair_policy : Int
  mut rng_state : UInt64
  mut uncertainty_ready : Bool
  mut uncertainty_samples : Int
  mut uncertainty_top_k : Int
  mut uncertainty_widths : Array[Int]
  mut uncertainty_order : Array[Int]
  mut uncertainty_median_width : Int
  mut uncertainty_p90_width : Int
  mut rank_ci_low : Array[Int]
  mut rank_ci_high : Array[Int]
  mut rank_mean : Array[Double]
  mut topk_confidence : Array[Double]
  history : Array[IndexedHistoryEntry]
}

///|
/// Create a new indexed ranker for n items.
pub fn IndexedRanker::new(count : Int) -> IndexedRanker {
  let n = if count < 0 { 0 } else { count }
  {
    n,
    strengths: Array::make(n, 0.0),
    events: [],
    iteration_count: 0,
    uncertainty_prior: 1.0,
    pair_policy: 0,
    rng_state: 88172645463393265UL,
    uncertainty_ready: false,
    uncertainty_samples: 0,
    uncertainty_top_k: 0,
    uncertainty_widths: Array::make(n, 0),
    uncertainty_order: Array::make(n, 0),
    uncertainty_median_width: 0,
    uncertainty_p90_width: 0,
    rank_ci_low: Array::make(n, 0),
    rank_ci_high: Array::make(n, 0),
    rank_mean: Array::make(n, 0.0),
    topk_confidence: Array::make(n, 0.0),
    history: [],
  }
}

///|
pub fn IndexedRanker::n_items(self : IndexedRanker) -> Int {
  self.n
}

///|
pub fn IndexedRanker::total_comparisons(self : IndexedRanker) -> Int {
  self.iteration_count
}

///|
pub fn IndexedRanker::set_uncertainty_prior(
  self : IndexedRanker,
  prior : Double,
) -> Unit {
  let next = if prior <= 0.0 { 1.0 } else { prior }
  self.uncertainty_prior = next
}

///|
pub fn IndexedRanker::set_pair_policy(
  self : IndexedRanker,
  policy : Int,
) -> Unit {
  let mut next = policy
  if next < 0 {
    next = 0
  }
  if next > 2 {
    next = 2
  }
  self.pair_policy = next
}

///|
pub fn IndexedRanker::set_sampling_seed(
  self : IndexedRanker,
  seed : Int,
) -> Unit {
  let value = if seed < 0 { -seed } else { seed }
  self.rng_state = value.to_uint64()
}

///|
fn IndexedRanker::next_random_u64(self : IndexedRanker) -> UInt64 {
  let a = 6364136223846793005UL
  let c = 1442695040888963407UL
  self.rng_state = self.rng_state * a + c
  self.rng_state
}

///|
fn IndexedRanker::next_random_double(self : IndexedRanker) -> Double {
  let x = self.next_random_u64()
  let max = 18446744073709551616.0
  x.to_double() / max
}

///|
fn IndexedRanker::next_random_normal(self : IndexedRanker) -> Double {
  let mut u1 = self.next_random_double()
  let u2 = self.next_random_double()
  if u1 < 1.0e-12 {
    u1 = 1.0e-12
  }
  let r = (-2.0 * @math.ln(u1)).sqrt()
  let theta = 6.283185307179586 * u2
  r * @math.cos(theta)
}

///|
fn IndexedRanker::compute_counts(self : IndexedRanker) -> Array[Int] {
  let counts : Array[Int] = Array::make(self.n, 0)
  for event in self.events {
    for idx in event.items {
      counts[idx] = counts[idx] + 1
    }
  }
  counts
}

///|
fn IndexedRanker::variance_proxy(
  self : IndexedRanker,
  counts : Array[Int],
) -> Array[Double] {
  let prior = self.uncertainty_prior
  let vars : Array[Double] = Array::make(self.n, 0.0)
  for i = 0; i < self.n; i = i + 1 {
    vars[i] = 1.0 / (counts[i].to_double() + prior)
  }
  vars
}

///|
/// Refit strengths from the full event log.
///
/// Two deliberate choices:
///   - Cold start from zero, so the estimate is a pure function of the event
///     log. Warm-starting from the previous fit leaves a residue of the order
///     the questions were answered in, which shows up as an arbitrary ordering
///     between items holding identical evidence.
///   - `use_map` matches `compute_uncertainty`, so the point estimate and the
///     bootstrap replicates come from the same estimator. Mixing them lets a
///     displayed rank fall outside its own confidence interval.
fn IndexedRanker::fit(self : IndexedRanker) -> Unit {
  let events : Array[Array[Int]] = []
  for event in self.events {
    if event.items.length() >= 2 {
      events.push(event.items)
    }
  }
  self.strengths = pl_fit_indexed(
    self.n,
    events,
    Array::make(self.n, 0.0),
    use_map=true,
  )
}

///|
/// Snapshot the current state so `undo_last` can restore it.
fn IndexedRanker::push_history(self : IndexedRanker) -> Unit {
  self.history.push({
    strengths: self.strengths.copy(),
    events: self.events.copy(),
    iteration_count: self.iteration_count,
  })
}

///|
/// Reject a ranking that names an out-of-range or repeated item.
fn IndexedRanker::valid_ranking(
  self : IndexedRanker,
  ranking : Array[Int],
) -> Bool {
  let len = ranking.length()
  if len < 2 {
    return false
  }
  for i = 0; i < len; i = i + 1 {
    let idx = ranking[i]
    if idx < 0 || idx >= self.n {
      return false
    }
    for j = i + 1; j < len; j = j + 1 {
      if ranking[j] == idx {
        return false
      }
    }
  }
  true
}

///|
/// Add a ranking event: item indices ordered best to worst.
///
/// Counts as one comparison and one undo step.
pub fn IndexedRanker::add_ranking(
  self : IndexedRanker,
  ranking : Array[Int],
) -> Bool {
  if !self.valid_ranking(ranking) {
    return false
  }
  self.push_history()
  // Copy: the caller keeps ownership of `ranking` and may reuse the buffer.
  self.events.push({ items: ranking.copy() })
  self.iteration_count = self.iteration_count + 1
  self.uncertainty_ready = false
  self.fit()
  true
}

///|
/// Record one pairwise decision.
///
/// A tie contributes both orderings to the model but still counts as a single
/// comparison and a single undo step.
pub fn IndexedRanker::update_single_query(
  self : IndexedRanker,
  index_a : Int,
  index_b : Int,
  result : ComparisonResult,
) -> Bool {
  if index_a < 0 ||
    index_b < 0 ||
    index_a >= self.n ||
    index_b >= self.n ||
    index_a == index_b {
    return false
  }
  self.push_history()
  match result {
    AWins => self.events.push({ items: [index_a, index_b] })
    BWins => self.events.push({ items: [index_b, index_a] })
    Tie => {
      self.events.push({ items: [index_a, index_b] })
      self.events.push({ items: [index_b, index_a] })
    }
  }
  self.iteration_count = self.iteration_count + 1
  self.uncertainty_ready = false
  self.fit()
  true
}

///|
pub fn IndexedRanker::undo_last(self : IndexedRanker) -> Bool {
  match self.history.pop() {
    Some(entry) => {
      self.strengths = entry.strengths
      self.events = entry.events
      self.iteration_count = entry.iteration_count
      self.uncertainty_ready = false
      true
    }
    None => false
  }
}

///|
/// Ordinal ranks (1 = strongest) keyed by item index.
///
/// Equal strengths break by item index so the displayed order is stable
/// across refits instead of following an unspecified sort order.
fn compute_ranks_from_strengths(strengths : Array[Double]) -> Array[Int] {
  let n = strengths.length()
  if n == 0 {
    return []
  }
  let indexed : Array[(Int, Double)] = Array::make(n, (0, 0.0))
  for i = 0; i < n; i = i + 1 {
    indexed[i] = (i, strengths[i])
  }
  indexed.sort_by(fn(a, b) {
    let by_strength = b.1.compare(a.1)
    if by_strength != 0 {
      by_strength
    } else {
      a.0.compare(b.0)
    }
  })
  let ranks : Array[Int] = Array::make(n, 0)
  for rank = 0; rank < n; rank = rank + 1 {
    ranks[indexed[rank].0] = rank + 1
  }
  ranks
}

///|
pub fn IndexedRanker::compute_ordinal_ranks(self : IndexedRanker) -> Array[Int] {
  compute_ranks_from_strengths(self.strengths)
}

///|
pub fn IndexedRanker::get_rank_for(self : IndexedRanker, index : Int) -> Int? {
  if index < 0 || index >= self.n {
    return None
  }
  let ranks = self.compute_ordinal_ranks()
  Some(ranks[index])
}

///|
/// Bootstrapped uncertainty for Plackett-Luce.
pub fn IndexedRanker::compute_uncertainty(
  self : IndexedRanker,
  samples : Int,
  max_iter : Int,
  top_k : Int,
) -> Bool {
  if self.n < 2 || samples <= 0 {
    return false
  }
  let k = if top_k < 1 { 1 } else if top_k > self.n { self.n } else { top_k }
  let rank_hist : Array[Array[Int]] = Array::make(self.n, [])
  for i = 0; i < self.n; i = i + 1 {
    rank_hist[i] = Array::make(self.n, 0)
  }
  let rank_sum : Array[Double] = Array::make(self.n, 0.0)
  let topk_counts : Array[Int] = Array::make(self.n, 0)
  let gamma : Array[Double] = Array::make(self.n, 0.0)
  for i = 0; i < self.n; i = i + 1 {
    gamma[i] = @math.exp(self.strengths[i])
  }
  // Scratch buffers reused across every sample: `source_events` aliases the
  // recorded orderings, `sample_events` receives each resampled ordering.
  let source_events : Array[Array[Int]] = []
  let sample_events : Array[Array[Int]] = []
  for event in self.events {
    if event.items.length() >= 2 {
      source_events.push(event.items)
      sample_events.push(Array::make(event.items.length(), 0))
    }
  }
  if source_events.length() == 0 {
    return false
  }
  let remaining : Array[Int] = []
  for sample = 0; sample < samples; sample = sample + 1 {
    // Resample each observed event from the fitted model (parametric
    // bootstrap): repeatedly draw a winner from the remaining items with
    // probability proportional to gamma.
    for e = 0; e < source_events.length(); e = e + 1 {
      let source = source_events[e]
      let target = sample_events[e]
      remaining.clear()
      for idx in source {
        remaining.push(idx)
      }
      let mut total_gamma = 0.0
      for idx in remaining {
        total_gamma = total_gamma + gamma[idx]
      }
      let mut pos = 0
      while remaining.length() > 0 {
        let r = self.next_random_double() * total_gamma
        let mut running_sum = 0.0
        let mut winner_slot = remaining.length() - 1
        for j = 0; j < remaining.length(); j = j + 1 {
          running_sum = running_sum + gamma[remaining[j]]
          if r <= running_sum {
            winner_slot = j
            break
          }
        }
        let winner = remaining[winner_slot]
        target[pos] = winner
        pos = pos + 1
        total_gamma = total_gamma - gamma[winner]
        let _ = remaining.remove(winner_slot)
      }
    }
    let fitted = pl_fit_indexed(
      self.n,
      sample_events,
      self.strengths,
      max_iter~,
      tolerance=1.0e-5,
      use_map=true,
    )
    let ranks = compute_ranks_from_strengths(fitted)
    for i = 0; i < self.n; i = i + 1 {
      let rank = ranks[i]
      rank_sum[i] = rank_sum[i] + rank.to_double()
      rank_hist[i][rank - 1] = rank_hist[i][rank - 1] + 1
      if rank <= k {
        topk_counts[i] = topk_counts[i] + 1
      }
    }
  }
  // 10th-90th percentile of the bootstrap rank distribution: an 80% interval.
  // The UI labels it "Rank CI · 80%" (site/src/components/Rankings.astro);
  // change both together.
  let lower_target = @math.ceil(samples.to_double() * 0.1).to_int()
  let upper_target = @math.ceil(samples.to_double() * 0.9).to_int()
  self.rank_ci_low = Array::make(self.n, 0)
  self.rank_ci_high = Array::make(self.n, 0)
  self.rank_mean = Array::make(self.n, 0.0)
  self.topk_confidence = Array::make(self.n, 0.0)
  for i = 0; i < self.n; i = i + 1 {
    let mut cumulative = 0
    let mut low_rank = 1
    let mut high_rank = self.n
    for rank = 1; rank <= self.n; rank = rank + 1 {
      cumulative = cumulative + rank_hist[i][rank - 1]
      if cumulative >= lower_target {
        low_rank = rank
        break
      }
    }
    cumulative = 0
    for rank = 1; rank <= self.n; rank = rank + 1 {
      cumulative = cumulative + rank_hist[i][rank - 1]
      if cumulative >= upper_target {
        high_rank = rank
        break
      }
    }
    self.rank_ci_low[i] = low_rank
    self.rank_ci_high[i] = high_rank
    self.rank_mean[i] = rank_sum[i] / samples.to_double()
    self.topk_confidence[i] = topk_counts[i].to_double() / samples.to_double()
  }
  let widths : Array[Int] = Array::make(self.n, 0)
  let order : Array[Int] = Array::make(self.n, 0)
  for i = 0; i < self.n; i = i + 1 {
    widths[i] = self.rank_ci_high[i] - self.rank_ci_low[i]
    order[i] = i
  }
  let widths_sorted = widths.copy()
  widths_sorted.sort_by(fn(a, b) { a.compare(b) })
  let median_index = widths_sorted.length() / 2
  self.uncertainty_median_width = widths_sorted[median_index]
  let mut p90_index = @math.floor(self.n.to_double() * 0.9).to_int() - 1
  if p90_index < 0 {
    p90_index = 0
  }
  if p90_index >= self.n {
    p90_index = self.n - 1
  }
  self.uncertainty_p90_width = widths_sorted[p90_index]
  order.sort_by(fn(a, b) { widths[b].compare(widths[a]) })
  self.uncertainty_widths = widths
  self.uncertainty_order = order
  self.uncertainty_ready = true
  self.uncertainty_samples = samples
  self.uncertainty_top_k = k
  true
}

// ... rest of the helper methods (get_uncertainty_ready, etc.) same as before ...

///|
pub fn IndexedRanker::get_uncertainty_ready(self : IndexedRanker) -> Bool {
  self.uncertainty_ready
}

///|
pub fn IndexedRanker::get_uncertainty_samples(self : IndexedRanker) -> Int {
  self.uncertainty_samples
}

///|
pub fn IndexedRanker::get_uncertainty_top_k(self : IndexedRanker) -> Int {
  self.uncertainty_top_k
}

///|
pub fn IndexedRanker::get_uncertainty_width_for(
  self : IndexedRanker,
  index : Int,
) -> Int {
  if !self.uncertainty_ready || index < 0 || index >= self.n {
    -1
  } else {
    self.uncertainty_widths[index]
  }
}

///|
pub fn IndexedRanker::get_uncertainty_median_width(self : IndexedRanker) -> Int {
  if !self.uncertainty_ready {
    -1
  } else {
    self.uncertainty_median_width
  }
}

///|
pub fn IndexedRanker::get_uncertainty_p90_width(self : IndexedRanker) -> Int {
  if !self.uncertainty_ready {
    -1
  } else {
    self.uncertainty_p90_width
  }
}

///|
pub fn IndexedRanker::get_uncertainty_width_target(self : IndexedRanker) -> Int {
  if !self.uncertainty_ready {
    -1
  } else {
    let t = @math.round(self.n.to_double() * 0.05).to_int()
    if t < 2 {
      2
    } else {
      t
    }
  }
}

///|
pub fn IndexedRanker::get_uncertainty_order_index(
  self : IndexedRanker,
  position : Int,
) -> Int {
  if !self.uncertainty_ready || position < 0 || position >= self.n {
    -1
  } else {
    self.uncertainty_order[position]
  }
}

///|
pub fn IndexedRanker::get_topk_stable_count(
  self : IndexedRanker,
  threshold : Double,
) -> Int {
  if !self.uncertainty_ready || self.n == 0 {
    return 0
  }
  let cut = if threshold < 0.0 {
    0.0
  } else if threshold > 1.0 {
    1.0
  } else {
    threshold
  }
  let ranks = self.compute_ordinal_ranks()
  let mut count = 0
  for i = 0; i < self.n; i = i + 1 {
    if ranks[i] <= self.uncertainty_top_k && self.topk_confidence[i] >= cut {
      count = count + 1
    }
  }
  count
}

///|
pub fn IndexedRanker::get_rank_ci_low(self : IndexedRanker, index : Int) -> Int {
  if !self.uncertainty_ready || index < 0 || index >= self.n {
    -1
  } else {
    self.rank_ci_low[index]
  }
}

///|
pub fn IndexedRanker::get_rank_ci_high(
  self : IndexedRanker,
  index : Int,
) -> Int {
  if !self.uncertainty_ready || index < 0 || index >= self.n {
    -1
  } else {
    self.rank_ci_high[index]
  }
}

///|
pub fn IndexedRanker::get_rank_mean(
  self : IndexedRanker,
  index : Int,
) -> Double {
  if !self.uncertainty_ready || index < 0 || index >= self.n {
    -1.0
  } else {
    self.rank_mean[index]
  }
}

///|
pub fn IndexedRanker::get_topk_confidence(
  self : IndexedRanker,
  index : Int,
) -> Double {
  if !self.uncertainty_ready || index < 0 || index >= self.n {
    -1.0
  } else {
    self.topk_confidence[index]
  }
}

///|
pub fn IndexedRanker::get_progress(self : IndexedRanker) -> (Int, Int) {
  let completed = self.iteration_count
  let mut estimated = estimate_total_comparisons(self.n)
  if completed > estimated {
    estimated = completed
  }
  (completed, estimated)
}

///|
pub fn IndexedRanker::get_random_pair(
  self : IndexedRanker,
  random : Double,
) -> (Int, Int)? {
  if self.n < 2 {
    return None
  }
  let total_pairs = self.n * (self.n - 1) / 2
  let mut r = if random < 0.0 { -random } else { random }
  if r >= 1.0 {
    r = r - @math.floor(r)
  }
  let mut idx = @math.floor(r * total_pairs.to_double()).to_int()
  if idx < 0 {
    idx = 0
  }
  if idx >= total_pairs {
    idx = total_pairs - 1
  }
  let mut remaining = idx
  for i = 0; i < self.n - 1; i = i + 1 {
    let width = self.n - i - 1
    if remaining < width {
      return Some((i, i + 1 + remaining))
    }
    remaining = remaining - width
  }
  None
}

///|
fn IndexedRanker::get_a_optimal_pair(self : IndexedRanker) -> (Int, Int)? {
  if self.n < 2 {
    return None
  }
  let counts = self.compute_counts()
  let vars = self.variance_proxy(counts)
  let mut best_score = -1.0
  let mut best_i = 0
  let mut best_j = 1
  for i = 0; i < self.n; i = i + 1 {
    for j = i + 1; j < self.n; j = j + 1 {
      let diff = self.strengths[i] - self.strengths[j]
      let p_ij = 1.0 / (1.0 + @math.exp(-diff))
      let info = p_ij * (1.0 - p_ij)
      let score = info * (vars[i] + vars[j])
      if score > best_score {
        best_score = score
        best_i = i
        best_j = j
      }
    }
  }
  Some((best_i, best_j))
}

///|
fn IndexedRanker::sample_strengths(self : IndexedRanker) -> Array[Double] {
  let counts = self.compute_counts()
  let vars = self.variance_proxy(counts)
  let samples : Array[Double] = Array::make(self.n, 0.0)
  for i = 0; i < self.n; i = i + 1 {
    let sigma = vars[i].sqrt()
    let noise = self.next_random_normal() * sigma
    samples[i] = self.strengths[i] + noise
  }
  samples
}

///|
fn IndexedRanker::get_thompson_top_pair(self : IndexedRanker) -> (Int, Int)? {
  if self.n < 2 {
    return None
  }
  let samples = self.sample_strengths()
  let mut best_i = 0
  let mut best_j = 1
  if samples[best_j] > samples[best_i] {
    let tmp = best_i
    best_i = best_j
    best_j = tmp
  }
  for i = 2; i < self.n; i = i + 1 {
    if samples[i] > samples[best_i] {
      best_j = best_i
      best_i = i
    } else if samples[i] > samples[best_j] {
      best_j = i
    }
  }
  Some((best_i, best_j))
}

///|
fn IndexedRanker::get_thompson_neighbor_pair(
  self : IndexedRanker,
) -> (Int, Int)? {
  if self.n < 2 {
    return None
  }
  let samples = self.sample_strengths()
  let indexed : Array[(Int, Double)] = Array::make(self.n, (0, 0.0))
  for i = 0; i < self.n; i = i + 1 {
    indexed[i] = (i, samples[i])
  }
  indexed.sort_by(fn(a, b) { b.1.compare(a.1) })
  let mut best_i = indexed[0].0
  let mut best_j = indexed[1].0
  let mut best_gap = (indexed[0].1 - indexed[1].1).abs()
  for i = 1; i < self.n - 1; i = i + 1 {
    let gap = (indexed[i].1 - indexed[i + 1].1).abs()
    if gap < best_gap {
      best_gap = gap
      best_i = indexed[i].0
      best_j = indexed[i + 1].0
    }
  }
  Some((best_i, best_j))
}

///|
pub fn IndexedRanker::get_next_pair(
  self : IndexedRanker,
  epsilon : Double,
  random : Double,
) -> (Int, Int)? {
  if self.n < 2 {
    return None
  }
  let use_random = epsilon > 0.0 && random < epsilon
  if use_random {
    let scaled = if epsilon > 0.0 { random / epsilon } else { random }
    return self.get_random_pair(scaled)
  }
  match self.pair_policy {
    1 => self.get_thompson_top_pair()
    2 => self.get_thompson_neighbor_pair()
    _ => self.get_a_optimal_pair()
  }
}

///|
pub fn IndexedRanker::get_tiers(self : IndexedRanker, k : Int) -> Array[Int] {
  if self.n == 0 {
    return []
  }
  kmeans_1d(self.strengths, k)
}
