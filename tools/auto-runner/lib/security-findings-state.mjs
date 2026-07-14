import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync, closeSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const securityFindingsStateVersion = 2;
export const compatibleSecurityFindingsStateVersions = Object.freeze([1, 2]);
export const securityFindingsStateDir = "security-findings";
export const securityFindingLifecycleStages = Object.freeze([
  "ingested",
  "classified",
  "reconciled",
  "proposal_planned",
  "proposal_reused",
  "proposal_created",
  "retry_scheduled",
  "manual_gated",
  "false_positive_evidence_pending",
  "false_positive_packet_ready",
  "false_positive_reviews_pending",
  "false_positive_reviewed",
  "disposition_precondition_ready",
  "disposition_in_progress",
  "disposition_confirmed",
  "post_disposition_reconciliation_pending",
  "post_disposition_reconciled",
  "linked_issue_completion_pending",
  "completed",
  "resolved_or_superseded",
  "blocked",
]);

const lifecycleStageSet = new Set(securityFindingLifecycleStages);
const allowedTransitions = new Map([
  ["ingested", new Set(["classified", "blocked"])],
  ["classified", new Set(["reconciled", "manual_gated", "false_positive_evidence_pending", "retry_scheduled", "blocked"])],
  ["reconciled", new Set(["proposal_planned", "false_positive_evidence_pending", "resolved_or_superseded", "blocked"])],
  ["proposal_planned", new Set(["proposal_reused", "proposal_created", "blocked"])],
  ["retry_scheduled", new Set(["classified", "blocked"])],
  ["false_positive_evidence_pending", new Set(["false_positive_packet_ready", "blocked"])],
  ["false_positive_packet_ready", new Set(["false_positive_reviews_pending", "blocked"])],
  ["false_positive_reviews_pending", new Set(["false_positive_reviewed", "blocked"])],
  ["false_positive_reviewed", new Set(["disposition_precondition_ready", "blocked"])],
  ["disposition_precondition_ready", new Set(["disposition_in_progress", "blocked"])],
  ["disposition_in_progress", new Set(["disposition_confirmed", "blocked"])],
  ["disposition_confirmed", new Set(["post_disposition_reconciliation_pending", "blocked"])],
  ["post_disposition_reconciliation_pending", new Set(["post_disposition_reconciled", "blocked"])],
  ["post_disposition_reconciled", new Set(["linked_issue_completion_pending", "completed", "blocked"])],
  ["linked_issue_completion_pending", new Set(["completed", "blocked"])],
]);

export function securityFindingsStateRoot(config = {}) {
  return path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", securityFindingsStateDir);
}

export function securityFindingsStatePath(config = {}) {
  return path.join(securityFindingsStateRoot(config), "ingestion-state.json");
}

export function readSecurityFindingsState(config = {}) {
  const statePath = securityFindingsStatePath(config);
  const rootCheck = ensureSafeStateRoot(config, { create: false });
  if (!rootCheck.ok) return rootCheck;
  if (!existsSync(statePath)) return { ok: true, state: emptyState(), statePath, missing: true };
  const fileCheck = assertContainedRegularFile(statePath, rootCheck.root);
  if (!fileCheck.ok) return fileCheck;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    const validation = validateSecurityFindingsState(parsed);
    if (!validation.ok) return validation;
    return { ok: true, state: migrateSecurityFindingsState(parsed), statePath };
  } catch {
    return { ok: false, reason: "security_findings_state_corrupt", statePath };
  }
}

export function writeSecurityFindingsState(config = {}, records = [], metadata = {}) {
  const rootCheck = ensureSafeStateRoot(config, { create: true });
  if (!rootCheck.ok) throw new Error(rootCheck.reason);
  const settings = config.securityFindings || {};
  const maxRecords = settings.maxStateRecords || 500;
  const deduped = dedupeRecords(records).slice(-maxRecords);
  const state = sanitizePersistedEvidence({
    stateVersion: securityFindingsStateVersion,
    schema: "settleora.securityFindings.ingestionState",
    updatedAt: new Date().toISOString(),
    metadata: {
      taskKey: metadata.taskKey || null,
      runId: metadata.runId || null,
      supervisorRunId: metadata.supervisorRunId || null,
      repository: metadata.repository || settings.allowedRepository || config.repositorySlug || null,
    },
    records: deduped,
  });
  const validation = validateSecurityFindingsState(state);
  if (!validation.ok) throw new Error(validation.reason);
  const statePath = securityFindingsStatePath(config);
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, statePath);
  chmodOwnerOnlyProbe(statePath);
  return { statePath, state, recordCount: state.records.length };
}

export function mergeSecurityFindingRecords(existing = [], incoming = []) {
  return dedupeRecords([...existing, ...incoming]);
}

export function validateSecurityFindingsState(state = {}) {
  if (!state || typeof state !== "object") return { ok: false, reason: "security_findings_state_not_object" };
  if (!compatibleSecurityFindingsStateVersions.includes(state.stateVersion)) return { ok: false, reason: "security_findings_state_version_unsupported" };
  if (!Array.isArray(state.records)) return { ok: false, reason: "security_findings_state_records_missing" };
  if (state.records.length > 2_000) return { ok: false, reason: "security_findings_state_records_oversized" };
  const keys = new Set();
  for (const record of state.records) {
    if (!record?.correlationKey || !record?.idempotencyKey) return { ok: false, reason: "security_findings_state_record_key_missing" };
    const key = `${record.correlationKey}\n${record.idempotencyKey}`;
    if (keys.has(key)) return { ok: false, reason: "security_findings_state_duplicate_record" };
    keys.add(key);
    const serialized = JSON.stringify(record);
    if (/rawSarif|rawPayload|providerPayload|snippet|Bearer\s+|token=|password=|secret=/i.test(serialized)) {
      return { ok: false, reason: "security_findings_state_unsanitized_record" };
    }
    const lifecycle = record.lifecycle;
    if (lifecycle !== undefined) {
      const lifecycleValidation = validateLifecycleRecord(lifecycle);
      if (!lifecycleValidation.ok) return lifecycleValidation;
    }
  }
  return { ok: true };
}

export function createLifecycleRecord({
  stage = "ingested",
  classificationDigest = null,
  reconciliationDigest = null,
  proposalDigest = null,
  packetDigest = null,
  reviewDigest = null,
  preconditionDigest = null,
  mutationDigest = null,
  resultDigest = null,
  updatedAt = new Date().toISOString(),
} = {}) {
  const record = {
    lifecycleVersion: 1,
    stage,
    classificationDigest,
    reconciliationDigest,
    proposalDigest,
    packetDigest,
    reviewDigest,
    preconditionDigest,
    mutationDigest,
    resultDigest,
    history: [{ stage, at: updatedAt }],
    updatedAt,
  };
  const validation = validateLifecycleRecord(record);
  if (!validation.ok) throw new Error(validation.reason);
  return record;
}

export function advanceSecurityFindingLifecycle(lifecycle = null, nextStage, metadata = {}) {
  const current = lifecycle || createLifecycleRecord();
  const validation = validateLifecycleRecord(current);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  if (!lifecycleStageSet.has(nextStage)) return { ok: false, reason: "security_findings_lifecycle_stage_invalid" };
  if (current.stage !== nextStage) {
    const allowed = allowedTransitions.get(current.stage) || new Set();
    if (!allowed.has(nextStage)) return { ok: false, reason: "security_findings_lifecycle_transition_invalid" };
  }
  const updatedAt = metadata.updatedAt || new Date().toISOString();
  const next = {
    ...current,
    stage: nextStage,
    classificationDigest: metadata.classificationDigest || current.classificationDigest || null,
    reconciliationDigest: metadata.reconciliationDigest || current.reconciliationDigest || null,
    proposalDigest: metadata.proposalDigest || current.proposalDigest || null,
    packetDigest: metadata.packetDigest || current.packetDigest || null,
    reviewDigest: metadata.reviewDigest || current.reviewDigest || null,
    preconditionDigest: metadata.preconditionDigest || current.preconditionDigest || null,
    mutationDigest: metadata.mutationDigest || current.mutationDigest || null,
    resultDigest: metadata.resultDigest || current.resultDigest || null,
    history: [...(current.history || []), { stage: nextStage, at: updatedAt }].slice(-20),
    updatedAt,
  };
  const nextValidation = validateLifecycleRecord(next);
  if (!nextValidation.ok) return nextValidation;
  return { ok: true, lifecycle: next };
}

function emptyState() {
  return {
    stateVersion: securityFindingsStateVersion,
    schema: "settleora.securityFindings.ingestionState",
    updatedAt: null,
    metadata: {},
    records: [],
  };
}

function migrateSecurityFindingsState(state) {
  if (state.stateVersion === securityFindingsStateVersion) return state;
  return {
    ...state,
    stateVersion: securityFindingsStateVersion,
    schema: "settleora.securityFindings.ingestionState",
    records: (state.records || []).map((record) => ({
      ...record,
      lifecycle: record.lifecycle || createLifecycleRecord({ stage: "ingested", updatedAt: record.ingestedAt || state.updatedAt || new Date().toISOString() }),
    })),
  };
}

function validateLifecycleRecord(lifecycle) {
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return { ok: false, reason: "security_findings_lifecycle_not_object" };
  if (lifecycle.lifecycleVersion !== 1) return { ok: false, reason: "security_findings_lifecycle_version_unsupported" };
  if (!lifecycleStageSet.has(lifecycle.stage)) return { ok: false, reason: "security_findings_lifecycle_stage_invalid" };
  if (!Array.isArray(lifecycle.history) || lifecycle.history.length > 20) return { ok: false, reason: "security_findings_lifecycle_history_invalid" };
  for (const entry of lifecycle.history) {
    if (!entry || !lifecycleStageSet.has(entry.stage) || typeof entry.at !== "string") return { ok: false, reason: "security_findings_lifecycle_history_invalid" };
  }
  const text = JSON.stringify(lifecycle);
  if (/rawSarif|rawPayload|providerPayload|snippet|Bearer\s+|token=|password=|secret=/i.test(text)) {
    return { ok: false, reason: "security_findings_lifecycle_unsanitized" };
  }
  return { ok: true };
}

function dedupeRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    if (!record?.correlationKey || !record?.idempotencyKey) continue;
    byKey.set(`${record.correlationKey}\n${record.idempotencyKey}`, record);
  }
  return [...byKey.values()].sort((a, b) => String(a.correlationKey).localeCompare(String(b.correlationKey)));
}

function ensureSafeStateRoot(config, options = {}) {
  const logsRoot = config.logsRoot || "/workspace/logs/settleora-auto-runner";
  const root = securityFindingsStateRoot(config);
  try {
    if (existsSync(root)) {
      const stat = lstatSync(root);
      if (stat.isSymbolicLink()) return { ok: false, reason: "security_findings_state_root_symlink", root };
      if (!stat.isDirectory()) return { ok: false, reason: "security_findings_state_root_not_directory", root };
      if ((stat.mode & 0o077) !== 0) return { ok: false, reason: "security_findings_state_root_not_owner_only", root };
    } else if (options.create) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
    } else {
      return { ok: true, root };
    }
    const realRoot = realpathSync(root);
    const realLogs = realpathSync(logsRoot);
    if (!realRoot.startsWith(`${realLogs}${path.sep}`)) return { ok: false, reason: "security_findings_state_root_out_of_logs", root };
    return { ok: true, root };
  } catch {
    return { ok: false, reason: "security_findings_state_root_inaccessible", root };
  }
}

function assertContainedRegularFile(filePath, root) {
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink()) return { ok: false, reason: "security_findings_state_file_symlink", statePath: filePath };
    if (!stat.isFile()) return { ok: false, reason: "security_findings_state_file_not_regular", statePath: filePath };
    if ((stat.mode & 0o077) !== 0) return { ok: false, reason: "security_findings_state_file_not_owner_only", statePath: filePath };
    const real = realpathSync(filePath);
    const realRoot = realpathSync(root);
    if (!real.startsWith(`${realRoot}${path.sep}`)) return { ok: false, reason: "security_findings_state_file_out_of_root", statePath: filePath };
    return { ok: true };
  } catch {
    return { ok: false, reason: "security_findings_state_file_inaccessible", statePath: filePath };
  }
}

function chmodOwnerOnlyProbe(filePath) {
  const fd = openSync(filePath, "r");
  closeSync(fd);
}
