import { createHash } from "node:crypto";
import { nativeInstallTrustedBootstrapPath } from "./semantic-recovery-native-install-journal.mjs";

const shaPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const correlationPattern = /^[a-z0-9][a-z0-9._:-]{7,127}$/u;

// This fixed source-owned program is the only additional root-executed surface
// admitted by the trusted interactive operator model. It authenticates main and
// the selected bootstrap blob independently before atomically advancing the
// fixed root trust anchor, then execs that anchor. No checkout path or program
// bytes are accepted from the caller at runtime.
export const localNativeBootstrapProgram = String.raw`import hashlib
import os
import re
import stat
import subprocess
import sys

TARGET = "/usr/libexec/settleora-semantic-recovery-native-install-bootstrap"
REMOTE = "https://github.com/tommytang213/Settleora.git"
BOOTSTRAP_PATH = "tools/auto-runner/semantic-recovery-native-install-bootstrap.sh"
ENV = {"GIT_CONFIG_GLOBAL":"/dev/null","GIT_CONFIG_NOSYSTEM":"1","GIT_TERMINAL_PROMPT":"0","HOME":"/root","LANG":"C","LC_ALL":"C","PATH":"/usr/bin:/bin","TZ":"UTC"}

def block():
    raise SystemExit("local native bootstrap blocked")

def run(argv, cwd="/"):
    result = subprocess.run(argv, cwd=cwd, env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False)
    if result.returncode != 0 or len(result.stdout) > 16 * 1024 * 1024:
        block()
    return result.stdout

def write_all(fd, data):
    offset = 0
    while offset < len(data):
        written = os.write(fd, data[offset:])
        if written < 1:
            block()
        offset += written

def blob_oid(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

if len(sys.argv) != 8 or os.getuid() != 0 or os.getgid() != 0:
    block()
mode, commit, blob, correlation, operation, owner_digest, owner_sha = sys.argv[1:]
if mode != "install" or not re.fullmatch(r"[a-f0-9]{40}", commit) or not re.fullmatch(r"[a-f0-9]{40}", blob) or not re.fullmatch(r"[a-z0-9][a-z0-9._:-]{7,127}", correlation) or not re.fullmatch(r"[a-f0-9]{64}", operation) or not re.fullmatch(r"[a-f0-9]{64}", owner_digest) or not re.fullmatch(r"[a-f0-9]{64}", owner_sha):
    block()

parent = os.open("/usr/libexec", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    parent_info = os.fstat(parent)
    if not stat.S_ISDIR(parent_info.st_mode) or parent_info.st_uid != 0 or parent_info.st_gid != 0 or stat.S_IMODE(parent_info.st_mode) not in (0o755, 0o555):
        block()
    try:
        current_fd = os.open(os.path.basename(TARGET), os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    except FileNotFoundError:
        current_fd = None
    current = None
    if current_fd is not None:
        try:
            info = os.fstat(current_fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o555 or info.st_size < 1 or info.st_size > 1024 * 1024:
                block()
            current = os.read(current_fd, info.st_size + 1)
            if len(current) != info.st_size:
                block()
        finally:
            os.close(current_fd)

    advertised = run(["/usr/bin/git","-c","credential.helper=","-c","http.extraHeader=","-c","http.followRedirects=false","-c","protocol.file.allow=never","-c","protocol.ext.allow=never","ls-remote","--exit-code",REMOTE,"refs/heads/main"])
    if advertised != (commit + "\trefs/heads/main\n").encode("ascii"):
        block()
    checkout = "/tmp/settleora-local-native-bootstrap-" + operation
    os.mkdir(checkout, 0o700)
    try:
        run(["/usr/bin/git","init","--quiet"], checkout)
        run(["/usr/bin/git","-c","credential.helper=","-c","http.extraHeader=","-c","http.followRedirects=false","-c","protocol.file.allow=never","-c","protocol.ext.allow=never","fetch","--quiet","--no-tags","--depth=1",REMOTE,commit], checkout)
        fetched = run(["/usr/bin/git","rev-parse","FETCH_HEAD^{commit}"], checkout)
        if fetched != (commit + "\n").encode("ascii"):
            block()
        run(["/usr/bin/git","fsck","--full","--strict","--no-dangling"], checkout)
        selected = run(["/usr/bin/git","rev-parse",commit + ":" + BOOTSTRAP_PATH], checkout)
        if selected != (blob + "\n").encode("ascii"):
            block()
        candidate = run(["/usr/bin/git","cat-file","blob",blob], checkout)
        if blob_oid(candidate) != blob or not candidate.startswith(b"#!/usr/bin/bash\n"):
            block()
    finally:
        subprocess.run(["/usr/bin/rm","-rf","--",checkout], cwd="/", env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

    if current != candidate:
        temporary = ".settleora-semantic-recovery-native-install-bootstrap." + operation + ".tmp"
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o500, dir_fd=parent)
        try:
            write_all(fd, candidate)
            os.fsync(fd)
            os.fchown(fd, 0, 0)
            os.fchmod(fd, 0o555)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temporary, os.path.basename(TARGET), src_dir_fd=parent, dst_dir_fd=parent)
        os.fsync(parent)
finally:
    os.close(parent)

target_info = os.lstat(TARGET)
with open(TARGET, "rb", buffering=0) as stream:
    installed = stream.read(1024 * 1024 + 1)
if not stat.S_ISREG(target_info.st_mode) or target_info.st_uid != 0 or target_info.st_gid != 0 or target_info.st_nlink != 1 or stat.S_IMODE(target_info.st_mode) != 0o555 or blob_oid(installed) != blob:
    block()
os.execve(TARGET, [TARGET, mode, commit, blob, correlation, operation, owner_digest, owner_sha], ENV)
`;

export const localNativeBootstrapProgramSha256 = createHash("sha256").update(localNativeBootstrapProgram).digest("hex");

export function buildLocalNativeBootstrapSudoArgv({ sourceCommit, bootstrapBlob, correlation, operationId, ownerJournalDigest, ownerJournalSha256 } = {}) {
  if (!shaPattern.test(String(sourceCommit || "")) || !shaPattern.test(String(bootstrapBlob || ""))
      || !correlationPattern.test(String(correlation || "")) || !digestPattern.test(String(operationId || ""))
      || !digestPattern.test(String(ownerJournalDigest || "")) || !digestPattern.test(String(ownerJournalSha256 || ""))) {
    throw new Error("local native bootstrap sudo identity invalid");
  }
  return Object.freeze([
    "/usr/bin/sudo", "--", "/usr/bin/env", "-i",
    "HOME=/root", "LANG=C", "LC_ALL=C", "PATH=/usr/bin:/bin", "TZ=UTC",
    "/usr/bin/python3", "-I", "-c", localNativeBootstrapProgram,
    "install", sourceCommit, bootstrapBlob, correlation, operationId, ownerJournalDigest, ownerJournalSha256,
  ]);
}

export function validateLocalNativeBootstrapSudoBoundary({ argv, tty, stdioKind } = {}) {
  const expected = Array.isArray(argv) && argv.length === 20
    ? buildLocalNativeBootstrapSudoArgv({
      sourceCommit: argv.at(-6), bootstrapBlob: argv.at(-5), correlation: argv.at(-4), operationId: argv.at(-3),
      ownerJournalDigest: argv.at(-2), ownerJournalSha256: argv.at(-1),
    })
    : null;
  if (JSON.stringify(argv) !== JSON.stringify(expected) || tty !== true || stdioKind !== "real_tty_all_streams") {
    throw new Error("local native bootstrap sudo boundary invalid");
  }
  return { ok: true, reasonCode: "local_native_bootstrap_sudo_boundary_verified", programSha256: localNativeBootstrapProgramSha256 };
}

export function nativeBootstrapProspectiveChange(bootstrapBlob) {
  if (!shaPattern.test(String(bootstrapBlob || ""))) throw new Error("local native bootstrap blob invalid");
  return Object.freeze({ path: nativeInstallTrustedBootstrapPath, owner: "root", group: "root", mode: "0555", gitBlob: bootstrapBlob, atomic: true });
}
