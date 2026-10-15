import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync,
  rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cacheTreeDigests, privateFlutterSdkRoot, provisionPrivateFlutterSdk, verifyPrivateFlutterSdk } from "../lib/private-flutter-sdk.mjs";
import { runValidationPlan } from "../lib/validation-planner.mjs";

const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function fixture(run) {
  const parent = mkdtempSync(path.join(os.tmpdir(), "settleora-private-flutter-"));
  const source = path.join(parent, "source"), logsRoot = path.join(parent, "logs");
  mkdirSync(source, { mode: 0o700 }); mkdirSync(logsRoot, { mode: 0o700 });
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
  const write = (name, value, executable = false) => {
    const file = path.join(source, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value);
    if (executable) chmodSync(file, 0o755);
  };
  try {
    git("init", "-q", "-b", "stable");
    git("config", "user.name", "SDK Fixture");
    git("config", "user.email", "sdk-fixture@localhost");
    write(".gitignore", "bin/cache/\n");
    write("bin/flutter", "#!/bin/sh\necho private-flutter\n", true);
    write("bin/internal/shared.sh", "# fixture\n");
    write("pubspec.yaml", "name: flutter_fixture\n");
    write("pubspec.lock", "original\n");
    write("packages/flutter_tools/pubspec.yaml", "name: flutter_tools_fixture\n");
    write("packages/flutter_tools/pubspec.lock", "fixture lock\n");
    git("add", ".gitignore", "bin/flutter", "bin/internal/shared.sh", "pubspec.yaml", "pubspec.lock",
      "packages/flutter_tools/pubspec.yaml", "packages/flutter_tools/pubspec.lock");
    git("commit", "-qm", "fixture SDK");
    const commit = git("rev-parse", "HEAD");
    write("pubspec.lock", "pinned local lock\n");
    write("bin/cache/flutter_tools.snapshot", "snapshot\n");
    write("bin/cache/flutter_tools.stamp", `${commit}:\n`);
    write("bin/cache/dart-sdk/bin/dart", "#!/bin/sh\necho dart\n", true);
    write("bin/cache/engine.stamp", "engine\n");
    write("bin/cache/lockfile", "");
    const files = Object.fromEntries(["bin/flutter", "bin/internal/shared.sh", "pubspec.lock",
      "packages/flutter_tools/pubspec.lock",
      "bin/cache/flutter_tools.snapshot", "bin/cache/dart-sdk/bin/dart", "bin/cache/engine.stamp"]
      .map((name) => [name, hash(path.join(source, name))]));
    return run({ parent, source, logsRoot, pin: { commit, branch: "stable", files,
      ...cacheTreeDigests(path.join(source, "bin/cache")) } });
  } finally { rmSync(parent, { recursive: true, force: true }); }
}

test("private SDK provisions independent bytes under owner-only logs-root toolchains", () => fixture(({ source, logsRoot, pin }) => {
  const root = provisionPrivateFlutterSdk(logsRoot, { sourceRoot: source, pin });
  assert.equal(root, privateFlutterSdkRoot(logsRoot, pin));
  assert.equal(verifyPrivateFlutterSdk(logsRoot, pin), root);
  assert.equal(provisionPrivateFlutterSdk(logsRoot, { sourceRoot: source, pin }), root);
  for (const directory of [path.join(logsRoot, "toolchains"), root, path.join(root, "bin/cache")]) {
    assert.equal(lstatSync(directory).mode & 0o777, 0o700);
  }
  assert.notEqual(lstatSync(path.join(source, "bin/cache/dart-sdk/bin/dart")).ino,
    lstatSync(path.join(root, "bin/cache/dart-sdk/bin/dart")).ino);
  assert.ok(statSync(path.join(root, "packages/flutter_tools/pubspec.lock")).mtimeMs
    >= statSync(path.join(root, "packages/flutter_tools/pubspec.yaml")).mtimeMs);
  assert.equal(existsSync(path.join(logsRoot, "caches", "flutter")), false);
  writeFileSync(path.join(root, "bin/cache/flutter_tools.snapshot"), "tampered\n");
  assert.throws(() => verifyPrivateFlutterSdk(logsRoot, pin), /pin_mismatch/);
}));

test("provisioner blocks unexpected source cache files before copying", () => fixture(({ source, logsRoot, pin }) => {
  writeFileSync(path.join(source, "bin/cache", "unexpected-secret-like-file"), "do not copy\n");
  assert.throws(() => provisionPrivateFlutterSdk(logsRoot, { sourceRoot: source, pin }), /cache_source_unexpected_entry/);
  assert.equal(existsSync(path.join(logsRoot, "toolchains")), false);
}));

test("provisioner rejects changed bytes inside an allowed cache subtree", () => fixture(({ source, logsRoot, pin }) => {
  writeFileSync(path.join(source, "bin/cache/dart-sdk/bin/hidden-file"), "unexpected bytes\n");
  assert.throws(() => provisionPrivateFlutterSdk(logsRoot, { sourceRoot: source, pin }), /cache_pin_mismatch/);
}));

test("validation rejects changed or newly executable SDK cache files", () => fixture(({ source, logsRoot, pin }) => {
  const root = provisionPrivateFlutterSdk(logsRoot, { sourceRoot: source, pin });
  const extra = path.join(root, "bin/cache/dart-sdk/bin/extra");
  writeFileSync(extra, "#!/bin/sh\n", { mode: 0o700 });
  assert.throws(() => verifyPrivateFlutterSdk(logsRoot, pin), /cache_executable_mismatch/);
  rmSync(extra);
  writeFileSync(path.join(root, "bin/cache/dart-sdk/bin/dart"), "#!/bin/sh\necho changed\n");
  assert.throws(() => verifyPrivateFlutterSdk(logsRoot, pin), /pin_mismatch|cache_executable_mismatch/);
}));

test("validation PATH uses only verified private Flutter while absence fails closed", () => fixture(({ logsRoot }) => {
  const plan = [{ command: "bash", args: ["-c", "flutter --version"], display: "bash -c flutter --version" }];
  plan.profile = "mobile";
  const missing = runValidationPlan({ logsRoot, repoRoot: logsRoot }, plan);
  assert.equal(missing.passed, false);
  assert.match(missing.results[0].error, /private_flutter_sdk/);
  const privateRoot = path.join(logsRoot, "test-private-sdk");
  mkdirSync(path.join(privateRoot, "bin"), { recursive: true });
  writeFileSync(path.join(privateRoot, "bin", "flutter"), "#!/bin/sh\necho private-flutter\n", { mode: 0o700 });
  const result = runValidationPlan({ logsRoot, repoRoot: logsRoot }, plan, () => privateRoot);
  assert.equal(result.passed, true);
  assert.match(result.results[0].stdout, /private-flutter/);
}));
