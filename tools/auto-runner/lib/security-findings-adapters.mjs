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
      return this.fetchPaginated(sourceKind, "/dependabot/alerts", normalizeDependabotAlert, { pageParameter: false });
    }
    if (sourceKind === "code_scanning_alert") return this.fetchPaginated(sourceKind, "/code-scanning/alerts", normalizeCodeScanningAlert);
    if (sourceKind === "dependabot_pr") return this.fetchDependabotPrs();
    if (sourceKind === "semgrep_artifact" || sourceKind === "trivy_artifact") {
      return { sourceKind, status: "unsupported", reason: "artifact_provider_not_configured", findings: [], failures: ["artifact_provider_not_configured"] };
    }
    return { sourceKind, status: "unsupported", reason: "source_kind_unsupported", findings: [], failures: ["source_kind_unsupported"] };
  }

  fetchPaginated(sourceKind, endpoint, normalizer, options = {}) {
    const settings = securitySettings(this.config);
    const findings = [];
    const failures = [];
    let page = 1;
    while (page <= settings.maxPages && findings.length < settings.maxItems) {
      const query = options.pageParameter === false
        ? `${endpoint}?state=open&per_page=${settings.perPage}`
        : `${endpoint}?state=open&per_page=${settings.perPage}&page=${page}`;
      const result = this.api(query);
      if (!result.ok) return sourceFailure(sourceKind, result);
      if (!Array.isArray(result.json)) return sourceFailure(sourceKind, { status: "malformed", reason: "malformed_response_not_array" });
      if (result.json.length === 0) break;
      for (const item of result.json.slice(0, settings.maxItems - findings.length)) {
        const normalized = normalizer(item, { repository: settings.repository, now: this.now() });
        if (normalized.ok) findings.push(normalized.finding);
        else failures.push(normalized.reason);
      }
      if (result.json.length < settings.perPage) break;
      if (options.pageParameter === false) break;
      page += 1;
    }
    if (page > settings.maxPages) failures.push("page_limit_exceeded");
    return sourceResult(sourceKind, findings, failures);
  }

  fetchDependabotPrs() {
    const settings = securitySettings(this.config);
    const result = this.api(`/pulls?state=open&per_page=${settings.perPage}`);
    if (!result.ok) return sourceFailure("dependabot_pr", result);
    if (!Array.isArray(result.json)) return sourceFailure("dependabot_pr", { status: "malformed", reason: "malformed_response_not_array" });
    const findings = [];
    const failures = [];
    for (const pr of result.json.slice(0, settings.maxItems)) {
      const normalized = normalizeDependabotPr(pr, { repository: settings.repository, now: this.now() });
      if (normalized.ok) findings.push(normalized.finding);
      else if (normalized.reason !== "dependabot_pr_author_unverified") failures.push(normalized.reason);
    }
    return sourceResult("dependabot_pr", findings, failures);
  }

  api(endpoint) {
    const settings = securitySettings(this.config);
    const args = ["api", `repos/${settings.repository}${endpoint}`, "--header", "Accept: application/vnd.github+json"];
    let last = null;
    for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
      const result = this.runner("gh", args, { timeoutMs: settings.timeoutMs });
      last = classifyGhApiResult(result);
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

function sourceResult(sourceKind, findings, failures) {
  if (failures.length > 0) return { sourceKind, status: "partial", findings, failures };
  return { sourceKind, status: "ok", findings, failures: [] };
}

function sourceFailure(sourceKind, result) {
  return {
    sourceKind,
    status: result.status || "failed",
    reason: result.reason || "source_failed",
    findings: [],
    failures: [result.reason || "source_failed"],
    httpStatus: result.httpStatus || null,
  };
}

function classifyGhApiResult(result = {}) {
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
    return { ok: true, status: "ok", json: JSON.parse(result.stdout || "[]") };
  } catch {
    return { ok: false, status: "malformed", reason: "malformed_json_response" };
  }
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
