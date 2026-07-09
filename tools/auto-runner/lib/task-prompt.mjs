import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hktTimestamp, safeTimestamp, slugify } from "./logger.mjs";

export function generateTaskPrompt(config, issue, laneDecision, targetBranch) {
  const timestampKey = safeTimestamp().replace(/[^0-9TZ]/g, "").slice(0, 15);
  const reportPath = path.join(
    config.repoRoot,
    ".codex",
    "reports",
    `settleora-codex-report-${timestampKey}-issue-${issue.number}-${slugify(issue.title, 36)}.md`,
  );
  const promptPath = path.join(
    config.logsRoot,
    "tasks",
    `${timestampKey}-issue-${issue.number}-${slugify(issue.title)}.md`,
  );

  const prompt = `# Settleora Auto-Runner Generated Codex Task

HKT generated time: ${hktTimestamp()}
Task timestamp key: ${timestampKey}

## Source GitHub issue

- Issue: #${issue.number}
- Title: ${issue.title}
- URL: ${issue.url || "unavailable"}
- Labels: ${(issue.labels || []).join(", ") || "none"}

## Target

- Target branch: \`${targetBranch}\`
- Expected local report path: \`${reportPath}\`
- Lane: \`${laneDecision.lane}\`
- Lane decision: ${laneDecision.reason}
- Allowed paths: ${(laneDecision.allowedPaths || []).join(", ") || "none"}
- Validation profile: ${laneDecision.validationProfile || "none"}
- Auto-merge eligible: ${laneDecision.autoMergeEligible ? "yes" : "no"}
- Manual merge required: ${laneDecision.manualMergeRequired ? "yes" : "no"}

## Validated auto-runner contract

\`\`\`json
${JSON.stringify(laneDecision.contract || null, null, 2)}
\`\`\`

## Issue body

${issue.body || "_No issue body._"}

## Required reading

- \`PROGRAM_ARCHITECTURE.md\`
- \`README.md\`
- \`docs/workflow/CODEX_TASK_GUIDE.md\`
- \`docs/workflow/CODEX_VALIDATION_REPORT_BUDGET.md\`
- \`docs/planning/ISSUE_PROGRESS_LEDGER.md\` when relevant
- Active \`.ai/*\` files when workflow state could be affected
- Relevant docs for the changed area
${(laneDecision.contract?.requiredReading || []).map((item) => `- Contract required: \`${item}\``).join("\n")}

## Guardrails

- API/domain services remain authoritative for auth, authorization, money, storage access, sync acceptance, status transitions, and audit.
- OpenAPI is the source of truth; generated clients must not be hand-edited.
- No silent runtime, API, auth/session/security, storage/privacy, money/settlement/bill calculation, schema/migration, generated-client, sync, Docker/CI/deployment, secret, production, or mobile release changes.
- Update the issue progress ledger when issue state could otherwise be misread later.

## Git rules

- Start from latest \`origin/main\`.
- Create and work only on \`${targetBranch}\`.
- Implement locally, validate locally, and write the local report only.
- Do not push to any remote.
- Do not open or update pull requests.
- Do not merge.
- Do not change GitHub labels, issues, or comments.
- Do not create follow-up GitHub issues.
- The runner owns explicit-path staging, commit, push, PR creation/update, CI watching, and issue outcome labels/comments after local validation and an approved pre-PR review verdict.
- Do not push directly to \`main\`.
- Do not force push.
- Do not delete branches.
- Do not amend commits.
- Do not use \`git add .\`; stage explicit paths only.
- Do not commit; leave intended file changes in the local checkout for the runner to stage explicitly after review.
- Keep \`.codex/reports/\` local unless the task explicitly requires committing a report.

## Scope and non-goals

- Implement only the issue goal within the lane policy.
- Non-goals: product runtime, API behavior, auth/session/security runtime, storage/privacy, money/settlement/bill calculation, schema/migration, OpenAPI/generated-client, Docker/CI/deployment, secrets, production deploy, mobile release, branch cleanup, direct main push, or auto-merge to main.

## Validation expectations

- Run validation chosen from changed-file scope.
- For docs/tooling changes, start with:
  - \`git status --short\`
  - \`git diff --name-only\`
  - \`git diff --check\`
  - \`npm run validate:docs\`
  - \`npm run validate:scaffold\` when tooling/scaffold paths are relevant
- Do not claim skipped or failed validation passed.

## Report requirements

Write \`${reportPath}\` with status, branch, base SHA, final SHA, files changed, validation commands/results, scope guard result, PR URL if created, human review or stop reason, and confirmation that no forbidden runtime/API/security/money/schema/deployment/secret/OpenAPI/generated-client/Docker/CI changes occurred.

## Stop conditions

Stop and report if the issue requires manual/danger-gated scope, ambiguous repo/GitHub state, secrets, direct main push, force push, branch deletion, destructive operation, generated-client hand edit, schema migration, auth/storage/money/sync authority change, Docker/CI/deployment mutation, or validation you cannot honestly classify.
`;

  writeFileSync(promptPath, prompt);
  return { promptPath, reportPath, timestampKey, prompt };
}

export function readGuardrailSnippets() {
  return {
    architecture: readFileSync("PROGRAM_ARCHITECTURE.md", "utf8").slice(0, 5000),
    taskGuide: readFileSync("docs/workflow/CODEX_TASK_GUIDE.md", "utf8").slice(0, 5000),
  };
}
