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
