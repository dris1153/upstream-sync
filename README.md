# Upstream Sync

A Claude Code skill that syncs your fork/clone with the original open source repository. Automatically fetches, reviews, analyzes conflicts, and integrates new upstream commits smoothly.

## Problem

When you fork/clone an open source project and build custom features on top, the original repo keeps receiving new commits from the community. Syncing those changes into your code is typically:

- Time-consuming to review each new commit
- Hard to detect conflicts before merging
- Risky — can break your customized features

This skill automates the entire process for Claude Code.

## Features

### 1. Upstream Status Check

Script `upstream-status.js`:
- Detects upstream remote (auto or specified)
- Fetches latest commits from upstream
- Lists new commits not yet synced
- Shows changed files and diffstat
- Reports ahead/behind commit counts

### 2. Conflict Preview Before Merge

Script `conflict-preview.js`:
- Dry-run merge to detect potential conflicts
- Categorizes files by risk level:
  - **Conflicts** (HIGH) — both sides modified the same section, manual resolution needed
  - **Safe Overlaps** (LOW) — both sides modified but different sections, git can auto-merge
  - **Upstream-only** — only upstream changed, safe to merge
  - **Local-only** — only local changed, not affected
- Provides a recommendation: `SAFE_TO_MERGE`, `MERGE_WITH_MANUAL_RESOLUTION`, or `CONSIDER_CHERRY_PICK`

### 3. Commit Review & Analysis

Guides Claude Code to review each upstream commit:
- Categorize by type (bug fix, feature, refactor, deps, config)
- Assess impact on local code
- Create integration plan: must integrate / want to integrate / skip

### 4. Smart Integration

Supports 3 integration strategies:

| Strategy | When to Use |
|----------|-------------|
| **Merge** | Many local customizations, need to preserve full history |
| **Rebase** | Few local changes, want clean linear history |
| **Cherry-pick** | Only need specific upstream commits |

### 5. Conflict Resolution Guidance

When conflicts arise, the skill guides through:
- Prioritizing conflicts (dependencies > utilities > features)
- Resolution strategy for each conflict type
- Post-resolution verification (test, build, verify)

## Installation

### Option 1: Copy into project

Copy this folder into `.claude/skills/upstream-sync/` in your project:

```bash
# Linux/macOS
cp -r . /path/to/your-project/.claude/skills/upstream-sync/

# Windows (PowerShell)
Copy-Item -Recurse -Path . -Destination "C:\path\to\your-project\.claude\skills\upstream-sync"
```

### Option 2: Symlink

```bash
# Linux/macOS
ln -s /path/to/upstream-sync /path/to/your-project/.claude/skills/upstream-sync

# Windows (PowerShell, run as admin)
New-Item -ItemType Junction -Path "C:\path\to\your-project\.claude\skills\upstream-sync" -Target "C:\path\to\upstream-sync"
```

## Usage

### Step 1: Configure upstream URL

**Option A: Via `.env` (recommended)** — the skill will auto-create the remote for you:

Create a `.env` file in the `scripts/` directory (or project root):
```env
UPSTREAM_URL=https://github.com/original-author/original-repo.git
```

**Option B: Manual** — add the remote yourself:
```bash
git remote add upstream https://github.com/original-author/original-repo.git
```

If neither is configured, the skill will tell you what to do.

### Step 2: Ask Claude Code to sync

Trigger phrases:

```
"Sync upstream changes"
"Review new commits from upstream"
"Check what's new in the original repo"
"Integrate upstream into my branch"
"Preview conflicts with upstream"
```

### Step 3: Claude Code will automatically

1. Run `upstream-status.js` to fetch and list new commits
2. Run `conflict-preview.js` to analyze conflicts
3. Review each commit and assess impact
4. Recommend the best integration strategy
5. Perform merge/rebase/cherry-pick
6. Guide through conflict resolution if needed
7. Run tests/build to confirm stability

## Using Scripts Directly

### upstream-status.js

```bash
# Check status (text output)
node scripts/upstream-status.js

# JSON output for programmatic use
node scripts/upstream-status.js --format json

# Specify remote and branch
node scripts/upstream-status.js --remote origin --branch develop

# Only show commits since a specific date
node scripts/upstream-status.js --since 2024-06-01

# Limit number of commits
node scripts/upstream-status.js --limit 20
```

**Example output:**
```
=== Upstream Sync Status ===

Current branch: my-feature
Upstream remote: upstream (configured)
Upstream branch: main

Local is 5 commits ahead, 12 commits behind upstream.

New upstream commits: 12
Files changed: 8

--- Commits ---
  a1b2c3d 2024-06-15 Alice: Fix memory leak in parser
  d4e5f6g 2024-06-14 Bob: Add dark mode support
  ...
```

### conflict-preview.js

```bash
# Preview merge conflicts
node scripts/conflict-preview.js

# Preview rebase conflicts
node scripts/conflict-preview.js --strategy rebase

# Preview cherry-pick conflicts for a specific commit
node scripts/conflict-preview.js --strategy cherry-pick --commit abc123

# JSON output
node scripts/conflict-preview.js --format json

# Specify remote/branch
node scripts/conflict-preview.js --remote upstream --branch main
```

**Example output:**
```
=== Conflict Preview (merge) ===

Merge base: a1b2c3d4

--- Summary ---
Potential conflicts:  2
Safe overlaps:       3
Upstream-only files: 15
Local-only files:    8
Recommendation:      MERGE_WITH_MANUAL_RESOLUTION

--- Conflicting Files (need manual resolution) ---
  [HIGH] src/parser.js
         Reason: merge-tree detected conflict
  [HIGH] config/settings.json
         Reason: merge-tree detected conflict

--- Safe Overlaps (both sides changed, likely auto-mergeable) ---
  [LOW]  src/utils.js
  [LOW]  src/index.js
  [LOW]  package.json
```

## Configuration

Create a `.env` file in the `scripts/` directory or project root:

```env
# URL of the original repo (auto-creates remote if not configured)
UPSTREAM_URL=https://github.com/original-author/original-repo.git

# Remote name and branch (optional, defaults shown)
UPSTREAM_REMOTE=upstream
UPSTREAM_BRANCH=main
```

Priority order: `process.env` > `scripts/.env` > parent `.env` > grandparent `.env`

## Project Structure

```
upstream-sync/
├── SKILL.md                   # Skill metadata + workflow for Claude Code
├── README.md
├── scripts/
│   ├── git-utils.js           # Shared git utilities
│   ├── upstream-status.js     # Check upstream, list new commits
│   ├── conflict-preview.js    # Preview conflicts before merge
│   ├── package.json
│   ├── .env.example
│   └── __tests__/             # 26 tests
│       ├── git-utils.test.js
│       ├── upstream-status.test.js
│       └── conflict-preview.test.js
└── references/
    ├── sync-workflow.md       # Full 5-phase sync workflow
    ├── review-guide.md        # Upstream commit review guide
    └── conflict-resolution.md # Conflict resolution strategies
```

## Running Tests

```bash
cd scripts
node --test __tests__/git-utils.test.js __tests__/upstream-status.test.js __tests__/conflict-preview.test.js
```

Requires Node.js >= 18 (uses built-in test runner, zero dependencies).

## Real-World Examples

### Scenario: Forked VSCode with custom features

```
You: "Sync my fork with latest VSCode upstream"

Claude Code:
1. Runs upstream-status.js → finds 47 new commits
2. Runs conflict-preview.js → 3 conflicting files, 12 safe overlaps
3. Reviews 47 commits:
   - 5 bug fixes (must integrate)
   - 20 new features (10 relevant, 10 skip)
   - 12 refactoring (review carefully)
   - 10 docs/CI (auto-merge)
4. Suggests: merge bug fixes + docs first
5. Cherry-picks the 10 relevant feature commits
6. Resolves 3 conflicting files with specific guidance
7. Runs test suite to confirm stability
```

### Scenario: Only want bug fixes from upstream

```
You: "Only integrate bug fixes from upstream, skip new features"

Claude Code:
1. Fetches upstream, lists new commits
2. Filters commits with "fix", "bug", "patch" in message
3. Cherry-picks each bug fix commit
4. Tests after each cherry-pick
```

## License

MIT
