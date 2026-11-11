import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { trustedLegalArtifacts } from "../mobile-model-catalog.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function fixtureGitEnvironment() {
  // Capture a private fixture environment before init; later adversarial
  // caller overrides must never redirect fixture writes to another repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull,
    GIT_AUTHOR_NAME: "Settleora Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Settleora Test", GIT_COMMITTER_EMAIL: "test@example.invalid" });
  return env;
}

export function withPackageContract(callback) {
  const env = fixtureGitEnvironment();
  // Git reports physical roots; macOS temporary directories can use aliases.
  // Canonicalize the owned directory before any fixture Git initialization.
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "settleora-mobile-package-")));
  const model = Buffer.from("model-bytes");
  try {
    mkdirSync(path.join(root, "apps/mobile/assets/receipt_ocr_models"), { recursive: true });
    mkdirSync(path.join(root, "apps/mobile/test/fixtures/receipt_ocr"), { recursive: true });
    const catalog = Buffer.from(JSON.stringify({
        packs: [{
          assetDirectory: "assets/receipt_ocr_models/test-pack",
          files: [{ name: "model.onnx", bytes: model.length, sha256: sha256(model) }],
        }],
      }));
    writeFileSync(path.join(root, "apps/mobile/assets/receipt_ocr_models/catalog.json"), catalog);
    for (const artifact of trustedLegalArtifacts) {
      const bytes = readFileSync(path.join(repoRootForCli(), "apps/mobile", artifact.path));
      writeFileSync(path.join(root, "apps/mobile", artifact.path), bytes);
    }
    writeFileSync(
      path.join(root, "apps/mobile/test/fixtures/receipt_ocr/manifest.json"),
      JSON.stringify({ fixtures: Array.from({ length: 101 }, (_, index) => ({ file: `script/fixture-${index}.png` })) }),
    );
    mkdirSync(path.join(root, "apps/mobile/lib"), { recursive: true });
    writeFileSync(path.join(root, "apps/mobile/lib/source.dart"), "reviewed source");
    mkdirSync(path.join(root, "tools/ocr-models"), { recursive: true });
    writeFileSync(path.join(root, "tools/ocr-models/android-production-entry-inventory.mjs"), "reviewed inventory");
    const git = (...args) => {
      const result = spawnSync("git", ["-C", root, ...args], {
        encoding: "utf8", env,
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git("init", "-q");
    git("add", "apps/mobile", "tools/ocr-models/android-production-entry-inventory.mjs");
    git("commit", "-qm", "reviewed source");
    callback({ root, model, catalog, git, sourceSha: git("rev-parse", "HEAD") });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function repoRootForCli() {
  return path.resolve(import.meta.dirname, "../../..");
}
