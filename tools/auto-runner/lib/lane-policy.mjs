const contractHeadingPattern = /^##\s+Auto-runner contract\s*$/im;
const markdownHeadingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const eligibleContractLabels = new Set(["auto-ready", "auto-bundle", "auto-canary-ready"]);

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

const dangerousPathPatterns = [
  { key: "auth_security", pattern: /(^|\/)(auth|authentication|authorization|session|security|mfa|passkey|password|credential|token)(\/|$)/i },
  { key: "storage_privacy", pattern: /(^|\/)(storage|privacy|vault|permission|authz|file)(\/|$)/i },
  { key: "money_settlement", pattern: /(^|\/)(money|settlement|payment|bill|rounding|currency|balance)(\/|$)/i },
  { key: "schema_migration", pattern: /(^|\/)(schema|migration|migrations|database|ef)(\/|$)/i },
  { key: "openapi_generated_client", pattern: /(^|\/)(openapi|generated|client-web|client-dart|contracts)(\/|$)/i },
  { key: "sync_import_export", pattern: /(^|\/)(sync|restore|backup|import|export|reconciliation)(\/|$)/i },
  { key: "docker_ci_deploy", pattern: /(^|\/)(docker|compose|ci|workflows|deployment|deploy|infra|truenas|codemagic)(\/|$)/i },
  { key: "secrets_config", pattern: /(^|\/)(secret|secrets|credential|credentials|env|ssh|config)(\/|$)|(^|\/)\.env(?:\.|$)/i },
  { key: "public_admin_exposure", pattern: /(^|\/)(public|admin|production|tls|reverse-proxy)(\/|$)/i },
  { key: "mobile_release", pattern: /(^|\/)(testflight|app-store|signing|mobile-release)(\/|$)/i },
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
  "mobile-ui-low-risk": Object.freeze([
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter pub get"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter analyze"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart"]],
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
    autoMergeAllowed: true,
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
    autoMergeAllowed: true,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
  }),
  "client-ui-low-risk": Object.freeze({
    id: "client-ui-low-risk",
    purpose: "Default-off canary lane for narrow mobile shared UI component styling/copy with no API, auth, money, storage, schema, generated-client, deployment, release, or exposure changes.",
    allowedPaths: Object.freeze(["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"]),
    defaultValidationProfile: "mobile-ui-low-risk",
    supportedValidationProfiles: Object.freeze(["mobile-ui-low-risk"]),
    implementationAllowed: true,
    manualGateBeforeImplementation: false,
    prCreationAllowed: true,
    autoMergeAllowed: true,
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
  const labels = new Set(issue.labels || []);

  if (labels.has("manual-gate") || labels.has("needs-tommy")) {
    return blockedDecision("manual", "Issue already carries a manual gate label.", {
      manualGate: true,
      dangerReasons: detectDangerReasons(issueSearchText(issue, "all")),
    });
  }

  if (labels.has("danger-gate")) {
    return blockedDecision("danger-gated", "Issue already carries a danger gate label.", {
      manualGate: true,
      dangerGate: true,
      dangerReasons: detectDangerReasons(issueSearchText(issue, "all")),
    });
  }

  if (hasEligibleContractLabel(labels)) {
    const parsed = parseAutoRunnerContract(issue.body || "");
    if (parsed.ok) {
      const contractDecision = buildContractDecision(parsed.contract);
      if (!contractDecision.allowedToImplement) {
        return contractDecision;
      }
      const positiveHits = detectDangerReasons(issueSearchText(issue, "positive-scope"));
      if (positiveHits.length > 0) {
        return blockedDecision(
          contractDecision.lane,
          `Issue positive scope appears to request gated work: ${positiveHits.join(", ")}.`,
          {
            contract: parsed.contract,
            manualGate: true,
            dangerGate: true,
            dangerReasons: positiveHits,
          },
        );
      }
      return contractDecision;
    }

    const malformedHits = detectDangerReasons(issueSearchText(issue, "all"));
    if (malformedHits.length > 0) {
      return blockedDecision(
        "danger-gated",
        `Issue has an invalid auto-runner contract and appears to request gated scope: ${malformedHits.join(", ")}.`,
        {
          contract: parsed,
          manualGate: true,
          dangerGate: true,
          dangerReasons: malformedHits,
        },
      );
    }
    return blockedDecision("missing-or-invalid-contract", parsed.reason, {
      contract: parsed,
    });
  }

  const hits = detectDangerReasons(issueSearchText(issue, "all"));
  if (hits.length > 0) {
    return blockedDecision("danger-gated", `Issue appears to request gated scope: ${hits.join(", ")}.`, {
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

  const contractDecision = buildContractDecision(parsed.contract);
  if (!contractDecision.allowedToImplement) {
    return contractDecision;
  }
  return contractDecision;
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
  if (isForbiddenPath(normalized, laneDecision)) return true;
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
    const pathDangerReasons = detectDangerousPathReasons(contract.allowedPaths);
    return blockedDecision(contract.lane, `Contract allowed path is outside lane manifest allowlist: ${unsafePath}.`, {
      contract,
      dangerGate: pathDangerReasons.length > 0,
      dangerReasons: pathDangerReasons,
    });
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

function hasEligibleContractLabel(labels) {
  return [...labels].some((label) => eligibleContractLabels.has(label));
}

function detectDangerReasons(text) {
  return dangerPatterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
}

function detectDangerousPathReasons(paths) {
  return [
    ...new Set(
      paths.flatMap((filePath) =>
        dangerousPathPatterns.filter((entry) => entry.pattern.test(normalizePath(filePath))).map((entry) => entry.key),
      ),
    ),
  ];
}

function issueSearchText(issue, mode) {
  const body = String(issue.body || "");
  const scopedBody = mode === "positive-scope" ? positiveScopeBodyText(body) : body;
  return [issue.title || "", scopedBody, (issue.labels || []).join(" ")].join("\n");
}

function positiveScopeBodyText(body) {
  return stripNegativeSections(stripAutoRunnerContractSection(String(body || "")));
}

function stripAutoRunnerContractSection(body) {
  return stripSections(body, (heading) => normalizeHeading(heading) === "auto runner contract");
}

function stripNegativeSections(body) {
  return stripSections(body, (heading) => {
    const normalized = normalizeHeading(heading);
    return (
      normalized === "non goals" ||
      normalized === "non goal" ||
      normalized === "out of scope" ||
      normalized === "outside scope" ||
      normalized === "prohibited actions" ||
      normalized === "prohibited action" ||
      normalized === "forbidden actions" ||
      normalized === "forbidden action" ||
      normalized === "do not" ||
      normalized === "exclusions" ||
      normalized === "excluded scope" ||
      normalized === "not in scope"
    );
  });
}

function stripSections(body, shouldStrip) {
  const headings = [...body.matchAll(markdownHeadingPattern)];
  if (headings.length === 0) {
    return body;
  }

  const ranges = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!shouldStrip(heading[2])) continue;
    const level = heading[1].length;
    const start = heading.index;
    let end = body.length;
    for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
      const next = headings[nextIndex];
      if (next[1].length <= level) {
        end = next.index;
        break;
      }
    }
    ranges.push([start, end]);
  }
  if (ranges.length === 0) {
    return body;
  }

  let stripped = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    stripped += body.slice(cursor, start);
    cursor = end;
  }
  return stripped + body.slice(cursor);
}

function normalizeHeading(heading) {
  return String(heading || "")
    .toLowerCase()
    .replace(/[`*_()[\]{}:;,.!?'"-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function isForbiddenPath(filePath, laneDecision = {}) {
  if (
    laneDecision.lane === "client-ui-low-risk" &&
    matchesAnyGlob(filePath, laneDecision.laneManifestAllowedPaths || []) &&
    !detectDangerousPathReasons([filePath]).length
  ) {
    return false;
  }
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
  "auto_merged",
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
