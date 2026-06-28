# Admin Web Reference V1

## Status

Reference gate for Day 1 admin web surfaces.

- Related issues: #463, #464, #465, #466, #467, #468, #376
- Gate issue: #468
- Status: `approved_textual_reference_gate`
- New Figma required for every derivative admin screen: No
- Runtime implementation authorized by this doc: No

This document defines the Day 1 admin web product direction, component
inventory, implementation wait rules, and manual-gate reminders. It is a
repo-tracked substitute reference for ordinary admin planning and derivative
operational screens that follow these rules.

## Source References

Future admin-web tasks must read the current repo versions of:

- [Program architecture](../../../PROGRAM_ARCHITECTURE.md)
- [Day 1 decision register](../../planning/DAY1_DECISION_REGISTER.md)
- [Day 1 UX reference decisions](../../planning/DAY1_UX_REFERENCE_DECISIONS.md)
- [Day 1 UX implementation readiness plan](../../planning/DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md)
- [Mobile design references](../mobile/README.md)
- [Mobile implementation guardrails V1](../mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)
- Relevant architecture docs for auth/session/security, MFA/passkeys,
  notification providers, storage policy, privacy vault, audit, import/export,
  backup/restore, self-hosting exposure, and deployment when those surfaces are
  in scope.

## Product Direction

Admin web is a product-grade operational workspace, not a raw backend console.
It should be dense, calm, and policy-oriented. Admins need to understand system
state, safe defaults, pending risks, and audited actions without seeing raw
secrets, hidden user content, storage internals, or provider payloads.

The admin UI must be desktop/tablet optimized from the start:

- Scannable tables with filters and saved views where useful.
- Split panes and detail drawers for users, policies, audit rows, and events.
- Status cards for system health, policy state, provider state, and backup
  readiness.
- Banners for exposure, security, provider, storage, backup, and maintenance
  warnings.
- Explicit confirmation flows for policy changes and maintenance actions.
- Least-privilege wording throughout.

Admin UI cannot substitute for server authorization. API/domain services remain
authoritative for roles, policy changes, audit, security, storage, backup,
deployment, and access.

## Navigation Model

Preferred desktop shell:

- Persistent left sidebar with `Overview`, `Users`, `Invites`, `Access &
  security`, `Notifications`, `Storage & privacy`, `Audit`, `Health`,
  `Maintenance`, and `Settings`.
- Top bar with environment/exposure readout, current admin, notifications or
  alerts, and safe account/session controls.
- Page header with title, status summary, and primary contextual action.
- Right detail drawer or split pane for selected user, policy, audit event, log
  entry, or backup job.

Tablet may collapse the sidebar to an icon rail with labels available on hover
or expansion. Admin web should not use a consumer mobile bottom-nav model.

## Core Components

Admin surfaces should share these components:

- Admin shell, sidebar, top bar, environment/exposure badge.
- Data table with sorting, filters, column visibility, row actions, bulk
  selection where safe, and responsive fallback.
- Filter toolbar and advanced filter drawer.
- Split pane, detail drawer, and event/activity timeline.
- Policy card, status card, warning banner, and confirmation dialog.
- Audit/event row with actor, action, subject, timestamp, result, correlation
  where safe, and redacted metadata.
- Health check row, queue row, provider state row, backup job row.
- User/invite row, role/status chip, MFA/passkey/session status chip.
- Empty, loading, error, denied, unconfigured, degraded, stale, blocked, and
  maintenance states.

Cards are for individual status/readout units. Do not style entire page sections
as floating cards, and do not nest cards inside cards.

## Tables, Filters, Split Panes, Drawers, And Events

Admin tables need predictable operational behavior:

- Filters stay visible or easily recoverable.
- Row click opens a detail pane; row actions remain separate.
- Destructive or security-impactful bulk actions require a confirmation step
  and should be unavailable when server policy does not allow them.
- Audit/event lists are latest-first unless a domain doc says otherwise.
- Event rows use bounded metadata and redaction by default.
- Details should show enough context to review an action without revealing
  secrets, raw file bytes, raw OCR text, hidden payment details, provider
  payloads, or storage internals.

## Safe Admin Wording And Confirmation Actions

Admin copy should name the exact action and consequence:

- Use `Disable registration`, `Require MFA for admins`, `Revoke invite`,
  `Disable email notifications`, `Start backup check`, or `Mark maintenance
  resolved`.
- Avoid vague labels such as `Submit`, `OK`, `Confirm`, or `Proceed` for
  policy, security, storage, backup, or exposure actions.
- Confirmation dialogs must state scope, affected users or policies where safe,
  reversibility, audit behavior, and any required follow-up.
- If runtime support does not exist, the UI must show `Unavailable` or
  `Not configured`, not a pretend success path.

## Auth, Security, MFA, Passkey, And Session Policy

Admin auth/security surfaces cover:

- Local-account policy, OIDC/Keycloak configuration status, invitation and
  registration policy, public self-registration toggle state, and owner/admin
  guidance.
- MFA/passkey availability and enforcement policy, owner/admin recommended
  state, recovery-code policy, and disabled/unconfigured states.
- Session policy, active-session readouts, revoke/sign-out actions, and audit.
- Abuse/rate-limit status where implemented by future runtime.

Manual auth/security gate remains required for runtime changes. Admin UI must
not expose raw MFA secrets, passkey private material, recovery codes, reusable
challenge material, raw reset tokens, raw session tokens, passwords, provider
tokens, or unsafe auth debug data.

## Notification Provider Policy

Admin notification surfaces cover:

- In-app baseline policy.
- SMTP email provider configured/unconfigured/degraded state.
- Push provider configured/unconfigured/degraded state.
- Device-token lifecycle policy status where implemented.
- Channel caps, event category caps, quiet-hours/digest policy, security alert
  exceptions, group mute boundaries, and privacy-safe notification content.

Provider credentials and secrets are never displayed. Provider setup, credential
handling, push release/provider setup, delivery behavior, and security-critical
notification policy remain manually gated runtime work.

## Storage, Upload, And Privacy Vault Policy

Admin storage/privacy surfaces cover:

- File-purpose limits and accepted upload categories.
- Storage usage/status by safe aggregate, not raw object paths.
- Retention policy and disabled/unconfigured states.
- Privacy mode availability: Standard Secure and Recoverable Private Vault for
  Day 1 where policy allows.
- Strict Private Vault is not Day 1 and must not be presented as implemented.
- Vault policy choices, migration/downgrade warnings, and recoverability copy.

Admins are operational roles, not blanket access to user financial/content data.
No admin screen may expose raw receipt files, settlement proof bytes, QR/payment
images, raw OCR text, hidden payment details, direct filesystem paths, object
keys, provider internals, vault keys, or secrets without a future explicit
manual-gated policy.

## Audit, Health, Logs, Maintenance, Backup, And Restore

Audit:

- Show actor, action, subject, timestamp, result, safe correlation IDs, and
  bounded metadata.
- Redact secrets, tokens, credentials, recovery codes, raw OCR text, file bytes,
  request bodies, storage internals, and unrelated sensitive content.

Health/logs/maintenance:

- Show health checks, dependency status, queue/worker status, storage aggregate
  status, and recent safe events.
- Logs must be redacted and product-facing. Avoid stack traces and raw payloads
  in normal UI.
- Maintenance actions require explicit state, confirmation, and audit.

Backup/restore:

- Admin backup/restore surfaces are policy and maintenance surfaces.
- They must not imply runtime backup execution, public exposure, deployment
  behavior, raw file access, or secret export unless a future task explicitly
  scopes and manually gates it.
- Restore or destructive maintenance flows need separate screenshot/Figma or
  human taste approval because they are high-consequence interactions.

## LAN, VPN, Access, And Exposure Posture

Default admin posture is conservative:

- LAN/self-hosted admin access only by default.
- VPN or Access-style protection may be documented as a deployment pattern, not
  silently enabled by UI.
- No public/admin exposure claim is allowed from this reference.
- Public registration, public admin exposure, reverse proxy/TLS exposure,
  provider credential setup, deployment changes, and production release remain
  manually gated.

Admin screens may show an exposure/readiness badge, but it must be a readout of
implemented policy/state, not a substitute for deployment approval.

## Responsive And Accessibility Rules

Admin web is desktop-first but must remain usable on tablets:

- Wide desktop: sidebar, table/list, detail pane, and right rail where useful.
- Medium/tablet: collapsed rail, single primary table/list, drawer detail.
- Narrow fallback: stacked screens for emergency read-only tasks only; complex
  admin operations may require a larger viewport with clear copy.

Keyboard navigation, focus states, row actions, dialogs, drawers, filters, and
tables must be accessible. Warning and status color cannot be the only signal.

## Visual Evidence Requirements

Material admin-web UI PRs must include branch-rendered evidence:

- Desktop screenshot of the changed admin surface.
- Tablet screenshot when responsive behavior changes.
- State evidence for changed empty, loading, error, denied, unconfigured,
  degraded, warning, confirmation, or disabled states.
- Redaction evidence for audit/log/storage/provider/security surfaces.
- Explicit note when this textual reference is used instead of new Figma.

Do not use generated Figma code, fabricated screenshots, scraped assets, or
implementation screenshots that expose secrets or sensitive content.

## Gate Classification

Can proceed from this textual reference plus domain docs:

- #463 protected admin shell/navigation planning and exposure readouts, as long
  as no deployment/public exposure/auth runtime changes are made without manual
  gate.
- #464 user, invite, registration, friend/direct-sharing policy planning using
  least-privilege defaults and safe warning copy.
- #465 MFA/passkey/session policy planning using existing auth/security
  references and manual auth/security gates for runtime.
- #466 notification, storage, upload, and privacy-vault policy planning using
  unconfigured-state and redaction rules.
- #467 audit, health, logs, maintenance, backup, and restore planning for
  ordinary readout and policy surfaces.

Still needs screenshot, Figma, or human taste approval before implementation:

- A materially new admin visual language or shell.
- Public/admin exposure enablement, reverse proxy/TLS exposure, or Access/VPN
  setup UX.
- New high-consequence auth/security warning or enforcement pattern.
- Provider credential entry and secret-handling flows.
- Backup execution, restore, destructive maintenance, or data-loss flows.
- Break-glass/support access, raw content access, or privacy override flows.
- Any branch-rendered screenshot that materially diverges from the approved
  Settleora product language or looks backend-console-like.

## Manual-Gate Reminders

Manual gates remain required for:

- Public/admin exposure.
- Auth/session/security runtime or policy enforcement.
- MFA/passkey/recovery-code runtime.
- Storage/privacy/file-byte authorization.
- Provider credentials, push/email delivery setup, and secrets.
- Backup/restore execution and destructive maintenance.
- Deployment, Docker, CI, environment, reverse proxy, TLS, VPN, or Access
  changes.
- OpenAPI/contracts/generated-client changes.
- Schema/migrations.
- Money/settlement/payment/bill calculation authority.

## Acceptance Checklist For #468

- Full Day 1 admin surface categories are named.
- Required frames/components for policy, audit, maintenance, user management,
  backup, and restore are listed as patterns and evidence rules.
- Responsive layout, dense workflow components, state taxonomy, and accessibility
  expectations are defined.
- Implementation wait rules and manual-gate reminders are explicit.
- Textual substitute reference is identified for derivative admin screens.
- Remaining screenshot/Figma/taste approval blockers are named precisely.
- No runtime, API, OpenAPI, generated-client, schema, auth/security, storage,
  money, deployment, provider, backup/restore execution, exposure, or secret
  change is authorized.
