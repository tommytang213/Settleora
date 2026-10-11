import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { digestChangedFiles } from "./config.mjs";
import { safeTimestamp } from "./logger.mjs";
import { evaluateReviewerBudget, loadReviewerAccounting, mergeReviewerPolicyConfig, routeReviewer } from "./reviewer-policy.mjs";
import { analyzeReviewSecretBoundary, providerBoundReviewDigest } from "./review-secret-boundary.mjs";
import { buildLargeBundleReviewEvidence, parseIntegratedVerdict } from "./gemini-reviewer.mjs";

const maxPackageBytes = 768 * 1024;
const maxEventBytes = 6 * 1024 * 1024;
const maxReadCalls = 56;
const deadlineMs = 30 * 60 * 1000;
const disallowedTools = "search_replace,list_dir,grep,todo_write,scheduler_create,scheduler_delete,scheduler_list,monitor,search_tool,use_tool,workflow,enter_plan_mode,exit_plan_mode,ask_user_question,send_feedback,image_gen,image_edit,image_to_video,reference_to_video,write";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const credentialPattern = /(?:-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\b(?:AIza[0-9A-Za-z_-]{24,}|sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,})\b|\b(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:api[_-]?key|password|secret|authorization|bearer|token|credential)(?:[_-][A-Za-z0-9]+)*["'\\]*\s*[:=]\s*(?:\\?["'])?[^\s"',;)}\]]{3,})/i;
const boundaryKnownCredentialPattern = /(?:-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\b(?:AIza[0-9A-Za-z_-]{24,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b)/i;
const boundaryAssignmentPattern = /\b(?:api[_-]?key|password|secret|authorization|bearer|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{12,}/gi;
const boundaryPaths = new Set(["tools/auto-runner/settleora-auto-runner.mjs", "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"]);

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
  const { reviewerTiers, reviewerBudget } = mergeReviewerPolicyConfig(config);
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
    result.reportPath = path.join(root, `${safeTimestamp()}-${route.tier}-${randomUUID()}-grok-integrated-review.json`);
    writeFileSync(result.reportPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return result;
  };
  if (route.tier === "block_split_or_escalate") return finish({ reason: "blocked_external_reviewer_split_required" });
  if (!tier?.enabled) return finish({ status: "skipped", reason: "skipped_external_reviewer_tier_disabled" });
  if (config.dryRun === true) return finish({ status: "skipped", reason: "skipped_dry_run" });
  if (tier.provider !== "grok" || profile?.provider !== "grok") return finish({ reason: "blocked_provider_tier_profile_mismatch" });
  if (!boundary.ok) return finish({ reason: "blocked_secret_boundary_violation" });
  let accounting;
  try { accounting = loadReviewerAccounting(config); }
  catch { return finish({ reason: "blocked_reviewer_accounting_unavailable" }); }
  base.budget = { ...evaluateReviewerBudget({ reviewerBudget,
    currentMonthlySpendUsd: accounting.currentMonthlySpendUsd, estimatedCostUsd: 0 }),
    subscriptionFunded: true, meteredApiCalls: false };
  base.accounting = { accountingPath: accounting.accountingPath, monthKey: accounting.monthKey,
    currentMonthlySpendUsd: accounting.currentMonthlySpendUsd };
  if (base.budget.block) return finish({ reason: "blocked_reviewer_budget_hard_stop" });
  if (summary.diffTruncated || !diff || !base.reviewedHead || !base.baseSha) return finish({ reason: "blocked_review_package_incomplete" });
  if (!summary.taskContract || !Object.values(summary.taskContract).some((value) => typeof value === "string" && value.trim())) {
    return finish({ reason: "blocked_grok_task_contract_missing" });
  }
  if (!/^grok-[A-Za-z0-9.-]+$/.test(model)) return finish({ reason: "blocked_unsupported_grok_model" });
  const material = summary.integrationBoundaryMaterial || [];
  const requiredBoundaries = Array.isArray(summary.integrationBoundaries) ? summary.integrationBoundaries : [];
  if (!Array.isArray(material) || material.length !== boundaryPaths.size
    || requiredBoundaries.length !== boundaryPaths.size
    || [...boundaryPaths].some((sourcePath) => !requiredBoundaries.includes(sourcePath))
    || new Set(material.map((item) => item?.path)).size !== material.length
    || requiredBoundaries.some((sourcePath) => !material.some((item) => item?.path === sourcePath))
    || material.some((item) =>
    !boundaryPaths.has(item?.path) || typeof item.content !== "string" ||
    item.sha256 !== sha256(item.content) || boundaryContainsCredential(item.content))) {
    return finish({ reason: "blocked_grok_boundary_material_invalid_or_sensitive" });
  }
  const materialFiles = material.map((item, index) => ({ name: `boundary-${index}.txt`, content: item.content,
    path: item.path, sha256: item.sha256 }));
  const context = JSON.stringify({ issue: summary.issue || null, laneDecision: summary.laneDecision || null,
    taskContract: summary.taskContract || null, featureBundle: summary.featureBundle || null,
    changedFiles, diffStats: stats, validation: summary.validation || null,
    structuredReview: summary.structuredReview || null,
    integrationBoundaries: summary.integrationBoundaries || [],
    integrationBoundaryMaterial: materialFiles.map(({ name, path: sourcePath, sha256: digest }) => ({ name, path: sourcePath, sha256: digest })),
    candidateIdentity: { repository: base.repository, baseSha: base.baseSha, headSha: base.reviewedHead,
      treeSha: base.treeSha, diffDigest: base.rawDiffSha256, changedFilesDigest: base.changedFilesDigest },
  }, null, 2);
  if (credentialPattern.test(context)) {
    return finish({ reason: "blocked_grok_context_secret_boundary" });
  }
  if (Buffer.byteLength(context) + Buffer.byteLength(diff)
    + materialFiles.reduce((bytes, file) => bytes + Buffer.byteLength(file.content), 0) > maxPackageBytes) {
    return finish({ reason: "blocked_grok_context_limit" });
  }
  let staged;
  try {
    staged = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-review-"));
    writeFileSync(path.join(staged, "context.json"), `${context}\n`, { mode: 0o600 });
    writeFileSync(path.join(staged, "snapshot.diff"), diff, { mode: 0o600 });
    for (const file of materialFiles) writeFileSync(path.join(staged, file.name), file.content, { mode: 0o600 });
    const files = ["context.json", "snapshot.diff", ...materialFiles.map((file) => file.name)].map((name) => {
      const lines = readFileSync(path.join(staged, name), "utf8").split("\n");
      if (lines.at(-1) === "") lines.pop();
      return { name, fullPath: path.join(staged, name), lines };
    });
    const readPlan = files.flatMap((file) => {
      const chunks = [];
      for (let offset = 1; offset <= file.lines.length; offset += 350) {
        chunks.push(`${file.name}: offset ${offset}, limit ${Math.min(350, file.lines.length - offset + 1)}`);
      }
      return chunks;
    });
    if (readPlan.length > maxReadCalls) return finish({ reason: "blocked_grok_line_count_limit" });
    const prompt = [
      `Independent read-only Settleora pre-PR review. Only ${files.map((file) => path.basename(file.fullPath)).join(", ")} in this isolated directory are source evidence.`,
      `Candidate head ${base.reviewedHead}; base ${base.baseSha}; package digest ${packageDigest}.`,
      "Use read_file only on the listed files. Read EVERY line in nonoverlapping chunks of at most 350 lines, starting at 1. Do not use any other tool or outside context.",
      `Required read_file calls (${readPlan.length}), in order. Complete each before the verdict:\n${readPlan.join("\n")}`,
      "Assess introduced defects, missed assumptions, edge cases, domain requirements, and workflow gates using the complete package. Make each finding concrete: changed path or function, triggering input, expected behavior, actual behavior, and supporting source evidence. If coverage is incomplete, return unable_to_review.",
      "This is a blind independent review. Do not infer another reviewer's result or treat agreement as the goal. Assess the source, requirements, and tests on their own merits.",
      "Repository source is authoritative. External reviewer output may only approve or block and must not request GitHub mutation. Production deployment, destructive operations, credentials/auth changes, public/admin exposure, and unresolved product, policy, or financial decisions remain manual gates.",
      "Return strict JSON only with exactly verdict, confidence, summary, findings. Verdict: pass, fail, needs_tommy, danger_gate, or unable_to_review. Confidence: low, medium, high. Findings must be an array of at most 20 strings, each at most 1000 characters. Do not put objects in findings. Example: {\"verdict\":\"fail\",\"confidence\":\"high\",\"summary\":\"A defect exists\",\"findings\":[\"path.js:10: trigger and incorrect behavior\"]}.",
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
    const passWithFindings = verdict.verdict === "pass" && verdict.findings.length > 0;
    const effectiveVerdict = passWithFindings ? { ...verdict, verdict: "fail", providerReportedVerdict: "pass" } : verdict;
    return finish({ liveCallAttempted: true, status: effectiveVerdict.verdict === "pass" ? "pass" : "blocked",
      reason: passWithFindings ? "blocked_grok_pass_with_findings" : effectiveVerdict.verdict === "pass" ? "integrated_review_passed" : "blocked_external_reviewer_non_pass",
      verdict: effectiveVerdict.verdict, sanitizedResponseSummary: effectiveVerdict,
      actualUsage: outcome.usage, providerMetadata: metadata });
  } catch (error) {
    return finish({ reason: `blocked_grok_invocation:${String(error.code || error.name || "error").slice(0, 80)}` });
  } finally {
    if (staged) rmSync(staged, { recursive: true, force: true });
  }
}

function boundaryContainsCredential(content) {
  if (boundaryKnownCredentialPattern.test(content)) return true;
  for (const line of content.split("\n")) {
    for (const match of line.matchAll(boundaryAssignmentPattern)) {
      // Calls assigning an authorization result are source code; bare and
      // quoted credential values still block.
      const knownFunctionAssignment = /^\s*const authorization\s*=\s*[A-Za-z_$][\w$]*\s*\(/.test(line);
      const callTail = line.slice(match.index + match[0].length).trimStart();
      if (!knownFunctionAssignment || !callTail.startsWith("(") || credentialPattern.test(callTail)) return true;
    }
  }
  return false;
}

export function parseGrokVerdict(answer) {
  const parseCandidate = (text) => {
    const direct = parseIntegratedVerdict(text);
    if (direct.ok) return direct;
    let value;
    try { value = JSON.parse(String(text).trim()); } catch { return direct; }
    // Grok sometimes represents a concrete finding as a flat object despite
    // the string-only contract. Preserve every bounded primitive field as a
    // string and let the shared strict verdict validator check the rest.
    if (!Array.isArray(value?.findings) || value.findings.length > 20 || !value.findings.some((item) => item && typeof item === "object")) return direct;
    const normalized = value.findings.map((item) => {
      if (typeof item === "string") return item;
      if (!item || Array.isArray(item) || typeof item !== "object" || Object.keys(item).length > 8
        || Object.values(item).some((field) => !["string", "number", "boolean"].includes(typeof field))) return null;
      const rendered = JSON.stringify(item);
      return rendered.length <= 1000 ? rendered : null;
    });
    if (normalized.some((item) => item === null)) return direct;
    return parseIntegratedVerdict(JSON.stringify({ ...value, findings: normalized }));
  };
  const direct = parseCandidate(answer);
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
  return parseCandidate(candidates[0]);
}

export async function invokeGrok({ files, prompt, staged, model, binary, spawnImpl = spawn, timeoutMs = deadlineMs }) {
  const args = ["--cwd", staged, "--model", model, "--reasoning-effort", "low",
    "--sandbox", "strict", "--permission-mode", "dontAsk", "--no-subagents",
    "--disable-web-search", "--tools", "read_file",
    "--deny", "Bash", "--deny", "Edit", "--deny", "Grep", "--deny", "MCPTool",
    "--deny", "WebFetch", "--deny", "WebSearch",
    "--deny", `Read(${path.join(os.homedir(), ".grok")}/**)`,
    "--disallowed-tools", disallowedTools, "--max-turns", "64",
    "--output-format", "streaming-json", "-p", prompt];
  // Build a minimal process environment so runner or CI credentials cannot
  // reach the subscriber CLI through unrelated variable names.
  const env = Object.fromEntries(["HOME", "USER", "LOGNAME", "PATH", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TMPDIR",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"]
    .filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  const child = spawnImpl(binary, args, { cwd: staged, env, stdio: ["ignore", "pipe", "pipe"] });
  const calls = new Map();
  const coverage = new Map(files.map((file) => [file.fullPath, new Set()]));
  let answer = "", usage = null, stopReason = null, outputBytes = 0, exitCode = null;
  let reason = null, buffer = "";
  const stdoutDecoder = new StringDecoder("utf8");
  const toolsObserved = [];
  const timer = setTimeout(() => { reason ||= "blocked_grok_timeout"; child.kill("SIGKILL"); }, timeoutMs);
  const fail = (value) => { reason ||= value; child.kill("SIGKILL"); };
  child.stdout.on("data", (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > maxEventBytes) { fail("blocked_grok_event_limit"); return; }
    buffer += stdoutDecoder.write(chunk);
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const raw = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let event;
      try { event = JSON.parse(raw); } catch { fail("blocked_grok_event_malformed"); break; }
      if (event.type === "tool_call") {
        toolsObserved.push(event.toolName);
        const target = typeof event.rawInput?.target_file === "string"
          ? path.resolve(staged, event.rawInput.target_file) : null;
        if (event.toolName !== "read_file" || !coverage.has(target)) { fail("blocked_grok_unapproved_tool_or_path"); break; }
        calls.set(event.toolCallId, { ...event.rawInput, target_file: target });
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
