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
