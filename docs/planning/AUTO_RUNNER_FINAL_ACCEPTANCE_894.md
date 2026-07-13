# Auto-Runner Final Acceptance Matrix #894

Task key: `20260713-2358`

Base/current-main SHA at start: `b930badaa65ea72e8727c8ca272b3299a8174d35`

Parent: #800. Final proof issue: #894. Post-foundation follow-up: #902.

Correction task key: `20260714-0033`.

Finalization task key: `20260714-0107`.

Recovery/final closure task key: `20260714-0143`.

The original PR #907 head `b95624196d2dcfbb38e94b99c2d47c646908e538`
did not satisfy row 5 because `tools/auto-runner/lib/auto-merge-policy.mjs`
excluded the seven canonical high-risk runnable lanes from
`approvedDomainAutoMergeLanes` and blocked them through a separate
manual-gated auto-merge set. The prior all-rows-pass comments and validation
package are superseded for high-risk lane acceptance. The corrected PR #907
head later regenerated validation, independent review, Codex review, CI,
scanner, review-thread, issue, and canary evidence before merge.

PR #907 merged the corrected source head
`9472142f69b5db443d1d1693f4a68e38e491d96f` into `main` as merge commit
`e58340855ab5f700342ce1bfa02d12d2e287b5b3`. The merge parents were verified:
first parent `b930badaa65ea72e8727c8ca272b3299a8174d35`, second parent
`9472142f69b5db443d1d1693f4a68e38e491d96f`.

Post-merge proof on current `main` at
`e58340855ab5f700342ce1bfa02d12d2e287b5b3` passed:

- `npm ci`
- `npm run doctor:validation`
- `node --check tools/auto-runner/lib/auto-merge-policy.mjs`
- `node --check tools/auto-runner/lib/lane-policy.mjs`
- `node --check tools/auto-runner/lib/reviewer-policy.mjs`
- `node --check tools/auto-runner/test/auto-runner.test.mjs`
- `node --test tools/auto-runner/test/large-bundle-review-approval.test.mjs`
  (`31/31`)
- `node --test tools/auto-runner/test/auto-runner.test.mjs` (`191/191`)
- `node --test tools/auto-runner/test/*.test.mjs` (`393/393`)
- `node tools/auto-runner/settleora-auto-runner.mjs --readiness`
  (`27 pass / 1 warn / 0 fail`)
- `npm run validate:docs`
- `npm run validate:scaffold` (`19 paths`)

Current-main GitHub checks on merge SHA `e58340855ab5f700342ce1bfa02d12d2e287b5b3`
passed: Scaffold Validation, CodeQL, Semgrep CE, Trivy repository scan, and
API Image GHCR. Current-main open code-scanning alerts were `0`; no scanner
finding was dismissed, suppressed, waived, or excluded. Protected canaries #865
and #866 remained open with exact labels `area:mobile-ui`,
`auto-canary-ready`, `canary`, and `workflow`, zero comments, no assignees, and
no milestone. Project fields are `not_updated` because no supported tested
mapping was exercised.

PR #908 then merged the finalization source head
`f12d3ad1721506d1b9fa3d72f78a1417d457ff85` into `main` as merge commit
`4cbb807d09eb732699fb82acc0336f985b94b617`. Final current-main proof on
`4cbb807d09eb732699fb82acc0336f985b94b617` passed: focused large-bundle tests
`31/31`, focused auto-runner tests `191/191`, full runner tests `393/393`,
readiness `27 pass / 1 warn / 0 fail`, `npm run validate:docs`, and
`npm run validate:scaffold`. Current-main Scaffold, CodeQL, Semgrep, Trivy,
and API Image checks passed; current-main and repository open code-scanning
alerts were `[]`.

Post-closure live state: #889, #894, and #800 are closed completed. #902 is
open, commentless for the foundation closure tasks, and unstarted as the next
separate post-foundation enhancement. Protected canaries #865 and #866 remain
unchanged. Project fields remain `not_updated`. All 14 acceptance rows pass
with no remaining auto-runner foundation gate. Closing #800 completes the
auto-runner A-H foundation tracker only; it does not mean the Settleora
product Day 1 milestone is complete.

## Evidence Legend

- `current-state`: current repository code, tests, docs, and live GitHub state.
- `historical-live`: accepted prior DevBox/GitHub evidence with exact issue,
  PR, run, report, and SHA identifiers.
- `deterministic-fixture`: current tests exercising policy logic without live
  GitHub mutation.

## Acceptance Matrix

| Row | Acceptance requirement | Implementation and code/test paths | Evidence source | Command/test executed now | Result | Classification and remaining gate |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Multi-issue unattended execution and recovery-first selection: multiple eligible issues in one bounded run, no repeat in same run, recovery before polling, ambiguous recovery fail-closed, bounded stop/no-work/budget outcomes. | `issue-selection.mjs`, `github-issues.mjs`, `recovery-continuation.mjs`, `control-plane.mjs`; tests in `auto-runner.test.mjs`, `recovery-continuation.test.mjs`, `production-recovery-wiring.test.mjs`. | Historical live multi-issue runs in `/workspace/logs/settleora-auto-runner/summaries/`, including #825/#826 and #839/#840; current status/list surfaces; #893 recovery code; final PR #908/current-main proof. | `node --test tools/auto-runner/test/*.test.mjs`; `node tools/auto-runner/settleora-auto-runner.mjs --status --json`; `node tools/auto-runner/settleora-auto-runner.mjs --readiness`. | Pass. | `historical-live` plus `deterministic-fixture`; remaining gate: None. |
| 2 | Feature-bundle execution: one bundle branch/final PR, two to four ordered slices, durable checkpoint state and explicit-path commits, resume first incomplete slice, skip completed slices, stale/corrupt/dirty/partial/mismatched state fail closed, focused/split domains separated. | `feature-bundle-contract.mjs`, `feature-bundle-state.mjs`, `feature-bundle-orchestrator.mjs`; tests `feature-bundle-contract.test.mjs`, `feature-bundle-state.test.mjs`. | #890/PR #903, source head `2e104e87ed1c6b6cbb264d2e7c235c2c61bcdcef`, merge `8c1320695da430d8d0932988679209952d59a1b6`; reports `20260713-1416`, `20260713-1500`, `20260713-1531`; final PR #908/current-main proof. | Full runner tests and docs/scaffold validation. | Pass. | `current-state` and `historical-live`; remaining gate: None. |
| 3 | Risk lanes and genuine manual decisions: approved normal/sensitive/high-risk code lanes are not categorically prohibited; lane branch/validation/path/review requirements apply; manual actions stop; broad UI/runtime bundles cannot mix security-critical/storage/money/schema/OpenAPI/sync/deployment authority; production/store/destructive/secret/public/architecture/force/branch deletion/Day 1 cut/unresolved authority decisions remain manual. | `lane-policy.mjs`, `validation-planner.mjs`, `auto-merge-policy.mjs`, docs in `AUTONOMOUS_CODEX_RUNNER.md`; tests in `auto-runner.test.mjs`. | #887/PR #896 plus #907 correction for the high-risk auto-merge allowlist. | Full runner tests on current main after PR #907 merge. | Pass. | `current-state`; remaining gate: None. |
| 4 | Reviewer tiers and exact-head evidence: cheap/strong route by policy; strong required for sensitive/high-risk/policy-critical; Codex mechanics/security remains separate; unavailable/malformed/failed/over-budget/secret-risk/file-mismatch/stale-head blocks; changed head invalidates review; tie-breaker/escalation bounded. | `reviewer-policy.mjs`, `gemini-reviewer.mjs`, `review-secret-boundary.mjs`, `codex-runner.mjs`; tests `auto-runner.test.mjs`, `large-bundle-review-approval.test.mjs`, `review-secret-boundary.test.mjs`. | #888/PR #897, merge `8ecaafcda5441c452396761ccb7653d31d64f1cb`; #893/PR #906 strong review regenerated after head change. | Full runner tests; secret metadata checked only by safe tooling, no secret contents read. | Pass. | `current-state` plus exact #906 historical-live review proof; remaining gate: None. |
| 5 | Exact-head merge behavior: every canonical runnable approved lane, including auth/session/security, storage/file/privacy/authz, money/settlement/payment, schema/migrations, OpenAPI/generated clients, sync/import/export/restore, and Docker/CI/deployment code lanes, may auto-merge only after policy, contract, paths, validation, strong external/Codex reviews where required, CI/security, scanner, mergeability, issue state, exact-head refresh, and external config approval. Genuine manual actions remain manual; `--match-head-commit` prevents stale merges; base/head/scanner/thread/requested-change/stop/scope drift blocks; evidence is regenerated after fix commits; current-main scanner reconciliation runs when required. | `auto-merge-policy.mjs`, `completion-hygiene.mjs`, `settleora-auto-runner.mjs`; tests `auto-runner.test.mjs`, `completion-hygiene.test.mjs`. | #889/PR #898 supplied the base exact-head merge gate; #907 correction removes the high-risk categorical block and adds positive/negative high-risk lane regressions; #893/PR #906 proved exact-head merge protection on a recovery PR; PR #908 completed final closure reconciliation. | Full runner tests; syntax checks; readiness; PR #907 and PR #908 exact-head CI/security/scanner and review evidence; current-main validation/check/scanner proof after merge. | Pass. | `current-state` and `historical-live`; remaining gate: None. |
| 6 | Derived issue creation, reuse, and deduplication: complete contracts for implementation/fix/blocker/follow-up/future-gate, duplicate search across issues/PRs/comments/reports/ledger/prior state, correlation/idempotency, metadata/labels/paths/validation/reviewer/acceptance/close/linkage, ambiguous matches fail closed. | `issue-proposals.mjs`, `issue-mutation-pipeline.mjs`, `github-issues.mjs`; tests `issue-proposals.test.mjs`, `issue-mutation-pipeline.test.mjs`. | #891/#892/PR #904, source head `ddf98251f85121de9ffa50c9f0a84ef7cd914287`, merge `db854eb306007e044b05ea47220da466ac2f04df`; no disposable issue created for #894. | Full runner tests. | Pass. | `current-state`; remaining gate: None. |
| 7 | Completion, closure, umbrella, ledger, and project hygiene: narrow issues close after authoritative merge and close-rule proof; ambiguous umbrellas stay open; completion comments include PR/head/merge/scope/validation/reviews/scanners/remaining gates; transient labels removed; project mappings tested or `not_updated`; ledger through PR work; replay idempotent. | `completion-hygiene.mjs`, `summary-writer.mjs`; tests `completion-hygiene.test.mjs`. | #891/#892/#893 closures and #800 progress comments; PR #908 final closure comments on #889/#894/#800; ledger updated through branch/PR work, not direct `main`. | Full runner tests; live #800/#889/#894/#902 state verified after PR #908. | Pass. | `current-state`; remaining gate: None. |
| 8 | Review-fix, CI/security, existing-PR recovery, continuation: bounded source fixes within allowed paths; no alert dismissal/suppression/waiver/query exclusion/scanner gaming; source vs provider outage classification; bounded retries; head change invalidates evidence and regenerates; existing runner-owned PRs resume; completion/continuation idempotent; PR #905/#906 and alert #85 reconciled. | `recovery-state.mjs`, `recovery-orchestrator.mjs`, `recovery-continuation.mjs`, `review-fix-policy.mjs`; tests `recovery-state.test.mjs`, `recovery-orchestrator.test.mjs`, `recovery-continuation.test.mjs`, `production-recovery-wiring.test.mjs`. | #893/PR #906, fix commit `a1adb27941927f58ba4e41569bb8237cfaa10f78`, merge `b930badaa65ea72e8727c8ca272b3299a8174d35`; PR #905 closed as superseded after GitHub CodeQL outage; alert #85 fixed and not dismissed. | Full runner tests; current-main checks/scanner query. | Pass. | `historical-live` plus `deterministic-fixture`; remaining gate: None. |
| 9 | Monitoring and notifications: status observable for active/terminal runs; health/activity/incident/recovery/success/no-work/dedupe/idle-silence match contract; sanitized output; no secret/raw provider/OCR/user/config/auth/sensitive filesystem emission; read-only health has no mutation/restart authority. | `control-plane.mjs`, `health-service.mjs`, `ntfy-terminal-notifier.mjs`, `notifier-dedupe-state.mjs`; tests `health-service.test.mjs`, `terminal-notifier.test.mjs`, `systemd-templates.test.mjs`. | #879/#883/#885/#880, including accepted monitoring reports `20260712-1329`, `20260712-1451`, `20260712-1627`, `20260712-1734`, `20260712-1759`, `20260712-1821`. | Full runner tests; `--status --json`; no duplicate live notification sent. | Pass. | `historical-live` plus `current-state`; remaining gate: None. |
| 10 | Windows-off continuation and correlation: detached DevBox supervisor continues after wrapper return/SSH disconnect/Windows shutdown; immutable specs and `supervisorRunId` survive disconnect; report resolution uses exact correlation not newest file; timestamp/report correlation intact; failed/reboot/ambiguous runs do not auto-resume. | Supervisor modules under `tools/auto-runner/supervisor/**`, `settleora-auto-runnerctl.mjs`; tests `supervisor.test.mjs`. | Accepted Windows-origin run `supervised-20260711T182122Z-6bd91d326f10`, runner `run-2026-07-11T182132Z`, PR #877 merge `8d04e2c4de1e586ff9298ddd6d2f0f2a9c7d7743`, #864 closed; docs `AUTONOMOUS_CODEX_RUNNER_SUPERVISOR.md`. | Full runner tests; `--status --json` shows exact supervisor/runner mapping. | Pass. | `historical-live` plus `deterministic-fixture`; remaining gate: None. |
| 11 | Rollback, pause, stop, retry budgets, locks, restart safety: pause/stop at safe boundaries; selected-run controls cannot affect unrelated/terminal runs; retry budgets bounded; active/unparsable locks fail closed and stale locks follow PID semantics; ambiguous recovery fail closed; restart/continuation cannot duplicate commits/PRs/comments/issues/merges/closures/parent comments/ledger; rollback of monitoring/services does not mutate runner/GitHub. | `control-plane.mjs`, `settleora-auto-runnerctl.mjs`, supervisor `control-policy.mjs`, `recovery-continuation.mjs`; tests `auto-runner.test.mjs`, `supervisor.test.mjs`, `recovery-continuation.test.mjs`, `systemd-templates.test.mjs`. | #880 controlled rollback reports and #893 recovery state evidence; current lock directory has no active runner lock. | Full runner tests; local lock/status inspection. | Pass. | `current-state` and `historical-live`; remaining gate: None. |
| 12 | Protected canaries: #865/#866 exactly open, required labels, zero comments, no assignees, no milestone, no related branch/PR created by this task. | No code path changed. Live GitHub issue fingerprints. | `gh issue view 865/866` before and after PR #908 closure work showed exact required fingerprint. | Initial and final `gh issue view` fingerprint commands. | Pass. | `current-state`; remaining gate: None. |
| 13 | Repository and security safety: no direct `main` edit/push; no force/rebase/reset/amend/branch deletion; no `git add .`; no secret creation/rotation/disclosure/hash/encoding/commit; no scanner dismissal/suppression; no deploy/store/destructive/auth/public/product work; no `.codex/` deletion/unrelated committed reports; protected secret paths not opened. | Branch from `origin/main`; focused auto-runner policy/test plus planning/workflow docs; report artifact remains uncommitted. | PR #907 and PR #908 merged through GitHub PRs; old PR #907 head defect verified and corrected; current `origin/main` equals PR #908 merge SHA `4cbb807d09eb732699fb82acc0336f985b94b617`. | `git status`, `git diff --name-only`, `git diff --check`; secret paths are not opened. | Pass. | `current-state`; remaining gate: None. |
| 14 | Final issue hygiene and sequencing: #902 untouched; #889/#894/#800 closed only after PR #908 merge and final current-main proof; #902 remains open as separate post-foundation work; product Day 1 remains separate. | This matrix, refreshed gap audit, ledger checkpoints, PR #908 final local report, final issue comments. | Live #800/#889/#894 states verified closed completed; #902 remains open, commentless for the foundation closure tasks, and post-foundation. | `gh issue view 800/889/894/902`; final report. | Pass. | Remaining gate: None. |

## Current Live State Checkpoint

- `origin/main`: `4cbb807d09eb732699fb82acc0336f985b94b617`.
- Original PR #907 head `b95624196d2dcfbb38e94b99c2d47c646908e538`
  is superseded for row 5 because high-risk canonical runnable lanes were
  still categorically blocked from auto-merge.
- PR #906 merged from source head
  `a1adb27941927f58ba4e41569bb8237cfaa10f78`.
- PR #907 merged from corrected source head
  `9472142f69b5db443d1d1693f4a68e38e491d96f` as merge SHA
  `e58340855ab5f700342ce1bfa02d12d2e287b5b3`.
- PR #908 merged from finalization source head
  `f12d3ad1721506d1b9fa3d72f78a1417d457ff85` as merge SHA
  `4cbb807d09eb732699fb82acc0336f985b94b617`.
- #893, #889, #894, and #800 are closed completed.
- #865 and #866 were verified open with exact labels, zero comments, no
  assignees, and no milestone before and after closure work.
- Current-main workflow runs for `4cbb807d09eb732699fb82acc0336f985b94b617`
  show Scaffold, CodeQL, Semgrep, Trivy, and API Image GHCR success.
- Current open code-scanning alerts: `0`.
- #902 remains open as the next separate post-foundation enhancement and no
  implementation has started.

## Close Recommendation

#889, #894, and #800 are already closed completed after PR #908 and final
current-main validation, CI/security/scanner reconciliation, protected canary
recheck, and issue hygiene passed. #800 A-H foundation scope is complete; that
does not mean the Settleora product Day 1 is complete. #902 remains open as the
next post-foundation Dependabot/code-scanning ingestion enhancement and was not
started by the foundation closure tasks.
