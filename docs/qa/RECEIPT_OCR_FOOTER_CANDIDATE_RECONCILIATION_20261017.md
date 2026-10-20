# Receipt OCR footer candidate reconciliation — 2026-10-17

## Accepted contract

Issue #1309 and the retained owner task
settleora-codex-task-20261001-1108-continue-20260928-2105-issue-1309-real-world-ocr-accuracy-contract.md
(objective points 5–7; SHA-256
885da01420c61407c5c5b0497210d0011e23d44420c56d601b04bb3e2c6bb389)
require preserving plausible priced rows unless positive, generalizable evidence
establishes a non-item role. Arithmetic corroborates classification; it does
not authorize deleting printed evidence. Genuine currency and money ambiguity
must remain visible. This reconciliation applies that accepted contract.

## Failure and bounded correction

Candidate 0b527ce02d8fce0fa45f370d0ae6f8c8892fa874 introduced a blanket
unresolved-row marker whenever a corroborating issuer name after Total shared
its row with a standalone amount. Item extraction then skipped the whole row.
This contradicted 27 existing parser cases and nine existing draft Apply cases.
The existing ownership guard correctly refused to claim the mixed row as
merchant metadata; the new marker bypassed normal item classification.

Remove that blanket veto and its parameter plumbing. Keep the exemption
for completely owned standalone issuer rows and all discount identity fixes.
A repeated issuer name beside a priced amount remains a provisional item
when there is no positive non-item evidence. Original blocks and printed total
remain intact. Total disagreement and foreign currency still produce review
hints. Unpriced neighbors retain their existing completeness checks. Signed
amounts remain provisional evidence with warnings; they gain no Apply authority.

The conflicting new test expectation is split by evidence: priced candidates
retain their amount and sign; unpriced neighbors remain incomplete. Existing
27 parser and nine Apply assertions are unchanged. Additional controls compare
case, scale, explicit/unmarked currency, arithmetic agreement/disagreement, and
foreign/negative money at the actual Apply boundary. Standalone footer and
phone metadata controls remain. All examples are synthetic unit fixtures.

The initial focused run restored the 36 original failures but exposed another
contradictory assertion in the new test: it required a negative priced candidate
to disappear. The existing OCR_PARSER_REVIEW_HANDOFF_TEST_PLAN.md, line 60,
requires unknown negative rows to remain manual-review candidates. Existing
receipt_ocr_parser_test.dart (signed refund evidence) and
receipt_ocr_amount_boundary_test.dart (refund signs) enforce the same boundary.
The revised assertion requires the exact negative candidate, unchanged total,
source blocks, review hints, and disabled item Apply. Adjustment completeness
alone is not the item Apply gate. No negative amount becomes authoritative money.

## Apply boundary and scope

Issue #1324's accepted Apply/persistence semantics are unchanged. Same-currency
candidates may be explicitly copied to editable form fields under the existing
guards; this does not create or persist a bill. Foreign and unresolved money
still disable item Apply. No UI, API, schema, settlement, security, native
provider, fixture truth, or model bytes change. Catalog edits only bind the
parser source digest and the corresponding trusted catalog digest; native
acceptance remains pending.

Evidence, exact validation commands, results, and independent review are kept
in the local task report. Neither local tests nor this note claim native
acceptance, hosted CI success, external review, or merge approval.

References:
- https://github.com/tommytang213/Settleora/issues/1309
- https://github.com/tommytang213/Settleora/issues/1324#issuecomment-5884369600
- https://github.com/tommytang213/Settleora/issues/1324#issuecomment-5894057260
