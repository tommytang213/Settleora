import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { acquirePack } from "../mobile-model-acquisition.mjs";
import { catalogRelativePath, loadCatalog } from "../mobile-model-catalog.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const trustedPack = loadCatalog(repoRoot).catalog.packs[0];

function fixturePack() {
  return structuredClone(trustedPack);
}

function fixtureContent(pack, file) {
  return readFileSync(path.join(repoRoot, "apps/mobile", pack.assetDirectory, file.name));
}

function testRoot(t, prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, catalogRelativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(repoRoot, catalogRelativePath), destination);
  return root;
}

test("acquisition activates a complete verified pack in one directory rename", async (t) => {
  const root = testRoot(t, "settleora-ocr-acquire-");
  const pack = fixturePack();
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "follow");
    assert.equal(options.signal instanceof AbortSignal, true);
    const file = pack.files.find((entry) => url.endsWith(entry.name));
    return new Response(fixtureContent(pack, file), { status: 200 });
  };

  assert.equal(await acquirePack(root, pack, fetchImpl), "installed");
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  assert.deepEqual(readdirSync(directory).sort(), ["inference.onnx", "inference.yml"]);
  assert.deepEqual(
    readFileSync(path.join(directory, "inference.onnx")),
    fixtureContent(pack, pack.files[0]),
  );
  assert.equal(await acquirePack(root, pack, async () => { throw new Error("must not fetch"); }), "already_verified");
});

test("acquisition rejects every unreviewed identity and path field before I/O", async (t) => {
  const cases = [
    ["unknown version", (pack) => { pack.modelVersion = "f".repeat(40); }],
    ["unknown source", (pack) => { pack.sourceRepository = "PaddlePaddle/unreviewed"; }],
    ["unknown runtime format", (pack) => { pack.runtimeFormat = "paddle"; }],
    ["traversal destination", (pack) => { pack.assetDirectory = "../../outside"; }],
    ["changed byte identity", (pack) => {
      pack.files[0].bytes = 1;
      pack.files[0].sha256 = "0".repeat(64);
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async (t) => {
      const root = testRoot(t, "settleora-ocr-acquire-identity-");
      const pack = fixturePack();
      mutate(pack);
      let fetched = false;

      await assert.rejects(
        () => acquirePack(root, pack, async () => {
          fetched = true;
          throw new Error("must not fetch");
        }),
        /does not match the reviewed trusted catalog/,
      );
      assert.equal(fetched, false);
      assert.deepEqual(readdirSync(path.join(root, "apps/mobile/assets/receipt_ocr_models")), ["catalog.json"]);
      assert.equal(existsSync(path.join(root, "outside")), false);
    });
  }
});

test("acquisition failure exposes no partial or mixed pack", async (t) => {
  const root = testRoot(t, "settleora-ocr-acquire-fail-");
  const pack = fixturePack();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? new Response(fixtureContent(pack, pack.files[0]), { status: 200 })
      : new Response("unavailable", { status: 503 });
  };

  await assert.rejects(() => acquirePack(root, pack, fetchImpl), /Unable to download/);
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  const parent = path.dirname(directory);
  assert.equal(existsSync(directory), false);
  assert.deepEqual(readdirSync(parent), ["catalog.json"]);
});

test("acquisition aborts an oversized response and removes staging", async (t) => {
  const root = testRoot(t, "settleora-ocr-acquire-large-");
  const pack = fixturePack();
  const oversized = Buffer.alloc(pack.files[0].bytes + 1, 0x61);

  await assert.rejects(
    () => acquirePack(root, pack, async () => new Response(oversized, { status: 200 })),
    /exceeded expected byte count/,
  );
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  assert.equal(existsSync(directory), false);
  assert.deepEqual(readdirSync(path.dirname(directory)), ["catalog.json"]);
});

test("acquisition propagates stream failure and removes staging", async (t) => {
  const root = testRoot(t, "settleora-ocr-acquire-stream-");
  const pack = fixturePack();
  const failedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(fixtureContent(pack, pack.files[0]).subarray(0, 2));
      controller.error(new Error("stream failed"));
    },
  });

  await assert.rejects(
    () => acquirePack(root, pack, async () => new Response(failedBody, { status: 200 })),
    /stream failed/,
  );
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  assert.equal(existsSync(directory), false);
  assert.deepEqual(readdirSync(path.dirname(directory)), ["catalog.json"]);
});

test("acquisition refuses to mix with an invalid existing pack", async (t) => {
  const root = testRoot(t, "settleora-ocr-acquire-existing-");
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

test("acquisition refuses an existing pack with unreviewed files", async (t) => {
  const root = testRoot(t, "settleora-ocr-acquire-extra-");
  const pack = fixturePack();
  const directory = path.join(root, "apps/mobile", pack.assetDirectory);
  mkdirSync(directory, { recursive: true });
  for (const file of pack.files) {
    writeFileSync(path.join(directory, file.name), fixtureContent(pack, file));
  }
  writeFileSync(path.join(directory, "unreviewed.bin"), "unreviewed");

  await assert.rejects(
    () => acquirePack(root, pack, async () => { throw new Error("must not fetch"); }),
    /refusing mixed replacement/,
  );
});
