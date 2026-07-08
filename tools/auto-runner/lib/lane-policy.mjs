const contractHeadingPattern = /^##\s+Auto-runner contract\s*$/im;

const contractFields = new Set([
  "contractVersion",
  "lane",
  "allowedPaths",
  "validationProfile",
  "manualMergeRequired",
  "autoMergeEligible",
  "requiredReading",
]);

const dangerPatterns = [
  { key: "auth_security", pattern: /\b(auth|authentication|authorization|session|security|mfa|passkey|password|credential|token)\b/i },
  { key: "storage_privacy", pattern: /\b(storage|file byte|privacy|vault|permission|authz)\b/i },
  { key: "money_settlement", pattern: /\b(money|settlement|payment|bill calculation|rounding|currency|balance)\b/i },
  { key: "schema_migration", pattern: /\b(schema|migration|ef core|database migration|destructive data)\b/i },
  { key: "openapi_generated_client", pattern: /\b(openapi|generated client|client generation)\b/i },
  { key: "sync_import_export", pattern: /\b(sync|restore|backup|import|export|reconciliation)\b/i },
  { key: "docker_ci_deploy", pattern: /\b(docker|compose|ci|github action|deployment|deploy|truenas|codemagic)\b/i },
  { key: "secrets_config", pattern: /\b(secret|secrets|credential|credentials|\.env|env var|environment variable|ssh|token storage|auth config|security config|deployment config)\b/i },
  { key: "public_admin_exposure", pattern: /\b(public exposure|admin exposure|production|reverse proxy|tls)\b/i },
  { key: "mobile_release", pattern: /\b(testflight|app store|mobile release|signing)\b/i },
  { key: "destructive_operations", pattern: /\b(destructive operation|delete data|purge|drop table|wipe)\b/i },
  { key: "branch_cleanup", pattern: /\b(delete branch|branch cleanup|force push|history rewrite)\b/i },
  { key: "architecture_replacement", pattern: /\b(replace architecture|reduce day 1 scope|scope reduction)\b/i },
];

export const validationProfiles = Object.freeze({
  "docs-only": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
  ]),
  "workflow-tooling": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
    ["npm", ["run", "validate:scaffold"]],
    ["bash", ["-lc", "node --test tools/auto-runner/test/*.test.mjs"]],
    ["node", ["--check", "tools/auto-runner/settleora-auto-runner.mjs"]],
    ["node", ["tools/auto-runner/settleora-auto-runner.mjs", "--preflight"]],
  ]),
  "runner-tests": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
    ["npm", ["run", "validate:scaffold"]],
    ["bash", ["-lc", "node --test tools/auto-runner/test/*.test.mjs"]],
    ["node", ["--check", "tools/auto-runner/settleora-auto-runner.mjs"]],
    ["node", ["tools/auto-runner/settleora-auto-runner.mjs", "--preflight"]],
  ]),
  "scaffold-docs": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["npm", ["run", "validate:docs"]],
    ["npm", ["run", "validate:scaffold"]],
  ]),
});

export const laneManifest = Object.freeze({
  "workflow-docs-tooling": Object.freeze({
    id: "workflow-docs-tooling",
    purpose: "Auto-runner, workflow documentation, and AI controller tooling.",
    allowedPaths: Object.freeze(["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"]),
    defaultValidationProfile: "workflow-tooling",
    supportedValidationProfiles: Object.freeze(["workflow-tooling", "runner-tests", "scaffold-docs", "docs-only"]),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
  }),
  "docs-planning": Object.freeze({
    id: "docs-planning",
    purpose: "Planning, issue ledger, and non-runtime reporting documentation.",
    allowedPaths: Object.freeze(["docs/planning/**", "docs/qa/**"]),
    defaultValidationProfile: "docs-only",
    supportedValidationProfiles: Object.freeze(["docs-only", "scaffold-docs"]),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
  }),
  "product-runtime": dangerLane("product-runtime", "Product runtime work remains manual-gated."),
  "security-runtime": dangerLane("security-runtime", "Auth/session/security runtime work remains manual-gated."),
  "storage-privacy": dangerLane("storage-privacy", "Storage, file privacy, and authz work remain manual-gated."),
  "money-settlement": dangerLane("money-settlement", "Money, settlement, payment, and bill calculation work remain manual-gated."),
  "schema-migrations": dangerLane("schema-migrations", "Schema and migration work remain manual-gated."),
  "openapi-generated-clients": dangerLane("openapi-generated-clients", "OpenAPI and generated-client work remain manual-gated."),
  "deployment-ci-env": dangerLane("deployment-ci-env", "Docker, CI, deployment, env, and secret work remain manual-gated."),
});

export function classifyIssueLane(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}\n${(issue.labels || []).join(" ")}`;
  const hits = dangerPatterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
  const labels = new Set(issue.labels || []);

  if (labels.has("manual-gate") || labels.has("needs-tommy")) {
    return blockedDecision("manual", "Issue already carries a manual gate label.", {
      manualGate: true,
      dangerReasons: hits,
    });
  }

  if (hits.length > 0 || labels.has("danger-gate")) {
    return blockedDecision("danger-gated", `Issue appears to request gated scope: ${hits.join(", ") || "danger-gate label"}.`, {
      manualGate: true,
      dangerGate: true,
      dangerReasons: hits,
    });
  }

  const parsed = parseAutoRunnerContract(issue.body || "");
  if (!parsed.ok) {
    return blockedDecision("missing-or-invalid-contract", parsed.reason, {
      contract: parsed,
    });
  }

  return buildContractDecision(parsed.contract);
}

export function parseAutoRunnerContract(body) {
  const heading = contractHeadingPattern.exec(body || "");
  if (!heading) {
    return { ok: false, reason: "Issue is missing a body-level ## Auto-runner contract section." };
  }

  const afterHeading = body.slice(heading.index + heading[0].length);
  const fence = afterHeading.match(/```json\s*([\s\S]*?)```/i);
  if (!fence) {
    return { ok: false, reason: "Auto-runner contract must be a fenced json block." };
  }

  let contract;
  try {
    contract = JSON.parse(fence[1]);
  } catch (error) {
    return { ok: false, reason: `Auto-runner contract JSON is malformed: ${error.message}` };
  }

  const validation = validateContractShape(contract);
  if (!validation.ok) {
    return validation;
  }

  return { ok: true, contract };
}

export function pathViolatesPolicy(filePath, laneDecision) {
  const normalized = normalizePath(filePath);
  if (!laneDecision.allowedToImplement) return true;
  if (isForbiddenPath(normalized)) return true;
  const manifestAllowed = matchesAnyGlob(normalized, laneDecision.laneManifestAllowedPaths || []);
  const contractAllowed = matchesAnyGlob(normalized, laneDecision.allowedPaths || []);
  return !manifestAllowed || !contractAllowed;
}

export function filterForbiddenChangedFiles(files, laneDecision) {
  return files.filter((file) => pathViolatesPolicy(file, laneDecision));
}

export function getValidationProfile(profileName) {
  return validationProfiles[profileName] || null;
}

function buildContractDecision(contract) {
  const lane = laneManifest[contract.lane];
  if (!lane) {
    return blockedDecision("unknown-contract-lane", `Unsupported auto-runner lane: ${contract.lane}.`, { contract });
  }
  if (!lane.implementationAllowed || lane.manualGateBeforeImplementation) {
    return blockedDecision(contract.lane, `Lane ${contract.lane} is disabled or manual-gated for implementation.`, {
      contract,
      manualGate: true,
      dangerGate: !lane.implementationAllowed,
    });
  }
  if (!validationProfiles[contract.validationProfile]) {
    return blockedDecision(contract.lane, `Unsupported validation profile: ${contract.validationProfile}.`, { contract });
  }
  if (!lane.supportedValidationProfiles.includes(contract.validationProfile)) {
    return blockedDecision(
      contract.lane,
      `Validation profile ${contract.validationProfile} is not allowed for lane ${contract.lane}.`,
      { contract },
    );
  }
  const unsafePath = contract.allowedPaths.find((glob) => !lane.allowedPaths.some((laneGlob) => globIsSubsetOf(glob, laneGlob)));
  if (unsafePath) {
    return blockedDecision(contract.lane, `Contract allowed path is outside lane manifest allowlist: ${unsafePath}.`, { contract });
  }

  const autoMergeEligible = Boolean(contract.autoMergeEligible && lane.autoMergeAllowed);
  return {
    lane: contract.lane,
    allowedToImplement: true,
    manualGate: false,
    dangerGate: false,
    reason: "Valid issue contract accepted by lane manifest.",
    dangerReasons: [],
    contract,
    allowedPaths: [...contract.allowedPaths],
    laneManifestAllowedPaths: [...lane.allowedPaths],
    validationProfile: contract.validationProfile || lane.defaultValidationProfile,
    manualMergeRequired: Boolean(contract.manualMergeRequired || !autoMergeEligible),
    autoMergeEligible,
    prCreationAllowed: lane.prCreationAllowed,
    followupIssueCreationAllowed: lane.followupIssueCreationAllowed,
    reviewFixMutationAllowed: lane.reviewFixMutationAllowed,
  };
}

function validateContractShape(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return { ok: false, reason: "Auto-runner contract must be a JSON object." };
  }
  for (const key of Object.keys(contract)) {
    if (!contractFields.has(key)) {
      return { ok: false, reason: `Auto-runner contract contains unsupported field: ${key}.` };
    }
  }
  for (const field of contractFields) {
    if (!(field in contract)) {
      return { ok: false, reason: `Auto-runner contract is missing required field: ${field}.` };
    }
  }
  if (contract.contractVersion !== 1) {
    return { ok: false, reason: `Unsupported auto-runner contract version: ${contract.contractVersion}.` };
  }
  for (const [field, value] of [
    ["lane", contract.lane],
    ["validationProfile", contract.validationProfile],
  ]) {
    if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
      return { ok: false, reason: `Auto-runner contract field ${field} must be a non-empty string.` };
    }
  }
  for (const [field, value] of [
    ["manualMergeRequired", contract.manualMergeRequired],
    ["autoMergeEligible", contract.autoMergeEligible],
  ]) {
    if (typeof value !== "boolean") {
      return { ok: false, reason: `Auto-runner contract field ${field} must be boolean.` };
    }
  }
  for (const [field, value] of [
    ["allowedPaths", contract.allowedPaths],
    ["requiredReading", contract.requiredReading],
  ]) {
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.length > 0)) {
      return { ok: false, reason: `Auto-runner contract field ${field} must be a non-empty string array.` };
    }
  }
  if (contract.allowedPaths.some((glob) => glob.startsWith("/") || glob.includes("..") || glob.includes("\\"))) {
    return { ok: false, reason: "Auto-runner contract allowedPaths must be repo-relative forward-slash globs." };
  }
  return { ok: true };
}

function blockedDecision(lane, reason, overrides = {}) {
  return {
    lane,
    allowedToImplement: false,
    manualGate: overrides.manualGate ?? true,
    dangerGate: overrides.dangerGate ?? false,
    reason,
    dangerReasons: overrides.dangerReasons || [],
    contract: overrides.contract || null,
    allowedPaths: [],
    laneManifestAllowedPaths: [],
    validationProfile: null,
    manualMergeRequired: true,
    autoMergeEligible: false,
    prCreationAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
  };
}

function dangerLane(id, purpose) {
  return Object.freeze({
    id,
    purpose,
    allowedPaths: Object.freeze([]),
    defaultValidationProfile: null,
    supportedValidationProfiles: Object.freeze([]),
    implementationAllowed: false,
    manualGateBeforeImplementation: true,
    prCreationAllowed: false,
    autoMergeAllowed: false,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
  });
}

function isForbiddenPath(filePath) {
  return [
    /^\.env(?:\.|$)/,
    /^\.github\/workflows(?:\/|$)/,
    /^infra(?:\/|$)/,
    /^services\/api(?:\/|$)/,
    /^packages\/contracts\/openapi(?:\/|$)/,
    /^packages\/client-(web|dart)(?:\/|$)/,
    /^apps\/mobile(?:\/|$)/,
    /(^|\/)migrations?(\/|$)/i,
    /(^|\/)(auth|session|security)(\/|$)/i,
    /(^|\/)(settlement|payment|bill|money|storage|sync|ocr)(\/|$)/i,
  ].some((pattern) => pattern.test(filePath));
}

function matchesAnyGlob(filePath, globs) {
  return globs.some((glob) => globMatchesPath(glob, filePath));
}

function globMatchesPath(glob, filePath) {
  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return filePath === prefix.slice(0, -1) || filePath.startsWith(prefix);
  }
  return filePath === glob;
}

function globIsSubsetOf(childGlob, parentGlob) {
  if (parentGlob.endsWith("/**")) {
    const parentPrefix = parentGlob.slice(0, -2);
    return childGlob === parentGlob || childGlob.startsWith(parentPrefix);
  }
  return childGlob === parentGlob;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export const terminalOutcomes = [
  "approved_pr_opened",
  "blocked_needs_tommy",
  "danger_gate",
  "auto_failed",
  "no_changes",
  "validation_failed",
  "review_changes_requested_retry_exhausted",
  "issue_created_for_followup",
];

export const systemicStopReasons = [
  "dirty_workspace_real_run",
  "github_auth_unavailable_real_run",
  "codex_unavailable_real_run",
  "repository_state_ambiguous",
  "lock_corruption",
  "repeated_infrastructure_failure",
  "config_policy_corruption",
];
