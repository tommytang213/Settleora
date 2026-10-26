"""Source-only, single-use native test run records. This module launches nothing.

The native runner owns process control. A run directory is private and unique;
logs remain there until an independently reviewed disposal decision. A failed
cleanup never authorizes another native attempt or a signal.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

HEX = re.compile(r"[0-9a-f]{64}\Z")
NAMES = frozenset({"emulator_stdout", "emulator_stderr", "anchor_stderr",
                   "flutter_stdout", "flutter_stderr", "census", "tool_result"})
CAP_BYTES = 4 * 1024 * 1024


def _write_once(path, value):
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(raw)
        out.flush()
        os.fsync(out.fileno())


def _bounded_json(path):
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or \
       st.st_nlink != 1 or st.st_size > 4096:
        raise RuntimeError("run record identity changed")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns) != \
           (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise RuntimeError("run record changed before read")
        data = os.read(fd, 4097)
        if len(data) != st.st_size or os.fstat(fd).st_mtime_ns != st.st_mtime_ns:
            raise RuntimeError("run record changed during read")
    finally:
        os.close(fd)
    return json.loads(data)


def prepare(root, *, source_sha256, packet_sha256, image_sha256, command_sha256):
    """Create one fresh private run. Inputs bind bytes, not mutable path labels."""
    pins = (source_sha256, packet_sha256, image_sha256, command_sha256)
    if any(not isinstance(pin, str) or HEX.fullmatch(pin) is None for pin in pins):
        raise ValueError("invalid run input digest")
    root = Path(root)
    parent = root.parent
    if any(stat.S_ISLNK(ancestor.lstat().st_mode) for ancestor in parent.parents) or \
       stat.S_ISLNK(parent.lstat().st_mode):
        raise RuntimeError("linked run ancestor")
    if not parent.is_dir() or parent.is_symlink() or parent.stat().st_uid != os.getuid():
        raise RuntimeError("run parent is not an owned real directory")
    root.mkdir(mode=0o700, exist_ok=False)
    (root / "scratch").mkdir(mode=0o700)
    (root / "diagnostics").mkdir(mode=0o700)
    _write_once(root / "manifest.json", {
        "schema": "settleora-disposable-native-run-v1",
        "sourceSHA256": source_sha256, "packetSHA256": packet_sha256,
        "imageSHA256": image_sha256, "commandSHA256": command_sha256,
        "maxDiagnosticBytes": CAP_BYTES, "automaticRetries": 0,
    })
    return root


def _owned_root(root):
    root = Path(root)
    if any(stat.S_ISLNK(ancestor.lstat().st_mode) for ancestor in (root, *root.parents)):
        raise RuntimeError("linked run ancestor")
    for path in (root, root / "scratch", root / "diagnostics"):
        st = path.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o700:
            raise RuntimeError("run directory identity changed")
    data = _bounded_json(root / "manifest.json")
    if data.get("schema") != "settleora-disposable-native-run-v1" or data.get("automaticRetries") != 0:
        raise RuntimeError("run manifest contract changed")
    return root


def capture(root, name, relative_scratch_path):
    """Retain a bounded private log prefix and its completeness status."""
    root = _owned_root(root)
    if not isinstance(name, str) or name not in NAMES:
        raise ValueError("unrecognized diagnostic name")
    relative = Path(relative_scratch_path)
    if relative.is_absolute() or not relative.parts or ".." in relative.parts:
        raise ValueError("diagnostic path escapes scratch")
    source = root / "scratch" / relative
    parent = root / "scratch"
    for part in relative.parts[:-1]:
        parent = parent / part
        if not stat.S_ISDIR(parent.lstat().st_mode):
            raise RuntimeError("linked diagnostic parent")
    st = source.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1:
        raise RuntimeError("diagnostic is not an owned regular file")
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns) != \
           (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise RuntimeError("diagnostic changed before read")
        content = bytearray()
        while len(content) < CAP_BYTES:
            chunk = os.read(fd, min(65536, CAP_BYTES - len(content)))
            if not chunk:
                break
            content.extend(chunk)
        truncated = bool(os.read(fd, 1))
        after = os.fstat(fd)
        latest = source.lstat()
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
        if identity(opened) != identity(after) or identity(after) != identity(latest):
            raise RuntimeError("diagnostic changed during read")
    finally:
        os.close(fd)
    destination = root / "diagnostics" / (name + ".log")
    outfd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(outfd, "wb") as out:
        out.write(content)
        out.flush()
        os.fsync(out.fileno())
    _write_once(root / "diagnostics" / (name + ".json"), {
        "schema": "settleora-private-diagnostic-v1", "name": name,
        "retainedBytes": len(content), "sourceBytes": st.st_size,
        "truncated": truncated, "retainedSHA256": hashlib.sha256(content).hexdigest(),
    })
    return {"name": name, "retainedBytes": len(content), "truncated": truncated}


def finish(root, *, test_exit_code, cleanup_verified, diagnostics):
    """Record a terminal attempt. A failure or residual process blocks reuse."""
    root = _owned_root(root)
    if type(test_exit_code) is not int or not 0 <= test_exit_code <= 255 or \
       type(cleanup_verified) is not bool or not isinstance(diagnostics, (list, tuple)) or \
       not diagnostics or any(name not in NAMES for name in diagnostics) or \
       len(set(diagnostics)) != len(diagnostics):
        raise ValueError("invalid terminal evidence")
    for name in diagnostics:
        receipt = root / "diagnostics" / (name + ".json")
        log = root / "diagnostics" / (name + ".log")
        if not receipt.exists() or not log.exists():
            raise RuntimeError("required diagnostic not retained")
        for path in (receipt, log):
            st = path.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1:
                raise RuntimeError("diagnostic evidence identity changed")
        record = _bounded_json(receipt)
        if log.lstat().st_size > CAP_BYTES:
            raise RuntimeError("diagnostic evidence exceeded cap")
        fd = os.open(log, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            data = os.read(fd, CAP_BYTES + 1)
            if os.fstat(fd).st_size != len(data):
                raise RuntimeError("diagnostic evidence changed during read")
        finally:
            os.close(fd)
        if record.get("schema") != "settleora-private-diagnostic-v1" or \
           record.get("name") != name or len(data) != record.get("retainedBytes") or \
           len(data) > CAP_BYTES or hashlib.sha256(data).hexdigest() != record.get("retainedSHA256"):
            raise RuntimeError("diagnostic evidence changed")
    result = {"schema": "settleora-native-run-terminal-v1",
              "testExitCode": test_exit_code, "cleanupVerified": cleanup_verified,
              "diagnostics": sorted(diagnostics), "nativeReady": False,
              "automaticRetries": 0, "requiresNewAdmission": True}
    _write_once(root / "terminal.json", result)
    return result
