import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const composeArgs = [
  "compose",
  "--env-file",
  "infra/env/.env.example",
  "-f",
  "infra/docker-compose.yml"
];

const projectName = `settleora-api-migration-validation-${process.pid}-${Date.now()}`;
const databaseName = `settleora_migration_validation_${Date.now()}`;
const databaseUser = "settleora_migration_validation";
const databasePassword = randomBytes(24).toString("hex");
const postgresHost = "127.0.0.1";
const postgresContainerPort = 5432;
const postgresReadyTimeoutMs = 90_000;
const postgresPollIntervalMs = 2_000;

let postgresPort;
let composeEnv;
let efEnv;

class CommandError extends Error {
  constructor(result) {
    super(`Command failed: ${result.command}`);
    this.name = "CommandError";
    this.result = result;
  }
}

try {
  postgresPort = await getPostgresPort();
  composeEnv = buildComposeEnv();
  efEnv = buildEfEnv();

  console.log(
    `Starting disposable PostgreSQL validation project "${projectName}" on host port ${postgresPort}.`
  );

  await runCommand("docker", [
    ...composeProjectArgs(),
    "up",
    "-d",
    "postgres"
  ], { env: composeEnv });

  await waitForPostgres();

  console.log("Applying EF Core migrations to the disposable validation database.");
  const migrationResult = await runCommand("dotnet", [
    "ef",
    "database",
    "update",
    "--project",
    "services/api/src/Settleora.Api",
    "--startup-project",
    "services/api/src/Settleora.Api",
    "--context",
    "SettleoraDbContext"
  ], { env: efEnv });

  printAppliedMigrations(migrationResult);
  console.log("API migration apply validation passed.");
} catch (error) {
  console.error("API migration apply validation failed.");
  console.error(formatError(error));
  await printComposeState();
  process.exitCode = 1;
} finally {
  if (composeEnv !== undefined) {
    const result = await runCommand("docker", [
      ...composeProjectArgs(),
      "down",
      "-v"
    ], { check: false, env: composeEnv });

    if (result.exitCode !== 0) {
      console.error("Docker Compose cleanup failed.");
      console.error(formatCommandFailure(result));
      process.exitCode = 1;
    }
  }
}

function buildComposeEnv() {
  return {
    ...process.env,
    POSTGRES_DB: databaseName,
    POSTGRES_USER: databaseUser,
    POSTGRES_PASSWORD: databasePassword,
    POSTGRES_HOST_PORT: String(postgresPort)
  };
}

function buildEfEnv() {
  return {
    ...process.env,
    Settleora__Database__ConnectionString: [
      `Host=${postgresHost}`,
      `Port=${postgresPort}`,
      `Database=${databaseName}`,
      `Username=${databaseUser}`,
      `Password=${databasePassword}`
    ].join(";")
  };
}

function composeProjectArgs() {
  return [
    ...composeArgs,
    "-p",
    projectName
  ];
}

async function getPostgresPort() {
  const configuredPort =
    process.env.SETTLEORA_MIGRATION_VALIDATION_POSTGRES_PORT
    ?? process.env.POSTGRES_HOST_PORT;

  if (configuredPort !== undefined && configuredPort.trim().length > 0) {
    const port = Number(configuredPort);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error(
        "SETTLEORA_MIGRATION_VALIDATION_POSTGRES_PORT or POSTGRES_HOST_PORT must be a TCP port from 1 to 65535."
      );
    }

    return port;
  }

  return findAvailableTcpPort();
}

function findAvailableTcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null
        ? address.port
        : null;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (port === null) {
          reject(new Error("Could not determine an available PostgreSQL host port."));
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForPostgres() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < postgresReadyTimeoutMs) {
    const result = await runCommand("docker", [
      ...composeProjectArgs(),
      "exec",
      "-T",
      "postgres",
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-p",
      String(postgresContainerPort),
      "-U",
      databaseUser,
      "-d",
      databaseName
    ], { check: false, env: composeEnv });

    if (result.exitCode === 0) {
      console.log("Disposable PostgreSQL database is ready.");
      return;
    }

    await delay(postgresPollIntervalMs);
  }

  throw new Error(
    `Timed out after ${postgresReadyTimeoutMs / 1000} seconds waiting for disposable PostgreSQL to become ready.`
  );
}

async function printComposeState() {
  const result = await runCommand("docker", [
    ...composeProjectArgs(),
    "ps",
    "postgres"
  ], { check: false, env: composeEnv });

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

function runCommand(command, args, options = {}) {
  const { check = true, env = process.env } = options;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let child;

    try {
      child = spawn(command, args, {
        cwd: process.cwd(),
        env,
        windowsHide: true
      });
    } catch (error) {
      const result = {
        command: formatCommand(command, args),
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
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const result = {
        command: formatCommand(command, args),
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
        command: formatCommand(command, args),
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

function printAppliedMigrations(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  const migrations = [...output.matchAll(/Applying migration '([^']+)'/g)]
    .map((match) => match[1]);

  if (migrations.length === 0) {
    console.log("No pending migrations were applied.");
    return;
  }

  console.log(`Applied migrations: ${migrations.join(", ")}`);
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
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

function truncate(text, maxLength = 2_000) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function redact(text) {
  let redacted = text
    .replace(/(Password=)[^;,\s]+/gi, "$1[redacted]")
    .replace(/(POSTGRES_PASSWORD=)[^\s]+/gi, "$1[redacted]")
    .replace(/(Settleora__Database__ConnectionString=)[^\r\n]+/gi, "$1[redacted]");

  if (databasePassword.length > 0) {
    redacted = redacted.replaceAll(databasePassword, "[redacted]");
  }

  return redacted;
}
