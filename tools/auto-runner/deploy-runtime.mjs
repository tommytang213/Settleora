#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { acquireRuntimeDeploymentLock, deployRuntimeBundle, inspectDeploymentQuiescence, inspectRuntimeConsumers, releaseRuntimeDeploymentLock, rollbackRuntimeBundle, verifyRuntimeSourceAgainstCommit } from "./lib/runtime-bundle.mjs";

const booleanOptions = new Set(["--dry-run", "--rollback"]);
const valueOptions = new Set([
  "--destination", "--logs-root", "--repo-root", "--source-root", "--approved-sha",
  "--expected-old-digest", "--expected-rollback-digest",
  "--preserved-recovery-repository", "--preserved-recovery-issue", "--preserved-recovery-task-key",
  "--preserved-recovery-runner-run-id", "--preserved-recovery-supervisor-run-id",
  "--preserved-recovery-claim-identity", "--preserved-recovery-charge-id", "--preserved-recovery-branch",
  "--preserved-recovery-base-sha", "--preserved-recovery-head-sha", "--preserved-recovery-tree-sha",
  "--preserved-recovery-changed-files-digest", "--preserved-recovery-report-name",
  "--preserved-recovery-prompt-name", "--preserved-recovery-accepted-tasks",
  "--preserved-recovery-local-rounds", "--preserved-recovery-github-epochs",
  "--preserved-recovery-lifetime-rounds",
]);
const values = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (values.has(arg)) throw new Error(`duplicate option ${arg}`);
  if (booleanOptions.has(arg)) values.set(arg, true);
  else {
    if (!valueOptions.has(arg)) throw new Error(`unsupported option ${arg}`);
    const value = process.argv[++index];
    if (!value) throw new Error(`missing value for ${arg}`);
    values.set(arg, value);
  }
}
if (!values.has("--destination")) throw new Error("--destination is required");
if (!values.has("--logs-root")) throw new Error("--logs-root is required");
if (values.has("--rollback") && values.has("--dry-run")) throw new Error("--rollback and --dry-run cannot be combined");
const repoRoot = path.resolve(values.get("--repo-root") || "");
const sourceRoot = path.resolve(values.get("--source-root") || path.join(repoRoot, "tools/auto-runner"));
const destination = path.resolve(values.get("--destination") || "");
const logsRoot = path.resolve(values.get("--logs-root") || "");
const dryRunGitEnv = values.has("--dry-run") ? { ...process.env, GIT_OPTIONAL_LOCKS: "0" } : process.env;
const preservedOptionPrefix = "--preserved-recovery-";
const preservedOptionsPresent = [...values.keys()].filter((key) => key.startsWith(preservedOptionPrefix));
const preservedRecoveryTarget = preservedOptionsPresent.length === 0 ? null : {
  repository: values.get("--preserved-recovery-repository"),
  issueNumber: values.get("--preserved-recovery-issue"),
  taskKey: values.get("--preserved-recovery-task-key"),
  runnerRunId: values.get("--preserved-recovery-runner-run-id"),
  supervisorRunId: values.get("--preserved-recovery-supervisor-run-id"),
  claimIdentity: values.get("--preserved-recovery-claim-identity"),
  chargeId: values.get("--preserved-recovery-charge-id"),
  branch: values.get("--preserved-recovery-branch"),
  baseSha: values.get("--preserved-recovery-base-sha"),
  headSha: values.get("--preserved-recovery-head-sha"),
  treeSha: values.get("--preserved-recovery-tree-sha"),
  changedFilesDigest: values.get("--preserved-recovery-changed-files-digest"),
  reportName: values.get("--preserved-recovery-report-name"),
  promptName: values.get("--preserved-recovery-prompt-name"),
  acceptedLogicalTasks: values.get("--preserved-recovery-accepted-tasks"),
  localSourceChangingRounds: values.get("--preserved-recovery-local-rounds"),
  githubTriggeredFixEpochs: values.get("--preserved-recovery-github-epochs"),
  lifetimeLocalSourceChangingRounds: values.get("--preserved-recovery-lifetime-rounds"),
};
if (values.has("--rollback") && preservedRecoveryTarget) throw new Error("rollback does not accept preserved recovery authority");
let deploymentLock = null;
try {
const quiescence = inspectDeploymentQuiescence(logsRoot, { preservedRecoveryTarget });
const runtimeConsumers = inspectRuntimeConsumers(destination);
if (values.has("--rollback")) {
  deploymentLock = acquireRuntimeDeploymentLock(destination);
  const lockedQuiescence = inspectDeploymentQuiescence(logsRoot);
  const lockedRuntimeConsumers = inspectRuntimeConsumers(destination);
  if (JSON.stringify(lockedQuiescence) !== JSON.stringify(quiescence)) throw new Error("runtime rollback quiescence proof changed after lock acquisition");
  if (lockedRuntimeConsumers.length || JSON.stringify(lockedRuntimeConsumers) !== JSON.stringify(runtimeConsumers)) {
    throw new Error("runtime rollback consumer proof changed after lock acquisition");
  }
  const result = rollbackRuntimeBundle({
    destination,
    expectedCurrentDigest: values.get("--expected-old-digest"),
    expectedRollbackDigest: values.get("--expected-rollback-digest"),
    active: lockedQuiescence.active,
    pendingEffects: lockedQuiescence.pendingEffects,
    runtimeConsumers: lockedRuntimeConsumers,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 0;
} else {
if (sourceRoot !== path.join(repoRoot, "tools/auto-runner")) {
  throw new Error("sourceRoot must be the approved repository tools/auto-runner directory");
}
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
const status = spawnSync("git", ["-c", "core.fsmonitor=false", "status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", env: dryRunGitEnv });
if (head.status !== 0 || status.status !== 0 || status.stdout) throw new Error("source repository must be clean and readable");
const approvedSha = values.get("--approved-sha");
if (head.stdout.trim() !== approvedSha) throw new Error("source HEAD does not equal --approved-sha");
verifyRuntimeSourceAgainstCommit({ repoRoot, sourceRoot, sourceSha: approvedSha });
if (!values.has("--dry-run")) deploymentLock = acquireRuntimeDeploymentLock(destination);
if (!values.has("--dry-run")) {
  const lockedQuiescence = inspectDeploymentQuiescence(logsRoot, { preservedRecoveryTarget });
  if (JSON.stringify(lockedQuiescence) !== JSON.stringify(quiescence)) throw new Error("runtime deployment quiescence proof changed after lock acquisition");
}
const result = deployRuntimeBundle({
  sourceRoot,
  destination,
  repoRoot,
  logsRoot,
  sourceSha: approvedSha,
  expectedOldDigest: values.get("--expected-old-digest") || null,
  dryRun: values.has("--dry-run"),
  quiescence,
  runtimeConsumers,
  sourceVerifier: () => {
    const verifiedHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
    const verifiedStatus = spawnSync("git", ["-c", "core.fsmonitor=false", "status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", env: dryRunGitEnv });
    if (verifiedHead.status !== 0 || verifiedHead.stdout.trim() !== approvedSha || verifiedStatus.status !== 0 || verifiedStatus.stdout) {
      throw new Error("source repository changed during deployment");
    }
    verifyRuntimeSourceAgainstCommit({ repoRoot, sourceRoot, sourceSha: approvedSha });
  },
  finalQuiescenceVerifier: values.has("--dry-run")
    ? null
    : () => {
        const consumers = inspectRuntimeConsumers(destination);
        if (consumers.length) throw new Error("runtime deployment refused while the shared runtime has active consumers");
        return inspectDeploymentQuiescence(logsRoot, { preservedRecoveryTarget });
      },
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
} finally {
  releaseRuntimeDeploymentLock(deploymentLock);
}
