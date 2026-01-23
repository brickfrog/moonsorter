# Suggested Commands

## Development Workflow

### After Every Code Change
```bash
moon info && moon fmt
```
- `moon info` generates `.mbti` interface files
- Check `.mbti` diffs to verify API changes are intentional
- `moon fmt` formats code automatically

## Core Commands

### Check & Build
```bash
moon check      # Lint/typecheck without building (fast)
moon build      # Build the project
```

### Testing
```bash
moon test                # Run all tests
moon test --update       # Update test snapshots after behavior changes
```

### Code Quality
```bash
moon fmt                 # Format code
moon coverage analyze > uncovered.log   # Generate coverage report
```

### Running
```bash
moon run                 # Run main package
```

## Git Commands
Standard git workflow applies:
```bash
git status
git add .
git commit -m "message"
git push
```

## Filesystem Commands (Linux)
- `ls` - list files
- `cd` - change directory
- `grep` - search in files
- `find` - find files
- `cat` - view file contents