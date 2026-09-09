# Day 1 localization-readiness audit

- Issue: [#409](https://github.com/tommytang213/Settleora/issues/409)
- Task key: `20260909-1312`
- Evidence base: `3fa603828c141fcbd9f91fb700c573d0448df3e1` (`origin/main`, 2026-09-09)
- Lane / validation: `docs-planning` / `docs-only`

## 1. Executive status

Day 1 may ship in English only, but [the Day 1 language policy](../prd/MVP_DAY1_SCOPE.md#day-1-language-scope) requires bounded string ownership, locale-aware presentation formatting, stable errors separate from visible copy, and translation-ready notifications. Actual Traditional Chinese resources, a language preference, and translated notifications/errors remain [Day 2](../prd/DAY2_SCOPE.md#19-localization-foundation-and-traditional-chinese-ui).

Overall classification: **partial**. Current clients safely preserve server authority for money and authorization, many mobile failures are reduced to typed categories and bounded copy, notification records carry stable title/message keys, and recent shared mobile components have strong 320px/2x evidence. The shipped presentation layers are nevertheless not Day 1 localization-ready because mobile and user web lack locale/catalog bootstrap, formatting is mostly manual, and user-web notification UI can expose transport template keys as copy. Admin web is a reference-only dependency rather than a localization implementation.

Classifications in this document:

- `ready`: the current boundary has a stable, locale-safe seam and no Day 1 remediation is evidenced.
- `partial`: useful structure exists, but a bounded Day 1 readiness change is still required.
- `missing`: a required Day 1 structural seam is absent from the current runtime.
- `blocked/reference`: readiness cannot be implemented independently because the product runtime or a higher-consequence gate is not yet admitted.
- `Day 2 translation`: actual translated resources, language selection, and language-specific UX; absence is not a Day 1 failure.

Highest-risk Day 1 gaps are `L10N-D1-001`/`005` (no mobile or user-web resource/catalog bootstrap), `L10N-D1-002`/`006` (manual money/date/number formatting), `L10N-D1-008` (notification keys have no common display resolver and user web exposes them), and `L10N-D1-010` (ordinary API problems generally lack a stable machine category). Already-credible foundations include decimal strings with currency attached, server-authoritative financial truth, generated-client isolation, typed mobile failure kinds, safe raw-detail suppression tests, server notification template keys, responsive web CSS, and shared mobile components tested at high text scale.

## 2. Cross-platform infrastructure inventory

| Boundary | Status | Current evidence | Fallback / interpretation |
| --- | --- | --- | --- |
| Mobile locale/bootstrap | `missing` | `apps/mobile/lib/main.dart` constructs `MaterialApp` without `supportedLocales`, `localizationsDelegates`, locale selection, or generated localizations; `apps/mobile/pubspec.yaml` has no localization package/resource configuration and no ARB files exist. | Framework/device defaults may affect built-in widgets, but application copy is English literals. That is not an application localization seam. |
| User-web locale/bootstrap | `missing` | `apps/web-user/src/main.tsx` renders `App` directly; `package.json` has React only and the source contains no locale provider or message catalog. | Browser defaults are not passed through a product locale context. |
| Admin-web locale/bootstrap | `blocked/reference` | `apps/web-admin/README.md` says no implementation exists. `WEB_ADMIN_REFERENCE_V1.md` is an approved textual reference, not runtime. | #964 must split the runtime first; localization cannot be “added” to a nonexistent shell. |
| Server-facing/template locale | `partial` | `InAppNotificationEvents.TitleKey`/`MessageKey` produce stable keys, but invitation/password-reset composers and `PushNotificationPayloadBuilder` contain fixed English. No request/user language is resolved. | In-app keys are useful machine seams. Email/push currently fall back only to English. |
| Shared resource/catalog layer | `missing` | No shared or platform-specific application catalog was found. | A single cross-platform runtime is not required; platform-native catalogs with stable shared message identifiers are safer. |
| Stable errors vs display copy | `partial` | Mobile repositories expose typed `*FailureKind` values and bounded messages; user web maps `SettleoraApiError.status` to local copy. The OpenAPI `ProblemDetails` shape and most `Results.Problem` calls do not provide a general stable category/code. | Clients usually suppress raw details, but HTTP status alone is too coarse for durable localized mapping. |
| Generated-client boundary | `ready` | `PROGRAM_ARCHITECTURE.md` and generated packages under `packages/client-{dart,web}` keep transport generation separate from handwritten presentation. | Do not hand-edit generated clients or put translated copy in transport models. Contract changes, if later approved, originate in OpenAPI/API work. |

## 3. Mobile Day 1 presentation inventory

All rows inherit `L10N-D1-001` for catalog/bootstrap and, where formatting appears, `L10N-D1-002`. “Expansion” records current evidence, not an RTL Day 1 promise.

| Surface family | Current source evidence and readiness | Interpolation / formatting / layout / accessibility | Smallest Day 1 remediation and owner |
| --- | --- | --- | --- |
| Setup | `app/setup_screen.dart`, `app/app_bootstrap.dart`; English literals, `partial`. | Scrollable/shared controls; #1096 proved 390px/1x and 320px/2x truthful connection states. Semantics are explicit. | Extract the setup family through the mobile catalog foundation (`L10N-D1-001`); preserve #1096 behavior. |
| Sign-in, sessions, recovery | `app/sign_in_screen.dart`, `app/password_reset_repository.dart`, `app/auth_session_repository.dart`; typed failure kinds and bounded copy are `partial`. | Timestamps use `server_mode_shell.dart::_formatTimestamp`; recovery/security wording is high consequence. Back-arrow icons rely on Material directionality, while some explicit arrows require later review. | Catalog extraction under `L10N-D1-001`; formatter adoption under `002`. Auth wording remains manual-gated; no policy rewrite. |
| Home/dashboard and shortcuts | `app/server_mode_shell.dart`; #299 actionable metrics and #295 lightweight shortcuts are implemented. | Money semantics attach amount and currency; card title/caption use ellipsis and shortcut width constraints (`_DashboardSummaryCard`, `_DashboardShortcut`). Recent 320px/2x evidence is credited. | Catalog/format adoption (`001`/`002`) plus focused expansion review (`004`); do not reopen #299/#295 Day 1 work. |
| Bills and revisions | `bills/bill_list_screen.dart`, `bill_revision_*`; broad English copy and local label maps are `partial`. | `_decimalPreviewMoney` uses binary `double` plus `toStringAsFixed(2)` for a non-authoritative preview; `_formatCurrencyAmount` preserves decimal digits but is not locale-aware; `_formatBillDate` is ISO-like. Multiple `maxLines: 1`, ellipses, fixed `118`-wide amounts, explicit left/right alignment and arrows exist. Accessibility tests cover many state/action labels and raw-detail suppression. | Catalog (`001`), presentation-only decimal/date/number formatter adoption without changing server truth (`002`), and targeted expansion/direction review (`004`). Money paths require the money manual gate. |
| Groups/participants | `groups/group_list_screen.dart` and bill participant controls; `partial`. | Search uses lowercased strings; timestamps use raw local `DateTime.toString`; explicit chevrons/arrows and ellipsis occur. Shared selectors/search/dialog work under #301 children is credited. | `001`/`002`/`003`/`004`; do not recreate completed #1097/#1106/#1128 work. |
| Settlements | `settlements/settlement_list_screen.dart`; `partial`. | `_money` concatenates decimal string and code; timestamps and dates are manual. Explicit right padding/alignment and chevrons occur. Typed failures and server-authority copy are strengths. | `001`/`002`/`004`; money/payment behavior stays server-authoritative and manual-gated. |
| OCR capture/review | `receipt_ocr_capture/*`, `receipt_ocr_review/*`; `partial`. | OCR parser normalization is data parsing, not display localization. Review dates are manual ISO UTC; money/quantity suggestions remain strings. Extensive semantics tests suppress IDs, paths, tokens, raw payloads; recent state/button shared-component work is credited. | Presentation catalog/format/layout only (`001`/`002`/`004`). #959 parser and #970 workflow audit remain independent. |
| Recurring/future bills | `recurring_bills/recurring_bill_screen.dart`, `future_bills/*`; `partial`. | `_money` concatenates amount/code and timestamps use raw local strings; singular/plural and schedule labels are ad hoc. One-line/ellipsis and directional layout occur. | `001`/`002`/`003`/`004`; recurrence and draft truth remain server-owned. |
| Notifications | `notifications/notification_repository.dart`, `notification_screen.dart`; `partial`. | Event/status/priority mappings are centralized within the feature, but `_plural` is English-only, timestamps are raw local strings, and `safeSummary` can override mapped message copy. Semantics and redaction tests are strong. | Mobile catalog consumes stable message IDs (`001`, `008`); ICU-style plural/interpolation (`003`); locale time (`002`). |
| Reports/search/reconciliation | `reports/monthly_report_screen.dart`, `manual_finance/manual_finance_screen.dart`; `partial`. | Report month is `yyyy-MM`, timestamps are raw, totals use `toStringAsFixed(2)` or amount/code concatenation. Search normalizes only with trim/lowercase. | `002`/`003`, with money gate for financial display and no browser/client recalculation. |
| Profile/payment details | `profile/profile_screen.dart`; `partial`. | Central field selectors and semantic labels exist; timestamps and file sizes are manual and English units. High-consequence visibility copy is locally bounded. | `001`/`002`; payment/privacy meaning stays with existing policy owners. |
| More/App settings | `app/server_mode_shell.dart`; `partial`. | Shared `SettingsRow` improves wrapping/focus. Static copy remains local; explicit `Alignment.centerLeft` appears in settings/readout rows. | `001`/`004`; preserve #295 navigation and #301 shared-component behavior. |
| Data/import/export/backup preview | `app/local_data_backup.dart`, backup UI in `server_mode_shell.dart`; `partial`. | Stored payload timestamps correctly remain ISO/UTC machine data. Visible preview uses `_formatBackupUtcMinute`; copy clearly states non-mutating preview/disabled restore. | Only visible copy/formatting (`001`/`002`); restore/apply/storage/privacy stays separately gated. |
| What's New | `app/version_notes.dart` and bootstrap/settings launchers; `partial` for localization, behavior complete under #1092. | Caller-owned bundled copy, shared scrolling sheet, focus return, and 320px/2x long-copy evidence are strong extraction seams. | Extract the bounded version-note bundle via `001`; no seen-state or behavior replay. Translation itself is Day 2. |
| Contextual help | `help/contextual_help.dart`; `partial` for localization, behavior complete under #1093. | One keyed registry and shared flexible bottom sheet are ready for extraction; 10 topics have 320px/2x and focus evidence. | Extract registry messages via `001`; do not recreate #1093 mechanics. Translation is Day 2. |

## 4. User-web Day 1 inventory

`apps/web-user/src/App.tsx` is an actual React runtime, not a design mock. It exposes authenticated/read-only and several import/export/backup workflows through generated-client seams. `dist/` is build output and `docs/design/web/WEB_USER_REFERENCE_V1.md` is reference-only; neither owns source copy.

| Surface family | Status and evidence | Smallest Day 1 boundary |
| --- | --- | --- |
| Shell/dashboard/account | `missing` catalog: `main.tsx` has no locale provider and `App.tsx` owns English JSX/state copy. Responsive shell CSS exists. | User-web catalog/bootstrap (`L10N-D1-005`). |
| Bills/groups/friends | `partial`: typed generated responses and safe error reductions exist in `billsReadout.ts`/`groupsFriendsReadout.ts`; dates and money are manual. Some friend/direct-share surfaces explicitly report missing methods rather than pretending runtime. | Catalog plus formatter/collation adoption (`005`/`006`); runtime completeness stays #963-owned. |
| Settlements/profile/payment | `partial`: `settlementsReadout.ts` and `profileReadout.ts` keep server authority and bounded errors; `App.tsx` uses shared `formatMoney`/`formatDate`, but those return raw amount/code and sliced ISO date. | `005`/`006`; money/payment/authz behavior is out of scope. |
| Notifications | `partial`: stable generated fields exist, but `App.tsx` renders `safeSummary ?? messageKey` and also exposes `titleKey`/`messageKey`; count pluralization is an English suffix in `notificationsReadout.ts`. | Notification resolver (`L10N-D1-008`) after #973 reconciliation, plus web catalog (`005`). |
| Reports/search | `partial`: server totals are rendered without recalculation; `reportsReadout.ts` concatenates amount/currency, month defaults from UTC ISO, and filtering/sorting uses lowercase/`localeCompare` without an explicit product locale/collator. | `006`; retain server-authoritative totals. |
| Import/export/backup/sync | `partial`: substantial current runtime exists with bounded stable-code handling and safe error tests. Visible times use the same sliced-date helper; human copy is local. CSV/JSON transport formats and filenames intentionally remain invariant machine contracts. | `005`/`006`; no restore/apply or storage/privacy change. |
| Layout/accessibility | `partial`: `styles.css` includes `min-width: 320px`, responsive breakpoints at 1060/760px, `minmax(0,1fr)`, `overflow-wrap`, and narrow single-column fallbacks. It also has physical `left/right`, `text-align: left/right`, fixed 132/340px columns and `white-space: nowrap`. | Cover catalog expansion and logical-direction CSS in the focused web implementation and visual QA (`005`/`006`); this audit does not promise RTL support. |

## 5. Admin-web Day 1 inventory

`apps/web-admin/README.md` is the entire current app surface and states that no implementation exists. The approved [admin reference](../design/web/WEB_ADMIN_REFERENCE_V1.md) specifies product-grade desktop/tablet layout, bounded/redacted copy, accessibility, responsive behavior, and manual gates, but it is not runnable UI. Therefore admin localization readiness is `blocked/reference`, not `missing translation`: #964 must first reconcile and split #463-#467. Each admitted admin runtime child should establish or consume one admin catalog/locale context from its first shell slice instead of accumulating English literals (`L10N-D1-007`). Admin exposure, auth/security, provider secrets, storage/privacy, backup/restore, and deployment gates remain unchanged.

## 6. Server-facing presentation inventory

| Boundary | Status | Evidence and interpretation |
| --- | --- | --- |
| In-app notification records | `partial` | `InAppNotification` persists `TitleKey`/`MessageKey`; `InAppNotificationEvents` derives stable `notifications.<event>.{title,message}` keys. This is a good resource seam. Some event producers also persist English `SafeSummary`, and clients do not share a resolver. |
| Push payload | `partial` | `PushNotificationPayloadBuilder` deliberately sends privacy-safe generic English title/body and stable event/subject/reference data. Provider separation is sound; locale selection/catalog resolution is absent. |
| Invitation email | `partial` | `InvitationEmailTemplateComposer.TemplateSubject` and `BuildTextBody` are fixed English with safe link interpolation and a redacted preview. Provider/readiness separation is sound; locale/fallback input is absent. |
| Password-reset email | `partial` | `PasswordResetEmailTemplateComposer` has the same safe composition/provider split and fixed English template. Because it is auth/security copy, implementation is manual-gated. |
| API problems | `partial` | Endpoints return bounded English `ProblemDetails`; clients mostly map status into local typed copy. Some bounded domains expose `stableCode`, but there is no general stable error-category contract. API details should remain diagnostic/fallback data, not primary translated UI. |
| Exported headers/labels | `ready` for current purpose | `ExpenseBillExportEndpoints.CsvHeaders` and invariant date/number serialization form a machine-readable export/import contract. Translating these identifiers would reduce interoperability. User-facing export confirmation copy is a separate catalog concern. |
| Logs/audit/internal diagnostics | not localization UI | They remain redacted operational evidence under existing privacy/audit policy. This audit does not turn diagnostics into translated product copy or authorize broader exposure. |

## 7. Formatting readiness

| Concern | Status | Evidence / rule |
| --- | --- | --- |
| Dates | `partial` | Mobile has several private ISO/manual helpers and raw `toLocal().toString().split('.')`; web `formatDate` slices the first 10 characters. Machine/storage dates may stay ISO; visible dates need platform locale formatters. |
| Times and zones | `partial` | Mobile sometimes labels explicit UTC (backup/sync) and elsewhere silently calls `toLocal`; web shows sliced dates and manual `HH:00` quiet hours. Preserve instants/zones as data and localize only presentation. |
| Decimal numbers | `partial` | Counts are raw strings and file sizes use fixed English units. Financial decimal strings are safely transported; display grouping/digits are not locale-aware. |
| Money/currency | `partial` | Currency is consistently attached, a major strength. Mobile/web generally concatenate amount then code; one mobile preview uses `double.toStringAsFixed(2)`. A locale formatter must accept decimal-safe text/minor-unit truth and currency metadata without recalculating, rounding, converting, or changing server authority. |
| Percentages | `ready/not evidenced` | No broad user-visible percentage formatter family was found. Do not create a speculative framework task; handle an actual percentage surface when admitted. |
| Pluralization | `missing` structurally | Mobile `_plural` and web `${count === 1 ? "" : "s"}` implement English suffix rules only. Use catalog plural/select forms; do not build sentences from translated fragments. |
| Interpolation | `partial` | Dart/TS string interpolation is widespread and safe for values, but placeholder names/order are not catalog-controlled. Notification/email links are already bounded variables. |
| Sorting/comparison/search | `partial` | Mobile search commonly uses trim/lowercase; web uses lowercase and `localeCompare` without an explicit resolved locale/collator. Identifiers/status codes remain ordinal machine values; user-facing names need locale-aware comparison/normalization after locale bootstrap. |
| Financial truth | `ready` boundary | API/domain remains authoritative and generated decimal strings/currency remain unmodified. Localization work is presentation-only and must not infer settlement, split, tax, OCR acceptance, FX, or rounding truth. |

## 8. Text expansion and RTL readiness

RTL is not a Day 1 support promise. The readiness goal is to avoid choices that force a later domain/API rewrite.

- Mobile shared sheets, `SettingsRow`, state panels, scrollable scaffolds, and recent #1092/#1093/#1096/#299/#295 320px/2x evidence materially reduce expansion risk. These are credited, not reopened.
- Mobile still contains one-line ellipsis and fixed-width presentation in dashboard shortcuts/metrics, notification rows, bill/OCR rows, and recurring rows; physical `Alignment.centerLeft/centerRight`, `EdgeInsets.only(left/right)`, and explicit forward/back arrows appear in core flows. Review only meaning-bearing cases; decorative spacing and Material direction-aware icons are not automatically defects.
- User web has responsive breakpoints, wrapping and `minmax(0,1fr)` safeguards. Physical left/right borders/alignment, `white-space: nowrap`, and fixed table/detail columns require a catalog-expansion and logical-property pass.
- Admin reference explicitly requires tablet accessibility and responsive fallbacks. Actual expansion/RTL evidence cannot exist before runtime.

`L10N-D1-004`, `005`, and `006` own these bounded implementation checks. #975 retains final native/device/screen-reader/platform acceptance; it is not a substitute for implementation.

## 9. Error/copy architecture

Mobile domain repositories generally define stable local `FailureKind` enums and suppress generated/transport details; focused tests in bill attachments, OCR review, notifications, auth, and other domains assert that paths, tokens, IDs, stack traces, raw payloads, or provider details do not enter visible/semantic text. User-web readout modules similarly convert status categories to bounded copy, and import/export tests exercise unsafe problem payloads.

The remaining structural gap is that ordinary API `ProblemDetails` usually supplies HTTP status plus mutable English title/detail, not a general stable machine error category. Client mappings are repeated by domain and status. `L10N-D1-010` recommends an additive API/OpenAPI error-category contract, followed by generated clients and local catalog mapping. It must be split by consequential domain and must not expose exception/provider detail or hand-edit generated output.

## 10. Notifications and email templates

Notification state, provider readiness, and language preference are separate concerns. Current notification records have excellent stable key seams and safe reference fields; user preferences cover delivery/timing/category behavior, not language. No code should infer language from notification channel, quiet hours, currency, region, or server locale.

`L10N-D1-008` owns display resolution: define a versioned English Day 1 catalog/fallback for stable title/message keys and bounded placeholders, have mobile and user web resolve keys locally (or consume a separately approved rendered-message contract), keep generic privacy-safe push fallback, and never show raw keys to users. #973 must reconcile the notification architecture first to avoid colliding with event/provider work.

`L10N-D1-009` owns auth email composition: accept an explicit resolved locale/fallback at the template boundary, keep invitation/reset variables and redacted previews, and leave SMTP/provider readiness separate. It is manual-gated auth/security work. Actual Traditional Chinese templates remain Day 2.

## 11. Finding registry

Every non-ready Day 1 finding below has exactly one owner recommendation. “New focused issue” means recommendation only; #409 does not create or own runtime remediation.

| ID | Platform / surface | Severity / status | Exact evidence | Owner | Smallest remediation boundary | Lane / validation | Scope / gate / duplicate prevention |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `L10N-D1-001` | Mobile catalog/bootstrap | high / `missing` | `main.dart::SettleoraMobileApp.build`; `pubspec.yaml`; no ARB/l10n config | **New focused issue: Mobile English resource/catalog foundation** | Add platform locale bootstrap, one English catalog, typed placeholders/plurals, and migrate bootstrap/shared chrome plus one representative feature. | `mobile-ui` / mobile focused + full mobile | Day 1 readiness. No translation. Searches for localization/i18n/string resources found only #409/umbrellas and closed component work; #301 is component adoption, not copy ownership. |
| `L10N-D1-002` | Mobile visible date/time/number/money | high / `partial` | `_formatTimestamp` duplicates across shell, notification, group, profile, settlement, recurring, revision; `_money`, `_decimalPreviewMoney`, manual file sizes | **New focused issue: Mobile locale-safe presentation formatters** | Shared presentation helpers plus incremental adoption in bills/settlements/reports/notifications; accept decimal strings/currency without recalculation. | `mobile-ui` / mobile focused + full mobile | Day 1 readiness; money-affecting paths manual-gated. No current focused issue found; closed #852 covers semantics only. |
| `L10N-D1-003` | Mobile plural/interpolation/search | medium / `partial` | `notification_screen.dart::_plural`; lowercased discovery in reports and feature screens; interpolated sentence fragments | **New focused issue: Mobile plural, placeholder, and collation adoption** | Catalog plural/select placeholders and resolved-locale comparison for user names/copy; keep machine codes ordinal. | `mobile-ui` / mobile focused + full mobile | Day 1 readiness. Separate from framework/bootstrap to keep adoption reviewable; no matching focused issue found. |
| `L10N-D1-004` | Mobile expansion/direction | medium / `partial` | dashboard fixed widths/ellipsis; bill/notification/recurring one-line rows; explicit physical alignment/padding/arrows | **New focused issue: Mobile localization expansion and direction hardening** | Audit representative core flows under long English pseudolocalized fixtures/high scale; replace only meaning-bearing physical assumptions. | `mobile-ui` / mobile visual + focused/full mobile | Day 1 readiness. #975 owns final platform acceptance, not remediation; completed #301 children and #1092/#1093 evidence are not replayed. |
| `L10N-D1-005` | User-web catalog/bootstrap | high / `missing` | `src/main.tsx`, `App.tsx`, `package.json`; no locale provider/catalog | **New focused issue: User-web English catalog and locale bootstrap** | Add web locale context/catalog and migrate shell/shared states plus one feature; preserve generated-client boundary. | `web-user` / web tests, build, visual QA | Day 1 readiness. #963 owns completeness audit only; closed #458-#462 planning/runtime slices do not retain new copy-foundation scope. |
| `L10N-D1-006` | User-web formatting/plural/collation/layout | high / `partial` | `billsReadout.formatMoney/formatDate`; `reportsReadout`; notification suffix plural; `localeCompare`; physical CSS alignment | **New focused issue: User-web locale-safe presentation adoption** | `Intl`-style date/time/number/currency/plural/collation plus expansion/logical CSS adoption over actual surfaces. | `web-user` / web tests, build, desktop+narrow visual QA | Day 1 readiness; money display only. No matching focused issue found; #963 remains dependency/anti-duplication audit. |
| `L10N-D1-007` | Admin-web foundation | high / `blocked/reference` | `apps/web-admin/README.md` says no implementation; admin reference is docs only | **Existing #964**, then its focused shell child (expected #463 reconciliation) | Require the first admitted admin shell to establish one English catalog/locale context; later children consume it. | `docs-planning` then `web-admin`; validation chosen by #964 | Day 1 readiness blocked on runtime/reference/manual gates. Do not create a parallel localization-only admin shell issue before #964. |
| `L10N-D1-008` | Notification display resolution | high / `partial` | server `TitleKey`/`MessageKey`; mobile event map; web `safeSummary ?? messageKey` and visible key fields; generic English push | **New focused issue after #973 reconciliation: Notification message-key resolver and English fallback catalog** | Version stable keys/placeholders and resolve them consistently in current clients; keep privacy-safe provider fallback. | `notification` + client slices / notification, mobile, web focused | Day 1 readiness. #973 is the live completeness reconciler and must confirm event ownership; #368/#403 are umbrellas, not this focused implementation. |
| `L10N-D1-009` | Invitation/password-reset email | high / `partial` | `InvitationEmailTemplateComposer`; `PasswordResetEmailTemplateComposer`; fixed English subject/body with safe variables | **New focused issue: Auth email template locale seam and English fallback** | Explicit locale/fallback input at composers, keyed subject/body, safe interpolation/redacted preview; no provider change. | `auth-security` / API focused + security review | Day 1 readiness; manual auth/security gate. Searches found no email-localization issue; provider #403 does not own template language. |
| `L10N-D1-010` | API problem categories | medium / `partial` | widespread bounded `Results.Problem`; general OpenAPI `ProblemDetails`; client status-based repeated mappings; isolated `stableCode` precedents | **New focused issue: Additive stable API error-category contract and client mapping plan** | Define non-sensitive stable category/code separately from title/detail, update OpenAPI, regenerate, then migrate one bounded low-risk domain before consequential domains. | `api`/`openapi-client` / API + OpenAPI/client validation | Day 1 readiness; manual gates by domain. No matching focused issue found. Never hand-edit generated clients or rewrite all endpoint copy in one issue. |

Finding totals: **10** — mobile 4, user web 2, admin web 1, server/cross-boundary 3; severity high 7 / medium 3; readiness `missing` 2 / `partial` 7 / `blocked/reference` 1. All ten are Day 1 structural readiness; actual Traditional Chinese content remains Day 2.

## 12. Dependency-safe remediation wave

1. Reconcile #963, #964, and #973 first where their live audits govern user-web, admin, or notification child creation. This prevents parallel owners and does not block the independent mobile foundations.
2. Implement `L10N-D1-001` and `L10N-D1-005` as separate platform-native English catalog/bootstrap foundations. Admit the admin catalog only with #964's first shell slice (`007`).
3. Implement `L10N-D1-002` and `006` as presentation-only formatter adoption. Start with low-consequence dates/counts, then money surfaces under their existing manual gate without changing decimal truth, currency, rounding, FX, split, or settlement behavior.
4. Implement notification resolution (`008`) after #973 fixes the exact event/client ownership. Keep provider delivery separate. Implement auth email seam (`009`) separately under manual auth/security review.
5. Implement plural/collation (`003`) and targeted mobile/web expansion/direction hardening (`004` plus the layout part of `006`) using long English/pseudolocalized fixtures, 320px/2x mobile evidence, and desktop/narrow web evidence.
6. Plan and stage `L10N-D1-010` additively: one low-risk API domain, OpenAPI, regenerated clients, then separately gated consequential domains. This is not a prerequisite for extracting ordinary client copy.
7. Day 2 may add Traditional Chinese catalogs, language preference, translated notifications/errors, locale-specific QA, and broader RTL policy if separately required. Day 2 must consume rather than replace the Day 1 seams.

## 13. Explicit non-gaps and credited work

- #1092 What's New is behavior-complete: bundled keyed release content, safe seen state, reusable scrolling sheet, focus return, and 320px/2x evidence. Only resource extraction remains; the feature is not reimplemented.
- #1093 contextual help is behavior-complete with one versioned keyed registry, 10 topics, shared sheet mechanics, high-scale evidence, and bounded authority copy. Its registry is a strong extraction seam.
- #1096 setup truthfulness and connection/persistence retry behavior are complete and must not be altered by copy extraction.
- #299 dashboard actionability and #295 Day 1 lightweight shortcuts are complete. #295 remains open only for retained Day 2 drag/drop/custom-layout scope.
- #301 and its completed focused children provide shared fields, buttons, dialogs, state panels, guidance sheets, semantics and focus seams. Localization owns message resources; #301 remains the component-adoption owner and should not be used as a generic copy bucket.
- User web is not a mock: current generated-client-backed bill/group/settlement/profile/notification/report/import/export/backup/sync readouts are real evidence. Its missing/partial classifications concern localization seams, not a claim that all runtime is absent.
- Admin web is the opposite: an approved reference exists, but runtime does not. Translation absence is not the defect; catalog readiness must enter with the first real shell.
- Currency-attached decimal transport, server-authoritative financial calculations, invariant machine timestamps/CSV identifiers, stable notification keys, typed local failure kinds, and generated-client isolation are credited foundations.
- Logs, audit records, enum values, route identifiers, storage keys, API paths, generated models, OCR parser tokens, and CSV contract headers are not translated UI resources.
- No Day 1 Traditional Chinese resources are required or claimed by this audit.
