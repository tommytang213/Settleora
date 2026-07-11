import { appendFileSync, mkdirSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { defaultLogsRoot } from "../lib/config.mjs";
import { runDirForRunId } from "./run-spec.mjs";

export const notificationEvents = new Set(["submitted", "started", "heartbeat", "completed", "partial", "blocked", "failed", "cancelled"]);

export async function deliverNotification(eventName, payload, env = process.env, logsRoot = defaultLogsRoot) {
  if (!notificationEvents.has(eventName)) throw new Error(`Unsupported notification event: ${eventName}`);
  const url = eventName === "heartbeat" ? env.SETTLEORA_HEARTBEAT_URL : env.SETTLEORA_NOTIFICATION_URL;
  const sanitized = sanitizePayload({ event: eventName, payload });
  recordNotification(payload.runId, "notification-events.jsonl", sanitized, logsRoot);
  if (!url) return { delivered: false, skipped: true, reason: "not_configured" };
  const endpoint = await validateEndpoint(url, env);
  const body = JSON.stringify(sanitized);
  const attempts = endpoint.ok ? await boundedPost(endpoint.url, body) : [{ ok: false, category: endpoint.reason }];
  for (const attempt of attempts) {
    recordNotification(payload.runId, "delivery-attempts.jsonl", {
      at: new Date().toISOString(),
      event: eventName,
      ok: attempt.ok,
      category: attempt.category || null,
      status: attempt.status || null,
    }, logsRoot);
  }
  return attempts.at(-1) || { ok: false, category: "unknown" };
}

export async function validateEndpoint(rawUrl, env = process.env) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol === "https:") return { ok: true, url: parsed };
  if (parsed.protocol !== "http:") return { ok: false, reason: "unsupported_scheme" };
  if (env.SETTLEORA_ALLOW_LAN_HTTP !== "1" && env.SETTLEORA_ALLOW_LAN_HTTP !== "true") {
    return { ok: false, reason: "http_requires_explicit_lan_opt_in" };
  }
  const host = parsed.hostname;
  const addresses = await lookup(host, { all: true }).catch(() => []);
  const targets = addresses.length ? addresses.map((entry) => entry.address) : [host];
  if (!targets.every(isPrivateAddress)) return { ok: false, reason: "http_host_not_private" };
  return { ok: true, url: parsed };
}

async function boundedPost(url, body) {
  const attempts = [];
  for (let index = 0; index < 2; index += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.status >= 300 && response.status < 400) {
        attempts.push({ ok: false, status: response.status, category: "redirect_refused" });
        break;
      }
      if (response.status >= 200 && response.status < 300) {
        attempts.push({ ok: true, status: response.status });
        break;
      }
      attempts.push({ ok: false, status: response.status, category: response.status >= 500 ? "server_error" : "client_error" });
      if (response.status < 500) break;
    } catch (error) {
      clearTimeout(timer);
      attempts.push({ ok: false, category: error.name === "AbortError" ? "timeout" : "network_error" });
    }
  }
  return attempts;
}

function recordNotification(runId, fileName, entry, logsRoot) {
  if (!runId) return;
  const runDir = runDirForRunId(runId, logsRoot);
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  appendFileSync(path.join(runDir, fileName), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

export function sanitizePayload(value) {
  return JSON.parse(JSON.stringify(value, (key, val) => {
    if (/url|token|secret|authorization|header|env/i.test(key) && typeof val === "string") return "[redacted]";
    if (typeof val === "string" && val.length > 1000) return `${val.slice(0, 1000)}...[truncated]`;
    return val;
  }));
}

function isPrivateAddress(address) {
  if (address === "localhost") return true;
  if (isIP(address) === 6) return address === "::1" || address.startsWith("fc") || address.startsWith("fd");
  if (address === "127.0.0.1") return true;
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}
