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
records are authoritative within their local application/domain boundary, but
the current mobile source does not implement a local group/membership lifecycle
store; the `LOCAL-*` rows therefore record accepted boundaries and evidence
gaps rather than invented behavior.

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
- Last-active-owner demotion and removal return conflict. Removed actors cannot
  access group/member endpoints, removed rows are omitted from member lists,
  and no restore/reactivation endpoint exists.
- Successful add, role update, and removal write `group_member.added`,
  `group_member.role_updated`, and `group_member.removed` auth audit events.
  Metadata is bounded to workflow, group/member IDs, and role/status categories.
  Current code does not audit every denial, conflict, or group create/rename.
- `default_excluded` and `left` are documented planning states but are absent
  from current domain constants, schema constraints, API/OpenAPI, endpoints,
  and tests. The Day 2 architecture describes their intended participation
  meaning; #720 requires them to remain distinct in the Day 1 lifecycle policy.

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
- Current group bill create validates every submitted participant and payer
  against the active group-member set. Thus current removed memberships are
  excluded from new group bills.
- Current group bill reads and most group settlement reads/mutations require
  current active group membership; several settlement queries also require the
  debtor, creditor, and requester to retain active membership. Tests prove that
  a removed group debtor cannot read counterparty payment details and that
  removed membership fails closed on protected file/payment paths.
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
- Fuller guest/accountless group membership, claiming, governance, and UX are
  Day 2. #720 preserves extension points and history only; it does not pull that
  runtime into Day 1.
- Current group membership transitions do not create group activity
  notifications. Existing notification delivery eligibility is a separate
  authorization/policy decision and cannot be inferred from list visibility,
  data access, default selection, or membership status.

## 4. Shared Reusable-Row Contract

Sections 5.1 through 5.5 are joined by stable row ID and together provide every
field required by the #960 reusable schema. The following exact values apply to
every row unless a cell overrides them:

- **Authority mode/workspace:** `GRP-*`, `MEM-*`, `GUEST-*`, and `HIST-*` are
  server mode inside one self-hosted workspace. `LOCAL-*` is local-only within
  the local application/domain authority boundary.
- **Decision authority and live state:** `PROGRAM_ARCHITECTURE.md` authority,
  audit, client, and privacy boundaries; `MVP_DAY1_SCOPE.md` “Shared groups,”
  “Expenses and bills,” “Notifications,” and “Soft delete and archive”;
  `GROUP_MEMBERSHIP_PARTICIPATION_ARCHITECTURE.md`; and #720, verified open on
  2026-09-17 UTC with #960/#718/#719/#721 complete. Implementation evidence is
  cited separately and never creates policy authority.
- **Authoritative boundary:** API/domain/policy services for server rows and the
  future local application/domain service for local rows. Clients do not
  accept transitions or derive authorization.
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
  are `TEMPORARY_IDENTITY_UNRESOLVED`; local authoritative rows are
  `LOCAL_AUTHORITY_UNIMPLEMENTED`. No duration is invented.
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
| `MEM-001` | Registered-user membership — **Add member** | Absent → active `member|owner`; active owner requests, API accepts for active registered account | Selected by default for future group participation under current create paths/policy | Current group/member access and role-bounded mutation eligibility | Relevant notifications only if an event producer plus authorization/preferences accepts them | **Implemented current fact.** `GroupMemberManagementEndpoints.AddMemberAsync`; OpenAPI/tests. Existing active or removed row conflicts. |
| `MEM-002` | Active membership role — **Change role** | Active role `member ↔ owner`; active owner/API, last-owner guard | Remains eligible; role does not itself rewrite participant defaults | Future owner authority changes only after API acceptance; history unchanged | Role/security notification eligibility is separate and unimplemented | **Implemented current fact.** `UpdateMemberAsync`; tests; audited success. |
| `MEM-003` | Active membership — proposed **Exclude from defaults** | Active → default-excluded; requester/control unresolved | Not selected by default; manual inclusion only if separately authorized | Historical and any future-record access remains record-specific; no blanket access loss or gain | No new-record notification unless manually included; historical-event eligibility unresolved | **Documented accepted requirement; runtime unimplemented.** Day 2 architecture plus #720; `MEM-CHOICE-003/006/007/015`. |
| `MEM-004` | Default-excluded membership — proposed **Include in defaults** | Default-excluded → active; approved actor/API after revalidation | Becomes eligible for later defaults; no retroactive inclusion | No automatic access to prior or unrelated records | Notifications resume only for later eligible events, subject to policy/preferences | **Future acceptance requirement; runtime unimplemented.** `MEM-CHOICE-003/007/011/015`. |
| `MEM-005` | Active/default-excluded membership — proposed **Leave group** | Current participation → left; exact self-service/acceptance and last-owner behavior unresolved | Hidden/disabled for future defaults; not silently includable | No unrelated future access; historical access/settlement only if separately authorized | No future group activity notifications; exact historical/security eligibility unresolved | **Documented accepted requirement; runtime unimplemented.** `MEM-CHOICE-004/006/007/014`. |
| `MEM-006` | Left membership — proposed **Rejoin / reactivate membership** | Left → active or a new active relationship; representation unresolved | Future eligibility only after current acceptance; no retroactive selection | Revalidate group, actor, account, role, duplicates/conflicts, and record authorization | No replay; later events only after accepted state/policy | **Unresolved product/authz choice.** No runtime or accepted in-place-versus-new rule. `MEM-CHOICE-004/011/014`. |
| `MEM-007` | Active membership — **Remove member** | Active → removed tombstone; active owner/API; last-active-owner removal blocked | Excluded from all future active-member defaults/current group bill create | Current group/member and most group bill/settlement paths fail closed; historical links remain stored | No membership notification currently produced; future historical/security eligibility unresolved | **Implemented current fact.** `RemoveMemberAsync`; authorization and endpoint tests; audited success. |
| `MEM-008` | Removed membership — proposed **Restore / reactivate member** | Removed → active or replacement relationship; no transition exists | No eligibility until separately accepted | No access restoration from stable row/ID alone | No notification restoration or replay | **Unresolved product/authz choice; current runtime blocks add and restore.** `MEM-CHOICE-005/006/007/011/014`. |
| `GUEST-001` | Temporary bill participant — proposed **Add temporary participant** on bill flow, not group governance | No reference → stable temporary identity/reference under bill authority | Never a group-wide default by inference; only explicit permitted bill/context selection | Limited record-specific access, if any, must be explicitly authorized; no account/group authority | Only an approved safe contact/delivery model may notify; none exists | **Documented accepted Day 1 requirement; runtime/schema unimplemented.** Current financial rows require `UserProfileId`. `MEM-CHOICE-008/015`. |
| `GUEST-002` | Temporary reference — future **Claim / link account** | Unclaimed reference → linked account while retaining original reference/provenance | Future eligibility comes from separately accepted membership/record inclusion | Linking does not rewrite history or grant unrelated access | No replay; future eligibility requires explicit policy and safe recipient resolution | **Day 2 extension point; not Day 1 runtime.** `TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md`; `MEM-CHOICE-008`. |
| `HIST-001` | Bill participant, payer, item split/assignment, revision identity — **not independently removable** | Membership change leaves the accepted financial references unchanged | No automatic future selection follows from historical linkage | Read/mutation only through bill-specific current authorization | Notify only when event-specific authorization independently permits it | **Implemented persistence plus documented accepted invariant.** Expense entities/mappings use restrictive references; financial policy owns money/history. Current historical access after removal often fails closed. |
| `HIST-002` | Settlement party/request/line/payment/allocation/residual identity — **not independently removable** | Membership change leaves settlement identities and links unchanged | No future group default follows | Settlement access/mutation remains settlement-specific; current group paths generally require active memberships | Settlement notifications require event-specific current eligibility, not membership/default status alone | **Implemented persistence plus documented accepted invariant.** Settlement entities/mappings/endpoints; exact post-change access remains `MEM-CHOICE-006/007`. |
| `LOCAL-GRP-001` | Local-only group — future local **Archive / reactivate** | Local domain accepts an exact local transition; server import is a new server acceptance | Must be explicit in local policy | Local authorization only; no server access inference | Local notification policy separate | **Documented authority; exact local runtime unimplemented.** `MEM-CHOICE-012`. |
| `LOCAL-MEM-001` | Local-only membership/participation — future local status transition | Local active/default-excluded/left/removed transition under local authority | Same distinctions required; no vague inactive state | Local record-specific authorization only | Separate from defaults/access | **Documented authority; exact local runtime unimplemented.** `MEM-CHOICE-012`. |
| `LOCAL-HIST-001` | Local-only historical participant reference — retained local history | Membership change preserves local accepted financial identity; later import never rewrites server history | No future eligibility by inference | Local authorization; server sees only separately accepted imported data | No cross-boundary notification inference | **Documented accepted requirement; persistence/import contract unimplemented.** `MEM-CHOICE-012`. |

### 5.2 Mutation eligibility, reversibility, re-entry, dependencies, and blockers

| Exact row(s) | Mutation-eligibility effect | Reversibility | Re-entry / reactivation target and required revalidation | Dependency evidence and missing evidence |
| --- | --- | --- | --- | --- |
| `GRP-001` | Enables current active group operations | Creation is not “restore”; later archive is separate | Not applicable | Current profile/account, unique generated ID, owner membership, transaction. Missing idempotent create/replay and group audit. |
| `GRP-002/003` | Archive blocks ordinary new activity; reactivate may restore only group eligibility | Conditional; exact archive representation and actor unresolved | Target active group; revalidate actor authority, at least one viable owner path, account/identity state, memberships, policy, conflicts, holds, dependencies, and version | Bills, settlements, recurring templates, files/links, notifications/history, audit, sync/import/export/backup copies. Exact archive semantics and full graph are missing. |
| `MEM-001/002` | Add enables member operations; role change alters owner-only mutations prospectively | Add has no current remove reversal identity; role update is reversible subject to last-owner guard | Active membership; current operations revalidate active group/profile/account, actor owner role, duplicate row, target role, and owner count | Current source checks active account/profile, duplicate membership, group/actor access, last owner. Missing version/idempotency/denial audit. |
| `MEM-003/004` | Default exclusion blocks defaulting, not all manual inclusion, history, or access | Intended reversible, implementation absent | Target active membership; revalidate current group/account/role, authority, duplicate/conflict, and approved default policy | Bill/context presets, recurring templates, future drafts, group mute/preferences, pending invitations, audit, notification history. Exact default-control owner/manual-inclusion rules missing. |
| `MEM-005/006` | Left blocks ordinary new participation; outstanding historical actions are separately authorized | Conditional; in-place versus new relationship unresolved | Target active membership or new relationship; revalidate actor, group, account/identity, role, owner floor, duplicates/conflicts, outstanding obligations, policy, and version | Historical bills/settlements, owner role, invites, recurring records, files, notification history, audit, sync/import/export copies. Departure/re-entry contract missing. |
| `MEM-007` | Removed blocks current group/member and active-member-dependent bill/settlement operations; row remains | Current transition has no restore; logical removal is not physical deletion | None in current runtime. Any future target requires all group/account/role/duplicate/owner/dependency/version checks | Current last-owner/active-row checks and restrictive references. Missing reason, version, idempotency, full dependency impact, denial/conflict audit, restore rule. |
| `MEM-008` | No current mutation is eligible; duplicate row blocks add | Unresolved | Active membership or new relationship only after `MEM-CHOICE-005`; revalidate every blocker named for `MEM-006` and why removal occurred | Removed row, prior role/audit, historical records, policy/disciplinary hold if any, account state, owner floor, notification history. No accepted restore contract. |
| `GUEST-001/002` | Placeholder can affect only explicitly accepted bill participation; cannot govern group or act as account | Claim/link is not reversal and must retain provenance | Linked reference plus separately accepted account/membership; revalidate proof of control, duplicate/conflicting identity, record authorization, privacy, and consent | Bill/settlement links, contact data, invitations, account/identity, audit, notifications, exports/backups. Exact entity, proof, conflict, unlink, and privacy rules missing. |
| `HIST-001/002` | Membership transition cannot mutate historical money/identity; record-owner workflows remain separate | Not a membership reversal target | Not applicable; future membership re-entry never changes these rows | #718 financial graph; #719 files/links; #721 account/identity; notification history. Current references are restrictive, but complete post-membership access policy is missing. |
| `LOCAL-*` | No server mutation follows from local state; import is separately authorized | Conditional under unimplemented local policy | Exact local target plus current local authority; server acceptance revalidates independently | Local persistence, backup, export/import, conflict, identity-link, and notification evidence missing. |

### 5.3 Metadata, retry/concurrency, retention/disposition, and audit

| Exact row(s) | Persisted metadata and operation mechanics | Retention / hard delete / purge | Audit and privacy specifics |
| --- | --- | --- | --- |
| `GRP-001` | Current stable ID, creator, create/update time, name, owner-membership time; no operation ID/version. An uncertain retry can create another group. | `MEMBERSHIP_HISTORY_RETAINED`; hard delete ineligible once dependencies exist; purge unresolved/separate. | Future create replay/conflict audit; name/private group content excluded from lifecycle metadata. |
| `GRP-002/003` | `DeletedAtUtc` exists but no actor/reason/version/archive operation. Future transition needs exact archived/reactivated metadata and atomic audit. | Retain group identity while any membership, bill, settlement, recurring, file/link, notification, audit, export/backup copy depends on it. Hard delete ineligible; purge unresolved. | Audit success/denial/block/conflict and owner-floor/dependency reason category; never enumerate private record contents. |
| `MEM-001/002` | Current composite ID, role/status, create/update time; no reason/version/idempotency. Sequential duplicate add conflicts; repeated same-role update is accepted/audited again. | Membership history retained; no hard delete; purge unresolved. | Current success audit is bounded. Add denial/conflict/replay and same-state semantics need focused evidence. |
| `MEM-003..006/008` | No current fields or operations. Future state needs entered/left/reactivated time, actor, bounded reason, prior role/state, operation/correlation identity, and version. | Retain every former relationship and history link. Hard delete ineligible; purge unresolved. | Audit state changes plus material blocked attempts without exposing reason narrative or private records. |
| `MEM-007` | Current status and `UpdatedAtUtc`; no removed-at/actor/reason/version/idempotency field on membership. One accepted call writes status/audit; repeat sees no active row and fails closed. | Removed tombstone and dependencies retained; hard delete ineligible; purge unresolved/separate. | Current `group_member.removed` success audit stores bounded IDs/status. Add blocked/conflict/replay evidence later; never log request body or target identifier. |
| `GUEST-*` | No persistence exists. Future stable placeholder/reference ID must remain distinct from contact or account ID and retain create/link provenance, consent basis, version, and operation identity. | `TEMPORARY_IDENTITY_UNRESOLVED`; history-bearing reference hard delete ineligible. Any dependency-free draft placeholder and all purge remain unresolved. | Minimize contact/identity proof; never audit raw email/phone/invite token, identity proof, private bill data, or account-link payload. |
| `HIST-*` | Financial rows retain their own IDs, user/profile links, states, and timestamps under #718. Membership transition must not update them. | `MEMBERSHIP_HISTORY_RETAINED`; hard delete ineligible; purge follows #718/#724 and destructive gates, never this policy alone. | Membership audit may name bounded dependency categories/counts, not money, notes, payment details, OCR, files, or private payloads. |
| `LOCAL-*` | Exact local IDs, version, actor, reason, operation identity, backup/copy and server-import state are unimplemented. | `LOCAL_AUTHORITY_UNIMPLEMENTED`; authoritative local data is not disposable cache. Hard-delete/purge eligibility unresolved. | Local audit/redaction and import evidence remain `MEM-CHOICE-012`; never upload raw local logs as authority proof. |

### 5.4 Implementation owner, unresolved choices, gates, and validation

| Exact row(s) | Open choices | Implementation status | Future owner / canonical lane | Manual gates and focused acceptance evidence |
| --- | --- | --- | --- | --- |
| `GRP-001` | `MEM-CHOICE-011` | Implemented current fact, replay/audit partial | Existing groups runtime → #722 after #961 | `G-PRODUCT` only if semantics change; conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; create atomicity/replay/audit tests. |
| `GRP-002/003` | `MEM-CHOICE-001/002/009/010/011/013/014` | Unimplemented | #961 synthesis → #722 group runtime/schema/API split; #723 UI; #724 retention | `G-PRODUCT/G-AUTHZ/G-RET/G-PRIV/G-CLIENT/G-DEST`, conditional `G-SCHEMA/G-CONTRACT`; archive/reactivate actor, owner continuity, dependency, concurrency, audit, notification, history tests. |
| `MEM-001/002` | `MEM-CHOICE-007/011/014` | Implemented current fact, mechanics/audit partial | Existing group-member runtime; #722/#724 follow-up | `G-AUTHZ/G-PRIV/G-RET`, conditional `G-PRODUCT/G-SCHEMA/G-CONTRACT/G-CLIENT`; duplicate, last-owner, hostile payload, replay, stale-role, redaction tests. |
| `MEM-003/004` | `MEM-CHOICE-003/006/007/010/011/015` | Documented-only/unimplemented | #961 → #722 group/member runtime; notification owner; #723 UI | `G-PRODUCT/G-AUTHZ/G-PRIV/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; default-versus-access-versus-notification separation and manual-inclusion tests. |
| `MEM-005/006` | `MEM-CHOICE-004/006/007/010/011/014/015` | Documented-only/unimplemented | Same group/member split; #724 retention; #723 UI | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; self/admin actor, owner floor, outstanding-history, re-entry, replay, notification tests. |
| `MEM-007` | `MEM-CHOICE-005/006/007/009/011/014` | Implemented removal; restoration absent | Existing runtime then #722/#724 | Current fact needs no new gate; changed semantics require `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; exact current tests plus dependency/history and replay evidence. |
| `MEM-008` | `MEM-CHOICE-005/006/007/010/011/014/015` | Unimplemented and fail-closed | #961 → #722/#723/#724 | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; reason/policy blocker, duplicate, owner/role, history, stale/replay tests. |
| `GUEST-*` | `MEM-CHOICE-008/009/010/011/015` | Day 1 minimal requirement unimplemented; claim/link Day 2 | Existing temporary-participant/account-link owners after #961/#722; #723 UI; #724 retention | `G-PRODUCT/G-AUTHZ/G-PRIV/G-IDENTITY/G-RET/G-CLIENT`, conditional `G-SCHEMA/G-CONTRACT`; no governance authority, proof/consent, duplicate/link conflict, immutable history, notification privacy tests. |
| `HIST-*` | `MEM-CHOICE-006/007/009` | Persistence implemented; post-change access policy incomplete | #718 financial owner plus #722 authorization split; #724 retention; notification owner | `G-AUTHZ/G-PRIV/G-RET/G-MONEY/G-DEST` for changed runtime/disposition; immutable-reference, record-specific access, settlement eligibility, redaction tests. |
| `LOCAL-*` | `MEM-CHOICE-009/012` | Authority documented; exact runtime unimplemented | local/mobile and sync-import-export-restore lanes after #961/#722/#724 | `G-PRODUCT/G-AUTHZ/G-PRIV/G-RET/G-SYNC/G-DEST`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`; local authority, offline conflict, backup/copy, import acceptance, history tests. |

### 5.5 Exact hard-delete and purge fields

For `GRP-*`, `MEM-*`, and history-bearing `GUEST-*`, `HIST-*`, and `LOCAL-*`
rows, `hard_delete_eligibility.status = ineligible` when the subject is
authoritative or history-bearing; `target_classification = group, membership,
participant identity, or historical reference evidence`; conditions are
unsatisfied; and ordinary consequence warning/confirmation are not applicable
because no ordinary hard-delete action is authorized. A positively proven
dependency-free, unaccepted temporary placeholder remains
`hard_delete_eligibility.status = unresolved`, with target classification,
dependency/copy proof, authority, audit, concurrency, warning, confirmation,
`G-RET`, and `G-DEST` all pending.

For every row, `purge_disposal_eligibility.status = unresolved` and
`separate_action = required`. Conditions are an approved retention class,
clock and expiry; no hold; positive dependency evidence including financial,
file/link, auth/identity, notification history, audit, sync/import/export,
backup/snapshot/replica copies; current authority; bounded audit; retry and
concurrency proof; consequence warning; explicit confirmation; and all
applicable `G-RET/G-PRIV/G-DEST` gates. This policy approves none of them.

## 6. Explicit Open Choices

| Choice ID | Exact answerable question | Why current authority does not decide it | Safe non-operative posture | Owner, blocked lane, manual gate |
| --- | --- | --- | --- | --- |
| `MEM-CHOICE-001` | Does group archival use `DeletedAtUtc`, a separate archive state, or another overlay, and exactly what remains readable/mutable? | A nullable column exists, but no endpoint, audit, wording, or accepted lifecycle semantics exist. | Do not expose archive/reactivate; current deleted-group paths fail closed. | #961 → #722 group/schema/API; #723 UI; `G-PRODUCT/G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-002` | Who may archive or reactivate a group? | Current owner authority covers rename/member management only. | No actor is authorized for the unimplemented transitions. | Tommy/product-authz via #722/#723; `G-PRODUCT/G-AUTHZ/G-CLIENT`. |
| `MEM-CHOICE-003` | Is default exclusion self-service, owner/admin-controlled, or both, and who may manually include that person later? | Architecture describes effects but not decision authority. | No status transition or manual-inclusion exception; retain current active/removed runtime. | Product/authz owner via #722/#723; `G-PRODUCT/G-AUTHZ/G-CLIENT`. |
| `MEM-CHOICE-004` | Is leaving self-service, owner-accepted, or another workflow, and does re-entry restore the row or create a new relationship? | No left state, endpoint, metadata, or identity-history rule exists. | Do not implement leave/re-entry; current membership remains unchanged. | Product/authz/schema owners via #722/#723/#724; `G-PRODUCT/G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-005` | Can a removed/tombstoned membership ever regain active participation, and if so in place or as a new relationship? | Current add rejects any existing removed row and no restore exists. | Removed remains removed; no new eligibility or access. | Tommy/product-authz via #722/#724; `G-PRODUCT/G-AUTHZ/G-RET`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-006` | Which historical bill/settlement reads and mutations remain authorized after default exclusion, leaving, removal, or group archival? | Planning permits historical access where authorized, while current group paths generally require active membership; record-family rules are incomplete. | Preserve records but retain current fail-closed access; do not infer access from history. | #961 synthesis → focused group/financial authz owners; `G-AUTHZ/G-PRIV/G-MONEY`. |
| `MEM-CHOICE-007` | Which new, historical, settlement, policy, and security events may notify default-excluded, left, removed, or archived-group participants? | Notification eligibility is not implemented or fully specified and is distinct from access/defaulting. | Produce no new membership-derived notification; existing source-specific policy remains unchanged. | Notification owner with group/authz owner; `G-PRODUCT/G-AUTHZ/G-PRIV`. |
| `MEM-CHOICE-008` | What stable placeholder model, proof/consent, conflict rule, and claim/link semantics support temporary participants without rewriting history? | Day 1 requires minimal temporary participation; current schema requires registered profiles; fuller claim/link is Day 2. | Do not invent placeholder/account authority or linking; preserve the extension requirement only. | Temporary-participant/account-link owners after #961; `G-PRODUCT/G-IDENTITY/G-AUTHZ/G-PRIV`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |
| `MEM-CHOICE-009` | What retention clocks, holds, copy duties, and terminal purge eligibility apply to groups, memberships, placeholders, and historical links? | No authoritative duration or complete copy/dependency policy exists. | Retain; no physical delete or purge. | #724 plus domain owners; `G-RET/G-PRIV/G-DEST`. |
| `MEM-CHOICE-010` | What exact confirmation, blocked-state, archive, leave, removal, and reactivation wording is approved? | Source code and issue text do not constitute final Figma/product wording. | No new UI action or confirmation. | #723/Figma and Tommy; `G-PRODUCT/G-CLIENT`. |
| `MEM-CHOICE-011` | What operation identity and expected version govern create/status/reactivation retries and races? | Current entities expose timestamps but no membership/group concurrency token or idempotency contract. | Do not treat uncertain retries as safe replay; future writes must fail closed until defined. | #722 API/schema owner; `G-AUTHZ`, conditional `G-SCHEMA/G-CONTRACT`. |
| `MEM-CHOICE-012` | What exact local-only group/membership/history store, lifecycle, backup, and server-import acceptance contract applies? | Architecture defines authority boundaries, but current mobile source implements no such domain store. | Do not classify local authoritative data as cache or submit it as accepted server state. | Local/mobile plus sync/import/export/restore owners; `G-PRODUCT/G-AUTHZ/G-PRIV/G-SYNC/G-RET`. |
| `MEM-CHOICE-013` | Does archiving a group alter membership states, and what happens to them on group reactivation? | No source establishes cascade semantics. | Preserve membership rows and do not auto-change or auto-reactivate any member. | Product/authz owner via #722; `G-PRODUCT/G-AUTHZ`. |
| `MEM-CHOICE-014` | How do archive, leave, default exclusion, removal, and re-entry preserve at least one viable owner without granting stale owner authority? | Current last-owner guard covers role demotion/removal only. | Block any new transition that would strand ownership; never restore old owner power automatically. | Product/authz owner via #722; `G-PRODUCT/G-AUTHZ`. |
| `MEM-CHOICE-015` | When may default-excluded, left, removed, or temporary participants be explicitly included in a future bill/context? | Existing runtime accepts only active registered group members; prose leaves special/manual flows incomplete. | Only current active registered members remain eligible in existing group create paths. | Group/bill product-money-authz owners after #961; `G-PRODUCT/G-AUTHZ/G-MONEY`, conditional `G-SCHEMA/G-CONTRACT/G-CLIENT`. |

These choices do not block this documentation task because their safe posture
preserves current behavior and history. Selecting an answer is a separate
product, privacy, authorization, identity, money, schema, contract, UI,
notification, retention, sync, or destructive gate.

## 7. Invariants And State Effects

| Participation state | Future default selection | Historical identity/reference | Access/visibility | Notification eligibility | Reactivation posture |
| --- | --- | --- | --- | --- | --- |
| Active | Eligible/selected under current applicable policy | Preserved | Current API authorization | Event authorization + policy/preferences | Already active |
| Default-excluded | Not selected by default; manual inclusion unresolved | Preserved | Record-specific; no unrelated future access | New uninvolved events no; other cases unresolved | Conditional to active after current checks |
| Left | Hidden/disabled for future defaults | Preserved | Historical only where separately authorized | Future group activity no; historical/security unresolved | In-place versus new relationship unresolved |
| Removed/tombstoned | Ineligible | Preserved | Current runtime generally fails closed | No current membership event; future cases unresolved | No current path; eligibility unresolved |
| Temporary reference | Never group-defaulted by inference | Stable reference/provenance preserved | Limited record-specific policy only | No approved generic delivery model | Claim/link is separate Day 2 extension |
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
- Temporary-participant account claim/link, fuller guest membership,
  governance, and participation polish remain Day 2 except for Day 1 stable
  reference preservation. Search before creating any future focused issue.

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
| `docs/architecture/TEMPORARY_PARTICIPANT_CLAIM_LINK_FLOW.md` | architecture-only claim/link flow | Day 2 extension reference, not implemented Day 1 authority |
| `UserGroup`; `SettleoraDbContext.ConfigureUserGroup` | `DeletedAtUtc`, restrictive creator FK | Current inactive marker capability without archive transition semantics |
| `GroupMembership`; `GroupMembershipStatuses`; `ConfigureGroupMembership` | composite key; `active`/`removed`; restrictive FKs | Current registered-user membership state/preservation |
| `BusinessAuthorizationService.GetActiveActorMembershipAsync` | active membership, non-deleted profile/group checks | Current group access authority |
| `GroupFoundationEndpoints` and tests | create/list/get/update; active/deleted filters | Current group runtime and no archive/reactivate endpoint |
| `GroupMemberManagementEndpoints` and tests | add/update/remove, duplicate and last-owner guards, active-only reads | Current membership mutations, removal tombstone, and fail-closed behavior |
| `EfGroupMembershipAuditWriter` and audit tests | bounded safe metadata | Current success audit and redaction boundary |
| OpenAPI `settleora.v1.yaml` | group/member paths and `GroupMembershipStatus` | Public current contract contains only active/removed membership |
| `GroupBillEndpoints.LoadActiveGroupMemberIdsAsync` and create/read handlers | active membership payload and access checks | Current future participation and group bill visibility require active membership |
| expense entities and `SettleoraDbContext` mappings | participants, item splits, payers; restrictive profile/bill FKs | Stable registered-profile historical financial references |
| settlement entities and mappings | request/payment/party/group/source references; restrictive FKs | Stable settlement identity/reference graph |
| settlement read/mutation endpoints and tests | active group membership checks; removed-member fail-closed cases | Current historical settlement access is narrower than intended future policy |
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
