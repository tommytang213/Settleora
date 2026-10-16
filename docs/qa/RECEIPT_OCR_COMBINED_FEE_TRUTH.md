# Printed combined charge review evidence

The Horizon fixture prints three service items totaling 74.50, a separate
“Taxes and Regulatory Fees” charge of 7.67, and total current charges of 82.17.
It prints no subtotal and does not split the combined charge into tax and fee.
The earlier truth correction removed this charge from merchandise but omitted
its review expectation, causing the fixture to reject an appropriately
incomplete draft. The existing combined-tax/fee condition now records the
printed label and amount for this fixture.

The exact source image was visually inspected locally. Its SHA-256 is
`885a6a941e64718c106efc6148facb7c92efef1ad43997e5c7d71c3b0234f415`
at `english/existing_04_horizon_mobile_en_US.jpeg` within the receipt OCR fixture
directory. Image bytes, all item/header values and all other fixture entries
are unchanged. No tax-only amount or subtotal is invented.

The fixture helper accepts the existing combined-charge role with or without
a printed subtotal, requiring the corresponding exact review decision and
hint. Existing role-count, label, currency, amount, duplicate-evidence,
incompleteness, warning and independent field/item checks remain enforced.
Controls include a draft transcribed independently from the image, both
subtotal shapes, wrong/missing evidence, false confidence, unrelated warnings,
extra items and invented tax-only amounts.

This is source-truth alignment, not an extraction improvement or native pass.
Parser, provider, model bytes, production review/Apply behavior and financial
authority are unchanged by this correction. Fresh independent review and
source-bound native evidence remain required.
