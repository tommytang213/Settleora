import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { digestChangedFiles } from "./config.mjs";
import { safeTimestamp } from "./logger.mjs";
import { mergeReviewerPolicyConfig, routeReviewer } from "./reviewer-policy.mjs";
import { analyzeReviewSecretBoundary, providerBoundReviewDigest } from "./review-secret-boundary.mjs";
import { buildLargeBundleReviewEvidence, parseIntegratedVerdict } from "./gemini-reviewer.mjs";

const maxPackageBytes = 128 * 1024;
const maxEventBytes = 2 * 1024 * 1024;
const deadlineMs = 30 * 60 * 1000;
const disallowedTools = "search_replace,list_dir,grep,todo_write,scheduler_create,scheduler_delete,scheduler_list,monitor,search_tool,use_tool,workflow,enter_plan_mode,exit_plan_mode,ask_user_question,send_feedback,image_gen,image_edit,image_to_video,reference_to_video,write";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Each invocation gets a fresh directory containing only the screened review package.
// The CLI must read the complete package before a pass can become evidence.
export async function runGrokIntegratedReview(config, packageInfo, options = {}) {
  const started = Date.now();
  const summary = packageInfo?.summary || {};
  const diff = String(packageInfo?.diff || "");
  const changedFiles = Array.isArray(summary.changedFiles) ? summary.changedFiles : [];
  const boundary = analyzeReviewSecretBoundary({ changedFiles, diff, diffTruncated: summary.diffTruncated === true });
  const stats = Object.fromEntries(["additions", "deletions", "files"].map((key) => [key,
    Math.max(boundary.diffStats?.[key] || 0, Number.isFinite(Number(summary.diffStats?.[key])) && Number(summary.diffStats[key]) >= 0
      ? Number(summary.diffStats[key]) : 0)]));
  const changedFilesDigest = digestChangedFiles(changedFiles);
  const providerBoundDiffSha256 = providerBoundReviewDigest(diff);
  const reviewedHead = summary.currentHead || summary.headSha || summary.runnerCreatedCommitSha || null;
  const baseSha = summary.baseSha || summary.baseRefSha || summary.baseOriginMainSha || null;
  const route = routeReviewer({ changedFiles, laneDecision: summary.laneDecision || {}, stats,
    featureBundle: summary.featureBundle || null, taskContract: summary.taskContract || null,
    largeBundleReviewApproval: config.largeBundleReviewApproval,
    reviewPackageEvidence: buildLargeBundleReviewEvidence({ config, summary, changedFilesDigest,
      rawDiffSha256: boundary.rawDiffSha256, providerBoundDiffSha256, effectiveDiffStats: stats,
      secretBoundary: boundary, reviewedHead, baseSha, diff }) });
  const { reviewerTiers } = mergeReviewerPolicyConfig(config);
  const tier = reviewerTiers[route.tier];
  const profile = config.reviewerProviderProfiles?.[tier?.providerProfile];
  const model = tier?.model || profile?.defaultModel || "grok-4.7";
  const packageDigest = sha256(JSON.stringify({ summary, diff }));
  const base = {
    mode: "integrated-pre-pr-review", provider: "grok", independent: true,
    tier: route.tier, providerProfile: tier?.providerProfile || null, model, route,
    lane: summary.laneDecision?.lane || null, changedFiles,
    changedFilesDigest, packageDigest,
    rawDiffSha256: boundary.rawDiffSha256, providerBoundDiffSha256,
    diffStats: stats,
    secretBoundary: { ok: boundary.ok, blocked: boundary.blocked, reason: boundary.reason,
      blockers: boundary.blockers, allowedReferences: boundary.allowedReferences },
    baseSha,
    treeSha: summary.treeSha || null, repository: summary.repository || null,
    integrationBoundaries: summary.integrationBoundaries || [], verdictSchemaVersion: 1,
    reviewedHead,
    issueNumber: summary.issue?.number || null, liveCallAttempted: false,
    status: "blocked", reason: null, verdict: "not_run", actualUsage: null,
  };
  const finish = (patch) => {
    const result = { ...base, ...patch, elapsedMs: Date.now() - started,
      completedAt: new Date().toISOString() };
    if (result.status === "pass" || (result.reason === "blocked_external_reviewer_non_pass" &&
      ["fail", "needs_tommy", "danger_gate"].includes(result.verdict))) {
      result.attestedCandidateIdentity = { repository: result.repository, baseSha: result.baseSha,
        headSha: result.reviewedHead, treeSha: result.treeSha, diffDigest: result.rawDiffSha256,
        changedFilesDigest: result.changedFilesDigest };
      result.attestedIntegrationBoundaries = result.integrationBoundaries;
      result.attestationSource = "provider_prompt_binding";
      result.providerPromptBindingDigest = result.packageDigest;
    }
    const root = path.join(config.logsRoot, "reviews", "integrated");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    result.reportPath = path.join(root, `${safeTimestamp()}-${route.tier}-${process.pid}-${Date.now()}-grok-integrated-review.json`);
    writeFileSync(result.reportPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return result;
  };
  if (route.tier === "block_split_or_escalate") return finish({ reason: "blocked_external_reviewer_split_required" });
  if (!tier?.enabled) return finish({ status: "skipped", reason: "skipped_external_reviewer_tier_disabled" });
  if (config.dryRun === true) return finish({ status: "skipped", reason: "skipped_dry_run" });
  if (tier.provider !== "grok" || profile?.provider !== "grok") return finish({ reason: "blocked_provider_tier_profile_mismatch" });
  if (!boundary.ok) return finish({ reason: "blocked_secret_boundary_violation" });
  if (summary.diffTruncated || !diff || !base.reviewedHead || !base.baseSha) return finish({ reason: "blocked_review_package_incomplete" });
  if (!/^grok-[A-Za-z0-9.-]+$/.test(model)) return finish({ reason: "blocked_unsupported_grok_model" });
  const context = JSON.stringify({ issue: summary.issue || null, laneDecision: summary.laneDecision || null,
    taskContract: summary.taskContract || null, featureBundle: summary.featureBundle || null,
    changedFiles, diffStats: stats, validation: summary.validation || null,
    structuredReview: summary.structuredReview || null,
    integrationBoundaries: summary.integrationBoundaries || [],
    integrationBoundaryMaterial: summary.integrationBoundaryMaterial || [],
    candidateIdentity: { repository: base.repository, baseSha: base.baseSha, headSha: base.reviewedHead,
      treeSha: base.treeSha, diffDigest: base.rawDiffSha256, changedFilesDigest: base.changedFilesDigest },
  }, null, 2);
  if (/(?:-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\b(?:AIza[0-9A-Za-z_-]{24,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b|\b(?:api[_-]?key|password|secret|authorization|bearer|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{12,})/i.test(context)) {
    return finish({ reason: "blocked_grok_context_secret_boundary" });
  }
  if (Buffer.byteLength(context) + Buffer.byteLength(diff) > maxPackageBytes) {
    return finish({ reason: "blocked_grok_context_limit" });
  }
  let staged;
  try {
    staged = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-review-"));
    writeFileSync(path.join(staged, "context.json"), `${context}\n`, { mode: 0o600 });
    writeFileSync(path.join(staged, "snapshot.diff"), diff, { mode: 0o600 });
    const files = ["context.json", "snapshot.diff"].map((name) => {
      const lines = readFileSync(path.join(staged, name), "utf8").split("\n");
      if (lines.at(-1) === "") lines.pop();
      return { name, fullPath: path.join(staged, name), lines };
    });
    const prompt = [
      "Independent read-only Settleora pre-PR review. Only context.json and snapshot.diff in this isolated directory are source evidence.",
      `Candidate head ${base.reviewedHead}; base ${base.baseSha}; package digest ${packageDigest}.`,
      "Use read_file only on these two files. Read EVERY line in nonoverlapping chunks of at most 350 lines, starting at 1. Do not use any other tool or outside context.",
      "Assess introduced defects, missed assumptions, edge cases, domain requirements, and workflow gates using the complete package. Make each finding concrete: changed path or function, triggering input, expected behavior, actual behavior, and supporting source evidence. If coverage is incomplete, return unable_to_review.",
      "This is a blind independent review. Do not infer another reviewer's result or treat agreement as the goal. Assess the source, requirements, and tests on their own merits.",
      "Repository source is authoritative. External reviewer output may only approve or block and must not request GitHub mutation. Production deployment, destructive operations, credentials/auth changes, public/admin exposure, and unresolved product, policy, or financial decisions remain manual gates.",
      "Return strict JSON only with exactly verdict, confidence, summary, findings. Verdict: pass, fail, needs_tommy, danger_gate, or unable_to_review. Confidence: low, medium, high. Findings: at most 20 bounded strings.",
      "Pass only if the actual lane, scope, validation, changed files, and integration boundaries permit PR creation. Fail or gate for incomplete evidence, unapproved/manual scope, security or correctness defects.",
    ].join("\n");
    const outcome = await invokeGrok({ files, prompt, staged, model,
      binary: options.binary || profile.command || path.join(os.homedir(), ".local/bin/grok"),
      spawnImpl: options.spawnImpl || spawn, timeoutMs: options.timeoutMs || deadlineMs });
    const metadata = { exitCode: outcome.exitCode, stopReason: outcome.stopReason,
      coveredLines: outcome.coveredLines, totalLines: outcome.totalLines,
      toolsObserved: outcome.toolsObserved, outputBytes: outcome.outputBytes };
    if (outcome.reason) return finish({ liveCallAttempted: true, reason: outcome.reason,
      actualUsage: outcome.usage, providerMetadata: metadata });
    const parsed = parseGrokVerdict(outcome.answer);
    if (!parsed.ok) return finish({ liveCallAttempted: true, reason: "blocked_verdict_schema_validation_failed",
      actualUsage: outcome.usage, providerMetadata: { ...metadata,
        verdictParseReason: parsed.reason, verdictParseDetail: String(parsed.detail || "").slice(0, 160),
        answerLength: outcome.answer.length,
        answerPreview: outcome.answer.slice(0, 240) } });
    const verdict = parsed.verdict;
    return finish({ liveCallAttempted: true, status: verdict.verdict === "pass" ? "pass" : "blocked",
      reason: verdict.verdict === "pass" ? "integrated_review_passed" : "blocked_external_reviewer_non_pass",
      verdict: verdict.verdict, sanitizedResponseSummary: verdict,
      actualUsage: outcome.usage, providerMetadata: metadata });
  } catch (error) {
    return finish({ reason: `blocked_grok_invocation:${String(error.code || error.name || "error").slice(0, 80)}` });
  } finally {
    if (staged) rmSync(staged, { recursive: true, force: true });
  }
}

export function parseGrokVerdict(answer) {
  const direct = parseIntegratedVerdict(answer);
  if (direct.ok) return direct;
  const candidates = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < answer.length; index++) {
    const char = answer[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === "{") { if (depth++ === 0) start = index; }
    else if (char === "}" && depth > 0 && --depth === 0) {
      candidates.push(answer.slice(start, index + 1));
    }
  }
  if (candidates.length !== 1 || depth !== 0) return { ok: false, reason: "ambiguous_or_missing_json", detail: `object candidates: ${candidates.length}` };
  return parseIntegratedVerdict(candidates[0]);
}

export async function invokeGrok({ files, prompt, staged, model, binary, spawnImpl = spawn, timeoutMs = deadlineMs }) {
  const args = ["--cwd", staged, "--model", model, "--reasoning-effort", "low",
    "--sandbox", "strict", "--permission-mode", "dontAsk", "--no-subagents",
    "--disable-web-search", "--tools", "read_file",
    "--deny", "Bash", "--deny", "Edit", "--deny", "Grep", "--deny", "MCPTool",
    "--deny", "WebFetch", "--deny", "WebSearch",
    "--deny", `Read(${path.join(os.homedir(), ".grok")}/**)`,
    "--disallowed-tools", disallowedTools, "--max-turns", "32",
    "--output-format", "streaming-json", "-p", prompt];
  const env = { ...process.env };
  for (const key of ["XAI_API_KEY", "GROK_DEPLOYMENT_KEY", "ANTHROPIC_API_KEY"]) delete env[key];
  const child = spawnImpl(binary, args, { cwd: staged, env, stdio: ["ignore", "pipe", "pipe"] });
  const calls = new Map();
  const coverage = new Map(files.map((file) => [file.fullPath, new Set()]));
  let answer = "", usage = null, stopReason = null, outputBytes = 0, exitCode = null;
  let reason = null, buffer = "";
  const toolsObserved = [];
  const timer = setTimeout(() => { reason ||= "blocked_grok_timeout"; child.kill("SIGKILL"); }, timeoutMs);
  const fail = (value) => { reason ||= value; child.kill("SIGKILL"); };
  child.stdout.on("data", (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > maxEventBytes) { fail("blocked_grok_event_limit"); return; }
    buffer += chunk.toString("utf8");
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const raw = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let event;
      try { event = JSON.parse(raw); } catch { fail("blocked_grok_event_malformed"); break; }
      if (event.type === "tool_call") {
        toolsObserved.push(event.toolName);
        const target = event.rawInput?.target_file;
        if (event.toolName !== "read_file" || !coverage.has(target)) { fail("blocked_grok_unapproved_tool_or_path"); break; }
        calls.set(event.toolCallId, event.rawInput);
      } else if (event.type === "tool_call_update" && event.status === "completed") {
        const call = calls.get(event.toolCallId);
        const file = files.find((entry) => entry.fullPath === call?.target_file);
        const offset = call?.offset ?? 1, limit = call?.limit;
        if (!file || !Number.isInteger(offset) || !Number.isInteger(limit) || offset < 1 || limit < 1 || limit > 350) { fail("blocked_grok_read_unverifiable"); break; }
        const body = (event.content || []).map((entry) => entry?.content?.text || "").join("\n");
        const expected = file.lines.slice(offset - 1, offset - 1 + limit);
        const actual = body.split("\n").map((line) => line.replace(/^\d+→/, ""));
        if (actual.at(-1) === "" && actual.length === expected.length + 1) actual.pop();
        if (actual.length !== expected.length || actual.some((line, index) => line !== expected[index])) { fail("blocked_grok_read_unverifiable"); break; }
        for (let index = 0; index < actual.length; index++) coverage.get(file.fullPath).add(offset + index);
      } else if (event.type === "text") {
        answer += String(event.data || "");
        if (answer.length > 16_384) { fail("blocked_grok_answer_limit"); break; }
      } else if (event.type === "end") {
        stopReason = event.stopReason;
        usage = event.usage || null;
      } else if (event.type === "max_turns_reached") {
        reason ||= "blocked_grok_max_turns";
      }
    }
  });
  child.stderr.on("data", () => {}); // Never persist auth or prompt diagnostics.
  try { exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }); } finally { clearTimeout(timer); }
  const totalLines = files.reduce((total, file) => total + file.lines.length, 0);
  const coveredLines = [...coverage.values()].reduce((total, lines) => total + lines.size, 0);
  if (!reason && (exitCode !== 0 || stopReason !== "end_turn")) reason = "blocked_grok_incomplete_response";
  if (!reason && coveredLines !== totalLines) reason = "blocked_grok_incomplete_coverage";
  return { answer, usage, stopReason, exitCode, coveredLines, totalLines, toolsObserved, outputBytes, reason };
}
