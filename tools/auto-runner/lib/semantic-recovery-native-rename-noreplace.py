#!/usr/bin/python3
"""Fixed-purpose Linux renameat2 boundary for native producer publication.

Production accepts no caller-selected paths. It discovers exactly one sealed
root below the fixed root-only parent or one or more byte-identical sealed
root-result temporaries below the fixed result directory, authenticates them through
directory descriptors, and publishes it to the sole name derived by the closed
protocol. The self-test accepts no paths and exists only to exercise the real
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
RESULT_ROOT = "/etc/settleora-auto-runner/.semantic-recovery-native-install-results"
STAGE = re.compile(r"^\.semantic-recovery-authority\.install-[a-z0-9][a-z0-9._:-]{7,127}$")
RESULT_TEMP = re.compile(r"^\.[a-f0-9]{64}\.[a-f0-9]{24}\.tmp$")
DIGEST = re.compile(r"^[a-f0-9]{64}$")
SHA = re.compile(r"^[a-f0-9]{40}$")
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


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def read_root_result_temporary(directory_fd: int, source_name: str,
                               expected_uid: int, expected_gid: int) -> tuple[bytes, str]:
    operation_from_name = source_name.split(".")[1]
    source_path_stat = os.stat(source_name, dir_fd=directory_fd, follow_symlinks=False)
    source_fd = os.open(source_name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory_fd)
    try:
        before = os.fstat(source_fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != expected_uid or before.st_gid != expected_gid
                or stat.S_IMODE(before.st_mode) != 0o444 or before.st_nlink != 1
                or before.st_size < 1 or before.st_size > 64 * 1024
                or not stat_matches(source_path_stat, before)):
            raise RuntimeError("native_install_result_publication_boundary_unsafe")
        payload = os.read(source_fd, 64 * 1024 + 1)
        after = os.fstat(source_fd)
        if not stat_matches(before, after) or before.st_size != after.st_size or len(payload) != before.st_size:
            raise RuntimeError("native_install_result_publication_boundary_unsafe")
    finally:
        os.close(source_fd)
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("native_install_result_payload_invalid") from error
    required = {
        "contract", "version", "correlation", "repository", "sourceCommit", "operationId", "state",
        "outcome", "reasonCode", "planDigest", "installedDigest", "rootJournalDigest", "rootJournalSequence",
    }
    if (not isinstance(value, dict) or set(value) != required or canonical_json(value) != payload
            or value.get("contract") != "settleora_semantic_recovery_native_install_root_result"
            or value.get("version") != 2 or DIGEST.fullmatch(str(value.get("operationId", ""))) is None
            or value.get("operationId") != operation_from_name
            or DIGEST.fullmatch(str(value.get("rootJournalDigest", ""))) is None
            or SHA.fullmatch(str(value.get("sourceCommit", ""))) is None
            or not isinstance(value.get("rootJournalSequence"), int)
            or isinstance(value.get("rootJournalSequence"), bool) or value["rootJournalSequence"] < 1):
        raise RuntimeError("native_install_result_payload_invalid")
    destination_name = f'{value["operationId"]}.{value["rootJournalSequence"]}.{value["rootJournalDigest"]}.json'
    return payload, destination_name


def publish_root_result_at(directory_fd: int, expected_uid: int, expected_gid: int,
                           operation_id: str) -> tuple[str, bytes]:
    if DIGEST.fullmatch(operation_id) is None:
        raise RuntimeError("native_install_result_operation_invalid")
    prefix = f".{operation_id}."
    temporary_names = sorted(name for name in os.listdir(directory_fd)
                             if name.startswith(prefix) and RESULT_TEMP.fullmatch(name) is not None)
    if not temporary_names:
        raise RuntimeError("native_install_result_publication_boundary_unsafe")
    authenticated = [read_root_result_temporary(directory_fd, name, expected_uid, expected_gid)
                     for name in temporary_names]
    payload, destination_name = authenticated[0]
    if any(candidate_payload != payload or candidate_destination != destination_name
           for candidate_payload, candidate_destination in authenticated[1:]):
        raise RuntimeError("native_install_result_temporary_conflict")
    for duplicate in temporary_names[1:]:
        os.unlink(duplicate, dir_fd=directory_fd)
        os.fsync(directory_fd)
    source_name = temporary_names[0]
    if not entry_absent(directory_fd, destination_name):
        raise RuntimeError("native_install_result_publication_boundary_unsafe")
    rename_noreplace_at(directory_fd, source_name, directory_fd, destination_name)
    os.fsync(directory_fd)
    return destination_name, payload


def root_result(operation_id: str) -> int:
    if os.getuid() != 0 or os.geteuid() != 0 or os.getgid() != 0 or os.getegid() != 0:
        raise RuntimeError("native_install_root_identity_required")
    directory_fd = os.open(RESULT_ROOT, DIRECTORY_FLAGS)
    try:
        assert_root_directory(os.fstat(directory_fd))
        if os.path.realpath(RESULT_ROOT) != RESULT_ROOT:
            raise RuntimeError("native_install_result_publication_boundary_unsafe")
        publish_root_result_at(directory_fd, 0, 0, operation_id)
    finally:
        os.close(directory_fd)
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

            result_value = {
                "contract": "settleora_semantic_recovery_native_install_root_result",
                "version": 2,
                "correlation": "issue-1012-self-test",
                "repository": "example/repo",
                "sourceCommit": "a" * 40,
                "operationId": "b" * 64,
                "state": "blocked",
                "outcome": "blocked",
                "reasonCode": "native_install_self_test_blocked",
                "planDigest": None,
                "installedDigest": None,
                "rootJournalDigest": "c" * 64,
                "rootJournalSequence": 1,
            }
            result_payload = canonical_json(result_value)
            os.mkdir("results", 0o700, dir_fd=root_fd)
            results_fd = os.open("results", DIRECTORY_FLAGS, dir_fd=root_fd)
            try:
                for suffix in ("1" * 24, "2" * 24):
                    temporary_name = f'.{result_value["operationId"]}.{suffix}.tmp'
                    temporary_fd = os.open(temporary_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                           0o400, dir_fd=results_fd)
                    try:
                        os.write(temporary_fd, result_payload)
                        os.fsync(temporary_fd)
                    finally:
                        os.close(temporary_fd)
                    os.chmod(temporary_name, 0o444, dir_fd=results_fd, follow_symlinks=False)
                other_value = dict(result_value, operationId="d" * 64, rootJournalDigest="e" * 64)
                other_name = f'.{other_value["operationId"]}.{"5" * 24}.tmp'
                other_fd = os.open(other_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                   0o400, dir_fd=results_fd)
                try:
                    os.write(other_fd, canonical_json(other_value))
                    os.fsync(other_fd)
                finally:
                    os.close(other_fd)
                os.chmod(other_name, 0o444, dir_fd=results_fd, follow_symlinks=False)
                other_before = os.stat(other_name, dir_fd=results_fd, follow_symlinks=False)
                result_name, published_payload = publish_root_result_at(
                    results_fd, os.getuid(), os.getgid(), result_value["operationId"])
                other_after = os.stat(other_name, dir_fd=results_fd, follow_symlinks=False)
                if (published_payload != result_payload
                        or sorted(os.listdir(results_fd)) != sorted([result_name, other_name])
                        or not stat_matches(other_before, other_after)
                        or read_root_result_temporary(results_fd, other_name, os.getuid(), os.getgid())[0] != canonical_json(other_value)):
                    raise RuntimeError("native_install_result_coalescing_self_test_failed")
            finally:
                os.close(results_fd)
            os.mkdir("conflicting-results", 0o700, dir_fd=root_fd)
            conflict_fd = os.open("conflicting-results", DIRECTORY_FLAGS, dir_fd=root_fd)
            try:
                for suffix, reason in (("3" * 24, "native_install_first_blocker"),
                                       ("4" * 24, "native_install_second_blocker")):
                    conflicting_value = dict(result_value, reasonCode=reason)
                    temporary_name = f'.{result_value["operationId"]}.{suffix}.tmp'
                    temporary_fd = os.open(temporary_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                           0o400, dir_fd=conflict_fd)
                    try:
                        os.write(temporary_fd, canonical_json(conflicting_value))
                        os.fsync(temporary_fd)
                    finally:
                        os.close(temporary_fd)
                    os.chmod(temporary_name, 0o444, dir_fd=conflict_fd, follow_symlinks=False)
                conflict_names = sorted(os.listdir(conflict_fd))
                try:
                    publish_root_result_at(conflict_fd, os.getuid(), os.getgid(), result_value["operationId"])
                    raise RuntimeError("native_install_result_conflict_self_test_failed")
                except RuntimeError as error:
                    if str(error) != "native_install_result_temporary_conflict":
                        raise
                if sorted(os.listdir(conflict_fd)) != conflict_names:
                    raise RuntimeError("native_install_result_conflict_residue_changed")
            finally:
                os.close(conflict_fd)
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
    if len(sys.argv) == 3 and sys.argv[1] == "--root-result" and DIGEST.fullmatch(sys.argv[2]) is not None:
        return root_result(sys.argv[2])
    if sys.argv == [sys.argv[0], "--publish-root"]:
        return production()
    raise RuntimeError("native_install_rename_noreplace_arguments_invalid")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"native install publication blocked: {error}\n")
        raise SystemExit(1)
