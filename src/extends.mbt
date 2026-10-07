///|
/// Explicit dot-syntax attachment for the derived JSON impls. Implicit
/// promotion of trait methods is deprecated (`implicit_impl_as_method`), and
/// `moon check --deny-warn` in CI rejects it for every public type.
pub extend RankingEvent with ToJson::{to_json}

///|
pub extend RankingEvent with @json.FromJson::{from_json}

///|
pub extend RankerState with ToJson::{to_json}

///|
pub extend RankerState with @json.FromJson::{from_json}

///|
pub extend HistoryEntry with ToJson::{to_json}

///|
pub extend HistoryEntry with @json.FromJson::{from_json}

///|
pub extend SaveState with ToJson::{to_json}

///|
pub extend SaveState with @json.FromJson::{from_json}

///|
pub extend PlackettLuceState with ToJson::{to_json}

///|
pub extend PlackettLuceState with @json.FromJson::{from_json}
