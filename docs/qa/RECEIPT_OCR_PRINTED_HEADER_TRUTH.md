# Source-printed header and currency evidence

The #1309 source-first contract authorizes narrowly evidenced truth corrections. Seven merchant expectations used title case despite the source images printing mixed or upper case. The manifest now preserves the visible letters and case across the existing merchant heading. One Polish-symbol fixture incorrectly described a visibly printed, distinctive currency marker as context inference; its expected provenance is now explicit with high confidence, consistent with the existing currency resolver contract.

These are fixture-evidence corrections, not extraction gains. No merchant name mapping, case conversion, provenance rule, parser behavior, Apply/save behavior, warning, image byte, strict comparison or exit policy changes. All other expected values remain unchanged, including quantities and monetary values. Keep native mismatch reductions from these truth changes separate from parser improvements.

The images were inspected locally; the following hashes identify the exact source evidence. No raw receipt image, OCR payload, coordinates or payment data is reproduced here.

| Fixture | Evidence | Image SHA-256 |
| --- | --- | --- |
| `existing_08_citypark_parking_en_US` | Printed merchant casing | `eb1bf267f9d4e145970603385b9d57679ce98e771e6e42e5e66d695dd723dde9` |
| `existing_09_healthfirst_pharmacy_en_US` | Printed merchant casing | `ee8c80637c09de53e9667da082d93c5b2d1e6546ffe0578b9d9aa0877e6acb64` |
| `existing_10_luna_boutique_en_US` | Printed merchant casing | `23e5db2c7813db4cbd6ce2add0590b22ba18a59f83b0443aa0702abccb9fd190` |
| `existing_11_bean_bloom_cafe_en_US` | Printed merchant casing | `e73670382a3af7030ac0f28a31ac153c4d124624a2e9065d342b596a760977c9` |
| `existing_13_ridge_restaurant_en_US` | Printed merchant casing | `ee60af99bb233c8d99b4678373b713d22e74127c44cf68e61db794f448e1356e` |
| `existing_14_westside_fuel_en_US` | Printed merchant casing | `9aeb9a91246d3e220c58c7ec7d8ba47d6e7f3341fe10d60102c456e1b9b93c9f` |
| `distortion_02_rotate180_bean_bloom` | Printed merchant casing | `99aa4c8142f38426eda57b1323fe4a70d24de4521f5d4111bb6ea91052e05e76` |
| `locale_10_pl_symbol_after` | Distinctive printed currency marker | `f1a3560d5b9b21ac920d401825ced4cbd485eec1ba71eb3317aa29afa537eb70` |

The fixture helper remains byte-identical and still rejects case substitutions and incorrect currency provenance. Manifest and fixture-tree catalog hashes, plus the trusted catalog digest, are rebound; provider/model and acceptance source hashes are unchanged. Fresh exact-head local validation and both established independent reviewers are required before packaging and publication.
