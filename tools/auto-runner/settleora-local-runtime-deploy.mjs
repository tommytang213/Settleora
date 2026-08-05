#!/usr/bin/node
import { applyLocalRuntimeDeploy, planLocalRuntimeDeploy, verifyLocalRuntimeDeploy } from "./lib/local-runtime-deploy.mjs";

const [mode, option, operationId, ...rest] = process.argv.slice(2);
if (rest.length || !["plan", "apply", "verify"].includes(mode)
    || (mode === "plan" && (option !== undefined || operationId !== undefined))
    || (mode !== "plan" && (option !== "--operation" || operationId === undefined))) {
  throw new Error("usage: settleora-local-runtime-deploy.mjs plan | apply --operation <id> | verify --operation <id>");
}

const result = mode === "plan"
  ? planLocalRuntimeDeploy()
  : mode === "apply"
    ? applyLocalRuntimeDeploy({ operationId })
    : verifyLocalRuntimeDeploy({ operationId });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
