# Receipt OCR review corrections

The pinned model record in [Corroborated rupee recognition recovery](RECEIPT_OCR_RUPEE_RECOVERY_EVIDENCE.md) describes the retained projection at runtime source `776c17dab25af23124fa5d21330c92ab55cfa828`. Its counts do not qualify the later corrections below. The model bytes and original seven packs are unchanged.

The native acceptance catalog reader now keeps normal script-route ownership
separate from recognition-recovery identities. The Tiny pack remains a valid
recognizer for block provenance without competing with Small for the Latin
route. Duplicate primary routes, unknown roles, and unsupported recovery
policies still fail closed.

Independent source review also exposed a total-row geometry check that ran
after sorting by polygon bounds, a missing foreign-subtotal review hint, and
an unclassified side-column number that could replace the printed total.
The corrections validate geometry before bounds, retain the foreign header
warning without using its amount in receipt arithmetic, and withhold an
unowned numeric tail while preserving the original blocks. Focused controls
cover malformed geometry, currency separation, complete same-currency totals,
and unchanged supported contact-column ownership. Unknown attached currency
markers now have strict null assertions rather than permissive alternatives.

These corrections do not qualify the later source head from the earlier
projection above. Fresh exact-head tests, independent review, package evidence,
and Android/iOS native results remain required; no fixture image or truth
changes are part of this correction batch.

The bounded Android package-comparison diagnostic also recognizes the current
446-entry eight-pack inventory rather than the earlier 444-entry seven-pack
inventory. Its output remains content hashes and bounded native structure;
it does not grant package or signing acceptance. Missing, extra, duplicate,
and malformed entries retain their rejection controls.

The IPA archive verifier now checks that each DEFLATE stream consumes its
entire declared compressed range before retaining the canonical archive.
Synthetic controls cover appended bytes, a second compressed stream, data
descriptors, valid alternate compression and bounded expanded sizes. This
does not grant a signing or release qualification.

Foreign subtotals also retain their localized currency warning when ordinary
same-currency tax reconciles the item sum and total. A foreign subtotal is
preserved as evidence and is never used to corroborate receipt arithmetic.

Further parser review found two amount-ownership defects. A printed currency
code next to a four- or five-digit item price could match a city/region/postal
pattern and disappear as metadata. Postal classification now excludes an
explicit currency marker touching the amount; ordinary address rows retain
their existing treatment. A charge-table row with two monetary cells inside
its Amount column could also silently select the last cell. Such rows now
retain their unresolved evidence and review requirement. A single owned
amount remains eligible without an additional warning. Regression controls
cover three currencies, prices following street addresses, genuine postal
headers, and normal and mirrored table geometry with reversed competing
amounts. Neither correction changes receipt truth or financial Apply authority.

A contact-column total is now selected before missing-total warnings are
decided, so a recovered printed total cannot simultaneously be reported as
missing. This selection remains after item and adjustment completeness
decisions; it does not clear an unresolved discount or establish item money.
Controls retain the warning when geometry or the monetary cell is missing.

Changing a saved review's currency retains subtotal, tax, service-charge and
discount suggestions as editable header evidence in their original currency.
Scalar and item-money suggestions still clear instead of being relabeled.
Repeated currency changes do not duplicate that evidence or restore an
explicitly removed entry, and a changed explicit tax interpretation remains
unresolved. The server's Save and Apply safeguards are unchanged.

Fuel ambiguity controls explicitly verify that a second priced item leaves
the printed grand total and a review hint visible. A unit rate and quantity
are not permission to invent an unprinted fuel line total by multiplication.

Total admission now requires the complete financial label and monetary cells.
A product such as "Total Care Kit 2 USD 19.99" remains an item and cannot
establish the receipt total. An attached alphabetic code can still be a SKU;
that evidence keeps the existing traceability warning. Incomplete total-like
rows remain inputs to ambiguity and layout guards, without gaining authority
to supply an amount or currency. Complete repeated totals and earlier
unsupported-currency reference cells retain the existing selected-cell checks.

Preview reconciliation now keeps a review hint when a printed included-tax
component is negative or exceeds its entire gross item base. Controls cover
both printed and absent subtotals, valid zero-to-base components, and a
separately proven net-item-plus-tax total. Printed amounts remain unchanged;
the saved review and financial Apply authority are unchanged.

Currency conflicts in incomplete total chains are evaluated before the stricter
total-admission check. Competing denominations such as "EUR or USD1.00" retain
their missing-total warning and unresolved saved-review mode, while product
names still cannot supply a total.

SwiftSupport verification now validates both original library signatures and
compares executable content after stripping signatures from disposable copies.
Identical signed bytes still require valid signatures. Changed executable
content, invalid signatures, symlinks, oversized files and changes during
verification fail closed; retained libraries are never rewritten. Synthetic
controls run on Linux. Separate macOS controls compile and re-sign a dynamic
library with Apple tools and exercise the wrapper's comparison entry point;
they remain skipped on Linux and do not replace a real distribution export.

Printed-total ranking now uses the existing discount-before-subtotal decision
when checking arithmetic, so a discount already included in the subtotal is
not subtracted twice. When printed totals support competing net and gross
interpretations of included tax, the draft retains its review requirement.
Repeated agreeing totals, unambiguous ordinary tax, and both supported
included-tax subtotal conventions retain their existing confident treatment.
These checks rank printed amounts; they do not manufacture a new total.

Localized payment labels now require a complete monetary cell after the label.
Priced product names beginning with words such as "Espèces" remain items.
Controls cover product-name collisions and all supported localized payment
labels with whitespace, colon and full-width-colon separators.

Conflicting explicitly primary totals now keep a review requirement even when
subtotal and discount arithmetic ranks one of them. Agreeing primary totals
and uniquely reconciled ordinary generic totals retain their existing behavior.
A disputed summary-card amount can no longer price adjacent customer/date
fields or an unpriced description; independently printed charge rows remain
editable items, and the disputed evidence remains visible for review. Generic
table projection also preserves a complete printed included-tax label instead
of simplifying it into additive tax. These corrections change provisional OCR
interpretation only; they do not change saved-review or Apply authority.

Charge-table geometry now requires one complete monetary value across all
blocks in the Amount column. Alternatives or residual qualifiers such as
"USD 8.00 or USD 10.00 (estimate)" remain unresolved, whether recognized in one
block or split across blocks. A rejected column cannot fall back to the last
amount in the flattened row. Controls cover both column directions, preserve
the original blocks, and retain confident ordinary amounts and separately
recognized currency markers. No printed amount is reconstructed or relabeled.

The EF snapshot concern was checked with the pinned EF 9.0.15 tool and the
three existing `ReceiptOcrReviewSchemaFoundationTests`. The model comparison
reported no pending changes; all three metadata/schema-generation tests passed.
EF excludes core query-filter annotations from generated snapshots and compares
relational models for pending migrations. No snapshot or migration edit was
needed. These checks did not connect to a database or apply migrations, and
do not replace the separately required PostgreSQL integration checks.
