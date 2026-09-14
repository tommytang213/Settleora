# Day 1 Authentication And Session Completeness Audit

Issue: [#965](https://github.com/tommytang213/Settleora/issues/965)

Parent: [#336](https://github.com/tommytang213/Settleora/issues/336)

Task key: `20260914-1952`

Source baseline: `origin/main` at
`13d3aa2355bfafc8203af711307f938eb7a4210f` (tree
`01d1a5a59308b29947e231d14f9c17f1789cdc8b`)

## 1. Decision

Day 1 authentication and session support is **partial**. The repository has a
substantial server-authoritative foundation: Argon2id local credentials,
first-owner bootstrap, local sign-in, current-actor resolution,
opaque access sessions, rotating refresh credentials, replay-family handling,
sign-out/revocation, password change/reset, invitation lifecycle, MFA/passkey
ceremonies, policy readouts, and bounded audit writers. Those capabilities are
real source and test evidence, not planned placeholders.

The product is not auth-complete. Invitation and reset email delivery require
explicit provider/configuration proof; public registration and OIDC are absent;
owner/role lockout administration is absent; rate limits are process-local and
do not have a reviewed client-source boundary; password sign-in does not
perform an MFA challenge, and public factor ceremonies lack their documented
binding/throttling behavior; passkey sign-in creates server session state but
returns neither a usable session credential nor a cookie handoff; mobile covers
only the core password/session/reset request path; user web has no working
sign-in/session boundary; canonical reset/invitation descriptions retain stale
pre-runtime claims; and public exposure remains separately blocked.
Generated methods and mapped routes do not change those classifications.

This audit contains **32 canonical capability/reconciliation rows** exactly
once: `implemented` 8, `partial` 13, `disabled` 2, `unavailable` 5, `blocked` 2,
`superseded` 1, and `manual-evidence` 1. There are **27 remaining gap IDs** and
**9 focused recommendation IDs**. Existing owners are reused wherever one
exists; no follow-up issue is created by this audit.

The first dependency-safe wave after #965 is
`REC-AUTH-PASSKEY-SESSION-001`: a bounded docs/control decision for the passkey
sign-in session/credential handoff, completion-time account/policy revalidation,
and any required-MFA continuation. It must
select an explicit server-authoritative bearer or future sender-constrained
handoff without exposing a raw credential in audit/logging, and must precede
client factor work. Queue activation is disabled, so this audit does not start
it.

## 2. Method, truth rules, and status vocabulary

The inventory reconciles current source, tests, canonical OpenAPI, generated
clients, mobile and user-web entry surfaces, current architecture/PRD text,
merge ancestry, and fully read live issue bodies/comments. Current source and
tests outrank stale statements in older design documents and open umbrellas.
In particular, old statements that password reset or MFA/passkey runtime does
not exist are not treated as current truth. Stale statements in canonical
OpenAPI remain contract defects even when mapped source proves the runtime.

- `implemented`: required behavior is present at the audited layer and has
  focused automated evidence; a separate row may still record a missing
  product surface.
- `partial`: useful behavior exists, but one or more required layers or states
  are incomplete.
- `disabled`: implemented capability is deliberately off or provider-disabled
  under the current safe default.
- `unavailable`: no usable implementation exists at the audited layer.
- `blocked`: work cannot safely proceed until the named authority/gate clears.
- `superseded`: a historical plan is replaced by merged/current ownership and
  must not be recreated.
- `manual-evidence`: automated/source evidence exists, but final hostile,
  device, provider, or exposure proof remains human/operator work.

`API` means mapped server behavior, `O/C` means canonical OpenAPI plus generated
web/Dart client evidence, and `M/W/A` means mobile, user-web, and admin-web
entry-surface evidence. A generated method supplies only `O/C`. A displayed or
cached role/session never supplies authorization or session validity.

## 3. Evidence bundles

The capability table refers to these bundles so exact paths and tests are not
repeated inaccurately.

| Bundle | Exact current implementation and test evidence | Contract, client, surface, and merged evidence |
| --- | --- | --- |
| `E-CRED` | `services/api/src/Settleora.Api/Auth/PasswordHashing/GeraltPasswordHashingService.cs`, `Auth/Credentials/AuthCredentialWorkflowService.cs`, `Domain/Auth/LocalPasswordCredential.cs`; `PasswordHashingServiceTests.cs`, `AuthCredentialWorkflowServiceTests.cs`, `AuthCredentialsSessionsAuditModelTests.cs` | [Password hashing policy](../architecture/PASSWORD_HASHING_POLICY.md); source commits `42b9a861`, `3b25a294`, `74401cea`; no password or verifier is a client response. |
| `E-BOOT` | `Auth/Bootstrap/LocalOwnerBootstrapEndpoints.cs`, `LocalOwnerBootstrapService.cs`, `Auth/AdminUsers/AdminUserEndpoints.cs`, `AdminLocalUserService.cs`; `LocalOwnerBootstrapEndpointTests.cs`, `AdminLocalUserEndpointTests.cs` | `packages/contracts/openapi/settleora.v1.yaml`; generated `getAuthBootstrapStatus`, `bootstrapLocalOwner`, `listAdminUsers`, `createAdminLocalUser`; source commits `7a685ee2`, `7c9d0a1e`. No shipped M/W/A bootstrap or admin-account UI. |
| `E-SIGNIN` | `Auth/SignIn/LocalSignInEndpoints.cs`, `LocalSignInService.cs`, `InMemorySignInAbusePolicyService.cs`; `LocalSignInEndpointTests.cs`, `LocalSignInServiceTests.cs`, `SignInAbusePolicyServiceTests.cs` | OpenAPI/generated `signInLocal`, mobile alias `signInLocalSession`; source commits `9869b709`, `a6aabb8d`, `5f7412d2`, refresh addition `4be7d7e1`; mobile wiring PR #248. |
| `E-ACTOR` | `Auth/Authorization/SettleoraSessionAuthenticationHandler.cs`, `HttpContextCurrentActorAccessor.cs`, `Auth/CurrentUser/CurrentUserEndpoints.cs`; `AuthMiddlewareAuthorizationTests.cs`, `AuthenticatedApiPolicyBaselineTests.cs`, `BusinessAuthorizationServiceTests.cs` | OpenAPI/generated `getCurrentUser` and mobile alias `getAuthenticatedSession`; commits `068d7b0f`, `ce9c2232`, `cac2a411`, `753a68b8`. Clients consume server-returned actor/profile/session/roles. |
| `E-SESS` | `Auth/Sessions/AuthSessionRuntimeService.cs`, `AuthRefreshSessionRuntimeService.cs`, `RefreshSessionEndpoints.cs`, `SignOutEndpoints.cs`, `SignOutAllEndpoints.cs`, `SessionListEndpoints.cs`, `SessionRevocationEndpoints.cs`; focused `AuthSessionRuntimeServiceTests.cs`, `AuthRefreshSessionRuntimeServiceTests.cs`, `RefreshSessionEndpointTests.cs`, `SessionListEndpointTests.cs`, `SessionRevocationEndpointTests.cs` | OpenAPI/generated `refreshSession`, `signOutCurrentSession`, `signOutAllCurrentAccountSessions`, `listCurrentAccountSessions`, `revokeCurrentAccountSession`; commits `068d7b0f`, `63c82266`, `40fb0bf0`, `edcd7855`, `e1a43910`, `a4cc6dd6`, `d9707006`; hardening PR #783. |
| `E-PWCHANGE` | `Auth/PasswordChange/CurrentAccountPasswordChangeEndpoints.cs`, `CurrentAccountPasswordChangeService.cs`; `CurrentAccountPasswordChangeEndpointTests.cs` | OpenAPI/generated `changeCurrentAccountPassword`; PR #729. No M/W/A operation surface. Current password verification is required and current session is preserved while other session authority follows tested policy. |
| `E-RESET` | `Auth/PasswordReset/LocalPasswordResetEndpoints.cs`, `LocalPasswordResetService.cs`, `PasswordResetMaterialService.cs`, delivery/readiness/orchestrator/template/SMTP classes; reset service, route, abuse, audit-redaction, delivery-readiness, orchestrator, and template tests | OpenAPI/generated `requestLocalPasswordReset`, `completeLocalPasswordReset`; runtime PR #739, contract PR #736, public route PR #763, user-web completion PR #767, mobile request PR #765. Canonical OpenAPI descriptions still say runtime is unimplemented. `PasswordResetEmailDeliveryOptions.Enabled` defaults false. |
| `E-INVITE` | `Auth/Invitations/InvitationPolicyService.cs`, `InvitationManagementService.cs`, `InvitationAcceptanceService.cs`, lifecycle, abuse, link, delivery/readiness/template/sender classes; invitation policy, management, acceptance, lifecycle, abuse, delivery, and redaction tests | OpenAPI/generated capability, admin lifecycle, resend/revoke, and public `acceptInvitation` methods; contract PR #792; runtime PRs #793-#799. Canonical policy/create/revoke/resend descriptions still say runtime remains separate. Default policy and provider posture are disabled/off; no M/W/A invitation UI. |
| `E-MFA` | `Auth/Passkeys/PasskeyRuntimeService.cs`, `PasskeyEndpoints.cs`, `Fido2PasskeyWebAuthnProvider.cs`, `Auth/Mfa/MfaRuntimeService.cs`, `ITotpSecretProtector.cs`, `RecoveryCodeHasher.cs`, `Auth/Policy/AuthSecurityPolicyService.cs`; passkey, TOTP, policy, schema, and security regression tests | OpenAPI/generated enrollment/sign-in/step-up/factor/recovery/policy methods; schema/contract/runtime/policy/QA work #501-#506 via PRs #508-#513. Anonymous MFA challenge creation is denied, while anonymous verification omits account/session filtering. Public MFA/passkey operations advertise `429`, but runtime mappings have no throttled state. `PasskeySignInCompleteResponse` deliberately has only `status`, `currentUser`, and `mfaChallenge`; the anonymous completion endpoint sets no cookie/header, discards the created raw access credential, and does not recheck passkey policy at completion. No M/W/A factor flow. Closed #417 supplies reference only; #465 remains admin UI owner. |
| `E-MOBILE` | `apps/mobile/lib/app/sign_in_screen.dart`, `auth_session_repository.dart`, `secure_session_access_token_provider.dart`, `password_reset_repository.dart`, `secure_storage.dart`; repository, password reset, and `ui/sign_in_required_state_actions_test.dart` tests | Real sign-in/current-user/refresh/sign-out/all/session list/revoke and reset-request adapters; PRs #248/#765 plus merge ancestry. No reset completion/app link, invitation, registration, OIDC, password-change, or factor UI. [M11 QA map](M11_MOBILE_ACCOUNT_SESSION_QA_MAP.md) retains manual evidence. |
| `E-WEB` | `apps/web-user/src/authSession.ts`, `PasswordResetCompletePage.tsx`, `passwordResetComplete.ts`; corresponding tests | `App.tsx` supplies `accessToken: null`; no sign-in/refresh/logout credential source. Only reset completion is a real auth operation (PR #767). [User-web audit](DAY1_USER_WEB_COMPLETENESS_AUDIT.md) rows `WEB-D1-001`, `002`, `027`, `028` remain authoritative. |
| `E-AUDIT` | Credential, sign-in, session, reset, invitation, MFA, passkey, and policy `Ef*AuditWriter` classes plus `AuthAuditEvent`; audit/redaction tests including `PasswordResetAuditRedactionAcceptanceTests.cs` and `AuthMfaPasskeySecurityRegressionTests.cs` | Safe bounded metadata exists. No current-user security-center/audit API or notification target. [Notification source policy](../architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md) blocks inferred security events. |
| `E-EXPOSE` | No public exposure implementation is credited | [Exposure guardrails](../deployment/SELF_HOSTING_EXPOSURE_GUARDRAILS.md) keep trusted LAN as default and public/admin exposure manual-gated; #777 is the live review gate. Route reachability, localhost passkey defaults, or generated clients are not approval. |
| `E-L10N` | Current mobile/user-web auth copy remains mostly inline English; user-web reset completion is behaviorally complete | #409 recommendations `L10N-D1-016`, `L10N-D1-018`, `L10N-D1-025` are separate non-runnable catalog/inventory work. They cannot alter API state, error mapping, authorization, or delivery behavior. |

## 4. Canonical capability inventory

Routing shorthand: `docs` = `docs-only` validation; `api` = focused API plus
full API/OpenAPI validation; `contract` = OpenAPI/generated-client validation;
`mobile`/`web` = platform validation and visual/manual evidence as applicable.
Security-sensitive runtime, policy, schema, provider/configuration, role/lockout,
recovery, and exposure changes require strong independent and manual review.

| ID / capability | Day 1 requirement/source | Evidence and status basis | Status | Remaining gap ID and exact gap | Owner / dependency | Lane, profile, reviewer, gate, and close rule |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH-D1-001` Credential hashing and persistence | PRD auth/security; password policy | `E-CRED`: Argon2id verifiers, bounded parameters, centralized create/verify/change/reset/rehash; no plaintext/reversible password or raw reusable credential persistence found. | `implemented` | — | #339 historical credential umbrella | `api-auth-security`; `api`; strong; manual for any change. Closed while source/tests and policy remain aligned. |
| `AUTH-D1-002` First-owner bootstrap | One guarded first owner/account/profile/roles | `E-BOOT`: atomic owner/admin/user bootstrap with empty-system/status guard and tests. | `implemented` | — | #337 | `api-auth-security`; `api`; strong. Closed for server capability; UI/exposure are separate. |
| `AUTH-D1-003` Admin-created local accounts | Owner/admin can create ordinary local users safely | `E-BOOT`: API supports `user` creation only; no safe initial-password handoff, policy readout/toggle, or admin UI. | `partial` | `AUTH-GAP-001`: finish admin local-account policy/handoff and UI without elevating roles implicitly. | #788; UI #464; depends on owner policy | API and admin UI separate; `api` then web-admin; strong/manual. Close after policy, handoff, audit, UI, and lockout-safe acceptance. |
| `AUTH-D1-004` Local password sign-in | Enumeration-resistant local sign-in issuing server state | `E-SIGNIN`: normalized identifier, generic invalid credentials, password verification, session/refresh issuance, audit, automated API and mobile adapter evidence. | `implemented` | — | #337/#338 | `api-auth-security`; `api`; strong. Factor enforcement and public abuse are rows 19/22/29. |
| `AUTH-D1-005` Current actor/account/profile/roles | Protected work resolves identity from validated server state | `E-ACTOR`: bearer handler validates persisted session and loads account/profile/roles; clients do not submit actor identity. | `implemented` | — | #336 | `api-auth-security`; `api`; strong. Closed while every protected route consumes the server actor. |
| `AUTH-D1-006` Access-session issuance and validation | Opaque, expiring, server-revocable sessions | `E-SESS`: random opaque access material is hash-persisted; status/expiry/account are validated server-side. | `implemented` | — | #338 | `api-auth-security`; `api`; strong. Sender constraint/lifetime UX is row 28. |
| `AUTH-D1-007` Refresh rotation and reuse handling | One-time rotation; replay cannot remain silently valid | `E-SESS`: active refresh credential rotates transactionally; replay/reuse revokes family-linked authority under tested semantics. | `implemented` | — | #338; future binding #1059 | `api-auth-security`; `api`; strong. Closed for bearer rotation; proof-of-possession is separate. |
| `AUTH-D1-008` Sign-out and revocation | Current, selected, and all-session invalidation | `E-SESS` and PR #783: current sign-out, selected session/family revocation, sign-out-all, idempotent/not-found/authorization behavior are tested. Revocation is not claimed to deliver notifications or erase audit. | `implemented` | — | #338 | `api-auth-security`; `api`; strong. Closed for current server semantics; acceptance/readout is row 9. |
| `AUTH-D1-009` Device/session visibility | User can review and revoke bounded session entries | `E-SESS` + `E-MOBILE`: API and mobile list/revoke exist; labels/user-agent are bounded display metadata, not device identity. User web/admin/security center and unfamiliar-device classification are absent. | `partial` | `AUTH-GAP-002`: complete cross-client security-center/session UX and source-owned device-risk semantics. | #338/#774; notifications #369/#973 | API risk source before notification/UI; `api` then mobile/web; strong/manual. Close with current/other-device states, revocation refresh, safe metadata, and hostile/manual proof. |
| `AUTH-D1-010` Current-password change | Verify current password, replace verifier, apply reviewed session policy | `E-PWCHANGE`: API/contract/tests exist and preserve current session per PR #783 policy; no M/W/A entry surface. | `partial` | `AUTH-GAP-003`: implement client password-change flow and acceptance against unchanged server policy. | #339/#774; client rec `REC-MOBILE-AUTH-001` and `REC-WEB-AUTH-001` | Mobile/web lanes after auth review; platform validation; strong/manual. Close with current-password failure, confirmation, refresh, session impact, and safe copy. |
| `AUTH-D1-011` Local password-reset core | Generic request and single-use completion, distinct from invitations | `E-RESET`: opaque hashed reset material, bounded expiry/use, generic public request, password replacement and redacted audit are tested. Mapped runtime is implemented, but canonical request/completion descriptions still call it unimplemented. | `implemented` | `AUTH-GAP-026`: reconcile stale reset OpenAPI descriptions with merged runtime without changing behavior. | #339 runtime owner; no narrow contract owner, so `REC-AUTH-CONTRACT-DRIFT-001` | Runtime closes as implemented; contract-only correction uses OpenAPI/client validation and strong auth review. Close gap 026 when canonical descriptions and generated documentation match source. |
| `AUTH-D1-012` Password-reset delivery | Approved local delivery can send a safe link | `E-RESET`: readiness/orchestration/SMTP seams and tests exist, but `Enabled` defaults false and no production provider/configuration proof exists. | `disabled` | `AUTH-GAP-004`: configure and prove one approved provider/deployment without exposing material. | #339; provider boundary #403; provider-owned reset #773 | Provider/config lane; provider tests plus strong/manual secrets/exposure gate. Close only on redacted live delivery/failure evidence and rollback, never on route presence. |
| `AUTH-D1-013` Password-reset product surfaces | Request and completion reachable on supported clients | `E-MOBILE` has request only; `E-WEB` has hardened fragment-capture/scrub completion; mobile completion/deep link and a coherent cross-surface journey are absent. | `partial` | `AUTH-GAP-005`: mobile universal/app-link completion and final cross-platform acceptance. | #772; #1204 for password-manager semantics | Mobile/platform lane; depends on app-link identity/release policy; `mobile`; strong/manual. Close with token scrub, expiry/replay, cancellation, provider-owned branch, and real device proof. |
| `AUTH-D1-014` Invitations | Default-off policy, admin lifecycle, acceptance, delivery and UI | `E-INVITE`: backend/contract lifecycle is substantial and safe-default disabled; provider proof and all client/admin surfaces are absent. Canonical policy/create/revoke/resend descriptions retain pre-runtime wording. | `disabled` | `AUTH-GAP-006`: preserve default-off, finish admin/user surfaces and provider/exposure proof in separate lanes. `AUTH-GAP-027`: reconcile stale invitation OpenAPI descriptions. | #784; admin UI #464; no narrow contract owner, so `REC-AUTH-CONTRACT-DRIFT-001` | API, admin UI, provider, deployment, and contract correction remain separate; strong/manual. Close only when each lane is accepted; never infer enablement from generated methods. |
| `AUTH-D1-015` Public self-registration | Optional capability, safe default off | No route, contract, runtime, schema flow, or client surface; invitation/bootstrap are not registration. | `unavailable` | `AUTH-GAP-007`: implement an explicitly enabled policy/readout/runtime/contract/client split or retain a documented disabled Day 1 disposition. | #786 | Policy → API → contract → clients; strong/manual owner/exposure gates. Close only after enable/disable, anti-abuse, audit, and acceptance are proven. |
| `AUTH-D1-016` Local-account policy | Owner/admin can understand and control local-account availability | `E-BOOT`/`E-SIGNIN` implement local accounts, but no complete server policy readout/toggle, first-password handoff, or disable transition exists. | `partial` | `AUTH-GAP-008`: complete local-account policy and account lifecycle semantics. | #788; lifecycle wording #721 | API policy/lifecycle before UI; strong/manual. Close with bootstrap distinction, existing-session effects, audit, lockout prevention, and explicit defaults. |
| `AUTH-D1-017` External identity provider | Optional OIDC/Keycloak, default disabled | No OIDC runtime, callback, provider session/token boundary, account link, contract, or client flow. Reset copy mentioning providers is not proof. | `unavailable` | `AUTH-GAP-009`: implement provider policy/runtime/linking/client/delivery boundaries without storing or logging unsafe payloads. | #787; provider recovery #773 | Provider/auth lanes; strong/manual secrets/config/exposure gate. Close with disabled/unconfigured/configured/failure/linking/logout/recovery and redacted live proof. |
| `AUTH-D1-018` Product roles and owner-lockout safety | Server-owned owner/admin/user authority; last-owner safety | `E-ACTOR` enforces roles and `E-BOOT` creates owner/admin/user assignments; ordinary admin create is user-only. Role assignment/demotion, disablement, last-owner guard, and admin UX are absent. | `partial` | `AUTH-GAP-010`: add reviewed role/account lifecycle with last-owner and self-lockout protection. | #785; admin UI #464/#465 | API policy before contract/admin UI; strong/manual owner-lockout gate. Close with concurrent last-owner, self-demotion/disable, session effects, audit, and recovery proof. |
| `AUTH-D1-019` Sign-in abuse controls | Layered identifier/source/global throttles without enumeration | `E-SIGNIN` has generic outcomes and layered process-local counters, but the endpoint uses a fixed source bucket and no trusted proxy/client-source boundary; restart/multi-node bypass remains. Public MFA/passkey ceremonies advertise `429` but expose no throttled runtime state. | `partial` | `AUTH-GAP-011`: define and implement trusted-source, distributed-safe sign-in and public-factor-ceremony abuse enforcement. | No focused issue; `REC-AUTH-ABUSE-001`; exposure #777 | Docs prerequisite then API/config in separate tasks; strong/manual security and proxy gates. Close on spoof/restart/multi-node/concurrency/privacy tests, MFA/passkey attempt limits and contract-aligned `429` behavior. |
| `AUTH-D1-020` Reset/invitation abuse controls | Public token/request paths resist guessing and flooding | `E-RESET`/`E-INVITE` have generic responses, bounded attempts, replay/expiry and process-local throttles; distributed/provider-edge behavior is not proven. | `partial` | `AUTH-GAP-012`: share the reviewed source/distributed limiter posture while keeping reset and invitation token semantics distinct. | #784/#339 plus `REC-AUTH-ABUSE-001` | Same prerequisite as row 19; API/provider lanes separate; strong/manual. Close on per-workflow hostile/replay/concurrency tests and safe diagnostics. |
| `AUTH-D1-021` Auth audit, logging, and redaction | Security actions auditable without credentials/tokens/private payloads | `E-AUDIT`: bounded writers and redaction regressions cover major flows. No security-center/admin audit read API, retention/disable lifecycle, or notification mapping; older notification-policy reset wording is stale. | `partial` | `AUTH-GAP-013`: reconcile lifecycle/retention/readout and reviewed notification-source semantics. | #721/#774/#369; audit consumer #973 | API audit/readout and notification lanes separate; strong/manual privacy gate. Close with authorization, retention, pagination, redaction, no-secret scans, and exact source events. |
| `AUTH-D1-022` MFA, passkeys, recovery codes, and step-up | Day 1 passkey + TOTP + one-time recovery, server policy | `E-MFA`: server schema/contract/runtime/policy/regression foundation is real; TOTP secrets are protected, recovery verifiers hashed, passkey private material absent. Password sign-in does not challenge for MFA. Anonymous challenge creation is denied, while anonymous verification does not enforce the documented same pending-flow/account/session binding; ceremony throttling is absent despite `429` contracts. Passkey completion creates a session then discards its raw access credential, returns no credential/cookie, and does not recheck passkey policy, so `signed_in` cannot authorize a later client request safely. No client factor flow exists. | `partial` | `AUTH-GAP-014`: complete password-primary required-factor enforcement, pending-flow/account/session binding, public ceremony throttling, anti-lockout recovery, and client surfaces. `AUTH-GAP-025`: repair passkey completion-time account/policy validation and the session/credential handoff without overexposure. | #394 is tracker only; #465 is admin UI; recovery #775; no narrow enforcement owner, so `REC-AUTH-MFA-SIGNIN-001`; no narrow handoff owner, so `REC-AUTH-PASSKEY-SESSION-001`; UI recommendations remain separate | Passkey handoff and MFA sign-in control decisions first, then separate API/contract/enforcement/client tasks; strong/manual auth, contract, recovery, platform, visual gates. Close only after exact pending-flow binding, ceremony limits, credential handoff, no orphan session, completion-time policy validation, MFA continuation, replay/revoke, and full client acceptance. |
| `AUTH-D1-023` Auth/session security notifications | Source-owned security events and authorized opens | `E-AUDIT`: audit/session states exist, but no auth event constants, first-class targets, recipient policy, unfamiliar-device classifier, or safe open route is notification-ready. | `unavailable` | `AUTH-GAP-015`: define event/target/recipient/redaction policy before one narrow runtime event family. | #369; current audit owner #973 | Docs policy → schema/contract → runtime → clients, all separate; strong/manual auth/privacy gate. Close only on exact source transitions, idempotency, reauthorization, and no unsafe payloads. |
| `AUTH-D1-024` Mobile auth/session entry | Core server-mode auth is operable on mobile | `E-MOBILE`: sign-in, restore/refresh, current actor, sign-out/all, session list/revoke, reset request and secure storage exist. Reset completion, invitations, registration, OIDC, password change, factors, and final manual evidence do not. | `partial` | `AUTH-GAP-016`: complete bounded mobile account-security entry surfaces without moving authority client-side. | #772/#774/#784/#394/#1204; `REC-MOBILE-AUTH-001` only for unowned composition | `mobile-ui`; mobile validation + strong/manual auth/platform/visual review. Close with all implemented/disabled/unavailable states and server revalidation. |
| `AUTH-D1-025` User-web auth/session entry | Browser can sign in, restore/refresh, sign out and use protected routes | `E-WEB`: `authSession.ts` is an unreachable helper because the shell passes no token; reset completion alone is real. No credential storage or working protected route exists. | `blocked` | `AUTH-GAP-017`: implement the user-web session boundary before protected feature acceptance. | No focused child under broad #373; `REC-WEB-AUTH-001` | `web-user-ui` with auth review; web validation + strong/manual security/visual review. Close with sign-in, refresh race/replay failure, logout, route return, storage policy, current actor, and revoked/expired/offline states. |
| `AUTH-D1-026` Admin auth/security entry | Admin surface uses app auth and exposes policy safely | No running admin portal/auth entry; #465 is reference/planning only. API role enforcement does not make an admin web surface usable or exposure-safe. | `unavailable` | `AUTH-GAP-018`: implement protected admin entry and security policy surfaces after role/lockout authority. | #463/#464/#465; depends on #785/#788 | Admin web lane after API policy; strong/manual auth, visual, and admin-exposure gates. Close with protected entry, role revalidation, denied states, audit, and private exposure evidence. |
| `AUTH-D1-027` Password-manager/AutoFill posture | Safe credential UX across self-hosted server identities | Password/new-password hints exist in places, but no complete Autofill lifecycle, associated-domain/app-link proof, stable Android release identity, or multi-server credential scoping. | `partial` | `AUTH-GAP-019`: finish cross-platform password-manager and server-identity behavior. | #1204; depends on #772 and platform identity | Mobile/web/platform lane; strong/manual platform/release gate. Close on Android/iOS/browser manager evidence without exposing credentials. |
| `AUTH-D1-028` Device-bound and persistent sessions | Sender-constrained credentials and reviewed persistent lifetime UX | Current bearer/refresh sessions are server-authoritative but bearer-based; no proof-of-possession key, binding contract, persistence choice, or cross-client key lifecycle. | `unavailable` | `AUTH-GAP-020`: split architecture, persistence, contract, refresh, clients, and access-token follow-up. | #1059; depends on this audit | Architecture/docs first, then schema/API/contract/client lanes; strong/manual security/schema/platform gates. Close per #1059 only after hostile replay, loss/recovery, and lifetime acceptance. |
| `AUTH-D1-029` Public-exposure readiness | Internet/admin exposure only after explicit gates | `E-EXPOSE`: trusted LAN/private posture only; auth gaps, provider configuration, proxy/source abuse semantics, and release proof remain. | `blocked` | `AUTH-GAP-021`: clear the explicit exposure checklist without bundling auth implementation. | #777; acceptance consumer #975 (inactive) | Deployment/exposure; strong/manual. Close only with exact approved surfaces, TLS/proxy/origin/rate-limit/redaction/rollback evidence. No R05 authority is implied. |
| `AUTH-D1-030` Auth localization/catalog boundaries | Locale-ready copy without changing auth behavior | `E-L10N`: ordinary English surfaces exist; catalog adoption/inventory remains distinct. | `partial` | `AUTH-GAP-022`: preserve three bounded localization recommendations. | `REC-L10N-D1-016`, `REC-L10N-D1-018`, `REC-L10N-D1-025`; #409 | Docs inventory then owning client lane; auth-security review inherited. Close only on catalog/state mapping/expansion evidence with zero behavior change. |
| `AUTH-D1-031` Historical broad factor-planning owner | Do not duplicate merged MFA/passkey work | #776 remains open, but its broad premise was replaced by closed #413-#417 and merged #501-#506; residual work is owned by #394/#465/#775 and rows 22/24-26. | `superseded` | — | Do not execute/duplicate #776; reconcile administratively after #965 | Planning hygiene only; `docs`; cheap. Closed when live owner graph acknowledges supersession; no runtime implication. |
| `AUTH-D1-032` Final cross-platform/provider/hostile acceptance | Day 1 needs evidence beyond source and unit tests | M11 and current audits retain manual device/visual/provider/security/exposure checks. No live provider, public exposure, MFA client, multi-node abuse, or all-surface acceptance evidence exists. | `manual-evidence` | `AUTH-GAP-023`: collect manual auth/client/provider evidence only after implementations exist; `AUTH-GAP-024`: #975 consumes final accepted evidence later. | Existing per-row owners; final consumer #975 remains inactive | QA/manual lane; no implementation authority. Close only on exact-head redacted evidence for supported surfaces; unavailable/disabled states remain truthful. |

## 5. Remaining gap and owner arithmetic

The 27 unique gap IDs are `AUTH-GAP-001` through `AUTH-GAP-027`; no ID is
reused for a second capability. Existing issue families remain linked wherever
their live scope is valid. Six execution boundaries lack a current narrow
owner and therefore have
one focused recommendation each in section 6; the three localization
recommendations retain #409's existing IDs. Recommendations are planning
records, not runnable tickets.

| Owner family | Gap IDs | Current disposition |
| --- | --- | --- |
| #338/#774 | 002, 003, 013 | Session/security-center/client/audit work; keep API and clients separate. |
| #339/#772/#773/#775 | 004, 005 | Delivery, app-link, provider and recovery boundaries remain separate. |
| #784/#464 | 006, 012 | Invitation backend credited; UI/provider/exposure remain. |
| #786/#787/#788 | 007-009 | Registration, OIDC, and local-account policy are distinct lanes. |
| #785 | 010 | Role/last-owner safety manual-gated. |
| `REC-AUTH-ABUSE-001` with #777 | 011-012 | One shared design prerequisite includes public MFA/passkey ceremonies; workflow semantics remain separate. |
| #721/#369/#973 | 013, 015 | Audit lifecycle and notification-source work stay separate. |
| `REC-AUTH-MFA-SIGNIN-001` + #394/#465/#775 | 014 | #394 remains tracker only; password-primary enforcement, pending-flow binding, ceremony limits, recovery, and client completion remain. |
| `REC-AUTH-PASSKEY-SESSION-001` | 025 | Passkey completion-time policy validation and credential handoff lack a narrow owner. |
| #772/#774/#784/#394/#1204 + client recommendations | 016 | Mobile composition adopts current owners; no replacement umbrella. |
| `REC-WEB-AUTH-001` | 017 | One focused user-web session-boundary recommendation. |
| #463/#464/#465 | 018 | Admin entry remains manual/private-exposure gated. |
| #1204 | 019 | Existing cross-platform password-manager owner. |
| #1059 | 020 | Existing sender-constraint/persistent-session owner. |
| #777 | 021 | Public exposure remains separately manual-gated. |
| #409 localization recommendations | 022 | Catalog work never owns auth behavior. |
| Per-row owners / #975 | 023-024 | Manual evidence and later acceptance; #975 is not activated. |
| `REC-AUTH-CONTRACT-DRIFT-001` + #339/#784 | 026-027 | Correct stale reset/invitation OpenAPI prose in one contract-only lane; runtime behavior remains unchanged. |

## 6. Focused recommendations without a current narrow owner

| Recommendation | Scope / allowed-path strategy | Dependency and acceptance | Profile / reviewer / gate / close rule |
| --- | --- | --- | --- |
| `REC-AUTH-PASSKEY-SESSION-001` Passkey sign-in session/credential handoff | Docs/control decision first: reconcile `PasskeyRuntimeService.CompleteSignInAsync`, completion-time account/passkey-policy revalidation, the token-free OpenAPI response, bearer-session authority, required-MFA continuation, and #1059's future sender constraint. Later API and contract/client changes must be separate approved tasks. | Row 22 / gap 025; before mobile/web factor UI and before claiming passkey sign-in. Accept one explicit handoff, final account/policy denial before issuance, no discarded/orphan usable session, replay/revocation, expiry, failure atomicity, MFA-required continuation, and redaction cases. | `docs-only` with strong auth/contract review first; later API/OpenAPI/generated-client changes require manual gates. Close the recommendation only after the decision is merged and exact implementation owners are split. |
| `REC-AUTH-MFA-SIGNIN-001` Password-primary MFA and pending-flow binding | Docs/control decision first: define how successful password-primary authentication creates a bounded pending auth flow, how anonymous MFA creation/verification binds to that flow/account, when final session authority is issued, and how recovery/anti-lockout works. Later API, contract, and client work must be separate. | Row 22 / gap 014; #394 is the non-executable parent and #465 is UI-only. Accept required-factor enforcement, generic public failures, same-flow/account/session binding, expiry/replay/attempt limits, session issuance only after policy satisfaction, recovery, and redacted audit. | `docs-only` with strong auth/security review first; later API/OpenAPI/generated-client and client tasks require manual gates. Close only after the decision and exact executable owners are split. |
| `REC-AUTH-ABUSE-001` Trusted-source and distributed auth-abuse design | Docs/control only first: define proxy trust, privacy-safe source derivation, distributed/atomic counters, reset/restart behavior, per-workflow keys, MFA/passkey ceremony attempts, retry semantics, observability/redaction, degradation, and contract-aligned `429` states. A later issue must split API/config tests; no provider or exposure activation. | Rows 19-20 and 22; precedes #777. Accept spoofed-forwarded-header, restart, multi-node, concurrency, factor guessing, saturation, privacy, enumeration and rollback cases. | `docs-only`/strong security review first; later `api` and configuration manual gates. Close only when the design is merged and later runtime owner is explicitly split. |
| `REC-AUTH-CONTRACT-DRIFT-001` Reset/invitation OpenAPI runtime-description reconciliation | Contract-only correction to canonical reset request/completion and invitation policy/create/revoke/resend descriptions plus regenerated clients if output changes. It must credit mapped runtime without asserting provider enablement, public readiness, or UI completeness. | Rows 11/14, gaps 026-027; existing runtime owners #339/#784 remain authoritative. Accept exact route/source parity, unchanged schemas/status semantics, generated-client reproducibility, and zero runtime/config change. | `openapi-client`; strong auth/contract review. Close after canonical prose and generated documentation match current source on one exact head. |
| `REC-MOBILE-AUTH-001` Mobile account-security composition | Mobile UI/adapters/tests only, adopting #772/#774/#784/#394/#1204 APIs and preserving generated clients. No auth/API/policy behavior. | Stable owning APIs/reference first. Accept password change, factor/passkey/recovery, invitation/policy states, session/security center, error/offline/revoked states, a11y and real-device proof. | `mobile`; strong auth + visual/platform manual review. Close only when unowned composition is merged and owner-specific gates remain visible. |
| `REC-WEB-AUTH-001` User-web session boundary and account security | `apps/web-user` UI/adapters/tests only unless a separately approved contract gap is proven. Define credential storage, refresh serialization, protected routing, sign-out, current actor/session, password/factor/security composition. | Rows 10/22/25; #373 shell and existing API first. Accept refresh/replay/revoke races, tab/reload/back navigation, unavailable/disabled states, a11y and narrow layouts. | `web-ui`; strong auth/security + visual manual review. Close only with ordinary browser launch reaching protected routes through validated server state. |
| `REC-L10N-D1-016` User-web reset-completion catalog adoption | Catalog and presentation adapter/tests only; do not change token capture/scrub, error mapping, request shape, route, or reset behavior. | After #965 boundaries; existing reset completion stays implemented. | Web localization with inherited strong auth review. Close on keyed copy, expansion/a11y and identical state mechanics. |
| `REC-L10N-D1-018` Mobile auth/session copy inventory and split | Non-runnable docs inventory first; later catalog/UI children inherit each auth owner. | Rows 10/13/22/24 and their owners. | `docs-only` first; later mobile/auth review. Close inventory only when every string/state has one behavioral owner and one catalog lane. |
| `REC-L10N-D1-025` User-web auth/session copy inventory and split | Non-runnable docs inventory first; no credential/session implementation. | `REC-WEB-AUTH-001` supplies behavior; catalog work follows stable states. | `docs-only` first; later web/auth review. Close inventory only with one-to-one safe state mapping and no behavior ownership. |

## 7. Security invariants and negative findings

- Passwords are accepted only at bounded credential endpoints and persisted as
  Argon2id verifiers with salts/parameters. No plaintext or reversible password
  persistence was found.
- Access, refresh, reset, invitation, recovery-code, and challenge material is
  not persisted raw. Server-side hashes/verifiers and lifecycle state are the
  authority. TOTP secrets are protected through the data-protection boundary;
  passkey private material is never server-owned.
- Clients never determine authorization from route visibility, cached roles,
  UI state, local storage, or generated methods. Current actor/profile/roles and
  session validity come from validated server state.
- Refresh rotation/reuse and revocation are credited only for their current
  tested server semantics. They do not imply sender constraint, security
  notification delivery, unfamiliar-device classification, or public safety.
- Reset and invitation material, lifecycle, recipient policy, and delivery are
  separate. Neither flow substitutes for registration, account recovery, or
  provider recovery.
- First-owner bootstrap and local-account/registration policy are separate from
  ordinary sign-in. Role/owner lockout decisions remain manual-gated.
- Abuse behavior is distinct from enumeration-resistant UI copy. Process-local
  throttles and fixed source keys are explicitly not called public-grade.
- Audit/log/report evidence excludes credentials, raw tokens, reset/invitation
  material, recovery codes, MFA secrets, passkey private material, unsafe
  provider payloads, and private user diagnostics.
- Public exposure remains separately gated. Localization recommendations may
  map approved states to catalog keys but never alter auth/session behavior.

## 8. Duplicate prevention and stale-owner reconciliation

Exact and semantic searches covered live issues, comments, merged pull
requests, source history, the progress/QA records, and current branches/PRs.
The pre-edit record is
`/workspace/logs/settleora-965-auth-reconnaissance-20260914-1952.md`.

- #337/#338/#339 remain useful umbrellas, but their historical missing-work
  wording is overridden by the merged source credited above.
- #394 remains the factor/security parent, but #413-#417 and #501-#506 are
  complete. #417 is CLOSED; #465 remains open. #776 must not recreate them.
- #784 retains invitation ownership after crediting PRs #792-#799.
- #1059 and #1204 already own sender-constrained/persistent-session and
  password-manager work; no replacement issue is recommended.
- #369/#973 own notification reconciliation; #721 owns lifecycle wording and
  retention; #777 owns exposure; #772-#775 keep their distinct recovery lanes.
- No live focused owner was found for passkey sign-in credential handoff,
  password-primary MFA/pending-flow enforcement, distributed auth-abuse design,
  reset/invitation contract drift, the mobile account-security composition, or
  the user-web session boundary, so exactly one recommendation is recorded for
  each.
- No same-scope #965 branch or PR existed at the pre-edit checkpoint.

## 9. Dependency-safe wave and close rules

The first safe wave is the docs/control-only
`REC-AUTH-PASSKEY-SESSION-001`. It addresses the highest-priority current
correctness/contract defect without changing secrets/configuration, issuing a
new credential, changing a schema, or modifying auth runtime. It must decide
whether current bearer-session handoff or #1059's later sender constraint owns
the durable credential path, how completion revalidates account/policy state,
and how `mfa_required` continues. Any later
implementation must be split by lane and manually authorized.

After that prerequisite, dependency order is:

1. Server authority/correctness: rows 18-23, including role lockout, factor
   enforcement disposition, audit sources, and distributed abuse controls.
2. Persistence/schema only where a separately approved owner proves need,
   including #1059. No schema work is authorized here.
3. OpenAPI/generated clients only after stable server contracts.
4. Mobile, user-web, and admin entry surfaces in separate tasks.
5. Provider/delivery and physical-device proof with redacted evidence.
6. Public exposure under #777, then later aggregate acceptance under #975.

#965 may close only after this audit merges, its completion evidence is posted,
#336 and directly affected owners receive the current graph, every gap retains
one owner/recommendation, and the first safe wave remains named but not
auto-started. #336 stays open. #975 and #946 stay inactive. R05/#1235 remains
paused and confers no testing, deployment, secret, DNS/TLS, or exposure
authority.

## 10. Validation contract

The candidate must prove:

- exact one-path diff against current `origin/main`;
- `git diff --check origin/main...HEAD`;
- `npm run doctor:validation`, `npm run validate:docs`, and
  `npm run validate:scaffold`;
- 32-row status arithmetic (`8 + 13 + 2 + 5 + 2 + 1 + 1 = 32`);
- 27 unique gap IDs and 9 unique recommendation IDs;
- existence of every cited repository path, test, OpenAPI operation, and
  generated method;
- relative-link validation and live issue/PR verification;
- sensitive-material scan and no-runtime-change assertion;
- fresh strong independent and local Codex factual/mechanics review on the same
  exact head/tree, followed by exact-head GitHub review and zero unresolved
  actionable threads before merge.
