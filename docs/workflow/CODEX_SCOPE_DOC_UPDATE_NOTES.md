# Codex Scope Documentation Update Notes

## Purpose

Use this document to guide a documentation-only branch that adds Day 1, Day 2, and Day 3 Settleora scope documents.

## Suggested branch

```text
feature/scope-docs-day1-day2-day3
```

## Task type

Documentation-only planning branch.

## Required reading

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Existing `docs/architecture/*`
- Existing `docs/prd/*`

## Files to add

```text
docs/prd/MVP_DAY1_SCOPE.md
docs/prd/DAY2_SCOPE.md
docs/prd/DAY3_AI_INSIGHTS_SCOPE.md
docs/architecture/CURRENCY_EXCHANGE_ARCHITECTURE.md
docs/architecture/STATEMENT_RECONCILIATION_ARCHITECTURE.md
docs/architecture/LOCK_REFUND_GOVERNANCE_ARCHITECTURE.md
docs/architecture/GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md
docs/architecture/AI_INSIGHTS_ARCHITECTURE.md
docs/workflow/CODEX_SCOPE_DOC_UPDATE_NOTES.md
```

Later privacy architecture addendum:

```text
docs/architecture/PRIVACY_VAULT_ARCHITECTURE.md
```

It was added after the Day 1/2/3 scope-doc batch to define Standard Secure Mode, Recoverable Private Vault, future-compatible Strict Private Vault, and recoverable-to-strict migration boundaries.

## Constraints

- Do not change implementation code.
- Do not edit generated clients.
- Do not change OpenAPI paths unless separately requested.
- Do not delete `.codex`.
- Do not commit `.codex` contents unless explicitly requested.
- Do not use `git add .`.
- Stage only the intended documentation paths.

## Validation

Recommended commands:

```powershell
npm ci
npm run validate:scaffold
npm run validate:openapi
```

If repo validation script supports broader documentation checks, run:

```powershell
npm run validate
```

Do not fake validation success. Report exact failing command and short error summary.

## Final report format

Write final report to:

```text
.codex/last-report.md
```

Include:

- Files changed.
- Commit hash.
- Branch pushed: yes/no.
- Validation results by command.
- Warnings/follow-up tasks.
