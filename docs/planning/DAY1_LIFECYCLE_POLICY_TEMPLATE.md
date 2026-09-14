# Day 1 Lifecycle Policy Taxonomy And Child Template

## Purpose And Authority

This document gives [#718](https://github.com/tommytang213/Settleora/issues/718),
[#719](https://github.com/tommytang213/Settleora/issues/719),
[#720](https://github.com/tommytang213/Settleora/issues/720), and
[#721](https://github.com/tommytang213/Settleora/issues/721) a shared vocabulary
and output shape. It is a planning prerequisite for the lifecycle-policy chain
under [#717](https://github.com/tommytang213/Settleora/issues/717) and
[#716](https://github.com/tommytang213/Settleora/issues/716).

This template does not choose a lifecycle state, transition, retention period,
read rule, mutation rule, restore outcome, or purge eligibility for any record
family. Each child remains authoritative for its domain rows and must cite the
current source that supports every decision. An empty or unresolved field is a
visible blocker, not permission to infer behavior.

The [program architecture](../../PROGRAM_ARCHITECTURE.md) remains authoritative:
API/domain services own server-mode lifecycle mutation acceptance,
authorization, dependency checks, policy application, status transitions, and
audit, and server-mode clients own presentation rather than accepted domain
state. In local-only mode, the local app data store and its local domain
boundary may accept locally authoritative records under the
[local/server authority audit](../architecture/LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md);
that authority must not cross into server records by implication. File bytes
remain behind the storage abstraction, server financial truth remains
API/domain-owned, and workers do not directly mutate core business tables.

## Canonical Shared Vocabulary

Terms describe different intents. A child may map them to domain-specific
states only with cited evidence; it must not use one term as an alias for
another merely because a UI has one generic button.

| Term | Neutral shared meaning | Required distinction |
| --- | --- | --- |
| **archive** | Remove a record from ordinary active views or workflows while preserving the authoritative record and required history. A domain must decide whether and how it can re-enter. | Archive is not purge. It is not proof that reads, mutations, dependencies, or retention duties all stop. |
| **trash** | A user-visible holding or review concept for content that has been logically removed and may be restorable or awaiting a separate disposition decision. It need not be an internal state name. | Trash is not automatically terminal disposal and does not itself authorize a retention timer or purge. |
| **soft delete** | Apply a retained logical-deletion state or marker that stops the domain-defined ordinary use without physically destroying the authoritative target. The domain child must name the exact state, read effect, dependencies, and restoration eligibility. | Soft delete is not automatically archive or placement in the user-visible Trash, and is never hard delete or purge. Those mappings require explicit domain evidence rather than a shared assumption. |
| **restore** | Request or perform an authorized record-lifecycle transition from a non-terminal inactive condition toward a specifically named eligible state after current policy is re-evaluated. | Restore is not silent reactivation. The target state, actor, preconditions, dependency checks, conflicts, and post-restore eligibility must be explicit. Local backup restore, server consistency-set restore, and product import/export restore are separate recovery or portability operations governed by the [local/server import/export boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md), not this record-lifecycle term. |
| **cancel** | Stop or withdraw a workflow from further ordinary progression under domain rules while preserving required facts and evidence. | Cancel is not necessarily delete, archive, revoke, or purge, and need not erase earlier transitions. |
| **revoke** | Invalidate a grant, credential, session, factor, invitation, link, or other authority so it cannot be used as previously authorized. | Revoke is not physical deletion or automatic account disablement. Evidence may need retention even though reusable material must be unusable. |
| **disable** | Prevent use, entry, or policy eligibility for a subject or capability, commonly through a reversible administrative or policy condition. | Disable is not necessarily revoke. Whether existing grants or sessions are revoked is a separate domain decision. |
| **expire** | End validity because a defined time or policy condition was reached, rather than because an actor necessarily initiated the transition. | Expire may be policy- or time-driven and is not automatically revoke, archive, trash, or purge. |
| **quarantine** | Isolate or restrict a subject because validation, safety, policy, integrity, or review is unresolved. Ordinary access or processing is constrained. | Quarantine is not ordinary archive. Release, rejection, retention, and disposal each require their own authorized outcome. |
| **purge** | Terminally dispose of the eligible target content or record material that a domain policy explicitly permits to be destroyed. Required bounded tombstone or audit evidence may remain where policy requires it. | Purge is not an ordinary user-visible delete or hard delete. It is irreversible for the disposed target and always requires a separate action, consequence warning, explicit confirmation, authority, retention eligibility, dependency proof, audit, policy controls, and every manual/destructive gate. |
| **hard / physical delete** | Immediately and physically remove an eligible target rather than placing it in archive or Trash or waiting for a later purge workflow. Day 1 authority permits this only as a conditional outcome for positively dependency-free drafts or bounded non-authoritative temporary/orphan material where domain policy allows it. | Hard delete is not archive, Trash, or purge. It requires explicit domain eligibility, actor and authority, consequence warning, confirmation when user-initiated, complete dependency proof, audit, concurrency handling, and every applicable manual/destructive gate; an unresolved dependency makes it ineligible. |
| **temporary cleanup** | Remove positively identified non-authoritative scratch, cache, staging, or failed temporary material under a bounded cleanup policy. | Temporary cleanup is not permission to delete authoritative records, accepted business data, required history, or material with an unresolved link. |
| **orphan cleanup** | Reconcile or remove a positively proven unreferenced or inconsistent resource after proving that no authoritative record or required dependency relies on it. | Orphan cleanup is not permission to treat an unknown, inaccessible, or weakly linked record as disposable. Missing evidence blocks cleanup. |

The following supporting concepts are required because the children and the
[Day 1 scope](../prd/MVP_DAY1_SCOPE.md) use them:

| Concept | Neutral shared meaning |
| --- | --- |
| **reactivate / re-enter** | A domain-approved return to a named usable or workflow-eligible state. This may follow restore, re-enable, re-link, or another explicit transition, but those actions are not interchangeable. |
| **retention classification** | The cited rule or unresolved classification that determines how long data or evidence must be retained and what review is required before disposition. |
| **retention expiry** | Evidence that a retention condition or time window ended. It is not an action and does not itself prove purge eligibility; current dependencies, holds, authority, and disposal policy still apply. |
| **logical removal** | A non-physical state or relationship change that stops defined ordinary use while retaining the target or its evidence. A child must name what was made inactive and what remains. |

Domain children may use additional precise terms such as `reject`, `rotate`,
`replace`, or `unlink` when their current sources require them. They must define
the term locally and must not rewrite one of the shared terms by implication.

## User Action Is Not The State Model

A user-visible verb is presentation, not domain authority. For example, a
button labelled “Remove” might request a link transition, an archive
transition, or revocation; the label alone proves none of those outcomes.

Every child row must keep these questions separate:

| Field | What the child must record |
| --- | --- |
| Domain / record family | Exact subject governed by the row, including whether it is a root, dependent record, relationship, material, or projection. |
| Authority mode / workspace | Exact local-only or server workspace and authority boundary. Use separate rows whenever authority, transition acceptance, or runtime-acceptance behavior differs. |
| Decision authority and implementation evidence | Cite current policy/architecture authority separately from source, test, runtime, issue, or PR evidence. Pin revisions or record live-state verification for issue/PR sources; implementation evidence does not create policy authority. |
| User-visible action | Exact proposed wording and surface, or `not user-visible`. Do not derive state names from the wording. |
| Internal state / transition | Source state, requested transition, target state or outcome, and the authoritative component that accepts it. |
| Actor / authority | Who may request, approve, deny, or execute the transition, and which API/domain/policy boundary is authoritative. |
| Preconditions | Authorization, current state, concurrency, confirmation, ownership, policy, and other entry requirements. |
| Ordinary-read effect | What disappears, remains readable, or becomes restricted, for which authorized audiences. |
| Mutation-eligibility effect | Which future mutations remain allowed, become blocked, or need a different workflow. |
| Reversibility | Whether the exact transition is reversible and what evidence supports that classification. |
| Re-entry / reactivation eligibility | Named target state, actor, revalidation, blockers, and whether re-entry is distinct from restore. |
| Dependency evidence | Cited dependent records, history, files, settlements, sessions, notifications and retained notification history, audit, sync/import/restore state, backup/export/snapshot/replica copies and their disposition, or an explicit evidence gap. |
| Persisted lifecycle metadata | Applicability and cited requirements for authoritative timestamps, actor, reason, restoration, purge/disposal, version/concurrency, and other lifecycle metadata. |
| Idempotency / replay / concurrency | Required idempotency key or equivalent, duplicate/replay outcome, retry result, and authoritative concurrent-conflict behavior for the transition. |
| Retention classification | Current cited class/rule, unresolved classification, holds, and clock trigger; never an invented duration. |
| Hard-delete eligibility | `eligible`, `ineligible`, or `unresolved`, separately from purge, with cited target classification, dependency proof, authority, audit, confirmation posture, and required manual/destructive gate. |
| Purge / disposal eligibility | `eligible`, `ineligible`, or `unresolved`, with cited conditions, separate-action consequence warning, explicit confirmation, and required manual/destructive gate. Retention expiry alone is insufficient. |
| Audit evidence | Required success, denial, blocked-attempt, actor, subject, reason, correlation, and transition evidence, bounded to safe metadata. |
| Privacy / redaction | Data that must be suppressed, minimized, encrypted/protected, or shown only to an authorized audience. |
| Client-presentation implication | Required wording, readout, unavailable/blocked state, warning, confirmation, refresh, accessibility, or conflict presentation without client-side authority. |
| Unresolved product choice | Stable reference to a complete open-choice record, or `none` only when current authority answers the question. |
| Implementation status | Truthful evidence state such as `documented-only`, `unimplemented`, `partial`, or `implemented`, with source/test/runtime citations. |
| Follow-up lane / owner | Canonical domain lane and focused owner/issue; do not assign implementation to the synthesis task. |
| Manual-gate posture | One separately identified entry for every applicable product, destructive, security, storage/privacy, money, schema, API/OpenAPI, UI/Figma, deployment, or operational gate. Each entry carries its own owner, `pending`, `satisfied`, `not-required`, or `unresolved` status, approval evidence, and blocked downstream work. Every required gate defaults to `pending`; satisfying one never satisfies another by implication. |
| Runtime-acceptance evidence | Exact automated, integration, hostile/concurrency, migration, UI, operational, or manual evidence later required; planning text is never runtime proof. |

## Reusable Child Row Schema

Create one entry for each materially different transition. Do not combine
distinct roots, dependent records, relationship rows, file objects, reusable
security material, or local-only and server authority modes merely to shorten
the matrix. Authority mode is part of row identity: use separate rows whenever
the authority boundary, transition acceptance, or runtime-acceptance behavior
differs. Use `unresolved` plus an open-choice record when current authority is
insufficient.

```yaml
policy_row:
  row_id: "<child-owned stable id>"
  domain_record_family: "<exact record, relationship, material, or projection>"
  authority_mode_workspace: "<local-only/server and exact workspace boundary>"
  decision_authority:
    sources:
      - "<current policy/architecture document and exact section>"
    issue_pr_live_state_verification:
      - "<issue/PR, pinned revision or verification timestamp, and current state>"
  implementation_evidence:
    - "<separate source/test/runtime citation and exact revision>"
  user_visible_action:
    wording: "<exact label or not user-visible>"
    surface: "<surface or not applicable>"
  internal_state_transition:
    source_state: "<state or not applicable>"
    transition: "<requested/accepted transition>"
    target_state_or_outcome: "<named outcome; unresolved if unknown>"
    authoritative_boundary: "<API/domain/policy owner>"
  actor_authority:
    requester: "<actor>"
    approver_or_executor: "<actor/service>"
    authorization_source: "<policy/source>"
  preconditions:
    - "<authorization/state/concurrency/confirmation/policy requirement>"
  ordinary_read_effect: "<audience-specific effect>"
  mutation_eligibility_effect: "<allowed/blocked/rerouted mutations>"
  reversibility:
    classification: "<reversible/irreversible/conditional/unresolved>"
    evidence: "<citation or open-choice ref>"
  reentry_reactivation_eligibility:
    outcome: "<eligible/ineligible/conditional/unresolved>"
    target_state: "<named state or not applicable>"
    required_revalidation: ["<current checks>"]
    blockers: ["<dependency, hold, conflict, lockout, or policy blocker>"]
  dependency_evidence:
    required_checks: ["<dependency categories and citations, including backup/export/snapshot/replica disposition where applicable>"]
    missing_evidence: ["<unknowns; empty only when proven complete>"]
  persisted_lifecycle_metadata:
    applicability: "<applicable/not-applicable/unresolved with reason>"
    required_fields: ["<timestamp/actor/reason/restoration/disposal/version or other cited fields>"]
    evidence: ["<authority citation or open-choice ref>"]
  idempotency_replay_concurrency:
    idempotency_key_or_equivalent: "<requirement or unresolved>"
    duplicate_or_replay_outcome: "<authoritative result or unresolved>"
    retry_result: "<result returned after timeout/retry or unresolved>"
    concurrency_conflict: "<authoritative stale/racing-transition outcome or unresolved>"
  retention_note_classification:
    classification: "<cited class or unresolved>"
    clock_or_trigger: "<cited trigger; do not invent duration>"
    holds_or_exceptions:
      - "<holds/exceptions>"
  hard_delete_eligibility:
    status: "<eligible/ineligible/unresolved>"
    target_classification: "<dependency-free draft/non-authoritative temporary/orphan/other or unresolved>"
    conditions: ["<dependency, authority, audit, concurrency, and gate conditions>"]
    consequence_warning: "<required wording/evidence, not user-initiated, or unresolved>"
    explicit_confirmation: "<required mechanism/evidence when user-initiated, not user-initiated, or unresolved>"
  purge_disposal_eligibility:
    status: "<eligible/ineligible/unresolved>"
    conditions: ["<retention, dependency including retained copies, authority, and policy conditions>"]
    separate_action: "<required; cite planned boundary or unresolved>"
    consequence_warning: "<required wording/evidence or unresolved>"
    explicit_confirmation: "<required mechanism/evidence or unresolved>"
  audit_note:
    applicability: "<applicable/not-applicable/unresolved with authority evidence>"
    required_events:
      - "<success/denial/blocked-attempt categories>"
    actor: "<required/applicability and evidence>"
    action: "<required/applicability and evidence>"
    subject: "<required/applicability and evidence>"
    timestamp: "<required/applicability and evidence>"
    reason: "<required/applicability and evidence>"
    correlation_id: "<required/applicability and evidence>"
    transition_evidence: "<required/applicability and evidence>"
    additional_safe_metadata:
      - "<other bounded fields>"
  privacy_redaction_note:
    protections:
      - "<suppressed/minimized/protected data>"
  client_implication:
    required_presentation:
      - "<wording/readout/warning/blocked state>"
    prohibited_inference: "<what the client must not decide>"
  unresolved_choice_refs:
    - "<choice id or none>"
  implementation_status:
    state: "<documented-only/unimplemented/partial/implemented>"
    evidence:
      - "<exact source/test/runtime evidence>"
  follow_up_owner_lane:
    owner_or_issue: "<focused owner/issue>"
    canonical_lane: "<lane>"
  manual_gates:
    - gate_id: "<stable id for one exact gate>"
      required: "<yes/no/unresolved>"
      gate_and_owner: "<exact gate and decision owner>"
      status: "<pending/satisfied/not-required/unresolved; required defaults to pending>"
      approval_evidence: ["<exact approval reference; empty while pending>"]
      downstream_work_blocked: ["<issue/lane/transition blocked until this gate is satisfied>"]
  validation_evidence_required:
    - "<exact future validation and runtime-acceptance evidence>"
```

Formatting may be a Markdown table, YAML, or equivalent structured data, but
no field above may be silently omitted. If a table would hide detail, use one
section per row and keep the same field names.

## Explicit Open-Choice Rule

Unresolved choices remain unresolved. A child must not select a behavior,
state, retention period, authority, or safe default merely to complete its
matrix. Each unresolved choice must have a stable ID referenced by every
affected policy row and must record all of the following:

```yaml
open_choice:
  choice_id: "<child-owned stable id>"
  exact_question: "<one answerable question>"
  affected_authority_domain: "<record families and authority boundary>"
  why_current_sources_cannot_answer: "<missing, conflicting, or stale evidence>"
  safe_default_or_blocked_posture: "<only a currently defined default; otherwise blocked>"
  decision_owner_manual_gate: "<owner and exact manual gate>"
  downstream_work_blocked:
    - "<issue, lane, transition, contract, UI, or acceptance work>"
```

If no safe default is already defined, the safe posture is to block the
affected transition or implementation recommendation. “TBD” without the full
record above is incomplete.

## Child Output Checklist

Every Wave 2 child must:

- use the shared vocabulary without collapsing distinct actions;
- provide all reusable-row fields for every in-scope transition;
- cite current authority and distinguish documented intent, implemented
  runtime, and required acceptance evidence; issue/PR evidence must carry a
  pinned revision or live-state verification;
- split local-only and server rows whenever their authority or acceptance
  behavior differs;
- define idempotency/replay, concurrency, retry result, and persisted lifecycle
  metadata applicability for every mutation transition;
- record contradictions and missing evidence as open choices;
- leave unrelated domains to their source children; and
- split implementation follow-ups by canonical lane and preserve every
  existing manual gate.

### #718 — Financial Records

- Cover each record family named by #718 without choosing policy for files,
  membership, auth, or other children.
- Preserve financial history, deterministic explainability, and rebuildable
  reports/balances from authoritative source evidence.
- Keep API/domain services authoritative for money, lifecycle mutation,
  settlement state, revision impact, authorization, and audit.
- Cite settlement, payment, allocation/residual, revision, participant, payer,
  split, report, recurring-occurrence, file, notification and retained
  notification history, sync/import/restore, and audit dependencies where
  applicable; an unknown dependency is a blocker.
- Do not assume destructive deletion or purge eligibility for confirmed,
  settled, shared, revision-dependent, or otherwise authoritative history.
- Keep conditional hard delete for positively dependency-free drafts separate
  from retention/admin/Trash purge; missing dependency evidence blocks both.

### #719 — File Objects And Attachment Links

- Model the provider-neutral file-object lifecycle separately from each
  subject-link or attachment lifecycle wherever their state can differ.
- Preserve stable file IDs, storage abstraction, API authorization, privacy or
  vault boundaries, and provider-internal redaction.
- Distinguish logical removal, subject-link removal, object state, provider
  state, quarantine, retention, restore/reactivation, failed-upload handling,
  orphan proof, and terminal purge.
- Map receipt source, OCR source, proof, QR image, supporting attachment,
  generated package, thumbnail/preview, and temporary-upload purposes without
  forcing identical policy across those purposes.
- Require positive dependency evidence and retry/idempotency evidence before
  cleanup; inability to read or find a link is not orphan proof.
- Do not choose provider operations, retention periods, byte-disposal policy,
  or purge authority in the shared template.

### #720 — Groups, Memberships, And Historical Participants

- Keep current/future membership or activity eligibility separate from
  historical participation and identity/reference preservation.
- Record effects on future default selection, future visibility,
  notifications, mutation eligibility, and authorized access to historical
  bills or settlements separately.
- Preserve original participant, payer, split, settlement, guest/temporary
  participant, linkage, and audit references; account claim/link must not
  silently rewrite history.
- Treat re-entry, reactivation, inclusion in a future record, and historical
  access as distinct questions.
- Do not define money, notification-delivery, account-linking runtime, or
  physical purge policy owned elsewhere.

### #721 — Authentication And Security

- Keep credential state, session/family state, factor/passkey state, account
  state, identity-link state, role assignment, invitation/reset material,
  challenge/ceremony state, and auth audit evidence separate.
- Keep revoke, disable, session invalidation, expire, rotate/replace, unlink,
  retain, retention expiry, and purge distinct; loss of usability does not
  imply removal of required security evidence.
- Require reusable passwords, bearer/refresh material, recovery codes, reset or
  invitation material, MFA secrets, and passkey private material to remain
  absent from lifecycle examples, logs, audit, or retained evidence.
- Record invitation/reset one-time and expiry semantics separately from account
  or credential state, and record retention/redaction evidence without
  inventing purge behavior.
- Require lockout-safe owner/admin posture for account disablement,
  re-enablement, role changes, provider unlinking, credential/factor actions,
  and recovery; unresolved lockout effects remain manual-gated.

## #717 / #961 Synthesis Rule

The final synthesis in [#961](https://github.com/tommytang213/Settleora/issues/961)
may assemble and normalize the Wave 2 outputs under these rules:

- each merged child source remains authoritative for its domain rows;
- #961 may normalize shared term labels and field ordering without rewriting a
  child's policy decision, evidence classification, or open choice;
- contradictions are surfaced with both sources and owners, not silently
  resolved;
- unresolved choices stay unresolved and continue to block their named
  downstream work;
- no policy is inferred across domains merely because two rows use the same
  action word or state label;
- implementation recommendations retain their original canonical lane, owner,
  dependency order, reviewer tier, and manual-gate posture; and
- planning or synthesis evidence never becomes a runtime-support claim.

After #961, the existing graph continues through
[#722](https://github.com/tommytang213/Settleora/issues/722) for the
contract/schema split, [#723](https://github.com/tommytang213/Settleora/issues/723)
for the separately approved manual/Figma reference, and
[#724](https://github.com/tommytang213/Settleora/issues/724) for the
retention/dependency policy. A merged synthesis does not authorize scheduling
cross-record lifecycle runtime ahead of those applicable downstream outputs
and gates.

#717 closes only after #960, all four Wave 2 children, and #961 merge and are
reconciled under their live close rules. #716 remains open unless its separate
program close criteria are independently satisfied.

## Non-Goals And Stop Conditions

This document does not authorize or implement runtime behavior, schema or
migrations, API/OpenAPI/generated clients, UI/Figma, Docker/CI/deployment or
configuration, secrets, file-byte operations, financial calculation,
settlement transition, auth/security runtime, physical purge, destructive
cleanup, production operations, or any domain-specific lifecycle choice.

Stop a child or follow-up when current sources conflict, dependency evidence is
missing, restore would imply silent reactivation, cleanup lacks positive
non-authoritative proof, purge lacks explicit domain eligibility, or a required
product/manual/destructive/security/storage/money/schema/API/UI/deployment gate
has not been satisfied.
