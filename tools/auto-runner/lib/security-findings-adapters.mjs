import { spawnSync } from "node:child_process";
import {
  normalizeCodeScanningAlert,
  normalizeDependabotAlert,
  normalizeDependabotPr,
  normalizeSarifResult,
  normalizeTrivyResult,
} from "./security-findings-model.mjs";

const defaultTimeoutMs = 20_000;
const retryableStatus = new Set([429, 500, 502, 503, 504]);
const nestedArchivePattern = /\.(zip|tar|tgz|gz|bz2|xz|7z)$/i;

export class GitHubSecurityFindingAdapter {
  constructor(config = {}, options = {}) {
    this.config = config;
    this.runner = options.runner || ghRunner;
    this.now = options.now || (() => new Date().toISOString());
  }

  async fetchSource(sourceKind) {
    if (sourceKind === "dependabot_alert") {
      return this.fetchCursorPaginated(sourceKind, "/dependabot/alerts", normalizeDependabotAlert);
    }
    if (sourceKind === "code_scanning_alert") return this.fetchPaginated(sourceKind, "/code-scanning/alerts", normalizeCodeScanningAlert);
    if (sourceKind === "dependabot_pr") return this.fetchPaginated(sourceKind, "/pulls", normalizeDependabotPr, { skipReason: "dependabot_pr_author_unverified" });
    if (sourceKind === "semgrep_artifact" || sourceKind === "trivy_artifact") {
      return { sourceKind, status: "unsupported", reason: "artifact_provider_not_configured", findings: [], failures: ["artifact_provider_not_configured"] };
    }
    return { sourceKind, status: "unsupported", reason: "source_kind_unsupported", findings: [], failures: ["source_kind_unsupported"] };
  }

  fetchPaginated(sourceKind, endpoint, normalizer, options = {}) {
    const settings = securitySettings(this.config);
    const findings = [];
    const failures = [];
    const seen = new Set();
    const pageSignatures = new Set();
    let page = 1;
    while (page <= settings.maxPages && findings.length < settings.maxItems) {
      const query = `${endpoint}?state=open&per_page=${settings.perPage}&page=${page}`;
      const result = this.api(query);
      if (!result.ok) return sourceFailure(sourceKind, result);
      if (!Array.isArray(result.json)) return sourceFailure(sourceKind, { status: "malformed", reason: "malformed_response_not_array" });
      if (result.json.length > settings.perPage) return sourceFailure(sourceKind, { status: "malformed", reason: "provider_page_size_exceeded" });
      if (result.json.length === 0) break;
      const pageSignature = providerPageSignature(sourceKind, result.json);
      if (result.json.length === settings.perPage) {
        if (pageSignatures.has(pageSignature)) return sourceFailure(sourceKind, { status: "failed", reason: "repeated_full_page_detected" });
        pageSignatures.add(pageSignature);
      }
      for (const item of result.json) {
        if (findings.length >= settings.maxItems) break;
        const normalized = normalizer(item, { repository: settings.repository, now: this.now() });
        if (normalized.ok) {
          const key = exactFindingKey(normalized.finding);
          if (!seen.has(key)) {
            seen.add(key);
            findings.push(normalized.finding);
          }
        } else if (normalized.reason !== options.skipReason) {
          failures.push(normalized.reason);
        }
      }
      if (failures.length > 0) return sourceResult(sourceKind, findings, failures, { completeness: "failed", reason: failures[0] });
      if (findings.length >= settings.maxItems) {
        return sourceResult(sourceKind, findings, ["item_limit_reached"], { status: "bounded_complete", completeness: "bounded_complete", reason: "item_limit_reached" });
      }
      if (result.json.length < settings.perPage) return sourceResult(sourceKind, findings, failures, { completeness: "complete", reason: "partial_page_exhausted" });
      if (page === settings.maxPages) {
        return sourceResult(sourceKind, findings, ["page_limit_reached"], { status: "truncated", completeness: "truncated", reason: "page_limit_reached" });
      }
      page += 1;
    }
    return sourceResult(sourceKind, findings, failures, { completeness: "complete", reason: "empty_page_exhausted" });
  }

  fetchCursorPaginated(sourceKind, endpoint, normalizer, options = {}) {
    const settings = securitySettings(this.config);
    const findings = [];
    const failures = [];
    const seen = new Set();
    const pageSignatures = new Set();
    const seenCursors = new Set();
    let after = null;
    for (let page = 1; page <= settings.maxPages && findings.length < settings.maxItems; page += 1) {
      const cursorQuery = after ? `&after=${encodeURIComponent(after)}` : "";
      const result = this.api(`${endpoint}?state=open&per_page=${settings.perPage}${cursorQuery}`, { includeHeaders: true });
      if (!result.ok) return sourceFailure(sourceKind, result);
      if (!Array.isArray(result.json)) return sourceFailure(sourceKind, { status: "malformed", reason: "malformed_response_not_array" });
      if (result.json.length > settings.perPage) return sourceFailure(sourceKind, { status: "malformed", reason: "provider_page_size_exceeded" });
      if (result.json.length === 0) return sourceResult(sourceKind, findings, failures, { completeness: "complete", reason: "empty_page_exhausted" });
      const pageSignature = providerPageSignature(sourceKind, result.json);
      if (result.json.length === settings.perPage) {
        if (pageSignatures.has(pageSignature)) return sourceFailure(sourceKind, { status: "failed", reason: "repeated_full_page_detected" });
        pageSignatures.add(pageSignature);
      }
      for (const item of result.json) {
        if (findings.length >= settings.maxItems) break;
        const normalized = normalizer(item, { repository: settings.repository, now: this.now() });
        if (normalized.ok) {
          const key = exactFindingKey(normalized.finding);
          if (!seen.has(key)) {
            seen.add(key);
            findings.push(normalized.finding);
          }
        } else if (normalized.reason !== options.skipReason) {
          failures.push(normalized.reason);
        }
      }
      if (failures.length > 0) return sourceResult(sourceKind, findings, failures, { completeness: "failed", reason: failures[0] });
      if (findings.length >= settings.maxItems) {
        return sourceResult(sourceKind, findings, ["item_limit_reached"], { status: "bounded_complete", completeness: "bounded_complete", reason: "item_limit_reached" });
      }
      if (result.json.length < settings.perPage) return sourceResult(sourceKind, findings, failures, { completeness: "complete", reason: "partial_page_exhausted" });
      const nextCursorResult = nextCursorFromLink(result.headers?.link, settings, endpoint);
      if (!nextCursorResult.ok) return sourceFailure(sourceKind, { status: "failed", reason: nextCursorResult.reason });
      const nextCursor = nextCursorResult.cursor;
      if (!nextCursor) return sourceResult(sourceKind, findings, failures, {
        completeness: "complete",
        reason: "cursor_exhausted",
        pagesRead: page,
        itemsRead: findings.length,
        nextCursorPresent: false,
      });
      if (seenCursors.has(nextCursor)) return sourceFailure(sourceKind, { status: "failed", reason: "non_advancing_cursor_detected" });
      seenCursors.add(nextCursor);
      if (page === settings.maxPages) {
        return sourceResult(sourceKind, findings, ["page_limit_reached"], {
          status: "truncated",
          completeness: "truncated",
          reason: "page_limit_reached",
          pagesRead: page,
          itemsRead: findings.length,
          nextCursorPresent: true,
          boundedBy: "maxPages",
        });
      }
      after = nextCursor;
    }
    return sourceResult(sourceKind, findings, failures, { completeness: "complete", reason: "cursor_exhausted" });
  }

  api(endpoint, options = {}) {
    const settings = securitySettings(this.config);
    const args = ["api", `repos/${settings.repository}${endpoint}`, "--header", "Accept: application/vnd.github+json"];
    if (options.includeHeaders) args.splice(1, 0, "--include");
    let last = null;
    for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
      const result = this.runner("gh", args, { timeoutMs: settings.timeoutMs });
      last = classifyGhApiResult(result, options);
      if (last.ok || !retryableStatus.has(last.httpStatus || 0) || attempt === settings.maxRetries) return last;
    }
    return { ...last, status: "provider_failure", reason: "retry_budget_exhausted" };
  }
}

export function parseSecurityArtifactEntries(entries = [], context = {}, options = {}) {
  const limits = {
    maxEntries: options.maxEntries ?? 10,
    maxEntryBytes: options.maxEntryBytes ?? 2 * 1024 * 1024,
    maxFindings: options.maxFindings ?? 200,
  };
  const failures = [];
  const findings = [];
  if (!Array.isArray(entries)) return { ok: false, reason: "artifact_entries_not_array", findings: [], failures: ["artifact_entries_not_array"] };
  if (entries.length > limits.maxEntries) failures.push("artifact_file_count_limit_exceeded");
  for (const entry of entries.slice(0, limits.maxEntries)) {
    const name = String(entry.name || "");
    if (!safeArtifactPath(name)) {
      failures.push("artifact_path_traversal_or_absolute");
      continue;
    }
    if (nestedArchivePattern.test(name)) {
      failures.push("nested_archive_rejected");
      continue;
    }
    const mime = String(entry.mime || "application/json");
    if (!/json|sarif/i.test(mime) && !/\.(json|sarif)$/i.test(name)) {
      failures.push("unexpected_mime_or_extension");
      continue;
    }
    const text = String(entry.text || "");
    if (Buffer.byteLength(text, "utf8") > limits.maxEntryBytes) {
      failures.push("artifact_entry_size_limit_exceeded");
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      failures.push("malformed_json");
      continue;
    }
    const normalized = normalizeArtifactJson(parsed, { ...context, sourceUrl: entry.sourceUrl || context.sourceUrl });
    for (const item of normalized.findings) {
      if (findings.length < limits.maxFindings) findings.push(item);
    }
    failures.push(...normalized.failures);
  }
  if (findings.length >= limits.maxFindings) failures.push("artifact_finding_limit_reached");
  return sourceResult(context.sourceKind || "semgrep_artifact", findings, failures);
}

function normalizeArtifactJson(parsed, context) {
  const findings = [];
  const failures = [];
  if (parsed?.version && Array.isArray(parsed.runs)) {
    for (const run of parsed.runs.slice(0, 20)) {
      const tool = run.tool?.driver?.name || context.tool || (context.sourceKind === "semgrep_artifact" ? "semgrep" : "sarif");
      for (const result of (run.results || []).slice(0, 200)) {
        const normalized = normalizeSarifResult(result, { ...context, tool });
        if (normalized.ok) findings.push(normalized.finding);
        else failures.push(normalized.reason);
      }
    }
    return { findings, failures };
  }
  if (Array.isArray(parsed.Results)) {
    for (const result of parsed.Results.slice(0, 100)) {
      for (const vulnerability of (result.Vulnerabilities || []).slice(0, 200)) {
        const normalized = normalizeTrivyResult(vulnerability, { ...context, manifestPath: result.Target || context.manifestPath });
        if (normalized.ok) findings.push(normalized.finding);
        else failures.push(normalized.reason);
      }
    }
    return { findings, failures };
  }
  failures.push("unsupported_artifact_json_shape");
  return { findings, failures };
}

function safeArtifactPath(name) {
  return Boolean(name && !name.startsWith("/") && !name.includes("\\") && !name.split("/").includes(".."));
}

function sourceResult(sourceKind, findings, failures, metadata = {}) {
  const status = metadata.status || (failures.length > 0 ? "partial" : "ok");
  return {
    sourceKind,
    status,
    reason: metadata.reason || (failures.length > 0 ? failures[0] : null),
    completeness: metadata.completeness || (status === "ok" ? "complete" : "failed"),
    findings,
    failures: failures.length > 0 ? failures : [],
    pagesRead: metadata.pagesRead || null,
    itemsRead: metadata.itemsRead ?? findings.length,
    nextCursorPresent: metadata.nextCursorPresent ?? false,
    boundedBy: metadata.boundedBy || null,
  };
}

function sourceFailure(sourceKind, result) {
  return {
    sourceKind,
    status: result.status || "failed",
    reason: result.reason || "source_failed",
    completeness: "failed",
    findings: [],
    failures: [result.reason || "source_failed"],
    httpStatus: result.httpStatus || null,
    pagesRead: null,
    itemsRead: 0,
    nextCursorPresent: false,
    boundedBy: null,
  };
}

function exactFindingKey(finding = {}) {
  return JSON.stringify({
    sourceKind: finding.sourceKind || null,
    correlationKey: finding.correlationKey || null,
    idempotencyKey: finding.idempotencyKey || null,
    alertId: finding.alertId || null,
    fingerprint: finding.fingerprint || null,
    prNumber: finding.prNumber || null,
    updatedAt: finding.updatedAt || null,
  });
}

function providerPageSignature(sourceKind, items = []) {
  return JSON.stringify(items.map((item) => providerRecordIdentity(sourceKind, item)));
}

function providerRecordIdentity(sourceKind, item = {}) {
  if (sourceKind === "dependabot_pr") {
    return {
      number: item.number || null,
      node_id: item.node_id || null,
      user: item.user?.login || item.author?.login || null,
      type: item.user?.type || item.author?.type || null,
      state: item.state || null,
      headRef: item.head?.ref || item.headRefName || null,
      headSha: item.head?.sha || item.headRefOid || null,
      updatedAt: item.updated_at || item.updatedAt || null,
    };
  }
  return {
    number: item.number || null,
    id: item.id || null,
    state: item.state || null,
    dependency: item.security_vulnerability?.package?.name || item.dependency?.package?.name || null,
    ecosystem: item.security_vulnerability?.package?.ecosystem || item.dependency?.package?.ecosystem || null,
    manifestPath: item.dependency?.manifest_path || item.security_vulnerability?.manifest_path || null,
    updatedAt: item.updated_at || item.updatedAt || null,
  };
}

function nextCursorFromLink(linkHeader, settings, endpoint) {
  const link = String(linkHeader || "");
  for (const part of link.split(",")) {
    if (!/;\s*rel="next"/i.test(part)) continue;
    const url = part.match(/<([^>]+)>/)?.[1];
    if (!url) return { ok: false, reason: "next_cursor_url_missing" };
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "next_cursor_url_invalid" };
    }
    if (parsed.protocol !== "https:") return { ok: false, reason: "next_cursor_url_not_https" };
    if (parsed.hostname !== "api.github.com") return { ok: false, reason: "next_cursor_host_unexpected" };
    if (parsed.pathname !== `/repos/${settings.repository}${endpoint}`) return { ok: false, reason: "next_cursor_path_unexpected" };
    if (parsed.searchParams.get("state") !== "open") return { ok: false, reason: "next_cursor_state_unexpected" };
    if (parsed.searchParams.get("per_page") !== String(settings.perPage)) return { ok: false, reason: "next_cursor_per_page_unexpected" };
    const cursor = parsed.searchParams.get("after");
    if (!cursor) return { ok: false, reason: "next_cursor_missing" };
    if (cursor.length > 512) return { ok: false, reason: "next_cursor_too_long" };
    if (/[\u0000-\u001f\u007f]/.test(cursor)) return { ok: false, reason: "next_cursor_control_character" };
    return { ok: true, cursor };
  }
  return { ok: true, cursor: null };
}

function classifyGhApiResult(result = {}, options = {}) {
  if (result.error) return { ok: false, status: "provider_failure", reason: "provider_execution_failed" };
  const stderr = String(result.stderr || "");
  if (result.status !== 0) {
    const httpStatus = Number(stderr.match(/HTTP ([0-9]{3})/)?.[1] || stderr.match(/status code ([0-9]{3})/)?.[1] || 0) || null;
    if (httpStatus === 403) return { ok: false, status: "permission_denied", reason: "permission_denied", httpStatus };
    if (httpStatus === 404) return { ok: false, status: "endpoint_unavailable", reason: "endpoint_unavailable_or_inaccessible", httpStatus };
    if (retryableStatus.has(httpStatus)) return { ok: false, status: "provider_failure", reason: "provider_retryable_failure", httpStatus };
    return { ok: false, status: "provider_failure", reason: "provider_api_failed", httpStatus };
  }
  try {
    const parsed = options.includeHeaders ? parseIncludedGhResponse(result.stdout || "") : { body: result.stdout || "[]", headers: {} };
    return { ok: true, status: "ok", json: JSON.parse(parsed.body || "[]"), headers: parsed.headers };
  } catch {
    return { ok: false, status: "malformed", reason: "malformed_json_response" };
  }
}

function parseIncludedGhResponse(stdout) {
  const separator = stdout.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const index = stdout.indexOf(separator);
  if (index < 0) return { headers: {}, body: stdout };
  const headerText = stdout.slice(0, index);
  const headers = {};
  for (const line of headerText.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { headers, body: stdout.slice(index + separator.length) };
}

function ghRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs || defaultTimeoutMs,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function securitySettings(config = {}) {
  const settings = config.securityFindings || {};
  return {
    repository: settings.allowedRepository || config.repositorySlug || "tommytang213/Settleora",
    maxPages: settings.maxPages || 2,
    perPage: settings.perPage || 50,
    maxItems: settings.maxItems || 100,
    maxRetries: settings.maxRetries || 0,
    timeoutMs: settings.timeoutMs || defaultTimeoutMs,
  };
}
