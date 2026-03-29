const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { parseArgs } = require("../sync-state");

function createTestRepos() {
  const upstreamDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-state-bare-"));
  execSync("git init --bare", { cwd: upstreamDir, stdio: "pipe" });

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-state-work-"));
  execSync("git init", { cwd: workDir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: workDir, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: workDir, stdio: "pipe" });
  fs.writeFileSync(path.join(workDir, "README.md"), "# Test\n");
  execSync("git add .", { cwd: workDir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', { cwd: workDir, stdio: "pipe" });
  execSync(`git remote add origin "${upstreamDir}"`, { cwd: workDir, stdio: "pipe" });
  execSync("git push -u origin master", { cwd: workDir, stdio: "pipe" });

  const forkDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-state-fork-"));
  execSync(`git clone "${upstreamDir}" "${forkDir}"`, { stdio: "pipe" });
  execSync('git config user.email "fork@test.com"', { cwd: forkDir, stdio: "pipe" });
  execSync('git config user.name "Fork User"', { cwd: forkDir, stdio: "pipe" });
  execSync(`git remote add upstream "${upstreamDir}"`, { cwd: forkDir, stdio: "pipe" });

  return { upstreamDir, workDir, forkDir };
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

describe("sync-state", () => {
  describe("parseArgs()", () => {
    it("should parse show action", () => {
      const args = parseArgs(["node", "script", "show"]);
      assert.strictEqual(args.action, "show");
      assert.strictEqual(args.remote, "upstream");
      assert.strictEqual(args.branch, "main");
    });

    it("should parse save action with commit", () => {
      const args = parseArgs(["node", "script", "save", "--commit", "abc123"]);
      assert.strictEqual(args.action, "save");
      assert.strictEqual(args.commit, "abc123");
    });

    it("should parse reset action", () => {
      const args = parseArgs(["node", "script", "reset"]);
      assert.strictEqual(args.action, "reset");
    });
  });

  describe("run() with real repos", () => {
    let repos;
    let origCwd;

    beforeEach(() => {
      origCwd = process.cwd();
      repos = createTestRepos();
      process.chdir(repos.forkDir);
    });

    afterEach(() => {
      process.chdir(origCwd);
      cleanup(repos.upstreamDir, repos.workDir, repos.forkDir);
    });

    it("should show no state initially", () => {
      const { run } = require("../sync-state");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "show", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.strictEqual(result.hasSyncState, false);
      assert.strictEqual(result.syncState, null);
    });

    it("should save and retrieve state", () => {
      const { run } = require("../sync-state");
      const origLog = console.log;
      console.log = () => {};

      // Save state
      const saveResult = run(["node", "script", "save", "--format", "json", "--branch", "master"]);
      assert.strictEqual(saveResult.saved, true);
      assert.ok(saveResult.commit);

      // Show state
      const showResult = run(["node", "script", "show", "--format", "json", "--branch", "master"]);
      assert.strictEqual(showResult.hasSyncState, true);
      assert.strictEqual(showResult.syncState.lastSyncedCommit, saveResult.commit);

      console.log = origLog;
    });

    it("should reset state", () => {
      const { run } = require("../sync-state");
      const origLog = console.log;
      console.log = () => {};

      // Save then reset
      run(["node", "script", "save", "--format", "json", "--branch", "master"]);
      const resetResult = run(["node", "script", "reset", "--format", "json"]);
      assert.strictEqual(resetResult.reset, true);

      // Verify reset
      const showResult = run(["node", "script", "show", "--format", "json", "--branch", "master"]);
      assert.strictEqual(showResult.hasSyncState, false);

      console.log = origLog;
    });
  });
});
