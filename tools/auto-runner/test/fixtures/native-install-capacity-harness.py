"""Execute only the bootstrap's embedded materializer with fake Git and ownership.

No shell bootstrap, network, sudo, installation, or real ownership change runs.
The only writes are tiny synthetic support files inside this harness's own tempdir.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

if len(sys.argv) != 2:
    print("usage: native-install-capacity-harness.py SCENARIO", file=sys.stderr)
    raise SystemExit(2)

# This fixture exercises only the repository's own bootstrap. A caller may
# choose a synthetic scenario, never the source code read by the harness.
source = (Path(__file__).resolve().parents[2] /
          "semantic-recovery-native-install-bootstrap.sh").read_text(encoding="utf-8")
programs = re.findall(r"<<'PY'\n([\s\S]*?)\nPY\n", source)
assert len(programs) == 2
program = programs[1]
scenario = sys.argv[1]
mib = 1024 * 1024
sizes = {
    "large-valid": [21159378],
    "limit-valid": [32 * mib],
    "corrupt-large": [21159378],
    "object-over-limit": [32 * mib + 1],
    "aggregate-over-limit": [30 * mib] * 9,
    "repeated-blob-over-limit": [32 * mib] * 9,
    "symlink-large": [21159378],
    "escaping-large": [21159378],
}[scenario]

def oid(payload):
    return hashlib.sha1(b"blob " + str(len(payload)).encode() + b"\0" + payload).hexdigest()

members = []
objects = {}
for index, size in enumerate(sizes):
    tag = 1 if scenario == "repeated-blob-over-limit" else index + 1
    blob = oid(bytes([tag]) * size)
    member_path = f"arbitrary-payload/{index}.bin"
    mode = "100644"
    if scenario == "symlink-large":
        mode = "120000"
    if scenario == "escaping-large":
        member_path = "../outside.bin"
    members.append((mode, blob, member_path))
    objects[blob] = (size, tag, None)
for member in ["semantic-recovery-native-install-bootstrap.sh", "semantic-recovery-native-install.mjs"]:
    payload = b"synthetic support bytes, never executed\n"
    blob = oid(payload)
    objects[blob] = (len(payload), 0, payload)
    members.append(("100755", blob, f"tools/auto-runner/{member}"))
listing = b"".join(f"{mode} blob {blob}\t{name}\0".encode() for mode, blob, name in members)
reads = []
creation_paths = []
ownership_requests = []
real_open = os.open
real_fstat = os.fstat

with tempfile.TemporaryDirectory(prefix="settleora-native-capacity-test-") as root:
    def fake_git(command, **kwargs):
        assert command[:2] == ["/usr/bin/git", "-c"]
        at = command.index("-C")
        assert command[at + 1] == root
        arguments = command[at + 2:]
        if arguments == ["ls-tree", "-r", "-z", "--full-tree", "0" * 40]:
            return SimpleNamespace(returncode=0, stderr=b"", stdout=listing)
        assert len(arguments) == 3 and arguments[:2] == ["cat-file", "blob"], arguments
        size, tag, stored = objects[arguments[2]]
        payload = stored if stored is not None else bytes([tag]) * size
        reads.append({"oid": arguments[2], "bytes": len(payload)})
        if scenario == "corrupt-large" and stored is None:
            payload = bytes([tag ^ 1]) + payload[1:]
        return SimpleNamespace(returncode=0, stderr=b"", stdout=payload)

    def temporary_open(target, flags, *args, **kwargs):
        resolved = Path(target).resolve()
        assert resolved == Path(root) or Path(root) in resolved.parents
        if flags & os.O_CREAT:
            creation_paths.append(str(resolved.relative_to(root)))
        return real_open(target, flags, *args, **kwargs)

    def fake_owner_change(descriptor, uid, gid):
        assert (uid, gid) == (0, 0)
        ownership_requests.append(descriptor)

    def fixture_metadata(descriptor):
        actual = real_fstat(descriptor)
        return SimpleNamespace(st_mode=actual.st_mode, st_uid=0, st_gid=0,
                               st_nlink=actual.st_nlink, st_size=actual.st_size)

    with patch.object(subprocess, "run", fake_git), patch.object(os, "open", temporary_open), \
            patch.object(os, "fchown", fake_owner_change), patch.object(os, "fstat", fixture_metadata), \
            patch.object(sys, "argv", ["fixture-materializer", root, "0" * 40]):
        status = 0
        try:
            exec(compile(program, "<actual-bootstrap-materializer>", "exec"), {})
        except SystemExit as error:
            status = error.code
    assert all(name.startswith("tools/auto-runner/") for name in creation_paths)
    print(json.dumps({"status": status, "reads": reads, "createdFiles": creation_paths,
                      "mockOwnershipRequests": len(ownership_requests),
                      "realOwnershipChanges": 0, "networkCalls": 0, "bootstrapExecuted": False}))
