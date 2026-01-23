///|
/// Simple 1D K-Means clustering for grouping scores into tiers.
/// Returns an array where each index corresponds to the cluster ID (0 to k-1).
/// Cluster 0 is the highest (S tier), Cluster k-1 is the lowest.
pub fn kmeans_1d(data : Array[Double], k : Int) -> Array[Int] {
  let n = data.length()
  if n == 0 {
    return []
  }
  if k <= 1 {
    return Array::make(n, 0)
  }

  // Initialize centroids using quantiles (roughly spread out)
  let sorted_data = data.copy()
  sorted_data.sort()
  let centroids = Array::make(k, 0.0)
  for i = 0; i < k; i = i + 1 {
    let idx = i * n / k
    centroids[i] = sorted_data[idx]
  }
  let assignments = Array::make(n, 0)
  let mut changed = true
  let mut iter = 0
  let max_iter = 20
  while changed && iter < max_iter {
    changed = false
    iter = iter + 1

    // Assignment step
    for i = 0; i < n; i = i + 1 {
      let val = data[i]
      let mut min_dist = (val - centroids[0]).abs()
      let mut best_k = 0
      for j = 1; j < k; j = j + 1 {
        let dist = (val - centroids[j]).abs()
        if dist < min_dist {
          min_dist = dist
          best_k = j
        }
      }
      if assignments[i] != best_k {
        assignments[i] = best_k
        changed = true
      }
    }

    // Update step
    let counts = Array::make(k, 0)
    let sums = Array::make(k, 0.0)
    for i = 0; i < n; i = i + 1 {
      let c = assignments[i]
      counts[c] = counts[c] + 1
      sums[c] = sums[c] + data[i]
    }
    for j = 0; j < k; j = j + 1 {
      if counts[j] > 0 {
        centroids[j] = sums[j] / counts[j].to_double()
      }
    }
  }

  // Final pass: map clusters to 0..k-1 based on centroid value descending.
  // Cluster 0 should be the highest scores (S tier).
  let indexed_centroids = Array::make(k, (0.0, 0))
  for i = 0; i < k; i = i + 1 {
    indexed_centroids[i] = (centroids[i], i)
  }
  // Sort indices by centroid value descending
  let sorted_centroid_indices = Array::make(k, 0)
  for i = 0; i < k; i = i + 1 {
    sorted_centroid_indices[i] = i
  }
  sorted_centroid_indices.sort_by(fn(a, b) {
    let diff = centroids[b] - centroids[a]
    if diff > 0.0 {
      1
    } else if diff < 0.0 {
      -1
    } else {
      0
    }
  })
  let rank_map = Array::make(k, 0)
  for i = 0; i < k; i = i + 1 {
    rank_map[sorted_centroid_indices[i]] = i
  }
  let final_assignments = Array::make(n, 0)
  for i = 0; i < n; i = i + 1 {
    final_assignments[i] = rank_map[assignments[i]]
  }
  final_assignments
}
