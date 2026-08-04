import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const optionNames = new Set(["--repository-root", "--handoff-root", "--repository", "--branch", "--commit", "--tree", "--remote-host", "--remote-handoff-root"]);
const canonicalRepository = "tommytang213/Settleora";
const canonicalBranch = "main";
const oidPattern = /^[a-f0-9]{40}$/u;
const runtimeFiles = Object.freeze([
  Object.freeze({ mode: 0o400, source: "tools/auto-runner/generate-semantic-recovery-native-install-handoff.mjs" }),
  Object.freeze({ mode: 0o500, source: "tools/auto-runner/lib/semantic-recovery-native-handoff-rename-noreplace.py" }),
  Object.freeze({ mode: 0o400, source: "tools/auto-runner/lib/semantic-recovery-native-install-diagnostics.mjs" }),
  Object.freeze({ mode: 0o400, source: "tools/auto-runner/lib/semantic-recovery-native-install-handoff.mjs" }),
  Object.freeze({ mode: 0o400, source: "tools/auto-runner/lib/semantic-recovery-native-install-package.mjs" }),
  Object.freeze({ mode: 0o400, source: "tools/auto-runner/lib/semantic-recovery-native-install-source.mjs" }),
]);

export async function main(argv = process.argv.slice(2), output = process.stdout, errorOutput = process.stderr) {
  let runtimeRoot = null;
  try {
    if (process.argv[1] !== "-") throw new Error("generator must be loaded from its authenticated Git blob");
    const options = parseOptions(argv);
    const request = {
      repositoryRoot: realpathSync(options["--repository-root"]), handoffRoot: realpathSync(options["--handoff-root"]),
      repository: options["--repository"], branch: options["--branch"], sourceCommit: options["--commit"],
      sourceTree: options["--tree"], remoteHost: options["--remote-host"], remoteHandoffRoot: options["--remote-handoff-root"],
    };
    runtimeRoot = materializeAuthenticatedRuntime(request);
    const implementation = await import(pathToFileURL(path.join(runtimeRoot, "tools/auto-runner/lib/semantic-recovery-native-install-package.mjs")));
    const result = implementation.generateNativeInstallHandoffPackage(request);
    implementation.assertCanonicalGenerationResult(result);
    output.write(`${JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))}\n`);
    return 0;
  } catch (error) {
    const message = String(error?.message || "generation failed");
    errorOutput.write(`native install handoff generation blocked: ${/^[A-Za-z0-9 _.:/-]{1,200}$/u.test(message) ? message : "generation failed"}\n`);
    return 1;
  } finally {
    if (runtimeRoot !== null) rmSync(runtimeRoot, { recursive: true });
  }
}

function materializeAuthenticatedRuntime(request) {
  if (request.repository !== canonicalRepository || request.branch !== canonicalBranch || !oidPattern.test(request.sourceCommit)
      || !oidPattern.test(request.sourceTree)) throw new Error("generator canonical source authority required");
  const rootInfo = lstatSync(request.repositoryRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || rootInfo.uid !== process.getuid?.()
      || realpathSync(request.repositoryRoot) !== request.repositoryRoot || (rootInfo.mode & 0o022) !== 0) throw new Error("generator repository root unsafe");
  const env = {
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin",
  };
  const git = (args, encoding = "utf8") => run("/usr/bin/git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "http.extraHeader=", "-C", request.repositoryRoot, ...args], { cwd: "/", env, encoding });
  if (git(["rev-parse", "--is-shallow-repository"]).trim() !== "false"
      || git(["rev-parse", "HEAD^{commit}"]).trim() !== request.sourceCommit
      || git(["symbolic-ref", "--short", "HEAD"]).trim() !== request.branch
      || git(["rev-parse", `refs/heads/${request.branch}^{commit}`]).trim() !== request.sourceCommit
      || git(["rev-parse", `refs/remotes/origin/${request.branch}^{commit}`]).trim() !== request.sourceCommit
      || git(["rev-parse", `${request.sourceCommit}^{tree}`]).trim() !== request.sourceTree
      || git(["remote", "get-url", "origin"]).trim() !== `https://github.com/${request.repository}.git`
      || git(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") throw new Error("generator exact Git source binding mismatch");
  const advertised = run("/usr/bin/git", ["-c", "credential.helper=", "-c", "http.extraHeader=", "ls-remote", "--exit-code", `https://github.com/${request.repository}.git`, `refs/heads/${request.branch}`], { cwd: "/", env, encoding: "utf8" });
  if (advertised !== `${request.sourceCommit}\trefs/heads/${request.branch}\n`) throw new Error("generator GitHub branch authentication mismatch");
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), "settleora-native-handoff-runtime-"));
  chmodSync(runtimeRoot, 0o700);
  try {
    for (const entry of runtimeFiles) {
      const oid = git(["rev-parse", `${request.sourceCommit}:${entry.source}`]).trim();
      if (!oidPattern.test(oid) || git(["cat-file", "-t", oid]).trim() !== "blob") throw new Error("generator runtime Git object invalid");
      const bytes = Buffer.from(git(["cat-file", "blob", oid], null));
      if (gitObjectOid(bytes) !== oid) throw new Error("generator runtime Git object identity mismatch");
      writePrivateRuntimeFile(runtimeRoot, entry.source, bytes, entry.mode);
    }
    fsyncDirectory(runtimeRoot);
    return runtimeRoot;
  } catch (error) {
    rmSync(runtimeRoot, { recursive: true });
    throw error;
  }
}

function writePrivateRuntimeFile(root, relative, bytes, mode) {
  let directory = root;
  for (const part of path.posix.dirname(relative).split("/").filter((value) => value !== ".")) {
    directory = path.join(directory, part);
    try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; }
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o700) throw new Error("generator runtime directory unsafe");
  }
  const target = path.join(root, relative);
  const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  chmodSync(target, mode);
  fsyncDirectory(directory);
}

function parseOptions(argv) {
  if (!Array.isArray(argv) || argv.length !== optionNames.size * 2) throw new Error("exact generation options required");
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!optionNames.has(argv[index]) || Object.hasOwn(result, argv[index]) || typeof argv[index + 1] !== "string" || argv[index + 1].length > 1024) throw new Error("generation option invalid");
    result[argv[index]] = argv[index + 1];
  }
  if (Object.keys(result).length !== optionNames.size || !path.isAbsolute(result["--repository-root"]) || !path.isAbsolute(result["--handoff-root"])) throw new Error("generation option set incomplete");
  return result;
}

function run(executable, args, options) {
  const child = spawnSync(executable, args, { ...options, maxBuffer: 32 * 1024 * 1024, timeout: 60_000 });
  if (child.status !== 0 || child.error || child.signal || child.stderr?.length) throw child.error || new Error("generator Git command failed");
  return child.stdout;
}
function gitObjectOid(bytes) { const value = Buffer.from(bytes); return createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex"); }
function fsyncDirectory(target) { const fd = openSync(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }

if (process.argv[1] === "-" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) process.exitCode = await main();
