import { spawn } from "node:child_process";

const steps = [
  {
    script: "validate:scaffold",
    command: "node",
    args: ["tools/validate-scaffold.mjs"]
  },
  {
    script: "validate:openapi",
    command: "node",
    args: [
      "node_modules/@redocly/cli/bin/cli.js",
      "lint",
      "packages/contracts/openapi/settleora.v1.yaml"
    ]
  },
  {
    script: "validate:api",
    command: "dotnet",
    args: ["test", "services/api/Settleora.Api.sln"]
  },
  {
    script: "validate:compose",
    command: "docker",
    args: [
      "compose",
      "--env-file",
      "infra/env/.env.example",
      "-f",
      "infra/docker-compose.yml",
      "config"
    ]
  },
  {
    script: "validate:api-docker",
    command: "docker",
    args: [
      "compose",
      "--env-file",
      "infra/env/.env.example",
      "-f",
      "infra/docker-compose.yml",
      "build",
      "api"
    ]
  }
];

for (const step of steps) {
  const result = await runStep(step);

  if (result.exitCode !== 0) {
    console.error("");
    console.error("Repo validation failed.");
    console.error(`Step: npm run ${step.script}`);
    console.error(`Command: ${formatCommand(step)}`);
    console.error(`Exit code: ${result.exitCode ?? "unavailable"}`);

    if (result.signal !== null) {
      console.error(`Signal: ${result.signal}`);
    }

    const context = shortContext(result.output);
    if (context.length > 0) {
      console.error("Recent output:");
      console.error(context);
    }

    process.exit(result.exitCode ?? 1);
  }
}

console.log("");
console.log("Repo validation passed.");

function runStep(step) {
  return new Promise((resolve) => {
    console.log("");
    console.log(`==> npm run ${step.script}`);
    let output = "";

    let child;

    try {
      child = spawn(step.command, step.args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      console.error(`Could not start ${formatCommand(step)}: ${formatError(error)}`);
      resolve({
        exitCode: 1,
        signal: null,
        output: formatError(error)
      });
      return;
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      console.error(`Could not start ${formatCommand(step)}: ${formatError(error)}`);
      resolve({
        exitCode: 1,
        signal: null,
        output
      });
    });

    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        output
      });
    });
  });
}

function formatCommand(step) {
  return [step.command, ...step.args].join(" ");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function shortContext(output, maxLength = 2_000) {
  const text = output.trim();
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(text.length - maxLength);
}
