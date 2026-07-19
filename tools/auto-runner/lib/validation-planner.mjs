import { spawnSync } from "node:child_process";
import { digestChangedFiles } from "./config.mjs";
import { getValidationProfile } from "./lane-policy.mjs";

export const mobileBuildPlatformChecks = Object.freeze({
  androidFlutterBuildApkDebug: "mobile-build:android:flutter-build-apk-debug",
  androidGradleDebugRuntimeClasspath: "mobile-build:android:gradle-debug-runtime-classpath",
  androidGradleAssembleDebug: "mobile-build:android:gradle-assemble-debug",
  webFlutterBuildWeb: "mobile-build:web:flutter-build-web",
  linuxExternalBuild: "mobile-build:linux:external-ci",
  iosExternalBuild: "mobile-build:ios:external-ci",
  macosExternalBuild: "mobile-build:macos:external-ci",
  windowsExternalBuild: "mobile-build:windows:external-ci",
});

const mobileBuildLocalCommandMap = Object.freeze({
  [mobileBuildPlatformChecks.androidFlutterBuildApkDebug]: ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter build apk --debug"]],
  [mobileBuildPlatformChecks.androidGradleDebugRuntimeClasspath]: ["bash", ["-lc", "cd apps/mobile/android && ./gradlew :app:dependencies --configuration debugRuntimeClasspath"]],
  [mobileBuildPlatformChecks.androidGradleAssembleDebug]: ["bash", ["-lc", "cd apps/mobile/android && ./gradlew :app:assembleDebug"]],
  [mobileBuildPlatformChecks.webFlutterBuildWeb]: ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter build web"]],
});

export function planValidation(changedFiles, laneDecision) {
  const profileName = laneDecision.validationProfile || fallbackProfileForChangedFiles(changedFiles, laneDecision);
  const commands = getValidationProfile(profileName);
  if (!commands) {
    throw new Error(`Unsupported validation profile: ${profileName}`);
  }
  const plan = commands.map(([command, args]) => ({ command, args, display: `${command} ${args.join(" ")}` }));
  const platformRequirements = inferMobileBuildPlatformRequirements(changedFiles, laneDecision);
  for (const checkId of platformRequirements.localCheckIds) {
    const command = mobileBuildLocalCommandMap[checkId];
    if (!command) continue;
    plan.push({ command: command[0], args: command[1], display: `${command[0]} ${command[1].join(" ")}`, platformBuildCheckId: checkId });
  }
  plan.profile = profileName;
  plan.mobileBuildPlatformRequirements = platformRequirements;
  return plan;
}

export function runValidationPlan(config, plan) {
  const results = [];
  for (const item of plan) {
    const cwd = validationCommandCwd(config, item);
    const result = spawnSync(item.command, item.args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
    });
    results.push({
      command: item.display,
      status: result.status,
      stdout: bounded(result.stdout || ""),
      stderr: bounded(result.stderr || ""),
      error: result.error ? result.error.message : null,
      platformBuildCheckId: item.platformBuildCheckId || null,
    });
    if (result.error || result.status !== 0) {
      break;
    }
  }
  return {
    passed: results.every((result) => !result.error && result.status === 0),
    results,
    profile: plan.profile || null,
    completedAt: new Date().toISOString(),
  };
}

export function validationCommandCwd(config = {}, item = {}) {
  const isRunnerReadinessPreflight =
    item.command === "node" &&
    Array.isArray(item.args) &&
    item.args[0] === "tools/auto-runner/settleora-auto-runner.mjs" &&
    item.args[1] === "--preflight";
  if (isRunnerReadinessPreflight && typeof config.protectedRoot === "string" && config.protectedRoot.length > 0) {
    return config.protectedRoot;
  }
  return config.repoRoot;
}

export function bindValidationEvidence(validation, { headSha, baseSha, changedFiles, profile }) {
  const files = [...(changedFiles || [])].map(String).sort();
  const changedFilesDigest = digestChangedFiles(files);
  const requirements = inferMobileBuildPlatformRequirements(files);
  const localChecks = (validation?.results || [])
    .filter((result) => result.platformBuildCheckId)
    .map((result) => ({
      checkId: result.platformBuildCheckId,
      command: result.command,
      status: result.status,
      passed: !result.error && result.status === 0,
    }));
  return {
    ...(validation || {}),
    profile: profile || validation?.profile || null,
    headSha: headSha || null,
    baseSha: baseSha || null,
    changedFiles: files,
    changedFilesDigest,
    mobileBuildPlatformEvidence: {
      headSha: headSha || null,
      baseSha: baseSha || null,
      changedFilesDigest,
      platforms: requirements.platforms,
      localCheckIds: requirements.localCheckIds,
      externalCheckIds: requirements.externalCheckIds,
      localChecks,
    },
    completedAt: validation?.completedAt || new Date().toISOString(),
  };
}

export function inferMobileBuildPlatformRequirements(changedFiles = [], laneDecision = {}) {
  const lane = laneDecision.canonicalLane || laneDecision.lane;
  if (lane && lane !== "mobile-build-config") {
    return emptyMobileBuildPlatformRequirements();
  }
  const files = [...(changedFiles || [])].map((file) => String(file || "")).filter(Boolean).sort();
  const platformSet = new Set();
  const localChecks = new Set();
  const externalChecks = new Set();
  const addAndroid = () => {
    platformSet.add("android");
    localChecks.add(mobileBuildPlatformChecks.androidFlutterBuildApkDebug);
    localChecks.add(mobileBuildPlatformChecks.androidGradleDebugRuntimeClasspath);
    localChecks.add(mobileBuildPlatformChecks.androidGradleAssembleDebug);
  };
  const addWeb = () => {
    platformSet.add("web");
    localChecks.add(mobileBuildPlatformChecks.webFlutterBuildWeb);
  };
  const addLinuxExternal = () => {
    platformSet.add("linux");
    externalChecks.add(mobileBuildPlatformChecks.linuxExternalBuild);
  };
  const addIosExternal = () => {
    platformSet.add("ios");
    externalChecks.add(mobileBuildPlatformChecks.iosExternalBuild);
  };
  const addMacosExternal = () => {
    platformSet.add("macos");
    externalChecks.add(mobileBuildPlatformChecks.macosExternalBuild);
  };
  const addWindowsExternal = () => {
    platformSet.add("windows");
    externalChecks.add(mobileBuildPlatformChecks.windowsExternalBuild);
  };
  const addCrossPlatformDependencyProof = () => {
    addAndroid();
    addWeb();
    addLinuxExternal();
    addIosExternal();
    addMacosExternal();
    addWindowsExternal();
  };

  for (const file of files) {
    if (/^apps\/mobile\/(?:pubspec\.yaml|pubspec\.lock|assets\/|l10n\/)/.test(file)) addCrossPlatformDependencyProof();
    else if (/^apps\/mobile\/android\//.test(file)) addAndroid();
    else if (/^apps\/mobile\/web\//.test(file)) addWeb();
    else if (/^apps\/mobile\/linux\//.test(file)) addLinuxExternal();
    else if (/^apps\/mobile\/ios\//.test(file)) addIosExternal();
    else if (/^apps\/mobile\/macos\//.test(file)) addMacosExternal();
    else if (/^apps\/mobile\/windows\//.test(file)) addWindowsExternal();
  }

  return Object.freeze({
    platforms: Object.freeze([...platformSet].sort()),
    localCheckIds: Object.freeze([...localChecks]),
    externalCheckIds: Object.freeze([...externalChecks].sort()),
  });
}

function emptyMobileBuildPlatformRequirements() {
  return Object.freeze({
    platforms: Object.freeze([]),
    localCheckIds: Object.freeze([]),
    externalCheckIds: Object.freeze([]),
  });
}

function bounded(value, max = 6000) {
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}

function fallbackProfileForChangedFiles(changedFiles, laneDecision) {
  if (laneDecision.lane === "workflow-docs-tooling") return "workflow-tooling";
  if (laneDecision.lane === "client-ui-low-risk") return "mobile-ui-low-risk";
  if (laneDecision.canonicalLane === "mobile-application" || laneDecision.lane === "mobile-application") return "mobile";
  if (laneDecision.canonicalLane === "mobile-build-config" || laneDecision.lane === "mobile-build-config") return "mobile-build-config";
  if (laneDecision.canonicalLane === "web-user-ui" || laneDecision.lane === "web-user-ui") return "web-ui";
  if (laneDecision.canonicalLane === "web-admin-ui" || laneDecision.lane === "web-admin-ui") return "web-ui";
  if (laneDecision.canonicalLane === "api-domain-runtime" || laneDecision.lane === "api-domain-runtime") return "api-domain";
  if (laneDecision.canonicalLane === "auth-session-security" || laneDecision.lane === "auth-session-security") return "api-security";
  if (laneDecision.canonicalLane === "storage-file-privacy-authz" || laneDecision.lane === "storage-file-privacy-authz") return "api-storage";
  if (laneDecision.canonicalLane === "money-settlement-payment" || laneDecision.lane === "money-settlement-payment") return "api-money";
  if (laneDecision.canonicalLane === "schema-migrations" || laneDecision.lane === "schema-migrations") return "api-migrations";
  if (laneDecision.canonicalLane === "openapi-generated-clients" || laneDecision.lane === "openapi-generated-clients") return "openapi-generated-clients";
  if (laneDecision.canonicalLane === "sync-import-export-restore" || laneDecision.lane === "sync-import-export-restore") return "sync-import-export";
  if (laneDecision.canonicalLane === "docker-compose-ci-deployment" || laneDecision.lane === "docker-compose-ci-deployment") return "compose-ci";
  if (changedFiles.some((file) => /^(docs\/planning\/|docs\/qa\/)/.test(file))) return "docs-only";
  return "scaffold-docs";
}
