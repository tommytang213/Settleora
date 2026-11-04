# Settleora Agent Rules

Current repository files are the source of truth. Uploaded or copied snapshots are advisory only when they differ from the repo.

Before starting work, read:

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` files
- Relevant domain docs for the changed area

## Branch Model

- `main` is the production branch. During the current development stage, explicit PR/merge-gate tasks may merge to `main` automatically only through GitHub PRs after all required gates pass.
- `ai/integration` is the AI integration branch for safe internal task PRs.
- `ai/task/*` branches hold one focused AI task each.

## Absolute Prohibitions

- No direct push to `main`.
- No auto-merge to `main` except for explicit development-stage PR/merge-gate tasks that satisfy the policy below.
- No secrets, credentials, tokens, `.env`, `~/.ssh`, or local Codex state.
- No silent Docker, deployment, or environment changes.
- No silent auth, session, or security changes.
- No silent database schema or migration changes.
- No silent OpenAPI or generated-client changes.
- No silent settlement, payment, or bill calculation logic changes.

## Development-Stage Main Merge Policy

While Settleora has no production deployment, a task explicitly marked as a PR/merge gate may automatically merge to `main` only when all of these are true:

- Worktree is clean before validation and immediately before merge.
- The source branch head matches the expected SHA.
- `origin/main` matches the expected starting SHA immediately before merge.
- PR base, head branch, and head SHA match the task.
- Changed files are within the task's allowed scope.
- Required local validation passes, with exact commands and results reported.
- GitHub CI/checks pass on the exact PR head.
- PR is mergeable and clean.
- PR head is unchanged immediately before merge.
- No manual gate is triggered.
- Merge is a normal GitHub merge commit unless the task explicitly says otherwise.
- Source branch is not deleted unless the human explicitly requests deletion,
  except that issue #947's `ephemeral_cleanup_v1` standing authority permits the
  runner to delete only its own positively proven, fully merged, fully
  reconciled ephemeral branch and disposable clean worktree after every policy
  gate passes.

Dev-stage auto-merge does not allow direct pushes to `main`, force pushes, skipped validation, skipped CI, dirty or stale PRs, changed-head merges, or merges for production, security-critical runtime or accepted-semantics, destructive, or otherwise manual-gated work.

Manual gates are still required for production deploys, mobile store releases, public/admin exposure changes, destructive migrations or destructive data operations, branch deletion/cleanup outside the exact issue #947 `ephemeral_cleanup_v1` standing authority above, force-like history changes, secrets/auth config changes, auth/session/security-critical runtime work, storage/file privacy/authz runtime or accepted-semantics changes, file-byte operations, money/settlement calculation authority changes, schema migrations, CI/deployment infrastructure changes, reducing Day 1 scope, replacing architecture direction, and any task that explicitly says PR-only or human-merge-only.

A task is not human-gated solely because it concerns storage, files, privacy, or
authz when its tracked changes are documentation, planning, factual
reconciliation, or audit evidence only and it changes none of the following:
runtime behavior; accepted authorization/privacy semantics; product
requirements or decisions; architecture direction; Day 1 scope; file bytes or
cleanup/purge/disposal; schema, migrations, APIs, OpenAPI, generated clients,
UI, or Figma behavior; provider/storage-backend, encryption/key-management,
secret, or configuration state; public/admin exposure; deployment, production,
or release state; or any other task-specific human/manual gate. Factual storage
completeness audits, source-versus-doc reconciliation, lifecycle policy docs
that record current behavior and unresolved choices without deciding them,
docs-only storage/privacy/authz planning, and docs-only evidence/hygiene may therefore
use the normal exact-head development-stage merge path.

Human approval remains mandatory for storage/file privacy/authz runtime
behavior; access or authorization semantics; privacy decisions that change
accepted behavior; file-byte operations; physical cleanup, purge, or disposal;
provider or storage-backend configuration; encryption or key management;
secret/config changes; destructive operations; public/admin exposure;
production operations, deployment, or release; unresolved
privacy/security/product decisions that the task resolves, changes, or requires
to proceed; requirement changes; architecture
replacement or direction changes; Day 1 scope changes; and explicit PR-only or
human-merge-only tasks. All unrelated manual gates above remain unchanged.

Task PRs may also be eligible for auto-merge into `ai/integration` after the scope guard, requested validation, CI, AI review, and QA all pass.

## Manual Gate Owner and Evidence

A repository manual gate is a required review decision, not automatically a request to Tommy. For routine implementation of agreed requirements, Atlas acts as the delegated technical lead and makes the technical gate decision for code, CI/tooling, API/schema, and money-correctness work. Codex prepares the concrete contract or diff, exact-head validation, independent reviews, scope evidence, and remaining risks for that decision. Atlas approval does not replace passing tests, independent review, GitHub CI, or the PR's exact-head merge checks.

Implementing and testing an agreed security feature in isolated source is routine technical development; assess the actual effect and scope rather than treating every auth-related edit as a live access change. Ask Tommy when a product requirement or UX direction is unresolved, or before changing live credentials, permissions, exposure, or security-sensitive system or network settings, a production-triggering merge, deployment or release, purchases, adding reviewers, or any task that expressly requires Tommy's own approval. Code and configuration labels do not create an exemption when their actual effect is protected. A task-specific human-merge-only rule remains in force. Do not infer permission for a protected action from Atlas technical signoff. Record the actual gate owner and decision in the task report; do not repeatedly escalate routine technical choices to Tommy after the agreed requirement is clear.

## Cursor Cloud specific instructions

Cloud Agent images for this repo provide Node.js 22, the .NET 9 SDK (`DOTNET_ROOT=/usr/local/share/dotnet`), Flutter 3.44.8, and Docker Engine with Compose. There is no systemd. The `ubuntu` user is in the `docker` group on a new login. The environment start script launches `dockerd`, then sets `net.bridge.bridge-nf-call-iptables=0` and `net.bridge.bridge-nf-call-ip6tables=0`. Without those sysctls, Compose containers cannot open TCP connections to each other even when published host ports work. Apply the same sysctls again after creating a Docker network.

Start then runs `docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml` for Postgres, RabbitMQ, and the API. The API process does not apply EF migrations. Start runs `migrate-database --mode=apply-safe` in a one-shot API container before it starts the API. Readiness is `http://127.0.0.1:8080/health/ready` with `"status":"ready"`. The user web dev server listens on port 5174 and does not proxy the API.

`npm run validate:api` uses in-memory databases and does not need Compose. Run `flutter analyze` and `flutter test` from `apps/mobile`. iOS builds are not available on this Linux image. Development database and queue passwords live only in `infra/env/.env.example`.

## Required Task Report Fields

- Task status and branch names.
- Source, integration, and task commit SHAs.
- Files changed.
- Validation commands and exact results.
- Scope guard result.
- PR URL when created.
- Human review or stop reason.
- Confirmation that no forbidden runtime, API, security, money, schema, deployment, or secret changes were made.
