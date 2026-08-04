import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  authenticateNativeInstallGitSource, gitObjectOid, nativeInstallBootstrapEntrypoint, nativeInstallBootstrapScript,
  nativeInstallProducerEntrypoint, nativeInstallRenameNoReplaceHelper,
} from "../lib/semantic-recovery-native-install-source.mjs";
import {
  assertCanonicalGenerationResult, authenticateRepositoryNativeInstallSource, createNativeInstallPackageFilesystem, generateNativeInstallHandoffPackage,
  nativeInstallPackageContract, validateNativeInstallHandoffPackage,
} from "../lib/semantic-recovery-native-install-package.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const roots = new Set();
test.afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.clear(); });

function gitFixture() {
  const objects = new Map();
  const put = (type, bytes) => { const value = Buffer.from(bytes); const oid = gitObjectOid(type, value); objects.set(oid, { oid, type, bytes: value }); return oid; };
  const files = new Map(Object.entries({
    [nativeInstallBootstrapEntrypoint]: 'import "./semantic-recovery-native-producer.mjs";\nimport "./lib/semantic-recovery-native-install-diagnostics.mjs";\n',
    [nativeInstallProducerEntrypoint]: 'import "./lib/producer-support.mjs";\n',
    "tools/auto-runner/lib/producer-support.mjs": "export const fixture = true;\n",
    "tools/auto-runner/lib/semantic-recovery-native-install-diagnostics.mjs": "export const fixtureDiagnostic = true;\n",
    [nativeInstallRenameNoReplaceHelper]: "# fixture helper\n",
    [nativeInstallBootstrapScript]: "#!/usr/bin/bash\nexit 1\n",
  }));
  const blobs = new Map([...files].map(([name, bytes]) => [name, put("blob", bytes)]));
  const tree = (prefix = "") => {
    const children = new Set([...blobs.keys()].filter((name) => prefix === "" ? name.includes("/") : name.startsWith(`${prefix}/`) && name.slice(prefix.length + 1).includes("/"))
      .map((name) => name.slice(prefix ? prefix.length + 1 : 0).split("/")[0]));
    const entries = [...children].map((name) => ({ mode: "40000", name, oid: tree(prefix ? `${prefix}/${name}` : name) }));
    for (const [name, oid] of blobs) if (path.posix.dirname(name) === (prefix || ".")) entries.push({ mode: [nativeInstallBootstrapEntrypoint, nativeInstallProducerEntrypoint, nativeInstallBootstrapScript].includes(name) ? "100755" : "100644", name: path.posix.basename(name), oid });
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
    return put("tree", Buffer.concat(entries.map((entry) => Buffer.concat([Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid, "hex")]))));
  };
  const rootTree = tree();
  const commit = put("commit", Buffer.from(`tree ${rootTree}\nauthor Fixture <fixture@example.invalid> 0 +0000\ncommitter Fixture <fixture@example.invalid> 0 +0000\n\nfixture\n`));
  const hint = { bootstrapBlob: blobs.get(nativeInstallBootstrapScript), contract: "settleora_semantic_recovery_native_install_source", repository: "tommytang213/Settleora", sourceCommit: commit, taskCorrelation: "issue-1012-package-fixture", version: 1 };
  return {
    authenticated: authenticateNativeInstallGitSource({ hint, objectReader: { resolveRepository: () => ({ commit, repository: hint.repository, transport: "authenticated_github_https" }), readObject: (oid) => objects.get(oid) } }),
    commit, rootTree,
  };
}

function fixtureRoot() { const root = mkdtempSync(path.join(tmpdir(), "settleora-handoff-test-")); roots.add(root); chmodSync(root, 0o700); return root; }
function seededRandom(seed = 1) { let count = seed; return (size) => { const bytes = Buffer.alloc(size); bytes.writeUInt32BE(count++, Math.max(0, size - 4)); return bytes; }; }
function generate(overrides = {}) {
  const fixture = gitFixture();
  const handoffRoot = overrides.handoffRoot || fixtureRoot();
  const calls = [];
  const result = generateNativeInstallHandoffPackage({
    repositoryRoot, handoffRoot, repository: overrides.repository || "tommytang213/Settleora", branch: overrides.branch || "main", sourceCommit: fixture.commit,
    sourceTree: fixture.rootTree, remoteHost: overrides.remoteHost || "operator@settleora.example", remoteHandoffRoot: "/srv/settleora/manual-root-handoffs",
    clock: overrides.clock || (() => new Date("2026-08-05T01:56:00.000Z")), random: overrides.random || seededRandom(),
    sourceAuthenticator: (request) => { calls.push(request); return fixture.authenticated; }, filesystem: overrides.filesystem, fault: overrides.fault,
  });
  return { calls, fixture, handoffRoot, result };
}

test("deterministic injected generation emits a complete canonical package with exact modes and cross-bindings", () => {
  const first = generate();
  const second = generate();
  assert.equal(first.result.packageAggregateDigest, second.result.packageAggregateDigest);
  assert.equal(first.result.windowsLauncherSha256, second.result.windowsLauncherSha256);
  assertCanonicalGenerationResult(first.result);
  const validation = validateNativeInstallHandoffPackage(first.result.finalHandoffDirectory);
  assert.equal(validation.packageAggregateDigest, first.result.packageAggregateDigest);
  assert.equal(validation.packageManifestDigest, first.result.packageManifestDigest);
  const manifest = JSON.parse(readFileSync(path.join(first.result.finalHandoffDirectory, "package-manifest.json"), "utf8"));
  const identity = JSON.parse(readFileSync(path.join(first.result.finalHandoffDirectory, "handoff-identity.json"), "utf8"));
  assert.equal(identity.timestampKey, "20260805-0956");
  assert.notEqual(identity.timestampKey, "20260804-1825");
  assert.equal(manifest.contract, nativeInstallPackageContract);
  assert.deepEqual(manifest.allowlist, [...manifest.allowlist].sort());
  assert.equal(new Set(manifest.members.map((entry) => entry.path)).size, manifest.members.length);
  for (const member of manifest.members) {
    const target = path.join(first.result.finalHandoffDirectory, member.path);
    assert.equal((lstatSync(target).mode & 0o7777).toString(8).padStart(4, "0"), member.mode);
    assert.equal(sha256(readFileSync(target)), member.sha256);
  }
  const launcher = readFileSync(path.join(first.result.finalHandoffDirectory, first.result.windowsLauncherPath));
  assert.equal(sha256(launcher), first.result.windowsLauncherSha256);
  assert.equal(first.calls.length, 1);
});

test("production entropy yields distinct operation, correlation, challenge and handoff identities", () => {
  const first = generate({ random: randomBytes });
  const second = generate({ random: randomBytes });
  assert.notEqual(first.result.operationId, second.result.operationId);
  const identities = [first, second].map((item) => JSON.parse(readFileSync(path.join(item.result.finalHandoffDirectory, "handoff-identity.json"), "utf8")));
  for (const key of ["operationId", "correlationId", "challengeId", "handoffId"]) assert.notEqual(identities[0][key], identities[1][key]);
});

test("generated launcher preserves ProgramData-only restoration, closed preflight stdin, execute TTY and one-sudo readback flow", () => {
  const { result } = generate();
  const launcher = readFileSync(path.join(result.finalHandoffDirectory, result.windowsLauncherPath), "utf8");
  assert.match(launcher, /EnvironmentVariables\.Clear\(\)/u);
  assert.match(launcher, /EnvironmentVariables\['ProgramData'\] = \$programData/u);
  assert.match(launcher, /StandardInput\.Close\(\)/u);
  assert.match(launcher, /execute_stdin_must_remain_interactive/u);
  assert.match(launcher, /if \(\$Phase -eq '--preflight'\) \{ '-T' \} else \{ '-tt' \}/u);
  assert.match(launcher, /\$args=@\(\$ttyOption,'-F','none','-o','BatchMode=yes'/u);
  assert.match(launcher, /'ForwardX11=no',\$RemoteHost,\$RemoteEntrypoint,\$Phase/u);
  assert.doesNotMatch(launcher, /'--',\$RemoteHost/u);
  assert.match(launcher, /controller_output_not_exact_canonical_record/u);
  assert.match(launcher, /\$Value -cne \$expected/u);
  assert.doesNotMatch(launcher, /ConvertFrom-Json/u);
  assert.doesNotMatch(launcher, /--arm-interactive-sudo/u);
  const remote = readFileSync(path.join(result.finalHandoffDirectory, "remote-entrypoint.sh"), "utf8");
  assert.equal((remote.match(/--arm-interactive-sudo/gu) || []).length, 2);
  assert.match(remote, /awaiting_readback_only_resume/u);
  assert.match(remote, /validate_installed_readback\(\)\{ emit native_install_execute_requires_installed_readback; exit 75; \}/u);
  assert.match(remote, /remote_package_root_unsafe/u);
  assert.match(remote, /remote_package_ancestor_mode_unsafe/u);
  assert.match(remote, /package_symlink_residue/u);
  assert.match(remote, /package_hardlink_residue/u);
  assert.match(remote, /package_special_residue/u);
  assert.match(remote, /package_directory_residue/u);
  assert.match(remote, /--preflight\) emit native_install_preflight_verified/u);
  assert.match(remote, /\*\) fail remote_phase_invalid/u);
  const syntax = spawnSync("/usr/bin/bash", ["-n", path.join(result.finalHandoffDirectory, "remote-entrypoint.sh")], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("generation never invokes controller, SSH, sudo, network, runtime or protected paths", () => {
  const before = process.env.PATH;
  const { result } = generate();
  assert.equal(process.env.PATH, before);
  const bytes = Buffer.concat(JSON.parse(readFileSync(path.join(result.finalHandoffDirectory, "package-manifest.json"), "utf8")).allowlist.map((name) => readFileSync(path.join(result.finalHandoffDirectory, name))));
  assert.doesNotMatch(bytes.toString("utf8"), /20260804-1825|054edadcb40c71dcf9d4b2a8e5bae634605f08c6d1d8610a25f52e3d392f29c5|\/workspace\/logs\/auto-runner\/Settleora\/manual-root-handoffs/u);
  assert.equal(result.noOperationalModeEntered, true);
});

test("existing destination and duplicate deterministic identity fail closed without overwrite", () => {
  const handoffRoot = fixtureRoot();
  const first = generate({ handoffRoot });
  assert.throws(() => generate({ handoffRoot }), /destination already exists/u);
  assert.equal(validateNativeInstallHandoffPackage(first.result.finalHandoffDirectory).operationId, first.result.operationId);
});

test("pre-publication faults remove only owned staging while post-publication faults are ambiguous and retain the final", () => {
  const preRoot = fixtureRoot();
  assert.throws(() => generate({ handoffRoot: preRoot, fault: (point) => { if (point === "before-publication") throw new Error("fixture pre fault"); } }), /fixture pre fault/u);
  assert.deepEqual(readFileNames(preRoot), []);
  const postRoot = fixtureRoot();
  assert.throws(() => generate({ handoffRoot: postRoot, fault: (point) => { if (point === "after-publication") throw new Error("fixture post fault"); } }), /publication ambiguous/u);
  assert.equal(readFileNames(postRoot).filter((name) => !name.startsWith(".")).length, 1);
});

test("mutation, embedded digest mismatch, noncanonical and unknown schema fields fail independent published-byte validation", () => {
  for (const mutation of [
    (directory) => writeFileSync(path.join(directory, "execution-descriptor.json"), Buffer.from("{}\n")),
    (directory) => { const target = path.join(directory, "package-manifest.json"); const value = JSON.parse(readFileSync(target)); value.unknown = true; writeFileSync(target, `${JSON.stringify(value)}\n`); },
    (directory) => { const target = path.join(directory, "generation-summary.json"); writeFileSync(target, readFileSync(target, "utf8").replace(/\n$/u, "")); },
  ]) {
    const { result } = generate(); mutation(result.finalHandoffDirectory);
    assert.throws(() => validateNativeInstallHandoffPackage(result.finalHandoffDirectory));
  }
});

test("symlink and unexpected hard-link package attacks fail closed", () => {
  const symlinked = generate();
  const identity = path.join(symlinked.result.finalHandoffDirectory, "handoff-identity.json");
  rmSync(identity); symlinkSync("execution-descriptor.json", identity);
  assert.throws(() => validateNativeInstallHandoffPackage(symlinked.result.finalHandoffDirectory), /symlink|unsafe/u);
  const linked = generate();
  const target = path.join(linked.result.finalHandoffDirectory, "handoff-identity.json");
  const extra = path.join(fixtureRoot(), "identity-link"); linkSync(target, extra);
  assert.throws(() => validateNativeInstallHandoffPackage(linked.result.finalHandoffDirectory));
});

test("unsafe destination roots, traversal metadata and malformed entropy fail before publication", () => {
  const unsafe = fixtureRoot(); chmodSync(unsafe, 0o777);
  assert.throws(() => generate({ handoffRoot: unsafe }), /destination|directory unsafe/u);
  const safe = fixtureRoot();
  assert.throws(() => generate({ handoffRoot: safe, random: () => Buffer.alloc(1) }), /entropy invalid/u);
  assert.throws(() => generate({ remoteHost: "-F@settleora.example" }), /generation request invalid/u);
  assert.throws(() => generate({ repository: "fork/Settleora" }), /generation request invalid/u);
  assert.throws(() => generate({ branch: "feature/unreviewed" }), /generation request invalid/u);
});

test("publisher is atomic no-clobber and never replaces a pre-existing final directory", () => {
  const parent = fixtureRoot();
  const stage = ".settleora-native-handoff.20260805-0156-aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.stage";
  const final = "20260805-0156-aaaaaaaaaaaaaaaa";
  mkdirSync(path.join(parent, stage), { mode: 0o700 });
  mkdirSync(path.join(parent, final), { mode: 0o700 });
  const filesystem = createNativeInstallPackageFilesystem();
  assert.throws(() => filesystem.publishNoReplace({ parent, stagingName: stage, finalName: final }), /publication failed/u);
  assert.equal(lstatSync(path.join(parent, final)).isDirectory(), true);
});

test("publisher transport failure after rename stays ambiguous even when the marker is lost", () => {
  const parent = fixtureRoot();
  const helper = path.join(fixtureRoot(), "publisher.py");
  writeFileSync(helper, "#!/usr/bin/python3\nimport os, sys\nbase = '/proc/self/fd/3/'\nos.rename(base + sys.argv[2], base + sys.argv[3])\nraise SystemExit(1)\n", { mode: 0o700 });
  const filesystem = createNativeInstallPackageFilesystem({ publisherPath: helper });
  assert.throws(() => generate({ handoffRoot: parent, filesystem }), /handoff publication ambiguous/u);
  assert.equal(readFileNames(parent).filter((name) => !name.startsWith(".")).length, 1);
});

test("production source admission rejects shallow, dirty, branch/ref/tree/origin, replace and unsafe-config drift before reading objects", () => {
  const root = fixtureRoot(); mkdirSync(path.join(root, ".git/info"), { recursive: true }); mkdirSync(path.join(root, ".git/objects/info"), { recursive: true });
  const commit = "a".repeat(40); const tree = "b".repeat(40);
  const request = { repositoryRoot: root, repository: "tommytang213/Settleora", branch: "main", sourceCommit: commit, sourceTree: tree };
  const base = new Map([
    ["config --local --no-includes --null --list", ""], ["rev-parse --is-shallow-repository", "false\n"],
    ["-c core.fsmonitor=false -c core.hooksPath=/dev/null status --porcelain=v1 --untracked-files=all", ""],
    ["rev-parse HEAD^{commit}", `${commit}\n`], ["symbolic-ref --short HEAD", "main\n"],
    ["rev-parse refs/heads/main^{commit}", `${commit}\n`], ["rev-parse refs/remotes/origin/main^{commit}", `${commit}\n`],
    [`rev-parse ${commit}^{tree}`, `${tree}\n`], ["remote get-url origin", "https://github.com/tommytang213/Settleora.git\n"],
    ["-c credential.helper= -c http.extraHeader= ls-remote --exit-code https://github.com/tommytang213/Settleora.git refs/heads/main", `${commit}\trefs/heads/main\n`],
    ["rev-parse --git-common-dir", ".git\n"], ["for-each-ref refs/replace --format=%(refname)", ""],
  ]);
  const attempt = (override) => authenticateRepositoryNativeInstallSource(request, { command: (_exe, args) => {
    const key = args.join(" ");
    if (Object.hasOwn(override, key)) return override[key];
    if (base.has(key)) return base.get(key);
    throw new Error("object read reached");
  } });
  assert.throws(() => authenticateRepositoryNativeInstallSource({ ...request, repository: "fork/Settleora" }), /canonical source/u);
  assert.throws(() => authenticateRepositoryNativeInstallSource({ ...request, branch: "feature/unreviewed" }), /canonical source/u);
  for (const [override, pattern] of [
    [{ "rev-parse --is-shallow-repository": "true\n" }, /incomplete/u],
    [{ "-c core.fsmonitor=false -c core.hooksPath=/dev/null status --porcelain=v1 --untracked-files=all": "?? unexpected.mjs\n" }, /dirty/u],
    [{ "symbolic-ref --short HEAD": "other\n" }, /binding/u],
    [{ "rev-parse refs/remotes/origin/main^{commit}": `${"c".repeat(40)}\n` }, /binding/u],
    [{ [`rev-parse ${commit}^{tree}`]: `${"d".repeat(40)}\n` }, /binding/u],
    [{ "remote get-url origin": "file:///tmp/repo\n" }, /binding/u],
    [{ "-c credential.helper= -c http.extraHeader= ls-remote --exit-code https://github.com/tommytang213/Settleora.git refs/heads/main": `${"c".repeat(40)}\trefs/heads/main\n` }, /GitHub branch/u],
    [{ "for-each-ref refs/replace --format=%(refname)": "refs/replace/a\n" }, /replace/u],
    [{ "config --local --no-includes --null --list": "core.hooksPath\n/tmp/hooks\0" }, /unsafe/u],
    [{ "config --local --no-includes --null --list": "core.fsmonitor\n/tmp/repo-selected-executable\0" }, /unsafe/u],
  ]) assert.throws(() => attempt(override), pattern);
  let worktreeCommandReached = false;
  assert.throws(() => authenticateRepositoryNativeInstallSource(request, { command: (_exe, args) => {
    const key = args.join(" ");
    if (key.includes(" status ")) worktreeCommandReached = true;
    if (key === "config --local --no-includes --null --list") return "core.fsmonitor\n/tmp/repo-selected-executable\0";
    return base.get(key) || "";
  } }), /unsafe/u);
  assert.equal(worktreeCommandReached, false);
});

function readFileNames(root) { return spawnSync("/usr/bin/find", [root, "-mindepth", "1", "-maxdepth", "1", "-printf", "%f\\n"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean); }
