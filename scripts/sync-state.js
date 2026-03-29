#!/usr/bin/env node
/**
 * sync-state.js - Manage upstream sync state tracking
 *
 * Tracks the last synced upstream commit so subsequent syncs only show new changes.
 *
 * Usage:
 *   node sync-state.js show                          Show current sync state
 *   node sync-state.js save [--commit <hash>]        Save current upstream HEAD (or specific commit) as last synced
 *   node sync-state.js reset                         Reset sync state (next sync starts from merge-base)
 */

const { loadEnv, git, fetchRemote, getDefaults, validateArg, ensureRemote, loadSyncState, saveSyncState, getBaseCommit, SYNC_STATE_FILE } = require("./git-utils");

function parseArgs(argv) {
  const args = { action: null, remote: null, branch: null, commit: null, format: "text" };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "show": case "save": case "reset":
        args.action = argv[i]; break;
      case "--remote": args.remote = argv[++i]; break;
      case "--branch": args.branch = argv[++i]; break;
      case "--commit": args.commit = argv[++i]; break;
      case "--format": args.format = argv[++i]; break;
      case "--help":
        console.log("Usage: node sync-state.js <show|save|reset> [--remote <name>] [--branch <branch>] [--commit <hash>] [--format json|text]");
        process.exit(0);
    }
  }
  const defaults = getDefaults(args);
  args.remote = defaults.remote;
  args.branch = defaults.branch;
  validateArg(args.remote, "remote");
  validateArg(args.branch, "branch");
  if (args.commit) validateArg(args.commit, "commit");
  return args;
}

function showState(args) {
  const state = loadSyncState();
  const base = getBaseCommit(args.remote, args.branch);

  const result = {
    hasSyncState: !!state,
    syncState: state,
    effectiveBase: base,
  };

  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("=== Sync State ===\n");
    if (state) {
      console.log(`Last synced commit: ${state.lastSyncedCommit.slice(0, 8)}`);
      console.log(`Last sync date:     ${state.lastSyncDate}`);
      console.log(`Remote:             ${state.remote}`);
      console.log(`Branch:             ${state.branch}`);
    } else {
      console.log("No sync state found (first sync or state was reset).");
    }
    console.log(`\nEffective base: ${base.commit ? base.commit.slice(0, 8) : "none"} (source: ${base.source})`);
  }
  return result;
}

function saveState(args) {
  const target = `${args.remote}/${args.branch}`;

  let commitHash = args.commit;
  if (!commitHash) {
    // Default to current upstream HEAD
    commitHash = git(["rev-parse", target], { allowFail: true });
    if (!commitHash) {
      const err = `Cannot resolve ${target}. Run: git fetch ${args.remote}`;
      if (args.format === "json") console.log(JSON.stringify({ error: err }));
      else console.log(`[!] ${err}`);
      return { error: err };
    }
  }

  // Verify commit exists
  if (!git(["rev-parse", commitHash], { allowFail: true })) {
    const err = `Commit ${commitHash} not found.`;
    if (args.format === "json") console.log(JSON.stringify({ error: err }));
    else console.log(`[!] ${err}`);
    return { error: err };
  }

  const stateFile = saveSyncState(commitHash, args.remote, args.branch);

  const result = { saved: true, commit: commitHash, stateFile };
  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Sync state saved: ${commitHash.slice(0, 8)}`);
    console.log(`State file: ${stateFile}`);
  }
  return result;
}

function resetState(args) {
  const fs = require("fs");
  const path = require("path");
  const gitRoot = git(["rev-parse", "--show-toplevel"], { allowFail: true });
  if (!gitRoot) {
    const err = "Not in a git repository";
    if (args.format === "json") console.log(JSON.stringify({ error: err }));
    else console.log(`[!] ${err}`);
    return { error: err };
  }

  const stateFile = path.join(gitRoot, SYNC_STATE_FILE);
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }

  const result = { reset: true };
  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Sync state reset. Next sync will start from merge-base.");
  }
  return result;
}

function run(argv) {
  loadEnv();
  const args = parseArgs(argv || process.argv);

  if (!args.action) {
    console.log("Usage: node sync-state.js <show|save|reset> [options]");
    console.log("Run with --help for details.");
    return { error: "No action specified" };
  }

  // Ensure remote exists for save action
  if (args.action === "save") {
    const remote = ensureRemote(args.remote);
    if (!remote.exists) {
      const err = remote.error;
      if (args.format === "json") console.log(JSON.stringify({ error: err }));
      else console.log(`[!] ${err}`);
      return { error: err };
    }
    fetchRemote(args.remote);
  }

  switch (args.action) {
    case "show": return showState(args);
    case "save": return saveState(args);
    case "reset": return resetState(args);
    default:
      console.log(`Unknown action: ${args.action}`);
      return { error: `Unknown action: ${args.action}` };
  }
}

module.exports = { parseArgs, run };

if (require.main === module) {
  try { run(); } catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }
}
