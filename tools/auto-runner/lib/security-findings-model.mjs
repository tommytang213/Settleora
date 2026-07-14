import { createHash } from "node:crypto";

export const securityFindingModelVersion = 1;

export const securityFindingSourceKinds = Object.freeze([
  "dependabot_alert",
  "dependabot_pr",
  "code_scanning_alert",
  "semgrep_artifact",
  "trivy_artifact",
]);

export const securityFindingStates = Object.freeze([
  "open",
  "fixed",
  "dismissed",
  "merged",
  "closed",
  "unknown",
]);

export const securityFindingSeverities = Object.freeze([
  "critical",
  "high",
  "medium",
  "low",
  "warning",
  "note",
  "unknown",
]);

const allowedTopLevelFields = new Set([
  "modelVersion",
  "sourceKind",
  "repository",
  "provider",
  "tool",
  "ruleId",
  "alertId",
  "fingerprint",
  "state",
  "severity",
  "ref",
  "analyzedSha",
  "dependency",
  "packageEcosystem",
  "manifestPath",
  "locationPath",
  "locationLine",
  "prNumber",
  "createdAt",
  "updatedAt",
  "sourceUrl",
  "correlationKey",
  "idempotencyKey",
  "ingestedAt",
]);

const rawForbiddenFields = new Set([
  "message",
  "description",
  "snippet",
  "source",
  "sarif",
  "rawSarif",
  "rawPayload",
  "providerPayload",
  "diff",
  "requestBody",
  "responseBody",
  "text",
]);

const controlChars = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const secretLike = /\b(?:bearer\s+[a-z0-9._~+/-]+|api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]|gh[pousr]_[a-z0-9_]{20,})/i;
const promptInjection = /\b(ignore (?:all )?(?:previous|prior) instructions|system prompt|developer message|print secrets?|run shell|curl\s+https?:\/\/)/i;
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const shaPattern = /^[0-9a-f]{40}$/i;
const refPattern = /^(refs\/(?:heads|pull|tags)\/[A-Za-z0-9._/:-]{1,200}|[A-Za-z0-9._/-]{1,120})$/;
const pathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._@+,:= -]+(?:\/[A-Za-z0-9._@+,:= -]+)*$/;

export function normalizeSecurityFinding(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const repository = options.repository || input.repository;
  const errors = [];

  if (!isPlainObject(input)) return invalid(["finding_not_object"]);
  for (const key of Object.keys(input)) {
    if (rawForbiddenFields.has(key)) errors.push(`raw_field_forbidden:${key}`);
    else if (!allowedTopLevelFields.has(key)) errors.push(`unknown_field:${key}`);
  }

  const sourceKind = enumValue(input.sourceKind, securityFindingSourceKinds, "sourceKind", errors);
  const normalized = {
    modelVersion: securityFindingModelVersion,
    sourceKind,
    repository: boundedString(repository, "repository", 120, errors),
    provider: boundedString(input.provider || "github", "provider", 80, errors, { required: true }),
    tool: boundedString(input.tool || toolForSource(sourceKind), "tool", 120, errors, { required: true }),
    ruleId: optionalString(input.ruleId, "ruleId", 180, errors),
    alertId: optionalString(input.alertId, "alertId", 180, errors),
    fingerprint: optionalString(input.fingerprint, "fingerprint", 240, errors),
    state: enumValue(input.state || "unknown", securityFindingStates, "state", errors),
    severity: enumValue(input.severity || "unknown", securityFindingSeverities, "severity", errors),
    ref: optionalString(input.ref, "ref", 240, errors),
    analyzedSha: optionalString(input.analyzedSha, "analyzedSha", 40, errors),
    dependency: optionalString(input.dependency, "dependency", 180, errors),
    packageEcosystem: optionalString(input.packageEcosystem, "packageEcosystem", 80, errors),
    manifestPath: optionalPath(input.manifestPath, "manifestPath", errors),
    locationPath: optionalPath(input.locationPath, "locationPath", errors),
    locationLine: optionalPositiveInteger(input.locationLine, "locationLine", errors),
    prNumber: optionalPositiveInteger(input.prNumber, "prNumber", errors),
    createdAt: optionalIso(input.createdAt, "createdAt", errors),
    updatedAt: optionalIso(input.updatedAt, "updatedAt", errors),
    sourceUrl: optionalSourceUrl(input.sourceUrl, repository, "sourceUrl", errors),
    ingestedAt: optionalIso(input.ingestedAt || now, "ingestedAt", errors),
  };

  if (!repoPattern.test(normalized.repository || "")) errors.push("repository_invalid");
  if (normalized.ref && (!refPattern.test(normalized.ref) || normalized.ref.includes(".."))) errors.push("ref_invalid");
  if (normalized.analyzedSha && !shaPattern.test(normalized.analyzedSha)) errors.push("analyzed_sha_invalid");
  if (!normalized.alertId && !normalized.fingerprint && !(normalized.dependency && normalized.manifestPath) && !normalized.prNumber) {
    errors.push("identity_missing");
  }
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === "string") validateSafeString(value, key, errors);
  }
  if (errors.length > 0) return invalid(errors);

  const keyInput = keyMaterial(normalized);
  normalized.correlationKey = `settleora:security-finding:v1:${digest(keyInput)}`;
  normalized.idempotencyKey = `settleora:security-ingestion:v1:${digest({ ...keyInput, state: normalized.state, updatedAt: normalized.updatedAt || null })}`;
  return { ok: true, finding: dropNullish(normalized) };
}

export function normalizeDependabotAlert(alert = {}, context = {}) {
  const advisory = alert.security_advisory || {};
  const vulnerability = alert.security_vulnerability || {};
  return normalizeSecurityFinding({
    sourceKind: "dependabot_alert",
    repository: context.repository,
    provider: "github",
    tool: "dependabot",
    ruleId: advisory.ghsa_id || advisory.cve_id || advisory.cve || null,
    alertId: alert.number ? String(alert.number) : alert.id ? String(alert.id) : null,
    fingerprint: alert.number ? `dependabot-alert-${alert.number}` : null,
    state: mapState(alert.state),
    severity: mapSeverity(advisory.severity || vulnerability.severity),
    dependency: vulnerability.package?.name || alert.dependency?.package?.name || null,
    packageEcosystem: vulnerability.package?.ecosystem || alert.dependency?.package?.ecosystem || null,
    manifestPath: alert.dependency?.manifest_path || vulnerability.manifest_path || null,
    createdAt: alert.created_at,
    updatedAt: alert.updated_at || alert.fixed_at || alert.dismissed_at,
    sourceUrl: alert.html_url,
  }, context);
}

export function normalizeDependabotPr(pr = {}, context = {}) {
  const author = pr.user || pr.author || {};
  const app = pr.authorAssociation || pr.app || {};
  const verified = author.login === "dependabot[bot]" && (author.type === "Bot" || pr.user?.login === "dependabot[bot]");
  if (!verified) return invalid(["dependabot_pr_author_unverified"]);
  const dependency = extractDependabotDependency(pr);
  return normalizeSecurityFinding({
    sourceKind: "dependabot_pr",
    repository: context.repository,
    provider: "github",
    tool: "dependabot",
    ruleId: pr.head?.ref || pr.headRefName || null,
    alertId: pr.node_id || (pr.number ? `pr-${pr.number}` : null),
    fingerprint: pr.head?.sha || pr.headRefOid || pr.node_id || null,
    state: mapState(pr.state),
    severity: "unknown",
    ref: pr.head?.ref || pr.headRefName || null,
    analyzedSha: pr.head?.sha || pr.headRefOid || null,
    dependency,
    prNumber: pr.number,
    createdAt: pr.created_at || pr.createdAt,
    updatedAt: pr.updated_at || pr.updatedAt,
    sourceUrl: pr.html_url || pr.url,
  }, context);
}

export function normalizeCodeScanningAlert(alert = {}, context = {}) {
  const instance = alert.most_recent_instance || {};
  const location = instance.location || alert.location || {};
  return normalizeSecurityFinding({
    sourceKind: "code_scanning_alert",
    repository: context.repository,
    provider: "github",
    tool: alert.tool?.name || instance.analysis?.tool_name || "code-scanning",
    ruleId: alert.rule?.id || alert.rule_id || null,
    alertId: alert.number ? String(alert.number) : alert.id ? String(alert.id) : null,
    fingerprint: instance.fingerprint || alert.fingerprint || (alert.number ? `code-scanning-${alert.number}` : null),
    state: mapState(alert.state),
    severity: mapSeverity(alert.rule?.security_severity_level || alert.rule?.severity || alert.severity),
    ref: instance.ref || alert.ref,
    analyzedSha: instance.commit_sha || alert.commit_sha,
    locationPath: location.path,
    locationLine: location.start_line,
    createdAt: alert.created_at,
    updatedAt: alert.updated_at || instance.analysis?.created_at,
    sourceUrl: alert.html_url,
  }, context);
}

export function normalizeSarifResult(result = {}, context = {}) {
  const location = result.locations?.[0]?.physicalLocation || {};
  const artifactLocation = location.artifactLocation || {};
  const partial = result.partialFingerprints || {};
  return normalizeSecurityFinding({
    sourceKind: context.sourceKind,
    repository: context.repository,
    provider: context.provider || "artifact",
    tool: context.tool,
    ruleId: result.ruleId,
    alertId: result.guid || null,
    fingerprint: partial.primaryLocationLineHash || partial.primaryLocationStartColumnFingerprint || result.guid || `${result.ruleId}:${artifactLocation.uri || ""}:${location.region?.startLine || ""}`,
    state: "open",
    severity: mapSeverity(result.level),
    ref: context.ref,
    analyzedSha: context.analyzedSha,
    locationPath: artifactLocation.uri,
    locationLine: location.region?.startLine,
    sourceUrl: context.sourceUrl || null,
  }, context);
}

export function normalizeTrivyResult(vulnerability = {}, context = {}) {
  return normalizeSecurityFinding({
    sourceKind: "trivy_artifact",
    repository: context.repository,
    provider: "artifact",
    tool: "trivy",
    ruleId: vulnerability.VulnerabilityID || vulnerability.vulnerabilityID,
    alertId: vulnerability.PkgID || null,
    fingerprint: `${vulnerability.PkgName || ""}:${vulnerability.InstalledVersion || ""}:${vulnerability.VulnerabilityID || ""}`,
    state: "open",
    severity: mapSeverity(vulnerability.Severity),
    dependency: vulnerability.PkgName,
    packageEcosystem: vulnerability.PkgIdentifier?.PURL ? "purl" : context.packageEcosystem || null,
    manifestPath: context.manifestPath || null,
    sourceUrl: context.sourceUrl || null,
  }, context);
}

function keyMaterial(finding) {
  return {
    repository: finding.repository,
    sourceKind: finding.sourceKind,
    tool: finding.tool,
    ruleId: finding.ruleId || null,
    alertId: finding.alertId || null,
    fingerprint: finding.fingerprint || null,
    dependency: finding.dependency || null,
    packageEcosystem: finding.packageEcosystem || null,
    manifestPath: finding.manifestPath || null,
    locationPath: finding.locationPath || null,
    ref: finding.ref || null,
    analyzedSha: finding.analyzedSha || null,
    prNumber: finding.prNumber || null,
  };
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

function invalid(errors) {
  return { ok: false, reason: errors[0] || "invalid_finding", errors };
}

function enumValue(value, allowed, field, errors) {
  const normalized = String(value || "").toLowerCase();
  if (!allowed.includes(normalized)) errors.push(`${field}_invalid`);
  return allowed.includes(normalized) ? normalized : "unknown";
}

function boundedString(value, field, max, errors, options = {}) {
  if (value === null || value === undefined || value === "") {
    if (options.required) errors.push(`${field}_missing`);
    return null;
  }
  if (typeof value !== "string") errors.push(`${field}_not_string`);
  const text = String(value);
  if (text.length > max) errors.push(`${field}_too_long`);
  return text.slice(0, max);
}

function optionalString(value, field, max, errors) {
  return boundedString(value, field, max, errors);
}

function optionalPath(value, field, errors) {
  const text = optionalString(value, field, 260, errors);
  if (text && !pathPattern.test(text)) errors.push(`${field}_invalid`);
  return text;
}

function optionalPositiveInteger(value, field, errors) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 1_000_000_000) errors.push(`${field}_invalid`);
  return number;
}

function optionalIso(value, field, errors) {
  if (value === null || value === undefined || value === "") return null;
  const text = optionalString(value, field, 40, errors);
  if (text && Number.isNaN(Date.parse(text))) errors.push(`${field}_invalid`);
  return text;
}

function optionalSourceUrl(value, repository, field, errors) {
  const text = optionalString(value, field, 500, errors);
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    errors.push(`${field}_invalid`);
    return text;
  }
  const repo = repository || "";
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || !parsed.pathname.startsWith(`/${repo}/`)) {
    errors.push(`${field}_origin_invalid`);
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function validateSafeString(value, field, errors) {
  if (controlChars.test(value)) errors.push(`${field}_control_character`);
  if (secretLike.test(value)) errors.push(`${field}_secret_like`);
  if (promptInjection.test(value)) errors.push(`${field}_prompt_injection_like`);
}

function dropNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== null && child !== undefined));
}

function mapState(value) {
  const text = String(value || "unknown").toLowerCase();
  if (text === "open") return "open";
  if (["fixed", "resolved"].includes(text)) return "fixed";
  if (["dismissed"].includes(text)) return "dismissed";
  if (["closed"].includes(text)) return "closed";
  if (["merged"].includes(text)) return "merged";
  return "unknown";
}

function mapSeverity(value) {
  const text = String(value || "unknown").toLowerCase();
  if (["critical", "high", "medium", "low", "warning", "note"].includes(text)) return text;
  if (text === "error") return "high";
  return "unknown";
}

function extractDependabotDependency(pr) {
  const branch = pr.head?.ref || pr.headRefName || "";
  const match = branch.match(/dependabot\/[^/]+\/(.+)$/);
  return match ? match[1].slice(0, 180) : null;
}

function toolForSource(sourceKind) {
  if (sourceKind === "dependabot_alert" || sourceKind === "dependabot_pr") return "dependabot";
  if (sourceKind === "code_scanning_alert") return "code-scanning";
  if (sourceKind === "semgrep_artifact") return "semgrep";
  if (sourceKind === "trivy_artifact") return "trivy";
  return "unknown";
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
