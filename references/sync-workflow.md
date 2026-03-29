# Upstream Sync Workflow

Step-by-step process for syncing forked repos with upstream changes.

## Prerequisites

- Git repo with local customizations
- Upstream remote configured (`git remote add upstream <url>`)
- All local changes committed or stashed

## Phase 1: Setup & Status Check

1. Verify upstream remote exists: `git remote -v`
2. If missing, add it: `git remote add upstream <original-repo-url>`
3. Run `upstream-status.js` to fetch and list new commits
4. If no new commits, stop here - already up to date

## Phase 2: Review Upstream Changes

Follow [review-guide.md](review-guide.md) to analyze upstream commits.

Key decisions:
- **Accept all**: Proceed to Phase 3 with merge/rebase
- **Accept some**: Use cherry-pick strategy
- **Defer**: Document which commits to revisit later

## Phase 3: Conflict Analysis

1. Run `conflict-preview.js` to detect potential conflicts
2. Based on recommendation:
   - `SAFE_TO_MERGE` - proceed directly
   - `MERGE_WITH_MANUAL_RESOLUTION` - prepare for manual fixes
   - `CONSIDER_CHERRY_PICK` - too many conflicts, pick specific commits

## Phase 4: Integration

### Option A: Merge (recommended for complex forks)
```bash
git checkout <your-branch>
git merge upstream/<branch>
# Resolve conflicts if any
git add .
git commit
```

### Option B: Rebase (recommended for few local changes)
```bash
git checkout <your-branch>
git rebase upstream/<branch>
# Resolve conflicts per-commit if any
git rebase --continue  # after each resolution
```

### Option C: Cherry-pick (selective integration)
```bash
git cherry-pick <commit-hash>
# Repeat for each desired commit
```

## Phase 5: Verification

1. Run existing test suite
2. Build project to verify no compile errors
3. Manually test affected features
4. Review git log to confirm clean history

## Troubleshooting

See [conflict-resolution.md](conflict-resolution.md) for conflict resolution strategies.

### Common Issues
- **Diverged histories**: Use `--allow-unrelated-histories` only if repos share origin
- **Binary file conflicts**: Always choose one version, don't attempt merge
- **Submodule conflicts**: Update submodule refs separately after merge
