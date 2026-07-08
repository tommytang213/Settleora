import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("generate-clients rejects repo-root web output", () => {
  const result = runGenerateClients({
    SETTLEORA_CLIENT_WEB_OUTPUT_PATH: ".",
    SETTLEORA_CLIENT_DART_OUTPUT_PATH: "packages/client-dart/lib/generated"
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Refusing web generated-client output path/);
});

test("generate-clients rejects unapproved temp output", () => {
  const result = runGenerateClients({
    SETTLEORA_CLIENT_WEB_OUTPUT_PATH: path.join(tmpdir(), "client-web"),
    SETTLEORA_CLIENT_DART_OUTPUT_PATH: "packages/client-dart/lib/generated"
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Refusing web generated-client output path/);
});

function runGenerateClients(extraEnv) {
  return spawnSync(process.execPath, ["tools/generate-clients.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...extraEnv
    },
    encoding: "utf8"
  });
}
