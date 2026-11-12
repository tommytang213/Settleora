import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  diagnosticArtifactBackend, diagnosticArtifactLimits,
  prepareDiagnosticArtifact, validateDiagnosticArtifactSlot,
  finalizeDiagnosticArtifact,
} from "../ios-paddle-arm64-runtime-artifact.mjs";

const execFileAsync = promisify(execFile);
const purpose = "arm64_ridge_runtime_v1";
function requireAction(condition) {
  if (!condition) throw new Error("ios_diagnostic_artifact_action_rejected");
}
function exact(value, keys) {
  requireAction(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) =>
      Object.hasOwn(value, key)));
}
function owned(stat, mode) {
  return stat.uid === BigInt(process.getuid()) &&
    (stat.mode & 0o7777n) === BigInt(mode);
}
async function checkRoot(root) {
  const stat = await fs.lstat(root, { bigint: true });
  requireAction(stat.isDirectory() && owned(stat, 0o700) &&
    await fs.realpath(root) === root);
}
async function privateRoot(env, identity, create) {
  requireAction(typeof env.RUNNER_TEMP === "string" &&
    env.RUNNER_TEMP.length > 0 && resolve(env.RUNNER_TEMP) === env.RUNNER_TEMP &&
    await fs.realpath(env.RUNNER_TEMP) === env.RUNNER_TEMP);
  const parent = await fs.lstat(env.RUNNER_TEMP, { bigint: true });
  requireAction(parent.isDirectory() && parent.uid === BigInt(process.getuid()));
  const root = join(env.RUNNER_TEMP, "settleora-arm64-ridge-private-" +
    identity.runId + "-" + identity.runAttempt);
  if (create) await fs.mkdir(root, { mode: 0o700 });
  await checkRoot(root);
  return root;
}
function requirePrivateName(name, maximum) {
  requireAction(typeof name === "string" && /^[a-z0-9][a-z0-9.-]{0,63}$/.test(name) &&
    Number.isSafeInteger(maximum) && maximum > 0 && maximum <= 512 * 1024);
}
async function exclusiveFile(root, name, bytes, maximum) {
  requirePrivateName(name, maximum);
  requireAction(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maximum);
  const admittedBytes = Buffer.from(bytes);
  await checkRoot(root);
  const file = await fs.open(join(root, name),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600);
  try {
    const before = await file.stat({ bigint: true });
    requireAction(before.isFile() && owned(before, 0o600) &&
      before.nlink === 1n && before.size === 0n);
    await file.writeFile(admittedBytes);
    await file.sync();
    const after = await file.stat({ bigint: true });
    requireAction(after.isFile() && owned(after, 0o600) && after.nlink === 1n &&
      after.ino === before.ino && after.dev === before.dev &&
      after.size === BigInt(admittedBytes.length));
  } finally { await file.close(); }
}
async function readPrivate(root, name, maximum) {
  requirePrivateName(name, maximum);
  await checkRoot(root);
  const file = await fs.open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    requireAction(before.isFile() && owned(before, 0o600) && before.nlink === 1n &&
      before.size > 0n && before.size <= BigInt(maximum));
    const buffer = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count <= maximum) {
      const { bytesRead } = await file.read(buffer, count, maximum + 1 - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    const after = await file.stat({ bigint: true });
    requireAction(count <= maximum && BigInt(count) === before.size &&
      after.ino === before.ino && after.dev === before.dev &&
      after.size === before.size && after.mtimeNs === before.mtimeNs &&
      after.nlink === 1n && owned(after, 0o600));
    return Buffer.from(buffer.subarray(0, count));
  } finally { await file.close(); }
}
async function readJson(root, name, maximum) {
  const bytes = await readPrivate(root, name, maximum);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
function jsonBytes(value) { return Buffer.from(JSON.stringify(value), "utf8"); }

async function verifiedBundle(root, identity, env) {
  // Verify ZIP inventory, each bounded member's closed JSON schema and source
  // binding with the exact checked-in controller. Child output stays private.
  const script = fileURLToPath(new URL("../ios-paddle-arm64-runtime-bundle.py", import.meta.url));
  const { stdout } = await execFileAsync("python3", ["-I", script, "verify-sealed",
    "--private-root", root, "--source-head", identity.head,
    "--source-tree", identity.tree, "--source-fingerprint", identity.fingerprint,
    "--run-id", identity.runId, "--run-attempt", identity.runAttempt], {
    timeout: 30_000, maxBuffer: 4096, encoding: "utf8", windowsHide: true, env,
  });
  requireAction(Buffer.byteLength(stdout) <= 4096);
  return JSON.parse(stdout);
}

export async function runDiagnosticArtifactAction({
  env = process.env, fetchImpl = fetch, now = Date.now,
  verifyBundle = verifiedBundle,
} = {}) {
  try {
    requireAction(env.INPUT_PHASE === "prepare" || env.INPUT_PHASE === "finalize");
    const backend = diagnosticArtifactBackend({ env, fetchImpl, now });
    const identity = backend.identity;
    const prepare = env.INPUT_PHASE === "prepare";
    const root = await privateRoot(env, identity, prepare);
    await exclusiveFile(root, prepare ? "prepare-attempt.json" : "finalize-attempt.json",
      jsonBytes({ schemaVersion: 1, purpose, identity, attemptedAt: now() }), 4096);
    if (prepare) {
      const slot = await prepareDiagnosticArtifact({ backend, identity, now });
      await exclusiveFile(root, "slot.json", jsonBytes(slot),
        diagnosticArtifactLimits.descriptorBytes);
      return Object.freeze({ stage: "prepared", sourceHead: identity.head,
        requestedExpiresAt: slot.expiresAt, expiryVerified: false });
    }
    const slot = validateDiagnosticArtifactSlot(await readJson(root, "slot.json",
      diagnosticArtifactLimits.descriptorBytes), identity);
    const captureStart = await readJson(root, "capture-start.json", 4096);
    const verifierEnv = { ...env };
    for (const key of ["ACTIONS_RUNTIME_TOKEN", "ACTIONS_RUNTIME_URL", "ACTIONS_RESULTS_URL",
      "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL"]) delete verifierEnv[key];
    const verified = await verifyBundle(root, identity, verifierEnv);
    exact(verified, ["schemaVersion", "purpose", "sourceHead", "sourceTree",
      "sourceFingerprint", "runId", "runAttempt", "size", "sha256"]);
    requireAction(verified.schemaVersion === 1 && verified.purpose === purpose &&
      verified.sourceHead === identity.head && verified.sourceTree === identity.tree &&
      verified.sourceFingerprint === identity.fingerprint &&
      verified.runId === identity.runId && verified.runAttempt === identity.runAttempt &&
      Number.isSafeInteger(verified.size) && verified.size >= 22 &&
      verified.size <= diagnosticArtifactLimits.bytes &&
      typeof verified.sha256 === "string" && /^[0-9a-f]{64}$/.test(verified.sha256));
    const bytes = await readPrivate(root, "bundle.zip", diagnosticArtifactLimits.bytes);
    requireAction(bytes.length === verified.size &&
      createHash("sha256").update(bytes).digest("hex") === verified.sha256);
    const receipt = await finalizeDiagnosticArtifact({
      backend, slot, expectedIdentity: identity, captureStart, zipBytes: bytes, now,
    });
    await exclusiveFile(root, "artifact-receipt.json", jsonBytes(receipt), 4096);
    return Object.freeze({ stage: "finalized", ...receipt });
  } catch {
    throw new Error("ios_diagnostic_artifact_action_failed");
  }
}

export {
  checkRoot as checkDiagnosticPrivateRoot,
  readPrivate as readDiagnosticPrivateFile,
  exclusiveFile as writeDiagnosticPrivateFile,
};

// Keep the observable receipt identical to the closed verifier input.
export function diagnosticArtifactReceiptLine(result) {
  requireAction(result?.stage === "finalized");
  const { stage, ...receipt } = result;
  return "SETTLEORA_ARM64_RUNTIME_ARTIFACT_RECEIPT=" + JSON.stringify(receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runDiagnosticArtifactAction();
    // Only bounded metadata from the public result, no descriptor or URL.
    console.info("ios_diagnostic_artifact_" + result.stage);
    if (result.stage === "finalized") {
      console.info(diagnosticArtifactReceiptLine(result));
    }
  } catch {
    console.error("ios_diagnostic_artifact_action_failed");
    process.exitCode = 1;
  }
}
