import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { markerMatches } from "./issue-proposals.mjs";

export function evaluateSecurityFindingDuplicate(finding = {}, evidence = {}) {
  if (!finding.correlationKey || !finding.idempotencyKey) {
    return { ok: false, status: "ambiguous", reason: "finding_keys_missing", evidence: [] };
  }
  if (evidence.fail) {
    return { ok: false, status: "failed", reason: "evidence_lookup_failed", failures: evidence.failures || [] };
  }
  const sources = flattenEvidence(evidence);
  const authoritative = [];
  const supporting = [];
  const stale = [];
  for (const item of sources) {
    const text = searchableText(item);
    const matched = markerMatches(text, finding.correlationKey) || markerMatches(text, finding.idempotencyKey);
    const stateMatch = item.correlationKey === finding.correlationKey || item.idempotencyKey === finding.idempotencyKey;
    if (!matched && !stateMatch) continue;
    const normalized = {
      source: item.source,
      number: item.number || null,
      state: item.state || null,
      confidence: stateMatch ? "exact_state_key" : "exact_marker",
      authority: item.authority,
      lifecycle: completedState(item) ? "completed" : "active",
      url: item.url || null,
    };
    if (item.authority === "supporting") supporting.push(normalized);
    else if (String(item.state || "").toUpperCase() === "CLOSED" && !completedState(item)) stale.push(normalized);
    else authoritative.push(normalized);
  }
  if (authoritative.length === 1) return { ok: true, status: "duplicate", reason: "authoritative_exact_match", evidence: authoritative };
  if (authoritative.length > 1) return { ok: false, status: "ambiguous", reason: "ambiguous_authoritative_matches", evidence: authoritative };
  if (stale.length > 0) return { ok: false, status: "ambiguous", reason: "stale_closed_evidence_requires_classification", evidence: stale };
  if (supporting.length > 0) return { ok: true, status: "new", reason: "supporting_evidence_only_not_authoritative", evidence: supporting };
  return { ok: true, status: "new", reason: "no_duplicate_found", evidence: [] };
}

export function buildSecurityFindingEvidence(input = {}) {
  return {
    openIssues: input.openIssues || [],
    closedIssues: input.closedIssues || [],
    openPrs: input.openPrs || [],
    closedPrs: input.closedPrs || [],
    comments: input.comments || [],
    reports: input.reports || [],
    durableState: input.durableState || [],
    ledgerEntries: input.ledgerEntries || [],
  };
}

export function readRepositoryCorrelationReports(repoRoot, options = {}) {
  const reportsRoot = path.join(repoRoot, ".codex", "reports");
  const maxFiles = options.maxFiles || 50;
  const reports = [];
  if (!existsSync(reportsRoot)) return reports;
  for (const name of readdirSync(reportsRoot).filter((item) => item.endsWith(".md")).sort().slice(-maxFiles)) {
    const filePath = path.join(reportsRoot, name);
    const text = readFileSync(filePath, "utf8").slice(0, options.maxBytesPerFile || 100_000);
    reports.push({ source: "reports", authority: "authoritative", name, text });
  }
  return reports;
}

function flattenEvidence(evidence) {
  const groups = [
    ["issues.open", "authoritative", evidence.openIssues],
    ["issues.closed", "authoritative", evidence.closedIssues],
    ["prs.open", "authoritative", evidence.openPrs],
    ["prs.closed", "authoritative", evidence.closedPrs],
    ["comments", "authoritative", evidence.comments],
    ["reports", "authoritative", evidence.reports],
    ["durable_state", "authoritative", evidence.durableState],
    ["ledger", "supporting", evidence.ledgerEntries],
  ];
  return groups.flatMap(([source, authority, items]) =>
    (Array.isArray(items) ? items : []).map((item) => ({ ...item, source: item.source || source, authority })),
  );
}

function searchableText(item) {
  return [item.title, item.body, item.text, item.comment, item.correlationKey, item.idempotencyKey].filter(Boolean).join("\n").slice(0, 200_000);
}

function completedState(item) {
  const text = [item.reason, item.body, item.text, item.comment].filter(Boolean).join(" ").toLowerCase();
  return text.includes("completed") || text.includes("merged");
}
