import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  chmodSync, closeSync, constants, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authenticateInstalledBoundaryArtifact, authenticateTrustedSshPackage, closeAuthenticatedPackage, collectTrustedSshInstalledAuthority, createTrustedSshInstallationPlan,
  consumeTrustedSshOperation, deriveEffectiveSudoPolicy, enterTrustedSshRootGate, parseTrustedSshCommand, renderTrustedSshFixtures, reserveTrustedSshOperation,
  trustedSshPackageContract, trustedSshPaths,
  validateEffectiveSshdOutput, validateEffectiveSudoPolicy, validateNativeStaticExecutable, validateRealizedAuthorizedKey, validateTrustedSshFixtures,
  validateTrustedSshInstallationPlan,
} from "../trusted-ssh-boundary/lib/trusted-ssh-boundary.mjs";
import { runTrustedSshDispatcher } from "../trusted-ssh-boundary/settleora-trusted-ssh-dispatcher.mjs";
import { runTrustedSshRootGate } from "../trusted-ssh-boundary/settleora-trusted-ssh-root-gate.mjs";
import { runAuthenticatedRootBootstrap } from "../trusted-ssh-boundary/settleora-authenticated-root-bootstrap.mjs";
import { runTrustedSshPamPreauth } from "../trusted-ssh-boundary/settleora-trusted-ssh-pam-preauth.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const sourceRoot = path.join(repositoryRoot, "tools/auto-runner/trusted-ssh-boundary");
const compilerFlags = ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-static"];
const entryCompilerFlags = ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-nostdlib", "-static", "-fno-stack-protector", "-fno-builtin", "-fno-pie", "-no-pie"];
const key = "20260805-0925-0123456789abcdef";
const operation = "a".repeat(64);
const fingerprint = `SHA256:${"A".repeat(43)}`;

test("native shell and fd gate compile warning-free as static ELF without loader dependencies", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  for (const executable of [built.entry, built.fdExec, built.rootGate, built.pamPreauth]) {
    const identity = validateNativeStaticExecutable(executable);
    assert.equal(identity.static, true);
    assert.doesNotMatch(execFileSync("/usr/bin/readelf", ["-W", "-l", executable], { encoding: "utf8" }), /INTERP/u);
    assert.doesNotMatch(execFileSync("/usr/bin/readelf", ["-W", "-d", executable], { encoding: "utf8" }), /\(NEEDED\)/u);
  }
  for (const executable of [built.entry, built.rootGate, built.pamPreauth]) {
    const symbols = execFileSync("/usr/bin/readelf", ["-Ws", executable], { encoding: "utf8" });
    assert.doesNotMatch(symbols, /UND\s+[A-Za-z_]|__tunables_init|libc|GLIBC/u);
    assert.match(symbols, /\b_start\b/u);
  }
}));

test("native shell is the first program and clears hostile startup and loader environment before dispatch", () => withFixture((fixture) => {
  const sentinel = path.join(fixture, "startup-ran");
  const mockSource = path.join(fixture, "mock.c");
  const mock = path.join(fixture, "mock");
  writeFileSync(mockSource, String.raw`#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
int main(int argc, char **argv, char **envp) { int count=0; while(envp[count]) count++; printf("argc=%d env=%d tty=%d\n", argc, count, isatty(0)); for(int i=0;i<argc;i++) printf("a%d=%s\n",i,argv[i]); for(int i=0;i<count;i++) printf("e%d=%s\n",i,envp[i]); return 0; }
`);
  execFileSync("/usr/bin/gcc", [...compilerFlags, mockSource, "-o", mock]);
  const entry = path.join(fixture, "settleora-trusted-ssh-entry");
  execFileSync("/usr/bin/gcc", [...entryCompilerFlags,
    `-DSETTLEORA_DISPATCH_EXECUTABLE=\"${mock}\"`,
    "-DSETTLEORA_DISPATCH_MODULE=\"/fixed/dispatcher.mjs\"",
    path.join(sourceRoot, "native/settleora-trusted-ssh-entry.c"), "-o", entry,
  ]);
  const hook = path.join(fixture, "hook.sh");
  writeFileSync(hook, `#!/bin/sh\nprintf ran > '${sentinel}'\n`);
  chmodSync(hook, 0o700);
  const result = spawnSync(entry, ["-c", "settleora-handoff-v1"], {
    argv0: "settleora-trusted-ssh-entry",
    encoding: "utf8",
    env: {
      ...process.env,
      SSH_ORIGINAL_COMMAND: `settleora-handoff-v1 preflight ${key} ${operation}`,
      BASH_ENV: hook, ENV: hook, LD_PRELOAD: hook, LD_LIBRARY_PATH: fixture,
      NODE_OPTIONS: `--require=${hook}`, PYTHONPATH: fixture, PYTHONSTARTUP: hook,
      RUBYOPT: `-r${hook}`, RUBYLIB: fixture, PERL5OPT: `-I${fixture}`, PERL5LIB: fixture,
      SHELLOPTS: "xtrace", GLIBC_TUNABLES: "glibc.malloc.check=3", GCONV_PATH: fixture,
      LOCPATH: fixture, MALLOC_TRACE: sentinel, HOME: fixture,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(sentinel), false);
  assert.match(result.stdout, /argc=6 env=5/u);
  assert.match(result.stdout, /a1=--disable-proto=throw\na2=\/fixed\/dispatcher\.mjs\na3=preflight/u);
  for (const expected of ["HOME=/nonexistent", "LANG=C", "LC_ALL=C", "PATH=/usr/bin:/bin", "TZ=UTC"]) assert.match(result.stdout, new RegExp(expected.replaceAll("/", "\\/"), "u"));
  assert.doesNotMatch(result.stdout, /BASH_ENV|NODE_OPTIONS|LD_PRELOAD|PYTHON|RUBY|PERL|SHELLOPTS|GLIBC|GCONV|LOCPATH|MALLOC/u);
  const pty = spawnSync("/usr/bin/script", ["-qefc", `${entry} -c settleora-handoff-v1`, "/dev/null"], {
    encoding: "utf8",
    env: { SSH_ORIGINAL_COMMAND: `settleora-handoff-v1 execute ${key} ${operation}` },
  });
  assert.equal(pty.status, 0, `${pty.stderr}\n${pty.stdout}`);
  assert.match(pty.stdout, /argc=6 env=5 tty=1/u);
  assert.match(pty.stdout, /a3=execute/u);
}));

test("exact sshd shell-c shape is accepted while interactive, extra-argv and malformed requests fail closed", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  const base = { argv0: "settleora-trusted-ssh-entry", encoding: "utf8", env: { SSH_ORIGINAL_COMMAND: `settleora-handoff-v1 preflight ${key} ${operation}` } };
  assert.notEqual(spawnSync(built.entry, [], base).status, 0);
  assert.notEqual(spawnSync(built.entry, ["-c", "settleora-handoff-v1", "extra"], base).status, 0);
  for (const command of rejectedCommands()) {
    if (command.includes("\0")) continue;
    const result = spawnSync(built.entry, ["-c", "settleora-handoff-v1"], { ...base, env: { SSH_ORIGINAL_COMMAND: command } });
    assert.equal(result.status, 65, command);
    assert.equal(result.stderr, "SETTLEORA_SSH_BOUNDARY_E65\n");
    if (command.length > 0) assert.doesNotMatch(result.stderr, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
}));

test("command grammar is data-only, bounded, canonical and traversal-free", () => {
  assert.deepEqual(parseTrustedSshCommand(`settleora-handoff-v1 execute ${key} ${operation}`), { mode: "execute", handoffKey: key, operationId: operation });
  for (const value of rejectedCommands()) assert.throws(() => parseTrustedSshCommand(value), /invalid/u, value);
  assert.equal(path.join(trustedSshPaths.handoffRoot, key), `${trustedSshPaths.handoffRoot}/${key}`);
});

test("dispatcher independently authenticates a complete held package and passes exact fd/argv/environment", () => withFixture((fixture) => {
  const packageRoot = path.join(fixture, "handoffs");
  mkdirSync(packageRoot, { mode: 0o700 });
  createPackage(packageRoot);
  let observed;
  const result = runTrustedSshDispatcher({
    argv: ["preflight", key, operation], handoffRoot: packageRoot, expectedUid: process.getuid(),
    executor(value) { observed = { ...value, entrypointBytes: readFileSync(value.entrypointFd, "utf8") }; return { reasonCode: "mock_complete" }; },
  });
  assert.equal(result.reasonCode, "mock_complete");
  assert.deepEqual(observed.argv, [trustedSshPaths.fdExec, "preflight", key, operation]);
  assert.equal(Number.isInteger(observed.packageDirectoryFd), true);
  assert.deepEqual(observed.env, { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" });
  assert.equal(observed.entrypointBytes, "#!/usr/bin/bash\nprintf 'fixture-entry %s %s\\n' \"$1\" \"$2\"\n");
}));

test("package authentication rejects mutation, replay, symlink, hard-link, mode, owner identity and malformed closure", () => withFixture((fixture) => {
  const root = path.join(fixture, "handoffs"); mkdirSync(root, { mode: 0o700 }); createPackage(root);
  const packageDir = path.join(root, key);
  const authenticate = (overrides = {}) => authenticateTrustedSshPackage({ root, handoffKey: key, operationId: operation, expectedUid: process.getuid(), ...overrides });
  const valid = authenticate(); closeAuthenticatedPackage(valid);
  chmodSync(path.join(packageDir, "remote-entrypoint.sh"), 0o700);
  writeFileSync(path.join(packageDir, "remote-entrypoint.sh"), "mutated\n");
  chmodSync(path.join(packageDir, "remote-entrypoint.sh"), 0o550);
  assert.throws(authenticate, /invalid/u);
  rmSync(packageDir, { recursive: true }); createPackage(root);
  assert.throws(() => authenticate({ operationId: "b".repeat(64) }), /invalid/u);
  const entry = path.join(packageDir, "remote-entrypoint.sh");
  chmodSync(entry, 0o770); assert.throws(authenticate, /invalid/u); chmodSync(entry, 0o550);
  const hard = path.join(fixture, "hard"); linkSync(entry, hard); assert.throws(authenticate, /metadata/u); rmSync(hard);
  renameSync(entry, `${entry}.real`); linkSync(`${entry}.real`, entry); assert.throws(authenticate, /metadata|residue/u);
  rmSync(packageDir, { recursive: true }); createPackage(root);
  renameSync(path.join(packageDir, "controller"), path.join(packageDir, "controller.real"));
  symlinkSync("controller.real", path.join(packageDir, "controller"));
  assert.throws(authenticate);
}));

test("fd gate executes only the held entrypoint with a clean environment and preserved standard streams", () => withFixture((fixture) => {
  const built = buildNative(fixture, { expectedUid: process.getuid() });
  const script = path.join(fixture, "entry.sh");
  writeFileSync(script, "#!/usr/bin/bash\nprintf 'phase=%s operation=%s env=%s/%s/%s\\n' \"$1\" \"$2\" \"${BASH_ENV-unset}\" \"${NODE_OPTIONS-unset}\" \"$PATH\"\n");
  chmodSync(script, 0o500);
  const fd = openSync(script, constants.O_RDONLY | constants.O_NOFOLLOW);
  const directoryFd = openSync(fixture, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const result = spawnSync(built.fdExec, ["preflight", key, operation], {
      encoding: "utf8", env: { ...process.env, BASH_ENV: "/hostile", NODE_OPTIONS: "--inspect" },
      stdio: ["pipe", "pipe", "pipe", fd, directoryFd],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `phase=--preflight operation=${operation} env=unset/unset//usr/bin:/bin\n`);
  } finally { closeSync(fd); closeSync(directoryFd); }
}));

test("fixed no-argument root gate independently authenticates the exact package and operation", () => withFixture((fixture) => {
  const packageRoot = path.join(fixture, "handoffs"); mkdirSync(packageRoot, { mode: 0o700 }); createPackage(packageRoot);
  let observed; const order = [];
  const result = runTrustedSshRootGate({
    argv: [String(process.getuid()), String(process.getgid())], cwd: path.join(packageRoot, key), handoffRoot: packageRoot,
    uid: 0, euid: 0, expectedPackageUid: process.getuid(), gateEnterer: () => { order.push("enter"); return { sudoAttemptCount: 1 }; },
    bootstrapAuthenticator: () => { order.push("bootstrap"); return { reasonCode: "fixture_bootstrap_verified" }; },
    executor(value) { order.push("exec"); observed = value; return { reasonCode: "mock_root_gate_complete" }; },
  });
  assert.equal(result.reasonCode, "mock_root_gate_complete");
  assert.deepEqual(observed.argv, [trustedSshPaths.rootBootstrap, "--disable-proto=throw", trustedSshPaths.rootBootstrapModule]);
  assert.deepEqual(observed.env, { HOME: "/root", LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin", TZ: "UTC" });
  assert.deepEqual(order, ["bootstrap", "enter", "exec"]);
  assert.throws(() => runTrustedSshRootGate({ cwd: path.join(packageRoot, key), handoffRoot: packageRoot, argv: ["/bin/sh"], uid: 0, euid: 0 }), /identity/u);
}));

test("installed bootstrap authentication binds root-owned ancestry, mode and digest", () => withFixture((fixture) => {
  const directory = path.join(fixture, "installed"); mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, "settleora-authenticated-root-bootstrap.mjs");
  const manifestFile = path.join(directory, "artifact-manifest.json");
  const bytes = Buffer.from("export const fixture = true;\n");
  writeFileSync(file, bytes, { mode: 0o444 }); chmodSync(file, 0o444);
  const manifest = [{ byteCount: bytes.length, installedPath: file, mode: "0444",
    name: "settleora-authenticated-root-bootstrap.mjs", sha256: sha256(bytes) }];
  writeFileSync(manifestFile, `${canonicalJson(manifest)}\n`, { mode: 0o400 }); chmodSync(manifestFile, 0o400);
  const options = {
    expectedGid: process.getgid(), expectedInstalledPath: file,
    expectedName: "settleora-authenticated-root-bootstrap.mjs", expectedUid: process.getuid(),
    file, manifestFile, ancestryValidator() {},
  };
  assert.equal(authenticateInstalledBoundaryArtifact(options).reasonCode, "trusted_ssh_installed_artifact_verified");
  chmodSync(file, 0o644); writeFileSync(file, Buffer.concat([bytes, Buffer.from("x")])); chmodSync(file, 0o444);
  assert.throws(() => authenticateInstalledBoundaryArtifact(options), /digest/u);
}));

test("authenticated root bootstrap revalidates package and entered receipt before the bounded integration contract", () => withFixture((fixture) => {
  const packageRoot = path.join(fixture, "handoffs"); mkdirSync(packageRoot, { mode: 0o700 }); createPackage(packageRoot);
  let observed;
  const result = runAuthenticatedRootBootstrap({
    argv: [], cwd: path.join(packageRoot, key), handoffRoot: packageRoot, uid: 0, euid: 0,
    expectedPackageUid: process.getuid(),
    receiptValidator: ({ handoffKey, operationId }) => {
      assert.equal(handoffKey, key); assert.equal(operationId, operation);
      return { sudoAttemptCount: 1 };
    },
    integrationExecutor(value) { observed = value; return { reasonCode: "fixture_root_protocol_complete" }; },
  });
  assert.equal(result.reasonCode, "fixture_root_protocol_complete");
  assert.deepEqual(observed.executeFlow, ["prepare", "arm-interactive-sudo-once", "resume-readback-only"]);
  assert.equal(observed.sudoAttemptCount, 1);
  assert.throws(() => runAuthenticatedRootBootstrap({
    argv: [], cwd: path.join(packageRoot, key), handoffRoot: packageRoot, uid: 0, euid: 0,
    expectedPackageUid: process.getuid(), receiptValidator: () => ({ sudoAttemptCount: 2 }),
  }), /receipt/u);
}));

test("PAM pre-auth consumes the durable one-shot before a password prompt and rejects a second invocation", () => withFixture((fixture) => {
  const nativeSource = readFileSync(path.join(sourceRoot, "native/settleora-trusted-ssh-pam-preauth.c"), "utf8");
  assert.match(nativeSource, /text_equal\(pam_ruser, ACCOUNT\).*text_equal\(pam_user, ACCOUNT\).*text_equal\(pam_type, "auth"\)/su);
  assert.doesNotMatch(nativeSource, /text_equal\(pam_user, "root"\)/u);
  const packageRoot = path.join(fixture, "handoffs"); mkdirSync(packageRoot, { mode: 0o700 }); createPackage(packageRoot);
  let consumed = false; let promptCount = 0;
  const invoke = () => {
    runTrustedSshPamPreauth({
      argv: [String(process.getuid()), String(process.getgid())], cwd: path.join(packageRoot, key), handoffRoot: packageRoot,
      uid: process.getuid(), euid: 0, expectedPackageUid: process.getuid(), bootstrapAuthenticator() {},
      claimConsumer() { if (consumed) throw new Error("already_consumed"); consumed = true; return { sudoAttemptCount: 1 }; },
    });
    promptCount += 1;
  };
  invoke();
  assert.throws(invoke, /already_consumed/u);
  assert.equal(promptCount, 1);
  assert.throws(() => runTrustedSshPamPreauth({
    argv: [String(process.getuid()), String(process.getgid())], cwd: path.join(packageRoot, key), handoffRoot: packageRoot,
    uid: process.getuid(), gid: process.getgid() + 1, euid: 0,
  }), /identity_invalid/u);
}));

test("operation claim reservation, consumption and root entry enforce one fail-closed sudo execution", () => withFixture((fixture) => {
  const uid = process.getuid(); const gid = process.getgid();
  const claimRoot = path.join(fixture, "claims");
  mkdirSync(claimRoot, { mode: 0o710 }); chmodSync(claimRoot, 0o710);
  mkdirSync(path.join(claimRoot, "pending"), { mode: 0o1730 }); chmodSync(path.join(claimRoot, "pending"), 0o1730);
  mkdirSync(path.join(claimRoot, "consumed"), { mode: 0o700 }); chmodSync(path.join(claimRoot, "consumed"), 0o700);
  mkdirSync(path.join(claimRoot, "entered"), { mode: 0o700 }); chmodSync(path.join(claimRoot, "entered"), 0o700);
  const reserved = reserveTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation, expectedRootUid: uid, expectedAccountGid: gid });
  assert.equal(reserved.reasonCode, "trusted_ssh_operation_reserved");
  assert.throws(() => reserveTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation, expectedRootUid: uid, expectedAccountGid: gid }));
  const consumed = consumeTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation,
    expectedClaimUid: uid, expectedClaimGid: gid, expectedRootUid: uid, expectedRootGid: gid });
  assert.equal(consumed.sudoAttemptCount, 1);
  const entered = enterTrustedSshRootGate({ claimRoot, handoffKey: key, operationId: operation,
    expectedRootUid: uid, expectedRootGid: gid });
  assert.equal(entered.sudoAttemptCount, 1);
  assert.equal(existsSync(path.join(claimRoot, "consumed", `${operation}.json`)), false);
  assert.throws(() => enterTrustedSshRootGate({ claimRoot, handoffKey: key, operationId: operation,
    expectedRootUid: uid, expectedRootGid: gid }));
  assert.throws(() => consumeTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation,
    expectedClaimUid: uid, expectedClaimGid: gid, expectedRootUid: uid, expectedRootGid: gid }));
}));

test("concurrent pre-auth consumers permit exactly one transition before any prompt", async () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "settleora-trusted-ssh-test-")); chmodSync(fixture, 0o700);
  try {
  const uid = process.getuid(); const gid = process.getgid();
  const claimRoot = path.join(fixture, "claims");
  mkdirSync(claimRoot, { mode: 0o710 }); chmodSync(claimRoot, 0o710);
  mkdirSync(path.join(claimRoot, "pending"), { mode: 0o1730 }); chmodSync(path.join(claimRoot, "pending"), 0o1730);
  mkdirSync(path.join(claimRoot, "consumed"), { mode: 0o700 }); chmodSync(path.join(claimRoot, "consumed"), 0o700);
  reserveTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation, expectedRootUid: uid, expectedAccountGid: gid });
  const moduleUrl = new URL("../trusted-ssh-boundary/lib/trusted-ssh-boundary.mjs", import.meta.url).href;
  const source = `import {consumeTrustedSshOperation as c} from ${JSON.stringify(moduleUrl)}; try { c({claimRoot:process.argv[1],handoffKey:process.argv[2],operationId:process.argv[3],expectedClaimUid:Number(process.argv[4]),expectedClaimGid:Number(process.argv[5]),expectedRootUid:Number(process.argv[4]),expectedRootGid:Number(process.argv[5])}); } catch { process.exitCode=1; }`;
  const run = () => new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, claimRoot, key, operation, String(uid), String(gid)], { stdio: "ignore" });
    child.on("exit", (code) => resolve(code));
  });
    assert.deepEqual((await Promise.all([run(), run()])).sort(), [0, 1]);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test("execute reserves the operation before entrypoint dispatch and refuses a second prompt path", () => withFixture((fixture) => {
  const packageRoot = path.join(fixture, "handoffs"); mkdirSync(packageRoot, { mode: 0o700 }); createPackage(packageRoot);
  let claims = 0; let executions = 0;
  const invoke = () => runTrustedSshDispatcher({
    argv: ["execute", key, operation], handoffRoot: packageRoot, expectedUid: process.getuid(),
    claimReserver() { claims += 1; if (claims > 1) throw new Error("replay"); },
    executor() { executions += 1; return { reasonCode: "mock_complete" }; },
  });
  assert.equal(invoke().reasonCode, "mock_complete");
  assert.throws(invoke, /replay/u);
  assert.equal(executions, 1);
}));

test("generated dedicated-account fixtures are key-only, PTY-capable, non-shell and narrow-sudo", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  const plan = generatePlan(fixture, built);
  assert.equal(plan.reasonCode, "trusted_ssh_boundary_plan_verified");
  const platform = validateTrustedSshInstallationPlan(plan.root, { expectedUid: process.getuid(), runPlatformTools: true });
  assert.equal(Object.values(platform.nativeIdentities).every((identity) => identity.static === true), true);
  assert.deepEqual(validateTrustedSshFixtures(plan.root, { operatorKeyFingerprint: fingerprint }), { ok: true, reasonCode: "trusted_ssh_fixtures_verified" });
  const sshd = readFileSync(path.join(plan.root, "fixtures/sshd-match.conf"), "utf8");
  assert.doesNotMatch(sshd, /tommytang213/u);
  const sudoers = readFileSync(path.join(plan.root, "fixtures/sudoers"), "utf8");
  for (const route of ["/bin/sh", "/bin/bash", "sudoedit", "SETENV", "NOPASSWD", "*"]) assert.equal(sudoers.includes(route), false, route);
  assert.match(sudoers, /PASSWD: \/opt\/settleora\/trusted-ssh\/bin\/settleora-root-gate ""/u);
  writeFileSync(path.join(plan.root, "fixtures/sudoers"), `${sudoers}${trustedSshPaths.account} ALL=(root) PASSWD: /bin/bash ""\n`);
  assert.throws(() => validateTrustedSshFixtures(plan.root, { operatorKeyFingerprint: fingerprint }), /bytes/u);
}));

test("realized authorized key requires one exact restricted public key and its bound fingerprint", () => withFixture((fixture) => {
  const directory = path.join(fixture, "root-owned-keys");
  mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, "authorized_keys");
  const valid = "restrict,pty ssh-ed25519 AAAA settleora-trusted-ssh-operator\n";
  const replaceKey = (bytes) => {
    if (existsSync(file)) chmodSync(file, 0o600);
    writeFileSync(file, bytes, { mode: 0o400 });
    chmodSync(file, 0o400);
  };
  replaceKey(valid);
  const options = {
    expectedFingerprint: fingerprint, expectedUid: process.getuid(), expectedGid: process.getgid(),
    ancestryValidator() {}, fingerprintReader: () => fingerprint,
  };
  assert.equal(validateRealizedAuthorizedKey(file, options).fingerprint, fingerprint);
  for (const invalid of [
    valid.replace("restrict,pty", "pty"),
    valid.replace("ssh-ed25519", "ssh-rsa"),
    `${valid}${valid}`,
    valid.replace("AAAA", `${["-----BEGIN", "PRIVATE", "KEY-----"].join(" ")} AAAA`),
  ]) {
    replaceKey(invalid);
    assert.throws(() => validateRealizedAuthorizedKey(file, options), /authorized_key/u);
  }
  replaceKey(valid);
  assert.throws(() => validateRealizedAuthorizedKey(file, {
    ...options, fingerprintReader: () => `SHA256:${"B".repeat(43)}`,
  }), /fingerprint_mismatch/u);
}));

test("effective sshd validator rejects every security regression and accepts the exact fixture projection", () => {
  const exact = effectiveSshd();
  assert.deepEqual(validateEffectiveSshdOutput(exact), { ok: true, reasonCode: "trusted_ssh_effective_sshd_verified" });
  for (const [name, value] of [
    ["permituserenvironment", "yes"], ["permituserrc", "yes"], ["passwordauthentication", "yes"],
    ["authorizedkeyscommand", "/usr/local/bin/alternate-key-authority"],
    ["trustedusercakeys", "/etc/ssh/ca.pub"], ["authorizedprincipalsfile", ".ssh/authorized_principals"],
    ["authorizedprincipalscommand", "/usr/local/bin/principals"],
    ["pubkeyacceptedalgorithms", "ssh-rsa"],
    ["disableforwarding", "no"], ["allowtcpforwarding", "yes"], ["authorizedkeysfile", ".ssh/authorized_keys"],
    ["permittty", "no"], ["forcecommand", "internal-sftp"],
  ]) assert.throws(() => validateEffectiveSshdOutput(replaceEffective(exact, name, value)), new RegExp(name, "u"));
});

test("effective sudo projection rejects global, group, exempt, passwordless and extra-command authority", () => {
  const fixtures = renderTrustedSshFixtures({ operatorKeyFingerprint: fingerprint });
  const exact = JSON.parse(fixtures.effectiveSudoPolicy);
  assert.deepEqual(deriveEffectiveSudoPolicy(fixtures.sudoAuthorityObservation), exact);
  assert.equal(validateEffectiveSudoPolicy(`${canonicalJson(exact)}\n`).ok, true);
  const mutations = [
    { ...exact, exemptGroup: "sudo" },
    { ...exact, accountGroups: [trustedSshPaths.account, "sudo"] },
    { ...exact, authenticationRequired: false },
    { ...exact, passwordTries: 3 },
    { ...exact, passwordOwner: "root" },
    { ...exact, timestampTimeout: 5 },
    { ...exact, rules: [...exact.rules, { arguments: [], command: "/bin/bash", host: "ALL", runAs: ["root"], tags: ["PASSWD"] }] },
    { ...exact, rules: [{ ...exact.rules[0], tags: ["NOPASSWD"] }] },
  ];
  for (const policy of mutations) assert.throws(() => validateEffectiveSudoPolicy(`${canonicalJson(policy)}\n`), /sudo_policy/u);
  const observation = JSON.parse(fixtures.sudoAuthorityObservation);
  for (const mutation of [
    { ...observation, sourceClosure: { ...observation.sourceClosure, allIncludesResolved: false } },
    { ...observation, accountGroups: [...observation.accountGroups, { name: "sudo", source: "nss-supplementary-group" }] },
    { ...observation, defaults: observation.defaults.map((entry) => entry.name === "timestamp_timeout" ? { ...entry, value: 5 } : entry) },
    { ...observation, defaults: observation.defaults.map((entry) => entry.name === "rootpw" ? { ...entry, value: true } : entry) },
    { ...observation, rules: [...observation.rules, { ...observation.rules[0], command: "/bin/bash" }] },
  ]) assert.throws(() => deriveEffectiveSudoPolicy(`${canonicalJson(mutation)}\n`), /sudo_authority/u);
});

test("installed authority collector binds complete private sudoers, NSS and transitive PAM source bytes", () => withFixture((fixture) => {
  const rendered = renderTrustedSshFixtures({ operatorKeyFingerprint: fingerprint });
  const files = {
    "/etc/sudoers": "@includedir /etc/sudoers.d\n",
    "/etc/sudoers.d/settleora-trusted-ssh": rendered.sudoers,
    "/etc/passwd": `${trustedSshPaths.account}:x:12345:12345:Settleora trusted SSH handoff:${trustedSshPaths.home}:${trustedSshPaths.loginShell}\n`,
    "/etc/group": `${trustedSshPaths.account}:x:12345:\n`,
    "/etc/nsswitch.conf": "passwd: files\ngroup: files\n",
    "/etc/pam.d/settleora-handoff-sudo": rendered.pam,
    "/etc/pam.d/common-auth": "@include common-auth-local\nauth required pam_unix.so\n",
    "/etc/pam.d/common-auth-local": "auth required pam_deny.so\n",
    "/etc/pam.d/common-account": "account required pam_unix.so\n",
    "/etc/pam.d/common-session-noninteractive": "session required pam_unix.so\n",
  };
  const expectedSourceDigests = {};
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(fixture, name.slice(1)); mkdirSync(path.dirname(target), { mode: 0o700, recursive: true });
    writeFileSync(target, bytes, { mode: 0o600 }); chmodSync(target, 0o600); expectedSourceDigests[name] = sha256(bytes);
  }
  const options = {
    snapshotRoot: fixture, expectedSourceDigests, expectedConverterSha256: sha256(readFileSync("/usr/bin/cvtsudoers")),
    sourceCommit: "d".repeat(40), sourceTree: "e".repeat(40), collectedAt: "2026-08-05T04:15:00Z",
  };
  const collected = collectTrustedSshInstalledAuthority(options);
  assert.equal(collected.collector, "settleora_trusted_ssh_installed_authority_v1");
  assert.deepEqual(collected.pamClosure, ["/etc/pam.d/settleora-handoff-sudo", "/etc/pam.d/common-auth", "/etc/pam.d/common-auth-local", "/etc/pam.d/common-account", "/etc/pam.d/common-session-noninteractive"]);
  assert.equal(collected.sources.length, Object.keys(files).length);
  assert.equal(collected.sources.every((source) => source.mode === "0600" && source.nlink === 1), true);
  assert.equal(collected.converter.sha256, options.expectedConverterSha256);
  assert.throws(() => collectTrustedSshInstalledAuthority({ ...options, expectedConverterSha256: "0".repeat(64) }), /converter_digest/u);
  assert.throws(() => collectTrustedSshInstalledAuthority({ ...options, expectedSourceDigests: { ...expectedSourceDigests, "/etc/pam.d/common-auth": "0".repeat(64) } }), /source_digest/u);
  writeFileSync(path.join(fixture, "etc/sudoers.d/alternate"), `${trustedSshPaths.account} ALL=(root) NOPASSWD: /bin/bash\n`, { mode: 0o600 });
  const expanded = { ...expectedSourceDigests, "/etc/sudoers.d/alternate": sha256(`${trustedSshPaths.account} ALL=(root) NOPASSWD: /bin/bash\n`) };
  assert.throws(() => collectTrustedSshInstalledAuthority({ ...options, expectedSourceDigests: expanded }), /rule/u);
  rmSync(path.join(fixture, "etc/sudoers.d/alternate"));
  for (const [name, line, reason] of [
    ["extra-default", `Defaults:${trustedSshPaths.account} env_keep += "ATTACKER"\n`, /defaults_set/u],
    ["global-default", "Defaults env_reset\n", /defaults_scope/u],
  ]) {
    const target = path.join(fixture, `etc/sudoers.d/${name}`); writeFileSync(target, line, { mode: 0o600 });
    const withDefault = { ...expectedSourceDigests, [`/etc/sudoers.d/${name}`]: sha256(line) };
    assert.throws(() => collectTrustedSshInstalledAuthority({ ...options, expectedSourceDigests: withDefault }), reason);
    rmSync(target);
  }
  for (const invalidAccountDatabase of [
    `${trustedSshPaths.account}:x:0:12345:Settleora trusted SSH handoff:${trustedSshPaths.home}:${trustedSshPaths.loginShell}\n`,
    `${files["/etc/passwd"]}duplicate:x:12345:54321:Duplicate:/nonexistent:/usr/sbin/nologin\n`,
  ]) {
    const target = path.join(fixture, "etc/passwd"); writeFileSync(target, invalidAccountDatabase, { mode: 0o600 });
    assert.throws(() => collectTrustedSshInstalledAuthority({
      ...options, expectedSourceDigests: { ...expectedSourceDigests, "/etc/passwd": sha256(invalidAccountDatabase) },
    }), /account/u);
  }
  writeFileSync(path.join(fixture, "etc/passwd"), files["/etc/passwd"], { mode: 0o600 });
  for (const invalidGroup of [
    `${trustedSshPaths.account}:x:0:\n`,
    `${files["/etc/group"]}duplicate:x:12345:\n`,
  ]) {
    writeFileSync(path.join(fixture, "etc/group"), invalidGroup, { mode: 0o600 });
    assert.throws(() => collectTrustedSshInstalledAuthority({
      ...options, expectedSourceDigests: { ...expectedSourceDigests, "/etc/group": sha256(invalidGroup) },
    }), /groups/u);
  }
  writeFileSync(path.join(fixture, "etc/group"), files["/etc/group"], { mode: 0o600 });
  const escapingRoot = "@includedir /etc/sudoers.d/../../outside\n";
  writeFileSync(path.join(fixture, "etc/sudoers"), escapingRoot, { mode: 0o600 });
  assert.throws(() => collectTrustedSshInstalledAuthority({
    ...options, expectedSourceDigests: { ...expectedSourceDigests, "/etc/sudoers": sha256(escapingRoot) },
  }), /path/u);
}));

test("installed sshd and visudo fully parse generated configuration using a disposable fixture host key", () => withFixture((fixture) => {
  const rendered = renderTrustedSshFixtures({ operatorKeyFingerprint: fingerprint });
  const config = path.join(fixture, "sshd_config");
  const sudoers = path.join(fixture, "sudoers");
  const keyFile = path.join(fixture, "host-rsa-key");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(keyFile, privateKey.export({ format: "pem", type: "pkcs1" }), { mode: 0o600 });
  writeFileSync(config, `HostKey ${keyFile}\nUsePAM yes\n${rendered.sshd}`);
  writeFileSync(sudoers, rendered.sudoers);
  const sudoCheck = spawnSync("/usr/sbin/visudo", ["-cf", sudoers], { encoding: "utf8" });
  assert.equal(sudoCheck.status, 0, sudoCheck.stderr);
  const sshdCheck = spawnSync("/usr/sbin/sshd", ["-T", "-f", config, "-C", "user=settleora_handoff,host=localhost,addr=127.0.0.1"], { encoding: "utf8" });
  assert.equal(sshdCheck.status, 0, sshdCheck.stderr);
  assert.deepEqual(validateEffectiveSshdOutput(sshdCheck.stdout), { ok: true, reasonCode: "trusted_ssh_effective_sshd_verified" });
}));

test("installation plan is deterministic, complete, private-root-only and never mutates live security paths", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  const firstRoot = path.join(fixture, "one"); const secondRoot = path.join(fixture, "two");
  mkdirSync(firstRoot, { mode: 0o700 }); mkdirSync(secondRoot, { mode: 0o700 });
  const args = planArgs(built);
  const first = createTrustedSshInstallationPlan({ ...args, outputRoot: firstRoot });
  const second = createTrustedSshInstallationPlan({ ...args, outputRoot: secondRoot });
  assert.equal(first.planDigest, second.planDigest);
  assert.equal(sha256(readFileSync(path.join(first.root, "installation-plan.json"))), sha256(readFileSync(path.join(second.root, "installation-plan.json"))));
  const plan = JSON.parse(readFileSync(path.join(first.root, "installation-plan.json"), "utf8"));
  assert.equal(plan.rollbackOrder.length >= 6, true);
  assert.equal(plan.atomicInstallOrder.length >= 8, true);
  assert.equal(plan.manualDecisions.length, 5);
  const all = execFileSync("/usr/bin/find", [first.root, "-type", "f", "-print"], { encoding: "utf8" });
  assert.doesNotMatch(all, /^\/(etc|opt|usr\/local|var\/lib)\//mu);
}));

test("fault injection is fail-closed, leaves no published final and never clobbers an existing destination", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  const root = path.join(fixture, "output"); mkdirSync(root, { mode: 0o700 });
  assert.throws(() => createTrustedSshInstallationPlan({ ...planArgs(built), outputRoot: root, faultAt: "before_publish" }), /fault/u);
  assert.equal(existsSync(path.join(root, "trusted-ssh-boundary-plan-v1")), false);
  assert.throws(() => createTrustedSshInstallationPlan({ ...planArgs(built), outputRoot: root, faultAt: "after_publish_reservation" }), /fault/u);
  assert.equal(existsSync(path.join(root, "trusted-ssh-boundary-plan-v1/PUBLICATION.json")), false);
  assert.throws(() => validateTrustedSshInstallationPlan(path.join(root, "trusted-ssh-boundary-plan-v1"), { expectedUid: process.getuid() }));
  rmSync(path.join(root, "trusted-ssh-boundary-plan-v1"), { recursive: true });
  createTrustedSshInstallationPlan({ ...planArgs(built), outputRoot: root });
  const digest = sha256(readFileSync(path.join(root, "trusted-ssh-boundary-plan-v1/PUBLICATION.json")));
  assert.throws(() => createTrustedSshInstallationPlan({ ...planArgs(built), outputRoot: root }), /destination/u);
  assert.equal(sha256(readFileSync(path.join(root, "trusted-ssh-boundary-plan-v1/PUBLICATION.json"))), digest);
}));

test("validator detects artifact, fixture, publication, rollback and account-shell drift", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  const mutations = [
    ["artifacts/settleora-trusted-ssh-entry", (bytes) => Buffer.concat([bytes, Buffer.from("x")])],
    ["fixtures/sshd-match.conf", (bytes) => Buffer.from(bytes.toString().replace("PermitTTY yes", "PermitTTY no"))],
    ["fixtures/sudoers", (bytes) => Buffer.from(bytes.toString().replace("PASSWD:", "NOPASSWD:"))],
    ["fixtures/passwd.template", (bytes) => Buffer.from(bytes.toString().replace(trustedSshPaths.loginShell, "/bin/bash"))],
    ["fixtures/group.template", (bytes) => Buffer.from(bytes.toString().replace("__DEDICATED_GID__", "0"))],
    ["fixtures/shadow.template", (bytes) => Buffer.from(bytes.toString().replace("__MANUAL_PASSWORD_HASH_REQUIRED__", "!"))],
    ["fixtures/shells.append", () => Buffer.from("/bin/bash\n")],
  ];
  for (const [relative, mutate] of mutations) {
    const output = path.join(fixture, createHash("sha256").update(relative).digest("hex").slice(0, 8)); mkdirSync(output, { mode: 0o700 });
    const generated = createTrustedSshInstallationPlan({ ...planArgs(built), outputRoot: output });
    const target = path.join(generated.root, relative); chmodSync(target, 0o700); writeFileSync(target, mutate(readFileSync(target)));
    assert.throws(() => validateTrustedSshInstallationPlan(generated.root, { expectedUid: process.getuid() }), /invalid/u);
  }
}));

test("source contains no shell execution, PATH lookup, broad sudo, credentials, activation or live mutation primitive", () => {
  const entry = readFileSync(path.join(sourceRoot, "native/settleora-trusted-ssh-entry.c"), "utf8");
  for (const forbidden of ["system(", "popen(", "execlp(", "execvp(", "sh -c", "bash -c"] ) assert.equal(entry.includes(forbidden), false);
  const names = execFileSync("/usr/bin/find", [sourceRoot, "-type", "f", "-print0"]).toString("utf8").split("\0").filter(Boolean);
  const closure = Buffer.concat(names.map((name) => readFileSync(name)));
  assert.doesNotMatch(closure.toString("utf8"), /-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
  const text = closure.toString("utf8");
  assert.doesNotMatch(text, /spawn(?:Sync)?\(["'`]\/?(?:usr\/sbin\/)?(?:useradd|usermod|chsh|passwd|sudo)["'`]|systemctl["'`]?,\s*["'`]reload|sshd["'`]?,\s*["'`]-HUP/u);
});

function rejectedCommands() {
  return [
    "", "internal-sftp", "sftp", "scp -t /tmp/x", "settleora-handoff-v1", `settleora-handoff-v1 execute ${key}`,
    `settleora-handoff-v1 execute ${key} ${operation} extra`, `settleora-handoff-v1 -execute ${key} ${operation}`,
    `settleora-handoff-v1 execute ../x ${operation}`, `settleora-handoff-v1 execute ${key} ${operation};id`,
    `settleora-handoff-v1 execute ${key} ${operation}\nid`, `settleora-handoff-v1 execute ${key} $(id)`,
    `settleora-handoff-v1 execute ${key} ${operation}|id`, `settleora-handoff-v1 execute ${key} >x`,
    `settleora-handoff-v1 execute '${key}' ${operation}`, `settleora-handoff-v1 execute ${key} ${"a".repeat(65)}`,
    `settleora-handoff-v1 execute ${key} ${"a".repeat(64)}\0`, `settleora-handoff-v1 execute ２０２６０８０５-0925-0123456789abcdef ${operation}`,
    `settleora-handoff-v1  execute ${key} ${operation}`, `settleora-handoff-v1 execute ${key.toUpperCase()} ${operation}`,
    "x".repeat(129),
  ];
}

function buildNative(root, { expectedUid = 0 } = {}) {
  const entry = path.join(root, "settleora-trusted-ssh-entry");
  const fdExec = path.join(root, "settleora-trusted-ssh-fd-exec");
  const rootGate = path.join(root, "settleora-root-gate");
  const pamPreauth = path.join(root, "settleora-sudo-preauth");
  execFileSync("/usr/bin/gcc", [...entryCompilerFlags, path.join(sourceRoot, "native/settleora-trusted-ssh-entry.c"), "-o", entry]);
  execFileSync("/usr/bin/gcc", [...compilerFlags, `-DSETTLEORA_EXPECTED_ENTRY_UID=${expectedUid}U`, path.join(sourceRoot, "native/settleora-trusted-ssh-fd-exec.c"), "-o", fdExec]);
  execFileSync("/usr/bin/gcc", [...entryCompilerFlags, path.join(sourceRoot, "native/settleora-trusted-ssh-root-gate.c"), "-o", rootGate]);
  execFileSync("/usr/bin/gcc", [...entryCompilerFlags, path.join(sourceRoot, "native/settleora-trusted-ssh-pam-preauth.c"), "-o", pamPreauth]);
  return { entry, fdExec, pamPreauth, rootGate };
}

function planArgs(built) {
  return {
    dispatcherModule: path.join(sourceRoot, "settleora-trusted-ssh-dispatcher.mjs"), fdExec: built.fdExec,
    generatedAt: "2026-08-05T01:25:00Z", nativeShell: built.entry, operatorKeyFingerprint: fingerprint,
    rootGate: built.rootGate, rootGateModule: path.join(sourceRoot, "settleora-trusted-ssh-root-gate.mjs"),
    rootBootstrapModule: path.join(sourceRoot, "settleora-authenticated-root-bootstrap.mjs"),
    pamPreauth: built.pamPreauth, pamPreauthModule: path.join(sourceRoot, "settleora-trusted-ssh-pam-preauth.mjs"),
    repositoryRoot,
    sourceCommit: "d".repeat(40), sourceTree: "e".repeat(40),
    supportLibrary: path.join(sourceRoot, "lib/trusted-ssh-boundary.mjs"),
    sourceClosureAuthenticator: ({ dispatcherModule, fdExec, nativeShell, pamPreauth, pamPreauthModule, rootGate, rootGateModule, rootBootstrapModule, supportLibrary }) => ({ artifactBytes: {
      "settleora-trusted-ssh-entry": readFileSync(nativeShell),
      "settleora-trusted-ssh-dispatcher.mjs": readFileSync(dispatcherModule),
      "settleora-trusted-ssh-fd-exec": readFileSync(fdExec),
      "settleora-sudo-preauth": readFileSync(pamPreauth),
      "settleora-trusted-ssh-pam-preauth.mjs": readFileSync(pamPreauthModule),
      "settleora-root-gate": readFileSync(rootGate),
      "settleora-trusted-ssh-root-gate.mjs": readFileSync(rootGateModule),
      "settleora-authenticated-root-bootstrap.mjs": readFileSync(rootBootstrapModule),
      "trusted-ssh-boundary.mjs": readFileSync(supportLibrary),
    } }),
    sourceIdentityReader: () => ({ commit: "d".repeat(40), tree: "e".repeat(40) }),
  };
}

function generatePlan(root, built) { const output = path.join(root, "plan"); mkdirSync(output, { mode: 0o700 }); return createTrustedSshInstallationPlan({ ...planArgs(built), outputRoot: output }); }

function createPackage(root) {
  const directory = path.join(root, key); mkdirSync(directory, { mode: 0o700 });
  const entrypoint = Buffer.from("#!/usr/bin/bash\nprintf 'fixture-entry %s %s\\n' \"$1\" \"$2\"\n");
  const module = Buffer.from("export const fixture = true;\n");
  mkdirSync(path.join(directory, "controller"), { mode: 0o700 });
  writeFileSync(path.join(directory, "controller/module.mjs"), module, { mode: 0o440 }); chmodSync(path.join(directory, "controller/module.mjs"), 0o440);
  writeFileSync(path.join(directory, "remote-entrypoint.sh"), entrypoint, { mode: 0o550 }); chmodSync(path.join(directory, "remote-entrypoint.sh"), 0o550);
  const manifest = {
    contract: trustedSshPackageContract, entrypoint: "remote-entrypoint.sh", handoffKey: key,
    members: [
      { byteCount: module.length, mode: "0440", path: "controller/module.mjs", sha256: sha256(module) },
      { byteCount: entrypoint.length, mode: "0550", path: "remote-entrypoint.sh", sha256: sha256(entrypoint) },
    ],
    operationId: operation,
    protocol: { executeFlow: ["prepare", "arm-interactive-sudo-once", "resume-readback-only"], modes: ["preflight", "execute"], rootGate: trustedSshPaths.rootGate, sudoAttemptLimit: 1 },
    source: { commit: "d".repeat(40), repository: "tommytang213/Settleora", tree: "e".repeat(40) }, version: 1,
  };
  writeFileSync(path.join(directory, "boundary-package.json"), `${canonicalJson(manifest)}\n`, { mode: 0o440 }); chmodSync(path.join(directory, "boundary-package.json"), 0o440);
}

function effectiveSshd() {
  return [
    "authenticationmethods publickey", "passwordauthentication no", "kbdinteractiveauthentication no", "pubkeyauthentication yes",
    "pubkeyacceptedalgorithms sk-ssh-ed25519@openssh.com,ssh-ed25519",
    `authorizedkeysfile ${trustedSshPaths.authorizedKeys}`, "permituserenvironment no", "permituserrc no", "disableforwarding yes",
    "authorizedkeyscommand none", "trustedusercakeys none", "authorizedprincipalsfile none", "authorizedprincipalscommand none",
    "allowagentforwarding no", "allowtcpforwarding no", "x11forwarding no", "permittunnel no", "gatewayports no",
    "permittty yes", "forcecommand settleora-handoff-v1", "",
  ].join("\n");
}

function replaceEffective(text, name, value) {
  const prefix = `${name} `;
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix));
  assert.notEqual(index, -1);
  lines[index] = `${name} ${value}`;
  return lines.join("\n");
}
function withFixture(callback) { const root = mkdtempSync(path.join(os.tmpdir(), "settleora-trusted-ssh-test-")); chmodSync(root, 0o700); try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); } }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonicalize(value[name])])); return value; }
