# Day 1 UX Reference Decisions

## Purpose

This packet records Tommy's Day 1 UX/reference decisions approved at `2026-06-28 15:37 HKT`. It clears the product/reference direction for covered Day 1 UX gates without creating runtime, API, OpenAPI, schema, generated-client, provider, deployment, security, storage, sync, import/export, backup/restore, money, settlement, or bill-calculation implementation authority.

Use this document with the domain architecture docs listed below when deciding whether a future mobile, user web, or admin web implementation issue still needs new Figma work or can proceed from existing references and product patterns.

## Non-goals

- No runtime UI implementation.
- No Figma generation.
- No API, OpenAPI, generated-client, schema, migration, worker, provider, auth/session, notification delivery, sync, import/export, backup/restore, storage/file-byte, money, settlement, bill, or payment behavior changes.
- No claim that Strict Vault, zero-knowledge vaulting, notification providers, passkey/MFA runtime, import/export runtime, backup/restore runtime, sync conflict runtime, or web/admin runtime is implemented.
- No replacement for future implementation issues, validation plans, or manual gates.

## Required Source References

Future implementation tasks covered by this packet must read the current repo versions of:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [Day 1 decision register](DAY1_DECISION_REGISTER.md)
- [Mobile design references](../design/mobile/README.md)
- [Mobile implementation guardrails V1](../design/mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)
- [User experience modes architecture](../architecture/USER_EXPERIENCE_MODES_ARCHITECTURE.md)
- [Privacy vault architecture](../architecture/PRIVACY_VAULT_ARCHITECTURE.md)
- [Auth MFA and passkey architecture](../architecture/AUTH_MFA_PASSKEY_ARCHITECTURE.md)
- [Notification preference resolution model](../architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md)
- [Friends and direct sharing API policy](../architecture/FRIENDS_DIRECT_SHARING_API_POLICY.md)
- [Temporary participant claim and link flow](../architecture/TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [Server sync acceptance, idempotency, and conflict policy](../architecture/SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Bill revision settlement impact and audit matrix](../architecture/BILL_REVISION_SETTLEMENT_IMPACT_AUDIT_MATRIX.md)

## Global Figma And Reference Policy

Day 1 uses Figma only for critical flows or genuinely risky new interaction patterns. Derivative screens should use the repo-tracked references, existing Settleora product language, shared components, and platform-appropriate responsive adaptations.

Critical flows need strong reference coverage before implementation:

- OCR review and correction.
- Item-level split assignment.
- Tax, discount, service, fee, and refund allocation.
- Settlement action and dispute flows.
- Sync conflict resolution.
- Privacy and security warnings.
- Local/server onboarding.
- Recurring bill edit scope.

Derivative screens do not need new screen-by-screen Figma by default. They must follow existing mobile references, web/admin product patterns, accessible empty/error/loading states, clear authority-boundary copy, and shared Settleora components. Create new Figma/reference work only when a dashboard shell changes materially, a new visual language is proposed, a risky warning/confirmation pattern is introduced, or the existing references do not answer a product-critical state.

## Decisions

### Notifications

Day 1 includes full in-app, email, push/provider, device-token, and admin-policy scope. In-app remains the baseline channel. Email and push require provider configuration, device-token lifecycle handling, unsupported/unconfigured states, privacy-safe content, and admin policy caps.

Notification preferences must support global/grouped controls plus every event type individually configurable where policy allows. Admin/system policy is the hard cap; user and group preferences may narrow delivery but cannot enable disabled channels.

### Sync

Sync conflict UX must show a conflict list, local/server differences, keep-server action, keep-local/resubmit action, field-by-field resolution where supported, and preservation of local pending edits until accepted or explicitly discarded.

Sync status should be visible through global status, a sync queue screen, and abnormal per-record chips only. Normal records should not be cluttered with redundant synced chips.

### Friends And Direct Sharing

Day 1 discovery uses exact-match lookup plus invite code/link. There is no browse-all-users or global directory by default. `People around you` and bill-drop style discovery are Day 2 candidates only.

Direct sharing must remain server-authorized and limited to approved friends or approved shared/group context. Friend status alone must not expose payment details, QR files, settlement proof, receipt files, or unrelated profile data.

### Temporary Participants

Day 1 may create temporary participant placeholders for real shared bills when a participant has no account yet. Placeholders can later claim/link to a real account. Before linking, placeholders have no account authority, login authority, governance vote, direct-sharing authority, or broad access to records outside the bill/context that created them.

### Privacy Modes And Warnings

Day 1 includes Standard Secure Mode and Recoverable Private Vault where deployment/admin policy allows them. Standard Secure remains the default safety profile. Recoverable Private Vault protects selected sensitive content without moving shared accounting truth, settlement state, authorization, audit, sync acceptance, or financial authority from API/domain services to clients.

Strict Vault and zero-knowledge vaulting are not Day 1 and must not be presented as implemented. Strict Vault should move into Day 2 planning scope for design review, recovery tradeoffs, migration warnings, key-loss behavior, and no-silent-downgrade rules before any future implementation.

Privacy warnings should be admin-configurable by warning level, with the default safety profile recommending clear warnings for mode choice, recoverability, backup/restore caveats, policy-disabled states, migration/downgrade attempts, and the fact that Recoverable Private Vault is not strict zero-knowledge.

### Import, Export, Backup, And Restore

Day 1 includes CSV import/export plus local backup/restore to support migration from other expense apps. CSV import is staged and reviewable; imported data does not become accepted server truth until API/domain validation and explicit user acceptance.

Ownership boundaries:

- Mobile owns local profile backup/restore UX for local-mode data portability and recovery.
- User web may expose authorized user data export/import where platform-appropriate.
- Admin web owns server backup policy, status, and manual-gated maintenance surfaces. Admin backup controls must not expose secrets, raw vault keys, storage paths, provider internals, or file bytes without future explicit gated policy.

### Auth, Passkeys, And MFA

Day 1 includes full WebAuthn/passkey, TOTP, recovery-code, policy, audit, and QA scope. Runtime work remains auth/security manual-gated and must not store raw MFA secrets, passkey private material, recovery codes, reusable challenge material, reset tokens, provider tokens, or session tokens in unsafe tables, logs, API responses, generated clients, or audit metadata.

Figma/reference is required only for first-launch auth/local/server onboarding, MFA/passkey enrollment/challenge, recovery-code display/regeneration, and new risky admin policy patterns. Ordinary derivative settings/readout screens may use existing product patterns after those reference gates are clear.

### Bill Revision Settlement Impact

Accepted bill revisions after settlement must never silently mutate settlement balances, selected outstanding lines, payment proof, payment history, or audit history. Future runtime must provide explicit revision impact review, affected approvals, payer reconfirmation, and an adjustment, reopen, or delta path where policy allows.

### Experience Modes

Basic, Guided, Advanced, and Help me decide are Day 1. Modes affect presentation, guidance, default complexity, labels, and visible controls only. They do not change backend authority, available required states, financial truth, authorization, storage access, sync acceptance, audit, or status transitions.

### Search, Dashboard, User Web, And Admin Web

Search/filter/group dashboard work does not need new Figma by default. Use existing patterns unless the dashboard shell or visual language changes materially.

User web should reuse Settleora product language and adapt mobile-approved flows to desktop/tablet where appropriate; it does not require screen-by-screen Figma by default.

Admin web should use product-grade operational web patterns. Full Figma is not required unless the work introduces a new visual language, admin/public exposure risk, high-risk policy flow, security/privacy warning pattern, backup/restore maintenance flow, or other risky interaction.

## Issue Cleanup Policy

Reference-only issues may be closed when this packet plus existing domain docs cover their product/reference acceptance criteria. Closing a reference issue does not close its parent epic or implementation/runtime child issues.

Implementation issues must remain open if they still require API, OpenAPI, generated clients, schema, migrations, mobile runtime, user web runtime, admin web runtime, provider setup, security/auth runtime, sync runtime, import/export runtime, backup/restore runtime, storage/file-byte behavior, money/settlement/bill authority, QA, or manual gates.

Create a new implementation issue only when no existing issue already covers the remaining runtime/API/UI/QA work. New issues must include planning metadata where feasible: Work Type, Area, Day Scope, Priority, Risk, Size, Validation Class, Figma Required, Manual Gate, Blocking Gate, Gate Owner, Bundle ID, and a close rule.

## Future Implementation Task Requirements

Future implementation tasks that use this packet must:

- Link this packet and the relevant domain architecture docs.
- State whether new Figma is required or explicitly not required under this policy.
- Preserve API/domain authority for money, authorization, status transitions, storage access, sync acceptance, audit, and security policy.
- State the exact manual gates that still apply.
- State whether OpenAPI/generated clients, schema/migrations, providers, storage/file-byte handling, auth/session/security, or money/settlement/bill calculation authority are in scope.
- Include validation commands matched to the changed files.
- Report exact validation results, changed files, scope guard, and confirmation that no forbidden runtime/API/security/money/schema/deployment/secret changes were made unless explicitly scoped and gated.
