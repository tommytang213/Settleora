import { spawnSync } from "node:child_process";

export function planValidation(changedFiles, laneDecision) {
  const commands = [
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
  ];
  const docsOrTooling = changedFiles.some((file) => /^(docs\/|tools\/auto-runner\/|scripts\/ai\/|package\.json$)/.test(file));
  if (docsOrTooling || laneDecision.lane === "workflow-docs-tooling") {
    commands.push(["npm", ["run", "validate:docs"]]);
    commands.push(["npm", ["run", "validate:scaffold"]]);
  }
  return commands.map(([command, args]) => ({ command, args, display: `${command} ${args.join(" ")}` }));
}

export function runValidationPlan(config, plan) {
  const results = [];
  for (const item of plan) {
    const result = spawnSync(item.command, item.args, {
      cwd: config.repoRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    results.push({
      command: item.display,
      status: result.status,
      stdout: bounded(result.stdout || ""),
      stderr: bounded(result.stderr || ""),
      error: result.error ? result.error.message : null,
    });
    if (result.error || result.status !== 0) {
      break;
    }
  }
  return {
    passed: results.every((result) => !result.error && result.status === 0),
    results,
  };
}

function bounded(value, max = 6000) {
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}
