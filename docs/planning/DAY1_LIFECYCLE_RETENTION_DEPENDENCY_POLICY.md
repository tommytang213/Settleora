# Day 1 Lifecycle Retention, Dependency, And Terminal-Disposition Policy

Issue: [#724](https://github.com/tommytang213/Settleora/issues/724)

Program parent: [#716](https://github.com/tommytang213/Settleora/issues/716)

Synthesis prerequisite: [#961](https://github.com/tommytang213/Settleora/issues/961)

## 1. Status, Authority, And Safe Use

This document is the shared Day 1 **planning contract** for retention
classification, holds, positive dependency evidence, copy evidence, blocked
disposition, and future terminal-disposition admission. The four source-domain
policies remain authoritative for their rows, choices, gates, and eligibility
decisions:

- [financial records](../architecture/BILL_SETTLEMENT_RECORD_LIFECYCLE_POLICY.md);
- [file objects and links](../architecture/STORAGE_FILE_LIFECYCLE_POLICY.md);
- [groups, memberships, and historical participants](GROUP_MEMBERSHIP_LIFECYCLE_POLICY.md); and
- [auth and security](../architecture/AUTH_SECURITY_LIFECYCLE_POLICY.md).

The [#961 synthesis](DAY1_LIFECYCLE_POLICY_MATRIX.md) remains the provenance
index for 16 families, 16 gaps, all 118 open choices, and 19 handoff packets.
This policy does not select any open choice, approve any gate, or make #724 a
cross-domain deletion service. Each source domain decides whether its subject
is eligible; later maintenance may proceed only from positive, version-bound
evidence supplied by every applicable owner.

No exact duration, statutory rule, automatic schedule, provider deletion
semantic, backup-destruction rule, financial-history disposal rule,
credential-evidence cleanup rule, privacy tradeoff, or Day 1 scope reduction
is chosen here. If authority is incomplete, the classification is
`RC-X-UNRESOLVED` and terminal disposition is blocked.

This document changes no runtime, schema/migration, API/OpenAPI/generated
client, UI/Figma, provider, file byte, configuration, secret, deployment,
production, money, authorization, privacy, or security behavior.

## 2. Terms

| Term | Planning meaning |
| --- | --- |
| **retention class** | A source-owned classification describing why a subject or bounded evidence must remain and what evidence is needed before reconsideration. It is not a duration. |
| **hold** | A source-owned condition that suspends disposition regardless of an elapsed clock or requested action. |
| **reference dependency** | A live or historical relationship whose explainability, authorization, accounting, security, synchronization, or audit meaning requires the subject or an approved tombstone. |
| **copy dependency** | A server, provider, device, browser, package, export, backup, snapshot, replica, derivative, staging, or other copy whose existence or disposition must be accounted for separately. |
| **tombstone** | Minimum non-secret, non-content evidence retained to preserve identity, collision/replay protection, lineage, denial reason, or historical reference after another state changes. Its fields and lifetime remain source-owned. |
| **logical removal** | A reversible or conditionally reversible state/relationship change that stops defined ordinary use without claiming physical erasure. Archive, revoke, disable, unlink, and link removal remain distinct. |
| **physical disposition** | A change to bytes or stored material. It requires target-specific authority and never follows merely from logical state. |
| **terminal disposition** | The separately accepted end-state workflow after retention, hold, dependency, copy, audit, concurrency, and manual-gate proof. It may retain a tombstone. |
| **purge** | A source-approved terminal-disposition operation; never an ordinary delete synonym or automatic effect of retention expiry. |
| **orphan candidate** | A derived classification for an object with a complete, consistent-snapshot reference inventory that currently finds no required references. It is not a state, proof of disposal eligibility, or deletion authority. |
| **failed-upload candidate** | Material associated with an upload whose metadata, byte, provider, association, and commit outcomes require reconciliation. Failure or missing response is not disposal proof. |
| **provider result** | A provider-neutral, bounded outcome tied to one operation and target; it excludes paths, keys, URLs, credentials, and provider internals. |
| **unknown outcome** | A timeout, cancellation, fault, missing response, or partial workflow for which commit, provider, copy, audit, or association state is not positively known. It blocks terminal disposition. |
| **keep-forever eligibility** | A source-owner determination that the authoritative record or minimum evidence may be retained without a scheduled terminal-disposition clock. This policy only defines eligibility for that decision; it does not choose it. |
| **disposition blocker** | A stable reason showing which positive proof, decision, or gate is absent. |
| **evidence snapshot** | A race-safe, time-bound, subject/version-bound set of source attestations collected for one dry run or operation attempt. It expires on relevant mutation or lease/version change. |

## 3. Retention And Hold Taxonomy

### 3.1 Classification states

| Class | Meaning | Admission and terminal posture |
| --- | --- | --- |
| `RC-A-AUTHORITATIVE` | Current or historical business/security/identity truth required for operation or explainability. | Keep-forever eligible only if its source owner decides so. Otherwise duration/trigger remains unresolved. No ordinary hard delete or purge. |
| `RC-B-BOUNDED` | Source owner has approved bounded retention eligibility, but the exact clock and duration may still be pending. | Terminal disposition remains blocked until the exact approved rule, trigger, expiry evidence, dependencies, holds, copies, tombstone, and gates are all proven. |
| `RC-C-OPERATIONAL` | Material required while an account, credential, session, workflow, lease, package, policy, or job is usable or reconcilable. | Loss of usability does not erase evidence. Reclassify only through the source owner after terminal/result reconciliation. |
| `RC-D-TRANSIENT` | Positively identified scratch, staging, request-scoped, derivative, or failed-operation material that is not authoritative. | Cleanup eligibility requires exact provenance, non-authoritative proof, copy/reference proof, bounded lifetime authority, and destructive approval where applicable. |
| `RC-E-TOMBSTONE` | Minimum safe metadata required after another lifecycle transition for identity, reference, collision, replay, lineage, or audit. | Fields, redaction, and duration are source-owned. A tombstone is not proof that other copies or bytes were disposed. |
| `RC-X-UNRESOLVED` | Current sources do not decide classification, duration, trigger, eligibility, or minimum evidence. | Retain and block terminal disposition. This is the default for every unresolved source choice. |

“Keep forever” is never inferred from age, inconvenience, hashing, encryption,
revocation, disablement, expiry, archive, or an absent UI action. “Bounded” is
never inferred from a current implementation constant. Source-defined validity
windows may describe usability while retention/disposition remains unresolved.

### 3.2 Hold categories

Every applicable hold is independently source-owned and fail-closed:

| Hold ID | Category | Examples of responsible owner; safe posture |
| --- | --- | --- |
| `H-LEGAL` | Legal/regulatory instruction | Human legal/product owner; this policy gives no legal advice or statutory period. Retain while unresolved or active. |
| `H-PRODUCT` | Accepted product/trust promise or unresolved product decision | Product owner; retain until decision evidence is recorded. |
| `H-SECURITY` | Incident, abuse, replay, fraud, lockout, investigation, or security-policy evidence | Auth/security or source-domain security owner; redact secrets and retain bounded safe evidence. |
| `H-PRIVACY` | Privacy request, consent, vault/recovery, authorized-access, or minimization decision | Storage/privacy or record owner; do not treat a privacy request as automatic byte deletion authority. |
| `H-FINANCIAL` | Bill, revision, settlement, payment, allocation, residual, FX, reconciliation, or reporting explainability | Financial owner; no cross-domain service may waive it. |
| `H-AUDIT` | Required audit, notification-history, correlation, denial, or transition evidence | Event-producing source domain; delivery history remains separately owned. |
| `H-OPERATIONAL` | Lease, in-flight request, pending job, retry window, unknown commit/provider result, migration, sync, import, export, restore, backup, or recovery | Owning runtime/operations domain; retain until reconciled and version-bound. |
| `H-MANUAL` | Explicit operator or decision-owner hold | Named approver; release must be authenticated, audited, reasoned, and version-bound. |

No elapsed clock releases a hold by implication. A future hold release must
identify the hold, actor/authority, reason, time, subject/version, and audit
correlation without exposing sensitive content.

## 4. Domain Retention Matrix

All rows below default to `RC-X-UNRESOLVED` for terminal disposition unless the
source owner later supplies approval. “Minimum” means the category of evidence
that cannot be silently lost; it does not set fields or duration.

| #961 family / source choices | Owner and allowed classes | Required evidence, minimum history/tombstone, copies and audit | Terminal posture, gates, recommended owner |
| --- | --- | --- | --- |
| `SYN-FIN-01` bill roots; `FIN-CHOICE-001..010`, `025..026`, `029`, `062..072`, `076..080` | Financial/API domain; `RC-A`, possible source-approved `RC-B`, draft-only `RC-D`, `RC-E`, or `RC-X`. | Bill/revision/settlement/participant/file/sync/audit references; stable identity and accepted financial basis; import/local/export copies; bounded audit without payment details or file content. | Accepted/shared history is not ordinarily disposable. Draft eligibility needs positive proof. `FIN:G-RET/G-DEST/G-PRIV/G-MONEY`; PKT-01/17 owners. |
| `SYN-FIN-02` components/claims/FX/participants; `FIN-CHOICE-005`, `015..024`, `030..032`, `042..044`, `057`, `062..072` | Financial domain; normally `RC-A/RC-E/RC-X`; dependency-free draft material may be evaluated as `RC-D` only by owner. | Deterministic calculation, payer/split/claim/FX basis, historical person identity, revision/OCR sources; no payment details/raw OCR in audit. | Preserve accepted basis; no component removal or tombstone revival by inference. Same financial gates; PKT-01/16. |
| `SYN-FIN-03` revisions; `FIN-CHOICE-003`, `006`, `015..019`, `027..028`, `034`, `042..044`, `057` | Financial domain; `RC-A/RC-E/RC-X`. | Baseline/proposed snapshot, hashes, approvals, payer basis, affected-user, settlement, file/OCR and participant references. | Rejected/superseded evidence remains history. Same financial gates; PKT-01/16. |
| `SYN-FIN-04` settlements/payments/proofs; `FIN-CHOICE-006..010`, `045..047`, `050..051` | Financial owner for records; storage owner for file object/link/copy. `RC-A/RC-E/RC-X`. | Requests, lines, claims, allocations, residuals, proof link/object, participant and audit; uncertain money operation reconciled before retry. | No ordinary purge; proof unlink never proves byte/copy disposition. Same financial gates plus file gates; PKT-01/03/16. |
| `SYN-FIN-05` recurrence/derived/reconciliation; `FIN-CHOICE-009`, `011..014`, `033`, `035..041`, `048`, `052..053`, `058..061` | Financial domain; templates/occurrences `RC-A/B/E/X`; derived views may be `RC-D` only if rebuildability and lineage are proven. | Generated-bill lineage, schedule/policy/calculation identity, membership actor, notifications, source coverage. | Derived omission is not source deletion. Same financial gates; PKT-01/16. |
| `SYN-FIN-06` local financial; `FIN-CHOICE-013`, `048..056`, `073..075` | Local financial authority and later server acceptance remain separate; `RC-A/B/D/E/X`. | Local authoritative history, encrypted backup/export/device copies, queued operations, conflicts, server-import acceptance, stable identity. | Local action cannot prove server or external-copy disposal. Same financial gates; PKT-17/18. |
| `SYN-FILE-01` objects; `FILE-LC-CHOICE-001..004`, `008` | Storage/privacy owns object/byte/provider state; `RC-A/B/C/D/E/X`. | Complete link/history/job/OCR/package/reference registry, provider result, lease, object version, audit, replica/backup/copy inventory. | Metadata `deleted`/`purged` is not byte proof. File gates `005/006/007/009/010/011/012`; PKT-03/08/09. |
| `SYN-FILE-02` links; `FILE-LC-CHOICE-001..004` | Subject domain owns relationship meaning; storage owns object/bytes. `RC-A/B/E/X`. | Every active/inactive link, embedded revision ID, financial/history reference, current authorization, object identity/version. | Link removal neither disposes nor restores object. Same PKT-07 file gates; PKT-03/16. |
| `SYN-FILE-03` packages/sessions/cleanup; `FILE-LC-CHOICE-001`, `004`, `006`, `008` | Storage plus sync/import/export/restore owners; `RC-C/D/E/X`, with authoritative accepted outputs classified by their domains. | Session/candidate/package version, integrity, actor, lease, source/target, provider/server/browser/device copy inventory, import/restore result, backup/replica holds. | Expire/discard/failure never proves cleanup. File gates plus sync/privacy; PKT-08/09/17. |
| `SYN-FILE-04` client-local copies; `FILE-LC-CHOICE-005..007` | Platform storage/privacy owner; `RC-C/D/E/X`. | Account/source/request-generation binding, secure lifetime, decode/capacity limits, queue state, external-copy limitation and erasure result. | Server cannot claim external erasure. File gates `005/006/008/011/012`; PKT-18. |
| `SYN-MEM-01` groups/memberships/invitations; `MEM-CHOICE-001..007`, `011`, `013..016` | Group/authz owner; `RC-A/B/E/X`. | Owner floor, current/future membership, invitation, group archive, financial/history/file/notification/account dependencies and record-specific access. | Removal/default exclusion/re-entry cannot rewrite history. `MEM:G-RET/G-PRIV/G-DEST`; PKT-02/16. |
| `SYN-MEM-02` guests/historical/local people; `MEM-CHOICE-008..010`, `012`, `015`, `017` | Group/identity/authz owner; `RC-A/B/E/X`. | Stable placeholder/provenance, payer/split/settlement references, claim/link consent/conflict, membership-qualified saves, dependency-safe removal/transfer, local/import copies and authorization. | Historical identity stays stable; no implied account or role. Same membership gates; PKT-02/17/18. |
| `SYN-AUTH-01` sessions/refresh/password; `AUTH-LC-CHOICE-002`, `007`, `010`, `012..013` | Auth/security owner; active material `RC-C`, bounded safe lineage `RC-A/B/E/X`; reusable secrets are never evidence. | Session/family/credential/reset lineage, password-change invalidation, revocation/replay, expiry usability versus stored state, audit-save/commit result, no-redisplay/material lifetime, lockout and unknown outcome. | No cleanup from expiry/revocation alone and no reusable material retained as evidence. `AUTH:G-RET/G-PRIV/G-DEST`; PKT-04. |
| `SYN-AUTH-02` account/identity/role/profile; `AUTH-LC-CHOICE-001`, `003..004` | Auth/security with group/domain owners; `RC-A/B/E/X`. | Last-owner and recovery, sessions/factors, identity collision, roles, group ownership, financial/file/audit references; minimum non-secret correlation. | Account deletion is not domain-data purge. Same auth gates; PKT-05. |
| `SYN-AUTH-03` factors/challenges/recovery; `AUTH-LC-CHOICE-005..006`, `012` | Auth/security owner; operational material `RC-C`, bounded safe terminal evidence `RC-B/E/X`. | Credential/challenge binding, exact consumption, replay/corruption, healthy siblings, no-redisplay and material-lifetime proof. Never retain seeds, private keys, displayed recovery codes, or reusable ceremony material as evidence. | Disable/consume/expire does not authorize physical cleanup. Same auth gates; PKT-06. |
| `SYN-AUTH-04` reset/invitation/abuse/policy/audit; `AUTH-LC-CHOICE-007..009`, `011..012` | Auth/security/event owner; `RC-A/B/C/E/X`. | One-time result truth, delivery/save ordering, policy version, actor/subject/correlation, abuse and audit evidence; exclude raw links/tokens. | Current implementation clocks are not universal retention approval. Same auth gates; PKT-16/19. |

The table accounts for every exact #961 open-choice range once semantically;
overlapping references are deliberate where a source choice governs more than
one family. The exact source text, not the range shorthand, remains authority.

## 5. Positive Dependency-Proof Contract

Before a future terminal-disposition attempt, the coordinator must obtain one
consistent `evidence snapshot` containing all applicable attestations below.
An absent attestation, `unknown`, stale version, query failure, partial
inventory, or unsupported category is a blocker—not negative evidence.

1. Exact subject type, stable ID, authority mode, expected version, policy
   version, classification, proposed target, and operation/dry-run identity.
2. Source-owner retention rule and trigger evidence, including unresolved
   duration as blocked; every hold and its release authority.
3. Financial attestation: no required bill, revision, item/split/payer/claim,
   FX, settlement, payment, allocation, residual, proof, recurrence,
   reconciliation, report, or accepted-history dependency.
4. Historical-identity attestation: no required group, membership, owner-floor,
   participant, guest, payer, split, invitation, claim/link, or record-access
   dependency; approved tombstone requirements are present.
5. Storage attestation: all active and inactive links, embedded IDs, OCR and
   revision history, jobs, derivatives, packages, leases, staging targets,
   provider outcomes, metadata, and object versions are reconciled.
6. Auth/security attestation: no active session/challenge/credential/account,
   replay, lockout, incident, abuse, policy, audit, or recovery hold; retained
   evidence contains no reusable secret material.
7. Sync/import/export/restore attestation: no pending/failed/conflicted or
   unknown-commit operation, session, candidate, package, preview, apply,
   download, or restore dependency.
8. Audit/event attestation: required success, denial, blocked, race, attempt,
   actor/subject/correlation, and result evidence is durable and safely
   redacted; notification history is not substituted for source audit.
9. Copy attestation: enumerated server/provider working copies, browser/device
   copies known to the system, downloads, exports, backups, snapshots,
   replicas, caches, derivatives, and external-copy limitations. “Erased” may
   be claimed only for the exact proven targets; backup/replica disposition is
   separately gated.
10. Race-safety attestation: consistent snapshot or equivalent transaction,
    applicable lease, no in-flight request/job, and a final immediately-before-
    action version/reference recheck.

Attestations are source-owned and may say `blocked`; the coordinator may not
reinterpret or override them. Client state, hidden controls, a missing row in
one table, unreadable bytes, a 404, expiry, or an earlier dry run is never
sufficient proof.

## 6. Blocked-Disposition Reasons

These stable planning IDs may later inform API/admin/UI design, but this task
does not change OpenAPI or approve public/admin exposure.

| Reason ID | Meaning |
| --- | --- |
| `DISP-BLOCK-001-CLASSIFICATION` | Retention class, trigger, duration, eligibility, or tombstone rule is unresolved or ineligible. |
| `DISP-BLOCK-002-HOLD` | One or more legal, product, security, privacy, financial, audit, operational, or manual holds remain. |
| `DISP-BLOCK-003-FINANCIAL` | Required financial/current or historical explainability dependency remains or cannot be proved absent. |
| `DISP-BLOCK-004-HISTORICAL-IDENTITY` | Group, membership, participant, payer, guest, owner, identity, or record-access history depends on the subject. |
| `DISP-BLOCK-005-STORAGE-LINK` | Active, inactive, embedded, OCR, revision, job, package, or other storage reference remains/unknown. |
| `DISP-BLOCK-006-COPY` | Server, provider, client, export, download, derivative, cache, or external copy inventory/disposition is incomplete. |
| `DISP-BLOCK-007-ACTIVE-OPERATION` | Lease, in-flight request/job, retry, transition, migration, or maintenance operation remains. |
| `DISP-BLOCK-008-SECURITY-EVIDENCE` | Credential/session/account/challenge/replay/incident/abuse/lockout/security-audit evidence requires retention or safe classification. |
| `DISP-BLOCK-009-SYNC-TRANSFER` | Sync/import/export/restore session, candidate, package, conflict, preview, apply, or copy dependency remains. |
| `DISP-BLOCK-010-BACKUP-REPLICA` | Backup, snapshot, replica, restore point, or disaster-recovery disposition is unresolved or separately gated. |
| `DISP-BLOCK-011-AUDIT-EVIDENCE` | Required source audit/event evidence is absent, unsafe, uncorrelated, non-durable, or still held. |
| `DISP-BLOCK-012-UNKNOWN-OUTCOME` | Commit, response, provider, byte, association, audit, or compensation outcome is unknown. |
| `DISP-BLOCK-013-VERSION-RACE` | Subject/policy version, consistent snapshot, lease, or final race-safe recheck is absent/stale. |
| `DISP-BLOCK-014-MANUAL-GATE` | Required product/privacy/security/money/schema/API/UX/destructive/production approval is pending. |
| `DISP-BLOCK-015-OTHER-SOURCE` | A source owner supplied another explicit blocker that must be preserved verbatim and routed back to that owner. |

Reasons are additive. Reports expose only stable IDs and bounded safe metadata;
they do not expose hidden record existence, filenames, object keys, paths,
payment details, raw OCR, tokens, credentials, policy secrets, or contents.

## 7. Orphan And Failed-Upload Boundary

The #719 policy is authoritative. A future PKT-08 reconciler may classify a
candidate only after it proves:

- one stable upload intent/operation and target identity;
- metadata reservation, status/version, byte integrity/existence, provider
  outcome, compensation, audit/notification staging, association save, and
  response-reload outcomes;
- every normalized and embedded reference category, including bill-item OCR
  references and revision snapshot ID arrays, in a consistent snapshot;
- no active lease/in-flight request and an immediate pre-action recheck;
- every working, derivative, package, local, backup, snapshot, and replica copy
  category is either positively accounted for or explicitly blocked; and
- an idempotent durable classification/outcome record.

`failed`, `cancelled`, `timed out`, `missing`, `unreadable`, `unlinked`, a
returned compensation failure, or absence from one table never proves orphan
or cleanup eligibility. PKT-08 may reconcile and classify only; it may not
delete bytes. Any later byte action belongs to separately approved PKT-09.

## 8. Auth/Security, Copy/Backup, And Audit Boundaries

Reusable passwords, bearer/refresh material, reset or invitation tokens,
recovery codes, TOTP seeds, private passkey material, reusable challenges, and
provider secrets are never lifecycle evidence. Auth/security may retain only
source-approved bounded metadata. Expiry, revocation, disablement,
consumption, encryption, or hashing does not itself prove cleanup eligibility.

Logical server state cannot recall browser/device downloads, exports, backups,
snapshots, or replicas. Copy inventory must name the system's proof boundary;
unknown external copies are disclosed rather than reported as erased.
Backup/replica destruction, restore-point changes, and provider byte deletion
remain target-specific manual gates.

Audit production belongs to the transition's source domain. Notification
delivery/history stays separately owned and never becomes transition authority.
Redaction may minimize content, but may not silently remove evidence required
to explain an authorized, denied, blocked, raced, retried, or failed action.

## 9. Future Maintenance Acceptance Requirements

No maintenance runtime is implemented here. Any future child must fail closed
and prove all of the following for its exact subject/operation:

- idempotency key or stable operation identity with prior-result replay;
- expected subject, policy, and dependency-evidence versions;
- concurrency conflict and lease behavior, including a final dependency recheck;
- bounded retry/backoff and reconciliation after timeout or cancellation;
- explicit unknown commit/provider outcome that never becomes success or
  eligibility by inference;
- atomic or causally bound durable audit for dry run, blocked attempt,
  authorization, execution, provider result, and final reconciliation;
- dry-run evidence whose digest/expiry is bound to the later request;
- bounded batch size, deterministic target enumeration, per-target outcomes,
  and safe restart without skipping or double-applying;
- authenticated least-privilege operator authorization, high-friction manual
  approval where required, and no worker direct mutation of core tables; and
- redacted visibility that reveals enough reason/evidence state to operate
  safely without leaking hidden data or internals.

Logical removal/archive/revoke/disable/unlink is always separated from physical
disposition. Physical purge, provider byte deletion, backup/replica
disposition, destructive migration/data action, production maintenance,
public/admin exposure, secrets/configuration, auth/security or storage/privacy
accepted-semantics changes, money authority, and Day 1 scope changes retain
their own manual gates.

## 10. Focused-Child Handoff And Dependency Order

The post-merge duplicate search must reuse exact existing owners and create a
new issue only for a materially unowned packet. Each line below is one
canonical lane; none is runnable merely because this document merges.

| Packet | Canonical owner/handoff | Dependency and gate posture |
| --- | --- | --- |
| PKT-01 financial retention-dependent runtime | Reuse #350/#352/#967 and existing settlement/recurrence owners; #722 coordinates splits. | After applicable financial choices and this policy; money/product/retention/privacy/destructive gates pending. |
| PKT-03 storage object/link runtime | Reuse #341/#966/#1062. | After this reference contract; storage/privacy gates pending; no byte purge. |
| PKT-04/05/06/19 auth/security families | Reuse #338/#339/#394/#465/#784/#785/#787/#788/#1059 and #965 recommendations. | Auth/lockout/privacy/provider/config/exposure gates remain independent. |
| PKT-08 orphan/failed-upload reconciliation | Create a focused storage-reconciliation issue only if final #966 search confirms no bounded owner. | After this policy and #966 reconciliation; classification only; strong independent review; manual storage/privacy gate. |
| PKT-09 physical purge/destructive maintenance | Create a separate manual-only planning/runbook issue only if final search confirms none. | After source eligibility, PKT-08 where applicable, complete proof, and every destructive/production approval; never auto-runner eligible. |
| PKT-16 audit/notification dependencies | Reuse #369/#774/#973 and source-domain event owners. | Source event first; notification delivery/history separately; privacy/retention gates pending. |
| PKT-17 sync/import/export/restore | Reuse #406/#971. | After copy/conflict/acceptance decisions; no silent merge or copy-disposal claim. |
| PKT-18 client-local copies | Reuse #358/#406/#971/#966, split by platform/copy family. | Platform privacy/erasure decisions pending; server deletion semantics forbidden. |

Order: source-domain eligibility and accepted choices → schema/contract/runtime
planning under #722 where needed → positive dependency/copy proof → PKT-08
classification/reconciliation where applicable → exact manual PKT-09 planning
and approval → target-specific dry run → separately authorized execution.
PKT-16/17/18 provide evidence to that graph and never derive authority from it.
#723 remains the separate Figma/manual UX reference; this task does not start
it. Day 2/later work remains later-day.

## 11. Gate Preservation And Stop Conditions

PKT-07 preserves these exact #961 gates as pending/unresolved; listing them
satisfies none:

`FIN:G-RET`, `FIN:G-DEST`, `FIN:G-PRIV`, `FIN:G-MONEY`,
`FILE:FILE-LC-GATE-005`, `FILE:FILE-LC-GATE-006`,
`FILE:FILE-LC-GATE-007`, `FILE:FILE-LC-GATE-009`,
`FILE:FILE-LC-GATE-010`, `FILE:FILE-LC-GATE-011`,
`FILE:FILE-LC-GATE-012`, `MEM:G-RET`, `MEM:G-PRIV`, `MEM:G-DEST`,
`AUTH:G-RET`, `AUTH:G-PRIV`, and `AUTH:G-DEST`.

Stop later work when classification or a duration is unresolved; any hold,
reference, copy, provider result, or audit evidence is missing; a result is
unknown; proof is stale or race-prone; a client would decide eligibility; a
worker would mutate core tables; a source owner disagrees; or any applicable
manual gate lacks approval. Retain/block is the safe posture, not an implied
policy choice.
