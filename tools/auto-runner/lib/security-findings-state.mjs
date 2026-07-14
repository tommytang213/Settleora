import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync, closeSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const securityFindingsStateVersion = 1;
export const securityFindingsStateDir = "security-findings";

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
    return { ok: true, state: parsed, statePath };
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
  if (state.stateVersion !== securityFindingsStateVersion) return { ok: false, reason: "security_findings_state_version_unsupported" };
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
  }
  return { ok: true };
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
