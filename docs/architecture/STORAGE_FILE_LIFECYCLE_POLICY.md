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
  it. Bill authorization and mutable-status checks occur before the upload and
  are not reloaded immediately before link commit, so a concurrent status or
  membership change can make those observations stale. There is no generic
  public file API.
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
- A non-cancellation storage-write failure triggers a best-effort attempt to
  mark the reserved object `upload_failed`, but each upload handler ignores that
  lifecycle result; metadata can remain `pending`. Request cancellation bypasses
  that failure handler, so metadata remains `pending` while the local provider
  may already have created partial bytes. The endpoint does not remove them.
  Each bill, proof, and QR upload also buffers the multipart file into a managed
  `byte[]` before metadata reservation and retains that copy through validation
  and provider write; ordinary garbage collection, not explicit zeroization or
  a deterministic release time, controls its disposal. Each handler calls
  `ReadFormAsync` first, so framework multipart buffering may also stage an
  above-threshold body in a server temporary file; no repository `FormOptions`
  override or application crash-cleanup evidence defines that copy's lifecycle.
  Cancellation or another thrown exception during `MarkActiveAsync` after the
  provider write bypasses the unsuccessful-result branch in every handler, so
  activation commit/state can be unknown with complete bytes and no link. A caught
  `DbUpdateException` during association save triggers a best-effort attempt to
  change the now-active object to `deleted`, but each handler ignores that
  lifecycle result. Cancellation and other exception types bypass that catch
  and compensation, so the object can remain active while link/audit commit
  outcome is unknown. No cleanup runner reconciles either case.
- QR replacement has no expected-version guard. Concurrent replacements can
  each activate a new object and save the profile; last write wins, while both
  requests target only the commonly observed previous object for logical
  deletion. The losing new object can therefore remain active and unlinked.
- Current file lifecycle audit proves success events only for upload start,
  completion, failure, logical deletion, and metadata `purged`. It records a
  bounded file ID, purpose, prior/new status, provider category, timestamp, and
  actor account through `auth_audit_events`; it excludes filenames, hashes,
  retention text, vault references, object keys, paths, and contents. It does
  not prove denial, cleanup, dependency, restore, or physical-delete audit.
- Current OpenAPI and generated clients expose subject-specific bill
  attachments, settlement proofs, payment QR flows, OCR review flows over a
  receipt attachment, direct streamed bill export/import operations, and local
  backup package operations. Direct CSV/JSON export creates a request response,
  not a server artifact, and has no downloaded-copy inventory. Direct CSV
  preflight returns a request-scoped review without mutation; direct CSV import
  creates draft bills and audits without a session or confirmation. Persisted
  CSV import sessions retain their review/candidate JSON after confirmation,
  discard, or lazy expiry; no cleanup removes those fields or rows. Direct and
  session-confirmed imports do not recheck authorization at database acceptance,
  so revocation after their initial check may race the commit. Direct import
  catches only `DbUpdateException`; cancellation/other thrown save failures have
  unknown commit outcome, and an unkeyed retry can duplicate a committed import.
  Parallel confirmations can both pass ready/challenge checks; after one commits
  the shared candidate IDs, the other may return generic database-write failure
  rather than the successful prior result. The backup
  runtime holds sessions and data-only
  package artifacts in process memory, permits authenticated content downloads
  through separately issued actions whose consumed flags block sequential
  reuse but are not atomically single-use under concurrent requests, and parses submitted
  package content into a bounded restore preview and metadata-only confirmation
  session. Restore-preview creation materializes private submitted content as
  request text, parsed package text, and UTF-8 bytes; those full-content copies
  are GC-controlled and not explicitly cleared or zeroized. Its advertised TTLs are enforced lazily on later access; there is no
  background sweep or removal of package-session entries, so an unaccessed
  artifact can remain in process memory until process restart. Later accesses
  can clear artifact references and prune actions. Preparation can enter
  `blocked`; the authorization-failure branch preserves a prior ready artifact
  and actions, while generation-validation failure clears them. Restore-preview
  and confirmation entries retain bounded package-summary references after
  discard or lazy expiry; same-actor/session GETs continue returning those
  terminal summaries until process restart, and their dictionaries have no
  removal sweep. It does not
  persist a backup as a `FileObject` or through the storage provider, include
  file bytes, or apply a restore. No file-object restore, quarantine, retention,
  cleanup, or physical-purge operation is exposed.
- Package sessions live in a concurrent top-level dictionary, but each
  session's download actions use an ordinary unsynchronized dictionary.
  Concurrent issue/download/cancel/prune operations can race the consumed flag,
  mutate during enumeration, throw, or leave inconsistent process state.
- The separate package-readiness GET currently returns `Available: false`, an
  unsupported stable code, and copy saying creation/download/preview/
  confirmation are unsupported even though those handlers are mapped in the
  same endpoint class. This contract contradiction is current source truth,
  not authority to infer either side away.

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
| Bill receipt attachment | `RemovedAtUtc == null` with `receipt_image` purpose | `RemovedAtUtc != null` | Current attach/remove. The row persists; restrictive OCR review/assignment and notification dependencies can persist. |
| Bill supporting attachment | `RemovedAtUtc == null` with `supporting_attachment` purpose | `RemovedAtUtc != null` | Current attach/remove. The row persists and bill/history dependencies can persist; receipt OCR review/assignment flows do not apply. |
| Settlement proof attachment | `RemovedAtUtc == null` | `RemovedAtUtc != null` | Current attach/remove. The payment and proof history persist. |
| Payment-profile QR | `QrFileObjectId != null`, independently of whether the referenced object is currently readable | `QrFileObjectId == null`; profile inactivity is a separate subject-access condition | Current attach/replace/remove. Object status can block reads without changing this link, so object restore must enumerate and revalidate every non-null QR reference. |
| OCR review/assignment and notification reference | Current domain status plus a stable file reference | Domain-specific terminal/removed state where defined | Dependency/history record, not a byte-ownership link. Its existence blocks orphan proof until policy says otherwise. |
| Future package/import/derivative link | Not defined | Not defined | Documented-only; must use a reviewed relationship rather than provider paths or an inferred filename/hash. |

## 4. Day 1 Purpose Mapping

This table uses the existing file-purpose enum. Qualifiers such as canonical,
derivative, temporary, failed, and orphan are lifecycle/relationship facts,
not new purposes.

| Required class | Existing purpose mapping | Current runtime | Retention classification |
| --- | --- | --- | --- |
| Receipt source/original | The normalized user-accepted canonical image maps to `receipt_image`. A raw camera/gallery input is temporary intake material and is not retained by default after successful normalization. | Bill upload stores accepted JPEG/PNG/WebP bytes as `receipt_image`; normalization and raw-source cleanup are not proved by this endpoint. | Canonical image: policy-defined dependency-gated to its parent/history; exact duration unresolved. Raw input: source-defined transient cleanup eligible only after normalized-byte integrity and accepted-link proof. |
| OCR source where distinct | `ocr_source`. A receipt used directly by current OCR review remains its `receipt_image`; do not relabel it. | Enum/schema reserved; no standalone OCR-source upload or worker-file runtime. | Required but duration unresolved; dependency-gated to job/review/reprocessing and privacy policy. |
| Receipt thumbnail/preview | A derivative of the source file; current enum has no separate thumbnail purpose. A future persisted derivative needs an explicit parent relationship and derivative marker. | Mobile `ReceiptImageArtifactProcessor` currently creates a thumbnail JPEG in memory with the normalized JPEG for accepted decodable JPEG/PNG/WebP input. It creates no server `FileObject` or persistent derivative link; secure cache is explicitly deferred, and release/GC timing is not lifecycle proof. | Current in-memory bytes are transient and caller-owned; explicit disposal/zeroization is not proved. A future persisted derivative is policy-defined with its parent and cleanup requires reproducibility/dependency proof. `FILE-LC-CHOICE-005`. |
| Supporting attachment | `supporting_attachment`; current bill-link purpose uses the same value. Screenshots or documents remain this purpose when supporting a bill. | Current bill upload/list/content/remove. | Policy-defined dependency-gated to the attachment subject/history; duration unresolved. |
| Settlement/payment proof | `settlement_proof`. | Current settlement-payment upload/list/content/remove. | Policy-defined dependency-gated to proof/payment/settlement history; duration unresolved. |
| Payment QR/payment image | `payment_qr`. | Current self attach/replace/remove/content and settlement-scoped counterparty content read. | Policy-defined dependency-gated while the payment setting/link exists; removed/replaced copies enter retained logical removal pending policy. |
| Generated export package | `export_file` when bytes are persisted. Current CSV/JSON exports stream one-request responses and do not create a file object or server artifact. | Purpose reserved; direct exports create transient response content only. The server has no export session/expiry or downloaded-copy inventory and cannot dispose of the client-controlled copy. | A future persisted artifact requires explicit expiry policy; that policy cannot prove cleanup of current response/client copies. Current server response lifetime is request-scoped, while client-copy retention/disposal is unresolved. |
| Generated backup package | `export_file` is the existing architectural category for a persisted backup/export bundle; package manifests must distinguish backup from ordinary export without inventing a second file purpose. | Current API creates process-local data-only package artifacts and can issue multiple download actions for one ready artifact; an action blocks sequential reuse after consumption but does not prevent concurrent racing downloads. It parses restore previews but does not create a `FileObject`, write through storage, include file bytes, or apply restore mutations. An unaccessed artifact is not swept and can remain in memory until process restart. | Current source defines access-validity TTLs, not guaranteed memory disposal; missing eager cleanup and downloaded-copy inventory are retention gaps. Any future persisted package is dependency-gated and requires a destructive/manual disposal decision. Persisted duration, encryption, copy inventory, and recovery hold remain unresolved. `FILE-LC-CHOICE-006`. |
| Imported-source file | `statement_upload` for a file-backed statement/import source. Package-local blobs remain untrusted package input until API acceptance; current CSV request bodies are not `file_objects`. | Enum reserved. Direct preflight/import parse request-scoped CSV without a file-object or session; direct import creates draft bills/audits. Session-backed import persists `ReviewJson` and `CandidateJson`; confirm, discard, and lazy expiry change status/timestamps without clearing those fields or deleting the row. | Required but duration unresolved. Request buffers are transient with GC-controlled release and no zeroization proof. Persisted candidate/review data remains after confirmation, discard, or expiry until a separate authorized retention operation exists; those statuses are not disposal proof. |
| Temporary upload/staging | Keep the intended final purpose and use `pending`; local scratch before reservation is outside server metadata. | Current uploads use `pending`; no separate staging purpose or cleanup timer. | Transient cleanup eligible only with positive non-authoritative/dependency proof. |
| Failed upload | Keep intended purpose and use `upload_failed`. | Current metadata transition; byte presence is unknown. | Transient cleanup candidate, never automatically disposable; duration unresolved. |
| Orphan/unlinked object | Keep original purpose and derive “orphan candidate” from a complete reference inventory. | No state or proof service. | Dependency-gated; physical disposal blocked until positive proof. |
| Statement upload (additional current enum) | `statement_upload`. | Reserved; no storage-backed statement upload. | Required but duration unresolved; private to importer by default. |
| Export file (additional current enum) | `export_file`. | Reserved; current exports are streamed. | Explicit expiry policy required; duration unresolved. |

## 5. Common Policy-Row Contract

The matrices in sections 6.1 through 6.6 together complete every reusable-row
field from #960. These common values apply to every row unless a cell narrows
them:

- **Authority mode/workspace:** server mode in one self-hosted workspace,
  except `FILE-LC-LOCAL-001..002`, which are local-only and cannot mutate
  server records. `FILE-LC-PKG-*` rows are current API-owned process memory,
  not storage-provider or `FileObject` state. The API/domain/storage boundary
  is authoritative in server mode.
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
  metadata; that is a gap, not permission to infer success. For
  `FILE-LC-LOCAL-001..002` and `FILE-LC-PKG-*`, server file-object/link fields
  are not applicable;
  required local scratch/cache identity, state, acknowledgment, and disposal
  evidence are unresolved rather than inferred from server metadata.
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
| `FILE-LC-OBJ-006` | **Move active file to Trash** / logical object removal | Current service accepts `active → deleted`; current subject removes invoke it. The service can technically accept `quarantined → deleted`, but that is not approved here as a rejection policy. | Object changes; link may or may not change in a separate row. | Ordinary metadata/content/preview reads stop for every link. Retained evidence remains maintenance/audit-only. No physical delete. |
| `FILE-LC-OBJ-010` | **Reject quarantined file** / bounded unavailable outcome | Documented decision row from `quarantined` to a target state that remains unresolved under `FILE-LC-CHOICE-003`. The current generic service's ability to mark `quarantined → deleted` is not proof of accepted rejection authority or semantics. | Object decision only; links/history remain blocked and unchanged unless separately authorized. | Ordinary reads remain blocked. Show only an approved safe rejected/unavailable result; do not call it Trash, deletion, or disposal while the target is unresolved. |
| `FILE-LC-OBJ-007` | **Restore file** | Proposed `deleted → active` plus clearing `DeletedAtUtc`, only after the checks in section 7 and explicit acceptance of every link already marked active. | Object only. Inactive links remain inactive; any already-active link must be enumerated and independently accepted or the object restore blocks. | Restore preview may expose bounded safe metadata only after requester authorization. Content resumes only through links explicitly accepted as active; a chosen inactive receipt/supporting/proof/QR link still requires `LINK-004`, `LINK-013`, `LINK-008`, or `LINK-009`. |
| `FILE-LC-OBJ-008` | Internal metadata tombstone transition — never claim **Permanently deleted** | Current service accepts `deleted|upload_failed → purged`, writes metadata/audit only, and does not call provider delete. | Object only; links and bytes are not proved changed. | Ordinary reads remain blocked. Further mutation must treat provider and dependency outcome as unknown. Partial implementation must not be presented as completed disposal. |
| `FILE-LC-OBJ-009` | **Purge retained logically removed file** | Future API-owned orchestration accepts only an eligible `deleted` authoritative object, authorizes provider deletion after retention/dependency/hold proof, records the bounded provider result, and accepts the terminal metadata/tombstone state. | Retained bytes/provider outcome plus object marker; links/history remain retained or separately transitioned by policy. | Irreversible for the deleted bytes. Metadata/content restore is unavailable; bounded tombstone/history remains where required. This is not immediate failed/staging cleanup. |
| `FILE-LC-LINK-001` | **Attach receipt image** | Current bill API creates an active `ExpenseBillAttachment` after earlier bill mutation authorization/status checks, object activation, `receipt_image` purpose/image-media validation, and duplicate-pair checks. It does not reload authorization/status at link acceptance and does not enforce an attachment-count capacity. | Receipt bill link only; object remains `active`. | A concurrent bill finalization/archive or group-access loss can make the earlier check stale and still allow link commit. Current authorized bill viewers may later list/read under bill policy; restrictive OCR dependencies remain receipt-specific. |
| `FILE-LC-LINK-011` | **Attach supporting file** | Current bill API creates an active `ExpenseBillAttachment` after earlier bill mutation authorization/status checks, object activation, `supporting_attachment` purpose/image-or-PDF validation, and duplicate-pair checks. It does not reload authorization/status at link acceptance and does not enforce an attachment-count capacity. | Supporting bill link only; object remains `active`. | A concurrent bill finalization/archive or group-access loss can make the earlier check stale and still allow link commit. Current authorized bill viewers may later list/read under bill policy; no receipt OCR relationship is created. |
| `FILE-LC-LINK-006` | **Add settlement proof** | Current settlement-payment API creates an active `SettlementProofAttachment` after object activation and settlement/payment authorization and status checks. | Proof link only; object remains `active`. | Current authorized proof/payment viewers may list/read under settlement policy. Link creation never broadens object ownership. |
| `FILE-LC-LINK-005` | **Add QR image** | Current self payment-details API changes the profile from `QrFileObjectId == null` to the newly activated owned `payment_qr` file ID after current profile checks. | Link only at this step; object remains `active`. | The self profile and currently authorized settlement-scoped counterparty reads may resolve the QR under their separate policies. Initial attachment grants no generic file access. |
| `FILE-LC-LINK-002` | **Remove receipt image** | Current bill API sets the receipt bill link `RemovedAtUtc`; it also calls object `active → deleted` in the save boundary. | Receipt bill link and object currently change, but unlink and object removal remain conceptually distinct. | This bill link and all ordinary object reads stop. OCR review/assignment, notification, history, and other reference classes prevent any inference of physical disposability. |
| `FILE-LC-LINK-012` | **Remove supporting file** | Current bill API sets the supporting bill link `RemovedAtUtc`; it also calls object `active → deleted` in the save boundary. | Supporting bill link and object currently change, but unlink and object removal remain conceptually distinct. | This bill link and all ordinary object reads stop. Bill/history and other reference classes prevent any inference of physical disposability. |
| `FILE-LC-LINK-007` | **Remove settlement proof** | Current settlement-payment API sets the proof link `RemovedAtUtc`; it also calls object `active → deleted` in the save boundary. | Proof link and object currently change, but unlink and object removal remain conceptually distinct. | This proof link and all ordinary object reads stop. Payment/settlement history and other references prevent any inference of physical disposability. |
| `FILE-LC-LINK-003` | **Remove QR image** | Current DELETE clears `QrFileObjectId`, saves the profile, then attempts old object `active → deleted`; a failed later transition is not surfaced. | Link changes from old ID → null first; old-object transition is separate and may not occur. | Old QR is no longer ordinarily reachable through the profile. An active unlinked object may remain and becomes a reconciliation candidate, not disposable proof. |
| `FILE-LC-LINK-010` | **Replace QR image** | Current POST reserves, writes, and activates a new object, changes `QrFileObjectId` from old ID → new ID, saves, then attempts old object `active → deleted`; that later result is ignored and no expected-version guard protects the profile update. | New object plus QR link change first; old-object transition is separate and may not occur. | Failed link save can strand the new object; failed old-object transition can leave an active unlinked old object. Concurrent replacements that observed the same old ID can both save, after which last write wins and the losing newly active object is unlinked because both requests delete only the shared old object. |
| `FILE-LC-LINK-004` | **Restore receipt image** | Proposed explicit removed → active receipt bill relationship after object readiness, current bill authorization/status, `receipt_image`/image-media checks, and fresh OCR/notification dependency validation. | Receipt bill link only; object restore is separately accepted first. | Bill access resumes only for authorized current bill viewers. OCR review/assignment and notification state are not silently reopened or changed. |
| `FILE-LC-LINK-013` | **Restore supporting file** | Proposed explicit removed → active supporting bill relationship after object readiness, current bill authorization/status, and `supporting_attachment`/image-or-PDF checks. | Supporting bill link only; object restore is separately accepted first. | Bill access resumes only for authorized current bill viewers. No receipt OCR relationship is created, and other links/history remain unchanged. |
| `FILE-LC-LINK-008` | **Restore settlement proof** | Proposed explicit removed → active proof relationship after object readiness and current settlement/payment authorization/status/purpose checks. | Proof link only; object restore is separately accepted first. | Proof access resumes only for the authorized payment/settlement audience. Other links and history remain unchanged. |
| `FILE-LC-LINK-009` | **Reattach QR** | Proposed explicit null/replaced → linked QR relationship after object readiness and current self-profile ownership, visibility, and purpose checks. | QR link only; object restore is separately accepted first. | QR access resumes only under self and settlement-scoped counterparty policies. Cached routes or prior profile state grant nothing. |
| `FILE-LC-PKG-001` | Create process-local backup session | Current API creates actor/session-bound `created` metadata in process memory, with no artifact bytes. | Neither file object nor subject link; process-local session metadata only. | Only the same authenticated user profile and auth session may read or act on it. |
| `FILE-LC-PKG-002` | Prepare/reprepare data-only backup artifact | Current API accepts `created|ready_to_download`, builds data-only JSON bytes in memory, and sets/replaces the artifact and session `ready_to_download`. | Neither; process-local artifact bytes and session state change. | Same-session metadata/status and separately authorized download-action reads only. No generic file or storage-provider read. |
| `FILE-LC-PKG-010` | Package preparation is blocked | Current prepare changes `created|ready_to_download → blocked` when profile authorization fails or bounded generation validation fails. Authorization failure preserves a prior ready artifact/actions; generation-validation failure clears them. | Neither; process-local session state changes and artifact/action references may remain or clear by failure branch. | Blocked status prevents new actions/content. Preserved artifacts can still be cleared by later lazy artifact expiry, but cancel, discard, and session expiry do not transition a blocked session. Current action hints incorrectly advertise prepare/cancel/discard even though those calls do not change `blocked`, and omit the actually required create-new-session path. |
| `FILE-LC-PKG-011` | Direct bill CSV/JSON export response | Current authorized export builds and returns a one-request CSV or JSON response without a server file object, artifact, session, or expiry mechanism. | Neither; transient response content egresses directly to the client. | Request authorization bounds generation, but the server has no downloaded-copy inventory or authority over the client copy after response delivery. |
| `FILE-LC-PKG-012` | Create backup restore preview | Current API validates submitted package content and creates actor/session-bound `ready` preview metadata plus a bounded package summary in process memory. | Neither; process-local preview/summary entry only. No file object, link, provider write, or restore mutation. | Same authenticated profile/auth session may read it, including after discard/lazy expiry until process restart; accepted preview never grants file/content restore authority. |
| `FILE-LC-PKG-013` | Discard backup restore preview | Current API accepts `ready → discarded` after lazy expiry check and records a discarded time, but retains the preview entry and package-summary reference. | Neither; process-local status only. | Confirmation creation stops; retained summary metadata remains until process restart because no entry-removal cleanup exists. |
| `FILE-LC-PKG-014` | Lazy backup restore-preview expiry | On a later preview read/discard/confirmation request, current API changes eligible `ready → expired`, but retains the preview entry and package-summary reference. | Neither; process-local status only. | Preview/confirmation use stops. Expiry is not eager cleanup or summary disposal. |
| `FILE-LC-PKG-015` | Create metadata-only restore confirmation session | From an actor/session-bound ready preview, mandatory scope/confirmation label, and optional caller-supplied preview ID/stable-code/package-hash/request-digest expectations, current API creates `metadata_only` confirmation metadata referencing the same package summary. Omitted expectation fields do not guard staleness/integrity. It applies no restore. | Neither; process-local confirmation/summary entry only. | Same authenticated profile/auth session may read it, including after discard/lazy expiry until process restart. It cannot mutate business/file/link state and `CanApplyRestore` remains false. |
| `FILE-LC-PKG-016` | Discard restore confirmation session | Current API changes `metadata_only → discarded` and records a time, but retains the confirmation entry and package-summary reference. | Neither; process-local status only. | Further confirmation use is unavailable; retained summary metadata remains until process restart. |
| `FILE-LC-PKG-017` | Lazy restore-confirmation expiry | On a later confirmation read/discard or idempotency scan, current API changes eligible `metadata_only → expired`, but retains the entry and package-summary reference. | Neither; process-local status only. | Confirmation use stops. Expiry is not eager cleanup or summary disposal. |
| `FILE-LC-PKG-018` | Create persisted CSV import review session | Current personal/group CSV import-session API parses the request and persists actor/auth-session/scope-bound `ready_for_confirmation` or `needs_correction` metadata, review/candidate JSON, counts, digest/challenge, and expiry. The raw CSV body is not retained. | Neither file object nor subject link; a PostgreSQL import-session domain row is created. | Only the same authenticated actor and auth session may read/act. `needs_correction` cannot confirm but can be discarded or lazily expire. |
| `FILE-LC-PKG-019` | Confirm persisted CSV import session | Current API sequentially accepts `ready_for_confirmation → confirmed` after challenge and an earlier authorization/group-membership check, then deserializes the stored candidate plan and creates draft bills plus bill audit rows in the same save boundary. It does not rebuild candidates or recheck authorization at database acceptance. | Neither file object nor subject link; import-session state and authoritative bill-domain rows change. | Revocation after the initial check can race commit. Confirm versus discard/expiry can create bills after terminal observation or leave terminal status after creation. Parallel confirms can both pass checks; one may commit while the other returns generic database-write failure for duplicate candidate IDs, not the successful prior result. Stored JSON remains. |
| `FILE-LC-PKG-020` | Discard persisted CSV import session | Current API sequentially changes eligible `ready_for_confirmation|needs_correction → discarded` after applying lazy expiry and records `DiscardedAtUtc`. | Neither file object nor subject link; persisted import-session state only. | Sequential confirmation stops, but discard is not a reliable concurrent barrier: a racing confirmation can still apply stored candidates, and commit ordering can leave discarded status after bill creation. The row and both JSON payload fields remain stored, but the same-actor/session GET exposes only a response reconstructed from `ReviewJson`; `CandidateJson` is not an API-readable terminal payload. Discard is not erasure. |
| `FILE-LC-PKG-021` | Lazy persisted CSV import-session expiry | A later same-actor/session get, discard, or confirm sequentially changes eligible `ready_for_confirmation|needs_correction → expired` when the stored deadline has passed. | Neither file object nor subject link; persisted import-session state only. | Sequential confirmation/discard transition stops, but expiry is not a reliable concurrent barrier: a confirmation that already loaded the ready row can still create bills, and commit ordering can leave expired status after bill creation. Both JSON fields remain stored; same-actor/session GET returns review-derived response data, not `CandidateJson`. No background sweep or disposal exists. |
| `FILE-LC-PKG-022` | Direct CSV import preflight | Current personal/group preflight reads and parses a request-scoped CSV, authorizes the scope, and returns validation/review data without persisting a session or mutating bills. | Neither file object nor subject link; request-memory CSV text, plan, and response only. | Response data egresses to the client. Server request copies have no durable ID, retention clock, explicit zeroization, or deterministic disposal beyond GC. Replay reparses current input and authorization state. |
| `FILE-LC-PKG-023` | Direct CSV import | Current personal/group direct import reads and parses a request-scoped CSV and, after an earlier authorization/validation check, creates draft bills plus per-bill import audits in one save boundary without a session or confirmation step. It does not recheck authorization at database acceptance. | Neither file object nor subject link; authoritative bill-domain/audit rows change while request-memory CSV/plan copies remain transient. | Revocation can race commit. `DbUpdateException` returns a bounded failure, but cancellation/other thrown save failures have unknown commit outcome. With no idempotency key or source relationship, retry after ambiguity can duplicate a committed import; GC/zeroization timing is unproved. |
| `FILE-LC-PKG-024` | Read package readiness | Current authenticated GET returns `Available: false`, `backup_package_unsupported`, and says package creation/download/restore preview/confirmation are unsupported while the same class maps those implemented process-local operations. | Neither file object nor subject link; bounded readiness response only. | Clients following readiness may suppress implemented operations. This contradiction is not a lifecycle authorization grant and must be reconciled before clients treat either contract as authoritative availability. |
| `FILE-LC-PKG-003` | Cancel package generation/artifact | Current API sequentially accepts `created|ready_to_download → cancelled`, clears the artifact reference and all download actions. | Neither; process-local session/artifact/action state only. | Sequential further artifact/download access stops. A prepare that passed its initial state check before cancellation can later install an artifact and set `ready_to_download`, resurrecting this session. Clearing references is not guaranteed memory zeroization or downloaded-copy disposal. |
| `FILE-LC-PKG-004` | Discard unprepared package session | Current API sequentially accepts only `created → discarded`; no artifact bytes exist at the discard return boundary. | Neither; process-local session metadata only. | Sequential further generation is unavailable, but a prepare that passed its initial `created` check can later install an artifact and set `ready_to_download`, resurrecting the session. The ready-session action hints also advertise discard even though this handler does not transition `ready_to_download`. Never imply deletion of bytes that did not exist at the accepted discard boundary. |
| `FILE-LC-PKG-005` | Lazy package-session expiry | On a later session access, current API sequentially changes expired `created|ready_to_download → expired`, clears artifact reference and download actions. | Neither; process-local session/artifact/action state only. | Sequential subsequent API access is unavailable, but a prepare that passed its initial state check can race the expiry and later restore `ready_to_download` with an artifact. No background sweep or prompt memory-disposal proof exists. |
| `FILE-LC-PKG-006` | Lazy artifact expiry | On later artifact/action/content access after artifact TTL, current API clears the artifact and changes `ready_to_download → expired`; action pruning is separate. | Neither; process-local artifact/session state only. | Content read stops. TTL is an access-time availability check, not guaranteed eager cleanup. |
| `FILE-LC-PKG-007` | Issue package download action | For a current ready artifact, the API creates a new actor/session-scoped, expiring, unconsumed action; multiple actions can exist for one artifact. The per-session action dictionary is unsynchronized. | Neither; process-local action metadata only. | Sequential use makes an observed action unavailable after consumption, but concurrent issue/download/cancel/prune can race, throw during unsynchronized enumeration/mutation, or leave inconsistent state. |
| `FILE-LC-PKG-008` | Consume package download action | Current API checks and then marks one valid action consumed before returning current artifact bytes, without an atomic compare-and-set or lock; the ordinary action dictionary is also unsynchronized. | Neither; process-local action flag changes and bytes egress to the client. | Sequential replay cannot read again, but concurrent requests can both return bytes; concurrent mutation can throw or corrupt the process-local outcome. Another action may also read, and server lifecycle cannot prove disposition of downloaded copies. |
| `FILE-LC-PKG-009` | Lazy download-action pruning | On later artifact/action/content access, current API enumerates and removes consumed or expired entries from an unsynchronized per-session action dictionary. | Neither; process-local action metadata only. | A successfully removed action cannot authorize content, but concurrent issue/download/clear/prune can throw or leave inconsistent state. Pruning does not affect the artifact or downloaded copies. |
| `FILE-LC-CLN-001` | Failed/incomplete upload reconciliation | API-owned maintenance compares metadata step, provider outcome, link commit, retry identity, and holds. It may retry activation/linking or mark cleanup eligible; it cannot assume failed means byte-free. | Neither until evidence authorizes a specific object/link transition; provider cleanup may follow separately. | Ordinary reads remain blocked. Retry cannot attach different bytes under the same intent unnoticed. |
| `FILE-LC-CLN-002` | Orphan candidate reconciliation | API/domain registry proves all link/history/job/package/copy categories; missing/unreadable evidence yields blocked/unknown, not orphan. | Neither; “candidate” is eligibility only. | No read grant and no deletion. Positively proven disposable material may proceed to a separately gated cleanup/disposal row. |
| `FILE-LC-CLN-003` | Temporary/derivative cleanup | API-approved cleanup targets positively identified non-authoritative scratch or reproducible derivative material after final artifact integrity/link proof. | Temporary bytes may change; authoritative object/link state remains unchanged unless separately accepted. | Must not remove canonical receipt/proof/QR/supporting/package bytes, OCR/history evidence, or the sole readable derivative required by policy. |
| `FILE-LC-CLN-004` | Immediate hard delete of proven non-authoritative bytes | Future API-owned provider operation accepts only positively proven operation-owned scratch, staging, or failed-upload bytes associated with `pending|upload_failed` metadata (or no authoritative object), never a retained `deleted` authoritative object. | Provider bytes change; any object marker is a separate accepted reconciliation transition; links/history stay unchanged. | Irreversible for that temporary/failed copy. It is hard delete/temporary cleanup, not retention purge, and every destructive gate still applies. |
| `FILE-LC-CLN-005` | Server upload request-memory buffer | Current bill, proof, and QR handlers copy accepted multipart input into a managed `byte[]` before reservation, retain it through validation/provider write, and do not explicitly clear it. | Neither file object nor subject link; process-memory copy only. Creating/activating an object does not prove immediate buffer disposal. | Not independently readable through an API, but sensitive bytes may remain until GC. No deterministic release, zeroization, audit, or retry identity exists; provider cleanup cannot dispose of this copy. |
| `FILE-LC-CLN-006` | Restore-preview request-memory copies | Current restore-preview creation materializes the private submitted package as request text, package text, and UTF-8 bytes for validation/parsing, then stores only bounded preview/summary metadata. It does not explicitly clear the full-content copies. | Neither file object nor subject link; multiple process-memory copies only. Preview creation/discard/expiry does not prove immediate memory disposal. | Not exposed as retained preview content, but private package data may remain until GC. No deterministic release, zeroization, audit, or cleanup identity exists. |
| `FILE-LC-CLN-007` | Multipart framework temporary staging | Current bill, proof, and QR handlers call `ReadFormAsync` before copying `IFormFile`, and no repository `FormOptions` override fixes buffering to memory. Accepted multipart bodies can therefore cross the framework memory threshold and use server temporary-file staging before the application-managed copy. | Neither file object nor subject link; framework request staging only. Object activation, handler return, or application buffer release does not itself prove immediate temp-file removal after abnormal termination. | Not an application content-read route. Normal request disposal is framework-owned; crash, cancellation, retention, path/configuration and cleanup evidence are not established here. Treat the location as provider/server-internal and never log or expose it. |
| `FILE-LC-LOCAL-001` | Local capture/import scratch **Discard temporary copy** | Local app authority may remove positively identified session scratch/cache after accepted local save or server acknowledgment under local policy. | Local-only material; neither server object nor server link changes. | A browser cache, local path, or queued copy never proves server cleanup. Failed/offline queues remain until acknowledged or explicitly discarded under reviewed local policy. |
| `FILE-LC-LOCAL-002` | Generate in-memory normalized receipt and thumbnail | Current mobile processor decodes accepted JPEG/PNG/WebP input and returns normalized JPEG plus thumbnail JPEG byte arrays to its caller; cache persistence remains deferred. | Local process memory only; neither server object nor link changes. | Caller-controlled use may continue while references live. No server read grant, persistent thumbnail identity, explicit wipe, or deterministic GC/disposal time exists. |

### 6.2 Preconditions, Re-entry, Dependencies, And Evidence

| Row ID | Preconditions and concurrency | Reversibility/reactivation | Required dependency evidence and blockers | Implementation status / evidence |
| --- | --- | --- | --- | --- |
| `FILE-LC-OBJ-001` | Active actor/account; the lifecycle service requires owner = actor; supported purpose/provider category; bounded metadata. Duplicate/replay semantics absent. | Creation is not reactivation; failure routes to `OBJ-003`. | Current endpoint flows check subject intent before the service call, while the service independently enforces self ownership and actor availability. Reservation still has no persisted subject/idempotency link, so callers must not treat self ownership as subject authorization. | Partial: `EfFileObjectLifecycleService.CreatePendingAsync`; endpoint/service tests. |
| `FILE-LC-OBJ-002` | Same owner/creator; expected state; provider write intended complete; size/hash/type and subject intent current. Current service does not read bytes before activation. | `upload_failed → active` is source-supported internally but no current endpoint resumes that row; fresh integrity validation is required. | Provider readability/integrity, no conflicting upload, current subject capacity/status, privacy/quarantine policy. | Partial: metadata transition implemented; end-to-end normalization/quarantine/resume absent. Owners #341/#1062/#966. |
| `FILE-LC-OBJ-003` | Expected `pending`; safe bounded failure result. Current attempt after a failed `active` transition is invalid and may leave an active object. | Conditional retry to `active`; otherwise retained cleanup candidate. | Prove byte outcome, link absence, no accepted job/history, retry identity, and holds. | Partial: metadata transition exists; compensation/cleanup absent. #966/#724. |
| `FILE-LC-OBJ-004` | Validation/scanner/policy reason; authorized API decision; atomic read blocking; safe reason; race with content reads resolved. | Conditional release or logical rejection; not archive. | Links remain; scan/provider unavailable is not “clean”; vault and purpose policy. | Documented-only; state exists. #1062. `FILE-LC-CHOICE-003`. |
| `FILE-LC-OBJ-005` | Current `quarantined`; fresh content validation and scanner status; subject/link/owner still valid; no privacy downgrade. | Conditional to existing `active`; never revives links. | Current bytes/hash/readability, validation policy version, holds, all intended links. | Unimplemented. #1062/#966. |
| `FILE-LC-OBJ-006` | Authorized owner/domain action; expected `active`; current subject dependencies and concurrency. Current service checks owner/creator but not all links. | Conditionally reversible only through `OBJ-007`; bytes retained. | Every link/history reference must inform whether object-wide deletion is safe; current service lacks that proof. | Metadata transition implemented; dependency-safe policy incomplete. #724/#966. |
| `FILE-LC-OBJ-010` | Current `quarantined`; authorized security/privacy decision; validated bounded rejection reason; target, restore posture, notification and retention outcome explicitly approved. Until `CHOICE-003` resolves, no target transition is authorized. | Re-entry depends on the chosen rejection target and fresh security/privacy validation; never inherit ordinary Trash restore automatically. | Scanner/validation evidence, all links/subjects, content risk, owner communication, holds, vault/recovery and chosen retention outcome. | Documented-only. Generic lifecycle service can accept `quarantined → deleted`, but no caller/rejection policy proves that target. #1062/#966. `FILE-LC-CHOICE-003`. |
| `FILE-LC-OBJ-007` | Requester authenticated; object owned/visible; deleted not purged; bytes readable and integral; purpose/privacy/quarantine/retention valid; no duplicate/conflict; optimistic concurrency/idempotency. Enumerate every link already marked active and explicitly revalidate/accept each; any unaccepted link blocks activation. | Conditional `deleted → active` with `DeletedAtUtc → null`; inactive links remain inactive. Blocked by missing bytes, terminal evidence, hold/policy, invalid subject, unsafe content, ownership change, or conflict. | All former/current links, subject statuses, OCR/review history, backups/copies, vault recovery, replacement object, and quota. | Unimplemented; no API/schema/client method. #722 after #961; #723 UX; #724 retention. `FILE-LC-CHOICE-002`. |
| `FILE-LC-OBJ-008` | Current service requires owner/creator and `deleted|upload_failed`; it does not require retention, links, holds, provider outcome, warning, or confirmation. | Metadata transition has no restore path and does not prove irreversibility of bytes. | All disposal dependencies are missing. Treat current marker as incomplete/unsafe for terminal claims. | Partial metadata-only implementation; not used by production endpoint. #966/#724. |
| `FILE-LC-OBJ-009` | Exact `deleted` authoritative object; positive retention eligibility; complete dependency/copy/hold proof; expected version; separate purge action, audit, retry record and manual destructive approval; explicit confirmation if user-initiated. | Irreversible retained bytes; no reactivation. | Subject/history, OCR, packages, backup/snapshot/replica, vault recovery, provider lease/job, required tombstone and audit. Any unknown blocks. | Unimplemented and manual-gated. #724 must split focused owners after #961/#966. |
| `FILE-LC-LINK-001` | Active compatible `receipt_image` object; uploader and bill mutation authorization/mutable status observed before upload; image media and no duplicate pair. Current runtime has no acceptance-time authorization/status reload, expected version, or attachment-count capacity check. | Link may later be removed; receipt attachment creation is not object creation. | Bill ownership/visibility/status at acceptance, group membership, receipt purpose, existing links, restrictive OCR review/assignment and notifications. Concurrent revocation/finalization/archive can make the observation stale. | Implemented for receipt attachments, with stale-authorization/status, association compensation, and capacity gaps. #341/#966. |
| `FILE-LC-LINK-011` | Active compatible `supporting_attachment` object; uploader and bill mutation authorization/mutable status observed before upload; accepted image/PDF media and no duplicate pair. Current runtime has no acceptance-time authorization/status reload, expected version, or attachment-count capacity check. | Link may later be removed; supporting attachment creation is not object creation. | Bill ownership/visibility/status at acceptance, group membership, supporting purpose and bill/history links; concurrent revocation/finalization/archive can make the observation stale. Receipt OCR dependencies are inapplicable. | Implemented for supporting attachments, with stale-authorization/status, association compensation, and capacity gaps. #341/#966. |
| `FILE-LC-LINK-006` | Active compatible proof object; uploader and current settlement/payment proof mutation authorization; eligible payment/settlement status and no duplicate; same transaction or recoverable compensation. | Link may later be removed; proof creation is not object creation. | Payment/settlement parties, status/history, proof purpose/ownership and existing proof links. | Implemented for settlement proofs, with association-after-activation compensation gaps. #341/#966. |
| `FILE-LC-LINK-005` | Current self actor is authorized for the profile; the loaded profile has no QR link; newly activated object is owned by that user and has `payment_qr`. Current code has no expected-version/null-at-commit guard. | Initial link can later be removed under `LINK-003` or replaced under `LINK-010`; it is not object creation or restore. | Profile ownership/status, object ownership/purpose/readiness, observed null link, settlement visibility implications, and concurrent attach. | Implemented for initial self QR attachment; association occurs after object activation and compensation can leave an active unlinked object. #341/#966. |
| `FILE-LC-LINK-002` | Current active readable receipt bill link; uploader/owner and bill mutation rights; mutable bill state. Current object transition lacks multi-reference proof. | Receipt-link re-entry conditional under `LINK-004`; object needs independent `OBJ-007`. | Other bill/file links, OCR review/assignment, notifications and bill/history dependencies. | Implemented for receipt removal; object coupling is partial/unsafe for shared references. #966/#724. |
| `FILE-LC-LINK-012` | Current active readable supporting bill link; uploader/owner and bill mutation rights; mutable bill state. Current object transition lacks multi-reference proof. | Supporting-link re-entry conditional under `LINK-013`; object needs independent `OBJ-007`. | Other bill/file and bill/history dependencies; receipt OCR dependencies are inapplicable. | Implemented for supporting attachment removal; object coupling is partial/unsafe for shared references. #966/#724. |
| `FILE-LC-LINK-007` | Current active readable proof link; uploader/authorized settlement participant and proof-removal rights; eligible payment/settlement state. Current object transition lacks multi-reference proof. | Proof link re-entry conditional under `LINK-008`; object needs independent `OBJ-007`. | Other proof/file links and payment/settlement evidence and history dependencies. | Implemented for settlement-proof removal; object coupling is partial/unsafe for shared references. #966/#724. |
| `FILE-LC-LINK-003` | Current self profile authorization and an existing QR; expected profile/link state. Current old-object deletion outcome may be ignored. | Later reattach is a separate `LINK-009` action; removal is not replacement or restore. | Profile state, settlement-scoped visibility, other QR references and old-object outcome. | Implemented removal link mutation; object reconciliation partial. #966. |
| `FILE-LC-LINK-010` | Current self profile authorization and existing QR; replacement upload/object activation complete before swap; current profile/link still eligible. No expected-version guard protects the loaded old ID. | Replacement is explicit but does not restore the old link; the new link can later be removed under `LINK-003`. | Profile/visibility, new/old object ownership and purpose, settlement-scoped reads, other references, concurrent replace/remove, both compensation outcomes. Two replacements can share the old ID while creating different new IDs. | Implemented replacement; last profile write can strand the losing newly active object because both requests compensate only the shared old object. #966. |
| `FILE-LC-LINK-004` | Authorized bill requester; exact removed receipt link; object independently active; `receipt_image`/image media compatible; bill mutable/current; privacy/integrity/duplicate checks; idempotency/version. | Conditional explicit receipt re-link. Cached association is irrelevant. | Historical bill link, current bill, replacement links, OCR review/assignment and notification dependencies, copies/holds. | Unimplemented. #722/#723 after #961 plus bill/OCR owners. `FILE-LC-CHOICE-002`. |
| `FILE-LC-LINK-013` | Authorized bill requester; exact removed supporting link; object independently active; `supporting_attachment`/image-or-PDF compatible; bill mutable/current; privacy/integrity/duplicate checks; idempotency/version. | Conditional explicit supporting re-link. Cached association is irrelevant. | Historical bill link, current bill, replacement links, bill/history dependencies and copies/holds; no receipt OCR re-entry. | Unimplemented. #722/#723 after #961 plus bill owner. `FILE-LC-CHOICE-002`. |
| `FILE-LC-LINK-008` | Authorized settlement/payment requester; exact removed proof link; object independently active; proof purpose compatible; payment/settlement state current; privacy/integrity/duplicate checks; idempotency/version. | Conditional explicit proof re-link. Cached association is irrelevant. | Historical proof link, payment/settlement evidence and state, replacement proof, copies/holds. | Unimplemented. #722/#723 after #961 plus settlement owner. `FILE-LC-CHOICE-002`. |
| `FILE-LC-LINK-009` | Authorized self requester; exact profile; object independently active and owned with QR purpose; profile/visibility current; privacy/integrity/replacement checks; idempotency/version. | Conditional explicit QR re-link. Cached route/profile state is irrelevant. | Current/replaced QR, profile visibility, settlement counterparty dependencies, copies/holds. | Unimplemented. #722/#723 after #961 plus payment-details owner. `FILE-LC-CHOICE-002`. |
| `FILE-LC-PKG-001` | Authenticated actor; new opaque session ID; process-local insert. | Creation is reversible only through current discard/cancel/expiry paths; restart loses the session. | Actor user-profile ID and auth-session ID; no `FileObject`, provider, or package bytes. | Implemented in `CreatePackageSessionAsync`; process-local and non-durable. #406/#971. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-002` | Same actor/session; current `created|ready_to_download`; current profile access; bounded package generation. Current reprepare can replace the artifact while old unexpired actions remain. | Cancel or lazy expiry clears the server reference; downloaded copies are outside server authority. | Current database reads, artifact format/version, actor/session, existing actions, cancellation/expiry race and private-data bounds. Profile, bill, summary, item, participant, payer, and adjustment queries are separate awaited reads without a transaction, so the artifact is not a proved consistent snapshot. | Implemented in `PreparePackageSessionAsync`; no consistent-generation snapshot, durable step/idempotency/audit, or eager cleanup. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-010` | Same actor/session and `created|ready_to_download`; current authorization or package-generation validation denies preparation. The exact branch controls whether prior artifact/actions remain. | `blocked` has no re-entry transition; create a new session. A preserved artifact may age out only when later artifact/action/content access invokes lazy artifact expiry. | Authorization/validation result, source state, prior artifact/actions and concurrent reprepare/cancel/download. Current response hints wrongly advertise prepare/cancel/discard on `blocked`; those handlers leave it unchanged and the hints omit create-new-session. | Implemented branches in `PreparePackageSessionAsync`; blocked is excluded from cancel/discard/session-expiry transitions, action hints contradict runtime, and no durable audit exists. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-011` | Current actor authorized for personal/group bill export; current query/filter/subject visibility; response generation succeeds. | Server response is request-scoped; client copy cannot be reactivated or disposed by server lifecycle. | Current bill snapshot/visibility, export format and client/download copy; no server artifact ID, action, TTL or inventory. | Implemented in `ExpenseBillExportEndpoints`; no server retention/disposition record. #406/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-012` | Authenticated actor; bounded request/package sizes; valid JSON and supported package/manifest versions, bounded section count/state and expiry. A supplied whole-package hash is compared, but the field is optional; when omitted the API only computes a digest. Declared per-section hashes are not verified against `data`, section names are not allowlisted, and inventory-to-`data` correspondence is not proved. | Preview may be discarded or lazily expire; recreation parses a new request. | Submitted package validity, actor/session, package expiry, bounded summary and concurrent duplicate requests. Raw submitted content is not retained in the preview object. Optional whole-package verification plus missing section-hash/name/inventory validation block treating preview acceptance as complete integrity/package validation. | Partial in `CreateRestorePreviewAsync`; process-local, no durable audit/idempotency, mandatory trusted package digest, section-hash verification, section allowlist, or inventory-to-data proof. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-013` | Same actor/session; exact `ready` preview; lazy expiry check runs first. | Terminal status for confirmation creation, but same-actor/session GET continues returning retained summary/status until restart; create another preview to retry. | Existing confirmation sessions and retained package summary; discard does not remove either dictionary entry or summary reference. | Implemented in `DiscardRestorePreviewAsync`; no eager cleanup and terminal read remains. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-014` | Later actor-authorized preview read/discard/confirmation access at/after preview expiry. | Terminal confirmation-availability state, but same-actor/session GET returns retained summary/status until restart. | Preview and any confirmation summary references; no background sweep. | Implemented lazily in `ExpireRestorePreviewIfNeeded`; status-only, summary retained/readable. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-015` | Same actor/session; exact ready preview; supported scope and confirmation label; optional caller-supplied expected preview ID/code/hash/digest; optional idempotency key. Omitted expectations perform no corresponding comparison. | Confirmation may be discarded or lazily expire; it never applies restore. | Preview/summary validity, optional expectation coverage, idempotency match, actor/session, expiry and concurrent discard/expiry/create. Missing mandatory stale/integrity expectations are a gap. | Implemented in `CreateRestoreConfirmationSessionAsync`; process-local idempotency scan, optional expectation guards, no business mutation or durable audit. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-016` | Same actor/session; exact confirmation; lazy expiry first; only `metadata_only` changes to discarded. | Terminal use status, but same-actor/session GET continues returning retained summary/status until restart; create a new confirmation only from a still-ready preview. | Preview/package summary and concurrent idempotent create/read/expiry; discard retains entry/summary. | Implemented in `DiscardRestoreConfirmationSessionAsync`; no eager cleanup and terminal read remains. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-017` | Later actor-authorized confirmation read/discard or matching idempotency scan at/after expiry. | Terminal use status, but same-actor/session GET returns retained summary/status until restart. | Referenced preview/package summary, idempotency records and concurrent read/discard/create; no background sweep. | Implemented lazily in `ExpireRestoreConfirmationSessionIfNeeded`; status-only, entry/summary retained/readable. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-018` | Authenticated current actor; personal-profile authorization or current group authorization/membership; bounded valid CSV and domain calculation; fresh session/challenge IDs. | Session creation is not file import or restore; later confirm, discard, or lazy expiry changes only the modeled session/domain state. | Actor/auth session, scope/group membership, parsed review/candidates, digest, challenge and expiry. Raw CSV is not stored, but private review/candidate JSON is. | Implemented in `CreatePersonalBillImportSessionAsync`/`CreateGroupBillImportSessionAsync`; persisted, with no request idempotency or session lifecycle audit. #406/#971/#724. `FILE-LC-CHOICE-001/006`. |
| `FILE-LC-PKG-019` | Same actor/auth session; exact unexpired `ready_for_confirmation`; matching scope/group/digest/version/challenge; authorization/membership observed before acceptance; nonempty stored candidates. Candidates are deserialized, not rebuilt. | Terminal session status plus authoritative draft bills; not file activation/restore. | Stored graph, authorization at acceptance, challenge, bill audit, transaction and duplicate IDs. Revocation or a competing confirm/discard/expiry can race the save. | Implemented in `ConfirmBillImportSessionAsync`; no acceptance predicate, concurrency token, or idempotent prior result. Parallel confirms can yield one success and one generic write failure after duplicate IDs; failure does not prove no import. #406/#971/#724. `FILE-LC-CHOICE-001/006`. |
| `FILE-LC-PKG-020` | Same actor/auth session; lazy expiry first; only an observed `ready_for_confirmation|needs_correction` row is assigned `discarded`, without a concurrency token/status-predicate write. | Sequentially terminal; create a new session to retry. Concurrent confirmation can still create bills, so terminal status is not authoritative proof that no import mutation occurred. | Retained review/candidate JSON and any concurrent get/confirm/expiry. No domain bills are deleted. | Implemented in `DiscardBillImportSessionAsync`; repeat/terminal requests return current state, payloads remain, no lifecycle audit exists, and racing confirm/discard outcomes are commit-order dependent. #406/#971/#724. `FILE-LC-CHOICE-001/006`. |
| `FILE-LC-PKG-021` | Later same-actor/session get/discard/confirm at or after expiry assigns `expired` to an observed eligible row, without a concurrency token/status-predicate write. | Sequentially terminal; row/payload disposal is separate and absent. Concurrent confirmation can still create bills, so terminal status is not authoritative proof that no import mutation occurred. | Stored deadline/status, review/candidate JSON and concurrent confirm/discard; no background sweep. | Implemented lazily in `ExpireSessionIfNeeded`; persisted status only, with no payload clearing, row cleanup, lifecycle audit, or reliable concurrent barrier. #406/#971/#724. `FILE-LC-CHOICE-001/006`. |
| `FILE-LC-PKG-022` | Authenticated actor; personal-profile or current group authorization/membership; bounded CSV request and current calculation rules. | No server session or persisted source exists to reactivate; replay is a fresh preflight. | Request-memory CSV/plan, current actor/group membership and returned review data. GC timing and client-copy disposition are unproved. | Implemented in personal/group `import-preflight.csv`; request-scoped, no durable lifecycle audit/retention record. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-023` | Authenticated actor; personal-profile or group authorization/membership observed before planning; bounded valid CSV; import plan succeeds. No acceptance-time authorization/status predicate exists. | Created drafts follow bill lifecycle; the transient source cannot be restored through file lifecycle. | Actor/group authorization at acceptance, request CSV/plan, draft graph/audit, transaction outcome and replay risk. Revocation can race save. | Implemented in personal/group `import.csv`; only `DbUpdateException` maps to bounded failure. Cancellation/other thrown save failures are uncaught/unknown; no idempotency key means ambiguous retry can duplicate. #406/#971/#724 and bill-domain owners. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-024` | Authenticated actor and no request body; no package/session identity is consulted. | Read-only response; reconciliation of advertised availability versus implemented handlers is required before client enablement. | OpenAPI/generated-client readiness contract, mapped operations, client feature gating and current server authority. | Implemented in `GetPackageReadinessAsync`, but its unavailable/unsupported response contradicts mapped session/download/preview/confirmation handlers. #406/#971. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-003` | Same actor/session; current `created|ready_to_download`; later access first applies lazy session expiry. State is unsynchronized across the prepare await boundary. | Sequentially terminal; create a new session to retry. A racing prepare can set an artifact and `ready_to_download` after cancellation. | Current artifact/actions and concurrent prepare/download. Reference clearing does not prove zeroization or client-copy disposal. | Implemented in `CancelPackageGenerationAsync`; in-memory only and not a reliable concurrent barrier to preparation. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-004` | Same actor/session; current `created`; later access first applies lazy expiry. State is unsynchronized across the prepare await boundary. | Sequentially terminal; create a new session to retry. A racing prepare can set an artifact and `ready_to_download` after discard. | Prove status is still unprepared at the discard boundary; concurrent preparation can invalidate that observation. Ready-session response hints advertise discard even though the handler does not transition `ready_to_download`. | Implemented in `DiscardPackageSessionAsync`; not a reliable concurrent barrier to preparation, and ready sessions are not discarded despite their action hint. #406/#971. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-005` | Later authorized session access at/after session expiry; only observed `created|ready_to_download` transitions. State is unsynchronized across the prepare await boundary. | Sequentially terminal; restart also loses all process-local state. A racing prepare can set an artifact and `ready_to_download` after expiry. | Current clock/session status and concurrent prepare/cancel/download; no background scheduler. | Implemented lazily by `ExpirePackageSessionIfNeeded`; no guaranteed wall-clock cleanup or reliable concurrent barrier to preparation. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-006` | Later authorized artifact/action/content access at/after artifact expiry. | Terminal availability state for the current artifact; a new session is required. | Current artifact/session clock plus actions and concurrent content/reprepare. | Implemented lazily by `ExpireArtifactAndDownloadActionsIfNeeded`; no background sweep. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-007` | Same actor/session; current `ready_to_download`; artifact not expired. The per-session action dictionary has no synchronization. | Action remains usable until observed consumed, expiry, cancellation/session expiry, or process loss; concurrent mutation is not serialized and may throw or leave inconsistent state. | Current artifact identity/expiry and concurrent reprepare/cancel/expiry/content requests; multiple actions are permitted. | Implemented in `CreatePackageDownloadActionAsync`; no durable audit/idempotency, atomic single-use, lock, or safe concurrent-collection contract. #406/#971. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-008` | Same actor/session; exact action observed unconsumed/unexpired; ready unexpired current artifact. Observation/update is non-atomic and the dictionary is unsynchronized. | The stored flag is one-way only when mutation succeeds; racing reads can both return content, and overlapping mutation may throw or leave inconsistent state. | Action, current artifact, expiry and concurrent issue/cancel/reprepare/prune/content; downloaded copy becomes client-controlled. | Implemented in `DownloadPackageContentAsync`; consumed flag is set before response outcome without a lock/CAS, on an ordinary dictionary. #406/#971/#724. `FILE-LC-CHOICE-006`. |
| `FILE-LC-PKG-009` | Later authorized artifact/action/content access; action consumed or expired; enumeration/removal occurs without dictionary synchronization. | Successfully pruned action cannot reactivate; concurrent mutation can throw or make outcome inconsistent. | Current action/session/artifact clocks and concurrent issue/content/cancel/clear. | Implemented lazily in `ExpireArtifactAndDownloadActionsIfNeeded`; not byte cleanup and not concurrency-safe. #406/#971. `FILE-LC-CHOICE-006`. |
| `FILE-LC-CLN-001` | Stable upload intent/idempotency identity; bounded provider probe; retry lease; exact state; no concurrent completion/link; safe timeout handling. | Reconcile/complete is conditional; cleanup is irreversible only for proven non-authoritative bytes. | Metadata, provider write result, subject link/audit commit outcome, exception/cancellation category, job, retry history, holds and copies. | Unimplemented. Current association compensation runs only for caught `DbUpdateException`; cancellation/other exceptions can strand active objects. #966/#724; no dedicated existing cleanup issue found. `FILE-LC-CHOICE-004`. |
| `FILE-LC-CLN-002` | Complete registered-reference query in one consistent snapshot; provider check; no lease/job; no hold/copy; repeat proof immediately before action. | Candidate classification is reversible and non-mutating; later disposition is separate. | Bill/proof/QR, OCR review/assignment, notifications, import/export/backup manifests, audit/tombstone, vault, jobs, backups/snapshots/replicas. | Unimplemented. #966/#724; new focused owner only if those audits find none. `FILE-LC-CHOICE-004`. |
| `FILE-LC-CLN-003` | Explicit temporary/derivative classification; parent accepted and integral; reproducible or no longer required; bounded age policy; no lease/hold. | Scratch/derived deletion conditional and irreversible for that copy; canonical object remains. | Parent/source, current preview requirement, OCR/reprocessing jobs, offline queues, packages/copies. | Mostly documented-only; raw source not retained by default is policy direction, not cleanup runtime. #358/#1062/#966. |
| `FILE-LC-CLN-004` | Exact non-authoritative provider target; source is operation-owned scratch/staging or proved failed bytes with `pending|upload_failed` metadata (or no authoritative object); complete no-link/history/hold/copy proof; lease/version/manual gates. | Irreversible only for the proved temporary/failed copy; never used for retained `deleted` authoritative bytes. | Upload intent, provider outcome, all references/jobs/holds/copies and any required metadata tombstone. Unknown or active/deleted authority blocks. | Unimplemented. #724/#966 must split executor/acceptance ownership. `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004`, `FILE-LC-CHOICE-008`. |
| `FILE-LC-CLN-005` | Current accepted multipart upload and handler process lifetime; no independent buffer identity, lease, or wipe control exists. | Dropping references is not an explicit lifecycle transition and cannot prove zeroization; retry allocates another copy. | Request/form/file stream, validation, reserved object, provider write, cancellation and handler completion. Provider cleanup does not reach managed request bytes. | Implemented buffering in bill/proof/QR upload handlers; deterministic release/zeroization and memory-copy audit are absent. #341/#1062/#966/#724. `FILE-LC-CHOICE-004`. |
| `FILE-LC-CLN-006` | Authenticated bounded restore-preview request; request binding, package string extraction, UTF-8 conversion and parsing allocate full-content copies without independent identities. | Dropping handler-local references is not a verified lifecycle transition; preview discard/expiry affects only retained summary metadata. | Request body, package text/bytes, parser/validation lifetime, preview creation outcome and GC behavior. | Implemented in `CreateRestorePreviewAsync`; deterministic release/zeroization and memory-copy audit are absent. #406/#971/#724/#966. `FILE-LC-CHOICE-006`. |
| `FILE-LC-CLN-007` | Multipart request accepted by bill/proof/QR handler; framework form parsing precedes the application copy; default buffering configuration may stage above-threshold bodies in the server temp directory. | Framework request disposal is not an application lifecycle transition; crashes/cancellation make exact cleanup timing and evidence unknown. | HTTP request/form lifetime, framework temp-file behavior/configuration, application buffer, reservation/provider write, cancellation and process termination. Never expose the temp path. | Current framework staging is possible because handlers use `ReadFormAsync` and no repository `FormOptions` override was found; deterministic crash cleanup/audit is unproved. #341/#1062/#966/#724 plus deployment/config owner. `FILE-LC-CHOICE-004`. |
| `FILE-LC-LOCAL-001` | Local policy, exact scratch identity, accepted destination or explicit discard, no queued/retry dependency. | Local discard irreversible for that copy; never server restore. | Offline queue, local accepted record, server acknowledgment, user intent, device backup/cache policy. | Local implementation incomplete/unreconciled. #971/#358/#966. `FILE-LC-CHOICE-007`. |
| `FILE-LC-LOCAL-002` | Supported decodable JPEG/PNG/WebP input and current processor policy; caller supplies bytes and options. | Returned arrays can be dropped by the caller, but explicit wipe/GC timing is unavailable; regeneration depends on source availability. | Local source/draft/OCR/upload references and caller lifetime; no server metadata or persistent derivative identity. | Implemented generation in `ReceiptImageArtifactProcessor`; persistence/secure cache/disposal remain deferred. #358/#966. `FILE-LC-CHOICE-005`, `FILE-LC-CHOICE-007`. |

### 6.3 Retention, Disposition, Audit, Follow-Up, And Gates

| Row ID(s) | Retention / hard delete / purge | Audit and privacy | Follow-up lane and manual gates |
| --- | --- | --- | --- |
| `OBJ-001..003`, `CLN-001` | `pending`/`upload_failed`: transient cleanup candidates with unresolved clock. Hard delete unresolved until bytes and dependencies are positively classified; purge is separate. | Record safe upload/reconcile outcome, actor, file ID, purpose, states, reason, correlation/idempotency; no filename/hash/content/provider internals. Current upload success/failure audit is partial. | #341 purpose policy; #1062 validation; #966 runtime split; #724 retention/dependency. Storage/privacy, schema, API/OpenAPI/client, provider/config, and destructive gates remain pending as applicable. |
| `OBJ-004..005`, `OBJ-010` | Quarantine retention and rejection target/outcome required but duration unresolved. Neither quarantine nor rejection authorizes Trash or disposal. | Record enter/release/reject/blocked/scan-unavailable categories without scanner/provider details or contents. No current audit proof. | #1062 canonical upload-security owner; #966 reconciliation. Security/storage/privacy, retention, UX and provider gates pending. |
| `OBJ-006..007`, `LINK-002..004`, `LINK-007..010`, `LINK-012..013` | Purpose/subject dependency-gated Trash/replacement retention; exact clocks unresolved. Ordinary hard delete/purge ineligible. | Record object and each receipt/supporting/proof/QR link transition separately, safe subject type/ID where authorized, blocked restore/replacement reason, and no private subject/content leakage. Current remove/replace audit exists; restore audit does not. | #723 UX; #724 retention/dependency; #722 API/schema split after #961; #966 storage runtime; relevant bill/settlement/payment/OCR lanes stay separate. Product/UX, storage/privacy, API/schema and destructive gates pending. |
| `OBJ-008` | Current metadata marker is not disposal proof; it changes no provider bytes. Tombstone/marker retention is unresolved, but this metadata-only transition does not itself require physical-delete or provider-operation approval. | Current success audit records bounded state metadata; missing dependency/reason/version evidence must prevent terminal wording. Exclude provider identifiers/diagnostics. | #724/#966 own marker semantics and retention reconciliation; storage/privacy, schema/API and retention/audit gates remain pending. Destructive/provider gates apply only if later byte work is added, not to this current marker row. |
| `CLN-002` | Orphan-candidate classification is non-mutating and never disposal proof. It may proceed only with a complete fresh reference/provider evidence set; no physical deletion occurs in this row. | Require proof-set version, bounded reference/outcome categories, blocked reason, actor, time and correlation. Exclude provider identifiers/diagnostics. | #724/#966 own proof-registry/completeness reconciliation; #467/#964 may own redacted maintenance presentation. Destructive approval applies only to a later cleanup/disposal row. |
| `OBJ-009` | Physical deletion is dependency-gated and destructive/manual; retained tombstone/history duration remains unresolved. | Require attempted/outcome audit, prior/new bounded state, byte outcome category, proof-set version, retry result, blocked reason, actor, time and correlation. Exclude provider identifiers/diagnostics. | #724 owns policy split; #966 owns completeness/duplicate reconciliation; #467/#964 may own redacted maintenance presentation. Destructive, storage/privacy, admin exposure, provider/config, schema/API and production-operation gates remain pending. |
| `LINK-001`, `LINK-005`, `LINK-006`, `LINK-011` | Retain with active subject/history. No hard delete/purge from attach. | Current attach audit is implemented separately for receipt/supporting bill links, proof, and payment details with bounded metadata; public DTO privacy tests exclude storage internals. | #341/#966 and separate bill/OCR/settlement/payment-details owners. Runtime storage/privacy gate remains for changes. |
| `PKG-001..017` | Current TTLs are source-defined availability checks; cancel/session expiry clear server references, action consumption/pruning changes only action state, discard accepts only an unprepared session, blocked preparation may preserve or clear prior bytes by failure branch, and restore-preview/confirmation terminal statuses retain summary entries. Direct export has no server copy inventory. None proves eager memory zeroization or client-copy disposal. | Current process-local operations have actor/session checks and safe response metadata but no durable lifecycle audit. Never log package/export bytes, contents, filenames, hashes, or private rows. | #406/#971 package lane; #724 retention/copy disposition; #966 storage boundary. API/privacy, retention, user data-egress and destructive gates remain pending for changed or persistent behavior. |
| `PKG-018..024` | Persisted session review/candidate JSON and row remain after confirmation, discard, and lazy expiry; same-actor/session responses expose review-derived data but not raw `CandidateJson`. Current 30-minute expiry is a confirmation-availability clock, not payload retention or disposal. Direct preflight/import request copies are transient with GC-controlled release; direct import creates authoritative drafts/audits immediately and has no source session or confirmation. Readiness is metadata-only but currently contradicts implemented package operations. | Session creation/status changes have no dedicated lifecycle audit. Session confirmation and direct import write bounded per-bill audit, but never log raw CSV, review/candidate JSON, private rows, digest/challenge values, or imported contents. Readiness evidence remains bounded and content-free. | #406/#971 import/package lane; #724 retention; relevant bill/money-domain owners for calculation, confirmation and direct import. API/privacy, persistence, bill/money authority, audit/retention and user data-ingress gates remain pending for changed behavior or disposal. |
| `CLN-003..007`, `LOCAL-001..002` | Generation/buffering is non-destructive. Transient hard delete is eligible only after positive non-authoritative proof; exact clock unresolved. Multipart application-memory, possible framework temp-file, and restore-preview request copies have no complete deterministic disposal/zeroization proof. Never cleanup authoritative/history content. | Local, request-memory, and framework-staging audit applicability and disposal proof are unresolved; server cleanup needs bounded result without local paths, object keys, content or private queue/package data. | #358 receipt intake, #971 local/offline/import, #1062 derivatives/security, #724 retention, #966 storage plus deployment/config ownership; provider/destructive/local-data gates pending as applicable. |

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
| `FILE-LC-OBJ-010` | `FILE-LC-CHOICE-003` |
| `FILE-LC-LINK-001` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-002` | `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-003` | `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-004` | `FILE-LC-CHOICE-002` |
| `FILE-LC-LINK-005` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-006` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-007` | `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-008` | `FILE-LC-CHOICE-002` |
| `FILE-LC-LINK-009` | `FILE-LC-CHOICE-002` |
| `FILE-LC-LINK-010` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-011` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-012` | `FILE-LC-CHOICE-002`, `FILE-LC-CHOICE-004` |
| `FILE-LC-LINK-013` | `FILE-LC-CHOICE-002` |
| `FILE-LC-PKG-001` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-002` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-003` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-004` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-005` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-006` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-007` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-008` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-009` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-010` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-011` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-012` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-013` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-014` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-015` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-016` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-017` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-018` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-019` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-020` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-021` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-022` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-023` | `FILE-LC-CHOICE-006` |
| `FILE-LC-PKG-024` | `FILE-LC-CHOICE-006` |
| `FILE-LC-CLN-001` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004` |
| `FILE-LC-CLN-002` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004` |
| `FILE-LC-CLN-003` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-005`, `FILE-LC-CHOICE-007` |
| `FILE-LC-CLN-004` | `FILE-LC-CHOICE-001`, `FILE-LC-CHOICE-004`, `FILE-LC-CHOICE-008` |
| `FILE-LC-CLN-005` | `FILE-LC-CHOICE-004` |
| `FILE-LC-CLN-006` | `FILE-LC-CHOICE-006` |
| `FILE-LC-CLN-007` | `FILE-LC-CHOICE-004` |
| `FILE-LC-LOCAL-001` | `FILE-LC-CHOICE-007` |
| `FILE-LC-LOCAL-002` | `FILE-LC-CHOICE-005`, `FILE-LC-CHOICE-007` |

### 6.5 Per-row Manual-gate Mapping And Registry

Each gate is independent. `pending` means this policy supplies no approval;
satisfying one gate never satisfies another. Approval evidence is `none` for
every pending gate.

| Row ID(s) | Applicable gate IDs |
| --- | --- |
| `FILE-LC-OBJ-001..003`, `FILE-LC-LINK-001`, `FILE-LC-LINK-005..006`, `FILE-LC-LINK-011` | `FILE-LC-GATE-001`, `002`, `003`, `006`, `007` |
| `FILE-LC-CLN-001` | `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `007`, `010` |
| `FILE-LC-OBJ-004..005` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `006`, `007`, `008` |
| `FILE-LC-OBJ-010` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `006`, `007`, `008` |
| `FILE-LC-OBJ-006`, `FILE-LC-LINK-002..004`, `FILE-LC-LINK-007..010`, `FILE-LC-LINK-012..013` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `006`, `008` |
| `FILE-LC-OBJ-007` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `006`, `007`, `008` |
| `FILE-LC-OBJ-008` | `FILE-LC-GATE-001`, `002`, `003`, `006`, `008` |
| `FILE-LC-OBJ-009` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `005`, `006`, `007`, `008`, `009`, `010` |
| `FILE-LC-CLN-002` | `FILE-LC-GATE-001`, `002`, `003`, `006`, `007`, `008`, `009`, `010` |
| `FILE-LC-CLN-003` | `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `007`, `008`, `010` |
| `FILE-LC-CLN-004` | `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `007`, `008`, `010` |
| `FILE-LC-CLN-005`, `FILE-LC-CLN-007` | `FILE-LC-GATE-001`, `003`, `006`, `007`, `008`, `010` |
| `FILE-LC-CLN-006` | `FILE-LC-GATE-001`, `003`, `006`, `008`, `010` |
| `FILE-LC-LOCAL-001` | `FILE-LC-GATE-005`, `006`, `011` |
| `FILE-LC-LOCAL-002` | `FILE-LC-GATE-006`, `011` |
| `FILE-LC-PKG-001`, `FILE-LC-PKG-004`, `FILE-LC-PKG-007..008` | `FILE-LC-GATE-001`, `003`, `004`, `006`, `008` |
| `FILE-LC-PKG-002` | `FILE-LC-GATE-001`, `003`, `004`, `005`, `006`, `008` |
| `FILE-LC-PKG-010` | `FILE-LC-GATE-001`, `003`, `004`, `005`, `006`, `008` |
| `FILE-LC-PKG-003`, `FILE-LC-PKG-005..006` | `FILE-LC-GATE-001`, `003`, `004`, `005`, `006`, `008` |
| `FILE-LC-PKG-009` | `FILE-LC-GATE-001`, `003`, `005`, `006`, `008` |
| `FILE-LC-PKG-011..017` | `FILE-LC-GATE-001`, `003`, `004`, `006`, `008` |
| `FILE-LC-PKG-018..019` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `006`, `008`, `012` |
| `FILE-LC-PKG-020..021` | `FILE-LC-GATE-001`, `002`, `003`, `004`, `006`, `008` |
| `FILE-LC-PKG-022..023` | `FILE-LC-GATE-001`, `003`, `006`, `008`, `012` |
| `FILE-LC-PKG-024` | `FILE-LC-GATE-001`, `003`, `004` |

| Gate ID | Required scope; owner | Status / approval evidence | Downstream work blocked |
| --- | --- | --- | --- |
| `FILE-LC-GATE-001` | Storage/file privacy and authorization policy/runtime; #966/#341/#1062 with human privacy authority. Required for any affected server behavior. | `pending`; none. | Object/link/read/upload/quarantine/cleanup runtime. |
| `FILE-LC-GATE-002` | Persistence/schema/migration; #722 schema lane after #961. Required when lifecycle fields, constraints, reference registry, or state meaning changes. | `pending`; none. | New restore, disposition, idempotency, reference-proof, and provider-outcome persistence. |
| `FILE-LC-GATE-003` | API/OpenAPI/generated clients; #722 contract/API lanes after #961. Required for any new/changed endpoint or generated surface. | `pending`; none. | Restore, lifecycle status, quarantine, maintenance, cleanup, and disposition APIs/clients. |
| `FILE-LC-GATE-004` | Product Trash/restore wording and Figma; #723 with human product/UX approval. Required for user-visible inactive/restore/terminal action. | `pending`; none. | Client Trash, restore, blocked-state, warning, and confirmation UI. |
| `FILE-LC-GATE-005` | Destructive cleanup/disposal decision; human product/data owner and operator, with #724 technical evidence. Required before physical byte, process-artifact reference, or local authoritative-copy deletion. | `pending`; none. | `OBJ-009`, `CLN-004`, and any destructive `CLN-001..003`/`PKG-002/003/005/006/009/010`/`LOCAL-001` outcome. |
| `FILE-LC-GATE-006` | Retention, dependency, hold, tombstone, and audit policy; #724 with human trust/privacy decisions. Required for clocks, eligibility, or evidence disposal. | `pending`; none. | Expiry, orphan proof, cleanup scheduling, restore eligibility, and terminal disposition. |
| `FILE-LC-GATE-007` | Provider/configuration and operational behavior; deployment/operator owner after storage policy. Required for provider probes, deletion, leases, or scanner integration. | `pending`; none. | Provider reconciliation, cleanup executor, scanner, and physical outcome proof. |
| `FILE-LC-GATE-008` | Privacy-vault/security/key/recovery behavior; #343/#966 and human security/privacy authority. Required when protected content or recovery is affected. | `pending`; none. | Vault-file restore, quarantine inspection, cleanup, copy disposition, and no-downgrade acceptance. |
| `FILE-LC-GATE-009` | Admin/public exposure; #466/#467/#964 with human exposure approval. Required for maintenance/admin read or action surfaces. | `pending`; none. | Admin lifecycle metadata, blocked-attempt, cleanup, and disposition controls. |
| `FILE-LC-GATE-010` | Production maintenance/deployment operation; operator/human release authority. Required before live cleanup or purge execution. | `pending`; none. | Scheduled/manual production cleanup, byte deletion, and provider reconciliation. |
| `FILE-LC-GATE-011` | Local platform storage/privacy and user-discard behavior; #971/#358 with human platform/privacy authority. Required for local scratch/cache/offline deletion. | `pending`; none. | Local-only cleanup, offline acknowledgment, secure-cache retention, and device acceptance. |
| `FILE-LC-GATE-012` | Bill calculation and money-domain mutation authority; bill/money owners plus human money-policy approval. Required for any change to import candidate calculation, validation, or authoritative draft-bill creation. | `pending`; none. | `PKG-018`, `019`, `022`, `023` calculation/review/import mutation behavior. |

### 6.6 Per-row Authority, Presentation, Metadata, And Operation Mechanics

This matrix makes the remaining #960 fields explicit per transition. A stated
missing mechanism is an unresolved blocker, not a proposed runtime default.

| Row ID | Decision authority and source / implementation evidence | User-visible wording and surface | Persisted metadata applicability and evidence | Idempotency key; replay; retry result; concurrency conflict |
| --- | --- | --- | --- | --- |
| `FILE-LC-OBJ-001` | Authority: program storage rules and metadata architecture. Current evidence: `EfFileObjectLifecycleService.CreatePendingAsync`, `FileObject`, lifecycle tests. | Not user-visible separately; the invoking purpose-specific upload surface remains in progress. | Applicable/current: full `FileObject` reservation, timestamps and upload-start audit. Missing: subject intent, reason, idempotency, version. | No key; replay creates another ID; retry creates another reservation; no version/serialization, so concurrent intents can coexist. `CHOICE-004`. |
| `FILE-LC-OBJ-002` | Authority: metadata architecture upload pattern. Current evidence: `MarkActiveAsync` and bill/proof/QR upload handlers/tests. | **Added** only after the subject link commits, on the invoking bill/proof/payment-details surface; activation alone has no success label. | Applicable/current: status/updated time and completion audit. Missing: provider-write outcome, validation policy/version, link result, concurrency version. | No key; replay after `active` is invalid; retry result is not prior success; racing fail/delete is selected by database save/order, not an explicit conflict contract. `CHOICE-003/004`. |
| `FILE-LC-OBJ-003` | Authority: metadata architecture failure pattern. Current evidence: `MarkUploadFailedAsync`; upload handlers ignore its result. | Bounded **Upload failed** on the invoking subject surface; never **Deleted** or **Safe to retry** without reconciliation. | Applicable/conditional: status/audit persist only if the best-effort transition saves. Missing: failure reason, byte outcome, retry identity/version. | No key; replay after a successful failure mark is invalid; handler returns the same generic failure without proving metadata outcome; completion/failure races have no explicit conflict result. `CHOICE-004`. |
| `FILE-LC-OBJ-004` | Authority: file policy plus #1062; current enum/schema only, no transition implementation. | Proposed **Unavailable while file safety review is pending** on a future subject/status surface; no preview/download. | Applicable/required: entered time/actor or system source, safe reason, policy/scanner category, prior state and version. No current fields/event prove these. | Required key/lease unresolved; replay/retry must return current quarantine result; concurrent read/release/delete must fail closed. `CHOICE-003`. |
| `FILE-LC-OBJ-005` | Authority: file policy/#1062 release policy; no runtime evidence. | Proposed **File is available again** only on the authorized subject after link revalidation; no standalone generic file surface. | Applicable/required: release actor/result, policy/validation version, integrity outcome, prior/new state and version. Absent. | Required key unresolved; same-result replay expected but not implemented; retry must not rescan/activate different bytes silently; racing delete/requarantine conflicts. `CHOICE-003`. |
| `FILE-LC-OBJ-006` | Authority: shared taxonomy and metadata architecture. Current evidence: `MarkDeletedAsync` and subject removal handlers/tests for `active → deleted`; this row does not approve quarantine rejection. | Proposed object-wide **Move active file to Trash** only on a future approved lifecycle surface; current subject surfaces say remove. | Applicable/current: `deleted`, `DeletedAtUtc`, update time and lifecycle audit. Missing: safe reason, dependency proof, link set, version. | No key; replay after `deleted` is invalid; current retry is not prior success; concurrent link/replace/delete has no explicit conflict/version rule. `CHOICE-001/002/004/008`. |
| `FILE-LC-OBJ-010` | Authority: upload security/privacy choice #1062/#966; current evidence proves only that the generic service can accept `quarantined → deleted`, not that this is an approved rejection outcome. | Future bounded **File rejected** or **Unavailable** on an approved subject/status surface; never **Moved to Trash** or **Deleted** until target/wording is decided. | Applicable/required: security decision actor/source, bounded reason/category, validation policy/version, source state, approved target, retention/restore treatment and audit. Absent. | Required decision key/version unresolved; identical replay returns prior rejection result; changed target/reason conflicts; release/delete/hold races block. `CHOICE-003`. |
| `FILE-LC-OBJ-007` | Authority: shared restore taxonomy and metadata architecture; no runtime/API/client evidence. | **Restore file** on future authorized Trash/subject surface, with blocker text; never silent. | Applicable/required: requester, reason, restored time, `Status=active`, cleared `DeletedAtUtc`, byte/integrity/privacy/purpose checks, complete active-link acceptance set, selected inactive-link intent, version. Absent. | Required operation key and expected version unresolved; identical replay returns prior result; changed payload or link set conflicts; purge/replacement/link races block. `CHOICE-001/002/003/008`. |
| `FILE-LC-OBJ-008` | Authority for current fact: `MarkPurgedAsync`/lifecycle test; policy authority: shared taxonomy says marker is not disposal. | Not user-visible; maintenance must say **Disposition not verified**, never **Permanently deleted**. | Applicable/current: status/update time and success audit only. Missing: provider call/outcome, dependency/retention proof, confirmation, reason, version. | No key; replay after marker is invalid; retry does not verify bytes; concurrent links/holds/provider state are unchecked. `CHOICE-001/004/008`. |
| `FILE-LC-OBJ-009` | Authority: shared purge taxonomy, metadata/file policy and #724; `DeleteAsync` exists but has no production caller. | Future **Permanently delete retained file** on an approved Trash/maintenance surface, only from `deleted`, with consequence warning and explicit confirmation when user-initiated. | Applicable/required: exact deleted object, durable operation/lease, retention/proof-set/policy versions, actor/approval, reason, provider outcome category, attempts, disposed time, tombstone. Absent. | Required key/expected deleted-object version; exact replay resumes/returns prior outcome; changed target/proof conflicts; link/hold/restore races revalidate immediately before provider work. `CHOICE-001/004/008`. |
| `FILE-LC-LINK-001` | Authority: bill/OCR domain and metadata architecture. Current evidence: receipt attachment handler, entity/config, OCR relationships and endpoint tests. | **Attach receipt** on the bill surface. | Applicable/current: receipt bill-link creator/time and audit. Missing: acceptance-time authorization/status evidence, link version/idempotency, capacity and atomic provider/link step record. | No key; retry can create a new link. Concurrent revocation/finalization/archive after the early check can still permit commit; timeout is unknown; capacity is unbounded. OCR dependencies remain receipt-specific. `CHOICE-004`. |
| `FILE-LC-LINK-011` | Authority: bill domain and metadata architecture. Current evidence: supporting attachment handler, entity/config and endpoint tests. | **Add supporting file** on the bill surface. | Applicable/current: supporting bill-link creator/time and audit. Missing: acceptance-time authorization/status evidence, link version/idempotency, capacity and atomic provider/link step record. | No key; retry can create a new link. Concurrent revocation/finalization/archive after the early check can still permit commit; timeout is unknown; capacity is unbounded. Receipt OCR dependencies do not apply. `CHOICE-004`. |
| `FILE-LC-LINK-005` | Authority: self payment-details policy. Current evidence: initial QR upload/attach handler, nullable profile FK, payment audit and endpoint tests. | **Add QR image** on self payment details; never a generic-file surface. | Applicable/current: `QrFileObjectId`, profile update time and payment audit. Missing: separate link lifecycle time/version/idempotency and atomic provider/link step record. | No key; retry can create another object and attach attempt; current null is observed on load but not protected by an expected-version guard at commit, so timeout/concurrent attach outcome is not explicit. `CHOICE-004`. |
| `FILE-LC-LINK-006` | Authority: settlement/payment domain and metadata architecture. Current evidence: settlement-proof handler, entity/config and endpoint tests. | **Add proof** on the exact settlement-payment surface. | Applicable/current: proof-link creator/time and settlement-proof audit/notification writes. Missing: link version/idempotency and atomic provider/link step record. | No key; retry can create another object/link; the payment/file composite key prevents only the same pair; timeout and concurrent payment-state outcomes lack a general version contract. `CHOICE-004`. |
| `FILE-LC-LINK-002` | Authority: bill/OCR domain plus shared unlink rule. Current evidence: receipt attachment removal handler/tests. | **Remove receipt** on the exact bill surface; must not say bytes are deleted. | Applicable/current: receipt bill-link `RemovedAtUtc`, removal audit, and coupled object deletion metadata. Missing: link actor/reason/version and complete other-reference proof. | No key; replay is unavailable rather than prior success; timeout cannot prove which step saved; concurrent OCR/link/object change has no explicit version conflict. `CHOICE-002/004`. |
| `FILE-LC-LINK-012` | Authority: bill domain plus shared unlink rule. Current evidence: supporting attachment removal handler/tests. | **Remove supporting file** on the exact bill surface; must not say bytes are deleted. | Applicable/current: supporting bill-link `RemovedAtUtc`, removal audit, and coupled object deletion metadata. Missing: link actor/reason/version and complete other-reference proof. | No key; replay is unavailable rather than prior success; timeout cannot prove which step saved; concurrent bill/link/object change has no explicit version conflict. Receipt OCR dependencies do not apply. `CHOICE-002/004`. |
| `FILE-LC-LINK-003` | Authority: payment-details/visibility policy. Current evidence: self QR DELETE handler/tests. | **Remove QR image** on self payment details. | Applicable/current: link becomes null, profile update time and removal audit; old-object transition is best-effort. Missing: link lifecycle timestamp/version and old-object reconciliation outcome. | No key; remove replay returns no-content at link surface; object result is ignored; concurrent replace/remove is last accepted save without explicit version conflict. `CHOICE-002/004`. |
| `FILE-LC-LINK-010` | Authority: payment-details/visibility policy. Current evidence: self QR POST replacement path/tests. | **Replace QR image** on self payment details. | Applicable/current: new object ID link, profile update time and replacement audit; new-link save compensation and old-object transition are separate. Missing: common operation/version and both reconciliation outcomes. | No key; timeout may strand objects. Concurrent replacements can both save different new IDs after reading the same old ID; last write wins, and the losing active new object is not targeted by either old-object compensation. `CHOICE-004`. |
| `FILE-LC-LINK-007` | Authority: settlement/payment domain plus shared unlink rule. Current evidence: proof removal handler/tests. | **Remove proof** on the exact settlement-payment surface; must not say bytes are deleted. | Applicable/current: proof-link `RemovedAtUtc`, `settlement.proof_removed` audit, and coupled object deletion metadata. No removal notification is written. Missing: link actor/reason/version and complete other-reference proof. | No key; replay is unavailable rather than prior success; timeout cannot prove which step saved; concurrent payment/proof/object change has no explicit version conflict. `CHOICE-002/004`. |
| `FILE-LC-LINK-004` | Authority: shared restore/unlink taxonomy plus bill/OCR policy; no runtime evidence. | **Restore receipt** on a future bill/Trash surface after file restore. | Applicable/required: bill/file/receipt purpose, requester/reason, restored time, source/target bill-link state, expected version, fresh OCR dependency result and separate audit. Absent. | Required key/version; identical replay returns same receipt link; changed bill/file conflicts; OCR/replacement/object/bill-state races block. `CHOICE-002`. |
| `FILE-LC-LINK-013` | Authority: shared restore/unlink taxonomy plus bill policy; no runtime evidence. | **Restore supporting file** on a future bill/Trash surface after file restore. | Applicable/required: bill/file/supporting purpose, requester/reason, restored time, source/target bill-link state, expected version and separate audit. Absent. | Required key/version; identical replay returns same supporting link; changed bill/file conflicts; replacement/object/bill-state races block. Receipt OCR re-entry is inapplicable. `CHOICE-002`. |
| `FILE-LC-LINK-008` | Authority: shared restore/unlink taxonomy plus settlement/payment policy; no runtime evidence. | **Restore proof** on a future payment/Trash surface after file restore. | Applicable/required: payment/file/proof purpose, requester/reason, restored time, source/target proof-link state, expected version and separate audit. Absent. | Required key/version; identical replay returns same proof link; changed payment/file conflicts; replacement/object/payment-state races block. `CHOICE-002`. |
| `FILE-LC-LINK-009` | Authority: shared restore/unlink taxonomy plus payment-details policy; no runtime evidence. | **Reattach QR** on a future self payment-details/Trash surface after file restore. | Applicable/required: profile/file/QR purpose, requester/reason, restored time, source/target profile-link state, expected version and separate audit. Absent. | Required key/version; identical replay returns same QR link; changed profile/file conflicts; replacement/object/profile-state races block. `CHOICE-002`. |
| `FILE-LC-PKG-001` | Authority/current evidence: API local-backup package contract and `CreatePackageSessionAsync`. | **Create backup session** on the authenticated backup surface. | Process-local/current: opaque session ID, actor profile/session IDs, `created`, created/expiry times. No durable audit or `FileObject`. | No key; replay creates another session; restart loses it; concurrent sessions coexist. `CHOICE-006`. |
| `FILE-LC-PKG-002` | Authority/current evidence: `PreparePackageSessionAsync` and data-only artifact tests. | **Prepare backup** / **Ready to download** on that session only. | Process-local/current: status, artifact bytes, format/version, safe filename, generation/expiry and row counts. No durable audit or consistent database-snapshot proof; separate queries can observe different moments. Reprepare does not bind existing actions to an immutable artifact version. | No key; replay while ready rebuilds/replaces current bytes; old unexpired actions remain and can resolve the new current artifact; query/cancel/expiry races lack serialization. `CHOICE-006`. |
| `FILE-LC-PKG-010` | Authority/current evidence: authorization and generation-validation branches in `PreparePackageSessionAsync` plus `NextAllowedArtifactActions`. | **Backup preparation blocked** with a bounded safe failure code; no content action. Current hints must not be trusted as transition authority. | Process-local/current: `blocked` and safe failure code. Authorization failure leaves a prior artifact/actions intact; validation failure nulls/clears them. No durable audit or branch-neutral disposition result. Hints advertise prepare/cancel/discard, omit create-new-session, and contradict handler behavior. | Repeated prepare/cancel/discard returns a success-shaped/current blocked result without a transition; no retry/re-entry transition exists. Concurrent reprepare/download ordering and preserved-artifact identity are not versioned; only later lazy artifact expiry can clear a preserved artifact. `CHOICE-006`. |
| `FILE-LC-PKG-011` | Authority/current evidence: `ExpenseBillExportEndpoints` personal/group CSV/JSON responses. | **Export CSV/JSON** on the authorized bill surface; do not promise server expiry of a downloaded copy. | No persisted lifecycle metadata or server artifact. Response rows/content are built per request; client-copy inventory and disposal outcome are absent. | No key/artifact ID; replay creates another response/copy; source data can change between requests; delivery/client retention outcome is unknown. `CHOICE-006`. |
| `FILE-LC-PKG-012` | Authority/current evidence: `CreateRestorePreviewAsync` validation and preview dictionary. | **Preview backup restore**; explicitly metadata-only and not restore. | Process-local/current: preview/actor/session IDs, `ready`, codes/times and bounded package summary. Submitted raw package content is not stored in the entry; no durable audit/removal record. Whole-package comparison is optional; declared section hashes are not verified, and section names/inventory are not reconciled to `data`. | No key; replay creates another preview; package/clock validation reruns; duplicate/concurrent previews coexist. Mandatory trusted digest plus section-hash/name/inventory validation is required before treating acceptance as complete integrity/package validation. `CHOICE-006`. |
| `FILE-LC-PKG-013` | Authority/current evidence: `DiscardRestorePreviewAsync` and `GetRestorePreviewAsync`. | **Discard restore preview**; never claim package-summary data was erased or becomes unreadable. | Process-local/current: `discarded`, safe code and discarded time. Preview dictionary entry and summary remain readable to the same actor/session; no durable audit. | Confirmation after discard is unavailable, but GET returns the terminal mapping until restart; confirmation/discard/expiry ordering uses mutable process state. `CHOICE-006`. |
| `FILE-LC-PKG-014` | Authority/current evidence: `ExpireRestorePreviewIfNeeded` and `GetRestorePreviewAsync`. | **Restore preview expired** only after later access detects the deadline; never claim summary read ended. | Process-local/current: status/code change; entry and package summary remain readable to the same actor/session. No expiry time event, sweep, removal or durable audit. | Confirmation creation is unavailable, but GET returns the terminal mapping until restart; creation/expiry races lack a persisted version. `CHOICE-006`. |
| `FILE-LC-PKG-015` | Authority/current evidence: `CreateRestoreConfirmationSessionAsync`. | **Confirm restore intent** / metadata-only; never **Restore completed**. | Process-local/current: confirmation/preview/actor/session IDs, scope, label, optional caller expectations, optional key, request digest, `metadata_only`, times and shared bounded package summary. No applied mutation or durable audit. | Omitted expectation fields do not compare preview ID/code/package hash/request digest. A sequential keyed retry returns matching state; changed digest/preview/scope conflicts. Lookup/insert is not atomic, so concurrent same-key requests can create distinct sessions; unkeyed replay creates another. `CHOICE-006`. |
| `FILE-LC-PKG-016` | Authority/current evidence: `DiscardRestoreConfirmationSessionAsync` and confirmation GET. | **Discard restore confirmation**; never claim summary/package copies were erased or unreadable. | Process-local/current: `discarded`, safe code and time. Dictionary entry and package summary remain readable to the same actor/session; no durable audit. | Repeat/GET returns current terminal mapping until restart; concurrent read/idempotent create/expiry uses mutable process state. `CHOICE-006`. |
| `FILE-LC-PKG-017` | Authority/current evidence: `ExpireRestoreConfirmationSessionIfNeeded` and confirmation GET. | **Restore confirmation expired** only after later access/idempotency scan detects the deadline; never claim summary read ended. | Process-local/current: status/code change; entry, key/digest and package summary remain readable to the same actor/session. No expiry event time, sweep, removal or durable audit. | GET and matching idempotent create return that terminal state until restart; discard/create/expiry ordering is not persisted/versioned. `CHOICE-006`. |
| `FILE-LC-PKG-018` | Authority/current evidence: `CreatePersonalBillImportSessionAsync`, `CreateGroupBillImportSessionAsync`, entity/config and endpoint tests. | **Review CSV import** / **Needs correction** on the authorized bill-import surface; never imply the request became a file object. | Persisted/current: actor/account/auth-session, scope/group, status, digest/version/challenge, counts, expiry and private review/candidate JSON. Raw CSV is not retained. No dedicated lifecycle audit or retention marker. | No key; replay creates another session with new candidate bill IDs and challenge; concurrent sessions coexist. `CHOICE-001/006`. |
| `FILE-LC-PKG-019` | Authority/current evidence: `ConfirmBillImportSessionAsync`. | **Confirm import** and report created draft-bill summaries; never claim retained data was erased, freshly recalculated, or authorization was rechecked at commit. | Persisted/current: `confirmed`, times and unchanged JSON; draft bills/audits share one save boundary. No session version. Stored candidates follow an earlier actor/group authorization check. | Revocation can race save. Confirm/discard/expiry can create bills after terminal observation. Parallel confirms share candidate IDs: one may succeed while the other returns generic database-write failure, not prior success or proof of no import. `CHOICE-001/006`. |
| `FILE-LC-PKG-020` | Authority/current evidence: `DiscardBillImportSessionAsync` and session GET mapping. | **Discard import**; never claim stored review/candidate data or bills were deleted, or that concurrent confirmation was prevented. | Persisted/current: `discarded`, discarded/update times and unchanged review/candidate JSON. GET returns review-derived response data, not stored `CandidateJson`. No lifecycle audit or disposal outcome. | Repeat/terminal call returns current review mapping sequentially; a racing confirmation can still apply its previously loaded candidates, and commit ordering can leave discarded status after bills were created. `CHOICE-001/006`. |
| `FILE-LC-PKG-021` | Authority/current evidence: `ExpireSessionIfNeeded` on get/discard/confirm and session GET mapping. | **Import session expired** only after later access detects the deadline; never claim concurrent confirmation was prevented. | Persisted/current: `expired` and update time; row plus review/candidate JSON remain. GET returns review-derived response data, not stored `CandidateJson`. No sweep, payload clearing, expiry event time or lifecycle audit. | Later GET returns the terminal review mapping sequentially; a racing confirmation can still apply its previously loaded candidates, and commit ordering can leave expired status after bills were created. `CHOICE-001/006`. |
| `FILE-LC-PKG-022` | Authority/current evidence: personal/group `Preflight*BillsCsvAsync`. | **Review CSV import** for this request only; never imply a session/source file was retained. | Request-scoped/current: parsed CSV, plan and review response; no persisted source/session or lifecycle audit. GC release/zeroization and client-copy disposition are not recorded. | No key; replay reparses the submitted body under current authorization/domain state and returns a fresh response. `CHOICE-006`. |
| `FILE-LC-PKG-023` | Authority/current evidence: personal/group `Import*BillsCsvAsync`. | **Import draft bills** on the authorized bill surface; never imply a staged session, commit-time authorization check, or deterministic result after interruption. | Draft bills/audits commit together; raw CSV/plan stay request-scoped. Missing source relationship, lifecycle audit, acceptance predicate, idempotency and request-buffer disposal proof. | `DbUpdateException` returns bounded failure; cancellation/other thrown save failures leave commit unknown. With no key, retry after ambiguous committed response can create another draft set. `CHOICE-006`. |
| `FILE-LC-PKG-024` | Authority/current evidence: `GetPackageReadinessAsync`, mapped package operations and generated readiness contract. | **Backup package unavailable** is the current readiness response, but it must not be treated as proof that the separately mapped handlers are absent. | Current bounded response: unavailable/unsupported code, safe message, server-authority posture and freshness time. Missing internally consistent capability/readiness contract. | Replay returns fresh unavailable metadata while implemented handlers remain mapped; clients may suppress those operations. Contract/API/client owners must reconcile before enablement. `CHOICE-006`. |
| `FILE-LC-PKG-003` | Authority/current evidence: `CancelPackageGenerationAsync`. | **Cancel backup generation**; never claim downloaded copies were removed or a concurrently preparing artifact was stopped. | Process-local/current at cancel return: `cancelled`, cancel time, null artifact and cleared actions. No durable audit or zeroization proof. | A prepare that already passed its state check can finish after cancel and unconditionally restore `ready_to_download` with an artifact; repeated/other races use mutable in-memory ordering, not an explicit version. `CHOICE-006`. |
| `FILE-LC-PKG-004` | Authority/current evidence: `DiscardPackageSessionAsync`, `PreparePackageSessionAsync`, and `NextAllowedArtifactActions`. | **Discard unprepared backup session**; never claim package bytes were deleted or a concurrently preparing artifact was stopped. | Process-local/current at discard return: `discarded` and discard time only when source is `created`; no artifact exists at that boundary. Ready-session hints incorrectly advertise discard although the handler leaves `ready_to_download` unchanged. | A prepare that already passed its `created` check can finish after discard and unconditionally restore `ready_to_download` with an artifact. Repeated/ready calls return current state; ordering is not versioned. `CHOICE-006`. |
| `FILE-LC-PKG-005` | Authority/current evidence: `ExpirePackageSessionIfNeeded`. | **Backup session expired** after later access detects the deadline; never claim a concurrently preparing artifact was stopped. | Process-local/current at expiry return: `expired`, null artifact, cleared actions. No expiry event time, durable audit, background sweep, or memory-zeroization proof. | A prepare that already passed its state check can finish after expiry and unconditionally restore `ready_to_download` with an artifact; other races use mutable process state. `CHOICE-006`. |
| `FILE-LC-PKG-006` | Authority/current evidence: `ExpireArtifactAndDownloadActionsIfNeeded`. | **Backup artifact expired** after later artifact/action/content access. | Process-local/current: artifact reference cleared and ready session becomes `expired`; no durable audit/background sweep/zeroization proof. | Later access repeats unavailable outcome; expiry/reprepare/content ordering is not bound to an artifact version. `CHOICE-006`. |
| `FILE-LC-PKG-007` | Authority/current evidence: `CreatePackageDownloadActionAsync` and ordinary per-session action dictionary. | **Create download action** for this ready artifact. | Process-local/current: opaque action ID, created/expiry times, unconsumed flag. Missing immutable artifact binding, durable audit, idempotency and collection synchronization. | No key; replay issues another action; concurrent issue/download/cancel/prune can throw during dictionary mutation/enumeration or leave inconsistent state. `CHOICE-006`. |
| `FILE-LC-PKG-008` | Authority/current evidence: `DownloadPackageContentAsync` and ordinary action dictionary. | **Download backup** for the exact action; never promise atomic single-use or safe concurrent mutation. | Process-local/current: action observed and then marked consumed before response; bytes egress. Missing CAS/lock, synchronized collection, durable outcome and downloaded-copy inventory. | Racing requests can both return bytes; overlapping dictionary mutation can throw or leave inconsistent state; network failure after consumption is unknown; another action may download again. `CHOICE-006`. |
| `FILE-LC-PKG-009` | Authority/current evidence: unsynchronized lazy action loop in `ExpireArtifactAndDownloadActionsIfNeeded`. | No separate success surface; a successfully expired/used action becomes unavailable. | Process-local/current: consumed/expired entry enumerated and removed on later access. No lock/durable audit; artifact/client copies unchanged. | Concurrent issue/content/cancel/clear/prune can throw or leave inconsistent state; a successful prune is not byte cleanup. `CHOICE-006`. |
| `FILE-LC-CLN-001` | Authority: metadata architecture compensating-cleanup direction and #724; no cleanup service/runner. | Not user-visible; owner may receive bounded **Upload could not be completed** while maintenance gets safe state categories. | Applicable/required: upload intent, exact step, byte-state category, link/audit commit state, exception/cancellation category, attempts/lease, policy/proof version and outcome. Absent. | Required upload/cleanup key; current compensation covers caught database-update failure only. Cancellation/other exceptions can strand active/unlinked or unknown-commit objects; retry must reconcile rather than infer. `CHOICE-001/004`. |
| `FILE-LC-CLN-002` | Authority: shared orphan taxonomy, metadata architecture and #724; no proof registry/runtime. | Not user-visible as “orphan”; future maintenance may say **Reference review required** or **Eligible for cleanup** only after proof. | Applicable/required: consistent-snapshot proof set/version, every reference class/count, leases/jobs/holds/copies, provider check, decision actor/time. Absent. | Required candidate/proof key and target version; replay reruns freshness check; prior eligibility is never reusable after state changes; any link/hold/job race blocks. `CHOICE-001/004`. |
| `FILE-LC-CLN-003` | Authority: file policy raw/derivative rules and #358/#1062; no server cleanup runtime. | Not user-visible for automatic scratch cleanup; an explicit user discard must name only the temporary copy. | Applicable/required for server temporary material: parent/result identity, non-authoritative class, integrity/reproducibility, lease/job/hold checks and outcome. Absent. | Required operation key; already-absent succeeds only for exact proved target; retry resumes; parent/job/hold change conflicts. `CHOICE-001/005/007`. |
| `FILE-LC-CLN-004` | Authority: shared hard-delete/temporary-cleanup taxonomy plus #724/#966; provider `DeleteAsync` has no production caller or acceptance orchestration. | Not ordinarily user-visible; maintenance says **Temporary cleanup completed/blocked** without provider identity. Never label it purge or Trash. | Applicable/required: exact temporary/failed target and source state, non-authoritative proof set/version, actor/approval, operation lease, bounded provider outcome, attempts, time and any tombstone. Absent. | Required key/target version; exact replay resumes/returns bounded result; changed proof conflicts; activation/link/job/hold race revalidates immediately before deletion. `CHOICE-001/004/008`. |
| `FILE-LC-CLN-005` | Authority/current evidence: multipart readers and upload handlers for bill attachments, settlement proofs, and payment QR. | No user-visible cleanup claim; upload completion must not imply request-memory zeroization. | Current: managed `byte[]` contains uploaded content through validation/provider write. No stable buffer ID, release time, zeroization result or audit; evidence must never log content. | Each request allocates a new copy; cancellation/provider failure can end the handler while GC timing remains nondeterministic. Provider retry/cleanup cannot address this copy. `CHOICE-004`. |
| `FILE-LC-CLN-006` | Authority/current evidence: `CreateRestorePreviewAsync` request binding, package extraction, UTF-8 conversion and parsing. | No user-visible cleanup claim; preview creation/discard/expiry must not imply full submitted-package memory was zeroized. | Current: request body, package string and package bytes contain private full content during handling. Preview entry stores only bounded summary, but no stable buffer ID, release time, zeroization result or audit exists. | Each request allocates multiple full-content copies; validation failure/success ends handler control while GC timing remains nondeterministic. Preview cleanup cannot address these copies. `CHOICE-006`. |
| `FILE-LC-CLN-007` | Authority/current evidence: bill/proof/QR handlers call `ReadFormAsync`; no repository `FormOptions` override was found. Framework multipart buffering may stage above-threshold request bodies in a server temporary file before application copying. | No user-visible cleanup claim; handler completion must not imply deterministic abnormal-termination cleanup, and evidence must never name the temp path. | Framework-managed/current: request-scoped staging without an application-stable ID, retention clock, cleanup result or audit. Exact host path/configuration is intentionally excluded. | Normal request disposal is framework-owned; cancellation/crash/process termination timing is not an application disposal contract. Provider or managed-buffer cleanup cannot prove this staging copy's outcome. `CHOICE-004`. |
| `FILE-LC-LOCAL-001` | Authority: local/server boundary and local intake policy; no reconciled local persistence evidence. Server `FileObject` fields are not applicable. | **Discard temporary copy** on the exact local capture/import/offline-queue surface, with unsynced-data warning where applicable. | Server metadata: not applicable. Local applicability required but unresolved: scratch ID, queue/subject link, accepted/acknowledged state, user intent, time, reason and disposal result. | Local key/version unresolved; replay must target the same copy; retry must preserve unsynced data; concurrent upload/save/acknowledgment blocks discard. `CHOICE-007`. |
| `FILE-LC-LOCAL-002` | Authority/current evidence: mobile receipt normalization policy and `ReceiptImageArtifactProcessor` tests. | No separate lifecycle surface; normalized/thumbnail previews remain within the receipt draft/OCR flow. | Server metadata: not applicable. Current byte arrays and dimensions exist only in the returned process object; secure cache, persistent derivative ID, release audit and explicit wipe are absent. | Pure call has no lifecycle key; repeated processing creates new arrays; caller reference/upload/OCR races and GC timing are not an authoritative disposal contract. `CHOICE-005/007`. |

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
   readability/integrity, and any supported content validation; restoring the
   object sets `Status = active` and clears `DeletedAtUtc` in one accepted
   object transition;
3. purpose compatibility with the target subject and the active upload policy;
4. target subject existence, visibility, status, capacity, historical
   dependencies, and current mutation eligibility;
5. privacy/vault mode, quarantine/rejection, encryption/recovery availability,
   and no downgrade;
6. replacements, duplicates, conflicting active links, changed owner, quotas,
   retention holds, and terminal-disposition evidence; every link already
   marked active must be enumerated and explicitly accepted under its current
   subject policy before object activation, or the object restore blocks;
7. idempotency identity, expected version, racing unlink/replace/purge, and a
   deterministic prior-result or conflict response; and
8. separate bounded object-restore and link-reactivation audit events.

Missing/unreadable bytes, a `purged` marker without trustworthy provider
outcome, failed integrity/validation, incompatible purpose, unavailable or
immutable subject, unauthorized actor, changed privacy policy, unresolved
dependency/hold, active replacement, duplicate ambiguity, and concurrent
transition block restore. Restore does not silently reattach any subject,
reopen an OCR review, restore a notification, change a settlement/payment/bill,
or revive a browser/device copy. An inactive link remains inactive. A link
already marked active is not implicitly trusted merely because the deleted
object had blocked its reads; it must be included in the accepted active-link
set or the object transition cannot commit.

## 8. Failure And Cleanup Decision Table

| Scenario | Required posture |
| --- | --- |
| Byte write fails before metadata reservation | Current server pattern reserves metadata first. For any future alternate pattern, no accepted row/link exists; bounded temporary cleanup may target only the exact operation-owned bytes after proving they are non-authoritative. |
| Metadata exists but byte write fails | Keep/mark `upload_failed`; ordinary reads stop. Reconcile whether zero, partial, or complete bytes exist before retry or cleanup. |
| Request cancellation interrupts byte write | Current handlers skip their non-cancellation failure catch, so no `MarkUploadFailedAsync` attempt runs; metadata can remain `pending` and the provider may hold partial bytes. Treat as a stranded upload requiring the same positive reconciliation as any unknown write outcome; cancellation is never cleanup proof. |
| Bytes exist but activation/link completion fails | Do not serve. If `MarkActiveAsync` returns an unsuccessful result after provider write, the bill handler attempts `pending → upload_failed` but ignores that result, so `upload_failed` or `pending` can remain; proof/QR return without that attempt and can leave `pending`. Cancellation or another thrown exception during `MarkActiveAsync` bypasses all three handlers' unsuccessful-result branch, leaving complete bytes with activation commit/state unknown and no link. If activation succeeded and association save throws a caught `DbUpdateException`, all three handlers attempt `active → deleted` and ignore the result, so the outcome is `deleted` or active-unlinked. Cancellation or another exception during association bypasses that catch/compensation, leaving the object active while link/audit commit outcome is unknown. Record the exact step and exception category; reconcile before any read or provider deletion. |
| Multipart upload buffer outlives handler logic | Current managed `byte[]` copies have no deterministic release/zeroization contract. Do not equate successful provider write, metadata activation, request cancellation, or provider cleanup with disposal of process-memory copies; define memory-handling acceptance separately without logging contents. |
| Framework multipart staging outlives normal request handling | `ReadFormAsync` can use framework-managed temporary files above the in-memory threshold before the handler copies `IFormFile`; no repository override or application cleanup evidence defines their path, crash behavior, or cleanup timing. Treat normal request disposal as framework behavior, not proof for cancellation/process failure, and never expose or log the temp path. |
| Authorization/status changes during a long upload or import | An authorization, group-membership, or mutable-subject check made before provider work or plan construction is not an acceptance-time predicate. Current bill attachment and bill-import paths can commit after that observation becomes stale. Record the observed-versus-accepted boundary; future acceptance must revalidate or atomically predicate the write. |
| QR replacements race | Two requests can activate different new objects after observing the same old QR. Last profile write wins, both compensate only the old object, and the losing new object can remain active/unlinked. Reconcile all operation-created IDs; do not infer success or disposability from the final profile link alone. |
| Import save or confirmation outcome is ambiguous | Direct import catches only database-update exceptions; cancellation/other thrown failures can leave commit unknown. Parallel confirmations can yield one committed import and one generic duplicate-ID write failure. A failure response is not proof that no bills exist; retry requires reconciliation and cannot safely replay as a fresh unkeyed import. |
| Restore-preview request completes or fails | Request text, extracted package text and UTF-8 package bytes are full-content process-memory copies with no deterministic release/zeroization contract. Stored preview metadata excludes raw content, but success, validation failure, discard, expiry and preview-entry cleanup do not prove these handler copies were cleared. |
| One link is removed | Make that link inactive. Do not infer byte deletion. Recalculate reference/hold evidence across all link and history categories. |
| Zero references are observed | Mark only a derived orphan candidate after querying the complete registered reference set in a consistent snapshot. Repeat immediately before disposal. Absence in one table is insufficient. |
| Multiple references exist | Object-wide logical removal or disposal is blocked unless every authoritative link/domain owner accepts its own transition. One unlink affects only that link. |
| Temporary/generated intermediate | Cleanup only after the accepted canonical result and its dependency/integrity evidence exist, no retry/job needs the intermediate, and policy classifies it non-authoritative. |
| Process-local backup artifact reaches advertised TTL | Current TTL is checked only on a later session request. Treat availability as expired when checked, but do not claim memory cleanup: without later access, artifact bytes remain referenced until process restart. A focused owner must define eager removal, restart/crash behavior, and bounded cleanup evidence before acceptance. |
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
| Thumbnail/preview | Current mobile thumbnail bytes are source-defined transient process memory with no proved disposal clock. A future persisted derivative is policy-defined with its parent; cleanup only if safely reproducible and not required for accessibility/readability or current jobs. |
| Settlement proof | Policy-defined dependency-gated while proof/payment/settlement record and history require it. |
| Payment QR | Policy-defined while payment-profile setting/link exists; replacement/removal enters logical-removal policy. |
| Supporting attachment | Policy-defined dependency-gated while parent attachment/history exists. |
| Statement/import source | Required but duration unresolved. Direct CSV preflight/import holds request-scoped text/plan copies with GC-controlled release and no zeroization proof; direct import immediately creates authoritative draft bills/audits without a session/confirmation. Persisted session `ReviewJson`/`CandidateJson` survive confirmation, discard and lazy expiry; terminal GET exposes review-derived data, not `CandidateJson`, and no status removes the row or fields. A separate retention/disposal operation is absent. |
| Export package | Current direct CSV/JSON response is request-scoped with no server artifact/expiry or client-copy inventory. A future persisted package requires explicit expiry policy, but that cannot govern already downloaded/direct-response copies. |
| Backup package | Current process-local artifact/action availability TTLs are source-defined and lazily enforced, but eager memory disposal and downloaded-copy inventory are unproved. Restore preview/confirmation entries retain bounded package summaries after discard/expiry until restart. Any future persisted package is dependency-gated; recovery, encryption, manifest, copy/replica and hold obligations remain unresolved. Disposal is destructive/manual. |
| `pending`/`upload_failed` | Transient cleanup candidate after positive proof; clock unresolved. |
| `deleted`/Trash | Configurable Trash retention is architecture direction; duration and clock trigger unresolved. Expiry does not purge. |
| `quarantined` | Required but duration/review/rejection outcome unresolved; no automatic disposal. |
| `purged` tombstone | Required tombstone/history retention unresolved; marker does not establish byte outcome. |

Physical purge and immediate hard delete are separate operations from each
other and from user-visible removal, retention expiry, unlink, and metadata
marking. `OBJ-009` starts only from retained `deleted` authoritative content;
`CLN-004` starts only from positively proven non-authoritative temporary or
failed material. Before either provider operation,
the API-owned decision must positively establish retention eligibility,
dependency and hold clearance, retained-copy disposition, exact target and
version, approved authority, consequence warning/confirmation where applicable,
and a durable retry/audit record. After provider work, the API accepts only a
bounded success/already-absent/failed/unknown result and preserves required
tombstone/history. This policy executes none of those actions.

## 10. Explicit Open Choices

| Choice ID / exact question | Affected authority domain | Why current sources cannot answer | Safe default or blocked posture | Decision owner / exact manual gate | Downstream work blocked |
| --- | --- | --- | --- | --- | --- |
| `FILE-LC-CHOICE-001` — What are each purpose/state retention duration, clock trigger, hold, and tombstone rule? | Server file objects, links, packages, audit and local copies. | The current field accepts arbitrary nonblank text; architecture defines classes but no numbers, clocks, holds, or tombstone duration. | No automatic expiry or purge. | #724 technical policy plus human trust/privacy decision; `FILE-LC-GATE-006` (and `005` for disposal). | Cleanup scheduling, disposal, restore eligibility, admin retention policy and runtime acceptance. |
| `FILE-LC-CHOICE-002` — Which actors and exact mechanics restore an object and separately reactivate each link, including replacement/multi-link conflicts? | Server file-object lifecycle and bill/proof/payment-profile/domain-link authority. | No restore service, endpoint, schema metadata, client method, actor matrix, or conflict contract exists. | No restore and no silent reattachment. | #722 after #961 plus subject-domain owners; `FILE-LC-GATE-002`, `003`, and #723 `FILE-LC-GATE-004`. | Object restore, link reactivation, Trash/client surfaces and domain acceptance. |
| `FILE-LC-CHOICE-003` — Which source states enter quarantine, who may inspect/release/reject, and what reasons/outcomes persist? | Upload security, storage authorization, privacy/vault and maintenance inspection. | The state exists, but no transitions, scanner result model, inspection authority, reason metadata, or API exists. | Ordinary access blocked; unavailable/failed scanner is not clean. | #1062/#966 and human security/privacy authority; `FILE-LC-GATE-001`, `006`, `007`, `008`. | Quarantine/release/rejection runtime, safe preview, maintenance read and acceptance. |
| `FILE-LC-CHOICE-004` — What reference registry, copy inventory, leases, consistent-snapshot proof, and idempotency record establish orphan/failed-upload cleanup eligibility? | File objects, every domain/history link, workers/jobs, packages, backups/copies and provider execution. | Current source has several restrictive references but no complete registry, proof transaction, cleanup record, lease, copy inventory, or runner. Upload association compensation covers only caught database-update failures; cancellation/other exceptions can leave active objects with unknown link/audit commit outcome. | Unknown/incomplete evidence blocks cleanup; failed, unreadable, canceled or exception-stranded is not disposable. | #724/#966 must adopt or recommend a focused owner; `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `007`, `010`. | Orphan classification, failed-upload/association reconciliation, cleanup executor and physical outcome. |
| `FILE-LC-CHOICE-005` — How are thumbnail/preview derivatives identified and linked without a second purpose enum, and when are they reproducible? | Receipt/OCR intake, storage metadata/links, preview security and clients. | Mobile creates an in-memory thumbnail, but current server enum/schema/runtime has no derivative relationship, persistence, safe-preview endpoint, or reproducibility record. | No independent server cleanup and no unsafe/inactive preview serving; local reference release is not verified disposal. | #1062/#966/#358; `FILE-LC-GATE-001`, `002`, `003`, `006`, `008`. | Derivative schema/API, safe generation/read, local/persisted retention and cleanup. |
| `FILE-LC-CHOICE-006` — How are direct/session-backed imports and persisted export versus backup packages distinguished, integrity-validated, encrypted, expired, downloaded, and copy-disposed? | Sync/import/export/restore, storage, privacy/vault, bill/money-domain import and backup recovery. | Current direct exports stream with no server artifact or client-copy inventory. Direct CSV preflight/import use request-memory copies; direct import creates drafts/audits immediately without session confirmation or idempotency. Backup generation uses separate non-transactional database queries, so its sections are not a proved consistent snapshot. Download uses process-local artifacts and an unsynchronized per-session action dictionary: non-atomic consumption can return bytes twice, while concurrent issue/download/cancel/prune can throw or leave inconsistent state. Blocked-session hints advertise actions their handlers do not transition; ready-session hints likewise advertise discard although discard accepts only `created`. Racing prepare can resurrect cancelled, discarded, or session-expired state. Package readiness advertises mapped operations as unavailable/unsupported. Restore preview creates multiple GC-controlled full-content request copies, makes whole-package hash comparison optional, and does not verify declared section hashes/names/inventory against `data`; preview/confirmation expectation guards are optional and terminal summaries remain same-actor/session readable after discard/expiry. Persisted CSV import sessions retain private review/candidate JSON and rows after terminal states, while GET exposes review-derived data rather than `CandidateJson`. No path proves all request-memory/client/persisted copies disposed, and no current package/import source has a `FileObject`/storage relationship, file-byte inclusion, encryption/disposition contract, or restore apply. | Actor/session-bound where state persists, no persisted-file-package claim, no automatic disposal. Readiness/availability/confirmation expiry is neither consistent capability authority nor guaranteed memory/payload cleanup nor a retention decision for a stored/downloaded copy. | #406/#971/#724/#966 plus bill/money-domain owners for direct/session calculation and mutation; `FILE-LC-GATE-001`, `002`, `003`, `005`, `006`, `008`, `012`. | Consistent capability/readiness and export/backup generation, concurrency-safe actions, direct-import replay/source-copy handling, import-session payload retention/disposal, package integrity/mandatory expectation coverage, response/in-memory/downloaded-copy inventory, stored package expiry/recovery and copy-disposition acceptance. |
| `FILE-LC-CHOICE-007` — What local-only scratch/cache/offline-file model, clock, secure storage, and acknowledgment proof apply per platform? | Local mobile/web authority, offline queue, capture/import and server handoff. | Current sources do not provide one reconciled authoritative local file lifecycle or cross-platform disposal record. | Local material cannot mutate server state or be discarded from route/cache state alone. | #971/#358/#966; `FILE-LC-GATE-005`, `006`, `011`. | Local scratch/cache cleanup, offline acknowledgment, secure retention and device acceptance. |
| `FILE-LC-CHOICE-008` — Should current metadata `purged` be redefined/renamed or paired with explicit provider-disposition state? | Server lifecycle metadata, provider orchestration, API/contracts, audit and client wording. | Current transition records only status/audit while no production code deletes bytes or stores provider outcome. | Treat as incomplete tombstone marker; never say permanently deleted from it. | #724 then #722; `FILE-LC-GATE-002`, `003`, `005`, `006`, `007`. | State/schema contract, physical orchestration, audit, restore blockers and terminal wording. |

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
  detail endpoints/tests for multipart buffering, cancellation, link, authz,
  read, remove, and failure facts;
- OCR review/assignment and notification persistence for retained file-ID
  dependencies;
- current OpenAPI plus generated Dart/web methods and serialization privacy
  tests for exposed surfaces and provider-internal exclusion; and
- `LocalBackupPackageReadinessEndpoints` and tests for process-local package
  sessions, artifacts, download actions, lazy expiry and reference clearing;
  `BillCsvImportEndpoints`, its entity/configuration, and endpoint tests for
  direct preflight/import plus persisted-session storage/read/terminal facts;
  `ReceiptImageArtifactProcessor` and tests for in-memory normalized/thumbnail
  bytes and deferred secure-cache posture; and
- the architecture sources linked above for documented-only policy direction.

Live issue/PR reconciliation at that revision found #960 closed through merged
PR #1237; #721 closed through PR #1238; #719/#716/#717/#723/#724/#966/#975
open; #418–#422 closed through their reviewed planning/UX PRs; and no existing
#719 branch, PR, merged equivalent, or focused orphan-cleanup issue. Open state
alone was not treated as proof of missing implementation.

The following gates remain separate and pending whenever a future change
touches them: storage/file privacy and authorization; schema/migration;
API/OpenAPI/generated clients; bill calculation/money mutation authority;
product retention/trust choice; Figma/client UX;
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
