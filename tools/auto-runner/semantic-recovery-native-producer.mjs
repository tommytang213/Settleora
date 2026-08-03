#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadDeploymentProjectAuthority } from "./lib/config.mjs";
import { authenticateSemanticDeploymentEvidencePackage } from "./lib/deployment-semantic-evidence-package.mjs";
import {
  collectSemanticDeploymentEvidenceContext,
  createSemanticDeploymentAuthorityReaders,
} from "./lib/deployment-semantic-evidence-extractors.mjs";
import {
  planSemanticRecoveryGrant,
  planSemanticRecoveryNativeInstall,
  readSemanticRecoverySupportFiles,
  verifyInstalledSemanticRecoveryNativeProducer,
  verifySemanticRecoveryGrantPlan,
  verifySemanticRecoveryNativeInstallPlan,
} from "./lib/semantic-recovery-native-producer.mjs";

const maximumInputBytes = 8 * 1024 * 1024;
const repositoryRoot = realpathSync("/workspace/repos/Settleora");
const runtimeRoot = "/workspace/auto-runner/runtime";
const supportedModes = new Set(["--plan-install", "--verify-install-plan", "--plan-grant", "--verify-grant-plan", "--verify-installed"]);

export async function main(argv = process.argv.slice(2), input = process.stdin) {
  if (argv.length !== 1 || !supportedModes.has(argv[0])) throw new Error("one supported non-mutating semantic recovery mode is required");
  const request = await readCanonicalInput(input);
  let result;
  if (argv[0] === "--plan-install") result = planInstall(request);
  else if (argv[0] === "--verify-install-plan") result = verifyInstallPackage(request);
  else if (argv[0] === "--plan-grant") result = encodeGrantPlan(planSemanticRecoveryGrant(request));
  else if (argv[0] === "--verify-grant-plan") result = verifyGrantPackage(request);
  else result = verifyInstalled(request);
  process.stderr.write(`${summary(argv[0], result)}\n`);
  process.stdout.write(`${canonicalJson(result)}\n`);
  return result;
}

function planInstall(request) {
  const authenticated = authenticateSemanticDeploymentEvidencePackage(request?.source?.deploymentEvidenceDocument);
  if (authenticated.evidence.sha256 !== request.source.sha256) throw new Error("semantic native selected evidence digest mismatch");
  const document = authenticated.document;
  if (document.project?.repositorySlug?.toLowerCase() !== request.repository.toLowerCase()) {
    throw new Error("semantic native selected repository mismatch");
  }
  const projectRequest = {
    configPath: document.config.path,
    approvedProfilePath: document.approvedProfile.path,
    repoRoot: repositoryRoot,
    runtimeRoot,
    healthUnitPath: document.healthUnit.path,
    allowRuntimeBootstrap: false,
  };
  const selectors = {
    incidentPath: document.authenticatedProvenance.incidentArtifact.path,
    incidentSha256: document.authenticatedProvenance.incidentArtifact.sha256,
    associatedRecoveryPath: document.associatedRecovery.path,
    associatedRecoverySha256: document.associatedRecovery.sha256,
  };
  const contextDigests = [];
  const readAuthorityContext = () => {
    const context = collectSemanticDeploymentEvidenceContext({
      projectAuthority: loadDeploymentProjectAuthority(projectRequest),
      repositoryRoot,
      ...selectors,
    });
    contextDigests.push(sha256(canonicalJson(context)));
    if (new Set(contextDigests).size !== 1) throw new Error("semantic native authority changed between independent reads");
    return context;
  };
  const supportPaths = [
    "tools/auto-runner/semantic-recovery-native-producer.mjs",
    ...readdirSync(path.join(repositoryRoot, "tools/auto-runner/lib"))
      .filter((name) => name.endsWith(".mjs"))
      .sort()
      .map((name) => `tools/auto-runner/lib/${name}`),
  ];
  const generated = planSemanticRecoveryNativeInstall({
    request,
    authorityReaders: createSemanticDeploymentAuthorityReaders({ readAuthorityContext }),
    readAuthorityContext,
    supportFiles: readSemanticRecoverySupportFiles(repositoryRoot, supportPaths),
  });
  const verified = verifySemanticRecoveryNativeInstallPlan(generated);
  if (!verified.ok) throw new Error("semantic native generated install plan did not verify");
  return encodeInstallPackage(generated);
}

function verifyInstallPackage(value) {
  const decoded = decodeInstallPackage(value);
  return verifySemanticRecoveryNativeInstallPlan(decoded);
}

function verifyGrantPackage(value) {
  assertExactKeys(value, ["artifact", "plan"]);
  assertExactKeys(value.artifact, ["byteCount", "bytesBase64", "destination", "gid", "mode", "nlink", "sha256", "uid"]);
  const { bytesBase64, ...artifact } = value.artifact;
  return verifySemanticRecoveryGrantPlan({ plan: value.plan, artifact: { ...artifact, bytes: decodeCanonicalBase64(bytesBase64) } });
}

function verifyInstalled(value) {
  const decoded = decodeInstallPackage(value);
  const planned = verifySemanticRecoveryNativeInstallPlan(decoded);
  if (!planned.ok) return planned;
  return verifyInstalledSemanticRecoveryNativeProducer({ plan: decoded.plan, filesystem: realFilesystem() });
}

function encodeInstallPackage(value) {
  return {
    plan: value.plan,
    artifacts: value.artifacts.map(({ bytes, ...artifact }) => ({
      ...artifact,
      ...(bytes ? { bytesBase64: Buffer.from(bytes).toString("base64") } : {}),
    })),
  };
}

function decodeInstallPackage(value) {
  assertExactKeys(value, ["artifacts", "plan"]);
  if (!Array.isArray(value.artifacts)) throw new Error("semantic native install artifacts invalid");
  return {
    plan: value.plan,
    artifacts: value.artifacts.map(({ bytesBase64, ...artifact }) => ({
      ...artifact,
      ...(bytesBase64 === undefined ? {} : { bytes: decodeCanonicalBase64(bytesBase64) }),
    })),
  };
}

function encodeGrantPlan(value) {
  const { bytes, ...artifact } = value.artifact;
  return { plan: value.plan, artifact: { ...artifact, bytesBase64: Buffer.from(bytes).toString("base64") } };
}

function realFilesystem() {
  return {
    inspect(target) {
      const stat = lstatSync(target);
      return { type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other", symlink: stat.isSymbolicLink(), uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o7777, nlink: stat.nlink, size: stat.size, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
    },
    read: (target) => readFileSync(target),
    realpath: (target) => realpathSync(target),
  };
}

async function readCanonicalInput(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maximumInputBytes) throw new Error("semantic native input too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trimEnd();
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("semantic native input JSON invalid"); }
  if (canonicalJson(value) !== text) throw new Error("semantic native input must be canonical JSON");
  return value;
}

function decodeCanonicalBase64(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error("semantic native artifact encoding invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("semantic native artifact encoding noncanonical");
  return bytes;
}

function summary(mode, result) {
  if (mode === "--plan-install") return `semantic recovery install plan: ${result.plan.summary.fileCount} files, ${result.plan.summary.authorityClassCount} independent stores, zero mutations`;
  if (mode === "--plan-grant") return `semantic recovery grant plan: operation ${result.plan.operationId}, successor execution excluded`;
  return `semantic recovery ${mode.slice(2)}: ${result.reasonCode || "complete"}`;
}

function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) throw new Error("unsupported or missing fields");
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`semantic recovery native producer failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
