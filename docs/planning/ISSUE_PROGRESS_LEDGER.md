# Issue Progress Ledger

## Purpose

This ledger prevents stale GitHub issue or Project state from causing duplicated
work. Current repo state, merged PRs, issue comments, and latest Codex reports
remain the source of truth.

## Rules

- An open issue is not proof of unfinished scope, and a closed issue is not
  proof that every adjacent Day 1 runtime slice is complete.
- Before planning issue-based work, check merged PRs, issue comments, recent
  `.codex/reports/` files, relevant planning docs, and this ledger.
- Do not close ambiguous umbrella issues automatically.
- Record completed slices, remaining Day 1 work, future gates, blockers,
  manual decisions, and close/keep-open recommendations.
- If a PR, merge SHA, report, or project field cannot be verified, write
  `unverified` and leave the issue or project row unchanged.

## Current Checkpoints

### Issue #800 - DevBox auto-runner foundation and real-run safety hardening checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
- Verified repo baseline:
  `origin/main` at
  `eaaf0ee1baf5d70dad558e0b5f5569911d1e8459` before this hardening task
  branch.
- Foundation completed:
  - PR #801 `Add DevBox unattended Codex auto-runner foundation` was merged to
    `main`.
  - PR #801 merge/final main SHA:
    `eaaf0ee1baf5d70dad558e0b5f5569911d1e8459`.
  - Foundation scope added `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md` and
    `tools/auto-runner/**` for issue-label polling, safe claim modeling,
    lane/danger gates, generated Codex prompts, DevBox-local Codex invocation,
    report collection, validation planning, pre-PR review package/review gate,
    explicit-path commit plumbing, PR/check stubs, summaries, external log
    directories, and example-only systemd templates.
- This hardening slice:
  - Adds non-mutating preflight diagnostics for repo/GitHub/Codex/log/config
    readiness.
  - Adds dry-run fixture issue simulation for deterministic multi-iteration
    loop evidence without live GitHub or Codex mutation.
  - Hardens issue claim/outcome lifecycle cleanup so terminal outcomes remove
    `auto-running`, PR-opened outcomes add `auto-pr-opened`, and blocked/
    failure outcomes add stop labels.
  - Refines workflow/tooling lane policy to avoid generic `config` false
    positives while preserving gates for auth/security, storage/privacy,
    money/settlement/payment/bill calculation, schema/migration,
    OpenAPI/generated clients, sync/import/export/restore, Docker/CI/
    deployment, secrets/env, public/admin exposure, mobile release, branch
    cleanup/history rewrite, and architecture replacement.
  - Hardens reviewer verdict parsing and documents review package evidence and
    mutation guard behavior.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted real-run operation
  and does not complete broader unattended runner enablement.
- Remaining #800 manual gates:
  trusted real-run operation, any auto-merge lane, stale-claim stealing,
  follow-up issue creation, review-fix cycle mutation, systemd service/timer
  installation or enablement, and any future expansion beyond workflow/tooling
  paths.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issues #336/#337/#784/#777 - Invitation lifecycle cleanup runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the API/domain-owned
    invitation lifecycle cleanup/retention runtime slice. Delivery persistence/
    outbox, distributed abuse storage, UI/Figma/mobile/user-web/admin-web
    surfaces, public self-registration, OIDC-adjacent onboarding, and
    production/public-exposure gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `63a1bdf12f7e1bce609fe7a82d32bf1d70532c85` before this task branch.
- Branch:
  `feature/auth-invitation-lifecycle-cleanup-runtime-20260709-0008`.
- Completed slice:
  - Added `IInvitationLifecycleCleanupService` under the auth invitation
    runtime boundary and registered it through the existing invitation service
    collection wiring.
  - Cleanup is invoked from existing invitation management/read/mutation and
    public acceptance paths before normal invitation queries, with no new
    background worker or cross-domain table mutation.
  - Pending invitations whose server-controlled `ExpiresAtUtc` has passed are
    marked `expired`, receive bounded `ExpiredAtUtc`/`UpdatedAtUtc`
    timestamps, and become cleanup-eligible after the current 90-day terminal
    retention posture.
  - Accepted, revoked, and expired terminal invitations are hard-deleted only
    after `CleanupEligibleAtUtc` has passed, avoiding retention of contact and
    hash material without schema changes.
  - Cleanup is idempotent and bounded to 50 total invitation changes per
    invocation; unexpired pending invitations and terminal invitations before
    cleanup eligibility are retained.
  - Added `invitation.cleanup_completed` audit only when cleanup changes state.
    Metadata contains counts/categories, batch-cap state, and a safe timing
    bucket only; it does not include invitation IDs, raw invitation secrets,
    raw links, secret hashes, full contact identifiers, SMTP/provider
    diagnostics, request bodies, passwords, session/refresh material, source
    IP, user-agent, or unrelated user data.
- Validation checkpoint:
  - Focused
    `InvitationLifecycleCleanupRuntimeTests|InvitationAcceptanceRuntimeTests|InvitationManagementRuntimeTests|InvitationEmailSenderTests`
    filter passed with `50` passed, `0` failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  delivery attempt persistence/outbox if chosen, distributed abuse controls,
  UI/Figma/mobile/user-web/admin-web surfaces, public self-registration and
  OIDC-adjacent onboarding gates, and production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation lifecycle cleanup runtime,
  focused tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, delivery attempt persistence/outbox
  schema or worker behavior, distributed limiter storage, invitation email/
  provider transport semantics, public invitation accept response shape,
  session or refresh credential issuance from invitation acceptance, public
  self-registration, OIDC/Keycloak runtime, owner/admin invitation target
  roles, owner/admin role assignment, local-account/admin-created-user
  hardening outside existing invitation acceptance, mobile/user-web/admin UI,
  Figma, production/public exposure, Docker/CI/deployment, appsettings/env/
  secrets, storage, sync, import/export, backup/restore, OCR, money,
  settlement, payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation abuse controls runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only a focused single-node
    invitation abuse-control runtime foundation for current create/resend/
    accept flows after PR #797. Delivery persistence/outbox, distributed abuse
    storage, cleanup/retention jobs, UI/Figma, public self-registration,
    OIDC-adjacent onboarding, and production/public-exposure gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `fec1267b52c322bfe69596f219e09a26db617a53` before this task branch.
- Branch:
  `feature/auth-invitation-abuse-controls-runtime-20260708-2328`.
- Completed slice:
  - Added `IInvitationAbusePolicyService` with invitation-specific request,
    decision, outcome, operation, scope, and option types plus an in-memory
    single-node implementation registered under the invitation runtime.
  - Invitation abuse bucket keys are bounded safe values derived from
    operation, actor, subject/contact/invitation/material, and a conservative
    local source bucket. Raw invitation secrets, raw emails, raw links, SMTP
    diagnostics, request bodies, provider payloads, passwords, session tokens,
    refresh material, and secret hashes are not used as bucket keys or echoed
    by debug strings.
  - Owner/admin create checks abuse policy after request normalization and
    before duplicate lookup, raw invitation secret generation, row creation, or
    delivery handoff. Throttled create returns the existing contract-supported
    `429` problem response and creates no invitation rows.
  - Owner/admin resend checks abuse policy before lookup by actor/invitation
    category and again after safely loading the invitation/contact category,
    before hash rotation, template composition, or email/sink handoff.
    Throttled resend returns `429` without rotating or sending.
  - Public accept now uses invitation-specific abuse semantics instead of the
    sign-in abuse service, still using only a safe invitation-material
    fingerprint plus conservative local source bucket before lookup/account
    work. Throttled accept remains generic and does not issue sessions or
    refresh credentials.
  - Added focused tests proving create/resend throttling prevents row creation,
    hash rotation, delivery handoff, and raw material exposure; public accept
    throttling stays generic and creates no account; safe bucket/debug helpers
    do not echo raw secrets, contact, or source values; existing invitation
    success paths still pass.
- Validation checkpoint:
  - Focused `InvitationManagementRuntimeTests|InvitationAcceptanceRuntimeTests`
    filter passed with `36` passed, `0` failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Abuse-control storage posture:
  single-node/in-memory only. Counters reset on process restart and are not
  coordinated across API replicas; distributed Redis/database/provider-backed
  persistence remains a future reviewed #784 gate.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  delivery attempt persistence/outbox if chosen, distributed abuse controls,
  lifecycle cleanup/retention jobs, UI/Figma/mobile/user-web/admin-web
  surfaces, public self-registration and OIDC-adjacent onboarding gates, and
  production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation abuse-control runtime,
  focused tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, notification delivery persistence/
  outbox schema, public self-registration, OIDC/Keycloak runtime, owner/admin
  invitation target roles, owner/admin role assignment, local-account/admin-
  created-user hardening outside existing invitation acceptance, session or
  refresh-token issuance from invitation acceptance, mobile/user-web/admin UI,
  Figma, production/public exposure, Docker/CI/deployment, appsettings/env/
  secrets, storage, sync, import/export, backup/restore, OCR, money,
  settlement, payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Admin invitation delivery runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the admin create/resend
    invitation delivery wiring slice after PR #796. Delivery persistence/outbox,
    broader abuse hardening, cleanup/retention jobs, UI/Figma, public
    self-registration, OIDC-adjacent onboarding, and production/public-exposure
    gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `d4b9306732bf4712a0b83579aa30f9b156863106` before this task branch.
- Branch:
  `feature/auth-invitation-admin-delivery-runtime-20260708-2246`.
- Completed slice:
  - Added an invitation-specific internal email sender boundary that accepts
    only a send-ready invitation message plus recipient email, reuses the
    existing SMTP transport in production mode, treats local/test sink modes as
    non-SMTP safe sink acceptance, and returns redacted bounded categories.
  - Wired owner/admin invitation create to persist the hash-only invitation row
    before any raw invitation material leaves through the explicit delivery
    boundary, while preserving `not_requested` behavior when delivery is false.
  - Wired owner/admin resend so `deliveryRequested=false` does not rotate,
    unavailable readiness/template delivery does not rotate or claim delivery,
    and ready delivery rotates the stored hash before handoff so old raw
    material no longer redeems after rotation.
  - Added bounded `invitation.delivery_result` audit metadata and kept
    `invitation.created`/`invitation.resend_requested` metadata secret-free.
  - Added focused tests for not-requested create/resend, disabled/unavailable
    delivery, configured production SMTP handoff, sink-mode no-SMTP behavior,
    provider exception mapping, resend no-rotation cases, resend rotation with
    public accept proof, sender redaction, and regression coverage across
    invitation management/acceptance/readiness/template/SMTP/provider tests.
- Validation checkpoint:
  - Focused `InvitationEmailSenderTests|InvitationManagementRuntimeTests|
    InvitationAcceptanceRuntimeTests` filter passed with `40` passed, `0`
    failed, `0` skipped.
  - Broader focused invitation/email regression filter passed with `136`
    passed, `0` failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  delivery attempt persistence/outbox if chosen, stronger/distributed abuse
  controls, lifecycle cleanup/retention jobs, UI/Figma/mobile/user-web/admin-web
  surfaces, public self-registration and OIDC-adjacent onboarding gates, and
  production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation admin delivery runtime,
  invitation-specific SMTP/sink sender code, focused tests, and this ledger
  entry. It does not change OpenAPI/contracts, generated clients,
  schema/migrations, notification delivery persistence/outbox schema, public
  invitation accept/redeem semantics or response shape, public
  self-registration, OIDC/Keycloak runtime, owner/admin invitation target roles,
  owner/admin role assignment, local-account/admin-created-user hardening,
  mobile/user-web/admin UI, Figma, production/public exposure,
  Docker/CI/deployment, appsettings/env/secrets, storage, sync, import/export,
  backup/restore, OCR, money, settlement, payment, bill calculation, issue
  closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation delivery/link foundation checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only an internal invitation
    email-delivery readiness and configured-link/template foundation. Admin
    create/resend still do not send email, rotate resend secrets, queue
    delivery, or claim sent delivery.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `bd7b0c3870eb04e6efb2974dc76482a28642b98d` before this task branch.
- Branch:
  `feature/auth-invitation-delivery-link-foundation-20260708-2210`.
- Completed slice:
  - Added invitation email delivery options/readiness services under the auth
    invitation runtime boundary, default disabled/off and fail-closed when
    SMTP/provider readiness, delivery mode, public origin, or invite path is
    unsafe or unconfigured.
  - Added invitation-specific configured-origin/link policy and template
    composer. Raw invitation material is accepted only as method input and is
    placed only in the send-ready invitation link/message returned by the
    explicit internal composition boundary.
  - Kept public-origin handling explicit and configuration-only. Link
    construction does not derive origins from request `Host`, forwarded,
    referrer, or other client-controlled headers.
  - Added redacted preview and `ToString()` behavior that excludes raw
    invitation secrets, raw links, full contacts, SMTP/provider values, request
    bodies, passwords, tokens, and provider diagnostics.
  - Registered the internal invitation delivery readiness/template services
    through the existing invitation service collection wiring without changing
    admin create/resend delivery behavior.
  - Added focused tests for disabled defaults, no fake sent state, unsafe
    public origins, unsafe invite paths, configured-origin/path-only link
    construction, raw secret redaction outside send-ready messages,
    privacy-safe generic templates, no realistic SMTP/provider config values,
    and DI registration.
- Validation checkpoint:
  - Focused `InvitationEmail` test filter passed with `38` passed, `0`
    failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  connecting admin create/resend to reviewed provider delivery, resend
  rotate-and-deliver behavior, delivery attempt persistence/outbox if chosen,
  stronger/distributed abuse controls, lifecycle cleanup/retention jobs, UI
  surfaces, public self-registration and OIDC-adjacent onboarding gates, and
  production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation internal delivery/link
  foundation, focused tests, configuration binding coverage, and this ledger
  entry. It does not change OpenAPI/contracts, generated clients,
  schema/migrations, admin create/resend delivery behavior, actual SMTP
  sending from invitation create/resend, public invitation accept/redeem
  semantics, invitation acceptance response shape, public self-registration,
  OIDC/Keycloak runtime, owner/admin invitation target roles, owner/admin role
  assignment, local-account/admin-created-user hardening, mobile/user-web/admin
  UI, Figma, production/public exposure, Docker/CI/deployment,
  appsettings/env/secrets, storage, sync, import/export, backup/restore, OCR,
  money, settlement, payment, bill calculation, issue closure, or branch
  cleanup.

### Issues #336/#337/#784/#777 - Public invitation accept/redeem runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the public invitation
    accept/redeem runtime slice for the existing
    `POST /api/v1/auth/invitations/accept` contract. Invitation email/provider
    delivery, invitation link construction, resend rotate-and-deliver behavior,
    public self-registration, OIDC/Keycloak runtime, broader abuse controls,
    lifecycle cleanup jobs, UI/Figma, and adjacent auth onboarding gates remain
    open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `6748624663805c78ccafe443decf7c6ff32ca60f` before this task branch.
- Branch:
  `feature/auth-invitation-public-accept-redeem-runtime-20260708-2041`.
- Completed slice:
  - Added anonymous `POST /api/v1/auth/invitations/accept` runtime for the
    existing OpenAPI request/response shape without changing contracts or
    generated clients.
  - Added strict request parsing for object-only JSON, required
    `invitationSecret`, `displayName`, and `localPassword`, unsupported-field
    rejection, and bounded field validation.
  - Reused the internal invitation secret hash/version boundary for
    admin-created invitation material and public redemption lookup; raw
    invitation material remains request-only and is not persisted, returned, or
    audited.
  - Enforced server-side pending/unaccepted/unrevoked/unexpired, user-only,
    email-only, and capability-enabled redemption policy. Capability disabled
    fails closed.
  - Created the invited Day 1 local user account/profile/identity/credential
    through the existing credential workflow boundary, assigned only system
    `user`, and returned only `accepted_sign_in_required` with
    `signInRequired: true`.
  - Marked accepted invitations terminal in the same account/credential
    transaction where relational transactions are available, with non-relational
    cleanup coverage for focused tests.
  - Added bounded `invitation.accepted` success audit and generic bounded
    `invitation.accept_failed` audit for pre-transaction public failures. Audit
    metadata excludes raw secret, raw link, secret hash, full email/contact,
    password, verifier, session/refresh token, provider payload, request body,
    and unrelated user data.
  - Reused the existing in-memory sign-in abuse policy service with a safe
    invitation-material fingerprint and fixed single-node source bucket for
    public accept attempts.
- Validation checkpoint:
  - Focused `InvitationAcceptanceRuntimeTests` passed with `14` passed, `0`
    failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  invitation delivery/provider behavior, invitation link construction,
  resend rotate-and-deliver behavior, distributed/stronger abuse controls,
  lifecycle cleanup, UI surfaces, public self-registration and OIDC-adjacent
  onboarding gates, and production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation public accept/redeem
  runtime, focused tests, and this ledger entry. It does not change OpenAPI/
  contracts, generated clients, schema/migrations, invitation email/provider
  delivery, invitation link construction, public self-registration,
  OIDC/Keycloak runtime, owner/admin role assignment, mobile/user-web/admin UI,
  Figma, production/public exposure, Docker/CI/deployment, appsettings/env/
  secrets, storage, sync, import/export, backup/restore, OCR, money,
  settlement, payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation admin management runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the owner/admin invitation
    management runtime slice for create/list/get/revoke/resend over the
    existing contract. Public accept/redeem runtime, email/provider delivery,
    invitation link construction, broader abuse controls, lifecycle cleanup,
    UI/Figma, and adjacent auth onboarding gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `069b1f67e93e0a82fda00cfec035880eea07cfe1` before this task branch.
- Branch:
  `feature/auth-invitation-admin-management-runtime-20260708-1957`.
- Completed slice:
  - Added owner/admin-only runtime handlers for
    `GET /api/v1/admin/auth/invitations`,
    `POST /api/v1/admin/auth/invitations`,
    `GET /api/v1/admin/auth/invitations/{invitationId}`,
    `POST /api/v1/admin/auth/invitations/{invitationId}/revoke`, and
    `POST /api/v1/admin/auth/invitations/{invitationId}/resend`.
  - Kept creation/resend default-off behind the persisted invitation policy;
    revocation of existing pending invitations remains owner/admin-controlled
    even when creation/resend is disabled.
  - Enforced #784 Day 1 constraints: email-only contact identifiers,
    user-only invitation targets, duplicate pending invitation rejection, and
    bounded safe admin readbacks.
  - Added server-side random invitation material generation for create and
    persisted only a versioned lookup hash. Raw invitation material is not
    accepted from admin callers and is not returned by create/list/get/revoke/
    resend responses.
  - Kept delivery truthful in this no-delivery slice: create/resend return
    `provider_unconfigured` or `not_requested` delivery state and do not claim
    queued/sent delivery, construct links, call SMTP, or persist provider
    payloads.
  - Added bounded auth audit events for `invitation.created`,
    `invitation.revoked`, and `invitation.resend_requested` with invitation ID
    and category metadata only. Audit metadata does not include raw invitation
    material, raw links, secret hashes, full contact identifiers, request
    bodies, provider payloads, SMTP diagnostics, passwords, session tokens, or
    refresh tokens.
  - Added focused runtime tests for owner/admin access, normal-user/anonymous
    denial, default-off create/resend blocking, enabled-policy creation,
    user-only/email-only validation, duplicate pending handling, safe readbacks,
    revoke terminal behavior, resend no-fake-delivery behavior, hash-only
    persistence, and audit redaction.
- Validation checkpoint:
  - Focused invitation runtime/schema filter passed with `25` passed, `0`
    failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only API auth invitation admin management runtime,
  focused tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, public invitation accept/redeem
  behavior, email/provider delivery, invitation link construction, public
  self-registration, OIDC/Keycloak runtime, owner/admin role assignment,
  local-account/admin-created-user hardening, mobile/user-web/admin UI, Figma,
  notification/security-center runtime, password reset/change behavior,
  production/public exposure, Docker/CI/deployment, appsettings/env/secrets,
  storage, sync, import/export, backup/restore, OCR, money, settlement,
  payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation policy runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the default-off invitation
    capability/policy runtime foundation. Owner/admin invitation create/list/
    get/revoke/resend handlers, public accept/redeem runtime, raw invitation
    secret generation/hash verification, email/provider delivery, invitation
    link construction, abuse controls, lifecycle cleanup, and UI remain open
    follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `f9153c24057387728e3469cec43a61520b43d985` before this task branch.
- Branch:
  `feature/auth-invitation-policy-runtime-20260708-1846`.
- Completed slice:
  - Added authenticated `GET /api/v1/auth/invitations/capability` runtime
    readout matching the existing OpenAPI contract, defaulting invitation
    capability to disabled/off when no policy row exists.
  - Added owner/admin-only `GET /api/v1/admin/auth/invitation-policy` and
    `PATCH /api/v1/admin/auth/invitation-policy` runtime.
  - Added a narrow API-owned durable `auth_invitation_policies` persistence
    table for invitation policy state only, with active/retired versions,
    capability state, pending-invite grace flag, timestamps, and safe actor
    reference.
  - Added an invitation policy service boundary so API/domain code owns the
    policy write and read decisions; clients and generated clients remain
    display callers only.
  - Wrote safe `invitation.policy_changed` auth audit events only for actual
    policy changes. Repeated idempotent updates return the current readout
    without duplicate audit writes.
  - Added focused runtime/schema tests for default-off behavior, owner/admin
    read/update, normal-user/anonymous admin denial, persistence across service
    scopes, safe audit metadata, idempotent updates, additive migration scope,
    and no mutation of invitation rows, password-reset rows, or active session
    credential state.
- Validation checkpoint:
  - `npm run doctor:validation` passed.
  - Focused auth/runtime regression filter passed with `50` passed, `0`
    failed, `0` skipped.
  - Focused invitation schema/migration filter passed with `5` passed, `0`
    failed, `0` skipped.
  - `/usr/bin/time -f 'ELAPSED=%E EXIT=%x' npm run validate:api` passed with
    `1426` passed, `0` failed, `0` skipped, `ELAPSED=6:24.51 EXIT=0`.
  - `npm run validate:openapi` passed.
  - `npm run validate:clients` passed.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only API auth invitation policy runtime, a narrow
  additive policy-state migration/model, focused tests, and this ledger entry.
  It does not change OpenAPI/contracts, generated clients, owner/admin
  invitation create/list/get/revoke/resend handlers, public invitation
  accept/redeem behavior, raw invitation secret generation/validation,
  invitation email/provider delivery, invitation link construction, public
  self-registration, OIDC/Keycloak runtime, owner/admin role assignment,
  local-account/admin-created-user policy hardening, mobile/user-web/admin UI,
  Figma, notification/security-center runtime, password reset/change behavior,
  production/public exposure, Docker/CI/deployment, appsettings/env/secrets,
  storage, sync, import/export, backup/restore, OCR, money, settlement,
  payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation OpenAPI/generated-client contract checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the reviewed invitation
    OpenAPI contract and generated-client surface slice. Invitation runtime
    policy enforcement, owner/admin create/list/revoke/resend handlers, raw
    invitation secret generation/hash verification, public accept/redeem
    behavior, email/provider delivery, audit writers, abuse controls,
    lifecycle cleanup, and UI remain open follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `91bdcf2b2d4868860728233609a715047d0cc139` before this task branch.
- Branch:
  `feature/auth-invitation-openapi-contract-20260708-1755`.
- Completed slice:
  - Added invitation capability and policy readout contract shapes that
    represent default-disabled invitation capability and preserve owner/admin
    control over future policy mutation.
  - Added owner/admin invitation management transport contracts for create,
    list, get, revoke, and resend under guarded admin auth paths.
  - Kept #784 invitation targets constrained to system `user` only and contact
    identifier kind constrained to `email` only.
  - Added public invitation accept/redeem transport contract with raw
    invitation secret material accepted only as write-only request input.
  - Kept accept/redeem responses anti-enumeration-oriented and token-free; no
    access session, refresh credential, raw invitation secret, raw link, secret
    hash, provider payload, email body, request body, or audit internals are
    exposed by response schemas.
  - Added bounded admin invitation metadata readbacks: invitation ID, lifecycle
    status, contact kind, optional display-safe contact label, user-only target
    role, delivery-state category, lifecycle timestamps, cleanup timestamp, and
    safe actor IDs where policy allows.
  - Added generated web and Dart client updates produced by
    `npm run generate:clients`; generated files were not hand-edited.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only the OpenAPI contract, generated web/Dart client
  output, and this ledger entry. It does not change API runtime endpoints,
  handlers, services, validators, middleware, auth/session behavior, invitation
  token generation/validation, invitation email delivery, public
  self-registration, OIDC/Keycloak, owner/admin role assignment,
  admin-created-user hardening, EF/domain/schema/migrations, mobile/user-web/
  admin UI, Figma, notification/security-center runtime, password reset/change
  behavior, production/public exposure, Docker/CI/deployment,
  appsettings/env/secrets, storage, sync, import/export, backup/restore, OCR,
  money, settlement, payment, bill calculation, issue closure, or branch
  cleanup.

### Issues #336/#337/#784/#777 - Invitation policy/audit readiness checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the docs/control policy,
    capability-state, authorization, lifecycle, audit, abuse, delivery-boundary,
    and future split-readiness slice. Invitation OpenAPI, generated clients,
    runtime create/list/revoke/accept/redeem/send behavior, raw invitation
    secret generation/validation, email/provider delivery, and UI remain open
    follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `502e71356b622344315a6cf066acb0fd80eda955` before this task branch.
- Branch:
  `docs/auth-invitation-policy-audit-readiness-20260708-1728`.
- Completed slice:
  - Added
    [Auth invitation policy and audit readiness](../architecture/AUTH_INVITATION_POLICY_AUDIT_READINESS.md).
  - Recorded that invitations remain a Day 1 available capability, default
    disabled/off until authenticated owner/admin policy enables them.
  - Preserved full Day 1 auth onboarding scope: invitations, public
    self-registration, local accounts, and OIDC/Keycloak remain Day 1 available
    capabilities with risky entry points default off; setup-only first-owner
    bootstrap remains separate and must not become public registration.
  - Defined owner/admin authorization boundaries for invite create/list/revoke/
    resend and invitation policy changes, with public accept/redeem limited to
    a server-authorized redemption attempt.
  - Confirmed #784 invitation targets are system `user` only. Owner/admin
    invitation or role elevation remains excluded and belongs to #785.
  - Kept contact identifiers email-only unless a later reviewed design expands
    the schema and delivery model.
  - Defined lifecycle/readiness expectations for expiry, revocation, single-use
    acceptance, cleanup retention, duplicate pending invitation handling, and
    idempotency.
  - Reaffirmed raw invitation secret/link handling: hash-only at rest, raw
    material only at creation/delivery boundary, never in logs, audit, API
    readbacks, reports, provider diagnostics, or generated examples.
  - Defined audit event families and safe/forbidden metadata for invitation
    policy changes, create/send/resend/revoke/expire/accept/cleanup outcomes.
  - Defined anti-enumeration and abuse posture for public accept/redeem and
    owner/admin create/resend.
  - Linked invitation delivery to the SMTP/email provider policy while keeping
    password-reset SMTP semantics separate.
  - Recorded the future #784 split order: OpenAPI/contract, runtime policy/
    authorization/audit, secret/redemption/lifecycle runtime, email/provider
    delivery, then Figma/UI.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only docs/architecture and docs/planning files. It
  does not change OpenAPI/contracts, generated clients, runtime endpoints,
  invitation token generation/validation, accept/redeem flow, email delivery,
  public self-registration, OIDC/Keycloak, owner/admin role assignment,
  admin-created user policy, mobile/user-web/admin UI, Figma, notification/
  security-center runtime, password reset/change behavior, production/public
  exposure, Docker/CI/deployment, appsettings/env/secrets, storage, sync,
  import/export, backup/restore, OCR, money, settlement, payment, bill
  calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation schema foundation checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the first invitation
    persistence/domain foundation slice. Invitation OpenAPI, generated
    clients, runtime create/list/revoke/accept/send behavior, policy toggles,
    audit writers, email delivery, and UI remain open follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `9334397384c7700ec3addedffc9497849d94ab5d` before this task branch.
- Branch:
  `feature/auth-invitation-schema-foundation-20260708-1649`.
- Completed slice:
  - Added an API-owned auth-domain invitation persistence foundation with an
    additive `auth_invitations` table and `AuthInvitation` domain model.
  - Invitation rows store only `invitation_secret_hash` plus
    `invitation_secret_hash_version`; raw invitation tokens, codes, links,
    reusable material, request bodies, provider payloads, session tokens,
    refresh credentials, password material, storage fields, and money fields
    are not part of the model/table shape.
  - Bounded metadata covers normalized contact identifier kind/value, user-only
    target system role, invited-by auth account/profile, optional revoked-by
    auth account, status, created/updated/expiry, accepted/revoked/expired,
    and cleanup-eligible timestamps.
  - Status is constrained to `pending`, `accepted`, `revoked`, and `expired`;
    target system role is constrained to `user` only. Owner/admin invitation
    assignment and lockout protection remain separate #785 work.
  - Added model/migration tests proving hash-only invite material, user-only
    target role, required indexes/constraints, additive migration operations,
    and no storage/money/sync/security-center side-effect tables.
- Migration assessment:
  the migration is additive and creates `auth_invitations` with restrictive
  auth account/user profile foreign keys plus indexes for secret hash,
  pending contact uniqueness, status/expiry lookup, actor lookup, and cleanup
  lookup. It does not drop, alter, or mutate existing tables.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only API auth invitation domain/schema tests,
  additive EF migration/schema snapshot, and this ledger entry. It does not
  change OpenAPI/contracts, generated clients, runtime endpoints, invitation
  token generation/validation, accept/redeem flow, email delivery, public
  self-registration, OIDC/Keycloak, owner/admin role assignment, admin-created
  user policy, mobile/user-web/admin UI, Figma, notification/security-center
  runtime, password reset/change behavior, production/public exposure,
  Docker/CI/deployment, appsettings/env/secrets, storage, sync, import/export,
  backup/restore, OCR, money, settlement, payment, bill calculation, issue
  closure, or branch cleanup.

### Issues #336/#337/#777 - Auth onboarding full Day 1 policy checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `e4aceacb502022387ce46b53be16cef903a4ec60` before this task branch.
- Maintainer decision:
  the earlier #337 readiness posture that implied OIDC/Keycloak runtime later
  and public self-registration later is superseded. Day 1 auth onboarding must
  preserve invitations, public self-registration, local accounts, and
  OIDC/Keycloak as available product capabilities.
- Corrected Day 1 policy:
  - Default posture is safe: invitations, public self-registration, local
    accounts, and OIDC/Keycloak are off or disabled until explicitly enabled
    by owner/admin policy, except setup-only first-owner bootstrap for an empty
    deployment.
  - Setup-only first-owner bootstrap remains allowed only while no auth account
    exists and must not become public registration.
  - Public self-registration is off by default but must be implemented as a
    gated Day 1 capability, not deferred out of Day 1.
  - Local accounts are available as a Day 1 capability and may be disabled by
    policy only when a safe owner/admin authentication path remains.
  - OIDC/Keycloak are Day 1 available capabilities, default disabled until
    configured, and OIDC-only mode must prevent owner lockout.
  - Invitations are Day 1 available capabilities, default disabled until
    owner/admin policy enables them, and must support safe expiry, revocation,
    and audit in later implementation.
- Issue split/readback:
  - Reused #337 for the broad onboarding policy/capability parent.
  - Reused #464/#465 for admin onboarding/settings UI and Figma planning.
  - Created #784 for Day 1 invitation schema/OpenAPI/runtime.
  - Created #785 for owner/admin role assignment and auth lockout protection.
  - Created #786 for Day 1 public self-registration policy/OpenAPI/runtime.
  - Created #787 for Day 1 OIDC and Keycloak provider runtime.
  - Created #788 for Day 1 local-account and admin-created user policy
    hardening.
  - Reused #773/#775/#776 only as adjacent provider-reset/admin-recovery/
    MFA-passkey gates; they do not replace the core onboarding gates above.
- Security board readback:
  live open code-scanning alerts on `refs/heads/main`: `0`; live open
  Dependabot alerts: `0`.
- Issue posture:
  keep #336, #337, #338, #339, #777, and child issues #784-#788 open. This
  checkpoint records policy and issue split only; it does not implement runtime
  onboarding behavior or complete the auth/session/runtime security epic.
- Scope confirmation:
  this checkpoint is docs/planning and GitHub issue hygiene only. It does not
  change runtime/API/backend behavior, OpenAPI/contracts, generated clients,
  schema/migrations, mobile/user-web/admin UI, password reset behavior,
  session/runtime auth behavior, notification/security-center runtime,
  MFA/passkey runtime, production/public exposure, Docker/CI/deployment,
  appsettings/env/secrets, storage, sync, import/export, backup/restore, OCR,
  money, settlement, payment, bill calculation, issue closure, or issue/project
  metadata beyond creating the child issues with existing labels and posting
  checkpoint comments where recorded in the task report.

### Issues #336/#338/#777 - Current-account session revocation refresh-continuity hardening

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #338 `OPEN`; this checkpoint completes one focused API/test hardening
    slice for current-account session revocation and refresh continuity, but
    the issue remains open for review, future UX/security-center decisions,
    and any later approved session/device visibility work.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `a015ed1e3079030b61ba073129c0b47bbd0a90e7` before this task branch.
- Branch:
  `feature/auth-session-visibility-revocation-audit-20260708-1529`.
- Completed slice:
  - `IAuthSessionRuntimeService.RevokeSessionAsync` now revokes linked active
    refresh session families and active refresh credentials when the revoked
    access session belongs to a refresh lineage.
  - Refresh-family revocation now also marks other active linked access
    sessions in the same affected family revoked, while preserving the existing
    exclusion behavior used by password-change flows to keep the current
    bearer session active.
  - Existing endpoint authorization and public response behavior is unchanged:
    current-account session list remains caller-owned and bounded; per-session
    revocation still filters by current auth account and maps missing,
    cross-account, already-revoked, or inactive targets to the same safe
    unavailable response; current-session sign-out and sign-out-all still
    return no token-bearing body.
  - Added focused service proof that per-session revocation invalidates linked
    refresh family state, active refresh credentials, and sibling access
    sessions without exposing raw access tokens, token hashes, or refresh hashes
    in audit metadata.
- Password change/reset posture:
  - Password change behavior was inspected and left unchanged: it keeps the
    current bearer session active and revokes other active sessions plus linked
    refresh material.
  - Password reset behavior was inspected and left unchanged: successful reset
    revokes active sessions and refresh families according to current policy.
- Notification/security-center posture:
  auth/session/security notifications and credential activity/security-center
  surfaces remain audit-only/future-gated under #369/#774. No notification
  writer/runtime, target schema, UI, or provider delivery behavior was added.
- Validation evidence recorded in the task report:
  focused auth/session/password-change/password-reset tests passed with
  `102` tests, `0` failed, `0` skipped. Broader validation is recorded in the
  associated Codex report for the branch.
- Issue posture:
  keep #336, #338, and #777 open. #337 and #339 were read for context and not
  touched. #369/#774 remain the future gates for notification/security-center
  product surfaces.
- Scope confirmation:
  this checkpoint changes only API auth session runtime and focused API tests,
  plus this ledger entry. It does not change OpenAPI/contracts, generated
  clients, schema/migrations, mobile/user-web/admin UI, notification runtime,
  password-reset request/complete route behavior, email/reset material/link
  behavior, invite/registration/OIDC onboarding, MFA/passkey runtime,
  production/public exposure, Docker/CI/deployment, appsettings/env/secrets,
  storage, sync, import/export, backup/restore, OCR, money, settlement,
  payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#339 - Password reset future gates issue split after PR #771

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #339 `OPEN`; not closed in this task.
- Verified repo baseline:
  `origin/main` at
  `833b480e69760163b83de4b6c4531a521374417c`, the PR #771 merge commit.
- PR #771 merge evidence:
  PR #771 is `MERGED` into `main`; merge commit
  `833b480e69760163b83de4b6c4531a521374417c`; changed files were limited to
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`. PR #771 recorded the final Day 1
  local-account password-reset auth/security acceptance checkpoint.
- Current approved-surface posture:
  the local-account password reset Day 1 surface has no remaining
  approved-surface gates after PR #771. #339 remains open only because it is
  broad/planning-shaped and should not be closed until future optional or
  broader auth/credential surfaces are safely represented elsewhere.
- Duplicate-search readback before creating issues:
  searched open and closed issues for
  `mobile deep link universal app link custom scheme password reset`,
  `provider owned OIDC OAuth SSO password reset helper`,
  `security center credential activity password reset credential change`,
  `admin recovery admin reset change password users owner`,
  `MFA passkey OIDC auth factor local account`,
  `production security review auth public exposure release readiness`, and
  `password reset notification security session event`. No narrow equivalent
  child issues were found for the six newly created future-surface gates.
  Existing broad/adjacent coverage was reused where appropriate.
- Future optional/broader coverage matrix:

  | Surface | Issue | Status | Day 1 blocker? |
  | --- | --- | --- | --- |
  | Broad auth/session/runtime security umbrella | #336 | Existing open epic | Yes for broader E1; not a remaining local password-reset gate |
  | Invitation/public registration/admin-created user/local account/OIDC-Keycloak policy gates | #337 | Existing open child | Separate Day 1 auth policy gate |
  | Current-account session visibility, revocation, new-device/security audit expectations | #338 | Existing open child | Separate Day 1 auth/session gate |
  | Current approved local-account password reset and credential-change workflow | #339 | Existing open planning issue; current approved local reset surface final-accepted by PR #771 | No remaining approved-surface gate after PR #771 |
  | Password-reset mobile universal links, Android app links, iOS associated domains, custom schemes, manual reset-material/code entry, and platform handoff policy | #772 | New open child | Future optional; not a Day 1 blocker unless later approved |
  | Provider-owned/OIDC/OAuth/SSO password-reset helper posture | #773 | New open child | Future optional; not a current Day 1 blocker |
  | Credential activity and security-center surfaces for auth events | #774 | New open child | Future optional unless product-facing security center/credential activity is later approved |
  | Admin-assisted recovery and administrator credential-change boundaries | #775 | New open child | Future optional/manual-gated; not a current Day 1 blocker |
  | Passkey and MFA auth-factor gates and reset/change interactions | #776 | New open child | Future optional/manual-gated beyond current local password-reset surface |
  | Auth production/public-exposure security review gate | #777 | New open child | Future manual security/release gate; not a current local password-reset gate |
  | In-app notification event coverage, including important auth/session/security events | #369 | Existing open notification issue | Separate notification gate; not required for current local password-reset acceptance |
  | Notification deep-link routing | #371 | Existing closed notification-flow issue | Not a password-reset email link/app-link policy gate |
  | Push/email/provider/delivery-state notification runtime | #634 and related notification issue set | Existing open/related notification coverage | Separate notification delivery/provider work |

- GitHub issue hygiene completed:
  - Created child issues #772, #773, #774, #775, #776, and #777.
  - Commented on #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4911285794>.
  - Commented on #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4911285890>.
  - No issue was closed by this task.
- Metadata posture:
  issue labels were set only at creation time using existing repo labels.
  No milestones, assignees, Project fields, or post-creation label mutations
  were updated. Project/status metadata updates were skipped because the task
  did not require safe Project mutation and the issue bodies/comments now carry
  the split coverage.
- Issue posture:
  keep #336 open for broader auth/session/runtime security. Keep #339 open
  for now; it can later be closed only if maintainers confirm all future and
  broader password-reset/credential-change scope is represented by linked
  child issues and no open #339-specific gate remains.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API/backend
  behavior, OpenAPI/contracts, generated clients, mobile/user-web/admin UI,
  email template code/tests, SMTP/provider configuration, appsettings/env/
  secrets, schema/migrations, Docker, CI, deployment, Codemagic/TestFlight,
  notifications runtime, security-center runtime, credential-activity runtime,
  auth-audit runtime, money, settlement, payment, bill, OCR, storage, sync,
  import/export, backup/restore, reconciliation behavior, issue closure, or
  issue/project metadata beyond creating the child issues with existing labels
  and posting the required comments.

### Issues #336/#339 - Password reset A08 and final auth/security acceptance checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Verified acceptance base:
  `origin/main` at
  `21eb3efa0a35b57b5d50a8908e614d0425faa88f`.
- PR #770 merge evidence:
  PR #770 is `MERGED` into `main`; base `main`; head branch
  `docs/pr769-password-reset-a04-email-link-target-post-merge-20260708-0116`;
  reviewed head `858cad2952e5403b58e4fc904f8b9129340a1add`; merge commit
  `21eb3efa0a35b57b5d50a8908e614d0425faa88f`; changed files were limited to
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed Day 1 password-reset evidence:
  - PR #763 exposed only the approved public local password-reset request and
    completion routes, with anonymous/public mapping preserved for both.
  - PR #765 completed mobile A01-A03 request-only UI and repository wiring.
  - PR #767 completed user-web A05-A07 reset-complete fallback UI, fragment
    capture/scrub, generated-client completion call, success state, and
    generic invalid-link state.
  - PR #769 completed A04 reset email subject/body/link-target alignment.
  - PR #770 recorded post-merge ledger hygiene for A04.
- A08 decision:
  `not_applicable_current_surface`.
  Current repo search found no approved Day 1 provider-owned password-reset
  surface, no external identity-provider sign-in/reset runtime, no OAuth/SSO/
  social-login password ownership surface, and no reset-complete UI state that
  requires a provider-owned helper message. The current mobile request
  submitted state includes only the already-approved generic support line for
  externally managed accounts, and backend/OpenAPI policy continues to state
  Settleora reset applies only to local-account passwords. No A08 runtime, UI,
  OAuth/OIDC behavior, helper state, or account-provider logic is implemented
  or required by this checkpoint.
- Final acceptance matrix:
  - Request route remains public and uniform: `POST
    /api/v1/auth/password-reset/request` returns the public accepted response
    shape without exposing account existence, local-vs-provider state,
    delivery state, reset material, or `Retry-After`.
  - Completion route remains public and bounded: `POST
    /api/v1/auth/password-reset/complete` returns `204 No Content` on success
    and generic bounded failure responses for invalid, expired, consumed,
    replayed, malformed, unavailable, or weak-password outcomes, with no
    credential/session issuance.
  - Password policy alignment is verified across OpenAPI, backend, generated
    clients, and user-web validation; `newPassword` remains `minLength: 12`.
  - Email composer uses the approved A04 subject/body and preserves
    `/auth/password-reset#resetMaterial=...`, empty query, and no `token=`
    shape.
  - Email delivery readiness still depends on safe configured origin/provider
    readiness; no SMTP/provider/configuration change is included.
  - Reset material is not returned to clients except through the approved email
    delivery boundary, is stored only as lookup material server-side, and is
    covered by audit/redaction tests for reports, previews, audit text, and
    user-visible failures.
  - User-web reset-complete reads only the URL fragment, scrubs the visible
    fragment, calls generated `completeLocalPasswordReset` with only
    `resetMaterial` and `newPassword`, stores no session/token/current-user
    state, and maps server failures to generic invalid-link copy.
  - Mobile remains request-only: no deep links, universal links, custom
    schemes, reset-material entry, reset-complete UI, or token handling.
  - Notification/security-center/credential-activity remains deferred/
    audit-only for password reset. Future notification runtime still requires
    target/schema/OpenAPI/generated-client/authz/security-copy gates.
  - OpenAPI/generated-client drift is clean after generation.
  - Audit/security redaction tests cover password-reset sensitive material.
- Final validation evidence on
  `21eb3efa0a35b57b5d50a8908e614d0425faa88f` before opening this checkpoint:
  `git status --short` clean; `git diff --check` passed; `npm run
  validate:openapi` passed; `npm run generate:clients` passed; `git diff
  --name-only` and `git diff --stat` were empty; `npm run validate:clients`
  passed; `npm run validate:scaffold` passed; `/usr/bin/time -f
  'ELAPSED=%E EXIT=%x' npm run validate:api` passed with `1409` tests,
  `0` failed, `0` skipped, `ELAPSED=6:19.43 EXIT=0`; focused password-reset/
  route/composer/audit-redaction tests passed with `84` tests; user-web tests
  passed with `129` tests; user-web build passed; user-web lint passed;
  Flutter `pub get` passed; Flutter analyze passed with no issues; Flutter
  tests passed with `820` tests; `npm run validate:docs` passed.
- Missing optional reports:
  the exact optional filenames
  `.codex/reports/settleora-codex-report-20260707-2120-auth-password-reset-route-exposure*.md`
  and
  `.codex/reports/settleora-codex-report-20260707-2108*final-auth-security-acceptance*.md`
  were not found, but equivalent current evidence exists in the ledger, PR
  readbacks, and reports
  `.codex/reports/settleora-codex-report-20260707-2120-password-reset-route-exposure-implementation.md`,
  `.codex/reports/settleora-codex-report-20260707-2146-pr763-password-reset-route-exposure-merge-gate.md`,
  `.codex/reports/settleora-codex-report-20260707-2201-pr763-password-reset-route-exposure-post-merge-hygiene.md`,
  `.codex/reports/settleora-codex-report-20260707-2034-password-reset-final-auth-security-acceptance.md`,
  and
  `.codex/reports/settleora-codex-report-20260707-2108-password-reset-final-auth-security-acceptance-rerun.md`.
- Issue posture:
  keep #336 open because the broad auth/session/runtime security epic still
  includes non-password-reset auth/security work and manual Day 1 acceptance
  concerns. #339 is close-ready after this final acceptance checkpoint PR
  merges, assuming the issue scope is the current Day 1 local password reset
  and credential-change workflow; do not close it from this task.
- Remaining password-reset Day 1 gates:
  none for the currently approved local-account password-reset surface after
  this checkpoint merges. Future optional surfaces remain separately gated:
  provider-owned/OIDC helper UI if a real approved provider-owned surface is
  added, mobile link handling if later chosen, password-reset notifications or
  security-center/credential-activity if later approved, admin-delivered
  recovery, owner/admin reset/change for other users, invitation/public
  registration, MFA/passkey/OIDC runtime, and broader production/security
  review.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API/backend
  behavior, route mappings, OpenAPI/contracts, generated clients, email
  templates, SMTP/provider configuration, appsettings/env/secrets,
  schema/migrations, Docker, CI, deployment, Codemagic/TestFlight, mobile UI,
  user-web UI, admin UI, notifications, security-center, credential-activity,
  auth-audit re-fetch surfaces, money, settlement, payment, bill, OCR,
  storage, sync, import/export, backup/restore, reconciliation behavior, issue
  closure, labels, milestones, assignees, or Project fields.

### Issues #336/#339 - PR #769 password reset A04 email/link target post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/769>.
- PR title:
  `fix(auth): align password reset email link copy`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/password-reset-a04-email-link-target-alignment-20260708-0046`.
- Reviewed source head:
  `79dbc1320c7e90c694a41e14a5932c4763b69025`.
- Merge SHA:
  `1450a0bdd30e664e5f4a5e9409681170dc86d0e7`.
- Previous main/base:
  `5358a5a517cc1d1f436a1e3afed1738948c0c7fb`.
- Issue comments:
  - #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4906428286>.
  - #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4906431027>.
- Post-merge verification:
  `origin/main` is merge commit
  `1450a0bdd30e664e5f4a5e9409681170dc86d0e7`; PR #769 readback is
  `MERGED`, base `main`, source branch
  `feature/password-reset-a04-email-link-target-alignment-20260708-0046`,
  reviewed head `79dbc1320c7e90c694a41e14a5932c4763b69025`, and merge commit
  `1450a0bdd30e664e5f4a5e9409681170dc86d0e7`. The restored source branch
  readback points to `79dbc1320c7e90c694a41e14a5932c4763b69025`.
- Merged diff scope:
  first-parent merge diff was limited to
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`,
  `services/api/src/Settleora.Api/Auth/PasswordReset/IPasswordResetEmailTemplateComposer.cs`,
  and
  `services/api/tests/Settleora.Api.Tests/PasswordResetEmailTemplateComposerTests.cs`.
- Completed A04 slice:
  backend reset email subject is aligned to
  `Reset your Settleora password`; the send-ready text body uses the approved
  generic A04 copy; and the reset-link target remains
  `/auth/password-reset#resetMaterial=...`.
- Link/privacy checkpoint:
  reset material remains carried only in the URL fragment as `resetMaterial`,
  not in query parameters. The generated reset link has an empty query, and no
  `token=` link shape was introduced. Redacted template readbacks remain
  bounded and exclude reset material, token-style URL content, submitted
  identifiers, account email/usernames, SMTP credentials, configured origins,
  and provider payloads.
- Validation checkpoint at reviewed source head:
  full API validation passed with `1409` tests, `0` failed, `0` skipped;
  focused password-reset route/composer tests passed with `84` tests and `30`
  email-composer tests; OpenAPI validation passed; client generation produced
  no tracked generated-client drift; generated-client validation passed;
  scaffold validation passed; docs validation passed; and exact-head GitHub
  checks passed before merge.
- Non-goals preserved:
  no public API route behavior outside the password-reset email composer,
  OpenAPI/contracts, generated clients, schema/migrations, SMTP/provider
  configuration, appsettings/env/secrets, notification runtime/targets,
  security-center/credential-activity/auth-audit re-fetch surfaces, mobile UI,
  user-web UI, Docker/CI/deployment/Codemagic/TestFlight behavior, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees, or
  Project field changes were made.
- Remaining gates:
  A08 provider-owned/helper state only if an approved surface needs it, final
  broader auth/security acceptance, and notification/security-center/
  credential-activity gates only if those surfaces are added later.
- Issue posture:
  keep #336 open. PR #769 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #769 completes only the A04 email/link target alignment slice and does not
  complete the full Day 1 password reset and credential-change workflow.

### Issues #336/#339 - PR #767 user-web password reset complete UI post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/767>.
- PR title:
  `feat(web): add password reset complete flow`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/user-web-password-reset-complete-ui-20260707-2337`.
- Reviewed source head:
  `f3b13029dde6d73883dad48dc8660c70a0e31576`.
- Merge SHA:
  `cf90e10c954df23ba5e7b228839adddc79d0f490`.
- Previous main/base:
  `a96289a8faf411702e6f04868b34a3ec9c5da1ce`.
- Issue comments:
  - #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4905954069>.
  - #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4905955867>.
- Post-merge verification:
  `origin/main` is merge commit
  `cf90e10c954df23ba5e7b228839adddc79d0f490`; PR #767 readback is
  `MERGED`, base `main`, source branch
  `feature/user-web-password-reset-complete-ui-20260707-2337`, reviewed head
  `f3b13029dde6d73883dad48dc8660c70a0e31576`, and merge commit
  `cf90e10c954df23ba5e7b228839adddc79d0f490`. The restored source branch
  readback points to `f3b13029dde6d73883dad48dc8660c70a0e31576`.
- Merged diff scope:
  first-parent merge diff was limited to
  `apps/web-user/src/App.tsx`,
  `apps/web-user/src/PasswordResetCompletePage.test.tsx`,
  `apps/web-user/src/PasswordResetCompletePage.tsx`,
  `apps/web-user/src/passwordResetComplete.test.ts`,
  `apps/web-user/src/passwordResetComplete.ts`,
  `apps/web-user/src/styles.css`, and
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed implementation slice:
  user-web public unauthenticated fallback for the backend reset-link path
  `/auth/password-reset#resetMaterial=...`, covering A05-A07:
  - A05 reset-complete form with approved title, body, field labels, primary
    action, secondary action, and local password/confirmation validation copy.
  - A06 `Password updated` success state after generated-client completion
    succeeds.
  - A07 generic `Reset link unavailable` state for missing, empty, malformed,
    invalid, expired, consumed, replayed, revoked, unknown, unavailable, or
    otherwise failed reset material outcomes.
  - reset material is read from `#resetMaterial=...` in the URL fragment.
  - the fragment is scrubbed from the visible URL after capture.
  - the generated web `completeLocalPasswordReset` transport is called with
    only `resetMaterial` and `newPassword`.
  - new-password client validation uses minimum length `12`, matching the
    current OpenAPI `newPassword` contract.
- Reset material/privacy checkpoint:
  reset material is parsed only from `window.location.hash`, kept only in
  runtime component memory, scrubbed from the visible URL with history
  replacement after capture, passed to generated web only in the completion
  body with `newPassword`, and not rendered, logged, persisted, stored in
  browser storage/cookies, or included in error text.
- Validation checkpoint at reviewed source head:
  `git status --short`, `git diff --check`,
  `npm run test --prefix apps/web-user`,
  `npm run build --prefix apps/web-user`,
  `npm run validate:openapi`, `npm run generate:clients`,
  `git diff --name-only`, `git diff --stat`,
  `npm run validate:clients`, `npm run validate:scaffold`,
  `npm run validate:docs`, and the additional
  `npm run lint --prefix apps/web-user` command passed. Client generation
  produced no tracked generated-client drift.
- Non-goals preserved:
  no general user-web sign-in; no email-template copy changes; no SMTP/provider
  config; no OpenAPI/generated-client changes; no API/backend behavior changes;
  no access tokens, refresh tokens, sessions, current-user state, credential
  storage, cookies, localStorage/sessionStorage persistence, or automatic
  sign-in; no mobile reset-complete UI, universal links, Android app links,
  custom URL schemes, app-link association files, iOS entitlements, Android
  manifest changes, or manual reset-material/code entry; no notification/
  security-center/credential-activity/auth-audit re-fetch surfaces; no schema/
  migrations/deployment/Docker/CI/secrets/money/storage/OCR/sync/import/
  export/backup/restore/reconciliation behavior; and no issue closure, labels,
  milestones, assignees, or Project field mutations.
- Remaining gates:
  A04 email/link target end-to-end confirmation; A08 provider-owned/helper
  state only if an approved surface needs it; final broader auth/security
  acceptance; notification/security-center/credential-activity gates only if
  those surfaces are added later; and future mobile link handling only if later
  chosen and separately gated.
- Issue posture:
  keep #336 open. PR #767 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #767 completes only the user-web A05-A07 fallback slice and does not
  complete the full Day 1 password reset and credential-change workflow.

### Issues #336/#339 - PR #765 mobile password reset request UI post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/765>.
- PR title:
  `feat(mobile): add password reset request flow`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/mobile-password-reset-request-ui-20260707-2240`.
- Reviewed source head:
  `13a40e2d23076d8d02928912dfac48114e07071d`.
- Merge SHA:
  `a0f7c47e2382940363b7e46238d0c3cd77d2e2ef`.
- Previous main/base:
  `861d8f9778fb6112f76561879ec827e152de1666`.
- Issue comments:
  - #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4905287107>.
  - #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4905287063>.
- Post-merge verification:
  `origin/main` contains merge commit
  `a0f7c47e2382940363b7e46238d0c3cd77d2e2ef`; PR #765 readback is
  `MERGED`, base `main`, source branch
  `feature/mobile-password-reset-request-ui-20260707-2240`, reviewed head
  `13a40e2d23076d8d02928912dfac48114e07071d`, and merge commit
  `a0f7c47e2382940363b7e46238d0c3cd77d2e2ef`. The restored source branch
  readback points to `13a40e2d23076d8d02928912dfac48114e07071d`.
- Merged diff scope:
  first-parent merge diff was limited to
  `apps/mobile/lib/app/app_bootstrap.dart`,
  `apps/mobile/lib/app/password_reset_repository.dart`,
  `apps/mobile/lib/app/sign_in_screen.dart`,
  `apps/mobile/lib/main.dart`,
  `apps/mobile/test/password_reset_repository_test.dart`,
  `apps/mobile/test/ui/shell_home_more_profile_parity_visual_capture_test.dart`,
  `apps/mobile/test/widget_test.dart`, and
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed implementation slice:
  mobile A01-A03 request-only password reset UI/runtime behavior is
  implemented in PR #765:
  - A01 sign-in `Forgot password?` secondary action.
  - A02 reset request form using approved copy.
  - A03 anti-enumeration-safe submitted state using approved copy.
  - dedicated mobile password-reset repository seam around the generated Dart
    `requestLocalPasswordReset` transport method, sending only
    `resetIdentifier`.
  - `SettleoraAppBootstrap` wiring from the saved server base URL through the
    generated API client factory pattern.
- Safety checkpoint:
  request-submitted UI remains uniform and does not reveal account existence,
  local-vs-provider account state, SMTP/provider readiness, delivery attempt
  state, provider failure, throttling state, token issuance, token state,
  endpoint paths, internal policy details, or generated-client details. Empty
  identifier validation is local. Network/server failure copy is limited to
  `We could not process this request right now. Try again later.`
- Visual/test checkpoint:
  the existing sign-in visual capture harness was updated to include the
  forgotten-password action. Focused widget/repository coverage was added.
  No brittle new screenshot harness was added.
- Non-goals preserved:
  no A04-A08 reset-complete/email-link target implementation; no reset
  material field or manual code entry; no invalid-link route/state; no
  provider-owned helper state; no deep link, universal link, custom URL
  scheme, app-link, or web handoff; no user-web/admin UI; no notification,
  security-center, or credential-activity behavior; and no OpenAPI,
  generated-client, API, backend, schema, config, or deployment changes.
- Remaining gates:
  A04 reset email/link-target handling, A05-A08 reset-complete/success/
  invalid-link/provider-owned states, reset-complete link target decision,
  broader auth/security acceptance, and notification/security-center/
  credential-activity gates only if those surfaces are added later.
- Issue posture:
  keep #336 open. PR #765 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #765 implements only the mobile request UI slice and does not complete the
  full Day 1 password reset and credential-change workflow.
- Scope confirmation:
  PR #765 does not implement reset-complete UI, reset material entry, invalid
  link routing, deep links, user-web/admin UI, notification runtime,
  security-center, credential-activity, auth-audit re-fetch, OpenAPI/contracts,
  generated-client edits, API route mapping, backend auth runtime behavior,
  password reset policy, SMTP/provider config, appsettings/env/secrets,
  schema/migrations, Docker, CI, deployment, Codemagic/TestFlight behavior,
  money/settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees, or
  Project field mutations.

### Issues #336/#339 - PR #763 password reset route exposure post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/763>.
- PR title:
  `feat(auth): expose local password reset routes`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/auth-password-reset-route-exposure-20260707-2120`.
- Reviewed source head:
  `062c0ca435ade928b9c5d4f20dbb0ea91bb8899b`.
- Merge SHA:
  `c2907f71447ffd90898a3952adfe9c60581dfad1`.
- Previous main/base:
  `e1bf888e6e83503b2424d5237a409251a41f2720`.
- Post-merge verification:
  `origin/main` contains merge commit
  `c2907f71447ffd90898a3952adfe9c60581dfad1`; first-parent merged diff was
  limited to `docs/planning/ISSUE_PROGRESS_LEDGER.md`,
  `services/api/src/Settleora.Api/Auth/PasswordReset/LocalPasswordResetEndpoints.cs`,
  `services/api/src/Settleora.Api/Program.cs`,
  `services/api/tests/Settleora.Api.Tests/AuthenticatedApiPolicyBaselineTests.cs`,
  and
  `services/api/tests/Settleora.Api.Tests/LocalPasswordResetServiceTests.cs`.
- Source branch restoration/readback:
  source branch
  `feature/auth-password-reset-route-exposure-20260707-2120` exists remotely at
  reviewed head `062c0ca435ade928b9c5d4f20dbb0ea91bb8899b`.
- Issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4904625903
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4904628178
- Completed merged checkpoint:
  PR #763 exposed only the two approved public local password-reset runtime
  routes:
  - `POST /api/v1/auth/password-reset/request`
  - `POST /api/v1/auth/password-reset/complete`
- Route behavior checkpoint:
  the request route remains anonymous and anti-enumeration safe, returning
  uniform `202 Accepted` with no body and no `Retry-After`. The completion
  route remains anonymous, returns `204 No Content` for valid reset material,
  returns generic bounded problem responses for invalid/unavailable material,
  and does not issue access tokens, refresh credentials, sessions, or sign the
  user in.
- Scope confirmation:
  PR #763 did not change OpenAPI/contracts, generated clients, schema/
  migrations, password-reset token policy, notification writer/runtime,
  notification targets, security-center, credential-activity, SMTP/provider
  configuration, secrets/config/env, mobile/web/admin UI, product copy outside
  the ledger checkpoint, deployment/Docker/CI/Codemagic/TestFlight behavior,
  money/settlement/payment/bill/OCR/storage/sync/import/export/backup/
  restore/reconciliation behavior, issue closure, labels, milestones,
  assignees, or Project fields.
- Remaining gates:
  broader Day 1 password-reset UI/runtime acceptance. Notification,
  security-center, and credential-activity gates remain required only if those
  surfaces or password-reset notifications are added later.
- Issue posture:
  keep #336 open. PR #763 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #763 exposes only the approved public password-reset routes and does not
  complete the full Day 1 password reset and credential-change workflow.

### Issues #336/#339 - Password reset UI/product-copy approval package

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Current `origin/main` at package start:
  `ec650a83d6005a919ba9102102746c0a30814930`.
- PR #761 readback:
  PR #761 is `MERGED` into `main` at merge commit
  `ec650a83d6005a919ba9102102746c0a30814930`.
- Package doc:
  `docs/design/mobile/MOBILE_AUTH_PASSWORD_RESET_APPROVAL_PACKAGE_V1.md`.
- Package status:
  `READY_FOR_MANUAL_PRODUCT_REVIEW`.
- Package outcome:
  the repo now has an implementation-ready review package for the Day 1
  local-account password reset experience. It defines the required mobile
  forgotten-password entry point, reset request form, anti-enumeration-safe
  submitted state, reset email subject/preview/body, reset-complete form,
  successful reset state, generic invalid-link family, unsupported/provider-
  owned password copy, visual requirements, conditional web/admin/security-
  center coverage, and manual acceptance checklist.
- Figma/reference evidence:
  existing mobile auth-security, mobile design, user-web, and admin-web
  references remain useful source references. No password-reset-specific Figma
  frames or exported assets were found in the repo. This package is a textual
  product/design review artifact; it is not final approval by itself.
- Route-exposure posture:
  public route exposure remains blocked for
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete`.
- Remaining blockers:
  human product/design approval of the package or a replacement Figma/reference
  package, manual OpenAPI/generated-client gate for changed public runtime
  posture and any target/security-center contract, final public route exposure
  review, and final auth/security acceptance.
- Issue posture:
  keep #336 open. This package does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. This package does not expose public reset routes, implement UI,
  implement notification runtime, or complete the Day 1 password reset and
  credential-change workflow.
- Scope confirmation:
  this checkpoint is docs/design/planning only. It does not change runtime/API
  endpoint behavior, public route mapping, OpenAPI/contracts, generated
  clients, schema/migrations, notification writer/runtime, SMTP/provider
  config, secrets, UI/Figma/mobile/web/admin implementation, deployment/
  Docker/CI/Codemagic/TestFlight behavior, auth/session/security runtime,
  money/settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees,
  Project fields, or `.codex/reports/**` committed files.

### Issues #336/#339 - PR #760 UI/product-copy gate post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/760>.
- PR title:
  `docs(auth): add password reset UI product copy gate`.
- Reviewed source head:
  branch `docs/auth-password-reset-ui-product-copy-gate-20260707-1827` at
  `c53e7d5e2b925b680746148b70fc3bab16aed55e`.
- Merge SHA:
  `20665379246e52f8caec367f729c44d5cde4152f`.
- Merged at:
  `2026-07-07T10:49:05Z`.
- Final `origin/main` at post-merge verification:
  `20665379246e52f8caec367f729c44d5cde4152f`.
- Merged scope:
  `docs/planning/AUTH_PASSWORD_RESET_UI_PRODUCT_COPY_GATE.md` and
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Merge/readback evidence:
  PR #760 is `MERGED` into `main`; merge commit
  `20665379246e52f8caec367f729c44d5cde4152f` is an ancestor of
  `origin/main`; the merge commit first-parent diff contains only the merged
  scope above; no `.codex/reports/**` files were merged.
- Source branch restoration/readback:
  source branch
  `docs/auth-password-reset-ui-product-copy-gate-20260707-1827` exists
  remotely at reviewed head
  `c53e7d5e2b925b680746148b70fc3bab16aed55e`.
- Existing PR #760 issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4902966824
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4902966799
- Decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Public route posture:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` remain blocked and
  unregistered.
- UI/product-copy gate outcome:
  current repo/reference evidence is insufficient to unblock public
  password-reset route exposure.
- Required public reset surfaces still missing:
  mobile forgotten-password entry point, mobile reset-request submitted state,
  mobile reset-complete form/state, reset email subject/body/preview copy,
  generic expired/consumed/replayed/malformed/unknown/invalid-link states,
  unsupported/OIDC/provider-password states, and safe success copy.
- Conditional surfaces:
  user-web reset screens are required only if user web participates in Day 1
  public auth; admin readout is required only if Day 1 admin scope uses it;
  security-center or credential-activity copy is required only if those
  surfaces or password-reset notifications are used.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only. If a future route-
  exposure design emits password-reset notifications, target/schema/OpenAPI/
  generated-client work plus an authorized current-account security-center,
  credential-activity, or auth-audit re-fetch path must happen first.
- Remaining blockers:
  password-reset UI/Figma/reference/product approval, manual OpenAPI/
  generated-client gate for changed public runtime posture or any
  target/security-center contract, final public route exposure review, and
  final auth/security acceptance.
- Issue posture:
  keep #336 open. PR #760 does not complete the broader auth/session/runtime
  security epic or final auth/security acceptance. Keep #339 open. PR #760
  does not expose public reset routes, complete user-visible reset UX/product
  copy, implement notification runtime, or complete the Day 1 password reset
  and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, public route mapping, OpenAPI/contracts, generated clients,
  schema/migrations, notification writer/runtime, SMTP/provider config,
  secrets, UI/Figma/mobile/web/admin implementation, deployment/Docker/CI/
  Codemagic/TestFlight behavior, auth/session/security runtime, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees,
  Project fields, or `.codex/reports/**` committed files.

### Issues #336/#339 - Password reset UI/product-copy gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Current `origin/main` at gate start:
  `6ce7de222843433a65e0ed923ad7431311363b27`.
- Prior checkpoint posture:
  PR #759 is already merged and is the post-merge ledger checkpoint for
  PR #758. No recursive PR #759 checkpoint is needed.
- Gate doc:
  `docs/planning/AUTH_PASSWORD_RESET_UI_PRODUCT_COPY_GATE.md`.
- Decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Design/reference readback:
  current repo evidence includes approved general mobile auth-security Figma/
  asset references, mobile design reference assets, user-web textual reference,
  and admin-web textual reference. It does not include password-reset-specific
  mobile/web/admin Figma frames, reset-request submitted states,
  reset-complete states, reset email subject/body/preview approval, generic
  invalid/expired/reused/malformed link states, unsupported/OIDC/provider
  states, or security-center/credential-activity copy approval.
- Required public reset surfaces before route mapping:
  mobile forgotten-password entry point, mobile reset request submitted state,
  mobile reset-complete form/state, reset email subject/body/preview copy,
  generic expired/consumed/replayed/malformed/unknown/invalid-link states,
  unsupported/OIDC/provider-password states, and success copy that tells the
  user they can sign in with the new password and that other sessions may have
  been ended for security.
- Conditional surfaces:
  user-web reset entry/completion screens are required if user web
  participates in Day 1 public auth; admin readout/copy is required only if
  current Day 1 admin scope uses it; security-center or credential-activity
  copy is required only if those surfaces or password-reset notifications are
  used.
- Copy requirements:
  request-submit copy must remain anti-enumeration safe; email copy must be
  generic/redacted and include the reset link only in the approved delivery
  boundary; reset-complete and invalid-link copy must not reveal token validity
  or account state; OIDC/provider-password copy must not imply Settleora can
  reset external provider passwords; button labels must be action-specific.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only. If a future
  route-exposure design emits password-reset notifications, target/schema/
  OpenAPI/generated-client work plus an authorized current-account security-
  center, credential-activity, or auth-audit re-fetch route must happen first.
- Remaining blockers:
  approved UI/Figma/reference/product-copy coverage, manual OpenAPI/generated-
  client gate for changed public runtime posture or any target/security-center
  contract, final public route exposure review, and final auth/security
  acceptance.
- Issue posture:
  keep #336 open. This gate does not complete the broader auth/session/runtime
  security epic or final auth/security acceptance. Keep #339 open. This gate
  does not expose public reset routes, complete user-visible reset UX/product
  copy, implement notification runtime, or complete the Day 1 password reset
  and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, public route mapping, OpenAPI/contracts, generated clients,
  schema/migrations, notification writer/runtime, SMTP/provider config,
  secrets, UI/Figma/mobile/web/admin implementation, deployment/Docker/CI/
  Codemagic/TestFlight behavior, auth/session/security runtime, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees,
  Project fields, or `.codex/reports/**` committed files.

### Issues #336/#339 - PR #758 route exposure preflight post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/758>.
- PR title:
  `docs(auth): add password reset route exposure preflight`.
- Reviewed source head:
  `5fd12c532bf4fbda4d59df95475d8d0e907ff3a4`.
- Merge SHA:
  `3d9bc3c6b4f659de6149b417b47626bad1ff809c`.
- Merged at:
  `2026-07-07T09:13:23Z`.
- Final `origin/main` at post-merge verification:
  `3d9bc3c6b4f659de6149b417b47626bad1ff809c`.
- Merged scope:
  `docs/planning/AUTH_PASSWORD_RESET_PUBLIC_ROUTE_EXPOSURE_PREFLIGHT.md`
  and `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Merge/readback evidence:
  PR #758 is `MERGED` into `main`; merge commit
  `3d9bc3c6b4f659de6149b417b47626bad1ff809c` is an ancestor of
  `origin/main`; the merge commit first-parent diff contains only the merged
  scope above; no `.codex/reports/**` files were merged.
- Source branch restoration/readback:
  source branch
  `docs/auth-password-reset-public-route-exposure-preflight-20260707-1529`
  exists remotely at reviewed head
  `5fd12c532bf4fbda4d59df95475d8d0e907ff3a4`.
- Existing post-merge issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4902161582
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4902165409
- Route exposure decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Public route posture:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` remain blocked and
  unregistered.
- Internal-only gates satisfied per PR #758:
  SMTP/email delivery readiness and reset-link/template composition;
  reset-specific request/provider-send throttles; uniform public
  request-response policy; audit/redaction acceptance; local-only/OIDC
  exclusion; token lifetime/replay handling; and account-wide session/
  refresh-family revocation.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only. If a future route
  exposure design emits a password-reset notification, target/schema/OpenAPI/
  generated-client work plus an authorized current-account security-center,
  credential-activity, or auth-audit re-fetch route must happen first.
- Remaining blockers before public route exposure:
  UI/Figma/mobile/web/admin/product-copy gate, manual OpenAPI/generated-client
  gate for changed public runtime posture or any target/security-center
  contract, final public route exposure review, and final auth/security
  acceptance.
- Issue posture:
  keep #336 open. PR #758 does not complete the broader auth/session/runtime
  security epic or final auth/security acceptance. Keep #339 open. PR #758
  does not expose public reset routes, complete user-visible reset UX/product
  copy, implement notification runtime, or complete the Day 1 password reset
  and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - Password reset public route exposure preflight

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Live PR #757 verification:
  <https://github.com/tommytang213/Settleora/pull/757> is `MERGED` into
  `main`, with merge commit
  `bd049c2afffdebb8a7ff9233df105cb7fba644ab`.
- Current `origin/main` at preflight:
  `bd049c2afffdebb8a7ff9233df105cb7fba644ab`.
- Preflight doc:
  `docs/planning/AUTH_PASSWORD_RESET_PUBLIC_ROUTE_EXPOSURE_PREFLIGHT.md`.
- Route exposure decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Current satisfied internal-only gates:
  SMTP/email delivery readiness and reset-link/template composition from
  PR #746, reset-specific request/provider-send throttles from PR #748,
  uniform public request-response policy from PR #750, audit/redaction
  acceptance from PR #752, local-only/OIDC exclusion, token lifetime/replay
  handling, and account-wide session/refresh-family revocation after successful
  internal reset completion.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only, per PR #756. If a
  future route-exposure design emits a password-reset notification, target/
  schema/OpenAPI/generated-client work plus an authorized current-account
  security-center, credential-activity, or auth-audit re-fetch path must happen
  first.
- Remaining blockers before public route mapping:
  UI/Figma/mobile/web/admin/product-copy gate, manual OpenAPI/generated-client
  gate for changing the public route runtime posture or any target/security-
  center contract, final public route exposure review, and final
  auth/security acceptance.
- Current runtime posture:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` remain unregistered/disabled.
  Existing route exposure tests assert both paths are absent from runtime
  endpoint data sources and return `404 Not Found`.
- Issue posture:
  keep #336 open. This preflight does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. This preflight does not expose public reset routes, complete
  user-visible reset UX/product copy, implement notification runtime, or
  complete the Day 1 password reset and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - PR #756 password reset notification target-reference post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/756>.
- PR title:
  `docs(auth): add password reset notification target gate`.
- Reviewed source head:
  `ac7bde43a425c594bb6f1a7ccbc22ecca9100e33`.
- Merge SHA:
  `63c04d495aa8037142090afcb5cc900fde57710f`.
- Merged at:
  `2026-07-07T06:31:37Z`.
- Final `origin/main` at post-merge verification:
  `63c04d495aa8037142090afcb5cc900fde57710f`.
- PR #756 baseline:
  `origin/main` at `86c29bd2eab7008f6304f556383536e7bf072fc5`, the PR #755
  merge commit.
- Merged scope:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_TARGET_REFERENCE_SCHEMA_OPENAPI_GATE.md`
  and `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Merge/readback evidence:
  PR #756 is `MERGED` into `main`; merge commit
  `63c04d495aa8037142090afcb5cc900fde57710f` is an ancestor of
  `origin/main`; the merge commit first-parent diff contains only the merged
  scope above; no `.codex/reports/**` files were merged.
- Source branch restoration/readback:
  source branch
  `docs/auth-password-reset-notification-target-reference-gate-20260707-1411`
  exists remotely at reviewed head
  `ac7bde43a425c594bb6f1a7ccbc22ecca9100e33`.
- Post-restoration scaffold/check readback:
  pre-merge exact-head checks passed, including `Validate scaffold`.
  Post-restoration Scaffold Validation check/run on the restored PR #756
  source branch: run `28846488298`, job `85551530735`, completed successfully
  after the PR #757 checkpoint was opened. This was post-merge source-branch
  restoration activity; all pre-merge exact-head checks for PR #756 had already
  passed before merge.
- Existing post-merge issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4900855538
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4900857670
- Decision summary:
  password-reset notification runtime is not required for Day 1 public
  password-reset route exposure if notifications remain deferred/audit-only.
  If a future route-exposure or security-notification task chooses to emit a
  password-reset notification, first-class target/schema/OpenAPI/generated-
  client work and an authorized current-account security-center or auth-audit
  re-fetch route are required before runtime.
- Target/reference posture:
  prefer an explicit current-account security-center target, optionally paired
  with `authAuditEventId` after authorization/redaction design. Use
  `authAccountId` only where the affected account owner or separately approved
  admin/security recipient is authorized. Do not overload bill, settlement,
  recurring, sync, OCR, group, file, or receipt subject types; do not hide
  auth/security target IDs in `safeSummary`; do not treat raw `actionUrl`,
  generated-client availability, local cache, notification possession, push
  payload possession, or read/archive state as authorization.
- Recipient/redaction posture:
  affected account owner is the only default recipient. Admins/operators are
  not notified unless a later explicit admin/security policy approves it.
  Unrelated users, groups, friends, bill participants, settlement
  counterparties, OCR assignees, and local cache holders must never receive
  password-reset security notifications. Target IDs, audit IDs, account IDs,
  reset material, reset links, token hashes, session/refresh-family IDs,
  provider state, SMTP diagnostics, raw IP/user-agent, and account identifiers
  remain redacted from unauthorized surfaces.
- Required next gates:
  SMTP/email delivery/provider readiness, reset-specific abuse/provider-send
  throttles, UI/Figma/mobile/web/admin/product copy, OpenAPI/generated-client
  manual gate for any target/re-fetch contract, password-reset notification
  runtime gate if notifications are used, final public route exposure gate, and
  final auth/security acceptance.
- Issue posture:
  keep #336 open. This checkpoint does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. This checkpoint does not expose public reset routes, implement
  notification runtime, complete user-visible reset UX/product copy, or
  complete the Day 1 password reset/credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - Password reset notification gate PR #754 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/754>.
- PR title:
  `docs(auth): add password reset notification event gate`.
- Merge SHA:
  `1d1bbc2b496047d3f3e27fe479c15260f6304fe9`.
- Reviewed source head:
  `d456e34c06975eef47afb45992e4c9a1d9dcda78`.
- Final `origin/main` at post-merge verification:
  `1d1bbc2b496047d3f3e27fe479c15260f6304fe9`.
- Merged scope:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_EVENT_TARGET_REDACTION_GATE.md`
  and `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed merged checkpoint:
  docs/control gate for password reset notification event, target/reference,
  recipient, suppression/copy, and redaction posture. Password-reset
  notification runtime remains blocked. Public password-reset request/complete
  routes remain blocked and unregistered.
- Validation/readback summary:
  local docs/scaffold/focused route exposure validation passed during the merge
  gate. GitHub exact-head checks passed for reviewed head
  `d456e34c06975eef47afb45992e4c9a1d9dcda78`. The actual merge commit
  first-parent diff contained exactly the merged scope above, and no
  `.codex/reports/**` files were merged.
- Post-merge hygiene:
  source branch
  `docs/auth-local-password-reset-notification-gate-20260707-1234` exists
  remotely at reviewed head `d456e34c06975eef47afb45992e4c9a1d9dcda78`.
  Issue comments were posted:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4900430331
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4900430332
- Remaining gates:
  target-reference schema/OpenAPI/generated-client gate if notifications are
  used, password-reset notification runtime gate if later approved,
  UI/Figma/mobile/web/admin/product copy gate, final public route exposure gate,
  and final auth/security acceptance.
- Issue posture:
  keep #336 open. PR #754 does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. PR #754 does not expose public reset routes, implement notification
  runtime, complete user-visible reset UX/product copy, or complete the Day 1
  password reset/credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - Password reset notification event/target/redaction gate checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Baseline:
  `origin/main` at `25b7c272cc57d5928c9711a6f294e33b4ff38d9f`, the PR #753
  merge commit.
- PR #753 live verification:
  <https://github.com/tommytang213/Settleora/pull/753> is `MERGED` into
  `main`, with merge commit
  `25b7c272cc57d5928c9711a6f294e33b4ff38d9f` and reviewed source head
  `9eec0d20888df5ec9441d5a3139132a2e765caf1`.
- Completed docs/control checkpoint:
  added
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_EVENT_TARGET_REDACTION_GATE.md`
  to record the Day 1 password-reset notification posture before any future
  public route exposure.
- Decision summary:
  password-reset notification runtime remains blocked. Request, material issue,
  delivery skipped/unavailable/failed/throttled, and reset denial outcomes are
  audit-only by default. Successful reset completion is a candidate future
  affected-account-owner security notification only after target/schema,
  notification runtime, UI/product-copy, route-exposure, and final
  auth/security gates pass. Replay/suspicious reuse requires a manual decision
  and remains audit-only by default. Reset-caused session/family revocation is
  blocked as a separate event until duplicate and target policy are approved.
- Target/reference posture:
  current notification schema/OpenAPI cannot safely represent auth/password
  reset targets. Any future runtime notification needs a first-class
  `authAuditEventId` plus `authAccountId`, an explicit targetless
  security-center model, or a separately approved session-family target. Targets
  must not be hidden in `safeSummary`, and raw `actionUrl` must not be treated
  as authorization.
- Recipient/copy/redaction posture:
  affected account owner is the only default recipient. Admins/owners are not
  notified by default, unrelated users/groups/friends/bill participants must
  never receive auth/security notifications, and ordinary mute/digest/quiet
  hours must not hide required security notifications unless a later security
  policy explicitly approves bounded suppression. External snippets must remain
  generic and must not reveal reset status, delivery state, token validity,
  replay classification, provider state, throttling, or session details.
- Public route exposure:
  still blocked. This checkpoint does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  target-reference schema/OpenAPI/generated-client gate if notifications are
  used, notification runtime gate if later approved, UI/Figma/mobile/web/admin/
  product copy gate, final public route exposure gate, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. No issue closure, labels, milestones, assignees, or
  Project fields were changed.
- Scope confirmation:
  this checkpoint does not change runtime/API endpoint behavior, OpenAPI/
  contracts, generated clients, schema/migrations, notification writer/runtime,
  SMTP/provider config, secrets, UI/Figma/mobile/web/admin implementation,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/
  bill/OCR/storage/sync/import/export/backup/restore/reconciliation behavior,
  or `.codex/reports/**` committed files.

### Issues #336/#339 - Password reset audit/redaction acceptance PR #752 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/752.
- PR title:
  `feat(api): add password reset audit redaction acceptance`.
- Merge SHA:
  `311710242b1935c58d3118998f237cc479e8c763`.
- Reviewed source head:
  `67c0d65001eab8470c57c0ef38718d261b5ad724`.
- Final `origin/main` at post-merge verification:
  `311710242b1935c58d3118998f237cc479e8c763`.
- Merged scope:
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`,
  `services/api/src/Settleora.Api/Auth/PasswordReset/EfPasswordResetAuditWriter.cs`,
  and
  `services/api/tests/Settleora.Api.Tests/PasswordResetAuditRedactionAcceptanceTests.cs`.
- Completed merged checkpoint:
  bounded audit/redaction acceptance for the current internal local password
  reset runtime foundation. Password-reset audit writes no longer populate
  actor or subject auth account IDs, and acceptance coverage verifies bounded
  safe audit/readback metadata across request, material issue, replacement
  revocation, completion, session-revocation audit, replay-suspicious, and
  unknown-material denial outcomes.
- Public route exposure:
  still blocked. PR #752 does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the post-merge focused route
  exposure tests verified the runtime endpoint mappings remain absent and the
  paths are not reachable over HTTP.
- Validation/readback summary:
  live GitHub PR readback showed `MERGED` with merge commit
  `311710242b1935c58d3118998f237cc479e8c763`; git verified that merge commit
  exists and is an ancestor of `origin/main`. The actual merge commit
  first-parent diff contained exactly the three intended files above and no
  `.codex/reports/**` files. Focused post-merge validation passed:
  `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter "FullyQualifiedName~PasswordReset|FullyQualifiedName~LocalPasswordResetRouteExposureTests"`
  with `76` passed, `0` failed, `0` skipped.
- Post-merge hygiene:
  source branch
  `feature/auth-local-password-reset-audit-redaction-acceptance-20260707` was
  auto-deleted after merge and restored to the reviewed head
  `67c0d65001eab8470c57c0ef38718d261b5ad724` with a normal non-force push.
  Issue comments were posted:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4900027170
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4900027181
- Required next gates:
  notification event/target/redaction gate if used, UI/Figma/product copy,
  final public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. PR #752 does not complete the broader
  auth/session/runtime security epic, final auth/security acceptance, public
  reset route exposure, user-visible reset UX/product copy, or the Day 1
  password reset and credential-change workflow.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, labels, milestones,
  assignees, or Project fields.

### Issues #336/#339 - Password reset audit/redaction acceptance PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-audit-redaction-acceptance-20260707`.
- Baseline:
  `origin/main` at `6f37c3e03923e874dca0af367a2025e34c6b6ab1`,
  the PR #751 merge commit.
- Verification timestamp:
  `2026-07-07 11:30 HKT` task window.
- Completed branch checkpoint:
  bounded audit/redaction acceptance for the current internal local password
  reset runtime foundation. Password-reset audit writes are hardened so the
  password-reset audit workflow stores no actor/auth subject account ID and
  keeps readback metadata to `workflowName` plus bounded status categories.
  Focused acceptance coverage exercises request, material issue, replacement
  revocation, completion, session-revocation audit, replay-suspicious, and
  unknown-material denial outcomes.
- Redaction posture:
  password-reset audit/readback/logging-oriented surfaces are covered to exclude
  submitted identifiers, account email/username/display/profile/account IDs,
  recipient email, reset material, reset hashes, reset URL/token/query/fragment
  content, SMTP host/username/password, provider payloads/diagnostics/raw
  exception details, configured public origins, source bucket keys, raw error
  strings, stack traces, and recoverable correlation placeholders. Allowed
  readback remains bounded status/category/scope/reason/readiness/delivery
  labels only.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the runtime route exposure guard
  under `services/api/src` found no public password-reset mapping strings before
  implementation.
- Required next gates:
  notification event/target/redaction gate if used, UI/Figma/product copy,
  final public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, labels, milestones,
  assignees, or Project fields.

### Issues #336/#339 - Password reset public response policy PR #750 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/750.
- PR title:
  `feat(api): add password reset public response policy`.
- Merge SHA:
  `f46f0f4ffe5b73ac6ec77385778801e913aaa4c0`.
- Reviewed source head:
  `b09e9e908296bc4f55fabc165ef12ffb5f3bd63c`.
- Previous main/base:
  `a9d531ee0502269d0c3ff7992089e1470b238c95`.
- Completed merged checkpoint:
  internal password-reset public request-response policy mapping future request
  outcomes to the uniform public posture: `202 Accepted`, no response body, and
  no `Retry-After`. Covered outcomes include delivery disabled/not-ready,
  local/test sink recorded, provider send accepted, provider send failed,
  reset-specific request throttles, and provider-send throttles.
- Public route exposure:
  still blocked. PR #750 does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the OpenAPI paths remain
  transport contracts only, and the post-merge route exposure guard found no
  public password-reset runtime route mapping strings under `services/api/src`.
- Validation/readback summary:
  focused password-reset tests passed with `67` passed, `0` failed, `0`
  skipped. Full `npm run validate:api` passed with `1399` passed, `0` failed,
  `0` skipped. GitHub checks passed on the exact reviewed head
  `b09e9e908296bc4f55fabc165ef12ffb5f3bd63c`.
- Post-merge hygiene:
  source branch
  `feature/auth-local-password-reset-delivery-failure-public-response-20260707`
  was restored to `b09e9e908296bc4f55fabc165ef12ffb5f3bd63c`. Issue comments
  were posted:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4899597867
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4899597862
- Required next gates:
  audit/redaction acceptance, notification event/target/redaction if used,
  UI/Figma/product copy, final public route exposure review, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. No issue closure, labels, milestones, assignees, or
  Project fields were changed. PR #750 does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change runtime source, tests, OpenAPI/contracts,
  generated clients, schema/migrations, public endpoint mappings, UI, secrets/
  config/env samples, deployment/Docker/CI/Codemagic/TestFlight behavior,
  notification outbox design, money/settlement/payment/bill/OCR/storage/sync/
  import/export/backup/restore/reconciliation behavior, issue closure, or
  Project fields.

### Issues #336/#339 - Password reset delivery-failure public-response PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-delivery-failure-public-response-20260707`.
- Baseline:
  `origin/main` at `a9d531ee0502269d0c3ff7992089e1470b238c95`,
  the PR #749 merge commit.
- Verification timestamp:
  `2026-07-07 05:45 HKT` task window.
- Completed branch checkpoint:
  internal password-reset public request-response policy foundation for future
  route exposure review. The policy maps delivery disabled/not-ready,
  local/test sink recorded, provider send accepted, provider send failed, and
  reset-specific request/provider-send throttled outcomes to the existing
  uniform public request posture: `202 Accepted`, no response body, and no
  `Retry-After`.
- Redaction posture:
  public-response decisions preserve only bounded internal diagnostic
  categories for server-side policy/tests. Decision readbacks do not expose
  submitted identifiers, recipient email addresses, reset material, reset URLs,
  token/query/fragment content, SMTP host/password, configured public origins,
  provider payloads, raw provider exceptions, bucket keys, account IDs, user
  profile IDs, auth account IDs, or audit internals.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the OpenAPI paths remain
  transport contracts only.
- Required next gates:
  audit/redaction acceptance, notification event/target/redaction if used,
  UI/Figma/product copy, final public route exposure review, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset abuse/provider-send throttles PR #748 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/748.
- Merge SHA:
  `aef4d7f6768a5a5ededda91c04dda21eba81e0b0`.
- Reviewed source head:
  `f860b8155bd1686c0f04977ae31dda4ddd9100b4`.
- Previous main/base:
  `4ef9c0f1bc035a0e09b27e731af2104bf0911e55`.
- Verification timestamp:
  `2026-07-07 04:45 HKT` task window.
- Completed merged checkpoint:
  internal reset-specific abuse/provider-send throttle foundation for local
  password reset email delivery orchestration. PR #748 keeps the throttle
  policy inside the existing internal reset delivery path and does not expose
  public password-reset routes.
- Validation checkpoint:
  PR #748 final gate recorded docs, scaffold, focused password-reset tests,
  route-exposure guard, and full `npm run validate:api` passing with `1398`
  API tests passed. GitHub checks passed on the exact reviewed source head
  `f860b8155bd1686c0f04977ae31dda4ddd9100b4`.
- Post-merge hygiene checkpoint:
  the source branch was restored to the reviewed head; comments were posted to
  #336 and #339; public password-reset request/complete runtime routes remained
  blocked/unregistered after merge.
- Required next gates:
  delivery failure public-response acceptance, audit/redaction acceptance,
  notification event/target/redaction if used, UI/Figma/product copy, final
  public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. PR #748 does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change runtime source, tests, OpenAPI/contracts,
  generated clients, schema/migrations, public endpoint mappings, UI, secrets/
  config/env samples, deployment/Docker/CI/Codemagic/TestFlight behavior,
  notification outbox design, money/settlement/payment/bill/OCR/storage/sync/
  import/export/backup/restore/reconciliation behavior, issue closure, or
  Project fields.

### Issues #336/#339 - Password reset abuse/provider-send throttles PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-abuse-provider-send-throttles-20260707`.
- PR:
  https://github.com/tommytang213/Settleora/pull/748.
- PR-open implementation head:
  `f13deb310b45fb00581fa467cefbf623137f1a7f`.
- Baseline:
  `origin/main` at `4ef9c0f1bc035a0e09b27e731af2104bf0911e55`,
  the PR #747 merge commit.
- Verification timestamp:
  `2026-07-07 03:00 HKT` task window.
- Completed branch checkpoint:
  internal reset-specific abuse/provider-send throttle foundation for the
  existing local password reset delivery orchestration. The branch adds a
  reset throttle policy boundary, an in-memory single-node foundation with
  bounded source, identifier, combined, global, and provider-send scopes, and
  orchestrator checks that block before reset material issuance and before
  SMTP/provider handoff when policy says to throttle.
- Redaction posture:
  throttle request, decision, delivery result, and provider-throttled readbacks
  expose only bounded status/category/scope values. They do not expose
  submitted identifiers, account existence, recipient email addresses, reset
  material, reset URLs, SMTP host/password, provider payloads, raw provider
  errors, or raw bucket keys. Derived in-memory throttle keys are not persisted
  to reset request rows or audit metadata by this slice.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the runtime route exposure guard
  under `services/api/src` found no public password-reset mapping strings.
- Validation checkpoint at PR-open implementation head:
  `git diff --check` passed; focused password-reset throttle/readiness/
  template/orchestration/route-exposure tests passed with 66 tests; the route
  exposure guard passed. Full required PR-open validation is recorded in the
  Codex report for the final PR head.
- Required next gates:
  delivery failure public-response acceptance, audit/redaction acceptance,
  notification event/target/redaction if used, UI/Figma/product copy, final
  public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. #336 remains the broader auth/session/runtime
  security epic. #339 remains the Day 1 password reset and credential-change
  workflow umbrella because this PR does not expose public reset routes, does
  not complete user-visible reset UX/product copy, and does not satisfy final
  auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset internal delivery orchestration PR #746 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/746.
- Merge SHA:
  `86713435af299347f5fa1b016b400575e39daf0a`.
- Reviewed source head:
  `72aef62c5b9afe1b1ecb7ecdd48d1d6ac6e53be0`.
- Previous main/base:
  `89fb5ca2384dfa53115730c1698f5197827b67d8`.
- Verification timestamp:
  `2026-07-07 02:00 HKT` task window.
- Completed merged checkpoint:
  internal-only local password reset email delivery orchestration foundation.
  PR #746 connects internal reset material issuance, delivery readiness,
  reset-link/template composition, local/test sink outcomes, and
  reset-specific SMTP transport handoff behind readiness gates.
- Public route exposure:
  still blocked. PR #746 does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Validation checkpoint:
  GitHub checks passed on the exact reviewed source head
  `72aef62c5b9afe1b1ecb7ecdd48d1d6ac6e53be0`; the later validation gate
  completed `npm run validate:api` with `1393` tests passed; route exposure
  search under `services/api/src` found no public password-reset runtime
  mappings.
- Post-merge hygiene checkpoint:
  the source branch was restored to the reviewed head; comments were posted to
  #336 and #339; #336 remains `OPEN` with Project status `Inbox`; #339 remains
  `OPEN` with Project status `Needs Decision`.
- Required next gates:
  reset-specific abuse/provider-send throttles, delivery failure
  public-response acceptance, audit/redaction acceptance, notification
  event/target/redaction if used, UI/Figma/product copy, final public route
  exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. PR #746 does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, or public password-reset route exposure.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset internal delivery orchestration PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-internal-delivery-orchestration-20260707`.
- Baseline:
  `origin/main` at `89fb5ca2384dfa53115730c1698f5197827b67d8`,
  the PR #745 merge commit.
- Verification timestamp:
  `2026-07-07 01:15 HKT` task window.
- Completed branch checkpoint:
  internal password-reset email delivery orchestration foundation only. The
  branch connects the existing internal reset material issuer, password-reset
  email delivery readiness, reset-link/template composer, and reset-specific
  SMTP transport handoff behind readiness checks.
- Delivery posture:
  disabled/not-ready delivery refuses before material issuance or provider
  handoff; production SMTP delivery requires the existing readiness gate;
  local/test sink modes produce explicit no-SMTP sink results; provider
  failures collapse to bounded redacted categories.
- Redaction posture:
  delivery results and `ToString()` readbacks do not expose reset material,
  token/query-style URL content, submitted identifiers, recipient email
  addresses, SMTP host/password, configured public origins, provider payloads,
  or raw provider errors. Raw reset material appears only in the send-ready SMTP
  message body handed to the provider boundary after readiness and composition
  pass.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  reset-specific abuse/provider-send throttles, audit/redaction acceptance,
  notification event/target/redaction if used, UI/Figma/product copy, final
  public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not approve public
  request/complete route exposure and does not complete the broader Day 1
  password reset or auth/security epic.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/
  bill/OCR/storage/sync/import/export/backup/restore/reconciliation behavior,
  issue closure, or Project fields.

### Issues #336/#339 - Password reset link/template internal foundation

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-link-template-internal-20260707`.
- Baseline:
  `origin/main` at `054d442ab91f388a44959a8d8aba59a8662446b5`,
  the PR #744 merge commit.
- Verification timestamp:
  `2026-07-07 00:10 HKT` task window.
- Completed branch checkpoint:
  internal reset-link construction and redacted reset email-template composition
  foundation. The API can compose a send-ready internal password-reset email
  message only when delivery readiness is available, a safe configured public
  origin exists, reset-link lifetime is in the approved 15-120 minute range,
  and the reset-link path passes the safe rooted-relative path policy.
- Link posture:
  send-ready internal messages place reset material in the URL fragment for
  future browser/mobile handoff. Redacted previews/readbacks replace the link
  with a fixed redaction marker and do not expose reset material, token-like URL
  content, submitted identifiers, account email/usernames, SMTP credentials,
  configured origins, or provider payloads.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  internal delivery orchestration without route exposure, reset-specific
  abuse/provider-send throttles, delivery failure handling, audit/redaction
  acceptance, notification event/target/redaction if used, UI/Figma/product
  copy, final public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not send password reset email
  and does not approve public request/complete route exposure.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, SMTP/email sending, notification runtime, public endpoint
  mappings, UI, secrets/config/env samples, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  fields.

### Issues #336/#339 - Password reset SMTP provider config verification foundation

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-smtp-provider-config-verification-20260706`.
- Baseline:
  `origin/main` at `b441bb7ecab058c8891962fdbe83f9312f64644a`,
  the PR #743 merge commit.
- Verification timestamp:
  `2026-07-06 22:45 HKT` task window.
- Completed branch checkpoint:
  internal password-reset SMTP/email delivery configuration readiness
  foundation. The API can evaluate whether future local-account password reset
  email delivery is disabled, has production SMTP readiness, has an explicit
  local/test sink mode, has a configured safe public origin, and uses the
  approved 60 minute default / 15-120 minute reset-link lifetime range.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Redaction posture:
  readiness results expose only bounded status/category values and lifetime
  minutes. They do not expose SMTP hostnames, usernames, passwords, configured
  public origins, query strings, reset material, tokens, provider payloads, or
  raw provider diagnostics.
- Required next gates:
  reset-link builder and redacted template review, internal delivery
  orchestration without route exposure, reset-specific abuse/provider-send
  throttles, audit/redaction acceptance, notification event/target/redaction if
  used, UI/Figma/product copy, final public route exposure review, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This verifier is a bounded internal readiness
  foundation only; it does not send password reset email or approve public
  request/complete route exposure.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, SMTP/email sending, reset email templates, reset-link
  construction, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/
  bill/OCR/storage/sync/import/export/backup/restore/reconciliation behavior,
  issue closure, or Project fields.

### Issues #336/#339 - Local password reset SMTP provider readiness gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `docs/auth-local-password-reset-smtp-provider-readiness-gate-20260706`.
- Baseline:
  `origin/main` at `b2414ee595e33735acbd1f2357a6dbd6d3471cd6`,
  the PR #742 merge commit.
- Verification timestamp:
  `2026-07-06 21:35 HKT` task window.
- Recent merged checkpoints:
  PR #739 merged the internal local-account password reset runtime foundation at
  `7a35823325b5207104ceb91866e087775e2a0b34`. PR #741 merged the non-blocking
  Trivy/Semgrep CE scanner baseline at
  `4051ee5aef1ae122e81b339155038c920525e25e`. PR #742 merged the docs-only
  delivery readiness decision gate at
  `b2414ee595e33735acbd1f2357a6dbd6d3471cd6`.
- Completed branch checkpoint:
  docs-only SMTP provider readiness gate. Current repo is partially ready for
  bounded internal SMTP reset delivery slices because generic SMTP notification
  sender/options/readiness/outbox plumbing exists, but generic notification
  plumbing is not approved password-reset delivery by itself.
- Current-state clarification:
  password reset has merged schema/domain, OpenAPI/generated-client transport,
  and internal runtime foundations. It still has no reset delivery
  implementation, reset-link builder, reset email template, reset-specific base
  URL/public-origin runtime, reset provider-send throttle runtime, or public
  request/complete route mapping.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  SMTP/email provider configuration verification, base URL/reset-link
  construction policy, reset-link lifetime enforcement, redacted reset template,
  delivery failure handling with uniform public responses, reset-specific abuse
  and provider-send throttles, audit/redaction acceptance, local/dev/test
  fake-or-sink behavior, UI/Figma/product copy, notification event/target/
  redaction if used, and final public exposure/auth-security review.
- Recommended next slices:
  provider config verification foundation; reset-link builder and redacted
  template rendering internal service; internal reset delivery orchestration
  without public route exposure; final public route exposure only after all
  delivery, abuse, audit, UI/product copy, notification-if-used, and final
  auth/security gates pass.
- Issue posture:
  keep #336 and #339 open. #336 remains open for broader auth/session/runtime
  security. #339 remains open because password reset and credential-change
  workflow still has delivery, public exposure, UI/product copy, abuse,
  notification-if-used, and final acceptance gates.
- Scope confirmation:
  this checkpoint is docs-only. It does not change public API route exposure,
  runtime handlers, OpenAPI/contracts, generated clients, schema/migrations,
  SMTP/email provider delivery/configuration, notification runtime, UI,
  scanner configuration, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  fields.

### Issues #336/#339 - Local password reset delivery readiness decision gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `docs/auth-local-password-reset-delivery-readiness-decision-gate-20260706`.
- Baseline:
  `origin/main` at `4051ee5aef1ae122e81b339155038c920525e25e`,
  the PR #741 merge commit.
- Verification timestamp:
  `2026-07-06 20:35 HKT` task window.
- Recent merged checkpoints:
  PR #739 merged the internal local-account password reset runtime foundation at
  `7a35823325b5207104ceb91866e087775e2a0b34`. PR #741 merged the non-blocking
  Trivy/Semgrep CE scanner baseline at
  `4051ee5aef1ae122e81b339155038c920525e25e`.
- Completed branch checkpoint:
  docs-only delivery readiness decision gate. The recommended Day 1 path is
  SMTP/email reset-link delivery first, behind provider/configuration, base
  URL, template redaction, delivery failure, audit/redaction, abuse, and final
  auth/security gates. Any admin-delivered recovery fallback remains separately
  approved and audited.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Remaining gates:
  SMTP/email provider configuration and verification, optional separately
  approved admin-delivered recovery, reset-specific abuse/provider-send
  thresholds, audit/redaction, notification event/target/redaction if used,
  UI/Figma/mobile/web/admin/product copy, final public route exposure review,
  and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. #336 remains open for broader auth/session/runtime
  security. #339 remains open because password reset and credential-change
  workflow still has delivery/public exposure/UI/final acceptance gates.
- Scope confirmation:
  this checkpoint is docs-only. It does not change public API route exposure,
  runtime handlers, OpenAPI/contracts, generated clients, schema/migrations,
  SMTP/email provider delivery/configuration, notification runtime, UI,
  scanner configuration, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  fields.

### Issues #336/#339 - Password reset public route exposure implementation branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback remains `Inbox` from the latest
    password-reset gate reports.
  - #339 `OPEN`; Project status readback remains `Needs Decision` from the
    latest password-reset gate reports.
- Branch:
  `feature/auth-password-reset-route-exposure-20260707-2120`.
- Baseline:
  `origin/main` at `e1bf888e6e83503b2424d5237a409251a41f2720`, the PR #762
  merge commit.
- Verification timestamp:
  `2026-07-07 21:20 HKT` task window.
- Implementation PR:
  to be opened from this branch after required local validation passes; the
  task report records the final PR number and URL.
- Completed branch checkpoint:
  narrow public runtime route exposure only. The branch maps exactly:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete`. The request route is anonymous,
  validates only the approved transport shape, calls the existing local request
  service and delivery/public-response runtime boundaries, and returns uniform
  `202 Accepted` with no body and no `Retry-After`. The completion route is
  anonymous, validates only the approved transport shape, calls the existing
  local completion service boundary, returns `204 No Content` for successful
  reset, and maps invalid/unavailable material to generic bounded problem
  responses without issuing access or refresh credentials.
- Scope confirmation:
  this checkpoint changes only API route mapping/binding, focused route
  exposure tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, password-reset token policy, SMTP/
  provider configuration, notification targets/security-center/
  credential-activity surfaces, mobile/web/admin UI, product copy beyond this
  ledger checkpoint, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, labels,
  milestones, assignees, or Project fields.
- Validation checkpoint:
  required validation for this branch is `git diff --check`,
  `npm run validate:openapi`, `npm run generate:clients` with no tracked
  generated-client drift, `npm run validate:clients`,
  `npm run validate:scaffold`, `npm run validate:api`, and focused
  `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter "FullyQualifiedName~PasswordReset|FullyQualifiedName~LocalPasswordResetRouteExposureTests"`.
  Exact command results are recorded in the task report for this branch.
- Remaining gates:
  PR review/merge gate, post-merge hygiene, and broader Day 1 password-reset/
  UI/notification acceptance work. Conditional target/security-center/
  credential-activity OpenAPI/generated-client gates remain required only if a
  later task adds password-reset notifications or those surfaces.
- Issue posture:
  keep #336 and #339 open. This route exposure branch closes the old unmapped
  public transport gap only; it does not complete the broader auth/session/
  runtime security epic or the full Day 1 password reset and credential-change
  workflow.

### Issues #336/#339 - Local password reset internal runtime bucket hardening branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-internal-runtime-foundation-20260706`.
- Baseline:
  `origin/main` at `1fd45765344d603c166e788661acfe871a7d2b0b`,
  the PR #738 merge commit.
- Starting branch head:
  `2fe46dc5389475d24216254de977e4f5efeb13e4`.
- Verification timestamp:
  `2026-07-06 15:35 HKT` task window.
- Completed branch checkpoint:
  internal password reset runtime hardening only. The branch disables
  password-reset persistence of identifier-derived and combined
  source-plus-identifier bucket references where the prior internal runtime
  used plain deterministic SHA-256 over normalized identifiers. Until a
  password-reset-approved keyed bucket fingerprint mechanism exists,
  `identifier_bucket_ref`, `combined_bucket_ref`, `global_bucket_ref`, and
  `provider_send_bucket_ref` remain unset by the internal service.
- Preserved source bucket posture:
  `request_source_bucket_ref` may still persist only a caller-supplied safe
  coarse bucket reference after bounded safe-category normalization. This
  checkpoint does not derive source buckets from raw IP addresses, forwarded
  headers, user agents, or request metadata.
- Public route exposure:
  still blocked. The branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Current-state clarification:
  runtime remains internal-service-only. No reset SMTP/email/provider delivery,
  notification runtime, UI, OpenAPI/generated-client, schema/migration,
  deployment/config/secrets, or public reset endpoint exposure is added.
- Remaining gates:
  SMTP/email provider configuration and verification, optional admin-delivered
  recovery, public route exposure after delivery approval, notification
  event/target/redaction, UI/Figma/mobile/web/admin/product copy, reset abuse
  threshold tuning and keyed bucket design, audit retention/final audit
  acceptance, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Keep #339 in `Needs Decision` unless a later
  explicitly scoped metadata task changes it.
- Scope confirmation:
  this checkpoint changes internal auth runtime/test/ledger files only. It does
  not change public API route exposure, OpenAPI/contracts, generated clients,
  schema/migrations, provider delivery, notification runtime, UI, secrets/
  config/env, deployment/Docker/CI/Codemagic/TestFlight behavior, money/
  settlement/
  payment/bill/OCR/storage/sync/import/export/backup/restore/reconciliation
  behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset internal runtime foundation branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-internal-runtime-foundation-20260706`.
- Baseline:
  `origin/main` at `1fd45765344d603c166e788661acfe871a7d2b0b`,
  the PR #738 merge commit.
- Verification timestamp:
  `2026-07-06 15:00 HKT` task window.
- Completed branch checkpoint:
  internal API/domain password reset runtime foundation only. The branch adds
  internal local password reset request, material issue, and completion service
  boundaries; purpose-bound hash-backed reset material helpers; credential
  replacement through the existing local password hashing/credential workflow;
  account-wide active session and refresh/session-family revocation after
  successful internal completion; bounded auth audit events; and focused tests
  proving route non-exposure, no material creation when provider delivery is
  unavailable, hash-only material persistence, replacement of older material,
  one-time completion/replay handling, credential replacement, session-family
  revocation, and audit redaction.
- Public route exposure:
  still blocked. The branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Current-state clarification:
  runtime remains internal-service-only. No reset SMTP/email/provider delivery,
  notification runtime, UI, OpenAPI/generated-client, schema/migration,
  deployment/config/secrets, or public reset endpoint exposure is added.
- Remaining gates:
  SMTP/email provider configuration and verification, optional admin-delivered
  recovery, public route exposure after delivery approval, notification
  event/target/redaction, UI/Figma/mobile/web/admin/product copy, reset abuse
  threshold tuning, audit retention/final audit acceptance, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Keep #339 in `Needs Decision` unless a later
  explicitly scoped metadata task changes it.
- Scope confirmation:
  this checkpoint changes internal auth runtime/test/ledger files only. It does
  not change public API route exposure, OpenAPI/contracts, generated clients,
  schema/migrations, provider delivery, notification runtime, UI, secrets/
  config/env, deployment/Docker/CI/Codemagic/TestFlight behavior, money/
  settlement/
  payment/bill/OCR/storage/sync/import/export/backup/restore/reconciliation
  behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset API runtime readiness gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `docs/auth-local-password-reset-api-runtime-readiness-gate-20260706`.
- Last verified at main SHA:
  `65961d7a60b7c1732e2d932ad1c69b7439861541`, the PR #737 merge commit.
- Verification timestamp:
  `2026-07-06 14:20 HKT` task window.
- Readiness gate packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_API_RUNTIME_READINESS_GATE.md`.
- Recent PR and metadata readback:
  PR #734 merged the local password reset schema/domain foundation at
  `bf2f6cd1526b2c71283c97a5f8bdf6aba60d0df7` from reviewed head
  `d66a6328a84f70eb3a5f6d3145e5e182612b9df0`. PR #736 merged the
  OpenAPI/generated-client transport contract at
  `ce18aaaf9975ec26b1a02e55fd3310c42273cb3f` from reviewed head
  `03878c114bccd817fee1200c8cbf01bb1238d29d`. PR #737 merged the
  OpenAPI/generated-client post-merge ledger checkpoint at
  `65961d7a60b7c1732e2d932ad1c69b7439861541` from reviewed head
  `0cc755e676d5a72e2c5b78e9710f83caf48545f0`.
- Runtime readiness decision:
  `READY_FOR_INTERNAL_SERVICE_ONLY`.
- Current-state clarification:
  schema/domain and OpenAPI/generated clients are merged, but runtime password
  reset remains unimplemented. Current repo evidence does not contain explicit
  approval that SMTP/email provider configuration is configured, verified, and
  approved for password reset, and it does not contain a separately approved
  admin-delivered recovery policy.
- Public route exposure:
  blocked. Do not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete` until the SMTP/email provider
  configuration/verification gate or a separate admin-delivered recovery gate
  is approved.
- Allowed next bounded slice:
  an internal API/service runtime foundation may proceed only with route
  exposure disabled/unregistered and no outbound reset delivery. A separate
  SMTP/email provider configuration and verification gate remains required
  before public runtime exposure.
- Existing provider/delivery finding:
  the current SMTP email notification sender and provider readiness readout are
  generic optional notification plumbing, default disabled/unconfigured unless
  deployment options are present, and are not an approved password-reset
  delivery provider or reset email content gate by themselves.
- Remaining separate gates:
  SMTP/email provider configuration and verification, optional admin-delivered
  recovery, public route exposure after delivery approval, notification
  event/target/redaction, UI/Figma/mobile/web/admin/product copy, reset abuse
  threshold tuning, audit retention/final audit acceptance, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Do not change Project fields from this docs-only
  readiness gate.
- Scope confirmation:
  this checkpoint is docs-only and does not add runtime password reset
  endpoints or services, public API behavior, OpenAPI/contracts, generated
  clients, schema/migrations/domain model changes, SMTP/email provider
  delivery/configuration, notification runtime, UI, secrets/config/env,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/
  payment/bill/OCR/storage/sync/import/export/backup/restore/reconciliation
  behavior, issue closure, or Project field changes.

### Issues #336/#339 - PR #736 local password reset OpenAPI/generated-client contract merged

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  #736 `feat(api): add local password reset OpenAPI contract`.
- Merge:
  `ce18aaaf9975ec26b1a02e55fd3310c42273cb3f` into `main` from
  `feature/auth-local-password-reset-openapi-clients-20260706`.
- Reviewed source head:
  `03878c114bccd817fee1200c8cbf01bb1238d29d`.
- Previous `origin/main` before PR #736:
  `a8f556ef671899a4c98924f66fe4c483eac7ce2f`.
- Verification timestamp:
  `2026-07-06 14:00 HKT` post-merge hygiene task window.
- Completed slice:
  OpenAPI/generated-client contract only for local-account password reset
  request and completion. The merge adds contract paths
  `POST /api/v1/auth/password-reset/request` with operation ID
  `requestLocalPasswordReset` and
  `POST /api/v1/auth/password-reset/complete` with operation ID
  `completeLocalPasswordReset`, then refreshes the generated web and Dart
  clients from the OpenAPI source.
- Merged diff scope:
  exactly the five intended OpenAPI/generated-client files:
  `packages/contracts/openapi/settleora.v1.yaml`,
  `packages/client-web/src/generated/client.ts`,
  `packages/client-web/src/generated/models.ts`,
  `packages/client-dart/lib/generated/client.dart`, and
  `packages/client-dart/lib/generated/models.dart`. The merged diff excludes
  `.codex/reports/**`.
- Current-state clarification:
  runtime password reset is still not implemented. PR #736 does not add API
  runtime handlers, service implementation, SMTP/email provider delivery or
  configuration, notification runtime, UI/Figma/mobile/web/admin behavior,
  schema/migrations/domain model changes, auth config/secrets/env/appsettings,
  session revocation runtime for reset, abuse threshold runtime, or final
  auth/security acceptance.
- Remaining gates:
  API/service runtime implementation gate, SMTP/email provider configuration
  and verification gate, optional admin-delivered recovery gate, notification
  event/target/redaction gate, UI/Figma/mobile/web/product copy gate, abuse
  threshold tuning, audit/final auth-security acceptance, and any future
  runtime merge gate.
- Issue posture:
  keep #336 and #339 open. #339 should remain `Needs Decision` unless a later
  explicitly scoped metadata task changes it. Do not claim Day 1 password reset
  runtime is complete from this OpenAPI/generated-client contract merge.
- Scope confirmation:
  this checkpoint records an already merged auth OpenAPI/generated-client
  contract slice. It does not add runtime password reset endpoints or services,
  provider delivery, notification runtime, UI, schema/migrations/domain model
  changes, secrets/config/env, deployment/Docker/CI/Codemagic/TestFlight
  behavior, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project field
  changes.

### Issues #336/#339 - PR #734 local password reset schema/domain foundation merged

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  #734 `feat(api): add local password reset schema foundation`.
- Merge:
  `bf2f6cd1526b2c71283c97a5f8bdf6aba60d0df7` into `main` from
  `feature/auth-local-password-reset-schema-domain-20260706`.
- Reviewed source head:
  `d66a6328a84f70eb3a5f6d3145e5e182612b9df0`.
- Previous `origin/main` before PR #734:
  `6a6893e1c1ccb323733cde627e6df1a753622161`.
- Verification timestamp:
  `2026-07-06 13:10 HKT` post-merge hygiene task window.
- Completed slice:
  schema/domain foundation only for local-account password reset request
  material. The merge adds the `AuthPasswordResetRequest` domain model and
  bounded constants, maps `auth_password_reset_requests`, adds EF migration
  `20260706041357_AddAuthPasswordResetRequestsFoundation`, and adds focused
  schema/migration tests.
- Merged diff scope:
  exactly 16 auth schema/domain/test/ledger files. The merged diff excludes
  `.codex/reports/**`.
- Current-state clarification:
  runtime password reset is still not implemented. PR #734 does not add public
  password reset endpoints, OpenAPI paths or schemas, generated clients,
  SMTP/email delivery, provider configuration, notification runtime, UI/Figma,
  mobile/web/admin behavior, session revocation runtime for reset, abuse
  threshold runtime, or final auth/security acceptance.
- Remaining gates:
  OpenAPI/generated-client contract gate, API/service runtime implementation
  gate, SMTP/email provider configuration and verification gate, optional
  admin-delivered recovery gate, notification event/target/redaction gate,
  UI/Figma/mobile/web/product copy gate, abuse threshold tuning, audit
  retention approval, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. #339 should remain `Needs Decision` unless a later
  explicitly scoped metadata task changes it. Do not claim Day 1 password reset
  runtime is complete from this schema/domain merge.
- Scope confirmation:
  this checkpoint records an already merged auth schema/domain/migration slice.
  It does not add runtime password reset endpoints or services, public API
  behavior, OpenAPI/contracts, generated clients, provider delivery,
  notification runtime, UI, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  field changes.

### Issues #336/#339 - Local password reset schema/domain foundation branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-schema-domain-20260706`.
- Baseline:
  `origin/main` at `6a6893e1c1ccb323733cde627e6df1a753622161`,
  the PR #733 merge commit.
- Verification timestamp:
  `2026-07-06 12:10 HKT` task window.
- Completed slice:
  schema/domain foundation only for local-account password reset request
  material. The branch adds `AuthPasswordResetRequest` and bounded category
  constants, maps `auth_password_reset_requests`, adds an explicit EF Core
  migration, and adds focused schema/migration tests.
- Schema digest:
  the table stores bounded purpose/status/scope/delivery/provider-send/
  revocation categories, nullable account and active-at-issuance local password
  credential references, nullable hash-backed reset material fields, lifecycle
  timestamps, safe abuse bucket references, correlation IDs, cleanup timestamp,
  and replacement self-reference. It includes restrictive FKs, bounded check
  constraints, filtered unique material-hash lookup, pending account/purpose
  lookup, account/purpose/status/expiry lookup, and expiry/cleanup indexes.
- Current-state clarification:
  runtime password reset is still not implemented. This checkpoint does not add
  public password reset endpoints, OpenAPI paths or schemas, generated clients,
  SMTP/email delivery, provider configuration, notification runtime, UI/Figma,
  mobile/web/admin behavior, session revocation runtime for reset, abuse
  threshold runtime, or final auth/security acceptance.
- Remaining gates:
  OpenAPI/generated-client contract gate, API/service runtime implementation
  gate, SMTP/email provider configuration and verification gate, optional
  admin-delivered recovery gate, notification event/target/redaction gate,
  UI/Figma/mobile/web/product copy gate, abuse threshold tuning, audit
  retention approval, and final auth/security acceptance. Schema/migration
  merge remains manual-gated because auth/security persistence is sensitive.
- Issue posture:
  keep #336 and #339 open. Do not claim Day 1 password reset runtime is
  complete from this schema/domain branch.
- Scope confirmation:
  this checkpoint changes auth schema/domain/test/report/ledger files only. It
  does not change public API behavior, OpenAPI/contracts, generated clients,
  provider delivery, notification runtime, UI, secrets/config/env, deployment/
  Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/bill/OCR/
  storage/sync/import/export/backup/restore/reconciliation behavior, issue
  closure, or Project fields.

### Issues #336/#339 - Local password reset schema/OpenAPI/runtime design gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Last verified at main SHA:
  `a86be35a2c4be2cfc47294648282bdc5a39e90a5`.
- Verification timestamp:
  `2026-07-06 11:15 HKT` task window.
- Design gate packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_SCHEMA_OPENAPI_RUNTIME_DESIGN_GATE.md`.
- Recent PR and metadata readback:
  PR #729 merged authenticated current-account password change only at
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`. PR #730 merged the docs-only
  password reset/recovery policy gate at
  `0004b153b833fd9793df6102cc1b3ce3d0385002`. PR #731 merged the docs-only
  local reset delivery/token policy gate at
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`. PR #732 merged Tommy's approved
  local reset delivery/token policy decision at
  `a86be35a2c4be2cfc47294648282bdc5a39e90a5`.
- Current design digest:
  the schema/OpenAPI/runtime design gate proposes a local-account-only reset
  persistence model, endpoint family, service boundaries, audit taxonomy,
  redaction matrix, validation matrix, and implementation slicing plan. It
  keeps reset material hash/verifier-backed only, rejects raw tokens and raw
  identifiers, preserves uniform public anti-enumeration responses, treats
  newer material as replacing older outstanding material, and keeps successful
  reset account-wide session and refresh/session-family revocation as the
  default.
- Current-state clarification:
  runtime password reset is still not implemented. This checkpoint is technical
  design only and does not approve schema, migrations, OpenAPI, generated
  clients, API runtime endpoints, SMTP/email provider delivery, notification
  runtime, UI/Figma/product copy, admin-delivered reset, or final auth/security
  acceptance.
- Remaining gates:
  schema/migration/domain model implementation gate, OpenAPI/generated-client
  contract gate, API/service runtime implementation gate, SMTP/email provider
  configuration and verification gate, optional admin-delivered recovery gate,
  notification event/target/redaction gate, UI/Figma/mobile/web gate, abuse
  threshold tuning, audit retention approval, and final auth/security
  acceptance.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from this docs-only design
  gate, and do not claim runtime password reset is implemented.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/Codemagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset token policy approved decision

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Last verified at main SHA:
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`.
- Verification timestamp:
  `2026-07-06 10:45 HKT` task window.
- Policy decision packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md`.
- Recent PR and metadata readback:
  PR #731 merged the docs-only local password reset delivery/token policy gate at
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`. The later metadata hygiene task
  changed #339 Project status from `Needs Architecture Review` to
  `Needs Decision`; #336 stayed `Inbox`.
- Manual decision digest:
  Tommy approved the Day 1 local-account password reset delivery/token policy
  for subsequent technical design. Approved values are local-account-only reset,
  no Settleora reset for OIDC/provider-owned passwords, SMTP/email reset links
  only when the provider policy is configured/verified/approved, no runtime
  forgotten-password endpoint without approved SMTP/email or separately approved
  admin-delivered recovery policy, admin-delivered material as a separate later
  gate, uniform anti-enumeration-safe public responses, high-entropy one-time
  scoped hash/verifier-backed reset material with no raw storage, 60 minute
  default email-link expiry, owner/admin configurable email-link expiry from 15
  to 120 minutes, 10 to 15 minute expiry for any future typed short-code/OTP
  flow, newer reset material revoking or replacing older outstanding material,
  account-wide active session and refresh/session-family revocation after
  successful reset by default, source/identifier/combined/global/provider-send
  abuse buckets, no initial `Retry-After`, bounded secret-free audit, separate
  notification event/target/redaction gate, separate UI/Figma/product copy gate,
  and separate schema/OpenAPI/generated-client/runtime implementation gate.
- Current-state clarification:
  runtime password reset is still not implemented. This checkpoint resolves only
  the local reset delivery/token policy decision gate; it does not approve
  schema, OpenAPI, generated-client, API runtime, provider delivery,
  notification, UI, or final auth/security implementation readiness.
- Remaining gates:
  schema/migration/retention design, OpenAPI and generated-client review, API
  runtime design and tests, SMTP/email provider configuration and verification,
  any admin-delivered recovery policy, reset abuse thresholds, future
  `Retry-After` approval if desired, auth audit metadata/retention, user-facing
  notification event/target/redaction approval, UI/Figma/product copy, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from this docs-only
  decision recording task, and do not claim runtime password reset is
  implemented.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/CodeMagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset delivery and token policy gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Architecture Review`.
- Last verified at main SHA:
  `0004b153b833fd9793df6102cc1b3ce3d0385002`.
- Verification timestamp:
  `2026-07-06 01:30 HKT` task window.
- Policy gate packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md`.
- Recent PR readback:
  PR #729 completed authenticated current-account local password change only and
  merged at `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`. PR #730 merged the
  docs-only password reset/recovery policy gate at
  `0004b153b833fd9793df6102cc1b3ce3d0385002`.
- Decision digest:
  user-initiated Day 1 local password reset remains
  `BLOCKED_PENDING_MANUAL_DECISIONS`. Recommended technical posture is
  local-account-only reset, approved SMTP/email or approved admin-delivered
  out-of-band delivery, uniform public responses, hash/verifier-backed
  short-lived one-time reset material, 15 minute default expiry with a 30 minute
  cap unless manually changed, atomic consume, replay-safe failures, layered
  reset abuse/provider-send throttles, bounded audit, and account-wide active
  session plus refresh-family revocation after success.
- Current-state clarification:
  in-app-only reset is insufficient for forgotten-password unauthenticated
  recovery. MFA/passkey recovery-code foundations remain MFA challenge/recovery
  material only and are not password-reset token authority.
- Remaining gates:
  product/trust delivery posture, provider/admin policy approval, final expiry
  and replacement rules, reset abuse thresholds, session revocation breadth if
  narrowed, auth audit metadata/retention, user-facing notification event/
  target/redaction approval, UI/Figma/product copy, schema/OpenAPI/generated-
  client review, and runtime implementation remain incomplete.
- Recommended next posture:
  keep runtime blocked until Tommy approves one delivery posture and the
  auth/security token policy. If approved later, the smallest runtime slice
  should be narrow, local-account only, provider/admin delivery explicit, fully
  tested, and exclude invitation/admin/break-glass/OIDC/MFA/passkey expansion.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from this docs-only child
  gate, and do not claim runtime password reset is implemented.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/CodeMagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset and recovery policy gate after PR #729

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Architecture Review`.
- Last verified at main SHA:
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`.
- Verification timestamp:
  `2026-07-06 01:01 HKT` task window.
- Policy gate packet:
  `docs/planning/AUTH_PASSWORD_RESET_RECOVERY_POLICY_GATE.md`.
- Completed PR #729 slice:
  current-account local password change runtime only, merged as PR #729 at
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`, with PR head
  `1b1daaa26646adcf3dcc3b7a124c6eb700ae3636`.
- Current-state clarification:
  MFA/passkey/recovery-code foundations, including recovery-code batches and
  verifiers, exist in current repo state, but they are not general password
  reset tokens and must not be reused as password reset, first-owner recovery,
  or admin reset authority without a separate auth/security design.
- Remaining gates:
  user-initiated password reset, first-owner/break-glass recovery,
  owner/admin reset or change for another local user, invitation/public
  registration credential creation, OIDC/passkey/MFA interaction policy,
  password-change UI, user-facing security notifications, reset/recovery abuse
  and rate-limit policy, and final auth/security acceptance remain incomplete.
- Recommended next posture:
  runtime remains blocked pending manual decisions. The smallest next safe
  child is a docs-only decision gate for Day 1 local password reset delivery
  and token policy before any schema/OpenAPI/runtime/UI work.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from PR #729 or this
  docs-only packet.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/CodeMagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Current-account password change runtime slice

- GitHub state/project status:
  - #336 `OPEN`; keep open as the broad auth/session/runtime security epic.
  - #339 `OPEN`; keep open because password reset, recovery, admin reset,
    credential lifecycle UX, abuse controls beyond existing sign-in policy,
    and UI/Figma scope remain incomplete.
- Last verified at main SHA:
  `c4e042bddcc27f921914b06a956328998d862fa0`.
- Verification timestamp:
  `2026-07-05 23:44 HKT` task window.
- Completed slice:
  current-account local password change runtime for authenticated bearer
  sessions only, using `POST /api/v1/auth/password/change`, current-password
  verification through the credential workflow boundary, same-password
  rejection, replacement verifier hashing through the approved password hashing
  service, safe auth audit events, current bearer session preserved, and other
  active sessions plus linked refresh-family/refresh credentials revoked where
  supported.
- OpenAPI/generated-client posture:
  the password-change endpoint and request schema are contract-backed, and web
  and Dart generated clients are expected to expose
  `changeCurrentAccountPassword` from generated output only.
- Remaining Day 1 gates:
  password reset, first-owner recovery/break-glass recovery, admin password
  reset/change, invitation/public registration credential flows, user-facing
  security notifications, password-change UI, broader abuse/rate-limit policy,
  and final auth/security acceptance remain incomplete.
- Manual decisions:
  user approved the narrow current-account password-change runtime Option A
  after PR #728 merged. No approval was recorded for reset/recovery/admin/UI/
  notification expansion.
- Issue posture:
  do not close #336 or #339 from this slice alone. Treat this as one completed
  child runtime capability inside #339, not completion of the full password
  reset/change workflow candidate.
- Scope confirmation:
  this checkpoint records a narrow auth/security runtime slice. It does not
  implement password reset, first-owner recovery, break-glass recovery, admin
  password reset/change, invitation acceptance, public registration, OIDC
  password behavior, MFA/passkey runtime changes, notification runtime, mobile/
  web/admin UI, TestFlight, CodeMagic, signing, release, deployment, schema/
  migrations, secrets/config/env changes, money/settlement/payment/bill/OCR/
  storage/sync/import/export/backup/restore/reconciliation behavior, or issue
  closure/project-field automation.

### Notification umbrella remaining gates checkpoint

- GitHub state/project status:
  - #369 `OPEN`; keep open because session-revocation notification runtime is
    `BLOCKED_PENDING_MANUAL_DECISIONS`, and broader Day 1 notification coverage
    remains incomplete.
  - #368 `OPEN`; keep open as the parent notification epic while child/
    umbrella runtime gates remain.
  - #403 `OPEN`; keep open for provider/email/push/preference/delivery-state/
    policy/QA umbrella scope unless future repo evidence proves otherwise.
  - #634 `OPEN`; keep open for push provider/device-token/provider-neutral
    delivery runtime gates.
  - #635 `OPEN`; keep open for admin notification policy API/readout/write/
    update/delete/runtime/UI/provider gates.
  - #371, #570, and #575 `CLOSED`; keep closed unless a concrete regression is
    found.
- Last verified at main SHA:
  `da99be532875feed8adf26c07de2978135d8da85`.
- Verification timestamp:
  `2026-07-05 19:00 HKT` task window.
- Checkpoint:
  `docs/planning/NOTIFICATION_UMBRELLA_REMAINING_GATES_CHECKPOINT.md`.
- Recent PR readback:
  #707, #708, #709, #710, #711, #712, and #713 are merged. PR #713 is the
  latest relevant #369 runtime-readiness decision and merged at
  `da99be532875feed8adf26c07de2978135d8da85`.
- Completed slices:
  #707/#708 recorded #369 remaining event coverage/ledger hygiene; #709
  recorded auth/session/security source decision; #711 recorded session
  revocation source design; #712 recorded session revocation target/event
  design; #713 recorded runtime readiness as
  `BLOCKED_PENDING_MANUAL_DECISIONS`. #710 merged mobile CodeMagic/TestFlight
  visual-test selection hygiene and is not notification umbrella completion.
- Dependency alert posture:
  the 2026-07-05 18:52 HKT npm Dependabot task found `0` live open alerts and
  created no dependency diff or PR; do not invent dependency work from stale
  assumptions.
- Remaining Day 1 gates:
  auth/session/security runtime approval for #369, broader remaining
  notification event-family source states, #403 provider/preference/
  delivery-state/policy scope, #634 push provider/device-token/mobile gates,
  #635 admin policy mutation/readout/runtime/UI/provider gates, and final Day 1
  notification acceptance remain incomplete.
- Manual decisions:
  #369 `security.session_revoked` runtime still needs explicit manual approval
  for the user-facing event, actor self-notification, `auth_session` and
  `authSessionId`, minimal schema/OpenAPI/generated-client boundary, writer
  placement, duplicate/transaction behavior, auth audit correlation, and
  redaction rules.
- Safe next actions:
  Option A prepare the manual approval package for the narrow #369
  `security.session_revoked` runtime gate; Option B keep #369 runtime blocked
  and continue non-security provider/admin planning or other Day 1 lanes;
  Option C create focused issue/PR hygiene comments after this checkpoint
  merges.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, notification writers/
  constants/event handlers, provider sending, provider config/secrets, device-
  token lifecycle, delivery attempts, admin policy mutation/write API, UI/
  Figma, #371 behavior, auth/session/security runtime, login/current-user/
  session middleware/token issuance/revocation endpoints, money/settlement/
  bill/OCR/storage/sync/reconciliation behavior, deployment/CI/Docker/env/
  CodeMagic/TestFlight behavior, secrets, issue closure/reopen, or Project
  fields.

### Issue #369 - Session revocation notification runtime readiness decision

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `8e4178b811354b7fc0377fa2d7955aa26d64bf61`.
- Verification timestamp:
  `2026-07-05 18:32 HKT` task window.
- Runtime readiness packet:
  `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_RUNTIME_READINESS_DECISION_PACKET.md`.
- Decision digest:
  runtime is `BLOCKED_PENDING_MANUAL_DECISIONS`. PR #711 supplied the
  source-state gate for user-initiated current-account per-session revocation,
  and PR #712 supplied the target/event gate recommending
  `security.session_revoked`, `auth_session`, `security.session_revoked.v1`,
  and first-class `authSessionId`, but runtime still needs explicit manual
  auth/security approval and a reviewed schema/OpenAPI/generated-client
  boundary before implementation.
- Smallest future runtime slice if approved:
  one successful API-owned revocation of one non-current session owned by the
  authenticated account, one affected account owner's server-mode profile
  recipient, safe in-app notification only, first-class `authSessionId` target,
  current-user notification re-fetch, and current-account authorized
  auth/session re-fetch. Auth audit remains the security source of truth.
- Remaining manual decisions:
  approve the event as user-facing, approve actor self-notification for this
  exact event, approve `auth_session`/`authSessionId`, approve the minimal
  schema/OpenAPI/generated-client diff, confirm writer placement and
  duplicate/transaction behavior, and confirm audit/redaction rules.
- Out-of-scope posture:
  admin revocation, account-wide revocation, suspicious/replay/session-family
  revocation, current-session sign-out, expiry, denied attempts, credential/
  MFA/passkey/provider changes, provider sending, SMTP/APNs/FCM activation,
  device-token lifecycle, mobile/web/admin UI, #371 broad notification-open/
  deep-link behavior, unrelated notification families, unrelated auth/session
  runtime, money/bill/settlement/OCR/storage/sync/reconciliation behavior,
  Docker/env/deployment/CI/CodeMagic/TestFlight behavior, and secrets remain
  out of scope.
- Future validation posture:
  an approved runtime PR should run docs/scaffold/OpenAPI/client/API validation
  if it includes the expected API/schema/OpenAPI/generated-client changes, plus
  focused source, recipient, self-notification, duplicate, target authorization,
  stale/unauthorized fallback, redaction, read/archive isolation, and provider-
  disabled tests.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, notification writers/
  constants/event handlers, provider sending, provider config/secrets, device-
  token lifecycle, delivery attempts, admin policy mutation/write API, UI/
  Figma, #371 behavior, auth/session/security runtime, login/current-user/
  session middleware/token issuance/revocation endpoints, money/settlement/
  bill/OCR/storage/sync/reconciliation behavior, deployment/CI/Docker/env/
  CodeMagic/TestFlight behavior, secrets, issue closure/reopen, or Project
  fields.

### Issue #369 - Session revocation notification target/event design gate

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `f6cca35aa4b1cab3f692d3c178df552b8e1c464a`.
- Verification timestamp:
  `2026-07-05 18:10 HKT` task window.
- Target/event packet:
  `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_TARGET_EVENT_DESIGN_PACKET.md`.
- Design digest:
  inherits PR #711's source decision: user-initiated current-account
  per-session revocation only, successful API-owned revocation transition only,
  and no runtime authorization granted by this docs packet. The recommended
  future event key is `security.session_revoked`, with subject type
  `auth_session`, versioned contract `security.session_revoked.v1`, and a
  first-class `authSessionId` target for the revoked session row.
- Target/open posture:
  the future notification target is a navigation/reference hint only. Opening
  must re-fetch the notification through the current-user notification API and
  re-fetch the session/security target through current-account authorized
  auth/session APIs. Client-supplied target IDs, push payloads, local cache
  rows, action URLs, copied IDs, and generated-client methods are not
  authorization proof.
- Recipient/content posture:
  only the affected account owner's server-mode profile may receive the first
  slice. Admin/operator/friend/group/bill/settlement/OCR recipients and
  client-provided recipients remain forbidden. Safe content is limited to
  generic security/session title/body/category/severity, timestamp/correlation
  where safe, approved `authSessionId`, bounded device/session display label if
  already authorized by the future session list/detail policy, and normalized
  revocation reason. Raw tokens, token hashes, refresh credentials, password/
  MFA/passkey/provider material, raw IP/user-agent details, unrelated account
  data, and business data remain forbidden.
- Future gates before runtime:
  auth/security manual approval; source endpoint/session authority confirmation;
  `authSessionId` target-reference approval; event/subject constants and writer
  placement; redaction/audit review; schema/OpenAPI/generated-client review if
  any public shape changes; focused source/recipient/target/redaction/read-
  archive/provider-disabled tests; and a separate PR/merge gate.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, delivery attempts, admin policy
  mutation/write API, UI/Figma, #371 behavior, auth/session/security runtime,
  money/settlement/bill/OCR/storage/sync/reconciliation behavior, deployment/
  CI/Docker/env, secrets, issue closure/reopen, or Project fields.

### Issue #369 - Session revocation notification source design gate

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `7649f7da951a417a3a2d0d73edd4fee21bdde3d3`.
- Verification timestamp:
  `2026-07-05 17:50 HKT` task window.
- Source-state packet:
  `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_SOURCE_DESIGN_PACKET.md`.
- Design digest:
  the safest first future auth/session/security notification candidate is
  user-initiated current-account per-session revocation only. The source must
  be the successful API-owned revocation transition for one non-current session
  owned by the authenticated account, with the affected account owner as the
  only recipient. Admin revocation, account-wide revocation, suspicious-session
  revocation, replay/session-family revocation, current-session sign-out,
  credential/MFA/passkey/security-policy events, expiry, denied attempts, and
  generic session-list/status reads remain non-candidates for this first slice.
- Target/redaction posture:
  a future runtime task must choose exactly one safe target shape, such as
  current-account-authorized `authSessionId`, `authAuditEventId`, or a
  security-center target. Raw session tokens, token hashes, refresh tokens,
  raw or unbounded IP/user-agent details, password/MFA/passkey/provider
  material, and unrelated account or business data remain forbidden.
- Future gates before runtime:
  auth-security manual review; auth runtime source endpoint/session authority
  confirmation; target-reference approval; notification event constant and
  writer design; audit and notification redaction review; OpenAPI/schema/
  generated-client review if any API or target shape changes; focused tests;
  and a separate manual auth-security PR/merge gate.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, delivery attempts, admin policy
  mutation/write API, UI/Figma, #371 behavior, auth/session/security runtime,
  money/settlement/bill/OCR/storage/sync/reconciliation behavior, deployment/
  CI/Docker/env, secrets, issue closure/reopen, or Project fields.

### Issue #369 - Auth/session/security notification source decision packet

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `43b9f484ae32963082a529c710491b06efc32aa1`.
- Verification timestamp:
  `2026-07-05 16:05 HKT` task window.
- Decision packet:
  `docs/planning/NOTIFICATION_369_AUTH_SECURITY_SOURCE_DECISION_PACKET.md`.
- Decision digest:
  auth/session/security notifications are not ready for runtime implementation
  from #369 alone. Current auth/session/security runtime has real API-owned
  source states, including session revocation and auth audit foundations, but
  notification event constants, subject types, first-class auth/session/security
  target references, authorized re-fetch route policy, recipient/self-notify
  rules, suppression/bypass posture, and redaction/external-snippet approvals
  remain missing.
- Safest next action:
  create a future manual auth-security design task for exactly one first event
  candidate, preferably explicit current-account per-session revocation
  (`security.session_revoked`) if approved, or keep all auth/security
  notifications blocked. That future task must choose the exact source
  transition, recipient rule, self-notification behavior, target-reference
  shape, subject type, action target, OpenAPI/schema/generated-client boundary,
  redaction class, and validation plan before runtime.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, delivery attempts, admin policy
  mutation/write API, UI/Figma, #371 behavior, auth/session/security runtime,
  money/settlement/bill/OCR/storage/sync/reconciliation behavior, deployment/
  CI/Docker/env, secrets, issue closure/reopen, or Project fields.

### Issue #635 - Parent remaining gates decision after #689 closure

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `8d203a49e9ff9355d78c4d38cd7d28115bb70d36`.
- Verification timestamp:
  `2026-07-05 15:00 HKT`.
- Completed child-chain posture:
  - #684, #685, #686, #687, #688, and #689 are `CLOSED`.
  - PR #704 merged the final acceptance packet for #689 at merge SHA
    `aec099052dbb5125c3160f99d896d8c652dca46c`.
  - PR #705 merged final #689 ledger hygiene at merge SHA
    `8d203a49e9ff9355d78c4d38cd7d28115bb70d36`.
- Related open posture:
  #403, #369, #368, and #634 remain `OPEN` for broader notification/provider,
  event coverage, delivery-state, device-token, and push-provider work.
- Related closed posture:
  #371 remains `CLOSED`; the #635 readout-first chain did not change
  notification-open/deep-link behavior.
- Decision packet:
  `docs/planning/NOTIFICATION_635_PARENT_REMAINING_GATES_DECISION_PACKET.md`.
- Recommendation:
  keep #635 open. #689 closure completes the accepted readout-first child
  chain, but it is not provider sending, admin policy mutation/write API,
  mutation audit, admin/operator UI, user/mobile readout UI, device-token
  provider integration, broader #403/#369/#368/#634 notification-provider
  completion, or future OpenAPI/schema/generated-client expansion.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, admin policy mutation/write API, UI,
  #371 behavior, money/settlement/bill/OCR/storage/sync/reconciliation
  behavior, deployment/CI/Docker/env, auth/session/security runtime, or
  secrets.

### Issue #689 - Admin notification policy final acceptance

- GitHub state/project status: issue `CLOSED` as completed after PR #704
  merged the final acceptance packet and no reviewer, CI/check, validation, or
  scope blocker remained. Project field mutation was not attempted.
- Last verified at main SHA:
  `aec099052dbb5125c3160f99d896d8c652dca46c` after PR #704.
- Merged PR:
  #704 `docs: add notification policy final acceptance packet` at merge SHA
  `aec099052dbb5125c3160f99d896d8c652dca46c`.
- Reviewed acceptance-packet head:
  `24ae454a9185d39d707208db691f7ef60cdd00ef`.
- Acceptance packet branch:
  `docs/notification-689-final-acceptance-readiness-20260705`, retained at
  `24ae454a9185d39d707208db691f7ef60cdd00ef`.
- Acceptance packet path:
  `docs/planning/NOTIFICATION_689_FINAL_ACCEPTANCE_PACKET.md`.
- Merge-gate report:
  `.codex/reports/settleora-codex-report-20260705-1437-notification-689-final-acceptance-pr704-merge-gate.md`.
- Current PR state: PR #704 `MERGED`.
- Completed prerequisite child posture:
  - #684 `CLOSED`: PR #697 merged the read-only guarded admin notification
    policy readout foundation, EF schema foundation, OpenAPI contract, and
    regenerated web/Dart clients.
  - #685 `CLOSED`: notification policy readout UX reference remains accepted
    as reference-only posture.
  - #686 `CLOSED`: PR #699 merged provider-readiness category/readout-only
    runtime foundation without provider sending/config/secrets.
  - #688 `CLOSED`: PR #701 merged focused current readout/provider-readiness
    redaction coverage.
  - #687 `CLOSED`: PR #702 merged the narrow API/domain notification decision
    policy resolver foundation; PR #703 recorded final ledger closure.
  - #371, #570, #575, #672, and #679 remain `CLOSED` unless a concrete
    regression or approved follow-up changes that posture.
- Acceptance result:
  #689 is closed as completed for the approved readout-first final acceptance
  scope after PR #704 merged, required local validation passed, GitHub checks
  passed on the exact reviewed head, and no reviewer/comment/scope blocker was
  found.
- #635 recommendation:
  keep #635 open. The final acceptance packet closes #689, but parent #635
  still has broader future gates and no unambiguous parent close authorization
  was found in issue body/comments.
- Related open posture:
  keep #403, #369, #368, and #634 open for broader notification/provider,
  event coverage, delivery-state, device-token, and push-provider work unless a
  separate approved close packet satisfies their close rules.
- Remaining future gates outside #689 close scope:
  admin policy mutation/write API, mutation audit, admin/user/mobile UI or
  Figma, provider sending/config/secrets/SMTP/APNs/FCM activation, device-token
  provider integration, delivery-attempt/outbox behavior, and any future
  OpenAPI/schema/generated-client expansion beyond the existing read-only
  endpoint.
- Scope confirmation:
  this acceptance packet is docs-only and does not change runtime code,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  secrets/config, device-token lifecycle, admin policy mutation API, UI,
  #371 notification-open/deep-link behavior, money/settlement/bill/OCR/storage/
  sync/reconciliation behavior, deployment/CI/Docker/env, auth/session runtime,
  or secrets.

### Issue #684 - Admin notification policy schema and API implementation

- GitHub state/project status: issue `CLOSED` as completed after PR #697
  merged the approved readout-first schema/API boundary.
- Last verified at main SHA:
  `b9363ab7fc8c61910f540c4c22ba94966c72b96b`.
- Merged PR:
  #697 `feat(api): add admin notification policy readout foundation` at merge
  SHA `b9363ab7fc8c61910f540c4c22ba94966c72b96b`.
- Reviewed implementation head:
  `7dae261253ee728c081337e1551720eb9e903a0d`.
- Implementation branch:
  `feature/notification-684-policy-runtime-readout-first-20260704`, retained
  at `7dae261253ee728c081337e1551720eb9e903a0d`.
- Completed merged slice:
  - Added the first read-only server-authoritative admin/global notification
    policy readout foundation.
  - Added EF schema/migration foundation for
    `notification_global_policies` and
    `notification_event_policy_overrides` with bounded category fields,
    restrictive relationships, explicit constraints, and no provider secrets,
    provider config values, raw device tokens, provider payloads, raw OCR text,
    storage internals, payment details, private notes, hidden bill data, or
    auth/session token material.
  - Added guarded `GET /api/v1/admin/notification-policy` for authenticated
    system owner/admin callers only; ordinary users are forbidden.
  - Updated OpenAPI and regenerated web/Dart generated clients for the
    read-only endpoint only.
  - Added redaction/category normalization and focused schema/API tests proving
    bounded categories and forbidden-field absence.
- Remaining gates:
  - Admin write/update/delete policy API remains not implemented.
  - #687 resolver runtime wiring remains future work after this accepted
    persistence/contract slice.
  - #686 provider readiness runtime remains readout/category-only and does not
    activate SMTP/APNs/FCM or provider sending.
  - #688 remains open unless reviewers decide this helper/test foundation fully
    satisfies its approved close rule; current recommendation is keep open for
    mutation audit and broader resolver/provider redaction coverage.
  - #635 and #689 remain open; final acceptance is not ready.
- Close/keep-open recommendation:
  keep #684 closed as completed for the readout-first schema/API boundary.
  Keep #635, #686, #687, #688, #689, #403, #369, #368, and #634 open until
  each remaining issue's close rule is satisfied. Keep #685, #371, #570, #575,
  #672, and #679 closed unless a separate concrete approved regression exists.

### Issue #672 - Mobile Flutter V1 visual parity implementation slices

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted by this implementation task.
- Last verified at main SHA:
  `914d1fe0a7ed42f4ce1f193db518b7ddc047d2c8` after PR #678 and before the
  `docs/mobile-672-followup-split-close-20260703` docs/control close handoff.
- Last child-slice checkpoint at base main SHA:
  `154ed6787e1cb1b7f06fd1310ddeff724bd7b886` for branch
  `feature/mobile-shell-home-more-profile-parity-672-20260702`.
- Created by branch:
  `feature/mobile-shared-visual-foundation-20260702`.
- Scope:
  - Tracks shared component foundation plus shell/Home/More,
    bills/OCR/revision, and groups/settle/notifications visual parity work
    against merged mobile references.
  - #371 remains closed and must not be redone without a concrete regression.
  - Mobile visual parity only; no backend/API/OpenAPI/generated-client/schema,
    money, storage, auth runtime, notification-open, TestFlight/App Store, or
    deployment changes are authorized by this issue.
- Current slice:
  - First shared Flutter visual foundation implementation slice adds shared
    visual primitives and migrates low-risk profile/settings-adjacent private
    visual shells without changing repository calls, navigation, actions,
    state handling, auth/session behavior, payment-detail authority, money,
    storage, OpenAPI, generated clients, schema, or backend behavior.
  - Tommy manually rejected the first profile/shared-foundation visual evidence
    from `20260702-2204-mobile-shared-visual-foundation` as
    `VISUAL_REJECTED_THEME_MISMATCH` because the capture still looked like a
    generic warm/light Material screen with beige canvas, white cards, a blue
    info panel, and orange/blue icons.
  - The `20260702-2224` follow-up adds an explicit `Settleora Midnight` shared
    token preset and regenerates the profile/shared-foundation proof against
    the approved dark More/Profile reference language. It does not switch the
    global app default theme, add runtime theme selection, or change profile
    repository/action behavior.
  - Tommy manually reviewed the corrected `20260702-2224` visual evidence at
    `/workspace/logs/settleora-visual-qa/20260702-2224-mobile-shared-visual-foundation-theme-correction/profile-shared-visual-foundation-390x844.png`
    and approved this shared visual foundation slice as
    `VISUAL_APPROVED_WITH_FOLLOWUPS`. This approval keeps the first warm/beige
    visual evidence rejected, does not approve full app visual parity, and does
    not authorize silently switching the entire runtime app default theme.
  - The Shell/Home/More/Profile child slice on branch
    `feature/mobile-shell-home-more-profile-parity-672-20260702` migrates the
    live authenticated shell first-impression surfaces toward the approved
    Settleora Midnight references by using shared bottom-sheet/dialog frames,
    shared list rows, inline panels, money chips, status chips, and tokenized
    shell card styling for Home, attention/readout cards, More/settings rows,
    data-safety preview shells, and profile/payment evidence. It preserves the
    current global app default theme because a true selectable preset/runtime
    theme system remains future work, and switching the full app default would
    affect unrelated Bills, Groups, Settle, Notifications, OCR, recurring, and
    report routes outside this child slice.
  - Fresh visual evidence for the Shell/Home/More/Profile slice was generated
    under
    `/workspace/logs/settleora-visual-qa/20260702-2258-mobile-shell-home-more-profile-parity/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, and `profile-payment-390x844.png`. This evidence
    was manually reviewed as
    `VISUAL_REVIEW_NEEDS_FOLLOWUP_BOTTOM_NAV_OVERLAP` because the Home
    attention and More hub captures showed content clipped at the persistent
    bottom nav boundary.
  - The `20260702-2323` visual follow-up on the same branch increases shell
    scroll bottom padding and updates the focused visual evidence harness to
    capture Home attention, More lower sections, and Profile/payment content
    only when the target content clears the bottom nav or viewport boundary.
    Fresh follow-up evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260702-2323-mobile-shell-home-more-profile-visual-followup/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, and `profile-payment-390x844.png`. This evidence
    is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR should be opened before explicit
    visual approval.
  - Tommy reviewed the `20260702-2323` refreshed Home/More/Profile evidence and
    requested that the settings/config-like content not live directly under the
    More root. The `20260702-2336` development follow-up on the same branch
    keeps More as a concise hub by moving notification preference controls,
    delivery timing readouts, local/server mode authority readouts, sync/security
    required readouts, unsupported appearance/theme readouts, and local
    backup/import-preview controls behind an App settings detail route/surface.
    Root More now keeps only grouped navigation/readout rows for Account,
    Security and privacy, App, Activity and records, and Data and sync. Fresh
    development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260702-2336-mobile-shell-more-settings-hub-followup/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`, and
    `profile-payment-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval is deferred.
  - The `20260703-0012` development polish pass on the same branch rechecked
    that the root More tab remains a concise grouped hub with navigation/readout
    rows only, then tightened the App settings data-safety section by composing
    the local backup and generated-backup preview readouts with shared
    `SettleoraSection`, `SettleoraInlinePanel`, and
    `SettleoraKeyValueText` primitives. It preserved notification preference
    behavior, local backup/import-preview behavior, unsupported appearance
    readouts, product copy, profile/payment repository calls, QR metadata
    behavior, and the global runtime app default theme. Fresh development
    evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-0012-mobile-shell-settings-profile-polish-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`, and
    `profile-payment-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval is deferred.
  - The `20260703-0018` development-only setup/sign-in/settings polish pass on
    the same branch started from remote head
    `f572cf9b591c33b9ba8df0fc14799e151797b788` and keeps the exact pushed
    branch head in the matching Codex report and #672 issue comment because the
    no-amend rule prevents recording a commit's own SHA inside the same commit.
    This pass composes setup and sign-in with shared Settleora cards, compact
    headers, inline/readout panels, and the existing Midnight visual evidence
    theme while preserving setup choices, server URL validation, sign-in
    validation, loading/error states, auth/session repository calls, change
    server behavior, and server/local authority copy. It also regenerates the
    existing shell/settings/profile evidence and adds setup/sign-in captures
    under
    `/workspace/logs/settleora-visual-qa/20260703-0018-mobile-setup-signin-settings-polish-dev-only/`
    with `setup-mode-390x844.png`, `sign-in-390x844.png`,
    `home-shell-390x844.png`, `more-hub-390x844.png`,
    `more-settings-390x844.png`, and `profile-payment-390x844.png` plus the
    existing `home-attention-390x844.png` capture. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval remains deferred.
  - The `20260703-1046` development-only follow-up on the same branch started
    from remote head `ef062fe2a5bbfb03d7b8edd66df636a357e1a099` and addresses
    Tommy's payment-profile copy, local-backup copy, and authenticated-shell
    top-right action feedback. It keeps the existing profile/payment detail
    model, QR metadata behavior, payment-detail visibility posture,
    notification center routing/readout behavior, local backup/import-preview
    authority boundaries, sign-out/session-management behavior, global runtime
    app default theme, and all API/OpenAPI/generated-client/schema/backend
    boundaries unchanged. Fresh development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1046-mobile-shell-profile-copy-nav-followup-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`,
    `profile-payment-390x844.png`, `setup-mode-390x844.png`, and
    `sign-in-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval remains deferred.
  - The `20260703-1110` development-only follow-up on the same branch started
    from remote head `b6088e707b4a75359fc8d780f8862eac5c3d1358` and addresses
    Tommy's Home duplicate bell cleanup plus setup/sign-in copy simplification.
    It keeps notification center routing/readout behavior, setup choices,
    server URL validation, local/server mode behavior, sign-in validation,
    auth/session repository calls, More/App settings/Profile payment accepted
    areas, the global runtime app default theme, and all
    API/OpenAPI/generated-client/schema/backend boundaries unchanged. Fresh
    development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1110-mobile-shell-home-setup-signin-copy-followup-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`,
    `profile-payment-390x844.png`, `setup-mode-390x844.png`, and
    `sign-in-390x844.png`.
  - Tommy manually reviewed the `20260703-1110` Shell/Home/More/App
    settings/Profile/Setup/Sign-in evidence and approved this bounded child
    slice as `VISUAL_APPROVED_WITH_FOLLOWUPS`. This approval is only for the
    bounded Shell/Home/More/App settings/Profile/Setup/Sign-in visual parity
    child slice under #672. It does not approve full mobile visual parity, does
    not close #672, does not approve Bills/OCR/revision visual parity, does not
    approve Groups/Settle/Notifications visual parity, and does not authorize
    runtime theme switching or a theme picker.
  - PR/merge gate started from reviewed source head
    `d45c7fdd2f752f696a791fc653fa237324763737` on branch
    `feature/mobile-shell-home-more-profile-parity-672-20260702`, with starting
    `origin/main` expected at
    `154ed6787e1cb1b7f06fd1310ddeff724bd7b886`. #672 remains open during and
    after this gate.
  - PR #674 merged the bounded Shell/Home/More/App settings/Profile/Setup/
    Sign-in visual parity child slice to `main` at
    `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`. This approval remains limited
    to that child slice and does not approve full mobile visual parity,
    Bills/OCR/revision visual parity, Groups/Settle/Notifications visual
    parity, runtime theme switching, or theme picker/persistence.
  - The `20260703-1208` development-only Bills/OCR/revision visual parity
    child slice on branch
    `feature/mobile-bills-ocr-revision-visual-parity-672-20260703` started
    from `origin/main` at `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`.
    Completed scope is presentation-only migration of selected high-visibility
    existing Bills/OCR/revision surfaces toward the approved Settleora Midnight
    direction: shared state/loading/sync panels in bills, shared card/header/
    key-value/inline panels for bill revision review and proposal editor
    shells, and shared OCR review queue card/error treatment. It also adds
    focused visual evidence capture for reachable OCR queue/detail and bill
    revision review/proposal surfaces. It preserves bill repositories,
    attachment/OCR review request construction, OCR apply/preview behavior,
    bill revision lifecycle behavior, settlement/payment/money authority,
    storage/file-byte behavior, API/OpenAPI/generated-client/schema/backend
    boundaries, #371 notification-open behavior, and the global runtime app
    default theme.
  - Fresh development evidence for the Bills/OCR/revision slice was generated
    under
    `/workspace/logs/settleora-visual-qa/20260703-1208-mobile-bills-ocr-revision-visual-parity-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
    Validation passed: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/bill_revision_review_screen_test.dart
    test/bill_revision_proposal_editor_screen_test.dart
    test/receipt_ocr_review_screen_test.dart`,
    `flutter test test/ui/bills_ocr_revision_parity_visual_capture_test.dart`,
    and full `flutter test` with 810 passing tests.
  - Tommy reviewed the `20260703-1208` Bills/OCR/revision visual evidence and
    blocked it for follow-up because the OCR review queue/listing looked too
    plain, listing cards did not expose enough important amount/date/status/
    source/line-count style context where available, and the pages still felt
    too far from the approved Bills/OCR/revision references. The
    `20260703-1248` dirty recovery on the same branch inspected and salvaged
    the failed `20260703-1238` development-only follow-up. It keeps the
    scope presentation-only and increases product readout density in the
    existing OCR queue/detail and bill revision review/proposal screens. OCR
    queue cards now show merchant, status, personal/group scope, source,
    line count, currency when exposed by the queue summary, updated date, and
    a `Review receipt` action. OCR detail now promotes merchant, grand total
    plus currency, receipt date, source, status, readiness, totals, and line
    quantity/unit/line-total readiness into stronger cards. Bill revision
    review/proposal now promote total/currency/status, viewer and payer deltas,
    participant/payer counts, and server-validation posture. The queue summary
    model still does not expose receipt date or total amount, so those values
    are only shown on the detail surface where available. Fresh follow-up
    recovery evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1248-mobile-bills-ocr-revision-info-density-followup-recovery/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; the previous failure was report/export
    compaction after validation, not a validation failure. No PR or merge has
    been performed.
  - Tommy reviewed the latest Bills/OCR/revision evidence and rejected it as
    `VISUAL_REJECTED_UX_FLOW_AND_INFORMATION_HIERARCHY` because the OCR queue
    still read like metadata-chip collections, the detail/review/proposal
    surfaces exposed technical facts without enough user journey, and the first
    viewport did not make attention, amount/change, next action, or blocked
    state obvious enough. The `20260703-1320` development-only follow-up on
    branch `feature/mobile-bills-ocr-revision-visual-parity-672-20260703`
    started from head `b158c4641556bfcc3c56d90abd847a0bd3e3a15a` and keeps the
    scope presentation-only. OCR queue cards now lead with merchant/scope,
    review reason, checkpoint count, receipt source/line/currency metadata,
    updated date, and one primary `Review receipt` action. OCR detail now leads
    with receipt total/context and a preview/apply attention panel before the
    lower structured totals and line review. Bill revision review now leads
    with a decision panel for what changed, viewer share delta, payer impact,
    and available/blocked next action. The proposal editor now starts with a
    guided proposal overview, participant/payer summary, and short save
    consequence copy. No OCR extraction/runtime, apply behavior, money/split/
    settlement logic, API/OpenAPI/generated-client/schema, auth/session/
    security, storage/file-byte, notification-open, deployment, or runtime theme
    behavior changed. Fresh evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1320-mobile-bills-ocr-revision-ux-density-followup-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. The captures are nonblank and do not
    show content hidden under bottom navigation. Validation passed after a
    focused OCR detail copy fix: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/bill_revision_review_screen_test.dart
    test/bill_revision_proposal_editor_screen_test.dart
    test/receipt_ocr_review_screen_test.dart`,
    `flutter test test/ui/bills_ocr_revision_parity_visual_capture_test.dart`,
    and full `flutter test` with 810 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
  - Tommy reviewed the `20260703-1320` Bills/OCR/revision evidence and found
    the direction improved but not PR-ready because OCR queue/review still felt
    too system-like, queue cards needed clearer receipt/action/value hierarchy,
    and revision/proposal copy still had backend/server wording. The
    `20260703-1348` development-only follow-up on the same branch keeps the
    scope presentation-only and makes the first viewport friendlier: OCR queue
    cards now use product-facing receipt source, detected currency or total-not-
    confirmed, line count, last-updated, action-needed, and `Review receipt`
    labels; OCR detail uses `Preview changes`, `Draft update`, and
    apply-to-draft copy without server-preview wording; revision review avoids
    raw revision IDs in the first header and emphasizes `Your share changes by`
    plus `Payer needs confirmation`; proposal save copy says saving sends the
    proposal for review and does not change the bill yet. No OCR extraction/
    runtime, apply behavior, money/split/settlement logic, API/OpenAPI/
    generated-client/schema, auth/session/security, storage/file-byte,
    notification-open, deployment, or runtime theme behavior changed. Fresh
    evidence is expected under
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`
    with the same four OCR/revision PNG artifacts. This checkpoint is
    `READY_FOR_TOMMY_VISUAL_REVIEW` after validation and push; no PR or merge
    is part of this dev-only task.
  - Tommy/Assistant manually approved the `20260703-1348` Bills/OCR/revision
    evidence for this bounded child slice as `VISUAL_APPROVED_WITH_FOLLOWUPS`.
    The reviewed source head before approval checkpoint is
    `a9dfa1a5d1b4901976a962bbfc1c4dfbefa73930` on branch
    `feature/mobile-bills-ocr-revision-visual-parity-672-20260703`. Approved
    evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This approval is limited to the
    bounded Bills/OCR/revision visual parity child slice under #672. It does
    not close #672 and does not approve full mobile Flutter visual parity,
    broader bills list/detail/create parity, saved OCR in-bill detail beyond
    current touched surfaces, OCR capture/processing states, advanced
    tax/discount/fee/refund review runtime, groups/settle/notifications
    parity, runtime theme selection/persistence, backend/API/OpenAPI/
    generated-client/schema/money/storage/security/OCR runtime changes, or
    #371 notification-open/deep-link redo. Known non-blocking follow-ups:
    `Action needed: needs review.` can become friendlier copy later, proposal
    total-lower helper copy can avoid backend-ish validation wording in a
    future copy pass, and full bills list/detail/create parity remains a later
    child slice.
  - The `20260703-1422` development-only Groups/Settle/Notifications visual
    parity child slice on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27` after PR #675. Completed scope
    is presentation-only migration of existing Groups, Settle, and
    Notifications runtime surfaces toward the approved Settleora Midnight
    direction: shared list rows and cards for group/member readouts, clearer
    settlement balance/request/payment/detail hierarchy using existing loaded
    values only, and shared card/bottom-sheet treatment for notification list
    and detail readouts. It preserves group repositories/actions, settlement
    payment/proof/status authority and money calculations, notification open/
    deep-link behavior from #371, push/provider/admin/global policy states,
    API/OpenAPI/generated-client/schema/backend boundaries, auth/session/
    security behavior, storage/file-byte behavior, deployment, and the global
    runtime app default theme.
  - Fresh development evidence for the Groups/Settle/Notifications slice was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1422-mobile-groups-settle-notifications-visual-parity-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. All captures are 390x844 PNGs,
    nonblank, and generated with `SettleoraTheme.midnight()`. Validation
    passed: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/group_list_screen_test.dart
    test/settlement_list_screen_test.dart test/notification_screen_test.dart`,
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`,
    and full `flutter test` with 811 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
    Project fields were not mutated.
  - Tommy manually reviewed the `20260703-1422` Groups/Settle/Notifications
    evidence and rejected it as not PR-ready because Notifications felt too
    wordy/debug-like, several screens still felt difficult for normal public use,
    and visible backend/API/architecture-style explanations remained in normal
    UI. The `20260703-1550` development-only UX simplification follow-up on
    branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from previous branch head
    `9a7755d6d035fd3c88b19ff847b8939df5e2ea48` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps the scope presentation-only and simplifies public-facing copy and
    hierarchy: notification center/detail now use concise product sections such
    as Inbox, Unread, Needs attention, Review, What happened, What you can do,
    Status, Linked item, and Safety note; Groups now emphasizes accessible
    groups, search, role, status, and membership status without route/dashboard
    authorization explanations; Settlements now emphasizes You owe/You're owed,
    remaining amount, pending payments, and plain next actions. It preserves
    notification list/filter/read/archive/restore/mark-read behavior and #371
    open/deep-link behavior, group list/detail/create/member actions and
    repository behavior, settlement state authority, payment/proof workflows,
    repository calls, money calculations, API/OpenAPI/generated-client/schema,
    auth/session/security runtime, storage/file-byte behavior, deployment, and
    the global runtime app default theme.
  - Fresh UX simplification evidence for the Groups/Settle/Notifications slice
    was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1550-mobile-groups-settle-notifications-ux-simplification-dev-only/`
    with `groups-list-or-dashboard-390x844.png` (61037 bytes),
    `settle-dashboard-or-list-390x844.png` (73589 bytes),
    `settlement-detail-or-payment-390x844.png` (75112 bytes),
    `notifications-center-390x844.png` (66624 bytes), and
    `notification-detail-or-review-390x844.png` (76436 bytes). All captures are
    390x844 PNGs and generated with `SettleoraTheme.midnight()`. Validation
    passed: `npm ci`, `npm run validate:docs`, `npm run validate:scaffold`,
    `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/group_list_screen_test.dart
    test/settlement_list_screen_test.dart test/notification_screen_test.dart`,
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`,
    and full `flutter test` with 811 passing tests. The existing test harness
    warning about unspecified tag `visual` on the guardrail helper test remains
    non-fatal. This evidence is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge
    has been performed. Project fields were not mutated.
  - Tommy reviewed the `20260703-1550` evidence and said the Notifications
    Center/detail still felt compressed and not convenient enough for normal
    public users, while Groups and Settlements were acceptable enough for now.
    The `20260703-1714` development-only density follow-up on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from previous branch head
    `7fe79a3f3a79eb9a0670adbc6bd80af5f9dfb803` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps scope to Notifications UI/test evidence and the ledger: Notification
    Center cards now use a roomier vertical layout with full-width title/message
    treatment, one clear primary action where a typed target can open, and
    quieter top-right secondary inbox actions; the visible bulk-read control is
    a compact inline row instead of a large boxed panel. The notification
    detail sheet now prioritizes `What happened`, `What you can do`,
    `Linked item`, and `Safety note` instead of dense key-value/debug-style
    status rows, and uses concise safety copy: `We recheck access before
    opening details.` It preserves notification list/filter/read/archive/
    restore/mark-read behavior, #371 notification-open/deep-link behavior,
    notification runtime/provider/push/email/admin/global policy semantics,
    API/OpenAPI/generated-client/schema, auth/session/security runtime,
    settlement/payment/money authority, storage/file-byte behavior,
    deployment, and the global runtime app default theme.
  - Fresh density follow-up evidence for the notification-focused pass was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1714-mobile-notifications-center-density-followup-dev-only/`
    with the grouped visual-capture harness artifacts
    `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. The follow-up scope was
    Notifications Center/detail only; Groups/Settlements were regenerated for
    visual continuity and were not intentionally redesigned. All captures are
    390x844 PNGs and generated with `SettleoraTheme.midnight()`. Focused
    validation during implementation passed:
    `flutter test test/notification_screen_test.dart` with 64 passing tests and
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`
    with 1 passing test. Full required validation is recorded in the matching
    Codex report. This evidence is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or
    merge has been performed. Project fields were not mutated.
  - Tommy reviewed the `20260703-1714` continuity evidence and requested a
    public-user UX polish pass focused on Groups and Settlements while leaving
    the improved Notifications Center alone unless required for continuity.
    The `20260703-1745` development-only polish pass on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from expected branch head
    `96caaf1b455983c611775a1d6af3128ebbbd7b99` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. It keeps scope to Groups,
    Settlements, visual-capture continuity, focused tests, and this ledger:
    group cards now use product-facing phrases such as `You are the owner`,
    `You are a member`, `Active group`, and `Removed from new activity` while
    preserving role/status chips and existing search/filter behavior. The
    settlement dashboard keeps server-provided balance fields but prioritizes
    `Remaining`, `Pending payments`, and `Paid`, moving low-frequency residual
    readouts into calmer chips and replacing stale/technical refresh copy with
    `Refresh if anything looks out of date.` Settlement detail sections now
    emphasize `Next step`, `What this includes`, `Included bills`, and
    `Payment details`, fix the singular grammar to `1 needs confirmation`, and
    use friendlier safety copy before settlement actions. This pass does not
    change settlement calculations, payment workflow, proof authorization,
    group membership/runtime permissions, repository calls, API/OpenAPI/
    generated-client/schema, notification-open/deep-link #371 behavior,
    notification runtime/provider/push/email/admin/global policy semantics,
    auth/session/security runtime, storage/file-byte behavior, deployment,
    or the global runtime app default theme.
  - Fresh UX polish evidence for the Groups/Settle pass is generated by the
    grouped visual-capture harness under
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. The notification artifacts are
    continuity-only unless the final report states otherwise. All captures use
    `SettleoraTheme.midnight()`. Final validation and the final commit SHA are
    recorded in the matching Codex report. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed. Project
    fields were not mutated.
  - Tommy manually reviewed the `20260703-1745` Groups/Settle/Notifications
    evidence and approved this bounded child slice as
    `VISUAL_APPROVED_WITH_SMALL_FOLLOWUPS`. The approved source head before the
    PR/merge approval checkpoint is
    `2b842fe868ba9d40c98f775c9d9ffa3436a85ae4` on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`.
    Approved evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. Known non-blocking visual
    follow-ups are notification detail safety note / received timestamp spacing
    polish and hiding zero-value settlement chips when they are not useful.
    This approval is limited to the bounded Groups/Settle/Notifications visual
    parity child slice under #672. It does not close #672, does not approve
    full mobile Flutter visual parity, and does not authorize backend/API/
    OpenAPI/generated-client/schema, auth/session/security runtime, storage/
    file-byte, settlement money/state authority, payment workflow, proof
    authorization, group membership/runtime permissions, notification runtime/
    provider/push/email/admin/global policy semantics, #371 notification-open/
    deep-link redo, deployment, runtime theme default switching, theme picker,
    theme persistence, or Figma API changes.
  - The `20260703-1830` development-only Bills list/detail/create visual parity
    child slice on branch
    `feature/mobile-bills-list-detail-create-visual-parity-672-20260703`
    started from `origin/main` at
    `6cd629dd8265b8f5dadce636beed51729126e13b`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps scope presentation-only and improves the current Flutter Bills
    first-viewport hierarchy: the personal Bills list now opens with a
    `Bills dashboard` card, bill counts, review/archive state, clearer primary
    create/scan actions, and bill summary rows that emphasize amount, status,
    next step, and honest loaded metadata. Bill detail now leads with a
    next-step panel for items, people, and payers before the existing loaded
    bill details, and create-bill/saved-receipt OCR copy now uses product-facing
    review language without changing receipt apply behavior. This pass also
    updates reachable saved OCR-in-bill readouts and focused tests for the
    affected list/detail/create surfaces. It preserves bill repositories,
    routing, archive/restore behavior, saved OCR review/open/apply behavior,
    OCR extraction/runtime, receipt storage/file-byte behavior, money/split/
    settlement/payment authority, bill status transitions, API/OpenAPI/
    generated-client/schema/backend boundaries, auth/session/security runtime,
    deployment, and the global runtime app default theme.
  - Fresh Bills list/detail/create evidence for the `20260703-1830` slice was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1830-mobile-bills-list-detail-create-visual-parity-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. All captures are nonblank 390x844
    PNGs generated with `SettleoraTheme.midnight()`. Validation passed:
    `npm ci`, `npm run validate:docs`, `npm run validate:scaffold`,
    `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/group_bill_list_screen_test.dart`,
    `flutter test test/server_mode_shell_dashboard_test.dart --name "bottom nav switches from bill detail to Groups"`,
    `flutter test test/ui/mobile_bills_list_detail_create_parity_visual_capture_test.dart`,
    and full `flutter test` with 812 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR, merge, or push has been performed.
    Project fields were not mutated. #672 should remain open for review,
    explicit PR/merge gates for approved child slices, remaining OCR capture/
    processing and advanced receipt review polish, future spacing/rhythm
    follow-ups, and any runtime/payment/storage/money/OCR/theme gates. #371
    remains closed and was not touched or reopened.
  - Tommy reviewed the `20260703-1830` Bills list/detail/create evidence and
    rejected it as not PR-ready because the create-bill sticky `Save bill`
    footer sat too close to the item form area, the Bills dashboard filter copy
    still sounded implementation-facing, and the Bills app bar showed
    duplicate-looking sync/refresh affordances. The `20260703-1840`
    development-only follow-up continues the same local task branch from
    `54777034412d40b6eac9d845a7bf806333661dbd`, keeps the existing bill detail
    and saved OCR review surfaces stable, increases create-bill scroll bottom
    padding with focused visual/test coverage for sticky-footer clearance,
    shortens the Bills dashboard filter copy to product-facing language, and
    keeps one app-bar refresh action while preserving the existing Sync queue
    panel `Sync` action. Fresh follow-up evidence is generated under
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`,
    `bill-create-items-safe-footer-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. Final validation, final branch head,
    and push status are recorded in the matching Codex report. #672 should
    remain open for Tommy visual review and any explicit PR/merge gate. #371
    remains closed and was not touched or reopened.
  - Tommy/Assistant manually approved the `20260703-1840` Bills
    list/detail/create follow-up evidence for this bounded child slice as
    `VISUAL_APPROVED_WITH_FOLLOWUPS`. The reviewed source head before this
    approval checkpoint is `a4a6489db934d5a0c23a5073292e33ec78a21e6e` on
    branch `feature/mobile-bills-list-detail-create-visual-parity-672-20260703`.
    Approved evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`,
    `bill-create-items-safe-footer-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. This approval is limited to the
    bounded Bills list/detail/create visual parity child slice under #672. It
    does not close #672, does not approve full mobile Flutter visual parity,
    OCR capture/processing states, advanced tax/discount/fee/refund review
    runtime, future spacing/rhythm follow-ups, runtime theme switching, theme
    picker/persistence, backend/API/OpenAPI/generated-client/schema/money/
    storage/security/OCR runtime changes, or #371 notification-open/deep-link
    redo.
- Post-PR #677 audit checkpoint:
  - GitHub readback on 2026-07-03 HKT verified #672 remains `OPEN`, #371
    remains `CLOSED`, and PRs #673, #674, #675, #676, and #677 are merged.
  - PR #673, merge SHA `154ed6787e1cb1b7f06fd1310ddeff724bd7b886`,
    completed the shared mobile visual foundation slice with approved evidence
    at
    `/workspace/logs/settleora-visual-qa/20260702-2224-mobile-shared-visual-foundation-theme-correction/`.
  - PR #674, merge SHA `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`,
    completed the Shell/Home/More/App settings/Profile/Setup/Sign-in visual
    parity slice with approved evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1110-mobile-shell-home-setup-signin-copy-followup-dev-only/`.
  - PR #675, merge SHA `51fb0baeed84586e5ef44e53c4a407966ac45f27`,
    completed the Bills/OCR/revision visual hierarchy slice with approved
    evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`.
  - PR #676, merge SHA `6cd629dd8265b8f5dadce636beed51729126e13b`,
    completed the Groups/Settle/Notifications visual hierarchy slice with
    approved evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`.
  - PR #677, merge SHA `0a29bba4d76446f641a40d916bae9242c6769996`,
    completed the Bills list/detail/create visual parity slice with approved
    evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`.
  - All verified #672 PRs were visual/presentation/test/ledger scoped only.
    They did not authorize backend/API/OpenAPI/generated-client/schema,
    auth/session/security runtime, storage/file-byte behavior, money/
    settlement/payment/bill calculation authority, OCR extraction/runtime/apply
    behavior, sync runtime behavior, notification runtime/provider/push/email/
    admin/global policy behavior, #371 notification-open/deep-link redo,
    Docker/deployment/env/CI/signing/TestFlight/App Store metadata, runtime
    theme default switching, theme picker/persistence, Figma API output, or
    binary design asset commits.
- Post-PR #678 close handoff:
  - PR #678, merge SHA `914d1fe0a7ed42f4ce1f193db518b7ddc047d2c8`,
    completed the #672 acceptance/readout ledger audit and confirmed PRs
    #673, #674, #675, #676, and #677 were merged.
  - Follow-up issue #679,
    <https://github.com/tommytang213/Settleora/issues/679>, tracks the
    remaining minor mobile copy/spacing/rhythm polish split out from #672.
  - Final #672 decision: the child visual parity implementation slices are
    complete through PRs #673-#677, the post-child audit was merged in PR #678,
    and minor visual polish is split to #679. #672 may be closed after the
    `docs/mobile-672-followup-split-close-20260703` docs/control PR merges.
  - #371 remains closed and untouched; do not reopen or redo notification-open/
    deep-link behavior under #672 or #679 without a separate concrete
    regression and approved gate.
  - Runtime/API/security/money/storage/OCR/theme/deployment gates remain
    separate and are not part of #679. #679 is presentation-only unless a
    future approved split issue explicitly gates broader behavior.
  - Project field updates are not mutated by this ledger entry when tooling is
    unavailable or ambiguous; report any skipped project/status updates in the
    task report.
- Remaining Day 1 work:
  - No currently approved #672 child implementation slice is waiting for a
    PR/merge gate after PR #678.
  - Minor copy/spacing/rhythm cleanup is split to #679 instead of keeping #672
    open as an umbrella.
  - Known non-blocking visual follow-ups after the merged slices include
    spacing/section rhythm, dense bills/OCR/settlement usage polish,
    notification detail safety-note / received-timestamp spacing, hiding
    zero-value settlement chips where not useful, friendlier OCR/revision copy
    such as `Action needed: needs review.`, and future theme/preset behavior.
  - OCR capture/processing states, advanced tax/discount/fee/refund review,
    push/provider/admin notification policy, auth security/privacy vault,
    import/export/backup runtime, and runtime theme picker/default-theme
    behavior remain separate future gated work and should not be treated as
    missing visual child slices unless a new bounded task explicitly approves
    them against existing runtime.
  - Manual/Figma visual review and evidence remain required for any later child
    slice or cleanup PR that changes material mobile presentation.
  - Runtime/payment/storage/money/OCR gates remain required for any behavior
    beyond visual presentation, including OCR extraction/runtime changes,
    receipt storage/file-byte changes, API/OpenAPI/generated-client/schema
    changes, settlement/payment/bill calculation authority, and runtime theme
    picker/default-theme behavior.
- Close/keep-open recommendation:
  - Close #672 as completed after the
    `docs/mobile-672-followup-split-close-20260703` docs/control PR merges,
    provided #679 exists, #371 remains closed, validation/CI pass, and the diff
    remains limited to this ledger.

### Issue #369 - Day 1 in-app notification event-family coverage

- GitHub state/project status: issue `OPEN`; Project field readback was not
  updated by this docs/control task. Related issues #368, #403, #634, and #635
  were read back as `OPEN`; #371 was read back as `CLOSED` after PR #664.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87` after PR #664 and before the
  `docs/auth-session-security-notification-source-policy-369-20260702`
  docs/control branch.
- Completed PRs/slices:
  - PR #654, merge SHA `d58c03753f16741fac0a572de16f1447711c6f64`:
    completed only the narrow `sync.operation_failed` in-app/provider-neutral
    notification slice for newly persisted current-actor rejected sync
    operations.
  - Branch
    `docs/settlement-residual-review-notification-source-policy-369-20260702`:
    adds the #369 settlement residual review notification source-policy gate.
  - Branch
    `feature/settlement-residual-review-needed-notification-369-20260702`:
    implements the narrow `settlement.residual_review_needed` runtime slice
    for successful debtor-created payment claims that persist pending
    receiver-confirmation residuals.
  - Branch `docs/sync-notification-source-policy-369-20260702`: defines the
    remaining sync queued/retry/resolved/conflict-resolution notification
    source policy after `sync.conflict_detected` and `sync.operation_failed`.
  - Branch
    `docs/auth-session-security-notification-source-policy-369-20260702`:
    defines the auth/session/security notification source-policy gate. It
    records current auth/session/security runtime facts and blocks security
    notification runtime until exact source transitions, recipient and
    self-notification rules, first-class target references, redaction, and
    manual auth-security approval exist.
  - PR #664, merge SHA `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`, finalized
    #371 ledger hygiene and issue close posture after accepted notification
    open/deep-link work. #371 is now closed and should not be redone under
    #369.
- Completed scope:
  - Records current residual facts: explicit same-currency underpayment and
    overpayment residual rows, `pending_receiver_confirmation` source state,
    receiver residual confirmation route, dispute/cancellation neutralization,
    and confirmed-only balance projection effects.
  - Separates existing `settlement.payment_partially_paid` and
    `settlement.payment_marked_paid` payment-claim notices from residual
    review semantics.
  - Adds `settlement.residual_review_needed` to the notification event
    vocabulary, OpenAPI enum, generated web/Dart clients, and notification
    event-type check constraints.
  - Writes one unread in-app/provider-neutral `settlement.residual_review_needed`
    notification to the receiver/creditor only when the debtor-created payment
    claim creates a pending receiver-confirmation residual.
  - Reuses existing settlement payment/request target references and existing
    authorized settlement payment read/residual confirmation APIs.
  - Preserves debtor actor suppression, unrelated participant/admin
    suppression, privacy-safe payload exclusions, duplicate/replay no-op
    behavior, and read/archive source-state isolation.
  - Records that current sync runtime has no server-side queued, retrying,
    retry-failed, resolved, reopened, or resolution-applied source states.
  - Defers noisy automatic `sync.operation_queued` and
    `sync.operation_retrying` notifications unless a later policy/runtime
    slice proves a specific transition is user-actionable and privacy-safe.
  - Conditionally allows future `sync.operation_retry_failed`,
    `sync.conflict_resolved`, and `sync.resolution_applied` only after exact
    persisted source transitions exist; `sync.conflict_reopened` remains
    deferred unless a real reopened source state exists.
  - Confirms current `syncOperationId` plus the current-actor sync operation
    read path is sufficient only for future events backed by a persisted
    server `SyncOperation`; local queue, retry schedule, conflict-record, or
    resolution-attempt targets need a future target/reference/API gate.
  - Records current auth/session/security facts: real auth account, identity,
    credential, session, refresh/session-family, auth audit, MFA/passkey,
    recovery-code, and auth security policy foundations exist, and public
    sign-in/refresh/current-user/sign-out/session-list/revocation runtime
    exists. However, notification event constants, subject types, first-class
    auth targets, security recipient/suppression rules, and runtime writers do
    not exist.
  - Blocks `security.session_new_device` / `security.new_session`,
    `security.session_revoked`, `security.all_sessions_revoked`,
    credential-change/reset/rotation events, account status events,
    role/policy-change events, suspicious session/replay, and failed-sign-in
    alerts until source-event semantics and manual auth-security policy are
    reviewed.
- Explicitly not complete:
  - No debtor notification after receiver residual decision.
  - No broader settlement mismatch/review event runtime.
  - No provider send, mobile/deep-link, admin/global policy, settlement
    business schema, money, residual, allocation, payment, proof, balance
    projection, auth/security, deployment, CI, or secret change.
  - No sync queued/resolved/retry/conflict-resolution runtime, event enum,
    OpenAPI/generated-client, EF migration/check constraint, queue consumer,
    scheduler, hosted worker, conflict-resolution implementation, mobile UI,
    or #371 deep-link change.
  - No auth/session/security notification runtime, event enum, target columns,
    OpenAPI/generated-client, EF migration/check constraint, security route,
    MFA/passkey/credential/session behavior, admin/global policy, provider
    delivery, or UI change.
- Remaining Day 1 work:
  - Future debtor notification after receiver residual decisions only if a
    later policy names the event/source/recipient rules.
  - Broader settlement mismatch/review notifications remain blocked until
    broader settlement review source states exist.
  - Runtime implementation for any remaining sync notification events remains
    blocked until exact persisted source states and recipient/action semantics
    exist. Ordinary queue/retry churn should stay local UI/readout rather than
    notification noise.
  - Auth/session/security notification runtime remains blocked until exact
    API-owned source transitions, first-class safe targets, recipient and
    actor-self policy, redaction, and manual auth-security approval exist.
  - #635 admin/global policy/readout, #634 real push/provider and mobile work,
    OCR completed/failed, item claim/split notifications, and final Day 1
    notification acceptance remain open/gated.
  - #371 is closed for notification-open/deep-link scope after PR #664; do not
    reopen or redo #371 work for remaining #369 source-policy slices.
- Close/keep-open recommendation:
  - Keep #369 open. This branch completes only the auth/session/security
    source-policy gate; it does not complete runtime coverage or Day 1
    notification acceptance.
  - Keep #368, #403, #634, and #635 open. Keep #371 closed.
- Last verified repo/report references:
  - `docs/architecture/SETTLEMENT_RESIDUAL_REVIEW_NOTIFICATION_SOURCE_POLICY.md`
  - `docs/architecture/SYNC_NOTIFICATION_SOURCE_POLICY.md`
  - `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
  - `/workspace/logs/settleora-codex-report-20260702-settlement-residual-review-notification-source-policy-369.md`
  - `/workspace/logs/settleora-codex-report-20260702-sync-notification-source-policy-369.md`

### Issue #371 - Notification deep links / mobile notification-open behavior

- GitHub state/project status: issue `CLOSED` after final close checkpoint;
  #368, #369, #403, #634, and #635 remain separate/open. Project field mutation
  was not attempted by this docs/control task.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87` after PR #664 and final close
  checkpoint.
- Completed slices:
  - PR #664, merge SHA `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`, finalized
    issue progress ledger closure-ready state and closed #371 after the final
    close comment.
  - PR #662, merge SHA `c5b2dae7d72cbd94da4437d19a0cdf5d30034723`,
    accepted the repo-native TSX/mobile reference copy and chrome polish.
  - PR #663, merge SHA `8b27a132aca6e6c52f602a940ef0d245ec46e9e5`,
    accepted the Flutter notification-open/deep-link implementation.
  - Branch `docs/notification-deep-link-route-policy-371-20260702` defines
    the #371 notification deep-link route/mobile navigation policy gate.
  - Branch `docs/notification-open-mobile-reference-371-20260702` adds the
    #371 mobile notification-open states reference handoff.
  - Branch
    `docs/notification-open-figma-reference-package-371-20260702` adds the
    focused #371 Figma/reference package for exact notification-open frame
    generation and review.
  - Branch `docs/notification-open-tsx-reference-371-20260702` adds the
    repo-native TSX equivalent reference package for reviewing the same
    notification-open frame inventory without Figma Make, Figma API, Figma
    screenshots, imported tokens, or binary assets.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    corrects that repo-native TSX package to visually align with the approved
    Settleora mobile shell, Notifications, More and Settings, Push
    Registration, Auth Security, and implementation guardrail references.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    also incorporates Tommy's partial visual review follow-up: the visual look
    is acceptable as mobile app UI, but notification-center/detail frames must
    not repeat the top bell affordance and visible phone-frame copy should be
    product-facing rather than backend/architecture phrasing.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    later applies the requested product-copy polish checkpoint: raw event names
    stay in docs/reference metadata only, while visible phone-frame copy uses
    product labels for settlement review, receipt review, sync issues, account,
    offline, unavailable, already handled, push-readiness, and generic fallback
    states.
  - Branch `feature/notification-open-flutter-deeplink-371-20260702` implements
    the first Flutter notification-open/deep-link slice for the existing mobile
    Notification Center without backend, OpenAPI, generated-client, provider,
    schema, deployment, auth/security runtime, or money-authority changes.
- Completed scope:
  - Defines that notification rows, push payloads, local cache, route state,
    object URLs, and generated-client availability are not authorization.
  - Requires opening a notification to re-fetch the notification detail and
    then re-fetch the linked bill, settlement, recurring bill, OCR review, or
    sync operation through authorized API paths.
  - Maps current implemented event families to future route targets: bill
    workflow/revision, settlement request/payment/proof/residual review,
    recurring due/draft, OCR `ocr.needs_review`, and sync
    `sync.conflict_detected` / `sync.operation_failed`.
  - Marks security/auth/session, item-claim/split, broader settlement review,
    OCR completed/failed, remaining sync queued/retry/resolved, provider,
    digest, admin/global policy, push-token, and delivery-attempt routes as
    future/blocked until source/runtime/target policies exist.
  - Defines missing, archived, restored, deleted, unauthorized, group-membership
    changed, resolved, retargeted, account-switched, sign-in-required, offline,
    and server-unavailable fallback behavior without private existence leaks.
  - Records privacy-safe external copy and mobile navigation posture, including
    no first-launch prompt coupling and Figma/reference-gated Flutter
    implementation.
  - Adds `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md` as
    the mobile reference handoff for opening notifications from in-app rows and
    OS push/local notifications.
  - Records product-facing state coverage for sign-in required, wrong account
    or account switched, local-only mode, offline/server unavailable,
    stale/missing targets, deleted/archived/restored targets, unauthorized or
    group-membership-changed targets, already resolved/completed notifications,
    retargeted notifications, loading, provider disabled/unconfigured readouts
    separated from authorization, and notification-detail fallback.
  - Adds privacy-safe copy and screenshot rules plus action-specific button
    wording such as `Open bill`, `Review settlement`, `Review receipt`,
    `View sync issue`, and `Back to notifications`.
  - Adds a paste-ready future Figma/reference prompt and a future Flutter/test
    readiness checklist while preserving server/API/domain authority.
  - Adds
    `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`
    as the Figma/reference review package with exact frame inventory,
    paste-ready Figma Make/designer prompt, UX/copy guardrails,
    privacy/safety restrictions, Tommy first-review checklist, Assistant
    second-review checklist, export evidence expectations, and the future
    Flutter implementation boundary.
  - Adds
    `docs/design/mobile/reference-tsx/notification-open/NotificationOpenReference.tsx`
    as a static, componentized, Figma-token-free equivalent reference with
    phone-frame TSX/CSS, frame index, and data objects covering notification
    inbox selection, authorized re-fetch loading, bill, settlement, residual
    review, recurring, OCR, sync, sign-in, account switch, local-only, offline,
    stale/missing, archived/deleted/restored, unauthorized or membership
    changed, resolved/completed, push-readiness, and generic fallback states.
  - Recovers the TSX visual language away from the initial standalone
    documentation-board look by removing the fake brand-mark treatment,
    arbitrary green gradient shell, square/flat card rhythm, and invented
    reference-board styling, while preserving all 18 #371 notification-open
    states and privacy/authority guardrails.
  - Refines the repo-native TSX reference so Notification Center uses filter
    chrome without a duplicate bell, notification detail/open frames use back
    navigation plus concise context titles without a bell, and visible
    phone-frame copy uses product phrases such as checking access, refreshing
    latest details, reviewing bills/settlements/receipts/sync issues, signing
    in, switching accounts, retrying, and returning to notifications.
  - Polishes the visible phone-frame copy so raw backend event strings such as
    OCR, settlement residual, and sync event names do not appear as user-facing
    labels; replaces debug-style labels such as visible context, shown/hidden,
    and stale-action explanations with shorter product copy and specific
    action labels.
  - Adds mobile notification-open route-family resolution for currently
    supported bill workflow/revision, settlement request/payment/proof/residual
    review, recurring due/draft, `ocr.needs_review`, and
    `sync.conflict_detected` / `sync.operation_failed` families using typed
    notification metadata only.
  - Updates the Flutter Notification Center to refresh the current notification
    row before opening a linked target, then re-fetch linked bill, settlement,
    recurring, OCR review, or sync-operation data through the current mobile
    repository/API seams before showing linked details or actions.
  - Keeps future/blocked auth/session/security, item claim/split,
    OCR completed/failed, remaining sync queued/retry/resolved/reopened,
    broader settlement mismatch/review, provider/digest/admin/global
    policy/readout, push-token/device-token, and delivery-attempt routes on
    product-facing unsupported fallback copy.
  - Removes duplicate bell iconography from Notification Center content while
    preserving the global top notification affordance on ordinary app screens
    and the existing `Home / Bills / Groups / Settle / More` shell.
  - Adds focused Flutter coverage for no duplicate Notification Center bell,
    supported route-family action mapping, OCR/sync opens, unsupported/future
    fallbacks, named sign-in/account/local-only/offline/stale/unauthorized/
    resolved/provider-unconfigured fallback copy, read/open/archive source
    mutation isolation, raw event-id suppression, and scroll-safe long
    notification rows.
  - Final acceptance check returned `READY_TO_CLOSE_RECOMMENDATION` with no
    remaining #371-specific gaps found.
- Explicitly not complete:
  - No Figma Make/API usage, Figma output, screenshots, binary assets,
    notification writer runtime, event enum, OpenAPI, generated-client, EF
    migration/check constraint, auth/session/security runtime,
    business-authority logic, provider sending, admin/global policy,
    deployment/env/CI, Docker, or secret changes.
  - Provider-backed push flows, push registration, admin/global policy/readout,
    backend notification event-family work, and broader notification epic work
    remain separate outside #371.
- Remaining Day 1 work:
  - No remaining #371-specific work was found by the final acceptance check.
  - Backend route/target tests only if a future implementation changes route
    metadata, target APIs, OpenAPI, or notification behavior.
- Close/keep-open recommendation:
  - Keep #371 closed. Do not redo notification-open/deep-link work under #369.
  - Keep #368, #369, #403, #634, and #635 open/separate.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md`
  - `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md`
  - `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`
  - `docs/design/mobile/reference-tsx/notification-open/README.md`
  - `docs/design/mobile/reference-tsx/notification-open/NotificationOpenReference.tsx`
  - `.codex/reports/settleora-codex-report-20260702-1705-notification-open-371-final-acceptance-check.md`
  - `/workspace/logs/settleora-codex-report-20260702-1705-notification-open-371-final-acceptance-check.md`

### Issue #570 - OCR review in-app notification runtime

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0`, `Actual Done Date`
  `2026-06-30`, and linked PR #626 by GraphQL readback on 2026-06-30.
- Last verified at main SHA:
  `ecbabe1bfe432deb8b10617ac59395f338c05b0b`.
- Completed PRs/slices:
  - PR #573, merge SHA `ce808da646146a5177444caff4702f1c645da994`:
    recorded that current OCR review `provisional` and `reviewed` states were
    not safe `ocr.needs_review` source events.
  - PR #574, merge SHA `d755e00efb0db386ace386ed136af66aa79c3b30`:
    recorded the explicit OCR review assignment/source-state policy and kept
    OCR notification runtime blocked until that source state existed.
  - PR #576 / issue #575, merge SHA
    `21c55062a8b7c49a7058e2fbc879b3c5c79bc822`: added the explicit
    API-owned OCR review needs-review assignment/source state prerequisite.
  - PR #626, source head `581aa6aca39041477e3f6ab58a1b8e33944e89ff`,
    merge SHA `ecbabe1bfe432deb8b10617ac59395f338c05b0b`: implemented the
    narrow `ocr.needs_review` in-app notification runtime for explicit
    API-owned OCR review assignment creation/retarget transitions only.
- Completed scope:
  - Creating a new active needs-review assignment, or retargeting an existing
    active assignment to a different authorized responsible editor, writes one
    safe unread `ocr.needs_review` in-app notification to the assigned profile.
  - Plain OCR review save/read/list/apply-preview/apply/delete, assignment
    visibility, completion, cancellation, duplicate same-recipient assignment,
    and actor self-assignment do not create OCR notifications.
  - Dependencies #568 target references and #575 assignment/source state are
    completed and closed/merged.
- Validation summary from PR #626:
  - Local validation passed before merge: `npm run doctor:validation`,
    `npm run validate:openapi`, `npm run validate:clients`,
    `npm run validate:scaffold`, API build with 0 warnings and 0 errors,
    focused API tests with 51 passed/0 failed/0 skipped,
    `timeout 900s npm run validate:api-local` with 1191 passed/0 failed/0
    skipped, `npm run validate:docs`, and final
    `git diff --check origin/main...HEAD`.
  - GitHub CI passed on exact PR head
    `581aa6aca39041477e3f6ab58a1b8e33944e89ff`: CodeQL jobs and Scaffold
    Validation.
- Remaining Day 1 work:
  - `ocr.completed` and `ocr.failed` remain blocked until server OCR
    worker/job source states exist.
  - #371 mobile/deep-link UI behavior remains separate and Figma/reference
    gated.
  - #369 and #368 remain open parent notification trackers.
  - Auth/session/security notification runtime remains manual-gated where
    applicable.
- Future gates requiring explicit approval:
  - Server OCR worker/job source states and failure/completion recipient policy.
  - Mobile/deep-link UI behavior under #371.
  - Auth/session/security notification policy and runtime.
  - Any future OpenAPI/generated-client, schema/migration, storage/privacy,
    money/settlement/bill authority, deployment, CI, or provider-delivery
    expansion outside the already merged #626 slice.
- Close/keep-open recommendation:
  - Keep #570 closed. It completed its narrow runtime slice and must not be
    used as proof that all OCR/server-worker/deep-link notification scope is
    complete.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1445-ocr-notification-source-state-review-570.md`
  - `.codex/reports/settleora-codex-report-20260628-1500-pr-ocr-notification-source-state-review-570-merge.md`
  - `.codex/reports/settleora-codex-report-20260628-1515-ocr-needs-review-source-transition-policy-570.md`
  - `.codex/reports/settleora-codex-report-20260628-1545-ocr-needs-review-assignment-source-state-child-issue-570.md`
  - PR #626:
    `https://github.com/tommytang213/Settleora/pull/626`
  - Issue #570 completion comment:
    `https://github.com/tommytang213/Settleora/issues/570#issuecomment-4844220380`

### Issue #629 - Notification preference decision-envelope and delivery-state foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-06-30`, and linked PR #630 by GitHub/Project
  readback on 2026-06-30.
- Last verified at main SHA:
  `34caca01a6a746f08b1892134a9510b9265cb645`.
- Completed PRs/slices:
  - PR #630, reviewed source head
    `3b181365246d895c9e8b69653dbd67e125cdcfc8`, merge SHA
    `34caca01a6a746f08b1892134a9510b9265cb645`: implemented the
    internal notification decision-envelope foundation.
- Completed scope:
  - Internal `INotificationDecisionEnvelopeResolver` service boundary.
  - Provider-free `NotificationDecisionEnvelopeResolver`.
  - Bounded `in_app`, `email`, and `mobile_push` channel vocabulary.
  - Bounded decision/reason vocabulary with no fake provider success.
  - Decision-only email and push outcomes without SMTP, push, queue, worker,
    device-token, or provider-success runtime.
  - In-app baseline eligibility behavior without weakening
    `IInAppNotificationWriter`.
  - Focused resolver tests.
- Explicitly not complete:
  - No SMTP runtime.
  - No push runtime.
  - No device-token API/storage.
  - No delivery worker, queue, or provider-success state.
  - No provider secrets, environment, or deployment changes.
  - No admin/global notification policy API.
  - No OpenAPI or generated-client changes.
  - No EF schema, migration, or database persistence changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
- Remaining related work:
  - #403 remains open for SMTP runtime, push runtime/device-token lifecycle,
    server-side preference resolution beyond this foundation, delivery-state
    persistence/workers, admin/global policy, and related gated work.
  - #369 remains open for remaining Day 1 notification event-family runtime and
    source-state work.
  - #368 remains open as the notification epic.
  - #371 is now closed after PR #664 for notification-open/deep-link scope;
    do not redo it under #629/#403/#369 work.
- Close/keep-open recommendation:
  - Keep #629 closed as complete for the internal decision-envelope foundation
    only. Do not treat #629 or PR #630 as completion of #403 or #369.
- Last verified repo/report references:
  - PR #630:
    `https://github.com/tommytang213/Settleora/pull/630`
  - Issue #629 completion comment:
    `https://github.com/tommytang213/Settleora/issues/629#issuecomment-4845421050`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2331-notification-decision-envelope-foundation-629-pr-merge.md`

### Issue #638 - Notification delivery-attempt persistence foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-07-01`, and linked PR #639 by GitHub/Project
  readback on 2026-07-01.
- Last verified at main SHA:
  `de2a7a38fe902c71592fef62d26fab4a4797ca5a`.
- Completed PRs/slices:
  - PR #639, reviewed source head
    `41e3c565d003dd7199a42442ec52e0a1bf16df9a`, merge SHA
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`: implemented the
    approved Option A provider-neutral notification delivery-attempt
    persistence/service foundation.
- Completed scope:
  - Provider-neutral `NotificationDeliveryAttempt` domain model.
  - Additive `notification_delivery_attempts` table.
  - Bounded pre-provider delivery-attempt constants and constraints.
  - Internal `INotificationDeliveryAttemptRecorder` service boundary and EF
    implementation.
  - DI registration without hooking the recorder into current writers or
    endpoints.
  - Recorder consumes #629 decision-envelope output plus source-domain
    eligibility and creates rows only for eligible `email` or `mobile_push`
    decisions.
  - Disabled, unconfigured, deferred, skipped, unsafe, source-ineligible, and
    missing-recipient paths no-op without fake `sent`, `delivered`, or
    provider success.
  - Idempotency is enforced by unique idempotency key/correlation behavior.
  - Focused tests cover persistence, no fake success, idempotency, no in-app
    or source mutation, sensitive-field exclusions, additive migration shape,
    and provider dependency absence.
- Migration/schema review:
  - Additive-only review passed.
  - `Up` creates only `notification_delivery_attempts` plus check constraints,
    indexes, and restricted FKs.
  - `Down` drops only `notification_delivery_attempts`.
  - No destructive `Up` operation against existing tables/columns.
  - No raw provider payload, SMTP credential, device token, storage path,
    object key, signed URL, local path, raw OCR/receipt text, payment detail,
    private note, hidden bill detail, or unrelated user-data field was added.
- Explicitly not complete:
  - No SMTP sending/runtime/provider adapter under #632.
  - No push sending/runtime/provider adapter or device-token API/storage under
    #634.
  - No worker/outbox processing loop.
  - No provider secrets, environment, deployment, APNs, FCM, or SMTP
    credentials.
  - No admin/global notification policy API/readout under #635.
  - No OpenAPI or generated-client changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
  - No storage/file-byte behavior.
  - No money, bill, split, settlement, payment, recurring, sync, OCR worker,
    import, export, or restore authority.
- Close/keep-open recommendation:
  - Keep #638 closed as complete for the provider-neutral delivery-attempt
    persistence/service foundation only.
  - Do not treat #638 or PR #639 as completion of #633 or #403.
- Last verified repo/report references:
  - PR #639:
    `https://github.com/tommytang213/Settleora/pull/639`
  - Issue #638 completion comment:
    `https://github.com/tommytang213/Settleora/issues/638#issuecomment-4850635401`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-0155-notification-delivery-attempt-persistence-foundation-638.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`

### Issue #641 - Notification delivery worker/outbox foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-07-01`, and linked PR #642 by GitHub/Project
  readback on 2026-07-01.
- Last verified at main SHA:
  `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`.
- Completed PRs/slices:
  - PR #642, reviewed source head
    `e65ad69f7ecfc28f4d56d844e2d1a2c8ca927d69`, merge SHA
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`: implemented the
    approved Option A provider-neutral notification delivery worker/outbox
    foundation over #638 `notification_delivery_attempts`.
- Completed scope:
  - Internal provider-neutral lease service and outbox processor service
    boundaries.
  - Lease-owner, lease-expiry, and last-attempt metadata for delivery
    attempts.
  - Retry/backoff handling through `next_attempt_at_utc`.
  - Provider-neutral safe no-op processing for disabled, unconfigured,
    cancelled, suppressed, expired, and other non-runnable attempts.
  - Bounded pre-provider state transitions: expired queued attempts transition
    only to `expired`; unsafe, source-invalid, or missing-recipient queued
    attempts transition only to `suppressed`.
  - DI registration for internal/future use only.
  - Focused tests for schema, lease/claim behavior, retry/backoff,
    idempotency, safe no-ops, provider/runtime absence, no source/in-app
    mutation, and sensitive-field exclusions.
- Migration/schema review:
  - Additive-only review passed.
  - `Up` adds nullable `last_attempted_at_utc`, nullable
    `lease_expires_at_utc`, nullable `lease_owner`, one lease/status index,
    and two lease consistency check constraints on
    `notification_delivery_attempts`.
  - `Down` removes only the new index, constraints, and columns.
  - No destructive operation against existing business tables/columns.
  - No raw provider payload, SMTP credential, push credential, device token,
    storage path, object key, signed URL, local path, raw OCR/receipt text,
    payment detail, private note, hidden bill detail, or unrelated sensitive
    schema field was added.
- Runtime activation review:
  - No hosted background service, scheduler, queue consumer, RabbitMQ
    consumer, cron, endpoint, notification-writer hook, provider adapter,
    SMTP sending, push sending, device-token API/storage, deployment/env
    behavior, or secret behavior was added.
- Explicitly not complete:
  - No SMTP sending/runtime/provider adapter under #632.
  - No push sending/runtime/provider adapter or device-token API/storage under
    #634.
  - No provider secrets, environment, deployment, APNs, FCM, or SMTP
    credentials.
  - No real provider-result success states without a separately approved real
    provider adapter.
  - No admin/global notification policy API/readout under #635.
  - No OpenAPI or generated-client changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
  - No direct source-business-table mutation by workers.
  - No storage/file-byte behavior.
  - No money, bill, split, settlement, payment, recurring, sync, OCR worker,
    import, export, or restore authority.
- Close/keep-open recommendation:
  - Keep #641 closed as complete for the provider-neutral worker/outbox
    foundation only.
  - Do not treat #641 or PR #642 as completion of #633 or #403.
- Last verified repo/report references:
  - PR #642:
    `https://github.com/tommytang213/Settleora/pull/642`
  - Issue #641 completion comment:
    `https://github.com/tommytang213/Settleora/issues/641#issuecomment-4851348342`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1450-notification-delivery-worker-outbox-foundation-641.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`

### Issue #632 - SMTP email notification runtime

- GitHub state/project status: issue `CLOSED`; PR #645 merged; Project
  status `Merged`, `Progress %` `100`, `Man-days Remaining` `0`, and
  `Actual Done Date` `2026-07-01` by GitHub/Project readback after PR #645.
- Last verified at main SHA:
  `39d1d669cc55988da31d4c5b76800c3f29aa4e83`.
- Completed PRs/slices:
  - PR #645, reviewed source head
    `28791c2159646a17733ea7ac08f9c744c7fd7687`, merge SHA
    `39d1d669cc55988da31d4c5b76800c3f29aa4e83`: implemented the
    approved Option A disabled-by-default SMTP email notification runtime
    foundation.
- Completed scope:
  - Approved Option A disabled-by-default SMTP email notification runtime
    foundation.
  - Internal SMTP provider adapter boundary behind server configuration.
  - Safe `disabled` and `unconfigured` outcomes.
  - Integration with #629 decision-envelope output and #638/#641
    delivery-attempt/outbox foundations.
  - Delivery-attempt state updates only through approved notification
    delivery-attempt/outbox boundaries.
  - No fake `sent` or `delivered` success.
  - In-app fallback unchanged.
  - Minimal generic email templates.
  - Bounded provider-result categories without raw SMTP response persistence.
  - Focused tests for disabled/unconfigured behavior, no fake sent success,
    redaction, provider classification, no secret leakage, no real network
    dependency, and no source business mutation.
- Configuration/secrets review:
  - SMTP remains disabled by default through
    `Notifications:SmtpEmail:Enabled = false`.
  - Enablement is through server/operator configuration only.
  - No committed SMTP secrets, credentials, tokens, `.env`, local secret
    files, deployment/env exposure files, or secret-like sample values.
  - No options endpoint, admin route, public route, OpenAPI schema,
    generated client, or UI exposes SMTP values.
  - Provider exceptions are classified into bounded redacted categories.
  - No secrets are exposed in logs, API responses, issue comments, docs, test
    snapshots, exceptions, or client-visible payloads.
- Email template/privacy review:
  - Minimal generic subject/body.
  - Bodies say a notification is available in Settleora and require
    sign-in/authorization.
  - Bodies include only event type and one safe stable reference when present.
  - Bodies exclude raw OCR/receipt text, private/hidden bill details, payment
    data, proof contents, signed URLs, object keys, storage paths, tokens,
    credentials, provider payloads, private notes, and unrelated user data.
- Explicitly not complete:
  - Recipient email-address source/policy for actual recipient addressing.
  - Hosted runtime activation.
  - Production deployment/env/secrets setup.
  - Admin/global notification policy/readout under #635.
  - Push/device-token/provider runtime under #634.
  - OpenAPI/generated-client/readout.
  - Admin, web, mobile UI and #371 deep links.
  - Auth/session/security notification behavior.
  - Email digests, bulk campaigns, or marketing emails.
  - Money, bill, split, settlement, payment, recurring, sync, OCR, import,
    export, or restore authority.
- Remaining related work:
  - #403 remains open because #632 completed only the disabled-by-default SMTP
    runtime foundation; push/device-token runtime (#634), admin/global
    policy/readout (#635), future route-family extensions after closed #371,
    hosted runtime
    activation, recipient-email source/policy, OpenAPI/readout, and remaining
    notification work remain gated.
  - #369 remains open because #632 closure is provider runtime foundation
    only, not full Day 1 notification event-family acceptance.
  - #634/#635/#368 remain open; #371 is closed after PR #664.
  - #629/#633/#638/#641/#632 remain closed/Merged as completed
    foundations/slices.
- Close/keep-open recommendation:
  - Keep #632 closed as complete for the disabled-by-default SMTP runtime
    foundation only.
  - Do not treat #632 or PR #645 as completion of #403.
- Last verified repo/report references:
  - PR #645:
    `https://github.com/tommytang213/Settleora/pull/645`
  - Issue #632 completion comment:
    `https://github.com/tommytang213/Settleora/issues/632#issuecomment-4852592872`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1632-smtp-email-runtime-foundation-632.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1655-smtp-email-runtime-foundation-632-pr-merge.md`

### Issue #633 - Notification delivery-state persistence and worker foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0`, and `Actual Done Date`
  `2026-07-01` by GitHub/Project readback on 2026-07-01 after PR #644.
  PR #636, PR #639, PR #642, PR #643, and PR #644 are merged, and #633's
  own close rule is satisfied for the reviewed and validated delivery-state
  persistence/worker foundation scope. This closure does not complete
  provider runtime, hosted worker activation, admin policy, OpenAPI/readout,
  UI/deep-link work, remaining event-family runtime, or provider/deployment
  gates.
- Last verified at main SHA:
  `79d6f71cade6f6edfa3bdb95b8b7b1aebd1b370d` after PR #644.
- Completed PRs/slices:
  - PR #636, reviewed source head
    `bed8689325fc76dcf071970256df1da4f7ebe615`, merge SHA
    `94f71c96446780966bec7cefc415c0ee6bbdd54e`: completed the docs/control
    architecture review for notification delivery-state persistence and worker
    foundation.
  - PR #639 / issue #638, reviewed source head
    `41e3c565d003dd7199a42442ec52e0a1bf16df9a`, merge SHA
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`: completed the first
    approved provider-neutral delivery-attempt persistence/service foundation
    slice only.
  - PR #642 / issue #641, reviewed source head
    `e65ad69f7ecfc28f4d56d844e2d1a2c8ca927d69`, merge SHA
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`: completed the approved
    provider-neutral worker/outbox processing foundation slice.
  - PR #643, reviewed source head
    `f18bbc5e6c1dd7dfc68ffb361e118b8164c9ca88`, merge SHA
    `b669afc095f2fceec110813b58904fd1a367a415`: recorded the #641/#633
    ledger checkpoint before #633 closure.
  - PR #644, reviewed source head
    `23991b533a4e459c53b58769f69736e8b0a173cc`, merge SHA
    `79d6f71cade6f6edfa3bdb95b8b7b1aebd1b370d`: closed #633 for the
    delivery-state persistence/worker foundation only and recorded the closure
    checkpoint.
- Completed scope:
  - Added
    `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`.
  - Updated README and architecture index references.
  - Separated in-app unread/read/archive state, #629 decision-envelope
    eligibility, external delivery attempts, SMTP runtime, push runtime,
    admin/global policy, and device-token lifecycle.
  - Recorded API/domain authority boundaries for recipient eligibility, channel
    eligibility, idempotency, redaction, audit-safe metadata, and delivery
    attempt acceptance.
  - Constrained future workers to API/domain-created outbox/queue records or a
    separately approved service boundary.
  - Defined provider-neutral state vocabulary, redaction rules, future
    persistence-model guidance, and implementation split recommendations.
  - Added provider-neutral `NotificationDeliveryAttempt` persistence and
    internal recorder service foundation that consumes #629 decision envelopes
    plus source-domain eligibility for eligible `email` and `mobile_push`
    decisions.
  - Added only bounded pre-provider queued-attempt persistence behavior with
    no fake success and no in-app/source mutation.
  - Added provider-neutral lease/claim and outbox processor service
    boundaries over `notification_delivery_attempts`, with retry/backoff,
    idempotent safe no-op handling, bounded pre-provider transitions, and no
    hosted runtime activation.
  - Added safe metadata only: no raw provider payload, SMTP credential, push
    credential, raw device token, storage path, object key, signed URL, local
    path, raw OCR/receipt text, payment detail, private note, hidden bill
    detail, or unrelated sensitive field.
  - Validated that the persistence and worker/outbox foundations do not create
    fake provider success, do not mutate source business state, do not mutate
    in-app read/archive state, have no provider dependency, do not change
    OpenAPI/generated clients, and use additive migrations only.
- Explicitly not complete:
  - No hosted provider runtime activation, push runtime/device-token storage
    under #634, or admin/global policy API/readout under #635.
  - SMTP runtime under #632 is now separately closed only for the
    disabled-by-default internal SMTP foundation; #633 itself did not complete
    SMTP recipient addressing, hosted activation, deployment/env/secrets, or
    external delivery-state API/readout.
  - No hosted background service, scheduler, queue consumer, RabbitMQ
    consumer, cron, endpoint, notification-writer hook, provider adapter, SMTP
    sending, push sending, device-token API/storage, deployment/env behavior,
    or secret behavior.
  - No OpenAPI contract or generated-client changes.
  - No mobile, web, admin UI, deep-link, or #371 work.
  - No provider secrets, environment, deployment, auth/session/security
    runtime, or bypass policy changes.
  - No external delivery-state API/readout, OpenAPI contract, generated-client
    exposure, hosted runtime activation, UI/deep links, or source-state event
    families.
- Remaining related work:
  - The #632 disabled-by-default SMTP runtime foundation is complete, but
    actual recipient email-address source/policy, hosted runtime activation,
    deployment/env/secrets setup, admin/readout, OpenAPI/readout, and UI
    remain separate gated work and must not be inferred from #633 or #641.
  - Future push provider runtime, device-token lifecycle, provider adapters,
    provider-result success/failure classification, and hosted runtime
    activation remain separate gated work and must not be inferred from #641.
  - Any external delivery-state API/readout requires separate
    OpenAPI/generated-client gates.
  - #403 remains open because #632 completed only the disabled-by-default SMTP
    runtime foundation, while server-side preference/runtime resolution beyond
    foundations, admin policy/readout, deep links, push/device-token, hosted
    runtime activation, recipient-email source/policy, OpenAPI/readout, and
    remaining notification work remain gated.
  - #369 remains open because #633 closure is provider-neutral
    delivery-state foundation only, not full Day 1 notification event-family
    acceptance.
  - #368 remains open as the notification epic.
  - #371 is closed after PR #664; future route-family extensions require
    separate scope but should not redo #371.
  - #634/#635 remain separate gated issues for push/device-token runtime and
    admin/global policy API/readout.
  - #632/#638/#641/#629 remain closed/Merged as completed foundations/slices.
- Close/keep-open recommendation:
  - Keep #633 closed as complete for delivery-state persistence/worker
    foundation only.
  - Do not treat #633 closure as provider/runtime/admin/UI completion.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - PR #636:
    `https://github.com/tommytang213/Settleora/pull/636`
  - PR #639:
    `https://github.com/tommytang213/Settleora/pull/639`
  - PR #642:
    `https://github.com/tommytang213/Settleora/pull/642`
  - PR #643:
    `https://github.com/tommytang213/Settleora/pull/643`
  - PR #644:
    `https://github.com/tommytang213/Settleora/pull/644`
  - Issue #633 merge checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/633#issuecomment-4846071136`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-0034-notification-delivery-state-worker-architecture-633.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-0107-notification-delivery-state-worker-architecture-633-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1512-issue-progress-ledger-641-633-checkpoint.md`

### Issue #634 - Mobile push device-token API and provider-neutral delivery runtime

- GitHub state/project status: issue `OPEN`; Project status `Blocked` by
  GitHub/Project readback on 2026-07-01 after PR #650 and issue-comment
  readback on 2026-07-01 after PR #652. A1 design, A2 token-protection
  design, the A2 server-side token lifecycle API foundation, the A3 Option A
  provider-neutral push runtime foundation, and the #634 mobile push
  registration UX/readiness reference gate are complete. #634 remains open
  because real APNs/FCM providers, Flutter token registration implementation,
  APNs/FCM/provider setup, hosted activation, admin/readout, #371 deep links,
  and related notification work remain blocked/gated. Remaining MD must not be
  reduced to `0`.
- Last verified at main SHA:
  `98dc4ab0e6ae7363b0d3638c3d17500c3a26f610`.
- Completed PRs/slices:
  - PR #647, reviewed source head
    `837e51ccad71f79762ddd6b2b4035145d8497469`, merge SHA
    `7898d8f75008474a6bc1aff6d0a02552291f2bc4`: completed the #634 A1
    push token lifecycle architecture/contract design checkpoint only.
  - PR #649, reviewed source head
    `784782fa15f7c74b9247cb383fdcbb090a43f7e0`, merge SHA
    `200d608da2b2b6ebb8d0d80cfd67ad58e9715414`: completed the A2 Option C
    token-protection design checkpoint before A2 implementation.
  - PR #650, reviewed source head
    `c86b95f3e16b40495e23f9c2a8aca008789a4470`, merge SHA
    `1983832614394ed0dd8c8c6d4aab63e512e42b4b`: completed the #634 A2
    Option A server-side push token lifecycle API foundation only.
  - Branch `feature/push-a3-provider-runtime-634-option-a-20260701`:
    implements the approved #634 A3 Option A provider-neutral push delivery
    runtime foundation over the existing #629/#638/#641 notification
    foundations. This branch is not a real APNs/FCM provider implementation and
    does not close #634.
  - Branch `docs/mobile-push-registration-ux-design-gate-634-20260702`:
    records the no-code mobile push registration UX/readiness reference gate in
    `docs/design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md`. This gate
    defines permission timing, settings/readout states, token
    registration/revocation UX, privacy-safe copy, provider/dependency posture,
    mobile identity/signing readiness, and Figma/reference handoff. It does not
    implement Flutter UI, generate Figma, change OpenAPI/generated clients, add
    provider credentials, or close #634.
- Completed A1/A2/A3 Option A scope:
  - Future current-user push token register/replace, revoke current token,
    revoke current-session tokens, revoke all current-user tokens, optional
    safe readout, token rotation, and stale-cleanup endpoint shapes.
  - Idempotent duplicate registration behavior, token-conflict posture,
    authenticated session/profile binding, rate-limiting posture, and safe
    error vocabulary.
  - Later token persistence fields for user/profile/session/device
    association, platform/provider, token fingerprint, protected token
    secret/ciphertext, lifecycle timestamps, revocation/stale/failure
    metadata, provider feedback category, unique constraints, idempotency keys,
    retention, and cleanup.
  - Token protection policy with no plaintext normal read paths, no raw token
    exposure, a purpose-bound keyed fingerprint, and a protected server
    boundary for raw provider send.
  - Privacy-safe push payload exclusions and the rule that notification opens
    must re-fetch linked resources through authorized API paths.
  - Provider-neutral-first runtime posture with no real provider enabled by
    default.
  - Mobile/Figma posture, including a required Figma/reference gate for mobile
    OS permission/settings UI and separate mobile validation/release gates for
    actual app integration.
  - #371 notification deep links kept separate from push provider work; #371 is
    now closed after PR #664.
  - Recommended A2/A3/A4 future implementation split: A2 server-side token
    persistence/API foundation, A3 provider-neutral push delivery runtime, and
    A4 mobile app registration/permission UX.
  - A2 token-protection design classifies push tokens as provider-usable
    sensitive secrets; defines protected storage/sealing/key-management
    posture; defines purpose-bound keyed fingerprinting for dedupe/correlation
    only; defines API/read-path, log, audit, telemetry, issue, docs,
    generated-client, and test redaction expectations; defines backup/restore
    and local-mode re-registration posture; and keeps provider/runtime work
    separate.
  - A2 implementation adds additive `push_device_tokens` persistence; protected
    raw token storage through push-specific `IPushTokenProtector` /
    `PushTokenProtector`; HMAC token fingerprint and device-installation hash
    support through a push-specific service boundary; fail-closed registration
    and token-based revocation when fingerprint key/config is unavailable;
    authenticated current-user APIs
    `PUT /api/v1/me/push-devices/current-token`,
    `DELETE /api/v1/me/push-devices/current-token`, and
    `DELETE /api/v1/me/push-devices/current-session`; OpenAPI contract
    updates; regenerated web/Dart generated clients; and safe lifecycle
    metadata responses only.
  - A3 Option A adds internal provider-neutral push send boundaries,
    disabled/unconfigured default provider registration, a privacy-safe
    provider-neutral payload builder, bounded provider feedback categories,
    existing `mobile_push` delivery-attempt/outbox integration, no-active-token
    handling, and protected token unprotect only inside the push send boundary.
  - A3 Option A maps disabled, unconfigured, and no-active-token outcomes to
    existing safe non-success delivery-attempt states and never records fake
    `sent` or `delivered` success.
  - Mobile push registration UX/readiness reference gate records that push
    permission must not be requested on first launch, must require
    authenticated server-mode context plus clear user intent, must expose
    local-only/unsupported/disabled/unconfigured/readiness states before OS
    prompting, must use only the existing authenticated current-user
    push-device APIs for future token registration/revocation, and must keep
    push copy generic with authorized re-fetch on open.
  - The reference gate records that Firebase is not an approved required
    product dependency unless Tommy explicitly approves it later, and keeps
    direct APNs + direct FCM and FCM-with-APNs-linkage as future options only.
  - The reference gate records non-secret mobile identity/signing readiness
    checks for iOS bundle ID, Android package name, environment split, Apple
    Developer/App Store Connect readiness, push capability/provisioning,
    Codemagic/TestFlight/Android signing path, Firebase ownership if later
    approved, and real-device/manual validation expectations.
  - A2 validation covered protection, auth/session binding, dedupe/idempotency,
    revocation, schema/migration, OpenAPI/client validation, no provider
    dependency, and token redaction.
- Migration/schema review:
  - Additive-only migration
    `20260701115832_AddPushDeviceTokensFoundation` creates only
    `push_device_tokens` plus constraints, indexes, and restrictive foreign
    keys to `auth_accounts`, `auth_sessions`, and `user_profiles`.
  - No destructive operation against existing tables or columns.
  - No plaintext token column and no committed secret/key/provider
    credential/default secret material.
  - Token material is stored as `protected_token_blob`.
  - Dedupe/correlation uses internal HMAC fingerprint fields.
- OpenAPI/generated-client review:
  - OpenAPI updated at `packages/contracts/openapi/settleora.v1.yaml`.
  - Generated web and Dart clients were refreshed and validated.
  - Token request input is write-only where possible.
  - Response schemas and generated response models exclude raw token, protected
    blob/ciphertext, fingerprint, and device-installation hash, exposing safe
    lifecycle metadata only.
- Token protection/redaction review:
  - Data Protection purpose is push-specific.
  - HMAC key must be configured and at least 32 bytes.
  - Registration and token-based revocation fail closed with safe `503` when
    fingerprint key/config is missing.
  - No raw token, protected blob, fingerprint, provider payload, provider
    credential, or realistic provider token is exposed in responses, generated
    clients, docs, tests, issues, or reports.
- Auth/session/current-user binding review:
  - Endpoints require the existing authenticated-user policy.
  - Server-derived actor/account/profile/session IDs are the only authority.
  - Request bodies cannot target another account, profile, user, role, or
    session.
  - Current-token revocation is scoped to the authenticated actor and current
    session.
  - Current-session revocation affects push token bindings only, not auth
    sessions.
- Explicitly not complete:
  - No real APNs/FCM provider sending.
  - No APNs/FCM secrets, credentials, signing/release config, provider account
    setup, or deployment/env setup.
  - No mobile app code.
  - No mobile OS permission/settings UI implementation or Figma output.
  - No #371 deep links/navigation.
  - No hosted runtime activation, scheduler, queue consumer, or push sender
    worker beyond the existing internal outbox processor service boundary.
  - No admin/global policy/readout under #635.
  - No public/admin UI.
  - No public/admin push payload readout, provider payload persistence, or
    raw provider request/response storage.
  - No source-business mutation.
  - No auth/session/security bypass behavior.
  - No storage/file-byte behavior outside the approved token-protection
    boundary.
  - No money, bill, split, settlement, payment, recurring, sync, OCR, import,
    export, or restore authority changes.
- Auto-close hygiene:
  - PR #647 originally auto-closed #634 due to a GitHub keyword phrase in the
    PR body.
  - Codex reopened #634 immediately and edited the PR body to remove the
    accidental auto-close phrase.
  - Final readback after hygiene: #634 is `OPEN` and Project status `Blocked`;
    the accidental close must not be read as completion of #634.
- Remaining related work:
  - #403 remains open because #634 A2/A3 Option A completed only the
    server-side token lifecycle foundation and disabled/unconfigured
    provider-neutral push runtime foundation, while real APNs/FCM providers,
    A4 mobile/Figma, APNs/FCM secrets/provider account setup, hosted
    activation, admin/readout, future route-family extensions after closed
    #371, recipient/policy/runtime
    wiring, and remaining notification work remain gated.
  - #369 remains open because #634 A2/A3 Option A are push token/runtime
    foundations only, not full Day 1 notification event-family acceptance.
  - #635 and #368 remain open; #371 is closed after PR #664.
  - #629, #632, #633, #638, and #641 remain closed/Merged as completed
    foundations/slices.
- Close/keep-open recommendation:
  - Keep #634 open/Blocked. A2 plus A3 Option A complete only the server-side
    token lifecycle foundation and disabled/unconfigured provider-neutral push
    runtime foundation, and the mobile push registration UX/readiness reference
    is only a no-code gate. Do not treat #634 as complete, and do not treat
    #403 as complete.
- Last verified repo/report references:
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/PUSH_TOKEN_PROTECTION_DESIGN.md`
  - PR #647:
    `https://github.com/tommytang213/Settleora/pull/647`
  - PR #649:
    `https://github.com/tommytang213/Settleora/pull/649`
  - PR #650:
    `https://github.com/tommytang213/Settleora/pull/650`
  - #634 A1 completion comment:
    `https://github.com/tommytang213/Settleora/issues/634#issuecomment-4853371580`
  - #634 A2 merge checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/634#issuecomment-4855524740`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1755-push-device-token-runtime-decision-packet-634.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1802-push-token-lifecycle-architecture-contract-634-a1.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1920-push-token-protection-design-634-a2-option-c.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1951-push-token-a2-api-foundation-634-option-a.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-2032-push-token-a2-api-foundation-634-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-2219-push-a3-provider-runtime-634-option-a.md`
    and
    `.codex/reports/settleora-codex-report-20260702-0005-mobile-push-registration-ux-design-gate-634.md`

### Issue #369 - Complete Day 1 in-app notification event coverage

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `60`, `Initial MD` `2`,
  `Man-days Remaining` `2`, `Figma Required` `Yes`, `Manual Gate` `Yes` by
  GraphQL readback on 2026-06-30. GitHub issue remains `OPEN` and Project
  status remains `Needs Architecture Review` by readback on 2026-07-01 after
  PR #650 and by issue readback on 2026-07-02 before the
  `sync.operation_failed` implementation branch report. Issue readback before
  `docs/auth-session-security-notification-source-policy-369-20260702` showed
  #369 still `OPEN`; related #371 is now `CLOSED` after PR #664.
- Parent epic readback: #368 is `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `33`, `Figma Required` `Yes`,
  `Manual Gate` `Yes`. GitHub issue #368 remains `OPEN` by readback on
  2026-07-01.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`.
- Current remaining-gates checkpoint on 2026-07-03 HKT:
  - Verified `origin/main` is
    `503d29530a4d317f937edab383a248e47050f776`, the PR #681 merge commit, and
    it includes the expected #681 visual-polish merge after PR #680 closed #672.
  - Live issue readback: #368 `OPEN`, #369 `OPEN`, #403 `OPEN`, #634 `OPEN`,
    and #635 `OPEN`; #371 `CLOSED` after PR #664 and must not be redone without
    a concrete regression; #570 `CLOSED` after PR #626 and #575 `CLOSED` after
    PR #576, which is consistent with current docs/runtime because only
    `ocr.needs_review` assignment/runtime is complete while `ocr.completed` and
    `ocr.failed` remain blocked; #672 `CLOSED` after PR #680; #679 `CLOSED`
    after PR #681.
  - Completed notification event-family/runtime/control slices verified by
    merged PRs include: recurring due-soon PR #560
    `12bbdbdf1f00912589dea5d38d9d2ac5949af440`; notification preferences
    PR #561 `0ed5547a230cbad1f4dbb366d9c873dca38099df`; coverage review
    PR #562 `40bf0d7aaa294221a272143376afcd963228ccae`; settlement coverage
    PR #563 `99b2c6b2112a44ffada671da1294aca2481213a8`; bill workflow
    PR #564 `52667ccdf8447157b265a61ed4ec6993b3a8faa7`; bill revision PR #565
    `ea2560cb2648f8890a6c185f7296e389b473a2c6`; recurring draft-generated
    PR #566 `25a519530821fd611f3b6bd2ddbbfa8d96cf9c54`; target-reference
    docs/control PR #567 `7cb283612cd8e5d5a95e7e8ecfeebba1fc572358` and
    OCR/sync target-reference runtime PR #569
    `64351208be72558329547cdd1fc415005c9be075`; sync conflict PR #572
    `04e8a18bbf2ef280845cf6978638bec949e597c0`; OCR source-state/policy
    PRs #573 `ce808da646146a5177444caff4702f1c645da994`, #574
    `d755e00efb0db386ace386ed136af66aa79c3b30`, #576
    `21c55062a8b7c49a7058e2fbc879b3c5c79bc822`, and #626
    `ecbabe1bfe432deb8b10617ac59395f338c05b0b`; decision/delivery/provider
    foundations PR #630 `34caca01a6a746f08b1892134a9510b9265cb645`, #636
    `94f71c96446780966bec7cefc415c0ee6bbdd54e`, #639
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`, #642
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`, #645
    `39d1d669cc55988da31d4c5b76800c3f29aa4e83`, #647
    `7898d8f75008474a6bc1aff6d0a02552291f2bc4`, #649
    `200d608da2b2b6ebb8d0d80cfd67ad58e9715414`, #650
    `1983832614394ed0dd8c8c6d4aab63e512e42b4b`, #652
    `98dc4ab0e6ae7363b0d3638c3d17500c3a26f610`, and #653
    `1c94fda04dfcea282bc15f6d06a83ce5cb7faaef`; sync operation failed
    PR #654 `d58c03753f16741fac0a572de16f1447711c6f64`; settlement residual
    review PR #656 `1766fe9962fe0b4f6d543e0d3aa4c87490e608cf`; remaining sync
    source-policy PR #657 `d814d2a221b2335366bebbdb372f8e1c1c85fc71`; #371
    route/open implementation and close PRs #658
    `40afe9babff51aade50b3312ef77a85f7db65a74`, #663
    `8b27a132aca6e6c52f602a940ef0d245ec46e9e5`, and #664
    `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`; auth/session/security
    source-policy PR #665 `e98f6b880b4e87980ec747532783492fc3869d0f`.
  - Remaining gates by category:
    in-app event constants/writers/tests have no currently safe small runtime
    slice unless a future source-state/manual gate first approves exact source
    transitions and safe targets; source-state/design gaps remain for
    `ocr.completed`/`ocr.failed`, remaining sync queued/retry/resolved flows,
    auth/session/security events, item claim/split/creator-review, and broader
    settlement mismatch/review or debtor residual-decision notifications;
    OpenAPI/generated-client/schema changes are allowed only as part of a
    later exact runtime slice with reviewed source states; #371 mobile
    notification-open/deep-link work is closed; #634 push/provider/device-token
    work remains open/Blocked for real APNs/FCM providers, provider secrets,
    hosted activation, mobile registration/permission UX, feedback cleanup, and
    release/deployment gates; #635 admin/global policy/readout remains open;
    auth/session/security notification runtime remains blocked by manual
    auth-security and target-reference gates; final Day 1 notification
    acceptance/release readiness, manual UI retest, and manual code review are
    not complete.
  - Recommended next action: do not start a runtime notification slice from
    #369 solely because the issue is open. The next safe path is a docs/design/
    decision gate for the highest-priority remaining blocked family, preferably
    auth/session/security target-reference plus manual auth-security approval,
    or a #635 admin/global policy/readout decision if operator policy should
    gate provider work first.
  - Close/keep-open recommendation: keep #369, #368, #403, #634, and #635
    open; keep #371, #570, #575, #672, and #679 closed unless a concrete
    regression or newly approved follow-up scope is filed separately.
- #635 admin/global policy readout checkpoint on
  `docs/notification-635-admin-global-policy-readout-20260703`:
  - Verified `origin/main` is
    `7d371c33a8317e64d1df289f8318b2712fb6926d`, the PR #682 merge commit,
    before starting the #635 readout branch.
  - Live issue readback during the branch showed #368 `OPEN`, #369 `OPEN`,
    #403 `OPEN`, #634 `OPEN`, and #635 `OPEN`; #371 `CLOSED`, #570 `CLOSED`,
    #575 `CLOSED`, #672 `CLOSED`, and #679 `CLOSED`.
  - Added `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md` as a
    docs/control policy readout for global channel caps, provider readiness
    states, security/money force-in-app and external-channel policy, quiet
    hours/digest/group mute boundaries, policy precedence, authorization and
    audit requirements, product-facing readout behavior, and implementation
    split planning.
  - This is not runtime implementation and does not add notification event
    constants, writers, schema, OpenAPI/generated clients, provider sending,
    admin UI, mobile UI, secrets, deployment, auth/session/security runtime,
    money/settlement/storage/OCR/sync behavior, or #371 deep-link behavior.
  - #635 remains open. Future #635 implementation remains blocked until manual
    admin/security, schema/migration, OpenAPI/generated-client, provider,
    audit, and UI/Figma gates are cleared in focused child tasks.
- Completed child slices now recorded:
  - #634 / PR #647 completed the A1 push token lifecycle
    architecture/contract design checkpoint. PR #649 completed the A2
    token-protection design checkpoint. PR #650 completed the A2 server-side
    push token lifecycle API foundation with protected token storage,
    authenticated current-user token register/revoke APIs, additive
    `push_device_tokens` persistence, OpenAPI updates, regenerated web/Dart
    clients, safe lifecycle metadata responses only, fail-closed fingerprint
    configuration behavior, and no provider dependency. It did not implement
    mobile code, APNs/FCM provider runtime or sending, provider secrets,
    hosted activation, admin/readout, #371 deep links, or full Day 1
    notification acceptance.
  - #634 A3 Option A branch
    `feature/push-a3-provider-runtime-634-option-a-20260701` adds only the
    internal disabled/unconfigured provider-neutral push runtime foundation:
    safe payload builder, `mobile_push` outbox integration, no-active-token
    handling, bounded provider categories, and no fake `sent`/`delivered`
    success. It does not add real APNs/FCM sending, mobile UI, hosted
    activation, admin/readout, #371 deep links, or Day 1 notification
    acceptance.
  - #632 / PR #645 completed only the disabled-by-default SMTP runtime
    foundation. It did not add recipient email-address source/policy, hosted
    runtime activation, deployment/env/secrets setup, admin/global
    policy/readout, push/device-token runtime, OpenAPI/readout, UI, or deep
    links, and it does not complete full Day 1 notification event-family
    acceptance.
  - #633 is closed for its own provider-neutral delivery-state
    persistence/worker foundation after PR #636 architecture/design, PR
    #639/#638 persistence/service foundation, PR #642/#641 worker/outbox
    foundation, PR #643 ledger checkpoint, and PR #644 closure. This does not
    complete full Day 1 notification event-family acceptance.
  - PR #642 / #641 completed only the provider-neutral worker/outbox
    foundation over `notification_delivery_attempts`. It did not add SMTP
    runtime, push runtime, provider adapters, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, hosted runtime activation, or
    deep links.
  - PR #639 / #638 completed only the provider-neutral delivery-attempt
    persistence/service foundation for eligible `email` and `mobile_push`
    decisions. It did not add worker/outbox processing, SMTP runtime, push
    runtime, provider adapters, device-token APIs/storage, admin/global policy,
    OpenAPI/readout, UI, or deep links.
  - PR #636 / #633 completed the delivery-state worker foundation architecture
    review only. It did not add event-family runtime, provider delivery,
    source states, OpenAPI event values, schema, UI, or deep links.
  - PR #630 / #629 completed the internal notification decision-envelope
    foundation only. It did not add new Day 1 event-family runtime, provider
    delivery, source states, OpenAPI event values, schema, UI, or deep links.
  - PR #626 / #570 completed the narrow OCR `ocr.needs_review` runtime for
    explicit API-owned assignment creation/retarget transitions only.
  - Earlier merged #369/#367/#370 slices already cover recurring due-soon,
    notification preferences infrastructure, notification event coverage
    review, settlement notification coverage, bill workflow coverage, bill
    revision coverage, recurring draft-generated coverage, #568 OCR/sync target
    references, and #571 persisted sync-conflict-only runtime.
  - Branch `feature/sync-operation-failed-notification-369-20260702`
    implements the next narrow #369 sync slice for
    `sync.operation_failed`: newly persisted current-actor
    `SyncOperationStatuses.Rejected` rows write one unread in-app notification
    with first-class `syncOperationId`, safe sync operation action URL, current
    actor recipient, and bounded safe resource metadata. Accepted operations,
    replay/idempotency reuse, existing conflict rows, and invalid requests that
    do not persist a rejected row do not write this notification. This branch
    updates OpenAPI/generated clients only for the notification event enum and
    adds an additive EF migration that widens notification event-type check
    constraints; it does not implement queued/resolved/retry/conflict
    resolution, mobile/deep links, provider send, admin policy, or broader sync
    behavior.
  - Branch
    `feature/settlement-residual-review-needed-notification-369-20260702`
    implements the narrow settlement residual-review notification slice:
    successful debtor-created payment claims that persist pending
    receiver-confirmation residuals write one unread
    `settlement.residual_review_needed` in-app/provider-neutral notification
    to the receiver/creditor, with existing settlement payment/request target
    references, safe action URL, privacy-safe metadata, replay/no-op duplicate
    prevention, and no residual amount/reason/payment/proof/storage details.
    This branch updates OpenAPI/generated clients only for the notification
    event enum and adds an EF migration that widens notification event-type
    check constraints; it does not change settlement business schema, money,
    residual policy, allocation, confirmation, balance projection, proof,
    provider send, mobile/deep links, or admin policy behavior.
  - Branch
    `docs/auth-session-security-notification-source-policy-369-20260702`
    adds the auth/session/security notification source-policy gate. It records
    that current auth/session/security runtime has real API-owned session,
    credential, refresh/session-family, MFA/passkey, recovery-code, security
    policy, and auth audit foundations, but security notification runtime is
    not implementation-ready because event semantics, event constants,
    first-class targets, recipient/self-notification policy, redaction,
    authorized re-fetch paths, and manual auth-security approval are missing.
- Remaining Day 1 work:
  - Future OCR `ocr.completed` and `ocr.failed` events require server OCR
    worker/job source states and safe recipient/action policy first.
  - Remaining sync notification events such as queued, conflict resolved, retry
    behavior, conflict resolution behavior, mobile deep links/UI, and broad
    offline-sync expansion remain future work.
  - Auth/session/security notification runtime remains blocked behind the
    manual auth-security source-policy and target-reference gates. Do not
    infer security notifications from profile display, current-user/session
    display, cached mobile session lists, local-only mode, generated-client
    availability, or generic auth audit rows without reviewed event semantics.
  - Item claim/split/creator-review notification coverage remains blocked on
    source claim runtime and #349/#350 money/Figma/manual gate posture unless
    separately approved in the repo.
  - Future settlement debtor notification after receiver residual decisions
    and broader settlement mismatch/review event coverage remain separate
    source-state/policy work.
  - Push/email provider delivery, provider workers, digests, delivery receipts,
    background delivery, admin/global policy, Day 1 notification acceptance,
    production readiness, release readiness, manual UI retest, and manual code
    review are not completed by #626, #630, #636, #639, #642, #643, #644,
    #645, #647, #649, or #650.
- Future gates requiring explicit approval:
  - #371 notification-open/deep-link scope is closed after PR #664 and should
    not be redone.
  - Auth/session/security source-policy, target-reference design, and manual
    auth-security approval before security-impactful notifications.
  - OpenAPI/generated-client/schema/runtime work only for exact implemented
    event types with reviewed source states and safe targets.
- Close/keep-open recommendation:
  - Do not close #369 or mark it `100`. PR #626/#570 is one completed child
    runtime slice, PR #630/#629 is one internal foundation slice, PR #636/#633
    is one architecture slice, PR #639/#638 is one provider-neutral
    persistence/service foundation slice, PR #642/#641 is one provider-neutral
    worker/outbox foundation slice, PR #644 closed #633 for delivery-state
    persistence/worker foundation, PR #645/#632 is one disabled-by-default SMTP
    runtime foundation slice, PR #647/#649/#650 are #634 push-token lifecycle
    design/protection/API-foundation checkpoints, and
    `feature/sync-operation-failed-notification-369-20260702` is one narrow
    `sync.operation_failed` implementation slice, and
    `feature/settlement-residual-review-needed-notification-369-20260702` is
    one narrow settlement residual-review implementation slice, and
    `docs/auth-session-security-notification-source-policy-369-20260702` is
    one auth/session/security docs/control gate. None of these is full Day 1
    notification event-family acceptance.
- Last verified repo/report references:
  - `docs/architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`
  - `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
  - Issue #369 PR #626 progress comment:
    `https://github.com/tommytang213/Settleora/issues/369#issuecomment-4844221960`
  - Branch report:
    `/workspace/logs/settleora-codex-report-20260702-0112-sync-operation-failed-notification-369.md`
- Post-#635/#689 remaining event coverage gate review on
  `docs/notification-369-remaining-event-coverage-gate-review-20260705`:
  - Verified starting `origin/main` is
    `09e785401c04c5edbcbeb7e26bf9b4b046275d0f`, the PR #706 merge commit for
    the #635 parent remaining-gates packet.
  - PR #707 `docs: review remaining notification event coverage gates` merged
    at merge SHA `8ec5a7c854c40072e7e8418bab865c774fd68c01` from reviewed
    head `c360d63c847948161fd424e29996f5a1da205dc0`.
  - PR #707 state after merge is `MERGED`; merged at
    `2026-07-05T07:39:01Z`.
  - Source branch
    `docs/notification-369-remaining-event-coverage-gate-review-20260705` was
    restored/retained at reviewed head
    `c360d63c847948161fd424e29996f5a1da205dc0` after GitHub auto-deleted it.
  - Live issue readback showed #369, #368, #403, #634, and #635 remain `OPEN`;
    #371, #570, and #575 remain `CLOSED`.
  - Adds
    `docs/planning/NOTIFICATION_369_REMAINING_EVENT_COVERAGE_GATE_REVIEW.md`
    as the current decision digest for completed evidence, remaining blocked
    event families, dependency posture, safest next slice, and close/keep-open
    recommendations after the #635/#689 readout-first chain completed.
  - Completed or sufficiently evidenced #369 slices remain bill workflow and
    revision events, settlement request/payment/proof/residual-review events,
    recurring due-soon/draft-generated events, OCR `ocr.needs_review`, sync
    conflict/operation-failed events, current-user in-app notification APIs,
    preference foundations, target-reference foundations, and closed #371
    notification-open/deep-link behavior.
  - Remaining gaps are OCR completed/failed, remaining sync queued/retry/
    resolved/conflict-resolution events, auth/session/security events, item
    claim/split/creator-review events, broader settlement mismatch/review or
    debtor residual-decision events, and provider/delivery/admin policy items
    that are still relevant only as separate #403/#634/#635 gates.
  - Recommended next narrow path: no runtime slice should start from #369
    alone. Run an auth/session/security notification target-reference and
    source-event manual decision gate first, or continue provider/operator
    readiness under #635/#403/#634 without claiming #369 closure.
  - Close/keep-open recommendation: keep #369 and #368 open; keep #403, #634,
    and #635 open; keep #371, #570, and #575 closed unless a concrete
    regression or separately approved follow-up exists.
  - Scope confirmation: docs-only; no runtime/API/OpenAPI/generated-client/
    schema/migration/provider/UI/auth/session/security/money/settlement/bill/
    OCR/storage/sync/reconciliation/deployment/CI/Docker/env/secret changes,
    issue closure/reopen, or Project mutation.
  - Merge-gate report:
    `.codex/reports/settleora-codex-report-20260705-1533-notification-369-gate-review-pr707-merge-gate.md`.

### Issue #403 - Day 1 email, push, provider, preference, delivery-state split

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Figma / Reference`, `Progress %` `80`, `Man-days Remaining` `1`,
  `Figma Required` `Yes`, `Manual Gate` `Yes` by GraphQL readback on
  2026-06-30 after PR #630. GitHub issue remains `OPEN` and Project status
  remains `Needs Figma / Reference` by readback on 2026-07-01 after PR #650.
- Last verified at main SHA:
  `1983832614394ed0dd8c8c6d4aab63e512e42b4b`.
- Completed docs/control child slices now recorded:
  - #448 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #493 merged on 2026-06-24. It
    completed the notification event taxonomy and in-app baseline coverage
    control slice only.
  - #449 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #494 merged on 2026-06-24. It
    completed SMTP email provider policy docs/control only.
  - #450 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #495 merged on 2026-06-24. It
    completed mobile push provider abstraction and device-token lifecycle
    policy docs/control only.
  - #451 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #496 merged on 2026-06-24. It
    completed admin/user notification preference resolution model
    docs/control only.
  - #452 is `CLOSED`; Project row was stale before this checkpoint and has now
    been updated to Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, `Actual Done Date` `2026-06-28`, and
    `Blocking Gate` `None`. The issue comment says it closed the
    UX/reference gate only through repo-tracked Day 1 UX/reference decisions
    and existing domain references.
- Completed adjacent design/runtime slices that must not be redone:
  - #634 / PR #647 completed the A1 push token lifecycle
    architecture/contract design checkpoint. PR #649 completed the A2
    token-protection design checkpoint. PR #650 completed only the A2
    server-side token lifecycle API foundation: additive `push_device_tokens`
    persistence, push-specific protected token storage and HMAC fingerprint
    boundaries, authenticated current-user token register/revoke endpoints,
    OpenAPI updates, regenerated web/Dart clients, safe lifecycle metadata
    responses only, fail-closed missing fingerprint config behavior, and no
    provider dependency. #634 remains open/Blocked; PR #650 did not implement
    mobile code, APNs/FCM provider runtime or sending, provider secrets, hosted
    activation, admin/readout, #371 deep links, or provider payload behavior.
    Branch `feature/push-a3-provider-runtime-634-option-a-20260701` adds the
    A3 Option A internal provider-neutral push runtime foundation:
    disabled/unconfigured default provider, safe payload builder,
    `mobile_push` outbox processing integration, no-active-token handling, and
    protected token unprotect only inside the push send boundary. It still does
    not implement real APNs/FCM sending, provider secrets, hosted activation,
    mobile UI, admin/readout, #371 deep links, or full #403 completion.
  - #632 / PR #645 completed only the approved Option A disabled-by-default
    SMTP runtime foundation: internal SMTP adapter boundary, safe
    disabled/unconfigured outcomes, #629/#638/#641 integration through
    approved delivery-attempt/outbox boundaries, generic privacy-safe
    templates, bounded redacted provider-result categories, no fake `sent` or
    `delivered` success, no real network dependency in tests, and no source
    business mutation. It did not add recipient email-address source/policy,
    hosted runtime activation, production deployment/env/secrets setup,
    admin/global policy/readout, push/device-token runtime, OpenAPI/readout,
    UI, deep links, auth/session/security notification behavior, email
    digests/bulk campaigns/marketing, or money/source-business authority.
  - #641 / PR #642 completed only the provider-neutral
    worker/outbox processing foundation over `notification_delivery_attempts`:
    internal lease service and outbox processor boundaries, lease metadata,
    retry/backoff handling, idempotent safe no-op behavior, bounded
    pre-provider state transitions, and focused tests. It did not add hosted
    runtime activation, SMTP runtime, push runtime, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, or deep links.
  - #638 / PR #639 completed only the provider-neutral
    `NotificationDeliveryAttempt` persistence/service foundation for eligible
    external-channel decisions. It did not add worker/outbox processing, SMTP
    runtime, push runtime, provider adapters, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, or deep links.
  - #633 is closed for its own provider-neutral delivery-state
    persistence/worker foundation after PR #636 architecture/design, PR
    #639/#638 persistence/service foundation, PR #642/#641 worker/outbox
    foundation, PR #643 ledger checkpoint, and PR #644 closure. It did not
    implement hosted provider runtime activation, push runtime/device-token
    storage, admin/global policy, external delivery-state API/readout,
    OpenAPI/generated-client exposure, UI/deep links, provider secrets,
    deployment, recipient-email source/policy, or remaining event-family
    source-state work.
  - #629 / PR #630 completed only the internal notification
    decision-envelope foundation: provider-free resolver, bounded
    `in_app`/`email`/`mobile_push` channel vocabulary, bounded decision/reason
    vocabulary, decision-only external-channel outcomes, in-app baseline
    eligibility behavior, and focused resolver tests.
  - #570 / PR #626 completed only the narrow `ocr.needs_review` in-app
    notification runtime for explicit API-owned OCR review assignment
    creation/retarget transitions.
  - #571 / PR #572 completed only the narrow persisted
    `sync.conflict_detected` runtime for newly persisted sync conflict rows.
  - Earlier #369 child slices completed current bill workflow/revision,
    settlement request/payment/proof, recurring due-soon, recurring
    draft-generated, current-user in-app notification APIs, and current-user
    notification preference persistence boundaries where documented in
    `DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`.
- Remaining Day 1 provider/preference/delivery-state work:
  - SMTP/email runtime foundation is complete only for disabled-by-default
    internal SMTP sending behind server/operator configuration. Actual
    recipient email-address source/policy, hosted runtime activation,
    production deployment/env/secrets setup, admin/readout, OpenAPI/readout,
    UI/configuration surfaces, digests/bulk emails, and security-sensitive
    notification behavior remain separate gated work.
  - Mobile push provider runtime is partially implemented only as #634 A3
    Option A disabled/unconfigured provider-neutral foundation. #634 A2 covers
    the server-side token lifecycle foundation. Remaining push follow-ups must
    still cover real APNs/FCM provider adapters, provider secrets/account
    setup, hosted activation, OS permission/mobile registration UX, stale-token
    cleanup from real provider feedback, multi-device provider behavior,
    admin/readout, and #371 deep links. This remains manual-gated for
    provider/secrets, mobile release configuration, deployment/env,
    auth/security-sensitive behavior, and UI/Figma.
  - Server-side notification preference resolution is not implemented beyond
    current persisted current-user preference readouts and the internal #629
    decision-envelope foundation. Future work must implement admin/global caps,
    group/thread mute, channel capability checks, provider/device readiness,
    required/security-event bypass policy, and runtime wiring before provider
    delivery.
  - Hosted worker runtime activation is not implemented. PR #642 added only
    provider-neutral internal lease/outbox service boundaries and processing
    rules, without a hosted background service, scheduler, queue consumer,
    RabbitMQ consumer, cron, endpoint, notification-writer hook, provider
    adapter, push sending, device-token API/storage, deployment, environment,
    or secret behavior. PR #645 added only the disabled-by-default SMTP
    adapter foundation and did not activate hosted delivery. Current in-app
    unread/read/archive state is separate and must not be treated as provider
    delivery truth.
  - #632 closure does not complete #403. It closes only the
    disabled-by-default SMTP runtime foundation sub-scope; push/device-token
    runtime (#634), admin/global policy/readout (#635), #371 deep links/mobile
    UI, hosted runtime activation, recipient-email source/policy,
    OpenAPI/readout, and remaining notification work stay open/gated.
  - #634 A2/A3 Option A do not complete #403. They complete only the
    server-side token lifecycle foundation and disabled/unconfigured
    provider-neutral push runtime foundation; real APNs/FCM providers, A4
    mobile/Figma, APNs/FCM secrets/provider account setup, hosted activation,
    admin/readout, future route-family extensions after closed #371, and
    remaining notification work stay open/gated.
  - Any external delivery-state API/readout requires a separate
    OpenAPI/generated-client gate.
  - Admin/global notification policy APIs and admin UI are not implemented.
  - Notification deep-link/mobile UI implementation for current supported
    families is complete and #371 is closed after PR #664. Future route-family
    extensions remain separately gated if new event families need mobile
    handling.
  - Real push provider adapters, admin/global policy, mobile registration/UI,
    deep-link, hosted activation, recipient-email source/policy, and provider
    runtime expansion work remains separate and gated.
- Future gates requiring explicit approval:
  - Provider/secrets/deployment/env/mobile release gates for SMTP expansion
    and push.
  - OpenAPI/generated-client and schema/migration gates for any contract,
    delivery-state, device-token, admin-policy, or preference-runtime storage
    changes.
  - Auth/session/security manual policy gate before security-impactful
    notification runtime or bypass behavior.
  - #371 mobile/deep-link implementation and any UI-sensitive work.
  - Source-state gates for OCR completed/failed, item claim/split,
    settlement mismatch/residual/review, and remaining sync event families.
- Close/keep-open recommendation:
  - Keep #403 open as a parent/split tracker. The original docs/control
    children #448-#452, the internal #629 foundation, the #633 delivery-state
    persistence/worker foundation, the #632 disabled-by-default SMTP
    foundation, the #634 A2 server-side push token lifecycle API foundation,
    and #634 A3 Option A disabled/unconfigured push runtime foundation are
    complete, but real push provider adapters, hosted runtime activation,
    mobile integration/UI, recipient-email source/policy, server-side
    preference resolution beyond the foundation, admin policy, and #371
    implementation remain separate work and should be split into focused
    implementation issues before runtime expansion starts.
- Current #635 readout checkpoint:
  - Branch `docs/notification-635-admin-global-policy-readout-20260703`
    adds `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md` and links it
    from the architecture index.
  - It defines only the admin/global notification policy design and readout
    gate. It does not complete #403, #635, #634, #369, or #368.
  - Future #403/#635 work still needs separate manual admin/security,
    schema/migration, OpenAPI/generated-client, provider/secrets/deployment,
    audit, and UI/Figma gates before runtime or admin exposure work.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`
  - `docs/planning/DAY1_UX_REFERENCE_DECISIONS.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2228-notification-day1-provider-remaining-gates-split-403-369.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2331-notification-decision-envelope-foundation-629-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-0107-notification-delivery-state-worker-architecture-633-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1755-push-device-token-runtime-decision-packet-634.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1802-push-token-lifecycle-architecture-contract-634-a1.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1920-push-token-protection-design-634-a2-option-c.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1951-push-token-a2-api-foundation-634-option-a.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-2032-push-token-a2-api-foundation-634-pr-merge.md`

### Issue #635 - Admin global notification policy API and readout

- GitHub state/project status: issue `OPEN` by live issue readback on
  2026-07-03 HKT during branch
  `docs/notification-635-child-issue-breakdown-20260703`. Project field
  mutation was not attempted.
- Last verified at main SHA:
  `573801c447d2b4bd2eccb84a7f5713235190d87d` after PR #683.
- Completed PRs/slices:
  - PR #683, merge SHA
    `573801c447d2b4bd2eccb84a7f5713235190d87d`: merged the
    admin/global notification policy docs/control readout.
- Completed docs/control scope:
  - Adds `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`.
  - Updates `docs/architecture/README.md`.
  - Updates this ledger.
  - Defines admin/global policy as the deployment/admin cap over in-app, email,
    and mobile push channels.
  - Preserves in-app as the Day 1 baseline where an event is supported,
    eligible, authorized, and safe.
  - Records that email and push are optional attempts only when admin/provider
    policy, provider readiness, content safety, and user preference allow them.
  - Records that user and group preferences cannot widen admin/global policy.
  - Defines provider readiness and delivery/readout states such as
    `unsupported`, `unconfigured`, `disabled`, `muted`, `deferred`, `queued`,
    `sent`, and `failed`, and keeps `delivered` unavailable without future
    provider receipt semantics.
  - Defines precedence: event eligibility and content safety; admin/provider
    cap; explicit security/required/money policy; user preference; group mute;
    quiet-hours/digest; device/platform/provider availability.
  - Defines admin/owner authorization and audit requirements for future
    policy reads/updates, including redaction boundaries for provider secrets,
    device tokens, auth/session details, raw OCR/receipt text, storage
    internals, payment details, private notes, and hidden bill details.
  - Defines product-facing admin/user/mobile/web readout behavior without
    exposing backend/provider internals or implying delivery success.
  - Recommends future child tasks for policy model/schema/API, OpenAPI and
    generated clients, admin/user readout references, provider readiness
    integration, audit tests, and final acceptance.
- Child issues created/reused on 2026-07-03 HKT:
  - #684 `Admin notification policy schema and API design`:
    `https://github.com/tommytang213/Settleora/issues/684`.
  - #685 `Admin and user notification policy readout UX reference`:
    `https://github.com/tommytang213/Settleora/issues/685`.
  - #686 `Notification provider readiness integration policy`:
    `https://github.com/tommytang213/Settleora/issues/686`.
  - #687 `Notification policy resolution runtime wiring`:
    `https://github.com/tommytang213/Settleora/issues/687`.
  - #688 `Notification policy audit and redaction coverage`:
    `https://github.com/tommytang213/Settleora/issues/688`.
  - #689 `Admin notification policy final acceptance`:
    `https://github.com/tommytang213/Settleora/issues/689`.
- Remaining Day 1 work:
  - Policy schema/API implementation.
  - OpenAPI/generated-client contracts.
  - Admin/user/mobile/web readout UI references and implementation.
  - Provider readiness integration and real provider activation gates.
  - Audit/redaction tests and authorization tests.
  - Final #635 acceptance after runtime work.
- Future gates requiring explicit approval:
  - Manual admin/security approval for reads/mutations and
    security/money-critical bypass behavior.
  - Schema/migration gate.
  - OpenAPI/generated-client gate.
  - Provider/secrets/deployment gate for SMTP/APNs/FCM or hosted activation.
  - UI/Figma gate for admin/user/mobile/web readouts.
  - Audit/security gate for policy-change logging and redaction.
- Non-goals confirmed for this branch:
  - No runtime API, schema, migration, OpenAPI, generated-client, provider
    sending, SMTP/APNs/FCM secrets, admin web exposure, mobile permission UX,
    auth/session/security runtime, money/settlement/storage/OCR/sync behavior,
    #371 deep-link behavior, deployment/env/CI, Figma output, screenshots, or
    binary assets.
- Close/keep-open recommendation:
  - Keep #635 open. This branch makes later implementation ready to split, but
    it does not implement the policy API or readout.
  - Runtime remains blocked until the relevant #635 child gates clear.
  - Keep #368, #369, #403, and #634 open.
  - Keep #371, #570, #575, #672, and #679 closed unless a separate concrete
    regression or approved follow-up scope is filed.
- Last verified repo/report references:
  - `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`
  - `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `.codex/reports/settleora-codex-report-20260703-2215-notification-635-admin-global-policy-readout.md`
  - `.codex/reports/settleora-codex-report-20260703-2225-notification-635-admin-global-policy-readout-pr-merge.md`

- #684 schema/API design gate checkpoint on
  `docs/notification-684-schema-api-design-gate-20260703`:
  - Base main SHA:
    `1a7798dadfc9b8dd0395de603e3062131b600fc1` after PR #690.
  - Adds
    `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md` and
    links it from `docs/architecture/README.md`.
  - Defines future persistence concepts only, including a
    `notification_global_policy` policy root,
    `notification_event_policy_overrides`, and bounded policy audit metadata.
    These are design-level names only, not approved EF entities, table names,
    migration names, OpenAPI schema names, or generated-client contracts.
  - Defines the future API/domain service boundary: API owns policy reads,
    writes, validation, authorization, resolver composition, and product-facing
    readouts; user/group preferences can narrow policy only; provider
    readiness cannot be invented by preferences or device state.
  - Designs future OpenAPI endpoint families without editing OpenAPI:
    `GET /api/v1/admin/notification-policy`,
    `PUT/PATCH /api/v1/admin/notification-policy`,
    `GET /api/v1/notification-policy/readout`, and an optional bounded
    provider-readiness readout endpoint with no secret configuration exposure.
  - Records owner/admin mutation requirements, current-user readout boundaries,
    audit events for reads/writes where appropriate, and redaction rules for
    SMTP/APNs/FCM secrets, provider payloads, raw device tokens, raw
    OCR/receipt text, storage internals, payment details, private notes,
    hidden bill data, and auth/session secret material.
  - Records future migration/rollout safety: explicit EF migrations only, no
    production startup auto-migration, in-app baseline enabled where supported,
    external channels disabled/unconfigured until configured, no silent
    widening of delivery, no fake provider success, and self-hosted
    TrueNAS/Docker-compatible degrade behavior.
  - Records the future test plan and implementation split: schema/API
    implementation behind manual/admin/security/schema/OpenAPI gates, then
    OpenAPI/generated clients, resolver/runtime wiring, #685 UI readout gate,
    #686 provider readiness integration, #688 audit/redaction coverage, and
    #689 final acceptance.
  - #684 should remain open pending design review/PR merge and later
    implementation. #635 remains open. Runtime remains blocked.
  - This docs/design branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, provider sending, provider secrets,
    auth/session/security runtime, money/settlement/storage/OCR/sync behavior,
    notification constants/writers, #371 notification-open behavior,
    deployment/env/CI, Figma output, screenshots, binary assets, or issue
    closure.

- #686 provider-readiness policy gate checkpoint on
  `docs/notification-686-provider-readiness-policy-gate-20260703`:
  - Base main SHA:
    `a857a6368b367f5914c49be7740e8057c81402e9` after PR #691.
  - Adds
    `docs/architecture/NOTIFICATION_PROVIDER_READINESS_POLICY.md` and links it
    from `docs/architecture/README.md`.
  - Defines provider readiness as a bounded signal into admin/global
    notification policy, not delivery success and not authority for event
    creation, recipient authorization, money truth, storage access, OCR
    acceptance, sync acceptance, auth/session state, or audit truth.
  - Defines design-level readiness states: `unsupported`, `disabled`,
    `unconfigured`, `configured`, `degraded`, `failing`, `rate_limited`,
    `maintenance`, `unknown`, and `ready`. Only `ready` permits a normal
    external attempt by default; `configured` is not enough by itself to claim
    attempts are allowed.
  - Records SMTP/email, APNs/iOS push, FCM/Android push, and in-app baseline
    boundaries. In-app is not an external provider-readiness state and remains
    the Day 1 baseline where an event is supported, eligible, authorized, and
    safe.
  - Inserts provider readiness into the future #635/#684 resolver after
    event support/content safety and admin/global channel caps, and before
    security/money external redaction policy, user preference, group mute,
    quiet-hours/digest, and device/platform availability.
  - Records source-of-truth boundaries: API/domain owns effective policy
    resolution; provider config/secrets are never exposed through policy
    readout; deployment/operator config may determine configured/unconfigured
    state without leaking values; user preferences, group mute, quiet-hours,
    device state, generated clients, browser cache, and mobile cache cannot
    invent provider readiness.
  - Defines product-facing and operator-facing readout semantics for
    unsupported, disabled, unconfigured, degraded, failing, deferred, queued,
    sent/attempted, and failed states without exposing secrets, tokens,
    private hostnames where sensitive, provider payloads, credentials, raw
    provider errors, payment details, OCR text, storage internals,
    auth/session data, or hidden bill data.
  - Defines future failure/retry posture for transient failure, permanent
    failure, rate limits, invalid recipient/device token, provider
    unavailable, queued/deferred attempts, idempotency/readout expectations,
    and audit-safe error categories.
  - Records self-hosted posture: external providers default to disabled or
    unconfigured until intentionally configured; missing external providers do
    not fail startup by themselves; TrueNAS/Docker-friendly warnings/readouts
    stay product-facing and non-secret; hosted activation and real provider
    secrets remain manual/deployment gates.
  - Recommends future split ordering: readiness config/readout design
    acceptance, secret/config-loading design if needed, SMTP readiness/readout
    adapter without sending, APNs/FCM readiness/readout adapter tied to #634
    without token handling unless #634 approves it, policy resolver
    integration through #687, audit/redaction through #688, and final
    acceptance through #689.
  - Records future test plan for provider state mapping, blocking
    unconfigured providers, admin disabled cap precedence, preference/group/
    quiet-hours narrowing only, device-state narrowing only, cache/generated
    client non-authority, secret/token redaction, safe failure
    classification, in-app baseline preservation, and unchanged #371 behavior.
  - #686 remains open pending design review/PR merge and later implementation
    acceptance unless the close rule is clearly satisfied. #635 and #634
    remain open. Runtime remains blocked. Keep #371 closed.
  - This docs/design branch does not implement SMTP/APNs/FCM runtime, provider
    SDKs, device-token handling, secrets/config files, deployment/env/CI,
    mobile release/signing, API runtime, schema/migrations, OpenAPI/generated
    clients, admin UI, mobile UI, notification constants/writers/provider
    delivery, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes, Figma
    output, screenshots, binary assets, or issue closure.

- #685 notification policy readout UX reference checkpoint on
  `docs/notification-685-policy-readout-ux-reference-20260704`:
  - Base main SHA:
    `d1c37256da4b416964c1b1afef58a9ee8806b96a` after PR #692.
  - Adds
    `docs/design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md`,
    adds `docs/design/notifications/README.md`, and links the notification
    design folder from `docs/design/README.md`.
  - Defines this packet as a non-authorizing UX/reference gate only. It does
    not approve runtime API, schema/migrations, OpenAPI/generated clients,
    admin/user/mobile/web UI implementation, provider sending, provider
    secrets, device-token handling, deployment, CI, or Figma API output.
  - Covers admin/operator global policy readouts, user settings readouts,
    mobile notification settings/readouts, user web settings/readouts,
    notification detail/error/explanation surfaces, and empty/degraded/
    disabled states.
  - Defines product-facing matrix guidance for `unsupported`, `disabled`,
    `unconfigured`, `configured`, `ready`, `degraded`, `failing`,
    `rate_limited`, `maintenance`, `unknown`, `muted`,
    `quiet_hours_deferred`, `digest_deferred`, `device_unavailable`,
    `token_missing`, `queued`, `sent_or_attempted`, `failed_transient`,
    `failed_permanent`, `blocked_by_admin_policy`,
    `blocked_by_security_policy`, `blocked_by_privacy_policy`,
    `blocked_by_user_preference`, and `blocked_by_group_preference`.
  - Records copy rules: no raw enum strings as primary UI copy, no raw provider
    failure codes in user copy, no normal-user "backend/client/server" debug
    wording except self-hosted "this server" product copy where appropriate,
    action-specific button labels, non-blaming unavailable states, in-app
    fallback where eligible, and no implied external delivery success without
    provider confirmation.
  - Records redaction boundaries for SMTP/APNs/FCM secrets, private hostnames
    where sensitive, raw device tokens, protected token blobs, provider
    payloads/errors, rendered external bodies when unauthorized, payment
    details, OCR/receipt text, storage internals, auth/session data, hidden
    bill data, private notes, and unrelated recipient/user data.
  - Defines admin versus normal-user distinction: admins may see bounded
    non-secret readiness/policy categories and setup/review actions; users see
    effective availability and preference actions only where allowed.
  - Defines reference-only mobile/web/admin layout guidance and accessibility
    expectations compatible with Settleora V1 mobile, user-web, and admin-web
    references.
  - Recommends future split ordering: manual review, optional Figma/reference,
    API/readout contract from #684, provider readiness readout from #686,
    separate UI implementation slices, accessibility/copy review, #688
    audit/redaction cross-check, and #689 final acceptance.
  - #685 remains open pending review/PR merge and future UI/reference
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684 and #686 remain open. Runtime remains blocked. Keep #371 closed.
  - This docs/design branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, user web UI, mobile UI, provider
    sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, or issue
    closure.

- #687 notification policy resolver wiring design gate checkpoint on
  `docs/notification-687-policy-resolver-wiring-design-gate-20260704`:
  - Base main SHA:
    `e29de98d7d9ff791f19f85c501de31571fd0bce6` after PR #694.
  - Adds
    `docs/architecture/NOTIFICATION_POLICY_RESOLVER_WIRING_DESIGN.md` and
    links it from `docs/architecture/README.md`.
  - Defines this packet as a non-authorizing docs/design control gate for
    future resolver wiring only. It does not authorize runtime resolver code,
    API endpoints, schema/migrations, OpenAPI/generated clients, provider
    sending, provider secrets, device-token handling, admin/user/mobile UI,
    deployment, CI, production audit plumbing, notification constants/writers,
    or #371 behavior.
  - Records future resolver ownership: API/domain owns effective notification
    policy resolution; clients may display readouts only; workers and provider
    adapters cannot mutate core business tables or invent notification-policy
    decisions; provider readiness is an input only; user/group preferences can
    narrow optional delivery only; admin/global policy plus security, money,
    and privacy rules remain authoritative.
  - Defines design-level input groups only: event type/family and source
    state, actor/request context, recipient authorization and group
    membership, content safety/privacy class, admin/global caps, event-family
    overrides, provider readiness, user preferences, group/thread preference
    or mute, quiet-hours/digest/defer/expiry, device/platform availability,
    audit/redaction policy version, and idempotency/correlation context. These
    are not approved schema fields, DTOs, EF entities, OpenAPI schemas, or
    generated-client contracts.
  - Reconciles resolver precedence as: event support/eligibility/source
    ownership/recipient authorization/content safety; admin/global channel,
    event-family, timing, and sensitivity caps; provider readiness;
    security/money required in-app or external redaction rules; user
    preference; group/default/thread preference or mute; quiet-hours, digest,
    deferral, and expiry; device/platform and worker/outbox availability; then
    audit/redaction category generation. Earlier blocks short-circuit later
    external delivery while preserving in-app where safe and eligible.
  - Defines conceptual future outputs only, including effective channel
    decision, decision/readout/audit category, external attempt eligibility,
    defer/queue/expiry category, provider readiness category used, safe
    user/admin explanation keys, redaction policy version, policy reference,
    and idempotency/correlation reference. These are not OpenAPI or generated
    client contracts.
  - Records channel semantics for in-app baseline, email, mobile push, SMS
    unsupported Day 1, future digest/deferred delivery, unsupported/
    unconfigured/disabled/degraded/failing/rate-limited provider states,
    token/device unavailable categories, policy blocks, quiet-hours/digest
    deferral, and attempted versus confirmed delivery.
  - Integrates #688 audit/redaction posture: no raw payload storage; redact
    before logs, audit, readouts, reports, comments, screenshots, tests,
    fixtures, metrics, and traces; normalize resolver/provider/token/device
    states into safe categories; forbid secrets, device tokens, provider
    payloads, raw OCR/receipt text, storage internals, payment details, hidden
    bill data, private notes, and auth/session data.
  - Records future dependency gates before runtime: #684 schema/API
    implementation approval, OpenAPI/generated-client gate if contracts
    change, #686 provider readiness implementation or safe input contract,
    #688 audit/redaction implementation strategy, manual admin/security
    review, #634 approval for device-token/provider interaction, accepted #685
    readout reference, and Figma/UI gates before surfaces use resolver
    outputs.
  - Records future test plan for precedence/order, admin cap non-widening,
    security/money required in-app behavior, provider readiness no-fake-success
    behavior, provider unavailable states, quiet-hours/digest deferral,
    device/token push-only narrowing, block categories, idempotency/
    correlation, audit/redaction safety, API authorization if endpoints exist,
    OpenAPI/generated-client validation if contracts exist, and unchanged #371
    notification-open/deep-link regressions.
  - Records rollout posture: fail closed for external delivery when unknown,
    preserve safe in-app baseline, do not fail app startup due to missing
    optional providers, do not turn unconfigured providers into normal-user
    runtime exceptions, keep self-hosted deployments safe by default, and
    never produce fake success states.
  - Recommends future split ordering: manual review of this packet, then a
    small API/domain resolver skeleton behind feature-neutral tests if
    approved, schema/API/OpenAPI tasks only after #684 implementation gate,
    provider readiness adapter after #686 gate, audit/redaction tests after
    #688 gate, readout surfaces after UI/API gates, and final acceptance
    through #689.
  - #687 should remain open pending review/PR merge and future implementation
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684, #686, and #688 remain open unless separately satisfied. #685 remains
    closed unless a concrete reference regression exists. Runtime remains
    blocked. Keep #371 closed.
  - This docs/design branch does not implement runtime resolver code, API
    endpoints, schema/migrations, OpenAPI/generated clients, admin UI, user
    web UI, mobile UI, provider sending, SMTP/APNs/FCM runtime, secrets/config
    files, device-token handling, auth/session/security runtime, money/
    settlement/storage/OCR/sync behavior, #371 notification-open behavior,
    #672/#679 state changes, deployment/env/CI, Figma output, screenshots,
    binary assets, production audit plumbing, or issue closure.

- #687 notification policy resolver runtime foundation checkpoint on
  `feature/notification-687-policy-resolver-runtime-foundation-20260705`:
  - Base main SHA:
    `90e5355ba071972f1295d19ca191ce98dcd2d141` after PR #701.
  - GitHub state/project status:
    issue `CLOSED` as completed after PR #702 merged the approved narrow
    resolver-runtime foundation.
  - Merged PR:
    #702 `feat(api): add notification policy decision resolver foundation` at
    merge SHA `f7d8239b963b2cbc2ba4fb9a852c25c92645f1be`.
  - Reviewed implementation head:
    `235b8747113a6bb984448c79520a86ec05ec11a0`.
  - Implementation branch:
    `feature/notification-687-policy-resolver-runtime-foundation-20260705`,
    retained at `235b8747113a6bb984448c79520a86ec05ec11a0`.
  - Report:
    `.codex/reports/settleora-codex-report-20260705-1335-notification-687-resolver-pr702-merge-gate.md`.
  - Completed slice:
    - Added a scoped internal notification decision policy resolver that loads
      the active API-owned admin/global notification policy, applies
      event-family overrides, consumes bounded provider-readiness categories,
      and translates those inputs into existing
      `NotificationDecisionChannelPolicy` values for the pure
      `NotificationDecisionEnvelopeResolver`.
    - Preserved the existing stateless resolver constructor and existing
      in-app baseline behavior.
    - Preserved fail-closed external defaults: without persisted policy,
      external email and mobile push are disabled even when readiness is
      configured.
    - Preserved `MayAttemptExternalProvider=false`; configured/readiness-
      eligible channels resolve only to future-provider eligibility and do not
      send or claim provider success.
    - Added focused tests proving unsupported event-family/channel caps,
      provider unconfigured mapping, admin-disabled precedence over configured
      readiness, user preference narrowing, quiet-hours/digest deferral,
      future-provider-only configured candidates, required/security in-app
      baseline preservation, and sent/failed vocabulary remaining delivery-
      attempt/provider-runtime state outside this resolver slice.
  - Remaining gates:
    - No SMTP/APNs/FCM sending, provider SDK activation, provider config/
      secrets, device-token lifecycle behavior, admin write API, UI,
      OpenAPI/generated-client change, schema/migration, production audit
      plumbing, resolver audit hooks, #371 behavior, #634 behavior, or
      unrelated event-writer work is completed by this slice.
    - #689 final acceptance remains open and is not ready until approved
      implementation slices merge and final acceptance checks pass.
    - Future provider sending, device/provider runtime, admin writes, mutation
      audit, UI/readout surfaces, and any OpenAPI/schema expansion remain
      separately gated.
  - Close/keep-open recommendation:
    keep #687 closed as completed for the narrow resolver-runtime foundation
    merged by PR #702. Keep #635 and #689 open for broader policy/final
    acceptance. Keep #403, #369, #368, and #634 open. Keep #684, #685, #686,
    #688, #371, #570, #575, #672, and #679 closed unless a concrete
    regression or approved follow-up changes that posture.

- #688 audit/redaction coverage gate checkpoint on
  `docs/notification-688-audit-redaction-coverage-gate-20260704`:
  - Base main SHA:
    `2649f0cacefbb26d223f0fcf9e97834a97ffef1c` after PR #693.
  - Adds
    `docs/architecture/NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md` and
    links it from `docs/architecture/README.md`.
  - Defines this packet as a non-authorizing docs/security/control coverage
    gate for future audit/redaction requirements only. It does not authorize
    runtime API, schema/migrations, OpenAPI/generated clients, provider
    sending, secrets, device-token handling, admin/mobile/user-web UI,
    deployment, CI, production audit plumbing, notification constants/writers,
    or #371 behavior.
  - Covers future admin/global policy reads and mutations, current-user
    effective policy readouts, provider-readiness readouts, degraded/failing/
    maintenance/rate-limited readouts, resolver decisions, later delivery
    attempt result categories, notification detail explanations,
    admin/operator diagnostics, logs, metrics, reports, CI artifacts, issue
    comments, screenshots, and test fixtures.
  - Records design-level safe category candidates such as `policy_read`,
    `policy_updated`, `policy_denied`, provider readiness categories,
    delivery deferred/queued/attempted/failure categories, admin/security/
    privacy/user/group preference block categories, `token_missing`, and
    `device_unavailable`.
  - Defines a forbidden-data matrix covering SMTP/API/app passwords, APNs/FCM
    credentials, private keys/certificates/team IDs where sensitive, raw or
    reversible device tokens, provider payloads and raw provider errors,
    unauthorized rendered external bodies, auth/session secrets, raw
    OCR/receipt text/images/storage keys, storage internals, payment details,
    private notes, hidden bill/settlement details, unauthorized recipient
    lists, private hostnames/ports where sensitive, and unrelated user data.
  - Defines future redaction/normalization requirements: non-reversible
    identifiers, short purpose-bound token fingerprints only if approved, safe
    provider error categories, URL/host classification before display,
    category/state/action event payload reduction, explicit allow-listing for
    money/security/OCR/storage/auth/payment fields, admin readout redaction,
    and debug-mode redaction by default.
  - Records authorization expectations for owner/admin policy mutation audit,
    admin/operator read authorization, current-user effective-state readouts,
    denial auditing without existence leakage, and the rule that policy audit
    does not replace money/settlement/bill/OCR/sync/storage/auth/security
    source-domain audit.
  - Defines conceptual audit fields only: opaque actor/admin ID, action
    category, policy ID/version if approved, channel/event-family category,
    safe readiness category, decision category, timestamp, request correlation
    ID, redaction policy version, and result category. Raw payload storage is
    forbidden.
  - Records future test plan for redaction helpers, policy read/update audit,
    forbidden-field absence in admin/user readouts, provider-readiness
    redaction, resolver categories, UI copy snapshots if surfaces exist,
    negative raw OCR/storage/payment/auth/session tests, log/audit fixture
    tests, OpenAPI/generated-client contract tests when contracts exist, and
    #371 regression preservation.
  - Records self-hosted posture: Docker/TrueNAS logs safe by default, debug mode
    cannot dump secrets/raw provider payloads without a future explicit
    local-only diagnostic gate, provider unconfigured/disabled/degraded/failing
    states use safe categories, and missing external provider config is a
    readout category rather than a fatal startup condition by itself.
  - Recommends future sequence: manual/security review, redaction helper/design
    implementation if approved, audit event schema/API after #684, provider
    readiness redaction tests after #686, UX/readout snapshots after #685
    surfaces exist, resolver audit hooks after #687, and final acceptance
    through #689.
  - #688 should remain open pending review/PR merge and future implementation
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684 and #686 remain open unless separately satisfied. #685 is closed and
    should not be reopened without a concrete reference regression. Runtime
    remains blocked. Keep #371 closed.
  - This docs/security branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, user web UI, mobile UI, provider
    sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, production
    audit plumbing, or issue closure.

- #635 runtime-entry decision checkpoint on
  `docs/notification-635-runtime-entry-decision-packet-20260704`:
  - Base main SHA:
    `09f1f26efd9d46ad995d9baf048b3dab43b0f974` after PR #695.
  - Adds
    `docs/planning/NOTIFICATION_635_RUNTIME_ENTRY_DECISION_PACKET.md`.
  - Live issue readback confirmed #635, #684, #686, #687, #688, #689, #403,
    #369, #368, and #634 are open; #685, #371, #570, #575, #672, and #679 are
    closed.
  - Records current merge state:
    - PR #691 merged #684 schema/API design at
      `a857a6368b367f5914c49be7740e8057c81402e9`.
    - PR #692 merged #686 provider-readiness design at
      `d1c37256da4b416964c1b1afef58a9ee8806b96a`.
    - PR #693 merged #685 UX/readout reference at
      `2649f0cacefbb26d223f0fcf9e97834a97ffef1c`; #685 is closed.
    - PR #694 merged #688 audit/redaction coverage at
      `e29de98d7d9ff791f19f85c501de31571fd0bce6`.
    - PR #695 merged #687 resolver-wiring design at
      `09f1f26efd9d46ad995d9baf048b3dab43b0f974`.
  - Records that #689 final acceptance remains open and not ready because
    implementation slices have not merged.
  - Gate posture:
    manual/admin/security, schema/migration, OpenAPI/generated-client,
    provider/secrets/deployment, #634 device-token/provider, #688 audit/
    redaction implementation, UI/Figma/readout implementation, and #689 final
    acceptance remain separate gates.
  - Recommended next runtime path:
    prepare a small #684 schema/API implementation task only after
    Tommy/manual approval. Otherwise pause #635 runtime and switch lanes.
  - Alternative options recorded:
    #687 resolver skeleton without persistence only if explicitly approved as
    domain-only/no-public-API/no-provider work; #686 provider readiness runtime
    is not first unless provider activation/readiness is the priority and gates
    clear; #688 redaction helpers are a possible companion or security-first
    foundation; deferral is safe if gates are not approved.
  - Manual decisions pending:
    whether to start #684 runtime; whether the first slice includes EF schema/
    migration; whether it includes OpenAPI/generated clients; whether Day 1
    gets admin write API or read-only/readout first; whether provider readiness
    is read-only category input first; whether #687 waits for #684 contracts;
    whether #688 helpers precede public readout; and whether #635 admin UI
    stays docs/Figma-only until API stability.
  - Close/keep-open recommendation:
    keep #635, #684, #686, #687, #688, #689, #403, #369, #368, and #634 open.
    Keep #685, #371, #570, #575, #672, and #679 closed unless a concrete
    regression or approved follow-up changes the posture.
  - This docs/control checkpoint does not implement runtime API, schema/
    migrations, OpenAPI/generated clients, admin UI, user web UI, mobile UI,
    provider sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, production
    audit plumbing, or issue closure.

- #686 provider-readiness category foundation implementation checkpoint after
  PR #699:
  - GitHub state/project status: #686 `CLOSED` as completed after PR #699
    merged the approved category/readout-only provider readiness foundation.
    Project field mutation was not attempted.
  - Last verified at main SHA:
    `9ed8cb49428ecb044ca2b6d102b15ef09c0e50d4`.
  - Merged PR:
    #699 `feat(api): add notification provider readiness categories` at merge
    SHA `9ed8cb49428ecb044ca2b6d102b15ef09c0e50d4`.
  - Reviewed implementation head:
    `a19f0adf6b2617ed45ea20c1f2da1d38d0ed9b59`.
  - Implementation branch:
    `feature/notification-686-provider-readiness-category-foundation-20260704`,
    retained at `a19f0adf6b2617ed45ea20c1f2da1d38d0ed9b59`.
  - Completed merged slice:
    - Added the internal `INotificationProviderReadinessService` boundary and
      `NotificationProviderReadinessSnapshotService`.
    - Added bounded, secret-free readiness categories for `email` and
      `mobile_push`.
    - SMTP readiness derives only from existing safe option completeness as
      `disabled`, `unconfigured`, or `configured`.
    - Mobile push readiness remains conservative: `disabled` when disabled and
      `unconfigured` when enabled because there are no safe APNs/FCM config
      fields yet.
    - Existing `GET /api/v1/admin/notification-policy` readout consumes those
      categories without changing the response shape.
    - Persisted/default admin policy caps remain authoritative.
    - `externalProviderAttemptAllowed` remains `false` for all channels.
    - Focused tests cover readiness derivation, readout category composition,
      admin-disabled precedence, auth/session protections, and forbidden-detail
      absence.
  - Remaining gates:
    - Real provider activation/config/secrets/sending remains future gated
      work and is not completed by #686.
    - #687 resolver runtime remains open as a separate task.
    - #688 audit/mutation/redaction runtime acceptance remains open.
    - #689 final acceptance remains open and is not ready.
    - #635 remains open for broader admin/global notification policy API,
      readout, resolver, audit, provider, and admin UI gates.
    - #403, #369, #368, and #634 remain open for broader notification,
      provider, device-token, delivery-state, and event-coverage work.
  - Close/keep-open recommendation:
    keep #686 closed as completed for the readout/category-only provider
    readiness foundation. Keep #635, #687, #688, #689, #403, #369, #368, and
    #634 open. Keep #684, #685, #371, #570, #575, #672, and #679 closed unless
    a concrete regression or approved follow-up changes that posture.
  - Non-goals confirmed for PR #699:
    no admin notification policy write/update/delete API, OpenAPI contract or
    generated-client change, EF schema/migration, SMTP/APNs/FCM sending,
    provider SDK activation, provider config/secrets, `.env`, Docker, compose,
    deployment, CI, device-token lifecycle behavior, mobile push permission UX,
    admin/user/mobile UI, Figma output, #371 notification-open behavior, #687
    resolver runtime, #688 mutation audit/runtime, #689 final acceptance,
    money/settlement/payment/bill calculation, OCR, storage, sync,
    reconciliation, auth/session/security behavior beyond existing admin read
    authorization, direct push to `main`, force push, branch deletion, or
    secret change.
  - Last verified repo/report references:
    - `.codex/reports/settleora-codex-report-20260705-0009-notification-686-provider-readiness-pr699-merge-gate.md`
    - `.codex/reports/settleora-codex-report-20260704-2340-notification-686-provider-readiness-pr-open.md`
    - `.codex/reports/settleora-codex-report-20260704-2325-notification-686-provider-readiness-category-foundation.md`

- #688 audit/redaction readout coverage implementation checkpoint on
  `feature/notification-688-audit-redaction-readout-coverage-20260705`:
  - Base main SHA:
    `7f78ff340c240690db664dfeccb350d97b78051e` after PR #700.
  - Reviewed implementation head:
    `b408e89d5b9105dc2b72f1100bcafcdb9cd87048`.
  - Completed slice:
    - Added focused redaction-helper regression coverage for fail-closed
      normalization of unsafe channel, channel-cap, readiness, readout
      category, event-family, content-class, and timing values.
    - Hardened admin notification policy endpoint coverage so unexpected
      provider-readiness strings containing SMTP host/user/password details,
      APNs/device-token wording, or provider payload wording normalize to
      bounded `unknown`/`provider_unknown` categories before serialization.
    - Expanded forbidden-string assertions for the current approved
      `GET /api/v1/admin/notification-policy` readout, including SMTP,
      APNs/FCM, provider payload/request, device-token/protected-token,
      storage/OCR/payment/private/hidden bill, and auth/session/MFA/passkey
      wording.
    - Added coverage proving the current read-only admin policy readout does
      not create notification-policy-specific audit rows; ordinary
      auth/session validation audit remains separate source-domain behavior.
  - Current surface posture:
    - The approved read-only admin/global policy readout and
      provider-readiness category surface remain bounded category readouts.
    - `externalProviderAttemptAllowed` remains `false`.
    - No policy mutation, resolver runtime, provider sending, provider config,
      OpenAPI/generated-client, schema/migration, UI, deployment, money,
      storage, sync, OCR, or auth/session runtime behavior changed.
  - Close/keep-open recommendation:
    close #688 after this test-only PR merges because the currently approved
    readout/provider-readiness audit-redaction coverage slice is satisfied.
    Keep future mutation/write audit, production audit plumbing, resolver
    audit hooks, delivery-attempt audit, and admin/operator diagnostic
    coverage as separate future gates under #635/#687/#689 or explicitly
    named follow-up issues.
  - Keep #635, #687, #689, #403, #369, #368, and #634 open. Keep #684, #685,
    #686, #371, #570, #575, #672, and #679 closed unless a concrete regression
    or approved follow-up changes that posture.

### Issue #458 - User web auth/session shell and navigation foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #580, merge SHA `c83001caea4835b9fe2c8de0d1056484a0f09b2f`:
    implemented the user-web React/Vite auth/session shell, responsive
    navigation, auth-required/session boundary seam, safe placeholder route
    states, and visual evidence. It did not add fake login success, token
    persistence, auth runtime changes, OpenAPI changes, or generated-client
    edits.
- Completed scope:
  - Auth/session shell and navigation foundation for user web.
  - Session-required/expired presentation and generated-client boundary seam.
  - Modern rounded Settleora web shell direction recorded through PR evidence.
- Remaining Day 1 work:
  - Feature-complete bills, groups, friends/direct sharing, settlements,
    notifications, reports, import/export, backup, profile/payment, and
    account/security screens were explicitly future slices under later issues.
  - Real web auth credential wiring remains a future reviewed auth/security
    task.
- Future gates requiring explicit approval:
  - Auth/session/security runtime, token persistence, credential storage, or
    account/security settings.
  - OpenAPI/generated-client changes.
  - Figma/human UI approval for new production user-web screens.
- Blockers/manual decisions:
  - None for the completed #458 foundation slice.
  - Future auth/security runtime remains manual-gated.
- Close/keep-open recommendation:
  - Safe to keep closed as the #458 foundation slice is complete.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1815-user-web-auth-session-shell-nav-458.md`
  - Issue completion comment:
    `https://github.com/tommytang213/Settleora/issues/458#issuecomment-4825978404`

### Issue #459 - User web bills, groups, friends, and direct-sharing flows

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #581, merge SHA `d4b046cc53c120b1bf1d8a2691b3e6e7e1dbfc97`:
    merged `docs/planning/USER_WEB_BILLS_GROUPS_FRIENDS_IMPLEMENTATION_PLAN.md`.
  - PR #582, merge SHA `03560c687221b41c75195ba93cc2c1f593f206be`:
    added read-only personal bills readout.
  - PR #583, merge SHA `a2f85aa0d49fd003d76db85de8bbdff2c12eb69a`:
    added groups and friends readout surfaces.
  - PR #584, merge SHA `a4bbcd4f07fcadbb8b7b834c4680af3c41977cfa`:
    added group bills readout.
- Completed scope:
  - Planning gate for bills/groups/friends/direct-sharing flows.
  - Read-only user-web bills, groups/friends, and group-bills readout slices
    using existing generated-client boundaries.
- Remaining Day 1 work:
  - Full bill create/edit/lifecycle UI, receipt/file attachment handoffs, bill
    revision review, bill correction proposal/edit, friends/direct-sharing
    contract/runtime, and temporary participant claim/link contract/runtime
    remain follow-up slices where not already covered elsewhere.
- Future gates requiring explicit approval:
  - Money/split/rounding authority changes.
  - Storage/file privacy or attachment byte behavior.
  - Friends/direct-sharing API/OpenAPI/generated-client work.
  - Figma/human UI approval for production interaction depth.
- Blockers/manual decisions:
  - Future runtime slices must keep API/domain authority for authorization,
    money, storage, status transitions, and audit.
- Close/keep-open recommendation:
  - Safe to keep closed as the original planning gate and readout follow-ups
    have merged. Do not treat closure as completion of every future bill,
    group, friend, direct-share, file, or temporary-participant runtime slice.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1948-user-web-bills-groups-friends-plan-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2105-user-web-bills-readout-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2134-user-web-groups-friends-readout-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2207-user-web-group-bills-readout-459.md`
  - Issue completion comment:
    `https://github.com/tommytang213/Settleora/issues/459#issuecomment-4826032800`

### Issue #460 - User web settlement, notifications, profile, and payment-details flows

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #585, merge SHA `60bd9c3f51921692fe0a904d8139c865d8abd33e`:
    added read-only settlements readout.
  - PR #586, merge SHA `41082a5fa2653922f653704743b89dc975abe665`:
    added profile payment details readout.
  - PR #587, merge SHA `c40d4b314626d59e931f39836dd34956c0af53ac`:
    added settlement counterparty payment details readout.
  - PR #588, merge SHA `6e47bba2ffc4b0f8495eb8b5721f70ce77836f39`:
    added notifications readout.
  - PR #589, merge SHA `fc5a3c827fa4419caca1e7ff5af2d91cd45cd566`:
    added notification preferences readout.
  - PR #590, merge SHA `8249760740f90369ecff033438e82bfd50ac06a1`:
    added settlement proof metadata readout.
- Completed scope:
  - Settlement, profile/payment details, counterparty payment details,
    notifications, notification preferences, and settlement proof metadata
    readout surfaces for user web.
  - Privacy/visibility and unsupported-state messaging around payment details,
    QR/proof/file metadata, notification delivery, and user preference
    persistence boundaries.
- Remaining Day 1 work:
  - Full settlement action UI, proof upload/download byte flows, profile/payment
    edit/upload flows, channel delivery runtime, push/email provider behavior,
    and server-side notification suppression/filtering remain separate unless
    a later merged PR verifies them.
- Future gates requiring explicit approval:
  - Storage/file-byte behavior for proof or QR uploads/downloads.
  - Money/settlement/payment calculation or state-transition authority.
  - Auth/security, OpenAPI/generated-client, notification provider, push/email,
    or privacy policy changes.
  - Figma/human UI approval for production settlement and settings flows.
- Blockers/manual decisions:
  - Future mutations must preserve API/domain authority and payment-details
    visibility rules. No global payment directory is approved.
- Close/keep-open recommendation:
  - Safe to keep closed for the merged readout/checkpoint scope. Do not treat
    closure as approval for future payment/provider/storage/settlement mutation
    work.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-2245-user-web-settlements-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260628-2320-user-web-profile-payment-details-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0004-user-web-settlement-counterparty-payment-details-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0030-user-web-notifications-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0126-user-web-notification-preferences-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0150-user-web-settlement-proof-metadata-readout-460.md`

### Issue #461 - User web reports, search, export, import, and local-mode surfaces

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #591, merge SHA `4a7634d764d3c9eab89d773447980ff058e8803d`:
    user-web reports/search readout.
  - PR #592, merge SHA `86cc3bb9c939c0c312e56d3d48001fe2b37a911e`:
    export/import/local-mode surface plan.
  - PR #593, merge SHA `e6705a8041a1af4cd20d3b151d8217e873141dc1`:
    import/export availability readout.
  - PR #594, merge SHA `b381cbcd4136c65724e568a687109e64e72a1d0b`:
    export readiness contract plan.
  - PR #595, merge SHA `266a8e6fae354226280a901aca553ed47990718a`:
    bill export readiness contract.
  - PR #596, merge SHA `dd2af800b22b426cf6c2effe354b309e2def9a48`:
    readiness-gated export runtime.
  - PR #597, merge SHA `24d7773681ace08ca4386166882c8a4a2e4e1014`:
    group export runtime.
  - PR #598, merge SHA `0bf17a0024b2473651776bec723d84756117bfea`:
    import preflight/review plan.
  - PR #599, merge SHA `193475031c5d55af69a90c663734e6381cfd8ed8`:
    bill CSV import preflight contract.
  - PR #600, merge SHA `97914fee91f44254a9811f718e10b11e0c5ad6ac`:
    import preflight review runtime.
  - PR #601, merge SHA `c43042909a33852352f32537cc1722a615630cdd`:
    import confirmation contract plan.
  - PR #602, merge SHA `8c98ef88fceefd2b8616c40bf240ce11abd6cea6`:
    bill CSV import confirmation sessions.
  - PR #603, merge SHA `d240e929eaad9cb65bb6111a215795b0e530b19a`:
    import confirmation runtime.
  - PR #604, merge SHA `9561aafe360a340ad25e97539afed37f3c1f6ea2`:
    sync/local status surface plan.
  - PR #605, merge SHA `a4a27ba451b54b181a4e84d6935dc74ac23c03a8`:
    sync/local status contract plan.
  - PR #606, merge SHA `2e72d0e937bc12a32836297aa86b195e987a5b6e`:
    sync/local status read contract.
  - PR #607, merge SHA `5a9c7a6c2cb12ea76ec849fd67cc0a74f0037445`:
    sync/local status readout.
  - PR #608, merge SHA `f0bc262207b29de7a1c87cec9ec58a0fc90b5020`:
    local backup/restore surface plan.
  - PR #609, merge SHA `ab77f554b760a1410c9709a2e459f59b26dc5eb5`:
    local backup package contract plan.
  - PR #610, merge SHA `719af62f0154f53a1a6c0e578c91d9c49c74be75`:
    local backup package readiness contract.
  - PR #611, merge SHA `007170e5707654cf5f01fdf54324dc928f17d80c`:
    local backup package session plan.
  - PR #612, merge SHA `c1eaee71de53765b6a97cf86429d10ecbaa6dca2`:
    local backup package session contract.
  - PR #613, merge SHA `49926c547c03600499f437fa14c23cf28ef3327a`:
    local backup generation/download surface plan.
  - PR #614, merge SHA `6066eefed357f2592e1d60e7b983b9730d66c03a`:
    local backup package generation/download contract.
  - PR #617, merge SHA `a6564827c9c6d40f765a2dad9701ba3213bf06c3`:
    local backup package data artifact runtime.
  - PR #618, merge SHA `e8cc2d0f5379f4f2f7739780c7766e8d529df994`:
    user-web local backup package data download runtime.
  - PR #619, merge SHA `5a655c8028b424a59aac4ecbdf791a5eff177fb7`:
    local backup restore preview contract.
  - PR #620, merge SHA `1ab29e7795664af966cf0d5b69ce7cadc9e54934`:
    user-web local backup restore preview runtime.
  - PR #621, merge SHA `238d8eb143dfe7eb6d276ca2a722296f8164d680`:
    local backup restore confirmation contract plan.
  - PR #622, merge SHA `23346a2c9d71c8eb4a62342e1b4dd0ef6c276566`:
    local backup restore confirmation session contract.
  - PR #623, merge SHA `b0088732290cc6fe9fb907a6b668d89d368d6718`:
    user-web restore confirmation session runtime.
  - PR #624, merge SHA `66e997098e737e85cd1d64a999ff18d01b165d9c`:
    local backup personal bill candidate package/restore-preview slice.
- Completed scope:
  - Reports/search readout and import/export availability readouts.
  - Readiness-gated personal/group bill export runtime.
  - CSV import preflight, import confirmation sessions, and user-web import
    preflight/confirmation runtime.
  - Sync/local status read contract and readout.
  - Local backup package readiness, package sessions, generation/download
    metadata, data-only artifact runtime, user-web package download runtime,
    restore preview, restore confirmation sessions, and non-mutating personal
    bill candidate package/restore-preview coverage.
- Remaining Day 1 work:
  - Actual restore apply mutation remains unimplemented and not approved.
  - Durable/encrypted package storage remains separate.
  - File-byte package sections remain separate.
  - Package upload/storage remains separate.
  - Browser-local persistence/security design remains separate.
  - Full local-only authority-boundary persistence and local-to-server
    migration remain future-gated.
- Future gates requiring explicit approval:
  - Restore apply/mutation.
  - Storage/file-byte package sections, durable package storage, upload/storage,
    encryption/key-handling, or privacy/vault byte behavior.
  - Browser-local persistence using IndexedDB, localStorage, Cache Storage,
    service workers, object URLs, browser file-system APIs, or local queues.
  - OpenAPI/generated-client contract changes and API/domain authority changes.
- Blockers/manual decisions:
  - Human approval is required before treating #461 as proof that every Day 1
    reports/search/export/import/local-mode requirement is complete.
  - Future backup/restore mutation and browser-local authority decisions remain
    manual-gated.
- Close/keep-open recommendation:
  - Keep closed as current project status is `Merged`, but treat #461 as an
    umbrella/history checkpoint. Do not open duplicate work from stale issue
    text; create focused follow-up issues for the remaining gates above.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260629-1106-user-web-reports-search-readout-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1249-user-web-import-export-availability-readout-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1204-user-web-export-import-local-mode-plan-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1441-user-web-export-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1751-user-web-import-preflight-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-2011-user-web-import-confirmation-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-2220-user-web-sync-local-status-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260630-1828-user-web-local-backup-personal-bill-data-package-preview-461.md`
  - `.codex/reports/settleora-codex-report-20260630-1913-user-web-local-backup-personal-bill-data-package-preview-pr-merge.md`
  - Issue checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/461#issuecomment-4842928407`
