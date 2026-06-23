# User Experience Modes Architecture

## Purpose

Settleora needs approachable default flows without weakening the backend rules that protect financial history, authorization, privacy, and audit. Experience modes control what the user sees and how much workflow detail is shown; they do not create separate financial truth.

The Basic/Guided/Advanced/Help-me-decide baseline is now Day 1 planning scope. This document does not mean the current API, OpenAPI contract, generated clients, schema, or runtime already implement these preferences; implementation still requires separate scoped issues and any applicable manual gates.

## Experience Presets

Day 1 first launch should present four user-facing choices:

```text
basic
guided
advanced
help_me_decide
```

Recommended labels are `Basic`, `Guided`, `Advanced`, and `Help me decide`.

Internal enum names should stay stable and boring. If implementation wants to preserve older internal naming, `basic` may map to an existing `simple` concept and `help_me_decide` may be an onboarding flow rather than a persisted long-term mode. Do not use this decision to create a large customization system.

Preset intent:

- `basic`: default to the shortest safe workflow, hide advanced controls until needed, and keep same-currency and ordinary split flows quiet.
- `guided`: show recommended choices, explain review points through structured UI, and surface common advanced options at decision points.
- `advanced`: expose detailed controls, source metadata, audit history, reconciliation state, import/export options, and policy configuration where the user has permission.
- `help_me_decide`: ask a short set of onboarding questions, then recommend and enable the appropriate UI mode and feature visibility options.

## Per-Feature Advanced Toggles

Experience presets must not be all-or-nothing. A user can be in Basic mode but enable only advanced FX, or stay Guided while turning on more detailed reconciliation.

Recommended feature toggles:

```text
advanced_fx
advanced_splits
group_contexts
approval_policy_controls
reconciliation
advanced_recurring
receipt_ocr_review_details
settlement_proof_details
audit_history
sync_status_details
import_export_advanced
dashboard_customization
```

For Day 1, keep per-feature opt-ins narrow and pragmatic. Where feasible, let a user in Basic mode enable one or two advanced feature areas without accepting every advanced feature. Full dashboard customization, drag-drop widget builders, and complex per-user product builders are later work unless separately approved.

Rules:

- Modes and toggles control UI/UX visibility, workflow depth, labels, guidance, and default screen complexity only.
- Toggles do not change backend financial truth.
- The same backend/data model/security/audit rules apply regardless of UI mode.
- Hidden controls must not become hidden authority. The API still enforces permissions, status transitions, money policy, file access, and audit.
- UI defaults can reduce clutter but must still reveal required review states, conflicts, approvals, errors, and security/privacy warnings.
- Modes do not change backend authority, functions, financial truth, authorization, storage access, audit, sync behavior, or status transition rules.

## Visibility Resolution Order

Feature visibility should resolve in this order:

1. system policy;
2. role/permissions;
3. group policy;
4. user preference;
5. screen context.

System policy and permissions can remove or force visibility regardless of user preference. Group policy can require more detail for shared workflows. Screen context can temporarily reveal required controls when a bill, settlement, import, or review state needs them.

## Permission Boundary

Admin and owner tools remain permission-controlled, not only experience-mode controlled.

Examples:

- A user in Advanced mode must not see group-owner policy controls unless their role permits it.
- A group owner in Basic mode can still be shown required approval or policy controls when the group workflow needs them.
- Audit history visibility depends on role, group policy, privacy policy, and record authorization before user preference.

## FX Interaction

FX is the clearest example of per-feature depth:

- Basic mode hides FX fields when bill currency equals target currency.
- Basic mode can show one recommended conversion when conversion is required.
- Enabling `advanced_fx` reveals source priority, provider/cache metadata, rate direction, requested/source rate dates, manual override reason, and copy-from-profile/bill/provider options.
- Group/context FX profile creation and approval controls require both `approval_policy_controls` visibility and the relevant group/context permission.

FX financial truth remains defined by bill-level FX snapshots in [Currency Exchange Architecture](CURRENCY_EXCHANGE_ARCHITECTURE.md), not by which controls were visible when the bill was created.

## Contract, Schema, And API Implications

Implementation tasks will likely need additive design for:

- user experience preset preference;
- per-feature preference toggles;
- system policy defaults and hard disables;
- group policy defaults and required-detail settings;
- API responses that include server-resolved visibility/workflow hints for clients.

These are planning implications only. This architecture document does not change the current contract, schema, generated clients, or runtime by itself.
