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
MAX_TOOL_BYTES = 256 * 1024 * 1024
MAX_VERIFIER_OUTPUT_BYTES = 32 * 1024 * 1024
MAX_VERIFIER_ENTRIES = 200_000


def run(command: list[str], descriptors: tuple[int, ...], limit: int = 4 * 1024 * 1024) -> str:
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, pass_fds=descriptors)
    assert process.stdout is not None
    chunks: list[bytes] = []
    size = 0
    try:
        while chunk := process.stdout.read(64 * 1024):
            size += len(chunk)
            if size > limit:
                raise ValueError("Android verifier output exceeds its evidence size limit")
            chunks.append(chunk)
        if process.wait() != 0:
            raise subprocess.CalledProcessError(process.returncode, command)
        return b"".join(chunks).decode("utf-8")
    except Exception:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise
    finally:
        process.stdout.close()


def inspect_jar_signatures(command: list[str], descriptors: tuple[int, ...]) -> dict[str, object]:
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, pass_fds=descriptors)
    assert process.stdout is not None
    content_entry_count = 0
    unsigned_entry_count = 0
    signer_names: set[str] = set()
    jar_verified = False
    output_bytes = 0
    entry_pattern = re.compile(rb"^([smk? ]{5})\s+(\d+)\s+\w{3}\s")
    signature_control = re.compile(rb"\sMETA-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
    signer_pattern = re.compile(rb"^\s+X\.509,\s*(.+)$")
    try:
        for line in process.stdout:
            output_bytes += len(line)
            if output_bytes > MAX_VERIFIER_OUTPUT_BYTES:
                raise ValueError("Android jarsigner output exceeds its evidence size limit")
            match = entry_pattern.match(line)
            if match:
                content_entry_count += 1
                if content_entry_count > MAX_VERIFIER_ENTRIES:
                    raise ValueError("Android bundle exceeds its verifier entry-count limit")
                status = match.group(1)
                size = int(match.group(2))
                if b"s" not in status and not (size == 0 and line.rstrip().endswith(b"/")) and not signature_control.search(line.rstrip()):
                    unsigned_entry_count += 1
            signer = signer_pattern.match(line.rstrip(b"\r\n"))
            if signer:
                signer_names.add(signer.group(1).decode("utf-8"))
            if b"jar verified." in line:
                jar_verified = True
        if process.wait() != 0:
            raise subprocess.CalledProcessError(process.returncode, command)
    except Exception:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise
    finally:
        process.stdout.close()
    return {
        "jarVerified": jar_verified,
        "contentEntryCount": content_entry_count,
        "unsignedEntryCount": unsigned_entry_count,
        "signerNames": sorted(signer_names),
    }


def unsigned_content_entry_count(verification: str) -> tuple[int, int]:
    content_entries = []
    for line in verification.splitlines():
        match = re.match(r"^([smk? ]{5})\s+(\d+)\s+\w{3}\s", line)
        if match:
            content_entries.append((line, match.group(1), int(match.group(2))))
    signature_control = re.compile(r"\sMETA-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
    unsigned = sum(
        1
        for line, status, size in content_entries
        if "s" not in status and not (size == 0 and line.rstrip().endswith("/")) and not signature_control.search(line)
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


def sealed_executable_snapshot(source_descriptor: int) -> int:
    source_fd = os.dup(source_descriptor)
    sealed_fd = os.memfd_create("settleora-verifier-tool", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    size = 0
    try:
        metadata = os.fstat(source_fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("Android verifier tool descriptor is not a regular file")
        while True:
            chunk = os.read(source_fd, 1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_TOOL_BYTES:
                raise ValueError("Android verifier tool exceeds its snapshot limit")
            view = memoryview(chunk)
            while view:
                written = os.write(sealed_fd, view)
                view = view[written:]
        if size < 1 or size != metadata.st_size:
            raise ValueError("Android verifier tool changed size while snapshotting")
        os.fchmod(sealed_fd, 0o500)
        fcntl.fcntl(
            sealed_fd,
            fcntl.F_ADD_SEALS,
            fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL,
        )
        os.lseek(sealed_fd, 0, os.SEEK_SET)
        return sealed_fd
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
    java_path = os.readlink("/proc/self/fd/4")
    if arguments.kind == "apk":
        tool_descriptors = [sealed_executable_snapshot(5)]
    else:
        tool_descriptors = []
    held_path = f"/proc/self/fd/{descriptor}"
    try:
        result: dict[str, object] = {"size": size, "sha256": digest}
        if arguments.kind == "apk":
            result["verificationOutput"] = run(
                [java_path, "-Xmx1024M", "-jar", f"/proc/self/fd/{tool_descriptors[0]}", "verify", "--verbose", "--print-certs", held_path],
                (descriptor, tool_descriptors[0]),
            )
        else:
            result.update(inspect_jar_signatures(
                [java_path, "-Duser.language=en", "-Duser.country=US", "sun.security.tools.jarsigner.Main", "-verify", "-verbose", "-certs", held_path],
                (descriptor,),
            ))
            certificate = run(
                [java_path, "-Duser.language=en", "-Duser.country=US", "sun.security.tools.keytool.Main", "-printcert", "-jarfile", held_path],
                (descriptor,),
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
        for tool_descriptor in tool_descriptors:
            os.close(tool_descriptor)
        os.close(descriptor)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
