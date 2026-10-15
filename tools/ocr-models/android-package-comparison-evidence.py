#!/usr/bin/env python3
"""Record bounded content hashes for a failed Android package comparison."""

import argparse
import hashlib
import json
import re
import struct
import sys
from pathlib import Path
from zipfile import ZipFile


NATIVE_LIBRARIES = {
    f"lib/{abi}/{name}"
    for abi in ("arm64-v8a", "armeabi-v7a", "x86_64")
    for name in ("libapp.so", "libdartjni.so")
}
MAX_ARCHIVE_BYTES = 400 * 1024 * 1024
MAX_EXPANDED_BYTES = 1024 * 1024 * 1024
MAX_NATIVE_BYTES = 128 * 1024 * 1024
MAX_ELF_SECTIONS = 128
MAX_EVIDENCE_BYTES = 128 * 1024


def _elf_summary(content):
    """Return only bounded structural hashes, never ELF strings or payload."""
    if not 64 <= len(content) <= MAX_NATIVE_BYTES or content[:4] != b"\x7fELF":
        raise ValueError("Native library is not a bounded ELF file")
    elf_class, endian_code = content[4:6]
    if elf_class not in (1, 2) or endian_code not in (1, 2) or content[6] != 1:
        raise ValueError("Unsupported ELF header")
    endian = "<" if endian_code == 1 else ">"
    if elf_class == 1:
        header_size, section_size = 52, 40
        header = struct.unpack_from(endian + "HHIIIIIHHHHHH", content, 16)
        section_offset, entry_size, count = header[5], header[10], header[11]
        section_format = endian + "IIIIIIIIII"
    else:
        header_size, section_size = 64, 64
        header = struct.unpack_from(endian + "HHIQQQIHHHHHH", content, 16)
        section_offset, entry_size, count = header[5], header[10], header[11]
        section_format = endian + "IIQQQQIIQQ"
    if (len(content) < header_size or entry_size != section_size or
            not 1 <= count <= MAX_ELF_SECTIONS or
            section_offset < header_size or
            section_offset + count * entry_size > len(content)):
        raise ValueError("ELF section table exceeds reviewed bounds")
    sections = []
    build_ids = []
    for index in range(count):
        fields = struct.unpack_from(section_format, content,
                                    section_offset + index * entry_size)
        section_type = fields[1]
        offset, size = fields[4], fields[5]
        if section_type == 8:  # SHT_NOBITS has no bytes in the file.
            digest = None
        else:
            if offset > len(content) or size > len(content) - offset:
                raise ValueError("ELF section exceeds library bounds")
            payload = memoryview(content)[offset:offset + size]
            digest = hashlib.sha256(payload).hexdigest()
            if section_type == 7:  # SHT_NOTE; only GNU build-id descriptors leave.
                cursor = 0
                while cursor < size:
                    if size - cursor < 12:
                        raise ValueError("Truncated ELF note")
                    namesz, descsz, note_type = struct.unpack_from(
                        endian + "III", payload, cursor)
                    cursor += 12
                    name_end = cursor + namesz
                    desc_start = cursor + ((namesz + 3) & ~3)
                    desc_end = desc_start + descsz
                    next_note = desc_start + ((descsz + 3) & ~3)
                    if next_note > size or namesz > 256 or descsz > 256:
                        raise ValueError("ELF note exceeds reviewed bounds")
                    if (bytes(payload[cursor:name_end]) == b"GNU\0" and
                            note_type == 3 and 4 <= descsz <= 64):
                        build_ids.append(bytes(payload[desc_start:desc_end]).hex())
                    cursor = next_note
        sections.append({"index": index, "type": section_type,
                         "bytes": size, "sha256": digest})
    if len(build_ids) > 2:
        raise ValueError("ELF build-id inventory exceeds reviewed bound")
    return {"class": 32 if elf_class == 1 else 64,
            "byteOrder": "little" if endian_code == 1 else "big",
            "buildIds": build_ids, "sections": sections}


def _zip_summary(package, entry):
    """Hash only bounded compressed bytes and report reviewed ZIP fields."""
    with package.open("rb") as source:
        source.seek(entry.header_offset)
        local = source.read(30)
        if len(local) != 30:
            raise ValueError("Truncated native ZIP local header")
        (signature, needed, flags, method, dos_time, dos_date, local_crc,
         local_compressed, local_expanded, name_length, extra_length) = struct.unpack(
             "<IHHHHHIIIHH", local)
        name = source.read(name_length)
        extra = source.read(extra_length)
        if (signature != 0x04034B50 or name != entry.filename.encode("ascii") or
                len(extra) != extra_length or flags != entry.flag_bits or
                flags not in (0, 8) or method != entry.compress_type):
            raise ValueError("Native ZIP local and central metadata disagree")
        if flags == 0 and (local_crc != entry.CRC or
                           local_compressed != entry.compress_size or
                           local_expanded != entry.file_size):
            raise ValueError("Native ZIP local and central sizes disagree")
        if flags == 8 and (local_crc not in (0, entry.CRC) or
                           local_compressed not in (0, entry.compress_size) or
                           local_expanded not in (0, entry.file_size)):
            raise ValueError("Native ZIP descriptor header is malformed")
        # Report nonzero alignment fields without accepting them for release.
        # The separate strict package verifier still decides that policy.
        cursor = 0
        while cursor < len(extra) and any(extra[cursor:]):
            if len(extra) - cursor < 4:
                raise ValueError("Truncated native ZIP extra field")
            field_bytes = struct.unpack_from("<H", extra, cursor + 2)[0]
            cursor += 4 + field_bytes
            if cursor > len(extra):
                raise ValueError("Native ZIP extra field exceeds local header")
        start = entry.header_offset + 30 + name_length + extra_length
        end = start + entry.compress_size
        if end + (12 if flags == 8 else 0) > package.stat().st_size:
            raise ValueError("Native ZIP compressed entry exceeds archive")
        compressed_hash = hashlib.sha256()
        remaining = entry.compress_size
        while remaining:
            chunk = source.read(min(1024 * 1024, remaining))
            if not chunk:
                raise ValueError("Truncated native ZIP compressed entry")
            compressed_hash.update(chunk)
            remaining -= len(chunk)
        descriptor = b""
        if flags == 8:
            first = source.read(4)
            if len(first) != 4:
                raise ValueError("Truncated native ZIP data descriptor")
            if struct.unpack("<I", first)[0] == 0x08074B50:
                descriptor = first + source.read(12)
                values = descriptor[4:]
            else:
                descriptor = first + source.read(8)
                values = descriptor
            if len(values) != 12 or struct.unpack("<III", values) != (
                    entry.CRC, entry.compress_size, entry.file_size):
                raise ValueError("Native ZIP data descriptor disagrees")
    return {"localHeaderOffset": entry.header_offset,
            "localExtraBytes": extra_length,
            "localExtraAllZero": not any(extra),
            "localExtraSha256": hashlib.sha256(extra).hexdigest(),
            "centralExtraBytes": len(entry.extra),
            "madeBy": (entry.create_system << 8) | entry.create_version,
            "externalAttributes": entry.external_attr,
            "neededVersion": needed,
            "flags": flags, "method": method,
            "dosTime": dos_time, "dosDate": dos_date,
            "localCrc32": f"{local_crc:08x}",
            "crc32": f"{entry.CRC:08x}",
            "localCompressedBytes": local_compressed,
            "localExpandedBytes": local_expanded,
            "compressedBytes": entry.compress_size,
            "compressedSha256": compressed_hash.hexdigest(),
            "dataDescriptorBytes": len(descriptor),
            "dataDescriptorSha256": (hashlib.sha256(descriptor).hexdigest()
                                     if descriptor else None)}


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
            if entry.filename in NATIVE_LIBRARIES:
                if entry.file_size > MAX_NATIVE_BYTES:
                    raise ValueError("Native library exceeds reviewed size bound")
                content = archive.read(entry)
                digest = hashlib.sha256(content).hexdigest()
                native.append({"path": entry.filename, "bytes": entry.file_size,
                               "sha256": digest,
                               "zip": _zip_summary(args.package, entry),
                               "elf": _elf_summary(content)})
            else:
                content_hash = hashlib.sha256()
                with archive.open(entry) as stream:
                    while chunk := stream.read(1024 * 1024):
                        content_hash.update(chunk)
                digest = content_hash.hexdigest()
                other_hash.update(f"{entry.filename}\0{entry.file_size}\0{digest}\n".encode())
    if len(native) != len(NATIVE_LIBRARIES):
        raise ValueError("APK native library inventory differs")
    evidence = {
        "schemaVersion": 2,
        "sourceSha": args.source_sha,
        "entryCount": len(entries),
        "otherEntryCount": len(entries) - len(native),
        "otherContentDigest": other_hash.hexdigest(),
        "nativeLibraries": native,
    }
    encoded = json.dumps(evidence, separators=(",", ":")) + "\n"
    if len(encoded.encode()) > MAX_EVIDENCE_BYTES:
        raise ValueError("Bounded comparison evidence exceeds reviewed size")
    args.out.write_text(encoded)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # The diagnostic fails closed without echoing file paths or payloads.
        print(f"Android package diagnostic failed: {type(error).__name__}",
              file=sys.stderr)
        sys.exit(1)
