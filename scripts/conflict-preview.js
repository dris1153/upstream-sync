#!/usr/bin/env node
/**
 * conflict-preview.js - Preview merge conflicts before integrating upstream
 *
 * Usage:
 *   node conflict-preview.js [--remote <name>] [--branch <branch>] [--strategy merge|rebase|cherry-pick] [--commit <hash>] [--format json|text]
 */

const { loadEnv, git, fetchRemote, hasUncommittedChanges, getDefaults } = require("./git-utils");

function parseArgs(argv) {
  const args = { remote: null, branch: null, strategy: "merge", commit: null, format: "text" };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--remote": args.remote = argv[++i]; break;
      case "--branch": args.branch = argv[++i]; break;
      case "--strategy": args.strategy = argv[++i]; break;
      case "--commit": args.commit = argv[++i]; break;
      case "--format": args.format = argv[++i]; break;
      case "--help":
        console.log("Usage: node conflict-preview.js [--remote <name>] [--branch <branch>] [--strategy merge|rebase|cherry-pick] [--commit <hash>] [--format json|text]");
        process.exit(0);
    }
  }
  const defaults = getDefaults(args);
  args.remote = defaults.remote;
  args.branch = defaults.branch;
  return args;
}

function analyzeOverlappingFiles(mergeBase, target) {
  const localFiles = git(`diff --name-only ${mergeBase}...HEAD`, { allowFail: true }) || "";
  const upstreamFiles = git(`diff --name-only ${mergeBase}...${target}`, { allowFail: true }) || "";

  const localSet = new Set(localFiles.split("\n").filter(Boolean));
  const upstreamSet = new Set(upstreamFiles.split("\n").filter(Boolean));
  const bothModified = [...localSet].filter((f) => upstreamSet.has(f));

  const conflicts = [];
  const safeOverlaps = [];

  for (const file of bothModified) {
    const mergeTree = git(`merge-tree ${mergeBase} HEAD ${target} -- ${file}`, { allowFail: true, returnError: true });
    const localDiff = git(`diff --stat ${mergeBase}...HEAD -- ${file}`, { allowFail: true }) || "";
    const upstreamDiff = git(`diff --stat ${mergeBase}...${target} -- ${file}`, { allowFail: true }) || "";

    const fileInfo = { file, localChanges: localDiff, upstreamChanges: upstreamDiff };

    if (mergeTree && typeof mergeTree === "object" && mergeTree.error) {
      conflicts.push({ ...fileInfo, severity: "high", reason: "merge-tree detected conflict" });
    } else {
      safeOverlaps.push({ ...fileInfo, severity: "low", reason: "both sides modified, likely auto-mergeable" });
    }
  }

  const upstreamOnly = [...upstreamSet].filter((f) => !localSet.has(f));
  const localOnly = [...localSet].filter((f) => !upstreamSet.has(f));

  return { conflicts, safeOverlaps, upstreamOnly, localOnly };
}

function previewMergeConflicts(remote, branch) {
  const target = `${remote}/${branch}`;

  if (!git(`rev-parse ${target}`, { allowFail: true })) {
    return { error: `${target} not found. Run: git fetch ${remote}` };
  }

  const mergeBase = git(`merge-base HEAD ${target}`, { allowFail: true });
  if (!mergeBase) {
    return { error: "No common ancestor found between current branch and upstream" };
  }

  const analysis = analyzeOverlappingFiles(mergeBase, target);

  return {
    mergeBase: mergeBase.slice(0, 8),
    ...analysis,
    summary: {
      totalConflicts: analysis.conflicts.length,
      totalOverlaps: analysis.safeOverlaps.length,
      upstreamOnlyFiles: analysis.upstreamOnly.length,
      localOnlyFiles: analysis.localOnly.length,
      recommendation: analysis.conflicts.length === 0 ? "SAFE_TO_MERGE" :
                      analysis.conflicts.length <= 3 ? "MERGE_WITH_MANUAL_RESOLUTION" :
                      "CONSIDER_CHERRY_PICK",
    },
  };
}

function previewRebaseConflicts(remote, branch) {
  const mergeResult = previewMergeConflicts(remote, branch);
  if (mergeResult.error) return mergeResult;

  const target = `${remote}/${branch}`;
  const mergeBase = git(`merge-base HEAD ${target}`, { allowFail: true });
  const localCommits = git(`log --oneline ${mergeBase}..HEAD`, { allowFail: true }) || "";
  const commitCount = localCommits ? localCommits.split("\n").filter(Boolean).length : 0;

  return {
    ...mergeResult,
    strategy: "rebase",
    localCommitsToReplay: commitCount,
    note: commitCount > 10
      ? "Many local commits to replay. Consider squashing first or using merge instead."
      : "Rebase should work smoothly for this number of commits.",
  };
}

function printText(r, strategy) {
  console.log(`=== Conflict Preview (${strategy}) ===\n`);

  if (r.error) { console.log(`[!] ${r.error}`); return; }

  console.log(`Merge base: ${r.mergeBase}`);
  if (r.localCommitsToReplay) console.log(`Local commits to replay: ${r.localCommitsToReplay}`);

  const s = r.summary;
  console.log(`\n--- Summary ---`);
  console.log(`Potential conflicts:  ${s.totalConflicts}`);
  console.log(`Safe overlaps:       ${s.totalOverlaps}`);
  console.log(`Upstream-only files: ${s.upstreamOnlyFiles}`);
  console.log(`Local-only files:    ${s.localOnlyFiles}`);
  console.log(`Recommendation:      ${s.recommendation}`);

  if (r.conflicts.length > 0) {
    console.log(`\n--- Conflicting Files (need manual resolution) ---`);
    for (const c of r.conflicts) {
      console.log(`  [HIGH] ${c.file}`);
      console.log(`         Reason: ${c.reason}`);
    }
  }

  if (r.safeOverlaps.length > 0) {
    console.log(`\n--- Safe Overlaps (both sides changed, likely auto-mergeable) ---`);
    for (const c of r.safeOverlaps) console.log(`  [LOW]  ${c.file}`);
  }

  if (r.upstreamOnly && r.upstreamOnly.length > 0) {
    console.log(`\n--- Upstream-Only Changes (${r.upstreamOnly.length} files, safe) ---`);
    const show = r.upstreamOnly.slice(0, 20);
    for (const f of show) console.log(`  ${f}`);
    if (r.upstreamOnly.length > 20) console.log(`  ... and ${r.upstreamOnly.length - 20} more`);
  }

  if (r.note) console.log(`\nNote: ${r.note}`);
}

function run(argv) {
  loadEnv();
  const args = parseArgs(argv || process.argv);

  if (hasUncommittedChanges()) {
    const warning = "WARNING: Uncommitted changes detected. Commit or stash before syncing.";
    if (args.format === "json") {
      console.log(JSON.stringify({ warning, uncommittedChanges: true }));
    } else {
      console.log(`[!] ${warning}\n`);
    }
  }

  fetchRemote(args.remote);

  let result;
  switch (args.strategy) {
    case "rebase":
      result = previewRebaseConflicts(args.remote, args.branch);
      break;
    case "cherry-pick":
      if (!args.commit) {
        result = { error: "Cherry-pick strategy requires --commit <hash>" };
      } else {
        result = previewMergeConflicts(args.remote, args.branch);
        result.strategy = "cherry-pick";
        result.targetCommit = args.commit;
      }
      break;
    default:
      result = previewMergeConflicts(args.remote, args.branch);
      result.strategy = "merge";
  }

  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result, args.strategy);
  }
  return result;
}

module.exports = { parseArgs, previewMergeConflicts, previewRebaseConflicts, analyzeOverlappingFiles, run };

if (require.main === module) {
  try { run(); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
}
