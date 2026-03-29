# Code Review Report: upstream-sync Skill

**Date:** 2026-03-29
**Reviewer:** code-reviewer
**Base SHA:** a09fbfa | **Head SHA:** 10f239c

---

## Scope

- Files reviewed: 15 (all changed between a09fbfa..10f239c)
- Scripts: `git-utils.js`, `upstream-status.js`, `conflict-preview.js`, `package.json`, `.env.example`
- Tests: `git-utils.test.js`, `upstream-status.test.js`, `conflict-preview.test.js`
- References: `sync-workflow.md`, `review-guide.md`, `conflict-resolution.md`
- Root: `SKILL.md`, `README.md`
- Test results: 25/25 passing

---

## Overall Assessment

Solid, focused skill. Code is clean, well-structured, zero external runtime dependencies. Tests use real git repos (not mocks) — good choice for integration-level confidence. Several correctness bugs found, one security issue, and meaningful test coverage gaps.

---

## Critical Issues

### 1. Command Injection in `git()` via user-controlled input

**File:** `git-utils.js:35`

```js
return execSync(`git ${cmd}`, { ... })
```

The `cmd` string is built using user-supplied `--remote` and `--branch` values (e.g., `git fetch ${remote}`, `git merge-base HEAD ${remote}/${branch}`). A value like `upstream; rm -rf /` would execute arbitrary shell commands because `execSync` passes the string through the shell by default.

**Fix:** Use `execFileSync` with an array, or at minimum validate remote/branch names with a strict allowlist regex before use.

```js
// Option A: execFileSync (recommended)
const { execFileSync } = require("child_process");
const parts = cmd.split(" "); // naive but better than nothing for controlled internal calls
execFileSync("git", parts, { encoding: "utf-8", stdio: ["pipe","pipe","pipe"] });

// Option B: validate inputs before any git call
function validateRef(value, name) {
  if (!/^[a-zA-Z0-9._\-\/]+$/.test(value)) throw new Error(`Invalid ${name}: ${value}`);
}
```

In this skill's usage context (Claude Code runs scripts, user controls `--remote`/`--branch` args), the practical risk is low since the user is already running arbitrary code on their machine. However, it is still a code quality defect that should be fixed because:
- The pattern is unsafe and teaches bad habits
- `--since` dates are also injected into `--since="${since}"` (double-quoted but still risk in some shells)

**Severity: High** (low exploitability in context, high code quality concern)

---

## High Priority Findings

### 2. `--since` arg not validated, injected with quotes but still risky

**File:** `upstream-status.js:48`

```js
if (since) logCmd += ` --since="${since}"`;
```

If `since` contains `"` the quoting breaks. Should either validate the date format (`/^\d{4}-\d{2}-\d{2}$/`) or pass as separate argument via `execFileSync`.

### 3. `conflict-preview.js` cherry-pick strategy does NOT preview cherry-pick conflicts

**File:** `conflict-preview.js:170-175`

```js
case "cherry-pick":
  if (!args.commit) {
    result = { error: "Cherry-pick strategy requires --commit <hash>" };
  } else {
    result = previewMergeConflicts(args.remote, args.branch);  // <-- wrong
    result.strategy = "cherry-pick";
    result.targetCommit = args.commit;
  }
```

`previewMergeConflicts` is called with `remote/branch` as the full upstream target, not the single `args.commit`. The result is that the cherry-pick preview is actually showing a merge preview against the full upstream branch — this is functionally wrong. For cherry-pick conflict detection, the target should be the individual commit, not the entire branch.

**Fix:** Use `git merge-tree <merge-base> HEAD <commit>` where `<commit>` is the specific hash.

### 4. `package.json` test script omits `git-utils.test.js`

**File:** `scripts/package.json:5`

```json
"test": "node --test __tests__/upstream-status.test.js __tests__/conflict-preview.test.js"
```

`git-utils.test.js` is excluded from `npm test`. The README runs all three; `npm test` silently skips 10 tests. This will confuse CI and developers running `npm test`.

**Fix:** Add `__tests__/git-utils.test.js` to the test script, or use glob: `node --test __tests__/*.test.js`.

### 5. `fetchRemote` silently ignores failures with no user feedback

**File:** `git-utils.js:66`

```js
function fetchRemote(remote) {
  git(`fetch ${remote}`, { allowFail: true });
}
```

If the fetch fails (network down, invalid remote URL, auth failure), the script continues silently and reports stale or empty data. The user gets "0 new commits" with no indication that the fetch failed.

**Fix:** Return success/failure and propagate a warning in the callers' output.

---

## Medium Priority Improvements

### 6. `getNewCommits` runs `diff --stat` AND `diff --name-only` on same range — redundant

**File:** `upstream-status.js:59-60`

```js
const stat = git(`diff --stat ${range}`, { allowFail: true }) || "";
const filesChanged = git(`diff --name-only ${range}`, { allowFail: true }) || "";
```

Two separate git calls for overlapping information. `diff --stat` already contains filenames. You could parse filenames from `--stat` output or just use `--name-only` and accept the stat is separate. Minor but adds ~130ms latency on slow repos.

### 7. `analyzeOverlappingFiles` calls `git merge-tree` per file — O(n) git processes

**File:** `conflict-preview.js:43`

```js
const mergeTree = git(`merge-tree ${mergeBase} HEAD ${target} -- ${file}`, { allowFail: true, returnError: true });
```

`git merge-tree` is spawned once per overlapping file. For repos with 50+ overlapping files this spawns 50+ processes. Modern git (`>= 2.38`) supports `git merge-tree --write-tree HEAD upstream/main` which produces all conflicts in one call.

Low priority since this is a preview tool run infrequently, but worth noting.

### 8. `printText` in `upstream-status.js` checks `r.error` after printing aheadBehind

**File:** `upstream-status.js:89`

```js
if (r.aheadBehind) {
  console.log(`\nLocal is ${r.aheadBehind.ahead} commits ahead...`);
}
if (r.error) { console.log(`\n[!] ${r.error}`); return; }
```

If `getNewCommits` returns an error (e.g., branch not found after fetch fails), the output shows the ahead/behind line then an error. Minor ordering issue — the error check should come first.

### 9. `getRemotes()` regex fails on remote URLs with spaces (edge case)

**File:** `git-utils.js:52`

```js
const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
```

Remote URLs with spaces (rare but valid in some configurations) would fail to match. The `\((\w+)\)` only matches `fetch`/`push` — this is fine. No action needed unless you want robustness.

### 10. `run()` in tests uses `require()` inside test body — module cached between tests

**File:** `upstream-status.test.js:80`, `conflict-preview.test.js:96`

```js
it("should detect upstream remote", () => {
  const { run } = require("../upstream-status");
```

Node's module cache means `require()` always returns the same cached module instance. This is fine for these tests since `run` has no module-level state, but if someone adds module-level caching later the tests won't catch bugs from state leakage. Standard pattern is to require at the top of the test file.

---

## Low Priority Suggestions

### 11. `SKILL.md` description keyword list is good but missing "check upstream"

**File:** `SKILL.md:3`

`"check upstream"` is a natural trigger phrase not in the keyword list. Already has `"sync upstream"`, `"upstream changes"` etc. Minor addition.

### 12. `conflict-preview.js:previewRebaseConflicts` calls `merge-base` twice

**File:** `conflict-preview.js:91-98`

`previewRebaseConflicts` calls `previewMergeConflicts` (which internally calls `merge-base`) and then calls `merge-base` again to count local commits. The second `merge-base` result is the same as the first. Could accept `mergeBase` as a parameter or extract it up front.

### 13. `--limit` arg not validated — `parseInt` of non-numeric gives `NaN`

**File:** `upstream-status.js:17`

```js
case "--limit": args.limit = parseInt(argv[++i], 10); break;
```

`--limit foo` produces `NaN`, and `git log -n NaN` throws a git error with a confusing message. Should validate with `|| 50` fallback or explicit check.

### 14. `conflict-resolution.md` Step 4 verify is incomplete

**File:** `references/conflict-resolution.md:48`

```bash
git diff --check           # No conflict markers remaining
# Run test suite
# Run build
```

The comments are not commands — a developer following literally would skip tests. These should be actual command examples (e.g., `npm test`, `npm run build`) with a note that the exact command is project-specific.

### 15. README installation examples use Unix paths only

**File:** `README.md:65-75`

`cp -r . /path/...` and `ln -s` work on Unix. The skill targets Windows (confirmed by env info). Should note Windows equivalent (`xcopy`, junction, or note that Git Bash / WSL are required).

---

## Positive Observations

- **Zero runtime dependencies** — `package.json` has no `dependencies` field. The skill works with any Node 18+ install, nothing to `npm install`. This is the right call.
- **Real git repos in tests, not mocks** — Tests create actual temp repos, push commits, and verify behavior end-to-end. This gives genuine integration confidence.
- **`allowFail` / `returnError` split in `git()`** — Clean API for distinguishing "expected failure" vs "check the error" vs "throw" cases.
- **`loadEnv` priority chain** — `process.env` > `scripts/.env` > parent > grandparent is exactly right for skill usage contexts.
- **`SKILL.md` description** — Well-crafted frontmatter, clear trigger phrases, correct workflow order. Will activate reliably.
- **`conflict-preview` recommendation thresholds** — 0 = SAFE, 1-3 = MANUAL, 4+ = CHERRY_PICK is a reasonable heuristic and clearly documented.
- **`printText` upstream-only truncation at 20** — Good UX decision to cap noisy output.
- **Test cleanup** — Both `beforeEach`/`afterEach` and try-catch in `cleanupTempRepo` means temp dirs are always cleaned even on test failure.

---

## Recommended Actions

1. **[High]** Replace `execSync(\`git ${cmd}\`)` with `execFileSync("git", [...args])` to eliminate shell injection. At minimum validate `remote` and `branch` with `/^[a-zA-Z0-9._\-\/]+$/` before use.
2. **[High]** Fix cherry-pick preview to actually preview the target commit's conflicts, not the entire upstream branch.
3. **[High]** Add `git-utils.test.js` to `npm test` script.
4. **[High]** Surface fetch failures — return result from `fetchRemote` and warn callers when fetch fails silently.
5. **[Medium]** Validate `--since` as a date string before interpolation.
6. **[Medium]** Move `require("../upstream-status")` / `require("../conflict-preview")` calls to top of test files.
7. **[Low]** Validate `--limit` arg, add NaN guard.
8. **[Low]** Add Windows installation note to README.

---

## Metrics

- Test Coverage: 25 tests across 3 files; good happy-path coverage. Missing: fetch failure propagation, cherry-pick conflict detection correctness, invalid arg handling (`--limit NaN`, invalid `--remote` chars), `--since` with special chars.
- Linting Issues: 0 (no linter configured; acceptable for a skill with no build step)
- Runtime Dependencies: 0 (excellent)
- Node version requirement: >= 18 (correct, uses built-in test runner)

---

## Unresolved Questions

1. Should `conflict-preview.js --strategy cherry-pick` preview against `--commit` only, or also show broader context from the full upstream range? The current behavior (wrong) needs a design decision.
2. Is Windows (cmd.exe) a supported execution environment, or is Git Bash / WSL assumed? This affects both the shell injection risk level and the README installation guidance.
