# Auto-Runner End-State Gap Audit

Task key: `20260712-1821`

Base evidence SHA: `56a3e46061f7c1fdf2e7567a3d1e3e306db30070`

Parent tracker: #800

Monitoring acceptance: #880 is accepted and closed. The DevBox read-only health
service, Uptime Kuma incident/recovery path, ntfy activity path, dedupe, idle
silence, Windows-off operation, and rollback evidence are complete. Protected
canaries #865 and #866 remain open and untouched.

## Current Status

#800 remains open. The current runner is a proven staged scaffold: it can run
bounded low-risk/canary work, enforce exact-head gates, perform low-risk
auto-merge where approved, recover selected existing PR evidence, run bounded
review-fix scaffolding, expose read-only health, and report local state. It is
not yet the finished autonomous development loop.

The restrictive defaults are intentional scaffolding, not the final design:

- `tools/auto-runner/lib/lane-policy.mjs` allows only
  `workflow-docs-tooling`, `docs-planning`, and `client-ui-low-risk`; normal
  runtime, security, storage, money, schema, OpenAPI, and deployment lanes are
  `dangerLane(...)`.
- `tools/auto-runner/lib/auto-merge-policy.mjs` restricts auto-merge to
  low-risk lanes and requires independent review only for
  `client-ui-low-risk`.
- `tools/auto-runner/lib/reviewer-policy.mjs` defines cheap, strong, and
  tie-breaker tiers, but they are disabled by default in repository config;
  only Codex mechanics is enabled by default.
- `tools/auto-runner/lib/github-issues.mjs` can preview or create a basic
  follow-up only when `allowFollowupIssueCreation` is enabled; it does not yet
  derive complete implementation issues from merged planning work.
- `auto-bundle` is currently an eligibility signal, not real feature-bundle
  orchestration.

## Authoritative Finished Target

A. The runner must work across normal development domains: workflow/tooling,
docs/planning, mobile/web/admin UI, API/domain runtime, auth/session/security,
storage/file privacy/authz, money/settlement/payment, schema/migrations,
OpenAPI/generated clients, sync/import/export/restore, Docker/CI/deployment,
and other normal Settleora domains. Sensitive work is not permanently manual
when requirements and architecture are clear, but current repository manual
gates remain authoritative until a reviewed policy PR explicitly narrows or
reclassifies them. #887 must therefore define safe automatic lanes without
silently overriding current manual-gate rules.

B. Feature-bundle execution must support one bundle branch, two to four related
sub-slices, checkpoint validation, persistent bundle state/reports, recovery,
one final validation, mandatory reviews, one PR, CI, and conditional
auto-merge. Hard domains must split into focused branches.

C. After design/planning merges and during implementation, review, CI, and
acceptance, the runner must create high-quality linked implementation,
blocker, fix, cleanup, follow-up, and future-gate issues after duplicate
search across issues, PRs, comments, reports, and the ledger.

D. After merge, the runner must close narrow complete issues, comment with
evidence, clean transient labels, update project/status/progress where safe,
update the ledger, and update umbrellas without closing ambiguous epics.

E. Every auto-merged PR requires independent external review, Codex
mechanics/security review, relevant local validation, GitHub CI/security
checks, and exact-head verification.

F. Auto-merge must extend beyond low-risk canaries to approved domains when all
scope, validation, review, CI/security, issue, and exact-head gates pass.
Production deploys and other explicit manual actions remain separate.

G. The runner must handle requested review fixes, CI fixes, code-scanning
fixes, exact-head re-review after head changes, existing PR recovery,
continuation after interruption, report correlation, bundle checkpoints,
generated follow-up issues, and safe retry classification.

H. #800 must not close until current repo/live evidence proves all final
acceptance criteria, including high-risk lane execution, multi-issue and
multi-slice unattended execution, automatic issue creation and closure,
progress hygiene, recovery, monitoring, Windows-off continuation, no secret
leaks, protected canaries unaffected except explicit canary tasks, and no
direct main push or unsafe history operations.

## Evidence Matrix

| Target | Current evidence | Classification | Remaining gates |
| --- | --- | --- | --- |
| A. Cross-domain autonomy | `lane-policy.mjs` supports three allowed lanes and danger-lanes normal sensitive domains. | Partial/scaffold; final target requires policy work, but current manual gates remain authoritative until explicitly changed. | #887. |
| B. Feature bundles | `auto-bundle` is searchable and documented as an eligibility signal only. No bundle state machine exists. | Missing. | #890. |
| C. Issue creation | `previewFollowupIssue` exists, gated by `allowFollowupIssueCreation`, with only basic labels. | Partial/scaffold. | #891. |
| D. Closure/progress | Low-risk merge comment/closure/label cleanup exists, with failure evidence, but no umbrella/project/ledger automation. | Partial. | #892. |
| E. External review | Reviewer routing logic and Gemini provider code exist; tiers are default-disabled and only client UI requires independent review in merge policy. | Implemented but unproven/partial. | #888. |
| F. Auto-merge domains | `lowRiskAutoMergeLanes` is limited to workflow/docs/client low-risk. | Partial/scaffold. | #889. |
| G. Recovery/continuation | Review-fix and existing-PR recovery scaffolds exist with exact-head evidence checks; broad CI/security fix and continuation are incomplete. | Partial. | #893. |
| H. Final acceptance | Monitoring #880 is complete; canary/low-risk proofs exist. High-risk, bundle, issue creation, closure hygiene, and final proof are missing. | Not complete. | #894 after #887-#893. |

## Stale Or Conflicting State

- The #800 original body previously said real unattended mutation and
  auto-merge remain disabled/gated. That wording is now historical foundation
  state, not the final requirement. #800 was updated during task
  `20260712-1821`.
- Documentation that describes `auto-bundle` as future behavior remains true
  only if read as scaffolding.
- Current manual-gated danger lanes are safe staging defaults. They conflict
  with the final A-H target only if treated as permanent policy, but they must
  not be bypassed before an explicit reviewed policy change.

## Child Issues And Bundles

Bundle 1, policy and review gates:

- #887 - lane policy and genuine manual-decision classification.
- #888 - external reviewer providers and tier routing.
- #889 - exact-head auto-merge across approved domains.

Bundle 2, multi-slice execution:

- #890 - real feature-bundle orchestration state and recovery.

Bundle 3, work generation and progress hygiene:

- #891 - automatic implementation issue derivation and creation.
- #892 - automatic issue closure and progress hygiene.

Bundle 4, recovery and continuation:

- #893 - review-fix, CI/security-fix, existing-PR recovery, and continuation.

Bundle 5, final proof:

- #894 - final cross-domain unattended acceptance proof.

Recommended first implementation child: #887. Lane/manual-decision policy is
the blocker that determines which later reviewer, merge, issue, bundle, and
recovery behavior is valid.

## Genuine Manual Decisions

Manual gates remain required for production deploys, mobile store releases,
destructive migrations or data operations, secret/auth configuration,
public/admin exposure, architecture replacement, force-like history changes,
branch deletion/cleanup, Day 1 scope cuts, unresolved product/policy behavior,
auth/session/security-critical runtime work, storage/file privacy/authz
changes, money/settlement calculation authority changes, schema migrations,
OpenAPI/generated-client changes, CI/deployment infrastructure changes, and
tasks explicitly marked PR-only or human-merge-only until those gates are
explicitly changed by reviewed policy.

## Final Acceptance Matrix

#800 can close only when #894 records evidence for:

- multi-issue unattended execution;
- feature-bundle multi-slice execution;
- high-risk lane execution;
- cheap and strong reviewer routing;
- mandatory external review before every auto-merge;
- exact-head auto-merge across approved domains;
- automatic issue creation;
- automatic narrow-issue closure;
- umbrella/ledger/project progress hygiene;
- review-fix and existing-PR recovery;
- monitoring and notifications;
- Windows-off continuation;
- rollback and failure behavior;
- protected canaries unaffected except explicit canary tasks;
- no secrets leaked;
- no direct main push or unsafe history operations.
