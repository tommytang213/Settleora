#!/usr/bin/env python3
"""Verify Android artifacts from a write-sealed Linux memfd snapshot."""

import argparse
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import zipfile


MAX_ARTIFACT_BYTES = 256 * 1024 * 1024
MAX_MAPPING_BYTES = 128 * 1024 * 1024
MAX_R8_METADATA_BYTES = 1024 * 1024


def run(command: list[str], descriptors: tuple[int, ...]) -> str:
    completed = subprocess.run(
        command,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        pass_fds=descriptors,
    )
    return completed.stdout


def unsigned_content_entry_count(verification: str) -> tuple[int, int]:
    content_entries = []
    for line in verification.splitlines():
        match = re.match(r"^[smk? ]{3}\s+(\d+)\s+\w{3}\s", line)
        if match:
            content_entries.append((line, int(match.group(1))))
    signature_control = re.compile(r"\sMETA-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
    unsigned = sum(
        1
        for line, size in content_entries
        if not line.startswith("s") and not (size == 0 and line.rstrip().endswith("/")) and not signature_control.search(line)
    )
    return len(content_entries), unsigned


def bounded_zip_entry_digest(bundle: zipfile.ZipFile, name: str, limit: int, label: str) -> str:
    info = bundle.getinfo(name)
    if info.file_size < 1 or info.file_size > limit:
        raise ValueError(f"{label} is missing or exceeds the sealed verification limit")
    digest = hashlib.sha256()
    size = 0
    with bundle.open(info) as entry:
        while chunk := entry.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise ValueError(f"{label} exceeds the sealed verification limit")
            digest.update(chunk)
    if size != info.file_size:
        raise ValueError(f"{label} size changed during inspection")
    return digest.hexdigest()


def sealed_snapshot(source_descriptor: int) -> tuple[int, int, str]:
    source_fd = os.dup(source_descriptor)
    sealed_fd = os.memfd_create("settleora-android-artifact", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    digest = hashlib.sha256()
    size = 0
    try:
        metadata = os.fstat(source_fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("Android artifact descriptor is not a regular file")
        while True:
            chunk = os.read(source_fd, 1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_ARTIFACT_BYTES:
                raise ValueError("Android artifact exceeds sealed verification limit")
            digest.update(chunk)
            view = memoryview(chunk)
            while view:
                written = os.write(sealed_fd, view)
                view = view[written:]
        if size != metadata.st_size:
            raise ValueError("Android artifact changed size while snapshotting")
        fcntl.fcntl(
            sealed_fd,
            fcntl.F_ADD_SEALS,
            fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL,
        )
        os.lseek(sealed_fd, 0, os.SEEK_SET)
        return sealed_fd, size, digest.hexdigest()
    except Exception:
        os.close(sealed_fd)
        raise
    finally:
        os.close(source_fd)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("apk", "aab"))
    arguments = parser.parse_args()
    descriptor, size, digest = sealed_snapshot(3)
    held_path = f"/proc/self/fd/{descriptor}"
    try:
        result: dict[str, object] = {"size": size, "sha256": digest}
        if arguments.kind == "apk":
            result["verificationOutput"] = run(
                ["/proc/self/fd/4", "verify", "--verbose", "--print-certs", held_path], (descriptor, 4)
            )
        else:
            verification = run(
                ["/proc/self/fd/4", "-J-Duser.language=en", "-J-Duser.country=US", "-verify", "-verbose", "-certs", held_path],
                (descriptor, 4),
            )
            content_entry_count, unsigned_entry_count = unsigned_content_entry_count(verification)
            result.update(
                {
                    "jarVerified": "jar verified." in verification,
                    "contentEntryCount": content_entry_count,
                    "unsignedEntryCount": unsigned_entry_count,
                    "signerNames": sorted(set(match.group(1) for match in re.finditer(r"^\s+X\.509,\s*(.+)$", verification, re.MULTILINE))),
                }
            )
            certificate = run(
                ["/proc/self/fd/5", "-J-Duser.language=en", "-J-Duser.country=US", "-printcert", "-jarfile", held_path],
                (descriptor, 5),
            )
            result["certificateDigests"] = sorted(
                set(match.group(1).replace(":", "").lower() for match in re.finditer(r"SHA256:\s*([0-9A-F:]{95})", certificate))
            )
            with os.fdopen(os.dup(descriptor), "rb") as artifact_file, zipfile.ZipFile(artifact_file) as bundle:
                result["embeddedR8MappingSha256"] = bounded_zip_entry_digest(
                    bundle,
                    "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map",
                    MAX_MAPPING_BYTES,
                    "Android R8 mapping",
                )
                metadata_info = bundle.getinfo("BUNDLE-METADATA/com.android.tools/r8.json")
                if metadata_info.file_size < 1 or metadata_info.file_size > MAX_R8_METADATA_BYTES:
                    raise ValueError("Android R8 metadata is missing or exceeds the sealed verification limit")
                with bundle.open(metadata_info) as metadata_file:
                    metadata = metadata_file.read(MAX_R8_METADATA_BYTES + 1)
                result["r8MetadataPresent"] = len(metadata) == metadata_info.file_size
        json.dump(result, sys.stdout, separators=(",", ":"), sort_keys=True)
        sys.stdout.write("\n")
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
