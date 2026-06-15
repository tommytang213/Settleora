# Current Milestone

- ID: `M2`
- Name: `Mobile Navigation + Home Dashboard Shell Polish`
- Target branch: `ai/integration`
- Previous milestone ID: `M1`

## Goal

Make the mobile app feel coherent after the M1 group-bill flow by improving the owner/user landing experience, Home/dashboard usefulness, bottom navigation clarity, and top-level handoffs between Home, Groups, Bills, Settlements, and safe quick actions.

## Allowed Scope For Future M2 Tasks

- Mobile UI shell and top-level navigation code where explicitly queued.
- Mobile tests for Home, dashboard shell, bottom navigation, route clarity, group/settlement handoffs, and milestone QA.
- Documentation and QA maps.
- `.ai` control files.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security.
- Database schema/migrations.
- Settlement/payment/bill calculation logic.
- Storage/file privacy policy.
- Docker/deployment/env/CI config.
- Production secrets.
- Web/admin runtime UI.
- Push notifications, offline sync policy, or local storage behavior.

## Done Criteria

- Home/dashboard shell exposes useful next actions and honest empty/unavailable states without inventing backend behavior.
- Bottom navigation labels, active state, and route handoffs are clear across Home, Groups, Bills, Settlements/Settle, and related routes; Home keeps the persistent nav visible with Home selected.
- Home Create bill offers personal and group choices, with group bill routed through existing group selection/shared-bill surfaces only.
- Groups and settlement landing paths work coherently with existing repositories and APIs only.
- Relevant mobile validation and UI testing checklist are completed.
- No human-gated blocker remains.
