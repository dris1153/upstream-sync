# Release Notes

## v2.0.0 — Evaluate & Edit Approach

**Date**: 2026-03-29

### Breaking Changes

- Removed merge/rebase/cherry-pick workflow. Claude now applies upstream changes by editing files directly.
- `upstream-diff.js` and `upstream-status.js` output field `mergeBase` renamed to `baseCommit`.
- `.upstream-sync.json` is now committed to git (previously gitignored).

### New Features

- **Direct file editing workflow** — Instead of merging upstream commits, Claude extracts diffs, evaluates each change against local code, and applies them via Edit/Write tools. Full control over what gets applied and how.
- **`upstream-diff.js`** — New script that extracts per-file diffs from upstream since last sync. Supports `--file`, `--commit`, `--files-only`, `--context` filters. Outputs diff content, upstream file content, and local file content for evaluation.
- **`sync-state.js`** — New script for managing sync state tracking (`show`, `save`, `reset`). Tracks which upstream commit was last synced so subsequent syncs only show new changes.
- **Sync state tracking** — `.upstream-sync.json` stores the last synced upstream commit hash. Committed to git so sync state persists across machines and clones.
- **Incremental syncs** — First sync uses `git merge-base` as starting point. After saving state, subsequent syncs only show changes since the last sync point.
- **Sync report** — Claude now presents a structured report after every sync: applied changes, new files, skipped changes, deleted files, and notes.

### Improvements

- **`upstream-status.js`** — Now uses sync state as baseline instead of `HEAD..remote/branch`, enabling accurate incremental commit listing.
- **`git-utils.js`** — Added `loadSyncState()`, `saveSyncState()`, `getBaseCommit()` functions with remote/branch validation to prevent cross-remote state mismatch.
- **Reference docs rewritten** — `sync-workflow.md` (7 phases), `review-guide.md` (evaluation methodology), `conflict-resolution.md` (manual application guide) all updated for the new approach.
- **README rewritten** — Practical usage guide with Claude Code, real-world scenarios, comparison table vs `git merge`.

### Bug Fixes

- Fixed `getBaseCommit` not validating remote/branch match — multi-remote users would silently get wrong diffs.
- Fixed `saveSyncState` unreachable dead code in fallback branch.
- Fixed `sync-state.js` hardcoding filename instead of using `SYNC_STATE_FILE` constant.

### Tests

- 52 tests total (was 26), all passing.
- New: 16 tests for `upstream-diff.js`, 6 tests for `sync-state.js`, 4 tests for sync state in `git-utils.js`.

### Files Changed

**New files (4):**
- `scripts/upstream-diff.js` — Per-file diff extraction
- `scripts/sync-state.js` — Sync state management
- `scripts/__tests__/upstream-diff.test.js` — Tests for upstream-diff
- `scripts/__tests__/sync-state.test.js` — Tests for sync-state
- `release-note.md` — This file

**Modified files (10):**
- `SKILL.md` — New 6-step workflow with sync state and report
- `README.md` — Complete rewrite
- `references/sync-workflow.md` — 7-phase evaluate & edit workflow
- `references/review-guide.md` — Evaluation methodology for direct editing
- `references/conflict-resolution.md` — Manual change application guide
- `scripts/git-utils.js` — Sync state functions, getBaseCommit
- `scripts/upstream-status.js` — Uses sync state baseline
- `scripts/__tests__/git-utils.test.js` — Sync state tests
- `scripts/package.json` — New test files added
- `.gitignore` — Removed `.upstream-sync.json` from ignore
