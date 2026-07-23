import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertSeparatedRoots, canonicalExistingDirectory, isContained } from "./runtime-identity.mjs";

export const runtimeBundleFormat = "settleora-auto-runner-runtime";
export const runtimeBundleVersion = 1;
export const runtimeManifestName = "runtime-bundle-manifest.json";
export const runtimeEntryPoints = Object.freeze([
  "settleora-auto-runner.mjs",
  "settleora-auto-runnerctl.mjs",
  "settleora-auto-runner-health-service.mjs",
  "settleora-auto-runner-terminal-notifier.mjs",
  "supervisor/settleora-auto-runner-worker.mjs",
]);

export function acquireRuntimeConsumer(runtimeRoot) {
  const parent = canonicalExistingDirectory(path.dirname(runtimeRoot), "runtime parent");
  const deploymentLock = path.join(parent, `.${path.basename(runtimeRoot)}.deployment.lock`);
  const consumers = path.join(parent, `.${path.basename(runtimeRoot)}.consumers`);
  mkdirSync(consumers, { recursive: true, mode: 0o700 });
  const consumerDirectory = lstatSync(consumers);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!consumerDirectory.isDirectory() || consumerDirectory.isSymbolicLink() || realpathSync(consumers) !== consumers
      || (consumerDirectory.mode & 0o022) !== 0 || (currentUid !== null && consumerDirectory.uid !== currentUid)) {
    throw new Error("runtime consumer directory is unsafe");
  }
  if (existsSync(deploymentLock)) throw new Error("runtime startup refused during deployment");
  const marker = path.join(consumers, `${process.pid}.lock`);
  const identity = { pid: process.pid, processBirthId: processBirthId(process.pid) };
  if (existsSync(marker)) {
    let existing;
    try { existing = JSON.parse(readFileSync(marker, "utf8")); } catch { existing = null; }
    if (existing?.pid !== identity.pid || existing?.processBirthId !== identity.processBirthId) {
      throw new Error("runtime consumer marker identity collision");
    }
    return { marker, owned: false };
  }
  writeFileSync(marker, `${JSON.stringify(identity)}\n`, { flag: "wx", mode: 0o600 });
  if (existsSync(deploymentLock)) {
    rmSync(marker);
    throw new Error("runtime startup raced with deployment");
  }
  return { marker, owned: true };
}

export function releaseRuntimeConsumer(handle) {
  if (handle?.owned === true && handle.marker && existsSync(handle.marker)) rmSync(handle.marker);
}

export function acquireRuntimeDeploymentLock(destination) {
  const parent = canonicalExistingDirectory(path.dirname(destination), "runtime destination parent");
  const parentInfo = statSync(parent);
  if ((typeof process.getuid === "function" && parentInfo.uid !== process.getuid()) || (parentInfo.mode & 0o022) !== 0) {
    throw new Error("runtime destination parent must be owner-controlled");
  }
  const lock = path.join(parent, `.${path.basename(destination)}.deployment.lock`);
  writeFileSync(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  const consumers = path.join(parent, `.${path.basename(destination)}.consumers`);
  mkdirSync(consumers, { recursive: true, mode: 0o700 });
  const consumerDirectory = lstatSync(consumers);
  if (!consumerDirectory.isDirectory() || consumerDirectory.isSymbolicLink() || realpathSync(consumers) !== consumers
      || (consumerDirectory.mode & 0o022) !== 0
      || (typeof process.getuid === "function" && consumerDirectory.uid !== process.getuid())) {
    rmSync(lock);
    throw new Error("runtime consumer directory is unsafe");
  }
  if (existsSync(consumers)) {
    for (const name of readdirSync(consumers)) {
      const marker = path.join(consumers, name);
      const info = lstatSync(marker);
      const match = /^([1-9]\d*)\.lock$/.exec(name);
      let identity;
      try { identity = JSON.parse(readFileSync(marker, "utf8")); } catch { identity = null; }
      if (!match || !info.isFile() || info.isSymbolicLink() || (info.mode & 0o022) !== 0
          || (typeof process.getuid === "function" && info.uid !== process.getuid())
          || identity?.pid !== Number(match[1]) || !/^\d+$/u.test(String(identity?.processBirthId || ""))) {
        rmSync(lock);
        throw new Error("runtime consumer marker is unsafe");
      }
      const activeBirthId = processBirthId(Number(match[1]), { missingOk: true });
      if (activeBirthId !== null && activeBirthId === identity.processBirthId) {
        rmSync(lock);
        throw new Error("runtime deployment refused while runtime consumers are registered");
      }
      rmSync(marker);
    }
  }
  return lock;
}

export function releaseRuntimeDeploymentLock(lock) {
  if (lock && existsSync(lock)) rmSync(lock);
}

export function inspectRuntimeConsumers(destination, { procRoot = "/proc", selfPid = process.pid } = {}) {
  const root = path.resolve(destination);
  if (!existsSync(procRoot)) return [];
  const entries = runtimeEntryPoints.map((entry) => path.join(root, entry));
  const consumers = [];
  for (const name of readdirSync(procRoot)) {
    if (!/^\d+$/.test(name) || Number(name) === selfPid) continue;
    try {
      const argv = readFileSync(path.join(procRoot, name, "cmdline"), "utf8").split("\0").filter(Boolean);
      if (entries.some((entry) => argv.includes(entry))) consumers.push(Number(name));
    } catch {
      // A process may exit or become unreadable during this bounded snapshot.
    }
  }
  return consumers.sort((a, b) => a - b);
}

const includedRoots = ["lib", "supervisor"];
const includedFiles = [
  ...runtimeEntryPoints,
  "runtime-launcher.mjs",
  "systemd/settleora-auto-runner@.service",
  "runner-config.example.json",
  "README.md",
];

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function walk(root, relative) {
  const absolute = path.join(root, relative);
  const info = lstatSync(absolute);
  if (info.isSymbolicLink()) throw new Error(`runtime bundle refuses symlink: ${relative}`);
  if (info.isFile()) return relative.endsWith(".mjs") ? [relative] : [];
  if (!info.isDirectory()) return [];
  return readdirSync(absolute).sort().flatMap((name) => walk(root, path.join(relative, name)));
}

export function runtimeBundleFileList(sourceRoot) {
  canonicalExistingDirectory(sourceRoot, "runtime sourceRoot");
  const files = [...includedFiles, ...includedRoots.flatMap((root) => walk(sourceRoot, root))]
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .sort();
  for (const relative of files) {
    const target = path.join(sourceRoot, relative);
    if (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) {
      throw new Error(`runtime bundle file missing or unsafe: ${relative}`);
    }
  }
  return files;
}

export function verifyRuntimeSourceAgainstCommit({ repoRoot, sourceRoot, sourceSha } = {}) {
  if (!/^[a-f0-9]{40}$/.test(String(sourceSha || ""))) throw new Error("approved source SHA is required");
  const repository = canonicalExistingDirectory(repoRoot, "runtime source repository");
  const source = canonicalExistingDirectory(sourceRoot, "runtime sourceRoot");
  const relativeSource = path.relative(repository, source).split(path.sep).join("/");
  if (relativeSource !== "tools/auto-runner") throw new Error("runtime sourceRoot must be the repository tools/auto-runner directory");
  const listed = spawnSync("git", ["ls-tree", "-r", "-z", sourceSha, "--", relativeSource], {
    cwd: repository,
    encoding: "buffer",
  });
  if (listed.status !== 0) throw new Error("approved runtime source tree is unreadable");
  const selected = new Map();
  for (const record of listed.stdout.toString("utf8").split("\0").filter(Boolean)) {
    const match = /^([0-7]{6}) blob ([a-f0-9]{40,64})\t(.+)$/u.exec(record);
    if (!match) throw new Error("approved runtime source tree contains an unsupported entry");
    const relative = match[3].slice(`${relativeSource}/`.length);
    if (includedFiles.includes(relative) || includedRoots.some((root) => relative.startsWith(`${root}/`) && relative.endsWith(".mjs"))) {
      selected.set(relative, { mode: match[1], objectId: match[2] });
    }
  }
  const worktreeFiles = runtimeBundleFileList(source);
  const commitFiles = [...selected.keys()].sort();
  if (canonicalJson(worktreeFiles) !== canonicalJson(commitFiles)) {
    throw new Error("runtime source file list does not match the approved commit");
  }
  for (const relative of commitFiles) {
    const expected = selected.get(relative);
    const blob = spawnSync("git", ["cat-file", "blob", expected.objectId], { cwd: repository, encoding: "buffer" });
    if (blob.status !== 0) throw new Error(`approved runtime blob is unreadable: ${relative}`);
    const worktreePath = path.join(source, relative);
    const worktreeDigest = createHash("sha256").update(readFileSync(worktreePath)).digest("hex");
    const commitDigest = createHash("sha256").update(blob.stdout).digest("hex");
    if (worktreeDigest !== commitDigest) throw new Error(`runtime source bytes do not match the approved commit: ${relative}`);
    const worktreeExecutable = (statSync(worktreePath).mode & 0o111) !== 0;
    const commitExecutable = expected.mode === "100755";
    if (worktreeExecutable !== commitExecutable) throw new Error(`runtime source mode does not match the approved commit: ${relative}`);
  }
  return { sourceSha, fileCount: commitFiles.length };
}

export function buildRuntimeManifest(sourceRoot, { sourceSha, generatedAt = new Date().toISOString() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(String(sourceSha || ""))) throw new Error("approved source SHA is required");
  const files = runtimeBundleFileList(sourceRoot).map((relativePath) => {
    const absolute = path.join(sourceRoot, relativePath);
    const mode = (statSync(absolute).mode & 0o111) !== 0 ? 0o500 : 0o400;
    return {
      path: relativePath,
      sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
      mode,
    };
  });
  const identity = { format: runtimeBundleFormat, version: runtimeBundleVersion, sourceSha, files, entryPoints: runtimeEntryPoints, node: ">=22 <23" };
  return {
    ...identity,
    fileListDigest: createHash("sha256").update(canonicalJson(files.map((file) => file.path))).digest("hex"),
    bundleDigest: createHash("sha256").update(canonicalJson(identity)).digest("hex"),
    generatedAt,
  };
}

export function verifyRuntimeBundle(runtimeRoot, expectedDigest = null) {
  canonicalExistingDirectory(runtimeRoot, "runtimeRoot");
  const manifestPath = path.join(runtimeRoot, runtimeManifestName);
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()) throw new Error("runtime manifest missing or unsafe");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rebuilt = buildRuntimeManifest(runtimeRoot, { sourceSha: manifest.sourceSha, generatedAt: manifest.generatedAt });
  if (canonicalJson(manifest) !== canonicalJson(rebuilt)) throw new Error("runtime bundle manifest or file digest drift");
  if (expectedDigest && rebuilt.bundleDigest !== expectedDigest) throw new Error("runtime bundle digest mismatch");
  return rebuilt;
}

export function deployRuntimeBundle({
  sourceRoot,
  destination,
  repoRoot,
  logsRoot,
  sourceSha,
  expectedOldDigest = null,
  dryRun = false,
  active = false,
  pendingEffects = false,
  runtimeConsumers = [],
  sourceVerifier = null,
} = {}) {
  if (active) throw new Error("runtime deployment refused while a runner or supervisor is active");
  if (pendingEffects) throw new Error("runtime deployment refused with unresolved effects or recovery");
  if (runtimeConsumers.length) throw new Error("runtime deployment refused while the shared runtime has active consumers");
  const source = canonicalExistingDirectory(sourceRoot, "runtime sourceRoot");
  const destinationParent = canonicalExistingDirectory(path.dirname(destination), "runtime destination parent");
  if (path.basename(destination) !== "runtime") throw new Error("runtime destination basename must be runtime");
  if (path.resolve(destination) !== destination || isContained(destination, source)) throw new Error("runtime destination must be canonical and outside source");
  assertSeparatedRoots({ runtimeRoot: destination, repoRoot: path.resolve(repoRoot), logsRoot: path.resolve(logsRoot) });
  const manifest = buildRuntimeManifest(source, { sourceSha });
  if (dryRun) return { dryRun: true, destination, manifest };
  const temporary = path.join(destinationParent, `.${path.basename(destination)}.deploy-incoming`);
  const rollback = path.join(destinationParent, `.${path.basename(destination)}.rollback`);
  const retiredRollback = path.join(destinationParent, `.${path.basename(destination)}.rollback-retired`);
  if (existsSync(destination)) {
    const current = verifyRuntimeBundle(destination);
    if (current.bundleDigest === manifest.bundleDigest && !expectedOldDigest) {
      writeRuntimeApproval(destination, current);
      return { dryRun: false, adopted: true, destination: realpathSync(destination), rollback: null, manifest: current };
    }
    if (current.bundleDigest === manifest.bundleDigest && expectedOldDigest && existsSync(rollback)) {
      verifyRuntimeBundle(rollback, expectedOldDigest);
      writeRuntimeApproval(destination, current);
      if (existsSync(retiredRollback)) rmSync(retiredRollback, { recursive: true });
      return { dryRun: false, adopted: true, destination: realpathSync(destination), rollback, manifest: current };
    }
    if (!expectedOldDigest || current.bundleDigest !== expectedOldDigest) throw new Error("installed runtime does not match expected old digest");
  } else if (expectedOldDigest && existsSync(rollback) && existsSync(temporary)) {
    verifyRuntimeBundle(rollback, expectedOldDigest);
    verifyRuntimeBundle(temporary, manifest.bundleDigest);
    renameSync(temporary, destination);
    writeRuntimeApproval(destination, manifest);
    if (existsSync(retiredRollback)) rmSync(retiredRollback, { recursive: true });
    return { dryRun: false, adopted: true, destination: realpathSync(destination), rollback, manifest };
  } else if (expectedOldDigest) {
    throw new Error("expected old runtime is absent");
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true });
  mkdirSync(temporary, { mode: 0o700 });
  for (const file of manifest.files) {
    const target = path.join(temporary, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(source, file.path), target, { dereference: false });
    chmodSync(target, file.mode);
  }
  writeFileSync(path.join(temporary, runtimeManifestName), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  verifyRuntimeBundle(temporary, manifest.bundleDigest);
  for (const entry of runtimeEntryPoints.filter((value) => value.endsWith(".mjs"))) {
    const checked = spawnSync(process.execPath, ["--check", path.join(temporary, entry)], { cwd: temporary, encoding: "utf8" });
    if (checked.status !== 0) throw new Error(`copied runtime syntax check failed: ${entry}: ${checked.stderr}`);
  }
  const smoke = spawnSync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(new URL(`file://${path.join(temporary, "lib/runtime-identity.mjs")}`).href)})`], { cwd: destinationParent, encoding: "utf8" });
  if (smoke.status !== 0) throw new Error(`copied runtime import smoke failed: ${smoke.stderr}`);
  if (sourceVerifier) sourceVerifier(manifest);
  if (buildRuntimeManifest(source, { sourceSha }).bundleDigest !== manifest.bundleDigest) {
    throw new Error("runtime source changed during deployment");
  }
  const launcher = path.join(destinationParent, `.${path.basename(destination)}.launcher.mjs`);
  const stagedLauncher = path.join(temporary, "runtime-launcher.mjs");
  if (existsSync(launcher)) {
    const launcherInfo = lstatSync(launcher);
    if (!launcherInfo.isFile() || launcherInfo.isSymbolicLink()
        || createHash("sha256").update(readFileSync(launcher)).digest("hex") !== createHash("sha256").update(readFileSync(stagedLauncher)).digest("hex")) {
      throw new Error("stable runtime launcher does not match the approved bundle");
    }
  } else {
    cpSync(stagedLauncher, launcher, { dereference: false });
    chmodSync(launcher, 0o500);
  }
  if (existsSync(rollback)) {
    if (existsSync(retiredRollback)) throw new Error("runtime rollback retirement state is contradictory");
    renameSync(rollback, retiredRollback);
  }
  const movedOldRuntime = existsSync(destination);
  if (movedOldRuntime) renameSync(destination, rollback);
  try {
    renameSync(temporary, destination);
  } catch (error) {
    if (movedOldRuntime && !existsSync(destination) && existsSync(rollback)) renameSync(rollback, destination);
    throw error;
  }
  writeRuntimeApproval(destination, manifest);
  if (existsSync(retiredRollback)) rmSync(retiredRollback, { recursive: true });
  return { dryRun: false, destination: realpathSync(destination), launcher, rollback: existsSync(rollback) ? rollback : null, manifest };
}

function writeRuntimeApproval(destination, manifest) {
  const parent = path.dirname(destination);
  const base = path.basename(destination);
  const launcher = path.join(parent, `.${base}.launcher.mjs`);
  const approval = path.join(parent, `.${base}.approved.json`);
  const temporary = path.join(parent, `.${base}.approved.incoming`);
  const launcherInfo = lstatSync(launcher);
  if (!launcherInfo.isFile() || launcherInfo.isSymbolicLink() || (launcherInfo.mode & 0o077) !== 0) {
    throw new Error("stable runtime launcher is unsafe");
  }
  if (existsSync(temporary)) rmSync(temporary);
  writeFileSync(temporary, `${JSON.stringify({
    version: 1,
    sourceSha: manifest.sourceSha,
    bundleDigest: manifest.bundleDigest,
    launcherSha256: createHash("sha256").update(readFileSync(launcher)).digest("hex"),
  })}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o400);
  renameSync(temporary, approval);
}

export function rollbackRuntimeBundle({
  destination,
  expectedCurrentDigest,
  expectedRollbackDigest,
  active = false,
  pendingEffects = false,
  runtimeConsumers = [],
} = {}) {
  if (active) throw new Error("runtime rollback refused while a runner or supervisor is active");
  if (pendingEffects) throw new Error("runtime rollback refused with unresolved effects or recovery");
  if (runtimeConsumers.length) throw new Error("runtime rollback refused while the shared runtime has active consumers");
  if (!/^[a-f0-9]{64}$/.test(String(expectedCurrentDigest || ""))
      || !/^[a-f0-9]{64}$/.test(String(expectedRollbackDigest || ""))) {
    throw new Error("runtime rollback requires expected current and rollback digests");
  }
  const parent = canonicalExistingDirectory(path.dirname(destination), "runtime destination parent");
  if (path.basename(destination) !== "runtime") throw new Error("runtime destination basename must be runtime");
  const rollback = path.join(parent, `.${path.basename(destination)}.rollback`);
  const incoming = path.join(parent, `.${path.basename(destination)}.rollback-incoming`);
  if (existsSync(destination) && existsSync(rollback)) {
    const installed = verifyRuntimeBundle(destination);
    const retained = verifyRuntimeBundle(rollback);
    if (installed.bundleDigest === expectedRollbackDigest && retained.bundleDigest === expectedCurrentDigest) {
      writeRuntimeApproval(destination, installed);
      return { adopted: true, destination: realpathSync(destination), rollback, manifest: installed };
    }
  }
  if (existsSync(incoming)) {
    const staged = verifyRuntimeBundle(incoming, expectedRollbackDigest);
    if (!existsSync(destination)) {
      verifyRuntimeBundle(rollback, expectedCurrentDigest);
      renameSync(incoming, destination);
      writeRuntimeApproval(destination, staged);
      return { adopted: true, destination: realpathSync(destination), rollback, manifest: staged };
    }
    if (!existsSync(rollback)) {
      verifyRuntimeBundle(destination, expectedCurrentDigest);
      renameSync(destination, rollback);
      renameSync(incoming, destination);
      writeRuntimeApproval(destination, staged);
      return { adopted: true, destination: realpathSync(destination), rollback, manifest: staged };
    }
  }
  verifyRuntimeBundle(destination, expectedCurrentDigest);
  verifyRuntimeBundle(rollback, expectedRollbackDigest);
  if (existsSync(incoming)) throw new Error("runtime rollback incoming state is contradictory");
  renameSync(rollback, incoming);
  try {
    renameSync(destination, rollback);
    renameSync(incoming, destination);
  } catch (error) {
    if (!existsSync(destination) && existsSync(rollback) && existsSync(incoming)) {
      renameSync(rollback, destination);
    }
    if (!existsSync(rollback) && existsSync(incoming)) renameSync(incoming, rollback);
    throw error;
  }
  const installed = verifyRuntimeBundle(destination, expectedRollbackDigest);
  writeRuntimeApproval(destination, installed);
  return {
    adopted: false,
    destination: realpathSync(destination),
    rollback,
    manifest: installed,
  };
}

export function inspectDeploymentQuiescence(logsRoot) {
  canonicalExistingDirectory(logsRoot, "logsRoot");
  const activePaths = [
    path.join(logsRoot, "locks"),
    path.join(logsRoot, "supervisor", "runs"),
  ];
  for (const root of activePaths) {
    if (!existsSync(root)) continue;
    for (const file of regularJsonFiles(root, 3)) {
      let record;
      try {
        record = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        throw new Error("runtime deployment refused because operational state is unreadable");
      }
      if (Number.isInteger(record.pid) && processIsActive(record.pid)) {
        return { active: true, pendingEffects: false };
      }
      if (["submitted", "starting", "running", "stopping_after_current"].includes(record.state)) {
        return { active: true, pendingEffects: false };
      }
    }
  }
  for (const name of ["pre-effect-intents", "recovery"]) {
    const root = path.join(logsRoot, name);
    if (!existsSync(root)) continue;
    for (const file of regularJsonFiles(root, 4)) {
      const record = JSON.parse(readFileSync(file, "utf8"));
      const terminalStatuses = new Set(["completed", "finalized", "failed_closed", "recovered", "exhausted", "blocked"]);
      const terminalPhases = new Set(["completed", "cleanup_complete", "stopped"]);
      const terminal = record.completed === true || terminalStatuses.has(record.status) || terminalPhases.has(record.phase);
      if (!terminal) return { active: false, pendingEffects: true };
    }
  }
  return { active: false, pendingEffects: false };
}

function regularJsonFiles(root, depth) {
  if (depth < 0) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("runtime deployment refused because operational state contains a symlink");
    if (entry.isDirectory()) return regularJsonFiles(target, depth - 1);
    return entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".lock")) ? [target] : [];
  });
}

function processIsActive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

function processBirthId(pid, { missingOk = false } = {}) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/u);
    if (!fields[19]) throw new Error("process start identity is unavailable");
    return fields[19];
  } catch (error) {
    if (missingOk && error.code === "ENOENT") return null;
    throw error;
  }
}
