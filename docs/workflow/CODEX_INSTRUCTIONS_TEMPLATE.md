# CODEX_INSTRUCTIONS_TEMPLATE.md

## Project
Settleora is a self-hosted cross-platform expense, receipt OCR, shared bill, settlement, recurring bill, forecasting, and reconciliation platform.

## Core Instructions
1. Do not invent requirements not present in the PRD.
2. Do not simplify or weaken financial logic.
3. Do not bypass centralized auth, audit, or policy systems.
4. Do not place sensitive business rules only in frontend clients.
5. All money calculations must use decimal-safe types.
6. All access control must be enforced server-side.
7. Future-facing flexibility must be implemented via modular boundaries and policy/config systems where appropriate.
8. New features must default to secure/least-privilege behavior.
9. Update docs and tests whenever business logic changes.
10. Generate code in a way that remains maintainable and extensible.
11. Follow real product engineering workflow with branching, CI, release automation, and reviewable PR-sized changes.

## Architectural Guardrails
- Prefer modular service boundaries.
- Keep financial calculation logic centralized in backend/domain services.
- Use provider abstractions for OCR, storage, notifications, auth, and export.
- Design schema/API for versionability and future extension.
- Preserve backward compatibility where practical.

## Security Guardrails
- Never rely on hidden UI elements as authorization.
- Never expose admin-only functionality without policy enforcement.
- Never silently broaden data visibility.
- Keep audit logging integrated for money/security/share-related actions.
- Use secure defaults for registration, session handling, retention, and portal exposure.

## Branching and Change Workflow
- Default branch strategy:
  - `main`
  - `develop`
  - `feature/<name>`
  - `fix/<name>`
  - `release/<version>`
  - `hotfix/<version>`
- Do not work directly on `main`.
- Prefer small branches and reviewable pull requests.
- Include requirement/task references in PR descriptions or generated notes.
- Update changelog/release notes when relevant.

## CI/CD Expectations
- Ensure generated code fits automated CI checks.
- Add/update:
  - format/lint config
  - unit tests
  - integration tests where practical
  - build pipelines
  - container publish workflows
  - release workflows
- Do not mark work complete if core tests are missing or broken.
- Prefer pipeline-friendly project structure and secrets handling.

## Publishing Expectations
- Design release workflows for:
  - GitHub Container Registry publication
  - optional Docker Hub mirroring
  - web artifact packaging
  - mobile build/export preparation
- Use semantic versioning where reasonable.
- Keep release process documented.

## Testing Expectations
- Unit tests for calculations and status transitions
- Integration tests for workflow/API
- UI/widget tests for critical screens
- E2E happy-path tests for key flows
- Run tests and validate before considering task complete

## Preferred Delivery Style
- Work in small safe increments
- Keep changes easy to review
- Generate or update documentation as part of feature work
- Surface uncertainties rather than assuming silently
- Avoid giant monolithic dumps when task slicing is possible
