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
  const match = String(output || "").match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (!match) return unableToReview("Reviewer output did not contain verdict JSON.");
  try {
    const parsed = JSON.parse(match[0]);
    const verdict = enumValue(parsed.verdict, [
      "approve",
      "changes_requested",
      "needs_tommy",
      "danger_gate",
      "unable_to_review",
    ]);
    if (!verdict) return unableToReview(`Reviewer verdict is invalid: ${parsed.verdict || "missing"}`);
    const confidence = enumValue(parsed.confidence, ["low", "medium", "high"]) || "low";
    const triState = ["pass", "partial", "fail", "unclear"];
    const scopeControl = enumValue(parsed.scope_control, ["pass", "fail", "unclear"]) || "unclear";
    const recommendedNextAction =
      enumValue(parsed.recommended_next_action, [
        "open_pr",
        "run_safe_fix_cycle",
        "mark_needs_tommy",
        "mark_auto_failed",
        "mark_danger_gate",
      ]) || "mark_auto_failed";
    return {
      verdict,
      confidence,
      requirement_match: enumValue(parsed.requirement_match, triState) || "unclear",
      code_quality: enumValue(parsed.code_quality, triState) || "unclear",
      scope_control: scopeControl,
      validation_adequacy: enumValue(parsed.validation_adequacy, triState) || "unclear",
      blocking_findings: Array.isArray(parsed.blocking_findings) ? parsed.blocking_findings.slice(0, 20) : [],
      non_blocking_findings: Array.isArray(parsed.non_blocking_findings) ? parsed.non_blocking_findings.slice(0, 20) : [],
      recommended_next_action: recommendedNextAction,
    };
  } catch (error) {
    return unableToReview(`Reviewer verdict JSON could not be parsed: ${error.message}`);
  }
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

function unableToReview(reason) {
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
