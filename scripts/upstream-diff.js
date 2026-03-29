#!/usr/bin/env node
/**
 * upstream-diff.js - Extract per-file diffs from upstream for review and manual application
 *
 * Instead of merging commits directly, this script extracts the actual changes
 * so Claude can evaluate each change and edit files directly.
 *
 * Usage:
 *   node upstream-diff.js [--remote <name>] [--branch <branch>] [--file <path>] [--commit <hash>] [--files-only] [--context <n>] [--format json|text]
 */

const { loadEnv, git, fetchRemote, getCurrentBranch, getDefaults, validateArg, ensureRemote, getBaseCommit } = require("./git-utils");

function parseArgs(argv) {
  const args = { remote: null, branch: null, file: null, commit: null, filesOnly: false, context: 5, format: "text" };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--remote": args.remote = argv[++i]; break;
      case "--branch": args.branch = argv[++i]; break;
      case "--file": args.file = argv[++i]; break;
      case "--commit": args.commit = argv[++i]; break;
      case "--files-only": args.filesOnly = true; break;
      case "--context": args.context = parseInt(argv[++i], 10); break;
      case "--format": args.format = argv[++i]; break;
      case "--help":
        console.log("Usage: node upstream-diff.js [--remote <name>] [--branch <branch>] [--file <path>] [--commit <hash>] [--files-only] [--context <n>] [--format json|text]");
        process.exit(0);
    }
  }
  if (isNaN(args.context) || args.context < 0) args.context = 5;
  const defaults = getDefaults(args);
  args.remote = defaults.remote;
  args.branch = defaults.branch;
  validateArg(args.remote, "remote");
  validateArg(args.branch, "branch");
  if (args.commit) validateArg(args.commit, "commit");
  return args;
}

function resolveBase(remote, branch) {
  const base = getBaseCommit(remote, branch);
  if (!base.commit) return { error: "No common ancestor found and no sync state available" };
  return { baseCommit: base.commit, baseSource: base.source };
}

function parseNameStatus(output) {
  if (!output) return [];
  return output.split("\n").filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const statusCode = parts[0];
    let status, oldPath = null;
    if (statusCode.startsWith("A")) status = "added";
    else if (statusCode.startsWith("M")) status = "modified";
    else if (statusCode.startsWith("D")) status = "deleted";
    else if (statusCode.startsWith("R")) { status = "renamed"; oldPath = parts[1]; }
    else if (statusCode.startsWith("C")) { status = "copied"; oldPath = parts[1]; }
    else status = "unknown";
    const filePath = parts[parts.length - 1];
    return { path: filePath, oldPath, status, statusCode };
  });
}

function getChangedFiles(baseCommit, target, file) {
  const args = ["diff", "--name-status", `${baseCommit}..${target}`];
  if (file) args.push("--", file);
  const output = git(args, { allowFail: true }) || "";
  return parseNameStatus(output);
}

function getCommitChangedFiles(commitHash) {
  const output = git(["diff-tree", "--no-commit-id", "--name-status", "-r", commitHash], { allowFail: true }) || "";
  return parseNameStatus(output);
}

function getFileDiff(baseCommit, target, filePath, context) {
  return git(["diff", `-U${context}`, `${baseCommit}..${target}`, "--", filePath], { allowFail: true }) || "";
}

function getCommitFileDiff(commitHash, filePath, context) {
  const args = ["show", `--format=`, `-U${context}`, commitHash, "--", filePath];
  return git(args, { allowFail: true }) || "";
}

function getUpstreamFileContent(target, filePath) {
  return git(["show", `${target}:${filePath}`], { allowFail: true });
}

function getLocalFileContent(filePath) {
  return git(["show", `HEAD:${filePath}`], { allowFail: true });
}

function getCommitInfo(commitHash) {
  const format = "%H|%h|%an|%ae|%aI|%s";
  const output = git(["log", "-1", `--pretty=format:${format}`, commitHash], { allowFail: true });
  if (!output) return null;
  const [hash, short, author, email, date, ...msgParts] = output.split("|");
  return { hash, short, author, email, date, message: msgParts.join("|") };
}

/**
 * Get all upstream diffs since merge base (aggregated across all new commits)
 */
function getAllDiffs(remote, branch, file, context, filesOnly) {
  const target = `${remote}/${branch}`;

  if (!git(["rev-parse", target], { allowFail: true })) {
    return { error: `${target} not found. Run: git fetch ${remote}` };
  }

  const baseResult = resolveBase(remote, branch);
  if (baseResult.error) return baseResult;
  const { baseCommit, baseSource } = baseResult;

  const changedFiles = getChangedFiles(baseCommit, target, file);

  if (filesOnly) {
    return {
      baseCommit: baseCommit.slice(0, 8),
      baseSource,
      target,
      currentBranch: getCurrentBranch(),
      files: changedFiles,
      count: changedFiles.length,
    };
  }

  const files = changedFiles.map((f) => {
    const diff = getFileDiff(baseCommit, target, f.path, context);
    const upstreamContent = f.status !== "deleted" ? getUpstreamFileContent(target, f.path) : null;
    const localContent = f.status !== "added" ? getLocalFileContent(f.path) : null;
    const localExists = localContent !== null;

    return { ...f, diff, upstreamContent, localContent, localExists };
  });

  return {
    baseCommit: baseCommit.slice(0, 8),
    baseSource,
    target,
    currentBranch: getCurrentBranch(),
    files,
    count: files.length,
  };
}

/**
 * Get diffs for a specific upstream commit
 */
function getCommitDiffs(remote, branch, commitHash, file, context, filesOnly) {
  const target = `${remote}/${branch}`;

  if (!git(["rev-parse", target], { allowFail: true })) {
    return { error: `${target} not found. Run: git fetch ${remote}` };
  }

  if (!git(["rev-parse", commitHash], { allowFail: true })) {
    return { error: `Commit ${commitHash} not found. Run: git fetch ${remote}` };
  }

  const commitInfo = getCommitInfo(commitHash);
  let changedFiles = getCommitChangedFiles(commitHash);
  if (file) changedFiles = changedFiles.filter((f) => f.path === file);

  if (filesOnly) {
    return {
      commit: commitInfo,
      target,
      currentBranch: getCurrentBranch(),
      files: changedFiles,
      count: changedFiles.length,
    };
  }

  const files = changedFiles.map((f) => {
    const diff = getCommitFileDiff(commitHash, f.path, context);
    const upstreamContent = f.status !== "deleted" ? getUpstreamFileContent(target, f.path) : null;
    const localContent = f.status !== "added" ? getLocalFileContent(f.path) : null;
    const localExists = localContent !== null;

    return { ...f, diff, upstreamContent, localContent, localExists };
  });

  return {
    commit: commitInfo,
    target,
    currentBranch: getCurrentBranch(),
    files,
    count: files.length,
  };
}

function printText(r) {
  console.log("=== Upstream Diff ===\n");

  if (r.error) { console.log(`[!] ${r.error}`); return; }

  console.log(`Current branch: ${r.currentBranch}`);
  console.log(`Target: ${r.target}`);
  if (r.baseCommit) console.log(`Base: ${r.baseCommit} (${r.baseSource || "unknown"})`);
  if (r.commit) console.log(`Commit: ${r.commit.short} ${r.commit.date.slice(0, 10)} ${r.commit.author}: ${r.commit.message}`);
  console.log(`Changed files: ${r.count}\n`);

  if (r.count === 0) { console.log("No changes found."); return; }

  // Summary table
  const added = r.files.filter((f) => f.status === "added").length;
  const modified = r.files.filter((f) => f.status === "modified").length;
  const deleted = r.files.filter((f) => f.status === "deleted").length;
  const renamed = r.files.filter((f) => f.status === "renamed").length;

  console.log("--- Summary ---");
  if (added) console.log(`  Added:    ${added}`);
  if (modified) console.log(`  Modified: ${modified}`);
  if (deleted) console.log(`  Deleted:  ${deleted}`);
  if (renamed) console.log(`  Renamed:  ${renamed}`);

  // File list
  console.log("\n--- Changed Files ---");
  for (const f of r.files) {
    const tag = f.status.toUpperCase().slice(0, 3);
    const local = f.localExists === false ? " (new)" : "";
    const rename = f.oldPath ? ` (from ${f.oldPath})` : "";
    console.log(`  [${tag}] ${f.path}${local}${rename}`);
  }

  // Diffs (if available)
  if (r.files[0] && r.files[0].diff !== undefined) {
    console.log("\n--- Diffs ---");
    for (const f of r.files) {
      if (!f.diff) continue;
      console.log(`\n${"=".repeat(60)}`);
      console.log(`File: ${f.path} [${f.status.toUpperCase()}]`);
      if (f.localExists === false) console.log("(file does not exist locally)");
      console.log("=".repeat(60));
      console.log(f.diff);
    }
  }
}

function run(argv) {
  loadEnv();
  const args = parseArgs(argv || process.argv);

  const remote = ensureRemote(args.remote);
  if (!remote.exists) {
    const errResult = { error: remote.error, suggestion: `Set UPSTREAM_URL in .env or run: git remote add ${args.remote} <url>` };
    if (args.format === "json") { console.log(JSON.stringify(errResult, null, 2)); }
    else { console.log(`[!] ${remote.error}\n    ${errResult.suggestion}`); }
    return errResult;
  }

  const fetched = fetchRemote(args.remote);
  if (!fetched && args.format === "text") {
    console.log("[!] Failed to fetch upstream. Results may be stale.\n");
  }

  let result;
  if (args.commit) {
    result = getCommitDiffs(args.remote, args.branch, args.commit, args.file, args.context, args.filesOnly);
  } else {
    result = getAllDiffs(args.remote, args.branch, args.file, args.context, args.filesOnly);
  }

  if (!fetched) result.fetchWarning = "Failed to fetch upstream. Results may be stale.";

  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }
  return result;
}

module.exports = { parseArgs, resolveBase, parseNameStatus, getAllDiffs, getCommitDiffs, run };

if (require.main === module) {
  try { run(); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
}
