# User Web Bills, Groups, Friends, And Direct-Sharing Implementation Plan

## Status

Planning/control gate for issue #459 under parent #373.

This plan does not implement runtime UI, API behavior, OpenAPI contracts,
generated clients, schema/migrations, auth/session/security behavior,
storage/file-byte behavior, money/settlement/bill calculation logic, Docker,
deployment, CI, environment configuration, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [User web reference V1](../design/web/WEB_USER_REFERENCE_V1.md)
- [Mobile design references](../design/mobile/README.md)
- [Day 1 UX reference decisions](DAY1_UX_REFERENCE_DECISIONS.md)
- [Day 1 UX implementation readiness plan](DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Expense, bill, split, and settlement architecture](../architecture/EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Bill revision approval and payer reconfirmation policy](../architecture/BILL_REVISION_APPROVAL_POLICY.md)
- [Bill revision settlement impact and audit matrix](../architecture/BILL_REVISION_SETTLEMENT_IMPACT_AUDIT_MATRIX.md)
- [Friends and direct sharing API policy](../architecture/FRIENDS_DIRECT_SHARING_API_POLICY.md)
- [Direct bill sharing authorization model](../architecture/DIRECT_BILL_SHARING_AUTHORIZATION_MODEL.md)
- [Temporary participant claim and link flow](../architecture/TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md)
- [Storage file metadata architecture](../architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](../architecture/STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](../architecture/PRIVACY_VAULT_ARCHITECTURE.md)

## Current Source State

PR #580 merged the first `apps/web-user` React/Vite authenticated shell,
navigation foundation, and auth-required/session-boundary presentation. That
shell is the starting point for future user-web bills, groups, friends, and
direct-sharing runtime slices.

The generated web client currently exposes personal bill, group, group member,
bill attachment, OCR review, bill revision, reconciliation, settlement
candidate, and settlement request methods. It does not expose friends,
friend-request lifecycle, direct friend sharing, direct-share eligibility, or
temporary participant claim/link methods.

Web clients must treat generated client methods as transport helpers only. They
must not calculate or decide authoritative money, settlement truth, bill
revision impact, authorization, current-user identity, file/storage access,
privacy policy, sync acceptance, or audit truth.

## Screen And State Inventory

| Surface | Day 1 user-web states to plan | API/contract posture |
| --- | --- | --- |
| Bills list | Personal bill table/list, search, date/status/currency/merchant/archive/reconciliation filters, receipt/OCR indicators, pending review indicators, draft/confirmed/rejected/archived states, empty/loading/error/denied/session-expired states. | Use existing `listPersonalBills` and generated query filters. Export/import controls belong to #461 even if bill filters are shared. |
| Bill detail | Overview, merchant/date/category/total/currency, items, participants, payers, adjustments, status, archive/restore readout, reconciliation readout, attachment summary, OCR review handoffs, revision list, settlement candidate/readout links, activity-safe placeholders. | Use existing `getPersonalBill`, attachment, revision, settlement-candidate, settlement-request, archive/restore, reconciliation, submit, participant accept/reject methods. Do not invent missing fields. |
| Create bill | Guided form for personal bill creation with amount/currency, merchant/date/category, participants, payers, split inputs, and draft submission. Include validation errors, policy-denied states, unsupported advanced split disclosures, and safe cancel/dirty-form behavior. | Existing `createPersonalBill` and `createGroupBill` can be used for supported request shapes. Any richer item/split/tax/direct-share fields absent from OpenAPI require future contract work. |
| Edit bill | Draft-safe edit where supported, and correction proposal/revision entry point for confirmed/rejected bills. Direct silent edits to accepted financial truth are not allowed. | No public `PATCH /api/v1/bills/{billId}` or group equivalent exists. Use bill revision proposal endpoints for supported correction flows; future edit contracts require OpenAPI/client manual gate. |
| Shared/group bill surfaces | Group bill list/detail, group-scoped bill create, group bill attachments, group participant accept/reject, group archive/restore, group settlement candidate/request handoffs. | Use existing `listGroupBills`, `getGroupBill`, `createGroupBill`, group bill attachment, group bill workflow, and group settlement methods. |
| Bill revision/review | Revision list, create proposal, submit, revise/resubmit, withdraw, approve, reject, payer confirmation, apply eligibility, review context, snapshot, settlement impact, terminal states. Show server-provided changed-only markers, limitations, and settlement blocks. | Existing revision endpoints and generated methods are available for personal bills. The UI must render `review-context`, `snapshot`, and `settlement-impact`; it must not compute affected users, payer truth, apply eligibility, or settlement impact. |
| Receipt/file attachments | Attach receipt/supporting file, list attachment metadata, view/download content where authorized, remove attachment, OCR review read/upsert/remove, apply-preview, draft-only apply, assignment read/upsert/complete/cancel, upload denied/too-large/unsupported/read failure states. | Existing personal/group bill attachment and OCR review endpoints are purpose-specific. There is no generic public file API. Web upload must obey storage/file policy and API authorization. |
| Groups list | Group list, create group entry, search/filter local presentation where supported, empty/loading/error/denied/session-expired states. | Use existing `listGroups` and `createGroup`. |
| Group detail/member readouts | Group summary, members, roles/status readouts, add/update/remove member flows, group bill list handoff, empty/error/denied states. | Use existing `getGroup`, `updateGroup`, `listGroupMembers`, `addGroupMember`, `updateGroupMember`, and `removeGroupMember`. Member role/status UI renders server response only. |
| Friends discovery/request states | Exact-match discovery, outbound request, inbound request, accept/decline/cancel, unfriend/block, blocked/unavailable, rate-limited, policy-disabled, no global directory. | Future OpenAPI/generated-client work required. Existing docs define policy only; no generated methods exist. |
| Direct-sharing states | Eligibility readout, accepted-friend share, approved group/shared-context share, denied relationship states, stale-cache conflict, bill-state-not-shareable, money-impact-requires-revision, file/payment-detail boundary warning. | Future OpenAPI/generated-client work required. Existing group bill create/list/detail can cover group-context bills, but standalone direct friend sharing is not implemented. |
| Temporary participant claim/link readouts | Placeholder participant display, unclaimed, claim pending, linked provenance, rejected/expired/conflict, no account authority, no broad access, safe invitation/token states. | Future OpenAPI/generated-client and likely schema/runtime work required. Current docs are planning only. |
| Empty/loading/error/policy-denied | Every list/detail/form/review/file state needs stable skeleton/loading, honest empty copy, retryable and non-retryable errors, safe denied/not-found copy, unsupported feature readouts, and no implementation details. | Can be implemented in web UI without new backend behavior when driven by existing API response categories. New problem shapes require contract work. |
| Auth-required/session-expired | Auth-required landing inside app shell, expired/revoked session readout, retry/sign-in handoff placeholder, protected data hidden while unauthenticated. | Continue #458 shell pattern. Future real web sign-in/token persistence remains separate auth/security gated work. |

## API And Contract Mapping

### Existing Surfaces Usable Now

Future web runtime slices may use the current generated client for:

- Personal bills: list, create, get, submit, accept participant, reject
  participant, archive, restore, reconciliation update, settlement candidates,
  and settlement request creation.
- Group bills: list, create, get, submit, accept participant, reject
  participant, archive, restore, reconciliation update, settlement candidates,
  and settlement request creation.
- Bill attachments: list, attach receipt/supporting file, remove, and content
  read for personal and group bills.
- Bill-scoped OCR review: get/upsert/remove review, apply-preview, draft-only
  apply, assignment get/upsert/complete/cancel for personal and group bills.
- Bill revisions: list, create proposal, get, revise/resubmit, submit,
  withdraw, approve, reject, payer confirmation, apply, review context,
  snapshot, and settlement impact.
- Groups: list, create, get, update, list members, add member, update member,
  and remove member.

### Missing Or Future Contract Work

The following need explicit future API/OpenAPI/generated-client tasks before
runtime UI can become feature-complete:

- Public personal/group bill edit endpoints beyond current create, workflow,
  archive/restore, reconciliation, and revision proposal surfaces.
- Rich create/edit support for full Day 1 item-level splits, quantity claims,
  multi-tax/fee/discount/refund handling, manual FX snapshots, and temporary
  participant payloads where absent from current request schemas.
- Friends exact-match discovery, friend request lifecycle, unfriend/block,
  relationship state readouts, and abuse/rate-limit response categories.
- Standalone direct bill sharing and direct-share eligibility outside existing
  group bill context.
- Temporary participant placeholder creation, claim invitation, claim review,
  approval/rejection, link/provenance, expiry/revocation, and conflict readouts.
- Any new problem response categories or policy readouts needed for precise web
  denied/blocked UI if current responses are insufficient.

OpenAPI remains the source of truth for those future contracts. Generated
clients must be regenerated through the repo workflow and never hand-edited.

### Client Authority Boundary

User web may format, filter visible lists, hold form state, show previews, and
render server responses. It must not:

- Calculate authoritative split, settlement, rounding, residual, revision,
  affected-user, payer-confirmation, or bill status truth.
- Infer authorization from routes, hidden controls, generated client method
  availability, cached group/friend state, possession of IDs, or visible links.
- Expose direct filesystem paths, storage object keys, provider URLs,
  storage internals, vault internals, file bytes, raw OCR text, secrets, tokens,
  raw request bodies, or unrelated sensitive user data.
- Treat friend status, group membership, payment-detail visibility, or
  temporary participant linkage as a generic permission grant.

## Implementation Slicing

Keep #459 runtime implementation split into small branches. Recommended order:

| Order | Slice | Suggested branch | Existing issue coverage | Gates |
| ---: | --- | --- | --- | --- |
| 1 | Bills list/detail read-only plus existing workflow actions and safe states | `feature/user-web-bills-readout-459` | #459 | Web visual evidence; auth/session boundary; no new contract if using existing generated methods. |
| 2 | Group list/detail/member readouts plus group bill list/detail handoffs | `feature/user-web-groups-readout-459` | #459 | Web visual evidence; auth/current-user and group authorization readouts; no new contract if using existing generated methods. |
| 3 | Receipt/supporting attachment metadata, upload handoff, content read, remove, and OCR review assignment/readout states | `feature/user-web-bill-attachments-459` | #459 | Storage/file privacy manual gate for runtime; visual evidence for upload/error/denied states. |
| 4 | Bill revision review, review context, settlement impact, approve/reject/payer-confirm/withdraw/apply action states | `feature/user-web-bill-revision-review-459` | #459 plus bill revision architecture docs | Money/settlement manual gate for action runtime; visual/human review strongly required. |
| 5 | Create bill form for currently supported personal/group bill request shapes | `feature/user-web-bill-create-459` | #459 | Money/manual gate if form submits financial writes; visual/human review strongly required. |
| 6 | Edit/correction proposal entry and supported revision proposal form | `feature/user-web-bill-corrections-459` | #459 | Money/settlement/OpenAPI gates depending supported fields; visual/human review strongly required. |
| 7 | Friends/direct-sharing planning-to-contract slice | `feature/friends-direct-sharing-contract-split-459` | Parent #373/#459 and friends/direct-sharing architecture docs | OpenAPI/generated-client, auth/security, privacy, and abuse-policy manual gates. |
| 8 | Temporary participant claim/link planning-to-contract slice | `feature/temporary-participant-claim-contract-split-459` | Parent #373/#459 and temporary participant architecture doc | OpenAPI/generated-client, auth/security, privacy, storage, and money/history manual gates. |

Recommended first runtime slice after this plan: bills list/detail read-only
plus existing personal/group bill workflow readouts from current generated
client methods. It is the smallest branch that validates the #580 shell against
real domain transport without introducing new OpenAPI or direct-sharing
contracts.

Do not create a mega-PR that combines bills, groups, attachments, revision
review, friends, direct sharing, temporary participant claim, and create/edit
runtime.

## Manual Gates

- Money/split/rounding authority: required before any create/edit/revision UI
  submits or previews authoritative financial effects beyond rendering current
  API responses.
- Auth/security/current-user: required before adding real web sign-in, token
  persistence, session refresh behavior, route authorization policy, or
  current-user-sensitive runtime beyond the #458 presentation seam.
- Storage/file privacy: required before web upload/content rendering branches
  touch receipt/supporting attachment bytes, OCR review handoffs, retention,
  normalization, vault, or file-denied behavior.
- OpenAPI/generated-client: required before adding or changing friend,
  direct-share, temporary participant, bill edit, richer split/item/tax, or
  problem-response contracts.
- Visual evidence/human UI approval: required for material web UI branches.
  Stronger review is required for create/edit bill, revision review, receipt
  upload/file handling, direct-share discovery, and temporary participant
  claim/link flows.

## Reference And Figma Posture

Use the merged [User web reference V1](../design/web/WEB_USER_REFERENCE_V1.md),
approved mobile references, and approved web shell screenshots from #580.

No new Figma is required by default for derivative list/detail shells,
straightforward split-pane layouts, ordinary empty/loading/error states, or
server-rendered read-only tables that follow the user-web reference.

Strong reference or human review remains required before runtime branches for:

- create/edit bill flows that shape money-impacting user intent
- bill revision review and settlement-impact actions
- receipt/supporting attachment upload, content, remove, OCR review, and file
  failure states
- direct-share discovery, friend request, block/unfriend, and stale/denied
  relationship states
- temporary participant claim/link, invitation/token, provenance, and conflict
  states

Material web UI PRs must include branch-rendered desktop and responsive visual
evidence, plus state evidence for changed empty, loading, error, denied,
disabled, warning, and unsupported states.

## Acceptance And Close Recommendation For #459

#459 can be closed as planning satisfied after this docs/control PR is merged,
provided the PR validation and scope guard pass and the issue comment links the
merged plan. Closing #459 would not close #373, #460, #461, or downstream
runtime/API/OpenAPI/UI implementation work.

If the docs PR does not merge, #459 should remain open. No missing planning
item is known from the current repository state.

## Issue Cleanup

No new issues are created by this plan.

Existing issue coverage is sufficient:

- #459 covers the bills/groups/friends/direct-sharing planning gate and can be
  the parent for focused runtime branches listed above.
- #460 covers settlement, notifications, profile, payment details, QR/proof
  file handoffs, and visibility warnings.
- #461 covers reports, search, export, import, and local-mode surfaces.
- #373 remains the user-web Day 1 parent epic.
- Friends/direct-sharing architecture is already covered by the merged policy
  docs and their parent planning lineage; future runtime should create focused
  OpenAPI/API/UI child issues only when the implementation task is ready to
  scope exact contracts.

Creating duplicate child issues now would add planning noise without removing a
runtime blocker. Future issue creation should happen only when a branch needs a
specific contract/runtime/UI slice not covered by #459, #460, #461, or #373.
