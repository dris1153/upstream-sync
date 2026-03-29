# Upstream Change Review Guide

How to evaluate upstream changes and decide what to apply by editing files directly.

## Review Process

### Step 1: Get Overview

Run `upstream-status.js --format json` to get the structured commit list.
Run `upstream-diff.js --files-only` to see all changed files.

Categorize upstream commits by type:
- **Bug fixes** — high priority, usually safe to apply
- **New features** — evaluate relevance to your fork
- **Refactoring** — may affect files you customized, review carefully
- **Dependencies** — check compatibility with your additions
- **CI/Build** — may need adaptation for your build setup
- **Docs** — low risk, apply freely

### Step 2: Assess Each Changed File

For each file in the upstream diff:

| Question | If Yes | If No |
|----------|--------|-------|
| File exists locally? | Compare diffs carefully | Just create the file |
| File was locally customized? | Careful merge needed | Apply upstream as-is |
| Change fixes a bug you also have? | High priority apply | Lower priority |
| Change modifies an API you depend on? | Adapt carefully | Apply as-is |
| Change adds functionality you want? | Apply (possibly adapted) | Skip |

### Step 3: Create Application Plan

Group files into:
1. **Apply as-is** — upstream-only files, or files with no local customizations
2. **Apply with adaptation** — useful changes that need adjustment for local code
3. **Partial apply** — only some hunks/sections are relevant
4. **Skip** — irrelevant changes or intentional local divergence

## How to Apply Changes

### For simple changes (apply as-is)
```
1. Read the upstream diff for the file
2. Edit the local file to incorporate the changes
```

### For adapted changes
```
1. Read the upstream diff to understand intent
2. Read the local file to understand current state
3. Write a modified version that combines both
```

### For partial changes
```
1. Read the upstream diff
2. Identify which hunks/sections are useful
3. Apply only those specific sections via Edit tool
```

### For new files
```
1. Get upstream file content from upstream-diff.js --format json
2. Create the file locally
3. Adapt imports, paths, or conventions to match local project
```

## Reading Upstream Diffs

To review specific details:
```bash
# Per-file diff with context
node upstream-diff.js --file <path> --context 10 --format json

# Specific commit's changes
node upstream-diff.js --commit <hash> --format json

# Just the file list
node upstream-diff.js --files-only

# Full commit details
git show <commit-hash>
git log --oneline upstream/main -20
```

## Red Flags

Watch for these in upstream changes:
- **Breaking API changes** — functions renamed, signatures changed
- **Dependency version bumps** — may conflict with your pinned versions
- **File restructuring** — moved/renamed files break your patches
- **Config format changes** — build, CI, or env config modifications
- **Removed features** — features you depend on being deleted

## Decision Template

For each file group:
```
File(s): <path(s)>
Type: bug-fix | feature | refactor | deps | config
Impact: low | medium | high
Action: apply-as-is | adapt | partial | skip
Reason: <why>
```
