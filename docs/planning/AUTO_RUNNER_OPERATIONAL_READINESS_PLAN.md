# Auto-Runner Operational Readiness Plan

Issue #947 completed through PR #949. Its cleanup authority applies only to
newly completed positively owned ephemeral state after exact
merge/current-target/hygiene proof. PR #949 did not activate #912, perform
historical cleanup, retire release lines, or broaden deferred #946.

Status: #912 live activation accepted; acceptance documentation and tracker
hygiene remain in progress through PR #988.

Issue #944 completed through PR #945. The merged implementation extends the
#923/#924/#928/#929/#932 authorities with bounded recursive source-failure
convergence and adds an Android debug APK build to ordinary
`mobile-application` validation. It did not activate #912 or change any
external profile, deployment, credential, or scanner-disposition authority.

Acceptance-chain reconciliation snapshot: `origin/main` at
`210310d4cf292c63d2d2ba4a85845780144cbe2f` after PR #949. The foundation
issues #800, #889, and #894 remain closed. #913 and #921 are closed under their
narrow close rules. PR #917 is closed without merge as fully superseded, with
its source branch retained. #911 completed through PR #915, #902 through PR
#916, #923/#932 through PR #936, #928/#929 through PR #938, #924 through
PR #940, #927 through PR #942, #944 through PRs #945/#948, and #947 through
PR #949. #910 remains the readiness umbrella; #912 has completed its separate
manual production activation and awaits PR #988 plus close-rule hygiene.

This plan records the completed implementation and activation chain. Its
repository text does not itself change runner behavior, profiles, alerts, live
issues, or deployment/release state.

## Authority Rules

- Current GitHub state, PR state, checks, scanner state, and the current
  repository tree are authoritative.
- `docs/planning/ISSUE_PROGRESS_LEDGER.md` is a derived convenience index. It
  may support duplicate search or historical orientation, but stale ledger
  content must never decide work selection, completion, reopening, closure,
  merge eligibility, or duplication.
- External runner profiles under `/workspace/logs/settleora-auto-runner/` are
  deployment-owned configuration. Repository docs and code may define expected
  posture, but only a separate activation task may change those profiles.
- Genuine live/manual actions stay manual: production deploys, mobile store or
  TestFlight/Play submission, destructive data operations, force-like history
  operations, branch deletion, public/admin exposure changes, secrets/auth
  config changes, and unresolved user-visible product or financial authority
  decisions.

## Historical Pre-Implementation Profile Matrix

Safe inspection did not open secret files or print environment values. The
following matrix records the external-profile gap observed by the original
planning task. It is historical implementation context, not a current list of
unimplemented repository capabilities. The dated acceptance-chain snapshot
above is orientation only; live GitHub state and the current repository tree
remain authoritative.

| Capability | Observed normal/trusted workflow-doc config | Observed canary profile | Required production posture |
| --- | --- | --- | --- |
| Trusted real runs | Enabled only in one-off workflow-doc configs | Not enabled; canary approval only | Enabled for normal unattended production profile |
| Eligible labels | `auto-ready` in one-off configs | `auto-canary-ready` | Canonical runnable labels for approved lanes |
| Auto-merge | Disabled in normal one-off configs | Enabled only for low-risk canary, raw policy absent/null | Enabled conditionally, fail-closed |
| Approved lanes | None/null | None/null, canary exception only | Every canonical runnable lane explicitly listed |
| Required checks | Defaults in repo example; external configs not complete | Raw policy absent/null | Explicit required checks, no silent skipped/neutral checks |
| Cheap independent review | Enabled in trusted workflow-doc and canary configs | Enabled in canary profile | Enabled |
| Strong independent review | Disabled | Disabled | Enabled for sensitive/high-risk lanes and false-positive proof |
| Tie-breaker review | Disabled/unconfigured | Disabled/unconfigured | Enabled when independent and Codex/security reviews disagree |
| Codex mechanics/security | Enabled | Enabled | Enabled |
| Existing PR recovery | Disabled/null | Disabled | Enabled with exact issue/branch/PR/head correlation |
| Follow-up issue creation | Disabled | Disabled | Enabled with duplicate search and bounded per-run count |
| Review-fix mutation | Disabled | Disabled | Enabled only when lane allows it, bounded by cycle count |
| Max review-fix cycles | `0` | `0` | Explicit bounded positive value for allowed lanes |
| Max follow-up issues | Null or `0` | `0` | Explicit bounded value |
| Stale claim stealing | Disabled | Disabled | Normally disabled; only exact stale/orphan policy may opt in |
| Large-bundle override | Absent/null | Absent/null | Exact package-scoped approvals only |
| Supervisor/health | Health service active; notifier timer active; no generic runner service unit found | Same host state | Supervisor submission and monitoring operational with no implicit live runner activation |
| Retry/resubmission | In-run recovery budgets exist; no prolonged-outage resubmission controller | Same | Bounded recovery-first resubmission controller |

Required activation work:

1. Define one normal production profile that enables trusted real runs and all
   legitimate implemented autonomous capabilities.
2. Populate `autoMergePolicy.approvedLanes` with canonical runnable lane IDs:
   `workflow-docs-tooling`, `docs-planning`, `client-ui-low-risk`,
   `mobile-application`, `mobile-build-config`,
   `web-user-ui`, `web-admin-ui`, `api-domain-runtime`,
   `auth-session-security`, `storage-file-privacy-authz`,
   `money-settlement-payment`, `schema-migrations`,
   `openapi-generated-clients`, `sync-import-export-restore`, and
   `docker-compose-ci-deployment`.
3. Keep all aliases, split-required lanes, danger lanes, production deploys,
   store submissions, secrets, destructive actions, and unresolved manual
   decisions outside auto-merge authority.
4. Enable cheap, strong, tie-breaker, and Codex mechanics routes with explicit
   provider profile names, models, budgets, hard stops, and secret-file
   boundaries. Activation must verify secrets exist without printing contents.
5. Make checks fail-closed: required check names explicit, skipped/neutral
   allowed only by exact check name and only when justified.
6. Enable existing-PR recovery, follow-up issue creation, and review-fix
   mutation with explicit per-run/per-issue limits and exact-head evidence
   invalidation.
7. Keep stale-claim stealing disabled unless a separate stale/orphan recovery
   policy proves it safe.
8. Keep large-bundle exceptions exact-package scoped, time-bounded, and
   digest-bound.

## Mobile Build Lane Decision

Current `mobile-application` covers `apps/mobile/lib/**` and
`apps/mobile/test/**`. That is correct for ordinary Flutter app source and test
work, but it excludes legitimate source-controlled build inputs. Expanding
`mobile-application` would blur source UI/application work with platform build
configuration, signing-adjacent metadata, Gradle/CocoaPods/Xcode metadata, and
CI build surfaces. The planned design is a separate canonical
`mobile-build-config` lane.

### Path Inventory

| Category | Current tracked examples | Lane posture |
| --- | --- | --- |
| Flutter source | `apps/mobile/lib/**` | `mobile-application` |
| Tests | `apps/mobile/test/**` | `mobile-application` |
| Dependency manifests/lockfiles | `apps/mobile/pubspec.yaml`, `apps/mobile/pubspec.lock` | `mobile-build-config` when dependency/build impact exists; `mobile-application` only for pure Dart dependency changes if later policy proves safe |
| Assets/fonts/localization | `apps/mobile/web/**`, platform asset catalogs/resources | `mobile-build-config` for build/package inputs; source lane only for UI-only assets if narrowly contracted |
| iOS source/build config | `apps/mobile/ios/Runner/**`, `Info.plist`, storyboards, Swift files, `.xcconfig` | `mobile-build-config` |
| Android source/build config | `apps/mobile/android/**`, manifests, resources, Kotlin source, Gradle files | `mobile-build-config` |
| Permissions/entitlements/manifests | `Info.plist`, Android manifests, non-secret entitlements if added/tracked | `mobile-build-config`, strong review when permission/privacy/security-affecting |
| Xcode metadata | `Runner.xcodeproj/**`, `Runner.xcworkspace/**`, schemes | `mobile-build-config` |
| Gradle metadata/wrapper | `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, wrapper properties | `mobile-build-config` |
| CocoaPods metadata | `Podfile`, tracked lockfile if present | `mobile-build-config`; `Pods/**` excluded unless explicit repo policy later tracks it |
| Mobile CI/build metadata | mobile build workflows and validation scripts, if scoped to mobile build | usually `docker-compose-ci-deployment` or focused bundle with `mobile-build-config` |
| Signing/release/publication config | certificates, provisioning profiles, keystores, store metadata, live signing flags | manual-gated or forbidden |
| Generated/cache output | `build/**`, `.dart_tool/**`, DerivedData, Gradle caches/intermediates | forbidden |
| Secret/credential-bearing files | `.env*`, keystores, private keys, provisioning profiles, service credentials | forbidden/manual-gated |

### Planned Lane

`mobile-build-config`

- Purpose: source-controlled Flutter mobile platform build configuration for
  Android/iOS/macOS/Linux/Windows where the change is needed to build, test,
  package, or validate the app and does not perform live signing or release.
- Allowed paths:
  - `apps/mobile/pubspec.yaml`
  - `apps/mobile/pubspec.lock`
  - `apps/mobile/android/**`
  - `apps/mobile/ios/**`
  - `apps/mobile/macos/**`
  - `apps/mobile/linux/**`
  - `apps/mobile/windows/**`
  - `apps/mobile/web/**`
  - mobile-specific build validation docs under `docs/architecture/**`,
    `docs/qa/**`, or `docs/workflow/**` only when contracted.
- Forbidden/manual-gated paths and actions:
  - `apps/mobile/build/**`, `apps/mobile/.dart_tool/**`, DerivedData, Gradle
    caches/intermediates, generated local output.
  - `apps/mobile/ios/Pods/**` unless a future repo policy explicitly tracks
    and approves it.
  - Certificates, provisioning profiles, private keys, keystores, store/API
    credentials, secret `.env`, credential-bearing service config.
  - Live signing changes, TestFlight/Play/App Store submission, production
    release, external deployment.
- Reviewer tier: `strong_independent` by default because platform config often
  touches permissions, signing-adjacent, dependency, or build-chain behavior.
- Branch strategy: `focused/auto-<issue>-...`.
- Validation profile: new `mobile-build-config` profile:
  - `git status --short`
  - `git diff --name-only`
  - `git diff --check`
  - `npm run doctor:mobile`
  - `cd apps/mobile && /opt/flutter/bin/flutter pub get`
  - `cd apps/mobile && /opt/flutter/bin/flutter analyze`
  - `cd apps/mobile && /opt/flutter/bin/flutter test`
  - Android static/build validation where supported on the runner, such as
    Gradle wrapper integrity and debug assemble when local Android tooling is
    available.
  - iOS plist, entitlement, Xcode project, scheme, and CocoaPods static
    validation on Linux; macOS/Xcode compile/archive remains CI/manual where
    unavoidable.
- Auto-merge eligibility: allowed only after lane code/tests exist, exact
  contract paths match, strong independent review passes, Codex
  mechanics/security review passes, validation passes, CI/scanners pass, and
  no signing/release/manual-gate action is present.
- Generated clients: any OpenAPI/generated-client change stays in
  `openapi-generated-clients` or a split bundle; `mobile-build-config` must not
  silently hand-edit generated Dart clients.

Example issue contract:

```json
{
  "contractVersion": 1,
  "lane": "mobile-build-config",
  "allowedPaths": [
    "apps/mobile/android/app/build.gradle.kts",
    "apps/mobile/android/settings.gradle.kts",
    "apps/mobile/pubspec.yaml",
    "apps/mobile/pubspec.lock"
  ],
  "validationProfile": "mobile-build-config",
  "manualMergeRequired": false,
  "autoMergeEligible": true,
  "requiredReading": [
    "PROGRAM_ARCHITECTURE.md",
    "README.md",
    "docs/workflow/CODEX_TASK_GUIDE.md",
    "tools/auto-runner/lib/lane-policy.mjs",
    "tools/auto-runner/lib/validation-planner.mjs"
  ]
}
```

## #902 Accepted False-Positive Policy

#902 was amended and implemented through PR #916. The accepted unattended
model remains: a strongly proven false positive may be automatically
dispositioned only when all of these gates pass:

1. Exact repo, alert ID, rule/query, fingerprint, ref, analyzed SHA, tool, and
   scanner instance are captured.
2. Alert/head is unchanged immediately before disposition.
3. Source-to-sink or vulnerability analysis proves impossibility or scanner
   modeling inapplicability.
4. Deterministic tests, static proof, or reproduction evidence supports the
   analysis.
5. No suppression, query exclusion, workflow weakening, ignored file, broad test
   exclusion, or scanner gaming is used.
6. Strong independent security review passes on the exact evidence packet.
7. Separate Codex mechanics/security review approves the bounded mutation.
8. A tie-breaker passes when reviews disagree.
9. No contradictory evidence remains.
10. Evidence is durable and exact-SHA/digest-bound.
11. GitHub disposition uses a supported reason and a bounded API mutation.
12. Post-disposition current-main/scanner reconciliation proves the expected
    alert state.
13. A linked narrow issue closes only after its close rule is proven.
14. Changed fingerprint, code, analyzer version, rule/query, or assumptions
    create new work instead of reusing stale proof.

Incomplete proof keeps both the alert and linked issue open. The policy does
not allow broad suppression, automatic risk acceptance, ambiguous dismissal, or
stale-head evidence reuse.

## Retry And Automatic Resubmission

Current recovery state is useful but run-local:

- Outcome classes separate retryable infrastructure, retryable provider,
  review-fix-safe, CI-fix-safe, code-scanning-fix-safe, evidence regeneration,
  current-main reconciliation, follow-up issue, manual decision/action,
  unsafe/ambiguous, and terminal failure.
- Default budgets are bounded, for example infrastructure `2`, provider `1`,
  pending `3`, and focused fix/regeneration/reconciliation classes `1`.
- Mutation markers prevent duplicate claims, commits, pushes, PR creation,
  comments, merges, issue closure, label cleanup, ledger hygiene, and follow-up
  issues.
- Head changes invalidate validation, review, CI, scanner, merge eligibility,
  final-refresh, and post-merge evidence.
- Startup continuation can resume one safe recoverable state before polling new
  issues, and fails closed for multiple, corrupt, stale, or disabled recovery
  states.

Gap: a prolonged external outage can exhaust a run or stop after a reboot, but
there is no bounded controller that later resubmits the same task safely after
the dependency recovers.

Planned design: add a separate bounded `outage-resubmission` controller under
the supervisor, not inside the mutation worker. The worker remains finite. The
controller may resubmit only recovery-first work and only after proving:

- exact run/task/supervisor/issue/branch/PR correlation;
- one recoverable state, no ambiguity, clean repo/worktree, and no active newer
  run for the same issue/branch/PR;
- prior failure class is retryable GitHub, Actions, Codex, independent
  reviewer, scanner, or network outage;
- source failure, security finding, policy disagreement, manual/ambiguous/
  destructive action, stale head evidence, or exhausted non-retryable class is
  not retried;
- bounded backoff with jitter, maximum attempts, and a maximum wall-clock
  window are enforced;
- a circuit breaker stops systemic outages across issues/runs;
- resubmission resumes existing recovery state before any new issue polling;
- idempotency markers are checked before each mutation so no duplicate claims,
  commits, pushes, PRs, comments, merges, issues, closures, or labels occur;
- notifications are emitted on prolonged outage, recovery, exhaustion, and
  terminal block;
- operator pause/stop applies to the controller and worker;
- reboot/stale-lock behavior fails closed unless correlation and lock ownership
  are proven.

## Ledger Hierarchy Audit

Code trace:

- `issue-selection.mjs` fetches and evaluates live GitHub issues before
  selection.
- `auto-merge-policy.mjs` gates on live PR state, base/head SHA, mergeability,
  checks, review threads, scanner alerts, issue labels, exact validation,
  independent review, Codex review, and current `origin/main`.
- `completion-hygiene.mjs` may propose ledger reconciliation after a merge, but
  issue closure/progress decisions use live issue state and explicit close-rule
  context.
- `issue-proposals.mjs` may include ledger entries in duplicate evidence, but
  duplicate search is supporting evidence and not authoritative.

No code violation was found that lets stale ledger content override live
GitHub/repository state. No separate ledger-enforcement issue is required now.
The implementation tasks below should add regression tests/documentation that
preserve this hierarchy where new scheduler/resubmission and issue creation
paths are added.

## Current Remaining Sequence

Issue #951 implemented the repository-side external-runtime separation,
deterministic bundle/deploy utility, absolute child resolution, explicit
project identities, and same-repository ownership exclusion. It did not itself
deploy the runtime or activate services; those manual actions subsequently
completed under #912 without migrating the retained legacy logs.

The original planning PR and the #913/#921 implementation acceptance chain are
complete. #912 subsequently deployed the external production/canary profiles,
accepted the units and monitoring, completed two runnable task-scoped
canaries, and preserved #865/#866 without mutation. PR #988 and exact
post-merge tracker hygiene are the remaining acceptance steps.

Tracking issues created by this planning task:

- #910: operational readiness umbrella/tracker.
- #911: `mobile-build-config` lane and validation profile; closed through PR
  #915, merge `67ebf68b8ad91bef7af33eace681ff33cf3b79a6`.
- #912: production profile activation and live acceptance.
- #913: bounded outage resubmission and recovery controller.
- #902: scanner/dependency ingestion; closed through PR #916, merge
  `3b3212c43c702db3cabdaff1c28d089f39c54441`.

Post-acceptance issues added after the original planning task:

- #923: local/GitHub dual-review convergence and nested counters; closed
  through PR #936, merge `58a0164f15a77b3d5338a1c00eb4892693e70970`.
- #924: large-candidate escalation and safe split routing; closed through PR
  #940, merge `2dec97fe5e2ddf1d3562b70a76825cfdc8ba81b2`.
- #927: authoritative status/counter projection and ledger decoupling; closed
  through PR #942, merge `960a4d9a09c55c728b01738d9ff1d778cf04e928`.

The #927 implementation adds `operational_status_v1`, one bounded
JSON/Markdown read-only export, explicit live/local/evidence/derived authority
classes, fail-closed identity reconciliation, the state-class inventory, and a
pure milestone-versus-ephemeral ledger policy. Atomic versioned JSON/JSONL is
retained: the measured topology is correlation-scoped and single-writer with no
transactional cross-record or indexed-query requirement. Exact-head and
current-main acceptance completed through PR #942; #927 is closed.
- #928: reportless compaction/process-interruption recovery; closed through PR
  #938, merge `510942d40d2d512094b9af430ccc40f65a505d0c`.
- #929: proactive context budgeting and fresh-session rotation; closed through
  PR #938, merge `510942d40d2d512094b9af430ccc40f65a505d0c`.
- #932: accepted logical-task budget and nested-counter accounting; closed
  through PR #936, merge `58a0164f15a77b3d5338a1c00eb4892693e70970`.

## Rollout And Rollback

- Roll out code first, then external profile changes, then canaries, then
  broader unattended run windows.
- Each activation step must record profile digest, owner/mode, supervisor
  binding, approved lanes, reviewer tiers, budgets, checks, retry settings, and
  rollback path without printing secrets.
- Rollback is configuration-only for activation tasks: disable trusted real
  runs, disable auto-merge, disable follow-up/review-fix mutation, disable
  outage resubmission, and keep health/notifier read-only services available.
- Code rollback follows normal PRs; no direct push to `main`, no force push, and
  no branch deletion without explicit human approval.

## Acceptance

Operational readiness is complete only when:

- production profile activation is reviewed and live with no secret disclosure;
- every canonical runnable lane is either explicitly approved or intentionally
  excluded with a manual reason;
- mobile native build configuration remains accepted through #911 / PR #915;
- scanner/dependency ingestion and strongly proven false-positive disposition
  remain accepted through #902 / PR #916, with no broad suppression;
- prolonged transient outages have bounded automatic resubmission without
  duplicate mutation;
- ledger remains derived/cache-like in docs and tests;
- CI, scanners, independent review, Codex review, issue-state, and exact-head
  gates all pass on the exact PR heads involved.

## Production Activation Acceptance (20260724-0946)

Issue #912 completed the authorized live activation against current-main
runtime source `fe60b4440e6d90141ddc9a379c95b04361861ff1`. The installed external
bundle digest is
`08c1c0c184fa3f939328472c784f4ac31f25d6019f1a84f55643cc1d9a04a992`;
the accepted production and canary profile digests are respectively
`6e8ba6f1a5d55198a10ef08086c35711f8f4ec11be889f11c982bfd1dbec246d`
and
`8e95967ce99b96e0d6228519b771d266fd72541bd6701a03b9f6a7e3b2e8e120`.

The project supervisor, loopback health service, terminal notifier, and timer
were installed and accepted. Runnable canaries #982 and #983 merged through
PRs #985 and #986. Fixtures #978-#981 were excluded before claim and closed
after eligibility cleanup. The final post-fix canary
`supervised-20260724T053439Z-282e0da15c99` ended with
`no-eligible-work`, zero accepted tasks, and no duplicate effect.

The rollback drill disabled all mutation authority, refused a real submission
before claim, retained read-only status/health, and restored the exact
production profile. The 500-task/14-day submission was dry-run only. No
product queue, application deployment, production-data action, public
exposure, secret rotation, migration, branch deletion, or force-like history
action occurred.
