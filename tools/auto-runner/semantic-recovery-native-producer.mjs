#!/usr/bin/node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadDeploymentProjectAuthority } from "./lib/config.mjs";
import { authenticateSemanticDeploymentEvidencePackage } from "./lib/deployment-semantic-evidence-package.mjs";
import {
  collectSemanticDeploymentEvidenceContext,
  createSemanticDeploymentAuthorityReaders,
} from "./lib/deployment-semantic-evidence-extractors.mjs";
import {
  authenticateConfiguredSemanticRecoveryAuthority,
  buildSemanticRecoveryManifest,
  constructPostIncidentSuccessor,
} from "./lib/post-incident-successor-recovery.mjs";
import {
  normalizeSemanticRecoveryNativeProducerRequest,
  planSemanticRecoveryGrant,
  planSemanticRecoveryNativeInstall,
  readSemanticRecoverySupportFiles,
  verifyInstalledSemanticRecoveryNativeProducer,
  verifySemanticRecoveryGrantPlan,
  verifySemanticRecoveryNativeInstallPlan,
} from "./lib/semantic-recovery-native-producer.mjs";
import {
  persistExactSemanticRecoverySuccessorFromNativeProducer,
  readbackProtectedSemanticRecoverySuccessor,
  semanticRecoveryProtectedLayout,
} from "./lib/semantic-recovery-protected-store.mjs";

const maximumInputBytes = 8 * 1024 * 1024;
const fixedNodeRuntimePath = "/usr/bin/node";
const sourceAuthenticationMode = "--authenticate-successor-internal";
const sourcePlanMode = "--plan-install-internal";
const sourceGrantPlanMode = "--derive-grant-manifest-internal";
const repositoryRoot = realpathSync("/workspace/repos/Settleora");
const runtimeRoot = "/workspace/auto-runner/runtime";
const configPath = "/workspace/auto-runner/config/settleora.json";
const approvedProfilePath = "/workspace/auto-runner/config/settleora-production-approved-20260724-0946.json";
const healthUnitPath = "/home/tommytang213/.config/systemd/user/settleora-auto-runner-health.service";
const supportedModes = new Set(["--plan-install", "--verify-install-plan", "--plan-grant", "--verify-grant-plan", "--verify-installed", "--persist-successor", "--readback-successor", sourceAuthenticationMode, sourcePlanMode, sourceGrantPlanMode]);

export async function main(argv = process.argv.slice(2), input = process.stdin) {
  if (argv.length !== 1 || !supportedModes.has(argv[0])) throw new Error("one supported semantic recovery mode is required");
  const request = await readCanonicalInput(input);
  let result;
  if (argv[0] === sourceAuthenticationMode) result = executeSourceAuthentication(request);
  else if (argv[0] === sourcePlanMode) result = executeSourcePlan(request);
  else if (argv[0] === sourceGrantPlanMode) result = executeSourceGrantPlan(request);
  else if (argv[0] === "--plan-install") result = planInstall(request);
  else if (argv[0] === "--verify-install-plan") result = verifyInstallPackage(request);
  else if (argv[0] === "--plan-grant") result = planGrantFromInstalled(request);
  else if (argv[0] === "--verify-grant-plan") result = verifyGrantPackage(request);
  else if (argv[0] === "--verify-installed") result = verifyInstalled(request);
  else result = executeProtectedSuccessorOperation(argv[0], request);
  if (![sourceAuthenticationMode, sourcePlanMode, sourceGrantPlanMode].includes(argv[0])) process.stderr.write(`${summary(argv[0], result)}\n`);
  process.stdout.write(`${canonicalJson(result)}\n`);
  return result;
}

function planInstall(request) {
  const normalized = normalizeSemanticRecoveryNativeProducerRequest(request);
  const route = semanticRecoveryPlanExecutionRoute();
  if (route === "installed_root_source_subprocess") {
    assertInstalledProducerInvocation();
    const encoded = runSourceProcess(trustedSourceIdentity(), sourcePlanMode, normalized);
    const decoded = decodeInstallPackage(encoded);
    if (!verifySemanticRecoveryNativeInstallPlan(decoded).ok) throw new Error("semantic native delegated install plan invalid");
    return encoded;
  }
  return planInstallFromAuthenticatedSource(normalized);
}

function executeSourcePlan(request) {
  const normalized = normalizeSemanticRecoveryNativeProducerRequest(request);
  const sourceIdentity = trustedSourceIdentity();
  assertInstalledProducerInvocation({ rootRequired: false });
  assertSourceProcessIdentity(sourceIdentity);
  return planInstallFromAuthenticatedSource(normalized);
}

function planInstallFromAuthenticatedSource(request) {
  const authenticated = authenticateSemanticDeploymentEvidencePackage(request.source.deploymentEvidenceDocument);
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
  const supportPaths = discoverProducerSupportPaths();
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

function planGrantFromInstalled(value) {
  assertExactKeys(value, ["installPackage", "operationId", "semanticEvidencePacket"]);
  if (!/^[a-f0-9]{64}$/u.test(String(value.operationId || ""))) {
    throw new Error("semantic native grant operation selector invalid");
  }
  assertInstalledProducerInvocation();
  const filesystem = realFilesystem();
  const decoded = decodeInstallPackage(value.installPackage);
  if (!verifySemanticRecoveryNativeInstallPlan(decoded).ok
      || !verifyInstalledSemanticRecoveryNativeProducer({ plan: decoded.plan, filesystem }).ok) {
    throw new Error("semantic native grant planning requires exact installed producer readback");
  }
  const corroboration = runSourceProcess(trustedSourceIdentity(), sourceGrantPlanMode, {
    operationId: value.operationId,
    semanticEvidencePacket: value.semanticEvidencePacket,
  });
  if (!corroboration.ok || !corroboration.manifest
      || corroboration.manifest.operation?.operationId !== value.operationId) {
    throw new Error("semantic native grant planning authority invalid");
  }
  if (!verifyInstalledSemanticRecoveryNativeProducer({ plan: decoded.plan, filesystem }).ok) {
    throw new Error("semantic native grant planning installed producer changed during authentication");
  }
  return encodeGrantPlan(planSemanticRecoveryGrant({ manifest: corroboration.manifest }));
}

function verifyInstalled(value) {
  const decoded = decodeInstallPackage(value);
  const planned = verifySemanticRecoveryNativeInstallPlan(decoded);
  if (!planned.ok) return planned;
  return verifyInstalledSemanticRecoveryNativeProducer({ plan: decoded.plan, filesystem: realFilesystem() });
}

function executeProtectedSuccessorOperation(mode, value) {
  assertInstalledProducerInvocation();
  assertExactKeys(value, ["operationId", "semanticEvidencePacket"]);
  if (!/^[a-f0-9]{64}$/u.test(String(value.operationId || ""))) throw new Error("semantic native operation selector invalid");
  const sourceIdentity = trustedSourceIdentity();
  const authenticate = () => authenticateInSourceProcess(sourceIdentity, value);
  const initialPacket = authenticate();
  const initial = initialPacket.authentication;
  if (!initial.ok || !initial.grant?.authorized) return initial;
  const construction = initialPacket.construction;
  if (!construction.ok) return construction;
  if (mode === "--readback-successor") {
    return readbackProtectedSemanticRecoverySuccessor({ manifest: initial.manifest, grant: initial.grant, construction });
  }
  return persistExactSemanticRecoverySuccessorFromNativeProducer({
    manifest: initial.manifest,
    grant: initial.grant,
    construction,
    reauthenticate() {
      const freshPacket = authenticate();
      const fresh = freshPacket.authentication;
      const unchanged = canonicalJson(freshPacket) === canonicalJson(initialPacket);
      return {
        ok: unchanged && fresh.ok === true && fresh.grant?.authorized === true,
        manifestDigest: fresh.manifestDigest,
        grantSha256: fresh.grant?.sha256,
        operationId: fresh.manifest?.operation?.operationId,
      };
    },
  });
}

function executeSourceAuthentication(value) {
  assertExactKeys(value, ["operationId", "semanticEvidencePacket"]);
  if (!/^[a-f0-9]{64}$/u.test(String(value.operationId || ""))) throw new Error("semantic native operation selector invalid");
  const sourceIdentity = trustedSourceIdentity();
  assertInstalledProducerInvocation({ rootRequired: false });
  assertSourceProcessIdentity(sourceIdentity);
  const config = productionRecoveryConfig();
  const authentication = authenticateConfiguredSemanticRecoveryAuthority(config, value.semanticEvidencePacket, value.operationId);
  if (!authentication.ok || !authentication.grant?.authorized) return { authentication, construction: null };
  const construction = constructPostIncidentSuccessor({
    manifest: authentication.manifest,
    mutationGeneration: authentication.manifest.lifecycleSuccessor.mutationGeneration,
    operationGrant: authentication.grant,
  });
  return { authentication, construction };
}

function executeSourceGrantPlan(value) {
  assertExactKeys(value, ["operationId", "semanticEvidencePacket"]);
  if (!/^[a-f0-9]{64}$/u.test(String(value.operationId || ""))) {
    throw new Error("semantic native grant operation selector invalid");
  }
  const sourceIdentity = trustedSourceIdentity();
  assertInstalledProducerInvocation({ rootRequired: false });
  assertSourceProcessIdentity(sourceIdentity);
  const corroboration = buildSemanticRecoveryManifest(value.semanticEvidencePacket, { config: productionRecoveryConfig() });
  return {
    ok: corroboration?.ok === true,
    reasonCode: corroboration?.reasonCode || "semantic_native_grant_manifest_invalid",
    manifest: corroboration?.ok === true ? corroboration.manifest : null,
    manifestDigest: corroboration?.ok === true ? corroboration.manifestDigest : null,
  };
}

function productionRecoveryConfig() {
  const authority = loadDeploymentProjectAuthority({
    configPath,
    approvedProfilePath,
    repoRoot: repositoryRoot,
    runtimeRoot,
    healthUnitPath,
    allowRuntimeBootstrap: false,
  });
  return { repoRoot: repositoryRoot, logsRoot: authority.logsRoot, repositorySlug: authority.repositorySlug };
}

function authenticateInSourceProcess(sourceIdentity, value) {
  return runSourceProcess(sourceIdentity, sourceAuthenticationMode, value);
}

function runSourceProcess(sourceIdentity, mode, value) {
  if (![sourceAuthenticationMode, sourcePlanMode, sourceGrantPlanMode].includes(mode)) throw new Error("semantic native source subprocess mode invalid");
  const child = spawnSync(fixedNodeRuntimePath, [semanticRecoveryProtectedLayout.producerExecutable, mode], {
    cwd: "/",
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    gid: sourceIdentity.gid,
    uid: sourceIdentity.uid,
    input: `${canonicalJson(value)}\n`,
    encoding: "utf8",
    maxBuffer: maximumInputBytes,
    timeout: 60_000,
  });
  if (child.error || child.status !== 0 || child.signal || child.stderr !== "") {
    throw new Error("semantic native source authentication subprocess failed");
  }
  return parseSemanticRecoverySourceProcessResponse(mode, child.stdout.trimEnd());
}

export function parseSemanticRecoverySourceProcessResponse(mode, output) {
  if (![sourceAuthenticationMode, sourcePlanMode, sourceGrantPlanMode].includes(mode) || typeof output !== "string" || output.length > maximumInputBytes) {
    throw new Error("semantic native source authentication response invalid");
  }
  let parsed;
  try { parsed = JSON.parse(output); } catch { throw new Error("semantic native source authentication response invalid"); }
  if (canonicalJson(parsed) !== output) throw new Error("semantic native source authentication response noncanonical");
  const expected = mode === sourceAuthenticationMode
    ? ["authentication", "construction"]
    : mode === sourcePlanMode ? ["artifacts", "plan"]
      : ["manifest", "manifestDigest", "ok", "reasonCode"];
  assertExactKeys(parsed, expected);
  return parsed;
}

function discoverProducerSupportPaths() {
  const root = path.join(repositoryRoot, "tools/auto-runner");
  const found = [];
  const walk = (directory, relative) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === "test" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const childRelative = path.posix.join(relative, entry.name);
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(child, childRelative);
      else if (entry.isFile() && (entry.name.endsWith(".mjs") || childRelative === "README.md")) found.push(`tools/auto-runner/${childRelative}`);
      else if (!entry.isFile()) throw new Error("semantic native support entry unsafe");
    }
  };
  walk(root, "");
  return found.sort();
}

function trustedSourceIdentity() {
  const info = lstatSync(configPath);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(configPath) !== configPath
      || info.uid < 1 || info.gid < 1 || info.nlink !== 1 || (info.mode & 0o022) !== 0) {
    throw new Error("semantic native source owner invalid");
  }
  return { uid: info.uid, gid: info.gid };
}

export function assertSourceProcessIdentity(sourceIdentity, identity = {}) {
  const realUid = identity.realUid ?? process.getuid?.();
  const effectiveUid = identity.effectiveUid ?? process.geteuid?.();
  const realGid = identity.realGid ?? process.getgid?.();
  const effectiveGid = identity.effectiveGid ?? process.getegid?.();
  if (!sourceIdentity || realUid !== sourceIdentity.uid || effectiveUid !== sourceIdentity.uid
      || realGid !== sourceIdentity.gid || effectiveGid !== sourceIdentity.gid) {
    throw new Error("semantic native source process identity mismatch");
  }
  return true;
}

export function semanticRecoveryPlanExecutionRoute(identity = {}) {
  const realUid = identity.realUid ?? process.getuid?.();
  const effectiveUid = identity.effectiveUid ?? process.geteuid?.();
  const invocationPath = path.resolve(identity.invocationPath ?? process.argv[1] ?? "");
  if (realUid === 0 || effectiveUid === 0) {
    if (realUid !== 0 || effectiveUid !== 0 || invocationPath !== semanticRecoveryProtectedLayout.producerExecutable) {
      throw new Error("semantic native root planning requires installed producer");
    }
    return "installed_root_source_subprocess";
  }
  if (!Number.isSafeInteger(realUid) || realUid < 1 || effectiveUid !== realUid) {
    throw new Error("semantic native planning process identity invalid");
  }
  return "unprivileged_source_process";
}

function assertInstalledProducerInvocation({ rootRequired = true } = {}) {
  if ((rootRequired && (process.getuid?.() !== 0 || process.geteuid?.() !== 0))
      || path.resolve(process.argv[1] || "") !== semanticRecoveryProtectedLayout.producerExecutable
      || realpathSync(process.argv[1]) !== semanticRecoveryProtectedLayout.producerExecutable) {
    throw new Error("semantic native protected invocation required");
  }
  const runtime = lstatSync(fixedNodeRuntimePath);
  if (!runtime.isFile() || runtime.isSymbolicLink() || runtime.uid !== 0 || runtime.gid !== 0 || runtime.nlink !== 1
      || (runtime.mode & 0o022) !== 0 || realpathSync(fixedNodeRuntimePath) !== fixedNodeRuntimePath
      || realpathSync(process.execPath) !== fixedNodeRuntimePath) {
    throw new Error("semantic native fixed node runtime unsafe");
  }
  for (const target of ["/etc", "/etc/settleora-auto-runner", semanticRecoveryProtectedLayout.root, semanticRecoveryProtectedLayout.producerRoot, semanticRecoveryProtectedLayout.producerExecutable]) {
    const info = lstatSync(target);
    const executable = target === semanticRecoveryProtectedLayout.producerExecutable;
    if (info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || realpathSync(target) !== target
        || (executable ? (!info.isFile() || info.nlink !== 1 || (info.mode & 0o7777) !== 0o555) : (!info.isDirectory() || (info.mode & 0o022) !== 0))) {
      throw new Error("semantic native installed producer unsafe");
    }
  }
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
    list: (target) => readdirSync(target),
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
