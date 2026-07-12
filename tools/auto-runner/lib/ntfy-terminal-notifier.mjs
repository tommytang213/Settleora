import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { defaultLogsRoot } from "./config.mjs";
import { evaluateAutoRunnerHealth } from "./health-service.mjs";
import {
  dedupeKey,
  defaultNotifierStatePath,
  hasDeliveredTerminalNotification,
  recordTerminalNotificationDelivered,
} from "./notifier-dedupe-state.mjs";

export const ntfyNotifierSchemaVersion = 1;
export const defaultNtfyNotifierConfigPath = path.join(defaultLogsRoot, "secrets", "ntfy-notifier.json");
export const terminalNotifierRequestTimeoutMs = 5000;
export const terminalNotifierMaxResponseBytes = 8192;

const maxConfigBytes = 16 * 1024;
const maxBodyLength = 900;
const maxTitleLength = 80;
const allowedConfigKeys = new Set(["schemaVersion", "baseUrl", "activityTopic", "accessToken"]);
const topicPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const accessTokenPattern = /^[A-Za-z0-9._~+/-]{24,512}$/;
const eligibleReasons = new Map([
  ["terminal_success", "completed"],
  ["no_eligible_work", "no-eligible-work"],
  ["budget_exhausted_success", "budget-exhausted"],
]);

export async function runTerminalNotifier({
  logsRoot = defaultLogsRoot,
  statePath = defaultNotifierStatePath,
  configPath = defaultNtfyNotifierConfigPath,
  config = null,
  now = new Date(),
  publisher = publishNtfyMessage,
} = {}) {
  const selected = selectEligibleTerminalNotification({ logsRoot, now });
  if (!selected.eligible) return { ok: true, sent: false, reason: selected.reason };

  const delivered = hasDeliveredTerminalNotification({
    supervisorRunId: selected.supervisorRunId,
    eventKind: selected.eventKind,
    statePath,
    logsRoot,
  });
  if (delivered) return { ok: true, sent: false, reason: "already_delivered" };

  const ntfyConfig = config || readNtfyNotifierConfig({ configPath, logsRoot });
  const key = dedupeKey(selected.supervisorRunId, selected.eventKind);
  const message = buildTerminalNotificationMessage(selected);
  const sequenceId = sequenceIdForDedupeKey(key);
  const result = await publisher({ config: ntfyConfig, message, sequenceId });
  if (!result.ok) return { ok: false, sent: false, reason: result.reason || "delivery_unconfirmed" };

  recordTerminalNotificationDelivered({
    supervisorRunId: selected.supervisorRunId,
    eventKind: selected.eventKind,
    statePath,
    logsRoot,
    now,
  });
  return { ok: true, sent: true, reason: "delivered", sequenceId };
}

export function selectEligibleTerminalNotification({ logsRoot = defaultLogsRoot, now = new Date() } = {}) {
  const result = evaluateAutoRunnerHealth({ logsRoot, now });
  const body = result.body || {};
  if (result.httpStatus !== 200 || body.status !== "healthy") {
    return { eligible: false, reason: body.reasonCode || "unhealthy" };
  }
  if (body.mode !== "idle") return { eligible: false, reason: body.reasonCode || "not_idle" };
  if (body.supervisor?.state !== "completed") return { eligible: false, reason: "not_completed" };
  const eventKind = eligibleReasons.get(body.reasonCode);
  if (!eventKind) return { eligible: false, reason: body.reasonCode || "not_eligible" };
  const supervisorRunId = body.supervisor.latestRunId;
  if (!supervisorRunId) return { eligible: false, reason: "missing_supervisor_run_id" };
  return {
    eligible: true,
    eventKind,
    supervisorRunId,
    reasonCode: body.reasonCode,
    supervisor: body.supervisor,
    summary: body.summary || null,
  };
}

export function readNtfyNotifierConfig({
  configPath = defaultNtfyNotifierConfigPath,
  logsRoot = defaultLogsRoot,
} = {}) {
  const trusted = trustedConfigPath(configPath, logsRoot);
  const stat = lstatSync(trusted.realPath);
  if (stat.size > maxConfigBytes) throw new Error("ntfy notifier config is oversized");
  const parsed = JSON.parse(readFileSync(trusted.realPath, "utf8"));
  return validateNtfyNotifierConfig(parsed);
}

export function validateNtfyNotifierConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ntfy notifier config must be an object");
  for (const key of Object.keys(value)) {
    if (!allowedConfigKeys.has(key)) throw new Error("ntfy notifier config has unknown fields");
  }
  if (value.schemaVersion !== ntfyNotifierSchemaVersion) throw new Error("ntfy notifier config schema version is invalid");
  const baseUrl = validateBaseUrl(value.baseUrl);
  const activityTopic = validateTopic(value.activityTopic);
  const accessToken = validateAccessToken(value.accessToken);
  return { schemaVersion: ntfyNotifierSchemaVersion, baseUrl, activityTopic, accessToken };
}

export function buildTerminalNotificationMessage(selected) {
  const titleByKind = {
    completed: "Settleora auto-runner completed",
    "no-eligible-work": "Settleora auto-runner idle",
    "budget-exhausted": "Settleora auto-runner budget reached",
  };
  const tagsByKind = {
    completed: "heavy_check_mark,computer",
    "no-eligible-work": "heavy_check_mark,zzz",
    "budget-exhausted": "checkered_flag,computer",
  };
  const priorityByKind = {
    completed: "default",
    "no-eligible-work": "low",
    "budget-exhausted": "default",
  };
  const supervisor = selected.supervisor || {};
  const summary = selected.summary || {};
  const lines = [
    `Supervisor run: ${safeField(selected.supervisorRunId, 96)}`,
    durationLine(summary.startedAt || supervisor.startedAt, summary.finishedAt || supervisor.finishedAt),
    `Tasks processed: ${safeCount(summary.tasksProcessed)}`,
    `PRs opened: ${safeCount(summary.prsOpened)}`,
    `PRs merged: ${safeCount(summary.prsMerged)}`,
    `Failed/blocked: ${safeCount(summary.failedCount)}/${safeCount(summary.blockedCount)}`,
    `Terminal reason: ${safeField(supervisor.terminalReason || selected.reasonCode, 80)}`,
  ];
  if (summary.latestMainSha) lines.push(`Latest main SHA: ${safeField(summary.latestMainSha, 40)}`);
  return {
    title: safeField(titleByKind[selected.eventKind] || "Settleora auto-runner update", maxTitleLength),
    priority: priorityByKind[selected.eventKind] || "default",
    tags: tagsByKind[selected.eventKind] || "computer",
    body: lines.filter(Boolean).join("\n").slice(0, maxBodyLength),
  };
}

export async function publishNtfyMessage({
  config,
  message,
  sequenceId,
  timeoutMs = terminalNotifierRequestTimeoutMs,
  maxResponseBytes = terminalNotifierMaxResponseBytes,
} = {}) {
  const trustedConfig = validateNtfyNotifierConfig(config);
  const target = ntfyPublishTarget(trustedConfig);
  const body = Buffer.from(message.body || "", "utf8");
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.path,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${trustedConfig.accessToken}`,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": body.length,
          Title: message.title,
          Priority: message.priority,
          Tags: message.tags,
          "X-Sequence-ID": sequenceId,
        },
      },
      (response) => {
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxResponseBytes) {
            request.destroy(new Error("ntfy response exceeded bounded read"));
          }
        });
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode <= 299) resolve({ ok: true, statusCode: response.statusCode });
          else resolve({ ok: false, reason: "non_2xx", statusCode: response.statusCode });
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("ntfy publish timeout")));
    request.on("error", () => resolve({ ok: false, reason: "delivery_unconfirmed" }));
    request.end(body);
  });
}

export function sequenceIdForDedupeKey(key) {
  return `settleora-${createHash("sha256").update(String(key), "utf8").digest("hex").slice(0, 48)}`;
}

function ntfyPublishTarget(config) {
  const baseUrl = validatedBaseUrlParts(config.baseUrl);
  const prefix = baseUrl.path === "/" ? "" : baseUrl.path.replace(/\/$/, "");
  return Object.freeze({
    protocol: baseUrl.protocol,
    hostname: baseUrl.hostname,
    port: baseUrl.port,
    path: `${prefix}/${config.activityTopic}`,
  });
}

function trustedConfigPath(configPath, logsRoot) {
  const secretsRoot = path.resolve(logsRoot, "secrets");
  mkdirSync(secretsRoot, { recursive: true, mode: 0o700 });
  const rootTrust = trustedDirectory(secretsRoot);
  if (!rootTrust.ok) throw new Error("ntfy notifier secrets root is not trusted");
  const targetPath = path.resolve(configPath);
  const expectedPath = path.resolve(logsRoot, "secrets", "ntfy-notifier.json");
  if (targetPath !== expectedPath) {
    throw new Error("ntfy notifier production config path is fixed");
  }
  if (!existsSync(targetPath)) throw new Error("ntfy notifier config file is missing");
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error("ntfy notifier config file is not trusted");
  }
  const realPath = realpathSync(targetPath);
  const relative = path.relative(rootTrust.realPath, realPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("ntfy notifier config file escaped secrets root");
  }
  return { realPath };
}

function trustedDirectory(dirPath) {
  try {
    const stat = lstatSync(dirPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return { ok: false };
    if ((stat.mode & 0o077) !== 0) return { ok: false };
    return { ok: true, realPath: realpathSync(dirPath) };
  } catch {
    return { ok: false };
  }
}

function validateBaseUrl(value) {
  const parsed = validatedBaseUrlParts(value);
  const pathSuffix = parsed.path === "/" ? "" : parsed.path.replace(/\/$/, "");
  const portSuffix = parsed.port ? `:${parsed.port}` : "";
  return `${parsed.protocol}//${parsed.hostname}${portSuffix}${pathSuffix}`;
}

function validatedBaseUrlParts(value) {
  if (typeof value !== "string" || value.length > 240) throw new Error("ntfy baseUrl is invalid");
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("ntfy baseUrl must use http or https");
  if (parsed.username || parsed.password) throw new Error("ntfy baseUrl must not include credentials");
  if (parsed.search || parsed.hash) throw new Error("ntfy baseUrl must not include query or fragment");
  if (!parsed.hostname || parsed.hostname.length > 253) throw new Error("ntfy baseUrl host is invalid");
  if (!/^[A-Za-z0-9.-]+$/.test(parsed.hostname)) throw new Error("ntfy baseUrl host is invalid");
  if (parsed.port) {
    const port = Number(parsed.port);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("ntfy baseUrl port is invalid");
  }
  if (parsed.pathname.includes("%") || parsed.pathname.includes("//")) throw new Error("ntfy baseUrl path is invalid");
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || !/^[A-Za-z0-9._~-]{1,64}$/.test(segment))) {
    throw new Error("ntfy baseUrl path is invalid");
  }
  return Object.freeze({
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    path: parsed.pathname || "/",
  });
}

function validateTopic(value) {
  if (typeof value !== "string" || !topicPattern.test(value)) throw new Error("ntfy activityTopic is invalid");
  return value;
}

function validateAccessToken(value) {
  if (typeof value !== "string" || !accessTokenPattern.test(value)) throw new Error("ntfy accessToken is invalid");
  return value;
}

function durationLine(startedAt, finishedAt) {
  const start = Date.parse(startedAt || "");
  const end = Date.parse(finishedAt || "");
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return `Duration: ${Math.round((end - start) / 1000)}s`;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 999999) : 0;
}

function safeField(value, maxLength) {
  return String(value || "")
    .replace(/\/workspace\/[^\s]*/gi, "")
    .replace(/\b(secret|token|authorization|prompt)\b/gi, "")
    .replace(/diff --git/gi, "")
    .replace(/[^A-Za-z0-9:._/ -]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}
