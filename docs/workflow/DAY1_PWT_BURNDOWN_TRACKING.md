# Day 1 PWT Burndown Tracking

## Purpose And Scope

This guide defines the weekly PWT tracking process for the Settleora Day 1
execution board at <https://github.com/users/tommytang213/projects/2>.

It tracks planning and execution health only. It does not clear manual gates,
move issues to `Ready for Codex`, reduce Day 1 scope, or replace the normal
Codex branch, validation, report, PR, and review workflow.

GitHub Project charts can show the current board, but they are not a complete
historical burndown by themselves. Weekly snapshot rows must be captured and
preserved so Tommy can see burn, scope changes, blocker load, and forecast
movement over time.

## Definitions

| Term | Definition |
|---|---|
| `Man-days Remaining` | Current remaining estimate on a Project item. It is not original size and should change only when scope, estimate, or completion state genuinely changes. |
| `Initial MD` / `Baseline MD` | Original task or child-item estimate captured before work starts. It feeds expected-vs-actual reporting and must not be overwritten when remaining work changes. |
| `Planned Start` | Planning date when the task is expected to begin. It is a target for PWT tracking, not a promise. |
| `Target Finish` | Planning target date derived from estimate, risk, dependency state, and PWT cadence. It must not hide blockers or fake readiness. |
| `Actual Done Date` | Date the task/report/PR reached the agreed done state. |
| `Target PWT Week` / `Iteration` | Week or iteration bucket used to compare expected progress with actual completion. |
| `Blocking Gate` | Current pre-work or pre-merge blocker, such as product decision, technical design, Figma/reference, architecture review, security, money, storage/privacy, API/OpenAPI, sync, migration, deployment, or manual approval. |
| `Gate Owner` | Owner of the blocking gate. Tommy owns product/trust/scope/UX approvals and explicit disagreements; Assistant/Codex owns technical design, slicing, validation planning, and implementation breakdown. |
| `Forecast Status` / `Ahead/Behind` | Outcome classification from the task report: `Ahead`, `On track`, `Behind`, or `Not applicable`. |
| Full-board total | Sum of `Man-days Remaining` for all open Day 1 issue items that carry an estimate, excluding blank parent/split tracking items so work is not double counted. |
| Target-subset total | Sum of `Man-days Remaining` for a named subset, such as one technical gate packet, one area, one bundle, or one status filter. It must never be presented as the full-board total. |
| Baseline MD | The tracked remaining MD value chosen as the starting point for a burndown series. The baseline must record date, query/filter, and exclusions. |
| Completed MD | Estimated work completed between two snapshots, adjusted for added and removed/deferred scope. |
| Added scope | New or newly estimated MD added to the tracked set after the previous snapshot. |
| Removed/deferred scope | MD removed from the tracked set because items were deferred, deleted from the tracked scope, split out of Day 1, or otherwise explicitly removed. Silent Day 1 scope reduction is forbidden. |
| Net remaining MD | Current remaining MD after completion, additions, removals/deferments, and estimate changes. |
| Velocity | Rolling average completed MD per week. Use completed MD, not net burn, when scope is changing. |
| Projected finish | Forecast date based on current remaining MD divided by rolling velocity. It is invalid when velocity is zero or estimates are incomplete. |
| Scope change | Added MD minus removed/deferred MD for the tracked set. |
| Ahead/behind variance | Task/report `Ahead/Behind` plus weekly cumulative variance between planned MD/target dates and actual done dates/remaining MD deltas. |

## Planning Metadata Inputs

Every future Codex task should include the `Planning metadata` block from
[Codex task guide](CODEX_TASK_GUIDE.md), and every report should include the
`Planning outcome` block. PWT tracking uses those task/report fields as the
source for forecast charts.

Task metadata contributes:

- `Initial MD estimate` -> `Initial MD` / `Baseline MD`.
- `Estimate confidence` -> `Estimate Confidence`.
- `Planned start` -> `Planned Start`.
- `Target finish` -> `Target Finish`.
- `Target PWT week / iteration` -> `Target PWT Week` / `Iteration`.
- `Blocking gate before task` and `Blocking gate expected after task` ->
  `Blocking Gate`.
- `Gate owner` -> `Gate Owner`.
- `Expected Project status after completion` -> expected status movement.
- `Expected burndown impact` -> expected remaining-MD movement.

Report outcomes contribute:

- `Actual elapsed` and `Actual Done Date` evidence for actual progress.
- `Estimate change` and `Remaining MD delta` for scope and remaining-MD
  movement.
- `Target finish met` and `Ahead/behind` for forecast status.
- `Project fields that should be updated` as recommendations unless the task
  explicitly allows Project mutation.
- `New blockers` and `Next target date recommendation` for the next PWT plan.

Do not mutate GitHub Project fields during a read-only snapshot or docs task.
A separate GitHub Project field-sync task may create/populate the recommended
fields after Tommy approves that mutation.

## Current Baseline

Baseline captured from the live GitHub Project on 2026-06-23 at 10:26 UTC
using read-only `gh project item-list 2 --owner tommytang213 --format json
--limit 200`.

| Metric | Value |
|---|---:|
| Project items inspected | 139 |
| Open Day 1 issue items inspected | 137 |
| Day 2/3 deferred items inspected | 2 |
| Day 1 items with `Man-days Remaining` | 91 |
| Day 1 items missing `Man-days Remaining` | 46 |
| Blank parent/split tracking items excluded from MD total | 24 |
| Non-parent estimate gaps still needing estimates | 22 |
| Full-board remaining MD, excluding blank parent/split tracking items | 308 |

The previously reported `308` still matches the current live full-board tracked
total. The reported `133` does not match the full board. It is a target-subset
number from technical-gate tracking, not a full-board Day 1 total. Recomputing
the explicit technical-gate packet issue list from the live board now gives 47
items and 126 MD because several parent/split items remain blank; treat `133`
as subset-only and potentially stale unless a later snapshot records the exact
filter that produced it.

### Status Counts

| Status | Count | Estimated MD |
|---|---:|---:|
| `Inbox` | 18 | 0 |
| `Needs Decision` | 67 | 192 |
| `Needs Figma / Reference` | 48 | 116 |
| `Ready for Codex` | 4 | 0 |

### MD By Area

| Area | Estimated item count | Remaining MD |
|---|---:|---:|
| `auth` | 13 | 53 |
| `bills` | 24 | 84 |
| `infra` | 2 | 3 |
| `mobile-ui` | 17 | 46 |
| `ocr` | 2 | 3 |
| `qa` | 6 | 14 |
| `settlement` | 4 | 11 |
| `storage` | 8 | 31 |
| `sync` | 4 | 14 |
| `web-admin` | 6 | 27 |
| `web-user` | 5 | 22 |

### Gate Queues

| Queue | Count | Remaining MD |
|---|---:|---:|
| Figma/reference required | 75 | 180 |
| Manual gate required | 112 | 285 |
| Ready for Codex | 4 | 0 |

`Ready for Codex` issue numbers: #231, #297, #298, #300.

These four ready items have blank estimates. They also do not carry `manual-gate`
or `figma:required`, so the current read did not find stale `codex:ready`
labels on manual-gated or Figma-blocked items. They should still receive
estimates before they are used in a PWT velocity forecast.

### Estimate Caveats

- The 308 MD total is reliable as the current tracked full-board estimate, but
  it is not a complete Day 1 delivery forecast until the 22 non-parent estimate
  gaps are filled.
- Parent epics and split-parent planning issues intentionally stay blank when
  child issues carry the estimate. Do not estimate both parent and children.
- `Initial MD` / `Baseline MD` and `Man-days Remaining` serve different
  purposes. Preserve the initial estimate for expected-vs-actual reporting and
  update remaining MD only when the current remaining work changes.
- `Target Finish` is a planning target, not a delivery promise. Missed targets,
  failed validation, expanded scope, and unresolved blockers must be reported
  as behind or blocked rather than hidden by date edits.
- For docs/report-only tasks and PR/merge-gate tasks, carry small estimates so
  planning capacity is visible. Gate overhead is usually `S = 1 MD` unless CI
  or manual risk makes `M = 2 MD` more honest.
- Statuses are blocker-heavy: no item has estimated MD in `Ready for Codex`,
  `Codex Running`, `Report Uploaded`, `PR Ready`, `CI / Merge Gate`, or `Merged`.
- The current baseline is a planning baseline, not proof of progress,
  implementation readiness, or Day 1 acceptance readiness.

## Weekly PWT Meeting Agenda

1. Confirm the board snapshot date, query, and exclusions.
2. Review full-board remaining MD and compare it to the previous snapshot.
3. Review completed MD, added scope, removed/deferred scope, and estimate
   changes.
4. Review blockers by `Status`, `Manual Gate`, and `Figma Required`.
5. Review the `Ready for Codex`, `Codex Running`, `Report Uploaded`, `PR Ready`,
   and `CI / Merge Gate` flow.
6. Review area-level imbalance and whether any area needs Tommy decisions,
   Figma/reference, or issue splitting.
7. Confirm no Day 1 scope was silently reduced.
8. Choose the next safe unblock actions: decisions, Figma/reference work,
   estimate cleanup, issue splitting, or scoped Codex implementation tasks.

## Weekly Snapshot Table Schema

Keep this table in a durable doc, spreadsheet, or Project-backed issue so
historical rows are not lost.

| Field | Meaning |
|---|---|
| Snapshot Week | Week label, for example `2026-W26`. |
| Snapshot Date | Exact date/time and timezone. |
| Board Query | Project URL plus filters used. |
| Full-board Remaining MD | Current full-board estimated MD excluding split-parent blanks. |
| Target Subset Name | Optional subset name, for example `technical-gate-packets`. |
| Target Subset Remaining MD | Optional subset MD with exact filter. |
| Added Scope MD | New Day 1 MD added since previous snapshot. |
| Removed/Deferred Scope MD | MD explicitly removed or deferred with issue references. |
| Completed MD | Formula-derived completed MD. |
| Net Burn MD | Previous remaining minus current remaining. |
| Scope Change MD | Added scope MD minus removed/deferred scope MD. |
| Rolling Velocity MD/Week | Rolling average completed MD per week. |
| Projected Remaining Weeks | Current remaining divided by rolling velocity. |
| Projected Finish Date | Snapshot date plus projected remaining weeks. |
| Planned MD Due This Week | Sum of initial/baseline MD whose target finish falls in the snapshot week. |
| Actual MD Done This Week | Sum of completed remaining-MD deltas or done item MD for the snapshot week, adjusted for scope changes. |
| Cumulative Planned MD | Planned MD through this snapshot week. |
| Cumulative Actual MD | Actual completed MD through this snapshot week. |
| Ahead/Behind Variance | Cumulative actual MD minus cumulative planned MD, plus qualitative blocked/failed-validation notes. |
| Ready for Codex Count | Count and issue numbers. |
| Figma Queue Count / MD | Count and MD for Figma/reference-required items. |
| Manual Gate Count / MD | Count and MD for manual-gated items. |
| Blocking Gate Breakdown | Count/MD by product decision, technical design, Figma/reference, architecture review, security, money, storage/privacy, API/OpenAPI, sync, migration, deployment, manual approval, and other blockers. |
| Estimate Gaps | Blank non-parent estimate count and issue numbers. |
| Notes | Decisions, caveats, and follow-up actions. |

## Formulas

```text
completed MD =
  previous remaining MD
  + added scope MD
  - removed/deferred scope MD
  - current remaining MD

net burn MD =
  previous remaining MD - current remaining MD

velocity =
  rolling average completed MD per week

projected remaining weeks =
  current remaining MD / rolling velocity

projected finish date =
  current date + projected remaining weeks

scope creep =
  added scope MD - removed/deferred scope MD

forecast status =
  task/report ahead-behind plus weekly cumulative variance and blocker state
```

Use completed MD for velocity because it adjusts for scope movement. Use net
burn only to show how the visible remaining total changed.

Burndown charts sum `Man-days Remaining` weekly. Expected-vs-actual charts
compare planned target finish/planned MD to actual done date/remaining-MD
delta. Forecast charts divide current remaining MD by rolling weekly completed
MD. Scope-change charts use added MD minus removed/deferred MD. Ahead/behind
charts combine task/report `Ahead/behind` with cumulative variance, validation
outcomes, and remaining blocker state.

## Recommended Project Fields

- `Status`
- `Area`
- `Initial MD` or `Baseline MD`
- `Man-days Remaining`
- `Estimate Confidence`
- `Planned Start`
- `Target Finish`
- `Actual Done Date`
- `Target PWT Week` / `Iteration`
- `Blocking Gate`
- `Gate Owner`
- `Forecast Status` or `Ahead/Behind`
- `Iteration` or `Week`
- Optional: `Snapshot Week`
- Optional: `Scope Change Type`
- Optional: `PWT Notes`

If GitHub Project field limits make weekly snapshot fields awkward, preserve
snapshot history outside the Project and keep the Project focused on current
execution state.

## GitHub Project Insights Setup

### Weekly Burndown

- Chart type: line chart.
- Source: weekly snapshot table, not only live issue fields.
- X-axis: `Snapshot Week`.
- Y-axis: `Full-board Remaining MD`.
- Add a second line for `Target Subset Remaining MD` only when the subset name
  and filter are fixed across weeks.

### Expected Vs Projected

- Chart type: line chart.
- X-axis: `Snapshot Week`.
- Series 1: planned/expected remaining MD from `Initial MD` / `Baseline MD`,
  `Target Finish`, and `Target PWT Week` / `Iteration`.
- Series 2: actual remaining MD from weekly `Man-days Remaining` snapshots and
  report `Remaining MD delta`.
- Series 3, optional: projected remaining MD based on rolling velocity.
- Keep projection notes with the rolling velocity window used.

### Forecast Finish

- Chart type: line chart or table.
- Inputs: current `Man-days Remaining`, rolling completed MD/week, estimate
  gaps, and active blocker count/MD.
- Output: projected finish date.
- Mark forecast invalid when velocity is zero, estimates are incomplete, or
  manual gates dominate the remaining critical path.

### MD By Area

- Chart type: stacked bar or table.
- Group by `Area`.
- Aggregate `Man-days Remaining`.
- Filter to `Day Scope = Day 1` and exclude blank split parents.

### Blocker Load

- Chart type: stacked bar.
- Group by `Status` and `Blocking Gate`.
- Include `Needs Product Decision`, `Needs Technical Design`,
  `Needs Figma / Reference`, `Needs Architecture Review`, `Blocked`, and any
  legacy `Needs Decision` items until the live Project taxonomy is migrated.
- Add saved filters for `Manual Gate = Yes` and high-risk labels.
- Review `Gate Owner` so Tommy is not treated as the owner of missing technical
  design, schema/API slicing, validation planning, or implementation breakdown.

### Figma Queue

- Chart type: table or bar.
- Filter: `Figma Required = Yes` or label `figma:required`.
- Group by `Area` or `Status`.
- Aggregate count and `Man-days Remaining`.

### Ready / In Progress / Done Flow

- Chart type: stacked bar or flow table.
- Statuses: `Ready for Codex`, `Codex Running`, `Report Uploaded`, `PR Ready`,
  `CI / Merge Gate`, `Merged`.
- Track count and MD. A healthy flow should not have unestimated ready items.

### Ahead / Behind

- Chart type: table or stacked bar.
- Group by `Forecast Status` or `Ahead/Behind`.
- Include task/report notes for missed target finish, failed validation, added
  scope, unresolved blockers, or early completion.
- Add a weekly cumulative variance line: cumulative actual completed MD minus
  cumulative planned MD.

### Scope Change Snapshot

- Chart type: table or stacked bar from weekly snapshots.
- Fields: `Added Scope MD`, `Removed/Deferred Scope MD`, `Scope Change Type`,
  and issue references.
- Review this every week before interpreting velocity.

## Manual Setup Steps For Tommy

1. Open <https://github.com/users/tommytang213/projects/2>.
2. Confirm every Day 1 implementation/tracking item has `Day Scope`, `Status`,
   `Area`, and where appropriate `Man-days Remaining`.
3. Leave parent epics and split-parent planning issues blank when child issues
   carry estimates.
4. Add or maintain `Initial MD` / `Baseline MD`, `Estimate Confidence`,
   `Planned Start`, `Target Finish`, `Actual Done Date`, `Target PWT Week` /
   `Iteration`, `Blocking Gate`, `Gate Owner`, and `Forecast Status` /
   `Ahead/Behind` if using Project-native charts.
5. Keep `Target Finish` honest: adjust it only with an explanation, and do not
   move blocked work forward to hide missed targets.
6. Create the Insights charts above with filters saved by name.
7. Create a separate weekly snapshot table if Project Insights cannot preserve
   historical aggregate rows.
8. During PWT, record the snapshot before moving or re-estimating items so
   scope changes are explainable.

## Codex Weekly Snapshot Task Template

```text
Run a read-only Day 1 PWT snapshot for Settleora.

Branch from current origin/main. Do not mutate GitHub Project fields or issues.
Read PROGRAM_ARCHITECTURE.md, README.md, docs/workflow/CODEX_TASK_GUIDE.md,
docs/workflow/DAY1_EXECUTION_BOARD.md, and
docs/workflow/DAY1_PWT_BURNDOWN_TRACKING.md.

Read GitHub Project https://github.com/users/tommytang213/projects/2.
Report:
- Project items inspected.
- Open Day 1 issue items inspected.
- Full-board remaining MD excluding split-parent blanks.
- Target subset totals if the prompt names a subset.
- MD by Area.
- MD by Status.
- Status counts.
- Figma queue count/MD.
- Manual gate count/MD.
- Ready for Codex count and issue numbers.
- Estimate gaps and split-parent blanks.
- Added scope, removed/deferred scope, completed MD, net burn, velocity, and
  projected finish if a previous snapshot is provided.

Do not create, edit, close, label, or move GitHub issues or Project items.
Write a report with exact commands and results.
```

## Acceptance And Guardrails

- No fake progress: do not mark work complete unless the issue/PR evidence
  supports it.
- Do not move issues to `Ready for Codex` without full gate clearance.
- Split parents must not double count against child estimates.
- Figma/reference gates remain real blockers for UI-sensitive work.
- Day 1 scope must not be reduced silently. Any removal/deferment needs an
  explicit issue reference, reason, and Tommy-approved scope decision.
- Manual-gated domains remain manual-gated: auth/security, storage/privacy,
  money/settlement/bill calculation authority, schema/migrations,
  OpenAPI/generated clients, deployment/CI/Docker, secrets, public/admin
  exposure, mobile release, destructive operations, and production release.
