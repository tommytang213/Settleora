# Auth MFA/Passkey Security Regression Matrix

This matrix tracks the focused QA/security regression coverage for issue #506 after the #501-#505 auth MFA/passkey implementation stream. It is a QA control artifact plus automated-test index; it does not close the parent tracker #394 or the UI/admin reference gates #417 and #465.

## Scope Guard

Covered surfaces:

- Passkey/WebAuthn enrollment, sign-in, credential management, and step-up challenge behavior.
- TOTP enrollment, challenge verification, factor management, and setup-material redaction boundaries.
- Recovery-code display-once generation, verifier-only persistence, one-time use, and replay rejection.
- Auth security policy readouts, support-mode enforcement, and server-side step-up/session freshness.
- Auth audit metadata and response/storage redaction expectations for MFA/passkey flows.

Out of scope:

- Mobile, user web, admin web, Figma/reference, generated-client, OpenAPI, schema/migration, deployment, Docker, CI, production config, secrets, storage/file-byte, money, settlement, payment, bill-calculation, OCR, notification, or broad product runtime changes.

## Regression Rows

| Area | Expected protection | Automated coverage | Manual/remaining coverage | Issue refs |
| --- | --- | --- | --- | --- |
| Passkey enrollment challenge | Persist verifier/hash only, bind account/session/purpose, reject mismatched, expired, consumed, or replayed challenge completion. | `PasskeyRuntimeServiceTests`; `AuthMfaPasskeySecurityRegressionTests.PasskeyRegressionRejectsMismatchedChallengeWithoutAuditOrStoragePayloadLeak`. | Browser/platform authenticator UX and cross-origin manual checks remain UI/reference-gated. | #503, #505, #506, #417 |
| Passkey credential material | Store public-key material needed for verification and hashed lookup; never expose raw credential IDs, private material, full authenticator payloads, or raw challenges in audit/problem details. | `PasskeyRuntimeServiceTests`; `AuthMfaPasskeySecurityRegressionTests`. | Real authenticator attestation policy review remains manual/security review. | #503, #506 |
| Passkey sign-in and step-up | Sign-in is public only at ceremony boundaries; step-up is authenticated, session/account/operation bound, short-lived, and token-free in response DTOs. | `PasskeyRuntimeServiceTests.SignInAssertionUpdatesCounterAndReturnsTokenFreeCurrentUserSummary`; `AuthSecurityPolicyServiceTests`; `AuthMfaPasskeySecurityRegressionTests.PolicyStepUpRegressionDeniesWrongSessionFreshnessWithoutSensitiveAuditLeak`. | End-to-end UX prompt timing and admin-sensitive operation selection remain future UI/admin scope. | #503, #505, #506, #417, #465 |
| TOTP enrollment setup | Raw setup material is allowed only in enrollment-begin response; protected secret storage must not contain the manual entry key in plaintext; list/read/audit responses must omit provisioning URI, manual key, and OTP values. | `TotpMfaRuntimeServiceTests`; `AuthMfaPasskeySecurityRegressionTests.TotpRegressionHidesProvisioningMaterialAfterEnrollmentBeginAndFailedOtpAudit`. | QR rendering, clipboard/download behavior, and user education remain UI/reference-gated. | #504, #506, #417 |
| TOTP challenge failure paths | Wrong code, expired enrollment/challenge, revoked factor, consumed/replayed challenge, and unsupported policy states fail closed without leaking submitted OTP values. | `TotpMfaRuntimeServiceTests`; focused `Mfa`/`Totp` validation filters. | Rate-limit and abuse tuning review remains security/manual-gated. | #504, #505, #506 |
| Recovery-code generation | Raw recovery codes are display-once only; metadata reads omit raw codes; persistence uses verifier/hash/salt only. | `RecoveryCodeRuntimeServiceTests.RecoveryCodesDisplayOnceAndPersistVerifierOnlyMaterial`; `AuthMfaPasskeySecurityRegressionTests.RecoveryRegressionShowsCodesOnceThenHidesRawCodesVerifierMaterialAndReplayDetails`. | Printable/downloadable recovery-code UX and storage guidance remain UI/reference-gated. | #504, #506, #417 |
| Recovery-code use and replay | A successful recovery-code verification consumes exactly one unused verifier, decrements remaining count, and rejects reuse without revealing whether a code was valid, used, close, or owned by another account. | `RecoveryCodeRuntimeServiceTests.RecoveryCodeVerificationConsumesCodeAndRejectsReplay`; `AuthMfaPasskeySecurityRegressionTests`. | Account recovery/admin reset policy UX remains #465. | #504, #506, #465 |
| Policy support modes | Passkey, TOTP, and recovery-code surfaces consult server-side active policy/defaults and deny disabled/unsupported factor paths without client authority. | `AuthSecurityPolicyServiceTests`; #505 focused passkey/MFA runtime tests. | Admin policy editing/audit UI remains #465 and Figma/reference-gated. | #505, #506, #465 |
| Step-up freshness | Sensitive factor/credential/recovery mutations require fresh server-side assurance for owner/admin-sensitive operations; wrong session, wrong operation, expired, missing, and invalid consumed state fail closed. | `AuthSecurityPolicyServiceTests.FreshnessRejectsAccountSessionOperationExpiryAndInvalidConsumedState`; `AuthMfaPasskeySecurityRegressionTests.PolicyStepUpRegressionDeniesWrongSessionFreshnessWithoutSensitiveAuditLeak`. | Final sensitive-operation inventory for admin/user UI remains manual/admin-gated. | #505, #506, #465 |
| Audit/log/problem redaction | Audit metadata, validation output, and problem responses must not include raw OTP values, TOTP seeds, provisioning URI/manual entry keys outside enrollment begin, raw recovery codes after display-once, recovery verifier/salt/hash material, raw WebAuthn payloads/challenges/credential IDs, bearer/refresh/session tokens, passwords, secrets, provider payloads, or full sensitive request bodies. | `AuthMfaPasskeySecurityRegressionTests`; existing sign-in/session/file privacy redaction tests; required validation-log secret scan. | Human code review should spot-check new auth audit keys and any future logging middleware changes. | #503, #504, #505, #506 |
| Authorization baseline | All MFA/passkey management/read endpoints require bearer auth except intentional public sign-in/challenge ceremony boundaries. | `AuthenticatedApiPolicyBaselineTests`. | Browser/mobile/web route visibility remains UI/reference-gated and cannot be treated as authorization. | #502, #503, #504, #506, #417 |

## Required #506 Validation Profile

Run from the repo root:

```bash
npm run doctor:validation
npm run validate:api-local
dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore --filter FullyQualifiedName~Passkey
dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore --filter FullyQualifiedName~Totp
dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore --filter FullyQualifiedName~Recovery
dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore --filter FullyQualifiedName~StepUp
dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore --filter FullyQualifiedName~Policy
dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore --filter FullyQualifiedName~AuthenticatedApiPolicyBaselineTests
npm run validate:docs
npm run validate:scaffold
```

Also save validation logs and scan them for secret-bearing output before reporting:

```bash
rg -n "warning|Warning|WARN|NU[0-9]+|MSB[0-9]+|secret|seed|recovery code|otp|provisioning|token|password|credential|challenge" /tmp/settleora-*.log || true
```

## Gate State

- #506 remains open after this task and should move only to `PR Ready` with progress updated to 80%.
- #394 remains open/incomplete as the parent tracker.
- #417 remains open/incomplete for mobile/user-web MFA/passkey UX references.
- #465 remains open/incomplete for admin auth/MFA/passkey/session security policy management.
