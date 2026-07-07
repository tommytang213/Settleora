# Auth Password Reset Public Route Exposure Preflight

## Purpose

This docs/control preflight reviews whether Day 1 public runtime mapping is
ready for:

- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/complete`

This document does not expose routes, change API behavior, change OpenAPI or
generated clients, add notification runtime, add SMTP provider configuration,
change schema/migrations, add UI, or change auth/session/security runtime.

## Current-State Readback

- Live PR #757 readback verified `MERGED` into `main` at
  `bd049c2afffdebb8a7ff9233df105cb7fba644ab`.
- Current `origin/main` at this preflight:
  `bd049c2afffdebb8a7ff9233df105cb7fba644ab`.
- #336 remains `OPEN`; Project status readback: `Inbox`.
- #339 remains `OPEN`; Project status readback: `Needs Decision`.
- The OpenAPI contract contains the two password-reset transport paths, but
  current runtime route registration does not map either path.
- `services/api/src/Settleora.Api/Program.cs` registers
  `AddLocalPasswordResetRuntime(builder.Configuration)` but does not call a
  password-reset endpoint mapper.
- `LocalPasswordResetRouteExposureTests` assert the two OpenAPI paths are not
  present in runtime endpoint data sources and return `404 Not Found`.
- Current internal password-reset runtime includes request/material issue,
  email delivery orchestration, reset-specific throttles, uniform public
  request-response policy, completion, credential replacement, account-wide
  session and refresh-family revocation, and bounded audit/redaction tests.

## Readiness Matrix

| Gate | Status | Evidence / decision |
| --- | --- | --- |
| SMTP/email delivery, base URL, reset-link construction, reset-template, provider-send readiness | `satisfied_for_internal_only` | PR #746 merged internal email delivery orchestration. `PasswordResetEmailDeliveryReadinessService` requires enabled delivery, generic SMTP configured or explicit local/test sink, safe public origin, approved 15-120 minute lifetime, and supported delivery mode. `PasswordResetEmailTemplateComposer` builds a configured-origin reset link and redacted preview. `PasswordResetEmailDeliveryOrchestrator` sends only after readiness, material issue, composition, provider-send throttle, and recipient availability. Public route exposure still needs a route handler that derives recipient email safely and preserves the readiness block. |
| Reset-specific abuse and provider-send throttle behavior | `satisfied_for_internal_only` | PR #748 merged `InMemoryPasswordResetAbuseThrottlePolicy` with source, identifier, combined, global, and provider-send buckets. `PasswordResetEmailDeliveryOrchestratorTests` cover request throttle before material issue/provider send and provider-send throttle before SMTP send. Current implementation is internal until routes are mapped. |
| Audit/redaction for request, material issue, delivery, completion, replay/denial, credential replacement, and session revocation | `satisfied_for_internal_only` | PR #752 merged `EfPasswordResetAuditWriter` redaction acceptance. `LocalPasswordResetServiceTests` and `PasswordResetAuditRedactionAcceptanceTests` cover request, material issue, credential replacement, completion, replay/suspicious reuse, denial/unknown material, and `password_reset.sessions_revoked` without raw reset material, passwords, hashes, identifiers, or provider details in safe audit content. |
| Notification/event/target posture | `deferred_not_required_for_day1_exposure` | PR #754 and PR #756 record that password-reset notification runtime is not required for Day 1 public route exposure if notifications remain deferred/audit-only. If a future route-exposure design emits a password-reset notification, first-class target/schema/OpenAPI/generated-client work plus an authorized current-account security-center, credential-activity, or auth-audit re-fetch route must happen first. |
| UI/Figma/mobile/web/admin/product-copy gate | `blocked` | No user-facing forgotten-password, reset-complete, email-copy, unsupported-state, security-center, mobile/web/admin, or Figma/product-copy acceptance gate has passed. Existing route exposure docs continue to require this gate before public exposure. |
| OpenAPI/generated-client manual gate for any new or changed public route, target, or security-center contract | `blocked` | The OpenAPI contract already contains the transport paths from PR #736, but it still describes runtime as unimplemented by that contract slice. Mapping public runtime in a later PR would require manual OpenAPI/generated-client review for the changed runtime posture and any response/copy/security-center target changes. No target/security-center contract is approved for notifications. |
| Local-only reset scope and OIDC exclusion | `satisfied_for_internal_only` | `LocalPasswordResetService.ResolveEligibleLocalAccountAsync` resolves only local identities with active local credentials; OIDC-only accounts return non-eligible/internal-denial categories. OpenAPI descriptions state Settleora reset applies only to local-account passwords. |
| Token expiry/lifetime, one-time/replay/expired/consumed/malformed handling | `satisfied_for_internal_only` | `PasswordResetEmailDeliveryOptions` defaults to 60 minutes and validates 15-120 minutes. `LocalPasswordResetService` stores only lookup hashes, replaces older pending material, consumes once, marks expired material, and classifies consumed/revoked/replaced reuse as suspicious replay. |
| Account-wide session and refresh-family revocation after successful reset | `satisfied_for_internal_only` | `LocalPasswordResetService.CompleteResetAsync` calls `RevokeActiveSessionsForAccountAsync` with no excluded session and reason `password_reset`. Tests assert active sessions, session families, and refresh credentials are revoked after successful reset. |
| Uniform public anti-enumeration response behavior | `satisfied_for_internal_only` | `PasswordResetPublicResponsePolicy` maps disabled/not-ready, provider accepted, provider failed, request throttle, and provider-send throttle to `202 Accepted`, no body, and no `Retry-After`. `LocalPasswordResetService.RequestResetAsync` returns accepted for eligible, missing, OIDC-only, and disabled cases. Public route handler mapping remains unimplemented. |
| Final auth/security acceptance posture | `blocked` | Final public route exposure and final auth/security acceptance have not passed. Current route exposure tests intentionally assert both paths remain unmapped and unreachable. |

## Decision

Decision: `BLOCKED_FOR_ROUTE_EXPOSURE`.

Public runtime mapping should not be implemented until these blockers are
cleared:

- UI/Figma/mobile/web/admin/product-copy gate for the public reset experience,
  reset email copy, unsupported states, and any security-center copy.
- Manual OpenAPI/generated-client gate for changing the public route runtime
  posture and any target/security-center contract.
- Final public route exposure review.
- Final auth/security acceptance.

Password-reset notification runtime is not a blocker for Day 1 route exposure
if the route-exposure task keeps notifications deferred/audit-only. If that
task chooses to emit password-reset notifications, notification target/schema,
OpenAPI/generated-client, authorized re-fetch, recipient, copy, and redaction
work becomes a prerequisite.

## Next Recommended Action

Open a later public route-exposure implementation task only after the remaining
manual/product and OpenAPI/auth-security gates pass. The smallest future
implementation should map only the two existing public routes, preserve the
uniform request response, call the existing internal delivery and completion
services, update route-exposure tests, and avoid notification runtime unless a
separate notification gate has passed.

## Issue Posture

Keep #336 open. This preflight does not complete the broader
auth/session/runtime security epic or final auth/security acceptance.

Keep #339 open. This preflight does not expose public reset routes, complete
user-visible reset UX/product copy, implement notification runtime, or complete
the Day 1 password reset and credential-change workflow.
