// Per-run confidentiality for captured OCR in a public repository.
// No private key is passed to GitHub. Built-in Node crypto only.
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey,
  diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { promises as fs, constants } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const sealAlgorithm = "X25519-HKDF-SHA256-AES-256-GCM";
const purpose = "arm64_ridge_runtime_v1";
export const runtimeSealLimits = Object.freeze({
  transportBytes:256*1024, headerBytes:4096,
  plaintextBytes:256*1024-8192, ciphertextBytes:256*1024-8192+16,
});
const maximum = runtimeSealLimits.transportBytes;
function check(value) { if (!value) throw new Error("arm64_runtime_seal_rejected"); }
function exact(value, fields) {
  check(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value,key)));
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function base64(value, size) {
  check(typeof value === "string" && value.length <= 256 && /^[A-Za-z0-9+/]+={0,2}$/.test(value));
  const result = Buffer.from(value,"base64");
  check(result.length === size && result.toString("base64") === value);
  return result;
}
export function recipientPublicKey(value) {
  try {
    const bytes = base64(value,44);
    const key = createPublicKey({key:bytes,format:"der",type:"spki"});
    check(key.asymmetricKeyType === "x25519" &&
      Buffer.from(key.export({format:"der",type:"spki"})).equals(bytes));
    return {key,bytes,fingerprint:sha(bytes)};
  } catch { throw new Error("arm64_runtime_recipient_rejected"); }
}
function checkedContext(value) {
  exact(value,["head","tree","fingerprint","runId","runAttempt","name"]);
  check(Object.values(value).every(item => typeof item === "string") &&
    /^[0-9a-f]{40}$/.test(value.head) && /^[0-9a-f]{40}$/.test(value.tree) &&
    /^[0-9a-f]{64}$/.test(value.fingerprint) && /^[1-9][0-9]{0,23}$/.test(value.runId) &&
    value.runAttempt === "1");
  const prefix = "settleora-arm64-ridge-private-" + value.runId + "-";
  check(value.name.startsWith(prefix) &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.name.slice(prefix.length)));
  return Object.freeze({...value});
}
function encryptionKey(shared, salt, recipient, ephemeral, header) {
  const info = Buffer.concat([Buffer.from("Settleora ARM64 runtime seal v1\0"),
    recipient,ephemeral,Buffer.from(sha(header),"hex")]);
  return Buffer.from(hkdfSync("sha256",shared,salt,info,32));
}
export function sealRuntimeBytes(plaintext, recipientValue, expectedContext) {
  try {
    check(Buffer.isBuffer(plaintext) && plaintext.length >= 22 && plaintext.length <= runtimeSealLimits.plaintextBytes);
    const bytes = Buffer.from(plaintext), context = checkedContext(expectedContext);
    const recipient = recipientPublicKey(recipientValue);
    const ephemeral = generateKeyPairSync("x25519");
    const ephemeralPublic = Buffer.from(ephemeral.publicKey.export({format:"der",type:"spki"}));
    const salt = randomBytes(32), nonce = randomBytes(12);
    const envelope = {schemaVersion:1,purpose,algorithm:sealAlgorithm,context,
      recipientKeySha256:recipient.fingerprint,ephemeralPublicKey:ephemeralPublic.toString("base64"),
      salt:salt.toString("base64"),nonce:nonce.toString("base64"),
      plaintextBytes:bytes.length,ciphertextBytes:bytes.length+16};
    const header = Buffer.from(canonical(envelope));
    check(header.length <= 4096);
    const shared = diffieHellman({privateKey:ephemeral.privateKey,publicKey:recipient.key});
    const key = encryptionKey(shared,salt,recipient.bytes,ephemeralPublic,header);
    try {
      const cipher = createCipheriv("aes-256-gcm",key,nonce,{authTagLength:16});
      cipher.setAAD(header);
      const ciphertext = Buffer.concat([cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
      check(ciphertext.length === envelope.ciphertextBytes);
      return {header:Buffer.from(header),ciphertext};
    } finally { shared.fill(0);key.fill(0);bytes.fill(0); }
  } catch { throw new Error("arm64_runtime_seal_rejected"); }
}
export function openRuntimeBytes(headerValue, ciphertextValue, privateKeyBytes, expectedContext) {
  try {
    check(Buffer.isBuffer(headerValue) && headerValue.length <= 4096 &&
      Buffer.isBuffer(ciphertextValue) && ciphertextValue.length > 16 &&
      ciphertextValue.length <= runtimeSealLimits.ciphertextBytes && Buffer.isBuffer(privateKeyBytes) &&
      privateKeyBytes.length === 48);
    const header=Buffer.from(headerValue),ciphertext=Buffer.from(ciphertextValue);
    const value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(header));
    exact(value,["schemaVersion","purpose","algorithm","context","recipientKeySha256",
      "ephemeralPublicKey","salt","nonce","plaintextBytes","ciphertextBytes"]);
    check(canonical(value) === header.toString("utf8") && value.schemaVersion === 1 &&
      value.purpose === purpose && value.algorithm === sealAlgorithm &&
      canonical(checkedContext(value.context)) === canonical(checkedContext(expectedContext)) &&
      Number.isSafeInteger(value.plaintextBytes) && value.plaintextBytes >= 22 && value.plaintextBytes <= runtimeSealLimits.plaintextBytes &&
      value.ciphertextBytes === ciphertext.length && value.ciphertextBytes === value.plaintextBytes+16);
    const privateKey=createPrivateKey({key:privateKeyBytes,format:"der",type:"pkcs8"});
    check(privateKey.asymmetricKeyType === "x25519");
    const recipientBytes=Buffer.from(createPublicKey(privateKey).export({format:"der",type:"spki"}));
    check(sha(recipientBytes) === value.recipientKeySha256);
    const ephemeralBytes=base64(value.ephemeralPublicKey,44);
    const ephemeral=recipientPublicKey(value.ephemeralPublicKey).key;
    const salt=base64(value.salt,32),nonce=base64(value.nonce,12);
    const shared=diffieHellman({privateKey,publicKey:ephemeral});
    const key=encryptionKey(shared,salt,recipientBytes,ephemeralBytes,header);
    try {
      const decipher=createDecipheriv("aes-256-gcm",key,nonce,{authTagLength:16});
      decipher.setAAD(header);decipher.setAuthTag(ciphertext.subarray(ciphertext.length-16));
      const plaintext=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);
      check(plaintext.length === value.plaintextBytes);
      return plaintext;
    } finally {shared.fill(0);key.fill(0);}
  } catch { throw new Error("arm64_runtime_open_rejected"); }
}
async function runSealPhase() {
  const env=process.env;
  check(env.GITHUB_ACTIONS==="true" && env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
    env.GITHUB_REPOSITORY==="tommytang213/Settleora" && env.GITHUB_JOB==="ios-paddle-arm64-runtime" &&
    env.GITHUB_RUN_ATTEMPT==="1" && env.SETTLEORA_ARM64_MODE===purpose &&
    env.EXPECTED_HEAD===env.GITHUB_SHA && env.GITHUB_SHA===env.DIAGNOSTIC_SOURCE_HEAD);
  const {readDiagnosticPrivateFile:read,writeDiagnosticPrivateFile:write} =
    await import("./arm64-runtime-artifact-action/index.mjs");
  const root=join(env.RUNNER_TEMP,"settleora-arm64-ridge-private-"+env.GITHUB_RUN_ID+"-1");
  const slot=JSON.parse((await read(root,"slot.json",16*1024)).toString("utf8"));
  const context=checkedContext({head:slot.identity.head,tree:slot.identity.tree,
    fingerprint:slot.identity.fingerprint,runId:slot.identity.runId,runAttempt:"1",name:slot.name});
  check(context.head===env.EXPECTED_HEAD && context.tree===env.DIAGNOSTIC_SOURCE_TREE &&
    context.fingerprint===env.DIAGNOSTIC_SOURCE_FINGERPRINT && context.runId===env.GITHUB_RUN_ID);
  const recipient=recipientPublicKey(env.ARM64_RUNTIME_RECIPIENT_KEY);
  const phase=process.argv[2];
  if (phase==="bind") {
    await write(root,"recipient.json",Buffer.from(canonical({
      schemaVersion:1,purpose,context,publicKey:recipient.bytes.toString("base64"),
      fingerprint:recipient.fingerprint})),4096);
    console.info("arm64_runtime_recipient_bound");return;
  }
  check(phase==="seal");
  const binding=JSON.parse((await read(root,"recipient.json",4096)).toString("utf8"));
  check(binding.fingerprint===recipient.fingerprint && canonical(binding.context)===canonical(context));
  await write(root,"seal-attempt.json",Buffer.from(canonical({schemaVersion:1,purpose,context})),4096);
  const childEnv={...env};
  for (const name of ["ACTIONS_RUNTIME_TOKEN","ACTIONS_RUNTIME_URL","ACTIONS_RESULTS_URL",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN","ACTIONS_ID_TOKEN_REQUEST_URL"]) delete childEnv[name];
  const script=join(dirname(fileURLToPath(import.meta.url)),"ios-paddle-arm64-runtime-bundle.py");
  const common=["--private-root",root,"--source-head",context.head,"--source-tree",context.tree,
    "--source-fingerprint",context.fingerprint,"--run-id",context.runId,"--run-attempt","1"];
  const verified=JSON.parse(execFileSync("python3",["-I","-B",script,"verify",...common],{
    env:childEnv,timeout:45000,maxBuffer:4096,stdio:["ignore","pipe","pipe"]}).toString("utf8"));
  const raw=await read(root,"bundle.zip",runtimeSealLimits.plaintextBytes);
  check(verified.sourceHead===context.head && verified.sourceTree===context.tree &&
    verified.sourceFingerprint===context.fingerprint && verified.runId===context.runId &&
    verified.runAttempt==="1" && verified.size===raw.length && verified.sha256===sha(raw));
  const sealed=sealRuntimeBytes(raw,env.ARM64_RUNTIME_RECIPIENT_KEY,context);
  await write(root,"sealed-receipt.json",Buffer.from(canonical({
    schemaVersion:1,purpose,context,recipientKeySha256:recipient.fingerprint,
    plaintextSha256:sha(raw),plaintextBytes:raw.length,
    ciphertextSha256:sha(sealed.ciphertext),ciphertextBytes:sealed.ciphertext.length,
    headerSha256:sha(sealed.header)})),4096);
  await write(root,"envelope.json",sealed.header,4096);
  await write(root,"ciphertext.bin",sealed.ciphertext,runtimeSealLimits.ciphertextBytes);
  execFileSync("python3",["-I","-B",script,"seal-container",...common],{
    env:childEnv,timeout:45000,maxBuffer:4096,stdio:["ignore","pipe","pipe"]});
  // Preserve the original raw bundle; replace its transport path without replacement.
  await fs.link(join(root,"bundle.zip"),join(root,"bundle-plain.zip"));
  await fs.unlink(join(root,"bundle.zip"));
  await fs.link(join(root,"bundle-sealed.zip"),join(root,"bundle.zip"));
  await fs.unlink(join(root,"bundle-sealed.zip"));
  console.info("arm64_runtime_capture_sealed");
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runSealPhase().catch(() => {console.error("arm64_runtime_seal_failed");process.exitCode=98;});
}
