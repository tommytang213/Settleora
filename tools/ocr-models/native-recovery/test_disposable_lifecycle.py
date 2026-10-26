import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import disposable_lifecycle as life

PIN = "a" * 64

class LifecycleTests(unittest.TestCase):
    def test_unique_private_run_binds_inputs_and_never_retries(self):
        with tempfile.TemporaryDirectory() as parent:
            root = life.prepare(Path(parent)/"run", source_sha256=PIN,
                packet_sha256=PIN, image_sha256=PIN, command_sha256=PIN)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            self.assertEqual(json.loads((root/"manifest.json").read_text())["automaticRetries"], 0)
            with self.assertRaises(FileExistsError):
                life.prepare(root, source_sha256=PIN, packet_sha256=PIN,
                             image_sha256=PIN, command_sha256=PIN)
            (root/"scratch"/"log").write_bytes(b"failure evidence")
            life.capture(root,"tool_result","log")
            terminal=life.finish(root,test_exit_code=1,cleanup_verified=False,
                                 diagnostics=["tool_result"])
            self.assertFalse(terminal["nativeReady"])
            self.assertTrue(terminal["requiresNewAdmission"])
            with self.assertRaises(FileExistsError):
                life.finish(root,test_exit_code=0,cleanup_verified=True,
                            diagnostics=["tool_result"])
            self.assertEqual((root/"diagnostics"/"tool_result.log").read_bytes(),b"failure evidence")

    def test_bounded_capture_records_truncation_without_exposing_content_in_receipt(self):
        with tempfile.TemporaryDirectory() as parent, patch.object(life,"CAP_BYTES",8):
            root=life.prepare(Path(parent)/"run",source_sha256=PIN,
                packet_sha256=PIN,image_sha256=PIN,command_sha256=PIN)
            (root/"scratch"/"log").write_bytes(b"secret-secret")
            result=life.capture(root,"flutter_stderr","log")
            self.assertEqual(result,{"name":"flutter_stderr","retainedBytes":8,"truncated":True})
            self.assertEqual((root/"diagnostics"/"flutter_stderr.log").read_bytes(),b"secret-s")
            self.assertNotIn("secret",(root/"diagnostics"/"flutter_stderr.json").read_text())

    def test_rejects_symlink_escape_and_unapproved_diagnostic(self):
        with tempfile.TemporaryDirectory() as parent:
            root=life.prepare(Path(parent)/"run",source_sha256=PIN,
                packet_sha256=PIN,image_sha256=PIN,command_sha256=PIN)
            (root/"scratch"/"link").symlink_to("/etc/hosts")
            for name,source in [("census","link"),("unknown","link"),("census","../manifest.json")]:
                with self.subTest(name=name,source=source),self.assertRaises((RuntimeError,ValueError)):
                    life.capture(root,name,source)
            with self.assertRaises(RuntimeError):
                life.finish(root,test_exit_code=0,cleanup_verified=True,diagnostics=["census"])

    def test_terminal_rejects_changed_retained_diagnostic(self):
        with tempfile.TemporaryDirectory() as parent:
            root=life.prepare(Path(parent)/"run",source_sha256=PIN,
                packet_sha256=PIN,image_sha256=PIN,command_sha256=PIN)
            (root/"scratch"/"log").write_bytes(b"original")
            life.capture(root,"census","log")
            (root/"diagnostics"/"census.log").write_bytes(b"changed")
            with self.assertRaisesRegex(RuntimeError,"diagnostic evidence changed"):
                life.finish(root,test_exit_code=1,cleanup_verified=False,diagnostics=["census"])

    def test_run_path_rejects_linked_ancestor_at_prepare_and_capture(self):
        with tempfile.TemporaryDirectory() as parent:
            real=Path(parent)/"real";real.mkdir()
            owned=real/"owned";owned.mkdir()
            alias=Path(parent)/"alias";alias.symlink_to(real, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError,"linked run ancestor"):
                life.prepare(alias/"owned"/"run",source_sha256=PIN,
                    packet_sha256=PIN,image_sha256=PIN,command_sha256=PIN)
            root=life.prepare(owned/"run",source_sha256=PIN,
                packet_sha256=PIN,image_sha256=PIN,command_sha256=PIN)
            (root/"scratch"/"log").write_bytes(b"evidence")
            with self.assertRaisesRegex(RuntimeError,"linked run ancestor"):
                life.capture(alias/"owned"/"run","census","log")

if __name__ == "__main__": unittest.main()
