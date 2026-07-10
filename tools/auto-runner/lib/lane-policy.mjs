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
  { key: "money_settlement", pattern: /\b(money|settlement|payment|paid|settled|refunded|refund|settle|billing|bill calculation|rounding|currency|balance|amount|total|debt|owed|split|allocation|ledger state)\b/i },
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

const moneyPresentationProofPatterns = Object.freeze([
  { key: "accessibility", pattern: /\b(accessibility|accessible|assistive technolog(?:y|ies)|screen reader|screen-reader)\b/i },
  { key: "semantics", pattern: /\b(semantics?|semantic label|semantic announcement|announcement)\b/i },
  { key: "visible_display_text", pattern: /\b(visible (?:display )?text|display text|visible label|label copy|display copy)\b/i },
  { key: "ui_copy", pattern: /\b(ui copy|copy only|text only|wording only|presentation-only|presentation only)\b/i },
  { key: "layout_style_only", pattern: /\b(icon|layout|style|styling|visual rendering|rendering)\b/i },
  { key: "read_only_widget_rendering", pattern: /\b(read-only|read only|shared widget|widget rendering|MoneyText)\b/i },
]);

const moneyAuthorityMutationPatterns = Object.freeze([
  { key: "calculate_compute_arithmetic", pattern: /\b(calculate|calculation|compute|arithmetic|formula|sum|total|subtotal|derive)\b/i },
  { key: "rounding_precision_policy", pattern: /\b(round|rounding|precision|decimal places?|policy)\b/i },
  { key: "currency_conversion_exchange_rate", pattern: /\b(convert(?: currency)?|currency conversion|exchange rate|fx)\b/i },
  { key: "parse_monetary_input", pattern: /\b(parse|parsing|input|entry|enter|typed|form field)\b[^.\n]{0,80}\b(amount|currency|money|monetary)\b|\b(amount|currency|money|monetary)\b[^.\n]{0,80}\b(parse|parsing|input|entry|enter|typed|form field)\b/i },
  { key: "business_value_mutation", pattern: /\b(edit(?:ing)?|writ(?:e|ing)|persist(?:ing)?|sav(?:e|ing)|mutat(?:e|ing)|stor(?:e|ing)|record(?:ing)?|patch(?:ing)?|submit(?:ting)?)\s+(?:the\s+|an?\s+)?(?:business\s+|domain\s+)?(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger)\b|\b(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger)\b[^.\n]{0,80}\b(edit(?:ing)?|writ(?:e|ing)|persist(?:ing)?|sav(?:e|ing)|mutat(?:e|ing)|stor(?:e|ing)|record(?:ing)?|patch(?:ing)?|submit(?:ting)?)\b/i },
  { key: "paid_settled_refunded_transition", pattern: /\b(mark|transition|set|confirm|claim|cancel|dispute|refund|settle)\b[^.\n]{0,100}\b(paid|settled|refunded|payment|settlement|refund|status)\b|\b(paid|settled|refunded|payment|settlement|refund|status)\b[^.\n]{0,100}\b(mark|transition|set|confirm|claim|cancel|dispute|refund|settle)\b/i },
  { key: "api_domain_database_storage_write", pattern: /\b(api|domain|database|db|storage|repository|server)\b[^.\n]{0,100}\b(write|persist|save|update|mutate|patch|post|put|delete)\b|\b(write|persist|save|update|mutate|patch|post|put|delete)\b[^.\n]{0,100}\b(api|domain|database|db|storage|repository|server)\b/i },
  { key: "authorization_policy_decision", pattern: /\b(authori[sz]ation|permission|policy|eligibility|access)\b[^.\n]{0,100}\b(amount|currency|balance|debt|owed|payment|settlement|money|financial value)\b|\b(amount|currency|balance|debt|owed|payment|settlement|money|financial value)\b[^.\n]{0,100}\b(authori[sz]ation|permission|policy|eligibility|access)\b/i },
  { key: "settlement_payment_billing_behavior", pattern: /\b(settlement|payment|billing|bill calculation)\b[^.\n]{0,100}\b(behavior|workflow|flow|action|transition|calculate|compute|mutation|state)\b/i },
  { key: "split_allocation_calculation", pattern: /\b(split|allocation)\b[^.\n]{0,100}\b(calculate|calculation|compute|formula|total|amount)\b|\b(calculate|calculation|compute|formula|total|amount)\b[^.\n]{0,100}\b(split|allocation)\b/i },
  { key: "ambiguous_financial_verbs", pattern: /\b(adjust|apply|resolve|reconcile|finalize|normalize|validate|derive)\b[^.\n]{0,100}\b(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger|money)\b|\b(amount|currency|balance|debt|owed|payment|settlement|split|allocation|total|ledger|money)\b[^.\n]{0,100}\b(adjust|apply|resolve|reconcile|finalize|normalize|validate|derive)\b/i },
]);

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
        const positiveText = issueSearchText(issue, "positive-scope");
        const presentationException = evaluateMoneyPresentationException({
          contract: parsed.contract,
          contractDecision,
          detectedDangerReasons: positiveHits,
          positiveText,
        });
        if (presentationException.applied) {
          return {
            ...contractDecision,
            reason: "Valid issue contract accepted by lane manifest; presentation-only money display nouns suppressed for client-ui-low-risk.",
            dangerReasons: [],
            moneyPresentationException: presentationException,
          };
        }
        return blockedDecision(
          contractDecision.lane,
          `Issue positive scope appears to request gated work: ${positiveHits.join(", ")}.`,
          {
            contract: parsed.contract,
            manualGate: true,
            dangerGate: true,
            dangerReasons: positiveHits,
            moneyPresentationException: presentationException,
          },
        );
      }
      return {
        ...contractDecision,
        moneyPresentationException: emptyMoneyPresentationException([]),
      };
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
  const pathDangerReasons = detectDangerousPathReasons(contract.allowedPaths);
  if (pathDangerReasons.length > 0) {
    return blockedDecision(contract.lane, "Contract allowed path contains a danger-domain path segment.", {
      contract,
      dangerGate: true,
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

function evaluateMoneyPresentationException({ contract, contractDecision, detectedDangerReasons, positiveText }) {
  const presentationProofMatches = matchPatternKeys(positiveText, moneyPresentationProofPatterns);
  const authorityMutationMatches = matchPatternKeys(positiveText, moneyAuthorityMutationPatterns);
  const base = {
    detectedDangerReasons: [...detectedDangerReasons],
    presentationProofMatches,
    authorityMutationMatches,
    applied: false,
    reason: "not_evaluated",
  };
  if (!contract || !contractDecision?.allowedToImplement) {
    return { ...base, reason: "contract_not_validated" };
  }
  if (contract.lane !== "client-ui-low-risk" || contractDecision.lane !== "client-ui-low-risk") {
    return { ...base, reason: "lane_not_client_ui_low_risk" };
  }
  if (contract.validationProfile !== "mobile-ui-low-risk" || contractDecision.validationProfile !== "mobile-ui-low-risk") {
    return { ...base, reason: "validation_profile_not_mobile_ui_low_risk" };
  }
  const contractedPaths = contract.allowedPaths || [];
  const lanePaths = contractDecision.laneManifestAllowedPaths || [];
  const outsideLane = contractedPaths.find((glob) => !lanePaths.some((laneGlob) => globIsSubsetOf(glob, laneGlob)));
  if (outsideLane) return { ...base, reason: "contract_path_outside_lane_manifest" };
  const outsidePresentationUi = contractedPaths.find((glob) => !isClientUiPresentationPath(glob));
  if (outsidePresentationUi) return { ...base, reason: "contract_path_outside_presentation_ui" };
  if (detectedDangerReasons.length !== 1 || detectedDangerReasons[0] !== "money_settlement") {
    return { ...base, reason: "danger_reasons_not_exactly_money_settlement" };
  }
  if (presentationProofMatches.length === 0) {
    return { ...base, reason: "missing_presentation_only_proof" };
  }
  if (authorityMutationMatches.length > 0) {
    return { ...base, reason: "authority_or_mutation_signal_present" };
  }
  return {
    ...base,
    applied: true,
    reason: "validated_client_ui_low_risk_presentation_only_money_display",
  };
}

function emptyMoneyPresentationException(detectedDangerReasons) {
  return {
    detectedDangerReasons: [...detectedDangerReasons],
    presentationProofMatches: [],
    authorityMutationMatches: [],
    applied: false,
    reason: "no_positive_scope_danger",
  };
}

function matchPatternKeys(text, patterns) {
  return patterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
}

function isClientUiPresentationPath(glob) {
  const normalized = normalizePath(glob);
  return normalized.startsWith("apps/mobile/lib/ui/") || normalized.startsWith("apps/mobile/test/ui/");
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
    moneyPresentationException: overrides.moneyPresentationException || null,
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
