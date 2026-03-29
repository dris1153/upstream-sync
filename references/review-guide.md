# Upstream Commit Review Guide

How to review upstream commits before integrating them.

## Review Process

### Step 1: Get Overview
Run `upstream-status.js --format json` to get structured commit list.

Categorize commits by type:
- **Bug fixes** - Usually safe to integrate, high priority
- **New features** - Evaluate relevance to your fork
- **Refactoring** - May conflict with local changes, review carefully
- **Dependencies** - Check compatibility with your additions
- **CI/Build** - May need adaptation for your build setup
- **Docs** - Low risk, integrate freely

### Step 2: Assess Each Commit

For each commit, evaluate:

| Question | If Yes | If No |
|----------|--------|-------|
| Fixes a bug you also have? | High priority integrate | Lower priority |
| Touches files you customized? | Check conflict-preview | Safe to merge |
| Changes APIs you depend on? | Review carefully | Safe to merge |
| Adds features you want? | Integrate | Skip or defer |
| Modifies build/config? | Test thoroughly | Auto-merge likely |

### Step 3: Create Integration Plan

Group commits into:
1. **Must integrate** - Bug fixes, security patches, breaking changes you need
2. **Want to integrate** - Useful features, improvements
3. **Skip/Defer** - Irrelevant features, conflicting approaches

## Reading Upstream Diffs

To review specific commit details:
```bash
git show <commit-hash>                  # Full diff
git show <commit-hash> --stat           # Files changed only
git show <commit-hash> -- <file-path>   # Specific file changes
git log --oneline upstream/main -20     # Recent 20 commits
```

## Red Flags

Watch for these in upstream changes:
- **Breaking API changes** - Functions renamed, signatures changed
- **Dependency version bumps** - May conflict with your pinned versions
- **File restructuring** - Moved/renamed files break your patches
- **Config format changes** - Build, CI, or env config modifications
- **Removed features** - Features you depend on being deleted

## Decision Template

For each commit group:
```
Commit(s): <hash(es)>
Type: bug-fix | feature | refactor | deps | config
Impact: low | medium | high
Decision: integrate | skip | defer
Reason: <why>
```
