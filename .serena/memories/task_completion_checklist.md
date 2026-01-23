# Task Completion Checklist

When completing any code task, follow this workflow:

## 1. Make Code Changes
Edit the necessary files using appropriate tools.

## 2. Generate Interface Files & Format
```bash
moon info && moon fmt
```

**Why**: 
- `moon info` updates `.mbti` interface files
- Review `.mbti` diffs to ensure API changes are intentional
- `moon fmt` ensures consistent formatting

## 3. Run Type Check
```bash
moon check
```

**Why**: Catch type errors and linting issues before building.

## 4. Build (if needed)
```bash
moon build
```

**Why**: Verify the project compiles successfully.

## 5. Run Tests
```bash
moon test
```

If behavior intentionally changed:
```bash
moon test --update
```

**Why**: Ensure no regressions. Update snapshots when expected output changes.

## 6. Review Changes
- Check `git diff` to review all changes
- Verify `.mbti` changes match intended API modifications
- Ensure test snapshots reflect expected behavior

## 7. Commit
```bash
git add .
git commit -m "descriptive message"
```

## Common Gotchas
- **Always run `moon info`** before committing - missing `.mbti` updates can break downstream builds
- **Check test snapshots** - failing tests after `--update` may indicate logic errors
- **Block separators** - ensure `///|` separators are preserved in block-style code