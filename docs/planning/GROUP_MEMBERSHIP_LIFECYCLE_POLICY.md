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
memberships, and server collaboration. The `LOCAL-*` rows therefore record
non-applicability rather than inventing a local group lifecycle.

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
- Current group membership transitions do not produce notifications.
  `NOTIFICATION_EVENT_TAXONOMY.md` nevertheless establishes an accepted,
  unimplemented in-app baseline for `group.membership_added`,
  `group.membership_role_changed`, and `group.membership_removed` when the
  transition affects the recipient. Recipient scoping, linked-resource
  reauthorization, preferences/mute behavior, and optional email/push remain
  notification-owner concerns and cannot be inferred from list visibility,
  access, default selection, or membership status.

## 4. Shared Reusable-Row Contract

Sections 5.1 through 5.5 are joined by stable row ID and together provide every
field required by the #960 reusable schema. The following exact values apply to
every row unless a cell overrides them:

- **Authority mode/workspace:** `GRP-*`, `MEM-*`, `GUEST-*`, and `HIST-*` are
  server mode inside one self-hosted workspace. `LOCAL-*` records the explicit
  Day 1 local-only non-applicability boundary: local mode has no groups,
  memberships, shared-group collaboration, or server-derived group authority.
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
  settings/history; `GUEST-001` has no current surface and reserves an approved
  bill create/edit flow; `GUEST-002` has no current surface and reserves the
  accepted provenance-preserving claim/link extension whose runtime/release
  lane remains unresolved; `HIST-001/002` are not independent user actions and use only
  separately authorized bill/settlement history surfaces; and `LOCAL-*` has no
  action surface because group membership/collaboration is unsupported in Day 1
  local mode. These surface names do not prove that a proposed control exists.
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
  are `TEMPORARY_IDENTITY_UNRESOLVED`; local group/membership rows are
  `LOCAL_GROUP_UNSUPPORTED` and have no lifecycle target. No duration is
  invented.
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
| `MEM-001` | Registered-user membership — **Add member** | Absent → active `member|owner`; active owner requests, API accepts an account with active status and no account/profile deletion, but does not check `DisabledAtUtc`; actor authority is not rebound atomically at save | Eligible for explicit group/future/recurring bill participant/payer selection; eligibility remains account-unaware after add, and current paths do not automatically select every active member | Current group/member access and role-bounded mutation eligibility; a status-active but disabled target can currently be added and later selected | Accepted `group.membership_added` in-app baseline for the affected recipient is unimplemented; exact recipient/policy handling remains notification-owned | **Implemented current fact with disabled/account-unavailable and stale-actor gaps; active eligibility is not automatic default selection.** `AddMemberAsync`; group/future/recurring/import member loaders; OpenAPI/tests. |
| `MEM-002` | Active membership role — **Change role** | Active role `member ↔ owner`; active owner/API, sequential last-owner guard; no atomic actor-authority or same-target prior-state predicate | Remains eligible; role does not itself rewrite participant defaults | Future owner authority changes after API acceptance; concurrent writes can last-write-win and an in-flight stale owner can still commit | Accepted `group.membership_role_changed` in-app baseline for the affected recipient is unimplemented; exact recipient/policy handling remains notification-owned | **Implemented current fact with target-account, stale-actor, and same-target concurrency gaps.** `UpdateMemberAsync`; tests; audited success. |
| `MEM-003` | Active membership — proposed **Exclude from defaults** | Active → default-excluded; requester/control unresolved | Not selected by default; manual inclusion only if separately authorized | Historical and any future-record access remains record-specific; no blanket access loss or gain | No new-record notification unless manually included; historical-event eligibility unresolved | **Documented Day 2 future extension; not Day 1 runtime.** Included because #720 requires the lifecycle distinction; `MEM-CHOICE-003/006/007/015`. |
| `MEM-004` | Default-excluded membership — proposed **Include in defaults** | Default-excluded → active; approved actor/API after revalidation | Becomes eligible for later defaults; no retroactive inclusion | No automatic access to prior or unrelated records | Notifications resume only for later eligible events, subject to policy/preferences | **Future acceptance requirement for the documented Day 2 extension; not Day 1 runtime.** `MEM-CHOICE-003/007/011/015`. |
| `MEM-005` | Active/default-excluded membership — proposed **Leave group** | Current participation → left; exact self-service/acceptance and last-owner behavior unresolved | Hidden/disabled for future defaults; not silently includable | No unrelated future access; historical access/settlement only if separately authorized | Uninvolved left members receive no future-activity notifications; events after an approved special inclusion remain unresolved under `MEM-CHOICE-007/015` | **Documented Day 2 future extension; not Day 1 runtime.** Included because #720 requires the lifecycle distinction; `MEM-CHOICE-004/006/007/014/015`. |
| `MEM-006` | Left membership — proposed **Rejoin / reactivate membership** | Left → active or a new active relationship; representation unresolved | Future eligibility only after current acceptance; no retroactive selection | Revalidate group, actor, account, role, duplicates/conflicts, and record authorization | No replay; later events only after accepted state/policy | **Unresolved product/authz choice for the documented Day 2 extension.** No runtime or accepted in-place-versus-new rule; not Day 1 runtime. `MEM-CHOICE-004/011/014`. |
| `MEM-007` | Active membership — **Remove member** | Active → removed tombstone; active owner/API; sequential last-owner guard is account-unaware, while owner-floor, actor-authority, and same-target prior-state are not atomic | Excluded from future active-member defaults, except already stored CSV/future-bill candidates can still materialize | Current group/member and most group bill/settlement paths fail closed; historical links remain stored | Accepted `group.membership_removed` in-app baseline for the affected recipient is unimplemented; historical/security eligibility remains separately unresolved | **Implemented current fact with viable-owner-floor, stale-actor, duplicate-success-audit, and zero-owner race gaps.** `RemoveMemberAsync`; `CountActiveOwnersAsync`; tests. |
| `MEM-008` | Removed membership — proposed **Restore / reactivate member** | Removed → active or replacement relationship; requester, approver, and API executor authority are unresolved; no transition exists | No eligibility until separately accepted | No access restoration from stable row/ID alone | No notification restoration or replay | **Unresolved product/authz choice; current runtime blocks add and restore.** `MEM-CHOICE-005/006/007/011/014`. |
| `GUEST-001` | Temporary bill participant — proposed **Add temporary participant** on bill flow, not group governance | No reference → stable temporary identity/reference; eligible requester role is unresolved and API/domain would execute only after current bill/context authorization | Never a group-wide default by inference; only explicit permitted bill/context selection | Limited record-specific access, if any, must be explicitly authorized; no account/group authority | Only an approved safe contact/delivery model may notify; none exists | **Documented accepted Day 1 requirement; runtime/schema unimplemented and actor-blocked.** Current financial rows require `UserProfileId`. `MEM-CHOICE-008/015`. |
| `GUEST-002` | Temporary reference — future **Claim / link account** | Unclaimed reference → linked account while retaining provenance; claimant, initiator, approver, canceller, and API decision authority are unresolved | Future eligibility comes from separately accepted membership/record inclusion | Linking does not rewrite history or grant unrelated access; token possession/placeholder creation confer no authority | No replay; future eligibility requires explicit policy and safe recipient resolution | **Documented accepted Day 1 lifecycle preservation requirement and actor-blocked extension point.** It authorizes no claim/link runtime; exact actors/release scope and fuller Day 2 guest governance remain `MEM-CHOICE-008`. |
| `HIST-001` | Bill participant, payer, item split/assignment, revision identity — **not independently removable** | Membership change leaves accepted references unchanged; stored CSV/future-bill candidates can materialize without target revalidation | No automatic future selection follows from historical linkage | Read/mutation only through bill-specific current authorization; group revisions require every creator/owner/participant/payer active | Notify only when event-specific authorization independently permits it; future posting currently notifies stored pending participants | **Implemented persistence plus documented invariant and current coupling gaps.** Expense/revision/future/import sources; `MEM-CHOICE-006/015`. |
| `HIST-002` | Settlement party/request/line/payment/allocation/residual identity — **not independently removable** | Membership change leaves settlement identities and links unchanged | No future group default follows | Current group settlement paths generally require active membership but are target-account unaware | Settlement notifications require event-specific current eligibility, not membership/default status alone | **Implemented persistence plus documented accepted invariant.** Settlement entities/mappings/endpoints; former-member and account-unavailable policy remains `MEM-CHOICE-006/007`. |
| `LOCAL-GRP-001` | Local-only group — **not available in Local Mode** | No transition: Day 1 local mode has no groups or shared-group collaboration | Not applicable | No local group access and no server access inference | Not applicable | **Documented accepted non-applicability.** `MVP_DAY1_SCOPE.md` and `AUTH_IDENTITY_FOUNDATION.md`; `MEM-CHOICE-012`. |
| `LOCAL-MEM-001` | Local-only group membership — **not available in Local Mode** | No transition: Day 1 local mode has no group membership relationship | Not applicable | No local membership authority and no server access inference | Not applicable | **Documented accepted non-applicability.** Same sources; `MEM-CHOICE-012`. |
| `LOCAL-HIST-001` | Local-only group historical participant reference — **not available in Local Mode** | No group-history transition exists; locally authoritative personal records remain outside this group-policy row | Not applicable | No group-history access authority; later server import is a new acceptance | No cross-boundary notification inference | **Documented accepted non-applicability for groups.** Generic local personal-record/import authority does not create groups; `MEM-CHOICE-012`. |

### 5.2 Mutation eligibility, reversibility, re-entry, dependencies, and blockers

| Exact row(s) | Mutation-eligibility effect | Reversibility | Re-entry / reactivation target and required revalidation | Dependency evidence and missing evidence |
| --- | --- | --- | --- | --- |
| `GRP-001` | Enables current active group operations | Creation is not “restore”; later archive is separate | Not applicable | Current profile/account, unique generated ID, owner membership, transaction. Missing idempotent create/replay and group audit. |
| `GRP-002/003` | Archive blocks ordinary new activity; reactivate may restore only group eligibility | Conditional; exact archive representation and actor unresolved | Target active group; revalidate actor authority, at least one viable owner path, account/identity state, memberships, policy, conflicts, holds, dependencies, and version | Bills, settlements, recurring templates, files/links, notifications/history, audit, sync/import/export/backup copies. Exact archive semantics and full graph are missing. |
| `MEM-001` | Add enables member operations | Add has no current remove reversal identity | Active membership; add checks actor ownership and target account/profile before mutation, but omits target `DisabledAtUtc` and does not atomically bind actor authority or absence of a duplicate to save | Disabled targets are accepted; group, future, recurring, and import active-member loaders omit target accounts. An owner demoted/removed after authorization can still commit. Missing account parity, atomic actor/duplicate predicate, denied/race coverage, version/idempotency, and denial audit. |
| `MEM-002` | Role change alters owner-only mutations prospectively | Role update is reversible subject to the current sequential guard | Active membership; update checks actor ownership, target membership/role, and owner count, but omits target account state and does not bind actor authority or target prior state to save | Owner count is account-unaware and count-then-write; two owners can both demote. Concurrent same-target changes last-write-win with separate success audits, and an owner revoked after authorization can commit. Atomic target-state/actor/viable-owner predicates, version/idempotency, and denial audit are missing. |
| `MEM-003/004` | Default exclusion blocks defaulting, not all manual inclusion, history, or access | Intended reversible, implementation absent | Target active membership; revalidate current group/account/role, authority, duplicate/conflict, and approved default policy | Bill/context presets, recurring templates, future drafts, group mute/preferences, pending invitations, audit, notification history. Exact default-control owner/manual-inclusion rules missing. |
| `MEM-005/006` | Left blocks ordinary new participation; outstanding historical actions are separately authorized | Conditional; in-place versus new relationship unresolved | Target active membership or new relationship; revalidate actor, group, account/identity, role, owner floor, duplicates/conflicts, outstanding obligations, policy, and version | Historical bills/settlements, owner role, invites, recurring records, files, notification history, audit, sync/import/export copies. Departure/re-entry contract missing. |
| `MEM-007` | Removed blocks current group/member and active-member-dependent operations; stored import/future candidates remain exceptions; row remains | Current transition has no restore; logical removal is not physical deletion | None in current runtime. Any future target requires all group/account/role/duplicate/owner/dependency/version checks | Owner guard is account-unaware/non-atomic; concurrent owners can remove to zero. Concurrent same-target removes can both emit success audit, and a stale-authority owner can commit. Missing atomic actor/target/viable-owner predicates, reason, version/idempotency, dependency impact, denial/conflict audit, and restore rule. |
| `MEM-008` | No current mutation is eligible; duplicate row blocks add | Unresolved | Active membership or new relationship only after `MEM-CHOICE-005`; no requester, approver, or executor is authorized until that choice is decided; then revalidate every blocker named for `MEM-006` and why removal occurred | Removed row, prior role/audit, historical records, policy/disciplinary hold if any, account state, owner floor, notification history. No accepted restore actor or transition contract. |
| `GUEST-001/002` | Placeholder can affect only explicitly accepted bill participation; cannot govern group or act as account | Claim/link is not reversal and must retain provenance | Linked reference plus separately accepted account/membership; claimant, initiator, approver, canceller, and API decision authority are unresolved; token possession and placeholder creation confer none; after approval revalidate proof of control, duplicate/conflicting identity, record authorization, privacy, consent, and applicable friendship/direct-sharing/block/unfriend state | Bill/settlement links, contact data, invitations, account/identity, friendship/direct-sharing/block/unfriend state, audit, notifications, exports/backups. Exact actors, entity, proof, conflict, unlink, relationship-policy, and privacy rules missing. |
| `HIST-001/002` | Membership transition cannot mutate historical money/identity; record-owner workflows remain separate | Not a membership reversal target | Not applicable; future membership re-entry never changes these rows | #718 financial graph; #719 files/links; #721 account/identity; notifications. Missing policy covers revision-wide all-member gates, account-unaware settlement counterparties, and confirmation/posting-time stored-reference revalidation. |
| `LOCAL-*` | No local or server group/membership mutation is eligible | Not applicable for Day 1 local groups because the record family is unsupported | No re-entry target; a future scope change would require explicit product approval before a row could exist | Current no-groups/no-collaboration authority is complete for this policy. Generic local personal-record, backup, and import rules do not create a group dependency graph. |

### 5.3 Metadata, retry/concurrency, retention/disposition, and audit

| Exact row(s) | Persisted metadata and operation mechanics | Retention / hard delete / purge | Audit and privacy specifics |
| --- | --- | --- | --- |
| `GRP-001` | Current stable ID, creator, create/update time, name, owner-membership time; no operation ID/version. An uncertain retry can create another group. | `MEMBERSHIP_HISTORY_RETAINED`; hard delete ineligible once dependencies exist; purge unresolved/separate. | Future create replay/conflict audit; name/private group content excluded from lifecycle metadata. |
| `GRP-002/003` | `DeletedAtUtc` exists but no actor/reason/version/archive operation. Future transition needs exact archived/reactivated metadata and atomic audit. | Retain group identity while any membership, bill, settlement, recurring, file/link, notification, audit, export/backup copy depends on it. Hard delete ineligible; purge unresolved. | Audit success/denial/block/conflict and owner-floor/dependency reason category; never enumerate private record contents. |
| `MEM-001/002` | Current composite ID, role/status, create/update time; no reason/version/idempotency/concurrency token. Duplicate-add check, actor authorization, target load, owner count, and write are separate. Same-target role writes last-write-win; repeated/simultaneous operations can emit multiple success audits; stale owners and two-owner demotions can commit. | Membership history retained; no hard delete; purge unresolved. | Current success audit is bounded. Add denial/conflict/replay, stale-actor, same-target conflict, same-state, and owner-floor race evidence need focused coverage. |
| `MEM-003..006/008` | No current fields or operations. Future state needs entered/left/reactivated time, actor, bounded reason, prior role/state, operation/correlation identity, and version. | Retain every former relationship and history link. Hard delete ineligible; purge unresolved. | Audit state changes plus material blocked attempts without exposing reason narrative or private records. |
| `MEM-007` | Current status and `UpdatedAtUtc`; no removed-at/actor/reason/version/idempotency/concurrency token. Sequential repeat fails after the first save, but simultaneous same-target removes can both update/audit; stale-owner authorization and two-owner removal can also commit. | Removed tombstone and dependencies retained; hard delete ineligible; purge unresolved/separate. | Current success audit is bounded. Add blocked/conflict/replay, stale-actor, duplicate-success-audit, same-target, and owner-floor race evidence later; never log request/contact/private payloads. |
| `GUEST-*` | No persistence exists. Future stable placeholder/reference ID must remain distinct from contact or account ID and retain create/link provenance, consent basis, version, and operation identity. | `TEMPORARY_IDENTITY_UNRESOLVED`; history-bearing reference hard delete ineligible. Any dependency-free draft placeholder and all purge remain unresolved. | Minimize contact/identity proof; never audit raw email/phone/invite token, identity proof, private bill data, or account-link payload. |
| `HIST-*` | Financial rows retain their own IDs, user/profile links, states, and timestamps under #718. Membership transition must not update them. | `MEMBERSHIP_HISTORY_RETAINED`; hard delete ineligible; purge follows #718/#724 and destructive gates, never this policy alone. | Membership audit may name bounded dependency categories/counts, not money, notes, payment details, OCR, files, or private payloads. |
| `LOCAL-*` | Persisted group/membership lifecycle metadata is not applicable because Day 1 local mode does not support these families. A later imported candidate receives a new server acceptance rather than inheriting group authority. | `LOCAL_GROUP_UNSUPPORTED`; there is no local group target to hard-delete or purge. Locally authoritative personal-record retention remains outside this policy. | No group lifecycle audit applies. Never represent local labels/cache/import metadata as server membership or audit authority. |

### 5.4 Implementation owner, unresolved choices, gates, and validation

| Exact row(s) | Open choices | Implementation status | Future owner / canonical lane | Manual gates and focused acceptance evidence |
| --- | --- | --- | --- | --- |
| `GRP-001` | `MEM-CHOICE-011` | Implemented current fact, replay/audit partial | Existing groups runtime → #722 after #961 | `G-PRODUCT` only if semantics change; conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; create atomicity/replay/audit tests. |
| `GRP-002/003` | `MEM-CHOICE-001/002/009/010/011/013/014` | Unimplemented | #961 synthesis → #722 group runtime/schema/API split; #723 UI; #724 retention | `G-PRODUCT/G-AUTHZ/G-RET/G-PRIV/G-CLIENT/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; archive/reactivate actor, owner continuity, dependency, concurrency, audit, notification, history tests. |
| `MEM-001/002` | `MEM-CHOICE-007/011/014/015` | Implemented current fact, mechanics/audit partial; add and every group/future/recurring selection loader are account-unaware; membership writes lack atomic actor, target-state, and owner-floor predicates; accepted notifications are unimplemented | Existing group-member and bill runtime; #722/#724 follow-up; notification owner | `G-AUTHZ/G-PRIV/G-RET`, conditional `G-PRODUCT/G-SCHEMA/G-CONTRACT/G-CLIENT`; disabled-at add and each group/future/recurring/import eligibility path; target-account promotion; stale-owner-at-commit; simultaneous same-target role/update and two-owner demotion; viable-owner; notification; duplicate/replay/stale-role tests. |
| `MEM-003/004` | `MEM-CHOICE-003/006/007/010/011/015` | Documented Day 2 future extension; unimplemented and not Day 1 runtime | #961 synthesis must preserve the Day 2 boundary before any later focused group/member lane; notification owner; #723 UI only when separately authorized | `G-PRODUCT/G-AUTHZ/G-PRIV/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; default-versus-access-versus-notification separation and manual-inclusion tests. |
| `MEM-005/006` | `MEM-CHOICE-004/006/007/010/011/014/015` | Documented Day 2 future extension; unimplemented and not Day 1 runtime | #961 synthesis must preserve the Day 2 boundary before any later focused group/member lane; #724 retention; #723 UI only when separately authorized | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; self/admin actor, owner floor, outstanding-history, re-entry, replay, notification tests. |
| `MEM-007` | `MEM-CHOICE-005/006/007/009/011/014/015` | Implemented removal with account-unaware and concurrency-unsafe actor/target/owner predicates; stored-reference exceptions remain; restoration absent; accepted removal notification unimplemented | Existing runtime then #722/#724; notification owner | Current fact needs no gate; changed semantics require `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; account-aware owner floor; stale-owner-at-commit; simultaneous same-target and two-owner removal; duplicate audit/replay; CSV/future posting after removal; dependency/history and notification evidence. |
| `MEM-008` | `MEM-CHOICE-005/006/007/010/011/014/015` | Unimplemented, actor-unresolved, and fail-closed | #961 → #722/#723/#724 | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; allowed/denied requester, approver, and API executor; reason/policy blocker, duplicate, owner/role, history, stale/replay tests. |
| `GUEST-*` | `MEM-CHOICE-008/009/010/011/015` | Day 1 temporary-reference and provenance-preserving later-link requirement unimplemented; creation and claim/link actors plus exact runtime scope unresolved; fuller guest governance Day 2 | Existing temporary-participant/account-link owners after #961; #723 UI; #724 retention | `G-PRODUCT/G-AUTHZ/G-PRIV/G-IDENTITY/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; allowed/denied creator, claimant, initiator, approver, canceller, and API executor; token/placeholder grants no governance authority; proof/consent, friendship/direct-sharing/block/unfriend denials, duplicate/link conflict, immutable history, notification privacy tests. |
| `HIST-*` | `MEM-CHOICE-006/007/009/015` | Persistence implemented; access policy incomplete; settlement and revision paths have all-member/account-state gaps; CSV confirmation and future posting can materialize stale stored references | #718 financial owner plus #722 authorization split; #724 retention; notification owner | `G-AUTHZ/G-PRIV/G-RET/G-MONEY/G-DEST` for changed behavior; immutable references; revision-wide former-member tests; settlement account-unavailable counterparty tests across candidate/basket/request/read/payment/proof/cancel/dispute/residual/balance; CSV confirmation and future-post target revalidation; notification/redaction tests. |
| `LOCAL-*` | `MEM-CHOICE-012` | Documented non-applicability: local groups/memberships are unsupported | No implementation owner; any scope proposal returns to product architecture before #722/#723/#724 | No downstream gate is required to preserve the current unsupported boundary. A proposed local-group scope change would require `G-PRODUCT/G-AUTHZ/G-PRIV/G-SYNC` and conditional `G-SCHEMA/G-CONTRACT/G-CLIENT/G-RET/G-DEST`. |

### 5.5 Exact hard-delete and purge fields

For `GRP-*`, `MEM-*`, and history-bearing `GUEST-*` and `HIST-*`
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
`LOCAL-*`, both hard-delete and purge eligibility are `not-applicable` because
the Day 1 local group/membership/history target does not exist; this is not a
claim that locally authoritative personal records are disposable.

## 6. Explicit Open Choices

| Choice ID | Affected authority domain | Exact answerable question | Why current authority does not decide it | Safe non-operative posture | Owner, blocked lane, manual gate |
| --- | --- | --- | --- | --- | --- |
| `MEM-CHOICE-001` | Server group root, memberships, and record-specific reads | Does group archival use `DeletedAtUtc`, a separate archive state, or another overlay, and exactly what remains readable/mutable? | A nullable column exists, but no endpoint, audit, wording, or accepted lifecycle semantics exist. | Do not expose archive/reactivate; current deleted-group paths fail closed. | #961 → #722 group/schema/API; #723 UI; `G-PRODUCT/G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-002` | Server group archive/reactivation actor authority | Who may archive or reactivate a group? | Current owner authority covers rename/member management only. | No actor is authorized for the unimplemented transitions. | Tommy/product-authz via #722/#723; `G-PRODUCT/G-AUTHZ/G-CLIENT`. |
| `MEM-CHOICE-003` | Server default-excluded membership and future selection | Is default exclusion self-service, owner/admin-controlled, or both, and who may manually include that person later? | Day 2 architecture describes effects but not decision authority. | No status transition or manual-inclusion exception; retain current active/removed Day 1 runtime. | #961 must preserve the Day 2 boundary; only a separately authorized later product/authz lane may route to #722/#723; `G-PRODUCT/G-AUTHZ/G-CLIENT`. |
| `MEM-CHOICE-004` | Server left membership and re-entry relationship | Is leaving self-service, owner-accepted, or another workflow, and does re-entry restore the row or create a new relationship? | Day 2 architecture names the state, but no left state, endpoint, metadata, or identity-history rule exists. | Do not implement leave/re-entry in Day 1; current membership remains unchanged. | #961 must preserve the Day 2 boundary; only a separately authorized later product/authz/schema lane may route to #722/#723/#724; `G-PRODUCT/G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-005` | Server removed membership/tombstone and reactivation | Can a removed/tombstoned membership ever regain active participation; if so, who may request it, who must approve it, which server authority executes it, and is the result an in-place restore or a new relationship? | Current add rejects any existing removed row, no restore exists, and current owner/self/admin authority defines none of those actors. | Removed remains removed; no actor may request, approve, or execute restoration, and no new eligibility or access arises. | Tommy/product-authz via #722/#724; `G-PRODUCT/G-AUTHZ/G-RET`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-006` | Server group membership plus bill/revision/settlement authorization | Which historical bill, revision, and settlement reads/mutations remain authorized after participation/account change; should one former creator/owner/participant/payer block every revision or settlement action; and when must target account availability block a counterparty workflow? | Revision operations require active membership for creator, owner, every participant and payer. Settlement paths use active membership but generally omit target account availability. Record-family historical policy is incomplete. | Preserve records and current fail-closed membership gates; do not infer access from history or treat account-unaware eligibility as accepted policy. Route changes to focused authorization/money owners. | #961 synthesis → focused group/financial authz owners; `G-AUTHZ/G-PRIV/G-MONEY`. |
| `MEM-CHOICE-007` | Server membership-derived and record-specific notification eligibility | Beyond the accepted affected-recipient in-app baselines for membership add, role change, and removal, which historical, settlement, policy, and security events may notify default-excluded, left, removed, or archived-group participants? | The taxonomy decides those three baselines, but no producer exists and other recipient/state eligibility is not fully specified; notification remains distinct from access/defaulting. | Preserve the accepted baseline requirement but produce no new runtime notification until its focused implementation passes recipient, reauthorization, preference/mute, block/unfriend, and redaction gates; leave other cases unresolved. | Notification owner with group/authz owner; `G-PRODUCT/G-AUTHZ/G-PRIV`. |
| `MEM-CHOICE-008` | Server temporary participant identity, account link, relationship policy, and record access | What stable placeholder model and release scope apply; who may claim, initiate, approve, cancel, or execute a link; and what proof/consent, friendship/direct-sharing/block/unfriend, conflict, and unlink rules preserve history? | Day 1 requires minimal temporary participation and provenance-preserving later linking; current schema requires registered profiles and no claim/link runtime or actor contract exists; fuller guest membership/governance is Day 2. | Do not infer authority from token possession, placeholder creation, contact data, or account identity. Preserve the original reference and extension requirement, but expose no claim/link action until every actor and focused gate is approved. | Temporary-participant/account-link owners after #961; `G-PRODUCT/G-IDENTITY/G-AUTHZ/G-PRIV`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-009` | Server group/membership/placeholder/history retention and copies | What retention clocks, holds, copy duties, and terminal purge eligibility apply to groups, memberships, placeholders, and historical links? | No authoritative duration or complete copy/dependency policy exists. | Retain; no physical delete or purge. | #724 plus domain owners; `G-RET/G-PRIV/G-DEST`. |
| `MEM-CHOICE-010` | Server lifecycle presentation and client wording | What exact confirmation, blocked-state, archive, leave, removal, and reactivation wording is approved? | Source code and issue text do not constitute final Figma/product wording. | No new UI action or confirmation. | #723/Figma and Tommy; `G-PRODUCT/G-CLIENT`. |
| `MEM-CHOICE-011` | Server group/membership mutation mechanics | What operation identity, expected version, and atomic actor-authority, target-prior-state, duplicate-absence, and owner-floor predicates govern retries/races, including stale-owner writes, same-target conflicts, and simultaneous owner demotion/removal? | Current entities have timestamps but no concurrency token/idempotency contract. Authorization, duplicate/target load, owner count, and write are separate, allowing stale actors, duplicate success audits, last-writer state, and zero owners. | Do not treat uncertain retries as replay or initial authorization as commit authority. Future writes must atomically prove actor, target prior state/absence, and owner floor or fail closed. | #722 API/schema owner; `G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT`. |
| `MEM-CHOICE-012` | Local-only mode boundary versus server groups/memberships | Should a future product-scope decision ever introduce local groups/memberships, contrary to the current Day 1 no-groups/no-collaboration rule? | Current authority answers Day 1—unsupported—but does not authorize or design any later scope change. | Keep all `LOCAL-*` group rows not applicable; generic local personal-record or import authority creates no group/membership. | No current implementation lane. Any later scope proposal returns to Tommy/product architecture; `G-PRODUCT/G-AUTHZ/G-PRIV/G-SYNC` before technical planning. |
| `MEM-CHOICE-013` | Server group archive cascade over memberships | Does archiving a group alter membership states, and what happens to them on group reactivation? | No source establishes cascade semantics. | Preserve membership rows and do not auto-change or auto-reactivate any member. | Product/authz owner via #722; `G-PRODUCT/G-AUTHZ`. |
| `MEM-CHOICE-014` | Server group owner continuity across membership transitions | How do archive, leave, default exclusion, removal, and re-entry preserve at least one account-available viable owner without granting stale authority, including under concurrent demotion/removal? | Current last-owner guard covers role demotion/removal only, counts account-unaware memberships, and is a non-atomic count-then-write vulnerable to a zero-owner race. | Block any new transition that would strand ownership; never restore old owner power automatically; do not describe the current sequential guard as concurrency-safe. | Product/authz owner via #722; `G-PRODUCT/G-AUTHZ`. |
| `MEM-CHOICE-015` | Server group membership, temporary-participant creation authority, and future bill/context selection | Who may create a temporary participant; when may non-active/account-unavailable/temporary people be included; and what target revalidation is mandatory at ordinary create, future/recurring create-update-generate, CSV confirmation, and future-bill posting? | All group/future/recurring loaders omit target accounts. CSV confirmation and future posting recheck the actor but materialize stored targets after membership can change; future posting also emits participant notifications. No placeholder actor contract exists. | Authorize no temporary actor or new exception. Preserve current account-unaware and stale-reference behavior only as documented facts; do not broaden or label it accepted policy before focused product/authz/money/notification decisions. | Group/bill product-money-authz/notification owners after #961; `G-PRODUCT/G-AUTHZ/G-MONEY/G-PRIV`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |

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
| Temporary reference | Never group-defaulted by inference | Stable reference/provenance preserved | Limited record-specific policy only | No approved generic delivery model | Later link must preserve provenance; exact runtime/release scope unresolved, fuller guest governance Day 2 |
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

## 8. Manual-Gate Registry

These gates are not required to merge this docs-only policy. They remain
pending for downstream changes; satisfying one never satisfies another.

| Gate ID | Required / status | Gate and owner | Downstream work blocked |
| --- | --- | --- | --- |
| `G-PRODUCT` | Yes / pending when an open choice selects behavior | Tommy/product owner | Archive, leave, exclusion, removal/reactivation, guest, wording, or future inclusion semantics not already accepted |
| `G-AUTHZ` | Yes / pending for changed accepted access/role semantics or runtime | Group/record authorization owner plus human review | Historical/future access, transition actors, role/owner continuity, notification acceptance |
| `G-IDENTITY` | Yes / pending for guest/account linking | Auth/identity and privacy owners | Placeholder proof, claim/link, conflict, unlink, consent |
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
| `UserGroup`; `SettleoraDbContext.ConfigureUserGroup` | `DeletedAtUtc`, restrictive creator FK | Current inactive marker capability without archive transition semantics |
| `GroupMembership`; `GroupMembershipStatuses`; `ConfigureGroupMembership` | composite key; `active`/`removed`; restrictive FKs | Current registered-user membership state/preservation |
| `BusinessAuthorizationService.GetActiveActorMembershipAsync` | active membership, non-deleted profile/group checks | Current group access authority |
| `GroupFoundationEndpoints` and tests | create/list/get/update; active/deleted filters | Current group runtime and no archive/reactivate endpoint |
| `GroupMemberManagementEndpoints` and tests | `LoadActiveProfileWithAccountAsync`; `LoadActiveMembershipAsync`; `CountActiveOwnersAsync`; add/update/remove | Current mutations and tombstone; add omits `DisabledAtUtc`; actor authorization, target load/absence, owner count, and write are separate, so stale-owner, same-target last-writer/duplicate-audit, and zero-owner races remain possible |
| `EfGroupMembershipAuditWriter` and audit tests | bounded safe metadata | Current success audit and redaction boundary |
| `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md` | Friends, Groups, And Membership | Accepted affected-recipient in-app baselines for membership add, role-change, and removal; producer unimplemented |
| OpenAPI `settleora.v1.yaml` | group/member paths and `GroupMembershipStatus` | Public current contract contains only active/removed membership |
| `GroupBillEndpoints.LoadActiveGroupMemberIdsAsync` and create/read handlers | active membership payload and access checks, without target-account availability | Ordinary future group-bill participation and visibility use active membership; an account-unavailable active member remains selectable |
| `FutureBillEndpoints.CreateFutureBillAsync`; `PostFutureBillAsync`; `LoadActiveGroupMemberIdsAsync` | create-time active-membership target loader; post-time actor check and stored participant/payer materialization | Target account availability is not checked; posting does not revalidate stored target memberships and may notify a participant removed after future-bill creation |
| `RecurringBillEndpoints.CreateTemplateAsync`; `UpdateTemplateAsync`; `GenerateDraftAsync`; `LoadActiveGroupMemberIdsAsync` | active-membership target loading on template create/update and occurrence draft generation | Every current recurring group-bill selection path is target-account unaware |
| `BillCsvImportEndpoints.ConfirmBillImportSessionAsync`; `CandidateJson`; import tests | confirmation actor check followed by stored-candidate deserialization | Confirmation does not revalidate every stored participant/payer, so membership removal after preflight can enter a new draft |
| `ExpenseBillRevisionEndpoints.LoadVisibleBillAsync` and revision handlers | active group-membership predicates over creator, owner, every participant, and every payer | One former referenced person can block list/read/propose/review/apply operations for every otherwise eligible revision actor |
| expense entities and `SettleoraDbContext` mappings | participants, item splits, payers; restrictive profile/bill FKs | Stable registered-profile historical financial references |
| settlement entities and mappings | request/payment/party/group/source references; restrictive FKs | Stable settlement identity/reference graph |
| `SettlementCandidateGroupBillQuery`; `SettlementRequestGroupBillQuery`; tests | active creator plus `All` participant/payer membership predicates | One former participant currently blocks the entire group-bill candidate/request path, even for otherwise active parties |
| settlement candidate/basket/request/read/payment/proof/cancellation/dispute/residual/balance endpoints and tests | debtor/creditor active group-membership predicates and deleted-profile checks, without target `AuthAccount` availability | Current historical settlement access is narrower than intended future policy; an account-unavailable active counterparty can remain eligible while unable to act |
| `services/api/README.md` | group/member foundation and absent behavior inventory | Current runtime explicitly lacks archive/restore, guest, default-excluded/left, notification, and billing-default behavior |

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
approved identity/privacy rules; or proceed without applicable product,
authorization, privacy, identity, money, schema, contract, client, retention,
sync, or destructive gates.

Issue #720 policy acceptance requires exact one-file implementation scope;
every stable row above remaining distinguishable and source-grounded; all four
evidence classes remaining explicit; #960 field completeness; docs-only
validation; fresh independent and local Codex review on the exact head;
successful hosted checks/review; zero unresolved threads; and required
issue/parent/dependency hygiene.
