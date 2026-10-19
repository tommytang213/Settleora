// Diagnostic-only fixed control-plane flags. Never reads logs or captures.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export const pinnedAndroidEmulatorAction = "a421e43855164a8197daf9d8d40fe71c6996bb0d";
const outcomes = new Set(["success", "failure", "cancelled", "skipped"]);
const keys = ["sourceSha", "runId", "runAttempt", "beforeAction", "preLaunch", "callback", "actionOutcome"];
const flag = (value) => value === "1" ? "observed" : value === "" ? "unavailable" : "invalid";

export function buildAndroidSetupBoundary(input) {
  if (input == null || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key) || typeof input[key] !== "string") ||
      !/^[a-f0-9]{40}$/.test(input.sourceSha) || !/^[1-9][0-9]{0,19}$/.test(input.runId) ||
      !/^[1-9][0-9]{0,3}$/.test(input.runAttempt)) {
    throw new Error("Invalid Android setup boundary identity");
  }
  const milestones = {
    beforeAction: flag(input.beforeAction),
    preLaunchHookEntered: flag(input.preLaunch),
    mainCallbackEntered: flag(input.callback),
  };
  return {
    schemaVersion: 1,
    authority: "diagnostic_only_setup_boundary",
    platform: "android",
    sourceSha: input.sourceSha,
    workflowRunId: input.runId,
    runAttempt: Number(input.runAttempt),
    pinnedActionCommit: pinnedAndroidEmulatorAction,
    actionOutcome: outcomes.has(input.actionOutcome) ? input.actionOutcome
      : input.actionOutcome === "" ? "unavailable" : "invalid",
    milestones,
    allBoundariesObserved: Object.values(milestones).every((state) => state === "observed"),
    nativeAcceptanceClaimed: false,
  };
}

function main() {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(
      ["source-sha", "run-id", "run-attempt", "before-action", "pre-launch", "callback", "action-outcome", "output"]
        .map((key) => [key, { type: "string" }]),
    ) });
    const evidence = buildAndroidSetupBoundary({
      sourceSha: values["source-sha"], runId: values["run-id"], runAttempt: values["run-attempt"],
      beforeAction: values["before-action"], preLaunch: values["pre-launch"],
      callback: values.callback, actionOutcome: values["action-outcome"],
    });
    if (typeof values.output !== "string" || !values.output) throw new Error("Missing output");
    const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    if (bytes.length > 4096) throw new Error("Evidence bound exceeded");
    writeFileSync(values.output, bytes, { mode: 0o600, flag: "wx" });
    if (evidence.actionOutcome === "invalid" || Object.values(evidence.milestones).includes("invalid")) {
      process.exitCode = 1;
    }
  } catch {
    // No argument values, local paths or exception contents enter the output.
    process.stderr.write("Android setup boundary evidence could not be collected\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
