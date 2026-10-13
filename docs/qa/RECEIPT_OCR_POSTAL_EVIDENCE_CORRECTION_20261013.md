# Receipt OCR bare postal evidence correction

The complete section-02 review at `0090726ad49e2c4fc4fe5f96284f695706027f2f` found a P2 omission: `Tea XL 1500` was treated as bare postal metadata on a JPY receipt and silently removed while adjustment evidence remained complete. A focused control reproduced the omission before correction.

Bare postal-shaped rows with a traceable amount now retain `unretainedPricedRow` and `unretainedPricedItem` evidence unless a preceding street address owns the row. This preserves ambiguity for explicit review without inventing merchandise or a postal identity. Explicit comma postal headers and street-owned bare postal headers remain metadata. A printed money marker prevents a priced street-name row from becoming an address owner.

Seven new controls cover size/code-shaped rows, two street-owned postal headers, an explicit comma header, and a priced street-name owner counterexample. All eleven postal-focused controls passed with pinned Flutter 3.44.8. The existing bare US postal-header control now requires incomplete evidence and a review hint when no street owner exists; its item and tax assertions remain intact. Complete clean-commit mobile/tooling, documentation and retained-replay validation is required before review qualification.

Only provisional parser evidence, parser tests, source/catalog trust bindings and this QA record changed. Fixture expectations, fixture/model bytes, native/runner source, API Apply authority, financial calculations, schema, credentials, network settings and deployment remain outside this change. Static independent reviews, package/provenance, native and final merge gates remain pending.
