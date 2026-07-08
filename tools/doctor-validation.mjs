import { access, mkdir, writeFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const checkDocker = args.has("--docker") || args.has("--all");
const checkMobile = args.has("--mobile") || args.has("--all");

const failures = [];
const warnings = [];

console.log("Settleora validation doctor");
console.log(`Scope: base${checkDocker ? ", docker" : ""}${checkMobile ? ", mobile" : ""}`);

checkCommand("node", ["--version"], { required: true });
checkCommand("npm", ["--version"], { required: true });
await checkNpmEnvironment();
checkCommand("dotnet", ["--version"], { required: true });

if (checkDocker) {
  checkDockerEnvironment();
} else {
  console.log("docker: skipped (pass --docker or --all for Docker validation preflight)");
}

if (checkMobile) {
  checkMobileEnvironment();
} else {
  console.log("flutter: skipped (pass --mobile or --all for mobile validation preflight)");
}

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error("");
  console.error("Validation doctor failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("");
console.log("Validation doctor passed.");

function checkCommand(command, commandArgs, options = {}) {
  const { required = false, label = command } = options;
  const result = spawnSync(platformExecutable(command), commandArgs, {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.error) {
    const message = `${label}: unable to start (${result.error.message})`;
    if (required) {
      failures.push(message);
    } else {
      warnings.push(message);
    }
    return result;
  }

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  const summary = stdout || stderr || "<no output>";

  if (result.status !== 0) {
    const message = `${label}: ${formatCommand(command, commandArgs)} exited ${result.status ?? "unknown"} (${truncate(redact(summary))})`;
    if (required) {
      failures.push(message);
    } else {
      warnings.push(message);
    }
    return result;
  }

  console.log(`${label}: ${truncate(redact(summary.split(/\r?\n/)[0]))}`);
  return result;
}

function platformExecutable(command) {
  if (process.platform !== "win32") {
    return command;
  }

  const windowsCommands = {
    dart: "dart.bat",
    flutter: "flutter.bat",
    npm: "npm.cmd"
  };
  return windowsCommands[command] ?? command;
}

async function checkNpmEnvironment() {
  const cacheResult = checkCommand("npm", ["config", "get", "cache"], {
    required: true,
    label: "npm cache"
  });

  const cachePath = (cacheResult.stdout ?? "").trim();
  if (cacheResult.status === 0 && cachePath.length > 0 && cachePath !== "undefined" && cachePath !== "null") {
    await checkWritablePath(cachePath, "npm cache");
    await checkWritablePath(join(cachePath, "_logs"), "npm logs");
  }

  checkCommand("npm", ["config", "get", "strict-ssl"], {
    required: false,
    label: "npm strict-ssl"
  });
}

async function checkWritablePath(path, label) {
  try {
    await mkdir(path, { recursive: true });
    await access(path, constants.W_OK);
    const probe = join(path, `.settleora-validation-doctor-${process.pid}.tmp`);
    await writeFile(probe, "ok", { flag: "wx" });
    await rm(probe, { force: true });
    console.log(`${label}: writable`);
  } catch (error) {
    failures.push(`${label}: not writable or unavailable (${formatError(error)})`);
  }
}

function checkDockerEnvironment() {
  checkCommand("docker", ["version", "--format", "{{.Client.Version}}"], {
    required: true,
    label: "docker client"
  });
  checkCommand("docker", ["version", "--format", "{{.Server.Version}}"], {
    required: true,
    label: "docker server"
  });
}

function checkMobileEnvironment() {
  const flutterResult = checkCommand("flutter", ["--version"], {
    required: true,
    label: "flutter"
  });

  checkCommand("dart", ["--version"], {
    required: false,
    label: "dart"
  });

  const output = `${flutterResult.stdout ?? ""}\n${flutterResult.stderr ?? ""}`;
  if (/lockfile|waiting for another flutter command|startup lock/i.test(output)) {
    warnings.push(
      "flutter reported a possible stale lock/process symptom. Check the Flutter cache lockfile and running Flutter/Dart processes; do not kill processes automatically from validation tooling."
    );
  }
}

function formatCommand(command, commandArgs) {
  return [command, ...commandArgs].join(" ");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value, maxLength = 300) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function redact(value) {
  return value
    .replace(/(\/\/)([^/\s:@]+):([^/\s@]+)@/g, "$1<redacted>:<redacted>@")
    .replace(/(_authToken|_auth|auth-token|token|password|passwd|pwd)\s*=\s*[^\s]+/gi, "$1=<redacted>")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1<redacted>");
}
