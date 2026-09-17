# Group Membership And Historical Participant Lifecycle Policy

Issue: [#720](https://github.com/tommytang213/Settleora/issues/720)

Parent chain: [#716](https://github.com/tommytang213/Settleora/issues/716) →
[#717](https://github.com/tommytang213/Settleora/issues/717) → #720; shared
template: [#960](https://github.com/tommytang213/Settleora/issues/960).

## 1. Decision, Scope, And Authority

This document defines the Day 1 lifecycle policy and implementation handoff for
groups, registered-user memberships, temporary participant references, and the
historical identity references that connect people to bills and settlements. It
reconciles repository source at `097dfc23e2064acc413aba654690b829008e0c34`
(tree `d435e8976da5287ac637c8d6ffff7ea136eeb43c`) and live issue state
reverified on 2026-09-17 UTC.

This is a documentation-only planning contract. It does not change runtime,
accepted authorization or privacy semantics, product requirements, Day 1
scope, schema, migration, API/OpenAPI, generated clients, UI/Figma,
notification delivery, account linking, money, files, deployment, retention,
or destructive behavior. A statement labelled **future acceptance
requirement** is a condition for later implementation, not current behavior or
authorization to implement it.

In server mode, API/domain services own group and membership transitions,
authorization, role rules, audit, notification acceptance, and record access.
Clients may present server results; hidden controls, route presence, cached
membership, local lists, and stable IDs never confer authority. Local-only
personal records may be authoritative within their local application/domain
boundary, but accepted Day 1 authority explicitly excludes friends, groups,
memberships, and server collaboration. `LOCAL-GRP/MEM/HIST-*` therefore records
group non-applicability rather than inventing a local group lifecycle;
`LOCAL-PART-*` separately preserves accepted local person/participant candidate
authority without creating server collaboration authority.

[The financial lifecycle policy](../architecture/BILL_SETTLEMENT_RECORD_LIFECYCLE_POLICY.md)
owns bill, split, payer, settlement, and money state. This policy owns only the
membership-status and historical-person-reference dependency: participation
changes never rewrite those financial facts. [The file lifecycle
policy](../architecture/STORAGE_FILE_LIFECYCLE_POLICY.md) owns file objects,
links, bytes, and disposition. [The auth/security lifecycle
policy](../architecture/AUTH_SECURITY_LIFECYCLE_POLICY.md) owns accounts,
identities, credentials, and sessions. Notification event production,
delivery, preferences, and retained notification history remain in their
notification lanes. None of those domains is redefined here.

This policy records the **group-invitation relationship** only because it is a
possible membership-entry dependency. Account-registration invitation state,
one-time material, identity proof, credential/security behavior, and delivery
remain #721/auth/identity/notification-owned. No `INV-*` row authorizes either
group-invitation or account-invitation runtime.

## 2. Evidence Classification And Vocabulary

Every material statement uses one of four classes:

- **Implemented current fact:** proved by current source, schema, API, OpenAPI,
  or tests. Runtime truth remains current fact when prose differs.
- **Documented accepted requirement:** already established by merged repository
  authority or the accepted #720 contract, but not necessarily implemented.
- **Future acceptance requirement:** safety evidence a later focused change
  must provide; it does not choose an unresolved behavior.
- **Unresolved product/privacy/authz choice:** current authority does not answer
  the question. The affected future transition remains blocked and current
  runtime is not broadened until its owner and manual gate decide it.

The #960 terms apply unchanged. In this policy:

- **active group** means a group without the current `DeletedAtUtc` exclusion;
  current source has no explicit status enum or archive/reactivate endpoint.
- **archived group** is the proposed user-facing term for a reversible inactive
  group. It must not be inferred merely from the existence of `DeletedAtUtc`.
- **active membership** is the only current membership state eligible for group
  access and current group-member operations.
- **default-excluded membership** means retained membership that is omitted
  from future participant defaults. It is distinct from leaving and removal.
- **left membership** means voluntary or accepted departure from new group
  activity. It is distinct from removal and historical access.
- **removed membership** is the current logical tombstone produced by the owner
  removal endpoint. It is not physical deletion.
- **historical participant reference** is a stable identity/reference retained
  by an already-created bill, item split, payer row, revision, settlement,
  allocation, residual, audit, or related accepted record. It is not a current
  membership and grants no blanket future access.
- **reactivate / re-enter** means a separately accepted return to a named
  future-eligible state. It never means rewriting history or silently restoring
  access, notifications, roles, or defaults.

## 3. Reconciled Current Facts And Contradictions

### 3.1 Groups and memberships

- `UserGroup` persists stable ID, creator, timestamps, name, and nullable
  `DeletedAtUtc`. Current group endpoints implement create, list, get, and
  rename only; no group archive/reactivate mutation exists.
- Group creation atomically creates one `active` `owner` membership for the
  authenticated creator. Current group reads and owner actions require a
  non-deleted group and an `active` membership.
- `GroupMembershipStatuses` and the database/OpenAPI contract admit only
  `active` and `removed`. The composite `(GroupId, UserProfileId)` key preserves
  one membership row per registered profile/group pair.
- Active owners may add an existing active registered user, change an active
  membership between `owner` and `member`, and mark an active membership
  `removed`. Adding is rejected when either an active or removed row already
  exists. Removal updates the row; it does not hard-delete it.
- Last-active-owner demotion and removal return conflict in a sequential call,
  but the count-then-write has no concurrency token or atomic status-qualified
  owner-floor update. Two concurrent owners can each observe two owners and
  both demote/remove, leaving zero; `MEM-CHOICE-011/014` owns that race. Removed
  actors cannot access group/member endpoints, removed rows are omitted from
  member lists, and no restore/reactivation endpoint exists.
- Membership writes also lack an expected version or atomic prior-state and
  actor-authority predicate. Concurrent changes to the same membership can
  both commit with last-writer state and duplicate success audits; an owner
  whose authority is revoked after the initial authorization check can still
  complete an in-flight add, role change, or removal. `MEM-CHOICE-011` owns
  both stale-actor and same-target races.
- Group rename is implemented for active owners, but its authorization and
  tracked-group load precede an unversioned save. A concurrently removed owner
  can therefore commit an in-flight rename, and concurrent names can
  last-write-win. Rename has no lifecycle audit event. `GRP-004` and
  `MEM-CHOICE-011` carry this implemented transition and its mechanics gaps.
- The owner floor counts status-active owner memberships without proving that
  their account/profile remains able to act. Account disable, account/profile
  deletion, and later account re-enable do not transition the membership. A
  sole stored owner can therefore strand management or silently regain owner
  authority when auth availability returns; the intended cross-domain effect
  is unresolved under `MEM-CHOICE-014` and #721.
- Successful add, role update, and removal write `group_member.added`,
  `group_member.role_updated`, and `group_member.removed` auth audit events.
  Metadata is bounded to workflow, group/member IDs, and role/status categories.
  Current code does not audit every denial, conflict, or group create/rename.
- `default_excluded` and `left` are documented planning states but are absent
  from current domain constants, schema constraints, API/OpenAPI, endpoints,
  and tests. The Day 2 architecture describes their intended participation
  meaning; #720 requires them to remain distinct in this Day 1 lifecycle policy
  as future extensions, not to become Day 1 runtime scope. `MEM-003` through
  `MEM-006` therefore carry no implementation authority.
- No **group-scoped** invitation entity, create/accept/decline/cancel/expire
  transition, actor contract, endpoint, or acceptance test exists. The
  implemented `AuthInvitation` account-registration lifecycle has no group or
  membership binding and remains #721-owned. Direct owner-add is the
  only implemented membership-entry path; it is a current fact, not a decision
  that invitations are unnecessary. Repository auth and notification authority
  reserves invitation work and accepted `group.invite_created` /
  `group.invite_accepted` in-app baselines. `MEM-CHOICE-016` keeps every
  invitation actor, state effect, and membership-creation rule unresolved.

### 3.2 Historical financial references

- Current bill participant, payer, and item-split rows reference registered
  `UserProfile` IDs, and restrictive foreign keys preserve those links. Bill
  roots retain creator/owner and optional group IDs. Settlement requests retain
  debtor, creditor, requester, group, and source-bill references; payments
  retain payer, receiver, creator, and request references.
- The financial policy requires original participants, payers, splits,
  assignments, accepted revisions, request lines, allocations, residuals, and
  audit meaning to remain explainable. A membership status change is not a
  financial-record mutation and must not rewrite those identities.
- Ordinary group bill, future-bill, and recurring-template create/update/draft
  paths validate submitted participants and payers against active membership.
  Their loaders omit target `AuthAccount` status, deletion, and `DisabledAtUtc`,
  so an account-unavailable active membership remains eligible. Two stale
  reference exceptions also exist: CSV confirmation rechecks only the actor
  before materializing stored candidates, and future-bill posting rechecks only
  the posting actor before materializing stored participants/payers and sending
  pending-participant notifications. Removal after preflight or future-bill
  creation can therefore enter new draft/activity without target revalidation.
- Those ordinary active-member checks are also separate reads before the
  eventual bill/template/draft save. A concurrent membership removal can
  commit between validation and persistence, after which profile foreign keys
  do not enforce membership. Commit-time atomic membership eligibility or an
  equivalent serialization rule and race coverage remain `MEM-CHOICE-015`.
- Group CSV import-session GET and discard have a different revocation gap:
  `LoadActorSessionAsync` binds only the stored account, auth-session, and
  profile IDs. Neither path rechecks current group membership, so a removed
  creator can still read persisted review data or discard the session.
  `MEM-CHOICE-015` owns that access/mutation exception as well as confirmation.
- Current group bill reads and most group settlement reads/mutations require
  current active group membership. Settlement candidate and request-create
  group-bill queries reject the entire bill unless its creator and **every**
  participant and payer retain active group membership; an unrelated former
  participant can therefore prevent two still-active parties from settling
  their own outstanding share. Other settlement queries also require the
  debtor, creditor, and requester to retain active membership, but generally do
  not check target account availability; an account-unavailable active
  counterparty can remain eligible while unable to perform their side. Bill
  revision list/read/propose/review/apply similarly reject the entire group
  bill unless creator, owner, every participant, and every payer remain active.
  Existing tests prove removed/deleted-profile cases fail closed; account-state
  and unrelated-former-participant policy remain `MEM-CHOICE-006`.
- Conversely, group bill list/read/export, group monthly reports, and group
  bill reconciliation first authorize only the actor's current active group
  access, then query by group ID without a participant, owner, or
  membership-start boundary. A newly added active member can therefore
  immediately read/export/report over pre-membership group bills and mutate an
  unarchived bill's reconciliation status/note. These are implemented current
  exposures, not accepted historical-access or mutation decisions;
  pre-membership history policy remains `MEM-CHOICE-006`.
- That runtime is narrower than the documented requirement that a
  default-excluded or left participant may retain historical access and settle
  old balances **where separately authorized**. This document records the
  contradiction; it does not broaden current access or decide the future rule.
- Stable historical linkage is not blanket visibility. Any later historical
  read or settlement action must use record-specific, current API authorization
  and privacy checks, not membership state alone.

### 3.3 Temporary participants and notifications

- Day 1 scope accepts minimal temporary participants for practical shared bills
  and requires later account linking to preserve historical participation.
  Current bill participant/payer/split and settlement schemas require registered
  `UserProfile` references; no guest placeholder entity, claim/link contract,
  guest governance authority, or temporary-participant runtime exists.
- The Day 1 lifecycle requirement preserves a later claim/link association
  without rewriting the original placeholder or financial history. Exact
  claim/link runtime scope remains unimplemented and unresolved; fuller guest
  membership, governance, and participation polish remain Day 2. #720 records
  the preservation constraint and extension point without authorizing runtime.
- Local-only authority separately permits a local person/temporary participant
  identity and participant/share relationship as local candidate data. No exact
  lifecycle representation is implemented. Such a reference is neither a
  server account nor group membership, and any later server import/link is a
  new acceptance that must preserve local provenance rather than silently
  merge identities. `LOCAL-PART-001/002` and `MEM-CHOICE-017` preserve that
  local identity/historical-reference handoff delegated by #718.
- Current group membership transitions do not produce notifications.
  `NOTIFICATION_EVENT_TAXONOMY.md` nevertheless establishes an accepted,
  unimplemented in-app baseline for `group.membership_added`,
  `group.membership_role_changed`, and `group.membership_removed` when the
  transition affects the recipient. Recipient scoping, linked-resource
  reauthorization, preferences/mute behavior, and optional email/push remain
  notification-owner concerns and cannot be inferred from list visibility,
  access, default selection, or membership status.
- The same taxonomy reserves `group.invite_created` and
  `group.invite_accepted` as accepted, unimplemented affected-recipient in-app
  baselines. Notification read/archive never accepts, declines, cancels,
  expires, or otherwise changes an invitation or membership.

## 4. Shared Reusable-Row Contract

Sections 5.1 through 5.5 are joined by stable row ID and together provide every
field required by the #960 reusable schema. The following exact values apply to
every row unless a cell overrides them:

- **Authority mode/workspace:** `GRP-*`, `MEM-*`, `INV-*`, `GUEST-*`, and
  `HIST-*` are server mode inside one self-hosted workspace. `LOCAL-GRP-*`,
  `LOCAL-MEM-*`, and `LOCAL-HIST-*` record group non-applicability. In contrast,
  `LOCAL-PART-*` is locally authoritative candidate/reference data inside the
  local application/domain boundary and grants no server authority.
- **Decision authority and live state:** `PROGRAM_ARCHITECTURE.md` authority,
  audit, client, and privacy boundaries; `MVP_DAY1_SCOPE.md` “Shared groups,”
  “Expenses and bills,” “Notifications,” and “Soft delete and archive”;
  `GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md`; and #720, verified open on
  2026-09-17 UTC with #960/#718/#719/#721 complete. Implementation evidence is
  cited separately and never creates policy authority.
- **Authoritative boundary:** API/domain/policy services for server rows and the
  local application/domain service only for local personal records. Clients do
  not accept server transitions or derive authorization.
- **User-visible action surface:** `GRP-001` uses the current group-creation
  surface; `GRP-002/003` have no current surface and reserve future group
  settings/history; `MEM-001/002/007` use current group-member management;
  `MEM-003..006/008` have no current surface and reserve future membership
  settings/history; `INV-*` has no current surface and reserves separately
  approved invite, accept, decline, cancel, and expiry surfaces; `GUEST-001`
  has no current surface and reserves an approved
  bill create/edit flow; `GUEST-002` has no current surface and reserves the
  accepted provenance-preserving claim/link extension whose runtime/release
  lane remains unresolved; `HIST-001/002` are not independent user actions and use only
  separately authorized bill/settlement history surfaces; `LOCAL-GRP/MEM/HIST-*`
  has no surface because local group collaboration is unsupported; and
  `LOCAL-PART-*` reserves a local personal-bill participant/reference surface,
  not a server collaboration surface. These names prove no control exists.
- **Preconditions:** authenticated current actor where user-visible; current
  actor authority; exact current group, membership, role, account/identity, and
  record state; last-owner safety; no duplicate/conflicting membership; current
  policy; dependency checks; expected version/concurrency proof; and explicit
  confirmation where a future accepted action has material consequences.
- **Historical-reference impact:** every row preserves original bill
  participants, payers, item splits/assignments, revision evidence, settlement
  parties/lines/payments/allocations/residuals, stable identity linkage, and
  audit. Status changes never rewrite them.
- **Persisted lifecycle metadata:** stable subject ID, old/new state, actor,
  accepted-at UTC, bounded reason category, correlation/idempotency identity,
  expected version, and role/state provenance are required for future
  transitions. A missing current field is a gap, not evidence that it exists.
- **Retry/idempotency/concurrency:** current behavior is credited only where
  section 5 says so. Future acceptance must atomically commit state and audit,
  return the same result for proven replay, reject stale/conflicting writes,
  and recheck authority/dependencies. UI freshness is never concurrency proof.
- **Retention class:** group/membership identity and authoritative historical
  link rows are `MEMBERSHIP_HISTORY_RETAINED`; unimplemented guest placeholders
  and invitations are `TEMPORARY_IDENTITY_UNRESOLVED` and
  `INVITATION_LIFECYCLE_UNRESOLVED`; local group/membership rows are
  `LOCAL_GROUP_UNSUPPORTED`; local participant/reference candidates are
  `LOCAL_PARTICIPANT_UNRESOLVED`. No duration is invented.
- **Hard delete:** ineligible for history-bearing group/membership/participant
  identity rows. Any hypothetical dependency-free temporary placeholder is
  unresolved and still blocked by positive dependency/copy proof, retention,
  authority, audit, concurrency, warning, explicit confirmation when
  user-initiated, and the destructive gate.
- **Purge/disposal:** unresolved for every authoritative row and must be a
  separate action. Retention expiry alone is insufficient. Approved clock and
  expiry, no hold, all live and retained-copy dependencies, authority, audit,
  retry/concurrency proof, consequence warning, explicit confirmation, and the
  destructive gate are mandatory.
- **Audit/redaction:** record success and material denial/block/conflict with
  actor, action, subject, prior/new state, bounded reason, timestamp,
  correlation/idempotency identity, and applicable policy/version. Never log
  secrets, credentials, tokens, token hashes, request bodies, raw OCR text,
  file bytes, storage/provider internals, payment details, full notes, hidden
  group data, unrelated identities, or private payloads.
- **Client implication:** present the exact server result, blocked reason,
  history/default/access/notification distinctions, refresh/retry state, and
  accessible confirmation when approved. Never infer authorization, state,
  reactivation, notification delivery, purge eligibility, or historical access.
- **Runtime acceptance evidence:** focused domain/API tests; allowed and denied
  actor tests with safe existence handling; last-owner and duplicate-state
  tests; historical-link immutability tests; stale/concurrent/replay/timeout
  tests; atomic state/audit proof; authorization/notification separation;
  redaction tests; and schema/OpenAPI/client/UI/manual evidence only in the
  focused lanes that later change them. Planning prose is never runtime proof.
- **Manual-gate evidence:** all applicable gates in section 8 are `pending`
  with empty approval evidence. A gate absent from a row is `not-required` for
  the documented current fact; later changed behavior may make it applicable.

## 5. Lifecycle Policy Rows

### 5.1 Transition, actor, wording, defaults, access, and notifications

| Row ID | Record / relationship and user-visible action | Internal transition; requester / executor | Future default-selection effect | Ordinary access / visibility effect | Notification effect | Classification and current evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `GRP-001` | New group — **Create group** on group creation surface | No group → active group plus active owner membership; authenticated profile requests, API creates | Owner becomes eligible for future group records | Active owner receives current group access | No membership/group notification is currently produced | **Implemented current fact.** `GroupFoundationEndpoints.CreateGroupAsync`; creation tests. No idempotency key or group audit event. |
| `GRP-002` | Active group — proposed **Archive group** | Active → archived overlay; actor and exact archive representation unresolved | No group-wide automatic future selection while archived | Ordinary group/member/future-record access becomes unavailable or restricted only under decided record-specific rules | New-activity notifications blocked; historical/security notifications remain separately decided | **Documented accepted requirement; runtime unimplemented.** `UserGroup.DeletedAtUtc` exists but no endpoint or accepted semantics. `MEM-CHOICE-001/002/013`. |
| `GRP-003` | Archived group — proposed **Reactivate group** | Archived → active; approved actor/API after full revalidation | Restores group eligibility only; never auto-reactivates memberships | Restores only group-level entry allowed by current membership and record authorization | Does not replay or broadly resume notifications | **Future acceptance requirement; runtime unimplemented.** `MEM-CHOICE-001/002/013`. |
| `GRP-004` | Active group — **Rename group** | Active name → replacement name; active owner requests and API saves after separate authorization/load checks | No participant-default change | No intended access change; an owner removed after authorization can still commit the in-flight rename | No notification or lifecycle audit event | **Implemented current fact with stale-owner, last-write-win, retry, and audit gaps.** `GroupFoundationEndpoints.UpdateGroupAsync`; `MEM-CHOICE-011`. |
| `MEM-001` | Registered-user membership — **Add member** | Absent → active `member|owner`; active owner requests, API accepts an account with active status and no account/profile deletion, but does not check `DisabledAtUtc`; actor authority is not rebound atomically at save | Eligible for explicit group/future/recurring bill participant/payer selection; eligibility remains account-unaware after add, and current paths do not automatically select every active member | Current group/member access and role-bounded mutation eligibility; a status-active but disabled target can currently be added and later selected | Accepted `group.membership_added` in-app baseline for the affected recipient is unimplemented; exact recipient/policy handling remains notification-owned | **Implemented current fact with disabled/account-unavailable and stale-actor gaps; active eligibility is not automatic default selection.** `AddMemberAsync`; group/future/recurring/import member loaders; OpenAPI/tests. |
| `MEM-002` | Active membership role — **Change role** | Active role `member ↔ owner`; active owner/API, sequential last-owner guard; no atomic actor-authority or same-target prior-state predicate | Remains eligible; role does not itself rewrite participant defaults | Future owner authority changes after API acceptance; concurrent writes can last-write-win and an in-flight stale owner can still commit | Accepted `group.membership_role_changed` in-app baseline for the affected recipient is unimplemented; exact recipient/policy handling remains notification-owned | **Implemented current fact with target-account, stale-actor, and same-target concurrency gaps.** `UpdateMemberAsync`; tests; audited success. |
| `MEM-003` | Active membership — proposed **Exclude from defaults** | Active → default-excluded; requester/control unresolved | Not selected by default; manual inclusion only if separately authorized | Historical and any future-record access remains record-specific; no blanket access loss or gain | No new-record notification unless manually included; historical-event eligibility unresolved | **Documented Day 2 future extension; not Day 1 runtime.** Included because #720 requires the lifecycle distinction; `MEM-CHOICE-003/006/007/015`. |
| `MEM-004` | Default-excluded membership — proposed **Include in defaults** | Default-excluded → active; approved actor/API after revalidation | Becomes eligible for later defaults; no retroactive inclusion | No automatic access to prior or unrelated records | Notifications resume only for later eligible events, subject to policy/preferences | **Future acceptance requirement for the documented Day 2 extension; not Day 1 runtime.** `MEM-CHOICE-003/007/011/015`. |
| `MEM-005` | Active/default-excluded membership — proposed **Leave group** | Current participation → left; exact self-service/acceptance and last-owner behavior unresolved | Hidden/disabled for future defaults; not silently includable | No unrelated future access; historical access/settlement only if separately authorized | Uninvolved left members receive no future-activity notifications; events after an approved special inclusion remain unresolved under `MEM-CHOICE-007/015` | **Documented Day 2 future extension; not Day 1 runtime.** Included because #720 requires the lifecycle distinction; `MEM-CHOICE-004/006/007/014/015`. |
| `MEM-006` | Left membership — proposed **Rejoin / reactivate membership** | Left → active or a new active relationship; representation unresolved | Future eligibility only after current acceptance; no retroactive selection | Revalidate group, actor, account, role, duplicates/conflicts, and record authorization | No replay; later events only after accepted state/policy | **Unresolved product/authz choice for the documented Day 2 extension.** No runtime or accepted in-place-versus-new rule; not Day 1 runtime. `MEM-CHOICE-004/011/014`. |
| `MEM-007` | Active membership — **Remove member** | Active → removed tombstone; active owner/API; sequential last-owner guard is account-unaware, while owner-floor, actor-authority, and same-target prior-state are not atomic | Excluded from future active-member defaults, except already stored CSV/future-bill candidates can still materialize | Current group/member and most group bill/settlement paths fail closed; historical links remain stored | Accepted `group.membership_removed` in-app baseline for the affected recipient is unimplemented; historical/security eligibility remains separately unresolved | **Implemented current fact with viable-owner-floor, stale-actor, duplicate-success-audit, and zero-owner race gaps.** `RemoveMemberAsync`; `CountActiveOwnersAsync`; tests. |
| `MEM-008` | Removed membership — proposed **Restore / reactivate member** | Removed → active or replacement relationship; requester, approver, and API executor authority are unresolved; no transition exists | No eligibility until separately accepted | No access restoration from stable row/ID alone | No notification restoration or replay | **Unresolved product/authz choice; current runtime blocks add and restore.** `MEM-CHOICE-005/006/007/011/014`. |
| `INV-001` | Group invitation — proposed **Invite member** | No invitation → pending invitation; requester, eligible target, API executor, duplicate policy, and expiry basis unresolved | Pending invitation creates no membership or future-record eligibility | No group/record access from invitation or possession of invite material | Accepted `group.invite_created` affected-recipient in-app baseline is unimplemented | **Unresolved product/authz choice; runtime/schema absent.** Direct owner-add is not an invitation policy. `MEM-CHOICE-016`. |
| `INV-002` | Pending invitation — proposed **Accept invitation** | Pending → accepted plus active membership or another approved result; accepting actor, target binding, role, and atomic effect unresolved | Future eligibility only after server acceptance creates an approved active relationship | No access before acceptance; accepted result receives only role/record-specific access | Accepted `group.invite_accepted` affected-recipient in-app baseline is unimplemented; no notification action performs acceptance | **Unresolved product/authz/identity choice; runtime absent.** `MEM-CHOICE-016`. |
| `INV-003` | Pending invitation — proposed **Decline invitation** | Pending → declined; target actor, finality, re-invite, and reason policy unresolved | No membership or future eligibility | No group/record access | Exact decline event/recipient policy unresolved; no replay of create baseline | **Unresolved product/privacy choice; runtime absent.** `MEM-CHOICE-016`. |
| `INV-004` | Pending invitation — proposed **Cancel invitation** | Pending → cancelled; inviter/owner/admin actor and race with acceptance unresolved | No membership or future eligibility | No group/record access | Exact cancellation event/recipient policy unresolved | **Unresolved product/authz choice; runtime absent.** `MEM-CHOICE-016`. |
| `INV-005` | Pending invitation — proposed **Expire invitation** | Pending → expired; authoritative clock, server executor, and race policy unresolved | No membership or future eligibility | No group/record access | Exact expiry event/recipient policy unresolved | **Unresolved product/security choice; runtime absent.** `MEM-CHOICE-016`. |
| `GUEST-001` | Temporary bill participant — proposed **Add temporary participant** on bill flow, not group governance | No reference → stable temporary identity/reference; eligible requester role is unresolved and API/domain would execute only after current bill/context authorization | Never a group-wide default by inference; only explicit permitted bill/context selection | Limited record-specific access, if any, must be explicitly authorized; no account/group authority | Only an approved safe contact/delivery model may notify; none exists | **Documented accepted Day 1 requirement; runtime/schema unimplemented and actor-blocked.** Current financial rows require `UserProfileId`. `MEM-CHOICE-008/015`. |
| `GUEST-002` | Temporary reference — future **Claim / link account** | Unclaimed reference → linked account while retaining provenance; claimant, initiator, approver, canceller, and API decision authority are unresolved | Future eligibility comes from separately accepted membership/record inclusion | Linking does not rewrite history or grant unrelated access; token possession/placeholder creation confer no authority | No replay; future eligibility requires explicit policy and safe recipient resolution | **Documented accepted Day 1 lifecycle preservation requirement and actor-blocked extension point.** It authorizes no claim/link runtime; exact actors/release scope and fuller Day 2 guest governance remain `MEM-CHOICE-008`. |
| `HIST-001` | Bill participant, payer, item split/assignment, revision identity — **not independently removable** | Membership change leaves accepted references unchanged; stored CSV/future-bill candidates can materialize without target revalidation | No automatic future selection follows from historical linkage | Read/mutation only through bill-specific current authorization; group revisions require every creator/owner/participant/payer active | Notify only when event-specific authorization independently permits it; future posting currently notifies stored pending participants | **Implemented persistence plus documented invariant and current coupling gaps.** Expense/revision/future/import sources; `MEM-CHOICE-006/015`. |
| `HIST-002` | Settlement party/request/line/payment/allocation/residual identity — **not independently removable** | Membership change leaves settlement identities and links unchanged | No future group default follows | Current group settlement paths generally require active membership but are target-account unaware | Settlement notifications require event-specific current eligibility, not membership/default status alone | **Implemented persistence plus documented accepted invariant.** Settlement entities/mappings/endpoints; former-member and account-unavailable policy remains `MEM-CHOICE-006/007`. |
| `LOCAL-GRP-001` | Local-only group — **not available in Local Mode** | No transition: Day 1 local mode has no groups or shared-group collaboration | Not applicable | No local group access and no server access inference | Not applicable | **Documented accepted non-applicability.** `MVP_DAY1_SCOPE.md` and `AUTH_IDENTITY_FOUNDATION.md`; `MEM-CHOICE-012`. |
| `LOCAL-MEM-001` | Local-only group membership — **not available in Local Mode** | No transition: Day 1 local mode has no group membership relationship | Not applicable | No local membership authority and no server access inference | Not applicable | **Documented accepted non-applicability.** Same sources; `MEM-CHOICE-012`. |
| `LOCAL-HIST-001` | Local-only group historical participant reference — **not available in Local Mode** | No group-history transition exists; locally authoritative personal records remain outside this group-policy row | Not applicable | No group-history access authority; later server import is a new acceptance | No cross-boundary notification inference | **Documented accepted non-applicability for groups.** Generic local personal-record/import authority does not create groups; `MEM-CHOICE-012`. |
| `LOCAL-PART-001` | Local-only personal-bill person/temporary participant — proposed **Record participant locally** | No local candidate → locally authoritative person/participant reference; exact local entity and actor surface unimplemented | Local personal-record inclusion only; never a server/group default | Local record visibility only under local app policy; no server account, group, payment-detail, settlement, or audit authority | Local presentation is not server notification eligibility | **Documented accepted local authority; exact lifecycle unimplemented.** `LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md`; #718 `LOCAL-PART-001`; `MEM-CHOICE-017`. |
| `LOCAL-PART-002` | Local-only participant reference — **Retain history / offer later import** | Local current reference → retained local historical reference; any server import/link creates a newly accepted server identity/reference without rewriting local provenance | No server future eligibility by implication | Local history remains local; server visibility/access begins only after separate server acceptance | No server notification or replay follows from local history/import candidate status | **Documented accepted local authority and future acceptance requirement.** Exact retention/import/link model remains `MEM-CHOICE-017`; no runtime is authorized here. |

### 5.2 Mutation eligibility, reversibility, re-entry, dependencies, and blockers

| Exact row(s) | Mutation-eligibility effect | Reversibility | Re-entry / reactivation target and required revalidation | Dependency evidence and missing evidence |
| --- | --- | --- | --- | --- |
| `GRP-001` | Enables current active group operations | Creation is not “restore”; later archive is separate | Not applicable | Current profile/account, unique generated ID, owner membership, transaction. Missing idempotent create/replay and group audit. |
| `GRP-002/003` | Archive blocks ordinary new activity; reactivate may restore only group eligibility | Conditional; exact archive representation and actor unresolved | Target active group; revalidate actor authority, at least one viable owner path, account/identity state, memberships, policy, conflicts, holds, dependencies, and version | Bills, settlements, recurring templates, files/links, notifications/history, audit, sync/import/export/backup copies. Exact archive semantics and full graph are missing. |
| `GRP-004` | Rename changes group presentation only; it must not change participation, history, or authority | A later rename can replace the name but is not lifecycle restore | Active group and current owner authority must remain valid at commit | Authorization, tracked load, and save are separate; removed owners can commit in flight and concurrent names last-write-win. Missing version/idempotency, atomic actor predicate, audit, and retry-result evidence. |
| `MEM-001` | Add enables member operations and currently exposes earlier group bills to list/read/export/monthly-report and reconciliation mutation | Add has no current remove reversal identity | Active membership; add checks actor ownership and target account/profile before mutation, but omits target `DisabledAtUtc` and does not atomically bind actor authority or absence of a duplicate to save | Disabled targets are accepted; group, future, recurring, and import active-member loaders omit target accounts. Group bill/report/reconciliation surfaces have no membership-start boundary. An owner demoted/removed after authorization can still commit. Missing account parity, pre-membership-history read/export/report/mutation policy, atomic actor/duplicate predicate, denied/race coverage, version/idempotency, and denial audit. |
| `MEM-002` | Role change alters owner-only mutations prospectively | Role update is reversible subject to the current sequential guard | Active membership; update checks actor ownership, target membership/role, and owner count, but omits target account state and does not bind actor authority or target prior state to save | Owner count is account-unaware and count-then-write; two owners can both demote. Concurrent same-target changes last-write-win with separate success audits, and an owner revoked after authorization can commit. Atomic target-state/actor/viable-owner predicates, version/idempotency, and denial audit are missing. |
| `MEM-003/004` | Default exclusion blocks defaulting, not all manual inclusion, history, or access | Intended reversible, implementation absent | Target active membership; revalidate current group/account/role, authority, duplicate/conflict, and approved default policy | Bill/context presets, recurring templates, future drafts, group mute/preferences, pending invitations, audit, notification history. Exact default-control owner/manual-inclusion rules missing. |
| `MEM-005/006` | Left blocks ordinary new participation; outstanding historical actions are separately authorized | Conditional; in-place versus new relationship unresolved | Target active membership or new relationship; revalidate actor, group, account/identity, role, owner floor, duplicates/conflicts, outstanding obligations, policy, and version | Historical bills/settlements, owner role, invites, recurring records, files, notification history, audit, sync/import/export copies. Departure/re-entry contract missing. |
| `MEM-007` | Removed blocks current group/member and active-member-dependent operations; stored import/future candidates remain exceptions; row remains | Current transition has no restore; logical removal is not physical deletion | None in current runtime. Any future target requires all group/account/role/duplicate/owner/dependency/version checks | Owner guard is account-unaware/non-atomic; concurrent owners can remove to zero. Concurrent same-target removes can both emit success audit, and a stale-authority owner can commit. Missing atomic actor/target/viable-owner predicates, reason, version/idempotency, dependency impact, denial/conflict audit, and restore rule. |
| `MEM-008` | No current mutation is eligible; duplicate row blocks add | Unresolved | Active membership or new relationship only after `MEM-CHOICE-005`; no requester, approver, or executor is authorized until that choice is decided; then revalidate every blocker named for `MEM-006` and why removal occurred | Removed row, prior role/audit, historical records, policy/disciplinary hold if any, account state, owner floor, notification history. No accepted restore actor or transition contract. |
| `INV-001..005` | Pending invitation alone enables no group/member/record mutation; accept may create a membership only under a separately approved atomic contract | Decline/cancel/expire are terminal only if later policy says so; accept is not restore | Target accepted invitation plus approved active membership result; revalidate inviter/acceptor authority, target identity, group, role/owner rules, account state, duplicates/conflicts, expiry, block/unfriend policy, and version | Group/account/identity, membership tombstone/duplicate, role/owner floor, notification history, audit, delivery, block/unfriend, exports/backups. Every actor, terminal/re-invite rule, and accept-versus-cancel/expire race is missing. |
| `GUEST-001/002` | Placeholder can affect only explicitly accepted bill participation; cannot govern group or act as account | Claim/link is not reversal and must retain provenance | Linked reference plus separately accepted account/membership; claimant, initiator, approver, canceller, and API decision authority are unresolved; token possession and placeholder creation confer none; after approval revalidate proof of control, duplicate/conflicting identity, record authorization, privacy, consent, and applicable friendship/direct-sharing/block/unfriend state | Bill/settlement links, contact data, invitations, account/identity, friendship/direct-sharing/block/unfriend state, audit, notifications, exports/backups. Exact actors, entity, proof, conflict, unlink, relationship-policy, and privacy rules missing. |
| `HIST-001/002` | Membership transition cannot mutate historical money/identity; record-owner workflows remain separate | Not a membership reversal target | Not applicable; future membership re-entry never changes these rows | #718 financial graph; #719 files/links; #721 account/identity; notifications. Missing policy covers newly added members' pre-membership group list/read/export/report/reconciliation mutation, revision-wide all-member gates, account-unaware settlement counterparties, commit-time member-removal races, and confirmation/posting-time stored-reference revalidation. |
| `LOCAL-GRP/MEM/HIST-*` | No local or server group/membership mutation is eligible | Not applicable for Day 1 local groups because the record family is unsupported | No re-entry target; a future group scope change requires explicit product approval | Current no-groups/no-collaboration authority is complete; local personal-record rules create no group dependency graph. |
| `LOCAL-PART-001/002` | Local application/domain may record and retain a local personal-bill participant/reference under local policy; it cannot mutate server truth | Local correction/re-entry semantics unresolved; retained history is not silently rewritten or linked | A later server import/link is a new acceptance: revalidate identity/provenance, consent, duplicate/conflict, record context, server authorization, and policy without inheriting group/account authority | Local record/history, backup/restore/export copies, identity/provenance, bill/share facts, import conflicts, and optional future server reference. Exact local entity, retention, correction, link/import, and conflict UX are missing. |

### 5.3 Metadata, retry/concurrency, retention/disposition, and audit

| Exact row(s) | Persisted metadata and operation mechanics | Retention / hard delete / purge | Audit and privacy specifics |
| --- | --- | --- | --- |
| `GRP-001` | Current stable ID, creator, create/update time, name, owner-membership time; no operation ID/version. An uncertain retry can create another group. | `MEMBERSHIP_HISTORY_RETAINED`; hard delete ineligible once dependencies exist; purge unresolved/separate. | Future create replay/conflict audit; name/private group content excluded from lifecycle metadata. |
| `GRP-002/003` | `DeletedAtUtc` exists but no actor/reason/version/archive operation. Future transition needs exact archived/reactivated metadata and atomic audit. | Retain group identity while any membership, bill, settlement, recurring, file/link, notification, audit, export/backup copy depends on it. Hard delete ineligible; purge unresolved. | Audit success/denial/block/conflict and owner-floor/dependency reason category; never enumerate private record contents. |
| `GRP-004` | Current stable group ID, mutable name, and `UpdatedAtUtc`; no expected version, operation identity, or concurrency token. Uncertain retry may repeat success and concurrent saves last-write-win. | Same retained group identity as every other `GRP-*` row; rename never authorizes deletion or purge. | No current rename lifecycle audit. Future audit needs bounded group/action/prior-new category and conflict result, never the private group name or hidden data. |
| `MEM-001/002` | Current composite ID, role/status, create/update time; no reason/version/idempotency/concurrency token. Duplicate-add check, actor authorization, target load, owner count, and write are separate. Same-target role writes last-write-win; repeated/simultaneous operations can emit multiple success audits; stale owners and two-owner demotions can commit. | Membership history retained; no hard delete; purge unresolved. | Current success audit is bounded. Add denial/conflict/replay, stale-actor, same-target conflict, same-state, and owner-floor race evidence need focused coverage. |
| `MEM-003..006/008` | No current fields or operations. Future state needs entered/left/reactivated time, actor, bounded reason, prior role/state, operation/correlation identity, and version. | Retain every former relationship and history link. Hard delete ineligible; purge unresolved. | Audit state changes plus material blocked attempts without exposing reason narrative or private records. |
| `MEM-007` | Current status and `UpdatedAtUtc`; no removed-at/actor/reason/version/idempotency/concurrency token. Sequential repeat fails after the first save, but simultaneous same-target removes can both update/audit; stale-owner authorization and two-owner removal can also commit. | Removed tombstone and dependencies retained; hard delete ineligible; purge unresolved/separate. | Current success audit is bounded. Add blocked/conflict/replay, stale-actor, duplicate-success-audit, same-target, and owner-floor race evidence later; never log request/contact/private payloads. |
| `INV-*` | No persistence exists. Future invitation needs stable ID, group/target/inviter binding, role, state/timestamps, bounded expiry/cancel/decline basis, operation identity, expected version, and atomic accept-to-membership result. | `INVITATION_LIFECYCLE_UNRESOLVED`; history/notification-dependent evidence retained; hard delete and purge unresolved under #724. | Audit bounded create/accept/decline/cancel/expire success and material denials/races. Never log raw invite material, email/phone, delivery payload, credentials, or hidden group data. |
| `GUEST-*` | No persistence exists. Future stable placeholder/reference ID must remain distinct from contact or account ID and retain create/link provenance, consent basis, version, and operation identity. | `TEMPORARY_IDENTITY_UNRESOLVED`; history-bearing reference hard delete ineligible. Any dependency-free draft placeholder and all purge remain unresolved. | Minimize contact/identity proof; never audit raw email/phone/invite token, identity proof, private bill data, or account-link payload. |
| `HIST-*` | Financial rows retain their own IDs, user/profile links, states, and timestamps under #718. Membership transition must not update them. | `MEMBERSHIP_HISTORY_RETAINED`; hard delete ineligible; purge follows #718/#724 and destructive gates, never this policy alone. | Membership audit may name bounded dependency categories/counts, not money, notes, payment details, OCR, files, or private payloads. |
| `LOCAL-GRP/MEM/HIST-*` | Group/membership metadata is not applicable because local mode does not support these families. | `LOCAL_GROUP_UNSUPPORTED`; no local group target exists. | No group lifecycle audit applies. Never present local labels as server membership or authority. |
| `LOCAL-PART-*` | Exact persistence is unimplemented; future local identity/reference needs stable local ID, provenance, record link, local version, correction history, and any export/import correlation without a server-authority claim. | `LOCAL_PARTICIPANT_UNRESOLVED`; retain while local history/copies depend on it. Hard delete/purge require local retention/dependency policy and never follow from lack of server authority. | Local audit/provenance must minimize contact data and exclude credentials, raw import/link proof, money/private record payloads, and server authority claims. |

### 5.4 Implementation owner, unresolved choices, gates, and validation

| Exact row(s) | Open choices | Implementation status | Future owner / canonical lane | Manual gates and focused acceptance evidence |
| --- | --- | --- | --- | --- |
| `GRP-001` | `MEM-CHOICE-011` | Implemented current fact, replay/audit partial | Existing groups runtime → #722 after #961 | `G-PRODUCT` only if semantics change; conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; create atomicity/replay/audit tests. |
| `GRP-002/003` | `MEM-CHOICE-001/002/009/010/011/013/014` | Unimplemented | #961 synthesis → #722 group runtime/schema/API split; #723 UI; #724 retention | `G-PRODUCT/G-AUTHZ/G-RET/G-PRIV/G-CLIENT/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; archive/reactivate actor, owner continuity, dependency, concurrency, audit, notification, history tests. |
| `GRP-004` | `MEM-CHOICE-011` | Implemented current fact; concurrency/retry/audit partial | Existing groups runtime → #722 after #961 | Current rename needs no new product gate; mechanics changes require `G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; stale-owner-at-commit, concurrent rename, uncertain retry/result, and bounded audit tests. |
| `MEM-001/002` | `MEM-CHOICE-006/007/011/014/015` | Implemented current fact, mechanics/audit partial; add and every group/future/recurring selection loader are account-unaware; add grants current group-wide pre-membership bill list/read/export/report and reconciliation mutation; membership writes lack atomic actor, target-state, and owner-floor predicates; accepted notifications are unimplemented | Existing group-member and bill runtime; #722/#724 follow-up; notification owner | `G-AUTHZ/G-PRIV/G-RET`, conditional `G-PRODUCT/G-SCHEMA/G-CONTRACT/G-CLIENT`; disabled-at add and each group/future/recurring/import eligibility path; pre-membership bill list/read/export/monthly-report/reconciliation allowed/denied coverage; target-account promotion; stale-owner-at-commit; simultaneous same-target role/update and two-owner demotion; viable-owner; notification; duplicate/replay/stale-role tests. |
| `MEM-003/004` | `MEM-CHOICE-003/006/007/010/011/015` | Documented Day 2 future extension; unimplemented and not Day 1 runtime | #961 synthesis must preserve the Day 2 boundary before any later focused group/member lane; notification owner; #723 UI only when separately authorized | `G-PRODUCT/G-AUTHZ/G-PRIV/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; default-versus-access-versus-notification separation and manual-inclusion tests. |
| `MEM-005/006` | `MEM-CHOICE-004/006/007/010/011/014/015` | Documented Day 2 future extension; unimplemented and not Day 1 runtime | #961 synthesis must preserve the Day 2 boundary before any later focused group/member lane; #724 retention; #723 UI only when separately authorized | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; self/admin actor, owner floor, outstanding-history, re-entry, replay, notification tests. |
| `MEM-007` | `MEM-CHOICE-005/006/007/009/011/014/015` | Implemented removal with account-unaware and concurrency-unsafe actor/target/owner predicates; stored-reference exceptions remain; restoration absent; accepted removal notification unimplemented | Existing runtime then #722/#724; notification owner | Current fact needs no gate; changed semantics require `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; account-aware owner floor; stale-owner-at-commit; simultaneous same-target and two-owner removal; duplicate audit/replay; CSV/future posting after removal; dependency/history and notification evidence. |
| `MEM-008` | `MEM-CHOICE-005/006/007/010/011/014/015` | Unimplemented, actor-unresolved, and fail-closed | #961 → #722/#723/#724 | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; allowed/denied requester, approver, and API executor; reason/policy blocker, duplicate, owner/role, history, stale/replay tests. |
| `INV-001..005` | `MEM-CHOICE-007/009/010/011/016` | Invitation lifecycle unimplemented; accepted create/accept notification baselines exist, but no state/entity/actor contract does | Existing invitation/auth/group/notification owners after #961; #722 contract/schema/API split; #723 UI; #724 retention | `G-PRODUCT/G-IDENTITY/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; create/accept/decline/cancel/expire allowed/denied actors, target binding, role/owner, duplicate, expiry clock, accept-versus-cancel/expire race, idempotency, atomic membership/audit/notification, safe delivery/redaction, re-invite tests. |
| `GUEST-*` | `MEM-CHOICE-008/009/010/011/015` | Day 1 temporary-reference and provenance-preserving later-link requirement unimplemented; creation and claim/link actors plus exact runtime scope unresolved; fuller guest governance Day 2 | Existing temporary-participant/account-link owners after #961; #723 UI; #724 retention | `G-PRODUCT/G-AUTHZ/G-PRIV/G-IDENTITY/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; allowed/denied creator, claimant, initiator, approver, canceller, and API executor; token/placeholder grants no governance authority; proof/consent, friendship/direct-sharing/block/unfriend denials, duplicate/link conflict, immutable history, notification privacy tests. |
| `HIST-*` | `MEM-CHOICE-006/007/009/015` | Persistence implemented; access policy incomplete in both directions; new members get group-wide pre-membership bill list/read/export/report and reconciliation mutation, settlement/revision former-member gaps exist, import GET/discard omit post-removal membership checks, and ordinary or stored-reference creation can race/use removal | #718 financial owner plus #722 authorization split; #724 retention; notification owner | `G-AUTHZ/G-PRIV/G-RET/G-MONEY/G-DEST` for changed behavior; immutable references; pre-membership list/read/export/monthly-report/reconciliation mutation; revision-wide and settlement account-state tests; concurrent removal versus ordinary group/future/recurring create/generate; removed import-session creator GET/discard denial; CSV confirmation/future-post target revalidation; notification/redaction tests. |
| `LOCAL-GRP/MEM/HIST-*` | `MEM-CHOICE-012` | Documented non-applicability: local groups/memberships are unsupported | No implementation owner; any group scope proposal returns to product architecture | No gate preserves the current unsupported boundary. A proposed local-group change requires `G-PRODUCT/G-AUTHZ/G-PRIV/G-SYNC` and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT/G-RET/G-DEST`. |
| `LOCAL-PART-001/002` | `MEM-CHOICE-009/010/017` | Documented accepted local authority; exact participant/reference lifecycle, retention, and import/link handling unimplemented | Local personal-record/identity/import owners after #961; #723 only for approved UX; #724 retention | `G-PRODUCT/G-PRIV/G-RET/G-SYNC/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT/G-IDENTITY/G-DEST`; local create/correct/retain/history/copy tests; no server grant; explicit new-acceptance import/link; duplicate/conflict/provenance preservation; local deletion/retention and redaction evidence. |

### 5.5 Exact hard-delete and purge fields

For `GRP-*`, `MEM-*`, `INV-*`, and history-bearing `GUEST-*` and `HIST-*`
rows, `hard_delete_eligibility.status = ineligible` when the subject is
authoritative or history-bearing; `target_classification = group, membership,
participant identity, or historical reference evidence`; conditions are
unsatisfied; and ordinary consequence warning/confirmation are not applicable
because no ordinary hard-delete action is authorized. A positively proven
dependency-free, unaccepted temporary placeholder remains
`hard_delete_eligibility.status = unresolved`, with target classification,
dependency/copy proof, authority, audit, concurrency, warning, confirmation,
`G-RET`, and `G-DEST` all pending.

For every server-mode row, `purge_disposal_eligibility.status = unresolved` and
`separate_action = required`. Conditions are an approved retention class,
clock and expiry; no hold; positive dependency evidence including financial,
file/link, auth/identity, notification history, audit, sync/import/export,
backup/snapshot/replica copies; current authority; bounded audit; retry and
concurrency proof; consequence warning; explicit confirmation; and all
applicable `G-RET/G-PRIV/G-DEST` gates. This policy approves none of them. For
`LOCAL-GRP/MEM/HIST-*`, both hard-delete and purge eligibility are
`not-applicable` because the Day 1 local group/membership/history target does
not exist. `LOCAL-PART-*` instead remains `unresolved`: locally authoritative
participant/reference data is not disposable merely because it lacks server
authority, and local retention/dependency/copy proof plus applicable gates are
required.

## 6. Explicit Open Choices

| Choice ID | Affected authority domain | Exact answerable question | Why current authority does not decide it | Safe non-operative posture | Owner, blocked lane, manual gate |
| --- | --- | --- | --- | --- | --- |
| `MEM-CHOICE-001` | Server group root, memberships, and record-specific reads | Does group archival use `DeletedAtUtc`, a separate archive state, or another overlay, and exactly what remains readable/mutable? | A nullable column exists, but no endpoint, audit, wording, or accepted lifecycle semantics exist. | Do not expose archive/reactivate; current deleted-group paths fail closed. | #961 → #722 group/schema/API; #723 UI; `G-PRODUCT/G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-002` | Server group archive/reactivation actor authority | Who may archive or reactivate a group? | Current owner authority covers rename/member management only. | No actor is authorized for the unimplemented transitions. | Tommy/product-authz via #722/#723; `G-PRODUCT/G-AUTHZ/G-CLIENT`. |
| `MEM-CHOICE-003` | Server default-excluded membership and future selection | Is default exclusion self-service, owner/admin-controlled, or both, and who may manually include that person later? | Day 2 architecture describes effects but not decision authority. | No status transition or manual-inclusion exception; retain current active/removed Day 1 runtime. | #961 must preserve the Day 2 boundary; only a separately authorized later product/authz lane may route to #722/#723; `G-PRODUCT/G-AUTHZ/G-CLIENT`. |
| `MEM-CHOICE-004` | Server left membership and re-entry relationship | Is leaving self-service, owner-accepted, or another workflow, and does re-entry restore the row or create a new relationship? | Day 2 architecture names the state, but no left state, endpoint, metadata, or identity-history rule exists. | Do not implement leave/re-entry in Day 1; current membership remains unchanged. | #961 must preserve the Day 2 boundary; only a separately authorized later product/authz/schema lane may route to #722/#723/#724; `G-PRODUCT/G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-005` | Server removed membership/tombstone and reactivation | Can a removed/tombstoned membership ever regain active participation; if so, who may request it, who must approve it, which server authority executes it, and is the result an in-place restore or a new relationship? | Current add rejects any existing removed row, no restore exists, and current owner/self/admin authority defines none of those actors. | Removed remains removed; no actor may request, approve, or execute restoration, and no new eligibility or access arises. | Tommy/product-authz via #722/#724; `G-PRODUCT/G-AUTHZ/G-RET`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-006` | Server group membership plus bill/revision/settlement authorization | Which pre-membership and post-participation historical bill list/read/export/report/reconciliation, revision, and settlement reads/mutations remain authorized; should one former creator/owner/participant/payer block every revision or settlement action; and when must target account availability block a counterparty workflow? | Revision operations require active membership for creator, owner, every participant and payer. Settlement paths use active membership but generally omit target account availability. In the opposite direction, group bill list/read/export, monthly reports, and reconciliation mutation authorize current group access and expose or mutate earlier group bills without membership-start or record-participation filtering. Record-family historical policy is incomplete. | Preserve records and current gates/exposure only as implemented facts; do not infer access from history, treat current membership as accepted blanket historical read/mutation policy, or treat account-unaware eligibility as accepted policy. Route changes to focused authorization/money owners. | #961 synthesis → focused group/financial authz owners; `G-AUTHZ/G-PRIV/G-MONEY`. |
| `MEM-CHOICE-007` | Server invitation-, membership-, and record-specific notification eligibility | Beyond accepted invite create/accept and membership add/role-change/removal affected-recipient in-app baselines, which decline/cancel/expire, historical, settlement, policy, and security events may notify invited, default-excluded, left, removed, or archived-group people? | The taxonomy decides those baselines, but no producer exists and other recipient/state eligibility is unspecified; notification remains distinct from invitation action, access, and defaulting. | Preserve accepted baselines but produce no new runtime notification until focused recipient, reauthorization, preference/mute, block/unfriend, and redaction gates pass; leave other cases unresolved. | Notification owner with invitation/group/authz owners; `G-PRODUCT/G-AUTHZ/G-PRIV`. |
| `MEM-CHOICE-008` | Server temporary participant identity, account link, relationship policy, and record access | What stable placeholder model and release scope apply; who may claim, initiate, approve, cancel, or execute a link; and what proof/consent, friendship/direct-sharing/block/unfriend, conflict, and unlink rules preserve history? | Day 1 requires minimal temporary participation and provenance-preserving later linking; current schema requires registered profiles and no claim/link runtime or actor contract exists; fuller guest membership/governance is Day 2. | Do not infer authority from token possession, placeholder creation, contact data, or account identity. Preserve the original reference and extension requirement, but expose no claim/link action until every actor and focused gate is approved. | Temporary-participant/account-link owners after #961; `G-PRODUCT/G-IDENTITY/G-AUTHZ/G-PRIV`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-009` | Server group/membership/placeholder/history retention and copies | What retention clocks, holds, copy duties, and terminal purge eligibility apply to groups, memberships, placeholders, and historical links? | No authoritative duration or complete copy/dependency policy exists. | Retain; no physical delete or purge. | #724 plus domain owners; `G-RET/G-PRIV/G-DEST`. |
| `MEM-CHOICE-010` | Server lifecycle presentation and client wording | What exact confirmation, blocked-state, archive, leave, removal, and reactivation wording is approved? | Source code and issue text do not constitute final Figma/product wording. | No new UI action or confirmation. | #723/Figma and Tommy; `G-PRODUCT/G-CLIENT`. |
| `MEM-CHOICE-011` | Server group/membership mutation mechanics | What operation identity, expected version, and atomic actor-authority, target-prior-state, duplicate-absence, and owner-floor predicates govern retries/races, including group rename, stale-owner writes, same-target conflicts, and simultaneous owner demotion/removal? | Current entities have timestamps but no concurrency token/idempotency contract. Rename authorization/load/save and membership authorization, duplicate/target load, owner count, and write are separate, allowing stale actors, concurrent-name or membership last-writer state, duplicate success audits, and zero owners. | Do not treat uncertain retries as replay or initial authorization as commit authority. Future writes must atomically prove actor, target prior state/absence, and owner floor or fail closed; rename must have bounded audit/result evidence. | #722 API/schema owner; `G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT`. |
| `MEM-CHOICE-012` | Local-only mode boundary versus server groups/memberships | Should a future product-scope decision ever introduce local groups/memberships, contrary to the current Day 1 no-groups/no-collaboration rule? | Current authority answers Day 1—unsupported—but does not authorize or design any later scope change. | Keep `LOCAL-GRP/MEM/HIST-*` group rows not applicable; local participant candidates under `LOCAL-PART-*` create no group/membership. | No current implementation lane. Any later group scope proposal returns to Tommy/product architecture; `G-PRODUCT/G-AUTHZ/G-PRIV/G-SYNC` before technical planning. |
| `MEM-CHOICE-013` | Server group archive cascade over memberships | Does archiving a group alter membership states, and what happens to them on group reactivation? | No source establishes cascade semantics. | Preserve membership rows and do not auto-change or auto-reactivate any member. | Product/authz owner via #722; `G-PRODUCT/G-AUTHZ`. |
| `MEM-CHOICE-014` | Server group owner continuity across membership and account/profile transitions | How do archive, leave, default exclusion, removal, re-entry, account disable/re-enable/delete, and profile deletion preserve at least one account-available viable owner without stranding management or silently restoring stale authority, including under concurrent demotion/removal? | Current last-owner guard covers role demotion/removal only, counts account-unaware memberships, and is a non-atomic count-then-write vulnerable to a zero-owner race. Account/profile lifecycle does not transition the stored membership; #721 leaves cross-domain effects unresolved. | Block any new transition that would strand ownership; never infer continued or restored owner power from the unchanged row alone; preserve current behavior only as fact and do not describe the sequential guard as viable-owner or concurrency-safe. | Product/group/auth-security owner via #961/#722/#721; `G-PRODUCT/G-AUTHZ/G-IDENTITY`. |
| `MEM-CHOICE-015` | Server group membership, temporary-participant creation authority, import sessions, and future bill/context selection | Who may create a temporary participant; when may non-active/account-unavailable/temporary people be included; what commit-time atomic membership predicate or equivalent serialization and target revalidation is mandatory at ordinary create, future-bill create/post, recurring create/update/generate, and CSV confirmation; and must import-session GET/discard revalidate group membership? | Group/future/recurring loaders omit target accounts and run as separate reads before persistence, so concurrent removal can race ordinary saves. CSV confirmation and future posting can materialize stored targets after membership changes; posting emits participant notifications. Import GET/discard bind stored actor/session IDs but do not recheck membership. No placeholder actor contract exists. | Authorize no temporary actor or new exception. Preserve current account-unaware, stale-reference, TOCTOU, and revoked-creator import-session behavior only as facts; do not broaden or label them accepted policy before focused decisions. | Group/bill product-money-authz/notification owners after #961; `G-PRODUCT/G-AUTHZ/G-MONEY/G-PRIV`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-016` | Server group invitations and membership entry | Who may create, accept, decline, cancel, or expire an invitation; how is the target bound; which role is offered; does acceptance atomically create an active membership; what are duplicate, tombstone, re-invite, expiry, delivery, and race rules? | Current group runtime has direct owner-add only. No group-scoped invitation entity/schema/API/actor contract or accept-to-membership linkage exists. The implemented account-registration `AuthInvitation` lifecycle has no group/membership binding and does not decide this lifecycle; the notification taxonomy accepts group create/accept baselines. | Expose no group-invitation action and infer no membership/access from account- or group-invite material or notification. Preserve the #721-owned account-registration invitation runtime unchanged. Keep direct owner-add as the implemented current group-membership fact only; do not call it the complete accepted entry model. | Invitation/group/auth/identity/notification owners after #961 via #722/#723/#724; `G-PRODUCT/G-IDENTITY/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`. |
| `MEM-CHOICE-017` | Local-only person/temporary participant identity and historical reference | What local entity, actor surface, correction/history model, retention/disposition rule, and later server import/link acceptance preserve a local participant/share reference without silently merging identity or granting server authority? | Local authority permits local identities/candidates, and #718 delegates `LOCAL-PART-001` identity lifecycle here, but no exact persistence/runtime/retention/import contract exists. | Permit no server inference or silent identity merge. Treat the local reference as locally authoritative candidate/history data, retain provenance, and require any server import/link to be a new explicit acceptance. | Local personal-record/identity/import owners after #961 with #724 retention and #723 UX only when approved; `G-PRODUCT/G-PRIV/G-RET/G-SYNC/G-CLIENT`, conditional `G-IDENTITY/G-SCHEMA/G-CONTRACT/G-DEST`. |

These choices do not block this documentation task because their safe posture
preserves current behavior and history. Selecting an answer is a separate
product, privacy, authorization, identity, money, schema, contract, UI,
notification, retention, sync, or destructive gate.

## 7. Invariants And State Effects

| Participation state | Future default selection | Historical identity/reference | Access/visibility | Notification eligibility | Reactivation posture |
| --- | --- | --- | --- | --- | --- |
| Active | Eligible for explicit current selection; automatic default selection is unimplemented Day 2 behavior | Preserved | Current API authorization | Accepted add/role-change in-app baseline when affected is unimplemented; other events require event authorization + policy/preferences | Already active |
| Default-excluded | Not selected by default; manual inclusion unresolved | Preserved | Record-specific; no unrelated future access | New uninvolved events no; other cases unresolved | Conditional to active after current checks |
| Left | Hidden/disabled for future defaults | Preserved | Historical only where separately authorized | Future group activity no; historical/security unresolved | In-place versus new relationship unresolved |
| Removed/tombstoned | Ineligible | Preserved | Current runtime generally fails closed | Accepted removal in-app baseline when affected is unimplemented; historical/security cases unresolved | No current path; eligibility unresolved |
| Pending invitation | Ineligible until separately accepted membership creation | Invitation/audit provenance retained under future policy | No group/record access from invite material | Accepted create baseline unimplemented; read/archive is not acceptance | Accept/decline/cancel/expire are distinct unresolved transitions |
| Accepted/declined/cancelled/expired invitation | Invitation no longer provides eligibility; only separately created active membership may | Invitation outcome/provenance retained under future policy | Invitation outcome alone grants no unrelated record access | Accepted accept baseline unimplemented; other event policy unresolved | Re-invite/re-entry and terminality unresolved |
| Temporary reference | Never group-defaulted by inference | Stable reference/provenance preserved | Limited record-specific policy only | No approved generic delivery model | Later link must preserve provenance; exact runtime/release scope unresolved, fuller guest governance Day 2 |
| Local-only participant/reference | Local personal-record use only; never a server/group default | Local identity, share, and provenance retained under local policy | Local record only; no server grant | No server notification inference | Server import/link is a new acceptance, never silent merge |
| Archived group | No new group-wide defaults | Group/member/financial history preserved | Current deleted-group paths fail closed; future archive reads unresolved | New activity blocked; historical/security unresolved | Group-only reactivation; never cascade members |

Historical linkage and future participation are orthogonal:

```text
membership participation state
  ├─ future-default eligibility
  ├─ prospective group mutation eligibility
  └─ possible input to current API authorization

retained record-specific identity/reference
  ├─ original bill participant / payer / split / assignment
  ├─ original settlement party / line / payment / allocation / residual
  └─ audit and explainability evidence
```

Neither branch implies the other. Notification eligibility is a third,
separately accepted decision.

Current runtime has two additional contradictions that remain facts rather than
accepted policy: current active membership grants group-wide bill
list/read/export/report and reconciliation mutation without a membership-start
boundary, while several former-member revision and settlement paths fail
closed because any historical participant is inactive.
Likewise, an unchanged owner membership neither proves an account/profile can
currently act nor decides whether later auth re-enable should restore owner
authority. `MEM-CHOICE-006/014` keep these access and owner-continuity decisions
explicit for #961 and their focused owners.

## 8. Manual-Gate Registry

These gates are not required to merge this docs-only policy. They remain
pending for downstream changes; satisfying one never satisfies another.

| Gate ID | Required / status | Gate and owner | Downstream work blocked |
| --- | --- | --- | --- |
| `G-PRODUCT` | Yes / pending when an open choice selects behavior | Tommy/product owner | Archive, leave, exclusion, removal/reactivation, invitation, guest/local participant, wording, or future inclusion semantics not already accepted |
| `G-AUTHZ` | Yes / pending for changed accepted access/role semantics or runtime | Group/record authorization owner plus human review | Historical/future access, transition actors, role/owner continuity, notification acceptance |
| `G-IDENTITY` | Yes / pending for invitation targets, guest/account linking, or local/server identity acceptance | Auth/identity and privacy owners | Invite targeting/acceptance, placeholder proof, claim/link, conflict, unlink, consent |
| `G-MONEY` | Yes / pending where financial eligibility/settlement semantics change | Bill/settlement owner plus human money review | Future participant inclusion, outstanding settlement access/mutation, financial-history effects |
| `G-SCHEMA` | Conditional / pending if persistence changes | Focused schema/migration owner and human review | New statuses, metadata, placeholder/link/tombstone/version fields |
| `G-CONTRACT` | Conditional / pending if API/OpenAPI/client changes | Focused API/OpenAPI/generated-client owner | New actions, state/result/error shapes, generated clients |
| `G-CLIENT` | Yes / pending for UI | #723 and platform/Figma owner | Controls, confirmations, history/access/default/notification readouts |
| `G-RET` | Yes / pending | #724 plus domain owner | Clocks, holds, copy duties, tombstones, terminal disposition |
| `G-PRIV` | Yes / pending for exposure/minimization/linking changes | Privacy/auth/storage owners | Historical reads, notification content, placeholder/contact data, audit/export visibility |
| `G-SYNC` | Yes / pending for local/import behavior | Sync/import/export/restore owner | Local/server reconciliation, replay, backup/copy treatment |
| `G-DEST` | Yes / pending | Human destructive-operation owner | Hard delete, purge, physical cleanup, destructive migration/data action |

## 9. Follow-Up Ownership And Duplicate Prevention

No new issue is created by #720 because live canonical owners already cover the
handoff:

- #961 consumes #718/#719/#720/#721 after this child completes. It may
  reconcile terminology and contradictions but may not silently decide these
  open choices. Queue activation is disabled; #961 is not started here.
- #722 owns the post-synthesis split for focused group/member runtime,
  schema/migration, API/OpenAPI, generated-client, and authorization changes.
- #723 owns approved lifecycle UI wording, confirmations, accessibility, and
  Figma/reference behavior.
- #724 owns retention clocks, holds, dependency evidence, tombstones, copy
  duties, hard-delete classification, and terminal disposition planning.
- Existing financial owners and #718 retain bill/settlement/money authority;
  #719 retains files/links/bytes; #721 retains account/identity/security state;
  notification owners retain production/delivery/preferences/history;
  sync/import/export/restore owners retain local/server acceptance.
- Existing invitation/auth/group/notification owners retain invitation
  lifecycle, delivery, target-binding, and accept-to-membership authority.
- Local personal-record/identity/import owners retain locally authoritative
  participant/reference representation and new server-acceptance handling.
- Day 1 requires stable temporary references and provenance-preserving later
  linking. Exact claim/link runtime scope remains unresolved, and fuller guest
  membership, governance, and participation polish remain Day 2. Search before
  creating any future focused issue.

## 10. Evidence Index

All repository citations refer to commit
`097dfc23e2064acc413aba654690b829008e0c34`.

| Evidence | Exact symbol / section | Fact supported |
| --- | --- | --- |
| `PROGRAM_ARCHITECTURE.md` | Authority Boundaries; Audit Coverage; Client Responsibility | API/domain authority, bounded audit, no client-derived authorization |
| `docs/prd/MVP_DAY1_SCOPE.md` | Expenses and bills; Shared groups; Notifications; Soft delete and archive | Temporary participants, API member access, history preservation, separate notification policy, no ordinary destructive history rewrite |
| `docs/architecture/GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md` | Member participation status; Historical record rule; defaults; authorization; notifications | Distinct active/default-excluded/left/removed concepts and intended effects, with current runtime disclaimer |
| `docs/architecture/BILL_SETTLEMENT_RECORD_LIFECYCLE_POLICY.md` | Historical Explainability; evidence index | Financial record/history ownership and participant/payer/split/settlement dependencies |
| `docs/architecture/STORAGE_FILE_LIFECYCLE_POLICY.md` | state models and ownership | File-object/link/byte lifecycle remains separate |
| `docs/architecture/AUTH_SECURITY_LIFECYCLE_POLICY.md` | account/identity lifecycle boundaries | Account, identity, credential, session, and invitation state remains separate |
| `docs/architecture/TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md` | `D1-CAND-019`; authority, identity, block/unfriend, provenance, denied/conflict rules | Accepted Day 1 lifecycle preservation/extension requirement; runtime unimplemented and exact release scope unresolved; fuller guest governance remains Day 2 |
| `docs/architecture/LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md` | mode matrix; boundary crossing; no silent merge | Local person/temporary identity may be local candidate data; it is not server authority and later import/link needs new acceptance |
| `docs/architecture/BILL_SETTLEMENT_RECORD_LIFECYCLE_POLICY.md` | `LOCAL-PART-001` | Local participant/share identity lifecycle is delegated to #720 while financial relationship facts remain #718-owned |
| `AuthInvitation`; auth invitation endpoints/services; `docs/architecture/AUTH_SECURITY_LIFECYCLE_POLICY.md` | account-registration create/accept/revoke/resend/expire lifecycle and absence of group/membership fields | Account-registration invitation runtime exists under #721/auth authority, but it has no group binding or accept-to-membership result and does not implement `INV-*` |
| `docs/architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md` | older current-user design limitations and invitation exclusions | Its pre-runtime invitation exclusion is stale relative to current source; source controls. It supplies no group-invitation or membership-entry authority |
| `docs/architecture/AUTH_IDENTITY_FOUNDATION.md` | older current-state invitation/runtime/table absence claims | Its account-invitation absence claims are stale relative to current source/migrations; source and #721 control. Its group-invitation and guest absence remains accurate |
| `docs/architecture/DATABASE_FOUNDATION.md` | older invitation-table/runtime absence and future-table statements | Its account-invitation absence/deferred-table prose is stale relative to current schema/runtime; it supplies no group-invitation authority |
| `UserGroup`; `SettleoraDbContext.ConfigureUserGroup` | `DeletedAtUtc`, restrictive creator FK | Current inactive marker capability without archive transition semantics |
| `GroupMembership`; `GroupMembershipStatuses`; `ConfigureGroupMembership` | composite key; `active`/`removed`; restrictive FKs | Current registered-user membership state/preservation |
| `BusinessAuthorizationService.GetActiveActorMembershipAsync` | active membership, non-deleted profile/group checks | Current group access authority |
| `GroupFoundationEndpoints.UpdateGroupAsync` and tests | owner authorization, tracked group load, unversioned name save | Current rename runtime; separate authorization/load/save permits stale-owner and concurrent last-write-win gaps; no rename audit |
| `GroupFoundationEndpoints` and tests | create/list/get/update; active/deleted filters | Current group runtime and no archive/reactivate endpoint |
| `GroupMemberManagementEndpoints` and tests | `LoadActiveProfileWithAccountAsync`; `LoadActiveMembershipAsync`; `CountActiveOwnersAsync`; add/update/remove | Current mutations and tombstone; add omits `DisabledAtUtc`; actor authorization, target load/absence, owner count, and write are separate, so stale-owner, same-target last-writer/duplicate-audit, and zero-owner races remain possible |
| `EfGroupMembershipAuditWriter` and audit tests | bounded safe metadata | Current success audit and redaction boundary |
| `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md` | Friends, Groups, And Membership | Accepted affected-recipient in-app baselines for invite create/accept and membership add/role-change/remove; notification read/archive changes neither invitation nor membership |
| OpenAPI `settleora.v1.yaml` | group/member paths and `GroupMembershipStatus` | Public current contract contains only active/removed membership |
| `GroupBillEndpoints.LoadActiveGroupMemberIdsAsync` and create/read handlers | active membership payload and access checks, without target-account availability or commit-time membership predicate | Ordinary future group-bill participation and visibility use active membership; an account-unavailable active member remains selectable and concurrent removal can race persistence |
| `GroupBillEndpoints.ListGroupBillsAsync`; `GetGroupBillAsync`; `ExpenseBillSearchQueries.VisibleGroupBillsIncludingArchived`; group export endpoints | current `CanAccessGroupAsync` followed by group-ID bill query without participant or membership-start predicate | A newly added active member can immediately list/read/export pre-membership group bills |
| `MonthlyReportEndpoints.VisibleBillsQuery`; reporting tests | current group access followed by unarchived group-ID query without participant or membership-start predicate | A newly added active member's group monthly report includes pre-membership group bills |
| `ExpenseBillReconciliationEndpoints.UpdateGroupBillReconciliationAsync`; reconciliation tests | current group access followed by unarchived group-ID bill load without participant or membership-start predicate | A newly added active member can mutate reconciliation status/note on pre-membership group bills |
| `FutureBillEndpoints.CreateFutureBillAsync`; `PostFutureBillAsync`; `LoadActiveGroupMemberIdsAsync` | create-time active-membership target loader separate from persistence; post-time actor check and stored participant/payer materialization | Target account availability is not checked; concurrent removal can race create, while posting does not revalidate stored target memberships and may notify a participant removed after future-bill creation |
| `RecurringBillEndpoints.CreateTemplateAsync`; `UpdateTemplateAsync`; `GenerateDraftAsync`; `LoadActiveGroupMemberIdsAsync` | active-membership target loading separate from persistence on template create/update and occurrence draft generation | Every current recurring group-bill selection path is target-account unaware and can race concurrent removal before save |
| `BillCsvImportEndpoints.ConfirmBillImportSessionAsync`; `CandidateJson`; import tests | confirmation actor check followed by stored-candidate deserialization | Confirmation does not revalidate every stored participant/payer, so membership removal after preflight can enter a new draft |
| `BillCsvImportEndpoints.GetBillImportSessionAsync`; `DiscardBillImportSessionAsync`; `LoadActorSessionAsync` | stored account/session/profile match without group-membership predicate | A removed group-session creator can still read review data or discard the import session |
| `ExpenseBillRevisionEndpoints.LoadVisibleBillAsync` and revision handlers | active group-membership predicates over creator, owner, every participant, and every payer | One former referenced person can block list/read/propose/review/apply operations for every otherwise eligible revision actor |
| expense entities and `SettleoraDbContext` mappings | participants, item splits, payers; restrictive profile/bill FKs | Stable registered-profile historical financial references |
| settlement entities and mappings | request/payment/party/group/source references; restrictive FKs | Stable settlement identity/reference graph |
| `SettlementCandidateGroupBillQuery`; `SettlementRequestGroupBillQuery`; tests | active creator plus `All` participant/payer membership predicates | One former participant currently blocks the entire group-bill candidate/request path, even for otherwise active parties |
| settlement candidate/basket/request/read/payment/proof/cancellation/dispute/residual/balance endpoints and tests | debtor/creditor active group-membership predicates and deleted-profile checks, without target `AuthAccount` availability | Current historical settlement access is narrower than intended future policy; an account-unavailable active counterparty can remain eligible while unable to act |
| `services/api/README.md` | group/member foundation and absent behavior inventory | Its broad invitation-absence statement is stale relative to account-registration runtime; current group runtime still lacks archive/restore, group invitation, guest, default-excluded/left, membership notification, and billing-default behavior |

The central source/prose divergence is deliberate in this record: accepted
requirements preserve historical references and allow only separately
authorized historical activity, while current group-scoped runtime often
requires active membership. Source controls current behavior. `MEM-CHOICE-006`
blocks any claim that the intended historical-access model is already accepted
or implemented.

## 11. Non-Goals, Stop Conditions, And Acceptance

This policy does not authorize runtime, schema/migration, API/OpenAPI/client,
UI/Figma, authorization/privacy semantics, notification delivery, account
linking, money/settlement behavior, file bytes/links, retention duration,
purge, destructive operation, deployment, secret, production, or Day 2 guest
implementation. It does not close #717/#716 or start #961.

Future implementation must stop when it would conflate default exclusion,
leaving, removal, group archive, or historical retention; infer access from
membership or historical linkage; infer notifications from access; rewrite
financial identity; cascade group reactivation to former members; restore a
role without current owner/actor/account/conflict checks; link a guest without
approved identity/privacy rules; treat direct owner-add as proof of the complete
invitation/entry policy; merge a local identity into server truth; or proceed
without applicable product,
authorization, privacy, identity, money, schema, contract, client, retention,
sync, or destructive gates.

Issue #720 policy acceptance requires exact one-file implementation scope;
every stable row above remaining distinguishable and source-grounded; all four
evidence classes remaining explicit; #960 field completeness; docs-only
validation; fresh independent and local Codex review on the exact head;
successful hosted checks/review; zero unresolved threads; and required
issue/parent/dependency hygiene.
