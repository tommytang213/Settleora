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
| Full-board total | Sum of `Man-days Remaining` for all open Day 1 issue items that carry an estimate, excluding blank parent/split tracking items so work is not double counted. |
| Target-subset total | Sum of `Man-days Remaining` for a named subset, such as one technical gate packet, one area, one bundle, or one status filter. It must never be presented as the full-board total. |
| Baseline MD | The tracked remaining MD value chosen as the starting point for a burndown series. The baseline must record date, query/filter, and exclusions. |
| Completed MD | Estimated work completed between two snapshots, adjusted for added and removed/deferred scope. |
| Added scope | New or newly estimated MD added to the tracked set after the previous snapshot. |
| Removed/deferred scope | MD removed from the tracked set because items were deferred, deleted from the tracked scope, split out of Day 1, or otherwise explicitly removed. Silent Day 1 scope reduction is forbidden. |
| Net remaining MD | Current remaining MD after completion, additions, removals/deferments, and estimate changes. |
| Velocity | Rolling average completed MD per week. Use completed MD, not net burn, when scope is changing. |
| Projected finish | Forecast date based on current remaining MD divided by rolling velocity. It is invalid when velocity is zero or estimates are incomplete. |

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
| Rolling Velocity MD/Week | Rolling average completed MD per week. |
| Projected Remaining Weeks | Current remaining divided by rolling velocity. |
| Projected Finish Date | Snapshot date plus projected remaining weeks. |
| Ready for Codex Count | Count and issue numbers. |
| Figma Queue Count / MD | Count and MD for Figma/reference-required items. |
| Manual Gate Count / MD | Count and MD for manual-gated items. |
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
```

Use completed MD for velocity because it adjusts for scope movement. Use net
burn only to show how the visible remaining total changed.

## Recommended Project Fields

- `Man-days Remaining`
- `Status`
- `Area`
- `Iteration` or `Week`
- `Target Date`
- `Actual Done Date`
- `Baseline MD` or equivalent
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
- Series 1: planned/expected remaining MD.
- Series 2: projected remaining MD based on rolling velocity.
- Keep projection notes with the rolling velocity window used.

### MD By Area

- Chart type: stacked bar or table.
- Group by `Area`.
- Aggregate `Man-days Remaining`.
- Filter to `Day Scope = Day 1` and exclude blank split parents.

### Blocker Load

- Chart type: stacked bar.
- Group by `Status`.
- Include `Needs Decision`, `Needs Figma / Reference`, and `Blocked`.
- Add saved filters for `Manual Gate = Yes` and high-risk labels.

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
4. Add or maintain `Iteration`/`Week`, `Target Date`, `Actual Done Date`, and
   optional snapshot fields if using Project-native charts.
5. Create the Insights charts above with filters saved by name.
6. Create a separate weekly snapshot table if Project Insights cannot preserve
   historical aggregate rows.
7. During PWT, record the snapshot before moving or re-estimating items so
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
