///|
/// A single ranking event: an ordered list of items (best to worst).
pub struct RankingEvent {
  items : Array[String]
} derive(ToJson, FromJson)

///|
/// Comparison result: A wins, B wins, or Tie.
pub(all) enum ComparisonResult {
  AWins
  BWins
  Tie
}

///|
/// Serializable core state for Bradley-Terry ranker.
pub struct RankerState {
  items : Array[String]
  strengths : Array[Double]
  comparison_matrix : Array[Array[Int]]
  win_matrix : Array[Array[Double]]
  iteration_count : Int
  completed_comparisons : Array[(String, String)]
} derive(ToJson, FromJson)

///|
/// History entry for undo functionality.
pub struct HistoryEntry {
  item_a : String
  item_b : String
  strengths : Array[Double]
  comparison_matrix : Array[Array[Int]]
  win_matrix : Array[Array[Double]]
  iteration_count : Int
  completed_comparisons : Array[(String, String)]
} derive(ToJson, FromJson)

///|
/// Full serializable state including history.
pub struct SaveState {
  state : RankerState
  history : Array[HistoryEntry]
} derive(ToJson, FromJson)

///|
pub fn estimate_total_comparisons(n : Int) -> Int {
  if n < 2 {
    return 0
  }
  let n_f = n.to_double()
  let estimate = (n_f * @math.ln(n_f + 1.0) * 2.0).round()
  let rounded = estimate.to_int()
  if rounded < 1 {
    1
  } else {
    rounded
  }
}

///|
pub fn bradley_terry_prob(strength_a : Double, strength_b : Double) -> Double {
  let diff = strength_a - strength_b
  1.0 / (1.0 + @math.exp(-diff))
}

///|
pub fn log_likelihood(
  strengths : Array[Double],
  comparison_matrix : Array[Array[Int]],
  win_matrix : Array[Array[Double]],
) -> Double {
  let n = strengths.length()
  if n == 0 {
    return 0.0
  }
  let mut ll = 0.0
  for i = 0; i < n; i = i + 1 {
    for j = i + 1; j < n; j = j + 1 {
      let total = comparison_matrix[i][j]
      if total == 0 {
        continue
      }
      let wins = win_matrix[i][j]
      let losses = win_matrix[j][i]
      let p = bradley_terry_prob(strengths[i], strengths[j])
      let q = 1.0 - p
      if wins > 0.0 {
        ll = ll + wins * @math.ln(p)
      }
      if losses > 0.0 {
        ll = ll + losses * @math.ln(q)
      }
    }
  }
  ll
}

///|
pub fn mm_fit(
  strengths : Array[Double],
  comparison_matrix : Array[Array[Int]],
  win_matrix : Array[Array[Double]],
  max_iter? : Int = 50,
  tolerance? : Double = 1.0e-6,
) -> Array[Double] {
  let n = strengths.length()
  if n == 0 {
    return []
  }
  let mut gamma : Array[Double] = Array::make(n, 0.0)
  for i = 0; i < n; i = i + 1 {
    gamma[i] = @math.exp(strengths[i])
  }
  let mut iter = 0
  let limit = if max_iter < 1 { 1 } else { max_iter }
  let tol = if tolerance <= 0.0 { 1.0e-6 } else { tolerance }
  while iter < limit {
    let mut max_delta = 0.0
    let next_gamma : Array[Double] = Array::make(n, 0.0)
    for i = 0; i < n; i = i + 1 {
      let mut wins = 0.0
      let mut denom = 0.0
      for j = 0; j < n; j = j + 1 {
        if i == j {
          continue
        }
        wins = wins + win_matrix[i][j]
        let comps = comparison_matrix[i][j]
        if comps > 0 {
          denom = denom + comps.to_double() / (gamma[i] + gamma[j])
        }
      }
      if wins <= 0.0 || denom <= 0.0 {
        next_gamma[i] = gamma[i]
      } else {
        next_gamma[i] = wins / denom
      }
      let delta = (next_gamma[i] - gamma[i]).abs()
      if delta > max_delta {
        max_delta = delta
      }
    }
    let mut mean = 0.0
    for i = 0; i < n; i = i + 1 {
      mean = mean + next_gamma[i]
    }
    if mean > 0.0 {
      for i = 0; i < n; i = i + 1 {
        next_gamma[i] = next_gamma[i] / mean
      }
    }
    gamma = next_gamma
    if max_delta < tol {
      break
    }
    iter = iter + 1
  }
  let out : Array[Double] = Array::make(n, 0.0)
  for i = 0; i < n; i = i + 1 {
    out[i] = @math.ln(gamma[i])
  }
  out
}

///|
pub fn newman_fit(
  strengths : Array[Double],
  comparison_matrix : Array[Array[Int]],
  win_matrix : Array[Array[Double]],
  max_iter? : Int = 50,
  tolerance? : Double = 1.0e-6,
  use_map? : Bool = false,
) -> Array[Double] {
  let n = strengths.length()
  if n == 0 {
    return []
  }
  let mut gamma : Array[Double] = Array::make(n, 0.0)
  for i = 0; i < n; i = i + 1 {
    gamma[i] = @math.exp(strengths[i])
  }
  let mut iter = 0
  let limit = if max_iter < 1 { 1 } else { max_iter }
  let tol = if tolerance <= 0.0 { 1.0e-6 } else { tolerance }
  let prior = if use_map { 1.0 } else { 0.0 }
  while iter < limit {
    let mut max_delta = 0.0
    let next_gamma : Array[Double] = Array::make(n, 0.0)
    for i = 0; i < n; i = i + 1 {
      let mut wins = prior
      let mut denom = prior
      for j = 0; j < n; j = j + 1 {
        if i == j {
          continue
        }
        wins = wins + win_matrix[i][j]
        let comps = comparison_matrix[i][j]
        if comps > 0 {
          denom = denom + comps.to_double() / (gamma[i] + gamma[j])
        }
      }
      if wins <= 0.0 || denom <= 0.0 {
        next_gamma[i] = gamma[i]
      } else {
        next_gamma[i] = wins / denom
      }
      let delta = (next_gamma[i] - gamma[i]).abs()
      if delta > max_delta {
        max_delta = delta
      }
    }
    let mut mean = 0.0
    for i = 0; i < n; i = i + 1 {
      mean = mean + next_gamma[i]
    }
    if mean > 0.0 {
      for i = 0; i < n; i = i + 1 {
        next_gamma[i] = next_gamma[i] / mean
      }
    }
    gamma = next_gamma
    if max_delta < tol {
      break
    }
    iter = iter + 1
  }
  let out : Array[Double] = Array::make(n, 0.0)
  for i = 0; i < n; i = i + 1 {
    out[i] = @math.ln(gamma[i])
  }
  out
}

///|
pub fn pl_fit(
  n : Int,
  events : Array[RankingEvent],
  strengths : Array[Double],
  item_to_idx : Map[String, Int],
  max_iter? : Int = 50,
  tolerance? : Double = 1.0e-5,
  use_map? : Bool = false,
) -> Array[Double] {
  if n <= 0 {
    return []
  }
  let limit = if max_iter < 1 { 1 } else { max_iter }
  let tol = if tolerance <= 0.0 { 1.0e-5 } else { tolerance }
  let prior = if use_map { 1.0 } else { 0.0 }
  let gamma : Array[Double] = Array::make(n, 0.0)
  for i = 0; i < n; i = i + 1 {
    let s = if i < strengths.length() { strengths[i] } else { 0.0 }
    gamma[i] = @math.exp(s)
  }
  let filtered_events : Array[Array[Int]] = []
  for event in events {
    let indices : Array[Int] = []
    for item in event.items {
      match item_to_idx.get(item) {
        Some(idx) => indices.push(idx)
        None => ()
      }
    }
    if indices.length() >= 2 {
      filtered_events.push(indices)
    }
  }
  if filtered_events.length() == 0 {
    return strengths
  }
  let mut iter = 0
  while iter < limit {
    let wins : Array[Double] = Array::make(n, 0.0)
    let denom : Array[Double] = Array::make(n, 0.0)
    for event in filtered_events {
      let len = event.length()
      for pos = 0; pos < len; pos = pos + 1 {
        let mut sum_gamma = 0.0
        for k = pos; k < len; k = k + 1 {
          sum_gamma = sum_gamma + gamma[event[k]]
        }
        if sum_gamma <= 0.0 {
          continue
        }
        let inv = 1.0 / sum_gamma
        for k = pos; k < len; k = k + 1 {
          denom[event[k]] = denom[event[k]] + inv
        }
        wins[event[pos]] = wins[event[pos]] + 1.0
      }
    }
    let mut max_delta = 0.0
    for i = 0; i < n; i = i + 1 {
      let numerator = wins[i] + prior
      let denominator = denom[i] + prior
      let next = if denominator <= 0.0 {
        gamma[i]
      } else {
        numerator / denominator
      }
      let delta = (next - gamma[i]).abs()
      if delta > max_delta {
        max_delta = delta
      }
      gamma[i] = next
    }
    let mut mean = 0.0
    for i = 0; i < n; i = i + 1 {
      mean = mean + gamma[i]
    }
    if mean > 0.0 {
      for i = 0; i < n; i = i + 1 {
        gamma[i] = gamma[i] / mean
      }
    }
    if max_delta < tol {
      break
    }
    iter = iter + 1
  }
  let out : Array[Double] = Array::make(n, 0.0)
  for i = 0; i < n; i = i + 1 {
    out[i] = @math.ln(gamma[i])
  }
  out
}

///|
fn build_matrix_int(n : Int) -> Array[Array[Int]] {
  let matrix : Array[Array[Int]] = Array::make(n, [])
  for i = 0; i < n; i = i + 1 {
    matrix[i] = Array::make(n, 0)
  }
  matrix
}

///|
fn build_matrix_double(n : Int) -> Array[Array[Double]] {
  let matrix : Array[Array[Double]] = Array::make(n, [])
  for i = 0; i < n; i = i + 1 {
    matrix[i] = Array::make(n, 0.0)
  }
  matrix
}

///|
fn copy_matrix_int(matrix : Array[Array[Int]]) -> Array[Array[Int]] {
  let n = matrix.length()
  let out : Array[Array[Int]] = Array::make(n, [])
  for i = 0; i < n; i = i + 1 {
    out[i] = matrix[i].copy()
  }
  out
}

///|
fn copy_matrix_double(matrix : Array[Array[Double]]) -> Array[Array[Double]] {
  let n = matrix.length()
  let out : Array[Array[Double]] = Array::make(n, [])
  for i = 0; i < n; i = i + 1 {
    out[i] = matrix[i].copy()
  }
  out
}

///|
fn normalize_pair(a : String, b : String) -> (String, String) {
  if a.compare(b) <= 0 {
    (a, b)
  } else {
    (b, a)
  }
}

///|
fn hashset_to_array(
  set : @hashset.HashSet[(String, String)],
) -> Array[(String, String)] {
  let arr : Array[(String, String)] = []
  set.each(fn(pair) { arr.push(pair) })
  arr
}

///|
fn array_to_hashset(
  values : Array[(String, String)],
) -> @hashset.HashSet[(String, String)] {
  let set = @hashset.new()
  for pair in values {
    set.add(pair)
  }
  set
}

///|
pub struct BradleyTerryRanker {
  items : Array[String]
  item_to_idx : Map[String, Int]
  mut strengths : Array[Double]
  mut comparison_matrix : Array[Array[Int]]
  mut win_matrix : Array[Array[Double]]
  mut iteration_count : Int
  mut completed_comparisons : @hashset.HashSet[(String, String)]
  history : Array[HistoryEntry]
}

///|
pub fn BradleyTerryRanker::new(items : Array[String]) -> BradleyTerryRanker {
  let n = items.length()
  let item_to_idx : Map[String, Int] = {}
  for i = 0; i < n; i = i + 1 {
    item_to_idx[items[i]] = i
  }
  {
    items,
    item_to_idx,
    strengths: Array::make(n, 0.0),
    comparison_matrix: build_matrix_int(n),
    win_matrix: build_matrix_double(n),
    iteration_count: 0,
    completed_comparisons: @hashset.new(),
    history: [],
  }
}

///|
pub fn BradleyTerryRanker::n_items(self : BradleyTerryRanker) -> Int {
  self.items.length()
}

///|
pub fn BradleyTerryRanker::total_comparisons(self : BradleyTerryRanker) -> Int {
  self.iteration_count
}

///|
pub fn BradleyTerryRanker::get_progress(
  self : BradleyTerryRanker,
) -> (Int, Int) {
  let completed = self.iteration_count
  let mut estimated = estimate_total_comparisons(self.items.length())
  if completed > estimated {
    estimated = completed
  }
  (completed, estimated)
}

///|
pub fn BradleyTerryRanker::fit(self : BradleyTerryRanker) -> Unit {
  self.strengths = newman_fit(
    self.strengths,
    self.comparison_matrix,
    self.win_matrix,
    use_map=true,
  )
}

///|
pub fn BradleyTerryRanker::update_single_query(
  self : BradleyTerryRanker,
  item_a : String,
  item_b : String,
  result : ComparisonResult,
) -> Unit {
  match (self.item_to_idx.get(item_a), self.item_to_idx.get(item_b)) {
    (Some(idx_a), Some(idx_b)) => {
      if idx_a == idx_b {
        return
      }
      let entry : HistoryEntry = {
        item_a,
        item_b,
        strengths: self.strengths.copy(),
        comparison_matrix: copy_matrix_int(self.comparison_matrix),
        win_matrix: copy_matrix_double(self.win_matrix),
        iteration_count: self.iteration_count,
        completed_comparisons: hashset_to_array(self.completed_comparisons),
      }
      self.history.push(entry)
      self.comparison_matrix[idx_a][idx_b] = self.comparison_matrix[idx_a][idx_b] +
        1
      self.comparison_matrix[idx_b][idx_a] = self.comparison_matrix[idx_b][idx_a] +
        1
      match result {
        AWins =>
          self.win_matrix[idx_a][idx_b] = self.win_matrix[idx_a][idx_b] + 1.0
        BWins =>
          self.win_matrix[idx_b][idx_a] = self.win_matrix[idx_b][idx_a] + 1.0
        Tie => {
          self.win_matrix[idx_a][idx_b] = self.win_matrix[idx_a][idx_b] + 0.5
          self.win_matrix[idx_b][idx_a] = self.win_matrix[idx_b][idx_a] + 0.5
        }
      }
      let pair = normalize_pair(item_a, item_b)
      self.completed_comparisons.add(pair)
      self.iteration_count = self.iteration_count + 1
      self.fit()
    }
    _ => ()
  }
}

///|
pub fn BradleyTerryRanker::undo_last(self : BradleyTerryRanker) -> Bool {
  match self.history.pop() {
    Some(entry) => {
      self.strengths = entry.strengths
      self.comparison_matrix = entry.comparison_matrix
      self.win_matrix = entry.win_matrix
      self.iteration_count = entry.iteration_count
      self.completed_comparisons = array_to_hashset(entry.completed_comparisons)
      true
    }
    None => false
  }
}

///|
pub fn BradleyTerryRanker::compute_ordinal_rankings(
  self : BradleyTerryRanker,
) -> Map[String, Int] {
  let n = self.items.length()
  let indexed : Array[(Int, Double)] = Array::make(n, (0, 0.0))
  for i = 0; i < n; i = i + 1 {
    indexed[i] = (i, self.strengths[i])
  }
  indexed.sort_by(fn(a, b) { b.1.compare(a.1) })
  let ranks : Map[String, Int] = {}
  for rank = 0; rank < n; rank = rank + 1 {
    let idx = indexed[rank].0
    ranks[self.items[idx]] = rank + 1
  }
  ranks
}

///|
pub fn BradleyTerryRanker::compute_ranks(
  self : BradleyTerryRanker,
) -> Map[String, Double] {
  let result : Map[String, Double] = {}
  for i = 0; i < self.items.length(); i = i + 1 {
    result[self.items[i]] = self.strengths[i]
  }
  result
}

///|
pub fn BradleyTerryRanker::get_strength(
  self : BradleyTerryRanker,
  item : String,
) -> Double? {
  match self.item_to_idx.get(item) {
    Some(idx) => Some(self.strengths[idx])
    None => None
  }
}

///|
pub fn BradleyTerryRanker::get_win_probability(
  self : BradleyTerryRanker,
  item_a : String,
  item_b : String,
) -> Double? {
  match (self.item_to_idx.get(item_a), self.item_to_idx.get(item_b)) {
    (Some(idx_a), Some(idx_b)) =>
      Some(bradley_terry_prob(self.strengths[idx_a], self.strengths[idx_b]))
    _ => None
  }
}

///|
pub fn BradleyTerryRanker::get_most_informative_pair(
  self : BradleyTerryRanker,
) -> (String, String)? {
  let n = self.items.length()
  if n < 2 {
    return None
  }
  let total_pairs = n * (n - 1) / 2
  let use_unseen = self.completed_comparisons.length() < total_pairs
  let mut best_score = -1.0
  let mut best_pair = ("", "")
  for i = 0; i < n; i = i + 1 {
    for j = i + 1; j < n; j = j + 1 {
      let pair = normalize_pair(self.items[i], self.items[j])
      if use_unseen && self.completed_comparisons.contains(pair) {
        continue
      }
      let p = bradley_terry_prob(self.strengths[i], self.strengths[j])
      let score = p * (1.0 - p)
      if score > best_score {
        best_score = score
        best_pair = (self.items[i], self.items[j])
      }
    }
  }
  if best_score < 0.0 {
    None
  } else {
    Some(best_pair)
  }
}

///|
pub fn BradleyTerryRanker::to_save_state(
  self : BradleyTerryRanker,
) -> SaveState {
  let state : RankerState = {
    items: self.items.copy(),
    strengths: self.strengths.copy(),
    comparison_matrix: copy_matrix_int(self.comparison_matrix),
    win_matrix: copy_matrix_double(self.win_matrix),
    iteration_count: self.iteration_count,
    completed_comparisons: hashset_to_array(self.completed_comparisons),
  }
  { state, history: self.history.copy() }
}

///|
pub fn BradleyTerryRanker::from_save_state(
  state : SaveState,
) -> BradleyTerryRanker {
  let item_to_idx : Map[String, Int] = {}
  for i = 0; i < state.state.items.length(); i = i + 1 {
    item_to_idx[state.state.items[i]] = i
  }
  {
    items: state.state.items,
    item_to_idx,
    strengths: state.state.strengths,
    comparison_matrix: state.state.comparison_matrix,
    win_matrix: state.state.win_matrix,
    iteration_count: state.state.iteration_count,
    completed_comparisons: array_to_hashset(state.state.completed_comparisons),
    history: state.history,
  }
}

///|
pub fn BradleyTerryRanker::to_json_string(self : BradleyTerryRanker) -> String {
  self.to_save_state().to_json().stringify()
}

///|
pub fn BradleyTerryRanker::from_json_string(
  raw : String,
) -> BradleyTerryRanker? {
  let parsed = @json.parse(raw) catch { _ => return None }
  let state : SaveState = @json.from_json(parsed) catch { _ => return None }
  Some(BradleyTerryRanker::from_save_state(state))
}

///|
pub(all) struct PlHistoryEntry {
  strengths : Array[Double]
  events : Array[RankingEvent]
  iteration_count : Int
}

///|
pub(all) struct PlackettLuceState {
  items : Array[String]
  strengths : Array[Double]
  events : Array[RankingEvent]
  iteration_count : Int
} derive(ToJson, FromJson)

///|
pub struct PlackettLuceRanker {
  items : Array[String]
  item_to_idx : Map[String, Int]
  mut strengths : Array[Double]
  mut events : Array[RankingEvent]
  mut iteration_count : Int
  history : Array[PlHistoryEntry]
}

///|
pub fn PlackettLuceRanker::new(items : Array[String]) -> PlackettLuceRanker {
  let n = items.length()
  let item_to_idx : Map[String, Int] = {}
  for i = 0; i < n; i = i + 1 {
    item_to_idx[items[i]] = i
  }
  {
    items,
    item_to_idx,
    strengths: Array::make(n, 0.0),
    events: [],
    iteration_count: 0,
    history: [],
  }
}

///|
pub fn PlackettLuceRanker::total_comparisons(self : PlackettLuceRanker) -> Int {
  self.iteration_count
}

///|
pub fn PlackettLuceRanker::fit(self : PlackettLuceRanker) -> Unit {
  self.strengths = pl_fit(
    self.items.length(),
    self.events,
    self.strengths,
    self.item_to_idx,
  )
}

///|
pub fn PlackettLuceRanker::add_ranking(
  self : PlackettLuceRanker,
  ranking : Array[String],
) -> Bool {
  if ranking.length() < 2 {
    return false
  }
  let filtered : Array[String] = []
  for item in ranking {
    if self.item_to_idx.contains(item) {
      filtered.push(item)
    }
  }
  if filtered.length() < 2 {
    return false
  }
  let entry : PlHistoryEntry = {
    strengths: self.strengths.copy(),
    events: self.events.copy(),
    iteration_count: self.iteration_count,
  }
  self.history.push(entry)
  self.events.push({ items: filtered })
  self.iteration_count = self.iteration_count + 1
  self.fit()
  true
}

///|
pub fn PlackettLuceRanker::update_single_query(
  self : PlackettLuceRanker,
  item_a : String,
  item_b : String,
  result : ComparisonResult,
) -> Unit {
  match result {
    AWins => ignore(self.add_ranking([item_a, item_b]))
    BWins => ignore(self.add_ranking([item_b, item_a]))
    Tie => {
      ignore(self.add_ranking([item_a, item_b]))
      ignore(self.add_ranking([item_b, item_a]))
    }
  }
}

///|
pub fn PlackettLuceRanker::undo_last(self : PlackettLuceRanker) -> Bool {
  match self.history.pop() {
    Some(entry) => {
      self.strengths = entry.strengths
      self.events = entry.events
      self.iteration_count = entry.iteration_count
      true
    }
    None => false
  }
}

///|
pub fn PlackettLuceRanker::compute_ordinal_rankings(
  self : PlackettLuceRanker,
) -> Map[String, Int] {
  let n = self.items.length()
  let indexed : Array[(Int, Double)] = Array::make(n, (0, 0.0))
  for i = 0; i < n; i = i + 1 {
    indexed[i] = (i, self.strengths[i])
  }
  indexed.sort_by(fn(a, b) { b.1.compare(a.1) })
  let ranks : Map[String, Int] = {}
  for rank = 0; rank < n; rank = rank + 1 {
    let idx = indexed[rank].0
    ranks[self.items[idx]] = rank + 1
  }
  ranks
}

///|
pub fn PlackettLuceRanker::compute_ranks(
  self : PlackettLuceRanker,
) -> Map[String, Double] {
  let n = self.items.length()
  let weights : Array[Double] = Array::make(n, 0.0)
  let mut total = 0.0
  for i = 0; i < n; i = i + 1 {
    let w = @math.exp(self.strengths[i])
    weights[i] = w
    total = total + w
  }
  if total <= 0.0 {
    total = 1.0
  }
  let result : Map[String, Double] = {}
  for i = 0; i < n; i = i + 1 {
    result[self.items[i]] = weights[i] / total
  }
  result
}

///|
pub fn PlackettLuceRanker::to_json_string(self : PlackettLuceRanker) -> String {
  let state : PlackettLuceState = {
    items: self.items.copy(),
    strengths: self.strengths.copy(),
    events: self.events.copy(),
    iteration_count: self.iteration_count,
  }
  state.to_json().stringify()
}
