import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { buildRuntimeManifest, runtimeManifestName, verifyRuntimeBundle, verifyRuntimeSourceAgainstCommit } from "./runtime-bundle.mjs";
import { gitObjectOid } from "./semantic-recovery-native-install-source.mjs";
import { localNativeBootstrapProgramSha256, nativeBootstrapProspectiveChange } from "./local-native-bootstrap.mjs";
import { nativeInstallTrustedBootstrapPath } from "./semantic-recovery-native-install-journal.mjs";

export const localRuntimeDeployContract = "settleora_local_interactive_runtime_deploy";
export const localRuntimeDeployVersion = 1;
export const localRuntimeDeployRepository = "tommytang213/Settleora";
export const localRuntimeDeployRepositoryRoot = "/workspace/repos/Settleora";
export const localRuntimeDeployOperationRoot = "/workspace/logs/auto-runner/Settleora/local-runtime-deploy-operations";
export const localRuntimeDeployRuntimeRoot = "/workspace/auto-runner/runtime";
export const localRuntimeDeployConfigPath = "/workspace/auto-runner/config/settleora.json";
export const localRuntimeDeployProfilePath = "/workspace/auto-runner/config/settleora-production-approved-20260724-0946.json";
export const localRuntimeDeployHealthUnitPath = "/home/tommytang213/.config/systemd/user/settleora-auto-runner-health.service";
export const localRuntimeDeployControllerPath = "tools/auto-runner/semantic-recovery-native-install.mjs";

export const trustedLocalOperatorContract = deepFreeze({
  contract: "settleora_trusted_interactive_devbox_operator",
  version: 1,
  trusted: ["devbox_host", "tommytang213_account", "authenticated_interactive_ssh_session", "interactive_login_shell"],
  outsideThreatModel: ["malicious_devbox_administrator", "malicious_interactive_login_shell", "hostile_operator_controlling_trusted_session"],
  defendedFailures: [
    "stale_or_wrong_source", "dirty_or_contradictory_repository", "operator_mistake", "malformed_operation",
    "partial_execution", "ambiguous_completion", "duplicate_effect", "unsafe_path_owner_mode_link_state",
    "installed_state_drift", "readback_failure", "health_failure",
  ],
  unsupported: ["windows_remote_coordinator", "custom_ssh_account", "forced_command", "pre_login_dispatcher", "pam_boundary", "dedicated_sshd_service"],
  privilege: {
    plan: "unprivileged", readback: "unprivileged", initiation: "local_interactive_tty",
    maximumSudoAttemptsPerOperation: 1, passwordHandling: "tty_to_sudo_only_never_captured",
    afterAttempt: "readback_only", broadPasswordlessSudo: false,
  },
  productBoundary: "unchanged_hostile_traffic_auth_authorization_privacy_money_audit_storage_and_exposure_rules",
});

const operationPattern = /^[a-f0-9]{64}$/u;
const shaPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const maximumPlanAgeMs = 24 * 60 * 60 * 1000;

export function createLocalRuntimeDeployDependencies(overrides = {}) {
  return {
    clock: () => new Date(),
    random: randomBytes,
    command: runCommand,
    authenticateSource: authenticateLocalRuntimeDeploySource,
    authenticatePlannedSource: authenticateLocalRuntimeDeployPlannedSource,
    buildManifest: buildRuntimeManifest,
    verifySource: verifyRuntimeSourceAgainstCommit,
    repositoryRoot: localRuntimeDeployRepositoryRoot,
    operationRoot: localRuntimeDeployOperationRoot,
    runtimeRoot: localRuntimeDeployRuntimeRoot,
    configPath: localRuntimeDeployConfigPath,
    profilePath: localRuntimeDeployProfilePath,
    healthUnitPath: localRuntimeDeployHealthUnitPath,
    tty: () => Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY && realTtyAvailable()),
    persistPlan: persistLocalRuntimeDeployPlan,
    loadOperation: loadLocalRuntimeDeployOperation,
    persistState: persistLocalRuntimeDeployState,
    readInstalled: readInstalledRuntimeAuthorities,
    health: readLoopbackHealth,
    invokeController: invokeNativeInstallController,
    ...overrides,
  };
}

export function planLocalRuntimeDeploy(options = {}, dependencies = {}) {
  const deps = createLocalRuntimeDeployDependencies(dependencies);
  const source = deps.authenticateSource(deps);
  const operationId = operationIdFromRandom(deps.random);
  const createdAt = deps.clock().toISOString();
  const installed = deps.readInstalled({ health: false, ...deps });
  deps.verifySource({ repoRoot: deps.repositoryRoot, sourceRoot: path.join(deps.repositoryRoot, "tools/auto-runner"), sourceSha: source.commit });
  const prospectiveManifest = deps.buildManifest(path.join(deps.repositoryRoot, "tools/auto-runner"), {
    sourceSha: source.commit,
    generatedAt: "1970-01-01T00:00:00.000Z",
  });
  const hint = {
    bootstrapBlob: source.bootstrapBlob,
    contract: "settleora_semantic_recovery_native_install_source",
    repository: localRuntimeDeployRepository,
    sourceCommit: source.commit,
    taskCorrelation: `issue-1012-local-deploy:${operationId}`,
    version: 1,
  };
  const planCore = {
    contract: localRuntimeDeployContract,
    version: localRuntimeDeployVersion,
    operationId,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + maximumPlanAgeMs).toISOString(),
    repository: localRuntimeDeployRepository,
    source,
    nativeInstall: {
      controller: localRuntimeDeployControllerPath,
      hint,
      currentBootstrapBlob: installed.nativeInstall.bootstrapBlob,
      privilegedArgvAuthority: "fixed_native_install_sudo_argv",
      localBootstrapProgramSha256: localNativeBootstrapProgramSha256,
      independentRootDerivationRequired: true,
      expectedProtectedChanges: [
        nativeBootstrapProspectiveChange(source.bootstrapBlob),
        { path: "/etc/settleora-auto-runner/semantic-recovery-authority/producer", authority: "root_derived", atomic: true },
        { path: "/etc/settleora-auto-runner/semantic-recovery-authority/stores", authority: "root_derived", atomic: true },
        { path: "/etc/settleora-auto-runner/semantic-recovery-authority/grants", authority: "root_derived", atomic: true },
        { path: "/etc/settleora-auto-runner/semantic-recovery-authority/successors", authority: "root_derived", atomic: true },
      ],
      serviceEffects: [],
    },
    runtime: {
      current: installed.runtime,
      config: installed.config,
      prospective: {
        sourceSha: source.commit,
        bundleDigest: prospectiveManifest.bundleDigest,
        fileCount: prospectiveManifest.files.length,
        files: prospectiveManifest.files.map(({ path: file, mode, sha256: fileDigest }) => ({ path: file, mode, sha256: fileDigest })),
      },
      profile: installed.profile,
      approval: installed.approval,
      launcher: installed.launcher,
      service: installed.service,
      health: installed.health,
      projectionChanges: [],
    },
    rollback: "root_journal_and_exact_installed_readback_required_no_automatic_repair",
    noEffects: ["no_sudo", "no_install", "no_service_mutation", "no_ssh", "no_product_data_mutation", "no_issue_959_continuation"],
    operatorContract: trustedLocalOperatorContract,
  };
  const plan = deepFreeze({ ...planCore, planDigest: sha256(canonicalJson(planCore)) });
  const state = initialState(plan, createdAt);
  deps.persistPlan({ plan, state, operationRoot: deps.operationRoot });
  return { ok: true, reasonCode: "local_runtime_deploy_planned", operationId, planDigest: plan.planDigest, plan, state };
}

export function applyLocalRuntimeDeploy({ operationId } = {}, dependencies = {}) {
  const deps = createLocalRuntimeDeployDependencies(dependencies);
  if (!operationPattern.test(String(operationId || ""))) throw new Error("local runtime deploy operation id invalid");
  if (!deps.tty()) throw new Error("local runtime deploy apply requires a real interactive TTY");
  const loaded = deps.loadOperation({ operationId, operationRoot: deps.operationRoot });
  validatePlanAndState(loaded.plan, loaded.state, deps.clock(), { allowExpiredAfterAttempt: true });
  if (loaded.state.sudoAttemptCount > 0 || ["sudo_started", "readback_required", "verified", "blocked"].includes(loaded.state.phase)) {
    return verifyLocalRuntimeDeploy({ operationId }, deps);
  }
  const source = deps.authenticateSource(deps);
  assertSourceMatchesPlan(source, loaded.plan);
  const before = deps.readInstalled({ health: true, ...deps });
  const adopted = classifyInstalledOutcome(loaded.plan, before);
  if (adopted.status === "installed_and_healthy") {
    const state = transitionState(loaded.state, "verified", deps.clock, { result: adopted.status });
    deps.persistState({ operationId, state, operationRoot: deps.operationRoot });
    return boundedResult(loaded.plan, state, adopted.status, "none");
  }
  if (adopted.status === "conflicting_installed_state") throw new Error("local runtime deploy conflicting installed state");
  // Preparation is unprivileged and may create only the existing owner journal.
  deps.invokeController({ mode: "prepare", hint: loaded.plan.nativeInstall.hint, tty: false });
  const attempted = transitionState(loaded.state, "sudo_started", deps.clock, { sudoAttemptCount: 1 });
  deps.persistState({ operationId, state: attempted, operationRoot: deps.operationRoot });
  let controller;
  try {
    controller = deps.invokeController({ mode: "arm", hint: loaded.plan.nativeInstall.hint, tty: true });
  } catch {
    const state = transitionState(attempted, "readback_required", deps.clock, { result: "privilege_effect_uncertain" });
    deps.persistState({ operationId, state, operationRoot: deps.operationRoot });
    return boundedResult(loaded.plan, state, "privilege_effect_uncertain", "verify");
  }
  const state = transitionState(attempted, "readback_required", deps.clock, {
    result: controller?.reasonCode === "native_install_interactive_handoff_completed" ? "installed_readback_required" : "privilege_effect_uncertain",
  });
  deps.persistState({ operationId, state, operationRoot: deps.operationRoot });
  return verifyLocalRuntimeDeploy({ operationId }, deps);
}

export function verifyLocalRuntimeDeploy({ operationId } = {}, dependencies = {}) {
  const deps = createLocalRuntimeDeployDependencies(dependencies);
  if (!operationPattern.test(String(operationId || ""))) throw new Error("local runtime deploy operation id invalid");
  const loaded = deps.loadOperation({ operationId, operationRoot: deps.operationRoot });
  validatePlanAndState(loaded.plan, loaded.state, deps.clock(), { allowExpiredAfterAttempt: true });
  const source = deps.authenticateSource(deps);
  if (canonicalJson(source) !== canonicalJson(loaded.plan.source)) {
    if (loaded.state.sudoAttemptCount === 0) throw new Error("local runtime deploy source drift after plan");
    deps.authenticatePlannedSource({ plan: loaded.plan, ...deps });
  }
  let controller = null;
  if (loaded.state.sudoAttemptCount === 1) {
    try { controller = deps.invokeController({ mode: "resume", hint: loaded.plan.nativeInstall.hint, tty: false }); } catch { controller = null; }
  }
  const installed = deps.readInstalled({ health: true, ...deps });
  const classified = classifyInstalledOutcome(loaded.plan, installed, controller);
  const outcome = loaded.state.sudoAttemptCount === 1 && classified.status === "no_effect"
    ? { ...classified, nextAction: "new_explicit_operation_and_later_authorization_no_retry" }
    : classified;
  const phase = outcome.status === "installed_and_healthy" ? "verified" : "readback_required";
  const state = loaded.state.sudoAttemptCount === 0 && phase !== "verified"
    ? loaded.state
    : loaded.state.phase === "verified"
    ? loaded.state
    : transitionState(loaded.state, phase, deps.clock, { result: outcome.status });
  if (state !== loaded.state) deps.persistState({ operationId, state, operationRoot: deps.operationRoot });
  return boundedResult(loaded.plan, state, outcome.status, outcome.nextAction);
}

export function authenticateLocalRuntimeDeploySource(dependencies = {}) {
  const deps = createLocalRuntimeDeployDependencies(dependencies);
  const root = deps.repositoryRoot;
  if (root !== localRuntimeDeployRepositoryRoot || realpathSync(root) !== root) throw new Error("local runtime deploy canonical repository required");
  rejectAmbientGitAuthority();
  const localConfig = commandText(deps, ["config", "--local", "--no-includes", "--null", "--list"], root);
  rejectUnsafeGitConfig(localConfig);
  if (commandText(deps, ["rev-parse", "--is-shallow-repository"], root).trim() !== "false") throw new Error("local runtime deploy shallow repository refused");
  if (commandText(deps, ["symbolic-ref", "--short", "HEAD"], root).trim() !== "main") throw new Error("local runtime deploy exact main branch required");
  const status = commandText(deps, ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "status", "--porcelain=v1", "--untracked-files=all"], root);
  if (status !== "") throw new Error("local runtime deploy clean repository required");
  const commit = exactLine(commandText(deps, ["rev-parse", "HEAD^{commit}"], root), shaPattern, "HEAD");
  const localMain = exactLine(commandText(deps, ["rev-parse", "refs/heads/main^{commit}"], root), shaPattern, "local main");
  const originMain = exactLine(commandText(deps, ["rev-parse", "refs/remotes/origin/main^{commit}"], root), shaPattern, "origin main");
  if (commit !== localMain || commit !== originMain) throw new Error("local runtime deploy main identity mismatch");
  const tree = exactLine(commandText(deps, ["rev-parse", `${commit}^{tree}`], root), shaPattern, "source tree");
  const origin = commandText(deps, ["remote", "get-url", "origin"], root).trim();
  if (origin !== "https://github.com/tommytang213/Settleora.git") throw new Error("local runtime deploy canonical origin required");
  const publicRef = deps.command("/usr/bin/git", [
    "-c", "credential.helper=", "-c", "http.extraHeader=", "ls-remote", "--exit-code",
    "https://github.com/tommytang213/Settleora.git", "refs/heads/main",
  ], { cwd: "/", env: sanitizedGitEnvironment(), encoding: "utf8" });
  if (publicRef.status !== 0 || publicRef.stdout !== `${commit}\trefs/heads/main\n`) throw new Error("local runtime deploy public main mismatch");
  if (commandText(deps, ["for-each-ref", "refs/replace", "--format=%(refname)"], root) !== "") throw new Error("local runtime deploy replace refs refused");
  const common = path.resolve(root, commandText(deps, ["rev-parse", "--git-common-dir"], root).trim());
  for (const candidate of [path.join(common, "info/grafts"), path.join(common, "objects/info/alternates")]) if (existsSync(candidate)) throw new Error("local runtime deploy alternate Git authority refused");
  const hooks = path.join(common, "hooks");
  if (existsSync(hooks) && readdirSync(hooks).some((name) => !name.endsWith(".sample") && lstatSync(path.join(hooks, name)).isFile())) throw new Error("local runtime deploy repository hooks refused");
  commandText(deps, ["fsck", "--full", "--strict", "--no-dangling"], root);
  const bootstrapBlob = exactLine(commandText(deps, ["rev-parse", `${commit}:tools/auto-runner/semantic-recovery-native-install-bootstrap.sh`], root), shaPattern, "bootstrap blob");
  const controllerBlob = exactLine(commandText(deps, ["rev-parse", `${commit}:${localRuntimeDeployControllerPath}`], root), shaPattern, "controller blob");
  if (gitObjectOid("blob", readFileSync(path.join(root, "tools/auto-runner/semantic-recovery-native-install-bootstrap.sh"))) !== bootstrapBlob
      || gitObjectOid("blob", readFileSync(path.join(root, localRuntimeDeployControllerPath))) !== controllerBlob) {
    throw new Error("local runtime deploy source closure mismatch");
  }
  return deepFreeze({ commit, tree, branch: "main", localMain, originMain, publicMain: commit, bootstrapBlob, controllerBlob });
}

export function authenticateLocalRuntimeDeployPlannedSource({ plan, command = runCommand, repositoryRoot = localRuntimeDeployRepositoryRoot } = {}) {
  validatePlan(plan);
  rejectAmbientGitAuthority();
  const invoke = (args) => {
    const result = command("/usr/bin/git", args, { cwd: repositoryRoot, env: sanitizedGitEnvironment(), encoding: "utf8" });
    if (result.status !== 0 || result.signal !== null || result.error || result.stderr) throw new Error("local runtime deploy planned source unavailable");
    return result.stdout;
  };
  if (exactLine(invoke(["rev-parse", `${plan.source.commit}^{tree}`]), shaPattern, "planned tree") !== plan.source.tree
      || exactLine(invoke(["rev-parse", `${plan.source.commit}:tools/auto-runner/semantic-recovery-native-install-bootstrap.sh`]), shaPattern, "planned bootstrap") !== plan.source.bootstrapBlob
      || exactLine(invoke(["rev-parse", `${plan.source.commit}:${localRuntimeDeployControllerPath}`]), shaPattern, "planned controller") !== plan.source.controllerBlob) {
    throw new Error("local runtime deploy planned source identity mismatch");
  }
  invoke(["fsck", "--full", "--strict", "--no-dangling"]);
  return { ok: true, reasonCode: "local_runtime_deploy_planned_source_reauthenticated" };
}

export function classifyInstalledOutcome(plan, installed, controller = null) {
  const runtimeExact = installed?.runtime?.bundleDigest === installed?.config?.runtimeBundleDigest
    && installed?.runtime?.sourceSha === installed?.approval?.sourceSha
    && installed?.runtime?.bundleDigest === installed?.approval?.bundleDigest
    && canonicalJson(installed?.runtime) === canonicalJson(plan?.runtime?.current)
    && canonicalJson(installed?.config) === canonicalJson(plan?.runtime?.config)
    && installed?.approval?.sha256 === plan?.runtime?.approval?.sha256;
  const identitiesExact = runtimeExact && installed?.launcher?.ok === true && installed?.profile?.ok === true && installed?.service?.ok === true
    && installed?.launcher?.sha256 === plan?.runtime?.launcher?.sha256
    && installed?.profile?.sha256 === plan?.runtime?.profile?.sha256
    && installed?.service?.unitSha256 === plan?.runtime?.service?.unitSha256;
  const bootstrapExact = installed?.nativeInstall?.bootstrapBlob === plan?.source?.bootstrapBlob
    || controller?.rootResult?.sourceCommit === plan?.source?.commit;
  const nativeVerified = bootstrapExact && (installed?.nativeInstall?.verified === true
    || controller?.reasonCode === "native_install_result_requires_readback"
    || controller?.reasonCode === "native_install_restart_completed");
  if (nativeVerified && identitiesExact && installed?.health?.ok === true && controller?.reasonCode !== "native_install_root_result_blocked") {
    return { status: "installed_and_healthy", nextAction: "none" };
  }
  if (nativeVerified && identitiesExact && installed?.health?.ok === false) return { status: "installed_but_health_failed", nextAction: "inspect_service_and_health_without_restart" };
  if (installed?.conflict === true) return { status: "conflicting_installed_state", nextAction: "stop_and_inspect_installed_authorities" };
  if (controller?.reasonCode === "native_install_root_result_blocked") return { status: "blocked_retained_evidence", nextAction: "bounded_source_repair_no_replay" };
  if (controller?.reasonCode === "native_install_root_result_requires_recovery") return { status: "privilege_effect_uncertain", nextAction: "separate_manual_recovery_gate" };
  return { status: "no_effect", nextAction: "apply_once_if_no_prior_sudo_attempt" };
}

export function persistLocalRuntimeDeployPlan({ plan, state, operationRoot }) {
  validatePlan(plan);
  validateState(state, plan);
  ensurePrivateDirectory(operationRoot);
  const final = path.join(operationRoot, plan.operationId);
  if (existsSync(final)) throw new Error("local runtime deploy operation already exists");
  const stage = path.join(operationRoot, `.${plan.operationId}.${randomBytes(12).toString("hex")}.stage`);
  mkdirSync(stage, { mode: 0o700 });
  try {
    writePrivateFile(path.join(stage, "plan.json"), canonicalBytes(plan), 0o400);
    writePrivateFile(path.join(stage, "state.json"), canonicalBytes(state));
    fsyncDirectory(stage);
    renameSync(stage, final);
    fsyncDirectory(operationRoot);
  } catch (error) {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: false });
    throw error;
  }
  return final;
}

export function loadLocalRuntimeDeployOperation({ operationId, operationRoot }) {
  if (!operationPattern.test(String(operationId || ""))) throw new Error("local runtime deploy operation id invalid");
  const directory = path.join(operationRoot, operationId);
  assertPrivateDirectory(directory);
  let names = readdirSync(directory).sort();
  const temporaryNames = names.filter((name) => /^\.state\.[a-f0-9]{24}\.tmp$/u.test(name));
  if (temporaryNames.length === 1 && names.length === 3 && names.includes("plan.json") && names.includes("state.json")) {
    reconcileLocalStateTemporary(directory, temporaryNames[0]);
    names = readdirSync(directory).sort();
  }
  if (canonicalJson(names) !== canonicalJson(["plan.json", "state.json"])) throw new Error("local runtime deploy operation residue refused");
  const plan = readPrivateJson(path.join(directory, "plan.json"));
  const state = readPrivateJson(path.join(directory, "state.json"));
  validatePlan(plan); validateState(state, plan);
  return { plan, state };
}

function reconcileLocalStateTemporary(directory, temporaryName) {
  const plan = readPrivateJson(path.join(directory, "plan.json"));
  const current = readPrivateJson(path.join(directory, "state.json"));
  const prospective = readPrivateJson(path.join(directory, temporaryName));
  validatePlan(plan); validateState(current, plan); validateState(prospective, plan);
  if (prospective.sequence !== current.sequence + 1 || prospective.sudoAttemptCount < current.sudoAttemptCount) {
    throw new Error("local runtime deploy state temporary conflict");
  }
  renameSync(path.join(directory, temporaryName), path.join(directory, "state.json"));
  fsyncDirectory(directory);
}

export function persistLocalRuntimeDeployState({ operationId, state, operationRoot }) {
  const loaded = loadLocalRuntimeDeployOperation({ operationId, operationRoot });
  validateState(state, loaded.plan);
  if (state.sequence !== loaded.state.sequence + 1 || state.sudoAttemptCount < loaded.state.sudoAttemptCount) throw new Error("local runtime deploy state rollback refused");
  const target = path.join(operationRoot, operationId, "state.json");
  const temporary = path.join(operationRoot, operationId, `.state.${randomBytes(12).toString("hex")}.tmp`);
  writePrivateFile(temporary, canonicalBytes(state));
  renameSync(temporary, target);
  fsyncDirectory(path.dirname(target));
}

export function readInstalledRuntimeAuthorities({ runtimeRoot, configPath, profilePath, healthUnitPath, health = false } = {}) {
  const configBytes = readSafeFile(configPath);
  const config = parseInstalledJson(configBytes);
  let runtime = null;
  let conflict = false;
  try { runtime = verifyRuntimeBundle(runtimeRoot); } catch { conflict = existsSync(runtimeRoot); }
  const approvalBytes = readSafeFile(path.join(path.dirname(runtimeRoot), ".runtime.approved.json"));
  const approval = parseInstalledJson(approvalBytes);
  const profileBytes = readSafeFile(profilePath);
  const launcherBytes = readSafeFile(path.join(path.dirname(runtimeRoot), ".runtime.launcher.mjs"));
  const unitBytes = readSafeFile(healthUnitPath);
  const bootstrap = readInstalledBootstrap(nativeInstallTrustedBootstrapPath);
  const bootstrapResidue = readdirSync(path.dirname(nativeInstallTrustedBootstrapPath)).filter((name) => /^\.settleora-semantic-recovery-native-install-bootstrap\.[a-f0-9]{64}\.tmp$/u.test(name));
  if (bootstrapResidue.length > 0) conflict = true;
  return {
    config: { runtimeBundleDigest: config.runtimeBundleDigest ?? null, sha256: sha256(configBytes) },
    runtime: runtime ? { sourceSha: runtime.sourceSha, bundleDigest: runtime.bundleDigest, manifestDigest: sha256(readSafeFile(path.join(runtimeRoot, runtimeManifestName))) } : null,
    approval: { sourceSha: approval.sourceSha ?? null, bundleDigest: approval.bundleDigest ?? null, sha256: sha256(approvalBytes) },
    profile: { ok: profileBytes.length > 0, sha256: sha256(profileBytes) },
    launcher: { ok: launcherBytes.length > 0, sha256: sha256(launcherBytes) },
    service: { ok: unitBytes.length > 0, unitSha256: sha256(unitBytes), action: "none" },
    health: health ? readLoopbackHealth() : { ok: null, reasonCode: "not_read_during_plan" },
    nativeInstall: { verified: false, reasonCode: "native_install_controller_readback_required", bootstrapBlob: bootstrap === null ? null : gitObjectOid("blob", bootstrap) },
    conflict,
  };
}

export function readLoopbackHealth({ host = "127.0.0.1", port = 8787, timeoutSeconds = 3 } = {}) {
  if (host !== "127.0.0.1" || port !== 8787 || timeoutSeconds !== 3) throw new Error("local runtime deploy health selector invalid");
  const child = spawnSync("/usr/bin/curl", ["--fail", "--silent", "--show-error", "--max-time", "3", "http://127.0.0.1:8787/health/auto-runner"], {
    cwd: "/", env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" }, encoding: "utf8", maxBuffer: 64 * 1024,
  });
  return child.status === 0 && child.signal === null && !child.error
    ? { ok: true, statusCode: 200, reasonCode: "loopback_health_ok", bodySha256: sha256(Buffer.from(child.stdout)) }
    : { ok: false, statusCode: null, reasonCode: "loopback_health_unavailable", bodySha256: null };
}

function invokeNativeInstallController({ mode, hint }) {
  const mapping = { prepare: "--prepare-local-interactive", arm: "--arm-local-interactive-sudo", resume: "--resume" };
  if (!Object.hasOwn(mapping, mode)) throw new Error("local runtime deploy controller mode invalid");
  const child = spawnSync("/usr/bin/node", [path.join(localRuntimeDeployRepositoryRoot, localRuntimeDeployControllerPath), mapping[mode]], {
    cwd: localRuntimeDeployRepositoryRoot,
    env: { HOME: process.env.HOME || "/home/tommytang213", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    input: canonicalBytes(hint), encoding: "utf8", maxBuffer: 128 * 1024,
  });
  if (child.status !== 0 || child.signal !== null || child.error) throw new Error("local runtime deploy native controller failed");
  return parseCanonicalJson(Buffer.from(child.stdout));
}

function runCommand(executable, args, options) { return spawnSync(executable, args, { ...options, maxBuffer: 16 * 1024 * 1024 }); }
function commandText(deps, args, cwd) {
  const result = deps.command("/usr/bin/git", args, { cwd, env: sanitizedGitEnvironment(), encoding: "utf8" });
  if (result.status !== 0 || result.signal !== null || result.error || result.stderr) throw new Error("local runtime deploy Git authentication failed");
  return result.stdout;
}
function sanitizedGitEnvironment() { return { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" }; }
function rejectAmbientGitAuthority() {
  const forbidden = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_REPLACE_REF_BASE", "GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_SSH", "GIT_SSH_COMMAND", "SSH_ASKPASS", "GIT_ASKPASS"];
  if (forbidden.some((name) => Object.hasOwn(process.env, name))) throw new Error("local runtime deploy ambient Git authority refused");
}
function rejectUnsafeGitConfig(bytes) {
  const entries = bytes.split("\0").filter(Boolean);
  const unsafe = /^(core\.(hookspath|fsmonitor|attributesfile|sshcommand)|url\..*\.insteadof|http\..*\.extraheader|diff\..*\.(command|textconv)|filter\..*\.(clean|smudge|process)|remote\.origin\.pushurl)$/iu;
  if (entries.some((entry) => unsafe.test(entry.split("\n", 1)[0]))) throw new Error("local runtime deploy unsafe Git config refused");
}
function exactLine(value, pattern, label) { const line = value.trim(); if (!pattern.test(line) || value !== `${line}\n`) throw new Error(`local runtime deploy ${label} invalid`); return line; }
function operationIdFromRandom(random) { const bytes = Buffer.from(random(32)); if (bytes.length !== 32) throw new Error("local runtime deploy entropy invalid"); return bytes.toString("hex"); }
function initialState(plan, createdAt) { return stateWithDigest({ contract: `${localRuntimeDeployContract}_state`, version: 1, operationId: plan.operationId, planDigest: plan.planDigest, phase: "planned", sequence: 0, sudoAttemptCount: 0, updatedAt: createdAt, result: null }); }
function transitionState(current, phase, clock, overrides = {}) {
  const allowed = { planned: ["sudo_started", "verified", "blocked"], sudo_started: ["readback_required"], readback_required: ["readback_required", "verified", "blocked"], verified: ["verified"], blocked: ["blocked"] };
  if (!allowed[current.phase]?.includes(phase)) throw new Error("local runtime deploy state transition invalid");
  const { stateDigest: _digest, ...core } = current;
  return stateWithDigest({ ...core, phase, sequence: current.sequence + 1, sudoAttemptCount: overrides.sudoAttemptCount ?? current.sudoAttemptCount, updatedAt: clock().toISOString(), result: overrides.result ?? current.result });
}
function stateWithDigest(core) { return deepFreeze({ ...core, stateDigest: sha256(canonicalJson(core)) }); }
function validatePlan(plan) {
  if (!plainObject(plan) || plan.contract !== localRuntimeDeployContract || plan.version !== 1 || !operationPattern.test(String(plan.operationId || "")) || !digestPattern.test(String(plan.planDigest || ""))
      || plan.repository !== localRuntimeDeployRepository || !validTimestamp(plan.createdAt) || !validTimestamp(plan.expiresAt)
      || Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) !== maximumPlanAgeMs
      || !plainObject(plan.source) || !shaPattern.test(String(plan.source.commit || "")) || !shaPattern.test(String(plan.source.tree || ""))
      || !shaPattern.test(String(plan.source.bootstrapBlob || "")) || !shaPattern.test(String(plan.source.controllerBlob || ""))
      || plan.source.branch !== "main" || plan.source.commit !== plan.source.localMain || plan.source.commit !== plan.source.originMain || plan.source.commit !== plan.source.publicMain
      || plan.nativeInstall?.hint?.sourceCommit !== plan.source.commit || plan.nativeInstall?.hint?.bootstrapBlob !== plan.source.bootstrapBlob
      || plan.nativeInstall?.hint?.taskCorrelation !== `issue-1012-local-deploy:${plan.operationId}`) throw new Error("local runtime deploy plan invalid");
  const { planDigest, ...core } = plan; if (sha256(canonicalJson(core)) !== planDigest) throw new Error("local runtime deploy plan digest invalid");
}
function validateState(state, plan) {
  if (!plainObject(state) || state.operationId !== plan.operationId || state.planDigest !== plan.planDigest || !["planned", "sudo_started", "readback_required", "verified", "blocked"].includes(state.phase) || ![0, 1].includes(state.sudoAttemptCount) || !Number.isSafeInteger(state.sequence) || state.sequence < 0
      || !validTimestamp(state.updatedAt) || Date.parse(state.updatedAt) < Date.parse(plan.createdAt)
      || (state.sequence === 0 && (state.phase !== "planned" || state.result !== null))) throw new Error("local runtime deploy state invalid");
  if (state.sudoAttemptCount === 0 && !["planned", "verified", "blocked"].includes(state.phase)) throw new Error("local runtime deploy state attempt invariant invalid");
  if (state.sudoAttemptCount === 1 && !["sudo_started", "readback_required", "verified", "blocked"].includes(state.phase)) throw new Error("local runtime deploy state attempt invariant invalid");
  const { stateDigest, ...core } = state; if (sha256(canonicalJson(core)) !== stateDigest) throw new Error("local runtime deploy state digest invalid");
}
function validatePlanAndState(plan, state, now, { allowExpiredAfterAttempt = false } = {}) { validatePlan(plan); validateState(state, plan); if (Date.parse(plan.expiresAt) < now.getTime() && !(allowExpiredAfterAttempt && state.sudoAttemptCount === 1)) throw new Error("local runtime deploy operation expired"); }
function assertSourceMatchesPlan(source, plan) { if (canonicalJson(source) !== canonicalJson(plan.source)) throw new Error("local runtime deploy source drift after plan"); }
function boundedResult(plan, state, status, nextAction) { return { ok: status === "installed_and_healthy", reasonCode: `local_runtime_deploy_${status}`, operationId: plan.operationId, planDigest: plan.planDigest, phase: state.phase, sudoAttemptCount: state.sudoAttemptCount, nextAction }; }
function ensurePrivateDirectory(directory) { if (!existsSync(directory)) { assertPrivateDirectory(path.dirname(directory)); mkdirSync(directory, { mode: 0o700 }); fsyncDirectory(path.dirname(directory)); } assertPrivateDirectory(directory); }
function assertPrivateDirectory(directory) { const info = lstatSync(directory); if (!info.isDirectory() || info.isSymbolicLink() || info.nlink < 2 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.() || realpathSync(directory) !== directory) throw new Error("local runtime deploy directory unsafe"); }
function writePrivateFile(target, bytes, mode = 0o600) { if (![0o400, 0o600].includes(mode)) throw new Error("local runtime deploy private file mode invalid"); const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode); try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } chmodSync(target, mode); }
function readPrivateJson(target) { const info = lstatSync(target); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.() || info.size < 2 || info.size > 4 * 1024 * 1024 || realpathSync(target) !== target) throw new Error("local runtime deploy file unsafe"); return parseCanonicalJson(readFileSync(target)); }
function readSafeFile(target) { const info = lstatSync(target); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o022) !== 0 || realpathSync(target) !== target || info.size > 16 * 1024 * 1024) throw new Error("local runtime deploy installed file unsafe"); return readFileSync(target); }
function readInstalledBootstrap(target) { if (!existsSync(target)) return null; const info = lstatSync(target); if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || info.nlink !== 1 || (info.mode & 0o7777) !== 0o555 || realpathSync(target) !== target || info.size < 1 || info.size > 1024 * 1024) throw new Error("local runtime deploy installed bootstrap unsafe"); return readFileSync(target); }
function parseInstalledJson(bytes) { const value = JSON.parse(Buffer.from(bytes).toString("utf8")); if (!plainObject(value)) throw new Error("local runtime deploy installed JSON invalid"); return value; }
function parseCanonicalJson(bytes) { const value = JSON.parse(Buffer.from(bytes).toString("utf8")); if (!canonicalBytes(value).equals(Buffer.from(bytes))) throw new Error("local runtime deploy noncanonical JSON refused"); return value; }
function realTtyAvailable() { try { const fd = openSync("/dev/tty", constants.O_RDWR | constants.O_NOFOLLOW); closeSync(fd); return true; } catch { return false; } }
function fsyncDirectory(target) { const fd = openSync(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function validTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
function canonicalBytes(value) { return Buffer.from(`${canonicalJson(value)}\n`); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }
