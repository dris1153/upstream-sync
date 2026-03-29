#!/usr/bin/env node
/**
 * upstream-status.js - Check upstream remote status and list new commits
 *
 * Usage:
 *   node upstream-status.js [--remote <name>] [--branch <branch>] [--since <date>] [--limit <n>] [--format json|text]
 */

const { loadEnv, git, getRemotes, getCurrentBranch, fetchRemote, getDefaults, validateArg } = require("./git-utils");

function parseArgs(argv) {
  const args = { remote: null, branch: null, since: null, limit: 50, format: "text" };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--remote": args.remote = argv[++i]; break;
      case "--branch": args.branch = argv[++i]; break;
      case "--since": args.since = argv[++i]; break;
      case "--limit": args.limit = parseInt(argv[++i], 10); break;
      case "--format": args.format = argv[++i]; break;
      case "--help":
        console.log("Usage: node upstream-status.js [--remote <name>] [--branch <branch>] [--since <date>] [--limit <n>] [--format json|text]");
        process.exit(0);
    }
  }
  if (isNaN(args.limit) || args.limit < 1) args.limit = 50;
  const defaults = getDefaults(args);
  args.remote = defaults.remote;
  args.branch = defaults.branch;
  validateArg(args.remote, "remote");
  validateArg(args.branch, "branch");
  if (args.since) validateArg(args.since, "since");
  return args;
}

function getAheadBehind(remote, branch) {
  const local = getCurrentBranch();
  const result = git(["rev-list", "--left-right", "--count", `${local}...${remote}/${branch}`], { allowFail: true });
  if (!result) return null;
  const [ahead, behind] = result.split("\t").map(Number);
  return { ahead, behind };
}

function getNewCommits(remote, branch, since, limit) {
  const currentBranch = getCurrentBranch();
  const range = `HEAD..${remote}/${branch}`;

  if (!git(["rev-parse", `${remote}/${branch}`], { allowFail: true })) {
    return { error: `Branch ${remote}/${branch} not found. Run: git fetch ${remote}` };
  }

  const logArgs = ["log", range, "--pretty=format:%H|%h|%an|%ae|%aI|%s", "--no-merges"];
  if (since) logArgs.push(`--since=${since}`);
  if (limit) logArgs.push("-n", String(limit));

  const output = git(logArgs, { allowFail: true });
  if (!output) return { commits: [], count: 0, range, currentBranch };

  const commits = output.split("\n").filter(Boolean).map((line) => {
    const [hash, short, author, email, date, ...msgParts] = line.split("|");
    return { hash, short, author, email, date, message: msgParts.join("|") };
  });

  const filesChanged = git(["diff", "--name-only", range], { allowFail: true }) || "";
  const stat = git(["diff", "--stat", range], { allowFail: true }) || "";

  return {
    commits,
    count: commits.length,
    range,
    currentBranch,
    filesChanged: filesChanged ? filesChanged.split("\n").filter(Boolean) : [],
    diffstat: stat,
  };
}

function printText(r) {
  console.log("=== Upstream Sync Status ===\n");
  console.log(`Current branch: ${r.currentBranch}`);
  console.log(`Upstream remote: ${r.remote} (${r.remoteExists ? "configured" : "NOT FOUND"})`);
  console.log(`Upstream branch: ${r.branch}`);

  if (!r.remoteExists) {
    console.log(`\n[!] Remote '${r.remote}' not configured.`);
    console.log(`    ${r.suggestion}`);
    console.log(`    Available remotes: ${r.remotes.join(", ") || "none"}`);
    return;
  }

  if (r.aheadBehind) {
    console.log(`\nLocal is ${r.aheadBehind.ahead} commits ahead, ${r.aheadBehind.behind} commits behind upstream.`);
  }

  if (r.error) { console.log(`\n[!] ${r.error}`); return; }

  console.log(`\nNew upstream commits: ${r.count}`);
  if (r.count === 0) { console.log("Already up to date with upstream!"); return; }

  console.log(`Files changed: ${r.filesChanged.length}\n`);
  console.log("--- Commits ---");
  for (const c of r.commits) {
    console.log(`  ${c.short} ${c.date.slice(0, 10)} ${c.author}: ${c.message}`);
  }

  if (r.filesChanged.length > 0) {
    console.log("\n--- Files Changed ---");
    for (const f of r.filesChanged) console.log(`  ${f}`);
  }

  if (r.diffstat) { console.log("\n--- Diffstat ---"); console.log(r.diffstat); }
}

function run(argv) {
  loadEnv();
  const args = parseArgs(argv || process.argv);
  const remotes = getRemotes();
  const hasUpstream = remotes.some((r) => r.name === args.remote);

  const result = {
    remote: args.remote,
    branch: args.branch,
    remoteExists: hasUpstream,
    remotes: remotes.map((r) => r.name),
    currentBranch: getCurrentBranch(),
  };

  if (!hasUpstream) {
    result.error = `Remote '${args.remote}' not found`;
    result.suggestion = `Add upstream: git remote add ${args.remote} <upstream-url>`;
    result.availableRemotes = remotes;
  } else {
    const fetched = fetchRemote(args.remote);
    if (!fetched) result.fetchWarning = "Failed to fetch upstream. Results may be stale.";
    const counts = getAheadBehind(args.remote, args.branch);
    if (counts) result.aheadBehind = counts;
    Object.assign(result, getNewCommits(args.remote, args.branch, args.since, args.limit));
  }

  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.fetchWarning) console.log(`[!] ${result.fetchWarning}\n`);
    printText(result);
  }
  return result;
}

module.exports = { parseArgs, getAheadBehind, getNewCommits, run };

if (require.main === module) {
  try { run(); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
}
