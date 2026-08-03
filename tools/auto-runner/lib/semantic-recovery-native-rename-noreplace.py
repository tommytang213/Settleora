#!/usr/bin/python3
"""Fixed-purpose Linux renameat2 boundary for native producer publication.

Production accepts exactly one root-owned staging directory and the fixed final
root.  The self-test accepts no paths and exists only to exercise the real
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
STAGE = re.compile(r"^\.semantic-recovery-authority\.install-[a-z0-9][a-z0-9._:-]{7,127}$")
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
    if destination != FINAL or os.path.dirname(source) != PARENT or STAGE.fullmatch(os.path.basename(source)) is None:
        raise RuntimeError("native_install_fixed_paths_required")
    parent = os.lstat(PARENT)
    staged = os.lstat(source)
    if (not stat.S_ISDIR(parent.st_mode) or stat.S_ISLNK(parent.st_mode) or parent.st_uid != 0 or parent.st_gid != 0
            or parent.st_mode & 0o022 or os.path.realpath(PARENT) != PARENT
            or not stat.S_ISDIR(staged.st_mode) or stat.S_ISLNK(staged.st_mode) or staged.st_uid != 0 or staged.st_gid != 0
            or os.path.realpath(source) != source or os.path.lexists(destination)):
        raise RuntimeError("native_install_publication_boundary_unsafe")
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
    if len(sys.argv) == 3:
        return production(sys.argv[1], sys.argv[2])
    raise RuntimeError("native_install_rename_noreplace_arguments_invalid")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"native install publication blocked: {error}\n")
        raise SystemExit(1)
