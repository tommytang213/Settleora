# Issue Progress Ledger

### Issue #407 — Day 1 mobile screen completeness audit (2026-09-06)

- Audit baseline: `2b7e39d24cf39b4900d7f0bce0b1da36c0b8467f` on `main`.
  Issue #407 is open while this docs/control candidate awaits exact-head
  validation, fresh Gemini `strong_independent`, local Codex, GitHub review/checks
  and merge. No runtime/UI implementation or manual Day 1 acceptance is claimed.
- Durable inventory:
  [Day 1 mobile screen completeness checklist](../qa/DAY1_MOBILE_SCREEN_COMPLETENESS_CHECKLIST.md).
  **61 canonical rows: complete 2, partial 39, missing 10, blocked 10.** Counts
  include the shared-component and cross-screen acceptance flows; a completed
  bounded password-reset request or notification handoff does not complete auth
  or notification product scope.
- New focused owners after open/closed issue and source/test duplicate checks:
  [#1092 bundled What’s New](https://github.com/tommytang213/Settleora/issues/1092),
  [#1093 contextual static screen help](https://github.com/tommytang213/Settleora/issues/1093),
  [#1094 server-announcement authority/contract handoff](https://github.com/tommytang213/Settleora/issues/1094).
  All other remaining gaps reuse the checklist's single owner per gap; audit
  owners reconcile and split before runtime admission, not broad automatic coding.
- Smallest next waves: W1 existing #959 parser fix separately from #301
  equivalent component adoption, #299 metric actionability and #295 lightweight
  shortcuts; then local version notes/help. W2 #977-backed report/group-summary
  work, #412 mode reference and #1094 announcement design. W3 auth/security,
  vault/privacy and push-provider gates stay separate. W4 #967/#970/#969/#972/
  #976/#971 domain reconciliations precede separately scoped money, OCR, proof,
  recurring, relationship, offline and portability changes. W5 #975 coordinates
  final state/accessibility/visual/platform acceptance, with release proof #974.
- #301/#372 reconciliation: money/date selectors, reusable rows, state panels,
  sheets/dialogs and focused accessibility primitives already exist. #672/#679,
  #371 and #865/#866 completion evidence must not be recreated. Open umbrellas
  are not proof of missing work. The old light-only, missing shared-sheet and
  missing group/recurring-create descriptions are superseded by current source.
  #301 remains open for demonstrated adoption/consistency gaps; #372 stays open
  for the full product and acceptance close rule.
- GitHub review reconciliation: receipt normalization is already wired for personal/group
  create-form camera/gallery/file upload intake; saved-detail uploads bypass it,
  while native OCR still reads the original path. Production notification restore
  is unavailable despite the optional fake-tested UI seam.
  Fresh setup lacks server reachability/capability feedback; #967 owns missing
  category and whole-bill/shared-note metadata, distinct from existing item notes.
  M56 assigns remaining persisted notification preferences to #973 after completed
  #370/#561 API foundations; #634 retains OS push registration only. Settlement
  notes remain #355 domain-gated work. Day 2 autopay/theme and previously optional
  #772/#774 mobile surfaces are excluded from counts. #405 owns advanced search
  through #977; #404 owns reconciliation status. Role-aware group actions remain
  #720. Recurring notification handoffs and CSV/backup server foundations exist;
  mobile wiring and failed-normalization safety are explicitly distinguished.
- Further API/source reconciliation credits group lifecycle/reconciliation, self QR,
  bounded server bill filters and #367 due-soon runtime. M58 explicitly inventories
  missing financial-component/multi-tax/receipt-total controls under open #967;
  #351 stays closed for its completed planning/validation children. Personal payment
  method wiring, channel preferences and authorized recurring group selection are
  also explicit existing-owner gaps; no new API implementation is inferred.
- Final coverage split: M59 counterparty QR content belongs #966, separately from
  #356 proof; proof/QR/supporting-image purpose-specific normalization is explicit.
  M60 credits existing event producers and leaves producer gaps with #369 through
  #973 reconciliation. M61 counts localization readiness under sole owner #409;
  English-only Day 1 remains allowed, Traditional Chinese remains Day 2.
- Additional lifecycle/notification reconciliation: M62 owns cross-record lifecycle
  gaps under #716; closed #410 is superseded, and merged #715 guardrails are
  credited. #960/domain policies/#961 and #722/#723/#724 precede runtime.
  M63 assigns future required notification route extensions to #973 while
  #371's accepted current-family scope remains complete. M56 explicitly records
  the current unconditional sync/security-family preference bypass and its
  unresolved policy/persistence acceptance under #973. No runtime changed.
- Additional requirement precision: M08/#776 includes existing MFA-policy readout
  wiring, disabled/required/noncompliant states and existing-factor/recovery/step-up
  lifecycle management; M15/#350 includes missing
  server-resolved item split/rounding-residual presentation, crediting its API.
  M26/#976 includes unfriend/future-sharing revocation with preserved history;
  M45/#412 includes feasible limited advanced-area opt-ins. SMTP delivery is a
  separate #403-owned server/provider dependency, excluded from mobile destination
  counts; closed #632 sender foundations are credited, activation remains gated.
- Exact #407 close recommendation: close only after checklist plus ledger merge,
  exact-head validation/reviews/checks are recorded, #372 receives the current
  gap/wave summary, and every genuine gap is linked without duplication. Until
  then keep #407 open. Do not close #372 or #301 merely because this audit merges.
- Task report:
  `/workspace/logs/settleora-codex-report-20260906-2230-issue-407-day1-mobile-screen-completeness-audit.md`.
  Post-merge source/merge/check/review/Project evidence belongs in that report
  and issue comments; this candidate does not pre-claim merge or acceptance.
- Scope: documentation/control only. No API/domain, auth/session/authz, money,
  file privacy, schema, OpenAPI/generated-client, OCR/sync runtime, deployment,
  secret or mobile UI behavior change.

### Issue #1087 — CodeQL optimization abandoned; default setup retained (2026-09-06)

- Owner decision [5559641879](https://github.com/tommytang213/Settleora/issues/1087#issuecomment-5559641879)
  abandons the docs-only CodeQL optimization as not planned: ongoing
  security/control complexity outweighs the small CI-time saving. No docs-only
  CodeQL skip is implemented or claimed. The pending protected configuration-read
  authentication channel and integration-enforcement repair are not continued
  solely for #1087.
- Cleanup PR #1090 merged normally from source
  `815e2487ffe73b876a29307f4ca0378d6a42130d` as
  `72b179dd04f1d6e9c4742bee59b400b4de4da68d`. It exactly reversed merged
  #1089's five-file repository effect: deleted the protected-auditor workflow,
  helper and test; restored the Scaffold workflow and validation budget document
  byte-for-byte to pre-#1089 parent `2dff505c473f122333efbe0388188ee88d931566`.
  Cleanup main's entire tree matches that parent. No protected-auditor or advanced
  CodeQL analyzer/controller remains on main.
- #1084 remains completed and retained. Issue #1084 is CLOSED/completed and its
  hygiene PR #1086 merged as `2dff505c473f122333efbe0388188ee88d931566`.
  The Scaffold workflow, classifier helper and 33-test regression suite match
  accepted #1084 source `113a331347cbd9b6744f8480b21d1e99e3e4c6fd` exactly.
  The earlier #1084 entry below is its historical pre-merge checkpoint.
- Final scanner posture is GitHub CodeQL default setup: real Actions, C/C++, C#,
  JavaScript/TypeScript and Python scanning; default queries, `remote_and_local`,
  weekly schedule and standard runner. No default-setup settings were changed in
  this cleanup. Exact cleanup-source run `34037550235` and fresh cleanup-main
  [run 34038312630](https://github.com/tommytang213/Settleora/actions/runs/34038312630)
  passed all five analyses, with processed records and no errors/warnings.
  Relevant open code-scanning alert inventories were empty. Docs-only hygiene
  may still receive full default CodeQL scanning; that is intended behavior.
- Cleanup local validation passed all 11 commands, including docs/scaffold,
  validation and Docker doctors, Compose, workflow YAML parsing, syntax and all
  33 classifier tests. Fresh exact-source Gemini `strong_independent`, independent
  local Codex mechanics/CI/security and GitHub Codex reviews passed without
  actionable findings. Both full Scaffold runs, CodeQL, Semgrep and Trivy passed.
  The sole exception was the owner-approved legacy `Audit CodeQL definition`
  failure in run `34037551397`, job `101498278023`, executing old protected main
  `2f00113f603314f7342e12ad0eb4ee038d36811b`. Actual logs and independent
  production-function reproduction proved the expected absent advanced analyzer
  error, `Required authority is not a regular Git file`. This failure is not a
  pass; no other check, scanner or review finding was waived.
- Retained PR #1088 is CLOSED and unmerged at unchanged source
  `f5eedc9d2e13a6bf78bbb45c00b42bfc9ea4ebef`. Its unresolved integration-authority
  P1 thread `PRRT_kwDOSNHStc6frYwW` remains unresolved and unwaived: the proposal
  is abandoned, not accepted. Its branch is retained.
- Issue #1087 remains OPEN at this pre-merge hygiene checkpoint. Close
  recommendation: `not planned` after this ledger-only hygiene PR passes fresh
  reviews/checks, merges normally and final-main default CodeQL health is proven.
  No linked Project item exists. Branch/worktree cleanup is intentionally not
  performed; all branches/worktrees are retained. No product/runtime/API/auth,
  storage/privacy, money, schema, OpenAPI/generated-client, deployment, secret,
  ruleset/protection or scanner-suppression change. No broader Day 1 completion
  is implied.
- Last verified main: `72b179dd04f1d6e9c4742bee59b400b4de4da68d`.
  Logical task `20260906-1710`, continuation `20260906-2147`; final closure and
  hygiene merge evidence belongs in the issue's final comment and report
  `settleora-codex-report-20260906-2147-issue-1087-abandon-codeql-docs-only-cleanup.md`
  under `/workspace/logs/`, with evidence in `/workspace/logs/issue-1087-20260906-2147/`.

### Issue #1084 and PR #1085 — proven docs-only first-push classifier (2026-09-06)

- Source PR #1085 merged by normal GitHub merge from base
  `3d223e5d694af3cced770a6f72c6f6188591696b`, exact head
  `113a331347cbd9b6744f8480b21d1e99e3e4c6fd` (tree
  `460319d917a30e083a2799e38624f2d16ff44f92`), as merge
  `af32371868a8a2355396136a9614441d17b17499`. Fetched main contains the
  source head and all four reviewed source files match exactly. Branch retained.
- Scope is `.github/workflows/scaffold-validation.yml`, the focused
  `tools/ci/scaffold-validation-changes.mjs` helper and its regression test,
  plus the explicitly owner-approved one-paragraph correction in
  `docs/workflow/CODEX_VALIDATION_REPORT_BUDGET.md`. Non-default-branch
  first pushes can take the docs path only with trusted current-main fetch,
  exact checkout, complete ancestry/merge-base and nonempty docs-only diff
  evidence. Non-doc or unprovable cases remain full. All six expensive gates,
  always-run foundation, required job name, permissions and scanners remain.
- Fresh exact-head local validation passed docs/scaffold, Docker doctor/Compose,
  syntax/YAML checks and all 33 deterministic classifier tests. Fresh Gemini
  `strong_independent`, local Codex mechanics/CI/security and GitHub Codex
  reviews passed. Both Scaffold checks, all five CodeQL analyses and aggregate
  CodeQL, Semgrep CE/OSS and Trivy passed. Policy thread
  `PRRT_kwDOSNHStc6fqWX3` was corrected and resolved with evidence; zero
  unresolved threads. Earlier CodeQL alert #122 is fixed, not dismissed.
- Natural ledger-only hygiene PR #1086 uses
  `docs/1084-first-push-acceptance-hygiene-20260906-1636`. Its first remote
  push at head `8ed7aa0e32238d132acb823a559713e6b162dd2a` passed
  [Scaffold run 34023304482](https://github.com/tommytang213/Settleora/actions/runs/34023304482),
  job `101459745419`. Actual classifier logs show `event=push`,
  `before=0000000000000000000000000000000000000000`,
  `reason=first_push_main_merge_base`, base
  `af32371868a8a2355396136a9614441d17b17499`, `docs_only=true`,
  `run_full_validation=false`, and only this ledger in changed paths.
- The same candidate's pull-request-triggered
  [Scaffold run 34023306615](https://github.com/tommytang213/Settleora/actions/runs/34023306615),
  job `101459751097`, also passed lightweight with `reason=pull_request_base`.
  Its checked-out synthetic merge SHA was
  `e6efe3088704ad3e83a0eef2805b45111bd0456b`; its source head was the first-push
  candidate above. Both actual jobs report Setup .NET, Validate OpenAPI,
  Validate generated clients, Validate API, Validate Docker Compose and
  Validate API Docker image as skipped. Checkout, Setup Node, classification,
  npm dependency installation, scaffold paths and all 33 classifier tests
  succeeded. These are observed run/job/log results, not inferred skips.
- #1084 is open at this pre-merge ledger checkpoint; the close recommendation
  is complete after PR #1086's final exact-head reviews/checks and normal merge,
  then current-main ancestry/content proof. Live acceptance is complete; final
  hygiene merge/closure evidence belongs in the issue completion comment and
  continuation report. No linked Project item exists. No product work, #959,
  DevCommand/runner state, deployment, secret/config, API, auth/security runtime,
  storage/privacy, money, schema, OpenAPI/generated-client or branch cleanup
  change. No broader Day 1 completion is implied.
- Last verified main: `af32371868a8a2355396136a9614441d17b17499`.
  Accepted logical task `20260906-1613`, approved continuation `20260906-1636`;
  detailed report: `settleora-codex-report-20260906-1636-issue-1084-policy-approved-continuation.md`
  under `/workspace/logs/`; exact validation/review evidence under
  `/workspace/logs/issue-1084-20260906-1636/`.

### Issue #866 and PR #1082 — sheet/dialog accessibility semantics completed (2026-09-06)

- PR #1082 merged by normal GitHub merge commit from base
  `f9c4c1d772e6abd2fbbd6aa9c04ee3eab6543a83` and exact source head
  `48fb7b56fb1866608252f0985f1c2753e9e11dfc` (tree
  `c545103c32dec542b3e546c7c3cd3bb845972360`) as merge
  `8680f17e5eaecd64af75ff0349415376084769ac`. Fetched main contains the source
  head and both reviewed product files match exactly. Source branch retained.
- Evidence-first tests proved the sheet already had one title header while
  the dialog had zero. The only production change adds a semantic header
  around the existing dialog title. Routed sheet/dialog tests prove exactly
  one title/header announcement, readable non-header subtitle/message/body,
  independently enabled tappable buttons in predictable traversal order, and
  both callbacks. Visible copy, layout, scrolling, keyboard inset handling,
  component APIs, and action behavior are unchanged.
- Product diff is restricted to `apps/mobile/lib/ui/settleora_components.dart`
  and `apps/mobile/test/ui/settleora_component_guardrail_test.dart`. Clean
  worktree and scope/diff checks, mobile doctor, Flutter dependency resolution,
  analysis, and all 43 component guardrail tests passed. Existing #865 key/value
  traversal/custom-widget actions and LoadingState live-region tests remain
  unchanged and pass.
- Fresh exact-head Gemini `strong_independent`, local Codex mechanics/security,
  and GitHub Codex reviews passed with no material findings. Validate scaffold,
  CodeQL and all five language analyses, Semgrep CE/OSS, and Trivy checks passed
  on the exact PR head. Review inventory had zero unresolved threads.
- #866 is closed complete. Completion evidence is recorded in its
  [issue checkpoint](https://github.com/tommytang213/Settleora/issues/866#issuecomment-5557860172).
  #301 and #372 received child-completion checkpoints and remain open for their
  independent component, screen, reference, and platform acceptance scope.
  #866 has no linked Project item. Parent Project status remains
  `Needs Figma / Reference`; #301 retains 5 initial/remaining MD, while #372
  has no numeric estimates in the readback. No broader completion is inferred.
- Last verified main: `8680f17e5eaecd64af75ff0349415376084769ac`. Task/report:
  `20260906-1531`, `.codex/last-report.md`; detailed local evidence under
  `.codex/issue-866-20260906-1531/`. No remaining gate for the implemented
  #866 semantics slice; broader manual reference/acceptance/release gates
  remain independent.
- No API/security/auth/storage/money/schema/OpenAPI/generated-client,
  deployment/environment/secret, DevCommand or autonomous-runner change.
  #959, #1048, #1049 and closed #800 were untouched.

### Issue #865 and PR #1080 — mobile key/value reading-order semantics completed (2026-09-06)

- PR #1080 merged by normal GitHub merge commit from exact source base
  `b542b18011e8809c69df6e56405c66ece17616ef` and exact source head
  `776eacdac412a1450d52b9113ffa135de44f8915` as merge
  `0afca9046835dc0b6956bcfeecec36da84091f16`. The implementation changed only
  `apps/mobile/lib/ui/settleora_components.dart` and
  `apps/mobile/test/ui/settleora_component_guardrail_test.dart`.
- `SettleoraKeyValueRow` now exposes stable label-then-value traversal while
  leaving custom interactive descendants independent. Plain text and money
  values are each announced once, including preservation of `MoneyText`'s
  existing single semantic value. Visible layout, displayed values, callbacks,
  component APIs, and product behavior are unchanged.
- Exact-head validation passed Flutter dependency resolution, static analysis,
  and all 41 shared component guardrail tests, including the existing
  `LoadingState` live-region coverage and focused plain-text, custom-widget,
  and money semantics cases. Fresh independent Gemini and local Codex reviews
  found no material findings; exact-head GitHub Codex found no major issues.
  All required Scaffold Validation, CodeQL, Semgrep, and Trivy checks passed,
  with zero unresolved review threads.
- Issue #865 closed through PR #1080. Parent issues #301 and #372 remain open;
  historical auto-runner foundation issue #800 is closed. Issue #866 remains
  open as a separate accessibility slice: current source does not yet include
  focused proof of the dialog's exactly-once header semantics or sheet/dialog
  multi-action ordering, so no duplicate-completion closure was made.
- No non-presentation runtime, API, auth/session/security, storage/privacy,
  money/settlement, schema/migration, OpenAPI/generated-client,
  deployment/environment, secret, DevCommand, or autonomous-runner change
  occurred.

### Issue #1012 and PR #1046 — manual-root handoff source repair merged (2026-08-05)

- PR #1046, `fix(auto-runner): repair Issue #1012 manual-root handoff`,
  repaired the failed manual-root installation handoff while preserving the
  one-shot privilege boundary, readback-only recovery, bounded diagnostics,
  no-clobber publication, and fail-closed state transitions. It merged once by
  normal GitHub merge commit from exact source base
  `70e072a425a5dad7f51fe77a8be00479380f4c00`, exact source head
  `b0b9c59ef042fbd93d564c60611256e734d56dee`, and exact source tree
  `c3b1b63153eba2151569f40b61caa89af8b41ef9` as merge
  `75f1ecc791291d1ad7dc40a0058d69db5a3a3d53`. Its ordered parents are
  the exact source base and head, with no third parent, and its merge tree is
  the exact source tree.
- The exact source candidate retained raw base-to-head binary diff SHA-256
  `47c2fd2493f1defff3afd6da8b469527f8ca65fb164d6ee3913b5ab48d9b363e`
  and sorted changed-path manifest SHA-256
  `37fdc7af9ee38c66c34da0d8e6578a79646b2023e397b532107efaeb5d95ef26`.
  It changed exactly 12 paths with 1,001 additions and 351 deletions:
  `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md`, `tools/auto-runner/README.md`,
  `tools/auto-runner/lib/semantic-recovery-native-install-diagnostics.mjs`,
  `tools/auto-runner/lib/semantic-recovery-native-install-handoff.mjs`,
  `tools/auto-runner/lib/semantic-recovery-native-install-journal.mjs`,
  `tools/auto-runner/lib/semantic-recovery-native-install-publication.mjs`,
  `tools/auto-runner/lib/semantic-recovery-native-rename-noreplace.py`,
  `tools/auto-runner/render-semantic-recovery-native-install-handoff.mjs`,
  `tools/auto-runner/semantic-recovery-native-install-bootstrap.sh`,
  `tools/auto-runner/semantic-recovery-native-install.mjs`,
  `tools/auto-runner/semantic-recovery-native-producer.mjs`, and
  `tools/auto-runner/test/semantic-recovery-native-install-protocol.test.mjs`.
- The repaired source restores only independently canonicalized `ProgramData`
  to the sanitized Windows OpenSSH child, closes preflight stdin while keeping
  the real execute TTY for the sole sudo exchange, accepts both valid arm
  outcomes into readback-only `--resume`, permanently removes recovery-sudo
  after `sudoAttemptCount` reaches one, bounds root failure projection, hardens
  append-only/no-clobber result publication and exact stranded-temporary
  readback, and includes every imported production module in the authenticated
  Git source closure. Temporary evidence cannot become installed success.
- Complete exact-head DevBox validation passed: `npm ci`; `npm run doctor`
  with Node `22.23.1`, npm `10.9.8`, and .NET SDK `9.0.119`; root and web-user
  npm audits with zero vulnerabilities; changed MJS syntax `8/8` and production
  imports `7/7`; bootstrap shell and Python compile checks; both rendered
  handoff modes and rendered-shell syntax; focused native-install protocol/
  producer tests `55/55`; complete auto-runner tests `1,450/1,450`; docs and
  scaffold validation; diff, exact 12-path scope, authenticated source-closure,
  candidate/canonical, and all 97 linked-worktree clean guards.
- Fresh exact-candidate Gemini `strong_independent` passed with zero findings.
  Fresh local Codex returned `APPROVE — no material findings`. Exact-head
  GitHub Codex reviewed `b0b9c59ef0` and found no major issues. All 11 required
  CodeQL, Semgrep, Trivy, and Scaffold Validation checks/scanners passed; all
  six review threads were resolved with zero unresolved; open code-scanning,
  secret-scanning, and Dependabot alerts remained `0/0/0`.
- The failed handoff
  `/workspace/logs/auto-runner/Settleora/manual-root-handoffs/20260804-1825`
  and operation
  `054edadcb40c71dcf9d4b2a8e5bae634605f08c6d1d8610a25f52e3d392f29c5`
  remain immutable and unreplayed. Owner state remains `sudo_started` with
  `sudoAttemptCount: 1`; the root result/journal remains blocked with a
  temporary result present, final result absent, and `planDigest: null` /
  `installedDigest: null`. The 30-file handoff aggregate remains
  `658f1b4b0ec25e25c85ef7846436e2782aafb35978f43fb99c2306441b218ffa`,
  the three-file owner-control aggregate remains
  `cdcd922b75337d3f1028eeb995bd4d66005418c67cf30dbe281cf7869b6800cb`,
  and the root temporary-result SHA-256 remains
  `1c01eaaccca53a946c405d1362a3122b35bd726abc129cd34d5a92500ad8ed03`.
- Keep Issue #1012 `OPEN` with `manual-gate`; this source merge and planning
  hygiene do not complete it. Issue #959 remains `OPEN`, untouched, and not
  continued. No sudo, install, deployment, grant, semantic successor, handoff
  generation/execution/replay, queue activation, runner/supervisor submission,
  product effect, or runtime/config/profile/service/API/OpenAPI/auth/storage/
  privacy/money/schema/CI-platform change occurred.
- Remaining gates are separate and ordered: (1) merge this focused post-merge
  hygiene PR; (2) generate a fresh handoff from repaired merged
  `main`, with a new operation ID, launcher, manifest, descriptor, and
  independently supplied SHA-256; (3) separately authorize and execute exactly
  one installation/sudo handoff; (4) verify canonical installed readback and
  health; and (5) only after installation succeeds, separately authorize any
  preserved Issue #959 continuation.
- Issue #1012 merge checkpoint (do not duplicate):
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5182166733`.

### Issue #1012 and PR #1044 — root-authoritative native installation protocol source merged (2026-08-04)

- PR #1044 merged once by normal expected-head GitHub merge commit from exact
  authorized base `ac5d5075249010f77c85eb7e7d4b68e91bf99e87` and exact
  source head `1cfba4b6f799b1b0e0430796b4dd5442857eb0db` as merge
  `dc6393e49e48f1934310c58daacb71706466b598`. Its ordered parents are
  the authorized base and source head, with no third parent, and its tree is
  the exact source tree `3a21817cc89f63440fce1438f3d458b706d25911`.
- The exact source candidate retained raw base-to-head diff SHA-256
  `3f0a81138f32cd179a55defee9da081c294976be5f09f05056d65a52e5c66611`
  and sorted 16-path manifest SHA-256
  `5bcc4b950bc17f02b44ed30991b19af78fb7cbed8a7c7ef522506419b658c92f`.
  It comprised 19 commits and exactly 16 authorized workflow/auto-runner
  source, helper, and focused-test paths, with 4,812 additions and 111
  deletions.
- The merged source defines a root-authoritative first-install protocol: a
  future fixed trusted bootstrap authenticates the selected canonical GitHub
  commit and complete selected tree/blob closure, materializes only
  authenticated bytes into a root-owned immutable private source closure,
  then requires independent root planner/verifier derivation and a
  publication-edge reread. Unprivileged projected plans, stores, manifests,
  paths, verifier results, checkout bytes, and helper transport are not
  authority. Publication is atomic no-clobber; exact adoption and ambiguous
  publication use complete installed-state readback; pre-publication failure
  is durably blocked without replay.
- Exact-head and merged-main validation passed dependency installation,
  doctor, zero-vulnerability root and web-user audits, bootstrap/Python/Node
  syntax and import checks, focused recovery/security tests `131/131`, the
  complete auto-runner suite `1,443/1,443`, docs, scaffold, diff, scope,
  identity, and all linked-worktree clean guards. Fresh exact-head Gemini
  `strong_independent` and local Codex reviews passed with zero material
  findings, and exact-head GitHub Codex found no major issue.
- All 12 source-head checks passed; all 12 review threads were resolved with
  zero unresolved actionable findings. All nine applicable merged-main jobs
  passed, including CodeQL, Semgrep, Trivy, Scaffold Validation, and the
  policy-owned API image workflow. Open code-scanning, secret-scanning, and
  Dependabot alerts remained `0/0/0`; GitHub deployments remained zero.
- Keep Issue #1012 `OPEN` with `manual-gate`. The protected parent/root,
  bootstrap, control-root/native producer, operation grant, and semantic
  successor remain absent and uninstalled. The exact next separate gate is
  **manual-root bootstrap/control-root installation handoff from exact merged
  source `dc6393e49e48f1934310c58daacb71706466b598`** under fresh owner
  authorization. It must not install a grant, create, persist, adopt, or read
  back a successor, continue Issue #959, deploy or roll back runtime, submit
  runner/supervisor work, or activate the queue unless separately authorized.
- No sudo/root action, installation, deployment, runtime/config/profile/
  approval/launcher/health mutation, Issue #959 continuation, queue/submission,
  product/API/auth/storage/money/schema change, secret or exposure change, or
  branch/worktree cleanup occurred. This mechanically generated docs-only
  checkpoint changes no policy, permission, security contract, product scope,
  or operational authority.
- Issue #1012 source-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5173559197`.

### Issue #1012 and PR #1042 — production-native semantic recovery producer source merged (2026-08-03)

- PR #1042 merged once by normal expected-head GitHub merge commit from exact
  authorized base `126855ace3393cbf675e890d673a9fb47d2498d1` and exact
  source head `106ea4bac5c4efd2b4cdd2e836ccfd039cbc0072` as merge
  `18681ac1c12139df96f616463692f18fcf4e2029`. Its ordered parents are
  the authorized base and source head, with no third parent, and its tree is
  the exact source tree `a7f79f57e89ebd23870ce1caf558e269b7c79620`.
- The exact source candidate retained raw base-to-head diff SHA-256
  `47011740b1e8a3f15f09f7f9b8050eb1181baca0a55a22382c209d0b456b96bd`
  and canonical changed-path manifest digest
  `51a8ff5b869494b8a5094f6f10c68bf3193dacb1cc36a8042d030b714ce98356`.
  It comprised 21 commits and exactly 12 authorized workflow/auto-runner
  source and focused-test paths, with 3,111 additions and 85 deletions.
- The merged source defines an offline native semantic-recovery producer and
  operator plan, eight independent protected authority-store projections,
  closed one-operation grant planning and authentication, crash-safe protected
  successor persistence, authenticated readback/adoption, and production
  wiring that remains fail-closed and inactive until a later protected
  installation. It grants no present operational authority.
- Exact-head and merged-main validation passed dependency installation,
  doctor, zero-vulnerability root and web-user audits, changed-module syntax
  `10/10`, production-module imports `5/5`, focused semantic producer/grant/
  persistence/readback/recovery/security/production-wiring tests `214/214`,
  the complete auto-runner suite `1,410/1,410`, docs, scaffold, diff, scope,
  and all linked-worktree clean guards. Fresh exact-head Gemini
  `strong_independent` and local Codex reviews passed with no findings, and
  exact-head GitHub Codex found no major issues.
- All 12 source-head checks passed; all six review threads were resolved with
  zero unresolved findings. All nine applicable merged-main jobs passed,
  including CodeQL, Semgrep, Trivy, Scaffold Validation, and the policy-owned
  API image workflow. Open code-scanning, secret-scanning, and Dependabot
  alerts remained `0/0/0`.
- Keep Issue #1012 `OPEN` with `manual-gate`. The protected control root,
  native producer, operation grant, and semantic successor remain absent and
  uninstalled. The exact next separate gate is **high-level owner
  authorization for protected native-producer/control-root installation
  only**; it must not install a grant, create, persist, adopt, or read back a
  successor, continue Issue #959, deploy, submit runner/supervisor work, or
  activate the queue.
- No deployment, runtime/config/profile/approval/launcher/health mutation,
  Issue #959 continuation, queue/submission/product/API/auth/storage/money/
  schema change, secret or exposure change, or branch/worktree cleanup
  occurred. This mechanically generated docs-only checkpoint changes no
  policy, permission, security contract, product scope, or operational
  authority.
- Issue #1012 source-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5166991106`.

### Issue #1012 — existing semantic-evidence package authenticated and corrected runtime deployed (2026-08-03)

- Exact final `main` `d510af578be21b2f5fefd53c90c76d6980523e60`
  was deployed through one bounded atomic runtime exchange. The new installed
  tuple is source `d510af578be21b2f5fefd53c90c76d6980523e60`, bundle
  `36ebe8030db223998fe8a10de29f6ff41e022e1059a4dbebfb16e18cda887a27`,
  file-list
  `821845ecd417c2376b648d4de92b47b019838a587226319f576eac55142f1011`,
  and 105 files. The exact prior installed tuple remains the one-depth rollback:
  source `ca4e7982d28a595b0f1c9d3c1bb355f26da8d667`, bundle
  `9a55383aada89bd71b05101bb834e78cce826cf40fc7a5d58f15cd22298e6e76`,
  file-list
  `8bea673bef5cb6d7040ec8ae33716c0518197b2465dac792005df7126cd31ace`,
  and 100 files. No rollback was invoked.
- Source-owned tooling authenticated and read-only adopted the retained strict
  10-member evidence package. The one non-mutating plan selected exact
  `adopt_final`, and its complete machine-derived identity set matched the
  package byte-for-byte: aggregate
  `19e80131f8b8f3829454eb4cb6c95c8922d862aa46410495a12575aecce465e4`,
  package-manifest
  `7892d90d525eaa2249e7709d1934e421ed7c20277c82c17ee692a13f15b290bd`,
  member-manifest
  `8eff48268a9766b8284045190de92fb015523e50f32a9f487882b28d9dcc1caa`,
  source/artifact manifests
  `c703ef3d35b653aed713ea7dd280b03852918ddfcde4f5927457f95180174e97` /
  `807d6c94c255aaada8e62bd665da6b55cd8b04a39c48fe59e95810570089308f`,
  semantic manifest/evidence
  `2d649bea337f1e0bd705451e935dbb66b17d3393c950690e34d85eda25031e12` /
  `768cffede4985339478a52f4a6a8b36db4d2f5159880254f5ddd945e3048f09f`,
  and allowed action `runtime_deployment_quiescence_only`. The package,
  incident, and associated-recovery bytes remained immutable.
- Two canonical deployment dry-runs matched on every deterministic field at
  canonical hash
  `2516b0d901ef522d2a218eee6a8e5d650eaaf16a2302e0e82ee4f29774fbcf8b`;
  only source-owned `generatedAt` differed. The stable launcher remains
  `0f7de5e3d2ce6b359e68ad844b98a8f3872b745fc5a7f8af73a44c9467897bce`,
  and the new approval sidecar is
  `622e71485f3cd4c7cc320ce7c26fa44643eb035e3735c3601f44dcb3b1fd9633`.
  Config changed only at `/runtimeBundleDigest`, with file SHA-256
  `756db1bf8d62b1fb52e95b629c5ce627513f5b464199a878064d8f67be9b36c1`
  becoming
  `42deb0a322a5a2b9cf79d141b885ec41e6582e60fe0562fbaf0ef621692c1c8a`.
  The approved profile and health-unit bytes remained unchanged.
- The unchanged loopback health unit completed its sole bounded stop/start
  cycle and returned HTTP `200`, `status=healthy`, and `mode=idle` with one
  valid new-runtime consumer and zero restarts. Focused package/evidence/
  recovery/quiescence/runtime/config/systemd tests passed `313/313`;
  external-runtime preflight/readiness each returned 27 pass, 2 warnings, and
  0 failures; doctor, docs, scaffold, diff, and npm audit validation passed,
  with zero dependency vulnerabilities and zero open code, secret, or
  Dependabot alerts.
- Keep Issue #1012 `OPEN` with `manual-gate`. The exact next separate gate is
  **protected native-producer/control-root/grant installation**, bound to the
  new live runtime/config/profile/approval/launcher/health state. It must not
  create or adopt a semantic successor or continue Issue #959 unless separately
  authorized. Issues #959, #740, #359, #357, and #999 and the preserved Issue
  #959 recovery remained unchanged; the preserved product candidate gained no
  remote branch or PR.
- No protected root/grant/producer/successor, runner or supervisor submission,
  queue activation, product, API/OpenAPI, auth/session/security, storage,
  settlement/money, schema/migration, Docker/deployment-infrastructure, secret,
  exposure, package-mutation, branch deletion, or worktree cleanup effect
  occurred. This mechanically generated docs-only checkpoint records completed
  evidence and grants no operational authority or change to policy,
  permissions, security contracts, deployment configuration, or product scope.
- Issue #1012 deployment checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5162625248`.

### Issues #1012/#959/#740/#359/#357/#999 and PR #1039 — semantic evidence package and associated-recovery source repair merged (2026-08-03)

- PR #1039 merged normally with exact-head protection from authorized base
  `3ad4212aa06021bde5f7907dd90fe94fab64d2ae`, source head
  `649ee8f7cec825f30f6a863d1f0ff5091454c5eb`, and source tree
  `041df77f36ae0a346cb7b600157357433c4ffc4d` as merge
  `11bdee391d72f43c8cb1084d7933ddc96475d0ef`. The merge has the exact
  base and source head as its two ordered parents and the exact source tree.
- The source repair changed exactly 14 Issue #1012 workflow, runner
  documentation, semantic-evidence package/extractor, recovery, runtime, and
  focused-test paths, with 3,690 additions and 101 deletions. It contains no
  product, API/OpenAPI, generated-client, auth/session, storage/privacy, money,
  schema/migration, OCR, UI, Docker, CI, secret, or deployment-configuration
  path.
- The merged source provides a manual-only deterministic plan/create-or-adopt
  entry point for one strict 10-member package: the deployment document, eight
  independently authenticated source projections, and the package manifest.
  Publication is crash-safe, inert until its retained manifest seal is
  descriptor-verified and committed, and no-clobber on exact adoption. The
  overwrite incident and distinct associated recoverable state remain two
  artifacts linked by exact semantic association. Authority remains grant-free
  and limited to `runtime_deployment_quiescence_only`.
- Exact merged-main validation passed dependency installation, doctor,
  zero-vulnerability root/web audits, changed-module syntax `12/12`, import
  checks `7/7`, the focused package/evidence/recovery/config/runtime/security/
  systemd suite `308/308`, the complete auto-runner suite `1,392/1,392`, docs,
  scaffold, diff, exact-scope, and all-worktree clean guards. Fresh Gemini and
  local Codex source reviews passed with zero findings; exact-head GitHub Codex
  found no major issue. All 12 exact-head checks passed with the sole review
  thread resolved and zero unresolved. All nine merged-main checks passed, and
  open code-scanning, secret-scanning, and Dependabot alerts remained `0/0/0`.
- The fresh inert live plan selected 10 members across eight source classes at
  `/workspace/auto-runner/config/settleora-semantic-deployment-evidence-issue-1012`
  with aggregate `04fd489aa30b06fba85bcf276c2f75786c7c9c024a724b42f9f1fd81a313510b`,
  package-manifest `c8573b1af34d696c7ed1f8003ea0a20954bd6832cd871af3d2ce3eb78713e23d`,
  and member-manifest `260e82d41ae68f3396e42510e239e79eca37e88da540dd63176febc4a4ab726a`.
  The live package was not created or adopted, and deployment was not
  performed. Final, incoming, and retired package paths remained absent.
- The complete 42-file guarded live incident, associated recovery,
  runner-state, runtime, profile, configuration, approval, launcher, health,
  and preserved Issue #959 evidence set remained byte-identical at aggregate
  `dcc88559bfe77f3bca79d80a3380f37ae600b803d5880db90b570fa97a5cd38e`.
  No rollback, root/systemd mutation, protected root/grant/producer operation,
  semantic-successor construction/adoption/persistence/readback, runner or
  supervisor submission, queue activation, Issue #959 continuation, duplicate
  claim/charge, branch/worktree cleanup, or live product effect occurred. The
  pre-existing main workflow published the merge-SHA API image but performed no
  deployment.
- Keep Issue #1012 `OPEN` with `manual-gate`; source repair completion does not
  satisfy its close rule. The next gate requires fresh owner authorization
  bound to final current `main`, the exact package root and basename, and the
  freshly rederived exact 10-member plan, package aggregate, package-manifest,
  and member-manifest, explicitly permitting package `--create-or-adopt`, two
  matching canonical deployment dry-runs, and at most one atomic deployment/
  adoption. Protected root/grant, semantic successor, exact successor readback,
  and Issue #959 continuation remain later separate gates.
- Issues #959, #740, #359, #357, and #999 remain open and unchanged. This
  mechanically generated docs-only checkpoint grants no operational
  authorization and changes no policy, permission, security contract,
  deployment configuration, or source.
- Issue #1012 source-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5161709293`.

### Issues #1012/#959/#740/#359/#357/#999 and PR #1037 — semantic deployment-quiescence source repair merged (2026-08-02)

- PR #1037 merged normally with exact-head protection from authorized base
  `571f1091fd756ccb3700eddfdc5cd3b6026a5de7`, source head
  `cb88ec1f2f79d116b42771044d691595c6564cd4`, and source tree
  `9ffd1a1bb719ee6e8b1ec9f30b9a067a4c7e1fc5` as merge
  `5fcdd9631c1264829c771da02101145ae55aec96`. The merge has the exact
  base and source head as its two ordered parents and the exact source tree.
- The source repair changed exactly 11 Issue #1012 workflow, runner
  documentation, runtime/configuration/identity/evidence/authority modules, and
  focused test paths, with 1,499 additions and 44 deletions. It contains no
  product, API/OpenAPI, generated-client, auth/session, storage/privacy, money,
  schema/migration, OCR, UI, Docker, CI, secret, or deployment-configuration
  path.
- The repair requires authenticated exact equality to the configured project
  logs root, distinct grant-free deployment-only semantic corroboration, and
  repeated quiescence-proof equality. Legacy evidence and bootstrap behavior
  remain supported without weakening those source-owned admission checks.
- Exact-head validation passed the focused deployment/quiescence/runtime/
  configuration/semantic/security suites `72/72` and the complete auto-runner
  suite `1,354/1,354`. Exact merged-main validation passed dependency
  installation, doctor, zero-vulnerability root/web audits, production-module
  syntax/import checks, the expanded focused suite `152/152`, the complete
  suite `1,354/1,354`, docs, scaffold, diff, exact-scope, and all-worktree clean
  guards. Fresh Gemini and
  local Codex source reviews passed with zero findings; exact-head GitHub Codex
  found no major issue. All 12 exact-head CodeQL, Semgrep CE/OSS, Trivy, and
  Scaffold Validation checks passed; both review threads were resolved with
  zero unresolved. Merged-main checks passed, and open code-scanning,
  secret-scanning, and Dependabot alert counts remained `0/0/0`.
- The complete 42-file guarded live incident, runner-state, runtime, profile,
  configuration, approval, launcher, health, and preserved Issue #959 evidence
  set remained byte-identical at aggregate digest
  `dcc88559bfe77f3bca79d80a3380f37ae600b803d5880db90b570fa97a5cd38e`.
  No deployment, rollback, protected root/grant/producer installation,
  semantic-successor creation/adoption, runner/supervisor submission, queue
  activation, Issue #959 continuation, duplicate claim/charge, branch/worktree
  cleanup, or live product effect occurred. The pre-existing main-push workflow
  published a merge-SHA API image to GHCR but performed no deployment.
- Keep Issue #1012 `OPEN` with `manual-gate`; merging the repository repair did
  not satisfy its close rule. The next gate requires fresh owner deployment
  authorization bound to final current main, the corrected source repair, exact
  installed runtime/profile/configuration/approval/launcher/health identities,
  and the new source-owned deployment semantic-evidence interface. Protected
  native-producer/control-root/grant installation, semantic successor creation/
  adoption, exact successor readback, and any Issue #959 continuation remain
  later, separate manual gates in that order.
- Issues #959, #740, #359, #357, and #999 remain open and unchanged. This
  mechanically generated docs-only checkpoint grants no operational authority
  and changes no policy, permission, security contract, deployment
  configuration, or source.
- Issue #1012 source-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5159128433`.

### Issues #1012/#959/#740/#359/#357/#999 and PR #1032 — protected semantic-recovery authority repair merged (2026-08-02)

- PR #1032 merged normally with expected-head protection from exact authorized
  base `f76a2d6e30a278f5e36a876625c1a18b2bf75643`, source head
  `412ad22eb8c23549580c23bc09dc1b3d17cdd9ba`, and source tree
  `925260b5205ba0cf6969a9894f354d52fd78599a` as merge
  `5770f87f1712a2a505b97e72fba65ffc13afe19d`. The normal merge has the exact
  base and source head as its two ordered parents and the exact source tree.
- The repository repair changed exactly 11 Issue #1012 paths: the autonomous
  runner workflow and README; runner configuration, recovery continuation,
  recovery state, startup wiring, and new semantic-authority and post-incident
  successor-recovery modules; plus three focused test files. The diff contains
  1,978 additions and 7 deletions. It contains no planning ledger, lockfile,
  product, API/OpenAPI, generated-client, auth/session, storage/privacy, money,
  schema/migration, deployment, or secret path.
- The repair makes semantic successor recovery fail closed behind source-owned
  verifier and claim-owner contracts, a separately protected native producer,
  the fixed protected control root, and an exact operation grant. Verifier
  registry version `1` has digest
  `42969de3ac42490b0c7f1bfd86421c9ab672849491efa5f90749e6e703d09e4a`;
  claim-owner matrix version `1` has digest
  `5e870606149f0d64dc1805c53c132b8513ce95f13119c8596203bc15fc9768b3`.
- Exact-head and exact merged-main validation passed dependency installs and
  zero-vulnerability root/web audits, doctor, changed-module syntax/import
  checks, the focused recovery/authority/security suite `235/235`, the complete
  auto-runner suite `1,340/1,340`, docs, scaffold, diff, exact-scope, and clean
  guards. Fresh Gemini `strong_independent` passed at high confidence and fresh
  local Codex passed with no material finding. All required CodeQL language
  analyses/aggregate, Semgrep CE/OSS, Trivy repository/aggregate, and Scaffold
  Validation checks passed on the exact PR head; merged-main checks also passed.
  Exact-head GitHub Codex found no major issue; all `17/17` review threads were
  resolved with zero unresolved; open code-scanning, secret-scanning, and
  Dependabot alert counts were `0/0/0`.
- The complete guarded live incident, historical/consumed-child, runner-state,
  runtime, profile, approval, launcher, and health evidence remained
  byte-identical. The incident digest remained
  `50bbf9e005bbceebf1d0ef3acf06ee592ed71ae3097c1bc4ca6e64b120518a4c`.
  No runtime deployment, rollback, protected producer/control-root/grant
  installation, semantic successor creation/adoption, runner or supervisor
  submission, queue activation, Issue #959 continuation, duplicate identity or
  charge, branch/worktree cleanup, or live product effect occurred. The
  pre-existing main-push workflow published a merge-SHA API image to GHCR, but
  performed no deployment or live runtime/product mutation.
- Keep Issue #1012 `OPEN` with `manual-gate`. The repository repair is merged,
  but its close rule is not satisfied. The remaining separately authorized
  sequence is: (1) bounded corrected-runtime deployment; (2) protected
  producer/control-root/grant installation; (3) semantic successor
  creation/adoption; (4) exact successor readback; and only then (5) evaluate
  any safe Issue #959 continuation and require it to advance without duplicate
  identity or effect.
- Issues #959, #740, #359, and #357 remain open and unchanged. Issue #999
  remains open and separate; no #999 work was performed. No parent issue is
  ready to close merely because the repository prerequisite merged.
- Issue #1012 repository-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5157513329`.
  Merge/hygiene report:
  `/workspace/logs/settleora-codex-report-20260802-1851-pr1032-exact-head-merge-post-merge-hygiene.md`.

### Issue #1033 / PR #1034 — PostCSS Dependabot alert #29 remediation complete (2026-08-02)

- Issue #1033 is `CLOSED` as completed. It has no Project item, milestone, or
  assignee. PR #1034 merged normally with expected-head protection from exact
  authorized base `ca4e7982d28a595b0f1c9d3c1bb355f26da8d667`, source head
  `4a500941543e84fe381ed1ebb93b661f1f23b228`, and source tree
  `55f84cc55fe8be3e77add313939d936086a77381` as merge
  `e779fec81293a86649f87b30dad7f15f7d1cc88c`. The merge has the exact base
  and source head as its two ordered parents and the exact source tree.
- Scope was only `apps/web-user/package-lock.json`, with 7 additions and 7
  deletions. The transitive Vite development graph moved PostCSS from `8.5.15`
  to patched `8.5.25`; its required Nano ID edge/node moved from `3.3.15` to
  `3.3.16`. No package manifest, direct PostCSS dependency, application source,
  framework, package-manager, API/OpenAPI, generated client, schema, or
  deployment configuration changed.
- Exact merged-main validation passed clean web-user `npm ci` with 144 packages
  audited and zero vulnerabilities, `npm explain postcss`, `npm ls postcss
  --all`, `npm ls nanoid --all`, zero-vulnerability `npm audit --json`, lint,
  11 test files / 129 tests, production build, root doctor, diff checks, and
  clean-worktree guards. The merged lock graph contains exactly one PostCSS
  instance at `8.5.25`, one Nano ID instance at `3.3.16`, and no direct PostCSS
  declaration.
- Fresh Gemini `strong_independent` and local Codex reviews passed with no
  material findings. All 12 exact-head PR CodeQL, Semgrep CE/OSS, Trivy, and
  both Scaffold Validation checks passed; exact-head GitHub Codex found no
  major issues; review threads were `0/0` total/unresolved. On merged main, all
  required CodeQL, Semgrep CE, Trivy, and Scaffold Validation checks passed.
  The separate non-required API Image GHCR workflow encountered a Docker Hub
  timeout while booting Buildx; its image build/publish step was skipped and no
  deployment or published artifact resulted.
- Dependabot alert #29 for `postcss` in
  `apps/web-user/package-lock.json` / `GHSA-r28c-9q8g-f849` closed
  automatically as `fixed` at `2026-08-02T04:33:52Z` after the patched graph
  reached the default branch. Its dismissal request, dismissed-at/by/reason/
  comment, and auto-dismissed-at fields remained null. Final open
  code-scanning, secret-scanning, and Dependabot alert counts were `0/0/0`.
- PR #1032 remains a separate resumable Issue #1012 chain on branch
  `fix/auto-1012-semantic-evidence-successor-recovery-20260801-1136`. Its
  retained worktree remained clean at local candidate
  `6ea9f6cabfc26abb58ba9be8445fd4acb5e17acd`; remote/PR head remained
  `275f9e15d0e4ee2d7d59686c9a9b3ce48bdcd3db`. Resume it only as a separately
  launched task, incorporating current main through a normal non-force merge
  when needed and rerunning all candidate-bound validation and reviews.
- No deployment, rollback, Issue #959 submission, semantic-successor
  create/adopt operation, root/systemd/service/grant operation, runner or
  supervisor submission, queue activation, PR #1032 mutation, branch/worktree
  cleanup, force-like history operation, or unrelated product/runtime effect
  occurred. Later protected producer/root/grant installation, semantic
  successor creation/adoption, and Issue #959 continuation remain separate
  manual gates.
- Close/keep-open recommendation: keep Issue #1033 closed; its narrow
  dependency-remediation close rule is satisfied. Completion comment:
  `https://github.com/tommytang213/Settleora/issues/1033#issuecomment-5155435460`.
  Merge/hygiene report:
  `/workspace/logs/settleora-codex-report-20260802-1220-pr1034-exact-head-merge-alert-closure-hygiene.md`.

### Issues #1012/#959/#999 and PR #1030 — live projection diagnostics replay repair merged (2026-08-01)

- PR #1030 merged normally with expected-head protection from exact authorized
  base `c19837b0da9ec6112351439fff3c3244825ffd13`, source head
  `d17f1621e377475a109a3a6ab2e775f06390a5d8`, and source tree
  `a2ee4475db029b1c17e09619090bcb29aabdaf04` as merge
  `2bb808fd7154227249ef839b687dd6dc27c33318`. Its ordered history is exactly
  nine commits across the six authorized auto-runner implementation,
  documentation, and test paths; the merge parents are the exact base and
  source head, and the merge tree equals the source tree. Source branch
  `fix/auto-1012-live-projection-diagnostics-replay-20260731-2315` was retained
  without restoration, and its remote ref was read back after merge at the
  exact source head.
- The root cause was unrelated unsuffixed legacy summary reauthentication plus
  collapsed projection diagnostics. The repair separates diagnostic
  observation from canonical selected-overlay authority: unsuffixed candidates
  retain producer-identical bounded diagnostics but cannot supply overlay
  authority, and loaded-artifact plus lifecycle/projector failures use a finite
  fail-closed taxonomy.
- Exact-head validation passed focused tests `86/86`, the complete auto-runner
  suite `1306/1306`, `npm ci` with zero vulnerabilities, doctor, changed-file
  syntax, docs, scaffold, diff, exact-scope, and clean guards. Gemini
  `strong_independent` passed at high confidence with no findings; local Codex
  returned `VERDICT: PASS`; exact-head GitHub Codex reported no major issues.
  All required CodeQL, Semgrep CE/OSS, Trivy, Scaffold Validation, branch, and
  ruleset checks passed; all `5/5` review threads were resolved with zero
  unresolved; open code-scanning, secret-scanning, and Dependabot alerts were
  `0/0/0`.
- Exact-live read-only replay of all 14 preserved artifacts remained bound to
  evidence digest
  `9f318627ae40ef8862e726c79f2bfdc12b35cd8504f1a462f2f6e551a8304bc3`,
  and every artifact remained byte-identical. Issue #959 remained `OPEN` with
  exactly six labels and 13 comments, without `auto-claimed` or `auto-running`
  and without its preserved remote branch or PR. Issue #999 remained separate,
  `OPEN`, with exactly three labels and zero comments. Neither issue was
  mutated.
- Keep Issue #1012 `OPEN` with `manual-gate`; the close recommendation remains
  keep-open. A bounded deployment of the merged repair remains pending separate
  authorization, followed by separate authorization for exactly one preserved
  Issue #959 continuation. Reconcile the close rule only after that continuation
  safely advances.
- This source merge and ledger hygiene performed no deployment, rollback,
  runtime/profile/approval/launcher/service/health mutation, runner or
  supervisor submission, queue activation, Issue #959 continuation, Issue #999
  work, product/API/OpenAPI/generated-client/auth/storage/privacy/money/schema/
  Docker/CI/secret change, cleanup, force-like history operation, or direct-main
  push.
- Issue #1012 source-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5148855448`.
  Source review/final-gate report:
  `/workspace/logs/settleora-codex-report-20260801-0852-pr1030-late-exact-head-review-checkpoint-final-gate.md`.

### Issues #1012/#959/#999 and PR #1028 — failed-continuation overlay admission repair merged (2026-07-31)

- PR #1028 merged normally with expected-head protection from exact authorized
  source head `8b22d7187b3d387467b693327d6f292896dd6bb6`, source tree
  `d2ad925829af4a664327ed0927b8f4d6253f2336`, and base
  `291e774cc1d9d800d917c5b844ebedc3815b3d5c` as merge
  `79efc42941ac222147dc8e1c5d9a81cd12054836`. The ordered merge parents are
  the exact base and source head, and the merge tree equals the source tree.
- The repair changed only
  `tools/auto-runner/lib/terminal-validation-retry-projection.mjs` and
  `tools/auto-runner/test/terminal-validation-retry-projection.test.mjs`.
  It reauthenticates the unchanged terminal predecessor plus at most one exact
  no-effect failed-continuation overlay, binds the overlay evidence and
  chronology, grants it no mutation authority, and fails closed on ambiguity
  or contradiction.
- Exact-head validation passed focused projection/recovery tests `42/42`, the
  complete auto-runner suite `1303/1303`, `npm ci` with zero vulnerabilities,
  doctor, syntax, docs, scaffold (19 paths), diff, exact-scope, and clean
  guards. Gemini `strong_independent`, local Codex, and exact-head GitHub
  Codex passed with no material or major finding. All required CodeQL,
  Semgrep CE/OSS, Trivy, Scaffold Validation, branch, and ruleset checks
  passed; all `26/26` review threads were resolved with zero unresolved; open
  code-scanning, secret-scanning, and Dependabot alerts were `0/0/0`.
- All 13 preserved original and failed-continuation artifacts remained
  byte-identical. Issue #959 remains `OPEN` with exactly six labels and 13
  comments, without `auto-claimed` or `auto-running`, and without its
  preserved remote branch or PR. Issue #999 remains separate, `OPEN`, with
  exactly three labels and zero comments. Neither issue was mutated.
- Keep Issue #1012 `OPEN` with `manual-gate`; close recommendation remains
  keep-open. The bounded deployment requires separate authorization, followed
  by separate authorization for exactly one preserved Issue #959 continuation.
  Reconcile the close rule only after that continuation safely advances.
- This merge and ledger hygiene performed no deployment, rollback,
  runtime/profile/approval/launcher/service/health mutation, runner or
  supervisor submission, queue activation, Issue #959 continuation, Issue
  #999 work, product change, cleanup, force-like history operation, or
  direct-main push.
- Issue #1012 source-merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5144010578`.
  Source review/final-gate report:
  `/workspace/logs/settleora-codex-report-20260731-2159-pr1028-exact-head-review-thread-checkpoint-final-gate.md`.

### Issues #1012/#959/#999 and PR #1025 — authoritative reload identity repair merged (2026-07-31)

- PR #1025 merged normally with expected-head protection from exact authorized
  source head `a07faa54e491ad7126fa8e5663e21e27999f5fc0`, source tree
  `9ccf7acd5b65a0b53d0d59132435fbf9a7639ccd`, and base
  `3b2dec4997e8ffc8205e210fa6e017cab6da231d` as merge/current `main`
  `298a6ff0087d9217e29c87109a4ca05725e6d0c6`. The ordered merge parents are
  the exact base and source head, and the merge tree equals the authorized
  source tree.
- The focused three-file auto-runner repair preserves authoritative
  `statePath` across reload routing so unchanged root checkpoint bytes can be
  reauthenticated. It changed only recovery continuation code and focused
  recovery/production-wiring tests, with 71 additions and 7 deletions.
- Exact-candidate validation passed focused tests `111/111`, the complete
  auto-runner suite `1300/1300`, `npm ci`, doctor, changed-module
  syntax/import, docs, scaffold, diff, exact-scope, and clean-worktree guards.
  Gemini `strong_independent` and local Codex passed with no material findings.
  All 12 exact-head CodeQL/language-analysis, Semgrep CE/OSS, Trivy, and
  Scaffold Validation checks passed. Open code-scanning, secret-scanning, and
  Dependabot alerts were `0/0/0`; unresolved review threads were `0`; GitHub
  Codex found no major issues.
- Immutable original and failed-continuation Issue #959 artifacts remained
  byte-identical. Issue #959 remains `OPEN` with exactly six labels and 13
  comments, without `auto-claimed` or `auto-running`, and without a remote
  preserved branch or PR. Issue #999 remains separate, `OPEN`, with three
  labels and zero comments. Neither issue was mutated.
- Keep Issue #1012 `OPEN` with `manual-gate`. This repository repair is merged.
  Remaining gates require separate explicit authorization: deploy and verify
  the merged repair, then perform exactly one trusted preserved Issue #959
  continuation proving no duplicate effect. Decide whether to close Issue
  #1012 only after both gates succeed.
- This source merge and ledger hygiene performed no deployment, rollback,
  runtime/profile/approval/launcher/service/timer/health mutation, runner or
  supervisor submission, queue activation, Issue #959 continuation, Issue
  #999 work, or product/API/OpenAPI/generated-client/auth/storage/money/schema
  effect.
- Issue #1012 merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5140442463`.
  Source report:
  `/workspace/logs/settleora-codex-report-20260731-1507-pr1025-failed-run-report-recovery-final-gate.md`.
  Merge/hygiene report:
  `/workspace/logs/settleora-codex-report-20260731-1523-pr1025-exact-head-merge-post-merge-hygiene.md`.

### Issues #1012/#959/#999 and PR #1023 — terminal recovery projection repair merged (2026-07-31)

- PR #1023 merged normally with expected-head protection from exact authorized
  source head `93c3d5d77128f4073f58333c2103d686513ae86f`, source tree
  `36d11cb9701a4b423342ee04f93e64ee28e62039`, and base
  `e4eb25c9b1eebfd6a364cfb76abc8fa4fbf4da3a` as merge/current `main`
  `9433679d2a12cc1ac75ed6a9e04114c0ad49168f`. The ordered merge parents are
  the exact base and source head, and the merge tree equals the authorized
  source tree.
- The 20-file auto-runner workflow/docs/test repair completes the repository
  side of the preserved terminal validation-retry projection. It binds the
  raw recovery, lifecycle, successor state and summaries, supervisor spec and
  state, task/claim/charge/branch/candidate identities, and no-effect posture
  while keeping effective recovery in-memory and fail-closed. It does not
  deploy the corrected runtime or continue Issue #959.
- Exact-head validation passed the complete auto-runner suite `1297/1297`,
  focused suites `202/202`, docs, scaffold (19 paths), changed-module syntax
  and imports, live read-only projection, diff/scope, and clean-worktree
  guards. Final Gemini `strong_independent` passed with no findings; final
  local Codex returned `PASS_NO_BLOCKING_FINDINGS`; final GitHub Codex found
  no major issues. All 12 CodeQL/language-analysis, Semgrep CE/OSS, Trivy,
  and Scaffold Validation checks passed. Open code-scanning,
  secret-scanning, and Dependabot alerts were `0/0/0`; unresolved review
  threads were `0`.
- Immutable Issue #959 recovery, lifecycle, logical-task budget, successor
  state and JSON/Markdown summaries, supervisor spec, and supervisor state
  hashes remained byte-identical. Issue #959 remains `OPEN` with exactly six
  labels and 13 comments, without `auto-claimed` or `auto-running`; no remote
  preserved branch or PR exists. Issue #999 remains separate, `OPEN`, with
  zero comments and unchanged labels. Neither issue was mutated.
- Keep Issue #1012 `OPEN` with `manual-gate`. Repository repair and this
  post-merge ledger hygiene are complete. Remaining gates require separate
  explicit owner authorization: deploy and verify the corrected current-main
  runtime, then perform exactly one trusted preserved Issue #959 continuation
  proving no duplicate claim, charge, task, branch, candidate, or product
  effect. Decide whether to close Issue #1012 only after both gates succeed.
- This source merge and ledger hygiene performed no deployment, rollback,
  runtime/profile/approval/launcher/service/timer/health mutation, runner or
  supervisor submission, queue activation, Issue #959 continuation, Issue
  #999 work, or product/API/OpenAPI/generated-client/auth/storage/money/schema
  effect.
- Issue #1012 merge checkpoint:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5139185211`.
  Source report:
  `/workspace/logs/settleora-codex-report-20260730-2111-issue-1012-terminal-projection-review-pr-gate.md`.
  Merge/hygiene report:
  `/workspace/logs/settleora-codex-report-20260731-1206-pr1023-exact-head-merge-post-merge-hygiene.md`.

### Issues #1012/#959/#999 and PR #1021 — historical task-workspace authority repair merged (2026-07-30)

- PR #1021 merged normally from exact source head
  `ebd1184de96497b4055c3fc26f9f5861250eb3a6`, source tree
  `c6655859b44c278a14e881965949b979fb290318`, and base
  `e96376b03d1e11dddeec28be237201ce56681753` as merge/current `main`
  `ffff36f95bae214db3165d701e0afa8dca8b20f5`. The ordered merge parents are
  the exact base followed by the exact source head, and the merge tree equals
  the authorized source tree.
- The exact three-commit repair changed only
  `tools/auto-runner/settleora-auto-runner.mjs`,
  `tools/auto-runner/lib/git-workspace.mjs`,
  `tools/auto-runner/test/production-recovery-wiring.test.mjs`, and
  `tools/auto-runner/test/git-workspace.test.mjs`, with 91 additions and 26
  deletions. No `.codex/reports/**` path entered the merge.
- Root cause: canonical effect authority was evaluated while preserved
  lifecycle authority was terminal, before active-successor handoff.
  Authoritative preparation now remains read-only; reconstruction occurs at
  the post-planning `checkpoint_validation_commit` boundary. Exact finalized
  `worktree_create` effects may be reconciled across successor authority only
  when repository, task, run, issue, claim, charge, branch, head,
  deterministic-root, and common-dir identities match. Reconstructed intents
  include exact issue authority, and contradictory or ambiguous evidence
  remains fail-closed.
- The authoritative post-run recovery baseline is
  `6babf52dfea9e9edee4824b4d3933426ecd85f9066cb02ea95cc0c53cae80c99`;
  historical pre-submit recovery hash
  `2ce51e452bb3f4e2c87fd0cd98756067bce1641af5d88069f78a78fccf866171`
  remains historical evidence only.
- Exact final validation passed: `npm ci` with 0 vulnerabilities, doctor,
  changed-module syntax, focused tests `83/83`, complete auto-runner tests
  `1276/1276`, docs, scaffold, diff, exact-scope, and clean-worktree guards.
  Fresh Gemini `strong_independent` and local Codex mechanics/integration/
  recovery/Git/security reviews passed. Both GitHub Codex P1 findings were
  fixed; all 2 review threads are resolved. Required CodeQL, Semgrep, Trivy,
  and Scaffold checks passed, with open code/dependency/secret alerts `0/0/0`.
- Issue #959 supplied immutable evidence only. PR #1021 and this hygiene caused
  no deployment, runner submission, queue activation, runtime/profile/
  approval/launcher/health mutation, #959 product or GitHub effect, #999
  effect, or unrelated product, API/OpenAPI, auth/security, storage/privacy,
  money/settlement, schema/migration, Docker/deployment/CI, architecture, or
  Day 1 scope effect.
- Keep Issue #1012 `OPEN` with `manual-gate`. The remaining operational gates
  are a separately authorized deployment of the corrected current-main runtime
  with installed runtime/profile/approval/launcher/health identity
  verification, followed by another explicit authorization for exactly one
  trusted preserved Issue #959 continuation proving no duplicate claim,
  charge, task, branch, candidate, or product effect. Issue #959 remains
  `OPEN`; Issue #999 remains separate, `OPEN`, unimplemented, and untouched.
- Issue #1012 merge checkpoint comment:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5130241600`.
  Source reports:
  `/workspace/logs/settleora-codex-report-20260730-1804-issue-1012-recovery-baseline-dirty-workspace-repair-continuation.md`
  and
  `/workspace/logs/settleora-codex-report-20260730-1916-pr1021-metadata-reconciliation-merge-gate.md`.

### Issues #1012/#959/#999 and PR #1019 — recovery-authority reconciliation repair merged (2026-07-30)

- PR #1019 merged normally from exact authorized source head
  `16711f6c4bc8f52fe8a30390bcf554ac834c67b5` and base
  `56daf9d3716acc54215e75633580dfcb8a97e1e9` as merge commit/current
  `main` `29c5802880c9375eaa616df223d649bbac30fef1`. Its ordered parents are
  the exact base and source head, and its merge tree
  `897ea6be51b98e3d1a558a81a3c919bcf2d68fb3` equals the authorized
  source tree.
- The repository recovery-authority repair authenticates a bounded contiguous
  historical push/PR-intent lineage, reconciles that history with the unique
  live PR and trusted current `main`, and persists the resulting projection
  through the existing recovery-state authority before downstream planning.
  Historical effect-time `main`, original base, and current `main` remain
  distinct, ancestry-bound evidence; contradictory or incomplete identity,
  lineage, intent, PR, digest, or current-main evidence fails closed.
- Exact-head evidence converged on source head `16711f6c4b`:
  - `npm ci` passed with 0 vulnerabilities; doctor, changed-module syntax and
    import smoke, docs, scaffold, diff, exact-scope, and clean checks passed;
  - focused recovery tests passed `58/58` and the complete auto-runner suite
    passed `1276/1276`;
  - fresh Gemini `strong_independent` and local Codex mechanics/integration/
    recovery/Git/security reviews passed with no remaining finding;
  - all required CodeQL, Semgrep, Trivy, and Scaffold Validation checks passed
    on the exact head, and all 45 accumulated review threads were resolved.
- Keep Issue #1012 `OPEN` with `manual-gate`. The repository repair is merged,
  but its close rule remains unsatisfied until the corrected runtime is
  separately deployed and its installed runtime/profile/health identities are
  verified, then exactly one trusted continuation reuses the preserved #959
  task, charge, branch, and candidate without duplicate effect.
- Issue #959 remains `OPEN` and preserved with exactly `area:ocr`,
  `area:mobile-ui`, `type:bug`, `scope:day1`, `auto-ready`, and `auto-failed`;
  it has neither `auto-claimed` nor `auto-running` and has not been resumed.
  Issue #999 remains `OPEN`, has zero comments, and remains separate,
  unimplemented backlog work.
- PR #1019 added no product/mobile OCR implementation. Its merge and this
  repository hygiene performed no deployment, runtime/profile/service change,
  runner submission, queue activation, #959/#999 mutation, API/OpenAPI,
  auth/session/security, storage/privacy, money/settlement, schema/migration,
  Docker/deployment/CI, secret, network, exposure, architecture, or Day 1
  scope effect.
- Issue #1012 merge checkpoint comment:
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5128041480`.
  Source report:
  `/workspace/logs/settleora-codex-report-20260730-1335-issue-1012-pr1019-cross-cutting-recovery-reconciliation.md`.

### Issues #1012/#959 and PR #1017 — preserved-recovery claim-authority repair merged (2026-07-28)

- GitHub state at the PR #1017 merge handoff: #1012 and #959 remain `OPEN`.
  #999 remains `OPEN`, separate, and untouched.
- PR #1017 merged normally from exact source head
  `03abb58e93c86481d835e373a6fd936aa72c3232` and exact source tree
  `b35cfbe6afaaf61dadc5ebfeb14172068da39a3d` as merge
  `f21b3ebad5f873880f4105db4b1d781b0109d1c1`.
- Ordered merge parents are prior `main`
  `9a8cf8025ba913c7af9400a532015632ec175993` and exact source head
  `03abb58e93c86481d835e373a6fd936aa72c3232`. The merge tree is
  `b35cfbe6afaaf61dadc5ebfeb14172068da39a3d`, exactly equal to the
  authorized source tree.
- The exact nine-path claim-authority repair changed:
  - `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md`;
  - `tools/auto-runner/README.md`;
  - `tools/auto-runner/lib/claim-authority.mjs`;
  - `tools/auto-runner/lib/historical-initial-candidate-lineage.mjs`;
  - `tools/auto-runner/lib/issue-selection.mjs`;
  - `tools/auto-runner/lib/recovery-continuation.mjs`;
  - `tools/auto-runner/settleora-auto-runner.mjs`;
  - `tools/auto-runner/test/claim-authority.test.mjs`;
  - `tools/auto-runner/test/production-recovery-wiring.test.mjs`.
- Claim authority now has two explicit modes:
  - `fresh_active_claim` still requires an open exact issue, every configured
    active claim label, no stop label, the exact active owner, and the
    post-claim live reread;
  - `preserved_recovery_claim` may tolerate absent transient claim labels only
    when exact policy, completed durable claim, accepted charge, task/run/
    supervisor identity, lifecycle and recovery lineage, branch/base/head,
    original terminal candidate, terminal outcome, counters, intent, and
    inactive owner/lease evidence all agree.
- Durable claim, charge, lifecycle, recovery, original/current candidate, and
  owner evidence are carried through one authoritative startup snapshot.
  Recovery reuses the accepted task charge, including a narrowly reconciled
  claim-to-charge-marker crash window, and does not create a duplicate charge.
  The original terminal candidate remains immutable when a recovery candidate
  advances.
- Terminal label behavior remains non-mutating for preserved recovery.
  Ordinary polling and fresh claiming retain their existing label rules. A
  contradictory live transient claim without the exact active owner, stale
  claim evidence, incomplete terminal proof, or inconsistent durable lineage
  fails closed instead of manufacturing authority.
- Exact-head validation and review evidence:
  - `npm ci` passed with 0 vulnerabilities; doctor, changed-production syntax
    and ESM import smoke, focused claim/recovery/startup tests, docs, scaffold,
    diff, exact-scope, and clean-worktree checks passed;
  - the complete auto-runner suite passed `1263/1263`, with 0 failed and
    0 skipped;
  - fresh Gemini `strong_independent` and local Codex mechanics/integration/
    recovery/Git/security reviews passed;
  - all 12 required CodeQL, Semgrep CE/OSS, Trivy, and both Scaffold Validation
    checks passed on exact head;
  - final GitHub Codex review inspected `03abb58e93` and found no major issues;
    all three prior P1 threads are resolved/outdated, with 0 unresolved
    actionable threads;
  - open code-scanning alerts for PR #1017: 0; open repository
    secret-scanning alerts: 0.
- Preserved #959 identity remains immutable and non-mutated:
  - issue/task `959` / `20260724T075849`;
  - claim `tommytang213/Settleora#959`;
  - charge
    `5c9ae164d122cabccefa40f98db88134633bd594c0b2834897f51679c7d7ad78`;
  - branch
    `feature/auto-959-harden-mobile-ocr-parsing-for-hk-chinese-2026-07-24t0758`;
  - base/head/tree
    `ecf69d41e0dd96b9a05851af82db66e26d94ca2e` /
    `92b60cec46114c11a47184687509d30da6f5df10` /
    `805fc34919cdd95ca9222b633a26cfd07d4a17b4`;
  - changed-files/raw-diff digests
    `5754d10f7a0cc4148e48806fd18e1eddabc943ba62b57915ecadf53cc036789d` /
    `6b3b42bfa5e40d652330bfe8c9a2388236ee84b34b9e1a24045dd95913fcdda8`;
  - lifecycle/recovery/budget/prompt/original-summary SHA-256 values
    `353d22d0719de637433b5cc433db9ff612ec66b1a23408805d21f72e34780479`,
    `2ce51e452bb3f4e2c87fd0cd98756067bce1641af5d88069f78a78fccf866171`,
    `51bad4a0f6bfcf3df3fd718f50f4c3021145a1fa4379a72c617b0c95a15bd133`,
    `b1e327477bb8fc6a3b7e3f1c13672ee5e7f515e74900b165d463b7fd7ddf332f`,
    and
    `4c44dcfda255237adc56accd1f08845b0b5e4a7df2afddc36e65718faec84e80`.
- PR #1017 and this ledger hygiene caused no #959 label, claim, charge, task,
  branch, worktree, validation, implementation, push, PR, merge, runtime, or
  product effect. Keep #959 open until its separately authorized preserved
  continuation completes and its product close rule is satisfied.
- Keep #1012 open. The remaining operational gate is a separately authorized
  final-main runtime deployment/profile/health reconciliation followed by one
  separately authorized trusted continuation of the preserved #959 chain.
  PR #1017 and this hygiene task do not deploy or alter the prior runtime.
- #999 remains a separate review-finding-adjudication hardening task. It was
  not implemented, commented on, relabeled, or otherwise mutated here.
- Scaffold Validation optimization was not performed.
- Report references:
  - source report:
    `/workspace/logs/settleora-codex-report-20260728-2318-issue1012-preserved-recovery-claim-authority.md`;
  - merge and post-merge hygiene report:
    `/workspace/logs/settleora-codex-report-20260729-0121-pr1017-exact-head-merge-post-merge-hygiene.md`.


### Issues #1012/#959 and PR #1015 — dual-authority startup-recovery routing repair merged (2026-07-28)

- PR #1015 merged normally with expected-head protection from exact authorized
  source head `ddae81f9bbcc432521d7376135ffe0f7aa1ec54a`, tree
  `2eb7a2e2938085cde4783d123a02e437d722e94e`, as merge commit
  `cecd457ed89b5e347b97a2931ae504b87cf6a60d`. Its ordered parents are prior
  `main` `c588109b69c5cf8a6da743f1806d0278ec6384c6` and the exact source head;
  its merge tree is `2eb7a2e2938085cde4783d123a02e437d722e94e`, exactly equal to the
  pre-merge source tree.
- The exact 10-path repair preserves canonical current `main` as the
  control-plane checkout while routing authoritative startup recovery through
  independently reread control-plane Git and authenticated task Git/workspace
  evidence. Historical recovery authenticates the literal preserved branch,
  objects, lineage, tree, paths, digests, diff, intent, remotes, history, and
  Git configuration before handoff or materialization. Both that historical
  path and the same-workspace fast path reread and admit the live issue claim
  before lifecycle collection or validation; closed issues, missing claim
  labels, and stop labels remain fail closed. No implementation or initial
  candidate is replayed, and control-plane authority remains separate from
  task-workspace authority.
- Exact-head evidence passed `npm ci`, doctor, changed-module syntax and ESM
  imports, the complete auto-runner suite `1256/1256`, docs and scaffold
  validation, diff and exact-path scope guards, and clean-worktree checks.
  Final Gemini `strong_independent` and local Codex mechanics/integration/
  recovery/Git/security reviews passed with zero material findings; exact-head
  GitHub Codex produced no new finding. All 12 required CodeQL, Semgrep
  CE/OSS, Trivy repository/aggregate, and both Scaffold Validation checks
  passed. All four inline review threads were resolved, leaving zero
  unresolved actionable threads. The source task token's direct
  code-scanning-alert REST request returned HTTP 404; at the merge gate the
  current token could read the inventory and it returned zero open alerts.
- Immutable #959 identity remains issue `959`, task `20260724T075849`, branch
  `feature/auto-959-harden-mobile-ocr-parsing-for-hk-chinese-2026-07-24t0758`,
  base `ecf69d41e0dd96b9a05851af82db66e26d94ca2e`, head
  `92b60cec46114c11a47184687509d30da6f5df10`, tree
  `805fc34919cdd95ca9222b633a26cfd07d4a17b4`, and charge
  `5c9ae164d122cabccefa40f98db88134633bd594c0b2834897f51679c7d7ad78`.
  This repair, merge, issue handoff, and ledger hygiene created no #959 claim,
  charge, task, branch, worktree, validation, implementation, commit, push,
  PR, merge, label, issue-state, runtime, or product effect and did not consume
  or resume the preserved chain.
- #1012 and #959 remain open. A later separately authorized deployment,
  runtime-profile/health reconciliation, and trusted continuation of the
  preserved #959 chain remain the operational gate. #999 remains separate,
  open, unimplemented, and untouched; the agreed Scaffold Validation
  docs-only optimization is separate CI-platform work and was not performed.
- Durable evidence: #1012 merge comment
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5105604457`,
  #959 non-mutating handoff
  `https://github.com/tommytang213/Settleora/issues/959#issuecomment-5105604720`,
  source report
  `/workspace/logs/settleora-codex-report-20260728-2104-issue1012-authoritative-recovery-task-workspace-routing.md`,
  and merge/hygiene report
  `/workspace/logs/settleora-codex-report-20260728-2235-pr1015-exact-head-merge-post-merge-hygiene.md`.

### Issues #1012/#959 and PR #1013 — preserved-candidate Git authority repair merged (2026-07-28)

- PR #1013 merged normally with expected-head protection from exact authorized
  source head `43b69f065154fe576656e41d1653d24099ca4300`, tree
  `4e8df825da776979161c85c0cbb15f6648f66b27`, as merge commit
  `5f5a47b1e61132d8e695bbfdf73ea68c38489f55`. Its parents are prior `main`
  `f2cfe528060bb799d987b2423dbc955160d4ec27` and the exact source head; its
  merge tree is `4e8df825da776979161c85c0cbb15f6648f66b27`, exactly equal to the
  authorized source tree.
- The 11-path repair preserves canonical current `main` as the control plane
  and admits the exact preserved historical candidate only in an isolated
  linked worktree after literal branch, ancestry, tree, diff, path, digest,
  intent, lifecycle, claim, charge, counter, Git configuration, remote, and
  no-later-effect authority checks. Worktree creation is pre-effect-intent
  protected and crash-safe; existing worktrees require prior exact intent and
  live readback; ownership is recorded only after confirmation. Runtime
  admission remains bound to the frozen control-plane repository identity, and
  successful cleanup restores repository context, `config.repoRoot`, and cwd.
  Missing, rewritten, merged, additional, duplicate-like, dirty, ref-drifted,
  unsafe-configured, hostile-object/ref/hook/filter, untrusted-remote,
  pending-effect, or later-effect evidence remains fail closed.
- Exact-head local evidence passed `npm ci`, doctor, changed-module syntax and
  ESM imports, the complete auto-runner suite `1250/1250`, docs and scaffold
  validation, diff and exact-path scope guards, and clean-worktree checks.
  Final Gemini `strong_independent` passed at high confidence with zero
  findings; final local mechanics/integration/recovery/Git/security review
  passed with zero findings; exact-head GitHub Codex found no major issues.
  All required CodeQL, Semgrep CE/OSS, Trivy repository/aggregate, and both
  Scaffold Validation checks passed. Relevant open code-scanning alerts were
  zero; all four review threads were resolved, leaving zero unresolved
  actionable threads.
- Immutable #959 identity remained issue `959`, task `20260724T075849`, branch
  `feature/auto-959-harden-mobile-ocr-parsing-for-hk-chinese-2026-07-24t0758`,
  base `ecf69d41e0dd96b9a05851af82db66e26d94ca2e`, head
  `92b60cec46114c11a47184687509d30da6f5df10`, tree
  `805fc34919cdd95ca9222b633a26cfd07d4a17b4`, and charge
  `5c9ae164d122cabccefa40f98db88134633bd594c0b2834897f51679c7d7ad78`.
  The repair, merge, issue handoff, and ledger hygiene created no #959 claim,
  charge, task, branch, validation, implementation, PR, merge, label,
  runtime/profile/service, or product effect and did not consume or resume the
  preserved chain.
- #1012 and #959 remain open. A later separately authorized runtime
  deployment/profile/health reconciliation and one trusted continuation of the
  preserved #959 chain remain the operational gate. #989 and #991 remain
  closed after their prior close criteria; #999 remains separate, open,
  unimplemented, and untouched.
- Durable evidence: #1012 merge comment
  `https://github.com/tommytang213/Settleora/issues/1012#issuecomment-5104122601`,
  #959 non-mutating handoff
  `https://github.com/tommytang213/Settleora/issues/959#issuecomment-5104122849`,
  source report
  `/workspace/logs/settleora-codex-report-20260728-1846-issue1012-preserved-candidate-git-authority-repair.md`,
  and merge/hygiene report
  `/workspace/logs/settleora-codex-report-20260728-2021-pr1013-exact-head-merge-post-merge-hygiene.md`.

### Issues #989/#991/#959/#999 — installed runtime adopted; preserved #959 reached a new fail-closed Git contradiction (2026-07-28)

- Task `20260728-1817` adopted the already exchanged runtime without another
  deployment or rollback. Read-only verification proved source
  `82852be849332114aaeb9cc4e79b68d63e430903`, 97 manifest entries, file-list
  digest `138c46a4a4025c76b1423402e3ad424b81545292d37128b84f75ff727bcbdc6a`,
  bundle digest `a74a534b1d4e756646456d219e10459aad098630803a4c07934e0835e74b8184`,
  and stable-launcher digest
  `0f7de5e3d2ce6b359e68ad844b98a8f3872b745fc5a7f8af73a44c9467897bce`.
  The retained rollback remained source `511a2bd1ca18c406afaa12a3ccbda410674d0f5b`
  and bundle `c8344077c5882d32992482eb649f5a9919ca1bc2fa056afc677375b06f125435`.
- The external profile changed exactly once and only in
  `runtimeBundleDigest`, from `c8344077...` to `a74a534b...`. Its SHA-256
  changed from `ca92211e0fcfade2008f0b5ffeb65468b0d3ba1013117738807811dda3bf4380`
  to `1291646e3dd90edf3915b5bbb167248378f60c14063b4c0b2552bf6c89d3d31c`;
  mode `0600`, owner, size, and every unrelated byte were preserved.
- The unchanged enabled loopback health unit restarted through the stable
  launcher and installed runtime as PID `2502315`, process-birth identity
  `312077827`, with its matching owner-controlled `0600` consumer marker.
  `127.0.0.1:8787` was reachable; HTTP 503
  `reasonCode=terminal_blocked` correctly represented preserved logical-task
  state rather than a service-start failure.
- Exactly one trusted continuation was submitted with `max-tasks=1` and
  `max-runtime=14d`: supervisor
  `supervised-20260728T102310Z-3c1e9e843357`, mapped runner
  `run-2026-07-28T102319Z-3c1e9e843357`. It adopted Issue #959, task
  `20260724T075849`, and charge `5c9ae164...` with `duplicate=true` and
  `charged=false`; it created no second claim, charge, branch, implementation,
  PR, push, merge, or product effect.
- The continuation stopped fail-closed on new concrete evidence:
  `authoritative_recovery_evidence_fail_closed`. Canonical local Git was clean
  `main` at `82852be...`, while the preserved candidate is `92b60cec...`; the
  historical commit intent remained `effect_absent_execution_uncertain`,
  producing `local_git_identity_mismatch` and
  `initial_validation_failure_commit_reconstruction_ambiguous`. Preserved
  lifecycle, recovery, and budget artifacts remained byte-identical.
- #989 and #991 were closed after their deployment/profile/health and exact
  preserved-resume close criteria were met. #959 remains open for the new
  recovery blocker; parent issues #740, #359, and #357 remain open under their
  existing close rules. #999 remains separate, open, unimplemented, and was
  not mutated.
- Durable evidence: #989 comment
  `https://github.com/tommytang213/Settleora/issues/989#issuecomment-5102926438`,
  #991 comment
  `https://github.com/tommytang213/Settleora/issues/991#issuecomment-5102926941`,
  #959 comment
  `https://github.com/tommytang213/Settleora/issues/959#issuecomment-5102927423`,
  runner summary
  `/workspace/logs/auto-runner/Settleora/summaries/run-2026-07-28T102319Z-3c1e9e843357.md`,
  and final task report
  `/workspace/logs/settleora-codex-report-20260728-1817-adopt-installed-runtime-profile-health-preserved-959-continuation.md`.

### Issues #989/#991/#959/#999 and PR #1009 — preserved-recovery discovery repair merged (2026-07-28)

- PR #1009 merged normally with expected-head protection from exact authorized
  source head `cf1df8fffd462f241bccfb698296b83ad0de1bba`, tree
  `3970141e21476d3e66fe28fa41a752552adf5a41`, as merge commit
  `ea7756ade29c0a6cb000c9501203b8db7a5ba5f8`. Its parents are prior `main`
  `f8223a980e4ec3b20bd3f6b114a46865f94baad7` and the exact source head; its
  merge tree equals the authorized source tree. The repair is limited to
  `preserved-recovery-deployment.mjs`, `recovery-continuation.mjs`,
  `recovery-state.mjs`, `session-lifecycle.mjs`, and the focused
  `recovery-continuation.test.mjs`.
- The repair discovers the reconstructed preserved checkpoint, binds the
  reason-specific derivative reopen phase, preserves retryability for transient
  pre-reconstruction failures, and terminalizes repeated unsafe/ambiguous and
  permanent historical or nested lineage failures without weakening the
  existing identity, authority, or external-effect gates.
- Exact-head evidence passed focused tests `152/152`, the complete auto-runner
  suite `1247/1247`, docs, scaffold, syntax, import, scope, diff, and clean
  checks. Gemini strong-independent, local Codex mechanics/integration/
  recovery/deployment/security, and final GitHub Codex reviews passed. All 12
  required CodeQL, Semgrep, Trivy, and scaffold checks passed; all four review
  threads were resolved and relevant open code-scanning alerts were zero.
- The exact corrective deployment dry-run exited `0`, admitted immutable #959
  without mutation, and produced prospective bundle digest
  `7b49f7d975ed8e9c6e1d767246d28b67942a330abbfdf915210db4135018fc7c`.
  The #959 lifecycle, recovery, logical-task budget, prompt, and summary hashes
  remained unchanged, as did required modes `0755`, `0755`, and `0600` for the
  canonical repository, `.git`, and deployment lock respectively.
- Durable evidence: the source issue comment is
  `https://github.com/tommytang213/Settleora/issues/991#issuecomment-5101846778`;
  the final report is
  `/workspace/logs/settleora-codex-report-20260728-1612-pr1009-exact-head-merge-post-merge-hygiene.md`.
- #989, #991, and #959 remain open pending freshly authorized runtime
  deployment/profile/health reconciliation and one trusted continuation of the
  preserved #959 chain. #999 remains separate, open, unimplemented, and
  untouched by this task.
- The source merge and ledger hygiene performed no deployment, rollback,
  runtime/profile mutation, service/health control, runner or supervisor
  submission, #959 lifecycle/recovery/product mutation, secret/network change,
  or destructive branch/worktree operation.

### Issues #989/#991/#959/#999 and PR #1007 — historical candidate recovery repair merged (2026-07-28)

- PR #1007 merged normally with expected-head protection from exact authorized
  source head `c701d5c93f240db79c287e1c00bdbd0fba48de40`, tree
  `ad39a180b2001a13df0d5f758aef295a86dea1fa`, as merge commit/current `main`
  `c9127520430aa8398a58a40ab956c9633bdd283e`. Its parents are prior `main`
  `511a2bd1ca18c406afaa12a3ccbda410674d0f5b` and the exact source head; its
  merge tree equals the authorized source tree, and the retained source branch
  and worktree remain unchanged and clean.
- The repository recovery repair now fail-closes historical initial-candidate
  reconstruction on trusted Git configuration, authentic candidate and
  descendant lineage, current-main and prospective-merge identity, exact PR
  and external-effect history, and restart-safe continuation authority. It
  does not itself deploy the corrected runtime or adopt the preserved #959
  chain.
- Exact-head evidence passed focused tests `431/431`, the complete auto-runner
  suite `1243/1243`, docs, scaffold, syntax, scope, diff, and clean-worktree
  checks. Gemini strong-independent and local Codex mechanics/integration/
  recovery/security reviews passed with no findings; GitHub Codex found no
  major issues on the exact head. All required CodeQL, Semgrep, Trivy, and
  scaffold checks passed; relevant open code-scanning alerts and unresolved
  review threads were zero.
- Durable evidence: the exact source-merge comment is
  `https://github.com/tommytang213/Settleora/issues/989#issuecomment-5100211347`;
  the complete merge/hygiene report is
  `/workspace/logs/settleora-codex-report-20260728-1301-pr1007-exact-head-merge-post-merge-hygiene.md`.
- #989 and #991 remain open pending separately authorized corrected runtime
  deployment, active-profile and health reconciliation, and one exact trusted
  continuation of the preserved #959 chain. #959 remains open and preserved:
  no claim, charge, task key, branch, candidate, validation, PR, or product
  effect was replayed or duplicated. #999 remains open as a separate
  unimplemented review-adjudication follow-up.
- The source merge and this ledger hygiene performed no deployment, rollback,
  runtime/profile mutation, service/timer control, runner or supervisor
  submission, #959 lifecycle/recovery/product mutation, secret/network change,
  or destructive branch/worktree operation.

### Issues #989/#991/#959/#999 and PR #1003 — handoff successor identity repair merged (2026-07-27)

- PR #1003 merged normally with expected-head protection from exact approved
  source head `6324552bde849fa87b309e1ab13664208d69694a`, tree
  `a002a79e2d1023bd78bec94104b879a6cf130ad5`, as merge commit
  `28c5dda3a92705cc939f78717ac6e3576f58f10e`. Its parents are prior `main`
  `5e5e549fab7b40d55d0e03cae31ee94c8dbdfaf5` and the exact source head; the
  merge tree equals the approved source tree, and the source branch/worktree
  remain retained unchanged and clean.
- The repair binds pending recovery-successor identity to the original run,
  durable recovery operation, and exact handoff request. Completed exact
  handoffs may adopt only their recorded current, active, non-retired
  successor. Pending request, operation, generation, and successor
  contradictions fail closed; completed adoption remains bound to the
  authoritative recorded successor/current-owner/generation and retirement
  checks. The existing rotation, compare-and-swap, checkpoint, lock,
  exact-head, completed-effect, and retired-session invariants remain intact.
- Exact-head validation passed focused tests `135/135`, the complete
  auto-runner suite `1217/1217`, `npm ci` with zero vulnerabilities, doctor,
  syntax, docs, scaffold, scope, and diff checks. Gemini strong-independent
  and local Codex mechanics/integration/recovery/security reviews passed with
  zero findings; GitHub Codex found no major issues on the exact head.
  CodeQL, Semgrep CE/OSS, Trivy, and both Scaffold Validation runs passed;
  unresolved review threads and open code-scanning alerts were zero.
- Evidence: the exact source-merge comment is
  `https://github.com/tommytang213/Settleora/issues/989#issuecomment-5087891453`;
  the complete merge/hygiene report is
  `/workspace/logs/settleora-codex-report-20260727-1403-pr1003-exact-head-merge-hygiene.md`.
- #989 remains open pending a separately authorized deployment/readback of the
  newly merged runtime, active-profile digest reconciliation if required, and
  then a separately authorized exact trusted adoption of the preserved #959
  chain. #991 remains open pending the same successful adoption and close
  criteria. #959 remains open pending completion of its preserved OCR chain.
  #999 remains open as separate review-adjudication hardening.
- The source merge and this ledger hygiene performed no deployment, rollback,
  profile mutation, service/timer control, runner or supervisor submission, or
  #959 lifecycle, recovery, budget, intent, issue, checkout, or product-source
  mutation.

### Issues #991/#989/#959/#999 and PR #1001 — repository repair merged, operational gates retained (2026-07-27)

- PR #1001 merged normally with expected-head protection from exact approved
  source head `a3a1e397d8a33b1d0915017caee21f3db25d3682`, tree
  `1fd5ed4ee90f61123733c364c0c6bb47aec361ba`, as merge commit
  `63c2e79e12e75473d2816e6be9a10bed6bf251e2`. Its parents are prior `main`
  `5fb766bc63e3c1bf0fe5812cee448a3de77e5299` and the exact source head; the
  merge tree equals the approved source tree, and the source branch is
  retained unchanged.
- The merged repair admits derivative target intent history only after exact
  identity validation and bounded authoritative reconciliation. Exact
  finalized validation-failure label hygiene is completed evidence only and
  grants no mutation authority. Prepared validation-failure comments must bind
  the exact issue, outcome, and body digest and are safely adopted only after
  authoritative presence; uncertain, ambiguous, foreign, contradictory, or
  otherwise inconsistent external effects continue to fail closed.
- Exact-head validation passed focused tests `173/173`, the complete
  auto-runner suite `1215/1215`, `npm ci`, doctor, syntax, docs, scaffold, and
  diff checks. Gemini strong-independent and local Codex reviews passed with
  zero findings; GitHub Codex found no major issues. CodeQL for all configured
  languages and aggregate, Semgrep CE/OSS, Trivy repository/status, and both
  Scaffold Validation runs succeeded. All four earlier review threads were
  resolved; unresolved-thread count was zero.
- Repository scope is complete, but #991 remains open pending a separately
  authorized corrected runtime deployment/readback and one separately
  authorized trusted adoption of the preserved #959 chain. #989 remains open
  for its live deployment/restart close criteria. #959 remains open until its
  preserved OCR chain completes and merges. #999 remains open as separate
  review-adjudication hardening work.
- This repository merge and ledger hygiene performed no runtime deployment or
  rollback, service control or restart, runner or supervisor start,
  runtime-copy mutation, or #959 mutation/resume.

### Current checkpoint — #912 production activation (2026-07-24)

- #912 live activation is accepted: external runtime/profiles, project user
  units, loopback health, notifier timer, two runnable canaries, skip fixtures,
  rollback/refusal/restore, and the unexecuted 500-task/14-day dry-run passed.
- Acceptance-doc PR #988 is the remaining repository/current-main gate; #912
  and #910 remain open only until that merge and exact close-rule hygiene.
- The detailed task `20260724-0946` evidence appears in the activation section
  below. Older entries are historical snapshots and do not override this
  checkpoint or live GitHub/systemd/runtime evidence.

### Issue #951 — external runtime/repository separation implementation (2026-07-23)

- Root task `20260723-1455` started from exact main
  `c285a275934a00b4e57138304bd1e71a5d0b99a6` after PRs #949/#950 and #947
  were reconciled complete and no prior #951 continuation or owner existed.
- The candidate introduces explicit runtime/repository/log/project/GitHub
  identities, runtime-bound absolute child entrypoints, project-bound state and
  same-repository authority locks, a deterministic generic runtime bundle
  manifest, and an expected-old-digest protected manual deployment utility.
- Acceptance uses isolated temporary repositories and copied runtime paths;
  no external runtime, profile, service, or historical log root is changed.
  At that historical #951 checkpoint, #910/#912 remained open and #912 was
  manual-gated and unactivated; #912 subsequently completed activation.

### Issue #947 and PR #949 — merged safe ephemeral cleanup (2026-07-23)

- Root task `20260723-1007` was admitted once from main
  `0688c4b9ad48f7ca8c8770584c097de4ee561535`. PR #949 merged normally at
  exact reviewed source head `929169d9315fc07701c17a45e62c0079157bdb62`
  as merge commit/current main `210310d4cf292c63d2d2ba4a85845780144cbe2f`.
- The merged `ephemeral_cleanup_v1` authority requires versioned positive
  ownership, exact PR/head/target acceptance, complete issue/report/dependency
  hygiene, protected/default/release exclusions, and a clean inactive exact
  worktree before any task-scoped deletion. Name shape alone is never deletion
  authority, historical bulk cleanup remains forbidden, and an already absent
  merged remote is adopted rather than restored.
- Exact effects use fixed arguments, immediate drift checks, durable
  intent/confirmation, and restart adoption. Cleanup failure preserves merge
  success as `cleanup_required`; durable report export and exact persisted
  ownership span linked-worktree removal and auto-delete crash windows.
- Exact-head and current-main acceptance passed runner `1143/1143`, secret
  boundary `31/31`, docs/scaffold/doctor/syntax/diff checks, and Semgrep 1.167.0
  with zero findings across 568 rules and 1,578 tracked files. Fresh Gemini and
  local Codex passed; GitHub Codex found no major issues on the final head; all
  GitHub checks/scanners passed; unresolved threads and open alerts were zero.
- Isolated acceptance deleted only exact positively owned task refs/worktrees
  and retained concurrent manual state. No historical, protected, release,
  manual, or unowned branch was deleted. #947 is close-ready after this derived
  checkpoint lands.
- #910 remains open; #912 remains open, manual-gated, unactivated, and not
  auto-eligible; #946 remains deferred.

### Issue #944 and PRs #945/#948 — merged source-failure convergence (2026-07-22)

- PR #945 merged normally at exact reviewed source head
  `b38adcb1a12c66140936b526797fc8090cd77a92` as merge commit/current-main
  acceptance head `2db4d4af13e8b56edb2452d95fc3360c3295bc77`; the source branch is retained.
- Focused hygiene PR #948 merged exact source head
  `cfa822ae140eb681c08b06d92fa0b41cee0979b3` as
  `0688c4b9ad48f7ca8c8770584c097de4ee561535`.
- Scope is runner/docs tooling only: a normalized local/CI/scanner/reviewer
  failure contract, shared ordinary-continuation source-fix routing, durable
  no-progress/status projection, and ordinary mobile Android debug APK proof.
- Exact-head and current-main acceptance passed: runner `1124/1124`, secret
  boundary `31/31`, Flutter analyze and `843/843` tests, Android debug APK,
  GitHub scaffold/CodeQL/Semgrep/Trivy, zero unresolved review threads, and zero
  open code-scanning alerts. #944 closed with the merge at
  `2026-07-22T19:45:17Z` and should remain closed because its close rule is
  satisfied. #910 remains open for #912; #912 remains manual-gated and
  unactivated. PR #917 remains closed without merge and untouched.

### Issue #927 and PR #942 — merged completion (2026-07-22)

- PR #942 merged normally at exact reviewed source head
  `2a536d23b3961353819a821b16ef9376a6fa76d4` as merge commit/current main
  `960a4d9a09c55c728b01738d9ff1d778cf04e928`; the source branch remains
  retained at the reviewed head.
- The merge supplies canonical bounded `operational_status_v1` JSON/Markdown
  exports from one normalized model, trusted live/local/evidence/derived
  reconciliation, the state-class inventory, and milestone/batched ledger
  policy. Routine transitions cannot request ledger-only work, and stale ledger
  text remains non-authoritative.
- Exact-head evidence: auto-runner `1095/1095`, secret boundary `31/31`, docs,
  scaffold, doctor, syntax, and diff checks passed; Semgrep 1.167.0 reported
  zero findings across 568 rules and 1,574 targets; fresh Gemini and local
  Codex passed; GitHub Codex reported no issues on the exact head; all GitHub
  checks/scanners passed; unresolved threads and relevant alerts were zero.
- Current-main acceptance passed projection `43/43`, production recovery
  wiring `17/17`, and secret boundary `31/31`. The live CLI emitted bounded
  read-only JSON/Markdown and correctly failed closed on retained historical
  local authority.
- Atomic versioned JSON/JSONL remains the measured storage backend; no
  transactional cross-record or indexed-query need justified SQLite/WAL.
- #927 is closed. #910 remains open, with #912 as the separate untouched manual
  production-activation gate.

### Issue #924 and PR #940 — merged completion (2026-07-21)

- PR #940 merged normally at exact reviewed source head
  `1b7799265508b0613d42c350ac535e55895fadc0` as merge commit/current main
  `2dec97fe5e2ddf1d3562b70a76825cfdc8ba81b2`; the retained source branch
  remains at the reviewed head.
- The merge supplies the shared ordinary post-implementation/startup-recovery
  continuation authority and deterministic feature-bundle split
  materialization with existing PR-stack handoff. Review-fix commits persist
  replacement identity before fallible recertification, and continuations or
  split PRs do not consume additional accepted logical-task charges.
- Exact-head evidence: runner `1048/1048`, secret boundary `31/31`, docs,
  scaffold, doctor, syntax, and diff checks passed; Semgrep 1.167.0 reported
  zero findings across 568 rules and 1,572 targets; fresh Gemini and local
  Codex passed; all GitHub checks/scanners passed; GitHub Codex reviewed the
  exact head; unresolved threads and open code-scanning alerts were zero.
- Current-main acceptance passed `203/203` across normal, coherent-large,
  deterministic mixed split/block, and provider/context-limit routing,
  including review-phase startup recovery and split-to-stack handoff.
- #924 is closed under its four-path close rule. Its next implementation gate,
  #927, is now also closed through PR #942; #912 remains untouched and manual.

### Issues #928/#929 and PR #938 — merged completion (2026-07-21)

- PR #938 merged normally at exact reviewed source head
  `b056862581d7184a2796e2cdf3cfa1777eac6de1` as merge commit
  `510942d40d2d512094b9af430ccc40f65a505d0c`. Its parents are prior `main`
  `b221ff32fb896d3488d06f53da714aec1e2d7ec2` and the exact source head.
- Post-merge proof: fetched `origin/main` equals the merge SHA, the merge and
  source head are ancestors of current `main`, and the retained source branch
  remains at the exact reviewed head.
- #929 slice adds versioned proactive context budgeting, deterministic
  fallback telemetry, warning/mandatory/emergency thresholds, checkpoint-first
  rotation, ownerless handoff, successor generation validation, cooldown, and
  repeated-rotation counter/charge preservation.
- #928 slice adds the documented seven interruption classes, active-owner
  exclusion, dead-owner recovery, checkpoint/identity validation, earliest
  safe incomplete phase selection, live-effect reconciliation, and idempotent
  no-replay recovery/report correlation.
- Authority remains separated: #923 owns local/GitHub convergence counters;
  #932 owns accepted logical-task charging; #927 projects sanitized state;
  #924 owns large-candidate routing; #910 remains the umbrella; #912 remains
  the untouched production activation gate.
- Exact-head evidence: the full runner suite passed `1012/1012`, secret-boundary
  tests passed `31/31`, docs/scaffold/doctor/syntax/diff checks passed, local
  Semgrep found zero findings, fresh Gemini and local Codex passed, GitHub
  Codex found no major issues, all Scaffold/CodeQL/Semgrep CE and OSS/Trivy
  gates passed, and unresolved review threads were zero.
- Production-shaped deterministic acceptance covered the seven recovery
  classifications, terminal lifecycle/effect adoption without replay,
  proactive threshold rotation, bounded disk-first handoff, mixed-queue
  continuation, and long-run/50-cycle exact-once behavior.
- #928 and #929 are closed under their narrow close rules. #910 remains open;
  #924 and #927 remain open for their separate implementation/acceptance scope;
  and #912 remains the untouched manual production-activation gate.


## Purpose

This ledger prevents stale GitHub issue or Project state from causing duplicated
work. Current repo state, merged PRs, issue comments, and latest Codex reports
remain the source of truth.

## Rules

- An open issue is not proof of unfinished scope, and a closed issue is not
  proof that every adjacent Day 1 runtime slice is complete.
- Before planning issue-based work, check merged PRs, issue comments, recent
  `.codex/reports/` files, relevant planning docs, and this ledger.
- Do not close ambiguous umbrella issues automatically.
- Record completed slices, remaining Day 1 work, future gates, blockers,
  manual decisions, and close/keep-open recommendations.
- If a PR, merge SHA, report, or project field cannot be verified, write
  `unverified` and leave the issue or project row unchanged.

## Current Checkpoints

### Issues #923/#932 and PR #936 - merged completion - 20260720-2035

- PR #936 merged normally to `main` after the repository owner's explicit
  one-PR approval at exact source head
  `add8b01c97e054e14dd9532adc2b167e530f41de`.
- Merge SHA: `58a0164f15a77b3d5338a1c00eb4892693e70970`;
  merged at `2026-07-20T12:42:09Z`.
- Post-merge proof: the merge parents are prior `main`
  `2d7b87bccec4a53bcaa7bb5d165784372779aacf` and the approved source head;
  fetched `origin/main` equals the merge SHA; the source head is an ancestor;
  and the retained source branch remains unchanged at the approved head.
- Exact-head evidence remained clean after merge: local auto-runner suite
  `867/867`, fresh Gemini and local Codex passes, GitHub Codex with no major
  issues, all Scaffold/CodeQL/Semgrep CE and OSS/Trivy checks passing, zero
  unresolved review threads, and zero open code-scanning alerts.
- #923 is closed under its narrow two-loop/counter close rule. PR #936 itself
  supplied the task-scoped non-production convergence candidate across
  repeated local and GitHub review-fix rounds.
- #932 is closed under its narrow exactly-once accepted logical-task accounting
  close rule. Pre-claim skips/dry runs remain uncharged; accepted tasks charge
  once; restart, recovery, retries, polling, and session continuation do not
  recharge; nested counters remain separate.
- #910 remains open. #912 remains the separate manual production-activation
  gate. #924, #927, #928, and #929 remain open under their own close rules.
- #927 received no duplicate post-merge comment because projection
  compatibility did not change. #929 received no duplicate post-merge comment
  because the interface/rotation relationship did not change.
- The #932 manual requirement was satisfied as a one-time approval for PR #936
  only. It does not rewrite or conflict with the broader autonomous-merge
  policy, so no policy-correction issue is required.
- Report:
  `/workspace/logs/settleora-codex-report-20260720-2035-pr936-human-approved-final-merge.md`.

### Auto-runner post-acceptance reconciliation - 20260720-1321

- Verified current-main SHA:
  `2dec1153f9cd353150df890dfd63da06abaec9ad`.
- Completed chain:
  PR #930 merged at `78c0e747bc799b1a7ba7777580a4ae96e68e3c4a`,
  PR #919 at `2662b02f8db3c39a4c385c748bc2ccfe085e47f1`,
  PR #920 at `af9602fb5576501c38c08392ba27820a3a1df729`,
  and corrective PR #931 at
  `2dec1153f9cd353150df890dfd63da06abaec9ad`.
- #913 and #921 are closed after their narrow implementation, validation,
  review/scanner, live acceptance, correction, and idempotent readback gates
  passed. Separate follow-ups do not reopen or expand their close rules.
- PR #917 is closed without merge as fully superseded. Its frozen head remains
  `3110a19c031f956fec8521d1e0d1b206dee3d8c0`, and source branch
  `feature/auto-913-bounded-outage-resubmission-20260715-0013` is retained.
  The rewritten split had no identical stable patch IDs, but semantic/file
  comparison proved equivalent or stronger current-main behavior, including
  the Route B terminal-field positive allowlist that resolves #917's last
  unresolved finding. No unique required behavior, test, or safety guarantee
  remains solely in #917.
- #910 stays open as the readiness umbrella. #912 stays open as the separate
  unperformed manual production-activation gate.
- Current narrow ownership:
  #923 owns the inner local and outer GitHub convergence loops and blocking
  nested counter policy; #924 owns large-candidate escalation and safe split
  routing; #927 projects authoritative state/counters only; #928 owns
  interruption recovery; #929 owns proactive fresh-session rotation; and #932
  owns accepted logical-task accounting and cross-counter reporting.
  Implementation is present on feature branch
  `feature/auto-runner-two-loop-logical-task-budget-20260720-1409`: durable
  nested counters and a separate exactly-once accepted-task charge ledger are
  under cumulative validation/review. Closure still requires merged exact-head
  proof and the documented non-production acceptance evidence.
- The inner loop is validation, fresh Gemini, fresh local Codex, one bounded
  source-fix batch, then repeat until both pass. The outer loop updates the
  same PR, waits for GitHub Codex/CI/scanners/threads, and returns every
  source-changing finding to the complete inner loop before another push and
  exact-head merge gate.
- `localSourceChangingRoundsPerEpoch` is capped at 50 per local epoch and
  resets only for a new GitHub-triggered local epoch;
  `githubTriggeredFixEpochsPerPr` is capped at 50 cumulative per PR;
  `lifetimeLocalSourceChangingRounds` is telemetry only.
- Only a successfully claimed/accepted logical task consumes one top-level
  unit. A later blocked or failed accepted task counts once. Pre-claim skips,
  nested review/fix rounds, retries/polls, restarts, recovery continuation, and
  session rotation do not consume extra top-level units.
- Project fields were unavailable (`projectItems` empty), so no status field
  was guessed or mutated. Production profile, systemd/deployment,
  secrets/configuration, public exposure, and genuine manual authorities
  remain unperformed.
- Report:
  `/workspace/logs/settleora-codex-report-20260720-1321-auto-runner-post-acceptance-hygiene.md`.

### Issue #913 - bounded outage resubmission feature bundle in progress

- Task key: `20260715-0013`.
- Branch:
  `feature/auto-913-bounded-outage-resubmission-20260715-0013`.
- Starting current-main:
  `3b3212c43c702db3cabdaff1c28d089f39c54441`.
- Predecessor:
  #902 completed through PR #916, source head
  `3cde022834cb3097c2a6aa5cccd0e837e48dec48`, merged as current-main
  `3b3212c43c702db3cabdaff1c28d089f39c54441`.
- Completed checkpoints on this branch:
  - `2e100e1` - `Model bounded outage resubmission`.
  - `165aac3` - `Wire supervisor outage recovery`.
- Current scope:
  default-off supervisor-side bounded outage resubmission foundation,
  recovery-first controller dry-run planning, strict outage taxonomy,
  backoff/jitter/attempt/wall-clock bounds, circuit breaker, exact
  correlation, duplicate/uncertain child prevention, immutable child task/head/
  PR identity persistence, disk-only child reconciliation, stale-head
  invalidation, operator pause/stop and lock safety, sanitized
  status/health/monitoring docs, and fixture-only acceptance.
- Safety:
  no production profile activation, no live supervisor run, no systemd
  enablement/start/restart, no canary run, no #912 activation, no product
  runtime/API/auth/storage/money/schema/OpenAPI/generated-client/deployment/
  secret changes.
- Tracker state:
  #910 remains open. #912 remains open, manual-gated, and unactivated. #913
  remains open until a later exact-head merge/current-main proof and closure
  task. This ledger is supporting/cache-only; live GitHub, PR checks, reports,
  and repository state remain authoritative.
### Issue #921 - Live stack acceptance controller wiring corrective checkpoint - 20260718-0022

- Acceptance attempt task: `20260717-2347`.
- Blocker report:
  `/workspace/logs/settleora-codex-report-20260717-2347-pr919-pr920-live-stack-acceptance.md`.
- Terminal status:
  `LIVE_STACK_ACCEPTANCE_CONTROLLER_WIRING_MISSING`.
- Verified blocker:
  `pr-stack-controller.mjs` exposed planning/proof/read-only fixture
  primitives, but no documented production stack execution entry could dispatch
  parent convergence, exact-head gates, parent merge, current-main proof, child
  retarget, semantic own-delta proof, ready transition, child convergence/
  merge, and exact-once hygiene from durable state.
- Corrective branch:
  `feature/auto-921-live-stack-executor-20260718-0022`.
- Corrective scope:
  add a default-off `--run-pr-stack --stack-plan <absolute-path> --config
  <absolute-path>` entry, durable stack state, injectable production adapters,
  stack config/capability gates, deterministic tests, and documentation.
- Live stack mutation:
  none during the blocker attempt and none during this corrective
  implementation. #919 and #920 remain unchanged until an explicit post-merge
  acceptance resume uses the durable state under
  `/workspace/logs/settleora-auto-runner/live-stack-acceptance/20260717-2347/`.
- Issue state:
  #921 remains open; #913 remains open pending replacement stack completion;
  #910 remains open as parent tracker. #912 is inactive/manual-gated.
- Protected related work:
  #917 must not enter executable stack work. #923/#924 are untouched and
  unclaimed. #865/#866 canaries remain protected.
- Project fields:
  `not_updated`; no tested mapping was exercised.
- Next gate:
  merge the corrective PR only after its validation/review/CI gates pass, then
  resume the same durable #919 -> #920 acceptance state without production
  profile activation. Do not claim live acceptance has passed before that
  resume completes.

### Issue #921 - Bounded review convergence and dependent PR stack loop

- Task key: `20260717-0040`.
- Parent tracker: #910.
- Historical context:
  #800, #893, and #894 remain closed valid foundation records, but current
  live code before this task still had a one-cycle/two-lane review-fix
  limitation and no durable dependent-PR stack convergence controller.
- Focused issue:
  #921, `Auto-runner bounded review convergence and dependent PR stack loop`,
  open under #910.
- Branch:
  `feature/auto-921-review-convergence-stack-loop-20260717-0040`.
- PR:
  #922, `Add bounded review convergence and dependent PR stack loop`,
  merged to `main`.
- Final source head:
  `991c0fd35d1df9843c1463f7a580c39dd9c316b8`.
- Merge SHA:
  `cf1ee65aa209243525f3ccbddd4cf46fa698f666`.
- Merged at:
  `2026-07-17T15:20:51Z`.
- PR scope:
  workflow/tooling only under `tools/auto-runner/**`, the auto-runner workflow
  docs, this ledger, and
  `docs/planning/AUTO_RUNNER_REVIEW_CONVERGENCE_STACK_LOOP_921.md`.
- Completed implementation slices in this branch:
  durable review-convergence state, 50-cycle exact-head convergence controller,
  contract-approved review-fix mutation lanes with stronger sensitive gates,
  and durable dependent-PR stack planning/execution primitives.
- Final PR #922 evidence:
  - Source-changing cycle: `26`.
  - Final patch digest:
    `6587d2e2e11f394c7967d1efc47e00481e0e79b7dd462900b054903795ede8ee`.
  - Final changed-path count: `18`.
  - Full auto-runner suite: `579/579`.
  - Task-scoped preflight: `24 pass / 4 warn / 0 fail`.
  - Docs/scaffold validation: pass.
  - Strong independent review: pass.
  - Compact mechanics/security review: pass.
  - Exact-head GitHub Codex result:
    `Codex Review: Didn't find any major issues.`.
  - Exact-head CI/scanners: Scaffold Validation, CodeQL, Semgrep CE/OSS, and
    Trivy passed.
  - Open code-scanning alerts: `0`.
- Post-merge issue checkpoints:
  - #910 checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/910#issuecomment-5004765376`.
  - #921 checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/921#issuecomment-5004765360`.
- Live issue state:
  #910 remains open. #921 remains open by its close rule until the later
  task-scoped live #919 -> #920 acceptance completes.
- First live acceptance stack after merge:
  #919 -> #920 remains the outstanding acceptance sequence. PR #919 is open
  and non-draft against `main` at
  `056638c2a5a798c7b8d78177761d0f218a65c295`; PR #920 is open and draft
  against `feature/auto-913-targeted-recovery-child-supervisor-20260716-1213`
  at `5e131211224d5ed8460287bd88321dce181e60e3`. This ledger hygiene task
  does not claim, execute, retarget, ready, review, merge, or otherwise mutate
  that stack.
- Manual gates preserved:
  production deploy, store release, destructive operations, secrets/auth config
  mutation, public/admin exposure, Day 1 scope cuts, architecture replacement,
  force-like history, branch deletion, unresolved product/policy/security/
  privacy/financial authority choices, and production profile activation.
- Protected issue state:
  #912 remains inactive/manual-gated. #913 remains open and unchanged.
  #923/#924 remain open, untouched, and unclaimed. #865/#866 remain unchanged.
- Production profile:
  not activated.
- Project fields:
  `not_updated`; no tested mapping was exercised.
- Close/keep-open recommendation:
  keep #921 open until the task-scoped live #919 -> #920 acceptance completes.
  Keep #910 open. Keep #912 open and unactivated. Keep #913/#923/#924/#865/#866
  unchanged unless a separate task authorizes mutation.
- Last verified repo SHA:
  `cf1ee65aa209243525f3ccbddd4cf46fa698f666` on current `main` after PR #922
  merge.

### Auto-runner operational readiness plan - 20260714-1010

- Task key: `20260714-1010`.
- Branch:
  `docs/auto-runner-operational-readiness-plan-20260714-1010`.
- Starting `origin/main`:
  `d923655348e232fff1642d563a02f9d610196faa`.
- Planning artifact:
  `docs/planning/AUTO_RUNNER_OPERATIONAL_READINESS_PLAN.md`.
- Scope:
  operational activation planning only. This checkpoint does not activate
  external profiles, run canaries, change runner/mobile implementation, dismiss
  scanner alerts, change settlement/payment/bill calculation logic, alter
  schemas, change OpenAPI/generated clients, deploy, release, or mutate
  secrets.
- Key planned follow-ups:
  production profile activation/live acceptance, canonical
  `mobile-build-config` lane, #902 scanner/dependency ingestion with strongly
  proven false-positive automatic disposition, bounded outage resubmission, and
  continued ledger cache-only hierarchy.
- Ledger hierarchy:
  this row is a derived convenience index. Current GitHub state, PR state,
  checks, scanners, exact reports, and the current repository tree remain
  authoritative for selection, duplication, completion, closure, and merge
  gates.
- Close/keep-open recommendation:
  keep any readiness umbrella open until the implementation/activation children
  are complete. Do not use this ledger row as proof that external production
  activation or #902 implementation has occurred.

### Issues #889/#894/#800 - Auto-runner foundation completed

- Task key: `20260714-0143`.
- PR #907:
  - Source branch:
    `tools/auto-runner-final-acceptance-894-20260713-2358`.
  - Source head:
    `9472142f69b5db443d1d1693f4a68e38e491d96f`.
  - Merge SHA:
    `e58340855ab5f700342ce1bfa02d12d2e287b5b3`.
- PR #908:
  - Source branch:
    `docs/auto-runner-foundation-finalization-20260714-0107`.
  - Source head:
    `f12d3ad1721506d1b9fa3d72f78a1417d457ff85`.
  - Merge SHA:
    `4cbb807d09eb732699fb82acc0336f985b94b617`.
  - Changed files: exactly the five finalization documentation paths.
- Final current-main validation/check/scanner evidence on
  `4cbb807d09eb732699fb82acc0336f985b94b617`:
  `npm ci`, `npm run doctor:validation`, required syntax checks, focused
  large-bundle tests `31/31`, focused auto-runner tests `191/191`, full
  auto-runner tests `393/393`, readiness `27 pass / 1 warn / 0 fail`,
  `npm run validate:docs`, and `npm run validate:scaffold` all passed.
  Current-main Scaffold Validation, CodeQL configured analyses, Semgrep CE/OSS
  where observed/configured, Trivy, and API Image GHCR passed.
  Current-main and repository open code-scanning alerts were `[]`; no scanner
  finding was dismissed, suppressed, waived, or excluded.
- Final issue comments and closure states:
  - #889 completion comment:
    `https://github.com/tommytang213/Settleora/issues/889#issuecomment-4961074327`;
    state `CLOSED`; closed at `2026-07-13T17:49:53Z`.
  - #894 final acceptance comment:
    `https://github.com/tommytang213/Settleora/issues/894#issuecomment-4961077405`;
    state `CLOSED`; closed at `2026-07-13T18:05:44Z`.
  - #800 final umbrella comment:
    `https://github.com/tommytang213/Settleora/issues/800#issuecomment-4961080593`;
    state `CLOSED`; closed at `2026-07-13T18:06:05Z`.
- #902 remains `OPEN`, untouched by the foundation closure tasks, commentless
  for those tasks, and next as the separate post-foundation Dependabot and
  code-scanning ingestion enhancement.
- Protected canaries #865 and #866 remained unchanged: open with labels exactly
  `area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`, zero
  comments, no assignees, and no milestone.
- Project fields:
  `not_updated`; no supported tested mapping was exercised.
- Close recommendation:
  already executed for #889, #894, and #800 after PR #908 and final
  current-main proof. There is no remaining auto-runner foundation gate.
  Closing #800 means the auto-runner foundation A-H scope is complete; it does
  not mean Settleora product Day 1 is complete.

### Issues #889/#894/#800 - Historical: PR #907 merged, finalization pending

This checkpoint is superseded by the `20260714-0143` completion checkpoint
above. It remains as historical audit trail for the post-PR-907/pre-PR-908
state.

- Task key: `20260714-0107`.
- PR #907:
  - Source branch:
    `tools/auto-runner-final-acceptance-894-20260713-2358`.
  - Source head:
    `9472142f69b5db443d1d1693f4a68e38e491d96f`.
  - Merge SHA:
    `e58340855ab5f700342ce1bfa02d12d2e287b5b3`.
  - Merge parents verified:
    `b930badaa65ea72e8727c8ca272b3299a8174d35`
    then `9472142f69b5db443d1d1693f4a68e38e491d96f`.
- Post-merge current-main proof on
  `e58340855ab5f700342ce1bfa02d12d2e287b5b3`:
  `npm ci`, `npm run doctor:validation`, syntax checks for
  `auto-merge-policy.mjs`, `lane-policy.mjs`, `reviewer-policy.mjs`, and
  `auto-runner.test.mjs`, focused large-bundle tests `31/31`,
  `auto-runner.test.mjs` `191/191`, full auto-runner tests `393/393`,
  readiness `27 pass / 1 warn / 0 fail`, `npm run validate:docs`, and
  `npm run validate:scaffold` all passed.
- Current-main GitHub checks on the PR #907 merge SHA passed: Scaffold
  Validation, CodeQL, Semgrep CE, Trivy repository scan, and API Image GHCR.
  Current-main open code-scanning alerts were `0`; no scanner finding was
  dismissed, suppressed, waived, or excluded.
- Issue hygiene:
  #889 was auto-closed by GitHub when PR #907 merged, then reopened because
  this task requires #889 to remain open until the finalization PR and final
  current-main proof also pass. #889, #894, and #800 remain open pending the
  finalization PR. #902 remains open, commentless for this task, and
  unstarted.
- Protected canaries:
  #865 and #866 remain open with exact labels `area:mobile-ui`,
  `auto-canary-ready`, `canary`, and `workflow`, zero comments, no assignees,
  and no milestone.
- Project fields:
  `not_updated`; no supported tested mapping was exercised.
- Close recommendation:
  after the focused finalization PR merges and final current-main
  validation/check/scanner/canary reconciliation passes, close #889, #894, and
  #800 as completed with evidence comments. Closing #800 means the auto-runner
  foundation A-H scope is complete; it does not mean Settleora product Day 1 is
  complete. #902 is the next eligible post-foundation enhancement.

### Issue #889 / PR #907 - High-risk approved-domain auto-merge correction checkpoint

- Task key: `20260714-0033`.
- Branch:
  `tools/auto-runner-final-acceptance-894-20260713-2358`.
- Original PR #907 head:
  `b95624196d2dcfbb38e94b99c2d47c646908e538`.
- Verified defect:
  at the original PR #907 head,
  `tools/auto-runner/lib/auto-merge-policy.mjs` excluded the seven canonical
  high-risk runnable lanes from `approvedDomainAutoMergeLanes` and blocked
  them through a categorical manual-gated auto-merge set:
  `auth-session-security`, `storage-file-privacy-authz`,
  `money-settlement-payment`, `schema-migrations`,
  `openapi-generated-clients`, `sync-import-export-restore`, and
  `docker-compose-ci-deployment`.
- Correction scope:
  remove the categorical high-risk lane auto-merge prohibition, preserve
  genuine manual-action gates, add positive and negative exact-gate regression
  coverage, and supersede the old #894 all-rows-pass acceptance wording.
- Issue hygiene:
  #889 must remain open until PR #907 merges, post-merge current-main proof
  passes, the focused finalization PR merges, and final current-main proof
  passes. #894 and #800 remain open. #902 remains post-foundation and
  unstarted. Protected canaries #865/#866 must remain unchanged.
- Manual boundary:
  repository code in high-risk runnable lanes may be eligible for auto-merge
  only after explicit external config approval, valid issue contract,
  exact path/profile/branch evidence, strong independent review, Codex
  mechanics/security review, CI/security/scanner/thread/issue gates, and
  unchanged base/head final refresh. Production deploys, mobile store release,
  destructive application, secret/auth-config mutation, public/admin/network
  exposure, force-like history, branch cleanup, Day 1 cuts, architecture
  replacement, and unresolved authority decisions remain manual.

### Issue #894 - Final auto-runner foundation acceptance checkpoint

- Task key: `20260713-2358`.
- Branch:
  `tools/auto-runner-final-acceptance-894-20260713-2358`.
- Base:
  exact `origin/main` `b930badaa65ea72e8727c8ca272b3299a8174d35`.
- Current live state at start:
  - #800 open.
  - #894 open.
  - #902 open and post-foundation.
  - #893 closed completed after PR #906.
  - Protected canaries #865 and #866 open with exact labels
    `area:mobile-ui`, `auto-canary-ready`, `canary`, `workflow`, zero
    comments, no assignees, and no milestone.
  - Current-main open code-scanning alerts: `0`.
- Completed foundation evidence reconciled:
  - #887 via PR #896, merge SHA
    `741aa0355bd213aab04c37a5f876de420485800c`.
  - #888 via PR #897, merge SHA
    `8ecaafcda5441c452396761ccb7653d31d64f1cb`.
  - #889 via PR #898, merge SHA
    `d21b83033abf8eb99b76dedc8574a270b90c0a54`.
  - #890 via PR #903, merge SHA
    `8c1320695da430d8d0932988679209952d59a1b6`.
  - #891/#892 via PR #904, merge SHA
    `db854eb306007e044b05ea47220da466ac2f04df`.
  - #893 via PR #906, merge SHA
    `b930badaa65ea72e8727c8ca272b3299a8174d35`.
  - #880 monitoring/notification/Windows-off/rollback evidence remains
    accepted and closed.
- Documentation updates in this checkpoint:
  - Added `docs/planning/AUTO_RUNNER_FINAL_ACCEPTANCE_894.md`.
  - Refreshed `docs/planning/AUTO_RUNNER_END_STATE_GAP_AUDIT.md` from stale
    pre-#887 status to current merged evidence and remaining gates.
  - Updated workflow/tooling docs that still described #887-#893 as future
    work.
- Close/keep-open recommendation:
  keep #894 and #800 open while this PR is unmerged. After merge, close #894
  only after exact post-merge current-main validation/scanner/canary
  reconciliation. Close #800 only after #894 is closed with all matrix rows
  still passing. Keep #902 open and unstarted.
- Scope confirmation:
  this checkpoint is limited to planning/workflow evidence documentation and
  final acceptance reporting. It does not change product runtime, API
  behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migrations,
  OpenAPI/generated clients, Docker/CI/deployment, secrets, active external
  config, `.ai/*`, #902 implementation, or protected canaries.

### Issue #893 - Recovery, fix, existing-PR recovery, and continuation completed

- Task keys:
  `20260713-1927`, `20260713-2103`, `20260713-2133`,
  `20260713-2147`, `20260713-2241`, and `20260713-2308`.
- PR:
  #906, superseding closed PR #905 after a GitHub-managed CodeQL
  infrastructure outage.
- Source branch:
  `tools/auto-runner-recovery-continuation-893-20260713-1927`.
- Source head:
  `a1adb27941927f58ba4e41569bb8237cfaa10f78`.
- Merge SHA:
  `b930badaa65ea72e8727c8ca272b3299a8174d35`.
- Completed scope:
  recovery/continuation tooling, existing-PR recovery gates, bounded
  review/CI/scanner fix classification, exact-head evidence regeneration,
  current-main scanner reconciliation, and focused CodeQL alert #85
  dispatch-boundary fix.
- Alert/scanner evidence:
  CodeQL alert #85 was fixed by source commit
  `a1adb27941927f58ba4e41569bb8237cfaa10f78`; it was not dismissed or
  suppressed. Current-main open code-scanning alerts on merge SHA
  `b930badaa65ea72e8727c8ca272b3299a8174d35` were `0`.
- Validation/reviews:
  exact-head local validation, strong independent Gemini review, Codex
  mechanics/security review, PR CI/security, review-thread reconciliation, and
  current-main merge-SHA checks/scanners all passed.
- Issue hygiene:
  #893 is closed completed; #800 received the Bundle 4 checkpoint comment;
  #894 remains the final foundation gate; #902 remains post-foundation and
  untouched.
- Scope confirmation:
  no forbidden product runtime, API, auth/session/security runtime,
  storage/privacy/authz, money/settlement/payment/bill calculation,
  schema/migration, OpenAPI/generated-client, Docker/CI/deployment config,
  secret, public exposure, #894, #902, or canary changes were made.

### Issue #893 - Recovery, fix, existing-PR recovery, and continuation checkpoint

- Task key: `20260713-1927`.
- Branch:
  `tools/auto-runner-recovery-continuation-893-20260713-1927`.
- Base:
  exact `origin/main` `db854eb306007e044b05ea47220da466ac2f04df`.
- Bundle 3 prerequisite:
  #891/#892 completed via PR #904, merge SHA
  `db854eb306007e044b05ea47220da466ac2f04df`.
- Bundle 4 implementation scope active:
  - central recovery outcome taxonomy, phase model, retry budgets, durable
    sanitized recovery state, evidence invalidation, and fail-closed drift
    handling;
  - existing runner-owned PR recovery gates, structured review/CI/scanner fix
    classification, exact-head evidence regeneration, current-main scanner
    reconciliation, and duplicate follow-up prevention;
  - startup recovery discovery before unrelated issue polling, continuation
    helpers, supervisor/report correlation, idempotent mutation markers, and
    docs for bounded interruption recovery.
- Checkpoint commits on this branch:
  - `79db31cff49c4b2c2dbe9c9fdb8d76e0ac35417c`
    `Add durable recovery state and retry taxonomy`.
  - `2a38bcc153c008b6b60fd6c11a9cb08e9ed31023`
    `Recover existing PRs and run bounded fix cycles`.
  - Slice 3 commit pending at this ledger checkpoint.
- Remaining foundation:
  #894 remains the final foundation acceptance gate after #893 merge.
- Post-foundation:
  #902 remains post-foundation and untouched by this implementation.
- Protected canaries:
  #865 and #866 remain open with exact labels `area:mobile-ui`,
  `auto-canary-ready`, `canary`, `workflow`, zero comments, no assignees, and
  no milestone.
- Scope confirmation:
  this checkpoint is limited to `tools/auto-runner/**`,
  `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md`,
  `docs/workflow/AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md`,
  `tools/auto-runner/README.md`, and this ledger. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migrations,
  OpenAPI/generated clients, Docker/CI/deployment, secrets, active external
  config, `.ai/*`, #894/#902 implementation, or protected canaries.

### Issues #891/#892 - Automatic work generation and progress hygiene implementation checkpoint

- Task key: `20260713-1601`.
- Branch:
  `tools/auto-runner-work-generation-progress-hygiene-891-892-20260713-1601`.
- Base:
  exact `origin/main` `8c1320695da430d8d0932988679209952d59a1b6`.
- Bundle 2 prerequisite:
  #890 completed via PR #903, merge SHA
  `8c1320695da430d8d0932988679209952d59a1b6`.
- Bundle 3 implementation scope now active:
  - #891: deterministic generated-work derivation, evidence correlation,
    duplicate prevention, strict proposal validation, idempotent issue
    creation/reuse/queue pipeline, and default-off mutation capability.
  - #892: post-merge narrow issue closure, completion comments, transient
    label cleanup, parent progress comments, project-status safe no-op unless
    configured, and ledger-reconciliation issue proposal through the generated
    work pipeline.
- Checkpoint commits on this branch:
  - `c47a501` `Add durable generated-work derivation and deduplication`.
  - `a134940` `Create and queue validated follow-up issues idempotently`.
  - Slice 3 commit pending at this ledger checkpoint.
- Remaining foundation issues:
  #893 and #894 remain open and are not implemented by this branch. #800 must
  remain open until #894 final acceptance.
- Post-foundation:
  #902 remains post-foundation and untouched by this implementation.
- Scope confirmation:
  this checkpoint is limited to `tools/auto-runner/**`,
  `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md`,
  `tools/auto-runner/README.md`, and this ledger. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migrations,
  OpenAPI/generated clients, Docker/CI/deployment, secrets, active external
  config, `.ai/*`, or protected canaries.

### Issue #890 - Real feature-bundle orchestration state and recovery completed

- Task key: `20260713-1416`.
- PR: #903.
- Source branch:
  `tools/auto-runner-feature-bundle-orchestration-890-20260713-1416`.
- Source head:
  `2e104e87ed1c6b6cbb264d2e7c235c2c61bcdcef`.
- Merge SHA:
  `8c1320695da430d8d0932988679209952d59a1b6`.
- Completed scope:
  strict two-to-four-slice feature-bundle contract planning, focused/manual/
  split lane rejection, durable sanitized external bundle state, checkpoint
  validation and recovery, one branch / one final PR path, aggregate scope
  enforcement, stale evidence invalidation, and bounded non-regex wildcard
  matching for the Semgrep #83 fix.
- Post-merge evidence:
  PR #903 exact-head CI/security and current-main checks passed; alert #83 is
  fixed without dismissal; #890 is closed completed; #800 remains open.
- Remaining foundation:
  #891/#892 are active in Bundle 3; #893/#894 remain after Bundle 3; #902
  remains post-foundation.

### Issue #890 - Real feature-bundle orchestration state and recovery implementation checkpoint

- Task key: `20260713-1416`.
- Branch:
  `tools/auto-runner-feature-bundle-orchestration-890-20260713-1416`.
- Base:
  exact `origin/main` `e4846a87c69152a60cc6405b8150365cd8fc876b`.
- Bundle 1 status:
  - #887 complete via PR #896, merge SHA
    `741aa0355bd213aab04c37a5f876de420485800c`.
  - #888 complete via PR #897, merge SHA
    `8ecaafcda5441c452396761ccb7653d31d64f1cb`.
  - #889 complete via PR #898, merge SHA
    `d21b83033abf8eb99b76dedc8574a270b90c0a54`.
- P0 detour:
  #899 is closed completed after reviewed false-positive disposition for
  CodeQL alerts #56/#57. No #890 implementation started before that closure.
- #890 implementation scope now active:
  - Adds strict feature-bundle contract planning for `auto-bundle` issues.
  - Adds durable sanitized bundle state under external runtime logs.
  - Adds one-branch, multi-slice checkpoint orchestration with final aggregate
    validation/review/PR integration.
- Checkpoint commits on this branch:
  - `7933650e98500e4f7c94e1282dfa7f1dd6405e78`
    `Add strict feature-bundle contract planning`.
  - `3945bc14ae88d3600c711496a7ec081ecbbcde29`
    `Persist and recover feature-bundle checkpoints`.
  - `a322b77dbc8f4f6914e509e2fbf9859ec756337c`
    `Orchestrate multi-slice feature bundles`.
- Remaining foundation issues:
  #891, #892, #893, and #894 remain open and are not implemented by this
  branch. #893 contains only accepted #899 recovery lesson comments.
- Post-foundation:
  #902 remains post-#890-#894, open, commentless, and untouched by this
  implementation.
- Protected canaries:
  #865 and #866 remain open with exact labels `area:mobile-ui`,
  `auto-canary-ready`, `canary`, `workflow`, zero comments, no assignees, and
  no milestone.
- Scope confirmation:
  this checkpoint is limited to `tools/auto-runner/**`,
  `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md`,
  `tools/auto-runner/README.md`, and this ledger. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migrations,
  OpenAPI/generated clients, Docker/CI/deployment, secrets, active external
  config, `.ai/*`, or protected canaries.

### Issue #899 - Invitation runtime test-harness CodeQL HTTPS transport SARIF follow-up checkpoint

- GitHub/live state verified:
  - #899 is open as the focused P0 security hygiene tracker for CodeQL
    alerts #56 and #57.
  - PR #900 merged to `main` at
    `48853ce46e132e4f09949f7d70705355930f327e` after adding explicit
    HTTPS `WebApplicationFactory` client base addresses.
  - Post-merge CodeQL C# analysis `1469910875` on that exact main SHA still
    reported alerts #56 and #57 because the SARIF flow terminated at the
    `StringContent(json, Encoding.UTF8, "application/json")` request-body
    helper and did not treat the HTTPS `HttpClient.BaseAddress` as sufficient
    proof for relative request send sites.
  - PR #901 is open against `main` from
    `auth/codeql-invitation-explicit-https-899-20260713-1159` with exact
    implementation commit `e8b82b19683e47ddf64a9c0049a3321c91308fff` before
    this ledger checkpoint.
  - #890 remains open and untouched as the next autonomous-runner child after
    this manual security PR merges.
  - #865 and #866 remain open protected canaries with exact labels
    `area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`, zero
    comments, no assignees, and no milestone.
- PR #901 scope:
  - Uses the exact main SARIF to classify alerts #56 and #57 as CodeQL C#
    `cs/sensitive-data-transmission` test-harness findings where synthetic
    invitation/password/bearer-bearing JSON flows into `StringContent` request
    bodies without a statically proven HTTPS request URI.
  - Updates only the affected invitation runtime test classes to keep
    WebApplicationFactory clients on `https://localhost` and to pass absolute
    HTTPS `Uri` values at the sensitive `PostAsync`, `GetAsync`, and
    `HttpRequestMessage` construction/send sites while preserving in-memory
    TestServer behavior.
  - Preserves invitation runtime coverage and safe-output assertions.
  - Uses no CodeQL dismissal, suppression, query-suite/workflow exclusion,
    scanner gaming, product runtime change, schema migration, OpenAPI/generated
    client change, deployment change, secret/config change, or money/storage
    authority change.
- Close/keep-open recommendation:
  keep #899 open until PR #901 passes exact-head CI/security/code-scanning,
  the exact PR-head CodeQL C# SARIF proves the prior rule/path/fingerprint
  results absent, and a human performs the explicit manual merge gate. Keep
  #800 and #890 open.

### Issue #889 - Approved-domain exact-head auto-merge policy PR checkpoint

- Scope:
  - Replaces the permanent low-risk-only auto-merge bottleneck with an
    explicit approved-domain policy model for then-supported runnable lane
    manifests. The `20260714-0033` checkpoint supersedes this wording for the
    seven high-risk canonical runnable lanes, which must not remain
    categorically blocked.
  - Keeps repository defaults fail-closed: `allowAutoMerge=false` and
    `autoMergePolicy.approvedLanes=[]`.
  - Requires canonical runnable lane approval, exact issue contract
    auto-merge eligibility, no manual action or split requirement, exact
    branch strategy, exact changed-file path matches, structured validation
    evidence, the #888 external reviewer tier, Codex mechanics/security
    evidence, GitHub CI/security/code-scanning gates, clear threads/reviews,
    open issue state, no stop labels, and unchanged base/head through the
    final refresh.
  - Uses `gh pr merge --merge --match-head-commit <exact-head>` and keeps
    source-branch restoration non-force.
- Manual-action boundary preserved:
  production deployment, mobile store release, destructive migration/data
  execution, secret/auth credential mutation, public/admin exposure,
  architecture replacement, force-like history, branch deletion/cleanup, Day 1
  scope cuts, and unresolved product/policy/financial authority decisions
  remain non-auto-mergeable.
- Non-goals preserved:
  #890 feature-bundle orchestration, #891 issue derivation, #892 full
  progress hygiene, #893 broad recovery/continuation, and #894 final
  cross-domain unattended proof are not implemented by this slice.
- Scope confirmation:
  this checkpoint changes only auto-runner policy/integration/tests,
  example config, and workflow/planning docs. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz
  runtime, money/settlement/payment/bill calculation runtime, schema/migration
  files, OpenAPI/generated clients, Docker/Compose/CI workflows, active
  deployment config, secrets, production deploy, mobile release,
  public/admin exposure, runner control, or protected canaries.

### Issue #888 - Operational external reviewer tiers stacked PR checkpoint

- Scope:
  - Operationalizes external reviewer routing for cheap, strong, and
    tie-breaker-ready tiers while keeping Codex mechanics/security review as a
    separate mandatory reviewer.
  - Adds fail-closed reviewer config/profile/model/pricing checks, owner-only
    reviewer secret metadata validation, header-only Gemini key transmission,
    bounded response/retry/accounting evidence, and exact head/base/file/package
    evidence fields for review packages.
  - Adds a non-mutating `--review-package <package> --config <task-config>`
    entrypoint for existing PR acceptance evidence.
- Bootstrap posture:
  - This work is stacked on parent PR `#896` at exact head
    `a71c7b232aa42a860d283274c4732fe900c457a3`.
  - Parent PR `#896` remains open until the normal exact-head gate later
    merges it; this child PR must be retargeted and re-reviewed after the
    parent merges.
- Non-goals preserved:
  - #889 approved-domain auto-merge expansion is not implemented.
  - Sensitive-domain auto-merge remains disabled.
  - No product runtime, API behavior, OpenAPI/generated clients, schema,
    auth/session/security runtime, storage/privacy runtime, money/settlement
    authority, deployment, active runner config, or secret value is changed.

### Issue #887 - Auto-runner lane/manual-decision policy PR checkpoint

- GitHub/live state verified:
  - #887 is open as the lane policy and genuine manual-decision
    classification child under #800.
  - #888 and #889 remain open follow-ups for external reviewer tier
    operationalization and exact-head auto-merge expansion.
  - #865 and #866 remain open untouched protected canaries with exact labels
    `area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`, zero
    comments, no assignees, and no milestone.
- This policy slice:
  - Replaces permanent noun-triggered danger/manual defaults with explicit
    lane metadata for domain, sensitivity, branch strategy, reviewer tier,
    validation profile, implementation eligibility, PR eligibility, manual
    action reason codes, and current auto-merge posture.
  - Keeps low-risk `workflow-docs-tooling`, `docs-planning`, and
    `client-ui-low-risk` behavior compatible, including protected canary
    contracts.
  - Adds runnable PR-only lanes for mobile app, web user UI, web admin UI,
    API/domain runtime, auth/session/security, storage/file privacy/authz,
    money/settlement/payment, schema migration code, OpenAPI plus generated
    clients, sync/import/export/restore, and Docker/Compose/CI/deployment code.
  - Keeps cross-domain hard scope split-required and keeps production deploy,
    mobile store release, destructive migration/data operation, secret or
    credential mutation, public/admin exposure, architecture replacement,
    force/history rewrite, branch deletion/cleanup, Day 1 scope cuts, and
    unresolved product/policy/authority/financial semantics manual.
  - Keeps sensitive auto-merge disabled until #889 and does not operationalize
    external reviewer providers; #888 remains the reviewer blocker.
- Close/keep-open recommendation:
  keep #887 open until its implementation PR merges. Keep #800 open as the
  umbrella. Do not close or mutate #888/#889 as part of this slice.
- Scope confirmation:
  this checkpoint changes only auto-runner policy/integration/tests and
  workflow/planning docs. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz runtime,
  money/settlement/payment/bill calculation runtime, schema/migration files,
  OpenAPI/generated clients, Docker/Compose/CI workflows, deployment state,
  secrets, production deploy, mobile release, public/admin exposure, runner
  control, or protected canaries.

### Issue #800 - End-state gap audit after #880 monitoring acceptance

- GitHub/live state verified:
  - #880 is closed completed after accepted DevBox/Uptime Kuma/ntfy monitoring
    proof and Tommy's operator confirmation of one DOWN/critical phone
    notification, one recovery/UP phone notification, and no duplicate
    notification.
  - #800 remains open as the broader autonomous-runner tracker.
  - #865 and #866 remain open and untouched protected canaries with exact
    labels `area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`,
    zero comments, no assignees, and no milestone.
- Current repo evidence:
  - Low-risk/canary runner, exact-head low-risk auto-merge, review-fix
    scaffolding, existing-PR recovery scaffolding, detached supervisor,
    Windows-off proof, read-only health service, activity notifier, and
    monitoring acceptance are implemented or proven in their bounded lanes.
  - `tools/auto-runner/lib/lane-policy.mjs` still treats product runtime,
    auth/security, storage/privacy, money/settlement, schema/migrations,
    OpenAPI/generated clients, and deployment/CI/env as danger/manual lanes;
    those current manual gates remain authoritative until reviewed policy work
    explicitly changes them.
  - `tools/auto-runner/lib/auto-merge-policy.mjs` still limits auto-merge to
    low-risk lanes, and independent review is mandatory only for
    `client-ui-low-risk`.
  - Reviewer tier concepts exist, but cheap/strong/tie-breaker external tiers
    are not default-operational.
  - Automatic follow-up issue creation and `auto-bundle` are scaffolds, not the
    finished #800 issue-creation or feature-bundle behavior.
- Tracker/body update:
  - #800 body now records the authoritative A-H finished target, completed
    #880 monitoring acceptance, created child issues, bundle grouping,
    keep-open rationale, and #887 as the recommended first implementation
    child.
- Created remaining children:
  - #887 lane policy and genuine manual-decision classification.
  - #888 external reviewer providers and tier routing.
  - #889 exact-head auto-merge across approved domains.
  - #890 real feature-bundle orchestration state and recovery.
  - #891 automatic implementation issue derivation and creation.
  - #892 automatic issue closure and progress hygiene.
  - #893 review-fix, CI/security-fix, existing-PR recovery, and continuation.
  - #894 final cross-domain unattended acceptance proof.
- Feature bundle order:
  - Bundle 1: #887, #888, #889.
  - Bundle 2: #890.
  - Bundle 3: #891, #892.
  - Bundle 4: #893.
  - Bundle 5: #894.
- Close/keep-open recommendation:
  - Keep #800 open. Monitoring is complete, but final A-H autonomous-loop
    acceptance is incomplete until #887-#894 are implemented/proven and #894
    records final cross-domain evidence.
- Last verified repo/report references:
  - Repo SHA `56a3e46061f7c1fdf2e7567a3d1e3e306db30070`.
  - `docs/planning/AUTO_RUNNER_END_STATE_GAP_AUDIT.md`.
  - `.codex/reports/settleora-codex-report-20260712-1821-issue880-closure-800-end-state-gap-audit.md`.

### Issue #885 - Auto-runner Node systemd runtime compatibility PR checkpoint

- GitHub/live state verified:
  - #885 is open as the focused repository fix for the #880 deployment
    blocker found by task `20260712-1609`.
  - PR #882 is merged at
    `6c47febe3ebf4db354c16e03681f2d3a26508a59`.
  - PR #884 is merged at
    `a151adce2479558857424d4513edc95e847bee26`.
  - #800 remains open as the broader DevBox-native unattended runner tracker.
  - #880 remains open as the manual DevBox/TrueNAS/Uptime Kuma/ntfy deployment
    retry and acceptance gate.
  - #865 and #866 remain open protected canaries and are not part of this
    implementation.
- Failure finding from task `20260712-1609`:
  - Both affected repository templates execute `/usr/bin/env node`.
  - Both contained `MemoryDenyWriteExecute=yes`.
  - Under systemd, Node/V8 crashed with `SIGTRAP` while attempting executable
    memory permission transitions before the health service could listen or
    the terminal notifier could publish.
  - The deployment safely rolled back after removing the installed health and
    notifier units/timer. External secret files remain deployment-owned and
    should not be rotated merely because the units rolled back.
- This implementation-PR scope:
  - Removes the Node/V8-incompatible `MemoryDenyWriteExecute` directive from
    the health and terminal-notifier service templates, with comments
    documenting the intentional runtime compatibility exception.
  - Preserves the remaining hardening controls: `NoNewPrivileges=yes`,
    `PrivateTmp=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, fixed
    read-only/read-write path allowlists, `RestrictSUIDSGID=yes`,
    `LockPersonality=yes`, `UMask=0077`, and fixed Node entry points.
  - Moves health restart-limit directives into `[Unit]`, fixes the
    `Documentation=` reference, and adds `[Install] WantedBy=default.target`
    for normal user-scope enablement during the later #880 deployment gate.
  - Keeps the terminal notifier timer-owned and one-shot with `Restart=no`.
  - Adds focused parser-based regression tests for the systemd templates and
    updates the monitoring docs/README.
- Issue posture:
  keep #885 open until its repository fix PR merges. Keep #800 and #880 open;
  #880 remains the deployment retry and acceptance gate after this PR merges.
  Do not touch #865/#866.
- Scope confirmation:
  this checkpoint changes only repository auto-runner systemd templates,
  focused tests, workflow docs, and this ledger. It does not install/start/
  reload/enable systemd units, alter linger, configure TrueNAS, Uptime Kuma,
  ntfy, Cloudflare, DNS, TLS, proxy, router, firewall, ports, topics, tokens,
  users, ACLs, or status pages; make live ntfy calls; run or control the
  auto-runner; delete locks; mutate #865/#866; read/print/rotate/delete
  secrets; or change product runtime, API behavior, auth/session/security,
  storage/privacy/authz, money/settlement/payment/bill calculation,
  schema/migration, OpenAPI/generated clients, Docker/Compose, CI/env,
  mobile/web/admin UI, production deploy, mobile release, or public/admin
  exposure.

### Issue #883 - Auto-runner ntfy terminal notifier implementation PR checkpoint

- GitHub/live state verified:
  - PR #882 is merged at
    `6c47febe3ebf4db354c16e03681f2d3a26508a59`, so the read-only health
    service and notifier dedupe-state foundation are present on `origin/main`.
  - #879 is closed completed by PR #882.
  - #800 remains open as the broader DevBox-native unattended runner tracker.
  - #880 remains open as the later manual DevBox/TrueNAS/Uptime Kuma/ntfy
    deployment and acceptance task.
  - #865 and #866 remain open protected canaries and are not part of this
    implementation.
- This implementation-PR scope:
  - Adds a separate one-shot DevBox terminal notifier entry point for healthy
    terminal supervised runs.
  - Selects only trusted healthy terminal activity through the existing health
    evaluator and supervisor/report-correlation authority, including
    successful `completed`, `no-eligible-work`, and successful budget
    exhaustion. Active, failed, blocked, partial, stale, untrusted,
    report-missing, report-ambiguous, malformed, and orphan-lock states do not
    produce activity notifications.
  - Adds a provider-specific ntfy publisher with fixed production config path
    `/workspace/logs/settleora-auto-runner/secrets/ntfy-notifier.json`, strict
    owner-only file and schema validation, Bearer-token publishing, bounded
    timeout/response reads, and no production CLI/env/HTTP overrides for URL,
    topic, token, or config path.
  - Records local delivery only after confirmed ntfy `2xx`; unconfirmed
    delivery is retried later with the same deterministic ntfy sequence ID
    derived from `<immutable-supervisor-run-id>:<terminal-event-kind>`.
  - Adds repository-only user service/timer templates for the one-shot notifier
    without installing, starting, enabling, reloading, or testing them through
    systemd.
  - Updates monitoring docs and README for the approved architecture:
    Uptime Kuma on TrueNAS publishes incident/recovery notifications to a
    private critical ntfy topic, while the DevBox terminal notifier publishes
    healthy terminal summaries to a separate private activity topic. #880
    remains the manual deployment/credential/network/acceptance gate.
- Issue posture:
  keep #883 open until its implementation PR merges. Keep #800 open as the
  umbrella, and keep #880 open for the later manual deployment/acceptance
  gate. #880 is not ready for deployment until #883 merges and explicit manual
  DevBox/TrueNAS/network/credential approval is provided.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, workflow docs,
  repository systemd templates, and this ledger. It does not install/start/
  reload/enable systemd, alter linger, configure TrueNAS, Uptime Kuma, ntfy,
  private topics, tokens, datasets, users, ports, DNS, TLS, proxy, router, or
  firewall settings; make a live ntfy call; run or control the auto-runner;
  delete locks; mutate #865/#866; or change product runtime, API behavior,
  auth/session/security, storage/privacy/authz, money/settlement/payment/bill
  calculation, schema/migration, OpenAPI/generated clients, Docker/Compose,
  CI/deployment/env, secrets, production deploy, mobile release, or
  public/admin exposure.

### Issue #879 - Auto-runner health service implementation PR checkpoint

- GitHub/live state verified:
  - PR #881 is merged at
    `3358a77646a0af889cfcc75849beb7fb56576843`, unblocking the
    repository implementation slice.
  - #800 remains open as the broader DevBox-native unattended runner tracker.
  - #879 remains open pending merge of the implementation PR.
  - #880 remains open and blocked on #879 merge plus manual DevBox/TrueNAS,
    network binding, Uptime Kuma, and notification-secret approval.
  - #865 and #866 remain open protected canaries and are not part of this
    implementation.
- This implementation-PR scope:
  - Adds a separate read-only health service entry point exposing only
    `GET /health/auto-runner` with bounded sanitized JSON, `Cache-Control:
    no-store`, loopback default binding, strict method/path handling, and no
    runner/GitHub/control/mutation routes.
  - Adds a pure health evaluator that reads trusted supervisor state,
    heartbeat, strict report-correlation status, runner active/lock state, and
    sanitized trusted-summary counts. It treats initialization, fresh active
    heartbeats, successful idle terminal runs, `no-eligible-work`, and
    successful budget exhaustion as healthy; cancellation is bounded
    `attention`; stale active heartbeat, failed/submission-failed/blocked/
    partial terminal state, missing/ambiguous report mapping, disappeared
    active runner, orphaned locks, and untrusted state fail closed.
  - Adds a reusable terminal-event notifier dedupe-state foundation under the
    approved monitoring logs boundary. The health endpoint does not write or
    claim dedupe entries, and no provider/destination/secret is configured.
  - Adds a repository-only systemd user-unit template for the read-only health
    service with `Restart=on-failure`; the existing mutation supervisor
    template remains `Restart=no`.
- Issue posture:
  keep #879 open until the implementation PR merges. Keep #800 open as the
  umbrella, and keep #880 open for the later manual deployment/acceptance gate.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, workflow docs, the
  repository health-service systemd template, and this ledger. It does not
  install/start/reload/enable systemd, alter linger, bind a LAN/public port,
  configure TrueNAS or Uptime Kuma, create notification credentials, send
  notifications, call Uptime Kuma private APIs, run or control the runner,
  delete locks, mutate #865/#866, or change product runtime, API behavior,
  auth/session/security, storage/privacy/authz, money/settlement/payment/bill
  calculation, schema/migration, OpenAPI/generated clients, Docker/Compose,
  CI/deployment/env, secrets, production deploy, mobile release, or
  public/admin exposure.

### Issue #800 - Uptime Kuma health monitoring design checkpoint

- GitHub/live state verified:
  - #800 remains open as the broader DevBox-native unattended runner tracker.
  - PR #878 is merged at
    `0eb267e8c649c645e4f5381f03cb262d4f8f01b9`, recording the completed
    Windows-origin shutdown proof.
  - #865 and #866 remain open, unchanged protected canaries with only durable
    labels `area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`.
- This design scope:
  - Adds
    [Autonomous Codex Runner Monitoring](../workflow/AUTONOMOUS_CODEX_RUNNER_MONITORING.md)
    as the authoritative future monitoring design.
  - Supersedes the earlier provisional SSH-primary TrueNAS monitor direction
    with Uptime Kuma HTTP pull monitoring against a separate permanent
    read-only DevBox health service.
  - Preserves the temporary supervisor/runner lifecycle: mutation jobs exit
    after bounded terminal conditions and remain `Restart=no`; healthy idle
    after `completed` or `no-eligible-work` is not an outage.
  - Defines future endpoint `GET /health/auto-runner`, sanitized JSON fields,
    deterministic HTTP `200`/`503` behavior, 60-second heartbeat and
    five-minute lease reconciliation, security boundaries, LAN binding gates,
    and rollback posture.
  - Splits Uptime Kuma failure/recovery incidents from one-time healthy
    terminal-run information notifications. Since no supported generic Uptime
    Kuma event API was verified, terminal summaries require a separate future
    notifier adapter with atomic deduplication keyed by immutable supervisor
    run ID plus terminal event kind.
- Official tool findings:
  - Uptime Kuma upstream release `2.4.0` was the latest verified release on
    2026-07-12.
  - Official upstream source supports HTTP monitor method, headers, accepted
    status codes, max retries, retry interval, resend interval, Basic auth,
    Bearer token, and OAuth2 client-credentials fields.
  - Uptime Kuma's upstream wiki marks the internal API unsupported for
    third-party integrations, so this design does not depend on it.
  - TrueNAS community Uptime Kuma app metadata was verified at app version
    `1.2.11`, upstream app version `2.4.0`, minimum SCALE `24.10.2.2`, and
    default WebUI port `31050`; this is not deployment evidence.
- Child issue posture:
  - #879 tracks repository implementation of the read-only DevBox health
    service, state evaluator, tests, systemd template, docs, and
    terminal-event dedupe foundation. It explicitly forbids installation,
    deployment, live notification credentials, public exposure, runner
    controls, GitHub mutation, and #865/#866 mutation.
  - #880 tracks manual DevBox health-service installation, TrueNAS SCALE
    Uptime Kuma configuration, notification destination selection, incident
    and completion dedupe acceptance, and rollback evidence. It is
    manual-gated for systemd, TrueNAS/Uptime Kuma, network binding, and
    notification-secret actions.
  - Project field updates for #879/#880 were not performed by this task; issue
    bodies carry the complete planning metadata, estimate tables, validation
    class, risk, manual-gate status, bundle IDs, expected evidence, allowed or
    deployment scope, and close rules.
- Issue posture:
  keep #800 open. The completed slice is docs/design only. Remaining gates are
  repository implementation of the read-only health service, manual DevBox
  health unit installation, manual Uptime Kuma deployment/configuration on
  TrueNAS SCALE, notification destination/secret approval, alert/recovery and
  terminal-summary dedupe proof, and rollback evidence.
- Scope confirmation:
  this checkpoint changes workflow/planning docs only. It does not implement
  code, install/start/reload/enable systemd, configure TrueNAS or Uptime Kuma,
  bind a network port, configure notification credentials, run the
  supervisor/runner, mutate GitHub through runner automation, or change
  product runtime, API behavior, auth/session/security, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, Docker/Compose, CI/deployment/env, secrets,
  production deploy, mobile release, or public/admin exposure.

### Issue #800 - Windows-origin shutdown proof checkpoint

- GitHub/live state verified:
  - PR #876 was merged at
    `7db8ba829569b9c8f96c897c8b1075a1e25714ca`, which enabled clean
    `main` launch/control-plane starts while preserving task-branch mutation
    guards and strict report correlation.
  - The `default` external runner profile was reconstructed under the fixed
    profile root and verified with SHA-256
    `4c9d767d99e855ea412500e3e1b5c6b90a4d18ccc3b5f80e1297d8dee82444b9`.
  - The Windows wrapper package used for the proof was exported as the
    `20260712-0133` package with SHA-256
    `5c6381a20dfa4177a9d4d9c11d9c9f3c5389f051f131f16c0a532cb2eebf81a0`.
- Windows-origin proof:
  - Operator-supplied Windows evidence reported wrapper submission accepted
    with initial state `running`, supervisor run
    `supervised-20260711T182122Z-6bd91d326f10`, then normal Windows UI
    shutdown and next-morning status/report readback using the saved proof
    JSON.
  - Remote DevBox evidence is authoritative and matched the operator
    readback: supervisor state `completed`, child terminal `completed`,
    child status `0`, terminal reason `child_exit_mapped`, systemd
    `Result=success`, `ExecMainStatus=0`, `NRestarts=0`, and health exit
    `0`.
  - Runner run `run-2026-07-11T182132Z` started at
    `2026-07-11T18:21:32.517Z` and finished at
    `2026-07-11T18:42:59.463Z`, about 21m27s after start and about 21m37s
    after supervisor creation. This proves the DevBox unit continued after
    Windows submission and shutdown.
  - Strict report mapping resolved to
    `/workspace/logs/settleora-auto-runner/summaries/run-2026-07-11T182132Z.json`
    and `.md` with status `matched`; newest-summary fallback was not used.
  - Monitoring outbox recorded `submitted`, `started`, periodic
    `heartbeat`, and terminal `completed` events. Runner status afterward
    was inactive and the runner lock was absent.
- #864 / PR #877 result:
  - #864 was selected as the only attempted and processed issue under
    `maxTasks=1`; #865 and #866 were not attempted.
  - PR #877 merged source head
    `f126b05a2eb3d938c83bff2d29cb7ea7922fa9ec` from base
    `7db8ba829569b9c8f96c897c8b1075a1e25714ca` into merge SHA
    `8d04e2c4de1e586ff9298ddd6d2f0f2a9c7d7743`.
  - The merged PR changed exactly
    `apps/mobile/lib/ui/settleora_components.dart` and
    `apps/mobile/test/ui/settleora_component_guardrail_test.dart`.
  - Local mobile UI validation passed, Codex mechanics approved the exact
    head, Gemini `cheap_independent` passed the exact head, GitHub checks and
    code-scanning gates passed, transient lifecycle labels were removed, and
    #864 was closed completed with the expected claim and completed
    auto-merge comments.
  - The source branch was preserved/restored at the reviewed head.
- Protected follow-on canaries:
  - #865 and #866 remained open with no comments, no assignees, no milestone,
    no project items, and only durable labels
    `area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`.
- Issue posture:
  keep #800 open as the broader trusted-operation tracker. The Windows-origin
  submit/disconnect/shutdown gate is complete, but this does not imply Day 1
  product scope reduction or completion of future operations work. Remaining
  gates include the exact-head docs PR merge for this checkpoint, TrueNAS SSH
  pull-health monitoring planning, and any separately approved durable
  recovery, retry, bundling, or notification enhancements.
- Scope confirmation:
  this checkpoint records evidence only. It does not change product runtime,
  API behavior, auth/session/security, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, Docker/CI/deployment/env, secrets, production
  deploy, mobile release, public/admin exposure, systemd unit content, runner
  profiles, or Windows-local policy.

### Issue #800 - Main-launch workspace safety checkpoint

- GitHub/live state at task start:
  - PR #875 was merged at
    `d930db9f5d70c78c9248616102bc209fc928cff3` after reviewed source head
    `b2688623acf254af3da0ed842fb4ba66021af972`.
  - Post-merge acceptance run
    `supervised-20260711T161333Z-d7113d9be4d4` launched runner
    `run-2026-07-11T161343Z` from clean current `main` and failed before
    issue polling because the pre-fix launch guard rejected `main`.
  - The runner summary carried the expected supervisor ID but had
    `baseOriginMainSha=null`; the strict resolver correctly rejected it with
    `base_origin_main_sha_mismatch`, leaving `reportPath=null`.
  - Attempted issues, processed issues, branches, commits, pushes, PRs,
    comments, and merges were all zero for the failed run.
- This fix scope:
  - Separates launch/control-plane workspace safety from task-mutation
    workspace safety.
  - Allows clean `main` or clean named non-main checkout for real-run launch
    while continuing to reject dirty, detached, or unnamed real-run launch.
  - Captures exact launch `origin/main` in run summaries before later
    workspace-policy failure when the ref is resolvable.
  - Requires a clean generated task branch from exact `origin/main` before
    task prompt generation or Codex implementation, and rejects `main`,
    detached or unnamed state, wrong branch, dirty state, changed
    `origin/main`, or unexpected branch `HEAD`.
  - Keeps the supervisor resolver strict; no newest-summary fallback or
    missing-base tolerance is introduced.
- Issue posture:
  keep #800 open. After this focused PR merges, rerun the server-side
  no-work supervisor acceptance from clean `main`, then complete the remaining
  gates: missing-spec `NRestarts=0`, terminal control integrity,
  active-correlation fixtures, Windows wrapper export, and actual
  Windows-originated submit/disconnect/shutdown proof.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests and workflow/planning
  docs. It does not start/reload/install/enable systemd, alter linger, modify
  the external acceptance profile, run a live supervisor/runner, mutate
  #864-#866, deploy Windows wrappers, deploy TrueNAS, or change product
  runtime, API behavior, auth/session/security, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, Docker/CI/deployment/env, secrets, production
  deploy, mobile release, public/admin exposure, or provider defaults.

### Issue #800 - Supervisor terminal-control safety checkpoint

- GitHub/live state at task start:
  - PR #874 was merged at
    `0fc9195e987cb15cb66fc8f47b123c606ec5db44` after reviewed head
    `165fa1549121f2041397d5102abed8fc0e332f87`.
  - Report correlation is merged: supervised runner summaries now carry a
    sanitized `supervisorRunId`, and supervisor status/report/health resolve
    reports through exact summary correlation instead of newest-summary
    guessing.
  - Current-main inspection before live acceptance found a terminal-control
    defect: `settleora-auto-runnerctl` wrote global runner controls before
    proving active-run correlation and then replaced the selected supervisor
    lifecycle `state` with command names such as `pause`, `extend`, or
    `stop-after-current`, even when `writeControlCommand` rejected the request.
- This fix scope:
  - Adds shared supervisor lifecycle classification for terminal,
    controllable, stopping, pre-active, and unknown states.
  - Adds a pure supervisor control policy that requires an active runner whose
    sanitized `supervisorRunId` exactly matches the selected supervisor run ID
    before writing the global runner control file.
  - Rejects terminal, pre-active, unknown, uncorrelated, mismatched, and
    no-active-runner controls without supervisor state, heartbeat, report, or
    runner-control mutation. Repeated `stop-after-current` on
    `stopping_after_current` is idempotent and non-mutating.
  - Preserves the primary supervisor lifecycle state for accepted controls and
    stores only bounded `lastControl` metadata for accepted or raced/failed
    writes.
- Issue posture:
  keep #800 open. Next gate after this PR merges is the no-work acceptance
  rerun, exact report mapping, failed-instance no-restart proof,
  terminal-control runtime proof, and Windows wrapper export.
- Aligned future enhancements remain separate:
  true `MaxPRs`, 1-4 slice bundles, transient retry/reconciliation, default
  real profile, requirement-skip-and-continue, and DevBox-side notifications.
- Scope confirmation:
  this checkpoint changes only auto-runner supervisor tooling/tests and
  workflow/planning docs. It does not start/reload/install/enable systemd,
  alter linger, rewrite historical supervisor state, modify the external
  acceptance profile, run a live supervisor/runner, mutate #864-#866, deploy
  Windows wrappers, deploy TrueNAS, or change product runtime, API behavior,
  auth/session/security, storage/privacy/authz, money/settlement/payment/bill
  calculation, schema/migration, OpenAPI/generated clients,
  Docker/CI/deployment/env, secrets, production deploy, mobile release,
  public/admin exposure, or provider defaults.

### Issue #800 - Supervisor report correlation fix checkpoint

- GitHub/live state at task start:
  - PR #873 was merged at
    `da3d09c7faf6c4a6e1f844d0a19e892e51a6a308` after reviewed head
    `b2e535a60a08ab1d3274bbe7e5f66729bf0b3986`.
  - The exact merged user unit was installed under
    `/home/tommytang213/.config/systemd/user/settleora-auto-runner@.service`
    with SHA-256
    `fe8621fb25c82e8cfa659757b788c1cab8bc9c8e4c9a74b5fbc45bb3552590ae`,
    and `Linger=yes`.
  - The detach probe passed, the no-work supervised run completed, and the
    runner stayed inactive with lock absent afterward.
  - Historical supervisor run
    `supervised-20260711T083159Z-427681e96152` launched runner
    `run-2026-07-11T083209Z`, but supervisor state/heartbeat/report had
    `reportPath=null`.
  - #800 remained open; #863 remained closed; #864, #865, and #866 remained
    open and unchanged with durable labels only; #301 and #372 remained open.
- Root cause:
  - The merged worker called `newestSummaryPath()` after child exit, and that
    placeholder returned `null`.
  - Newest-summary inference is unsafe because historical summaries, rollups,
    manual foreground runs, stale files, malformed files, and timing skew can
    coexist under the summaries root.
- This fix scope:
  - Adds a shared validated supervisor correlation ID accepted by the runner
    only as `--supervisor-run-id <validated-id>` with normal real `--run`.
  - Persists sanitized `supervisorRunId` metadata in runner JSON and Markdown
    summaries without changing runner authority, issue selection, lane policy,
    budgets, review, CI, PR, or merge behavior.
  - Passes the supervisor run ID in the worker-generated argv array and adds a
    trusted exact summary resolver under the fixed summaries root. The resolver
    requires one regular non-symlink JSON/Markdown pair whose summary
    correlation, runner run ID, filename stem, timestamps, initial main SHA,
    and mode match the immutable supervisor spec.
  - Terminal successful child exit without one unique trusted mapped report
    now fails closed as terminal `failed`; nonzero child exits retain mapped
    report evidence when available.
  - Supervisor state, heartbeat, monitoring outbox, status, report, and health
    expose bounded runner run ID, JSON path, Markdown report path, and
    report-resolution status.
  - Historical pre-correlation run state is not rewritten or backfilled; it
    remains readable with `reportPath=null`.
- Issue posture:
  keep #800 open. Remaining gates are this PR merge, acceptance rerun from
  the no-work supervisor phase, failed-instance no-restart proof, terminal
  controls, Windows wrapper export/deployment, Windows shutdown proof, and
  TrueNAS monitor deployment.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests and workflow/planning
  docs. It does not start/reload/install/enable systemd, alter linger, rewrite
  historical supervisor state, modify the external acceptance profile, run a
  live supervisor/runner, mutate #864-#866, deploy Windows wrappers, deploy
  TrueNAS, or change product runtime, API behavior, auth/session/security,
  storage/privacy/authz, money/settlement/payment/bill calculation,
  schema/migration, OpenAPI/generated clients, Docker/CI/deployment/env,
  secrets, production deploy, mobile release, public/admin exposure, or
  provider defaults.

### Issue #800 / PR #873 - CodeQL security hardening continuation checkpoint

- GitHub state at continuation start:
  - PR #873 remained open, non-draft, base `main`, source branch
    `feature/auto-runner-detached-supervisor-foundation-20260711-1417`,
    starting head `6ba09f2e93d8b890829d7543d1ef2dca3c25f1d4`.
  - `origin/main` remained
    `3fdcb89a4e2fdfe657c1673188bc199822482055`.
  - The merge gate was blocked by aggregate CodeQL failure, 15 open PR-ref
    CodeQL alerts, and 15 unresolved Advanced Security review threads.
  - #800 remained open; #863 remained closed; #864, #865, and #866 remained
    open and untouched with durable labels only.
- This security-hardening continuation:
  - Replaces raw run-id filesystem paths with SHA-256 storage-key directories
    under fixed supervisor roots and fixed artifact basenames.
  - Keeps logical run IDs human-visible in spec/state/heartbeat content.
  - Changes immutable run specs from arbitrary `runnerConfigPath` to logical
    `profile` plus `runnerConfigSha256`; profile config resolution uses a
    fixed external profile root keyed by SHA-256 of the validated profile name.
  - Removes outbound HTTP/webhook delivery from the core supervisor and writes
    sanitized owner-only local monitoring events instead.
  - Documents the future TrueNAS monitor as SSH pull-health/status polling so
    dead DevBox, stale heartbeat, terminal, failed, blocked, partial, and
    SSH/network-outage conditions are detected outside the core supervisor.
- Issue posture:
  keep #800 open. PR #873 remains open and must not merge until exact-head
  validation, fresh CI/security, zero PR/branch CodeQL alerts, Advanced
  Security thread resolution, and fresh strong-review merge gate all pass.
- Scope confirmation:
  this continuation changes only auto-runner supervisor tooling/tests/templates
  and workflow/planning docs. It does not install/enable/start systemd, enable
  linger, deploy TrueNAS or Windows wrappers, launch a live supervisor/runner,
  mutate #864-#866, or change product runtime, API behavior, auth/session
  runtime, storage/privacy/authz, money/settlement/payment/bill calculation,
  schema/migration, OpenAPI/generated clients, Docker/CI/deployment/env,
  secrets, production deploy, mobile release, public/admin exposure, or
  provider secret/defaults.

### Issue #800 - Detached DevBox supervisor foundation checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - PR #872 duplicate-selection hardening was merged with reviewed head
    `3b882b51e79c82f2b87fd1b2f94665c2162f2215` and merge SHA
    `3fdcb89a4e2fdfe657c1673188bc199822482055`.
  - #863 remained closed completed with durable labels only.
  - #864, #865, and #866 remained open with durable labels only and no
    transient stop labels.
  - #301, #372, and #800 remained open.
- This tooling slice:
  - Adds a lane-neutral detached supervisor control surface around the
    existing `tools/auto-runner/settleora-auto-runner.mjs`.
  - Adds immutable bounded run-spec validation, canonical serialization,
    spec/config hashing, systemd user-unit planning, worker state/heartbeat
    files, disabled-by-default monitoring delivery, status/report/health and
    safe-control commands, and generic Windows SSH wrapper templates.
  - Keeps defaults at `1` task and `3h`, with syntax bounds `1..500` tasks
    and `1m..14d` runtime.
  - Documents that a larger numeric limit does not approve broader work; the
    selected runner config and issue contracts remain authoritative.
  - Does not install or enable systemd units, enable linger, deploy TrueNAS
    monitoring, write Windows files outside the repo, or launch a live runner.
- Issue posture:
  keep #800 open. Remaining gates are PR merge, systemd user-unit install,
  `loginctl enable-linger` approval, Windows wrapper deployment,
  SSH-disconnect/Windows-shutdown canary acceptance, TrueNAS
  health/notification adapter deployment, and broader lane/run approvals.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests/templates and
  workflow/planning docs. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/OCR runtime, Docker/CI/deployment/env,
  secrets, production deploy, mobile release, public/admin exposure,
  stale-claim stealing, follow-up issue creation, broad run approval, or
  provider secret/defaults.

### Issue #800/#863-#866 - Duplicate selection hardening checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - Overnight trial runs `run-2026-07-10T185129Z` and
    `run-2026-07-10T192906Z` completed four normal merges for #859 through
    #862.
  - Interrupted run `run-2026-07-10T200946Z` merged #863 through PR #871,
    then selected #863 again at `2026-07-10T20:29:04Z` immediately after #863
    closed completed at `2026-07-10T20:28:59Z`.
  - No duplicate PR was created; duplicate local work and stale transient
    labels were manually cleaned.
  - #864, #865, and #866 remained open and eligible with durable labels only.
  - #301, #372, and #800 remained open.
- This tooling slice:
  - Treats GitHub issue search as advisory only and live-refreshes candidates
    by exact issue number before claim, branch creation, task generation,
    Codex launch, review, or PR work.
  - Adds a run-scoped attempted issue set persisted in active state,
    iteration state, summaries, status, and event readbacks.
  - Excludes same-run attempted issue numbers regardless of GitHub search lag,
    live-refresh lag, failed issue closure, failed label cleanup, or terminal
    outcome.
  - Performs bounded distinct-candidate scanning, records sanitized stale/
    attempted/ineligible skip events, and stops cleanly when no distinct live
    eligible work remains.
  - Re-reads the issue immediately after claim labels are applied and stops
    before implementation if the issue closed, changed, lacks expected claim
    labels, or gained a stop/manual/danger label.
  - Preserves the rule that successful merge is authoritative even when
    post-merge hygiene fails.
- Issue posture:
  keep #800 open. #864 through #866 remain pending and must only be attempted
  by a separately authorized continuation after this PR merge gate and focused
  acceptance. Long/broad unattended operation remains blocked.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner workflow
  docs, and this ledger entry. It does not change product runtime, mobile app
  code, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/OCR runtime, Docker/CI/deployment/env,
  secrets, production deploy, mobile release, public/admin exposure,
  stale-claim stealing, follow-up issue creation, review-fix mutation
  enablement, systemd enablement, branch deletion, force push, direct main
  push, live canary execution, broad/99PR/240h run, or provider secret
  changes.

### Issue #800/#852 - Client UI money display danger classifier checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - #852 remained open with durable canary labels plus `danger-gate`.
  - #853 was closed completed through PR #854; PR #854 was merged with
    reviewed head `d707c2240a95988a2db64bca8e23908a4f87fca1` and merge SHA
    `10e47554fa4d0329e1164786ade70217605d817b`.
  - #301, #372, and #800 remained open.
- This tooling slice:
  - Keeps broad positive-scope danger scanning fail-closed by default.
  - Adds a bounded presentation-only exception for validated
    `client-ui-low-risk` contracts using `mobile-ui-low-risk`, exact
    UI/test-only lane paths, and a detected danger set of only
    `money_settlement`.
  - Records deterministic classifier evidence for detected danger reasons,
    presentation proof matches, authority/mutation matches, whether the
    exception applied, and the reason, without storing full issue bodies in the
    lane decision evidence.
  - Continues to block arithmetic/calculation, rounding policy, currency
    conversion, exchange-rate/FX behavior, amount entry or persistence,
    settlement/payment/refund transitions, balance/debt/owed mutations,
    split/allocation math, amount-derived authorization/policy,
    API/domain/database/storage writes, other danger categories, invalid or
    missing contracts, unsafe paths, and multiple danger reasons.
- Issue posture:
  keep #852 open and do not remove `danger-gate` until this tooling fix is
  merged and a separately authorized max-2 fresh canary rerun is launched.
  The #853/PR #854 path completed one successful fresh canary, but the
  max-2 fresh-path acceptance remains partial. Keep #800 open for broader
  trusted unattended operation and future explicit runner approvals.
- Scope confirmation:
  this checkpoint changes only auto-runner lane policy/tests, runner/workflow
  docs, fixtures, and this ledger entry. It does not change product runtime,
  mobile app code, API behavior, auth/session/security runtime,
  storage/privacy/authz, money/settlement/payment/bill calculation,
  schema/migration, OpenAPI/generated clients, sync/OCR runtime, Docker/CI/
  deployment/env, secrets, production deploy, mobile release, public/admin
  exposure, stale-claim stealing, follow-up issue creation, review-fix
  mutation enablement, systemd enablement, branch deletion, force push, direct
  main push, live canary execution, broad/99PR/240h run, or provider secret
  changes.

### Issue #800/#847 - Auto-runner evidence and label hygiene checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - #847 was closed completed after PR #849 recovery acceptance.
  - PR #849 was merged to `main` with merge SHA
    `0069c132fc68e82deb4011a680d2e907441da956`.
  - Accepted recovery run: `run-2026-07-10T150413Z`, one iteration,
    fresh exact-head Gemini pass, fresh exact-head Codex mechanics approve,
    local validation passed, runner inactive, and lock absent.
  - #301, #372, and #800 remained open.
- This tooling slice:
  - Adds a shared persisted-evidence sanitizer for new run summary JSON,
    iteration-state JSON, active-run/status JSON, recent summaries, Markdown
    summaries, canary evidence, auto-merge evidence, and run/event readback.
  - Keeps raw Codex/Gemini/model/provider payloads, selected response
    payloads, prompts, stdout/stderr, and full diffs in dedicated local
    evidence files only; summaries/state now persist sanitized metadata and
    evidence paths.
  - New readback surfaces sanitize old local summary/state files before
    re-emitting or rolling them up; historical local evidence is not rewritten
    automatically.
  - Successful auto-merge now re-reads issue labels after merge and removes
    only present transient lifecycle labels from `auto-running`,
    `auto-claimed`, `auto-pr-opened`, and `auto-failed`.
  - Merge success remains authoritative if post-merge label cleanup, issue
    closure, or comments fail; cleanup/closure/comment results are recorded
    independently in sanitized evidence.
- One-time #847 cleanup:
  - Before cleanup, #847 labels were `area:mobile-ui`, `auto-canary-ready`,
    `canary`, `workflow`, `auto-claimed`, and `auto-running`.
  - Removed only stale transient labels `auto-claimed` and `auto-running`.
  - After cleanup, #847 labels were `area:mobile-ui`,
    `auto-canary-ready`, `canary`, and `workflow`.
  - Cleanup comment:
    `https://github.com/tommytang213/Settleora/issues/847#issuecomment-4936838895`.
  - #847 issue state and accepted PR #849 recovery state were not changed.
- Issue posture:
  keep #800 open for broader trusted unattended operation, explicit 99 PR /
  240h approval, systemd/service enablement, stale-claim policy, expanded
  lanes, follow-up issue creation, review-fix expansion, and any future broad
  runner approvals. This checkpoint does not start or approve a broad,
  overnight, 99 PR, or 240h run.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner/workflow docs,
  and this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/
  deployment/env, secrets, production deploy, mobile release, public/admin
  exposure, stale-claim stealing, follow-up issue creation, systemd
  enablement, branch deletion, force push, direct main push, live canary
  execution, broad/99PR/240h run, or provider secret changes.

### Issue #800 - Exact-head review and existing-PR recovery hardening checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - #847 remained open with `auto-failed`; PR #849 remained open at exact
    head `0a85b695f8e9a863ac5fe316babe83f64335dafd` and was not recovered,
    edited, merged, closed, rebased, or relabeled by this tooling task.
  - Verified repo baseline: `origin/main` at
    `5f53e67a1e6511dac50ed9bc482a28592918bfd8`.
- This tooling slice:
  - Changes fresh implementation ordering so the runner creates the validated
    local commit before Gemini and Codex mechanics reviews, keeps it unpushed
    until reviews pass, and uses the committed `origin/main...HEAD` diff as
    exact-head review input.
  - Requires independent and Codex mechanics review evidence to carry reviewed
    head SHA and exact changed-file metadata; stale or missing-head evidence
    fails closed.
  - Makes Codex mechanics review attempt-oriented and file-backed, with
    machine-readable process/transport/parse/contract/substantive failure
    reasons, deterministic stdout/stderr boundary selection, ambiguous-output
    rejection, and at most two total attempts for process/transport failures
    only.
  - Preserves generated existing-PR mechanics review diagnostics instead of
    collapsing them silently to `review:null`.
  - Routes existing-PR recovery states with valid evidence and only pending
    checks or refreshable mergeability through the bounded auto-merge wait
    loop, while keeping failed checks, changed heads/bases, broad scope,
    review threads, code-scanning alerts, stop labels, manual blockers, and
    missing evidence terminal.
- Issue posture:
  keep #800 open for broader trusted unattended operation, explicit 99 PR /
  240h approval, systemd/service enablement, stale-claim policy, expanded
  lanes, follow-up issue creation, and any broader review-fix mutation
  approvals. This checkpoint does not approve or start a broad, overnight,
  99 PR, or 240h run.
- PR #849 posture:
  PR #849 remains blocked pending merge of this tooling fix and a later
  explicit one-PR recovery acceptance run. Do not treat this checkpoint as
  proof that PR #849 recovery is production-proven.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner/workflow docs,
  and this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/
  deployment/env, secrets, production deploy, mobile release, public/admin
  exposure, stale-claim stealing, follow-up issue creation, systemd
  enablement, branch deletion, force push, direct main push, PR #849 recovery,
  live canary execution, broad/99PR/240h run, or provider secret changes.

### Issue #800 - Long-run budget status and operator policy checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - This task started from `origin/main` at
    `bd81cf72d9858a861817429351e9fbf4242b29c8`.
- This tooling slice:
  - Hardens `--status` and `--status --json` so operators can see active
    state, run id, mode/config path, start/elapsed/runtime remaining,
    PR/iteration budget, remaining budget, completed/merged/failed/blocked/
    skipped counts, latest issue/PR/head SHA, pending/applied control state,
    and summary/log/event paths.
  - Adds `--max-prs` as an operator alias for the current iteration-loop
    budget while documenting that the internal budget remains iteration-based
    because an iteration can end as blocked, failed, skipped, PR-opened, or
    merged.
  - Keeps `--extend` explicit and bounded for `--max-iterations +N`,
    `--max-prs +N`, and `--max-runtime +12h`, applied only at safe
    boundaries before new work selection.
  - Improves run/event listings so next-day audit output includes branch names,
    issue/PR numbers, head SHAs, review verdicts, independent AI
    provider/tier/verdict, validation commands, check-wait attempts, merge
    SHAs, and final outcomes where recoverable; missing historical data remains
    `unknown`.
  - Updates the operator command card for status, JSON status, recent runs,
    run events, pause, stop-after-current, iteration/PR extension, and runtime
    extension.
- Issue posture:
  keep #800 open for broader trusted unattended operation, explicit 99 PR /
  240h approval, systemd/service enablement, stale-claim policy, expanded
  real-code lanes, follow-up issue creation, and any broader review-fix
  mutation approvals. This checkpoint does not start or approve a broad,
  overnight, 99 PR, or 240h run.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner/workflow docs,
  and this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/
  deployment/env, secrets, production deploy, mobile release, public/admin
  exposure, stale-claim stealing, follow-up issue creation, review-fix
  mutation enablement, systemd enablement, branch deletion, force push, direct
  main push, live canary execution, broad/99PR/240h run, or external
  reviewer/provider calls.

### Issue #800 - Status/control plane and evidence hygiene checkpoint

- GitHub state/project status at task start:
  - #800 remained open as the broader DevBox-native unattended runner
    foundation tracker.
  - Final known `origin/main` from the prior recovery task was
    `a577a54a962fe47c6ce2f27eba8eea9f4d7cda63`.
- This tooling slice:
  - Adds local `--status`/`--status --json`, `--list-runs`, and
    `--list-events --run <run-id>` inspection surfaces over runner locks,
    active-run state, summaries, and existing evidence.
  - Adds atomic local control-file commands for `--pause`,
    `--stop-after-current`, and explicit bounded `--extend` requests.
  - Makes the active runner observe control only at safe boundaries before
    selecting new work, and applies runtime/iteration extensions without
    bypassing lane, manual, danger, provider-budget, changed-file, or
    auto-merge safety gates.
  - Hardens real-code independent-review wording so required independent AI
    review is reported as required/pass or blocked/fail-closed in summaries,
    PR/issue comments, and event listings.
  - Investigates the 20260710-1737 false non-zero and finds the task completed
    successfully before the external Codex wrapper failed during remote
    compaction; no repo-owned runner exit-code fix was indicated.
- Issue posture:
  keep #800 open for broader trusted overnight operation, systemd/service
  enablement, stale-claim policy, expanded real-code lanes, follow-up issue
  creation, review-fix mutation, and the eventual 99 PR / 240 hour approval
  gates. This checkpoint does not start a large run.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner/workflow docs,
  and this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/
  deployment/env, secrets, production deploy, mobile release, public/admin
  exposure, stale-claim stealing, follow-up issue creation, review-fix
  mutation enablement, systemd enablement, branch deletion, force push, direct
  main push, live canary execution, or external reviewer/provider calls.

### Issue #800/#839/#840 - Real-code independent review and recovery gate checkpoint

- GitHub state/project status at task start:
  - PR #838 was `MERGED` to `main` with merge SHA
    `b5331be52d04064f362e589f5306801b3779acfb`.
  - PR #841 for #839 was `OPEN`, non-draft, base `main`, head
    `1861ff04bef50e33c169b380d4773c848bdeeb03`, and changed only
    `apps/mobile/lib/ui/settleora_components.dart` plus
    `apps/mobile/test/ui/settleora_component_guardrail_test.dart`.
  - PR #842 for #840 was `OPEN`, non-draft, base `main`, head
    `b0e97dbb0f3c893c34197846ac707c6008f26c07`, and changed only
    `apps/mobile/test/ui/settleora_component_guardrail_test.dart`.
  - #839 and #840 were `OPEN` with `auto-failed`; #800 was `OPEN` with no
    labels. No unrelated open auto-runner PRs or active collision labels were
    found.
- Verified repo baseline:
  `origin/main` at
  `b5331be52d04064f362e589f5306801b3779acfb`.
- This tooling slice:
  - Makes `client-ui-low-risk` real-code auto-merge require an independent
    Gemini pass on the exact head and changed-file set.
  - Fails closed for disabled, skipped, missing, malformed, stale-head,
    mismatched-file, provider-failed, or non-pass independent review evidence.
  - Keeps Codex mechanics review required, while making clear that Codex
    mechanics alone is not enough for real-code auto-merge.
  - Extends the low-risk auto-merge wait default to 60 attempts at a
    30-second bucketed delay, records elapsed wait and pending check names,
    continues waiting on pending/in-progress checks until the bounded cap, and
    fails immediately on failed or cancelled checks.
  - Keeps broad trusted real-run, strong/tie-breaker tiers, review-fix
    mutation, stale-claim stealing, follow-up issue creation, and systemd
    enablement disabled unless separately approved.
- Issue posture:
  after this policy lands on `main`, #839/#840 may be recovered only through
  the runner-managed existing-PR recovery path with exact-head independent
  Gemini and Codex mechanics evidence. Keep #800 open for broader unattended
  runner work.
- Scope confirmation:
  this checkpoint changes only auto-runner policy/tests, runner/workflow docs,
  example config, and this ledger entry. It does not change product runtime,
  API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release/signing, public/admin exposure, stale-claim stealing, follow-up
  issue creation, review-fix mutation, systemd enablement, branch deletion,
  force push, direct main push, or live provider payload/accounting files in
  the repository.

### Issue #800 - Low-risk real-code canary lane foundation checkpoint

- GitHub state/project status at task start:
  - #800 remained `OPEN` with no labels during live inspection.
  - #835 was `CLOSED` with only `auto-canary-ready`, `canary`, and
    `workflow` labels during live inspection.
  - No open auto-runner PRs were returned by the live repository readback.
  - No open issues carried active/terminal runner labels:
    `auto-claimed`, `auto-running`, `auto-pr-opened`, `auto-failed`,
    `needs-tommy`, `danger-gate`, or `blocked`.
- Verified repo baseline:
  `origin/main` at
  `6f9c84e0d9813dd9ac72161fa3deb4cc52102fe1`.
- This tooling slice:
  - Adds a default-off `client-ui-low-risk` real-code canary lane for narrow
    shared Flutter UI component copy/styling and directly tied component tests
    under `apps/mobile/lib/ui/**` and `apps/mobile/test/ui/**`.
  - Keeps broad trusted real-run, systemd enablement, stale-claim stealing,
    follow-up issue creation, review-fix mutation for the lane, external
    reviewer/provider calls, existing-PR recovery, and broad product-runtime
    lanes disabled unless separately approved.
  - Requires bounded canary approval and low-risk auto-merge approval before
    any live max-2 real-code pilot can select auto-merge contracts for the
    lane.
  - Fixes the lane validation profile in runner source to run status/diff
    checks plus Flutter `pub get`, `analyze`, and the focused shared UI
    component guardrail test from `apps/mobile`.
- Issue posture:
  keep #800 open for broader trusted unattended operation, additional gates,
  and the separate max-2 live real-code pilot. This checkpoint does not create
  the two live real-code canary issues and does not run the pilot from the
  unmerged foundation branch.
- Scope confirmation:
  this checkpoint changes only auto-runner policy/tests, runner/workflow docs,
  and this ledger entry. It does not change product runtime behavior, API
  behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release/signing, public/admin exposure, branch deletion, force push, direct
  main push, live canary execution, external reviewer/provider calls, or
  issue/PR mutation.

### Issue #800 - Review-fix mutation foundation checkpoint

- GitHub state/project status at task start:
  - #800 remained `OPEN` with no labels during read-only inspection.
  - #825 and #826 were `CLOSED` after the bounded low-risk auto-merge canary
    completed.
  - PR #828 and PR #832 were `MERGED`; PR #830 was `CLOSED` unmerged as the
    stale/conflicting superseded PR.
  - No open PRs were returned by the live repository readback.
- Verified repo baseline:
  `origin/main` at
  `9845959589889ae12ad270e35d442f372494f1a1`.
- This tooling slice:
  - Adds a default-off review-fix mutation policy foundation for low-risk
    `workflow-docs-tooling` and `docs-planning` auto-runner contracts only.
  - Requires external config approval, bounded low-risk canary/auto-merge
    approval shape, `autoMergeEligible: true`,
    `manualMergeRequired: false`, safe contract paths, passed local
    validation, and a structured actionable blocking review finding before
    one Codex fix attempt can be invoked.
  - Clamps pathological review-fix attempt counts to a safe maximum of one and
    keeps built-in/default attempts at zero.
  - Re-runs changed-file policy checks, local validation, integrated Gemini
    review when configured, and Codex mechanics review after a fix attempt.
  - Writes sanitized local evidence under
    `/workspace/logs/settleora-auto-runner/review-fix/`.
- Issue posture:
  keep #800 open for broader unattended/overnight/systemd/lane-expansion gates.
  This checkpoint does not run a live review-fix canary and does not mutate
  #800, #825, #826, PR #828, PR #830, or PR #832.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, workflow docs, the
  issue ledger, and example/operator documentation. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release, public/admin exposure, branch deletion, force push, direct main
  push, live canary execution, or external reviewer/provider calls.

### Issue #826 - Auto-merge canary 2 planning-docs checkpoint

- GitHub state/project status:
  - #826 was selected as the second bounded low-risk auto-merge canary issue
    after PR #824.
  - This checkpoint records that #826 exercised the DevBox auto-runner
    auto-merge path for the `docs-planning` lane using only this ledger file
    as the contract-scoped changed path.
- Verified repo baseline:
  `origin/main` at
  `ca58c8073db1d7eccfc0631ae86cf71b9368fcfb`.
- Issue posture:
  this entry is a non-sensitive planning checkpoint only. It does not rerun the
  canary, mutate GitHub issue or PR state, enable broader auto-merge lanes, or
  change any auto-runner runtime configuration.
- Scope confirmation:
  this checkpoint changes only `docs/planning/ISSUE_PROGRESS_LEDGER.md`. It
  does not change product runtime, API behavior, auth/session/security runtime,
  storage/privacy/authz, money/settlement/payment/bill calculation,
  schema/migration, OpenAPI/generated clients, sync/import/export/backup/restore
  runtime, OCR runtime, Docker/CI/deployment/env, secrets, production deploy,
  mobile release, public/admin exposure, branch deletion, force push, or direct
  main push.

### Issue #800/#825/#826 - Existing-PR recovery linkage and wait tuning checkpoint

- GitHub state/project status at task start:
  - PR #829 was merged to `main` with merge SHA
    `9c23fbd4c2743a1a5536a012dd2acfa113261f66`.
  - The latest #825/#826 recovery canary ended `partial`: #825/PR #828
    reached eligible auto-merge gates but blocked on missing recovery linkage
    evidence, while #826/PR #830 waited six attempts and failed closed with one
    GitHub check still pending.
  - #825 and #826 remained open with `auto-failed`; PR #828 and PR #830
    remained open and unmerged. This task is the tooling fix only and does not
    rerun the canary or merge those PRs.
- Verified repo baseline:
  `origin/main` at
  `9c23fbd4c2743a1a5536a012dd2acfa113261f66`.
- This tooling slice:
  - Reads current PR title/body metadata during existing-PR recovery and
    passes sanitized issue-linkage evidence into the recovery decision and
    evidence file.
  - Keeps exact issue matching deterministic and regex-free, requiring
    boundary-safe `#<issue>` text so near-misses such as `#8250`, `#0825`, and
    embedded token text do not link issue #825.
  - Extends the low-risk auto-merge wait default to 24 attempts at a 30-second
    bucketed delay, clamps pathological config values to safe bounds, and
    records pending check names plus pending-count progress evidence.
- Issue posture:
  keep #800, #825, and #826 open. Keep PR #828 and PR #830 open. A later
  explicit recovery/canary or merge-gate task must decide whether to rerun or
  merge; this checkpoint does not mutate those issues or PRs.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner/workflow
  docs, example config, and this ledger entry. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release, public/admin exposure, branch deletion, force push, direct main
  push, live canary execution, external reviewer/provider calls, or issue/PR
  mutation.

### Issue #800/#825/#826 - PR #829 CodeQL/review-thread fix checkpoint

- GitHub state/project status at task start:
  - PR #829 was `OPEN`, non-draft, base `main`, head
    `fd3a64b170d2be22a63501ecf759a112fb66e6cf`, with failed CodeQL,
    three unresolved GitHub Advanced Security review threads, and two open
    PR-ref CodeQL code-scanning alerts.
  - PR #828 was `OPEN`; this task inspected it read-only and did not merge or
    mutate it.
  - #800, #825, and #826 were `OPEN`; #825/#826 retained `auto-failed`. This
    task inspected them read-only and did not relabel, close, reopen, comment
    on, rerun, or otherwise mutate them.
- Verified repo baseline:
  `origin/main` at
  `1d3e36028beea52a67eb841438044d62b7894a1c`.
- This CodeQL/review-thread fix:
  - Removes the dynamic issue-link `RegExp` construction from the existing-PR
    recovery gate and replaces it with bounded numeric issue normalization plus
    deterministic exact `#<issue>` text scanning.
  - Bounds Gemini reviewer retry configuration to at most two retries and a
    10-second retry delay, with the timer sink also clamped locally.
  - Reads Gemini provider response bodies through a 64 KiB bound before
    parsing or summarizing provider output, preserving secret redaction and
    fail-closed malformed/non-pass/error handling.
  - Adds regression tests for regex-looking issue text, exact issue-link
    matching, bounded retry delay/attempt behavior, and oversized sanitized
    provider error responses.
- Issue posture:
  keep #800, #825, and #826 open. Keep PR #828 open. This task updates only
  PR #829's branch and does not merge PR #829.
- Scope confirmation:
  this checkpoint changes only auto-runner policy/provider code, auto-runner
  tests, and this ledger entry. It does not change product runtime, API
  behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release, public/admin exposure, branch deletion, force push, direct main
  push, live canary execution, external reviewer/provider calls, or issue
  label/closure state. The preserved #826 dirty diff/stash was not applied,
  dropped, or committed.

### Issue #800/#825/#826 - Auto-merge canary recovery hardening checkpoint

- GitHub state/project status at task start:
  - #800 `OPEN`; this remains the broader trusted unattended auto-runner
    tracker.
  - #825 and #826 `OPEN` with `auto-failed`; this task inspected them
    read-only and did not relabel, close, reopen, comment on, rerun, or
    otherwise mutate them.
  - PR #828 for #825 was `OPEN`, non-draft, base `main`, head
    `5a24f13c1bed4cb8e732caec183a69ee0fe17275`, `MERGEABLE`, and `CLEAN`
    during read-only inspection.
- Verified repo baseline:
  `origin/main` at
  `1d3e36028beea52a67eb841438044d62b7894a1c`.
- This hardening slice:
  - Adds a bounded auto-merge wait/retry path for refreshable GitHub
    mergeability states such as `BLOCKED` and `UNKNOWN`, while rechecking the
    exact PR head, base, mergeability, merge state, checks, review threads,
    code scanning, issue state, blocking comments/reviews, changed-file scope,
    and existing gates before any merge attempt.
  - Adds one bounded retry for transient integrated Gemini/provider failures
    such as HTTP `429`, HTTP `503`/`UNAVAILABLE`, fetch/network failures, and
    timeout-like errors, while keeping non-pass verdicts, malformed verdicts,
    missing keys, unsupported models, budget hard stops, accounting failures,
    and secret-boundary failures terminal.
  - Adds a default-off exact-head existing-PR recovery decision path for a
    configured low-risk canary issue/PR, requiring matching issue linkage,
    contract-scoped changed files, exact-head validation/review evidence,
    successful checks, clean mergeability, resolved review threads, no open
    code-scanning alerts, no issue stop labels, and no manual blockers.
- Issue posture:
  keep #800, #825, and #826 open. A later explicit recovery/rerun task may use
  the hardened runner gates; this task does not merge PR #828 and does not run
  the live canary.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, runner/workflow
  docs, example config, and this ledger entry. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release, public/admin exposure, branch deletion, force push, direct main
  push, live canary execution, or issue label/closure state.

### Issue #800/#825/#826 - Low-risk auto-merge canary subset-policy checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - PR #824 was merged to `main` with normal GitHub merge commit
    `f94b1ab57ab03802a7d3eaa513fe9f8d2a5a3767`.
  - #825 and #826 remain `OPEN` with `needs-tommy`; this task does not
    relabel, rerun, close, reopen, or otherwise mutate them.
- Verified repo baseline:
  `origin/main` at
  `f94b1ab57ab03802a7d3eaa513fe9f8d2a5a3767` after PR #824 merged.
- Max-2 canary result before this fix:
  - The bounded max-2 low-risk auto-merge canary selected and processed #825
    and #826.
  - Both iterations failed closed before Codex implementation, Gemini review,
    branch creation, PR creation, validation, check watching, auto-merge, or
    issue closure.
  - The blocker was a single-file subset policy mismatch: #825 used
    `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`, and #826 used
    `docs/planning/ISSUE_PROGRESS_LEDGER.md`, while the canary policy required
    the full lane-wide low-risk prefix arrays.
- This subset-policy fix:
  - Allows low-risk auto-merge canary contracts to use non-empty exact safe
    subsets under the approved lane prefixes.
  - Preserves the approved prefixes for `workflow-docs-tooling`
    (`tools/auto-runner/**`, `docs/workflow/**`) and `docs-planning`
    (`docs/planning/**`, `docs/qa/**`).
  - Keeps the auto-merge decision layer contract-scoped so changed files
    outside the issue contract still block even when they are under a lane-wide
    prefix.
- Issue posture:
  keep #800, #825, and #826 open. #825/#826 should keep `needs-tommy` until a
  separate explicit rerun/cleanup task removes the label and reruns the
  bounded max-2 live low-risk auto-merge canary after this PR merges.
- Scope confirmation:
  this checkpoint changes only auto-runner policy/tests, workflow docs, and
  this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, live canary
  execution, or issue label/closure state.

### Issue #800 - Low-risk auto-merge canary policy checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805, #818, and #821 remain closed and were checked read-only for this
    policy slice.
- Verified repo baseline:
  `origin/main` at
  `33fd15463451e689c7bba46054162ded79bd3a11` after PR #823 merged.
- This policy slice:
  - Adds a distinct `lowRiskAutoMergeCanaryApproved` flag for the one bounded
    max-2 low-risk auto-merge canary shape.
  - Keeps built-in/default config blocked for live auto-merge.
  - Allows canary `allowAutoMerge: true` only with external config,
    `trustedRealRunCanaryApproved: true`, `trustedRealRunApproved: false`,
    `lowRiskAutoMergeCanaryApproved: true`, max iterations no greater than
    `2`, and no stale-claim stealing, follow-up issue creation, review-fix
    mutation, or systemd enablement.
  - Limits auto-merge canary contracts to exact `workflow-docs-tooling`
    paths `tools/auto-runner/**` and `docs/workflow/**`, or exact
    `docs-planning` paths `docs/planning/**` and `docs/qa/**`, with
    `autoMergeEligible: true` and `manualMergeRequired: false`.
  - Preserves fail-closed gates for dangerous text/paths, disabled or unknown
    lanes, malformed/manual-gated contracts, broad globs, non-docs paths, stop
    labels, missing Gemini pass when configured, missing Codex mechanics
    approval, local validation, exact-head checks, review threads, PR-ref
    code scanning, stale PR head, base mismatch, dirty worktree, issue state,
    clean worktree, and source-branch restoration.
- Issue posture:
  keep #800 open. This checkpoint does not create canary issues, run a live
  canary, call Gemini, run provider smoke tests, merge PRs, enable overnight
  operation, or enable lanes beyond the bounded low-risk policy path.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, workflow docs, the
  issue ledger, and the example config. It does not change product runtime,
  API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment/env, secrets, production deploy, mobile
  release, public/admin exposure, branch deletion, force push, direct main
  push, or live auto-merge execution.

### Issue #800 - Low-risk auto-merge lane foundation checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #821 `CLOSED`; PR #822 merged the normal trusted workflow-docs pilot.
  - #818 `CLOSED`; this slice did not rerun or mutate the canary issue.
  - #805 `CLOSED`; this slice did not reopen or mutate the original canary.
- Verified repo baseline:
  `origin/main` at
  `08bfc2766d140bc1be63ecc1d17a5cbfa3560c2b` after PR #822 merged.
- This foundation slice:
  - Keeps built-in `allowAutoMerge` disabled and keeps live config under
    `/workspace/logs/**` out of the repository.
  - Adds a low-risk auto-merge decision helper for `workflow-docs-tooling` and
    `docs-planning` only.
  - Requires external config opt-in plus issue contract
    `autoMergeEligible: true` and `manualMergeRequired: false`.
  - Fails closed for changed-file mismatches, forbidden paths, missing Gemini
    pass when configured, missing Codex mechanics approval, failed local
    validation, stale PR head, base mismatch, pending/failing checks,
    unresolved review threads, open code-scanning alerts, blocking markers,
    issue stop labels, dirty worktree, and PR mergeability/draft/base issues.
  - Uses only normal GitHub merge-commit semantics and restores the exact
    reviewed source branch SHA with a normal non-force push if GitHub
    auto-deletes it after merge.
  - Writes sanitized auto-merge evidence under
    `/workspace/logs/settleora-auto-runner/auto-merge/` and extends summaries
    with eligibility, attempted state, result, PR head SHA, merge SHA, issue
    closure result, and blocked reason.
- Issue posture:
  keep #800 open. This checkpoint does not run a live auto-merge canary and
  does not approve trusted overnight operation, stale-claim stealing,
  follow-up issue creation, review-fix mutation, systemd enablement, or lanes
  beyond low-risk workflow/docs/planning tooling.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, workflow docs, and
  this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or live auto-merge
  execution.

### Issue #800/#818 - Contract-aware danger classifier checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805 `CLOSED`; it was not reopened or mutated by this slice.
  - #818 `OPEN` with `danger-gate` from the prior canary attempt; this slice
    did not rerun, relabel, close, or otherwise mutate #818.
- Verified repo baseline:
  `origin/main` at
  `a87227aa84c5b77bf0a53f0ebc6715dcc11ecdd5` after PR #817 merged.
- This classifier slice:
  - Makes the auto-runner danger classifier parse valid body-level contracts
    for eligible auto-runner issues before broad danger-word heuristics.
  - Treats explicit exclusion sections such as `Non-goals`, `Out of scope`,
    and `Prohibited actions` as negative scope, so the #818 canary body shape
    is not blocked only because those exclusions mention auth, storage,
    money, schema, OpenAPI, deployment, secrets, or public/admin exposure.
  - Preserves fail-closed blocking for malformed contracts, disabled/manual
    lanes, dangerous contract paths, and positive requests for manual-gated
    domains.
- Issue posture:
  keep #800 and #818 open. A separate explicit canary task is required before
  any future #818 rerun or label cleanup.
- Scope confirmation:
  this checkpoint changes only auto-runner tooling/tests, workflow docs, and
  this ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issue #800 - Integrated Gemini pre-PR reviewer gate checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805 `CLOSED`; it was not reopened or mutated by this slice.
- Verified repo baseline:
  `origin/main` at
  `a4406feded63bcb7ac211098bc91d3a912365038` after PR #816 merged.
- This integrated reviewer slice:
  - Wires Gemini into the normal auto-runner pre-PR review flow before branch
    push or PR creation.
  - Keeps built-in defaults safe: external Gemini review runs only when an
    external, uncommitted config enables the `cheap_independent` Gemini tier.
  - Limits the first integrated Gemini gate to low-risk
    `workflow-docs-tooling` and `docs-planning` paths.
  - Keeps Codex mechanics review as a separate review gate.
  - Fails closed for disallowed lanes/paths, strong-review or split/escalate
    routes, missing keys, unsupported/host-like models, malformed or non-pass
    verdicts, provider errors, budget hard stops, per-call cap failures,
    accounting parse/write failures, and secret-boundary violations.
  - Writes sanitized local integrated review evidence and reviewer accounting
    under `/workspace/logs/settleora-auto-runner/`.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted overnight
  operation, normal trusted real-run, canary real-run, auto-merge, stale-claim
  stealing, follow-up issue creation, review-fix mutation, systemd enablement,
  strong/tie-breaker tiers, PR comments from Gemini, or broader product/runtime
  lanes.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issue #800 - Gemini reviewer provider smoke-test foundation checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805 `CLOSED`; it was not reopened or mutated by this slice.
- Verified repo baseline:
  `origin/main` at
  `7290d75cb5c124fc2e57a26350ede1c40903ed21` after PR #815 merged.
- This provider smoke-test slice:
  - Adds disabled-by-default Gemini provider profile support for reviewer
    tiers.
  - Keeps Codex as the developer/mechanics path.
  - Documents Google-only independent reviewer direction:
    `cheap_independent` on Gemini Flash/Flash-Lite class models and
    `strong_independent` on Gemini Pro class models when explicitly
    configured.
  - Keeps `tie_breaker` disabled and does not add Claude or OpenAI reviewer
    provider wiring.
  - Adds a standalone `--reviewer-smoke-test` mode with an explicit
    `--live-external-reviewer-calls` gate for at most one tiny synthetic
    Gemini call.
  - Loads `GEMINI_API_KEY` only from process environment or an explicitly
    configured external env file under
    `/workspace/logs/settleora-auto-runner/secrets/`.
  - Applies reviewer accounting read and hard-stop checks before any live
    smoke call, and writes only sanitized smoke reports under
    `/workspace/logs/settleora-auto-runner/reviews/smoke-tests/`.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted overnight
  operation, canary real-run, normal real-run, auto-merge, stale-claim
  stealing, follow-up issue creation, review-fix mutation, systemd enablement,
  or always-on external reviewer calls.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issue #800 - Tiered reviewer budget policy foundation checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805 `CLOSED`; it was not reopened or mutated by this slice.
- Verified repo baseline:
  `origin/main` at
  `05dd93e6a71a1cedab0ea213df0949d6248b080b` after PR #814 merged.
- This policy foundation slice:
  - Adds disabled-by-default reviewer tiers for `cheap_independent`,
    `strong_independent`, `tie_breaker`, and `codex_mechanics`.
  - Adds reviewer budget defaults of USD 80 normal monthly reviewer budget,
    USD 95 reviewer hard stop, USD 300 total automation ceiling, USD 200 Codex
    subscription budget assumption, and 80% warning threshold.
  - Adds local cost-estimation arithmetic based on model/tier token estimates
    and per-million-token input/output prices.
  - Adds deterministic report-only reviewer routing for docs/workflow tooling,
    sensitive domains, large PRs, and huge cross-domain PRs.
  - Extends readiness and review-package output with sanitized reviewer policy
    data. Provider commands are reported only as configured/unconfigured and
    no provider secret is required.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted overnight
  operation, canary real-run, normal real-run, auto-merge, stale-claim
  stealing, follow-up issue creation, review-fix mutation, or systemd
  enablement.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issue #800 - Overnight readiness preflight checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805 `CLOSED` as completed after the bounded canary output PR merged.
- Verified repo baseline:
  `origin/main` at
  `2d1cbe475bf15ed2dc481d1e29b8cfc0a8c54dd3` after PR #813 merged.
- This readiness slice:
  - Adds a report-only `--readiness` preflight path for the DevBox
    auto-runner.
  - Writes JSON and Markdown readiness reports under
    `/workspace/logs/settleora-auto-runner/readiness/`.
  - Checks repo/worktree, `origin/main` reachability, GitHub auth/repo/issue
    state, eligible issue search shape, risky gate defaults, active/stale
    claim readouts, `auto-pr-opened` issue readouts, open auto-runner PRs,
    Codex command resolution without invocation, Node/log/disk sanity, and
    remaining manual gates.
  - Treats risky gate enablement as a readiness failure unless future explicit
    approval flags and documentation are added.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted overnight
  operation or any runner mutation lane.
- Remaining #800 manual gates:
  trusted overnight operation, any auto-merge lane, stale-claim stealing,
  follow-up issue creation, review-fix mutation, systemd service/timer
  installation or enablement, and any future expansion beyond approved
  workflow/planning tooling paths.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issue #800 - Post-canary completion and next gates checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
  - #805 `CLOSED` as completed after the bounded canary output PR merged.
- Verified repo baseline:
  `origin/main` at
  `78763163aa85ba8464a9dfdcd6b6190131a4c49d` after PR #812 merged.
- Completed canary slice:
  - PR #812 `Auto-runner: #805 Auto-runner canary: workflow docs harmless PR`
    was opened by the DevBox auto-runner from the contracted #805
    `workflow-docs-tooling` canary issue.
  - PR #812 changed exactly
    `docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md`.
  - The runner accepted the pre-PR review verdict through the selected
    reviewer stdout boundary, with the raw review log remaining diagnostic
    evidence only.
  - Runner docs-only validation passed before PR creation, and the PR merge
    gate recorded local docs validation plus GitHub checks passing on exact PR
    head `077ee8e70832611af856a5059a95e5ed69f3f783`.
  - PR #812 required human review/merge and was merged manually with normal
    GitHub merge commit
    `78763163aa85ba8464a9dfdcd6b6190131a4c49d`.
- Issue posture:
  keep #800 open. Closing #805 completed only the bounded canary target; it did
  not approve broader unattended operation or Day 1/product runtime work.
- Remaining #800 manual gates:
  trusted overnight operation, any auto-merge lane, stale-claim stealing,
  follow-up issue creation, review-fix mutation, systemd service/timer
  installation or enablement, and any future expansion beyond approved
  workflow/planning tooling paths.
- Scope confirmation:
  this checkpoint is documentation/planning only. It does not change product
  runtime, API behavior, auth/session/security runtime, storage/privacy/authz,
  money/settlement/payment/bill calculation, schema/migration,
  OpenAPI/generated clients, sync/import/export/backup/restore runtime, OCR
  runtime, Docker/CI/deployment, secrets/env/auth config, production deploy,
  mobile release, public/admin exposure, branch deletion, force push, direct
  main push, or auto-merge enablement.

### Issue #800 - Auto-runner issue-contract and lane-manifest checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
- Verified repo baseline:
  `origin/main` at
  `02e4942dd3c51abe6e083caa173bd19580a532ad` before this contract/lane
  manifest task branch.
- Prior merged slices:
  - PR #801 merged the DevBox-native unattended Codex auto-runner foundation.
  - PR #802 merged real-run safety hardening, preflight diagnostics,
    dry-run fixtures, safer outcome cleanup, and the previous #800 ledger
    checkpoint.
- This hardening slice:
  - Adds a body-only `## Auto-runner contract` JSON parser for explicit
    automation metadata.
  - Requires `contractVersion`, `lane`, `allowedPaths`,
    `validationProfile`, `manualMergeRequired`, `autoMergeEligible`, and
    `requiredReading`.
  - Treats `auto-ready` and `auto-bundle` labels as eligibility signals only;
    they no longer authorize implementation by themselves.
  - Adds a trusted lane manifest for `workflow-docs-tooling`,
    `docs-planning`, and disabled/manual-gated danger placeholders.
  - Requires contract `allowedPaths` to be a subset of lane manifest paths and
    blocks PR creation when changed files are outside the contract or lane
    allowlist.
  - Adds trusted validation profile mapping for `docs-only`,
    `workflow-tooling`, `runner-tests`, and `scaffold-docs`; issue text cannot
    inject shell commands.
  - Extends auto-runner tests and fixtures for valid contracts, missing or
    malformed contracts, unknown lanes/profiles, danger gates, unsafe paths,
    and multi-iteration continuation after blocked/gated outcomes.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted overnight real-run,
  auto-merge, stale-claim stealing, follow-up issue creation, review-fix
  mutation, or systemd enablement.
- Remaining #800 manual gates:
  trusted unattended real-run operation, any auto-merge lane, stale-claim
  stealing, follow-up issue creation, review-fix cycle mutation, systemd
  service/timer installation or enablement, and any future expansion beyond
  approved workflow/planning tooling paths.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issue #800 - DevBox auto-runner foundation and real-run safety hardening checkpoint

- GitHub state/project status:
  - #800 `OPEN`; this remains the broader tracker for trusted unattended
    Codex auto-runner enablement.
- Verified repo baseline:
  `origin/main` at
  `eaaf0ee1baf5d70dad558e0b5f5569911d1e8459` before this hardening task
  branch.
- Foundation completed:
  - PR #801 `Add DevBox unattended Codex auto-runner foundation` was merged to
    `main`.
  - PR #801 merge/final main SHA:
    `eaaf0ee1baf5d70dad558e0b5f5569911d1e8459`.
  - Foundation scope added `docs/workflow/AUTONOMOUS_CODEX_RUNNER.md` and
    `tools/auto-runner/**` for issue-label polling, safe claim modeling,
    lane/danger gates, generated Codex prompts, DevBox-local Codex invocation,
    report collection, validation planning, pre-PR review package/review gate,
    explicit-path commit plumbing, PR/check stubs, summaries, external log
    directories, and example-only systemd templates.
- This hardening slice:
  - Adds non-mutating preflight diagnostics for repo/GitHub/Codex/log/config
    readiness.
  - Adds dry-run fixture issue simulation for deterministic multi-iteration
    loop evidence without live GitHub or Codex mutation.
  - Hardens issue claim/outcome lifecycle cleanup so terminal outcomes remove
    `auto-running`, PR-opened outcomes add `auto-pr-opened`, and blocked/
    failure outcomes add stop labels.
  - Refines workflow/tooling lane policy to avoid generic `config` false
    positives while preserving gates for auth/security, storage/privacy,
    money/settlement/payment/bill calculation, schema/migration,
    OpenAPI/generated clients, sync/import/export/restore, Docker/CI/
    deployment, secrets/env, public/admin exposure, mobile release, branch
    cleanup/history rewrite, and architecture replacement.
  - Hardens reviewer verdict parsing and documents review package evidence and
    mutation guard behavior.
- Issue posture:
  keep #800 open. This checkpoint does not approve trusted real-run operation
  and does not complete broader unattended runner enablement.
- Remaining #800 manual gates:
  trusted real-run operation, any auto-merge lane, stale-claim stealing,
  follow-up issue creation, review-fix cycle mutation, systemd service/timer
  installation or enablement, and any future expansion beyond workflow/tooling
  paths.
- Scope confirmation:
  this checkpoint changes only `tools/auto-runner/**`, workflow docs, and this
  ledger entry. It does not change product runtime, API behavior,
  auth/session/security runtime, storage/privacy/authz, money/settlement/
  payment/bill calculation, schema/migration, OpenAPI/generated clients,
  sync/import/export/backup/restore runtime, OCR runtime, Docker/CI/deployment,
  secrets/env/auth config, production deploy, mobile release, public/admin
  exposure, branch deletion, force push, direct main push, or auto-merge
  enablement.

### Issues #336/#337/#784/#777 - Invitation lifecycle cleanup runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the API/domain-owned
    invitation lifecycle cleanup/retention runtime slice. Delivery persistence/
    outbox, distributed abuse storage, UI/Figma/mobile/user-web/admin-web
    surfaces, public self-registration, OIDC-adjacent onboarding, and
    production/public-exposure gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `63a1bdf12f7e1bce609fe7a82d32bf1d70532c85` before this task branch.
- Branch:
  `feature/auth-invitation-lifecycle-cleanup-runtime-20260709-0008`.
- Completed slice:
  - Added `IInvitationLifecycleCleanupService` under the auth invitation
    runtime boundary and registered it through the existing invitation service
    collection wiring.
  - Cleanup is invoked from existing invitation management/read/mutation and
    public acceptance paths before normal invitation queries, with no new
    background worker or cross-domain table mutation.
  - Pending invitations whose server-controlled `ExpiresAtUtc` has passed are
    marked `expired`, receive bounded `ExpiredAtUtc`/`UpdatedAtUtc`
    timestamps, and become cleanup-eligible after the current 90-day terminal
    retention posture.
  - Accepted, revoked, and expired terminal invitations are hard-deleted only
    after `CleanupEligibleAtUtc` has passed, avoiding retention of contact and
    hash material without schema changes.
  - Cleanup is idempotent and bounded to 50 total invitation changes per
    invocation; unexpired pending invitations and terminal invitations before
    cleanup eligibility are retained.
  - Added `invitation.cleanup_completed` audit only when cleanup changes state.
    Metadata contains counts/categories, batch-cap state, and a safe timing
    bucket only; it does not include invitation IDs, raw invitation secrets,
    raw links, secret hashes, full contact identifiers, SMTP/provider
    diagnostics, request bodies, passwords, session/refresh material, source
    IP, user-agent, or unrelated user data.
- Validation checkpoint:
  - Focused
    `InvitationLifecycleCleanupRuntimeTests|InvitationAcceptanceRuntimeTests|InvitationManagementRuntimeTests|InvitationEmailSenderTests`
    filter passed with `50` passed, `0` failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  delivery attempt persistence/outbox if chosen, distributed abuse controls,
  UI/Figma/mobile/user-web/admin-web surfaces, public self-registration and
  OIDC-adjacent onboarding gates, and production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation lifecycle cleanup runtime,
  focused tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, delivery attempt persistence/outbox
  schema or worker behavior, distributed limiter storage, invitation email/
  provider transport semantics, public invitation accept response shape,
  session or refresh credential issuance from invitation acceptance, public
  self-registration, OIDC/Keycloak runtime, owner/admin invitation target
  roles, owner/admin role assignment, local-account/admin-created-user
  hardening outside existing invitation acceptance, mobile/user-web/admin UI,
  Figma, production/public exposure, Docker/CI/deployment, appsettings/env/
  secrets, storage, sync, import/export, backup/restore, OCR, money,
  settlement, payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation abuse controls runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only a focused single-node
    invitation abuse-control runtime foundation for current create/resend/
    accept flows after PR #797. Delivery persistence/outbox, distributed abuse
    storage, cleanup/retention jobs, UI/Figma, public self-registration,
    OIDC-adjacent onboarding, and production/public-exposure gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `fec1267b52c322bfe69596f219e09a26db617a53` before this task branch.
- Branch:
  `feature/auth-invitation-abuse-controls-runtime-20260708-2328`.
- Completed slice:
  - Added `IInvitationAbusePolicyService` with invitation-specific request,
    decision, outcome, operation, scope, and option types plus an in-memory
    single-node implementation registered under the invitation runtime.
  - Invitation abuse bucket keys are bounded safe values derived from
    operation, actor, subject/contact/invitation/material, and a conservative
    local source bucket. Raw invitation secrets, raw emails, raw links, SMTP
    diagnostics, request bodies, provider payloads, passwords, session tokens,
    refresh material, and secret hashes are not used as bucket keys or echoed
    by debug strings.
  - Owner/admin create checks abuse policy after request normalization and
    before duplicate lookup, raw invitation secret generation, row creation, or
    delivery handoff. Throttled create returns the existing contract-supported
    `429` problem response and creates no invitation rows.
  - Owner/admin resend checks abuse policy before lookup by actor/invitation
    category and again after safely loading the invitation/contact category,
    before hash rotation, template composition, or email/sink handoff.
    Throttled resend returns `429` without rotating or sending.
  - Public accept now uses invitation-specific abuse semantics instead of the
    sign-in abuse service, still using only a safe invitation-material
    fingerprint plus conservative local source bucket before lookup/account
    work. Throttled accept remains generic and does not issue sessions or
    refresh credentials.
  - Added focused tests proving create/resend throttling prevents row creation,
    hash rotation, delivery handoff, and raw material exposure; public accept
    throttling stays generic and creates no account; safe bucket/debug helpers
    do not echo raw secrets, contact, or source values; existing invitation
    success paths still pass.
- Validation checkpoint:
  - Focused `InvitationManagementRuntimeTests|InvitationAcceptanceRuntimeTests`
    filter passed with `36` passed, `0` failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Abuse-control storage posture:
  single-node/in-memory only. Counters reset on process restart and are not
  coordinated across API replicas; distributed Redis/database/provider-backed
  persistence remains a future reviewed #784 gate.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  delivery attempt persistence/outbox if chosen, distributed abuse controls,
  lifecycle cleanup/retention jobs, UI/Figma/mobile/user-web/admin-web
  surfaces, public self-registration and OIDC-adjacent onboarding gates, and
  production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation abuse-control runtime,
  focused tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, notification delivery persistence/
  outbox schema, public self-registration, OIDC/Keycloak runtime, owner/admin
  invitation target roles, owner/admin role assignment, local-account/admin-
  created-user hardening outside existing invitation acceptance, session or
  refresh-token issuance from invitation acceptance, mobile/user-web/admin UI,
  Figma, production/public exposure, Docker/CI/deployment, appsettings/env/
  secrets, storage, sync, import/export, backup/restore, OCR, money,
  settlement, payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Admin invitation delivery runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the admin create/resend
    invitation delivery wiring slice after PR #796. Delivery persistence/outbox,
    broader abuse hardening, cleanup/retention jobs, UI/Figma, public
    self-registration, OIDC-adjacent onboarding, and production/public-exposure
    gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `d4b9306732bf4712a0b83579aa30f9b156863106` before this task branch.
- Branch:
  `feature/auth-invitation-admin-delivery-runtime-20260708-2246`.
- Completed slice:
  - Added an invitation-specific internal email sender boundary that accepts
    only a send-ready invitation message plus recipient email, reuses the
    existing SMTP transport in production mode, treats local/test sink modes as
    non-SMTP safe sink acceptance, and returns redacted bounded categories.
  - Wired owner/admin invitation create to persist the hash-only invitation row
    before any raw invitation material leaves through the explicit delivery
    boundary, while preserving `not_requested` behavior when delivery is false.
  - Wired owner/admin resend so `deliveryRequested=false` does not rotate,
    unavailable readiness/template delivery does not rotate or claim delivery,
    and ready delivery rotates the stored hash before handoff so old raw
    material no longer redeems after rotation.
  - Added bounded `invitation.delivery_result` audit metadata and kept
    `invitation.created`/`invitation.resend_requested` metadata secret-free.
  - Added focused tests for not-requested create/resend, disabled/unavailable
    delivery, configured production SMTP handoff, sink-mode no-SMTP behavior,
    provider exception mapping, resend no-rotation cases, resend rotation with
    public accept proof, sender redaction, and regression coverage across
    invitation management/acceptance/readiness/template/SMTP/provider tests.
- Validation checkpoint:
  - Focused `InvitationEmailSenderTests|InvitationManagementRuntimeTests|
    InvitationAcceptanceRuntimeTests` filter passed with `40` passed, `0`
    failed, `0` skipped.
  - Broader focused invitation/email regression filter passed with `136`
    passed, `0` failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  delivery attempt persistence/outbox if chosen, stronger/distributed abuse
  controls, lifecycle cleanup/retention jobs, UI/Figma/mobile/user-web/admin-web
  surfaces, public self-registration and OIDC-adjacent onboarding gates, and
  production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation admin delivery runtime,
  invitation-specific SMTP/sink sender code, focused tests, and this ledger
  entry. It does not change OpenAPI/contracts, generated clients,
  schema/migrations, notification delivery persistence/outbox schema, public
  invitation accept/redeem semantics or response shape, public
  self-registration, OIDC/Keycloak runtime, owner/admin invitation target roles,
  owner/admin role assignment, local-account/admin-created-user hardening,
  mobile/user-web/admin UI, Figma, production/public exposure,
  Docker/CI/deployment, appsettings/env/secrets, storage, sync, import/export,
  backup/restore, OCR, money, settlement, payment, bill calculation, issue
  closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation delivery/link foundation checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only an internal invitation
    email-delivery readiness and configured-link/template foundation. Admin
    create/resend still do not send email, rotate resend secrets, queue
    delivery, or claim sent delivery.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `bd7b0c3870eb04e6efb2974dc76482a28642b98d` before this task branch.
- Branch:
  `feature/auth-invitation-delivery-link-foundation-20260708-2210`.
- Completed slice:
  - Added invitation email delivery options/readiness services under the auth
    invitation runtime boundary, default disabled/off and fail-closed when
    SMTP/provider readiness, delivery mode, public origin, or invite path is
    unsafe or unconfigured.
  - Added invitation-specific configured-origin/link policy and template
    composer. Raw invitation material is accepted only as method input and is
    placed only in the send-ready invitation link/message returned by the
    explicit internal composition boundary.
  - Kept public-origin handling explicit and configuration-only. Link
    construction does not derive origins from request `Host`, forwarded,
    referrer, or other client-controlled headers.
  - Added redacted preview and `ToString()` behavior that excludes raw
    invitation secrets, raw links, full contacts, SMTP/provider values, request
    bodies, passwords, tokens, and provider diagnostics.
  - Registered the internal invitation delivery readiness/template services
    through the existing invitation service collection wiring without changing
    admin create/resend delivery behavior.
  - Added focused tests for disabled defaults, no fake sent state, unsafe
    public origins, unsafe invite paths, configured-origin/path-only link
    construction, raw secret redaction outside send-ready messages,
    privacy-safe generic templates, no realistic SMTP/provider config values,
    and DI registration.
- Validation checkpoint:
  - Focused `InvitationEmail` test filter passed with `38` passed, `0`
    failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  connecting admin create/resend to reviewed provider delivery, resend
  rotate-and-deliver behavior, delivery attempt persistence/outbox if chosen,
  stronger/distributed abuse controls, lifecycle cleanup/retention jobs, UI
  surfaces, public self-registration and OIDC-adjacent onboarding gates, and
  production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation internal delivery/link
  foundation, focused tests, configuration binding coverage, and this ledger
  entry. It does not change OpenAPI/contracts, generated clients,
  schema/migrations, admin create/resend delivery behavior, actual SMTP
  sending from invitation create/resend, public invitation accept/redeem
  semantics, invitation acceptance response shape, public self-registration,
  OIDC/Keycloak runtime, owner/admin invitation target roles, owner/admin role
  assignment, local-account/admin-created-user hardening, mobile/user-web/admin
  UI, Figma, production/public exposure, Docker/CI/deployment,
  appsettings/env/secrets, storage, sync, import/export, backup/restore, OCR,
  money, settlement, payment, bill calculation, issue closure, or branch
  cleanup.

### Issues #336/#337/#784/#777 - Public invitation accept/redeem runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the public invitation
    accept/redeem runtime slice for the existing
    `POST /api/v1/auth/invitations/accept` contract. Invitation email/provider
    delivery, invitation link construction, resend rotate-and-deliver behavior,
    public self-registration, OIDC/Keycloak runtime, broader abuse controls,
    lifecycle cleanup jobs, UI/Figma, and adjacent auth onboarding gates remain
    open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `6748624663805c78ccafe443decf7c6ff32ca60f` before this task branch.
- Branch:
  `feature/auth-invitation-public-accept-redeem-runtime-20260708-2041`.
- Completed slice:
  - Added anonymous `POST /api/v1/auth/invitations/accept` runtime for the
    existing OpenAPI request/response shape without changing contracts or
    generated clients.
  - Added strict request parsing for object-only JSON, required
    `invitationSecret`, `displayName`, and `localPassword`, unsupported-field
    rejection, and bounded field validation.
  - Reused the internal invitation secret hash/version boundary for
    admin-created invitation material and public redemption lookup; raw
    invitation material remains request-only and is not persisted, returned, or
    audited.
  - Enforced server-side pending/unaccepted/unrevoked/unexpired, user-only,
    email-only, and capability-enabled redemption policy. Capability disabled
    fails closed.
  - Created the invited Day 1 local user account/profile/identity/credential
    through the existing credential workflow boundary, assigned only system
    `user`, and returned only `accepted_sign_in_required` with
    `signInRequired: true`.
  - Marked accepted invitations terminal in the same account/credential
    transaction where relational transactions are available, with non-relational
    cleanup coverage for focused tests.
  - Added bounded `invitation.accepted` success audit and generic bounded
    `invitation.accept_failed` audit for pre-transaction public failures. Audit
    metadata excludes raw secret, raw link, secret hash, full email/contact,
    password, verifier, session/refresh token, provider payload, request body,
    and unrelated user data.
  - Reused the existing in-memory sign-in abuse policy service with a safe
    invitation-material fingerprint and fixed single-node source bucket for
    public accept attempts.
- Validation checkpoint:
  - Focused `InvitationAcceptanceRuntimeTests` passed with `14` passed, `0`
    failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Remaining #784 gates:
  invitation delivery/provider behavior, invitation link construction,
  resend rotate-and-deliver behavior, distributed/stronger abuse controls,
  lifecycle cleanup, UI surfaces, public self-registration and OIDC-adjacent
  onboarding gates, and production/public-exposure review.
- Scope confirmation:
  this checkpoint changes only API auth invitation public accept/redeem
  runtime, focused tests, and this ledger entry. It does not change OpenAPI/
  contracts, generated clients, schema/migrations, invitation email/provider
  delivery, invitation link construction, public self-registration,
  OIDC/Keycloak runtime, owner/admin role assignment, mobile/user-web/admin UI,
  Figma, production/public exposure, Docker/CI/deployment, appsettings/env/
  secrets, storage, sync, import/export, backup/restore, OCR, money,
  settlement, payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation admin management runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the owner/admin invitation
    management runtime slice for create/list/get/revoke/resend over the
    existing contract. Public accept/redeem runtime, email/provider delivery,
    invitation link construction, broader abuse controls, lifecycle cleanup,
    UI/Figma, and adjacent auth onboarding gates remain open.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `069b1f67e93e0a82fda00cfec035880eea07cfe1` before this task branch.
- Branch:
  `feature/auth-invitation-admin-management-runtime-20260708-1957`.
- Completed slice:
  - Added owner/admin-only runtime handlers for
    `GET /api/v1/admin/auth/invitations`,
    `POST /api/v1/admin/auth/invitations`,
    `GET /api/v1/admin/auth/invitations/{invitationId}`,
    `POST /api/v1/admin/auth/invitations/{invitationId}/revoke`, and
    `POST /api/v1/admin/auth/invitations/{invitationId}/resend`.
  - Kept creation/resend default-off behind the persisted invitation policy;
    revocation of existing pending invitations remains owner/admin-controlled
    even when creation/resend is disabled.
  - Enforced #784 Day 1 constraints: email-only contact identifiers,
    user-only invitation targets, duplicate pending invitation rejection, and
    bounded safe admin readbacks.
  - Added server-side random invitation material generation for create and
    persisted only a versioned lookup hash. Raw invitation material is not
    accepted from admin callers and is not returned by create/list/get/revoke/
    resend responses.
  - Kept delivery truthful in this no-delivery slice: create/resend return
    `provider_unconfigured` or `not_requested` delivery state and do not claim
    queued/sent delivery, construct links, call SMTP, or persist provider
    payloads.
  - Added bounded auth audit events for `invitation.created`,
    `invitation.revoked`, and `invitation.resend_requested` with invitation ID
    and category metadata only. Audit metadata does not include raw invitation
    material, raw links, secret hashes, full contact identifiers, request
    bodies, provider payloads, SMTP diagnostics, passwords, session tokens, or
    refresh tokens.
  - Added focused runtime tests for owner/admin access, normal-user/anonymous
    denial, default-off create/resend blocking, enabled-policy creation,
    user-only/email-only validation, duplicate pending handling, safe readbacks,
    revoke terminal behavior, resend no-fake-delivery behavior, hash-only
    persistence, and audit redaction.
- Validation checkpoint:
  - Focused invitation runtime/schema filter passed with `25` passed, `0`
    failed, `0` skipped.
  - Broader validation for this branch is recorded in the task report.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only API auth invitation admin management runtime,
  focused tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, public invitation accept/redeem
  behavior, email/provider delivery, invitation link construction, public
  self-registration, OIDC/Keycloak runtime, owner/admin role assignment,
  local-account/admin-created-user hardening, mobile/user-web/admin UI, Figma,
  notification/security-center runtime, password reset/change behavior,
  production/public exposure, Docker/CI/deployment, appsettings/env/secrets,
  storage, sync, import/export, backup/restore, OCR, money, settlement,
  payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation policy runtime checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the default-off invitation
    capability/policy runtime foundation. Owner/admin invitation create/list/
    get/revoke/resend handlers, public accept/redeem runtime, raw invitation
    secret generation/hash verification, email/provider delivery, invitation
    link construction, abuse controls, lifecycle cleanup, and UI remain open
    follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a separate
    manual gate.
- Verified repo baseline:
  `origin/main` at
  `f9153c24057387728e3469cec43a61520b43d985` before this task branch.
- Branch:
  `feature/auth-invitation-policy-runtime-20260708-1846`.
- Completed slice:
  - Added authenticated `GET /api/v1/auth/invitations/capability` runtime
    readout matching the existing OpenAPI contract, defaulting invitation
    capability to disabled/off when no policy row exists.
  - Added owner/admin-only `GET /api/v1/admin/auth/invitation-policy` and
    `PATCH /api/v1/admin/auth/invitation-policy` runtime.
  - Added a narrow API-owned durable `auth_invitation_policies` persistence
    table for invitation policy state only, with active/retired versions,
    capability state, pending-invite grace flag, timestamps, and safe actor
    reference.
  - Added an invitation policy service boundary so API/domain code owns the
    policy write and read decisions; clients and generated clients remain
    display callers only.
  - Wrote safe `invitation.policy_changed` auth audit events only for actual
    policy changes. Repeated idempotent updates return the current readout
    without duplicate audit writes.
  - Added focused runtime/schema tests for default-off behavior, owner/admin
    read/update, normal-user/anonymous admin denial, persistence across service
    scopes, safe audit metadata, idempotent updates, additive migration scope,
    and no mutation of invitation rows, password-reset rows, or active session
    credential state.
- Validation checkpoint:
  - `npm run doctor:validation` passed.
  - Focused auth/runtime regression filter passed with `50` passed, `0`
    failed, `0` skipped.
  - Focused invitation schema/migration filter passed with `5` passed, `0`
    failed, `0` skipped.
  - `/usr/bin/time -f 'ELAPSED=%E EXIT=%x' npm run validate:api` passed with
    `1426` passed, `0` failed, `0` skipped, `ELAPSED=6:24.51 EXIT=0`.
  - `npm run validate:openapi` passed.
  - `npm run validate:clients` passed.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only API auth invitation policy runtime, a narrow
  additive policy-state migration/model, focused tests, and this ledger entry.
  It does not change OpenAPI/contracts, generated clients, owner/admin
  invitation create/list/get/revoke/resend handlers, public invitation
  accept/redeem behavior, raw invitation secret generation/validation,
  invitation email/provider delivery, invitation link construction, public
  self-registration, OIDC/Keycloak runtime, owner/admin role assignment,
  local-account/admin-created-user policy hardening, mobile/user-web/admin UI,
  Figma, notification/security-center runtime, password reset/change behavior,
  production/public exposure, Docker/CI/deployment, appsettings/env/secrets,
  storage, sync, import/export, backup/restore, OCR, money, settlement,
  payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation OpenAPI/generated-client contract checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the reviewed invitation
    OpenAPI contract and generated-client surface slice. Invitation runtime
    policy enforcement, owner/admin create/list/revoke/resend handlers, raw
    invitation secret generation/hash verification, public accept/redeem
    behavior, email/provider delivery, audit writers, abuse controls,
    lifecycle cleanup, and UI remain open follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `91bdcf2b2d4868860728233609a715047d0cc139` before this task branch.
- Branch:
  `feature/auth-invitation-openapi-contract-20260708-1755`.
- Completed slice:
  - Added invitation capability and policy readout contract shapes that
    represent default-disabled invitation capability and preserve owner/admin
    control over future policy mutation.
  - Added owner/admin invitation management transport contracts for create,
    list, get, revoke, and resend under guarded admin auth paths.
  - Kept #784 invitation targets constrained to system `user` only and contact
    identifier kind constrained to `email` only.
  - Added public invitation accept/redeem transport contract with raw
    invitation secret material accepted only as write-only request input.
  - Kept accept/redeem responses anti-enumeration-oriented and token-free; no
    access session, refresh credential, raw invitation secret, raw link, secret
    hash, provider payload, email body, request body, or audit internals are
    exposed by response schemas.
  - Added bounded admin invitation metadata readbacks: invitation ID, lifecycle
    status, contact kind, optional display-safe contact label, user-only target
    role, delivery-state category, lifecycle timestamps, cleanup timestamp, and
    safe actor IDs where policy allows.
  - Added generated web and Dart client updates produced by
    `npm run generate:clients`; generated files were not hand-edited.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only the OpenAPI contract, generated web/Dart client
  output, and this ledger entry. It does not change API runtime endpoints,
  handlers, services, validators, middleware, auth/session behavior, invitation
  token generation/validation, invitation email delivery, public
  self-registration, OIDC/Keycloak, owner/admin role assignment,
  admin-created-user hardening, EF/domain/schema/migrations, mobile/user-web/
  admin UI, Figma, notification/security-center runtime, password reset/change
  behavior, production/public exposure, Docker/CI/deployment,
  appsettings/env/secrets, storage, sync, import/export, backup/restore, OCR,
  money, settlement, payment, bill calculation, issue closure, or branch
  cleanup.

### Issues #336/#337/#784/#777 - Invitation policy/audit readiness checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the docs/control policy,
    capability-state, authorization, lifecycle, audit, abuse, delivery-boundary,
    and future split-readiness slice. Invitation OpenAPI, generated clients,
    runtime create/list/revoke/accept/redeem/send behavior, raw invitation
    secret generation/validation, email/provider delivery, and UI remain open
    follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `502e71356b622344315a6cf066acb0fd80eda955` before this task branch.
- Branch:
  `docs/auth-invitation-policy-audit-readiness-20260708-1728`.
- Completed slice:
  - Added
    [Auth invitation policy and audit readiness](../architecture/AUTH_INVITATION_POLICY_AUDIT_READINESS.md).
  - Recorded that invitations remain a Day 1 available capability, default
    disabled/off until authenticated owner/admin policy enables them.
  - Preserved full Day 1 auth onboarding scope: invitations, public
    self-registration, local accounts, and OIDC/Keycloak remain Day 1 available
    capabilities with risky entry points default off; setup-only first-owner
    bootstrap remains separate and must not become public registration.
  - Defined owner/admin authorization boundaries for invite create/list/revoke/
    resend and invitation policy changes, with public accept/redeem limited to
    a server-authorized redemption attempt.
  - Confirmed #784 invitation targets are system `user` only. Owner/admin
    invitation or role elevation remains excluded and belongs to #785.
  - Kept contact identifiers email-only unless a later reviewed design expands
    the schema and delivery model.
  - Defined lifecycle/readiness expectations for expiry, revocation, single-use
    acceptance, cleanup retention, duplicate pending invitation handling, and
    idempotency.
  - Reaffirmed raw invitation secret/link handling: hash-only at rest, raw
    material only at creation/delivery boundary, never in logs, audit, API
    readbacks, reports, provider diagnostics, or generated examples.
  - Defined audit event families and safe/forbidden metadata for invitation
    policy changes, create/send/resend/revoke/expire/accept/cleanup outcomes.
  - Defined anti-enumeration and abuse posture for public accept/redeem and
    owner/admin create/resend.
  - Linked invitation delivery to the SMTP/email provider policy while keeping
    password-reset SMTP semantics separate.
  - Recorded the future #784 split order: OpenAPI/contract, runtime policy/
    authorization/audit, secret/redemption/lifecycle runtime, email/provider
    delivery, then Figma/UI.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only docs/architecture and docs/planning files. It
  does not change OpenAPI/contracts, generated clients, runtime endpoints,
  invitation token generation/validation, accept/redeem flow, email delivery,
  public self-registration, OIDC/Keycloak, owner/admin role assignment,
  admin-created user policy, mobile/user-web/admin UI, Figma, notification/
  security-center runtime, password reset/change behavior, production/public
  exposure, Docker/CI/deployment, appsettings/env/secrets, storage, sync,
  import/export, backup/restore, OCR, money, settlement, payment, bill
  calculation, issue closure, or branch cleanup.

### Issues #336/#337/#784/#777 - Invitation schema foundation checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #784 `OPEN`; this checkpoint completes only the first invitation
    persistence/domain foundation slice. Invitation OpenAPI, generated
    clients, runtime create/list/revoke/accept/send behavior, policy toggles,
    audit writers, email delivery, and UI remain open follow-up gates.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `9334397384c7700ec3addedffc9497849d94ab5d` before this task branch.
- Branch:
  `feature/auth-invitation-schema-foundation-20260708-1649`.
- Completed slice:
  - Added an API-owned auth-domain invitation persistence foundation with an
    additive `auth_invitations` table and `AuthInvitation` domain model.
  - Invitation rows store only `invitation_secret_hash` plus
    `invitation_secret_hash_version`; raw invitation tokens, codes, links,
    reusable material, request bodies, provider payloads, session tokens,
    refresh credentials, password material, storage fields, and money fields
    are not part of the model/table shape.
  - Bounded metadata covers normalized contact identifier kind/value, user-only
    target system role, invited-by auth account/profile, optional revoked-by
    auth account, status, created/updated/expiry, accepted/revoked/expired,
    and cleanup-eligible timestamps.
  - Status is constrained to `pending`, `accepted`, `revoked`, and `expired`;
    target system role is constrained to `user` only. Owner/admin invitation
    assignment and lockout protection remain separate #785 work.
  - Added model/migration tests proving hash-only invite material, user-only
    target role, required indexes/constraints, additive migration operations,
    and no storage/money/sync/security-center side-effect tables.
- Migration assessment:
  the migration is additive and creates `auth_invitations` with restrictive
  auth account/user profile foreign keys plus indexes for secret hash,
  pending contact uniqueness, status/expiry lookup, actor lookup, and cleanup
  lookup. It does not drop, alter, or mutate existing tables.
- Issue posture:
  keep #336, #337, #784, #777, and related child issues #785-#788 open. This
  checkpoint does not complete Day 1 invitation capability and does not close
  #784.
- Scope confirmation:
  this checkpoint changes only API auth invitation domain/schema tests,
  additive EF migration/schema snapshot, and this ledger entry. It does not
  change OpenAPI/contracts, generated clients, runtime endpoints, invitation
  token generation/validation, accept/redeem flow, email delivery, public
  self-registration, OIDC/Keycloak, owner/admin role assignment, admin-created
  user policy, mobile/user-web/admin UI, Figma, notification/security-center
  runtime, password reset/change behavior, production/public exposure,
  Docker/CI/deployment, appsettings/env/secrets, storage, sync, import/export,
  backup/restore, OCR, money, settlement, payment, bill calculation, issue
  closure, or branch cleanup.

### Issues #336/#337/#777 - Auth onboarding full Day 1 policy checkpoint

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #337 `OPEN`; broad Day 1 invite/registration/local-account/OIDC policy
    parent remains open.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `e4aceacb502022387ce46b53be16cef903a4ec60` before this task branch.
- Maintainer decision:
  the earlier #337 readiness posture that implied OIDC/Keycloak runtime later
  and public self-registration later is superseded. Day 1 auth onboarding must
  preserve invitations, public self-registration, local accounts, and
  OIDC/Keycloak as available product capabilities.
- Corrected Day 1 policy:
  - Default posture is safe: invitations, public self-registration, local
    accounts, and OIDC/Keycloak are off or disabled until explicitly enabled
    by owner/admin policy, except setup-only first-owner bootstrap for an empty
    deployment.
  - Setup-only first-owner bootstrap remains allowed only while no auth account
    exists and must not become public registration.
  - Public self-registration is off by default but must be implemented as a
    gated Day 1 capability, not deferred out of Day 1.
  - Local accounts are available as a Day 1 capability and may be disabled by
    policy only when a safe owner/admin authentication path remains.
  - OIDC/Keycloak are Day 1 available capabilities, default disabled until
    configured, and OIDC-only mode must prevent owner lockout.
  - Invitations are Day 1 available capabilities, default disabled until
    owner/admin policy enables them, and must support safe expiry, revocation,
    and audit in later implementation.
- Issue split/readback:
  - Reused #337 for the broad onboarding policy/capability parent.
  - Reused #464/#465 for admin onboarding/settings UI and Figma planning.
  - Created #784 for Day 1 invitation schema/OpenAPI/runtime.
  - Created #785 for owner/admin role assignment and auth lockout protection.
  - Created #786 for Day 1 public self-registration policy/OpenAPI/runtime.
  - Created #787 for Day 1 OIDC and Keycloak provider runtime.
  - Created #788 for Day 1 local-account and admin-created user policy
    hardening.
  - Reused #773/#775/#776 only as adjacent provider-reset/admin-recovery/
    MFA-passkey gates; they do not replace the core onboarding gates above.
- Security board readback:
  live open code-scanning alerts on `refs/heads/main`: `0`; live open
  Dependabot alerts: `0`.
- Issue posture:
  keep #336, #337, #338, #339, #777, and child issues #784-#788 open. This
  checkpoint records policy and issue split only; it does not implement runtime
  onboarding behavior or complete the auth/session/runtime security epic.
- Scope confirmation:
  this checkpoint is docs/planning and GitHub issue hygiene only. It does not
  change runtime/API/backend behavior, OpenAPI/contracts, generated clients,
  schema/migrations, mobile/user-web/admin UI, password reset behavior,
  session/runtime auth behavior, notification/security-center runtime,
  MFA/passkey runtime, production/public exposure, Docker/CI/deployment,
  appsettings/env/secrets, storage, sync, import/export, backup/restore, OCR,
  money, settlement, payment, bill calculation, issue closure, or issue/project
  metadata beyond creating the child issues with existing labels and posting
  checkpoint comments where recorded in the task report.

### Issues #336/#338/#777 - Current-account session revocation refresh-continuity hardening

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #338 `OPEN`; this checkpoint completes one focused API/test hardening
    slice for current-account session revocation and refresh continuity, but
    the issue remains open for review, future UX/security-center decisions,
    and any later approved session/device visibility work.
  - #777 `OPEN`; production/public-exposure security review remains a
    separate manual gate.
- Verified repo baseline:
  `origin/main` at
  `a015ed1e3079030b61ba073129c0b47bbd0a90e7` before this task branch.
- Branch:
  `feature/auth-session-visibility-revocation-audit-20260708-1529`.
- Completed slice:
  - `IAuthSessionRuntimeService.RevokeSessionAsync` now revokes linked active
    refresh session families and active refresh credentials when the revoked
    access session belongs to a refresh lineage.
  - Refresh-family revocation now also marks other active linked access
    sessions in the same affected family revoked, while preserving the existing
    exclusion behavior used by password-change flows to keep the current
    bearer session active.
  - Existing endpoint authorization and public response behavior is unchanged:
    current-account session list remains caller-owned and bounded; per-session
    revocation still filters by current auth account and maps missing,
    cross-account, already-revoked, or inactive targets to the same safe
    unavailable response; current-session sign-out and sign-out-all still
    return no token-bearing body.
  - Added focused service proof that per-session revocation invalidates linked
    refresh family state, active refresh credentials, and sibling access
    sessions without exposing raw access tokens, token hashes, or refresh hashes
    in audit metadata.
- Password change/reset posture:
  - Password change behavior was inspected and left unchanged: it keeps the
    current bearer session active and revokes other active sessions plus linked
    refresh material.
  - Password reset behavior was inspected and left unchanged: successful reset
    revokes active sessions and refresh families according to current policy.
- Notification/security-center posture:
  auth/session/security notifications and credential activity/security-center
  surfaces remain audit-only/future-gated under #369/#774. No notification
  writer/runtime, target schema, UI, or provider delivery behavior was added.
- Validation evidence recorded in the task report:
  focused auth/session/password-change/password-reset tests passed with
  `102` tests, `0` failed, `0` skipped. Broader validation is recorded in the
  associated Codex report for the branch.
- Issue posture:
  keep #336, #338, and #777 open. #337 and #339 were read for context and not
  touched. #369/#774 remain the future gates for notification/security-center
  product surfaces.
- Scope confirmation:
  this checkpoint changes only API auth session runtime and focused API tests,
  plus this ledger entry. It does not change OpenAPI/contracts, generated
  clients, schema/migrations, mobile/user-web/admin UI, notification runtime,
  password-reset request/complete route behavior, email/reset material/link
  behavior, invite/registration/OIDC onboarding, MFA/passkey runtime,
  production/public exposure, Docker/CI/deployment, appsettings/env/secrets,
  storage, sync, import/export, backup/restore, OCR, money, settlement,
  payment, bill calculation, issue closure, or branch cleanup.

### Issues #336/#339 - Password reset future gates issue split after PR #771

- GitHub state/project status:
  - #336 `OPEN`; broad E1 auth/session/runtime security epic remains open.
  - #339 `OPEN`; not closed in this task.
- Verified repo baseline:
  `origin/main` at
  `833b480e69760163b83de4b6c4531a521374417c`, the PR #771 merge commit.
- PR #771 merge evidence:
  PR #771 is `MERGED` into `main`; merge commit
  `833b480e69760163b83de4b6c4531a521374417c`; changed files were limited to
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`. PR #771 recorded the final Day 1
  local-account password-reset auth/security acceptance checkpoint.
- Current approved-surface posture:
  the local-account password reset Day 1 surface has no remaining
  approved-surface gates after PR #771. #339 remains open only because it is
  broad/planning-shaped and should not be closed until future optional or
  broader auth/credential surfaces are safely represented elsewhere.
- Duplicate-search readback before creating issues:
  searched open and closed issues for
  `mobile deep link universal app link custom scheme password reset`,
  `provider owned OIDC OAuth SSO password reset helper`,
  `security center credential activity password reset credential change`,
  `admin recovery admin reset change password users owner`,
  `MFA passkey OIDC auth factor local account`,
  `production security review auth public exposure release readiness`, and
  `password reset notification security session event`. No narrow equivalent
  child issues were found for the six newly created future-surface gates.
  Existing broad/adjacent coverage was reused where appropriate.
- Future optional/broader coverage matrix:

  | Surface | Issue | Status | Day 1 blocker? |
  | --- | --- | --- | --- |
  | Broad auth/session/runtime security umbrella | #336 | Existing open epic | Yes for broader E1; not a remaining local password-reset gate |
  | Invitation/public registration/admin-created user/local account/OIDC-Keycloak policy gates | #337 | Existing open child | Separate Day 1 auth policy gate |
  | Current-account session visibility, revocation, new-device/security audit expectations | #338 | Existing open child | Separate Day 1 auth/session gate |
  | Current approved local-account password reset and credential-change workflow | #339 | Existing open planning issue; current approved local reset surface final-accepted by PR #771 | No remaining approved-surface gate after PR #771 |
  | Password-reset mobile universal links, Android app links, iOS associated domains, custom schemes, manual reset-material/code entry, and platform handoff policy | #772 | New open child | Future optional; not a Day 1 blocker unless later approved |
  | Provider-owned/OIDC/OAuth/SSO password-reset helper posture | #773 | New open child | Future optional; not a current Day 1 blocker |
  | Credential activity and security-center surfaces for auth events | #774 | New open child | Future optional unless product-facing security center/credential activity is later approved |
  | Admin-assisted recovery and administrator credential-change boundaries | #775 | New open child | Future optional/manual-gated; not a current Day 1 blocker |
  | Passkey and MFA auth-factor gates and reset/change interactions | #776 | New open child | Future optional/manual-gated beyond current local password-reset surface |
  | Auth production/public-exposure security review gate | #777 | New open child | Future manual security/release gate; not a current local password-reset gate |
  | In-app notification event coverage, including important auth/session/security events | #369 | Existing open notification issue | Separate notification gate; not required for current local password-reset acceptance |
  | Notification deep-link routing | #371 | Existing closed notification-flow issue | Not a password-reset email link/app-link policy gate |
  | Push/email/provider/delivery-state notification runtime | #634 and related notification issue set | Existing open/related notification coverage | Separate notification delivery/provider work |

- GitHub issue hygiene completed:
  - Created child issues #772, #773, #774, #775, #776, and #777.
  - Commented on #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4911285794>.
  - Commented on #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4911285890>.
  - No issue was closed by this task.
- Metadata posture:
  issue labels were set only at creation time using existing repo labels.
  No milestones, assignees, Project fields, or post-creation label mutations
  were updated. Project/status metadata updates were skipped because the task
  did not require safe Project mutation and the issue bodies/comments now carry
  the split coverage.
- Issue posture:
  keep #336 open for broader auth/session/runtime security. Keep #339 open
  for now; it can later be closed only if maintainers confirm all future and
  broader password-reset/credential-change scope is represented by linked
  child issues and no open #339-specific gate remains.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API/backend
  behavior, OpenAPI/contracts, generated clients, mobile/user-web/admin UI,
  email template code/tests, SMTP/provider configuration, appsettings/env/
  secrets, schema/migrations, Docker, CI, deployment, Codemagic/TestFlight,
  notifications runtime, security-center runtime, credential-activity runtime,
  auth-audit runtime, money, settlement, payment, bill, OCR, storage, sync,
  import/export, backup/restore, reconciliation behavior, issue closure, or
  issue/project metadata beyond creating the child issues with existing labels
  and posting the required comments.

### Issues #336/#339 - Password reset A08 and final auth/security acceptance checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Verified acceptance base:
  `origin/main` at
  `21eb3efa0a35b57b5d50a8908e614d0425faa88f`.
- PR #770 merge evidence:
  PR #770 is `MERGED` into `main`; base `main`; head branch
  `docs/pr769-password-reset-a04-email-link-target-post-merge-20260708-0116`;
  reviewed head `858cad2952e5403b58e4fc904f8b9129340a1add`; merge commit
  `21eb3efa0a35b57b5d50a8908e614d0425faa88f`; changed files were limited to
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed Day 1 password-reset evidence:
  - PR #763 exposed only the approved public local password-reset request and
    completion routes, with anonymous/public mapping preserved for both.
  - PR #765 completed mobile A01-A03 request-only UI and repository wiring.
  - PR #767 completed user-web A05-A07 reset-complete fallback UI, fragment
    capture/scrub, generated-client completion call, success state, and
    generic invalid-link state.
  - PR #769 completed A04 reset email subject/body/link-target alignment.
  - PR #770 recorded post-merge ledger hygiene for A04.
- A08 decision:
  `not_applicable_current_surface`.
  Current repo search found no approved Day 1 provider-owned password-reset
  surface, no external identity-provider sign-in/reset runtime, no OAuth/SSO/
  social-login password ownership surface, and no reset-complete UI state that
  requires a provider-owned helper message. The current mobile request
  submitted state includes only the already-approved generic support line for
  externally managed accounts, and backend/OpenAPI policy continues to state
  Settleora reset applies only to local-account passwords. No A08 runtime, UI,
  OAuth/OIDC behavior, helper state, or account-provider logic is implemented
  or required by this checkpoint.
- Final acceptance matrix:
  - Request route remains public and uniform: `POST
    /api/v1/auth/password-reset/request` returns the public accepted response
    shape without exposing account existence, local-vs-provider state,
    delivery state, reset material, or `Retry-After`.
  - Completion route remains public and bounded: `POST
    /api/v1/auth/password-reset/complete` returns `204 No Content` on success
    and generic bounded failure responses for invalid, expired, consumed,
    replayed, malformed, unavailable, or weak-password outcomes, with no
    credential/session issuance.
  - Password policy alignment is verified across OpenAPI, backend, generated
    clients, and user-web validation; `newPassword` remains `minLength: 12`.
  - Email composer uses the approved A04 subject/body and preserves
    `/auth/password-reset#resetMaterial=...`, empty query, and no `token=`
    shape.
  - Email delivery readiness still depends on safe configured origin/provider
    readiness; no SMTP/provider/configuration change is included.
  - Reset material is not returned to clients except through the approved email
    delivery boundary, is stored only as lookup material server-side, and is
    covered by audit/redaction tests for reports, previews, audit text, and
    user-visible failures.
  - User-web reset-complete reads only the URL fragment, scrubs the visible
    fragment, calls generated `completeLocalPasswordReset` with only
    `resetMaterial` and `newPassword`, stores no session/token/current-user
    state, and maps server failures to generic invalid-link copy.
  - Mobile remains request-only: no deep links, universal links, custom
    schemes, reset-material entry, reset-complete UI, or token handling.
  - Notification/security-center/credential-activity remains deferred/
    audit-only for password reset. Future notification runtime still requires
    target/schema/OpenAPI/generated-client/authz/security-copy gates.
  - OpenAPI/generated-client drift is clean after generation.
  - Audit/security redaction tests cover password-reset sensitive material.
- Final validation evidence on
  `21eb3efa0a35b57b5d50a8908e614d0425faa88f` before opening this checkpoint:
  `git status --short` clean; `git diff --check` passed; `npm run
  validate:openapi` passed; `npm run generate:clients` passed; `git diff
  --name-only` and `git diff --stat` were empty; `npm run validate:clients`
  passed; `npm run validate:scaffold` passed; `/usr/bin/time -f
  'ELAPSED=%E EXIT=%x' npm run validate:api` passed with `1409` tests,
  `0` failed, `0` skipped, `ELAPSED=6:19.43 EXIT=0`; focused password-reset/
  route/composer/audit-redaction tests passed with `84` tests; user-web tests
  passed with `129` tests; user-web build passed; user-web lint passed;
  Flutter `pub get` passed; Flutter analyze passed with no issues; Flutter
  tests passed with `820` tests; `npm run validate:docs` passed.
- Missing optional reports:
  the exact optional filenames
  `.codex/reports/settleora-codex-report-20260707-2120-auth-password-reset-route-exposure*.md`
  and
  `.codex/reports/settleora-codex-report-20260707-2108*final-auth-security-acceptance*.md`
  were not found, but equivalent current evidence exists in the ledger, PR
  readbacks, and reports
  `.codex/reports/settleora-codex-report-20260707-2120-password-reset-route-exposure-implementation.md`,
  `.codex/reports/settleora-codex-report-20260707-2146-pr763-password-reset-route-exposure-merge-gate.md`,
  `.codex/reports/settleora-codex-report-20260707-2201-pr763-password-reset-route-exposure-post-merge-hygiene.md`,
  `.codex/reports/settleora-codex-report-20260707-2034-password-reset-final-auth-security-acceptance.md`,
  and
  `.codex/reports/settleora-codex-report-20260707-2108-password-reset-final-auth-security-acceptance-rerun.md`.
- Issue posture:
  keep #336 open because the broad auth/session/runtime security epic still
  includes non-password-reset auth/security work and manual Day 1 acceptance
  concerns. #339 is close-ready after this final acceptance checkpoint PR
  merges, assuming the issue scope is the current Day 1 local password reset
  and credential-change workflow; do not close it from this task.
- Remaining password-reset Day 1 gates:
  none for the currently approved local-account password-reset surface after
  this checkpoint merges. Future optional surfaces remain separately gated:
  provider-owned/OIDC helper UI if a real approved provider-owned surface is
  added, mobile link handling if later chosen, password-reset notifications or
  security-center/credential-activity if later approved, admin-delivered
  recovery, owner/admin reset/change for other users, invitation/public
  registration, MFA/passkey/OIDC runtime, and broader production/security
  review.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API/backend
  behavior, route mappings, OpenAPI/contracts, generated clients, email
  templates, SMTP/provider configuration, appsettings/env/secrets,
  schema/migrations, Docker, CI, deployment, Codemagic/TestFlight, mobile UI,
  user-web UI, admin UI, notifications, security-center, credential-activity,
  auth-audit re-fetch surfaces, money, settlement, payment, bill, OCR,
  storage, sync, import/export, backup/restore, reconciliation behavior, issue
  closure, labels, milestones, assignees, or Project fields.

### Issues #336/#339 - PR #769 password reset A04 email/link target post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/769>.
- PR title:
  `fix(auth): align password reset email link copy`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/password-reset-a04-email-link-target-alignment-20260708-0046`.
- Reviewed source head:
  `79dbc1320c7e90c694a41e14a5932c4763b69025`.
- Merge SHA:
  `1450a0bdd30e664e5f4a5e9409681170dc86d0e7`.
- Previous main/base:
  `5358a5a517cc1d1f436a1e3afed1738948c0c7fb`.
- Issue comments:
  - #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4906428286>.
  - #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4906431027>.
- Post-merge verification:
  `origin/main` is merge commit
  `1450a0bdd30e664e5f4a5e9409681170dc86d0e7`; PR #769 readback is
  `MERGED`, base `main`, source branch
  `feature/password-reset-a04-email-link-target-alignment-20260708-0046`,
  reviewed head `79dbc1320c7e90c694a41e14a5932c4763b69025`, and merge commit
  `1450a0bdd30e664e5f4a5e9409681170dc86d0e7`. The restored source branch
  readback points to `79dbc1320c7e90c694a41e14a5932c4763b69025`.
- Merged diff scope:
  first-parent merge diff was limited to
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`,
  `services/api/src/Settleora.Api/Auth/PasswordReset/IPasswordResetEmailTemplateComposer.cs`,
  and
  `services/api/tests/Settleora.Api.Tests/PasswordResetEmailTemplateComposerTests.cs`.
- Completed A04 slice:
  backend reset email subject is aligned to
  `Reset your Settleora password`; the send-ready text body uses the approved
  generic A04 copy; and the reset-link target remains
  `/auth/password-reset#resetMaterial=...`.
- Link/privacy checkpoint:
  reset material remains carried only in the URL fragment as `resetMaterial`,
  not in query parameters. The generated reset link has an empty query, and no
  `token=` link shape was introduced. Redacted template readbacks remain
  bounded and exclude reset material, token-style URL content, submitted
  identifiers, account email/usernames, SMTP credentials, configured origins,
  and provider payloads.
- Validation checkpoint at reviewed source head:
  full API validation passed with `1409` tests, `0` failed, `0` skipped;
  focused password-reset route/composer tests passed with `84` tests and `30`
  email-composer tests; OpenAPI validation passed; client generation produced
  no tracked generated-client drift; generated-client validation passed;
  scaffold validation passed; docs validation passed; and exact-head GitHub
  checks passed before merge.
- Non-goals preserved:
  no public API route behavior outside the password-reset email composer,
  OpenAPI/contracts, generated clients, schema/migrations, SMTP/provider
  configuration, appsettings/env/secrets, notification runtime/targets,
  security-center/credential-activity/auth-audit re-fetch surfaces, mobile UI,
  user-web UI, Docker/CI/deployment/Codemagic/TestFlight behavior, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees, or
  Project field changes were made.
- Remaining gates:
  A08 provider-owned/helper state only if an approved surface needs it, final
  broader auth/security acceptance, and notification/security-center/
  credential-activity gates only if those surfaces are added later.
- Issue posture:
  keep #336 open. PR #769 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #769 completes only the A04 email/link target alignment slice and does not
  complete the full Day 1 password reset and credential-change workflow.

### Issues #336/#339 - PR #767 user-web password reset complete UI post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/767>.
- PR title:
  `feat(web): add password reset complete flow`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/user-web-password-reset-complete-ui-20260707-2337`.
- Reviewed source head:
  `f3b13029dde6d73883dad48dc8660c70a0e31576`.
- Merge SHA:
  `cf90e10c954df23ba5e7b228839adddc79d0f490`.
- Previous main/base:
  `a96289a8faf411702e6f04868b34a3ec9c5da1ce`.
- Issue comments:
  - #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4905954069>.
  - #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4905955867>.
- Post-merge verification:
  `origin/main` is merge commit
  `cf90e10c954df23ba5e7b228839adddc79d0f490`; PR #767 readback is
  `MERGED`, base `main`, source branch
  `feature/user-web-password-reset-complete-ui-20260707-2337`, reviewed head
  `f3b13029dde6d73883dad48dc8660c70a0e31576`, and merge commit
  `cf90e10c954df23ba5e7b228839adddc79d0f490`. The restored source branch
  readback points to `f3b13029dde6d73883dad48dc8660c70a0e31576`.
- Merged diff scope:
  first-parent merge diff was limited to
  `apps/web-user/src/App.tsx`,
  `apps/web-user/src/PasswordResetCompletePage.test.tsx`,
  `apps/web-user/src/PasswordResetCompletePage.tsx`,
  `apps/web-user/src/passwordResetComplete.test.ts`,
  `apps/web-user/src/passwordResetComplete.ts`,
  `apps/web-user/src/styles.css`, and
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed implementation slice:
  user-web public unauthenticated fallback for the backend reset-link path
  `/auth/password-reset#resetMaterial=...`, covering A05-A07:
  - A05 reset-complete form with approved title, body, field labels, primary
    action, secondary action, and local password/confirmation validation copy.
  - A06 `Password updated` success state after generated-client completion
    succeeds.
  - A07 generic `Reset link unavailable` state for missing, empty, malformed,
    invalid, expired, consumed, replayed, revoked, unknown, unavailable, or
    otherwise failed reset material outcomes.
  - reset material is read from `#resetMaterial=...` in the URL fragment.
  - the fragment is scrubbed from the visible URL after capture.
  - the generated web `completeLocalPasswordReset` transport is called with
    only `resetMaterial` and `newPassword`.
  - new-password client validation uses minimum length `12`, matching the
    current OpenAPI `newPassword` contract.
- Reset material/privacy checkpoint:
  reset material is parsed only from `window.location.hash`, kept only in
  runtime component memory, scrubbed from the visible URL with history
  replacement after capture, passed to generated web only in the completion
  body with `newPassword`, and not rendered, logged, persisted, stored in
  browser storage/cookies, or included in error text.
- Validation checkpoint at reviewed source head:
  `git status --short`, `git diff --check`,
  `npm run test --prefix apps/web-user`,
  `npm run build --prefix apps/web-user`,
  `npm run validate:openapi`, `npm run generate:clients`,
  `git diff --name-only`, `git diff --stat`,
  `npm run validate:clients`, `npm run validate:scaffold`,
  `npm run validate:docs`, and the additional
  `npm run lint --prefix apps/web-user` command passed. Client generation
  produced no tracked generated-client drift.
- Non-goals preserved:
  no general user-web sign-in; no email-template copy changes; no SMTP/provider
  config; no OpenAPI/generated-client changes; no API/backend behavior changes;
  no access tokens, refresh tokens, sessions, current-user state, credential
  storage, cookies, localStorage/sessionStorage persistence, or automatic
  sign-in; no mobile reset-complete UI, universal links, Android app links,
  custom URL schemes, app-link association files, iOS entitlements, Android
  manifest changes, or manual reset-material/code entry; no notification/
  security-center/credential-activity/auth-audit re-fetch surfaces; no schema/
  migrations/deployment/Docker/CI/secrets/money/storage/OCR/sync/import/
  export/backup/restore/reconciliation behavior; and no issue closure, labels,
  milestones, assignees, or Project field mutations.
- Remaining gates:
  A04 email/link target end-to-end confirmation; A08 provider-owned/helper
  state only if an approved surface needs it; final broader auth/security
  acceptance; notification/security-center/credential-activity gates only if
  those surfaces are added later; and future mobile link handling only if later
  chosen and separately gated.
- Issue posture:
  keep #336 open. PR #767 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #767 completes only the user-web A05-A07 fallback slice and does not
  complete the full Day 1 password reset and credential-change workflow.

### Issues #336/#339 - PR #765 mobile password reset request UI post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/765>.
- PR title:
  `feat(mobile): add password reset request flow`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/mobile-password-reset-request-ui-20260707-2240`.
- Reviewed source head:
  `13a40e2d23076d8d02928912dfac48114e07071d`.
- Merge SHA:
  `a0f7c47e2382940363b7e46238d0c3cd77d2e2ef`.
- Previous main/base:
  `861d8f9778fb6112f76561879ec827e152de1666`.
- Issue comments:
  - #336:
    <https://github.com/tommytang213/Settleora/issues/336#issuecomment-4905287107>.
  - #339:
    <https://github.com/tommytang213/Settleora/issues/339#issuecomment-4905287063>.
- Post-merge verification:
  `origin/main` contains merge commit
  `a0f7c47e2382940363b7e46238d0c3cd77d2e2ef`; PR #765 readback is
  `MERGED`, base `main`, source branch
  `feature/mobile-password-reset-request-ui-20260707-2240`, reviewed head
  `13a40e2d23076d8d02928912dfac48114e07071d`, and merge commit
  `a0f7c47e2382940363b7e46238d0c3cd77d2e2ef`. The restored source branch
  readback points to `13a40e2d23076d8d02928912dfac48114e07071d`.
- Merged diff scope:
  first-parent merge diff was limited to
  `apps/mobile/lib/app/app_bootstrap.dart`,
  `apps/mobile/lib/app/password_reset_repository.dart`,
  `apps/mobile/lib/app/sign_in_screen.dart`,
  `apps/mobile/lib/main.dart`,
  `apps/mobile/test/password_reset_repository_test.dart`,
  `apps/mobile/test/ui/shell_home_more_profile_parity_visual_capture_test.dart`,
  `apps/mobile/test/widget_test.dart`, and
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed implementation slice:
  mobile A01-A03 request-only password reset UI/runtime behavior is
  implemented in PR #765:
  - A01 sign-in `Forgot password?` secondary action.
  - A02 reset request form using approved copy.
  - A03 anti-enumeration-safe submitted state using approved copy.
  - dedicated mobile password-reset repository seam around the generated Dart
    `requestLocalPasswordReset` transport method, sending only
    `resetIdentifier`.
  - `SettleoraAppBootstrap` wiring from the saved server base URL through the
    generated API client factory pattern.
- Safety checkpoint:
  request-submitted UI remains uniform and does not reveal account existence,
  local-vs-provider account state, SMTP/provider readiness, delivery attempt
  state, provider failure, throttling state, token issuance, token state,
  endpoint paths, internal policy details, or generated-client details. Empty
  identifier validation is local. Network/server failure copy is limited to
  `We could not process this request right now. Try again later.`
- Visual/test checkpoint:
  the existing sign-in visual capture harness was updated to include the
  forgotten-password action. Focused widget/repository coverage was added.
  No brittle new screenshot harness was added.
- Non-goals preserved:
  no A04-A08 reset-complete/email-link target implementation; no reset
  material field or manual code entry; no invalid-link route/state; no
  provider-owned helper state; no deep link, universal link, custom URL
  scheme, app-link, or web handoff; no user-web/admin UI; no notification,
  security-center, or credential-activity behavior; and no OpenAPI,
  generated-client, API, backend, schema, config, or deployment changes.
- Remaining gates:
  A04 reset email/link-target handling, A05-A08 reset-complete/success/
  invalid-link/provider-owned states, reset-complete link target decision,
  broader auth/security acceptance, and notification/security-center/
  credential-activity gates only if those surfaces are added later.
- Issue posture:
  keep #336 open. PR #765 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #765 implements only the mobile request UI slice and does not complete the
  full Day 1 password reset and credential-change workflow.
- Scope confirmation:
  PR #765 does not implement reset-complete UI, reset material entry, invalid
  link routing, deep links, user-web/admin UI, notification runtime,
  security-center, credential-activity, auth-audit re-fetch, OpenAPI/contracts,
  generated-client edits, API route mapping, backend auth runtime behavior,
  password reset policy, SMTP/provider config, appsettings/env/secrets,
  schema/migrations, Docker, CI, deployment, Codemagic/TestFlight behavior,
  money/settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees, or
  Project field mutations.

### Issues #336/#339 - PR #763 password reset route exposure post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/763>.
- PR title:
  `feat(auth): expose local password reset routes`.
- PR state:
  `MERGED`.
- PR branch:
  `feature/auth-password-reset-route-exposure-20260707-2120`.
- Reviewed source head:
  `062c0ca435ade928b9c5d4f20dbb0ea91bb8899b`.
- Merge SHA:
  `c2907f71447ffd90898a3952adfe9c60581dfad1`.
- Previous main/base:
  `e1bf888e6e83503b2424d5237a409251a41f2720`.
- Post-merge verification:
  `origin/main` contains merge commit
  `c2907f71447ffd90898a3952adfe9c60581dfad1`; first-parent merged diff was
  limited to `docs/planning/ISSUE_PROGRESS_LEDGER.md`,
  `services/api/src/Settleora.Api/Auth/PasswordReset/LocalPasswordResetEndpoints.cs`,
  `services/api/src/Settleora.Api/Program.cs`,
  `services/api/tests/Settleora.Api.Tests/AuthenticatedApiPolicyBaselineTests.cs`,
  and
  `services/api/tests/Settleora.Api.Tests/LocalPasswordResetServiceTests.cs`.
- Source branch restoration/readback:
  source branch
  `feature/auth-password-reset-route-exposure-20260707-2120` exists remotely at
  reviewed head `062c0ca435ade928b9c5d4f20dbb0ea91bb8899b`.
- Issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4904625903
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4904628178
- Completed merged checkpoint:
  PR #763 exposed only the two approved public local password-reset runtime
  routes:
  - `POST /api/v1/auth/password-reset/request`
  - `POST /api/v1/auth/password-reset/complete`
- Route behavior checkpoint:
  the request route remains anonymous and anti-enumeration safe, returning
  uniform `202 Accepted` with no body and no `Retry-After`. The completion
  route remains anonymous, returns `204 No Content` for valid reset material,
  returns generic bounded problem responses for invalid/unavailable material,
  and does not issue access tokens, refresh credentials, sessions, or sign the
  user in.
- Scope confirmation:
  PR #763 did not change OpenAPI/contracts, generated clients, schema/
  migrations, password-reset token policy, notification writer/runtime,
  notification targets, security-center, credential-activity, SMTP/provider
  configuration, secrets/config/env, mobile/web/admin UI, product copy outside
  the ledger checkpoint, deployment/Docker/CI/Codemagic/TestFlight behavior,
  money/settlement/payment/bill/OCR/storage/sync/import/export/backup/
  restore/reconciliation behavior, issue closure, labels, milestones,
  assignees, or Project fields.
- Remaining gates:
  broader Day 1 password-reset UI/runtime acceptance. Notification,
  security-center, and credential-activity gates remain required only if those
  surfaces or password-reset notifications are added later.
- Issue posture:
  keep #336 open. PR #763 does not complete the broader auth/session/runtime
  security epic or final Day 1 auth/security acceptance. Keep #339 open.
  PR #763 exposes only the approved public password-reset routes and does not
  complete the full Day 1 password reset and credential-change workflow.

### Issues #336/#339 - Password reset UI/product-copy approval package

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Current `origin/main` at package start:
  `ec650a83d6005a919ba9102102746c0a30814930`.
- PR #761 readback:
  PR #761 is `MERGED` into `main` at merge commit
  `ec650a83d6005a919ba9102102746c0a30814930`.
- Package doc:
  `docs/design/mobile/MOBILE_AUTH_PASSWORD_RESET_APPROVAL_PACKAGE_V1.md`.
- Package status:
  `READY_FOR_MANUAL_PRODUCT_REVIEW`.
- Package outcome:
  the repo now has an implementation-ready review package for the Day 1
  local-account password reset experience. It defines the required mobile
  forgotten-password entry point, reset request form, anti-enumeration-safe
  submitted state, reset email subject/preview/body, reset-complete form,
  successful reset state, generic invalid-link family, unsupported/provider-
  owned password copy, visual requirements, conditional web/admin/security-
  center coverage, and manual acceptance checklist.
- Figma/reference evidence:
  existing mobile auth-security, mobile design, user-web, and admin-web
  references remain useful source references. No password-reset-specific Figma
  frames or exported assets were found in the repo. This package is a textual
  product/design review artifact; it is not final approval by itself.
- Route-exposure posture:
  public route exposure remains blocked for
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete`.
- Remaining blockers:
  human product/design approval of the package or a replacement Figma/reference
  package, manual OpenAPI/generated-client gate for changed public runtime
  posture and any target/security-center contract, final public route exposure
  review, and final auth/security acceptance.
- Issue posture:
  keep #336 open. This package does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. This package does not expose public reset routes, implement UI,
  implement notification runtime, or complete the Day 1 password reset and
  credential-change workflow.
- Scope confirmation:
  this checkpoint is docs/design/planning only. It does not change runtime/API
  endpoint behavior, public route mapping, OpenAPI/contracts, generated
  clients, schema/migrations, notification writer/runtime, SMTP/provider
  config, secrets, UI/Figma/mobile/web/admin implementation, deployment/
  Docker/CI/Codemagic/TestFlight behavior, auth/session/security runtime,
  money/settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees,
  Project fields, or `.codex/reports/**` committed files.

### Issues #336/#339 - PR #760 UI/product-copy gate post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/760>.
- PR title:
  `docs(auth): add password reset UI product copy gate`.
- Reviewed source head:
  branch `docs/auth-password-reset-ui-product-copy-gate-20260707-1827` at
  `c53e7d5e2b925b680746148b70fc3bab16aed55e`.
- Merge SHA:
  `20665379246e52f8caec367f729c44d5cde4152f`.
- Merged at:
  `2026-07-07T10:49:05Z`.
- Final `origin/main` at post-merge verification:
  `20665379246e52f8caec367f729c44d5cde4152f`.
- Merged scope:
  `docs/planning/AUTH_PASSWORD_RESET_UI_PRODUCT_COPY_GATE.md` and
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Merge/readback evidence:
  PR #760 is `MERGED` into `main`; merge commit
  `20665379246e52f8caec367f729c44d5cde4152f` is an ancestor of
  `origin/main`; the merge commit first-parent diff contains only the merged
  scope above; no `.codex/reports/**` files were merged.
- Source branch restoration/readback:
  source branch
  `docs/auth-password-reset-ui-product-copy-gate-20260707-1827` exists
  remotely at reviewed head
  `c53e7d5e2b925b680746148b70fc3bab16aed55e`.
- Existing PR #760 issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4902966824
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4902966799
- Decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Public route posture:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` remain blocked and
  unregistered.
- UI/product-copy gate outcome:
  current repo/reference evidence is insufficient to unblock public
  password-reset route exposure.
- Required public reset surfaces still missing:
  mobile forgotten-password entry point, mobile reset-request submitted state,
  mobile reset-complete form/state, reset email subject/body/preview copy,
  generic expired/consumed/replayed/malformed/unknown/invalid-link states,
  unsupported/OIDC/provider-password states, and safe success copy.
- Conditional surfaces:
  user-web reset screens are required only if user web participates in Day 1
  public auth; admin readout is required only if Day 1 admin scope uses it;
  security-center or credential-activity copy is required only if those
  surfaces or password-reset notifications are used.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only. If a future route-
  exposure design emits password-reset notifications, target/schema/OpenAPI/
  generated-client work plus an authorized current-account security-center,
  credential-activity, or auth-audit re-fetch path must happen first.
- Remaining blockers:
  password-reset UI/Figma/reference/product approval, manual OpenAPI/
  generated-client gate for changed public runtime posture or any
  target/security-center contract, final public route exposure review, and
  final auth/security acceptance.
- Issue posture:
  keep #336 open. PR #760 does not complete the broader auth/session/runtime
  security epic or final auth/security acceptance. Keep #339 open. PR #760
  does not expose public reset routes, complete user-visible reset UX/product
  copy, implement notification runtime, or complete the Day 1 password reset
  and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, public route mapping, OpenAPI/contracts, generated clients,
  schema/migrations, notification writer/runtime, SMTP/provider config,
  secrets, UI/Figma/mobile/web/admin implementation, deployment/Docker/CI/
  Codemagic/TestFlight behavior, auth/session/security runtime, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees,
  Project fields, or `.codex/reports/**` committed files.

### Issues #336/#339 - Password reset UI/product-copy gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Current `origin/main` at gate start:
  `6ce7de222843433a65e0ed923ad7431311363b27`.
- Prior checkpoint posture:
  PR #759 is already merged and is the post-merge ledger checkpoint for
  PR #758. No recursive PR #759 checkpoint is needed.
- Gate doc:
  `docs/planning/AUTH_PASSWORD_RESET_UI_PRODUCT_COPY_GATE.md`.
- Decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Design/reference readback:
  current repo evidence includes approved general mobile auth-security Figma/
  asset references, mobile design reference assets, user-web textual reference,
  and admin-web textual reference. It does not include password-reset-specific
  mobile/web/admin Figma frames, reset-request submitted states,
  reset-complete states, reset email subject/body/preview approval, generic
  invalid/expired/reused/malformed link states, unsupported/OIDC/provider
  states, or security-center/credential-activity copy approval.
- Required public reset surfaces before route mapping:
  mobile forgotten-password entry point, mobile reset request submitted state,
  mobile reset-complete form/state, reset email subject/body/preview copy,
  generic expired/consumed/replayed/malformed/unknown/invalid-link states,
  unsupported/OIDC/provider-password states, and success copy that tells the
  user they can sign in with the new password and that other sessions may have
  been ended for security.
- Conditional surfaces:
  user-web reset entry/completion screens are required if user web
  participates in Day 1 public auth; admin readout/copy is required only if
  current Day 1 admin scope uses it; security-center or credential-activity
  copy is required only if those surfaces or password-reset notifications are
  used.
- Copy requirements:
  request-submit copy must remain anti-enumeration safe; email copy must be
  generic/redacted and include the reset link only in the approved delivery
  boundary; reset-complete and invalid-link copy must not reveal token validity
  or account state; OIDC/provider-password copy must not imply Settleora can
  reset external provider passwords; button labels must be action-specific.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only. If a future
  route-exposure design emits password-reset notifications, target/schema/
  OpenAPI/generated-client work plus an authorized current-account security-
  center, credential-activity, or auth-audit re-fetch route must happen first.
- Remaining blockers:
  approved UI/Figma/reference/product-copy coverage, manual OpenAPI/generated-
  client gate for changed public runtime posture or any target/security-center
  contract, final public route exposure review, and final auth/security
  acceptance.
- Issue posture:
  keep #336 open. This gate does not complete the broader auth/session/runtime
  security epic or final auth/security acceptance. Keep #339 open. This gate
  does not expose public reset routes, complete user-visible reset UX/product
  copy, implement notification runtime, or complete the Day 1 password reset
  and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, public route mapping, OpenAPI/contracts, generated clients,
  schema/migrations, notification writer/runtime, SMTP/provider config,
  secrets, UI/Figma/mobile/web/admin implementation, deployment/Docker/CI/
  Codemagic/TestFlight behavior, auth/session/security runtime, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, labels, milestones, assignees,
  Project fields, or `.codex/reports/**` committed files.

### Issues #336/#339 - PR #758 route exposure preflight post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/758>.
- PR title:
  `docs(auth): add password reset route exposure preflight`.
- Reviewed source head:
  `5fd12c532bf4fbda4d59df95475d8d0e907ff3a4`.
- Merge SHA:
  `3d9bc3c6b4f659de6149b417b47626bad1ff809c`.
- Merged at:
  `2026-07-07T09:13:23Z`.
- Final `origin/main` at post-merge verification:
  `3d9bc3c6b4f659de6149b417b47626bad1ff809c`.
- Merged scope:
  `docs/planning/AUTH_PASSWORD_RESET_PUBLIC_ROUTE_EXPOSURE_PREFLIGHT.md`
  and `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Merge/readback evidence:
  PR #758 is `MERGED` into `main`; merge commit
  `3d9bc3c6b4f659de6149b417b47626bad1ff809c` is an ancestor of
  `origin/main`; the merge commit first-parent diff contains only the merged
  scope above; no `.codex/reports/**` files were merged.
- Source branch restoration/readback:
  source branch
  `docs/auth-password-reset-public-route-exposure-preflight-20260707-1529`
  exists remotely at reviewed head
  `5fd12c532bf4fbda4d59df95475d8d0e907ff3a4`.
- Existing post-merge issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4902161582
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4902165409
- Route exposure decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Public route posture:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` remain blocked and
  unregistered.
- Internal-only gates satisfied per PR #758:
  SMTP/email delivery readiness and reset-link/template composition;
  reset-specific request/provider-send throttles; uniform public
  request-response policy; audit/redaction acceptance; local-only/OIDC
  exclusion; token lifetime/replay handling; and account-wide session/
  refresh-family revocation.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only. If a future route
  exposure design emits a password-reset notification, target/schema/OpenAPI/
  generated-client work plus an authorized current-account security-center,
  credential-activity, or auth-audit re-fetch route must happen first.
- Remaining blockers before public route exposure:
  UI/Figma/mobile/web/admin/product-copy gate, manual OpenAPI/generated-client
  gate for changed public runtime posture or any target/security-center
  contract, final public route exposure review, and final auth/security
  acceptance.
- Issue posture:
  keep #336 open. PR #758 does not complete the broader auth/session/runtime
  security epic or final auth/security acceptance. Keep #339 open. PR #758
  does not expose public reset routes, complete user-visible reset UX/product
  copy, implement notification runtime, or complete the Day 1 password reset
  and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - Password reset public route exposure preflight

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Live PR #757 verification:
  <https://github.com/tommytang213/Settleora/pull/757> is `MERGED` into
  `main`, with merge commit
  `bd049c2afffdebb8a7ff9233df105cb7fba644ab`.
- Current `origin/main` at preflight:
  `bd049c2afffdebb8a7ff9233df105cb7fba644ab`.
- Preflight doc:
  `docs/planning/AUTH_PASSWORD_RESET_PUBLIC_ROUTE_EXPOSURE_PREFLIGHT.md`.
- Route exposure decision:
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- Current satisfied internal-only gates:
  SMTP/email delivery readiness and reset-link/template composition from
  PR #746, reset-specific request/provider-send throttles from PR #748,
  uniform public request-response policy from PR #750, audit/redaction
  acceptance from PR #752, local-only/OIDC exclusion, token lifetime/replay
  handling, and account-wide session/refresh-family revocation after successful
  internal reset completion.
- Notification posture:
  password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only, per PR #756. If a
  future route-exposure design emits a password-reset notification, target/
  schema/OpenAPI/generated-client work plus an authorized current-account
  security-center, credential-activity, or auth-audit re-fetch path must happen
  first.
- Remaining blockers before public route mapping:
  UI/Figma/mobile/web/admin/product-copy gate, manual OpenAPI/generated-client
  gate for changing the public route runtime posture or any target/security-
  center contract, final public route exposure review, and final
  auth/security acceptance.
- Current runtime posture:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` remain unregistered/disabled.
  Existing route exposure tests assert both paths are absent from runtime
  endpoint data sources and return `404 Not Found`.
- Issue posture:
  keep #336 open. This preflight does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. This preflight does not expose public reset routes, complete
  user-visible reset UX/product copy, implement notification runtime, or
  complete the Day 1 password reset and credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - PR #756 password reset notification target-reference post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/756>.
- PR title:
  `docs(auth): add password reset notification target gate`.
- Reviewed source head:
  `ac7bde43a425c594bb6f1a7ccbc22ecca9100e33`.
- Merge SHA:
  `63c04d495aa8037142090afcb5cc900fde57710f`.
- Merged at:
  `2026-07-07T06:31:37Z`.
- Final `origin/main` at post-merge verification:
  `63c04d495aa8037142090afcb5cc900fde57710f`.
- PR #756 baseline:
  `origin/main` at `86c29bd2eab7008f6304f556383536e7bf072fc5`, the PR #755
  merge commit.
- Merged scope:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_TARGET_REFERENCE_SCHEMA_OPENAPI_GATE.md`
  and `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Merge/readback evidence:
  PR #756 is `MERGED` into `main`; merge commit
  `63c04d495aa8037142090afcb5cc900fde57710f` is an ancestor of
  `origin/main`; the merge commit first-parent diff contains only the merged
  scope above; no `.codex/reports/**` files were merged.
- Source branch restoration/readback:
  source branch
  `docs/auth-password-reset-notification-target-reference-gate-20260707-1411`
  exists remotely at reviewed head
  `ac7bde43a425c594bb6f1a7ccbc22ecca9100e33`.
- Post-restoration scaffold/check readback:
  pre-merge exact-head checks passed, including `Validate scaffold`.
  Post-restoration Scaffold Validation check/run on the restored PR #756
  source branch: run `28846488298`, job `85551530735`, completed successfully
  after the PR #757 checkpoint was opened. This was post-merge source-branch
  restoration activity; all pre-merge exact-head checks for PR #756 had already
  passed before merge.
- Existing post-merge issue comments:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4900855538
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4900857670
- Decision summary:
  password-reset notification runtime is not required for Day 1 public
  password-reset route exposure if notifications remain deferred/audit-only.
  If a future route-exposure or security-notification task chooses to emit a
  password-reset notification, first-class target/schema/OpenAPI/generated-
  client work and an authorized current-account security-center or auth-audit
  re-fetch route are required before runtime.
- Target/reference posture:
  prefer an explicit current-account security-center target, optionally paired
  with `authAuditEventId` after authorization/redaction design. Use
  `authAccountId` only where the affected account owner or separately approved
  admin/security recipient is authorized. Do not overload bill, settlement,
  recurring, sync, OCR, group, file, or receipt subject types; do not hide
  auth/security target IDs in `safeSummary`; do not treat raw `actionUrl`,
  generated-client availability, local cache, notification possession, push
  payload possession, or read/archive state as authorization.
- Recipient/redaction posture:
  affected account owner is the only default recipient. Admins/operators are
  not notified unless a later explicit admin/security policy approves it.
  Unrelated users, groups, friends, bill participants, settlement
  counterparties, OCR assignees, and local cache holders must never receive
  password-reset security notifications. Target IDs, audit IDs, account IDs,
  reset material, reset links, token hashes, session/refresh-family IDs,
  provider state, SMTP diagnostics, raw IP/user-agent, and account identifiers
  remain redacted from unauthorized surfaces.
- Required next gates:
  SMTP/email delivery/provider readiness, reset-specific abuse/provider-send
  throttles, UI/Figma/mobile/web/admin/product copy, OpenAPI/generated-client
  manual gate for any target/re-fetch contract, password-reset notification
  runtime gate if notifications are used, final public route exposure gate, and
  final auth/security acceptance.
- Issue posture:
  keep #336 open. This checkpoint does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. This checkpoint does not expose public reset routes, implement
  notification runtime, complete user-visible reset UX/product copy, or
  complete the Day 1 password reset/credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - Password reset notification gate PR #754 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  <https://github.com/tommytang213/Settleora/pull/754>.
- PR title:
  `docs(auth): add password reset notification event gate`.
- Merge SHA:
  `1d1bbc2b496047d3f3e27fe479c15260f6304fe9`.
- Reviewed source head:
  `d456e34c06975eef47afb45992e4c9a1d9dcda78`.
- Final `origin/main` at post-merge verification:
  `1d1bbc2b496047d3f3e27fe479c15260f6304fe9`.
- Merged scope:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_EVENT_TARGET_REDACTION_GATE.md`
  and `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
- Completed merged checkpoint:
  docs/control gate for password reset notification event, target/reference,
  recipient, suppression/copy, and redaction posture. Password-reset
  notification runtime remains blocked. Public password-reset request/complete
  routes remain blocked and unregistered.
- Validation/readback summary:
  local docs/scaffold/focused route exposure validation passed during the merge
  gate. GitHub exact-head checks passed for reviewed head
  `d456e34c06975eef47afb45992e4c9a1d9dcda78`. The actual merge commit
  first-parent diff contained exactly the merged scope above, and no
  `.codex/reports/**` files were merged.
- Post-merge hygiene:
  source branch
  `docs/auth-local-password-reset-notification-gate-20260707-1234` exists
  remotely at reviewed head `d456e34c06975eef47afb45992e4c9a1d9dcda78`.
  Issue comments were posted:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4900430331
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4900430332
- Remaining gates:
  target-reference schema/OpenAPI/generated-client gate if notifications are
  used, password-reset notification runtime gate if later approved,
  UI/Figma/mobile/web/admin/product copy gate, final public route exposure gate,
  and final auth/security acceptance.
- Issue posture:
  keep #336 open. PR #754 does not complete the broader
  auth/session/runtime security epic or final auth/security acceptance. Keep
  #339 open. PR #754 does not expose public reset routes, implement notification
  runtime, complete user-visible reset UX/product copy, or complete the Day 1
  password reset/credential-change workflow.
- Scope confirmation:
  this checkpoint is docs-only. It does not change runtime/API endpoint
  behavior, OpenAPI/contracts, generated clients, schema/migrations,
  notification writer/runtime, SMTP/provider config, secrets, UI/Figma/mobile/
  web/admin implementation, deployment/Docker/CI/Codemagic/TestFlight behavior,
  auth/session/security runtime, money/settlement/payment/bill/OCR/storage/
  sync/import/export/backup/restore/reconciliation behavior, issue closure,
  labels, milestones, assignees, Project fields, or `.codex/reports/**`
  committed files.

### Issues #336/#339 - Password reset notification event/target/redaction gate checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Baseline:
  `origin/main` at `25b7c272cc57d5928c9711a6f294e33b4ff38d9f`, the PR #753
  merge commit.
- PR #753 live verification:
  <https://github.com/tommytang213/Settleora/pull/753> is `MERGED` into
  `main`, with merge commit
  `25b7c272cc57d5928c9711a6f294e33b4ff38d9f` and reviewed source head
  `9eec0d20888df5ec9441d5a3139132a2e765caf1`.
- Completed docs/control checkpoint:
  added
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_NOTIFICATION_EVENT_TARGET_REDACTION_GATE.md`
  to record the Day 1 password-reset notification posture before any future
  public route exposure.
- Decision summary:
  password-reset notification runtime remains blocked. Request, material issue,
  delivery skipped/unavailable/failed/throttled, and reset denial outcomes are
  audit-only by default. Successful reset completion is a candidate future
  affected-account-owner security notification only after target/schema,
  notification runtime, UI/product-copy, route-exposure, and final
  auth/security gates pass. Replay/suspicious reuse requires a manual decision
  and remains audit-only by default. Reset-caused session/family revocation is
  blocked as a separate event until duplicate and target policy are approved.
- Target/reference posture:
  current notification schema/OpenAPI cannot safely represent auth/password
  reset targets. Any future runtime notification needs a first-class
  `authAuditEventId` plus `authAccountId`, an explicit targetless
  security-center model, or a separately approved session-family target. Targets
  must not be hidden in `safeSummary`, and raw `actionUrl` must not be treated
  as authorization.
- Recipient/copy/redaction posture:
  affected account owner is the only default recipient. Admins/owners are not
  notified by default, unrelated users/groups/friends/bill participants must
  never receive auth/security notifications, and ordinary mute/digest/quiet
  hours must not hide required security notifications unless a later security
  policy explicitly approves bounded suppression. External snippets must remain
  generic and must not reveal reset status, delivery state, token validity,
  replay classification, provider state, throttling, or session details.
- Public route exposure:
  still blocked. This checkpoint does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  target-reference schema/OpenAPI/generated-client gate if notifications are
  used, notification runtime gate if later approved, UI/Figma/mobile/web/admin/
  product copy gate, final public route exposure gate, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. No issue closure, labels, milestones, assignees, or
  Project fields were changed.
- Scope confirmation:
  this checkpoint does not change runtime/API endpoint behavior, OpenAPI/
  contracts, generated clients, schema/migrations, notification writer/runtime,
  SMTP/provider config, secrets, UI/Figma/mobile/web/admin implementation,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/
  bill/OCR/storage/sync/import/export/backup/restore/reconciliation behavior,
  or `.codex/reports/**` committed files.

### Issues #336/#339 - Password reset audit/redaction acceptance PR #752 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/752.
- PR title:
  `feat(api): add password reset audit redaction acceptance`.
- Merge SHA:
  `311710242b1935c58d3118998f237cc479e8c763`.
- Reviewed source head:
  `67c0d65001eab8470c57c0ef38718d261b5ad724`.
- Final `origin/main` at post-merge verification:
  `311710242b1935c58d3118998f237cc479e8c763`.
- Merged scope:
  `docs/planning/ISSUE_PROGRESS_LEDGER.md`,
  `services/api/src/Settleora.Api/Auth/PasswordReset/EfPasswordResetAuditWriter.cs`,
  and
  `services/api/tests/Settleora.Api.Tests/PasswordResetAuditRedactionAcceptanceTests.cs`.
- Completed merged checkpoint:
  bounded audit/redaction acceptance for the current internal local password
  reset runtime foundation. Password-reset audit writes no longer populate
  actor or subject auth account IDs, and acceptance coverage verifies bounded
  safe audit/readback metadata across request, material issue, replacement
  revocation, completion, session-revocation audit, replay-suspicious, and
  unknown-material denial outcomes.
- Public route exposure:
  still blocked. PR #752 does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the post-merge focused route
  exposure tests verified the runtime endpoint mappings remain absent and the
  paths are not reachable over HTTP.
- Validation/readback summary:
  live GitHub PR readback showed `MERGED` with merge commit
  `311710242b1935c58d3118998f237cc479e8c763`; git verified that merge commit
  exists and is an ancestor of `origin/main`. The actual merge commit
  first-parent diff contained exactly the three intended files above and no
  `.codex/reports/**` files. Focused post-merge validation passed:
  `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter "FullyQualifiedName~PasswordReset|FullyQualifiedName~LocalPasswordResetRouteExposureTests"`
  with `76` passed, `0` failed, `0` skipped.
- Post-merge hygiene:
  source branch
  `feature/auth-local-password-reset-audit-redaction-acceptance-20260707` was
  auto-deleted after merge and restored to the reviewed head
  `67c0d65001eab8470c57c0ef38718d261b5ad724` with a normal non-force push.
  Issue comments were posted:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4900027170
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4900027181
- Required next gates:
  notification event/target/redaction gate if used, UI/Figma/product copy,
  final public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. PR #752 does not complete the broader
  auth/session/runtime security epic, final auth/security acceptance, public
  reset route exposure, user-visible reset UX/product copy, or the Day 1
  password reset and credential-change workflow.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, labels, milestones,
  assignees, or Project fields.

### Issues #336/#339 - Password reset audit/redaction acceptance PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-audit-redaction-acceptance-20260707`.
- Baseline:
  `origin/main` at `6f37c3e03923e874dca0af367a2025e34c6b6ab1`,
  the PR #751 merge commit.
- Verification timestamp:
  `2026-07-07 11:30 HKT` task window.
- Completed branch checkpoint:
  bounded audit/redaction acceptance for the current internal local password
  reset runtime foundation. Password-reset audit writes are hardened so the
  password-reset audit workflow stores no actor/auth subject account ID and
  keeps readback metadata to `workflowName` plus bounded status categories.
  Focused acceptance coverage exercises request, material issue, replacement
  revocation, completion, session-revocation audit, replay-suspicious, and
  unknown-material denial outcomes.
- Redaction posture:
  password-reset audit/readback/logging-oriented surfaces are covered to exclude
  submitted identifiers, account email/username/display/profile/account IDs,
  recipient email, reset material, reset hashes, reset URL/token/query/fragment
  content, SMTP host/username/password, provider payloads/diagnostics/raw
  exception details, configured public origins, source bucket keys, raw error
  strings, stack traces, and recoverable correlation placeholders. Allowed
  readback remains bounded status/category/scope/reason/readiness/delivery
  labels only.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the runtime route exposure guard
  under `services/api/src` found no public password-reset mapping strings before
  implementation.
- Required next gates:
  notification event/target/redaction gate if used, UI/Figma/product copy,
  final public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, labels, milestones,
  assignees, or Project fields.

### Issues #336/#339 - Password reset public response policy PR #750 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/750.
- PR title:
  `feat(api): add password reset public response policy`.
- Merge SHA:
  `f46f0f4ffe5b73ac6ec77385778801e913aaa4c0`.
- Reviewed source head:
  `b09e9e908296bc4f55fabc165ef12ffb5f3bd63c`.
- Previous main/base:
  `a9d531ee0502269d0c3ff7992089e1470b238c95`.
- Completed merged checkpoint:
  internal password-reset public request-response policy mapping future request
  outcomes to the uniform public posture: `202 Accepted`, no response body, and
  no `Retry-After`. Covered outcomes include delivery disabled/not-ready,
  local/test sink recorded, provider send accepted, provider send failed,
  reset-specific request throttles, and provider-send throttles.
- Public route exposure:
  still blocked. PR #750 does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the OpenAPI paths remain
  transport contracts only, and the post-merge route exposure guard found no
  public password-reset runtime route mapping strings under `services/api/src`.
- Validation/readback summary:
  focused password-reset tests passed with `67` passed, `0` failed, `0`
  skipped. Full `npm run validate:api` passed with `1399` passed, `0` failed,
  `0` skipped. GitHub checks passed on the exact reviewed head
  `b09e9e908296bc4f55fabc165ef12ffb5f3bd63c`.
- Post-merge hygiene:
  source branch
  `feature/auth-local-password-reset-delivery-failure-public-response-20260707`
  was restored to `b09e9e908296bc4f55fabc165ef12ffb5f3bd63c`. Issue comments
  were posted:
  - #336:
    https://github.com/tommytang213/Settleora/issues/336#issuecomment-4899597867
  - #339:
    https://github.com/tommytang213/Settleora/issues/339#issuecomment-4899597862
- Required next gates:
  audit/redaction acceptance, notification event/target/redaction if used,
  UI/Figma/product copy, final public route exposure review, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. No issue closure, labels, milestones, assignees, or
  Project fields were changed. PR #750 does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change runtime source, tests, OpenAPI/contracts,
  generated clients, schema/migrations, public endpoint mappings, UI, secrets/
  config/env samples, deployment/Docker/CI/Codemagic/TestFlight behavior,
  notification outbox design, money/settlement/payment/bill/OCR/storage/sync/
  import/export/backup/restore/reconciliation behavior, issue closure, or
  Project fields.

### Issues #336/#339 - Password reset delivery-failure public-response PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-delivery-failure-public-response-20260707`.
- Baseline:
  `origin/main` at `a9d531ee0502269d0c3ff7992089e1470b238c95`,
  the PR #749 merge commit.
- Verification timestamp:
  `2026-07-07 05:45 HKT` task window.
- Completed branch checkpoint:
  internal password-reset public request-response policy foundation for future
  route exposure review. The policy maps delivery disabled/not-ready,
  local/test sink recorded, provider send accepted, provider send failed, and
  reset-specific request/provider-send throttled outcomes to the existing
  uniform public request posture: `202 Accepted`, no response body, and no
  `Retry-After`.
- Redaction posture:
  public-response decisions preserve only bounded internal diagnostic
  categories for server-side policy/tests. Decision readbacks do not expose
  submitted identifiers, recipient email addresses, reset material, reset URLs,
  token/query/fragment content, SMTP host/password, configured public origins,
  provider payloads, raw provider exceptions, bucket keys, account IDs, user
  profile IDs, auth account IDs, or audit internals.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the OpenAPI paths remain
  transport contracts only.
- Required next gates:
  audit/redaction acceptance, notification event/target/redaction if used,
  UI/Figma/product copy, final public route exposure review, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset abuse/provider-send throttles PR #748 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/748.
- Merge SHA:
  `aef4d7f6768a5a5ededda91c04dda21eba81e0b0`.
- Reviewed source head:
  `f860b8155bd1686c0f04977ae31dda4ddd9100b4`.
- Previous main/base:
  `4ef9c0f1bc035a0e09b27e731af2104bf0911e55`.
- Verification timestamp:
  `2026-07-07 04:45 HKT` task window.
- Completed merged checkpoint:
  internal reset-specific abuse/provider-send throttle foundation for local
  password reset email delivery orchestration. PR #748 keeps the throttle
  policy inside the existing internal reset delivery path and does not expose
  public password-reset routes.
- Validation checkpoint:
  PR #748 final gate recorded docs, scaffold, focused password-reset tests,
  route-exposure guard, and full `npm run validate:api` passing with `1398`
  API tests passed. GitHub checks passed on the exact reviewed source head
  `f860b8155bd1686c0f04977ae31dda4ddd9100b4`.
- Post-merge hygiene checkpoint:
  the source branch was restored to the reviewed head; comments were posted to
  #336 and #339; public password-reset request/complete runtime routes remained
  blocked/unregistered after merge.
- Required next gates:
  delivery failure public-response acceptance, audit/redaction acceptance,
  notification event/target/redaction if used, UI/Figma/product copy, final
  public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. PR #748 does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, public route exposure, user-visible reset UX, or
  final auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change runtime source, tests, OpenAPI/contracts,
  generated clients, schema/migrations, public endpoint mappings, UI, secrets/
  config/env samples, deployment/Docker/CI/Codemagic/TestFlight behavior,
  notification outbox design, money/settlement/payment/bill/OCR/storage/sync/
  import/export/backup/restore/reconciliation behavior, issue closure, or
  Project fields.

### Issues #336/#339 - Password reset abuse/provider-send throttles PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-abuse-provider-send-throttles-20260707`.
- PR:
  https://github.com/tommytang213/Settleora/pull/748.
- PR-open implementation head:
  `f13deb310b45fb00581fa467cefbf623137f1a7f`.
- Baseline:
  `origin/main` at `4ef9c0f1bc035a0e09b27e731af2104bf0911e55`,
  the PR #747 merge commit.
- Verification timestamp:
  `2026-07-07 03:00 HKT` task window.
- Completed branch checkpoint:
  internal reset-specific abuse/provider-send throttle foundation for the
  existing local password reset delivery orchestration. The branch adds a
  reset throttle policy boundary, an in-memory single-node foundation with
  bounded source, identifier, combined, global, and provider-send scopes, and
  orchestrator checks that block before reset material issuance and before
  SMTP/provider handoff when policy says to throttle.
- Redaction posture:
  throttle request, decision, delivery result, and provider-throttled readbacks
  expose only bounded status/category/scope values. They do not expose
  submitted identifiers, account existence, recipient email addresses, reset
  material, reset URLs, SMTP host/password, provider payloads, raw provider
  errors, or raw bucket keys. Derived in-memory throttle keys are not persisted
  to reset request rows or audit metadata by this slice.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`; the runtime route exposure guard
  under `services/api/src` found no public password-reset mapping strings.
- Validation checkpoint at PR-open implementation head:
  `git diff --check` passed; focused password-reset throttle/readiness/
  template/orchestration/route-exposure tests passed with 66 tests; the route
  exposure guard passed. Full required PR-open validation is recorded in the
  Codex report for the final PR head.
- Required next gates:
  delivery failure public-response acceptance, audit/redaction acceptance,
  notification event/target/redaction if used, UI/Figma/product copy, final
  public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. #336 remains the broader auth/session/runtime
  security epic. #339 remains the Day 1 password reset and credential-change
  workflow umbrella because this PR does not expose public reset routes, does
  not complete user-visible reset UX/product copy, and does not satisfy final
  auth/security acceptance.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset internal delivery orchestration PR #746 post-merge checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  https://github.com/tommytang213/Settleora/pull/746.
- Merge SHA:
  `86713435af299347f5fa1b016b400575e39daf0a`.
- Reviewed source head:
  `72aef62c5b9afe1b1ecb7ecdd48d1d6ac6e53be0`.
- Previous main/base:
  `89fb5ca2384dfa53115730c1698f5197827b67d8`.
- Verification timestamp:
  `2026-07-07 02:00 HKT` task window.
- Completed merged checkpoint:
  internal-only local password reset email delivery orchestration foundation.
  PR #746 connects internal reset material issuance, delivery readiness,
  reset-link/template composition, local/test sink outcomes, and
  reset-specific SMTP transport handoff behind readiness gates.
- Public route exposure:
  still blocked. PR #746 does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Validation checkpoint:
  GitHub checks passed on the exact reviewed source head
  `72aef62c5b9afe1b1ecb7ecdd48d1d6ac6e53be0`; the later validation gate
  completed `npm run validate:api` with `1393` tests passed; route exposure
  search under `services/api/src` found no public password-reset runtime
  mappings.
- Post-merge hygiene checkpoint:
  the source branch was restored to the reviewed head; comments were posted to
  #336 and #339; #336 remains `OPEN` with Project status `Inbox`; #339 remains
  `OPEN` with Project status `Needs Decision`.
- Required next gates:
  reset-specific abuse/provider-send throttles, delivery failure
  public-response acceptance, audit/redaction acceptance, notification
  event/target/redaction if used, UI/Figma/product copy, final public route
  exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. PR #746 does not complete the broader
  auth/session/runtime security epic, the Day 1 password reset and
  credential-change workflow, or public password-reset route exposure.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, notification outbox
  design, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset internal delivery orchestration PR-open checkpoint

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-internal-delivery-orchestration-20260707`.
- Baseline:
  `origin/main` at `89fb5ca2384dfa53115730c1698f5197827b67d8`,
  the PR #745 merge commit.
- Verification timestamp:
  `2026-07-07 01:15 HKT` task window.
- Completed branch checkpoint:
  internal password-reset email delivery orchestration foundation only. The
  branch connects the existing internal reset material issuer, password-reset
  email delivery readiness, reset-link/template composer, and reset-specific
  SMTP transport handoff behind readiness checks.
- Delivery posture:
  disabled/not-ready delivery refuses before material issuance or provider
  handoff; production SMTP delivery requires the existing readiness gate;
  local/test sink modes produce explicit no-SMTP sink results; provider
  failures collapse to bounded redacted categories.
- Redaction posture:
  delivery results and `ToString()` readbacks do not expose reset material,
  token/query-style URL content, submitted identifiers, recipient email
  addresses, SMTP host/password, configured public origins, provider payloads,
  or raw provider errors. Raw reset material appears only in the send-ready SMTP
  message body handed to the provider boundary after readiness and composition
  pass.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  reset-specific abuse/provider-send throttles, audit/redaction acceptance,
  notification event/target/redaction if used, UI/Figma/product copy, final
  public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not approve public
  request/complete route exposure and does not complete the broader Day 1
  password reset or auth/security epic.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/
  bill/OCR/storage/sync/import/export/backup/restore/reconciliation behavior,
  issue closure, or Project fields.

### Issues #336/#339 - Password reset link/template internal foundation

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-link-template-internal-20260707`.
- Baseline:
  `origin/main` at `054d442ab91f388a44959a8d8aba59a8662446b5`,
  the PR #744 merge commit.
- Verification timestamp:
  `2026-07-07 00:10 HKT` task window.
- Completed branch checkpoint:
  internal reset-link construction and redacted reset email-template composition
  foundation. The API can compose a send-ready internal password-reset email
  message only when delivery readiness is available, a safe configured public
  origin exists, reset-link lifetime is in the approved 15-120 minute range,
  and the reset-link path passes the safe rooted-relative path policy.
- Link posture:
  send-ready internal messages place reset material in the URL fragment for
  future browser/mobile handoff. Redacted previews/readbacks replace the link
  with a fixed redaction marker and do not expose reset material, token-like URL
  content, submitted identifiers, account email/usernames, SMTP credentials,
  configured origins, or provider payloads.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  internal delivery orchestration without route exposure, reset-specific
  abuse/provider-send throttles, delivery failure handling, audit/redaction
  acceptance, notification event/target/redaction if used, UI/Figma/product
  copy, final public route exposure review, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This checkpoint does not send password reset email
  and does not approve public request/complete route exposure.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, SMTP/email sending, notification runtime, public endpoint
  mappings, UI, secrets/config/env samples, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  fields.

### Issues #336/#339 - Password reset SMTP provider config verification foundation

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-smtp-provider-config-verification-20260706`.
- Baseline:
  `origin/main` at `b441bb7ecab058c8891962fdbe83f9312f64644a`,
  the PR #743 merge commit.
- Verification timestamp:
  `2026-07-06 22:45 HKT` task window.
- Completed branch checkpoint:
  internal password-reset SMTP/email delivery configuration readiness
  foundation. The API can evaluate whether future local-account password reset
  email delivery is disabled, has production SMTP readiness, has an explicit
  local/test sink mode, has a configured safe public origin, and uses the
  approved 60 minute default / 15-120 minute reset-link lifetime range.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Redaction posture:
  readiness results expose only bounded status/category values and lifetime
  minutes. They do not expose SMTP hostnames, usernames, passwords, configured
  public origins, query strings, reset material, tokens, provider payloads, or
  raw provider diagnostics.
- Required next gates:
  reset-link builder and redacted template review, internal delivery
  orchestration without route exposure, reset-specific abuse/provider-send
  throttles, audit/redaction acceptance, notification event/target/redaction if
  used, UI/Figma/product copy, final public route exposure review, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. This verifier is a bounded internal readiness
  foundation only; it does not send password reset email or approve public
  request/complete route exposure.
- Scope confirmation:
  this checkpoint does not change OpenAPI/contracts, generated clients,
  schema/migrations, SMTP/email sending, reset email templates, reset-link
  construction, public endpoint mappings, UI, secrets/config/env samples,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/
  bill/OCR/storage/sync/import/export/backup/restore/reconciliation behavior,
  issue closure, or Project fields.

### Issues #336/#339 - Local password reset SMTP provider readiness gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `docs/auth-local-password-reset-smtp-provider-readiness-gate-20260706`.
- Baseline:
  `origin/main` at `b2414ee595e33735acbd1f2357a6dbd6d3471cd6`,
  the PR #742 merge commit.
- Verification timestamp:
  `2026-07-06 21:35 HKT` task window.
- Recent merged checkpoints:
  PR #739 merged the internal local-account password reset runtime foundation at
  `7a35823325b5207104ceb91866e087775e2a0b34`. PR #741 merged the non-blocking
  Trivy/Semgrep CE scanner baseline at
  `4051ee5aef1ae122e81b339155038c920525e25e`. PR #742 merged the docs-only
  delivery readiness decision gate at
  `b2414ee595e33735acbd1f2357a6dbd6d3471cd6`.
- Completed branch checkpoint:
  docs-only SMTP provider readiness gate. Current repo is partially ready for
  bounded internal SMTP reset delivery slices because generic SMTP notification
  sender/options/readiness/outbox plumbing exists, but generic notification
  plumbing is not approved password-reset delivery by itself.
- Current-state clarification:
  password reset has merged schema/domain, OpenAPI/generated-client transport,
  and internal runtime foundations. It still has no reset delivery
  implementation, reset-link builder, reset email template, reset-specific base
  URL/public-origin runtime, reset provider-send throttle runtime, or public
  request/complete route mapping.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Required next gates:
  SMTP/email provider configuration verification, base URL/reset-link
  construction policy, reset-link lifetime enforcement, redacted reset template,
  delivery failure handling with uniform public responses, reset-specific abuse
  and provider-send throttles, audit/redaction acceptance, local/dev/test
  fake-or-sink behavior, UI/Figma/product copy, notification event/target/
  redaction if used, and final public exposure/auth-security review.
- Recommended next slices:
  provider config verification foundation; reset-link builder and redacted
  template rendering internal service; internal reset delivery orchestration
  without public route exposure; final public route exposure only after all
  delivery, abuse, audit, UI/product copy, notification-if-used, and final
  auth/security gates pass.
- Issue posture:
  keep #336 and #339 open. #336 remains open for broader auth/session/runtime
  security. #339 remains open because password reset and credential-change
  workflow still has delivery, public exposure, UI/product copy, abuse,
  notification-if-used, and final acceptance gates.
- Scope confirmation:
  this checkpoint is docs-only. It does not change public API route exposure,
  runtime handlers, OpenAPI/contracts, generated clients, schema/migrations,
  SMTP/email provider delivery/configuration, notification runtime, UI,
  scanner configuration, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  fields.

### Issues #336/#339 - Local password reset delivery readiness decision gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `docs/auth-local-password-reset-delivery-readiness-decision-gate-20260706`.
- Baseline:
  `origin/main` at `4051ee5aef1ae122e81b339155038c920525e25e`,
  the PR #741 merge commit.
- Verification timestamp:
  `2026-07-06 20:35 HKT` task window.
- Recent merged checkpoints:
  PR #739 merged the internal local-account password reset runtime foundation at
  `7a35823325b5207104ceb91866e087775e2a0b34`. PR #741 merged the non-blocking
  Trivy/Semgrep CE scanner baseline at
  `4051ee5aef1ae122e81b339155038c920525e25e`.
- Completed branch checkpoint:
  docs-only delivery readiness decision gate. The recommended Day 1 path is
  SMTP/email reset-link delivery first, behind provider/configuration, base
  URL, template redaction, delivery failure, audit/redaction, abuse, and final
  auth/security gates. Any admin-delivered recovery fallback remains separately
  approved and audited.
- Public route exposure:
  still blocked. This branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Remaining gates:
  SMTP/email provider configuration and verification, optional separately
  approved admin-delivered recovery, reset-specific abuse/provider-send
  thresholds, audit/redaction, notification event/target/redaction if used,
  UI/Figma/mobile/web/admin/product copy, final public route exposure review,
  and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. #336 remains open for broader auth/session/runtime
  security. #339 remains open because password reset and credential-change
  workflow still has delivery/public exposure/UI/final acceptance gates.
- Scope confirmation:
  this checkpoint is docs-only. It does not change public API route exposure,
  runtime handlers, OpenAPI/contracts, generated clients, schema/migrations,
  SMTP/email provider delivery/configuration, notification runtime, UI,
  scanner configuration, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  fields.

### Issues #336/#339 - Password reset public route exposure implementation branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback remains `Inbox` from the latest
    password-reset gate reports.
  - #339 `OPEN`; Project status readback remains `Needs Decision` from the
    latest password-reset gate reports.
- Branch:
  `feature/auth-password-reset-route-exposure-20260707-2120`.
- Baseline:
  `origin/main` at `e1bf888e6e83503b2424d5237a409251a41f2720`, the PR #762
  merge commit.
- Verification timestamp:
  `2026-07-07 21:20 HKT` task window.
- Implementation PR:
  to be opened from this branch after required local validation passes; the
  task report records the final PR number and URL.
- Completed branch checkpoint:
  narrow public runtime route exposure only. The branch maps exactly:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete`. The request route is anonymous,
  validates only the approved transport shape, calls the existing local request
  service and delivery/public-response runtime boundaries, and returns uniform
  `202 Accepted` with no body and no `Retry-After`. The completion route is
  anonymous, validates only the approved transport shape, calls the existing
  local completion service boundary, returns `204 No Content` for successful
  reset, and maps invalid/unavailable material to generic bounded problem
  responses without issuing access or refresh credentials.
- Scope confirmation:
  this checkpoint changes only API route mapping/binding, focused route
  exposure tests, and this ledger entry. It does not change OpenAPI/contracts,
  generated clients, schema/migrations, password-reset token policy, SMTP/
  provider configuration, notification targets/security-center/
  credential-activity surfaces, mobile/web/admin UI, product copy beyond this
  ledger checkpoint, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, labels,
  milestones, assignees, or Project fields.
- Validation checkpoint:
  required validation for this branch is `git diff --check`,
  `npm run validate:openapi`, `npm run generate:clients` with no tracked
  generated-client drift, `npm run validate:clients`,
  `npm run validate:scaffold`, `npm run validate:api`, and focused
  `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter "FullyQualifiedName~PasswordReset|FullyQualifiedName~LocalPasswordResetRouteExposureTests"`.
  Exact command results are recorded in the task report for this branch.
- Remaining gates:
  PR review/merge gate, post-merge hygiene, and broader Day 1 password-reset/
  UI/notification acceptance work. Conditional target/security-center/
  credential-activity OpenAPI/generated-client gates remain required only if a
  later task adds password-reset notifications or those surfaces.
- Issue posture:
  keep #336 and #339 open. This route exposure branch closes the old unmapped
  public transport gap only; it does not complete the broader auth/session/
  runtime security epic or the full Day 1 password reset and credential-change
  workflow.

### Issues #336/#339 - Local password reset internal runtime bucket hardening branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-internal-runtime-foundation-20260706`.
- Baseline:
  `origin/main` at `1fd45765344d603c166e788661acfe871a7d2b0b`,
  the PR #738 merge commit.
- Starting branch head:
  `2fe46dc5389475d24216254de977e4f5efeb13e4`.
- Verification timestamp:
  `2026-07-06 15:35 HKT` task window.
- Completed branch checkpoint:
  internal password reset runtime hardening only. The branch disables
  password-reset persistence of identifier-derived and combined
  source-plus-identifier bucket references where the prior internal runtime
  used plain deterministic SHA-256 over normalized identifiers. Until a
  password-reset-approved keyed bucket fingerprint mechanism exists,
  `identifier_bucket_ref`, `combined_bucket_ref`, `global_bucket_ref`, and
  `provider_send_bucket_ref` remain unset by the internal service.
- Preserved source bucket posture:
  `request_source_bucket_ref` may still persist only a caller-supplied safe
  coarse bucket reference after bounded safe-category normalization. This
  checkpoint does not derive source buckets from raw IP addresses, forwarded
  headers, user agents, or request metadata.
- Public route exposure:
  still blocked. The branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Current-state clarification:
  runtime remains internal-service-only. No reset SMTP/email/provider delivery,
  notification runtime, UI, OpenAPI/generated-client, schema/migration,
  deployment/config/secrets, or public reset endpoint exposure is added.
- Remaining gates:
  SMTP/email provider configuration and verification, optional admin-delivered
  recovery, public route exposure after delivery approval, notification
  event/target/redaction, UI/Figma/mobile/web/admin/product copy, reset abuse
  threshold tuning and keyed bucket design, audit retention/final audit
  acceptance, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Keep #339 in `Needs Decision` unless a later
  explicitly scoped metadata task changes it.
- Scope confirmation:
  this checkpoint changes internal auth runtime/test/ledger files only. It does
  not change public API route exposure, OpenAPI/contracts, generated clients,
  schema/migrations, provider delivery, notification runtime, UI, secrets/
  config/env, deployment/Docker/CI/Codemagic/TestFlight behavior, money/
  settlement/
  payment/bill/OCR/storage/sync/import/export/backup/restore/reconciliation
  behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset internal runtime foundation branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-internal-runtime-foundation-20260706`.
- Baseline:
  `origin/main` at `1fd45765344d603c166e788661acfe871a7d2b0b`,
  the PR #738 merge commit.
- Verification timestamp:
  `2026-07-06 15:00 HKT` task window.
- Completed branch checkpoint:
  internal API/domain password reset runtime foundation only. The branch adds
  internal local password reset request, material issue, and completion service
  boundaries; purpose-bound hash-backed reset material helpers; credential
  replacement through the existing local password hashing/credential workflow;
  account-wide active session and refresh/session-family revocation after
  successful internal completion; bounded auth audit events; and focused tests
  proving route non-exposure, no material creation when provider delivery is
  unavailable, hash-only material persistence, replacement of older material,
  one-time completion/replay handling, credential replacement, session-family
  revocation, and audit redaction.
- Public route exposure:
  still blocked. The branch does not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Current-state clarification:
  runtime remains internal-service-only. No reset SMTP/email/provider delivery,
  notification runtime, UI, OpenAPI/generated-client, schema/migration,
  deployment/config/secrets, or public reset endpoint exposure is added.
- Remaining gates:
  SMTP/email provider configuration and verification, optional admin-delivered
  recovery, public route exposure after delivery approval, notification
  event/target/redaction, UI/Figma/mobile/web/admin/product copy, reset abuse
  threshold tuning, audit retention/final audit acceptance, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Keep #339 in `Needs Decision` unless a later
  explicitly scoped metadata task changes it.
- Scope confirmation:
  this checkpoint changes internal auth runtime/test/ledger files only. It does
  not change public API route exposure, OpenAPI/contracts, generated clients,
  schema/migrations, provider delivery, notification runtime, UI, secrets/
  config/env, deployment/Docker/CI/Codemagic/TestFlight behavior, money/
  settlement/
  payment/bill/OCR/storage/sync/import/export/backup/restore/reconciliation
  behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset API runtime readiness gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `docs/auth-local-password-reset-api-runtime-readiness-gate-20260706`.
- Last verified at main SHA:
  `65961d7a60b7c1732e2d932ad1c69b7439861541`, the PR #737 merge commit.
- Verification timestamp:
  `2026-07-06 14:20 HKT` task window.
- Readiness gate packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_API_RUNTIME_READINESS_GATE.md`.
- Recent PR and metadata readback:
  PR #734 merged the local password reset schema/domain foundation at
  `bf2f6cd1526b2c71283c97a5f8bdf6aba60d0df7` from reviewed head
  `d66a6328a84f70eb3a5f6d3145e5e182612b9df0`. PR #736 merged the
  OpenAPI/generated-client transport contract at
  `ce18aaaf9975ec26b1a02e55fd3310c42273cb3f` from reviewed head
  `03878c114bccd817fee1200c8cbf01bb1238d29d`. PR #737 merged the
  OpenAPI/generated-client post-merge ledger checkpoint at
  `65961d7a60b7c1732e2d932ad1c69b7439861541` from reviewed head
  `0cc755e676d5a72e2c5b78e9710f83caf48545f0`.
- Runtime readiness decision:
  `READY_FOR_INTERNAL_SERVICE_ONLY`.
- Current-state clarification:
  schema/domain and OpenAPI/generated clients are merged, but runtime password
  reset remains unimplemented. Current repo evidence does not contain explicit
  approval that SMTP/email provider configuration is configured, verified, and
  approved for password reset, and it does not contain a separately approved
  admin-delivered recovery policy.
- Public route exposure:
  blocked. Do not register or expose
  `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete` until the SMTP/email provider
  configuration/verification gate or a separate admin-delivered recovery gate
  is approved.
- Allowed next bounded slice:
  an internal API/service runtime foundation may proceed only with route
  exposure disabled/unregistered and no outbound reset delivery. A separate
  SMTP/email provider configuration and verification gate remains required
  before public runtime exposure.
- Existing provider/delivery finding:
  the current SMTP email notification sender and provider readiness readout are
  generic optional notification plumbing, default disabled/unconfigured unless
  deployment options are present, and are not an approved password-reset
  delivery provider or reset email content gate by themselves.
- Remaining separate gates:
  SMTP/email provider configuration and verification, optional admin-delivered
  recovery, public route exposure after delivery approval, notification
  event/target/redaction, UI/Figma/mobile/web/admin/product copy, reset abuse
  threshold tuning, audit retention/final audit acceptance, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Do not change Project fields from this docs-only
  readiness gate.
- Scope confirmation:
  this checkpoint is docs-only and does not add runtime password reset
  endpoints or services, public API behavior, OpenAPI/contracts, generated
  clients, schema/migrations/domain model changes, SMTP/email provider
  delivery/configuration, notification runtime, UI, secrets/config/env,
  deployment/Docker/CI/Codemagic/TestFlight behavior, money/settlement/
  payment/bill/OCR/storage/sync/import/export/backup/restore/reconciliation
  behavior, issue closure, or Project field changes.

### Issues #336/#339 - PR #736 local password reset OpenAPI/generated-client contract merged

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  #736 `feat(api): add local password reset OpenAPI contract`.
- Merge:
  `ce18aaaf9975ec26b1a02e55fd3310c42273cb3f` into `main` from
  `feature/auth-local-password-reset-openapi-clients-20260706`.
- Reviewed source head:
  `03878c114bccd817fee1200c8cbf01bb1238d29d`.
- Previous `origin/main` before PR #736:
  `a8f556ef671899a4c98924f66fe4c483eac7ce2f`.
- Verification timestamp:
  `2026-07-06 14:00 HKT` post-merge hygiene task window.
- Completed slice:
  OpenAPI/generated-client contract only for local-account password reset
  request and completion. The merge adds contract paths
  `POST /api/v1/auth/password-reset/request` with operation ID
  `requestLocalPasswordReset` and
  `POST /api/v1/auth/password-reset/complete` with operation ID
  `completeLocalPasswordReset`, then refreshes the generated web and Dart
  clients from the OpenAPI source.
- Merged diff scope:
  exactly the five intended OpenAPI/generated-client files:
  `packages/contracts/openapi/settleora.v1.yaml`,
  `packages/client-web/src/generated/client.ts`,
  `packages/client-web/src/generated/models.ts`,
  `packages/client-dart/lib/generated/client.dart`, and
  `packages/client-dart/lib/generated/models.dart`. The merged diff excludes
  `.codex/reports/**`.
- Current-state clarification:
  runtime password reset is still not implemented. PR #736 does not add API
  runtime handlers, service implementation, SMTP/email provider delivery or
  configuration, notification runtime, UI/Figma/mobile/web/admin behavior,
  schema/migrations/domain model changes, auth config/secrets/env/appsettings,
  session revocation runtime for reset, abuse threshold runtime, or final
  auth/security acceptance.
- Remaining gates:
  API/service runtime implementation gate, SMTP/email provider configuration
  and verification gate, optional admin-delivered recovery gate, notification
  event/target/redaction gate, UI/Figma/mobile/web/product copy gate, abuse
  threshold tuning, audit/final auth-security acceptance, and any future
  runtime merge gate.
- Issue posture:
  keep #336 and #339 open. #339 should remain `Needs Decision` unless a later
  explicitly scoped metadata task changes it. Do not claim Day 1 password reset
  runtime is complete from this OpenAPI/generated-client contract merge.
- Scope confirmation:
  this checkpoint records an already merged auth OpenAPI/generated-client
  contract slice. It does not add runtime password reset endpoints or services,
  provider delivery, notification runtime, UI, schema/migrations/domain model
  changes, secrets/config/env, deployment/Docker/CI/Codemagic/TestFlight
  behavior, money/settlement/payment/bill/OCR/storage/sync/import/export/
  backup/restore/reconciliation behavior, issue closure, or Project field
  changes.

### Issues #336/#339 - PR #734 local password reset schema/domain foundation merged

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- PR:
  #734 `feat(api): add local password reset schema foundation`.
- Merge:
  `bf2f6cd1526b2c71283c97a5f8bdf6aba60d0df7` into `main` from
  `feature/auth-local-password-reset-schema-domain-20260706`.
- Reviewed source head:
  `d66a6328a84f70eb3a5f6d3145e5e182612b9df0`.
- Previous `origin/main` before PR #734:
  `6a6893e1c1ccb323733cde627e6df1a753622161`.
- Verification timestamp:
  `2026-07-06 13:10 HKT` post-merge hygiene task window.
- Completed slice:
  schema/domain foundation only for local-account password reset request
  material. The merge adds the `AuthPasswordResetRequest` domain model and
  bounded constants, maps `auth_password_reset_requests`, adds EF migration
  `20260706041357_AddAuthPasswordResetRequestsFoundation`, and adds focused
  schema/migration tests.
- Merged diff scope:
  exactly 16 auth schema/domain/test/ledger files. The merged diff excludes
  `.codex/reports/**`.
- Current-state clarification:
  runtime password reset is still not implemented. PR #734 does not add public
  password reset endpoints, OpenAPI paths or schemas, generated clients,
  SMTP/email delivery, provider configuration, notification runtime, UI/Figma,
  mobile/web/admin behavior, session revocation runtime for reset, abuse
  threshold runtime, or final auth/security acceptance.
- Remaining gates:
  OpenAPI/generated-client contract gate, API/service runtime implementation
  gate, SMTP/email provider configuration and verification gate, optional
  admin-delivered recovery gate, notification event/target/redaction gate,
  UI/Figma/mobile/web/product copy gate, abuse threshold tuning, audit
  retention approval, and final auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. #339 should remain `Needs Decision` unless a later
  explicitly scoped metadata task changes it. Do not claim Day 1 password reset
  runtime is complete from this schema/domain merge.
- Scope confirmation:
  this checkpoint records an already merged auth schema/domain/migration slice.
  It does not add runtime password reset endpoints or services, public API
  behavior, OpenAPI/contracts, generated clients, provider delivery,
  notification runtime, UI, secrets/config/env, deployment/Docker/CI/Codemagic/
  TestFlight behavior, money/settlement/payment/bill/OCR/storage/sync/import/
  export/backup/restore/reconciliation behavior, issue closure, or Project
  field changes.

### Issues #336/#339 - Local password reset schema/domain foundation branch

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Branch:
  `feature/auth-local-password-reset-schema-domain-20260706`.
- Baseline:
  `origin/main` at `6a6893e1c1ccb323733cde627e6df1a753622161`,
  the PR #733 merge commit.
- Verification timestamp:
  `2026-07-06 12:10 HKT` task window.
- Completed slice:
  schema/domain foundation only for local-account password reset request
  material. The branch adds `AuthPasswordResetRequest` and bounded category
  constants, maps `auth_password_reset_requests`, adds an explicit EF Core
  migration, and adds focused schema/migration tests.
- Schema digest:
  the table stores bounded purpose/status/scope/delivery/provider-send/
  revocation categories, nullable account and active-at-issuance local password
  credential references, nullable hash-backed reset material fields, lifecycle
  timestamps, safe abuse bucket references, correlation IDs, cleanup timestamp,
  and replacement self-reference. It includes restrictive FKs, bounded check
  constraints, filtered unique material-hash lookup, pending account/purpose
  lookup, account/purpose/status/expiry lookup, and expiry/cleanup indexes.
- Current-state clarification:
  runtime password reset is still not implemented. This checkpoint does not add
  public password reset endpoints, OpenAPI paths or schemas, generated clients,
  SMTP/email delivery, provider configuration, notification runtime, UI/Figma,
  mobile/web/admin behavior, session revocation runtime for reset, abuse
  threshold runtime, or final auth/security acceptance.
- Remaining gates:
  OpenAPI/generated-client contract gate, API/service runtime implementation
  gate, SMTP/email provider configuration and verification gate, optional
  admin-delivered recovery gate, notification event/target/redaction gate,
  UI/Figma/mobile/web/product copy gate, abuse threshold tuning, audit
  retention approval, and final auth/security acceptance. Schema/migration
  merge remains manual-gated because auth/security persistence is sensitive.
- Issue posture:
  keep #336 and #339 open. Do not claim Day 1 password reset runtime is
  complete from this schema/domain branch.
- Scope confirmation:
  this checkpoint changes auth schema/domain/test/report/ledger files only. It
  does not change public API behavior, OpenAPI/contracts, generated clients,
  provider delivery, notification runtime, UI, secrets/config/env, deployment/
  Docker/CI/Codemagic/TestFlight behavior, money/settlement/payment/bill/OCR/
  storage/sync/import/export/backup/restore/reconciliation behavior, issue
  closure, or Project fields.

### Issues #336/#339 - Local password reset schema/OpenAPI/runtime design gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Last verified at main SHA:
  `a86be35a2c4be2cfc47294648282bdc5a39e90a5`.
- Verification timestamp:
  `2026-07-06 11:15 HKT` task window.
- Design gate packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_SCHEMA_OPENAPI_RUNTIME_DESIGN_GATE.md`.
- Recent PR and metadata readback:
  PR #729 merged authenticated current-account password change only at
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`. PR #730 merged the docs-only
  password reset/recovery policy gate at
  `0004b153b833fd9793df6102cc1b3ce3d0385002`. PR #731 merged the docs-only
  local reset delivery/token policy gate at
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`. PR #732 merged Tommy's approved
  local reset delivery/token policy decision at
  `a86be35a2c4be2cfc47294648282bdc5a39e90a5`.
- Current design digest:
  the schema/OpenAPI/runtime design gate proposes a local-account-only reset
  persistence model, endpoint family, service boundaries, audit taxonomy,
  redaction matrix, validation matrix, and implementation slicing plan. It
  keeps reset material hash/verifier-backed only, rejects raw tokens and raw
  identifiers, preserves uniform public anti-enumeration responses, treats
  newer material as replacing older outstanding material, and keeps successful
  reset account-wide session and refresh/session-family revocation as the
  default.
- Current-state clarification:
  runtime password reset is still not implemented. This checkpoint is technical
  design only and does not approve schema, migrations, OpenAPI, generated
  clients, API runtime endpoints, SMTP/email provider delivery, notification
  runtime, UI/Figma/product copy, admin-delivered reset, or final auth/security
  acceptance.
- Remaining gates:
  schema/migration/domain model implementation gate, OpenAPI/generated-client
  contract gate, API/service runtime implementation gate, SMTP/email provider
  configuration and verification gate, optional admin-delivered recovery gate,
  notification event/target/redaction gate, UI/Figma/mobile/web gate, abuse
  threshold tuning, audit retention approval, and final auth/security
  acceptance.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from this docs-only design
  gate, and do not claim runtime password reset is implemented.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/Codemagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset token policy approved decision

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Decision`.
- Last verified at main SHA:
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`.
- Verification timestamp:
  `2026-07-06 10:45 HKT` task window.
- Policy decision packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md`.
- Recent PR and metadata readback:
  PR #731 merged the docs-only local password reset delivery/token policy gate at
  `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`. The later metadata hygiene task
  changed #339 Project status from `Needs Architecture Review` to
  `Needs Decision`; #336 stayed `Inbox`.
- Manual decision digest:
  Tommy approved the Day 1 local-account password reset delivery/token policy
  for subsequent technical design. Approved values are local-account-only reset,
  no Settleora reset for OIDC/provider-owned passwords, SMTP/email reset links
  only when the provider policy is configured/verified/approved, no runtime
  forgotten-password endpoint without approved SMTP/email or separately approved
  admin-delivered recovery policy, admin-delivered material as a separate later
  gate, uniform anti-enumeration-safe public responses, high-entropy one-time
  scoped hash/verifier-backed reset material with no raw storage, 60 minute
  default email-link expiry, owner/admin configurable email-link expiry from 15
  to 120 minutes, 10 to 15 minute expiry for any future typed short-code/OTP
  flow, newer reset material revoking or replacing older outstanding material,
  account-wide active session and refresh/session-family revocation after
  successful reset by default, source/identifier/combined/global/provider-send
  abuse buckets, no initial `Retry-After`, bounded secret-free audit, separate
  notification event/target/redaction gate, separate UI/Figma/product copy gate,
  and separate schema/OpenAPI/generated-client/runtime implementation gate.
- Current-state clarification:
  runtime password reset is still not implemented. This checkpoint resolves only
  the local reset delivery/token policy decision gate; it does not approve
  schema, OpenAPI, generated-client, API runtime, provider delivery,
  notification, UI, or final auth/security implementation readiness.
- Remaining gates:
  schema/migration/retention design, OpenAPI and generated-client review, API
  runtime design and tests, SMTP/email provider configuration and verification,
  any admin-delivered recovery policy, reset abuse thresholds, future
  `Retry-After` approval if desired, auth audit metadata/retention, user-facing
  notification event/target/redaction approval, UI/Figma/product copy, and final
  auth/security acceptance.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from this docs-only
  decision recording task, and do not claim runtime password reset is
  implemented.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/CodeMagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Local password reset delivery and token policy gate

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Architecture Review`.
- Last verified at main SHA:
  `0004b153b833fd9793df6102cc1b3ce3d0385002`.
- Verification timestamp:
  `2026-07-06 01:30 HKT` task window.
- Policy gate packet:
  `docs/planning/AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md`.
- Recent PR readback:
  PR #729 completed authenticated current-account local password change only and
  merged at `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`. PR #730 merged the
  docs-only password reset/recovery policy gate at
  `0004b153b833fd9793df6102cc1b3ce3d0385002`.
- Decision digest:
  user-initiated Day 1 local password reset remains
  `BLOCKED_PENDING_MANUAL_DECISIONS`. Recommended technical posture is
  local-account-only reset, approved SMTP/email or approved admin-delivered
  out-of-band delivery, uniform public responses, hash/verifier-backed
  short-lived one-time reset material, 15 minute default expiry with a 30 minute
  cap unless manually changed, atomic consume, replay-safe failures, layered
  reset abuse/provider-send throttles, bounded audit, and account-wide active
  session plus refresh-family revocation after success.
- Current-state clarification:
  in-app-only reset is insufficient for forgotten-password unauthenticated
  recovery. MFA/passkey recovery-code foundations remain MFA challenge/recovery
  material only and are not password-reset token authority.
- Remaining gates:
  product/trust delivery posture, provider/admin policy approval, final expiry
  and replacement rules, reset abuse thresholds, session revocation breadth if
  narrowed, auth audit metadata/retention, user-facing notification event/
  target/redaction approval, UI/Figma/product copy, schema/OpenAPI/generated-
  client review, and runtime implementation remain incomplete.
- Recommended next posture:
  keep runtime blocked until Tommy approves one delivery posture and the
  auth/security token policy. If approved later, the smallest runtime slice
  should be narrow, local-account only, provider/admin delivery explicit, fully
  tested, and exclude invitation/admin/break-glass/OIDC/MFA/passkey expansion.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from this docs-only child
  gate, and do not claim runtime password reset is implemented.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/CodeMagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Password reset and recovery policy gate after PR #729

- GitHub state/project status:
  - #336 `OPEN`; Project status readback: `Inbox`.
  - #339 `OPEN`; Project status readback: `Needs Architecture Review`.
- Last verified at main SHA:
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`.
- Verification timestamp:
  `2026-07-06 01:01 HKT` task window.
- Policy gate packet:
  `docs/planning/AUTH_PASSWORD_RESET_RECOVERY_POLICY_GATE.md`.
- Completed PR #729 slice:
  current-account local password change runtime only, merged as PR #729 at
  `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`, with PR head
  `1b1daaa26646adcf3dcc3b7a124c6eb700ae3636`.
- Current-state clarification:
  MFA/passkey/recovery-code foundations, including recovery-code batches and
  verifiers, exist in current repo state, but they are not general password
  reset tokens and must not be reused as password reset, first-owner recovery,
  or admin reset authority without a separate auth/security design.
- Remaining gates:
  user-initiated password reset, first-owner/break-glass recovery,
  owner/admin reset or change for another local user, invitation/public
  registration credential creation, OIDC/passkey/MFA interaction policy,
  password-change UI, user-facing security notifications, reset/recovery abuse
  and rate-limit policy, and final auth/security acceptance remain incomplete.
- Recommended next posture:
  runtime remains blocked pending manual decisions. The smallest next safe
  child is a docs-only decision gate for Day 1 local password reset delivery
  and token policy before any schema/OpenAPI/runtime/UI work.
- Issue posture:
  keep #336 and #339 open. Do not close either issue from PR #729 or this
  docs-only packet.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, auth/session/security
  enforcement, credential/session/token issuance, password hashing, reset/
  recovery/admin credential runtime, invitation/public-registration runtime,
  notification runtime, mobile/web/admin UI, provider delivery, deployment/
  Docker/CI/CodeMagic/TestFlight behavior, secrets/config/env, money/
  settlement/payment/bill/OCR/storage/sync/import/export/backup/restore/
  reconciliation behavior, issue closure, or Project fields.

### Issues #336/#339 - Current-account password change runtime slice

- GitHub state/project status:
  - #336 `OPEN`; keep open as the broad auth/session/runtime security epic.
  - #339 `OPEN`; keep open because password reset, recovery, admin reset,
    credential lifecycle UX, abuse controls beyond existing sign-in policy,
    and UI/Figma scope remain incomplete.
- Last verified at main SHA:
  `c4e042bddcc27f921914b06a956328998d862fa0`.
- Verification timestamp:
  `2026-07-05 23:44 HKT` task window.
- Completed slice:
  current-account local password change runtime for authenticated bearer
  sessions only, using `POST /api/v1/auth/password/change`, current-password
  verification through the credential workflow boundary, same-password
  rejection, replacement verifier hashing through the approved password hashing
  service, safe auth audit events, current bearer session preserved, and other
  active sessions plus linked refresh-family/refresh credentials revoked where
  supported.
- OpenAPI/generated-client posture:
  the password-change endpoint and request schema are contract-backed, and web
  and Dart generated clients are expected to expose
  `changeCurrentAccountPassword` from generated output only.
- Remaining Day 1 gates:
  password reset, first-owner recovery/break-glass recovery, admin password
  reset/change, invitation/public registration credential flows, user-facing
  security notifications, password-change UI, broader abuse/rate-limit policy,
  and final auth/security acceptance remain incomplete.
- Manual decisions:
  user approved the narrow current-account password-change runtime Option A
  after PR #728 merged. No approval was recorded for reset/recovery/admin/UI/
  notification expansion.
- Issue posture:
  do not close #336 or #339 from this slice alone. Treat this as one completed
  child runtime capability inside #339, not completion of the full password
  reset/change workflow candidate.
- Scope confirmation:
  this checkpoint records a narrow auth/security runtime slice. It does not
  implement password reset, first-owner recovery, break-glass recovery, admin
  password reset/change, invitation acceptance, public registration, OIDC
  password behavior, MFA/passkey runtime changes, notification runtime, mobile/
  web/admin UI, TestFlight, CodeMagic, signing, release, deployment, schema/
  migrations, secrets/config/env changes, money/settlement/payment/bill/OCR/
  storage/sync/import/export/backup/restore/reconciliation behavior, or issue
  closure/project-field automation.

### Notification umbrella remaining gates checkpoint

- GitHub state/project status:
  - #369 `OPEN`; keep open because session-revocation notification runtime is
    `BLOCKED_PENDING_MANUAL_DECISIONS`, and broader Day 1 notification coverage
    remains incomplete.
  - #368 `OPEN`; keep open as the parent notification epic while child/
    umbrella runtime gates remain.
  - #403 `OPEN`; keep open for provider/email/push/preference/delivery-state/
    policy/QA umbrella scope unless future repo evidence proves otherwise.
  - #634 `OPEN`; keep open for push provider/device-token/provider-neutral
    delivery runtime gates.
  - #635 `OPEN`; keep open for admin notification policy API/readout/write/
    update/delete/runtime/UI/provider gates.
  - #371, #570, and #575 `CLOSED`; keep closed unless a concrete regression is
    found.
- Last verified at main SHA:
  `da99be532875feed8adf26c07de2978135d8da85`.
- Verification timestamp:
  `2026-07-05 19:00 HKT` task window.
- Checkpoint:
  `docs/planning/NOTIFICATION_UMBRELLA_REMAINING_GATES_CHECKPOINT.md`.
- Recent PR readback:
  #707, #708, #709, #710, #711, #712, and #713 are merged. PR #713 is the
  latest relevant #369 runtime-readiness decision and merged at
  `da99be532875feed8adf26c07de2978135d8da85`.
- Completed slices:
  #707/#708 recorded #369 remaining event coverage/ledger hygiene; #709
  recorded auth/session/security source decision; #711 recorded session
  revocation source design; #712 recorded session revocation target/event
  design; #713 recorded runtime readiness as
  `BLOCKED_PENDING_MANUAL_DECISIONS`. #710 merged mobile CodeMagic/TestFlight
  visual-test selection hygiene and is not notification umbrella completion.
- Dependency alert posture:
  the 2026-07-05 18:52 HKT npm Dependabot task found `0` live open alerts and
  created no dependency diff or PR; do not invent dependency work from stale
  assumptions.
- Remaining Day 1 gates:
  auth/session/security runtime approval for #369, broader remaining
  notification event-family source states, #403 provider/preference/
  delivery-state/policy scope, #634 push provider/device-token/mobile gates,
  #635 admin policy mutation/readout/runtime/UI/provider gates, and final Day 1
  notification acceptance remain incomplete.
- Manual decisions:
  #369 `security.session_revoked` runtime still needs explicit manual approval
  for the user-facing event, actor self-notification, `auth_session` and
  `authSessionId`, minimal schema/OpenAPI/generated-client boundary, writer
  placement, duplicate/transaction behavior, auth audit correlation, and
  redaction rules.
- Safe next actions:
  Option A prepare the manual approval package for the narrow #369
  `security.session_revoked` runtime gate; Option B keep #369 runtime blocked
  and continue non-security provider/admin planning or other Day 1 lanes;
  Option C create focused issue/PR hygiene comments after this checkpoint
  merges.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, notification writers/
  constants/event handlers, provider sending, provider config/secrets, device-
  token lifecycle, delivery attempts, admin policy mutation/write API, UI/
  Figma, #371 behavior, auth/session/security runtime, login/current-user/
  session middleware/token issuance/revocation endpoints, money/settlement/
  bill/OCR/storage/sync/reconciliation behavior, deployment/CI/Docker/env/
  CodeMagic/TestFlight behavior, secrets, issue closure/reopen, or Project
  fields.

### Issue #369 - Session revocation notification runtime readiness decision

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `8e4178b811354b7fc0377fa2d7955aa26d64bf61`.
- Verification timestamp:
  `2026-07-05 18:32 HKT` task window.
- Runtime readiness packet:
  `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_RUNTIME_READINESS_DECISION_PACKET.md`.
- Decision digest:
  runtime is `BLOCKED_PENDING_MANUAL_DECISIONS`. PR #711 supplied the
  source-state gate for user-initiated current-account per-session revocation,
  and PR #712 supplied the target/event gate recommending
  `security.session_revoked`, `auth_session`, `security.session_revoked.v1`,
  and first-class `authSessionId`, but runtime still needs explicit manual
  auth/security approval and a reviewed schema/OpenAPI/generated-client
  boundary before implementation.
- Smallest future runtime slice if approved:
  one successful API-owned revocation of one non-current session owned by the
  authenticated account, one affected account owner's server-mode profile
  recipient, safe in-app notification only, first-class `authSessionId` target,
  current-user notification re-fetch, and current-account authorized
  auth/session re-fetch. Auth audit remains the security source of truth.
- Remaining manual decisions:
  approve the event as user-facing, approve actor self-notification for this
  exact event, approve `auth_session`/`authSessionId`, approve the minimal
  schema/OpenAPI/generated-client diff, confirm writer placement and
  duplicate/transaction behavior, and confirm audit/redaction rules.
- Out-of-scope posture:
  admin revocation, account-wide revocation, suspicious/replay/session-family
  revocation, current-session sign-out, expiry, denied attempts, credential/
  MFA/passkey/provider changes, provider sending, SMTP/APNs/FCM activation,
  device-token lifecycle, mobile/web/admin UI, #371 broad notification-open/
  deep-link behavior, unrelated notification families, unrelated auth/session
  runtime, money/bill/settlement/OCR/storage/sync/reconciliation behavior,
  Docker/env/deployment/CI/CodeMagic/TestFlight behavior, and secrets remain
  out of scope.
- Future validation posture:
  an approved runtime PR should run docs/scaffold/OpenAPI/client/API validation
  if it includes the expected API/schema/OpenAPI/generated-client changes, plus
  focused source, recipient, self-notification, duplicate, target authorization,
  stale/unauthorized fallback, redaction, read/archive isolation, and provider-
  disabled tests.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, notification writers/
  constants/event handlers, provider sending, provider config/secrets, device-
  token lifecycle, delivery attempts, admin policy mutation/write API, UI/
  Figma, #371 behavior, auth/session/security runtime, login/current-user/
  session middleware/token issuance/revocation endpoints, money/settlement/
  bill/OCR/storage/sync/reconciliation behavior, deployment/CI/Docker/env/
  CodeMagic/TestFlight behavior, secrets, issue closure/reopen, or Project
  fields.

### Issue #369 - Session revocation notification target/event design gate

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `f6cca35aa4b1cab3f692d3c178df552b8e1c464a`.
- Verification timestamp:
  `2026-07-05 18:10 HKT` task window.
- Target/event packet:
  `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_TARGET_EVENT_DESIGN_PACKET.md`.
- Design digest:
  inherits PR #711's source decision: user-initiated current-account
  per-session revocation only, successful API-owned revocation transition only,
  and no runtime authorization granted by this docs packet. The recommended
  future event key is `security.session_revoked`, with subject type
  `auth_session`, versioned contract `security.session_revoked.v1`, and a
  first-class `authSessionId` target for the revoked session row.
- Target/open posture:
  the future notification target is a navigation/reference hint only. Opening
  must re-fetch the notification through the current-user notification API and
  re-fetch the session/security target through current-account authorized
  auth/session APIs. Client-supplied target IDs, push payloads, local cache
  rows, action URLs, copied IDs, and generated-client methods are not
  authorization proof.
- Recipient/content posture:
  only the affected account owner's server-mode profile may receive the first
  slice. Admin/operator/friend/group/bill/settlement/OCR recipients and
  client-provided recipients remain forbidden. Safe content is limited to
  generic security/session title/body/category/severity, timestamp/correlation
  where safe, approved `authSessionId`, bounded device/session display label if
  already authorized by the future session list/detail policy, and normalized
  revocation reason. Raw tokens, token hashes, refresh credentials, password/
  MFA/passkey/provider material, raw IP/user-agent details, unrelated account
  data, and business data remain forbidden.
- Future gates before runtime:
  auth/security manual approval; source endpoint/session authority confirmation;
  `authSessionId` target-reference approval; event/subject constants and writer
  placement; redaction/audit review; schema/OpenAPI/generated-client review if
  any public shape changes; focused source/recipient/target/redaction/read-
  archive/provider-disabled tests; and a separate PR/merge gate.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, delivery attempts, admin policy
  mutation/write API, UI/Figma, #371 behavior, auth/session/security runtime,
  money/settlement/bill/OCR/storage/sync/reconciliation behavior, deployment/
  CI/Docker/env, secrets, issue closure/reopen, or Project fields.

### Issue #369 - Session revocation notification source design gate

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `7649f7da951a417a3a2d0d73edd4fee21bdde3d3`.
- Verification timestamp:
  `2026-07-05 17:50 HKT` task window.
- Source-state packet:
  `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_SOURCE_DESIGN_PACKET.md`.
- Design digest:
  the safest first future auth/session/security notification candidate is
  user-initiated current-account per-session revocation only. The source must
  be the successful API-owned revocation transition for one non-current session
  owned by the authenticated account, with the affected account owner as the
  only recipient. Admin revocation, account-wide revocation, suspicious-session
  revocation, replay/session-family revocation, current-session sign-out,
  credential/MFA/passkey/security-policy events, expiry, denied attempts, and
  generic session-list/status reads remain non-candidates for this first slice.
- Target/redaction posture:
  a future runtime task must choose exactly one safe target shape, such as
  current-account-authorized `authSessionId`, `authAuditEventId`, or a
  security-center target. Raw session tokens, token hashes, refresh tokens,
  raw or unbounded IP/user-agent details, password/MFA/passkey/provider
  material, and unrelated account or business data remain forbidden.
- Future gates before runtime:
  auth-security manual review; auth runtime source endpoint/session authority
  confirmation; target-reference approval; notification event constant and
  writer design; audit and notification redaction review; OpenAPI/schema/
  generated-client review if any API or target shape changes; focused tests;
  and a separate manual auth-security PR/merge gate.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, delivery attempts, admin policy
  mutation/write API, UI/Figma, #371 behavior, auth/session/security runtime,
  money/settlement/bill/OCR/storage/sync/reconciliation behavior, deployment/
  CI/Docker/env, secrets, issue closure/reopen, or Project fields.

### Issue #369 - Auth/session/security notification source decision packet

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `43b9f484ae32963082a529c710491b06efc32aa1`.
- Verification timestamp:
  `2026-07-05 16:05 HKT` task window.
- Decision packet:
  `docs/planning/NOTIFICATION_369_AUTH_SECURITY_SOURCE_DECISION_PACKET.md`.
- Decision digest:
  auth/session/security notifications are not ready for runtime implementation
  from #369 alone. Current auth/session/security runtime has real API-owned
  source states, including session revocation and auth audit foundations, but
  notification event constants, subject types, first-class auth/session/security
  target references, authorized re-fetch route policy, recipient/self-notify
  rules, suppression/bypass posture, and redaction/external-snippet approvals
  remain missing.
- Safest next action:
  create a future manual auth-security design task for exactly one first event
  candidate, preferably explicit current-account per-session revocation
  (`security.session_revoked`) if approved, or keep all auth/security
  notifications blocked. That future task must choose the exact source
  transition, recipient rule, self-notification behavior, target-reference
  shape, subject type, action target, OpenAPI/schema/generated-client boundary,
  redaction class, and validation plan before runtime.
- Issue posture:
  keep #369 open. Keep #368, #403, #634, and #635 open. Keep #371, #570, and
  #575 closed unless a concrete regression or separately approved follow-up is
  found.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, delivery attempts, admin policy
  mutation/write API, UI/Figma, #371 behavior, auth/session/security runtime,
  money/settlement/bill/OCR/storage/sync/reconciliation behavior, deployment/
  CI/Docker/env, secrets, issue closure/reopen, or Project fields.

### Issue #635 - Parent remaining gates decision after #689 closure

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted.
- Last verified at main SHA:
  `8d203a49e9ff9355d78c4d38cd7d28115bb70d36`.
- Verification timestamp:
  `2026-07-05 15:00 HKT`.
- Completed child-chain posture:
  - #684, #685, #686, #687, #688, and #689 are `CLOSED`.
  - PR #704 merged the final acceptance packet for #689 at merge SHA
    `aec099052dbb5125c3160f99d896d8c652dca46c`.
  - PR #705 merged final #689 ledger hygiene at merge SHA
    `8d203a49e9ff9355d78c4d38cd7d28115bb70d36`.
- Related open posture:
  #403, #369, #368, and #634 remain `OPEN` for broader notification/provider,
  event coverage, delivery-state, device-token, and push-provider work.
- Related closed posture:
  #371 remains `CLOSED`; the #635 readout-first chain did not change
  notification-open/deep-link behavior.
- Decision packet:
  `docs/planning/NOTIFICATION_635_PARENT_REMAINING_GATES_DECISION_PACKET.md`.
- Recommendation:
  keep #635 open. #689 closure completes the accepted readout-first child
  chain, but it is not provider sending, admin policy mutation/write API,
  mutation audit, admin/operator UI, user/mobile readout UI, device-token
  provider integration, broader #403/#369/#368/#634 notification-provider
  completion, or future OpenAPI/schema/generated-client expansion.
- Scope confirmation:
  this checkpoint is docs-only and does not change runtime code, API behavior,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  config/secrets, device-token lifecycle, admin policy mutation/write API, UI,
  #371 behavior, money/settlement/bill/OCR/storage/sync/reconciliation
  behavior, deployment/CI/Docker/env, auth/session/security runtime, or
  secrets.

### Issue #689 - Admin notification policy final acceptance

- GitHub state/project status: issue `CLOSED` as completed after PR #704
  merged the final acceptance packet and no reviewer, CI/check, validation, or
  scope blocker remained. Project field mutation was not attempted.
- Last verified at main SHA:
  `aec099052dbb5125c3160f99d896d8c652dca46c` after PR #704.
- Merged PR:
  #704 `docs: add notification policy final acceptance packet` at merge SHA
  `aec099052dbb5125c3160f99d896d8c652dca46c`.
- Reviewed acceptance-packet head:
  `24ae454a9185d39d707208db691f7ef60cdd00ef`.
- Acceptance packet branch:
  `docs/notification-689-final-acceptance-readiness-20260705`, retained at
  `24ae454a9185d39d707208db691f7ef60cdd00ef`.
- Acceptance packet path:
  `docs/planning/NOTIFICATION_689_FINAL_ACCEPTANCE_PACKET.md`.
- Merge-gate report:
  `.codex/reports/settleora-codex-report-20260705-1437-notification-689-final-acceptance-pr704-merge-gate.md`.
- Current PR state: PR #704 `MERGED`.
- Completed prerequisite child posture:
  - #684 `CLOSED`: PR #697 merged the read-only guarded admin notification
    policy readout foundation, EF schema foundation, OpenAPI contract, and
    regenerated web/Dart clients.
  - #685 `CLOSED`: notification policy readout UX reference remains accepted
    as reference-only posture.
  - #686 `CLOSED`: PR #699 merged provider-readiness category/readout-only
    runtime foundation without provider sending/config/secrets.
  - #688 `CLOSED`: PR #701 merged focused current readout/provider-readiness
    redaction coverage.
  - #687 `CLOSED`: PR #702 merged the narrow API/domain notification decision
    policy resolver foundation; PR #703 recorded final ledger closure.
  - #371, #570, #575, #672, and #679 remain `CLOSED` unless a concrete
    regression or approved follow-up changes that posture.
- Acceptance result:
  #689 is closed as completed for the approved readout-first final acceptance
  scope after PR #704 merged, required local validation passed, GitHub checks
  passed on the exact reviewed head, and no reviewer/comment/scope blocker was
  found.
- #635 recommendation:
  keep #635 open. The final acceptance packet closes #689, but parent #635
  still has broader future gates and no unambiguous parent close authorization
  was found in issue body/comments.
- Related open posture:
  keep #403, #369, #368, and #634 open for broader notification/provider,
  event coverage, delivery-state, device-token, and push-provider work unless a
  separate approved close packet satisfies their close rules.
- Remaining future gates outside #689 close scope:
  admin policy mutation/write API, mutation audit, admin/user/mobile UI or
  Figma, provider sending/config/secrets/SMTP/APNs/FCM activation, device-token
  provider integration, delivery-attempt/outbox behavior, and any future
  OpenAPI/schema/generated-client expansion beyond the existing read-only
  endpoint.
- Scope confirmation:
  this acceptance packet is docs-only and does not change runtime code,
  OpenAPI, generated clients, schema/migrations, provider sending, provider
  secrets/config, device-token lifecycle, admin policy mutation API, UI,
  #371 notification-open/deep-link behavior, money/settlement/bill/OCR/storage/
  sync/reconciliation behavior, deployment/CI/Docker/env, auth/session runtime,
  or secrets.

### Issue #684 - Admin notification policy schema and API implementation

- GitHub state/project status: issue `CLOSED` as completed after PR #697
  merged the approved readout-first schema/API boundary.
- Last verified at main SHA:
  `b9363ab7fc8c61910f540c4c22ba94966c72b96b`.
- Merged PR:
  #697 `feat(api): add admin notification policy readout foundation` at merge
  SHA `b9363ab7fc8c61910f540c4c22ba94966c72b96b`.
- Reviewed implementation head:
  `7dae261253ee728c081337e1551720eb9e903a0d`.
- Implementation branch:
  `feature/notification-684-policy-runtime-readout-first-20260704`, retained
  at `7dae261253ee728c081337e1551720eb9e903a0d`.
- Completed merged slice:
  - Added the first read-only server-authoritative admin/global notification
    policy readout foundation.
  - Added EF schema/migration foundation for
    `notification_global_policies` and
    `notification_event_policy_overrides` with bounded category fields,
    restrictive relationships, explicit constraints, and no provider secrets,
    provider config values, raw device tokens, provider payloads, raw OCR text,
    storage internals, payment details, private notes, hidden bill data, or
    auth/session token material.
  - Added guarded `GET /api/v1/admin/notification-policy` for authenticated
    system owner/admin callers only; ordinary users are forbidden.
  - Updated OpenAPI and regenerated web/Dart generated clients for the
    read-only endpoint only.
  - Added redaction/category normalization and focused schema/API tests proving
    bounded categories and forbidden-field absence.
- Remaining gates:
  - Admin write/update/delete policy API remains not implemented.
  - #687 resolver runtime wiring remains future work after this accepted
    persistence/contract slice.
  - #686 provider readiness runtime remains readout/category-only and does not
    activate SMTP/APNs/FCM or provider sending.
  - #688 remains open unless reviewers decide this helper/test foundation fully
    satisfies its approved close rule; current recommendation is keep open for
    mutation audit and broader resolver/provider redaction coverage.
  - #635 and #689 remain open; final acceptance is not ready.
- Close/keep-open recommendation:
  keep #684 closed as completed for the readout-first schema/API boundary.
  Keep #635, #686, #687, #688, #689, #403, #369, #368, and #634 open until
  each remaining issue's close rule is satisfied. Keep #685, #371, #570, #575,
  #672, and #679 closed unless a separate concrete approved regression exists.

### Issue #672 - Mobile Flutter V1 visual parity implementation slices

- GitHub state/project status: issue `OPEN`; Project field mutation was not
  attempted by this implementation task.
- Last verified at main SHA:
  `914d1fe0a7ed42f4ce1f193db518b7ddc047d2c8` after PR #678 and before the
  `docs/mobile-672-followup-split-close-20260703` docs/control close handoff.
- Last child-slice checkpoint at base main SHA:
  `154ed6787e1cb1b7f06fd1310ddeff724bd7b886` for branch
  `feature/mobile-shell-home-more-profile-parity-672-20260702`.
- Created by branch:
  `feature/mobile-shared-visual-foundation-20260702`.
- Scope:
  - Tracks shared component foundation plus shell/Home/More,
    bills/OCR/revision, and groups/settle/notifications visual parity work
    against merged mobile references.
  - #371 remains closed and must not be redone without a concrete regression.
  - Mobile visual parity only; no backend/API/OpenAPI/generated-client/schema,
    money, storage, auth runtime, notification-open, TestFlight/App Store, or
    deployment changes are authorized by this issue.
- Current slice:
  - First shared Flutter visual foundation implementation slice adds shared
    visual primitives and migrates low-risk profile/settings-adjacent private
    visual shells without changing repository calls, navigation, actions,
    state handling, auth/session behavior, payment-detail authority, money,
    storage, OpenAPI, generated clients, schema, or backend behavior.
  - Tommy manually rejected the first profile/shared-foundation visual evidence
    from `20260702-2204-mobile-shared-visual-foundation` as
    `VISUAL_REJECTED_THEME_MISMATCH` because the capture still looked like a
    generic warm/light Material screen with beige canvas, white cards, a blue
    info panel, and orange/blue icons.
  - The `20260702-2224` follow-up adds an explicit `Settleora Midnight` shared
    token preset and regenerates the profile/shared-foundation proof against
    the approved dark More/Profile reference language. It does not switch the
    global app default theme, add runtime theme selection, or change profile
    repository/action behavior.
  - Tommy manually reviewed the corrected `20260702-2224` visual evidence at
    `/workspace/logs/settleora-visual-qa/20260702-2224-mobile-shared-visual-foundation-theme-correction/profile-shared-visual-foundation-390x844.png`
    and approved this shared visual foundation slice as
    `VISUAL_APPROVED_WITH_FOLLOWUPS`. This approval keeps the first warm/beige
    visual evidence rejected, does not approve full app visual parity, and does
    not authorize silently switching the entire runtime app default theme.
  - The Shell/Home/More/Profile child slice on branch
    `feature/mobile-shell-home-more-profile-parity-672-20260702` migrates the
    live authenticated shell first-impression surfaces toward the approved
    Settleora Midnight references by using shared bottom-sheet/dialog frames,
    shared list rows, inline panels, money chips, status chips, and tokenized
    shell card styling for Home, attention/readout cards, More/settings rows,
    data-safety preview shells, and profile/payment evidence. It preserves the
    current global app default theme because a true selectable preset/runtime
    theme system remains future work, and switching the full app default would
    affect unrelated Bills, Groups, Settle, Notifications, OCR, recurring, and
    report routes outside this child slice.
  - Fresh visual evidence for the Shell/Home/More/Profile slice was generated
    under
    `/workspace/logs/settleora-visual-qa/20260702-2258-mobile-shell-home-more-profile-parity/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, and `profile-payment-390x844.png`. This evidence
    was manually reviewed as
    `VISUAL_REVIEW_NEEDS_FOLLOWUP_BOTTOM_NAV_OVERLAP` because the Home
    attention and More hub captures showed content clipped at the persistent
    bottom nav boundary.
  - The `20260702-2323` visual follow-up on the same branch increases shell
    scroll bottom padding and updates the focused visual evidence harness to
    capture Home attention, More lower sections, and Profile/payment content
    only when the target content clears the bottom nav or viewport boundary.
    Fresh follow-up evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260702-2323-mobile-shell-home-more-profile-visual-followup/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, and `profile-payment-390x844.png`. This evidence
    is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR should be opened before explicit
    visual approval.
  - Tommy reviewed the `20260702-2323` refreshed Home/More/Profile evidence and
    requested that the settings/config-like content not live directly under the
    More root. The `20260702-2336` development follow-up on the same branch
    keeps More as a concise hub by moving notification preference controls,
    delivery timing readouts, local/server mode authority readouts, sync/security
    required readouts, unsupported appearance/theme readouts, and local
    backup/import-preview controls behind an App settings detail route/surface.
    Root More now keeps only grouped navigation/readout rows for Account,
    Security and privacy, App, Activity and records, and Data and sync. Fresh
    development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260702-2336-mobile-shell-more-settings-hub-followup/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`, and
    `profile-payment-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval is deferred.
  - The `20260703-0012` development polish pass on the same branch rechecked
    that the root More tab remains a concise grouped hub with navigation/readout
    rows only, then tightened the App settings data-safety section by composing
    the local backup and generated-backup preview readouts with shared
    `SettleoraSection`, `SettleoraInlinePanel`, and
    `SettleoraKeyValueText` primitives. It preserved notification preference
    behavior, local backup/import-preview behavior, unsupported appearance
    readouts, product copy, profile/payment repository calls, QR metadata
    behavior, and the global runtime app default theme. Fresh development
    evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-0012-mobile-shell-settings-profile-polish-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`, and
    `profile-payment-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval is deferred.
  - The `20260703-0018` development-only setup/sign-in/settings polish pass on
    the same branch started from remote head
    `f572cf9b591c33b9ba8df0fc14799e151797b788` and keeps the exact pushed
    branch head in the matching Codex report and #672 issue comment because the
    no-amend rule prevents recording a commit's own SHA inside the same commit.
    This pass composes setup and sign-in with shared Settleora cards, compact
    headers, inline/readout panels, and the existing Midnight visual evidence
    theme while preserving setup choices, server URL validation, sign-in
    validation, loading/error states, auth/session repository calls, change
    server behavior, and server/local authority copy. It also regenerates the
    existing shell/settings/profile evidence and adds setup/sign-in captures
    under
    `/workspace/logs/settleora-visual-qa/20260703-0018-mobile-setup-signin-settings-polish-dev-only/`
    with `setup-mode-390x844.png`, `sign-in-390x844.png`,
    `home-shell-390x844.png`, `more-hub-390x844.png`,
    `more-settings-390x844.png`, and `profile-payment-390x844.png` plus the
    existing `home-attention-390x844.png` capture. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval remains deferred.
  - The `20260703-1046` development-only follow-up on the same branch started
    from remote head `ef062fe2a5bbfb03d7b8edd66df636a357e1a099` and addresses
    Tommy's payment-profile copy, local-backup copy, and authenticated-shell
    top-right action feedback. It keeps the existing profile/payment detail
    model, QR metadata behavior, payment-detail visibility posture,
    notification center routing/readout behavior, local backup/import-preview
    authority boundaries, sign-out/session-management behavior, global runtime
    app default theme, and all API/OpenAPI/generated-client/schema/backend
    boundaries unchanged. Fresh development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1046-mobile-shell-profile-copy-nav-followup-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`,
    `profile-payment-390x844.png`, `setup-mode-390x844.png`, and
    `sign-in-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; no PR or merge has been performed, and
    manual visual approval remains deferred.
  - The `20260703-1110` development-only follow-up on the same branch started
    from remote head `b6088e707b4a75359fc8d780f8862eac5c3d1358` and addresses
    Tommy's Home duplicate bell cleanup plus setup/sign-in copy simplification.
    It keeps notification center routing/readout behavior, setup choices,
    server URL validation, local/server mode behavior, sign-in validation,
    auth/session repository calls, More/App settings/Profile payment accepted
    areas, the global runtime app default theme, and all
    API/OpenAPI/generated-client/schema/backend boundaries unchanged. Fresh
    development evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1110-mobile-shell-home-setup-signin-copy-followup-dev-only/`
    with `home-shell-390x844.png`, `home-attention-390x844.png`,
    `more-hub-390x844.png`, `more-settings-390x844.png`,
    `profile-payment-390x844.png`, `setup-mode-390x844.png`, and
    `sign-in-390x844.png`.
  - Tommy manually reviewed the `20260703-1110` Shell/Home/More/App
    settings/Profile/Setup/Sign-in evidence and approved this bounded child
    slice as `VISUAL_APPROVED_WITH_FOLLOWUPS`. This approval is only for the
    bounded Shell/Home/More/App settings/Profile/Setup/Sign-in visual parity
    child slice under #672. It does not approve full mobile visual parity, does
    not close #672, does not approve Bills/OCR/revision visual parity, does not
    approve Groups/Settle/Notifications visual parity, and does not authorize
    runtime theme switching or a theme picker.
  - PR/merge gate started from reviewed source head
    `d45c7fdd2f752f696a791fc653fa237324763737` on branch
    `feature/mobile-shell-home-more-profile-parity-672-20260702`, with starting
    `origin/main` expected at
    `154ed6787e1cb1b7f06fd1310ddeff724bd7b886`. #672 remains open during and
    after this gate.
  - PR #674 merged the bounded Shell/Home/More/App settings/Profile/Setup/
    Sign-in visual parity child slice to `main` at
    `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`. This approval remains limited
    to that child slice and does not approve full mobile visual parity,
    Bills/OCR/revision visual parity, Groups/Settle/Notifications visual
    parity, runtime theme switching, or theme picker/persistence.
  - The `20260703-1208` development-only Bills/OCR/revision visual parity
    child slice on branch
    `feature/mobile-bills-ocr-revision-visual-parity-672-20260703` started
    from `origin/main` at `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`.
    Completed scope is presentation-only migration of selected high-visibility
    existing Bills/OCR/revision surfaces toward the approved Settleora Midnight
    direction: shared state/loading/sync panels in bills, shared card/header/
    key-value/inline panels for bill revision review and proposal editor
    shells, and shared OCR review queue card/error treatment. It also adds
    focused visual evidence capture for reachable OCR queue/detail and bill
    revision review/proposal surfaces. It preserves bill repositories,
    attachment/OCR review request construction, OCR apply/preview behavior,
    bill revision lifecycle behavior, settlement/payment/money authority,
    storage/file-byte behavior, API/OpenAPI/generated-client/schema/backend
    boundaries, #371 notification-open behavior, and the global runtime app
    default theme.
  - Fresh development evidence for the Bills/OCR/revision slice was generated
    under
    `/workspace/logs/settleora-visual-qa/20260703-1208-mobile-bills-ocr-revision-visual-parity-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
    Validation passed: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/bill_revision_review_screen_test.dart
    test/bill_revision_proposal_editor_screen_test.dart
    test/receipt_ocr_review_screen_test.dart`,
    `flutter test test/ui/bills_ocr_revision_parity_visual_capture_test.dart`,
    and full `flutter test` with 810 passing tests.
  - Tommy reviewed the `20260703-1208` Bills/OCR/revision visual evidence and
    blocked it for follow-up because the OCR review queue/listing looked too
    plain, listing cards did not expose enough important amount/date/status/
    source/line-count style context where available, and the pages still felt
    too far from the approved Bills/OCR/revision references. The
    `20260703-1248` dirty recovery on the same branch inspected and salvaged
    the failed `20260703-1238` development-only follow-up. It keeps the
    scope presentation-only and increases product readout density in the
    existing OCR queue/detail and bill revision review/proposal screens. OCR
    queue cards now show merchant, status, personal/group scope, source,
    line count, currency when exposed by the queue summary, updated date, and
    a `Review receipt` action. OCR detail now promotes merchant, grand total
    plus currency, receipt date, source, status, readiness, totals, and line
    quantity/unit/line-total readiness into stronger cards. Bill revision
    review/proposal now promote total/currency/status, viewer and payer deltas,
    participant/payer counts, and server-validation posture. The queue summary
    model still does not expose receipt date or total amount, so those values
    are only shown on the detail surface where available. Fresh follow-up
    recovery evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1248-mobile-bills-ocr-revision-info-density-followup-recovery/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This evidence is
    `DEV_FOLLOWUP_READY_NOT_APPROVED`; the previous failure was report/export
    compaction after validation, not a validation failure. No PR or merge has
    been performed.
  - Tommy reviewed the latest Bills/OCR/revision evidence and rejected it as
    `VISUAL_REJECTED_UX_FLOW_AND_INFORMATION_HIERARCHY` because the OCR queue
    still read like metadata-chip collections, the detail/review/proposal
    surfaces exposed technical facts without enough user journey, and the first
    viewport did not make attention, amount/change, next action, or blocked
    state obvious enough. The `20260703-1320` development-only follow-up on
    branch `feature/mobile-bills-ocr-revision-visual-parity-672-20260703`
    started from head `b158c4641556bfcc3c56d90abd847a0bd3e3a15a` and keeps the
    scope presentation-only. OCR queue cards now lead with merchant/scope,
    review reason, checkpoint count, receipt source/line/currency metadata,
    updated date, and one primary `Review receipt` action. OCR detail now leads
    with receipt total/context and a preview/apply attention panel before the
    lower structured totals and line review. Bill revision review now leads
    with a decision panel for what changed, viewer share delta, payer impact,
    and available/blocked next action. The proposal editor now starts with a
    guided proposal overview, participant/payer summary, and short save
    consequence copy. No OCR extraction/runtime, apply behavior, money/split/
    settlement logic, API/OpenAPI/generated-client/schema, auth/session/
    security, storage/file-byte, notification-open, deployment, or runtime theme
    behavior changed. Fresh evidence was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1320-mobile-bills-ocr-revision-ux-density-followup-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. The captures are nonblank and do not
    show content hidden under bottom navigation. Validation passed after a
    focused OCR detail copy fix: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/bill_revision_review_screen_test.dart
    test/bill_revision_proposal_editor_screen_test.dart
    test/receipt_ocr_review_screen_test.dart`,
    `flutter test test/ui/bills_ocr_revision_parity_visual_capture_test.dart`,
    and full `flutter test` with 810 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
  - Tommy reviewed the `20260703-1320` Bills/OCR/revision evidence and found
    the direction improved but not PR-ready because OCR queue/review still felt
    too system-like, queue cards needed clearer receipt/action/value hierarchy,
    and revision/proposal copy still had backend/server wording. The
    `20260703-1348` development-only follow-up on the same branch keeps the
    scope presentation-only and makes the first viewport friendlier: OCR queue
    cards now use product-facing receipt source, detected currency or total-not-
    confirmed, line count, last-updated, action-needed, and `Review receipt`
    labels; OCR detail uses `Preview changes`, `Draft update`, and
    apply-to-draft copy without server-preview wording; revision review avoids
    raw revision IDs in the first header and emphasizes `Your share changes by`
    plus `Payer needs confirmation`; proposal save copy says saving sends the
    proposal for review and does not change the bill yet. No OCR extraction/
    runtime, apply behavior, money/split/settlement logic, API/OpenAPI/
    generated-client/schema, auth/session/security, storage/file-byte,
    notification-open, deployment, or runtime theme behavior changed. Fresh
    evidence is expected under
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`
    with the same four OCR/revision PNG artifacts. This checkpoint is
    `READY_FOR_TOMMY_VISUAL_REVIEW` after validation and push; no PR or merge
    is part of this dev-only task.
  - Tommy/Assistant manually approved the `20260703-1348` Bills/OCR/revision
    evidence for this bounded child slice as `VISUAL_APPROVED_WITH_FOLLOWUPS`.
    The reviewed source head before approval checkpoint is
    `a9dfa1a5d1b4901976a962bbfc1c4dfbefa73930` on branch
    `feature/mobile-bills-ocr-revision-visual-parity-672-20260703`. Approved
    evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`
    with `ocr-review-queue-390x844.png`, `ocr-review-detail-390x844.png`,
    `bill-revision-review-390x844.png`, and
    `bill-revision-proposal-390x844.png`. This approval is limited to the
    bounded Bills/OCR/revision visual parity child slice under #672. It does
    not close #672 and does not approve full mobile Flutter visual parity,
    broader bills list/detail/create parity, saved OCR in-bill detail beyond
    current touched surfaces, OCR capture/processing states, advanced
    tax/discount/fee/refund review runtime, groups/settle/notifications
    parity, runtime theme selection/persistence, backend/API/OpenAPI/
    generated-client/schema/money/storage/security/OCR runtime changes, or
    #371 notification-open/deep-link redo. Known non-blocking follow-ups:
    `Action needed: needs review.` can become friendlier copy later, proposal
    total-lower helper copy can avoid backend-ish validation wording in a
    future copy pass, and full bills list/detail/create parity remains a later
    child slice.
  - The `20260703-1422` development-only Groups/Settle/Notifications visual
    parity child slice on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27` after PR #675. Completed scope
    is presentation-only migration of existing Groups, Settle, and
    Notifications runtime surfaces toward the approved Settleora Midnight
    direction: shared list rows and cards for group/member readouts, clearer
    settlement balance/request/payment/detail hierarchy using existing loaded
    values only, and shared card/bottom-sheet treatment for notification list
    and detail readouts. It preserves group repositories/actions, settlement
    payment/proof/status authority and money calculations, notification open/
    deep-link behavior from #371, push/provider/admin/global policy states,
    API/OpenAPI/generated-client/schema/backend boundaries, auth/session/
    security behavior, storage/file-byte behavior, deployment, and the global
    runtime app default theme.
  - Fresh development evidence for the Groups/Settle/Notifications slice was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1422-mobile-groups-settle-notifications-visual-parity-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. All captures are 390x844 PNGs,
    nonblank, and generated with `SettleoraTheme.midnight()`. Validation
    passed: `npm ci`, `npm run validate:docs`,
    `npm run validate:scaffold`, `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/group_list_screen_test.dart
    test/settlement_list_screen_test.dart test/notification_screen_test.dart`,
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`,
    and full `flutter test` with 811 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed.
    Project fields were not mutated.
  - Tommy manually reviewed the `20260703-1422` Groups/Settle/Notifications
    evidence and rejected it as not PR-ready because Notifications felt too
    wordy/debug-like, several screens still felt difficult for normal public use,
    and visible backend/API/architecture-style explanations remained in normal
    UI. The `20260703-1550` development-only UX simplification follow-up on
    branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from previous branch head
    `9a7755d6d035fd3c88b19ff847b8939df5e2ea48` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps the scope presentation-only and simplifies public-facing copy and
    hierarchy: notification center/detail now use concise product sections such
    as Inbox, Unread, Needs attention, Review, What happened, What you can do,
    Status, Linked item, and Safety note; Groups now emphasizes accessible
    groups, search, role, status, and membership status without route/dashboard
    authorization explanations; Settlements now emphasizes You owe/You're owed,
    remaining amount, pending payments, and plain next actions. It preserves
    notification list/filter/read/archive/restore/mark-read behavior and #371
    open/deep-link behavior, group list/detail/create/member actions and
    repository behavior, settlement state authority, payment/proof workflows,
    repository calls, money calculations, API/OpenAPI/generated-client/schema,
    auth/session/security runtime, storage/file-byte behavior, deployment, and
    the global runtime app default theme.
  - Fresh UX simplification evidence for the Groups/Settle/Notifications slice
    was generated under
    `/workspace/logs/settleora-visual-qa/20260703-1550-mobile-groups-settle-notifications-ux-simplification-dev-only/`
    with `groups-list-or-dashboard-390x844.png` (61037 bytes),
    `settle-dashboard-or-list-390x844.png` (73589 bytes),
    `settlement-detail-or-payment-390x844.png` (75112 bytes),
    `notifications-center-390x844.png` (66624 bytes), and
    `notification-detail-or-review-390x844.png` (76436 bytes). All captures are
    390x844 PNGs and generated with `SettleoraTheme.midnight()`. Validation
    passed: `npm ci`, `npm run validate:docs`, `npm run validate:scaffold`,
    `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/group_list_screen_test.dart
    test/settlement_list_screen_test.dart test/notification_screen_test.dart`,
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`,
    and full `flutter test` with 811 passing tests. The existing test harness
    warning about unspecified tag `visual` on the guardrail helper test remains
    non-fatal. This evidence is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge
    has been performed. Project fields were not mutated.
  - Tommy reviewed the `20260703-1550` evidence and said the Notifications
    Center/detail still felt compressed and not convenient enough for normal
    public users, while Groups and Settlements were acceptable enough for now.
    The `20260703-1714` development-only density follow-up on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from previous branch head
    `7fe79a3f3a79eb9a0670adbc6bd80af5f9dfb803` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps scope to Notifications UI/test evidence and the ledger: Notification
    Center cards now use a roomier vertical layout with full-width title/message
    treatment, one clear primary action where a typed target can open, and
    quieter top-right secondary inbox actions; the visible bulk-read control is
    a compact inline row instead of a large boxed panel. The notification
    detail sheet now prioritizes `What happened`, `What you can do`,
    `Linked item`, and `Safety note` instead of dense key-value/debug-style
    status rows, and uses concise safety copy: `We recheck access before
    opening details.` It preserves notification list/filter/read/archive/
    restore/mark-read behavior, #371 notification-open/deep-link behavior,
    notification runtime/provider/push/email/admin/global policy semantics,
    API/OpenAPI/generated-client/schema, auth/session/security runtime,
    settlement/payment/money authority, storage/file-byte behavior,
    deployment, and the global runtime app default theme.
  - Fresh density follow-up evidence for the notification-focused pass was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1714-mobile-notifications-center-density-followup-dev-only/`
    with the grouped visual-capture harness artifacts
    `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. The follow-up scope was
    Notifications Center/detail only; Groups/Settlements were regenerated for
    visual continuity and were not intentionally redesigned. All captures are
    390x844 PNGs and generated with `SettleoraTheme.midnight()`. Focused
    validation during implementation passed:
    `flutter test test/notification_screen_test.dart` with 64 passing tests and
    `flutter test test/ui/groups_settle_notifications_parity_visual_capture_test.dart`
    with 1 passing test. Full required validation is recorded in the matching
    Codex report. This evidence is `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or
    merge has been performed. Project fields were not mutated.
  - Tommy reviewed the `20260703-1714` continuity evidence and requested a
    public-user UX polish pass focused on Groups and Settlements while leaving
    the improved Notifications Center alone unless required for continuity.
    The `20260703-1745` development-only polish pass on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`
    started from expected branch head
    `96caaf1b455983c611775a1d6af3128ebbbd7b99` with `origin/main` at
    `51fb0baeed84586e5ef44e53c4a407966ac45f27`. It keeps scope to Groups,
    Settlements, visual-capture continuity, focused tests, and this ledger:
    group cards now use product-facing phrases such as `You are the owner`,
    `You are a member`, `Active group`, and `Removed from new activity` while
    preserving role/status chips and existing search/filter behavior. The
    settlement dashboard keeps server-provided balance fields but prioritizes
    `Remaining`, `Pending payments`, and `Paid`, moving low-frequency residual
    readouts into calmer chips and replacing stale/technical refresh copy with
    `Refresh if anything looks out of date.` Settlement detail sections now
    emphasize `Next step`, `What this includes`, `Included bills`, and
    `Payment details`, fix the singular grammar to `1 needs confirmation`, and
    use friendlier safety copy before settlement actions. This pass does not
    change settlement calculations, payment workflow, proof authorization,
    group membership/runtime permissions, repository calls, API/OpenAPI/
    generated-client/schema, notification-open/deep-link #371 behavior,
    notification runtime/provider/push/email/admin/global policy semantics,
    auth/session/security runtime, storage/file-byte behavior, deployment,
    or the global runtime app default theme.
  - Fresh UX polish evidence for the Groups/Settle pass is generated by the
    grouped visual-capture harness under
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. The notification artifacts are
    continuity-only unless the final report states otherwise. All captures use
    `SettleoraTheme.midnight()`. Final validation and the final commit SHA are
    recorded in the matching Codex report. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR or merge has been performed. Project
    fields were not mutated.
  - Tommy manually reviewed the `20260703-1745` Groups/Settle/Notifications
    evidence and approved this bounded child slice as
    `VISUAL_APPROVED_WITH_SMALL_FOLLOWUPS`. The approved source head before the
    PR/merge approval checkpoint is
    `2b842fe868ba9d40c98f775c9d9ffa3436a85ae4` on branch
    `feature/mobile-groups-settle-notifications-visual-parity-672-20260703`.
    Approved evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`
    with `groups-list-or-dashboard-390x844.png`,
    `settle-dashboard-or-list-390x844.png`,
    `settlement-detail-or-payment-390x844.png`,
    `notifications-center-390x844.png`, and
    `notification-detail-or-review-390x844.png`. Known non-blocking visual
    follow-ups are notification detail safety note / received timestamp spacing
    polish and hiding zero-value settlement chips when they are not useful.
    This approval is limited to the bounded Groups/Settle/Notifications visual
    parity child slice under #672. It does not close #672, does not approve
    full mobile Flutter visual parity, and does not authorize backend/API/
    OpenAPI/generated-client/schema, auth/session/security runtime, storage/
    file-byte, settlement money/state authority, payment workflow, proof
    authorization, group membership/runtime permissions, notification runtime/
    provider/push/email/admin/global policy semantics, #371 notification-open/
    deep-link redo, deployment, runtime theme default switching, theme picker,
    theme persistence, or Figma API changes.
  - The `20260703-1830` development-only Bills list/detail/create visual parity
    child slice on branch
    `feature/mobile-bills-list-detail-create-visual-parity-672-20260703`
    started from `origin/main` at
    `6cd629dd8265b8f5dadce636beed51729126e13b`. The no-amend rule prevents
    recording this commit's own final SHA inside the same ledger commit, so the
    final task branch head is recorded in the matching Codex report. This pass
    keeps scope presentation-only and improves the current Flutter Bills
    first-viewport hierarchy: the personal Bills list now opens with a
    `Bills dashboard` card, bill counts, review/archive state, clearer primary
    create/scan actions, and bill summary rows that emphasize amount, status,
    next step, and honest loaded metadata. Bill detail now leads with a
    next-step panel for items, people, and payers before the existing loaded
    bill details, and create-bill/saved-receipt OCR copy now uses product-facing
    review language without changing receipt apply behavior. This pass also
    updates reachable saved OCR-in-bill readouts and focused tests for the
    affected list/detail/create surfaces. It preserves bill repositories,
    routing, archive/restore behavior, saved OCR review/open/apply behavior,
    OCR extraction/runtime, receipt storage/file-byte behavior, money/split/
    settlement/payment authority, bill status transitions, API/OpenAPI/
    generated-client/schema/backend boundaries, auth/session/security runtime,
    deployment, and the global runtime app default theme.
  - Fresh Bills list/detail/create evidence for the `20260703-1830` slice was
    generated under
    `/workspace/logs/settleora-visual-qa/20260703-1830-mobile-bills-list-detail-create-visual-parity-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. All captures are nonblank 390x844
    PNGs generated with `SettleoraTheme.midnight()`. Validation passed:
    `npm ci`, `npm run validate:docs`, `npm run validate:scaffold`,
    `flutter pub get`, `flutter analyze`,
    `flutter test test/ui/settleora_component_guardrail_test.dart`,
    `flutter test test/bill_list_screen_test.dart`,
    `flutter test test/group_bill_list_screen_test.dart`,
    `flutter test test/server_mode_shell_dashboard_test.dart --name "bottom nav switches from bill detail to Groups"`,
    `flutter test test/ui/mobile_bills_list_detail_create_parity_visual_capture_test.dart`,
    and full `flutter test` with 812 passing tests. This evidence is
    `READY_FOR_TOMMY_VISUAL_REVIEW`; no PR, merge, or push has been performed.
    Project fields were not mutated. #672 should remain open for review,
    explicit PR/merge gates for approved child slices, remaining OCR capture/
    processing and advanced receipt review polish, future spacing/rhythm
    follow-ups, and any runtime/payment/storage/money/OCR/theme gates. #371
    remains closed and was not touched or reopened.
  - Tommy reviewed the `20260703-1830` Bills list/detail/create evidence and
    rejected it as not PR-ready because the create-bill sticky `Save bill`
    footer sat too close to the item form area, the Bills dashboard filter copy
    still sounded implementation-facing, and the Bills app bar showed
    duplicate-looking sync/refresh affordances. The `20260703-1840`
    development-only follow-up continues the same local task branch from
    `54777034412d40b6eac9d845a7bf806333661dbd`, keeps the existing bill detail
    and saved OCR review surfaces stable, increases create-bill scroll bottom
    padding with focused visual/test coverage for sticky-footer clearance,
    shortens the Bills dashboard filter copy to product-facing language, and
    keeps one app-bar refresh action while preserving the existing Sync queue
    panel `Sync` action. Fresh follow-up evidence is generated under
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`,
    `bill-create-items-safe-footer-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. Final validation, final branch head,
    and push status are recorded in the matching Codex report. #672 should
    remain open for Tommy visual review and any explicit PR/merge gate. #371
    remains closed and was not touched or reopened.
  - Tommy/Assistant manually approved the `20260703-1840` Bills
    list/detail/create follow-up evidence for this bounded child slice as
    `VISUAL_APPROVED_WITH_FOLLOWUPS`. The reviewed source head before this
    approval checkpoint is `a4a6489db934d5a0c23a5073292e33ec78a21e6e` on
    branch `feature/mobile-bills-list-detail-create-visual-parity-672-20260703`.
    Approved evidence is under
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`
    with `bills-list-or-dashboard-390x844.png`,
    `bill-detail-390x844.png`, `bill-create-or-edit-390x844.png`,
    `bill-create-items-safe-footer-390x844.png`, and
    `bill-saved-ocr-readout-390x844.png`. This approval is limited to the
    bounded Bills list/detail/create visual parity child slice under #672. It
    does not close #672, does not approve full mobile Flutter visual parity,
    OCR capture/processing states, advanced tax/discount/fee/refund review
    runtime, future spacing/rhythm follow-ups, runtime theme switching, theme
    picker/persistence, backend/API/OpenAPI/generated-client/schema/money/
    storage/security/OCR runtime changes, or #371 notification-open/deep-link
    redo.
- Post-PR #677 audit checkpoint:
  - GitHub readback on 2026-07-03 HKT verified #672 remains `OPEN`, #371
    remains `CLOSED`, and PRs #673, #674, #675, #676, and #677 are merged.
  - PR #673, merge SHA `154ed6787e1cb1b7f06fd1310ddeff724bd7b886`,
    completed the shared mobile visual foundation slice with approved evidence
    at
    `/workspace/logs/settleora-visual-qa/20260702-2224-mobile-shared-visual-foundation-theme-correction/`.
  - PR #674, merge SHA `fd5719cec82f8ea44c3f7af857cba904a34b6ad2`,
    completed the Shell/Home/More/App settings/Profile/Setup/Sign-in visual
    parity slice with approved evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1110-mobile-shell-home-setup-signin-copy-followup-dev-only/`.
  - PR #675, merge SHA `51fb0baeed84586e5ef44e53c4a407966ac45f27`,
    completed the Bills/OCR/revision visual hierarchy slice with approved
    evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1348-mobile-bills-ocr-revision-friendly-polish-dev-only/`.
  - PR #676, merge SHA `6cd629dd8265b8f5dadce636beed51729126e13b`,
    completed the Groups/Settle/Notifications visual hierarchy slice with
    approved evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1745-mobile-groups-settle-ux-polish-dev-only/`.
  - PR #677, merge SHA `0a29bba4d76446f641a40d916bae9242c6769996`,
    completed the Bills list/detail/create visual parity slice with approved
    evidence at
    `/workspace/logs/settleora-visual-qa/20260703-1840-mobile-bills-list-create-visual-followup-dev-only/`.
  - All verified #672 PRs were visual/presentation/test/ledger scoped only.
    They did not authorize backend/API/OpenAPI/generated-client/schema,
    auth/session/security runtime, storage/file-byte behavior, money/
    settlement/payment/bill calculation authority, OCR extraction/runtime/apply
    behavior, sync runtime behavior, notification runtime/provider/push/email/
    admin/global policy behavior, #371 notification-open/deep-link redo,
    Docker/deployment/env/CI/signing/TestFlight/App Store metadata, runtime
    theme default switching, theme picker/persistence, Figma API output, or
    binary design asset commits.
- Post-PR #678 close handoff:
  - PR #678, merge SHA `914d1fe0a7ed42f4ce1f193db518b7ddc047d2c8`,
    completed the #672 acceptance/readout ledger audit and confirmed PRs
    #673, #674, #675, #676, and #677 were merged.
  - Follow-up issue #679,
    <https://github.com/tommytang213/Settleora/issues/679>, tracks the
    remaining minor mobile copy/spacing/rhythm polish split out from #672.
  - Final #672 decision: the child visual parity implementation slices are
    complete through PRs #673-#677, the post-child audit was merged in PR #678,
    and minor visual polish is split to #679. #672 may be closed after the
    `docs/mobile-672-followup-split-close-20260703` docs/control PR merges.
  - #371 remains closed and untouched; do not reopen or redo notification-open/
    deep-link behavior under #672 or #679 without a separate concrete
    regression and approved gate.
  - Runtime/API/security/money/storage/OCR/theme/deployment gates remain
    separate and are not part of #679. #679 is presentation-only unless a
    future approved split issue explicitly gates broader behavior.
  - Project field updates are not mutated by this ledger entry when tooling is
    unavailable or ambiguous; report any skipped project/status updates in the
    task report.
- Remaining Day 1 work:
  - No currently approved #672 child implementation slice is waiting for a
    PR/merge gate after PR #678.
  - Minor copy/spacing/rhythm cleanup is split to #679 instead of keeping #672
    open as an umbrella.
  - Known non-blocking visual follow-ups after the merged slices include
    spacing/section rhythm, dense bills/OCR/settlement usage polish,
    notification detail safety-note / received-timestamp spacing, hiding
    zero-value settlement chips where not useful, friendlier OCR/revision copy
    such as `Action needed: needs review.`, and future theme/preset behavior.
  - OCR capture/processing states, advanced tax/discount/fee/refund review,
    push/provider/admin notification policy, auth security/privacy vault,
    import/export/backup runtime, and runtime theme picker/default-theme
    behavior remain separate future gated work and should not be treated as
    missing visual child slices unless a new bounded task explicitly approves
    them against existing runtime.
  - Manual/Figma visual review and evidence remain required for any later child
    slice or cleanup PR that changes material mobile presentation.
  - Runtime/payment/storage/money/OCR gates remain required for any behavior
    beyond visual presentation, including OCR extraction/runtime changes,
    receipt storage/file-byte changes, API/OpenAPI/generated-client/schema
    changes, settlement/payment/bill calculation authority, and runtime theme
    picker/default-theme behavior.
- Close/keep-open recommendation:
  - Close #672 as completed after the
    `docs/mobile-672-followup-split-close-20260703` docs/control PR merges,
    provided #679 exists, #371 remains closed, validation/CI pass, and the diff
    remains limited to this ledger.

### Issue #369 - Day 1 in-app notification event-family coverage

- GitHub state/project status: issue `OPEN`; Project field readback was not
  updated by this docs/control task. Related issues #368, #403, #634, and #635
  were read back as `OPEN`; #371 was read back as `CLOSED` after PR #664.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87` after PR #664 and before the
  `docs/auth-session-security-notification-source-policy-369-20260702`
  docs/control branch.
- Completed PRs/slices:
  - PR #654, merge SHA `d58c03753f16741fac0a572de16f1447711c6f64`:
    completed only the narrow `sync.operation_failed` in-app/provider-neutral
    notification slice for newly persisted current-actor rejected sync
    operations.
  - Branch
    `docs/settlement-residual-review-notification-source-policy-369-20260702`:
    adds the #369 settlement residual review notification source-policy gate.
  - Branch
    `feature/settlement-residual-review-needed-notification-369-20260702`:
    implements the narrow `settlement.residual_review_needed` runtime slice
    for successful debtor-created payment claims that persist pending
    receiver-confirmation residuals.
  - Branch `docs/sync-notification-source-policy-369-20260702`: defines the
    remaining sync queued/retry/resolved/conflict-resolution notification
    source policy after `sync.conflict_detected` and `sync.operation_failed`.
  - Branch
    `docs/auth-session-security-notification-source-policy-369-20260702`:
    defines the auth/session/security notification source-policy gate. It
    records current auth/session/security runtime facts and blocks security
    notification runtime until exact source transitions, recipient and
    self-notification rules, first-class target references, redaction, and
    manual auth-security approval exist.
  - PR #664, merge SHA `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`, finalized
    #371 ledger hygiene and issue close posture after accepted notification
    open/deep-link work. #371 is now closed and should not be redone under
    #369.
- Completed scope:
  - Records current residual facts: explicit same-currency underpayment and
    overpayment residual rows, `pending_receiver_confirmation` source state,
    receiver residual confirmation route, dispute/cancellation neutralization,
    and confirmed-only balance projection effects.
  - Separates existing `settlement.payment_partially_paid` and
    `settlement.payment_marked_paid` payment-claim notices from residual
    review semantics.
  - Adds `settlement.residual_review_needed` to the notification event
    vocabulary, OpenAPI enum, generated web/Dart clients, and notification
    event-type check constraints.
  - Writes one unread in-app/provider-neutral `settlement.residual_review_needed`
    notification to the receiver/creditor only when the debtor-created payment
    claim creates a pending receiver-confirmation residual.
  - Reuses existing settlement payment/request target references and existing
    authorized settlement payment read/residual confirmation APIs.
  - Preserves debtor actor suppression, unrelated participant/admin
    suppression, privacy-safe payload exclusions, duplicate/replay no-op
    behavior, and read/archive source-state isolation.
  - Records that current sync runtime has no server-side queued, retrying,
    retry-failed, resolved, reopened, or resolution-applied source states.
  - Defers noisy automatic `sync.operation_queued` and
    `sync.operation_retrying` notifications unless a later policy/runtime
    slice proves a specific transition is user-actionable and privacy-safe.
  - Conditionally allows future `sync.operation_retry_failed`,
    `sync.conflict_resolved`, and `sync.resolution_applied` only after exact
    persisted source transitions exist; `sync.conflict_reopened` remains
    deferred unless a real reopened source state exists.
  - Confirms current `syncOperationId` plus the current-actor sync operation
    read path is sufficient only for future events backed by a persisted
    server `SyncOperation`; local queue, retry schedule, conflict-record, or
    resolution-attempt targets need a future target/reference/API gate.
  - Records current auth/session/security facts: real auth account, identity,
    credential, session, refresh/session-family, auth audit, MFA/passkey,
    recovery-code, and auth security policy foundations exist, and public
    sign-in/refresh/current-user/sign-out/session-list/revocation runtime
    exists. However, notification event constants, subject types, first-class
    auth targets, security recipient/suppression rules, and runtime writers do
    not exist.
  - Blocks `security.session_new_device` / `security.new_session`,
    `security.session_revoked`, `security.all_sessions_revoked`,
    credential-change/reset/rotation events, account status events,
    role/policy-change events, suspicious session/replay, and failed-sign-in
    alerts until source-event semantics and manual auth-security policy are
    reviewed.
- Explicitly not complete:
  - No debtor notification after receiver residual decision.
  - No broader settlement mismatch/review event runtime.
  - No provider send, mobile/deep-link, admin/global policy, settlement
    business schema, money, residual, allocation, payment, proof, balance
    projection, auth/security, deployment, CI, or secret change.
  - No sync queued/resolved/retry/conflict-resolution runtime, event enum,
    OpenAPI/generated-client, EF migration/check constraint, queue consumer,
    scheduler, hosted worker, conflict-resolution implementation, mobile UI,
    or #371 deep-link change.
  - No auth/session/security notification runtime, event enum, target columns,
    OpenAPI/generated-client, EF migration/check constraint, security route,
    MFA/passkey/credential/session behavior, admin/global policy, provider
    delivery, or UI change.
- Remaining Day 1 work:
  - Future debtor notification after receiver residual decisions only if a
    later policy names the event/source/recipient rules.
  - Broader settlement mismatch/review notifications remain blocked until
    broader settlement review source states exist.
  - Runtime implementation for any remaining sync notification events remains
    blocked until exact persisted source states and recipient/action semantics
    exist. Ordinary queue/retry churn should stay local UI/readout rather than
    notification noise.
  - Auth/session/security notification runtime remains blocked until exact
    API-owned source transitions, first-class safe targets, recipient and
    actor-self policy, redaction, and manual auth-security approval exist.
  - #635 admin/global policy/readout, #634 real push/provider and mobile work,
    OCR completed/failed, item claim/split notifications, and final Day 1
    notification acceptance remain open/gated.
  - #371 is closed for notification-open/deep-link scope after PR #664; do not
    reopen or redo #371 work for remaining #369 source-policy slices.
- Close/keep-open recommendation:
  - Keep #369 open. This branch completes only the auth/session/security
    source-policy gate; it does not complete runtime coverage or Day 1
    notification acceptance.
  - Keep #368, #403, #634, and #635 open. Keep #371 closed.
- Last verified repo/report references:
  - `docs/architecture/SETTLEMENT_RESIDUAL_REVIEW_NOTIFICATION_SOURCE_POLICY.md`
  - `docs/architecture/SYNC_NOTIFICATION_SOURCE_POLICY.md`
  - `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
  - `/workspace/logs/settleora-codex-report-20260702-settlement-residual-review-notification-source-policy-369.md`
  - `/workspace/logs/settleora-codex-report-20260702-sync-notification-source-policy-369.md`

### Issue #371 - Notification deep links / mobile notification-open behavior

- GitHub state/project status: issue `CLOSED` after final close checkpoint;
  #368, #369, #403, #634, and #635 remain separate/open. Project field mutation
  was not attempted by this docs/control task.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87` after PR #664 and final close
  checkpoint.
- Completed slices:
  - PR #664, merge SHA `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`, finalized
    issue progress ledger closure-ready state and closed #371 after the final
    close comment.
  - PR #662, merge SHA `c5b2dae7d72cbd94da4437d19a0cdf5d30034723`,
    accepted the repo-native TSX/mobile reference copy and chrome polish.
  - PR #663, merge SHA `8b27a132aca6e6c52f602a940ef0d245ec46e9e5`,
    accepted the Flutter notification-open/deep-link implementation.
  - Branch `docs/notification-deep-link-route-policy-371-20260702` defines
    the #371 notification deep-link route/mobile navigation policy gate.
  - Branch `docs/notification-open-mobile-reference-371-20260702` adds the
    #371 mobile notification-open states reference handoff.
  - Branch
    `docs/notification-open-figma-reference-package-371-20260702` adds the
    focused #371 Figma/reference package for exact notification-open frame
    generation and review.
  - Branch `docs/notification-open-tsx-reference-371-20260702` adds the
    repo-native TSX equivalent reference package for reviewing the same
    notification-open frame inventory without Figma Make, Figma API, Figma
    screenshots, imported tokens, or binary assets.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    corrects that repo-native TSX package to visually align with the approved
    Settleora mobile shell, Notifications, More and Settings, Push
    Registration, Auth Security, and implementation guardrail references.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    also incorporates Tommy's partial visual review follow-up: the visual look
    is acceptable as mobile app UI, but notification-center/detail frames must
    not repeat the top bell affordance and visible phone-frame copy should be
    product-facing rather than backend/architecture phrasing.
  - Branch
    `docs/notification-open-tsx-reference-371-visual-consistency-recovery-20260702`
    later applies the requested product-copy polish checkpoint: raw event names
    stay in docs/reference metadata only, while visible phone-frame copy uses
    product labels for settlement review, receipt review, sync issues, account,
    offline, unavailable, already handled, push-readiness, and generic fallback
    states.
  - Branch `feature/notification-open-flutter-deeplink-371-20260702` implements
    the first Flutter notification-open/deep-link slice for the existing mobile
    Notification Center without backend, OpenAPI, generated-client, provider,
    schema, deployment, auth/security runtime, or money-authority changes.
- Completed scope:
  - Defines that notification rows, push payloads, local cache, route state,
    object URLs, and generated-client availability are not authorization.
  - Requires opening a notification to re-fetch the notification detail and
    then re-fetch the linked bill, settlement, recurring bill, OCR review, or
    sync operation through authorized API paths.
  - Maps current implemented event families to future route targets: bill
    workflow/revision, settlement request/payment/proof/residual review,
    recurring due/draft, OCR `ocr.needs_review`, and sync
    `sync.conflict_detected` / `sync.operation_failed`.
  - Marks security/auth/session, item-claim/split, broader settlement review,
    OCR completed/failed, remaining sync queued/retry/resolved, provider,
    digest, admin/global policy, push-token, and delivery-attempt routes as
    future/blocked until source/runtime/target policies exist.
  - Defines missing, archived, restored, deleted, unauthorized, group-membership
    changed, resolved, retargeted, account-switched, sign-in-required, offline,
    and server-unavailable fallback behavior without private existence leaks.
  - Records privacy-safe external copy and mobile navigation posture, including
    no first-launch prompt coupling and Figma/reference-gated Flutter
    implementation.
  - Adds `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md` as
    the mobile reference handoff for opening notifications from in-app rows and
    OS push/local notifications.
  - Records product-facing state coverage for sign-in required, wrong account
    or account switched, local-only mode, offline/server unavailable,
    stale/missing targets, deleted/archived/restored targets, unauthorized or
    group-membership-changed targets, already resolved/completed notifications,
    retargeted notifications, loading, provider disabled/unconfigured readouts
    separated from authorization, and notification-detail fallback.
  - Adds privacy-safe copy and screenshot rules plus action-specific button
    wording such as `Open bill`, `Review settlement`, `Review receipt`,
    `View sync issue`, and `Back to notifications`.
  - Adds a paste-ready future Figma/reference prompt and a future Flutter/test
    readiness checklist while preserving server/API/domain authority.
  - Adds
    `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`
    as the Figma/reference review package with exact frame inventory,
    paste-ready Figma Make/designer prompt, UX/copy guardrails,
    privacy/safety restrictions, Tommy first-review checklist, Assistant
    second-review checklist, export evidence expectations, and the future
    Flutter implementation boundary.
  - Adds
    `docs/design/mobile/reference-tsx/notification-open/NotificationOpenReference.tsx`
    as a static, componentized, Figma-token-free equivalent reference with
    phone-frame TSX/CSS, frame index, and data objects covering notification
    inbox selection, authorized re-fetch loading, bill, settlement, residual
    review, recurring, OCR, sync, sign-in, account switch, local-only, offline,
    stale/missing, archived/deleted/restored, unauthorized or membership
    changed, resolved/completed, push-readiness, and generic fallback states.
  - Recovers the TSX visual language away from the initial standalone
    documentation-board look by removing the fake brand-mark treatment,
    arbitrary green gradient shell, square/flat card rhythm, and invented
    reference-board styling, while preserving all 18 #371 notification-open
    states and privacy/authority guardrails.
  - Refines the repo-native TSX reference so Notification Center uses filter
    chrome without a duplicate bell, notification detail/open frames use back
    navigation plus concise context titles without a bell, and visible
    phone-frame copy uses product phrases such as checking access, refreshing
    latest details, reviewing bills/settlements/receipts/sync issues, signing
    in, switching accounts, retrying, and returning to notifications.
  - Polishes the visible phone-frame copy so raw backend event strings such as
    OCR, settlement residual, and sync event names do not appear as user-facing
    labels; replaces debug-style labels such as visible context, shown/hidden,
    and stale-action explanations with shorter product copy and specific
    action labels.
  - Adds mobile notification-open route-family resolution for currently
    supported bill workflow/revision, settlement request/payment/proof/residual
    review, recurring due/draft, `ocr.needs_review`, and
    `sync.conflict_detected` / `sync.operation_failed` families using typed
    notification metadata only.
  - Updates the Flutter Notification Center to refresh the current notification
    row before opening a linked target, then re-fetch linked bill, settlement,
    recurring, OCR review, or sync-operation data through the current mobile
    repository/API seams before showing linked details or actions.
  - Keeps future/blocked auth/session/security, item claim/split,
    OCR completed/failed, remaining sync queued/retry/resolved/reopened,
    broader settlement mismatch/review, provider/digest/admin/global
    policy/readout, push-token/device-token, and delivery-attempt routes on
    product-facing unsupported fallback copy.
  - Removes duplicate bell iconography from Notification Center content while
    preserving the global top notification affordance on ordinary app screens
    and the existing `Home / Bills / Groups / Settle / More` shell.
  - Adds focused Flutter coverage for no duplicate Notification Center bell,
    supported route-family action mapping, OCR/sync opens, unsupported/future
    fallbacks, named sign-in/account/local-only/offline/stale/unauthorized/
    resolved/provider-unconfigured fallback copy, read/open/archive source
    mutation isolation, raw event-id suppression, and scroll-safe long
    notification rows.
  - Final acceptance check returned `READY_TO_CLOSE_RECOMMENDATION` with no
    remaining #371-specific gaps found.
- Explicitly not complete:
  - No Figma Make/API usage, Figma output, screenshots, binary assets,
    notification writer runtime, event enum, OpenAPI, generated-client, EF
    migration/check constraint, auth/session/security runtime,
    business-authority logic, provider sending, admin/global policy,
    deployment/env/CI, Docker, or secret changes.
  - Provider-backed push flows, push registration, admin/global policy/readout,
    backend notification event-family work, and broader notification epic work
    remain separate outside #371.
- Remaining Day 1 work:
  - No remaining #371-specific work was found by the final acceptance check.
  - Backend route/target tests only if a future implementation changes route
    metadata, target APIs, OpenAPI, or notification behavior.
- Close/keep-open recommendation:
  - Keep #371 closed. Do not redo notification-open/deep-link work under #369.
  - Keep #368, #369, #403, #634, and #635 open/separate.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md`
  - `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md`
  - `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`
  - `docs/design/mobile/reference-tsx/notification-open/README.md`
  - `docs/design/mobile/reference-tsx/notification-open/NotificationOpenReference.tsx`
  - `.codex/reports/settleora-codex-report-20260702-1705-notification-open-371-final-acceptance-check.md`
  - `/workspace/logs/settleora-codex-report-20260702-1705-notification-open-371-final-acceptance-check.md`

### Issue #570 - OCR review in-app notification runtime

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0`, `Actual Done Date`
  `2026-06-30`, and linked PR #626 by GraphQL readback on 2026-06-30.
- Last verified at main SHA:
  `ecbabe1bfe432deb8b10617ac59395f338c05b0b`.
- Completed PRs/slices:
  - PR #573, merge SHA `ce808da646146a5177444caff4702f1c645da994`:
    recorded that current OCR review `provisional` and `reviewed` states were
    not safe `ocr.needs_review` source events.
  - PR #574, merge SHA `d755e00efb0db386ace386ed136af66aa79c3b30`:
    recorded the explicit OCR review assignment/source-state policy and kept
    OCR notification runtime blocked until that source state existed.
  - PR #576 / issue #575, merge SHA
    `21c55062a8b7c49a7058e2fbc879b3c5c79bc822`: added the explicit
    API-owned OCR review needs-review assignment/source state prerequisite.
  - PR #626, source head `581aa6aca39041477e3f6ab58a1b8e33944e89ff`,
    merge SHA `ecbabe1bfe432deb8b10617ac59395f338c05b0b`: implemented the
    narrow `ocr.needs_review` in-app notification runtime for explicit
    API-owned OCR review assignment creation/retarget transitions only.
- Completed scope:
  - Creating a new active needs-review assignment, or retargeting an existing
    active assignment to a different authorized responsible editor, writes one
    safe unread `ocr.needs_review` in-app notification to the assigned profile.
  - Plain OCR review save/read/list/apply-preview/apply/delete, assignment
    visibility, completion, cancellation, duplicate same-recipient assignment,
    and actor self-assignment do not create OCR notifications.
  - Dependencies #568 target references and #575 assignment/source state are
    completed and closed/merged.
- Validation summary from PR #626:
  - Local validation passed before merge: `npm run doctor:validation`,
    `npm run validate:openapi`, `npm run validate:clients`,
    `npm run validate:scaffold`, API build with 0 warnings and 0 errors,
    focused API tests with 51 passed/0 failed/0 skipped,
    `timeout 900s npm run validate:api-local` with 1191 passed/0 failed/0
    skipped, `npm run validate:docs`, and final
    `git diff --check origin/main...HEAD`.
  - GitHub CI passed on exact PR head
    `581aa6aca39041477e3f6ab58a1b8e33944e89ff`: CodeQL jobs and Scaffold
    Validation.
- Remaining Day 1 work:
  - `ocr.completed` and `ocr.failed` remain blocked until server OCR
    worker/job source states exist.
  - #371 mobile/deep-link UI behavior remains separate and Figma/reference
    gated.
  - #369 and #368 remain open parent notification trackers.
  - Auth/session/security notification runtime remains manual-gated where
    applicable.
- Future gates requiring explicit approval:
  - Server OCR worker/job source states and failure/completion recipient policy.
  - Mobile/deep-link UI behavior under #371.
  - Auth/session/security notification policy and runtime.
  - Any future OpenAPI/generated-client, schema/migration, storage/privacy,
    money/settlement/bill authority, deployment, CI, or provider-delivery
    expansion outside the already merged #626 slice.
- Close/keep-open recommendation:
  - Keep #570 closed. It completed its narrow runtime slice and must not be
    used as proof that all OCR/server-worker/deep-link notification scope is
    complete.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1445-ocr-notification-source-state-review-570.md`
  - `.codex/reports/settleora-codex-report-20260628-1500-pr-ocr-notification-source-state-review-570-merge.md`
  - `.codex/reports/settleora-codex-report-20260628-1515-ocr-needs-review-source-transition-policy-570.md`
  - `.codex/reports/settleora-codex-report-20260628-1545-ocr-needs-review-assignment-source-state-child-issue-570.md`
  - PR #626:
    `https://github.com/tommytang213/Settleora/pull/626`
  - Issue #570 completion comment:
    `https://github.com/tommytang213/Settleora/issues/570#issuecomment-4844220380`

### Issue #629 - Notification preference decision-envelope and delivery-state foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-06-30`, and linked PR #630 by GitHub/Project
  readback on 2026-06-30.
- Last verified at main SHA:
  `34caca01a6a746f08b1892134a9510b9265cb645`.
- Completed PRs/slices:
  - PR #630, reviewed source head
    `3b181365246d895c9e8b69653dbd67e125cdcfc8`, merge SHA
    `34caca01a6a746f08b1892134a9510b9265cb645`: implemented the
    internal notification decision-envelope foundation.
- Completed scope:
  - Internal `INotificationDecisionEnvelopeResolver` service boundary.
  - Provider-free `NotificationDecisionEnvelopeResolver`.
  - Bounded `in_app`, `email`, and `mobile_push` channel vocabulary.
  - Bounded decision/reason vocabulary with no fake provider success.
  - Decision-only email and push outcomes without SMTP, push, queue, worker,
    device-token, or provider-success runtime.
  - In-app baseline eligibility behavior without weakening
    `IInAppNotificationWriter`.
  - Focused resolver tests.
- Explicitly not complete:
  - No SMTP runtime.
  - No push runtime.
  - No device-token API/storage.
  - No delivery worker, queue, or provider-success state.
  - No provider secrets, environment, or deployment changes.
  - No admin/global notification policy API.
  - No OpenAPI or generated-client changes.
  - No EF schema, migration, or database persistence changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
- Remaining related work:
  - #403 remains open for SMTP runtime, push runtime/device-token lifecycle,
    server-side preference resolution beyond this foundation, delivery-state
    persistence/workers, admin/global policy, and related gated work.
  - #369 remains open for remaining Day 1 notification event-family runtime and
    source-state work.
  - #368 remains open as the notification epic.
  - #371 is now closed after PR #664 for notification-open/deep-link scope;
    do not redo it under #629/#403/#369 work.
- Close/keep-open recommendation:
  - Keep #629 closed as complete for the internal decision-envelope foundation
    only. Do not treat #629 or PR #630 as completion of #403 or #369.
- Last verified repo/report references:
  - PR #630:
    `https://github.com/tommytang213/Settleora/pull/630`
  - Issue #629 completion comment:
    `https://github.com/tommytang213/Settleora/issues/629#issuecomment-4845421050`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2331-notification-decision-envelope-foundation-629-pr-merge.md`

### Issue #638 - Notification delivery-attempt persistence foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-07-01`, and linked PR #639 by GitHub/Project
  readback on 2026-07-01.
- Last verified at main SHA:
  `de2a7a38fe902c71592fef62d26fab4a4797ca5a`.
- Completed PRs/slices:
  - PR #639, reviewed source head
    `41e3c565d003dd7199a42442ec52e0a1bf16df9a`, merge SHA
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`: implemented the
    approved Option A provider-neutral notification delivery-attempt
    persistence/service foundation.
- Completed scope:
  - Provider-neutral `NotificationDeliveryAttempt` domain model.
  - Additive `notification_delivery_attempts` table.
  - Bounded pre-provider delivery-attempt constants and constraints.
  - Internal `INotificationDeliveryAttemptRecorder` service boundary and EF
    implementation.
  - DI registration without hooking the recorder into current writers or
    endpoints.
  - Recorder consumes #629 decision-envelope output plus source-domain
    eligibility and creates rows only for eligible `email` or `mobile_push`
    decisions.
  - Disabled, unconfigured, deferred, skipped, unsafe, source-ineligible, and
    missing-recipient paths no-op without fake `sent`, `delivered`, or
    provider success.
  - Idempotency is enforced by unique idempotency key/correlation behavior.
  - Focused tests cover persistence, no fake success, idempotency, no in-app
    or source mutation, sensitive-field exclusions, additive migration shape,
    and provider dependency absence.
- Migration/schema review:
  - Additive-only review passed.
  - `Up` creates only `notification_delivery_attempts` plus check constraints,
    indexes, and restricted FKs.
  - `Down` drops only `notification_delivery_attempts`.
  - No destructive `Up` operation against existing tables/columns.
  - No raw provider payload, SMTP credential, device token, storage path,
    object key, signed URL, local path, raw OCR/receipt text, payment detail,
    private note, hidden bill detail, or unrelated user-data field was added.
- Explicitly not complete:
  - No SMTP sending/runtime/provider adapter under #632.
  - No push sending/runtime/provider adapter or device-token API/storage under
    #634.
  - No worker/outbox processing loop.
  - No provider secrets, environment, deployment, APNs, FCM, or SMTP
    credentials.
  - No admin/global notification policy API/readout under #635.
  - No OpenAPI or generated-client changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
  - No storage/file-byte behavior.
  - No money, bill, split, settlement, payment, recurring, sync, OCR worker,
    import, export, or restore authority.
- Close/keep-open recommendation:
  - Keep #638 closed as complete for the provider-neutral delivery-attempt
    persistence/service foundation only.
  - Do not treat #638 or PR #639 as completion of #633 or #403.
- Last verified repo/report references:
  - PR #639:
    `https://github.com/tommytang213/Settleora/pull/639`
  - Issue #638 completion comment:
    `https://github.com/tommytang213/Settleora/issues/638#issuecomment-4850635401`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-0155-notification-delivery-attempt-persistence-foundation-638.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`

### Issue #641 - Notification delivery worker/outbox foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Initial MD` `2`, `Man-days Remaining` `0`,
  `Actual Done Date` `2026-07-01`, and linked PR #642 by GitHub/Project
  readback on 2026-07-01.
- Last verified at main SHA:
  `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`.
- Completed PRs/slices:
  - PR #642, reviewed source head
    `e65ad69f7ecfc28f4d56d844e2d1a2c8ca927d69`, merge SHA
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`: implemented the
    approved Option A provider-neutral notification delivery worker/outbox
    foundation over #638 `notification_delivery_attempts`.
- Completed scope:
  - Internal provider-neutral lease service and outbox processor service
    boundaries.
  - Lease-owner, lease-expiry, and last-attempt metadata for delivery
    attempts.
  - Retry/backoff handling through `next_attempt_at_utc`.
  - Provider-neutral safe no-op processing for disabled, unconfigured,
    cancelled, suppressed, expired, and other non-runnable attempts.
  - Bounded pre-provider state transitions: expired queued attempts transition
    only to `expired`; unsafe, source-invalid, or missing-recipient queued
    attempts transition only to `suppressed`.
  - DI registration for internal/future use only.
  - Focused tests for schema, lease/claim behavior, retry/backoff,
    idempotency, safe no-ops, provider/runtime absence, no source/in-app
    mutation, and sensitive-field exclusions.
- Migration/schema review:
  - Additive-only review passed.
  - `Up` adds nullable `last_attempted_at_utc`, nullable
    `lease_expires_at_utc`, nullable `lease_owner`, one lease/status index,
    and two lease consistency check constraints on
    `notification_delivery_attempts`.
  - `Down` removes only the new index, constraints, and columns.
  - No destructive operation against existing business tables/columns.
  - No raw provider payload, SMTP credential, push credential, device token,
    storage path, object key, signed URL, local path, raw OCR/receipt text,
    payment detail, private note, hidden bill detail, or unrelated sensitive
    schema field was added.
- Runtime activation review:
  - No hosted background service, scheduler, queue consumer, RabbitMQ
    consumer, cron, endpoint, notification-writer hook, provider adapter,
    SMTP sending, push sending, device-token API/storage, deployment/env
    behavior, or secret behavior was added.
- Explicitly not complete:
  - No SMTP sending/runtime/provider adapter under #632.
  - No push sending/runtime/provider adapter or device-token API/storage under
    #634.
  - No provider secrets, environment, deployment, APNs, FCM, or SMTP
    credentials.
  - No real provider-result success states without a separately approved real
    provider adapter.
  - No admin/global notification policy API/readout under #635.
  - No OpenAPI or generated-client changes.
  - No mobile, web, or admin UI.
  - No #371 deep links or navigation.
  - No auth/session/security runtime or bypass policy.
  - No direct source-business-table mutation by workers.
  - No storage/file-byte behavior.
  - No money, bill, split, settlement, payment, recurring, sync, OCR worker,
    import, export, or restore authority.
- Close/keep-open recommendation:
  - Keep #641 closed as complete for the provider-neutral worker/outbox
    foundation only.
  - Do not treat #641 or PR #642 as completion of #633 or #403.
- Last verified repo/report references:
  - PR #642:
    `https://github.com/tommytang213/Settleora/pull/642`
  - Issue #641 completion comment:
    `https://github.com/tommytang213/Settleora/issues/641#issuecomment-4851348342`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1450-notification-delivery-worker-outbox-foundation-641.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`

### Issue #632 - SMTP email notification runtime

- GitHub state/project status: issue `CLOSED`; PR #645 merged; Project
  status `Merged`, `Progress %` `100`, `Man-days Remaining` `0`, and
  `Actual Done Date` `2026-07-01` by GitHub/Project readback after PR #645.
- Last verified at main SHA:
  `39d1d669cc55988da31d4c5b76800c3f29aa4e83`.
- Completed PRs/slices:
  - PR #645, reviewed source head
    `28791c2159646a17733ea7ac08f9c744c7fd7687`, merge SHA
    `39d1d669cc55988da31d4c5b76800c3f29aa4e83`: implemented the
    approved Option A disabled-by-default SMTP email notification runtime
    foundation.
- Completed scope:
  - Approved Option A disabled-by-default SMTP email notification runtime
    foundation.
  - Internal SMTP provider adapter boundary behind server configuration.
  - Safe `disabled` and `unconfigured` outcomes.
  - Integration with #629 decision-envelope output and #638/#641
    delivery-attempt/outbox foundations.
  - Delivery-attempt state updates only through approved notification
    delivery-attempt/outbox boundaries.
  - No fake `sent` or `delivered` success.
  - In-app fallback unchanged.
  - Minimal generic email templates.
  - Bounded provider-result categories without raw SMTP response persistence.
  - Focused tests for disabled/unconfigured behavior, no fake sent success,
    redaction, provider classification, no secret leakage, no real network
    dependency, and no source business mutation.
- Configuration/secrets review:
  - SMTP remains disabled by default through
    `Notifications:SmtpEmail:Enabled = false`.
  - Enablement is through server/operator configuration only.
  - No committed SMTP secrets, credentials, tokens, `.env`, local secret
    files, deployment/env exposure files, or secret-like sample values.
  - No options endpoint, admin route, public route, OpenAPI schema,
    generated client, or UI exposes SMTP values.
  - Provider exceptions are classified into bounded redacted categories.
  - No secrets are exposed in logs, API responses, issue comments, docs, test
    snapshots, exceptions, or client-visible payloads.
- Email template/privacy review:
  - Minimal generic subject/body.
  - Bodies say a notification is available in Settleora and require
    sign-in/authorization.
  - Bodies include only event type and one safe stable reference when present.
  - Bodies exclude raw OCR/receipt text, private/hidden bill details, payment
    data, proof contents, signed URLs, object keys, storage paths, tokens,
    credentials, provider payloads, private notes, and unrelated user data.
- Explicitly not complete:
  - Recipient email-address source/policy for actual recipient addressing.
  - Hosted runtime activation.
  - Production deployment/env/secrets setup.
  - Admin/global notification policy/readout under #635.
  - Push/device-token/provider runtime under #634.
  - OpenAPI/generated-client/readout.
  - Admin, web, mobile UI and #371 deep links.
  - Auth/session/security notification behavior.
  - Email digests, bulk campaigns, or marketing emails.
  - Money, bill, split, settlement, payment, recurring, sync, OCR, import,
    export, or restore authority.
- Remaining related work:
  - #403 remains open because #632 completed only the disabled-by-default SMTP
    runtime foundation; push/device-token runtime (#634), admin/global
    policy/readout (#635), future route-family extensions after closed #371,
    hosted runtime
    activation, recipient-email source/policy, OpenAPI/readout, and remaining
    notification work remain gated.
  - #369 remains open because #632 closure is provider runtime foundation
    only, not full Day 1 notification event-family acceptance.
  - #634/#635/#368 remain open; #371 is closed after PR #664.
  - #629/#633/#638/#641/#632 remain closed/Merged as completed
    foundations/slices.
- Close/keep-open recommendation:
  - Keep #632 closed as complete for the disabled-by-default SMTP runtime
    foundation only.
  - Do not treat #632 or PR #645 as completion of #403.
- Last verified repo/report references:
  - PR #645:
    `https://github.com/tommytang213/Settleora/pull/645`
  - Issue #632 completion comment:
    `https://github.com/tommytang213/Settleora/issues/632#issuecomment-4852592872`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1632-smtp-email-runtime-foundation-632.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1655-smtp-email-runtime-foundation-632-pr-merge.md`

### Issue #633 - Notification delivery-state persistence and worker foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0`, and `Actual Done Date`
  `2026-07-01` by GitHub/Project readback on 2026-07-01 after PR #644.
  PR #636, PR #639, PR #642, PR #643, and PR #644 are merged, and #633's
  own close rule is satisfied for the reviewed and validated delivery-state
  persistence/worker foundation scope. This closure does not complete
  provider runtime, hosted worker activation, admin policy, OpenAPI/readout,
  UI/deep-link work, remaining event-family runtime, or provider/deployment
  gates.
- Last verified at main SHA:
  `79d6f71cade6f6edfa3bdb95b8b7b1aebd1b370d` after PR #644.
- Completed PRs/slices:
  - PR #636, reviewed source head
    `bed8689325fc76dcf071970256df1da4f7ebe615`, merge SHA
    `94f71c96446780966bec7cefc415c0ee6bbdd54e`: completed the docs/control
    architecture review for notification delivery-state persistence and worker
    foundation.
  - PR #639 / issue #638, reviewed source head
    `41e3c565d003dd7199a42442ec52e0a1bf16df9a`, merge SHA
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`: completed the first
    approved provider-neutral delivery-attempt persistence/service foundation
    slice only.
  - PR #642 / issue #641, reviewed source head
    `e65ad69f7ecfc28f4d56d844e2d1a2c8ca927d69`, merge SHA
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`: completed the approved
    provider-neutral worker/outbox processing foundation slice.
  - PR #643, reviewed source head
    `f18bbc5e6c1dd7dfc68ffb361e118b8164c9ca88`, merge SHA
    `b669afc095f2fceec110813b58904fd1a367a415`: recorded the #641/#633
    ledger checkpoint before #633 closure.
  - PR #644, reviewed source head
    `23991b533a4e459c53b58769f69736e8b0a173cc`, merge SHA
    `79d6f71cade6f6edfa3bdb95b8b7b1aebd1b370d`: closed #633 for the
    delivery-state persistence/worker foundation only and recorded the closure
    checkpoint.
- Completed scope:
  - Added
    `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`.
  - Updated README and architecture index references.
  - Separated in-app unread/read/archive state, #629 decision-envelope
    eligibility, external delivery attempts, SMTP runtime, push runtime,
    admin/global policy, and device-token lifecycle.
  - Recorded API/domain authority boundaries for recipient eligibility, channel
    eligibility, idempotency, redaction, audit-safe metadata, and delivery
    attempt acceptance.
  - Constrained future workers to API/domain-created outbox/queue records or a
    separately approved service boundary.
  - Defined provider-neutral state vocabulary, redaction rules, future
    persistence-model guidance, and implementation split recommendations.
  - Added provider-neutral `NotificationDeliveryAttempt` persistence and
    internal recorder service foundation that consumes #629 decision envelopes
    plus source-domain eligibility for eligible `email` and `mobile_push`
    decisions.
  - Added only bounded pre-provider queued-attempt persistence behavior with
    no fake success and no in-app/source mutation.
  - Added provider-neutral lease/claim and outbox processor service
    boundaries over `notification_delivery_attempts`, with retry/backoff,
    idempotent safe no-op handling, bounded pre-provider transitions, and no
    hosted runtime activation.
  - Added safe metadata only: no raw provider payload, SMTP credential, push
    credential, raw device token, storage path, object key, signed URL, local
    path, raw OCR/receipt text, payment detail, private note, hidden bill
    detail, or unrelated sensitive field.
  - Validated that the persistence and worker/outbox foundations do not create
    fake provider success, do not mutate source business state, do not mutate
    in-app read/archive state, have no provider dependency, do not change
    OpenAPI/generated clients, and use additive migrations only.
- Explicitly not complete:
  - No hosted provider runtime activation, push runtime/device-token storage
    under #634, or admin/global policy API/readout under #635.
  - SMTP runtime under #632 is now separately closed only for the
    disabled-by-default internal SMTP foundation; #633 itself did not complete
    SMTP recipient addressing, hosted activation, deployment/env/secrets, or
    external delivery-state API/readout.
  - No hosted background service, scheduler, queue consumer, RabbitMQ
    consumer, cron, endpoint, notification-writer hook, provider adapter, SMTP
    sending, push sending, device-token API/storage, deployment/env behavior,
    or secret behavior.
  - No OpenAPI contract or generated-client changes.
  - No mobile, web, admin UI, deep-link, or #371 work.
  - No provider secrets, environment, deployment, auth/session/security
    runtime, or bypass policy changes.
  - No external delivery-state API/readout, OpenAPI contract, generated-client
    exposure, hosted runtime activation, UI/deep links, or source-state event
    families.
- Remaining related work:
  - The #632 disabled-by-default SMTP runtime foundation is complete, but
    actual recipient email-address source/policy, hosted runtime activation,
    deployment/env/secrets setup, admin/readout, OpenAPI/readout, and UI
    remain separate gated work and must not be inferred from #633 or #641.
  - Future push provider runtime, device-token lifecycle, provider adapters,
    provider-result success/failure classification, and hosted runtime
    activation remain separate gated work and must not be inferred from #641.
  - Any external delivery-state API/readout requires separate
    OpenAPI/generated-client gates.
  - #403 remains open because #632 completed only the disabled-by-default SMTP
    runtime foundation, while server-side preference/runtime resolution beyond
    foundations, admin policy/readout, deep links, push/device-token, hosted
    runtime activation, recipient-email source/policy, OpenAPI/readout, and
    remaining notification work remain gated.
  - #369 remains open because #633 closure is provider-neutral
    delivery-state foundation only, not full Day 1 notification event-family
    acceptance.
  - #368 remains open as the notification epic.
  - #371 is closed after PR #664; future route-family extensions require
    separate scope but should not redo #371.
  - #634/#635 remain separate gated issues for push/device-token runtime and
    admin/global policy API/readout.
  - #632/#638/#641/#629 remain closed/Merged as completed foundations/slices.
- Close/keep-open recommendation:
  - Keep #633 closed as complete for delivery-state persistence/worker
    foundation only.
  - Do not treat #633 closure as provider/runtime/admin/UI completion.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - PR #636:
    `https://github.com/tommytang213/Settleora/pull/636`
  - PR #639:
    `https://github.com/tommytang213/Settleora/pull/639`
  - PR #642:
    `https://github.com/tommytang213/Settleora/pull/642`
  - PR #643:
    `https://github.com/tommytang213/Settleora/pull/643`
  - PR #644:
    `https://github.com/tommytang213/Settleora/pull/644`
  - Issue #633 merge checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/633#issuecomment-4846071136`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-0034-notification-delivery-state-worker-architecture-633.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-0107-notification-delivery-state-worker-architecture-633-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1512-issue-progress-ledger-641-633-checkpoint.md`

### Issue #634 - Mobile push device-token API and provider-neutral delivery runtime

- GitHub state/project status: issue `OPEN`; Project status `Blocked` by
  GitHub/Project readback on 2026-07-01 after PR #650 and issue-comment
  readback on 2026-07-01 after PR #652. A1 design, A2 token-protection
  design, the A2 server-side token lifecycle API foundation, the A3 Option A
  provider-neutral push runtime foundation, and the #634 mobile push
  registration UX/readiness reference gate are complete. #634 remains open
  because real APNs/FCM providers, Flutter token registration implementation,
  APNs/FCM/provider setup, hosted activation, admin/readout, #371 deep links,
  and related notification work remain blocked/gated. Remaining MD must not be
  reduced to `0`.
- Last verified at main SHA:
  `98dc4ab0e6ae7363b0d3638c3d17500c3a26f610`.
- Completed PRs/slices:
  - PR #647, reviewed source head
    `837e51ccad71f79762ddd6b2b4035145d8497469`, merge SHA
    `7898d8f75008474a6bc1aff6d0a02552291f2bc4`: completed the #634 A1
    push token lifecycle architecture/contract design checkpoint only.
  - PR #649, reviewed source head
    `784782fa15f7c74b9247cb383fdcbb090a43f7e0`, merge SHA
    `200d608da2b2b6ebb8d0d80cfd67ad58e9715414`: completed the A2 Option C
    token-protection design checkpoint before A2 implementation.
  - PR #650, reviewed source head
    `c86b95f3e16b40495e23f9c2a8aca008789a4470`, merge SHA
    `1983832614394ed0dd8c8c6d4aab63e512e42b4b`: completed the #634 A2
    Option A server-side push token lifecycle API foundation only.
  - Branch `feature/push-a3-provider-runtime-634-option-a-20260701`:
    implements the approved #634 A3 Option A provider-neutral push delivery
    runtime foundation over the existing #629/#638/#641 notification
    foundations. This branch is not a real APNs/FCM provider implementation and
    does not close #634.
  - Branch `docs/mobile-push-registration-ux-design-gate-634-20260702`:
    records the no-code mobile push registration UX/readiness reference gate in
    `docs/design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md`. This gate
    defines permission timing, settings/readout states, token
    registration/revocation UX, privacy-safe copy, provider/dependency posture,
    mobile identity/signing readiness, and Figma/reference handoff. It does not
    implement Flutter UI, generate Figma, change OpenAPI/generated clients, add
    provider credentials, or close #634.
- Completed A1/A2/A3 Option A scope:
  - Future current-user push token register/replace, revoke current token,
    revoke current-session tokens, revoke all current-user tokens, optional
    safe readout, token rotation, and stale-cleanup endpoint shapes.
  - Idempotent duplicate registration behavior, token-conflict posture,
    authenticated session/profile binding, rate-limiting posture, and safe
    error vocabulary.
  - Later token persistence fields for user/profile/session/device
    association, platform/provider, token fingerprint, protected token
    secret/ciphertext, lifecycle timestamps, revocation/stale/failure
    metadata, provider feedback category, unique constraints, idempotency keys,
    retention, and cleanup.
  - Token protection policy with no plaintext normal read paths, no raw token
    exposure, a purpose-bound keyed fingerprint, and a protected server
    boundary for raw provider send.
  - Privacy-safe push payload exclusions and the rule that notification opens
    must re-fetch linked resources through authorized API paths.
  - Provider-neutral-first runtime posture with no real provider enabled by
    default.
  - Mobile/Figma posture, including a required Figma/reference gate for mobile
    OS permission/settings UI and separate mobile validation/release gates for
    actual app integration.
  - #371 notification deep links kept separate from push provider work; #371 is
    now closed after PR #664.
  - Recommended A2/A3/A4 future implementation split: A2 server-side token
    persistence/API foundation, A3 provider-neutral push delivery runtime, and
    A4 mobile app registration/permission UX.
  - A2 token-protection design classifies push tokens as provider-usable
    sensitive secrets; defines protected storage/sealing/key-management
    posture; defines purpose-bound keyed fingerprinting for dedupe/correlation
    only; defines API/read-path, log, audit, telemetry, issue, docs,
    generated-client, and test redaction expectations; defines backup/restore
    and local-mode re-registration posture; and keeps provider/runtime work
    separate.
  - A2 implementation adds additive `push_device_tokens` persistence; protected
    raw token storage through push-specific `IPushTokenProtector` /
    `PushTokenProtector`; HMAC token fingerprint and device-installation hash
    support through a push-specific service boundary; fail-closed registration
    and token-based revocation when fingerprint key/config is unavailable;
    authenticated current-user APIs
    `PUT /api/v1/me/push-devices/current-token`,
    `DELETE /api/v1/me/push-devices/current-token`, and
    `DELETE /api/v1/me/push-devices/current-session`; OpenAPI contract
    updates; regenerated web/Dart generated clients; and safe lifecycle
    metadata responses only.
  - A3 Option A adds internal provider-neutral push send boundaries,
    disabled/unconfigured default provider registration, a privacy-safe
    provider-neutral payload builder, bounded provider feedback categories,
    existing `mobile_push` delivery-attempt/outbox integration, no-active-token
    handling, and protected token unprotect only inside the push send boundary.
  - A3 Option A maps disabled, unconfigured, and no-active-token outcomes to
    existing safe non-success delivery-attempt states and never records fake
    `sent` or `delivered` success.
  - Mobile push registration UX/readiness reference gate records that push
    permission must not be requested on first launch, must require
    authenticated server-mode context plus clear user intent, must expose
    local-only/unsupported/disabled/unconfigured/readiness states before OS
    prompting, must use only the existing authenticated current-user
    push-device APIs for future token registration/revocation, and must keep
    push copy generic with authorized re-fetch on open.
  - The reference gate records that Firebase is not an approved required
    product dependency unless Tommy explicitly approves it later, and keeps
    direct APNs + direct FCM and FCM-with-APNs-linkage as future options only.
  - The reference gate records non-secret mobile identity/signing readiness
    checks for iOS bundle ID, Android package name, environment split, Apple
    Developer/App Store Connect readiness, push capability/provisioning,
    Codemagic/TestFlight/Android signing path, Firebase ownership if later
    approved, and real-device/manual validation expectations.
  - A2 validation covered protection, auth/session binding, dedupe/idempotency,
    revocation, schema/migration, OpenAPI/client validation, no provider
    dependency, and token redaction.
- Migration/schema review:
  - Additive-only migration
    `20260701115832_AddPushDeviceTokensFoundation` creates only
    `push_device_tokens` plus constraints, indexes, and restrictive foreign
    keys to `auth_accounts`, `auth_sessions`, and `user_profiles`.
  - No destructive operation against existing tables or columns.
  - No plaintext token column and no committed secret/key/provider
    credential/default secret material.
  - Token material is stored as `protected_token_blob`.
  - Dedupe/correlation uses internal HMAC fingerprint fields.
- OpenAPI/generated-client review:
  - OpenAPI updated at `packages/contracts/openapi/settleora.v1.yaml`.
  - Generated web and Dart clients were refreshed and validated.
  - Token request input is write-only where possible.
  - Response schemas and generated response models exclude raw token, protected
    blob/ciphertext, fingerprint, and device-installation hash, exposing safe
    lifecycle metadata only.
- Token protection/redaction review:
  - Data Protection purpose is push-specific.
  - HMAC key must be configured and at least 32 bytes.
  - Registration and token-based revocation fail closed with safe `503` when
    fingerprint key/config is missing.
  - No raw token, protected blob, fingerprint, provider payload, provider
    credential, or realistic provider token is exposed in responses, generated
    clients, docs, tests, issues, or reports.
- Auth/session/current-user binding review:
  - Endpoints require the existing authenticated-user policy.
  - Server-derived actor/account/profile/session IDs are the only authority.
  - Request bodies cannot target another account, profile, user, role, or
    session.
  - Current-token revocation is scoped to the authenticated actor and current
    session.
  - Current-session revocation affects push token bindings only, not auth
    sessions.
- Explicitly not complete:
  - No real APNs/FCM provider sending.
  - No APNs/FCM secrets, credentials, signing/release config, provider account
    setup, or deployment/env setup.
  - No mobile app code.
  - No mobile OS permission/settings UI implementation or Figma output.
  - No #371 deep links/navigation.
  - No hosted runtime activation, scheduler, queue consumer, or push sender
    worker beyond the existing internal outbox processor service boundary.
  - No admin/global policy/readout under #635.
  - No public/admin UI.
  - No public/admin push payload readout, provider payload persistence, or
    raw provider request/response storage.
  - No source-business mutation.
  - No auth/session/security bypass behavior.
  - No storage/file-byte behavior outside the approved token-protection
    boundary.
  - No money, bill, split, settlement, payment, recurring, sync, OCR, import,
    export, or restore authority changes.
- Auto-close hygiene:
  - PR #647 originally auto-closed #634 due to a GitHub keyword phrase in the
    PR body.
  - Codex reopened #634 immediately and edited the PR body to remove the
    accidental auto-close phrase.
  - Final readback after hygiene: #634 is `OPEN` and Project status `Blocked`;
    the accidental close must not be read as completion of #634.
- Remaining related work:
  - #403 remains open because #634 A2/A3 Option A completed only the
    server-side token lifecycle foundation and disabled/unconfigured
    provider-neutral push runtime foundation, while real APNs/FCM providers,
    A4 mobile/Figma, APNs/FCM secrets/provider account setup, hosted
    activation, admin/readout, future route-family extensions after closed
    #371, recipient/policy/runtime
    wiring, and remaining notification work remain gated.
  - #369 remains open because #634 A2/A3 Option A are push token/runtime
    foundations only, not full Day 1 notification event-family acceptance.
  - #635 and #368 remain open; #371 is closed after PR #664.
  - #629, #632, #633, #638, and #641 remain closed/Merged as completed
    foundations/slices.
- Close/keep-open recommendation:
  - Keep #634 open/Blocked. A2 plus A3 Option A complete only the server-side
    token lifecycle foundation and disabled/unconfigured provider-neutral push
    runtime foundation, and the mobile push registration UX/readiness reference
    is only a no-code gate. Do not treat #634 as complete, and do not treat
    #403 as complete.
- Last verified repo/report references:
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/PUSH_TOKEN_PROTECTION_DESIGN.md`
  - PR #647:
    `https://github.com/tommytang213/Settleora/pull/647`
  - PR #649:
    `https://github.com/tommytang213/Settleora/pull/649`
  - PR #650:
    `https://github.com/tommytang213/Settleora/pull/650`
  - #634 A1 completion comment:
    `https://github.com/tommytang213/Settleora/issues/634#issuecomment-4853371580`
  - #634 A2 merge checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/634#issuecomment-4855524740`
  - Reports:
    `/workspace/logs/settleora-codex-report-20260701-1755-push-device-token-runtime-decision-packet-634.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1802-push-token-lifecycle-architecture-contract-634-a1.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1920-push-token-protection-design-634-a2-option-c.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-1951-push-token-a2-api-foundation-634-option-a.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-2032-push-token-a2-api-foundation-634-pr-merge.md`
    and
    `/workspace/logs/settleora-codex-report-20260701-2219-push-a3-provider-runtime-634-option-a.md`
    and
    `.codex/reports/settleora-codex-report-20260702-0005-mobile-push-registration-ux-design-gate-634.md`

### Issue #369 - Complete Day 1 in-app notification event coverage

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `60`, `Initial MD` `2`,
  `Man-days Remaining` `2`, `Figma Required` `Yes`, `Manual Gate` `Yes` by
  GraphQL readback on 2026-06-30. GitHub issue remains `OPEN` and Project
  status remains `Needs Architecture Review` by readback on 2026-07-01 after
  PR #650 and by issue readback on 2026-07-02 before the
  `sync.operation_failed` implementation branch report. Issue readback before
  `docs/auth-session-security-notification-source-policy-369-20260702` showed
  #369 still `OPEN`; related #371 is now `CLOSED` after PR #664.
- Parent epic readback: #368 is `OPEN`; Project status
  `Needs Architecture Review`, `Progress %` `33`, `Figma Required` `Yes`,
  `Manual Gate` `Yes`. GitHub issue #368 remains `OPEN` by readback on
  2026-07-01.
- Last verified at main SHA:
  `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`.
- Current remaining-gates checkpoint on 2026-07-03 HKT:
  - Verified `origin/main` is
    `503d29530a4d317f937edab383a248e47050f776`, the PR #681 merge commit, and
    it includes the expected #681 visual-polish merge after PR #680 closed #672.
  - Live issue readback: #368 `OPEN`, #369 `OPEN`, #403 `OPEN`, #634 `OPEN`,
    and #635 `OPEN`; #371 `CLOSED` after PR #664 and must not be redone without
    a concrete regression; #570 `CLOSED` after PR #626 and #575 `CLOSED` after
    PR #576, which is consistent with current docs/runtime because only
    `ocr.needs_review` assignment/runtime is complete while `ocr.completed` and
    `ocr.failed` remain blocked; #672 `CLOSED` after PR #680; #679 `CLOSED`
    after PR #681.
  - Completed notification event-family/runtime/control slices verified by
    merged PRs include: recurring due-soon PR #560
    `12bbdbdf1f00912589dea5d38d9d2ac5949af440`; notification preferences
    PR #561 `0ed5547a230cbad1f4dbb366d9c873dca38099df`; coverage review
    PR #562 `40bf0d7aaa294221a272143376afcd963228ccae`; settlement coverage
    PR #563 `99b2c6b2112a44ffada671da1294aca2481213a8`; bill workflow
    PR #564 `52667ccdf8447157b265a61ed4ec6993b3a8faa7`; bill revision PR #565
    `ea2560cb2648f8890a6c185f7296e389b473a2c6`; recurring draft-generated
    PR #566 `25a519530821fd611f3b6bd2ddbbfa8d96cf9c54`; target-reference
    docs/control PR #567 `7cb283612cd8e5d5a95e7e8ecfeebba1fc572358` and
    OCR/sync target-reference runtime PR #569
    `64351208be72558329547cdd1fc415005c9be075`; sync conflict PR #572
    `04e8a18bbf2ef280845cf6978638bec949e597c0`; OCR source-state/policy
    PRs #573 `ce808da646146a5177444caff4702f1c645da994`, #574
    `d755e00efb0db386ace386ed136af66aa79c3b30`, #576
    `21c55062a8b7c49a7058e2fbc879b3c5c79bc822`, and #626
    `ecbabe1bfe432deb8b10617ac59395f338c05b0b`; decision/delivery/provider
    foundations PR #630 `34caca01a6a746f08b1892134a9510b9265cb645`, #636
    `94f71c96446780966bec7cefc415c0ee6bbdd54e`, #639
    `de2a7a38fe902c71592fef62d26fab4a4797ca5a`, #642
    `8b4ac6361a84065aefb01b6bb1fe827ef0fd752d`, #645
    `39d1d669cc55988da31d4c5b76800c3f29aa4e83`, #647
    `7898d8f75008474a6bc1aff6d0a02552291f2bc4`, #649
    `200d608da2b2b6ebb8d0d80cfd67ad58e9715414`, #650
    `1983832614394ed0dd8c8c6d4aab63e512e42b4b`, #652
    `98dc4ab0e6ae7363b0d3638c3d17500c3a26f610`, and #653
    `1c94fda04dfcea282bc15f6d06a83ce5cb7faaef`; sync operation failed
    PR #654 `d58c03753f16741fac0a572de16f1447711c6f64`; settlement residual
    review PR #656 `1766fe9962fe0b4f6d543e0d3aa4c87490e608cf`; remaining sync
    source-policy PR #657 `d814d2a221b2335366bebbdb372f8e1c1c85fc71`; #371
    route/open implementation and close PRs #658
    `40afe9babff51aade50b3312ef77a85f7db65a74`, #663
    `8b27a132aca6e6c52f602a940ef0d245ec46e9e5`, and #664
    `2da7de49d0b5ee662dac8ea36199a6e03fdf6e87`; auth/session/security
    source-policy PR #665 `e98f6b880b4e87980ec747532783492fc3869d0f`.
  - Remaining gates by category:
    in-app event constants/writers/tests have no currently safe small runtime
    slice unless a future source-state/manual gate first approves exact source
    transitions and safe targets; source-state/design gaps remain for
    `ocr.completed`/`ocr.failed`, remaining sync queued/retry/resolved flows,
    auth/session/security events, item claim/split/creator-review, and broader
    settlement mismatch/review or debtor residual-decision notifications;
    OpenAPI/generated-client/schema changes are allowed only as part of a
    later exact runtime slice with reviewed source states; #371 mobile
    notification-open/deep-link work is closed; #634 push/provider/device-token
    work remains open/Blocked for real APNs/FCM providers, provider secrets,
    hosted activation, mobile registration/permission UX, feedback cleanup, and
    release/deployment gates; #635 admin/global policy/readout remains open;
    auth/session/security notification runtime remains blocked by manual
    auth-security and target-reference gates; final Day 1 notification
    acceptance/release readiness, manual UI retest, and manual code review are
    not complete.
  - Recommended next action: do not start a runtime notification slice from
    #369 solely because the issue is open. The next safe path is a docs/design/
    decision gate for the highest-priority remaining blocked family, preferably
    auth/session/security target-reference plus manual auth-security approval,
    or a #635 admin/global policy/readout decision if operator policy should
    gate provider work first.
  - Close/keep-open recommendation: keep #369, #368, #403, #634, and #635
    open; keep #371, #570, #575, #672, and #679 closed unless a concrete
    regression or newly approved follow-up scope is filed separately.
- #635 admin/global policy readout checkpoint on
  `docs/notification-635-admin-global-policy-readout-20260703`:
  - Verified `origin/main` is
    `7d371c33a8317e64d1df289f8318b2712fb6926d`, the PR #682 merge commit,
    before starting the #635 readout branch.
  - Live issue readback during the branch showed #368 `OPEN`, #369 `OPEN`,
    #403 `OPEN`, #634 `OPEN`, and #635 `OPEN`; #371 `CLOSED`, #570 `CLOSED`,
    #575 `CLOSED`, #672 `CLOSED`, and #679 `CLOSED`.
  - Added `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md` as a
    docs/control policy readout for global channel caps, provider readiness
    states, security/money force-in-app and external-channel policy, quiet
    hours/digest/group mute boundaries, policy precedence, authorization and
    audit requirements, product-facing readout behavior, and implementation
    split planning.
  - This is not runtime implementation and does not add notification event
    constants, writers, schema, OpenAPI/generated clients, provider sending,
    admin UI, mobile UI, secrets, deployment, auth/session/security runtime,
    money/settlement/storage/OCR/sync behavior, or #371 deep-link behavior.
  - #635 remains open. Future #635 implementation remains blocked until manual
    admin/security, schema/migration, OpenAPI/generated-client, provider,
    audit, and UI/Figma gates are cleared in focused child tasks.
- Completed child slices now recorded:
  - #634 / PR #647 completed the A1 push token lifecycle
    architecture/contract design checkpoint. PR #649 completed the A2
    token-protection design checkpoint. PR #650 completed the A2 server-side
    push token lifecycle API foundation with protected token storage,
    authenticated current-user token register/revoke APIs, additive
    `push_device_tokens` persistence, OpenAPI updates, regenerated web/Dart
    clients, safe lifecycle metadata responses only, fail-closed fingerprint
    configuration behavior, and no provider dependency. It did not implement
    mobile code, APNs/FCM provider runtime or sending, provider secrets,
    hosted activation, admin/readout, #371 deep links, or full Day 1
    notification acceptance.
  - #634 A3 Option A branch
    `feature/push-a3-provider-runtime-634-option-a-20260701` adds only the
    internal disabled/unconfigured provider-neutral push runtime foundation:
    safe payload builder, `mobile_push` outbox integration, no-active-token
    handling, bounded provider categories, and no fake `sent`/`delivered`
    success. It does not add real APNs/FCM sending, mobile UI, hosted
    activation, admin/readout, #371 deep links, or Day 1 notification
    acceptance.
  - #632 / PR #645 completed only the disabled-by-default SMTP runtime
    foundation. It did not add recipient email-address source/policy, hosted
    runtime activation, deployment/env/secrets setup, admin/global
    policy/readout, push/device-token runtime, OpenAPI/readout, UI, or deep
    links, and it does not complete full Day 1 notification event-family
    acceptance.
  - #633 is closed for its own provider-neutral delivery-state
    persistence/worker foundation after PR #636 architecture/design, PR
    #639/#638 persistence/service foundation, PR #642/#641 worker/outbox
    foundation, PR #643 ledger checkpoint, and PR #644 closure. This does not
    complete full Day 1 notification event-family acceptance.
  - PR #642 / #641 completed only the provider-neutral worker/outbox
    foundation over `notification_delivery_attempts`. It did not add SMTP
    runtime, push runtime, provider adapters, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, hosted runtime activation, or
    deep links.
  - PR #639 / #638 completed only the provider-neutral delivery-attempt
    persistence/service foundation for eligible `email` and `mobile_push`
    decisions. It did not add worker/outbox processing, SMTP runtime, push
    runtime, provider adapters, device-token APIs/storage, admin/global policy,
    OpenAPI/readout, UI, or deep links.
  - PR #636 / #633 completed the delivery-state worker foundation architecture
    review only. It did not add event-family runtime, provider delivery,
    source states, OpenAPI event values, schema, UI, or deep links.
  - PR #630 / #629 completed the internal notification decision-envelope
    foundation only. It did not add new Day 1 event-family runtime, provider
    delivery, source states, OpenAPI event values, schema, UI, or deep links.
  - PR #626 / #570 completed the narrow OCR `ocr.needs_review` runtime for
    explicit API-owned assignment creation/retarget transitions only.
  - Earlier merged #369/#367/#370 slices already cover recurring due-soon,
    notification preferences infrastructure, notification event coverage
    review, settlement notification coverage, bill workflow coverage, bill
    revision coverage, recurring draft-generated coverage, #568 OCR/sync target
    references, and #571 persisted sync-conflict-only runtime.
  - Branch `feature/sync-operation-failed-notification-369-20260702`
    implements the next narrow #369 sync slice for
    `sync.operation_failed`: newly persisted current-actor
    `SyncOperationStatuses.Rejected` rows write one unread in-app notification
    with first-class `syncOperationId`, safe sync operation action URL, current
    actor recipient, and bounded safe resource metadata. Accepted operations,
    replay/idempotency reuse, existing conflict rows, and invalid requests that
    do not persist a rejected row do not write this notification. This branch
    updates OpenAPI/generated clients only for the notification event enum and
    adds an additive EF migration that widens notification event-type check
    constraints; it does not implement queued/resolved/retry/conflict
    resolution, mobile/deep links, provider send, admin policy, or broader sync
    behavior.
  - Branch
    `feature/settlement-residual-review-needed-notification-369-20260702`
    implements the narrow settlement residual-review notification slice:
    successful debtor-created payment claims that persist pending
    receiver-confirmation residuals write one unread
    `settlement.residual_review_needed` in-app/provider-neutral notification
    to the receiver/creditor, with existing settlement payment/request target
    references, safe action URL, privacy-safe metadata, replay/no-op duplicate
    prevention, and no residual amount/reason/payment/proof/storage details.
    This branch updates OpenAPI/generated clients only for the notification
    event enum and adds an EF migration that widens notification event-type
    check constraints; it does not change settlement business schema, money,
    residual policy, allocation, confirmation, balance projection, proof,
    provider send, mobile/deep links, or admin policy behavior.
  - Branch
    `docs/auth-session-security-notification-source-policy-369-20260702`
    adds the auth/session/security notification source-policy gate. It records
    that current auth/session/security runtime has real API-owned session,
    credential, refresh/session-family, MFA/passkey, recovery-code, security
    policy, and auth audit foundations, but security notification runtime is
    not implementation-ready because event semantics, event constants,
    first-class targets, recipient/self-notification policy, redaction,
    authorized re-fetch paths, and manual auth-security approval are missing.
- Remaining Day 1 work:
  - Future OCR `ocr.completed` and `ocr.failed` events require server OCR
    worker/job source states and safe recipient/action policy first.
  - Remaining sync notification events such as queued, conflict resolved, retry
    behavior, conflict resolution behavior, mobile deep links/UI, and broad
    offline-sync expansion remain future work.
  - Auth/session/security notification runtime remains blocked behind the
    manual auth-security source-policy and target-reference gates. Do not
    infer security notifications from profile display, current-user/session
    display, cached mobile session lists, local-only mode, generated-client
    availability, or generic auth audit rows without reviewed event semantics.
  - Item claim/split/creator-review notification coverage remains blocked on
    source claim runtime and #349/#350 money/Figma/manual gate posture unless
    separately approved in the repo.
  - Future settlement debtor notification after receiver residual decisions
    and broader settlement mismatch/review event coverage remain separate
    source-state/policy work.
  - Push/email provider delivery, provider workers, digests, delivery receipts,
    background delivery, admin/global policy, Day 1 notification acceptance,
    production readiness, release readiness, manual UI retest, and manual code
    review are not completed by #626, #630, #636, #639, #642, #643, #644,
    #645, #647, #649, or #650.
- Future gates requiring explicit approval:
  - #371 notification-open/deep-link scope is closed after PR #664 and should
    not be redone.
  - Auth/session/security source-policy, target-reference design, and manual
    auth-security approval before security-impactful notifications.
  - OpenAPI/generated-client/schema/runtime work only for exact implemented
    event types with reviewed source states and safe targets.
- Close/keep-open recommendation:
  - Do not close #369 or mark it `100`. PR #626/#570 is one completed child
    runtime slice, PR #630/#629 is one internal foundation slice, PR #636/#633
    is one architecture slice, PR #639/#638 is one provider-neutral
    persistence/service foundation slice, PR #642/#641 is one provider-neutral
    worker/outbox foundation slice, PR #644 closed #633 for delivery-state
    persistence/worker foundation, PR #645/#632 is one disabled-by-default SMTP
    runtime foundation slice, PR #647/#649/#650 are #634 push-token lifecycle
    design/protection/API-foundation checkpoints, and
    `feature/sync-operation-failed-notification-369-20260702` is one narrow
    `sync.operation_failed` implementation slice, and
    `feature/settlement-residual-review-needed-notification-369-20260702` is
    one narrow settlement residual-review implementation slice, and
    `docs/auth-session-security-notification-source-policy-369-20260702` is
    one auth/session/security docs/control gate. None of these is full Day 1
    notification event-family acceptance.
- Last verified repo/report references:
  - `docs/architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`
  - `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
  - Issue #369 PR #626 progress comment:
    `https://github.com/tommytang213/Settleora/issues/369#issuecomment-4844221960`
  - Branch report:
    `/workspace/logs/settleora-codex-report-20260702-0112-sync-operation-failed-notification-369.md`
- Post-#635/#689 remaining event coverage gate review on
  `docs/notification-369-remaining-event-coverage-gate-review-20260705`:
  - Verified starting `origin/main` is
    `09e785401c04c5edbcbeb7e26bf9b4b046275d0f`, the PR #706 merge commit for
    the #635 parent remaining-gates packet.
  - PR #707 `docs: review remaining notification event coverage gates` merged
    at merge SHA `8ec5a7c854c40072e7e8418bab865c774fd68c01` from reviewed
    head `c360d63c847948161fd424e29996f5a1da205dc0`.
  - PR #707 state after merge is `MERGED`; merged at
    `2026-07-05T07:39:01Z`.
  - Source branch
    `docs/notification-369-remaining-event-coverage-gate-review-20260705` was
    restored/retained at reviewed head
    `c360d63c847948161fd424e29996f5a1da205dc0` after GitHub auto-deleted it.
  - Live issue readback showed #369, #368, #403, #634, and #635 remain `OPEN`;
    #371, #570, and #575 remain `CLOSED`.
  - Adds
    `docs/planning/NOTIFICATION_369_REMAINING_EVENT_COVERAGE_GATE_REVIEW.md`
    as the current decision digest for completed evidence, remaining blocked
    event families, dependency posture, safest next slice, and close/keep-open
    recommendations after the #635/#689 readout-first chain completed.
  - Completed or sufficiently evidenced #369 slices remain bill workflow and
    revision events, settlement request/payment/proof/residual-review events,
    recurring due-soon/draft-generated events, OCR `ocr.needs_review`, sync
    conflict/operation-failed events, current-user in-app notification APIs,
    preference foundations, target-reference foundations, and closed #371
    notification-open/deep-link behavior.
  - Remaining gaps are OCR completed/failed, remaining sync queued/retry/
    resolved/conflict-resolution events, auth/session/security events, item
    claim/split/creator-review events, broader settlement mismatch/review or
    debtor residual-decision events, and provider/delivery/admin policy items
    that are still relevant only as separate #403/#634/#635 gates.
  - Recommended next narrow path: no runtime slice should start from #369
    alone. Run an auth/session/security notification target-reference and
    source-event manual decision gate first, or continue provider/operator
    readiness under #635/#403/#634 without claiming #369 closure.
  - Close/keep-open recommendation: keep #369 and #368 open; keep #403, #634,
    and #635 open; keep #371, #570, and #575 closed unless a concrete
    regression or separately approved follow-up exists.
  - Scope confirmation: docs-only; no runtime/API/OpenAPI/generated-client/
    schema/migration/provider/UI/auth/session/security/money/settlement/bill/
    OCR/storage/sync/reconciliation/deployment/CI/Docker/env/secret changes,
    issue closure/reopen, or Project mutation.
  - Merge-gate report:
    `.codex/reports/settleora-codex-report-20260705-1533-notification-369-gate-review-pr707-merge-gate.md`.

### Issue #403 - Day 1 email, push, provider, preference, delivery-state split

- GitHub state/project status: issue `OPEN`; Project status
  `Needs Figma / Reference`, `Progress %` `80`, `Man-days Remaining` `1`,
  `Figma Required` `Yes`, `Manual Gate` `Yes` by GraphQL readback on
  2026-06-30 after PR #630. GitHub issue remains `OPEN` and Project status
  remains `Needs Figma / Reference` by readback on 2026-07-01 after PR #650.
- Last verified at main SHA:
  `1983832614394ed0dd8c8c6d4aab63e512e42b4b`.
- Completed docs/control child slices now recorded:
  - #448 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #493 merged on 2026-06-24. It
    completed the notification event taxonomy and in-app baseline coverage
    control slice only.
  - #449 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #494 merged on 2026-06-24. It
    completed SMTP email provider policy docs/control only.
  - #450 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #495 merged on 2026-06-24. It
    completed mobile push provider abstraction and device-token lifecycle
    policy docs/control only.
  - #451 is `CLOSED`; Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, linked PR #496 merged on 2026-06-24. It
    completed admin/user notification preference resolution model
    docs/control only.
  - #452 is `CLOSED`; Project row was stale before this checkpoint and has now
    been updated to Project status `Merged`, `Progress %` `100`,
    `Man-days Remaining` `0`, `Actual Done Date` `2026-06-28`, and
    `Blocking Gate` `None`. The issue comment says it closed the
    UX/reference gate only through repo-tracked Day 1 UX/reference decisions
    and existing domain references.
- Completed adjacent design/runtime slices that must not be redone:
  - #634 / PR #647 completed the A1 push token lifecycle
    architecture/contract design checkpoint. PR #649 completed the A2
    token-protection design checkpoint. PR #650 completed only the A2
    server-side token lifecycle API foundation: additive `push_device_tokens`
    persistence, push-specific protected token storage and HMAC fingerprint
    boundaries, authenticated current-user token register/revoke endpoints,
    OpenAPI updates, regenerated web/Dart clients, safe lifecycle metadata
    responses only, fail-closed missing fingerprint config behavior, and no
    provider dependency. #634 remains open/Blocked; PR #650 did not implement
    mobile code, APNs/FCM provider runtime or sending, provider secrets, hosted
    activation, admin/readout, #371 deep links, or provider payload behavior.
    Branch `feature/push-a3-provider-runtime-634-option-a-20260701` adds the
    A3 Option A internal provider-neutral push runtime foundation:
    disabled/unconfigured default provider, safe payload builder,
    `mobile_push` outbox processing integration, no-active-token handling, and
    protected token unprotect only inside the push send boundary. It still does
    not implement real APNs/FCM sending, provider secrets, hosted activation,
    mobile UI, admin/readout, #371 deep links, or full #403 completion.
  - #632 / PR #645 completed only the approved Option A disabled-by-default
    SMTP runtime foundation: internal SMTP adapter boundary, safe
    disabled/unconfigured outcomes, #629/#638/#641 integration through
    approved delivery-attempt/outbox boundaries, generic privacy-safe
    templates, bounded redacted provider-result categories, no fake `sent` or
    `delivered` success, no real network dependency in tests, and no source
    business mutation. It did not add recipient email-address source/policy,
    hosted runtime activation, production deployment/env/secrets setup,
    admin/global policy/readout, push/device-token runtime, OpenAPI/readout,
    UI, deep links, auth/session/security notification behavior, email
    digests/bulk campaigns/marketing, or money/source-business authority.
  - #641 / PR #642 completed only the provider-neutral
    worker/outbox processing foundation over `notification_delivery_attempts`:
    internal lease service and outbox processor boundaries, lease metadata,
    retry/backoff handling, idempotent safe no-op behavior, bounded
    pre-provider state transitions, and focused tests. It did not add hosted
    runtime activation, SMTP runtime, push runtime, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, or deep links.
  - #638 / PR #639 completed only the provider-neutral
    `NotificationDeliveryAttempt` persistence/service foundation for eligible
    external-channel decisions. It did not add worker/outbox processing, SMTP
    runtime, push runtime, provider adapters, device-token APIs/storage,
    admin/global policy, OpenAPI/readout, UI, or deep links.
  - #633 is closed for its own provider-neutral delivery-state
    persistence/worker foundation after PR #636 architecture/design, PR
    #639/#638 persistence/service foundation, PR #642/#641 worker/outbox
    foundation, PR #643 ledger checkpoint, and PR #644 closure. It did not
    implement hosted provider runtime activation, push runtime/device-token
    storage, admin/global policy, external delivery-state API/readout,
    OpenAPI/generated-client exposure, UI/deep links, provider secrets,
    deployment, recipient-email source/policy, or remaining event-family
    source-state work.
  - #629 / PR #630 completed only the internal notification
    decision-envelope foundation: provider-free resolver, bounded
    `in_app`/`email`/`mobile_push` channel vocabulary, bounded decision/reason
    vocabulary, decision-only external-channel outcomes, in-app baseline
    eligibility behavior, and focused resolver tests.
  - #570 / PR #626 completed only the narrow `ocr.needs_review` in-app
    notification runtime for explicit API-owned OCR review assignment
    creation/retarget transitions.
  - #571 / PR #572 completed only the narrow persisted
    `sync.conflict_detected` runtime for newly persisted sync conflict rows.
  - Earlier #369 child slices completed current bill workflow/revision,
    settlement request/payment/proof, recurring due-soon, recurring
    draft-generated, current-user in-app notification APIs, and current-user
    notification preference persistence boundaries where documented in
    `DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`.
- Remaining Day 1 provider/preference/delivery-state work:
  - SMTP/email runtime foundation is complete only for disabled-by-default
    internal SMTP sending behind server/operator configuration. Actual
    recipient email-address source/policy, hosted runtime activation,
    production deployment/env/secrets setup, admin/readout, OpenAPI/readout,
    UI/configuration surfaces, digests/bulk emails, and security-sensitive
    notification behavior remain separate gated work.
  - Mobile push provider runtime is partially implemented only as #634 A3
    Option A disabled/unconfigured provider-neutral foundation. #634 A2 covers
    the server-side token lifecycle foundation. Remaining push follow-ups must
    still cover real APNs/FCM provider adapters, provider secrets/account
    setup, hosted activation, OS permission/mobile registration UX, stale-token
    cleanup from real provider feedback, multi-device provider behavior,
    admin/readout, and #371 deep links. This remains manual-gated for
    provider/secrets, mobile release configuration, deployment/env,
    auth/security-sensitive behavior, and UI/Figma.
  - Server-side notification preference resolution is not implemented beyond
    current persisted current-user preference readouts and the internal #629
    decision-envelope foundation. Future work must implement admin/global caps,
    group/thread mute, channel capability checks, provider/device readiness,
    required/security-event bypass policy, and runtime wiring before provider
    delivery.
  - Hosted worker runtime activation is not implemented. PR #642 added only
    provider-neutral internal lease/outbox service boundaries and processing
    rules, without a hosted background service, scheduler, queue consumer,
    RabbitMQ consumer, cron, endpoint, notification-writer hook, provider
    adapter, push sending, device-token API/storage, deployment, environment,
    or secret behavior. PR #645 added only the disabled-by-default SMTP
    adapter foundation and did not activate hosted delivery. Current in-app
    unread/read/archive state is separate and must not be treated as provider
    delivery truth.
  - #632 closure does not complete #403. It closes only the
    disabled-by-default SMTP runtime foundation sub-scope; push/device-token
    runtime (#634), admin/global policy/readout (#635), #371 deep links/mobile
    UI, hosted runtime activation, recipient-email source/policy,
    OpenAPI/readout, and remaining notification work stay open/gated.
  - #634 A2/A3 Option A do not complete #403. They complete only the
    server-side token lifecycle foundation and disabled/unconfigured
    provider-neutral push runtime foundation; real APNs/FCM providers, A4
    mobile/Figma, APNs/FCM secrets/provider account setup, hosted activation,
    admin/readout, future route-family extensions after closed #371, and
    remaining notification work stay open/gated.
  - Any external delivery-state API/readout requires a separate
    OpenAPI/generated-client gate.
  - Admin/global notification policy APIs and admin UI are not implemented.
  - Notification deep-link/mobile UI implementation for current supported
    families is complete and #371 is closed after PR #664. Future route-family
    extensions remain separately gated if new event families need mobile
    handling.
  - Real push provider adapters, admin/global policy, mobile registration/UI,
    deep-link, hosted activation, recipient-email source/policy, and provider
    runtime expansion work remains separate and gated.
- Future gates requiring explicit approval:
  - Provider/secrets/deployment/env/mobile release gates for SMTP expansion
    and push.
  - OpenAPI/generated-client and schema/migration gates for any contract,
    delivery-state, device-token, admin-policy, or preference-runtime storage
    changes.
  - Auth/session/security manual policy gate before security-impactful
    notification runtime or bypass behavior.
  - #371 mobile/deep-link implementation and any UI-sensitive work.
  - Source-state gates for OCR completed/failed, item claim/split,
    settlement mismatch/residual/review, and remaining sync event families.
- Close/keep-open recommendation:
  - Keep #403 open as a parent/split tracker. The original docs/control
    children #448-#452, the internal #629 foundation, the #633 delivery-state
    persistence/worker foundation, the #632 disabled-by-default SMTP
    foundation, the #634 A2 server-side push token lifecycle API foundation,
    and #634 A3 Option A disabled/unconfigured push runtime foundation are
    complete, but real push provider adapters, hosted runtime activation,
    mobile integration/UI, recipient-email source/policy, server-side
    preference resolution beyond the foundation, admin policy, and #371
    implementation remain separate work and should be split into focused
    implementation issues before runtime expansion starts.
- Current #635 readout checkpoint:
  - Branch `docs/notification-635-admin-global-policy-readout-20260703`
    adds `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md` and links it
    from the architecture index.
  - It defines only the admin/global notification policy design and readout
    gate. It does not complete #403, #635, #634, #369, or #368.
  - Future #403/#635 work still needs separate manual admin/security,
    schema/migration, OpenAPI/generated-client, provider/secrets/deployment,
    audit, and UI/Figma gates before runtime or admin exposure work.
- Last verified repo/report references:
  - `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`
  - `docs/planning/DAY1_UX_REFERENCE_DECISIONS.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2228-notification-day1-provider-remaining-gates-split-403-369.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260630-2331-notification-decision-envelope-foundation-629-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-0107-notification-delivery-state-worker-architecture-633-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1325-notification-delivery-attempt-persistence-foundation-638-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1444-notification-delivery-worker-outbox-foundation-641-pr-merge.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1755-push-device-token-runtime-decision-packet-634.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1802-push-token-lifecycle-architecture-contract-634-a1.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1920-push-token-protection-design-634-a2-option-c.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-1951-push-token-a2-api-foundation-634-option-a.md`
  - Report:
    `/workspace/logs/settleora-codex-report-20260701-2032-push-token-a2-api-foundation-634-pr-merge.md`

### Issue #635 - Admin global notification policy API and readout

- GitHub state/project status: issue `OPEN` by live issue readback on
  2026-07-03 HKT during branch
  `docs/notification-635-child-issue-breakdown-20260703`. Project field
  mutation was not attempted.
- Last verified at main SHA:
  `573801c447d2b4bd2eccb84a7f5713235190d87d` after PR #683.
- Completed PRs/slices:
  - PR #683, merge SHA
    `573801c447d2b4bd2eccb84a7f5713235190d87d`: merged the
    admin/global notification policy docs/control readout.
- Completed docs/control scope:
  - Adds `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`.
  - Updates `docs/architecture/README.md`.
  - Updates this ledger.
  - Defines admin/global policy as the deployment/admin cap over in-app, email,
    and mobile push channels.
  - Preserves in-app as the Day 1 baseline where an event is supported,
    eligible, authorized, and safe.
  - Records that email and push are optional attempts only when admin/provider
    policy, provider readiness, content safety, and user preference allow them.
  - Records that user and group preferences cannot widen admin/global policy.
  - Defines provider readiness and delivery/readout states such as
    `unsupported`, `unconfigured`, `disabled`, `muted`, `deferred`, `queued`,
    `sent`, and `failed`, and keeps `delivered` unavailable without future
    provider receipt semantics.
  - Defines precedence: event eligibility and content safety; admin/provider
    cap; explicit security/required/money policy; user preference; group mute;
    quiet-hours/digest; device/platform/provider availability.
  - Defines admin/owner authorization and audit requirements for future
    policy reads/updates, including redaction boundaries for provider secrets,
    device tokens, auth/session details, raw OCR/receipt text, storage
    internals, payment details, private notes, and hidden bill details.
  - Defines product-facing admin/user/mobile/web readout behavior without
    exposing backend/provider internals or implying delivery success.
  - Recommends future child tasks for policy model/schema/API, OpenAPI and
    generated clients, admin/user readout references, provider readiness
    integration, audit tests, and final acceptance.
- Child issues created/reused on 2026-07-03 HKT:
  - #684 `Admin notification policy schema and API design`:
    `https://github.com/tommytang213/Settleora/issues/684`.
  - #685 `Admin and user notification policy readout UX reference`:
    `https://github.com/tommytang213/Settleora/issues/685`.
  - #686 `Notification provider readiness integration policy`:
    `https://github.com/tommytang213/Settleora/issues/686`.
  - #687 `Notification policy resolution runtime wiring`:
    `https://github.com/tommytang213/Settleora/issues/687`.
  - #688 `Notification policy audit and redaction coverage`:
    `https://github.com/tommytang213/Settleora/issues/688`.
  - #689 `Admin notification policy final acceptance`:
    `https://github.com/tommytang213/Settleora/issues/689`.
- Remaining Day 1 work:
  - Policy schema/API implementation.
  - OpenAPI/generated-client contracts.
  - Admin/user/mobile/web readout UI references and implementation.
  - Provider readiness integration and real provider activation gates.
  - Audit/redaction tests and authorization tests.
  - Final #635 acceptance after runtime work.
- Future gates requiring explicit approval:
  - Manual admin/security approval for reads/mutations and
    security/money-critical bypass behavior.
  - Schema/migration gate.
  - OpenAPI/generated-client gate.
  - Provider/secrets/deployment gate for SMTP/APNs/FCM or hosted activation.
  - UI/Figma gate for admin/user/mobile/web readouts.
  - Audit/security gate for policy-change logging and redaction.
- Non-goals confirmed for this branch:
  - No runtime API, schema, migration, OpenAPI, generated-client, provider
    sending, SMTP/APNs/FCM secrets, admin web exposure, mobile permission UX,
    auth/session/security runtime, money/settlement/storage/OCR/sync behavior,
    #371 deep-link behavior, deployment/env/CI, Figma output, screenshots, or
    binary assets.
- Close/keep-open recommendation:
  - Keep #635 open. This branch makes later implementation ready to split, but
    it does not implement the policy API or readout.
  - Runtime remains blocked until the relevant #635 child gates clear.
  - Keep #368, #369, #403, and #634 open.
  - Keep #371, #570, #575, #672, and #679 closed unless a separate concrete
    regression or approved follow-up scope is filed.
- Last verified repo/report references:
  - `docs/architecture/ADMIN_GLOBAL_NOTIFICATION_POLICY.md`
  - `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md`
  - `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
  - `docs/architecture/NOTIFICATION_DELIVERY_STATE_WORKER_FOUNDATION.md`
  - `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md`
  - `docs/architecture/PUSH_PROVIDER_DEVICE_TOKEN_LIFECYCLE.md`
  - `.codex/reports/settleora-codex-report-20260703-2215-notification-635-admin-global-policy-readout.md`
  - `.codex/reports/settleora-codex-report-20260703-2225-notification-635-admin-global-policy-readout-pr-merge.md`

- #684 schema/API design gate checkpoint on
  `docs/notification-684-schema-api-design-gate-20260703`:
  - Base main SHA:
    `1a7798dadfc9b8dd0395de603e3062131b600fc1` after PR #690.
  - Adds
    `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md` and
    links it from `docs/architecture/README.md`.
  - Defines future persistence concepts only, including a
    `notification_global_policy` policy root,
    `notification_event_policy_overrides`, and bounded policy audit metadata.
    These are design-level names only, not approved EF entities, table names,
    migration names, OpenAPI schema names, or generated-client contracts.
  - Defines the future API/domain service boundary: API owns policy reads,
    writes, validation, authorization, resolver composition, and product-facing
    readouts; user/group preferences can narrow policy only; provider
    readiness cannot be invented by preferences or device state.
  - Designs future OpenAPI endpoint families without editing OpenAPI:
    `GET /api/v1/admin/notification-policy`,
    `PUT/PATCH /api/v1/admin/notification-policy`,
    `GET /api/v1/notification-policy/readout`, and an optional bounded
    provider-readiness readout endpoint with no secret configuration exposure.
  - Records owner/admin mutation requirements, current-user readout boundaries,
    audit events for reads/writes where appropriate, and redaction rules for
    SMTP/APNs/FCM secrets, provider payloads, raw device tokens, raw
    OCR/receipt text, storage internals, payment details, private notes,
    hidden bill data, and auth/session secret material.
  - Records future migration/rollout safety: explicit EF migrations only, no
    production startup auto-migration, in-app baseline enabled where supported,
    external channels disabled/unconfigured until configured, no silent
    widening of delivery, no fake provider success, and self-hosted
    TrueNAS/Docker-compatible degrade behavior.
  - Records the future test plan and implementation split: schema/API
    implementation behind manual/admin/security/schema/OpenAPI gates, then
    OpenAPI/generated clients, resolver/runtime wiring, #685 UI readout gate,
    #686 provider readiness integration, #688 audit/redaction coverage, and
    #689 final acceptance.
  - #684 should remain open pending design review/PR merge and later
    implementation. #635 remains open. Runtime remains blocked.
  - This docs/design branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, provider sending, provider secrets,
    auth/session/security runtime, money/settlement/storage/OCR/sync behavior,
    notification constants/writers, #371 notification-open behavior,
    deployment/env/CI, Figma output, screenshots, binary assets, or issue
    closure.

- #686 provider-readiness policy gate checkpoint on
  `docs/notification-686-provider-readiness-policy-gate-20260703`:
  - Base main SHA:
    `a857a6368b367f5914c49be7740e8057c81402e9` after PR #691.
  - Adds
    `docs/architecture/NOTIFICATION_PROVIDER_READINESS_POLICY.md` and links it
    from `docs/architecture/README.md`.
  - Defines provider readiness as a bounded signal into admin/global
    notification policy, not delivery success and not authority for event
    creation, recipient authorization, money truth, storage access, OCR
    acceptance, sync acceptance, auth/session state, or audit truth.
  - Defines design-level readiness states: `unsupported`, `disabled`,
    `unconfigured`, `configured`, `degraded`, `failing`, `rate_limited`,
    `maintenance`, `unknown`, and `ready`. Only `ready` permits a normal
    external attempt by default; `configured` is not enough by itself to claim
    attempts are allowed.
  - Records SMTP/email, APNs/iOS push, FCM/Android push, and in-app baseline
    boundaries. In-app is not an external provider-readiness state and remains
    the Day 1 baseline where an event is supported, eligible, authorized, and
    safe.
  - Inserts provider readiness into the future #635/#684 resolver after
    event support/content safety and admin/global channel caps, and before
    security/money external redaction policy, user preference, group mute,
    quiet-hours/digest, and device/platform availability.
  - Records source-of-truth boundaries: API/domain owns effective policy
    resolution; provider config/secrets are never exposed through policy
    readout; deployment/operator config may determine configured/unconfigured
    state without leaking values; user preferences, group mute, quiet-hours,
    device state, generated clients, browser cache, and mobile cache cannot
    invent provider readiness.
  - Defines product-facing and operator-facing readout semantics for
    unsupported, disabled, unconfigured, degraded, failing, deferred, queued,
    sent/attempted, and failed states without exposing secrets, tokens,
    private hostnames where sensitive, provider payloads, credentials, raw
    provider errors, payment details, OCR text, storage internals,
    auth/session data, or hidden bill data.
  - Defines future failure/retry posture for transient failure, permanent
    failure, rate limits, invalid recipient/device token, provider
    unavailable, queued/deferred attempts, idempotency/readout expectations,
    and audit-safe error categories.
  - Records self-hosted posture: external providers default to disabled or
    unconfigured until intentionally configured; missing external providers do
    not fail startup by themselves; TrueNAS/Docker-friendly warnings/readouts
    stay product-facing and non-secret; hosted activation and real provider
    secrets remain manual/deployment gates.
  - Recommends future split ordering: readiness config/readout design
    acceptance, secret/config-loading design if needed, SMTP readiness/readout
    adapter without sending, APNs/FCM readiness/readout adapter tied to #634
    without token handling unless #634 approves it, policy resolver
    integration through #687, audit/redaction through #688, and final
    acceptance through #689.
  - Records future test plan for provider state mapping, blocking
    unconfigured providers, admin disabled cap precedence, preference/group/
    quiet-hours narrowing only, device-state narrowing only, cache/generated
    client non-authority, secret/token redaction, safe failure
    classification, in-app baseline preservation, and unchanged #371 behavior.
  - #686 remains open pending design review/PR merge and later implementation
    acceptance unless the close rule is clearly satisfied. #635 and #634
    remain open. Runtime remains blocked. Keep #371 closed.
  - This docs/design branch does not implement SMTP/APNs/FCM runtime, provider
    SDKs, device-token handling, secrets/config files, deployment/env/CI,
    mobile release/signing, API runtime, schema/migrations, OpenAPI/generated
    clients, admin UI, mobile UI, notification constants/writers/provider
    delivery, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes, Figma
    output, screenshots, binary assets, or issue closure.

- #685 notification policy readout UX reference checkpoint on
  `docs/notification-685-policy-readout-ux-reference-20260704`:
  - Base main SHA:
    `d1c37256da4b416964c1b1afef58a9ee8806b96a` after PR #692.
  - Adds
    `docs/design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md`,
    adds `docs/design/notifications/README.md`, and links the notification
    design folder from `docs/design/README.md`.
  - Defines this packet as a non-authorizing UX/reference gate only. It does
    not approve runtime API, schema/migrations, OpenAPI/generated clients,
    admin/user/mobile/web UI implementation, provider sending, provider
    secrets, device-token handling, deployment, CI, or Figma API output.
  - Covers admin/operator global policy readouts, user settings readouts,
    mobile notification settings/readouts, user web settings/readouts,
    notification detail/error/explanation surfaces, and empty/degraded/
    disabled states.
  - Defines product-facing matrix guidance for `unsupported`, `disabled`,
    `unconfigured`, `configured`, `ready`, `degraded`, `failing`,
    `rate_limited`, `maintenance`, `unknown`, `muted`,
    `quiet_hours_deferred`, `digest_deferred`, `device_unavailable`,
    `token_missing`, `queued`, `sent_or_attempted`, `failed_transient`,
    `failed_permanent`, `blocked_by_admin_policy`,
    `blocked_by_security_policy`, `blocked_by_privacy_policy`,
    `blocked_by_user_preference`, and `blocked_by_group_preference`.
  - Records copy rules: no raw enum strings as primary UI copy, no raw provider
    failure codes in user copy, no normal-user "backend/client/server" debug
    wording except self-hosted "this server" product copy where appropriate,
    action-specific button labels, non-blaming unavailable states, in-app
    fallback where eligible, and no implied external delivery success without
    provider confirmation.
  - Records redaction boundaries for SMTP/APNs/FCM secrets, private hostnames
    where sensitive, raw device tokens, protected token blobs, provider
    payloads/errors, rendered external bodies when unauthorized, payment
    details, OCR/receipt text, storage internals, auth/session data, hidden
    bill data, private notes, and unrelated recipient/user data.
  - Defines admin versus normal-user distinction: admins may see bounded
    non-secret readiness/policy categories and setup/review actions; users see
    effective availability and preference actions only where allowed.
  - Defines reference-only mobile/web/admin layout guidance and accessibility
    expectations compatible with Settleora V1 mobile, user-web, and admin-web
    references.
  - Recommends future split ordering: manual review, optional Figma/reference,
    API/readout contract from #684, provider readiness readout from #686,
    separate UI implementation slices, accessibility/copy review, #688
    audit/redaction cross-check, and #689 final acceptance.
  - #685 remains open pending review/PR merge and future UI/reference
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684 and #686 remain open. Runtime remains blocked. Keep #371 closed.
  - This docs/design branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, user web UI, mobile UI, provider
    sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, or issue
    closure.

- #687 notification policy resolver wiring design gate checkpoint on
  `docs/notification-687-policy-resolver-wiring-design-gate-20260704`:
  - Base main SHA:
    `e29de98d7d9ff791f19f85c501de31571fd0bce6` after PR #694.
  - Adds
    `docs/architecture/NOTIFICATION_POLICY_RESOLVER_WIRING_DESIGN.md` and
    links it from `docs/architecture/README.md`.
  - Defines this packet as a non-authorizing docs/design control gate for
    future resolver wiring only. It does not authorize runtime resolver code,
    API endpoints, schema/migrations, OpenAPI/generated clients, provider
    sending, provider secrets, device-token handling, admin/user/mobile UI,
    deployment, CI, production audit plumbing, notification constants/writers,
    or #371 behavior.
  - Records future resolver ownership: API/domain owns effective notification
    policy resolution; clients may display readouts only; workers and provider
    adapters cannot mutate core business tables or invent notification-policy
    decisions; provider readiness is an input only; user/group preferences can
    narrow optional delivery only; admin/global policy plus security, money,
    and privacy rules remain authoritative.
  - Defines design-level input groups only: event type/family and source
    state, actor/request context, recipient authorization and group
    membership, content safety/privacy class, admin/global caps, event-family
    overrides, provider readiness, user preferences, group/thread preference
    or mute, quiet-hours/digest/defer/expiry, device/platform availability,
    audit/redaction policy version, and idempotency/correlation context. These
    are not approved schema fields, DTOs, EF entities, OpenAPI schemas, or
    generated-client contracts.
  - Reconciles resolver precedence as: event support/eligibility/source
    ownership/recipient authorization/content safety; admin/global channel,
    event-family, timing, and sensitivity caps; provider readiness;
    security/money required in-app or external redaction rules; user
    preference; group/default/thread preference or mute; quiet-hours, digest,
    deferral, and expiry; device/platform and worker/outbox availability; then
    audit/redaction category generation. Earlier blocks short-circuit later
    external delivery while preserving in-app where safe and eligible.
  - Defines conceptual future outputs only, including effective channel
    decision, decision/readout/audit category, external attempt eligibility,
    defer/queue/expiry category, provider readiness category used, safe
    user/admin explanation keys, redaction policy version, policy reference,
    and idempotency/correlation reference. These are not OpenAPI or generated
    client contracts.
  - Records channel semantics for in-app baseline, email, mobile push, SMS
    unsupported Day 1, future digest/deferred delivery, unsupported/
    unconfigured/disabled/degraded/failing/rate-limited provider states,
    token/device unavailable categories, policy blocks, quiet-hours/digest
    deferral, and attempted versus confirmed delivery.
  - Integrates #688 audit/redaction posture: no raw payload storage; redact
    before logs, audit, readouts, reports, comments, screenshots, tests,
    fixtures, metrics, and traces; normalize resolver/provider/token/device
    states into safe categories; forbid secrets, device tokens, provider
    payloads, raw OCR/receipt text, storage internals, payment details, hidden
    bill data, private notes, and auth/session data.
  - Records future dependency gates before runtime: #684 schema/API
    implementation approval, OpenAPI/generated-client gate if contracts
    change, #686 provider readiness implementation or safe input contract,
    #688 audit/redaction implementation strategy, manual admin/security
    review, #634 approval for device-token/provider interaction, accepted #685
    readout reference, and Figma/UI gates before surfaces use resolver
    outputs.
  - Records future test plan for precedence/order, admin cap non-widening,
    security/money required in-app behavior, provider readiness no-fake-success
    behavior, provider unavailable states, quiet-hours/digest deferral,
    device/token push-only narrowing, block categories, idempotency/
    correlation, audit/redaction safety, API authorization if endpoints exist,
    OpenAPI/generated-client validation if contracts exist, and unchanged #371
    notification-open/deep-link regressions.
  - Records rollout posture: fail closed for external delivery when unknown,
    preserve safe in-app baseline, do not fail app startup due to missing
    optional providers, do not turn unconfigured providers into normal-user
    runtime exceptions, keep self-hosted deployments safe by default, and
    never produce fake success states.
  - Recommends future split ordering: manual review of this packet, then a
    small API/domain resolver skeleton behind feature-neutral tests if
    approved, schema/API/OpenAPI tasks only after #684 implementation gate,
    provider readiness adapter after #686 gate, audit/redaction tests after
    #688 gate, readout surfaces after UI/API gates, and final acceptance
    through #689.
  - #687 should remain open pending review/PR merge and future implementation
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684, #686, and #688 remain open unless separately satisfied. #685 remains
    closed unless a concrete reference regression exists. Runtime remains
    blocked. Keep #371 closed.
  - This docs/design branch does not implement runtime resolver code, API
    endpoints, schema/migrations, OpenAPI/generated clients, admin UI, user
    web UI, mobile UI, provider sending, SMTP/APNs/FCM runtime, secrets/config
    files, device-token handling, auth/session/security runtime, money/
    settlement/storage/OCR/sync behavior, #371 notification-open behavior,
    #672/#679 state changes, deployment/env/CI, Figma output, screenshots,
    binary assets, production audit plumbing, or issue closure.

- #687 notification policy resolver runtime foundation checkpoint on
  `feature/notification-687-policy-resolver-runtime-foundation-20260705`:
  - Base main SHA:
    `90e5355ba071972f1295d19ca191ce98dcd2d141` after PR #701.
  - GitHub state/project status:
    issue `CLOSED` as completed after PR #702 merged the approved narrow
    resolver-runtime foundation.
  - Merged PR:
    #702 `feat(api): add notification policy decision resolver foundation` at
    merge SHA `f7d8239b963b2cbc2ba4fb9a852c25c92645f1be`.
  - Reviewed implementation head:
    `235b8747113a6bb984448c79520a86ec05ec11a0`.
  - Implementation branch:
    `feature/notification-687-policy-resolver-runtime-foundation-20260705`,
    retained at `235b8747113a6bb984448c79520a86ec05ec11a0`.
  - Report:
    `.codex/reports/settleora-codex-report-20260705-1335-notification-687-resolver-pr702-merge-gate.md`.
  - Completed slice:
    - Added a scoped internal notification decision policy resolver that loads
      the active API-owned admin/global notification policy, applies
      event-family overrides, consumes bounded provider-readiness categories,
      and translates those inputs into existing
      `NotificationDecisionChannelPolicy` values for the pure
      `NotificationDecisionEnvelopeResolver`.
    - Preserved the existing stateless resolver constructor and existing
      in-app baseline behavior.
    - Preserved fail-closed external defaults: without persisted policy,
      external email and mobile push are disabled even when readiness is
      configured.
    - Preserved `MayAttemptExternalProvider=false`; configured/readiness-
      eligible channels resolve only to future-provider eligibility and do not
      send or claim provider success.
    - Added focused tests proving unsupported event-family/channel caps,
      provider unconfigured mapping, admin-disabled precedence over configured
      readiness, user preference narrowing, quiet-hours/digest deferral,
      future-provider-only configured candidates, required/security in-app
      baseline preservation, and sent/failed vocabulary remaining delivery-
      attempt/provider-runtime state outside this resolver slice.
  - Remaining gates:
    - No SMTP/APNs/FCM sending, provider SDK activation, provider config/
      secrets, device-token lifecycle behavior, admin write API, UI,
      OpenAPI/generated-client change, schema/migration, production audit
      plumbing, resolver audit hooks, #371 behavior, #634 behavior, or
      unrelated event-writer work is completed by this slice.
    - #689 final acceptance remains open and is not ready until approved
      implementation slices merge and final acceptance checks pass.
    - Future provider sending, device/provider runtime, admin writes, mutation
      audit, UI/readout surfaces, and any OpenAPI/schema expansion remain
      separately gated.
  - Close/keep-open recommendation:
    keep #687 closed as completed for the narrow resolver-runtime foundation
    merged by PR #702. Keep #635 and #689 open for broader policy/final
    acceptance. Keep #403, #369, #368, and #634 open. Keep #684, #685, #686,
    #688, #371, #570, #575, #672, and #679 closed unless a concrete
    regression or approved follow-up changes that posture.

- #688 audit/redaction coverage gate checkpoint on
  `docs/notification-688-audit-redaction-coverage-gate-20260704`:
  - Base main SHA:
    `2649f0cacefbb26d223f0fcf9e97834a97ffef1c` after PR #693.
  - Adds
    `docs/architecture/NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md` and
    links it from `docs/architecture/README.md`.
  - Defines this packet as a non-authorizing docs/security/control coverage
    gate for future audit/redaction requirements only. It does not authorize
    runtime API, schema/migrations, OpenAPI/generated clients, provider
    sending, secrets, device-token handling, admin/mobile/user-web UI,
    deployment, CI, production audit plumbing, notification constants/writers,
    or #371 behavior.
  - Covers future admin/global policy reads and mutations, current-user
    effective policy readouts, provider-readiness readouts, degraded/failing/
    maintenance/rate-limited readouts, resolver decisions, later delivery
    attempt result categories, notification detail explanations,
    admin/operator diagnostics, logs, metrics, reports, CI artifacts, issue
    comments, screenshots, and test fixtures.
  - Records design-level safe category candidates such as `policy_read`,
    `policy_updated`, `policy_denied`, provider readiness categories,
    delivery deferred/queued/attempted/failure categories, admin/security/
    privacy/user/group preference block categories, `token_missing`, and
    `device_unavailable`.
  - Defines a forbidden-data matrix covering SMTP/API/app passwords, APNs/FCM
    credentials, private keys/certificates/team IDs where sensitive, raw or
    reversible device tokens, provider payloads and raw provider errors,
    unauthorized rendered external bodies, auth/session secrets, raw
    OCR/receipt text/images/storage keys, storage internals, payment details,
    private notes, hidden bill/settlement details, unauthorized recipient
    lists, private hostnames/ports where sensitive, and unrelated user data.
  - Defines future redaction/normalization requirements: non-reversible
    identifiers, short purpose-bound token fingerprints only if approved, safe
    provider error categories, URL/host classification before display,
    category/state/action event payload reduction, explicit allow-listing for
    money/security/OCR/storage/auth/payment fields, admin readout redaction,
    and debug-mode redaction by default.
  - Records authorization expectations for owner/admin policy mutation audit,
    admin/operator read authorization, current-user effective-state readouts,
    denial auditing without existence leakage, and the rule that policy audit
    does not replace money/settlement/bill/OCR/sync/storage/auth/security
    source-domain audit.
  - Defines conceptual audit fields only: opaque actor/admin ID, action
    category, policy ID/version if approved, channel/event-family category,
    safe readiness category, decision category, timestamp, request correlation
    ID, redaction policy version, and result category. Raw payload storage is
    forbidden.
  - Records future test plan for redaction helpers, policy read/update audit,
    forbidden-field absence in admin/user readouts, provider-readiness
    redaction, resolver categories, UI copy snapshots if surfaces exist,
    negative raw OCR/storage/payment/auth/session tests, log/audit fixture
    tests, OpenAPI/generated-client contract tests when contracts exist, and
    #371 regression preservation.
  - Records self-hosted posture: Docker/TrueNAS logs safe by default, debug mode
    cannot dump secrets/raw provider payloads without a future explicit
    local-only diagnostic gate, provider unconfigured/disabled/degraded/failing
    states use safe categories, and missing external provider config is a
    readout category rather than a fatal startup condition by itself.
  - Recommends future sequence: manual/security review, redaction helper/design
    implementation if approved, audit event schema/API after #684, provider
    readiness redaction tests after #686, UX/readout snapshots after #685
    surfaces exist, resolver audit hooks after #687, and final acceptance
    through #689.
  - #688 should remain open pending review/PR merge and future implementation
    acceptance unless the close rule is clearly satisfied. #635 remains open.
    #684 and #686 remain open unless separately satisfied. #685 is closed and
    should not be reopened without a concrete reference regression. Runtime
    remains blocked. Keep #371 closed.
  - This docs/security branch does not implement runtime API, schema/migrations,
    OpenAPI/generated clients, admin UI, user web UI, mobile UI, provider
    sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, production
    audit plumbing, or issue closure.

- #635 runtime-entry decision checkpoint on
  `docs/notification-635-runtime-entry-decision-packet-20260704`:
  - Base main SHA:
    `09f1f26efd9d46ad995d9baf048b3dab43b0f974` after PR #695.
  - Adds
    `docs/planning/NOTIFICATION_635_RUNTIME_ENTRY_DECISION_PACKET.md`.
  - Live issue readback confirmed #635, #684, #686, #687, #688, #689, #403,
    #369, #368, and #634 are open; #685, #371, #570, #575, #672, and #679 are
    closed.
  - Records current merge state:
    - PR #691 merged #684 schema/API design at
      `a857a6368b367f5914c49be7740e8057c81402e9`.
    - PR #692 merged #686 provider-readiness design at
      `d1c37256da4b416964c1b1afef58a9ee8806b96a`.
    - PR #693 merged #685 UX/readout reference at
      `2649f0cacefbb26d223f0fcf9e97834a97ffef1c`; #685 is closed.
    - PR #694 merged #688 audit/redaction coverage at
      `e29de98d7d9ff791f19f85c501de31571fd0bce6`.
    - PR #695 merged #687 resolver-wiring design at
      `09f1f26efd9d46ad995d9baf048b3dab43b0f974`.
  - Records that #689 final acceptance remains open and not ready because
    implementation slices have not merged.
  - Gate posture:
    manual/admin/security, schema/migration, OpenAPI/generated-client,
    provider/secrets/deployment, #634 device-token/provider, #688 audit/
    redaction implementation, UI/Figma/readout implementation, and #689 final
    acceptance remain separate gates.
  - Recommended next runtime path:
    prepare a small #684 schema/API implementation task only after
    Tommy/manual approval. Otherwise pause #635 runtime and switch lanes.
  - Alternative options recorded:
    #687 resolver skeleton without persistence only if explicitly approved as
    domain-only/no-public-API/no-provider work; #686 provider readiness runtime
    is not first unless provider activation/readiness is the priority and gates
    clear; #688 redaction helpers are a possible companion or security-first
    foundation; deferral is safe if gates are not approved.
  - Manual decisions pending:
    whether to start #684 runtime; whether the first slice includes EF schema/
    migration; whether it includes OpenAPI/generated clients; whether Day 1
    gets admin write API or read-only/readout first; whether provider readiness
    is read-only category input first; whether #687 waits for #684 contracts;
    whether #688 helpers precede public readout; and whether #635 admin UI
    stays docs/Figma-only until API stability.
  - Close/keep-open recommendation:
    keep #635, #684, #686, #687, #688, #689, #403, #369, #368, and #634 open.
    Keep #685, #371, #570, #575, #672, and #679 closed unless a concrete
    regression or approved follow-up changes the posture.
  - This docs/control checkpoint does not implement runtime API, schema/
    migrations, OpenAPI/generated clients, admin UI, user web UI, mobile UI,
    provider sending, SMTP/APNs/FCM runtime, secrets/config files, device-token
    handling, auth/session/security runtime, money/settlement/storage/OCR/sync
    behavior, #371 notification-open behavior, #672/#679 state changes,
    deployment/env/CI, Figma output, screenshots, binary assets, production
    audit plumbing, or issue closure.

- #686 provider-readiness category foundation implementation checkpoint after
  PR #699:
  - GitHub state/project status: #686 `CLOSED` as completed after PR #699
    merged the approved category/readout-only provider readiness foundation.
    Project field mutation was not attempted.
  - Last verified at main SHA:
    `9ed8cb49428ecb044ca2b6d102b15ef09c0e50d4`.
  - Merged PR:
    #699 `feat(api): add notification provider readiness categories` at merge
    SHA `9ed8cb49428ecb044ca2b6d102b15ef09c0e50d4`.
  - Reviewed implementation head:
    `a19f0adf6b2617ed45ea20c1f2da1d38d0ed9b59`.
  - Implementation branch:
    `feature/notification-686-provider-readiness-category-foundation-20260704`,
    retained at `a19f0adf6b2617ed45ea20c1f2da1d38d0ed9b59`.
  - Completed merged slice:
    - Added the internal `INotificationProviderReadinessService` boundary and
      `NotificationProviderReadinessSnapshotService`.
    - Added bounded, secret-free readiness categories for `email` and
      `mobile_push`.
    - SMTP readiness derives only from existing safe option completeness as
      `disabled`, `unconfigured`, or `configured`.
    - Mobile push readiness remains conservative: `disabled` when disabled and
      `unconfigured` when enabled because there are no safe APNs/FCM config
      fields yet.
    - Existing `GET /api/v1/admin/notification-policy` readout consumes those
      categories without changing the response shape.
    - Persisted/default admin policy caps remain authoritative.
    - `externalProviderAttemptAllowed` remains `false` for all channels.
    - Focused tests cover readiness derivation, readout category composition,
      admin-disabled precedence, auth/session protections, and forbidden-detail
      absence.
  - Remaining gates:
    - Real provider activation/config/secrets/sending remains future gated
      work and is not completed by #686.
    - #687 resolver runtime remains open as a separate task.
    - #688 audit/mutation/redaction runtime acceptance remains open.
    - #689 final acceptance remains open and is not ready.
    - #635 remains open for broader admin/global notification policy API,
      readout, resolver, audit, provider, and admin UI gates.
    - #403, #369, #368, and #634 remain open for broader notification,
      provider, device-token, delivery-state, and event-coverage work.
  - Close/keep-open recommendation:
    keep #686 closed as completed for the readout/category-only provider
    readiness foundation. Keep #635, #687, #688, #689, #403, #369, #368, and
    #634 open. Keep #684, #685, #371, #570, #575, #672, and #679 closed unless
    a concrete regression or approved follow-up changes that posture.
  - Non-goals confirmed for PR #699:
    no admin notification policy write/update/delete API, OpenAPI contract or
    generated-client change, EF schema/migration, SMTP/APNs/FCM sending,
    provider SDK activation, provider config/secrets, `.env`, Docker, compose,
    deployment, CI, device-token lifecycle behavior, mobile push permission UX,
    admin/user/mobile UI, Figma output, #371 notification-open behavior, #687
    resolver runtime, #688 mutation audit/runtime, #689 final acceptance,
    money/settlement/payment/bill calculation, OCR, storage, sync,
    reconciliation, auth/session/security behavior beyond existing admin read
    authorization, direct push to `main`, force push, branch deletion, or
    secret change.
  - Last verified repo/report references:
    - `.codex/reports/settleora-codex-report-20260705-0009-notification-686-provider-readiness-pr699-merge-gate.md`
    - `.codex/reports/settleora-codex-report-20260704-2340-notification-686-provider-readiness-pr-open.md`
    - `.codex/reports/settleora-codex-report-20260704-2325-notification-686-provider-readiness-category-foundation.md`

- #688 audit/redaction readout coverage implementation checkpoint on
  `feature/notification-688-audit-redaction-readout-coverage-20260705`:
  - Base main SHA:
    `7f78ff340c240690db664dfeccb350d97b78051e` after PR #700.
  - Reviewed implementation head:
    `b408e89d5b9105dc2b72f1100bcafcdb9cd87048`.
  - Completed slice:
    - Added focused redaction-helper regression coverage for fail-closed
      normalization of unsafe channel, channel-cap, readiness, readout
      category, event-family, content-class, and timing values.
    - Hardened admin notification policy endpoint coverage so unexpected
      provider-readiness strings containing SMTP host/user/password details,
      APNs/device-token wording, or provider payload wording normalize to
      bounded `unknown`/`provider_unknown` categories before serialization.
    - Expanded forbidden-string assertions for the current approved
      `GET /api/v1/admin/notification-policy` readout, including SMTP,
      APNs/FCM, provider payload/request, device-token/protected-token,
      storage/OCR/payment/private/hidden bill, and auth/session/MFA/passkey
      wording.
    - Added coverage proving the current read-only admin policy readout does
      not create notification-policy-specific audit rows; ordinary
      auth/session validation audit remains separate source-domain behavior.
  - Current surface posture:
    - The approved read-only admin/global policy readout and
      provider-readiness category surface remain bounded category readouts.
    - `externalProviderAttemptAllowed` remains `false`.
    - No policy mutation, resolver runtime, provider sending, provider config,
      OpenAPI/generated-client, schema/migration, UI, deployment, money,
      storage, sync, OCR, or auth/session runtime behavior changed.
  - Close/keep-open recommendation:
    close #688 after this test-only PR merges because the currently approved
    readout/provider-readiness audit-redaction coverage slice is satisfied.
    Keep future mutation/write audit, production audit plumbing, resolver
    audit hooks, delivery-attempt audit, and admin/operator diagnostic
    coverage as separate future gates under #635/#687/#689 or explicitly
    named follow-up issues.
  - Keep #635, #687, #689, #403, #369, #368, and #634 open. Keep #684, #685,
    #686, #371, #570, #575, #672, and #679 closed unless a concrete regression
    or approved follow-up changes that posture.

### Issue #458 - User web auth/session shell and navigation foundation

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #580, merge SHA `c83001caea4835b9fe2c8de0d1056484a0f09b2f`:
    implemented the user-web React/Vite auth/session shell, responsive
    navigation, auth-required/session boundary seam, safe placeholder route
    states, and visual evidence. It did not add fake login success, token
    persistence, auth runtime changes, OpenAPI changes, or generated-client
    edits.
- Completed scope:
  - Auth/session shell and navigation foundation for user web.
  - Session-required/expired presentation and generated-client boundary seam.
  - Modern rounded Settleora web shell direction recorded through PR evidence.
- Remaining Day 1 work:
  - Feature-complete bills, groups, friends/direct sharing, settlements,
    notifications, reports, import/export, backup, profile/payment, and
    account/security screens were explicitly future slices under later issues.
  - Real web auth credential wiring remains a future reviewed auth/security
    task.
- Future gates requiring explicit approval:
  - Auth/session/security runtime, token persistence, credential storage, or
    account/security settings.
  - OpenAPI/generated-client changes.
  - Figma/human UI approval for new production user-web screens.
- Blockers/manual decisions:
  - None for the completed #458 foundation slice.
  - Future auth/security runtime remains manual-gated.
- Close/keep-open recommendation:
  - Safe to keep closed as the #458 foundation slice is complete.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1815-user-web-auth-session-shell-nav-458.md`
  - Issue completion comment:
    `https://github.com/tommytang213/Settleora/issues/458#issuecomment-4825978404`

### Issue #459 - User web bills, groups, friends, and direct-sharing flows

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #581, merge SHA `d4b046cc53c120b1bf1d8a2691b3e6e7e1dbfc97`:
    merged `docs/planning/USER_WEB_BILLS_GROUPS_FRIENDS_IMPLEMENTATION_PLAN.md`.
  - PR #582, merge SHA `03560c687221b41c75195ba93cc2c1f593f206be`:
    added read-only personal bills readout.
  - PR #583, merge SHA `a2f85aa0d49fd003d76db85de8bbdff2c12eb69a`:
    added groups and friends readout surfaces.
  - PR #584, merge SHA `a4bbcd4f07fcadbb8b7b834c4680af3c41977cfa`:
    added group bills readout.
- Completed scope:
  - Planning gate for bills/groups/friends/direct-sharing flows.
  - Read-only user-web bills, groups/friends, and group-bills readout slices
    using existing generated-client boundaries.
- Remaining Day 1 work:
  - Full bill create/edit/lifecycle UI, receipt/file attachment handoffs, bill
    revision review, bill correction proposal/edit, friends/direct-sharing
    contract/runtime, and temporary participant claim/link contract/runtime
    remain follow-up slices where not already covered elsewhere.
- Future gates requiring explicit approval:
  - Money/split/rounding authority changes.
  - Storage/file privacy or attachment byte behavior.
  - Friends/direct-sharing API/OpenAPI/generated-client work.
  - Figma/human UI approval for production interaction depth.
- Blockers/manual decisions:
  - Future runtime slices must keep API/domain authority for authorization,
    money, storage, status transitions, and audit.
- Close/keep-open recommendation:
  - Safe to keep closed as the original planning gate and readout follow-ups
    have merged. Do not treat closure as completion of every future bill,
    group, friend, direct-share, file, or temporary-participant runtime slice.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-1948-user-web-bills-groups-friends-plan-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2105-user-web-bills-readout-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2134-user-web-groups-friends-readout-459.md`
  - `.codex/reports/settleora-codex-report-20260628-2207-user-web-group-bills-readout-459.md`
  - Issue completion comment:
    `https://github.com/tommytang213/Settleora/issues/459#issuecomment-4826032800`

### Issue #460 - User web settlement, notifications, profile, and payment-details flows

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #585, merge SHA `60bd9c3f51921692fe0a904d8139c865d8abd33e`:
    added read-only settlements readout.
  - PR #586, merge SHA `41082a5fa2653922f653704743b89dc975abe665`:
    added profile payment details readout.
  - PR #587, merge SHA `c40d4b314626d59e931f39836dd34956c0af53ac`:
    added settlement counterparty payment details readout.
  - PR #588, merge SHA `6e47bba2ffc4b0f8495eb8b5721f70ce77836f39`:
    added notifications readout.
  - PR #589, merge SHA `fc5a3c827fa4419caca1e7ff5af2d91cd45cd566`:
    added notification preferences readout.
  - PR #590, merge SHA `8249760740f90369ecff033438e82bfd50ac06a1`:
    added settlement proof metadata readout.
- Completed scope:
  - Settlement, profile/payment details, counterparty payment details,
    notifications, notification preferences, and settlement proof metadata
    readout surfaces for user web.
  - Privacy/visibility and unsupported-state messaging around payment details,
    QR/proof/file metadata, notification delivery, and user preference
    persistence boundaries.
- Remaining Day 1 work:
  - Full settlement action UI, proof upload/download byte flows, profile/payment
    edit/upload flows, channel delivery runtime, push/email provider behavior,
    and server-side notification suppression/filtering remain separate unless
    a later merged PR verifies them.
- Future gates requiring explicit approval:
  - Storage/file-byte behavior for proof or QR uploads/downloads.
  - Money/settlement/payment calculation or state-transition authority.
  - Auth/security, OpenAPI/generated-client, notification provider, push/email,
    or privacy policy changes.
  - Figma/human UI approval for production settlement and settings flows.
- Blockers/manual decisions:
  - Future mutations must preserve API/domain authority and payment-details
    visibility rules. No global payment directory is approved.
- Close/keep-open recommendation:
  - Safe to keep closed for the merged readout/checkpoint scope. Do not treat
    closure as approval for future payment/provider/storage/settlement mutation
    work.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260628-2245-user-web-settlements-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260628-2320-user-web-profile-payment-details-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0004-user-web-settlement-counterparty-payment-details-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0030-user-web-notifications-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0126-user-web-notification-preferences-readout-460.md`
  - `.codex/reports/settleora-codex-report-20260629-0150-user-web-settlement-proof-metadata-readout-460.md`

### Issue #461 - User web reports, search, export, import, and local-mode surfaces

- GitHub state/project status: issue `CLOSED`; Project status `Merged`,
  `Progress %` `100`, `Man-days Remaining` `0` by GraphQL readback on
  2026-06-30.
- Last verified at main SHA:
  `66e997098e737e85cd1d64a999ff18d01b165d9c`.
- Completed PRs/slices:
  - PR #591, merge SHA `4a7634d764d3c9eab89d773447980ff058e8803d`:
    user-web reports/search readout.
  - PR #592, merge SHA `86cc3bb9c939c0c312e56d3d48001fe2b37a911e`:
    export/import/local-mode surface plan.
  - PR #593, merge SHA `e6705a8041a1af4cd20d3b151d8217e873141dc1`:
    import/export availability readout.
  - PR #594, merge SHA `b381cbcd4136c65724e568a687109e64e72a1d0b`:
    export readiness contract plan.
  - PR #595, merge SHA `266a8e6fae354226280a901aca553ed47990718a`:
    bill export readiness contract.
  - PR #596, merge SHA `dd2af800b22b426cf6c2effe354b309e2def9a48`:
    readiness-gated export runtime.
  - PR #597, merge SHA `24d7773681ace08ca4386166882c8a4a2e4e1014`:
    group export runtime.
  - PR #598, merge SHA `0bf17a0024b2473651776bec723d84756117bfea`:
    import preflight/review plan.
  - PR #599, merge SHA `193475031c5d55af69a90c663734e6381cfd8ed8`:
    bill CSV import preflight contract.
  - PR #600, merge SHA `97914fee91f44254a9811f718e10b11e0c5ad6ac`:
    import preflight review runtime.
  - PR #601, merge SHA `c43042909a33852352f32537cc1722a615630cdd`:
    import confirmation contract plan.
  - PR #602, merge SHA `8c98ef88fceefd2b8616c40bf240ce11abd6cea6`:
    bill CSV import confirmation sessions.
  - PR #603, merge SHA `d240e929eaad9cb65bb6111a215795b0e530b19a`:
    import confirmation runtime.
  - PR #604, merge SHA `9561aafe360a340ad25e97539afed37f3c1f6ea2`:
    sync/local status surface plan.
  - PR #605, merge SHA `a4a27ba451b54b181a4e84d6935dc74ac23c03a8`:
    sync/local status contract plan.
  - PR #606, merge SHA `2e72d0e937bc12a32836297aa86b195e987a5b6e`:
    sync/local status read contract.
  - PR #607, merge SHA `5a9c7a6c2cb12ea76ec849fd67cc0a74f0037445`:
    sync/local status readout.
  - PR #608, merge SHA `f0bc262207b29de7a1c87cec9ec58a0fc90b5020`:
    local backup/restore surface plan.
  - PR #609, merge SHA `ab77f554b760a1410c9709a2e459f59b26dc5eb5`:
    local backup package contract plan.
  - PR #610, merge SHA `719af62f0154f53a1a6c0e578c91d9c49c74be75`:
    local backup package readiness contract.
  - PR #611, merge SHA `007170e5707654cf5f01fdf54324dc928f17d80c`:
    local backup package session plan.
  - PR #612, merge SHA `c1eaee71de53765b6a97cf86429d10ecbaa6dca2`:
    local backup package session contract.
  - PR #613, merge SHA `49926c547c03600499f437fa14c23cf28ef3327a`:
    local backup generation/download surface plan.
  - PR #614, merge SHA `6066eefed357f2592e1d60e7b983b9730d66c03a`:
    local backup package generation/download contract.
  - PR #617, merge SHA `a6564827c9c6d40f765a2dad9701ba3213bf06c3`:
    local backup package data artifact runtime.
  - PR #618, merge SHA `e8cc2d0f5379f4f2f7739780c7766e8d529df994`:
    user-web local backup package data download runtime.
  - PR #619, merge SHA `5a655c8028b424a59aac4ecbdf791a5eff177fb7`:
    local backup restore preview contract.
  - PR #620, merge SHA `1ab29e7795664af966cf0d5b69ce7cadc9e54934`:
    user-web local backup restore preview runtime.
  - PR #621, merge SHA `238d8eb143dfe7eb6d276ca2a722296f8164d680`:
    local backup restore confirmation contract plan.
  - PR #622, merge SHA `23346a2c9d71c8eb4a62342e1b4dd0ef6c276566`:
    local backup restore confirmation session contract.
  - PR #623, merge SHA `b0088732290cc6fe9fb907a6b668d89d368d6718`:
    user-web restore confirmation session runtime.
  - PR #624, merge SHA `66e997098e737e85cd1d64a999ff18d01b165d9c`:
    local backup personal bill candidate package/restore-preview slice.
- Completed scope:
  - Reports/search readout and import/export availability readouts.
  - Readiness-gated personal/group bill export runtime.
  - CSV import preflight, import confirmation sessions, and user-web import
    preflight/confirmation runtime.
  - Sync/local status read contract and readout.
  - Local backup package readiness, package sessions, generation/download
    metadata, data-only artifact runtime, user-web package download runtime,
    restore preview, restore confirmation sessions, and non-mutating personal
    bill candidate package/restore-preview coverage.
- Remaining Day 1 work:
  - Actual restore apply mutation remains unimplemented and not approved.
  - Durable/encrypted package storage remains separate.
  - File-byte package sections remain separate.
  - Package upload/storage remains separate.
  - Browser-local persistence/security design remains separate.
  - Full local-only authority-boundary persistence and local-to-server
    migration remain future-gated.
- Future gates requiring explicit approval:
  - Restore apply/mutation.
  - Storage/file-byte package sections, durable package storage, upload/storage,
    encryption/key-handling, or privacy/vault byte behavior.
  - Browser-local persistence using IndexedDB, localStorage, Cache Storage,
    service workers, object URLs, browser file-system APIs, or local queues.
  - OpenAPI/generated-client contract changes and API/domain authority changes.
- Blockers/manual decisions:
  - Human approval is required before treating #461 as proof that every Day 1
    reports/search/export/import/local-mode requirement is complete.
  - Future backup/restore mutation and browser-local authority decisions remain
    manual-gated.
- Close/keep-open recommendation:
  - Keep closed as current project status is `Merged`, but treat #461 as an
    umbrella/history checkpoint. Do not open duplicate work from stale issue
    text; create focused follow-up issues for the remaining gates above.
- Last verified repo/report references:
  - `.codex/reports/settleora-codex-report-20260629-1106-user-web-reports-search-readout-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1249-user-web-import-export-availability-readout-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1204-user-web-export-import-local-mode-plan-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1441-user-web-export-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-1751-user-web-import-preflight-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-2011-user-web-import-confirmation-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260629-2220-user-web-sync-local-status-runtime-461.md`
  - `.codex/reports/settleora-codex-report-20260630-1828-user-web-local-backup-personal-bill-data-package-preview-461.md`
  - `.codex/reports/settleora-codex-report-20260630-1913-user-web-local-backup-personal-bill-data-package-preview-pr-merge.md`
  - Issue checkpoint comment:
    `https://github.com/tommytang213/Settleora/issues/461#issuecomment-4842928407`

## Auto-runner Production Activation — Task 20260724-0946

- Tracker: #910; activation issue: #912.
- Runtime source: `fe60b4440e6d90141ddc9a379c95b04361861ff1`.
- Runtime bundle:
  `08c1c0c184fa3f939328472c784f4ac31f25d6019f1a84f55643cc1d9a04a992`.
- Corrective implementation PRs: #968, #984, and #987.
- Runnable acceptance: #982 / PR #985 / merge
  `dabd2893242a6985dc5a9d81ed4ca526f64617a7`; #983 / PR #986 / merge
  `22f18c32bf74ae53db0ee369df5258063942bc99`.
- Skip fixtures #978-#981 were excluded before claim, de-labeled, and closed.
- Final post-fix canary: `supervised-20260724T053439Z-282e0da15c99`;
  zero accepted logical tasks and terminal `no-eligible-work`.
- Rollback/refusal/restore and the unexecuted 500-task/14-day dry-run passed.
- Historical logs at `/workspace/logs/settleora-auto-runner` were retained
  unchanged; the product queue was not started.
- Current GitHub state at this candidate: #912 and #910 remain open;
  acceptance-doc PR #988 is open and remains manual-merge-gated.
- Remaining gate: exact-head docs validation/reviews/checks, normal merge,
  current-main acceptance, then #912 and #910 close-rule rereads.
- Close/keep-open recommendation: keep #912 and #910 open until PR #988 merges
  and both live close rules pass; then close with one complete evidence comment.
- Last verified report reference:
  `/workspace/logs/settleora-codex-report-20260724-0946-auto-runner-production-activation-912.md`

## Auto-runner preserved-recovery validation retry — Issues #989, #991, and #959

- GitHub state at merge readback: #989, #991, and #959 remain `OPEN`.
- Repository repair PRs #998, #1001, #1003, and #1005 merged normally at their
  exact reviewed source heads. PR #1001 merged source head
  `a3a1e397d8a33b1d0915017caee21f3db25d3682` as merge
  `63c2e79e12e75473d2816e6be9a10bed6bf251e2`. The latest repair PR
  #1005 merged source head
  `31fc0056d0ec953b839befbbbc22f9ba268532a5` as merge/current-main SHA
  `3716b9c0ecf30742b76ccf3d9bfa9c6415ea50a9`.
- The merge parents are prior main
  `b60e1b258b9531a56bd63ff3631f80fca0dfe2c3` and the approved source head;
  the merge and source tree are both
  `fb42434ab7b6564c07d931e1274bd207cec7f73f`.
- Completed repository scope:
  - preserve validation-retry precedence and reopen only the exact known
    failed-closed derivative;
  - retain the reopened validation phase until recovered validation completes;
  - adopt exact push effects and route restart-safe ordinary continuation
    through `push`, `pr_create_recover`, and `ci_wait`;
  - bind recovery successor identity to the exact handoff request and
    authenticate that request before deriving or adopting the successor;
  - admit only an exact authenticated terminal, deployable pending, or
    completed active preserved-recovery posture during deployment. The live
    #959 pending fixture is observed at generation 4; the verifier is not
    globally pinned to that generation. Pending or active admission requires
    the exact request-bound handoff and interruption identity, internally
    consistent `mutationAuthority.generation === sessions.generation`,
    one-generation completion lineage, exact phase/report/effect posture, and
    every other preserved-recovery authority check;
  - preserve exact fail-closed lifecycle, deployment-admission, identity, and
    effect gates.
- Latest exact-head evidence: focused tests `105/105`; full auto-runner tests
  `1217/1217`; npm install, doctor, syntax, docs, scaffold, and diff checks
  passed; Gemini strong-independent and local Codex reviews passed with zero
  findings; GitHub Codex found no major issues; CodeQL, Semgrep CE/OSS, Trivy
  repository/external, and both scaffold checks passed; all review threads are
  resolved; relevant open code-scanning alerts are zero.
- Remaining operational gates:
  - deploy the corrected external runtime only under a separate explicit
    owner operation;
  - perform one separately authorized trusted `max-tasks=1` adoption of the
    preserved #959 chain;
  - prove no duplicate claim, accepted-task charge, branch, implementation
    replay, or external effect.
- Keep-open recommendation:
  - keep #989 open until corrected runtime deployment and trusted #959 restart
    acceptance satisfy its close rule;
  - keep #991 open until its deployment-and-resume close rule is satisfied;
  - keep #959 open until its preserved OCR implementation chain completes and
    merges.
- Follow-up workflow hardening: #999 tracks deterministic exact-head
  review-finding adjudication before source mutation. It is not implemented by
  PR #998 or this hygiene checkpoint.
- No runtime deployment, runtime-bundle copy, systemd/service/profile/config/
  environment/secret change, supervisor restart, or #959 mutation occurred in
  this repository merge task.
- Last verified report reference:
  `/workspace/logs/settleora-codex-report-20260727-1533-issue991-recovery-chain-full-closure.md`
