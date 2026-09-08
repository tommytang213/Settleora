# Issue #1093 contextual screen help evidence

Task key: `20260908-1952`. The production-widget capture files remain under `/workspace/logs/settleora-visual-qa/20260908-1952-issue-1093/`; this manifest records their immutable SHA-256 evidence. All were inspected at original resolution on their final reviewed candidate heads.

## Accepted matrix

All entries use content revision `2026-09-08.1` and launcher key `contextual-help-<topic-key>`.

| Topic | Entry source | Acceptance meaning |
| --- | --- | --- |
| `first-launch` | `apps/mobile/lib/app/setup_screen.dart` | Pre-auth setup description; no automatic opening or configuration change. |
| `dashboard` | `apps/mobile/lib/app/server_mode_shell.dart` Home app bar | Loaded overview/navigation description; zero reload. |
| `bills` | `apps/mobile/lib/bills/bill_list_screen.dart` personal/group app bars | Receipt warning and currency/absent-live-FX meaning; zero mutation. |
| `ocr-review` | `apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_screen.dart` queue/detail app bars | Provisional OCR and guarded apply boundary; zero parser/apply mutation; hidden during active detail mutation. |
| `groups` | `apps/mobile/lib/groups/group_list_screen.dart` app bar | Server authorization and unavailable temporary-participant meaning; zero membership mutation. |
| `settlements` | `apps/mobile/lib/settlements/settlement_list_screen.dart` app bar | Descriptive balances/requests/statuses without payment advice; zero mutation. |
| `recurring` | `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart` app bar | Derived forecast/draft/confirmation boundary; zero mutation. |
| `reports-search` | `apps/mobile/lib/reports/monthly_report_screen.dart` app bar | Read-only loaded search/filter/refresh meaning; zero mutation. |
| `backup-restore` | `apps/mobile/lib/app/server_mode_shell.dart` Data safety trailing action | Actual non-mutating import preview and disabled restore apply. |
| `settings-security` | `apps/mobile/lib/app/server_mode_shell.dart` App settings app bar | Local readouts and server-authoritative protected changes; no secret exposure or security mutation. |

Mobile admin-maintenance is not applicable because no mobile destination exists. It is intentionally absent from the registry and remains independently owned by #964. Locale-resource/runtime work remains #409; native device/screen-reader acceptance remains #975.

## Candidate and review evidence

- Candidate A: source `c26d5b97f726fb4b2eb52c838f5b25931c4bdd49`, tree `a341febb13bf588d15d1b66cb355597527ce1b23`, PR #1150, merge `ff72022d67928358452115cdcbf44fd8ceedaf3b`. Gemini report: `/workspace/logs/settleora-issue-1093-review/candidate-a/reviews/integrated/2026-09-08T123629Z-strong_independent-9079-1788870989677-gemini-integrated-review.json`.
- Candidate B: source `13082ab06e74eb5e77f88eea0946fb20ba4b5cab`, tree `204d1a6f693af5f3b26b07309ab9821050e68a8c`, PR #1151, merge `02cd17283c8bf4bfe595dc6d910acbac041e1fbf`. Gemini report: `/workspace/logs/settleora-issue-1093-review/candidate-b/reviews/integrated/2026-09-08T130354Z-strong_independent-15458-1788872634559-gemini-integrated-review.json`.
- Candidate C: source `99ed53effbcd46670b28c57426e66bfaa485c93f`, tree `46eb5608ea950c785658a19f0f3ab215ee98bcf0`, PR #1152, merge `5322ba97b8fe76fe3ea536993f53a247570bc796`. Final Gemini report: `/workspace/logs/settleora-issue-1093-review/candidate-c/reviews/integrated/2026-09-08T135059Z-strong_independent-23915-1788875459649-gemini-integrated-review.json`.
- Every final source head passed fresh Gemini `strong_independent`, independent local Codex and GitHub Codex review. Candidate C's first GitHub review found the OCR deletion/help modal race; corrective head `99ed53e` passed fresh validation and all reviews, and the sole thread was resolved.
- GitHub prematurely closed #1093 at `2026-09-08T12:49:14Z` after intermediate PR #1150 despite its explicit non-closing intent. Live hygiene reconciliation reopened it before this evidence candidate; final closure remains gated on the hygiene merge and final-main proof.

## Capture SHA-256

```text
d67c70762409b001ed210c4dade6be761e8def946c0247fb590d9f25d9480058  candidate-a/help-long-copy-320x760-2x.png
1521864766fab3a0bd35f62307060e4f95fc4888a2497052df77c8ed7c6c1079  candidate-a/home-help-entry-390x844-1x.png
610d71eb9adc5ef39ba81f6065f3d1918ae8c4b6b2cf631eb61596007ee807e5  candidate-a/home-help-open-390x844-1x.png
fe7557bfa582734614ed1f478c3bc51fe56d33f4643a59114068df626f2b3732  candidate-a/reports-help-entry-390x844-1x.png
bce1213a2089bf85d125b2aad1c6e25328b1b063a22f6a0ceaed3cd13b0a1f45  candidate-a/reports-help-open-390x844-1x.png
f70be1fb6e59ee4bb1c9308d7faad7542e382a389a813730981be8d1e45803b0  candidate-a/setup-help-entry-390x844-1x.png
ba87b5eae19e6d5fec5ed1f27d2b3913e3cf03e324bf9acd2d73cb0cfc56da38  candidate-a/setup-help-open-390x844-1x.png
df4e0d68e5f53a551f075a8fe30de29d13d2d9d927816f7d44902238c8073ca8  candidate-b/bills-help-entry-390x844-1x.png
7299fe9cbe0ba2dcb5fa853550b5f257997a054b27c9a09d2524877b035f8624  candidate-b/bills-help-open-390x844-1x.png
70aea29a3c646e787e657b1c01914a4e9201787e0042d1a0ae47873fda830c99  candidate-b/group-bills-help-entry-390x844-1x.png
9e8130fa8bc4de0e62152664d3acf7b1b981a6b1002421a35a588d8426116d12  candidate-b/group-bills-help-open-390x844-1x.png
d6ada65523d84bbf76ae2856691ec2c3a13d707d7728c0b40d23caf13223660f  candidate-b/groups-help-entry-390x844-1x.png
200d4f1a96ca51c7bbe6b6d4d47aad4eca508aadf149542183186305b3f994b8  candidate-b/groups-help-open-390x844-1x.png
71a90f3eeca715b6787cd4dad6ada838e6da795cc1d4a742d1db02cbb52ffc53  candidate-b/recurring-help-entry-390x844-1x.png
13e4e98f9a2de72c0f868f5bfb034501d874a6bcd09fa4eb31a1badeb8954fdb  candidate-b/recurring-help-open-390x844-1x.png
1942aae4e16efa124037100e30242d65e68391f59b12752a18167df15df89842  candidate-b/settlements-help-entry-390x844-1x.png
1b94acf684be2a9df42754ed2b334ae78be704f48b4dd3412314e84dd55263fd  candidate-b/settlements-help-open-390x844-1x.png
2c184684c8a965159e3b1b3fdf54f3fc95caf6a85ca6162de1505b8a2e405daf  candidate-c/backup-restore-help-entry-390x844-1x.png
46997958380f75fe1e7438663b517d9f768e9064dc590cbcb7be94108c9b9edf  candidate-c/backup-restore-help-open-390x844-1x.png
95f587553a2ad4ff14a8a2aaa3ff18cd6716346cd37091a7056db025ed28382a  candidate-c/ocr-detail-help-entry-390x844-1x.png
bf53a16f047cf61ef5d92ee72306d3e03220fad3cce226d72fcfaa86598515f3  candidate-c/ocr-detail-help-open-390x844-1x.png
a029b7aacbbe835676fd320aa402a1f29897e10b3c09ce9d142f325842feaf47  candidate-c/ocr-queue-help-entry-390x844-1x.png
8fd29d79b2ed67246a49376d0c734b520d52d6dc5ece45169bf7a3607450fa9c  candidate-c/ocr-queue-help-open-390x844-1x.png
f8b49b7daa204988d14e1f840790b577893aac5d78eee51c731fa8a33b2566b9  candidate-c/settings-security-help-entry-390x844-1x.png
9811d09aa96da307afbd0321153765950e021ea90671a333e19470edecf038ff  candidate-c/settings-security-help-open-390x844-1x.png
3c1932f75280e42290fe8c9d89e145d7d192c754ff4979077c1d1ef4f65cee1a  hygiene/setup-help-keyboard-focus-return-390x844-1x.png
ba87b5eae19e6d5fec5ed1f27d2b3913e3cf03e324bf9acd2d73cb0cfc56da38  hygiene/setup-help-reopened-after-barrier-390x844-1x.png
```

The two final hygiene captures were rendered from the production `SettleoraSetupScreen` on the post-implementation branch: one after barrier dismissal and immediate reopen, and one after keyboard activation plus explicit close with the returned launcher focus visibly highlighted. The 320px/2× capture exercises localization-style long copy and scroll reachability. Candidate A tests independently prove modal-barrier dismissal, explicit close, immediate reopen and focus return; every launcher uses the same reusable mechanism. No #1092 seen key or preference is read or written.
