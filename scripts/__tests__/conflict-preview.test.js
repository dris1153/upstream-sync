const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { parseArgs } = require("../conflict-preview");

// Helper: create repos with divergent changes for conflict testing
function createConflictRepos() {
  // Create "upstream" bare repo
  const upstreamDir = fs.mkdtempSync(path.join(os.tmpdir(), "conflict-bare-"));
  execSync("git init --bare", { cwd: upstreamDir, stdio: "pipe" });

  // Create "contributor" repo - simulates upstream contributors
  const contribDir = fs.mkdtempSync(path.join(os.tmpdir(), "conflict-contrib-"));
  execSync("git init", { cwd: contribDir, stdio: "pipe" });
  execSync('git config user.email "contrib@test.com"', { cwd: contribDir, stdio: "pipe" });
  execSync('git config user.name "Contributor"', { cwd: contribDir, stdio: "pipe" });

  // Create shared file
  fs.writeFileSync(path.join(contribDir, "shared.js"), "function hello() {\n  return 'hello';\n}\n");
  fs.writeFileSync(path.join(contribDir, "upstream-only.js"), "// upstream only\n");
  execSync("git add .", { cwd: contribDir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', { cwd: contribDir, stdio: "pipe" });
  execSync(`git remote add origin "${upstreamDir}"`, { cwd: contribDir, stdio: "pipe" });
  execSync("git push -u origin master", { cwd: contribDir, stdio: "pipe" });

  // Create "fork" repo
  const forkDir = fs.mkdtempSync(path.join(os.tmpdir(), "conflict-fork-"));
  execSync(`git clone "${upstreamDir}" "${forkDir}"`, { stdio: "pipe" });
  execSync('git config user.email "fork@test.com"', { cwd: forkDir, stdio: "pipe" });
  execSync('git config user.name "Fork User"', { cwd: forkDir, stdio: "pipe" });
  execSync(`git remote add upstream "${upstreamDir}"`, { cwd: forkDir, stdio: "pipe" });

  // Fork makes local changes to shared.js
  fs.writeFileSync(path.join(forkDir, "shared.js"), "function hello() {\n  return 'hello from fork';\n}\n");
  fs.writeFileSync(path.join(forkDir, "local-only.js"), "// local feature\n");
  execSync("git add .", { cwd: forkDir, stdio: "pipe" });
  execSync('git commit -m "Local customization"', { cwd: forkDir, stdio: "pipe" });

  // Upstream contributor also changes shared.js
  fs.writeFileSync(path.join(contribDir, "shared.js"), "function hello() {\n  return 'hello from upstream';\n}\n");
  fs.writeFileSync(path.join(contribDir, "new-upstream.js"), "// new upstream feature\n");
  execSync("git add .", { cwd: contribDir, stdio: "pipe" });
  execSync('git commit -m "Upstream changes"', { cwd: contribDir, stdio: "pipe" });
  execSync("git push origin master", { cwd: contribDir, stdio: "pipe" });

  return { upstreamDir, contribDir, forkDir };
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

describe("conflict-preview", () => {
  describe("parseArgs()", () => {
    it("should parse default args", () => {
      const args = parseArgs(["node", "script"]);
      assert.strictEqual(args.remote, "upstream");
      assert.strictEqual(args.branch, "main");
      assert.strictEqual(args.strategy, "merge");
      assert.strictEqual(args.format, "text");
      assert.strictEqual(args.commit, null);
    });

    it("should parse custom args", () => {
      const args = parseArgs(["node", "script", "--remote", "origin", "--strategy", "rebase", "--commit", "abc123", "--format", "json"]);
      assert.strictEqual(args.remote, "origin");
      assert.strictEqual(args.strategy, "rebase");
      assert.strictEqual(args.commit, "abc123");
      assert.strictEqual(args.format, "json");
    });
  });

  describe("previewMergeConflicts() with real repos", () => {
    let repos;
    let origCwd;

    beforeEach(() => {
      origCwd = process.cwd();
      repos = createConflictRepos();
      process.chdir(repos.forkDir);
    });

    afterEach(() => {
      process.chdir(origCwd);
      cleanup(repos.upstreamDir, repos.contribDir, repos.forkDir);
    });

    it("should detect overlapping files", () => {
      const { run } = require("../conflict-preview");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      // shared.js should appear in conflicts or safeOverlaps
      const allOverlaps = [...(result.conflicts || []), ...(result.safeOverlaps || [])];
      assert.ok(allOverlaps.some((f) => f.file === "shared.js"), "shared.js should be in overlapping files");
    });

    it("should identify upstream-only files", () => {
      const { run } = require("../conflict-preview");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.upstreamOnly.includes("new-upstream.js"), "new-upstream.js should be upstream-only");
    });

    it("should identify local-only files", () => {
      const { run } = require("../conflict-preview");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.localOnly.includes("local-only.js"), "local-only.js should be local-only");
    });

    it("should provide recommendation", () => {
      const { run } = require("../conflict-preview");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.summary);
      assert.ok(["SAFE_TO_MERGE", "MERGE_WITH_MANUAL_RESOLUTION", "CONSIDER_CHERRY_PICK"].includes(result.summary.recommendation));
    });

    it("should support rebase strategy", () => {
      const { run } = require("../conflict-preview");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--strategy", "rebase", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.strictEqual(result.strategy, "rebase");
      assert.ok(typeof result.localCommitsToReplay === "number");
    });
  });
});
