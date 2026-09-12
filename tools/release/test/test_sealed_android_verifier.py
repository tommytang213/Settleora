import base64
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import struct
import tempfile
import unittest
import zipfile


MODULE_PATH = pathlib.Path(__file__).parents[1] / "sealed_android_verifier.py"
SPEC = importlib.util.spec_from_file_location("sealed_android_verifier", MODULE_PATH)
VERIFIER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VERIFIER)


class SealedAndroidVerifierTests(unittest.TestCase):
    def test_aab_signature_control_digest_rejects_resigned_extra_metadata(self):
        payload = b"exact payload"
        payload_digest = base64.b64encode(hashlib.sha256(payload).digest()).decode("ascii")

        def artifact(extra_manifest_attribute=""):
            manifest = (
                "Manifest-Version: 1.0\r\n"
                "Built-By: Signflinger\r\n"
                "Created-By: Signflinger\r\n"
                f"{extra_manifest_attribute}"
                "\r\n"
                "Name: base/payload\r\n"
                f"SHA-256-Digest: {payload_digest}\r\n\r\n"
            ).encode("ascii")
            manifest_section = manifest.split(b"\r\n\r\n", 1)[1]
            sf = (
                "Signature-Version: 1.0\r\n"
                "Created-By: Signflinger\r\n"
                f"SHA-256-Digest-Manifest: {base64.b64encode(hashlib.sha256(manifest).digest()).decode('ascii')}\r\n\r\n"
                "Name: base/payload\r\n"
                f"SHA-256-Digest: {base64.b64encode(hashlib.sha256(manifest_section).digest()).decode('ascii')}\r\n\r\n"
            ).encode("ascii")
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as output:
                for name, contents in (
                    ("base/payload", payload),
                    ("META-INF/MANIFEST.MF", manifest),
                    ("META-INF/ANDROIDD.SF", sf),
                    ("META-INF/ANDROIDD.RSA", b"bounded certificate block"),
                ):
                    entry = zipfile.ZipInfo(name, date_time=(1981, 1, 1, 1, 1, 2))
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    entry._compresslevel = 1
                    output.writestr(entry, contents)
            return archive.getvalue()

        with tempfile.TemporaryFile() as source:
            source.write(artifact())
            source.seek(0)
            self.assertRegex(VERIFIER.canonical_aab_signature_control_digest(source.fileno()), r"^[0-9a-f]{64}$")
        with tempfile.TemporaryFile() as source:
            source.write(artifact("Release-Claim: injected\r\n"))
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "main attributes are not canonical"):
                VERIFIER.canonical_aab_signature_control_digest(source.fileno())

    def test_unsigned_count_ignores_directory_and_signature_control_records(self):
        verification = "\n".join(
            (
                "      0 Fri Jan 01 00:00:00 UTC 2026 BUNDLE-METADATA/",
                "      5 Fri Jan 01 00:00:00 UTC 2026 META-INF/CERT.SF",
                "sm    7 Fri Jan 01 00:00:00 UTC 2026 base/assets/signed.txt",
                "    ?      9 Fri Jan 01 00:00:00 UTC 2026 base/assets/unsigned.txt",
                "    ?     16 Fri Jan 01 00:00:00 UTC 2026 base/assets/payload/",
                "    ?      7 Fri Jan 01 00:00:00 UTC 2026 payload META-INF/FAKE.SF",
                "    ?      8 Fri Jan 01 00:00:00 UTC 2026  META-INF/FAKE.SF",
            )
        )
        self.assertEqual(VERIFIER.unsigned_content_entry_count(verification), (7, 4))

    def test_bounded_digest_rejects_from_metadata_before_opening_entry(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            output.writestr("large", b"0" * 4096)
        archive.seek(0)
        with zipfile.ZipFile(archive) as bundle:
            with self.assertRaisesRegex(ValueError, "exceeds the sealed verification limit"):
                VERIFIER.bounded_zip_entry_digest(bundle, "large", 1024, "fixture")

    def test_bounded_digest_hashes_the_complete_entry(self):
        payload = b"bounded mapping evidence"
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("mapping", payload)
        archive.seek(0)
        with zipfile.ZipFile(archive) as bundle:
            self.assertEqual(
                VERIFIER.bounded_zip_entry_digest(bundle, "mapping", 1024, "fixture"),
                hashlib.sha256(payload).hexdigest(),
            )

    def test_payload_digest_ignores_signature_metadata_but_binds_content(self):
        def archive(payload: bytes, signature: bytes) -> bytes:
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as bundle:
                bundle.writestr("payload.txt", payload)
                bundle.writestr("META-INF/CERT.SF", signature)
            return output.getvalue()

        def identity(data: bytes) -> tuple[str, int]:
            with tempfile.TemporaryFile() as source:
                source.write(data)
                source.seek(0)
                return VERIFIER.canonical_zip_payload_digest(source.fileno())

        self.assertEqual(identity(archive(b"same", b"one")), identity(archive(b"same", b"two")))
        self.assertNotEqual(identity(archive(b"same", b"one")), identity(archive(b"changed", b"one")))

    def test_payload_identity_binds_complete_signature_control_names(self):
        def identity(extra: bool) -> tuple[str, int, list[str]]:
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as bundle:
                bundle.writestr("payload.txt", b"same")
                bundle.writestr("META-INF/CERT.SF", b"signature")
                if extra:
                    bundle.writestr("META-INF/EXTRA.SF", b"unparsable")
            with tempfile.TemporaryFile() as source:
                source.write(output.getvalue())
                source.seek(0)
                return VERIFIER.canonical_zip_payload_digest(source.fileno())

        baseline = identity(False)
        altered = identity(True)
        self.assertEqual(baseline[:2], altered[:2])
        self.assertNotEqual(baseline[2], altered[2])

    def test_payload_digest_normalizes_only_r8_build_duration(self):
        def archive(duration: int, checksum: str) -> bytes:
            output = io.BytesIO()
            metadata = {"compilation": {"buildTimeNs": duration, "numberOfThreads": 6}, "dexFiles": [{"checksum": checksum}]}
            with zipfile.ZipFile(output, "w") as bundle:
                bundle.writestr("BUNDLE-METADATA/com.android.tools/r8.json", json.dumps(metadata))
                bundle.writestr("payload.txt", b"same")
            return output.getvalue()

        def identity(data: bytes) -> tuple[str, int]:
            with tempfile.TemporaryFile() as source:
                source.write(data)
                source.seek(0)
                return VERIFIER.canonical_zip_payload_digest(source.fileno())

        self.assertEqual(identity(archive(1, "same")), identity(archive(2, "same")))
        self.assertNotEqual(identity(archive(1, "same")), identity(archive(1, "changed")))

    def test_payload_digest_rejects_duplicate_r8_members(self):
        output = io.BytesIO()
        duplicate = b'{"compilation":{"numberOfThreads":999},"compilation":{"buildTimeNs":1,"numberOfThreads":6}}'
        with zipfile.ZipFile(output, "w") as bundle:
            bundle.writestr("BUNDLE-METADATA/com.android.tools/r8.json", duplicate)
        with tempfile.TemporaryFile() as source:
            source.write(output.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "duplicate JSON object member"):
                VERIFIER.canonical_zip_payload_digest(source.fileno())

    def test_streamed_jarsigner_output_is_bounded(self):
        prior = VERIFIER.MAX_VERIFIER_OUTPUT_BYTES
        VERIFIER.MAX_VERIFIER_OUTPUT_BYTES = 8
        try:
            with self.assertRaisesRegex(ValueError, "output exceeds its evidence size limit"):
                VERIFIER.inspect_jar_signatures(["/usr/bin/printf", "123456789"], ())
        finally:
            VERIFIER.MAX_VERIFIER_OUTPUT_BYTES = prior

    def test_executable_snapshot_is_immutable_after_source_change(self):
        with tempfile.NamedTemporaryFile() as source:
            source.write(b"first executable bytes")
            source.flush()
            source.seek(0)
            sealed, digest = VERIFIER.sealed_executable_snapshot(source.fileno())
            try:
                self.assertEqual(digest, hashlib.sha256(b"first executable bytes").hexdigest())
                source.seek(0)
                source.write(b"later executable bytes")
                source.flush()
                os.lseek(sealed, 0, os.SEEK_SET)
                self.assertEqual(os.read(sealed, 1024), b"first executable bytes")
                with self.assertRaises(OSError):
                    os.write(sealed, b"tamper")
            finally:
                os.close(sealed)

    def test_aab_preflight_rejects_excessive_declared_expansion(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            entry = zipfile.ZipInfo("expanded", date_time=(1981, 1, 1, 1, 1, 2))
            entry.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(entry, b"0" * 4096)
        archive.seek(0)
        prior = VERIFIER.MAX_AAB_ENTRY_BYTES
        VERIFIER.MAX_AAB_ENTRY_BYTES = 1024
        try:
            with tempfile.TemporaryFile() as source:
                source.write(archive.getvalue())
                source.seek(0)
                with self.assertRaisesRegex(ValueError, "expanded-size limit"):
                    VERIFIER.preflight_aab(source.fileno())
        finally:
            VERIFIER.MAX_AAB_ENTRY_BYTES = prior

    def test_aab_preflight_rejects_prepended_directory_adjustment(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("entry", b"content")
        with tempfile.TemporaryFile() as source:
            source.write(b"prepended" + archive.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "not contiguous"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_preflight_rejects_bytes_between_entries_and_central_directory(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            entry = zipfile.ZipInfo("entry", date_time=(1981, 1, 1, 1, 1, 2))
            entry.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(entry, b"content")
        mutated = bytearray(archive.getvalue())
        eocd_offset = mutated.rfind(b"PK\x05\x06")
        central_offset = struct.unpack_from("<I", mutated, eocd_offset + 16)[0]
        gap = b"unbound-interstitial-bytes"
        mutated[central_offset:central_offset] = gap
        struct.pack_into("<I", mutated, eocd_offset + len(gap) + 16, central_offset + len(gap))
        with tempfile.TemporaryFile() as source:
            source.write(mutated)
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "terminate at the central directory"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_preflight_rejects_local_version_mismatch(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            entry = zipfile.ZipInfo("entry", date_time=(1981, 1, 1, 1, 1, 2))
            entry.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(entry, b"content")
        mutated = bytearray(archive.getvalue())
        struct.pack_into("<H", mutated, 4, struct.unpack_from("<H", mutated, 4)[0] + 1)
        with tempfile.TemporaryFile() as source:
            source.write(mutated)
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "local header metadata"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_preflight_rejects_archive_comment(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("entry", b"content")
            output.comment = b"unbound comment"
        with tempfile.TemporaryFile() as source:
            source.write(archive.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "ZIP comments"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_preflight_rejects_entry_comment(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            entry = zipfile.ZipInfo("entry")
            entry.comment = b"unbound entry comment"
            output.writestr(entry, b"content")
        with tempfile.TemporaryFile() as source:
            source.write(archive.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "entry comments"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_preflight_rejects_entry_extra_fields(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            entry = zipfile.ZipInfo("entry", date_time=(1981, 1, 1, 1, 1, 2))
            entry.extra = b"\x01\x00\x02\x00xx"
            output.writestr(entry, b"content")
        with tempfile.TemporaryFile() as source:
            source.write(archive.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "extra fields"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_preflight_rejects_noncanonical_entry_timestamp(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            entry = zipfile.ZipInfo("entry", date_time=(2026, 9, 12, 12, 0, 0))
            output.writestr(entry, b"content")
        with tempfile.TemporaryFile() as source:
            source.write(archive.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "timestamps are not canonical"):
                VERIFIER.preflight_aab(source.fileno())

    def test_aab_requires_canonical_compression_and_binds_entry_order(self):
        def identity(compression: int, names: tuple[str, ...]) -> str:
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w", compresslevel=6) as output:
                for name in names:
                    entry = zipfile.ZipInfo(name, date_time=(1981, 1, 1, 1, 1, 2))
                    entry.compress_type = compression
                    output.writestr(entry, b"identical expanded content")
            with tempfile.TemporaryFile() as source:
                source.write(archive.getvalue())
                source.seek(0)
                return VERIFIER.preflight_aab(source.fileno())[1]

        baseline = identity(zipfile.ZIP_DEFLATED, ("a", "b"))
        with self.assertRaisesRegex(ValueError, "canonical raw DEFLATE representation"):
            identity(zipfile.ZIP_STORED, ("a", "b"))
        self.assertNotEqual(baseline, identity(zipfile.ZIP_DEFLATED, ("b", "a")))

        def compressed_identity(level: int) -> str:
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as output:
                entry = zipfile.ZipInfo("recompressed", date_time=(1981, 1, 1, 1, 1, 2))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry._compresslevel = level
                output.writestr(entry, b"compressible content " * 4096)
            with tempfile.TemporaryFile() as source:
                source.write(archive.getvalue())
                source.seek(0)
                return VERIFIER.preflight_aab(source.fileno())[2]

        self.assertNotEqual(compressed_identity(1), compressed_identity(9))

    def test_apk_signing_block_rejects_unknown_ids(self):
        def artifact(identifiers, values=None):
            values = values or {}
            pairs = b"".join(
                struct.pack("<QI", 4 + len(values.get(identifier, b"")), identifier) + values.get(identifier, b"")
                for identifier in identifiers
            )
            block_size = len(pairs) + 24
            block = struct.pack("<Q", block_size) + pairs + struct.pack("<Q", block_size) + VERIFIER.APK_SIGNING_BLOCK_MAGIC
            eocd = b"PK\x05\x06" + struct.pack("<HHHHIIH", 0, 0, 0, 0, 0, len(block), 0)
            return block + eocd

        with tempfile.TemporaryFile() as source:
            source.write(artifact(VERIFIER.EXPECTED_APK_SIGNING_BLOCK_IDS))
            source.seek(0)
            self.assertEqual(VERIFIER.apk_signing_block_ids(source.fileno()), ["42726577", "504b4453", "7109871a"])
        with tempfile.TemporaryFile() as source:
            source.write(artifact((*VERIFIER.EXPECTED_APK_SIGNING_BLOCK_IDS, 0xDEADBEEF)))
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "unexpected ID inventory"):
                VERIFIER.apk_signing_block_ids(source.fileno())
        with tempfile.TemporaryFile() as source:
            source.write(artifact(VERIFIER.EXPECTED_APK_SIGNING_BLOCK_IDS, {0x42726577: b"\0\1"}))
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "padding is not canonical zero bytes"):
                VERIFIER.apk_signing_block_ids(source.fileno())

    def test_apk_representation_binds_zip_order_and_compression(self):
        def artifact(names: tuple[str, ...], compression: int) -> bytes:
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w") as output:
                for name in names:
                    entry = zipfile.ZipInfo(name, date_time=(1981, 1, 1, 1, 1, 2))
                    entry.compress_type = compression
                    output.writestr(entry, b"same expanded payload" * 100)
            raw = archive.getvalue()
            eocd_offset = raw.rfind(b"PK\x05\x06")
            central_offset = struct.unpack_from("<I", raw, eocd_offset + 16)[0]
            pairs = b"".join(struct.pack("<QI", 4, identifier) for identifier in VERIFIER.EXPECTED_APK_SIGNING_BLOCK_IDS)
            block_size = len(pairs) + 24
            block = struct.pack("<Q", block_size) + pairs + struct.pack("<Q", block_size) + VERIFIER.APK_SIGNING_BLOCK_MAGIC
            result = bytearray(raw[:central_offset] + block + raw[central_offset:])
            struct.pack_into("<I", result, eocd_offset + len(block) + 16, central_offset + len(block))
            return bytes(result)

        def identity(data: bytes) -> tuple[str, str]:
            with tempfile.TemporaryFile() as source:
                source.write(data)
                source.seek(0)
                return VERIFIER.apk_representation(source.fileno())[1:]

        baseline = identity(artifact(("a", "b"), zipfile.ZIP_DEFLATED))
        self.assertNotEqual(baseline, identity(artifact(("b", "a"), zipfile.ZIP_DEFLATED)))
        self.assertNotEqual(baseline, identity(artifact(("a", "b"), zipfile.ZIP_STORED)))

    def test_aab_preflight_rejects_multiline_entry_name(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            entry = zipfile.ZipInfo("\nbase/assets/payload", date_time=(1981, 1, 1, 1, 1, 2))
            output.writestr(entry, b"content")
        with tempfile.TemporaryFile() as source:
            source.write(archive.getvalue())
            source.seek(0)
            with self.assertRaisesRegex(ValueError, "control characters"):
                VERIFIER.preflight_aab(source.fileno())


if __name__ == "__main__":
    unittest.main()
