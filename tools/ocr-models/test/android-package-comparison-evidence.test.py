"""Bounded privacy and malformed-input checks for failure-only APK diagnostics."""

import io
import json
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "android-package-comparison-evidence.py"
LIBRARIES = [
    f"lib/{abi}/{name}"
    for abi in ("arm64-v8a", "armeabi-v7a", "x86_64")
    for name in ("libapp.so", "libdartjni.so")
]
SOURCE_SHA = "a" * 40
PRIVATE = b"PRIVATE_RECEIPT_TEXT_123"


def elf(build_id=b"\x12" * 20, text=PRIVATE):
    note = struct.pack("<III", 4, len(build_id), 3) + b"GNU\0" + build_id
    note += b"\0" * ((-len(note)) % 4)
    note_offset = 64
    text_offset = note_offset + len(note)
    section_offset = text_offset + len(text)
    ident = b"\x7fELF" + bytes((2, 1, 1)) + bytes(9)
    header = struct.pack("<HHIQQQIHHHHHH", 3, 62, 1, 0, 0,
                         section_offset, 0, 64, 0, 0, 64, 3, 0)
    null = bytes(64)
    note_header = struct.pack("<IIQQQQIIQQ", 0, 7, 0, 0,
                              note_offset, len(note), 0, 0, 4, 0)
    text_header = struct.pack("<IIQQQQIIQQ", 0, 1, 6, 0,
                              text_offset, len(text), 0, 0, 1, 0)
    return ident + header + note + text + null + note_header + text_header


def package(path, libraries=None):
    libraries = LIBRARIES if libraries is None else libraries
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in libraries:
            archive.writestr(name, elf())
        for index in range(444 - len(libraries)):
            archive.writestr(f"assets/safe-{index:03d}.bin", b"SAFE")


class PackageComparisonEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.apk = self.root / "candidate.apk"
        self.output = self.root / "evidence.json"
        package(self.apk)

    def run_tool(self, source=SOURCE_SHA):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--package", str(self.apk),
             "--source-sha", source, "--out", str(self.output)],
            text=True, capture_output=True, check=False,
        )

    def test_bounded_schema_and_no_payload_or_local_paths(self):
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        raw = self.output.read_bytes()
        self.assertLess(len(raw), 128 * 1024)
        self.assertNotIn(PRIVATE, raw)
        self.assertNotIn(str(self.root).encode(), raw)
        self.assertNotIn(b"assets/safe-", raw)
        evidence = json.loads(raw)
        self.assertEqual(evidence["schemaVersion"], 2)
        self.assertEqual(evidence["entryCount"], 444)
        self.assertEqual(evidence["otherEntryCount"], 438)
        self.assertEqual([row["path"] for row in evidence["nativeLibraries"]],
                         sorted(LIBRARIES))
        for row in evidence["nativeLibraries"]:
            self.assertEqual(row["elf"]["class"], 64)
            self.assertEqual(row["elf"]["buildIds"], ["12" * 20])
            self.assertEqual(len(row["elf"]["sections"]), 3)
            self.assertEqual(row["zip"]["method"], 8)
            self.assertEqual(len(row["zip"]["compressedSha256"]), 64)
            self.assertEqual(row["elf"]["sections"][2]["bytes"], len(PRIVATE))

    def test_rejects_unlisted_or_missing_library(self):
        package(self.apk, LIBRARIES[:-1])
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(str(self.root), result.stderr + result.stdout)
        self.assertNotIn(PRIVATE.decode(), result.stderr + result.stdout)
        self.assertFalse(self.output.exists())

    def test_rejects_oversized_archive(self):
        with self.apk.open("wb") as output:
            output.truncate(400 * 1024 * 1024 + 1)
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(str(self.root), result.stderr + result.stdout)
        self.assertNotIn(PRIVATE.decode(), result.stderr + result.stdout)
        self.assertFalse(self.output.exists())

    def test_rejects_invalid_identity(self):
        result = self.run_tool("not-a-sha")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_rejects_malformed_elf_section_bounds(self):
        bad = bytearray(elf())
        struct.pack_into("<Q", bad, 40, len(bad) + 1)
        with zipfile.ZipFile(self.apk, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in LIBRARIES:
                archive.writestr(name, bad if name == LIBRARIES[0] else elf())
            for index in range(438):
                archive.writestr(f"assets/safe-{index:03d}.bin", b"SAFE")
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(str(self.root), result.stderr + result.stdout)
        self.assertNotIn(PRIVATE.decode(), result.stderr + result.stdout)
        self.assertFalse(self.output.exists())

    def test_reports_bounded_nonzero_alignment_extra_without_leaking_bytes(self):
        with zipfile.ZipFile(self.apk, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in LIBRARIES:
                entry = zipfile.ZipInfo(name)
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.extra = struct.pack("<HH4s", 0xD935, 4, b"ABCD")
                archive.writestr(entry, elf())
            for index in range(438):
                archive.writestr(f"assets/safe-{index:03d}.bin", b"SAFE")
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        raw = self.output.read_bytes()
        self.assertNotIn(b"ABCD", raw)
        for row in json.loads(raw)["nativeLibraries"]:
            self.assertFalse(row["zip"]["localExtraAllZero"])
            self.assertEqual(row["zip"]["localExtraBytes"], 8)
            self.assertEqual(len(row["zip"]["localExtraSha256"]), 64)

    def test_rejects_malformed_alignment_extra(self):
        with zipfile.ZipFile(self.apk, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in LIBRARIES:
                entry = zipfile.ZipInfo(name)
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.extra = struct.pack("<HH4s", 0xD935, 12, b"ABCD")
                archive.writestr(entry, elf())
            for index in range(438):
                archive.writestr(f"assets/safe-{index:03d}.bin", b"SAFE")
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def write_descriptor_package(self):
        class NonSeekable(io.BytesIO):
            def seek(self, *args):
                raise OSError("nonseekable")

            def seekable(self):
                return False

        output = NonSeekable()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in LIBRARIES:
                archive.writestr(name, elf())
            for index in range(438):
                archive.writestr(f"assets/safe-{index:03d}.bin", b"SAFE")
        self.apk.write_bytes(output.getvalue())

    def test_reports_bounded_zip_data_descriptors(self):
        self.write_descriptor_package()
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        for row in json.loads(self.output.read_text())["nativeLibraries"]:
            self.assertEqual(row["zip"]["flags"], 8)
            self.assertIn(row["zip"]["dataDescriptorBytes"], (12, 16))
            self.assertEqual(len(row["zip"]["dataDescriptorSha256"]), 64)

    def test_rejects_malformed_zip_data_descriptor(self):
        self.write_descriptor_package()
        with zipfile.ZipFile(self.apk) as archive:
            entry = archive.getinfo(LIBRARIES[0])
        content = bytearray(self.apk.read_bytes())
        name_length, extra_length = struct.unpack_from(
            "<HH", content, entry.header_offset + 26)
        descriptor_offset = (entry.header_offset + 30 + name_length +
                             extra_length + entry.compress_size)
        if struct.unpack_from("<I", content, descriptor_offset)[0] == 0x08074B50:
            descriptor_offset += 4
        content[descriptor_offset] ^= 1
        self.apk.write_bytes(content)
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_rejects_local_zip_field_mismatch(self):
        content = bytearray(self.apk.read_bytes())
        # First local header CRC differs from the matching central entry.
        struct.pack_into("<I", content, 14, 0)
        self.apk.write_bytes(content)
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(str(self.root), result.stderr + result.stdout)
        self.assertNotIn(PRIVATE.decode(), result.stderr + result.stdout)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
