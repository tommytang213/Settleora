import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { processAppearsActive } from "./state-store.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { buildOutageResubmissionStatus } from "../supervisor/outage-resubmission-controller.mjs";

const controlFileName = "runner-control.json";
const activeRunFileName = "active-run.json";
const lockFileName = "settleora-auto-runner.lock";

export function writeActiveRunState(config, summary, extra = {}) {
  const activePath = path.join(config.logsRoot, "state", activeRunFileName);
  const state = sanitize({
    runId: summary.runId,
    mode: summary.mode,
    configPath: config.configPath || null,
    pid: process.pid,
    startedAt: summary.startedAt,
    lastHeartbeatAt: new Date().toISOString(),
    maxIterations: config.maxIterations,
    maxRuntimeMs: config.maxRuntimeMs,
    completedIterations: (summary.iterations || []).length,
    attemptedIssueNumbers: summary.attemptedIssueNumbers || [],
    attemptedIssueCount: summary.attemptedIssueCount || 0,
    processedIssueNumbers: summary.processedIssueNumbers || [],
    processedIssueCount: summary.processedIssueCount || 0,
    outcomeCounts: countIterationOutcomes(summary.iterations || []),
    failedOrBlockedIterations: countFailedOrBlocked(summary.iterations || []),
    baseOriginMainSha: summary.baseOriginMainSha || null,
    supervisorRunId: summary.supervisorRunId || null,
    stopReason: summary.stopReason || null,
    logPath: summary.logPath || null,
    summaryPath: extra.summaryPath || null,
    latestIteration: summarizeIteration((summary.iterations || []).at(-1)),
    operationalProjection: summarizeOperationalIteration((summary.iterations || []).at(-1), summary),
    control: readControlState(config).control,
    ...extra,
  });
  atomicWriteJson(activePath, state);
  return activePath;
}

export function clearActiveRunState(config, summaryPath = null) {
  const activePath = path.join(config.logsRoot, "state", activeRunFileName);
  if (!existsSync(activePath)) return;
  try {
    const active = JSON.parse(readFileSync(activePath, "utf8"));
    atomicWriteJson(activePath, {
      ...active,
      active: false,
      finishedAt: new Date().toISOString(),
      summaryPath,
      control: readControlState(config).control,
    });
  } catch {
    // Leave malformed state for operator inspection.
  }
}

export function readControlState(config) {
  const controlPath = path.join(config.logsRoot, "state", controlFileName);
  if (!existsSync(controlPath)) return { controlPath, control: null, malformed: false };
  try {
    return { controlPath, control: sanitize(JSON.parse(readFileSync(controlPath, "utf8"))), malformed: false };
  } catch (error) {
    return { controlPath, control: null, malformed: true, error: error.message };
  }
}

export function writeControlCommand(config, cliArgs) {
  const active = readActiveRun(config);
  if (!active.active) {
    return { ok: false, reason: active.reason || "no_active_runner", active };
  }
  const current = readControlState(config).control || {};
  const patch = {
    updatedAt: new Date().toISOString(),
    updatedByPid: process.pid,
  };
  if (cliArgs.controlCommand === "pause") {
    patch.pause = true;
  } else if (cliArgs.controlCommand === "stop-after-current") {
    patch.stopAfterCurrent = true;
  } else if (cliArgs.controlCommand === "extend") {
    patch.extensionRequest = {
      requestedAt: new Date().toISOString(),
      maxIterationsDelta: cliArgs.maxIterationsExtension || 0,
      maxRuntimeMsDelta: cliArgs.maxRuntimeExtensionMs || 0,
      appliedByRunId: null,
      appliedAt: null,
    };
  } else {
    return { ok: false, reason: "unknown_control_command" };
  }
  const controlPath = path.join(config.logsRoot, "state", controlFileName);
  const control = sanitize({ ...current, ...patch });
  atomicWriteJson(controlPath, control);
  return { ok: true, controlPath, control, active };
}

export function applyControlAtSafeBoundary(config, summary) {
  const state = readControlState(config);
  if (state.malformed) {
    return { action: "stop", reason: "control_file_malformed", control: null };
  }
  const control = state.control || {};
  const extension = control.extensionRequest;
  if (extension && extension.appliedByRunId !== summary.runId) {
    if (extension.maxIterationsDelta) {
      config.maxIterations += extension.maxIterationsDelta;
    }
    if (extension.maxRuntimeMsDelta) {
      config.maxRuntimeMs = (config.maxRuntimeMs || 0) + extension.maxRuntimeMsDelta;
    }
    const updated = {
      ...control,
      extensionRequest: {
        ...extension,
        appliedByRunId: summary.runId,
        appliedAt: new Date().toISOString(),
        resultingMaxIterations: config.maxIterations,
        resultingMaxRuntimeMs: config.maxRuntimeMs,
      },
    };
    atomicWriteJson(state.controlPath, sanitize(updated));
  }
  writeActiveRunState(config, summary);
  if (control.pause) return { action: "stop", reason: "paused_by_control", control };
  if (control.stopAfterCurrent) return { action: "stop", reason: "stop_after_current_requested", control };
  return { action: "continue", reason: null, control };
}

export function getRunnerStatus(config) {
  const lock = readLock(config);
  const active = readActiveRun(config);
  const control = readControlState(config);
  const latestSummary = readLatestRunSummary(config);
  const source = active.parsed || latestSummary?.summary || null;
  const startedAt = source?.startedAt || null;
  const maxRuntimeMs = source?.maxRuntimeMs ?? active.parsed?.maxRuntimeMs ?? null;
  const elapsedMs = startedAt ? Math.max(0, Date.now() - Date.parse(startedAt)) : null;
  const runtimeRemainingMs = maxRuntimeMs && elapsedMs !== null ? Math.max(0, maxRuntimeMs - elapsedMs) : null;
  const maxIterations = source?.maxIterations ?? source?.requestedMaxIterations ?? null;
  const completedIterations = source?.completedIterations ?? (source?.iterations || []).length ?? null;
  const outcomeCounts = source?.outcomeCounts || countIterationOutcomes(source?.iterations || []);
  const failedOrBlockedIterations = source?.failedOrBlockedIterations ?? outcomeCounts.failed + outcomeCounts.blocked;
  const latestRawIteration = (source?.iterations || []).at(-1) || null;
  const latestIteration = source?.latestIteration || summarizeIteration(latestRawIteration);
  return sanitize({
    generatedAt: new Date().toISOString(),
    active: Boolean(lock.active || active.active),
    activeRunId: active.parsed?.runId || (lock.active ? lock.parsed?.runId : null),
    lock,
    mode: source?.mode || null,
    supervisorRunId: source?.supervisorRunId || null,
    configPath: source?.configPath || null,
    startedAt,
    elapsedMs,
    maxRuntimeMs,
    runtimeRemainingMs,
    maxIterations,
    maxPrs: maxIterations,
    completedIterations,
    completedPrs: completedIterations,
    failedOrBlockedIterations,
    outcomeCounts,
    estimatedRemainingIterations:
      Number.isFinite(maxIterations) && Number.isFinite(completedIterations)
        ? Math.max(0, maxIterations - completedIterations)
        : null,
    estimatedRemainingPrs:
      Number.isFinite(maxIterations) && Number.isFinite(completedIterations)
        ? Math.max(0, maxIterations - completedIterations)
        : null,
    currentOrLastIssue: latestIteration?.issue || null,
    currentOrLastPr: latestIteration?.pr || null,
    latestTerminalOutcome: latestIteration?.outcome || null,
    operationalProjection: source?.operationalProjection || summarizeOperationalIteration(latestRawIteration, source),
    attemptedIssueNumbers: source?.attemptedIssueNumbers || [],
    attemptedIssueCount: source?.attemptedIssueCount || 0,
    processedIssueNumbers: source?.processedIssueNumbers || [],
    processedIssueCount: source?.processedIssueCount || 0,
    stopReason: source?.stopReason || null,
    lastEventAt: latestIteration?.finishedAt || latestIteration?.startedAt || source?.lastHeartbeatAt || source?.finishedAt || source?.startedAt || null,
    paths: {
      summary: active.parsed?.summaryPath || latestSummary?.path || null,
      markdownSummary: latestSummary?.markdownPath || null,
      log: source?.logPath || null,
      activeState: active.path,
      lock: lock.path,
      control: control.controlPath,
    },
    control: control.malformed ? { malformed: true, error: control.error } : control.control || null,
    outageResubmission: buildOutageResubmissionStatus(config),
  });
}

function summarizeOperationalIteration(iteration = {}, run = {}) {
  iteration ||= {};
  run ||= {};
  const convergence = iteration.reviewConvergenceState || iteration.reviewConvergence || {};
  const counters = convergence.twoLoop || convergence.counters || iteration.twoLoopCounters || {};
  const budget = iteration.logicalTaskBudget || {};
  const recovery = iteration.recovery?.state || iteration.recovery || {};
  const session = iteration.sessionLifecycle || {};
  const controller = session.controller || {};
  const large = iteration.largeCandidateReview?.state || iteration.largeCandidateReview || {};
  const split = iteration.featureBundleSplit || iteration.splitMaterialization || large.split || {};
  const stack = iteration.prStackExecution || iteration.stackExecution || {};
  return sanitize({
    lifecycle: {
      phase: recovery.phase || controller.phase || iteration.phase || null,
      continuationState: iteration.ordinaryCandidateContinuation?.phase || recovery.continuation?.phase || null,
      ownerPosture: session.authority?.status || session.owner?.status || null,
      terminalPosture: session.terminal?.status || iteration.outcome || null,
    },
    counters: {
      acceptedTaskBudget: {
        configured: run.maxIterations ?? run.requestedMaxIterations ?? null,
        consumed: budget.acceptedLogicalTaskCount ?? run.acceptedLogicalTaskCount ?? null,
        remaining: Number.isSafeInteger(run.maxIterations) && Number.isSafeInteger(budget.acceptedLogicalTaskCount)
          ? Math.max(0, run.maxIterations - budget.acceptedLogicalTaskCount)
          : null,
        chargeIdentity: budget.chargeId || budget.logicalTaskKey || null,
        chargeStatus: budget.charged ? "charged" : budget.duplicate ? "already_charged" : budget.reasonCode || null,
      },
      localSourceChangingRoundsPerEpoch: counters.localSourceChangingRoundsPerEpoch ?? convergence.localSourceChangingRoundsPerEpoch ?? null,
      githubTriggeredFixEpochsPerPr: counters.githubTriggeredFixEpochsPerPr ?? convergence.githubTriggeredFixEpochsPerPr ?? null,
      lifetimeLocalSourceChangingRounds: counters.lifetimeLocalSourceChangingRounds ?? convergence.lifetimeLocalSourceChangingRounds ?? null,
    },
    recovery: {
      outcomeClass: recovery.attemptClass || recovery.outcomeClass || null,
      classification: iteration.recovery?.classification || recovery.classification || null,
      phase: recovery.phase || null,
      nextSafeAction: recovery.nextSafeAction || iteration.recovery?.nextAction || null,
      reasonCode: iteration.recovery?.reasonCode || recovery.blocker || null,
    },
    session: {
      generation: session.authority?.generation ?? session.generation ?? null,
      phase: controller.phase || session.phase || null,
      rotationReason: session.rotation?.reason || session.rotationReason || null,
      contextPressure: session.context?.pressureCategory || session.contextPressure || "unknown",
      continuationState: session.continuation?.status || null,
      ownerPosture: session.authority?.status || null,
      terminalPosture: session.terminal?.status || null,
    },
    review: {
      exactHead: iteration.runnerCreatedCommitSha || iteration.expectedHeadSha || iteration.pr?.headSha || null,
      validationStatus: iteration.validation?.passed === true ? "pass" : iteration.validation ? "failed" : null,
      geminiStatus: iteration.externalReview?.reviewStatus || iteration.externalReview?.status || null,
      localCodexStatus: iteration.review?.verdict?.verdict || iteration.review?.reviewStatus || null,
      githubCodexStatus: iteration.autoMerge?.githubCodexReview?.status || null,
      ciStatus: iteration.autoMerge?.checks?.ok === true ? "pass" : iteration.autoMerge?.checks?.status || null,
      scannerStatus: iteration.autoMerge?.scanners?.status || null,
      unresolvedThreads: iteration.autoMerge?.unresolvedThreadCount ?? null,
      openAlerts: iteration.autoMerge?.openAlertCount ?? null,
    },
    largeCandidate: {
      route: large.route || iteration.externalReview?.route?.largeCandidateRouting?.route || null,
      coverageStatus: large.coverage?.status || large.coverageStatus || null,
      integrationStatus: large.integration?.status || large.integrationStatus || null,
      uncoveredScopeIds: large.uncoveredScopeIds || large.contextLimit?.uncoveredScopeIds || [],
      splitState: split.status || split.phase || null,
      stackState: stack.status || stack.phase || null,
      handoffState: split.stackHandoff?.status || stack.handoff?.status || null,
    },
    effects: {
      pendingIntentCount: recovery.pendingIntentCount ?? null,
      confirmedEffectCount: recovery.confirmedEffectCount ?? null,
      adoptedEffectCount: recovery.adoptedEffectCount ?? null,
      nextEffectType: recovery.nextEffectType || null,
    },
    nextSafeAction: recovery.nextSafeAction || controller.nextExactAction || iteration.nextSafeAction || null,
  });
}

export function listRuns(config, limit = 20) {
  const summariesDir = path.join(config.logsRoot, "summaries");
  if (!existsSync(summariesDir)) return [];
  return readdirSync(summariesDir)
    .filter((name) => /^run-.*\.json$/.test(name))
    .map((name) => readSummaryFile(path.join(summariesDir, name)))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.summary.finishedAt || b.summary.startedAt || 0) - Date.parse(a.summary.finishedAt || a.summary.startedAt || 0))
    .slice(0, limit)
    .map(({ path: summaryPath, markdownPath, summary }) => sanitize({
      runId: summary.runId,
      startedAt: summary.startedAt || null,
      finishedAt: summary.finishedAt || null,
      stopReason: summary.stopReason || null,
      counts: {
        iterations: (summary.iterations || []).length,
        ...countIterationOutcomes(summary.iterations || []),
        failedOrBlocked: countFailedOrBlocked(summary.iterations || []),
      },
      latestIssue: summarizeIteration((summary.iterations || []).at(-1))?.issue || null,
      latestPr: summarizeIteration((summary.iterations || []).at(-1))?.pr || null,
      summaryPath,
      markdownPath,
    }));
}

export function listEvents(config, runId) {
  const summaryInfo = readSummaryFile(path.join(config.logsRoot, "summaries", `${runId}.json`));
  if (!summaryInfo) return { runId, found: false, events: [] };
  const events = [];
  for (const iteration of summaryInfo.summary.iterations || []) {
    const issue = iteration.issue ? `#${iteration.issue.number} ${iteration.issue.title || ""}`.trim() : "unknown issue";
    events.push(event(iteration.startedAt, "issue", issue, iteration.issue || null));
    if (iteration.branchName) events.push(event(iteration.startedAt, "branch", iteration.branchName, { branchName: iteration.branchName }));
    for (const selectionEvent of iteration.candidateSelection?.events || []) {
      events.push(event(iteration.startedAt, "selection", selectionEvent.action, selectionEvent));
    }
    if (iteration.pr) events.push(event(iteration.finishedAt || iteration.startedAt, "pr", prEventSummary(iteration), summarizePr(iteration.pr, iteration.runnerCreatedCommitSha, iteration.autoMerge?.mergeSha)));
    if (iteration.externalReview) events.push(event(iteration.finishedAt || iteration.startedAt, "review", independentReviewLine(iteration), summarizeExternalReview(iteration.externalReview)));
    if (iteration.review) {
      events.push(event(iteration.finishedAt || iteration.startedAt, "review", `Codex mechanics: ${iteration.review.verdict?.verdict || "unknown"}`, {
        verdict: iteration.review.verdict?.verdict || null,
        evidence: iteration.review.logPath || iteration.review.promptPath || null,
        attemptCount: iteration.review.attemptCount || iteration.review.attempts?.length || null,
        reviewStatus: iteration.review.reviewStatus || null,
        failureCategory: iteration.review.reviewFailureCategory || null,
        failureReason: iteration.review.reviewFailureReason || iteration.review.verdict?.review_json_diagnostics?.failure_reason || null,
        responsePayloadBoundary: iteration.review.responsePayloadBoundary || iteration.review.verdict?.review_output_boundary?.response_payload_boundary || null,
        attempts: iteration.review.attempts || [],
      }));
    }
    if (iteration.validation) events.push(event(iteration.finishedAt || iteration.startedAt, "checks", iteration.validation.passed ? "local validation passed" : "local validation failed", { commands: (iteration.validation.results || []).map((r) => ({ command: r.command, status: r.status, error: r.error || null })) }));
    if (iteration.autoMerge) events.push(event(iteration.finishedAt || iteration.startedAt, "merge", mergeEventSummary(iteration.autoMerge), { reason: iteration.autoMerge.reason || null, mergeSha: iteration.autoMerge.mergeSha || null, waitAttempts: summarizeWaitAttempts(iteration.autoMerge.waitAttempts), evidence: iteration.autoMerge.evidence?.evidencePath || null, issueLabelCleanupResult: iteration.autoMerge.issueLabelCleanupResult || null }));
    events.push(event(iteration.finishedAt || iteration.startedAt, "outcome", iteration.outcome || "unknown", { finalOutcome: iteration.outcome || "unknown", systemicStop: iteration.systemicStop || null }));
  }
  return { runId, found: true, summaryPath: summaryInfo.path, events: events.sort((a, b) => Date.parse(a.timestamp || 0) - Date.parse(b.timestamp || 0)) };
}

export function renderStatusText(status) {
  const lines = [
    `Runner active: ${status.active ? "yes" : "no"}`,
    `Active run: ${status.activeRunId || "unknown"}`,
    `Mode/config: ${status.mode || "unknown"} / ${status.configPath || "default"}`,
    `Started/elapsed: ${status.startedAt || "unknown"} / ${formatDuration(status.elapsedMs)}`,
    `Runtime remaining: ${formatDuration(status.runtimeRemainingMs)} of ${formatDuration(status.maxRuntimeMs)}`,
    `PR/iteration budget: ${status.completedIterations ?? "unknown"} completed, ${status.estimatedRemainingIterations ?? "unknown"} remaining of ${status.maxIterations ?? "unknown"}`,
    `Outcome counts: completed=${status.outcomeCounts?.completed ?? "unknown"} merged=${status.outcomeCounts?.merged ?? "unknown"} failed=${status.outcomeCounts?.failed ?? "unknown"} blocked=${status.outcomeCounts?.blocked ?? "unknown"} skipped=${status.outcomeCounts?.skipped ?? "unknown"}`,
    `Attempted issues: ${status.attemptedIssueCount ?? 0} (${(status.attemptedIssueNumbers || []).join(", ") || "none"})`,
    `Issue: ${status.currentOrLastIssue ? `#${status.currentOrLastIssue.number} ${status.currentOrLastIssue.title || ""}`.trim() : "unknown"}`,
    `PR: ${status.currentOrLastPr ? `${status.currentOrLastPr.number || "unknown"} ${status.currentOrLastPr.url || ""} head=${status.currentOrLastPr.headSha || "unknown"} merge=${status.currentOrLastPr.mergeSha || "unknown"}` : "unknown"}`,
    `Outcome/stop: ${status.latestTerminalOutcome || "unknown"} / ${status.stopReason || "none"}`,
    `Last event: ${status.lastEventAt || "unknown"}`,
    `Paths: summary=${status.paths.summary || "unknown"} log=${status.paths.log || "unknown"} control=${status.paths.control}`,
    `Control: ${controlText(status.control)}`,
    `Outage recovery: enabled=${status.outageResubmission?.enabled ? "yes" : "no"} active=${status.outageResubmission?.activeSourceRun ? "yes" : "no"} attempts=${status.outageResubmission?.attemptCount ?? 0}/${status.outageResubmission?.maxAttempts ?? "unknown"} circuit=${status.outageResubmission?.circuitState || "unknown"} next=${status.outageResubmission?.nextEligibleAt || "none"} deadline=${status.outageResubmission?.deadlineAt || "none"} records=${status.outageResubmission?.recordCount ?? 0} valid=${status.outageResubmission?.validRecordCount ?? 0} invalid=${status.outageResubmission?.invalidRecordCount ?? 0} operatorAction=${status.outageResubmission?.operatorActionRequired ? "yes" : "no"}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function renderRunsText(runs) {
  if (runs.length === 0) return "No runner summaries found.\n";
  return `${runs.map((run) => `${run.runId} ${run.startedAt || "unknown"} -> ${run.finishedAt || "unknown"} stop=${run.stopReason || "none"} iterations=${run.counts.iterations} completed=${run.counts.completed} merged=${run.counts.merged} failed=${run.counts.failed} blocked=${run.counts.blocked} skipped=${run.counts.skipped} issue=${run.latestIssue?.number || "unknown"} pr=${run.latestPr?.number || run.latestPr?.url || "unknown"} head=${run.latestPr?.headSha || "unknown"} summary=${run.summaryPath}`).join("\n")}\n`;
}

export function renderEventsText(result) {
  if (!result.found) return `Run not found: ${result.runId}\n`;
  if (result.events.length === 0) return `No events found for ${result.runId}.\n`;
  return `${result.events.map((item) => `${item.timestamp || "unknown"} [${item.type}] ${item.summary}${eventDetailSuffix(item)}`).join("\n")}\n`;
}

function readLock(config) {
  const lockPath = path.join(config.logsRoot, "locks", lockFileName);
  if (!existsSync(lockPath)) return { path: lockPath, exists: false, active: false, parsed: null };
  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf8"));
    return { path: lockPath, exists: true, active: processAppearsActive(parsed.pid) === true, parsed: sanitize(parsed) };
  } catch (error) {
    return { path: lockPath, exists: true, active: true, malformed: true, error: error.message, parsed: null };
  }
}

function readActiveRun(config) {
  const activePath = path.join(config.logsRoot, "state", activeRunFileName);
  if (!existsSync(activePath)) return { path: activePath, active: false, parsed: null, reason: "active_state_missing" };
  try {
    const parsed = JSON.parse(readFileSync(activePath, "utf8"));
    const active = parsed.pid ? processAppearsActive(parsed.pid) === true : false;
    return { path: activePath, active, parsed: sanitize(parsed), reason: active ? null : "active_pid_not_running" };
  } catch (error) {
    return { path: activePath, active: false, parsed: null, malformed: true, error: error.message, reason: "active_state_malformed" };
  }
}

function readLatestRunSummary(config) {
  const runs = listRuns(config, 1);
  if (runs.length === 0) return null;
  const info = readSummaryFile(runs[0].summaryPath);
  return info ? { ...info, path: runs[0].summaryPath, markdownPath: runs[0].markdownPath } : null;
}

function readSummaryFile(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return {
      path: filePath,
      markdownPath: filePath.replace(/\.json$/, ".md"),
      summary: sanitize(JSON.parse(readFileSync(filePath, "utf8"))),
    };
  } catch {
    return null;
  }
}

function summarizeIteration(iteration) {
  if (!iteration) return null;
  return sanitize({
    startedAt: iteration.startedAt || null,
    finishedAt: iteration.finishedAt || null,
    outcome: iteration.outcome || null,
    issue: iteration.issue
      ? { number: iteration.issue.number, title: iteration.issue.title || null, url: iteration.issue.url || null }
      : null,
    pr: iteration.pr ? summarizePr(iteration.pr, iteration.runnerCreatedCommitSha, iteration.autoMerge?.mergeSha) : null,
  });
}

function summarizePr(pr, headSha = null, mergeSha = null) {
  return sanitize({
    number: pr.number || null,
    title: pr.title || null,
    url: pr.url || null,
    headRefName: pr.headRefName || null,
    headSha: pr.headRefOid || headSha || null,
    mergeSha: pr.mergeCommit?.oid || mergeSha || null,
  });
}

function prEventSummary(iteration) {
  const pr = summarizePr(iteration.pr, iteration.runnerCreatedCommitSha, iteration.autoMerge?.mergeSha);
  return `PR ${pr.number || "unknown"} ${pr.title || iteration.pr?.url || ""}`.trim();
}

function independentReviewLine(iteration) {
  const review = iteration.externalReview || {};
  const required = iteration.externalReviewRequired || iteration.laneDecision?.lane === "client-ui-low-risk";
  const provider = review.provider || "unknown";
  const tier = review.tier || "unknown";
  const verdict = review.verdict || review.status || "unknown";
  const head = review.reviewedHead || iteration.runnerCreatedCommitSha || "unknown";
  const evidence = review.reportPath || review.evidencePath || "unknown";
  return `Independent AI review: ${required ? "required" : "not required"}; provider/tier: ${provider} ${tier}; verdict: ${verdict}; exact head: ${head}; evidence: ${evidence}`;
}

function summarizeExternalReview(review) {
  return sanitize({
    status: review.status || null,
    reason: review.reason || null,
    verdict: review.verdict || null,
    provider: review.provider || null,
    tier: review.tier || null,
    reviewedHead: review.reviewedHead || null,
    evidence: review.reportPath || review.evidencePath || null,
  });
}

function countFailedOrBlocked(iterations) {
  return iterations.filter((it) => /failed|blocked|danger|exhausted/.test(String(it.outcome || ""))).length;
}

function countIterationOutcomes(iterations) {
  const counts = { completed: iterations.length, merged: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const iteration of iterations) {
    const outcome = String(iteration.outcome || "");
    if (outcome === "auto_merged") counts.merged += 1;
    if (/failed|exhausted/.test(outcome)) counts.failed += 1;
    if (/blocked|danger/.test(outcome)) counts.blocked += 1;
    if (/no_eligible_work|no_changes|dry_run_preview_complete/.test(outcome)) counts.skipped += 1;
  }
  return counts;
}

function mergeEventSummary(autoMerge) {
  const attempts = Array.isArray(autoMerge.waitAttempts) ? ` waitAttempts=${autoMerge.waitAttempts.length}` : "";
  const mergeSha = autoMerge.mergeSha ? ` mergeSha=${autoMerge.mergeSha}` : "";
  const cleanup = autoMerge.issueLabelCleanupResult?.status ? ` labelCleanup=${autoMerge.issueLabelCleanupResult.status}` : "";
  return `${autoMerge.result || "unknown"} reason=${autoMerge.reason || "unknown"}${attempts}${mergeSha}${cleanup}`;
}

function summarizeWaitAttempts(waitAttempts) {
  if (!Array.isArray(waitAttempts)) return null;
  return waitAttempts.map((attempt) => sanitize({
    attempt: attempt.attempt,
    reason: attempt.reason || null,
    mergeStateStatus: attempt.mergeStateStatus || null,
    checks: attempt.checks || null,
    pendingCheckNames: attempt.pendingCheckNames || [],
    pendingChecksProgressing: attempt.pendingChecksProgressing ?? null,
    elapsedMs: attempt.elapsedMs ?? null,
  }));
}

function eventDetailSuffix(item) {
  const details = item.details || {};
  if (item.type === "branch" && details.branchName) return ` branch=${details.branchName}`;
  if (item.type === "pr") return ` pr=${details.number || "unknown"} head=${details.headSha || "unknown"} merge=${details.mergeSha || "unknown"}`;
  if (item.type === "merge") {
    const wait = Array.isArray(details.waitAttempts) ? ` waitAttempts=${details.waitAttempts.length}` : "";
    return `${wait} mergeSha=${details.mergeSha || "unknown"}`;
  }
  if (item.type === "outcome") return ` final=${details.finalOutcome || "unknown"}`;
  if (item.type === "review") {
    const verdict = details.verdict || details.status || "unknown";
    const provider = details.provider ? ` provider=${details.provider}` : "";
    const tier = details.tier ? ` tier=${details.tier}` : "";
    const head = details.reviewedHead ? ` head=${details.reviewedHead}` : "";
    return ` verdict=${verdict}${provider}${tier}${head}`;
  }
  return "";
}

function event(timestamp, type, summary, details) {
  return sanitize({ timestamp: timestamp || null, type, summary, details });
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, filePath);
}

function controlText(control) {
  if (!control) return "none";
  if (control.malformed) return `malformed (${control.error || "unknown"})`;
  const flags = [];
  if (control.pause) flags.push("pause");
  if (control.stopAfterCurrent) flags.push("stop-after-current");
  if (control.extensionRequest) {
    flags.push(`extend iterations +${control.extensionRequest.maxIterationsDelta || 0}, runtime +${formatDuration(control.extensionRequest.maxRuntimeMsDelta || 0)}`);
  }
  return flags.length ? flags.join("; ") : "none";
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "unknown";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function sanitize(value) {
  return sanitizePersistedEvidence(value);
}
