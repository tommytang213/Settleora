# Privacy Vault Architecture

## Purpose

This document defines Settleora's privacy-vault architecture for Day 1 and future privacy hardening.

Settleora must protect sensitive user data without turning the first release into a full zero-knowledge accounting system. The Day 1 goal is to support:

- Standard Secure Mode for most users.
- Recoverable Private Vault for selected sensitive data.
- A future-compatible path to Strict Private Vault.

This document does not authorize implementation by itself. It defines architecture, data boundaries, recovery behavior, non-goals, and future implementation candidates.

## Product Decision

Day 1 supports two privacy modes:

```text
standard_secure
recoverable_private_vault
```

Future architecture must remain compatible with:

```text
strict_private_vault
```

Day 1 must not require users to manually copy encryption keys between devices. Device onboarding should use trusted-device approval, recovery flow, or server-assisted rewrap depending on privacy mode.

## Privacy Mode Summary

| Mode | Day 1 | Recoverable | Host-resistant | Intended users |
|---|---:|---:|---:|---|
| `standard_secure` | Yes | Yes | No | Most users |
| `recoverable_private_vault` | Yes | Yes | Partial, not strict | Users who want stronger privacy without unrecoverable data loss |
| `strict_private_vault` | Future | No unless recovery key/trusted device exists | Stronger | Advanced users who accept key-loss risk |

### Standard Secure Mode

Standard Secure Mode is the default.

Characteristics:

- Server-managed encryption at rest.
- Admin-private app authorization.
- API-controlled file access.
- Encrypted deployment/storage/backups guidance.
- Server operator remains trusted at infrastructure level.
- Account recovery restores normal server-mode data access.

### Recoverable Private Vault

Recoverable Private Vault protects selected sensitive data while still allowing account-recovery-based vault recovery through controlled server-assisted recovery.

Characteristics:

- Selected sensitive fields/files are encrypted using user-vault/key-envelope architecture.
- App admins cannot view vault content through normal admin UI.
- Server-side recovery envelopes can recover or rewrap vault keys after strong account verification.
- This is not strict zero-knowledge. The recovery system is a trusted recovery path.
- Recommended for users who want stronger privacy but cannot risk permanent data loss.

### Strict Private Vault Future Mode

Strict Private Vault is future-only.

Characteristics:

- Server recovery envelope is removed or disabled.
- Vault access requires trusted devices or a user-held recovery key.
- If all trusted devices and recovery keys are lost, strict-vault data is unrecoverable.
- OIDC/local account recovery restores account access only, not vault data.
- Converting Recoverable to Strict must rotate/revoke recovery envelopes and warn about old backups.

## Data Classification

Suggested sensitivity classes:

```text
normal
sensitive
highly_sensitive
```

### Normal Data

Normal server-managed data includes the core data the API needs for authoritative server-mode behavior:

- bill totals
- currency
- split shares
- settlement state
- payer/payee relationships
- group membership
- sync state
- business audit metadata
- report summary values

Normal does not mean public. It still requires authentication, authorization, server-side validation, audit where required, and encrypted-at-rest deployment.

### Sensitive Data

Sensitive data should be admin-redacted and eligible for Recoverable Private Vault protection:

- receipt images
- receipt thumbnails where practical
- payment QR images
- payment handle/details
- settlement proof files
- private notes
- full OCR raw text if stored
- supporting attachments

### Highly Sensitive Data

Highly sensitive data should default to the strongest available policy:

- statement files/rows when statement reconciliation exists
- exported backup bundles
- recovery envelopes and key metadata
- secret references
- payment proof containing bank/account details

## Encryption Modes

Suggested encryption modes:

```text
server_managed
recoverable_user_vault
strict_user_vault_future
```

### `server_managed`

The server/storage layer manages encryption at rest and can process plaintext at runtime. This supports normal application behavior, reports, server-side validation, search, sync, and settlements.

### `recoverable_user_vault`

Sensitive data is encrypted with client/vault-aware key wrapping, while the server stores a controlled recovery envelope. The server should not expose the content through admin UI, logs, exports, or support screens. Recovery is possible after account verification and audit.

### `strict_user_vault_future`

Sensitive data is encrypted so the server has no recovery envelope. Access requires trusted-device key material or a user recovery key. This is future architecture only.

## What Day 1 Vault Protects

Day 1 Recoverable Private Vault should be limited to selected sensitive content:

```text
payment QR images
payment handle/details
settlement proof files
receipt original images
receipt thumbnails where practical
private notes
full OCR raw text if stored
```

Day 1 Recoverable Private Vault should not protect core financial truth:

```text
bill totals
currencies
merchant summary fields required for reports/search
split shares
settlement states
group membership
audit metadata
sync state
```

The API/domain layer remains authoritative for money, settlement, status transitions, authorization, audit, policy, and server-mode validation.

## Key Model

### User Vault Key

Each user with vault enabled has a vault master key or equivalent vault root key.

The vault key is used to wrap/encrypt per-item data keys. Large files should use per-file data encryption keys rather than encrypting all files directly with the vault key.

### Device Keys

Each trusted device should have its own asymmetric key pair.

```text
device public key: stored on server
device private key: stored only on device secure storage
```

Device private keys should use:

- iOS Keychain / Secure Enclave where available.
- Android Keystore where available.
- Browser storage only with clear limitation warnings for web clients.

The vault key is encrypted for each trusted device.

### Data Keys

Each sensitive file/field may use a random data key.

```text
sensitive data
→ encrypted with data key
→ data key encrypted/wrapped by vault key
→ vault key encrypted for trusted devices and, in recoverable mode, recovery envelope
```

### Key Envelopes

Suggested envelope categories:

```text
device_envelope
recovery_envelope
participant_envelope
recovery_key_envelope_future
```

For shared sensitive files, the file data key should be wrapped for each authorized participant or their vault/device key path.

## Device Onboarding

### Existing Trusted Device Available

Flow:

```text
New device logs in.
New device creates device key pair.
Existing trusted device receives approval request.
User approves on existing device.
Existing device encrypts vault key for new device public key.
New device stores its private key locally and can unlock vault data.
Audit event is emitted.
```

### No Trusted Device Available: Recoverable Mode

Flow:

```text
User completes account recovery or OIDC login with step-up verification.
Recovery policy validates the request.
Recovery envelope is used to rewrap the vault key for the new device.
New device becomes trusted.
Audit event is emitted.
User-visible security notification is sent where available.
```

### No Trusted Device Available: Strict Future Mode

Flow:

```text
User completes account recovery.
Account access is restored.
Vault data remains locked until recovery key is supplied.
If no recovery key exists, strict-vault data is unrecoverable.
```

## Account Recovery And OIDC

Authentication and vault recovery are separate.

OIDC/local account recovery proves identity. It does not automatically prove vault-key possession.

### Standard Secure Mode

Forgot password or OIDC recovery restores account access and normal server-managed data access.

### Recoverable Private Vault

Forgot password or OIDC recovery may participate in vault recovery only through the approved recovery envelope flow, step-up verification, audit, and policy checks.

### Strict Private Vault Future Mode

OIDC/local account recovery restores account access only. It must not recover strict-vault data unless the user provides a recovery key or another trusted device approves.

## Lost Device Behavior

| Case | Standard Secure | Recoverable Vault | Strict Vault Future |
|---|---|---|---|
| Lost one device, has another trusted device | normal login/revoke | trusted-device approval | trusted-device approval |
| Lost all devices, can recover account | normal recovery | recovery-envelope rewrap | account only, vault locked |
| Lost all devices and recovery key | normal recovery | recoverable if envelope enabled | vault data lost |
| New key pair generated | future data works | future data works after recovery | future data only; old data locked unless old key recovered |

Key regeneration cannot decrypt old data if the old vault key is unavailable.

## Recoverable To Strict Future Migration

Users should be allowed to convert from Recoverable Private Vault to Strict Private Vault later.

Flow:

```text
User chooses Convert to Strict.
App checks a trusted device can unlock current vault.
App requires recovery-key setup or explicit no-recovery confirmation.
App rotates vault root key where appropriate.
App rewraps data keys for trusted devices/recovery key only.
App disables/deletes server recovery envelope.
App records audit event.
App warns that older backups may contain recoverable envelopes until retention expires.
```

Important warning:

```text
Older backups may still contain previous recovery envelopes until backup retention expires.
```

## Strict To Recoverable Migration

Users may later choose to re-enable recovery.

Flow:

```text
Trusted device unlocks strict vault.
App creates a new recovery envelope under approved recovery policy.
Mode changes to recoverable_private_vault.
Audit event is emitted.
User is warned this weakens strict host-resistance.
```

## Admin Privacy Rules

System owner/admin roles are operational roles, not blanket financial-content access roles.

Admin UI must not expose by default:

- user expenses/bills not otherwise authorized
- receipt images
- OCR raw text
- payment QR/details
- private notes
- settlement proof
- statement rows/files
- vault contents

Admin support/debug views must use redacted metadata unless a separately reviewed break-glass policy allows more.

Examples of allowed admin metadata:

- user account status
- storage usage
- job/queue status
- failed job metadata without sensitive payload
- health/readiness
- audit summaries
- file size/content type/status without direct content

## Break-Glass Policy

Break-glass content access is not a Day 1 default.

If added later, it must require:

- explicit deployment policy enablement
- owner-level or approved role permission
- reason required
- time-limited access
- audit event
- user-visible access history where practical
- least-data-needed display

Break-glass must not bypass vault-mode promises. In Strict Vault, break-glass cannot decrypt data without user/device key material.

## Backup And Restore

Backups must preserve:

- encrypted file blobs
- database metadata
- key envelopes
- recovery envelopes where mode allows
- audit records
- mode and policy records

Backups must be encrypted.

Backup restore must not silently downgrade privacy mode.

Recoverable-to-Strict migration must warn that older backups may retain recoverable envelopes until retention expiry.

## Local Mode Interaction

Local-only mode does not require server authentication and remains locally authoritative.

Local mode may use device encryption, app PIN, biometric unlock, and local secure storage. Future private-vault concepts may be reused locally, but local mode does not require server recovery envelopes.

Local-to-server import must not silently expose local private data. Import flow must explain whether sensitive imported files become server-managed or recoverable-vault protected.

## Sync And Offline

Offline server-mode edits remain pending until synced and accepted by the API.

For vault-protected sensitive data:

- clients may queue encrypted blobs and metadata offline
- server cannot validate encrypted content details beyond metadata/policy
- API still validates ownership, authorization, allowed attachment type, size, lifecycle state, and subject association
- sync conflict resolution must preserve encrypted blobs and envelopes until resolved

## Audit Events

Audit should cover:

```text
privacy_mode_changed
vault_enabled
vault_disabled
vault_recovery_requested
vault_recovery_completed
vault_recovery_denied
trusted_device_added
trusted_device_revoked
vault_key_rewrapped
recovery_envelope_created
recovery_envelope_revoked
recoverable_to_strict_requested
recoverable_to_strict_completed
strict_to_recoverable_completed
admin_content_access_denied
break_glass_requested
break_glass_approved
break_glass_content_accessed
```

Audit records must avoid raw keys, raw secrets, decrypted content, raw tokens, and unnecessary sensitive payloads.

## API And OpenAPI Direction

Future implementation should expose privacy/vault behavior through OpenAPI, but this architecture document does not authorize OpenAPI changes.

Likely future API categories:

- privacy mode read/update
- trusted devices list/revoke
- new-device approval
- vault recovery initiation/completion
- file/key-envelope metadata
- sensitive file upload/download
- admin redacted metadata views

Generated clients must not be hand-edited.

## Implementation Non-goals

This document does not authorize:

- login implementation
- token issuance
- session middleware
- vault API endpoints
- OpenAPI feature paths
- generated client changes
- UI behavior
- database migrations
- actual encryption implementation
- Strict Private Vault implementation

## Day 1 Acceptance Criteria

Day 1 privacy architecture is acceptable when:

```text
Standard Secure Mode is default.
Recoverable Private Vault is defined for selected sensitive data.
Core financial truth remains server-readable and API-authoritative.
Admin UI is redacted by default.
Storage paths are not exposed.
Sensitive files go through storage abstraction.
Vault recovery behavior is documented.
OIDC/account recovery behavior is documented.
Lost-device behavior is documented.
Recoverable-to-Strict future migration is documented.
Strict Vault is not claimed as implemented.
Audit requirements are defined.
```

## Next Implementation Candidates

Implementation should remain split into focused, reviewable branches:

1. Documentation-only branch adding this architecture and updating references.
2. Storage metadata sensitivity/encryption-mode schema design.
3. Admin redaction policy design.
4. Sensitive file storage/encryption implementation.
5. Privacy mode settings UI/API.
6. Device/key-envelope implementation.
7. Recovery-envelope implementation.
8. Future Strict Vault design review before implementation.
