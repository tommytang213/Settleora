# Issue #295 Day 1 lightweight Home shortcuts evidence

Task key: `20260909-0934`. These 15 production-widget captures were generated from the final reviewed implementation source and inspected at original resolution. The tracked copies under [`735d7f65/`](735d7f65/) make the final evidence self-contained.

## Accepted Day 1 contract

- Home `Quick access` is a presentation-only convenience layer. Its exact fixed product order is Notifications, Recurring bills, Receipt reviews, Reports; the default selection is Notifications plus Recurring bills, and zero through all four may be shown.
- `More -> App settings -> Home shortcuts` uses the existing settings-row/shared-bottom-sheet language. It changes only versioned device-local key `settleora.presentation.home_shortcuts.v1`, whose JSON payload contains version `1` and stable shortcut machine keys. Unknown keys and duplicates are ignored, stored order is normalized, malformed/read failures use safe defaults, and empty selection is valid.
- Successful writes update Home. Failed writes retain the last persisted effective selection, show bounded retryable copy, and never claim success. Duplicate pending writes share one result; distinct writes serialize. Home and App settings wait for stored state, repeated settings opens coalesce, and route rebuilds wait for active presentation writes.
- Every shortcut calls the existing canonical destination opener without domain mutation. Notifications, Recurring bills, Receipt reviews and Reports remain independently available in More when hidden on Home. Hiding Notifications does not change unread state, delivery, filtering, deep links or notification preferences.
- The bottom navigation remains exactly Home / Bills / Groups / Settle / More. Accounts & income and its unavailable fallback remain unchanged under More. No setup is required.
- Drag/drop, arbitrary ordering/actions, custom navigation, server sync, analytics and experience modes are excluded. Issue #295 remains open for its Day 2 custom-layout ownership; #412 retains experience modes and #975 retains native device/screen-reader acceptance.

## Candidate and convergence

- Final source `735d7f65e0e42727e62ca6bb7672c155e49c75d7`, tree `1c7098b91eb2a0391c9b41c3fd66cb6eb8feb282`, implementation [PR #1158](https://github.com/tommytang213/Settleora/pull/1158), normal merge `35f33dc0486a79bad94801e181e87265d660c128`, starting main `2b9264cd78d7880201863946b4b9014ae18816f4`. The implementation branch is retained.
- Doctor, pub get and analyzer passed; 145 focused preference/Home/More/App-settings/#299/#1092/#1093/shared-component/visual tests and 1,093 full mobile tests passed; scaffold validated 19 paths; diff checks passed. The generic active M15 scope guard surfaced the explicitly task-authorized mobile paths for human review because its allowlist is docs/control-only.
- Fresh Gemini `strong_independent` and independent local Codex approved the exact final source plus all 15 original-resolution images with high confidence, zero findings and zero checkout mutation. GitHub Codex produced six bounded lifecycle findings across earlier candidates; all were corrected with deterministic regressions. Its final review found no major issues on `735d7f65`. All 11 CI/CodeQL/Semgrep/Trivy/scaffold checks passed, all seven review threads were resolved, and open branch-scoped code-scanning alerts were zero.
- No shared component changed, so #301 receives no progress update. #372 remains open for parent reconciliation. No backend/domain/API/OpenAPI/generated-client, auth/session/authz, storage/file privacy, schema/migration, notification delivery, recurring/report/OCR behavior, money/settlement/payment calculation, analytics, deployment/config/secret or dependency change was made.

## Capture mapping

The 390px/1x matrix covers: default Home; canonical More routes; the App settings row; default customization; adding Receipt reviews; adding Reports; hiding Notifications; all four; zero/omitted Quick access; save failure/retry; focused Home action; and focused customization control. The 320px/2x matrix covers all four on Home, all four in customization, and reachable failure/retry. Production widget tests separately prove 48dp+ targets, one shortcut action semantic each, selected-state semantics, deterministic keyboard activation, fixed visual/focus order, no critical clipping/overflow and zero navigation mutation.

## Capture SHA-256

```text
3bfd1f5e4ebeefc6dfc824e506844a082bad4bc98c4ea72a438def96c4280e7d  01-home-default-390x844-1x.png
f2663efa0be056ea6ed7fb4d5322e96d60414ababd2c0426208897b7795357cb  02-more-canonical-routes-390x844-1x.png
ca7eb6f5bb970d06cd25efbebbc974de1ac66e3611057ccc50eda425357919e6  03-app-settings-row-390x844-1x.png
b93d9542b5c43e593ae654b1571c2591a07ed78b9a4f6272e899bccd8613c14f  04-customization-default-390x844-1x.png
1e05f29787e451ac1b956a8df6615696879a39c56030f3cdefd974e8dd1a1028  05-home-add-receipts-390x844-1x.png
df2991d3a79867a8ad0bb7511d3c03e44e805d3841be9f86e7069baa9cbf85b9  06-home-add-reports-390x844-1x.png
b019360fb395ddcdf56b42195fb6e2673dcdce9d41eb668b7f288ce2cbace293  07-home-notifications-hidden-390x844-1x.png
c05baeed993765e1f2c3c2b0f10f8c278649d2a3641f4f09069b4be5ffcfbd99  08-home-all-four-390x844-1x.png
9488ef0668a9fe2f9773e5020f66df451a9ab8249fdbb7f846d69a81199a6a8e  09-home-zero-390x844-1x.png
26859bdaf750e307a40f0a6e28d161dcb411366901ce121f9d94d553e36cdd2c  10-save-failure-retry-390x844-1x.png
e64a70ff47c73593524b517c6b6adef6aa1742d4a00e2d6729edae15a4788767  11-focused-home-shortcut-390x844-1x.png
6ac7814e2b3a1be9c588d1e44248ae8108ba560ea178e2434f377492e2a67457  12-focused-customization-390x844-1x.png
d6594cb129b17252ee5a2413e0c48132802294f4796a16616e2476654eecd0e0  13-home-all-four-320x844-2x.png
3c68072fd797fbf8c89d5d10cb69b095644d0fc862dac84eef1e24392a9818df  14-customization-all-four-320x844-2x.png
58938292b330dfb5ee84dbff30faa7ce2af31200c27ecf9816c01c6fd5846b56  15-save-failure-320x844-2x.png
```
