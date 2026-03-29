# Upstream Sync

A Claude Code skill that syncs your fork/clone with the original open source repository. Instead of merging commits directly, Claude **reads upstream diffs, evaluates each change, and edits your files directly** — giving you full control over what gets applied and how.

## Problem

When you fork/clone an open source project and build custom features on top, the original repo keeps receiving new commits. Syncing those changes is typically:

- **Risky** — `git merge` can break your customized features
- **Noisy** — merge commits pollute your history
- **All-or-nothing** — hard to selectively apply only the changes you want
- **Context-lost** — merge conflicts don't explain *why* code diverged

## How This Skill Works

Instead of running `git merge`/`rebase`/`cherry-pick`, this skill takes a different approach:

1. **Extract** — fetch upstream and extract per-file diffs since last sync
2. **Evaluate** — Claude reads each diff, compares with your local code, and decides: apply as-is, adapt, partial apply, or skip
3. **Edit** — Claude applies changes by directly editing your files (Edit/Write tools), preserving your customizations
4. **Track** — saves the last synced commit so the next sync only shows new changes
5. **Report** — presents a clear summary of what was updated, added, skipped, and why

## Installation

### Option 1: Copy into project

```bash
cp -r upstream-sync/ /path/to/your-project/.claude/skills/upstream-sync/
```

### Option 2: Symlink (recommended for multi-project use)

```bash
# Linux/macOS
ln -s /path/to/upstream-sync /path/to/your-project/.claude/skills/upstream-sync

# Windows (PowerShell, run as admin)
New-Item -ItemType Junction -Path "C:\path\to\your-project\.claude\skills\upstream-sync" -Target "C:\path\to\upstream-sync"
```

## Setup

### Configure upstream URL

**Option A: Via `.env` (recommended)** — the skill auto-creates the remote:

```env
# Create in scripts/.env or project root .env
UPSTREAM_URL=https://github.com/original-author/original-repo.git
```

**Option B: Manual** — add the remote yourself:

```bash
git remote add upstream https://github.com/original-author/original-repo.git
```

### Optional `.env` settings

```env
UPSTREAM_REMOTE=upstream   # Remote name (default: upstream)
UPSTREAM_BRANCH=main       # Branch to sync from (default: main)
```

## Usage with Claude Code

### Trigger phrases

```
"Sync upstream changes"
"Check what's new in the original repo"
"Review new commits from upstream"
"Integrate upstream into my project"
```

### What Claude does

```
You: "Sync upstream changes"

Claude:
1. Runs upstream-status.js → "12 new upstream commits, 6 files changed"
2. Runs upstream-diff.js  → extracts per-file diffs
3. For each changed file:
   - Reads the upstream diff to understand intent
   - Reads your local version
   - Decides: apply / adapt / skip
   - Edits the file directly if applying
4. Runs sync-state.js save → marks this sync point
5. Runs tests/build to verify
6. Presents a sync report:

   ## Upstream Sync Report
   **Source**: upstream/main (commits a1b2c3d...f4e5d6c)
   **Upstream commits reviewed**: 12

   ### Applied Changes
   - **src/parser.js**: Applied upstream bug fix for memory leak
   - **src/utils.js**: Updated helper to support new API format

   ### New Files Added
   - **src/dark-mode.js**: New dark mode feature from upstream

   ### Skipped Changes
   - **src/config.js**: Conflicts with our custom config — kept local version

   ### Notes
   - New dependency `@lib/theme` added in upstream — run `npm install`
```

### Real-world scenarios

**Scenario: Only want bug fixes**

```
You: "Only sync bug fixes from upstream, skip new features"

Claude:
1. Lists upstream commits, filters by type (fix, bug, patch)
2. Extracts diffs only for bug fix commits using --commit <hash>
3. Applies each fix by editing the relevant files
4. Skips all feature commits with reasons in the report
```

**Scenario: Large upstream update (50+ commits)**

```
You: "Sync upstream changes"

Claude:
1. Runs --files-only first to get overview
2. Uses conflict-preview.js to identify risky overlaps
3. Processes files in dependency order (utils → features)
4. For heavily customized files: reads both versions carefully,
   combines upstream improvements with local changes
5. For new upstream files: creates them locally, adapts imports
```

**Scenario: Second sync (incremental)**

```
You: "Sync upstream again"

Claude:
1. Reads .upstream-sync.json → last synced at commit abc123
2. Only shows changes AFTER abc123 (not everything since fork)
3. "5 new commits since last sync, 3 files changed"
4. Applies changes, saves new sync point
```

## Sync State Tracking

The skill tracks which upstream commit was last synced in `.upstream-sync.json`:

```json
{
  "lastSyncedCommit": "a1b2c3d4e5f6...",
  "lastSyncDate": "2026-03-29T10:30:00.000Z",
  "remote": "upstream",
  "branch": "main"
}
```

**This file is committed to git**, so the sync state persists across machines and clones. If you clone the project on a new machine, the next sync continues from the correct point.

- **First sync**: uses `git merge-base` as starting point (all changes since fork)
- **Subsequent syncs**: uses saved state (only new changes since last sync)
- **Reset**: run `sync-state.js reset` to start over from merge-base

## Scripts Reference

### upstream-status.js — List new upstream commits

```bash
node scripts/upstream-status.js                          # Text output
node scripts/upstream-status.js --format json            # JSON output
node scripts/upstream-status.js --since 2024-06-01       # Filter by date
node scripts/upstream-status.js --limit 20               # Limit commits
node scripts/upstream-status.js --remote origin --branch develop
```

### upstream-diff.js — Extract per-file diffs

```bash
node scripts/upstream-diff.js                            # All diffs since last sync
node scripts/upstream-diff.js --files-only               # Just file list, no diffs
node scripts/upstream-diff.js --file src/parser.js       # Specific file only
node scripts/upstream-diff.js --commit abc123            # Specific commit only
node scripts/upstream-diff.js --context 10 --format json # More context lines
```

### conflict-preview.js — Detect overlapping changes

```bash
node scripts/conflict-preview.js                         # Preview overlaps
node scripts/conflict-preview.js --format json           # JSON output
```

### sync-state.js — Manage sync tracking

```bash
node scripts/sync-state.js show                          # View current state
node scripts/sync-state.js save                          # Save current upstream HEAD
node scripts/sync-state.js save --commit abc123          # Save specific commit
node scripts/sync-state.js reset                         # Reset (next sync from merge-base)
```

All scripts support `--remote <name>` and `--branch <branch>` overrides.

## Project Structure

```
upstream-sync/
├── SKILL.md                       # Skill metadata + workflow for Claude Code
├── README.md
├── .upstream-sync.json            # Sync state tracking (committed to git)
├── scripts/
│   ├── git-utils.js               # Shared git utilities + sync state functions
│   ├── upstream-status.js         # Check upstream, list new commits
│   ├── upstream-diff.js           # Extract per-file diffs for review
│   ├── conflict-preview.js        # Detect overlapping changes
│   ├── sync-state.js              # Manage sync state (show/save/reset)
│   ├── package.json
│   ├── .env.example
│   └── __tests__/                 # 52 tests (Node.js built-in test runner)
│       ├── git-utils.test.js
│       ├── upstream-status.test.js
│       ├── upstream-diff.test.js
│       ├── conflict-preview.test.js
│       └── sync-state.test.js
└── references/
    ├── sync-workflow.md           # Full 7-phase sync workflow
    ├── review-guide.md            # Change evaluation methodology
    └── conflict-resolution.md     # Manual change application guide
```

## Running Tests

```bash
cd scripts
npm test
```

Requires Node.js >= 18 (uses built-in test runner, zero npm dependencies).

## Why Not Just `git merge`?

| | `git merge` | This skill |
|---|---|---|
| **Control** | All-or-nothing | Per-file, per-hunk decisions |
| **History** | Merge commits, upstream history mixed in | Clean local commits only |
| **Conflicts** | Cryptic conflict markers | Claude understands intent and combines intelligently |
| **Customizations** | Can be overwritten silently | Explicitly preserved, upstream adapted to fit |
| **Tracking** | Merge-base advances automatically | Explicit sync state, committed to git |
| **Cross-machine** | N/A (git handles it) | Sync state persists via `.upstream-sync.json` |

## License

MIT
