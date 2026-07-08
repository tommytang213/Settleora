import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export function createLogger(logsRoot, runId) {
  const runLogDir = path.join(logsRoot, "run-logs");
  mkdirSync(runLogDir, { recursive: true });
  const logPath = path.join(runLogDir, `${runId}.log`);

  function write(level, message, details = null) {
    const entry = {
      at: new Date().toISOString(),
      level,
      message,
      ...(details ? { details } : {}),
    };
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
    if (level === "error") {
      console.error(message);
    } else if (level === "warn") {
      console.warn(message);
    } else {
      console.log(message);
    }
  }

  return {
    logPath,
    info: (message, details) => write("info", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
  };
}

export function hktTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${formatter.format(date).replace(",", "")} HKT`;
}

export function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "");
}

export function slugify(value, maxLength = 54) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "task";
}
