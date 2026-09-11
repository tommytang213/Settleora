import hashlib
import importlib.util
import io
import pathlib
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


if __name__ == "__main__":
    unittest.main()
