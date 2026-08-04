#!/usr/bin/bash
# Trusted first-stage bootstrap. Before it may be named by sudo, these exact
# bytes must have been installed at the fixed path below by a separately
# authenticated OS/administrator channel. It accepts scalar identities only;
# no program, path, plan, manifest, environment, or authority bytes cross the
# unprivileged/root boundary.
set -euo pipefail
umask 077

trusted_path='/usr/libexec/settleora-semantic-recovery-native-install-bootstrap'
repository='tommytang213/Settleora'
repository_url='https://github.com/tommytang213/Settleora.git'
bootstrap_path='tools/auto-runner/semantic-recovery-native-install-bootstrap.sh'
controller_path='tools/auto-runner/semantic-recovery-native-install.mjs'
owner_journal_root='/workspace/logs/auto-runner/Settleora/manual-root-install-journals'
root_state_root='/etc/settleora-auto-runner/.semantic-recovery-native-install-journals'

block() {
  /usr/bin/printf '%s\n' 'native installation bootstrap blocked' >&2
  exit 1
}

[[ "$#" -eq 7 ]] || block
handoff_mode="$1"
source_commit="$2"
bootstrap_blob="$3"
task_correlation="$4"
operation_id="$5"
owner_journal_digest="$6"
owner_journal_sha256="$7"

[[ "$handoff_mode" == install ]] || block
controller_mode='--root-bootstrap'
[[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || block
[[ "$bootstrap_blob" =~ ^[a-f0-9]{40}$ ]] || block
[[ "$task_correlation" =~ ^[a-z0-9][a-z0-9._:-]{7,127}$ ]] || block
[[ "$operation_id" =~ ^[a-f0-9]{64}$ ]] || block
[[ "$owner_journal_digest" =~ ^[a-f0-9]{64}$ ]] || block
[[ "$owner_journal_sha256" =~ ^[a-f0-9]{64}$ ]] || block
[[ "$(/usr/bin/id -u)" == 0 && "$(/usr/bin/id -g)" == 0 ]] || block
[[ "$0" == "$trusted_path" ]] || block
[[ "$(/usr/bin/readlink -f -- "$0")" == "$trusted_path" ]] || block
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a:%h' -- "$trusted_path")" == 'regular file:0:0:555:1' ]] || block
[[ "$(/usr/bin/git hash-object -- "$trusted_path")" == "$bootstrap_blob" ]] || block

# Freeze the exact armed owner transition before any network or source work.
# The owner journal is correlation evidence only; no installation authority is
# read from it. The authenticated bootstrap passes its embedded helper on stdin;
# no unprivileged program bytes enter root. Stable directory/file descriptors,
# O_NOFOLLOW, bounded reads, fstat equality, exclusive regular destinations and
# descriptor fsync prevent pathname substitution, symlink effects and unbounded
# copies. The owner snapshot and receipt are one canonical atomic object, so no
# owner-only crash state can consume the one permitted sudo attempt.
if ! /usr/bin/python3 -I - \
  "$owner_journal_root" "$root_state_root" "$repository" "$source_commit" \
  "$bootstrap_blob" "$task_correlation" "$operation_id" \
  "$owner_journal_digest" "$owner_journal_sha256" "$handoff_mode" <<'PY'
import datetime
import hashlib
import json
import os
import secrets
import stat
import sys

MAXIMUM_JOURNAL_BYTES = 64 * 1024
MAXIMUM_RECEIPT_BYTES = 128 * 1024

def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()

def read_bounded(fd, maximum):
    chunks = []
    total = 0
    while True:
        chunk = os.read(fd, min(16 * 1024, maximum + 1 - total))
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)
        total += len(chunk)
        if total > maximum:
            raise ValueError("bounded read exceeded")

def same_file(left, right):
    fields = ("st_dev", "st_ino", "st_mode", "st_nlink", "st_uid", "st_gid", "st_size", "st_mtime_ns", "st_ctime_ns")
    return all(getattr(left, field) == getattr(right, field) for field in fields)

def write_root_file(directory_fd, temporary, final, payload):
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW
    fd = os.open(temporary, flags, 0o400, dir_fd=directory_fd)
    try:
        offset = 0
        while offset < len(payload):
            offset += os.write(fd, payload[offset:])
        os.fchown(fd, 0, 0)
        os.fchmod(fd, 0o400)
        os.fsync(fd)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o400 or info.st_nlink != 1 or info.st_size != len(payload):
            raise ValueError("root file metadata invalid")
    finally:
        os.close(fd)
    os.link(temporary, final, src_dir_fd=directory_fd, dst_dir_fd=directory_fd, follow_symlinks=False)
    os.fsync(directory_fd)
    os.unlink(temporary, dir_fd=directory_fd)
    os.fsync(directory_fd)

def read_root_file(directory_fd, name, maximum):
    pathname = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    if pathname.st_nlink == 2:
        role = "owner" if name == f"{operation_id}.owner.json" else "receipt" if name == f"{operation_id}.receipt.json" else None
        linked = [] if role is None else [
            entry for entry in os.listdir(directory_fd)
            if entry.startswith(f".{operation_id}.{role}.") and entry.endswith(".tmp")
            and same_file(os.stat(entry, dir_fd=directory_fd, follow_symlinks=False), pathname)
        ]
        if len(linked) != 1:
            raise ValueError("root file link recovery ambiguous")
        os.unlink(linked[0], dir_fd=directory_fd)
        os.fsync(directory_fd)
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    try:
        first = os.fstat(fd)
        if not stat.S_ISREG(first.st_mode) or first.st_uid != 0 or first.st_gid != 0 or stat.S_IMODE(first.st_mode) != 0o400 or first.st_nlink != 1 or first.st_size < 1 or first.st_size > maximum:
            raise ValueError("root file unsafe")
        payload = read_bounded(fd, maximum)
        second = os.fstat(fd)
        if not same_file(first, second) or len(payload) != first.st_size:
            raise ValueError("root file changed")
        return payload
    finally:
        os.close(fd)

def open_exact_root_directory(parent_fd, name, mode, create):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    try:
        fd = os.open(name, flags, dir_fd=parent_fd)
    except FileNotFoundError:
        if not create:
            raise
        os.mkdir(name, mode, dir_fd=parent_fd)
        fd = os.open(name, flags, dir_fd=parent_fd)
        os.fchown(fd, 0, 0)
        os.fchmod(fd, mode)
        os.fsync(fd)
        os.fsync(parent_fd)
    info = os.fstat(fd)
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != 0
            or stat.S_IMODE(info.st_mode) != mode):
        os.close(fd)
        raise ValueError("root journal directory unsafe")
    return fd

try:
    owner_root, root_state, repository, source_commit, bootstrap_blob, correlation, operation_id, owner_digest, owner_sha, handoff_mode = sys.argv[1:]
    owner_directory_fd = os.open(owner_root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        owner_fd = os.open(f"{operation_id}.json", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=owner_directory_fd)
        try:
            first = os.fstat(owner_fd)
            if not stat.S_ISREG(first.st_mode) or first.st_uid == 0 or stat.S_IMODE(first.st_mode) != 0o600 or first.st_nlink != 1 or first.st_size < 1 or first.st_size > MAXIMUM_JOURNAL_BYTES:
                raise ValueError("owner journal unsafe")
            owner_bytes = read_bounded(owner_fd, MAXIMUM_JOURNAL_BYTES)
            second = os.fstat(owner_fd)
            if not same_file(first, second) or len(owner_bytes) != first.st_size or hashlib.sha256(owner_bytes).hexdigest() != owner_sha:
                raise ValueError("owner journal changed")
        finally:
            os.close(owner_fd)
    finally:
        os.close(owner_directory_fd)

    owner = json.loads(owner_bytes)
    owner_core = dict(owner)
    journal_digest = owner_core.pop("journalDigest", None)
    if canonical(owner) + b"\n" != owner_bytes or journal_digest != owner_digest or hashlib.sha256(canonical(owner_core)).hexdigest() != owner_digest:
        raise ValueError("owner journal digest invalid")
    if owner.get("repository", "").lower() != repository.lower() or owner.get("sourceCommit") != source_commit or owner.get("correlation") != correlation or owner.get("operationId") != operation_id or owner.get("state") != "sudo_started" or owner.get("sudoAttemptCount") != 1:
        raise ValueError("owner journal correlation invalid")

    observed_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    receipt = {
        "bootstrapBlob": bootstrap_blob,
        "contract": "settleora_semantic_recovery_native_install_root_receipt",
        "observedAt": observed_at,
        "operationId": operation_id,
        "ownerJournal": owner,
        "ownerJournalDigest": owner_digest,
        "ownerJournalSha256": owner_sha,
        "repository": repository,
        "sourceCommit": source_commit,
        "taskCorrelation": correlation,
        "version": 1,
    }
    receipt_bytes = canonical(receipt) + b"\n"
    if root_state != "/etc/settleora-auto-runner/.semantic-recovery-native-install-journals":
        raise ValueError("root journal path invalid")
    etc_directory_fd = os.open("/etc", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        etc_info = os.fstat(etc_directory_fd)
        if not stat.S_ISDIR(etc_info.st_mode) or etc_info.st_uid != 0 or etc_info.st_gid != 0 or stat.S_IMODE(etc_info.st_mode) != 0o755:
            raise ValueError("root ancestor unsafe")
        parent_directory_fd = open_exact_root_directory(etc_directory_fd, "settleora-auto-runner", 0o755, handoff_mode == "install")
        try:
            root_directory_fd = open_exact_root_directory(parent_directory_fd, ".semantic-recovery-native-install-journals", 0o700, handoff_mode == "install")
            try:
                receipt_name = f"{operation_id}.receipt.json"
                try:
                    os.stat(receipt_name, dir_fd=root_directory_fd, follow_symlinks=False)
                    receipt_present = True
                except FileNotFoundError:
                    receipt_present = False
                if not receipt_present and handoff_mode == "install":
                    nonce = f"{os.getpid()}.{secrets.token_hex(12)}"
                    write_root_file(root_directory_fd, f".{operation_id}.receipt.{nonce}.tmp", receipt_name, receipt_bytes)
                    os.fsync(root_directory_fd)
                frozen_receipt = read_root_file(root_directory_fd, receipt_name, MAXIMUM_RECEIPT_BYTES)
                parsed_receipt = json.loads(frozen_receipt)
                if canonical(parsed_receipt) + b"\n" != frozen_receipt:
                    raise ValueError("root receipt noncanonical")
                expected_receipt = dict(receipt)
                expected_receipt["observedAt"] = parsed_receipt.get("observedAt")
                try:
                    datetime.datetime.fromisoformat(expected_receipt["observedAt"].replace("Z", "+00:00"))
                except Exception as error:
                    raise ValueError("root receipt timestamp invalid") from error
                if parsed_receipt != expected_receipt:
                    raise ValueError("root receipt mismatch")
                os.fsync(root_directory_fd)
            finally:
                os.close(root_directory_fd)
        finally:
            os.close(parent_directory_fd)
    finally:
        os.close(etc_directory_fd)
except Exception:
    sys.exit(1)
PY
then
  block
fi

checkout_root="$(/usr/bin/mktemp -d /var/tmp/settleora-native-install-git.XXXXXXXXXXXX)"
trap '/usr/bin/chmod -R 0000 "$checkout_root" 2>/dev/null || true; /usr/bin/rm -rf -- "$checkout_root"' EXIT HUP INT TERM
/usr/bin/chown 0:0 "$checkout_root"
/usr/bin/chmod 0700 "$checkout_root"
/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" init --quiet
/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" fetch --quiet --no-tags --depth=1 "$repository_url" refs/heads/main
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse 'FETCH_HEAD^{commit}')" == "$source_commit" ]] || block
/usr/bin/git -C "$checkout_root" remote add origin "$repository_url"
/usr/bin/git -C "$checkout_root" update-ref HEAD "$source_commit"
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$bootstrap_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git hash-object -- "$trusted_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$controller_path")" =~ ^[a-f0-9]{40}$ ]] || block
/usr/bin/git -C "$checkout_root" fsck --full --strict --no-dangling >/dev/null

# No fetched working-tree path is executed. This trusted embedded materializer
# walks the complete selected tree listing, rejects every non-regular member,
# recomputes every blob object identity, and writes only authenticated
# auto-runner bytes beneath the unique root-owned checkout. Node cannot follow
# a fetched symlink or import a byte sequence that was not checked first.
if ! /usr/bin/python3 -I - "$checkout_root" "$source_commit" <<'PY'
import hashlib
import os
import pathlib
import stat
import subprocess
import sys

MAXIMUM_BLOB_BYTES = 2 * 1024 * 1024
MAXIMUM_REPOSITORY_BYTES = 128 * 1024 * 1024

def git(root, arguments):
    environment = {
        "HOME": "/root", "LANG": "C", "LC_ALL": "C", "PATH": "/usr/bin:/bin",
        "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0",
    }
    result = subprocess.run(
        ["/usr/bin/git", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=",
         "-c", "http.followRedirects=false", "-C", root, *arguments],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=environment, timeout=30, check=False,
    )
    if result.returncode != 0 or result.stderr:
        raise ValueError("authenticated Git read failed")
    return result.stdout

def blob_oid(payload):
    return hashlib.sha1(b"blob " + str(len(payload)).encode("ascii") + b"\0" + payload).hexdigest()

try:
    root, source_commit = sys.argv[1:]
    listing = git(root, ["ls-tree", "-r", "-z", "--full-tree", source_commit])
    records = listing.split(b"\0")
    if records[-1] != b"":
        raise ValueError("tree listing truncated")
    records.pop()
    if not records:
        raise ValueError("tree listing empty")
    seen = set()
    materialized_directories = {pathlib.Path(root)}
    total = 0
    for record in records:
        header, separator, raw_path = record.partition(b"\t")
        fields = header.split(b" ")
        if not separator or len(fields) != 3:
            raise ValueError("tree listing invalid")
        mode, object_type, raw_oid = fields
        member_path = raw_path.decode("utf-8", "strict")
        parts = member_path.split("/")
        if (mode not in (b"100644", b"100755") or object_type != b"blob"
                or len(raw_oid) != 40 or any(byte not in b"0123456789abcdef" for byte in raw_oid)
                or not member_path or member_path.startswith("/") or "\\" in member_path or "\0" in member_path
                or any(part in ("", ".", "..", ".git") for part in parts)
                or member_path in seen or len(raw_path) > 4096 or any(len(part.encode()) > 255 for part in parts)):
            raise ValueError("tree member invalid")
        seen.add(member_path)
        payload = git(root, ["cat-file", "blob", raw_oid.decode("ascii")])
        total += len(payload)
        if len(payload) > MAXIMUM_BLOB_BYTES or total > MAXIMUM_REPOSITORY_BYTES or blob_oid(payload) != raw_oid.decode("ascii"):
            raise ValueError("blob identity invalid")
        if not member_path.startswith("tools/auto-runner/"):
            continue
        destination = pathlib.Path(root).joinpath(*parts)
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        cursor = destination.parent
        while cursor != pathlib.Path(root):
            materialized_directories.add(cursor)
            cursor = cursor.parent
        flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW
        descriptor = os.open(destination, flags, 0o500 if mode == b"100755" else 0o400)
        try:
            offset = 0
            while offset < len(payload):
                offset += os.write(descriptor, payload[offset:])
            os.fchown(descriptor, 0, 0)
            os.fchmod(descriptor, 0o500 if mode == b"100755" else 0o400)
            os.fsync(descriptor)
            info = os.fstat(descriptor)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0
                    or info.st_nlink != 1 or info.st_size != len(payload)):
                raise ValueError("materialized member unsafe")
        finally:
            os.close(descriptor)
    required = {
        "tools/auto-runner/semantic-recovery-native-install-bootstrap.sh",
        "tools/auto-runner/semantic-recovery-native-install.mjs",
    }
    if not required.issubset(seen):
        raise ValueError("required controller closure absent")
    for directory in sorted(materialized_directories, key=lambda value: len(value.parts), reverse=True):
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != 0:
                raise ValueError("materialized directory unsafe")
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
except Exception:
    sys.exit(1)
PY
then
  block
fi

[[ "$(/usr/bin/git -C "$checkout_root" hash-object --no-filters "$bootstrap_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" hash-object --no-filters "$controller_path")" == "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$controller_path")" ]] || block
/usr/bin/chown -R 0:0 "$checkout_root"
/usr/bin/chmod -R go-rwx "$checkout_root"
/usr/bin/sync -f "$checkout_root"
/usr/bin/sync -f /var/tmp

/usr/bin/printf '{"bootstrapBlob":"%s","contract":"settleora_semantic_recovery_native_install_source","repository":"%s","sourceCommit":"%s","taskCorrelation":"%s","version":1}\n' \
  "$bootstrap_blob" "$repository" "$source_commit" "$task_correlation" \
  | /usr/bin/node "$checkout_root/$controller_path" "$controller_mode"
