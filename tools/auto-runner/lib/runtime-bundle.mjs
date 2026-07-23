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
  mkdirSync(consumers, { mode: 0o700 });
  if (existsSync(deploymentLock)) throw new Error("runtime startup refused during deployment");
  const marker = path.join(consumers, `${process.pid}.lock`);
  writeFileSync(marker, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  if (existsSync(deploymentLock)) {
    rmSync(marker);
    throw new Error("runtime startup raced with deployment");
  }
  return marker;
}

export function releaseRuntimeConsumer(marker) {
  if (marker && existsSync(marker)) rmSync(marker);
}

export function acquireRuntimeDeploymentLock(destination) {
  const parent = canonicalExistingDirectory(path.dirname(destination), "runtime destination parent");
  const lock = path.join(parent, `.${path.basename(destination)}.deployment.lock`);
  writeFileSync(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  const consumers = path.join(parent, `.${path.basename(destination)}.consumers`);
  if (existsSync(consumers) && readdirSync(consumers).length > 0) {
    rmSync(lock);
    throw new Error("runtime deployment refused while runtime consumers are registered");
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

export function buildRuntimeManifest(sourceRoot, { sourceSha, generatedAt = new Date().toISOString() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(String(sourceSha || ""))) throw new Error("approved source SHA is required");
  const files = runtimeBundleFileList(sourceRoot).map((relativePath) => {
    const absolute = path.join(sourceRoot, relativePath);
    const mode = statSync(absolute).mode & 0o777;
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
  if (path.resolve(destination) !== destination || isContained(destination, source)) throw new Error("runtime destination must be canonical and outside source");
  assertSeparatedRoots({ runtimeRoot: destination, repoRoot: path.resolve(repoRoot), logsRoot: path.resolve(logsRoot) });
  const manifest = buildRuntimeManifest(source, { sourceSha });
  if (dryRun) return { dryRun: true, destination, manifest };
  const temporary = path.join(destinationParent, `.${path.basename(destination)}.deploy-incoming`);
  const rollback = path.join(destinationParent, `.${path.basename(destination)}.rollback`);
  if (existsSync(destination)) {
    const current = verifyRuntimeBundle(destination);
    if (current.bundleDigest === manifest.bundleDigest && !expectedOldDigest) {
      return { dryRun: false, adopted: true, destination: realpathSync(destination), rollback: null, manifest: current };
    }
    if (current.bundleDigest === manifest.bundleDigest && expectedOldDigest && existsSync(rollback)) {
      verifyRuntimeBundle(rollback, expectedOldDigest);
      return { dryRun: false, adopted: true, destination: realpathSync(destination), rollback, manifest: current };
    }
    if (!expectedOldDigest || current.bundleDigest !== expectedOldDigest) throw new Error("installed runtime does not match expected old digest");
  } else if (expectedOldDigest && existsSync(rollback) && existsSync(temporary)) {
    verifyRuntimeBundle(rollback, expectedOldDigest);
    verifyRuntimeBundle(temporary, manifest.bundleDigest);
    renameSync(temporary, destination);
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
  if (existsSync(rollback)) rmSync(rollback, { recursive: true });
  const movedOldRuntime = existsSync(destination);
  if (movedOldRuntime) renameSync(destination, rollback);
  try {
    renameSync(temporary, destination);
  } catch (error) {
    if (movedOldRuntime && !existsSync(destination) && existsSync(rollback)) renameSync(rollback, destination);
    throw error;
  }
  return { dryRun: false, destination: realpathSync(destination), rollback: existsSync(rollback) ? rollback : null, manifest };
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
  const rollback = path.join(parent, `.${path.basename(destination)}.rollback`);
  const incoming = path.join(parent, `.${path.basename(destination)}.rollback-incoming`);
  if (existsSync(destination) && existsSync(rollback)) {
    const installed = verifyRuntimeBundle(destination);
    const retained = verifyRuntimeBundle(rollback);
    if (installed.bundleDigest === expectedRollbackDigest && retained.bundleDigest === expectedCurrentDigest) {
      return { adopted: true, destination: realpathSync(destination), rollback, manifest: installed };
    }
  }
  if (existsSync(incoming)) {
    const staged = verifyRuntimeBundle(incoming, expectedRollbackDigest);
    if (!existsSync(destination)) {
      verifyRuntimeBundle(rollback, expectedCurrentDigest);
      renameSync(incoming, destination);
      return { adopted: true, destination: realpathSync(destination), rollback, manifest: staged };
    }
    if (!existsSync(rollback)) {
      verifyRuntimeBundle(destination, expectedCurrentDigest);
      renameSync(destination, rollback);
      renameSync(incoming, destination);
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
  return {
    adopted: false,
    destination: realpathSync(destination),
    rollback,
    manifest: verifyRuntimeBundle(destination, expectedRollbackDigest),
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
      const terminalPhases = new Set(["completed", "cleanup_complete"]);
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
