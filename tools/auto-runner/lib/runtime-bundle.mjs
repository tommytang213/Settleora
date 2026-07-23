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
} = {}) {
  if (active) throw new Error("runtime deployment refused while a runner or supervisor is active");
  if (pendingEffects) throw new Error("runtime deployment refused with unresolved effects or recovery");
  const source = canonicalExistingDirectory(sourceRoot, "runtime sourceRoot");
  const destinationParent = canonicalExistingDirectory(path.dirname(destination), "runtime destination parent");
  if (path.resolve(destination) !== destination || isContained(destination, source)) throw new Error("runtime destination must be canonical and outside source");
  assertSeparatedRoots({ runtimeRoot: destination, repoRoot: path.resolve(repoRoot), logsRoot: path.resolve(logsRoot) });
  const manifest = buildRuntimeManifest(source, { sourceSha });
  if (dryRun) return { dryRun: true, destination, manifest };
  if (existsSync(destination)) {
    const current = verifyRuntimeBundle(destination);
    if (!expectedOldDigest || current.bundleDigest !== expectedOldDigest) throw new Error("installed runtime does not match expected old digest");
  } else if (expectedOldDigest) {
    throw new Error("expected old runtime is absent");
  }
  const temporary = path.join(destinationParent, `.${path.basename(destination)}.incoming-${process.pid}`);
  const rollback = path.join(destinationParent, `.${path.basename(destination)}.rollback`);
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
  if (existsSync(rollback)) rmSync(rollback, { recursive: true });
  if (existsSync(destination)) renameSync(destination, rollback);
  renameSync(temporary, destination);
  return { dryRun: false, destination: realpathSync(destination), rollback: existsSync(rollback) ? rollback : null, manifest };
}
