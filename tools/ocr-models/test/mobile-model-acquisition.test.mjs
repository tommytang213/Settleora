import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { acquirePack } from "../mobile-model-acquisition.mjs";

const bytes = (value) => Buffer.from(value, "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixturePack() {
  const model = bytes("model-bytes");
  const config = bytes("config-bytes");
  return {
    modelPackId: "paddleocr.test.pack",
    modelVersion: "a".repeat(40),
    sourceRepository: "PaddlePaddle/test",
    assetDirectory: "assets/receipt_ocr_models/test-pack",
    files: [
      { name: "inference.onnx", bytes: model.length, sha256: sha256(model), content: model },
      { name: "inference.yml", bytes: config.length, sha256: sha256(config), content: config },
    ],
  };
}

test("acquisition activates a complete verified pack in one directory rename", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-ocr-acquire-"));
  const pack = fixturePack();
  const fetchImpl = async (url) => {
    const file = pack.files.find((entry) => url.endsWith(entry.name));
    return new Response(file.content, { status: 200 });
  };

  assert.equal(await acquirePack(root, pack, fetchImpl), "installed");
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  assert.deepEqual(readdirSync(directory).sort(), ["inference.onnx", "inference.yml"]);
  assert.equal(readFileSync(path.join(directory, "inference.onnx"), "utf8"), "model-bytes");
  assert.equal(await acquirePack(root, pack, async () => { throw new Error("must not fetch"); }), "already_verified");
});

test("acquisition failure exposes no partial or mixed pack", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-ocr-acquire-fail-"));
  const pack = fixturePack();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? new Response(pack.files[0].content, { status: 200 })
      : new Response("unavailable", { status: 503 });
  };

  await assert.rejects(() => acquirePack(root, pack, fetchImpl), /Unable to download/);
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  const parent = path.dirname(directory);
  assert.equal(existsSync(directory), false);
  assert.deepEqual(readdirSync(parent), []);
});

test("acquisition refuses to mix with an invalid existing pack", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-ocr-acquire-existing-"));
  const pack = fixturePack();
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  const modelPath = path.join(directory, "inference.onnx");
  mkdirSync(directory, { recursive: true });
  writeFileSync(modelPath, "wrong");

  await assert.rejects(
    () => acquirePack(root, pack, async () => { throw new Error("must not fetch"); }),
    /refusing mixed replacement/,
  );
  assert.equal(readFileSync(modelPath, "utf8"), "wrong");
});
