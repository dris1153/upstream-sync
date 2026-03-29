---
name: upstream-sync
description: Sync forked/cloned open source repositories with upstream changes. Use when user wants to fetch, review, analyze, or integrate new commits from an upstream/original open source repository into their customized fork. Covers upstream remote setup, commit review, conflict preview, merge/rebase strategies, and conflict resolution guidance. Trigger on keywords like "sync upstream", "merge upstream", "rebase upstream", "fork sync", "upstream changes", "new commits from original repo".
---

# Upstream Sync

Sync forked/cloned open source repos with latest upstream changes. Handles remote setup, change review, conflict detection, and smooth integration.

## When to Use

- User mentions "sync", "upstream", "fork", "merge upstream", "rebase upstream"
- User wants to review new commits from an original open source repo
- User needs to integrate upstream changes into their customized branch
- User asks about conflicts between their changes and upstream

## Workflow

Read [references/sync-workflow.md](references/sync-workflow.md) for the full step-by-step process.

### 1. Check Upstream Status

Run `scripts/upstream-status.js` to detect upstream remote, fetch latest, and list new commits:

```bash
node <skill-path>/scripts/upstream-status.js [--remote <name>] [--branch <branch>] [--since <date>] [--format json|text]
```

### 2. Preview Conflicts

Run `scripts/conflict-preview.js` to dry-run merge and detect potential conflicts:

```bash
node <skill-path>/scripts/conflict-preview.js [--remote <name>] [--branch <branch>] [--strategy merge|rebase]
```

### 3. Review & Integrate

- Review each upstream commit for relevance and potential impact
- Read [references/review-guide.md](references/review-guide.md) for review methodology
- Choose integration strategy based on conflict preview results

### 4. Resolve Conflicts

Read [references/conflict-resolution.md](references/conflict-resolution.md) for conflict resolution strategies.

## Integration Strategies

| Strategy | When to Use |
|----------|-------------|
| **Merge** | Many local customizations, preserve full history |
| **Rebase** | Few local changes, clean linear history |
| **Cherry-pick** | Only need specific upstream commits |

## Script Options

Both scripts support `--format json` for structured output.

Environment variables (`.env`):
- `UPSTREAM_REMOTE` - Default upstream remote name (default: `upstream`)
- `UPSTREAM_BRANCH` - Default upstream branch (default: `main`)
