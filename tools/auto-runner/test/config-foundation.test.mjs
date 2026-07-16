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
