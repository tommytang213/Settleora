# Receipt OCR exact total ranking correction

A complete isolated Codex review of 7247edd5 reported that generic `Total USD 100.00` and later `Total USD 100.01` both received a reconciliation boost against subtotal 100.00. The 0.02 floating-point tolerance allowed the later one-cent-wrong candidate to win without incomplete evidence. A focused pre-fix control reproduced the wrong selection.

Ranking now uses integer currency minor units and exact equality. Unsupported precision or an unavailable currency cannot silently supply a partial arithmetic sum. Distinct ordinary totals retain incomplete labeled-amount evidence unless explicit printed adjustment roles explain their values as the subtotal or exact final sum. Included-tax net/gross alternatives and distinct primary totals retain their existing ambiguity rules. Different decimal spellings of the same money compare as one value.

Ten new named controls cover both row orders for USD, KWD and JPY, explicit additive-tax net/final totals, exact decimal addition, equivalent primary amount spellings and competing totals without subtotal evidence. All fourteen focused total-reconciliation controls passed with pinned Flutter 3.44.8. Complete clean-commit mobile/tooling, documentation and retained-replay validation remain required before independent review qualification.

Only provisional parser evidence, parser tests, parser/catalog fingerprints, the trusted catalog digest and this record changed. Fixture expectations, model/fixture bytes, native/runner source, API Apply authority, authoritative money calculations, schema, auth/security settings and deployment are unchanged. Complete independent reviews, provenance/package/native qualification and the final merge gates remain required.
