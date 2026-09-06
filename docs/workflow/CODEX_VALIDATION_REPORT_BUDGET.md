# Codex Validation And Report Budget Policy

This policy keeps Settleora Codex tasks scoped to the smallest safe validation profile and keeps chat updates compact. It supplements [CODEX_TASK_GUIDE.md](CODEX_TASK_GUIDE.md); architecture, security, money, storage, schema, generated-client, deployment, and manual-gate rules still apply.

## Core Rule

Choose validation from the changed files and risk category. Run the narrowest commands that can catch likely regressions during implementation, then broaden only when the task type, changed files, or PR/merge gate requires it. Never reduce validation for high-risk runtime, security, storage, money, schema, OpenAPI, generated-client, Docker, CI, deployment, release, or manual-gated work.

Do not run expensive API, mobile, Docker, or hosted CI checks by habit for docs-only or narrow low-risk slices. Do not claim validation passed unless the exact command passed in the current environment.

## Validation Profiles

### Docs-Only

Use when changes are limited to Markdown or static documentation assets and do not alter package files, scripts, contracts, generated clients, code, tests, migrations, Docker/compose, CI, runtime config, or release behavior.

Default commands:

```bash
git status --short
git diff --name-only
git diff --check
npm run validate:scaffold
```

Run `npm run validate:scaffold` when the docs/scaffold guard is relevant or available. If dependencies are missing and the task requires it, run `npm ci` once, then rerun the command and report both results.

Not default for this profile:

- `npm run validate:api`
- `npm run validate:api-local`
- `npm run validate:openapi`
- `npm run validate:clients`
- `npm run validate:compose`
- Flutter commands
- Codemagic

Escalate only when the doc change also edits validation scripts, package metadata, contract references that must be linted, Docker/CI/release behavior, or another directly relevant checked surface.

### OpenAPI And Generated Clients

Use when `packages/contracts/openapi/settleora.v1.yaml`, generated web/Dart client output, or contract-generation tooling changes.

Default commands:

```bash
npm run validate:openapi
npm run generate:clients
npm run validate:clients --if-present
```

Run `npm run generate:clients` only when the contract or generator change should update generated output. Review generated diffs and never hand-edit generated clients. Add API, mobile, or web validation only when the changed contract surface or generated output makes it directly relevant.

### Backend/API Focused

Use when the change is confined to API implementation, API tests, server validation, or non-security endpoint hardening.

Default implementation loop:

```bash
dotnet test services/api/Settleora.Api.sln --filter <focused-filter>
```

Prefer focused filters for the touched endpoint, service, or test class while iterating. Run broader API validation near PR/merge or when the runtime risk is wider:

```bash
npm run validate:api-local
```

Use `npm run validate:api` when the local doctor preflight is unnecessary or already covered by the task. Add OpenAPI/client validation only for contract or generated-client changes. Add Docker validation only when Docker/runtime composition, container behavior, migrations, or deployment-relevant API runtime behavior changed.

### Auth, Security, Storage, Money, Or Schema High-Risk

Use when the task touches auth/session/security-critical runtime, authorization, storage/file privacy or file bytes, money, settlement, bill calculation authority, payment behavior, schema, migrations, destructive data operations, or audit-critical behavior.

Default commands are intentionally stronger and must be chosen from the touched surface:

```bash
npm run validate:api-local
npm run validate:openapi
npm run validate:clients --if-present
npm run validate:api-migrations
npm run validate:api-runtime
```

Run the subset required by the actual files and risk, and add focused tests for the changed service or endpoint. Do not downgrade this profile to save time. Manual gates still apply for security, storage/privacy, money/settlement authority, schema migrations, destructive operations, production exposure, and other high-risk changes named in the task guide.

### Mobile/UI

Use when mobile app code, Flutter tests, mobile UI docs that require executable evidence, generated Dart client output, or mobile validation tooling changes.

Default local commands:

```bash
npm run doctor:mobile
npm run validate:mobile
```

For narrow implementation loops, focused Flutter tests from `apps/mobile` are acceptable before the broader mobile validation:

```bash
cd apps/mobile
flutter test <focused-test-files>
```

Codemagic remains manual-only. Do not run or require hosted Codemagic for routine mobile docs or non-iOS work unless the task explicitly asks for mobile iOS build/release validation.

### Docker, CI, Or Deployment

Use when Dockerfiles, compose files, deployment docs/scripts, CI workflows, Codemagic config, runtime environment defaults, or release automation changes.

Default commands depend on the touched surface:

```bash
npm run doctor:docker
npm run validate:compose
npm run validate:compose:truenas-lan
npm run validate:compose:truenas-lan-image
npm run validate:api-docker-local
```

Use only the relevant compose/runtime checks for the changed files. CI/deployment infrastructure changes often trigger manual gates and must not be auto-merged unless the task explicitly permits that scope.

### PR/Merge Gate

Use when a task explicitly asks for PR creation and merge-gate handling.

Default sequence:

```bash
git status --short
git diff --name-only
git diff --check
<task-required local validation>
gh pr checks <PR_NUMBER> --required --watch --fail-fast
```

Before merge, confirm the worktree is clean, the PR base/head/head SHA match the task, the validated commit is still the PR head, required GitHub checks passed on that exact SHA, the PR is clean/mergeable, changed files are within allowed scope, and no manual gate was triggered. Merge only through GitHub, never by direct push to `main`.

## Codemagic Budget Rule

Codemagic must not auto-run on routine backend, API, docs, OpenAPI, generated-client, test-only, or security-hardening PRs. Hosted macOS minutes are reserved for mobile/iOS evidence that cannot be proven locally.

Maintainers manually trigger Codemagic only for:

- Mobile/iOS validation gates.
- Codemagic config changes.
- Signing, TestFlight, App Store, or release preparation.
- Release branches or tags.
- Explicitly requested mobile validation gates.

The repository-side Codemagic setup remains documented in [CODEMAGIC_TESTFLIGHT_SETUP.md](CODEMAGIC_TESTFLIGHT_SETUP.md).

## GitHub Actions Required Check Budget Rule

The required `Scaffold Validation` workflow must keep the `Validate scaffold` job name stable for branch protection. Its changed-file classifier treats only `README.md` and Markdown/static documentation assets under `docs/` as docs-only. Docs-only runs install the Node repo tooling dependencies and run `npm run validate:scaffold`. A first push with a missing/zero before SHA on a non-default branch may qualify only after a successful fixed `origin/main` fetch, matching checked-out event SHA, complete history, one validated merge-base, consistent ancestry, and a successful non-empty docs-only diff. Default-main first pushes, any other changed path, unavailable or untrustworthy proof, and unsupported events default to full validation. The focused classifier regression suite runs in every Scaffold Validation job.

Workflow, CI, package metadata, tooling, scripts, services, apps, contracts, generated clients, source, tests, Docker/compose, infrastructure, deployment, runtime config, OpenAPI, schema, migration, security, storage/privacy, money, settlement, payment, and bill-calculation changes must keep the broader GitHub Actions validation path enabled.

## Chat And Report Budget Rule

Future Codex workflow chat replies should stay compact. Use:

- HKT timestamp.
- Download/report link.
- Blocker or manual decision field only when needed, naming the related field, file, path, or check.
- One PowerShell command block.

Detailed implementation notes, validation logs, files changed, warnings, non-blocking rationale, skipped checks, and scope-guard evidence belong in the Codex report file, not the chat reply.

When user action is actually required, blocker/manual decision text should name the related field, file, path, or check. Do not paste long explanations into chat unless the human needs that detail to make the decision.

## Task Prompt Budget Rule

Future task prompts should include required guardrails, branch/PR targets, manual gates, and task-specific validation, but avoid repeating long validation prose when this policy already defines the rule. Link to this document instead.

Still repeat or strengthen rules for high-risk work where the task depends on explicit manual gates, such as auth/session/security, storage/privacy/file bytes, money/settlement calculation authority, schema migrations, Docker/CI/deployment, production release, mobile store release, secrets, destructive operations, or branch/history cleanup.
