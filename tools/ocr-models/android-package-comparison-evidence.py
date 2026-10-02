#!/usr/bin/env python3
"""Record bounded content hashes for a failed Android package comparison."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile


NATIVE_LIBRARIES = {
    f"lib/{abi}/{name}"
    for abi in ("arm64-v8a", "armeabi-v7a", "x86_64")
    for name in ("libapp.so", "libdartjni.so")
}
MAX_ARCHIVE_BYTES = 400 * 1024 * 1024
MAX_EXPANDED_BYTES = 1024 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
        raise ValueError("Invalid source identity")
    if not args.package.is_file() or not 0 < args.package.stat().st_size <= MAX_ARCHIVE_BYTES:
        raise ValueError("APK is missing or outside the reviewed size bound")

    other_hash = hashlib.sha256()
    native = []
    total_expanded = 0
    with ZipFile(args.package) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) != 444 or len(names) != len(set(names)):
            raise ValueError("APK entry inventory differs from the reviewed bound")
        for entry in sorted(entries, key=lambda item: item.filename):
            if entry.is_dir() or entry.file_size < 0:
                raise ValueError("APK contains an unsupported entry")
            total_expanded += entry.file_size
            if total_expanded > MAX_EXPANDED_BYTES:
                raise ValueError("APK expanded content exceeds the reviewed bound")
            content_hash = hashlib.sha256()
            with archive.open(entry) as stream:
                while chunk := stream.read(1024 * 1024):
                    content_hash.update(chunk)
            digest = content_hash.hexdigest()
            if entry.filename in NATIVE_LIBRARIES:
                native.append({"path": entry.filename, "bytes": entry.file_size, "sha256": digest})
            else:
                other_hash.update(f"{entry.filename}\0{entry.file_size}\0{digest}\n".encode())
    if len(native) != len(NATIVE_LIBRARIES):
        raise ValueError("APK native library inventory differs")
    evidence = {
        "schemaVersion": 1,
        "sourceSha": args.source_sha,
        "entryCount": len(entries),
        "otherEntryCount": len(entries) - len(native),
        "otherContentDigest": other_hash.hexdigest(),
        "nativeLibraries": native,
    }
    args.out.write_text(json.dumps(evidence, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
