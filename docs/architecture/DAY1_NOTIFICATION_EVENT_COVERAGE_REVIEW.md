# Day 1 Notification Event Coverage Review

## Purpose

This is a docs/control architecture review packet for GitHub issue
[#369](https://github.com/tommytang213/Settleora/issues/369), `Complete Day 1
in-app notification event coverage`, under parent epic
[#368](https://github.com/tommytang213/Settleora/issues/368), `E9
Notifications`.

This document does not implement notification event coverage. It does not
complete #369, #368, or Day 1 notification acceptance. It does not implement
push, email, deep links, mobile UI, provider workers, digest scheduling,
background delivery, delivery receipts, admin/global policy, device-token
lifecycle, or security-event suppression policy.

The purpose is to make the Day 1 event-family coverage boundary explicit before
future runtime work expands notification event types, writers, OpenAPI enums,
generated clients, tests, or UI behavior.

## Target Reference Gate

[Notification target reference gap review](NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md)
is the narrower #369 control gate for remaining event families that need safe
linked-resource IDs. Current notification rows support bill, bill revision,
settlement request/payment, recurring template/occurrence, group, recipient,
actor, OCR review, receipt attachment file, sync operation, and route-like
action URL references. They do not support auth audit/session/security event,
item claim, provider delivery, digest, or admin policy references as first-class
notification targets.

[OCR notification source-state review](OCR_NOTIFICATION_SOURCE_STATE_REVIEW.md)
is the narrower #570 source-state gate for OCR notification runtime. It records
that the current receipt OCR review `provisional` and `reviewed` states are
client/user-submitted review data, not a safe cross-user `ocr.needs_review`
source event, and that `ocr.completed`/`ocr.failed` remain blocked until server
OCR worker/runtime source states exist.

[OCR needs-review notification source policy](OCR_NEEDS_REVIEW_NOTIFICATION_SOURCE_POLICY.md)
is the follow-on #570 design gate. It recommends an explicit API-owned OCR
review assignment/source-state transition with a responsible editor,
recipient/self-notification rules, safe target references, and future validation
expectations before `ocr.needs_review` notification runtime.

OCR, sync/offline, and auth/session/security event constants or runtime writers
must not be added by hiding target identity in `safeSummary`, overloading
unrelated subject types, or relying only on opaque action URLs. OCR target IDs
are now present, but OCR still needs the source-state gate satisfied before
runtime. Sync has only the narrow persisted-conflict runtime slice. Auth/session
security notifications need manual auth-security policy first, then safe
target-reference design. Item claim/split notifications remain blocked on
source claim runtime and #371/Figma/deep-link references.

## Current Completed Slices

- #367 implemented the recurring due-soon in-app notification path. The current
  API writes `recurring_bill.due_soon` notifications from authorized recurring
  forecast reads for visible active forecasted occurrences only. It is
  idempotent for the same recipient/template/due-date readout and does not
  create bills, occurrence truth, settlements, payments, provider delivery, or
  financial truth.
- #370 implemented persisted current-user notification preferences. Current
  preferences persist in-app/category readout state for the authenticated user,
  require sync/security visibility, and store quiet-hours and
  `immediate`/`digest_readout` readout preferences. They do not implement
  server-side filtering, suppression, digest workers, quiet-hours deferral,
  email, push, device tokens, provider policy, group mute, admin/global policy,
  or mobile UI persistence wiring.
- The current in-app foundation includes guarded current-user
  list/summary/read/archive endpoints, safe notification metadata, bounded
  response shape, and tests for current-user visibility, read/archive behavior,
  safe fields, schema constraints, and writer safety.

## Architecture Boundaries

The source API/domain service that owns the business state owns notification
eligibility. Notification creation is a consequence of an authorized domain
event, not a separate authority layer.

- API/domain owns recipient eligibility, authorization, business state, money
  status, storage access, and audit.
- Workers and provider adapters may deliver approved jobs later. They must not
  decide recipient eligibility, business truth, money state, OCR acceptance,
  storage authorization, sync acceptance, or audit truth.
- Clients may render notifications, preferences, local cache, and navigation
  hints. They must not decide notification authorization from UI state, cached
  rows, hidden controls, route availability, generated-client methods, or local
  notification metadata.
- Opening a notification must reauthorize the linked resource through the API.
  Notification visibility is not proof that the linked bill, settlement, OCR
  review, sync operation, security event, or file is still visible.
- Read/archive state is inbox state only. It must not mutate bills,
  settlements, payments, proof, OCR reviews, recurring templates, generated
  drafts, sync operations, auth/session state, security policy, storage files,
  source audit, or money truth.
- Notification payloads, provider payloads, audit metadata, logs, and external
  snippets must not expose storage internals, file bytes, raw OCR/receipt text,
  provider payloads, tokens, secrets, raw payment details, private notes,
  unauthorized resource details, hidden participant data, or unrelated user
  data.

## Event Family Inventory

| Family | Owner and requiredness | Safe payload and exclusions | Current repo state | Missing pieces and future issue split |
| --- | --- | --- | --- | --- |
| Bills and bill revisions/approvals | Expense bill workflow and bill revision domain services. Required for shared bill submission, participant accept/reject/confirmation, revision proposal/resubmission/submission/withdrawal/approval/rejection/payer-confirmation/apply. Money-impactful where financial state, approvals, payer confirmation, or revision apply are involved. | Safe IDs: recipient, safe actor, group, expense bill, revision IDs. Exclude itemized receipt/OCR lines, private notes, storage details, hidden shares, payment details, raw request bodies, and unauthorized participant data. | Implemented event constants and tests exist for bill workflow and bill revision notification writes. Current bill workflow endpoint tests prove `bill.submitted`, `bill.participant_accepted`, `bill.participant_rejected`, and `bill.confirmed` writes after successful authorized personal/group transitions, with pending-participant or creator recipient selection, self/unrelated-user suppression, route-like action URLs, bounded bill/group/revision metadata, and no writes for covered conflict/unauthenticated/unavailable paths. Current bill revision endpoint tests prove successful authorized `bill.revision_proposed`, `bill.revision_resubmitted`, `bill.revision_submitted`, `bill.revision_withdrawn`, `bill.revision_approved`, `bill.revision_rejected`, `bill.revision_payer_confirmed`, and `bill.revision_applied` writes to pending reviewers, payer-confirmation users, creator, owner, affected participants, and payers as applicable; they assert actor self-notification filtering, unread status, priority, subject type, title/message keys, safe summary, route-like action URL, bill/revision/group IDs, absence of settlement/recurring metadata, bounded sensitive-content exclusions, no writes for covered failed mutation paths, and linked-resource authorization recheck despite notification visibility. Current OpenAPI enum includes bill workflow/revision types. | Split future work for remaining bill updated/financially-impactful edit/acknowledgement/correction/dispute coverage only when exact source runtime transitions exist. Add future tests for any new source states, idempotency where retryable source actions exist, and no money/source mutation from read/archive. |
| Item claim, split, and creator-review handoffs | Expense bill split/claim workflow services. Required when claim conflicts, unresolved states, or creator review need user action. Money-impactful because claim acceptance affects shares. UI/Figma-gated for claim review screens. | Safe IDs: bill, group, safe actor, recipient, stable claim/item IDs only when already bill-visible. Exclude OCR item text, hidden amounts, assignment matrices, private notes, receipt files, and unreviewed financial summaries. | Taxonomy documents representative item-claim events, but current API constants/OpenAPI enum do not expose item-claim event types and no runtime claim notification writer was found. | Create a small item-claim notification runtime issue after claim/split source states are implemented. Add exact event enum values, source-domain writer, OpenAPI/client regeneration only with runtime event types, and tests for conflicts, unresolved claims, owner review, and read/archive non-resolution. |
| Settlements, payment requests, proof/review/dispute/mismatch | Settlement request/payment/proof services. Required for request created, marked paid, partial paid, confirmed, disputed, cancelled, and proof attached. Money-impactful and storage/privacy-impactful for proof. | Safe IDs: settlement request/payment, group, already-visible bill, stable proof file ID only through authorized proof APIs. Exclude raw payment handles, QR contents, account numbers, proof contents, bank screenshots, storage object keys, hidden bill lines, and unbounded amount/payment details in external snippets. | Implemented settlement constants, writer helpers, endpoint integrations, and endpoint tests now cover `settlement.request_created`, `settlement.payment_marked_paid`, `settlement.payment_partially_paid`, `settlement.payment_confirmed`, `settlement.request_disputed`, `settlement.payment_disputed`, `settlement.request_cancelled`, `settlement.payment_cancelled`, and `settlement.proof_attached` writes after successful authorized transitions. OpenAPI enum includes settlement request/payment/proof events. | Add focused settlement follow-ups for any Day 1 mismatch/residual/review states not yet mapped. Tests must continue to prove counterparty derivation, no unauthorized recipient/event leaks, proof authorization on open, and no settlement/payment/proof mutation from notification read/archive. |
| OCR receipt review/apply/provisional/manual-correction handoffs | Receipt OCR review intake, future OCR job, and API validation services. Required for failed/needs-review/completed server OCR states where user action is expected. Money-impactful when OCR apply changes draft or revision candidates; storage/privacy-impactful because receipt/OCR content is sensitive. UI/Figma-gated for review flows. | Safe IDs: bill, attachment file ID only through authorized attachment metadata, OCR review ID, group, safe job/correlation ID. Exclude raw OCR text, receipt text, images, file bytes, storage internals, itemized extracted lines, hidden amounts, and worker debug output. | #570 implements the narrow `ocr.needs_review` runtime for explicit API-owned OCR review assignment/source-state transitions only. Creating a new active needs-review assignment or retargeting to a different authorized recipient writes one unread attention notification with `receipt_ocr_review` subject type, safe bill/group/review/attachment IDs, and a route-like OCR review action URL. Duplicate same-recipient assignment, actor self-assignment, completion/cancellation, plain OCR review save/read/list/apply-preview/apply/remove, assignment visibility, and generated-client availability do not write OCR notifications. `ocr.completed` and `ocr.failed` remain absent because server OCR worker runtime is not implemented. | Future OCR notification work should add completed/failed or worker/upload handoff events only when exact server OCR job/result source states exist. Non-draft OCR-to-bill changes must remain under revision policy. #371 remains separate for mobile/deep-link UI behavior. |
| Recurring due-soon and generated draft/confirmation handoffs | Recurring bill template, forecast, and explicit draft-generation services. Due-soon visibility is required; generated draft handoff is required where another actor creates a draft or confirmation is needed. Money-impactful when draft generation creates a bill, but notifications do not create financial truth. | Safe IDs: recurring template, occurrence, generated bill where visible, group, safe actor. Exclude raw template payload JSON, private notes, hidden participants, payment details, worker internals, and future private bill details. | #367 implemented `recurring_bill.due_soon`. Current API tests now also cover existing `recurring_bill.draft_generated` behavior for explicit draft generation: successful group-member generation writes one unread normal-priority notification to the template owner with actor, `recurring_bill_occurrence` subject, title/message keys, route-like generated-bill action URL, group/template/occurrence/generated-bill IDs, no settlement/proof/OCR/provider/token/private template metadata, no read/archive timestamps, and linked bill reauthorization through the generated route. Current owner-generated personal draft behavior suppresses self-notifications through the existing writer. Repeating generate-draft for the same occurrence returns the existing draft and does not write a duplicate notification. Covered unauthenticated, unavailable, invalid, and conflict generate-draft paths do not write recurring draft notifications. OpenAPI enum includes due-soon and draft-generated. | Future recurring notification issues should cover generation skipped/failed only when skip/failure runtime exists, plus confirmation UX/deep-link handoff under #371. Tests must preserve forecast-read non-mutation and draft-generation API/domain authority. |
| Sync/offline conflict and failure handoffs | Sync acceptance and offline queue services. Required for conflicts and failures needing user action. Security-impactful where sync touches auth, storage, money, or server/local boundaries. UI/Figma-gated for conflict/failure states. | Safe IDs: sync operation ID, bounded correlation/hash, target type, safe target ID only when already visible. Exclude raw queued request body, local mutation payload, local file paths, local cache data, hidden server current data, storage internals, and unrelated user data. | #571 implements the first narrow sync runtime slice for existing persisted `SyncOperation` conflict rows only. Newly persisted stale-base-version and resource-state conflicts write one unread `sync.conflict_detected` in-app notification to the owning/current actor, with attention priority, `sync_operation` subject type, first-class `syncOperationId`, safe `expenseBillId` where the operation already targets an authorized expense bill, and a route-like `/api/v1/sync/operations/{syncOperationId}` action URL. The new read endpoint is current-actor-only and returns the bounded sync operation response without idempotency keys, request payload hashes, raw payloads, local paths/cache data, hidden server-current data, storage internals, OCR text, tokens, or unrelated user data. Accepted operations, rejected operations, invalid requests, idempotency-key mismatch responses that do not persist a new conflict row, and replayed existing operations do not write sync conflict notifications. | Broader `sync.operation_failed`, `sync.operation_queued`, `sync.conflict_resolved`, retry behavior, conflict resolution behavior, mobile deep links/UI, and broad offline-sync expansion remain future work. Add future runtime only when exact source states exist and recipient/action semantics are reviewed. |
| Auth/session/security-impactful events | Auth/session/security policy services. Required for new device/session, session revocation, password/MFA/passkey/recovery/policy/account-impact events where policy says user/admin visibility is necessary. Security-impactful and manual-gated. UI/Figma-gated for security/session detail screens and #371 deep links. | Safe IDs: auth audit event, safe auth session ID for the account owner, recipient, safe actor, bounded policy ID. Exclude session tokens, refresh/reset tokens, recovery codes, passwords, MFA secrets, passkey private material, provider tokens, exact abuse identifiers, full IP history, unbounded user agents, and provider payloads. | Auth/session runtime foundations exist, but notification event constants/OpenAPI enum do not include security/session event types and no security notification writer was found. Preferences require sync/security visibility but do not generate security notifications. | Create a security/session required-event review issue before runtime. Each event requires explicit policy for recipient, suppression/bypass behavior, audit source, external snippet safety, and tests for secret redaction, authorization, and source-audit separation. |

## Remaining Work For #369

#369 remains open. The future runtime should be split into small issues rather
than one broad event-coverage PR:

1. Bills/revisions/approval event gap closure for exact missing bill lifecycle
   states.
2. Item claim, split, and creator-review event coverage after claim source
   runtime is available.
3. Settlement/payment/proof/residual or mismatch event gap closure for exact
   implemented source states.
4. Future OCR completed/failed or worker/upload-handoff notification runtime
   only after exact server OCR job/result source states exist. Current
   `ocr.needs_review` runtime is limited to explicit API-owned assignment
   transitions; non-draft OCR remains under bill revision policy.
5. Remaining sync notification events after exact persisted source states exist:
   `sync.operation_failed`, queued/readout events, conflict resolution, retry,
   and broader conflict/failure UX remain unimplemented after the #571
   persisted-conflict-only slice.
6. Security/session required-event review before any auth/session notification
   runtime.
7. Schema/OpenAPI/generated-client enum expansion only when exact runtime event
   types are implemented and the target-reference gate is satisfied.
8. API tests and acceptance evidence for every new event family slice.

#371 remains open and Figma-gated for notification deep links/mobile UI.
Deep-link work should route to authorized destination APIs and must avoid
leaking record existence through stale, missing, or unauthorized notification
targets.

Push/email delivery, provider workers, digest scheduling, background delivery,
delivery receipts, and admin/global policy remain out of scope unless a future
issue explicitly implements them.

## Future Validation Expectations

Every future #369 runtime slice should prove:

- API/domain recipient derivation and authorization filtering.
- Idempotency for repeat source actions or retryable notification writes.
- No unauthorized recipient/event leaks.
- Bounded metadata with safe subject IDs only.
- No raw OCR, receipt, storage, payment, provider, token, secret, private note,
  or unauthorized resource details in payloads, logs, audits, tests, or snippets.
- No fake push/email success and no provider-success claims unless a provider
  delivery slice actually implements that state.
- Notification read/archive never mutates source money, settlement, payment,
  OCR, recurring, sync, storage, auth/session, or audit state.
- Linked resources are reauthorized through their own API paths when opened.
- OpenAPI is changed only for exact implemented event types, and generated
  web/Dart clients are regenerated only from OpenAPI with reviewed diffs.
- Required/security-impactful behavior, mute/digest bypass, and external
  snippets are implemented only after explicit reviewed policy.

## Non-Pass Statement

This review packet is not a pass for #369, #368, or Day 1 notification
acceptance. It is an architecture/control gate that records the safe event
family breakdown and future validation expectations. Runtime implementation,
issue closure, PR creation, OpenAPI/client changes, schema changes, UI/Figma
work, provider delivery, workers, digest scheduling, security suppression, and
mobile deep links remain separate future work.
