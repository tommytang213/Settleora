# Push Token Protection Design

## Purpose

This document defines the #634 A2 Option C token-protection design gate for
future mobile push device-token lifecycle work.

It complements [Push provider device-token lifecycle](PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md).
That document defines the provider-neutral token lifecycle and proposed future
API shape. This document narrows how Settleora must protect push token material
before any schema, OpenAPI, generated-client, API, mobile, provider, or hosted
runtime implementation stores or uses provider-send token material.

This is a docs/control architecture design only. It does not authorize runtime
implementation, database schema changes, migrations, OpenAPI changes,
generated-client changes, mobile code, APNs/FCM setup, provider sending,
hosted activation, deployment/env changes, CI changes, UI/Figma work, auth
runtime changes, storage/file-byte runtime changes, backup/restore runtime
changes, or secrets.

## Threat Model And Classification

Push provider tokens are provider-usable sensitive secrets, not user-readable
app data. A raw APNs, FCM, or future provider token can be used by an approved
provider sender to address a device or app install. If compromised alongside
provider capability, token material can support unauthorized push delivery,
device/app correlation, installation tracking, account/device mapping, or
abuse against a user's notification surface.

Token material is excluded from normal API, readout, log, audit, telemetry,
report, issue, PR, docs example, generated-client example, screenshot, and
test snapshot paths. Ordinary users and admins do not need to read token
values. Support and diagnostics should use bounded lifecycle categories and
safe metadata only.

Use these terms consistently in future implementation tasks:

| Term | Meaning | Exposure posture |
| --- | --- | --- |
| Raw provider token | The APNs, FCM, or other provider token submitted by an authenticated app install and needed for future provider send. | Write-only request input; transient in server memory during registration and authorized provider send only. |
| Protected token blob | Ciphertext, sealed blob, or protected secret reference that can recover the raw token only through an approved server-side protection boundary. | Sensitive internal storage only; never normal API/readout/log/audit output. |
| Token fingerprint | Purpose-bound keyed fingerprint, HMAC, or equivalent safe correlation value derived from token material. | Internal dedupe/idempotency/correlation only; not provider-send material and not client-visible by default. |
| Provider feedback category | Bounded classification of provider outcomes, such as `invalid_token`, `not_registered`, `rate_limited`, or `credential_invalid`. | Safe category only; no raw provider request/response payloads. |

## Storage And Protection Posture

The approved target posture for future implementation is fail-closed token
protection.

Raw token material must not be stored in plaintext normal read paths. It may
exist only transiently:

- during authenticated token registration/replacement;
- during token rotation/supersession processing;
- during an authorized provider-send attempt through the approved server-side
  provider boundary;
- during a narrowly scoped re-encryption or migration operation approved by a
  later protected-storage gate.

Durable provider-send capability requires protected storage, such as
encryption, sealing, envelope protection, or an equivalent approved
server-side protected-storage abstraction. The abstraction must keep token
unseal/decrypt operations inside the API/domain or provider-send boundary and
must not expose raw token material to normal repositories, query projections,
logs, audit metadata, API response models, generated clients, admin readouts,
or reports.

If no approved encryption, sealing, or protected-storage abstraction exists
when future A2 implementation starts, the implementation must stop before
storing raw tokens. The next safe choices are:

- implement fingerprint-only lifecycle metadata with no provider-send
  capability; or
- create a separate explicit protected-storage abstraction gate before any raw
  token storage.

Key-management expectations:

- no keys, credentials, provider secrets, or realistic token material in repo
  files, migrations, seed data, docs, issues, PRs, logs, reports, or generated
  clients;
- production key material is supplied only through an approved deployment or
  secret boundary, never through source control;
- local/dev/test uses fake placeholders or deterministic fake protectors only;
- key identifiers, protection versions, and rotation status may be stored as
  safe metadata, but key values and decrypted token values may not;
- startup must fail closed or mark provider-send unavailable when required
  protection material is missing.

Rotation and re-encryption remain design-level only in this task. Future
implementation should store enough safe metadata to support protection version,
key identifier, sealed-blob format version, created/updated timestamps, and
future re-encryption status. Rotation should allow reading old protected blobs
while writing new blobs with the current protection version during an explicit
maintenance or registration flow. Suspected key compromise requires a separate
incident/rotation plan and must not silently decrypt tokens into logs,
exports, or audit events.

## Fingerprinting And Dedupe Policy

Future token lifecycle implementation should use a purpose-bound keyed
fingerprint or equivalent safe correlation value for dedupe, idempotency,
token-refresh detection, stale cleanup, and audit-safe support correlation.

Fingerprint rules:

- derive with a server-side key or deployment-bound secret that is separate
  from provider credentials and not stored in repo files;
- bind purpose and deployment/provider environment so values cannot be safely
  compared across unrelated deployments, exports, or contexts;
- do not use a plain unsalted hash;
- do not use the fingerprint for provider send;
- do not expose the fingerprint in ordinary client APIs or admin readouts
  unless a future explicit readout approves a redacted internal correlation
  value;
- treat fingerprints as sensitive internal metadata even though they should not
  allow recovery of raw tokens.

Recommended future uniqueness posture:

- unique active fingerprint within one deployment/provider/app environment;
- at most one active token binding per authenticated
  user/profile/platform/provider/device-installation identity where that
  identity is approved;
- idempotency key uniqueness for accepted registration attempts where clients
  retry;
- indexes for current-user active lookup, session-linked revocation,
  stale-cleanup scans, and provider feedback cleanup.

Fingerprint collision or conflicting ownership must fail closed. A collision
or same-fingerprint registration under another unrelated account/profile must
not silently link one token to multiple users. Future runtime may return a safe
`token_conflict` or generic validation problem, revoke/supersede according to
an explicit account-transfer policy, or require re-registration after user
intent. It must not echo the token, fingerprint, ciphertext, account existence,
or provider internals.

## API And Read Path Policy

Future token lifecycle APIs must be current-user/authenticated-session scoped.
Client-submitted user IDs, profile IDs, account IDs, session IDs, or role
labels are never authority.

Registration policy:

- the register/replace endpoint receives token material and never returns it;
- registration requires an authenticated `SettleoraSession` and a current
  profile/account derived server-side;
- registration should bind to safe platform, provider, app environment,
  permission state, and device/session metadata approved by the lifecycle
  design;
- the response returns only safe lifecycle metadata, such as server-issued
  binding ID, platform, provider, permission state, status, last seen, and
  whether a prior binding was replaced.

Revocation policy:

- revocation may accept the current token, a current-device/session identity,
  or a safe server-issued binding ID depending on the future contract;
- revocation requires authenticated session/profile context;
- revocation is idempotent and never returns token values;
- deleting an already revoked, missing, stale, or unknown token returns only a
  safe result or generic problem category.

Readout policy:

- ordinary readout, if approved later, returns only redacted lifecycle status:
  platform, provider, device label class, permission state, last seen,
  registered/revoked/stale timestamps where safe, and status categories;
- ordinary readout must not return raw token, protected blob/ciphertext,
  fingerprint, provider request/response payloads, provider credentials,
  storage paths, signed URLs, private notification content, or internal
  protection metadata beyond safe version/category fields;
- client-visible errors must not echo token values or reveal whether a
  particular raw token exists under another account;
- clients cannot decide authorization, business access, account security, or
  source state from token/device state.

Opening a push notification must always re-fetch notification detail and
linked resources through authorized API paths. Token possession, permission
state, or push delivery state is not authorization.

## Logs, Audit, Telemetry, And Tests

Logs, audit, telemetry, traces, metrics, diagnostics, validation output,
reports, issue comments, PR bodies, generated docs, and test snapshots must not
include:

- raw token values;
- protected token blobs, ciphertext, secret references, or decrypted material;
- token fingerprints unless a future explicit policy allows a bounded internal
  redacted correlation value;
- provider request payloads or response internals;
- APNs/FCM credentials, private keys, certificates, sender IDs where
  sensitive, app secrets, or dashboard values;
- auth/session tokens, refresh credentials, reset/recovery codes, MFA/passkey
  material, or provider auth payloads;
- storage paths, object keys, signed URLs, local paths, or file bytes;
- raw OCR/receipt text, payment details, proof contents, hidden bill details,
  private notes, or unrelated user data.

Audit may record safe lifecycle categories such as:

- `registered`;
- `rotated`;
- `superseded`;
- `revoked`;
- `stale_marked`;
- `stale_cleaned`;
- `provider_invalidated`;
- `provider_unconfigured`;
- `permission_denied`;
- `provider_feedback_classified`;
- `protected_storage_unavailable`.

Allowed audit/log metadata is limited to actor/profile/session correlation
where already safe, server-issued binding ID, platform, provider family, app
environment category, lifecycle status, bounded reason category, timestamps,
request/correlation IDs, and protection version/category where needed for
operations.

Tests may use dummy token placeholders, but they should avoid realistic APNs,
FCM, Firebase, Expo, OneSignal, or vendor token shapes where possible. Prefer
obvious values such as `<mobile-push-device-token-placeholder>` or
`dummy-token-for-redaction-test`. Future tests should assert that API
responses, logs, audit records, telemetry payloads, problem details, result
objects, generated examples, and snapshots do not leak raw tokens, protected
blobs, fingerprints, provider payloads, or secrets where feasible.

## Backup, Restore, And Local Mode

Browser-local state and mobile local cache have no restore authority over
server push tokens. A local backup, local restore, import/export package,
server-mode cache, generated client, or restored local profile must not create
active provider-send capability by itself.

Backup package policy:

- raw push tokens must not be exposed in backup/export packages by default;
- protected token blobs are sensitive and must not be included unless a future
  backup/restore design explicitly proves key compatibility, protection
  versioning, restore authority, revalidation, and failure behavior;
- token fingerprints should not be exported by default because they can
  support correlation;
- provider credentials and APNs/FCM secrets are never package content.

Restore policy:

- restored tokens may be invalid, stale, device-bound, provider-environment
  bound, app-install bound, or unsafe to reactivate;
- restored push token records should default to requiring re-registration
  unless a future explicit protected-storage/key-compatibility design approves
  otherwise;
- restore apply must be API/domain-authoritative and must revalidate
  authenticated session, current profile, scope, provider environment, device
  state, and protection capability before any token can become active;
- restore must not silently create provider-send capability, mutate auth
  sessions, authorize linked resources, or treat local device state as server
  truth;
- if protected blobs are incompatible with current keys or protection version,
  restore must fail closed or mark the token inactive/stale with a safe problem
  category such as `protected_token_unavailable` or
  `re_registration_required`.

No browser-local or local-only state may act as token authority for server
mode. Local-only profiles can have local notification preferences or device
state later, but they cannot assert server push token validity or ownership.

## Provider And Runtime Boundary

A2 token lifecycle APIs do not approve provider sending. A3 provider runtime
remains disabled/unconfigured by default until separately approved.

Provider-send policy:

- APNs/FCM secrets, provider accounts, certificates, keys, sender IDs,
  provisioning, bundle/package linkage, deployment/env values, hosted
  activation, and release configuration remain separate gates;
- provider send may read/decrypt token material only through the approved
  server-side boundary and only for an API/domain-authorized delivery attempt;
- provider adapters must not decide authorization, notification recipient
  eligibility, money truth, settlement state, OCR acceptance, sync acceptance,
  storage access, audit truth, or source business state;
- provider feedback must be classified into safe categories only, such as
  `accepted`, `invalid_token`, `not_registered`, `expired_token`,
  `permission_denied`, `credential_invalid`, `rate_limited`,
  `provider_unavailable`, `payload_invalid`, `retryable_failure`, or
  `non_retryable_failure`;
- raw provider response payloads must not be persisted or exposed;
- missing, disabled, unconfigured, queued, deferred, stale, denied,
  invalid-token, retryable failure, or provider-unavailable states must not be
  represented as fake `sent` or `delivered` success.

Provider acceptance is not proof the user saw a notification. In-app
notification state and linked-resource authorization remain separate.

## Future A2 Stop Conditions

Future A2 implementation must stop and report without merging if any of these
conditions are true:

- no approved token-protection abstraction exists and Option A would store raw
  token material for future provider send;
- implementation would store raw tokens in plaintext normal read paths;
- implementation would expose raw token, protected blob/ciphertext,
  fingerprint, provider payload, or protection secrets in API responses,
  OpenAPI examples, generated clients, logs, audit, telemetry, readouts,
  reports, docs, issues, PRs, or tests;
- generated clients expose secret material or encourage token readback;
- backup/restore semantics for token material are unresolved for the chosen
  storage approach;
- auth/session/profile binding or revocation scope is unclear;
- migration would be destructive or broad beyond the approved additive token
  lifecycle scope;
- provider runtime, mobile UI, mobile release configuration, APNs/FCM setup,
  hosted activation, #371 deep links, admin/global policy/readout, public/admin
  exposure, or unrelated business runtime sneaks into A2.

## A2 Option A Implementation Checkpoint

The current repository now includes the #634 A2 Option A server-side token
lifecycle API foundation. It uses a push-specific server protection boundary
for stored token material, a configured HMAC fingerprint boundary for
dedupe/correlation, authenticated current-user registration/revocation
endpoints, and safe lifecycle response metadata only.

This implementation checkpoint does not add APNs/FCM provider sending,
provider credentials, hosted workers, mobile app registration UI, #371 deep
links, admin/global notification policy readout, or provider-success states.
Raw token material remains write-only request input and is not returned in API
responses. Protected blobs and fingerprints remain internal persistence
metadata and are not ordinary readout fields.

## Future Implementation Options

Future #634 implementation remains split:

| Option | Direction | Capability |
| --- | --- | --- |
| Future A2 Option A | Store protected raw token material plus fingerprint and lifecycle metadata. | Allows later provider-send capability only if an approved protected-storage boundary exists or is implemented behind a separate explicit gate. |
| Future A2 Option B | Store fingerprint and lifecycle metadata only, with no protected raw token secret. | Safer interim if protection is unavailable; cannot support actual provider send until a later protected-token migration/registration flow. |
| Future A3 | Provider-neutral push send runtime. | Disabled/unconfigured by default; provider secrets, hosted activation, and APNs/FCM remain separate gates. |
| Future A4 | Mobile registration and permission UX. | Requires mobile/Figma/reference validation, generated-client availability, platform permission review, and separate mobile build/release gates. |

#371 notification deep links remain separate and Figma/reference-gated.

## Validation Expectations For Future Implementation

Future implementation tasks should add tests and checks appropriate to the
changed surface:

- authenticated registration and revocation derive ownership from the current
  session/profile;
- idempotent registration and token rotation do not leak token values;
- raw token values do not appear in API responses, problem details, logs,
  audit, telemetry, or snapshots;
- protected blobs and fingerprints are absent from ordinary readouts and
  generated clients;
- provider-send code, if later approved, can access decrypted token material
  only through the approved server-side protection boundary;
- missing protection keys or provider configuration fail closed without fake
  success;
- backup/restore either excludes token material or marks restored tokens
  inactive/re-registration-required under the approved policy;
- OpenAPI/generated-client diffs contain only write-only token input and safe
  lifecycle output;
- schema changes are additive and contain no plaintext token columns in normal
  read paths.
