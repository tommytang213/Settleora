import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, cpSync, existsSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, readSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

// This pin describes the already installed DevBox SDK. A different SDK needs
// its own reviewed pin; provisioning never downloads or upgrades Flutter.
export const FLUTTER_SDK_PIN = Object.freeze({
  commit: "6a19cca56475dbfba1478ee68d7bd0c2ef891da1",
  branch: "stable",
  // Whole-cache provenance is checked before copying. Validation checks the
  // executable subset again, while Flutter may update its writable cache.
  cacheDigest: "31cb0cf21b110e85b1bb5306ac7d6be6db0144380ce37329307b0141f2d43487",
  executableDigest: "764b8a02b6fa792d8f08535b2d1e4939ab1bcaad84b931c43e0d379ce993466e",
  files: Object.freeze({
    "bin/flutter": "7d486c33b30a0cf1ea5146231c68bb8f966cdb4e087c5cd8b37e14513f536e7d",
    "bin/internal/shared.sh": "7029bb28e9f60927807f2119d2afe388742db41d34c26f5e263bf15568911fa2",
    "pubspec.lock": "e4e4490d9523051fe08c045b47afbc157984ef2eebd349d8ec4388f0dd334048",
    "packages/flutter_tools/pubspec.lock": "6a98afb61c0cc72f31631ab444932f072fd275aa04d56cde2bf6831ba02fc8f8",
    "bin/cache/flutter_tools.snapshot": "01dc5be62c94ab08f84200cf10221adbaafa4e4f945a8496d022482b6b13c33f",
    "bin/cache/dart-sdk/bin/dart": "327991241585ee23f10d8b239a3f8484cb55e5060c665700d19d7e01e62ec94a",
    "bin/cache/engine.stamp": "1c55283a1f6e3bdfee3825d3aa57c3a0940e6d46bc3c2a804a1bc9a6d792e414",
  }),
});

const SOURCE_ROOT = "/opt/flutter";
const PINNED_FILE_NAMES = Object.freeze(Object.keys(FLUTTER_SDK_PIN.files).sort());
const CACHE_ENTRIES = new Set([
  ".dartignore", "LICENSE.dart_sdk_archive.md", "android-internal-build-artifacts.stamp",
  "android-sdk.stamp", "artifacts", "dart-sdk", "downloads", "engine-dart-sdk.stamp",
  "engine.realm", "engine.stamp", "engine_stamp.json", "engine_stamp.stamp",
  "flutter.version.json", "flutter_sdk.stamp", "flutter_tools.snapshot", "flutter_tools.stamp",
  "flutter_version_check.stamp", "flutter_web_sdk", "flutter_web_sdk.stamp",
  "font-subset.stamp", "gradle_wrapper.stamp", "ios-deploy.stamp", "ios-sdk.stamp",
  "libimobiledevice.stamp", "libimobiledeviceglue.stamp", "libplist.stamp",
  "libusbmuxd.stamp", "linux-sdk.stamp", "lockfile", "macos-sdk.stamp",
  "material_fonts.stamp", "openssl.stamp", "pkg", "windows-sdk.stamp",
]);
const gitEnv = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C.UTF-8",
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" });

function fail(reason) { throw new Error(`private_flutter_sdk:${reason}`); }

function validatePin(pin) {
  if (!pin || !/^[a-f0-9]{40}$/.test(pin.commit) || pin.branch !== "stable"
      || !/^[a-f0-9]{64}$/.test(pin.cacheDigest)
      || !/^[a-f0-9]{64}$/.test(pin.executableDigest)
      || !pin.files || typeof pin.files !== "object"
      || JSON.stringify(Object.keys(pin.files).sort()) !== JSON.stringify(PINNED_FILE_NAMES)
      || Object.values(pin.files).some((digest) => !/^[a-f0-9]{64}$/.test(digest))) {
    fail("pin_untrusted");
  }
}

function validateAbsolutePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) {
    fail("path_untrusted");
  }
}

function git(args) {
  const result = spawnSync("/usr/bin/git", args, { encoding: "utf8", timeout: 120_000,
    env: gitEnv, stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) fail("git_unavailable");
  return result.stdout.trim();
}

function privateDirectory(directory) {
  let info;
  try { info = lstatSync(directory); }
  catch { fail("directory_unavailable"); }
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== directory
      || (typeof process.getuid === "function" && info.uid !== process.getuid())
      || (info.mode & 0o777) !== 0o700) fail("directory_untrusted");
}

function hashFile(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("file_untrusted");
  const digest = createHash("sha256");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally { closeSync(fd); }
  return digest.digest("hex");
}

function verifyPinnedFiles(root, pin) {
  for (const [name, expected] of Object.entries(pin.files)) {
    if (hashFile(path.join(root, name)) !== expected) fail("pin_mismatch");
  }
  if (readFileSync(path.join(root, "bin/cache/flutter_tools.stamp"), "utf8").trim()
      !== `${pin.commit}:`) fail("snapshot_stamp_mismatch");
}

function verifyCacheSource(root) {
  const cache = path.join(root, "bin/cache");
  if (realpathSync(cache) !== cache) fail("cache_source_untrusted");
  for (const entry of readdirSync(cache)) if (!CACHE_ENTRIES.has(entry)) fail("cache_source_unexpected_entry");
  return cacheTreeDigests(cache);
}

export function cacheTreeDigests(cache) {
  validateAbsolutePath(cache);
  if (realpathSync(cache) !== cache || !lstatSync(cache).isDirectory()) fail("cache_source_untrusted");
  let count = 0, bytes = 0;
  const entries = [];
  const scan = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const item = path.join(directory, entry.name), info = lstatSync(item);
      if (++count > 20_000) fail("cache_source_too_large");
      if (info.isDirectory()) scan(item);
      else if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1) {
        bytes += info.size;
        entries.push([path.relative(cache, item).split(path.sep).join("/"),
          Boolean(info.mode & 0o111), hashFile(item)]);
      }
      else fail("cache_source_untrusted");
      if (bytes > 4 * 1024 ** 3) fail("cache_source_too_large");
    }
  };
  scan(cache);
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const digest = (items) => createHash("sha256").update(JSON.stringify(items)).digest("hex");
  return { cacheDigest: digest(entries), executableDigest: digest(entries.filter((entry) => entry[1])) };
}

function confineCopiedTree(directory, root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name), info = lstatSync(item);
    if (info.isSymbolicLink()) {
      const resolved = realpathSync(item);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail("copied_symlink_escape");
    } else if (info.isDirectory()) {
      confineCopiedTree(item, root);
      chmodSync(item, 0o700);
    } else if (info.isFile() && info.nlink === 1) {
      chmodSync(item, info.mode & 0o111 ? 0o700 : 0o600);
    } else fail("copied_file_untrusted");
  }
}

export function privateFlutterSdkRoot(logsRoot, pin = FLUTTER_SDK_PIN) {
  validatePin(pin);
  validateAbsolutePath(logsRoot);
  return path.join(logsRoot, "toolchains", `flutter-${pin.commit}`);
}

export function verifyPrivateFlutterSdk(logsRoot, pin = FLUTTER_SDK_PIN) {
  validatePin(pin);
  validateAbsolutePath(logsRoot);
  privateDirectory(logsRoot);
  const toolchains = path.join(logsRoot, "toolchains"), root = privateFlutterSdkRoot(logsRoot, pin);
  privateDirectory(toolchains);
  privateDirectory(root);
  privateDirectory(path.join(root, ".git"));
  privateDirectory(path.join(root, "bin/cache"));
  const markerPath = path.join(root, ".settleora-private-flutter.json");
  const markerInfo = lstatSync(markerPath);
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.nlink !== 1
      || (markerInfo.mode & 0o777) !== 0o600
      || (typeof process.getuid === "function" && markerInfo.uid !== process.getuid())) fail("marker_untrusted");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.commit !== pin.commit || marker.pinDigest !== createHash("sha256")
    .update(JSON.stringify(pin)).digest("hex")) fail("marker_mismatch");
  if (git(["-C", root, "rev-parse", "HEAD"]) !== pin.commit) fail("commit_mismatch");
  const changed = git(["-C", root, "diff", "--name-only"]);
  if (changed && changed !== "pubspec.lock") fail("tracked_source_changed");
  if (git(["-C", root, "diff", "--cached", "--name-only"])) fail("tracked_source_changed");
  verifyPinnedFiles(root, pin);
  if (cacheTreeDigests(path.join(root, "bin/cache")).executableDigest !== pin.executableDigest) {
    fail("cache_executable_mismatch");
  }
  return root;
}

export function provisionPrivateFlutterSdk(logsRoot, { sourceRoot = SOURCE_ROOT, pin = FLUTTER_SDK_PIN } = {}) {
  validatePin(pin);
  validateAbsolutePath(logsRoot);
  validateAbsolutePath(sourceRoot);
  privateDirectory(logsRoot);
  if (realpathSync(sourceRoot) !== sourceRoot || !lstatSync(sourceRoot).isDirectory()) fail("source_untrusted");
  if (git(["-C", sourceRoot, "rev-parse", "HEAD"]) !== pin.commit) fail("source_commit_mismatch");
  verifyPinnedFiles(sourceRoot, pin);
  const sourceCache = verifyCacheSource(sourceRoot);
  if (sourceCache.cacheDigest !== pin.cacheDigest
      || sourceCache.executableDigest !== pin.executableDigest) fail("cache_pin_mismatch");
  const toolchains = path.join(logsRoot, "toolchains"), root = privateFlutterSdkRoot(logsRoot, pin);
  if (!existsSync(toolchains)) mkdirSync(toolchains, { mode: 0o700 });
  privateDirectory(toolchains);
  if (existsSync(root)) return verifyPrivateFlutterSdk(logsRoot, pin);
  const stagingParent = path.join(toolchains, `.flutter-stage-${randomUUID()}`);
  mkdirSync(stagingParent, { mode: 0o700 });
  const staging = path.join(stagingParent, "sdk");
  try {
    // file:// and --no-local force independent object bytes. The clone copies
    // tracked SDK source, not arbitrary untracked files or source Git config.
    git(["clone", "--no-local", "--depth", "1", "--single-branch", "--branch", pin.branch,
      `file://${sourceRoot}`, staging]);
    if (git(["-C", staging, "rev-parse", "HEAD"]) !== pin.commit) fail("source_changed_during_copy");
    cpSync(path.join(sourceRoot, "pubspec.lock"), path.join(staging, "pubspec.lock"),
      { force: true, preserveTimestamps: true });
    cpSync(path.join(sourceRoot, "packages/flutter_tools/pubspec.lock"),
      path.join(staging, "packages/flutter_tools/pubspec.lock"),
      { force: true, preserveTimestamps: true });
    cpSync(path.join(sourceRoot, "bin/cache"), path.join(staging, "bin/cache"),
      { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true });
    // Flutter's shell launcher compares the flutter_tools manifest and lock
    // timestamps before using the pinned snapshot. Git checkout gives both
    // fresh timestamps in an unpredictable order; keep the copied lock newer.
    for (const prefix of ["", "packages/flutter_tools/"]) {
      const yaml = path.join(staging, prefix, "pubspec.yaml");
      const lock = path.join(staging, prefix, "pubspec.lock");
      const now = new Date(Math.max(Date.now(), statSync(yaml).mtimeMs + 1000));
      utimesSync(lock, now, now);
    }
    verifyPinnedFiles(staging, pin);
    if (cacheTreeDigests(path.join(staging, "bin/cache")).cacheDigest !== pin.cacheDigest) {
      fail("cache_copy_mismatch");
    }
    confineCopiedTree(staging, staging);
    chmodSync(staging, 0o700);
    writeFileSync(path.join(staging, ".settleora-private-flutter.json"), JSON.stringify({
      commit: pin.commit, pinDigest: createHash("sha256").update(JSON.stringify(pin)).digest("hex"),
    }), { flag: "wx", mode: 0o600 });
    renameSync(staging, root);
    return verifyPrivateFlutterSdk(logsRoot, pin);
  } finally {
    rmSync(stagingParent, { recursive: true, force: true });
  }
}
