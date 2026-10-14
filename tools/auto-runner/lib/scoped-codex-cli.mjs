import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CODEX_BINARY = "/home/tommytang213/.npm-global/bin/codex";
const criticalUntil = Date.parse("2026-12-31T16:00:00Z"); // 2027-01-01 in Hong Kong.

function fail(reason) { throw new Error(`scoped_codex_cli:${reason}`); }

function trustedLaunchLock(logsRoot) {
  const lock = path.join(logsRoot, ".scoped-codex-cli-launch.lock");
  try {
    closeSync(openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600));
  } catch (error) {
    if (error?.code !== "EEXIST") fail("launch_lock_unavailable");
  }
  const info = lstatSync(lock);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    fail("launch_lock_untrusted");
  }
  return lock;
}

function openReportCapture(logsRoot) {
  const capturePath = path.join(logsRoot, `.scoped-codex-report-${randomUUID()}`);
  const fd = openSync(capturePath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { unlinkSync(capturePath); }
  catch (error) { closeSync(fd); throw error; }
  return fd;
}

function publishReport(captureFd, reportPath, reportRoot) {
  const capture = fstatSync(captureFd);
  if (!capture.isFile() || capture.size > 1024 * 1024) fail("report_capture_untrusted");
  const report = readFileSync(captureFd);
  if (!report.length) fail("report_capture_empty");
  if (realpathSync(reportRoot) !== reportRoot) fail("report_path_untrusted");
  const dirFd = openSync(reportRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let temporary = null;
  try {
    const directory = fstatSync(dirFd);
    if (!directory.isDirectory() || (typeof process.getuid === "function" && directory.uid !== process.getuid())) {
      fail("report_path_untrusted");
    }
    const pinnedRoot = `/proc/self/fd/${dirFd}`;
    temporary = `${pinnedRoot}/.settleora-codex-report-${randomUUID()}.tmp`;
    const fileFd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      writeFileSync(fileFd, report);
      fsyncSync(fileFd);
    } finally { closeSync(fileFd); }
    renameSync(temporary, `${pinnedRoot}/${path.basename(reportPath)}`);
    temporary = null;
    const current = statSync(reportRoot);
    if (current.dev !== directory.dev || current.ino !== directory.ino) fail("report_path_changed");
  } finally {
    if (temporary) { try { rmSync(temporary); } catch { /* Preserve the first error. */ } }
    closeSync(dirFd);
  }
}

function git(root, ...args) {
  try {
    return execFileSync("/usr/bin/git", ["-C", root, ...args], {
      encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { fail("checkout_unavailable"); }
}

function gitBranch(root) {
  const result = spawnSync("/usr/bin/git", ["-C", root, "symbolic-ref", "-q", "--short", "HEAD"], {
    encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status === 0 && !result.error) return result.stdout.trim();
  if (result.status === 1 && !result.error && !result.signal) return null;
  fail("checkout_unavailable");
}

function repositorySlug(origin) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(origin);
  if (!match) fail("repository_origin_untrusted");
  return match[1];
}

export function verifyScopedCheckout(config, { branchName = null, expectedHead = null } = {}) {
  const root = path.resolve(config.repoRoot || "");
  if (!path.isAbsolute(config.repoRoot || "") || realpathSync(root) !== root ||
      git(root, "rev-parse", "--show-toplevel") !== root) fail("checkout_root_untrusted");
  if (repositorySlug(git(root, "remote", "get-url", "origin")) !== config.repositorySlug) {
    fail("checkout_repository_mismatch");
  }
  const branch = gitBranch(root);
  const head = git(root, "rev-parse", "HEAD");
  if ((branchName && branch !== branchName) || (expectedHead && head !== expectedHead)) {
    fail("checkout_identity_mismatch");
  }
  return { root, branch, head };
}

export function scopedCodexModel(mode, now = Date.now()) {
  if (mode === "critical" && now < criticalUntil) {
    return { model: "gpt-6-astra", effort: "xhigh" };
  }
  if (mode === "critical" || mode === "routine") {
    return { model: "gpt-6.1-sol", effort: "medium" };
  }
  if (mode === "review") return { model: "gpt-6.1-sol", effort: "xhigh" };
  fail("model_mode_unrecognized");
}

export function runScopedCodexCli(config, {
  purpose, prompt, branchName = null, expectedHead = null, modelMode = "routine", reportPath = null,
  stdoutFd, stderrFd, spawnImpl = spawnSync, now = Date.now(),
}) {
  if (config.codexCommand !== "codex" && config.codexCommand !== CODEX_BINARY &&
      config.reviewerCommand !== "codex" && config.reviewerCommand !== CODEX_BINARY) {
    fail("unsafe_command_configured");
  }
  const selectedCommand = purpose === "review" ? config.reviewerCommand : config.codexCommand;
  if (selectedCommand !== "codex" && selectedCommand !== CODEX_BINARY) fail("unsafe_command_configured");
  if (typeof prompt !== "string" || !prompt.trim()) fail("empty_prompt");
  if (purpose !== "implementation" && purpose !== "review-fix" && purpose !== "review") {
    fail("purpose_unrecognized");
  }
  if (purpose !== "review" && !branchName) fail("branch_binding_missing");
  if (!expectedHead) fail("head_binding_missing");
  const checkout = verifyScopedCheckout(config, { branchName, expectedHead });
  if (reportPath !== null) {
    if (purpose !== "implementation" || typeof reportPath !== "string"
        || path.dirname(reportPath) !== path.join(checkout.root, ".codex", "reports")
        || !path.basename(reportPath).startsWith("settleora-codex-report-")
        || !reportPath.endsWith(".md")) fail("report_path_untrusted");
    const reportRoot = path.dirname(reportPath);
    mkdirSync(reportRoot, { recursive: true, mode: 0o700 });
    if (realpathSync(reportRoot) !== reportRoot) fail("report_path_untrusted");
  }
  const logsRoot = path.resolve(config.logsRoot || "");
  if (!path.isAbsolute(config.logsRoot || "") || realpathSync(logsRoot) !== logsRoot) {
    fail("logs_root_untrusted");
  }
  const logsInfo = lstatSync(logsRoot);
  if (!logsInfo.isDirectory() || (logsInfo.mode & 0o077) !== 0
      || (typeof process.getuid === "function" && logsInfo.uid !== process.getuid())
      || logsRoot === checkout.root || logsRoot.startsWith(`${checkout.root}${path.sep}`)) {
    fail("logs_root_untrusted");
  }
  const lock = trustedLaunchLock(logsRoot);
  const captureFd = reportPath ? openReportCapture(logsRoot) : null;
  try {
    const selected = scopedCodexModel(purpose === "review" ? "review" : modelMode, now);
    const seconds = purpose === "review" ? 1800 : 3600;
    const args = ["--exclusive", "--nonblock", "--conflict-exit-code", "75", lock,
      "/usr/bin/timeout", "--signal=TERM", "--kill-after=10s", `${seconds}s`, CODEX_BINARY,
      "exec", "--model", selected.model, "--sandbox",
      purpose === "review" ? "read-only" : "workspace-write",
      "--cd", checkout.root, "-c", `model_reasoning_effort="${selected.effort}"`,
      "-c", 'service_tier="default"',
      ...(captureFd !== null ? ["--output-last-message", "/proc/self/fd/3"] : []), "-"];
    const result = spawnImpl("/usr/bin/flock", args, {
      cwd: checkout.root, input: prompt, encoding: "utf8",
      stdio: captureFd === null ? ["pipe", stdoutFd, stderrFd] : ["pipe", stdoutFd, stderrFd, captureFd],
      timeout: (seconds + 15) * 1000,
      killSignal: "SIGKILL",
    });
    verifyScopedCheckout(config, { branchName: checkout.branch, expectedHead: checkout.head });
    if (result.status === 75) fail("duplicate_launch_or_stale_lock");
    if (captureFd !== null && result.status === 0 && !result.signal && !result.error) {
      publishReport(captureFd, reportPath, path.dirname(reportPath));
    }
    return { ...result, command: CODEX_BINARY, args, checkout };
  } finally {
    if (captureFd !== null) closeSync(captureFd);
  }
}
