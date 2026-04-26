# BRANCHING_AND_RELEASE_STRATEGY.md

## Goal
Settleora should be developed and released like a real product, with AI assisting inside the process rather than replacing process discipline.

## Recommended Branching Strategy
- `main`: production-ready branch
- `develop`: integration branch
- `feature/<name>`: new feature work
- `fix/<name>`: bug fixes
- `release/<version>`: release stabilization
- `hotfix/<version>`: urgent production fixes

## Rules
1. No direct coding on `main`.
2. AI-generated code should land in feature/fix branches.
3. Every branch should map to a task/requirement.
4. Pull requests should stay reasonably small and reviewable.
5. Release branches are for stabilization, version bumping, release notes, and final validation.
6. Hotfix branches should merge back into both `main` and `develop`.

## Protected Branch Expectations
Protected branches should require:
- passing CI
- required reviews where configured
- no direct force-push by default
- status checks before merge

## AI-Assisted Workflow
AI tools such as Codex should:
- create changes in task-specific branches
- update tests and docs with code changes
- avoid bypassing branch protections
- avoid giant unreviewable change sets
- respect manual approval gates for release/deploy workflows
