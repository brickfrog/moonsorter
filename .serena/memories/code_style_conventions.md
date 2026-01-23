# Code Style & Conventions

## Block Organization
- Code is organized in block style, each block separated by `///|`
- Block order within a file is **irrelevant** - can be rearranged freely
- Process blocks independently during refactoring

## File Naming Conventions
- `*_test.mbt` - blackbox tests (most common)
- `*_wbtest.mbt` - whitebox tests (access to internal symbols)
- `deprecated.mbt` - keep deprecated blocks here per directory

## Testing Philosophy
- **Prefer** `inspect` with snapshot testing over `assert_eq`
- Use `assert_eq` **only** in loops where snapshots would vary
- Run `moon test --update` to update snapshots after intentional behavior changes

## Example Test Pattern
```moonbit
///|
test "bradley_terry_prob returns 0.5 for equal strengths" {
  let p = bradley_terry_prob(0.0, 0.0)
  inspect(p, content="0.5")
}
```

## Type Annotations
- MoonBit has strong type inference
- Explicit annotations used for clarity at function boundaries
- Internal lets often omit types

## Naming
- snake_case for functions and variables
- PascalCase for types (e.g., `PlackettLuceRanker`, `IndexedRanker`)
- Enum variants: PascalCase (e.g., `RankingEvent`)