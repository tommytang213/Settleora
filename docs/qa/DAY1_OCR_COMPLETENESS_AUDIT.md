# Day 1 OCR Completeness Audit

Issue: [#970](https://github.com/tommytang213/Settleora/issues/970)

Parent: [#357](https://github.com/tommytang213/Settleora/issues/357)

Task key: `20260911-1711`

Source baseline: `origin/main` `d2472faaf855f326e9928a02e7efa89ae7415430`, tree `5b784c51f78b071b1b22550e3029365d27c1aba4`

R01 owner: [#1209](https://github.com/tommytang213/Settleora/issues/1209), **R01: fix Android OCR release APK/AAB R8 dependency closure**

R01 completion addendum: [PR #1212](https://github.com/tommytang213/Settleora/pull/1212)
merged reviewed source `2d7ceac310433870aef9bdf4ed93f84feec9dac3`, tree
`fa21fe8238e6753b969dc6107f5b5c838edd1014`, normally as
`6ee8250b7e7c1a1bdb425daaec50f32d14dabaca`. The bounded Android release
configuration now accepts only the eight absent optional-script ML Kit option
types that R8 reports. It does not add their Chinese, Devanagari, Japanese, or
Korean model artifacts; current source still selects the bundled Latin
recognizer. Exact-source debug APK, minified release APK, and minified release
AAB builds passed. Android application identity, production signing, Play, and
physical-device acceptance remain separate R07/#975 gates.

## 1. Decision

The Day 1 receipt/OCR workflow is **partial**. It is no longer an unimplemented
mobile placeholder: current source has camera/gallery/file intake, in-memory
image normalization, a real on-device ML Kit provider, provisional parsing,
editable personal/group review, saved-review API handoff, queue/discovery,
duplicate guidance, explicit draft apply, and server-side non-draft revision
routing. Those are separate capabilities and are not one claim that “OCR
works.”

This audit inventories **25 capabilities exactly once**: 9 `implemented`, 12
`partial`, 1 `blocked`, 2 `externally-gated`, 1 `documentation-only`, and 0
`unavailable`. No row is currently `superseded` or `later-day`; section 8 names
superseded claims and later-day scope without manufacturing capability rows.

R01/#1209 has now closed that bounded compile/package gap. The original exact
source failure at `:app:minifyReleaseWithR8` named ML Kit Chinese, Devanagari,
Japanese, and Korean recognizer option classes. PR #1212 added exact suppressions
for those compile-only bridge arms while retaining the Latin runtime graph and
proved debug APK, minified release APK, and minified release AAB outputs. Closed
#437 planned native validation and did not implement this closure. #959
owns a preserved HK Chinese parser candidate/recovery chain and is not an
Android dependency, Gradle, R8, or release-build owner.

R01 is a compile/package gate, not a store-release gate. Android still uses
debug signing and `com.example.mobile`; R07 owns those later identity/signing
decisions. R03 may consume Android release evidence only after R01 and the
already-completed R02 web package evidence. Final physical-device, platform,
privacy, UI, and release acceptance remains #975.

## 2. Method and evidence rules

The audit reconciled current source/tests and dependency/native inputs; current
architecture, PRD, release-readiness and planning records; full live issue
bodies/comments; merged PR identities; and GitHub searches for an existing R8
owner. Current source and runnable exact-source evidence outrank planning text
and issue state. An open issue is not proof that its behavior is absent, and a
closed planning issue is not implementation proof.

Status vocabulary:

- `implemented`: bounded current behavior and proportionate test/build evidence exist.
- `partial`: useful current behavior exists, but Day 1 coverage or acceptance is incomplete.
- `documentation-only`: architecture/planning exists without runnable behavior.
- `externally-gated`: repository preparation exists but device/provider/human evidence is absent.
- `unavailable`: no supported current runtime path exists.
- `blocked`: a concrete failure or prerequisite prevents completion.
- `superseded`: historical wording was replaced and must not be reused.
- `later-day`: intentionally outside Day 1.

OCR output is candidate input, not financial truth. Local-only acceptance is
local after user review. In server mode, the API/domain remains authoritative
for authorization, money, currency, rounding, bill/revision state, storage
access, sync acceptance, and audit. No preview, queue state, OCR completion,
generated method, or worker output finalizes a bill.

## 3. Canonical capability inventory

Each row names exactly one owner/evidence packet from section 5. The packet is
part of the row and supplies the canonical lane, path envelope, validation
profile, reviewer tier, gates, dependency order, and close rule.

| # | Capability | Status | Exact current source and test/merged evidence | Current behavior and supported recovery | Missing gap | Packet |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Image acquisition/import | `partial` | `receipt_image_intake.dart`; `bill_attachment_file_input.dart`; personal/group seams in `bill_list_screen.dart`; `bill_list_screen_test.dart`; concrete intake PR #108 and hardening PR #111 | Camera and gallery use `image_picker`; receipt file import uses the attachment picker; cancel and permission/input failure leave manual bill editing available. | No share-to-Settleora OS entry, offline intake queue, web/replacement normalization proof, or composed physical-device acceptance. | P01/#358 |
| 2 | Image preprocessing/safety/normalization | `partial` | `receipt_image_artifact_processor.dart`, `receipt_image_normalization_policy.dart`, `receipt_intake_safety.dart`; `_processedReceiptAttachmentArtifact`/`_runReceiptOcrPreview`, both `_changeDraftAttachmentPurpose` implementations and upload loops in `bill_list_screen.dart`; existing-bill `_upload` in `bill_attachment_section.dart`; artifact tests; normalization/artifact PRs #212/#213 | JPEG/PNG/WebP intake bytes are decoded and re-encoded as normalized JPEG plus thumbnail in memory; that derivative becomes draft attachment/upload bytes on the processed create paths. Four live bypasses remain: ML Kit reads the derivative's inherited original `localPath`; failed/unsupported normalization leaves the original selection uploadable; existing-bill attachment upload forwards picked bytes directly; and changing a draft supporting attachment to receipt only relabels it. | OCR, saved-detail uploads, purpose changes and failed/unsupported normalization can bypass the derivative or normalized upload/storage policy. There is no orientation/crop/document-boundary/perspective/enhancement proof, explicit metadata-strip proof, encrypted cache, offline/replacement/web policy convergence, or API-policy acceptance. | P01/#358 |
| 3 | Platform support and permission behavior | `partial` | Android manifest camera permission; iOS `Info.plist` and English purpose strings; `receipt_image_intake.dart`; intake/widget tests; PR #1169 preserved native purpose text | Android/iOS provider gating and bounded camera/photo denial copy exist; manual entry stays available. | No share extension/intent filter, complete limited-library/settings recovery, or real Android/iOS permission/device matrix. | P01/#358 |
| 4 | On-device OCR provider selection | `implemented` | `pubspec.yaml`/lock; `mlkit_receipt_ocr_provider.dart`; `app_bootstrap.dart`; provider/parser tests; decision and #436 plans; seam PRs #104/#105 and concrete runtime PR #108 | Authenticated app bootstrap injects `MlKitReceiptOcrProvider`; Android/iOS use ML Kit behind `ReceiptOcrProvider`; tests may inject fake/unsupported providers; recognized text is parsed without routine logging. | No provider-selection gap. Native packaging and device acceptance remain separate rows. | E01/closed #436 |
| 5 | ML Kit native dependency/model/build behavior | `implemented` | `google_mlkit_text_recognition` 0.15.1 and commons 0.11.1; plugin Android `implementation` Latin plus `compileOnly` optional scripts; PR #1212 exact dependency, archive, mapping, size and build evidence | Latin remains the sole Settleora script selection. Debug and release runtime classpaths contain `com.google.mlkit:text-recognition:16.0.1` plus bundled common/model inputs, with no optional script recognizer artifacts. Eight exact R8 warnings cover only unreachable compile-only bridge arms. | Physical-device OCR and any future non-Latin provider/model decision remain outside this compile/package result. | P02/#1209 completed |
| 6 | Android debug build | `implemented` | Android project plus release-readiness audit B08; root mobile validation/debug artifact history including #1169/#1202 | Debug APK compiles and provides a native test artifact. | Debug is not minified, signed for production, store-ready, or device OCR acceptance. R01 must preserve it as regression evidence. | E02/R01 regression |
| 7 | Android release APK | `implemented` | PR #1212 exact source; `flutter build apk --release`; R8 mapping and archive inspection | `minifyReleaseWithR8` passes; release APK is 96,920,419 bytes, SHA-256 `1354cc0881fe6e14daf5287e8102b209e8b0e9306f48a1239c6675ed1fd8db8d`, with bundled Latin model/native pipeline evidence. | Still debug-signed with placeholder identity; no device/store acceptance. | P02/#1209 completed |
| 8 | Android release AAB | `implemented` | PR #1212 exact source; `flutter build appbundle --release`; archive inspection | Minification passes; release AAB is 77,132,675 bytes, SHA-256 `26cf964589a38e645337a4f0efa8e17639930b99952452d491c9feae00cf1444`, with the intended Latin contents and no optional-script expansion. | Still debug-signed with placeholder identity; no upload/device/store acceptance. | P02/#1209 completed |
| 9 | iOS simulator/native compile | `implemented` | iOS project/Podfile; GitHub hosted-macOS `mobile-ios-validation`; #1185/#1192/#1201 and PR #1202 exact-head simulator evidence | Current mobile source has passed `flutter build ios --debug --simulator` with CocoaPods on hosted macOS. | Simulator compile is not a signed archive, physical-camera/OCR test, offline-model proof, or store acceptance. | E03/#1201 evidence |
| 10 | Physical-device OCR acceptance | `externally-gated` | Native validation plan and #975 acceptance contract; no current bound device artifact | Safe expected path is capture/import, local OCR, edit, manual fallback, save, preview, and explicit apply. | Android/iOS device OCR, camera/photo permission, crash/log redaction, fresh-install and offline matrices are not run on final artifacts. | P12/#975 |
| 11 | Offline behavior/model availability | `partial` | App bootstrap/local-mode/server-shell routing; ML Kit provider uses no Settleora server call; artifact cache reports `secure_receipt_cache_deferred`; #437 plan; completed #1209 packaged-model proof | A user already inside the authenticated shell retains the injected device-side provider after connectivity loss, so local extraction remains reachable in that warm session. Local Mode has no bill/OCR route, and an offline/server-unavailable cold path cannot bootstrap into the authenticated OCR shell; durable local review/queue behavior is absent. The bundled Latin model/package set is statically proven. | Docs-only audit #971 must reconcile and split cold-start/local-mode reachability, persistence, queue and conflict behavior into approved focused implementation owners; it must not implement those gaps itself. #975 and its children own final device/offline evidence. | P09/#971 reconciliation and its approved children |
| 12 | Unsupported provider/platform state | `partial` | `unsupported_receipt_ocr_provider.dart`; platform check in ML Kit provider; parser/provider and bill widget tests | Unsupported platform/provider returns bounded text and preserves manual entry; tests can inject the fallback. | Material unsupported-state UX, recovery choices, provider availability/readiness, and visual/device acceptance remain incomplete. | P03/#438 |
| 13 | Extraction failure and retry | `partial` | ML Kit provider failure categories; `_runReceiptOcrPreview` personal/group paths; widget/parser tests | Missing path, unreadable output, native exception, stale attachment callback, and selection failure do not apply bill data; manual editing remains. | Capture-stage OCR has no complete explicit retry/reselect/offline state matrix or approved visual evidence. Saved-review network retry does not close native extraction retry. | P03/#438 |
| 14 | Manual-entry fallback | `partial` | Personal/group create forms and bounded failure copy in intake/provider paths; `bill_list_screen_test.dart` | Bill fields remain editable and users can continue when intake/OCR fails; no OCR result automatically overwrites them. | Every blocked/unsupported/permission/offline state is not yet proven to offer clear, accessible manual entry without data loss. | P03/#438 |
| 15 | Parser merchant/date/currency/subtotal/service/total/items | `partial` | `receipt_ocr_parser.dart`, preview model and 676-line exact-base focused test file; PRs #112/#113/#118/#239/#470 | English/Japanese labels, explicit/fallback currency, dates, traceable priced lines, totals and warnings produce editable strings; unsafe/noisy metadata is filtered. | Current main lacks the exact #959 HK parser fixture completion. #967 must reconcile and split the broader Day 1 quantity/unit-price, tax/discount/refund/tender, merge/split/reclassification and source-line correction semantics without expanding #959's two-file contract. | P11/#967 |
| 16 | Multilingual/ordinary receipt quality (#740/#959) | `blocked` | #740's privacy-bounded observed HK receipt outcome; #959 exact two-file parser contract; preserved candidate `92b60cec...` is not in main; current parser tests lack that fixture; provider selects `TextRecognitionScript.latin` | Some CJK text is retained when supplied to the parser and Japanese total labels exist, but the known HK ordinary-receipt outcome is not source-complete. The shipped provider is Latin-script, so parser hardening alone cannot prove Chinese image recognition. Manual correction remains the only safe recovery. | #959's preserved parser chain must converge without replay/mutation. #740 then owns broader provider-script/model, ordinary-receipt and #438 fallback acceptance; any extra native language model requires explicit size/offline/build approval and a focused split. | P10/#740 |
| 17 | Review/edit/save/delete | `implemented` | `receipt_ocr_review/**`, bill saved-review sheet, generated repository, API `ReceiptOcrReviewEndpoints.cs`; mobile/API tests; PRs #118/#119/#122 and later continuity/accessibility PRs | Personal/group candidates are editable; local edits survive save failure; saved provisional reviews can be read, corrected, refreshed and removed without deleting attachment/bill items. | No gap in the bounded existing review resource; #967 owns reconciliation/splitting of advanced Day 1 line classification/merge/split semantics rather than hiding them in this bounded status. | E04/#357 evidence |
| 18 | Queue/discovery/search | `implemented` | Mobile queue/detail content/screens/repository; API personal/group queue endpoints; mobile/API tests; discovery/search PRs #48/#128/#129/#1141 | Authorized saved reviews can be listed, filtered/opened and returned to; empty/error/retry states avoid raw OCR/file details. | Final composed device/accessibility evidence remains for #975 to reconcile into focused acceptance owners, but the bounded queue capability is implemented. | E04/#357 evidence |
| 19 | Duplicate warnings | `partial` | `bill_duplicate_warning.dart` and test; create-flow widget tests; PR #115; live #401 | Conservative loaded-list match uses merchant/date/currency/exact grand total, warns without blocking, and can review an accessible candidate or save anyway. | Personal/group, archived/inaccessible, saved-review/non-OCR, loaded-list limitation, cross-device/server and web parity require #401 reconciliation; no automatic merge/delete/rewrite is allowed. | P05/#401 |
| 20 | Draft apply | `implemented` | API preview/apply endpoints/domain tests; generated repository; mobile explicit preview/confirmation/apply tests; apply policy; PRs #123/#124 | Saved review is revalidated server-side; only `replace_draft_ocr_items` in safe draft shapes is explicit; manual items and downstream financial/storage authority are protected; failure keeps review/manual editing. | Richer merge/append/partial modes are not credited and do not reduce this bounded implemented status. | E05/#357 evidence |
| 21 | Non-draft revision routing/apply | `partial` | Revision policy/runtime #440/#441/#525-#528 and PR #532; bill revision mobile surfaces/tests; #360/#442 | API routes non-draft OCR changes through revision proposal policy rather than direct bill rewrite; revision review/apply remains server-authoritative. | OCR-specific mobile/web preview, confirmation, blocked/affected-user messaging and approved visual flow remain #442. | P06/#442 |
| 22 | File/storage/privacy boundary | `partial` | Bill attachment API/domain, storage abstraction, authz/redaction tests; mobile normalized in-memory artifacts; #254/#255/#492; #966 | Receipt bytes use purpose-scoped authorized attachment routes; review rows are bounded; normal UI/log evidence omits raw OCR, bytes, object keys and paths. | #966 must reconcile full receipt lifecycle, normalization enforcement, retention/cache/vault policy, replacement/web/offline routes and final privacy evidence. | P07/#966 |
| 23 | Server OCR complement boundary | `documentation-only` | `OCR_ARCHITECTURE.md`; `services/worker-ocr/README.md`; no worker OCR engine/job runtime | Architecture preserves worker-as-complement, provisional results and API acceptance; mobile does not depend on it. | #357 is the live owner until it approves one focused `OCR-D1-SERVER-001` child. Split only after required on-device and storage dependencies; the worker must not replace mobile OCR. | P08/#357 |
| 24 | Sync/retry/idempotency/authoritative server acceptance | `partial` | Online generated OCR review repository/API; assignment idempotency; mobile bill queue exists for other bounded operations; #361/#971/#1060 | Online server-mode save/preview/apply reauthorizes and validates; saved-review failure preserves local edits and retry; server acceptance is never inferred from local UI. | OCR capture/review has no durable offline queue, broad idempotency key, conflict resolution or accepted/rejected replay state; local-only persistence is also incomplete. | P09/#971 |
| 25 | Final Day 1 platform/UI/privacy acceptance | `externally-gated` | Docs-only #975 readiness-audit contract, native plan, current automated widget/API/build evidence including completed R01 | Current automated evidence supplies inputs but not final sign-off; #975 itself neither runs product acceptance nor grants human approval. | Before actual acceptance, consume completed R01 evidence and complete #358/#401/#438/#740/#959/#442/#966, #967 and every focused runtime child it creates/adopts, #971 and every focused runtime child it creates/adopts, #357's server-complement child/disposition, and every focused acceptance owner identified by #975. Those owners must bind exact final artifacts to physical-device, accessibility, visual, privacy and human-gate evidence. | P12/#975 reconciliation and its approved acceptance owners |

## 4. Exact Android release-build evidence

The original bounded read-only build from the audit baseline ran:

```text
cd apps/mobile
PATH=/opt/flutter/bin:$PATH /opt/flutter/bin/flutter build apk --release
```

It exited 1 after 57.8 seconds. Gradle failed at
`:app:minifyReleaseWithR8`. R8 named the `Builder` and option classes for
Chinese, Devanagari, Japanese, and Korean text recognizers. The generated
`build/app/outputs/mapping/release/missing_rules.txt` proposed eight matching
`-dontwarn` rules. Focused dependency readback showed
`com.google.mlkit:text-recognition:16.0.1` and
`text-recognition-bundled-common:17.0.0` on `releaseRuntimeClasspath`, with no
four optional script artifacts.

The plugin bridge imports and switches across all recognizer option classes,
while its Android build declares Latin as `implementation` and the other four
as `compileOnly`. Settleora calls only `TextRecognitionScript.latin`. This is
enough to assign the problem to OCR/native-build dependency closure; it is not
enough to identify the seam. #1209 then reconciled the resolved plugin source,
debug/release runtime graphs, dependency insight, R8 output, and actual archives.
It rejected an unrelated package update and adding all optional models. The
final rule set names exactly the eight absent optional option/Builder types;
there is no wildcard or blanket shrinker suppression.

On exact source `2d7ceac310433870aef9bdf4ed93f84feec9dac3`, mobile doctor and
`validate:mobile` passed (1,059 tests), as did clean debug APK, minified release
APK, and minified release AAB builds. The debug APK is 193,739,763 bytes,
SHA-256 `c4fdaba07e1d7c82deba813b31d2f26a5c798483e8e76b042af7416a289a93c4`;
release hashes/sizes are recorded in rows 7 and 8. APK/AAB inspection found the
Latin `Latn_ctc` model assets and ML Kit OCR pipeline native libraries. Runtime
resolution remained `com.google.mlkit:text-recognition:16.0.1` and
`text-recognition-bundled-common:17.0.0`; no Chinese, Devanagari, Japanese, or
Korean recognizer artifact was resolved. Therefore the tracked fix has no model
or dependency-size delta and does not change first-use/offline Latin behavior.
Static packaging is not physical-device acceptance. All outputs still use debug
signing and `com.example.mobile` until R07.

## 5. Ownership, path, validation, review, gates, dependencies, and close rules

| Packet | One owner or evidence authority | Canonical lane and path envelope | Validation and reviewer tier | Gates, dependency order, and close rule |
| --- | --- | --- | --- | --- |
| P01 | #358, consuming #966 storage policy | `mobile-application` plus separately gated `storage-file-privacy-authz`; prefer `apps/mobile/lib/receipt_ocr_capture/**`, bounded bill intake/upload seams/tests, and only proven native permission/entry files | Full `mobile`, focused intake/artifact/upload/widget tests; `strong_independent` for file/privacy plus mobile mechanics | Figma/reference and storage/file/privacy manual gate before material UI/byte-policy work. Split capture/share/offline/platform work rather than one broad PR. Close #358 only when camera, photo, file, share, offline, web/replacement policy coverage and normalization/permission/device evidence prevent OCR and every upload/storage bypass, including normalization failure, existing-bill upload and supporting-to-receipt purpose change. |
| P02 | #1209 R01 | `mobile-build-config`; prefer `apps/mobile/android/**`, with `pubspec.yaml`/lock only if proven | Root classifier/docs/scaffold policy checks, full mobile, Gradle debug/release classpaths, debug/release APK, release AAB, R8, package/model/size/offline inspection, Linux mobile and hosted iOS; `strong_independent` plus Android/Gradle/R8 review | After #970; before R03 Android entry and R07 signing/identity. Provider replacement, language/model size decision, signing, identity and store action are manual stops. Close only on unchanged exact-head merge/evidence and explicit “compiles is not store-ready” statement. |
| P03 | #438 | `mobile-application`; capture/provider state rendering and focused bill/provider tests only | `mobile-ui` plus focused unsupported/failure/retry/manual-entry tests; fresh independent review | Figma/reference required. After stable intake/provider result contracts; before final #359/#975 acceptance. Close only when every unsupported/failure/offline/retry state preserves work and exposes accessible retry/manual entry with reviewed visuals and device evidence. |
| P04 | #959 | `mobile-application`; exactly its preserved parser/test contract unless separately re-approved | Full mobile plus focused parser fixture; `cheap_independent` and parser/privacy review | Existing preserved auto-runner recovery authority is an operational gate. Independent of R01; no native dependency/build paths. Close only through its own exact implementation/recovery/merge rule; then #740 rechecks broader quality. |
| P05 | #401 | `mobile-application` first; server/cross-device policy must split to API/OpenAPI/UI lanes | Full mobile and focused duplicate/widget/accessibility tests; `strong_independent` if server or money policy enters | #967/#970 reconciliation and Figma/manual money gate for wider policy. Close only with explicit personal/group/accessibility/inaccessible behavior and no blocking/merge/delete/rewrite authority. |
| P06 | #442 under #360 | `mobile-application` and later `web-user-ui`; do not combine API/domain changes already completed | Platform-focused UI tests and branch-rendered evidence; `strong_independent` for money/revision consequences | Figma and financial/manual gate. Depends on completed #440/#441/#525-#528. Close only when OCR-specific revision preview/confirmation/blocked/affected-user UX is approved, implemented and validated without client-computed financial truth. |
| P07 | #966 | `storage-file-privacy-authz`; audit first, then separately scoped API/mobile/web/storage children | `api-storage`/client profile as changed; `strong_independent` | Storage/privacy/provider/encryption/retention/destructive behavior is manual-gated. Close #966 only under its own audit rule; no receipt byte or raw OCR evidence in reports. |
| P08 | #357 until it approves recommended `OCR-D1-SERVER-001` | `worker-ocr` plus separate API/event contract lane; `services/worker-ocr/**` only until an explicit API/event child is approved | Worker tests, API/event validation if separately scoped, privacy/idempotency review; `strong_independent` | After R01/on-device viability and #966; product/provider/model/deployment decisions manual-gated. #357 may close this packet only through a focused child or an explicit Day 1 scope decision. The implementation closes only with provisional job/result, retry/idempotency, API acceptance, safe logging and proof mobile still works without server OCR. |
| P09 | Docs-only audit #971 owns reconciliation and creation/adoption of focused implementation children; #1060 participates only if its cross-domain idempotency framework is adopted | #971 remains `sync-import-export-restore` documentation only; it must split local-mode/offline OCR reachability and mobile persistence/queue from API acceptance/contracts into separately approved lanes and path envelopes | #971 closes on evidence-backed ownership contracts. Each child uses audit-defined cold-start/local-mode/offline mobile plus API/sync tests and `strong_independent` review as its lane requires. | R01 supplies package/model facts first. Local-security, conflict, restore, schema/contract and destructive decisions retain manual gates. #971 closes only after assigning every OCR gap to a focused owner with dependency and close rules. Resulting children—not #971—close runtime work only with reachable Local Mode and offline/server-unavailable capture/review, durable queued/synced/conflict/failed states, preserved edits, replay/idempotency and authoritative server acceptance evidence. |
| P10 | #740, with #959 as its exact parser dependency and #438 as fallback UX owner | `mobile-build-config` for any script/model decision, then `mobile-application` for ordinary-receipt acceptance; never hide both in #959 | Focused real/fake recognizer and parser fixtures, full mobile, native package/size/offline/device evidence; `strong_independent` plus Android/iOS OCR mechanics review | Extra language models, provider configuration/replacement, app-size/offline tradeoffs and visible fallback changes retain explicit decision/Figma gates. After #959, R01 and #438 as applicable. Close #740 only when the ordinary HK target is proven from supported image recognition through editable review, or its remaining provider/fallback gaps have one separately approved focused owner; parser-only success is insufficient. |
| P11 | #967, consuming #959's exact parser fixture rather than widening it | `money-settlement-payment` audit first; split parser extraction, mobile review UI, and API/domain correction semantics into separate approved lanes | `api-money` audit profile, then lane-specific parser/mobile/API validation; `strong_independent` | Financial/reclassification semantics and any API/schema/client expansion retain manual gates. Close the OCR correction slice only when #967 assigns each Day 1 quantity/unit-price, tax/discount/refund/tender, merge/split/reclassification and source-line gap to one focused owner with authority-safe tests and close rules. |
| P12 | Docs-only readiness audit #975 owns reconciliation and creation/adoption of focused acceptance owners | #975 remains `qa-acceptance` documentation only with no product mutation; resulting owners receive separately approved artifact/device/platform/UI/privacy lanes | #975 closes on a source-bound evidence and ownership map. Resulting owners bind exact final artifacts to Android/iOS physical-device, offline/permission/accessibility/visual/privacy/manual matrices and independent acceptance review. | Depends on every non-complete Day 1 owner, including every child produced by #967 and #971 and #357's server-complement child/disposition. Human/device/provider gates remain. #975 does not grant final sign-off itself; its resulting owners and explicitly authorized humans close their own evidence/acceptance gates. |
| E01 | Closed #436 is decision/provider evidence; PRs #104/#105 provide the seam and PR #108 provides the concrete runtime | Existing provider/app bootstrap paths; no new work | Existing parser/provider/widget/mobile tests | Do not reopen #436 or infer native release closure from it. |
| E02 | R01 regression evidence | Android debug build inputs | Debug APK plus full mobile | Preserve debug while fixing release; debug alone never closes R01. |
| E03 | #1201/#1185 hosted iOS evidence | Existing iOS/native build paths | Hosted macOS simulator compile | Do not infer signed/device/store acceptance. |
| E04 | #357 evidence steward; current mobile/API review runtime | Existing review/API/generated-client paths | Focused mobile/API plus full owning profiles | Advanced correction semantics remain with parser/bills owners; final acceptance remains #975. |
| E05 | #357 evidence steward; current draft apply runtime | Existing API/generated/mobile apply paths | Focused API/mobile authority tests | Never widen to non-draft direct rewrite; #442 owns the remaining revision UI. |

## 6. R01 duplicate search and adoption decision

Live searches covered open/closed issues and recent PRs for `R8`,
`minifyReleaseWithR8`, `release APK`, `release AAB`, missing ML Kit classes, and
Android OCR release builds, plus the complete named issue graph.

- #437 is closed planning/documentation. Its body forbade dependency additions
  and native fixes, and its merged PR #550 added only documentation.
- #959 is an exact parser/test task. Its body forbids OCR provider/native build
  changes, and its preserved candidate is not in main.
- #358 owns intake/normalization, not release dependency closure.
- #438 owns visible unsupported/failure/retry/offline/manual-entry behavior.
- #740 is a parser/quality defect tracker.
- #380/#974 discovered and classified R01 but did not create an implementation
  owner; the release audit explicitly depends on #970 adoption/split.

No exact focused owner existed, so option B was taken exactly once: #1209 was
created. Its estimate is `M = 2 MD`, independent of #970's `S = 1 MD`; it has
`area:ocr`, `type:task`, and `scope:day1`, and deliberately has no
`auto-ready`. The issue preserves Latin/on-device OCR, does not guess the fix,
and requires package/model/size/offline evidence before close.

## 7. Parent and related issue reconciliation

- **#357:** keep open. It remains the overall receipt-workflow owner until all
  capture/extraction/review/fallback/apply/privacy/sync/acceptance gaps close.
  It specifically owns the server OCR complement until a focused child is
  approved or an explicit Day 1 scope decision changes that requirement.
- **#358:** keep open; current camera/gallery/file and normalization work is
  credited, while share/offline/web/replacement/complete-normalization and
  device permission coverage remain.
- **#359:** keep open. Provider integration is implemented, #437/#439 are
  planning evidence only, completed R01/#1209 supplies native release closure,
  #959 owns its parser chain, and #438 owns failure/recovery UX.
- **#360:** keep open; completed server revision routing is credited and #442
  remains the OCR-specific client/visual gate.
- **#438:** keep open at its Figma/reference gate.
- **#442:** keep open at its Figma/financial consequence gate.
- **#740:** keep open as broader ordinary-receipt quality/acceptance tracker,
  including the Latin-provider versus Chinese-image recognition gap after the
  #959 parser slice; do not duplicate #959's implementation or #438's fallback
  UX, and split any native model decision explicitly.
- **#959:** keep open and untouched. Current main does not satisfy its exact HK
  fixture, and source absence does not authorize replay of its preserved chain.
- **#966:** keep open; consume its future storage/privacy audit rather than
  inventing byte/cache/vault policy here.
- **#967:** keep open; it must reconcile and split the broader Day 1 OCR line
  correction semantics without widening #959's exact parser contract.
- **#970:** closed after its audit/ledger merge, #1209 creation, and parent/owner
  linkage; do not replay it.
- **#380:** keep open; completed R01/#1209 may now supply Android evidence to a
  separately selected R03. R07 still owns identity/signing/store readiness.
- **#975:** keep open and consume this map only after domain owners complete;
  no final acceptance is inferred here.

## 8. Corrected stale claims and deferred scope

Current source supersedes old text in `README.md`, `OCR_ARCHITECTURE.md`, the
mobile decision, and review UX docs that says mobile capture/extraction, a real
provider, thumbnail generation, or non-draft routing does not exist. Those docs
remain useful authority/planning history but are not the current capability
inventory. Conversely, closed #436/#437/#439 do not prove runtime provider,
release build, or parser quality by their planning status; implementation is
credited only from current source/tests and merged runtime PRs.

Explicit later-day/non-goal scope remains outside this audit's 25 Day 1 rows:
automatic OCR-to-bill finalization; silent client/worker financial authority;
strict private vault runtime; AI categorization/reporting; full statement OCR;
provider replacement without a new evidence decision; extra native language
models without size/offline approval; and server batch/high-confidence OCR
beyond the bounded complementary Day 1 handoff. Day 1 English UI does not make
receipt recognition/parsing English-only; #740/#959 remains a Day 1 quality
gate.

## 9. Dependency-safe execution order

1. Completed #970 supplied issue/parent/owner reconciliation.
2. Completed R01/#1209 supplied the Android release compile/package entry
   independently of #959 and did not mutate it.
3. If separately selected, R03 may combine completed R02 web package evidence
   with the completed R01 Android release entry. R07 later owns application
   identity/signing/store artifacts.
4. In parallel after their own gates: #358 intake/normalization split, #401
   duplicate-warning reconciliation, #438 visual fallback/retry, preserved
   #959 parser recovery, #442 revision UX, #966 storage/privacy audit, #967
   broader correction-semantics audit, and #971 Local Mode/offline/sync audit.
5. Reconcile #740 after #959 and #438. #357 must approve the focused server OCR
   child or record an explicit Day 1 scope decision after on-device/storage
   boundaries are stable; mobile must still work without the server worker.
6. Docs-only #975 reconciles exact final artifacts and completed domain maps,
   then creates or adopts focused owners for physical-device/platform/UI/privacy
   evidence and the explicitly authorized human sign-off. Actual acceptance waits
   for every runtime child produced by #967 and #971 and every acceptance owner
   produced by #975; none of those audits performs runtime acceptance or grants
   sign-off itself.

Autonomous queue activation is disabled. This map names the next task but does
not start, claim, label, or resume it.
