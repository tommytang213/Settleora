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

### Issue #369 - Settlement residual review notification runtime

- GitHub state/project status: issue `OPEN`; Project field readback was not
  updated by this docs/control task. Related issues #368, #403, #634, #635,
  and #371 were read back as `OPEN` before the policy edit.
- Last verified at main SHA:
  `0d65ff91252196034dde02b3a9fef8a66319596d` after PR #655 and before the
  `feature/settlement-residual-review-needed-notification-369-20260702`
  implementation branch.
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
- Explicitly not complete:
  - No debtor notification after receiver residual decision.
  - No broader settlement mismatch/review event runtime.
  - No provider send, mobile/deep-link, admin/global policy, settlement
    business schema, money, residual, allocation, payment, proof, balance
    projection, auth/security, deployment, CI, or secret change.
- Remaining Day 1 work:
  - Future debtor notification after receiver residual decisions only if a
    later policy names the event/source/recipient rules.
  - Broader settlement mismatch/review notifications remain blocked until
    broader settlement review source states exist.
  - #371 deep links, #635 admin/global policy/readout, #634 real push/provider
    and mobile work, OCR completed/failed, auth/session/security
    notifications, item claim/split notifications, and final Day 1 acceptance
    remain open/gated.
- Close/keep-open recommendation:
  - Keep #369 open. This branch completes only the narrow pending residual
    review handoff; it does not complete all Day 1 notification event-family
    coverage.
  - Keep #368, #403, #634, #635, and #371 open.
- Last verified repo/report references:
  - `docs/architecture/SETTLEMENT_RESIDUAL_REVIEW_NOTIFICATION_SOURCE_POLICY.md`
  - `/workspace/logs/settleora-codex-report-20260702-settlement-residual-review-notification-source-policy-369.md`

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
  - #371 remains open and Figma/reference-gated for notification deep
    links/mobile UI.
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
    policy/readout (#635), #371 deep links/mobile UI, hosted runtime
    activation, recipient-email source/policy, OpenAPI/readout, and remaining
    notification work remain gated.
  - #369 remains open because #632 closure is provider runtime foundation
    only, not full Day 1 notification event-family acceptance.
  - #634/#635/#368/#371 remain open.
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
  - #371 remains open and Figma/reference-gated.
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
  - #371 notification deep links kept separate and Figma/reference-gated.
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
    activation, admin/readout, #371 deep links, recipient/policy/runtime
    wiring, and remaining notification work remain gated.
  - #369 remains open because #634 A2/A3 Option A are push token/runtime
    foundations only, not full Day 1 notification event-family acceptance.
  - #635, #368, and #371 remain open.
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
  `sync.operation_failed` implementation branch report.
- Parent epic readback: #368 is `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `33`, `Figma Required` `Yes`,
  `Manual Gate` `Yes`. GitHub issue #368 remains `OPEN` by readback on
  2026-07-01.
- Last verified at main SHA:
  `1c94fda04dfcea282bc15f6d06a83ce5cb7faaef`.
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
- Remaining Day 1 work:
  - Future OCR `ocr.completed` and `ocr.failed` events require server OCR
    worker/job source states and safe recipient/action policy first.
  - Remaining sync notification events such as queued, conflict resolved, retry
    behavior, conflict resolution behavior, mobile deep links/UI, and broad
    offline-sync expansion remain future work.
  - Auth/session/security notification runtime remains manual auth-security
    gated.
  - Item claim/split/creator-review notification coverage remains blocked on
    source claim runtime and #371/Figma/deep-link references.
  - Future settlement debtor notification after receiver residual decisions
    and broader settlement mismatch/review event coverage remain separate
    source-state/policy work.
  - Push/email provider delivery, provider workers, digests, delivery receipts,
    background delivery, admin/global policy, Day 1 notification acceptance,
    production readiness, release readiness, manual UI retest, and manual code
    review are not completed by #626, #630, #636, #639, #642, #643, #644,
    #645, #647, #649, or #650.
- Future gates requiring explicit approval:
  - #371 Figma/reference-gated notification deep links/mobile UI.
  - Auth/session/security policy before security-impactful notifications.
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
    one narrow settlement residual-review implementation slice. None of these
    is full Day 1 notification event-family acceptance.
- Last verified repo/report references:
  - `docs/architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`
  - Issue #369 PR #626 progress comment:
    `https://github.com/tommytang213/Settleora/issues/369#issuecomment-4844221960`
  - Branch report:
    `/workspace/logs/settleora-codex-report-20260702-0112-sync-operation-failed-notification-369.md`

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
    admin/readout, #371 deep links, and remaining notification work stay
    open/gated.
  - Any external delivery-state API/readout requires a separate
    OpenAPI/generated-client gate.
  - Admin/global notification policy APIs and admin UI are not implemented.
  - Notification deep-link/mobile UI implementation remains #371 and is still
    open/Figma-reference-gated even though #452 closed the UX/reference
    planning gate.
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
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
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
