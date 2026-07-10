import { spawnSync } from "node:child_process";
import { getValidationProfile } from "./lane-policy.mjs";

export function planValidation(changedFiles, laneDecision) {
  const profileName = laneDecision.validationProfile || fallbackProfileForChangedFiles(changedFiles, laneDecision);
  const commands = getValidationProfile(profileName);
  if (!commands) {
    throw new Error(`Unsupported validation profile: ${profileName}`);
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

function fallbackProfileForChangedFiles(changedFiles, laneDecision) {
  if (laneDecision.lane === "workflow-docs-tooling") return "workflow-tooling";
  if (laneDecision.lane === "client-ui-low-risk") return "mobile-ui-low-risk";
  if (changedFiles.some((file) => /^(docs\/planning\/|docs\/qa\/)/.test(file))) return "docs-only";
  return "scaffold-docs";
}
