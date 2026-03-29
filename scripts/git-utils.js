/**
 * git-utils.js - Shared git utilities for upstream-sync scripts
 */

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const SAFE_ARG_RE = /^[a-zA-Z0-9._\-\/~@^:{}]+$/;

function validateArg(value, label) {
  if (value && !SAFE_ARG_RE.test(value)) {
    throw new Error(`Invalid ${label}: "${value}" contains disallowed characters`);
  }
  return value;
}

function loadEnv() {
  const envPaths = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }
    }
  }
}

function git(cmd, opts = {}) {
  const args = typeof cmd === "string" ? cmd.split(/\s+/).filter(Boolean) : cmd;
  try {
    return execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    }).trim();
  } catch (e) {
    if (opts.allowFail) return null;
    if (opts.returnError) return { error: true, stderr: e.stderr || e.message, stdout: e.stdout || "" };
    throw new Error(`git ${args.join(" ")} failed: ${e.stderr || e.message}`);
  }
}

function getRemotes() {
  const output = git(["remote", "-v"]);
  if (!output) return [];
  const remotes = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
    if (match) {
      if (!remotes[match[1]]) remotes[match[1]] = {};
      remotes[match[1]][match[3]] = match[2];
    }
  }
  return Object.entries(remotes).map(([name, urls]) => ({ name, ...urls }));
}

function getCurrentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function fetchRemote(remote) {
  validateArg(remote, "remote");
  const result = git(["fetch", remote], { allowFail: true });
  return result !== null;
}

function hasUncommittedChanges() {
  const status = git(["status", "--porcelain"]);
  return Boolean(status && status.length > 0);
}

function getDefaults(args) {
  return {
    remote: args.remote || process.env.UPSTREAM_REMOTE || "upstream",
    branch: args.branch || process.env.UPSTREAM_BRANCH || "main",
  };
}

function ensureRemote(remoteName) {
  validateArg(remoteName, "remote");
  const remotes = getRemotes();
  if (remotes.some((r) => r.name === remoteName)) return { exists: true };

  const url = process.env.UPSTREAM_URL;
  if (!url) return { exists: false, error: `Remote '${remoteName}' not found and UPSTREAM_URL not configured` };

  const result = git(["remote", "add", remoteName, url], { allowFail: true });
  if (result === null) return { exists: false, error: `Failed to add remote '${remoteName}' with URL: ${url}` };

  return { exists: true, created: true, url };
}

module.exports = { loadEnv, git, getRemotes, getCurrentBranch, fetchRemote, hasUncommittedChanges, getDefaults, validateArg, ensureRemote };
