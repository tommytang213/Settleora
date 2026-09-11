import hashlib
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest
import zipfile


MODULE_PATH = pathlib.Path(__file__).parents[1] / "sealed_android_verifier.py"
SPEC = importlib.util.spec_from_file_location("sealed_android_verifier", MODULE_PATH)
VERIFIER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VERIFIER)


class SealedAndroidVerifierTests(unittest.TestCase):
    def test_unsigned_count_ignores_directory_and_signature_control_records(self):
        verification = "\n".join(
            (
                "      0 Fri Jan 01 00:00:00 UTC 2026 BUNDLE-METADATA/",
                "      5 Fri Jan 01 00:00:00 UTC 2026 META-INF/CERT.SF",
                "sm    7 Fri Jan 01 00:00:00 UTC 2026 base/assets/signed.txt",
                "    ?      9 Fri Jan 01 00:00:00 UTC 2026 base/assets/unsigned.txt",
                "    ?     16 Fri Jan 01 00:00:00 UTC 2026 base/assets/payload/",
            )
        )
        self.assertEqual(VERIFIER.unsigned_content_entry_count(verification), (5, 2))

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
            sealed = VERIFIER.sealed_executable_snapshot(source.fileno())
            try:
                source.seek(0)
                source.write(b"later executable bytes")
                source.flush()
                os.lseek(sealed, 0, os.SEEK_SET)
                self.assertEqual(os.read(sealed, 1024), b"first executable bytes")
                with self.assertRaises(OSError):
                    os.write(sealed, b"tamper")
            finally:
                os.close(sealed)


if __name__ == "__main__":
    unittest.main()
