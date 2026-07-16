import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("trusted outage controller capability alone does not enable bounded resubmission", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: false } }, ({ configPath }) => {
    const config = loadConfig(
      { ...parseCliArgs(["--preflight", "--config", configPath]) },
      { outageResubmissionControllerAvailable: true },
    );
    assert.equal(config.outageResubmission.allowBoundedOutageResubmission, false);
  });
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

test("PR B config parser owns targeted recovery CLI without granting outage controller capability", () => {
  const parsed = parseCliArgs([
    "--run",
    "--supervisor-run-id",
    "supervised-20260716T120000Z-abcdefabcdef",
    "--outage-recovery-only",
    "--outage-target-task-key",
    "20260716-1428",
    "--outage-target-issue",
    "913",
    "--outage-target-branch",
    "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213",
    "--outage-target-base-sha",
    "3b3212c43c702db3cabdaff1c28d089f39c54441",
    "--outage-target-head-sha",
    "ecd314629ac5a07cc40abdfaac1d12a1d3b13335",
    "--outage-target-pr",
    "919",
    "--outage-target-pr-head-sha",
    "ecd314629ac5a07cc40abdfaac1d12a1d3b13335",
    "--outage-target-runner-run-id",
    "run-2026-07-16T120000Z",
    "--outage-target-supervisor-run-id",
    "supervised-20260716T120000Z-abcdefabcdef",
    "--outage-target-original-spec-digest",
    "a".repeat(64),
    "--outage-target-marker-key",
    "b".repeat(64),
    "--outage-target-fingerprint",
    "c".repeat(64),
    "--outage-target-attempt",
    "1",
  ]);
  assert.equal(parsed.outageRecoveryOnly, true);
  assert.equal(parsed.maxIterations, 1);

  const config = loadConfig({ ...parsed, configPath: null });
  assert.equal(config.outageRecoveryOnly, true);
  assert.equal(config.requestedMaxIterations, 1);
  assert.equal(config.outageRecoveryTarget.issueNumber, 913);
  assert.equal(config.outageResubmission.allowBoundedOutageResubmission, false);
});
