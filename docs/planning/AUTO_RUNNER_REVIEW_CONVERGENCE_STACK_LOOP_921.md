# Auto-Runner Review Convergence And Stack Loop

Task key: `20260717-0040`

Focused issue: #921

Parent tracker: #910

Historical context: #800, #893, and #894 remain valid closed foundation
records. They do not prove the expanded 50-cycle bounded convergence and
dependent-PR stack behavior that current live code still lacked before this
task.

## Policy

- Default source-changing review-fix budget: 50 cycles per PR per convergence
  epoch.
- Hard maximum: 50 cycles.
- Lower configured values are honored; zero disables mutation.
- Negative or malformed values fail closed.
- Values above 50 are clamped and reported with requested, normalized, and hard
  maximum values.
- Provider, network, review, CI, scanner, process-restart, unchanged-rerun, and
  wait retries do not consume source-changing cycles.
- A cycle is consumed only when a fix creates a new source-changing exact head.

## Evidence Model

Review convergence state is external to committed source under the runner logs
root. It records stack/convergence ID, issue/task identity, repository, PR,
branch/base/head, epoch, source-changing cycle, material finding inventory,
fingerprints, exact-head validation/review/CI/scanner/merge evidence,
deduped review requests, mutation markers, parent/dependent relationships,
phase, terminal reason, timestamps, and bounded summaries. Atomic writes,
owner-only file modes, schema validation, and corrupt-state fail-closed
behavior are required.

Every head change invalidates old validation, review, CI, scanner, and merge
evidence. Review requests are deduped by PR, exact head, reviewer purpose, and
tier. Finding fingerprints include provider/source, normalized severity,
repository-relative path, stable location, normalized title/body, rule/check
identity, and affected authority invariant. They exclude secrets, raw provider
payloads, hidden credentials, authorization headers, and unrestricted command
output.

## Loop Safety

The controller freezes all current material findings before editing and runs a
single batch-fix task. It detects repeated identical material finding sets,
findings that return after a claimed fix, source-progress absence despite
provider wording changes, and candidate tree or patch-id oscillation including
A/B and short periodic loops. The no-progress threshold defaults to at least
three source-changing cycles.

Terminal reasons are `REVIEW_CONVERGED`, `MANUAL_DECISION_REQUIRED`,
`NO_PROGRESS`, `REVIEW_OSCILLATION`, `CYCLE_BUDGET_EXHAUSTED`,
`VALIDATION_BLOCKED`, `REVIEW_PROVIDER_BLOCKED`, `CI_OR_SCANNER_BLOCKED`, and
`UNSAFE_SCOPE_CHANGE`.

At cycle 50 the runner starts one fresh diagnostic epoch with fresh context and
an alternate strategy. It continues only when measurable progress exists.

## Lane Authority

Review-fix mutation is contract-approved, not low-risk-only. Inputs are issue
contract, allowed paths, lane `allowedToImplement`, manual-decision
classification, validation profile, reviewer tier, merge policy, danger/manual
action separation, current exact head, and stack state.

Workflow/docs and normal runtime lanes may self-fix when contracts allow.
Sensitive lanes may self-fix only with stronger validation, strong independent
review, Codex mechanics/security review, and exact-head merge gates. Sensitive
folder names alone are not operator interrupts. Production deploys, store
releases, destructive operations, secret/auth config mutation, public/admin
exposure, Day 1 scope cuts, architecture replacement, force-like history,
branch deletion, and unresolved product/policy/security/privacy/financial
authority choices remain manual.

Generated clients are not hand-edited; generated-client changes require the
authoritative contract or generator path.

## Stack Controller

The durable stack model records stack ID, ordered PR entries, expected
parent/base relationship, current heads, merge policy, required checks, own
delta identity, active PR, completed/remaining entries, mutation markers, and
restart state.

The required sequence is:

1. Recover active PR before unrelated polling.
2. Converge parent review findings.
3. Complete validation, strong review, Codex review, CI, security, and scanner
   gates.
4. Merge with expected-head protection.
5. Prove merged current-main SHA/tree/checks.
6. Retarget the dependent PR to current `main`.
7. Prove dependent own-delta preservation.
8. Converge and gate the dependent PR.
9. Merge the dependent PR.
10. Perform issue, umbrella, ledger, and project hygiene exactly once.
11. Continue to the next stack item or eligible work.

Semantic own-delta proof uses file set, diffstat/numstat, stable patch ID,
normalized patch comparison, forward/reverse patch-to-tree proof, and raw diff
hashes as supporting evidence only.

## First Acceptance Stack

PR #919 -> PR #920 is the first live acceptance stack after this implementation
PR merges. This implementation task plans that stack read-only and must not
mutate #919, #920, #912, #913, #865, or #866.

## Project Fields

Project fields are `not_updated` unless a tested mapping is available.
