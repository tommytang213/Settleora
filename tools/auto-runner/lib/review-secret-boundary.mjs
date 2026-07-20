import { createHash } from "node:crypto";

const approvedSecretRoot = "/workspace/logs/settleora-auto-runner/secrets";
const maxDiffBytes = 2 * 1024 * 1024;
export const providerBoundReviewDiffChars = 512_000;
const maxDiagnostics = 50;
const maxCandidates = 500;
const maxDiagnosticString = 160;

const secretPathPatterns = Object.freeze([
  /(^|\/)\.env($|[./-])/i,
  /(^|\/)(secrets?|credentials?|tokens?|ssh|private[-_]?keys?)(\/|$)/i,
  /(^|\/)[^/]*private[-_]?key[^/]*$/i,
]);

const knownCredentialValuePatterns = Object.freeze([
  /\bAIza[0-9A-Za-z_-]{24,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
]);

const credentialAssignmentPattern =
  /\b([A-Za-z_][A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)|api[_-]?key|authorization|x-goog-api-key)\b\s*[:=]\s*["']?([A-Za-z0-9._~+/-]{8,})/i;
const bearerPattern = /\bbearer\s+([A-Za-z0-9._~+/-]{12,})/i;
const privateKeyPattern = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

const canonicalSyntheticMarkers = Object.freeze([
  "test-",
  "example-",
  "fake-",
  "dummy-",
  "not-a-real-",
  "placeholder-",
  "sample-",
  "mock-",
  "super-secret-key",
]);

export function analyzeReviewSecretBoundary({ changedFiles = [], diff = "", diffTruncated = false } = {}) {
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);
  const text = String(diff || "");
  const base = {
    ok: true,
    blocked: false,
    reason: "review_secret_boundary_clear",
    blockers: [],
    allowedReferences: [],
    sanitizedDiagnostics: [],
    diffStats: { additions: 0, deletions: 0, files: 0 },
    parsedFiles: [],
    rawDiffSha256: sha256Text(text),
  };

  if (byteLength(text) > maxDiffBytes) {
    return block(base, "review_secret_boundary_diff_too_large", diagnostic({ rule: "diff_size_bound", classification: "malformed_diff" }));
  }
  if (diffTruncated || /\n\[truncated\]\s*$/.test(text)) {
    return block(base, "review_secret_boundary_diff_truncated", diagnostic({ rule: "diff_truncated", classification: "malformed_diff" }));
  }

  for (const file of normalizedChangedFiles) {
    if (isSecretLikePath(file)) {
      addBlocker(base, diagnostic({ rule: "changed_secret_like_path", path: file, classification: "secret_path" }));
    }
    if (isApprovedSecretRootPath(file)) {
      addBlocker(base, diagnostic({ rule: "changed_approved_secret_root_path", path: file, classification: "secret_path" }));
    }
  }

  const parsed = parseUnifiedDiff(text);
  base.diffStats = parsed.stats;
  base.parsedFiles = parsed.files;
  if (!parsed.ok) {
    addBlocker(base, diagnostic({ rule: parsed.reason, classification: "malformed_diff" }));
  }

  let candidateCount = 0;
  for (const event of parsed.events) {
    if (candidateCount >= maxCandidates) {
      addSanitized(base, diagnostic({ rule: "candidate_count_bound", classification: "diagnostic_bound" }));
      break;
    }
    if (event.kind === "symlink") {
      candidateCount += 1;
      addBlocker(base, diagnostic({ rule: "symlink_changed_file", path: event.path, diffLine: event.diffLine, classification: "secret_path" }));
      continue;
    }
    if (event.kind !== "content") continue;
    const findings = classifyContentCandidate(event);
    for (const finding of findings) {
      candidateCount += 1;
      if (finding.blocked) addBlocker(base, finding.diagnostic);
      else addAllowed(base, finding.diagnostic);
      if (candidateCount >= maxCandidates) break;
    }
  }

  if (base.blockers.length > 0) {
    return {
      ...base,
      ok: false,
      blocked: true,
      reason: firstBlockReason(base.blockers),
      blockers: boundDiagnostics(base.blockers),
      allowedReferences: boundDiagnostics(base.allowedReferences),
      sanitizedDiagnostics: boundDiagnostics(base.sanitizedDiagnostics),
    };
  }
  return {
    ...base,
    allowedReferences: boundDiagnostics(base.allowedReferences),
    sanitizedDiagnostics: boundDiagnostics(base.sanitizedDiagnostics),
  };
}

export function providerBoundReviewDigest(diff) {
  return sha256Text(boundText(diff, providerBoundReviewDiffChars));
}

function parseUnifiedDiff(text) {
  if (!text.trim()) return { ok: true, reason: null, events: [], files: [], stats: { additions: 0, deletions: 0, files: 0 } };
  const events = [];
  const files = [];
  const fileSet = new Set();
  const stats = { additions: 0, deletions: 0, files: 0 };
  let currentPath = null;
  let oldLine = null;
  let newLine = null;
  let sawDiffHeader = false;
  let sawHunk = false;
  let malformed = false;
  let malformedReason = null;

  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const diffLine = index + 1;
    const fileMatch = raw.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentPath = normalizeRepoPath(fileMatch[2]);
      oldLine = null;
      newLine = null;
      sawDiffHeader = true;
      sawHunk = false;
      if (!currentPath) {
        malformed = true;
        malformedReason ||= "malformed_diff_path";
      } else if (!fileSet.has(currentPath)) {
        fileSet.add(currentPath);
        files.push(currentPath);
      }
      continue;
    }
    if (!currentPath) {
      if (raw.trim()) {
        malformed = true;
        malformedReason ||= "malformed_diff_missing_file_header";
      }
      continue;
    }
    if (/^(new|deleted) file mode 120000$/.test(raw) || /^old mode 120000$/.test(raw) || /^new mode 120000$/.test(raw)) {
      events.push({ kind: "symlink", path: currentPath, diffLine });
      continue;
    }
    if (/^(new|deleted) file mode \d+$/.test(raw) || /^old mode \d+$/.test(raw) || /^new mode \d+$/.test(raw)) continue;
    if (raw.startsWith("index ") || raw.startsWith("similarity index ") || raw.startsWith("rename from ") || raw.startsWith("rename to ")) continue;
    if (raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;
    if (raw.startsWith("\\ No newline at end of file")) continue;
    if (raw === "GIT binary patch" || raw.startsWith("literal ") || raw.startsWith("delta ")) continue;
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      sawHunk = true;
      continue;
    }
    if (!raw) continue;
    const marker = raw[0];
    if (!["+", "-", " "].includes(marker)) {
      malformed = true;
      malformedReason ||= "malformed_diff_content_line";
      continue;
    }
    if (!sawHunk || !Number.isInteger(oldLine) || !Number.isInteger(newLine)) {
      malformed = true;
      malformedReason ||= "malformed_diff_missing_hunk";
      continue;
    }
    const lineKind = marker === "+" ? "added" : marker === "-" ? "deleted" : "context";
    const fileLine = marker === "+" ? newLine : oldLine;
    const content = raw.slice(1);
    events.push({ kind: "content", path: currentPath, diffLine, fileLine, lineKind, content });
    if (marker === "+") stats.additions += 1;
    if (marker === "-") stats.deletions += 1;
    if (marker !== "+") oldLine += 1;
    if (marker !== "-") newLine += 1;
  }
  stats.files = files.length;
  return {
    ok: sawDiffHeader && !malformed,
    reason: malformedReason || (sawDiffHeader ? null : "malformed_diff_missing_file_header"),
    events,
    files,
    stats,
  };
}

function classifyContentCandidate(event) {
  const findings = [];
  const content = event.content;
  if (isSecretPathReference(content)) {
    findings.push({
      blocked: false,
      diagnostic: diagnostic({ ...event, rule: "secret_path_policy_reference", classification: "policy_reference" }),
    });
  }
  if (privateKeyPattern.test(content)) {
    findings.push({
      blocked: true,
      diagnostic: diagnostic({ ...event, rule: "private_key_block", classification: "credential_value" }),
    });
  }
  for (const pattern of knownCredentialValuePatterns) {
    if (pattern.test(content)) {
      findings.push({
        blocked: true,
        diagnostic: diagnostic({ ...event, rule: "known_credential_format", classification: "credential_value" }),
      });
    }
  }
  const bearer = content.match(bearerPattern);
  if (bearer) {
    const value = bearer[1] || "";
    findings.push(classifyCredentialValue(event, value, "bearer_token"));
  }
  const assignment = content.match(credentialAssignmentPattern);
  if (assignment) {
    const value = assignment[2] || "";
    if (isCodeMemberReference(content, assignment, value)) {
      findings.push({
        blocked: false,
        diagnostic: diagnostic({ ...event, rule: "credential_assignment", classification: "code_reference" }),
      });
    } else {
      findings.push(classifyCredentialValue(event, value, "credential_assignment"));
    }
  }
  return findings;
}

function isCodeMemberReference(content, assignment, value) {
  const assignmentText = content.slice(assignment.index || 0);
  if (/^[^:=]+[:=]\s*[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\?|)\.[A-Za-z_$][A-Za-z0-9_$]*)+\s*[,;)}\]]/.test(assignmentText)) return true;
  const matched = assignment[0] || "";
  const valueOffset = matched.lastIndexOf(value);
  const prefix = valueOffset >= 0 ? matched.slice(0, valueOffset) : "";
  if (/["']\s*$/.test(prefix)) return false;
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(value)) return false;
  const endOffset = (assignment.index || 0) + matched.length;
  return /^\s*[,;)}\]]/.test(content.slice(endOffset));
}

function classifyCredentialValue(event, value, rule) {
  if (isCanonicalSyntheticFixturePath(event.path) && isCanonicalSyntheticValue(value) && !knownCredentialValuePatterns.some((pattern) => pattern.test(value))) {
    return {
      blocked: false,
      diagnostic: diagnostic({ ...event, rule, classification: "synthetic_test_fixture" }),
    };
  }
  return {
    blocked: true,
    diagnostic: diagnostic({ ...event, rule, classification: "credential_value" }),
  };
}

function addBlocker(base, item) {
  base.blockers.push(item);
  addSanitized(base, item);
}

function addAllowed(base, item) {
  base.allowedReferences.push(item);
  addSanitized(base, item);
}

function addSanitized(base, item) {
  if (base.sanitizedDiagnostics.length < maxDiagnostics) base.sanitizedDiagnostics.push(item);
}

function block(base, reason, item) {
  addBlocker(base, item);
  return {
    ...base,
    ok: false,
    blocked: true,
    reason,
    blockers: boundDiagnostics(base.blockers),
    allowedReferences: boundDiagnostics(base.allowedReferences),
    sanitizedDiagnostics: boundDiagnostics(base.sanitizedDiagnostics),
  };
}

function firstBlockReason(blockers) {
  const first = blockers[0]?.rule || "secret_boundary_blocked";
  if (/malformed|truncated|too_large/.test(first)) return "review_secret_boundary_unparseable";
  return "blocked_secret_boundary_violation";
}

function diagnostic(input = {}) {
  const content = typeof input.content === "string" ? input.content : null;
  return {
    rule: boundString(input.rule || "secret_boundary_candidate"),
    path: boundString(input.path || null),
    diffLine: numberOrNull(input.diffLine),
    fileLine: numberOrNull(input.fileLine),
    lineKind: boundString(input.lineKind || null),
    classification: boundString(input.classification || "unknown"),
    lineSha256: content === null ? undefined : sha256Text(content),
  };
}

function boundDiagnostics(items) {
  return items.slice(0, maxDiagnostics).map((item) =>
    Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null && value !== undefined && value !== "")),
  );
}

function normalizeChangedFiles(files) {
  return [...new Set((Array.isArray(files) ? files : []).map((file) => normalizeRepoPath(file)).filter(Boolean))].sort();
}

function normalizeRepoPath(file) {
  const normalized = String(file || "").replaceAll("\\", "/").replace(/^a\//, "").replace(/^b\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) return null;
  return normalized;
}

function isSecretLikePath(file) {
  return secretPathPatterns.some((pattern) => pattern.test(String(file || "")));
}

function isApprovedSecretRootPath(file) {
  return String(file || "").startsWith(`${approvedSecretRoot}/`);
}

function isSecretPathReference(content) {
  return /(^|[\s"'`=:/])\.env($|[./\s"'`-])/i.test(content) || content.includes(approvedSecretRoot);
}

function isCanonicalSyntheticFixturePath(file) {
  const normalized = String(file || "");
  return /(^|\/)(test|tests|__tests__|fixtures|__fixtures__)(\/|$)/i.test(normalized);
}

function isCanonicalSyntheticValue(value) {
  const normalized = String(value || "").replace(/^["']|["']$/g, "").toLowerCase();
  return canonicalSyntheticMarkers.some((marker) => normalized === marker || normalized.startsWith(marker));
}

function numberOrNull(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function boundString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > maxDiagnosticString ? text.slice(0, maxDiagnosticString) : text;
}

function boundText(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || "")).byteLength;
}

function sha256Text(text) {
  return createHash("sha256").update(String(text || "")).digest("hex");
}
