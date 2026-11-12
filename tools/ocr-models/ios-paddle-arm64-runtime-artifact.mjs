import { createHash } from "node:crypto";

export const diagnosticArtifactLimits = Object.freeze({
  bytes: 256 * 1024,
  descriptorBytes: 16 * 1024,
  responseBytes: 64 * 1024,
  jobMilliseconds: 35 * 60 * 1000,
  retentionMilliseconds: 24 * 60 * 60 * 1000,
});
const purpose = "arm64_ridge_runtime_v1";
const attemptedSlots = new WeakSet();
const hex40 = /^[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function requireArtifact(condition) {
  if (!condition) throw new Error("ios_diagnostic_artifact_rejected");
}
function exact(value, keys) {
  requireArtifact(value !== null && typeof value === "object" && !Array.isArray(value));
  requireArtifact(Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)));
  return value;
}
function epoch(value) {
  requireArtifact(Number.isSafeInteger(value) && value > 0 &&
    value <= 8_640_000_000_000_000 - diagnosticArtifactLimits.retentionMilliseconds);
  return value;
}
function context(value) {
  exact(value, ["head", "tree", "fingerprint", "runId", "runAttempt",
    "workflowRunBackendId", "workflowJobRunBackendId"]);
  for (const item of Object.values(value)) requireArtifact(typeof item === "string");
  requireArtifact(value.head.length === 40 && value.tree.length === 40 &&
    value.fingerprint.length === 64 && value.workflowRunBackendId.length === 36 &&
    value.workflowJobRunBackendId.length === 36);
  requireArtifact(hex40.test(value.head) && hex40.test(value.tree) &&
    hex64.test(value.fingerprint) && /^[1-9][0-9]{0,23}$/.test(value.runId) &&
    value.runAttempt === "1" && guid.test(value.workflowRunBackendId) &&
    guid.test(value.workflowJobRunBackendId));
  return { ...value };
}
function sameContext(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}
function signedUploadUrl(value, preparedAt, minimumRemainingMs = diagnosticArtifactLimits.jobMilliseconds) {
  requireArtifact(typeof value === "string" && value.length <= 8192);
  const url = new URL(value);
  requireArtifact(url.protocol === "https:" && !url.username && !url.password &&
    !url.hash && (!url.port || url.port === "443") &&
    /^[a-z0-9-]+\.blob\.core\.windows\.net$/i.test(url.hostname));
  requireArtifact(url.searchParams.getAll("sig").length === 1 &&
    (url.searchParams.get("sig")?.length ?? 0) > 0 &&
    url.searchParams.getAll("se").length === 1);
  const expiration = Date.parse(url.searchParams.get("se"));
  requireArtifact(Number.isFinite(expiration) &&
    expiration > preparedAt + minimumRemainingMs);
  return url.href;
}
function artifactName(identity) {
  return "settleora-arm64-ridge-private-" + identity.runId + "-" +
    identity.workflowJobRunBackendId;
}

// Post-job owners know the exact source/run and logged artifact name. The
// private runtime backend-run UUID is irrelevant to GitHub REST metadata.
function metadataIdentity(value) {
  exact(value, ["head", "tree", "fingerprint", "runId", "runAttempt", "name"]);
  requireArtifact(Object.values(value).every((item) => typeof item === "string") &&
    value.head.length === 40 && hex40.test(value.head) &&
    value.tree.length === 40 && hex40.test(value.tree) &&
    value.fingerprint.length === 64 && hex64.test(value.fingerprint) &&
    /^[1-9][0-9]{0,23}$/.test(value.runId) && value.runAttempt === "1");
  const prefix = "settleora-arm64-ridge-private-" + value.runId + "-";
  requireArtifact(value.name.startsWith(prefix) && value.name.length === prefix.length + 36 &&
    guid.test(value.name.slice(prefix.length)));
  return Object.freeze({ ...value });
}

// Called before any provider execution. No receipt input is accepted here.
// The caller records an exclusive prepare-attempt latch before invoking it.
export async function prepareDiagnosticArtifact({ backend, identity, now = Date.now }) {
  try {
    const source = context(identity);
    const preparedAt = epoch(now());
    const expiresAt = preparedAt + diagnosticArtifactLimits.retentionMilliseconds;
    const name = artifactName(source);
    const response = await backend.create({
      workflow_run_backend_id: source.workflowRunBackendId,
      workflow_job_run_backend_id: source.workflowJobRunBackendId,
      name, expires_at: new Date(expiresAt).toISOString(), version: 4,
    });
    requireArtifact(response?.ok === true);
    const uploadUrl = signedUploadUrl(response.signed_upload_url, preparedAt);
    const returnedAt = epoch(now());
    requireArtifact(returnedAt >= preparedAt &&
      returnedAt - preparedAt <= 60_000);
    return Object.freeze({
      schemaVersion: 1, purpose, identity: Object.freeze(source),
      name, preparedAt, expiresAt, uploadUrl,
    });
  } catch {
    throw new Error("ios_diagnostic_artifact_prepare_failed");
  }
}

export function validateDiagnosticArtifactSlot(slot, expectedIdentity) {
  try {
    exact(slot, ["schemaVersion", "purpose", "identity", "name", "preparedAt",
      "expiresAt", "uploadUrl"]);
    const source = context(slot.identity);
    requireArtifact(slot.schemaVersion === 1 && slot.purpose === purpose &&
      sameContext(source, context(expectedIdentity)) && slot.name === artifactName(source));
    const preparedAt = epoch(slot.preparedAt);
    requireArtifact(slot.expiresAt ===
      preparedAt + diagnosticArtifactLimits.retentionMilliseconds);
    signedUploadUrl(slot.uploadUrl, preparedAt);
    requireArtifact(Buffer.byteLength(JSON.stringify(slot)) <=
      diagnosticArtifactLimits.descriptorBytes);
    return Object.freeze({
      schemaVersion: 1, purpose, identity: Object.freeze(source), name: slot.name,
      preparedAt, expiresAt: slot.expiresAt,
      uploadUrl: signedUploadUrl(slot.uploadUrl, preparedAt),
    });
  } catch {
    throw new Error("ios_diagnostic_artifact_slot_rejected");
  }
}

// Capture start is a separate exclusive receipt, written after successful
// preparation and before launching the one provider process.
export function diagnosticCaptureStart(slot, expectedIdentity, now = Date.now) {
  try {
    slot = validateDiagnosticArtifactSlot(slot, expectedIdentity);
    const startedAt = epoch(now());
    requireArtifact(startedAt >= slot.preparedAt &&
      startedAt - slot.preparedAt < diagnosticArtifactLimits.jobMilliseconds);
    return Object.freeze({
      schemaVersion: 1, purpose, name: slot.name, startedAt,
      preparedAt: slot.preparedAt, expiresAt: slot.expiresAt,
    });
  } catch {
    throw new Error("ios_diagnostic_capture_start_rejected");
  }
}

export async function finalizeDiagnosticArtifact({
  backend, slot, expectedIdentity, captureStart, zipBytes, now = Date.now,
}) {
  // The caller records an exclusive upload-attempt latch before invoking this
  // method. Network requests and provider execution are never retried here.
  try {
    const originalSlot = slot;
    slot = validateDiagnosticArtifactSlot(slot, expectedIdentity);
    requireArtifact(!attemptedSlots.has(originalSlot));
    attemptedSlots.add(originalSlot);
    exact(captureStart, ["schemaVersion", "purpose", "name", "startedAt",
      "preparedAt", "expiresAt"]);
    captureStart = Object.freeze({ ...captureStart });
    const startedAt = epoch(captureStart.startedAt);
    const current = epoch(now());
    requireArtifact(captureStart.schemaVersion === 1 &&
      captureStart.purpose === purpose && captureStart.name === slot.name &&
      captureStart.preparedAt === slot.preparedAt &&
      captureStart.expiresAt === slot.expiresAt &&
      startedAt >= slot.preparedAt && current >= startedAt &&
      current - slot.preparedAt < diagnosticArtifactLimits.jobMilliseconds &&
      current < slot.expiresAt);
    requireArtifact(Buffer.isBuffer(zipBytes) && zipBytes.length >= 22 &&
      zipBytes.length <= diagnosticArtifactLimits.bytes &&
      zipBytes.readUInt32LE(0) === 0x04034b50);
    const owned = Buffer.from(zipBytes);
    const sha256 = createHash("sha256").update(owned).digest("hex");
    await backend.upload(slot.uploadUrl, owned);
    const response = await backend.finalize({
      workflow_run_backend_id: slot.identity.workflowRunBackendId,
      workflow_job_run_backend_id: slot.identity.workflowJobRunBackendId,
      name: slot.name, size: String(owned.length), hash: "sha256:" + sha256,
    });
    requireArtifact(response?.ok === true &&
      typeof response.artifact_id === "string" &&
      /^[1-9][0-9]{0,18}$/.test(response.artifact_id));
    // No expiry is set during finalization. Requested expiry began before
    // capture. Verify the server's finalized metadata before raw retention.
    return Object.freeze({
      schemaVersion: 1, purpose, artifactId: response.artifact_id,
      name: slot.name, size: owned.length, sha256,
      preparedAt: slot.preparedAt, captureStartedAt: startedAt,
      requestedExpiresAt: slot.expiresAt, expiryVerified: false,
      sourceHead: slot.identity.head, sourceTree: slot.identity.tree,
      sourceFingerprint: slot.identity.fingerprint,
    });
  } catch {
    throw new Error("ios_diagnostic_artifact_finalize_failed");
  }
}


// GitHub injects the job-scoped runtime token into JavaScript actions. It is
// consumed in memory here and is never copied into outputs or ordinary files.
export function diagnosticArtifactRuntime(env, now = Date.now) {
  try {
    requireArtifact(env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_SERVER_URL === "https://github.com" &&
      env.GITHUB_REPOSITORY === "tommytang213/Settleora" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_RUN_ATTEMPT === "1" &&
      env.GITHUB_SHA === env.DIAGNOSTIC_SOURCE_HEAD &&
      env.DIAGNOSTIC_WORKFLOW_SHA === env.DIAGNOSTIC_SOURCE_HEAD);
    const token = env.ACTIONS_RUNTIME_TOKEN;
    requireArtifact(typeof token === "string" && token.length > 0 && token.length <= 32768);
    const parts = token.split(".");
    requireArtifact(parts.length === 3 && parts.every((part) =>
      part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part)));
    const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    requireArtifact(typeof decoded.scp === "string" && decoded.scp.length <= 8192 &&
      Number.isSafeInteger(decoded.exp) && decoded.exp * 1000 > epoch(now()));
    const scopes = decoded.scp.split(" ").filter((value) =>
      value.startsWith("Actions.Results:"));
    requireArtifact(scopes.length === 1);
    const claim = scopes[0].split(":");
    requireArtifact(claim.length === 3);
    const identity = context({
      head: env.DIAGNOSTIC_SOURCE_HEAD, tree: env.DIAGNOSTIC_SOURCE_TREE,
      fingerprint: env.DIAGNOSTIC_SOURCE_FINGERPRINT,
      runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
      workflowRunBackendId: claim[1], workflowJobRunBackendId: claim[2],
    });
    const url = new URL(env.ACTIONS_RESULTS_URL);
    requireArtifact(url.protocol === "https:" && !url.username && !url.password &&
      !url.hash && !url.search && (!url.port || url.port === "443") &&
      /^(?:[a-z0-9-]+\.)*actions\.githubusercontent\.com$/i.test(url.hostname));
    return Object.freeze({ identity: Object.freeze(identity),
      resultsOrigin: url.origin, token });
  } catch {
    throw new Error("ios_diagnostic_artifact_runtime_rejected");
  }
}

async function boundedResponse(response) {
  let reader;
  try {
    requireArtifact(response.status === 200 &&
      /^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? ""));
    const length = response.headers.get("content-length");
    if (length !== null) requireArtifact(/^[0-9]+$/.test(length) &&
      Number(length) <= diagnosticArtifactLimits.responseBytes);
    requireArtifact(response.body && typeof response.body.getReader === "function");
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      requireArtifact(value instanceof Uint8Array);
      size += value.byteLength;
      requireArtifact(size <= diagnosticArtifactLimits.responseBytes);
      chunks.push(Buffer.from(value));
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return JSON.parse(text);
  } finally {
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    } else {
      await response.body?.cancel().catch(() => {});
    }
  }
}

function artifactWireResponse(value, method) {
  const snake = method === "CreateArtifact" ? "signed_upload_url" : "artifact_id";
  const camel = method === "CreateArtifact" ? "signedUploadUrl" : "artifactId";
  const field = Object.hasOwn(value ?? {}, snake) ? snake : camel;
  exact(value, ["ok", field]);
  requireArtifact(value.ok === true && typeof value[field] === "string");
  return { ok: true, [snake]: value[field] };
}

// Same protocol4 wire format as @actions/artifact2.3.2. Deliberately one attempt:
// no SDK retry policy, redirects, response-body diagnostics or credential logs.
export function diagnosticArtifactBackend({ env, fetchImpl = fetch, now = Date.now }) {
  const runtime = diagnosticArtifactRuntime(env, now);
  const expectedName = artifactName(runtime.identity);
  const attempted = new Set();
  let uploaded = false;
  function once(phase) {
    requireArtifact(!attempted.has(phase));
    attempted.add(phase);
  }
  async function rpc(method, body, keys) {
    exact(body, keys);
    requireArtifact(body.workflow_run_backend_id === runtime.identity.workflowRunBackendId &&
      body.workflow_job_run_backend_id === runtime.identity.workflowJobRunBackendId &&
      body.name === expectedName);
    const response = await fetchImpl(runtime.resultsOrigin +
      "/twirp/github.actions.results.api.v1.ArtifactService/" + method, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { authorization: "Bearer " + runtime.token,
        "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    return artifactWireResponse(await boundedResponse(response), method);
  }
  return Object.freeze({
    identity: runtime.identity,
    async create(body) {
      try {
        once("create");
        requireArtifact(body.version === 4 &&
          Date.parse(body.expires_at) <= epoch(now()) +
            diagnosticArtifactLimits.retentionMilliseconds &&
          Date.parse(body.expires_at) >= epoch(now()) +
            diagnosticArtifactLimits.retentionMilliseconds - 60_000);
        return await rpc("CreateArtifact", body, ["workflow_run_backend_id",
          "workflow_job_run_backend_id", "name", "expires_at", "version"]);
      } catch { throw new Error("ios_diagnostic_artifact_create_failed"); }
    },
    async upload(url, bytes) {
      try {
        once("upload");
        requireArtifact(Buffer.isBuffer(bytes) && bytes.length >= 22 &&
          bytes.length <= diagnosticArtifactLimits.bytes);
        signedUploadUrl(url, epoch(now()), 60_000);
        const response = await fetchImpl(url, {
          method: "PUT", redirect: "error", signal: AbortSignal.timeout(60_000),
          headers: { "x-ms-blob-type": "BlockBlob", "x-ms-version": "2023-11-03",
            "content-type": "application/zip", "content-length": String(bytes.length) },
          body: Buffer.from(bytes),
        });
        try {
          requireArtifact(response.status === 201);
          uploaded = true;
        } finally {
          await response.body?.cancel().catch(() => {});
        }
      } catch { throw new Error("ios_diagnostic_artifact_upload_failed"); }
    },
    async finalize(body) {
      try {
        once("finalize");
        requireArtifact(uploaded && /^[1-9][0-9]{0,5}$/.test(body.size) &&
          Number(body.size) <= diagnosticArtifactLimits.bytes &&
          /^sha256:[0-9a-f]{64}$/.test(body.hash));
        return await rpc("FinalizeArtifact", body, ["workflow_run_backend_id",
          "workflow_job_run_backend_id", "name", "size", "hash"]);
      } catch { throw new Error("ios_diagnostic_artifact_commit_failed"); }
    },
  });
}

// Owner-side post-job verification against one actual GitHub artifact metadata
// response. The upload receipt alone cannot establish server retention.
export function verifyDiagnosticArtifactMetadata({
  receipt, metadata, expectedIdentity, now = Date.now,
}) {
  try {
    const identity = metadataIdentity(expectedIdentity);
    exact(receipt, ["schemaVersion", "purpose", "artifactId", "name", "size", "sha256",
      "preparedAt", "captureStartedAt", "requestedExpiresAt", "expiryVerified",
      "sourceHead", "sourceTree", "sourceFingerprint"]);
    const current = epoch(now());
    requireArtifact(receipt.schemaVersion === 1 && receipt.purpose === purpose &&
      receipt.expiryVerified === false && receipt.name === identity.name &&
      receipt.sourceHead === identity.head && receipt.sourceTree === identity.tree &&
      receipt.sourceFingerprint === identity.fingerprint &&
      typeof receipt.artifactId === "string" && /^[1-9][0-9]{0,18}$/.test(receipt.artifactId) &&
      typeof receipt.sha256 === "string" && hex64.test(receipt.sha256) &&
      Number.isSafeInteger(receipt.size) && receipt.size >= 22 &&
      receipt.size <= diagnosticArtifactLimits.bytes);
    const prepared = epoch(receipt.preparedAt), captured = epoch(receipt.captureStartedAt);
    requireArtifact(captured >= prepared && current >= captured &&
      receipt.requestedExpiresAt === prepared + diagnosticArtifactLimits.retentionMilliseconds);
    const decimalId = (value) => {
      requireArtifact((typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
        (typeof value === "string" && /^[1-9][0-9]{0,23}$/.test(value)));
      return String(value);
    };
    requireArtifact(metadata && metadata.workflow_run &&
      decimalId(metadata.id) === receipt.artifactId &&
      metadata.name === receipt.name && metadata.size_in_bytes === receipt.size &&
      metadata.digest === "sha256:" + receipt.sha256 && metadata.expired === false &&
      decimalId(metadata.workflow_run.id) === identity.runId &&
      metadata.workflow_run.head_sha === identity.head &&
      typeof metadata.expires_at === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(metadata.expires_at));
    const serverExpiresAt = epoch(Date.parse(metadata.expires_at));
    requireArtifact(serverExpiresAt > current &&
      serverExpiresAt <= receipt.requestedExpiresAt &&
      serverExpiresAt <= captured + diagnosticArtifactLimits.retentionMilliseconds);
    return Object.freeze({ ...receipt, expiryVerified: true, serverExpiresAt, verifiedAt: current });
  } catch { throw new Error("ios_diagnostic_artifact_metadata_rejected"); }
}

export async function inspectFinalizedDiagnosticArtifact({
  readMetadata, receipt, expectedIdentity, now = Date.now,
}) {
  // The owner supplies the existing read-only GitHub connector. One response,
  // no permission probes or retries; failure leaves expiry unverified.
  try {
    requireArtifact(typeof readMetadata === "function" &&
      typeof receipt?.artifactId === "string" && /^[1-9][0-9]{0,18}$/.test(receipt.artifactId));
    const metadata = await readMetadata(receipt.artifactId);
    return verifyDiagnosticArtifactMetadata({ receipt, metadata, expectedIdentity, now });
  } catch { throw new Error("ios_diagnostic_artifact_metadata_rejected"); }
}
