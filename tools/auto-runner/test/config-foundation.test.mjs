import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, chownSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultLogsRoot, loadConfig, parseCliArgs } from "../lib/config.mjs";

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

test("stack config trust boundary accepts documented live acceptance config layout", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260717-2347");
    const explicit = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
    assert.equal(explicit.mode, "pr-stack-run");
    assert.equal(explicit.configPath, configPath);
    assert.equal(explicit.logsRoot, logsRoot);
    assert.equal(explicit.configTrustEvidence.externalRootSource, "trusted_capability");
    assert.equal(explicit.configTrustEvidence.canonicalRoot, logsRoot);
    assert.equal(explicit.configTrustEvidence.relativePurposePath, "live-stack-acceptance/20260717-2347/config.json");
    assert.equal(explicit.configTrustEvidence.taskCorrelation, "20260717-2347");
    assert.equal(explicit.configTrustEvidence.type, "regular_file");
    assert.equal(explicit.configTrustEvidence.mode, 0o600);
    assert.match(explicit.configTrustEvidence.digestSha256, /^[a-f0-9]{64}$/);

    const previous = process.env.SETTLEORA_STACK_TRUST_ROOT;
    process.env.SETTLEORA_STACK_TRUST_ROOT = logsRoot;
    try {
      const fromEnv = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]));
      assert.equal(fromEnv.configTrustEvidence.externalRootSource, "process_env");
      assert.equal(fromEnv.configTrustEvidence.canonicalRoot, explicit.configTrustEvidence.canonicalRoot);
      assert.equal(fromEnv.configTrustEvidence.canonicalConfigPath, explicit.configTrustEvidence.canonicalConfigPath);
      assert.equal(fromEnv.configTrustEvidence.relativePurposePath, explicit.configTrustEvidence.relativePurposePath);
      assert.equal(fromEnv.configTrustEvidence.taskCorrelation, explicit.configTrustEvidence.taskCorrelation);
      assert.equal(fromEnv.configTrustEvidence.digestSha256, explicit.configTrustEvidence.digestSha256);
    } finally {
      restoreEnv("SETTLEORA_STACK_TRUST_ROOT", previous);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary accepts the current durable resume path shape", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260717-2347", {
      repository: "tommytang213/Settleora",
      protectedRoot: "/workspace/repos/Settleora",
    });
    assert.equal(
      configPath,
      path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "config.json"),
    );
    const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
    assert.equal(config.configTrustEvidence.relativePurposePath, "live-stack-acceptance/20260717-2347/config.json");
    assert.equal(config.configTrustEvidence.repositorySlug, "tommytang213/Settleora");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects arbitrary bootstrap roots before filesystem validation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-stack-config-untrusted-"));
  try {
    const logsRoot = path.join(root, "logs");
    const configPath = path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "config.json");
    const planPath = path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "plan.json");
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /bootstrap_root_outside_runner_logs/,
    );

    const previous = process.env.SETTLEORA_STACK_TRUST_ROOT;
    process.env.SETTLEORA_STACK_TRUST_ROOT = logsRoot;
    try {
      assert.throws(
        () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath])),
        /bootstrap_root_outside_runner_logs/,
      );
    } finally {
      restoreEnv("SETTLEORA_STACK_TRUST_ROOT", previous);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects invalid live acceptance layouts before stack lock", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const outsideRoot = path.join(root, "outside");
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    mkdirSync(outsideRoot, { recursive: true, mode: 0o700 });
    const { planPath } = writeStackConfig(logsRoot, "20260717-2347");
    const body = validStackConfig(logsRoot);

    const cases = [
      [path.join(logsRoot, "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "other-purpose", "20260717-2347", "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "nested", "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "runner-config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "bad key", "config.json"), /config_invalid_correlation_segment/],
    ];
    for (const [candidate, expected] of cases) {
      mkdirSync(path.dirname(candidate), { recursive: true, mode: 0o700 });
      writeFileSync(candidate, `${JSON.stringify(body)}\n`, { mode: 0o600 });
      assert.throws(
        () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", candidate, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
        expected,
      );
    }

    const escapeConfig = path.join(outsideRoot, "live-stack-acceptance", "20260717-2347", "config.json");
    mkdirSync(path.dirname(escapeConfig), { recursive: true, mode: 0o700 });
    writeFileSync(escapeConfig, `${JSON.stringify({ ...body, logsRoot: outsideRoot })}\n`, { mode: 0o600 });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", escapeConfig, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_outside_bootstrap_root/,
    );
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "..", "..", "config.json"), "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_path_not_canonical|config_wrong_purpose_layout/,
    );

    const { configPath: target } = writeStackConfig(logsRoot, "20260717-2350");
    const link = path.join(logsRoot, "live-stack-acceptance", "20260717-2351", "config.json");
    mkdirSync(path.dirname(link), { recursive: true, mode: 0o700 });
    symlinkSync(target, link);
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", link, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_symlink_escape|config_canonical_alias_mismatch/);

    const aliasRoot = path.join(root, "alias-root");
    symlinkSync(logsRoot, aliasRoot);
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", path.join(aliasRoot, "live-stack-acceptance", "20260717-2347", "config.json"), "--stack-plan", planPath]), { prStackTrustedRoot: aliasRoot }),
      /bootstrap_root_symlink|bootstrap_root_canonical_alias_mismatch/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects invalid file and parsed identity cases before stack lock", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const outsideRoot = path.join(root, "outside");
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    mkdirSync(outsideRoot, { recursive: true, mode: 0o700 });
    const { planPath } = writeStackConfig(logsRoot, "20260717-2347");
    const body = validStackConfig(logsRoot);

    const writable = liveConfigPath(logsRoot, "20260717-2352");
    writeConfigFile(writable, body);
    chmodSync(writable, 0o620);
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", writable, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_mode_group_world_writable|config_mode_not_restrictive/);

    const readableByGroup = liveConfigPath(logsRoot, "20260717-2353");
    writeConfigFile(readableByGroup, body);
    chmodSync(readableByGroup, 0o640);
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", readableByGroup, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_mode_not_restrictive/);

    const directory = liveConfigPath(logsRoot, "20260717-2354");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", directory, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_file_type_invalid/);

    const oversized = liveConfigPath(logsRoot, "20260717-2355");
    mkdirSync(path.dirname(oversized), { recursive: true, mode: 0o700 });
    writeFileSync(oversized, `{ "logsRoot": ${JSON.stringify(logsRoot)}, "padding": "${"x".repeat(1024 * 1024)}" }\n`, { mode: 0o600 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", oversized, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_size_exceeded/);

    const invalidUtf8 = liveConfigPath(logsRoot, "20260717-2356");
    mkdirSync(path.dirname(invalidUtf8), { recursive: true, mode: 0o700 });
    writeFileSync(invalidUtf8, Buffer.from([0xff, 0xfe, 0xfd]), { mode: 0o600 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", invalidUtf8, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_utf8_invalid/);

    const invalidJson = liveConfigPath(logsRoot, "20260717-2357");
    mkdirSync(path.dirname(invalidJson), { recursive: true, mode: 0o700 });
    writeFileSync(invalidJson, "{bad", { mode: 0o600 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", invalidJson, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_json_invalid/);

    const mismatch = liveConfigPath(logsRoot, "20260717-2358");
    writeConfigFile(mismatch, { ...body, repositorySlug: "other/Settleora" });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", mismatch, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_identity_mismatch/);

    const repoRootMismatch = liveConfigPath(logsRoot, "20260717-2359");
    writeConfigFile(repoRootMismatch, { ...body, repoRoot: outsideRoot });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", repoRootMismatch, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_repo_root_mismatch/);

    const selfDeclaringLogs = liveConfigPath(logsRoot, "20260717-2360");
    writeConfigFile(selfDeclaringLogs, { ...body, logsRoot: outsideRoot });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", selfDeclaringLogs, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_root_incompatible/,
    );
    const selfDeclaringTrusted = liveConfigPath(logsRoot, "20260717-2361");
    writeConfigFile(selfDeclaringTrusted, { ...body, trustedControlRoot: outsideRoot });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", selfDeclaringTrusted, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_root_incompatible/,
    );

    const previous = process.env.SETTLEORA_STACK_TRUST_ROOT;
    process.env.SETTLEORA_STACK_TRUST_ROOT = outsideRoot;
    try {
      assert.throws(
        () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", liveConfigPath(logsRoot, "20260717-2347"), "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
        /bootstrap_root_conflict/,
      );
    } finally {
      restoreEnv("SETTLEORA_STACK_TRUST_ROOT", previous);
    }

    const wrongOwner = liveConfigPath(logsRoot, "20260717-2362");
    writeConfigFile(wrongOwner, body);
    if (typeof process.getuid === "function" && typeof process.getgid === "function") {
      try {
        chownSync(wrongOwner, process.getuid() + 1, process.getgid());
        assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", wrongOwner, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_owner_invalid/);
      } catch (error) {
        if (!["EPERM", "EINVAL"].includes(error.code)) throw error;
        const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", wrongOwner, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
        assert.equal(config.configTrustEvidence.uid, process.getuid());
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust descriptor read binds bytes and closes descriptors", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-descriptor-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260718-0010", { marker: "opened" });
    const replacement = { ...validStackConfig(logsRoot), marker: "replacement" };

    const fdsBefore = readdirSync("/proc/self/fd").length;
    const config = loadConfig(
      parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]),
      {
        prStackTrustedRoot: logsRoot,
        configTrustHooks: {
          beforeRead: ({ configPath: openedPath }) => {
            rmSync(openedPath);
            writeConfigFile(openedPath, replacement);
          },
        },
      },
    );
    assert.equal(config.marker, "opened");
    assert.notEqual(JSON.parse(readFileSync(configPath, "utf8")).marker, config.marker);
    assert.equal(readdirSync("/proc/self/fd").length, fdsBefore);

    writeConfigFile(configPath, { ...validStackConfig(logsRoot), marker: "opened-again" });
    assert.throws(
      () => loadConfig(
        parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]),
        {
          prStackTrustedRoot: logsRoot,
          configTrustHooks: {
            afterOpen: ({ configPath: openedPath }) => {
              rmSync(openedPath);
            },
          },
        },
      ),
      /config_missing|config_identity_mismatch/,
    );
    assert.equal(readdirSync("/proc/self/fd").length, fdsBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust descriptor read rejects growth after fstat without unbounded read", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-growth-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260718-0011", { marker: "opened" });
    const originalSize = readFileSync(configPath).length;
    let boundedBytes = null;

    const fdsBefore = readdirSync("/proc/self/fd").length;
    assert.throws(
      () => loadConfig(
        parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]),
        {
          prStackTrustedRoot: logsRoot,
          configTrustHooks: {
            beforeRead: ({ configPath: openedPath }) => {
              writeFileSync(openedPath, `${JSON.stringify({ ...validStackConfig(logsRoot), marker: "grown" })}\n${"x".repeat(1024 * 1024 + 1)}`, { mode: 0o600 });
            },
            afterRead: ({ bytesRead }) => {
              boundedBytes = bytesRead;
            },
          },
        },
      ),
      /config_identity_mismatch/,
    );
    assert.equal(boundedBytes, originalSize);
    assert.equal(readdirSync("/proc/self/fd").length, fdsBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeStackConfig(logsRoot, taskCorrelation, overrides = {}) {
  mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
  chmodSync(logsRoot, 0o700);
  const configPath = liveConfigPath(logsRoot, taskCorrelation);
  const planPath = path.join(logsRoot, "live-stack-acceptance", taskCorrelation, "plan.json");
  writeConfigFile(configPath, { ...validStackConfig(logsRoot), ...overrides });
  return { configPath, planPath };
}

function makeTrustedTestRoot(prefix) {
  mkdirSync(defaultLogsRoot, { recursive: true, mode: 0o700 });
  return mkdtempSync(path.join(defaultLogsRoot, prefix));
}

function liveConfigPath(logsRoot, taskCorrelation) {
  return path.join(logsRoot, "live-stack-acceptance", taskCorrelation, "config.json");
}

function writeConfigFile(filePath, body) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(filePath), 0o700);
  writeFileSync(filePath, `${JSON.stringify(body)}\n`, { mode: 0o600 });
}

function validStackConfig(logsRoot) {
  return {
    logsRoot,
    trustedControlRoot: path.join(logsRoot, "trusted-control"),
    repoRoot: "/workspace/repos/Settleora",
    repositorySlug: "tommytang213/Settleora",
  };
}

function restoreEnv(name, previous) {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}
