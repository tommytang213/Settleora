import { spawnSync } from "node:child_process";

const configKeys = [
  "registry",
  "strict-ssl",
  "cafile",
  "audit",
  "proxy",
  "https-proxy"
];

const shouldPing = process.argv.includes("--ping");

printSection("Runtime");
printCommand("node --version", "node", ["--version"]);
printCommand("npm --version", "npm", ["--version"]);

printSection("npm config");
for (const key of configKeys) {
  printCommand(`npm config get ${key}`, "npm", ["config", "get", key]);
}

if (shouldPing) {
  printSection("Network");
  printCommand(
    "npm ping --registry=https://registry.npmjs.org/",
    "npm",
    ["ping", "--registry=https://registry.npmjs.org/"]
  );
} else {
  printSection("Network");
  console.log("Skipped npm ping. Pass --ping to run the registry network check.");
}

console.log("");
console.log("Reminder: do not share full npm config output or verbose logs without reviewing for tokens, registry credentials, and proxy credentials.");

function printSection(title) {
  console.log("");
  console.log(`== ${title} ==`);
}

function printCommand(label, command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true
  });

  const stdout = redact((result.stdout ?? "").trim());
  const stderr = redact((result.stderr ?? "").trim());

  if (result.error) {
    console.log(`${label}: unable to start (${result.error.message})`);
    return;
  }

  if (stdout.length > 0) {
    console.log(`${label}: ${stdout}`);
  } else {
    console.log(`${label}: <empty>`);
  }

  if (result.status !== 0) {
    console.log(`${label}: exit ${result.status ?? "unknown"}`);
  }

  if (stderr.length > 0) {
    console.log(`${label} stderr: ${stderr}`);
  }
}

function redact(value) {
  return value
    .replace(/(\/\/)([^/\s:@]+):([^/\s@]+)@/g, "$1<redacted>:<redacted>@")
    .replace(/(_authToken|_auth|auth-token|token|password|passwd|pwd)\s*=\s*[^\s]+/gi, "$1=<redacted>")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1<redacted>");
}
