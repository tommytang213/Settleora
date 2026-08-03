#!/usr/bin/python3
"""Fixed-purpose Linux renameat2 boundary for native producer publication.

Production accepts exactly one sealed root below a root-only staging container
and the fixed final root, or one closed-schema root-result transition inside
the fixed result directory. The self-test accepts no paths and exists only to exercise the real
Node/Python transport and kernel primitive without touching the protected root.
"""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import os
import re
import stat
import sys
import tempfile

FINAL = "/etc/settleora-auto-runner/semantic-recovery-authority"
PARENT = "/etc/settleora-auto-runner"
RESULT_ROOT = "/etc/settleora-auto-runner/.semantic-recovery-native-install-results"
STAGE = re.compile(r"^\.semantic-recovery-authority\.install-[a-z0-9][a-z0-9._:-]{7,127}$")
RESULT_TEMP = re.compile(r"^\.[a-f0-9]{64}\.[a-f0-9]{24}\.tmp$")
RESULT_FINAL = re.compile(r"^[a-f0-9]{64}\.[1-9][0-9]*\.[a-f0-9]{64}\.json$")
AT_FDCWD = -100
RENAME_NOREPLACE = 1
LIBC = ctypes.CDLL(None, use_errno=True)


def rename_noreplace(source: str, destination: str) -> None:
    result = LIBC.renameat2(
        ctypes.c_int(AT_FDCWD), os.fsencode(source),
        ctypes.c_int(AT_FDCWD), os.fsencode(destination),
        ctypes.c_uint(RENAME_NOREPLACE),
    )
    if result != 0:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise RuntimeError("native_install_destination_exists")
        raise RuntimeError("native_install_rename_noreplace_failed")


def production(source: str, destination: str) -> int:
    if os.getuid() != 0 or os.geteuid() != 0 or os.getgid() != 0 or os.getegid() != 0:
        raise RuntimeError("native_install_root_identity_required")
    container = os.path.dirname(source)
    if (destination != FINAL or os.path.basename(source) != "root"
            or os.path.dirname(container) != PARENT or STAGE.fullmatch(os.path.basename(container)) is None):
        raise RuntimeError("native_install_fixed_paths_required")
    parent = os.lstat(PARENT)
    private_container = os.lstat(container)
    staged = os.lstat(source)
    if (not stat.S_ISDIR(parent.st_mode) or stat.S_ISLNK(parent.st_mode) or parent.st_uid != 0 or parent.st_gid != 0
            or parent.st_mode & 0o022 or os.path.realpath(PARENT) != PARENT
            or not stat.S_ISDIR(private_container.st_mode) or stat.S_ISLNK(private_container.st_mode)
            or private_container.st_uid != 0 or private_container.st_gid != 0
            or stat.S_IMODE(private_container.st_mode) != 0o700 or os.path.realpath(container) != container
            or os.listdir(container) != ["root"]
            or not stat.S_ISDIR(staged.st_mode) or stat.S_ISLNK(staged.st_mode) or staged.st_uid != 0 or staged.st_gid != 0
            or stat.S_IMODE(staged.st_mode) != 0o755 or os.path.realpath(source) != source or os.path.lexists(destination)):
        raise RuntimeError("native_install_publication_boundary_unsafe")
    rename_noreplace(source, destination)
    return 0


def root_result(source: str, destination: str) -> int:
    if os.getuid() != 0 or os.geteuid() != 0 or os.getgid() != 0 or os.getegid() != 0:
        raise RuntimeError("native_install_root_identity_required")
    if (os.path.dirname(source) != RESULT_ROOT or os.path.dirname(destination) != RESULT_ROOT
            or RESULT_TEMP.fullmatch(os.path.basename(source)) is None
            or RESULT_FINAL.fullmatch(os.path.basename(destination)) is None):
        raise RuntimeError("native_install_result_fixed_paths_required")
    directory = os.lstat(RESULT_ROOT)
    staged = os.lstat(source)
    if (not stat.S_ISDIR(directory.st_mode) or stat.S_ISLNK(directory.st_mode)
            or directory.st_uid != 0 or directory.st_gid != 0 or directory.st_mode & 0o022
            or os.path.realpath(RESULT_ROOT) != RESULT_ROOT
            or not stat.S_ISREG(staged.st_mode) or stat.S_ISLNK(staged.st_mode)
            or staged.st_uid != 0 or staged.st_gid != 0 or stat.S_IMODE(staged.st_mode) != 0o444
            or staged.st_nlink != 1 or staged.st_size < 1 or staged.st_size > 64 * 1024
            or os.path.realpath(source) != source or os.path.lexists(destination)):
        raise RuntimeError("native_install_result_publication_boundary_unsafe")
    rename_noreplace(source, destination)
    return 0


def self_test() -> int:
    payload = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    if not payload or len(payload) > 8 * 1024 * 1024:
        raise RuntimeError("native_install_self_test_payload_invalid")
    with tempfile.TemporaryDirectory(prefix="settleora-native-rename-self-test-") as root:
        source = os.path.join(root, "source")
        destination = os.path.join(root, "destination")
        os.mkdir(source, 0o700)
        with open(os.path.join(source, "package.bin"), "xb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        rename_noreplace(source, destination)
        with open(os.path.join(destination, "package.bin"), "rb") as stream:
            readback = stream.read()
        if readback != payload or os.path.lexists(source):
            raise RuntimeError("native_install_self_test_readback_failed")
        result = {
            "byteCount": len(payload),
            "reasonCode": "native_install_python_rename_noreplace_verified",
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
        sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n")
    return 0


def main() -> int:
    if sys.argv == [sys.argv[0], "--self-test"]:
        return self_test()
    if len(sys.argv) == 4 and sys.argv[1] == "--root-result":
        return root_result(sys.argv[2], sys.argv[3])
    if len(sys.argv) == 3:
        return production(sys.argv[1], sys.argv[2])
    raise RuntimeError("native_install_rename_noreplace_arguments_invalid")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"native install publication blocked: {error}\n")
        raise SystemExit(1)
