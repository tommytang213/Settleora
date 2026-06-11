#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);

function readOption(name, defaultValue) {
  const index = args.indexOf(name);
  if (index === -1) {
    return defaultValue;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

const baseRef = readOption("--base", "origin/ai/integration");
const headRef = readOption("--head", "HEAD");
const milestoneFile = readOption("--milestone-file", ".ai/current-milestone.md");
const allowBootstrapWorkflow = args.includes("--allow-bootstrap-workflow");

const changedFiles = execFileSync(
  "git",
  ["diff", "--name-only", `${baseRef}...${headRef}`],
  { encoding: "utf8" },
)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .sort();

let milestoneText = "";
try {
  milestoneText = readFileSync(milestoneFile, "utf8");
} catch {
  milestoneText = "";
}

const activeMilestone = /ID:\s*`?M1`?/i.test(milestoneText) ? "M1" : "unknown";

const bootstrapAllowedPaths = new Set([
  ".github/workflows/ai-integration-scope-guard.yml",
  "scripts/ai/README.md",
  "scripts/ai/v3-scope-guard.mjs",
]);

const m1AllowedPatterns = [
  /^\.ai(?:\/|$)/,
  /^AGENTS\.md$/,
  /^docs\//,
  /^apps\/mobile\/lib\/bills\//,
  /^apps\/mobile\/test\//,
];

const forbiddenPatterns = [
  { pattern: /^services\/api(?:\/|$)/, reason: "API/backend runtime path" },
  { pattern: /^services\/worker-ocr(?:\/|$)/, reason: "OCR worker runtime path" },
  { pattern: /^packages\/contracts(?:\/|$)/, reason: "OpenAPI/contracts path" },
  { pattern: /^packages\/client-web(?:\/|$)/, reason: "generated web client path" },
  { pattern: /^packages\/client-dart(?:\/|$)/, reason: "generated Dart client path" },
  { pattern: /^infra(?:\/|$)/, reason: "infrastructure path" },
  { pattern: /^\.github(?:\/|$)/, reason: "GitHub workflow/settings path" },
  { pattern: /(^|\/)Dockerfile$/i, reason: "Dockerfile" },
  { pattern: /(^|\/)docker-compose[^/]*\.ya?ml$/i, reason: "Docker Compose file" },
  { pattern: /(^|\/)\.env(?:\.|$)/i, reason: "environment file" },
  { pattern: /(^|\/)[^/]*\.env(?:\.[^/]*)?$/i, reason: "environment-looking file" },
  { pattern: /(^|\/)migrations?(\/|$)/i, reason: "migration-looking path" },
  { pattern: /(^|\/)[^/]*migration[^/]*\.(cs|sql|ts|js|mjs|json|ya?ml)$/i, reason: "migration-looking file" },
];

function isAllowedForM1(file) {
  return m1AllowedPatterns.some((pattern) => pattern.test(file));
}

function forbiddenReason(file) {
  if (allowBootstrapWorkflow && bootstrapAllowedPaths.has(file)) {
    return null;
  }

  const match = forbiddenPatterns.find(({ pattern }) => pattern.test(file));
  return match ? match.reason : null;
}

const classifications = changedFiles.map((file) => {
  const forbidden = forbiddenReason(file);
  const bootstrapAllowed = allowBootstrapWorkflow && bootstrapAllowedPaths.has(file);
  const allowed = (activeMilestone === "M1" && isAllowedForM1(file)) || bootstrapAllowed;

  if (forbidden) {
    return { file, classification: "forbidden", reason: forbidden };
  }

  if (allowed) {
    const reason = bootstrapAllowed ? "explicit bootstrap allowance" : `${activeMilestone} allowed path`;
    return { file, classification: "allowed", reason };
  }

  return { file, classification: "review", reason: "not in milestone allowed paths" };
});

console.log(`AI V3 scope guard`);
console.log(`base: ${baseRef}`);
console.log(`head: ${headRef}`);
console.log(`milestone: ${activeMilestone}`);
console.log(`changed files: ${changedFiles.length}`);

for (const item of classifications) {
  console.log(`${item.classification.padEnd(9)} ${item.file} (${item.reason})`);
}

const forbidden = classifications.filter((item) => item.classification === "forbidden");
const review = classifications.filter((item) => item.classification === "review");

if (forbidden.length > 0) {
  console.error("");
  console.error("Forbidden changes detected:");
  for (const item of forbidden) {
    console.error(`- ${item.file}: ${item.reason}`);
  }
  process.exit(1);
}

if (review.length > 0) {
  console.error("");
  console.error("Changes outside the active milestone allowed paths require human review:");
  for (const item of review) {
    console.error(`- ${item.file}: ${item.reason}`);
  }
  process.exit(1);
}

console.log("Scope guard passed.");
