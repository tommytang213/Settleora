# Auto-Runner End-State Gap Audit

Task key: `20260713-2358`

Base evidence SHA: `b930badaa65ea72e8727c8ca272b3299a8174d35`

Finalization task key: `20260714-0107`

Current-main evidence SHA: `e58340855ab5f700342ce1bfa02d12d2e287b5b3`

Parent tracker: #800

Final acceptance gate: #894

Post-foundation follow-up: #902, intentionally untouched until #894 is
reviewed and merged.

Protected canaries #865 and #866 must remain open with labels
`area:mobile-ui`, `auto-canary-ready`, `canary`, and `workflow`, zero comments,
no assignees, and no milestone.

## Current Status

#800 remains open pending this finalization PR merge and final current-main
proof. PR #907 originally had superseded head
`b95624196d2dcfbb38e94b99c2d47c646908e538`, which did not satisfy final
high-risk lane acceptance because `auto-merge-policy.mjs` still excluded the
seven canonical high-risk runnable lanes from approved-domain auto-merge and
blocked them categorically. Corrected PR #907 source head
`9472142f69b5db443d1d1693f4a68e38e491d96f` removed that categorical block
while preserving genuine manual-action gates and exact-head validation,
review, CI, scanner, issue, branch, and path gates. PR #907 merged as
`e58340855ab5f700342ce1bfa02d12d2e287b5b3`; post-merge current-main
validation, GitHub checks, and code-scanning reconciliation passed.

The foundational
implementation children that were open in the `20260712-1821` audit are now
merged or completed:

- #887 completed through PR #896, merge SHA
  `741aa0355bd213aab04c37a5f876de420485800c`.
- #888 completed through PR #897, merge SHA
  `8ecaafcda5441c452396761ccb7653d31d64f1cb`.
- #889 completed through PR #898, merge SHA
  `d21b83033abf8eb99b76dedc8574a270b90c0a54`.
- #890 completed through PR #903, merge SHA
  `8c1320695da430d8d0932988679209952d59a1b6`.
- #891 and #892 completed through PR #904, merge SHA
  `db854eb306007e044b05ea47220da466ac2f04df`.
- #893 completed through PR #906, merge SHA
  `b930badaa65ea72e8727c8ca272b3299a8174d35`.
- #889 final correction completed through PR #907, source head
  `9472142f69b5db443d1d1693f4a68e38e491d96f`, merge SHA
  `e58340855ab5f700342ce1bfa02d12d2e287b5b3`, with current-main proof
  passing after merge.
- #880 remains accepted and closed for monitoring, notification, Windows-off,
  and rollback evidence.

The runner foundation is no longer low-risk-only in policy direction. Current
code supports approved runnable lanes and strong review/merge gates where
explicitly configured, while repository defaults remain fail-closed:
`allowAutoMerge=false`, `autoMergePolicy.approvedLanes=[]`, external reviewer
tiers disabled unless configured, generated issue creation disabled unless
configured, existing-PR recovery disabled unless configured, and review-fix
mutation disabled unless configured.

Manual gates remain real gates. Sensitive and high-risk repository code work
is not categorically prohibited from autonomous implementation or auto-merge
when a reviewed lane policy permits it and all stronger exact-head gates pass.
Genuine manual actions still block: production deploy, mobile store release,
destructive data/migration execution, secret/auth config mutation,
public/admin/network exposure, architecture replacement, force-like history,
branch deletion/cleanup, Day 1 cuts, and unresolved product/policy,
authorization, privacy, security, or financial authority decisions. Schema or
migration code may merge after gates, but destructive application remains
manual; Docker/CI/deployment code may merge after gates, but live deployment,
environment, network, and secret mutation remain manual.

## Final Acceptance Evidence

The durable #894 evidence matrix lives in
[AUTO_RUNNER_FINAL_ACCEPTANCE_894.md](AUTO_RUNNER_FINAL_ACCEPTANCE_894.md).
It reconciles current code/tests, live PR/issue/check/scanner evidence, and
accepted historical DevBox evidence for every #800 final acceptance row.

## Evidence Matrix

| Target | Current evidence | Classification | Remaining gate |
| --- | --- | --- | --- |
| A. Cross-domain autonomy and risk lanes | #887/PR #896 updated lane/manual-decision policy. Current docs and `tools/auto-runner/lib/lane-policy.mjs` distinguish runnable approved lanes, focused/split-required lanes, and manual-gated work. | Pass for foundation policy; no broad product implementation implied. | #894 review/merge and post-merge reconciliation before #800 closure. |
| B. Feature bundles | #890/PR #903 added two-to-four-slice bundle contracts, one branch/final PR orchestration, durable bundle state, checkpoint commits, recovery, and fail-closed drift handling. Tests: `feature-bundle-contract.test.mjs`, `feature-bundle-state.test.mjs`. | Pass for foundation behavior. | #894 review/merge. |
| C. Issue creation | #891/#892/PR #904 added generated-work proposals, duplicate search, idempotency/correlation, issue mutation pipeline, and default-off creation. Tests: `issue-proposals.test.mjs`, `issue-mutation-pipeline.test.mjs`. | Pass for foundation behavior. | #894 review/merge. |
| D. Closure/progress hygiene | #892/PR #904 added narrow close decisions, completion comments, transient label cleanup, parent comments, project `not_updated` fallback, and ledger proposal path. Tests: `completion-hygiene.test.mjs`. | Pass for foundation behavior. | #894 review/merge and post-merge #894/#800 comments. |
| E. External review | #888/PR #897 added cheap/strong/tie-breaker routing, strong-review escalation, provider secret-boundary metadata validation, budget gates, and exact-head review package evidence. Tests include reviewer policy and integrated Gemini coverage in `auto-runner.test.mjs` and `large-bundle-review-approval.test.mjs`. | Pass for foundation behavior. | #894 exact-head strong independent review and Codex review. |
| F. Exact-head approved-domain merge | #889/PR #898 added approved-lane auto-merge policy with exact issue contract, path, validation, review, CI/security, scanner, thread, issue-state, base/head, and `--match-head-commit` protection. #907 correction removes the stale categorical block for the seven canonical high-risk runnable lanes and adds positive/negative exact-gate regressions. PR #907 merged from exact corrected head `9472142f69b5db443d1d1693f4a68e38e491d96f` as `e58340855ab5f700342ce1bfa02d12d2e287b5b3`; post-merge current-main proof passed. | Pass. | Finalization PR merge and final issue closure evidence. |
| G. Recovery/continuation | #893/PR #906 added recovery state, outcome taxonomy, existing-PR recovery, bounded fix classification, exact-head evidence invalidation, current-main scanner reconciliation, startup recovery-before-polling, and fail-closed continuation dispatch. Tests: `recovery-state.test.mjs`, `recovery-orchestrator.test.mjs`, `recovery-continuation.test.mjs`, `production-recovery-wiring.test.mjs`. | Pass for foundation behavior. | #894 review/merge. |
| H. Monitoring, Windows-off, rollback | #880 live acceptance and #879/#883/#885 repository slices prove read-only health, ntfy terminal notifier, notification dedupe, Windows-off supervisor continuation, and rollback boundaries. Tests: `health-service.test.mjs`, `terminal-notifier.test.mjs`, `supervisor.test.mjs`, `systemd-templates.test.mjs`. | Pass using exact historical live proof plus current deterministic tests. | No new live notification or Windows shutdown required. |
| I. Protected canaries | Current #865/#866 live fingerprint remains open, exact labels, zero comments, no assignees, no milestone. #894 does not mutate them. | Pass; final after-fingerprint must remain identical. | Recheck after finalization PR comments and final issue hygiene. |
| J. Repository/security safety | Current task and foundation children did not push directly to `main`, force push, rebase/reset/amend, delete branches by request, change secrets, deploy, change schema/OpenAPI/generated clients, or alter product runtime authority. Current open code-scanning alerts are `0` on `origin/main` `e58340855ab5f700342ce1bfa02d12d2e287b5b3`. Project fields are `not_updated` because no supported tested mapping was exercised. | Pass if finalization diff remains within the approved docs paths. | Final scope guard, validation, PR CI/security/scanner. |

## Stale Or Conflicting State Reconciled

The earlier `20260712-1821` audit intentionally described pre-#887 scaffolding:
low-risk-only merge defaults, `auto-bundle` as only an eligibility signal,
basic follow-up previews, partial progress hygiene, and incomplete recovery.
That status is now historical. Current implementation and live issue/PR state
supersede it.

The default example configuration remains conservative. Those defaults are not
evidence that approved-domain autonomy is unimplemented; they are the
fail-closed deployment posture that requires explicit reviewed configuration.

## Genuine Manual Decisions

Manual gates still include production deploys, mobile store releases,
destructive migrations or data operations, secret/auth configuration mutation,
public/admin/network exposure, architecture replacement, force-like history
changes, branch deletion/cleanup, Day 1 scope cuts, unresolved product/policy
behavior, unresolved authorization/privacy/security authority, unresolved
financial semantics, and tasks explicitly marked PR-only or human-merge-only.
They do not categorically cover every repository code PR in the associated
high-risk lane when the lane is runnable, explicitly config-approved, and all
strong exact-head gates pass.

## Close Recommendation

Keep #889, #894, and #800 open while this finalization PR is unmerged. After it
merges, close #889, #894, and #800 only if final current-main validation,
GitHub CI/security, current-main scanner reconciliation, protected-canary
recheck, and ledger/report evidence all pass. #800 A-H foundation scope is
complete after that closure sequence, but Settleora product Day 1 remains a
separate broader product milestone. Keep #902 open as the post-foundation
Dependabot/code-scanning ingestion enhancement and do not start it in this
task.
