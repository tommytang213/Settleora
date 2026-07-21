import {
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import { defaultLogsRoot } from "../lib/config.mjs";
import {
  runnerRunIdPattern,
  supervisorModeToRunnerMode,
  validateRunnerRunId,
  validateSupervisorRunId,
} from "../lib/run-correlation.mjs";

export const resolverStatuses = Object.freeze({
  matched: "matched",
  missing: "missing",
  multipleMatches: "multiple_matches",
  malformedCandidate: "malformed_candidate",
  jsonMarkdownPairMissing: "json_markdown_pair_missing",
  correlationMismatch: "correlation_mismatch",
});

const defaultMaxFiles = 2000;
const defaultMaxBytes = 512 * 1024;

export function resolveRunnerSummaryForSupervisor({
  logsRoot = defaultLogsRoot,
  supervisorRunId,
  initialOriginMainSha,
  mode,
  maxFiles = defaultMaxFiles,
  maxBytes = defaultMaxBytes,
} = {}) {
  const expectedSupervisorRunId = validateSupervisorRunId(supervisorRunId);
  const summariesRoot = path.join(logsRoot, "summaries");
  const diagnostics = [];
  const compatibleMode = supervisorModeToRunnerMode(mode);
  if (!compatibleMode) {
    return outcome(resolverStatuses.malformedCandidate, diagnostics, { reason: "unsupported_supervisor_mode" });
  }
  if (!existsSync(summariesRoot)) {
    return outcome(resolverStatuses.missing, diagnostics, { summariesRoot });
  }
  const rootRealPath = realpathSync(summariesRoot);
  const names = readdirSync(rootRealPath)
    .filter((name) => /^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z(?:-[a-f0-9]{12})?\.json$/.test(name))
    .sort();
  if (names.length > maxFiles) {
    return outcome(resolverStatuses.malformedCandidate, diagnostics, {
      reason: "scan_limit_exceeded",
      scanned: maxFiles,
      totalCandidates: names.length,
    });
  }

  const matches = [];
  let sawWrongCorrelation = false;
  for (const name of names) {
    const jsonPath = containedPath(rootRealPath, name);
    const candidate = inspectCandidate({
      jsonPath,
      rootRealPath,
      expectedSupervisorRunId,
      initialOriginMainSha,
      compatibleMode,
      maxBytes,
    });
    diagnostics.push(candidate.diagnostic);
    if (candidate.failClosed) {
      return outcome(candidate.status, diagnostics, candidate.extra);
    }
    if (candidate.wrongCorrelation) sawWrongCorrelation = true;
    if (candidate.match) matches.push(candidate.match);
  }
  if (matches.length > 1) {
    return outcome(resolverStatuses.multipleMatches, diagnostics, { matches: matches.map((match) => match.runnerRunId) });
  }
  if (matches.length === 1) {
    return { status: resolverStatuses.matched, ok: true, diagnostics: boundedDiagnostics(diagnostics), ...matches[0] };
  }
  return outcome(sawWrongCorrelation ? resolverStatuses.correlationMismatch : resolverStatuses.missing, diagnostics);
}

function inspectCandidate({
  jsonPath,
  rootRealPath,
  expectedSupervisorRunId,
  initialOriginMainSha,
  compatibleMode,
  maxBytes,
}) {
  const basename = path.basename(jsonPath);
  const runnerRunId = basename.replace(/\.json$/, "");
  const baseDiagnostic = { file: basename, status: "skipped" };
  try {
    validateRunnerRunId(runnerRunId);
    const stat = lstatSync(jsonPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { diagnostic: { ...baseDiagnostic, reason: "json_not_regular_file" } };
    }
    const realJsonPath = realpathSync(jsonPath);
    if (!isContained(rootRealPath, realJsonPath)) {
      return {
        diagnostic: { ...baseDiagnostic, status: "fail_closed", reason: "json_path_escaped_root" },
        failClosed: true,
        status: resolverStatuses.malformedCandidate,
        extra: { reason: "json_path_escaped_root" },
      };
    }
    if (stat.size > maxBytes) {
      const prefix = readBoundedPrefix(jsonPath, maxBytes);
      const claimsExpected = prefix.includes(expectedSupervisorRunId);
      return {
        diagnostic: { ...baseDiagnostic, reason: claimsExpected ? "oversized_matching_candidate" : "oversized_unrelated_candidate" },
        failClosed: claimsExpected,
        status: resolverStatuses.malformedCandidate,
        extra: { reason: "oversized_matching_candidate", runnerRunId },
      };
    }
    const text = readFileSync(jsonPath, "utf8");
    let summary;
    try {
      summary = JSON.parse(text);
    } catch (error) {
      const claimsExpected = text.includes(expectedSupervisorRunId);
      return {
        diagnostic: { ...baseDiagnostic, reason: claimsExpected ? "malformed_matching_json" : "malformed_unrelated_json" },
        failClosed: claimsExpected,
        status: resolverStatuses.malformedCandidate,
        extra: { reason: "malformed_matching_json", runnerRunId, parseError: sanitizeError(error) },
      };
    }
    if (summary?.supervisorRunId !== expectedSupervisorRunId) {
      return {
        diagnostic: {
          ...baseDiagnostic,
          reason: summary?.supervisorRunId ? "wrong_supervisor_run_id" : "missing_supervisor_run_id",
        },
        wrongCorrelation: Boolean(summary?.supervisorRunId),
      };
    }
    const validation = validateMatchingSummary(summary, {
      runnerRunId,
      initialOriginMainSha,
      compatibleMode,
    });
    if (!validation.ok) {
      return {
        diagnostic: { ...baseDiagnostic, status: "fail_closed", reason: validation.reason },
        failClosed: true,
        status: resolverStatuses.malformedCandidate,
        extra: { reason: validation.reason, runnerRunId },
      };
    }
    const markdownPath = containedPath(rootRealPath, `${runnerRunId}.md`);
    const markdown = validateMarkdownPair(markdownPath, rootRealPath);
    if (!markdown.ok) {
      return {
        diagnostic: { ...baseDiagnostic, status: "fail_closed", reason: markdown.reason },
        failClosed: true,
        status: resolverStatuses.jsonMarkdownPairMissing,
        extra: { reason: markdown.reason, runnerRunId },
      };
    }
    return {
      diagnostic: { ...baseDiagnostic, status: "matched", runnerRunId },
      match: {
        runnerRunId,
        runnerSummaryJsonPath: realJsonPath,
        runnerSummaryMarkdownPath: markdown.realMarkdownPath,
        reportPath: markdown.realMarkdownPath,
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
      },
    };
  } catch (error) {
    return {
      diagnostic: { ...baseDiagnostic, status: "fail_closed", reason: "candidate_inspection_failed" },
      failClosed: true,
      status: resolverStatuses.malformedCandidate,
      extra: { reason: "candidate_inspection_failed", detail: sanitizeError(error) },
    };
  }
}

function readBoundedPrefix(filePath, maxBytes) {
  const fd = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function validateMatchingSummary(summary, { runnerRunId, initialOriginMainSha, compatibleMode }) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { ok: false, reason: "summary_not_object" };
  if (summary.runId !== runnerRunId) return { ok: false, reason: "summary_filename_run_id_mismatch" };
  if (!runnerRunIdPattern.test(summary.runId)) return { ok: false, reason: "summary_run_id_invalid" };
  if (Number.isNaN(Date.parse(summary.startedAt || ""))) return { ok: false, reason: "started_at_invalid" };
  if (!summary.finishedAt || Number.isNaN(Date.parse(summary.finishedAt))) return { ok: false, reason: "finished_at_invalid_or_missing" };
  if (summary.baseOriginMainSha !== initialOriginMainSha) return { ok: false, reason: "base_origin_main_sha_mismatch" };
  if (summary.mode !== compatibleMode) return { ok: false, reason: "summary_mode_incompatible" };
  return { ok: true };
}

function validateMarkdownPair(markdownPath, rootRealPath) {
  if (!existsSync(markdownPath)) return { ok: false, reason: "markdown_pair_missing" };
  const stat = lstatSync(markdownPath);
  if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, reason: "markdown_pair_not_regular_file" };
  const realMarkdownPath = realpathSync(markdownPath);
  if (!isContained(rootRealPath, realMarkdownPath)) return { ok: false, reason: "markdown_pair_escaped_root" };
  return { ok: true, realMarkdownPath };
}

function outcome(status, diagnostics, extra = {}) {
  return { status, ok: false, diagnostics: boundedDiagnostics(diagnostics), ...extra };
}

function boundedDiagnostics(diagnostics, limit = 50) {
  return diagnostics.slice(0, limit).map((item) => ({
    file: item.file,
    status: item.status,
    reason: item.reason || null,
    runnerRunId: item.runnerRunId || null,
  }));
}

function containedPath(rootRealPath, basename) {
  if (basename !== path.basename(basename)) throw new Error("Summary basename must be fixed");
  const targetPath = path.resolve(rootRealPath, basename);
  if (!isContained(rootRealPath, targetPath)) throw new Error("Summary path escaped trusted root");
  return targetPath;
}

function isContained(rootRealPath, targetPath) {
  const relative = path.relative(rootRealPath, targetPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sanitizeError(error) {
  return String(error?.message || error || "unknown").slice(0, 200);
}
