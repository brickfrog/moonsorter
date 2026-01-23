///|
/// Global indexed ranker instance (WASM is single-threaded, this is fine).
let ranker : Ref[@ranker.IndexedRanker?] = { val: None }

///|
let pending_ranking : Array[Int] = []

///|
/// Create a new ranker with item count.
/// Returns true on success.
pub fn create_ranker(count : Int) -> Bool {
  if count < 2 {
    return false
  }
  ranker.val = Some(@ranker.IndexedRanker::new(count))
  true
}

///|
/// Add a comparison: result 1 = A wins, 2 = tie, 3 = B wins.
/// Returns true on success.
pub fn add_comparison(index_a : Int, index_b : Int, result : Int) -> Bool {
  match ranker.val {
    Some(r) => {
      let res = match result {
        1 => @ranker.AWins
        2 => @ranker.Tie
        _ => @ranker.BWins
      }
      r.update_single_query(index_a, index_b, res)
    }
    None => false
  }
}

///|
/// Add a K-way ranking event. indices are from best to worst.
pub fn add_ranking(indices : Array[Int]) -> Bool {
  match ranker.val {
    Some(r) => r.add_ranking(indices)
    None => false
  }
}

///|
pub fn clear_ranking() -> Unit {
  pending_ranking.clear()
}

///|
pub fn add_to_ranking(idx : Int) -> Unit {
  pending_ranking.push(idx)
}

///|
pub fn commit_ranking() -> Bool {
  match ranker.val {
    Some(r) => {
      let ok = r.add_ranking(pending_ranking)
      pending_ranking.clear()
      ok
    }
    None => {
      pending_ranking.clear()
      false
    }
  }
}

///|
/// Get the next pair encoded as a single integer.
/// Uses epsilon-greedy exploration when epsilon > 0.
/// Returns -1 when there is no pair.
pub fn get_next_pair_encoded(epsilon : Double, random : Double) -> Int {
  match ranker.val {
    Some(r) => {
      let pair = r.get_next_pair(epsilon, random)
      match pair {
        Some(next) => next.0 * r.n_items() + next.1
        None => -1
      }
    }
    None => -1
  }
}

///|
/// Set the uncertainty prior used in pair selection.
pub fn set_uncertainty_prior(prior : Double) -> Bool {
  match ranker.val {
    Some(r) => {
      r.set_uncertainty_prior(prior)
      true
    }
    None => false
  }
}

///|
/// Set the pair selection policy (0=A-optimal, 1=Thompson top, 2=Thompson neighbor).
pub fn set_pair_policy(policy : Int) -> Bool {
  match ranker.val {
    Some(r) => {
      r.set_pair_policy(policy)
      true
    }
    None => false
  }
}

///|
/// Set sampling seed for uncertainty computations.
pub fn set_sampling_seed(seed : Int) -> Bool {
  match ranker.val {
    Some(r) => {
      r.set_sampling_seed(seed)
      true
    }
    None => false
  }
}

///|
/// Run uncertainty estimation via bootstrap.
pub fn compute_uncertainty(samples : Int, max_iter : Int, top_k : Int) -> Bool {
  match ranker.val {
    Some(r) => r.compute_uncertainty(samples, max_iter, top_k)
    None => false
  }
}

///|
pub fn get_uncertainty_ready() -> Bool {
  match ranker.val {
    Some(r) => r.get_uncertainty_ready()
    None => false
  }
}

///|
pub fn get_uncertainty_samples() -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_samples()
    None => 0
  }
}

///|
pub fn get_uncertainty_top_k() -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_top_k()
    None => 0
  }
}

///|
pub fn get_uncertainty_width_for(index : Int) -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_width_for(index)
    None => -1
  }
}

///|
pub fn get_uncertainty_median_width() -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_median_width()
    None => -1
  }
}

///|
pub fn get_uncertainty_p90_width() -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_p90_width()
    None => -1
  }
}

///|
pub fn get_uncertainty_width_target() -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_width_target()
    None => -1
  }
}

///|
pub fn get_uncertainty_order_index(position : Int) -> Int {
  match ranker.val {
    Some(r) => r.get_uncertainty_order_index(position)
    None => -1
  }
}

///|
pub fn get_topk_stable_count(threshold : Double) -> Int {
  match ranker.val {
    Some(r) => r.get_topk_stable_count(threshold)
    None => 0
  }
}

///|
pub fn get_rank_ci_low(index : Int) -> Int {
  match ranker.val {
    Some(r) => r.get_rank_ci_low(index)
    None => -1
  }
}

///|
pub fn get_rank_ci_high(index : Int) -> Int {
  match ranker.val {
    Some(r) => r.get_rank_ci_high(index)
    None => -1
  }
}

///|
pub fn get_rank_mean(index : Int) -> Double {
  match ranker.val {
    Some(r) => r.get_rank_mean(index)
    None => -1.0
  }
}

///|
pub fn get_topk_confidence(index : Int) -> Double {
  match ranker.val {
    Some(r) => r.get_topk_confidence(index)
    None => -1.0
  }
}

///|
/// Get completed comparisons.
pub fn get_progress_completed() -> Int {
  match ranker.val {
    Some(r) => r.total_comparisons()
    None => 0
  }
}

///|
/// Get estimated total comparisons.
pub fn get_progress_estimated() -> Int {
  match ranker.val {
    Some(r) => r.get_progress().1
    None => 0
  }
}

///|
/// Get rank for a given index. Returns -1 if invalid.
pub fn get_rank_for(index : Int) -> Int {
  match ranker.val {
    Some(r) =>
      match r.get_rank_for(index) {
        Some(rank) => rank
        None => -1
      }
    None => -1
  }
}

///|
let current_tiers : Ref[Array[Int]] = { val: [] }

///|
/// Compute tier assignments for all items. Returns number of items.
pub fn compute_tiers(k : Int) -> Int {
  match ranker.val {
    Some(r) => {
      current_tiers.val = r.get_tiers(k)
      current_tiers.val.length()
    }
    None => {
      current_tiers.val = []
      0
    }
  }
}

///|
/// Get the tier index for a specific item (after compute_tiers).
pub fn get_tier_for(index : Int) -> Int {
  if index >= 0 && index < current_tiers.val.length() {
    current_tiers.val[index]
  } else {
    -1
  }
}

///|
/// Undo last comparison. Returns true if successful.
pub fn undo_last() -> Bool {
  match ranker.val {
    Some(r) => r.undo_last()
    None => false
  }
}

///|
fn main {
  // Entry point required but not used for library
}
