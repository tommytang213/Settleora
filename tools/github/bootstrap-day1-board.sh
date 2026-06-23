#!/usr/bin/env bash
set -euo pipefail

REPO="tommytang213/Settleora"
OWNER="tommytang213"
SEED="tools/github/day1-board-seed.json"
DRY_RUN=0
SKIP_PROJECT=0

usage() {
  cat <<'USAGE'
Usage: tools/github/bootstrap-day1-board.sh [options]

Options:
  --repo OWNER/REPO       GitHub repository. Default: tommytang213/Settleora
  --owner OWNER           GitHub owner for Projects. Default: tommytang213
  --seed PATH             Seed JSON path. Default: tools/github/day1-board-seed.json
  --dry-run               Print planned mutations without applying them
  --skip-project          Skip GitHub Project lookup/create
  -h, --help              Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:?missing --repo value}"
      shift 2
      ;;
    --owner)
      OWNER="${2:?missing --owner value}"
      shift 2
      ;;
    --seed)
      SEED="${2:?missing --seed value}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-project)
      SKIP_PROJECT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI is required." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required for seed parsing." >&2
  exit 1
fi

if [[ ! -f "$SEED" ]]; then
  echo "ERROR: seed file not found: $SEED" >&2
  exit 1
fi

python3 -m json.tool "$SEED" >/dev/null

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

PROJECT_TITLE="$(SEED="$SEED" python3 - <<'PY'
import json, os
with open(os.environ["SEED"], encoding="utf-8") as f:
    print(json.load(f)["project"]["title"])
PY
)"

echo "Repository: $REPO"
echo "Owner: $OWNER"
echo "Project title: $PROJECT_TITLE"
echo "Seed: $SEED"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Mode: dry-run"
fi

create_or_reuse_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  local exists_file="$TMPDIR/label-exists.json"

  gh label list --repo "$REPO" --limit 500 --json name >"$exists_file"
  if NAME="$name" python3 - "$exists_file" <<'PY'
import json, os, sys
name = os.environ["NAME"]
with open(sys.argv[1], encoding="utf-8") as f:
    labels = json.load(f)
raise SystemExit(0 if any(label.get("name") == name for label in labels) else 1)
PY
  then
    echo "LABEL reused: $name"
    return
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "LABEL would create: $name"
    return
  fi

  gh label create "$name" --repo "$REPO" --color "$color" --description "$description"
  echo "LABEL created: $name"
}

find_issue_by_exact_title() {
  local title="$1"
  local search_file="$TMPDIR/issues-search.json"

  gh issue list --repo "$REPO" --state all --search "$title in:title" --limit 100 --json number,title,url,labels >"$search_file"
  TITLE="$title" python3 - "$search_file" <<'PY'
import json, os, sys
title = os.environ["TITLE"]
with open(sys.argv[1], encoding="utf-8") as f:
    issues = json.load(f)
for issue in issues:
    if issue.get("title") == title:
        label_names = ",".join(sorted(label.get("name", "") for label in issue.get("labels", [])))
        print(f'{issue["number"]}\t{issue["url"]}\t{label_names}')
        break
PY
}

add_missing_issue_labels() {
  local number="$1"
  local current_csv="$2"
  local expected_csv="$3"
  local missing_file="$TMPDIR/missing-labels-$number.txt"

  CURRENT="$current_csv" EXPECTED="$expected_csv" python3 - >"$missing_file" <<'PY'
import os
current = {label for label in os.environ["CURRENT"].split(",") if label}
expected = [label for label in os.environ["EXPECTED"].split(",") if label]
missing = [label for label in expected if label not in current]
print(",".join(missing))
PY

  local missing
  missing="$(cat "$missing_file")"
  if [[ -z "$missing" ]]; then
    return
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "ISSUE #$number would add labels: $missing"
    return
  fi

  gh issue edit "$number" --repo "$REPO" --add-label "$missing" >/dev/null
  echo "ISSUE #$number added labels: $missing"
}

echo "== Labels =="
while IFS=$'\t' read -r name color description; do
  create_or_reuse_label "$name" "$color" "$description"
done < <(SEED="$SEED" python3 - <<'PY'
import json, os
with open(os.environ["SEED"], encoding="utf-8") as f:
    seed = json.load(f)
for label in seed["labels"]:
    print(f'{label["name"]}\t{label["color"]}\t{label.get("description", "")}')
PY
)

ISSUES_JSONL="$TMPDIR/issues.jsonl"
SEED="$SEED" python3 - >"$ISSUES_JSONL" <<'PY'
import json, os

def md_list(items):
    if not items:
        return "- None."
    return "\n".join(f"- {item}" for item in items)

def epic_body(epic):
    return f"""## Goal

Track and deliver {epic["title"]} for the Day 1 MVP while preserving Settleora architecture authority boundaries.

## Scope

- Area: `{epic["area"]}`
- Day scope: `Day 1`
- Validation class: `{epic["validationClass"]}`

## Non-goals

- No unrelated product implementation.
- No silent auth, storage, money, schema, OpenAPI, generated-client, deployment, security, or release changes.
- No direct push to `main`.

## Required reading

{md_list(epic.get("requiredReading", []))}

## Architecture guardrails

- API/domain services remain authoritative for business writes, authorization, money, status transitions, file access, and audit.
- OpenAPI remains the source of truth for API contracts; generated clients are not hand-edited.
- File bytes go through storage abstraction and file metadata remains in PostgreSQL.
- Money uses decimal-safe types, attached currency, and centralized rounding.
- Clients do not decide authorization from UI, cache, or routes.

## Acceptance criteria

- The epic is broken into small reviewable issues.
- Manual gates are visible before risky work starts.
- Validation class and required reading are clear for each implementation slice.
- Day 1, Day 2, and Day 3 work are not mixed silently.

## Suggested feature/task breakdown

{md_list(epic.get("breakdown", []))}

## Validation class

`{epic["validationClass"]}`

## Dependencies / blockers

- Product, architecture, or manual-gate decisions listed below.
- Related issues linked from child tasks.

## Manual gates

{md_list(epic.get("manualGates", []))}

## Codex notes

- Use one focused task branch per issue.
- Upload the required Codex report before PR review.
- Keep validation scoped and report exact commands/results.
"""

def child_body(issue, epic):
    return f"""## Goal

{issue.get("bodySummary", "Deliver this scoped Day 1 work item.")}

## Scope

- Parent epic: `{epic["title"]}`
- Work type: `{issue.get("type", "task")}`
- Size: `{issue.get("size", "M")}`
- Validation class: `{issue.get("validationClass", epic["validationClass"])}`

## Non-goals

- No unrelated implementation or cleanup.
- No silent auth/session/security, storage/file, money/settlement, schema/migration, OpenAPI/generated-client, deployment, release, or secret changes.

## Required reading

{md_list(epic.get("requiredReading", []))}

## Architecture guardrails

- Preserve API/domain authority for business writes, authorization, money, status transitions, storage access, and audit.
- Keep generated clients and OpenAPI changes explicit.
- Keep UI-sensitive work behind Figma/reference when required.

## Acceptance criteria

- Scope is implemented or documented in a focused PR.
- Required validation is run and reported exactly.
- Manual gates are satisfied before risky work proceeds.

## Suggested feature/task breakdown

- Confirm exact affected files and validation class.
- Implement the smallest reviewable slice.
- Update or add focused tests/docs where the slice requires them.

## Validation class

`{issue.get("validationClass", epic["validationClass"])}`

## Dependencies / blockers

- Parent epic: `{epic["title"]}`

## Manual gates

{md_list(epic.get("manualGates", []))}

## Codex notes

- Start from current `origin/main` unless the task says otherwise.
- Stage explicit files only.
- Upload the required Codex report.
"""

with open(os.environ["SEED"], encoding="utf-8") as f:
    seed = json.load(f)

for epic in seed["epics"]:
    print(json.dumps({
        "title": epic["title"],
        "labels": epic["labels"],
        "body": epic_body(epic),
        "kind": "epic"
    }, ensure_ascii=False))
    for issue in epic.get("issues", []):
        print(json.dumps({
            "title": issue["title"],
            "labels": issue["labels"],
            "body": child_body(issue, epic),
            "kind": "issue",
            "reuseIssue": issue.get("reuseIssue")
        }, ensure_ascii=False))
PY

echo "== Issues =="
while IFS= read -r issue_json; do
  title="$(ISSUE_JSON="$issue_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ["ISSUE_JSON"])["title"])
PY
)"
  labels_csv="$(ISSUE_JSON="$issue_json" python3 - <<'PY'
import json, os
print(",".join(json.loads(os.environ["ISSUE_JSON"])["labels"]))
PY
)"
  body_file="$TMPDIR/issue-body.md"
  ISSUE_JSON="$issue_json" python3 - >"$body_file" <<'PY'
import json, os
print(json.loads(os.environ["ISSUE_JSON"])["body"])
PY

  found="$(find_issue_by_exact_title "$title" || true)"
  if [[ -n "$found" ]]; then
    number="$(printf '%s' "$found" | awk -F'\t' '{print $1}')"
    url="$(printf '%s' "$found" | awk -F'\t' '{print $2}')"
    current_labels="$(printf '%s' "$found" | awk -F'\t' '{print $3}')"
    echo "ISSUE reused: #$number $title"
    add_missing_issue_labels "$number" "$current_labels" "$labels_csv"
    echo "ISSUE url: $url"
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "ISSUE would create: $title [$labels_csv]"
    continue
  fi

  create_output="$(gh issue create --repo "$REPO" --title "$title" --body-file "$body_file" --label "$labels_csv")"
  echo "ISSUE created: $title"
  echo "ISSUE url: $create_output"
done <"$ISSUES_JSONL"

echo "== Project =="
if [[ "$SKIP_PROJECT" -eq 1 ]]; then
  echo "PROJECT skipped by --skip-project"
elif ! gh project list --owner "$OWNER" --format json --limit 100 >"$TMPDIR/projects.json" 2>"$TMPDIR/project-error.txt"; then
  echo "PROJECT blocked: gh project list --owner $OWNER --format json --limit 100"
  cat "$TMPDIR/project-error.txt"
else
  project_match="$(TITLE="$PROJECT_TITLE" python3 - "$TMPDIR/projects.json" <<'PY'
import json, os, sys
title = os.environ["TITLE"]
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
for project in data.get("projects", []):
    if project.get("title") == title:
        print(json.dumps(project))
        break
PY
)"
  if [[ -n "$project_match" ]]; then
    echo "PROJECT reused: $project_match"
  elif [[ "$DRY_RUN" -eq 1 ]]; then
    echo "PROJECT would create: $PROJECT_TITLE"
  elif gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json >"$TMPDIR/project-created.json" 2>"$TMPDIR/project-create-error.txt"; then
    echo "PROJECT created: $(cat "$TMPDIR/project-created.json")"
  else
    echo "PROJECT create blocked: gh project create --owner $OWNER --title \"$PROJECT_TITLE\" --format json"
    cat "$TMPDIR/project-create-error.txt"
  fi

  echo "PROJECT field/view setup note: gh project field/view editing is not fully automated by this bootstrap. Configure fields and views from docs/workflow/DAY1_EXECUTION_BOARD.md if the CLI does not expose safe idempotent view mutation."
fi
