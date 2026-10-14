import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveCodexCommand } from "../lib/codex-runner.mjs";
import { runScopedCodexCli, scopedCodexModel } from "../lib/scoped-codex-cli.mjs";

function fixture(run) {
  const parent = mkdtempSync(path.join(os.tmpdir(), "settleora-scoped-cli-"));
  const root = path.join(parent, "task");
  const logsRoot = path.join(parent, "logs");
  mkdirSync(root);
  mkdirSync(logsRoot);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Scoped CLI Test");
    git("config", "user.email", "scoped-cli-test@localhost");
    git("remote", "add", "origin", "git@github.com:tommytang213/Settleora.git");
    writeFileSync(path.join(root, "task.txt"), "baseline\n");
    git("add", "task.txt");
    git("commit", "-qm", "baseline");
    const config = { repoRoot: root, logsRoot, repositorySlug: "tommytang213/Settleora",
      codexCommand: "codex", reviewerCommand: "codex" };
    return run({ config, root, logsRoot, head: git("rev-parse", "HEAD"), git });
  } finally { rmSync(parent, { recursive: true, force: true }); }
}

const invoke = (config, extra = {}) => runScopedCodexCli(config, {
  purpose: "implementation", prompt: "Change only task.txt", branchName: "main",
  expectedHead: execFileSync("git", ["-C", config.repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  stdoutFd: 1, stderrFd: 2, spawnImpl: () => ({ status: 0 }), ...extra,
});

test("preflight resolution accepts only the fixed CLI binary", () => {
  assert.equal(resolveCodexCommand("codex", () => {}).command, "/home/tommytang213/.npm-global/bin/codex");
  assert.throws(() => resolveCodexCommand("codex-vm-full"), /unsafe_command_configured/);
});

test("model selection preserves routine and time-bounded critical policy", () => {
  assert.deepEqual(scopedCodexModel("routine"), { model: "gpt-6.1-sol", effort: "medium" });
  assert.deepEqual(scopedCodexModel("critical", Date.parse("2026-10-14T00:00:00Z")),
    { model: "gpt-6-astra", effort: "xhigh" });
  assert.deepEqual(scopedCodexModel("critical", Date.parse("2027-01-01T00:00:00Z")),
    { model: "gpt-6.1-sol", effort: "medium" });
  assert.deepEqual(scopedCodexModel("review"), { model: "gpt-6.1-sol", effort: "xhigh" });
});

test("implementation uses fixed scoped arguments and a bounded process", () => fixture(({ config, head, root, logsRoot }) => {
  let launch;
  const result = invoke(config, { expectedHead: head, spawnImpl: (command, args, options) => {
    launch = { command, args, options };
    writeFileSync(path.join(root, "task.txt"), "changed without a commit\n");
    return { status: 0 };
  } });
  assert.equal(result.status, 0);
  assert.equal(launch.command, "/usr/bin/timeout");
  assert.deepEqual(launch.args.slice(0, 4), ["--signal=TERM", "--kill-after=10s", "3600s",
    "/home/tommytang213/.npm-global/bin/codex"]);
  assert.equal(launch.args[launch.args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(launch.args[launch.args.indexOf("--cd") + 1], root);
  assert.equal(launch.args[launch.args.indexOf("--model") + 1], "gpt-6.1-sol");
  assert.ok(!launch.args.some((arg) => arg.includes("bypass")));
  assert.equal(launch.options.cwd, root);
  assert.equal(launch.options.input, "Change only task.txt");
  assert.equal(existsSync(path.join(logsRoot, ".scoped-codex-cli-launch.lock")), false);
}));

test("review is read-only and bound to the candidate head", () => fixture(({ config, head }) => {
  let args;
  runScopedCodexCli(config, { purpose: "review", prompt: "Review this head", expectedHead: head,
    stdoutFd: 1, stderrFd: 2,
    spawnImpl: (_command, observed) => { args = observed; return { status: 0 }; } });
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(args[args.indexOf("--model") + 1], "gpt-6.1-sol");
  assert.ok(args.includes("1800s"));
  assert.throws(() => runScopedCodexCli(config, { purpose: "review", prompt: "Review", expectedHead: "0".repeat(40),
    stdoutFd: 1, stderrFd: 2, spawnImpl: () => assert.fail("must not launch") }),
  /checkout_identity_mismatch/);
}));

test("SHA-bound recovery review accepts detached HEAD but mutation does not", () => fixture(({ config, head, git }) => {
  git("switch", "--detach", head);
  const review = runScopedCodexCli(config, { purpose: "review", prompt: "Review detached candidate", expectedHead: head,
    stdoutFd: 1, stderrFd: 2, spawnImpl: () => ({ status: 0 }) });
  assert.equal(review.checkout.branch, null);
  assert.throws(() => invoke(config), /checkout_identity_mismatch/);
}));

test("controller-owned report output is bound to the protected report directory", () => fixture(({ config, root }) => {
  const reportPath = path.join(root, ".codex", "reports", "settleora-codex-report-test.md");
  let args;
  invoke(config, { reportPath, spawnImpl: (_command, observed) => { args = observed; return { status: 0 }; } });
  assert.equal(args[args.indexOf("--output-last-message") + 1], reportPath);
  assert.throws(() => invoke(config, { reportPath: path.join(root, "other.md") }), /report_path_untrusted/);
  assert.throws(() => runScopedCodexCli(config, { purpose: "review", prompt: "Review", expectedHead: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), reportPath,
    stdoutFd: 1, stderrFd: 2, spawnImpl: () => assert.fail("must not launch") }), /report_path_untrusted/);
}));

test("wrong branch, repository, and bypass wrapper fail before launch", () => fixture(({ config }) => {
  const blocked = () => assert.fail("must not launch");
  assert.throws(() => invoke(config, { branchName: "other", spawnImpl: blocked }), /checkout_identity_mismatch/);
  assert.throws(() => invoke({ ...config, repositorySlug: "other/repo" }, { spawnImpl: blocked }),
    /checkout_repository_mismatch/);
  assert.throws(() => invoke({ ...config, codexCommand: "codex-vm-full" }, { spawnImpl: blocked }),
    /unsafe_command_configured/);
}));

test("duplicate launch fails closed while the first launch owns the lock", () => fixture(({ config, logsRoot }) => {
  invoke(config, { spawnImpl: () => {
    assert.throws(() => invoke(config), /duplicate_launch_or_stale_lock/);
    return { status: 0 };
  } });
  assert.equal(existsSync(path.join(logsRoot, ".scoped-codex-cli-launch.lock")), false);
}));

test("a CLI commit or checkout switch invalidates the launch result", () => fixture(({ config, git, root }) => {
  assert.throws(() => invoke(config, { spawnImpl: () => {
    writeFileSync(path.join(root, "task.txt"), "committed by CLI\n");
    git("add", "task.txt");
    git("commit", "-qm", "unexpected");
    return { status: 0 };
  } }), /checkout_identity_mismatch/);
}));
