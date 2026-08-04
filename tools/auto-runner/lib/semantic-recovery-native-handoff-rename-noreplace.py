#!/usr/bin/python3
"""Atomic no-clobber publication for an unprivileged generated handoff directory."""
from __future__ import annotations

import ctypes
import errno
import os
import re
import stat
import sys

RENAME_NOREPLACE = 1
LIBC = ctypes.CDLL(None, use_errno=True)
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$")
STAGE = re.compile(r"^\.settleora-native-handoff\.[A-Za-z0-9._-]{16,200}\.stage$")


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] != "--publish-fd3":
        raise RuntimeError("handoff_publication_arguments_invalid")
    stage, final = sys.argv[2:]
    if not STAGE.fullmatch(stage) or not NAME.fullmatch(final):
        raise RuntimeError("handoff_publication_path_invalid")
    parent_fd = 3
    try:
        parent_stat = os.fstat(parent_fd)
        if not stat.S_ISDIR(parent_stat.st_mode) or parent_stat.st_uid != os.getuid() or parent_stat.st_gid != os.getgid() or parent_stat.st_mode & 0o022:
            raise RuntimeError("handoff_publication_parent_unsafe")
        stage_stat = os.stat(stage, dir_fd=parent_fd, follow_symlinks=False)
        if not stat.S_ISDIR(stage_stat.st_mode) or stage_stat.st_uid != os.getuid() or stage_stat.st_gid != os.getgid() or stat.S_IMODE(stage_stat.st_mode) != 0o700:
            raise RuntimeError("handoff_publication_stage_unsafe")
        result = LIBC.renameat2(parent_fd, os.fsencode(stage), parent_fd, os.fsencode(final), RENAME_NOREPLACE)
        if result != 0:
            code = ctypes.get_errno()
            if code in (errno.EEXIST, errno.ENOTEMPTY):
                raise RuntimeError("handoff_publication_destination_exists")
            raise RuntimeError("handoff_publication_rename_failed")
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"handoff publication blocked: {error}\n")
        raise SystemExit(1)
