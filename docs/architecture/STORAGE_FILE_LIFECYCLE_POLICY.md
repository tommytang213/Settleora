# Storage File Lifecycle Policy

Issue: [#719](https://github.com/tommytang213/Settleora/issues/719)

Parent chain: [#716](https://github.com/tommytang213/Settleora/issues/716) →
[#717](https://github.com/tommytang213/Settleora/issues/717) → #719; shared
template: [#960](https://github.com/tommytang213/Settleora/issues/960).

## 1. Decision And Authority

This document defines Day 1 provider-neutral lifecycle policy for file objects
and their subject links. It applies the
[shared lifecycle taxonomy](../planning/DAY1_LIFECYCLE_POLICY_TEMPLATE.md) to
the repository at `6981236c786a7914ac1a17c25d9c3d9de22c8b74` (tree
`40aad85c0b7ee7dcf2a4fc4b982b5ad18cb91ca9`). It is planning and factual
reconciliation only. It does not change bytes, runtime, schema, migrations,
API or OpenAPI, generated clients, providers, configuration, secrets,
deployment, exposure, cleanup, or disposal.

In server mode, API/domain/storage services own file-object and subject-link
mutation acceptance, authorization, current policy, dependency checks,
retention classification, and audit. PostgreSQL owns provider-neutral metadata;
bytes remain behind `IFileObjectStorageProvider`. Stable opaque file IDs are
references, never access grants. Clients, routes, object URLs, browser caches,
device caches, generated methods, and worker job payloads are not authority.
Workers may perform bounded provider work from API-approved jobs, but they must
return structured results and never mutate core business, file-object, or link
tables directly.

Local-only files and caches remain inside the local application authority
boundary described by the
[local/server authority audit](LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md).
They do not become server `file_objects`, server links, or accepted server
bytes until an explicit upload/import action is revalidated and accepted by
the API. This policy does not invent a local persistence model that the current
mobile source does not have.

## 2. Reconciled Current Facts

Current source proves the following, and no more:

- `FileObjectPurposes` contains exactly `receipt_image`, `ocr_source`,
  `settlement_proof`, `payment_qr`, `statement_upload`, `export_file`, and
  `supporting_attachment`.
- `FileObjectStatuses` contains exactly `pending`, `active`, `quarantined`,
  `deleted`, `purged`, and `upload_failed`. The schema has no persisted
  `orphan`, `expired`, `cleanup_eligible`, or provider-missing state.
- `EfFileObjectLifecycleService` implements metadata transitions
  `pending → active`, `upload_failed → active`, `pending → upload_failed`,
  `active|quarantined → deleted`, and `deleted|upload_failed → purged`.
  It has no quarantine, restore, expiry, reference-proof, or cleanup method.
- The current `purged` transition only changes PostgreSQL metadata and writes
  audit. No production source calls `IFileObjectStorageProvider.DeleteAsync`.
  A current `purged` row therefore does **not** prove physical deletion.
- Purpose-specific bill attachment, settlement proof, and payment QR endpoints
  reserve metadata, write through the provider, activate the object, then link
  it. There is no generic public file API.
- Bill and proof ordinary list/content queries require `RemovedAtUtc == null`,
  an `active` file object, an unset file `DeletedAtUtc`, matching purpose and
  ownership, current subject visibility, and current actor authorization.
  QR metadata/content reads likewise require a current QR link, matching
  ownership/purpose, and an active non-deleted object. Thus ordinary current
  reads stop when either the implemented link or object condition is inactive.
- Bill/proof removal sets link `RemovedAtUtc` and changes the file object to
  `deleted` in one `SaveChanges` consistency boundary used by the lifecycle
  service. QR removal clears `QrFileObjectId`, saves that change, then attempts
  `active → deleted`; the endpoint does not fail if that later transition does
  not succeed.
- Bill and settlement link keys do not make `FileObjectId` globally unique;
  payment QR linkage is also not unique. Receipt OCR reviews, OCR assignments,
  and notification history can reference file IDs. Restrictive foreign keys
  preserve these rows. Consequently, one observed unlink or zero links in one
  table is not proof that an object is unreferenced.
- Storage-write failure marks a reserved object `upload_failed`, but the local
  provider may already have created partial bytes and the endpoint does not
  remove them. Association-save failure triggers a best-effort attempt to
  change the now-active object to `deleted`, but each handler ignores that
  lifecycle result; an active unlinked object can remain, and any bytes remain.
  No cleanup runner reconciles either case.
- Current file lifecycle audit proves success events only for upload start,
  completion, failure, logical deletion, and metadata `purged`. It records a
  bounded file ID, purpose, prior/new status, provider category, timestamp, and
  actor account through `auth_audit_events`; it excludes filenames, hashes,
  retention text, vault references, object keys, paths, and contents. It does
  not prove denial, cleanup, dependency, restore, or physical-delete audit.
- Current OpenAPI and generated clients expose only subject-specific bill
  attachments, settlement proofs, payment QR flows, OCR review flows over a
  receipt attachment, direct streamed bill export/import operations, and
  metadata-only backup readiness/preview surfaces. They expose no file restore,
  quarantine, retention, cleanup, or purge operation.

Architecture direction is not runtime proof. The
[metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md),
[file policy](STORAGE_FILE_POLICY_ARCHITECTURE.md),
[privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md), and
[package security policy](LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md) define
required future behavior, including normalized receipt retention, derivatives,
Trash, restore checks, vault protection, and consistency-set backup/restore.
Where those documents do not define an exact duration or transition mechanic,
this policy leaves it unresolved.

## 3. Vocabulary And Separate State Models

- **Archive** removes a record from ordinary active use while retaining it and
  its history. No current file endpoint implements an object archive distinct
  from `deleted`.
- **Trash** is user-visible holding for logically removed content. It is not a
  current state name and does not authorize a retention timer or purge.
- **Soft/logical removal** changes a file object or link so defined ordinary
  use stops while bytes and required evidence remain.
- **Unlink** makes one subject relationship inactive or clears it. It is not
  deletion of bytes and need not change the file-object state.
- **Restore** requests re-entry from an eligible inactive condition after all
  current checks. **Reactivate** is the accepted transition to one named usable
  state. Neither means silent reattachment.
- **Quarantine** blocks ordinary access or processing while validation,
  integrity, privacy, or safety is unresolved. It is not archive or disposal.
- **Expire** means a retention or validity condition ended. Expiry is evidence,
  not a state transition and not purge.
- **Purge** is the separately authorized terminal disposition workflow. The
  current metadata status named `purged` is only a marker transition and must
  not be presented as byte deletion without provider outcome evidence.
- **Hard/physical delete** removes eligible bytes immediately rather than
  placing authoritative content in Trash. It is permitted only for positively
  proven non-authoritative temporary/failed material or dependency-free drafts
  under a separately approved policy and every destructive gate.
- **Temporary cleanup** concerns positively identified scratch, staging, cache,
  or failed temporary material. **Orphan cleanup** additionally requires proof
  that no authoritative relationship, history, package, replica, or hold needs
  the material. An orphan candidate is not a runtime state and is never proof
  of disposability.

### 3.1 File-object state model

| Persisted state | Provider-neutral policy meaning | Current support |
| --- | --- | --- |
| `pending` | Metadata reservation for an incomplete write/finalization. Never ordinarily readable. | Created by current uploads. No age/cleanup policy. |
| `active` | Eligible for purpose- and subject-authorized use if every link, privacy, and content check also passes. | Current upload target and only ordinarily readable object state. |
| `quarantined` | Intended isolation state; ordinary metadata/content/preview use is blocked except bounded authorized maintenance/security inspection. | Schema/enum only; no transition or inspection API. #1062 owns validation/quarantine runtime reconciliation. |
| `deleted` | Retained logical object removal. Bytes may remain. Ordinary reads stop. | Current object transition; no restore or retention clock. |
| `upload_failed` | Metadata says upload completion failed. It says nothing conclusive about whether zero, partial, or complete bytes exist. | Current transition from `pending`; no cleanup runner. |
| `purged` | Current bounded tombstone marker. It is not proof of provider deletion, copy disposition, or terminal workflow completion. | Metadata-only transition exists; no production physical-delete orchestration. |
| unknown provider state | Provider outcome is missing, unreadable, timed out, or inconsistent with metadata. This is a derived maintenance condition, not a new persisted status. | No reconciliation runtime; fail closed and investigate. |

No second state taxonomy is created. Proposed concepts such as staging,
available, rejected, orphan candidate, cleanup eligible, or disposed map to the
existing states or remain derived/documented-only conditions until a focused
schema/API decision is approved.

### 3.2 Subject-link state model

| Link family | Active | Inactive | Current support and distinction |
| --- | --- | --- | --- |
| Bill receipt/supporting attachment | `RemovedAtUtc == null` | `RemovedAtUtc != null` | Current attach/remove. The row persists; OCR review and notification dependencies can persist. |
| Settlement proof attachment | `RemovedAtUtc == null` | `RemovedAtUtc != null` | Current attach/remove. The payment and proof history persist. |
| Payment-profile QR | `QrFileObjectId` points to a readable active owned QR | Link is null, profile inactive, or linked object fails checks | Current attach/replace/remove. Clearing the link is separate from object transition. |
| OCR review/assignment and notification reference | Current domain status plus a stable file reference | Domain-specific terminal/removed state where defined | Dependency/history record, not a byte-ownership link. Its existence blocks orphan proof until policy says otherwise. |
| Future package/import/derivative link | Not defined | Not defined | Documented-only; must use a reviewed relationship rather than provider paths or an inferred filename/hash. |

## 4. Day 1 Purpose Mapping

This table uses the existing file-purpose enum. Qualifiers such as canonical,
derivative, temporary, failed, and orphan are lifecycle/relationship facts,
not new purposes.

| Required class | Existing purpose mapping | Current runtime | Retention classification |
| --- | --- | --- | --- |
| Receipt source/original | The normalized user-accepted canonical image maps to `receipt_image`. A raw camera/gallery input is temporary intake material and is not retained by default after successful normalization. | Bill upload stores accepted JPEG/PNG/GIF/WebP bytes as `receipt_image`; normalization and raw-source cleanup are not proved by this endpoint. | Canonical image: policy-defined dependency-gated to its parent/history; exact duration unresolved. Raw input: source-defined transient cleanup eligible only after normalized-byte integrity and accepted-link proof. |
| OCR source where distinct | `ocr_source`. A receipt used directly by current OCR review remains its `receipt_image`; do not relabel it. | Enum/schema reserved; no standalone OCR-source upload or worker-file runtime. | Required but duration unresolved; dependency-gated to job/review/reprocessing and privacy policy. |
| Receipt thumbnail/preview | A derivative of the source file; current enum has no separate thumbnail purpose. It must have an explicit parent relationship and derivative marker before runtime. | Not implemented. | Policy-defined: keep with the parent; transient regeneration cleanup only when reproducibility and dependencies are proved. `FILE-LC-CHOICE-005`. |
| Supporting attachment | `supporting_attachment`; current bill-link purpose uses the same value. Screenshots or documents remain this purpose when supporting a bill. | Current bill upload/list/content/remove. | Policy-defined dependency-gated to the attachment subject/history; duration unresolved. |
| Settlement/payment proof | `settlement_proof`. | Current settlement-payment upload/list/content/remove. | Policy-defined dependency-gated to proof/payment/settlement history; duration unresolved. |
| Payment QR/payment image | `payment_qr`. | Current self attach/replace/remove/content and settlement-scoped counterparty content read. | Policy-defined dependency-gated while the payment setting/link exists; removed/replaced copies enter retained logical removal pending policy. |
| Generated export package | `export_file` when bytes are persisted. Current CSV/JSON exports stream responses and do not create a file object. | Purpose reserved; direct exports implemented without stored packages. | Required but duration/expiry unresolved; sensitive owner-only artifact with explicit expiry policy. |
| Generated backup package | `export_file` is the existing architectural category for a persisted backup/export bundle; package manifests must distinguish backup from ordinary export without inventing a second file purpose. | Backup readiness/preview is metadata-only; no generated stored package. | Dependency-gated and destructive/manual decision required for package disposal; duration, encryption, copy inventory, and recovery hold unresolved. `FILE-LC-CHOICE-006`. |
| Imported-source file | `statement_upload` for a file-backed statement/import source. Package-local blobs remain untrusted package input until API acceptance; current CSV request bodies are not `file_objects`. | Enum reserved; CSV import sessions exist, but no file-object statement/package link. | Required but duration unresolved; rejected/conflicted candidates remain until explicit discard or reviewed retention policy. |
| Temporary upload/staging | Keep the intended final purpose and use `pending`; local scratch before reservation is outside server metadata. | Current uploads use `pending`; no separate staging purpose or cleanup timer. | Transient cleanup eligible only with positive non-authoritative/dependency proof. |
| Failed upload | Keep intended purpose and use `upload_failed`. | Current metadata transition; byte presence is unknown. | Transient cleanup candidate, never automatically disposable; duration unresolved. |
| Orphan/unlinked object | Keep original purpose and derive “orphan candidate” from a complete reference inventory. | No state or proof service. | Dependency-gated; physical disposal blocked until positive proof. |
| Statement upload (additional current enum) | `statement_upload`. | Reserved; no storage-backed statement upload. | Required but duration unresolved; private to importer by default. |
| Export file (additional current enum) | `export_file`. | Reserved; current exports are streamed. | Explicit expiry policy required; duration unresolved. |

## 5. Common Policy-Row Contract

The matrices in sections 6.1 through 6.5 together complete every reusable-row
field from #960. These common values apply to every row unless a cell narrows
them:

- **Authority mode/workspace:** server mode in one self-hosted workspace,
  except `FILE-LC-LOCAL-001`, which is local-only and cannot mutate server
  records. The API/domain/storage boundary is authoritative in server mode.
- **Actor/authorization:** an authenticated owner/uploader may request only a
  purpose-specific subject action current policy permits. Domain owners and
  narrowly approved maintenance actors may execute only their reviewed scope.
  Admin is never blanket metadata or content access. A worker is an executor,
  not an approver.
- **Preconditions:** current actor/account, ownership, purpose compatibility,
  current object and link state, subject visibility/status, privacy/vault and
  quarantine policy, dependency/hold evidence, byte integrity/readability when
  relevant, conflict/duplicate detection, and authoritative concurrency state.
- **Persisted lifecycle metadata:** stable file ID, purpose, bounded prior/new
  object state, applicable link state, actor, timestamp, safe reason/category,
  correlation/idempotency value, and transition/provider outcome are required.
  Current rows lack reason, restoration, disposition outcome, and concurrency
  metadata; that is a gap, not permission to infer success.
- **Idempotency/replay/concurrency:** retries must return the prior bounded
  result or resume from a recorded step. The same idempotency identity with
  different actor, subject, purpose, or content fingerprint is a conflict.
  Races with unlink, relink, replace, quarantine, subject status, hold, or
  cleanup revalidate before commit. Current lifecycle methods reject repeated
  terminal transitions rather than proving idempotent endpoint outcomes.
- **Dependency evidence:** inspect every registered subject link and historical
  reference, OCR review/assignment, notification reference, import/export or
  backup manifest, retained audit/tombstone, active job/lease, vault/recovery
  dependency, legal/operational hold, and backup/snapshot/replica copy. Current
  source has no complete dependency registry or copy-disposition proof.
- **Hard delete and purge:** ordinary user-visible remove is ineligible for
  both. A future physical action is blocked unless its row positively proves
  target class, retention eligibility, all dependencies/copies/holds,
  authority, audit, retry/concurrency safety, required tombstone/history,
  consequence warning, explicit confirmation when user-initiated, and every
  destructive/storage/privacy/operational manual gate. Retention expiry alone
  is insufficient.
- **Audit/privacy:** audit applicable success and security-relevant denied,
  blocked, conflict, retry, cleanup, and disposition outcomes using bounded
  metadata only. Exclude bytes, thumbnails/previews, raw OCR text, document or
  QR contents, original filenames unless separately approved and bounded,
  hashes unless explicitly needed, physical/mounted/local paths, object keys,
  buckets/containers, signed/direct URLs, provider diagnostics, vault/key
  material, secrets/credentials, request bodies, hidden metadata, and
  unnecessary private data.
- **Client implication:** refresh authoritative state after every mutation;
  show unavailable/blocked states without existence leaks; never infer access,
  restoration, cleanup, or disposal from cache, IDs, routes, object URLs, or
  generated methods. User-initiated irreversible action requires accessible
  warning and explicit confirmation in the future #723 reference.
- **Runtime acceptance:** future changes require focused authorization and
  purpose tests, object-versus-link tests, hostile/concurrent/replay tests,
  provider fault injection, reference/hold/copy proof, redaction scans,
  OpenAPI/generated parity when applicable, and manual destructive/provider/
  privacy/production evidence. This document supplies none of that runtime
  acceptance.

## 6. Lifecycle Transition Matrix

### 6.1 Transition, State Delta, And Read Effect

| Row ID | Record/action | Internal transition and authority | Object vs link delta | Ordinary read and mutation effect |
| --- | --- | --- | --- | --- |
| `FILE-LC-OBJ-001` | File reservation — not user-visible separately | Current lifecycle service creates no row → `pending` after actor/owner/purpose validation. | Object only; no link yet. | No ordinary metadata/content/preview read. Only completion/failure reconciliation may proceed. |
| `FILE-LC-OBJ-002` | Upload reports **Added** only after linkage succeeds | Current service accepts `pending|upload_failed → active`; current endpoints use `pending → active` after provider write. | Object only at this step; link is a later separate write. | Object becomes potentially usable, but no ordinary subject read until an active authorized link exists. |
| `FILE-LC-OBJ-003` | Upload reports bounded failure | Current service accepts `pending → upload_failed`. | Object only; link remains absent. | All ordinary reads blocked. Retry or cleanup needs byte-state reconciliation; failure is not disposal proof. |
| `FILE-LC-OBJ-004` | **Quarantine file** / not yet user-visible | Proposed API/storage-policy transition from an intake or active state to existing `quarantined`; exact sources allowed are unresolved. | Object only; links/history stay. | Ordinary metadata/content/preview reads stop. Bounded maintenance/security inspection only under a separate role/policy; mutations limited to review/reject/release. |
| `FILE-LC-OBJ-005` | **Release from quarantine** | Proposed authorized `quarantined → active` after fresh validation, privacy, integrity, subject, and policy checks. | Object only; every link remains independently revalidated. | Does not itself grant a read or reactivate a link. Ordinary reads resume only through an active authorized compatible link. |
| `FILE-LC-OBJ-006` | **Move file to Trash** / logical object removal | Current service accepts `active|quarantined → deleted`; current subject removes invoke it. | Object changes; link may or may not change in a separate row. | Ordinary metadata/content/preview reads stop for every link. Retained evidence remains maintenance/audit-only. No physical delete. |
| `FILE-LC-OBJ-007` | **Restore file** | Proposed `deleted → active` only after the checks in section 7. | Object only. A prior subject link is not silently reactivated. | Restore preview may expose bounded safe metadata only after requester authorization. Content remains blocked until both object and chosen link are active and revalidated. |
| `FILE-LC-OBJ-008` | Internal metadata tombstone transition — never claim **Permanently deleted** | Current service accepts `deleted|upload_failed → purged`, writes metadata/audit only, and does not call provider delete. | Object only; links and bytes are not proved changed. | Ordinary reads remain blocked. Further mutation must treat provider and dependency outcome as unknown. Partial implementation must not be presented as completed disposal. |
| `FILE-LC-OBJ-009` | **Permanently dispose of eligible bytes** | Future API-owned orchestration authorizes provider deletion only after positive eligibility; provider returns a bounded idempotent outcome; API then accepts final metadata/tombstone state. | Bytes/provider outcome plus object marker; links/history remain retained or separately transitioned by policy. | Irreversible for the deleted bytes. Metadata/content restore is unavailable; bounded tombstone/history remains where required. |
| `FILE-LC-LINK-001` | **Attach receipt/supporting file** or **Add proof** | Current API creates an active bill/proof link after object activation and current subject checks. | Link only; object remains `active`. | Active authorized subject viewers may list/read; mutations remain purpose/subject scoped. Link creation never broadens object ownership. |
| `FILE-LC-LINK-002` | **Remove attachment/proof** | Current bill/proof API sets `RemovedAtUtc`; current implementation also calls `active → deleted` on the object in the save boundary. | Both in current single-owner upload flows, but conceptually unlink and object removal are distinct. | This link and all ordinary object reads stop. Because other references are schema-possible, future code must not delete/physically dispose bytes merely from this unlink. |
| `FILE-LC-LINK-003` | **Remove QR image** / **Replace QR image** | Current API clears/replaces `QrFileObjectId`, saves the profile, then attempts old object `active → deleted`; a failed later transition is not surfaced. | Link first; object transition is separate and may not occur. | Old QR is no longer ordinarily reachable through the profile link. An active unlinked object may remain and becomes a reconciliation candidate, not disposable proof. |
| `FILE-LC-LINK-004` | **Restore attachment**, **Restore proof**, or **Reattach QR** | Proposed explicit inactive → active/linked relationship after object restore/readiness and current domain checks. | Link only unless object restore is separately accepted first. | Access resumes only for the named subject/audience. No silent restoration of other links, cached URLs, OCR assignments, or historical workflows. |
| `FILE-LC-CLN-001` | Failed/incomplete upload reconciliation | API-owned maintenance compares metadata step, provider outcome, link commit, retry identity, and holds. It may retry activation/linking or mark cleanup eligible; it cannot assume failed means byte-free. | Neither until evidence authorizes a specific object/link transition; provider cleanup may follow separately. | Ordinary reads remain blocked. Retry cannot attach different bytes under the same intent unnoticed. |
| `FILE-LC-CLN-002` | Orphan candidate reconciliation | API/domain registry proves all link/history/job/package/copy categories; missing/unreadable evidence yields blocked/unknown, not orphan. | Neither; “candidate” is eligibility only. | No read grant and no deletion. Positively proven disposable material may proceed to a separately gated cleanup/disposal row. |
| `FILE-LC-CLN-003` | Temporary/derivative cleanup | API-approved cleanup targets positively identified non-authoritative scratch or reproducible derivative material after final artifact integrity/link proof. | Temporary bytes may change; authoritative object/link state remains unchanged unless separately accepted. | Must not remove canonical receipt/proof/QR/supporting/package bytes, OCR/history evidence, or the sole readable derivative required by policy. |
| `FILE-LC-LOCAL-001` | Local capture/import scratch **Discard temporary copy** | Local app authority may remove positively identified session scratch/cache after accepted local save or server acknowledgment under local policy. | Local-only material; neither server object nor server link changes. | A browser cache, local path, or queued copy never proves server cleanup. Failed/offline queues remain until acknowledged or explicitly discarded under reviewed local policy. |

### 6.2 Preconditions, Re-entry, Dependencies, And Evidence

| Row ID | Preconditions and concurrency | Reversibility/reactivation | Required dependency evidence and blockers | Implementation status / evidence |
| --- | --- | --- | --- | --- |
| `FILE-LC-OBJ-001` | Active actor/account; self owner in current service; supported purpose/provider category; bounded metadata. Duplicate/replay semantics absent. | Creation is not reactivation; failure routes to `OBJ-003`. | Subject intent is checked before current endpoint call, but reservation has no persisted subject/idempotency link. | Partial: `EfFileObjectLifecycleService.CreatePendingAsync`; endpoint/service tests. |
| `FILE-LC-OBJ-002` | Same owner/creator; expected state; provider write intended complete; size/hash/type and subject intent current. Current service does not read bytes before activation. | `upload_failed → active` is source-supported internally but no current endpoint resumes that row; fresh integrity validation is required. | Provider readability/integrity, no conflicting upload, current subject capacity/status, privacy/quarantine policy. | Partial: metadata transition implemented; end-to-end normalization/quarantine/resume absent. Owners #341/#1062/#966. |
| `FILE-LC-OBJ-003` | Expected `pending`; safe bounded failure result. Current attempt after a failed `active` transition is invalid and may leave an active object. | Conditional retry to `active`; otherwise retained cleanup candidate. | Prove byte outcome, link absence, no accepted job/history, retry identity, and holds. | Partial: metadata transition exists; compensation/cleanup absent. #966/#724. |
| `FILE-LC-OBJ-004` | Validation/scanner/policy reason; authorized API decision; atomic read blocking; safe reason; race with content reads resolved. | Conditional release or logical rejection; not archive. | Links remain; scan/provider unavailable is not “clean”; vault and purpose policy. | Documented-only; state exists. #1062. `FILE-LC-CHOICE-003`. |
| `FILE-LC-OBJ-005` | Current `quarantined`; fresh content validation and scanner status; subject/link/owner still valid; no privacy downgrade. | Conditional to existing `active`; never revives links. | Current bytes/hash/readability, validation policy version, holds, all intended links. | Unimplemented. #1062/#966. |
| `FILE-LC-OBJ-006` | Authorized owner/domain action; expected active/quarantined state; current subject dependencies and concurrency. Current service checks owner/creator but not all links. | Conditionally reversible only through `OBJ-007`; bytes retained. | Every link/history reference must inform whether object-wide deletion is safe; current service lacks that proof. | Metadata transition implemented; dependency-safe policy incomplete. #724/#966. |
| `FILE-LC-OBJ-007` | Requester authenticated; object owned/visible; deleted not purged; bytes readable and integral; purpose/privacy/quarantine/retention valid; no duplicate/conflict; optimistic concurrency/idempotency. | Conditional `deleted → active`; blocked by missing bytes, terminal evidence, hold/policy, invalid subject, unsafe content, ownership change, or conflict. | All former/current links, subject statuses, OCR/review history, backups/copies, vault recovery, replacement object, and quota. | Unimplemented; no API/schema/client method. #722 after #961; #723 UX; #724 retention. `FILE-LC-CHOICE-002`. |
| `FILE-LC-OBJ-008` | Current service requires owner/creator and `deleted|upload_failed`; it does not require retention, links, holds, provider outcome, warning, or confirmation. | Metadata transition has no restore path and does not prove irreversibility of bytes. | All disposal dependencies are missing. Treat current marker as incomplete/unsafe for terminal claims. | Partial metadata-only implementation; not used by production endpoint. #966/#724. |
| `FILE-LC-OBJ-009` | Positive retention eligibility, complete dependency/copy/hold proof, exact target, expected head/version, separate action, audit, retry record, manual destructive approval; explicit confirmation if user-initiated. | Irreversible bytes; no reactivation. | Subject/history, OCR, packages, backup/snapshot/replica, vault recovery, provider lease/job, required tombstone and audit. Any unknown blocks. | Unimplemented and manual-gated. #724 must split focused owners after #961/#966. |
| `FILE-LC-LINK-001` | Active compatible object; uploader and current subject mutation authorization; subject status/capacity; no duplicate; same transaction or recoverable compensation. | Link may later be removed; attachment creation is not object creation. | Bill/payment/profile and purpose-specific ownership; existing links and OCR constraints. | Implemented for bill/proof/QR, with association-after-activation compensation gaps. #341/#966. |
| `FILE-LC-LINK-002` | Current active readable link; uploader/owner/domain rights; mutable subject state. Current object transition lacks multi-reference proof. | Link re-entry conditional under `LINK-004`; object needs independent `OBJ-007`. | All other links, OCR review/assignment, notifications, financial/history dependencies. | Implemented for bill/proof but object coupling is partial/unsafe for shared references. #966/#724. |
| `FILE-LC-LINK-003` | Current self profile authorization; replacement upload complete before swap. Current old-object deletion outcome may be ignored. | Reattach/replace is a new explicit action; old link is not restored silently. | Profile state, settlement-scoped visibility, other QR links/references, replacement conflict, old object outcome. | Implemented link mutation; object reconciliation partial. #966. |
| `FILE-LC-LINK-004` | Authorized requester; specific subject accepts reattachment; object independently active; purpose compatible; subject current; privacy/quarantine/integrity/duplicate checks; idempotency/version. | Conditional explicit re-link. Browser/local cached association is irrelevant. | Historical link, current subject, replacement links, OCR/payment/profile dependencies, copies/holds. | Unimplemented. #722/#723 after #961; domain lane owner also required. `FILE-LC-CHOICE-002`. |
| `FILE-LC-CLN-001` | Stable upload intent/idempotency identity; bounded provider probe; retry lease; exact state; no concurrent completion/link; safe timeout handling. | Reconcile/complete is conditional; cleanup is irreversible only for proven non-authoritative bytes. | Metadata, provider write result, subject link, job, audit, retry history, holds and copies. | Unimplemented. #966/#724; no dedicated existing cleanup issue found. `FILE-LC-CHOICE-004`. |
| `FILE-LC-CLN-002` | Complete registered-reference query in one consistent snapshot; provider check; no lease/job; no hold/copy; repeat proof immediately before action. | Candidate classification is reversible and non-mutating; later disposition is separate. | Bill/proof/QR, OCR review/assignment, notifications, import/export/backup manifests, audit/tombstone, vault, jobs, backups/snapshots/replicas. | Unimplemented. #966/#724; new focused owner only if those audits find none. `FILE-LC-CHOICE-004`. |
| `FILE-LC-CLN-003` | Explicit temporary/derivative classification; parent accepted and integral; reproducible or no longer required; bounded age policy; no lease/hold. | Scratch/derived deletion conditional and irreversible for that copy; canonical object remains. | Parent/source, current preview requirement, OCR/reprocessing jobs, offline queues, packages/copies. | Mostly documented-only; raw source not retained by default is policy direction, not cleanup runtime. #358/#1062/#966. |
| `FILE-LC-LOCAL-001` | Local policy, exact scratch identity, accepted destination or explicit discard, no queued/retry dependency. | Local discard irreversible for that copy; never server restore. | Offline queue, local accepted record, server acknowledgment, user intent, device backup/cache policy. | Local implementation incomplete/unreconciled. #971/#358/#966. `FILE-LC-CHOICE-007`. |

### 6.3 Retention, Disposition, Audit, Follow-Up, And Gates

| Row ID(s) | Retention / hard delete / purge | Audit and privacy | Follow-up lane and manual gates |
| --- | --- | --- | --- |
| `OBJ-001..003`, `CLN-001` | `pending`/`upload_failed`: transient cleanup candidates with unresolved clock. Hard delete unresolved until bytes and dependencies are positively classified; purge is separate. | Record safe upload/reconcile outcome, actor, file ID, purpose, states, reason, correlation/idempotency; no filename/hash/content/provider internals. Current upload success/failure audit is partial. | #341 purpose policy; #1062 validation; #966 runtime split; #724 retention/dependency. Storage/privacy, schema, API/OpenAPI/client, provider/config, and destructive gates remain pending as applicable. |
| `OBJ-004..005` | Quarantine retention and rejection outcome required but duration unresolved. Neither quarantine nor rejection authorizes disposal. | Record enter/release/reject/blocked/scan-unavailable categories without scanner/provider details or contents. No current audit proof. | #1062 canonical upload-security owner; #966 reconciliation. Security/storage/privacy and provider gates pending. |
| `OBJ-006..007`, `LINK-002..004` | Purpose/subject dependency-gated Trash retention; exact clocks unresolved. Ordinary hard delete/purge ineligible. | Record object and link transitions separately, safe subject type/ID where authorized, blocked restore reason, and no private subject/content leakage. Current remove audit exists; restore audit does not. | #723 UX; #724 retention/dependency; #722 API/schema split after #961; #966 storage runtime; relevant bill/settlement/payment/OCR lanes stay separate. Product/UX, storage/privacy, API/schema and destructive gates pending. |
| `OBJ-008..009`, `CLN-002` | Current marker is not disposal proof. Physical deletion is dependency-gated and destructive/manual; tombstone retention unresolved. | Require attempted/outcome audit, prior/new bounded state, byte outcome category, proof-set version, retry result, blocked reason, actor, time and correlation. Exclude provider identifiers/diagnostics. | #724 owns policy split; #966 owns completeness/duplicate reconciliation; #467/#964 may own redacted maintenance presentation. Destructive, storage/privacy, admin exposure, provider/config, schema/API, production operations gates pending. |
| `LINK-001` | Retain with active subject/history. No hard delete/purge from attach. | Current attach audit is implemented for bill/proof/payment detail with bounded metadata; public DTO privacy tests exclude storage internals. | #341/#966 and subject-domain owners. Runtime storage/privacy gate remains for changes. |
| `CLN-003`, `LOCAL-001` | Transient cleanup eligible only after positive non-authoritative proof. Exact clock unresolved. Never cleanup authoritative/history content. | Local audit applicability unresolved; server cleanup needs bounded result without local paths, object keys, content or private queue data. | #358 receipt intake, #971 local/offline/import, #1062 derivatives/security, #966 storage; provider/destructive/local-data gates pending as applicable. |

For every row, hard-delete status is `ineligible` for ordinary actions and
`unresolved` for the narrowly described future cleanup/disposition case.
Purge/disposal status is `unresolved` and blocked, except that it is
`ineligible` where the row is merely attach, activate, quarantine, release,
restore, re-link, or candidate classification. A user-initiated future terminal
action requires a separate consequence warning and explicit confirmation;
automated temporary cleanup must be non-user-initiated and policy-bounded.

### 6.4 Per-row Unresolved-choice References

Every transition has an explicit choice set. `none` would mean current
authority answers all row questions; no row qualifies for `none` at this
planning checkpoint.

| Row ID | Unresolved choice refs |
| --- | --- |
| `FILE-LC-OBJ-001` | `FILE-LC-CHOICE-004` |
| `FILE-LC-OBJ-002` | `FILE-LC-CHOICE-003`, `FILE-LC-CHOICE-004` |
| `FILE-LC-OBJ-003` | `FILE-LC-CHOICE-004` |
| `FILE-LC-OBJ-004` | `FILE-LC-CHOICE-003` |
| `FILE-LC-OBJ-005` | `FILE-LC-CHOICE-003` |
| `FILE-LC-OBJ-006` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004`, `FILE-LC-CHOICE-008` |
| `FILE-LC-OBJ-007` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-003`, `FILE-LC-CHOICE-008` |
| `FILE-LC-OBJ-008` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004`, `FILE-LC-CHOICE-008` |
| `FILE-LC-OBJ-009` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004`, `FILE-LC-CHOICE-008` |
| `FILE-LC-LINK-001` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-002` | `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-003` | `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-004` | `FILE-LC-CHOICE-002` |
| `FILE-LC-CLN-001` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004` |
| `FILE-LC-CLN-002` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004` |
| `FILE-LC-CLN-003` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-005`, `FILE-LC-CHOICE-007` |
| `FILE-LC-LOCAL-001` | `FILE-LC-CHOICE-007` |

### 6.5 Per-row Manual-gate Mapping And Registry

Each gate is independent. `pending` means this policy supplies no approval;
satisfying one gate never satisfies another. Approval evidence is `none` for
every pending gate.

| Row ID(s) | Applicable gate IDs |
| --- | --- |
| `FILE-LC-OBJ-001..003`, `FILE-LC-LINK-001`, `FILE-LC-CLN-001` | `FILE-LC-GATE-001`, `002`, `003`, `006`, `007` |
| `FILE-LC-OBJ-004..005` | `FILE-LC-GATE-001`, `002`, `003`, `006`, `007`, `008` |
| `FILE-LC-OBJ-006..008`, `FILE-LC-LINK-002..004` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `005`, `006`, `008` |
| `FILE-LC-OBJ-009`, `FILE-LC-CLN-002` | `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `007`, `008`, `009`, `010` |
| `FILE-LC-CLN-003` | `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `007`, `008` |
| `FILE-LC-LOCAL-001` | `FILE-LC-GATE-005`, `006`, `011` |

| Gate ID | Required scope; owner | Status / approval evidence | Downstream work blocked |
| --- | --- | --- | --- |
| `FILE-LC-GATE-001` | Storage/file privacy and authorization policy/runtime; #966/#341/#1062 with human privacy authority. Required for any affected server behavior. | `pending`; none. | Object/link/read/upload/quarantine/cleanup runtime. |
| `FILE-LC-GATE-002` | Persistence/schema/migration; #722 schema lane after #961. Required when lifecycle fields, constraints, reference registry, or state meaning changes. | `pending`; none. | New restore, disposition, idempotency, reference-proof, and provider-outcome persistence. |
| `FILE-LC-GATE-003` | API/OpenAPI/generated clients; #722 contract/API lanes after #961. Required for any new/changed endpoint or generated surface. | `pending`; none. | Restore, lifecycle status, quarantine, maintenance, cleanup, and disposition APIs/clients. |
| `FILE-LC-GATE-004` | Product Trash/restore wording and Figma; #723 with human product/UX approval. Required for user-visible inactive/restore/terminal action. | `pending`; none. | Client Trash, restore, blocked-state, warning, and confirmation UI. |
| `FILE-LC-GATE-005` | Destructive cleanup/disposal decision; human product/data owner and operator, with #724 technical evidence. Required before physical byte or local authoritative-copy deletion. | `pending`; none. | `OBJ-009` and any destructive `CLN-001..003`/`LOCAL-001` outcome. |
| `FILE-LC-GATE-006` | Retention, dependency, hold, tombstone, and audit policy; #724 with human trust/privacy decisions. Required for clocks, eligibility, or evidence disposal. | `pending`; none. | Expiry, orphan proof, cleanup scheduling, restore eligibility, and terminal disposition. |
| `FILE-LC-GATE-007` | Provider/configuration and operational behavior; deployment/operator owner after storage policy. Required for provider probes, deletion, leases, or scanner integration. | `pending`; none. | Provider reconciliation, cleanup executor, scanner, and physical outcome proof. |
| `FILE-LC-GATE-008` | Privacy-vault/security/key/recovery behavior; #343/#966 and human security/privacy authority. Required when protected content or recovery is affected. | `pending`; none. | Vault-file restore, quarantine inspection, cleanup, copy disposition, and no-downgrade acceptance. |
| `FILE-LC-GATE-009` | Admin/public exposure; #466/#467/#964 with human exposure approval. Required for maintenance/admin read or action surfaces. | `pending`; none. | Admin lifecycle metadata, blocked-attempt, cleanup, and disposition controls. |
| `FILE-LC-GATE-010` | Production maintenance/deployment operation; operator/human release authority. Required before live cleanup or purge execution. | `pending`; none. | Scheduled/manual production cleanup, byte deletion, and provider reconciliation. |
| `FILE-LC-GATE-011` | Local platform storage/privacy and user-discard behavior; #971/#358 with human platform/privacy authority. Required for local scratch/cache/offline deletion. | `pending`; none. | Local-only cleanup, offline acknowledgment, secure-cache retention, and device acceptance. |

## 7. Inactive Read And Restore Contract

### 7.1 Audience-specific inactive reads

| Condition | Ordinary metadata/list | Content | Thumbnail/preview | Owner/admin | Maintenance/audit and retained history |
| --- | --- | --- | --- | --- | --- |
| Active object + active compatible link | Allowed only after current purpose/subject authorization. | Same; authorization is checked on every request. | Same; a derivative is not a bypass. | Owner follows subject policy; admin has no blanket access. | Bounded safe metadata only under an approved role/purpose. |
| Active object + inactive/missing link | Not readable through that subject. | Blocked. | Blocked. | Owner does not gain a generic-file bypass; use an explicit restore/reconcile surface when implemented. | Bounded link/object inspection only if separately authorized. Historical reference may remain. |
| `pending` or `upload_failed` | Blocked outside bounded upload status/reconciliation. | Blocked. | Blocked. | No generic owner read. | Bounded state/outcome inspection; byte preview is not proof and is blocked by default. |
| `quarantined` | Blocked from ordinary surfaces. | Blocked. | Blocked; do not render untrusted content. | Owner receives bounded status/reason only where policy permits; admin still lacks blanket content. | Separately authorized security inspection may use sandboxed tooling; no ordinary download. Runtime absent. |
| `deleted` | Blocked from ordinary current views; a future Trash/restore list may return safe metadata after authorization. | Blocked. | Blocked unless a future restore-preview policy explicitly authorizes a safe generated representation. | Owner/admin cannot bypass inactive state. | Required history and bounded lifecycle evidence may remain visible to approved audit/maintenance roles. |
| `purged` marker or unknown provider state | Tombstone/status only where authorized; never claim byte outcome from marker alone. | Blocked. | Blocked. | No bypass. | Reconciliation sees bounded outcome categories, not paths, keys, URLs, credentials, contents, or provider diagnostics. |

Current ordinary bill/proof/QR reads implement the active-object/active-link
posture. Current source does not implement Trash metadata, maintenance, admin,
quarantine, or restore-preview reads; those entries are policy requirements.

### 7.2 Restore/reactivation decision

A restore request must name the authenticated requester, exact authoritative
API/domain/storage owner, stable file ID, optional exact subject/link ID, source
state, and target state. The authoritative owner must revalidate at acceptance
time:

1. account and requester ownership/authorization, without treating admin as a
   content role;
2. exact `deleted` object and inactive-link state, retained bytes, byte
   readability/integrity, and any supported content validation;
3. purpose compatibility with the target subject and the active upload policy;
4. target subject existence, visibility, status, capacity, historical
   dependencies, and current mutation eligibility;
5. privacy/vault mode, quarantine/rejection, encryption/recovery availability,
   and no downgrade;
6. replacements, duplicates, conflicting active links, changed owner, quotas,
   retention holds, and terminal-disposition evidence;
7. idempotency identity, expected version, racing unlink/replace/purge, and a
   deterministic prior-result or conflict response; and
8. separate bounded object-restore and link-reactivation audit events.

Missing/unreadable bytes, a `purged` marker without trustworthy provider
outcome, failed integrity/validation, incompatible purpose, unavailable or
immutable subject, unauthorized actor, changed privacy policy, unresolved
dependency/hold, active replacement, duplicate ambiguity, and concurrent
transition block restore. Restore does not silently reattach any subject,
reopen an OCR review, restore a notification, change a settlement/payment/bill,
or revive a browser/device copy.

## 8. Failure And Cleanup Decision Table

| Scenario | Required posture |
| --- | --- |
| Byte write fails before metadata reservation | Current server pattern reserves metadata first. For any future alternate pattern, no accepted row/link exists; bounded temporary cleanup may target only the exact operation-owned bytes after proving they are non-authoritative. |
| Metadata exists but byte write fails | Keep/mark `upload_failed`; ordinary reads stop. Reconcile whether zero, partial, or complete bytes exist before retry or cleanup. |
| Bytes exist but activation/link completion fails | Do not serve. Current compensation may leave `upload_failed`, `deleted`, or an active unlinked object. Record the exact step and retry identity; reconcile before any provider deletion. |
| One link is removed | Make that link inactive. Do not infer byte deletion. Recalculate reference/hold evidence across all link and history categories. |
| Zero references are observed | Mark only a derived orphan candidate after querying the complete registered reference set in a consistent snapshot. Repeat immediately before disposal. Absence in one table is insufficient. |
| Multiple references exist | Object-wide logical removal or disposal is blocked unless every authoritative link/domain owner accepts its own transition. One unlink affects only that link. |
| Temporary/generated intermediate | Cleanup only after the accepted canonical result and its dependency/integrity evidence exist, no retry/job needs the intermediate, and policy classifies it non-authoritative. |
| Provider says missing/unreadable | Fail closed as unknown/inconsistent. Do not call it orphaned, purged, or restored. Preserve metadata/history and route bounded reconciliation. |
| Cleanup partially fails or times out | Retry the same idempotent cleanup intent. “Already absent” is success only when exact target identity and prior authorization are proved; otherwise return unknown/blocked. API accepts authoritative metadata outcome after provider result. |

Cleanup jobs must be lease/concurrency safe, bounded in batch size, restartable,
and auditable. They receive stable opaque IDs and approved operation tokens, not
client paths or provider internals. They never delete authoritative files,
history, or core rows and never write those tables directly.

## 9. Retention And Terminal Disposal

No numeric duration is chosen here.

| Purpose/state | Classification and trigger |
| --- | --- |
| Active normalized receipt | Policy-defined, dependency-gated while parent receipt/bill and required history exist. |
| Raw receipt input | Source-defined transient intent: discard after successful normalization, integrity/readability, accepted canonical persistence/link, and no retry need. Runtime proof absent. |
| OCR source/derivative | Required but duration unresolved; gated by review, reprocessing, privacy, accepted-record, and audit needs. |
| Thumbnail/preview | Policy-defined with parent; cleanup only if safely reproducible and not required for accessibility/readability or current jobs. |
| Settlement proof | Policy-defined dependency-gated while proof/payment/settlement record and history require it. |
| Payment QR | Policy-defined while payment-profile setting/link exists; replacement/removal enters logical-removal policy. |
| Supporting attachment | Policy-defined dependency-gated while parent attachment/history exists. |
| Statement/import source | Required but duration unresolved; rejected/conflicted candidates remain until explicit discard or reviewed retention. |
| Export package | Required explicit expiry policy; duration and download-copy caveat unresolved. |
| Backup package | Dependency-gated; recovery, encryption, manifest, copy/replica and hold obligations unresolved. Disposal is destructive/manual. |
| `pending`/`upload_failed` | Transient cleanup candidate after positive proof; clock unresolved. |
| `deleted`/Trash | Configurable Trash retention is architecture direction; duration and clock trigger unresolved. Expiry does not purge. |
| `quarantined` | Required but duration/review/rejection outcome unresolved; no automatic disposal. |
| `purged` tombstone | Required tombstone/history retention unresolved; marker does not establish byte outcome. |

Physical purge/hard delete is always a separate operation from user-visible
removal, retention expiry, unlink, and metadata marking. Before provider work,
the API-owned decision must positively establish retention eligibility,
dependency and hold clearance, retained-copy disposition, exact target and
version, approved authority, consequence warning/confirmation where applicable,
and a durable retry/audit record. After provider work, the API accepts only a
bounded success/already-absent/failed/unknown result and preserves required
tombstone/history. This policy executes none of those actions.

## 10. Explicit Open Choices

| Choice ID | Exact question and why unresolved | Safe/blocked posture, owner, downstream work |
| --- | --- | --- |
| `FILE-LC-CHOICE-001` | What are each purpose/state retention duration, clock trigger, hold, and tombstone rule? Current fields accept arbitrary nonblank policy text and architecture gives no number. | No automatic expiry/purge. #724 owns retention/dependency policy splitting; #466 may consume approved admin policy. Blocks cleanup/disposal/runtime acceptance. |
| `FILE-LC-CHOICE-002` | Which actors and exact API/schema mechanics restore an object and separately reactivate each link, including replacement/multi-link conflicts? | No restore or silent reattachment. #722 after #961 owns API/schema split; #723 owns UX; #966/domain owners reconcile runtime. |
| `FILE-LC-CHOICE-003` | Which source states enter quarantine, who may inspect/release/reject, and what bounded reasons/outcomes persist? | Ordinary access blocked; scanner unavailable is not clean. #1062 owns quarantine pipeline, with #966 reconciliation. |
| `FILE-LC-CHOICE-004` | What complete reference registry, copy inventory, leases, consistent-snapshot proof, and idempotency record establish orphan/failed-upload cleanup eligibility? | Unknown or incomplete evidence blocks cleanup. #724/#966 must adopt or recommend one focused runtime owner; no duplicate issue exists now. |
| `FILE-LC-CHOICE-005` | How are thumbnail/preview derivatives identified and linked without expanding the existing purpose enum, and when are they safely reproducible? | No independent derivative cleanup or unsafe preview serving. #1062/#966/#358 own adjacent validation/intake reconciliation; schema/API changes await #722. |
| `FILE-LC-CHOICE-006` | How are persisted export versus backup packages distinguished within `export_file`, encrypted, expired, downloaded, and copy-disposed? | Owner-only, no stored-package runtime claim, no automatic disposal. #406/#971 own portability; #724 owns retention; #966 owns file integration. |
| `FILE-LC-CHOICE-007` | What authoritative local-only scratch/cache/offline-file model, retention clock, secure storage, and acknowledgment proof apply per platform? | Local material cannot mutate server state or be discarded merely because a route/cache changed. #971/#358/#966; platform/privacy gate pending. |
| `FILE-LC-CHOICE-008` | Should the current metadata `purged` state be renamed/redefined, or paired with explicit provider-disposition state so it cannot falsely claim physical deletion? | Treat it as an incomplete tombstone marker; never expose “permanently deleted” from it alone. #724 policy then #722 schema/API; destructive/storage gate pending. |

## 11. Follow-Up Ownership And Duplicate Prevention

Live GitHub was checked on 2026-09-15 before editing. Merged work is credited
even when umbrellas remain open:

| Gap | Existing owner / canonical lane | Recommendation |
| --- | --- | --- |
| Purpose limits, normalization, retention hooks | #341, storage-file-privacy-authz | Reconcile rather than duplicate; #966 determines remaining runtime slices. |
| Malicious-file validation, safe previews, quarantine | #1062, storage-file-privacy-authz/security | Reuse. Do not absorb into #719. |
| Storage/file completeness and runtime split | #966, storage-file-privacy-authz | Consume this policy after merge; it remains inactive here. |
| Retention, dependency proof, orphan/failed cleanup and terminal disposition | #724 after #961, retention/audit/maintenance | Reuse umbrella and require it to split focused runtime/maintenance owners. Recommend a new orphan-cleanup child only if its fresh search still finds none. |
| API/OpenAPI/generated clients and persistence/schema | #722 after #961, separate API/contract/schema lanes | Keep separate and manual-gated; generated clients are never hand-edited. |
| Trash/restore/purge presentation | #723, mobile/web/admin UI with Figma/manual gate | Reuse; no UI decision here. |
| Admin policy/maintenance/readout | #466/#467 and #964, web-admin/maintenance | Reuse; admin remains redacted and has no blanket content access. |
| Privacy vault sensitive file integration | #343 with merged #418–#422 policy packets; #966 runtime reconciliation | Credit the merged policies; do not claim vault runtime or create a replacement umbrella. |
| Receipt intake/derivatives/OCR | #358/#357 and #1062/#966, mobile/OCR/storage lanes | Keep normalization, OCR processing, file authz, and lifecycle ownership separate. |
| Settlement proof/payment QR domain behavior | Existing settlement/payment endpoints and #966; domain changes stay settlement/payment-details lanes | Do not move money, payment, visibility, or settlement authority into cleanup. |
| Import/export/backup/restore packages | #406/#971, sync-import-export-restore | Reuse; browser/package/local paths never become server storage authority. |
| Future provider tiering/multi-target | #1076, later-day provider/deployment lane | Preserve abstraction only; no Day 2 runtime enters Day 1. |

#719 creates no runnable issue. #723, #724, #966, and later #961 retain their
separate close rules and are not silently completed by this document.

## 12. Evidence, Manual Gates, And Stop Conditions

Primary implementation evidence includes:

- `Domain/Files/FileObject*`, `Persistence/SettleoraDbContext`, and the file
  metadata migration/model tests for enum, field, index, and restrictive-FK
  facts;
- `Storage/EfFileObjectLifecycleService`, its audit writer, provider interface,
  local provider, and lifecycle/provider tests for transition and byte-operation
  facts;
- bill attachment, settlement proof, self payment QR, and counterparty payment
  detail endpoints/tests for link, authz, read, remove, and failure facts;
- OCR review/assignment and notification persistence for retained file-ID
  dependencies;
- current OpenAPI plus generated Dart/web methods and serialization privacy
  tests for exposed surfaces and provider-internal exclusion; and
- the architecture sources linked above for documented-only policy direction.

Live issue/PR reconciliation at that revision found #960 closed through merged
PR #1237; #721 closed through PR #1238; #719/#716/#717/#723/#724/#966/#975
open; #418–#422 closed through their reviewed planning/UX PRs; and no existing
#719 branch, PR, merged equivalent, or focused orphan-cleanup issue. Open state
alone was not treated as proof of missing implementation.

The following gates remain separate and pending whenever a future change
touches them: storage/file privacy and authorization; schema/migration;
API/OpenAPI/generated clients; product retention/trust choice; Figma/client UX;
admin/public exposure; vault/security/key management; provider/configuration;
destructive cleanup or purge; production operations/deployment; and local
platform storage. This documentation review satisfies none of them.

Stop future work rather than infer authority when object and link state are
conflated, a read bypasses either inactive condition, restore lacks current
revalidation, failed/inaccessible is treated as disposable, dependency or copy
proof is incomplete, a worker would mutate business tables, provider internals
would escape, retention expiry is treated as purge, current `purged` is treated
as physical proof, or any manual gate remains unsatisfied.

## 13. Validation And Acceptance Contract

This policy is complete only as a planning artifact. Runtime acceptance later
must prove, for every applicable purpose and transition:

- deterministic inventory coverage using the row IDs above and all existing
  purpose/status symbols;
- object/link independence, multi-reference preservation, and restrictive
  history behavior;
- ordinary metadata/content/preview denial for every inactive combination;
- owner, participant, counterparty, maintenance, and hostile unrelated-actor
  authorization without admin blanket access or enumeration leakage;
- restore revalidation, duplicate/conflict/idempotency/concurrency behavior,
  and no silent reattachment;
- storage-write, metadata-write, association-write, provider-read/delete,
  timeout, retry, crash, and partial-failure reconciliation;
- complete dependency/hold/copy proof before cleanup and terminal disposition;
- bounded lifecycle/denial/cleanup/disposal audit with sensitive/provider-
  internal exclusion; and
- exact OpenAPI/generated-client parity, client unavailable/blocked states,
  approved UX evidence, provider-operational proof, and destructive/manual
  approval where those lanes apply.

Planning text, enum presence, a metadata marker, a worker result, an available
generated method, or a passing ordinary-read test is never proof that restore,
retention, cleanup, physical deletion, or terminal disposal is implemented.
