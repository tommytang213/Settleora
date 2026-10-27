import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import disposable_lifecycle as life

PIN = "a" * 64

class LifecycleTests(unittest.TestCase):
    def test_write_once_syncs_file_then_parent_directory(self):
        with tempfile.TemporaryDirectory() as parent:
            target=Path(parent)/"record.json"
            observed=[]
            real_fsync=os.fsync
            def sync(fd):
                import stat
                observed.append("directory" if stat.S_ISDIR(os.fstat(fd).st_mode) else "file")
                real_fsync(fd)
            with patch.object(life.os,"fsync",side_effect=sync):
                life._write_once(target,{"value":1})
            self.assertEqual(observed,["file","directory"])

    def test_directory_sync_failure_is_not_reported_as_success(self):
        with tempfile.TemporaryDirectory() as parent:
            target=Path(parent)/"record.json"
            with patch.object(life,"_sync_directory",side_effect=OSError("directory sync failed")):
                with self.assertRaisesRegex(OSError,"directory sync failed"):
                    life._write_once(target,{"value":1})
            self.assertTrue(target.exists())  # Preserve uncertain record; never overwrite/retry it.
            with self.assertRaises(FileExistsError):life._write_once(target,{"value":2})

    def test_capture_syncs_log_before_its_receipt(self):
        with tempfile.TemporaryDirectory() as parent:
            root=life.prepare(Path(parent)/"run",source_sha256=PIN,packet_sha256=PIN,image_sha256=PIN,command_sha256=PIN)
            (root/"scratch/log").write_bytes(b"evidence")
            observed=[]
            original=life._sync_directory
            def sync(path):
                observed.append(((root/"diagnostics/tool_result.log").exists(),(root/"diagnostics/tool_result.json").exists()))
                original(path)
            with patch.object(life,"_sync_directory",side_effect=sync):life.capture(root,"tool_result","log")
            self.assertEqual(observed,[(True,False),(True,True)])

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

    def test_terminal_rejects_invalid_completeness_without_creating_terminal(self):
        changes = [("retainedBytes", True), ("retainedBytes", 8.0),
                   ("sourceBytes", False), ("sourceBytes", -1), ("sourceBytes", "8"),
                   ("sourceBytes", 0), ("sourceBytes", 9),
                   ("truncated", "false"), ("truncated", True),
                   ("retainedSHA256", True), ("unexpected", "field")]
        for key, value in changes + [("missing-truncated", None)]:
            with self.subTest(key=key, value=value), tempfile.TemporaryDirectory() as parent:
                root = life.prepare(Path(parent)/"run", source_sha256=PIN,
                    packet_sha256=PIN, image_sha256=PIN, command_sha256=PIN)
                (root/"scratch/log").write_bytes(b"evidence")
                life.capture(root, "census", "log")
                receipt = root/"diagnostics/census.json"
                record = json.loads(receipt.read_text())
                if key == "missing-truncated":
                    record.pop("truncated")
                else:
                    record[key] = value
                receipt.write_text(json.dumps(record))
                with self.assertRaisesRegex(RuntimeError, "completeness metadata invalid"):
                    life.finish(root, test_exit_code=1, cleanup_verified=False, diagnostics=["census"])
                self.assertFalse((root/"terminal.json").exists())
                self.assertEqual((root/"diagnostics/census.log").read_bytes(), b"evidence")

    def test_terminal_accepts_empty_and_valid_truncated_diagnostics_without_native_readiness(self):
        for content in (b"", b"0123456789abcdef"):
            with self.subTest(size=len(content)), tempfile.TemporaryDirectory() as parent, \
                 patch.object(life, "CAP_BYTES", 8):
                root = life.prepare(Path(parent)/"run", source_sha256=PIN,
                    packet_sha256=PIN, image_sha256=PIN, command_sha256=PIN)
                (root/"scratch/log").write_bytes(content)
                life.capture(root, "census", "log")
                result = life.finish(root, test_exit_code=0, cleanup_verified=False, diagnostics=["census"])
                record = json.loads((root/"diagnostics/census.json").read_text())
                self.assertEqual(record["sourceBytes"], len(content))
                self.assertEqual(record["retainedBytes"], min(len(content), 8))
                self.assertEqual(record["truncated"], len(content) > 8)
                self.assertFalse(result["nativeReady"])
                self.assertTrue(result["requiresNewAdmission"])

    def test_capture_and_finish_reject_malformed_manifest_without_new_evidence(self):
        changes = [(key, value) for key in ("sourceSHA256", "packetSHA256", "imageSHA256", "commandSHA256")
                   for value in ("", True, "A" * 64, "f" * 63)]
        changes += [("automaticRetries", False), ("automaticRetries", 1), ("automaticRetries", "0"),
                    ("maxDiagnosticBytes", False), ("maxDiagnosticBytes", float(life.CAP_BYTES)),
                    ("maxDiagnosticBytes", life.CAP_BYTES - 1), ("schema", "unknown"),
                    ("unexpected", "field"), ("missing-source", None), ("not-object", None)]
        for key, value in changes:
            with self.subTest(key=key, value=value), tempfile.TemporaryDirectory() as parent:
                root = life.prepare(Path(parent)/"run", source_sha256=PIN,
                    packet_sha256=PIN, image_sha256=PIN, command_sha256=PIN)
                (root/"scratch/log").write_bytes(b"evidence")
                life.capture(root, "census", "log")
                retained = (root/"diagnostics/census.json").read_bytes()
                path = root/"manifest.json"
                record = json.loads(path.read_text())
                if key == "missing-source":
                    record.pop("sourceSHA256")
                elif key == "not-object":
                    record = []
                else:
                    record[key] = value
                path.write_text(json.dumps(record))
                with self.assertRaisesRegex(RuntimeError, "run manifest contract changed"):
                    life.capture(root, "tool_result", "log")
                with self.assertRaisesRegex(RuntimeError, "run manifest contract changed"):
                    life.finish(root, test_exit_code=0, cleanup_verified=False, diagnostics=["census"])
                self.assertFalse((root/"terminal.json").exists())
                self.assertFalse((root/"diagnostics/tool_result.log").exists())
                self.assertEqual((root/"diagnostics/census.log").read_bytes(), b"evidence")
                self.assertEqual((root/"diagnostics/census.json").read_bytes(), retained)

    def test_manifest_rejects_duplicate_fields_and_nonfinite_json_before_capture(self):
        for fault in ("duplicate", "NaN", "Infinity", "-Infinity"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as parent:
                root = life.prepare(Path(parent)/"run", source_sha256=PIN,
                    packet_sha256=PIN, image_sha256=PIN, command_sha256=PIN)
                (root/"scratch/log").write_bytes(b"evidence")
                path = root/"manifest.json"
                raw = path.read_text().strip()
                if fault == "duplicate":
                    raw = raw[:-1] + ',"automaticRetries":0}'
                else:
                    raw = raw.replace('"maxDiagnosticBytes":' + str(life.CAP_BYTES), '"maxDiagnosticBytes":' + fault)
                path.write_text(raw)
                with self.assertRaisesRegex(RuntimeError, "duplicate JSON field|nonfinite JSON value"):
                    life.capture(root, "census", "log")
                self.assertEqual(list((root/"diagnostics").iterdir()), [])

    def test_diagnostic_json_uses_the_same_unambiguous_record_reader(self):
        for fault in ("duplicate", "NaN"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as parent:
                root = life.prepare(Path(parent)/"run", source_sha256=PIN,
                    packet_sha256=PIN, image_sha256=PIN, command_sha256=PIN)
                (root/"scratch/log").write_bytes(b"evidence")
                life.capture(root, "census", "log")
                path = root/"diagnostics/census.json"
                raw = path.read_text().strip()
                raw = raw[:-1] + ',"name":"census"}' if fault == "duplicate" else raw.replace('"sourceBytes":8', '"sourceBytes":NaN')
                path.write_text(raw)
                with self.assertRaisesRegex(RuntimeError, "duplicate JSON field|nonfinite JSON value"):
                    life.finish(root, test_exit_code=0, cleanup_verified=False, diagnostics=["census"])
                self.assertFalse((root/"terminal.json").exists())
                self.assertEqual((root/"diagnostics/census.log").read_bytes(), b"evidence")

    def test_valid_manifest_preserves_all_distinct_binding_digests(self):
        with tempfile.TemporaryDirectory() as parent:
            root = life.prepare(Path(parent)/"run", source_sha256="a" * 64,
                packet_sha256="b" * 64, image_sha256="c" * 64, command_sha256="d" * 64)
            manifest = (root/"manifest.json").read_bytes()
            (root/"scratch/log").write_bytes(b"evidence")
            life.capture(root, "census", "log")
            result = life.finish(root, test_exit_code=0, cleanup_verified=False, diagnostics=["census"])
            self.assertEqual((root/"manifest.json").read_bytes(), manifest)
            self.assertFalse(result["nativeReady"])
            self.assertTrue(result["requiresNewAdmission"])

if __name__ == "__main__": unittest.main()
