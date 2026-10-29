# Unresolved printed currency evidence

The fixture item contract can express the literal `¥` marker already retained
by `ReceiptOcrItemCandidate.currency`. This is printed evidence, not a resolved
ISO denomination. Receipt currency and currency provenance are scored
independently. Missing markers, substituted ISO codes and incorrect amounts
continue to fail exact comparisons; existing list-form expectations are
unchanged.

Source inspection of `currency_21_yen_unresolved` confirms the marker on both
item prices, with no evidence choosing JPY or CNY. The source image SHA-256 is
`f9aedfa29a80ec2fd0835e05b6138c9f229c493c3f2eeb720090cc38fd5c2116`.
The prior two list-form item expectations implicitly required null item
currencies, omitting the printed marker. The corrected object-form expectations
name that marker while retaining null receipt currency, unresolved provenance,
all item descriptions and amounts, and the original image bytes.

This correction follows the existing parser and save contract: unresolved
currency remains visible for review, and its money cannot acquire a bill
denomination implicitly. Controls exercise the parser-to-save boundary as well
as strict scoring. Production parser, review, save/Apply behavior and native
exit policy are unchanged. Any strict-score gain from this truth correction
must be reported separately from extraction improvements.
