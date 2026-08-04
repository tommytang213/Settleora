#!/usr/bin/python3
"""Fixed-purpose Linux renameat2 boundary for native producer publication.

Production accepts no caller-selected paths. It discovers exactly one sealed root below the fixed root-only parent,
authenticates it through directory descriptors, and publishes it to the sole
name derived by the closed protocol. Small append-only root-result records use
the source-owned same-directory hard-link protocol and never cross this
interpreter boundary. The self-test accepts no paths and exists only to exercise the real
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

PARENT = "/etc/settleora-auto-runner"
FINAL_NAME = "semantic-recovery-authority"
STAGE = re.compile(r"^\.semantic-recovery-authority\.install-[a-z0-9][a-z0-9._:-]{7,127}$")
RENAME_NOREPLACE = 1
LIBC = ctypes.CDLL(None, use_errno=True)
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def rename_noreplace_at(source_fd: int, source_name: str,
                        destination_fd: int, destination_name: str) -> None:
    result = LIBC.renameat2(
        ctypes.c_int(source_fd), os.fsencode(source_name),
        ctypes.c_int(destination_fd), os.fsencode(destination_name),
        ctypes.c_uint(RENAME_NOREPLACE),
    )
    if result != 0:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise RuntimeError("native_install_destination_exists")
        raise RuntimeError("native_install_rename_noreplace_failed")


def assert_root_directory(value: os.stat_result, mode: int | None = None) -> None:
    if (not stat.S_ISDIR(value.st_mode) or value.st_uid != 0 or value.st_gid != 0
            or value.st_mode & 0o022 or (mode is not None and stat.S_IMODE(value.st_mode) != mode)):
        raise RuntimeError("native_install_publication_directory_unsafe")


def stat_matches(left: os.stat_result, right: os.stat_result) -> bool:
    return left.st_dev == right.st_dev and left.st_ino == right.st_ino


def entry_absent(directory_fd: int, name: str) -> bool:
    # The caller supplies only source-owned closed names. Membership comparison
    # avoids reopening a caller-derived pathname; renameat2 remains the atomic
    # no-clobber authority if the directory changes after this observation.
    return name not in os.listdir(directory_fd)


def production() -> int:
    if os.getuid() != 0 or os.geteuid() != 0 or os.getgid() != 0 or os.getegid() != 0:
        raise RuntimeError("native_install_root_identity_required")
    parent_fd = os.open(PARENT, DIRECTORY_FLAGS)
    try:
        assert_root_directory(os.fstat(parent_fd))
        if os.path.realpath(PARENT) != PARENT:
            raise RuntimeError("native_install_publication_boundary_unsafe")
        stage_names = sorted(name for name in os.listdir(parent_fd) if STAGE.fullmatch(name) is not None)
        if len(stage_names) != 1 or not entry_absent(parent_fd, FINAL_NAME):
            raise RuntimeError("native_install_publication_boundary_unsafe")
        stage_name = stage_names[0]
        stage_path_stat = os.stat(stage_name, dir_fd=parent_fd, follow_symlinks=False)
        stage_fd = os.open(stage_name, DIRECTORY_FLAGS, dir_fd=parent_fd)
        try:
            stage_fd_stat = os.fstat(stage_fd)
            assert_root_directory(stage_fd_stat, 0o700)
            if not stat_matches(stage_path_stat, stage_fd_stat) or os.listdir(stage_fd) != ["root"]:
                raise RuntimeError("native_install_publication_boundary_unsafe")
            root_path_stat = os.stat("root", dir_fd=stage_fd, follow_symlinks=False)
            root_fd = os.open("root", DIRECTORY_FLAGS, dir_fd=stage_fd)
            try:
                root_fd_stat = os.fstat(root_fd)
                assert_root_directory(root_fd_stat, 0o755)
                if not stat_matches(root_path_stat, root_fd_stat):
                    raise RuntimeError("native_install_publication_boundary_unsafe")
            finally:
                os.close(root_fd)
            rename_noreplace_at(stage_fd, "root", parent_fd, FINAL_NAME)
            os.fsync(stage_fd)
            os.fsync(parent_fd)
        finally:
            os.close(stage_fd)
    finally:
        os.close(parent_fd)
    return 0


def self_test() -> int:
    payload = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    if not payload or len(payload) > 8 * 1024 * 1024:
        raise RuntimeError("native_install_self_test_payload_invalid")
    with tempfile.TemporaryDirectory(prefix="settleora-native-rename-self-test-") as root:
        root_fd = os.open(root, DIRECTORY_FLAGS)
        try:
            os.mkdir("source", 0o700, dir_fd=root_fd)
            source_fd = os.open("source", DIRECTORY_FLAGS, dir_fd=root_fd)
            try:
                package_fd = os.open("package.bin", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=source_fd)
                try:
                    os.write(package_fd, payload)
                    os.fsync(package_fd)
                finally:
                    os.close(package_fd)
            finally:
                os.close(source_fd)
            rename_noreplace_at(root_fd, "source", root_fd, "destination")
            destination_fd = os.open("destination", DIRECTORY_FLAGS, dir_fd=root_fd)
            try:
                package_fd = os.open("package.bin", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=destination_fd)
                try:
                    readback = os.read(package_fd, len(payload) + 1)
                finally:
                    os.close(package_fd)
            finally:
                os.close(destination_fd)
            if readback != payload or not entry_absent(root_fd, "source"):
                raise RuntimeError("native_install_self_test_readback_failed")

        finally:
            os.close(root_fd)
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
    if sys.argv == [sys.argv[0], "--publish-root"]:
        return production()
    raise RuntimeError("native_install_rename_noreplace_arguments_invalid")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"native install publication blocked: {error}\n")
        raise SystemExit(1)
