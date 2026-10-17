# Receipt OCR internal review repairs — 2026-10-17

Complete cumulative internal review of candidate e04568d17378d450c6ccf560e5867ea92f4b7315 found two bounded #1309 draft-quality defects. These repairs preserve the accepted #1324 Apply and persistence rules.

## Preserve unowned postal-shaped priced evidence

A bare row such as `Tea XL 1500` can match a city/region/postal pattern. Without a positively owned street-address context, that resemblance cannot establish a metadata role. The parser now retains the ordinary editable item candidate and exact printed amount while keeping the unresolved-role completeness warning.

The same rule applies to `Tea XXL 1500`, `Widget CA 15000`, and an unowned `Seattle WA 98101` row. Established street-owned and explicit-comma postal metadata remain excluded. Existing Australian registration ownership and other positive metadata evidence remain effective. No merchant, fixture identifier or corpus score selects the behavior.

The original test that required only Coffee from a matching JPY receipt contradicted the retention contract. Its assertion now requires both printed candidates. Two adjacent assertions were reconciled for the same source-bound reason; all uncertainty guards remain. Widget coverage checks that retaining these ambiguous candidates does not authorize Items Apply or alter the existing bill draft.

## Restore only the original financial eligibility

The editable preview previously compared every amount edit with the preceding keystroke and permanently cleared adjustment completeness. Editing `10 -> 1 -> 10` or `10 -> 10. -> 10.0` therefore left an originally reconciled receipt unresolved.

The form now compares financial fields with the original OCR preview. Exact numeric restoration restores only the original source's completeness. Description corrections survive. An originally incomplete source stays incomplete, and saved-review reconstruction retains its existing conservative completeness behavior. Apply predicates, save reconciliation rules, APIs and authoritative bill calculations are unchanged.

## Evidence and limits

Before repair, the focused regression set produced four passing guards and seven failures: three missing-item cases and four restoration cases across personal/group creation. After repair, all eleven passed. Additional adjacent parser and actual Apply guards cover the retained-candidate boundary. The local task report records exact commands, source hashes and broader validation outcomes.

The catalog updates the parser and review-UI source digests plus the trusted canonical catalog digest. Model bytes, fixture truth/images, native engine/preprocessing bindings and pending native acceptance status are unchanged. The first frozen candidate was rejected by model verification for the stale review-UI digest; that source binding was corrected before broader validation.

Static internal review and local regressions do not establish real native accuracy, the 101-image warning distribution, model acceptance, hosted package/CI qualification, external Grok review or merge readiness. The inherited APK verifier concern remains open separately; no synthetic APK operation was recreated. No deployment, access/security, schema, API or settlement authority change is included.
