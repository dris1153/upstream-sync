# Upstream Sync Workflow

Step-by-step process for syncing forked repos with upstream changes by evaluating diffs and editing files directly.

## Core Principle

**Do NOT use git merge, rebase, or cherry-pick.** Instead, extract upstream diffs and apply changes by editing files directly. This gives full control over what gets applied, preserves clean commit history, and lets you adapt upstream changes to fit local customizations.

## Prerequisites

- Git repo with local customizations
- Upstream remote configured (`git remote add upstream <url>`) or `UPSTREAM_URL` in `.env`
- All local changes committed

## Phase 1: Status Check

1. Run `upstream-status.js` to fetch and list new commits
2. If no new commits → already up to date, stop here
3. Note the number of new commits and which files are affected

## Phase 2: Extract Diffs

1. Run `upstream-diff.js --files-only` to get the list of changed files
2. Categorize files:
   - **New files** (added upstream) → will need to be created locally
   - **Modified files** → need evaluation against local version
   - **Deleted files** → evaluate if still needed locally
   - **Renamed files** → check if local version uses old or new path
3. For files that need detailed review, run `upstream-diff.js --file <path> --format json` to get the full diff

## Phase 3: Evaluate Each Change

For each upstream-changed file, follow the [review guide](review-guide.md):

1. **Read the upstream diff** — understand what changed and why
2. **Read the local file** — understand current state and local customizations
3. **Decide action**:
   - **Apply as-is**: Upstream change doesn't conflict with local customizations
   - **Adapt**: Upstream change is useful but needs modification to fit local code
   - **Skip**: Change is irrelevant or conflicts with intentional local divergence
   - **Partial apply**: Only some parts of the upstream change are useful

## Phase 4: Apply Changes

For each file where changes should be applied:

### New files (added upstream)
- Get the upstream content from `upstream-diff.js --file <path> --format json` (the `upstreamContent` field)
- Create the file locally using Write tool
- Adapt content if needed for local project

### Modified files
- Read the current local file
- Use Edit tool to apply the specific changes from the upstream diff
- Preserve local customizations while incorporating upstream improvements
- For large changes, compare upstream version vs local version and rewrite as needed

### Deleted files
- If the file is no longer needed locally → delete it
- If local customizations depend on it → keep it

### Renamed files
- If the rename makes sense locally → rename and apply any content changes
- If local code references the old path → update references too

## Phase 5: Save Sync State

After applying all changes, save the current upstream HEAD as the sync point:

```bash
node sync-state.js save
```

This records which upstream commit was last synced, so the **next sync only shows new changes** from this point forward. Without this step, the next sync would re-show all upstream changes from the original fork point.

**Important**: Only save state after you've finished applying changes and verified they work. If the sync is aborted, don't save — you'll want to see the same changes next time.

To check current state: `node sync-state.js show`
To reset (redo from beginning): `node sync-state.js reset`

The state is stored in `.upstream-sync.json` at the project root. **This file should be committed to git** so the sync state persists across machines and clones.

## Phase 6: Verification

1. Run `git diff` to review all applied changes
2. Run existing test suite
3. Build the project to verify no compile errors
4. Commit with a descriptive message summarizing what was synced

## Phase 7: Report to User

**ALWAYS** present a sync report after applying changes. The user must know:

1. **What was updated** — list each file with a brief description of the change
2. **What was added** — new files created from upstream
3. **What was skipped** — upstream changes intentionally not applied, with reasons
4. **What was deleted** — files removed, with reasons
5. **Important notes** — breaking changes, API changes, follow-up actions needed

### Report Format

```
## Upstream Sync Report

**Source**: upstream/main (commits <first>...<last>)
**Date range**: <oldest-date> → <newest-date>
**Upstream commits reviewed**: <n>

### Applied Changes
- **<path>**: <what changed and why>

### New Files Added
- **<path>**: <purpose of the file>

### Skipped Changes
- **<path>**: <reason for skipping>

### Deleted Files
- **<path>**: <reason>

### Notes
- <breaking changes, deprecations, follow-up actions>
```

### Why This Matters
- User needs to know what features/fixes are now available
- User can decide what to test more carefully
- Skipped changes are documented for future reference
- Creates accountability — every upstream change is either applied or consciously skipped

## Tips

- **Process files in dependency order**: shared utilities first, then features that depend on them
- **Sync frequently**: smaller, more frequent syncs = fewer changes to evaluate
- **Use `--commit <hash>`**: to inspect individual upstream commits when the aggregated diff is too large
- **Use overlap detection**: run `conflict-preview.js` to identify files modified on both sides — these need the most careful evaluation
