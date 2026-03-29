const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { parseArgs, parseNameStatus } = require("../upstream-diff");

// Helper: create repos with divergent changes for diff extraction testing
function createDiffRepos() {
  const upstreamDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-bare-"));
  execSync("git init --bare", { cwd: upstreamDir, stdio: "pipe" });

  // Contributor repo (simulates upstream)
  const contribDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-contrib-"));
  execSync("git init", { cwd: contribDir, stdio: "pipe" });
  execSync('git config user.email "contrib@test.com"', { cwd: contribDir, stdio: "pipe" });
  execSync('git config user.name "Contributor"', { cwd: contribDir, stdio: "pipe" });

  fs.writeFileSync(path.join(contribDir, "shared.js"), "function hello() {\n  return 'hello';\n}\n");
  fs.writeFileSync(path.join(contribDir, "utils.js"), "module.exports = { version: 1 };\n");
  execSync("git add .", { cwd: contribDir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', { cwd: contribDir, stdio: "pipe" });
  execSync(`git remote add origin "${upstreamDir}"`, { cwd: contribDir, stdio: "pipe" });
  execSync("git push -u origin master", { cwd: contribDir, stdio: "pipe" });

  // Fork repo
  const forkDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-fork-"));
  execSync(`git clone "${upstreamDir}" "${forkDir}"`, { stdio: "pipe" });
  execSync('git config user.email "fork@test.com"', { cwd: forkDir, stdio: "pipe" });
  execSync('git config user.name "Fork User"', { cwd: forkDir, stdio: "pipe" });
  execSync(`git remote add upstream "${upstreamDir}"`, { cwd: forkDir, stdio: "pipe" });

  // Fork makes local changes
  fs.writeFileSync(path.join(forkDir, "shared.js"), "function hello() {\n  return 'hello from fork';\n}\n");
  fs.writeFileSync(path.join(forkDir, "local-only.js"), "// local feature\n");
  execSync("git add .", { cwd: forkDir, stdio: "pipe" });
  execSync('git commit -m "Local customization"', { cwd: forkDir, stdio: "pipe" });

  // Upstream adds new commits
  fs.writeFileSync(path.join(contribDir, "shared.js"), "function hello() {\n  return 'hello from upstream';\n}\n");
  fs.writeFileSync(path.join(contribDir, "new-feature.js"), "// new upstream feature\nexport default {};\n");
  fs.writeFileSync(path.join(contribDir, "utils.js"), "module.exports = { version: 2 };\n");
  execSync("git add .", { cwd: contribDir, stdio: "pipe" });
  execSync('git commit -m "Upstream improvements"', { cwd: contribDir, stdio: "pipe" });
  execSync("git push origin master", { cwd: contribDir, stdio: "pipe" });

  return { upstreamDir, contribDir, forkDir };
}

function cleanup(...dirs) {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

describe("upstream-diff", () => {
  describe("parseArgs()", () => {
    it("should parse default args", () => {
      const args = parseArgs(["node", "script"]);
      assert.strictEqual(args.remote, "upstream");
      assert.strictEqual(args.branch, "main");
      assert.strictEqual(args.format, "text");
      assert.strictEqual(args.file, null);
      assert.strictEqual(args.commit, null);
      assert.strictEqual(args.filesOnly, false);
      assert.strictEqual(args.context, 5);
    });

    it("should parse custom args", () => {
      const args = parseArgs(["node", "script", "--remote", "origin", "--branch", "develop", "--file", "src/index.js", "--context", "10", "--format", "json"]);
      assert.strictEqual(args.remote, "origin");
      assert.strictEqual(args.branch, "develop");
      assert.strictEqual(args.file, "src/index.js");
      assert.strictEqual(args.context, 10);
      assert.strictEqual(args.format, "json");
    });

    it("should parse --files-only flag", () => {
      const args = parseArgs(["node", "script", "--files-only"]);
      assert.strictEqual(args.filesOnly, true);
    });

    it("should parse --commit flag", () => {
      const args = parseArgs(["node", "script", "--commit", "abc123"]);
      assert.strictEqual(args.commit, "abc123");
    });
  });

  describe("parseNameStatus()", () => {
    it("should parse added files", () => {
      const result = parseNameStatus("A\tnew-file.js");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, "new-file.js");
      assert.strictEqual(result[0].status, "added");
    });

    it("should parse modified files", () => {
      const result = parseNameStatus("M\texisting.js");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, "existing.js");
      assert.strictEqual(result[0].status, "modified");
    });

    it("should parse deleted files", () => {
      const result = parseNameStatus("D\tremoved.js");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, "removed.js");
      assert.strictEqual(result[0].status, "deleted");
    });

    it("should parse renamed files", () => {
      const result = parseNameStatus("R100\told-name.js\tnew-name.js");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, "new-name.js");
      assert.strictEqual(result[0].oldPath, "old-name.js");
      assert.strictEqual(result[0].status, "renamed");
    });

    it("should parse multiple files", () => {
      const result = parseNameStatus("A\ta.js\nM\tb.js\nD\tc.js");
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].status, "added");
      assert.strictEqual(result[1].status, "modified");
      assert.strictEqual(result[2].status, "deleted");
    });

    it("should handle empty input", () => {
      assert.deepStrictEqual(parseNameStatus(""), []);
      assert.deepStrictEqual(parseNameStatus(null), []);
    });
  });

  describe("getAllDiffs() with real repos", () => {
    let repos;
    let origCwd;

    beforeEach(() => {
      origCwd = process.cwd();
      repos = createDiffRepos();
      process.chdir(repos.forkDir);
    });

    afterEach(() => {
      process.chdir(origCwd);
      cleanup(repos.upstreamDir, repos.contribDir, repos.forkDir);
    });

    it("should list all upstream-changed files", () => {
      const { run } = require("../upstream-diff");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--files-only", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.count >= 2);
      const paths = result.files.map((f) => f.path);
      assert.ok(paths.includes("new-feature.js"), "should include new-feature.js");
      assert.ok(paths.includes("shared.js") || paths.includes("utils.js"), "should include modified files");
    });

    it("should include diff content for each file", () => {
      const { run } = require("../upstream-diff");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.files.length >= 1);
      for (const f of result.files) {
        assert.ok(typeof f.diff === "string", `file ${f.path} should have diff string`);
        assert.ok(typeof f.status === "string", `file ${f.path} should have status`);
      }
    });

    it("should include upstream content for added/modified files", () => {
      const { run } = require("../upstream-diff");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      const newFile = result.files.find((f) => f.path === "new-feature.js");
      assert.ok(newFile, "should find new-feature.js");
      assert.ok(newFile.upstreamContent, "new file should have upstream content");
      assert.ok(newFile.upstreamContent.includes("new upstream feature"));
    });

    it("should filter by specific file", () => {
      const { run } = require("../upstream-diff");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--file", "shared.js", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.files[0].path, "shared.js");
    });

    it("should detect file status correctly", () => {
      const { run } = require("../upstream-diff");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--format", "json", "--branch", "master"]);
      console.log = origLog;

      const newFile = result.files.find((f) => f.path === "new-feature.js");
      if (newFile) assert.strictEqual(newFile.status, "added");

      const modFile = result.files.find((f) => f.path === "shared.js");
      if (modFile) assert.strictEqual(modFile.status, "modified");
    });

    it("should support specific commit diff", () => {
      execSync("git fetch upstream", { cwd: repos.forkDir, stdio: "pipe" });
      const hash = execSync('git log upstream/master -1 --format=%H', {
        cwd: repos.forkDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      const { run } = require("../upstream-diff");
      const origLog = console.log;
      console.log = () => {};
      const result = run(["node", "script", "--commit", hash, "--format", "json", "--branch", "master"]);
      console.log = origLog;

      assert.ok(result.commit, "should include commit info");
      assert.strictEqual(result.commit.hash, hash);
      assert.ok(result.files.length >= 1, "should have changed files");
    });
  });
});
