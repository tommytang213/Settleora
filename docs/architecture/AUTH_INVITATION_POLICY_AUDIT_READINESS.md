# Auth Invitation Policy And Audit Readiness

## Purpose

This document records the Day 1 invitation policy, capability-state, and audit
readiness checkpoint for GitHub issue
[#784](https://github.com/tommytang213/Settleora/issues/784).

It is a documentation/control gate before invitation OpenAPI, generated-client,
runtime, delivery, and UI work. It does not implement or authorize endpoint
handlers, raw invitation secret generation or validation, schema/migration
changes, OpenAPI paths or schemas, generated-client refreshes, email/provider
delivery, invitation-link templates, mobile/user-web/admin UI, Figma artifacts,
deployment/config/secrets, or production/public exposure.

Current repository state includes the additive `auth_invitations` persistence
foundation from PR #790. That foundation stores only
`invitation_secret_hash` plus `invitation_secret_hash_version`, constrains
contact identifier kind to `email`, constrains target system role to `user`,
and tracks pending/accepted/revoked/expired lifecycle timestamps. Runtime
policy, OpenAPI, generated clients, delivery, and UI remain future reviewed
slices.

## Day 1 Capability Posture

Invitations are a Day 1 available product capability. They must remain default
disabled/off until an authenticated system owner or authorized system admin
explicitly enables the capability through reviewed owner/admin policy.

The broader Day 1 onboarding posture remains unchanged:

- Invitations, public self-registration, local accounts, and OIDC/Keycloak are
  Day 1 available capabilities.
- Risky auth entry capabilities default off or disabled until owner/admin
  policy explicitly enables them.
- Setup-only first-owner local bootstrap remains separate, is allowed only
  while no auth account exists, and must not become public registration.
- Public self-registration is a separate default-off #786 gate.
- OIDC/Keycloak is a separate default-disabled #787 gate and must not store raw
  provider tokens in ordinary auth/profile tables.
- Local-account and admin-created-user hardening remains a separate #788 gate.
- Owner/admin role assignment and lockout protection remains a separate #785
  gate.

Enabling invitation capability is a security-impactful policy change and must
emit a safe auth audit event. Disabling invitation capability must prevent new
invitation creation and send/resend attempts. Disabling the capability does not
silently broaden public registration, alter first-owner bootstrap, grant
owner/admin roles, or revoke already accepted accounts. Future runtime must
define whether pending invitations remain redeemable after disablement; the
safe default for runtime planning is fail closed until owner/admin policy
explicitly allows pending-invite grace behavior.

## Authorization Boundaries

Invitation lifecycle operations are API/domain auth-service responsibilities.
Clients, hidden UI controls, generated-client methods, cached admin settings,
or email-link possession must not authorize invitation actions.

Required authorization posture before runtime:

- Create invitation: system owner/admin only, and only when invitation
  capability is enabled by policy.
- List invitations: system owner/admin only. Responses must be bounded and must
  not include raw invitation secrets, raw links, request bodies, provider
  payloads, session tokens, password material, or audit internals.
- Revoke invitation: system owner/admin only. Runtime must record the actor and
  reject revocation of accepted or already-terminal invitations with a stable
  safe problem category.
- Resend invitation: system owner/admin only, capability-enabled, and limited
  to pending, unexpired invitations. Resend must not create a second pending
  invitation for the same normalized email.
- Policy enable/disable and policy mutation: system owner/admin only. Future
  #785 lockout protection must ensure auth-method policy changes cannot leave
  all owners/admins without a viable authentication path.
- Accept/redeem invitation: public unauthenticated transport may be needed, but
  possession of the raw invitation secret only proves the bearer can attempt
  redemption. The API must still validate status, expiry, revocation, policy,
  single-use state, password/local/OIDC policy, abuse controls, and account
  creation rules server-side.

For #784, invitations target only the system `user` role. Owner/admin
invitation, owner/admin role elevation, privileged invite templates, and
invitation-based owner/admin recovery are explicitly excluded. Those concerns
belong to #785 and related recovery gates.

## Contact Identifier Policy

The current invitation schema allows only `email` as
`contact_identifier_kind`. Future #784 runtime should keep email as the only
supported contact identifier unless a later design expands the schema and
delivery model.

Email identifiers must be normalized consistently before duplicate checks and
storage. API responses and audit metadata should avoid exposing full submitted
email values unless a later reviewed admin readout policy approves a bounded
display form. Suggested safe display posture is a redacted or partially masked
contact label for admin list surfaces and no contact label in public
accept/redeem failures.

## Lifecycle, Idempotency, And Cleanup

Invitation states remain:

- `pending`
- `accepted`
- `revoked`
- `expired`

Pending invitations must have a server-controlled expiry. Expiry duration
should be product policy, not client-provided authority. A future default can be
short enough for safe onboarding and long enough for self-hosted use; exact
duration belongs to the runtime policy slice.

Lifecycle rules before runtime:

- Create is idempotency-aware. Reusing an idempotency key for the same actor,
  normalized email, target role, and policy context may return or safely
  describe the existing pending invitation; reuse with conflicting digest must
  fail closed.
- Duplicate pending invitations for the same normalized email are not allowed.
  A create request for an already pending email should return the existing safe
  summary or a stable conflict category without returning raw secret material.
- Accepted, revoked, or expired invitations are terminal for redemption.
- Acceptance is single-use and must be transactional with account/profile/
  identity/credential creation where that creation is part of the approved
  runtime slice.
- Revocation records the revoking actor and timestamp and must make the
  invitation non-redeemable immediately.
- Expiry may be evaluated lazily during reads/redeem attempts or by a cleanup
  job, but public behavior must treat expired material as invalid without
  revealing whether it was once valid.
- Cleanup may remove or compact terminal invitation rows only after retention
  policy allows it. Cleanup audit must summarize counts and status categories,
  not raw contacts or secret hashes.

## Raw Secret And Link Handling

Invitation raw material is credential-like secret material.

Required posture:

- Store only a non-reusable hash plus hash-version metadata at rest.
- Generate raw invitation secrets with a cryptographically secure random source
  in the future runtime slice.
- Return or hand off raw invitation material only at the creation/delivery
  boundary that needs to construct or send the invite link.
- Never return raw invitation secrets or links from list, read, resend status,
  audit, logs, metrics, traces, reports, generated examples, or admin readback
  APIs.
- Never store raw invitation links, codes, tokens, request bodies, email bodies,
  SMTP provider payloads, session tokens, refresh credentials, password
  material, OIDC tokens, MFA/passkey/recovery material, storage paths, or money
  fields in invitation rows or audit metadata.
- Treat invitation links as bearer material for redemption attempt only. The
  link is not a signed-in session and must not grant access to unrelated API
  data.

Resend should either generate a new raw secret and atomically replace the
stored hash for a still-pending invitation, or reuse a still-valid delivery
boundary only if a later reviewed policy proves that no raw secret is persisted
to make reuse possible. The safer default is rotate-on-resend.

## Audit Event Families

Invitation audit writes belong in API/domain auth services. Audit existence
does not automatically create notifications; notification source policy remains
separate.

Future runtime should define stable auth audit action families for:

- `invitation.policy_changed`
- `invitation.created`
- `invitation.send_queued` or equivalent delivery-boundary decision
- `invitation.sent` where a provider attempt is actually accepted
- `invitation.send_failed`
- `invitation.resent`
- `invitation.revoked`
- `invitation.expired`
- `invitation.accepted`
- `invitation.accept_failed`
- `invitation.cleanup_completed`

Names above are design-level families until a later implementation slice fixes
event constants.

Allowed safe metadata categories include:

- invitation ID;
- lifecycle status and status transition category;
- target system role category, currently only `user`;
- contact identifier kind, currently only `email`;
- optional redacted contact display category if a future policy approves it;
- actor auth account/profile IDs for owner/admin operations when safely
  resolved;
- resulting subject auth account/profile IDs after successful acceptance;
- expiry bucket or timestamp where already stored as invitation state;
- delivery channel state category such as `not_configured`, `queued`, `sent`,
  or `failed`;
- bounded provider-readiness category without provider internals;
- idempotency outcome category;
- correlation/request/job IDs where already safe for audit linkage.

Forbidden audit metadata includes raw invitation secrets, raw links, secret
hashes, submitted full emails unless later explicitly approved, passwords,
password hashes/verifiers, session or refresh tokens, OIDC provider tokens or
payloads, MFA/passkey/recovery secrets, request/response bodies, SMTP
credentials, email bodies, provider diagnostics, storage paths/object keys,
money fields, and unrelated user data.

## Anti-Enumeration And Abuse Posture

Invitation create/list/revoke/resend are authenticated owner/admin operations,
but they still need abuse and privacy controls. Owner/admin create should not
become a global user directory or contact verifier. Public accept/redeem must
be enumeration-resistant.

Required posture before runtime:

- Public redeem failures must use generic problem categories for unknown,
  malformed, expired, revoked, accepted, disabled-by-policy, unsupported,
  policy-denied, throttled, and already-consumed material where distinguishing
  the state would help attackers.
- Public redeem must be rate-limited by source bucket and secret/material
  fingerprint category before expensive account or credential work where
  practical.
- Create/resend must be rate-limited per actor/admin and normalized contact
  category to avoid accidental or abusive email floods.
- Runtime must not reveal whether a submitted email already has an account,
  already has a pending invitation, is OIDC-only, is disabled, or is otherwise
  unavailable except through an authenticated admin-safe readout that has been
  explicitly designed.
- Delivery failures must not be represented as successful invitation delivery.
- Repeated accepted/revoked/expired redemption attempts may be audit-worthy
  only as bounded categories; they must not leak raw material or contact data.

## Email And Provider Boundary

Invitation delivery is related to, but not implemented by, the existing SMTP
email provider policy. SMTP/provider readiness, disabled/unconfigured states,
secret handling, no-fake-success behavior, and privacy-safe template rules from
[SMTP email provider policy](SMTP_EMAIL_PROVIDER_POLICY.md) apply to future
invitation email delivery.

Invitation email differs from ordinary notification email because the link
contains bearer invitation material. Therefore:

- Invitation links are allowed only in the explicit delivery boundary for a
  pending invitation.
- The raw link must not be copied into audit metadata, delivery-state rows,
  provider diagnostics, reports, or API readbacks.
- Email unconfigured, disabled, failed, deferred, or queued state must remain
  explicit and must not be collapsed into "sent".
- Password-reset SMTP boundaries remain separate. Invitation material must not
  reuse password-reset token tables, reset email templates, reset audit event
  names, or reset abuse counters unless a later design deliberately shares a
  lower-level safe delivery helper without sharing credential semantics.

## Relationship To Related Gates

- #786 public self-registration: separate Day 1 default-off capability.
  Invitation acceptance must not silently enable public registration.
- #787 OIDC/Keycloak: separate Day 1 default-disabled provider capability.
  Invitation acceptance may later support provider-backed onboarding only after
  OIDC account-linking policy is reviewed; raw provider tokens stay out of
  ordinary auth/profile tables.
- #788 local-account/admin-created-user hardening: separate policy gate for
  local-account enablement and initial credential handoff. Invitation
  acceptance must honor local-account policy where it creates local credentials.
- #785 owner/admin role and lockout protection: separate privileged role and
  auth-method lockout gate. #784 invitation targets remain `user` only.
- #464/#465 admin UI and Figma/reference: admin settings, warnings, policy
  readouts, invitation list/create/revoke/resend UI, and auth-security policy UI
  require Figma/reference before implementation.
- #777 public-exposure security review: public accept/redeem routes and admin
  exposure remain manual-gated for hostile-traffic, HTTPS/origin, logs/audit,
  rate-limit, config, and secret posture.

## Future Split Order

Recommended #784 order after this checkpoint:

1. OpenAPI/schema contract gate for invitation policy readout/mutation,
   owner/admin create/list/revoke/resend, and public accept/redeem request
   shapes. Regenerate clients only from the reviewed contract.
2. Runtime policy service and authorization gate for default-off capability,
   owner/admin checks, user-only target role, duplicate pending invitation, and
   safe audit writes.
3. Raw invitation secret generation, hash verification, single-use redemption,
   expiry/revocation, idempotency, and cleanup runtime.
4. Email/provider delivery and invitation link construction, using SMTP
   provider boundaries and no-fake-success state reporting.
5. Admin/user-web/mobile UI and Figma/reference work after contract/runtime and
   design references are approved.

Each future split must run validation matching its changed surface and must not
claim Day 1 invitation capability complete until policy, contract, runtime,
delivery, UI, audit, abuse, and related gate posture are all satisfied.
