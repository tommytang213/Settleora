import { existsSync } from "node:fs";
import { resolve } from "node:path";

const requiredPaths = [
  "PROGRAM_ARCHITECTURE.md",
  "README.md",
  "docs/architecture/README.md",
  "apps/mobile",
  "apps/web-user/README.md",
  "apps/web-admin/README.md",
  "services/api/README.md",
  "services/api/Dockerfile",
  "services/worker-ocr/README.md",
  "packages/contracts/openapi/settleora.v1.yaml",
  "packages/client-web/README.md",
  "packages/client-web/src/generated/.gitkeep",
  "packages/client-dart/README.md",
  "packages/client-dart/generated/.gitkeep",
  "infra/README.md",
  "infra/env/.env.example",
  "infra/docker-compose.yml"
];

const missing = requiredPaths.filter((path) => !existsSync(resolve(path)));

if (missing.length > 0) {
  console.error("Missing required scaffold paths:");
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log(`Scaffold validation passed (${requiredPaths.length} paths).`);
