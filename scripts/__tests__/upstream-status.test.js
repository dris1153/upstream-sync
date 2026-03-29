const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { parseArgs } = require("../upstream-status");

// Helper: create a temp repo with an upstream remote
function createTestRepos() {
  // Create "upstream" bare repo
  const upstreamDir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-bare-"));
  execSync("git init --bare", { cwd: upstreamDir, stdio: "pipe" });

  // Create "working" repo that clones from upstream
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-work-"));
  execSync("git init", { cwd: workDir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: workDir, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: workDir, stdio: "pipe" });
  fs.writeFileSync(path.join(workDir, "README.md"), "# Test\n");
  execSync("git add .", { cwd: workDir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', { cwd: workDir, stdio: "pipe" });
  execSync(`git remote add origin "${upstreamDir}"`, { cwd: workDir, stdio: "pipe" });
  execSync("git push -u origin master", { cwd: workDir, stdio: "pipe" });

  // Create "fork" repo that simulates user's fork
  const forkDir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-fork-"));
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

describe("upstream-status", () => {
  describe("parseArgs()", () => {
    it("should parse default args", () => {
      const args = parseArgs(["node", "script"]);
      assert.strictEqual(args.remote, "upstream");
      assert.strictEqual(args.branch, "main");
      assert.strictEqual(args.format, "text");
      assert.strictEqual(args.limit, 50);
      assert.strictEqual(args.since, null);
    });

    it("should parse custom args", () => {
      const args = parseArgs(["node", "script", "--remote", "origin", "--branch", "develop", "--format", "json", "--limit", "10", "--since", "2024-01-01"]);
      assert.strictEqual(args.remote, "origin");
      assert.strictEqual(args.branch, "develop");
      assert.strictEqual(args.format, "json");
      assert.strictEqual(args.limit, 10);
      assert.strictEqual(args.since, "2024-01-01");
    });
  });

  describe("run() with real git repos", () => {
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

    it("should detect upstream remote", () => {
      const { run } = require("../upstream-status");
      // Suppress console output
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.strictEqual(result.remoteExists, true);
      assert.strictEqual(result.remote, "upstream");
    });

    it("should report missing remote", () => {
      const { run } = require("../upstream-status");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--remote", "nonexistent", "--format", "json"]);
      console.log = origLog;

      assert.strictEqual(result.remoteExists, false);
      assert.ok(result.error.includes("not found"));
    });

    it("should detect new upstream commits", () => {
      // Add a commit to upstream via workDir
      fs.writeFileSync(path.join(repos.workDir, "new-feature.js"), "// new feature\n");
      execSync("git add .", { cwd: repos.workDir, stdio: "pipe" });
      execSync('git commit -m "Add new feature"', { cwd: repos.workDir, stdio: "pipe" });
      execSync("git push origin master", { cwd: repos.workDir, stdio: "pipe" });

      const { run } = require("../upstream-status");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.count >= 1);
      assert.ok(result.commits.length >= 1);
      assert.ok(result.filesChanged.includes("new-feature.js"));
    });
  });
});
