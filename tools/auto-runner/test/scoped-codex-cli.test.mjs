import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveCodexCommand, runCodexPrompt } from "../lib/codex-runner.mjs";
import { collectReport } from "../lib/report-collector.mjs";
import { CODEX_BINARY, runScopedCodexCli, scopedCodexModel } from "../lib/scoped-codex-cli.mjs";

function fixture(run) {
  const parent = mkdtempSync(path.join(os.tmpdir(), "settleora-scoped-cli-"));
  const root = path.join(parent, "task");
  const logsRoot = path.join(parent, "logs");
  mkdirSync(root);
  mkdirSync(logsRoot, { mode: 0o700 });
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
  assert.equal(resolveCodexCommand("codex", () => {}).command, CODEX_BINARY);
  const example = JSON.parse(readFileSync("tools/auto-runner/runner-config.example.json", "utf8"));
  assert.deepEqual([example.codexCommand, example.reviewerCommand, example.reviewerTiers.codex_mechanics.command],
    ["codex", "codex", "codex"]);
  const fd = openSync(CODEX_BINARY, "r");
  const magic = Buffer.alloc(4);
  try { assert.equal(readSync(fd, magic, 0, 4, 0), 4); } finally { closeSync(fd); }
  assert.deepEqual([...magic], [0x7f, 0x45, 0x4c, 0x46]); // Native ELF, not the npm JS launcher.
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
  assert.equal(launch.command, "/usr/bin/flock");
  assert.deepEqual(launch.args.slice(0, 6), ["--exclusive", "--nonblock", "--conflict-exit-code", "75",
    path.join(logsRoot, ".scoped-codex-cli-launch.lock"), "/usr/bin/timeout"]);
  assert.deepEqual(launch.args.slice(6, 10), ["--signal=TERM", "--kill-after=10s", "3600s", CODEX_BINARY]);
  assert.equal(launch.args[launch.args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(launch.args[launch.args.indexOf("--cd") + 1], root);
  assert.equal(launch.args[launch.args.indexOf("--model") + 1], "gpt-6.1-sol");
  assert.ok(launch.args.includes("--ignore-user-config"));
  assert.ok(launch.args.includes("--ignore-rules"));
  assert.ok(launch.args.includes('shell_environment_policy.inherit="none"'));
  assert.ok(launch.args.some((arg) => arg.startsWith("shell_environment_policy.set=")
    && arg.includes(`PUB_CACHE=${JSON.stringify(path.join(logsRoot, "caches", "pub"))}`)));
  assert.ok(!launch.args.some((arg) => arg.includes("bypass")));
  assert.equal(launch.options.cwd, root);
  assert.equal(launch.options.input, "Change only task.txt");
  assert.deepEqual(Object.keys(launch.options.env).sort(), ["CODEX_HOME", "DOTNET_CLI_HOME", "GRADLE_USER_HOME",
    "HOME", "LANG", "LC_ALL", "LOGNAME", "NUGET_PACKAGES", "PATH", "PUB_CACHE", "TMPDIR", "USER", "XDG_CACHE_HOME"]);
  assert.equal(lstatSync(path.join(logsRoot, ".scoped-codex-cli-launch.lock")).isFile(), true);
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

test("controller captures through a pinned descriptor and atomically replaces a report symlink", () => fixture(({ config, root }) => {
  const reportPath = path.join(root, ".codex", "reports", "settleora-codex-report-test.md");
  const victim = path.join(root, "task.txt");
  let args;
  invoke(config, { reportPath, spawnImpl: (_command, observed, options) => {
    args = observed;
    symlinkSync(victim, reportPath);
    writeFileSync(`/proc/self/fd/${options.stdio[3]}`, "Status: success\n");
    return { status: 0 };
  } });
  assert.equal(args[args.indexOf("--output-last-message") + 1], "/proc/self/fd/3");
  assert.equal(readFileSync(reportPath, "utf8"), "Status: success\n");
  assert.equal(lstatSync(reportPath).isSymbolicLink(), false);
  assert.equal(readFileSync(victim, "utf8"), "baseline\n");
  assert.throws(() => invoke(config, { reportPath: path.join(root, "other.md") }), /report_path_untrusted/);
  assert.throws(() => runScopedCodexCli(config, { purpose: "review", prompt: "Review", expectedHead: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), reportPath,
    stdoutFd: 1, stderrFd: 2, spawnImpl: () => assert.fail("must not launch") }), /report_path_untrusted/);
  assert.throws(() => invoke(config, { purpose: "review-fix", reportPath }), /report_path_untrusted/);
}));

test("review fixes cannot overwrite the implementation report", () => fixture(({ config, root, head, logsRoot }) => {
  mkdirSync(path.join(logsRoot, "codex-runs"));
  const reportPath = path.join(root, ".codex", "reports", "settleora-codex-report-test.md");
  let passedReportPath = "unexpected";
  const result = runCodexPrompt(config, { prompt: "Fix one issue", promptPath: "fixture", branchName: "main",
    expectedHeadSha: head, reportPath }, "review-fix", (_config, invocation) => {
    passedReportPath = invocation.reportPath;
    return { status: 0 };
  });
  assert.equal(result.status, 0);
  assert.equal(passedReportPath, null);
}));

test("report collection reads a regular file and refuses a substituted symlink", () => fixture(({ config, root }) => {
  const reportRoot = path.join(root, ".codex", "reports");
  mkdirSync(reportRoot, { recursive: true });
  const reportPath = path.join(reportRoot, "settleora-codex-report-test.md");
  writeFileSync(reportPath, "Status: success\n");
  const collected = collectReport(config, { reportPath });
  assert.equal(collected.found, true);
  assert.equal(readFileSync(collected.copyPath, "utf8"), "Status: success\n");
  rmSync(reportPath);
  symlinkSync(path.join(root, "task.txt"), reportPath);
  assert.equal(collectReport(config, { reportPath }).found, false);
  assert.equal(readFileSync(collected.copyPath, "utf8"), "Status: success\n");
}));

test("wrong branch, repository, and bypass wrapper fail before launch", () => fixture(({ config }) => {
  const blocked = () => assert.fail("must not launch");
  assert.throws(() => invoke(config, { branchName: "other", spawnImpl: blocked }), /checkout_identity_mismatch/);
  assert.throws(() => invoke({ ...config, repositorySlug: "other/repo" }, { spawnImpl: blocked }),
    /checkout_repository_mismatch/);
  assert.throws(() => invoke({ ...config, codexCommand: "codex-vm-full" }, { spawnImpl: blocked }),
    /unsafe_command_configured/);
}));

test("GitHub repository casing does not block the same repository", () => fixture(({ config, git }) => {
  git("remote", "set-url", "origin", "git@github.com:tommytang213/settleora.git");
  assert.equal(invoke(config).status, 0);
}));

test("project Codex config cannot add capabilities to scoped runs", () => fixture(({ config, root }) => {
  mkdirSync(path.join(root, ".codex"));
  writeFileSync(path.join(root, ".codex", "config.toml"), "[mcp_servers.example]\ncommand = 'bad'\n");
  assert.throws(() => invoke(config, { spawnImpl: () => assert.fail("must not launch") }),
    /project_codex_config_untrusted/);
}));

test("a retained lock file is reusable after the OS lock is released", () => fixture(({ config, logsRoot }) => {
  const lock = path.join(logsRoot, ".scoped-codex-cli-launch.lock");
  writeFileSync(lock, "", { mode: 0o600 });
  let args;
  invoke(config, { spawnImpl: (_command, observed) => { args = observed; return { status: 0 }; } });
  assert.equal(args[4], lock);
  assert.equal(spawnSync("/usr/bin/flock", ["--exclusive", "--nonblock", lock, "/usr/bin/true"]).status, 0);
  assert.equal(existsSync(lock), true);
}));

test("an unsafe lock file fails before launch", () => fixture(({ config, logsRoot }) => {
  const lock = path.join(logsRoot, ".scoped-codex-cli-launch.lock");
  symlinkSync(path.join(logsRoot, "other"), lock);
  assert.throws(() => invoke(config, { spawnImpl: () => assert.fail("must not launch") }), /launch_lock_untrusted/);
}));

test("a CLI commit or checkout switch invalidates the launch result", () => fixture(({ config, git, root }) => {
  assert.throws(() => invoke(config, { spawnImpl: () => {
    writeFileSync(path.join(root, "task.txt"), "committed by CLI\n");
    git("add", "task.txt");
    git("commit", "-qm", "unexpected");
    return { status: 0 };
  } }), /checkout_identity_mismatch/);
}));
