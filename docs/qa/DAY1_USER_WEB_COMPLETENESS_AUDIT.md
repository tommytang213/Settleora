# Day 1 User-Web Completeness Audit

Issue: [#963](https://github.com/tommytang213/Settleora/issues/963)

Parent: [#373](https://github.com/tommytang213/Settleora/issues/373)

Task key: `20260909-1725`

Source baseline: `origin/main` at `c10285dbb9703923f2a34a58fd4d9e4785a1db80`

## 1. Decision

Day 1 user web is **partial**, not a placeholder-only shell and not feature
complete. Current source contains real generated-client-backed bill, group,
settlement, profile/payment, notification, report, export/import, backup and
sync readouts, plus export, staged-import and backup-session operations. None
of the protected paths is reachable from a normal browser launch, however:
`UserPortalShell` calls `loadSessionBoundaryState({ accessToken: null })` and
there is no sign-in, credential source, refresh, logout or protected-route
redirect. The public password-reset completion route is the only complete
user-facing operation.

This audit inventories **37 canonical capability rows** exactly once:
`implemented` 2, `partial` 18, `unavailable` 12, `blocked` 5, `superseded` 0.
Thirty-five non-complete rows have one execution packet below. A packet can
reuse an existing owner or recommend a focused child; it does not make an
unnumbered recommendation runnable.

The first dependency-safe logical task after #963 is the already-deduplicated
`L10N-D1-005` recommendation: **user-web English catalog, locale bootstrap and
document-language metadata**. It is lower risk than protected runtime work,
requires no API or credential decision, and must exclude auth/session copy.
In parallel, the existing completeness audits #965, #966, #969, #971, #973 and
#977 can establish their gated domain splits. No protected product workflow
should outrank `L10N-D1-005` while the real web sign-in dependency is still
owned by #965.

## 2. Method and status vocabulary

Evidence was reconciled from current source/tests, the generated web client,
Day 1/Day 2 PRDs, the user-web reference, the #409 localization audit, live
issues, and merge ancestry. Closed #458-#462 and only the runtime PRs named in
section 9 are credited for behavior still present. The stale claim in
`apps/web-user/README.md` that the portal is merely a foundation is
superseded by source; the equally stale implication in old planning that
generated methods make future UI readily available is also rejected.

- `implemented`: rendered and operable in the shipped route, with current
  contract/server authority and bounded state evidence.
- `partial`: useful source-backed behavior exists, but reachability, states,
  action coverage or acceptance is incomplete.
- `unavailable`: the UI truthfully omits/disables the capability or has no
  implementation.
- `blocked`: implementation must wait for the named security, money, file,
  sync/restore or domain authority.
- `superseded`: an old plan or surface has been replaced and must not be
  recreated. No live capability row is superseded; only historical claims are.

The truth columns below are independent: **R** source renders a surface; **O**
source performs the requested operation; **C** current generated contract
supports it; **A** current API/domain acceptance or policy exists. `Yes*`
means the code path exists but is unreachable because the portal supplies no
credential. Generated method presence never supplies `R` or `O`; visible UI
never supplies `A`.

## 3. Canonical capability inventory

| # | Gap | Route / capability | Status | R | O | C | A | Exact current evidence | Owner packet |
| ---: | --- | --- | --- | :---: | :---: | :---: | :---: | --- | --- |
| 1 | — | Shell, hash routing and navigation | `implemented` | yes | yes | n/a | n/a | `App.tsx::normalizeRouteId`, `UserPortalShell`, `NavButton`; `shellModel.test.ts`; responsive shell from PR #580 | Closed #458 / PR #580 |
| 2 | `WEB-D1-001` | Bootstrap, current actor/profile and session resolution | `blocked` | yes | no | yes | yes | `authSession.ts::loadSessionBoundaryState` can call `getCurrentUser`/`listCurrentAccountSessions`, but `App.tsx` passes `accessToken: null`; `authSession.test.ts` proves auth-required | P01 |
| 3 | `WEB-D1-002` | Real sign-in, refresh, logout and protected-route behavior | `blocked` | partial | no | yes | yes | Generic signed-out banner only; generated `signInLocalSession`, `refreshSession`, `signOutCurrentSession` exist but are unused; no credential storage | P01 |
| 4 | — | Public password-reset completion | `implemented` | yes | yes | yes | yes | `PasswordResetCompletePage.tsx`, `passwordResetComplete.ts`; focused component/helper tests; PR #767 | Closed implementation / PR #767 |
| 5 | `WEB-D1-003` | Home/dashboard summaries and actionability | `unavailable` | placeholder | no | partial | partial | `shellModel.ts::dashboardCards` renders `Hidden`/`Protected`; no server-backed dashboard load or actionable metrics | P02 |
| 6 | `WEB-D1-004` | Personal bill list, search and filters | `partial` | yes | yes* | yes | yes | `BillsReadoutPanel`, `loadBillsReadout`, presentation filters; `billsReadout.test.ts`; PR #582 | P03 |
| 7 | `WEB-D1-005` | Personal bill detail and server readouts | `partial` | yes | yes* | yes | yes | `loadBillDetailReadout` loads bill, attachment metadata, revision list and settlement candidates; no item/review/action completeness | P03 |
| 8 | `WEB-D1-006` | Personal/group bill creation | `unavailable` | disabled | no | yes | partial | Page action says `Add bill unavailable`; generated `createPersonalBill`/`createGroupBill` exist; rich Day 1 split/tax/FX/temporary-participant scope is not established | P03 |
| 9 | `WEB-D1-007` | Bill edit, submit, archive/restore and participant actions | `unavailable` | disabled | no | partial | partial | Generated submit/archive/restore/accept/reject exist; no UI calls them and no general edit method exists | P03 |
| 10 | `WEB-D1-008` | Bill revisions and review | `partial` | metadata | read only* | yes | yes | Detail loads `listBillRevisions`; generated proposal/review-context/snapshot/impact/approval/apply methods exist but no review/action UI | P04 |
| 11 | `WEB-D1-009` | Attachments, receipt content and OCR handoff | `partial` | metadata | read only* | yes | yes | Personal detail lists attachment metadata only; generated personal/group content, upload/remove and OCR methods exist but are unused | P05 |
| 12 | `WEB-D1-010` | Group list/detail/members/group-bill readouts | `partial` | yes | yes* | yes | yes | `GroupsReadoutPanel`, group/member/bill loaders and tests; PRs #583/#584 | P06 |
| 13 | `WEB-D1-011` | Group create/rename/member mutations | `unavailable` | disabled | no | yes | yes | `Create group unavailable`; generated create/update/add/update/remove methods exist but are unused | P06 |
| 14 | `WEB-D1-012` | Friends, direct sharing and temporary participants | `unavailable` | truthful unavailable | no | no | planning only | `createFriendsUnavailableReadout`; test asserts unavailable; no generated friend/direct/claim methods; closed #431-#434 are policy/reference, not runtime | P07 |
| 15 | `WEB-D1-013` | Settlement balances, requests, payments, proof metadata | `partial` | yes | yes* | yes | yes | settlement loaders/panels/tests; server-returned money/status; PRs #585/#587/#590 | P08 |
| 16 | `WEB-D1-014` | Settlement create/propose/pay/confirm/dispute/cancel/proof actions | `unavailable` | disabled | no | yes | yes | Page says actions unavailable; generated basket/request/payment/proof mutation methods are unused | P08 |
| 17 | `WEB-D1-015` | Self profile and payment-detail readout | `partial` | yes | yes* | yes | yes | `ProfilePaymentReadoutPanel`, `loadProfilePaymentReadout`, metadata-only QR tests; PR #586 | P09 |
| 18 | `WEB-D1-016` | Profile/payment edit and authorized QR content/actions | `unavailable` | read only | no | yes | yes | Update/attach/remove/content methods exist but source uses only self reads | P09 |
| 19 | `WEB-D1-017` | Notification list, filters, summary and preference readout | `partial` | yes | yes* | yes | yes | `NotificationsReadoutPanel`, three read calls and tests; PRs #588/#589 | P10 |
| 20 | `WEB-D1-018` | Notification read/archive/preference mutations, typed open and message resolution | `blocked` | partial | no | partial | partial | Generated read/archive/preference writes exist but are unused; related IDs are display-only; `safeSummary ?? messageKey` can expose keys; #973 owns reconciliation | P10 |
| 21 | `WEB-D1-019` | Monthly reports and server-backed bill search | `partial` | yes | yes* | yes | yes | `ReportsReadoutPanel`, `loadReportsReadout`, tests; PR #591; group summary/detail actions remain absent | P11 |
| 22 | `WEB-D1-020` | Personal/group CSV and JSON export | `partial` | yes | yes* | yes | yes | Readiness recheck, scoped download, object-URL revoke and failure tests in `importExportReadout`; runtime PRs #596/#597, contract #595 | P13 |
| 23 | `WEB-D1-021` | CSV preflight, reviewed session, confirm and discard | `partial` | yes | yes* | yes | yes | Non-mutating preflight plus explicit server confirmation/discard in source/tests; runtime PRs #600/#603, contracts #599/#602; no direct-import fallback | P13 |
| 24 | `WEB-D1-022` | Local backup package/session/download | `partial` | yes | yes* | yes | yes | Package create/prepare/status/download/cancel/discard code and tests; runtime PRs #617/#618 with contract prerequisites #610/#612/#614 | P14 |
| 25 | `WEB-D1-023` | Restore preview and confirmation metadata | `partial` | yes | yes* | yes | yes | Non-mutating preview and metadata-only confirmation session code/tests; runtime PRs #620/#623/#624 with contracts #619/#622 | P14 |
| 26 | `WEB-D1-024` | Restore apply | `blocked` | truthful unavailable | no | no | no | UI explicitly says no records restored; generated client has no restore-apply method | P14 |
| 27 | `WEB-D1-025` | Sync/local-status readout | `partial` | yes | yes* | yes | yes | `loadSyncLocalStatus`, `SyncLocalStatusCard`, fail-closed tests; PR #607 | P15 |
| 28 | `WEB-D1-026` | Offline queue, local-only persistence and conflict resolution | `unavailable` | no | no | partial | partial | No browser storage/service worker/queue use; only server status is rendered; generated sync methods are unused | P15 |
| 29 | `WEB-D1-027` | Account sessions/devices/security-state controls | `blocked` | generic only | no | yes | yes | Shell can show session count only after an injected token; security route is generic protected placeholder; revoke/sign-out methods unused | P01 |
| 30 | `WEB-D1-028` | Registration/invitation/OIDC/password/MFA/passkey/recovery surfaces | `unavailable` | reset completion only | no | partial | partial | Many generated auth methods exist; user web implements only reset completion; policy/public exposure remains #965 | P01 |
| 31 | `WEB-D1-029` | Recurring bills and forecast | `unavailable` | no | no | yes | yes | Generated template/forecast/draft methods exist; no nav route, component or user-web tests | P16 |
| 32 | `WEB-D1-030` | Manual reconciliation read/update | `partial` | status/filter | read only* | yes | yes | Bills render/filter server reconciliation status; generated update methods are unused | P11 |
| 33 | `WEB-D1-031` | Responsive/narrow behavior | `partial` | yes | n/a | n/a | n/a | CSS has 1060px/760px breakpoints, 320px minimum and overflow guards; no automated narrow rendering/capture suite | P12 |
| 34 | `WEB-D1-032` | Keyboard, focus, semantics and zoom/text scaling | `partial` | yes | partial | n/a | n/a | Skip link, labels, live regions and focus-visible styles exist; no shell keyboard order, focus restoration, zoom or screen-reader tests | P12 |
| 35 | `WEB-D1-033` | Final visual/reference acceptance | `partial` | yes | n/a | n/a | n/a | `WEB_USER_REFERENCE_V1.md` governs; historical #580 captures do not cover later readouts/actions or exact current head | P12 |
| 36 | `WEB-D1-034` | Localization-ready catalog/formatting/expansion | `unavailable` | English only | no | n/a | n/a | #409 `L10N-D1-005/006/012/013/016/020/024/025`; no catalog/bootstrap; manual formatting and physical CSS remain | P17 |
| 37 | `WEB-D1-035` | Settings, appearance and experience-mode controls | `unavailable` | placeholder | no | planning only | partial | `shellModel.ts::routeDefinitions` exposes `settings` as a placeholder; `shellModel.test.ts` covers navigation only; no appearance, `help_me_decide`, policy or mode-control operation exists | P18 |

`Yes*` is implementation credit, not launch readiness: all protected rows
currently receive an absent access token. Row 23 is an actual staged import
mutation after explicit confirmation; row 25 is not restore apply.

## 4. User-impact registry

Every non-complete row has one explicit impact below; the gap ID links it to
the evidence and owner packet above.

| Gap | User impact |
| --- | --- |
| `WEB-D1-001` | A browser launch cannot resolve the actor or enter protected Day 1 areas. |
| `WEB-D1-002` | Users cannot sign in, recover an expired session, sign out, or follow a protected-route redirect. |
| `WEB-D1-003` | Home shows protected placeholders instead of actionable account summaries. |
| `WEB-D1-004` | Bill discovery works only in unreachable source and lacks composed-page acceptance. |
| `WEB-D1-005` | Users cannot complete the full bill-detail review from the current page. |
| `WEB-D1-006` | Users cannot create personal or group bills on web. |
| `WEB-D1-007` | Users cannot maintain, submit, archive, restore, or respond to bills on web. |
| `WEB-D1-008` | Users can see revision metadata but cannot inspect or complete revision review. |
| `WEB-D1-009` | Users cannot securely view, upload, remove, or hand receipts to OCR from web. |
| `WEB-D1-010` | Group readouts exist but remain unreachable and lack final page acceptance. |
| `WEB-D1-011` | Users cannot create, rename, or change group membership on web. |
| `WEB-D1-012` | Friends, direct shares, temporary participants, and claims cannot be used on web. |
| `WEB-D1-013` | Settlement truth is readable only in an unreachable, not finally accepted surface. |
| `WEB-D1-014` | Users cannot initiate or progress settlement/payment/proof workflows on web. |
| `WEB-D1-015` | Profile and payment metadata cannot be reached or finally accepted in the shipped portal. |
| `WEB-D1-016` | Users cannot edit profile/payment details or access authorized QR content on web. |
| `WEB-D1-017` | Notification and preference readouts are unreachable and lack final page acceptance. |
| `WEB-D1-018` | Users cannot safely open, mark, archive, or change notification preferences; raw keys may be visible. |
| `WEB-D1-019` | Reports/search are unreachable and omit group-detail actions. |
| `WEB-D1-020` | Export code exists but users cannot reach and accept the complete browser flow. |
| `WEB-D1-021` | Import review/confirmation exists but cannot be reached or accepted end to end. |
| `WEB-D1-022` | Backup creation/download exists only behind the missing session boundary and lacks page acceptance. |
| `WEB-D1-023` | Users can preview restore metadata in source but cannot complete a restore. |
| `WEB-D1-024` | No user can apply a restore; the UI correctly stops before destructive authority. |
| `WEB-D1-025` | Users cannot reach the server sync/local-status readout from a normal launch. |
| `WEB-D1-026` | Users have no browser queue, local-only persistence, or conflict-resolution workflow. |
| `WEB-D1-027` | Users cannot inspect/revoke devices or control their current authenticated session. |
| `WEB-D1-028` | Registration, invitation, OIDC, password, MFA, passkey, and recovery entry surfaces are absent. |
| `WEB-D1-029` | Users cannot configure recurring bills or use forecasts on web. |
| `WEB-D1-030` | Users can filter reconciliation status but cannot resolve it on web. |
| `WEB-D1-031` | Narrow-screen behavior is not proven against the complete current surface. |
| `WEB-D1-032` | Keyboard, focus, zoom, and assistive-technology regressions can escape current evidence. |
| `WEB-D1-033` | Later runtime slices lack current-head visual/reference acceptance. |
| `WEB-D1-034` | Hardcoded copy and formatting prevent a safe localization foundation and can expose transport labels. |
| `WEB-D1-035` | Users cannot choose Day 1 experience modes, appearance, or supported settings. |

## 5. State-vector evidence

Codes: `Y` dedicated source plus test evidence; `P` present but generic,
untested at the composed page, or unreachable; `N` absent/not applicable.

| Family | Empty | Loading | Retryable error | Denied | Signed out / ended | Unavailable / unconfigured | Narrow | Accessibility / focus | Evidence conclusion |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| Shell/auth | P | Y | P | P | Y | Y | P | P | Auth helpers classify 401/403/error, but no sign-in/retry/logout control exists. |
| Home/dashboard | P | P | P | P | Y | P | P | P | Generic safe panels only; no live dashboard state model. |
| Bills/revisions/files | Y | Y | Y | Y | Y | Y | P | P | Adapter tests cover read failures; mutation/review/file and composed-page state acceptance absent. |
| Groups/friends | Y | Y | Y | Y | Y | Y | P | P | Group readouts are covered; friends/direct sharing is only unavailable. |
| Settlements/proof | Y | Y | Y | Y | Y | Y | P | P | Read paths and proof metadata covered; consequential actions absent. |
| Profile/payment | P | Y | Y | Y | Y | Y | P | P | Read and metadata safety covered; no edit/file interaction states. |
| Notifications | Y | Y | Y | Y | Y | Y | P | P | Read/filter states covered; open/mutation/template resolution absent. |
| Reports/search | Y | Y | Y | Y | Y | Y | P | P | Server rows covered; group summary/action and composed narrow evidence absent. |
| Export/import | Y | Y | Y | Y | Y | Y | P | P | Extensive adapter tests cover readiness/session/conflict paths; shell reachability and page focus/capture remain. |
| Backup/restore | Y | Y | Y | Y | Y | Y | P | P | Package/preview/session states are strong; restore apply intentionally absent. |
| Sync/offline | Y | Y | Y | Y | Y | Y | P | P | Server status only; queue/conflict-resolution/local-only states absent. |
| Account/security | N | P | P | P | Y | Y | P | P | Generic route only; reset-complete form has focused semantics tests. |
| Recurring | N | N | N | N | P | N | N | N | No dedicated surface; only the generic shell can represent signed-out state. |
| Settings/modes | N | N | N | N | P | Y | P | P | Navigation reaches a placeholder; settings operations and dedicated state evidence are absent. |

No family is promoted to implemented from a happy path alone. The adapter
tests are valuable but do not replace composed `App` interaction, narrow
rendering, focus-order, zoom or screen-reader evidence.

## 6. Execution packets and gap ownership

Each packet supplies the canonical lane, intended path boundary, validation,
review tier, gate, dependencies, close rule and duplicate evidence for every
non-complete inventory row that cites it. Suggested children are deliberately
not assigned to #373 or #963.

| Packet | Gap rows | Owner / focused recommendation | Lane; allowed-path boundary | Validation; review; manual gate | Dependencies and close rule | Duplicate-prevention evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | 001, 002, 027, 028 | Existing [#965](https://github.com/tommytang213/Settleora/issues/965) must split web bootstrap/sign-in/session/security children; reuse #776 for MFA/passkey planning | `auth-session-security`; API/OpenAPI/client and `apps/web-user` children kept separate | `api-security` or `web-ui`; strong independent; **auth/security manual gate** | #965 audit first; close each child only with safe credential lifecycle, signed-out/expired/denied states, tests and exposure approval | Searches for web sign-in/session/security found #336-#339, #774, #776, #777, #784, #965 and #1059; no parallel web child is created. |
| P02 | 003 | Recommend focused **user-web home/dashboard server-summary and actionability** child after P01, reusing #399 only for group-dashboard data | `web-user-ui`; dashboard component/tests only unless #399 identifies a contract prerequisite | `web-ui`; strong independent; visual evidence; no money mutation | P01 and any #399/#977 summary contract; close with server values plus all state-vector and desktop/narrow evidence | Searches found #373/#963 and group-specific #399, but no focused current user-web home implementation owner. Mobile #299 is not replayed. |
| P03 | 004-007 | Recommend separate bill-readout acceptance, supported-create, and lifecycle/edit children under existing [#344](https://github.com/tommytang213/Settleora/issues/344) domain authority | `web-user-ui`; one cohesive bill UI/test slice each; contract child first where needed | `web-ui`; strong independent; money manual gate for writes | P01; #344 contract/domain adjudication for rich create/edit; close with actual operation, safe retry/no-duplicate behavior, server refresh and visual evidence | Source/PR search credits #582 and generated creates/actions; issue search found #344/#459/#526, no open focused user-web mutation child. |
| P04 | 008 | Recommend focused **user-web revision review/context** child only after #344/#402 confirms accepted fields and action gates | `web-user-ui`; revision UI/tests, no calculations | `web-ui`; strong independent; **money/settlement manual gate** | P01, #344 and #402; close with server review-context/snapshot/impact, affected-user/payer states and action acceptance | PR #526 and closed #348/#423/#525/#527 are credited contract/domain work, not web UI. |
| P05 | 009 | Existing [#966](https://github.com/tommytang213/Settleora/issues/966) must split metadata/content/upload/remove/OCR UI from file authority | `storage-file-privacy-authz` then `web-user-ui`; contract/file and UI paths separate | `api-storage` then `web-ui`; strong independent; **privacy/file manual gate** | P01 and #966; OCR extraction remains #959 untouched; close with authorized bytes, safe failures and visual/file acceptance | Search credits attachment/OCR generated methods and PR #590 proof metadata; no open focused user-web file child. |
| P06 | 010-011 | Recommend separate group-readout acceptance and group/member mutation children under existing [#399](https://github.com/tommytang213/Settleora/issues/399) | `web-user-ui`; group UI/tests only unless owner splits contract | `web-ui`; strong independent; authz/manual review for member writes | P01 and #399; close with server revalidation, no client authz, states and visual evidence | PRs #583/#584 and generated mutation methods credited; closed #459 is not reopened. |
| P07 | 012 | Existing [#400](https://github.com/tommytang213/Settleora/issues/400) must split contract/server/UI children for friends, direct share and temporary participant claims | `api-openapi-generated-clients` before `web-user-ui`; exact domain paths per child | `openapi-client` then `web-ui`; strong independent; auth/privacy/abuse/money gates | P01, #400 and contract before UI; close only with exact-match discovery, relationship lifecycle, eligibility and claim/link authorization acceptance | Searches found #400 plus closed policy/reference #431-#434; generated client has no methods. |
| P08 | 013-014 | Existing [#969](https://github.com/tommytang213/Settleora/issues/969)/#353 must split readout acceptance from request/payment/proof actions | `money-settlement-payment` and later `web-user-ui`; never mixed with generic UI | `money-settlement`/`web-ui`; strong independent; **money/settlement manual gate** | P01 and #969; files additionally P05; close with API-owned totals/status, no duplicate actions, residual/dispute and visual evidence | Searches found #353/#969 and credited #585/#587/#590; no duplicate web action issue created. |
| P09 | 015-016 | Existing [#395](https://github.com/tommytang213/Settleora/issues/395), with #966 for QR bytes | `web-user-ui`; profile/payment metadata UI separate from storage child | `web-ui`; strong independent; privacy/file gate for QR and visibility review | P01; #395/#966; close with server-refreshed edits, privacy-safe unavailable states and file authorization evidence | Search found #395 and closed #460 only; current readout is credited. |
| P10 | 017-018 | Existing [#973](https://github.com/tommytang213/Settleora/issues/973) must reconcile mutations, typed opens/authz revalidation and message arguments; then focused web children | `docs-planning` → `web-user-ui`; contract change kept separate | `docs-only` then `web-ui`; strong independent; notification privacy, auth or domain gates retained | P01 and #973; close UI children with server revalidation, safe fallback, mutation refresh and deep-link state evidence | Searches found #368/#369/#403/#973 and completed notification runtime; #409 `008/019` is localization evidence, not a duplicate feature owner. |
| P11 | 019, 030 | Existing [#977](https://github.com/tommytang213/Settleora/issues/977), #405 and #404 reconcile report/group-summary/reconciliation scope | `reports-search-reconciliation` then `web-user-ui`; contract/UI split | matching domain profile then `web-ui`; strong independent; money gate if totals semantics change | P01 and #977; close with authoritative totals, bounded filters/actions and narrow/accessibility evidence | Search found #404/#405/#977 and credited PR #591; no new report parent. |
| P12 | 031-033 | Recommend focused **current-head user-web responsive/accessibility/visual acceptance harness** after material runtime waves | `web-user-ui`; test/harness/evidence only, no domain mutation | `web-ui`; strong independent plus human visual acceptance | Runs after relevant UI children; close with desktop/narrow, keyboard/focus, zoom/text expansion and screen-reader-oriented evidence; #975 remains final cross-product QA | Searches found #975 and broad parents only; #580 captures are historical, and `WEB_USER_REFERENCE_V1.md` is the default reference. |
| P13 | 020-021 | Existing [#971](https://github.com/tommytang213/Settleora/issues/971)/#406 reconcile export/import authority and acceptance; recommend only a reachability/composed-page acceptance child after P01 | `sync-import-export-restore` then `web-user-ui` | `sync-import-export`/`web-ui`; strong independent; import apply privacy/money gate | P01 and #971; close with scoped authorization, conflict/idempotency and full page state evidence | Runtime PRs #596/#597/#600/#603 and their #595/#599/#602 contracts plus closed #461 are credited; direct import methods are intentionally unused. |
| P14 | 022-024 | Existing #971/#406 with #966 must own package/preview/restore split; restore apply requires a new focused contract/server child before UI | `sync-import-export-restore`; storage and UI paths separated | `sync-import-export`; strong independent; **restore/destructive/privacy/money manual gates** | #971/#966 first; apply close rule requires identity, integrity, duplicates, conflicts, idempotency, financial/private validation, authz and audit | Runtime PRs #617/#618/#620/#623/#624 and their #610/#612/#614/#619/#622 contracts are credited; current generated client has no apply method, so preview/confirmation is not restore authority. |
| P15 | 025-026 | Existing #971/#361 owns queue/offline/local/conflict reconciliation and future split | `sync-import-export-restore`; persistence/domain before UI | `sync-import-export`; strong independent; sync/restore manual gate | P01 and #971; close only with local/server authority, queued-versus-accepted truth, persistence/retry/conflict tests and UI evidence | Search found #361/#364/#406/#971; browser storage is absent, so no duplicate web local-mode issue is created. |
| P16 | 029 | Existing [#365](https://github.com/tommytang213/Settleora/issues/365) must decide user-web recurring/forecast child scope | `recurring-bills` then `web-user-ui`; domain and UI split | matching domain profile/`web-ui`; strong independent; money gate for draft generation | P01 and #365; close with server schedules/forecast, explicit draft action and state/visual evidence | Source-symbol and issue search found generated recurring methods and #365, but no web route/child. |
| P17 | 034 | First child: #409 `L10N-D1-005`; later `006/012/013/024` inventories, `016/025` after #965, `008` after #973, and `020` after #963/#970/#971/#966 | `web-user-ui` for 005; later `docs-planning`, gated web/API children | `web-ui` or `docs-only`; cheap/strong per child; money/auth/storage gates retained | 005 depends only on #963 merge. Close with English catalog/locale provider, synchronized document `lang`, representative ordinary shell/shared-state migration and tests; no auth copy | Exact keyword searches found #409 but no focused catalog issue. #409 explicitly excludes auth/session, money, notification resolver and server strings from 005. |
| P18 | 035 | Recommend focused **user-web settings and Day 1 experience-mode controls** child after P01 and product-mode authority are reconciled | `web-user-ui`; settings UI/tests only, with any preference contract split first | `web-ui`; strong independent; visual evidence; auth/privacy review for persisted choices | P01 and an exact product-mode contract decision; close with supported mode/appearance/policy readouts, server-refreshed preference changes, all state-vector evidence and desktop/narrow proof | Live searches for `settings`, `experience mode`, `appearance` and `help_me_decide` found no focused issue; the placeholder from #580 is credited, and broad customization remains later-day. |

## 7. Localization reconciliation

- `L10N-D1-005` remains an independent, coherent first implementation
  foundation. It must not absorb missing product runtime, auth/session copy,
  notification resolution, formatting, money or server-authored strings.
- `006`, `012`, `013` and `024` remain separate planning/adoption boundaries
  after 005: ordinary formatting/collation, manually gated money display,
  expansion/logical CSS, and ordinary copy/visible enums respectively.
- `016` and `025` remain blocked on #965 and retain the auth/security manual
  gate. Reset completion behavior is already implemented; only later catalog
  adoption is incomplete.
- `008` and the broader notification behavior remain after #973; `019` is
  already owned by #973. Stable keys leaking through `safeSummary ??
  messageKey` is evidence for resolver work, not proof the notification list
  itself is missing.
- `020` stays a non-runnable inventory after #970/#971/#966 and existing #406
  ownership. It must not mix API/OpenAPI, storage, restore, sync and UI work.

## 8. Dependency-safe queue

1. **First:** implement `L10N-D1-005` as one `web-user-ui` English
   catalog/bootstrap/document-language child after #963 closes.
2. **Parallel reconciliation:** #965 auth/session, #966 storage/privacy, #969
   settlement, #971 sync/import/restore, #973 notifications and #977
   reports/search. These are audits, not substitute runtime owners.
3. **After #965:** real web bootstrap/sign-in/session control; then protected
   readout acceptance and low-consequence group/profile/report UI children can
   run in parallel where their domain audit permits.
4. **After API/OpenAPI/domain:** friends/direct sharing/temporary participants,
   richer bill create/edit, and any new report/group-summary contract.
5. **After privacy/files:** attachment/OCR content and mutation, QR content,
   proof content and file-byte backup sections.
6. **After money/settlement:** bill/revision writes and settlement/payment/proof
   actions. Presentation formatting does not acquire calculation authority.
7. **After sync/restore:** browser queue/local-only/conflict resolution and any
   restore apply path.
8. **Acceptance-only:** composed-page state tests, desktop/narrow captures,
   keyboard/focus/zoom/text-expansion checks and final #975 evidence. New Figma
   is needed only for a materially new/high-consequence interaction beyond
   `WEB_USER_REFERENCE_V1.md`.

## 9. Closed-work credit and Day 2 boundary

Closed #458-#462 remain valid planning/foundation checkpoints. Merged user-web
runtime is credited to PR #580 (shell), #582-#584 (bills/groups), #585-#590
(settlement/profile/notification/proof readouts), #591 (reports), #593
(import/export availability), #596/#597 (export), #600/#603 (import), #607
(sync status), #617/#618 (backup artifact/download), #620/#623/#624
(restore preview/confirmation/package preview), and #767 (public reset
completion). Documentation and contract prerequisites in the intervening PRs
are evidence, not mislabeled as runtime; unrelated #615 is excluded. No row
asks to rewrite these slices.

Day 2 is excluded: live FX providers, bank/statement automation, budgets,
cross-instance/cloud behavior, actual multilingual resources and broader
customization remain governed by `DAY2_SCOPE.md` or later authority. Structural
English catalog readiness is Day 1; translated content is not.

## 10. Audit close rule

#963 may close after this audit and its concise ledger checkpoint merge, the
#373 completed/remaining graph is updated, live duplicate searches remain
recorded, and the first wave above is preserved. #373 stays open. This audit
changes no runtime, tests, API, OpenAPI, generated client, auth/security,
storage/privacy, money/settlement, schema, sync/restore behavior, provider,
deployment/configuration, secret or Figma asset.
