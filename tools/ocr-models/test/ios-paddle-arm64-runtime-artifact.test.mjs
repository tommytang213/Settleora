// Synthetic transport protocol tests. No service, artifact or provider is called.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { promises as actionFs } from "node:fs";
import { tmpdir as actionTmpdir } from "node:os";
import { join as actionJoin } from "node:path";
import { diagnosticArtifactReceiptLine, runDiagnosticArtifactAction, readDiagnosticPrivateFile,
  writeDiagnosticPrivateFile } from "../arm64-runtime-artifact-action/index.mjs";
import {
  diagnosticArtifactLimits as limits,
  diagnosticArtifactRuntime,
  diagnosticArtifactBackend,
  prepareDiagnosticArtifact,
  validateDiagnosticArtifactSlot,
  diagnosticCaptureStart,
  finalizeDiagnosticArtifact,
  verifyDiagnosticArtifactMetadata, inspectFinalizedDiagnosticArtifact,
} from "../ios-paddle-arm64-runtime-artifact.mjs";

const instant = Date.parse("2026-11-12T10:00:00.000Z");
const identity = () => ({
  head: "1".repeat(40), tree: "2".repeat(40), fingerprint: "3".repeat(64),
  runId: "123456", runAttempt: "1",
  workflowRunBackendId: "00000000-0000-0000-0000-000000000001",
  workflowJobRunBackendId: "00000000-0000-0000-0000-000000000002",
});
function fakeUrl(start = instant) {
  const url = new URL("https://synthetic.blob.core.windows.net/private/test.zip");
  url.searchParams.set("sig", "SYNTHETIC_PRIVATE_TOKEN");
  url.searchParams.set("se", new Date(start + 2 * 60 * 60 * 1000).toISOString());
  return url.href;
}
function mockBackend() {
  const calls = { create: [], upload: [], finalize: [] };
  return {
    calls,
    async create(value) {
      calls.create.push(structuredClone(value));
      return { ok: true, signed_upload_url: fakeUrl() };
    },
    async upload(url, bytes) { calls.upload.push({ url, bytes: Buffer.from(bytes) }); },
    async finalize(value) {
      calls.finalize.push(structuredClone(value));
      return { ok: true, artifact_id: "987654" };
    },
  };
}
async function setup() {
  const backend = mockBackend();
  const expectedIdentity = identity();
  const slot = await prepareDiagnosticArtifact({
    backend, identity: expectedIdentity, now: () => instant,
  });
  const captureStart = diagnosticCaptureStart(slot, expectedIdentity, () => instant + 1000);
  return { backend, expectedIdentity, slot, captureStart };
}
function opaqueTestPayload(length = 64) {
  // Only the transport's byte/signature boundary is under test here. The
  // separate bundle builder must validate actual ZIP inventory/JSON contents.
  const bytes = Buffer.alloc(length, 0x41);
  if (length >= 4) bytes.writeUInt32LE(0x04034b50, 0);
  return bytes;
}
const clock = () => instant + 2000;

test("prepares protocol4 expiry before capture without accepting receipt data", async () => {
  const { backend, slot, expectedIdentity } = await setup();
  assert.equal(backend.calls.create.length, 1);
  assert.deepEqual(backend.calls.create[0], {
    workflow_run_backend_id: expectedIdentity.workflowRunBackendId,
    workflow_job_run_backend_id: expectedIdentity.workflowJobRunBackendId,
    name: slot.name,
    expires_at: new Date(instant + limits.retentionMilliseconds).toISOString(),
    version: 4,
  });
  assert.equal(slot.preparedAt, instant);
  assert.equal(slot.expiresAt, instant + 24 * 60 * 60 * 1000);
  assert.equal(Object.isFrozen(slot), true);
  assert.equal(Object.isFrozen(slot.identity), true);
  assert.equal(backend.calls.upload.length, 0);
});

test("finalizes the same container without resetting expiry or disclosing its URL", async () => {
  const state = await setup();
  const bytes = opaqueTestPayload();
  const result = await finalizeDiagnosticArtifact({
    ...state, zipBytes: bytes, now: clock,
  });
  assert.equal(state.backend.calls.upload.length, 1);
  assert.equal(state.backend.calls.finalize.length, 1);
  assert.deepEqual(state.backend.calls.finalize[0], {
    workflow_run_backend_id: state.expectedIdentity.workflowRunBackendId,
    workflow_job_run_backend_id: state.expectedIdentity.workflowJobRunBackendId,
    name: state.slot.name, size: String(bytes.length),
    hash: "sha256:" + createHash("sha256").update(bytes).digest("hex"),
  });
  assert.equal(result.requestedExpiresAt, instant + limits.retentionMilliseconds);
  assert.equal(result.expiryVerified, false);
  assert.ok(result.requestedExpiresAt <= result.captureStartedAt + limits.retentionMilliseconds);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE_TOKEN"), false);
  assert.equal(JSON.stringify(result).includes("blob.core.windows.net"), false);
  assert.equal(result.size, bytes.length);
});

test("UTC lifetime stays24 hours across daylight-saving date boundaries", async () => {
  for (const when of ["2026-03-08T06:59:00Z", "2026-11-01T05:59:00Z"]) {
    const start = Date.parse(when);
    const backend = mockBackend();
    backend.create = async () => ({ ok: true, signed_upload_url: fakeUrl(start) });
    const slot = await prepareDiagnosticArtifact({
      backend, identity: identity(), now: () => start,
    });
    assert.equal(slot.expiresAt - slot.preparedAt, 86_400_000);
  }
});

test("rejects capture before preparation and after the configured job window", async () => {
  const { slot, expectedIdentity, backend } = await setup();
  for (const now of [instant - 1, instant + limits.jobMilliseconds]) {
    assert.throws(() => diagnosticCaptureStart(slot, expectedIdentity, () => now),
      { message: "ios_diagnostic_capture_start_rejected" });
  }
  assert.equal(backend.calls.upload.length, 0);
});

test("rejects stale or cross-source/run/attempt private descriptors", async () => {
  const { slot, expectedIdentity } = await setup();
  for (const mutate of [
    (value) => { value.identity.head = "4".repeat(40); },
    (value) => { value.identity.runId = "999"; },
    (value) => { value.identity.runAttempt = "2"; },
    (value) => { value.identity.workflowJobRunBackendId = "00000000-0000-0000-0000-000000000003"; },
    (value) => { value.name += "-changed"; },
    (value) => { value.expiresAt += 1; },
    (value) => { value.rawText = "SYNTHETIC_PRIVATE_SENTINEL"; },
  ]) {
    const changed = JSON.parse(JSON.stringify(slot));
    mutate(changed);
    assert.throws(() => validateDiagnosticArtifactSlot(changed, expectedIdentity),
      { message: "ios_diagnostic_artifact_slot_rejected" });
  }
});

test("rejects malformed identities before requesting a remote slot", async () => {
  for (const mutate of [
    (value) => { value.runAttempt = "2"; },
    (value) => { value.head += "\n"; },
    (value) => { value.fingerprint = false; },
    (value) => { value.runId = "0"; },
    (value) => { value.extra = "SYNTHETIC_PRIVATE_SENTINEL"; },
  ]) {
    const backend = mockBackend(), candidate = identity();
    mutate(candidate);
    await assert.rejects(prepareDiagnosticArtifact({
      backend, identity: candidate, now: () => instant,
    }), { message: "ios_diagnostic_artifact_prepare_failed" });
    assert.equal(backend.calls.create.length, 0);
  }
});

test("rejects unsafe signed endpoints without uploading any bytes", async () => {
  const candidates = [
    fakeUrl().replace("https:", "http:"),
    fakeUrl().replace("synthetic.blob.core.windows.net", "example.com"),
    fakeUrl().replace("https://", "https://user:password@"),
    fakeUrl() + "#fragment",
    fakeUrl() + "&sig=another",
    fakeUrl() + "&se=another",
  ];
  const short = new URL(fakeUrl());
  short.searchParams.set("se", new Date(instant + limits.jobMilliseconds).toISOString());
  candidates.push(short.href);
  for (const url of candidates) {
    const backend = mockBackend();
    backend.create = async () => ({ ok: true, signed_upload_url: url });
    await assert.rejects(prepareDiagnosticArtifact({
      backend, identity: identity(), now: () => instant,
    }), { message: "ios_diagnostic_artifact_prepare_failed" });
    assert.equal(backend.calls.upload.length, 0);
  }
});

test("enforces ZIP byte/signature bounds before upload without truncation", async () => {
  for (const bytes of [
    Buffer.alloc(0), Buffer.alloc(21), Buffer.alloc(64),
    opaqueTestPayload(limits.bytes + 1),
  ]) {
    const state = await setup();
    await assert.rejects(finalizeDiagnosticArtifact({
      ...state, zipBytes: bytes, now: clock,
    }), { message: "ios_diagnostic_artifact_finalize_failed" });
    assert.equal(state.backend.calls.upload.length, 0);
  }
  const state = await setup();
  const bytes = opaqueTestPayload(limits.bytes);
  const result = await finalizeDiagnosticArtifact({ ...state, zipBytes: bytes, now: clock });
  assert.equal(result.size, limits.bytes);
  assert.deepEqual(state.backend.calls.upload[0].bytes, bytes);
});

test("copies data/context before awaits and never accepts mutation of the admitted bytes", async () => {
  const original = await setup();
  const slot = JSON.parse(JSON.stringify(original.slot));
  const captureStart = { ...original.captureStart };
  const bytes = opaqueTestPayload();
  const expectedBytes = Buffer.from(bytes);
  let release;
  original.backend.upload = async (url, body) => {
    original.backend.calls.upload.push({ url, bytes: Buffer.from(body) });
    await new Promise((resolve) => { release = resolve; });
  };
  const pending = finalizeDiagnosticArtifact({
    ...original, slot, captureStart, zipBytes: bytes, now: clock,
  });
  assert.equal(typeof release, "function");
  slot.identity.head = "4".repeat(40);
  slot.name = "changed";
  slot.uploadUrl = "https://example.com";
  captureStart.startedAt = 0;
  bytes.fill(0);
  release();
  const result = await pending;
  assert.equal(result.sourceHead, original.expectedIdentity.head);
  assert.equal(result.name, original.slot.name);
  assert.equal(result.captureStartedAt, original.captureStart.startedAt);
  assert.deepEqual(original.backend.calls.upload[0].bytes, expectedBytes);
});

test("attempts every phase once and masks provider/URL/token error details", async () => {
  const sentinel = "https://private.invalid/?token=SYNTHETIC_PRIVATE_TOKEN";
  const prepareBackend = mockBackend();
  prepareBackend.create = async () => { throw new Error(sentinel); };
  await assert.rejects(prepareDiagnosticArtifact({
    backend: prepareBackend, identity: identity(), now: () => instant,
  }), { message: "ios_diagnostic_artifact_prepare_failed" });
  const state = await setup();
  let uploads = 0;
  state.backend.upload = async () => { uploads++; throw new Error(sentinel); };
  for (var attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(finalizeDiagnosticArtifact({
      ...state, zipBytes: opaqueTestPayload(), now: clock,
    }), { message: "ios_diagnostic_artifact_finalize_failed" });
  }
  assert.equal(uploads, 1);
  assert.equal(state.backend.calls.finalize.length, 0);
});

test("never uploads after expiry, before capture, or beyond the job bound", async () => {
  for (const now of [
    instant + 999,
    instant + limits.jobMilliseconds,
    instant + limits.retentionMilliseconds,
  ]) {
    const state = await setup();
    await assert.rejects(finalizeDiagnosticArtifact({
      ...state, zipBytes: opaqueTestPayload(), now: () => now,
    }), { message: "ios_diagnostic_artifact_finalize_failed" });
    assert.equal(state.backend.calls.upload.length, 0);
  }
});

test("rejects unacknowledged or malformed finalization results", async () => {
  for (const response of [
    { ok: false, artifact_id: "987654" },
    { ok: true, artifact_id: 987654 },
    { ok: true, artifact_id: "0" },
    { ok: true, artifact_id: "SYNTHETIC_PRIVATE_SENTINEL" },
  ]) {
    const state = await setup();
    state.backend.finalize = async (value) => {
      state.backend.calls.finalize.push(value);
      return response;
    };
    await assert.rejects(finalizeDiagnosticArtifact({
      ...state, zipBytes: opaqueTestPayload(), now: clock,
    }), { message: "ios_diagnostic_artifact_finalize_failed" });
    assert.equal(state.backend.calls.upload.length, 1);
    assert.equal(state.backend.calls.finalize.length, 1);
  }
});


function runtimeEnv() {
  const source = identity();
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(instant / 1000) + 3600,
    scp: "Actions.ExampleScope Actions.Results:" +
      source.workflowRunBackendId + ":" + source.workflowJobRunBackendId,
  })).toString("base64url");
  return {
    GITHUB_ACTIONS: "true", GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "tommytang213/Settleora", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: source.runId, GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: source.head,
    DIAGNOSTIC_SOURCE_HEAD: source.head, DIAGNOSTIC_SOURCE_TREE: source.tree,
    DIAGNOSTIC_SOURCE_FINGERPRINT: source.fingerprint,
    DIAGNOSTIC_WORKFLOW_SHA: source.head,
    ACTIONS_RUNTIME_TOKEN: "synthetic." + payload + ".SYNTHETIC_SIGNATURE",
    ACTIONS_RESULTS_URL: "https://results-receiver.actions.githubusercontent.com/",
  };
}

test("binds the action runtime to exact source, first run attempt and job token scope", () => {
  const env = runtimeEnv();
  const result = diagnosticArtifactRuntime(env, () => instant);
  assert.deepEqual(result.identity, identity());
  assert.equal(result.resultsOrigin, "https://results-receiver.actions.githubusercontent.com");
  assert.equal(Object.isFrozen(result.identity), true);
  for (const [key, value] of [
    ["GITHUB_ACTIONS", "false"], ["GITHUB_REPOSITORY", "other/repository"],
    ["GITHUB_EVENT_NAME", "pull_request"], ["GITHUB_RUN_ATTEMPT", "2"],
    ["GITHUB_SHA", "4".repeat(40)], ["DIAGNOSTIC_WORKFLOW_SHA", "4".repeat(40)],
    ["ACTIONS_RUNTIME_TOKEN", "malformed"],
    ["ACTIONS_RESULTS_URL", "https://example.com"],
    ["ACTIONS_RESULTS_URL", "https://actions.githubusercontent.com.evil.invalid"],
    ["ACTIONS_RESULTS_URL", "http://results-receiver.actions.githubusercontent.com"],
    ["ACTIONS_RESULTS_URL", "https://user:secret@results-receiver.actions.githubusercontent.com"],
    ["ACTIONS_RESULTS_URL", "https://results-receiver.actions.githubusercontent.com/?token=secret"],
  ]) {
    assert.throws(() => diagnosticArtifactRuntime({ ...env, [key]: value }, () => instant),
      { message: "ios_diagnostic_artifact_runtime_rejected" });
  }
  assert.throws(() => diagnosticArtifactRuntime(env, () => instant + 3600_000),
    { message: "ios_diagnostic_artifact_runtime_rejected" });
});

test("rejects ambiguous or malformed backend claims without any network call", () => {
  const env = runtimeEnv();
  for (const scp of ["", "Actions.Results:a:b", "Actions.Results:a:b:c",
    "Actions.Results:" + identity().workflowRunBackendId + ":" +
      identity().workflowJobRunBackendId + " Actions.Results:a:b"]) {
    const payload = Buffer.from(JSON.stringify({
      exp: Math.floor(instant / 1000) + 3600, scp,
    })).toString("base64url");
    assert.throws(() => diagnosticArtifactRuntime({
      ...env, ACTIONS_RUNTIME_TOKEN: "synthetic." + payload + ".signature",
    }, () => instant), { message: "ios_diagnostic_artifact_runtime_rejected" });
  }
});

test("uses one protocol4 POST, one credential-free Blob PUT and one finalization", async () => {
  const calls = [], env = runtimeEnv();
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") return new Response(null, { status: 201 });
    const value = url.endsWith("CreateArtifact") ?
      { ok: true, signed_upload_url: fakeUrl() } :
      { ok: true, artifact_id: "987654" };
    return new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  };
  const backend = diagnosticArtifactBackend({ env, fetchImpl, now: () => instant });
  const slot = await prepareDiagnosticArtifact({ backend, identity: backend.identity,
    now: () => instant });
  const captureStart = diagnosticCaptureStart(slot, backend.identity, () => instant + 1000);
  const result = await finalizeDiagnosticArtifact({
    backend, slot, expectedIdentity: backend.identity, captureStart,
    zipBytes: opaqueTestPayload(), now: clock,
  });
  assert.equal(result.artifactId, "987654");
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.options.redirect, "error");
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  for (const index of [0, 2]) {
    assert.equal(calls[index].options.headers.authorization,
      "Bearer " + env.ACTIONS_RUNTIME_TOKEN);
    assert.ok(calls[index].url.startsWith(
      "https://results-receiver.actions.githubusercontent.com/twirp/"));
  }
  assert.equal(Object.hasOwn(calls[1].options.headers, "authorization"), false);
  assert.equal(calls[1].options.headers["x-ms-blob-type"], "BlockBlob");
  assert.equal(calls[1].options.headers["content-length"], "64");
  assert.equal(JSON.parse(calls[2].options.body).expires_at, undefined);
});

test("masks transport failures and never retries a denied create", async () => {
  const env = runtimeEnv();
  let calls = 0;
  const backend = diagnosticArtifactBackend({
    env, now: () => instant,
    fetchImpl: async () => { calls++; throw new Error(env.ACTIONS_RUNTIME_TOKEN); },
  });
  for (let index = 0; index < 2; index++) {
    await assert.rejects(prepareDiagnosticArtifact({
      backend, identity: backend.identity, now: () => instant,
    }), { message: "ios_diagnostic_artifact_prepare_failed" });
  }
  assert.equal(calls, 1);
});

test("rejects non-JSON, oversized, invalid UTF-8 and redirected service responses", async () => {
  const responses = [
    () => new Response("denied", { status: 403 }),
    () => new Response(null, { status: 302 }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => new Response(Buffer.alloc(limits.responseBytes + 1, 32),
      { headers: { "content-type": "application/json" } }),
    () => new Response(Buffer.from([0xff]), { headers: { "content-type": "application/json" } }),
    () => new Response("{}", { headers: { "content-type": "application/json",
      "content-length": String(limits.responseBytes + 1) } }),
  ];
  for (const makeResponse of responses) {
    let calls = 0;
    const backend = diagnosticArtifactBackend({
      env: runtimeEnv(), now: () => instant,
      fetchImpl: async () => { calls++; return makeResponse(); },
    });
    await assert.rejects(prepareDiagnosticArtifact({
      backend, identity: backend.identity, now: () => instant,
    }), { message: "ios_diagnostic_artifact_prepare_failed" });
    assert.equal(calls, 1);
  }
});

test("does not finalize or retry upload after a rejected Blob PUT", async () => {
  const calls = [];
  const backend = diagnosticArtifactBackend({
    env: runtimeEnv(), now: () => instant,
    fetchImpl: async (url, options) => {
      calls.push(options.method);
      if (options.method === "PUT") return new Response(null, { status: 403 });
      return new Response(JSON.stringify({ ok: true, signed_upload_url: fakeUrl() }),
        { headers: { "content-type": "application/json" } });
    },
  });
  const slot = await prepareDiagnosticArtifact({ backend, identity: backend.identity,
    now: () => instant });
  const captureStart = diagnosticCaptureStart(slot, backend.identity, () => instant + 1000);
  await assert.rejects(finalizeDiagnosticArtifact({
    backend, slot, expectedIdentity: backend.identity, captureStart,
    zipBytes: opaqueTestPayload(), now: clock,
  }), { message: "ios_diagnostic_artifact_finalize_failed" });
  await assert.rejects(backend.upload(fakeUrl(), opaqueTestPayload()),
    { message: "ios_diagnostic_artifact_upload_failed" });
  await assert.rejects(backend.finalize({}),
    { message: "ios_diagnostic_artifact_commit_failed" });
  assert.deepEqual(calls, ["POST", "PUT"]);
});

test("backend refuses a cross-job request and a renewed lifetime before network", async () => {
  for (const mutate of [
    (value) => { value.workflow_job_run_backend_id = "00000000-0000-0000-0000-000000000003"; },
    (value) => { value.name = "another"; },
    (value) => { value.expires_at = new Date(instant + limits.retentionMilliseconds + 1).toISOString(); },
    (value) => { value.extra = "SYNTHETIC_PRIVATE_SENTINEL"; },
  ]) {
    let calls = 0;
    const backend = diagnosticArtifactBackend({
      env: runtimeEnv(), now: () => instant, fetchImpl: async () => { calls++; },
    });
    const source = backend.identity;
    const request = {
      workflow_run_backend_id: source.workflowRunBackendId,
      workflow_job_run_backend_id: source.workflowJobRunBackendId,
      name: "settleora-arm64-ridge-private-" + source.runId + "-" + source.workflowJobRunBackendId,
      version: 4, expires_at: new Date(instant + limits.retentionMilliseconds).toISOString(),
    };
    mutate(request);
    await assert.rejects(backend.create(request),
      { message: "ios_diagnostic_artifact_create_failed" });
    assert.equal(calls, 0);
  }
});


test("normalizes both protobuf JSON response spellings and rejects ambiguous fields", async () => {
  for (const field of ["signed_upload_url", "signedUploadUrl"]) {
    const backend = diagnosticArtifactBackend({
      env: runtimeEnv(), now: () => instant,
      fetchImpl: async () => new Response(JSON.stringify({ ok: true, [field]: fakeUrl() }),
        { headers: { "content-type": "application/json" } }),
    });
    const slot = await prepareDiagnosticArtifact({
      backend, identity: backend.identity, now: () => instant,
    });
    assert.equal(slot.uploadUrl, fakeUrl());
  }
  for (const body of [
    { ok: true, signed_upload_url: fakeUrl(), signedUploadUrl: fakeUrl() },
    { ok: true, signed_upload_url: fakeUrl(), unexpected: "SYNTHETIC_SENTINEL" },
    { ok: true, signedUploadUrl: 123 },
    { ok: "true", signed_upload_url: fakeUrl() },
  ]) {
    const backend = diagnosticArtifactBackend({
      env: runtimeEnv(), now: () => instant,
      fetchImpl: async () => new Response(JSON.stringify(body),
        { headers: { "content-type": "application/json" } }),
    });
    await assert.rejects(prepareDiagnosticArtifact({
      backend, identity: backend.identity, now: () => instant,
    }), { message: "ios_diagnostic_artifact_prepare_failed" });
  }
});

test("cancels a denied response body before reporting the fixed error category", async () => {
  let cancelled = 0;
  const response = new Response(new ReadableStream({
    cancel() { cancelled++; },
  }), { status: 403 });
  const backend = diagnosticArtifactBackend({
    env: runtimeEnv(), now: () => instant, fetchImpl: async () => response,
  });
  await assert.rejects(prepareDiagnosticArtifact({
    backend, identity: backend.identity, now: () => instant,
  }), { message: "ios_diagnostic_artifact_prepare_failed" });
  assert.equal(cancelled, 1);
});

test("allows preparation clock progress without extending the fixed UTC expiry", async () => {
  let time = instant;
  const backend = diagnosticArtifactBackend({
    env: runtimeEnv(), now: () => ++time,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true, signed_upload_url: fakeUrl(),
    }), { headers: { "content-type": "application/json" } }),
  });
  const slot = await prepareDiagnosticArtifact({
    backend, identity: backend.identity, now: () => ++time,
  });
  assert.equal(slot.expiresAt - slot.preparedAt, limits.retentionMilliseconds);
});

async function actionFixture(run) {
  const parent = await actionFs.realpath(actionTmpdir());
  const temporary = await actionFs.mkdtemp(actionJoin(parent, "settleora-artifact-test-"));
  const env = { ...runtimeEnv(), RUNNER_TEMP: temporary, INPUT_PHASE: "prepare" };
  const root = actionJoin(temporary, "settleora-arm64-ridge-private-" + env.GITHUB_RUN_ID + "-1");
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (options.method === "PUT") return new Response(null, { status: 201 });
    return new Response(JSON.stringify(url.endsWith("CreateArtifact") ?
      { ok: true, signed_upload_url: fakeUrl() } : { ok: true, artifactId: "987654" }),
      { headers: { "content-type": "application/json" } });
  };
  const state = { temporary, env, root, calls, fetchImpl };
  try { await run(state); }
  finally { await actionFs.rm(temporary, { recursive: true, force: false }); }
}
async function prepareActionFixture(state) {
  return runDiagnosticArtifactAction({
    env: state.env, fetchImpl: state.fetchImpl, now: () => instant,
  });
}
async function writeSyntheticActionBundle(state) {
  // This tests the action's verifier/hash handshake, not ZIP validation. The
  // separately tested Python verifier is always used by the action entrypoint.
  const slot = JSON.parse(await actionFs.readFile(actionJoin(state.root, "slot.json"), "utf8"));
  const captureStart = diagnosticCaptureStart(slot, identity(), () => instant + 1000);
  await actionFs.writeFile(actionJoin(state.root, "capture-start.json"),
    JSON.stringify(captureStart), { mode: 0o600, flag: "wx" });
  const bytes = opaqueTestPayload();
  await actionFs.writeFile(actionJoin(state.root, "bundle.zip"), bytes,
    { mode: 0o600, flag: "wx" });
  return {
    schemaVersion: 1, purpose: "arm64_ridge_runtime_v1",
    sourceHead: identity().head, sourceTree: identity().tree,
    sourceFingerprint: identity().fingerprint, runId: identity().runId,
    runAttempt: "1", size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
function finalizeActionFixture(state, verifyBundle) {
  return runDiagnosticArtifactAction({
    env: { ...state.env, INPUT_PHASE: "finalize" }, fetchImpl: state.fetchImpl,
    now: () => instant + 2000, verifyBundle,
  });
}

test("local action stages one private descriptor and one verified upload without replacement", async () => {
  await actionFixture(async (state) => {
    const prepared = await prepareActionFixture(state);
    assert.equal(prepared.stage, "prepared");
    assert.equal((await actionFs.stat(state.root)).mode & 0o7777, 0o700);
    for (const name of ["prepare-attempt.json", "slot.json"]) {
      assert.equal((await actionFs.stat(actionJoin(state.root, name))).mode & 0o7777, 0o600);
    }
    const receipt = await writeSyntheticActionBundle(state);
    let verified = 0;
    const result = await finalizeActionFixture(state, async (root, source, verifierEnv) => {
      assert.equal(root, state.root);
      assert.deepEqual(source, identity());
      assert.equal(verifierEnv.GITHUB_SHA, source.head);
      assert.equal(verifierEnv.ACTIONS_RUNTIME_TOKEN, undefined);
      assert.equal(verifierEnv.ACTIONS_RESULTS_URL, undefined);
      verified++;
      return receipt;
    });
    assert.equal(result.stage, "finalized");
    assert.equal(result.expiryVerified, false);
    assert.equal(result.requestedExpiresAt, instant + limits.retentionMilliseconds);
    assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE_TOKEN"), false);
    assert.equal(verified, 1);
    assert.deepEqual(state.calls.map((call) => call.method), ["POST", "PUT", "POST"]);
    const saved = JSON.parse(await actionFs.readFile(
      actionJoin(state.root, "artifact-receipt.json"), "utf8"));
    assert.equal(saved.sha256, receipt.sha256);
    await assert.rejects(prepareActionFixture(state),
      { message: "ios_diagnostic_artifact_action_failed" });
    await assert.rejects(finalizeActionFixture(state, async () => { verified++; return receipt; }),
      { message: "ios_diagnostic_artifact_action_failed" });
    assert.equal(verified, 1);
    assert.equal(state.calls.length, 3);
  });
});

test("local action rejects an invalid runtime before directory creation or network", async () => {
  await actionFixture(async (state) => {
    await assert.rejects(runDiagnosticArtifactAction({
      env: { ...state.env, GITHUB_RUN_ATTEMPT: "2" },
      fetchImpl: state.fetchImpl, now: () => instant,
    }), { message: "ios_diagnostic_artifact_action_failed" });
    assert.deepEqual(await actionFs.readdir(state.temporary), []);
    assert.equal(state.calls.length, 0);
  });
});

test("local action latches a failed preparation before the only network attempt", async () => {
  await actionFixture(async (state) => {
    let calls = 0;
    const denied = async () => { calls++; throw new Error("SYNTHETIC_PRIVATE_TOKEN"); };
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(runDiagnosticArtifactAction({
        env: state.env, fetchImpl: denied, now: () => instant,
      }), { message: "ios_diagnostic_artifact_action_failed" });
    }
    assert.equal(calls, 1);
    assert.deepEqual((await actionFs.readdir(state.root)).sort(), ["prepare-attempt.json"]);
  });
});

test("local action refuses a symlink root and never writes to its target", async () => {
  await actionFixture(async (state) => {
    const outside = actionJoin(state.temporary, "outside");
    await actionFs.mkdir(outside, { mode: 0o700 });
    await actionFs.symlink(outside, state.root);
    await assert.rejects(finalizeActionFixture(state, async () => assert.fail("must not verify")),
      { message: "ios_diagnostic_artifact_action_failed" });
    assert.deepEqual(await actionFs.readdir(outside), []);
    assert.equal(state.calls.length, 0);
  });
});

test("local action rejects descriptor symlinks, loose modes and oversized files before upload", async () => {
  for (const mutation of ["symlink", "mode", "size"]) {
    await actionFixture(async (state) => {
      await prepareActionFixture(state);
      const slot = actionJoin(state.root, "slot.json");
      const sentinel = actionJoin(state.temporary, "sentinel");
      await actionFs.writeFile(sentinel, "SYNTHETIC_SENTINEL", { mode: 0o600, flag: "wx" });
      if (mutation === "symlink") {
        await actionFs.unlink(slot);
        await actionFs.symlink(sentinel, slot);
      } else if (mutation === "mode") {
        await actionFs.chmod(slot, 0o644);
      } else {
        await actionFs.writeFile(slot, Buffer.alloc(limits.descriptorBytes + 1));
      }
      await assert.rejects(finalizeActionFixture(state, async () => assert.fail("must not verify")),
        { message: "ios_diagnostic_artifact_action_failed" });
      assert.equal(await actionFs.readFile(sentinel, "utf8"), "SYNTHETIC_SENTINEL");
      assert.deepEqual(state.calls.map((call) => call.method), ["POST"]);
    });
  }
});

test("local action masks verifier output and leaves the failed upload attempt latched", async () => {
  await actionFixture(async (state) => {
    await prepareActionFixture(state);
    await writeSyntheticActionBundle(state);
    let verified = 0;
    const verifier = async () => {
      verified++; throw new Error("SYNTHETIC_PRIVATE_TOKEN raw child output");
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(finalizeActionFixture(state, verifier),
        { message: "ios_diagnostic_artifact_action_failed" });
    }
    assert.equal(verified, 1);
    assert.deepEqual(state.calls.map((call) => call.method), ["POST"]);
  });
});

test("local action refuses cross-source verification and ZIP changes after verification", async () => {
  for (const mutation of ["source", "bytes"]) {
    await actionFixture(async (state) => {
      await prepareActionFixture(state);
      const receipt = await writeSyntheticActionBundle(state);
      await assert.rejects(finalizeActionFixture(state, async () => {
        if (mutation === "source") return { ...receipt, sourceHead: "4".repeat(40) };
        const changed = opaqueTestPayload(); changed[20] ^= 1;
        await actionFs.writeFile(actionJoin(state.root, "bundle.zip"), changed);
        return receipt;
      }), { message: "ios_diagnostic_artifact_action_failed" });
      assert.deepEqual(state.calls.map((call) => call.method), ["POST"]);
    });
  }
});

test("local action rejects hardlinked input without following an unrelated file alias", async () => {
  await actionFixture(async (state) => {
    await prepareActionFixture(state);
    await writeSyntheticActionBundle(state);
    const source = actionJoin(state.root, "capture-start.json");
    const alias = actionJoin(state.temporary, "capture-alias.json");
    await actionFs.link(source, alias);
    const before = await actionFs.readFile(alias);
    await assert.rejects(finalizeActionFixture(state, async () => assert.fail("must not verify")),
      { message: "ios_diagnostic_artifact_action_failed" });
    assert.deepEqual(await actionFs.readFile(alias), before);
    assert.deepEqual(state.calls.map((call) => call.method), ["POST"]);
  });
});


test("shared private helpers bind child names and copy admitted bytes before awaits", async () => {
  await actionFixture(async (state) => {
    await prepareActionFixture(state);
    await assert.rejects(readDiagnosticPrivateFile(state.root, "../outside", 128));
    await assert.rejects(writeDiagnosticPrivateFile(state.root, "../outside",
      Buffer.from("synthetic"), 128));
    await assert.rejects(readDiagnosticPrivateFile(state.root, "slot.json", 512 * 1024 + 1));
    const bytes = Buffer.from("SYNTHETIC_OWNED_BYTES"), before = Buffer.from(bytes);
    const pending = writeDiagnosticPrivateFile(state.root, "owned.json", bytes, 128);
    bytes.fill(0);
    await pending;
    assert.deepEqual(await readDiagnosticPrivateFile(state.root, "owned.json", 128), before);
    await assert.rejects(writeDiagnosticPrivateFile(state.root, "owned.json", before, 128));
  });
});

async function finalizedMetadataFixture() {
  const f = await setup();
  const receipt = await finalizeDiagnosticArtifact({ ...f, zipBytes: opaqueTestPayload(), now: clock });
  const metadata = {
    id: Number(receipt.artifactId), name: receipt.name, size_in_bytes: receipt.size,
    digest: "sha256:" + receipt.sha256, expired: false,
    expires_at: new Date(receipt.requestedExpiresAt).toISOString(),
    workflow_run: { id: Number(f.expectedIdentity.runId), head_sha: f.expectedIdentity.head },
    archive_download_url: "https://SYNTHETIC_PRIVATE_URL",
  };
  const expectedIdentity = {
    head: f.expectedIdentity.head, tree: f.expectedIdentity.tree,
    fingerprint: f.expectedIdentity.fingerprint, runId: f.expectedIdentity.runId,
    runAttempt: "1", name: receipt.name,
  };
  return { ...f, expectedIdentity, receipt, metadata };
}

test("actual server metadata verifies expiry and binds the exact finalized artifact and source", async () => {
  const f = await finalizedMetadataFixture();
  const result = verifyDiagnosticArtifactMetadata({ ...f, now: clock });
  assert.equal(result.expiryVerified, true);
  assert.equal(result.serverExpiresAt, f.receipt.requestedExpiresAt);
  assert.equal(f.receipt.expiryVerified, false);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE_URL"), false);
});

test("metadata verification rejects wrong artifact, run, head, digest, size and extended retention", async () => {
  const f = await finalizedMetadataFixture();
  for (const mutate of [
    (m) => m.id++, (m) => m.name += "-other", (m) => m.size_in_bytes++,
    (m) => m.digest = "sha256:" + "f".repeat(64), (m) => m.expired = true,
    (m) => m.workflow_run.id++, (m) => m.workflow_run.head_sha = "f".repeat(40),
    (m) => m.expires_at = new Date(f.receipt.requestedExpiresAt + 1).toISOString(),
    (m) => m.expires_at = new Date(instant + 1000).toISOString(),
    (m) => delete m.expires_at,
  ]) {
    const metadata = structuredClone(f.metadata);
    mutate(metadata);
    assert.throws(() => verifyDiagnosticArtifactMetadata({ ...f, metadata, now: clock }),
      /^Error: ios_diagnostic_artifact_metadata_rejected$/);
  }
});

test("owner metadata inspection makes one read and never retries a denied read", async () => {
  const f = await finalizedMetadataFixture();
  let calls = 0;
  const readMetadata = async (artifactId) => {
    calls++;
    assert.equal(artifactId, f.receipt.artifactId);
    throw new Error("403 SYNTHETIC_PRIVATE_ERROR");
  };
  await assert.rejects(inspectFinalizedDiagnosticArtifact({ ...f, readMetadata, now: clock }),
    /^Error: ios_diagnostic_artifact_metadata_rejected$/);
  assert.equal(calls, 1);
});

test("late finalization accepts a one-hour SAS without demanding a second whole job window", async () => {
  let current = instant;
  const calls = [], env = runtimeEnv();
  const url = new URL(fakeUrl());
  url.searchParams.set("se", new Date(instant + 60 * 60 * 1000).toISOString());
  const backend = diagnosticArtifactBackend({ env, now: () => current,
    fetchImpl: async (target, options) => {
      calls.push(options.method);
      if (options.method === "PUT") return new Response(null, { status: 201 });
      return new Response(JSON.stringify(target.endsWith("CreateArtifact") ?
        { ok: true, signed_upload_url: url.href } : { ok: true, artifact_id: "987654" }),
        { headers: { "content-type": "application/json" } });
    },
  });
  const slot = await prepareDiagnosticArtifact({ backend, identity: backend.identity, now: () => current });
  const captureStart = diagnosticCaptureStart(slot, backend.identity, () => instant + 1000);
  current = instant + 30 * 60 * 1000;
  const result = await finalizeDiagnosticArtifact({
    backend, slot, expectedIdentity: backend.identity, captureStart,
    zipBytes: opaqueTestPayload(), now: () => current,
  });
  assert.equal(result.artifactId, "987654");
  assert.deepEqual(calls, ["POST", "PUT", "POST"]);
  assert.equal(result.expiryVerified, false);
});

test("upload keeps a one-minute SAS safety margin without retrying an insufficient URL", async () => {
  let current = instant, puts = 0;
  const env = runtimeEnv(), url = new URL(fakeUrl());
  url.searchParams.set("se", new Date(instant + limits.jobMilliseconds + 1).toISOString());
  const backend = diagnosticArtifactBackend({ env, now: () => current,
    fetchImpl: async (target, options) => {
      if (options.method === "PUT") { puts++; return new Response(null, { status: 201 }); }
      return new Response(JSON.stringify({ ok: true, signed_upload_url: url.href }),
        { headers: { "content-type": "application/json" } });
    },
  });
  const slot = await prepareDiagnosticArtifact({ backend, identity: backend.identity, now: () => current });
  current = instant + limits.jobMilliseconds - 30000;
  await assert.rejects(backend.upload(slot.uploadUrl, opaqueTestPayload()),
    { message: "ios_diagnostic_artifact_upload_failed" });
  assert.equal(puts, 0);
});

test("actual logged receipt passes post-job verification using only observable owner identity", async () => {
  const f = await finalizedMetadataFixture();
  const line = diagnosticArtifactReceiptLine({ stage: "finalized", ...f.receipt });
  const marker = "SETTLEORA_ARM64_RUNTIME_ARTIFACT_RECEIPT=";
  assert.ok(line.startsWith(marker));
  const receipt = JSON.parse(line.slice(marker.length));
  assert.equal(Object.hasOwn(receipt, "stage"), false);
  assert.equal(Object.keys(receipt).length, 13);
  assert.equal(Object.hasOwn(f.expectedIdentity, "workflowRunBackendId"), false);
  assert.equal(Object.hasOwn(f.expectedIdentity, "workflowJobRunBackendId"), false);
  assert.equal(verifyDiagnosticArtifactMetadata({ ...f, receipt, now: clock }).expiryVerified, true);
  assert.throws(() => verifyDiagnosticArtifactMetadata({
    ...f, expectedIdentity: { ...f.expectedIdentity, name: f.expectedIdentity.name + "-other" }, now: clock,
  }), { message: "ios_diagnostic_artifact_metadata_rejected" });
});
