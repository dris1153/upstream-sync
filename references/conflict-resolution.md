# Manual Change Application Guide

Guide for applying upstream changes by editing files directly, especially when upstream and local changes overlap.

## Overlap Types

### 1. Non-overlapping changes
- **Risk**: None — upstream changed files you didn't touch
- **Action**: Apply upstream changes directly via Edit tool

### 2. Same file, different sections
- **Risk**: Low — both sides changed, but different parts
- **Action**: Apply upstream changes to the sections they modified, leave your sections untouched

### 3. Same file, same section
- **Risk**: Medium — both sides changed the same code
- **Action**: Read both versions, understand intent, write a combined version

### 4. Structural divergence
- **Risk**: High — file restructured, renamed, or deleted on one side
- **Action**: Understand the structural change, manually apply relevant logic to new structure

## Application Workflow

### Step 1: Identify Overlaps

Run `conflict-preview.js` to detect files modified on both sides:
```bash
node conflict-preview.js --format json
```

This shows:
- `conflicts` — same sections modified (needs careful combination)
- `safeOverlaps` — different sections modified (apply upstream sections directly)
- `upstreamOnly` — only upstream changed (safe to apply)
- `localOnly` — only you changed (not affected)

### Step 2: Process by Priority

1. **Upstream-only files** — apply directly, no risk
2. **Safe overlaps** — apply upstream changes to the specific sections they modified
3. **Overlapping sections** — careful combination needed (see below)

### Step 3: Apply Overlapping Changes

For files where both sides modified the same section:

1. **Read the upstream diff** — understand what upstream changed and why
2. **Read the local file** — understand your customization and why
3. **Decide priority**:
   - Upstream is a bug fix → incorporate the fix into your customized version
   - Upstream is a refactor → adapt your customization to the new structure
   - Upstream conflicts with intentional divergence → keep your version, note the upstream change
4. **Edit the file** — write a combined version that preserves your intent while incorporating upstream improvements

### Step 4: Verify

After applying all changes:
```bash
git diff                    # Review all modifications
# Run test suite
# Run build
git diff --check            # No leftover conflict markers
```

## Best Practices

- **Apply in small batches** — don't try to apply everything at once
- **Test after each batch** — verify nothing breaks incrementally
- **Preserve local intent** — your customizations are the priority
- **Understand before applying** — never blindly copy upstream changes
- **Document decisions** — when skipping upstream changes, note why in commit message
- **Sync frequently** — smaller, more frequent syncs = fewer overlaps

## Common Patterns

### Bug fix in customized code
```
1. Read the upstream bug fix diff
2. Understand what the bug was
3. Check if your local version has the same bug
4. If yes: apply the fix adapted to your customized version
5. If no: your customization may have already fixed it differently — skip
```

### API signature change
```
1. Read the upstream API change
2. Find all local usages of the changed API
3. Update each usage to match the new signature
4. Adapt any local extensions that wrap the changed API
```

### New dependency or import
```
1. Check if the new dependency is compatible with your project
2. Add the dependency to your package manager
3. Apply the import changes
4. Adapt any paths that differ in your project structure
```

### Deleted code
```
1. Understand why upstream deleted the code
2. Check if your project depends on the deleted code
3. If not dependent: remove it locally too
4. If dependent: keep your version, note the upstream deletion
```
