#!/usr/bin/node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import { loadDeploymentProjectAuthority } from "./lib/config.mjs";
import { authenticateSemanticDeploymentEvidencePackage } from "./lib/deployment-semantic-evidence-package.mjs";
import {
  collectSemanticDeploymentEvidenceContext,
  createSemanticDeploymentAuthorityReaders,
  reauthenticateSemanticRecoveryGithubNoEffect,
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
  verifyInstalledSemanticRecoveryNativeProducer,
  verifySemanticRecoveryGrantPlan,
  verifySemanticRecoveryNativeInstallPlan,
} from "./lib/semantic-recovery-native-producer.mjs";
import {
  persistExactSemanticRecoverySuccessorFromNativeProducer,
  readbackProtectedSemanticRecoverySuccessor,
  semanticRecoveryProtectedLayout,
} from "./lib/semantic-recovery-protected-store.mjs";
import { listRecoverableRecoveryStates } from "./lib/recovery-state.mjs";
import { semanticRecoveryAuthorityClasses } from "./lib/semantic-recovery-authority.mjs";

const maximumInputBytes = 8 * 1024 * 1024;
const fixedNodeRuntimePath = "/usr/bin/node";
const fixedPythonRuntimePath = "/usr/bin/python3";
const sourceAuthenticationMode = "--authenticate-successor-internal";
const sourcePlanMode = "--plan-install-internal";
const sourceGrantPlanMode = "--derive-grant-manifest-internal";
const runtimeRoot = "/workspace/auto-runner/runtime";
const configPath = "/workspace/auto-runner/config/settleora.json";
const approvedProfilePath = "/workspace/auto-runner/config/settleora-production-approved-20260724-0946.json";
const healthUnitPath = "/home/tommytang213/.config/systemd/user/settleora-auto-runner-health.service";
const deploymentEvidenceDocumentPath = "/workspace/auto-runner/config/settleora-semantic-deployment-evidence-issue-1012/deployment-evidence.json";
const publicGithubReadProgram = String.raw`
import http.client
import json
import re
import ssl
import sys

request = json.loads(sys.stdin.buffer.read(4097).decode("utf-8"))
if (not isinstance(request, dict) or set(request) != {"minimumRateRemaining", "route"}
        or not isinstance(request["route"], str) or not isinstance(request["minimumRateRemaining"], int)
        or isinstance(request["minimumRateRemaining"], bool)
        or request["minimumRateRemaining"] < 0 or request["minimumRateRemaining"] > 60):
    raise RuntimeError("semantic_native_public_github_request_invalid")
route = request["route"]
minimum_rate_remaining = request["minimumRateRemaining"]
patterns = (
    r"repos/tommytang213/Settleora",
    r"repos/tommytang213/Settleora/git/ref/heads/main",
    r"repos/tommytang213/Settleora/git/matching-refs/heads/[A-Za-z0-9._~%:-]+\?per_page=100&page=[1-9][0-9]*",
    r"repos/tommytang213/Settleora/pulls\?state=all&head=tommytang213%3A[A-Za-z0-9._~%:-]+&per_page=100&page=[1-9][0-9]*",
    r"repos/tommytang213/Settleora/issues/1012",
    r"repos/tommytang213/Settleora/issues/1012/comments\?per_page=100&page=[1-9][0-9]*",
)
if not any(re.fullmatch(pattern, route) for pattern in patterns) or ".." in route or "//" in route:
    raise RuntimeError("semantic_native_public_github_route_invalid")
connection = http.client.HTTPSConnection("api.github.com", 443, timeout=30, context=ssl.create_default_context())
try:
    connection.request("GET", "/" + route, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "settleora-root-native-install-v1",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    response = connection.getresponse()
    if response.status != 200 or response.getheader("Location") is not None:
        raise RuntimeError("semantic_native_public_github_response_refused")
    rate_limit = response.getheader("X-RateLimit-Limit")
    rate_remaining = response.getheader("X-RateLimit-Remaining")
    if (rate_limit is None or not rate_limit.isdigit() or int(rate_limit) < 60
            or rate_remaining is None or not rate_remaining.isdigit()
            or int(rate_remaining) < minimum_rate_remaining):
        raise RuntimeError("semantic_native_public_github_rate_budget_refused")
    length = response.getheader("Content-Length")
    if length is not None and (not length.isdigit() or int(length) > 4 * 1024 * 1024):
        raise RuntimeError("semantic_native_public_github_response_oversized")
    payload = response.read(4 * 1024 * 1024 + 1)
    if not payload or len(payload) > 4 * 1024 * 1024:
        raise RuntimeError("semantic_native_public_github_response_oversized")
    value = json.loads(payload.decode("utf-8"))
finally:
    connection.close()
sys.stdout.write(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
`;
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
  const repositoryRoot = productionRepositoryRoot();
  const authenticated = authenticateSemanticDeploymentEvidencePackage(request.source.deploymentEvidenceDocument);
  const context = createRootInstallAuthorityContext({ authenticated, repositoryRoot, repository: request.repository });
  const producerSourceSha = context.readAuthorityContext().candidate?.mainSha;
  const supportFiles = readSemanticRecoverySupportFilesFromGit({ repositoryRoot, repository: context.repository, producerSourceSha });
  return encodeInstallPackage(deriveSemanticRecoveryNativeInstallPackageFromRoot({ request, repositoryRoot, producerSourceSha, supportFiles, authenticated }));
}

export function deriveSemanticRecoveryNativeProducerRequestFromRoot({ now = new Date(), githubRead = null } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("semantic native root request derivation boundary invalid");
  }
  const context = createRootInstallAuthorityContext({ githubRead });
  const authorityContext = context.readAuthorityContext();
  const authority = authorityContext.projectAuthority;
  return normalizeSemanticRecoveryNativeProducerRequest({
    contract: "settleora_semantic_recovery_native_producer_request",
    version: 1,
    operation: "install_native_semantic_recovery_producer",
    repository: authority.repositorySlug,
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    source: { deploymentEvidenceDocument: deploymentEvidenceDocumentPath, sha256: authorityContext.deploymentEvidenceDigest },
    runtime: {
      sourceSha: authority.runtimeSourceSha,
      bundleDigest: authority.runtimeBundleDigest,
      manifestDigest: authority.artifacts.runtimeManifest.sha256,
      profileDigest: authority.artifacts.approvedProfile.sha256,
      approvalDigest: authority.artifacts.runtimeApproval.sha256,
      launcherDigest: authority.artifacts.runtimeLauncher.sha256,
      healthUnitDigest: authority.artifacts.healthUnit.sha256,
    },
  });
}

export function deriveSemanticRecoveryNativeInstallPackageFromRoot({
  request,
  producerSourceSha,
  supportFiles,
  githubRead = null,
  verificationNow = new Date(),
} = {}) {
  const normalized = normalizeSemanticRecoveryNativeProducerRequest(request);
  if (!/^[a-f0-9]{40}$/u.test(String(producerSourceSha || "")) || !Array.isArray(supportFiles)) {
    throw new Error("semantic native root package derivation boundary invalid");
  }
  if (!(verificationNow instanceof Date) || !Number.isFinite(verificationNow.getTime())) {
    throw new Error("semantic native root package verification time invalid");
  }
  const context = createRootInstallAuthorityContext({ githubRead });
  const initial = context.readAuthorityContext();
  if (initial.deploymentEvidenceDigest !== normalized.source.sha256 || initial.repository !== normalized.repository
      || initial.candidate?.mainSha !== producerSourceSha) {
    throw new Error("semantic native selected evidence digest mismatch");
  }
  const generated = planSemanticRecoveryNativeInstall({
    request: normalized,
    authorityReaders: createSemanticDeploymentAuthorityReaders({ readAuthorityContext: context.readAuthorityContext }),
    readAuthorityContext: context.readAuthorityContext,
    producerSourceSha,
    supportFiles,
    now: verificationNow,
  });
  const final = context.readAuthorityContext();
  if (final.candidate?.mainSha !== producerSourceSha) throw new Error("semantic native selected source changed during planning");
  const verified = verifySemanticRecoveryNativeInstallPlan(generated);
  if (!verified.ok) throw new Error("semantic native generated install plan did not verify");
  return generated;
}

export function deriveSemanticRecoveryNativeAuthorityProjectionsFromRoot({ request, githubRead = null } = {}) {
  const normalized = normalizeSemanticRecoveryNativeProducerRequest(request);
  const context = createRootInstallAuthorityContext({ githubRead });
  const readers = createSemanticDeploymentAuthorityReaders({ readAuthorityContext: context.readAuthorityContext });
  const projections = semanticRecoveryAuthorityClasses.map((authorityClass) => readers[authorityClass](context.readAuthorityContext(authorityClass)));
  const final = context.readAuthorityContext();
  if (final.deploymentEvidenceDigest !== normalized.source.sha256 || final.repository !== normalized.repository) {
    throw new Error("semantic native independent authority projection drift");
  }
  if (!/^[a-f0-9]{40}$/u.test(String(final.candidate?.mainSha || ""))) {
    throw new Error("semantic native independent source authority unavailable");
  }
  return { request: normalized, projections, sourceCommit: final.candidate.mainSha };
}

function createRootInstallAuthorityContext({ githubRead = null } = {}) {
  const contextDigests = [];
  const boundedGithubRead = githubRead || createPublicSemanticRecoveryGithubSnapshotReader();
  if (typeof boundedGithubRead !== "function") throw new Error("semantic native public GitHub snapshot reader invalid");
  const readAuthorityContext = () => {
    const repositoryRoot = productionRepositoryRoot();
    const projectAuthority = loadDeploymentProjectAuthority({
      configPath,
      approvedProfilePath,
      repoRoot: repositoryRoot,
      runtimeRoot,
      healthUnitPath,
      allowRuntimeBootstrap: false,
    });
    const incident = projectAuthority.configuredPostIncidentRecovery?.authenticatedProvenance?.incidentArtifact;
    if (!incident || !path.isAbsolute(incident.path || "") || !/^[a-f0-9]{64}$/u.test(String(incident.sha256 || ""))) {
      throw new Error("semantic native fixed incident selector unavailable");
    }
    const recoverable = listRecoverableRecoveryStates({ logsRoot: projectAuthority.logsRoot, repositorySlug: projectAuthority.repositorySlug });
    if (recoverable.length !== 1 || !path.isAbsolute(recoverable[0].statePath || "")) {
      throw new Error("semantic native associated recovery discovery ambiguous");
    }
    const associatedRecoveryPath = recoverable[0].statePath;
    const associatedRecoverySha256 = authenticateCurrentOwnerFileDigest(associatedRecoveryPath);
    const authenticated = authenticateSemanticDeploymentEvidencePackage(deploymentEvidenceDocumentPath);
    const document = authenticated.document;
    if (document.project?.repositorySlug?.toLowerCase() !== projectAuthority.repositorySlug.toLowerCase()
        || document.config?.path !== configPath || document.approvedProfile?.path !== approvedProfilePath
        || document.healthUnit?.path !== healthUnitPath
        || document.authenticatedProvenance?.incidentArtifact?.path !== incident.path
        || document.authenticatedProvenance?.incidentArtifact?.sha256 !== incident.sha256
        || document.associatedRecovery?.path !== associatedRecoveryPath
        || document.associatedRecovery?.sha256 !== associatedRecoverySha256) {
      throw new Error("semantic native deployment evidence does not corroborate fixed discovery");
    }
    const collected = collectSemanticDeploymentEvidenceContext({
      projectAuthority,
      repositoryRoot,
      incidentPath: incident.path,
      incidentSha256: incident.sha256,
      associatedRecoveryPath,
      associatedRecoverySha256,
      githubRead: boundedGithubRead,
    });
    const context = deepFreeze({ ...collected, deploymentEvidenceDigest: authenticated.evidence.sha256 });
    contextDigests.push(sha256(canonicalJson(context)));
    if (new Set(contextDigests).size !== 1) throw new Error("semantic native authority changed between independent reads");
    return context;
  };
  return { repository: "tommytang213/Settleora", readAuthorityContext };
}

export function createPublicSemanticRecoveryGithubSnapshotReader({ minimumRateRemaining = 0, read = readPublicSemanticRecoveryGithubRoute } = {}) {
  if (!Number.isSafeInteger(minimumRateRemaining) || minimumRateRemaining < 0 || minimumRateRemaining > 60
      || typeof read !== "function") throw new Error("semantic native public GitHub snapshot boundary invalid");
  const responses = new Map();
  return (route) => {
    if (!responses.has(route)) {
      const response = read(route, { minimumRateRemaining });
      // The root installation protocol reserves a fixed six authenticated
      // requests for each independent authority snapshot. A full REST page
      // would require another request to prove completeness, so refuse it
      // before publication rather than consume the recovery reservation.
      if (Array.isArray(response) && response.length === 100) {
        throw new Error("semantic native public GitHub paginated snapshot unsupported");
      }
      responses.set(route, deepFreeze(response));
    }
    return structuredClone(responses.get(route));
  };
}

export function classifyPublicSemanticRecoveryGithubProcessFailure(child) {
  if (!child || typeof child !== "object") return "semantic_native_public_github_process_unavailable";
  if (child.error?.code === "ETIMEDOUT") return "semantic_native_public_github_timeout";
  if (child.error || child.signal) return "semantic_native_public_github_process_unavailable";
  const stderr = typeof child.stderr === "string" && Buffer.byteLength(child.stderr) <= 64 * 1024 ? child.stderr : "";
  const match = /RuntimeError: (semantic_native_public_github_(?:request_invalid|route_invalid|response_refused|rate_budget_refused|response_oversized))\s*$/u.exec(stderr);
  if (match) return match[1];
  if (child.status !== 0) return "semantic_native_public_github_process_failed";
  if (stderr !== "") return "semantic_native_public_github_stderr_refused";
  if (typeof child.stdout !== "string" || Buffer.byteLength(child.stdout) > 4 * 1024 * 1024) {
    return "semantic_native_public_github_response_oversized";
  }
  return null;
}

export function readPublicSemanticRecoveryGithubRoute(route, { command = spawnSync, minimumRateRemaining = 0 } = {}) {
  if (typeof route !== "string" || route.length < 1 || route.length > 1024 || typeof command !== "function"
      || !Number.isSafeInteger(minimumRateRemaining) || minimumRateRemaining < 0 || minimumRateRemaining > 60) {
    throw new Error("semantic native public GitHub read boundary invalid");
  }
  const child = command(fixedPythonRuntimePath, ["-I", "-c", publicGithubReadProgram], {
    input: canonicalJson({ minimumRateRemaining, route }),
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    maxBuffer: 4 * 1024 * 1024 + 1024,
    timeout: 35_000,
  });
  const failureReason = classifyPublicSemanticRecoveryGithubProcessFailure(child);
  if (failureReason !== null) throw new Error(failureReason);
  try { return JSON.parse(child.stdout); }
  catch { throw new Error("semantic native public GitHub response invalid"); }
}

function authenticateCurrentOwnerFileDigest(file) {
  if (path.resolve(file) !== file || realpathSync(file) !== file) throw new Error("semantic native discovered file path invalid");
  const fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const first = fstatSync(fd);
    const bytes = readFileSync(fd);
    const second = fstatSync(fd);
    if (!first.isFile() || first.nlink !== 1 || first.uid !== process.getuid?.() || (first.mode & 0o077) !== 0
        || first.dev !== second.dev || first.ino !== second.ino || first.size !== second.size
        || first.mtimeMs !== second.mtimeMs || first.ctimeMs !== second.ctimeMs || bytes.length !== first.size) {
      throw new Error("semantic native discovered file changed");
    }
    return sha256(bytes);
  } finally { closeSync(fd); }
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
  const filesystem = createSemanticRecoveryReadOnlyFilesystem();
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
  return verifyInstalledSemanticRecoveryNativeProducer({ plan: decoded.plan, filesystem: createSemanticRecoveryReadOnlyFilesystem() });
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
      const unchanged = canonicalJson({ authentication: freshPacket.authentication, construction: freshPacket.construction })
        === canonicalJson({ authentication: initialPacket.authentication, construction: initialPacket.construction });
      return {
        ok: unchanged && fresh.ok === true && fresh.grant?.authorized === true,
        manifestDigest: fresh.manifestDigest,
        grantSha256: fresh.grant?.sha256,
        operationId: fresh.manifest?.operation?.operationId,
        githubNoEffectSnapshot: freshPacket.githubNoEffectSnapshot,
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
  if (!authentication.ok || !authentication.grant?.authorized) return { authentication, construction: null, githubNoEffectSnapshot: null };
  const githubNoEffectSnapshot = reauthenticateSemanticRecoveryGithubNoEffect({ repositoryRoot: config.repoRoot, manifest: authentication.manifest });
  const construction = constructPostIncidentSuccessor({
    manifest: authentication.manifest,
    mutationGeneration: authentication.manifest.lifecycleSuccessor.mutationGeneration,
    operationGrant: authentication.grant,
  });
  return { authentication, construction, githubNoEffectSnapshot };
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
  if (corroboration?.ok === true) {
    reauthenticateSemanticRecoveryGithubNoEffect({ repositoryRoot: productionRepositoryRoot(), manifest: corroboration.manifest });
  }
  return {
    ok: corroboration?.ok === true,
    reasonCode: corroboration?.reasonCode || "semantic_native_grant_manifest_invalid",
    manifest: corroboration?.ok === true ? corroboration.manifest : null,
    manifestDigest: corroboration?.ok === true ? corroboration.manifestDigest : null,
  };
}

function productionRecoveryConfig() {
  const repositoryRoot = productionRepositoryRoot();
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

function productionRepositoryRoot() {
  return realpathSync("/workspace/repos/Settleora");
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
    ? ["authentication", "construction", "githubNoEffectSnapshot"]
    : mode === sourcePlanMode ? ["artifacts", "plan"]
      : ["manifest", "manifestDigest", "ok", "reasonCode"];
  assertExactKeys(parsed, expected);
  return parsed;
}

export function readSemanticRecoverySupportFilesFromGit({ repositoryRoot, repository, producerSourceSha, command = fixedGitCommand } = {}) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)
      || realpathSync(repositoryRoot) !== repositoryRoot
      || !/^[^/\s]+\/[^/\s]+$/u.test(String(repository || ""))
      || !/^[a-f0-9]{40}$/u.test(String(producerSourceSha || ""))) {
    throw new Error("semantic native producer Git source invalid");
  }
  const forbidden = ["GIT_REPLACE_REF_BASE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_DIR", "GIT_WORK_TREE", "GIT_SHALLOW_FILE"];
  if (forbidden.some((key) => process.env[key])) throw new Error("semantic native producer Git environment untrusted");
  const options = {
    cwd: repositoryRoot,
    env: { PATH: "/usr/bin:/bin", HOME: userInfo().homedir, LANG: "C", LC_ALL: "C", GH_PROMPT_DISABLED: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
  };
  const github = (route) => {
    const output = command("/usr/bin/gh", ["api", route], { ...options, encoding: "utf8" });
    try { return JSON.parse(String(output)); }
    catch { throw new Error("semantic native producer GitHub response invalid"); }
  };
  const commit = github(`repos/${repository}/git/commits/${producerSourceSha}`);
  if (!plainObject(commit) || commit.sha !== producerSourceSha || !/^[a-f0-9]{40}$/u.test(String(commit.tree?.sha || ""))) {
    throw new Error("semantic native producer Git commit invalid");
  }
  const tree = github(`repos/${repository}/git/trees/${commit.tree.sha}?recursive=1`);
  if (!plainObject(tree) || tree.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error("semantic native producer Git tree invalid or truncated");
  }
  const bySource = new Map();
  for (const entry of tree.tree) {
    if (!plainObject(entry) || typeof entry.path !== "string" || entry.path.startsWith("/")
        || path.posix.normalize(entry.path) !== entry.path || entry.path.includes("\0")) {
      throw new Error("semantic native producer Git tree entry invalid");
    }
    if (!entry.path.startsWith("tools/auto-runner/")) continue;
    if (entry.type === "tree" && entry.mode === "040000" && /^[a-f0-9]{40}$/u.test(String(entry.sha || ""))) continue;
    if (!/^(100644|100755)$/u.test(String(entry.mode || "")) || entry.type !== "blob"
        || !/^[a-f0-9]{40}$/u.test(String(entry.sha || ""))
        || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 1024 * 1024
        || bySource.has(entry.path)) throw new Error("semantic native producer Git tree entry invalid");
    bySource.set(entry.path, entry);
  }
  const entrySource = "tools/auto-runner/semantic-recovery-native-producer.mjs";
  const selected = new Map();
  const pending = [entrySource];
  while (pending.length > 0) {
    const source = pending.pop();
    if (selected.has(source)) continue;
    const entry = bySource.get(source);
    if (!entry || !source.endsWith(".mjs")) throw new Error(`semantic native producer Git dependency missing: ${source}`);
    const blob = github(`repos/${repository}/git/blobs/${entry.sha}`);
    if (!plainObject(blob) || blob.sha !== entry.sha || blob.encoding !== "base64" || blob.size !== entry.size
        || typeof blob.content !== "string" || !/^[A-Za-z0-9+/=\r\n]+$/u.test(blob.content)) {
      throw new Error("semantic native producer Git blob invalid");
    }
    const encoded = blob.content.replace(/[\r\n]/gu, "");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length !== entry.size || bytes.toString("base64") !== encoded
        || gitObjectSha1("blob", bytes) !== entry.sha) {
      throw new Error("semantic native producer Git blob identity mismatch");
    }
    selected.set(source, { source, bytes, sha256: sha256(bytes), byteCount: bytes.length, executable: source === entrySource });
    for (const specifier of relativeSupportModuleSpecifiers(bytes)) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
      if (!dependency.startsWith("tools/auto-runner/") || !dependency.endsWith(".mjs")) {
        throw new Error("semantic native producer Git dependency invalid");
      }
      pending.push(dependency);
    }
  }
  if (selected.size < 2) throw new Error("semantic native producer Git support selection invalid");
  return [...selected.values()].sort((left, right) => left.source.localeCompare(right.source));
}

function relativeSupportModuleSpecifiers(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text).equals(Buffer.from(bytes))) throw new Error("semantic native producer Git support encoding invalid");
  const found = new Set();
  for (const pattern of [
    /(?:^|\n)\s*(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["'](\.[^"']+)["']/gu,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/gu,
  ]) {
    for (const match of text.matchAll(pattern)) found.add(match[1]);
  }
  return [...found].sort();
}

function gitObjectSha1(type, bytes) {
  return createHash("sha1").update(Buffer.from(`${type} ${bytes.length}\0`)).update(bytes).digest("hex");
}

function fixedGitCommand(executable, args, options) {
  const result = spawnSync(executable, args, { ...options, maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
  if (result.status !== 0 || result.error) throw result.error || new Error("semantic native producer Git command failed");
  return result.stdout;
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

export function createSemanticRecoveryReadOnlyFilesystem() {
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
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`semantic recovery native producer failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
