import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyLocalRuntimeDeploy, authenticateLocalRuntimeDeploySource, classifyInstalledOutcome,
  localRuntimeDeployRepositoryRoot, planLocalRuntimeDeploy, trustedLocalOperatorContract,
  verifyLocalRuntimeDeploy,
} from "../lib/local-runtime-deploy.mjs";
import {
  buildLocalNativeBootstrapSudoArgv, localNativeBootstrapProgram, localNativeBootstrapProgramSha256,
  validateLocalNativeBootstrapSudoBoundary,
} from "../lib/local-native-bootstrap.mjs";
import { gitObjectOid } from "../lib/semantic-recovery-native-install-source.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const roots = new Set();
test.afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.clear(); });

const source = Object.freeze({
  commit: "a".repeat(40), tree: "b".repeat(40), branch: "main", localMain: "a".repeat(40), originMain: "a".repeat(40),
  publicMain: "a".repeat(40), bootstrapBlob: "c".repeat(40), controllerBlob: "d".repeat(40),
});
const manifest = Object.freeze({ sourceSha: source.commit, bundleDigest: "e".repeat(64), files: [{ path: "runner.mjs", mode: "100644", sha256: "f".repeat(64) }] });
const noEffect = () => ({
  config: { runtimeBundleDigest: "1".repeat(64), sha256: "2".repeat(64) }, runtime: { sourceSha: source.commit, bundleDigest: "1".repeat(64) },
  approval: { sourceSha: source.commit, bundleDigest: "1".repeat(64), sha256: "3".repeat(64) }, profile: { ok: true, sha256: "4".repeat(64) }, launcher: { ok: true, sha256: "5".repeat(64) },
  service: { ok: true, unitSha256: "6".repeat(64) }, health: { ok: false }, nativeInstall: { verified: false, bootstrapBlob: null }, conflict: false,
});
const healthy = () => ({
  ...noEffect(), health: { ok: true }, nativeInstall: { verified: true, bootstrapBlob: source.bootstrapBlob },
});

function fixture(overrides = {}) {
  const operationRoot = mkdtempSync(path.join(tmpdir(), "settleora-local-deploy-")); roots.add(operationRoot);
  let now = Date.parse("2026-08-05T08:04:00.000Z");
  let counter = 1;
  const calls = [];
  const deps = {
    operationRoot,
    clock: () => new Date(now),
    random: (size) => { const bytes = Buffer.alloc(size); bytes.writeUInt32BE(counter++, size - 4); return bytes; },
    authenticateSource: () => source,
    buildManifest: () => manifest,
    verifySource: () => ({ ok: true }),
    readInstalled: () => noEffect(),
    tty: () => true,
    invokeController: ({ mode, hint, tty }) => { calls.push({ mode, hint, tty }); return { reasonCode: mode === "resume" ? "native_install_result_requires_readback" : mode === "arm" ? "native_install_interactive_handoff_requires_readback" : "native_install_awaiting_fixed_root_bootstrap_handoff", rootResult: mode === "resume" ? { sourceCommit: source.commit } : undefined, sudoAttemptCount: mode === "prepare" ? 0 : 1 }; },
    ...overrides,
  };
  return { deps, calls, advance(ms) { now += ms; } };
}

test("trusted operator contract is explicit while product security remains unchanged", () => {
  assert.deepEqual(trustedLocalOperatorContract.trusted, ["devbox_host", "tommytang213_account", "authenticated_interactive_ssh_session", "interactive_login_shell"]);
  assert.match(trustedLocalOperatorContract.productBoundary, /unchanged_hostile_traffic_auth_authorization_privacy_money_audit_storage_and_exposure_rules/u);
  assert.equal(trustedLocalOperatorContract.privilege.maximumSudoAttemptsPerOperation, 1);
  assert.equal(trustedLocalOperatorContract.privilege.passwordHandling, "tty_to_sudo_only_never_captured");
  assert.ok(trustedLocalOperatorContract.unsupported.includes("windows_remote_coordinator"));
});

test("plan is canonical, cross-bound, unique under production-shaped entropy and has no privileged effect", () => {
  const first = fixture();
  const result = planLocalRuntimeDeploy({}, first.deps);
  const second = planLocalRuntimeDeploy({}, first.deps);
  assert.notEqual(result.operationId, second.operationId);
  assert.equal(result.state.sudoAttemptCount, 0);
  assert.deepEqual(first.calls, []);
  assert.equal(result.plan.source, source);
  assert.equal(result.plan.runtime.prospective.bundleDigest, manifest.bundleDigest);
  assert.deepEqual(result.plan.noEffects, ["no_sudo", "no_install", "no_service_mutation", "no_ssh", "no_product_data_mutation", "no_issue_959_continuation"]);
  const names = readdirSync(path.join(first.deps.operationRoot, result.operationId)).sort();
  assert.deepEqual(names, ["plan.json", "state.json"]);
  assert.match(readFileSync(path.join(first.deps.operationRoot, result.operationId, "plan.json"), "utf8"), new RegExp(result.planDigest, "u"));
});

test("deterministic injected entropy creates the expected operation identity", () => {
  const a = fixture(); const b = fixture();
  assert.equal(planLocalRuntimeDeploy({}, a.deps).operationId, planLocalRuntimeDeploy({}, b.deps).operationId);
});

test("apply requires a real interactive TTY before controller or sudo authority", () => {
  const item = fixture(); const planned = planLocalRuntimeDeploy({}, item.deps);
  assert.throws(() => applyLocalRuntimeDeploy({ operationId: planned.operationId }, { ...item.deps, tty: () => false }), /real interactive TTY/u);
  assert.deepEqual(item.calls, []);
});

test("apply performs one arm and every rerun is readback only", () => {
  let reads = 0;
  const item = fixture({ readInstalled: () => (++reads >= 3 ? healthy() : noEffect()) });
  const planned = planLocalRuntimeDeploy({}, item.deps);
  const first = applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  assert.equal(first.reasonCode, "local_runtime_deploy_installed_and_healthy");
  assert.equal(first.sudoAttemptCount, 1);
  assert.deepEqual(item.calls.map((call) => call.mode), ["prepare", "arm", "resume"]);
  const second = applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  assert.equal(second.sudoAttemptCount, 1);
  assert.equal(item.calls.filter((call) => call.mode === "arm").length, 1);
});

test("lost output, cancellation, authentication failure and process loss consume the operation and require readback", () => {
  for (const failure of ["cancelled", "authentication_failed", "lost_output", "killed_after_effect"]) {
    const item = fixture({ invokeController: ({ mode }) => { item.calls.push({ mode }); if (mode === "arm") throw new Error(failure); return { reasonCode: "native_install_root_result_requires_recovery", sudoAttemptCount: 1 }; } });
    const planned = planLocalRuntimeDeploy({}, item.deps);
    const result = applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
    assert.equal(result.sudoAttemptCount, 1);
    assert.equal(item.calls.filter((call) => call.mode === "arm").length, 1);
    applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
    assert.equal(item.calls.filter((call) => call.mode === "arm").length, 1);
  }
});

test("a complete crash temporary is promoted and resumes readback without another sudo", () => {
  const item = fixture();
  const planned = planLocalRuntimeDeploy({}, item.deps);
  const operationDirectory = path.join(item.deps.operationRoot, planned.operationId);
  const current = JSON.parse(readFileSync(path.join(operationDirectory, "state.json"), "utf8"));
  const core = { ...current, phase: "sudo_started", sequence: 1, sudoAttemptCount: 1, updatedAt: "2026-08-05T08:04:01.000Z" };
  delete core.stateDigest;
  const state = { ...core, stateDigest: createHash("sha256").update(canonicalJson(core)).digest("hex") };
  const temporary = path.join(operationDirectory, `.state.${"1".repeat(24)}.tmp`);
  writeFileSync(temporary, `${canonicalJson(state)}\n`, { mode: 0o600 }); chmodSync(temporary, 0o600);
  const result = verifyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  assert.equal(result.sudoAttemptCount, 1);
  assert.equal(item.calls.filter((call) => call.mode === "arm").length, 0);
  assert.deepEqual(readdirSync(operationDirectory).sort(), ["plan.json", "state.json"]);
});

test("source drift after plan forbids controller preparation and sudo", () => {
  const item = fixture(); const planned = planLocalRuntimeDeploy({}, item.deps);
  const drift = { ...source, commit: "9".repeat(40), localMain: "9".repeat(40), originMain: "9".repeat(40), publicMain: "9".repeat(40) };
  assert.throws(() => applyLocalRuntimeDeploy({ operationId: planned.operationId }, { ...item.deps, authenticateSource: () => drift }), /source drift/u);
  assert.deepEqual(item.calls, []);
});

test("main movement after a recorded attempt permits historical-source readback but never sudo", () => {
  let historicalReads = 0;
  const item = fixture({ invokeController: ({ mode }) => { item.calls.push({ mode }); if (mode === "arm") throw new Error("lost"); return { reasonCode: "native_install_root_result_requires_recovery", sudoAttemptCount: 1 }; } });
  const planned = planLocalRuntimeDeploy({}, item.deps);
  applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  const drift = { ...source, commit: "9".repeat(40), localMain: "9".repeat(40), originMain: "9".repeat(40), publicMain: "9".repeat(40) };
  const result = applyLocalRuntimeDeploy({ operationId: planned.operationId }, {
    ...item.deps, authenticateSource: () => drift, authenticatePlannedSource: () => { historicalReads += 1; return { ok: true }; },
  });
  assert.equal(result.sudoAttemptCount, 1);
  assert.equal(historicalReads, 1);
  assert.equal(item.calls.filter((call) => call.mode === "arm").length, 1);
});

test("missing, wrong and expired operations fail closed before privilege", () => {
  const item = fixture(); const planned = planLocalRuntimeDeploy({}, item.deps);
  assert.throws(() => applyLocalRuntimeDeploy({ operationId: "bad" }, item.deps), /operation id/u);
  assert.throws(() => applyLocalRuntimeDeploy({ operationId: "f".repeat(64) }, item.deps));
  item.advance(25 * 60 * 60 * 1000);
  assert.throws(() => applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps), /expired/u);
  assert.deepEqual(item.calls, []);
});

test("an exact existing installation is adopted without controller or sudo", () => {
  const item = fixture({ readInstalled: () => healthy() }); const planned = planLocalRuntimeDeploy({}, item.deps);
  const result = applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  assert.equal(result.reasonCode, "local_runtime_deploy_installed_and_healthy");
  assert.equal(result.sudoAttemptCount, 0);
  assert.deepEqual(item.calls, []);
});

test("conflicting installed state fails closed", () => {
  const item = fixture({ readInstalled: () => ({ ...noEffect(), conflict: true }) }); const planned = planLocalRuntimeDeploy({}, item.deps);
  assert.throws(() => applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps), /conflicting installed state/u);
  assert.deepEqual(item.calls, []);
});

test("verify is idempotent, unprivileged and does not turn health failure into success", () => {
  const item = fixture({ readInstalled: () => ({ ...healthy(), health: { ok: false } }) }); const planned = planLocalRuntimeDeploy({}, item.deps);
  const first = verifyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  const second = verifyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  assert.equal(first.reasonCode, "local_runtime_deploy_installed_but_health_failed");
  assert.equal(second.sudoAttemptCount, 0);
  assert.deepEqual(item.calls, []);
  assert.equal(classifyInstalledOutcome(planned.plan, { ...healthy(), health: { ok: false } }, { reasonCode: "native_install_result_requires_readback", rootResult: { sourceCommit: source.commit } }).status, "installed_but_health_failed");
});

test("password bytes and remote execution mechanisms never enter operations or controller arguments", () => {
  const item = fixture(); const planned = planLocalRuntimeDeploy({}, item.deps);
  applyLocalRuntimeDeploy({ operationId: planned.operationId }, item.deps);
  const bytes = readdirSync(path.join(item.deps.operationRoot, planned.operationId)).map((name) => readFileSync(path.join(item.deps.operationRoot, planned.operationId, name))).join("\n");
  assert.doesNotMatch(bytes, /fixture-secret-password|powershell|ssh\.exe/u);
  assert.ok(item.calls.every((call) => !Object.hasOwn(call, "password")));
});

test("local bootstrap sudo boundary is fixed, independently authenticating, and attaches every stream to the TTY", () => {
  const argv = buildLocalNativeBootstrapSudoArgv({
    sourceCommit: source.commit, bootstrapBlob: source.bootstrapBlob, correlation: "issue-1012-local-fixture",
    operationId: "1".repeat(64), ownerJournalDigest: "2".repeat(64), ownerJournalSha256: "3".repeat(64),
  });
  const checked = validateLocalNativeBootstrapSudoBoundary({ argv, tty: true, stdioKind: "real_tty_all_streams" });
  assert.equal(checked.programSha256, localNativeBootstrapProgramSha256);
  assert.deepEqual(argv.slice(0, 4), ["/usr/bin/sudo", "--", "/usr/bin/env", "-i"]);
  assert.equal(argv.includes(repositoryRoot), false);
  assert.match(localNativeBootstrapProgram, /ls-remote[\s\S]*fsck[\s\S]*cat-file[\s\S]*os\.replace[\s\S]*os\.execve/u);
  assert.match(localNativeBootstrapProgram, /credential\.helper=[\s\S]*http\.followRedirects=false[\s\S]*protocol\.file\.allow=never/u);
  assert.doesNotMatch(localNativeBootstrapProgram, /ssh|powershell|sudoers|systemctl/u);
  assert.throws(() => validateLocalNativeBootstrapSudoBoundary({ argv, tty: false, stdioKind: "real_tty_all_streams" }), /boundary invalid/u);
});

test("production source admission accepts exact canonical main and rejects common hazards", () => {
  const commit = "1".repeat(40); const tree = "2".repeat(40);
  const bootstrap = gitObjectOid("blob", readFileSync(path.join(repositoryRoot, "tools/auto-runner/semantic-recovery-native-install-bootstrap.sh")));
  const controller = gitObjectOid("blob", readFileSync(path.join(repositoryRoot, "tools/auto-runner/semantic-recovery-native-install.mjs")));
  const base = new Map([
    ["config --local --no-includes --null --list", ""], ["rev-parse --is-shallow-repository", "false\n"], ["symbolic-ref --short HEAD", "main\n"],
    ["-c core.fsmonitor=false -c core.hooksPath=/dev/null status --porcelain=v1 --untracked-files=all", ""], ["rev-parse HEAD^{commit}", `${commit}\n`],
    ["rev-parse refs/heads/main^{commit}", `${commit}\n`], ["rev-parse refs/remotes/origin/main^{commit}", `${commit}\n`], ["rev-parse 1111111111111111111111111111111111111111^{tree}", `${tree}\n`],
    ["remote get-url origin", "https://github.com/tommytang213/Settleora.git\n"], ["for-each-ref refs/replace --format=%(refname)", ""], ["rev-parse --git-common-dir", ".git\n"],
    ["fsck --full --strict --no-dangling", ""], ["rev-parse 1111111111111111111111111111111111111111:tools/auto-runner/semantic-recovery-native-install-bootstrap.sh", `${bootstrap}\n`],
    ["rev-parse 1111111111111111111111111111111111111111:tools/auto-runner/semantic-recovery-native-install.mjs", `${controller}\n`],
  ]);
  const attempt = (override = {}) => authenticateLocalRuntimeDeploySource({
    repositoryRoot: localRuntimeDeployRepositoryRoot,
    command: (_exe, args, options) => {
      if (options.cwd === "/") return { status: 0, signal: null, error: null, stderr: "", stdout: override.publicRef ?? `${commit}\trefs/heads/main\n` };
      const key = args.join(" ");
      return { status: 0, signal: null, error: null, stderr: "", stdout: Object.hasOwn(override, key) ? override[key] : base.get(key) };
    },
  });
  assert.equal(attempt().commit, commit);
  for (const [override, pattern] of [
    [{ "symbolic-ref --short HEAD": "feature/x\n" }, /exact main branch/u],
    [{ "symbolic-ref --short HEAD": "" }, /exact main branch/u],
    [{ "-c core.fsmonitor=false -c core.hooksPath=/dev/null status --porcelain=v1 --untracked-files=all": "?? x\n" }, /clean repository/u],
    [{ "rev-parse refs/remotes/origin/main^{commit}": `${"3".repeat(40)}\n` }, /main identity mismatch/u],
    [{ publicRef: `${"4".repeat(40)}\trefs\/heads\/main\n` }, /public main mismatch/u],
    [{ "remote get-url origin": "file:///tmp/fork\n" }, /canonical origin/u],
    [{ "rev-parse --is-shallow-repository": "true\n" }, /shallow/u],
    [{ "for-each-ref refs/replace --format=%(refname)": "refs/replace/x\n" }, /replace/u],
    [{ "config --local --no-includes --null --list": "core.hooksPath\n/tmp/hooks\0" }, /unsafe Git config/u],
  ]) assert.throws(() => attempt(override), pattern);
  const previousIndex = process.env.GIT_INDEX_FILE;
  process.env.GIT_INDEX_FILE = "/tmp/hidden-index";
  try { assert.throws(() => attempt(), /ambient Git authority/u); }
  finally { if (previousIndex === undefined) delete process.env.GIT_INDEX_FILE; else process.env.GIT_INDEX_FILE = previousIndex; }
  const admissionSource = readFileSync(path.join(repositoryRoot, "tools/auto-runner/lib/local-runtime-deploy.mjs"), "utf8");
  assert.match(admissionSource, /info\/grafts[\s\S]*objects\/info\/alternates[\s\S]*repository hooks refused/u);
  assert.match(admissionSource, /prepare: "--prepare-local-interactive"[\s\S]*arm: "--arm-local-interactive-sudo"/u);
});

test("retained failed handoff evidence remains byte-identical during local-flow tests", () => {
  const retained = "/workspace/logs/auto-runner/Settleora/manual-root-handoffs/20260804-1825/manual-installation-result-20260804-1825.json";
  if (!readable(retained)) return;
  const before = createHash("sha256").update(readFileSync(retained)).digest("hex");
  const item = fixture(); planLocalRuntimeDeploy({}, item.deps);
  const after = createHash("sha256").update(readFileSync(retained)).digest("hex");
  assert.equal(after, before);
});

function readable(target) { try { readFileSync(target); return true; } catch { return false; } }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
