// Synthetic encryption contracts only. No live key, service, receipt or provider.
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import { recipientPublicKey,sealRuntimeBytes,openRuntimeBytes,runtimeSealLimits } from "../ios-paddle-arm64-runtime-seal.mjs";
const pair=generateKeyPairSync("x25519");
const pub=Buffer.from(pair.publicKey.export({format:"der",type:"spki"})).toString("base64");
const priv=Buffer.from(pair.privateKey.export({format:"der",type:"pkcs8"}));
const context={head:"1".repeat(40),tree:"2".repeat(40),fingerprint:"3".repeat(64),
 runId:"123456",runAttempt:"1",name:"settleora-arm64-ridge-private-123456-00000000-0000-0000-0000-000000000002"};
const plain=Buffer.from("PK\u0003\u0004synthetic native-channel archive, never a real OCR result");
test("recipient-only roundtrip preserves admitted bytes and hides their text",()=>{
 const sealed=sealRuntimeBytes(plain,pub,context);
 assert.deepEqual(openRuntimeBytes(sealed.header,sealed.ciphertext,priv,context),plain);
 assert.equal(sealed.ciphertext.includes(Buffer.from("synthetic native-channel")),false);
 assert.equal(recipientPublicKey(pub).bytes.length,44);
});
test("fresh ephemeral key salt and nonce yield distinct ciphertext for the same input",()=>{
 const a=sealRuntimeBytes(plain,pub,context),b=sealRuntimeBytes(plain,pub,context);
 assert.notDeepEqual(a.header,b.header);assert.notDeepEqual(a.ciphertext,b.ciphertext);
});
test("wrong local recipient key never returns plaintext",()=>{
 const wrong=generateKeyPairSync("x25519").privateKey.export({format:"der",type:"pkcs8"});
 const sealed=sealRuntimeBytes(plain,pub,context);
 assert.throws(()=>openRuntimeBytes(sealed.header,sealed.ciphertext,Buffer.from(wrong),context),
   /^Error: arm64_runtime_open_rejected$/);
});
test("source run and attempt are authenticated and cannot be substituted",()=>{
 const sealed=sealRuntimeBytes(plain,pub,context);
 for(const changed of [{...context,head:"4".repeat(40)},{...context,runId:"654321"},
   {...context,runAttempt:"2"}]){
  assert.throws(()=>openRuntimeBytes(sealed.header,sealed.ciphertext,priv,changed),
    /^Error: arm64_runtime_open_rejected$/);
 }
});
test("ciphertext tag and header changes fail without returning partial plaintext",()=>{
 const sealed=sealRuntimeBytes(plain,pub,context);
 const altered=Buffer.from(sealed.ciphertext);altered[0]^=1;
 assert.throws(()=>openRuntimeBytes(sealed.header,altered,priv,context),/arm64_runtime_open_rejected/);
 const header=JSON.parse(sealed.header);header.plaintextBytes++;
 assert.throws(()=>openRuntimeBytes(Buffer.from(JSON.stringify(header)),sealed.ciphertext,priv,context),
   /arm64_runtime_open_rejected/);
});
test("private or noncanonical public-key input and oversized plaintext are rejected",()=>{
 assert.throws(()=>recipientPublicKey(priv.toString("base64")),/arm64_runtime_recipient_rejected/);
 assert.throws(()=>recipientPublicKey(pub+" "),/arm64_runtime_recipient_rejected/);
 assert.throws(()=>sealRuntimeBytes(Buffer.alloc(256*1024+1),pub,context),/arm64_runtime_seal_rejected/);
});

test("largest admitted plaintext roundtrips and fits the actual encrypted ZIP transport",()=>{
 const plaintext=Buffer.alloc(runtimeSealLimits.plaintextBytes,0x7f);
 const sealed=sealRuntimeBytes(plaintext,pub,context);
 assert.equal(sealed.ciphertext.length,runtimeSealLimits.ciphertextBytes);
 assert.deepEqual(openRuntimeBytes(sealed.header,sealed.ciphertext,priv,context),plaintext);
 const script="import sys,json,base64,importlib.util; s=importlib.util.spec_from_file_location('codec',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); v=json.load(sys.stdin); raw=m.sealed_zip(base64.b64decode(v['h']),base64.b64decode(v['c'])); m.read_sealed_zip(raw); print(len(raw))";
 const length=Number(execFileSync("python3",["-I","-B","-c",script,
   fileURLToPath(new URL("../ios-paddle-arm64-runtime-bundle.py",import.meta.url))],{
   input:JSON.stringify({h:sealed.header.toString("base64"),c:sealed.ciphertext.toString("base64")}),
   timeout:10000,maxBuffer:4096,encoding:"utf8"}).trim());
 assert.ok(length<=runtimeSealLimits.transportBytes);
 assert.throws(()=>sealRuntimeBytes(Buffer.alloc(runtimeSealLimits.plaintextBytes+1),pub,context),
   /arm64_runtime_seal_rejected/);
});
