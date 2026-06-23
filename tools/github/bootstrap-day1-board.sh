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
ISSUE_URLS_FILE="$TMPDIR/seed-issue-urls.txt"

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
    printf '%s\n' "$url" >>"$ISSUE_URLS_FILE"
    continue
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "ISSUE would create: $title [$labels_csv]"
    continue
  fi

  create_output="$(gh issue create --repo "$REPO" --title "$title" --body-file "$body_file" --label "$labels_csv")"
  echo "ISSUE created: $title"
  echo "ISSUE url: $create_output"
  printf '%s\n' "$create_output" >>"$ISSUE_URLS_FILE"
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
  project_json=""
  if [[ -n "$project_match" ]]; then
    echo "PROJECT reused: $project_match"
    project_json="$project_match"
  elif [[ "$DRY_RUN" -eq 1 ]]; then
    echo "PROJECT would create: $PROJECT_TITLE"
  elif gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json >"$TMPDIR/project-created.json" 2>"$TMPDIR/project-create-error.txt"; then
    project_json="$(cat "$TMPDIR/project-created.json")"
    echo "PROJECT created: $project_json"
  else
    echo "PROJECT create blocked: gh project create --owner $OWNER --title \"$PROJECT_TITLE\" --format json"
    cat "$TMPDIR/project-create-error.txt"
  fi

  if [[ -n "$project_json" ]]; then
    project_number="$(PROJECT_JSON="$project_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ["PROJECT_JSON"])["number"])
PY
)"
    refresh_project_fields() {
      gh project field-list "$project_number" --owner "$OWNER" --format json --limit 100 >"$TMPDIR/project-fields.json"
    }

    field_match() {
      local field_name="$1"
      FIELD_NAME="$field_name" python3 - "$TMPDIR/project-fields.json" <<'PY'
import json, os, sys
name = os.environ["FIELD_NAME"]
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
for field in data.get("fields", []):
    if field.get("name") == name:
        print(json.dumps(field))
        break
PY
    }

    field_option_names() {
      FIELD_JSON="$1" python3 - <<'PY'
import json, os
field = json.loads(os.environ["FIELD_JSON"])
print(",".join(option.get("name", "") for option in field.get("options", [])))
PY
    }

    write_single_select_options_json() {
      local options_csv="$1"
      local output_path="$2"
      OPTIONS_CSV="$options_csv" python3 - "$output_path" <<'PY'
import json, os, sys
palette = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"]
options = []
for index, name in enumerate([value for value in os.environ["OPTIONS_CSV"].split(",") if value]):
    options.append({
        "name": name,
        "color": palette[index % len(palette)],
        "description": ""
    })
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(options, f)
PY
    }

    update_single_select_options() {
      local field_id="$1"
      local options_csv="$2"
      local options_file="$TMPDIR/single-select-options.json"
      local graphql_file="$TMPDIR/update-field-options.json"

      write_single_select_options_json "$options_csv" "$options_file"
      FIELD_ID="$field_id" OPTIONS_FILE="$options_file" GRAPHQL_FILE="$graphql_file" python3 - <<'PY'
import json, os
with open(os.environ["OPTIONS_FILE"], encoding="utf-8") as f:
    options = json.load(f)
payload = {
    "query": """
mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
  updateProjectV2Field(input: {fieldId: $fieldId, singleSelectOptions: $options}) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
        options {
          name
        }
      }
    }
  }
}
""",
    "variables": {
        "fieldId": os.environ["FIELD_ID"],
        "options": options,
    },
}
with open(os.environ["GRAPHQL_FILE"], "w", encoding="utf-8") as f:
    json.dump(payload, f)
PY
      gh api graphql --input "$graphql_file" >/dev/null
    }

    create_or_reuse_project_field() {
      local name="$1"
      local data_type="$2"
      local options_csv="${3:-}"
      local field_json

      field_json="$(field_match "$name")"
      if [[ -n "$field_json" ]]; then
        if [[ "$data_type" == "SINGLE_SELECT" && -n "$options_csv" ]]; then
          current_options="$(field_option_names "$field_json")"
          if [[ "$current_options" == "$options_csv" ]]; then
            echo "PROJECT FIELD reused: $name"
            return
          fi

          field_id="$(FIELD_JSON="$field_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ["FIELD_JSON"])["id"])
PY
)"
          if [[ "$DRY_RUN" -eq 1 ]]; then
            echo "PROJECT FIELD would update options: $name [$options_csv]"
            return
          fi

          update_single_select_options "$field_id" "$options_csv"
          refresh_project_fields
          echo "PROJECT FIELD updated options: $name"
          return
        fi

        echo "PROJECT FIELD reused: $name"
        return
      fi

      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "PROJECT FIELD would create: $name ($data_type)"
        return
      fi

      if [[ "$data_type" == "SINGLE_SELECT" ]]; then
        gh project field-create "$project_number" --owner "$OWNER" --name "$name" --data-type "$data_type" --single-select-options "$options_csv" --format json >/dev/null
      else
        gh project field-create "$project_number" --owner "$OWNER" --name "$name" --data-type "$data_type" --format json >/dev/null
      fi
      refresh_project_fields
      echo "PROJECT FIELD created: $name"
    }

    echo "== Project fields =="
    refresh_project_fields
    create_or_reuse_project_field "Work Type" "SINGLE_SELECT" "epic,feature,task,bug,hardening,design,docs"
    create_or_reuse_project_field "Area" "SINGLE_SELECT" "auth,bills,ocr,settlement,sync,storage,mobile-ui,web-user,web-admin,infra,qa"
    create_or_reuse_project_field "Day Scope" "SINGLE_SELECT" "Day 1,Day 2,Day 3"
    create_or_reuse_project_field "Status" "SINGLE_SELECT" "Inbox,Needs Decision,Needs Figma / Reference,Ready for Codex,Codex Running,Report Uploaded,PR Ready,CI / Merge Gate,Merged,Deferred Day 2/3,Blocked"
    create_or_reuse_project_field "Priority" "SINGLE_SELECT" "P0,P1,P2,P3"
    create_or_reuse_project_field "Risk" "SINGLE_SELECT" "low,medium,high,manual-gate"
    create_or_reuse_project_field "Size" "SINGLE_SELECT" "XS,S,M,L,XL"
    create_or_reuse_project_field "Man-days Remaining" "NUMBER"
    create_or_reuse_project_field "Progress %" "NUMBER"
    create_or_reuse_project_field "Bundle ID" "TEXT"
    create_or_reuse_project_field "Validation Class" "SINGLE_SELECT" "docs-only,mobile-ui,api,openapi-client,storage,money,migration,deploy,full"
    create_or_reuse_project_field "Figma Required" "SINGLE_SELECT" "No,Yes"
    create_or_reuse_project_field "Manual Gate" "SINGLE_SELECT" "No,Yes"

    echo "== Project items =="
    gh project item-list "$project_number" --owner "$OWNER" --format json --limit 1000 >"$TMPDIR/project-items.json"
    python3 - "$TMPDIR/project-items.json" "$ISSUE_URLS_FILE" >"$TMPDIR/missing-project-item-urls.txt" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    items = json.load(f).get("items", [])
existing = set()
for item in items:
    for key in ("content", "item"):
        value = item.get(key)
        if isinstance(value, dict) and value.get("url"):
            existing.add(value["url"])
    if item.get("url"):
        existing.add(item["url"])
with open(sys.argv[2], encoding="utf-8") as f:
    wanted = [line.strip() for line in f if line.strip()]
for url in wanted:
    if url not in existing:
        print(url)
PY
    missing_item_count="$(wc -l <"$TMPDIR/missing-project-item-urls.txt" | tr -d ' ')"
    existing_item_count="$(python3 - "$ISSUE_URLS_FILE" "$TMPDIR/missing-project-item-urls.txt" <<'PY'
import sys
wanted = {line.strip() for line in open(sys.argv[1], encoding="utf-8") if line.strip()}
missing = {line.strip() for line in open(sys.argv[2], encoding="utf-8") if line.strip()}
print(len(wanted - missing))
PY
)"
    echo "PROJECT ITEMS already present: $existing_item_count"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "PROJECT ITEMS would add: $missing_item_count"
    else
      while IFS= read -r issue_url; do
        [[ -z "$issue_url" ]] && continue
        gh project item-add "$project_number" --owner "$OWNER" --url "$issue_url" --format json >/dev/null
        echo "PROJECT ITEM added: $issue_url"
      done <"$TMPDIR/missing-project-item-urls.txt"
      echo "PROJECT ITEMS added: $missing_item_count"
    fi

    echo "== Project views =="
    echo "PROJECT VIEWS unsupported: gh project has no view-create command and the current GitHub GraphQL mutation schema exposes no ProjectV2 view create/update mutation."
    echo "PROJECT VIEW manual targets: Day 1 Board; Roadmap / Area; Codex Queue; Blockers; Needs Figma; Risk View; Deferred Day 2/3."
  fi
fi
