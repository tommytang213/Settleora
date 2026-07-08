import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateClients } from "../generate-clients.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dartOutputPath = path.join(repoRoot, "packages/client-dart/lib/generated");

test("generate-clients rejects repo-root web output", async () => {
  await assert.rejects(
    () => generateClients({
      webOutputPath: repoRoot,
      dartOutputPath
    }),
    /Refusing web generated-client output path/
  );
});

test("generate-clients rejects unapproved temp output", async () => {
  await assert.rejects(
    () => generateClients({
      webOutputPath: path.join(tmpdir(), "client-web"),
      dartOutputPath
    }),
    /Refusing web generated-client output path/
  );
});
