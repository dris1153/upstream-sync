const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { loadEnv, git, getRemotes, getCurrentBranch, hasUncommittedChanges, getDefaults, loadSyncState, saveSyncState, getBaseCommit } = require("../git-utils");

// Helper: create a temporary git repo for testing
function createTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-sync-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
  // Create initial commit
  fs.writeFileSync(path.join(dir, "README.md"), "# Test Repo\n");
  execSync("git add .", { cwd: dir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', { cwd: dir, stdio: "pipe" });
  return dir;
}

function cleanupTempRepo(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe("git-utils", () => {
  let origCwd;
  let tempDir;

  beforeEach(() => {
    origCwd = process.cwd();
    tempDir = createTempRepo();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanupTempRepo(tempDir);
  });

  describe("git()", () => {
    it("should execute git commands", () => {
      const result = git("status --porcelain");
      assert.strictEqual(result, "");
    });

    it("should return null with allowFail on bad command", () => {
      const result = git("log --oneline nonexistent..HEAD", { allowFail: true });
      assert.strictEqual(result, null);
    });

    it("should throw on bad command without allowFail", () => {
      assert.throws(() => git("checkout nonexistent-branch"));
    });

    it("should return error object with returnError", () => {
      const result = git("checkout nonexistent-branch", { returnError: true });
      assert.strictEqual(result.error, true);
      assert.ok(result.stderr);
    });
  });

  describe("getCurrentBranch()", () => {
    it("should return current branch name", () => {
      const branch = getCurrentBranch();
      assert.ok(typeof branch === "string");
      assert.ok(branch.length > 0);
    });
  });

  describe("getRemotes()", () => {
    it("should return empty array for no remotes", () => {
      const remotes = getRemotes();
      assert.deepStrictEqual(remotes, []);
    });

    it("should return remotes after adding one", () => {
      // Create a bare repo as remote
      const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-sync-bare-"));
      execSync("git init --bare", { cwd: bareDir, stdio: "pipe" });
      execSync(`git remote add origin "${bareDir}"`, { cwd: tempDir, stdio: "pipe" });

      const remotes = getRemotes();
      assert.ok(remotes.length >= 1);
      assert.ok(remotes.some((r) => r.name === "origin"));

      cleanupTempRepo(bareDir);
    });
  });

  describe("hasUncommittedChanges()", () => {
    it("should return false for clean repo", () => {
      assert.strictEqual(hasUncommittedChanges(), false);
    });

    it("should return true for dirty repo", () => {
      fs.writeFileSync(path.join(tempDir, "new-file.txt"), "content");
      assert.strictEqual(hasUncommittedChanges(), true);
    });
  });

  describe("getDefaults()", () => {
    it("should return defaults when no args", () => {
      const defaults = getDefaults({});
      assert.strictEqual(defaults.remote, "upstream");
      assert.strictEqual(defaults.branch, "main");
    });

    it("should use provided args over defaults", () => {
      const defaults = getDefaults({ remote: "origin", branch: "develop" });
      assert.strictEqual(defaults.remote, "origin");
      assert.strictEqual(defaults.branch, "develop");
    });

    it("should respect env vars", () => {
      const origRemote = process.env.UPSTREAM_REMOTE;
      const origBranch = process.env.UPSTREAM_BRANCH;
      process.env.UPSTREAM_REMOTE = "my-upstream";
      process.env.UPSTREAM_BRANCH = "dev";

      const defaults = getDefaults({});
      assert.strictEqual(defaults.remote, "my-upstream");
      assert.strictEqual(defaults.branch, "dev");

      // Restore
      if (origRemote) process.env.UPSTREAM_REMOTE = origRemote; else delete process.env.UPSTREAM_REMOTE;
      if (origBranch) process.env.UPSTREAM_BRANCH = origBranch; else delete process.env.UPSTREAM_BRANCH;
    });
  });

  describe("syncState", () => {
    it("should return null when no state file exists", () => {
      const state = loadSyncState();
      assert.strictEqual(state, null);
    });

    it("should save and load sync state", () => {
      const hash = git(["rev-parse", "HEAD"]);
      saveSyncState(hash, "upstream", "main");

      const state = loadSyncState();
      assert.ok(state);
      assert.strictEqual(state.lastSyncedCommit, hash);
      assert.strictEqual(state.remote, "upstream");
      assert.strictEqual(state.branch, "main");
      assert.ok(state.lastSyncDate);
    });

    it("getBaseCommit should fall back to merge-base when no state", () => {
      // In a repo with no upstream remote, should return no commit
      const base = getBaseCommit("nonexistent", "main");
      assert.strictEqual(base.commit, null);
      assert.strictEqual(base.source, "none");
    });

    it("getBaseCommit should use sync state when available", () => {
      const hash = git(["rev-parse", "HEAD"]);
      saveSyncState(hash, "upstream", "main");

      const base = getBaseCommit("upstream", "main");
      assert.strictEqual(base.commit, hash);
      assert.strictEqual(base.source, "sync-state");
    });
  });

  describe("loadEnv()", () => {
    it("should load env from .env file", () => {
      const envFile = path.join(__dirname, "..", ".env");
      const hadFile = fs.existsSync(envFile);
      const origContent = hadFile ? fs.readFileSync(envFile, "utf-8") : null;

      fs.writeFileSync(envFile, 'TEST_UPSTREAM_VAR="hello_world"\n');
      delete process.env.TEST_UPSTREAM_VAR;
      loadEnv();
      assert.strictEqual(process.env.TEST_UPSTREAM_VAR, "hello_world");

      // Cleanup
      delete process.env.TEST_UPSTREAM_VAR;
      if (hadFile) fs.writeFileSync(envFile, origContent); else fs.unlinkSync(envFile);
    });
  });
});
