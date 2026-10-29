import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildAndroidSetupBoundary, pinnedAndroidEmulatorAction } from "../android-setup-boundary.mjs";

const identity = { sourceSha: "3".repeat(40), runId: "39287520114", runAttempt: "1" };
const complete = { ...identity, beforeAction: "1", preLaunch: "1", callback: "1", actionOutcome: "failure" };
const sentinel = "private receipt 123.45 /private/path token-sentinel";

test("positive boundaries do not declare acceptance or identify a failure cause", () => {
  const result = buildAndroidSetupBoundary(complete);
  assert.equal(result.pinnedActionCommit, pinnedAndroidEmulatorAction);
  assert.equal(result.allBoundariesObserved, true);
  assert.equal(result.actionOutcome, "failure");
  assert.equal(result.nativeAcceptanceClaimed, false);
  assert.equal(Object.hasOwn(result, "failureCause"), false);
  assert.deepEqual(result.milestones, { beforeAction: "observed", preLaunchHookEntered: "observed", mainCallbackEntered: "observed" });
});

test("missing markers stay unavailable even when a later callback was reached", () => {
  for (const flags of [
    { beforeAction: "", preLaunch: "", callback: "" },
    { beforeAction: "1", preLaunch: "", callback: "" },
    { beforeAction: "1", preLaunch: "1", callback: "" },
    { beforeAction: "1", preLaunch: "", callback: "1" },
  ]) {
    const result = buildAndroidSetupBoundary({ ...complete, ...flags });
    assert.equal(result.allBoundariesObserved, false);
    for (const [input, output] of [["beforeAction", "beforeAction"], ["preLaunch", "preLaunchHookEntered"], ["callback", "mainCallbackEntered"]]) {
      assert.equal(result.milestones[output], flags[input] === "1" ? "observed" : "unavailable");
    }
    assert.equal(result.nativeAcceptanceClaimed, false);
  }
});

test("non-enumerated flags are invalid without retaining text or private hashes", () => {
  for (const key of ["beforeAction", "preLaunch", "callback", "actionOutcome"]) {
    const result = buildAndroidSetupBoundary({ ...complete, [key]: sentinel });
    assert.equal(JSON.stringify(result).includes(sentinel), false);
    assert.equal(JSON.stringify(result).includes("123.45"), false);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.ok(JSON.stringify(result).includes('"invalid"'));
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 4096);
  }
});

test("identity, exact keys and bounded decimal run identifiers are validated", () => {
  const inherited = Object.assign(Object.create({ callback: "1" }), complete);
  delete inherited.callback;
  inherited.replacement = sentinel;
  for (const input of [null, [], { ...complete, sourceSha: sentinel },
    { ...complete, runId: "0" }, { ...complete, runId: "1".repeat(21) },
    { ...complete, runAttempt: "0" }, { ...complete, runAttempt: "10000" },
    { ...complete, callback: 1 }, { ...complete, receiptText: sentinel }, inherited]) {
    assert.throws(() => buildAndroidSetupBoundary(input), /Invalid Android setup boundary identity/);
  }
  assert.doesNotThrow(() => buildAndroidSetupBoundary({ ...complete, runId: "9".repeat(20), runAttempt: "9999" }));
});

const collector = fileURLToPath(new URL("../android-setup-boundary.mjs", import.meta.url));
function args(output, overrides = {}) {
  const v = { ...complete, ...overrides };
  return [collector, `--source-sha=${v.sourceSha}`, `--run-id=${v.runId}`, `--run-attempt=${v.runAttempt}`,
    `--before-action=${v.beforeAction}`, `--pre-launch=${v.preLaunch}`, `--callback=${v.callback}`,
    `--action-outcome=${v.actionOutcome}`, `--output=${output}`];
}
function withDirectory(callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-setup-boundary-test-"));
  try { callback(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("CLI writes one small private metadata artifact with no log input or stdout", () => withDirectory((directory) => {
  const output = path.join(directory, "setup.json");
  const result = spawnSync(process.execPath, args(output), { encoding: "utf8" });
  assert.equal(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), buildAndroidSetupBoundary(complete));
  assert.ok(statSync(output).size < 4096); assert.equal(statSync(output).mode & 0o777, 0o600);
}));

test("invalid flags produce bounded invalid evidence and a failing collector status", () => withDirectory((directory) => {
  const output = path.join(directory, "setup.json");
  const result = spawnSync(process.execPath, args(output, { preLaunch: sentinel }), { encoding: "utf8" });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
  assert.equal(JSON.parse(readFileSync(output, "utf8")).milestones.preLaunchHookEntered, "invalid");
  assert.equal(readFileSync(output, "utf8").includes(sentinel), false);
}));

test("CLI never overwrites an existing artifact or follows an output symlink", () => withDirectory((directory) => {
  const existing = path.join(directory, "existing.json"); writeFileSync(existing, sentinel);
  const link = path.join(directory, "link.json"); symlinkSync(existing, link);
  for (const output of [existing, link]) {
    const result = spawnSync(process.execPath, args(output), { encoding: "utf8" });
    assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Android setup boundary evidence could not be collected\n");
    assert.equal(readFileSync(existing, "utf8"), sentinel);
  }
}));

test("unknown CLI options and bad identity fail without echoing their values", () => withDirectory((directory) => {
  for (const argv of [[...args(path.join(directory, "one.json")), `--private=${sentinel}`],
    args(path.join(directory, "two.json"), { sourceSha: sentinel })]) {
    const result = spawnSync(process.execPath, argv, { encoding: "utf8" });
    assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Android setup boundary evidence could not be collected\n");
  }
}));

const workflow = readFileSync(new URL("../../../.github/workflows/mobile-ocr-native-acceptance.yml", import.meta.url), "utf8");
const workflowMarkers = [...workflow.matchAll(/^\s*(?:run: |pre-emulator-launch-script: )?(printf '%s\\n' 'settleora_setup_[a-z_]+=1' >> "\$GITHUB_OUTPUT" \|\| true)$/gm)]
  .map((match) => match[1]);

test("every actual workflow marker is nonfatal when its append fails, preserving stderr", () => withDirectory((directory) => {
  assert.equal(workflowMarkers.length, 3);
  for (const command of workflowMarkers) {
    // Appending to a directory fails even when tests run as root. This is only
    // a public synthetic metadata path, never a native capture or real output.
    const result = spawnSync("sh", ["-c", command], {
      encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: directory },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.length > 0, "marker error must not be filtered");
  }
}));

test("the pinned per-line callback loop reaches its runner handoff after marker failure", () => withDirectory((directory) => {
  const callback = workflow.match(/          script: \|\n([\s\S]*?)\n      - name: Collect bounded Android setup observation/)[1]
    .trim().split("\n").map((line) => line.trim()).filter(Boolean);
  assert.equal(callback.length, 2);
  assert.ok(workflowMarkers.includes(callback[0]));
  assert.equal(callback[1], 'bash "$GITHUB_WORKSPACE/tools/ocr-models/run-android-native-acceptance.sh"');
  // Emulate only the pinned action's await/abort-on-nonzero loop. Replace the
  // real runner with a fixed public sentinel; do not execute Android tooling.
  const commands = [callback[0], "printf runner_handoff_reached"];
  let reached = false;
  for (const command of commands) {
    const result = spawnSync("sh", ["-c", command], {
      encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: directory },
    });
    assert.equal(result.status, 0);
    if (result.stdout === "runner_handoff_reached") reached = true;
  }
  assert.equal(reached, true);
}));
