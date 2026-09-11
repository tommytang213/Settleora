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


def run(command: list[str], descriptor: int) -> str:
    completed = subprocess.run(
        command,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        pass_fds=(descriptor,),
    )
    return completed.stdout


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
                ["apksigner", "verify", "--verbose", "--print-certs", held_path], descriptor
            )
        else:
            verification = run(
                ["jarsigner", "-J-Duser.language=en", "-J-Duser.country=US", "-verify", "-verbose", "-certs", held_path],
                descriptor,
            )
            content_entries = [line for line in verification.splitlines() if re.match(r"^[smk? ]{3}\s+\d+\s+\w{3}\s", line)]
            signature_control = re.compile(r"\sMETA-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
            result.update(
                {
                    "jarVerified": "jar verified." in verification,
                    "contentEntryCount": len(content_entries),
                    "unsignedEntryCount": sum(1 for line in content_entries if not line.startswith("s") and not signature_control.search(line)),
                    "signerNames": sorted(set(match.group(1) for match in re.finditer(r"^\s+X\.509,\s*(.+)$", verification, re.MULTILINE))),
                }
            )
            certificate = run(
                ["keytool", "-J-Duser.language=en", "-J-Duser.country=US", "-printcert", "-jarfile", held_path],
                descriptor,
            )
            result["certificateDigests"] = sorted(
                set(match.group(1).replace(":", "").lower() for match in re.finditer(r"SHA256:\s*([0-9A-F:]{95})", certificate))
            )
            with os.fdopen(os.dup(descriptor), "rb") as artifact_file, zipfile.ZipFile(artifact_file) as bundle:
                mapping = bundle.read("BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map")
                if not mapping or len(mapping) > MAX_MAPPING_BYTES:
                    raise ValueError("Android R8 mapping is missing or exceeds the sealed verification limit")
                result["embeddedR8MappingSha256"] = hashlib.sha256(mapping).hexdigest()
                result["r8MetadataPresent"] = bool(bundle.read("BUNDLE-METADATA/com.android.tools/r8.json"))
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
