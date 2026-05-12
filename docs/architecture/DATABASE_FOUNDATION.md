# Database Foundation

This document defines Settleora's database foundation direction for API-owned PostgreSQL persistence. It records architecture rules only; it does not authorize runtime behavior, API contract changes, or feature work by itself.

## Current State

- PostgreSQL readiness exists through the API readiness endpoint.
- The API has runtime configuration placeholders for PostgreSQL.
- The API has EF Core infrastructure registered for API-owned PostgreSQL persistence.
- EF Core migrations define schema-only user profile, user payment profile, user group, group membership, file object metadata, auth account, auth identity, system role assignment, local password credential, auth session, auth session family, auth refresh credential history, auth audit event, expense bill root, expense bill item, expense bill item split, expense bill participant, expense bill payer, expense bill adjustment, expense bill attachment, receipt OCR review, receipt OCR review line, settlement request, settlement payment, settlement proof attachment, settlement request line, settlement payment allocation, and settlement residual tables.
- Internal password hashing, credential workflow, session runtime, refresh session runtime, sign-in abuse policy, local sign-in/refresh/current-account session endpoint boundaries, the `SettleoraSession` bearer middleware/current-actor/policy foundation, and an internal business authorization service foundation exist.
- Guarded self-profile, self payment-details, self payment QR, group foundation, group member management, bill attachment, bill-scoped receipt OCR review intake, and admin local-user endpoints exist as narrow API layers on the current user/group/payment/file metadata foundations.
- Settlement request/payment/proof attachment plus request-line/allocation/residual schema exists as a persistence foundation. [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md) defines the design gate for request creation, payment claims, receiver confirmation, dispute, cancellation, proof linkage, audit, and rebuildable balance projections. Candidate preview, first settlement request creation with one server-derived selected request line, read-only current-actor settlement request list/get with line summaries, debtor-authored payment claim with server-derived allocation persistence, first payment-claim-time residual proposal persistence, receiver-authored payment confirmation, receiver-authored residual confirmation, bounded receiver-confirmed residual projection/finalization, bounded request/payment dispute endpoints, guarded request/payment cancellation endpoints, purpose-specific proof endpoints, the first read-only current-actor balance projection endpoint, the first read-only settlement basket preview endpoint, the first pay-all settlement basket creation endpoint, and the internal residual policy decision foundation now exist, but broad credit ledgers, refunds, settlement simplification, settlement reopen/adjustment policy, OCR engines/workers, broader business audit implementation, sync, passkeys, MFA, reset tokens, and recovery codes do not exist yet.

## Authority Boundary

- The ASP.NET Core API owns core business database writes in server mode.
- Workers must not directly mutate core business tables.
- Workers may publish job results, structured failure events, or domain-adjacent events for the API to consume.
- The API must validate worker output before any core business state changes.
- API/domain services own authorization, financial calculations, status transitions, audit decisions, and policy enforcement around persisted business state.

## Persistence Direction

- PostgreSQL is the primary server-mode datastore.
- EF Core is acceptable for API-owned persistence unless a future architecture review changes direction.
- Migrations are owned by the API project because the API owns the core business database write model.
- Database access should remain behind API/domain boundaries rather than leaking persistence concerns into clients or workers.

## Migration Rules

- Migrations must be explicit, reviewable files.
- Production startup must not automatically apply migrations.
- Local migration creation should use the repo-pinned EF Core tool and the API-owned context:

```powershell
dotnet tool restore
$env:Settleora__Database__ConnectionString = "<local-dev-connection-string>"
dotnet ef migrations add <MigrationName> --project services/api/src/Settleora.Api --startup-project services/api/src/Settleora.Api --context SettleoraDbContext --output-dir Persistence/Migrations
```

- Migration creation must not require production credentials, and production startup must not auto-apply migrations.
- Schema changes require validation and review before merge.
- Migration diffs should be reviewed for destructive operations, default values, nullability, indexes, constraints, and data-shape assumptions.
- Runtime readiness must not be treated as proof that schema or migration design is complete.

## Schema Boundaries

The current schema foundation is intentionally limited to:

- `user_profiles`: API-owned user profile identity placeholders, including display name, optional default currency, timestamps, and future soft-delete timestamp.
- `user_payment_profiles`: API-owned self payment-details foundation, including one active default payment profile per `UserProfile`, bounded optional payment text fields, constrained visibility, nullable `qr_file_object_id` linkage to `file_objects`, timestamps, and future soft-delete timestamp. The payment profile stores no storage path, object key, provider URL, original filename, or vault reference.
- `user_groups`: API-owned shared group containers, including name, creator reference, timestamps, and future soft-delete timestamp.
- `group_memberships`: user-to-group membership rows with composite key, minimal role/status values, and timestamps.
- `auth_accounts`: server-side auth account roots linked one-to-one with `user_profiles`, with status timestamps and no credential material.
- `auth_identities`: provider identity links for local or OIDC-style identities, keyed by provider type, provider name, and stable provider subject without raw tokens.
- `system_role_assignments`: product-level role assignments for `owner`, `admin`, and `user`, separate from group membership roles.
- `local_password_credentials`: local password verifier hash metadata linked to `auth_accounts`, without plaintext passwords, reset tokens, recovery codes, passkeys, or MFA secrets. The internal credential workflow can create and verify these rows for existing auth accounts.
- `auth_sessions`: server-side session and revocation metadata linked to `auth_accounts`, storing token hashes only and no raw bearer or refresh tokens.
- `auth_session_families`: account-scoped refresh/session continuity lineage state linked to `auth_accounts`, with bounded status, absolute expiry, rotation, and revocation metadata.
- `auth_refresh_credentials`: refresh-like credential history linked to `auth_session_families`, optionally linked to `auth_sessions`, storing unique refresh credential hashes and bounded rotation/revocation/expiry metadata with no raw refresh tokens.
- `auth_audit_events`: bounded auth audit event metadata with optional actor and subject auth-account links, without raw secrets, raw tokens, password material, passkey private material, MFA secrets, or full provider payloads.
- `file_objects`: API-owned file metadata foundation linked to owner and creator `user_profiles`, with constrained purpose/status/encryption-mode values, content type, optional display filename, size, optional SHA-256 hash, local storage provider metadata, provider-internal object key, optional vault/retention references, timestamps, and soft-delete timestamp. The first subject-specific file workflow is self-only payment QR linkage through the payment-details boundary; no generic public file API exists.
- `expense_bills`: schema-only bill/expense roots linked to the creator `user_profiles` row and optional `user_groups` row, with bounded optional merchant text, bill date, constrained status, `numeric(19,4)` total amount, uppercase three-letter currency, timestamps, archive timestamp, indexes, and restrictive foreign keys.
- `expense_bill_items`: schema-only bill item rows linked to `expense_bills`, with bounded name/note fields, optional positive quantity, `numeric(19,4)` amount, uppercase three-letter currency, deterministic sort-order index, timestamps, and soft-delete timestamp.
- `expense_bill_item_splits`: schema-only item split rows linked to `expense_bill_items` and `user_profiles`, with constrained split method, nullable non-negative basis value, resolved `numeric(19,4)` amount/currency pair, deterministic allocation order, residual flag, uniqueness per item/profile, indexes, and restrictive foreign keys. `basis_value` is calculation basis only and is not authoritative money without currency; `resolved_amount` plus `resolved_currency` is the stored item split money value.
- `expense_bill_participants`: schema-only bill participant rows keyed by bill/profile, with constrained acknowledgement/payment status, resolved share amount/currency, acknowledgement timestamps, indexes, and restrictive foreign keys.
- `expense_bill_payers`: schema-only original payer contribution rows linked to bills and user profiles, with non-negative bounded amount/currency pairs, optional bounded payment-method label snapshot, indexes, and restrictive foreign keys.
- `expense_bill_adjustments`: schema-only tax, service-charge, discount, credit, and manual adjustment rows with constrained type, direction, allocation method, non-negative bounded amount/currency pair, optional bounded reason note, deterministic sort-order index, and restrictive foreign key.
- `expense_bill_attachments`: schema-only subject-specific bill attachment references keyed by bill/file object, with constrained purpose, creator reference, timestamps, and restrictive foreign keys. This table references only `file_objects.id` and does not duplicate storage paths, object keys, provider internals, filenames, vault references, or storage roots.
- `receipt_ocr_reviews`: bill-attachment-scoped provisional/reviewed OCR review intake rows keyed by stable receipt attachment file ID and bill ID, with optional group ID, creator reference, bounded status/source, reviewed merchant/date/currency/amount candidates, timestamps, soft removal timestamp, and restrictive foreign keys. It stores no raw OCR full text, receipt bytes, storage object keys, provider paths, local client paths, signed URLs, payment details, or unrelated user data.
- `receipt_ocr_review_lines`: bounded OCR review line rows linked to `receipt_ocr_reviews`, with server-derived sort order, reviewed/candidate line text, optional quantity, optional unit price and line total candidates, timestamps, and restrictive foreign keys. These rows are provisional review data only and do not become authoritative bill items, split rows, settlement lines, balances, or payments.
- `settlement_requests`: schema-only settlement request roots linked to debtor, creditor, requester `user_profiles`, optional `user_groups`, and optional source `expense_bills`, with positive `numeric(19,4)` amount, uppercase three-letter currency, constrained status, counterparty distinction constraint, lifecycle timestamps, archive timestamp, indexes, and restrictive foreign keys.
- `settlement_payments`: schema-only payment claim rows linked to `settlement_requests`, payer, receiver, and creator `user_profiles`, with positive `numeric(19,4)` amount, uppercase three-letter currency, constrained status, payment date, optional bounded note, counterparty distinction constraint, lifecycle timestamps, indexes, and restrictive foreign keys.
- `settlement_proof_attachments`: schema-only settlement proof attachment references keyed by settlement payment and file object, with creator reference and timestamps. This table references only `file_objects.id` and does not duplicate storage paths, object keys, provider internals, filenames, vault references, storage roots, public URLs, or file bytes.
- `settlement_request_lines`: request line rows linked to settlement requests and source expense bills, currently used to persist the single selected confirmed bill candidate for new settlement requests, with optional bounded candidate key, optional accepted source bill revision, positive exact amount, currency, allocation order, constrained line status, timestamps, indexes, and restrictive foreign keys.
- `settlement_payment_allocations`: payment allocation rows linked to settlement payments and request lines, with positive cleared amount, currency, allocation order, timestamp, lookup indexes, and restrictive foreign keys. Current runtime writes these rows for same-currency payment claim flows and allocates overpayments only up to selected outstanding request-line totals.
- `settlement_residuals`: underpayment/overpayment rows linked to a settlement payment and request, debtor and creditor profiles, constrained direction/policy/status values, positive amount, currency, optional bounded reason, lifecycle timestamps, counterparty distinction and payment-or-request presence checks, projection-oriented indexes, and restrictive foreign keys. Current runtime can create pending residual rows from explicit payment-claim residual proposals, move one pending payment residual to its policy-derived receiver-confirmed status, and neutralize pending rows to disputed or cancelled during dispute/cancellation.

The schema foundation by itself does not authorize public runtime behavior; the existing auth/session runtime, business authorization service, self-profile, self payment-details, self payment QR, group, group-member, bill attachment, receipt OCR review intake, admin local-user, internal local file-object storage foundation, internal bill calculation/split service, settlement candidate preview, settlement request creation with selected request lines, settlement request list/get, settlement payment claim with allocation and pending residual persistence, settlement payment confirmation, settlement payment residual confirmation, bounded receiver-confirmed residual projection/finalization, settlement request/payment dispute, settlement request/payment cancellation endpoints, read-only settlement balance projection endpoint, read-only settlement basket preview endpoint, pay-all settlement basket creation endpoint, and internal residual policy decision foundation are separate API/domain layers. Settlement schema tables do not by themselves add broad credit ledgers, refund workflows, balance projection writes/caches beyond the current read-only endpoint, proof upload/download bytes beyond the purpose-specific proof endpoints, standalone receipt/OCR upload/download runtime outside bill attachments, OCR engine/worker behavior, automatic OCR-to-bill mutation, notifications, or UI behavior. The settlement runtime architecture document is a policy gate for further settlement implementation. Invitations, friends, broader business endpoints, generic file APIs, item-split workflows beyond the internal calculation service, residual workflows beyond payment-claim-time proposal persistence, receiver residual confirmation, and bounded confirmed residual projection/finalization, OCR engine/worker behavior, sync, and reporting are not implemented yet.

Future business tables are deferred. Future schema design should separate concerns as appropriate, including:

- Passkeys, MFA, reset tokens, recovery codes, invitations, and friends.
- Business audit records outside auth.
- Recurring bills, reimbursements, and reconciliation records.
- Broad credit ledgers, refunds, and automatic residual application beyond the bounded receiver-confirmed residual projection/finalization slice, balance projection caches or writes beyond the current read-only endpoint, approvals, status history, and audit records beyond the current schema foundation.
- File subject associations and storage lifecycle records beyond the first `file_objects` metadata foundation.
- OCR jobs, worker result events, confidence data, raw OCR text policy, and automatic OCR-to-bill acceptance workflows beyond the current bill-attachment review intake rows.
- Audit records.
- Sync state, offline queues, and outbox or event publication state.

Schema boundaries should keep authoritative server state distinct from client cache state and worker processing state.

## Money And Currency Constraints

- Monetary values must use decimal-safe storage.
- Currency must always be attached to monetary values.
- Rounding policy must be centralized in API/domain policy rather than duplicated across clients or workers.
- Incoming, stored, calculated, and displayed amounts may have different rounding requirements, so future schema design must preserve enough precision for authoritative calculations.
- Database constraints should support currency correctness and avoid floating point storage for money.

## Storage Constraints

- File metadata belongs in PostgreSQL.
- File bytes must go through the storage abstraction.
- API responses must not expose direct filesystem paths, object store paths, bucket internals, or provider-specific storage details.
- The `file_objects` metadata table uses stable file identifiers, authorization-aware ownership references, content type, size, lifecycle state, and provider-neutral object references.
- File reads and writes must pass through API authorization checks.

## Worker Constraints

- Workers consume jobs and publish results or events.
- Workers must not directly mutate core business tables.
- The API validates worker results before changing core business state.
- Worker outputs should be idempotent where practical and safe to retry.
- OCR-derived data remains provisional until accepted by the API; the current receipt OCR review intake rows are not authoritative bill, split, settlement, balance, or payment records.

## Non-goals

This document does not authorize:

- OpenAPI changes.
- Runtime behavior changes.
- Authentication or authorization.
- User/group business endpoints.
- Settlement residual workflows beyond payment-claim-time pending residual proposal persistence, receiver residual confirmation, and bounded confirmed residual projection/finalization, balance projection writes/caches beyond the current read-only endpoint, settlement proof upload/download bytes beyond the purpose-specific proof endpoints, expense/bill runtime beyond implemented slices, item-split workflows beyond the internal calculation service, public file workflows, OCR engine/worker behavior or automatic OCR-to-bill mutation beyond receipt OCR review intake, broader audit, sync, or additional identity/session persistence beyond the listed schema foundations.
- Business persistence workflows.

## Next Implementation Candidate

Future database branches should remain small and reviewable. Business tables, migrations, and feature persistence should remain separate work unless explicitly approved together.
