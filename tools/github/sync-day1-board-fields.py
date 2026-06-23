#!/usr/bin/env python3
"""Synchronize Settleora Day 1 Project fields and issue hierarchy.

This script is intentionally conservative:
- it reads the existing Day 1 seed;
- it updates supported ProjectV2 fields for existing seeded issues only;
- it writes marker-bounded Markdown hierarchy sections to issue bodies;
- it does not create issues, delete issues, close issues, retitle issues, or edit
  unsupported Project fields.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_DEFAULT = "tommytang213/Settleora"
OWNER_DEFAULT = "tommytang213"
PROJECT_NUMBER_DEFAULT = 2
SEED_DEFAULT = Path("tools/github/day1-board-seed.json")

PARENT_START = "<!-- settleora-board-parent:start -->"
PARENT_END = "<!-- settleora-board-parent:end -->"
CHILDREN_START = "<!-- settleora-board-children:start -->"
CHILDREN_END = "<!-- settleora-board-children:end -->"


@dataclass(frozen=True)
class SeedIssue:
    title: str
    labels: list[str]
    parent_title: str | None
    validation_class: str
    size: str | None


@dataclass
class Summary:
    project_items_seen: int = 0
    seeded_titles: int = 0
    seeded_items_found: int = 0
    field_updates: int = 0
    field_skipped_blank_or_unsupported: int = 0
    field_failures: int = 0
    hierarchy_parent_updates: int = 0
    hierarchy_child_updates: int = 0
    hierarchy_skipped: int = 0
    hierarchy_failures: int = 0


def run(args: list[str], *, input_text: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}\n{result.stderr.strip()}")
    return result


def load_json_command(args: list[str]) -> Any:
    result = run(args)
    return json.loads(result.stdout)


def labels_to_value(labels: list[str], prefix: str) -> str | None:
    for label in labels:
        if label.startswith(prefix):
            return label.removeprefix(prefix)
    return None


def infer_day_scope(labels: list[str]) -> str | None:
    if "scope:day3" in labels:
        return "Day 3"
    if "scope:day2" in labels:
        return "Day 2"
    if "scope:day1" in labels:
        return "Day 1"
    return None


def infer_status(labels: list[str]) -> str:
    if "scope:day2" in labels or "scope:day3" in labels:
        return "Deferred Day 2/3"
    if "figma:required" in labels:
        return "Needs Figma / Reference"
    if "codex:ready" in labels:
        return "Ready for Codex"
    return "Inbox"


def infer_risk(labels: list[str]) -> str:
    if "manual-gate" in labels:
        return "manual-gate"
    if any(label.startswith("risk:") for label in labels):
        return "high"
    return "medium"


def normalize_validation_class(value: str | None, labels: list[str]) -> str | None:
    if value:
        mapping = {
            "api": "api",
            "docs-only": "docs-only",
            "mobile-ui": "mobile-ui",
            "openapi-client": "openapi-client",
            "storage": "storage",
            "money": "money",
            "migration": "migration",
            "deploy": "deploy",
            "full": "full",
        }
        if value in mapping:
            return mapping[value]
    if "risk:openapi" in labels:
        return "openapi-client"
    if "area:mobile-ui" in labels:
        return "mobile-ui"
    if "area:storage" in labels or "risk:storage-authz" in labels:
        return "storage"
    if "area:settlement" in labels or "risk:money" in labels:
        return "money"
    if "area:infra" in labels:
        return "deploy"
    if "type:docs" in labels:
        return "docs-only"
    if "area:qa" in labels:
        return "full"
    return "api"


def read_seed(path: Path) -> tuple[list[SeedIssue], dict[str, list[SeedIssue]]]:
    seed = json.loads(path.read_text(encoding="utf-8"))
    issues: list[SeedIssue] = []
    children_by_epic: dict[str, list[SeedIssue]] = {}
    for epic in seed["epics"]:
        epic_issue = SeedIssue(
            title=epic["title"],
            labels=epic["labels"],
            parent_title=None,
            validation_class=epic.get("validationClass", ""),
            size=None,
        )
        issues.append(epic_issue)
        children_by_epic[epic["title"]] = []
        for child in epic.get("issues", []):
            child_issue = SeedIssue(
                title=child["title"],
                labels=child["labels"],
                parent_title=epic["title"],
                validation_class=child.get("validationClass", epic.get("validationClass", "")),
                size=child.get("size"),
            )
            issues.append(child_issue)
            children_by_epic[epic["title"]].append(child_issue)
    return issues, children_by_epic


def field_option_maps(fields: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for field in fields:
        entry: dict[str, Any] = {"id": field["id"], "type": field["type"]}
        if field["type"] == "ProjectV2SingleSelectField":
            entry["options"] = {option["name"]: option["id"] for option in field.get("options", [])}
        output[field["name"]] = entry
    return output


def find_project_id(fields: list[dict[str, Any]], owner: str, number: int) -> str:
    projects = load_json_command(["gh", "project", "list", "--owner", owner, "--format", "json", "--limit", "100"])
    for project in projects.get("projects", []):
        if int(project["number"]) == number:
            return project["id"]
    raise RuntimeError(f"Project {number} for owner {owner} not found")


def fetch_existing_field_values(project_id: str) -> dict[str, dict[str, str]]:
    query = """
query($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100) {
        nodes {
          id
          fieldValues(first: 50) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldTextValue {
                text
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""
    result = run(["gh", "api", "graphql", "-f", f"query={query}", "-F", f"projectId={project_id}"])
    data = json.loads(result.stdout)
    output: dict[str, dict[str, str]] = {}
    for item in data["data"]["node"]["items"]["nodes"]:
        item_values: dict[str, str] = {}
        for value in item["fieldValues"]["nodes"]:
            field = value.get("field") or {}
            field_name = field.get("name")
            if not field_name:
                continue
            if "name" in value and value["name"] is not None:
                item_values[field_name] = str(value["name"])
            elif "text" in value and value["text"] is not None:
                item_values[field_name] = str(value["text"])
            elif "number" in value and value["number"] is not None:
                item_values[field_name] = str(value["number"])
        output[item["id"]] = item_values
    return output


def build_item_map(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["title"]: item for item in items if item.get("title")}


def field_targets(issue: SeedIssue) -> dict[str, tuple[str, str | float]]:
    labels = issue.labels
    area = labels_to_value(labels, "area:")
    work_type = labels_to_value(labels, "type:")
    day_scope = infer_day_scope(labels)
    values: dict[str, tuple[str, str | float]] = {
        "Status": ("single", infer_status(labels)),
        "Risk": ("single", infer_risk(labels)),
        "Figma Required": ("single", "Yes" if "figma:required" in labels else "No"),
        "Manual Gate": ("single", "Yes" if "manual-gate" in labels else "No"),
    }
    if area:
        values["Area"] = ("single", area)
    if work_type:
        values["Work Type"] = ("single", work_type)
    if day_scope:
        values["Day Scope"] = ("single", day_scope)
    if issue.size:
        values["Size"] = ("single", issue.size)
    validation = normalize_validation_class(issue.validation_class, labels)
    if validation:
        values["Validation Class"] = ("single", validation)
    return values


def edit_project_field(
    *,
    item_id: str,
    project_id: str,
    field_name: str,
    value_kind: str,
    value: str | float,
    fields: dict[str, dict[str, Any]],
    existing_values: dict[str, str],
    dry_run: bool,
) -> str:
    field = fields.get(field_name)
    if not field:
        return "unsupported"
    if existing_values.get(field_name) == str(value):
        return "skipped"
    if dry_run:
        return "updated"
    args = ["gh", "project", "item-edit", "--id", item_id, "--project-id", project_id, "--field-id", field["id"]]
    if value_kind == "single":
        option_id = field.get("options", {}).get(str(value))
        if not option_id:
            return "unsupported"
        args.extend(["--single-select-option-id", option_id])
    elif value_kind == "number":
        args.extend(["--number", str(value)])
    elif value_kind == "text":
        args.extend(["--text", str(value)])
    else:
        return "unsupported"
    result = run(args, check=False)
    return "updated" if result.returncode == 0 else f"failed: {result.stderr.strip()}"


def marker_replace(body: str, start: str, end: str, section: str) -> str:
    if start in body and end in body:
        before = body.split(start, 1)[0].rstrip()
        after = body.split(end, 1)[1].lstrip()
        return f"{before}\n\n{section}\n\n{after}".rstrip() + "\n"
    return body.rstrip() + f"\n\n{section}\n"


def issue_body(repo: str, number: int) -> str:
    data = load_json_command(["gh", "issue", "view", str(number), "--repo", repo, "--json", "body"])
    return data.get("body") or ""


def update_issue_body(repo: str, number: int, body: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
        handle.write(body)
        body_path = handle.name
    try:
        result = run(["gh", "issue", "edit", str(number), "--repo", repo, "--body-file", body_path], check=False)
        return result.returncode == 0
    finally:
        Path(body_path).unlink(missing_ok=True)


def sync_fields(args: argparse.Namespace, summary: Summary, issues: list[SeedIssue]) -> dict[str, dict[str, Any]]:
    fields_data = load_json_command(["gh", "project", "field-list", str(args.project_number), "--owner", args.owner, "--format", "json", "--limit", "100"])
    items_data = load_json_command(["gh", "project", "item-list", str(args.project_number), "--owner", args.owner, "--format", "json", "--limit", "1000"])
    fields = field_option_maps(fields_data.get("fields", []))
    project_id = find_project_id(fields_data.get("fields", []), args.owner, args.project_number)
    existing_field_values = fetch_existing_field_values(project_id)
    item_map = build_item_map(items_data.get("items", []))
    summary.project_items_seen = int(items_data.get("totalCount", len(item_map)))
    summary.seeded_titles = len(issues)

    for issue in issues:
        item = item_map.get(issue.title)
        if not item:
            summary.field_failures += 1
            continue
        summary.seeded_items_found += 1
        targets = field_targets(issue)
        for field_name, (value_kind, value) in targets.items():
            result = edit_project_field(
                item_id=item["id"],
                project_id=project_id,
                field_name=field_name,
                value_kind=value_kind,
                value=value,
                fields=fields,
                existing_values=existing_field_values.get(item["id"], {}),
                dry_run=args.dry_run,
            )
            if result == "updated":
                summary.field_updates += 1
            elif result in ("unsupported", "skipped"):
                summary.field_skipped_blank_or_unsupported += 1
            else:
                summary.field_failures += 1
                print(f"FIELD FAILURE {issue.title} {field_name}: {result}", file=sys.stderr)

        # Estimation fields are intentionally not invented.
        for _ in ("Priority", "Man-days Remaining", "Progress %", "Bundle ID"):
            summary.field_skipped_blank_or_unsupported += 1
    return item_map


def sync_hierarchy(args: argparse.Namespace, summary: Summary, children_by_epic: dict[str, list[SeedIssue]], item_map: dict[str, dict[str, Any]]) -> None:
    for epic_title, children in children_by_epic.items():
        epic_item = item_map.get(epic_title)
        if not epic_item or "content" not in epic_item:
            summary.hierarchy_failures += 1
            continue
        epic_number = epic_item["content"]["number"]
        child_lines: list[str] = []
        for child in children:
            child_item = item_map.get(child.title)
            if not child_item or "content" not in child_item:
                summary.hierarchy_failures += 1
                continue
            child_number = child_item["content"]["number"]
            child_url = child_item["content"]["url"]
            child_lines.append(f"- [ ] #{child_number} [{child.title}]({child_url})")
            child_body = issue_body(args.repo, child_number)
            parent_section = "\n".join(
                [
                    PARENT_START,
                    "## Board Parent",
                    "",
                    f"- Parent epic: #{epic_number} [{epic_title}]({epic_item['content']['url']})",
                    PARENT_END,
                ]
            )
            new_child_body = marker_replace(child_body, PARENT_START, PARENT_END, parent_section)
            if new_child_body == child_body:
                summary.hierarchy_skipped += 1
            elif update_issue_body(args.repo, child_number, new_child_body, args.dry_run):
                summary.hierarchy_child_updates += 1
            else:
                summary.hierarchy_failures += 1

        epic_body_text = issue_body(args.repo, epic_number)
        children_section = "\n".join(
            [
                CHILDREN_START,
                "## Board Children",
                "",
                *child_lines,
                CHILDREN_END,
            ]
        )
        new_epic_body = marker_replace(epic_body_text, CHILDREN_START, CHILDREN_END, children_section)
        if new_epic_body == epic_body_text:
            summary.hierarchy_skipped += 1
        elif update_issue_body(args.repo, epic_number, new_epic_body, args.dry_run):
            summary.hierarchy_parent_updates += 1
        else:
            summary.hierarchy_failures += 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=REPO_DEFAULT)
    parser.add_argument("--owner", default=OWNER_DEFAULT)
    parser.add_argument("--project-number", type=int, default=PROJECT_NUMBER_DEFAULT)
    parser.add_argument("--seed", type=Path, default=SEED_DEFAULT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-fields", action="store_true")
    parser.add_argument("--skip-hierarchy", action="store_true")
    args = parser.parse_args()

    issues, children_by_epic = read_seed(args.seed)
    summary = Summary()

    item_map: dict[str, dict[str, Any]] = {}
    if not args.skip_fields:
        item_map = sync_fields(args, summary, issues)
    else:
        items_data = load_json_command(["gh", "project", "item-list", str(args.project_number), "--owner", args.owner, "--format", "json", "--limit", "1000"])
        item_map = build_item_map(items_data.get("items", []))
        summary.project_items_seen = int(items_data.get("totalCount", len(item_map)))
        summary.seeded_titles = len(issues)
        summary.seeded_items_found = sum(1 for issue in issues if issue.title in item_map)

    if not args.skip_hierarchy:
        sync_hierarchy(args, summary, children_by_epic, item_map)

    print(json.dumps(summary.__dict__, indent=2, sort_keys=True))
    return 1 if summary.field_failures or summary.hierarchy_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
