///|
fn main {
  // Create ranker with sample items
  let items = ["Apple", "Banana", "Cherry", "Date"]
  let ranker = @ranker.PlackettLuceRanker::new(items)
  println("Plackett-Luce Ranking Demo")
  println("==========================")
  println("")

  // Simulate some rankings
  println("Making rankings...")
  // A > B
  ranker.update_single_query("Apple", "Banana", @ranker.AWins)
  println("  Apple > Banana")

  // A > C > B (A 3-way ranking!)
  ignore(ranker.add_ranking(["Apple", "Cherry", "Banana"]))
  println("  Apple > Cherry > Banana")

  // C > D
  ranker.update_single_query("Cherry", "Date", @ranker.AWins)
  println("  Cherry > Date")
  println("")
  println("Total ranking events: " + ranker.total_comparisons().to_string())
  println("")

  // Display ordinal rankings
  println("Ordinal Rankings:")
  let ordinal = ranker.compute_ordinal_rankings()
  for item in items {
    let rank = ordinal.get(item).unwrap()
    println("  #" + rank.to_string() + " " + item)
  }
  println("")

  // Display probabilities
  println("Normalized Scores (sum to 1.0):")
  let ranks = ranker.compute_ranks()
  for item in items {
    let score = ranks.get(item).unwrap()
    // Format to 3 decimal places manually
    let pct = (score * 1000.0).floor() / 10.0
    println("  " + item + ": " + pct.to_string() + "%")
  }
  println("")

  // Test serialization
  let json = ranker.to_json_string()
  println("State serialized to JSON (" + json.length().to_string() + " chars)")

  // Test undo
  println("")
  println("Undoing last event...")
  let _ = ranker.undo_last()
  println("Events after undo: " + ranker.total_comparisons().to_string())
}
