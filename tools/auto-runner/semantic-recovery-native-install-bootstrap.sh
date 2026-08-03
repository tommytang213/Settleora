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

[[ "$handoff_mode" == install || "$handoff_mode" == recover_readback ]] || block
controller_mode='--root-bootstrap'
[[ "$handoff_mode" == install ]] || controller_mode='--root-bootstrap-recover'
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

if [[ "$handoff_mode" == install && ! -e /etc/settleora-auto-runner ]]; then
  /usr/bin/mkdir --mode=0755 /etc/settleora-auto-runner
  /usr/bin/chown 0:0 /etc/settleora-auto-runner
  /usr/bin/chmod 0755 /etc/settleora-auto-runner
  /usr/bin/sync -f /etc
fi
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a' /etc/settleora-auto-runner)" == 'directory:0:0:755' ]] || block
if [[ "$handoff_mode" == install && ! -e "$root_state_root" ]]; then
  /usr/bin/mkdir --mode=0700 "$root_state_root"
  /usr/bin/chown 0:0 "$root_state_root"
  /usr/bin/chmod 0700 "$root_state_root"
  /usr/bin/sync -f /etc/settleora-auto-runner
fi
[[ "$(/usr/bin/stat -Lc '%F:%u:%g:%a' "$root_state_root")" == 'directory:0:0:700' ]] || block

# Freeze the exact armed owner transition before any network or source work.
# The owner journal is correlation evidence only; no installation authority is
# read from it. The authenticated bootstrap passes its embedded helper on stdin;
# no unprivileged program bytes enter root. Stable directory/file descriptors,
# O_NOFOLLOW, bounded reads, fstat equality, exclusive regular destinations and
# descriptor fsync prevent pathname substitution, symlink effects and unbounded
# copies. A partial pair remains root-owned contradictory residue and blocks.
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
    os.unlink(temporary, dir_fd=directory_fd)

def read_root_file(directory_fd, name, maximum):
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
        "ownerJournalDigest": owner_digest,
        "ownerJournalSha256": owner_sha,
        "repository": repository,
        "sourceCommit": source_commit,
        "taskCorrelation": correlation,
        "version": 1,
    }
    receipt_bytes = canonical(receipt) + b"\n"
    root_directory_fd = os.open(root_state, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        root_info = os.fstat(root_directory_fd)
        if root_info.st_uid != 0 or root_info.st_gid != 0 or stat.S_IMODE(root_info.st_mode) != 0o700:
            raise ValueError("root journal directory unsafe")
        owner_name = f"{operation_id}.owner.json"
        receipt_name = f"{operation_id}.receipt.json"
        present = []
        for name in (owner_name, receipt_name):
            try:
                os.stat(name, dir_fd=root_directory_fd, follow_symlinks=False)
                present.append(name)
            except FileNotFoundError:
                pass
        if len(present) == 0 and handoff_mode == "install":
            nonce = f"{os.getpid()}.{secrets.token_hex(12)}"
            write_root_file(root_directory_fd, f".{operation_id}.owner.{nonce}.tmp", owner_name, owner_bytes)
            write_root_file(root_directory_fd, f".{operation_id}.receipt.{nonce}.tmp", receipt_name, receipt_bytes)
            os.fsync(root_directory_fd)
        elif len(present) != 2:
            raise ValueError("partial root receipt")
        frozen_owner = read_root_file(root_directory_fd, owner_name, MAXIMUM_JOURNAL_BYTES)
        frozen_receipt = read_root_file(root_directory_fd, receipt_name, MAXIMUM_JOURNAL_BYTES)
        if frozen_owner != owner_bytes:
            raise ValueError("root owner snapshot mismatch")
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
        if handoff_mode == "recover_readback":
            for name in (f"{operation_id}.json", f"{operation_id}.package.json"):
                info = os.stat(name, dir_fd=root_directory_fd, follow_symlinks=False)
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0
                        or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1
                        or info.st_size < 1 or info.st_size > 32 * 1024 * 1024):
                    raise ValueError("root recovery artifact unsafe")
        os.fsync(root_directory_fd)
    finally:
        os.close(root_directory_fd)
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
/usr/bin/git -c core.hooksPath=/dev/null -c credential.helper= -c http.followRedirects=false -c transfer.fsckObjects=true -c fetch.fsckObjects=true -C "$checkout_root" fetch --quiet --no-tags --depth=1 "$repository_url" "$source_commit"
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse 'FETCH_HEAD^{commit}')" == "$source_commit" ]] || block
/usr/bin/git -C "$checkout_root" remote add origin "$repository_url"
/usr/bin/git -C "$checkout_root" checkout --quiet --detach FETCH_HEAD
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$bootstrap_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" hash-object "$bootstrap_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git hash-object -- "$trusted_path")" == "$bootstrap_blob" ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$controller_path")" =~ ^[a-f0-9]{40}$ ]] || block
[[ "$(/usr/bin/git -C "$checkout_root" hash-object "$controller_path")" == "$(/usr/bin/git -C "$checkout_root" rev-parse "$source_commit:$controller_path")" ]] || block
/usr/bin/git -C "$checkout_root" fsck --full --strict --no-dangling >/dev/null
/usr/bin/chown -R 0:0 "$checkout_root"
/usr/bin/chmod -R go-rwx "$checkout_root"

/usr/bin/printf '{"bootstrapBlob":"%s","contract":"settleora_semantic_recovery_native_install_source","repository":"%s","sourceCommit":"%s","taskCorrelation":"%s","version":1}\n' \
  "$bootstrap_blob" "$repository" "$source_commit" "$task_correlation" \
  | /usr/bin/node "$checkout_root/$controller_path" "$controller_mode"
