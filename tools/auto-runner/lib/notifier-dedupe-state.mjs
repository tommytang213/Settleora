import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync, closeSync, fchmodSync } from "node:fs";
import path from "node:path";
import { constants } from "node:fs";
import { defaultLogsRoot } from "./config.mjs";
import { validateSupervisorRunId } from "./run-correlation.mjs";

export const notifierStateSchemaVersion = 1;
export const defaultNotifierStatePath = path.join(defaultLogsRoot, "monitoring", "notifier-state.json");
const maxEntries = 100;
const maxStateBytes = 128 * 1024;
const eventKindPattern = /^[a-z][a-z0-9_.-]{0,63}$/;

export function claimTerminalNotification({
  supervisorRunId,
  eventKind,
  statePath = defaultNotifierStatePath,
  logsRoot = defaultLogsRoot,
  now = new Date(),
} = {}) {
  const key = dedupeKey(supervisorRunId, eventKind);
  const state = readNotifierState({ statePath, logsRoot });
  if (state.entries.some((entry) => entry.key === key)) {
    return { ok: true, claimed: false, key, statePath };
  }
  const entry = {
    key,
    supervisorRunId,
    eventKind,
    announcedAt: now.toISOString(),
  };
  const next = {
    schemaVersion: notifierStateSchemaVersion,
    entries: pruneEntries([...state.entries, entry]),
  };
  writeNotifierState(next, { statePath, logsRoot });
  return { ok: true, claimed: true, key, statePath };
}

export function readNotifierState({ statePath = defaultNotifierStatePath, logsRoot = defaultLogsRoot } = {}) {
  const trusted = trustedStatePath(statePath, logsRoot, { allowMissing: true });
  if (!trusted.exists) return { schemaVersion: notifierStateSchemaVersion, entries: [] };
  const stat = lstatSync(trusted.realPath);
  if (stat.size > maxStateBytes) throw new Error("Notifier state is oversized");
  const parsed = JSON.parse(readFileSync(trusted.realPath, "utf8"));
  if (parsed?.schemaVersion !== notifierStateSchemaVersion || !Array.isArray(parsed.entries)) {
    throw new Error("Notifier state schema is invalid");
  }
  return {
    schemaVersion: notifierStateSchemaVersion,
    entries: parsed.entries.map(normalizeEntry),
  };
}

export function dedupeKey(supervisorRunId, eventKind) {
  const runId = validateSupervisorRunId(supervisorRunId);
  const kind = String(eventKind || "").trim();
  if (!eventKindPattern.test(kind)) throw new Error("Invalid terminal event kind");
  return `${runId}:${kind}`;
}

function writeNotifierState(state, { statePath, logsRoot }) {
  const trusted = trustedStatePath(statePath, logsRoot, { allowMissing: true });
  mkdirSync(trusted.dirRealPath, { recursive: true, mode: 0o700 });
  const tmp = path.join(trusted.dirRealPath, `.notifier-state.${process.pid}.${Date.now()}.tmp`);
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, `${canonicalJson(state)}\n`);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, trusted.targetPath);
}

function trustedStatePath(statePath, logsRoot, { allowMissing }) {
  const monitoringRoot = path.resolve(logsRoot, "monitoring");
  mkdirSync(monitoringRoot, { recursive: true, mode: 0o700 });
  const rootRealPath = realpathSync(monitoringRoot);
  const targetPath = path.resolve(statePath);
  const relative = path.relative(rootRealPath, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Notifier state path is outside approved monitoring root");
  }
  const dir = path.dirname(targetPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirStat = lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory() || (dirStat.mode & 0o022) !== 0) {
    throw new Error("Notifier state directory is not trusted");
  }
  const dirRealPath = realpathSync(dir);
  const dirRelative = path.relative(rootRealPath, dirRealPath);
  if (dirRelative.startsWith("..") || path.isAbsolute(dirRelative)) {
    throw new Error("Notifier state directory escaped monitoring root");
  }
  if (!existsSync(targetPath)) {
    if (allowMissing) return { exists: false, targetPath, dirRealPath };
    throw new Error("Notifier state file is missing");
  }
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error("Notifier state file is not trusted");
  }
  const realPath = realpathSync(targetPath);
  const fileRelative = path.relative(rootRealPath, realPath);
  if (fileRelative.startsWith("..") || path.isAbsolute(fileRelative)) {
    throw new Error("Notifier state file escaped monitoring root");
  }
  return { exists: true, targetPath, realPath, dirRealPath };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Notifier state entry is invalid");
  const key = dedupeKey(entry.supervisorRunId, entry.eventKind);
  if (entry.key !== key) throw new Error("Notifier state entry key mismatch");
  if (Number.isNaN(Date.parse(entry.announcedAt || ""))) throw new Error("Notifier state timestamp is invalid");
  return {
    key,
    supervisorRunId: entry.supervisorRunId,
    eventKind: entry.eventKind,
    announcedAt: new Date(Date.parse(entry.announcedAt)).toISOString(),
  };
}

function pruneEntries(entries) {
  return entries
    .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt) || a.key.localeCompare(b.key))
    .slice(0, maxEntries)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}
