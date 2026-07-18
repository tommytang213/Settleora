import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, parseCliArgs } from "../lib/config.mjs";

function withProfile(profile, fn) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-config-foundation-"));
  const configPath = path.join(logsRoot, "runner-config.json");
  writeFileSync(configPath, `${JSON.stringify({ logsRoot, ...profile }, null, 2)}\n`, { mode: 0o600 });
  try {
    return fn({ logsRoot, configPath });
  } finally {
    rmSync(logsRoot, { recursive: true, force: true });
  }
}

test("disabled outage resubmission profile loads without trusted controller capability", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: false } }, ({ configPath }) => {
    const config = loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) });
    assert.equal(config.outageResubmission.allowBoundedOutageResubmission, false);
  });
});

test("enabled outage resubmission profile requires trusted controller capability", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: true } }, ({ configPath }) => {
    assert.throws(
      () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
      /Bounded outage resubmission requires trusted controller capability\./,
    );
    assert.throws(
      () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }, { outageResubmissionControllerAvailable: false }),
      /Bounded outage resubmission requires trusted controller capability\./,
    );

    const config = loadConfig(
      { ...parseCliArgs(["--preflight", "--config", configPath]) },
      { outageResubmissionControllerAvailable: true },
    );
    assert.equal(config.outageResubmission.allowBoundedOutageResubmission, true);
  });
});

test("external profile cannot spoof trusted outage controller capability", () => {
  withProfile(
    {
      outageResubmissionControllerAvailable: true,
      trustedCapabilities: { outageResubmissionControllerAvailable: true },
      outageResubmission: { allowBoundedOutageResubmission: true },
    },
    ({ configPath }) => {
      assert.throws(
        () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
        /Bounded outage resubmission requires trusted controller capability\./,
      );
    },
  );
});

test("environment and CLI do not grant trusted outage controller capability", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: true } }, ({ configPath }) => {
    const previous = process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE;
    process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE = "true";
    try {
      assert.throws(
        () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
        /Bounded outage resubmission requires trusted controller capability\./,
      );
      assert.throws(() => parseCliArgs(["--preflight", "--outage-resubmission-controller-available"]), /Unknown argument/);
    } finally {
      if (previous === undefined) {
        delete process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE;
      } else {
        process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE = previous;
      }
    }
  });
});

test("malformed outage resubmission profile remains rejected by policy normalization", () => {
  withProfile({ outageResubmission: { minimumOutageAgeMs: "bad" } }, ({ configPath }) => {
    assert.throws(
      () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
      /minimumOutageAgeMs must be an integer/,
    );
  });
});

test("PR A config parser does not own targeted recovery CLI", () => {
  assert.throws(() => parseCliArgs(["--run", "--outage-recovery-only"]), /Unknown argument: --outage-recovery-only/);
  assert.throws(() => parseCliArgs(["--run", "--outage-target-task-key", "20260716-1428"]), /Unknown argument: --outage-target-task-key/);
});

test("stack config trust boundary accepts owner-only config under logsRoot", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-stack-config-trust-"));
  try {
    const logsRoot = path.join(root, "logs");
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    const configPath = path.join(logsRoot, "runner-config.json");
    const planPath = path.join(logsRoot, "stack", "plan.json");
	    writeFileSync(configPath, `${JSON.stringify({ logsRoot, trustedControlRoot: logsRoot, repoRoot: "/workspace/repos/Settleora", repositorySlug: "tommytang213/Settleora" })}\n`, { mode: 0o600 });
	    const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
	    assert.equal(config.mode, "pr-stack-run");
	    assert.equal(config.configPath, configPath);
	    assert.equal(config.logsRoot, logsRoot);
	  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects outside symlink writable directory oversized invalid and mismatched configs before stack lock", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-stack-config-trust-"));
  try {
    const logsRoot = path.join(root, "logs");
    const outsideRoot = path.join(root, "outside");
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    mkdirSync(outsideRoot, { recursive: true, mode: 0o700 });
    const planPath = path.join(logsRoot, "stack", "plan.json");
	    const validBody = { logsRoot, trustedControlRoot: logsRoot, repoRoot: "/workspace/repos/Settleora", repositorySlug: "tommytang213/Settleora" };
	    const outsideConfig = path.join(outsideRoot, "runner-config.json");
	    writeFileSync(outsideConfig, `${JSON.stringify({ ...validBody, logsRoot: outsideRoot, trustedControlRoot: outsideRoot })}\n`, { mode: 0o600 });
	    assert.throws(
	      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", outsideConfig, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
	      /externally anchored trusted control root/,
	    );
	    const selfDeclaringLogs = path.join(logsRoot, "self-declared-outside-logs.json");
	    writeFileSync(selfDeclaringLogs, `${JSON.stringify({ ...validBody, logsRoot: outsideRoot })}\n`, { mode: 0o600 });
	    assert.throws(
	      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", selfDeclaringLogs, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
	      /logsRoot must remain under the externally anchored trusted control root/,
	    );
	    const selfDeclaringTrusted = path.join(logsRoot, "self-declared-outside-trusted.json");
	    writeFileSync(selfDeclaringTrusted, `${JSON.stringify({ ...validBody, trustedControlRoot: outsideRoot })}\n`, { mode: 0o600 });
	    assert.throws(
	      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", selfDeclaringTrusted, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
	      /trustedControlRoot must remain under the externally anchored trusted control root/,
	    );

    const target = path.join(logsRoot, "target.json");
    const link = path.join(logsRoot, "link.json");
    writeFileSync(target, `${JSON.stringify(validBody)}\n`, { mode: 0o600 });
    symlinkSync(target, link);
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", link, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /must not be a symlink/);

    const writable = path.join(logsRoot, "writable.json");
    writeFileSync(writable, `${JSON.stringify(validBody)}\n`, { mode: 0o600 });
    chmodSync(writable, 0o620);
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", writable, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /group\/world writable/);

    const directory = path.join(logsRoot, "directory-config.json");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", directory, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /regular file/);

    const oversized = path.join(logsRoot, "oversized.json");
    writeFileSync(oversized, `{ "logsRoot": ${JSON.stringify(logsRoot)}, "padding": "${"x".repeat(1024 * 1024)}" }\n`, { mode: 0o600 });
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", oversized, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /bounded size/);

    const invalidUtf8 = path.join(logsRoot, "invalid-utf8.json");
    writeFileSync(invalidUtf8, Buffer.from([0xff, 0xfe, 0xfd]), { mode: 0o600 });
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", invalidUtf8, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /valid UTF-8/);

    const invalidJson = path.join(logsRoot, "invalid-json.json");
    writeFileSync(invalidJson, "{bad", { mode: 0o600 });
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", invalidJson, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /JSON is malformed/);

    const mismatch = path.join(logsRoot, "mismatch.json");
	    writeFileSync(mismatch, `${JSON.stringify({ logsRoot, trustedControlRoot: logsRoot, repoRoot: "/workspace/repos/Settleora", repositorySlug: "other/Settleora" })}\n`, { mode: 0o600 });
	    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", mismatch, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /approved repository identity/);
	  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
