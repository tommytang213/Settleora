import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authenticateTrustedSshPackage, closeAuthenticatedPackage, createTrustedSshInstallationPlan,
  consumeTrustedSshOperation, parseTrustedSshCommand, renderTrustedSshFixtures, reserveTrustedSshOperation,
  trustedSshPackageContract, trustedSshPaths,
  validateEffectiveSshdOutput, validateNativeStaticExecutable, validateRealizedAuthorizedKey, validateTrustedSshFixtures,
  validateTrustedSshInstallationPlan,
} from "../trusted-ssh-boundary/lib/trusted-ssh-boundary.mjs";
import { runTrustedSshDispatcher } from "../trusted-ssh-boundary/settleora-trusted-ssh-dispatcher.mjs";
import { runTrustedSshRootGate } from "../trusted-ssh-boundary/settleora-trusted-ssh-root-gate.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const sourceRoot = path.join(repositoryRoot, "tools/auto-runner/trusted-ssh-boundary");
const compilerFlags = ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-static"];
const entryCompilerFlags = ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-nostdlib", "-static", "-fno-stack-protector", "-fno-builtin", "-fno-pie", "-no-pie"];
const key = "20260805-0925-0123456789abcdef";
const operation = "a".repeat(64);
const fingerprint = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

test("native shell and fd gate compile warning-free as static ELF without loader dependencies", () => withFixture((fixture) => {
  const built = buildNative(fixture);
  for (const executable of [built.entry, built.fdExec, built.rootGate]) {
    const identity = validateNativeStaticExecutable(executable);
    assert.equal(identity.static, true);
    assert.doesNotMatch(execFileSync("/usr/bin/readelf", ["-W", "-l", executable], { encoding: "utf8" }), /INTERP/u);
    assert.doesNotMatch(execFileSync("/usr/bin/readelf", ["-W", "-d", executable], { encoding: "utf8" }), /\(NEEDED\)/u);
  }
  for (const executable of [built.entry, built.rootGate]) {
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
  let observed;
  const result = runTrustedSshRootGate({
    argv: [String(process.getuid()), String(process.getgid())], cwd: path.join(packageRoot, key), handoffRoot: packageRoot,
    uid: 0, euid: 0, expectedPackageUid: process.getuid(), claimConsumer: () => ({ sudoAttemptCount: 1 }),
    executor(value) { observed = value; return { reasonCode: "mock_root_gate_complete" }; },
  });
  assert.equal(result.reasonCode, "mock_root_gate_complete");
  assert.deepEqual(observed.argv, [trustedSshPaths.rootBootstrap]);
  assert.deepEqual(observed.env, { HOME: "/root", LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin", TZ: "UTC" });
  assert.throws(() => runTrustedSshRootGate({ cwd: path.join(packageRoot, key), handoffRoot: packageRoot, argv: ["/bin/sh"], uid: 0, euid: 0 }), /identity/u);
}));

test("operation claim reservation and root consumption enforce one fail-closed sudo execution", () => withFixture((fixture) => {
  const uid = process.getuid(); const gid = process.getgid();
  const claimRoot = path.join(fixture, "claims");
  mkdirSync(claimRoot, { mode: 0o710 }); chmodSync(claimRoot, 0o710);
  mkdirSync(path.join(claimRoot, "pending"), { mode: 0o1730 }); chmodSync(path.join(claimRoot, "pending"), 0o1730);
  mkdirSync(path.join(claimRoot, "consumed"), { mode: 0o700 }); chmodSync(path.join(claimRoot, "consumed"), 0o700);
  const reserved = reserveTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation, expectedRootUid: uid, expectedAccountGid: gid });
  assert.equal(reserved.reasonCode, "trusted_ssh_operation_reserved");
  assert.throws(() => reserveTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation, expectedRootUid: uid, expectedAccountGid: gid }));
  const consumed = consumeTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation,
    expectedClaimUid: uid, expectedClaimGid: gid, expectedRootUid: uid, expectedRootGid: gid });
  assert.equal(consumed.sudoAttemptCount, 1);
  assert.throws(() => consumeTrustedSshOperation({ claimRoot, handoffKey: key, operationId: operation,
    expectedClaimUid: uid, expectedClaimGid: gid, expectedRootUid: uid, expectedRootGid: gid }));
}));

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
    valid.replace("AAAA", "-----BEGIN PRIVATE KEY----- AAAA"),
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
    ["pubkeyacceptedalgorithms", "ssh-rsa"],
    ["disableforwarding", "no"], ["allowtcpforwarding", "yes"], ["authorizedkeysfile", ".ssh/authorized_keys"],
    ["permittty", "no"], ["forcecommand", "internal-sftp"],
  ]) assert.throws(() => validateEffectiveSshdOutput(replaceEffective(exact, name, value)), new RegExp(name, "u"));
});

test("installed sshd and visudo parse generated configuration where unprivileged platform limits permit", () => withFixture((fixture) => {
  const rendered = renderTrustedSshFixtures({ operatorKeyFingerprint: fingerprint });
  const config = path.join(fixture, "sshd_config");
  const sudoers = path.join(fixture, "sudoers");
  writeFileSync(config, `UsePAM yes\n${rendered.sshd}`);
  writeFileSync(sudoers, rendered.sudoers);
  const sudoCheck = spawnSync("/usr/sbin/visudo", ["-cf", sudoers], { encoding: "utf8" });
  assert.equal(sudoCheck.status, 0, sudoCheck.stderr);
  const sshdCheck = spawnSync("/usr/sbin/sshd", ["-T", "-f", config, "-C", "user=settleora_handoff,host=localhost,addr=127.0.0.1"], { encoding: "utf8" });
  assert.notEqual(sshdCheck.status, 0);
  assert.match(sshdCheck.stderr, /no hostkeys available/u);
  assert.doesNotMatch(sshdCheck.stderr, /Directive .* not allowed|Bad configuration option|keyword.*unknown/iu);
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
  assert.equal(plan.manualDecisions.length, 4);
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
  assert.doesNotMatch(text, /["'`]\/?(?:usr\/sbin\/)?(?:useradd|usermod|chsh|passwd|sudo)["'`]|systemctl["'`]?,\s*["'`]reload|sshd["'`]?,\s*["'`]-HUP/u);
});

test("draft PR 1048 branch and tree remain at the retained exact identity", () => {
  assert.equal(execFileSync("/usr/bin/git", ["rev-parse", "refs/heads/fix/issue-1012-complete-manual-root-handoff-package-producer-20260805-0156"], { cwd: repositoryRoot, encoding: "utf8" }).trim(), "d7fb62da65af8c8441bf1dfe05d56240bc03d26f");
  assert.equal(execFileSync("/usr/bin/git", ["rev-parse", "refs/heads/fix/issue-1012-complete-manual-root-handoff-package-producer-20260805-0156^{tree}"], { cwd: repositoryRoot, encoding: "utf8" }).trim(), "c20fc8304faccf9e8274d77dc7be386692d316f2");
  assert.equal(execFileSync("/usr/bin/git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repositoryRoot, encoding: "utf8" }).includes("semantic-recovery-native-install-package.mjs"), false);
});

test("retained 20260804-1825 handoff, owner controls and owner-readable root temporary stay byte-identical", () => {
  const retained = "/workspace/logs/auto-runner/Settleora/manual-root-handoffs/20260804-1825";
  const journals = "/workspace/logs/auto-runner/Settleora/manual-root-install-journals";
  const operationId = "054edadcb40c71dcf9d4b2a8e5bae634605f08c6d1d8610a25f52e3d392f29c5";
  const rootTemporary = `/etc/settleora-auto-runner/.semantic-recovery-native-install-results/.${operationId}.36dee61dd63802e10fab4133.tmp`;
  const aggregate = (command) => execFileSync("/usr/bin/bash", ["-o", "pipefail", "-c", command], { encoding: "utf8" }).trim().split(" ")[0];
  assert.equal(aggregate(`/usr/bin/find '${retained}' -type f -print0 | /usr/bin/sort -z | /usr/bin/xargs -0 /usr/bin/sha256sum | /usr/bin/sha256sum`), "658f1b4b0ec25e25c85ef7846436e2782aafb35978f43fb99c2306441b218ffa");
  assert.equal(aggregate(`/usr/bin/find '${journals}' -maxdepth 1 -type f -name '*${operationId}*' -print0 | /usr/bin/sort -z | /usr/bin/xargs -0 /usr/bin/sha256sum | /usr/bin/sha256sum`), "cdcd922b75337d3f1028eeb995bd4d66005418c67cf30dbe281cf7869b6800cb");
  assert.equal(sha256(readFileSync(rootTemporary)), "1c01eaaccca53a946c405d1362a3122b35bd726abc129cd34d5a92500ad8ed03");
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
  execFileSync("/usr/bin/gcc", [...entryCompilerFlags, path.join(sourceRoot, "native/settleora-trusted-ssh-entry.c"), "-o", entry]);
  execFileSync("/usr/bin/gcc", [...compilerFlags, `-DSETTLEORA_EXPECTED_ENTRY_UID=${expectedUid}U`, path.join(sourceRoot, "native/settleora-trusted-ssh-fd-exec.c"), "-o", fdExec]);
  execFileSync("/usr/bin/gcc", [...entryCompilerFlags, path.join(sourceRoot, "native/settleora-trusted-ssh-root-gate.c"), "-o", rootGate]);
  return { entry, fdExec, rootGate };
}

function planArgs(built) {
  return {
    dispatcherModule: path.join(sourceRoot, "settleora-trusted-ssh-dispatcher.mjs"), fdExec: built.fdExec,
    generatedAt: "2026-08-05T01:25:00Z", nativeShell: built.entry, operatorKeyFingerprint: fingerprint,
    rootGate: built.rootGate, rootGateModule: path.join(sourceRoot, "settleora-trusted-ssh-root-gate.mjs"),
    repositoryRoot,
    sourceCommit: "d".repeat(40), sourceTree: "e".repeat(40),
    supportLibrary: path.join(sourceRoot, "lib/trusted-ssh-boundary.mjs"),
    sourceClosureAuthenticator: ({ dispatcherModule, fdExec, nativeShell, rootGate, rootGateModule, supportLibrary }) => ({ artifactBytes: {
      "settleora-trusted-ssh-entry": readFileSync(nativeShell),
      "settleora-trusted-ssh-dispatcher.mjs": readFileSync(dispatcherModule),
      "settleora-trusted-ssh-fd-exec": readFileSync(fdExec),
      "settleora-root-gate": readFileSync(rootGate),
      "settleora-trusted-ssh-root-gate.mjs": readFileSync(rootGateModule),
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
    "allowagentforwarding no", "allowtcpforwarding no", "x11forwarding no", "permittunnel no", "gatewayports no",
    "permittty yes", "forcecommand settleora-handoff-v1", "",
  ].join("\n");
}

function replaceEffective(text, name, value) { return text.replace(new RegExp(`^${name} .*$`, "mu"), `${name} ${value}`); }
function withFixture(callback) { const root = mkdtempSync(path.join(os.tmpdir(), "settleora-trusted-ssh-test-")); chmodSync(root, 0o700); try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); } }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonicalize(value[name])])); return value; }
