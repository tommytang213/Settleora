import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const logicalTaskBudgetStateVersion = 1;

export function logicalTaskChargeIdentity(input = {}) {
  const identity = canonicalIdentity(input);
  validateIdentity(identity);
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function logicalTaskBudgetPath(config, budgetScopeId) {
  const scope = boundedRequired(budgetScopeId, "budget_scope_id", 200);
  return path.join(config.logsRoot, "logical-task-budget", `${digest(scope)}.json`);
}

export function loadLogicalTaskBudget(config, budgetScopeId) {
  const statePath = logicalTaskBudgetPath(config, budgetScopeId);
  try { validateBudgetPath(config, statePath); } catch { return { ok: false, reasonCode: "logical_task_budget_state_unsafe", statePath }; }
  if (!existsSync(statePath)) return { ok: true, statePath, state: initialState(config, budgetScopeId) };
  let parsed;
  let fd;
  try {
    fd = openSync(statePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (!stat.isFile() || stat.size <= 0 || stat.size > 1024 * 1024 || (uid !== null && stat.uid !== uid) || (stat.mode & 0o077) !== 0) throw new Error("unsafe budget state");
    const bytes = Buffer.alloc(stat.size);
    if (readSync(fd, bytes, 0, stat.size, 0) !== stat.size || !isUtf8(bytes)) throw new Error("invalid budget state encoding");
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { ok: false, reasonCode: "logical_task_budget_state_corrupt", statePath };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const validation = validateLogicalTaskBudgetState(parsed, { repository: config.repositorySlug, budgetScopeId });
  if (!validation.ok) return { ok: false, reasonCode: "logical_task_budget_state_invalid", reason: validation.reason, statePath };
  return { ok: true, statePath, state: sanitizePersistedEvidence(parsed) };
}

export function chargeAcceptedLogicalTask(config, input = {}) {
  const budgetScopeId = boundedRequired(input.budgetScopeId, "budget_scope_id", 200);
  const loaded = loadLogicalTaskBudget(config, budgetScopeId);
  if (!loaded.ok) return loaded;
  const identity = canonicalIdentity({ ...input, repository: input.repository || config.repositorySlug });
  try {
    validateIdentity(identity);
  } catch (error) {
    return { ok: false, reasonCode: "logical_task_charge_identity_invalid", reason: error.message, statePath: loaded.statePath };
  }
  const chargeId = logicalTaskChargeIdentity(identity);
  const replay = Object.values(loaded.state.charges || {}).find((marker) =>
    marker.identity?.repository === identity.repository &&
    marker.identity?.issueNumber === identity.issueNumber &&
    marker.identity?.taskLineageId === identity.taskLineageId &&
    marker.identity?.claimIdentity === identity.claimIdentity,
  );
  if (replay) return projection(loaded.state, loaded.statePath, replay, true);
  const existing = loaded.state.charges?.[chargeId];
  if (existing) {
    if (JSON.stringify(existing.identity) !== JSON.stringify(identity)) {
      return { ok: false, reasonCode: "logical_task_charge_identity_collision", statePath: loaded.statePath };
    }
    return projection(loaded.state, loaded.statePath, existing, true);
  }
  const maxTasks = normalizeMaxTasks(input.maxTasks ?? config.maxIterations);
  if (loaded.state.acceptedLogicalTaskCount >= maxTasks) {
    return {
      ok: false,
      reasonCode: "accepted_logical_task_budget_exhausted",
      acceptedLogicalTaskCount: loaded.state.acceptedLogicalTaskCount,
      maxTasks,
      statePath: loaded.statePath,
    };
  }
  const chargedAt = new Date().toISOString();
  const marker = {
    chargeId,
    identity,
    identityClass: "accepted_issue_claim",
    reason: "authoritative_claim_reread_passed",
    acceptedAt: identity.acceptedAt,
    chargedAt,
  };
  const state = {
    ...loaded.state,
    acceptedLogicalTaskCount: loaded.state.acceptedLogicalTaskCount + 1,
    charges: { ...loaded.state.charges, [chargeId]: marker },
    updatedAt: chargedAt,
  };
  const written = writeState(loaded.statePath, state);
  return projection(written, loaded.statePath, marker, false);
}

export function projectLogicalTaskBudget(state = {}) {
  const charges = Object.values(state.charges || {}).map((marker) => ({
    chargeId: marker.chargeId,
    issueNumber: marker.identity?.issueNumber ?? null,
    taskLineageId: marker.identity?.taskLineageId || null,
    identityClass: marker.identityClass,
    reason: marker.reason,
    acceptedAt: marker.acceptedAt,
  }));
  return {
    acceptedLogicalTaskCount: state.acceptedLogicalTaskCount || 0,
    chargeCount: charges.length,
    charges,
  };
}

export function validateLogicalTaskBudgetState(state, expected = {}) {
  if (!state || state.stateVersion !== logicalTaskBudgetStateVersion) return fail("unsupported_state_version");
  if (!state.repository || !state.budgetScopeId) return fail("budget_identity_missing");
  if (expected.repository && state.repository !== expected.repository) return fail("repository_mismatch");
  if (expected.budgetScopeId && state.budgetScopeId !== expected.budgetScopeId) return fail("budget_scope_mismatch");
  if (!Number.isSafeInteger(state.acceptedLogicalTaskCount) || state.acceptedLogicalTaskCount < 0) return fail("accepted_count_invalid");
  if (!state.charges || typeof state.charges !== "object" || Array.isArray(state.charges)) return fail("charges_invalid");
  if (Object.keys(state.charges).length !== state.acceptedLogicalTaskCount) return fail("accepted_count_charge_mismatch");
  for (const [chargeId, marker] of Object.entries(state.charges)) {
    try {
      validateIdentity(marker.identity);
    } catch {
      return fail("charge_identity_invalid");
    }
    if (chargeId !== logicalTaskChargeIdentity(marker.identity) || marker.chargeId !== chargeId) return fail("charge_digest_invalid");
  }
  return { ok: true };
}

function initialState(config, budgetScopeId) {
  const now = new Date().toISOString();
  return {
    stateVersion: logicalTaskBudgetStateVersion,
    repository: boundedRequired(config.repositorySlug, "repository", 240),
    budgetScopeId,
    acceptedLogicalTaskCount: 0,
    charges: {},
    createdAt: now,
    updatedAt: now,
  };
}

function canonicalIdentity(input) {
  return {
    repository: bounded(input.repository, 240),
    issueNumber: input.issue?.number ?? input.issueNumber ?? null,
    taskLineageId: bounded(input.taskLineageId, 200),
    claimIdentity: bounded(input.claimIdentity, 200),
    acceptedAt: bounded(input.acceptedAt, 40),
  };
}

function validateIdentity(identity) {
  if (!identity.repository) throw new Error("repository_missing");
  if (!Number.isSafeInteger(identity.issueNumber) || identity.issueNumber < 1) throw new Error("issue_number_invalid");
  if (!identity.taskLineageId) throw new Error("task_lineage_id_missing");
  if (!identity.claimIdentity) throw new Error("claim_identity_missing");
  if (!identity.acceptedAt || !Number.isFinite(Date.parse(identity.acceptedAt))) throw new Error("accepted_at_invalid");
}

function normalizeMaxTasks(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("max logical tasks must be a positive safe integer");
  return value;
}

function writeState(statePath, state) {
  const validation = validateLogicalTaskBudgetState(state, { repository: state.repository, budgetScopeId: state.budgetScopeId });
  if (!validation.ok) throw new Error(`Invalid logical task budget state: ${validation.reason}`);
  const config = { logsRoot: path.dirname(path.dirname(statePath)) };
  validateBudgetPath(config, statePath);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  validateBudgetPath(config, statePath);
  const safe = sanitizePersistedEvidence(state);
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, statePath);
  return safe;
}

function validateBudgetPath(config, statePath) {
  const root = path.resolve(config.logsRoot);
  const target = path.resolve(statePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("budget path outside logs root");
  const rootInfo = lstatSync(root);
  const canonicalRoot = realpathSync(root);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const rootStat = statSync(canonicalRoot);
  if (rootInfo.isSymbolicLink() || canonicalRoot !== root || !rootStat.isDirectory() || (uid !== null && rootStat.uid !== uid) || (rootStat.mode & 0o077) !== 0) throw new Error("unsafe logs root");
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || (uid !== null && info.uid !== uid) || (info.mode & 0o077) !== 0 || realpathSync(current) !== current) throw new Error("unsafe budget path component");
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
}

function projection(state, statePath, marker, duplicate) {
  return {
    ok: true,
    duplicate,
    charged: !duplicate,
    chargeId: marker.chargeId,
    marker: projectLogicalTaskBudget({ charges: { [marker.chargeId]: marker } }).charges[0],
    acceptedLogicalTaskCount: state.acceptedLogicalTaskCount,
    statePath,
    state,
  };
}

function bounded(value, max) {
  return typeof value === "string" && value.length ? value.slice(0, max) : null;
}

function boundedRequired(value, name, max) {
  const result = bounded(value, max);
  if (!result) throw new Error(`${name}_missing`);
  return result;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(reason) {
  return { ok: false, reason };
}
