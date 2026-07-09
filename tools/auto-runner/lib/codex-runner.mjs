import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { hktTimestamp, safeTimestamp, slugify } from "./logger.mjs";

export function resolveCodexCommand(requested = "codex-vm-full") {
  const absolute = requested === "codex-vm-full" ? "/home/tommytang213/bin/codex-vm-full" : requested;
  if (requested === "codex-vm-full") {
    const direct = spawnSync("bash", ["-lc", `test -x ${JSON.stringify(absolute)} && printf %s ${JSON.stringify(absolute)}`], {
      encoding: "utf8",
    });
    if (direct.status === 0 && direct.stdout.trim()) {
      return { command: direct.stdout.trim(), source: "absolute-devbox-path" };
    }
  }
  const result = spawnSync("bash", ["-lc", `command -v ${shellQuote(requested)}`], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) {
    return { command: result.stdout.trim(), source: "login-shell-path" };
  }
  throw new Error(
    [
      `Unable to resolve ${requested}.`,
      `Resolver: bash -lc 'command -v ${requested}'`,
      `PATH: ${process.env.PATH || ""}`,
      "Check nordvpn/watchdog/codex doctor if Codex or network auth is unavailable.",
    ].join("\n"),
  );
}

export function runCodexPrompt(config, promptInfo, purpose = "implementation") {
  if (config.dryRun) {
    return { skipped: true, reason: "dry-run", purpose };
  }
  const command = resolveCodexCommand(config.codexCommand);
  const logPath = path.join(
    config.logsRoot,
    "codex-runs",
    `${safeTimestamp()}-${purpose}-${slugify(promptInfo.branchName || "task")}.log`,
  );
  writeFileSync(
    logPath,
    [
      `Settleora auto-runner Codex ${purpose} run`,
      `Started: ${new Date().toISOString()}`,
      `Started HKT: ${hktTimestamp()}`,
      `Command: ${command.command}`,
      `Source: ${command.source}`,
      `Prompt path: ${promptInfo.promptPath}`,
      "",
      "----- codex output -----",
      "",
    ].join("\n"),
  );
  const fd = openSync(logPath, "a");
  let result;
  try {
    result = spawnSync(command.command, [], {
      cwd: config.repoRoot,
      input: promptInfo.prompt,
      stdio: ["pipe", fd, fd],
      encoding: "utf8",
    });
  } finally {
    closeSync(fd);
  }
  appendFileSync(
    logPath,
    [
      "",
      "----- codex process result -----",
      `Finished: ${new Date().toISOString()}`,
      `Finished HKT: ${hktTimestamp()}`,
      `Status: ${result.status === null ? "null" : result.status}`,
      `Signal: ${result.signal || ""}`,
      result.error ? `Launch error: ${result.error.name} ${result.error.code || ""} ${result.error.message}` : "",
      "",
    ].join("\n"),
  );
  return {
    skipped: false,
    command: command.command,
    source: command.source,
    status: result.status,
    signal: result.signal || null,
    error: result.error ? result.error.message : null,
    logPath,
    tail: tailText(logPath),
  };
}

export function runReviewPrompt(config, packageInfo) {
  const prompt = buildReviewPrompt(packageInfo);
  const promptPath = path.join(config.logsRoot, "reviews", `${safeTimestamp()}-review-prompt.md`);
  writeFileSync(promptPath, prompt);
  if (config.dryRun) {
    return {
      skipped: true,
      promptPath,
      verdict: dryRunReviewVerdict(),
      mutationChecked: true,
      mutationDetected: false,
    };
  }
  const command = resolveCodexCommand(config.reviewerCommand || config.codexCommand);
  const logPath = path.join(config.logsRoot, "reviews", `${safeTimestamp()}-review.log`);
  const result = spawnSync(command.command, [], {
    cwd: config.logsRoot,
    input: prompt,
    encoding: "utf8",
  });
  writeFileSync(logPath, `${result.stdout || ""}\n${result.stderr || ""}`);
  return {
    skipped: false,
    promptPath,
    command: command.command,
    source: command.source,
    status: result.status,
    logPath,
    rawOutput: `${result.stdout || ""}\n${result.stderr || ""}`,
    verdict: parseReviewVerdict(`${result.stdout || ""}\n${result.stderr || ""}`),
  };
}

export function parseReviewVerdict(output) {
  const text = String(output || "");
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return unableToReview(
        "Reviewer verdict JSON must be a JSON object.",
        reviewDiagnostics({
          sawJson: true,
          invalidCount: 1,
          failureReason: "Reviewer verdict JSON must be a JSON object.",
        }),
      );
    } catch (error) {
      return unableToReview(
        `Reviewer verdict JSON could not be parsed: ${error.message}`,
        reviewDiagnostics({ failureReason: `Reviewer verdict JSON could not be parsed: ${error.message}` }),
      );
    }
  }
  const extraction = extractReviewVerdictCandidates(text);
  if (extraction.malformed.length > 0) {
    const reason = `Reviewer verdict JSON could not be parsed: ${extraction.malformed[0].source}: ${extraction.malformed[0].reason}`;
    return unableToReview(reason, reviewDiagnostics({ ...extraction, failureReason: reason }));
  }
  if (extraction.oversized.length > 0) {
    const reason = `Reviewer verdict JSON candidate is oversized: ${extraction.oversized[0].source}.`;
    return unableToReview(reason, reviewDiagnostics({ ...extraction, failureReason: reason }));
  }
  if (extraction.valid.length === 0) {
    const reason =
      extraction.invalid.length > 0
        ? extraction.invalid[0].reason
        : extraction.sawJson
          ? "Reviewer output did not contain valid verdict JSON."
          : "Reviewer output did not contain verdict JSON.";
    return unableToReview(reason, reviewDiagnostics({ ...extraction, failureReason: reason }));
  }
  if (extraction.valid.length > 1) {
    const reason = "Reviewer output contained multiple verdict JSON objects; refusing ambiguous review output.";
    return unableToReview(reason, reviewDiagnostics({ ...extraction, failureReason: reason }));
  }
  return {
    ...extraction.valid[0].verdict,
    review_json_diagnostics: reviewDiagnostics({
      ...extraction,
      selectedSource: extraction.valid[0].source,
    }),
  };
}

export function extractReviewVerdictCandidates(output) {
  const text = String(output || "");
  const fenced = collectFencedJsonCandidates(text);
  const fencedRanges = fenced.map((candidate) => candidate.range);
  const raw = collectJsonObjectCandidates(text)
    .filter((candidate) => !fencedRanges.some((range) => candidate.range[0] >= range[0] && candidate.range[1] <= range[1]))
    .map((candidate) => ({
      ...candidate,
      source: text.trim() === candidate.text.trim() ? "raw_json" : "extracted_surrounded_json",
    }));
  const candidates = [...fenced, ...raw];
  const valid = [];
  const malformed = [];
  const invalid = [];
  const oversized = [];
  let sawJson = false;

  for (const candidate of candidates) {
    if (candidate.text.length > maxReviewVerdictJsonCandidateBytes) {
      oversized.push({ source: candidate.source, reason: `candidate length ${candidate.text.length} exceeds ${maxReviewVerdictJsonCandidateBytes}` });
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(candidate.text);
      sawJson = true;
    } catch (error) {
      if (candidate.text.includes('"verdict"')) {
        malformed.push({ source: candidate.source, reason: error.message });
      }
      continue;
    }

    const validation = validateReviewVerdictObject(parsed);
    if (validation.ok) {
      valid.push({
        source: candidate.source,
        verdict: {
          ...validation.verdict,
          json_source: candidate.source,
        },
      });
    } else if (isContractLikeReviewObject(parsed)) {
      invalid.push({ source: candidate.source, reason: validation.reason });
    }
  }

  const trimmed = text.trim();
  if (!sawJson && /^[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      sawJson = true;
      if (!trimmed.startsWith("{")) {
        invalid.push({ source: "raw_json", reason: "Reviewer verdict JSON must be a JSON object." });
      }
    } catch (error) {
      malformed.push({ source: "raw_json", reason: error.message });
    }
  }

  return { valid, invalid, malformed, oversized, sawJson };
}

const maxReviewVerdictJsonCandidateBytes = 128 * 1024;

const reviewVerdictFields = new Set([
  "verdict",
  "confidence",
  "requirement_match",
  "code_quality",
  "scope_control",
  "validation_adequacy",
  "blocking_findings",
  "non_blocking_findings",
  "recommended_next_action",
]);

function validateReviewVerdictObject(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "Reviewer verdict JSON must be a JSON object." };
  }
  for (const key of Object.keys(parsed)) {
    if (!reviewVerdictFields.has(key)) {
      return { ok: false, reason: `Reviewer verdict JSON contains unsupported field: ${key}.` };
    }
  }
  for (const field of reviewVerdictFields) {
    if (!(field in parsed)) {
      return { ok: false, reason: `Reviewer verdict JSON is missing required field: ${field}.` };
    }
  }
  const triState = ["pass", "partial", "fail", "unclear"];
  const enumChecks = [
    ["verdict", parsed.verdict, ["approve", "changes_requested", "needs_tommy", "danger_gate", "unable_to_review"]],
    ["confidence", parsed.confidence, ["low", "medium", "high"]],
    ["requirement_match", parsed.requirement_match, triState],
    ["code_quality", parsed.code_quality, triState],
    ["scope_control", parsed.scope_control, ["pass", "fail", "unclear"]],
    ["validation_adequacy", parsed.validation_adequacy, triState],
    [
      "recommended_next_action",
      parsed.recommended_next_action,
      ["open_pr", "run_safe_fix_cycle", "mark_needs_tommy", "mark_auto_failed", "mark_danger_gate"],
    ],
  ];
  for (const [field, value, allowed] of enumChecks) {
    if (!enumValue(value, allowed)) {
      return { ok: false, reason: `Reviewer verdict field ${field} is invalid: ${String(value || "missing")}.` };
    }
  }
  if (!Array.isArray(parsed.blocking_findings) || !Array.isArray(parsed.non_blocking_findings)) {
    return { ok: false, reason: "Reviewer verdict findings fields must be arrays." };
  }
  return {
    ok: true,
    verdict: {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      requirement_match: parsed.requirement_match,
      code_quality: parsed.code_quality,
      scope_control: parsed.scope_control,
      validation_adequacy: parsed.validation_adequacy,
      blocking_findings: parsed.blocking_findings.slice(0, 20),
      non_blocking_findings: parsed.non_blocking_findings.slice(0, 20),
      recommended_next_action: parsed.recommended_next_action,
    },
  };
}

function isContractLikeReviewObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).some((key) => reviewVerdictFields.has(key)));
}

function collectFencedJsonCandidates(text) {
  const candidates = [];
  const fencePattern = /```json\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fencePattern.exec(text)) !== null) {
    const contentStart = match.index + match[0].indexOf(match[1]);
    candidates.push({
      text: match[1].trim(),
      source: "fenced_json",
      range: [contentStart, contentStart + match[1].length],
    });
  }
  return candidates;
}

function collectJsonObjectCandidates(text) {
  const candidates = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push({ text: text.slice(start, index + 1), range: [start, index + 1] });
        start = -1;
      }
    }
  }
  return candidates;
}

function buildReviewPrompt(packageInfo) {
  return `# Settleora Pre-PR Review

Review only. Do not edit files. Use the provided package and return the required JSON verdict followed by concise notes.

Required JSON shape:

{
  "verdict": "approve | changes_requested | needs_tommy | danger_gate | unable_to_review",
  "confidence": "low | medium | high",
  "requirement_match": "pass | partial | fail | unclear",
  "code_quality": "pass | partial | fail | unclear",
  "scope_control": "pass | fail | unclear",
  "validation_adequacy": "pass | partial | fail | unclear",
  "blocking_findings": [],
  "non_blocking_findings": [],
  "recommended_next_action": "open_pr | run_safe_fix_cycle | mark_needs_tommy | mark_auto_failed | mark_danger_gate"
}

Check issue requirements, generated task prompt, lane policy, diff scope, validation adequacy, maintainability, and forbidden Settleora domains. AI review cannot clear manual or danger gates.

Review package path: ${packageInfo.packagePath}

Package summary:
${JSON.stringify(packageInfo.summary, null, 2)}
`;
}

function dryRunReviewVerdict() {
  return {
    verdict: "unable_to_review",
    confidence: "low",
    requirement_match: "unclear",
    code_quality: "unclear",
    scope_control: "unclear",
    validation_adequacy: "unclear",
    blocking_findings: ["Dry-run does not invoke the review AI command."],
    non_blocking_findings: [],
    recommended_next_action: "mark_auto_failed",
  };
}

function unableToReview(reason, diagnostics = null) {
  return {
    verdict: "unable_to_review",
    confidence: "low",
    requirement_match: "unclear",
    code_quality: "unclear",
    scope_control: "unclear",
    validation_adequacy: "unclear",
    blocking_findings: [reason],
    non_blocking_findings: [],
    recommended_next_action: "mark_auto_failed",
    review_json_diagnostics: diagnostics || reviewDiagnostics({ failureReason: reason }),
  };
}

function reviewDiagnostics(extraction = {}) {
  return {
    valid_verdict_count: extraction.valid?.length || extraction.validCount || 0,
    invalid_candidate_count:
      extraction.invalid?.length || extraction.malformed?.length || extraction.oversized?.length
        ? (extraction.invalid?.length || 0) + (extraction.malformed?.length || 0) + (extraction.oversized?.length || 0)
        : extraction.invalidCount || 0,
    selected_json_source: extraction.selectedSource || null,
    failure_reason: extraction.failureReason || null,
    saw_json: Boolean(extraction.sawJson),
  };
}

function enumValue(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function tailText(filePath, maxLines = 80) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  return lines.slice(-maxLines).join("\n").trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
