# Conflict Resolution Strategies

Guide for resolving merge conflicts during upstream sync.

## Conflict Types

### 1. Same-file, Different-section
- **Risk**: Low - Git usually auto-merges
- **Action**: Review auto-merge result for logical consistency

### 2. Same-file, Same-section
- **Risk**: Medium - Manual resolution required
- **Action**: Compare both versions, decide which logic to keep
- Often: keep local customization, incorporate upstream bug fixes

### 3. File Deleted vs Modified
- **Risk**: Medium - One side deleted, other modified
- **Action**: Decide if file is still needed for local features

### 4. Structural/Rename Conflicts
- **Risk**: High - File moved/renamed on one side
- **Action**: Track rename chain, apply changes to new location

## Resolution Workflow

### Step 1: Identify All Conflicts
```bash
git diff --name-only --diff-filter=U
```

### Step 2: Categorize by Priority
1. **Core dependencies** (package.json, build configs) - resolve first
2. **Shared utilities** - resolve second (others depend on these)
3. **Feature files** - resolve last

### Step 3: Resolve Each File
For each conflicting file:
1. Read both versions (local vs upstream)
2. Understand *intent* of each change, not just the diff
3. Apply resolution:
   - **Keep local**: When upstream change conflicts with your custom feature
   - **Take upstream**: When upstream fixes a bug you also have
   - **Combine**: When both changes are valuable and compatible
4. Test after each resolution

### Step 4: Verify
```bash
git diff --check           # No conflict markers remaining
# Run test suite
# Run build
```

## Best Practices

- **Resolve in small batches** - Don't try to fix all conflicts at once
- **Commit after each resolution** when rebasing (git automatically does this)
- **Keep a log** of resolution decisions for future reference
- **When in doubt, keep local** - your customizations are the priority
- **Never blindly accept** either side - always understand the change
- **Sync frequently** - smaller, more frequent syncs = fewer conflicts

## Abort & Retry

If things go wrong:
```bash
git merge --abort     # Abort merge
git rebase --abort    # Abort rebase
git cherry-pick --abort  # Abort cherry-pick
```
