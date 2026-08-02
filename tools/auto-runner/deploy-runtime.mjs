#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { acquireRuntimeDeploymentLock, deployRuntimeBundle, inspectDeploymentQuiescence, inspectRuntimeConsumers, releaseRuntimeDeploymentLock, rollbackRuntimeBundle, verifyRuntimeSourceAgainstCommit } from "./lib/runtime-bundle.mjs";
import { loadDeploymentProjectAuthority, readOwnerControlledExternalJson } from "./lib/config.mjs";
import { sanitizedDeploymentGitEnvironment, trustedDeploymentGitBinary } from "./lib/preserved-recovery-deployment.mjs";

const booleanOptions = new Set(["--dry-run", "--rollback", "--development-unbound-project-root"]);
const valueOptions = new Set([
  "--destination", "--logs-root", "--repo-root", "--source-root", "--approved-sha", "--config",
  "--approved-profile", "--health-unit", "--semantic-deployment-evidence",
  "--expected-old-digest", "--expected-rollback-digest",
  "--preserved-recovery-repository", "--preserved-recovery-issue", "--preserved-recovery-task-key",
  "--preserved-recovery-runner-run-id", "--preserved-recovery-supervisor-run-id",
  "--preserved-recovery-claim-identity", "--preserved-recovery-charge-id", "--preserved-recovery-branch",
  "--preserved-recovery-base-sha", "--preserved-recovery-head-sha", "--preserved-recovery-tree-sha",
  "--preserved-recovery-changed-files-digest", "--preserved-recovery-diff-digest", "--preserved-recovery-report-name",
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
const explicitLogsRoot = values.has("--logs-root") ? path.resolve(values.get("--logs-root")) : null;
const developmentUnbound = values.has("--development-unbound-project-root");
const configPath = values.has("--config") ? path.resolve(values.get("--config")) : null;
const approvedProfilePath = values.has("--approved-profile") ? path.resolve(values.get("--approved-profile")) : null;
const healthUnitPath = values.has("--health-unit") ? path.resolve(values.get("--health-unit")) : null;
const semanticEvidencePath = values.has("--semantic-deployment-evidence") ? path.resolve(values.get("--semantic-deployment-evidence")) : null;
if (configPath && developmentUnbound) throw new Error("trusted config and development-unbound project root cannot be combined");
if (!configPath && !developmentUnbound) throw new Error("trusted deployment requires --config or explicit --development-unbound-project-root");
if (configPath && (!approvedProfilePath || !healthUnitPath)) {
  throw new Error("trusted deployment requires --approved-profile and --health-unit");
}
if (!configPath && (approvedProfilePath || healthUnitPath || semanticEvidencePath)) {
  throw new Error("development-unbound deployment cannot accept trusted profile or semantic evidence");
}
if (values.has("--rollback") && semanticEvidencePath) throw new Error("rollback does not accept semantic incident deployment evidence");
if (developmentUnbound && !explicitLogsRoot) throw new Error("development-unbound deployment requires --logs-root");
if (developmentUnbound) assertDevelopmentUnboundPaths({ destination, logsRoot: explicitLogsRoot });
const loadProjectAuthority = configPath
  ? () => loadDeploymentProjectAuthority({
      configPath,
      approvedProfilePath,
      repoRoot,
      runtimeRoot: destination,
      logsRoot: explicitLogsRoot,
      healthUnitPath,
    })
  : () => null;
const initialProjectAuthority = loadProjectAuthority();
const logsRoot = initialProjectAuthority?.logsRoot || explicitLogsRoot;
const inspectCurrentQuiescence = () => {
  const projectAuthority = loadProjectAuthority();
  if ((projectAuthority?.evidenceDigest || null) !== (initialProjectAuthority?.evidenceDigest || null)
      || (projectAuthority?.logsRoot || explicitLogsRoot) !== logsRoot) {
    throw new Error("deployment project authority changed during deployment");
  }
  const semanticDeploymentEvidence = semanticEvidencePath
    ? readOwnerControlledExternalJson(semanticEvidencePath)
    : null;
  return inspectDeploymentQuiescence(logsRoot, {
    preservedRecoveryTarget,
    semanticDeploymentEvidence,
    deploymentProjectAuthority: projectAuthority,
    repositoryRoot: repoRoot,
  });
};
const deploymentGitEnv = sanitizedDeploymentGitEnvironment();
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
  diffDigest: values.get("--preserved-recovery-diff-digest"),
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
const quiescence = inspectCurrentQuiescence();
const runtimeConsumers = inspectRuntimeConsumers(destination);
if (quiescence.unresolvedExternalEffects || quiescence.active) {
  process.stderr.write(`${JSON.stringify({ deploymentQuiescence: quiescence })}\n`);
}
if (values.has("--rollback")) {
  deploymentLock = acquireRuntimeDeploymentLock(destination);
  const lockedQuiescence = inspectCurrentQuiescence();
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
const topLevel = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "rev-parse", "--show-toplevel"], { cwd: repoRoot, encoding: "utf8", env: deploymentGitEnv });
const head = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", env: deploymentGitEnv });
const status = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "-c", "core.fsmonitor=false", "status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", env: deploymentGitEnv });
if (topLevel.status !== 0 || path.resolve(topLevel.stdout.trim()) !== repoRoot) throw new Error("source repository identity is unreadable");
if (head.status !== 0 || status.status !== 0 || status.stdout) throw new Error("source repository must be clean and readable");
const approvedSha = values.get("--approved-sha");
if (head.stdout.trim() !== approvedSha) throw new Error("source HEAD does not equal --approved-sha");
verifyRuntimeSourceAgainstCommit({ repoRoot, sourceRoot, sourceSha: approvedSha });
if (!values.has("--dry-run")) deploymentLock = acquireRuntimeDeploymentLock(destination);
if (!values.has("--dry-run")) {
  const lockedQuiescence = inspectCurrentQuiescence();
  const lockedProofChanged = JSON.stringify(lockedQuiescence) !== JSON.stringify(quiescence);
  if (lockedQuiescence.unresolvedExternalEffects || lockedQuiescence.active || lockedProofChanged) {
    process.stderr.write(`${JSON.stringify({
      deploymentQuiescence: lockedQuiescence,
      ...(lockedProofChanged ? { reasonCode: "runtime_deployment_quiescence_proof_changed", stage: "after_lock" } : {}),
    })}\n`);
  }
  if (lockedProofChanged) throw new Error("runtime deployment quiescence proof changed after lock acquisition");
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
    const verifiedTopLevel = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "rev-parse", "--show-toplevel"], { cwd: repoRoot, encoding: "utf8", env: deploymentGitEnv });
    const verifiedHead = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", env: deploymentGitEnv });
    const verifiedStatus = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "-c", "core.fsmonitor=false", "status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", env: deploymentGitEnv });
    if (verifiedTopLevel.status !== 0 || path.resolve(verifiedTopLevel.stdout.trim()) !== repoRoot
        || verifiedHead.status !== 0 || verifiedHead.stdout.trim() !== approvedSha || verifiedStatus.status !== 0 || verifiedStatus.stdout) {
      throw new Error("source repository changed during deployment");
    }
    verifyRuntimeSourceAgainstCommit({ repoRoot, sourceRoot, sourceSha: approvedSha });
  },
  finalQuiescenceVerifier: values.has("--dry-run")
      ? null
      : () => {
        const consumers = inspectRuntimeConsumers(destination);
        if (consumers.length) throw new Error("runtime deployment refused while the shared runtime has active consumers");
        const finalQuiescence = inspectCurrentQuiescence();
        const finalProofChanged = JSON.stringify(finalQuiescence) !== JSON.stringify(quiescence);
        if (finalQuiescence.unresolvedExternalEffects || finalQuiescence.active || finalProofChanged) {
          process.stderr.write(`${JSON.stringify({
            deploymentQuiescence: finalQuiescence,
            ...(finalProofChanged ? { reasonCode: "runtime_deployment_quiescence_proof_changed", stage: "before_exchange" } : {}),
          })}\n`);
        }
        return finalQuiescence;
      },
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
} finally {
  releaseRuntimeDeploymentLock(deploymentLock);
}

function assertDevelopmentUnboundPaths({ destination: runtimeDestination, logsRoot: developmentLogsRoot }) {
  for (const [field, value] of [["destination", runtimeDestination], ["logsRoot", developmentLogsRoot]]) {
    if (value === "/workspace/auto-runner" || value.startsWith("/workspace/auto-runner/")
        || value === "/workspace/logs/auto-runner" || value.startsWith("/workspace/logs/auto-runner/")) {
      throw new Error(`development-unbound ${field} cannot target trusted production roots`);
    }
  }
}
