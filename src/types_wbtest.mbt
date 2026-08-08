///|
test "bradley_terry_prob returns 0.5 for equal strengths" {
  let p = bradley_terry_prob(0.0, 0.0)
  inspect(p, content="0.5")
}

///|
test "pl_fit converges on simple pairwise case" {
  // A beats B always, B beats C always
  let item_to_idx = { "A": 0, "B": 1, "C": 2 }
  let events : Array[RankingEvent] = [
    RankingEvent::{ items: ["A", "B"] },
    RankingEvent::{ items: ["B", "C"] },
  ]
  let strengths = [0.0, 0.0, 0.0]
  let fitted = pl_fit(3, events, strengths, item_to_idx)

  // A should have highest strength, C lowest
  inspect(fitted[0] > fitted[1], content="true")
  inspect(fitted[1] > fitted[2], content="true")
}

///|
test "pl_fit converges on multi-item ranking" {
  let item_to_idx = { "A": 0, "B": 1, "C": 2 }
  let events : Array[RankingEvent] = [RankingEvent::{ items: ["A", "B", "C"] }]
  let strengths = [0.0, 0.0, 0.0]
  let fitted = pl_fit(3, events, strengths, item_to_idx)
  inspect(fitted[0] > fitted[1], content="true")
  inspect(fitted[1] > fitted[2], content="true")
}

///|
test "PlackettLuceRanker basic flow" {
  let items = ["A", "B", "C"]
  let ranker = PlackettLuceRanker::new(items)
  inspect(ranker.total_comparisons(), content="0")

  // A > B > C
  ignore(ranker.add_ranking(["A", "B", "C"]))
  inspect(ranker.total_comparisons(), content="1")
  let ranks = ranker.compute_ordinal_rankings()
  inspect(ranks.get("A").unwrap(), content="1")
  inspect(ranks.get("B").unwrap(), content="2")
  inspect(ranks.get("C").unwrap(), content="3")
}

///|
test "PlackettLuceRanker undo works" {
  let items = ["X", "Y"]
  let ranker = PlackettLuceRanker::new(items)
  ignore(ranker.add_ranking(["X", "Y"]))
  inspect(ranker.total_comparisons(), content="1")
  let success = ranker.undo_last()
  inspect(success, content="true")
  inspect(ranker.total_comparisons(), content="0")
}

///|
test "PlackettLuceRanker tie is one comparison and one undo" {
  let ranker = PlackettLuceRanker::new(["X", "Y"])
  ranker.update_single_query("X", "Y", Tie)
  inspect(ranker.total_comparisons(), content="1")
  inspect(ranker.undo_last(), content="true")
  inspect(ranker.total_comparisons(), content="0")
}

///|
test "PlackettLuceRanker ignores an unknown or self comparison" {
  let ranker = PlackettLuceRanker::new(["X", "Y"])
  ranker.update_single_query("X", "X", AWins)
  ranker.update_single_query("X", "Z", AWins)
  inspect(ranker.total_comparisons(), content="0")
}

///|
test "indexed ranker basic flow" {
  let ranker = IndexedRanker::new(3)
  let ok = ranker.add_ranking([0, 1, 2])
  inspect(ok, content="true")
  let rank0 = ranker.get_rank_for(0).unwrap()
  let rank1 = ranker.get_rank_for(1).unwrap()
  let rank2 = ranker.get_rank_for(2).unwrap()
  inspect(rank0, content="1")
  inspect(rank1, content="2")
  inspect(rank2, content="3")
}

///|
test "indexed ranker uncertainty computation" {
  let ranker = IndexedRanker::new(3)
  ignore(ranker.add_ranking([0, 1, 2]))
  let ok = ranker.compute_uncertainty(10, 5, 2)
  inspect(ok, content="true")
  inspect(ranker.get_uncertainty_ready(), content="true")
}

///|
test "indexed ranker pair policies return valid pair" {
  let ranker = IndexedRanker::new(2)
  ranker.set_pair_policy(0)
  let pair0 = ranker.get_next_pair(0.0, 0.9).unwrap()
  inspect(pair0.0 != pair0.1, content="true")
  ranker.set_pair_policy(1)
  let pair1 = ranker.get_next_pair(0.0, 0.9).unwrap()
  inspect(pair1.0 != pair1.1, content="true")
  ranker.set_pair_policy(2)
  let pair2 = ranker.get_next_pair(0.0, 0.9).unwrap()
  inspect(pair2.0 != pair2.1, content="true")
}

///|
test "tie is one comparison and one undo step" {
  let ranker = IndexedRanker::new(3)
  inspect(ranker.update_single_query(0, 1, Tie), content="true")
  inspect(ranker.total_comparisons(), content="1")
  // A tie feeds both orderings to the model but must undo in a single step,
  // otherwise one undo silently turns the tie into "A wins".
  inspect(ranker.undo_last(), content="true")
  inspect(ranker.total_comparisons(), content="0")
  inspect(ranker.undo_last(), content="false")
}

///|
test "tie leaves the two items level" {
  let ranker = IndexedRanker::new(2)
  ignore(ranker.update_single_query(0, 1, Tie))
  inspect(ranker.get_rank_for(0).unwrap(), content="1")
  inspect(ranker.get_rank_for(1).unwrap(), content="2")
}

///|
test "add_ranking copies its argument" {
  let ranker = IndexedRanker::new(4)
  let buffer = [0, 1, 2, 3]
  ignore(ranker.add_ranking(buffer))
  // The web glue reuses one pending buffer across submissions; if the ranker
  // aliased it, clearing the buffer would erase the recorded event and the
  // bootstrap would report zero-width intervals.
  buffer.clear()
  inspect(ranker.compute_uncertainty(50, 20, 2), content="true")
  let width = ranker.get_uncertainty_width_for(0) +
    ranker.get_uncertainty_width_for(1) +
    ranker.get_uncertainty_width_for(2) +
    ranker.get_uncertainty_width_for(3)
  inspect(width > 0, content="true")
}

///|
test "add_ranking rejects degenerate input" {
  let ranker = IndexedRanker::new(3)
  inspect(ranker.add_ranking([]), content="false")
  inspect(ranker.add_ranking([1]), content="false")
  inspect(ranker.add_ranking([0, 0]), content="false")
  inspect(ranker.add_ranking([0, 3]), content="false")
  inspect(ranker.total_comparisons(), content="0")
}

///|
test "priors inform the fit without counting as progress" {
  let ranker = IndexedRanker::new(4)
  inspect(ranker.add_prior_ranking([0, 1, 2, 3]), content="true")
  inspect(ranker.add_prior_ranking([0, 1]), content="true")
  // The progress strip reports questions the user answered. Seeding from
  // existing scores answers none, and counting it opened a fresh session
  // partway along the bar.
  inspect(ranker.total_comparisons(), content="0")
  // The ordering must still reach the model, or the priors do nothing at all.
  inspect(ranker.get_rank_for(0).unwrap(), content="1")
  inspect(ranker.get_rank_for(3).unwrap(), content="4")
  // Nothing to undo back to: a prior is not a decision.
  inspect(ranker.undo_last(), content="false")
  ignore(ranker.update_single_query(3, 0, AWins))
  inspect(ranker.total_comparisons(), content="1")
  // Undoing the one real answer must not unwind the seeded orderings.
  inspect(ranker.undo_last(), content="true")
  inspect(ranker.total_comparisons(), content="0")
  inspect(ranker.get_rank_for(0).unwrap(), content="1")
}

///|
test "add_prior_ranking rejects degenerate input" {
  let ranker = IndexedRanker::new(3)
  inspect(ranker.add_prior_ranking([]), content="false")
  inspect(ranker.add_prior_ranking([1]), content="false")
  inspect(ranker.add_prior_ranking([0, 0]), content="false")
  inspect(ranker.add_prior_ranking([0, 3]), content="false")
}

///|
test "equal strengths rank by item index" {
  let ranker = IndexedRanker::new(4)
  // 0 beats 1 and 2 once each: 1 and 2 hold identical evidence, so they must
  // keep a stable index order rather than an arbitrary sort order.
  ignore(ranker.update_single_query(0, 1, AWins))
  ignore(ranker.update_single_query(0, 2, AWins))
  inspect(
    ranker.get_rank_for(1).unwrap() < ranker.get_rank_for(2).unwrap(),
    content="true",
  )
}

///|
test "compute_uncertainty refuses an empty event log" {
  let ranker = IndexedRanker::new(4)
  inspect(ranker.compute_uncertainty(50, 20, 2), content="false")
  inspect(ranker.get_uncertainty_ready(), content="false")
}

///|
test "displayed rank stays inside its own confidence interval" {
  let ranker = IndexedRanker::new(5)
  ignore(ranker.add_ranking([0, 1, 2, 3, 4]))
  ignore(ranker.update_single_query(2, 1, AWins))
  ignore(ranker.update_single_query(4, 3, AWins))
  ignore(ranker.compute_uncertainty(200, 50, 3))
  let mut inside = true
  for i = 0; i < 5; i = i + 1 {
    let rank = ranker.get_rank_for(i).unwrap()
    if rank < ranker.get_rank_ci_low(i) || rank > ranker.get_rank_ci_high(i) {
      inside = false
    }
  }
  inspect(inside, content="true")
}

///|
test "pl_fit_indexed matches the string-keyed wrapper" {
  let item_to_idx = { "0": 0, "1": 1, "2": 2 }
  let events : Array[RankingEvent] = [
    RankingEvent::{ items: ["0", "1", "2"] },
    RankingEvent::{ items: ["1", "0"] },
  ]
  let via_strings = pl_fit(3, events, [0.0, 0.0, 0.0], item_to_idx)
  let via_indices = pl_fit_indexed(3, [[0, 1, 2], [1, 0]], [0.0, 0.0, 0.0])
  let mut same = via_strings.length() == via_indices.length()
  for i = 0; i < via_indices.length(); i = i + 1 {
    if via_strings[i] != via_indices[i] {
      same = false
    }
  }
  inspect(same, content="true")
}
