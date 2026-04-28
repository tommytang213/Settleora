Task: Add reusable Codex task guide.

Read first:
- PROGRAM_ARCHITECTURE.md
- README.md
- docs/workflow/
- services/api/README.md
- infra/README.md

Branch:
- docs/codex-task-guide

Scope:
- Documentation only.
- Do not modify API code.
- Do not modify OpenAPI.
- Do not modify Docker Compose.
- Do not add features.

Create:
- docs/workflow/CODEX_TASK_GUIDE.md

Update:
- README.md only if needed to link the guide from the workflow/documentation references.

Goal:
Create a concise reusable guide so future Codex prompts can be shorter without losing project safety rules.

Required contents for CODEX_TASK_GUIDE.md:

1. Purpose
- This guide defines standard rules for Codex tasks in Settleora.
- It does not replace PROGRAM_ARCHITECTURE.md.

2. Required pre-task reading
- PROGRAM_ARCHITECTURE.md
- README.md
- relevant service/app README files
- relevant architecture docs only

3. Standard task boundaries
- one branch per task
- one focused goal per task
- no unrelated feature work
- do not push directly to main
- do not force push
- do not use git add .
- stage explicit paths only
- do not amend commits unless explicitly requested

4. Architecture rules summary
- API owns core business database writes
- worker must not directly mutate core business tables
- OpenAPI is source of truth
- generated clients are not hand-edited
- file bytes go through storage abstraction
- file metadata belongs in PostgreSQL
- no direct filesystem/storage path exposure
- money must be decimal-safe
- currency must always be attached
- rounding policy is centralized
- on-device OCR is required; server OCR worker is complementary

5. Validation rules
- run dotnet validation when API changes
- run npm validation when repo tooling/docs/contracts change
- run Docker validation when Docker/compose/API runtime changes
- do not fake validation success
- report exact failing command if validation fails

6. Git/reporting format
- branch name
- commit hash
- pushed yes/no
- files created
- files modified
- packages added
- commands run
- validation results
- Docker runtime result if relevant
- warnings/follow-up tasks

7. Current milestone notes
- GET /health exists
- GET /health/ready currently checks PostgreSQL
- no schema/migrations/business endpoints yet
- infrastructure readiness checks should be additive and scoped
- next likely infrastructure check is RabbitMQ readiness

Keep it concise.
Do not duplicate the full architecture document.
Do not rewrite the PRD.

Validation:
- npm ci
- npm run validate:scaffold
- npm run validate:openapi
- npm run validate:api
- npm run validate:compose
- npm run validate:api-docker

Git:
- Commit message:
  docs: add reusable codex task guide
- Push branch:
  docs/codex-task-guide
- Do not merge to main.

Final report:
- files changed
- commit hash
- validation results
- warnings