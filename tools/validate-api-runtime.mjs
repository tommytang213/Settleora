import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const composeArgs = [
  "compose",
  "--env-file",
  "infra/env/.env.example",
  "-f",
  "infra/docker-compose.yml"
];

const readinessUrl = new URL("http://localhost:8080/health/ready");
const timeoutMs = 120_000;
const pollIntervalMs = 2_000;
const requestTimeoutMs = 5_000;
const maxBodyBytes = 16_384;

let lastReadinessResult = null;

class CommandError extends Error {
  constructor(result) {
    super(`Command failed: ${result.command}`);
    this.name = "CommandError";
    this.result = result;
  }
}

try {
  console.log("Starting API runtime stack with Docker Compose.");
  await runDocker([
    ...composeArgs,
    "up",
    "--build",
    "-d",
    "postgres",
    "rabbitmq",
    "api"
  ]);

  await waitForReady();
  console.log("API runtime readiness validation passed.");
} catch (error) {
  console.error("API runtime readiness validation failed.");
  console.error(formatError(error));

  if (lastReadinessResult !== null) {
    console.error(`Last readiness probe: ${formatReadinessResult(lastReadinessResult)}`);
  }

  await printComposeState();
  process.exitCode = 1;
} finally {
  const result = await runDocker([...composeArgs, "down"], { check: false });
  if (result.exitCode !== 0) {
    console.error("Docker Compose cleanup failed.");
    console.error(formatCommandFailure(result));
    process.exitCode = 1;
  }
}

async function waitForReady() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    lastReadinessResult = await getReadiness();

    if (
      lastReadinessResult.httpStatus === 200 &&
      lastReadinessResult.body?.status === "ready"
    ) {
      console.log(
        `Readiness endpoint returned HTTP 200 with status "${lastReadinessResult.body.status}".`
      );
      console.log(`Readiness checks: ${formatChecks(lastReadinessResult.body.checks)}`);
      return;
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs / 1000} seconds waiting for ${readinessUrl.href} to return HTTP 200 with status "ready".`
  );
}

function getReadiness() {
  return new Promise((resolve) => {
    const request = http.get(readinessUrl, (response) => {
      const chunks = [];
      let byteLength = 0;

      response.on("data", (chunk) => {
        byteLength += chunk.length;

        if (byteLength > maxBodyBytes) {
          request.destroy(new Error("Readiness response exceeded diagnostic size limit."));
          return;
        }

        chunks.push(chunk);
      });

      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(parseReadiness(response.statusCode, text));
      });
    });

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error(`Readiness request timed out after ${requestTimeoutMs / 1000} seconds.`));
    });

    request.on("error", (error) => {
      resolve({
        httpStatus: null,
        body: null,
        error: error.message
      });
    });
  });
}

function parseReadiness(httpStatus, text) {
  if (text.trim().length === 0) {
    return {
      httpStatus,
      body: null,
      error: "Response body was empty."
    };
  }

  try {
    const body = JSON.parse(text);
    return {
      httpStatus,
      body: sanitizeReadinessBody(body),
      error: null
    };
  } catch {
    return {
      httpStatus,
      body: null,
      error: "Response body was not valid JSON."
    };
  }
}

function sanitizeReadinessBody(body) {
  if (body === null || typeof body !== "object") {
    return null;
  }

  return {
    status: asShortString(body.status),
    service: asShortString(body.service),
    checks: sanitizeChecks(body.checks)
  };
}

function sanitizeChecks(checks) {
  if (checks === null || typeof checks !== "object") {
    return null;
  }

  return {
    postgres: asShortString(checks.postgres),
    rabbitmq: asShortString(checks.rabbitmq),
    storage: asShortString(checks.storage)
  };
}

function asShortString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.slice(0, 80);
}

async function printComposeState() {
  const result = await runDocker([...composeArgs, "ps", "postgres", "rabbitmq", "api"], {
    check: false
  });

  if (result.exitCode === 0 && result.stdout.trim().length > 0) {
    console.error("Docker Compose service state:");
    console.error(redact(result.stdout.trimEnd()));
    return;
  }

  console.error("Docker Compose service state was unavailable.");
  if (result.stderr.trim().length > 0) {
    console.error(redact(result.stderr.trimEnd()));
  }
}

function runDocker(args, options = {}) {
  const { check = true } = options;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let child;

    try {
      child = spawn("docker", args, {
        cwd: process.cwd(),
        windowsHide: true
      });
    } catch (error) {
      const result = {
        command: formatCommand(args),
        exitCode: null,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error)
      };

      if (check) {
        reject(new CommandError(result));
      } else {
        resolve(result);
      }

      return;
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
    });

    child.on("error", (error) => {
      const result = {
        command: formatCommand(args),
        exitCode: null,
        stdout,
        stderr,
        error: error.message
      };

      if (check) {
        reject(new CommandError(result));
      } else {
        resolve(result);
      }
    });

    child.on("close", (exitCode) => {
      const result = {
        command: formatCommand(args),
        exitCode,
        stdout,
        stderr,
        error: null
      };

      if (check && exitCode !== 0) {
        reject(new CommandError(result));
      } else {
        resolve(result);
      }
    });
  });
}

function formatCommand(args) {
  return ["docker", ...args].join(" ");
}

function formatError(error) {
  if (error instanceof CommandError) {
    return formatCommandFailure(error.result);
  }

  return error instanceof Error ? error.message : String(error);
}

function formatCommandFailure(result) {
  const lines = [
    `Command failed: ${result.command}`,
    `Exit code: ${result.exitCode ?? "unavailable"}`
  ];

  if (result.error) {
    lines.push(`Error: ${redact(result.error)}`);
  }

  const stderr = redact(result.stderr.trim());
  if (stderr.length > 0) {
    lines.push(`stderr: ${truncate(stderr)}`);
  }

  const stdout = redact(result.stdout.trim());
  if (stdout.length > 0) {
    lines.push(`stdout: ${truncate(stdout)}`);
  }

  return lines.join("\n");
}

function formatReadinessResult(result) {
  const parts = [];
  parts.push(`http=${result.httpStatus ?? "unavailable"}`);

  if (result.body?.status !== undefined) {
    parts.push(`status=${result.body.status}`);
  }

  if (result.body?.checks !== null && result.body?.checks !== undefined) {
    parts.push(`checks=${formatChecks(result.body.checks)}`);
  }

  if (result.error) {
    parts.push(`error=${result.error}`);
  }

  return parts.join(", ");
}

function formatChecks(checks) {
  if (checks === null || checks === undefined) {
    return "unavailable";
  }

  return [
    `postgres=${checks.postgres ?? "unavailable"}`,
    `rabbitmq=${checks.rabbitmq ?? "unavailable"}`,
    `storage=${checks.storage ?? "unavailable"}`
  ].join(", ");
}

function truncate(text, maxLength = 2_000) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function redact(text) {
  return text
    .replace(/(Password=)[^;,\s]+/gi, "$1[redacted]")
    .replace(/(POSTGRES_PASSWORD=)[^\s]+/gi, "$1[redacted]")
    .replace(/(RABBITMQ_DEFAULT_PASS=)[^\s]+/gi, "$1[redacted]")
    .replace(/(Settleora__RabbitMq__Password=)[^\s]+/gi, "$1[redacted]");
}
