#!/usr/bin/env python3
"""Verify Android artifacts from a write-sealed Linux memfd snapshot."""

import argparse
import base64
import binascii
import fcntl
import hashlib
import json
import os
import re
import stat
import struct
import subprocess
import sys
import zipfile
import zlib


MAX_ARTIFACT_BYTES = 256 * 1024 * 1024
MAX_MAPPING_BYTES = 128 * 1024 * 1024
MAX_R8_METADATA_BYTES = 1024 * 1024
MAX_TOOL_BYTES = 256 * 1024 * 1024
MAX_VERIFIER_OUTPUT_BYTES = 32 * 1024 * 1024
MAX_VERIFIER_ENTRIES = 200_000
MAX_AAB_ENTRY_BYTES = 256 * 1024 * 1024
MAX_AAB_EXPANDED_BYTES = 512 * 1024 * 1024
MAX_AAB_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024
MAX_SIGNATURE_CONTROL_BYTES = 4 * 1024 * 1024
SIGNATURE_CONTROL = re.compile(r"^META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
APK_SIGNING_BLOCK_MAGIC = b"APK Sig Block 42"
EXPECTED_APK_SIGNING_BLOCK_IDS = {0x7109871A, 0x504B4453, 0x42726577}
EXPECTED_ANDROID_ZIP_DOS_TIME = 0x0821
EXPECTED_ANDROID_ZIP_DOS_DATE = 0x0221


def run(command: list[str], descriptors: tuple[int, ...], limit: int = 4 * 1024 * 1024, executable: str | None = None) -> str:
    process = subprocess.Popen(command, executable=executable, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, pass_fds=descriptors)
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


def inspect_jar_signatures(command: list[str], descriptors: tuple[int, ...], executable: str | None = None) -> dict[str, object]:
    process = subprocess.Popen(command, executable=executable, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, pass_fds=descriptors)
    assert process.stdout is not None
    content_entry_count = 0
    unsigned_entry_count = 0
    signer_names: set[str] = set()
    jar_verified = False
    output_bytes = 0
    entry_pattern = re.compile(rb"^([smk? ]{5})\s+(\d+)\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\d{4} (.+?)\r?\n?$")
    signature_control = re.compile(rb"^META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
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
                entry_name = match.group(3)
                if b"s" not in status and not (size == 0 and entry_name.endswith(b"/")) and not signature_control.fullmatch(entry_name):
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
        match = re.match(r"^([smk? ]{5})\s+(\d+)\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\d{4} (.+)$", line)
        if match:
            content_entries.append((match.group(3), match.group(1), int(match.group(2))))
    signature_control = re.compile(r"^META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$")
    unsigned = sum(
        1
        for entry_name, status, size in content_entries
        if "s" not in status and not (size == 0 and entry_name.endswith("/")) and not signature_control.fullmatch(entry_name)
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


def canonical_zip_payload_digest(descriptor: int) -> tuple[str, int, list[str]]:
    """Hash payload bytes and separately bind the complete signer-control name set."""
    records: list[tuple[bytes, int, str]] = []
    signature_controls: list[str] = []
    total = 0
    with os.fdopen(os.dup(descriptor), "rb") as artifact_file, zipfile.ZipFile(artifact_file) as bundle:
        infos = bundle.infolist()
        if len(infos) < 1 or len(infos) > MAX_VERIFIER_ENTRIES:
            raise ValueError("Android archive exceeds its payload entry-count limit")
        seen: set[bytes] = set()
        for info in infos:
            try:
                name = info.filename.encode("utf-8", "strict")
            except UnicodeError as error:
                raise ValueError("Android archive contains a non-UTF-8 payload path") from error
            if name in seen:
                raise ValueError("Android archive contains a duplicate payload path")
            seen.add(name)
            if any(byte < 0x20 or byte == 0x7F for byte in name) or name.startswith(b"/") or b"\\" in name \
                    or any(part in (b"", b".", b"..") for part in name.rstrip(b"/").split(b"/")):
                raise ValueError("Android archive payload path is not canonical")
            if SIGNATURE_CONTROL.fullmatch(info.filename):
                signature_controls.append(info.filename)
                continue
            if info.file_size < 0 or info.file_size > MAX_AAB_ENTRY_BYTES:
                raise ValueError("Android archive payload entry exceeds its expanded-size limit")
            total += info.file_size
            if total > MAX_AAB_EXPANDED_BYTES:
                raise ValueError("Android archive payload exceeds its aggregate expanded-size limit")
            digest = hashlib.sha256()
            observed = 0
            with bundle.open(info) as entry:
                while chunk := entry.read(1024 * 1024):
                    observed += len(chunk)
                    if observed > info.file_size:
                        raise ValueError("Android archive payload entry exceeded its declared size")
                    digest.update(chunk)
            if observed != info.file_size:
                raise ValueError("Android archive payload entry changed size during inspection")
            record_size = info.file_size
            record_digest = digest.hexdigest()
            if info.filename == "BUNDLE-METADATA/com.android.tools/r8.json":
                with bundle.open(info) as entry:
                    metadata = json.loads(entry.read(MAX_R8_METADATA_BYTES + 1))
                if not isinstance(metadata, dict) or not isinstance(metadata.get("compilation"), dict) \
                        or not isinstance(metadata["compilation"].get("buildTimeNs"), int):
                    raise ValueError("Android R8 metadata cannot be canonically normalized")
                metadata["compilation"] = dict(metadata["compilation"])
                del metadata["compilation"]["buildTimeNs"]
                normalized = json.dumps(metadata, separators=(",", ":"), sort_keys=True).encode("utf-8")
                record_size = len(normalized)
                record_digest = hashlib.sha256(normalized).hexdigest()
            records.append((name, record_size, record_digest))
    identity = hashlib.sha256()
    for name, size, digest in sorted(records):
        identity.update(name)
        identity.update(b"\0")
        identity.update(str(size).encode("ascii"))
        identity.update(b"\0")
        identity.update(digest.encode("ascii"))
        identity.update(b"\n")
    return identity.hexdigest(), len(records), sorted(signature_controls)


def _jar_sections(contents: bytes, label: str) -> list[tuple[bytes, dict[str, str]]]:
    if len(contents) < 1 or len(contents) > MAX_SIGNATURE_CONTROL_BYTES or not contents.endswith(b"\r\n\r\n"):
        raise ValueError(f"Android AAB {label} is not a bounded canonical JAR control file")
    raw_sections = [section + b"\r\n\r\n" for section in contents[:-4].split(b"\r\n\r\n")]
    parsed: list[tuple[bytes, dict[str, str]]] = []
    for raw_section in raw_sections:
        logical: list[bytes] = []
        for line in raw_section[:-4].split(b"\r\n"):
            if line.startswith(b" "):
                if not logical:
                    raise ValueError(f"Android AAB {label} starts with an invalid continuation")
                logical[-1] += line[1:]
            else:
                logical.append(line)
        attributes: dict[str, str] = {}
        for line in logical:
            if b": " not in line:
                raise ValueError(f"Android AAB {label} contains malformed attributes")
            raw_key, raw_value = line.split(b": ", 1)
            try:
                key = raw_key.decode("ascii")
                value = raw_value.decode("utf-8", "strict")
            except UnicodeError as error:
                raise ValueError(f"Android AAB {label} attributes are not canonical text") from error
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", key) or key in attributes:
                raise ValueError(f"Android AAB {label} contains duplicate or invalid attributes")
            attributes[key] = value
        parsed.append((raw_section, attributes))
    return parsed


def _sha256_base64(contents: bytes) -> str:
    return base64.b64encode(hashlib.sha256(contents).digest()).decode("ascii")


def _validated_digest(value: str, label: str) -> None:
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError(f"Android AAB {label} is not canonical base64") from error
    if len(decoded) != hashlib.sha256().digest_size or base64.b64encode(decoded).decode("ascii") != value:
        raise ValueError(f"Android AAB {label} is not a SHA-256 digest")


def canonical_aab_signature_control_digest(descriptor: int) -> str:
    """Validate all JAR controls and hash their complete deterministic meaning."""
    with os.fdopen(os.dup(descriptor), "rb") as artifact_file, zipfile.ZipFile(artifact_file) as bundle:
        names = sorted(info.filename for info in bundle.infolist() if SIGNATURE_CONTROL.fullmatch(info.filename))
        if names != ["META-INF/ANDROIDD.RSA", "META-INF/ANDROIDD.SF", "META-INF/MANIFEST.MF"]:
            raise ValueError("Android AAB signature-control filenames are not the expected complete set")
        manifest = bundle.read("META-INF/MANIFEST.MF")
        signature_file = bundle.read("META-INF/ANDROIDD.SF")
        if len(bundle.read("META-INF/ANDROIDD.RSA")) > MAX_SIGNATURE_CONTROL_BYTES:
            raise ValueError("Android AAB certificate block exceeds its bounded control limit")
        manifest_sections = _jar_sections(manifest, "manifest")
        signature_sections = _jar_sections(signature_file, "signature file")
        if manifest_sections[0][1] != {"Manifest-Version": "1.0", "Built-By": "Signflinger", "Created-By": "Signflinger"}:
            raise ValueError("Android AAB manifest main attributes are not canonical")
        signature_main = signature_sections[0][1]
        if set(signature_main) != {"Signature-Version", "Created-By", "SHA-256-Digest-Manifest"} \
                or signature_main["Signature-Version"] != "1.0" or signature_main["Created-By"] != "Signflinger":
            raise ValueError("Android AAB signature-file main attributes are not canonical")
        _validated_digest(signature_main["SHA-256-Digest-Manifest"], "manifest digest")
        if signature_main["SHA-256-Digest-Manifest"] != _sha256_base64(manifest):
            raise ValueError("Android AAB signature file does not bind the complete manifest")

        controls = set(names)
        archive_names = [info.filename for info in bundle.infolist() if info.filename not in controls]
        manifest_records: dict[str, tuple[bytes, str]] = {}
        for raw_section, attributes in manifest_sections[1:]:
            if set(attributes) != {"Name", "SHA-256-Digest"} or attributes["Name"] in manifest_records:
                raise ValueError("Android AAB manifest sections are not canonical")
            name = attributes["Name"]
            _validated_digest(attributes["SHA-256-Digest"], "entry digest")
            raw_entry = bundle.read(name)
            if attributes["SHA-256-Digest"] != _sha256_base64(raw_entry):
                raise ValueError("Android AAB manifest entry digest mismatch")
            normalized = raw_entry
            if name == "BUNDLE-METADATA/com.android.tools/r8.json":
                metadata = json.loads(raw_entry)
                if not isinstance(metadata, dict) or not isinstance(metadata.get("compilation"), dict) \
                        or not isinstance(metadata["compilation"].get("buildTimeNs"), int):
                    raise ValueError("Android AAB R8 metadata cannot be canonically normalized")
                metadata["compilation"] = dict(metadata["compilation"])
                del metadata["compilation"]["buildTimeNs"]
                normalized = json.dumps(metadata, separators=(",", ":"), sort_keys=True).encode("utf-8")
            manifest_records[name] = (raw_section, _sha256_base64(normalized))
        if sorted(manifest_records) != sorted(archive_names):
            raise ValueError("Android AAB manifest does not bind the complete archive entry set")

        signature_records: dict[str, str] = {}
        for _, attributes in signature_sections[1:]:
            if set(attributes) != {"Name", "SHA-256-Digest"} or attributes["Name"] in signature_records:
                raise ValueError("Android AAB signature-file sections are not canonical")
            name = attributes["Name"]
            _validated_digest(attributes["SHA-256-Digest"], "manifest-section digest")
            raw_manifest_section = manifest_records.get(name, (None, None))[0]
            if raw_manifest_section is None or attributes["SHA-256-Digest"] != _sha256_base64(raw_manifest_section):
                raise ValueError("Android AAB signature file does not bind a complete manifest section")
            signature_records[name] = attributes["SHA-256-Digest"]
        if sorted(signature_records) != sorted(manifest_records):
            raise ValueError("Android AAB signature file does not bind every manifest section")

        deterministic = {
            "algorithm": "sha256(canonical-aab-jar-controls-v1)",
            "certificateBlockEntry": "META-INF/ANDROIDD.RSA",
            "manifestEntries": [{"name": name, "normalizedSha256Base64": manifest_records[name][1]} for name in sorted(manifest_records)],
            "signatureFileEntry": "META-INF/ANDROIDD.SF",
        }
        return hashlib.sha256(json.dumps(deterministic, separators=(",", ":"), sort_keys=True).encode("utf-8")).hexdigest()


def apk_signing_block_ids(descriptor: int) -> list[str]:
    """Parse and constrain the complete APK Signing Block ID inventory."""
    metadata = os.fstat(descriptor)
    tail_size = min(metadata.st_size, 65_557)
    tail = os.pread(descriptor, tail_size, metadata.st_size - tail_size)
    eocd_offset = tail.rfind(b"PK\x05\x06")
    if eocd_offset < 0 or len(tail) - eocd_offset < 22:
        raise ValueError("Android APK has no bounded ZIP end record")
    central_offset = struct.unpack_from("<I", tail, eocd_offset + 16)[0]
    comment_size = struct.unpack_from("<H", tail, eocd_offset + 20)[0]
    absolute_eocd_offset = metadata.st_size - tail_size + eocd_offset
    if absolute_eocd_offset + 22 + comment_size != metadata.st_size or central_offset < 24:
        raise ValueError("Android APK end record is malformed")
    footer = os.pread(descriptor, 24, central_offset - 24)
    if len(footer) != 24 or footer[8:] != APK_SIGNING_BLOCK_MAGIC:
        raise ValueError("Android APK signing block is missing")
    block_size = struct.unpack_from("<Q", footer, 0)[0]
    if block_size < 24 or block_size + 8 > central_offset or block_size > MAX_ARTIFACT_BYTES:
        raise ValueError("Android APK signing block size is invalid")
    block_start = central_offset - block_size - 8
    block = os.pread(descriptor, block_size + 8, block_start)
    if len(block) != block_size + 8 or struct.unpack_from("<Q", block, 0)[0] != block_size:
        raise ValueError("Android APK signing block headers disagree")
    position = 8
    pairs_end = len(block) - 24
    identifiers: list[int] = []
    while position < pairs_end:
        if pairs_end - position < 12:
            raise ValueError("Android APK signing block pair is truncated")
        pair_size = struct.unpack_from("<Q", block, position)[0]
        if pair_size < 4 or position + 8 + pair_size > pairs_end:
            raise ValueError("Android APK signing block pair size is invalid")
        identifier = struct.unpack_from("<I", block, position + 8)[0]
        value = block[position + 12:position + 8 + pair_size]
        if identifier == 0x42726577 and any(value):
            raise ValueError("Android APK verity padding is not canonical zero bytes")
        identifiers.append(identifier)
        position += 8 + pair_size
    if position != pairs_end or len(identifiers) != len(set(identifiers)):
        raise ValueError("Android APK signing block IDs are malformed or duplicated")
    if set(identifiers) != EXPECTED_APK_SIGNING_BLOCK_IDS:
        raise ValueError("Android APK signing block contains an unexpected ID inventory")
    return sorted(f"{identifier:08x}" for identifier in identifiers)


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


def sealed_executable_snapshot(source_descriptor: int) -> tuple[int, str]:
    source_fd = os.dup(source_descriptor)
    sealed_fd = os.memfd_create("settleora-verifier-tool", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    size = 0
    digest = hashlib.sha256()
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
            digest.update(chunk)
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
        return sealed_fd, digest.hexdigest()
    except Exception:
        os.close(sealed_fd)
        raise
    finally:
        os.close(source_fd)


def preflight_aab(descriptor: int) -> tuple[int, str, str]:
    metadata = os.fstat(descriptor)
    tail_size = min(metadata.st_size, 65_557)
    tail = os.pread(descriptor, tail_size, metadata.st_size - tail_size)
    eocd_offset = tail.rfind(b"PK\x05\x06")
    if eocd_offset < 0 or len(tail) - eocd_offset < 22:
        raise ValueError("Android bundle has no bounded ZIP end record")
    disk, central_disk, disk_entries, total_entries, central_size, central_offset = struct.unpack_from("<HHHHII", tail, eocd_offset + 4)
    comment_size = struct.unpack_from("<H", tail, eocd_offset + 20)[0]
    absolute_eocd_offset = metadata.st_size - tail_size + eocd_offset
    if comment_size != 0:
        raise ValueError("Android bundle ZIP comments are not accepted")
    if disk != 0 or central_disk != 0 or disk_entries != total_entries:
        raise ValueError("Android bundle must be a single-disk ZIP")
    if total_entries == 0xFFFF or central_size == 0xFFFFFFFF or central_offset == 0xFFFFFFFF:
        raise ValueError("Android bundle ZIP64 metadata is not accepted")
    if total_entries < 1 or total_entries > MAX_VERIFIER_ENTRIES or central_size > MAX_AAB_CENTRAL_DIRECTORY_BYTES:
        raise ValueError("Android bundle central directory exceeds its evidence limit")
    if absolute_eocd_offset + 22 + comment_size != metadata.st_size:
        raise ValueError("Android bundle end record does not terminate the sealed artifact")
    if central_offset + central_size != absolute_eocd_offset:
        raise ValueError("Android bundle central directory is not contiguous with its end record")
    central = os.pread(descriptor, central_size, central_offset)
    if len(central) != central_size:
        raise ValueError("Android bundle central directory changed during preflight")
    position = 0
    parsed_entries = 0
    expected_local_offset = 0
    layout_identity = hashlib.sha256()
    while position < len(central):
        if len(central) - position < 46 or central[position:position + 4] != b"PK\x01\x02":
            raise ValueError("Android bundle central directory is malformed")
        name_size, extra_size, comment_size = struct.unpack_from("<HHH", central, position + 28)
        if comment_size != 0 or extra_size != 0:
            raise ValueError("Android bundle entry comments and extra fields are not accepted")
        flags, compression = struct.unpack_from("<HH", central, position + 8)
        modified_time, modified_date = struct.unpack_from("<HH", central, position + 12)
        if (modified_time, modified_date) != (EXPECTED_ANDROID_ZIP_DOS_TIME, EXPECTED_ANDROID_ZIP_DOS_DATE):
            raise ValueError("Android bundle entry timestamps are not canonical")
        local_offset = struct.unpack_from("<I", central, position + 42)[0]
        compressed_size = struct.unpack_from("<I", central, position + 20)[0]
        if local_offset != expected_local_offset:
            raise ValueError("Android bundle local entry spans are not mutually contiguous")
        local_header = os.pread(descriptor, 30, local_offset)
        local_name_size, local_extra_size = struct.unpack_from("<HH", local_header, 26) if len(local_header) == 30 else (0, 0)
        local_name = os.pread(descriptor, local_name_size, local_offset + 30) if len(local_header) == 30 else b""
        if len(local_header) != 30 or local_header[:4] != b"PK\x03\x04" \
                or local_header[4:6] != central[position + 6:position + 8] \
                or struct.unpack_from("<HH", local_header, 6) != (flags, compression) \
                or struct.unpack_from("<HH", local_header, 10) != (modified_time, modified_date) \
                or struct.unpack_from("<III", local_header, 14) != struct.unpack_from("<III", central, position + 16) \
                or local_extra_size != 0 or local_name != central[position + 46:position + 46 + name_size]:
            raise ValueError("Android bundle local header metadata is not canonical")
        expected_local_offset = local_offset + 30 + local_name_size + local_extra_size + compressed_size
        entry_name = central[position + 46:position + 46 + name_size]
        if any(byte < 0x20 or byte == 0x7F for byte in entry_name):
            raise ValueError("Android bundle entry path contains control characters")
        if entry_name.startswith(b"/") or b"\\" in entry_name or any(part in (b"", b".", b"..") for part in entry_name.rstrip(b"/").split(b"/")):
            raise ValueError("Android bundle entry path is not a canonical relative path")
        if flags != 0 or compression != zipfile.ZIP_DEFLATED:
            raise ValueError("Android bundle entries must use canonical raw DEFLATE representation")
        # Bind central-directory order and the representation metadata that is
        # expected to survive deterministic re-signing. Expanded payload bytes
        # and signature-control names are bound separately.
        layout_fields = struct.unpack_from("<6H3I5H2I", central, position + 4)
        layout_identity.update(str(parsed_entries).encode("ascii"))
        layout_identity.update(b"\0")
        layout_identity.update(entry_name)
        layout_identity.update(b"\0")
        layout_identity.update(b",".join(str(field).encode("ascii") for field in (
            layout_fields[0], layout_fields[1], layout_fields[2],
            layout_fields[3], layout_fields[4], layout_fields[5],
            layout_fields[11], layout_fields[12], layout_fields[13],
            layout_fields[14],
        )))
        layout_identity.update(b"\n")
        position += 46 + name_size + extra_size + comment_size
        parsed_entries += 1
        if parsed_entries > MAX_VERIFIER_ENTRIES or position > len(central):
            raise ValueError("Android bundle central directory exceeds its evidence limit")
    if parsed_entries != total_entries:
        raise ValueError("Android bundle central-directory count does not match its end record")
    if expected_local_offset != central_offset:
        raise ValueError("Android bundle local entry spans do not terminate at the central directory")
    total = 0
    count = 0
    compressed_payload_identity = hashlib.sha256()
    with os.fdopen(os.dup(descriptor), "rb") as artifact_file, zipfile.ZipFile(artifact_file) as bundle:
        for info in bundle.infolist():
            count += 1
            if count > MAX_VERIFIER_ENTRIES:
                raise ValueError("Android bundle exceeds its verifier entry-count limit")
            if info.file_size < 0 or info.file_size > MAX_AAB_ENTRY_BYTES:
                raise ValueError("Android bundle entry exceeds its expanded-size limit")
            total += info.file_size
            if total > MAX_AAB_EXPANDED_BYTES:
                raise ValueError("Android bundle exceeds its aggregate expanded-size limit")
            local_header = os.pread(descriptor, 30, info.header_offset)
            local_name_size, local_extra_size = struct.unpack_from("<HH", local_header, 26)
            compressed_offset = info.header_offset + 30 + local_name_size + local_extra_size
            compressed_digest = hashlib.sha256()
            compressed_observed = 0
            while compressed_observed < info.compress_size:
                chunk = os.pread(descriptor, min(1024 * 1024, info.compress_size - compressed_observed), compressed_offset + compressed_observed)
                if not chunk:
                    raise ValueError("Android bundle compressed entry changed during inspection")
                compressed_observed += len(chunk)
                compressed_digest.update(chunk)
            if SIGNATURE_CONTROL.fullmatch(info.filename) or info.filename == "BUNDLE-METADATA/com.android.tools/r8.json":
                canonical_digest = hashlib.sha256()
                canonical_size = 0
                compression_level = 1 if SIGNATURE_CONTROL.fullmatch(info.filename) else 6
                compressor = zlib.compressobj(level=compression_level, method=zlib.DEFLATED, wbits=-15)
                with bundle.open(info) as entry:
                    while chunk := entry.read(1024 * 1024):
                        canonical = compressor.compress(chunk)
                        canonical_size += len(canonical)
                        canonical_digest.update(canonical)
                canonical = compressor.flush()
                canonical_size += len(canonical)
                canonical_digest.update(canonical)
                if canonical_size != info.compress_size or canonical_digest.digest() != compressed_digest.digest():
                    raise ValueError("Android bundle nondeterministic entry does not use its canonical raw DEFLATE bytes")
            else:
                compressed_payload_identity.update(str(count).encode("ascii"))
                compressed_payload_identity.update(b"\0")
                compressed_payload_identity.update(info.filename.encode("utf-8"))
                compressed_payload_identity.update(b"\0")
                compressed_payload_identity.update(str(info.compress_size).encode("ascii"))
                compressed_payload_identity.update(b"\0")
                compressed_payload_identity.update(compressed_digest.hexdigest().encode("ascii"))
                compressed_payload_identity.update(b"\n")
    if count != total_entries:
        raise ValueError("Android bundle central-directory entry count changed during inspection")
    return total_entries, layout_identity.hexdigest(), compressed_payload_identity.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("apk", "aab"))
    parser.add_argument("java_path")
    parser.add_argument("tool_digests", nargs="*")
    arguments = parser.parse_args()
    descriptor, size, digest = sealed_snapshot(3)
    tool_descriptors: list[int] = []
    try:
        java_path = arguments.java_path
        source_descriptors = (4,) if arguments.kind == "apk" else ()
        if len(arguments.tool_digests) != len(source_descriptors):
            raise ValueError(f"{arguments.kind.upper()} verification received the wrong trusted tool digest count")
        for source_descriptor, expected_digest in zip(source_descriptors, arguments.tool_digests, strict=True):
            tool_descriptor, observed_digest = sealed_executable_snapshot(source_descriptor)
            tool_descriptors.append(tool_descriptor)
            if observed_digest != expected_digest:
                raise ValueError("Android verifier tool snapshot differs from its trusted bytes")
        aab_preflight = preflight_aab(descriptor) if arguments.kind == "aab" else None
        held_path = f"/proc/self/fd/{descriptor}"
        result: dict[str, object] = {"size": size, "sha256": digest}
        result["payloadTreeSha256"], result["payloadEntryCount"], result["signatureControlEntries"] = canonical_zip_payload_digest(descriptor)
        if arguments.kind == "apk":
            result["apkSigningBlockIds"] = apk_signing_block_ids(descriptor)
            result["verificationOutput"] = run(
                [java_path, "-Xmx1024M", "-jar", f"/proc/self/fd/{tool_descriptors[0]}", "verify", "--verbose", "--print-certs", held_path],
                (descriptor, *tool_descriptors),
            )
        else:
            assert aab_preflight is not None
            expected_aab_entries, result["archiveLayoutSha256"], result["compressedPayloadTreeSha256"] = aab_preflight
            result.update(inspect_jar_signatures(
                [java_path, "-Duser.language=en", "-Duser.country=US", "sun.security.tools.jarsigner.Main", "-verify", "-verbose", "-certs", held_path],
                (descriptor,),
            ))
            result["signatureControlTreeSha256"] = canonical_aab_signature_control_digest(descriptor)
            if result["contentEntryCount"] != expected_aab_entries:
                raise ValueError("Android jarsigner entry inventory differs from the sealed ZIP directory")
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
