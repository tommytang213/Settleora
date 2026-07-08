const dangerPatterns = [
  { key: "auth_security", pattern: /\b(auth|authentication|authorization|session|security|mfa|passkey|password|credential|token)\b/i },
  { key: "storage_privacy", pattern: /\b(storage|file byte|privacy|vault|permission|authz)\b/i },
  { key: "money_settlement", pattern: /\b(money|settlement|payment|bill calculation|rounding|currency|balance)\b/i },
  { key: "schema_migration", pattern: /\b(schema|migration|ef core|database migration|destructive data)\b/i },
  { key: "openapi_generated_client", pattern: /\b(openapi|generated client|client generation)\b/i },
  { key: "sync_import_export", pattern: /\b(sync|restore|backup|import|export|reconciliation)\b/i },
  { key: "docker_ci_deploy", pattern: /\b(docker|compose|ci|github action|deployment|deploy|truenas|codemagic)\b/i },
  { key: "secrets_config", pattern: /\b(secret|credential|\.env|config|ssh|token storage)\b/i },
  { key: "public_admin_exposure", pattern: /\b(public exposure|admin exposure|production|reverse proxy|tls)\b/i },
  { key: "mobile_release", pattern: /\b(testflight|app store|mobile release|signing)\b/i },
  { key: "branch_cleanup", pattern: /\b(delete branch|branch cleanup|force push|history rewrite)\b/i },
  { key: "architecture_replacement", pattern: /\b(replace architecture|reduce day 1 scope|scope reduction)\b/i },
];

const forbiddenPathPatterns = [
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
];

export function classifyIssueLane(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}\n${(issue.labels || []).join(" ")}`;
  const hits = dangerPatterns.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
  const labels = new Set(issue.labels || []);

  if (labels.has("manual-gate") || labels.has("needs-tommy")) {
    return {
      lane: "manual",
      allowedToImplement: false,
      manualGate: true,
      dangerGate: false,
      reason: "Issue already carries a manual gate label.",
      dangerReasons: hits,
      allowedPaths: [],
      autoMergeEligible: false,
    };
  }

  if (hits.length > 0 || labels.has("danger-gate")) {
    return {
      lane: "danger-gated",
      allowedToImplement: false,
      manualGate: true,
      dangerGate: true,
      reason: `Issue appears to request gated scope: ${hits.join(", ") || "danger-gate label"}.`,
      dangerReasons: hits,
      allowedPaths: [],
      autoMergeEligible: false,
    };
  }

  if (/workflow|tooling|codex|docs?|automation|runner/i.test(text)) {
    return {
      lane: "workflow-docs-tooling",
      allowedToImplement: true,
      manualGate: false,
      dangerGate: false,
      reason: "Workflow/docs/tooling lane with no detected gated domain.",
      dangerReasons: [],
      allowedPaths: ["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**", ".ai/**"],
      autoMergeEligible: false,
    };
  }

  return {
    lane: "unknown-needs-tommy",
    allowedToImplement: false,
    manualGate: true,
    dangerGate: false,
    reason: "Issue lane is not confidently safe for unattended implementation.",
    dangerReasons: [],
    allowedPaths: [],
    autoMergeEligible: false,
  };
}

export function pathViolatesPolicy(filePath, laneDecision) {
  const normalized = filePath.replace(/\\/g, "/");
  if (laneDecision.lane === "workflow-docs-tooling") {
    return forbiddenPathPatterns.some((pattern) => pattern.test(normalized));
  }
  return true;
}

export function filterForbiddenChangedFiles(files, laneDecision) {
  return files.filter((file) => pathViolatesPolicy(file, laneDecision));
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
