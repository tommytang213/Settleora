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

This audit inventories **44 canonical capability rows** exactly once:
`implemented` 2, `partial` 19, `unavailable` 14, `blocked` 9, `superseded` 0.
Forty-two non-complete rows have one execution packet below. A packet can
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
`apps/web-user/README.md` that the portal is merely a foundation and the root
`README.md` claim that web/admin portals remain placeholders are superseded
for user web by source. The root sentence also covers admin web, so #373 owns
a bounded wording correction only after #964 reconciles that half; changing it
here would exceed the two-file contract. The equally stale implication in old
planning that generated methods make future UI readily available is rejected.

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
| 10 | `WEB-D1-008` | Bill revisions and review | `partial` | metadata | read only* | yes | partial | Detail loads `listBillRevisions`; generated proposal/review-context/snapshot/impact/approval/apply methods exist, but #967 must reconcile revision depth and the unmapped settlement-impact operation before UI | P04 |
| 11 | `WEB-D1-009` | Attachments, receipt content and OCR handoff | `partial` | metadata | read only* | yes | yes | Personal detail lists attachment metadata only; generated personal/group content, upload/remove and OCR methods exist but are unused | P05 |
| 12 | `WEB-D1-010` | Group list/detail/members/group-bill readouts | `partial` | yes | yes* | yes | yes | `GroupsReadoutPanel`, group/member/bill loaders and tests; PRs #583/#584 | P06 |
| 13 | `WEB-D1-011` | Group create/rename/member mutations | `unavailable` | disabled | no | yes | yes | `Create group unavailable`; generated create/update/add/update/remove methods exist but are unused | P06 |
| 14 | `WEB-D1-012` | Friends, direct sharing and temporary participants | `unavailable` | truthful unavailable | no | no | planning only | `createFriendsUnavailableReadout`; test asserts unavailable; no generated friend/direct/claim methods; closed #431-#434 are policy/reference, not runtime | P07 |
| 15 | `WEB-D1-013` | Settlement balances, requests, counterparty payment/QR and proof metadata | `partial` | yes | yes* | yes | yes | Loaders/panels/tests credit server-returned payment and QR metadata plus proof metadata; generated QR-content read remains unused; PRs #585/#587/#590 | P08 |
| 16 | `WEB-D1-014` | Settlement create/propose/pay/confirm/dispute/cancel/proof actions | `unavailable` | disabled | no | yes | yes | Page says actions unavailable; generated basket/request/payment/proof mutation methods are unused | P08 |
| 17 | `WEB-D1-015` | Self profile and payment-detail readout | `partial` | yes | yes* | yes | yes | `ProfilePaymentReadoutPanel`, `loadProfilePaymentReadout`, metadata-only QR tests; PR #586 | P09 |
| 18 | `WEB-D1-016` | Profile/payment edit and authorized QR content/actions | `unavailable` | read only | no | yes | yes | Update/attach/remove/content methods exist but source uses only self reads | P09 |
| 19 | `WEB-D1-017` | Notification list, filters, summary and preference readout | `partial` | yes | yes* | yes | yes | `NotificationsReadoutPanel`, three read calls and tests; PRs #588/#589 | P10 |
| 20 | `WEB-D1-018` | Notification read/archive/preference mutations, typed open and message resolution | `blocked` | partial | no | partial | partial | Generated read/archive/preference writes exist but are unused; related IDs are display-only; `safeSummary ?? messageKey` can expose keys; #973 owns reconciliation | P10 |
| 21 | `WEB-D1-019` | Monthly reports and server-backed bill search | `partial` | yes | yes* | yes | yes | `ReportsReadoutPanel`, `loadReportsReadout`, tests; PR #591; group summary/detail actions remain absent | P11 |
| 22 | `WEB-D1-020` | Personal/group CSV and JSON export | `partial` | yes | yes* | yes | yes | Readiness recheck, scoped download, object-URL revoke and failure tests in `importExportReadout`; runtime PRs #596/#597, contract #595 | P13 |
| 23 | `WEB-D1-021` | CSV preflight, reviewed session, confirm and discard | `partial` | yes | yes* | yes | yes | Non-mutating preflight plus explicit server confirmation/discard in source/tests; runtime PRs #600/#603, contracts #599/#602; no direct-import fallback | P13 |
| 24 | `WEB-D1-022` | Local backup package/session/download | `partial` | yes | yes* | yes | yes | Package create/prepare/status/download/cancel/discard code and tests; user-web runtime PR #618 with contract/server prerequisites #610/#612/#614/#617 | P14 |
| 25 | `WEB-D1-023` | Restore preview and confirmation metadata | `partial` | yes | yes* | yes | yes | Non-mutating preview and metadata-only confirmation session code/tests; user-web runtime PRs #620/#623 with contracts #619/#622/#624 | P14 |
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
| 37 | `WEB-D1-035` | Settings and Day 1 experience-mode controls | `unavailable` | placeholder | no | planning only | partial | `shellModel.ts::navItems` exposes `settings` as a placeholder; `shellModel.test.ts` covers navigation only; no `help_me_decide`, policy or mode-control operation exists; selectable themes remain Day 2 | P18 |
| 38 | `WEB-D1-036` | Bundled What’s New / release notes | `unavailable` | no | no | n/a | n/a | `MVP_DAY1_SCOPE.md` requires bundled offline-safe version notes; no source route, asset, component or test exists | P19 |
| 39 | `WEB-D1-037` | Server-managed announcements | `blocked` | no | no | no | no | `MVP_DAY1_SCOPE.md` requires targeted user-web announcements; no contract/client/UI exists; #1094 owns server authority and currently only a mobile handoff | P20 |
| 40 | `WEB-D1-038` | Contextual help for major Day 1 screens | `unavailable` | no | no | n/a | n/a | `MVP_DAY1_SCOPE.md` requires contextual help; no user-web help affordance, content module, component or test exists | P21 |
| 41 | `WEB-D1-039` | Privacy-mode readout, selection/change and recovery warnings | `blocked` | no | no | no | partial | `MVP_DAY1_SCOPE.md` and `PRIVACY_VAULT_ARCHITECTURE.md` require `standard_secure`/`recoverable_private_vault` within policy; closed #421 is reference only and no user-web contract/UI exists | P22 |
| 42 | `WEB-D1-040` | Product-safe labels instead of internal IDs/implementation details | `partial` | yes | no | n/a | n/a | `App.tsx` exposes generated-client/API terminology and raw file/profile/proof IDs despite `WEB_USER_REFERENCE_V1.md` privacy-safe-copy rules | P23 |
| 43 | `WEB-D1-041` | Cross-record soft-delete, Trash, restore and dependency restrictions | `blocked` | bill only | partial | partial | partial | No cross-record Trash UI or dependency-safe lifecycle coverage; #716 owns the policy chain | P24 |
| 44 | `WEB-D1-042` | Receipt OCR review queue/detail/correction and apply boundary | `blocked` | metadata only | no | yes | partial | Generated review/correction/assignment/apply methods exist but user web calls none; provisional OCR must not become accepted bill truth | P25 |

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
| `WEB-D1-035` | Users cannot choose Day 1 experience modes or use supported Day 1 settings. |
| `WEB-D1-036` | Users cannot review offline-safe version changes inside the web app. |
| `WEB-D1-037` | Users cannot receive authoritative targeted service or policy announcements on web. |
| `WEB-D1-038` | Users cannot open contextual explanations from major Day 1 web screens. |
| `WEB-D1-039` | Users cannot inspect or safely change the allowed privacy mode or understand recovery consequences. |
| `WEB-D1-040` | Users can see confusing internal identifiers or implementation terminology in normal readouts. |
| `WEB-D1-041` | Users cannot find, restore, or safely delete records across Day 1 domains with dependency warnings. |
| `WEB-D1-042` | Users cannot review or correct OCR fields, items, tax, discounts or classification before acceptance. |

## 5. State-vector evidence

Codes: `Y` dedicated source plus focused adapter/helper test evidence; `P`
present but generic or unasserted even at that level; `N` absent/not
applicable. Because the protected shell is unreachable, **no `Y` is composed
page acceptance**; every family still requires P12 page-level proof. P23 is a
separate cleanup only for affected readouts.

| Family | Empty | Loading | Retryable error | Denied | Signed out / ended | Unavailable / unconfigured | Narrow | Accessibility / focus | Evidence conclusion |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| Shell/auth | P | P | P | P | Y | Y | P | P | Auth helpers classify 401/403/error; loading is generic and not directly asserted, and no sign-in/retry/logout control exists. |
| Home/dashboard | P | P | P | P | Y | P | P | P | Generic safe panels only; no live dashboard state model. |
| Bills/revisions/files | P | P | P | P | Y | P | P | P | Bill tests prove missing credential, successful load and filtering; other rendered state branches lack dedicated or composed-page tests. |
| Groups/friends | Y | P | Y | Y | Y | Y | P | P | Group readouts are covered; loading is rendered but not directly tested, and friends/direct sharing is only unavailable. |
| Settlements/proof | Y | P | Y | Y | Y | Y | P | P | Read paths and proof metadata are covered; loading lacks a direct assertion and consequential actions are absent. |
| Profile/payment | P | P | Y | Y | Y | Y | P | P | Read and metadata safety are covered; loading lacks a direct assertion and edit/file interaction states are absent. |
| Notifications | Y | P | Y | Y | Y | Y | P | P | Read/filter states are covered; loading lacks a direct assertion and open/mutation/template resolution is absent. |
| Reports/search | P | P | P | P | Y | Y | P | P | Tests prove missing credential, successful load, missing methods and summaries; other state branches and composed-page acceptance are untested. |
| Export/import | Y | P | Y | Y | Y | Y | P | P | Adapter tests cover readiness/session/conflict paths, but loading and composed-page reachability/focus/capture are untested. |
| Backup/restore | Y | P | Y | Y | Y | Y | P | P | Package/preview/session terminal states are strong; loading is unasserted and restore apply intentionally absent. |
| Sync/offline | Y | P | Y | Y | Y | Y | P | P | Server status terminal states are covered; loading and queue/conflict-resolution/local-only UI are absent. |
| Account/security | N | P | P | P | Y | Y | P | P | Generic route only; reset-complete form has focused semantics tests. |
| Recurring | N | N | N | N | P | N | N | N | No dedicated surface; only the generic shell can represent signed-out state. |
| Settings/modes | N | N | N | N | P | Y | P | P | Navigation reaches a placeholder; settings operations and dedicated state evidence are absent. |
| User guidance | N | N | N | N | P | N | N | N | What’s New, announcements and contextual help have no user-web surfaces; only generic shell behavior applies. |

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
| P01 | 001, 002, 027, 028 | Existing [#965](https://github.com/tommytang213/Settleora/issues/965) must split web bootstrap/sign-in/session/security children; reuse #776 for MFA/passkey planning | `auth-session-security`; API/OpenAPI/client and `apps/web-user` children kept separate | `api-security` or `web-ui`; strong independent; **auth/security manual gate** | #965/#776 authority first; close only with safe credential lifecycle, server-policy readout, signed-out/expired/denied/unavailable outcomes, factor/passkey enrollment and step-up, inspect/revoke management, recovery-code batch generation/revocation, tests and exposure approval | Searches for web sign-in/session/security found #336-#339, #774, #776, #777, #784, #965 and #1059; generated lifecycle methods are unused, and no parallel web child is created. |
| P02 | 003 | Recommend focused **user-web home/dashboard server-summary and actionability** child after P01, reusing #399 only for group-dashboard data | `web-user-ui`; dashboard component/tests only unless a named owner identifies a contract prerequisite | `web-ui`; strong independent; visual evidence; no money mutation | P01 and #399/#969/#970/#973/#365/#977 data readiness as applicable; close with server-authoritative current spending, owed/owing balances, review-needed items and next useful actions plus all state-vector and desktop/narrow evidence | Searches found #373/#963 and the named domain owners, but no focused current user-web home implementation owner. Mobile #299 is not replayed. |
| P03 | 004-007 | Separate bill-readout, create and lifecycle/edit children under [#344](https://github.com/tommytang213/Settleora/issues/344) | `web-user-ui`; contract child first where needed | `web-ui`; strong; money gate | P01; #344, #346, #349-#352 and #967 before UI where their contracts are incomplete; close only with server-authoritative category, optional bill payment-method field, bill/shared notes and comments, multi-payer/on-behalf confirmation, bill/item split modes and exclusions, quantity assignment/open self-claim, multi-tax/fee/discount/refund/mismatch controls, manual FX, lifecycle operations, safe retry/no-duplicate, refresh and visual proof | #346/#349-#352/#967 own the accepted money/domain and missing ordinary bill-metadata/discussion boundaries; #350/#967 specifically own persisted self-claim/unresolved depth, and #582 runtime is credited. |
| P04 | 008 | Existing [#967](https://github.com/tommytang213/Settleora/issues/967) with #344/#402 must reconcile revision depth and split the later web review/context child | bills/money contract/domain before `web-user-ui`; revision UI/tests do no calculations | matching contract profile then `web-ui`; strong independent; **money/settlement manual gate** | P01, #967, #344 and #402; the missing settlement-impact endpoint/contract is resolved before UI; close with granular snapshots, server review context/impact, affected-user/payer states and action acceptance | #967 is the current completeness owner; PR #526 and closed #348/#423/#525/#527 are credited contract/domain work, not web UI. |
| P05 | 009 | [#966](https://github.com/tommytang213/Settleora/issues/966) splits metadata/content/upload/remove from file authority | storage/privacy then `web-user-ui`; contract/UI separate | `api-storage` then `web-ui`; strong; **privacy/file gate** | P01/#966; normalize before upload/OCR/storage, retain raw temporarily, preview/manual fallback, API enforcement, and #401-authorized duplicate candidates with review-existing/save-anyway/cancel states | OCR extraction #959 stays untouched; #401 owns duplicate policy and P25 post-upload review. |
| P06 | 010-011 | Separate group readout/dashboard and member-mutation children under [#399](https://github.com/tommytang213/Settleora/issues/399) | `web-user-ui`; contract first if needed | `web-ui`; strong; authz gate for writes | P01/#399; readout close includes group balances, activity, open bills and needs-attention summary; mutations require server revalidation, states and visual proof | PRs #583/#584 credited; #399 owns group-dashboard truth. |
| P07 | 012 | Existing [#400](https://github.com/tommytang213/Settleora/issues/400) must split contract/server/UI children for friends, direct share and temporary participant claims | `api-openapi-generated-clients` before `web-user-ui`; exact domain paths per child | `openapi-client` then `web-ui`; strong independent; auth/privacy/abuse/money gates | P01, #976 and #347 before the #400 web child; preserve their relationship, retained-history, eligibility, temporary-participant link/claim and claim-security contracts, then close UI only with exact-match discovery and server-revalidated lifecycle acceptance | Searches found #400, current domain owner #976, temporary-participant owner #347 and closed policy/reference #431-#434; generated client has no methods. |
| P08 | 013-014 | [#969](https://github.com/tommytang213/Settleora/issues/969)/#353 split readout from settlement actions | money domain then `web-user-ui` | money/`web-ui`; strong; **money gate** | P01/#969 plus #354-#356; #966/P05 for normalized, authorized proof and settlement-scoped counterparty QR content/retry/denied authz; close with eligible-line/pay-all basket selection, exact selected-versus-paid totals, partial payment and receiver confirmation, notes, residual correction/dispute, authorized proof attach/view/remove, no duplicates and visual evidence | #353-#356/#966 own the accepted settlement/proof boundaries; #585/#587/#590 and current metadata are credited. |
| P09 | 015-016 | Existing [#395](https://github.com/tommytang213/Settleora/issues/395), with #966 for QR bytes | `web-user-ui`; profile/payment metadata UI separate from storage child | `web-ui`; strong independent; privacy/file gate for QR and visibility review | P01/#395/#966; QR writes wait for purpose-specific client and authoritative server normalization with metadata stripping, bounded source/output dimensions and preserved scannability; close with preview, decode/failure, replace/remove, server-refreshed edits, privacy-safe unavailable states and file authorization/scannability evidence | Search found #395/#966 and closed #460; current metadata readout is credited, not normalized QR-byte acceptance. |
| P10 | 017-018 | [#973](https://github.com/tommytang213/Settleora/issues/973) reconciles mutations, typed opens and preferences before focused web children | planning → `web-user-ui`; contracts separate | docs then `web-ui`; strong; privacy/auth gates | P01/#973 and #369 producer/domain completion; preference close includes admin caps, channels, quiet hours, digest/immediate, per-event categories, group mute, disabled/unconfigured/save failure; inbox/open close includes safe rendering, authz-revalidated typed navigation and fallback for every approved bill-update/acknowledgement, item-claim, security/session and server-OCR completion/failure event family | #368/#369/#403/#973 found; #369 owns the missing event producers, while #409 is localization evidence only. |
| P11 | 019, 030 | [#977](https://github.com/tommytang213/Settleora/issues/977), #405/#404 reconcile reports, reconciliation and cross-record search | domain then `web-user-ui`; contract/UI split | domain then `web-ui`; strong; money gate if totals change | P01/#977 with #404 reconciliation and #405 search authority; close with totals, authorized global result families, bounded queries/filters, empty/denied/result navigation, and server-accepted personal/group reconciliation update, clear and reason presentation with capability refresh, conflict/retry/no-duplicate and audit-safe results plus narrow/a11y evidence | #404/#405/#977 found; generated reconciliation writes are unused and #591 bill search is credited. |
| P12 | 031-033 | Recommend focused **current-head user-web responsive/accessibility/visual acceptance harness** after material runtime waves | `web-user-ui`; test/harness/evidence only, no domain mutation | `web-ui`; strong independent plus human visual acceptance | Runs after relevant UI children; close with desktop/narrow, keyboard/focus, zoom/text expansion and screen-reader-oriented evidence; #975 remains final cross-product QA | Searches found #975 and broad parents only; #580 captures are historical, and `WEB_USER_REFERENCE_V1.md` is the default reference. |
| P13 | 020-021 | Existing [#971](https://github.com/tommytang213/Settleora/issues/971)/#406 reconcile export/import authority and acceptance; recommend only a reachability/composed-page acceptance child after P01 | `sync-import-export-restore` then `web-user-ui` | `sync-import-export`/`web-ui`; strong independent; import apply privacy/money gate | P01 and #971; close with scoped authorization, conflict/idempotency and full page state evidence | Runtime PRs #596/#597/#600/#603 and their #595/#599/#602 contracts plus closed #461 are credited; direct import methods are intentionally unused. |
| P14 | 022-024 | Existing #971/#406 with #966 must own package/preview/restore split; restore apply requires a new focused contract/server child before UI | `sync-import-export-restore`; storage and UI paths separated | `sync-import-export`; strong independent; **restore/destructive/privacy/money manual gates** | #971/#966 first; package close requires all authorized Day 1 personal/group/shared records, merchant/items/notes/payment/OCR sections, policy-approved file bytes, encryption/integrity, retention and restore compatibility; apply close requires identity, integrity, duplicates, conflicts, idempotency, financial/private validation, authz and audit | User-web runtime PRs #618/#620/#623 and contract/server prerequisites #610/#612/#614/#617/#619/#622/#624 are credited; the current package is data-only/personal-bill-limited and the generated client has no apply method, so download, preview and confirmation are not complete backup/restore authority. |
| P15 | 025-026 | #971/#361 owns queue/offline/local/conflict reconciliation | sync/local domain before UI; locally authoritative records are not a server cache | sync profile; strong; **local-security gate** | #971 plus security design before persistence; close with first-launch local/server choice, local profile/workspace creation, locally authoritative Day 1 bill/OCR operations and backup, encryption/key handling, retention/device loss/sign-out, app PIN where feasible, no-collaboration warning, queue/retry/conflict behavior and explicit connect/import movement. Server-mode acceptance waits for P01; local-only operation does not | #361/#364/#406/#971 found; browser storage and a local-only workspace are absent. |
| P16 | 029 | Existing [#365](https://github.com/tommytang213/Settleora/issues/365) must decide user-web recurring/forecast child scope with #366/#367 | `recurring-bills` then `web-user-ui`; domain and UI split | matching domain profile/`web-ui`; strong independent; money gate for draft generation | P01 and #365-#367; close with recurring-template create/edit, schedule and due-soon visibility, server forecast, explicit generated-draft action, instance confirmation and complete state/visual evidence | Source-symbol and issue search found generated recurring methods and the existing #365/#366/#367 chain, but no web route/child. |
| P17 | 034 | First child: #409 `L10N-D1-005`; later `006/012/013/024` inventories, `016/025` after #965, `008` after #973, and `020` after #963/#970/#971/#966 | `web-user-ui` for 005; later `docs-planning`, gated web/API children | `web-ui` or `docs-only`; cheap/strong per child; money/auth/storage gates retained | 005 depends only on #963 merge. Close with English catalog/locale provider, synchronized document `lang`, representative ordinary shell/shared-state migration and tests; no auth copy | Exact keyword searches found #409 but no focused catalog issue. #409 explicitly excludes auth/session, money, notification resolver and server strings from 005. |
| P18 | 035 | Existing [#412](https://github.com/tommytang213/Settleora/issues/412) must split first-launch choice, later settings change, preference authority and user-web acceptance | `design-reference` then `web-user-ui`; any schema/API/OpenAPI/client persistence child remains separate | visual-reference gate then `web-ui`; strong independent; **product/visual and contract manual gates** | Pre-sign-in/local presentation need not wait for P01; server-persisted preference waits for #412 authority and P01. Close web children with mode/policy states, `help_me_decide` questions/recommendation, one-or-two-area limited opt-ins or a product-approved feasibility disposition, proof Basic preserves required review/conflict/approval/error/security/privacy states, mandatory-state visibility and desktop/narrow evidence; selectable themes stay Day 2 | #412 explicitly owns modes, guidance, settings, persistence and platform splits; `DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md` requires first-launch/settings reference. #580 placeholder is credited; no duplicate child is proposed here. |
| P19 | 036 | Recommend focused **user-web bundled What’s New** child | `web-user-ui`; bundled notes/component/tests and local seen state | `web-ui`; cheap; no server contract | After P17 catalog/bootstrap and an approved product-copy/version source; close with localized, expansion-safe, product-facing (not developer-changelog) versioned copy, version-keyed seen persistence, automatic unseen-version display, skip/dismiss, settings/help/about reopen, offline notes and narrow/a11y evidence | No focused owner; #1094 excludes What’s New, and P17 supplies localization infrastructure without absorbing this product surface. |
| P20 | 037 | Existing [#1094](https://github.com/tommytang213/Settleora/issues/1094) must extend its post-authority handoff split to user web without bundling provider delivery or What’s New | `docs-planning` → API/OpenAPI/client → `web-user-ui`, each separate | matching contract/security then `web-ui`; strong independent; **admin exposure/auth manual gate** | #1094 server authority first and P01 for protected targeting; close web child with server-authored safe content, window/target/severity/read state, denied/offline/stale states and authz | #1094 is the existing announcement authority owner but currently names mobile handoff; notification #973 and bundled notes P19 are distinct. |
| P21 | 038 | Recommend focused **user-web contextual help for major Day 1 screens** child | `web-user-ui`; bounded help affordance/content/tests, no autonomous policy engine | `web-ui`; cheap independent; visual evidence | Follow P17 plus each stable screen/reference; close with a screen-key/version inventory, product-managed per-screen purpose/major-action/status content, accessible open/close/focus and reopen, optional viewed/skipped persistence where used, offline-safe localized/expansion evidence, narrow behavior and no authority claims | Searches for user-web contextual help found no focused owner; #412 covers mode guidance, not all screen help, and #1094 explicitly excludes contextual help. |
| P22 | 039 | Existing [#966](https://github.com/tommytang213/Settleora/issues/966) must split privacy-mode runtime/policy/contract and user-web children using closed #421 as the reference | `storage-file-privacy-authz` then API/OpenAPI/client then `web-user-ui`, kept separate | `api-storage`/contract then `web-ui`; strong independent; **privacy/auth/schema manual gates** | #966 and P01; selector UI waits for working vault encryption, key wrapping, device/recovery envelopes, vault-aware protected fields/file bytes and recovery runtime. Close with policy readout, allowed/required/disabled states, explicit selection/change, protected-field/file and unavailable-key outcomes, recovery warnings/flow, audit, backup compatibility, server revalidation and narrow/accessibility evidence | #421 completed only the UX reference; #966 is the live privacy completeness owner and confirms runtime absence. P18 experience modes cannot grant privacy authority. |
| P23 | 040 | Recommend focused **user-web product-safe identifier and implementation-copy cleanup** child | `web-user-ui`; presentation adapters/components/tests only, no identifier or API semantics change | `web-ui`; strong independent; privacy review and visual evidence | P01 and stable readout contracts; close when raw internal IDs and generated-client/API terminology are replaced by authorized labels or privacy-safe unavailable states across current pages | Exact open/closed searches for user-web internal-ID/generated-client copy found no focused owner; P17 localization maps catalog copy but does not decide authorized display identity. |
| P24 | 041 | Existing [#716](https://github.com/tommytang213/Settleora/issues/716) splits cross-record lifecycle domain and user-web Trash children | destructive domain before `web-user-ui` | domain then `web-ui`; strong; **destructive/privacy/money gates** | P01/#716; close with record coverage, dependency restrictions, Trash list/detail, restore, permanent-delete policy, idempotency, authz and audit | Bill/notification archive credit does not replace #716 policy. |
| P25 | 042 | Existing [#970](https://github.com/tommytang213/Settleora/issues/970) with #967 splits OCR review/correction; #959 stays untouched | OCR/revision/file domain before `web-user-ui` | OCR/contract then `web-ui`; strong; **file/privacy/money gates** | P01/#970/#967/#966; close with queue/detail, field/item/tax/discount/refund/classification correction, assignment, apply preview and draft-versus-revision acceptance | Generated methods unused; #970 owns workflow, #959 remains independent. |

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
   reports/search. These are audits, not substitute runtime owners. P19 bundled
   What’s New is also independent once its version/content source is approved.
3. **After #965:** real web bootstrap/sign-in/session control; then protected
   readout acceptance and low-consequence group/profile/report UI children can
   run in parallel where their domain audit permits.
4. **After API/OpenAPI/domain:** friends/direct sharing/temporary participants,
   richer bill create/edit, any new report/group-summary contract, and #1094's
   user-web announcement handoff after server authority exists.
5. **After privacy/files:** attachment/OCR content and mutation, QR content,
   proof content, file-byte backup sections, and #966's privacy-mode
   policy/contract/UI split using the #421 reference.
6. **After money/settlement:** bill/revision writes and settlement/payment/proof
   actions. Presentation formatting does not acquire calculation authority.
7. **After sync/restore:** browser queue/local-only/conflict resolution and any
   restore apply path.
8. **Acceptance-only:** composed-page state tests, desktop/narrow captures,
   keyboard/focus/zoom/text-expansion checks and final #975 evidence. New Figma
   is needed only for a materially new/high-consequence interaction beyond
   `WEB_USER_REFERENCE_V1.md`.
9. **Guidance/settings:** #412 owns the separately gated first-launch/settings
   reference and preference split; its pre-sign-in presentation is not blocked
   on auth. P21 contextual help follows each stable screen and its reference.
   P23 product-safe identifier/copy cleanup follows stable readout contracts
   and remains separate from catalog infrastructure.

## 9. Closed-work credit and Day 2 boundary

Closed #458-#462 remain valid planning/foundation checkpoints. Merged user-web
runtime is credited to PR #580 (shell), #582-#584 (bills/groups), #585-#590
(settlement/profile/notification/proof readouts), #591 (reports), #593
(import/export availability), #596/#597 (export), #600/#603 (import), #607
(sync status), #618 (backup download), #620/#623 (restore preview/confirmation),
and #767 (public reset completion). Contract/server prerequisites—including
#617 and #624—are evidence, not mislabeled as user-web runtime; unrelated #615
is excluded. No row asks to rewrite these slices.

Day 2 is excluded: live FX providers, bank/statement automation, budgets,
cross-instance/cloud behavior, actual multilingual resources, selectable theme
preferences and broader customization remain governed by `DAY2_SCOPE.md` or
later authority. Structural English catalog readiness is Day 1; translated
content is not.

## 10. Audit close rule

#963 may close after this audit and its concise ledger checkpoint merge, the
#373 completed/remaining graph is updated, live duplicate searches remain
recorded, and the first wave above is preserved. #373 stays open. This audit
changes no runtime, tests, API, OpenAPI, generated client, auth/security,
storage/privacy, money/settlement, schema, sync/restore behavior, provider,
deployment/configuration, secret or Figma asset.
